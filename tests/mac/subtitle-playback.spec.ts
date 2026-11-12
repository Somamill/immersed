import { test, expect } from '@playwright/test';
import fs from 'node:fs';

test('replay restarts the current subtitle, cancels hover ownership, and ignores typing', async ({page}) => {
  await page.goto('/');
  await page.evaluate(() => {
    (window as any).eval(`window.__clock=12; window.__paused=false; window.__seeks=[];
      youtube={getCurrentTime:()=>window.__clock,getPlayerState:()=>window.__paused?2:1,
        seekTo:t=>{window.__clock=t;window.__seeks.push(t)},pauseVideo:()=>window.__paused=true,playVideo:()=>window.__paused=false};
      source={type:'youtube',id:'test',title:'日本語'}; cues=[{start:10,end:14,text:'政治について話します。'}];cueIndex=-1;renderCue();`);
  });
  await page.getByRole('button',{name:'Look up 政治',exact:true}).hover();
  await expect(page.locator('#lookup')).toHaveClass(/show/);
  await page.keyboard.press('r');
  await expect(page.locator('#lookup')).not.toHaveClass(/show/);
  expect(await page.evaluate(() => (window as any).__seeks.at(-1))).toBeCloseTo(10.015,3);
  expect(await page.evaluate(() => (window as any).__paused)).toBe(false);
  await page.locator('#query').fill('r');
  await page.keyboard.press('r');
  expect(await page.evaluate(() => (window as any).__seeks.length)).toBe(1);
  await page.getByRole('button',{name:'Replay subtitle',exact:true}).click();
  expect(await page.evaluate(() => (window as any).__seeks.length)).toBe(2);
});

test('optional end-of-subtitle pause holds the finished line and resumes without pausing twice', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByLabel('Pause after each subtitle',{exact:true}).check();
  await page.getByRole('button',{name:'Close panel',exact:true}).click();
  await page.evaluate(() => {
    (window as any).eval(`window.__clock=1.85;window.__paused=false;window.__pauses=0;
      youtube={getCurrentTime:()=>window.__clock,getPlayerState:()=>window.__paused?2:1,
        seekTo:t=>window.__clock=t,pauseVideo:()=>{window.__paused=true;window.__pauses++},playVideo:()=>window.__paused=false};
      source={type:'youtube',id:'test',title:'日本語'};cues=[{start:1,end:2,text:'政治について話します。'},{start:2,end:4,text:'本を読みます。'}];`);
  });
  await expect(page.locator('#subtitles')).toContainText('政治');
  await page.evaluate(() => (window as any).__clock=2.05);
  await expect.poll(() => page.evaluate(() => (window as any).__paused)).toBe(true);
  await expect(page.locator('#subtitles')).toContainText('政治');
  await page.getByRole('button',{name:'Next subtitle',exact:true}).click();
  expect(await page.evaluate(() => (window as any).__clock)).toBeCloseTo(2.015,3);
  await page.getByRole('button',{name:'Play or pause',exact:true}).click();
  await expect(page.locator('#subtitles')).toContainText('本');
  expect(await page.evaluate(() => (window as any).__pauses)).toBe(1);
  await page.reload();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await expect(page.getByLabel('Pause after each subtitle',{exact:true})).toBeChecked();
});

test('Netflix replay and timed pause use the native bridge; live-only subtitles never guess their ends', async ({page}) => {
  await page.addInitScript(() => { (window as any).__commands=[]; (window as any).webkit={messageHandlers:{immersed:{postMessage:(x:any)=>(window as any).__commands.push(x)}}}; });
  await page.goto('/');
  await page.getByRole('button',{name:'Netflix',exact:true}).click();
  await page.evaluate(() => {
    const event=(window as any).immersedNetflixEvent;
    event({event:'state',id:'123',time:1.85,paused:false,duration:50,title:'日本語'});
    event({event:'cues',language:'ja',cues:[{start:1,end:2,text:'政治について話します。'}]});
    (window as any).eval('extras.pauseAfterSubtitle=true');
  });
  await expect(page.getByRole('button',{name:'Look up 政治',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Play or pause',exact:true})).toHaveText('Ⅱ');
  await page.evaluate(() => (window as any).immersedNetflixEvent({event:'state',id:'123',time:2.05,paused:false,duration:50}));
  await expect.poll(() => page.evaluate(() => (window as any).__commands.some((x:any)=>x.command==='pause'))).toBe(true);
  await page.getByRole('button',{name:'Replay subtitle',exact:true}).click();
  expect(await page.evaluate(() => (window as any).__commands.filter((x:any)=>x.command==='seek').at(-1)?.value)).toBeCloseTo(1.015,3);
  expect(await page.evaluate(() => (window as any).__commands.at(-1)?.command)).toBe('play');
  await page.evaluate(() => {
    (window as any).immersedNetflixEvent({event:'reset',id:'456'});
    (window as any).immersedNetflixEvent({event:'state',id:'456',time:1,paused:false,duration:50});
    (window as any).immersedNetflixEvent({event:'line',time:1,text:'政治について話します。'});
    (window as any).__commands=[];
    (window as any).immersedNetflixEvent({event:'state',id:'456',time:6,paused:false,duration:50});
  });
  await expect(page.locator('#subtitles')).toContainText('政治');
  expect(await page.evaluate(() => (window as any).__commands.filter((x:any)=>x.command==='pause'))).toEqual([]);
});

test('Netflix video focus forwards R without interfering with edited text', async ({page}) => {
  await page.route('https://www.netflix.com/**', route=>route.fulfill({contentType:'text/html',body:'<video></video><input aria-label="Search">'}));
  await page.goto('https://www.netflix.com/watch/123');
  await page.evaluate(()=>{(window as any).__events=[];(window as any).webkit={messageHandlers:{immersedNetflix:{postMessage:(x:any)=>(window as any).__events.push(x)}}};});
  await page.addScriptTag({content:fs.readFileSync('desktop/netflix.js','utf8')});
  await page.addScriptTag({content:fs.readFileSync('desktop/netflix-bridge.js','utf8')});
  await page.keyboard.press('r');
  expect(await page.evaluate(() => (window as any).__events.filter((x:any)=>x.event==='shortcut').at(-1))).toEqual({event:'shortcut',command:'replay'});
  await page.getByRole('textbox').fill('r');
  await page.keyboard.press('r');
  expect(await page.evaluate(() => (window as any).__events.filter((x:any)=>x.event==='shortcut').length)).toBe(1);
});
