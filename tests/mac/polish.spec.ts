import { test, expect } from '@playwright/test';
import fs from 'node:fs';

test('header coverage and advanced katakana follow level changes and explicit word choices',async({page})=>{
  await page.route(/\/api\/desktop\/levels(?:\?|$)/,route=>route.fulfill({json:{'政治':3,'ポッドキャスト':1}}));
  await page.goto('/');
  await page.evaluate(()=>(window as any).eval(`(async()=>{
    prefs.level=2; prefs.knowledge={}; levels={'政治':3,'ポッドキャスト':1};
    source={type:'youtube',id:'5C3hh2fO4mE',title:'日本語'};
    youtube={getCurrentTime:()=>1,getPlayerState:()=>2};
    cues=[{start:0,end:4,text:'政治とポッドキャスト。',uncertain:true}];
    coverageTokens=await analyze(cues[0].text);updateCoverage();cueIndex=-1;await renderCue();
  })()`));
  await expect(page.locator('#understanding')).toBeVisible();
  await expect(page.locator('#understanding')).toHaveText('100%');
  await expect(page.getByRole('button',{name:'Look up ポッドキャスト',exact:true})).not.toHaveClass(/unknown/);
  expect(await page.locator('.line').evaluate(n=>getComputedStyle(n).borderBottomStyle)).toBe('none');
  await page.evaluate(()=>(window as any).eval('prefs.level=3;updateCoverage();cueIndex=-1;renderCue();'));
  await expect(page.locator('#understanding')).toHaveText('50%');
  await expect(page.getByRole('button',{name:'Look up ポッドキャスト',exact:true})).toHaveClass(/unknown/);
  await page.evaluate(()=>(window as any).eval("prefs.level=2;prefs.knowledge={'ポッドキャスト':false};updateCoverage();cueIndex=-1;renderCue();"));
  await expect(page.locator('#understanding')).toHaveText('50%');
  await page.screenshot({path:'work/coverage-polish-preview.png'});
});

test('honorific vocabulary lookup resolves the whole displayed word',async({page})=>{
  await page.goto('/');
  await page.evaluate(()=>(window as any).eval("youtube={getCurrentTime:()=>1,getPlayerState:()=>2};cues=[{start:0,end:5,text:'ポッドキャストにお便りください。'}];cueIndex=-1;renderCue();"));
  const word=page.getByRole('button',{name:'Look up お便り',exact:true});
  await expect(word).toBeVisible();await word.hover();
  await expect(page.locator('#definitions')).toContainText(/letter|correspondence/);
  await expect(page.locator('#lookupWord')).toHaveText('お便り');
  await expect(page.getByRole('button',{name:'Save word',exact:true})).toBeEnabled();
});

test('embedded player keys and rewind buttons route to subtitle blocks instead of timed seeking',async({page})=>{
  await page.route('https://www.youtube.com/embed/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<button aria-label="Rewind 10 seconds">Back</button><button aria-label="Fast forward 10 seconds">Forward</button><input aria-label="Search" />'}));
  await page.goto('https://www.youtube.com/embed/5C3hh2fO4mE');
  await page.evaluate(()=>{(window as any).__jumps=[];(window as any).__oldSeeks=0;(window as any).webkit={messageHandlers:{immersedPlayer:{postMessage:(x:any)=>(window as any).__jumps.push(x.direction)}}};document.addEventListener('click',()=>{(window as any).__oldSeeks++;});});
  await page.addScriptTag({content:fs.readFileSync('desktop/player-bridge.js','utf8')});
  await page.getByRole('button',{name:'Previous subtitle',exact:true}).click();
  await page.getByRole('button',{name:'Next subtitle',exact:true}).click();
  await page.keyboard.press('ArrowLeft');await page.keyboard.press('l');
  expect(await page.evaluate(()=>(window as any).__jumps)).toEqual([-1,1,-1,1]);
  expect(await page.evaluate(()=>(window as any).__oldSeeks)).toBe(0);
  await page.getByRole('textbox',{name:'Search',exact:true}).focus();await page.keyboard.press('ArrowLeft');
  expect(await page.evaluate(()=>(window as any).__jumps.length)).toBe(4);
});
