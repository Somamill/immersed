export function watchPlayerSource(videoId: string) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw new Error('Invalid video ID');
  return { uri: `https://m.youtube.com/watch?v=${videoId}&hl=ja` };
}
export function hostedPlayerSource(videoId: string) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw new Error('Invalid video ID');
  // The wrapper must travel with the native bundle. An HTTPS page on the Expo
  // preview tunnel disappears when that temporary server stops.
  return {
    baseUrl: 'https://somamill.github.io/immersed/player/',
    html: `<!doctype html><html lang="ja"><head><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="referrer" content="strict-origin-when-cross-origin"><style>html,body,iframe{width:100%;height:100%;margin:0;border:0;background:#000;overflow:hidden}iframe{display:block;position:absolute;inset:0}</style></head><body><script>
      const id=${JSON.stringify(videoId)};
      const frame=document.createElement('iframe');
      const query=new URLSearchParams({playsinline:'1',controls:'1',cc_load_policy:'1',cc_lang_pref:'ja',hl:'ja',enablejsapi:'1',origin:location.origin});
      frame.src='https://www.youtube.com/embed/'+id+'?'+query;
      frame.referrerPolicy='strict-origin-when-cross-origin';
      frame.allow='autoplay; encrypted-media; fullscreen; picture-in-picture';
      frame.allowFullscreen=true;
      frame.title='YouTube video';
      window.addEventListener('message',event=>{
        if(event.source!==frame.contentWindow||event.origin!=='https://www.youtube.com'||typeof event.data?.__immersedBridge!=='string'||event.data.__immersedBridge.length>2100000)return;
        try{const message=JSON.parse(event.data.__immersedBridge);if(message&&typeof message==='object'&&(!message.videoId||message.videoId===id))window.ReactNativeWebView?.postMessage(event.data.__immersedBridge)}catch{}
      });
      window.__immersedCommand=(command,time)=>{
        if(!['pause','play','seek','seekTo'].includes(command))return;
        frame.contentWindow?.postMessage({__immersedCommand:true,command,time},'https://www.youtube.com');
      };
      window.__immersedApplyOptions=()=>frame.contentWindow?.postMessage({__immersedCommand:true,options:window.__immersedOptions},'https://www.youtube.com');
      document.body.appendChild(frame);
    </script></body></html>`,
  };
}
export function swipeAction(dx: number, dy: number): 'forward' | 'backward' | null {
  if (Math.abs(dx) >= 45 && Math.abs(dx) > Math.abs(dy) * 1.4) return dx < 0 ? 'forward' : 'backward';
  return null;
}
