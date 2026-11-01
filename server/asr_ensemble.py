"""Fast first track, then incremental cross-checks. No audio-access workarounds."""
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from asr_compare import ENGINE_ORDER, compare
from asr_reazon import group_subwords
from caption_context import ContextScorer

PIPELINE = 'ensemble-acoustic-v4'

def recognize(media, publish=lambda data: None, preferred='reazon'):
    duration = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                                             '-of', 'default=noprint_wrappers=1:nokey=1', str(media)], text=True))
    root = Path(__file__).parent
    slots = []
    context_scorer = ContextScorer()
    with tempfile.TemporaryDirectory(prefix='immersed-ensemble-') as folder:
        for start in range(0, int(duration + .999), 12):
            end = min(duration, start + 12)
            left, right = max(0, start - .75), min(duration, end + .75)
            chunk = Path(folder) / f'{start}.wav'
            slots.append({'start': start, 'end': end, 'left': left, 'right': right, 'chunk': chunk, 'candidates': []})
        snapshot = {'cues': [], 'comparisons': [], 'pipeline': PIPELINE, 'duration': duration}
        for engine in ENGINE_ORDER:
            from model_session import ModelSession
            session = ModelSession(engine) if os.environ.get('IMMERSED_PERSISTENT_MODELS') == '1' else None
            try:
                for slot in slots:
                    start, end, left = slot['start'], slot['end'], slot['left']
                    try:
                        if not slot['chunk'].is_file():
                            subprocess.run(['ffmpeg', '-v', 'error', '-ss', str(left), '-t', str(slot['right'] - left), '-i', str(media),
                                            '-ac', '1', '-ar', '16000', '-y', str(slot['chunk'])], check=True, capture_output=True)
                        if session is not None:
                            data = session.recognize(slot['chunk'])
                        else:
                            run = subprocess.run([sys.executable, str(root / 'asr_model.py'), engine, str(slot['chunk'])],
                                                 capture_output=True, text=True, timeout=180, check=True)
                            data = json.loads(run.stdout)
                        tokens = []
                        for token in data['tokens']:
                            absolute = left + token['seconds']
                            finish = left + token.get('end', token['seconds'] + .45)
                            # Assign a complete word to a core using its midpoint,
                            # instead of cutting it because its start is in context.
                            owner = (absolute + finish) / 2 if engine == 'whisper-small' else absolute
                            if (start and owner < start) or (end != duration and owner >= end):
                                continue
                            tokens.append({'seconds': max(0, min(duration - .01, absolute)),
                                           'end': max(0, min(duration, finish)), 'token': token['token']})
                        slot['candidates'].append({'model': engine, 'text': ''.join(t['token'] for t in tokens),
                                                   'tokens': tokens, 'seconds': data['seconds']})
                    except Exception as error:
                        slot['candidates'].append({'model': engine, 'text': '', 'error': type(error).__name__})
                    selected_tokens, comparisons = [], []
                    for index, item in enumerate(slots):
                        if not item['candidates']:
                            continue
                        result = item.get('context_result') or compare(item['candidates'], preferred)
                        if len(item['candidates']) == len(ENGINE_ORDER) and 'context_result' not in item:
                            left_context = ''.join(t['token'] for t in selected_tokens)[-64:]
                            next_slot = slots[index + 1] if index + 1 < len(slots) else None
                            right_context = next_slot['candidates'][0].get('text', '') if next_slot and next_slot['candidates'] else ''
                            result = context_scorer.apply(result, left_context, right_context)
                            item['context_result'] = result
                        chosen = next((c for c in item['candidates'] if c['model'] == result['selected']), None)
                        if chosen:
                            selected_tokens.extend(chosen['tokens'])
                        comparisons.append({**result, 'start': item['start'], 'end': item['end'],
                                            'candidates': [{k: v for k, v in c.items() if k != 'tokens'} for c in item['candidates']]})
                    snapshot = {'cues': group_subwords(selected_tokens, duration), 'comparisons': comparisons,
                                'processedSeconds': max((s['end'] for s in slots if s['candidates']), default=0),
                                'duration': duration, 'pipeline': PIPELINE}
                    publish(snapshot)
            finally:
                if session is not None:
                    session.close()
        if os.environ.get('IMMERSED_FORCE_ALIGNMENT') == '1':
            from forced_alignment import AcousticAligner
            aligner = AcousticAligner()
            for index, slot in enumerate(slots):
                result = snapshot['comparisons'][index]
                selected = next((c for c in slot['candidates'] if c['model'] == result['selected']), None)
                if not selected or not selected.get('tokens'):
                    continue
                text = ''.join(t['token'] for t in selected['tokens'])
                try:
                    chunk_duration = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', str(slot['chunk'])], text=True))
                    words = aligner.align(slot['chunk'], text, chunk_duration)
                    selected['tokens'] = [{**w, 'seconds': w['seconds'] + slot['left'], 'end': min(duration, w['end'] + slot['left'])} for w in words]
                    result['alignment'] = {'status': 'aligned', 'method': 'Qwen3-ForcedAligner-0.6B'}
                except Exception as error:
                    result['alignment'] = {'status': 'estimated', 'reason': type(error).__name__}
                selected_tokens = [token for item, comparison in zip(slots, snapshot['comparisons'])
                                   for candidate in item['candidates'] if candidate['model'] == comparison['selected']
                                   for token in candidate.get('tokens', [])]
                snapshot['cues'] = group_subwords(selected_tokens, duration)
                publish(snapshot)
        return snapshot
