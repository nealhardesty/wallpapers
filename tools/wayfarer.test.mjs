// Wayfarer (SPEC §10.38): the world's own logic, without a browser. The road
// never doubles back and is always walkable; the traveller stands on it for
// hours of day and night; every country and every kind of place turns up;
// the same seed is the same world, and it is the same world three million
// kilometres from home; the squares it is drawn from are sound.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

const DIR = resolve(import.meta.dirname, '../web/wallpapers/wayfarer');
const FILES = ['way-logic.js', 'way-models.js', 'way-actors.js', 'way-gl.js', 'wayfarer.js'];
const sources = Object.fromEntries(FILES.map(name => [name, readFileSync(join(DIR, name), 'utf8')]));
const context = vm.createContext({});
vm.runInContext(readFileSync(resolve(DIR, '../../core/wp.js'), 'utf8'), context);
vm.runInContext(readFileSync(join(DIR, 'defaults.js'), 'utf8'), context);
vm.runInContext(readFileSync(join(DIR, 'settings.js'), 'utf8'), context);
for (const name of FILES) vm.runInContext(sources[name], context);
vm.runInContext(readFileSync(resolve(DIR, '../catalog.js'), 'utf8'), context);
// The logic and the models are pure, so the tests that walk for hours run
// them as a plain function: a vm context makes inner loops ten times slower.
const { L, M, A, Soup, Stack } = new Function(`${sources['way-logic.js']}\n${sources['way-models.js']}\n${sources['way-actors.js']}\nreturn { L: WayLogic, M: WayModels, A: WayActors, Soup: WaySoup, Stack: WayStack };`)();
const plain = value => JSON.parse(JSON.stringify(value));
const seeded = seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const world = L.world(7);
const SETTLED = ['city', 'village', 'hamlet'];

test('the road: one line that wanders but never doubles back, level across and gentle along', () => {
    let widest = 0, steepest = 0, tilt = 0;
    for (let z = 0; z < 40000; z += 2) {
        const r = world.at(z), x = r.x, slope = Math.abs(r.slope);
        widest = Math.max(widest, slope);
        assert.ok(Math.abs(world.roadX(z + 2) - x) < 3, `a jump at ${z}`);
        const here = world.surface(x, z), [ax, az] = world.place(z + 2, 0), ahead = world.surface(ax, az);
        steepest = Math.max(steepest, Math.abs(ahead - here) / 2);
        // Level from edge to edge, bridges included.
        for (const d of [-1.5, 1.5]) tilt = Math.max(tilt, Math.abs(world.surface(world.place(z, d)[0], z) - here));
    }
    assert.ok(widest < 1.3, `it turns ${Math.atan(widest) * 180 / Math.PI}° off its line`);
    assert.ok(widest > 0.4, 'and it does wander');
    assert.ok(steepest < 0.34, `a grade of ${(steepest * 100).toFixed(0)}%`);
    assert.ok(tilt < 0.45, `${tilt.toFixed(2)} m of camber`);
});

test('the ground: continuous, with hills, valleys, mountains and water, and the road above the water', () => {
    const random = seeded(3);
    let jump = 0, lo = Infinity, hi = -Infinity, wet = 0;
    for (let i = 0; i < 20000; i++) {
        const z = random() * 60000, [x] = world.place(z, (random() - 0.5) * 900), h = world.ground(x, z);
        assert.ok(Number.isFinite(h));
        jump = Math.max(jump, Math.abs(world.ground(x + 0.5, z) - h), Math.abs(world.ground(x, z + 0.5) - h));
        lo = Math.min(lo, h - world.at(z).y);
        hi = Math.max(hi, h - world.at(z).y);
        wet += h < world.water(x, z);
    }
    assert.ok(jump < 3.2, `a step of ${jump.toFixed(2)} m in half a metre`);
    assert.ok(hi > 150 && lo < -3, `from ${lo.toFixed(0)} to ${hi.toFixed(0)} m about the road`);
    assert.ok(wet > 200 && wet < 6000, `${wet} of 20000 points under water`);
    for (let z = 0; z < 60000; z += 3) {
        const x = world.roadX(z), level = world.water(x, z), deck = world.bridge(z);
        assert.ok(world.surface(x, z) > level + 0.5, `the road is awash at ${z}`);
        if (deck !== null) assert.ok(deck > level + 1.5 && Math.abs(deck - world.at(z).y) < 0.5, `the bridge at ${z}`);
    }
});

test('the countries: all eight in every round, never the same twice running, with every kind of place', () => {
    const biomes = {}, places = {};
    let streams = 0;
    for (let i = 104; i < 424; i++) {
        const l = world.leg(i);
        biomes[l.biome] = (biomes[l.biome] || 0) + 1;
        places[l.place] = (places[l.place] || 0) + 1;
        streams += !!l.stream;
        assert.notEqual(l.biome, world.leg(i - 1).biome, `two legs of ${l.biome} at ${i}`);
        if (l.place === 'city') assert.ok(!['pass', 'lake', 'coast'].includes(l.biome), `a city in the ${l.biome}`);
        if (l.stream) assert.ok(![l.biome, world.leg(i - 1).biome].some(b => ['pass', 'lake', 'coast'].includes(b)));
    }
    assert.deepEqual(Object.keys(biomes).sort(), plain(L.BIOMES).sort());
    for (const [biome, n] of Object.entries(biomes)) assert.equal(n, 40, `${biome} came round ${n} times in 40 rounds`);
    for (const kind of ['city', 'village', 'hamlet', 'stones', 'castle', 'elder', 'ruin', 'jetty', 'cairn', 'mill', 'abbey', 'lighthouse', 'ring']) assert.ok(places[kind] >= 2, `${kind}: ${places[kind]}`);
    assert.ok(places.city >= 15 && places.village >= 60, `cities ${places.city}, villages ${places.village}`);
    assert.ok(streams > 20, `${streams} streams`);
    // The towns setting: none at 0, more at the top.
    const count = towns => { const w = L.world(7, { towns }); let n = 0; for (let i = 100; i < 420; i++) n += SETTLED.includes(w.leg(i).place); return n; };
    assert.equal(count(0), 0);
    assert.ok(count(1.6) > count(1) && count(1) > count(0.5), `${count(0.5)}, ${count(1)}, ${count(1.6)}`);
    // And it is the same road whatever is built along it.
    assert.equal(L.world(7, { towns: 0 }).roadX(12345), world.roadX(12345));
    // The seasons turn along the road, unless one is chosen.
    const seen = new Set();
    for (let z = 0; z < 60000; z += 500) seen.add(world.season(z).index);
    assert.equal(seen.size, 4);
    assert.equal(L.world(7, { season: 'winter' }).season(999).snow, 1);
    assert.equal(L.world(7, { season: 'summer' }).season(999).snow, 0);
});

test('the same seed is the same world; another seed is another', () => {
    const again = L.world(7), other = L.world(8);
    const sample = w => { const out = []; for (let z = 0; z < 9000; z += 137) out.push(w.ground(w.roadX(z) + 40, z), w.leg(Math.floor(z / 360)).place); return out; };
    assert.deepEqual(sample(again), sample(world));
    assert.notDeepEqual(sample(other), sample(world));
    assert.deepEqual(plain(again.scatter(3, 40)), plain(world.scatter(3, 40)));
    assert.deepEqual(plain(again.layout(12)), plain(world.layout(12)));
});

test('three million kilometres down the road it is the same kind of world, to the millimetre', () => {
    const z0 = 3e9 + 123.456;
    let jump = 0;
    const biomes = new Set();
    for (let i = 0; i < 4000; i++) {
        const z = z0 + i * 7.3, x = world.roadX(z), h = world.ground(x + 30, z);
        assert.ok(Number.isFinite(h) && Math.abs(world.roadX(z + 1) - x) < 1.5);
        jump = Math.max(jump, Math.abs(world.ground(x + 30.25, z) - h));
        biomes.add(world.at(z).near.biome);
    }
    assert.ok(jump < 1, `a step of ${jump} m`);
    assert.equal(biomes.size, 8);
    // A square built out there keeps its own small numbers: the camera's offset is taken in doubles.
    const cz = Math.floor(z0 / 64), cx = Math.floor(world.roadX(z0) / 64), sq = M.square(world, cx, cz, 64, 32, false);
    for (let i = 0; i < sq.ground.n; i++) assert.ok(Math.abs(sq.ground.F[i * 6]) < 70 && Math.abs(sq.ground.F[i * 6 + 2]) < 70, 'local metres');
    assert.equal(sq.z0, cz * 64);
    const j = L.journeyStart(world, z0);
    for (let i = 0; i < 6000; i++) L.journeyStep(j, 1 / 30, world, { pace: 1, night: 0, camps: false, rests: false });
    assert.ok(j.distance > 270 && j.distance < 352, `walked ${j.distance} m in 200 s`);
    assert.ok(Math.abs(L.standing(j, world).y - world.surface(world.roadX(j.z), j.z)) < 0.02);
});

test('places: a village lines its street, a city stands inside its walls, and nothing is built on the road', () => {
    let cities = 0, villages = 0;
    for (let i = 100; i < 260; i++) {
        const l = world.leg(i), items = world.layout(i), of = k => items.filter(item => item.k === k);
        for (const item of items) {
            if (['bunting', 'gate', 'spawn', 'folk', 'wall', 'sign', 'lamp'].includes(item.k)) continue;
            const d = Math.abs(world.lateral(item.x, item.z)), half = item.k === 'house' ? item.dp / 2 : item.k === 'stall' ? 1.4 : 0.8;
            assert.ok(d - half > 2.4, `${l.place} ${i}: a ${item.k} ${d.toFixed(1)} m from the road's middle`);
        }
        for (const lamp of of('lamp')) assert.ok(Math.abs(world.lateral(lamp.x, lamp.z)) > 2.4, 'a lamp in the road');
        if (l.place === 'village') {
            villages++;
            const houses = of('house'), sides = new Set(houses.map(h => Math.sign(world.lateral(h.x, h.z))));
            assert.ok(houses.length >= 8 && sides.size === 2, `a village of ${houses.length} houses`);
            assert.ok(of('well').length === 1 && of('stall').length === 2 && of('chapel').length === 1 && of('lamp').length >= 5 && of('folk').length >= 6);
            assert.ok(houses.some(h => h.inn), 'an inn');
        }
        if (l.place === 'city') {
            cities++;
            const houses = of('house');
            assert.ok(houses.length >= 45, `a city of ${houses.length} houses`);
            assert.ok(of('wall').length >= 26 && of('gate').length === 2 && of('tower').length >= 8 && of('keep').length === 1 && of('spire').length === 1 && of('fountain').length === 1 && of('stall').length >= 4);
            assert.ok(of('folk').filter(f => f.role === 'guard').length === 4, 'guards at both gates');
            // Every house inside the oval of the walls, and the gates on the road.
            for (const h of houses) assert.ok(((h.z - l.zc) / 104) ** 2 + (world.lateral(h.x, h.z) / 76) ** 2 < 0.95, 'a house outside the walls');
            for (const g of of('gate')) assert.ok(Math.abs(world.lateral(g.x, g.z)) < 0.01 && Math.abs(Math.abs(g.z - l.zc) - 104) < 0.01);
            // No two houses in one another: rows are spaced.
            for (let a = 0; a < houses.length; a++) for (let b = a + 1; b < houses.length; b++) {
                const gap = Math.hypot(houses[a].x - houses[b].x, houses[a].z - houses[b].z);
                assert.ok(gap > 3.6, `two houses ${gap.toFixed(1)} m apart`);
            }
        }
    }
    assert.ok(cities >= 5 && villages >= 20);
});

test('what grows: trees keep off the road, out of the water and out of town; far squares are a thinning of near ones', () => {
    const kinds = new Set(), small = new Set();
    let trees = 0;
    for (let cz = 1600; cz < 1750; cz++) {
        const cx = Math.floor(world.roadX(cz * 64 + 32) / 64);
        for (const dx of [-1, 0, 1]) {
            const near = world.scatter(cx + dx, cz), far = world.scatter(cx + dx, cz, true);
            for (const item of near) {
                if (item.k !== 'tree') { small.add(item.k); continue; }
                trees++;
                kinds.add(item.kind);
                const r = world.at(item.z), d = Math.abs(world.lateral(item.x, item.z));
                assert.ok(d >= 5.6, `a ${item.kind} ${d.toFixed(1)} m from the road`);
                assert.ok(item.y > world.water(item.x, item.z) + 0.4, 'a tree in the water');
                if (r.near.radius) assert.ok(Math.hypot(d, r.dz) > r.near.radius, 'a wild tree in town');
                assert.ok(Math.abs(item.y - world.ground(item.x, item.z)) < 1e-9);
            }
            const nearTrees = new Set(near.filter(i => i.k === 'tree').map(i => `${i.x},${i.z}`)), farTrees = far.filter(i => i.k === 'tree');
            for (const t of farTrees) assert.ok(nearTrees.has(`${t.x},${t.z}`), 'a far tree that is not there close up');
            if (nearTrees.size > 30) assert.ok(farTrees.length < nearTrees.size * 0.6, 'far squares are thinned');
        }
    }
    assert.ok(trees > 5000, `${trees} trees`);
    for (const kind of ['oak', 'poplar', 'fir', 'birch', 'willow', 'snag', 'apple', 'pine', 'shroom', 'glade']) assert.ok(kinds.has(kind), kind);
    for (const kind of ['bush', 'rock', 'flower', 'tuft', 'fern', 'reed', 'heather', 'lamp', 'fence', 'camp', 'bridge', 'spawn']) assert.ok(small.has(kind), kind);
});

test('the journey: hours of day and night on the road, on the ground, resting by fires and stopping at views', () => {
    const j = L.journeyStart(world, 360 * 300 + 40), modes = {}, dt = 1 / 20;
    let camps = 0, gazes = 0, before = j.mode, worst = 0, last = j.distance;
    for (let i = 0; i < 20 * 3600 * 4; i++) {
        const day = (i * dt / 720) % 1, night = L.light(L.bodies(day).sunEl).night;
        L.journeyStep(j, dt, world, { pace: 1, night, camps: true, rests: true });
        if (j.mode !== before) { camps += j.mode === 'camp'; gazes += j.mode === 'gaze'; before = j.mode; }
        modes[j.mode] = (modes[j.mode] || 0) + 1;
        assert.ok(j.distance >= last && j.speed >= 0 && j.speed < 2);
        last = j.distance;
        if (i % 7) continue;
        const me = L.standing(j, world), r = world.at(j.z);
        assert.equal(me.y, world.surface(me.x, me.z), 'feet on the ground');
        assert.ok(me.y > world.water(me.x, me.z) + 0.4, `in the water at ${j.z}`);
        if (j.mode === 'walk' || j.mode === 'gaze') { assert.ok(Math.abs(j.d) < 0.6, `${j.d} m off the middle of the road`); worst = Math.max(worst, Math.abs(j.d)); }
        else assert.ok(Math.abs(j.d) < 9 && !(r.near.radius && Math.abs(r.dz) < r.near.radius), `camping ${j.d} m off, at ${j.z}`);
        if (j.mode === 'camp') assert.ok(Math.abs(j.d - (j.camp.d - j.camp.side * 1.5)) < 0.4 && j.sit > 0 && j.fire > 0.3);
    }
    assert.ok(j.distance > 12000, `${j.distance.toFixed(0)} m in four hours`);
    assert.ok(camps >= 6 && camps <= 60, `${camps} nights by a fire`);
    assert.ok(gazes >= 6, `${gazes} views stopped for`);
    assert.ok(modes.walk > modes.camp * 3, 'mostly walking');
    // With both switched off it only walks.
    const k = L.journeyStart(world, 360 * 300 + 40);
    for (let i = 0; i < 20 * 1200; i++) { L.journeyStep(k, dt, world, { pace: 1, night: 1, camps: false, rests: false }); assert.equal(k.mode, 'walk'); }
});

test('the journey covers the same road at 10, 30, 60 and 120 frames a second, and Pace scales it', () => {
    const walk = (fps, pace = 1) => { const j = L.journeyStart(world, 5000); j.speed = L.WALK * pace; for (let i = 0; i < fps * 60; i++) L.journeyStep(j, 1 / fps, world, { pace, night: 0, camps: false, rests: false }); return j; };
    const base = walk(60);
    assert.ok(Math.abs(base.distance - L.WALK * 60 * 0.97) < 6, `${base.distance} m in a minute`);
    for (const fps of [10, 30, 120]) {
        const j = walk(fps);
        assert.ok(Math.abs(j.distance / base.distance - 1) < 0.01, `${fps} fps: ${j.distance} against ${base.distance}`);
        assert.ok(Math.abs(j.z - base.z) < 1.2);
    }
    assert.ok(Math.abs(walk(60, 2).distance / base.distance - 2) < 0.1);
});

test('the cameras: each sees the traveller from clear air, on the road or well above it', () => {
    const j = L.journeyStart(world, 360 * 500 + 10), dt = 1 / 10;
    const shot = { index: 0, t: 0, z0: j.z, span: 28 };
    const seen = new Set();
    for (let i = 0; i < 10 * 3600; i++) {
        L.journeyStep(j, dt, world, { pace: 1, night: i % 6000 > 4000 ? 1 : 0, camps: true, rests: true });
        shot.t += dt;
        if (shot.t > L.SHOTS[shot.index % L.SHOTS.length].secs) { shot.index++; shot.t = 0; shot.z0 = j.z; shot.span = L.WALK * L.SHOTS[shot.index % L.SHOTS.length].secs; }
        const me = L.standing(j, world);
        for (const mode of ['follow', 'first', 'drift']) {
            const cam = L.camera(mode, j, world, i * dt, shot);
            for (const v of [cam.x, cam.y, cam.z, cam.heading, cam.pitch]) assert.ok(Number.isFinite(v), mode);
            const floor = Math.max(world.surface(cam.x, cam.z), world.water(cam.x, cam.z)), away = Math.hypot(cam.x - me.x, cam.z - me.z), off = Math.abs(world.lateral(cam.x, cam.z)), up = cam.y - floor;
            assert.ok(up > 0.4, `${mode} (${L.SHOTS[shot.index % L.SHOTS.length].name}): ${up.toFixed(2)} m above the ground at ${j.z.toFixed(0)}`);
            assert.ok(Math.abs(cam.pitch) < 1.2);
            // Low cameras keep to the road, where nothing stands; anything further out is above the rooftops.
            if (up < 30) assert.ok(off < 5.2 + Math.abs(j.d), `${mode}: ${off.toFixed(1)} m off the road and only ${up.toFixed(1)} m up`);
            if (mode === 'follow') assert.ok(away > 3.5 && away < 9, `follow: ${away.toFixed(1)} m behind`);
            if (mode === 'first') assert.ok(away < 0.01 && cam.y - me.y > 0.9 && cam.y - me.y < 1.8);
            if (mode === 'drift') { assert.ok(away < 80, `drift: ${away.toFixed(0)} m away`); seen.add(L.SHOTS[shot.index % L.SHOTS.length].name); }
        }
    }
    assert.equal(seen.size, L.SHOTS.length);
});

test('the sky: a sun that rises behind and sets ahead, two moons, and light for every hour', () => {
    const noon = L.bodies(0.5), midnight = L.bodies(0), rise = L.bodies(0.25), set = L.bodies(0.75);
    assert.ok(noon.sunEl > 60 && midnight.sunEl < -60);
    assert.ok(Math.abs(rise.sunEl) < 1 && rise.sun[0] > 0.5 && rise.sun[2] < -0.4, 'sunrise over the right shoulder');
    assert.ok(Math.abs(set.sunEl) < 1 && set.sun[0] < -0.5 && set.sun[2] > 0.4, 'sunset ahead and to the left');
    assert.ok(midnight.moons[0][1] > 0.5, 'the big moon keeps the night');
    for (const body of [noon.sun, midnight.moons[0], midnight.moons[1]]) assert.ok(Math.abs(Math.hypot(...body) - 1) < 1e-9);
    const day = L.light(60), night = L.light(-40), dusk = L.light(2);
    assert.ok(day.lit === 0 && day.stars === 0 && day.night === 0 && day.day === 1);
    assert.ok(night.lit === 1 && night.stars === 1 && night.night === 1 && night.sun.every(v => v === 0));
    assert.ok(dusk.golden > 0.8 && dusk.horizon[0] > dusk.horizon[2] && dusk.lit > 0.1 && dusk.lit < 0.9, 'a red horizon and the first lamps');
    assert.ok(night.fill[2] > night.fill[0] * 2, 'a blue night');
    const sum = c => c[0] + c[1] + c[2];
    assert.ok(sum(day.sun) + sum(day.fill) > 6 * (sum(night.sun) + sum(night.fill)));
    assert.ok(sum(L.light(60, 1).sun) < sum(day.sun) * 0.25 && L.light(-40, 1).stars === 0, 'cloud takes the sun and the stars');
    let before = L.light(-30);
    for (let el = -29.5; el <= 70; el += 0.5) {
        const now = L.light(el);
        for (const key of ['zenith', 'horizon', 'sun', 'fill', 'bounce']) for (let i = 0; i < 3; i++) assert.ok(Math.abs(now[key][i] - before[key][i]) < 0.14, `${key} jumps at ${el}°`);
        before = now;
    }
});

test('weather: a chosen sky holds, and left to itself it comes and goes, rain only under cloud', () => {
    for (const [mode, [cloud, wet]] of Object.entries(L.WEATHER)) {
        const s = L.weatherStart('clear', seeded(1));
        for (let i = 0; i < 2400; i++) L.weatherStep(s, 0.1, mode, seeded(2));
        assert.ok(Math.abs(s.cloud - cloud) < 0.02 && Math.abs(s.wet - (cloud > 0.85 ? wet : 0)) < 0.02, `${mode}: ${s.cloud}, ${s.wet}`);
    }
    const random = seeded(5), s = L.weatherStart('auto', random);
    let wet = 0, clear = 0, n = 0;
    for (let i = 0; i < 10 * 3600 * 6; i++) {
        L.weatherStep(s, 0.1, 'auto', random, 1);
        assert.ok(s.cloud >= 0 && s.cloud <= 1 && s.wet >= 0 && s.wet <= 1);
        if (s.wet > 0.2) assert.ok(s.cloud > 0.6, `rain from a sky ${s.cloud} clouded`);
        wet += s.wet > 0.3; clear += s.cloud < 0.4; n++;
    }
    assert.ok(wet / n > 0.03 && wet / n < 0.4, `raining ${(wet / n * 100).toFixed(0)}% of six hours`);
    assert.ok(clear / n > 0.3, `clear ${(clear / n * 100).toFixed(0)}%`);
    const dry = L.weatherStart('auto', random);
    for (let i = 0; i < 36000; i++) { L.weatherStep(dry, 0.1, 'auto', random, 0); assert.ok(dry.wet < 0.01 || i < 600); }
    // Cold country: the pass, and winter.
    const pass = [...Array(200).keys()].map(i => world.leg(i)).find(l => l.biome === 'pass'), meadow = [...Array(200).keys()].map(i => world.leg(i)).find(l => l.biome === 'meadow');
    assert.equal(world.cold(pass.zc), Math.max(1, world.season(pass.zc).snow));
    assert.equal(L.world(7, { season: 'summer' }).cold(meadow.zc), 0);
    assert.equal(L.world(7, { season: 'winter' }).cold(meadow.zc), 1);
});

test('squares: sound triangles, within budget, with lights in town and water in the lake', () => {
    const find = want => [...Array(300).keys()].map(i => world.leg(i + 100)).find(want);
    const check = (sq, label, cap) => {
        for (const soup of [sq.ground, sq.props, sq.water]) {
            if (!soup) continue;
            for (let i = 0; i < soup.n; i++) {
                for (let k = 0; k < 3; k++) assert.ok(Number.isFinite(soup.F[i * 6 + k]), `${label}: a vertex is not a number`);
                const n = [12, 13, 14].map(o => soup.B[i * 24 + o] << 24 >> 24), len = Math.hypot(...n);
                assert.ok(len > 60 && len < 200, `${label}: a normal of length ${len / 127}`);
            }
        }
        assert.ok(sq.props.n <= cap && sq.props.n % 3 === 0, `${label}: ${sq.props.n} vertices of props`);
        assert.equal(sq.ground.n, (sq.cells + 3) ** 2);
        assert.ok(sq.low < sq.high);
    };
    const city = find(l => l.place === 'city'), cx = Math.floor(world.roadX(city.zc) / 64), cz = Math.floor(city.zc / 64);
    const town = M.square(world, cx, cz, 64, 32, false);
    check(town, 'the city square', 200000);
    assert.ok(town.lights.length > 20 && town.spawns.length > 5 && town.smokes.length > 3, `lights ${town.lights.length}, people ${town.spawns.length}, chimneys ${town.smokes.length}`);
    let glowing = 0;
    for (let i = 0; i < town.props.n; i++) glowing += town.props.B[i * 24 + 21] > 200;
    assert.ok(glowing > 300, `${glowing} vertices of lit window`);
    // The road is marked in the ground: its middle is inside, the far corner is not.
    const margins = [...Array(town.ground.n).keys()].map(i => town.ground.B[i * 24 + 20]);
    assert.ok(Math.max(...margins) > 140, 'the street runs through it');
    const lake = find(l => l.biome === 'lake'), lx = Math.floor((world.roadX(lake.zc) + lake.lake.side * 90) / 64), shore = M.square(world, lx, Math.floor(lake.zc / 64), 64, 32, false);
    check(shore, 'the lake square', 200000);
    assert.ok(shore.water && shore.water.n > 300, 'water in the lake');
    const wood = find(l => l.biome === 'forest' && l.place !== 'city'), fx = Math.floor(world.roadX(wood.zc) / 64) + 1, forest = M.square(world, fx, Math.floor(wood.zc / 64) + 1, 64, 32, false), thin = M.square(world, fx, Math.floor(wood.zc / 64) + 1, 64, 32, false, 0.35);
    check(forest, 'the forest square', 120000);
    assert.ok(Math.min(...[...Array(forest.ground.n).keys()].map(i => forest.ground.B[i * 24 + 20])) < 20, 'and the woods are off it');
    assert.ok(thin.props.n < forest.props.n * 0.75, `Low keeps ${thin.props.n} of ${forest.props.n}`);
    const far = M.square(world, Math.floor(world.roadX(city.zc) / 256), Math.floor(city.zc / 256), 256, 16, true);
    check(far, 'a far square', 120000);
    assert.ok(far.props.n > 3000 && far.lights.length === 0 && far.spawns.length === 0, 'far squares keep the buildings and drop the rest');
    assert.equal(M.gridIndices(32).length, 34 * 34 * 6);
    // A far square's houses are the same houses with the trimmings left off; and a square built in steps is the same square.
    const close = new Soup(), distant = new Soup(), plot = { w: 8, dp: 6.5, floors: 2, roof: 1, v: 0.37, jetty: true, crooked: true, stoneBase: true, shop: true };
    const got = M.house(close, plot), lite = M.house(distant, { ...plot, lite: true });
    assert.ok(distant.n < close.n * 0.3 && distant.n > 60, `a far house is ${distant.n} vertices of ${close.n}`);
    assert.ok(got.smoke && got.lamp && got.glow.length >= lite.glow.length && lite.glow.length > 2);
    const steps = M.squareSteps(world, cx, cz, 64, 32, false);
    let n = 0, last;
    while (!(last = steps.next()).done) n++;
    assert.ok(n > 12, `a city square is built in ${n} steps`);
    assert.equal(last.value.props.n, town.props.n);
    // Winter whitens the roofs; the same square in summer does not.
    const tint = w => { const sq = M.square(w, cx, cz, 64, 32, false); let sum = 0; for (let i = 0; i < sq.props.n; i++) sum += sq.props.B[i * 24 + 18]; return sum / sq.props.n; };
    assert.ok(tint(L.world(7, { season: 'winter' })) > tint(L.world(7, { season: 'summer' })) + 8);
});

test('everyone can be drawn: the traveller in every look, the townsfolk, every beast and bird', () => {
    const out = new Soup(), st = new Stack();
    const sound = label => { assert.ok(out.n > 30 && out.n % 3 === 0, `${label}: ${out.n} vertices`); for (let i = 0; i < out.n * 6; i += 6) assert.ok(Number.isFinite(out.F[i]) && Math.abs(out.F[i]) < 60 && Math.abs(out.F[i + 1]) < 60, `${label}: a vertex astray`); };
    for (const [name, look] of Object.entries(A.LOOKS)) {
        for (const pose of [{ stride: 0.3, moving: 1 }, { stride: 0, moving: 0, sit: 1, act: 'warm' }, { stride: 0.7, moving: 1, lantern: true, lit: true }]) {
            out.clear();
            A.person(out, st, 1, 2, 3, look, { yaw: 0.7, t: 5, ...pose });
            sound(name);
            // Feet on the ground they were given, head a person's height above it.
            let lo = Infinity, hi = -Infinity;
            for (let i = 0; i < out.n; i++) { lo = Math.min(lo, out.F[i * 6 + 1]); hi = Math.max(hi, out.F[i * 6 + 1]); }
            assert.ok(Math.abs(lo - 2) < 0.25 && hi - 2 > (pose.sit ? 1.2 : 1.75) && hi - 2 < 3.2, `${name}: from ${lo} to ${hi}`);
        }
    }
    for (const role of ['stroll', 'guard', 'child', 'hoe', 'fish', 'chat']) for (let v = 0.05; v < 1; v += 0.3) { out.clear(); A.person(out, st, 0, 0, 0, A.townsfolk(v, role), { yaw: 0, stride: 0.2, moving: 1, act: role, t: 1 }); sound(role); }
    for (const kind of Object.keys(A.BEASTS)) for (const pose of [{ gait: 0.2, moving: 1 }, { gait: 0, graze: 1 }, { gait: 0.4, moving: 1, bound: true }, { gait: 0, sit: 1 }]) { out.clear(); A.beast(out, st, kind, 0, 0, 0, { yaw: 1, t: 2, ...pose }); sound(kind); }
    for (const kind of Object.keys(A.BIRDS)) for (const pose of [{ flap: 0.5 }, { fold: 1 }]) { out.clear(); A.bird(out, st, kind, 0, 5, 0, { yaw: 2, ...pose }); assert.ok(out.n > 20); }
    for (const model of [A.wagon(), A.airship(), A.balloon(), M.fixed('sails'), M.fixed('fire'), M.fixed('boat'), M.fixed('tent'), M.fixed('bridge')]) assert.ok(model.n > 10 && model.n % 3 === 0);
});

test('settings: the panel offers what the code knows, and the keys are declared', () => {
    const schema = context.WP.schemaOf('wayfarer'), options = key => plain(schema.find(c => c.key === key).options.map(([id]) => id));
    const constant = name => plain(vm.runInContext(name, context));
    assert.deepEqual(options('camera'), constant('WAY_CAMERAS'));
    assert.deepEqual(options('time'), constant('WAY_TIME_ORDER'));
    assert.deepEqual(options('weather'), constant('WAY_WEATHER_ORDER'));
    assert.deepEqual(options('companion'), constant('WAY_COMPANIONS'));
    assert.deepEqual(options('traveller'), Object.keys(A.LOOKS));
    assert.deepEqual(options('season'), ['journey', ...L.SEASONS]);
    for (const kind of constant('WAY_COMPANIONS')) assert.ok(kind === 'wisp' || kind === 'none' || A.BEASTS[kind], kind);
    for (const mode of constant('WAY_WEATHER_ORDER')) assert.ok(mode === 'auto' || L.WEATHER[mode], mode);
    for (const [order, names] of [['WAY_TIME_ORDER', 'WAY_TIME_NAMES'], ['WAY_WEATHER_ORDER', 'WAY_WEATHER_NAMES'], ['WAY_CAMERAS', 'WAY_CAMERA_NAMES']]) for (const mode of constant(order)) assert.ok(constant(names)[mode], `a name for ${mode}`);
    for (const mode of constant('WAY_TIME_ORDER')) assert.ok(mode === 'cycle' || mode === 'clock' || mode in constant('WAY_TIMES'));
    const entry = context.WP.entry('wayfarer');
    assert.deepEqual(plain(entry.keys.flatMap(k => k.keys)), ['v', 't', 'x', 'n']);
    assert.deepEqual(plain(entry.effects.map(([name]) => name)), ['shadows', 'mirror']);
    assert.deepEqual(plain(entry.scripts), FILES.map(name => `wayfarer/${name}`));
});

test('cheap and clean: no per-frame pixel reads, blurs, clocks, timers or storage of its own; shaders a WebGL 1 GPU will take', () => {
    for (const [name, source] of Object.entries(sources)) {
        assert.ok(!/getImageData|putImageData|shadowBlur|\.filter\s*=/.test(source), `${name}: a per-pixel or blur call`);
        assert.ok(!/new Date\(|Date\.now\(/.test(source), `${name}: reads the clock itself (use host.now())`);
        assert.ok(!/localStorage|sessionStorage/.test(source), `${name}: touches storage itself`);
        assert.ok(!/setInterval|setTimeout/.test(source), `${name}: a timer of its own`);
        assert.ok(!/https?:\/\//.test(source), `${name}: a URL`);
        assert.ok(!/new Image\(|fetch\(|XMLHttpRequest|import\(/.test(source), `${name}: loads something`);
    }
    for (const name of ['way-logic.js', 'way-models.js']) assert.ok(!/Math\.random|document\.|window\.|performance\./.test(sources[name]), `${name} is not pure`);
    const shaders = plain(vm.runInContext(`[WAY_SHADERS.solidVS, WAY_SHADERS.groundFS(true), WAY_SHADERS.groundFS(false), WAY_SHADERS.propFS(true), WAY_SHADERS.waterFS(true), WAY_SHADERS.waterFS(false), WAY_SHADERS.skyVS, WAY_SHADERS.skyFS, WAY_SHADERS.spriteVS, WAY_SHADERS.spriteFS, WAY_SHADERS.fallVS, WAY_SHADERS.fallFS, WAY_SHADERS.depthVS, WAY_SHADERS.depthFS]`, context));
    for (const source of shaders) {
        const code = source.replace(/\/\/.*$/gm, '');
        assert.ok(!/\bflat\b|\bin\b|\bout\b|texture\(|#version/.test(code), 'GLSL ES 3 in a WebGL 1 shader');
        // Uniform arrays are only ever indexed by a constant (the LAMP macro's argument).
        for (const [, index] of code.matchAll(/u(?:LampAt|LampCol|Moon|MoonCol)\[([^\]]+)\]/g)) assert.ok(/^(\d+|i)$/.test(index), `an array indexed by ${index}`);
        assert.ok(!/for\s*\(/.test(code), 'a loop in a shader');
    }
    assert.ok(shaders[1].includes('uShadowMap') && !shaders[2].includes('uShadowMap'), 'shadows compile out');
    assert.ok(shaders[4].includes('uRange') && !shaders[5].includes('uRange'), 'the mirror compiles out');
});
