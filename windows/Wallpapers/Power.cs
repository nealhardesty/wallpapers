using System.Windows.Forms;
using PowerState = Wallpapers.Core.PowerState;   // WinForms has one too

namespace Wallpapers;

/// Every power and session signal Windows has, reduced to one PowerState (SPEC §10.25.9): lock and
/// disconnect from session notifications, display and sleep from WM_POWERBROADCAST, battery and Energy
/// Saver from power-setting notifications, and every 2 s the ones Windows doesn't announce (a fullscreen
/// game or presentation, the screen saver, Remote Desktop) plus the session's lock and connection state
/// again, so a missed notification can't leave the wallpaper hidden.
sealed class Power : IDisposable
{
    public PowerState State { get; private set; } = new();
    /// The state really changed (logged as `power: <Describe()>`).
    public event Action? Changed;

    readonly System.Windows.Forms.Timer poll = new() { Interval = 2000 };
    readonly List<IntPtr> registrations = [];
    MessageWindow? window;
    bool sessionRegistered;
    /// Poll ticks seen while asleep (PowerSignals.Tick): the second clears a missed resume.
    int ticksAsleep;
    /// Windows 11 24H2 renamed battery saver Energy Saver and gave it a new GUID.
    static readonly Guid SaverGuid = Environment.OSVersion.Version.Build >= 26100 ? N.GUID_ENERGY_SAVER_STATUS : N.GUID_POWER_SAVING_STATUS;

    public void Start()
    {
        window = new MessageWindow(this);
        // Read before registering: the registrations answer at once with the current display and
        // saver states, and those land on top of this.
        State = Polled(new PowerState(Battery: ReadBattery()));
        Log.Info($"power: {State.Describe()}");
        sessionRegistered = N.WTSRegisterSessionNotification(window.Handle, N.NOTIFY_FOR_THIS_SESSION);
        if (!sessionRegistered) Log.Warn($"power: no session notifications (error {Marshal.GetLastWin32Error()}); lock and disconnect come from the 2 s poll");
        foreach (var guid in new[] { N.GUID_CONSOLE_DISPLAY_STATE, N.GUID_ACDC_POWER_SOURCE, N.GUID_BATTERY_PERCENTAGE_REMAINING, SaverGuid })
        {
            var r = N.RegisterPowerSettingNotification(window.Handle, guid, N.DEVICE_NOTIFY_WINDOW_HANDLE);
            if (r != IntPtr.Zero) registrations.Add(r);
            else Log.Warn($"power: can't register for {guid} (error {Marshal.GetLastWin32Error()})");
        }
        poll.Tick += (_, _) => OnPoll();
        poll.Start();
    }

    void OnPoll()
    {
        var (next, ticks) = PowerSignals.Tick(State, ticksAsleep);
        if (State.Asleep && !next.Asleep) Log.Info("power: no resume message; awake again");
        ticksAsleep = ticks;
        Set(Polled(next));
    }

    /// The signals nothing announces, read now.
    static PowerState Polled(PowerState s)
    {
        var fullscreen = N.SHQueryUserNotificationState(out var quns) == 0 && quns is N.QUNS_RUNNING_D3D_FULL_SCREEN or N.QUNS_PRESENTATION_MODE;
        var saver = N.SystemParametersInfo(N.SPI_GETSCREENSAVERRUNNING, 0, out var running, 0) && running != 0;
        s = s with { FullscreenApp = fullscreen, SaverRunning = saver, Remote = N.GetSystemMetrics(N.SM_REMOTESESSION) != 0 };
        return N.SessionState() is { } session ? s with { Locked = session.Locked, Disconnected = session.Disconnected } : s;
    }

    /// Null without a system battery (a desktop), so the page keeps its own reading.
    static BatteryInfo? ReadBattery()
    {
        // BatteryFlag 128: no system battery; 255: unknown. BatteryLifePercent 255: unknown.
        if (!N.GetSystemPowerStatus(out var p) || p.BatteryFlag is 128 or 255 || p.BatteryLifePercent > 100) return null;
        return new BatteryInfo(p.ACLineStatus == 1, p.BatteryLifePercent / 100.0);
    }

    void Set(PowerState next)
    {
        if (next == State) return;
        State = next;
        Log.Info($"power: {next.Describe()}");
        Changed?.Invoke();
    }

    void OnSession(int change)
    {
        PowerEvent? e = change switch
        {
            N.WTS_SESSION_LOCK => PowerEvent.Lock,
            N.WTS_SESSION_UNLOCK => PowerEvent.Unlock,
            N.WTS_CONSOLE_DISCONNECT or N.WTS_REMOTE_DISCONNECT => PowerEvent.Disconnect,
            N.WTS_CONSOLE_CONNECT or N.WTS_REMOTE_CONNECT => PowerEvent.Connect,
            _ => null,
        };
        if (e is not { } ev) return;
        Log.Info($"power: session {ev.ToString().ToLowerInvariant()}");
        // A connect can switch between the console and Remote Desktop: read the polled signals again too.
        var next = PowerSignals.Apply(State, ev);
        Set(ev == PowerEvent.Connect ? Polled(next) : next);
    }

    void OnPowerBroadcast(int kind, IntPtr l)
    {
        switch (kind)
        {
            case N.PBT_APMSUSPEND: Log.Info("power: suspending"); ticksAsleep = 0; Set(PowerSignals.Apply(State, PowerEvent.Suspend)); break;
            case N.PBT_APMRESUMEAUTOMATIC or N.PBT_APMRESUMESUSPEND: Log.Info("power: resumed"); Set(PowerSignals.Apply(State, PowerEvent.Resume)); break;
            case N.PBT_POWERSETTINGCHANGE when N.PowerSetting(l) is { } changed:
                var (setting, value) = changed;
                if (setting == N.GUID_CONSOLE_DISPLAY_STATE)
                {
                    Log.Info($"power: display {value switch { 0 => "off", 2 => "dimmed", _ => "on" }}");
                    Set(PowerSignals.Apply(State, value switch { 0 => PowerEvent.DisplayOff, 2 => PowerEvent.DisplayDimmed, _ => PowerEvent.DisplayOn }));
                }
                else if (setting == SaverGuid) Set(State with { EnergySaver = value != 0 });   // ENERGY_SAVER_STATUS: off 0, standard 1, high 2
                // Plugged in or out, or a percent: one reading covers both.
                else if (setting == N.GUID_ACDC_POWER_SOURCE || setting == N.GUID_BATTERY_PERCENTAGE_REMAINING) Set(State with { Battery = ReadBattery() });
                break;
        }
    }

    public void Dispose()
    {
        poll.Stop();
        poll.Dispose();
        foreach (var r in registrations) N.UnregisterPowerSettingNotification(r);
        registrations.Clear();
        if (window != null && sessionRegistered) N.WTSUnRegisterSessionNotification(window.Handle);
        window?.DestroyHandle();
        window = null;
    }

    /// A hidden top-level window: power and session messages go to top-level windows only.
    sealed class MessageWindow : NativeWindow
    {
        readonly Power owner;

        public MessageWindow(Power owner)
        {
            this.owner = owner;
            CreateHandle(new CreateParams { Caption = "WallpapersPower", Style = unchecked((int)N.WS_POPUP), ExStyle = (int)N.WS_EX_TOOLWINDOW });
        }

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == N.WM_WTSSESSION_CHANGE) owner.OnSession((int)m.WParam);
            else if (m.Msg == N.WM_POWERBROADCAST) owner.OnPowerBroadcast((int)m.WParam, m.LParam);
            base.WndProc(ref m);
        }
    }
}
