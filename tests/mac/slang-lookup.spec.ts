import { test, expect } from '@playwright/test';

test('original Netflix slang has whole-word hover targets and prefetched dictionary definitions',async({page})=>{
  await page.addInitScript(()=>{(window as any).__commands=[];(window as any).webkit={messageHandlers:{immersed:{postMessage:(x:any)=>(window as any).__commands.push(x)}}};});
  await page.goto('/');
  await page.getByRole('button',{name:'Netflix',exact:true}).click();
  for(const [text,surface,gloss] of [
    ['この辺 シメてる“泥紋デーモン”のヘッドやってんだぞ こら','シメてる',/keep under strict control/],
    ['虎の威 借って粋がってんじゃねえよ 芋ゴリラ','粋がってんじゃねえ',/put on airs|act brave/],
  ] as const){
    await page.evaluate(text=>{
      (window as any).immersedNetflixEvent({event:'state',id:'123',time:1,paused:false,duration:300,title:'日本語の会話'});
      (window as any).immersedNetflixEvent({event:'line',text,time:1});
    },text);
    const word=page.getByRole('button',{name:'Look up '+surface,exact:true});
    await expect(word).toBeVisible();
    expect(await page.locator('#subtitles .line').evaluate(line=>{const copy=line.cloneNode(true) as HTMLElement;copy.querySelectorAll('rt').forEach(rt=>rt.remove());return copy.textContent;})).toBe(text);
    await word.hover();
    await expect(page.locator('#lookup')).toHaveClass(/show/);
    await expect(page.locator('#lookupWord')).toHaveText(surface);
    await expect(page.locator('#definitions')).toContainText(gloss);
    await expect(page.locator('#definitions')).not.toContainText('No dictionary entry found.');
    await expect(page.getByRole('button',{name:'Save word',exact:true})).toBeEnabled();
    await page.locator('header').hover();
    await expect(page.locator('#lookup')).not.toHaveClass(/show/);
  }
  expect(await page.evaluate(()=>(window as any).__commands.filter((x:any)=>x.command==='hoverEnd').length)).toBe(2);
});
