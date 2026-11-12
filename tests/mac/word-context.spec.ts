import { test, expect } from '@playwright/test';

test('saved Netflix context waits for the requested title and seeks only once', async ({page}) => {
  await page.addInitScript(() => {
    localStorage.setItem('immersed.savedWords', JSON.stringify([{key:'政治',word:'政治',reading:'せいじ',sentence:'政治の話です。',url:'https://www.netflix.com/watch/123',time:42.25}]));
    (window as any).__commands=[];
    (window as any).webkit={messageHandlers:{immersed:{postMessage:(value:any)=>(window as any).__commands.push(value)}}};
  });
  await page.goto('/');
  await page.getByRole('button',{name:'Words',exact:true}).click();
  await page.getByRole('button',{name:'Play context for 政治',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).__commands.filter((x:any)=>x.action==='openNetflix'))).toEqual([{action:'openNetflix',url:'https://www.netflix.com/watch/123'}]);
  await page.evaluate(()=>{
    const event=(window as any).immersedNetflixEvent;
    event({event:'state',id:'456',time:7,paused:true,duration:300});
    event({event:'reset',id:'123'});
    event({event:'state',id:'123',time:0,paused:true,duration:0});
  });
  expect(await page.evaluate(()=>(window as any).__commands.filter((x:any)=>x.command==='seek'))).toEqual([]);
  await page.evaluate(()=>{
    const event=(window as any).immersedNetflixEvent;
    event({event:'state',id:'123',time:0,paused:true,duration:300});
    event({event:'state',id:'123',time:42.25,paused:false,duration:300});
  });
  expect(await page.evaluate(()=>(window as any).__commands.filter((x:any)=>x.command==='seek'))).toEqual([{action:'netflixCommand',command:'seek',value:42.25}]);
  expect(await page.evaluate(()=>(window as any).__commands.filter((x:any)=>x.command==='play'))).toHaveLength(1);
});

test('saved and recent context preserve provider and exact timestamp including zero', async ({page}) => {
  await page.addInitScript(()=>{
    localStorage.setItem('immersed.savedWords',JSON.stringify([
      {key:'a',word:'猫',url:'https://www.youtube.com/watch?v=aaaaaaaaaaa',time:0,title:'話'},
      {key:'b',word:'犬',url:'local:book',time:72.5},
    ]));
    localStorage.setItem('immersed.recentWords',JSON.stringify([{key:'c',word:'政治',url:'https://www.youtube.com/watch?v=bbbbbbbbbbb',time:14.75,lookups:2}]));
  });
  await page.goto('/');
  await page.evaluate(()=>(window as any).eval(`window.__opened=[]; loadVideo=async(...args)=>window.__opened.push(['youtube',...args]);openLocal=async(...args)=>window.__opened.push(['local',...args]);`));
  await page.getByRole('button',{name:'Words',exact:true}).click();
  await page.getByRole('button',{name:'Play context for 猫',exact:true}).click();
  await page.getByRole('button',{name:'Words',exact:true}).click();
  await page.getByRole('button',{name:'Play context for 犬',exact:true}).click();
  await page.getByRole('button',{name:'Words',exact:true}).click();
  await page.getByRole('button',{name:'Play context for 政治',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).__opened)).toEqual([
    ['youtube','aaaaaaaaaaa','話',0],['local','book',72.5],['youtube','bbbbbbbbbbb',undefined,14.75],
  ]);
});

test('saving uses the subtitle start and canonical lemma across dictionary reopen and state changes',async({page})=>{
  await page.goto('/');
  await page.evaluate(()=>(window as any).eval(`
    source={type:'netflix',id:'123',title:'会話'};
    netflix={time:45,paused:true,id:'123'};
    selected={text:'気回さなくて',lemma:'気を回す',reading:'きをまわす',start:0,end:6};
    lookupCue={start:40,end:50,text:'気回さなくていいから'};
    lookupEntries=[{slug:'気を回す',japanese:[{word:'気を廻す',reading:'きをまわす'}],senses:[{english_definitions:['to be attentive']}]}];
    recordLookup();
    selected={text:'気を廻す',lemma:'気を回す',reading:'きをまわす'};
    saveWord();
    selected=null; netflix=null; source=null;
  `));
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('immersed.savedWords')!));
  expect(saved[0]).toMatchObject({word:'気を廻す',lemma:'気を回す',time:40,sentence:'気回さなくていいから',url:'https://www.netflix.com/watch/123'});
  await page.getByRole('button',{name:'Words',exact:true}).click();
  await page.getByRole('button',{name:'Mark 気を廻す known',exact:true}).click();
  await expect(page.locator('.savedWord .wordState')).toHaveText('Known');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('immersed.mac.options')!).wordStates['気を回す'])).toBe('known');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('immersed.preferences')!).knowledge['気を回す'])).toBe(true);
  await page.reload();
  await page.getByRole('button',{name:'Words',exact:true}).click();
  await expect(page.locator('.savedWord .wordState')).toHaveText('Known');
  await page.getByRole('button',{name:'Mark 気を廻す learning',exact:true}).click();
  await expect(page.locator('.savedWord .wordState')).toHaveText('Learning');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('immersed.mac.options')!).wordStates['気を回す'])).toBe('learning');
});
