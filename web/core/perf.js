// Performance (SPEC §4.8): what a tier means for one wallpaper, the Auto
// governor's ladder and the governor itself, and the power policy that caps
// them. Pure logic with no DOM and no clock of its own, so the unit tests
// drive it with a fake one. The stage runs the governor; the player reads
// the device's power state and runs the policy.

(function (WP) {
    'use strict';

    const ORDER = ['low', 'medium', 'high'];
    const rank = name => ORDER.indexOf(name);
    const stricter = (a, b) => rank(a) <= rank(b) ? a : b;
    const title = name => name[0].toUpperCase() + name.slice(1);
    // fps 0 is the display's own rate; for comparisons, call that 60.
    const capFps = (fps, cap) => !cap ? fps : !fps ? cap : Math.min(fps, cap);

    // A tier for one wallpaper: the tier's knobs, the frame rate its motion
    // calls for, and which of its declared effects stay on. Catalog effects
    // are [name, lowest tier that keeps it], most expensive first.
    WP.qualityFor = (name, entry = {}, fpsCap = 0) => {
        const tier = WP.TIERS[name];
        return {
            tier: name,
            label: title(name),
            fps: capFps(entry.motion === 'slow' ? tier.slowFps : tier.fps, fpsCap),
            renderScale: tier.renderScale,
            dpr: tier.dpr,
            density: tier.density,
            effects: (entry.effects || []).filter(([, lowest]) => rank(lowest) <= rank(name)).map(([effect]) => effect),
            motion: entry.motion || 'normal',
        };
    };

    // Auto's ladder, best first: each preset, then the same with fewer
    // things, then smaller, then shedding the effects the next tier down
    // doesn't keep, one at a time; below Low, fewer frames. Fine steps, so
    // a struggling device gives up as little as it must.
    WP.ladder = (entry = {}, { ceiling = 'high', fpsCap = 0 } = {}) => {
        const rungs = [];
        const add = quality => {
            const last = rungs[rungs.length - 1];
            const key = q => JSON.stringify({ ...q, label: '' });
            if (!last || key(last) !== key(quality)) rungs.push(quality);
        };
        const steps = { high: { density: 0.85, renderScale: 0.85 }, medium: { density: 0.5, renderScale: 0.6 } };
        for (const name of ORDER.slice(0, rank(ceiling) + 1).reverse()) {
            const preset = WP.qualityFor(name, entry, fpsCap);
            add(preset);
            if (name === 'low') break;
            const below = WP.qualityFor(ORDER[rank(name) - 1], entry, fpsCap);
            let q = { ...preset, density: steps[name].density, label: `${preset.label}, fewer` };
            add(q);
            q = { ...q, renderScale: steps[name].renderScale, label: `${preset.label}, fewer, smaller` };
            add(q);
            for (const effect of preset.effects.filter(e => !below.effects.includes(e))) {
                q = { ...q, effects: q.effects.filter(e => e !== effect), label: `${preset.label}, no ${effect}` };
                add(q);
            }
        }
        const low = rungs[rungs.length - 1];
        for (const fps of [15, 10]) add({ ...low, fps: capFps(low.fps, fps), label: `Low, ${capFps(low.fps, fps)} fps` });
        return rungs;
    };

    const percentile = (values, p) => {
        if (!values.length) return 0;
        const sorted = [...values].sort((a, b) => a - b);
        return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
    };

    // The Auto governor. Fed the time each frame's callbacks took, it moves
    // one rung down when the 90th percentile is over half the frame
    // interval for 2 s, and one rung up after 20 s under a quarter of it.
    // A step up that fails within 5 s locks that rung out for 5 minutes, so
    // it settles instead of flapping.
    WP.GOVERNOR = { downAfter: 2000, upAfter: 20000, busy: 0.5, calm: 0.25, retryWithin: 5000, lockFor: 300000 };

    WP.Governor = class {
        constructor({ rungs, start = 0, now = 0 }) {
            this.rungs = rungs;
            this.rung = Math.max(0, Math.min(rungs.length - 1, start));
            this.samples = [];
            this.changedAt = now;
            this.lockedUntil = new Map();
            this.lastUp = null;
        }

        get quality() { return this.rungs[this.rung]; }

        // One frame's work in ms, at time `now`. True when the rung changed.
        sample(ms, now) {
            const g = WP.GOVERNOR;
            this.samples.push([now, ms]);
            while (this.samples[0][0] < now - g.upAfter) this.samples.shift();
            const interval = 1000 / (this.quality.fps || 60);
            const since = now - this.changedAt;

            const recent = this.samples.filter(([t]) => t >= now - g.downAfter).map(([, v]) => v);
            if (since >= g.downAfter && this.rung < this.rungs.length - 1 && percentile(recent, 0.9) > g.busy * interval) {
                if (this.lastUp && now - this.lastUp.at < g.retryWithin) this.lockedUntil.set(this.lastUp.rung, now + g.lockFor);
                return this.move(this.rung + 1, now);
            }
            const above = this.rung - 1;
            if (since >= g.upAfter && above >= 0 && !((this.lockedUntil.get(above) ?? 0) > now)
                && percentile(this.samples.map(([, v]) => v), 0.9) < g.calm * interval) {
                this.lastUp = { rung: above, at: now };
                return this.move(above, now);
            }
            return false;
        }

        move(rung, now) {
            this.rung = rung;
            this.changedAt = now;
            this.samples = [];
            return true;
        }
    };

    // Where the device's power state puts the ceiling (SPEC §4.8, "Power
    // policy"). Signals only ever lower it; the strictest one wins.
    //   battery: { charging, level } or null when unknown
    //   saver: battery saver on; thermal: Android's thermal status name
    //   preview: Android's wallpaper picker, which gets the best
    //   hidden: the host can't be seen (Android's home screen is covered)
    WP.powerPolicy = ({ host = 'standalone', batteryAware = true, battery = null, saver = false,
        thermal = 'none', reducedMotion = false, preview = false, hidden = false } = {}) => {
        let ceiling = host === 'android' ? 'medium' : 'high';
        let fpsCap = host === 'android' ? 30 : 0;
        const reasons = [];
        const lower = (to, why) => { if (rank(to) < rank(ceiling)) ceiling = to; reasons.push(why); };
        const cap = (fps, why) => { fpsCap = capFps(fpsCap, fps); if (why) reasons.push(why); };

        if (preview) return { ceiling: 'high', fpsCap: 0, pause: false, reasons: ['preview'] };
        if (batteryAware && battery && !battery.charging) {
            if (battery.level < 0.2) lower('low', 'battery low');
            else lower('medium', 'on battery');
        }
        if (saver) { lower('low', 'battery saver'); cap(15); }
        if (thermal === 'moderate') lower(ORDER[Math.max(0, rank(ceiling) - 1)], 'warm');
        if (['severe', 'critical', 'emergency', 'shutdown'].includes(thermal)) { lower('low', 'hot'); cap(10); }
        if (reducedMotion) cap(WP.TIERS.low.fps, 'reduced motion');
        const pause = hidden || ['critical', 'emergency', 'shutdown'].includes(thermal);
        return { ceiling, fpsCap, pause, reasons };
    };

    // Everything that decides the quality a stage starts at, in one place,
    // so the player (which lays the stage out at its renderScale) and the
    // stage (which runs it) agree without talking first.
    //   mode: 'auto' or a pinned tier; memory: the label Auto settled on.
    WP.planQuality = ({ entry, mode = 'auto', policy, memory = null }) => {
        if (WP.TIERS[mode]) {
            return { rungs: null, quality: WP.qualityFor(stricter(mode, policy.ceiling), entry, policy.fpsCap) };
        }
        const rungs = WP.ladder(entry, policy);
        const start = Math.max(0, rungs.findIndex(rung => rung.label === memory));
        return { rungs, start, quality: rungs[start] };
    };

    // The mode in force: ?tier= for this load, then the saved choice.
    WP.modeOf = ({ override, saved }) => WP.TIERS[override] ? override : WP.TIERS[saved?.mode] ? saved.mode : 'auto';
})(globalThis.WP);
