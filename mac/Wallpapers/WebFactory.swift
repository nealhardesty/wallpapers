import WebKit

/// How the app builds a web view onto our pages. One data store for all of
/// them, so the desktop windows and the settings window share settings; the
/// self-test swaps in a throwaway one so it never touches the real settings.
@MainActor
enum WebFactory {
    static var dataStore: WKWebsiteDataStore = .default()
    static var scheme: AssetScheme!
    /// Told when a page changes a `wp:` setting, to mirror them for the screen saver.
    static var sync: SaverSync?

    /// `quiet` marks the first-run hint as already shown: a wallpaper that
    /// says "Press , for settings" is wrong on a desktop that ignores keys.
    static func make(frame: CGRect, quiet: Bool, delegate: WebDelegate) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = dataStore
        config.setURLSchemeHandler(scheme, forURLScheme: AssetScheme.scheme)
        if quiet {
            config.userContentController.addUserScript(WKUserScript(
                source: "try { localStorage.setItem('wp:hinted', 'true'); } catch (e) {}",
                injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        if let sync {
            config.userContentController.add(sync, name: SaverSync.handlerName)
            config.userContentController.addUserScript(WKUserScript(
                source: SaverSync.script, injectionTime: .atDocumentStart, forMainFrameOnly: false))
        }
        let web = WKWebView(frame: frame, configuration: config)
        web.navigationDelegate = delegate
        web.uiDelegate = delegate
        web.underPageBackgroundColor = .black
        web.autoresizingMask = [.width, .height]
        web.isInspectable = ProcessInfo.processInfo.environment["WP_DEBUG"] != nil
        return web
    }

    static func url(_ query: [String: String]) -> URL {
        var components = URLComponents(string: AssetScheme.origin + "/index.html")!
        components.queryItems = query.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) }
        return components.url!
    }
}

/// Keeps our pages ours: a link (Bing's photo credit) opens in the browser,
/// never in the wallpaper.
final class WebDelegate: NSObject, WKNavigationDelegate, WKUIDelegate {
    var didFinish: ((WKWebView) -> Void)?

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let url = action.request.url else { return .cancel }
        if url.scheme == AssetScheme.scheme || url.scheme == "about" { return .allow }
        if ["http", "https"].contains(url.scheme) { NSWorkspace.shared.open(url) }
        return .cancel
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url, ["http", "https"].contains(url.scheme) { NSWorkspace.shared.open(url) }
        return nil
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { didFinish?(webView) }
}
