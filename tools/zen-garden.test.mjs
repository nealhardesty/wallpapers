// Unit tests for Zen Garden's geometry (web/wallpapers/zen-garden/zen-geometry.js):
// stones placed with room for their rings, tines that bend around stones
// without entering or crossing, a plan that rakes the whole garden, and wind
// that fades a groove on time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

const WEB = resolve(import.meta.dirname, '../web');
const context = vm.createContext({});
vm.runInContext(readFileSync(join(WEB, 'core/wp.js'), 'utf8'), context);
vm.runInContext(readFileSync(join(WEB, 'wallpapers/zen-garden/zen-geometry.js'), 'utf8') + '\nthis.ZenGeometry = ZenGeometry;', context);
const { WP, ZenGeometry: Z } = context;

const garden = (width, height, count, seed) => {
    const rake = 60;
    const stones = Z.layoutStones(WP.seededRandom(seed), { width, height, count, unit: Math.sqrt(width * height), rake, groove: 12, bottom: 48 });
    return { width, height, rake, stones };
};

test('zen: stones sit on screen, clear of the inset, with room for their rings', () => {
    for (const [w, h] of [[1280, 800], [412, 915], [1920, 1080]]) {
        for (let seed = 1; seed < 40; seed++) {
            const { stones } = garden(w, h, 5, seed);
            assert.ok(stones.length >= 2, `${w}x${h} seed ${seed}: only ${stones.length} stones`);
            for (const s of stones) {
                assert.ok(s.x - s.r > 0 && s.x + s.r < w && s.y - s.r > 0 && s.y + s.r < h - 48, `${w}x${h} seed ${seed}: stone off screen`);
                assert.ok(s.keep > s.r && s.zone > s.keep);
            }
            for (const a of stones) for (const b of stones) {
                if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > a.zone + b.zone, 'ring zones overlap');
            }
        }
    }
});

test('zen: deflected tines never enter a stone and never cross each other', () => {
    const stone = { x: 300, y: 300, keep: 50 };
    const band = 40;
    for (let angle = 0; angle < Math.PI * 2; angle += 0.3) {
        // A row of five tines passing the stone at every distance.
        for (let pass = -120; pass <= 120; pass += 7) {
            const tx = Math.cos(angle), ty = Math.sin(angle);
            for (let along = -150; along <= 150; along += 5) {
                let last = null;
                for (let i = -2; i <= 2; i++) {
                    const offset = pass + i * 12;
                    const p = Z.deflect(300 + tx * along - ty * offset, 300 + ty * along + tx * offset, [stone], band);
                    const d = Math.hypot(p.x - 300, p.y - 300);
                    assert.ok(d >= stone.keep - 1e-6, `inside the stone: ${d}`);
                    // Order across the rake is kept: each tine stays on its side of the last.
                    if (last) assert.ok((p.x - last.x) * -ty + (p.y - last.y) * tx >= -1e-6 || Math.hypot(last.x - 300, last.y - 300) < stone.keep + band, 'tines crossed');
                    last = p;
                }
            }
        }
    }
    // Far away, nothing moves.
    assert.deepEqual({ ...Z.deflect(10, 10, [stone], band) }, { x: 10, y: 10 });
});

// A tine aimed almost at the centre whips round the stone's edge, under its
// moss; anywhere else a groove moves smoothly.
test('zen: deflection is continuous along a tine, so a groove never jumps in open sand', () => {
    const stones = [{ x: 0, y: 0, keep: 50 }];
    for (let offset = -80; offset <= 80; offset += 3.7) {
        let last = null;
        for (let x = -200; x <= 200; x += 1) {
            const p = Z.deflect(x, offset, stones, 40);
            const hugging = last && Math.hypot(p.x, p.y) < 50 * 1.3 && Math.hypot(last.x, last.y) < 50 * 1.3;
            if (last && !hugging) assert.ok(Math.hypot(p.x - last.x, p.y - last.y) < 4, `jump at x=${x}, offset ${offset}`);
            last = p;
        }
    }
});

test('zen: the gardener’s plan rakes every row of the garden and rings every stone', () => {
    const g = garden(1280, 800, 4, 3);
    const plan = Z.gardenPlan({ ...g, step: 2.4 });
    const rows = plan.filter(s => s.kind === 'row');
    assert.ok(rows.length * g.rake >= 800);
    for (const row of rows) {
        const xs = row.samples.map(s => s.x);
        assert.ok(Math.min(...xs) <= 0 && Math.max(...xs) >= 1280, 'a row stops short of the edges');
    }
    g.stones.forEach((stone, i) => assert.equal(plan.filter(s => s.kind === 'ring' && s.stone === i).length, stone.rings));
    // Rings close on themselves.
    for (const ring of plan.filter(s => s.kind === 'ring')) {
        const a = ring.samples[0], b = ring.samples.at(-1);
        const turn = Math.atan2(b.y - g.stones[ring.stone].y, b.x - g.stones[ring.stone].x) - Math.atan2(a.y - g.stones[ring.stone].y, a.x - g.stones[ring.stone].x);
        assert.ok(ring.samples.length > 12 && Math.abs(Math.sin(turn)) < 0.3);
    }
});

test('zen: Catmull-Rom passes through its points with unit tangents', () => {
    const points = [{ x: 0, y: 0 }, { x: 50, y: 10 }, { x: 100, y: 60 }, { x: 120, y: 140 }];
    const samples = [];
    for (let i = 0; i < points.length - 1; i++) samples.push(...Z.splineSegment(points, i, 3));
    assert.deepEqual([samples[0].x, samples[0].y], [0, 0]);
    for (const s of samples) assert.ok(Math.abs(Math.hypot(s.tx, s.ty) - 1) < 1e-9);
    for (let k = 1; k < samples.length; k++) assert.ok(Math.hypot(samples[k].x - samples[k - 1].x, samples[k].y - samples[k - 1].y) < 6, 'samples too far apart');
});

test('zen: the wind leaves 5% of a groove after fadeMinutes, with passes 8-bit colour can see', () => {
    for (const minutes of [1, 10, 60]) {
        const every = Z.windInterval(minutes), alpha = Z.windAlpha(minutes, every);
        const left = Math.pow(1 - alpha, minutes * 60 / every);
        assert.ok(Math.abs(left - 0.05) < 1e-9, `${minutes} min: ${left}`);
        assert.ok(alpha >= 0.05 || every === 30, `${minutes} min: alpha ${alpha} too faint`);
        assert.ok(every >= 3 && every <= 30);
    }
});
