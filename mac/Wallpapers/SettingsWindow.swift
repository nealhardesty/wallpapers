import Cocoa
import WebKit

/// The settings screen is the page with its panel open, in an ordinary window
/// (as Android's SettingsActivity does). It shares the desktop windows'
/// storage, so a change reaches every display at once. While it's open the app
/// shows in the Dock and Cmd-Tab; when it closes the app goes back to being
/// just a menu bar item.
@MainActor
final class SettingsWindow: NSObject, NSWindowDelegate {
    private(set) var window: NSWindow?
    private(set) var web: WKWebView?
    private let delegate = WebDelegate()

    func show() {
        if let window {
            NSApp.activate()
            return window.makeKeyAndOrderFront(nil)
        }
        let size = NSSize(width: 560, height: 780)
        let web = WebFactory.make(frame: CGRect(origin: .zero, size: size), quiet: true, delegate: delegate)
        web.load(URLRequest(url: WebFactory.url(["host": "mac", "panel": "open"])))
        let window = NSWindow(contentRect: CGRect(origin: .zero, size: size),
                              styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "Wallpapers"
        window.contentMinSize = NSSize(width: 380, height: 480)
        window.contentView = web
        window.isReleasedWhenClosed = false
        window.delegate = self
        window.center()
        window.setFrameAutosaveName("SettingsWindow")
        self.window = window
        self.web = web
        NSApp.setActivationPolicy(.regular)
        NSApp.activate()
        window.makeKeyAndOrderFront(nil)
    }

    func windowWillClose(_ notification: Notification) {
        window?.contentView = nil
        window = nil
        web = nil
        NSApp.setActivationPolicy(.accessory)
    }
}
