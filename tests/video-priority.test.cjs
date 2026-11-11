const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
test('current video bypasses background work and the old three-video rejection', {timeout:20000}, async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'immersed-priority-')), bin=path.join(dir,'bin'), log=path.join(dir,'calls'); fs.mkdirSync(bin);
 const script=(name,body)=>{const file=path.join(bin,name);fs.writeFileSync(file,'#!/usr/bin/env node\n'+body);fs.chmodSync(file,0o755);return file};
 script('yt-dlp',`const fs=require('fs'),a=process.argv.slice(2),out=a[a.indexOf('-o')+1],id=a.at(-1).split('=').at(-1);if(a.includes('--skip-download'))fs.writeFileSync(out.replace('%(ext)s','info.json'),'{}');else fs.writeFileSync(out.replace('%(ext)s','webm'),id);`);
 script('ffprobe',`const fs=require('fs');fs.appendFileSync(process.env.PRIORITY_LOG,JSON.stringify({type:'probe',video:fs.readFileSync(process.argv.at(-1),'utf8')})+'\\n');console.log('180');`);
 const python=script('python',`const fs=require('fs'),rl=require('readline').createInterface({input:process.stdin});rl.on('line',line=>{const d=JSON.parse(line),video=fs.readFileSync(d.audio,'utf8');fs.appendFileSync(process.env.PRIORITY_LOG,JSON.stringify({type:'speech',video,start:d.start,duration:d.duration})+'\\n');setTimeout(()=>console.log(JSON.stringify({id:d.id,status:'ready',cues:[{start:d.start,end:d.start+d.duration,text:video}]})),250);});`);
 const child=spawn(process.execPath,['-e',`const s=require('./desktop/server.cjs').server;s.listen(0,'127.0.0.1',()=>console.log('PORT:'+s.address().port));`],{cwd:path.join(__dirname,'..'),env:{...process.env,PATH:bin+path.delimiter+process.env.PATH,IMMERSED_DATA_ROOT:dir,IMMERSED_PYTHON:python,PRIORITY_LOG:log},stdio:['ignore','pipe','pipe']});
 let output='',errors='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>errors+=x);
 t.after(async()=>{child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));fs.rmSync(dir,{recursive:true,force:true});});
 async function until(fn){for(let i=0;i<200;i++){const v=fn();if(v)return v;await delay(20);}throw Error('Timed out '+errors);}
 const port=await until(()=>/PORT:(\d+)/.exec(output)?.[1]),base='http://127.0.0.1:'+port;
 const events=()=>fs.existsSync(log)?fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
 const calls=()=>events().filter(e=>e.type==='speech');
 const post=(id,at)=>fetch(base+'/api/desktop/transcribe?videoId='+id+'&at='+at,{method:'POST',headers:{'X-Immersed-Request':'1'}});
 assert.equal((await post('aaaaaaaaaaa',80)).status,200);
 await until(()=>calls().length);
 assert.equal(calls()[0].start,78);
 assert.equal((await post('bbbbbbbbbbb',100)).status,200);
 await until(()=>calls().some(c=>c.video==='bbbbbbbbbbb'));
 const history=events(), probe=history.findIndex(e=>e.type==='probe'&&e.video==='bbbbbbbbbbb');
 const order=history.slice(probe+1).filter(e=>e.type==='speech');assert.ok(order.findIndex(c=>c.video==='bbbbbbbbbbb')<=1);
 for(const id of ['ccccccccccc','ddddddddddd','eeeeeeeeeee']) assert.equal((await post(id,50)).status,200);
 await until(()=>calls().some(c=>c.video==='eeeeeeeeeee'));
 await until(()=>fs.readdirSync(path.join(dir,'.data/mac-transcripts-v2')).some(f=>f.includes('aaaa')&&f.endsWith('.partial.json')));
});
