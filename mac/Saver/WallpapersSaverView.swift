import ScreenSaver
import WebKit

/// The Wallpapers screen saver (SPEC §10.21, M2). Apple's `legacyScreenSaver`
/// host loads this view once per display. It runs the same web/ the app does,
/// seeded from the settings the app mirrors (`SaverConfig`), and looks after
/// itself: the host has bugs that blank or stall web content, so a watchdog
/// reloads a stalled page and, failing that, falls back to a clock on black
/// rather than leave the screen broken.
@objc(WallpapersSaverView)
final class WallpapersSaverView: ScreenSaverView, WKNavigationDelegate {
    enum Mode: String { case live, fallback }

    /// Wallpapers already on a display, so Random doesn't repeat one across
    /// displays. One host process holds every display's view.
    private static var onScreen: [ObjectIdentifier: String] = [:]
    private static let scheme = AssetScheme(root:
        URL(fileURLWithPath: Bundle(for: WallpapersSaverView.self).bundlePath).appendingPathComponent("Contents/Resources/web", isDirectory: true))

    private var config = SaverConfig.load()
    private var web: WKWebView?
    private var clock: ClockOverlay?
    private var wallpaper: String?
    private(set) var mode = Mode.live
    private var running = false
    private var timers: [Timer] = []
    private var lastFrames = -1, stalls = 0, recoveries = 0
    private var forceStall = false
    private var probe = "null"

    // MARK: Setup

    override init?(frame: NSRect, isPreview: Bool) {
        super.init(frame: frame, isPreview: isPreview)
        animationTimeInterval = 1   // the page drives itself; this only has to exist
        wantsLayer = true
        layer?.backgroundColor = NSColor.black.cgColor
        log("init \(Int(frame.width))×\(Int(frame.height)) preview=\(isPreview) choice=\(config.choice)")
        clock = ClockOverlay(frame: .zero)
        addSubview(clock!)
        pickWallpaper()
        mount()
        let distributed = DistributedNotificationCenter.default()
        distributed.addObserver(forName: .init("com.apple.screensaver.didstop"), object: nil, queue: .main) { [weak self] _ in self?.pause() }
        distributed.addObserver(forName: .init("com.apple.screensaver.didstart"), object: nil, queue: .main) { [weak self] _ in self?.resume() }
    }

    required init?(coder: NSCoder) { fatalError() }

    deinit { Self.onScreen[ObjectIdentifier(self)] = nil }

    private func pickWallpaper() {
        let others = Set(Self.onScreen.filter { $0.key != ObjectIdentifier(self) }.values)
        wallpaper = config.pick(avoiding: others)
        Self.onScreen[ObjectIdentifier(self)] = wallpaper ?? "current"
    }

    private func mount() {
        web?.removeFromSuperview()
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.setURLSchemeHandler(Self.scheme, forURLScheme: AssetScheme.scheme)
        var seed = config.storage
        seed["wp:hinted"] = "true"
        let seedJSON = (try? JSONSerialization.data(withJSONObject: seed)).map { String(decoding: $0, as: UTF8.self) } ?? "{}"
        // Seed the page's storage before any of its scripts run, and count
        // frames for the watchdog.
        configuration.userContentController.addUserScript(WKUserScript(source: """
            try { const seed = \(seedJSON); for (const key in seed) localStorage.setItem(key, seed[key]); } catch (e) {}
            window.__raf = 0; (function tick() { window.__raf++; requestAnimationFrame(tick); })();
            """, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let view = WKWebView(frame: bounds, configuration: configuration)
        view.autoresizingMask = [.width, .height]
        view.navigationDelegate = self
        view.underPageBackgroundColor = .black
        // The host's window reports "not visible", so WebKit hides the page and
        // stops its frames (spike M0.2). Turning occlusion detection off keeps
        // it running; it's private, so a missing selector just means no change.
        let occlusion = NSSelectorFromString("_setWindowOcclusionDetectionEnabled:")
        if view.responds(to: occlusion) { view.perform(occlusion, with: nil) }
        addSubview(view, positioned: .below, relativeTo: clock)
        web = view
        lastFrames = -1
        var query = ["host": "mac-saver"]
        if let wallpaper { query["w"] = wallpaper }
        var components = URLComponents(string: "wp://app/index.html")!
        components.queryItems = query.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) }
        view.load(URLRequest(url: components.url!))
        log("loading \(components.url!.absoluteString)")
    }

    // MARK: Running

    override func startAnimation() {
        super.startAnimation()
        log("startAnimation")
        resume()
    }

    override func stopAnimation() {
        super.stopAnimation()
        log("stopAnimation")
        pause()
    }

    /// Tahoe's host can leave a saver running after it ends, so pausing the
    /// page here (not only in the host's say-so) is what stops the CPU use.
    private func resume() {
        guard !running else { return }
        running = true
        stalls = 0
        pushPower(hidden: false)
        timers = [
            every(4) { [weak self] in self?.watchdog() },
            every(60) { [weak self] in self?.pushPower(hidden: false) },
        ]
        if case .random = config.choice, !isPreview {
            timers.append(every(Double(config.rotateMinutes) * 60) { [weak self] in self?.rotate() })
        }
        if config.clock, !isPreview || bounds.height > 200 { showClock(centered: mode == .fallback) }
    }

    private func pause() {
        guard running else { return }
        running = false
        timers.forEach { $0.invalidate() }
        timers = []
        clock?.stop()
        pushPower(hidden: true)
    }

    private func every(_ seconds: TimeInterval, _ block: @escaping () -> Void) -> Timer {
        let timer = Timer(timeInterval: seconds, repeats: true) { _ in block() }
        RunLoop.main.add(timer, forMode: .common)
        return timer
    }

    private func pushPower(hidden: Bool) {
        var state = PowerMonitor().json(windowVisible: !hidden, preview: isPreview)
        if hidden, state.hasPrefix("{") { state = state.replacingOccurrences(of: "\"hidden\":false", with: "\"hidden\":true") }
        web?.evaluateJavaScript("window.WP && WP.power && WP.power(\(state))", completionHandler: nil)
    }

    /// A different wallpaper, for Random: the page crossfades to it.
    private func rotate() {
        pickWallpaper()
        guard let wallpaper else { return }
        log("rotating to \(wallpaper)")
        web?.evaluateJavaScript("WP.player && WP.player.show(\(Self.quote(wallpaper)))", completionHandler: nil)
    }

    private func showClock(centered: Bool) {
        guard let clock else { return }
        clock.frame = NSRect(x: 0, y: 0, width: 1, height: 1)
        clock.start(centered: centered)
    }

    // MARK: Watchdog

    /// Frames that stop coming mean the host has stalled the page (or its
    /// process died). Reload once, rebuild the web view once, then fall back
    /// to a clock on black and try again a minute later.
    private func watchdog() {
        if forceStall { return stalled() }
        web?.evaluateJavaScript("window.__raf") { [weak self] result, _ in
            guard let self else { return }
            let frames = (result as? Int) ?? -1
            if frames > self.lastFrames {
                self.lastFrames = frames
                self.stalls = 0
                if self.mode == .fallback { self.leaveFallback() }
            } else {
                self.stalled()
            }
        }
    }

    private func stalled() {
        stalls += 1
        guard stalls >= 2 else { return }
        stalls = 0
        recoveries += 1
        log("stalled; recovery \(recoveries)")
        switch recoveries {
        case 1: web?.reload(); lastFrames = -1
        case 2: mount(); pushPower(hidden: false)
        default: enterFallback()
        }
    }

    private func enterFallback() {
        guard mode == .live else { return }
        mode = .fallback
        web?.isHidden = true
        showClock(centered: true)
        log("fallback: clock on black")
        // Try the page again in a minute; a host that recovers gets its wallpaper back.
        let retry = Timer(timeInterval: 60, repeats: false) { [weak self] _ in
            guard let self, self.mode == .fallback else { return }
            self.recoveries = 1
            self.web?.isHidden = false
            self.mount()
            self.pushPower(hidden: !self.running)
        }
        RunLoop.main.add(retry, forMode: .common)
    }

    private func leaveFallback() {
        mode = .live
        recoveries = 0
        web?.isHidden = false
        if !config.clock { clock?.stop(); clock?.isHidden = true }
        log("recovered")
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        log("web content process ended")
        stalls = 1
        stalled()
    }

    // MARK: The Options button

    override var hasConfigureSheet: Bool { true }

    override var configureSheet: NSWindow? {
        let panel = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 420, height: 150), styleMask: [.titled], backing: .buffered, defer: false)
        let text = NSTextField(wrappingLabelWithString: "Choose this screen saver's wallpaper, rotation and clock from the ✨ menu bar item of the Wallpapers app (Screen Saver).")
        text.frame = NSRect(x: 20, y: 60, width: 380, height: 70)
        let done = NSButton(title: "OK", target: self, action: #selector(closeSheet(_:)))
        done.frame = NSRect(x: 320, y: 16, width: 80, height: 30)
        done.keyEquivalent = "\r"
        panel.contentView?.addSubview(text)
        panel.contentView?.addSubview(done)
        return panel
    }

    @objc private func closeSheet(_ sender: NSButton) {
        guard let sheet = sender.window else { return }
        if let parent = sheet.sheetParent { parent.endSheet(sheet) } else { sheet.close() }
    }

    // MARK: Testing and support

    /// What the harness (make mac-saver-test) looks at.
    @objc func debugState() -> String {
        let state: [String: Any] = ["mode": mode.rawValue, "wallpaper": wallpaper ?? "current", "frames": max(lastFrames, 0),
                                    "running": running, "recoveries": recoveries, "clockVisible": !(clock?.isHidden ?? true) && clock?.superview != nil && (clock?.frame.width ?? 0) > 1,
                                    "probe": probe, "configurable": hasConfigureSheet]
        return String(decoding: (try? JSONSerialization.data(withJSONObject: state)) ?? Data(), as: UTF8.self)
    }

    /// Ask the page what it is showing; the answer arrives in `debugState`'s `probe`.
    @objc func debugProbe() {
        web?.evaluateJavaScript("""
            (() => { const frame = [...document.querySelectorAll('iframe.stage')].pop(); const doc = frame && frame.contentDocument;
                return JSON.stringify({ stage: frame ? frame.src : null, current: WP.store.get('wp:current'), canvas: !!(doc && doc.querySelector('canvas')) }); })()
            """) { [weak self] result, _ in self?.probe = (result as? String) ?? "null" }
    }

    /// Pretend the page stopped drawing for two watchdog checks, which is one recovery step.
    @objc func debugStall() -> String {
        forceStall = true
        watchdog()
        watchdog()
        forceStall = false
        return mode.rawValue
    }

    private static func quote(_ text: String) -> String {
        let data = (try? JSONSerialization.data(withJSONObject: [text])) ?? Data("[\"\"]".utf8)
        return String(String(decoding: data, as: UTF8.self).dropFirst().dropLast())
    }

    /// A small log in the saver's own sandbox (`make mac-saver-log` shows it), capped.
    private func log(_ message: String) {
        let path = ProcessInfo.processInfo.environment["WP_SAVER_LOG"] ?? NSHomeDirectory() + "/wallpapers-saver.log"
        let line = "\(ISO8601DateFormatter().string(from: Date())) pid=\(getpid()) \(message)\n"
        if let size = (try? FileManager.default.attributesOfItem(atPath: path))?[.size] as? Int, size > 65_536 {
            try? FileManager.default.removeItem(atPath: path)
        }
        if let handle = FileHandle(forWritingAtPath: path) {
            handle.seekToEndOfFile()
            handle.write(Data(line.utf8))
            handle.closeFile()
        } else {
            try? line.write(toFile: path, atomically: true, encoding: .utf8)
        }
    }
}
