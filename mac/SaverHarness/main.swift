// make mac-saver-test: loads the built Wallpapers.saver outside Apple's host
// and checks what it promises (SPEC §10.21). It isn't legacyScreenSaver, so it
// can't show that host's bugs (that's `make mac-saver-live`), but it checks
// the saver's own logic: settings, choices, displays, clock, watchdog.
// It puts a window on screen for about a minute. Run it with the screen on.
import Cocoa
import ScreenSaver

setbuf(stdout, nil)
guard CommandLine.arguments.count > 1, let bundle = Bundle(path: CommandLine.arguments[1]), bundle.load(),
      let cls = bundle.principalClass as? ScreenSaverView.Type else {
    print("usage: SaverHarness <Wallpapers.saver>")
    exit(2)
}
let app = NSApplication.shared
app.setActivationPolicy(.accessory)

let scratch = FileManager.default.temporaryDirectory.appendingPathComponent("wallpapers-saver-test-\(getpid())")
try? FileManager.default.createDirectory(at: scratch, withIntermediateDirectories: true)
setenv("WP_SAVER_LOG", scratch.appendingPathComponent("saver.log").path, 1)

var failures = 0
func check(_ name: String, _ ok: Bool, _ detail: String = "") {
    if !ok { failures += 1 }
    print("\(ok ? "PASS" : "FAIL")  \(name)\(detail.isEmpty ? "" : "  (\(detail))")")
}

func fixture(_ name: String, _ json: [String: Any]?) {
    let url = scratch.appendingPathComponent("\(name).json")
    if let json { try? JSONSerialization.data(withJSONObject: json).write(to: url) }
    setenv("WP_SAVER_JSON", url.path, 1)
}

let catalog: [[String: Any]] = ["fireflies", "snow", "rain", "starfield", "matrix", "leaves"].map { ["id": $0, "name": $0, "pick": true] }

func show(_ frame: NSRect = NSRect(x: 80, y: 120, width: 800, height: 500)) -> (ScreenSaverView, NSWindow) {
    let view = cls.init(frame: NSRect(origin: .zero, size: frame.size), isPreview: false)!
    let window = NSWindow(contentRect: frame, styleMask: [.titled], backing: .buffered, defer: false)
    window.contentView = view
    window.isReleasedWhenClosed = false
    window.orderFrontRegardless()
    view.startAnimation()
    return (view, window)
}

func state(_ view: ScreenSaverView) -> [String: Any] {
    let text = view.perform(NSSelectorFromString("debugState"))?.takeUnretainedValue() as? String ?? "{}"
    return (try? JSONSerialization.jsonObject(with: Data(text.utf8))) as? [String: Any] ?? [:]
}

func probe(_ view: ScreenSaverView) async -> [String: Any] {
    _ = view.perform(NSSelectorFromString("debugProbe"))
    try? await Task.sleep(nanoseconds: 600_000_000)
    let text = state(view)["probe"] as? String ?? "null"
    return (try? JSONSerialization.jsonObject(with: Data(text.utf8))) as? [String: Any] ?? [:]
}

func until(_ seconds: Double, _ condition: () async -> Bool) async -> Bool {
    let end = Date().addingTimeInterval(seconds)
    while Date() < end { if await condition() { return true }; try? await Task.sleep(nanoseconds: 250_000_000) }
    return false
}

func pause(_ seconds: Double) async { try? await Task.sleep(nanoseconds: UInt64(seconds * 1e9)) }

Task { @MainActor in
    if (CGSessionCopyCurrentDictionary() as? [String: Any])?["CGSSessionScreenIsLocked"] as? Bool == true {
        print("SKIP  the screen is locked; run again with the screen on")
        exit(0)
    }
    print("Wallpapers.saver harness")

    // A. One chosen wallpaper: forced with ?w=, draws, and the frames keep coming.
    fixture("fixed", ["saver": ["choice": "fireflies"], "catalog": catalog])
    let (fixed, fixedWindow) = show()
    check("the saver loads from its bundle", state(fixed)["wallpaper"] as? String == "fireflies")
    let drew = await until(15) { (await probe(fixed))["canvas"] as? Bool == true }
    check("a chosen wallpaper draws", drew)
    let frames = await until(10) { (state(fixed)["frames"] as? Int ?? 0) > 0 }
    await pause(5)
    check("the watchdog sees frames arriving", frames && (state(fixed)["frames"] as? Int ?? 0) > 100, "\(state(fixed)["frames"] ?? 0)")
    check("it stays live", state(fixed)["mode"] as? String == "live" && state(fixed)["recoveries"] as? Int == 0)
    check("its stage is the one chosen", ((await probe(fixed))["stage"] as? String ?? "").contains("w=fireflies"))
    check("it offers an Options sheet", fixed.hasConfigureSheet && fixed.configureSheet != nil)

    // B. Same as the desktop: the mirrored wp:current seeds the page's storage.
    fixture("same", ["storage": ["wp:current": "\"snow\""], "saver": ["choice": "same"], "catalog": catalog])
    let (same, sameWindow) = show()
    _ = await until(15) { (await probe(same))["canvas"] as? Bool == true }
    let sameProbe = await probe(same)
    check("Same as the Desktop follows the mirrored choice", sameProbe["current"] as? String == "snow" && (sameProbe["stage"] as? String ?? "").contains("w=snow"), "\(sameProbe)")
    check("and forces nothing", state(same)["wallpaper"] as? String == "current")
    sameWindow.close()

    // C. Random: two displays get two different wallpapers.
    fixture("random", ["saver": ["choice": "random"], "catalog": catalog])
    let (a, aWindow) = show(NSRect(x: 80, y: 120, width: 500, height: 320))
    let (b, bWindow) = show(NSRect(x: 600, y: 120, width: 500, height: 320))
    let ids = [state(a)["wallpaper"] as? String ?? "", state(b)["wallpaper"] as? String ?? ""]
    let pool = Set(catalog.compactMap { $0["id"] as? String })
    check("Random picks from the pool", ids.allSatisfy { pool.contains($0) }, ids.joined(separator: ", "))
    check("and doesn't repeat itself across displays", ids[0] != ids[1], ids.joined(separator: ", "))
    aWindow.close(); bWindow.close()

    // D. The clock.
    fixture("clock", ["saver": ["choice": "fireflies", "clock": true], "catalog": catalog])
    let (clocked, clockWindow) = show()
    await pause(1)
    check("the clock shows when asked", state(clocked)["clockVisible"] as? Bool == true)
    check("and not otherwise", state(fixed)["clockVisible"] as? Bool == false)
    clockWindow.close()

    // E. No settings file at all (the app has never run): Seasonal, and it draws.
    fixture("missing", nil)
    let (bare, bareWindow) = show()
    check("without the app's settings it still draws", await until(15) { (await probe(bare))["canvas"] as? Bool == true })
    bareWindow.close()

    // F. The watchdog: reload, rebuild, then a clock on black.
    _ = fixed.perform(NSSelectorFromString("debugStall"))
    check("a stall reloads the page first", state(fixed)["recoveries"] as? Int == 1 && state(fixed)["mode"] as? String == "live")
    _ = fixed.perform(NSSelectorFromString("debugStall"))
    check("then rebuilds it", state(fixed)["recoveries"] as? Int == 2 && state(fixed)["mode"] as? String == "live")
    _ = fixed.perform(NSSelectorFromString("debugStall"))
    check("then falls back to a clock on black, never a broken screen", state(fixed)["mode"] as? String == "fallback" && state(fixed)["clockVisible"] as? Bool == true)

    // G. Stopping pauses it.
    fixed.stopAnimation()
    check("stopping pauses the saver", state(fixed)["running"] as? Bool == false)
    fixedWindow.close()

    try? FileManager.default.removeItem(at: scratch)
    print(failures == 0 ? "All checks passed." : "\(failures) check(s) failed.")
    exit(failures == 0 ? 0 : 1)
}
app.run()
