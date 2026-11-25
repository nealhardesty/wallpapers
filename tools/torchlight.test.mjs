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

const TAU = Math.PI * 2;
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
    const { cam, V } = scene(1600, 900, 0), T = V.track, spots = L.planFinish(T, L.formation('heart', 20, V, cam));
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
        for (const k of P.sk) assert.ok(Math.abs(k.planted.x - spots[k.i].x) < 1e-9 && Math.abs(k.planted.z - spots[k.i].z) < 1e-9, 'each planted their own place');
    }
    assert.ok(Math.abs(slow.log.done - fast.log.done) < 3, `the same descent at 10 and 120 fps: ${slow.log.done.toFixed(1)} s against ${fast.log.done.toFixed(1)} s`);
    // With tumbles, some sit down and every one of them gets up again; still they all come down.
    const tumbling = run(30, 1);
    assert.ok(tumbling.log.fall > 0 && tumbling.log.up === tumbling.log.fall && tumbling.P.done, `tumbles: ${JSON.stringify(tumbling.log)}`);
    // A hold eases the line to a stop where it is (the year on New Year's Eve), and away again after.
    const R = seeded(9), P = L.procession(10, { random: R, gather: 0 });
    for (let i = 0; i < 300; i++) L.stepProcession(P, 0.1, T, spots, V.door, R);
    P.hold = { t: 20 };
    const before = P.sk.map(k => k.s);
    for (let i = 0; i < 40; i++) L.stepProcession(P, 0.1, T, spots, V.door, R);
    const stopped = P.sk.map(k => k.s);
    assert.ok(stopped.every((s, i) => s - before[i] < 3.5), `stopped within a few metres: ${stopped.map((s, i) => (s - before[i]).toFixed(1))}`);
    for (let i = 0; i < 60; i++) L.stepProcession(P, 0.1, T, spots, V.door, R);
    assert.deepEqual(P.sk.map(k => +k.s.toFixed(6)), stopped.map(s => +s.toFixed(6)), 'held');
    for (let i = 0; i < 200; i++) L.stepProcession(P, 0.1, T, spots, V.door, R);
    assert.ok(P.sk[0].s > stopped[0] + 10, 'and on again after');
});

// Every skier of a descent, watched on the screen at every step, as the cast
// draws them (TorchLogic.place): the bugs the owner saw were skiers jutting
// about, skiing off into the woods, in circles and back up the mountain.
const watch = (W, H, bottom, fps, o = {}) => {
    const { cam, V } = scene(W, H, bottom), T = V.track, shape = o.shape || 'heart', spots = L.planFinish(T, L.formation(shape, o.n || 24, V, cam));
    const R = seeded(o.seed || 11), P = L.procession(o.n || 24, { random: R, gap: 8, tumbles: o.tumbles ?? 1, gather: 10, shape }), dt = 1 / fps;
    const was = P.sk.map(() => null), worst = { up: 0, jump: 0, off: 0, back: 0, turn: 0 }, out = {}, seen = { fall: 0, glide: 0 };
    for (let i = 0; i < fps * 1200 && !P.done; i++) {
        const lastS = P.sk.map(k => k.s);
        for (const [what] of L.stepProcession(P, dt, T, spots, V.door, R)) if (what === 'fall') seen.fall++;
        for (const k of P.sk) {
            if (k.state === 'wait' || k.state === 'gone') { was[k.i] = null; continue; }
            if (k.state === 'glide') seen.glide++;
            const p = L.place(k, T, cam, out), prev = was[k.i];
            if (k.state === 'ski') {
                worst.back = Math.max(worst.back, lastS[k.i] - k.s);
                // On the piste: within the room either side, a metre of slack.
                const here = L.at(T, k.s, cam, {});
                worst.off = Math.max(worst.off, Math.abs(k.off) - here.room - 0.01);
            }
            if (prev && k.state !== 'leave' && prev.state !== 'leave') {
                worst.up = Math.max(worst.up, prev.y - p.y);
                // Never further in a step than the fastest anyone goes (5.5 m/s) at this scale, and a pixel.
                worst.jump = Math.max(worst.jump, Math.hypot(p.x - prev.x, p.y - prev.y) - (5.5 * dt * Math.max(p.sc, prev.sc) * 1.6 + 1));
            }
            was[k.i] = { x: p.x, y: p.y, sc: p.sc, state: k.state };
        }
    }
    return { P, worst, seen, T };
};

test('the procession on the screen: nobody climbs, jumps, goes backwards or leaves the piste, at 10, 30 and 120 fps, on any screen', () => {
    for (const [W, H, bottom] of SCREENS) for (const fps of [10, 30, 120]) {
        if (fps === 30 && W !== 1600) continue;
        const { P, worst, seen } = watch(W, H, bottom, fps, { shape: L.SHAPES[(W + fps) % L.SHAPES.length] });
        const at = `${W}×${H} at ${fps} fps`;
        assert.ok(P.done, `${at}: they all came down and went in`);
        assert.ok(worst.up < 0.05, `${at}: somebody went ${worst.up.toFixed(2)} px back up the picture`);
        assert.ok(worst.back < 1e-9, `${at}: somebody went ${worst.back.toFixed(3)} m back up the track`);
        assert.ok(worst.jump < 0.01, `${at}: a jump of ${worst.jump.toFixed(2)} px beyond anyone's pace`);
        assert.ok(worst.off < 1e-9, `${at}: somebody ${worst.off.toFixed(2)} m off the piste`);
        assert.ok(seen.fall > 0 && seen.glide > 0, `${at}: ${JSON.stringify(seen)}`);
    }
});

test('the track stays inside its corridor, and tumbles only happen where it is steep', () => {
    for (const [W, H, bottom] of SCREENS) {
        const { cam, V } = scene(W, H, bottom), T = V.track, C = V.corridor;
        for (const p of T.pts) if (!p.ground) {
            const t = C.tOf(p.y), edge = C.edge(t, cam.sc(p.z));
            assert.ok(Math.abs(p.x - C.cx(t)) <= edge, `${W}×${H}: the track leaves its corridor at y ${p.y.toFixed(0)}`);
            assert.ok(p.room >= 2, 'room to step aside');
        }
        assert.ok(T.pts.filter(p => p.steep > 0.5).length > 20, `${W}×${H}: steep stretches to fall on`);
    }
    const { cam, V } = scene(1600, 900, 0), T = V.track, spots = L.planFinish(T, L.formation('ring', 16, V, cam));
    const R = seeded(3), P = L.procession(16, { random: R, tumbles: 1, gather: 0 });
    let falls = 0;
    for (let i = 0; i < 30 * 700 && !P.done; i++) for (const [what, k] of L.stepProcession(P, 1 / 30, T, spots, V.door, R)) if (what === 'fall') { falls++; assert.ok(L.near(T, P.sk[k].s).steep > 0.5, 'a fall on a traverse'); }
    assert.ok(falls > 2);
});

test('the finish: each peels off the run-out where it passes their place and glides there, only ever toward us, slowing to a stop', () => {
    for (const [W, H, bottom] of SCREENS) {
        const { cam, V } = scene(W, H, bottom), T = V.track;
        for (const shape of L.SHAPES) {
            const spots = L.planFinish(T, L.formation(shape, 30, V, cam));
            for (let i = 1; i < spots.length; i++) assert.ok(spots[i].peel >= spots[i - 1].peel, 'the first down peels off first');
            for (const sp of spots) {
                assert.ok(sp.peel > T.pts[T.faceEnd].m && sp.peel <= T.length, `${W}×${H}: a ${shape}'s peel off the meadow`);
                const G = L.glide(T, sp.peel, 0.7, sp, 3.4), start = L.near(T, sp.peel);
                assert.ok(Math.abs(G.B[0][0] - (start.xm + 0.7)) < 1e-9 && Math.abs(G.B[0][1] - start.z) < 1e-9, 'it starts where the skier is');
                let prev = L.glideAt(G, 0, T.zm), lastStep = 0.1 * 3.4 + 1e-6;
                for (let t = 0.1; t <= G.T + 0.2; t += 0.1) {
                    const q = L.glideAt(G, t, T.zm), step = Math.hypot(q[0] - prev[0], (q[1] - prev[1]) * T.zm);
                    assert.ok(q[1] <= prev[1] + 1e-9, `${W}×${H}: a ${shape}'s glide goes away from us`);
                    assert.ok(step <= lastStep + 0.03, `${W}×${H}: a glide that speeds up (${step.toFixed(3)} after ${lastStep.toFixed(3)})`);
                    lastStep = step; prev = q;
                }
                assert.ok(Math.abs(prev[0] - sp.x) < 1e-6 && Math.abs(prev[1] - sp.z) < 1e-6, 'and it stops on its place');
            }
        }
    }
});

test('the runs: the torch run, a red and a blue, each from under the summit to the bottom, down the picture only, on the mountain', () => {
    for (const [W, H, bottom] of SCREENS) {
        const { cam, V } = scene(W, H, bottom), M = V.mountain;
        assert.deepEqual(V.runs.map(r => r.kind), ['torch', 'red', 'blue']);
        for (const R of V.runs) {
            const P = R.pts;
            assert.ok(P[0].y < M.top + (M.footY - M.top) * 0.25, `${W}×${H}: the ${R.kind} starts high`);
            for (let i = 1; i < P.length; i++) {
                assert.ok(P[i].m > P[i - 1].m && P[i].y >= P[i - 1].y - 1e-9, `${W}×${H}: the ${R.kind} goes back up at ${i}`);
                assert.ok(Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y) < 30 * cam.u, `${W}×${H}: a jump in the ${R.kind}`);
                if (!P[i].ground) assert.ok(P[i].y > M.skyAt(P[i].x) + 4 * cam.u && P[i].y <= M.footY + 2, `${W}×${H}: the ${R.kind} off the mountain at ${i}`);
            }
            const end = P[P.length - 1];
            if (R.exit === 'lift') assert.ok(Math.hypot(end.x - V.lift.x0, end.y - V.lift.y0) < 40 * cam.u, `${W}×${H}: the red ends at the lift`);
            else assert.ok(Math.abs(end.xm - V.track.pts[V.track.pts.length - 1].xm) < 1e-6, `${W}×${H}: the ${R.kind} ends at the finish`);
        }
    }
});

test('skiers by day: on every run, at any pace and frame rate, they turn smoothly, stay on the piste and never climb', () => {
    for (const [W, H, bottom] of SCREENS) {
        const { cam, V } = scene(W, H, bottom);
        for (const R of V.runs) for (const fps of [10, 120]) for (const [amp, wave, phase, v] of [[3, 40, 0, 5], [7, 60, 2, 9], [7, 40, 4.4, 7]]) {
            let prev = null, prevDir = null, chord = null, worstUp = 0, worstOff = 0, worstTurn = 0, worstJump = 0;
            for (let s = 0; s < R.length; s += v / fps) {
                const p = L.lane(R, s, phase, amp, wave, cam, {}), centre = L.at(R, s, cam, {});
                worstOff = Math.max(worstOff, Math.abs(p.x - centre.x) - (centre.ground ? 8 : centre.room + 3) * centre.sc);
                // Turns are measured in metres: on the face on the screen (a metre is FACE_M pixels by the scale), on the meadow across and in depth.
                if (prev && prev.ground !== p.ground) { prevDir = null; prev = null; chord = null; }
                if (prev) {
                    // And no jumps: never further in a step than going down it and swinging across at full tilt.
                    worstJump = Math.max(worstJump, Math.hypot(p.x - prev.x, p.y - prev.y) - (v / fps) * p.sc * 1.4 * (1 + TAU * amp / wave) - 0.5);
                    worstUp = Math.max(worstUp, prev.y - p.y);
                    const c = chord, dx = p.ground ? p.xm + p.off - c.xm : p.x - c.x, dy = p.ground ? (p.z - c.z) * cam.zm : p.y - c.y, d = p.ground ? Math.hypot(dx, dy) : Math.hypot(dx, dy) / p.sc * L.FACE_M;
                    // The heading over a metre's chord, against the last metre's.
                    if (d >= 1) { const dir = Math.atan2(dy, dx); if (prevDir != null) { let a = Math.abs(dir - prevDir); a = Math.min(a, 2 * Math.PI - a); worstTurn = Math.max(worstTurn, a / d); } prevDir = dir; chord = null; }
                }
                if (!chord || !prev) chord = { x: p.x, y: p.y, xm: p.ground ? p.xm + p.off : 0, z: p.z, ground: p.ground };
                prev = { x: p.x, y: p.y, ground: p.ground };
            }
            const at = `${W}×${H}: the ${R.kind} at ${fps} fps`;
            assert.ok(worstUp < 1e-6, `${at}: a skier climbed ${worstUp.toFixed(3)} px`);
            assert.ok(worstOff < 1e-6, `${at}: a skier ${worstOff.toFixed(2)} px off the piste`);
            assert.ok(worstTurn < 1.2, `${at}: a turn of ${worstTurn.toFixed(2)} rad a metre`);
            assert.ok(worstJump < 1e-6, `${at}: a jump of ${worstJump.toFixed(2)} px`);
        }
    }
});

test('the year on the mountain: everyone gets a place, none above where they stopped; and back to the track below it after', () => {
    const { cam, V } = scene(1600, 900, 0), T = V.track, Y = V.year;
    const points = L.yearFigure(2027, 48, Y.cx, Y.cy, Y.h);
    for (const p of points) assert.ok(p.y > V.mountain.skyAt(p.x) && p.y < V.mountain.footY, 'the year is on the mountain');
    // The line, stopped with its leader below the figure, everyone on the face.
    const below = T.pts.find(p => p.y >= Y.cy + Y.h / 2 - 4 * cam.u), gap = (below.m - 25) / 47;
    const skiers = Array.from({ length: 48 }, (_, i) => { const p = L.near(T, below.m - i * gap); return { i, x: p.x, y: p.y, s: below.m - i * gap }; });
    const places = L.assignFigure(points, skiers);
    assert.equal(places.size, 48);
    let lifted = 0;
    for (const k of skiers) { const f = places.get(k.i); assert.ok(f.y >= k.y, 'nobody climbs to their place'); if (f.lifted) lifted++; }
    assert.ok(lifted <= 4, `${lifted} places moved down to keep anyone from climbing`);
    for (const k of skiers) { const f = places.get(k.i), s = L.rejoin(T, k.s, f.y); assert.ok(s >= k.s && L.near(T, s).y >= f.y - 1e-6, 'back onto the track below'); }
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
