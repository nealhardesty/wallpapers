import Cocoa

/// Putting the screen saver where macOS looks for it. The app carries the
/// saver (`Contents/Resources/Wallpapers.saver`); installing copies it to
/// `~/Library/Screen Savers`, which needs no admin rights. Choosing it is
/// the one step left to the person: since macOS 26 the choice lives in the
/// wallpaper store, which has no public way in.
@MainActor
enum SaverInstall {
    enum State { case unavailable, notInstalled, outdated, current }

    /// Tests point these elsewhere, and leave Apple's host alone.
    static var directory = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Screen Savers")
    static var restartsHost = true

    static var bundled: URL? { Bundle.main.resourceURL?.appendingPathComponent("Wallpapers.saver") }
    static var installed: URL { directory.appendingPathComponent("Wallpapers.saver") }

    static func build(of saver: URL) -> String? {
        (NSDictionary(contentsOf: saver.appendingPathComponent("Contents/Info.plist")))?["WPBuild"] as? String
    }

    static func state() -> State {
        guard let bundled, let ours = build(of: bundled) else { return .unavailable }
        guard FileManager.default.fileExists(atPath: installed.path) else { return .notInstalled }
        return build(of: installed) == ours ? .current : .outdated
    }

    static func install() throws {
        guard let bundled else { throw CocoaError(.fileNoSuchFile) }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try? FileManager.default.removeItem(at: installed)
        try FileManager.default.copyItem(at: bundled, to: installed)
        if restartsHost { restartHost() }
        log("installed the screen saver")
    }

    /// A new version of the app brings a new saver: replace an installed old one quietly.
    static func updateIfOutdated() {
        guard state() == .outdated else { return }
        do { try install() } catch { log("couldn't update the screen saver: \(error.localizedDescription)") }
    }

    /// The host keeps a loaded saver in memory, so a fresh copy needs a fresh
    /// host. And System Settings lists what the wallpaper service found when it
    /// last scanned (macOS 26 doesn't rescan `~/Library/Screen Savers` when a
    /// saver appears), so restart that too; launchd brings it straight back.
    static func restartHost() {
        for name in ["legacyScreenSaver", "WallpaperAgent"] {
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/usr/bin/pkill")
            process.arguments = ["-x", name]
            try? process.run()
        }
    }

    static func preview() {
        NSWorkspace.shared.openApplication(at: URL(fileURLWithPath: "/System/Library/CoreServices/ScreenSaverEngine.app"),
                                           configuration: NSWorkspace.OpenConfiguration())
    }

    static func openSystemSettings() {
        NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.Wallpaper-Settings.extension")!)
    }
}
