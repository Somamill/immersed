"""Compare the three engines against a local, verified-reference manifest.
Input JSON: [{"audio": "/path.wav", "reference": "..."}].
Audio is not uploaded; models may download public weights on first use.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
from asr_compare import ENGINE_ORDER, compare, normalize, edits

parser = argparse.ArgumentParser()
parser.add_argument('manifest')
parser.add_argument('--output', required=True)
args = parser.parse_args()
rows = json.loads(Path(args.manifest).read_text())
report = {'clips': [], 'metrics': {}, 'audioSeconds': 0}
totals = {k: [0, 0, 0] for k in [*ENGINE_ORDER, 'ensemble']}
for i, row in enumerate(rows):
    report['audioSeconds'] += float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', row['audio']], text=True))
    candidates = []
    for engine in ENGINE_ORDER:
        result = subprocess.run([sys.executable, str(Path(__file__).resolve().parents[1] / 'server/asr_model.py'), engine, row['audio']],
                                capture_output=True, text=True, timeout=240)
        try:
            data = json.loads(result.stdout)
            candidates.append({'model': engine, 'text': ''.join(t['token'] for t in data['tokens']), 'seconds': data['seconds']})
        except Exception:
            raise RuntimeError(f"{engine} failed: {result.stderr[-600:]}")
    selected = compare(candidates)
    reference = normalize(row['reference'])
    for c in candidates:
        totals[c['model']][0] += edits(reference, normalize(c['text']))
        totals[c['model']][1] += len(reference)
        totals[c['model']][2] += c['seconds']
    picked = next(c for c in candidates if c['model'] == selected['selected'])
    totals['ensemble'][0] += edits(reference, normalize(picked['text']))
    totals['ensemble'][1] += len(reference)
    totals['ensemble'][2] += sum(c['seconds'] for c in candidates)
    report['clips'].append({'index': i, 'reference': row['reference'], **selected})
    report['metrics'] = {k: {'edits': v[0], 'characters': v[1], 'cer': round(v[0] / max(1, v[1]), 4), 'seconds': round(v[2], 2)} for k, v in totals.items()}
    Path(args.output).write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps({'clip': i, 'selection': selected['selected'], 'agreement': selected['agreement'], 'metrics': report['metrics']}, ensure_ascii=False), flush=True)
