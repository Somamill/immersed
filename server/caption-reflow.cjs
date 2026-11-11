const { analyze, lookup } = require('./language.cjs');
// A verified lexical token must cross every internal boundary of a merged group.
async function reflowCaptions(cues, { maxDuration = 6, maxCharacters = 48 } = {}) {
  const result = [];
  for (let i=0;i<cues.length;i++) {
    result.push({cue:{...cues[i]},parts:Math.max(1,Math.min(4,cues[i].readingParts||1))});
    for(let count=2;count<=Math.min(4,result.length);count++) {
      const group=result.slice(-count), entries=group.map(x=>x.cue), first=entries[0], last=entries.at(-1);
      const parts=group.reduce((sum,x)=>sum+x.parts,0), text=entries.map(c=>c.text).join('');
      if(parts>4 || last.end-first.start>maxDuration || text.length>maxCharacters || entries.some(c=>c.sentenceStart!==undefined)) continue;
      if(entries.some((c,n)=>n && (entries[n-1].hardEnd || c.start<entries[n-1].end-.02 || c.start-entries[n-1].end>.12 || !/[ぁ-ヿ㐀-鿿々]$/.test(entries[n-1].text) || !/^[ぁ-ヿ㐀-鿿々]/.test(c.text)))) continue;
      const tokens=await analyze(text,true), firstBoundary=first.text.length, lastBoundary=text.length-last.text.length;
      const crossing=tokens.find(t=>t.word && t.start<firstBoundary && t.end>lastBoundary);
      if(!crossing || !(await lookup(crossing.lemma,crossing)).length) continue;
      const cue={start:first.start,end:last.end,text,...(entries.some(c=>c.uncertain)?{uncertain:true}:{}),...(last.hardEnd?{hardEnd:true}:{})};
      result.splice(-count,count,{cue,parts}); break;
    }
    if(i%8===7) await new Promise(resolve=>setImmediate(resolve));
  }
  return result.map(x=>x.cue);
}
function validBatch(cues) {
  return Array.isArray(cues) && cues.length > 0 && cues.length <= 48 && cues.every((c, i) => c && typeof c.text === 'string' && c.text.length > 0 && c.text.length <= 2000 && Number.isFinite(c.start) && Number.isFinite(c.end) && c.start >= 0 && c.end > c.start && (!i || c.start >= cues[i - 1].end - 0.02));
}
module.exports={reflowCaptions,validBatch};
