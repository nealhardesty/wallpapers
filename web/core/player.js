// The player: index.html. Decides which wallpaper to show, runs it in a
// stage iframe, crossfades between them, owns the global keys, and hosts the
// panel (core/panel.js). Talks to the stage only through postMessage (see
// core/stage.js).

(function (WP) {
    'use strict';

    const params = WP.parseParams(location.search);
    const host = params.host === 'android' ? 'android'
        : location.protocol === 'chrome-extension:' ? 'extension' : 'standalone';
    const FADE_MS = 600;
    const REBUILD_MS = 400;

    let choice = null;   // what the user picked: a wallpaper id or 'seasonal'
    let stage = null;    // { id, frame, ready }
    let panelOnReady = params.panel === 'open';
    // Power signals, for the policy that caps quality (SPEC §4.8). The
    // browser gives battery and reduced motion; the Android app adds battery
    // saver, heat and its preview by calling WP.power({...}).
    const signals = {
        host,
        batteryAware: WP.store.get('wp:performance')?.batteryAware !== false,
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    };
    let policy = WP.powerPolicy(signals);
    let stats = null;   // the stage's latest, once a second
    let rebuildTimer = null;

    const resolve = id => id === 'seasonal' ? WP.seasonalFor(new Date()) : id;
    const usable = id => WP.entry(id) && !WP.entry(id).disabled;

    // ?w= wins for this page load only; otherwise the saved choice, and
    // Seasonal on first run.
    function initialChoice() {
        if (params.w) {
            if (usable(params.w)) return params.w;
            console.warn(`wallpapers: ignoring unknown or disabled w=${params.w}`);
        }
        const saved = WP.store.get('wp:current');
        return usable(saved) ? saved : 'seasonal';
    }

    function stageUrl(id) {
        const query = new URLSearchParams({ w: id });
        for (const key of ['date', 'theme', 'host', 'tier', 'hud']) if (params[key]) query.set(key, params[key]);
        return `stage.html?${query}`;
    }

    // Render scale: in a browser the stage lowers its own pixel ratio. In
    // the Android app the surface itself shrinks (SPEC §4.8), so the
    // player tells the app.
    const app = window.WallpapersApp;
    const scale = s => app?.setRenderScale(s);

    function mount(id) {
        clearTimeout(rebuildTimer);
        const previous = stage;
        const frame = document.createElement('iframe');
        frame.className = 'stage entering';
        frame.title = WP.entry(id).name;
        frame.src = stageUrl(id);
        // The stage plans its own quality from the same inputs; sizing the
        // Android surface now saves a resize once it starts.
        const planned = WP.planQuality({
            entry: WP.entry(id), policy: WP.powerPolicy({ host, reducedMotion: signals.reducedMotion, batteryAware: signals.batteryAware }),
            mode: WP.modeOf({ override: params.tier, saved: WP.store.get('wp:performance') }),
            memory: WP.store.get(`wp:perf:${id}`),
        });
        scale(planned.quality.renderScale);
        document.body.prepend(frame);
        const mounted = stage = { id, frame, ready: false };
        app?.setAccent(WP.entry(id).accent || '#000000');

        const reveal = () => {
            if (mounted.revealed) return;
            mounted.revealed = true;
            frame.classList.remove('entering');
            if (previous) setTimeout(() => previous.frame.remove(), FADE_MS + 50);
        };
        mounted.reveal = reveal;
        // A wallpaper that never reports ready still gets shown.
        setTimeout(reveal, 4000);
    }

    function show(next, { persist = false } = {}) {
        choice = next;
        if (persist) {
            WP.store.set('wp:current', next);
            // A pick from the keyboard or panel replaces a ?w= override, so
            // a reload shows what was picked.
            if (params.w) {
                delete params.w;
                const url = new URL(location.href);
                url.searchParams.delete('w');
                history.replaceState(null, '', url);
            }
        }
        const id = resolve(next);
        if (!stage || stage.id !== id) mount(id);
        WP.panel.refresh();
    }

    function label(id) {
        const entry = WP.entry(id);
        if (id !== 'seasonal') return `${entry.icon} ${entry.name}`;
        const now = WP.entry(resolve(id));
        return `${entry.icon} ${entry.name}: ${now.icon} ${now.name}`;
    }

    function cycle(step) {
        const order = ['seasonal', ...WP.showable().map(entry => entry.id)];
        const next = order[(order.indexOf(choice) + step + order.length) % order.length];
        show(next, { persist: true });
        if (!WP.panel.isOpen) toast(label(next));
    }

    const post = message => stage?.frame.contentWindow?.postMessage(message, '*');

    // Settings the panel changed. Wallpapers that can apply them live do;
    // the stage asks for a rebuild otherwise, debounced so a slider drag
    // rebuilds once it settles.
    function applySettings(id, config) {
        if (stage?.id === id) post({ wp: 'apply', config });
    }

    function rebuild() {
        clearTimeout(rebuildTimer);
        rebuildTimer = setTimeout(() => stage && mount(stage.id), REBUILD_MS);
    }

    // wp:performance holds only what differs from Auto and battery-aware.
    function savePerformance(patch) {
        const saved = { mode: 'auto', batteryAware: true, ...WP.store.get('wp:performance'), ...patch };
        const kept = {};
        if (saved.mode !== 'auto') kept.mode = saved.mode;
        if (!saved.batteryAware) kept.batteryAware = false;
        WP.store.set('wp:performance', Object.keys(kept).length ? kept : null);
    }

    function setMode(mode) {
        savePerformance({ mode });
        post({ wp: 'mode' });
    }

    function setBatteryAware(on) {
        savePerformance({ batteryAware: on });
        power({ batteryAware: on });
    }

    function power(changes = {}) {
        Object.assign(signals, changes);
        policy = WP.powerPolicy(signals);
        post({ wp: 'power', policy });
    }
    WP.power = power;
    // Android's home-screen pages, 0 to 1, for wallpapers that pan with them.
    WP.scroll = x => post({ wp: 'scroll', x });

    // Another page changed the settings: another tab, or on Android the
    // settings screen. Follow it.
    window.addEventListener('storage', event => {
        if (!event.key?.startsWith('wp:') || !stage) return;
        if (event.key === 'wp:current' && !params.w) {
            const saved = WP.store.get('wp:current');
            if (saved && saved !== choice && usable(saved)) show(saved);
        } else if (event.key === `wp:${stage.id}`) {
            rebuild();
        } else if (event.key === 'wp:performance') {
            signals.batteryAware = WP.store.get('wp:performance')?.batteryAware !== false;
            power();
            post({ wp: 'mode' });
        }
        WP.panel.refresh();
    });

    navigator.getBattery?.().then(battery => {
        const read = () => power({ battery: { charging: battery.charging, level: battery.level } });
        battery.addEventListener('chargingchange', read);
        battery.addEventListener('levelchange', read);
        read();
    }).catch(() => {});
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', event => power({ reducedMotion: event.matches }));

    // ?hud=1: frame rate, frame cost, rung and power, for tuning.
    const hud = params.hud ? document.body.appendChild(WP.h('div', { class: 'hud', 'aria-hidden': 'true' })) : null;
    function describe(s) {
        const rung = s.rung === null ? 'pinned' : `rung ${s.rung + 1}/${s.of}`;
        return `${s.label} · ${s.idle ? 'idle' : `${s.fps} fps`} · ${s.ms.toFixed(1)} ms · ${rung} · ${s.reasons.join(', ') || 'no power limits'}`;
    }

    function toggleFullscreen() {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen().catch(() => {});
    }

    function focusStage() {
        if (stage && document.hasFocus()) stage.frame.focus();
    }

    // ---- Key help (?) -------------------------------------------------------
    let help = null;
    function toggleHelp(force) {
        if (!help) {
            help = WP.h('div', { class: 'help', role: 'dialog', 'aria-label': 'Keys', hidden: true });
            document.body.append(help);
        }
        const opening = force ?? help.hidden;
        if (opening) {
            const entry = WP.entry(resolve(choice));
            const names = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓' };
            const row = (keys, text) => [WP.h('dt', {}, ...keys.flatMap((k, i) => [i ? ' ' : '', WP.h('kbd', {}, names[k] || k.toUpperCase())])), WP.h('dd', {}, text)];
            help.replaceChildren(
                WP.h('h2', {}, 'Keys'),
                WP.h('dl', {},
                    row([','], 'Settings and wallpapers'),
                    row(['[', ']'], 'Previous or next wallpaper'),
                    row(['←', '→'], 'Switch, while settings are open'),
                    row(['F'], 'Fullscreen'),
                    row(['?'], 'This list'),
                    row(['Esc'], 'Close')),
                ...(entry.keys?.length ? [
                    WP.h('h3', {}, `${entry.icon} ${entry.name}`),
                    WP.h('dl', {}, ...entry.keys.map(k => row(k.keys, k.label))),
                ] : []),
                WP.h('h3', {}, 'On a touch screen'),
                WP.h('p', { style: 'margin: 0; color: #c9cede' }, 'Press and hold the top-right corner to open settings.'));
        }
        help.hidden = !opening;
    }

    // ---- Keys ---------------------------------------------------------------
    function key(name, event) {
        const typing = event?.target?.closest?.('input, select, textarea');
        if (name === 'Escape') {
            if (help && !help.hidden) toggleHelp(false);
            else WP.panel.close();
        } else if (typing) {
            return;
        } else if (name === ',') {
            WP.panel.toggle();
        } else if (name === '[') cycle(-1);
        else if (name === ']') cycle(1);
        else if ((name === 'ArrowLeft' || name === 'ArrowRight') && WP.panel.isOpen) {
            event?.preventDefault();
            cycle(name === 'ArrowLeft' ? -1 : 1);
        } else if (name === 'f' || name === 'F') toggleFullscreen();
        else if (name === '?') toggleHelp();
        else if (!WP.panel.isOpen && WP.entry(resolve(choice)).keys) {
            // A wallpaper key pressed while the player has focus: hand it on.
            post({ wp: 'key', key: name, shift: !!event?.shiftKey });
        }
    }

    let toastTimer = null;
    function toast(text, ms = 1600) {
        const element = document.getElementById('toast');
        element.textContent = text;
        element.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => element.classList.remove('show'), ms);
    }

    window.addEventListener('message', event => {
        const message = event.data;
        if (!stage || event.source !== stage.frame.contentWindow || !message?.wp) return;
        if (message.wp === 'ready') {
            stage.ready = true;
            stage.reveal();
            if (policy.reasons.length) post({ wp: 'power', policy });
            if (panelOnReady) {
                panelOnReady = false;
                WP.panel.open();
            } else if (!WP.panel.isOpen) {
                focusStage();
            }
        } else if (message.wp === 'key') {
            key(message.key);
        } else if (message.wp === 'quality') {
            scale(message.quality.renderScale);
        } else if (message.wp === 'stats') {
            stats = message;
            if (hud) hud.textContent = describe(message);
            WP.panel.stats?.(message);
        } else if (message.wp === 'rebuild') {
            rebuild();
        } else if (message.wp === 'corner') {
            document.getElementById('gear').classList.toggle('show', !!message.near);
        } else if (message.wp === 'toast') {
            toast(message.text, message.ms);
        } else if (message.wp === 'error') {
            console.error(`wallpapers: ${message.id} failed: ${message.message}`);
            toast(`⚠️ ${WP.entry(message.id).name} failed to start`, 4000);
            stage.reveal();
        }
    });

    window.addEventListener('keydown', event => {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        key(event.key, event);
    });

    // Seasonal rolls over by itself, at most a minute late.
    setInterval(() => {
        if (choice === 'seasonal' && stage && resolve('seasonal') !== stage.id) {
            mount(resolve('seasonal'));
            WP.panel.refresh();
        }
    }, 60 * 1000);

    WP.player = {
        start() {
            // Installable ("Add to Home screen") when served; Chrome won't
            // read a manifest from disk, so it isn't linked there.
            if (location.protocol.startsWith('http')) {
                document.head.append(Object.assign(document.createElement('link'), { rel: 'manifest', href: 'app.webmanifest' }));
            }
            document.getElementById('gear').addEventListener('click', () => WP.panel.open());
            show(initialChoice());
            if (!WP.store.get('wp:hinted') && !params.w) {
                WP.store.set('wp:hinted', true);
                const touch = matchMedia('(hover: none)').matches;
                toast(touch ? 'Hold the top-right corner for wallpapers and settings'
                    : 'Press , for wallpapers and settings, or ? for all keys', 5000);
            }
        },
        show: (id, options) => show(id, options),
        cycle,
        setMode,
        setBatteryAware,
        describe,
        applySettings,
        focusStage,
        toast,
        get choice() { return choice; },
        get resolved() { return resolve(choice); },
        get stage() { return stage && { id: stage.id, ready: stage.ready }; },
        get stats() { return stats; },
        get policy() { return policy; },
        get host() { return host; },
    };

    // Scripts load with defer (no inline script: the extension's CSP forbids
    // it), so the page is parsed by now.
    WP.player.start();
})(globalThis.WP);
