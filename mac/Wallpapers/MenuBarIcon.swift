import Cocoa

/// The menu bar icon: the project's own artwork (`web/icons/icon.svg`, a
/// window onto a dusk scene with a crescent moon and fireflies) drawn in code
/// at menu bar size, in the SVG's own 128-unit coordinates.
///
/// Two styles, chosen from the menu and kept in UserDefaults:
/// - `monochrome` (the default) is a template image: black and alpha only, and
///   macOS tints it itself, dark on a light menu bar, white on a dark one,
///   inverted while the menu is open, and adjusted for Increase Contrast and
///   Reduce Transparency, like every built-in status item. The window is a
///   solid pane with the moon, the stars, the far ridge and the fireflies cut
///   out of it.
/// - `colour` is the full-colour icon, as the Dock shows it, with a faint
///   white edge so the night sky keeps its shape on a dark menu bar.
enum MenuBarIcon {
    enum Style: String, CaseIterable {
        case monochrome, colour
        var title: String { self == .monochrome ? "Black and White, Like the Rest of the Bar" : "In Colour" }
    }

    static let size: CGFloat = 18
    private static let key = "menuBarIcon"

    static var style: Style {
        get { UserDefaults.standard.string(forKey: key).flatMap(Style.init(rawValue:)) ?? .monochrome }
        set { UserDefaults.standard.set(newValue.rawValue, forKey: key) }
    }

    static func image(_ style: Style) -> NSImage {
        let image = NSImage(size: NSSize(width: size, height: size), flipped: true) { rect in
            guard let cg = NSGraphicsContext.current?.cgContext else { return false }
            cg.saveGState()
            cg.translateBy(x: rect.minX, y: rect.minY)
            cg.scaleBy(x: rect.width / 128, y: rect.height / 128)
            cg.addPath(MenuBarIcon.pane)
            cg.clip()
            switch style {
            case .monochrome: MenuBarIcon.drawMonochrome(cg)
            case .colour: MenuBarIcon.drawColour(cg)
            }
            cg.restoreGState()
            return true
        }
        image.isTemplate = style == .monochrome
        image.accessibilityDescription = "Wallpapers"
        return image
    }

    // MARK: The scene, in the SVG's coordinates

    private static let pane = CGPath(roundedRect: CGRect(x: 8, y: 8, width: 112, height: 112), cornerWidth: 26, cornerHeight: 26, transform: nil)

    /// `M80 26 a20 20 0 1 0 22 26 a16 16 0 1 1 -22 -26 z`: the outer arc is a
    /// circle of radius 20 about (83, 45.8); the inner one, whose radius is
    /// too short for its chord, is the half circle about the chord's middle.
    private static let moon: CGPath = {
        let a = CGPoint(x: 80, y: 26), b = CGPoint(x: 102, y: 52)
        let outer = CGPoint(x: 82.99, y: 45.77), inner = CGPoint(x: 91, y: 39)
        func angle(_ p: CGPoint, about o: CGPoint) -> CGFloat { atan2(p.y - o.y, p.x - o.x) }
        let path = CGMutablePath()
        path.addArc(center: outer, radius: 20, startAngle: angle(a, about: outer), endAngle: angle(b, about: outer), clockwise: true)
        path.addArc(center: inner, radius: 17.03, startAngle: angle(b, about: inner), endAngle: angle(a, about: inner), clockwise: false)
        path.closeSubpath()
        return path
    }()

    /// The far ridge, `M8 92 C30 70 52 76 70 88 S104 76 120 82`, open.
    private static let farRidge: CGMutablePath = {
        let path = CGMutablePath()
        path.move(to: CGPoint(x: 8, y: 92))
        path.addCurve(to: CGPoint(x: 70, y: 88), control1: CGPoint(x: 30, y: 70), control2: CGPoint(x: 52, y: 76))
        path.addCurve(to: CGPoint(x: 120, y: 82), control1: CGPoint(x: 88, y: 100), control2: CGPoint(x: 104, y: 76))
        return path
    }()

    /// The near ridge, `M8 104 C34 90 60 96 80 104 S110 98 120 100`, open.
    private static let nearRidge: CGMutablePath = {
        let path = CGMutablePath()
        path.move(to: CGPoint(x: 8, y: 104))
        path.addCurve(to: CGPoint(x: 80, y: 104), control1: CGPoint(x: 34, y: 90), control2: CGPoint(x: 60, y: 96))
        path.addCurve(to: CGPoint(x: 120, y: 100), control1: CGPoint(x: 100, y: 112), control2: CGPoint(x: 110, y: 98))
        return path
    }()

    /// A ridge closed down to the pane's bottom edge.
    private static func hill(_ ridge: CGPath) -> CGPath {
        let path = CGMutablePath()
        path.addPath(ridge)
        path.addLine(to: CGPoint(x: 120, y: 120))
        path.addLine(to: CGPoint(x: 8, y: 120))
        path.closeSubpath()
        return path
    }

    private static func circle(_ at: CGPoint, _ r: CGFloat) -> CGRect { CGRect(x: at.x - r, y: at.y - r, width: 2 * r, height: 2 * r) }

    /// Centre, radius and opacity.
    private static let stars: [(CGPoint, CGFloat, CGFloat)] = [(CGPoint(x: 30, y: 30), 3, 0.9), (CGPoint(x: 52, y: 22), 2, 0.7), (CGPoint(x: 44, y: 50), 2.5, 0.8)]
    /// Centre, radius and the reach of the glow.
    private static let fireflies: [(CGPoint, CGFloat, CGFloat)] = [(CGPoint(x: 40, y: 98), 3.5, 11), (CGPoint(x: 92, y: 108), 2.5, 8)]

    /// One even-odd fill: the pane, with the moon, the stars, the fireflies
    /// and the far ridge as holes (none of them overlap). The small details
    /// grow a little, to survive 18 points.
    private static func drawMonochrome(_ cg: CGContext) {
        let mask = CGMutablePath()
        mask.addPath(pane)
        mask.addPath(moon)
        for (at, r, _) in stars { mask.addEllipse(in: circle(at, r + 1.5)) }
        for (at, r, _) in fireflies { mask.addEllipse(in: circle(at, r + 3)) }
        mask.addPath(farRidge.copy(strokingWithWidth: 5, lineCap: .round, lineJoin: .round, miterLimit: 10))
        cg.setFillColor(.black)
        cg.addPath(mask)
        cg.fillPath(using: .evenOdd)
    }

    private static func rgb(_ hex: UInt32, _ alpha: CGFloat = 1) -> CGColor {
        CGColor(srgbRed: CGFloat((hex >> 16) & 0xff) / 255, green: CGFloat((hex >> 8) & 0xff) / 255, blue: CGFloat(hex & 0xff) / 255, alpha: alpha)
    }

    private static func drawColour(_ cg: CGContext) {
        let space = CGColorSpace(name: CGColorSpace.sRGB)!
        if let sky = CGGradient(colorsSpace: space, colors: [rgb(0x1c1f4a), rgb(0x5b3a7a), rgb(0xe0875a)] as CFArray, locations: [0, 0.55, 0.85]) {
            cg.drawLinearGradient(sky, start: CGPoint(x: 64, y: 8), end: CGPoint(x: 64, y: 120), options: [.drawsAfterEndLocation])
        }
        cg.setFillColor(rgb(0xffe9b0))
        cg.addPath(moon)
        cg.fillPath()
        for (at, r, alpha) in stars {
            cg.setFillColor(rgb(0xffffff, alpha))
            cg.fillEllipse(in: circle(at, r))
        }
        cg.setFillColor(rgb(0x2c3f6b))
        cg.addPath(hill(farRidge))
        cg.fillPath()
        cg.setFillColor(rgb(0x14213d))
        cg.addPath(hill(nearRidge))
        cg.fillPath()
        for (at, r, reach) in fireflies {
            if let glow = CGGradient(colorsSpace: space, colors: [rgb(0xffd166, 0.7), rgb(0xffd166, 0)] as CFArray, locations: [0, 1]) {
                cg.drawRadialGradient(glow, startCenter: at, startRadius: 0, endCenter: at, endRadius: reach, options: [])
            }
            cg.setFillColor(rgb(0xfff3c4))
            cg.fillEllipse(in: circle(at, r))
        }
        // A faint edge: invisible on a light bar, where the sky's own dark
        // blue stands out, and a frame on a dark one. Half of it is clipped
        // away, leaving half a point.
        cg.setStrokeColor(rgb(0xffffff, 0.4))
        cg.setLineWidth(7)
        cg.addPath(pane)
        cg.strokePath()
    }
}
