import Cocoa
import WebKit

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, WKUIDelegate, WKNavigationDelegate {
    var window: NSWindow!
    var web: WKWebView!
    var service: Process?
    var loading: NSTextField!
    var attempts = 0
    func applicationDidFinishLaunching(_ notification: Notification) {
        let menu = NSMenu()
        let appItem = NSMenuItem(); menu.addItem(appItem)
        let appMenu = NSMenu(); appItem.submenu = appMenu
        appMenu.addItem(withTitle: "Quit immersed.", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        let edit = NSMenuItem(); menu.addItem(edit); edit.submenu = NSMenu(title: "Edit")
        for (title, action, key) in [("Copy", "copy:", "c"), ("Paste", "paste:", "v"), ("Cut", "cut:", "x"), ("Select All", "selectAll:", "a")] {
            edit.submenu?.addItem(withTitle: title, action: Selector(action), keyEquivalent: key)
        }
        let view = NSMenuItem(); menu.addItem(view); view.submenu = NSMenu(title: "View")
        view.submenu?.addItem(withTitle: "Search", action: #selector(focusSearch), keyEquivalent: "l").target = self
        view.submenu?.addItem(withTitle: "Study window", action: #selector(showStudy), keyEquivalent: "1").target = self
        NSApp.mainMenu = menu
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.mediaTypesRequiringUserActionForPlayback = []
        web = WKWebView(frame: .zero, configuration: config)
        web.uiDelegate = self; web.navigationDelegate = self
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1320, height: 860), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "immersed."; window.minSize = NSSize(width: 800, height: 600)
        window.contentView = web; window.center(); window.makeKeyAndOrderFront(nil)
        loading = NSTextField(labelWithString: "Preparing immersed. — first launch may install local speech dependencies…")
        loading.frame = NSRect(x: 30, y: 30, width: 1000, height: 50); web.addSubview(loading)
        NSApp.activate(ignoringOtherApps: true)
        connect()
    }
    @objc func showStudy() { web.load(URLRequest(url: URL(string: "http://127.0.0.1:4765/")!)) }
    @objc func focusSearch() { web.evaluateJavaScript("document.getElementById('query')?.focus()", completionHandler: nil) }
    func connect() {
        let url = URL(string: "http://127.0.0.1:4765/")!
        var request = URLRequest(url: url); request.timeoutInterval = 1
        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            Task { @MainActor in
                guard let self else { return }
                if error == nil, (response as? HTTPURLResponse)?.statusCode == 200 {
                    self.loading.removeFromSuperview(); self.web.load(URLRequest(url: url)); return
                }
                if self.service == nil { self.startService() }
                self.attempts += 1
                if self.attempts < 900 { DispatchQueue.main.asyncAfter(deadline: .now() + 1) { self.connect() } }
                else { self.loading.stringValue = "Startup did not finish. Run immersed-mac --service in Terminal to inspect the installation." }
            }
        }.resume()
    }
    func startService() {
        guard let launcher = ["/opt/homebrew/bin/immersed-mac", "/usr/local/bin/immersed-mac"].first(where: { FileManager.default.isExecutableFile(atPath: $0) }) else {
            loading.stringValue = "Install with Homebrew: brew install --HEAD Somamill/immersed/immersed-mac"; attempts = 900; return
        }
        let process = Process(); process.executableURL = URL(fileURLWithPath: launcher); process.arguments = ["--service"]
        do { try process.run(); service = process } catch { loading.stringValue = error.localizedDescription; attempts = 900 }
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url { webView.load(URLRequest(url: url)) }
        return nil
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationWillTerminate(_ notification: Notification) { if service?.isRunning == true { service?.terminate() } }
}
@main
struct ImmersedMain {
    @MainActor static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        app.setActivationPolicy(.regular)
        app.run()
    }
}
