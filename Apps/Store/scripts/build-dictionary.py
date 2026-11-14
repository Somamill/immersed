"""Rebuild the offline JMdict data asset. No executable content is downloaded."""
import hashlib, json, os, sqlite3, tarfile, urllib.request
from pathlib import Path
root=Path(__file__).resolve().parents[1]
(root/'assets').mkdir(parents=True,exist_ok=True)
url='https://github.com/scriptin/jmdict-simplified/releases/download/3.6.2%2B20261026175559/jmdict-eng-3.6.2%2B20261026175559.json.tgz'
sha='809d104fe3c1e0ab328ff265bdc52b5eed1f9b669088fd199ef4e713812958a3'
source=os.environ.get('JMDICT_JSON')
if source:
    data=json.loads(Path(source).read_text())
else:
    archive=root/'assets/jmdict.tgz'
    if not archive.exists(): urllib.request.urlretrieve(url,archive)
    if hashlib.sha256(archive.read_bytes()).hexdigest()!=sha: raise RuntimeError('JMdict checksum mismatch')
    with tarfile.open(archive) as t: data=json.load(t.extractfile('jmdict-eng-3.6.2.json'))
out=root/'assets/dictionary.db';tmp=out.with_suffix('.tmp');tmp.unlink(missing_ok=True)
db=sqlite3.connect(tmp)
db.executescript('CREATE TABLE entries(id TEXT PRIMARY KEY, word TEXT, reading TEXT, definitions TEXT); CREATE TABLE forms(form TEXT, entry_id TEXT); CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT);')
for w in data['words']:
    kana=[x['text'] for x in w['kana']];kanji=[x['text'] for x in w['kanji']]
    gloss=list(dict.fromkeys(g['text'] for s in w['sense'] for g in s['gloss'] if g['lang']=='eng'))
    db.execute('INSERT INTO entries VALUES(?,?,?,?)',(str(w['id']),(kanji or kana)[0],' / '.join(kana),' / '.join(gloss)))
    db.executemany('INSERT INTO forms VALUES(?,?)',[(f,str(w['id'])) for f in set(kanji+kana)])
db.executescript('CREATE INDEX forms_lookup ON forms(form); CREATE INDEX entries_reading ON entries(reading);')
db.execute('INSERT INTO metadata VALUES(?,?)',('source',url));db.execute('INSERT INTO metadata VALUES(?,?)',('license','EDRDG JMdict, CC BY-SA 4.0; transformed to an offline lookup index.'))
db.commit();db.execute('VACUUM');db.close();tmp.replace(out)
print(f'Built offline JMdict asset: {len(data["words"])} entries, {out.stat().st_size//1024//1024} MiB')
