// Harmonograph maths (SPEC §10.6): pure functions, no DOM, so the unit tests
// can run this file in a Node vm (tools/harmonograph.test.mjs).
//
// A lateral harmonograph: two pendulums push the pen in x and in y, and a
// third, rotary one swings the paper in a small circle. Each term is
//
//     A sin(f t + p) e^(−d t)
//
// with frequencies near a small ratio (1:1, 2:3, 3:4 …) detuned by 0.5–1%,
// which is what makes the figure slowly turn as it shrinks.
//
// The drawing is sampled on a fixed grid of `steps` points. Frame time only
// decides how far along the grid the pen has got; the segments themselves,
// and their ink, are a function of the grid alone. So the same seed draws
// the same figure, segment for segment, at 10 fps or at 120.

(function (root) {
    'use strict';

    const TAU = Math.PI * 2;

    // Frequency ratios: x pendulum : y pendulum.
    const RATIOS = {
        classic: [[1, 1], [1, 2], [2, 1], [2, 3], [3, 2], [3, 4], [4, 3]],
        any: [[1, 1], [1, 2], [2, 1], [1, 3], [3, 1], [2, 3], [3, 2], [3, 4], [4, 3], [2, 5], [3, 5], [5, 3], [4, 5], [5, 4], [5, 6]],
    };

    // Points per drawing. Enough that the fastest term gets 40+ points a
    // turn, few enough that a phone draws a whole sheet without noticing.
    const STEPS = 16008;   // a whole number of strokes
    // Turns of the slowest pendulum in one drawing, capped so the fastest
    // one never makes more than FASTEST_TURNS.
    const SLOW_TURNS = 120;
    const FASTEST_TURNS = 360;
    // Amplitude left when the pen lifts. Lower piles ink into a dark knot
    // in the middle.
    const END_AMPLITUDE = 0.07;

    const pick = (rand, list) => list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
    const between = (rand, lo, hi) => lo + (hi - lo) * rand();
    const sign = rand => (rand() < 0.5 ? -1 : 1);

    // A new figure from a random source (Math.random, or WP.seededRandom(n)
    // for a reproducible one).
    function figure(rand, ratios = 'classic') {
        const [p, q] = pick(rand, RATIOS[ratios] || RATIOS.classic);
        const detune = () => 1 + sign(rand) * between(rand, 0.005, 0.01);
        const fx = p * detune();
        const fy = q * detune();
        // The rotary pendulum swings near one of the two, a touch off it.
        const fr = (rand() < 0.5 ? p : q) * detune();
        const slow = Math.min(p, q), fast = Math.max(p, q);
        const turns = Math.min(SLOW_TURNS, FASTEST_TURNS * slow / fast);
        const duration = turns * TAU / slow;
        // Damping such that the slowest-dying term ends near END_AMPLITUDE;
        // each pendulum a little different, so the figure skews as it dies.
        const base = Math.log(1 / END_AMPLITUDE) / duration;
        const damp = () => base * between(rand, 0.75, 1.15);
        const rotary = between(rand, 0.18, 0.62);
        const phase = () => rand() * TAU;
        const spin = sign(rand);          // which way the paper circles
        const pr = phase(), dr = damp();
        const terms = {
            x: [[1, fx, phase(), damp()], [rotary, fr, pr, dr]],
            y: [[1, fy, phase(), damp()], [rotary, fr, pr + spin * Math.PI / 2, dr]],
        };
        // Now and then a second x pendulum, slightly off the first: the
        // figure beats, widening and narrowing as it goes.
        if (rand() < 0.3) terms.x.push([between(rand, 0.12, 0.3), fx * detune(), phase(), damp()]);
        // Scale each axis to the figure's real reach, so it fills its frame:
        // the terms rarely all peak together.
        const fig = { ratio: [p, q], steps: STEPS, h: duration / STEPS, terms, scale: [1, 1], speed: 0 };
        let mx = 0, my = 0;
        for (let k = 0; k <= STEPS; k += 2) {
            const [x, y] = point(fig, k);
            mx = Math.max(mx, Math.abs(x));
            my = Math.max(my, Math.abs(y));
        }
        fig.scale = [0.98 / mx, 0.98 / my];
        // Typical pen speed at the start, per grid step: the ink's reference.
        let total = 0;
        for (let k = 0; k < 400; k++) total += Math.hypot(...delta(fig, k, k + 1));
        fig.speed = total / 400;
        return fig;
    }

    function axis(terms, t) {
        let v = 0;
        for (const [a, f, p, d] of terms) v += a * Math.sin(f * t + p) * Math.exp(-d * t);
        return v;
    }

    // The pen at grid point k, in −1..1 on both axes.
    function point(fig, k) {
        const t = k * fig.h;
        return [axis(fig.terms.x, t) * fig.scale[0], axis(fig.terms.y, t) * fig.scale[1]];
    }

    function delta(fig, a, b) {
        const [x0, y0] = point(fig, a), [x1, y1] = point(fig, b);
        return [x1 - x0, y1 - y0];
    }

    // How far along the grid the pen is after `seconds` of a drawing that
    // takes `drawSeconds`. A whole grid point, never past the end.
    function stepAt(fig, seconds, drawSeconds) {
        return Math.max(0, Math.min(fig.steps, Math.floor(seconds / drawSeconds * fig.steps + 1e-9)));
    }

    // When grid point k is reached, in seconds into the drawing.
    function secondsAt(fig, k, drawSeconds) {
        return k / fig.steps * drawSeconds;
    }

    // Smooth noise in k, −1..1, from a hash of the figure's own numbers: the
    // pen's small irregularities, the same every time the figure is drawn.
    function wobble(fig, k, salt) {
        const cell = k / 37, i = Math.floor(cell), f = cell - i;
        const hash = n => {
            const s = Math.sin(n * 127.1 + salt * 311.7 + fig.terms.x[0][2] * 74.7) * 43758.5453;
            return (s - Math.floor(s)) * 2 - 1;
        };
        const ease = f * f * (3 - 2 * f);
        return hash(i) * (1 - ease) + hash(i + 1) * ease;
    }

    // Ink for the segment from k to k + stride. A slow pen leaves a wider,
    // darker line, a fast one a thinner, paler one, with a slight wobble.
    // `mix` runs 0..1 over the drawing, for two-colour inks.
    function ink(fig, k, stride, length) {
        const speed = length / stride / (fig.speed || 1);
        const width = Math.min(1.45, Math.max(0.6, 1.32 - 0.42 * speed)) * (1 + 0.14 * wobble(fig, k, 1));
        const alpha = Math.min(0.95, Math.max(0.5, 0.96 - 0.26 * speed)) * (1 + 0.06 * wobble(fig, k, 2));
        return { width, alpha: Math.min(1, alpha), mix: k / fig.steps };
    }

    // Every segment from grid point `from` up to `to`, `stride` points at a
    // time: { k, x0, y0, x1, y1, width, alpha, mix }, in −1..1 units.
    // Only whole segments: one ending past `to` waits for the next call.
    function segments(fig, from, to, stride = 1) {
        const out = [];
        let [x0, y0] = point(fig, from);
        for (let k = from; k + stride <= Math.min(to, fig.steps); k += stride) {
            const [x1, y1] = point(fig, k + stride);
            const length = Math.hypot(x1 - x0, y1 - y0);
            out.push({ k, x0, y0, x1, y1, ...ink(fig, k, stride, length) });
            x0 = x1;
            y0 = y1;
        }
        return out;
    }

    // Ink goes down in strokes of STROKE grid points, each one path with one
    // width and tone (the mean of its segments' ink), so the joins inside a
    // stroke never overlap and bead. A stroke is a pure function of where it
    // starts: { k, points: [[x, y]…], width, alpha, mix }.
    const STROKE = 12;

    function stroke(fig, k, stride = 1) {
        const segs = segments(fig, k, k + STROKE, stride);
        const points = [[segs[0].x0, segs[0].y0], ...segs.map(s => [s.x1, s.y1])];
        const mean = key => segs.reduce((sum, s) => sum + s[key], 0) / segs.length;
        return { k, points, width: mean('width'), alpha: mean('alpha'), mix: k / fig.steps };
    }

    // One frame of the pen, whatever the frame rate: every whole stroke due
    // by `seconds` into the drawing, from grid point `drawn` (a stroke
    // boundary). { strokes, drawn, due }: `drawn` moved past them, and `due`,
    // the grid point the pen has really reached, for the live tail.
    function advance(fig, drawn, seconds, drawSeconds, stride = 1) {
        const due = stepAt(fig, seconds, drawSeconds);
        const out = [];
        while (drawn + STROKE <= due) {
            out.push(stroke(fig, drawn, stride));
            drawn += STROKE;
        }
        return { strokes: out, drawn, due };
    }

    const api = { RATIOS, STEPS, STROKE, figure, point, stepAt, secondsAt, segments, ink, stroke, advance };
    root.HarmonographMath = api;
    if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
