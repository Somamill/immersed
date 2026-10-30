"""Fast first track, then incremental cross-checks. No audio-access workarounds."""
import json
import subprocess
import sys
import tempfile
from pathlib import Path
from asr_compare import ENGINE_ORDER, compare
from asr_reazon import group_subwords

PIPELINE = 'ensemble-v1'

def recognize(media, publish=lambda data: None, preferred='reazon'):
    duration = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                                             '-of', 'default=noprint_wrappers=1:nokey=1', str(media)], text=True))
    root = Path(__file__).parent
    slots = []
    with tempfile.TemporaryDirectory(prefix='immersed-ensemble-') as folder:
        for start in range(0, int(duration + .999), 12):
            end = min(duration, start + 12)
            left, right = max(0, start - .75), min(duration, end + .75)
            chunk = Path(folder) / f'{start}.wav'
            subprocess.run(['ffmpeg', '-v', 'error', '-ss', str(left), '-t', str(right - left), '-i', str(media),
                            '-ac', '1', '-ar', '16000', '-y', str(chunk)], check=True, capture_output=True)
            slots.append({'start': start, 'end': end, 'left': left, 'chunk': chunk, 'candidates': []})
        snapshot = {'cues': [], 'comparisons': [], 'pipeline': PIPELINE, 'duration': duration}
        for engine in ENGINE_ORDER:
            for slot in slots:
                start, end, left = slot['start'], slot['end'], slot['left']
                try:
                    run = subprocess.run([sys.executable, str(root / 'asr_model.py'), engine, str(slot['chunk'])],
                                         capture_output=True, text=True, timeout=180, check=True)
                    data = json.loads(run.stdout)
                    tokens = [{'seconds': max(start, min(end - .01, left + t['seconds'])), 'token': t['token']}
                              for t in data['tokens'] if (start == 0 or left + t['seconds'] >= start) and
                              (end == duration or left + t['seconds'] < end)]
                    slot['candidates'].append({'model': engine, 'text': ''.join(t['token'] for t in tokens),
                                               'tokens': tokens, 'seconds': data['seconds']})
                except Exception as error:
                    slot['candidates'].append({'model': engine, 'text': '', 'error': type(error).__name__})
                cues, comparisons = [], []
                for item in slots:
                    if not item['candidates']:
                        continue
                    result = compare(item['candidates'], preferred)
                    chosen = next((c for c in item['candidates'] if c['model'] == result['selected']), None)
                    if chosen:
                        cues.extend(group_subwords(chosen['tokens'], item['end']))
                    comparisons.append({**result, 'start': item['start'], 'end': item['end'],
                                        'candidates': [{k: v for k, v in c.items() if k != 'tokens'} for c in item['candidates']]})
                snapshot = {'cues': cues, 'comparisons': comparisons,
                            'processedSeconds': max((s['end'] for s in slots if s['candidates']), default=0),
                            'duration': duration, 'pipeline': PIPELINE}
                publish(snapshot)
        return snapshot
