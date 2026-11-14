// Ice Patrol (SPEC §10.34): the world's own logic, in a Node vm, without a
// browser. The noise tiles; the textures decode to the heights the pilot
// flies by; the autopilot covers the same ground at any frame rate and
// never touches the snow; the sun, the weather and the radar behave.
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

test('radar: a slope that faces the dish shines, and the ground behind a ridge is dark', () => {
    const out = new Float32Array(40);
    // Level snow from 50 m up: an unbroken return, strong from right
    // below (the beam meets it squarely) and fading with distance.
    const level = () => {
        assert.ok([...out].every(v => v > 0), 'flat ground returns everywhere');
        for (let i = 1; i < out.length; i++) assert.ok(out[i] <= out[i - 1] + 1e-6, 'and fades with range');
        assert.ok(out[39] < 0.25 && out[0] > out[39]);
    };
    L.radarRay(() => 0, 0, 50, 0, 0, 4000, 40, out);
    level();
    // A ridge 300 m high, 1.5 km north, a kilometre through.
    const ridge = (x, z) => Math.max(0, 300 - Math.abs(z - 1500) * 0.6);
    L.radarRay(ridge, 0, 50, 0, 0, 4000, 40, out);
    const bin = z => Math.floor(z / 100);
    assert.ok(out[bin(1250)] > 0.6 && out[bin(1250)] > out[bin(900)] * 2, `its near face: ${out[bin(1250)]}`);
    assert.equal(out[bin(1750)], 0, 'its far face');
    assert.equal(out[bin(2400)], 0, 'the ground in its shadow');
    assert.ok(out[bin(500)] > 0, 'the ground before it');
    // Look the other way and there is no ridge.
    L.radarRay(ridge, 0, 50, 0, Math.PI, 4000, 40, out);
    level();
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
    assert.deepEqual(plain(entry.keys.flatMap(k => k.keys)), ['w', 't', 'v', 'r']);
    assert.deepEqual(plain(entry.effects.map(([name]) => name)), ['shadows', 'sparkle']);
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
