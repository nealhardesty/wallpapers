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
    const W = L.world(seed, cfg, land), C = W.course, stats = { tricks: new Set(), wipes: 0, lands: 0, minPair: 9, minTree: 9, under: 0, off: 0, types: new Set(), maxLift: 0, flown: 0 };
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
                stats.minPair = Math.min(stats.minPair, Math.hypot(r.x - o.x, r.z - o.z, r.y - o.y));
            }
            if (a >= W.riders.length) continue;
            const k = Math.floor(r.z / L.CHUNK), s = C.find(r.z);
            for (const kk of [k - 1, k, k + 1]) {
                const t = treesOf(kk);
                for (let j = 0; j < t.n; j++) if (r.y - (t.y + t.data[j * 8 + 1]) < t.data[j * 8 + 3]) stats.minTree = Math.min(stats.minTree, Math.hypot(t.x + t.data[j * 8] - r.x, t.z + t.data[j * 8 + 2] - r.z) - t.data[j * 8 + 7]);
            }
            // On the piste, or on a lane through the trees (or up a gully's wall, or a pipe's).
            if (Math.abs(r.u) > C.width(r.z) + 0.3 && !r.lane && !s.T.single) stats.off++;
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
        assert.ok(stats.wipes >= 2 && stats.wipes <= 40, `seed ${seed}: ${stats.wipes} wipeouts`);
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
    assert.ok(airs > 20, `${airs} airs in 12 minutes`);
    assert.ok(longest < 60 * 3, `in the air for ${(longest / 60).toFixed(1)} s`);
    assert.ok(down < 0.25 * 12 * 3600, 'on the ground most of the time');
    // Sent, and sent badly.
    const calm = () => { for (let i = 0; i < 600 && (r.air || r.fall || r.lane || W.course.find(r.z).T.single || r.v < 6); i++) L.worldStep(W, 1 / 60, null); };
    calm();
    assert.equal(L.sendIt(W, false), true);
    L.worldStep(W, 1 / 60, null);
    assert.ok(r.air && r.vy > 1 && r.T > 0.7, 'sent');
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
    const poses = [{}, { lean: 1, crouch: 1 }, { lean: -1 }, { tuck: 1 }, { air: 1, grab: 1, spin: [3, 1, 0.4] }, { air: 1, spread: 1 }, { stop: 1 }, { sit: 1 }, { plough: 1, size: 0.65 }, { stop: 1, wave: 1 },
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
    assert.equal(M.KIT_ORDER.length, 8);
    for (const make of [M.hut, M.station, M.chair, M.mast, M.groomer, () => M.tower(9.5), () => M.pole(1), () => M.flag(0), () => M.rail(0), () => M.rail(1), () => M.arch(26), () => M.sign(2)]) assert.ok(make().n > 20);
    // What stands in a chunk: something along every groomed piste, and never on it.
    const C = L.course(7);
    let stood = 0, lamps = 0;
    for (let k = 3; k < 300; k++) { const p = M.props(C, k); stood += p.soup.n; lamps += p.lamps.length; }
    assert.ok(stood > 20000 && lamps > 40, `${stood} vertices of props and ${lamps} lamps in 300 chunks`);
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
