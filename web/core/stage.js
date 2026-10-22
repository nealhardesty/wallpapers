// The stage: the page each wallpaper runs in (stage.html?w=<id>), inside an
// iframe the player owns, or on its own. It sets up the host before any
// wallpaper code loads, so every module gets frame pacing, pausing and a
// DPR cap without knowing about them. Switching wallpapers throws the whole
// iframe away, which is what guarantees nothing leaks between wallpapers.
//
// The player talks to the stage only through postMessage, because file://
// frames can't reach into each other. Messages carry a `wp` field:
//   stage → player  ready {id} · key {key} · error {message}
//   player → stage  settings · tier {tier} · pause · resume

(function (WP) {
    'use strict';

    const params = WP.parseParams(location.search);
    const embedded = window.parent !== window;
    const tell = message => embedded && window.parent.postMessage({ wp: message.type, ...message }, '*');

    // ---- Frame pacing ---------------------------------------------------
    // Every module animates through requestAnimationFrame, so wrapping it
    // here caps the frame rate, pauses, and times each frame for all of
    // them at once (SPEC §4.8).
    const nativeFrame = window.requestAnimationFrame.bind(window);
    const queue = new Map();
    let nextId = 1, scheduled = false, last = -Infinity, paused = false, fps = 0;
    const frames = { count: 0, workMs: 0 };

    function schedule() {
        if (!scheduled && !paused && queue.size) {
            scheduled = true;
            nativeFrame(tick);
        }
    }

    function tick(now) {
        scheduled = false;
        if (paused) return;
        if (!WP.frameDue(now, last, fps)) return schedule();
        last = now;
        const callbacks = [...queue.values()];
        queue.clear();
        const started = performance.now();
        for (const callback of callbacks) {
            try { callback(now); } catch (error) { queueMicrotask(() => { throw error; }); }
        }
        frames.count++;
        frames.workMs += performance.now() - started;
        schedule();
    }

    window.requestAnimationFrame = callback => {
        const id = nextId++;
        queue.set(id, callback);
        schedule();
        return id;
    };
    window.cancelAnimationFrame = id => { queue.delete(id); };

    // ---- Host -------------------------------------------------------------
    const id = WP.entry(params.w) && !WP.entry(params.w).pseudo ? params.w : 'blank';
    const entry = WP.entry(id);
    const kind = params.host === 'android' ? 'android'
        : location.protocol === 'chrome-extension:' ? 'extension' : 'standalone';
    const read = WP.store.get, write = WP.store.set;

    const host = WP.host = {
        kind,
        id,
        params,
        // Space kept clear of the host's own chrome. Android's gesture bar is
        // simulated with ?host=android until the app passes real insets.
        insets: { top: 0, right: 0, bottom: kind === 'android' ? 48 : 0, left: 0 },
        quality: null,
        frames,
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        // Per-wallpaper state that isn't a setting (advent's last-seen day…).
        storage: {
            get: key => read(`wp:${id}:${key}`),
            set: (key, value) => write(`wp:${id}:${key}`, value),
        },
    };

    // ---- Settings -----------------------------------------------------------
    // defaults.js registers values with WP.defaults(); the stored form is
    // overrides only, under wp:<id> (SPEC §4.1).
    const registered = {};
    WP.defaults = (wallpaper, values) => { registered[wallpaper] = values; };
    WP.settings = {
        defaults: () => WP.mergeSettings(registered[id] || {}, null),
        load: () => WP.mergeSettings(registered[id] || {}, read(`wp:${id}`)),
        save: config => { if (!params.thumb) write(`wp:${id}`, WP.diffSettings(registered[id] || {}, config)); },
        reset: () => write(`wp:${id}`, null),
    };

    // ---- Quality ------------------------------------------------------------
    // fps and the DPR cap apply here; renderScale is the player sizing this
    // iframe smaller and scaling it up. devicePixelRatio is [Replaceable],
    // so modules that read it see the cap.
    const nativeDpr = window.devicePixelRatio || 1;
    function applyQuality(tier) {
        host.quality = tier;
        fps = entry.motion === 'slow' ? tier.slowFps : tier.fps;
        window.devicePixelRatio = Math.min(nativeDpr, tier.dpr);
    }
    applyQuality(WP.resolveTier({ override: params.tier, mode: read('wp:performance')?.mode, host: kind }));

    // ---- Pause ----------------------------------------------------------------
    WP.stage = {
        pause() { paused = true; },
        resume() {
            if (!paused) return;
            paused = false;
            last = -Infinity;
            schedule();
        },
    };
    document.addEventListener('visibilitychange', () => document.hidden ? WP.stage.pause() : WP.stage.resume());

    // ---- Legacy dialog support -------------------------------------------------
    // The imported settings dialogs call this homepage helper. It goes away
    // with them when the panel's schema renderer lands (Phase 4).
    window.createInfoIcon = (description, defaultValue) => {
        const icon = document.createElement('span');
        icon.className = 'wp-info';
        icon.textContent = 'ⓘ';
        const tip = document.createElement('div');
        const title = document.createElement('div');
        title.textContent = description;
        tip.appendChild(title);
        if (defaultValue) {
            const value = document.createElement('div');
            value.className = 'wp-info-default';
            value.textContent = `Default: ${defaultValue}`;
            tip.appendChild(value);
        }
        icon.appendChild(tip);
        return icon;
    };

    // ---- Boot -------------------------------------------------------------------
    const loadScript = src => new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`could not load ${src}`));
        document.head.appendChild(script);
    });

    function openSettings() {
        if (WP.stage.manager?.showConfigDialog) WP.stage.manager.showConfigDialog();
    }

    // Keys the player owns, wherever focus is. Everything else stays with
    // the wallpaper.
    const PLAYER_KEYS = new Set([',', '[', ']', 'f', 'F']);
    window.addEventListener('keydown', event => {
        if (event.ctrlKey || event.metaKey || event.altKey || event.target.closest?.('input, select, textarea')) return;
        if (!PLAYER_KEYS.has(event.key)) return;
        if (embedded) tell({ type: 'key', key: event.key });
        else if (event.key === ',') openSettings();
    });

    window.addEventListener('message', event => {
        if (event.source !== window.parent || !event.data?.wp) return;
        const message = event.data;
        if (message.wp === 'settings') openSettings();
        else if (message.wp === 'pause') WP.stage.pause();
        else if (message.wp === 'resume') WP.stage.resume();
        else if (message.wp === 'tier' && WP.TIERS[message.tier]) {
            applyQuality(WP.TIERS[message.tier]);
            window.dispatchEvent(new Event('resize'));
        }
    });

    WP.stage.boot = async () => {
        document.documentElement.style.background = entry.background || '#000';
        document.title = entry.name;
        try {
            if (entry.scripts.length) await loadScript(`wallpapers/${id}/defaults.js`);
            for (const src of entry.scripts) await loadScript(`wallpapers/${src}`);
            const manager = WP.stage.manager = entry.make(host);
            if (entry.prepare) entry.prepare(manager, host);
            if (manager.init) await manager.init();
            manager.start();
            WP.stage.ready = true;
            tell({ type: 'ready', id });
            if (!embedded && params.panel === 'open') openSettings();
        } catch (error) {
            WP.stage.error = String(error?.stack || error);
            tell({ type: 'error', id, message: String(error?.message || error) });
            throw error;
        }
    };
})(globalThis.WP);
