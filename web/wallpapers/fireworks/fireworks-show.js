// Fireworks: the show's running order (SPEC §10.17), kept apart from the
// drawing so it can be tested in Node: when to launch, what, and where.
// No DOM; the random source is passed in.
//
// A show runs `showMinutes`: it opens sparse, builds in waves with short
// lulls, and ends in a finale, then pauses briefly and starts again. The
// sky is never empty longer than LULL seconds between launches.

class FireworksShow {
    static LULL = 8;          // the longest the sky may go without a launch, s
    static FINALE = 26;       // the finale's length, s
    static PAUSE = 6;         // after the finale, before the next show, s
    static CELEBRATE = 300;   // New Year: finale at midnight, then a show until this, s
    static NEW_YEAR_FINALE = 45;
    static YEAR_HOLD = 3;     // New Year: seconds the year has the sky to itself
    static TYPES = ['peony', 'chrysanthemum', 'willow', 'ring', 'palm', 'crossette', 'strobe', 'crackle'];

    constructor({ rng = Math.random, showMinutes = 5, intensity = 1, types = FireworksShow.TYPES } = {}) {
        this.rng = rng;
        this.length = Math.max(60, showMinutes * 60);
        this.intensity = intensity;
        this.types = types.length ? types : FireworksShow.TYPES;
        this.nextAt = null;
        this.finaleUntil = -Infinity;
    }

    // Where `clock` (seconds on the mode's own timeline) falls: the phase,
    // and how far through the show's build-up it is (0..1).
    phase(mode, clock) {
        if (clock < this.finaleUntil) return { name: 'finale', p: 1 };
        if (mode === 'auto') {
            const cycle = this.length + FireworksShow.PAUSE, c = ((clock % cycle) + cycle) % cycle;
            const build = this.length - FireworksShow.FINALE;
            if (c < build) return { name: 'show', p: c / build, ends: clock - c + build };
            if (c < this.length) return { name: 'finale', p: 1, ends: clock - c + this.length };
            return { name: 'pause', p: 0, ends: clock - c + cycle };
        }
        if (mode === 'celebrate') {
            const F = FireworksShow.NEW_YEAR_FINALE, end = FireworksShow.CELEBRATE;
            // The first seconds belong to the year, written in stars.
            if (clock < FireworksShow.YEAR_HOLD || clock >= end) return { name: 'quiet', p: 0 };
            if (clock < F) return { name: 'finale', p: 1, ends: F };
            if (clock < end - 20) return { name: 'show', p: (clock - F) / (end - 20 - F), ends: end - 20 };
            return { name: 'finale', p: 1, ends: end };
        }
        return { name: 'quiet', p: 0 };
    }

    // A grand finale now, for `seconds` (the G key).
    finale(clock, seconds = 20) {
        this.finaleUntil = clock + seconds;
        this.nextAt = clock;
    }

    // Launches due by `clock`: [{ at, type, x 0..1, height 0..1, colour }].
    // `at` is when it leaves the ground, on the same timeline.
    run(mode, clock) {
        const out = [];
        if (this.nextAt === null || this.nextAt < clock - 2 || this.nextAt > clock + FireworksShow.LULL * 4) this.nextAt = clock;
        while (this.nextAt <= clock) {
            const at = this.nextAt, phase = this.phase(mode, at);
            if (phase.name === 'quiet') { this.nextAt = clock + 0.25; break; }
            if (phase.name === 'pause') { this.nextAt = phase.ends + 0.3; continue; }
            this.salvo(out, at, phase);
            // A launch due in the pause waits for its end: finale gaps are
            // short enough that the pause still fits inside the lull.
            this.nextAt = at + Math.min(this.gap(phase), FireworksShow.LULL - 0.5);
        }
        return out;
    }

    // Seconds to the next launch: waves that build through the show, a
    // lull now and then, and a barrage at the finale.
    gap(phase) {
        const r = this.rng, k = Math.max(0.2, this.intensity);
        if (phase.name === 'finale') return Math.min(1.2, (0.12 + r() * 0.28) / k);
        if (r() < 0.05 + 0.05 * (1 - phase.p)) return 3.5 + r() * 3.5;           // a lull
        const rate = 0.7 * k * (0.55 + 0.9 * phase.p) * (1 + 0.45 * Math.sin(phase.p * Math.PI * 6));
        return Math.min(4, -Math.log(1 - r() * 0.95) / rate);
    }

    pick(list) {
        return list[Math.floor(this.rng() * list.length)];
    }

    // One launch, a mirrored pair, or a sweep of the same shell.
    salvo(out, at, phase) {
        const r = this.rng, colour = r(), type = this.pick(this.types);
        const shot = (dt, x, height, t = type, c = colour) => out.push({ at: at + dt, type: t, x, height, colour: c });
        const roll = r(), height = 0.35 + r() * 0.6;
        if (phase.name === 'finale') {
            const n = 2 + Math.floor(r() * 3);
            for (let i = 0; i < n; i++) shot(i * 0.05, 0.1 + r() * 0.8, 0.4 + r() * 0.6, this.pick(this.types), r());
        } else if (roll < 0.55 || phase.p < 0.15) {
            shot(0, 0.12 + r() * 0.76, height);
        } else if (roll < 0.8) {
            const x = 0.15 + r() * 0.25;
            shot(0, x, height);
            shot(0.04, 1 - x, height);
        } else {
            const n = 3 + Math.floor(r() * 3), left = r() < 0.5;
            for (let i = 0; i < n; i++) {
                const f = (i + 0.5) / n;
                shot(i * 0.22, 0.15 + 0.7 * (left ? f : 1 - f), height * (0.85 + 0.15 * Math.sin(f * Math.PI)));
            }
        }
    }

    // New Year (local time, from host.now()): a countdown from 23:59:50 on
    // 31 December, then CELEBRATE seconds of show from midnight.
    static newYear(date) {
        const y = date.getFullYear();
        const eve = date.getMonth() === 11 && date.getDate() === 31;
        const midnight = eve ? new Date(y + 1, 0, 1) : new Date(y, 0, 1);
        const s = (date - midnight) / 1000;
        if (s >= -10 && s < 0) return { phase: 'countdown', count: Math.ceil(-s), s, year: midnight.getFullYear() };
        if (s >= 0 && s < FireworksShow.CELEBRATE) return { phase: 'celebrate', s, year: midnight.getFullYear() };
        let next = new Date(y, 11, 31, 23, 59, 50);
        if (date >= next) next = new Date(y + 1, 11, 31, 23, 59, 50);
        return { phase: 'quiet', untilCountdown: (next - date) / 1000 };
    }
}
