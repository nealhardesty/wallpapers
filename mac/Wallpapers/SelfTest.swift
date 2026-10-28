import Cocoa
import WebKit

/// `Wallpapers --selftest` (make mac-test): runs the real app against a
/// throwaway settings store and checks what the app promises. Exit code 0 on
/// success. It puts a wallpaper window behind your desktop icons for about
/// half a minute and never changes your settings or your desktop picture.
@MainActor
final class SelfTest {
    private let desktop: Desktop
    private let settings: SettingsWindow
    private let sync: SaverSync
    private var failures = 0

    init(desktop: Desktop, settings: SettingsWindow, sync: SaverSync) {
        self.desktop = desktop
        self.settings = settings
        self.sync = sync
    }

    private func check(_ name: String, _ ok: Bool, _ detail: String = "") {
        if !ok { failures += 1 }
        print("\(ok ? "PASS" : "FAIL")  \(name)\(detail.isEmpty ? "" : "  (\(detail))")")
    }

    private func js(_ web: WKWebView, _ script: String) async -> Any? {
        try? await web.evaluateJavaScript(script)
    }

    private func pause(_ seconds: Double) async { try? await Task.sleep(nanoseconds: UInt64(seconds * 1e9)) }

    private func until(_ seconds: Double, _ condition: () async -> Bool) async -> Bool {
        let end = Date().addingTimeInterval(seconds)
        while Date() < end {
            if await condition() { return true }
            await pause(0.25)
        }
        return false
    }

    /// How many sampled pixels differ between two snapshots of the page.
    private func movement(_ web: WKWebView, after delay: Double = 0.7) async -> Int {
        func pixels() async -> NSBitmapImageRep? {
            guard let image = try? await web.takeSnapshot(configuration: WKSnapshotConfiguration()),
                  let tiff = image.tiffRepresentation else { return nil }
            return NSBitmapImageRep(data: tiff)
        }
        guard let a = await pixels() else { return -1 }
        await pause(delay)
        guard let b = await pixels(), a.pixelsWide == b.pixelsWide, a.pixelsHigh == b.pixelsHigh,
              let pa = a.bitmapData, let pb = b.bitmapData else { return -1 }
        var diff = 0, i = 0
        let n = a.pixelsWide * a.pixelsHigh * 4
        while i < n { if pa[i] != pb[i] { diff += 1 }; i += 53 }
        return diff
    }

    func run() async -> Bool {
        print("Wallpapers self-test (settings are a throwaway store)")

        // 1. One window per display, between Apple's wallpaper and Finder's icons.
        check("one desktop window per display", desktop.screens.count == NSScreen.screens.count, "\(desktop.screens.count)")
        let below = Int(CGWindowLevelForKey(.desktopWindow)), above = Int(CGWindowLevelForKey(.desktopIconWindow))
        let level = Desktop.level.rawValue
        check("window level is above the wallpaper and below the icons", level > below && level < above, "\(below) < \(level) < \(above)")
        if let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]] {
            let ours = list.filter { ($0[kCGWindowOwnerPID as String] as? Int32) == getpid() && ($0[kCGWindowLayer as String] as? Int) == level }
            check("the window list has our window at that layer", ours.count == desktop.screens.count, "\(ours.count)")
            if let finder = list.first(where: { ($0[kCGWindowOwnerName as String] as? String) == "Finder" && ($0[kCGWindowLayer as String] as? Int) == above }),
               let ourIndex = list.firstIndex(where: { ($0[kCGWindowOwnerPID as String] as? Int32) == getpid() && ($0[kCGWindowLayer as String] as? Int) == level }),
               let finderIndex = list.firstIndex(where: { ($0[kCGWindowNumber as String] as? Int) == (finder[kCGWindowNumber as String] as? Int) }) {
                check("Finder's icon window is in front of ours", finderIndex < ourIndex)
            } else {
                print("SKIP  Finder's icon window isn't on screen")
            }
        }
        guard let web = desktop.screens.first?.web else { print("FAIL  no web view"); return false }

        // 2. The page starts and draws.
        let drew = await until(25) {
            (await self.js(web, "(() => { const f = [...document.querySelectorAll('iframe.stage')].pop(); const d = f && f.contentDocument; return !!(d && d.querySelector('canvas')); })()") as? Bool) == true
        }
        check("the wallpaper draws a canvas (same origin all the way down)", drew)
        await pause(1.5)

        // 3. It animates; 4. hidden pauses it and visible resumes it. Neither can
        // be seen while the screen is locked, asleep or on a screen saver.
        if desktop.power.hiddenEverywhere || !(desktop.screens.first?.visible ?? false) {
            print("SKIP  animation and pause checks: the screen is locked, asleep or covered. Run again with the screen on.")
        } else {
            let moved = await movement(web)
            check("the wallpaper animates", moved > 20, "\(moved) sampled pixels changed")

            _ = await js(web, "WP.power({ hidden: true })")
            await pause(1.2)
            let frozen = await movement(web)
            check("hidden pauses the wallpaper", frozen >= 0 && frozen <= 2, "\(frozen) pixels changed")
            _ = await js(web, "WP.power({ hidden: false })")
            await pause(1.2)
            let resumed = await movement(web)
            check("visible again resumes it", resumed > 20, "\(resumed) pixels changed")

        }

        // 5. The catalog.
        let count = (await js(web, "WP.catalog.filter(e => !e.disabled).length") as? Int) ?? 0
        check("the catalog is there", count > 20, "\(count) wallpapers")

        // 6. The mouse becomes pointer events in the wallpaper.
        _ = await js(web, "(() => { const f = [...document.querySelectorAll('iframe.stage')].pop(); f.contentDocument.addEventListener('pointermove', e => { window.__pm = [e.clientX, e.clientY]; }); })()")
        _ = await js(web, Desktop.pointerScript(types: ["pointermove"], x: 123, y: 45, buttons: 0))
        let arrived = await js(web, "JSON.stringify(window.__pm || null)") as? String
        check("a mouse move reaches the wallpaper as a pointer event", arrived == "[123,45]", arrived ?? "nil")

        // 7. Settings share storage with the desktop, and changes are announced.
        settings.show()
        let settingsReady = await until(15) {
            guard let settingsWeb = self.settings.web else { return false }
            return (await self.js(settingsWeb, "typeof WP !== 'undefined' && !!WP.store && !!WP.panel && WP.panel.isOpen") as? Bool) == true
        }
        check("the settings window opens its panel", settingsReady)
        if let settingsWeb = settings.web {
            _ = await js(web, "window.__events = 0; addEventListener('storage', e => { if (e.key === 'wp:selftest') window.__events++; });")
            _ = await js(settingsWeb, "WP.store.set('wp:selftest', { n: 42 })")
            let seen = await until(4) { (await self.js(web, "(WP.store.get('wp:selftest') || {}).n") as? Int) == 42 }
            check("a setting saved in the settings window is seen by the desktop", seen)
            let announced = await until(4) { ((await self.js(web, "window.__events") as? Int) ?? 0) > 0 }
            check("and announced to it as a storage event", announced)
            _ = await js(settingsWeb, "localStorage.removeItem('wp:selftest')")
        }
        settings.window?.close()
        check("closing settings returns the app to the menu bar", NSApp.activationPolicy() == .accessory)

        // 8. Bing's archive is answered natively (a real fetch: 200, or 503 when offline).
        let status = try? await web.callAsyncJavaScript("const r = await fetch('bing.json'); return r.status;", contentWorld: .page) as? Int
        check("bing.json is answered by the app", status == 200 || status == 503, "HTTP \(status.map(String.init) ?? "none")")

        // 8b. The mirror for the screen saver: settings out as plain data, secrets and the hint left behind.
        let mirrorKeys = "WP.store.set('wp:selftest-mirror', { n: 7 }); localStorage.setItem('wp:jellyfin:auth', 'secret-token'); localStorage.setItem('wp:hinted', 'true');"
        _ = await js(web, mirrorKeys)
        let written = await until(5) { FileManager.default.fileExists(atPath: self.sync.file.path) }
        check("changing a setting writes saver.json", written)
        await pause(0.5)
        let mirror = (try? Data(contentsOf: sync.file)).flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
        let stored = mirror?["storage"] as? [String: String] ?? [:]
        check("saver.json carries the setting", stored["wp:selftest-mirror"] == "{\"n\":7}", "\(stored["wp:selftest-mirror"] ?? "missing")")
        check("saver.json leaves out sign-in tokens and the first-run hint", stored["wp:jellyfin:auth"] == nil && stored["wp:hinted"] == nil)
        let entries = mirror?["catalog"] as? [[String: Any]] ?? []
        let picks = Set(entries.filter { $0["pick"] as? Bool == true }.compactMap { $0["id"] as? String })
        check("Random's pool skips blank, Jellyfin and Bing", entries.count > 20 && picks.count > 15 && !picks.contains("blank") && !picks.contains("jellyfin") && !picks.contains("bing"), "\(picks.count) of \(entries.count)")
        sync.choice = "random"; sync.clock = true; sync.rotateMinutes = 15
        await pause(2)
        let saver = ((try? Data(contentsOf: sync.file)).flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] })?["saver"] as? [String: Any]
        check("the menu's saver choices reach saver.json", saver?["choice"] as? String == "random" && saver?["clock"] as? Bool == true && saver?["rotateMinutes"] as? Int == 15, "\(String(describing: saver))")
        sync.choice = "same"; sync.clock = false; sync.rotateMinutes = 5
        _ = await js(web, "localStorage.removeItem('wp:selftest-mirror'); localStorage.removeItem('wp:jellyfin:auth'); localStorage.removeItem('wp:hinted');")
        try? FileManager.default.removeItem(at: SaverSync.folder)

        // 8c. Installing the screen saver (into a scratch folder, never the real one).
        check("the app carries a screen saver", SaverInstall.state() != .unavailable)
        if SaverInstall.state() != .unavailable {
            check("it starts out not installed", SaverInstall.state() == .notInstalled)
            do { try SaverInstall.install() } catch { print("install failed: \(error)") }
            check("installing it makes it current", SaverInstall.state() == .current)
            let plist = SaverInstall.installed.appendingPathComponent("Contents/Info.plist")
            if let info = NSMutableDictionary(contentsOf: plist) {
                info["WPBuild"] = "stale"
                info.write(to: plist, atomically: true)
            }
            check("an older copy is seen as outdated", SaverInstall.state() == .outdated)
            SaverInstall.updateIfOutdated()
            check("and is replaced at launch", SaverInstall.state() == .current)
            try? FileManager.default.removeItem(at: SaverInstall.directory)
        }

        // 9. The power signals are valid JSON in the page's shape.
        let json = desktop.power.json(windowVisible: true)
        let parsed = (try? JSONSerialization.jsonObject(with: Data(json.utf8))) as? [String: Any]
        check("power state is the JSON WP.power() takes", parsed?["hidden"] is Bool && parsed?["saver"] is Bool && parsed?["thermal"] is String, json)

        // 10. The lock-screen still renders at the display's pixel size.
        if let screen = desktop.screens.first, let url = await Still.render(screen),
           let rep = NSBitmapImageRep(data: (try? Data(contentsOf: url)) ?? Data()) {
            let scale = NSScreen.screens.first(where: { Desktop.displayID($0) == screen.displayID })?.backingScaleFactor ?? 1
            let expected = Int(screen.window.frame.width * scale)
            check("the lock-screen still renders at native size", abs(rep.pixelsWide - expected) <= 2, "\(rep.pixelsWide)×\(rep.pixelsHigh)")
            try? FileManager.default.removeItem(at: url)
        } else {
            check("the lock-screen still renders at native size", false, "no image")
        }

        print(failures == 0 ? "All checks passed." : "\(failures) check(s) failed.")
        return failures == 0
    }
}
