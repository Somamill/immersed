const {test}=require('node:test'),assert=require('node:assert/strict');
const {nextSection,prepare,measured}=require('../desktop/focused-speech.cjs');
test('first section surrounds a distant playhead and every subsequent span is bounded',async()=>{
 const sections=[], checkpoints=[];let at=720;
 const cues=await prepare({duration:900,position:()=>at,slice:async(start,span)=>{
  sections.push([start,span]);if(sections.length===1)at=850;
  return [{start,end:start+span,text:String(start)}];
 },checkpoint:data=>checkpoints.push(data)});
 assert.deepEqual(sections[0],[718,12]);
 assert.deepEqual(sections[1],[848,12]);
 assert.ok(sections.every(([,span])=>span<=26));
 assert.equal(measured(checkpoints.at(-1).covered,900),900);
 assert.ok(cues.every((c,i)=>!i||c.start>=cues[i-1].end));
});
test('restart continues from checkpoint without retranscribing completed speech or counting gaps',async()=>{
 let calls=[];
 await prepare({duration:60,position:()=>30,initial:{covered:[[0,10],[28,40]],cues:[{start:0,end:10,text:'済'}]},
 slice:async(start,span)=>{calls.push([start,start+span]);return[]},checkpoint:()=>{}});
 assert.ok(calls.every(([a,b])=>!(a<10&&b>0)&&!(a<40&&b>28)));
 assert.equal(measured([[0,10],[28,40]],60),22);
 assert.equal(nextSection(20,0,[[0,20]]),null);
});
test('saved subtitle output is immediately available while source audio is preparing',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const {withCheckpoint}=require('../desktop/focused-speech.cjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'immersed-checkpoint-')),file=path.join(dir,'partial.json');
 try{
  fs.writeFileSync(file,JSON.stringify({duration:3600,processedSeconds:12,cues:[{start:235,end:240,text:'保存済み'}]}));
  const result=withCheckpoint(file,{status:'processing',stage:'Preparing video audio'});
  assert.equal(result.status,'processing');assert.equal(result.cues[0].start,235);
  assert.equal(result.processedSeconds,12);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
