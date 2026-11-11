const {test}=require('node:test'),assert=require('node:assert/strict');
const reading=require('../desktop/reading-cues.js');
test('only confirmed joins preserve the complete glyph sequence and outer audio bounds',()=>{
 const a={start:286.405,end:293.785,text:'例えば書籍であれば内容を通じて著者と読'},b={start:293.785,end:296.525,text:'者と間の会話になるんですよね'};
 assert.equal(reading.candidate(a,b),true);
 assert.deepEqual(reading.apply([a,b],new Map()),[a,b]);
 assert.deepEqual(reading.apply([a,b],new Map([[reading.key(a,b),true]])),[{...a,end:b.end,text:a.text+b.text,readingParts:2}]);
 assert.equal(reading.candidate({...a,hardEnd:true},b),false);
 assert.equal(reading.candidate(a,{...b,start:b.start+1}),false);
});
test('confirmed three-way words apply without splitting on later refreshes',()=>{
 const a={start:0,end:1,text:'コミュ'},b={start:1,end:2,text:'ニ'},c={start:2,end:3,text:'ケーション'};
 const merged={...a,end:b.end,text:a.text+b.text,readingParts:2};
 const joins=new Map([[reading.groupKey([a,b]),true],[reading.groupKey([merged,c]),true]]);
 assert.equal(reading.apply([a,b,c],joins)[0].text,'コミュニケーション');
 assert.equal(reading.apply([a,b,c],joins)[0].readingParts,3);
});
