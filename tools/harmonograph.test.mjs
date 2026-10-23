// Unit tests for the harmonograph's maths (SPEC §10.6, task 8.1), run in a
// Node vm: the same classic script the browser loads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

const WEB = resolve(import.meta.dirname, '../web');
const context = vm.createContext({ URLSearchParams });
const load = path => vm.runInContext(readFileSync(join(WEB, path), 'utf8'), context, { filename: path });
load('core/wp.js');
load('wallpapers/harmonograph/harmonograph-math.js');
const { WP, HarmonographMath: H } = context;
const plain = value => JSON.parse(JSON.stringify(value));

// Drive the pen the way the manager does: frames `1/fps` apart, elapsed
// time clamped at 100 ms a frame, for `seconds`.
function draw(seed, fps, seconds, { drawSeconds = 360, stride = 1, jitter = 0 } = {}) {
    const fig = H.figure(WP.seededRandom(seed));
    const random = WP.seededRandom(seed + 99);
    let elapsed = 0, drawn = 0, frames = 0;
    const out = [];
    while (elapsed < seconds) {
        const dt = Math.min(0.1, (1 + jitter * (random() - 0.5)) / fps);
        elapsed += dt;
        frames++;
        const step = H.advance(fig, drawn, elapsed, drawSeconds, stride);
        out.push(...step.strokes);
        drawn = step.drawn;
    }
    return { fig, segments: out, frames, drawn };
}

test('harmonograph: the same seed draws the same figure at 20 fps and at 120 fps', () => {
    for (const stride of [1, 2]) {
        const slow = draw(7, 20, 45, { stride });
        const fast = draw(7, 120, 45, { stride, jitter: 0.4 });
        assert.ok(fast.frames > 5 * slow.frames, 'the fast run really took more frames');
        assert.ok(slow.segments.length > 120, `drew ${slow.segments.length} strokes`);
        // Frame boundaries fall in different places, so either run may be a
        // stroke ahead at the end; everything both drew is identical.
        const n = Math.min(slow.segments.length, fast.segments.length);
        assert.ok(Math.abs(slow.segments.length - fast.segments.length) <= 1);
        assert.deepEqual(plain(fast.segments.slice(0, n)), plain(slow.segments.slice(0, n)));
    }
});

test('harmonograph: segments are a pure function of the grid, however the frames cut it', () => {
    const fig = H.figure(WP.seededRandom(3));
    const whole = H.segments(fig, 0, 600);
    const cuts = [0, 1, 2, 17, 18, 250, 251, 599, 600];
    const pieces = cuts.slice(1).flatMap((to, i) => H.segments(fig, cuts[i], to));
    assert.equal(whole.length, 600);
    assert.deepEqual(plain(pieces), plain(whole));
});

test('harmonograph: a different seed draws a different figure; the same seed the same one', () => {
    const a = H.segments(H.figure(WP.seededRandom(1)), 0, 50);
    const b = H.segments(H.figure(WP.seededRandom(2)), 0, 50);
    const again = H.segments(H.figure(WP.seededRandom(1)), 0, 50);
    assert.notDeepEqual(plain(a), plain(b));
    assert.deepEqual(plain(a), plain(again));
});

test('harmonograph: a stroke is one path through its grid points, with the mean ink', () => {
    const fig = H.figure(WP.seededRandom(9));
    const s = H.stroke(fig, 24, 1), segs = H.segments(fig, 24, 24 + H.STROKE);
    assert.equal(s.points.length, H.STROKE + 1);
    assert.deepEqual(plain(s.points.at(-1)), [segs.at(-1).x1, segs.at(-1).y1]);
    assert.ok(Math.abs(s.width - segs.reduce((a, x) => a + x.width, 0) / segs.length) < 1e-12);
    assert.equal(H.stroke(fig, 24, 2).points.length, H.STROKE / 2 + 1, 'Low: half the points, same ends');
    assert.equal(H.STEPS % H.STROKE, 0, 'a drawing is a whole number of strokes');
});

test('harmonograph: Low\'s longer strokes land on the same grid points', () => {
    const fig = H.figure(WP.seededRandom(11));
    const fine = H.segments(fig, 0, 400, 1);
    const coarse = H.segments(fig, 0, 400, 2);
    assert.equal(coarse.length, 200);
    coarse.forEach((s, i) => {
        assert.equal(s.k, 2 * i);
        assert.equal(s.x0, fine[2 * i].x0);
        assert.equal(s.y1, fine[2 * i + 1].y1);
    });
});

test('harmonograph: the drawing finishes on time, inside the sheet, and shrinks as it runs down', () => {
    for (let seed = 1; seed <= 40; seed++) {
        for (const ratios of ['classic', 'any']) {
            const fig = H.figure(WP.seededRandom(seed), ratios);
            assert.equal(H.stepAt(fig, 360, 360), fig.steps);
            assert.equal(H.stepAt(fig, 9999, 360), fig.steps, 'never past the end');
            let early = 0, late = 0;
            for (let k = 0; k <= fig.steps; k += 7) {
                const [x, y] = H.point(fig, k);
                assert.ok(Math.abs(x) <= 1 && Math.abs(y) <= 1, `seed ${seed}: point ${k} off the sheet`);
                if (k < fig.steps * 0.1) early = Math.max(early, Math.hypot(x, y));
                if (k > fig.steps * 0.9) late = Math.max(late, Math.hypot(x, y));
            }
            assert.ok(late < early * 0.35, `seed ${seed} ${ratios}: still ${(late / early).toFixed(2)} of its size at the end`);
        }
    }
});

test('harmonograph: classic ratios stay classic, detuned by half to one percent', () => {
    for (let seed = 1; seed <= 60; seed++) {
        const fig = H.figure(WP.seededRandom(seed), 'classic');
        assert.ok(H.RATIOS.classic.some(([p, q]) => p === fig.ratio[0] && q === fig.ratio[1]));
        const off = Math.abs(fig.terms.x[0][1] / fig.ratio[0] - 1);
        assert.ok(off >= 0.005 - 1e-12 && off <= 0.01 + 1e-12, `detune ${off}`);
    }
});

test('harmonograph: ink stays within its bounds, wider where the pen slows', () => {
    const fig = H.figure(WP.seededRandom(5));
    for (const s of H.segments(fig, 0, fig.steps, 3)) {
        assert.ok(s.width > 0.5 && s.width < 1.7, `width ${s.width}`);
        assert.ok(s.alpha >= 0.45 && s.alpha <= 1, `alpha ${s.alpha}`);
        assert.ok(s.mix >= 0 && s.mix < 1);
    }
    const slow = H.ink(fig, 100, 1, fig.speed * 0.2), quick = H.ink(fig, 100, 1, fig.speed * 2);
    assert.ok(slow.width > quick.width && slow.alpha > quick.alpha);
});
