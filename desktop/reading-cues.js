/* Join only dictionary-confirmed adjacent subtitle fragments; retain every glyph. */
(function(root){
  function key(a,b){return JSON.stringify([a.start,a.end,a.text,b.start,b.end,b.text]);}
  function candidate(a,b){return a&&b&&!a.hardEnd&&a.sentenceStart===undefined&&b.sentenceStart===undefined&&!a.screenVerified&&!b.screenVerified&&b.start>=a.end-.02&&b.start-a.end<=.12&&b.end-a.start<=12&&a.text.length+b.text.length<=80&&/[ぁ-ヿ㐀-鿿々]$/.test(a.text)&&/^[ぁ-ヿ㐀-鿿々]/.test(b.text);}
  function apply(cues,joins){const result=[];for(let i=0;i<cues.length;i++){const a=cues[i],b=cues[i+1];if(candidate(a,b)&&joins.get(key(a,b))===true){result.push({...a,end:b.end,text:a.text+b.text,...(a.uncertain||b.uncertain?{uncertain:true}:{}),...(b.hardEnd?{hardEnd:true}:{})});i++;}else result.push(a);}return result;}
  const api={key,candidate,apply};if(typeof module==='object')module.exports=api;else root.ImmersedReadingCues=api;
})(typeof globalThis!=='undefined'?globalThis:this);
