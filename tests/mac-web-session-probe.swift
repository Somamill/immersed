@MainActor final class Probe: NSObject, WKNavigationDelegate {
 let session=BrowserSession();var web:WKWebView!;var window:NSWindow!;var phase=0
 func start() {
  let config=WKWebViewConfiguration();config.websiteDataStore=session.store
  web=WKWebView(frame:NSRect(x:0,y:0,width:800,height:600),configuration:config);web.navigationDelegate=self
  web.underPageBackgroundColor = .clear
  if web.responds(to:NSSelectorFromString("_setDrawsBackground:")) { web.setValue(false,forKey:"drawsBackground");precondition((web.value(forKey:"drawsBackground") as? Bool)==false) }
  window=NSWindow(contentRect:web.frame,styleMask:[.titled],backing:.buffered,defer:false);window.contentView=web
  web.loadHTMLString("<title>Web session check</title>",baseURL:URL(string:"http://localhost:4799"))
 }
 func webView(_ webView:WKWebView,didFinish navigation:WKNavigation!) {
  let script = phase==0 ? """
  const key = await crypto.subtle.generateKey({name:'AES-GCM',length:128},false,['encrypt','decrypt']);
  const db = await new Promise((resolve,reject)=>{const r=indexedDB.open('immersed-session-probe',1);r.onupgradeneeded=()=>r.result.createObjectStore('keys');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  await new Promise((resolve,reject)=>{const t=db.transaction('keys','readwrite');t.objectStore('keys').put(key,'probe');t.oncomplete=resolve;t.onerror=()=>reject(t.error)});db.close();return 'stored';
  """ : """
  const db = await new Promise((resolve,reject)=>{const r=indexedDB.open('immersed-session-probe',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  const key = await new Promise((resolve,reject)=>{const r=db.transaction('keys').objectStore('keys').get('probe');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  const iv=crypto.getRandomValues(new Uint8Array(12)), original=new TextEncoder().encode('immersed 日本語');
  const sealed=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,original);const opened=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,sealed);db.close();indexedDB.deleteDatabase('immersed-session-probe');return new TextDecoder().decode(opened);
  """
  web.callAsyncJavaScript(script,arguments:[:],in:nil,in:.page){[self] result in
   switch result {case .failure(let error):print("FAIL",error);exit(1)
   case .success(let value):
    if phase==0 {phase=1;web.loadHTMLString("<title>Reloaded</title>",baseURL:URL(string:"http://localhost:4799"))}
    else {guard value as? String == "immersed 日本語",(!session.store.isPersistent || session.keyRequests>0) else {print("FAIL key provider",session.keyRequests,value);exit(1)};print("PASS WebCrypto IndexedDB reload roundtrip; app memory key callbacks:",session.keyRequests);exit(0)}
   }
  }
 }
}
@main struct Main { @MainActor static func main(){ let app=NSApplication.shared;let probe=Probe();probe.start();DispatchQueue.main.asyncAfter(deadline:.now()+20){ print("FAIL timeout");exit(1) };withExtendedLifetime(probe){app.run()} } }
