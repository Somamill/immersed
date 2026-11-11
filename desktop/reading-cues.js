/* Dictionary-confirmed lexical joins, independent of any particular word. */
(function(root){
  function groupKey(group){return JSON.stringify(group.map(c=>[c.start,c.end,c.text]));}
  function key(a,b){return groupKey([a,b]);}
  function candidateGroup(group){
    if(group.length<2||group.length>4||group.some(c=>!c||c.sentenceStart!==undefined||c.screenVerified))return false;
    if(group.reduce((n,c)=>n+(c.readingParts||1),0)>4||group.at(-1).end-group[0].start>12||group.map(c=>c.text).join('').length>80)return false;
    return group.every((b,i)=>!i||(!group[i-1].hardEnd&&b.start>=group[i-1].end-.02&&b.start-group[i-1].end<=.12&&/[ぁ-ヿ㐀-鿿々]$/.test(group[i-1].text)&&/^[ぁ-ヿ㐀-鿿々]/.test(b.text)));
  }
  function candidate(a,b){return candidateGroup([a,b]);}
  function pass(cues,joins){
    const result=[];
    for(let i=0;i<cues.length;i++){
      let count=1;
      for(let n=Math.min(4,cues.length-i);n>=2;n--){const group=cues.slice(i,i+n);if(candidateGroup(group)&&joins.get(groupKey(group))===true){count=n;break;}}
      if(count===1){result.push(cues[i]);continue;}
      const group=cues.slice(i,i+count),a=group[0],b=group.at(-1);
      result.push({...a,end:b.end,text:group.map(c=>c.text).join(''),readingParts:group.reduce((n,c)=>n+(c.readingParts||1),0),...(group.some(c=>c.uncertain)?{uncertain:true}:{}),...(b.hardEnd?{hardEnd:true}:{})});i+=count-1;
    }
    return result;
  }
  function apply(cues,joins){let value=cues;for(let i=0;i<3;i++){const next=pass(value,joins);if(next.length===value.length)return next;value=next;}return value;}
  const api={key,groupKey,candidate,candidateGroup,apply};if(typeof module==='object')module.exports=api;else root.ImmersedReadingCues=api;
})(typeof globalThis!=='undefined'?globalThis:this);
