// The stage: the page each wallpaper runs in (stage.html?w=<id>), inside an
// iframe the player owns, or on its own. It sets up the host before any
// wallpaper code loads, so every module gets frame pacing, pausing and a
// DPR cap without knowing about them. Switching wallpapers throws the whole
// iframe away, which is what guarantees nothing leaks between wallpapers.
//
// The player talks to the stage only through postMessage, because file://
// frames can't reach into each other. Messages carry a `wp` field:
//   stage → player  ready {id}, key {key}, rebuild, corner {near},
//                   toast {text, ms}, error {message}
//                   quality {quality, rung, of}, stats {fps, ms, label, rung, of}
//   player → stage  apply {config}, key {key, shift}, mode, power {policy},
//                   scroll {x}, pause, resume

(function (WP) {
    'use strict';

    const params = WP.parseParams(location.search);
    const embedded = window.parent !== window;
    const tell = message => embedded && window.parent.postMessage({ wp: message.type, ...message }, '*');

    // ?seed= replaces Math.random before any wallpaper code runs, so the
    // same seed draws the same scene.
    if (params.seed) Math.random = WP.seededRandom(Number(params.seed) || 1);

    // ---- Frame pacing ---------------------------------------------------
    // Every module animates through requestAnimationFrame, so wrapping it
    // here caps the frame rate, pauses, and times each frame for all of
    // them at once (SPEC §4.8).
    const nativeFrame = window.requestAnimationFrame.bind(window);
    const queue = new Map();
    let nextId = 1, scheduled = false, last = -Infinity, paused = false, fps = 0;
    // A wallpaper with nothing to animate can idle until a deadline; input,
    // a resize or new settings wake it early (host.idleUntil).
    let idleUntil = 0, idleTimer = null;
    const frames = { count: 0, workMs: 0, recent: [] };   // recent: the last 240 frames' work, for make bench
    let governor = null;

    function schedule() {
        if (scheduled || paused || !queue.size) return;
        const wait = idleUntil - performance.now();
        if (wait > 0) {
            if (!idleTimer && wait < 2 ** 31) idleTimer = setTimeout(wake, wait);
            return;
        }
        scheduled = true;
        nativeFrame(tick);
    }

    function wake() {
        clearTimeout(idleTimer);
        idleTimer = null;
        idleUntil = 0;
        schedule();
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
        const work = performance.now() - started;
        frames.count++;
        frames.workMs += work;
        frames.recent[frames.count % 240] = work;
        if (governor && governor.sample(work, now)) {
            applyQuality(governor.quality);
            write('wp:perf:' + id, governor.quality.label);
        }
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
        // Nothing to draw for a while: no frames until `ms` from now (or
        // forever), or until input, a resize or new settings. A still
        // picture costs nothing, and on Android isn't copied either.
        idleUntil(ms = Infinity) {
            idleUntil = performance.now() + ms;
            clearTimeout(idleTimer);
            idleTimer = null;
        },
        // The time for anything that depends on it: real, or ?date= ticking
        // forward. Wallpapers use this, never new Date(), so ?date= tests them.
        now: WP.clock(params.date),
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
    const own = () => WP.defaultsOf(id) || {};
    WP.settings = {
        defaults: () => WP.mergeSettings(own(), null),
        load: () => WP.mergeSettings(own(), read(`wp:${id}`)),
        save: config => { if (!params.thumb) write(`wp:${id}`, WP.diffSettings(own(), config)); },
        reset: () => write(`wp:${id}`, null),
    };

    // ---- Quality ------------------------------------------------------------
    // SPEC §4.8. fps, the DPR cap and renderScale apply here. Render scale
    // lowers devicePixelRatio ([Replaceable], so modules that size their
    // canvas by it see ours): the layout stays the same size on screen and
    // the canvas has fewer pixels, which the browser scales up. Density
    // and effects are the wallpaper's to apply, in onQuality(quality) or by
    // reading host.quality when it builds its scene.
    const nativeDpr = window.devicePixelRatio || 1;
    const setDpr = q => { window.devicePixelRatio = Math.min(nativeDpr, q.dpr) * q.renderScale; };
    let policy = WP.powerPolicy({ host: kind, reducedMotion: host.reducedMotion, batteryAware: read('wp:performance')?.batteryAware !== false });

    function applyQuality(quality) {
        const previous = host.quality;
        host.quality = quality;
        fps = quality.fps;
        setDpr(quality);
        if (!previous) return;
        tell({ type: 'quality', quality, rung: governor?.rung ?? null, of: governor?.rungs.length ?? null });
        if (previous.dpr !== quality.dpr || previous.renderScale !== quality.renderScale) window.dispatchEvent(new Event('resize'));
        WP.stage.manager?.onQuality?.(quality);
        wake();
    }

    // Pinned or Auto, under the power policy's ceiling. Thumbnails and
    // previews pin what they're told and never touch the memory.
    function plan() {
        const mode = WP.modeOf({ override: params.tier, saved: read('wp:performance') });
        const memory = params.thumb ? null : read('wp:perf:' + id);
        const next = WP.planQuality({ entry, mode, policy, memory });
        governor = next.rungs && !params.thumb ? new WP.Governor({ rungs: next.rungs, start: next.start, now: performance.now() }) : null;
        applyQuality(next.quality);
    }
    plan();

    // Once a second, for the panel's readout and ?hud=1.
    let counted = { count: 0, workMs: 0, at: performance.now() };
    setInterval(() => {
        const now = performance.now(), n = frames.count - counted.count;
        tell({
            type: 'stats', fps: Math.round(n * 1000 / (now - counted.at)), ms: n ? (frames.workMs - counted.workMs) / n : 0,
            label: host.quality.label, rung: governor?.rung ?? null, of: governor?.rungs.length ?? null,
            idle: idleUntil > now, reasons: policy.reasons,
        });
        counted = { count: frames.count, workMs: frames.workMs, at: now };
    }, 1000);

    // ---- Pause ----------------------------------------------------------------
    WP.stage = {
        // For a wallpaper's own settings button (Pixel Quest's touch controls).
        openPanel() { tell({ type: 'key', key: ',' }); },
        pause() { paused = true; },
        resume() {
            if (!paused) return;
            paused = false;
            last = -Infinity;
            schedule();
        },
    };
    document.addEventListener('visibilitychange', () => document.hidden ? WP.stage.pause() : WP.stage.resume());
    for (const type of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'resize']) window.addEventListener(type, wake, { passive: true });

    // ---- Boot -------------------------------------------------------------------
    const loadScript = src => new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`could not load ${src}`));
        document.head.appendChild(script);
    });

    // Settings changed in the panel. A wallpaper that can take them live
    // implements applySettings(config); any other is rebuilt by the player.
    function apply(config) {
        wake();
        const manager = WP.stage.manager;
        if (manager?.applySettings) manager.applySettings(config);
        else tell({ type: 'rebuild' });
    }

    // The wallpaper's declared keys (catalog `keys`), run here, where the
    // wallpaper lives. A toast can report what changed.
    function wallpaperKey(name, shift) {
        const binding = entry.keys?.find(k => k.keys.some(key => key.toLowerCase() === name.toLowerCase()));
        if (!binding || !WP.stage.manager) return false;
        const said = binding.run(WP.stage.manager, { shift, key: name, toast: (text, ms) => tell({ type: 'toast', text, ms }) });
        if (typeof said === 'string') tell({ type: 'toast', text: said });
        return true;
    }

    // Keys the player owns, wherever focus is. Everything else stays with
    // the wallpaper, including its declared keys.
    const PLAYER_KEYS = new Set([',', 'c', 'C', '[', ']', 'f', 'F', '?', 'Escape']);
    window.addEventListener('keydown', event => {
        if (params.thumb || event.ctrlKey || event.metaKey || event.altKey || event.target.closest?.('input, select, textarea')) return;
        if (PLAYER_KEYS.has(event.key)) tell({ type: 'key', key: event.key });
        else if (wallpaperKey(event.key, event.shiftKey)) event.preventDefault();
    });

    // The corner: the player shows its gear while the pointer is near the
    // top-right corner, and a long press there opens settings on a touch
    // screen, where there's no keyboard.
    const CORNER = 72, HOLD_MS = 600;
    const inCorner = event => event.clientX > innerWidth - CORNER && event.clientY < CORNER;
    let near = false, hold = null;
    window.addEventListener('pointermove', event => {
        if (params.thumb) return;
        if (event.pointerType === 'mouse' && inCorner(event) !== near) tell({ type: 'corner', near: near = !near });
        if (hold && Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > 12) clearTimeout(hold.timer), hold = null;
    }, { passive: true });
    document.addEventListener('pointerleave', () => { if (near) tell({ type: 'corner', near: near = false }); });
    window.addEventListener('pointerdown', event => {
        if (event.pointerType === 'mouse' || !inCorner(event)) return;
        hold = { x: event.clientX, y: event.clientY, timer: setTimeout(() => { hold = null; tell({ type: 'key', key: ',' }); }, HOLD_MS) };
    }, { passive: true });
    window.addEventListener('pointerup', () => { if (hold) clearTimeout(hold.timer), hold = null; });

    window.addEventListener('message', event => {
        if (event.source !== window.parent || !event.data?.wp) return;
        const message = event.data;
        if (message.wp === 'apply') apply(message.config);
        else if (message.wp === 'key') wallpaperKey(message.key, message.shift);
        else if (message.wp === 'pause') WP.stage.pause();
        else if (message.wp === 'resume') WP.stage.resume();
        else if (message.wp === 'mode') plan();
        else if (message.wp === 'scroll') WP.stage.manager?.onScroll?.(message.x);
        else if (message.wp === 'power') {
            policy = message.policy;
            plan();
            if (policy.pause) WP.stage.pause();
            else if (!document.hidden) WP.stage.resume();
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
        } catch (error) {
            WP.stage.error = String(error?.stack || error);
            tell({ type: 'error', id, message: String(error?.message || error) });
            throw error;
        }
    };

    WP.stage.boot();   // deferred, like the player: no inline scripts (CSP)
})(globalThis.WP);
