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
    if(x.action==='netflixCommand' && ['pause','play','hoverStart','hoverEnd'].includes(x.command)) setTimeout(()=>(window as any).immersedNetflixEvent({event:'state',id:'123',time:1.5,paused:['pause','hoverStart'].includes(x.command),duration:300,title:'日本語の番組'}),20);
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
  await page.locator('header').hover();
  await expect(page.locator('#lookup')).not.toHaveClass(/show/);
  await expect.poll(()=>page.evaluate(()=>(window as any).__commands.filter((x:any)=>x.action==='netflixCommand'&&x.command==='hoverEnd').length)).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Next subtitle',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__commands.filter((x:any)=>x.command==='seek').at(-1)?.value)).toBeCloseTo(3.015,2);
  await page.getByRole('button',{name:'Previous subtitle',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__commands.filter((x:any)=>x.command==='seek').at(-1)?.value)).toBeCloseTo(1.015,2);
  await page.getByRole('button',{name:'Playback speed',exact:true}).click();
  await page.getByRole('menuitemradio',{name:'1.5×',exact:true}).click();
  await page.getByRole('button',{name:'Video fullscreen',exact:true}).click();
  await page.locator('#netflixOriginal').evaluate((node:HTMLInputElement)=>{node.checked=false;node.dispatchEvent(new Event('change'));});
  const commands=await page.evaluate(()=>(window as any).__commands);
  expect(commands).toContainEqual({action:'netflixCommand',command:'rate',value:1.5});
  expect(commands).toContainEqual({action:'netflixFullscreen'});
  expect(commands).toContainEqual({action:'netflixCommand',command:'original',value:false});
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await expect(page.getByLabel('Speech model',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Compare speech models',exact:true})).toHaveCount(0);
  await page.evaluate(()=>(window as any).eval('beginTranscript()'));
  await page.getByRole('button',{name:'Close panel',exact:true}).click();
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
  expect(await page.evaluate(()=>(window as any).__events.filter((x:any)=>x.event==='shortcut').at(-1))).toEqual({event:'shortcut',command:'previous'});
  await page.keyboard.press('f');
  expect(await page.evaluate(()=>(window as any).__events.filter((x:any)=>x.event==='shortcut').at(-1))).toEqual({event:'shortcut',command:'fullscreen'});
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

test('Netflix displayed captions override track-clock drift and clear immediately at original gaps',async({page})=>{
  await page.addInitScript(()=>{(window as any).__commands=[];(window as any).webkit={messageHandlers:{immersed:{postMessage:(x:any)=>(window as any).__commands.push(x)}}};});
  await page.goto('/');await page.getByRole('button',{name:'Netflix',exact:true}).click();
  await page.evaluate(()=>{
    const event=(window as any).immersedNetflixEvent;
    event({event:'state',id:'123',time:1.2,paused:true,rate:1.5,title:'日本語'});
    event({event:'cues',language:'ja',cues:[{start:1,end:3,text:'政治について話します。'},{start:3,end:6,text:'本を読みます。'}]});
    event({event:'line',id:'123',time:1.2,text:'本を読みます。'});
  });
  await expect(page.getByRole('button',{name:'Look up 本',exact:true})).toBeVisible();
  await expect(page.locator('#subtitles')).not.toContainText('政治');
  await expect(page.locator('#speedValue')).toHaveText('1.5×');
  await page.evaluate(()=>(window as any).immersedNetflixEvent({event:'state',id:'123',time:1.4,paused:true,rate:1.5}));
  await expect(page.getByRole('button',{name:'Look up 本',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Previous subtitle',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).__commands.filter((x:any)=>x.command==='seek').at(-1).value)).toBeCloseTo(1.015,2);
  await page.evaluate(()=>(window as any).immersedNetflixEvent({event:'line',id:'123',time:1.5,text:''}));
  await expect(page.locator('#subtitles')).toBeEmpty();
});

test('Netflix fullscreen keeps lookup available and hides browsing and transport chrome',async({page})=>{
  await page.addInitScript(()=>{(window as any).__commands=[];(window as any).webkit={messageHandlers:{immersed:{postMessage:(x:any)=>(window as any).__commands.push(x)}}};});
  await page.goto('/');await page.getByRole('button',{name:'Netflix',exact:true}).click();
  await page.setViewportSize({width:960,height:520});
  await page.evaluate(()=>{
    const event=(window as any).immersedNetflixEvent;
    event({event:'state',id:'123',time:1,paused:true,rate:1});
    event({event:'cues',language:'ja',cues:[{start:0,end:4,text:'政治について話します。'}]});
    event({event:'line',id:'123',time:1,text:'政治について話します。'});
    (window as any).immersedNetflixFullscreen(true);
  });
  await expect(page.locator('header')).toBeHidden();await expect(page.locator('#controls')).toBeHidden();
  await page.getByRole('button',{name:'Look up 政治',exact:true}).click();
  await expect(page.locator('#definitions')).toContainText(/politic|government/);
  await expect(page.getByRole('button',{name:'Save word',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).__commands)).toContainEqual({action:'netflixLookup',open:true});
  await page.keyboard.press('Escape');await expect(page.locator('#lookup')).not.toHaveClass(/show/);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(()=>(window as any).__commands)).toContainEqual({action:'netflixFullscreen'});
});

test('Netflix DOM changes and playback-rate events are forwarded immediately, including fullscreen requests',async({page})=>{
  await page.route('https://www.netflix.com/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<meta charset="utf-8"><video></video><div class="player-timedtext">最初の字幕</div><button data-uia="control-fullscreen-enter">Fullscreen</button>'}));
  await page.goto('https://www.netflix.com/watch/123');
  await page.evaluate(()=>{(window as any).__events=[];(window as any).webkit={messageHandlers:{immersedNetflix:{postMessage:(data:any)=>(window as any).__events.push(data)}}};});
  await page.addScriptTag({content:fs.readFileSync('desktop/netflix.js','utf8')});await page.addScriptTag({content:fs.readFileSync('desktop/netflix-bridge.js','utf8')});
  await page.evaluate(async()=>{(window as any).__events=[];document.querySelector('.player-timedtext')!.textContent='次の字幕';await new Promise(r=>setTimeout(r,0));});
  expect(await page.evaluate(()=>(window as any).__events.filter((x:any)=>x.event==='line').at(-1)?.text)).toBe('次の字幕');
  await page.evaluate(async()=>{document.querySelector('video')!.playbackRate=1.5;await new Promise(r=>setTimeout(r,0));});
  expect(await page.evaluate(()=>(window as any).__events.filter((x:any)=>x.event==='state').at(-1)?.rate)).toBe(1.5);
  await page.getByRole('button',{name:'Fullscreen',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).__events.filter((x:any)=>x.event==='shortcut').at(-1)?.command)).toBe('fullscreen');
  await page.evaluate(()=>(window as any).immersedNetflixCommand({command:'fullscreenState',value:true}));await page.keyboard.press('Escape');
  await expect(page.locator('.player-timedtext')).toHaveCSS('opacity','0');
  expect(await page.evaluate(()=>(window as any).__events.filter((x:any)=>x.event==='shortcut').at(-1)?.command)).toBe('exitFullscreen');
  await page.evaluate(()=>(window as any).immersedNetflixCommand({command:'fullscreenState',value:false}));
  await expect(page.locator('.player-timedtext')).toHaveCSS('opacity','1');
});


test('Netflix commands use its player controller and millisecond timeline', async ({page}) => {
  await page.route('https://www.netflix.com/**', route=>route.fulfill({contentType:'text/html',body:'<video></video><div class="player-timedtext">日本語</div>'}));
  await page.goto('https://www.netflix.com/watch/123');
  await page.evaluate(()=>{
    (window as any).__events=[];(window as any).__controls=[];
    (window as any).webkit={messageHandlers:{immersedNetflix:{postMessage:(data:any)=>(window as any).__events.push(data)}}};
    Object.defineProperty(document.querySelector('video'),'currentTime',{value:1.5,writable:true});
    const player=Object.fromEntries(['play','pause','seek','setPlaybackRate'].map(name=>[name,(value:any)=>(window as any).__controls.push([name,value])]));
    (window as any).netflix={appContext:{state:{playerApp:{getAPI:()=>({videoPlayer:{getAllPlayerSessionIds:()=>['preview','watch_main'],getVideoPlayerBySessionId:(id:string)=>id==='watch_main'?player:null}})}}}};
  });
  await page.addScriptTag({content:fs.readFileSync('desktop/netflix.js','utf8')});
  await page.addScriptTag({content:fs.readFileSync('desktop/netflix-bridge.js','utf8')});
  await page.evaluate(()=>{for(const command of [{command:'play'},{command:'pause'},{command:'seek',value:45.25},{command:'rate',value:1.5}])(window as any).immersedNetflixCommand(command)});
  expect(await page.evaluate(()=>(window as any).__controls)).toEqual([['play',undefined],['pause',undefined],['seek',45250],['setPlaybackRate',1.5]]);
  expect(await page.locator('video').evaluate((v:HTMLVideoElement)=>v.currentTime)).toBe(1.5);
});

test('Netflix error pages report their error even after the video was removed', async ({page}) => {
  await page.route('https://www.netflix.com/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<meta charset="utf-8"><div class="error-page">エラーコード S7\uFEFF353-5101</div>'}));
  await page.goto('https://www.netflix.com/watch/123');
  await page.evaluate(()=>{(window as any).__events=[];(window as any).webkit={messageHandlers:{immersedNetflix:{postMessage:(data:any)=>(window as any).__events.push(data)}}}});
  await page.addScriptTag({content:fs.readFileSync('desktop/netflix.js','utf8')});
  await page.addScriptTag({content:fs.readFileSync('desktop/netflix-bridge.js','utf8')});
  await expect.poll(()=>page.evaluate(()=>(window as any).__events.find((x:any)=>x.event==='error')?.code)).toBe('S7353-5101');
  await page.locator('.error-page').evaluate(e=>e.append(document.createTextNode('。')));
  expect(await page.evaluate(()=>(window as any).__events.filter((x:any)=>x.event==='error').length)).toBe(1);
});

test('Netflix recovery is explicit and never opens another browser automatically', async ({page}) => {
  await page.addInitScript(()=>{(window as any).__commands=[];(window as any).webkit={messageHandlers:{immersed:{postMessage:(data:any)=>(window as any).__commands.push(data)}}}});
  await page.goto('/');await page.getByRole('button',{name:'Netflix',exact:true}).click();
  await expect(page.getByRole('button',{name:'Retry playback',exact:true})).toBeHidden();
  await page.evaluate(()=>(window as any).immersedNetflixEvent({event:'error',code:'S7353-5101',message:'Netflix playback failed (S7353-5101).'}));
  await expect(page.locator('#netflixStatus')).toContainText('S7353-5101');
  await expect(page.getByRole('button',{name:'Retry playback',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).__commands.filter((x:any)=>x.action==='netflixSafari'))).toEqual([]);
  await page.getByRole('button',{name:'Open in Safari',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).__commands.at(-1))).toEqual({action:'netflixSafari'});
  await page.getByRole('button',{name:'Retry playback',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).__commands.at(-1))).toEqual({action:'netflixRepair'});
  await expect(page.getByRole('button',{name:'Retry playback',exact:true})).toBeHidden();
});

test('Netflix toolbar stays inside narrow panes and fullscreen has no opaque caption bar',async({page})=>{
  await page.addInitScript(()=>{(window as any).webkit={messageHandlers:{immersed:{postMessage:()=>{}}}}});
  await page.goto('/');await page.getByRole('button',{name:'Netflix',exact:true}).click();
  await page.evaluate(()=>(window as any).immersedNetflixEvent({event:'state',id:'123',time:1,paused:true,duration:300}));
  for(const width of [300,420,768]) {
    await page.setViewportSize({width,height:800});
    for(const label of ['Back to immersed','Video fullscreen','Words','Settings']) {
      const bounds=await page.getByRole('button',{name:label,exact:true}).boundingBox();expect(bounds).not.toBeNull();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(width);
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  await expect(page.locator('#netflixOptions')).toBeHidden();await expect(page.locator('.studyHead')).toBeHidden();
  await expect(page.getByRole('combobox',{name:'Subtitle track'})).toHaveCount(0);
  await page.evaluate(()=>(window as any).immersedNetflixFullscreen(true));
  for(const selector of ['html','body','.studyCard','.subtitles'])expect(await page.locator(selector).evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  await expect(page.locator('header')).toBeHidden();
});

test('fullscreen subtitles have an outline and stronger text without a panel background',async({page})=>{
 await page.addInitScript(()=>{(window as any).webkit={messageHandlers:{immersed:{postMessage:()=>{}}}};});
 await page.goto('/');await page.getByRole('button',{name:'Netflix',exact:true}).click();
 await page.evaluate(()=>{(window as any).immersedNetflixEvent({event:'state',id:'123',time:1,paused:true,duration:300});(window as any).immersedNetflixEvent({event:'line',time:1,text:'確かに日本の公共性について考えています。'});(window as any).immersedNetflixFullscreen(true);});
 const line=page.locator('#subtitles .line');await expect(line).toBeVisible();
 const style=await line.evaluate(e=>{const s=getComputedStyle(e);return{stroke:s.getPropertyValue('-webkit-text-stroke-width'),weight:s.fontWeight,background:s.backgroundColor};});
 expect(parseFloat(style.stroke)).toBeGreaterThan(0);expect(Number(style.weight)).toBeGreaterThanOrEqual(600);expect(style.background).toBe('rgba(0, 0, 0, 0)');
 for(const width of [480,960]){await page.setViewportSize({width,height:520});const bounds=await line.boundingBox();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(width);}
});

test('word shortcuts 1–4 persist distinct states, preserve hover and never seek Netflix',async({page})=>{
  await page.addInitScript(()=>{(window as any).__commands=[];(window as any).webkit={messageHandlers:{immersed:{postMessage:(x:any)=>(window as any).__commands.push(x)}}}});
  const load=async()=>{await page.goto('/');await page.getByRole('button',{name:'Netflix',exact:true}).click();await page.evaluate(()=>{const event=(window as any).immersedNetflixEvent;event({event:'state',id:'123',time:1.5,paused:true,duration:300});event({event:'cues',language:'ja',cues:[{start:1,end:3,text:'政治について話します。'}]});event({event:'line',id:'123',time:1.5,text:'政治について話します。'});});};
  await load();const word=page.getByRole('button',{name:'Look up 政治',exact:true});await word.hover();await expect(page.locator('#lookup')).toHaveClass(/show/);
  for(const [key,state] of [['1','unknown'],['2','learning'],['3','known'],['4','ignored']]) {
    await page.keyboard.press(key);await expect(page.locator('#wordStates button[data-state="'+state+'"]').first()).toHaveAttribute('aria-pressed','true');
    await expect(page.locator('#lookup')).toHaveClass(/show/);await expect(word).toHaveAttribute('data-word-state',state);
  }
  expect(await page.evaluate(()=>(window as any).__commands.filter((x:any)=>x.command==='seek'))).toEqual([]);
  await load();await expect(page.getByRole('button',{name:'Look up 政治',exact:true})).toHaveAttribute('data-word-state','ignored');
  await expect(page.getByRole('button',{name:'Look up 政治',exact:true})).not.toHaveClass(/unknown/);
});


test('paused Netflix block navigation displays the original target until the renderer catches up',async({page})=>{
  await page.addInitScript(()=>{localStorage.setItem('immersed.preferences',JSON.stringify({readings:false}));(window as any).__commands=[];(window as any).webkit={messageHandlers:{immersed:{postMessage:(x:any)=>(window as any).__commands.push(x)}}}});
  await page.goto('/');await page.getByRole('button',{name:'Netflix',exact:true}).click();
  await page.evaluate(()=>{const e=(window as any).immersedNetflixEvent;e({event:'state',id:'123',time:5.5,paused:true,duration:300});e({event:'cues',language:'ja',cues:[{start:1,end:3,text:'最初の字幕。'},{start:5,end:7,text:'次の字幕。'},{start:9,end:12,text:'最後の字幕。'}]});e({event:'line',id:'123',time:5.5,text:'次の字幕。'});});
  await page.getByRole('button',{name:'Previous subtitle',exact:true}).click();
  await page.evaluate(()=>(window as any).immersedNetflixEvent({event:'line',id:'123',time:1.015,text:''}));
  await expect(page.locator('#subtitles')).toHaveText('最初の字幕。');
  await page.getByRole('button',{name:'Next subtitle',exact:true}).click();await expect(page.locator('#subtitles')).toHaveText('次の字幕。');
  const commands=await page.evaluate(()=>(window as any).__commands.filter((x:any)=>x.command==='seek').map((x:any)=>x.value));expect(commands[0]).toBeCloseTo(1.015,3);expect(commands[1]).toBeCloseTo(5.015,3);
  await page.getByRole('button',{name:'Play or pause',exact:true}).click();
  await page.evaluate(()=>(window as any).immersedNetflixEvent({event:'line',id:'123',time:5.015,text:''}));await expect(page.locator('#subtitles')).toBeEmpty();
});


test('Netflix owns hover pause and resumes once, while manual pauses and cancelled lookups stay paused',async({page})=>{
  await page.route('https://www.netflix.com/**',route=>route.fulfill({contentType:'text/html',body:'<video></video>'}));await page.goto('https://www.netflix.com/watch/123');
  await page.evaluate(()=>{
    (window as any).__events=[];(window as any).__controls=[];(window as any).__paused=false;
    (window as any).webkit={messageHandlers:{immersedNetflix:{postMessage:(data:any)=>(window as any).__events.push(data)}}};
    const video=document.querySelector('video')!;Object.defineProperty(video,'paused',{get:()=>(window as any).__paused});
    const player={play:()=>{(window as any).__controls.push('play');(window as any).__paused=false},pause:()=>{(window as any).__controls.push('pause');(window as any).__paused=true}};
    (window as any).netflix={appContext:{state:{playerApp:{getAPI:()=>({videoPlayer:{getAllPlayerSessionIds:()=>['watch_main'],getVideoPlayerBySessionId:()=>player}})}}}};
  });
  await page.addScriptTag({content:fs.readFileSync('desktop/netflix.js','utf8')});await page.addScriptTag({content:fs.readFileSync('desktop/netflix-bridge.js','utf8')});
  const send=async(command:string,value:number)=>page.evaluate(({command,value})=>(window as any).immersedNetflixCommand({command,value}),{command,value});
  await send('hoverStart',1);await send('hoverStart',1);await send('hoverEnd',1);await send('hoverEnd',1);
  expect(await page.evaluate(()=>(window as any).__controls)).toEqual(['pause','play']);
  await page.evaluate(()=>(window as any).__paused=true);await send('hoverStart',2);await send('hoverEnd',2);
  expect(await page.evaluate(()=>(window as any).__paused)).toBe(true);expect(await page.evaluate(()=>(window as any).__controls.filter((x:string)=>x==='play').length)).toBe(1);
  await page.evaluate(()=>(window as any).__paused=false);await send('hoverStart',3);await send('hoverCancel',3);await send('hoverEnd',3);
  expect(await page.evaluate(()=>(window as any).__paused)).toBe(true);
  await page.evaluate(()=>(window as any).__paused=false);await send('hoverStart',4);await send('pause',0);await send('hoverEnd',4);
  expect(await page.evaluate(()=>(window as any).__controls.filter((x:string)=>x==='play').length)).toBe(1);
});

test('opening Netflix lookup keeps the caption anchored while its native viewport expands',async({page})=>{
  await page.addInitScript(()=>{(window as any).webkit={messageHandlers:{immersed:{postMessage:()=>{}}}}});
  await page.setViewportSize({width:960,height:190});await page.goto('/');await page.getByRole('button',{name:'Netflix',exact:true}).click();
  await page.evaluate(()=>{const e=(window as any).immersedNetflixEvent;e({event:'state',id:'123',time:1,paused:true,duration:100});e({event:'cues',language:'ja',cues:[{start:0,end:3,text:'政治について話します。'}]});e({event:'line',id:'123',time:1,text:'政治について話します。'});(window as any).immersedNetflixFullscreen(true)});
  const word=page.getByRole('button',{name:'Look up 政治',exact:true});const before=(await word.boundingBox())!;
  await word.click();await page.setViewportSize({width:960,height:520});const after=(await word.boundingBox())!;
  expect(Math.abs((190-before.y-before.height)-(520-after.y-after.height))).toBeLessThan(1);
  await expect(page.getByRole('button',{name:'Save word',exact:true})).toBeVisible();
});


test('Netflix shares immersed glass surfaces and icon styling without restoring the info panel',async({page})=>{
  await page.addInitScript(()=>{(window as any).webkit={messageHandlers:{immersed:{postMessage:()=>{}}}}});await page.goto('/');
  const surfaces=()=>page.evaluate(()=>{const pick=(selector:string)=>{const s=getComputedStyle(document.querySelector(selector)!);return {background:s.backgroundImage,radius:s.borderRadius,border:s.borderTopColor,blur:s.backdropFilter}};return {header:pick('header'),lookup:pick('#lookup'),card:pick('.studyCard'),icon:pick('#fullscreen')}});
  const common=await surfaces();await page.getByRole('button',{name:'Netflix',exact:true}).click();expect(await surfaces()).toEqual(common);
  await expect(page.locator('#netflixOptions')).toBeHidden();await expect(page.locator('.studyHead')).toBeHidden();
  await page.evaluate(()=>(window as any).immersedNetflixFullscreen(true));expect(await page.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
});
