import Cocoa
import WebKit

/// Keeps `saver.json` current: the settings the screen saver can't read for
/// itself. The saver runs in Apple's sandbox and can read this folder but not
/// our web storage, so every change to a `wp:` key (and to the menu's saver
/// choices) is mirrored here, a second after it settles. Sign-in tokens
/// (`secrets` in the catalog) and the first-run hint are left out.
@MainActor
final class SaverSync: NSObject, WKScriptMessageHandler {
    static let handlerName = "wpsync"
    /// Tests point this somewhere else.
    static var folder: URL = Still.folder
    var file: URL { Self.folder.appendingPathComponent("saver.json") }

    /// Seen by every page in the app: setItem/removeItem/clear on `wp:` keys
    /// tell us to mirror, whichever frame made the change.
    static let script = """
    (() => {
        const post = () => { try { webkit.messageHandlers.\(handlerName).postMessage(1); } catch (e) {} };
        const wrap = name => {
            const original = Storage.prototype[name];
            Storage.prototype[name] = function (...args) {
                const result = original.apply(this, args);
                if (this === window.localStorage && (name === 'clear' || String(args[0]).startsWith('wp:'))) post();
                return result;
            };
        };
        ['setItem', 'removeItem', 'clear'].forEach(wrap);
        addEventListener('storage', post);
    })();
    """

    private static let dump = """
    (() => {
        const secrets = new Set(WP.catalog.flatMap(e => (e.secrets || []).map(n => `wp:${e.id}:${n}`)));
        const storage = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('wp:') && key !== 'wp:hinted' && !secrets.has(key)) storage[key] = localStorage.getItem(key);
        }
        const catalog = WP.catalog.filter(e => !e.pseudo && !e.disabled).map(e => ({
            id: e.id, name: e.name, icon: e.icon,
            // Random skips what has nothing to show: the blank, a server you type, anything that needs the network to draw.
            pick: e.id !== 'blank' && e.network !== 'user' && !(e.network && !e.offline) && !e.media,
        }));
        return JSON.stringify({ storage, catalog });
    })()
    """

    private let defaults = UserDefaults.standard
    private var timer: Timer?
    /// Where to read the page's storage from.
    var source: (() -> WKWebView?)?

    /// "same" (follow the desktop), "random", or a wallpaper id.
    var choice: String {
        get { defaults.string(forKey: "saverChoice") ?? "same" }
        set { defaults.set(newValue, forKey: "saverChoice"); schedule() }
    }
    var rotateMinutes: Int {
        get { defaults.object(forKey: "saverRotateMinutes") as? Int ?? 5 }
        set { defaults.set(newValue, forKey: "saverRotateMinutes"); schedule() }
    }
    var clock: Bool {
        get { defaults.bool(forKey: "saverClock") }
        set { defaults.set(newValue, forKey: "saverClock"); schedule() }
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        schedule()
    }

    func schedule(after seconds: TimeInterval = 1) {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: seconds, repeats: false) { [weak self] _ in
            Task { @MainActor in await self?.write() }
        }
    }

    @discardableResult
    func write() async -> Bool {
        guard let web = source?(),
              let text = try? await web.evaluateJavaScript(Self.dump) as? String,
              var object = (try? JSONSerialization.jsonObject(with: Data(text.utf8))) as? [String: Any] else { return false }
        object["version"] = 1
        object["app"] = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""
        object["saver"] = ["choice": choice, "rotateMinutes": rotateMinutes, "clock": clock] as [String: Any]
        do {
            try FileManager.default.createDirectory(at: Self.folder, withIntermediateDirectories: true)
            try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]).write(to: file, options: .atomic)
            return true
        } catch {
            log("couldn't write saver.json: \(error.localizedDescription)")
            return false
        }
    }
}
