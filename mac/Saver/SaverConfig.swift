import Foundation

/// What the Wallpapers app mirrors for the saver: `saver.json` in the real
/// home's Application Support. The saver runs in Apple's sandbox, which can
/// read that folder (spike M0.3) but not the app's preferences or its web
/// storage, so the app writes the settings out as plain data (SPEC §10.21).
struct SaverConfig {
    struct Entry { let id: String, name: String, pick: Bool }

    enum Choice: Equatable {
        case same            // follow the desktop's choice, Seasonal included
        case random          // a different wallpaper each time, and every few minutes
        case wallpaper(String)
    }

    var storage: [String: String] = [:]
    var catalog: [Entry] = []
    var choice: Choice = .same
    var rotateMinutes = 5
    var clock = false

    /// `WP_SAVER_JSON` is for tests; the saver's own host never sets it.
    static var url: URL {
        if let path = ProcessInfo.processInfo.environment["WP_SAVER_JSON"] { return URL(fileURLWithPath: path) }
        let home = String(cString: getpwuid(getuid()).pointee.pw_dir)
        return URL(fileURLWithPath: home).appendingPathComponent("Library/Application Support/Wallpapers/saver.json")
    }

    /// Defaults (the desktop's Seasonal) when the app has never run or the file is damaged.
    static func load() -> SaverConfig {
        var config = SaverConfig()
        guard let data = try? Data(contentsOf: url),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return config }
        config.storage = (object["storage"] as? [String: String]) ?? [:]
        config.catalog = (object["catalog"] as? [[String: Any]] ?? []).compactMap {
            guard let id = $0["id"] as? String else { return nil }
            return Entry(id: id, name: $0["name"] as? String ?? id, pick: $0["pick"] as? Bool ?? false)
        }
        let saver = object["saver"] as? [String: Any] ?? [:]
        switch saver["choice"] as? String ?? "same" {
        case "same": config.choice = .same
        case "random": config.choice = config.catalog.contains { $0.pick } ? .random : .same
        case let id: config.choice = .wallpaper(id)
        }
        config.rotateMinutes = max(1, saver["rotateMinutes"] as? Int ?? 5)
        config.clock = saver["clock"] as? Bool ?? false
        return config
    }

    /// The wallpaper to force with `?w=`, or nil to let the page follow the
    /// mirrored `wp:current` exactly as the desktop does. `taken` are the ones
    /// other displays already show.
    func pick(avoiding taken: Set<String>) -> String? {
        switch choice {
        case .same: return nil
        case .wallpaper(let id): return id
        case .random:
            let pool = catalog.filter { $0.pick }.map(\.id)
            return pool.filter { !taken.contains($0) }.randomElement() ?? pool.randomElement()
        }
    }
}
