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
const FILES = ['way-logic.js', 'way-models.js', 'way-detail.js', 'way-actors.js', 'way-people.js', 'way-companions.js', 'way-gl.js', 'wayfarer.js'];
const sources = Object.fromEntries(FILES.map(name => [name, readFileSync(join(DIR, name), 'utf8')]));
const context = vm.createContext({});
vm.runInContext(readFileSync(resolve(DIR, '../../core/wp.js'), 'utf8'), context);
vm.runInContext(readFileSync(join(DIR, 'defaults.js'), 'utf8'), context);
vm.runInContext(readFileSync(join(DIR, 'settings.js'), 'utf8'), context);
for (const name of FILES) vm.runInContext(sources[name], context);
vm.runInContext(readFileSync(resolve(DIR, '../catalog.js'), 'utf8'), context);
// The logic and the models are pure, so the tests that walk for hours run
// them as a plain function: a vm context makes inner loops ten times slower.
const { L, M, A, D, P, K, Soup, Stack } = new Function(`${FILES.slice(0, 6).map(name => sources[name]).join('\n')}\nreturn { L: WayLogic, M: WayModels, A: WayActors, D: WayDetail, P: WayPeople, K: WayCompanions, Soup: WaySoup, Stack: WayStack };`)();
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
            if (['bunting', 'gate', 'spawn', 'folk', 'wall', 'sign', 'lamp', 'drawbridge'].includes(item.k)) continue;
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
        if (l.place === 'city' && !l.grand) {
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
    const city = find(l => l.place === 'city' && !l.grand), cx = Math.floor(world.roadX(city.zc) / 64), cz = Math.floor(city.zc / 64);
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
          for (const rig of [A, P]) {
            out.clear();
            rig.person(out, st, 1, 2, 3, look, { yaw: 0.7, t: 5, ...pose });
            sound(name);
            // Feet on the ground they were given, head a person's height above it.
            let lo = Infinity, hi = -Infinity;
            for (let i = 0; i < out.n; i++) { lo = Math.min(lo, out.F[i * 6 + 1]); hi = Math.max(hi, out.F[i * 6 + 1]); }
            assert.ok(Math.abs(lo - 2) < 0.25 && hi - 2 > (pose.sit ? 1.2 : 1.7) && hi - 2 < 3.4, `${name}: from ${lo} to ${hi}`);
          }
        }
    }
    for (const rig of [A, P]) for (const role of ['stroll', 'guard', 'child', 'hoe', 'fish', 'chat']) for (let v = 0.05; v < 1; v += 0.3) { out.clear(); rig.person(out, st, 0, 0, 0, A.townsfolk(v, role), { yaw: 0, stride: 0.2, moving: 1, act: role, t: 1 }); sound(role); }
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
    assert.deepEqual(options('companionPick'), constant('WAY_PICKS'));
    assert.deepEqual(options('companionChoice'), plain(L.COMPANIONS.map(c => c.id)));
    assert.deepEqual(plain(schema.find(c => c.key === 'companionChoice').options.map(o => o[1])), plain(L.COMPANIONS.map(c => c.label)), 'the chips name them as the code does');
    assert.deepEqual(options('orbitMode'), constant('WAY_ORBITS'));
    assert.deepEqual(options('craft'), constant('WAY_CRAFT'));
    assert.deepEqual(plain(L.GROUPS), constant('WAY_PICKS').slice(1, -1));
    assert.deepEqual(options('traveller'), Object.keys(A.LOOKS));
    assert.deepEqual(options('season'), ['journey', ...L.SEASONS]);
    for (const mode of constant('WAY_WEATHER_ORDER')) assert.ok(mode === 'auto' || L.WEATHER[mode], mode);
    for (const [order, names] of [['WAY_TIME_ORDER', 'WAY_TIME_NAMES'], ['WAY_WEATHER_ORDER', 'WAY_WEATHER_NAMES'], ['WAY_CAMERAS', 'WAY_CAMERA_NAMES']]) for (const mode of constant(order)) assert.ok(constant(names)[mode], `a name for ${mode}`);
    for (const mode of constant('WAY_TIME_ORDER')) assert.ok(mode === 'cycle' || mode === 'clock' || mode in constant('WAY_TIMES'));
    const entry = context.WP.entry('wayfarer');
    assert.deepEqual(plain(entry.keys.flatMap(k => k.keys)), ['v', 't', 'x', 'n', 'g']);
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
    for (const name of ['way-logic.js', 'way-models.js', 'way-detail.js', 'way-people.js', 'way-companions.js']) assert.ok(!/Math\.random|document\.|window\.|performance\./.test(sources[name]), `${name} is not pure`);
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

// ---- The upgrades: the orbiting camera, the company, the new travellers and their craft, grand cities, fine models.

test('the orbiting camera: clear air at every bearing and height for an hour of walking; a drag sets it and it stays; turning turns the same at any frame rate', () => {
    const O = L.ORBIT, j = L.journeyStart(world, 360 * 500 + 10), dt = 1 / 10, orbits = [];
    for (const az of [0, 0.8, 1.57, 2.4, 3.14, -2.4, -1.57, -0.8]) for (const [el, dist] of [[O.elMin, 6], [0.3, 8], [0.8, 14], [1.2, 30], [O.elMax, 45], [0.15, 60]]) orbits.push(L.orbitStart(az, el, dist));
    let pulled = 0, n = 0, city = 0;
    for (let i = 0; i < 10 * 3600; i++) {
        L.journeyStep(j, dt, world, { pace: 1, night: i % 6000 > 4000 ? 1 : 0, camps: true, rests: true });
        const o = orbits[i % orbits.length], me = L.standing(j, world), cam = L.orbitStep(o, dt * orbits.length, j, world, {});
        for (const v of [cam.x, cam.y, cam.z, cam.heading, cam.pitch]) assert.ok(Number.isFinite(v));
        const floor = Math.max(world.surface(cam.x, cam.z), world.water(cam.x, cam.z)), away = Math.hypot(cam.x - me.x, cam.y - me.y - 1.3 + 0.5 * j.sit, cam.z - me.z);
        assert.ok(cam.y - floor > 0.45, `orbit ${o.az.toFixed(1)}/${o.el.toFixed(2)}: ${(cam.y - floor).toFixed(2)} m above the ground at ${j.z.toFixed(0)}`);
        assert.ok(away <= o.dist + 0.6 && away > 0.5, `${away.toFixed(1)} m away, asked ${o.dist}`);
        assert.ok(cam.pitch <= 0.2 && cam.pitch >= -Math.PI / 2 - 1e-9);
        // Inside nothing: not a house, a wall, a tree nor a tower.
        if (cam.reach > 1.2) assert.ok(L.inOpen(world, cam.x, cam.y, cam.z, 0.05), `inside something at ${j.z.toFixed(0)} (${world.at(j.z).near.place}), bearing ${o.az.toFixed(1)}, height ${o.el.toFixed(2)}, ${cam.reach.toFixed(1)} m out`);
        // And it looks at the traveller.
        const fx = Math.sin(cam.heading) * Math.cos(cam.pitch), fy = Math.sin(cam.pitch), fz = Math.cos(cam.heading) * Math.cos(cam.pitch), tx = me.x - cam.x, ty = me.y + 1.3 - 0.5 * j.sit - cam.y, tz = me.z - cam.z, tl = Math.hypot(tx, ty, tz);
        if (tl > 1.5 && cam.y - floor > 0.6) assert.ok((fx * tx + fy * ty + fz * tz) / tl > 0.985, 'it looks away from the traveller');
        pulled += cam.reach < o.dist - 0.5; n++;
        city += world.at(j.z).near.radius ? 1 : 0;
    }
    assert.ok(pulled > 50 && pulled < n * 0.7, `it came in for something ${pulled} times of ${n}`);
    assert.ok(city > 500, 'the walk went through towns');
    // Bearings: 0 is behind the traveller, a quarter turn is at their right hand, a half is in front.
    const k = L.journeyStart(world, 5000), h = world.heading(k.z), me = L.standing(k, world);
    const at = az => { const c = L.orbitCamera(k, world, az, 0.4, 6); return [(c.x - me.x) * Math.sin(h) + (c.z - me.z) * Math.cos(h), (c.x - me.x) * Math.cos(h) - (c.z - me.z) * Math.sin(h)]; };
    assert.ok(at(0)[0] < -5 && Math.abs(at(0)[1]) < 0.01 && at(Math.PI)[0] > 5 && at(Math.PI / 2)[1] > 5 && at(-Math.PI / 2)[1] < -5);
    assert.ok(Math.abs(L.orbitCamera(k, world, 1, Math.PI / 2, 20).pitch + Math.PI / 2) < 1e-6, 'straight down from overhead');
    // A drag: across the screen is most of a turn, down the screen is up and over; it clamps at the grass and overhead, and it stays.
    const o = L.orbitStart(0.5, 0.3, 8), from = L.orbitGrab(o, false);
    L.orbitDrag(o, from, -640, 0, 1280, 800);
    assert.ok(Math.abs(o.az - (0.5 + O.dragAz / 2)) < 1e-9 && o.el === 0.3);
    L.orbitDrag(o, from, 0, 400, 1280, 800);
    assert.ok(Math.abs(o.el - (0.3 + O.dragEl / 2)) < 1e-9);
    L.orbitDrag(o, from, 0, 5000, 1280, 800); assert.equal(o.el, O.elMax);
    L.orbitDrag(o, from, 4000, -5000, 1280, 800); assert.equal(o.el, O.elMin); assert.ok(Math.abs(o.az) <= Math.PI);
    o.held = false;
    const kept = [o.az, o.el];
    for (let i = 0; i < 600; i++) { L.journeyStep(k, 0.1, world, { pace: 1, night: 0, camps: false, rests: false }); L.orbitStep(o, 0.1, k, world, { turning: false }); }
    assert.deepEqual([o.az, o.el], kept, 'fixed holds for a minute of walking');
    // Turning: the same angle after a minute at 10 and at 120 frames a second; a drag takes over and it carries on from there.
    const turned = fps => { const t = L.orbitStart(0.2, 0.4, 8), jj = L.journeyStart(world, 5000); for (let i = 0; i < fps * 60; i++) L.orbitStep(t, 1 / fps, jj, world, { turning: true }); return t; };
    const slow = turned(10), fast = turned(120);
    assert.ok(Math.abs(L.wrapPi(slow.az - fast.az)) < 0.01 && Math.abs(L.wrapPi(slow.az - 0.2 - O.rate * 60)) < 0.02, `${slow.az} at 10 fps, ${fast.az} at 120`);
    assert.ok(Math.abs(slow.shown.el - fast.shown.el) < 0.01 && Math.abs(slow.shown.el - 0.4) > 0.02, 'and its height drifts');
    const t = turned(30), grab = L.orbitGrab(t, true);
    assert.ok(Math.abs(grab.el - t.el) < 1e-9 && t.sway === 0, 'a hand on it takes it as it is shown');
    L.orbitDrag(t, grab, 100, 0, 1280, 800);
    const left = t.az;
    for (let i = 0; i < 30; i++) L.orbitStep(t, 0.1, k, world, { turning: true });
    assert.equal(t.az, left, 'held, it does not turn');
    t.held = false;
    for (let i = 0; i < 30; i++) L.orbitStep(t, 0.1, k, world, { turning: true });
    assert.equal(t.az, left, 'nor for a few seconds after');
    for (let i = 0; i < 30; i++) L.orbitStep(t, 0.1, k, world, { turning: true });
    assert.ok(Math.abs(L.wrapPi(t.az - left)) > 0.05, 'then it resumes from where it was left');
    for (let i = 0; i < 100; i++) L.orbitStep(t, 0.1, k, world, { turning: true, still: true });
    assert.ok(Math.abs(L.wrapPi(t.az - left)) < 0.3, 'reduced motion: it holds');
    assert.equal(L.camera('orbit', k, world, 0, null, t), t.cam);
});

test('the company: every kind can be posed, the count is honoured, the named cats keep their coats, and the same seed is the same party', () => {
    const out = new Soup(), st = new Stack(), fx = { glows: { add() {} }, puffs: { add() {} }, lit: 1 };
    assert.ok(L.COMPANIONS.length >= 5 + 20 + 9, `${L.COMPANIONS.length} kinds`);
    assert.equal(new Set(L.COMPANIONS.map(c => c.id)).size, L.COMPANIONS.length);
    for (const c of L.COMPANIONS) {
        assert.ok(K.known(c.id) && L.GROUPS.includes(c.group) && c.top > 2 && c.label, c.id);
        if (K.KINDS[c.id]) assert.equal(K.KINDS[c.id].rest, c.rest, `${c.id} settles as the logic says`);
        const sizes = [];
        for (const pose of [{ gait: 0.3, moving: 1 }, { gait: 0, rest: 1 }, { gait: 1.2, moving: 1, alt: 3, wing: 1, bank: 0.3 }, { gait: 0.1, down: 1, alarm: 1 }, { gait: 0.7, moving: 0.5, rest: 0.5, head: 0.4 }]) {
            out.clear();
            K.pose(c.id, out, st, 1, 2, 3, { yaw: 0.4, t: 3, ...pose }, fx);
            assert.ok(out.n % 3 === 0 && (c.id === 'wisp' || out.n > 300) && out.n < 9000, `${c.id}: ${out.n} vertices`);
            for (let i = 0; i < out.n; i++) for (let k = 0; k < 3; k++) assert.ok(Math.abs(out.F[i * 6 + k]) < 12, `${c.id}: a vertex astray`);
            sizes.push(out.n);
        }
    }
    // The druid's other shapes and the roadside's animals are on the same rigs.
    for (const id of [...L.FORMS, 'sheep', 'cow', 'deer', 'rabbit', 'horse']) { out.clear(); K.pose(id, out, st, 0, 0, 0, { yaw: 0, gait: 0.4, moving: 1, t: 1 }, fx); assert.ok(out.n > 600 && out.n % 3 === 0, id); }
    // The named cats: the nine of The Cat vs. the Ornament's roster, by name and coat.
    const roster = new Function(`${readFileSync(resolve(DIR, '../cat-ornament/cat-ornament-logic.js'), 'utf8')}\nreturn CatOrnamentLogic.ROSTER;`)();
    const named = L.COMPANIONS.filter(c => c.from);
    assert.equal(named.length, roster.length);
    for (const cat of roster) {
        const mine = named.find(c => c.coat === cat.coat);
        assert.ok(mine, `no companion in a ${cat.coat} coat`);
        assert.ok(cat.names.some(name => mine.label.includes(name)), `${mine.label} is none of ${cat.names}`);
        assert.ok(mine.cat && mine.group === 'cats' && mine.from.includes('cat-ornament') && mine.from.includes('sky-island'));
        assert.ok(K.KINDS[mine.id].cat, `${mine.id} is a cat`);
    }
    // Their coats are painted on: black Moofy and white Waffles are not the same colour, and Ras has white socks.
    const tone = id => { out.clear(); K.pose(id, out, st, 0, 0, 0, { yaw: 0, gait: 0, t: 0 }, fx); let sum = 0, light = 0; for (let i = 0; i < out.n; i++) { const v = out.B[i * 24 + 16] + out.B[i * 24 + 17] + out.B[i * 24 + 18]; sum += v; light += v > 600; } return [sum / out.n / 3, light / out.n]; };
    assert.ok(tone('moofy')[0] < 80 && tone('waffles')[0] > 150 && tone('waffles')[1] < 0.9 && tone('ras')[1] > 0.04 && tone('ras')[0] < 110 && tone('butters')[0] > 150 && tone('kittytoes')[0] > 110, `${tone('moofy')}, ${tone('waffles')}, ${tone('ras')}`);
    // Who comes: the count, the pick, the choice, the seed.
    for (const pick of ['surprise', ...L.GROUPS]) for (let count = 0; count <= 6; count++) {
        const party = L.party(11, { count, pick });
        assert.equal(party.length, count, `${pick} × ${count}: ${party}`);
        assert.deepEqual(plain(party), plain(L.party(11, { count, pick })));
        for (const id of party) assert.ok(L.COMPANION[id] && (pick === 'surprise' || L.COMPANION[id].group === pick), `${id} in ${pick}`);
        assert.equal(new Set(party.filter(id => L.COMPANION[id].cat)).size, party.filter(id => L.COMPANION[id].cat).length, 'a named cat twice');
        if (pick === 'surprise' && count) assert.ok(L.COMPANION[party[0]].from, 'surprise brings one of the named cats');
        if (pick === 'surprise' && count >= 5) assert.equal(new Set(party.map(id => L.COMPANION[id].group)).size, 5, 'and one from each kind');
    }
    const seen = new Set();
    for (let seed = 1; seed < 400; seed++) for (const id of L.party(seed, { count: 6 })) seen.add(id);
    assert.equal(seen.size, L.COMPANIONS.length, 'every kind turns up, given enough worlds');
    assert.notDeepEqual(plain(L.party(11, { count: 3 })), plain(L.party(12, { count: 3 })));
    assert.deepEqual(plain(L.party(1, { pick: 'choose', choice: ['moofy', 'nobody', 'hawk', 'snail'] })), ['moofy', 'hawk', 'snail']);
    assert.equal(L.party(1, { pick: 'choose', choice: L.COMPANIONS.map(c => c.id) }).length, 6);
    assert.deepEqual(plain(L.party(1, { pick: 'choose', choice: [] })), []);
});

test('the company on the road: out of one another\'s way and the traveller\'s, on the road, round the fire at night, the same at 10 fps as at 120', () => {
    const walk = (ids, fps, secs, opts = {}) => {
        const j = L.journeyStart(world, 360 * 300 + 40), party = L.partyStart(ids), random = seeded(9), dt = 1 / fps, seen = { closest: 9, off: 0, camps: 0, rested: 0, air: 0, riding: 0, modes: new Set(), far: 0 };
        for (let i = 0; i < fps * secs; i++) {
            const t = i * dt, night = opts.night ?? (L.light(L.bodies((t / 600 + 0.3) % 1).sunEl).night);
            L.journeyStep(j, dt, world, { pace: 1, night, camps: !!opts.camps, rests: !!opts.rests, campSeconds: 30 });
            const ctx = { t, night, passing: false, others: party, scare: opts.scare ? { x: world.place(j.z + 6, 9)[0], z: j.z + 6 } : null, random };
            for (const c of party) L.companionStep(c, dt, world, j, ctx);
            const me = L.standing(j, world);
            for (const c of party) {
                assert.ok(Number.isFinite(c.x) && Number.isFinite(c.z) && Number.isFinite(c.yaw) && c.rest >= 0 && c.rest <= 1 && c.alt >= -0.01, c.id);
                seen.modes.add(c.mode);
                const away = Math.hypot(c.x - me.x, c.z - me.z), d = world.lateral(c.x, c.z), grounded = c.alt < 0.5 && c.riding < 0.5 && c.wing < 0.2;
                seen.far = Math.max(seen.far, away);
                if (c.alt > 2) seen.air++;
                if (c.riding > 0.9) seen.riding++;
                if (grounded && j.mode === 'walk' && i > fps * 5) seen.off = Math.max(seen.off, Math.abs(d));
                if (grounded && i > fps * 3) { seen.closest = Math.min(seen.closest, away); for (const o of party) if (o !== c && o.alt < 0.5 && o.riding < 0.5 && o.wing < 0.2) seen.closest = Math.min(seen.closest, Math.hypot(c.x - o.x, c.z - o.z)); }
                assert.equal(c.y, world.surface(c.x, c.z));
                assert.ok(c.y > world.water(c.x, c.z) + 0.3 || !grounded, `${c.id} in the water at ${j.z.toFixed(0)}`);
                if (j.mode === 'camp' && j.timer < 12) { seen.camps++; if (c.rest > 0.8) seen.rested++; assert.ok(Math.hypot(c.x - j.camp.x, c.z - j.camp.z) < 7.5 || c.kind.role === 'soar', `${c.id} is ${Math.hypot(c.x - j.camp.x, c.z - j.camp.z).toFixed(1)} m from the fire`); assert.ok(Math.hypot(c.x - j.camp.x, c.z - j.camp.z) > 0.6 || c.alt > 1, `${c.id} is in the fire`); }
            }
        }
        return { j, party, seen };
    };
    const six = walk(['dog', 'moofy', 'pony', 'fox', 'tortoise', 'pig'], 20, 600, { rests: true });
    assert.ok(six.seen.closest > 0.3, `two of them ${six.seen.closest.toFixed(2)} m apart`);
    assert.ok(six.seen.off < 3.3, `one of them ${six.seen.off.toFixed(1)} m off the road's middle`);
    assert.ok(six.seen.far < 20, `one of them fell ${six.seen.far.toFixed(0)} m behind`);
    for (const mode of ['wait', 'sniff']) assert.ok(six.seen.modes.has(mode), `nobody was ever at "${mode}"`);
    const spread = six.party.map(c => Math.hypot(c.x - six.party[0].x, c.z - six.party[0].z));
    assert.ok(Math.max(...spread) > 1.5, 'they do not walk in a clump');
    // Every kind walks a few minutes of day and night without falling behind or into anything.
    for (let i = 0; i < L.COMPANIONS.length; i += 4) { const ids = L.COMPANIONS.slice(i, i + 4).map(c => c.id), got = walk(ids, 15, 240, { rests: true, scare: i % 8 === 0 }); assert.ok(got.seen.closest > 0.12 && got.seen.far < 30, `${ids}: ${got.seen.closest.toFixed(2)} m apart at closest, ${got.seen.far.toFixed(0)} m away at furthest`); }
    // Fliers fly and riders ride; a butterfly gets chased.
    const air = walk(['hawk', 'raven', 'ibbie', 'harry', 'wisp', 'whelp'], 20, 300, { night: 0 });
    assert.ok(air.seen.air > 4000 && air.seen.riding > 3000 && air.seen.modes.has('dart'), `${air.seen.air} steps on the wing, ${air.seen.riding} riding`);
    assert.ok(air.party[2].riding > 0.9 && air.party[0].alt > 10 && air.party[4].alt > 1 && air.party[4].alt < 3);
    assert.ok(walk(['owl'], 20, 60, { night: 0 }).party[0].riding > 0.9 && walk(['owl'], 20, 60, { night: 1 }).party[0].alt > 2, 'the owl rides by day and flies by night');
    // By the fire: everybody near it, settled, nobody in it.
    const camp = walk(['dog', 'moofy', 'pony', 'raven', 'hen', 'lantern'], 20, 1500, { night: 1, camps: true });
    assert.ok(camp.seen.camps > 500 && camp.seen.rested > camp.seen.camps * 0.8, `${camp.seen.rested} of ${camp.seen.camps} settled by the fire`);
    // Two who would ride: one walks. A deer by the road: the dog points and the lamb hides.
    assert.deepEqual(L.partyStart(['hen', 'squirrel', 'ibbie']).map(c => c.role), ['ride', 'heel', 'heel']);
    const startled = walk(['dog', 'lamb'], 20, 2, { scare: true });
    assert.ok(startled.party[0].alarm > 0 && startled.party[1].alarm > 0 && world.lateral(startled.party[0].x, startled.party[0].z) > -0.7 && world.lateral(startled.party[1].x, startled.party[1].z) < 1.2, `the dog goes toward it and the lamb away: ${world.lateral(startled.party[0].x, startled.party[0].z)}, ${world.lateral(startled.party[1].x, startled.party[1].z)}`);
    // The same road at any frame rate.
    const a = walk(['dog', 'turkey', 'donkey'], 10, 120), b = walk(['dog', 'turkey', 'donkey'], 120, 120);
    for (let i = 0; i < 3; i++) assert.ok(Math.hypot(a.party[i].x - b.party[i].x, a.party[i].z - b.party[i].z) < 1.5, `${a.party[i].id}: ${Math.hypot(a.party[i].x - b.party[i].x, a.party[i].z - b.party[i].z).toFixed(2)} m apart at 10 and 120 fps`);
});

test('the travellers\' craft: the druid changes shape and back by the seed, never at a rest, the same at any frame rate; the rogue goes unseen past guards and strangers', () => {
    assert.deepEqual(Object.keys(A.LOOKS), ['ranger', 'wizard', 'bard', 'knight', 'barbarian', 'northman', 'druid', 'archer', 'rogue']);
    for (const [name, look] of Object.entries(A.LOOKS)) { assert.ok(A.lightAt(look).length === 3, name); if (['barbarian', 'northman', 'archer', 'rogue'].includes(name)) assert.ok(!look.cloak || look.cape !== undefined || !look.hand || look.hand !== 'crook', name); }
    assert.ok(!A.LOOKS.barbarian.cloak && !A.LOOKS.barbarian.hat && A.LOOKS.barbarian.build === 'f' && A.LOOKS.barbarian.back === 'axe' && A.LOOKS.barbarian.torch, 'the barbarian: no cloak, no hood, an axe, a brand for the dark');
    assert.ok(A.LOOKS.druid.hat === 'antlers' && A.LOOKS.druid.shifts && A.LOOKS.archer.hand === 'bow' && A.LOOKS.rogue.daggers && A.LOOKS.rogue.stealth);
    // Every traveller in every pose the walk asks for, the new ones included.
    const out = new Soup(), st = new Stack();
    for (const [name, look] of Object.entries(A.LOOKS)) for (const pose of [{ act: 'aim' }, { act: 'flip', t: 0.4 }, { crouch: 1, moving: 1, stride: 0.3 }, { sit: 1, act: 'flip' }, { lantern: true, moving: 1, stride: 0.6 }, { act: 'wave' }]) {
        out.clear();
        P.person(out, st, 0, 0, 0, look, { yaw: 1, t: 2, stride: 0, moving: 0, ...pose });
        let lo = Infinity, hi = -Infinity;
        for (let i = 0; i < out.n; i++) { for (let k = 0; k < 3; k++) assert.ok(Number.isFinite(out.F[i * 6 + k])); lo = Math.min(lo, out.F[i * 6 + 1]); hi = Math.max(hi, out.F[i * 6 + 1]); }
        assert.ok(out.n > 6000 && out.n < 16000 && lo > -0.3 && hi > 1.1 && hi < 3.4, `${name} ${JSON.stringify(pose)}: ${out.n} vertices from ${lo.toFixed(2)} to ${hi.toFixed(2)}`);
    }
    // The druid.
    const run = (fps, often, seed = 5, secs = 1500, opts = {}) => {
        const j = L.journeyStart(world, 360 * 300 + 40), s = L.shiftStart(seed), log = [], dt = 1 / fps;
        let before = s.form, resting = 0;
        for (let i = 0; i < fps * secs; i++) {
            const night = opts.night ?? 0;
            L.journeyStep(j, dt, world, { pace: 1, night: opts.camps ? (i * dt % 300 > 150 ? 1 : 0) : 0, camps: !!opts.camps, rests: !!opts.camps, campSeconds: 40 });
            const starting = s.change >= 1;
            L.shiftStep(s, dt, j, { often, night, biome: opts.biome || world.biome(j.z).near.biome });
            if (starting && s.change < 1) { assert.equal(j.mode, 'walk', 'a change began at a rest'); log.push([Math.round(i * dt), s.to]); }
            if (s.change < 1) assert.ok(s.from !== s.to && s.form === s.from);
            assert.ok(s.form === 'self' || L.FORMS.includes(s.form));
            if (s.form !== before) before = s.form;
            if (j.mode === 'camp' && s.form !== 'self') resting++;
        }
        return { log, s, resting };
    };
    const base = run(30, 'sometimes');
    assert.ok(base.log.length >= 8 && base.log.length <= 40, `${base.log.length} changes in 25 minutes: ${base.log.slice(0, 6)}`);
    for (let i = 0; i < base.log.length; i++) assert.equal(base.log[i][1] === 'self', i % 2 === 1, 'out and back, by turns');
    for (let i = 1; i < base.log.length; i += 2) { const stay = base.log[i][0] - base.log[i - 1][0]; assert.ok(stay >= 30 && stay <= 125, `${stay} s as a ${base.log[i - 1][1]}`); }
    assert.deepEqual(run(30, 'sometimes').log, base.log, 'the same seed, the same changes');
    assert.notDeepEqual(run(30, 'sometimes', 6).log, base.log);
    for (const fps of [10, 120]) { const other = run(fps, 'sometimes', 5, 600).log, mine = base.log.filter(e => e[0] < 598); assert.deepEqual(other.map(e => e[1]), mine.slice(0, other.length).map(e => e[1])); for (let i = 0; i < other.length; i++) assert.ok(Math.abs(other[i][0] - mine[i][0]) <= 2, `${fps} fps: change ${i} at ${other[i][0]} s, not ${mine[i][0]}`); }
    assert.ok(run(30, 'often').log.length > base.log.length * 1.5, 'often is oftener');
    assert.equal(run(30, 'never').log.length, 0);
    const forms = new Set(), tally = o => { const n = {}; for (let seed = 1; seed < 80; seed++) for (const [, to] of run(4, 'often', seed, 200, o).log) { n[to] = (n[to] || 0) + 1; forms.add(to); } return n; };
    const wood = tally({ biome: 'forest' }), grove = tally({ biome: 'grove' }), dark = tally({ biome: 'moor', night: 1 });
    assert.ok(wood.bear > wood.owlbeast && wood.bear > wood.panther && grove.owlbeast > grove.bear && dark.panther > dark.bear, `${JSON.stringify([wood, grove, dark])}`);
    for (const form of L.FORMS) assert.ok(forms.has(form), form);
    assert.ok(run(20, 'often', 5, 1500, { camps: true }).resting > 0, 'she may sit by the fire in another shape');
    // Asked for by hand: at once on the road, and back again; with it set to never, she stays herself otherwise.
    const j = L.journeyStart(world, 5000), s = L.shiftStart(3);
    j.speed = 1.7; s.want = true;
    L.shiftStep(s, 0.1, j, { often: 'never' });
    assert.ok(s.change < 1 && L.FORMS.includes(s.to));
    for (let i = 0; i < 40; i++) L.shiftStep(s, 0.1, j, { often: 'never' });
    assert.ok(s.change === 1 && s.form === s.to);
    j.mode = 'gaze'; s.want = true;
    L.shiftStep(s, 0.1, j, { often: 'never' });
    assert.equal(s.change, 1, 'not at a rest');
    j.mode = 'walk';
    L.shiftStep(s, 0.1, j, { often: 'never' });
    assert.ok(s.change < 1 && s.to === 'self', 'it waited for the road');
    // The cats bristle when a bear appears where she was.
    const party = L.partyStart(['moofy', 'dog']);
    L.spook(party);
    assert.ok(party[0].alarm === 1 && party[0].bristle && !party[1].alarm);
    // The rogue: unseen past a city's gate, shown again beyond; unseen while somebody passes; never at a rest; by hand.
    const city = [...Array(300).keys()].map(i => world.leg(i + 100)).find(l => l.place === 'city' && !l.grand);
    const hid = (fps, often) => { const k = L.journeyStart(world, city.zc - 104 - 60), h = L.stealthStart(2), dt = 1 / fps, out2 = []; for (let i = 0; i < fps * 95; i++) { L.journeyStep(k, dt, world, { pace: 1, night: 0, camps: false, rests: false }); L.stealthStep(h, dt, k, world, { often, night: 0, traffic: Infinity }); assert.ok(h.hidden >= 0 && h.hidden <= 1); out2.push([k.z - city.zc + 104, h.hidden]); } return out2; };
    const pass = hid(30, 'sometimes'), at = (list, d) => list.reduce((best, e) => Math.abs(e[0] - d) < Math.abs(best[0] - d) ? e : best)[1];
    assert.ok(at(pass, -50) === 0 && at(pass, -5) === 1 && at(pass, 5) === 1 && at(pass, 42) === 0, `at the gate: ${[at(pass, -50), at(pass, -5), at(pass, 5), at(pass, 42)]}`);
    assert.ok(Math.abs(at(hid(10, 'sometimes'), -27) - at(hid(120, 'sometimes'), -27)) < 0.15, 'the same fade at any frame rate');
    assert.ok(hid(30, 'never').every(e => e[1] === 0));
    const k2 = L.journeyStart(world, 5000), h2 = L.stealthStart(2);
    for (let i = 0; i < 50; i++) L.stealthStep(h2, 0.1, k2, world, { often: 'sometimes', night: 0, traffic: 15 });
    assert.equal(h2.hidden, 1, 'somebody is coming');
    k2.mode = 'gaze';
    for (let i = 0; i < 20; i++) L.stealthStep(h2, 0.1, k2, world, { often: 'sometimes', night: 0, traffic: 15 });
    assert.equal(h2.hidden, 0, 'never at a rest');
    k2.mode = 'walk'; h2.want = true;
    for (let i = 0; i < 20; i++) L.stealthStep(h2, 0.1, k2, world, { often: 'never', night: 0, traffic: Infinity });
    assert.equal(h2.hidden, 1, 'by hand');
    h2.want = true;
    for (let i = 0; i < 20; i++) L.stealthStep(h2, 0.1, k2, world, { often: 'never', night: 0, traffic: Infinity });
    assert.equal(h2.hidden, 0, 'and out again');
});

test('grand cities: rarer, level from gate to gate behind a moat, a castle on its rock, nothing on the road; carried by the far squares, lit at night', () => {
    let grand = 0, cities = 0;
    for (let i = 100; i < 700; i++) {
        const l = world.leg(i);
        cities += l.place === 'city';
        if (!l.grand) continue;
        grand++;
        assert.ok(['meadow', 'farm'].includes(l.biome) && !world.leg(i - 1).grand && !world.leg(i + 1).grand && !l.stream && !world.leg(i + 1).stream, `a grand city at ${i}`);
        if (grand > 6) continue;
        const G = L.GRAND, items = world.layout(i), of = k => items.filter(item => item.k === k), houses = of('house');
        assert.ok(of('wall').length === 42 && of('gate').length === 2 && of('drawbridge').length === 2 && of('tower').length >= 38 && of('citadel').length === 1 && of('ramp').length === 1 && of('cathedral').length === 1 && of('hall').length === 1 && of('markethall').length === 1 && of('fountain').length === 1 && of('cross').length === 1, `what it is made of: ${houses.length} houses`);
        assert.ok(houses.length >= 150 && of('stall').length >= 8 && of('folk').length >= 40 && of('lamp').length >= 30 && of('mill').length === 1 && of('hut').length >= 8, `${houses.length} houses, ${of('stall').length} stalls`);
        assert.ok(of('tower').some(t => t.square) && of('tower').some(t => !t.square) && houses.some(h => h.floors >= 4) && houses.some(h => h.guild));
        assert.ok(of('folk').filter(f => f.role === 'guard').length >= 8, 'guards at the gates, the bridges and the ramp');
        // Level from gate to gate, the moat below it and the drawbridges over the moat.
        for (let dz = -G.A - 30; dz <= G.A + 30; dz += 2) {
            const z = l.zc + dz, x = world.roadX(z);
            assert.ok(Math.abs(world.surface(x, z) - l.e) < 0.2, `the road is ${(world.surface(x, z) - l.e).toFixed(2)} m off level ${dz} m from the middle`);
            assert.ok(world.surface(x, z) > world.water(x, z) + 1.5);
        }
        for (const side of [-1, 1]) { const z = l.zc + side * (G.A + 11), [x] = world.place(z, 0), [mx] = world.place(l.zc, side * (G.B + 11)); assert.ok(world.bridge(z) !== null && world.ground(x, z) < l.moat - 1 && world.water(x, z) === l.moat, 'a moat under the drawbridge'); assert.ok(world.ground(mx, l.zc) < l.moat - 1 && world.water(mx, l.zc) === l.moat, 'and all the way round'); }
        // Everything inside the wall is inside it; the houses keep clear of the square, the rock, the cathedral and one another.
        const rock = l.rock, at = item => [world.lateral(item.x, item.z), item.z - l.zc];
        for (const h of houses) {
            const [d, dz] = at(h);
            assert.ok(L.beyondWall(d, dz) < -6, `a house ${L.beyondWall(d, dz).toFixed(1)} m from the wall`);
            assert.ok(Math.hypot(d, dz) > G.plaza + 3 && Math.hypot(d - rock.d, dz - rock.dz) > rock.r1 && Math.abs(d) - h.dp / 2 > 3.6, 'a house on the square, the rock or the road');
        }
        for (let a = 0; a < houses.length; a++) for (let b = a + 1; b < houses.length; b++) assert.ok(Math.hypot(houses[a].x - houses[b].x, houses[a].z - houses[b].z) > 3.6, 'two houses in one another');
        // The castle stands on the rock, well above the roofs; the ramp runs from the street to its gate.
        const citadel = of('citadel')[0], top = world.ground(citadel.x, citadel.z);
        assert.ok(top - l.e > rock.h - 2.5 && top - l.e < rock.h + 2.5, `the rock is ${(top - l.e).toFixed(1)} m high`);
        const [cd, cdz] = at(citadel);
        assert.ok(Math.abs(cd - rock.d) < 0.01 && Math.abs(cdz - rock.dz) < 0.01 && L.beyondWall(cd + Math.sign(cd) * rock.r1, cdz) < 0, 'the rock is inside the wall');
        const way = of('ramp')[0];
        assert.ok(Math.abs(world.lateral(way.x, way.z)) > 6 && Math.abs(Math.abs(world.lateral(way.x, way.z)) + way.len - (Math.abs(rock.d) - rock.r0)) < 0.5 && Math.abs(way.rise - rock.h) < 0.01);
        // She stops to look before the gate.
        const view = L.sight(world, l.zc - G.A - 34);
        assert.ok(view && view.long > 0 && Math.sign(view.look) === l.side, 'a view before the gate, toward the castle');
        // Squares: the middle one with the fine models within budget; the far ones carry the skyline and its lights.
        if (grand > 2) continue;
        const sq = M.square(world, Math.floor(citadel.x / 64), Math.floor(citadel.z / 64), 64, 32, false, 1, 2);
        assert.ok(sq.props.n % 3 === 0 && sq.props.n < 260000 && sq.high - sq.low > 50, `the castle's square: ${sq.props.n} vertices, ${(sq.high - sq.low).toFixed(0)} m tall`);
        let lit = 0, coursed = 0;
        for (let v = 0; v < sq.props.n; v++) { lit += sq.props.B[v * 24 + 21] > 200; coursed += (sq.props.B[v * 24 + 15] << 24 >> 24) < 0; }
        assert.ok(lit > 200 && coursed > sq.props.n * 0.3, `${lit} vertices of lit window, ${coursed} of coursed stone`);
        const far = M.square(world, Math.floor(citadel.x / 256), Math.floor(citadel.z / 256), 256, 16, true);
        assert.ok(far.beacons.length >= 4 && far.props.n > 6000 && far.props.n < 120000 && far.lights.length === 0, `far: ${far.props.n} vertices, ${far.beacons.length} lights kept`);
        let tall = -Infinity, glowing = 0;
        for (let v = 0; v < far.props.n; v++) { tall = Math.max(tall, far.props.F[v * 6 + 1]); glowing += far.props.B[v * 24 + 21] > 200; }
        assert.ok(tall - l.e > 55 && glowing > 100, `the skyline stands ${(tall - l.e).toFixed(0)} m over the road from far off, with ${glowing} vertices of lit window`);
        for (const b of far.beacons) assert.ok(Math.hypot(b[0] - world.roadX(l.zc), b[2] - l.zc) < 160 && b[1] > l.e + 2);
    }
    assert.ok(grand >= 12 && grand < cities * 0.6 && cities - grand >= 30, `${grand} grand cities of ${cities} in 600 legs`);
    assert.equal(L.world(7, { towns: 0 }).leg(111).grand, undefined);
});

test('fine models: what stands by the road near the traveller is built finer, within budget, and is the same wood and the same street', () => {
    const find = want => [...Array(300).keys()].map(i => world.leg(i + 100)).find(want);
    for (const kind of ['oak', 'apple', 'poplar', 'fir', 'pine', 'birch', 'willow', 'snag', 'glade', 'shroom']) for (let v = 0; v < 3; v++) {
        const fine = D.tree(kind, v);
        assert.ok(fine.n % 3 === 0 && fine.n > 600 && fine.n < 2400, `${kind}: ${fine.n} vertices`);
        let top = -Infinity, wide = 0;
        for (let i = 0; i < fine.n; i++) { top = Math.max(top, fine.F[i * 6 + 1]); wide = Math.max(wide, Math.hypot(fine.F[i * 6], fine.F[i * 6 + 2])); }
        assert.ok(top > 3.5 && top < 13 && wide < 5.2, `${kind}: ${top.toFixed(1)} m tall, ${wide.toFixed(1)} m wide`);
    }
    assert.ok(D.rock(0).n > 150 && D.fixed('well').n > M.fixed('well').n && D.fixed('fence') && D.fixed('lamp') === null);
    const wood = find(l => l.biome === 'forest' && !l.radius), cx = Math.floor(world.roadX(wood.zc) / 64), cz = Math.floor(wood.zc / 64);
    const plain0 = M.square(world, cx, cz, 64, 32, false, 1, 0), narrow = M.square(world, cx, cz, 64, 32, false, 1, 1), fine = M.square(world, cx, cz, 64, 32, false, 1, 2);
    assert.ok(plain0.props.n < narrow.props.n && narrow.props.n < fine.props.n && fine.props.n < 150000, `a forest square: ${plain0.props.n}, ${narrow.props.n}, ${fine.props.n} vertices`);
    assert.equal(fine.detail, 2);
    assert.deepEqual([fine.lights.length, fine.spawns.length, fine.smokes.length], [plain0.lights.length, plain0.spawns.length, plain0.smokes.length]);
    const village = find(l => l.place === 'village'), vx = Math.floor(world.roadX(village.zc) / 64), vz = Math.floor(village.zc / 64), street = M.square(world, vx, vz, 64, 32, false, 1, 2), street0 = M.square(world, vx, vz, 64, 32, false, 1, 0);
    assert.ok(street.props.n > street0.props.n * 1.05 && street.props.n < 220000, `a village square: ${street0.props.n} plain, ${street.props.n} fine`);
    // A house close to: the same house, trimmed. And a gloss on what is metal, in the colour's fourth byte.
    const near = new Soup(), usual = new Soup(), plot = { w: 8, dp: 6.5, floors: 2, roof: 1, v: 0.37, jetty: true, stoneBase: true };
    M.house(near, { ...plot, fine: true }); M.house(usual, plot);
    assert.ok(near.n > usual.n * 1.15 && near.n < usual.n * 3, `${usual.n} vertices, ${near.n} trimmed`);
    const s = new Soup();
    s.paint(M.C.gold, 0).box(0, 0, 0, 1, 1, 1).paint(M.C.stone, 0).course(true).box(0, 0, 0, 1, 1, 1).course(false).paint([255, 255, 255], 0).tube([[0, 0, 0, 1, 1], [0, 2, 0, 0.5, 1]], 8, { cap: 3, k: () => 1.4 });
    assert.ok(s.B[19] < 80 && s.B[30 * 24 + 19] === 255 && (s.B[30 * 24 + 15] << 24 >> 24) < 0 && (s.B[15] << 24 >> 24) > 0 && s.B[60 * 24 + 16] === 255, 'gloss, courses, and a colour that does not wrap');
    assert.equal(s.n, 60 + 8 * 6 + 2 * 8 * 3);
});
