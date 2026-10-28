import Cocoa

/// A quiet clock over the wallpaper: the time, and under it the date. It
/// slips to a new spot every minute so it never sits in one place, and
/// fades while it moves.
final class ClockOverlay: NSView {
    private let time = NSTextField(labelWithString: "")
    private let date = NSTextField(labelWithString: "")
    private var timer: Timer?
    private let dateFormat = DateFormatter()

    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        dateFormat.setLocalizedDateFormatFromTemplate("EEEEMMMMd")
        let shadow = NSShadow()
        shadow.shadowColor = NSColor.black.withAlphaComponent(0.6)
        shadow.shadowBlurRadius = 12
        shadow.shadowOffset = .zero
        for label in [time, date] {
            label.textColor = NSColor.white.withAlphaComponent(0.88)
            label.shadow = shadow
            label.alignment = .left
            addSubview(label)
        }
    }

    required init?(coder: NSCoder) { fatalError() }

    override func hitTest(_ point: NSPoint) -> NSView? { nil }

    /// Sized to the screen it sits on: the time is a tenth of its height.
    func fit(hostHeight: CGFloat) {
        let size = max(40, hostHeight / 10)
        time.font = .systemFont(ofSize: size, weight: .thin)
        date.font = .systemFont(ofSize: size / 3.2, weight: .light)
    }

    func start(centered: Bool = false) {
        isHidden = false
        if let host = superview { fit(hostHeight: host.bounds.height) }
        refresh()
        place(animated: false, centered: centered)
        timer?.invalidate()
        let t = Timer(fire: Date().addingTimeInterval(60 - Date().timeIntervalSince1970.truncatingRemainder(dividingBy: 60)),
                      interval: 60, repeats: true) { [weak self] _ in
            self?.refresh()
            self?.place(animated: true, centered: centered)
        }
        RunLoop.main.add(t, forMode: .common)
        timer = t
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }

    func refresh() {
        let now = Date()
        let hours = DateFormatter()
        hours.timeStyle = .short
        hours.dateStyle = .none
        time.stringValue = hours.string(from: now).replacingOccurrences(of: " ", with: " ")
        date.stringValue = dateFormat.string(from: now)
        time.sizeToFit()
        date.sizeToFit()
        let width = max(time.frame.width, date.frame.width)
        time.frame.origin = NSPoint(x: 0, y: date.frame.height + 2)
        date.frame.origin = .zero
        contentSize = NSSize(width: width, height: time.frame.maxY)
    }

    private var contentSize = NSSize.zero

    private func place(animated: Bool, centered: Bool) {
        guard let host = superview else { return }
        let margin = host.bounds.height * 0.06
        let room = NSSize(width: max(0, host.bounds.width - contentSize.width - 2 * margin),
                          height: max(0, host.bounds.height - contentSize.height - 2 * margin))
        let origin = centered
            ? NSPoint(x: (host.bounds.width - contentSize.width) / 2, y: (host.bounds.height - contentSize.height) / 2)
            : NSPoint(x: margin + CGFloat.random(in: 0...room.width), y: margin + CGFloat.random(in: 0...room.height))
        let apply = { self.frame = NSRect(origin: origin, size: self.contentSize) }
        guard animated else { return apply() }
        NSAnimationContext.runAnimationGroup({ context in
            context.duration = 1.2
            self.animator().alphaValue = 0
        }, completionHandler: {
            apply()
            NSAnimationContext.runAnimationGroup { context in
                context.duration = 1.2
                self.animator().alphaValue = 1
            }
        })
    }
}
