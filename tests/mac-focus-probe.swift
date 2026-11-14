@MainActor final class FocusProbe: NSObject, WKNavigationDelegate {
 let delegate = AppDelegate()
 func start() {
  delegate.web=WKWebView(frame:NSRect(x:0,y:0,width:1320,height:860))
  delegate.window=NSWindow(contentRect:delegate.web.frame,styleMask:[.titled,.resizable,.fullSizeContentView],backing:.buffered,defer:false)
  let surface=NSView(frame:delegate.web.frame);surface.addSubview(delegate.web);delegate.window.contentView=surface
  delegate.showStartupAnimation();surface.layoutSubtreeIfNeeded()
  precondition(delegate.loading.superview===surface,"Startup must sit above WebKit, not inside it")
  precondition(delegate.loading.bounds.width>0 && delegate.loading.subviews.count==2,"Startup artwork must have visible bounds")
  delegate.loading.removeFromSuperview()
  delegate.web.navigationDelegate=self
  delegate.web.loadHTMLString("<script>window.calls=[];window.immersedPlayback=(a,v)=>calls.push([a,v??null]);</script>",baseURL:URL(string:"http://localhost:4799"))
 }
 func webView(_ webView:WKWebView,didFinish navigation:WKNavigation!) {
  delegate.netflixView=WKWebView(frame:delegate.web.frame)
  delegate.enterNetflixFullscreen()
  let focus=delegate.netflixFocus!
  for size in [NSSize(width:800,height:600),NSSize(width:1320,height:860),NSSize(width:1850,height:1000)] {
   delegate.window.setContentSize(size);focus.layoutSubtreeIfNeeded()
   let controls=focus.transport!
   precondition(controls.frame.minX>=0 && controls.frame.maxX<=focus.bounds.width)
   precondition(controls.frame.minY>=0 && controls.frame.maxY<=focus.bounds.height)
   focus.expanded=true;focus.layoutSubtreeIfNeeded()
   precondition(delegate.web.frame.minX>=0 && delegate.web.frame.maxX<=focus.bounds.width)
  }
  let buttons=(focus.transport as! NSStackView).arrangedSubviews.compactMap{$0 as? NSButton}
  precondition(buttons.count==3)
  for b in buttons {b.performClick(nil)}
  delegate.web.evaluateJavaScript("JSON.stringify(window.calls)") { value,error in
   precondition(error==nil && (value as? String)=="[[\"skip\",-1],[\"toggle\",null],[\"skip\",1]]","Fullscreen buttons must route through subtitle navigation")
   print("PASS native startup overlay and Netflix subtitle transport at three sizes")
   exit(0)
  }
 }
}
@main struct Main {
 @MainActor static func main() {
  let app=NSApplication.shared;let probe=FocusProbe();probe.start()
  DispatchQueue.main.asyncAfter(deadline:.now()+15){fputs("Native focus probe timed out\n",stderr);exit(1)}
  withExtendedLifetime(probe){app.run()}
 }
}
