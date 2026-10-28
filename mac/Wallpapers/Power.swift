import Cocoa
import IOKit.ps

/// What the Mac knows about power and visibility, as the JSON that the
/// page's `WP.power()` takes (SPEC §4.8), the same shape Android's Power.kt
/// sends. Occlusion is per window; everything here is for the whole Mac.
final class PowerMonitor {
    var onChange: (() -> Void)?

    private(set) var asleep = false
    private(set) var locked = false
    private(set) var saverRunning = false
    /// The menu's Pause.
    var paused = false { didSet { onChange?() } }

    /// Nothing on any display can be seen, whatever the windows say.
    var hiddenEverywhere: Bool { asleep || locked || saverRunning || paused }

    private var batterySource: CFRunLoopSource?

    /// Whether the session is locked right now: the app may start behind the lock screen.
    static func sessionLocked() -> Bool {
        (CGSessionCopyCurrentDictionary() as? [String: Any])?["CGSSessionScreenIsLocked"] as? Bool ?? false
    }

    func start() {
        locked = Self.sessionLocked()
        let workspace = NSWorkspace.shared.notificationCenter
        let set: (Notification.Name, ReferenceWritableKeyPath<PowerMonitor, Bool>, Bool) -> Void = { name, key, value in
            workspace.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                self?[keyPath: key] = value
                self?.onChange?()
            }
        }
        set(NSWorkspace.screensDidSleepNotification, \.asleep, true)
        set(NSWorkspace.screensDidWakeNotification, \.asleep, false)
        set(NSWorkspace.willSleepNotification, \.asleep, true)
        set(NSWorkspace.didWakeNotification, \.asleep, false)

        let distributed = DistributedNotificationCenter.default()
        for (name, key, value) in [
            ("com.apple.screenIsLocked", \PowerMonitor.locked, true),
            ("com.apple.screenIsUnlocked", \PowerMonitor.locked, false),
            ("com.apple.screensaver.didstart", \PowerMonitor.saverRunning, true),
            ("com.apple.screensaver.didstop", \PowerMonitor.saverRunning, false),
        ] {
            distributed.addObserver(forName: .init(name), object: nil, queue: .main) { [weak self] _ in
                self?[keyPath: key] = value
                self?.onChange?()
            }
        }

        let center = NotificationCenter.default
        for name in [Notification.Name.NSProcessInfoPowerStateDidChange, ProcessInfo.thermalStateDidChangeNotification] {
            center.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in self?.onChange?() }
        }

        // The battery: the run loop tells us when the source or the level changes.
        let context = Unmanaged.passUnretained(self).toOpaque()
        if let source = IOPSNotificationCreateRunLoopSource({ context in
            guard let context else { return }
            Unmanaged<PowerMonitor>.fromOpaque(context).takeUnretainedValue().onChange?()
        }, context)?.takeRetainedValue() {
            CFRunLoopAddSource(CFRunLoopGetMain(), source, .defaultMode)
            batterySource = source
        }
    }

    /// `{ hidden, saver, thermal, battery }` for one window. `preview` is the
    /// screen saver's little preview, which the policy gives full quality.
    func json(windowVisible: Bool, preview: Bool = false) -> String {
        var state: [String: Any] = [
            "preview": preview,
            "hidden": hiddenEverywhere || !windowVisible,
            "saver": ProcessInfo.processInfo.isLowPowerModeEnabled,
            "thermal": Self.thermal(ProcessInfo.processInfo.thermalState),
        ]
        state["battery"] = Self.battery().map { ["charging": $0.charging, "level": $0.level] } ?? NSNull()
        let data = (try? JSONSerialization.data(withJSONObject: state, options: [.sortedKeys])) ?? Data("{}".utf8)
        return String(decoding: data, as: UTF8.self)
    }

    static func thermal(_ state: ProcessInfo.ThermalState) -> String {
        switch state {
        case .nominal: return "none"
        case .fair: return "light"
        case .serious: return "severe"
        case .critical: return "critical"
        @unknown default: return "none"
        }
    }

    /// The internal battery, or nil on a desktop Mac.
    static func battery() -> (charging: Bool, level: Double)? {
        guard let info = IOPSCopyPowerSourcesInfo()?.takeRetainedValue(),
              let list = IOPSCopyPowerSourcesList(info)?.takeRetainedValue() as? [CFTypeRef] else { return nil }
        for source in list {
            guard let d = IOPSGetPowerSourceDescription(info, source)?.takeUnretainedValue() as? [String: Any],
                  d[kIOPSTypeKey] as? String == kIOPSInternalBatteryType,
                  let current = d[kIOPSCurrentCapacityKey] as? Int,
                  let max = d[kIOPSMaxCapacityKey] as? Int, max > 0 else { continue }
            return (d[kIOPSPowerSourceStateKey] as? String == kIOPSACPowerValue, Double(current) / Double(max))
        }
        return nil
    }
}
