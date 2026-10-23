// Murmuration's flock (web/wallpapers/murmuration/flock.js), flown headless
// with a fixed seed: the neighbour search is exact, the flock stays in the
// sky, a falcon through it splits it, and the evening runs its course.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const WEB = resolve(import.meta.dirname, '../web');
const WP = {};
// Plain functions rather than a vm context: the flock is hot code, and a
// vm's global lookups make it several times slower.
new Function('globalThis', readFileSync(join(WEB, 'core/wp.js'), 'utf8'))({ WP });
const { MurmurationFlock, MurmurationEvening } = new Function(
    `${readFileSync(join(WEB, 'wallpapers/murmuration/flock.js'), 'utf8')}; return { MurmurationFlock, MurmurationEvening };`)();

// An evening on a screen, as the wallpaper sets it up.
function evening({ width = 1280, height = 800, birds = 3000, minutes = 3, falcon = 'auto', seed = 7 } = {}) {
    const ev = new MurmurationEvening({ birds, minutes, falcon, random: WP.seededRandom(seed) });
    const horizon = Math.round(height * (height > width ? 0.8 : 0.79));
    ev.resize(width, height, horizon, { x: width * 0.25, y: height - (height - horizon) * 0.6, floor: height - (height - horizon) * 0.25 });
    return ev;
}
const sky = ev => ({ x0: 0, x1: ev.width, y0: 0, y1: ev.horizon });

test('neighbours: the grid search finds the true seven nearest, in 3D', () => {
    const random = WP.seededRandom(3), f = new MurmurationFlock(800, random);
    // Clumped, like a real flock: dense patches and stragglers.
    for (let i = 0; i < 800; i++) {
        const c = i % 4;
        f.add(200 + c * 90 + (random() - 0.5) * (c ? 60 : 300), 300 + (random() - 0.5) * (c ? 40 : 200), (random() - 0.5) * 80, 0, 0, 0);
    }
    f.buildGrid();
    for (let i = 0; i < f.count; i += 7) {
        f.search(i);
        const d = j => (f.x[j] - f.x[i]) ** 2 + (f.y[j] - f.y[i]) ** 2 + (f.z[j] - f.z[i]) ** 2;
        const truth = [...Array(f.count).keys()].filter(j => j !== i).sort((a, b) => d(a) - d(b)).slice(0, 7);
        const found = [...f.nb.subarray(i * 7, i * 7 + f.nbCount[i])];
        assert.deepEqual(found.map(d), truth.map(d), `bird ${i}`);
    }
});

// The share of birds in the sky, once a second, through `seconds` of
// swirling at `fps`; the longest run of seconds with under half in view.
function flyAndWatch(ev, seconds, fps) {
    let worst = 1, out = 0, longest = 0, sum = 0, n = 0;
    for (let s = 0; s < seconds * fps; s++) {
        ev.update(1 / fps);
        if (s % fps) continue;
        const { onScreen } = ev.flock.stats(sky(ev));
        worst = Math.min(worst, onScreen);
        out = onScreen < 0.5 ? out + 1 : 0;
        longest = Math.max(longest, out);
        sum += onScreen; n++;
    }
    return { worst, longest, mean: sum / n };
}

for (const [name, screen, fps] of [['desktop, 30 fps', {}, 30], ['phone portrait, 20 fps', { width: 412, height: 915, birds: 1050 }, 20]]) {
    test(`sky: over two minutes of swirling, with falcons, the flock never leaves for more than 3 s (${name})`, () => {
        const ev = evening({ ...screen, minutes: 15 });
        const seen = flyAndWatch(ev, 120, fps);
        console.log(`# ${name}: worst ${(seen.worst * 100).toFixed(1)}% in view, mean ${(seen.mean * 100).toFixed(1)}%, longest out ${seen.longest} s`);
        assert.equal(ev.phase, 'swirl');
        assert.ok(seen.longest <= 3, `out of the sky for ${seen.longest} s running`);
        assert.ok(seen.mean > 0.95, `on average only ${(seen.mean * 100).toFixed(1)}% in view`);
    });
}

// Fly the falcon (the pointer) straight through the middle of the flock, and
// watch how it holds together, against the same evening without it.
function falconPass(withFalcon) {
    const ev = evening({ falcon: 'pointer', seed: 11 });
    for (let s = 0; s < 8 * 30; s++) ev.update(1 / 30);
    const start = ev.flock.stats();
    const speed = 60 * ev.unit, from = { x: start.x - speed * 0.8, y: start.y - speed * 0.3 };
    let largest = 1, clouds = 1, alarmed = 0;
    for (let s = 0; s < 4 * 30; s++) {
        const t = s / 30;
        if (withFalcon && t < 1.6) ev.pointer = { x: from.x + speed * t, y: from.y + speed * 0.375 * t, vx: speed, vy: speed * 0.375, at: ev.time };
        ev.update(1 / 30);
        const now = ev.flock.stats(null, ev.unit * 2.5);
        largest = Math.min(largest, now.largest);
        clouds = Math.max(clouds, now.clouds);
        alarmed = Math.max(alarmed, now.alarmed);
    }
    return { largest, clouds, alarmed };
}

test('falcon: a pass through the flock splits it and sends a wave of alarm through it', () => {
    const calm = falconPass(false), struck = falconPass(true);
    console.log(`# without: largest cloud ${calm.largest.toFixed(2)}, ${calm.clouds} cloud(s); with: ${struck.largest.toFixed(2)}, ${struck.clouds} clouds, ${struck.alarmed} birds alarmed`);
    assert.ok(calm.largest > 0.9, `without a falcon the flock already came apart (${calm.largest.toFixed(2)})`);
    assert.ok(struck.clouds >= 2, `still one cloud (${struck.clouds})`);
    assert.ok(struck.largest < calm.largest - 0.2, `largest cloud ${struck.largest.toFixed(2)} of the flock, against ${calm.largest.toFixed(2)} without the falcon`);
    // The wave reaches well beyond the birds the falcon touches.
    assert.ok(struck.alarmed > 600, `only ${struck.alarmed} birds alarmed`);
});

test('evening: swirl, roost into the reeds as the sky darkens, night, and a new flock', () => {
    const ev = evening({ minutes: 0.5, birds: 1500 }), seen = new Set(), darkness = [];
    let landedAtNight = null;
    for (let s = 0; s < 220 * 20; s++) {
        ev.update(1 / 20);
        if (!seen.has(ev.phase)) {
            seen.add(ev.phase);
            darkness.push([ev.phase, ev.darkness()]);
            if (ev.phase === 'night') landedAtNight = ev.flock.flying;
        }
    }
    assert.deepEqual([...seen], ['swirl', 'roost', 'night', 'dusk', 'arrive']);
    assert.equal(landedAtNight, 0, 'every bird is down by nightfall');
    assert.ok(darkness.find(([p]) => p === 'night')[1] === 1);
    assert.ok(ev.flock.flying > 1450, 'the next evening brings a whole flock');
});

test('density: fewer birds leave the sky; more fly in', () => {
    const ev = evening({ minutes: 15 });
    ev.setBirds(1000);
    for (let s = 0; s < 30 * 20; s++) ev.update(1 / 20);
    assert.equal(ev.flock.stats().flying, 1000);
    ev.setBirds(3000);
    for (let s = 0; s < 30 * 20; s++) ev.update(1 / 20);
    const { flying, onScreen } = ev.flock.stats(sky(ev));
    assert.equal(flying, 3000);
    assert.ok(onScreen > 0.9, `${onScreen} of them in view`);
});
