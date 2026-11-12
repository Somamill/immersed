const {test}=require('node:test'),assert=require('node:assert/strict');
const {record,progress}=require('../desktop/word-history.js');
test('recent lookups deduplicate hover jitter, retain first seen and stay bounded',()=>{
 let items=record([],{key:'a',word:'政治'},1000);
 items=record(items,{key:'a',word:'政治'},1100);
 assert.equal(items.length,1);assert.equal(items[0].lookups,1);
 items=record(items,{key:'a',word:'政治'},50000);
 assert.equal(items[0].lookups,2);assert.equal(items[0].firstSeen,1000);
 for(let i=0;i<120;i++)items=record(items,{key:String(i),word:String(i)},60000+i);
 assert.equal(items.length,100);assert.equal(items[0].key,'119');
});
test('progress counts only saved words explicitly marked known',()=>{
 assert.deepEqual(progress([{word:'政治'},{word:'猫'}],{'政治':true,'猫':false,'犬':true}),{saved:2,known:1,learning:1});
});
test('progress follows the selected lemma when a dictionary supplies another written form',()=>{
 assert.deepEqual(progress([{word:'気を廻す',lemma:'気を回す'},{word:'猫'}],{'気を回す':true}),{saved:2,known:1,learning:1});
});
test('dictionary-only reopening preserves the last source context',()=>{
 const first=record([],{key:'a',word:'政治',url:'https://youtube.com/watch?v=aaaaaaaaaaa',time:40,sentence:'政治です',title:'話'},1000);
 const next=record(first,{key:'a',word:'政治',url:'',time:0,sentence:'',title:''},40000);
 assert.equal(next[0].time,40);assert.equal(next[0].sentence,'政治です');
});
