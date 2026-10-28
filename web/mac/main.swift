// Monomach для Mac — полноэкранная рабочая среда.
// Программа запускает встроенный сервер Monomach (Node.js) только для этого Mac (127.0.0.1, вход по секретному ключу)
// и показывает рабочий стол во встроенном окне WebKit на весь экран. Диск D: — домашняя папка пользователя.
import Cocoa
import WebKit

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, WKDownloadDelegate {
    var window: NSWindow!
    var web: WKWebView!
    var server: Process?
    var port = 0
    var quitting = false
    let token = (UUID().uuidString + UUID().uuidString).replacingOccurrences(of: "-", with: "")
    lazy var support: URL = {
        let u = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Monomach")
        try? FileManager.default.createDirectory(at: u, withIntermediateDirectories: true)
        return u
    }()

    // MARK: запуск
    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()
        let frame = NSScreen.main?.frame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        window = NSWindow(contentRect: frame, styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView], backing: .buffered, defer: false)
        window.title = "Monomach"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.collectionBehavior = [.fullScreenPrimary, .managed]
        window.backgroundColor = NSColor(calibratedRed: 0.08, green: 0.09, blue: 0.14, alpha: 1)
        window.isReleasedWhenClosed = false

        let cfg = WKWebViewConfiguration()
        cfg.userContentController.add(self, name: "monomach")
        cfg.websiteDataStore = .default()
        cfg.preferences.javaScriptCanOpenWindowsAutomatically = true
        cfg.preferences.setValue(true, forKey: "developerExtrasEnabled")
        cfg.mediaTypesRequiringUserActionForPlayback = []
        web = WKWebView(frame: window.contentView!.bounds, configuration: cfg)
        web.autoresizingMask = [.width, .height]
        web.navigationDelegate = self
        web.uiDelegate = self
        web.allowsBackForwardNavigationGestures = false
        web.allowsMagnification = false
        if #available(macOS 13.3, *) { web.isInspectable = true }
        window.contentView!.addSubview(web)
        showMessage("Monomach", "Запуск рабочей среды…", spinner: true)
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { self.window.toggleFullScreen(nil) }
        startServer()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    // Перед выходом рабочий стол успевает сохранить последние изменения
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if quitting || server == nil { return .terminateNow }
        quitting = true
        web.evaluateJavaScript("try{FXWeb.flush()}catch(e){}") { _, _ in }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { NSApp.reply(toApplicationShouldTerminate: true) }
        return .terminateLater
    }

    func applicationWillTerminate(_ notification: Notification) {
        server?.terminationHandler = nil
        server?.terminate()
    }

    // MARK: сервер
    func freePort() -> Int {
        let s = socket(AF_INET, SOCK_STREAM, 0)
        defer { Darwin.close(s) }
        var addr = sockaddr_in()
        addr.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_addr.s_addr = inet_addr("127.0.0.1")
        addr.sin_port = 0
        var len = socklen_t(MemoryLayout<sockaddr_in>.size)
        _ = withUnsafeMutablePointer(to: &addr) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { Darwin.bind(s, $0, len) } }
        _ = withUnsafeMutablePointer(to: &addr) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { Darwin.getsockname(s, $0, &len) } }
        return Int(UInt16(bigEndian: addr.sin_port))
    }

    func startServer() {
        guard let res = Bundle.main.resourceURL else { return }
        port = freePort()
        let p = Process()
        p.executableURL = res.appendingPathComponent("node/node")
        p.arguments = ["--no-warnings=ExperimentalWarning", res.appendingPathComponent("app/web/server/index.js").path]
        var env = ProcessInfo.processInfo.environment
        env["LOCAL_MODE"] = "1"
        env["LOCAL_TOKEN"] = token
        env["LOCAL_HOME"] = NSHomeDirectory()
        env["LOCAL_USER"] = NSFullUserName().isEmpty ? NSUserName() : NSFullUserName()
        env["PORT"] = String(port)
        env["HOST"] = "127.0.0.1"
        env["DATA_DIR"] = support.path
        env["ASSETS_DIR"] = res.appendingPathComponent("app/assets").path
        env["TRUST_PROXY"] = "0"
        p.environment = env
        let logURL = support.appendingPathComponent("server.log")
        FileManager.default.createFile(atPath: logURL.path, contents: nil)
        if let h = try? FileHandle(forWritingTo: logURL) { p.standardOutput = h; p.standardError = h }
        p.terminationHandler = { [weak self] proc in
            DispatchQueue.main.async { self?.serverStopped(proc.terminationStatus) }
        }
        do { try p.run(); server = p } catch {
            showMessage("Не удалось запустить Monomach", error.localizedDescription, spinner: false)
            return
        }
        waitReady(attempt: 0)
    }

    func waitReady(attempt: Int) {
        let url = URL(string: "http://127.0.0.1:\(port)/healthz")!
        var req = URLRequest(url: url)
        req.timeoutInterval = 1
        URLSession.shared.dataTask(with: req) { [weak self] _, resp, _ in
            DispatchQueue.main.async {
                guard let self = self else { return }
                if (resp as? HTTPURLResponse)?.statusCode == 200 {
                    self.web.load(URLRequest(url: URL(string: "http://127.0.0.1:\(self.port)/auth?t=\(self.token)")!))
                } else if attempt < 150 {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { self.waitReady(attempt: attempt + 1) }
                } else {
                    self.showMessage("Monomach не отвечает", "Подробности в файле ~/Library/Application Support/Monomach/server.log", spinner: false)
                }
            }
        }.resume()
    }

    func serverStopped(_ status: Int32) {
        server = nil
        if quitting { return }
        showMessage("Рабочая среда остановилась", "Код \(status). Подробности: ~/Library/Application Support/Monomach/server.log", spinner: false, restart: true)
    }

    @objc func restartServer() {
        showMessage("Monomach", "Перезапуск…", spinner: true)
        startServer()
    }

    func showMessage(_ title: String, _ text: String, spinner: Bool, restart: Bool = false) {
        let esc = { (s: String) in s.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;") }
        let html = """
        <!doctype html><meta charset="utf-8"><style>
        html,body{margin:0;height:100%;background:linear-gradient(160deg,#141826,#22283d 60%,#2b2342);color:#eef0f6;font:15px -apple-system,system-ui,sans-serif;display:grid;place-items:center}
        .b{text-align:center;max-width:520px;padding:24px}.t{font-size:28px;font-weight:600;margin:18px 0 8px}.m{opacity:.75;line-height:1.5}
        .s{width:34px;height:34px;margin:0 auto;border:3px solid rgba(255,255,255,.2);border-top-color:#7c6cff;border-radius:50%;animation:r 1s linear infinite}@keyframes r{to{transform:rotate(360deg)}}
        a{display:inline-block;margin-top:18px;padding:9px 18px;border-radius:9px;background:#6a5cff;color:#fff;text-decoration:none}
        </style><div class="b">\(spinner ? "<div class=s></div>" : "")<div class="t">\(esc(title))</div><div class="m">\(esc(text))</div>\(restart ? "<a href=\"monomach://restart\">Перезапустить</a>" : "")</div>
        """
        web.loadHTMLString(html, baseURL: nil)
    }

    // MARK: сообщения от рабочего стола
    func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let m = message.body as? [String: Any], let cmd = m["cmd"] as? String else { return }
        switch cmd {
        case "quit": NSApp.terminate(nil)
        case "openUrl": if let s = m["url"] as? String, let u = URL(string: s) { NSWorkspace.shared.open(u) }
        case "fullscreen": window.toggleFullScreen(nil)
        default: break
        }
    }

    // MARK: навигация
    func isLocal(_ url: URL?) -> Bool { url?.host == "127.0.0.1" || url?.scheme == "about" || url?.scheme == "blob" || url?.scheme == "data" }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if action.request.url?.scheme == "monomach" { decisionHandler(.cancel); restartServer(); return }
        if action.shouldPerformDownload { decisionHandler(.download); return }
        // ссылки на внешние сайты в главном окне открываются в обычном браузере Mac
        if action.targetFrame?.isMainFrame ?? true, !isLocal(action.request.url), action.request.url != nil {
            if let u = action.request.url, ["http", "https", "mailto", "tel"].contains(u.scheme ?? "") { NSWorkspace.shared.open(u) }
            decisionHandler(.cancel); return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        let disp = (response.response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Disposition") ?? ""
        if disp.lowercased().hasPrefix("attachment") || !response.canShowMIMEType { decisionHandler(.download); return }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        if server != nil { webView.load(URLRequest(url: URL(string: "http://127.0.0.1:\(port)/auth?t=\(token)")!)) }
    }

    // window.open: внешние адреса — в браузере Mac
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let u = action.request.url {
            if isLocal(u) { webView.load(action.request) } else { NSWorkspace.shared.open(u) }
        }
        return nil
    }

    // Загрузка файлов с Mac (кнопка «Загрузить», выбор файлов в программах)
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let p = NSOpenPanel()
        p.allowsMultipleSelection = parameters.allowsMultipleSelection
        p.canChooseDirectories = parameters.allowsDirectories
        p.canChooseFiles = true
        p.beginSheetModal(for: window) { r in completionHandler(r == .OK ? p.urls : nil) }
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let a = NSAlert(); a.messageText = "Monomach"; a.informativeText = message
        a.beginSheetModal(for: window) { _ in completionHandler() }
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let a = NSAlert(); a.messageText = "Monomach"; a.informativeText = message
        a.addButton(withTitle: "OK"); a.addButton(withTitle: "Отмена")
        a.beginSheetModal(for: window) { r in completionHandler(r == .alertFirstButtonReturn) }
    }

    // MARK: загрузки → папка «Загрузки»
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let dir = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask)[0]
        let ext = (suggestedFilename as NSString).pathExtension, base = (suggestedFilename as NSString).deletingPathExtension
        var url = dir.appendingPathComponent(suggestedFilename)
        var i = 2
        while FileManager.default.fileExists(atPath: url.path) {
            url = dir.appendingPathComponent(ext.isEmpty ? "\(base) (\(i))" : "\(base) (\(i)).\(ext)"); i += 1
        }
        completionHandler(url)
    }
    func downloadDidFinish(_ download: WKDownload) {
        web.evaluateJavaScript("try{FXHost.emit('toast',{msg:'Файл сохранён в папку «Загрузки»'})}catch(e){}") { _, _ in }
    }

    // MARK: меню (сочетания ⌘C, ⌘V, ⌘Q работают и в полноэкранном режиме)
    func buildMenu() {
        let main = NSMenu()
        func sub(_ title: String, _ items: [NSMenuItem]) { let m = NSMenu(title: title); items.forEach(m.addItem); let it = NSMenuItem(); it.submenu = m; main.addItem(it) }
        func item(_ t: String, _ sel: Selector?, _ key: String, _ mods: NSEvent.ModifierFlags = .command) -> NSMenuItem {
            let i = NSMenuItem(title: t, action: sel, keyEquivalent: key); i.keyEquivalentModifierMask = mods; return i
        }
        sub("Monomach", [
            item("О программе Monomach", #selector(NSApplication.orderFrontStandardAboutPanel(_:)), ""),
            .separator(),
            item("Скрыть Monomach", #selector(NSApplication.hide(_:)), "h"),
            .separator(),
            item("Выйти из Monomach", #selector(NSApplication.terminate(_:)), "q"),
        ])
        sub("Правка", [
            item("Отменить", Selector(("undo:")), "z"),
            item("Повторить", Selector(("redo:")), "z", [.command, .shift]),
            .separator(),
            item("Вырезать", #selector(NSText.cut(_:)), "x"),
            item("Копировать", #selector(NSText.copy(_:)), "c"),
            item("Вставить", #selector(NSText.paste(_:)), "v"),
            item("Выбрать все", #selector(NSText.selectAll(_:)), "a"),
        ])
        let reload = item("Перезагрузить рабочий стол", #selector(reloadDesk), "r"); reload.target = self
        sub("Вид", [
            item("Полноэкранный режим", #selector(NSWindow.toggleFullScreen(_:)), "f", [.command, .control]),
            reload,
        ])
        sub("Окно", [item("Свернуть", #selector(NSWindow.miniaturize(_:)), "m")])
        NSApp.mainMenu = main
    }
    @objc func reloadDesk() { if server != nil { web.load(URLRequest(url: URL(string: "http://127.0.0.1:\(port)/auth?t=\(token)")!)) } }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
