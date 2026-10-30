/* Synthetic homophone corruptions of held-out corpus text, not a speech benchmark. */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { initialize, homophones } = require('../server/language.cjs');
const { rankSpellings } = require('../server/statistical-context.cjs');
const source = require('../src/data/context-source.json');
async function main() {
  const lines = execFileSync('bzip2', ['-dc', path.join(__dirname, '../.data', source.asset)], { maxBuffer: 100 * 1024 * 1024 }).toString().split('\n');
  const seen = new Set(), heldOut = [], training = new Set();
  for (const line of lines) {
    const [id, language, raw] = line.split('\t'), text = raw?.normalize('NFKC').trim();
    if (language !== 'jpn' || !text || text.length < 6 || text.length > 180 || seen.has(text)) continue;
    seen.add(text);
    if (Number(id) % 20 === 0) heldOut.push(text); else training.add(text);
  }
  const { tokenizer } = await initialize();
  const report = { corpus: source.snapshot, kind: 'synthetic held-out homophone text, not audio', cases: 0, uniqueWords: 0, suggested: 0, correct: 0, incorrect: 0, unchanged: 0, cleanInputsChanged: 0, examples: [] };
  const words = new Set();
  for (const sentence of heldOut) {
    if (training.has(sentence)) continue;
    for (const token of tokenizer.tokenize(sentence)) {
      if (token.pos !== '名詞' || token.pos_detail_1 === '固有名詞' || !/^[㐀-鿿々]{2,}$/.test(token.surface_form)) continue;
      const original = token.surface_form, reading = token.reading;
      const alternatives = await homophones(original, reading);
      if (!alternatives.length) continue;
      const corruption = alternatives[0].form, candidates = await homophones(corruption, reading);
      if (!candidates.some(c => c.form === original)) continue;
      const start = token.word_position - 1;
      const input = sentence.slice(0, start) + corruption + sentence.slice(start + original.length);
      const result = rankSpellings({ sentence: input, start, end: start + corruption.length }, candidates, tokenizer);
      const chosen = result.alternatives[0]?.form;
      const clean = rankSpellings({ sentence, start, end: start + original.length }, alternatives, tokenizer);
      report.cases++; words.add(original);
      if (chosen) { report.suggested++; if (chosen === original) report.correct++; else report.incorrect++; }
      else report.unchanged++;
      if (clean.alternatives.length) report.cleanInputsChanged++;
      if (report.examples.length < 8 && chosen) report.examples.push({ expected: original, corrupted: corruption, suggested: chosen, gain: result.alternatives[0].gain });
      break;
    }
    if (report.cases >= 500) break;
  }
  report.uniqueWords = words.size;
  fs.writeFileSync(process.argv[2] || path.join(__dirname, '../.data/context-evaluation.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
main().catch(e => { console.error(e); process.exitCode = 1; });
