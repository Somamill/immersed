"""Re-rank frozen ASR outputs. References are used only after scoring."""
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
from caption_context import ContextScorer
from asr_compare import compare, normalize, edits

source = json.loads(Path(sys.argv[1]).read_text())
scorer = ContextScorer()
total = original = revised = changes = 0
results = []
for i, clip in enumerate(source['clips']):
    candidates = clip['candidates']
    left = clip.get('leftContext', '')
    right = clip.get('rightContext', '')
    before = compare(candidates)
    after = scorer.apply(before, left, right)
    reference = normalize(clip['reference'])
    first = next(c['text'] for c in candidates if c['model'] == before['selected'])
    last = next(c['text'] for c in candidates if c['model'] == after['selected'])
    total += len(reference)
    original += edits(reference, normalize(first))
    revised += edits(reference, normalize(last))
    changes += after['selected'] != before['selected']
    results.append(after)
    print(json.dumps({'clip': i, 'changed': after['selected'] != before['selected'], 'context': after.get('context')}, ensure_ascii=False), flush=True)
report = {'characters': total, 'originalEdits': original, 'contextEdits': revised, 'changes': changes, 'results': results}
Path(sys.argv[2]).write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(json.dumps({k:v for k,v in report.items() if k != 'results'}))
