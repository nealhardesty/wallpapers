import Cocoa
import WebKit

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    let power = PowerMonitor()
    lazy var desktop = Desktop(power: power)
    let settings = SettingsWindow()
    let sync = SaverSync()
    var menuBar: MenuBar?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let selfTest = CommandLine.arguments.contains("--selftest")
        if !selfTest, NSRunningApplication.runningApplications(withBundleIdentifier: Bundle.main.bundleIdentifier ?? "").count > 1 {
            NSApp.terminate(nil)
            return
        }
        guard let root = Self.webRoot() else {
            log("no web/ folder in the app or in WP_WEB_ROOT")
            NSApp.terminate(nil)
            return
        }
        if selfTest {
            WebFactory.dataStore = .nonPersistent()
            desktop.pinned = "fireflies"
        }
        WebFactory.scheme = AssetScheme(root: root)
        log("serving \(root.path)")

        if selfTest {
            // Never touch the real mirror or the installed screen saver.
            let scratch = FileManager.default.temporaryDirectory.appendingPathComponent("wallpapers-selftest-\(getpid())")
            SaverSync.folder = scratch.appendingPathComponent("support")
            SaverInstall.directory = scratch.appendingPathComponent("Screen Savers")
            SaverInstall.restartsHost = false
        }
        sync.source = { [weak self] in self?.desktop.screens.first?.web ?? self?.settings.web }
        WebFactory.sync = sync

        installMainMenu()
        power.start()
        desktop.start()
        if selfTest {
            Task { exit(await SelfTest(desktop: desktop, settings: settings, sync: sync).run() ? 0 : 1) }
        } else {
            menuBar = MenuBar(desktop: desktop, settings: settings, sync: sync)
            SaverInstall.updateIfOutdated()
            sync.schedule(after: 3)
        }
    }

    /// Opening the app again (Finder, Spotlight) is how you get to settings.
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        settings.show()
        return true
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    /// `WP_WEB_ROOT` serves a checkout live (edit, reload); otherwise the copy in the app.
    static func webRoot() -> URL? {
        if let path = ProcessInfo.processInfo.environment["WP_WEB_ROOT"] { return URL(fileURLWithPath: path) }
        return Bundle.main.resourceURL?.appendingPathComponent("web", isDirectory: true)
    }

    /// A menu bar item has no app menu, but the settings window needs Cmd-W, Cmd-C and Cmd-V.
    private func installMainMenu() {
        let main = NSMenu()
        let app = NSMenuItem(); main.addItem(app)
        let appMenu = NSMenu(); app.submenu = appMenu
        appMenu.addItem(withTitle: "Quit Wallpapers", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        let edit = NSMenuItem(); main.addItem(edit)
        let editMenu = NSMenu(title: "Edit"); edit.submenu = editMenu
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        let window = NSMenuItem(); main.addItem(window)
        let windowMenu = NSMenu(title: "Window"); window.submenu = windowMenu
        windowMenu.addItem(withTitle: "Close", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        windowMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        NSApp.mainMenu = main
        NSApp.windowsMenu = windowMenu
    }
}
