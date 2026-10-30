"""Rank dictionary homophones as suggestions; never edit source captions."""
import json
import sys
from caption_context import ContextScorer
from asr_compare import edits, normalize

def rank(data):
    scorer = ContextScorer()
    sentence, start, end = data['sentence'], data['start'], data['end']
    base = scorer.loss(sentence, data.get('before',''), data.get('after',''))
    results = []
    for item in data['alternatives']:
        replacement = sentence[:start] + item['form'] + sentence[end:]
        loss = scorer.loss(replacement, data.get('before',''), data.get('after',''))
        gain = (base - loss) * len(normalize(sentence)) / max(1, edits(normalize(sentence), normalize(replacement)))
        results.append({'form':item['form'], 'loss':loss,
                        'likely': loss < base - .03 and gain >= 1.5})
    return sorted(results, key=lambda r:r['loss'])

if __name__ == '__main__':
    print(json.dumps(rank(json.loads(sys.stdin.read()))), flush=True)
