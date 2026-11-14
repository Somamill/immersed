const {test}=require('node:test'),assert=require('node:assert/strict');
const {pageJSON,searchItems,playerInfo,createYouTubeMetadata}=require('../desktop/youtube-metadata.cjs');
test('page metadata is parsed without executing scripts and braces inside strings stay intact',()=>{
 const data={videoDetails:{title:'A } "quoted" title'}};
 assert.deepEqual(pageJSON('var ytInitialPlayerResponse = '+JSON.stringify(data)+'; window.bad=true;','ytInitialPlayerResponse'),data);
 assert.equal(pageJSON('var ytInitialPlayerResponse = not_json;','ytInitialPlayerResponse'),null);
});
test('search preserves source order, duration and duplicates without treating translated titles as language evidence',()=>{
 const v=id=>({videoRenderer:{videoId:id,title:{runs:[{text:'日本の会話'}]},ownerText:{runs:[{text:'Channel'}]},lengthText:{simpleText:'1:05:30'}}});
 const entries=searchItems({contents:{twoColumnSearchResultsRenderer:{primaryContents:{contents:[v('aaaaaaaaaaa'),v('bbbbbbbbbbb'),v('aaaaaaaaaaa')]}}}});
 assert.deepEqual(entries.map(x=>x.id),['aaaaaaaaaaa','bbbbbbbbbbb']);assert.equal(entries[0].duration,3930);assert.equal(entries[0].language,undefined);
});
test('manual or translated Japanese subtitles do not prove original Japanese audio',()=>{
 const base={videoDetails:{videoId:'aaaaaaaaaaa',title:'話',lengthSeconds:'100'}};
 const info=tracks=>playerInfo({...base,captions:{playerCaptionsTracklistRenderer:{captionTracks:tracks}}},'aaaaaaaaaaa');
 assert.equal(info([{languageCode:'ja',kind:'standard'}]).language,null);
 assert.equal(info([{languageCode:'ja',kind:'standard'},{languageCode:'en',kind:'asr'}]).language,'en');
 assert.equal(info([{languageCode:'ja',kind:'asr'}]).language,'ja');
 assert.equal(playerInfo(base,'bbbbbbbbbbb'),null);
});
test('fast metadata reads bounded public HTML only, preserving query escaping',async()=>{
 let url;const client=createYouTubeMetadata(async input=>{url=input;return new Response('var ytInitialData = '+JSON.stringify({contents:[{videoRenderer:{videoId:'aaaaaaaaaaa',title:{simpleText:'話'},lengthText:{simpleText:'30:00'}}}]}));});
 assert.equal((await client.search('文化 & 対談'))[0].id,'aaaaaaaaaaa');assert.match(url,/search_query=.*%26/);
 const huge=createYouTubeMetadata(async()=>new Response('x'.repeat(3*1024*1024+1)));
 await assert.rejects(()=>huge.search('test'),/too large/);
});
