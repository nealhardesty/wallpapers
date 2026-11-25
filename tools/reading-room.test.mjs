// The Reading Room's pure logic (web/wallpapers/reading-room/reading-logic.js):
// the camera, the real sun as a direction, the windows it comes in by and
// where each shaft lands, the light indoors, the layout, and the cats who
// follow the sun across the floor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const WEB = resolve(import.meta.dirname, '../web');
const read = file => readFileSync(join(WEB, 'wallpapers/reading-room', file), 'utf8');
const L = new Function(`${read('reading-logic.js')}; return ReadingLogic;`)();
let defaults = null;
new Function('WP', read('defaults.js'))({ defaults: (id, values) => { defaults = values; } });
const R = L.ROOM;
const at = (m, d, h) => new Date(2026, m, d, Math.floor(h), Math.round((h % 1) * 60));
const mean = a => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
const SCREENS = [[1600, 900, 0], [1920, 1080, 0], [2560, 1080, 0], [412, 915, 48], [820, 1180, 0], [1280, 800, 0]];

test('camera: metres to pixels, the floor meeting the bottom of the picture, the vault above the horizon', () => {
    for (const [W, H, bottom] of SCREENS) {
        const cam = L.camera(W, H, bottom), Hu = H - bottom;
        assert.ok(Math.abs(cam.foot(cam.D(1)) - Hu) < 1e-6, 'depth 1 is the bottom of the usable picture');
        for (const [x, y, D] of [[3, 0, 10], [-12, 5.8, 30], [0, R.apex, 60], [7, 1, 80]]) {
            const [px, py] = cam.p(x, y, D), [qx, qy] = cam.pt(x, y, cam.z(D));
            assert.ok(Math.abs(px - qx) < 1e-6 && Math.abs(py - qy) < 1e-6, 'p (metres) and pt (depth) agree, so Painted Village\'s plates take this camera');
        }
        assert.ok(cam.p(0, cam.eye, 50)[1] === cam.hor, 'the eye\'s height is the horizon');
        assert.ok(cam.p(0, R.apex, R.len)[1] > 0, 'the crown of the vault at the far wall is in the picture');
        // The far wall and its great window sit in the middle of the picture, a reasonable size.
        const [x0] = cam.p(-R.hw, 0, R.len), [x1] = cam.p(R.hw, 0, R.len);
        assert.ok(x1 - x0 > W * 0.1 && x1 - x0 < W * 0.5, `the far wall is ${(x1 - x0).toFixed(0)} px wide on ${W}`);
    }
});

test('the sun: south at noon, east in the morning, west in the afternoon, low in winter and high in summer', () => {
    const noon = L.sunDir(at(11, 21, 12.25)), summer = L.sunDir(at(5, 21, 12.25));
    assert.ok(Math.abs(noon.x) < 0.02 && noon.z < 0, 'at solar noon the sun is due south');
    assert.ok(Math.abs(noon.alt - 26.6) < 1, `the winter noon sun stands ${noon.alt.toFixed(1)}° (90 - 40 - 23.4)`);
    assert.ok(Math.abs(summer.alt - 73.4) < 1, `the summer noon sun stands ${summer.alt.toFixed(1)}°`);
    assert.ok(L.sunDir(at(11, 10, 9.5)).x > 0.3 && L.sunDir(at(11, 10, 15)).x < -0.3, 'east in the morning, west in the afternoon');
    assert.ok(L.sunDir(at(11, 10, 23)).y < 0, 'down at night');
    for (const h of [6, 9, 12, 15, 18]) { const s = L.sunDir(at(3, 1, h)); assert.ok(Math.abs(Math.hypot(s.x, s.y, s.z) - 1) < 1e-9, 'a unit vector'); }
});

test('the windows: twin lights each side of every bay, a skylight in every crown, the great window, and the paned wall behind us', () => {
    const w = L.windows(), kinds = k => w.filter(x => x.kind === k);
    assert.equal(kinds('side').length, R.bays * 4);
    assert.equal(kinds('oculus').length, R.bays);
    assert.equal(kinds('north').length, 1);
    assert.equal(kinds('south').length, L.SOUTH.cols * L.SOUTH.rows);
    for (const x of kinds('side')) assert.ok(x.pts.every(p => Math.abs(Math.abs(p[0]) - R.hw) < 1e-9 && p[1] >= R.win0 - 1e-9 && p[1] <= R.win1 + 1e-9), 'side windows sit in the wall above the second gallery');
});

test('sunbeams: morning sun lands on the left of the floor and afternoon sun on the right, barred by the mullions; none at night', () => {
    const xs = h => { const b = L.beams(L.sunDir(at(11, 10, h))).filter(b => b.floor); return mean(b.map(b => L.centroid(b.floor)[0])); };
    assert.ok(xs(9.5) < -3, `the morning's patches are left of the aisle (mean x ${xs(9.5).toFixed(1)})`);
    assert.ok(xs(15) > 3, `the afternoon's right (mean x ${xs(15).toFixed(1)})`);
    assert.ok(Math.abs(xs(12.25)) < 1, 'and at noon straight down the hall');
    assert.equal(L.beams(L.sunDir(at(11, 10, 22))).length, 0, 'no sun at night');
    // Every patch is on the floor of the hall (clear of the galleries' shade) or on a wall.
    for (const h of [8.5, 10, 11.5, 12.25, 13, 14.5, 16]) for (const m of [0, 3, 5, 8, 11]) for (const b of L.beams(L.sunDir(at(m, 15, h)))) {
        if (b.floor) for (const p of b.floor) assert.ok(Math.abs(p[0]) <= R.g1x + 1e-6 && p[2] >= R.z0 && p[2] <= R.len && p[1] === 0, 'a floor patch inside the hall');
        if (b.wall) for (const p of b.wall) assert.ok(p[1] >= -1e-6 && p[1] <= R.tiers[3][1] + 1e-6, "a wall patch on the bookcases");
        assert.ok(b.k > 0 && b.k <= 1);
    }
    // The paned wall behind us lays its panes down separately: bars of shadow between them.
    const south = L.beams(L.sunDir(at(11, 10, 11))).filter(b => b.window.kind === 'south' && b.floor);
    assert.ok(south.length >= 6, `${south.length} panes on the floor`);
    const pane = (i, j) => south.find(b => b.window === L.windows().filter(w => w.kind === 'south')[i * L.SOUTH.rows + j]);
    const a = pane(2, 0), b = pane(2, 1);
    if (a && b) assert.ok(!L.inside(a.floor, ...L.centroid(b.floor)) && !L.inside(b.floor, ...L.centroid(a.floor)), 'two panes, two patches');
    // The shaft from a pane behind us starts where it crosses in front of the eye, not behind it.
    for (const s of south) { const pts = L.shaft(s, L.sunDir(at(11, 10, 11))); if (pts) assert.ok(pts.every(p => p[2] >= 2.2 - 1e-9), 'a shaft in front of the eye'); }
});

test('the light indoors: lamps count at night and hardly by day; a moonlit night is bluer; dusk is warm', () => {
    const sky = { sky0: [0, 0, 0], sky1: [0, 0, 0], sky2: [0, 0, 0], sky3: [0, 0, 0], sky4: [0, 0, 0] };
    const night = L.roomLight(sky, -30, 0), moon = L.roomLight(sky, -30, 1), dusk = L.roomLight(sky, -2, 0), day = L.roomLight(sky, 30, 0);
    assert.ok(night.warm > 1 && day.warm < 0.35, 'lamps matter at night');
    assert.ok(day.amb[1] > night.amb[1] * 4, 'day is lighter');
    assert.ok(moon.keyA[2] > night.keyA[2] && moon.keyA[2] > moon.keyA[0], 'moonlight is blue');
    assert.ok(dusk.keyA[0] > dusk.keyA[2], 'dusk is warm');
    assert.notEqual(L.lightKey(night), L.lightKey(day));
});

test('the layout: tables in rows, three lamps and six chairs each, the fire, busts and globes; the tree only when decorated', () => {
    const cam = L.camera(1600, 900);
    const lay = L.layout(cam, { ...defaults, date: at(5, 1, 12) });
    assert.equal(lay.tables.length, defaults.tables * 2);
    assert.equal(lay.lamps.length, lay.tables.length * 3);
    assert.equal(lay.seats.length, lay.tables.length * 6);
    assert.ok(lay.fire && lay.desk && lay.rug, 'the fire, its rug and the desk');
    assert.ok(lay.things.filter(t => t.kind === 'bust').length >= 8 && lay.things.some(t => t.kind === 'globe') && lay.things.some(t => t.kind === 'catalogue'));
    assert.equal(lay.tree, null, 'no tree in June');
    assert.ok(L.layout(cam, { ...defaults, date: at(11, 12, 12) }).tree, 'a tree in December');
    assert.ok(L.layout(cam, { ...defaults, decorations: 'always', date: at(5, 1, 12) }).tree, 'or always, if asked');
    assert.equal(L.layout(cam, { ...defaults, decorations: 'never', date: at(11, 24, 12) }).tree, null);
    assert.equal(L.layout(cam, { ...defaults, tables: 3 }).tables.length, 6);
    assert.equal(L.layout(cam, { ...defaults, fireplace: false }).fire, undefined);
    // The bands the picture is cut at are in order, each just beyond a row of tables.
    for (let i = 1; i < lay.bandsD.length; i++) assert.ok(lay.bandsD[i] > lay.bandsD[i - 1]);
    for (const t of lay.tables) assert.ok(L.tableAt(t.x, t.z) && !L.aisle(t.x, t.z), 'a table is no aisle');
    for (const s of lay.seats) assert.ok(!L.tableAt(s.x, s.z, 0.2), 'chairs stand beside the tables');
    assert.equal(L.strikes(0), 12); assert.equal(L.strikes(13.5), 1); assert.equal(L.strikes(23), 11);
});

test('a cat walking across the hall goes round the tables, never through one', () => {
    const lay = L.layout(L.camera(1600, 900), defaults), nodes = Object.values(lay.nodes);
    for (let i = 0; i < 60; i++) {
        const from = nodes[(i * 7) % nodes.length], to = nodes[(i * 13 + 5) % nodes.length], cat = { x: from.x, z: from.z + 0.6, dir: 1 };
        let left = Infinity;
        for (let step = 0; step < 4000 && left > 0.05; step++) {
            left = L.stepToward(cat, to.x, to.z + 0.6, 1, 1 / 30);
            assert.ok(!L.tableAt(cat.x, cat.z, 0.05), `through a table at ${cat.x.toFixed(2)}, ${cat.z.toFixed(2)}, from ${from.name} to ${to.name}`);
        }
        assert.ok(left <= 0.05, `${from.name} to ${to.name}: still ${left.toFixed(2)} m to go`);
    }
});

test('the sunbeam cat follows the sun across the floor through a winter day, and goes to the fire after dark', () => {
    const lay = L.layout(L.camera(1600, 900), defaults), cat = { i: 0, role: 'sunbeam', x: 0, z: 8, hx: 0, hz: 8, dir: 1 };
    let inSun = 0, sunny = 0;
    const where = [];
    for (let h = 9; h <= 15.01; h += 0.25) {
        const s = L.sunDir(at(11, 10, h)), beams = L.beams(s), spots = L.sunSpots(beams);
        const goal = L.want(cat, { day: 1, spots, fire: false, lamps: [], L: lay });
        for (let step = 0; step < 900 && L.stepToward(cat, goal.x, goal.z, 0.5, 1 / 10) > 0.05; step++);
        if (spots.length) { sunny++; if (L.sunAt(beams, cat.x, cat.z) === 0) inSun++; where.push(cat.x); }
        for (const sp of spots) assert.ok(L.aisle(sp.x, sp.z), 'a sunny spot is in an aisle');
    }
    assert.ok(sunny > 12 && inSun / sunny > 0.85, `in the sun ${inSun} times of ${sunny}`);
    assert.ok(mean(where.slice(0, 4)) < mean(where.slice(-4)), 'left of the hall in the morning, right in the afternoon');
    const night = L.want(cat, { day: 0, spots: [], fire: true, lamps: [], L: lay });
    assert.ok(Math.abs(night.x - lay.fire.x) < 2 && Math.abs(night.z - lay.fire.z) < 1.5, 'by the fire at night');
    // Two cats in the sun do not share one spot when there are others.
    const spots = L.sunSpots(L.beams(L.sunDir(at(11, 10, 11)))), taken = new Set();
    const a = L.want({ ...cat, i: 0 }, { day: 1, spots, L: lay, taken }); taken.add(a.spot);
    const b = L.want({ ...cat, i: 7 }, { day: 1, spots, L: lay, taken });
    if (spots.length > 1) assert.ok(a.x !== b.x || a.z !== b.z);
});

test('seasons: the date chosen for each, and the season of a date', () => {
    assert.equal(L.seasonOf(at(11, 20, 12)), 'winter'); assert.equal(L.seasonOf(at(6, 4, 12)), 'summer'); assert.equal(L.seasonOf(at(9, 31, 12)), 'autumn'); assert.equal(L.seasonOf(at(3, 20, 12)), 'spring');
    for (const s of ['winter', 'spring', 'summer', 'autumn']) assert.equal(L.seasonOf(L.seasonDate(s, at(2, 3, 15))), s);
    assert.equal(L.seasonDate('live', at(2, 3, 15)).getTime(), at(2, 3, 15).getTime());
    assert.ok(L.christmas('auto', at(11, 1, 9)) && L.christmas('auto', at(0, 6, 9)) && !L.christmas('auto', at(0, 7, 9)) && !L.christmas('never', at(11, 25, 9)) && L.christmas('always', at(6, 1, 9)));
    assert.equal(L.christmas('auto', undefined), false, 'no date, no Christmas: it never reads the real clock');
});

test('a walker\'s feet are planted: a foot on the floor never slides, a step\'s length times the steps a second is the speed, and they turn by the way they face', () => {
    const a = { x: R.aisleIn, z: 1, h: Math.PI / 2, v: 0, vmax: 1.25, r: R.personR, k: 1, path: L.route(R.aisleIn, 1, -R.aisleOut, 60) };
    const dt = 1 / 50;
    let walked = 0, stepped = 0, last = null, slip = 0, turn = 0, landings = 0;
    for (let i = 0; i < 50 * 90 && (a.path.length || a.v > 0); i++) {
        const h0 = a.h, sw0 = a.g ? a.g.sw : null, L0 = a.g ? a.g.L : 0;
        L.walk(a, [], dt); const g = L.gait(a, a.moved, dt);
        walked += a.moved;
        turn = Math.max(turn, Math.abs(Math.atan2(Math.sin(a.h - h0), Math.cos(a.h - h0))));
        // The foot on the floor this frame and last is where it was.
        const stance = 1 - g.sw;
        if (last && sw0 === g.sw && !g.rest) slip = Math.max(slip, Math.hypot(g.feet[stance].x - last.x, g.feet[stance].z - last.z));
        if (sw0 !== null && sw0 !== g.sw) { landings++; stepped += L0; }
        last = { ...g.feet[stance] };
        for (const f of L.pose(a).feet) assert.ok(Math.hypot(f.x - a.x, f.z - a.z) < 0.85, 'a foot stays within a stride of the body');
        assert.ok(!L.blocked(a.x, a.z, 0.15), `walked into something at ${a.x.toFixed(2)}, ${a.z.toFixed(2)}`);
    }
    assert.ok(!a.path.length, 'got there');
    assert.equal(slip, 0, 'a planted foot does not move');
    assert.ok(landings > 60, `${landings} steps`);
    assert.ok(Math.abs(stepped - walked) / walked < 0.03, `steps add up to the way walked: ${stepped.toFixed(1)} m of steps for ${walked.toFixed(1)} m`);
    assert.ok(turn <= 4.2 / 50 + 1e-9, 'turns as a person turns, not at once');
    const cadence = 1.2 / L.stepLen(1.2);
    assert.ok(cadence > 1.5 && cadence < 2.3, `about two steps a second at a walk (${cadence.toFixed(2)})`);
    assert.ok(L.stepLen(0.3) < L.stepLen(1.2) * 0.7, 'shorter steps when slow');
    // Stopped: a last little step brings the feet together.
    for (let i = 0; i < 100; i++) { L.walk(a, [], dt); L.gait(a, a.moved, dt); }
    const [f0, f1] = L.pose(a).feet;
    assert.ok(a.g.rest && Math.hypot(f0.x - f1.x, f0.z - f1.z) < 0.25, 'standing with the feet together');
});

test('a crowd: people come in to their seats, leave and cross the hall, round the furniture, keeping right, and nobody ever walks through anybody', () => {
    const lay = L.layout(L.camera(1600, 900), defaults), dt = 1 / 30;
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, pick = a => a[Math.floor(rnd() * a.length)];
    const aisleOf = s => Math.sign(s.x) * (Math.abs(s.x) < R.tableX ? R.aisleIn : R.aisleOut);
    const all = [], seated = [], free = [], walkers = [], nodes = Object.values(lay.nodes);
    lay.seats.forEach((s, i) => { if (i % 3 === 0) { const p = { x: s.x, z: s.z, r: R.personR, seat: s }; seated.push(p); all.push(p); } else free.push(s); });
    const clear = (x, z) => all.every(o => Math.hypot(o.x - x, o.z - z) > 1.3);
    let done = 0, passes = 0, worst = Infinity, longest = 0;
    for (let step = 0; step < 300 / dt; step++) {
        // Every second or so: someone in at the door to a seat, someone up and out, or someone across the hall.
        if (step % 30 === 0 && walkers.length < 18) {
            const kind = pick(['in', 'in', 'out', 'across']);
            if (kind === 'in' && free.length) { const s = free.splice(Math.floor(rnd() * free.length), 1)[0], x = aisleOf(s), z = 0.4; if (clear(x, z)) { const w = { x, z, h: Math.PI / 2, v: 1, vmax: 1 + rnd() * 0.35, r: R.personR, k: 1, path: [], goals: [[s.x, s.z]], seat: s, t: 0 }; walkers.push(w); all.push(w); } else free.push(s); }
            if (kind === 'out' && seated.length) { const p = seated.splice(Math.floor(rnd() * seated.length), 1)[0]; Object.assign(p, { h: 0, v: 0, vmax: 1.1, k: 1, path: [], goals: [[aisleOf(p.seat), 0.3]], out: true, t: 0 }); free.push(p.seat); walkers.push(p); }
            if (kind === 'across') { const a = pick(nodes), b = pick(nodes); if (a !== b && clear(a.x, a.z)) { const w = { x: a.x, z: a.z, h: 0, v: 0, vmax: 1.2, r: R.personR, k: 1, path: [], goals: [[b.x, b.z]], t: 0, across: true }; walkers.push(w); all.push(w); } }
        }
        for (let i = walkers.length - 1; i >= 0; i--) {
            const w = walkers[i];
            w.t += dt;
            if (!w.path.length && w.goals.length) w.path = L.route(w.x, w.z, ...w.goals.shift(), w.r);
            const left = L.walk(w, all, dt);
            L.gait(w, w.moved, dt);
            assert.ok(!L.blocked(w.x, w.z, 0.12), `walked into the furniture at ${w.x.toFixed(2)}, ${w.z.toFixed(2)}`);
            if (left === 0 && !w.path.length && !w.goals.length) {
                done++; longest = Math.max(longest, w.t); walkers.splice(i, 1);
                if (w.seat && !w.out) { w.vx = w.vz = 0; seated.push(w); } else all.splice(all.indexOf(w), 1);
            }
        }
        // Nobody overlaps anybody, ever.
        for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
            const a = all[i], b = all[j], d = Math.hypot(a.x - b.x, a.z - b.z);
            worst = Math.min(worst, d - a.r - b.r);
            assert.ok(d >= a.r + b.r - 1e-9, `two people in one place: ${d.toFixed(3)} m apart at (${a.x.toFixed(2)}, ${a.z.toFixed(2)}) and (${b.x.toFixed(2)}, ${b.z.toFixed(2)})`);
            if (d < 1.2 && (a.vx || a.vz) && (b.vx || b.vz) && (a.vx * b.vx + a.vz * b.vz) < 0) passes++;
        }
    }
    assert.ok(done > 120, `${done} got where they were going`);
    assert.ok(walkers.every(w => w.t < 90) && longest < 90, `nobody stuck for long (the longest took ${longest.toFixed(0)} s)`);
    assert.ok(passes > 20, `people passed each other going opposite ways (${passes} frames of it)`);
    assert.ok(worst >= 0, `closest ${worst.toFixed(3)} m apart`);
});
