// Torchlight Descent's pure logic: where we stand (a camera, in metres),
// where everything is put for a screen of a given shape, the line the
// skiers take down the mountain and along the run-out, the procession and
// its tumbles, what they plant at the bottom, the figures they make, and
// which evening is which. No DOM in here, so tools/torchlight.test.mjs can
// run it in Node. The light itself is Painted Village's (PaintedLogic.light).

const TorchLogic = (() => {
    const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
    const lerp = (a, b, t) => a + (b - a) * t;
    const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
    const TAU = Math.PI * 2;

    // ---- The camera -------------------------------------------------------------
    // We stand on a rise across the valley from the mountain, the eye 13 m up,
    // looking level. Depth is `z`: 1 at the bottom of the picture, growing to
    // the horizon, `zm` metres to the unit. Ground at depth z is drawn at
    // sy(z); a thing standing there is sc(z) pixels to the metre. The
    // mountain is far: it has no ground we can see, so each place on its face
    // is given the depth that puts the right air in front of it (faceZ). A
    // phone held upright stands a little higher and gives the mountain more of
    // the picture. The same shape as PaintedLogic.camera, so its plates and
    // bake take it as it is.
    const Z_FOOT = 7.5, Z_TOP = 24;
    function camera(W, H, bottom = 0, horizon = 0.5) {
        const Hu = H - bottom, aspect = W / Hu;
        const kind = aspect < 0.9 ? 'upright' : aspect > 2.15 ? 'panorama' : 'wide';
        const hor = Hu * clamp(kind === 'upright' ? horizon + 0.06 : horizon, 0.3, 0.7), f = Hu - hor, u = Hu / 900;
        const eye = kind === 'upright' ? 17 : 13 * clamp(1.74 / aspect, 1, 1.5);
        const ppm = f / eye, foc = 1100 * u, zm = eye * foc / f;
        const cam = { W, H, Hu, aspect, kind, hor, f, u, eye, ppm, zm };
        cam.sy = z => hor + f / z;
        cam.sc = z => ppm / z;
        cam.sx = (x, z) => W / 2 + x * ppm / z;
        cam.zAt = y => f / Math.max(1e-3, y - hor);
        cam.xAt = (px, z) => (px - W / 2) * z / ppm;
        cam.at = (frac, z) => (frac - 0.5) * W * z / ppm;
        cam.half = z => W / 2 * z / ppm;
        cam.dz = m => m / zm;
        cam.pt = (x, y, z) => [W / 2 + x * ppm / z, hor + f / z - y * ppm / z];
        return cam;
    }

    // ---- The mountain -----------------------------------------------------------
    // In pixels, since it is far: the summit, how wide the face is at each
    // height, and the depth each height is given (for size and for air).
    function mountainOf(cam) {
        const { W, hor, u } = cam, up = cam.kind === 'upright';
        const footY = cam.sy(Z_FOOT) - 4 * u;
        const top = hor - hor * (up ? 0.76 : 0.74);
        const cx = W * (up ? 0.5 : cam.kind === 'panorama' ? 0.42 : 0.4);
        const half = W * (up ? 0.46 : cam.kind === 'panorama' ? 0.3 : 0.36);
        return { cx, top, footY, half, faceZ: y => lerp(Z_FOOT, Z_TOP, clamp((footY - y) / (footY - top))) };
    }

    // ---- What is where ----------------------------------------------------------
    // Metres across (x, 0 under the middle of the picture) and depth (z) for
    // what stands in the valley; pixels for what is up on the mountain. What
    // stands still stands just nearer than one of the BANDS, so that whoever
    // walks behind it is hidden by it.
    const BANDS = [1.22, 1.68, 2.14, 2.9, 4.3];
    function layout(cam, config = {}) {
        const on = key => config[key] !== false;
        const up = cam.kind === 'upright', M = mountainOf(cam);
        const L = { kind: cam.kind, bands: BANDS, mountain: M, chalets: [], firs: [], lamps: [] };
        // The afterglow, low over the far peaks to the right, where the sun went down.
        L.glow = { x: up ? 0.7 : 0.74, y: cam.hor - Math.min(cam.hor * 0.32, 150 * cam.u) };
        // The summit hut, where the torches are lit; the top of the lift beside it.
        L.hut = { x: M.cx + (up ? -0.04 : -0.035) * cam.W, y: M.top + 30 * cam.u };
        // The inn at the foot of the run, to one side of the picture; its door, and the finish in front of it.
        const innZ = 1.62, innX = up ? cam.at(0.3, innZ) : cam.at(0.19, innZ);
        L.inn = on('inn') ? { x: innX, z: innZ, w: up ? 15 : 19, side: 1 } : null;
        L.door = { x: innX + (up ? 2 : 3.6), z: innZ - cam.dz(1.2) };
        L.finish = { x: up ? cam.at(0.64, 2.4) : cam.at(0.56, 2.3), z: up ? 2.4 : 2.3 };
        // The run-out: from the mountain's foot down across the meadow to the finish.
        const foot = runFoot(cam, M);
        L.run = [[foot.x, Z_FOOT], [lerp(foot.x, L.finish.x, 0.35) + (up ? 4 : 10), 5.2], [lerp(foot.x, L.finish.x, 0.75) - (up ? 2 : 6), 3.6], [L.finish.x, L.finish.z + cam.dz(4)]];
        L.track = track(cam, M, L);
        // The lift: from its station at the foot, beside the run, straight up to the hut.
        L.lift = { x0: M.cx + M.half * (up ? 0.34 : 0.3), y0: M.footY - 6 * cam.u, x1: L.hut.x + 26 * cam.u, y1: L.hut.y + 6 * cam.u };
        L.garage = { x: cam.at(up ? 0.84 : 0.72, 6.4), z: 6.4 };
        if (on('chapel')) L.chapel = { x: cam.at(up ? 0.82 : 0.86, 3.6), z: 3.6 };
        // The houses of the valley, scattered, none on the run or in front of the inn.
        const spots = up
            ? [[0.12, 3.4], [0.9, 4.6], [0.24, 5.4], [0.62, 6.1], [0.08, 6.6], [0.44, 7.0]]
            : [[0.06, 3.3], [0.37, 3.9], [0.95, 4.9], [0.3, 5.6], [0.66, 6.6], [0.1, 6.4], [0.5, 7.1], [0.82, 7.4], [0.2, 7.6], [0.98, 3.2]];
        const count = Math.round(config.chalets ?? spots.length);
        for (const [fx, z] of spots) {
            if (L.chalets.length >= count) break;
            const x = cam.at(fx, z);
            if (clearOfRun(L, cam, x, z, 9) && !(L.chapel && Math.abs(x - L.chapel.x) < 16 && Math.abs(z - L.chapel.z) < 1.2)) L.chalets.push({ x, z, w: 9 + (L.chalets.length % 3) * 1.4, i: L.chalets.length });
        }
        // Firs about the valley, and the near ones we look past in the corners.
        const firSpots = up ? [[0.04, 2.2, 12], [0.96, 2.3, 11], [0.5, 4.2, 10], [0.18, 4.5, 11], [0.74, 5.2, 10], [0.36, 3.2, 9]]
            : [[0.43, 2.6, 11], [0.1, 2.35, 12], [0.73, 3.2, 10], [0.52, 4.4, 11], [0.86, 5.6, 10], [0.24, 4.7, 11], [0.6, 5.3, 9], [0.04, 4.0, 12], [0.97, 2.6, 12], [0.33, 6.0, 10], [0.78, 2.3, 9]];
        for (const [fx, z, h] of firSpots) { const x = cam.at(fx, z); if (clearOfRun(L, cam, x, z, 5) && !(L.inn && Math.abs(x - L.inn.x) < L.inn.w / 2 + 4 && Math.abs(z - L.inn.z) < 0.5)) L.firs.push({ x, z, h }); }
        L.near = up ? [[0.03, 1.1, 13], [0.97, 1.14, 12]] : [[0.02, 1.08, 13], [0.1, 1.2, 9.5], [0.97, 1.1, 12.5], [0.905, 1.22, 8.6]];
        L.near = L.near.map(([fx, z, h]) => ({ x: cam.at(fx, z), z, h }));
        // Lamps by the finish and along the way to the inn's door.
        if (on('lamps')) for (const t of [0.2, 0.55, 0.9]) { const x = lerp(L.door.x + 4, L.finish.x - 8, t), z = lerp(innZ + 0.04, 2.1, t); L.lamps.push({ x, z }); }
        if (on('tree')) L.tree = { x: (L.inn ? L.inn.x + L.inn.w / 2 + 7 : cam.at(0.3, 2.05)), z: 2.08, h: 8.5 };
        // A split-rail fence across the near meadow, and snowy bushes about it.
        L.fence = up ? { from: [cam.at(0.55, 1.32), 1.32], to: [cam.at(1.05, 1.18), 1.18] } : { from: [cam.at(0.6, 1.36), 1.36], to: [cam.at(1.03, 1.18), 1.18] };
        L.bushes = [];
        for (const [fx, z] of up ? [[0.2, 1.4], [0.78, 1.5], [0.5, 1.9]] : [[0.36, 1.3], [0.46, 1.55], [0.7, 1.7], [0.82, 1.42], [0.28, 2.0], [0.9, 2.2], [0.66, 1.28]]) { const x = cam.at(fx, z); if (clearOfRun(L, cam, x, z, 2)) L.bushes.push({ x, z }); }
        L.road = { z: 4.05 };
        return L;
    }
    // Where the run leaves the mountain: below the last turn of the piste, in metres at the foot's depth.
    function runFoot(cam, M) { const px = M.cx + M.half * (cam.kind === 'upright' ? 0.1 : 0.12); return { x: cam.xAt(px, Z_FOOT), px }; }
    function clearOfRun(L, cam, x, z, room) {
        for (let i = 0; i < L.run.length - 1; i++) {
            const [ax, az] = L.run[i], [bx, bz] = L.run[i + 1];
            for (let t = 0; t <= 1; t += 0.1) { const rx = lerp(ax, bx, t), rz = lerp(az, bz, t); if (Math.abs(rx - x) < room + 4 && Math.abs(rz - z) * cam.zm < room + 6) return false; }
        }
        return !(Math.abs(L.finish.x - x) < room + 14 && Math.abs(L.finish.z - z) * cam.zm < room + 14);
    }

    // ---- The line the skiers take -----------------------------------------------
    // The piste down the face in switchbacks, then the run-out across the
    // meadow, as a dense line of points: [x, y] pixels, the depth there, and
    // metres from the top (m). On the face a metre is so many pixels by the
    // depth the face is given there; on the meadow by the camera.
    function piste(cam, M) {
        const up = cam.kind === 'upright', legs = up ? 7 : 6, out = [];
        const hut = { x: M.cx - (up ? 0.04 : 0.035) * cam.W, y: M.top + 30 * cam.u };
        const foot = runFoot(cam, M);
        out.push([hut.x + 8 * cam.u, hut.y + 4 * cam.u]);
        for (let j = 1; j <= legs; j++) {
            const t = j / legs, y = lerp(hut.y + 10 * cam.u, M.footY - 10 * cam.u, t ** 0.92);
            const hw = M.half * lerp(0.1, 0.52, t) * (up ? 1.1 : 1);
            out.push([M.cx + (j % 2 ? -1 : 1) * hw + (up ? 0 : M.half * 0.04), y]);
        }
        out.push([foot.px, M.footY]);
        return out;
    }
    function track(cam, M, L) {
        const corners = piste(cam, M), pts = [];
        // Rounded turns: a quadratic through each corner, from midpoint to midpoint.
        const mids = [corners[0]];
        for (let i = 0; i < corners.length - 1; i++) mids.push([(corners[i][0] + corners[i + 1][0]) / 2, (corners[i][1] + corners[i + 1][1]) / 2]);
        mids.push(corners[corners.length - 1]);
        for (let i = 0; i < mids.length - 1; i++) {
            const a = mids[i], b = mids[i + 1], c = corners[i] === corners[0] && i === 0 ? a : corners[i];
            const n = Math.max(6, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (3 * cam.u)));
            for (let k = i ? 1 : 0; k <= n; k++) { const t = k / n, q = 1 - t; pts.push({ x: q * q * a[0] + 2 * q * t * c[0] + t * t * b[0], y: q * q * a[1] + 2 * q * t * c[1] + t * t * b[1], ground: false }); }
        }
        for (const p of pts) p.z = M.faceZ(p.y);
        // The run-out, a smooth line through its points on the ground.
        const R = L.run, n = 80;
        for (let k = 1; k <= n; k++) {
            const t = k / n * (R.length - 1), i = Math.min(R.length - 2, Math.floor(t)), f = t - i;
            const p0 = R[Math.max(0, i - 1)], p1 = R[i], p2 = R[i + 1], p3 = R[Math.min(R.length - 1, i + 2)];
            const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (-a + 3 * b - 3 * c + d) * f * f * f);
            const x = cr(p0[0], p1[0], p2[0], p3[0]), z = cr(p0[1], p1[1], p2[1], p3[1]);
            pts.push({ x: cam.sx(x, z), y: cam.sy(z), z, xm: x, ground: true });
        }
        // Metres from the top.
        let m = 0;
        pts[0].m = 0;
        for (let i = 1; i < pts.length; i++) {
            const a = pts[i - 1], b = pts[i];
            m += b.ground && a.ground ? Math.hypot(b.xm - a.xm, (b.z - a.z) * cam.zm) : Math.hypot(b.x - a.x, b.y - a.y) / cam.sc((a.z + b.z) / 2) * (b.ground ? 1 : 1.35);
            b.m = m;
        }
        return { pts, length: m, faceEnd: pts.findIndex(p => p.ground), zm: cam.zm };
    }
    // Where `s` metres down the track is: pixels, depth, pixels to the metre,
    // the way it runs (radians on the screen), and whether it is on the meadow.
    function at(T, s, cam, out = {}) {
        const P = T.pts, x = clamp(s, 0, T.length);
        let lo = 0, hi = P.length - 1;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (P[mid].m <= x) lo = mid; else hi = mid; }
        const a = P[lo], b = P[hi], t = b.m > a.m ? (x - a.m) / (b.m - a.m) : 0;
        out.x = lerp(a.x, b.x, t); out.y = lerp(a.y, b.y, t); out.z = lerp(a.z, b.z, t); out.ground = b.ground && a.ground;
        out.sc = cam.sc(out.z); out.dir = Math.atan2(b.y - a.y, b.x - a.x);
        out.xm = out.ground ? lerp(a.xm, b.xm, t) : cam.xAt(out.x, out.z);
        return out;
    }

    // ---- The procession ---------------------------------------------------------
    // n skiers in a line, `gap` metres apart, the first leading at `v` m/s.
    // They gather at the hut first, lighting their torches one by one; then
    // go down in the same snaking line, everyone following the leader's turns.
    // Now and then one sits down in the snow, gets up and catches up. At the
    // bottom each walks to a place in the figure and plants the torch there.
    const PACE = 3.4;
    function procession(n, o = {}) {
        const R = o.random || Math.random, sk = [];
        for (let i = 0; i < n; i++) sk.push({ i, s: 0, lag: 0, state: 'wait', t: 0, fall: 0, lit: 0, side: R() < 0.5 ? -1 : 1, coat: Math.floor(R() * 1e6), kid: i === n - 1 && n > 4, tumble: R(), x: 0, z: 0, planted: null, wob: R() * TAU });
        if (n) sk[0].guide = true;
        return { n, sk, lead: -(o.gather ?? 0), v: PACE * (o.pace || 1), gap: o.gap || 9, phase: 'gather', t: 0, hold: null, done: false, tumbles: o.tumbles ?? 0.35, shape: o.shape || 'line', grand: !!o.grand };
    }
    // How far down skier i should be, with the line `lead` metres down.
    const slot = (P, i) => P.lead - i * P.gap;
    // One step. T: the track; spots: where each plants a torch ([{x, z}] in
    // metres, from formation()); door: where they go in after. Returns events.
    function stepProcession(P, dt, T, spots, door, R = Math.random) {
        const ev = [];
        P.t += dt;
        if (P.hold) { P.hold.t -= dt; if (P.hold.t <= 0) P.hold = null; }
        if (!P.hold) P.lead += P.v * dt;
        let atBottom = 0, gone = 0;
        for (const k of P.sk) {
            const want = slot(P, k.i);
            if (k.state === 'wait') {
                // Up at the hut: each lights a torch as the one before goes, then sets off.
                k.lit = Math.min(1, k.lit + dt * (want > -P.gap * 3 ? 0.8 : 0));
                if (want > 0) { k.state = 'ski'; ev.push(['off', k.i]); }
                continue;
            }
            if (k.state === 'ski') {
                k.lit = Math.min(1, k.lit + dt);
                if (k.fall > 0) {
                    // Sat down in the snow: torch still up, of course. Then up again, and catching up.
                    k.fall -= dt;
                    if (k.fall <= 0) ev.push(['up', k.i]);
                    k.lag = want - k.s;
                    continue;
                }
                if (!P.hold && P.tumbles > 0 && k.s > 40 && k.s < T.length - 60 && R() < P.tumbles * dt / 160) { k.fall = 2.4 + R() * 2; ev.push(['fall', k.i]); continue; }
                const target = P.hold ? k.s : want;
                if (k.s < target) k.s = Math.min(target, k.s + P.v * dt * (target - k.s > 1 ? 1.6 : 1));
                if (k.s >= T.length) { arrive(k, T); k.state = 'walk'; k.planted = spots[k.i % Math.max(1, spots.length)] || { x: 0, z: 2.5 }; ev.push(['in', k.i]); }
                continue;
            }
            if (k.state === 'walk') {
                const dx = k.planted.x - k.x, dz = (k.planted.z - k.z) * T.zm, d = Math.hypot(dx, dz), step = 1.7 * dt;
                if (d <= step) { k.x = k.planted.x; k.z = k.planted.z; k.state = 'stand'; k.t = 0; ev.push(['plant', k.i]); }
                else { k.x += dx / d * step; k.z += dz / d * step / T.zm; k.dir = Math.sign(dx) || k.dir || 1; }
                continue;
            }
            if (k.state === 'stand') { k.t += dt; atBottom++; continue; }
            if (k.state === 'leave') {
                const dx = door.x - k.x, dz = (door.z - k.z) * T.zm, d = Math.hypot(dx, dz), step = 1.4 * dt;
                if (d <= step) { k.state = 'gone'; ev.push(['gone', k.i]); }
                else { k.x += dx / d * step; k.z += dz / d * step / T.zm; k.dir = Math.sign(dx) || k.dir || 1; }
                continue;
            }
            if (k.state === 'gone') gone++;
        }
        // Everyone down and their torches planted: a while to admire it, then in for a warm.
        if (P.phase !== 'planted' && atBottom === P.n) { P.phase = 'planted'; P.t = 0; ev.push(['planted']); }
        if (P.phase === 'gather' && P.sk.some(k => k.state === 'ski')) P.phase = 'down';
        if (P.phase === 'planted' && P.t > (P.linger ?? 50)) { P.phase = 'leave'; for (const k of P.sk) if (k.state === 'stand') k.state = 'leave'; ev.push(['leave']); }
        if (P.phase === 'leave' && gone === P.n) { P.done = true; ev.push(['done']); }
        return ev;
    }
    // Skier positions as the run-out would put them on arriving: their walk starts where the track ends.
    function arrive(k, T) { const e = T.pts[T.pts.length - 1]; k.x = e.xm; k.z = e.z; }

    // ---- The figure the torches make at the bottom --------------------------------
    // n places, in metres across and depth, about the finish: a heart, a ring,
    // a star, or a row along the run-out. Laid on the ground, so seen from here
    // a figure is foreshortened: it is laid out nearly twice as deep as it is wide, to read.
    const SHAPES = ['heart', 'ring', 'star', 'line'];
    function formation(shape, n, L, cam) {
        const c = L.finish, out = [], w = 26, d = cam.dz(cam.kind === 'upright' ? 44 : 60);
        const put = (u, v) => out.push({ x: c.x + u * w, z: c.z + v * d });
        if (n <= 0) return out;
        if (shape === 'line') {
            // Both sides of the last of the run-out, like a guard of honour.
            const R = L.run, a = R[R.length - 2], b = R[R.length - 1];
            for (let i = 0; i < n; i++) { const side = i % 2 ? 1 : -1, t = Math.floor(i / 2) / Math.max(1, Math.ceil(n / 2) - 1); out.push({ x: lerp(b[0], a[0], t * 0.9) + side * 3.2, z: lerp(b[1], a[1], t * 0.9) }); }
            return out;
        }
        const curve = shape === 'heart' ? t => { const a = t * TAU; return [16 * Math.sin(a) ** 3 / 17, (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 17]; }
            : shape === 'star' ? t => { const a = t * TAU, k = Math.floor(t * 10), f = t * 10 - k, r0 = k % 2 ? 0.42 : 1, r1 = k % 2 ? 1 : 0.42, a0 = k / 10 * TAU, a1 = (k + 1) / 10 * TAU, x0 = Math.sin(a0) * r0, y0 = Math.cos(a0) * r0, x1 = Math.sin(a1) * r1, y1 = Math.cos(a1) * r1; return [lerp(x0, x1, f), lerp(y0, y1, f)]; }
                : t => [Math.sin(t * TAU), Math.cos(t * TAU)];
        // Evenly by length round the outline.
        const N = 400, pts = [], len = [0];
        for (let i = 0; i <= N; i++) pts.push(curve(i / N));
        for (let i = 1; i <= N; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
        const total = len[N];
        for (let i = 0, j = 0; i < n; i++) {
            const want = i / n * total;
            while (j < N - 1 && len[j + 1] < want) j++;
            const f = (want - len[j]) / Math.max(1e-9, len[j + 1] - len[j]);
            put(lerp(pts[j][0], pts[j + 1][0], f) * 0.5, -lerp(pts[j][1], pts[j + 1][1], f) * 0.5);
        }
        return out;
    }

    // The year, in torches on the mountain: four digits drawn as strokes, n
    // places evenly along them, in pixels about (cx, cy), `h` pixels tall.
    const DIGITS = {
        0: [[[0, 0], [1, 0], [1, 2], [0, 2], [0, 0]]], 1: [[[0.3, 0.4], [0.6, 0], [0.6, 2]]], 2: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 2], [1, 2]]], 3: [[[0, 0], [1, 0], [1, 2], [0, 2]], [[0.2, 1], [1, 1]]],
        4: [[[0, 0], [0, 1], [1, 1]], [[1, 0], [1, 2]]], 5: [[[1, 0], [0, 0], [0, 1], [1, 1], [1, 2], [0, 2]]], 6: [[[1, 0], [0, 0], [0, 2], [1, 2], [1, 1], [0, 1]]], 7: [[[0, 0], [1, 0], [0.45, 2]]],
        8: [[[0, 0], [1, 0], [1, 2], [0, 2], [0, 0]], [[0, 1], [1, 1]]], 9: [[[1, 1], [0, 1], [0, 0], [1, 0], [1, 2], [0, 2]]],
    };
    function yearFigure(year, n, cx, cy, h) {
        const strokes = [], text = String(year), cw = h * 0.5, gap = h * 0.32, width = text.length * cw + (text.length - 1) * gap;
        [...text].forEach((ch, i) => { for (const s of DIGITS[ch] || []) strokes.push(s.map(([x, y]) => [cx - width / 2 + i * (cw + gap) + x * cw, cy - h / 2 + y * h / 2])); });
        const segs = [];
        for (const s of strokes) for (let i = 0; i < s.length - 1; i++) segs.push([s[i], s[i + 1], Math.hypot(s[i + 1][0] - s[i][0], s[i + 1][1] - s[i][1])]);
        const total = segs.reduce((a, s) => a + s[2], 0), out = [];
        // Every stroke gets a torch at each end; the rest spread by length.
        for (let i = 0; i < n; i++) {
            let want = (i + 0.5) / n * total, k = 0;
            while (k < segs.length - 1 && want > segs[k][2]) { want -= segs[k][2]; k++; }
            const [a, b, l] = segs[k], f = clamp(want / l);
            out.push({ x: lerp(a[0], b[0], f), y: lerp(a[1], b[1], f) });
        }
        return out;
    }

    // ---- Which evening is which -------------------------------------------------
    // New Year's Eve runs from six in the evening of the 31st to one in the
    // morning; the grand descent sets off at 23:44, so that the year is spelt
    // on the mountain at midnight, and the fireworks go up at the stroke of it.
    function calendar(date) {
        const m = date.getMonth(), d = date.getDate(), h = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
        const eve = m === 11 && d === 31 && h >= 18, morning = m === 0 && d === 1 && h < 1;
        // Seconds to (or since, negative) the new year's midnight.
        let toMidnight = null;
        if (eve) toMidnight = (24 - h) * 3600;
        if (morning) toMidnight = -h * 3600;
        // The season, for the tree and the candles: from the end of November to Epiphany.
        const season = m === 11 || (m === 0 && d <= 6) || (m === 10 && d >= 28);
        return { newYear: eve || morning, toMidnight, year: m === 11 ? date.getFullYear() + 1 : date.getFullYear(), christmas: m === 11 && (d === 24 || d === 25), season };
    }
    // Whether a descent should set off now. mode: 'often' (one after another,
    // `gap` minutes apart, after dark), 'hourly' (on the hour, after dark),
    // 'evening' (once, as night falls), 'newyear' (only the grand one), 'tap'
    // (only when called). since: seconds since the last one finished (Infinity
    // if none); minute: the clock's minute; ranToday: one has run this evening.
    function due(mode, o) {
        if (mode === 'tap' || mode === 'newyear') return false;
        if (o.dark < 0.55) return false;
        if (mode === 'hourly') return o.minute === 0 && o.since > 120;
        if (mode === 'evening') return !o.ranToday;
        return o.since >= (o.gap ?? 2) * 60;
    }
    // The grand descent: when it should be under way (seconds to midnight, from the calendar).
    const GRAND_AT = 16 * 60;
    const grandDue = (cal, running) => cal.newYear && cal.toMidnight != null && cal.toMidnight <= GRAND_AT && cal.toMidnight > 60 && !running;

    // ---- Fireworks ----------------------------------------------------------------
    // A shell: where it bursts (shares of the width and of the sky's height),
    // what kind, what colour; deterministic for a seed so the tests can count them.
    const SHELLS = ['peony', 'willow', 'ring', 'crackle', 'palm'];
    const FIRE_COLOURS = [[1, 0.36, 0.3], [1, 0.82, 0.36], [0.4, 0.8, 1], [0.7, 0.45, 1], [0.45, 1, 0.55], [1, 0.95, 0.9], [1, 0.55, 0.78]];
    function shell(R) { return { fx: 0.12 + 0.76 * R(), fy: 0.18 + 0.42 * R(), kind: SHELLS[Math.floor(R() * SHELLS.length)], c: FIRE_COLOURS[Math.floor(R() * FIRE_COLOURS.length)], c2: FIRE_COLOURS[Math.floor(R() * FIRE_COLOURS.length)], size: 0.7 + 0.6 * R() }; }

    return { clamp, lerp, smooth, TAU, camera, mountainOf, layout, piste, track, at, procession, stepProcession, arrive, slot, formation, yearFigure, calendar, due, grandDue, GRAND_AT, shell, SHELLS, SHAPES, BANDS, Z_FOOT, Z_TOP, PACE };
})();
