// WP: the shared namespace, and the pure logic used by the player, the stage
// and the unit tests (which run this file in a Node vm). No DOM in here.
// Classic script, not a module: ES modules can't load from file://.

(function (WP) {
    'use strict';

    // Seasonal: the wallpaper for each calendar month (0 = January).
    WP.SEASONS = [
        'snow', 'snow', 'snow', 'snow',          // Jan–Apr
        'fishtank',                              // May
        'fireflies', 'fireflies', 'fireflies',   // Jun–Aug
        'leaves',                                // Sep
        'halloween',                             // Oct
        'fishtank',                              // Nov
        'advent',                                // Dec (wins over snow)
    ];

    WP.seasonalFor = date => WP.SEASONS[date.getMonth()];

    // URL parameters. They override for this page load only; nothing here
    // is ever persisted (SPEC §4.2).
    WP.PARAMS = ['w', 'panel', 'date', 'theme', 'host', 'hud', 'thumb', 'tier', 'seed'];

    WP.parseParams = search => {
        const query = new URLSearchParams(search);
        const params = {};
        for (const key of WP.PARAMS) if (query.has(key)) params[key] = query.get(key);
        return params;
    };

    // Settings are stored as overrides only: the keys that differ from the
    // wallpaper's defaults.js. Stored overrides from another configVersion
    // are dropped, as are keys the defaults no longer have.
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const clone = value => JSON.parse(JSON.stringify(value));

    WP.mergeSettings = (defaults, stored) => {
        const merged = clone(defaults);
        if (!stored || (stored.configVersion ?? 0) !== (defaults.configVersion ?? 0)) return merged;
        for (const key of Object.keys(stored)) {
            if (key !== 'configVersion' && key in defaults) merged[key] = clone(stored[key]);
        }
        return merged;
    };

    WP.diffSettings = (defaults, config) => {
        const changed = {};
        for (const key of Object.keys(config)) {
            if (key !== 'configVersion' && key in defaults && !same(config[key], defaults[key])) changed[key] = clone(config[key]);
        }
        if (!Object.keys(changed).length) return null;
        return { configVersion: defaults.configVersion ?? 0, ...changed };
    };

    // Performance tiers (SPEC §4.8). fps 0 means the display's own rate;
    // slowFps is for wallpapers declared motion: 'slow'. core/perf.js uses them.
    WP.TIERS = {
        low:    { tier: 'low',    fps: 20, renderScale: 0.5,  dpr: 1,   density: 0.35, slowFps: 10 },
        medium: { tier: 'medium', fps: 30, renderScale: 0.75, dpr: 1.5, density: 0.65, slowFps: 15 },
        high:   { tier: 'high',   fps: 0,  renderScale: 1,    dpr: 2,   density: 1,    slowFps: 30 },
    };

    // A small seeded random generator (mulberry32), so ?seed= makes any
    // wallpaper reproducible: thumbnails, tests, benchmarks.
    WP.seededRandom = seed => {
        let a = seed >>> 0;
        return () => {
            a = (a + 0x6d2b79f5) >>> 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    };

    // Frame pacing: is a frame due at `now`, given the last one and a cap?
    // A small tolerance stops a 30 fps cap on a 60 Hz display from landing
    // on every third tick because of timer jitter.
    WP.frameDue = (now, last, fps) => !fps || now - last >= 1000 / fps - 2;

    // Each wallpaper's defaults.js and settings.js register here, so the
    // stage (which runs the wallpaper) and the player (whose panel edits
    // its settings) read the same values and schema.
    const defaultsById = {}, schemaById = {};
    WP.defaults = (id, values) => { defaultsById[id] = values; };
    WP.defaultsOf = id => defaultsById[id] || null;
    WP.schema = (id, controls) => { schemaById[id] = controls; };
    WP.schemaOf = id => schemaById[id] || null;

    // localStorage as JSON; quiet when storage is blocked or full.
    WP.store = {
        get(key) { try { return JSON.parse(globalThis.localStorage.getItem(key)); } catch { return null; } },
        set(key, value) {
            try {
                if (value === null || value === undefined) globalThis.localStorage.removeItem(key);
                else globalThis.localStorage.setItem(key, JSON.stringify(value));
            } catch {}
        },
    };

    if (typeof module !== 'undefined') module.exports = WP;
})(globalThis.WP = globalThis.WP || {});
