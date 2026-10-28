import Cocoa
import ServiceManagement

/// The app's only always-there UI: a menu bar item to pick a wallpaper, pause,
/// open settings, and quit.
@MainActor
final class MenuBar: NSObject, NSMenuDelegate {
    private struct Entry { let id: String, name: String, icon: String }

    private let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
    private let menu = NSMenu()
    private let desktop: Desktop
    private let settings: SettingsWindow
    private let sync: SaverSync
    private var catalog: [Entry] = []
    private var current = "seasonal"

    init(desktop: Desktop, settings: SettingsWindow, sync: SaverSync) {
        self.desktop = desktop
        self.settings = settings
        self.sync = sync
        super.init()
        item.button?.image = NSImage(systemSymbolName: "sparkles", accessibilityDescription: "Wallpapers")
        item.button?.image?.isTemplate = true
        menu.delegate = self
        item.menu = menu
        build()
    }

    func menuWillOpen(_ menu: NSMenu) {
        build()
        Task { await refresh(); build() }
    }

    /// The catalog and the current choice live in the page; ask it.
    func refresh() async {
        guard let web = desktop.screens.first?.web else { return }
        let script = """
        JSON.stringify({ current: WP.store.get('wp:current') || 'seasonal',
            entries: WP.catalog.filter(e => !e.disabled).map(e => ({ id: e.id, name: e.name, icon: e.icon })) })
        """
        guard let text = try? await web.evaluateJavaScript(script) as? String,
              let object = try? JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any] else { return }
        current = object["current"] as? String ?? current
        catalog = (object["entries"] as? [[String: String]] ?? []).compactMap {
            guard let id = $0["id"], let name = $0["name"] else { return nil }
            return Entry(id: id, name: name, icon: $0["icon"] ?? "")
        }
    }

    private func build() {
        menu.removeAllItems()
        let now = catalog.first { $0.id == current }
        let title = menu.addItem(withTitle: now.map { "\($0.icon) \($0.name)" } ?? "Wallpapers", action: nil, keyEquivalent: "")
        title.isEnabled = false

        let picker = NSMenuItem(title: "Wallpaper", action: nil, keyEquivalent: "")
        let submenu = NSMenu()
        for entry in catalog {
            let row = submenu.addItem(withTitle: "\(entry.icon)  \(entry.name)", action: #selector(pick(_:)), keyEquivalent: "")
            row.target = self
            row.representedObject = entry.id
            row.state = entry.id == current ? .on : .off
        }
        if catalog.isEmpty { submenu.addItem(withTitle: "Loading…", action: nil, keyEquivalent: "").isEnabled = false }
        picker.submenu = submenu
        menu.addItem(picker)

        add("Surprise Me", #selector(surprise), "r")
        add("Next", #selector(next), "]")
        add("Previous", #selector(previous), "[")
        menu.addItem(.separator())

        let pause = add(desktop.power.paused ? "Resume" : "Pause", #selector(togglePause), "p")
        pause.state = desktop.power.paused ? .on : .off
        let mouse = add("Wallpaper Reacts to the Mouse", #selector(toggleMouse), "")
        mouse.state = desktop.reactsToMouse ? .on : .off
        menu.addItem(.separator())

        add("Settings…", #selector(openSettings), ",")
        let saver = NSMenuItem(title: "Screen Saver", action: nil, keyEquivalent: "")
        saver.submenu = saverMenu()
        menu.addItem(saver)
        add("Use as Lock Screen Picture…", #selector(lockScreen), "")
        let login = add("Open at Login", #selector(toggleLogin), "")
        login.state = SMAppService.mainApp.status == .enabled ? .on : .off
        menu.addItem(.separator())
        add("Quit Wallpapers", #selector(NSApplication.terminate(_:)), "q").target = NSApp
    }

    // MARK: The screen saver

    private func saverMenu() -> NSMenu {
        let saver = NSMenu()
        let state = SaverInstall.state()
        let status: String
        switch state {
        case .unavailable: status = "Not included in this build"
        case .notInstalled: status = "Not installed yet"
        case .outdated: status = "Installed, an update is ready"
        case .current: status = "Installed"
        }
        saver.addItem(withTitle: status, action: nil, keyEquivalent: "").isEnabled = false
        func row(_ title: String, _ action: Selector, _ state: NSControl.StateValue = .off, to menu: NSMenu? = nil) -> NSMenuItem {
            let item = (menu ?? saver).addItem(withTitle: title, action: action, keyEquivalent: "")
            item.target = self
            item.state = state
            return item
        }
        switch state {
        case .unavailable: break
        case .notInstalled: _ = row("Install Screen Saver…", #selector(installSaver))
        case .outdated: _ = row("Update Screen Saver", #selector(installSaver))
        case .current:
            _ = row("Preview Now", #selector(previewSaver))
            _ = row("Choose It in System Settings…", #selector(chooseSaver))
        }
        saver.addItem(.separator())

        saver.addItem(withTitle: "Show", action: nil, keyEquivalent: "").isEnabled = false
        let choice = sync.choice
        _ = row("Same as the Desktop", #selector(saverSame), choice == "same" ? .on : .off)
        _ = row("A Different One Each Time", #selector(saverRandom), choice == "random" ? .on : .off)
        let specific = NSMenuItem(title: "One Wallpaper", action: nil, keyEquivalent: "")
        let list = NSMenu()
        for entry in catalog where entry.id != "seasonal" {
            let item = row("\(entry.icon)  \(entry.name)", #selector(saverPick(_:)), choice == entry.id ? .on : .off, to: list)
            item.representedObject = entry.id
        }
        specific.submenu = list
        specific.state = choice != "same" && choice != "random" ? .on : .off
        saver.addItem(specific)

        let every = NSMenuItem(title: "Change Every", action: nil, keyEquivalent: "")
        let times = NSMenu()
        for minutes in [1, 5, 15, 30] {
            let item = row("\(minutes) minute\(minutes == 1 ? "" : "s")", #selector(saverEvery(_:)), sync.rotateMinutes == minutes ? .on : .off, to: times)
            item.tag = minutes
        }
        every.submenu = times
        every.isEnabled = choice == "random"
        saver.addItem(every)
        _ = row("Show a Clock", #selector(saverClock), sync.clock ? .on : .off)
        return saver
    }

    @objc private func installSaver() {
        do { try SaverInstall.install() } catch {
            let alert = NSAlert()
            alert.messageText = "Couldn't install the screen saver"
            alert.informativeText = error.localizedDescription
            alert.runModal()
            return
        }
        sync.schedule(after: 0)
        let alert = NSAlert()
        alert.messageText = "The screen saver is installed"
        alert.informativeText = "One step is left, and macOS wants you to do it: open System Settings → Wallpaper, click Screen Saver, scroll to the bottom (Other) and choose Wallpapers. If System Settings is already open, quit and reopen it first. Pick what it shows from this menu."
        alert.addButton(withTitle: "Open System Settings")
        alert.addButton(withTitle: "Later")
        NSApp.activate()
        if alert.runModal() == .alertFirstButtonReturn { SaverInstall.openSystemSettings() }
    }

    @objc private func previewSaver() { sync.schedule(after: 0); SaverInstall.preview() }
    @objc private func chooseSaver() { SaverInstall.openSystemSettings() }
    @objc private func saverSame() { sync.choice = "same" }
    @objc private func saverRandom() { sync.choice = "random" }
    @objc private func saverPick(_ sender: NSMenuItem) { if let id = sender.representedObject as? String { sync.choice = id } }
    @objc private func saverEvery(_ sender: NSMenuItem) { sync.rotateMinutes = sender.tag }
    @objc private func saverClock() { sync.clock.toggle() }

    @discardableResult
    private func add(_ title: String, _ action: Selector, _ key: String) -> NSMenuItem {
        let row = menu.addItem(withTitle: title, action: action, keyEquivalent: key)
        row.target = self
        return row
    }

    @objc private func pick(_ sender: NSMenuItem) {
        guard let id = sender.representedObject as? String else { return }
        current = id
        desktop.show(id)
    }

    @objc private func surprise() {
        guard let entry = catalog.filter({ $0.id != current && $0.id != "seasonal" && $0.id != "blank" }).randomElement() else { return }
        current = entry.id
        desktop.show(entry.id)
    }

    @objc private func next() { desktop.cycle(1); Task { await refresh() } }
    @objc private func previous() { desktop.cycle(-1); Task { await refresh() } }
    @objc private func togglePause() { desktop.power.paused.toggle() }
    @objc private func toggleMouse() { desktop.reactsToMouse.toggle() }
    @objc private func openSettings() { settings.show() }

    @objc private func toggleLogin() {
        do {
            if SMAppService.mainApp.status == .enabled { try SMAppService.mainApp.unregister() }
            else { try SMAppService.mainApp.register() }
        } catch {
            let alert = NSAlert()
            alert.messageText = "Couldn't change Open at Login"
            alert.informativeText = error.localizedDescription
            alert.runModal()
        }
    }

    @objc private func lockScreen() {
        let alert = NSAlert()
        alert.messageText = "Use this wallpaper on the lock screen?"
        alert.informativeText = "The live wallpaper can't show on the lock screen or login window; they draw the desktop picture. This renders a still of the wallpaper on each display and makes it your desktop picture, replacing the one in System Settings. The live wallpaper stays in front of it."
        alert.addButton(withTitle: "Use as Desktop Picture")
        alert.addButton(withTitle: "Cancel")
        NSApp.activate()
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        Task {
            let count = await Still.setDesktopPictures(desktop)
            log("set the desktop picture on \(count) display(s)")
        }
    }
}
