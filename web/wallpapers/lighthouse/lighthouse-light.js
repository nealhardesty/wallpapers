// A lighthouse's light characteristic, as printed on a chart: "Fl(2) 10s" is
// two flashes every ten seconds, "Oc 6s" a steady light that goes out once
// every six, "Iso 4s" equal light and dark. Everything here is a pure
// function of elapsed time in seconds, so the flashes keep their character
// at any frame rate: a frame at 10 fps and one at 120 fps that land on the
// same moment see the same light. No DOM; the unit tests load this file in
// a Node vm (tools/lighthouse.test.mjs).

const LighthouseLight = (() => {
    'use strict';

    const RAMP = 0.08;        // s: a rotating lens brightens and fades, it doesn't switch
    const MIN_TURN = 6;       // s: the optic turns no faster than this, adding panels instead

    // "Fl(2) 10s" → { kind: 'Fl', count: 2, period: 10, on: [[start, end]…], rotating, turn, beams }
    function parse(text) {
        const m = /^\s*(Fl|LFl|Q|VQ|Iso|Oc|F)\s*(?:\((\d+)\))?\s*(?:(\d+(?:\.\d+)?)\s*s)?\s*$/.exec(text || '');
        if (!m) return parse('Fl(2) 10s');
        const kind = m[1];
        const count = Math.max(1, Math.min(9, Number(m[2]) || 1));
        const quick = { Q: 1, VQ: 0.5 }[kind];
        const period = Number(m[3]) || quick || (kind === 'F' ? 1 : 10);
        const on = [];
        if (kind === 'F') {
            on.push([-RAMP, period + RAMP]);   // overlaps the next cycle: never a seam
        } else if (kind === 'Iso') {
            on.push([0, period / 2]);
        } else if (kind === 'Oc') {
            // Light, with `count` eclipses of up to a second at the end of the
            // cycle. Each stretch of light runs on to the next eclipse, the
            // last one into the next cycle.
            const dark = Math.min(1, period / (count * 3));
            const first = period - (2 * count - 1) * dark;
            const eclipses = Array.from({ length: count }, (_, i) => first + 2 * i * dark);
            eclipses.forEach((start, i) => on.push([start + dark, i + 1 < count ? eclipses[i + 1] : period + first]));
        } else {
            // Flashes: `count` of them in a group at the start of each period.
            // Quick lights flash about a third of each beat; Q(9) 15s is nine
            // quick flashes, then dark until the period is up.
            const beat = quick || (kind === 'LFl' ? 3.5 : 2);
            const flash = quick ? beat * 0.35 : kind === 'LFl' ? 2 : Math.min(0.6, Math.max(0.3, period * 0.06));
            const step = Math.min(beat, (period * 0.7 - flash) / Math.max(1, count - 1));
            for (let i = 0; i < count; i++) on.push([i * step, i * step + flash]);
        }
        const rotating = ['Fl', 'LFl', 'Q', 'VQ'].includes(kind);
        // A rotating optic shows each flash as a beam sweeping past the
        // viewer: one turn per period, or several periods per turn (and that
        // many sets of panels) when the period is short.
        const turns = rotating ? Math.max(1, Math.ceil(MIN_TURN / period - 1e-9)) : 1;
        const turn = period * turns;
        const beams = [];
        if (rotating) {
            for (let j = 0; j < turns; j++) {
                for (const [start, end] of on) beams.push({ centre: j * period + (start + end) / 2, width: Math.PI * 2 * (end - start) / turn });
            }
        }
        return { text: text.trim(), kind, count, period, on, rotating, turn, beams };
    }

    // Brightness towards the viewer at time t (s), 0 to 1, with soft edges.
    function intensity(light, t) {
        const phase = ((t % light.period) + light.period) % light.period;
        let best = 0;
        for (const [start, end] of light.on) {
            // The previous and next cycles too, so a flash can straddle the wrap.
            for (const shift of [-light.period, 0, light.period]) {
                const a = start + shift, b = end + shift;
                // Half brightness at each edge, full RAMP s inside it.
                const level = Math.min(1, (phase - a + RAMP) / (2 * RAMP), (b + RAMP - phase) / (2 * RAMP));
                if (level > best) best = level;
            }
        }
        return best;
    }

    // Each beam's direction at time t: 0 points straight at the viewer, and
    // the angle grows as the optic turns. A beam's centre faces the viewer
    // exactly when its flash peaks.
    function beamAngles(light, t) {
        return light.beams.map(beam => ({
            angle: Math.PI * 2 * (t - beam.centre) / light.turn,
            width: beam.width,
        }));
    }

    // For the settings and the toast: "two flashes every 10 s".
    function describe(light) {
        const n = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'][light.count];
        const p = `${+light.period.toFixed(2)} s`;
        switch (light.kind) {
            case 'F': return 'a steady light';
            case 'Iso': return `equal light and dark, every ${p}`;
            case 'Oc': return light.count === 1 ? `steady, dark once every ${p}` : `steady, dark ${n} times every ${p}`;
            case 'LFl': return light.count === 1 ? `a long flash every ${p}` : `${n} long flashes every ${p}`;
            case 'Q': case 'VQ': {
                const speed = light.kind === 'Q' ? 'quick' : 'very quick';
                return light.on.length > 1 ? `${n} ${speed} flashes every ${p}` : `${speed} flashing`;
            }
            default: return light.count === 1 ? `a flash every ${p}` : `${n} flashes every ${p}`;
        }
    }

    // The characteristics the settings offer, in order (the L key cycles them).
    const CHARTED = ['Fl(2) 10s', 'Fl 5s', 'Fl(3) 15s', 'Fl(4) 20s', 'LFl 10s', 'Q', 'Q(9) 15s', 'Iso 4s', 'Oc 6s', 'Oc(2) 10s'];

    return { parse, intensity, beamAngles, describe, CHARTED, RAMP };
})();

globalThis.LighthouseLight = LighthouseLight;   // for the unit tests, which load this in a vm
