// Ice Patrol (SPEC §10.34): the world's own logic, in a Node vm, without a
// browser. The noise tiles; the textures decode to the heights the pilot
// flies by; the autopilot covers the same ground at any frame rate and
// never touches the snow; the sun, the weather, the air's bob, the terrain
// scan and the cockpit's switches behave.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

const DIR = resolve(import.meta.dirname, '../web/wallpapers/ice-patrol');
const FILES = ['ice-logic.js', 'ice-gl.js', 'ice-cockpit.js', 'ice-patrol.js'];
const sources = Object.fromEntries(FILES.map(name => [name, readFileSync(join(DIR, name), 'utf8')]));
const context = vm.createContext({});
vm.runInContext(readFileSync(resolve(DIR, '../../core/wp.js'), 'utf8'), context);
vm.runInContext(readFileSync(join(DIR, 'defaults.js'), 'utf8'), context);
vm.runInContext(readFileSync(join(DIR, 'settings.js'), 'utf8'), context);
for (const name of FILES) vm.runInContext(sources[name], context);
vm.runInContext(readFileSync(resolve(DIR, '../catalog.js'), 'utf8'), context);
// The logic is pure, so the tests that fly for minutes run it as a plain
// function: a vm context makes its inner loops ten times slower.
const L = new Function(`${sources['ice-logic.js']}; return IceLogic;`)();
const plain = value => JSON.parse(JSON.stringify(value));

const seeded = seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const N = 128;                       // small, so the vm's slow loops stay quick
const baked = L.bake(seeded(7), N);
const land = L.terrain(baked);

test('noise: both fields fill 0 to 1, tile, and come back the same from the same seed', () => {
    for (const key of ['a', 'b']) {
        const field = baked[key];
        let lo = Infinity, hi = -Infinity;
        for (const v of field) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
        assert.equal(lo, 0, `${key}: lowest`);
        assert.ok(Math.abs(hi - 1) < 1e-6, `${key}: highest ${hi}`);
        // Tiling: across the seam is no rougher than anywhere else.
        let seam = 0, inside = 0;
        for (let y = 0; y < N; y++) {
            seam = Math.max(seam, Math.abs(field[y * N] - field[y * N + N - 1]), Math.abs(field[y] - field[(N - 1) * N + y]));
            inside = Math.max(inside, Math.abs(field[y * N + 40] - field[y * N + 41]));
        }
        assert.ok(seam < inside * 2.5 + 0.02, `${key}: a seam of ${seam.toFixed(3)} against ${inside.toFixed(3)} inside`);
    }
    const again = L.bake(seeded(7), N), other = L.bake(seeded(8), N);
    assert.deepEqual(plain([...again.a.slice(0, 64)]), plain([...baked.a.slice(0, 64)]));
    assert.notDeepEqual(plain([...other.a.slice(0, 64)]), plain([...baked.a.slice(0, 64)]));
});

test('textures: the bytes decode to the heights and slopes the pilot uses', () => {
    const packed = L.pack(baked.b, N, true), { gu, gv } = L.slopes(baked.b, N);
    assert.equal(packed.mips.length, Math.log2(N) + 1, 'a full mip chain');
    assert.equal(packed.slopeMips.length, packed.mips.length);
    const bytes = packed.mips[0], wide = packed.slopeMips[0];
    let worstH = 0, worst8 = 0, worst16 = 0;
    for (let i = 0; i < N * N; i += 7) {
        const h = (bytes[i * 4] * 256 + bytes[i * 4 + 1]) / 65535;
        worstH = Math.max(worstH, Math.abs(h - baked.b[i]));
        // As the shaders decode them: a byte to ±gmax, two bytes to ±gmax.
        worst8 = Math.max(worst8, Math.abs((bytes[i * 4 + 2] / 255 * 2 - 1) * packed.gmax - gu[i]), Math.abs((bytes[i * 4 + 3] / 255 * 2 - 1) * packed.gmax - gv[i]));
        worst16 = Math.max(worst16, Math.abs(((wide[i * 4] * 256 + wide[i * 4 + 1]) / 65535 * 2 - 1) * packed.gmax - gu[i]));
    }
    assert.ok(worstH < 1 / 65535, `height off by ${worstH}`);
    assert.ok(worst8 < packed.gmax / 127, `8-bit slope off by ${worst8}`);
    assert.ok(worst16 < packed.gmax / 30000, `16-bit slope off by ${worst16}`);
    // Each mip is the average of the one below.
    const m1 = packed.mips[1], mean = (baked.b[0] + baked.b[1] + baked.b[N] + baked.b[N + 1]) / 4;
    assert.ok(Math.abs((m1[0] * 256 + m1[1]) / 65535 - mean) < 1 / 65535);
    assert.equal(L.pack(baked.a, N).slopeMips.length, 0, 'the soft field carries no 16-bit slopes');
});

test('terrain: continuous, with plains and mountains, and the same far from home', () => {
    let lo = Infinity, hi = -Infinity, flat = 0, high = 0, jump = 0;
    const random = seeded(3);
    for (let i = 0; i < 4000; i++) {
        const x = (random() - 0.5) * 4e5, z = (random() - 0.5) * 4e5, h = land.height(x, z), m = land.mountains(x, z);
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
        flat += m < 0.05;
        high += m > 0.95;
        assert.ok(m >= 0 && m <= 1);
        jump = Math.max(jump, Math.abs(land.height(x + 1, z) - h));
    }
    assert.ok(hi > 600 && hi < L.SHAPE.mountain + L.SHAPE.gully + L.SHAPE.hill, `highest ${hi}`);
    assert.ok(lo < 0 && lo > -L.SHAPE.hill, `lowest ${lo}`);
    assert.ok(flat > 800 && high > 250, `${flat} plain and ${high} mountain of 4000`);
    assert.ok(jump < 6, `a metre aside moved the ground ${jump.toFixed(1)} m`);
    // Three billion metres out the lookups still wrap cleanly.
    const far = 3e9 + 123.25;
    assert.ok(Number.isFinite(land.height(far, -far)));
    assert.ok(Math.abs(land.height(far, -far) - land.height(far + 0.01, -far)) < 0.5);
});

function fly(fps, seconds, speed = 80, clearance = 22) {
    const s = L.flightStart(land.height, clearance, 0.3);
    const seen = { low: Infinity, bank: 0 };
    for (let frame = 0; frame < Math.round(seconds * fps); frame++) {
        L.flightAdvance(s, 1000 / fps, land.height, speed, clearance, land.mountains);
        seen.low = Math.min(seen.low, s.agl);
        seen.bank = Math.max(seen.bank, Math.abs(s.roll));
    }
    return { s, ...seen };
}

test('flight: the same ground covered at 10, 30, 60 and 120 fps', () => {
    for (const speed of [32, 80, 200]) {
        for (const fps of [10, 30, 60, 120]) {
            const { s } = fly(fps, 30, speed);
            assert.ok(Math.abs(s.distance - 30 * speed) < 1e-6 * speed * 30, `${speed} m/s at ${fps} fps went ${s.distance}`);
        }
    }
    // A stalled tab doesn't lurch: a frame counts for at most 100 ms.
    const s = L.flightStart(land.height, 22, 0.3);
    L.flightAdvance(s, 5000, land.height, 80, 22);
    assert.ok(Math.abs(s.distance - 8) < 1e-9);
});

test('flight: never into the snow, never past its bank, at any speed, height or frame rate', () => {
    for (const [speed, clearance, fps] of [[80, 22, 60], [80, 22, 10], [200, 10, 30], [32, 160, 20], [200, 22, 120]]) {
        const { low, bank, s } = fly(fps, 600, speed, clearance);
        assert.ok(low >= 3.99, `${speed} m/s, ${clearance} m, ${fps} fps: came within ${low.toFixed(1)} m`);
        assert.ok(bank <= L.FLIGHT.maxBank + 1e-9, `banked ${bank}`);
        assert.ok(Number.isFinite(s.x + s.y + s.z + s.heading + s.pitch));
    }
});

test('flight: it holds its height over open snow', () => {
    // A dead level world: it should sit at its clearance and fly straight on a steady wander.
    const s = L.flightStart(() => 0, 22, 0.3);
    for (let i = 0; i < 3600; i++) L.flightStep(s, 1 / 60, () => 0, 80, 22);
    assert.ok(Math.abs(s.agl - 22) < 0.5, `agl ${s.agl}`);
    assert.ok(Math.abs(s.pitch) < 0.01);
    assert.equal(s.pull, 0);
});

test('by hand: the stick turns it, climbs it and gives it back after five seconds', () => {
    const flat = () => 0, s = L.flightStart(flat, 22, 0.3), p = L.pilotStart();
    const run = (seconds, input) => {
        for (let i = 0; i < seconds * 60; i++) { L.pilotStep(p, 1 / 60, input, 22); L.flightStep(s, 1 / 60, flat, 80 * p.throttle, 22, null, p); }
    };
    run(5, null);
    assert.equal(p.active, false);
    assert.equal(p.hold, 0, 'hands off, the autopilot flies alone');
    const from = s.heading;
    run(3, { turn: 1, climb: 1, throttle: 1 });
    assert.ok(p.active && p.hold > 0.99);
    assert.ok(s.heading - from > 0.8, `turned ${s.heading - from} rad right in 3 s`);
    assert.ok(s.roll > L.FLIGHT.maxBank && s.roll <= L.PILOT.bank + 1e-9, `banked ${s.roll}`);
    assert.ok(s.agl > 100, `climbed to ${s.agl} m`);
    assert.ok(p.throttle > 2, `throttle ${p.throttle}`);
    run(4.9, null);
    assert.ok(p.active, 'still the pilot at 4.9 s');
    assert.ok(Math.abs(s.turn) < 0.02 && s.agl > 100, 'stick centred: straight on, at the height it was left');
    run(0.2, null);
    assert.equal(p.active, false, 'the autopilot has it at 5 s');
    run(30, null);
    assert.equal(p.hold, 0);
    assert.ok(Math.abs(s.agl - 22) < 1 && Math.abs(p.throttle - 1) < 0.01 && Math.abs(p.lift) < 0.1, `back to ${s.agl} m at ${p.throttle}x`);
    // The limits: no higher than PILOT.high, no lower than PILOT.low, however long it is held.
    run(20, { turn: 0, climb: 1, throttle: 0 });
    assert.ok(Math.abs(s.agl - L.PILOT.high) < 2, `ceiling ${s.agl}`);
    run(60, { turn: 0, climb: -1, throttle: -1 });
    assert.ok(Math.abs(s.agl - L.PILOT.low) < 1, `floor ${s.agl}`);
    assert.equal(p.throttle, L.PILOT.slow);
});

test('by hand: no stick, speed or frame rate can put it into the snow', () => {
    const random = seeded(11);
    for (const [fps, clearance] of [[60, 22], [10, 10], [30, 160], [120, 22]]) {
        const s = L.flightStart(land.height, clearance, 0.3), p = L.pilotStart();
        let low = Infinity, input = null;
        for (let frame = 0; frame < 900 * fps; frame++) {
            // A new whim every couple of seconds: mostly diving, flat out, turning hard at whatever is there.
            if (frame % (2 * fps) === 0) input = random() < 0.1 ? null : { turn: Math.round(random() * 2 - 1), climb: random() < 0.75 ? -1 : 1, throttle: random() < 0.8 ? 1 : -1 };
            L.pilotStep(p, 1 / fps, input, clearance);
            L.flightAdvance(s, 1000 / fps, land.height, Math.min(220, 200 * p.throttle), clearance, land.mountains, p);
            low = Math.min(low, s.agl);
        }
        assert.ok(low >= 3.99, `${fps} fps, ${clearance} m: came within ${low.toFixed(2)} m`);
        assert.ok(Number.isFinite(s.x + s.y + s.z + s.heading + s.pitch + s.roll));
    }
});

test('sky: a low sun that rises and sets, a moon up through the night', () => {
    const noon = L.bodies(0.5), midnight = L.bodies(0), dawn = L.bodies(0.25);
    assert.ok(Math.abs(noon.sunEl - L.SUN_MAX) < 1e-6);
    assert.ok(Math.abs(midnight.sunEl + L.SUN_MAX) < 1e-6);
    assert.ok(Math.abs(dawn.sunEl) < 1e-6);
    for (const body of [noon.sun, ...noon.moons, ...midnight.moons]) assert.ok(Math.abs(Math.hypot(...body) - 1) < 1e-9, 'unit vectors');
    assert.ok(midnight.moons[0][1] > 0.5, 'the big moon is high at midnight');
    assert.ok(noon.moons[0][1] < 0, 'and down at noon');
    // The chosen hours are what their names say.
    const times = vm.runInContext('ICE_TIMES', context);
    assert.ok(L.bodies(times.dawn).sunEl > 0 && L.bodies(times.dawn).sunEl < 6);
    assert.ok(L.bodies(times.dusk).sunEl > 0 && L.bodies(times.dusk).sunEl < 6);
    assert.ok(L.bodies(times.day).sunEl > 30 && L.bodies(times.night).sunEl < -30);
});

test('light: brighter as the sun climbs; cloud takes the sun and the stars', () => {
    const luma = c => c[0] + c[1] + c[2];
    let before = -1;
    for (const el of [-30, -18, -7, -1.5, 3, 10, 24, 34]) {
        const l = L.light(el);
        const total = luma(l.sun) + luma(l.fill) + luma(l.zenith);
        assert.ok(total >= before, `dimmer at ${el}°`);
        before = total;
        for (const key of ['zenith', 'horizon', 'glow', 'sun', 'fill']) assert.ok(l[key].every(v => v >= 0 && Number.isFinite(v)), `${key} at ${el}`);
    }
    assert.equal(luma(L.light(-10).sun), 0, 'no sunlight after dusk');
    assert.equal(L.light(-30).stars, 1);
    assert.equal(L.light(20).stars, 0);
    assert.equal(L.light(-30).day, 0);
    assert.equal(L.light(20).day, 1);
    const clear = L.light(24, 0), snowing = L.light(24, 1);
    assert.ok(luma(snowing.sun) < luma(clear.sun) * 0.1);
    assert.equal(L.light(-30, 1).stars, 0);
    // An overcast sky is grey: no channel far from the others.
    assert.ok(Math.max(...snowing.zenith) / Math.min(...snowing.zenith) < 1.6);
});

test('weather: fixed weathers hold, and left alone snow comes and goes', () => {
    const modes = vm.runInContext('ICE_WEATHER_ORDER', context);
    for (const mode of modes.filter(m => m !== 'auto')) {
        const w = L.weatherStart(mode, seeded(1));
        assert.equal(w.level, L.WEATHER[mode], `${mode} starts as itself`);
        for (let i = 0; i < 600; i++) L.weatherStep(w, 0.1, mode, seeded(1));
        assert.ok(Math.abs(w.level - L.WEATHER[mode]) < 1e-6);
    }
    for (const often of [0.25, 1, 3]) {
        const random = seeded(5), w = L.weatherStart('auto', random);
        let clear = 0, snowing = 0;
        for (let i = 0; i < 36000; i++) {
            L.weatherStep(w, 0.1, 'auto', random, often);
            assert.ok(w.level >= 0 && w.level <= 1);
            clear += w.level < 0.03;
            snowing += w.level > 0.2;
        }
        assert.ok(clear > 1500 && snowing > 1500, `× ${often}: clear ${clear}, snowing ${snowing} of 36000`);
    }
    // Changing the weather eases to it rather than cutting.
    const w = L.weatherStart('clear', seeded(1));
    L.weatherStep(w, 0.1, 'blizzard', seeded(1));
    assert.ok(w.level > 0 && w.level < 0.05);
});

test('air: the harder it snows, the less you see', () => {
    let before = Infinity;
    for (let level = 0; level <= 1.0001; level += 0.1) {
        const air = L.air(level);
        assert.ok(air.visibility < before);
        before = air.visibility;
        assert.ok(air.flakes >= 0 && air.flakes <= 1 && air.overcast >= 0 && air.overcast <= 1);
    }
    assert.ok(L.air(0).visibility > 20000 && L.air(1).visibility < 500);
    assert.equal(L.air(0).flakes, 0);
});

test('bob: nothing at 0, a float in still air, buffets in wind, linear in the setting, the same at any frame rate', () => {
    const rms = (wind, k, fps = 60) => {
        const sum = { pitch: 0, roll: 0, x: 0, y: 0 }, out = {};
        let n = 0;
        for (let t = 0; t < 600; t += 1 / fps, n++) {
            L.bob(t, wind, k, out);
            for (const key in sum) sum[key] += out[key] ** 2;
        }
        for (const key in sum) sum[key] = Math.sqrt(sum[key] / n);
        return sum;
    };
    // Turbulence 0: dead level, whatever the weather.
    for (const wind of [0, 0.3, 1]) for (let t = 0; t < 60; t += 0.37) assert.deepEqual(plain(L.bob(t, wind, 0)), { pitch: 0, roll: 0, x: 0, y: 0 });
    const calm = rms(0, 1), storm = rms(1, 1), flurry = rms(0.3, 1);
    for (const key of ['pitch', 'roll', 'x', 'y']) {
        assert.ok(calm[key] > 0, `still air still floats (${key})`);
        assert.ok(storm[key] > calm[key] * 6, `${key}: a blizzard ${storm[key]} against still air ${calm[key]}`);
        assert.ok(flurry[key] > calm[key] && flurry[key] < storm[key], `${key}: flurries in between`);
    }
    // Still air: under a twentieth of a degree, and slow (it takes seconds to cross zero). A blizzard: a quarter of a degree and more.
    assert.ok(calm.pitch < 0.05 * L.RAD && calm.roll < 0.05 * L.RAD && calm.y < 0.25, `still air: ${JSON.stringify(calm)}`);
    assert.ok(storm.pitch > 0.25 * L.RAD, `a blizzard pitches ${storm.pitch / L.RAD}°`);
    let crossings = 0;
    for (let t = 0, last = 0; t < 600; t += 1 / 60) { const p = L.bob(t, 0, 1).pitch; if (p * last < 0) crossings++; last = p; }
    assert.ok(crossings < 600 * 0.3, `still air crosses level ${crossings} times in ten minutes`);
    // Linear in the setting.
    for (const t of [0.4, 3.3, 71.9]) {
        const one = L.bob(t, 0.7, 1), two = plain(L.bob(t, 0.7, 2)), half = plain(L.bob(t, 0.7, 0.5));
        for (const key of ['pitch', 'roll', 'x', 'y']) {
            assert.ok(Math.abs(two[key] - 2 * one[key]) < 1e-12 && Math.abs(half[key] - one[key] / 2) < 1e-12, `${key} scales with the setting`);
        }
    }
    // A function of the time alone: the same ride sampled at 10 fps as at 120.
    const slow = rms(1, 1, 10), fast = rms(1, 1, 120);
    for (const key of ['pitch', 'roll', 'x', 'y']) assert.ok(Math.abs(slow[key] / fast[key] - 1) < 0.03, `${key}: ${slow[key]} at 10 fps, ${fast[key]} at 120`);
    assert.deepEqual(plain(L.bob(12.5, 0.6, 1.3)), plain(L.bob(12.5, 0.6, 1.3)));
});

test('scan: flat snow is even, a slope facing north-west is lit, and contours fall where the height crosses them', () => {
    const out = [0, 0, 0];
    L.scanCell(() => 37, 100, 200, 50, 40, out);
    assert.deepEqual(out, [37, 0.42, 0]);
    // Rising to the south-east: the face looks north-west, into the light.
    const lit = L.scanCell((x, z) => 0.2 * (x - z), 0, 0, 50, 1e6, [0, 0, 0])[1], dark = L.scanCell((x, z) => 0.2 * (z - x), 0, 0, 50, 1e6, [0, 0, 0])[1];
    assert.ok(lit > 0.7 && dark < 0.1, `lit ${lit}, shaded ${dark}`);
    for (let x = 0; x < 3000; x += 130) { const r = L.scanCell(land.height, x, x * 0.7, 60, 80, [0, 0, 0])[1]; assert.ok(r >= 0 && r <= 1); }
    // A ramp of 1 in 10, cells of 50 m, a contour every 40 m: a line wherever the next cell east is in another band.
    const ramp = x => x / 10;
    let lines = 0;
    for (let i = 0; i < 80; i++) {
        const c = L.scanCell(ramp, i * 50, 0, 50, 40, out)[2];
        assert.equal(c, Math.floor(ramp(i * 50) / 40) !== Math.floor(ramp((i + 1) * 50) / 40) ? 1 : 0);
        lines += c;
    }
    assert.equal(lines, 10);
    // The real land has both: lines somewhere, but not everywhere.
    let marked = 0;
    for (let j = 0; j < 40; j++) for (let i = 0; i < 40; i++) marked += L.scanCell(land.height, i * 100, j * 100, 100, 80, out)[2];
    assert.ok(marked > 10 && marked < 1400, `${marked} of 1600 cells on a contour`);
});

test('greebles: the same from the same time and seed; a switch thrown now and then; calm holds them; the craft is read', () => {
    const G = L.GREEBLE, snap = (t, seed, state) => plain(L.greebles(t, seed, state)), idle = array => Object.values(array).slice(G.wired.length);
    assert.deepEqual(snap(321.5, 9, { level: 0.4 }), snap(321.5, 9, { level: 0.4 }));
    assert.equal(Object.keys(snap(0, 1).switches).length, G.switches);
    assert.equal(Object.keys(snap(0, 1).lamps).length, G.lamps);
    assert.notDeepEqual([0, 100, 200, 300].map(t => idle(snap(t, 9).switches)), [0, 100, 200, 300].map(t => idle(snap(t, 10).switches)), 'another seed, another cockpit');
    // Half an hour, looked at four times a second: how often a switch is thrown, and a lamp changes.
    const count = calm => {
        let flips = 0, blinks = 0, last = null, most = 0;
        const out = {};
        for (let t = 0; t < 1800; t += 0.25) {
            const g = L.greebles(t, 5, { calm }, out), now = [...g.switches, ...g.lamps];
            if (last) {
                let here = 0;
                for (let i = 0; i < G.switches; i++) here += now[i] !== last[i];
                for (let i = G.switches; i < now.length; i++) blinks += now[i] !== last[i];
                flips += here;
                most = Math.max(most, here);
            }
            last = now;
        }
        return { flips, blinks, most };
    };
    const live = count(false), calm = count(true);
    assert.ok(live.flips >= 30 && live.flips <= 220, `${live.flips} switches thrown in half an hour`);   // one every 8 to 60 s
    assert.ok(live.most <= 2, `${live.most} thrown at once`);
    assert.ok(live.blinks > 300, `${live.blinks} lamp changes`);
    assert.ok(calm.flips <= live.flips / 4, `calm: ${calm.flips} against ${live.flips}`);
    assert.equal(calm.blinks, 0, 'calm lamps hold');
    assert.equal(L.greebles(10, 5, { calm: true }).load, L.greebles(250, 5, { calm: true }).load, 'and the needle does not wander');
    // Some lamps are on and some off, at any moment.
    const on = Object.values(snap(77, 5).lamps).reduce((a, b) => a + b);
    assert.ok(on > 1 && on < G.lamps - 1, `${on} of ${G.lamps} lamps lit`);
    // The wired switches follow the craft.
    const wired = state => Object.fromEntries(G.wired.map((name, i) => [name, snap(50, 5, state).switches[i]]));
    assert.deepEqual(wired({}), { auto: 1, lamps: 0, deice: 0, panel: 0, heat: 0, boost: 0 });
    assert.deepEqual(wired({ manual: true, lamps: 1, level: 0.9, night: 1, throttle: 2 }), { auto: 0, lamps: 1, deice: 1, panel: 1, heat: 1, boost: 1 });
    // The warning: rough air or a steep bank, and it clears.
    assert.equal(L.greebles(3, 5, {}).warn, false);
    assert.equal(L.greebles(3, 5, { level: 0.9 }).warn, true);
    assert.equal(L.greebles(3, 5, { roll: -0.7 }).warn, true);
    assert.equal(L.greebles(3, 5, { level: 0.5, roll: 0.3 }).warn, false);
    // The load follows the throttle and the climb, and stays on its dial; the levels creep slowly, within theirs.
    const load = state => L.greebles(40, 5, { calm: true, ...state }).load;
    assert.ok(load({ throttle: 2.2 }) > load({ throttle: 1 }) + 0.3 && load({ throttle: 1 }) > load({ throttle: 0.45 }));
    assert.ok(load({ climb: 30 }) > load({}) + 0.1);
    let lo = 1, hi = 0, step = 0;
    for (let t = 0, last = null; t < 3600; t += 1) {
        const g = L.greebles(t, 5, { throttle: 0.45 + (t % 7) / 4 });
        assert.ok(g.load >= 0 && g.load <= 1);
        for (const c of g.creep) { assert.ok(c >= 0 && c <= 1); }
        const c = L.greebles(t, 5, {}).creep[1];
        lo = Math.min(lo, c);
        hi = Math.max(hi, c);
        if (last !== null) step = Math.max(step, Math.abs(c - last));
        last = c;
    }
    assert.ok(hi - lo > 0.3 && step < 0.01, `a level creeps from ${lo} to ${hi}, at most ${step} a second`);
});

test('settings: the panel offers what the code knows, and the keys step through it', () => {
    const schema = context.WP.schemaOf('ice-patrol'), options = key => plain(schema.find(c => c.key === key).options.map(([id]) => id));
    assert.deepEqual(options('time').sort(), plain(vm.runInContext('ICE_TIME_ORDER', context)).sort());
    assert.deepEqual(options('weather').sort(), plain(vm.runInContext('ICE_WEATHER_ORDER', context)).sort());
    assert.deepEqual(options('cockpit'), plain(vm.runInContext('ICE_VIEWS', context)));
    assert.deepEqual(options('glow'), Object.keys(plain(vm.runInContext('ICE_GLOWS', context))));
    assert.deepEqual(options('radarRange'), plain(vm.runInContext('ICE_RANGES', context)));
    for (const mode of vm.runInContext('ICE_TIME_ORDER', context)) assert.ok(vm.runInContext('ICE_TIME_NAMES', context)[mode], `a name for ${mode}`);
    for (const mode of vm.runInContext('ICE_WEATHER_ORDER', context)) assert.ok(vm.runInContext('ICE_WEATHER_NAMES', context)[mode], `a name for ${mode}`);
    const wingmen = schema.find(c => c.key === 'wingmen');
    assert.equal(wingmen.max, vm.runInContext('ICE_SLOTS.length', context), 'a slot for every wingman');
    const entry = context.WP.entry('ice-patrol');
    assert.deepEqual(plain(entry.keys.flatMap(k => k.keys)), ['a', 'd', 'w', 's', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'q', 'e', 'x', 't', 'v', 'r']);
    const stick = plain(vm.runInContext('ICE_STICK', context));
    for (const binding of entry.keys.slice(0, 2)) for (const key of binding.keys) assert.ok(stick[key.toLowerCase()], `${key} pushes the stick`);
    assert.deepEqual(options('panelSize'), Object.keys(plain(vm.runInContext('ICE_PANEL_SIZES', context))));
    assert.deepEqual(plain(entry.effects.map(([name]) => name)), ['shadows', 'sparkle']);
    // Turbulence: a slider from dead level to twice the bob, 1 by default.
    const turbulence = schema.find(c => c.key === 'turbulence');
    assert.deepEqual([turbulence.min, turbulence.max, context.WP.defaultsOf('ice-patrol').turbulence], [0, 2, 1]);
    // Every switch the cockpit shows is one the logic keeps, and none twice.
    const shown = [...plain(vm.runInContext('ICE_BAYS', context)).flat().map(([i]) => i), ...plain(vm.runInContext('ICE_TOGGLES', context)).map(([i]) => i).filter(i => i >= 0), ...plain(vm.runInContext('ICE_SIDE_TOGGLES', context)).flat()];
    assert.deepEqual([...shown].sort((a, b) => a - b), Array.from({ length: L.GREEBLE.switches }, (_, i) => i));
});

test('cheap and clean: no per-frame pixel reads, blurs, clocks or storage of its own', () => {
    for (const [name, source] of Object.entries(sources)) {
        assert.ok(!/getImageData|putImageData|shadowBlur|\.filter\s*=/.test(source), `${name}: a per-pixel or blur call`);
        assert.ok(!/new Date\(|Date\.now\(/.test(source), `${name}: reads the clock itself (use host.now())`);
        assert.ok(!/localStorage|sessionStorage/.test(source), `${name}: touches storage itself`);
        assert.ok(!/setInterval|setTimeout/.test(source), `${name}: a timer of its own`);
        assert.ok(!/https?:\/\//.test(source), `${name}: a URL`);
    }
    // The shaders agree with the logic about the terrain's shape: they are built from the same numbers.
    const shader = vm.runInContext('ICE_SHADERS.terrainVS(IceLogic.SHAPE) + ICE_SHADERS.terrainFS(IceLogic.SHAPE, 6)', context);
    for (const [name, key] of [['MTN', 'mountain'], ['GULLY', 'gully'], ['HILL', 'hill'], ['ROLL', 'roll']]) {
        assert.ok(shader.includes(`#define ${name} ${L.SHAPE[key].toFixed(1)}`), `${name} in the shader`);
    }
    assert.equal(L.LAYERS.length, 6);
});
