import Cocoa
import WebKit

/// A still of the wallpaper for each display. A window at desktop level
/// doesn't show on the lock screen or login window, which draw the desktop
/// *picture*, so on request we render the live wallpaper to a PNG and make
/// it the real desktop picture (SPEC §10.21).
@MainActor
enum Still {
    static var folder: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("Wallpapers", isDirectory: true)
    }

    /// Render one display's page at its native pixel size, to a PNG.
    static func render(_ screen: DesktopScreen) async -> URL? {
        guard let image = try? await screen.web.takeSnapshot(configuration: WKSnapshotConfiguration()),
              let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff),
              let png = rep.representation(using: .png, properties: [:]) else { return nil }
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let url = folder.appendingPathComponent("still-\(screen.displayID).png")
        do { try png.write(to: url, options: .atomic) } catch { return nil }
        return url
    }

    /// Make each display's still its real desktop picture. Returns how many were set.
    static func setDesktopPictures(_ desktop: Desktop) async -> Int {
        var count = 0
        for screen in desktop.screens {
            guard let url = await render(screen),
                  let nsScreen = NSScreen.screens.first(where: { Desktop.displayID($0) == screen.displayID }) else { continue }
            do {
                try NSWorkspace.shared.setDesktopImageURL(url, for: nsScreen, options: [
                    .imageScaling: NSImageScaling.scaleProportionallyUpOrDown.rawValue,
                    .allowClipping: true,
                ])
                count += 1
            } catch {
                log("couldn't set the desktop picture: \(error.localizedDescription)")
            }
        }
        return count
    }
}
