import Cocoa
import WebKit

/// A window that is wallpaper: it can't take focus, ignores the mouse, and
/// never shows in Mission Control, Cmd-Tab or the window menu.
final class DesktopWindow: NSWindow {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

/// One display's wallpaper: a window and the web view in it.
@MainActor
final class DesktopScreen {
    let displayID: CGDirectDisplayID
    let window: DesktopWindow
    let web: WKWebView
    var lastPower = ""
    var visible: Bool { window.occlusionState.contains(.visible) }

    init(screen: NSScreen, displayID: CGDirectDisplayID, web: WKWebView) {
        self.displayID = displayID
        self.web = web
        window = DesktopWindow(contentRect: screen.frame, styleMask: .borderless, backing: .buffered, defer: false, screen: screen)
        // Just above Apple's wallpaper picture and below Finder's icon window
        // (SPEC §10.21, spike M0.1), so the icons and widgets are in front.
        window.level = Desktop.level
        window.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle, .fullScreenAuxiliary]
        window.ignoresMouseEvents = true
        window.isOpaque = true
        window.hasShadow = false
        window.backgroundColor = .black
        window.isReleasedWhenClosed = false
        window.contentView = web
    }
}

/// The wallpaper on every display. Windows follow displays as they come and
/// go; each page gets its own visibility (a full-screen app on one display
/// pauses only that one) and the Mac's power state through `WP.power()`.
@MainActor
final class Desktop: NSObject {
    static let level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.desktopWindow)) + 1)

    private(set) var screens: [DesktopScreen] = []
    let power: PowerMonitor
    private let delegate = WebDelegate()
    private var rebuildTimer: Timer?
    private var monitors: [Any] = []
    private var lastMove = Date.distantPast

    /// Pass `w` to pin a wallpaper for this run (tests): it ignores the saved choice.
    var pinned: String? = ProcessInfo.processInfo.environment["WP_WALLPAPER"]
    var reactsToMouse = UserDefaults.standard.object(forKey: "reactsToMouse") as? Bool ?? true {
        didSet { UserDefaults.standard.set(reactsToMouse, forKey: "reactsToMouse") }
    }

    init(power: PowerMonitor) {
        self.power = power
        super.init()
        delegate.didFinish = { [weak self] _ in self?.pushPower() }
        power.onChange = { [weak self] in self?.pushPower() }
    }

    func start() {
        rebuild()
        NotificationCenter.default.addObserver(forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main) { [weak self] _ in
            // Displays settle for a moment after a change.
            self?.rebuildTimer?.invalidate()
            self?.rebuildTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: false) { _ in self?.rebuild() }
        }
        startMouse()
    }

    static func displayID(_ screen: NSScreen) -> CGDirectDisplayID? {
        (screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value
    }

    func rebuild() {
        var next: [DesktopScreen] = []
        for screen in NSScreen.screens {
            guard let id = Self.displayID(screen) else { continue }
            if let existing = screens.first(where: { $0.displayID == id }) {
                if existing.window.frame != screen.frame { existing.window.setFrame(screen.frame, display: true) }
                next.append(existing)
                continue
            }
            let web = WebFactory.make(frame: CGRect(origin: .zero, size: screen.frame.size), quiet: true, delegate: delegate)
            let view = DesktopScreen(screen: screen, displayID: id, web: web)
            var query = ["host": "mac"]
            if let pinned { query["w"] = pinned }
            web.load(URLRequest(url: WebFactory.url(query)))
            view.window.orderFrontRegardless()
            NotificationCenter.default.addObserver(forName: NSWindow.didChangeOcclusionStateNotification, object: view.window, queue: .main) { [weak self] _ in
                self?.pushPower()
            }
            log("desktop window for display \(id): \(Int(screen.frame.width))×\(Int(screen.frame.height))")
            next.append(view)
        }
        for gone in screens where !next.contains(where: { $0 === gone }) {
            gone.window.orderOut(nil)
            gone.window.contentView = nil
        }
        screens = next
    }

    /// Tell each page what its window and the Mac look like now.
    func pushPower() {
        for screen in screens {
            let json = power.json(windowVisible: screen.visible)
            guard json != screen.lastPower else { continue }
            screen.lastPower = json
            screen.web.evaluateJavaScript("window.WP && WP.power && WP.power(\(json))", completionHandler: nil)
        }
    }

    /// Run script on every display's page.
    func run(_ script: String) {
        for screen in screens { screen.web.evaluateJavaScript(script, completionHandler: nil) }
    }

    func show(_ id: String) {
        run("WP.player && WP.player.show(\(Self.quote(id)), { persist: true })")
    }

    func cycle(_ step: Int) {
        run("WP.player && WP.player.cycle(\(step))")
    }

    static func quote(_ text: String) -> String {
        let data = (try? JSONSerialization.data(withJSONObject: [text])) ?? Data("[\"\"]".utf8)
        let array = String(decoding: data, as: UTF8.self)
        return String(array.dropFirst().dropLast())
    }

    // MARK: The mouse
    //
    // The windows ignore the mouse (it belongs to Finder and the icons), but
    // a global monitor sees it without any permission. Moves become pointer
    // events in the wallpaper, so fish follow it and fireflies flee it; a
    // click on the bare desktop (not an app, the Dock or a widget) is a tap.

    private func startMouse() {
        let mask: NSEvent.EventTypeMask = [.mouseMoved, .leftMouseDragged, .leftMouseDown, .leftMouseUp]
        if let monitor = NSEvent.addGlobalMonitorForEvents(matching: mask, handler: { [weak self] event in self?.mouse(event) }) {
            monitors.append(monitor)
        }
    }

    private func mouse(_ event: NSEvent) {
        guard reactsToMouse, !power.hiddenEverywhere else { return }
        let point = NSEvent.mouseLocation
        guard let target = screens.first(where: { $0.window.frame.contains(point) && $0.visible }) else { return }
        let types: [String]
        switch event.type {
        case .leftMouseDown:
            guard Self.bareDesktop(at: point) else { return }
            types = ["pointerdown", "mousedown"]
        case .leftMouseUp:
            guard Self.bareDesktop(at: point) else { return }
            types = ["pointerup", "mouseup", "click"]
        default:
            guard Date().timeIntervalSince(lastMove) > 1.0 / 30 else { return }
            lastMove = Date()
            types = ["pointermove", "mousemove"]
        }
        let frame = target.window.frame
        let x = Int(point.x - frame.minX), y = Int(frame.height - (point.y - frame.minY))
        let buttons = event.type == .leftMouseDown || event.type == .leftMouseDragged ? 1 : 0
        target.web.evaluateJavaScript(Self.pointerScript(types: types, x: x, y: y, buttons: buttons), completionHandler: nil)
    }

    static func pointerScript(types: [String], x: Int, y: Int, buttons: Int) -> String {
        """
        (() => {
            const frame = [...document.querySelectorAll('iframe.stage')].pop();
            const doc = frame && frame.contentDocument;
            if (!doc) return;
            const target = doc.elementFromPoint(\(x), \(y)) || doc.body;
            for (const type of \(types.map { "'\($0)'" }.joined(separator: ", ").wrapped)) {
                const init = { clientX: \(x), clientY: \(y), screenX: \(x), screenY: \(y), buttons: \(buttons), button: 0,
                    bubbles: true, cancelable: true, view: frame.contentWindow, pointerId: 1, pointerType: 'mouse', isPrimary: true };
                target.dispatchEvent(type.startsWith('pointer') ? new PointerEvent(type, init) : new MouseEvent(type, init));
            }
        })()
        """
    }

    /// True when the window in front at this point is Finder's desktop (or the
    /// wallpaper behind it): nothing from any app is covering the spot.
    static func bareDesktop(at point: NSPoint) -> Bool {
        guard let mainHeight = NSScreen.screens.first?.frame.height,
              let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]] else { return false }
        let spot = CGPoint(x: point.x, y: mainHeight - point.y)
        for window in list {
            guard (window[kCGWindowOwnerPID as String] as? Int32) != getpid(),
                  (window[kCGWindowAlpha as String] as? Double ?? 1) > 0,
                  let bounds = window[kCGWindowBounds as String] as? NSDictionary,
                  let rect = CGRect(dictionaryRepresentation: bounds), rect.contains(spot) else { continue }
            return (window[kCGWindowLayer as String] as? Int ?? 0) <= Int(CGWindowLevelForKey(.desktopIconWindow))
        }
        return false
    }
}

private extension String {
    /// `'a', 'b'` → `['a', 'b']`.
    var wrapped: String { "[\(self)]" }
}
