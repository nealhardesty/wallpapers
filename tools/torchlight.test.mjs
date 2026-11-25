// Torchlight Descent's pure logic (web/wallpapers/torchlight/torch-logic.js):
// the camera, where everything is put, the line down the mountain, the
// procession and its tumbles, the figures, the year, and which evening is which.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const WEB = resolve(import.meta.dirname, '../web');
const read = file => readFileSync(join(WEB, 'wallpapers/torchlight', file), 'utf8');
const L = new Function(`${read('torch-logic.js')}; return TorchLogic;`)();
let defaults = null;
new Function('WP', read('defaults.js'))({ defaults: (id, values) => { assert.equal(id, 'torchlight'); defaults = values; } });

const seeded = seed => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const SCREENS = [[1600, 900, 0], [1920, 1080, 0], [2560, 1080, 0], [412, 915, 48], [820, 1180, 0], [1280, 600, 0], [360, 640, 48], [1366, 768, 0]];
const scene = (W, H, bottom, config = {}) => { const cam = L.camera(W, H, bottom, defaults.horizon); return { cam, V: L.layout(cam, { ...defaults, ...config }) }; };

test('camera: metres to pixels and back; the ground meets the bottom of the usable picture; a phone gets more mountain', () => {
    for (const [W, H, bottom] of SCREENS) {
        const cam = L.camera(W, H, bottom, defaults.horizon);
        assert.ok(Math.abs(cam.sy(1) - (H - bottom)) < 1e-6);
        for (const z of [1, 2.3, 5, 11]) {
            assert.ok(Math.abs(cam.zAt(cam.sy(z)) - z) < 1e-6);
            assert.ok(Math.abs(cam.xAt(cam.sx(3.3, z), z) - 3.3) < 1e-9);
        }
        assert.equal(cam.kind, W / (H - bottom) < 0.9 ? 'upright' : W / (H - bottom) > 2.15 ? 'panorama' : 'wide');
    }
    const wide = L.camera(1600, 900, 0, defaults.horizon), phone = L.camera(412, 915, 48, defaults.horizon);
    assert.ok(phone.hor / phone.Hu > wide.hor / wide.Hu, 'the mountain has more of an upright picture');
});

test('layout: the inn, the finish, the run and the valley in view; nothing built on the run or in the figure', () => {
    for (const [W, H, bottom] of SCREENS) {
        const { cam, V } = scene(W, H, bottom);
        const M = V.mountain;
        assert.ok(M.top > 0 && M.top < cam.hor * 0.5 && M.footY > cam.hor, `${W}×${H}: the mountain stands up from the valley`);
        assert.ok(V.inn && Math.abs(cam.sx(V.inn.x, V.inn.z) - W / 2) < W / 2, `${W}×${H}: the inn is in the picture`);
        const fx = cam.sx(V.finish.x, V.finish.z), fy = cam.sy(V.finish.z);
        assert.ok(fx > 0 && fx < W && fy > cam.hor && fy < H - bottom, `${W}×${H}: the finish is in the picture, above the inset`);
        for (const c of V.chalets) {
            for (const p of V.track.pts.filter(q => q.ground)) assert.ok(!(Math.abs(p.xm - c.x) < c.w / 2 + 1 && Math.abs(p.z - c.z) * cam.zm < 6), `${W}×${H}: a chalet on the run`);
            assert.ok(!(V.inn && Math.abs(c.x - V.inn.x) < (c.w + V.inn.w) / 2 && Math.abs(c.z - V.inn.z) * cam.zm < 14), `${W}×${H}: a chalet in the inn`);
        }
        // The figure at the bottom stays clear of the inn, in the picture, its places apart.
        for (const shape of L.SHAPES) {
            const spots = L.formation(shape, 36, V, cam);
            assert.equal(spots.length, 36);
            for (const s of spots) {
                const x = cam.sx(s.x, s.z), y = cam.sy(s.z);
                assert.ok(x > -10 && x < W + 10 && y > cam.hor && y < H - bottom + 4, `${W}×${H}: a ${shape}'s torch out of the picture`);
                assert.ok(!(V.inn && Math.abs(s.x - V.inn.x) < V.inn.w / 2 + 1 && s.z < V.inn.z + cam.dz(15)), `${W}×${H}: a ${shape}'s torch in the inn`);
            }
            let closest = Infinity;
            for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) closest = Math.min(closest, Math.hypot(spots[i].x - spots[j].x, (spots[i].z - spots[j].z) * cam.zm));
            assert.ok(closest > 0.6, `${W}×${H}: two torches of the ${shape} in one place (${closest.toFixed(2)} m)`);
        }
        assert.ok(L.BANDS.some(b => b > V.inn.z && b - V.inn.z < 0.1), 'the inn stands just nearer than a band, so whoever walks behind it is hidden');
    }
    // Every switch.
    const { V } = scene(1600, 900, 0, { inn: false, chapel: false, lamps: false, chalets: 0, tree: false });
    assert.ok(!V.inn && !V.chapel && !V.lamps.length && !V.chalets.length && !V.tree);
    assert.ok(scene(1600, 900, 0, { chalets: 3 }).V.chalets.length === 3);
});

test('the track: from the hut down the switchbacks and across the meadow to the finish, without a jump, in metres that only grow', () => {
    for (const [W, H, bottom] of SCREENS) {
        const { cam, V } = scene(W, H, bottom), T = V.track, P = T.pts;
        assert.ok(T.faceEnd > 10 && T.faceEnd < P.length - 10, 'some of it on the face, some on the meadow');
        assert.ok(T.length > 500 && T.length < 2500, `${W}×${H}: a run of ${T.length.toFixed(0)} m`);
        assert.ok(Math.abs(P[0].y - (V.hut.y + 4 * cam.u)) < 20 * cam.u, 'it starts at the hut');
        let turns = 0, lastDx = 0;
        for (let i = 1; i < P.length; i++) {
            assert.ok(P[i].m > P[i - 1].m, 'metres grow');
            assert.ok(Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y) < 40 * cam.u, `${W}×${H}: a jump in the track at ${i}`);
            if (!P[i].ground) { assert.ok(P[i].y >= V.mountain.top - 2 && P[i].y <= V.mountain.footY + 2, 'on the face, it is on the face'); const dx = Math.sign(P[i].x - P[i - 1].x); if (dx && lastDx && dx !== lastDx) turns++; if (dx) lastDx = dx; }
            assert.ok(P[i].y >= P[i - 1].y - 2 * cam.u, 'it only ever goes down the picture');
        }
        assert.ok(turns >= 5, `${W}×${H}: ${turns} turns down the face`);
        const end = P[P.length - 1];
        assert.ok(Math.abs(end.xm - V.finish.x) < 2 && Math.abs(end.z - V.finish.z) * cam.zm < 8, 'it ends at the finish');
        // at(): where s metres down is, continuous, clamped.
        const a = L.at(T, -5, cam), b = L.at(T, T.length + 50, cam);
        assert.ok(Math.abs(a.x - P[0].x) < 1e-6 && Math.abs(b.x - end.x) < 1e-6);
        let prev = L.at(T, 0, cam, {});
        for (let s = 1; s < T.length; s += 1) { const q = L.at(T, s, cam, {}); assert.ok(Math.hypot(q.x - prev.x, q.y - prev.y) < 12 * cam.u, `a jump at ${s} m`); prev = q; }
    }
});

test('the procession: they light up at the hut, come down in order and spaced, plant their torches, go in; the same at 10 fps as at 120', () => {
    const { cam, V } = scene(1600, 900, 0), T = V.track, spots = L.formation('heart', 20, V, cam);
    const run = (fps, tumbles) => {
        const R = seeded(5), P = L.procession(20, { random: R, gap: 8, tumbles, gather: 20 }), dt = 1 / fps, log = { off: 0, fall: 0, up: 0, plant: 0, gone: 0, planted: -1, done: -1 };
        for (let i = 0; i < fps * 900 && !P.done; i++) {
            for (const [what] of L.stepProcession(P, dt, T, spots, V.door, R)) { if (log[what] !== undefined && what !== 'planted' && what !== 'done') log[what]++; if (what === 'planted') log.planted = P.t + i * dt; if (what === 'done') log.done = i * dt; }
            const skiing = P.sk.filter(k => k.state === 'ski' && k.fall <= 0 && k.lag <= 0.5);
            // In order and apart: nobody upright passes the one ahead of them.
            for (let j = 1; j < skiing.length; j++) if (skiing[j].i === skiing[j - 1].i + 1 && !tumbles) assert.ok(skiing[j - 1].s - skiing[j].s >= P.gap - 0.6, `${fps} fps: skiers ${j - 1} and ${j} ${(skiing[j - 1].s - skiing[j].s).toFixed(1)} m apart`);
            for (const k of P.sk) if (k.state === 'ski') assert.ok(k.lit > 0, 'nobody goes down without a lit torch');
        }
        return { P, log };
    };
    const slow = run(10, 0), fast = run(120, 0);
    for (const { P, log } of [slow, fast]) {
        assert.ok(P.done, 'they all went in');
        assert.equal(log.off, 20); assert.equal(log.plant, 20); assert.equal(log.gone, 20);
        assert.ok(log.done > 0);
    }
    assert.ok(Math.abs(slow.log.done - fast.log.done) < 3, `the same descent at 10 and 120 fps: ${slow.log.done.toFixed(1)} s against ${fast.log.done.toFixed(1)} s`);
    // With tumbles, some sit down and every one of them gets up again; still they all come down.
    const tumbling = run(30, 1);
    assert.ok(tumbling.log.fall > 0 && tumbling.log.up === tumbling.log.fall && tumbling.P.done, `tumbles: ${JSON.stringify(tumbling.log)}`);
    // A hold stops the line where it is (the year on New Year's Eve).
    const R = seeded(9), P = L.procession(10, { random: R, gather: 0 });
    for (let i = 0; i < 300; i++) L.stepProcession(P, 0.1, T, spots, V.door, R);
    const before = P.sk.map(k => k.s);
    P.hold = { t: 20 };
    for (let i = 0; i < 100; i++) L.stepProcession(P, 0.1, T, spots, V.door, R);
    assert.deepEqual(P.sk.map(k => +k.s.toFixed(6)), before.map(s => +s.toFixed(6)), 'held');
    for (let i = 0; i < 200; i++) L.stepProcession(P, 0.1, T, spots, V.door, R);
    assert.ok(P.sk[0].s > before[0] + 10, 'and on again after');
});

test('the year in torches: every place on a stroke of a digit, inside the figure, for any year', () => {
    for (const year of [2027, 2030, 2041, 2099]) {
        const pts = L.yearFigure(year, 48, 800, 400, 120);
        assert.equal(pts.length, 48);
        for (const p of pts) assert.ok(p.x > 800 - 4 * 120 && p.x < 800 + 4 * 120 && p.y >= 400 - 60.01 && p.y <= 400 + 60.01, `${year}: a torch outside the figure`);
        const left = pts.filter(p => p.x < 800).length;
        assert.ok(left > 12 && left < 36, 'spread over all four digits');
    }
});

test('the calendar and the schedule: New Year’s Eve and its midnight; descents after dark, as the setting says', () => {
    const at = s => L.calendar(new Date(s));
    assert.equal(at('2026-12-31T17:00').newYear, false);
    const eve = at('2026-12-31T23:50');
    assert.ok(eve.newYear && Math.abs(eve.toMidnight - 600) < 1 && eve.year === 2027 && eve.season);
    const after = at('2027-01-01T00:10');
    assert.ok(after.newYear && Math.abs(after.toMidnight + 600) < 1 && after.year === 2027 && after.season, 'the tree stays up past New Year');
    assert.ok(!at('2027-01-01T02:00').newYear && !at('2027-01-08T12:00').season && at('2026-12-24T20:00').christmas);
    assert.ok(L.grandDue(eve, false) && !L.grandDue(eve, true) && !L.grandDue(at('2026-12-31T22:00'), false), 'the grand descent sets off in the last quarter hour, once');
    const o = { dark: 1, since: 200, gap: 2, minute: 7, ranToday: false };
    assert.ok(L.due('often', o) && !L.due('often', { ...o, since: 60 }) && !L.due('often', { ...o, dark: 0.2 }));
    assert.ok(!L.due('hourly', o) && L.due('hourly', { ...o, minute: 0 }));
    assert.ok(L.due('evening', o) && !L.due('evening', { ...o, ranToday: true }));
    assert.ok(!L.due('tap', o) && !L.due('newyear', o));
    // Shells, the same for a seed, inside the sky.
    const R1 = seeded(3), R2 = seeded(3);
    for (let i = 0; i < 50; i++) { const a = L.shell(R1), b = L.shell(R2); assert.deepEqual(a, b); assert.ok(a.fx > 0 && a.fx < 1 && a.fy > 0 && a.fy < 0.7 && L.SHELLS.includes(a.kind)); }
});
