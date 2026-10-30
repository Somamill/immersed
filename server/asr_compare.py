"""Conservative whole-phrase consensus; agreement is not accuracy."""
import re
import unicodedata

ENGINE_ORDER = ['reazon', 'whisper-small', 'kotoba']

def normalize(text):
    return ''.join(c for c in unicodedata.normalize('NFKC', text) if not c.isspace() and not unicodedata.category(c).startswith(('P', 'S')))

def edits(a, b):
    row = list(range(len(b) + 1))
    for i, ac in enumerate(a, 1):
        nxt = [i]
        for j, bc in enumerate(b, 1):
            nxt.append(min(nxt[-1] + 1, row[j] + 1, row[j - 1] + (ac != bc)))
        row = nxt
    return row[-1]

def compare(candidates, preferred='reazon'):
    usable = [c for c in candidates if normalize(c.get('text', ''))]
    if not usable:
        return {'selected': None, 'reason': 'no-speech', 'agreement': None, 'candidates': candidates}
    groups = {}
    for c in usable:
        groups.setdefault(normalize(c['text']), []).append(c)
    majority = max(groups.values(), key=len)
    consensus = len(majority) >= 2 and len(majority) > len(usable) / 2
    pool = majority if consensus else usable
    selected = next((c for c in pool if c['model'] == preferred), pool[0])
    pairs = [(normalize(a['text']), normalize(b['text'])) for i, a in enumerate(usable) for b in usable[i + 1:]]
    agreement = round(sum(max(0, 1 - edits(a, b) / max(len(a), len(b), 1)) for a, b in pairs) / len(pairs), 3) if pairs else None
    return {'selected': selected['model'], 'reason': 'majority-agreement' if consensus else 'preferred-unverified',
            'agreement': agreement, 'candidates': candidates}
