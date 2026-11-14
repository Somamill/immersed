// Public page metadata only. Never infer original language from the title or
// a translated subtitle track, and never download video/audio during discovery.
const { Buffer } = require('node:buffer');
function pageJSON(html, name) {
  const match = new RegExp('(?:var\\s+' + name + '|window\\["' + name + '"\\]|' + name + ')\\s*=\\s*').exec(html);
  if (!match) return null;
  const start = html.indexOf('{', match.index + match[0].length);
  let depth = 0, quoted = false, escaped = false;
  for (let i = start; start >= 0 && i < html.length; i++) {
    const c = html[i];
    if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; }
    else if (c === '"') quoted = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) { try { return JSON.parse(html.slice(start, i + 1)); } catch { return null; } }
  }
  return null;
}
const text = value => value?.simpleText || value?.runs?.map(r => r.text).join('') || '';
function searchItems(data) {
  const result = [], seen = new Set(), stack = [data?.contents?.twoColumnSearchResultsRenderer?.primaryContents || data?.contents];
  let examined = 0;
  while (stack.length && examined++ < 30000) {
    const item = stack.pop();
    if (!item || typeof item !== 'object') continue;
    const v = item.videoRenderer;
    if (v && /^[\w-]{11}$/.test(v.videoId) && !seen.has(v.videoId)) {
      seen.add(v.videoId);
      const parts = text(v.lengthText).split(':').map(Number);
      result.push({id:v.videoId,title:text(v.title),channel:text(v.ownerText || v.longBylineText),
        duration:parts.every(Number.isFinite) ? parts.reduce((sum,n)=>sum*60+n,0) : 0,
        thumbnail:v.thumbnail?.thumbnails?.at(-1)?.url,
        isShort:(v.thumbnailOverlays || []).some(o=>o.thumbnailOverlayTimeStatusRenderer?.style==='SHORTS')});
      // Discovery displays at most 18 items. Avoid walking the remaining page
      // (recommendations and continuations can be much larger than the list).
      if (result.length === 18) break;
    }
    // Reverse DFS preserves YouTube's ranked result order.
    const values = Array.isArray(item) ? item : Object.values(item);
    for (let i=values.length-1;i>=0;i--) if (values[i] && typeof values[i]==='object') stack.push(values[i]);
  }
  return result;
}
function playerInfo(data, id) {
  const video = data?.videoDetails;
  if (!video || video.videoId !== id) return null;
  const micro = data.microformat?.playerMicroformatRenderer || {};
  const tracks = data.captions?.playerCaptionsTracklistRenderer;
  const original = micro.defaultAudioLanguage || tracks?.captionTracks?.find(t=>t.kind==='asr')?.languageCode || null;
  return {id,title:video.title,channel:video.author,duration:Number(video.lengthSeconds)||0,
    thumbnail:video.thumbnail?.thumbnails?.at(-1)?.url,language:original?.split('-')[0] || null,isShort:false};
}
async function page(url, fetcher) {
  const response = await fetcher(url, {signal:AbortSignal.timeout(4500),headers:{'Accept-Language':'ja,en;q=0.8'}});
  if (!response.ok) throw Error('YouTube metadata unavailable');
  const reader = response.body.getReader(), chunks=[]; let size=0;
  try { while(true) { const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>3*1024*1024)throw Error('YouTube page too large');chunks.push(Buffer.from(value)); } }
  finally { await reader.cancel().catch(()=>{}); }
  return Buffer.concat(chunks).toString('utf8');
}
function createYouTubeMetadata(fetcher=fetch) {
  return {
    async search(query) { const items=searchItems(pageJSON(await page('https://www.youtube.com/results?search_query='+encodeURIComponent(query)+'&hl=ja',fetcher),'ytInitialData'));if(!items.length)throw Error('No public search metadata');return items.slice(0,18); },
    async info(id) { return playerInfo(pageJSON(await page('https://www.youtube.com/watch?v='+id+'&hl=ja',fetcher),'ytInitialPlayerResponse'),id); }
  };
}
module.exports={pageJSON,searchItems,playerInfo,createYouTubeMetadata};
