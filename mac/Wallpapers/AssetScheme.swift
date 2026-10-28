import WebKit
import UniformTypeIdentifiers

/// Serves `web/` at `wp://app/` so every web view in the app shares one
/// origin (and one localStorage), with no file access and no open port. The
/// page's `bing.json` is made natively, like Android's BingJson.kt: a page
/// can't fetch Bing's archive itself (no CORS), but the app can (SPEC §4.6).
final class AssetScheme: NSObject, WKURLSchemeHandler {
    static let scheme = "wp"
    static let origin = "wp://app"

    private let root: URL
    private let bing = BingArchive()
    private var active = Set<ObjectIdentifier>()

    init(root: URL) {
        self.root = root.standardizedFileURL
    }

    func webView(_ webView: WKWebView, start task: any WKURLSchemeTask) {
        guard let url = task.request.url else { return task.didFailWithError(URLError(.badURL)) }
        let path = url.path.isEmpty || url.path == "/" ? "/index.html" : url.path
        if path == "/bing.json" {
            let id = ObjectIdentifier(task)
            active.insert(id)
            bing.json { [weak self] status, body in
                guard let self, self.active.remove(id) != nil else { return }
                self.send(task, url: url, status: status, type: "application/json", body: body)
            }
            return
        }
        let file = root.appendingPathComponent(String(path.dropFirst())).standardizedFileURL
        guard file.path.hasPrefix(root.path + "/"),
              let body = try? Data(contentsOf: file) else {
            return send(task, url: url, status: 404, type: "text/plain", body: Data("Not found".utf8))
        }
        send(task, url: url, status: 200, type: Self.mime(file.pathExtension), body: body)
    }

    func webView(_ webView: WKWebView, stop task: any WKURLSchemeTask) {
        active.remove(ObjectIdentifier(task))
    }

    private func send(_ task: any WKURLSchemeTask, url: URL, status: Int, type: String, body: Data) {
        let headers = [
            "Content-Type": type.hasPrefix("text/") || type.contains("json") || type.contains("javascript") ? "\(type); charset=utf-8" : type,
            "Content-Length": String(body.count),
            "Cache-Control": "no-cache",
        ]
        task.didReceive(HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!)
        task.didReceive(body)
        task.didFinish()
    }

    private static func mime(_ ext: String) -> String {
        switch ext.lowercased() {
        case "html": return "text/html"
        case "js", "mjs": return "text/javascript"
        case "css": return "text/css"
        case "json", "webmanifest": return "application/json"
        case "svg": return "image/svg+xml"
        case "webp": return "image/webp"
        default: return UTType(filenameExtension: ext)?.preferredMIMEType ?? "application/octet-stream"
        }
    }
}

/// Bing's last eight images of the day, in the shape tools/bing.mjs writes,
/// kept for an hour. The only network the app itself uses.
final class BingArchive {
    private static let archive = URL(string: "https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=8&mkt=en-US")!
    private var cached: (at: Date, body: Data)?

    func json(_ done: @escaping @MainActor (Int, Data) -> Void) {
        if let cached, Date().timeIntervalSince(cached.at) < 3600 {
            return DispatchQueue.main.async { done(200, cached.body) }
        }
        var request = URLRequest(url: Self.archive)
        request.timeoutInterval = 8
        URLSession.shared.dataTask(with: request) { data, _, _ in
            let body = data.flatMap(Self.reshape)
            DispatchQueue.main.async {
                if let body { self.cached = (Date(), body) }
                done(body == nil ? 503 : 200, body ?? Data())
            }
        }.resume()
    }

    private static func reshape(_ data: Data) -> Data? {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let images = object["images"] as? [[String: Any]] else { return nil }
        let kept: [[String: String]] = images.compactMap { image in
            guard let url = image["url"] as? String, url.hasPrefix("/th?id=") else { return nil }
            var entry = ["url": url]
            for key in ["copyright", "copyrightlink", "startdate"] { entry[key] = image[key] as? String ?? "" }
            return entry
        }
        return try? JSONSerialization.data(withJSONObject: ["images": kept])
    }
}
