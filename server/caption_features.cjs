/* Morphological guards for candidate re-ranking; no dictionary rewrites. */
const fs = require('node:fs');
const path = require('node:path');
const kuromoji = require('kuromoji');
const { model, tokenize } = require('./statistical-context.cjs');
const input = fs.readFileSync(0, 'utf8');
if (input.length > 32000) process.exit(1);
const texts = JSON.parse(input);
if (!Array.isArray(texts) || texts.length > 8 || texts.some(t => typeof t !== 'string' || t.length > 500)) process.exit(1);
kuromoji.builder({ dicPath: path.join(path.dirname(require.resolve('kuromoji/package.json')), 'dict') }).build((error, tokenizer) => {
  if (error) process.exit(1);
  const variants = texts.filter(Boolean);
  let prefix = 0, suffix = 0;
  const shortest = variants.length ? Math.min(...variants.map(t => t.length)) : 0;
  while (prefix < shortest && variants.every(t => t[prefix] === variants[0][prefix])) prefix++;
  while (suffix < shortest - prefix && variants.every(t => t[t.length - 1 - suffix] === variants[0][variants[0].length - 1 - suffix])) suffix++;
  const scorer = model();
  const result = texts.map(text => {
    const tokens = tokenizer.tokenize(text);
    return {
      statistics: scorer.score(tokenize(tokenizer, text), prefix, text.length - suffix),
      reading: tokens.map(t => t.reading && t.reading !== '*' ? t.reading : t.surface_form).join(''),
      protected: tokens.filter(t => t.pos_detail_1 === '固有名詞' || (t.word_type === 'UNKNOWN' && t.pos !== '記号')).map(t => t.surface_form),
      numbers: tokens.filter(t => t.pos_detail_1 === '数').map(t => t.surface_form),
      grammar: tokens.filter(t => t.pos === '助動詞').map(t => t.basic_form),
      negatives: tokens.filter(t => ['ない', 'ぬ', '無い'].includes(t.basic_form)).length,
    };
  });
  process.stdout.write(JSON.stringify(result));
});
