/* Focus-first, resumable speech sections. One shared GPU worker executes slices. */
function coverage(spans, duration) {
  const sorted = spans.filter(s => Array.isArray(s) && Number.isFinite(s[0]) && Number.isFinite(s[1]))
    .map(([a,b])=>[Math.max(0,a),Math.min(duration,b)]).filter(([a,b])=>b>a).sort((a,b)=>a[0]-b[0]);
  const merged=[];
  for(const span of sorted) {
    const last=merged.at(-1);
    if(last && span[0]<=last[1]+.001) last[1]=Math.max(last[1],span[1]); else merged.push(span);
  }
  return merged;
}
function nextSection(duration, at, spans) {
  const covered=coverage(spans,duration), gaps=[]; let cursor=0;
  for(const [a,b] of covered) { if(a>cursor+.001) gaps.push([cursor,a]); cursor=Math.max(cursor,b); }
  if(cursor<duration-.001) gaps.push([cursor,duration]);
  if(!gaps.length) return null;
  at=Math.max(0,Math.min(duration-.001,Number(at)||0));
  const containing=gaps.find(([a,b])=>a<=at && at<b);
  if(containing) {
    const left=Math.max(containing[0],Math.min(at-2,containing[1]-Math.min(12,containing[1]-containing[0])));
    return [left,Math.min(containing[1],left+12)];
  }
  const gap=gaps.sort((a,b)=>Math.min(Math.abs(a[0]-at),Math.abs(a[1]-at))-Math.min(Math.abs(b[0]-at),Math.abs(b[1]-at)))[0];
  // Prepare forward from the current position, then fill earlier sections.
  return gap[0]>=at ? [gap[0],Math.min(gap[1],gap[0]+26)] : [Math.max(gap[0],gap[1]-26),gap[1]];
}
function measured(spans,duration) { return coverage(spans,duration).reduce((n,[a,b])=>n+b-a,0); }
async function prepare({duration,position,slice,checkpoint,initial={}}) {
  let covered=coverage(initial.covered || [],duration), cues=Array.isArray(initial.cues)?initial.cues:[];
  let range;
  while((range=nextSection(duration,position(),covered))) {
    const [start,end]=range;
    const next=await slice(start,end-start,{cues,processedSeconds:measured(covered,duration),duration});
    covered=coverage([...covered,range],duration);
    const unique=new Map(cues.concat(next).map(c=>[[c.start,c.end,c.text].join(':'),c]));
    cues=[...unique.values()].sort((a,b)=>a.start-b.start);
    await checkpoint({cues,covered,processedSeconds:measured(covered,duration),duration});
  }
  return cues;
}
module.exports={coverage,nextSection,measured,prepare};
