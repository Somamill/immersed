import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const caption = `<?xml version="1.0"?><tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttp="http://www.w3.org/ns/ttml#parameter" xml:lang="ja" ttp:tickRate="10000000"><body><div><p begin="10000000t" end="30000000t">政治について<br/>話します。</p><p begin="30000000t" dur="2s"><span>国威発揚</span>という本。</p></div></body></tt>`;

test('Netflix caption formats preserve kanji and accurate original timing', async ({page}) => {
  await page.goto('/');
  const data = await page.evaluate(text => (window as any).ImmersedNetflix.parseCaptions(text), caption);
  expect(data).toEqual({language:'ja',cues:[{start:1,end:3,text:'政治について 話します。'},{start:3,end:5,text:'国威発揚という本。'}]});
  const vtt = await page.evaluate(() => (window as any).ImmersedNetflix.parseCaptions('WEBVTT\n\n1\n00:01.250 --> 00:03.500 align:center\n<v Narrator>日本語 &amp; 漢字</v>\n\n2\n00:04.000 --> 00:05.000\n次の行'));
  expect(vtt.cues).toEqual([{start:1.25,end:3.5,text:'日本語 & 漢字'},{start:4,end:5,text:'次の行'}]);
  expect(await page.evaluate(()=>(window as any).ImmersedNetflix.parseCaptions('<tt><p begin="bad" end="1s">broken</p></tt>'))).toBeNull();
  const urls = await page.evaluate(() => ['https://www.netflix.com/watch/123?t=55', 'https://www.netflix.com.evil.test/watch/123', 'http://www.netflix.com/watch/123', 'https://user@netflix.com/watch/123', 'https://netflix.com:444/watch/123'].map(s=>(window as any).ImmersedNetflix.netflixURL(s)));
  expect(urls).toEqual(['https://www.netflix.com/watch/123',null,null,null,null]);
});

test('Netflix original subtitles support hover, block navigation, speed and fullscreen without transcription', async ({page}) => {
  const speech:string[]=[];
  page.on('request',req=>{if (/transcrib|local-transcript|caption-frames/.test(req.url())) speech.push(req.url());});
  await page.addInitScript(()=>{(window as any).__commands=[];(window as any).webkit={messageHandlers:{immersed:{postMessage:(x:any)=>{
    (window as any).__commands.push(x);
    if(x.action==='netflixCommand' && ['pause','play'].includes(x.command)) setTimeout(()=>(window as any).immersedNetflixEvent({event:'state',id:'123',time:1.5,paused:x.command==='pause',duration:300,title:'日本語の番組'}),20);
  }}}};});
  await page.goto('/');
  await page.getByRole('button',{name:'Netflix',exact:true}).click();
  await expect(page.locator('body')).toHaveClass(/netflixMode/);
  await page.setViewportSize({width:480,height:900});
  await page.evaluate(()=>{
    (window as any).immersedNetflixEvent({event:'state',id:'123',title:'日本語の番組',time:1.5,paused:false,duration:300});
    (window as any).immersedNetflixEvent({event:'cues',language:'ja',cues:[{start:1,end:3,text:'政治について話します。'},{start:3,end:6,text:'本を読みます。'}]});
  });
  const word=page.getByRole('button',{name:'Look up 政治',exact:true});
  await expect(word).toBeVisible();
  await word.hover();
  await expect(page.locator('#lookup')).toHaveClass(/show/);
  await expect(page.locator('#definitions')).toContainText(/politic|government/i);
  await page.locator('#count').hover();
  await expect(page.locator('#lookup')).not.toHaveClass(/show/);
  await expect.poll(()=>page.evaluate(()=>(window as any).__commands.filter((x:any)=>x.action==='netflixCommand'&&x.command==='play').length)).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Next subtitle',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__commands.filter((x:any)=>x.command==='seek').at(-1)?.value)).toBeCloseTo(3.015,2);
  await page.getByRole('button',{name:'Previous subtitle',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__commands.filter((x:any)=>x.command==='seek').at(-1)?.value)).toBeCloseTo(1.015,2);
  await page.getByRole('button',{name:'Playback speed',exact:true}).click();
  await page.getByRole('menuitemradio',{name:'1.5×',exact:true}).click();
  await page.getByRole('button',{name:'Video fullscreen',exact:true}).click();
  await page.getByLabel('Also show subtitles on the video').uncheck();
  const commands=await page.evaluate(()=>(window as any).__commands);
  expect(commands).toContainEqual({action:'netflixCommand',command:'rate',value:1.5});
  expect(commands).toContainEqual({action:'netflixFullscreen'});
  expect(commands).toContainEqual({action:'netflixCommand',command:'original',value:false});
  expect(speech).toEqual([]);
  await page.screenshot({path:'work/netflix-study-preview.png'});
  await page.getByRole('button',{name:'Back to immersed',exact:true}).click();
  await expect(page.locator('body')).not.toHaveClass(/netflixMode/);
});

test('Netflix bridge selects the visible language, clears new episodes, and controls the actual video',async({page})=>{
  await page.route('https://www.netflix.com/**',route=>{
    if(route.request().url().endsWith('/captions-ja'))return route.fulfill({contentType:'application/ttml+xml',body:caption});
    if(route.request().url().endsWith('/captions-en'))return route.fulfill({contentType:'text/vtt',body:'WEBVTT\n\n00:01.000 --> 00:03.000\nTalking about politics.'});
    return route.fulfill({contentType:'text/html; charset=utf-8',body:'<meta charset="utf-8"><title>Test | Netflix</title><video></video><div class="player-timedtext">政治について 話します。</div>'});
  });
  await page.goto('https://www.netflix.com/watch/123');
  await page.evaluate(()=>{
    (window as any).__events=[];(window as any).webkit={messageHandlers:{immersedNetflix:{postMessage:(data:any)=>(window as any).__events.push(data)}}};
    const video=document.querySelector('video')!;Object.defineProperty(video,'currentTime',{value:1.5,writable:true});
  });
  await page.addScriptTag({content:fs.readFileSync('desktop/netflix.js','utf8')});
  await page.addScriptTag({content:fs.readFileSync('desktop/netflix-bridge.js','utf8')});
  await page.evaluate(async()=>{await fetch('/captions-en');await fetch('/captions-ja');});
  await expect.poll(()=>page.evaluate(()=>(window as any).__events.filter((x:any)=>x.event==='cues').length)).toBe(1);
  expect(await page.evaluate(()=>(window as any).__events.find((x:any)=>x.event==='cues').language)).toBe('ja');
  await page.evaluate(()=>(window as any).immersedNetflixCommand({command:'seek',value:4}));
  expect(await page.locator('video').evaluate((v:HTMLVideoElement)=>v.currentTime)).toBe(4);
  await page.keyboard.press('ArrowLeft');
  expect(await page.evaluate(()=>(window as any).__events.at(-1))).toEqual({event:'shortcut',command:'previous'});
  await page.keyboard.press('f');
  expect(await page.evaluate(()=>(window as any).__events.at(-1))).toEqual({event:'shortcut',command:'fullscreen'});
  await page.evaluate(()=>{history.pushState({},'', '/watch/456');document.querySelector('.player-timedtext')!.textContent='';});
  await expect.poll(()=>page.evaluate(()=>(window as any).__events.filter((x:any)=>x.event==='reset').at(-1)?.id)).toBe('456');
  await page.evaluate(()=>(window as any).__events=[]);
  await page.evaluate(()=>(window as any).immersedNetflixCommand({command:'snapshot'}));
  expect(await page.evaluate(()=>(window as any).__events.filter((x:any)=>x.event==='cues'))).toEqual([]);
});

test('visible-only Netflix subtitles close at gaps, retain navigation history and reset on episode changes',async({page})=>{
  await page.addInitScript(()=>{(window as any).webkit={messageHandlers:{immersed:{postMessage:()=>{}}}};});
  await page.goto('/'); await page.getByRole('button',{name:'Netflix',exact:true}).click();
  await page.evaluate(()=>{
    const event=(window as any).immersedNetflixEvent;
    event({event:'state',id:'123',time:1,paused:true,title:'日本語'});
    event({event:'line',time:1,text:'政治について話します。'});
    event({event:'state',id:'123',time:3,paused:true,title:'日本語'});
    event({event:'line',time:3,text:''});
  });
  await expect(page.locator('#subtitles')).toBeEmpty();
  expect(await page.evaluate(()=>(window as any).eval('cues.map(c=>[c.start,c.end,c.text])'))).toEqual([[1,3,'政治について話します。']]);
  await page.evaluate(()=>(window as any).immersedNetflixEvent({event:'reset',id:'456'}));
  expect(await page.evaluate(()=>(window as any).eval('cues.length'))).toBe(0);
  await expect(page.locator('#subtitles')).toContainText('Choose subtitles');
});
