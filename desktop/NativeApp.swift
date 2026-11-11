import Cocoa
import WebKit
import MediaPlayer
import UniformTypeIdentifiers
import Vision

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, WKUIDelegate, WKNavigationDelegate, WKScriptMessageHandler {
    var window: NSWindow!
    var web: WKWebView!
    var service: Process?
    var loading: NSTextField!
    var attempts = 0
    var browserWindows: [NSWindow] = []
    var webViews: [WKWebView] = []
    var adRules: WKContentRuleList?
    var pendingFiles: [URL] = []
    var terminating = false
    var ready = false
    var captionScanBusy = false
    var gestureMonitor: Any?
    var gestureX: CGFloat = 0
    var gestureY: CGFloat = 0
    var gestureFired = false
    let home = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/Immersed Mac")
    var blockAds: Bool { UserDefaults.standard.object(forKey: "blockAds") as? Bool ?? true }

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()
        setupPlaybackCommands()
        gestureMonitor = NSEvent.addLocalMonitorForEvents(matching: [.scrollWheel, .swipe]) { [weak self] event in
            guard let self, event.window === self.window,
                  self.web?.url?.host == "127.0.0.1" else { return event }
            if event.type == .swipe {
                guard abs(event.deltaX) > abs(event.deltaY) else { return event }
                self.web.evaluateJavaScript("window.immersedTrackpad?.(\(event.deltaX < 0 ? 1 : -1))", completionHandler: nil)
                return nil
            }
            guard event.hasPreciseScrollingDeltas, event.momentumPhase.isEmpty else { return event }
            if event.phase.contains(.began) { self.gestureX = 0; self.gestureY = 0; self.gestureFired = false }
            self.gestureX += event.scrollingDeltaX; self.gestureY += event.scrollingDeltaY
            let horizontal = abs(self.gestureX) > 18 && abs(self.gestureX) > abs(self.gestureY) * 1.5
            if horizontal && !self.gestureFired && abs(self.gestureX) >= 75 {
                self.gestureFired = true
                self.web.evaluateJavaScript("window.immersedTrackpad?.(\(self.gestureX < 0 ? 1 : -1))", completionHandler: nil)
            }
            return horizontal ? nil : event
        }
        web = makeWebView()
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1320, height: 860), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "immersed."
        window.styleMask.insert(.fullSizeContentView)
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.backgroundColor = NSColor(calibratedRed: 0.025, green: 0.05, blue: 0.035, alpha: 1)
        window.isMovableByWindowBackground = true
        window.collectionBehavior.insert(.fullScreenPrimary)
        window.isReleasedWhenClosed = false
        window.minSize = NSSize(width: 800, height: 600)
        window.contentView = web
        window.center()
        window.setFrameAutosaveName("immersed.main")
        window.makeKeyAndOrderFront(nil)
        loading = NSTextField(labelWithString: "Preparing your local study library…")
        loading.frame = NSRect(x: 30, y: 30, width: 1000, height: 60)
        web.addSubview(loading)
        NSApp.activate(ignoringOtherApps: true)
        let rules = #"[{"trigger":{"url-filter":"^https?://([^/]+\\.)?(doubleclick\\.net|googlesyndication\\.com|googleadservices\\.com)/"},"action":{"type":"block"}},{"trigger":{"url-filter":"^https?://[^/]*youtube\\.com/(pagead/|api/stats/ads)"},"action":{"type":"block"}}]"#
        WKContentRuleListStore.default().compileContentRuleList(forIdentifier: "immersed.ads.v1", encodedContentRuleList: rules) { [weak self] list, error in
            guard let self else { return }
            self.adRules = list
            self.updateAdRules()
            self.connect()
        }
    }
    func buildMenu() {
        let menu = NSMenu()
        func submenu(_ title: String) -> NSMenu {
            let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
            let sub = NSMenu(title: title); item.submenu = sub; menu.addItem(item); return sub
        }
        func item(_ sub: NSMenu, _ title: String, _ action: Selector, _ key: String) {
            sub.addItem(withTitle: title, action: action, keyEquivalent: key).target = self
        }
        let appMenu = submenu("immersed.")
        item(appMenu, "Settings…", #selector(settings), ",")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit immersed.", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        let file = submenu("File")
        item(file, "Open video or audiobook…", #selector(openMedia), "o")
        item(file, "Library", #selector(library), "2")
        item(file, "Close window", #selector(closeStudy), "w")
        let edit = submenu("Edit")
        for (title, action, key) in [("Undo", "undo:", "z"), ("Copy", "copy:", "c"), ("Paste", "paste:", "v"), ("Cut", "cut:", "x"), ("Select All", "selectAll:", "a")] {
            edit.addItem(withTitle: title, action: Selector(action), keyEquivalent: key)
        }
        let view = submenu("View")
        item(view, "Search", #selector(focusSearch), "l")
        item(view, "Study window", #selector(showStudy), "1")
        item(view, "Saved words", #selector(words), "3")
        item(view, "Browse YouTube (unfiltered)", #selector(browseYouTube), "b")
        let fullscreen = view.addItem(withTitle: "Toggle Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        fullscreen.keyEquivalentModifierMask = [.control, .command]
        NSApp.mainMenu = menu
    }
    func makeWebView(configuration: WKWebViewConfiguration? = nil) -> WKWebView {
        let config = configuration ?? WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.mediaTypesRequiringUserActionForPlayback = []
        config.preferences.isElementFullscreenEnabled = true
        config.userContentController.add(self, name: "immersed")
        if blockAds, let rules = adRules { config.userContentController.add(rules) }
        let view = WKWebView(frame: .zero, configuration: config)
        view.uiDelegate = self; view.navigationDelegate = self
        view.allowsBackForwardNavigationGestures = false
        webViews.append(view)
        return view
    }
    func updateAdRules() {
        for view in webViews {
            view.configuration.userContentController.removeAllContentRuleLists()
            if blockAds, let rules = adRules { view.configuration.userContentController.add(rules) }
        }
    }
    @objc func closeStudy() { window.close() }
    @objc func showStudy() { window.deminiaturize(nil); window.makeKeyAndOrderFront(nil); if !ready { connect() } }
    @objc func focusSearch() { showStudy(); web.evaluateJavaScript("document.getElementById('query')?.focus()", completionHandler: nil) }
    @objc func settings() { showStudy(); web.evaluateJavaScript("window.showSettings?.()", completionHandler: nil) }
    @objc func library() { showStudy(); web.evaluateJavaScript("window.showLibrary?.()", completionHandler: nil) }
    @objc func words() { showStudy(); web.evaluateJavaScript("window.showWords?.()", completionHandler: nil) }
    @objc func openMedia() {
        let panel = NSOpenPanel()
        panel.title = "Open Japanese video or audiobook"
        panel.allowedContentTypes = ["mp4", "m4v", "mov", "m4b", "m4a", "mp3", "wav", "aac", "flac", "ogg", "webm"].compactMap { UTType(filenameExtension: $0) }
        panel.allowsMultipleSelection = false
        panel.beginSheetModal(for: window) { [weak self] response in
            guard response == .OK, let url = panel.url else { return }
            self?.importMedia(url)
        }
    }
    func application(_ application: NSApplication, open urls: [URL]) {
        for url in urls { if ready { importMedia(url) } else { pendingFiles.append(url) } }
    }
    func importMedia(_ file: URL) {
        guard ready else { pendingFiles.append(file); return }
        showStudy()
        var components = URLComponents(string: "http://127.0.0.1:4765/api/desktop/import")!
        components.queryItems = [URLQueryItem(name: "name", value: file.lastPathComponent)]
        var request = URLRequest(url: components.url!)
        request.httpMethod = "POST"
        request.setValue("1", forHTTPHeaderField: "X-Immersed-Request")
        request.timeoutInterval = 3600
        web.evaluateJavaScript("document.getElementById('status').textContent = 'Importing local media…'", completionHandler: nil)
        URLSession.shared.uploadTask(with: request, fromFile: file) { [weak self] data, response, error in
            Task { @MainActor in
                guard let self else { return }
                do {
                    if let error { throw error }
                    guard let data, let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw NSError(domain: "immersed", code: 1, userInfo: [NSLocalizedDescriptionKey: "No import response was received."]) }
                    guard (response as? HTTPURLResponse)?.statusCode == 201, let id = object["id"] as? String else { throw NSError(domain: "immersed", code: 2, userInfo: [NSLocalizedDescriptionKey: object["error"] as? String ?? "This file could not be imported."]) }
                    let encoded = String(data: try JSONSerialization.data(withJSONObject: [id]), encoding: .utf8)!
                    self.web.evaluateJavaScript("window.openLocalMedia?.(...\(encoded))", completionHandler: nil)
                } catch { self.alert("Import failed", error.localizedDescription) }
            }
        }.resume()
    }
    func alert(_ title: String, _ detail: String) {
        let alert = NSAlert(); alert.messageText = title; alert.informativeText = detail; alert.beginSheetModal(for: window)
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, message.webView === web,
              message.frameInfo.request.url?.host == "127.0.0.1",
              let object = message.body as? [String: Any], let action = object["action"] as? String else { return }
        if action == "blockAds", let enabled = object["enabled"] as? Bool {
            UserDefaults.standard.set(enabled, forKey: "blockAds"); updateAdRules()
        } else if action == "captionFrame" { scanVideoCaption(object)
        } else if action == "playback" {
            let position = object["position"] as? Double ?? 0
            let duration = object["duration"] as? Double ?? 0
            let playing = object["playing"] as? Bool ?? false
            MPNowPlayingInfoCenter.default().nowPlayingInfo = [
                MPMediaItemPropertyTitle: object["title"] as? String ?? "immersed.",
                MPMediaItemPropertyPlaybackDuration: duration.isFinite ? duration : 0,
                MPNowPlayingInfoPropertyElapsedPlaybackTime: position,
                MPNowPlayingInfoPropertyPlaybackRate: playing ? (object["rate"] as? Double ?? 1) : 0
            ]
            MPNowPlayingInfoCenter.default().playbackState = playing ? .playing : .paused
        } else if action == "openMedia" { openMedia() }
        else if action == "exportSettings", let text = object["text"] as? String, text.utf8.count <= 5 * 1024 * 1024 {
            let panel = NSSavePanel(); panel.nameFieldStringValue = "immersed-settings.json"; panel.allowedContentTypes = [.json]
            panel.beginSheetModal(for: window) { [weak self] response in
                guard response == .OK, let url = panel.url else { return }
                do { try text.write(to: url, atomically: true, encoding: .utf8) }
                catch { self?.alert("Backup failed", error.localizedDescription) }
            }
        }
    }
    func scanVideoCaption(_ object: [String: Any]) {
        guard NSApp.isActive, window.isVisible, !captionScanBusy,
              let key = object["key"] as? String, key.count <= 200,
              let id = object["videoId"] as? String, id.range(of: "^[A-Za-z0-9_-]{11}$", options: .regularExpression) != nil,
              let at = object["at"] as? Double, at.isFinite, at >= 0, at <= 86400 else { return }
        captionScanBusy = true
        var components = URLComponents(string: "http://127.0.0.1:4765/api/desktop/caption-frames")!
        components.queryItems = [URLQueryItem(name: "videoId", value: id), URLQueryItem(name: "at", value: String(at))]
        var query = URLRequest(url: components.url!); query.timeoutInterval = 40
        URLSession.shared.dataTask(with: query) { [weak self] data, _, _ in
            var observations: [[String]] = []
            if let data, let result = try? JSONSerialization.jsonObject(with: data) as? [String: Any], let frames = result["frames"] as? [String] {
                for encoded in frames.prefix(2) {
                    guard let imageData = Data(base64Encoded: encoded), imageData.count < 2_000_000,
                          let image = NSImage(data: imageData), let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else { continue }
                    let request = VNRecognizeTextRequest()
                    request.recognitionLevel = .accurate
                    request.recognitionLanguages = ["ja-JP", "en-US"]
                    request.usesLanguageCorrection = true
                    request.minimumTextHeight = 0.025
                    request.regionOfInterest = CGRect(x: 0, y: 0, width: 1, height: 0.4)
                    do { try VNImageRequestHandler(cgImage: cg).perform([request]) } catch { }
                    let lines = (request.results ?? []).sorted { $0.boundingBox.midY > $1.boundingBox.midY }.compactMap { observation -> String? in
                        guard let candidate = observation.topCandidates(1).first, candidate.confidence >= 0.87,
                              candidate.string.range(of: "[ぁ-ゖァ-ヺ一-龯]", options: .regularExpression) != nil else { return nil }
                        return String(candidate.string.prefix(300))
                    }
                    observations.append(lines)
                }
            }
            if observations.isEmpty { observations = [[]] }
            let captured = observations
            Task { @MainActor in
                guard let self else { return }
                self.captionScanBusy = false
                for lines in captured {
                    guard let data = try? JSONSerialization.data(withJSONObject: [key, lines]), let json = String(data: data, encoding: .utf8) else { continue }
                    self.web.evaluateJavaScript("window.immersedVideoText?.(...\(json))", completionHandler: nil)
                }
            }
        }.resume()
    }
    @objc func browseYouTube() { openBrowser(URL(string: "https://www.youtube.com/?hl=ja&gl=JP")!) }
    func openBrowser(_ url: URL) {
        if let existing = browserWindows.first {
            (existing.contentView as? WKWebView)?.load(URLRequest(url: url))
            existing.makeKeyAndOrderFront(nil); return
        }
        let view = makeWebView()
        let browser = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1100, height: 760), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        browser.isReleasedWhenClosed = false
        browser.title = "YouTube · immersed."; browser.contentView = view; browser.center(); browser.makeKeyAndOrderFront(nil)
        browserWindows.append(browser)
        view.load(URLRequest(url: url))
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if url.host == "accounts.google.com" {
            decisionHandler(.cancel)
            alert("Google sign-in is unavailable in the embedded player", "Google blocks sign-in in embedded web views. Public YouTube browsing, search, and local media remain available. Your browser cookies are not imported.")
            return
        }
        if webView === web, navigationAction.targetFrame?.isMainFrame == true, url.host != "127.0.0.1", ["http","https"].contains(url.scheme ?? "") {
            decisionHandler(.cancel); openBrowser(url); return
        }
        if webView !== web, navigationAction.targetFrame?.isMainFrame == true,
           ["www.youtube.com", "m.youtube.com", "youtube.com"].contains(url.host ?? ""),
           let id = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "v" })?.value,
           id.range(of: "^[A-Za-z0-9_-]{11}$", options: .regularExpression) != nil {
            decisionHandler(.cancel); showStudy(); web.evaluateJavaScript("window.loadVideo?.('\(id)')", completionHandler: nil); return
        }
        guard ["http", "https", "about", "blob"].contains(url.scheme ?? "") else { decisionHandler(.cancel); return }
        decisionHandler(.allow)
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if webView === web, webView.url?.host == "127.0.0.1" {
            ready = true
            let files = pendingFiles; pendingFiles.removeAll()
            for file in files { importMedia(file) }
        }
    }
    func connect() {
        guard !ready else { return }
        let url = URL(string: "http://127.0.0.1:4765/")!
        var request = URLRequest(url: url); request.timeoutInterval = 1
        URLSession.shared.dataTask(with: request) { [weak self] _, response, error in
            Task { @MainActor in
                guard let self else { return }
                if error == nil, (response as? HTTPURLResponse)?.statusCode == 200 {
                    self.loading.removeFromSuperview(); self.web.load(URLRequest(url: url)); return
                }
                if let service = self.service, !service.isRunning {
                    self.loading.stringValue = "Local setup stopped. See Library/Application Support/Immersed Mac/startup.log for details."
                    return
                }
                if self.service == nil { self.startService() }
                self.attempts += 1
                if self.attempts < 900 { DispatchQueue.main.asyncAfter(deadline: .now() + 1) { self.connect() } }
                else { self.loading.stringValue = "Startup is taking longer than expected. Check the startup log in Application Support/Immersed Mac." }
            }
        }.resume()
    }
    func startService() {
        guard let launcher = ["/opt/homebrew/bin/immersed-mac", "/usr/local/bin/immersed-mac"].first(where: { FileManager.default.isExecutableFile(atPath: $0) }) else {
            loading.stringValue = "Install with Homebrew: brew install --HEAD Somamill/immersed/immersed-mac"; attempts = 900; return
        }
        let process = Process(); process.executableURL = URL(fileURLWithPath: launcher); process.arguments = ["--service"]
        do {
            try FileManager.default.createDirectory(at: home, withIntermediateDirectories: true)
            let log = home.appendingPathComponent("startup.log")
            FileManager.default.createFile(atPath: log.path, contents: nil)
            let handle = try FileHandle(forWritingTo: log)
            process.standardOutput = handle; process.standardError = handle
            try process.run(); service = process
        } catch { loading.stringValue = error.localizedDescription; attempts = 900 }
    }
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel(); panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.beginSheetModal(for: window) { response in completionHandler(response == .OK ? panel.urls : nil) }
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url { if webView === web { openBrowser(url) } else { webView.load(URLRequest(url: url)) } }
        return nil
    }
    func setupPlaybackCommands() {
        let commands = MPRemoteCommandCenter.shared()
        func command(_ command: MPRemoteCommand, _ action: String) {
            command.addTarget { [weak self] _ in
                Task { @MainActor in self?.web.evaluateJavaScript("window.immersedPlayback?.('\(action)')", completionHandler: nil) }
                return .success
            }
        }
        command(commands.playCommand, "play")
        command(commands.pauseCommand, "pause")
        command(commands.togglePlayPauseCommand, "toggle")
        commands.skipForwardCommand.preferredIntervals = [15]
        commands.skipBackwardCommand.preferredIntervals = [15]
        for (command, offset) in [(commands.skipForwardCommand, 15), (commands.skipBackwardCommand, -15)] {
            command.addTarget { [weak self] _ in
                Task { @MainActor in self?.web.evaluateJavaScript("window.immersedPlayback?.('skip',\(offset))", completionHandler: nil) }
                return .success
            }
        }
        commands.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let event = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            let position = event.positionTime
            Task { @MainActor in self?.web.evaluateJavaScript("window.immersedPlayback?.('seek',\(position))", completionHandler: nil) }
            return .success
        }
    }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { showStudy(); return true }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if terminating { return .terminateNow }
        terminating = true
        var replied = false
        let finish = { if !replied { replied = true; sender.reply(toApplicationShouldTerminate: true) } }
        web.callAsyncJavaScript("return await window.flushPlayback?.()", arguments: [:], in: nil, in: .page) { _ in finish() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2, execute: finish)
        return .terminateLater
    }
    func applicationWillTerminate(_ notification: Notification) { if service?.isRunning == true { service?.terminate() } }
}
@main
struct ImmersedMain {
    @MainActor static func main() {
        let app = NSApplication.shared, delegate = AppDelegate()
        app.delegate = delegate; app.setActivationPolicy(.regular); app.run()
    }
}
