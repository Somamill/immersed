"""Language plausibility only: never generate or invent replacement text."""
import json
import math
import subprocess
from pathlib import Path
from asr_compare import normalize, edits

MODEL = 'rinna/japanese-gpt2-xsmall'
REVISION = '8e91527b3276e0565154935e84a08bf0137ed99f'

def guard(primary, alternative, first, second):
    a, b = normalize(primary), normalize(alternative)
    if len(a) < 6 or not .8 <= len(b) / max(1, len(a)) <= 1.2:
        return 'length-or-short-phrase'
    if edits(a, b) > max(1, min(3, int(len(a) * .15))):
        return 'too-different'
    for key in ('protected', 'numbers', 'negatives', 'grammar'):
        if first.get(key) != second.get(key):
            return key
    ar, br = normalize(first['reading']), normalize(second['reading'])
    if not ar or not br or edits(ar, br) > min(2, max(0, int(max(len(ar), len(br)) * .15))):
        return 'different-sounding'
    return None

def rerank(result, features, losses):
    """Fixed conservative policy, separate from model loading for audit/testing."""
    candidates = result['candidates']
    base = next((i for i, c in enumerate(candidates) if c['model'] == result['selected']), None)
    if base is None or not math.isfinite(losses[base]):
        return result
    checks = []
    best = base
    for i, candidate in enumerate(candidates):
        if i == base or not candidate.get('text') or not math.isfinite(losses[i]):
            continue
        blocked = guard(candidates[base]['text'], candidate['text'], features[base], features[i])
        changed = max(1, edits(normalize(candidates[base]['text']), normalize(candidate['text'])))
        gain = (losses[base] - losses[i]) * min(len(normalize(candidates[base]['text'])), len(normalize(candidate['text']))) / changed
        minimum_gain, minimum_average = (3.0, .06) if result['reason'] == 'majority-agreement' else (1.5, .03)
        eligible = not blocked and gain >= minimum_gain and losses[base] - losses[i] >= minimum_average
        checks.append({'model': candidate['model'], 'blocked': blocked, 'gainPerChangedCharacter': round(gain, 3)})
        if eligible and losses[i] < losses[best]:
            best = i
    return {**result, 'selected': candidates[best]['model'],
            'reason': 'context-alternative' if best != base else result['reason'],
            'context': {'status': 'scored', 'model': MODEL, 'revision': REVISION,
                        'lossPerCharacter': {c['model']: round(losses[i], 4) if math.isfinite(losses[i]) else None for i, c in enumerate(candidates)},
                        'checks': checks, 'changed': best != base,
                        'note': 'Language plausibility, not verification of speech.'}}

class ContextScorer:
    def __init__(self):
        self.model = None

    def load(self):
        if self.model is not None:
            return
        import torch
        from transformers import AutoTokenizer, AutoModelForCausalLM
        torch.set_num_threads(2)
        self.tokenizer = AutoTokenizer.from_pretrained(MODEL, revision=REVISION, use_fast=False, legacy=True)
        self.tokenizer.do_lower_case = True
        self.model = AutoModelForCausalLM.from_pretrained(MODEL, revision=REVISION, use_safetensors=True).eval()

    def loss(self, text, left='', right=''):
        import torch
        self.load()
        current = normalize(text)
        suffix = normalize(right)[:40]
        prefix = self.tokenizer.encode(normalize(left)[-64:], add_special_tokens=False)[-64:]
        content = self.tokenizer.encode(current + suffix, add_special_tokens=False)
        if not current or not content or len(prefix) + len(content) > 250:
            return float('inf')
        bos = self.tokenizer.bos_token_id
        if bos is None:
            bos = self.tokenizer.eos_token_id
        ids = torch.tensor([[bos] + prefix + content])
        with torch.inference_mode():
            logits = self.model(ids).logits[0, len(prefix):-1].float()
            labels = ids[0, len(prefix) + 1:]
            loss = torch.nn.functional.cross_entropy(logits, labels, reduction='sum').item()
        return loss / max(1, len(current + suffix))

    def apply(self, result, left='', right=''):
        if len({normalize(c.get('text', '')) for c in result['candidates'] if normalize(c.get('text', ''))}) < 2:
            return result
        try:
            texts = [c.get('text', '') for c in result['candidates']]
            run = subprocess.run(['node', str(Path(__file__).with_name('caption_features.cjs'))],
                                 input=json.dumps(texts), capture_output=True, text=True, timeout=15, check=True)
            features = json.loads(run.stdout)
            base = next(i for i, c in enumerate(result['candidates']) if c['model'] == result['selected'])
            checks = [{'model': c['model'], 'blocked': guard(texts[base], texts[i], features[base], features[i])}
                      for i, c in enumerate(result['candidates']) if normalize(texts[i]) != normalize(texts[base])]
            if not any(check['blocked'] is None for check in checks):
                return {**result, 'context': {'status': 'guarded', 'checks': checks, 'changed': False}}
            cache = {}
            losses = []
            for text in texts:
                key = normalize(text)
                if key not in cache:
                    cache[key] = self.loss(text, left, right)
                losses.append(cache[key])
            return rerank(result, features, losses)
        except Exception as error:
            return {**result, 'context': {'status': 'unavailable', 'reason': type(error).__name__}}
