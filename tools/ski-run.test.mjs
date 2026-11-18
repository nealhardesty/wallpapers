// Fresh Tracks (SPEC §10.39): the mountain's own logic, in Node, without a
// browser. The course always goes down and never breaks; the same seed is
// the same mountain; nobody skis into a tree or into anybody else; jumps
// land; the same ground is covered at any frame rate; the mesh the GPU is
// given is the ground the riders ski.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

const DIR = resolve(import.meta.dirname, '../web/wallpapers/ski-run');
const FILES = ['ski-logic.js', 'ski-models.js', 'ski-gl.js', 'ski-run.js'];
const sources = Object.fromEntries(FILES.map(name => [name, readFileSync(join(DIR, name), 'utf8')]));
const context = vm.createContext({});
vm.runInContext(readFileSync(resolve(DIR, '../../core/wp.js'), 'utf8'), context);
vm.runInContext(readFileSync(join(DIR, 'defaults.js'), 'utf8'), context);
vm.runInContext(readFileSync(join(DIR, 'settings.js'), 'utf8'), context);
for (const name of FILES) vm.runInContext(sources[name], context);
vm.runInContext(readFileSync(resolve(DIR, '../catalog.js'), 'utf8'), context);
// The logic is pure, so the tests that ski for minutes run it as a plain
// function: a vm context makes its inner loops ten times slower.
const { L, M, SkiSoup, SkiStack } = new Function(`${sources['ski-logic.js']}; ${sources['ski-models.js']}; return { L: SkiLogic, M: SkiModels, SkiSoup, SkiStack };`)();
const plain = value => JSON.parse(JSON.stringify(value));
const CFG = { speed: 1, tricks: 1, wipeouts: true, friends: 3, others: 1, wildlife: true, kinds: ['ski', 'board', 'ski', 'board'] };

test('the course: always downhill, never a break, every kind of section, and the same from the same seed', () => {
    const C = L.course(7), seen = new Set();
    let last = C.elev(0), lastC = C.centre(0), lastW = C.width(0), lastH = C.height(C.centre(0), 0), steepest = 0;
    for (let z = 0.5; z < 30000; z += 0.5) {
        const e = C.elev(z), c = C.centre(z), w = C.width(z), h = C.height(c, z);
        assert.ok(e < last, `the run climbs at ${z}`);
        assert.ok(Math.abs(c - lastC) < 0.75, `the centre jumps ${(c - lastC).toFixed(2)} m at ${z}`);
        assert.ok(Math.abs(w - lastW) < 0.9, `the width jumps at ${z}`);
        assert.ok(Math.abs(h - lastH) < 3.2, `the ground jumps ${(h - lastH).toFixed(2)} m at ${z} (${C.find(z).type})`);
        steepest = Math.max(steepest, last - e);
        last = e; lastC = c; lastW = w; lastH = h;
        seen.add(C.find(z).type);
    }
    assert.deepEqual([...seen].sort(), [...L.ORDER].sort(), 'every kind of section in 30 km');
    assert.ok(steepest < 0.3, `no grade over 60%: ${steepest * 2}`);
    assert.ok(C.elev(30000) < -4000 && C.elev(30000) > -9000, `30 km falls ${-C.elev(30000)} m`);
    // Down the middle of the piste it is downhill over any stretch of 80 m, whatever is built on it.
    for (let z = 0; z < 29000; z += 20) assert.ok(C.height(C.centre(z + 80), z + 80) < C.height(C.centre(z), z), `the piste rises over 80 m from ${z}`);
    // Across the run the ground is one surface too.
    for (let z = 100; z < 8000; z += 37) {
        let before = C.height(C.centre(z) - 300, z);
        for (let u = -299.5; u <= 300; u += 0.5) { const h = C.height(C.centre(z) + u, z); assert.ok(Math.abs(h - before) < 3.2, `a step of ${(h - before).toFixed(2)} m across the run at ${z}, ${u} (${C.find(z).type})`); before = h; }
    }
    const again = L.course(7), other = L.course(8);
    for (const z of [10, 950, 4321, 20000]) {
        assert.equal(again.height(again.centre(z) + 12, z), C.height(C.centre(z) + 12, z));
        assert.equal(again.find(z).type, C.find(z).type);
    }
    assert.notEqual(other.height(30, 4321), C.height(30, 4321));
    assert.equal(plain(C.trees(40).data).length, plain(again.trees(40).data).length);
});

test('the course: no two sections alike in a row, lifts cross the run clear of the piste, and settings shape it', () => {
    const C = L.course(11);
    C.find(40000);
    for (let i = 1; i < C.sections.length; i++) {
        const a = C.sections[i - 1], b = C.sections[i];
        assert.notEqual(a.type, b.type);
        assert.ok(!(a.T.single && b.T.single), 'two narrow sections in a row');
        assert.equal(b.z0, a.z1);
        assert.ok(Math.abs(b.E0 - a.E1) < 1e-9 && Math.abs(b.C0 - a.C1) < 1e-9);
    }
    assert.ok(C.lifts.length > 8, `${C.lifts.length} lifts in 40 km`);
    for (const lift of C.lifts) {
        assert.ok(lift.towers.length >= 3);
        for (const t of lift.towers) assert.ok(Math.abs(t.x - C.centre(t.z)) > C.width(t.z) + 4, 'a tower on the piste');
        // Its ends are well off in the trees; no tree stands under its cable.
        const first = lift.towers[0];
        assert.ok(Math.abs(first.x - C.centre(first.z)) > C.width(first.z) + 20);
        assert.ok(C.room(lift.x((lift.za + lift.zb) / 2), (lift.za + lift.zb) / 2) < 2.6);
    }
    const only = L.course(11, { sections: ['powder', 'glade', 'nonsense'] });
    only.find(20000);
    assert.deepEqual([...new Set(only.sections.map(s => s.type))].sort(), ['glade', 'powder']);
    const steep = L.course(11, { steep: 1.4 }), gentle = L.course(11, { steep: 0.7 });
    assert.ok(steep.elev(10000) < gentle.elev(10000) * 1.7, `${steep.elev(10000)} against ${gentle.elev(10000)}`);
    // An endless run forgets what is far behind it.
    C.trim(39000);
    assert.ok(C.sections.length < 30 && C.sections[0].z1 > 36000);
    assert.ok(Number.isFinite(C.height(C.centre(39500), 39500)));
});

test('far from the origin it is the same mountain, to the millimetre', () => {
    const near = L.course(23), far = L.course(23, { z: 3e9, x: -2e9 });
    for (let z = 5; z < 6000; z += 61.3) {
        for (const u of [-200, -31.5, 0, 7.25, 44, 310]) {
            const a = near.height(near.centre(z) + u, z), b = far.height(far.centre(3e9 + z) + u, 3e9 + z);
            assert.equal(near.find(z).type, far.find(3e9 + z).type);
            // The shape is the same (only the noise is read somewhere else), and as fine-grained out there as at home.
            assert.ok(Number.isFinite(b) && Math.abs(far.elev(3e9 + z) - b) < 260 && Math.abs(near.elev(z) - a) < 260, `at ${z}`);
            assert.ok(Math.abs(far.height(far.centre(3e9 + z) + u + 0.01, 3e9 + z + 0.01) - b) < 0.1, `a step in the ground out at ${z}`);
        }
        assert.ok(Math.abs(near.elev(z) - far.elev(3e9 + z)) < 1e-4 && Math.abs(near.width(z) - far.width(3e9 + z)) < 1e-6);
    }
    // Riders out there ski as they do at home.
    const W = L.world(23, CFG, { z: 3e9, x: -2e9 });
    for (let i = 0; i < 60 * 60; i++) { L.worldStep(W, 1 / 60, null); W.events.length = 0; }
    const r = W.riders[0];
    assert.ok(r.z - 3e9 > 500 && r.z - 3e9 < 1100, `a minute's skiing: ${r.z - 3e9} m`);
    assert.ok(Math.abs(r.y - W.course.height(r.x, r.z)) < 12);
});

test('trees: thick by the piste, none on it, none in a lane, none under a lift; small beside the runs', () => {
    const C = L.course(7);
    let total = 0, close = 0;
    const kinds = new Set();
    for (let k = 2; k < 400; k++) {
        const t = C.trees(k);
        total += t.n;
        for (let j = 0; j < t.n; j++) {
            const x = t.x + t.data[j * 8], z = t.z + t.data[j * 8 + 2], tall = t.data[j * 8 + 3], kind = t.data[j * 8 + 5], gap = C.room(x, z);
            kinds.add(kind);
            assert.ok(gap >= 2.6, `a tree ${gap.toFixed(2)} m from where riders go, in ${C.find(z).type}`);
            assert.ok(Math.abs(t.y + t.data[j * 8 + 1] - C.height(x, z)) < 0.01, 'a tree off the ground');
            // Its boughs (a fifth of its height or so, for a spruce) stop short of the gap it stands in.
            if (kind < 2) assert.ok(tall * (kind ? 0.37 : 0.27) < gap, `a ${tall.toFixed(1)} m tree ${gap.toFixed(1)} m from a line`);
            if (gap < 20) close++;
        }
    }
    assert.ok(total / 398 > 120 && total / 398 < 420, `${(total / 398).toFixed(0)} trees a chunk`);
    assert.ok(close > total * 0.1);
    assert.deepEqual([...kinds].sort(), [0, 1, 2, 3, 4, 5]);
});

// Twenty minutes down a mountain, watching everything.
function ski(seed, minutes, cfg = CFG, hz = 60, each = null, land = {}) {
    const W = L.world(seed, cfg, land), C = W.course, stats = { tricks: new Set(), wipes: 0, lands: 0, minPair: 9, minAfoot: 9, minTree: 9, under: 0, off: 0, types: new Set(), maxLift: 0, flown: 0 };
    const cache = new Map();
    const treesOf = k => { let t = cache.get(k); if (!t) { t = C.trees(k); cache.set(k, t); if (cache.size > 30) cache.delete(cache.keys().next().value); } return t; };
    for (let i = 0; i < minutes * 60 * hz; i++) {
        L.worldAdvance(W, 1000 / hz, null);
        for (const e of W.events) { if (e.type === 'trick') stats.tricks.add(e.name); if (e.type === 'wipe') stats.wipes++; if (e.type === 'land') stats.lands++; }
        W.events.length = 0;
        const all = W.riders.concat(W.others, W.school ? [W.school.lead, ...W.school.kids] : []);
        for (let a = 0; a < all.length; a++) {
            const r = all[a];
            if (r.y < C.height(r.x, r.z) - 0.02) stats.under++;
            stats.maxLift = Math.max(stats.maxLift, r.lift || 0);
            for (let b = a + 1; b < all.length; b++) {
                const o = all[b];
                if ((r.role === 'kid' || r.role === 'school') && (o.role === 'kid' || o.role === 'school')) continue;
                // On foot at a lodge they walk and sit closer than they ski.
                if (r.afoot && o.afoot) stats.minAfoot = Math.min(stats.minAfoot, Math.hypot(r.x - o.x, r.z - o.z, r.y - o.y));
                else stats.minPair = Math.min(stats.minPair, Math.hypot(r.x - o.x, r.z - o.z, r.y - o.y));
            }
            if (a >= W.riders.length) continue;
            const k = Math.floor(r.z / L.CHUNK), s = C.find(r.z);
            for (const kk of [k - 1, k, k + 1]) {
                const t = treesOf(kk);
                for (let j = 0; j < t.n; j++) if (r.y - (t.y + t.data[j * 8 + 1]) < t.data[j * 8 + 3]) stats.minTree = Math.min(stats.minTree, Math.hypot(t.x + t.data[j * 8] - r.x, t.z + t.data[j * 8 + 2] - r.z) - t.data[j * 8 + 7]);
            }
            // On the piste, or on a lane through the trees (or up a gully's wall, or a pipe's).
            if (Math.abs(r.u) > C.width(r.z) + 0.3 && !r.lane && !s.T.single && !r.afoot) stats.off++;
            if (a === 0) stats.types.add(s.type);
            if (r.air && r.lift > 1) stats.flown++;
        }
        if (each) each(W, i);
    }
    return { W, stats };
}

test('riders: twenty minutes on three mountains, never under the snow, off the piste, into a tree or into each other', () => {
    for (const seed of [7, 11, 23]) {
        const { W, stats } = ski(seed, 20);
        assert.equal(stats.under, 0, `seed ${seed}: under the snow`);
        assert.equal(stats.off, 0, `seed ${seed}: off the piste`);
        assert.ok(stats.minTree > 0.2, `seed ${seed}: ${stats.minTree.toFixed(2)} m from a trunk`);
        assert.ok(stats.minPair > 0.9, `seed ${seed}: two riders ${stats.minPair.toFixed(2)} m apart`);
        assert.equal(W.ghosts, 0, `seed ${seed}: somebody got stuck`);
        const lead = W.riders[0];
        assert.ok(lead.z > 20 * 60 * 9 && lead.z < 20 * 60 * 15, `seed ${seed}: ${(lead.z / 1200).toFixed(1)} m/s on average`);
        // The friends are still with the lead.
        for (const r of W.riders) assert.ok(Math.abs(r.z - lead.z) < 160, `seed ${seed}: a friend ${(r.z - lead.z).toFixed(0)} m away`);
        assert.ok(stats.types.size >= 9, `seed ${seed}: only ${[...stats.types]}`);
        assert.ok(stats.tricks.size >= 6, `seed ${seed}: tricks ${[...stats.tricks]}`);
        assert.ok(stats.wipes >= 1 && stats.wipes <= 40, `seed ${seed}: ${stats.wipes} wipeouts`);
        assert.ok(stats.maxLift > 3 && stats.maxLift < 16, `seed ${seed}: the biggest air ${stats.maxLift.toFixed(1)} m`);
        assert.ok(stats.flown > 600, `seed ${seed}: ${stats.flown} steps in the air`);
    }
});

test('jumps land, tricks finish, and a wipeout ends with the rider up and skiing', () => {
    const W = L.world(31, CFG), r = W.riders[0];
    let airs = 0, longest = 0, since = 0, falls = 0, down = 0, got = false;
    for (let i = 0; i < 12 * 3600; i++) {
        L.worldStep(W, 1 / 60, null);
        W.events.length = 0;
        if (r.air) { since++; longest = Math.max(longest, since); } else {
            if (since > 20) {
                airs++;
                assert.ok(Math.abs(r.spin[0]) + Math.abs(r.spin[1]) + Math.abs(r.grab) + Math.abs(r.spread) < 1e-9, 'a trick still going on the ground');
            }
            since = 0;
        }
        if (r.fall) { down++; got = true; } else { if (got) falls++; got = false; }
        if (r.air && r.trick) assert.ok(r.trick.T >= 0.4 && r.trick.T < 4);
    }
    assert.ok(airs > 12, `${airs} airs in 12 minutes`);
    assert.ok(longest < 60 * 3, `in the air for ${(longest / 60).toFixed(1)} s`);
    assert.ok(down < 0.25 * 12 * 3600, 'on the ground most of the time');
    // Sent, and sent badly.
    // (Nor a moment before a lane through the trees, where the crouch would be called off.)
    const calm = () => { for (let i = 0; i < 4800 && (r.air || r.fall || r.afoot || r.lane || L.line(W, r, r.z + 15).lane || W.course.find(r.z).T.single || W.course.find(r.z + 15).T.single || r.v < 6); i++) L.worldStep(W, 1 / 60, null); };
    calm();
    assert.equal(L.sendIt(W, false), true);
    // Down first, then up: a crouch of a fifth of a second, and no more spring than legs have.
    let crouch = 0;
    for (let i = 0; i < 30 && !r.air; i++) { L.worldStep(W, 1 / 60, null); crouch = Math.max(crouch, r.load); }
    const under = (W.course.height(r.x + r.vx / 60, r.z + r.vz / 60) - W.course.height(r.x, r.z)) * 60;
    assert.ok(r.air && crouch > 0.5 && r.airT < 0.05, 'sent');
    // (The spring is 4 m/s; what is measured here is against the snow a step further on, and how long it is up for goes by the
    // snow where it happened to be sent: 0.8 s off the flat, less where the ground comes up ahead, more where it falls away.)
    assert.ok(r.vy - under > 3 && r.vy - under < 5 && r.T > 0.5 && r.T < 1.2, `sent ${(r.vy - under).toFixed(1)} m/s off the snow, for ${r.T.toFixed(2)} s`);
    for (let i = 0; i < 400 && r.air; i++) L.worldStep(W, 1 / 60, null);
    assert.ok(!r.air && !r.fall, 'landed it');
    calm();
    assert.equal(L.sendIt(W, true), true);
    for (let i = 0; i < 400 && !r.fall; i++) L.worldStep(W, 1 / 60, null);
    assert.ok(r.fall && r.fall.phase === 'tumble', 'came down in a heap');
    const phases = new Set();
    for (let i = 0; i < 900 && r.fall; i++) { phases.add(r.fall.phase); L.worldStep(W, 1 / 60, null); }
    assert.deepEqual([...phases], ['tumble', 'lie', 'sit', 'shake', 'rise']);
    for (let i = 0; i < 300; i++) L.worldStep(W, 1 / 60, null);
    assert.ok(!r.fall && r.v > 5, `up and away at ${r.v.toFixed(1)} m/s`);
    // With wipeouts off, nobody falls; with tricks off, nobody tries one (and they still leave the ground).
    const tame = ski(31, 10, { ...CFG, wipeouts: false, tricks: 0 });
    assert.equal(tame.stats.wipes, 0);
    assert.equal(tame.stats.tricks.size, 0);
    assert.ok(tame.stats.flown > 100);
});

test('the hill moves them: slower across a turn and over flat ice, no harder on the brakes than edges hold, spun from the lip, slow at a pipe\'s lip', () => {
    // On groomed pistes: down the mountain fastest at a turn's apex (in the fall line), slowest coming across it.
    {
        const W = L.world(3, { ...CFG, others: 0, wildlife: false, wipeouts: false, tricks: 0 }, { sections: ['groomer', 'rollers'] }), r = W.riders[0];
        const apex = [0, 0], across = [0, 0];
        let hardest = 0, was = r.v, calm = 0;
        for (let i = 0; i < 6 * 3600; i++) {
            L.worldStep(W, 1 / 60, null);
            W.events.length = 0;
            const on = !r.air && !r.fall && !r.lane;
            if (on && r.a > 2.5 && W.course.find(r.z).type === 'groomer') {
                const sin = Math.abs(Math.sin(r.phase));
                if (sin > 0.95) { apex[0] += r.vz; apex[1]++; } else if (sin < 0.3) { across[0] += r.vz; across[1]++; }
            }
            // Two steps on the snow together, and not the step somebody was in the way: no more braking than an edge holds.
            calm = on ? calm + 1 : 0;
            if (calm > 2 && r.v > 1) hardest = Math.max(hardest, (was - r.v) * 60);
            was = r.v;
        }
        assert.ok(apex[1] > 500 && across[1] > 500, `${apex[1]} steps at an apex, ${across[1]} across`);
        assert.ok(apex[0] / apex[1] > 1.05 * across[0] / across[1], `down the hill at ${(apex[0] / apex[1]).toFixed(1)} m/s at the apex, ${(across[0] / across[1]).toFixed(1)} across`);
        assert.ok(hardest < L.GRIP * 1.05, `braked at ${hardest.toFixed(1)} m/s²`);
    }
    // Flat ice gives nothing back: across a lake they lose speed, and skate rather than stop.
    {
        const W = L.world(5, { ...CFG, others: 0, wildlife: false, wipeouts: false }, { sections: ['powder', 'lake'] }), r = W.riders[0];
        const into = [], out = [];
        let slowest = 99;
        for (let i = 0; i < 6 * 3600; i++) {
            L.worldStep(W, 1 / 60, null);
            W.events.length = 0;
            const s = W.course.find(r.z), t = (r.z - s.z0) / s.len;
            if (s.type !== 'lake' || r.fall) continue;
            if (t > 0.2 && t < 0.25) into.push(r.v);
            if (t > 0.9 && t < 0.95) out.push(r.v);
            slowest = Math.min(slowest, r.v);
        }
        const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
        assert.ok(into.length > 50 && out.length > 50);
        assert.ok(mean(out) < mean(into) - 1, `on to the lake at ${mean(into).toFixed(1)} m/s, off it at ${mean(out).toFixed(1)}`);
        assert.ok(slowest > 4, `down to ${slowest.toFixed(1)} m/s on the lake`);
    }
    // A spin is going from the lip, at much the rate it will keep, and is round before the snow comes up.
    {
        const W = L.world(31, { ...CFG, wipeouts: false, tricks: 2 }, { sections: ['park', 'groomer'] }), r = W.riders[0];
        let spins = 0;
        for (let i = 0; i < 10 * 3600; i++) {
            L.worldStep(W, 1 / 60, null);
            W.events.length = 0;
            const k = r.trick;
            if (!r.air || !k || !k.yaw) continue;
            const p = r.airT / k.T, turned = Math.abs(r.spin[0]) / (L.TAU * k.yaw);
            if (p > 0.2 && p < 0.25) { spins++; assert.ok(turned > 0.12 && turned < 0.3, `${(turned * 100).toFixed(0)}% round a ${k.name} a fifth of the way through the air`); }
            if (p > 0.93 && p < 1) assert.ok(turned > 0.999, `a ${k.name} still turning at the landing`);
        }
        assert.ok(spins >= 15, `${spins} steps of spin seen`);
    }
    // In the pipe, speed is the wall's to take: quick across the flat, slow at the lip, and off it no higher than that allows.
    {
        const W = L.world(2, { ...CFG, others: 0, wildlife: false, wipeouts: false }, { sections: ['groomer', 'pipe'] }), r = W.riders[0];
        const flat = [0, 0], lip = [0, 0];
        let highest = 0;
        for (let i = 0; i < 6 * 3600; i++) {
            L.worldStep(W, 1 / 60, null);
            W.events.length = 0;
            const s = W.course.find(r.z);
            if (s.type !== 'pipe' || !r.pipe) continue;
            if (r.air) { highest = Math.max(highest, r.lift); continue; }
            if (Math.abs(r.u) < 2) { flat[0] += Math.abs(r.vu); flat[1]++; } else if (Math.abs(r.u) > s.W - 1.2) { lip[0] += Math.abs(r.vu); lip[1]++; }
        }
        assert.ok(flat[1] > 100 && lip[1] > 100, `${flat[1]} steps on the flat, ${lip[1]} by the lip`);
        assert.ok(flat[0] / flat[1] > 1.6 * lip[0] / lip[1], `across the flat at ${(flat[0] / flat[1]).toFixed(1)} m/s, by the lip at ${(lip[0] / lip[1]).toFixed(1)}`);
        assert.ok(highest > 2 && highest < L.PIPE.wall + 2.4, `${highest.toFixed(1)} m over the pipe's floor`);
    }
});

test('they lean on what their edges carry: more after the fall line than before it, with the turn and not after it, and never in a flicker', () => {
    // A groomer and nothing else, one skier, half a minute: the force across the skis worked out here from where the rider went.
    const W = L.world(7, { ...CFG, tricks: 0, wipeouts: false, friends: 0, others: 0, wildlife: false, kinds: ['ski'] }, { sections: ['groomer'] }), C = W.course, r = W.riders[0], rows = [];
    let x0 = r.x, z0 = r.z, psi0 = null, last = 0, jerk = 0;
    for (let i = 0; i < 30 * 60; i++) {
        L.worldStep(W, 1 / 60, null);
        W.events.length = 0;
        const vx = (r.x - x0) * 60, vz = (r.z - z0) * 60, psi = Math.atan2(vx, vz), dC = C.slope(r.z), grade = (C.elev(r.z - 0.5) - C.elev(r.z + 0.5)) / Math.hypot(1, dC), ca = 1 / Math.hypot(1, grade);
        if (i >= 600) {
            // (Twenty seconds, once it is into its swing.)
            const h = psi - Math.atan(dC), fR = Math.hypot(vx, vz) * (psi - psi0) * 60 + L.G * grade * ca * Math.sin(h);
            rows.push({ tilt: r.tilt, want: Math.atan2(fR, L.G * ca), turn: Math.atan2(fR - L.G * grade * ca * Math.sin(h), L.G * ca), h, fR });
            assert.ok(Math.abs(r.press - Math.hypot(Math.tan(r.tilt), 1) * ca) < 1e-3 && r.press > 0.9 && r.press < 1.6, `a load of ${r.press.toFixed(2)} g`);
            jerk = Math.max(jerk, Math.abs(r.tilt - last));
            assert.ok(!r.air && !r.fall && C.find(r.z).type === 'groomer');
            assert.ok(Math.abs(r.lean - L.clamp(Math.tan(r.tilt) * L.G * ca / 8.5, -1, 1)) < 1e-3, 'lean and tilt are one force');
        }
        x0 = r.x; z0 = r.z; psi0 = psi; last = r.tilt;
    }
    assert.ok(jerk < 0.06, `the tilt moved ${jerk.toFixed(3)} rad in one step`);
    // Each turn in two halves at the fall line: before it the hill helps the turn, after it the edges hold the hill as well.
    const early = rows.filter(q => Math.abs(q.want) > 0.05 && q.h * q.fR < 0), late = rows.filter(q => Math.abs(q.want) > 0.05 && q.h * q.fR > 0), mean = list => list.reduce((sum, q) => sum + Math.abs(q.tilt), 0) / list.length;
    // (And against what the turning alone would ask: less than that before the fall line, more after it.)
    const hill = list => list.reduce((sum, q) => sum + Math.abs(q.tilt) - Math.abs(q.turn), 0) / list.length;
    // (By a hundredth of a radian over these few turns, now that no two are alike: a swing that is growing from one turn to the
    // next adds to the half after the fall line and one that is shrinking to the half before it. Over a minute it is 0.035 to 0.07.)
    assert.ok(early.length > 300 && late.length > 300 && mean(late) > mean(early) + 0.01, `tilt before the fall line ${mean(early).toFixed(3)} rad, after it ${mean(late).toFixed(3)}`);
    assert.ok(hill(early) < -0.02 && hill(late) > hill(early) + 0.05, `the hill takes ${hill(early).toFixed(3)} rad off the tilt before the fall line and adds ${hill(late).toFixed(3)} after it`);
    // At the fall line itself, the tilt is what balances the force there: to a few hundredths in a turn of its own, and
    // a moment behind only where the line itself was moving across (which nobody can know beforehand).
    const apex = [];
    for (let i = 1; i < rows.length; i++) if (rows[i].h * rows[i - 1].h <= 0) apex.push(Math.abs(rows[i].tilt / rows[i].want - 1));
    apex.sort((p, q) => p - q);
    assert.ok(apex.length >= 8 && apex[apex.length >> 1] < 0.05 && apex[Math.floor(apex.length * 0.8)] < 0.15 && apex[apex.length - 1] < 0.3, `at ${apex.length} fall lines the tilt is off what balances the force by ${apex.map(e => e.toFixed(2))}`);
    // With the force, not after it: the two line up best within three steps of each other, over all those turns.
    let best = -Infinity, lag = 0;
    for (let k = -18; k <= 18; k++) { let sum = 0; for (let i = 20; i < rows.length - 20; i++) sum += rows[i + k].tilt * rows[i].want; if (sum > best) { best = sum; lag = k; } }
    assert.ok(Math.abs(lag) <= 3, `the tilt comes ${(lag / 60).toFixed(3)} s after the force`);
    // Down in the snow nobody is leaning into anything.
    L.tumble(W, r);
    for (let i = 0; i < 90; i++) L.worldStep(W, 1 / 60, null);
    assert.ok(r.fall && Math.abs(r.tilt) < 0.01 && Math.abs(r.lean) < 0.01, `fallen, and tilted ${r.tilt.toFixed(3)} rad`);
});

// ---- Skis off their path, the body over them, poles (the riders' realism, phase 2) ----------------------------------
const DEG = 180 / Math.PI, turned = a => a - L.TAU * Math.round(a / L.TAU);
const QUIET = { ...CFG, tricks: 0, wipeouts: false, friends: 0, others: 0, wildlife: false, kinds: ['ski'] };
const centile = (list, p) => [...list].sort((a, b) => a - b)[Math.min(list.length - 1, Math.floor(p * list.length))];
const spread = list => { const m = list.reduce((x, y) => x + y, 0) / list.length; return Math.sqrt(list.reduce((x, y) => x + (y - m) ** 2, 0) / list.length); };

test('skis are steered: a few degrees off their path in a turn and more where speed is checked, tails out, never in a flicker; none in the air or the pipe', () => {
    // A minute of groomer for the lead, once it is into its swing.
    const W = L.world(7, QUIET, { sections: ['groomer'] }), C = W.course, r = W.riders[0], all = [], early = [], late = [];
    let was = 0, jump = 0, turning = 0, same = 0;
    for (let i = 0; i < 70 * 60; i++) {
        L.worldStep(W, 1 / 60, null);
        W.events.length = 0;
        // (Not the odd moment off a bump, nor the way through the trees.)
        if (i >= 600 && !r.air && !r.lane) {
            const a = Math.abs(r.skid) * DEG;
            all.push(a);
            jump = Math.max(jump, Math.abs(r.skid - was));
            if (Math.abs(r.tilt) > 0.2) { turning++; if (r.skid * r.tilt > 0) same++; }
            // (After the fall line: heading the way it is turning.)
            (Math.sin(r.psi - Math.atan(C.slope(r.z))) * r.force > 0 ? late : early).push(a);
            assert.ok(!r.fall);
        }
        was = r.skid;
    }
    const mid = centile(all, 0.5), high = centile(all, 0.9), top = centile(all, 1);
    assert.ok(mid > 3 && mid < 8 && high > 8 && high < 20 && top < 25, `the lead's skis are ${mid.toFixed(1)}° off their path at the median, ${high.toFixed(1)}° at the 90th centile, ${top.toFixed(1)}° at most`);
    assert.ok(centile(early, 0.5) < 4 && centile(late, 0.5) > centile(early, 0.5) + 2 && centile(late, 0.9) > 8 && centile(late, 0.9) < 20, `before the fall line ${centile(early, 0.5).toFixed(1)}° at the median, after it ${centile(late, 0.5).toFixed(1)}° (${centile(late, 0.9).toFixed(1)}° at the 90th centile)`);
    assert.ok(turning > 1500 && same / turning > 0.9, `tails out on ${(100 * same / turning).toFixed(1)}% of ${turning} steps in a turn`);
    assert.ok(jump * DEG < 2.2, `the skis swung ${(jump * DEG).toFixed(2)}° in one step`);
    // Each rider steers by its own amount: the friends ski well, strangers less so. And it is real speed control: no skid without scrub or a turn.
    {
        const W = L.world(7, { ...CFG, others: 2 }, { sections: ['groomer'] }), seen = new Map();
        for (let i = 0; i < 180 * 60; i++) {
            L.worldStep(W, 1 / 60, null);
            W.events.length = 0;
            for (const o of W.others) if (!o.parked && !o.air && !o.stopSide && o.v > 5) { let a = seen.get(o.id); if (!a) seen.set(o.id, a = []); a.push(Math.abs(o.skid) * DEG); }
            for (const o of W.riders.concat(W.others)) {
                assert.ok(o.steer >= (o.role === 'stranger' ? 8 : 4) / DEG - 1e-9 && o.steer <= (o.role === 'stranger' ? 20 : 8) / DEG + 1e-9, `a ${o.role} steers by ${(o.steer * DEG).toFixed(1)}°`);
                assert.ok(o.across >= 70 / DEG - 1e-9 && o.across <= 84 / DEG + 1e-9);
            }
            if (W.school) for (const kid of W.school.kids) assert.equal(kid.skid, 0, 'a child in a plough has its skis off their path');
        }
        const long = [...seen.values()].filter(a => a.length > 600), mids = long.map(a => centile(a, 0.5));
        assert.ok(long.length >= 5 && Math.min(...mids) > 5 && Math.max(...mids) < 16 && long.every(a => centile(a, 0.9) < 26), `${long.length} strangers' skis are ${mids.map(v => v.toFixed(1))}° off their path at the median`);
    }
    // In the air, on a rail and in the pipe there is no edge to steer with: it is gone within a third of a second, and stays gone. Nor much in a tuck.
    for (const sections of [['groomer', 'park'], ['groomer', 'pipe'], ['cattrack']]) {
        const W = L.world(7, { ...CFG, wipeouts: false, others: 0, wildlife: false, kinds: ['ski', 'ski', 'ski', 'ski'] }, { sections }), n = { air: 0, pipe: 0, rail: 0, tuck: 0 };
        const since = W.riders.map(() => 0);
        for (let i = 0; i < 300 * 60; i++) {
            L.worldStep(W, 1 / 60, null);
            W.events.length = 0;
            W.riders.forEach((r, j) => {
                const off = r.air || r.pipe || r.rail;
                since[j] = off ? since[j] + 1 : 0;
                if (since[j] > 20) { assert.equal(r.skid, 0, `skis ${(r.skid * DEG).toFixed(1)}° off their path ${r.air ? 'in the air' : r.pipe ? 'in the pipe' : 'on a rail'}`); n[r.air ? 'air' : r.pipe ? 'pipe' : 'rail']++; }
                if (r.tuck > 0.95 && !off && !r.stopSide) { assert.ok(Math.abs(r.skid) * DEG < 3, `skis ${(r.skid * DEG).toFixed(1)}° off their path in a tuck`); n.tuck++; }
            });
        }
        assert.ok(sections[1] === 'park' ? n.air + n.rail > 500 : sections[1] === 'pipe' ? n.pipe > 2000 : n.tuck > 5000, `${sections}: ${JSON.stringify(n)}`);
    }
});

test('a stop is a hockey stop: the skis come across the hill as the speed goes, stay there while they stand, and come round again as they set off', () => {
    // The skis' angle is kept from the fall line (`hill` below, towards the side they stop to), not from the travel: at a walking
    // pace the travel wanders (a line still closing, a few steps across to a place), and the skis over the snow must not.
    for (const kind of ['hut', 'lodge']) {
        for (const seed of [7, 3]) {
            const W = L.world(seed, { ...QUIET, friends: 3, kinds: ['ski', 'ski', 'ski', 'ski'] }, { sections: ['groomer', kind] }), C = W.course, seen = W.riders.map(() => null);
            let done = 0;
            for (let i = 0; i < 200 * 60 && done < 4; i++) {
                const was = W.riders.map(r => ({ side: r.stopSide, yaw: r.heading + r.skid, face: r.face }));
                L.worldStep(W, 1 / 60, null);
                W.events.length = 0;
                W.riders.forEach((r, j) => {
                    let s = seen[j];
                    if (!s && r.stopSide && !was[j].side) {
                        s = seen[j] = { max: -9, dip: 0, slow: null, stood: null, last: 0, go: null, back: null, apart: 0, done: false };
                        assert.ok(Math.abs(r.skid) * DEG < 20 && r.v > 9, `${kind}: the stop begins at ${r.v.toFixed(1)} m/s with the skis ${(r.skid * DEG).toFixed(0)}° off their path`);
                    }
                    if (!s || s.done) return;
                    if (r.afoot) { s.stood ??= s.last; s.done = true; done++; return; }
                    const hill = turned(r.heading + r.skid - Math.atan(C.slope(r.z))) * r.stopSide * DEG;
                    assert.ok(Math.abs(turned(r.heading + r.skid - was[j].yaw)) * DEG < 4, `${kind}: the skis swung ${(turned(r.heading + r.skid - was[j].yaw) * DEG).toFixed(1)}° over the snow in one step`);
                    assert.ok(Math.abs(turned(r.face - was[j].face)) * DEG < 4, `${kind}: the chest swung ${(turned(r.face - was[j].face) * DEG).toFixed(1)}° in one step`);
                    s.last = hill;
                    if (s.stood === null) {
                        // Once it is slowing in earnest the angle only grows.
                        if (r.v < 8) { s.max = Math.max(s.max, hill); s.dip = Math.max(s.dip, s.max - hill); }
                        if (s.slow === null && r.v < 2) s.slow = hill;
                        // (The chest stays nearer the fall line than the skis while they are still sliding.)
                        if (r.v > 1 && r.v < 4) s.apart = Math.max(s.apart, hill - turned(r.face - Math.atan(C.slope(r.z))) * r.stopSide * DEG);
                        if (r.v === 0) s.stood = hill;
                    } else if (s.go === null) {
                        assert.ok(hill > 60, `${kind}: stood with the skis ${hill.toFixed(0)}° from the fall line`);
                        if (r.v > 0.3) s.go = i;
                    } else if (Math.abs(r.skid) * DEG < 10) { s.back = (i - s.go) / 60; s.done = true; done++; }
                });
            }
            assert.equal(done, 4, `${kind}, seed ${seed}: ${done} of four pulled up and went on`);
            for (const s of seen) {
                assert.ok(s.slow > 60 && s.slow < 90 && s.stood > 60 && s.stood < 90, `${kind}: the skis ${s.slow.toFixed(0)}° from the fall line under 2 m/s, ${s.stood.toFixed(0)}° stood`);
                assert.ok(s.dip < (kind === 'hut' ? 16 : 20), `${kind}: the skis came back ${s.dip.toFixed(1)}° on the way across`);
                assert.ok(s.apart > 30, `${kind}: the chest ${s.apart.toFixed(0)}° nearer the fall line than the skis`);
                if (kind === 'hut') assert.ok(s.back !== null && s.back < 2, `after the rest the skis took ${s.back} s to come round`);
            }
        }
    }
});

test('the body over the skis: the chest keeps to the fall line in short turns and follows in long ones, less than the skis turn; the eyes go first', () => {
    const ride = (sections, minutes, keep) => {
        const W = L.world(7, QUIET, { sections }), C = W.course, r = W.riders[0], chest = [], skis = [], lead = [];
        let swing = 0, was = r.face;
        for (let i = 0; i < minutes * 3600; i++) {
            L.worldStep(W, 1 / 60, null);
            W.events.length = 0;
            if (i >= 600 && keep(r)) {
                const fl = Math.atan(C.slope(r.z));
                chest.push(turned(r.face - fl)); skis.push(turned(r.heading + r.skid - fl));
                // Which way the eyes are from the chest, against which way the turn is taking them.
                if (Math.abs(r.tilt) > 0.15) lead.push(turned(r.gaze - r.face) * Math.sign(r.tilt));
                swing = Math.max(swing, Math.abs(turned(r.face - was)));
                assert.ok(Math.abs(turned(r.gaze - r.face)) <= 0.8 + 1e-9 && Math.abs(turned(r.face - r.heading - r.skid)) <= 1 + 1e-9, 'a neck or a waist turned further than they go');
            }
            was = r.face;
        }
        return { ratio: spread(chest) / spread(skis), n: chest.length, skis: spread(skis) * DEG, swing: swing * DEG, lead: lead.filter(v => v > 0).length / lead.length };
    };
    const long = ride(['groomer'], 1.2, r => !r.air && !r.lane), short = ride(['glade'], 1.2, r => !r.air && r.lane);
    assert.ok(long.n > 3000 && long.skis > 12 && long.ratio > 0.6 && long.ratio < 0.8, `on a groomer the chest turns ${(100 * long.ratio).toFixed(0)}% as far as the skis (which swing ${long.skis.toFixed(0)}°)`);
    assert.ok(short.n > 3000 && short.skis > 8 && short.ratio < 0.4, `in a glade's lane the chest turns ${(100 * short.ratio).toFixed(0)}% as far as the skis (which swing ${short.skis.toFixed(0)}°)`);
    assert.ok(long.swing < 3 && short.swing < 3, `the chest swung ${long.swing.toFixed(2)}° and ${short.swing.toFixed(2)}° in one step`);
    assert.ok(long.lead > 0.6, `the eyes are into the turn ahead of the chest on ${(100 * long.lead).toFixed(0)}% of steps`);
});

test('pole plants: one at each edge change, the new inside pole, a fifth of a second; its tip on the snow by the ski tip, and never through it', () => {
    // A minute of linked turns on a groomer: each edge change with a real swing behind it has its plant.
    const W = L.world(3, QUIET, { sections: ['groomer'] }), r = W.riders[0], lasted = [];
    let tilt = 0, peak = 0, changes = 0, plants = 0, was = 0, on = 0, far = 0;
    for (let i = 0; i < 70 * 60; i++) {
        L.worldStep(W, 1 / 60, null);
        W.events.length = 0;
        assert.ok(r.plant >= 0 && r.plant <= 1 && !r.lane && !r.air);
        if (i >= 600) {
            if (tilt * r.tilt < 0) { if (peak > 0.12) changes++; peak = 0; }
            if (was <= 0.5 && r.plant > 0.5) {
                plants++;
                assert.ok(r.plantSide * r.tilt > 0 && Math.abs(r.tilt) < 0.25, `a plant on the ${r.plantSide > 0 ? 'right' : 'left'} with the tilt at ${r.tilt.toFixed(2)} rad`);
            }
            if (r.plant > 0.5) { on++; far = Math.max(far, r.reach); } else if (on) { lasted.push(on / 60); on = 0; }
            peak = Math.max(peak, Math.abs(r.tilt));
        }
        tilt = r.tilt; was = r.plant;
    }
    assert.ok(changes >= 20 && Math.abs(plants - changes) <= 1, `${plants} plants at ${changes} edge changes`);
    // (A fifth of a second at the most: the tip stays where it went into the snow, so at speed the plant is over when the rider is a
    // pole's reach past it, which at 14 m/s is under a tenth of a second.)
    assert.ok(Math.min(...lasted) >= 0.06 && Math.max(...lasted) <= 0.3 && far < 1.15, `plants of ${Math.min(...lasted).toFixed(2)} to ${Math.max(...lasted).toFixed(2)} s, the rider ${far.toFixed(2)} m past the tip at the most`);
    // The same count at any frame rate.
    const count = hz => { const W = L.world(3, QUIET, { sections: ['groomer'] }), r = W.riders[0]; let n = 0, was = 0; for (let i = 0; i < 40 * hz; i++) { L.worldAdvance(W, 1000 / hz, null); W.events.length = 0; if (r.plantT < was) n++; was = r.plantT; } return n; };
    const at60 = count(60);
    for (const hz of [10, 30, 120]) assert.ok(Math.abs(count(hz) - at60) <= 1, `${count(hz)} plants at ${hz} fps, ${at60} at 60`);
    // Nobody plants a pole in a tuck, in the air, in the pipe, stopping, or on a board.
    {
        const W = L.world(7, { ...CFG, wipeouts: false }, {});
        for (let i = 0; i < 600 * 60; i++) {
            L.worldStep(W, 1 / 60, null);
            W.events.length = 0;
            for (const o of W.riders.concat(W.others)) if (o.plant > 0) assert.ok(o.kind === 'ski' && !o.air && !o.pipe && !o.rail && !o.fall && !o.afoot && o.tuck < 0.5, `a plant by a ${o.kind === 'ski' ? 'skier' : 'boarder'} ${o.air ? 'in the air' : o.pipe ? 'in the pipe' : o.tuck >= 0.5 ? 'in a tuck' : 'down'}`);
            if (W.school) for (const kid of W.school.kids) assert.equal(kid.plant, 0);
        }
    }
    // The figure: riding, both poles' tips are off the snow whatever the tilt, the skid and the chest; in a plant that pole's tip
    // is on the snow beside its ski's tip. (As drawn: the lowest of each pole's own triangles, along the snow's normal.)
    const soup = new SkiSoup(), st = new SkiStack(), who = M.look('ski', false, 'glacier', 0.4), B = M.BONES, grey = [70, 72, 80];
    let low = 9, high = 0, off = 0, away = 0;
    for (const [yaw, pitch, bank] of [[0, 0, 0], [0.7, -0.3, 0.2]]) {
        st.reset(0, 0, 0, yaw).rx(-pitch).rz(bank);
        const m = st.top, up = [m[1], m[5], m[9]];
        const tips = pose => {
            soup.clear();
            M.figure(soup, st, 0, 0, 0, who, { yaw, pitch, bank, phase: 1, t: 2, crouch: 0.46, ...pose });
            // Left and right by which side of the skis' own frame the pole's tip is worked out to be.
            const lowest = [9, 9];
            st.reset(0, 0, 0, yaw).rx(-pitch).rz(bank).ry(pose.skid || 0);
            const right = [st.top[0], st.top[4], st.top[8]], split = (B[20] + B[23]) / 2;
            for (let i = 0; i < soup.n; i++) {
                if (soup.B[i * 24 + 16] !== grey[0] || soup.B[i * 24 + 17] !== grey[1] || soup.B[i * 24 + 18] !== grey[2]) continue;
                const x = soup.F[i * 6], y = soup.F[i * 6 + 1], z = soup.F[i * 6 + 2], k = x * right[0] + y * right[1] + z * right[2] > split ? 1 : 0;
                lowest[k] = Math.min(lowest[k], x * up[0] + y * up[1] + z * up[2]);
            }
            return lowest;
        };
        for (let tilt = -1; tilt <= 1.001; tilt += 0.1) {
            for (const [skid, face, press, lo] of [[0, 0, 1, false], [0.25, 0.1, 1.3, false], [-0.25, -0.3, 1.1, true], [0.1, -0.2, 1, false]]) {
                const free = tips({ tilt, skid, face, press, lo });
                for (const k of [0, 1]) {
                    assert.ok(free[k] > 0.08 && free[k] < 0.3, `tilt ${tilt.toFixed(1)}, skid ${skid}: the ${k ? 'right' : 'left'} pole's tip is ${free[k].toFixed(3)} m off the snow`);
                    assert.ok(Math.abs(free[k] - B[k ? 24 : 21]) < 0.03, 'the pole is drawn where it was worked out');
                    low = Math.min(low, free[k]); high = Math.max(high, free[k]);
                }
                // A plant is on the inside of the new turn, as the skis roll over: so with little tilt yet.
                if (Math.abs(tilt) > 0.35) continue;
                for (const side of [-1, 1]) {
                    const planted = tips({ tilt, skid, face, press, lo, plant: 1, plantSide: side }), k = side > 0 ? 1 : 0, o = side > 0 ? 9 : 0, t = side > 0 ? 23 : 20;
                    const from = Math.hypot(B[t] - B[o + 6], B[t + 2] - (B[o + 8] + 0.87));
                    assert.ok(Math.abs(planted[k]) < 0.08 && Math.abs(B[t + 1]) < 0.08, `tilt ${tilt.toFixed(1)}, skid ${skid}: the planted ${side > 0 ? 'right' : 'left'} pole's tip is ${planted[k].toFixed(3)} m off the snow`);
                    // (The ski's tip is 0.87 m ahead of the ankle; the pole goes in beside it, a boot's length back and a hand's breadth out.)
                    assert.ok(from < 0.5 && (B[t] - B[o + 6]) * side > 0.15, `the planted pole's tip is ${from.toFixed(2)} m from its ski's tip`);
                    assert.ok(planted[1 - k] > 0.08, `the other pole's tip is ${planted[1 - k].toFixed(3)} m off the snow in a plant`);
                    off = Math.max(off, Math.abs(planted[k])); away = Math.max(away, from);
                }
            }
        }
    }
    assert.ok(low > 0.08 && high < 0.3 && off < 0.08 && away < 0.5, `tips ${low.toFixed(3)} to ${high.toFixed(3)} m off the snow riding; planted, ${off.toFixed(3)} m off it at most and ${away.toFixed(2)} m from the ski's tip`);
    // Halfway into a plant the tip is on its way down, not through the snow; and the old arms still come back in a tuck, stopped and in the air.
    for (const plant of [0.25, 0.5, 0.75]) { soup.clear(); M.figure(soup, st, 0, 0, 0, who, { yaw: 0, crouch: 0.46, tilt: 0.1, plant, plantSide: 1 }); assert.ok(B[24] > -0.001 && B[24] < 0.16, `${plant} of the way into a plant the tip is ${B[24].toFixed(3)} m off the snow`); }
    for (const pose of [{ tuck: 0.5 }, { stop: 0.5 }, { stop: 0.5, skid: 1.2, face: 0.3 }, { tuck: 0.3, tilt: 0.5 }]) { soup.clear(); M.figure(soup, st, 0, 0, 0, who, { yaw: 0, crouch: 0.46, ...pose }); assert.ok(B[21] > 0.02 && B[24] > 0.02 && soup.n > 100, `${JSON.stringify(pose)}: a pole's tip ${Math.min(B[21], B[24]).toFixed(3)} m off the snow`); }
});

test('a landing gives no speed away: none in an ordinary jump, no more than the height really fallen can give, and none at all in the pipe', () => {
    // Ten minutes of park, and ten of pipe, everybody jumping.
    for (const kind of ['park', 'pipe']) {
        const W = L.world(7, { ...CFG, wipeouts: false, others: 0, wildlife: false }, { sections: ['groomer', kind] }), C = W.course, off = W.riders.map(() => null);
        let lands = 0, most = 0, pipes = 0;
        for (let i = 0; i < 10 * 3600; i++) {
            const was = W.riders.map(r => ({ air: r.air, v: r.v, y: r.y }));
            L.worldStep(W, 1 / 60, null);
            W.events.length = 0;
            W.riders.forEach((r, j) => {
                if (r.air && !was[j].air) off[j] = { v: was[j].v, y: was[j].y, pipe: !!r.pipe };
                // (In the air nothing changes it either.)
                if (r.air && was[j].air) assert.equal(r.v, was[j].v, 'speed changed in the air');
                if (r.air || !was[j].air || r.fall) return;
                const from = off[j], drop = Math.max(0, from.y - r.y);
                lands++;
                assert.ok(r.v <= Math.sqrt(from.v * from.v + 2 * L.G * drop) + 0.01, `off at ${from.v.toFixed(2)} m/s, down ${drop.toFixed(1)} m, and away at ${r.v.toFixed(2)}`);
                if (from.pipe) { pipes++; assert.equal(r.v, was[j].v, `a landing in the pipe took its speed down the pipe from ${was[j].v.toFixed(2)} to ${r.v.toFixed(2)} m/s`); } else if (C.find(r.z).type === 'park') {
                    assert.ok(r.v <= from.v + 0.05, `a park landing: off at ${from.v.toFixed(2)} m/s and away at ${r.v.toFixed(2)}`);
                    most = Math.max(most, r.v - from.v);
                }
            });
        }
        assert.ok(lands > 40 && (kind === 'park' || pipes > 40), `${kind}: ${lands} landings, ${pipes} in the pipe; the most gained in the park ${most.toFixed(2)} m/s`);
    }
    // Off a cliff it really falls, and comes away faster for it: but by no more than the fall beyond a jump's own arc can give.
    {
        const W = L.world(7, { ...CFG, wipeouts: false, others: 0, wildlife: false }, { sections: ['groomer', 'cliff'] }), r = W.riders[0];
        let off = null, gained = 0, was = { air: false, v: r.v, y: r.y };
        for (let i = 0; i < 10 * 3600; i++) {
            L.worldStep(W, 1 / 60, null);
            W.events.length = 0;
            if (r.air && !was.air) off = { v: was.v, y: was.y };
            if (!r.air && was.air && !r.fall) {
                assert.ok(r.v <= Math.sqrt(off.v * off.v + 2 * L.G * Math.max(0, off.y - r.y)) + 0.01 && r.v <= off.v * 1.1 + 0.01, `off at ${off.v.toFixed(2)} m/s and away at ${r.v.toFixed(2)}`);
                gained = Math.max(gained, r.v - off.v);
            }
            was = { air: r.air, v: r.v, y: r.y };
        }
        assert.ok(gained > 0.3, `the most a cliff gave was ${gained.toFixed(2)} m/s`);
    }
});

test('the grand lodge: level ground, no trees in it, never after a hut; they pull in, sit over a drink at their own places, and ski away', () => {
    // On a mountain of everything, a lodge comes up now and then, and never straight after (or before) a hut.
    const all = L.course(7);
    all.find(120000);
    const kinds = all.sections.map(s => s.type), lodges = kinds.filter(t => t === 'lodge').length;
    assert.ok(lodges >= 4 && lodges < 0.1 * kinds.length, `${lodges} lodges in ${kinds.length} sections`);
    for (let i = 1; i < all.sections.length; i++) assert.ok(!(all.sections[i].T.stop && (all.sections[i - 1].T.stop || i < 3)), 'two stops in a row, or one at the very top');
    // Where it stands: off the piste, on a level pad as wide as the building and its terrace, and no tree within it.
    for (const s of all.sections.filter(q => q.type === 'lodge').slice(0, 4)) {
        const l = all.lodge(s);
        assert.ok(Math.abs(l.x - all.centre(l.z)) > all.width(l.z) + 20);
        for (const [lx, lz] of [[0, 0], [-13, -5.5], [13, -5.5], [-13, 14], [13, 14], [0, 16.6], [5.5, 11]]) { const p = l.at(lx, 0, lz); assert.ok(Math.abs(all.height(p[0], p[2]) - l.y) < 0.02, `the pad is ${(all.height(p[0], p[2]) - l.y).toFixed(2)} m off level at (${lx}, ${lz})`); }
        // The piste itself is as it was: its edge is nowhere near the pad.
        for (const dz of [-14, 0, 14]) { const x = all.centre(l.z + dz) + l.side * (all.width(l.z + dz) - 0.5); assert.ok(Math.abs(all.height(x, l.z + dz) - all.elev(l.z + dz)) < 0.5); }
        for (const k of [Math.floor(l.z / L.CHUNK) - 1, Math.floor(l.z / L.CHUNK), Math.floor(l.z / L.CHUNK) + 1]) {
            const t = all.trees(k);
            for (let j = 0; j < t.n; j++) {
                const dx = (t.x + t.data[j * 8] - l.x) * -l.side, dz = (t.z + t.data[j * 8 + 2] - l.z) * l.side;      // the lodge's own lz and lx
                assert.ok(!(Math.abs(dz) < 15.5 && dx > -8 && dx < L.LODGE.out), `a tree in the lodge at (${dz.toFixed(1)}, ${dx.toFixed(1)})`);
            }
        }
    }
    // Eight minutes of groomers and lodges: at each they go in, sit, and come out.
    const seats = new Set(), shots = new Set(), cam = L.camera();
    let visits = 0, was = 'ride', sat = 0, walked = 0;
    const { W, stats } = ski(17, 8, CFG, 60, world => {
        const g = world.group, C = world.course, lead = world.riders[0];
        if (g.phase === 'apres' && was !== 'apres') visits++;
        was = g.phase;
        L.cameraStep(cam, world, 1 / 60, 'auto');
        shots.add(cam.shot);
        for (const r of world.riders) {
            const a = r.afoot;
            if (!a) continue;
            assert.equal(g.phase, 'apres');
            assert.ok(r.v === 0 && !L.sendIt(world), 'on foot, and no jumping');
            const l = C.lodge(C.find(lead.z));
            if (a.seated) {
                sat++;
                const i = a.place, [lx, lz] = L.LODGE.seat(i), p = l.at(lx, L.LODGE.deck, lz);
                assert.ok(Math.hypot(r.x - p[0], r.y - p[1], r.z - p[2]) < 0.01, 'not in its own place at the table');
                seats.add(i);
                assert.ok(a.gear, 'sat down with its skis on');
            } else if (a.walk) walked++;
        }
        if (cam.shot === 'lodge') {
            // The whole party is in the picture.
            for (const r of world.riders.filter(q => q.afoot)) {
                const dx = r.x - cam.x, dy = r.y + 1 - cam.y, dz = r.z - cam.z, dist = Math.hypot(dx, dy, dz);
                const off = Math.acos(Math.min(1, (dx * Math.sin(cam.heading) * Math.cos(cam.pitch) + dy * Math.sin(cam.pitch) + dz * Math.cos(cam.heading) * Math.cos(cam.pitch)) / dist));
                assert.ok(off < Math.atan(cam.tan) * 1.25 && dist > 6, `a drinker ${off.toFixed(2)} rad off the lens's middle, ${dist.toFixed(0)} m away`);
            }
        }
    }, { sections: ['groomer', 'lodge'] });
    assert.ok(visits >= 3, `${visits} visits in eight minutes`);
    assert.deepEqual([...seats].sort(), [0, 1, 2, 3]);
    assert.ok(sat > visits * 4 * 60 * (L.APRES.sit - 1) * 0.8 && walked > visits * 4 * 60 * L.APRES.walk, `sat for ${sat} steps, walked for ${walked}`);
    assert.ok(shots.has('lodge'), `the director showed ${[...shots]}`);
    assert.equal(stats.under, 0, 'under the snow');
    assert.equal(stats.off, 0, 'off the piste on skis');
    assert.equal(W.ghosts, 0, 'somebody got stuck');
    assert.ok(stats.minPair > 0.9, `two riders ${stats.minPair.toFixed(2)} m apart`);
    assert.ok(stats.minAfoot > 0.2, `two on foot ${stats.minAfoot.toFixed(2)} m apart`);
    assert.ok(W.riders[0].z > 2600, `only ${W.riders[0].z.toFixed(0)} m in eight minutes of lodges`);
});

// ---- No two turns alike, deep snow, and the loose ends (the riders' realism, phase 4) -------------------------------
test('no two turns alike: shorter on the steep and longer on the flat, a rhythm that wanders, each rider their own; and nothing jumps when it changes', () => {
    // Ten minutes on a mountain of everything. A turn is from one edge change to the next (the line's phase through a multiple
    // of pi); its length is how far the rider came. Only whole turns on the open pistes count, ridden and not stopped for.
    const mean = list => list.reduce((x, y) => x + y, 0) / list.length;
    const W = L.world(11, { ...CFG, wipeouts: false }, {}), C = W.course;
    const at = W.riders.map(r => ({ turn: r.turn, d: r.dist, whole: false, all: [], was: null }));
    const steep = [], gentle = [], jump = { u: 0, v: 0, tilt: 0, vu: 0 };
    let changes = 0;
    for (let i = 0; i < 600 * 60; i++) {
        L.worldStep(W, 1 / 60, null);
        W.events.length = 0;
        if (i % 60 === 0) C.trim(W.riders[0].z);
        W.riders.forEach((r, j) => {
            const s = C.find(r.z), q = at[j], w = q.was, riding = !r.air && !r.fall && !r.afoot && !r.pipe && !r.lane && !r.rail && s.T.open && r.v > 6 && r.want;
            if (!riding) q.whole = false;
            if (r.turn !== q.turn) {
                if (q.whole && r.turn === q.turn + 1) {
                    const len = r.dist - q.d;
                    q.all.push(len);
                    // (Against each rider's own usual length, so the four can be counted together.)
                    if (s.g > 0.3) steep.push(len / r.lam); else if (s.g < 0.2) gentle.push(len / r.lam);
                }
                // The step on which a turn's length and swing are chosen afresh: where they are, how fast, how far over, and how
                // fast across the hill, against the step before.
                if (riding && w.riding) { changes++; jump.u = Math.max(jump.u, Math.abs(r.u - w.u)); jump.v = Math.max(jump.v, Math.abs(r.v - w.v)); jump.tilt = Math.max(jump.tilt, Math.abs(r.tilt - w.tilt)); jump.vu = Math.max(jump.vu, Math.abs(r.vu - w.vu)); }
                q.turn = r.turn; q.d = r.dist; q.whole = riding;
            }
            q.was = { u: r.u, v: r.v, tilt: r.tilt, vu: r.vu, riding };
            assert.ok(r.lenK > 0.5 && r.lenK < 1.85 && r.ampK > 0.8 && r.ampK < 1.4 && r.lamNow > 10 && r.lamNow < 170, `a turn ${r.lenK.toFixed(2)} of its usual length and ${r.ampK.toFixed(2)} of its swing, ${r.lamNow.toFixed(0)} m long`);
        });
    }
    const lead = at[0].all, m = mean(lead), cv = Math.sqrt(mean(lead.map(x => (x - m) ** 2))) / m;
    assert.ok(lead.length > 50 && cv > 0.12 && cv < 0.45, `the lead's ${lead.length} turns of ${m.toFixed(1)} m vary by ${cv.toFixed(3)} of that`);
    assert.ok(steep.length > 40 && gentle.length > 12 && mean(steep) < 0.85 * mean(gentle), `turns on the steep are ${mean(steep).toFixed(3)} of the rider's usual (${steep.length} of them), on the flat ${mean(gentle).toFixed(3)} (${gentle.length})`);
    // Each rider their own: no two of the four within 3% of each other.
    const means = at.map(q => mean(q.all)).sort((p, q) => p - q);
    for (let j = 1; j < means.length; j++) assert.ok(at[j].all.length > 40 && means[j] > means[j - 1] * 1.03, `the four riders' turns are ${means.map(v => v.toFixed(1))} m long`);
    // Nothing jumps: a step's worth of sideways travel, of braking, of rolling over (ROLL, 3.2 rad/s), and half a metre a second across.
    assert.ok(changes > 300 && jump.u < 0.25 && jump.v < 0.13 && jump.tilt < 0.054 && jump.vu < 0.5, `at ${changes} changes of rhythm: ${jump.u.toFixed(3)} m, ${jump.v.toFixed(3)} m/s, ${jump.tilt.toFixed(4)} rad and ${jump.vu.toFixed(3)} m/s across in one step`);
    assert.equal(W.ghosts, 0, 'somebody got stuck');
    // The same every time, and for each seed its own: nothing is drawn from the world's dice.
    const a = L.world(11, CFG), b = L.world(11, CFG), c = L.world(12, CFG);
    for (const w of [a, b, c]) for (let i = 0; i < 1200; i++) { L.worldStep(w, 1 / 60, null); w.events.length = 0; }
    assert.ok(a.riders[0].lenK === b.riders[0].lenK && a.riders[0].turn === b.riders[0].turn && a.riders[0].turn > 5);
    assert.notEqual(a.riders[0].lenK, c.riders[0].lenK);
    // Strangers are a spread, the cautious slower and skidding more; the friends all ski well.
    const skills = [];
    ski(13, 6, { ...CFG, others: 2 }, 60, world => { for (const o of world.others) if (!skills.some(k => k.id === o.id)) skills.push({ id: o.id, skill: o.skill, steer: o.steer, pace: o.pace }); for (const r of world.riders) assert.ok(r.skill >= 0.8 && r.skill <= 1); });
    const lo = skills.filter(k => k.skill < 0.4), hi = skills.filter(k => k.skill > 0.6);
    assert.ok(skills.length > 6 && lo.length > 2 && hi.length > 2, `${skills.length} strangers, ${lo.length} cautious and ${hi.length} quick`);
    for (const k of skills) assert.ok(k.skill >= 0 && k.skill <= 1 && Math.abs(k.steer - L.RAD * (20 - 12 * k.skill)) < 1e-9);
});

test('deep snow: the skis ride in it, deepest at the apex and up out of it at each edge change; hardly at all on a groomer; nobody under the surface', () => {
    const soup = new SkiSoup(), st = new SkiStack(), who = M.look('ski', false, 'glacier', 0.4), B = M.BONES;
    // (The crouch as the manager's pose() gives it to the figure: the deeper the skis are, the more the legs are folded over them.)
    assert.ok(sources['ski-run.js'].includes('1.6 * Math.max(0, sink - 0.08)') && sources['ski-run.js'].includes('y = r.y - sink - cam.y'));
    const hips = r => { soup.clear(); M.figure(soup, st, 0, 0, 0, who, { yaw: 0, tilt: r.tilt, press: r.press, skid: r.skid, crouch: L.clamp(0.46 + 0.3 * r.absorb + 1.6 * Math.max(0, r.sink - 0.08), 0, 1), sink: r.sink }); return (B[1] + B[10]) / 2 - r.sink; };
    const ride = (type, each) => {
        const W = L.world(7, QUIET, { sections: [type] }), r = W.riders[0];
        let was = 0, peak = null, down = 0;
        for (let i = 0; i < 100 * 60; i++) {
            L.worldStep(W, 1 / 60, null);
            W.events.length = 0;
            // (At cruise, on the snow for a second or more: off a pillow the skis come down on top of it.)
            down = r.air ? 0 : down + 1;
            const calm = down > 60 && !r.lane && r.v > 11 && r.absorb > -0.3 && r.absorb < 0.3;
            if (i > 600 && calm) {
                // The apex of a turn that is a turn: the tilt at its most. And the edge change after it.
                if (!peak || Math.abs(r.tilt) > Math.abs(peak.tilt)) peak = { tilt: r.tilt, sink: r.sink, hips: hips(r), v: r.v };
                if (was * r.tilt < 0) { if (Math.abs(peak.tilt) > 0.3) each(peak, { sink: r.sink, hips: hips(r) }); peak = null; }
            } else if (!calm) peak = null;
            was = r.tilt;
            assert.ok(r.sink >= 0 && r.sink < 0.26, `the skis ${r.sink} m down`);
            assert.ok(Math.abs(r.y - W.course.height(r.x, r.z)) < 1e-9 || r.air, 'y is the surface');
        }
    };
    let turns = 0, lo = 9, hi = 0, rise = 9, up = 9;
    ride('powder', (apex, change) => { turns++; lo = Math.min(lo, apex.sink); hi = Math.max(hi, apex.sink); up = Math.min(up, apex.sink - change.sink); rise = Math.min(rise, change.hips - apex.hips); });
    assert.ok(turns >= 8 && lo > 0.1 && hi < 0.25, `in powder the skis are ${lo.toFixed(3)} to ${hi.toFixed(3)} m down at the apex of ${turns} turns`);
    assert.ok(up > 0.04 && rise > 0.04, `at the edge change the skis come up ${up.toFixed(3)} m at the least, and the hips ${rise.toFixed(3)} m above where they were at the apex`);
    let groomed = 0, most = 0;
    ride('groomer', apex => { groomed++; most = Math.max(most, apex.sink); });
    assert.ok(groomed >= 12 && most < 0.05, `on a groomer ${most.toFixed(3)} m at the most`);
    // Slower, deeper; and stood still in it, to the ankles. In the air, not at all.
    {
        const W = L.world(7, { ...CFG, wipeouts: false, others: 0, wildlife: false }, { sections: ['powder', 'hut'] }), seen = { stood: 0, air: 9 };
        for (let i = 0; i < 300 * 60; i++) { L.worldStep(W, 1 / 60, null); W.events.length = 0; for (const r of W.riders) { if (r.v === 0 && !r.fall && W.course.find(r.z).type === 'powder') seen.stood = Math.max(seen.stood, r.sink); if (r.air && r.airT > 0.6) seen.air = Math.min(seen.air, r.sink); } }
        assert.ok(seen.air < 0.01, `in the air the skis are ${seen.air.toFixed(3)} m down`);
    }
    // Nobody is under the snow for it: `y` is the surface, and the sink is the figure's.
    const { stats } = ski(7, 4, CFG, 60, null, { sections: ['powder', 'groomer', 'glade'] });
    assert.equal(stats.under, 0);
    // The figure in it: the skis together, the hands and the poles' tips clear of the surface.
    for (const tilt of [-0.6, -0.2, 0, 0.3, 0.7]) {
        soup.clear(); M.figure(soup, st, 0, 0, 0, who, { yaw: 0, crouch: 0.5, tilt });
        const apart = B[15] - B[6];
        soup.clear(); M.figure(soup, st, 0, 0, 0, who, { yaw: 0, crouch: 0.5, tilt, sink: 0.2 });
        assert.ok(B[15] - B[6] < apart - 0.08 && B[15] - B[6] > 0.1, `tilt ${tilt}: the skis ${(B[15] - B[6]).toFixed(2)} m apart in powder, ${apart.toFixed(2)} on a piste`);
        assert.ok(B[21] > 0.2 + 0.08 && B[24] > 0.2 + 0.08, `tilt ${tilt}: a pole's tip ${(Math.min(B[21], B[24]) - 0.2).toFixed(2)} m over the powder`);
    }
});

test('poles are carried, not held out: tips back beside the boots and a forearm outside the feet; a planted tip stays where it touched the snow', () => {
    const soup = new SkiSoup(), st = new SkiStack(), who = M.look('ski', false, 'glacier', 0.4), B = M.BONES;
    let near = 9, far = 0, aft = 9, wide = 0;
    for (let tilt = -0.9; tilt <= 0.901; tilt += 0.1) {
        for (const [skid, face, press] of [[0, 0, 1], [0.15, 0.1, 1.3], [-0.2, -0.3, 1.1], [0.1, -0.25, 1], [0, 0.3, 1.2]]) {
            soup.clear();
            M.figure(soup, st, 0, 0, 0, who, { yaw: 0, crouch: 0.46, phase: 1, tilt, skid, face, press });
            for (const side of [-1, 1]) {
                const o = side > 0 ? 9 : 0, t = side > 0 ? 23 : 20, out = (B[t] - B[o + 6]) * side, back = B[o + 8] - B[t + 2];
                assert.ok(out > 0.25 && out < 0.55, `tilt ${tilt.toFixed(1)}, skid ${skid}: the ${side > 0 ? 'right' : 'left'} pole's tip is ${out.toFixed(2)} m outside its foot`);
                assert.ok(back > 0.1 && back < 0.9, `tilt ${tilt.toFixed(1)}, skid ${skid}: the ${side > 0 ? 'right' : 'left'} pole's tip is ${back.toFixed(2)} m behind its boot`);
                near = Math.min(near, out); far = Math.max(far, out); aft = Math.min(aft, back);
            }
            // (From one tip to the other: never the two metres of a pair of outriggers.)
            wide = Math.max(wide, B[23] - B[20]);
        }
    }
    assert.ok(near > 0.25 && far < 0.55 && aft > 0.1 && wide < 1.5, `tips ${near.toFixed(2)} to ${far.toFixed(2)} m outside the feet, ${aft.toFixed(2)} m behind the boots at the least, ${wide.toFixed(2)} m apart at the most`);
    // Planted: the tip goes in beside the ski's tip, 0.7 m ahead of the boot, and as the rider comes `reach` metres on it is that
    // much further back along the skis: so it has not moved over the snow. To a few centimetres, until it is beside the boot.
    let slip = 0;
    for (const tilt of [-0.2, 0, 0.15]) {
        for (const side of [-1, 1]) {
            for (let reach = 0; reach <= 0.851; reach += 0.05) {
                soup.clear();
                M.figure(soup, st, 0, 0, 0, who, { yaw: 0, crouch: 0.46, tilt, plant: 1, plantSide: side, reach });
                const o = side > 0 ? 9 : 0, t = side > 0 ? 23 : 20;
                slip = Math.max(slip, Math.abs(B[t + 2] + reach - (B[o + 8] + 0.7)), Math.abs(B[t] - (B[o + 6] + side * 0.32)));
                assert.ok(Math.abs(B[t + 1]) < 0.08, `tilt ${tilt}, ${reach.toFixed(2)} m on: the planted tip is ${B[t + 1].toFixed(3)} m off the snow`);
            }
        }
    }
    assert.ok(slip < 0.06, `a planted tip moves ${slip.toFixed(3)} m over the snow at the most while the rider comes 0.85 m past it`);
    // And the logic lifts it by then: a plant is over within a pole's reach of where it went in, at any speed.
    assert.ok(sources['ski-run.js'].includes('reach: r.reach'));
    const W = L.world(3, QUIET, { sections: ['groomer'] }), r = W.riders[0];
    let most = 0, plants = 0, was = 0;
    for (let i = 0; i < 60 * 60; i++) { L.worldStep(W, 1 / 60, null); W.events.length = 0; if (r.plant > 0.3) most = Math.max(most, r.reach); if (was === 0 && r.plant > 0) plants++; was = r.plant; }
    assert.ok(plants > 15 && most > 0.5 && most < 1.2, `${plants} plants, on the snow for ${most.toFixed(2)} m of travel at the most`);
});

test('at the lodge on six mountains: places across the piste they can get to, a walk up that never crosses another, kneeling boarders stay knelt until the board is off', () => {
    const miss = [];
    let knelt = 0;
    for (const seed of [13, 3, 7, 17, 19, 5]) {
        const W = L.world(seed, CFG, { sections: ['groomer', 'lodge'] }), C = W.course, stood = new Map();
        let visits = 0, was = 'ride', gap = 9, walked = 0;
        for (let i = 0; i < 8 * 3600; i++) {
            const before = W.riders.map(r => ({ afoot: !!r.afoot, skid: r.skid, stopSide: r.stopSide, place: r.afoot ? null : L.line(W, r, r.z).c }));
            L.worldAdvance(W, 1000 / 60, null);
            W.events.length = 0;
            const foot = W.riders.filter(r => r.afoot);
            if (W.group.phase === 'apres' && was !== 'apres') {
                visits++;
                // Their own places, and their own widths of the steps in the order they stand along the lodge's front.
                assert.deepEqual(foot.map(r => r.afoot.place).sort(), [0, 1, 2, 3].slice(4 - foot.length), `seed ${seed}: places ${foot.map(r => r.afoot.place)}`);
                const s = C.find(W.riders[0].z), along = [...foot].sort((p, q) => s.side * (p.z - q.z)), lanes = along.map(r => C.lodge(s).side * (r.afoot.path[1][2] - C.lodge(s).z));
                for (let j = 1; j < lanes.length; j++) assert.ok(lanes[j] > lanes[j - 1] + 0.85, `seed ${seed}: lanes up the steps ${lanes.map(v => v.toFixed(2))}`);
                W.riders.forEach((r, j) => {
                    if (!r.afoot || before[j].afoot) return;
                    // How far from the place its line gave it across the piste it pulled up.
                    miss.push(Math.abs(r.u - before[j].place));
                    stood.set(r, before[j]);
                });
            }
            was = W.group.phase;
            for (const r of foot) {
                const a = r.afoot, b = stood.get(r);
                // Out of the skis only once they are off: until then (and once back in them) they stand as they stopped.
                if (b && !a.gear) {
                    assert.ok(r.skid === b.skid && r.stopSide === b.stopSide, `seed ${seed}: stepping out, the skis went from ${b.skid.toFixed(2)} to ${r.skid.toFixed(2)} rad across`);
                    if (r.kind === 'board' && (r.sw ? -1 : 1) * Math.sin(r.skid) > 0.6) knelt++;
                }
                if (a.walk) walked++;
            }
            // Two on foot, either of them walking: never within half a metre.
            for (let p = 0; p < foot.length; p++) for (let q = p + 1; q < foot.length; q++) if (foot[p].afoot.walk || foot[q].afoot.walk) gap = Math.min(gap, Math.hypot(foot[p].x - foot[q].x, foot[p].y - foot[q].y, foot[p].z - foot[q].z));
        }
        assert.ok(visits >= 3 && walked > visits * 3 * 60 * L.APRES.walk, `seed ${seed}: ${visits} visits`);
        assert.ok(gap > 0.5, `seed ${seed}: two on foot ${gap.toFixed(2)} m apart, one of them walking`);
        assert.equal(W.ghosts, 0, `seed ${seed}: somebody got stuck`);
    }
    // (It was a median of 2.1 m and 8.0 m at the ninth decile, when the places went by the riders' lines and were 1.5 m apart:
    // nearer than anybody may pull up beside somebody stopped, and whoever cut across in front was then in the way.)
    assert.ok(miss.length > 60 && centile(miss, 0.5) < 1.7 && centile(miss, 0.9) < 4, `pulled up ${centile(miss, 0.5).toFixed(2)} m from their places across the piste (median), ${centile(miss, 0.9).toFixed(2)} m at the ninth decile, of ${miss.length}`);
    assert.ok(knelt > 30, `a boarder knelt by the board for ${knelt} steps before stepping off it`);
});

test('the camera behind: banked into the lead\'s turn by three degrees at the most, and gentler across the hill than the lead', () => {
    const W = L.world(3, QUIET, { sections: ['groomer'] }), C = W.course, r = W.riders[0], cam = L.camera();
    let pr = 0, pc = 0, vr = 0, vc = 0, ar = 0, ac = 0, n = 0, most = 0, step = 0, was = 0, hard = 0, into = 0, off = 0;
    for (let i = 0; i < 70 * 60; i++) {
        L.worldStep(W, 1 / 60, null);
        W.events.length = 0;
        L.cameraStep(cam, W, 1 / 60, 'follow');
        // Across the hill: from the piste's own middle, so its winding does not count for either.
        const ur = r.x - C.centre(r.z), uc = cam.x - C.centre(cam.z), nvr = (ur - pr) * 60, nvc = (uc - pc) * 60;
        if (i >= 600) {
            assert.ok(!r.air && !r.lane && cam.shot === 'follow');
            ar += ((nvr - vr) * 60) ** 2; ac += ((nvc - vc) * 60) ** 2; n++;
            most = Math.max(most, Math.abs(cam.roll)); step = Math.max(step, Math.abs(cam.roll - was));
            // Turning right (lean > 0) the camera's top goes to its right, as SkiRenderer.aim has a roll above zero: into the turn.
            if (Math.abs(r.lean) > 0.4) { hard++; if (cam.roll * r.lean > 0) into++; }
            off = Math.max(off, Math.abs(turned(Math.atan2(r.x - cam.x, r.z - cam.z) - cam.heading)));
        }
        pr = ur; pc = uc; vr = nvr; vc = nvc; was = cam.roll;
    }
    assert.ok(/r0\.map\(\(v, i\) => v \* cr - u0\[i\] \* sr\), u = u0\.map\(\(v, i\) => v \* cr \+ r0\[i\] \* sr\)/.test(sources['ski-gl.js']), 'the renderer rolls the camera some other way now');
    // (But for the moment after each edge change that it takes to come over: a third of a second.)
    assert.ok(hard > 1000 && into > 0.95 * hard, `banked into the turn on ${into} of ${hard} steps of a hard turn`);
    assert.ok(most > 0.02 && most < 0.0524 && step < 0.003, `rolled ${(most * DEG).toFixed(2)}° at the most, ${(step * DEG).toFixed(3)}° in a step`);
    const ratio = Math.sqrt(ac / ar);
    assert.ok(n > 3000 && Math.sqrt(ar / n) > 2 && ratio < 0.6, `across the hill the lead's feet are pushed about at ${Math.sqrt(ar / n).toFixed(2)} m/s² (rms) and the camera at ${Math.sqrt(ac / n).toFixed(2)}: ${ratio.toFixed(2)} of it`);
    assert.ok(off < 0.3, `the lead is ${off.toFixed(2)} rad to one side of the lens's middle at the most`);
    // Still (reduced motion), or any other shot: level.
    const level = L.camera();
    for (let i = 0; i < 300; i++) { L.worldStep(W, 1 / 60, null); L.cameraStep(level, W, 1 / 60, 'auto', true); assert.equal(level.roll, 0); }
});

test('a tumble ends the right way up and goes over on to its back: no jump from the last of it to lying still', () => {
    const soup = new SkiSoup(), st = new SkiStack();
    for (const kind of ['ski', 'board']) {
        const W = L.world(7, { ...QUIET, kinds: [kind] }, { sections: ['groomer'] }), r = W.riders[0], who = M.look(kind, false, 'glacier', 0.4);
        for (let i = 0; i < 300; i++) L.worldStep(W, 1 / 60, null);
        L.tumble(W, r);
        assert.ok(r.fall.turns >= 2, `${r.fall.turns} turns of a tumble from ${r.v.toFixed(1)} m/s`);
        let last = null, most = 0, atRest = 0, rolled = 0, rate = 0;
        for (let i = 0; i < 600 && r.fall && !(r.fall.phase === 'sit' && r.fall.t > 0.1); i++) {
            const phase = r.fall.phase, roll = r.fall.roll;
            L.worldStep(W, 1 / 60, null);
            W.events.length = 0;
            if (!r.fall) break;
            assert.ok(r.fall.roll >= roll, 'rolled back');
            rate = Math.max(rate, (r.fall.roll - roll) * 60);
            soup.clear();
            M.figure(soup, st, 0, 0, 0, who, { yaw: 0, fall: r.fall, stop: 0, t: 1, sw: false, skid: r.skid, tilt: r.tilt });
            const now = { n: soup.n, F: soup.F.slice(0, soup.n * 6) };
            if (phase === 'tumble' && r.fall.phase === 'lie') { atRest = Math.abs(turned(r.fall.roll)); rolled = r.fall.roll; }
            // From the last quarter turn of the tumble on: how far any corner of the figure goes in a step.
            if (last && last.n === now.n && (r.fall.phase !== 'tumble' || L.TAU * r.fall.turns - r.fall.roll < 0.3)) for (let v = 0; v < now.n; v++) most = Math.max(most, Math.hypot(now.F[v * 6] - last.F[v * 6], now.F[v * 6 + 1] - last.F[v * 6 + 1], now.F[v * 6 + 2] - last.F[v * 6 + 2]));
            last = now;
        }
        assert.ok(rolled > 6 && atRest < 1e-6, `${kind}: came to rest ${atRest.toFixed(4)} rad from the right way up after ${(rolled / L.TAU).toFixed(1)} turns`);
        // (0.85 rad for each metre slid, as it was, to the nearest whole turn: 12 rad/s or so at first.)
        assert.ok(rate < 16, `${kind}: rolling at ${rate.toFixed(1)} rad/s at the fastest`);
        assert.ok(most > 0.005 && most < 0.15, `${kind}: from the tumble to lying still no corner of the figure moves more than ${most.toFixed(3)} m in a step`);
    }
});

test('the same mountain covered at 10, 30, 60 and 120 frames a second', () => {
    const at = hz => { const { W } = ski(5, 3, { ...CFG, others: 0, wildlife: false, wipeouts: false }, hz); return W.riders[0].z; };
    const base = at(60);
    assert.ok(base > 1500, `${base} m in three minutes`);
    for (const hz of [10, 30, 120]) assert.ok(Math.abs(at(hz) / base - 1) < 0.03, `${hz} fps: ${at(hz).toFixed(0)} m against ${base.toFixed(0)}`);
    // A frame that took a second counts for a tenth of one.
    const W = L.world(5, CFG), z = W.riders[0].z;
    L.worldAdvance(W, 1000, null);
    assert.ok(W.riders[0].z - z < 2.2);
});

test('friends, strangers and the ski school: there, and in their places', () => {
    for (const friends of [1, 2, 3]) assert.equal(L.world(3, { ...CFG, friends }).riders.length, friends + 1);
    const W = L.world(3, { ...CFG, friends: 1 });
    L.setFriends(W, 3, CFG.kinds);
    assert.equal(W.riders.length, 4);
    assert.equal(new Set(W.riders.map(r => r.slot)).size, 4, 'each on a line of their own');
    L.setFriends(W, 1);
    assert.equal(W.riders.length, 2);
    let strangers = 0, schools = 0, kids = 0, parked = 0, resting = 0;
    const creatures = new Set();
    ski(13, 15, { ...CFG, others: 2 }, 60, (world, i) => {
        if (i % 60) return;
        strangers = Math.max(strangers, world.others.length);
        if (world.school) { schools++; kids = Math.max(kids, world.school.kids.length); }
        parked += world.others.filter(r => r.parked).length;
        if (world.creature) creatures.add(world.creature.kind);
        for (const r of world.others) assert.ok(world.course.find(r.z).T.open, `a stranger in a ${world.course.find(r.z).type}`);
    });
    assert.ok(strangers >= 4 && strangers <= 8, `${strangers} strangers at once`);
    assert.ok(schools > 10 && kids === 5, `the ski school: seen ${schools} s, ${kids} children`);
    assert.ok(parked > 0, 'nobody stood at the side');
    assert.ok(creatures.size >= 1, 'no wildlife');
    // On a mountain that is mostly huts they pull up together at each, and set off again.
    const { W: huts } = ski(13, 6, CFG, 60, world => { if (world.group.phase === 'rest') resting++; }, { sections: ['groomer', 'hut'] });
    assert.ok(resting >= 3 * 60 * 5 && resting < 6 * 60 * 40, `rested at huts for ${(resting / 60).toFixed(0)} s`);
    assert.ok(huts.riders[0].z > 2200, `only ${huts.riders[0].z.toFixed(0)} m in six minutes of huts`);
    const empty = ski(13, 5, { ...CFG, others: 0, wildlife: false });
    assert.equal(empty.W.others.length, 0);
    assert.equal(empty.W.school, null);
});

test('by hand: a held key moves the lead across, never off the piste or into a tree, and gives it back', () => {
    for (const steer of [-1, 1]) {
        const W = L.world(17, CFG), C = W.course, r = W.riders[0];
        let far = 0, off = 0;
        for (let i = 0; i < 6 * 3600; i++) {
            L.worldStep(W, 1 / 60, { steer });
            W.events.length = 0;
            const s = C.find(r.z);
            if (!r.lane && !s.T.single) { far = Math.max(far, steer * r.u / C.width(r.z)); if (Math.abs(r.u) > C.width(r.z) + 0.3) off++; }
            if (r.lane && s.type === 'glade') assert.ok(Math.abs(r.u - C.laneU(s, r.slot, r.z - s.z0)) < 1.7, 'out of its lane in a glade');
        }
        assert.equal(off, 0);
        assert.ok(far > 0.6, `held ${steer}: got ${far.toFixed(2)} of the way across`);
        assert.ok(W.hand.active);
        for (let i = 0; i < 60 * (L.HAND.back + 6); i++) L.worldStep(W, 1 / 60, null);
        assert.ok(!W.hand.active && Math.abs(r.manual) < 0.5, `given back: ${r.manual.toFixed(2)} m off its own line`);
    }
});

test('camera: each view keeps the lead in the picture and itself out of the snow; the director cuts', () => {
    for (const mode of L.CAMERAS) {
        const W = L.world(9, CFG), cam = L.camera(), shots = new Set();
        let cuts = 0;
        for (let i = 0; i < 8 * 3600; i++) {
            L.worldStep(W, 1 / 60, null);
            W.events.length = 0;
            L.cameraStep(cam, W, 1 / 60, mode);
            const r = W.riders[0];
            shots.add(cam.shot);
            if (cam.cut) cuts++;
            assert.ok(cam.y >= W.course.height(cam.x, cam.z) + 0.99, `${mode}: the camera is in the snow`);
            const dx = r.x - cam.x, dy = r.y + 1 - cam.y, dz = r.z - cam.z, dist = Math.hypot(dx, dy, dz);
            assert.ok(dist > 2 && dist < 130, `${mode}: ${dist.toFixed(1)} m from the lead`);
            // The lead is within the lens.
            const off = Math.acos(Math.min(1, (dx * Math.sin(cam.heading) * Math.cos(cam.pitch) + dy * Math.sin(cam.pitch) + dz * Math.cos(cam.heading) * Math.cos(cam.pitch)) / dist));
            assert.ok(off < Math.atan(cam.tan) * 1.25 + 0.12, `${mode} (${cam.shot}): the lead is ${off.toFixed(2)} rad off the lens's middle`);
        }
        if (mode === 'auto') { assert.ok(shots.has('follow') && shots.has('front') && shots.has('diorama') && shots.has('side'), `the director used ${[...shots]}`); assert.ok(cuts > 12 && cuts < 120, `${cuts} cuts in 8 minutes`); } else { assert.deepEqual([...shots], [mode]); assert.equal(cuts, 1); }
        // Reduced motion: no cuts at all.
        if (mode === 'auto') { const still = L.camera(); for (let i = 0; i < 3600; i++) { L.worldStep(W, 1 / 60, null); L.cameraStep(still, W, 1 / 60, 'auto', true); assert.equal(still.shot, 'follow'); } }
    }
});

test('the mesh the GPU is given is the ground the riders ski', () => {
    const C = L.course(7);
    const cols = M.COLS, B = M.GROUND_BYTES;
    assert.ok(cols.length < 160 && cols[0] < -690 && cols[cols.length - 1] > 690 && cols.includes(0));
    for (let i = 1; i < cols.length; i++) assert.ok(cols[i] > cols[i - 1]);
    let worst = 0;
    for (const k of [4, 30, 77, 140, 200, 333]) {
        const meshes = [0, 1, 2, 3].map(lod => M.ground(C, k, lod));
        meshes.forEach((mesh, lod) => {
            assert.equal(mesh.count, cols.length * (M.ROWS[lod] + 1));
            assert.equal(mesh.buf.byteLength, mesh.count * B);
            assert.ok(mesh.count < 65536, 'too many vertices for 16-bit indices');
            const F = new Float32Array(mesh.buf), b = new Int8Array(mesh.buf);
            for (let v = 0; v < mesh.count; v += 7) {
                const x = mesh.x + F[v * 7], y = mesh.y + F[v * 7 + 1], z = mesh.z + F[v * 7 + 2];
                assert.ok(Math.abs(y - C.height(x, z)) < 0.02, `a vertex ${(y - C.height(x, z)).toFixed(3)} m off the ground`);
                const n = Math.hypot(b[v * B + 20], b[v * B + 21], b[v * B + 22]);
                assert.ok(n > 120 && n < 128.5 && b[v * B + 21] > 20, 'a normal that is not one');
            }
        });
        // Every level of detail shares its first and last rows with the others: no cracks between chunks.
        const first = lod => new Float32Array(meshes[lod].buf, 0, cols.length * 7), last = lod => new Float32Array(meshes[lod].buf, cols.length * M.ROWS[lod] * B, cols.length * 7);
        for (const lod of [1, 2, 3]) for (let i = 0; i < cols.length; i++) { assert.equal(first(lod)[i * 7 + 1], first(0)[i * 7 + 1]); assert.equal(last(lod)[i * 7 + 1], last(0)[i * 7 + 1]); }
        const next = M.ground(C, k + 1, 0), nf = new Float32Array(next.buf, 0, cols.length * 7);
        for (let i = 0; i < cols.length; i += 5) assert.ok(Math.abs(next.y + nf[i * 7 + 1] - (meshes[0].y + last(0)[i * 7 + 1])) < 1e-3, 'a crack between two chunks');
        // Between its vertices the finest mesh is within a hand's width of the real ground where riders go.
        const F = new Float32Array(meshes[0].buf), w = C.width(k * L.CHUNK + 16), s = C.find(k * L.CHUNK + 16);
        for (let j = 0; j < M.ROWS[0]; j += 3) {
            for (let i = 0; i < cols.length - 1; i++) {
                if (Math.abs(cols[i]) > w) continue;
                const a = (j * cols.length + i) * 7, c = a + 7, d = a + cols.length * 7, e = d + 7;
                const mid = [(F[a] + F[c] + F[d] + F[e]) / 4, (F[a + 1] + F[c + 1] + F[d + 1] + F[e + 1]) / 4, (F[a + 2] + F[c + 2] + F[d + 2] + F[e + 2]) / 4];
                const off = Math.abs(meshes[0].y + mid[1] - C.height(meshes[0].x + mid[0], meshes[0].z + mid[2]));
                if (s.type !== 'cliff') worst = Math.max(worst, off);
            }
        }
    }
    assert.ok(worst < 0.3, `the mesh is ${worst.toFixed(2)} m off the ground between its vertices`);
    assert.equal(M.gridIndices(0).length, (cols.length - 1) * M.ROWS[0] * 6);
});

test('models: trees in three levels of detail, riders of every kind in every pose, the props', () => {
    for (let kind = 0; kind < 6; kind++) {
        const sizes = [0, 1, 2].map(lod => M.tree(kind, kind < 4 ? lod : Math.min(lod, 1)).n / 3);
        assert.ok(sizes[0] <= 700 && sizes[0] >= 24, `tree ${kind}: ${sizes[0]} triangles close up`);
        if (kind < 4) assert.ok(sizes[2] <= 36 && sizes[1] < sizes[0] / 3 && sizes[2] < sizes[1], `tree ${kind}: ${sizes}`);
        const t = M.tree(kind, 0), F = t.F;
        let top = 0, wide = 0;
        for (let i = 0; i < t.n; i++) { top = Math.max(top, F[i * 6 + 1]); wide = Math.max(wide, Math.hypot(F[i * 6], F[i * 6 + 2])); }
        assert.ok(top > 0.6 && top <= 1.001, `tree ${kind} is ${top} tall`);
        assert.ok(wide < (kind === 5 ? 1.3 : 0.45), `tree ${kind} is ${wide} wide`);
    }
    const soup = new SkiSoup(), st = new SkiStack();
    const poses = [{}, { lean: 1, crouch: 1 }, { lean: -1 }, { tuck: 1 }, { air: 1, grab: 1, spin: [3, 1, 0.4] }, { air: 1, spread: 1 }, { stop: 1 }, { sit: 1 }, { plough: 1, size: 0.65 }, { stop: 1, wave: 1 }, { stop: 1, walk: 1.3 }, { stop: 1, sit: 1, drink: 0.9 }, { stop: 1, sit: 1, drink: 0 },
        ...['tumble', 'lie', 'sit', 'shake', 'rise'].map(phase => ({ fall: { phase, t: 0.3, roll: 2, turn: 1 } }))];
    for (const kind of ['ski', 'board', 'none']) {
        for (const woman of [true, false]) {
            for (const pose of poses) {
                soup.clear();
                M.figure(soup, st, 0, 0, 0, M.look(kind, woman, 'glacier', 0.4), { yaw: 0.3, pitch: -0.2, bank: 0.1, phase: 1, t: 2, ...pose });
                assert.ok(soup.n / 3 > 150 && soup.n / 3 < 860, `${kind}: ${soup.n / 3} triangles`);
                for (let i = 0; i < soup.n * 6; i += 6) assert.ok(Number.isFinite(soup.F[i]) && Math.abs(soup.F[i]) < 3 && soup.F[i + 1] > -1.6 && soup.F[i + 1] < 3.2, `${kind}, ${JSON.stringify(pose)}: a vertex at ${soup.F[i]}, ${soup.F[i + 1]}`);
            }
        }
    }
    // Into the turn, not out of it: turning right (lean > 0, the way +x is at yaw 0) the head is to the right of the feet, and the
    // body over the hips less tipped than the legs. And on snow that is higher to their right, the right ski is the higher one.
    {
        const shape = pose => {
            soup.clear();
            M.figure(soup, st, 0, 0, 0, M.look('ski', false, 'glacier', 0.4), { yaw: 0, pitch: 0, bank: 0, phase: 0, t: 0, crouch: 0.5, ...pose });
            let top = -9;
            for (let i = 0; i < soup.n * 6; i += 6) top = Math.max(top, soup.F[i + 1]);
            const mean = keep => { let x = 0, y = 0, n = 0; for (let i = 0; i < soup.n * 6; i += 6) if (keep(soup.F[i], soup.F[i + 1])) { x += soup.F[i]; y += soup.F[i + 1]; n++; } return [x / n, y / n]; };
            return { head: mean((x, y) => y > top - 0.2)[0], right: mean((x, y) => y < top * 0.12 && x > 0)[1], left: mean((x, y) => y < top * 0.12 && x < 0)[1] };
        };
        for (const sg of [-1, 1]) {
            const turn = shape({ lean: sg }), slope = shape({ bank: 0.3 * sg });
            assert.ok(turn.head * sg > 0.3 && turn.head * sg < 0.9, `leaning ${sg}: the head is ${turn.head.toFixed(2)} m across`);
            assert.ok((slope.right - slope.left) * sg > 0.02, `snow higher to the ${sg > 0 ? 'right' : 'left'}: the right ski is ${(slope.right - slope.left).toFixed(2)} m above the left`);
        }
    }
    // On skis the legs are worked out, not posed. Both skis stay on the snow on their edges, whatever the tilt and the snow's own
    // pitch and bank; the inside leg comes out the shorter by about the stance times the tilt's tangent; knees are forward of the
    // line from hip to ankle; and the body over the hips is tipped about half as far as the legs, less of it the harder the turn.
    {
        const who = M.look('ski', false, 'glacier', 0.4), B = M.BONES, far = (a, b) => Math.hypot(B[a] - B[b], B[a + 1] - B[b + 1], B[a + 2] - B[b + 2]);
        const is = (b, c) => soup.B[b + 16] === c[0] && soup.B[b + 17] === c[1] && soup.B[b + 18] === c[2];
        for (const [yaw, pitch, bank] of [[0, 0, 0], [0.7, -0.3, 0.2], [-1.1, -0.15, -0.25]]) {
            // The snow under them: a plane through their feet, its normal and the way across it to their right.
            st.reset(0, 0, 0, yaw).rx(-pitch).rz(bank);
            const m = st.top, up = [m[1], m[5], m[9]], right = [m[0], m[4], m[8]];
            for (let tilt = -1; tilt <= 1.001; tilt += 0.1) {
                for (const lo of [false, true]) {
                    soup.clear();
                    M.figure(soup, st, 0, 0, 0, who, { yaw, pitch, bank, phase: 1, t: 2, crouch: 0.46, tilt, lo });
                    // (Soles are their own colour, close up; the skis are the kit's gear colour. Left and right by which side of the middle.)
                    const sole = [0, 0], soles = [0, 0], ski = [9, 9];
                    let mid = 0, n = 0;
                    for (let i = 0; i < soup.n; i++) if (is(i * 24, who.gear)) { mid += soup.F[i * 6] * right[0] + soup.F[i * 6 + 1] * right[1] + soup.F[i * 6 + 2] * right[2]; n++; }
                    mid /= n;
                    for (let i = 0; i < soup.n; i++) {
                        const x = soup.F[i * 6], y = soup.F[i * 6 + 1], z = soup.F[i * 6 + 2], h = x * up[0] + y * up[1] + z * up[2], k = x * right[0] + y * right[1] + z * right[2] > mid ? 1 : 0;
                        if (is(i * 24, [30, 30, 36])) { sole[k] += h; soles[k]++; }
                        if (is(i * 24, who.gear)) ski[k] = Math.min(ski[k], h);
                    }
                    for (const k of [0, 1]) {
                        assert.ok(Math.abs(ski[k]) < 0.02, `tilt ${tilt.toFixed(1)}, pitch ${pitch}, bank ${bank}: the ${k ? 'right' : 'left'} ski's edge is ${ski[k].toFixed(3)} m off the snow`);
                        // (A sole stands 0.04 m off the snow upright: a ski and its binding are under it.)
                        if (!lo) assert.ok(soles[k] > 0 && sole[k] / soles[k] > 0 && sole[k] / soles[k] < 0.085, `tilt ${tilt.toFixed(1)}: the ${k ? 'right' : 'left'} sole is ${(sole[k] / soles[k]).toFixed(3)} m off the snow`);
                    }
                    for (const o of [0, 9]) {
                        assert.ok(Math.abs(far(o, o + 3) - 0.45) < 1e-6 && Math.abs(far(o + 3, o + 6) - 0.43) < 1e-6, `tilt ${tilt.toFixed(1)}: a thigh of ${far(o, o + 3).toFixed(3)} m and a shin of ${far(o + 3, o + 6).toFixed(3)}`);
                        // The knee, off the line from hip to ankle: forwards.
                        const f = ((B[o + 3] - B[o]) * (B[o + 6] - B[o]) + (B[o + 4] - B[o + 1]) * (B[o + 7] - B[o + 1]) + (B[o + 5] - B[o + 2]) * (B[o + 8] - B[o + 2])) / far(o, o + 6) ** 2;
                        const fwd = B[o + 5] - (B[o + 2] + f * (B[o + 8] - B[o + 2]));
                        assert.ok(fwd > 0.03, `tilt ${tilt.toFixed(1)}: a knee ${fwd.toFixed(3)} m ahead of its leg's line`);
                    }
                    const a = Math.abs(tilt), inside = tilt > 0 ? 9 : 0, outside = 9 - inside, short = far(outside, outside + 6) - far(inside, inside + 6), stance = Math.hypot(B[15] - B[6], B[16] - B[7]);
                    assert.ok(stance > 0.235 && stance < 0.41 && (a < 0.75 || stance > 0.38), `tilt ${tilt.toFixed(1)}: skis ${stance.toFixed(2)} m apart`);
                    if (a > 0.25 && a < 0.65) assert.ok(Math.abs(short / (stance * Math.tan(a)) - 1) < 0.3, `tilt ${tilt.toFixed(1)}: the inside leg is ${short.toFixed(3)} m shorter, for ${(stance * Math.tan(a)).toFixed(3)}`);
                    if (Math.abs(a - 0.6) < 0.01) assert.ok(short > 0.12, `tilt ${tilt.toFixed(1)}: the inside leg is ${short.toFixed(3)} m shorter`);
                    if (a > 0.29 && a < 0.91) assert.ok(B[18] / tilt > 0.35 && B[18] / tilt < 0.65 && (a < 0.89 || B[18] / tilt < 0.45) && (a > 0.31 || B[18] / tilt > 0.5), `tilt ${tilt.toFixed(1)}: the torso leans ${(B[18] / tilt).toFixed(2)} of it`);
                    // The hips are inside the feet by what the tilt says.
                    assert.ok(Math.abs(Math.atan2(B[0] + B[9], B[1] + B[10]) - tilt) < 0.01, `tilt ${tilt.toFixed(1)}: the hips are at ${Math.atan2(B[0] + B[9], B[1] + B[10]).toFixed(2)} rad`);
                }
            }
        }
        // Over a turn the outside leg is long as the tilt builds and shorter again under the load at its end; the inside leg only ever shorter.
        const leg = (tilt, press) => { soup.clear(); M.figure(soup, st, 0, 0, 0, who, { yaw: 0, crouch: 0.46, tilt, press }); return [far(0, 6), far(9, 15)]; };
        const [flat] = leg(0, 1), [long, bent] = leg(0.45, 1.1), [loaded] = leg(0.75, 1.4);
        assert.ok(flat > 0.68 && flat < 0.76 && long > flat + 0.08 && long < 0.875 && loaded < long - 0.04 && bent < flat, `the outside leg: ${flat.toFixed(2)} m at the edge change, ${long.toFixed(2)} as the turn builds, ${loaded.toFixed(2)} under 1.4 g; the inside leg ${bent.toFixed(2)}`);
    }
    // A mug in the hand of anyone with a drink, close up and far off; skis and a board left standing in the snow.
    for (const lo of [false, true]) {
        const count = pose => { soup.clear(); M.figure(soup, st, 0, 0, 0, M.look('none', true, 'ember', 0.4), { stop: 1, sit: 1, lo, ...pose }); return soup.n; };
        assert.ok(count({ drink: 0.5 }) > count({}), 'no mug');
    }
    for (const kind of ['ski', 'board']) {
        soup.clear();
        M.gear(soup, st, 0, 0, 0, 0.4, M.look(kind, true, 'ember', 0.4));
        let top = 0, low = 9;
        for (let i = 0; i < soup.n * 6; i += 6) { top = Math.max(top, soup.F[i + 1]); low = Math.min(low, soup.F[i + 1]); }
        assert.ok(soup.n > 30 && top > 1.2 && top < 1.9 && low > -0.25 && low < 0.1, `${kind} stood in the snow from ${low.toFixed(2)} to ${top.toFixed(2)} m`);
    }
    // The grand lodge: grand, and not a hut's worth of triangles more than it needs.
    {
        const l = M.lodge(), F = l.F;
        let top = 0, wide = 0, front = 0;
        for (let i = 0; i < l.n * 6; i += 6) { top = Math.max(top, F[i + 1]); wide = Math.max(wide, Math.abs(F[i])); front = Math.max(front, F[i + 2]); }
        assert.ok(l.n / 3 > 2000 && l.n / 3 < 6000, `the lodge is ${l.n / 3} triangles`);
        assert.ok(top > 15 && top < 19 && wide > 13 && wide < 16 && front > L.LODGE.steps[1] && front < L.LODGE.out - 5, `the lodge: ${top} tall, ${wide} to each side, ${front} to the front`);
    }
    assert.equal(M.KIT_ORDER.length, 8);
    for (const make of [M.hut, M.station, M.chair, M.mast, M.groomer, () => M.tower(9.5), () => M.pole(1), () => M.flag(0), () => M.rail(0), () => M.rail(1), () => M.arch(26), () => M.sign(2)]) assert.ok(make().n > 20);
    // What stands in a chunk: something along every groomed piste, and never on it.
    const C = L.course(7);
    let stood = 0, lamps = 0;
    for (let k = 3; k < 300; k++) { const p = M.props(C, k); stood += p.soup.n; lamps += p.lamps.length; }
    assert.ok(stood > 20000 && lamps > 40, `${stood} vertices of props and ${lamps} lamps in 300 chunks`);
});

test('snowboarders: the board on its edge and both feet on it; sat into a chair on the heels, long and forward on the toes; in balance, and no pop between', () => {
    const soup = new SkiSoup(), st = new SkiStack(), who = M.look('board', false, 'glacier', 0.4), B = M.BONES, W = 0.135;
    const far = (a, b) => Math.hypot(B[a] - B[b], B[a + 1] - B[b + 1], B[a + 2] - B[b + 2]);
    const is = (b, c) => soup.B[b + 16] === c[0] && soup.B[b + 17] === c[1] && soup.B[b + 18] === c[2];
    const knee = o => Math.acos((0.45 ** 2 + 0.43 ** 2 - far(o, o + 6) ** 2) / (2 * 0.45 * 0.43));
    const pose = p => { soup.clear(); M.figure(soup, st, 0, 0, 0, who, { yaw: 0, crouch: 0.46, ...p }); };
    // The middle of the weight: the hips, the chest and the head, as three, five and two parts in ten. How far it is from the line
    // that goes up from the edge the board is on, tipped as the board is.
    const weight = () => [0.3 * B[27] + 0.5 * B[30] + 0.2 * B[33], 0.3 * B[28] + 0.5 * B[31] + 0.2 * B[34]];
    const offLine = ts => { const [y, z] = weight(); return Math.abs((z - Math.sign(ts) * W) * Math.cos(ts) - y * Math.sin(ts)); };
    // Which edge is which: a regular rider's toes are to the right of the way they are going, so a tilt to the right is a toe-side
    // turn; riding switch it is a heel-side one. (A tilt to the rider's right is positive; B[19] is the tilt towards the toes.)
    for (const sw of [false, true]) for (const tilt of [-0.5, 0.5]) { pose({ tilt, sw }); assert.ok(Math.abs(B[19] - (sw ? -tilt : tilt)) < 1e-9, `sw ${sw}, tilt ${tilt}: ${B[19]} towards the toes`); }

    // The edge on the snow, the other one off it, and the boots on the bindings: whatever the snow's own pitch and bank, either way round.
    let worst = 0, boots = [9, 0];
    for (const [yaw, pitch, bank] of [[0, 0, 0], [0.7, -0.3, 0.2], [-1.1, -0.15, -0.25]]) {
        for (const sw of [false, true]) {
            st.reset(0, 0, 0, yaw).rx(-pitch).rz(bank);
            const up = [st.top[1], st.top[5], st.top[9]], right = [st.top[0], st.top[4], st.top[8]], own = Float64Array.from(st.ry((sw ? -1 : 1) * Math.PI / 2).top);
            for (let tilt = -1; tilt <= 1.001; tilt += 0.1) {
                for (const lo of [false, true]) {
                    soup.clear();
                    M.figure(soup, st, 0, 0, 0, who, { yaw, pitch, bank, phase: 1, t: 2, crouch: 0.46, tilt, sw, lo });
                    let low = 9, high = -9, lowAt = 0, binds = [[0, 0, 0, 0], [0, 0, 0, 0]];
                    // (Its bones are in the rider's own frame on the board: here they are in the test's.)
                    const at = o => [0, 4, 8].map(r => own[r] * B[o] + own[r + 1] * B[o + 1] + own[r + 2] * B[o + 2]), ankles = [at(6), at(15)];
                    for (let i = 0; i < soup.n; i++) {
                        const x = soup.F[i * 6], y = soup.F[i * 6 + 1], z = soup.F[i * 6 + 2], h = x * up[0] + y * up[1] + z * up[2];
                        if (is(i * 24, who.gear)) { if (h < low) { low = h; lowAt = x * right[0] + y * right[1] + z * right[2]; } high = Math.max(high, h); }
                        if (is(i * 24, M.C.dark)) { const b = binds[Math.hypot(x - ankles[0][0], y - ankles[0][1], z - ankles[0][2]) < Math.hypot(x - ankles[1][0], y - ankles[1][1], z - ankles[1][2]) ? 0 : 1]; b[0] += x; b[1] += y; b[2] += z; b[3]++; }
                    }
                    const a = Math.abs(tilt), name = `tilt ${tilt.toFixed(1)}, pitch ${pitch}, bank ${bank}, ${sw ? 'switch' : 'regular'}${lo ? ', far off' : ''}`;
                    assert.ok(Math.abs(low) < 0.02, `${name}: the board's edge is ${low.toFixed(3)} m off the snow`);
                    worst = Math.max(worst, Math.abs(low));
                    if (a > 0.05) assert.ok(lowAt * tilt > 0, `${name}: it is on the wrong edge`);
                    // (Far off, the board is a plain plank: its other edge is up by its width times the tilt's sine.)
                    if (lo && a > 0.05) assert.ok(Math.abs(high - (2 * W * Math.sin(a) + 0.03 * Math.cos(a))) < 0.01, `${name}: the other edge is ${high.toFixed(3)} m up`);
                    if (!lo) for (const k of [0, 1]) {
                        const b = binds[k], gap = Math.hypot(b[0] / b[3] - ankles[k][0], b[1] / b[3] - ankles[k][1], b[2] / b[3] - ankles[k][2]);
                        assert.ok(b[3] > 0 && gap > 0.05 && gap < 0.08, `${name}: an ankle ${gap.toFixed(3)} m from the middle of its binding`);
                        boots = [Math.min(boots[0], gap), Math.max(boots[1], gap)];
                    }
                    for (const o of [0, 9]) {
                        assert.ok(Math.abs(far(o, o + 3) - 0.45) < 1e-6 && Math.abs(far(o + 3, o + 6) - 0.43) < 1e-6, `${name}: a thigh of ${far(o, o + 3).toFixed(3)} m and a shin of ${far(o + 3, o + 6).toFixed(3)}`);
                        // The knee, off the line from hip to ankle: towards the toes (the way they point on the rolled board), and out to its own side.
                        const f = ((B[o + 3] - B[o]) * (B[o + 6] - B[o]) + (B[o + 4] - B[o + 1]) * (B[o + 7] - B[o + 1]) + (B[o + 5] - B[o + 2]) * (B[o + 8] - B[o + 2])) / far(o, o + 6) ** 2;
                        const fwd = (B[o + 5] - (B[o + 2] + f * (B[o + 8] - B[o + 2]))) * Math.cos(B[19]) - (B[o + 4] - (B[o + 1] + f * (B[o + 7] - B[o + 1]))) * Math.sin(B[19]), out = (B[o + 3] - (B[o] + f * (B[o + 6] - B[o]))) * (o ? 1 : -1);
                        assert.ok(fwd > 0.1 && out > 0.02 && B[o + 4] > 0.12, `${name}: a knee ${fwd.toFixed(3)} m towards the toes of its leg's line, ${out.toFixed(3)} out, ${B[o + 4].toFixed(2)} up`);
                    }
                    assert.ok(B[1] > 0.18 && soup.n > 100, `${name}: the hips are ${B[1].toFixed(2)} m off the snow`);
                }
            }
        }
    }
    assert.ok(worst < 0.02 && boots[0] > 0.05 && boots[1] < 0.08, `edge ${worst.toFixed(4)} m, boots ${boots}`);

    // Two shapes. At 0.6 rad: on the heels the hips are lower and the knees more bent than on the toes, and the chest is tipped
    // forward (towards the toes) of the line the tilt gives; on the toes the back is along that line. The same riding switch.
    for (const sw of [false, true]) {
        const side = ts => { pose({ tilt: sw ? -ts : ts, sw }); return { hips: B[1], knee: knee(0), nod: B[18] - ts, back: B[2] }; };
        const heel = side(-0.6), toe = side(0.6);
        assert.ok(toe.hips - heel.hips > 0.25, `the hips are ${heel.hips.toFixed(2)} m up on the heels and ${toe.hips.toFixed(2)} on the toes`);
        assert.ok(toe.knee - heel.knee > 0.5 && heel.knee < 1.75, `the knees are at ${heel.knee.toFixed(2)} rad on the heels and ${toe.knee.toFixed(2)} on the toes`);
        assert.ok(heel.nod > 0.6 && heel.nod < 1 && Math.abs(toe.nod) < 0.06, `the chest is ${heel.nod.toFixed(2)} rad forward of the line on the heels and ${toe.nod.toFixed(2)} on the toes`);
        assert.ok(heel.back < -0.5 && toe.back > 0.5, `the hips are ${heel.back.toFixed(2)} m across the board on the heels and ${toe.back.toFixed(2)} on the toes`);
    }
    // Under load late in a turn the legs give, on either edge; and a landing, a lip and a bump still fold them.
    for (const tilt of [-0.6, 0.6]) {
        pose({ tilt, press: 1 }); const light = far(0, 6);
        pose({ tilt, press: 1.5 }); const loaded = far(0, 6);
        pose({ tilt, press: 1, crouch: 0.9 }); const low = far(0, 6);
        assert.ok(light - loaded > 0.05 && light - low > 0.08, `tilt ${tilt}: legs of ${light.toFixed(2)} m, ${loaded.toFixed(2)} under 1.5 g, ${low.toFixed(2)} crouched`);
    }

    // In balance: the weight is on the line from the edge, on both edges, however hard the turn and however they are folded. And
    // what the figure says of its head is where the helmet is drawn.
    let off = 0, hat = 0;
    for (let tilt = -0.9; tilt <= 0.901; tilt += 0.05) {
        if (Math.abs(tilt) < 0.199) continue;
        for (const press of [1, 1.4]) for (const crouch of [0.3, 0.46, 0.8]) {
            pose({ tilt, press, crouch });
            off = Math.max(off, offLine(tilt));
            assert.ok(offLine(tilt) < 0.12, `tilt ${tilt.toFixed(2)}, ${press} g, crouched ${crouch}: the weight is ${offLine(tilt).toFixed(3)} m off the line`);
            let x = 0, y = 0, z = 0, n = 0;
            for (let i = 0; i < soup.n; i++) if (is(i * 24, who.helmet)) { x += soup.F[i * 6]; y += soup.F[i * 6 + 1]; z += soup.F[i * 6 + 2]; n++; }
            // (At yaw 0 a regular rider's toes are towards +x and their right hand towards -z.)
            const gap = Math.hypot(x / n - B[34], y / n - B[33], z / n + B[32]);
            hat = Math.max(hat, gap);
            assert.ok(gap < 0.08, `tilt ${tilt.toFixed(2)}: the helmet is ${gap.toFixed(3)} m from where the head is said to be`);
        }
    }

    // No pop: through an edge change, from hard on the heels to hard on the toes in steps of a hundredth of a radian, no joint, hand
    // or the head moves more than 4 cm in a step.
    let jump = 0, last = null;
    for (let i = -90; i <= 90; i++) {
        pose({ tilt: i / 100, press: 1 + 0.4 * Math.abs(i) / 90 });
        const now = Float64Array.from(B);
        if (last) for (const o of [0, 3, 6, 9, 12, 15, 26, 29, 32, 35, 38]) jump = Math.max(jump, Math.hypot(now[o] - last[o], now[o + 1] - last[o + 1], now[o + 2] - last[o + 2]));
        last = now;
    }
    assert.ok(jump < 0.04, `something moves ${jump.toFixed(3)} m in a hundredth of a radian`);

    // Hands: quiet (the same whatever the time), low, one each way along the board; the trailing one down by the snow hard on the toes.
    pose({ tilt: 0.3, t: 0 }); const hands = [B[35], B[36], B[37], B[38], B[39], B[40]];
    pose({ tilt: 0.3, t: 3.7, phase: 2 });
    assert.deepEqual([B[35], B[36], B[37], B[38], B[39], B[40]], hands, 'the hands waggle');
    for (const tilt of [-0.7, -0.3, 0, 0.3, 0.7]) { pose({ tilt }); assert.ok(B[35] < -0.4 && B[38] > 0.4 && B[36] < B[30] && B[39] < B[30] && B[36] > 0.09 && B[39] > 0.09, `tilt ${tilt}: hands at ${[B[35], B[36], B[38], B[39]].map(v => v.toFixed(2))} (chest ${B[30].toFixed(2)})`); }
    pose({ tilt: 1 }); assert.ok(B[39] < 0.3 && B[36] > B[39] + 0.1, `hard on the toes the trailing hand is ${B[39].toFixed(2)} m off the snow, the leading one ${B[36].toFixed(2)}`);
    // The head looks the way they are going, whichever way round they stand: the lens is ahead of the helmet's middle.
    for (const sw of [false, true]) for (const tilt of [-0.5, 0, 0.5]) {
        pose({ tilt, sw });
        const mean = c => { let z = 0, n = 0; for (let i = 0; i < soup.n; i++) if (is(i * 24, c)) { z += soup.F[i * 6 + 2]; n++; } return z / n; };
        assert.ok(mean([236, 150, 60]) - mean(who.helmet) > 0.06, `tilt ${tilt}, ${sw ? 'switch' : 'regular'}: the goggles are ${(mean([236, 150, 60]) - mean(who.helmet)).toFixed(3)} m ahead of the helmet`);
    }

    // A stop is across the hill on the edge that is up it, by the way the board came round: nose to the right, a regular rider is
    // on the toes and facing up the hill, and kneels to wait; nose to the left, on the heels, and sits down behind the board.
    // Riding switch, the other way about. The snow thrown starts from that edge (the manager asks `tipped` for it).
    for (const sw of [false, true]) for (const skid of [-1.3, 1.3]) {
        const toeSide = (skid > 0) !== sw, name = `${sw ? 'switch' : 'regular'}, nose ${skid > 0 ? 'right' : 'left'}`;
        assert.ok(M.tipped(0, skid, 0.3) * skid > 0 && M.tipped(0.4, 0, 0) === 0.4, 'the edge a skid is on');
        pose({ skid, brake: 0.3, sw });
        assert.ok(B[19] * (toeSide ? 1 : -1) > 0.4, `${name}, braking: the board is rolled ${B[19].toFixed(2)} rad towards the toes`);
        assert.ok(offLine(B[19]) > 0.05, `${name}: the board is no further on its edge than the rider leans`);
        pose({ skid, stop: 1, sw });
        const knees = Math.max(B[4], B[13]);
        if (toeSide) assert.ok(B[19] > 0.8 && B[2] > 0.2 && knees < 0.2 && B[5] > B[2] && B[33] > 0.9, `${name}, waiting: knees ${knees.toFixed(2)} m up, hips ${B[1].toFixed(2)} up and ${B[2].toFixed(2)} across`);
        else assert.ok(B[19] < -0.4 && B[1] < 0.25 && B[2] < -0.4 && knees > B[1] + 0.2 && B[33] > 0.7, `${name}, waiting: hips ${B[1].toFixed(2)} m up and ${B[2].toFixed(2)} across, knees ${knees.toFixed(2)} up`);
        for (const o of [0, 9]) assert.ok(Math.abs(far(o, o + 3) - 0.45) < 1e-6 && Math.abs(far(o + 3, o + 6) - 0.43) < 1e-6 && B[o + 4] > 0.05 && B[o + 7] > 0.05, `${name}, waiting: a leg out of joint or in the snow`);
    }
    // Down after a fall: on their back behind the board, then sat up, and up again without a pop at the end.
    // (Once they have gone over: for most of the time they lie there they are on the way down from the tumble's last turn.)
    pose({ fall: { phase: 'lie', t: L.FALL.lie - 0.01, roll: 0, turn: 1 } });
    assert.ok(B[33] < 0.6 && B[1] < 0.25 && Math.abs(far(0, 3) - 0.45) < 1e-6, `lying, the head is ${B[33].toFixed(2)} m up`);
    pose({ fall: { phase: 'rise', t: L.FALL.rise - 1e-4, roll: 0, turn: 1 } }); const risen = Float64Array.from(B);
    pose({});
    for (const o of [0, 3, 6, 26, 29, 32]) assert.ok(Math.hypot(B[o] - risen[o], B[o + 1] - risen[o + 1], B[o + 2] - risen[o + 2]) < 0.01, 'a pop as they get up');
    console.log(`    boarders: edge within ${worst.toFixed(4)} m of the snow, ankles ${boots.map(v => v.toFixed(3)).join(' to ')} m from their bindings, weight within ${off.toFixed(4)} m of the line, helmet within ${hat.toFixed(3)} m of the head, ${jump.toFixed(4)} m the most in a step`);
});

test('sky and weather: the sun by the hour, the moon at night, light for both; snow and fog come and go', () => {
    const noon = L.bodies(0.5), dawn = L.bodies(0.268), dusk = L.bodies(0.735), night = L.bodies(0);
    assert.ok(noon.sunEl > 28 && noon.sun[2] > 0.5, 'the midday sun is high and down the hill');
    assert.ok(dawn.sunEl > 1 && dawn.sunEl < 6 && dusk.sunEl > 1 && dusk.sunEl < 6);
    assert.ok(night.sunEl < -25 && night.moon[1] > 0.5, 'the moon is up at midnight');
    for (const b of [noon, dawn, dusk, night]) for (const v of [b.sun, b.moon]) assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-9);
    const day = L.light(30), dark = L.light(-30), grey = L.light(30, 1);
    assert.ok(day.day === 1 && dark.day === 0 && dark.stars === 1 && day.stars === 0);
    assert.ok(day.sun[0] > 2 && dark.sun[0] === 0 && grey.sun[0] < day.sun[0] * 0.1);
    assert.ok(L.light(2).glow[0] > day.glow[0] * 2, 'alpenglow at dusk');
    const random = L.rng(5), w = L.weatherStart('auto', random);
    let snowed = 0, fogged = 0, clear = 0;
    for (let i = 0; i < 3600 * 2; i++) { L.weatherStep(w, 1, 'auto', random); if (w.level > 0.3) snowed++; if (w.mist > 0.5) fogged++; if (w.level < 0.02 && w.mist < 0.02) clear++; }
    assert.ok(snowed > 200 && fogged > 60 && clear > 1500, `two hours: ${snowed} s of snow, ${fogged} s of fog, ${clear} s clear`);
    for (const [mode, [level, mist]] of Object.entries(L.WEATHER)) {
        const fixed = L.weatherStart(mode, random);
        for (let i = 0; i < 60; i++) L.weatherStep(fixed, 1, mode, random);
        assert.ok(Math.abs(fixed.level - level) < 0.01 && Math.abs(fixed.mist - mist) < 0.01, mode);
    }
    assert.ok(L.air(0, 0).visibility > 6000 && L.air(1, 0).visibility < 300 && L.air(0, 1).visibility < 300 && L.air(0.7, 0).flakes > 0.8);
});

test('settings: the panel offers what the code knows, and the keys are declared', () => {
    const schema = context.WP.schemaOf('ski-run'), options = key => plain(schema.find(c => c.key === key).options.map(([id]) => id));
    assert.deepEqual(options('camera'), plain(L.CAMERAS));
    assert.deepEqual(options('time').sort(), plain(vm.runInContext('SKI_TIME_ORDER', context)).sort());
    assert.deepEqual(options('weather').sort(), plain(vm.runInContext('SKI_WEATHER_ORDER', context)).sort());
    assert.deepEqual(options('sections'), plain(L.ORDER));
    assert.deepEqual(options('leadKit'), plain(M.KIT_ORDER));
    for (const mode of L.CAMERAS) assert.ok(vm.runInContext('SKI_CAMERA_NAMES', context)[mode], `a name for ${mode}`);
    for (const mode of vm.runInContext('SKI_WEATHER_ORDER', context)) assert.ok(mode === 'auto' || L.WEATHER[mode], `weather ${mode}`);
    assert.equal(schema.find(c => c.key === 'friends').max, 3);
    const defaults = context.WP.defaultsOf ? context.WP.defaultsOf('ski-run') : null;
    if (defaults) assert.deepEqual(plain(defaults.sections), plain(L.ORDER));
    const entry = context.WP.entry('ski-run');
    assert.deepEqual(plain(entry.keys.flatMap(k => k.keys)), ['a', 'd', 'ArrowLeft', 'ArrowRight', 'j', 'ArrowUp', 'v', 't', 'x', 'g']);
    const steer = plain(vm.runInContext('SKI_STEER', context));
    for (const key of entry.keys[0].keys) assert.ok(steer[key.toLowerCase()], `${key} steers`);
    assert.deepEqual(plain(entry.effects.map(([name]) => name)), ['shadows', 'sparkle']);
});

test('cheap and clean: no per-frame pixel reads, blurs, clocks, timers or storage of its own; nothing from anywhere else', () => {
    for (const [name, source] of Object.entries(sources)) {
        assert.ok(!/getImageData|putImageData|shadowBlur|\.filter\s*=/.test(source), `${name}: a per-pixel or blur call`);
        assert.ok(!/new Date\(|Date\.now\(/.test(source), `${name}: reads the clock itself (use host.now())`);
        assert.ok(!/localStorage|sessionStorage/.test(source), `${name}: touches storage itself`);
        assert.ok(!/setInterval|setTimeout/.test(source), `${name}: a timer of its own`);
        assert.ok(!/https?:\/\//.test(source), `${name}: a URL`);
        assert.ok(!/\bfetch\(|XMLHttpRequest|new Image\(|importScripts/.test(source), `${name}: loads something`);
    }
    // The logic and the models never touch the page; only the logic's own seeded numbers decide the mountain.
    for (const name of ['ski-logic.js', 'ski-models.js']) {
        assert.ok(!/\bdocument\b|\bwindow\b|requestAnimationFrame/.test(sources[name]), `${name}: touches the page`);
        assert.ok(!/Math\.random/.test(sources[name]), `${name}: rolls its own dice`);
    }
    // The shaders stay in version 1.00, so they run on WebGL 1 and 2 alike.
    const shaders = sources['ski-gl.js'];
    assert.ok(!/#version/.test(shaders));
    assert.ok(/ANGLE_instanced_arrays/.test(shaders) && /webglcontextlost/.test(sources['ski-run.js']) && /webglcontextrestored/.test(sources['ski-run.js']));
});
