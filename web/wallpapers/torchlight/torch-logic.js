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

    // ---- Noise ------------------------------------------------------------------
    // Value noise from a hash, the same everywhere for the same numbers: the
    // mountain's skyline and its ribs are the same in the tests as on screen.
    const hash = (i, j, s) => { let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
    function noise(x, y, s = 0) {
        const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, a = fx * fx * (3 - 2 * fx), b = fy * fy * (3 - 2 * fy);
        const p = hash(i, j, s), q = hash(i + 1, j, s), r = hash(i, j + 1, s), t = hash(i + 1, j + 1, s);
        return (p + (q - p) * a + (r - p) * b + (p - q - r + t) * a * b) * 2 - 1;
    }
    function fbm(x, y, s = 0, oct = 3) { let v = 0, a = 0.5, f = 1, n = 0; for (let o = 0; o < oct; o++) { v += a * noise(x * f, y * f, s + o * 17); n += a; a *= 0.5; f *= 2.03; } return v / n; }

    // ---- The mountain -----------------------------------------------------------
    // In pixels, since it is far: the summit, how wide the face is at each
    // height, and the depth each height is given (for size and for air). Its
    // skyline is a massif's, not a cone's: long ridges up from either foot, a
    // shoulder and a col on the left, the summit's pyramid, a notch and a
    // gendarme on the right, then a long shoulder down; broken into crags by
    // midpoint displacement, more so high up, where it is rock.
    // [across, in half-widths from the middle; up, as a share of the height]
    const SKYLINE = [[-1.5, 0], [-1.26, 0.12], [-1.06, 0.25], [-0.9, 0.38], [-0.78, 0.5], [-0.7, 0.47], [-0.63, 0.45], [-0.52, 0.54], [-0.38, 0.64], [-0.26, 0.73], [-0.17, 0.81], [-0.1, 0.87], [-0.045, 0.94], [0, 1], [0.045, 0.95], [0.1, 0.89], [0.16, 0.84], [0.2, 0.82], [0.25, 0.85], [0.3, 0.81], [0.4, 0.73], [0.52, 0.67], [0.62, 0.64], [0.72, 0.57], [0.82, 0.48], [0.96, 0.37], [1.12, 0.23], [1.3, 0.1], [1.45, 0]];
    function mountainOf(cam) {
        const { W, hor, u } = cam, up = cam.kind === 'upright';
        const footY = cam.sy(Z_FOOT) - 4 * u;
        const top = hor - hor * (up ? 0.76 : 0.74);
        const cx = W * (up ? 0.5 : cam.kind === 'panorama' ? 0.42 : 0.4);
        const half = W * (up ? 0.46 : cam.kind === 'panorama' ? 0.3 : 0.36);
        const M = { cx, top, footY, half, base: footY + 10 * u, faceZ: y => lerp(Z_FOOT, Z_TOP, clamp((footY - y) / (footY - top))) };
        M.outline = skyline(M, u);
        // The skyline's height at x (pixels): what is above it is sky.
        M.skyAt = x => { const o = M.outline; if (x <= o[0][0]) return o[0][1]; for (let i = 1; i < o.length; i++) if (x <= o[i][0]) return lerp(o[i - 1][1], o[i][1], (x - o[i - 1][0]) / Math.max(1e-6, o[i][0] - o[i - 1][0])); return o[o.length - 1][1]; };
        return M;
    }
    function skyline(M, u) {
        const H = M.base - M.top;
        let pts = SKYLINE.map(([k, h]) => [M.cx + k * M.half, M.base - h * H, h]);
        for (let lev = 0; lev < 4; lev++) {
            const out = [pts[0]];
            for (let i = 0; i < pts.length - 1; i++) {
                const a = pts[i], b = pts[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]), h = (a[2] + b[2]) / 2;
                const y = (a[1] + b[1]) / 2 + (hash(i, lev, 41) * 2 - 1) * len * (0.06 + 0.16 * h * h);
                out.push([(a[0] + b[0]) / 2 + (hash(i, lev, 43) - 0.5) * (b[0] - a[0]) * 0.3, Math.max(M.top + 3 * u, Math.min(M.base, y)), h], b);
            }
            pts = out;
        }
        return pts.map(([x, y]) => [x, y]);
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
        // The summit station, where the torches are lit, on the shoulder under the summit; the top of the lift beside it.
        const hx = M.cx + (up ? -0.04 : -0.035) * cam.W;
        L.hut = { x: hx, y: M.skyAt(hx) + 18 * cam.u };
        L.outline = M.outline;
        // The inn at the foot of the run, to one side of the picture; its door, and the finish in front of it.
        const innZ = 1.62, innX = up ? cam.at(0.3, innZ) : cam.at(0.19, innZ);
        L.inn = on('inn') ? { x: innX, z: innZ, w: up ? 15 : 19, side: 1 } : null;
        L.door = { x: innX + (up ? 2 : 3.6), z: innZ - cam.dz(1.2) };
        L.finish = { x: up ? cam.at(0.64, 2.4) : cam.at(0.56, 2.3), z: up ? 2.4 : 2.3 };
        // The run-out: from the mountain's foot down across the meadow to the finish.
        const foot = runFoot(cam, M);
        L.run = [[foot.x, Z_FOOT], [lerp(foot.x, L.finish.x, 0.35) + (up ? 4 : 10), 5.2], [lerp(foot.x, L.finish.x, 0.75) - (up ? 2 : 6), 3.6], [L.finish.x, L.finish.z + cam.dz(4)]];
        L.corridor = corridor(cam, M, L);
        L.track = track(cam, M, L);
        // The lift: from its station at the foot, to the right of the run, straight up to the summit station.
        L.lift = { x0: M.cx + M.half * (up ? 0.36 : 0.42), y0: M.footY - 6 * cam.u, x1: L.hut.x + 26 * cam.u, y1: L.hut.y + 6 * cam.u };
        // Where the year is spelt on New Year's Eve: the open bowl under the summit, above the trees.
        const fh = M.footY - M.top;
        L.year = { cx: M.cx + M.half * (up ? 0 : -0.06), cy: lerp(M.top, M.footY, up ? 0.5 : 0.47), h: fh * (up ? 0.12 : 0.2) };
        L.runs = runs(cam, M, L);
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
    const K_FOOT = { upright: 0.06, wide: 0.04, panorama: 0.04 };
    function runFoot(cam, M) { const px = M.cx + M.half * K_FOOT[cam.kind]; return { x: cam.xAt(px, Z_FOOT), px }; }
    function clearOfRun(L, cam, x, z, room) {
        for (let i = 0; i < L.run.length - 1; i++) {
            const [ax, az] = L.run[i], [bx, bz] = L.run[i + 1];
            for (let t = 0; t <= 1; t += 0.1) { const rx = lerp(ax, bx, t), rz = lerp(az, bz, t); if (Math.abs(rx - x) < room + 4 && Math.abs(rz - z) * cam.zm < room + 6) return false; }
        }
        return !(Math.abs(L.finish.x - x) < room + 14 && Math.abs(L.finish.z - z) * cam.zm < room + 14);
    }

    // ---- The line the skiers take -----------------------------------------------
    // The torch run is a broad piste cut down the middle of the face, from the
    // summit station to the foot: the corridor, a centre line that bows a
    // little to the left and a half-width that opens in the bowl and narrows
    // into the trees (pixels, by the share of the way down). The torches take
    // it in switchbacks, side to side inside it, so the line snakes.
    function corridor(cam, M, L) {
        const up = cam.kind === 'upright', u = cam.u, y0 = L.hut.y + 4 * u, y1 = M.footY;
        const k0 = (L.hut.x + 8 * u - M.cx) / M.half, k1 = K_FOOT[cam.kind];
        const C = { y0, y1 };
        C.tOf = y => clamp((y - y0) / (y1 - y0)) ** (1 / 0.92);
        C.yOf = t => lerp(y0, y1, clamp(t) ** 0.92);
        C.cx = t => M.cx + M.half * (lerp(k0, k1, t) - 0.07 * Math.sin(Math.PI * t));
        C.hw = t => M.half * (0.04 + 0.085 * Math.sin(Math.PI * Math.min(1, t * 1.1)) ** 0.7) * (up ? 1.25 : 1);
        // How far each side of the centre the piste is cut: room for the switchbacks and some metres more.
        C.edge = (t, sc) => C.hw(t) + (4 + 3 * t) * sc;
        return C;
    }
    // The switchbacks: from the hut, a corner on alternate sides of the corridor, then the foot.
    function piste(cam, M, L) {
        const legs = cam.kind === 'upright' ? 7 : 6, C = L.corridor || corridor(cam, M, L), out = [];
        out.push([L.hut.x + 8 * cam.u, L.hut.y + 4 * cam.u]);
        for (let j = 1; j < legs; j++) { const t = j / legs; out.push([C.cx(t) + (j % 2 ? -1 : 1) * C.hw(t), C.yOf(t)]); }
        out.push([runFoot(cam, M).px, M.footY]);
        return out;
    }
    function track(cam, M, L) {
        const corners = piste(cam, M, L), pts = [];
        // Rounded turns: a quadratic through each corner, from midpoint to midpoint.
        const mids = [corners[0]];
        for (let i = 0; i < corners.length - 1; i++) mids.push([(corners[i][0] + corners[i + 1][0]) / 2, (corners[i][1] + corners[i + 1][1]) / 2]);
        mids.push(corners[corners.length - 1]);
        for (let i = 0; i < mids.length - 1; i++) {
            const a = mids[i], b = mids[i + 1], c = i === 0 ? a : corners[i];
            const n = Math.max(6, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (3 * cam.u)));
            for (let k = i ? 1 : 0; k <= n; k++) { const t = k / n, q = 1 - t; pts.push({ x: q * q * a[0] + 2 * q * t * c[0] + t * t * b[0], y: q * q * a[1] + 2 * q * t * c[1] + t * t * b[1], ground: false }); }
        }
        for (const p of pts) p.z = M.faceZ(p.y);
        // The run-out, a smooth line through its points on the ground.
        pts.push(...runOut(cam, L.run));
        measure(pts, cam);
        const T = { pts, length: pts[pts.length - 1].m, faceEnd: pts.findIndex(p => p.ground), zm: cam.zm };
        // Room either side, in metres: to the corridor's edge on the face, the groomed width on the meadow.
        const C = L.corridor;
        for (const p of pts) {
            if (p.ground) { p.cx = p.x; p.room = RUNOUT - 2; continue; }
            const t = C.tOf(p.y), sc = cam.sc(p.z);
            p.cx = C.cx(t); p.room = Math.max(2, (C.edge(t, sc) - Math.abs(p.x - p.cx)) / sc - 2);
        }
        steepness(pts, cam);
        return T;
    }
    // The run-out's half-width on the meadow, in metres.
    const RUNOUT = 8;
    function runOut(cam, R) {
        const out = [], n = 80;
        for (let k = 1; k <= n; k++) {
            const t = k / n * (R.length - 1), i = Math.min(R.length - 2, Math.floor(t)), f = t - i;
            const p0 = R[Math.max(0, i - 1)], p1 = R[i], p2 = R[i + 1], p3 = R[Math.min(R.length - 1, i + 2)];
            const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (-a + 3 * b - 3 * c + d) * f * f * f);
            const x = cr(p0[0], p1[0], p2[0], p3[0]), z = cr(p0[1], p1[1], p2[1], p3[1]);
            out.push({ x: cam.sx(x, z), y: cam.sy(z), z, xm: x, ground: true });
        }
        return out;
    }
    // Metres from the top: on the face a metre is so many pixels by the depth the face is given there
    // (FACE_M times what it would be standing up to us: the face leans back, and it is a long way down); on the meadow by the camera.
    const FACE_M = 1.5;
    function measure(pts, cam) {
        let m = 0;
        pts[0].m = 0;
        for (let i = 1; i < pts.length; i++) {
            const a = pts[i - 1], b = pts[i];
            m += b.ground && a.ground ? Math.hypot(b.xm - a.xm, (b.z - a.z) * cam.zm) : Math.hypot(b.x - a.x, b.y - a.y) / cam.sc((a.z + b.z) / 2) * (b.ground ? 1 : FACE_M);
            b.m = m;
        }
    }
    // How much of the way each point is going is down the slope (0 across it, 1 straight down),
    // smoothed over some 30 m: the share of a turn a skier may swing across there; and the room, smoothed too.
    function steepness(pts, cam) {
        const raw = pts.map((p, i) => {
            const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
            if (a.ground && b.ground) { const dx = b.xm - a.xm, dz = (a.z - b.z) * cam.zm; return Math.max(0, dz) / Math.max(1e-6, Math.hypot(dx, dz)); }
            const dx = b.x - a.x, dy = b.y - a.y; return Math.max(0, dy) / Math.max(1e-6, Math.hypot(dx, dy));
        });
        // The room: the least within 15 m either way, then averaged over the same: smooth, and never more than there is.
        const room = pts.map((p, i) => { let r = p.room ?? 4; for (let j = i; j >= 0 && pts[j].m >= p.m - 15; j--) r = Math.min(r, pts[j].room ?? 4); for (let j = i; j < pts.length && pts[j].m <= p.m + 15; j++) r = Math.min(r, pts[j].room ?? 4); return r; });
        let j0 = 0, j1 = 0, sum = 0, rs = 0;
        for (let i = 0; i < pts.length; i++) {
            while (j1 < pts.length && pts[j1].m <= pts[i].m + 15) { sum += raw[j1]; rs += room[j1]; j1++; }
            while (pts[j0].m < pts[i].m - 15) { sum -= raw[j0]; rs -= room[j0]; j0++; }
            pts[i].steep = smooth(0.45, 0.8, sum / Math.max(1, j1 - j0));
            // The room either side, eased the same way, never more than it was: so a swing narrows smoothly where a run does.
            pts[i].room = rs / Math.max(1, j1 - j0);
        }
    }
    // Where `s` metres down the track is: pixels, depth, pixels to the metre,
    // the way it runs (radians on the screen), and whether it is on the meadow;
    // with the room either side (m), the steepness and the corridor's middle there.
    function at(T, s, cam, out = {}) {
        const P = T.pts, x = clamp(s, 0, T.length);
        let lo = 0, hi = P.length - 1;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (P[mid].m <= x) lo = mid; else hi = mid; }
        const a = P[lo], b = P[hi], t = b.m > a.m ? (x - a.m) / (b.m - a.m) : 0;
        out.x = lerp(a.x, b.x, t); out.y = lerp(a.y, b.y, t); out.z = lerp(a.z, b.z, t); out.ground = b.ground && a.ground;
        out.sc = cam.sc(out.z); out.dir = Math.atan2(b.y - a.y, b.x - a.x);
        out.xm = out.ground ? lerp(a.xm, b.xm, t) : cam.xAt(out.x, out.z);
        out.room = lerp(a.room ?? 4, b.room ?? 4, t); out.steep = lerp(a.steep ?? 1, b.steep ?? 1, t); out.cx = lerp(a.cx ?? a.x, b.cx ?? b.x, t);
        return out;
    }

    // ---- The resort's runs --------------------------------------------------------
    // Besides the torch run, the trails a ski area has: a red down the lift's
    // line to its station at the foot, and a long blue that leaves the summit
    // station along the left ridge, turns down the left flank and joins the
    // torch run low down, to finish at the inn. Each is a dense line of points
    // like the track's, with its half-width in pixels (hw) and the room either
    // side in metres. The skiers by day come down any of them, the torch run's
    // down the middle of its corridor.
    function runs(cam, M, L) {
        const u = cam.u, fh = M.footY - M.top, C = L.corridor, down = f => lerp(M.top, M.footY, f);
        const below = (x, y, d) => [x, Math.max(y, M.skyAt(x) + d)];
        const out = [];
        const ctrl = [];
        for (let i = 0; i <= 12; i++) { const t = i / 12; ctrl.push([C.cx(t), C.yOf(t)]); }
        const torch = makeRun(cam, M, spline(ctrl, 3 * u), p => C.edge(C.tOf(p.y), cam.sc(p.z)), 'torch', 'finish');
        const l = L.lift;
        const beside = (t, d) => below(lerp(l.x1, l.x0, t) + d * u, lerp(l.y1, l.y0, t), 12 * u);
        const red = [beside(0.02, 16), beside(0.16, 34), beside(0.34, 50), beside(0.52, 52), beside(0.7, 42), beside(0.86, 36), [l.x0 + 20 * u, l.y0 - 2 * u]];
        const merge = torch.pts.find(p => p.y >= down(0.93)) || torch.pts[torch.pts.length - 1];
        const blue = [below(L.hut.x - 12 * u, L.hut.y + 10 * u, 14 * u), below(M.cx - M.half * 0.26, down(0.3), 0.06 * fh), [M.cx - M.half * 0.38, down(0.46)], [M.cx - M.half * 0.45, down(0.62)], [M.cx - M.half * 0.42, down(0.74)], [lerp(M.cx - M.half * 0.32, merge.x, 0.5), down(0.84)], [merge.x, merge.y]];
        // Into the torch run's line as it nears it, so it joins it going the same way.
        const torchX = y => { const P = torch.pts; let i = 1; while (i < P.length - 1 && P[i].y < y) i++; return lerp(P[i - 1].x, P[i].x, clamp((y - P[i - 1].y) / Math.max(1e-6, P[i].y - P[i - 1].y))); };
        const y0 = down(0.78), line = spline(monotone(blue), 3 * u).map(([x, y]) => [lerp(x, torchX(y), smooth(y0, merge.y, y)), y]);
        const b = makeRun(cam, M, line, p => 9 * cam.sc(p.z), 'blue', 'finish');
        out.push(joinGround(torch, L.track, cam));
        out.push(steep(makeRun(cam, M, spline(monotone(red), 3 * u), p => 10 * cam.sc(p.z), 'red', 'lift'), cam));
        out.push(joinGround(joinRun(b, torch, merge, cam), L.track, cam));
        return out;
    }
    const steep = (R, cam) => { steepness(R.pts, cam); return R; };
    // y only ever grows down a run.
    function monotone(ctrl) { for (let i = 1; i < ctrl.length; i++) ctrl[i] = [ctrl[i][0], Math.max(ctrl[i][1], ctrl[i - 1][1] + 1)]; return ctrl; }
    // A dense line through control points (Catmull-Rom), a point every `step` pixels or so.
    function spline(ctrl, step) {
        const out = [ctrl[0]];
        for (let i = 0; i < ctrl.length - 1; i++) {
            const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
            const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
            for (let k = 1; k <= n; k++) {
                const f = k / n, cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (-a + 3 * b - 3 * c + d) * f * f * f);
                out.push([cr(p0[0], p1[0], p2[0], p3[0]), Math.max(out[out.length - 1][1], cr(p0[1], p1[1], p2[1], p3[1]))]);
            }
        }
        return out;
    }
    function makeRun(cam, M, line, hwOf, kind, exit) {
        const pts = line.map(([x, y]) => ({ x, y, z: M.faceZ(y), ground: false }));
        for (const p of pts) { p.hw = hwOf(p); p.cx = p.x; p.room = Math.max(1.5, p.hw / cam.sc(p.z) - 3); }
        measure(pts, cam);
        return { kind, exit, pts, length: pts[pts.length - 1].m, faceEnd: -1, zm: cam.zm };
    }
    // A run that ends on another carries on down it from there.
    function joinRun(R, onto, at, cam) {
        const i = onto.pts.indexOf(at), pts = R.pts.concat(onto.pts.slice(i + 1).map(p => ({ ...p })));
        measure(pts, cam);
        return { ...R, pts, length: pts[pts.length - 1].m };
    }
    // And out across the meadow the torches' way, to the finish.
    function joinGround(R, T, cam) {
        const pts = R.pts.concat(T.pts.filter(p => p.ground).map(p => ({ ...p, hw: RUNOUT * cam.sc(p.z) })));
        measure(pts, cam);
        steepness(pts, cam);
        return { ...R, pts, length: pts[pts.length - 1].m, faceEnd: pts.findIndex(p => p.ground) };
    }
    // A skier by day, s metres down run R, turning: the run's line, and a swing
    // across it that is only ever sideways (in x, on the face and the meadow
    // alike), so nobody climbs; as wide as `amp` metres, never wider than three
    // quarters of the room there, and only where the run goes down the slope
    // (on a traverse they hold their line). `wave` metres from one turn to the next but one.
    function lane(R, s, phase, amp, wave, cam, out = {}) {
        at(R, s, cam, out);
        out.off = Math.sin(s / wave * TAU + phase) * Math.min(amp, out.room * 0.75) * out.steep;
        out.x += out.off * out.sc;
        return out;
    }

    // ---- The procession ---------------------------------------------------------
    // n skiers in a line, `gap` metres apart, the first leading at `v` m/s.
    // They gather at the hut first, lighting their torches one by one; then
    // go down in the same snaking line, everyone in the leader's tracks: the
    // line is the track, so it snakes by the switchbacks and nobody leaves it.
    // Each has a speed of their own that eases (nobody starts or stops dead)
    // and a sideways offset (metres, in x on the screen, so it never climbs)
    // that eases too: whoever sits down in the snow slides to the middle of the
    // piste, and those coming up behind swing round them. At the bottom each
    // peels off the run-out where it passes their place in the figure and
    // glides to a stop there, forward all the way (planFinish, glide).
    const PACE = 3.4, EASE = 1.6, SKI_ACCEL = 3.2;
    function procession(n, o = {}) {
        const R = o.random || Math.random, sk = [];
        for (let i = 0; i < n; i++) sk.push({ i, s: 0, v: 0, lag: 0, state: 'wait', t: 0, fall: 0, lit: 0, side: R() < 0.5 ? -1 : 1, off: 0, offTo: 0, coat: Math.floor(R() * 1e6), kid: i === n - 1 && n > 4, tumble: R(), x: 0, z: 0, planted: null, glide: null, wob: R() * TAU });
        if (n) sk[0].guide = true;
        const v = PACE * (o.pace || 1);
        return { n, sk, lead: -(o.gather ?? 0), v, speed: v, gap: o.gap || 9, phase: 'gather', t: 0, hold: null, done: false, tumbles: o.tumbles ?? 0.35, shape: o.shape || 'line', grand: !!o.grand };
    }
    // How far down skier i should be, with the line `lead` metres down.
    const slot = (P, i) => P.lead - i * P.gap;
    // The track's point at s, by the two it lies between (no camera needed).
    function near(T, s) {
        const P = T.pts, x = clamp(s, 0, T.length);
        let lo = 0, hi = P.length - 1;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (P[mid].m <= x) lo = mid; else hi = mid; }
        const a = P[lo], b = P[hi], t = b.m > a.m ? (x - a.m) / (b.m - a.m) : 0;
        return { a, b, t, x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t), xm: b.ground && a.ground ? lerp(a.xm, b.xm, t) : null, room: lerp(a.room ?? 4, b.room ?? 4, t), steep: lerp(a.steep ?? 1, b.steep ?? 1, t), cx: lerp(a.cx ?? a.x, b.cx ?? b.x, t), ground: a.ground && b.ground };
    }
    // One step. T: the track; spots: where each plants a torch ([{x, z, peel}]
    // in metres, from planFinish(formation())); door: where they go in after. Returns events.
    function stepProcession(P, dt, T, spots, door, R = Math.random) {
        const ev = [];
        P.t += dt;
        if (P.hold) { P.hold.t -= dt; if (P.hold.t <= 0) P.hold = null; }
        // The line eases to a stop for a hold, and away again after it.
        P.speed += clamp((P.hold ? 0 : P.v) - P.speed, -EASE * dt, EASE * dt);
        P.lead += P.speed * dt;
        const sitting = P.sk.filter(k => k.state === 'ski' && k.fall > 0), ease = 1 - Math.exp(-dt * 1.8);
        let atBottom = 0, gone = 0;
        for (const k of P.sk) {
            const want = slot(P, k.i);
            if (k.state === 'wait') {
                // Up at the hut: each lights a torch as the one before goes, then sets off.
                k.lit = Math.min(1, k.lit + dt * (want > -P.gap * 3 ? 0.8 : 0));
                if (want > 0) { k.state = 'ski'; k.v = 0; ev.push(['off', k.i]); }
                continue;
            }
            if (k.state === 'ski') {
                k.lit = Math.min(1, k.lit + dt);
                k.lag = want - k.s;
                const here = near(T, k.s);
                if (k.fall > 0) {
                    // Sat down in the snow, torch still up, of course, sliding to the middle of the piste. Then up again, and catching up.
                    k.fall -= dt; k.v = 0;
                    k.offTo = k.side * Math.min(2.5, here.room * 0.8);
                    k.off += (k.offTo - k.off) * ease;
                    if (k.fall <= 0) { k.offTo = 0; ev.push(['up', k.i]); }
                    continue;
                }
                const spot = spots[k.i % Math.max(1, spots.length)], peel = Math.min(T.length, spot?.peel ?? T.length);
                // Only where it is steep: on a traverse or a turn nobody falls.
                if (!P.hold && P.tumbles > 0 && k.s > 40 && k.s < peel - 40 && here.steep > 0.5 && R() < P.tumbles * dt / 160) {
                    k.fall = 2.4 + R() * 2; k.side = Math.sign(here.cx - here.x) || k.side; ev.push(['fall', k.i]); continue;
                }
                // Toward the slot at the line's speed and a little more, never past it, never backwards.
                const aim = P.hold ? 0 : clamp(P.speed + 0.8 * (want - k.s), 0, P.v * 1.6);
                k.v = Math.max(0, k.v + clamp(aim - k.v, -SKI_ACCEL * dt, SKI_ACCEL * dt));
                k.s = Math.min(k.s + k.v * dt, Math.max(k.s, want));
                // Round anyone sat down just ahead, on the other side.
                let to = 0;
                for (const f of sitting) { const d = f.s - k.s; if (f !== k && d > -5 && d < 18) to = -f.side * Math.min(2.2, here.room * 0.8); }
                k.offTo = to;
                k.off += (k.offTo - k.off) * ease;
                if (k.s >= peel) {
                    const g = near(T, peel);
                    k.planted = spot || { x: g.xm ?? 0, z: g.z };
                    k.glide = glide(T, peel, k.off, k.planted, Math.max(0.8, k.v));
                    k.x = k.glide.B[0][0]; k.z = k.glide.B[0][1]; k.state = 'glide'; k.t = 0;
                    ev.push(['in', k.i]);
                }
                continue;
            }
            if (k.state === 'glide') {
                k.t += dt;
                const [x, z] = glideAt(k.glide, k.t, T.zm);
                k.dir = Math.sign(x - k.x) || k.dir || 1; k.x = x; k.z = z;
                if (k.t >= k.glide.T) { k.x = k.planted.x; k.z = k.planted.z; k.state = 'stand'; k.t = 0; ev.push(['plant', k.i]); }
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
        if (P.phase !== 'planted' && P.phase !== 'leave' && atBottom === P.n) { P.phase = 'planted'; P.t = 0; ev.push(['planted']); }
        if (P.phase === 'gather' && P.sk.some(k => k.state === 'ski')) P.phase = 'down';
        if (P.phase === 'planted' && P.t > (P.linger ?? 50)) { P.phase = 'leave'; for (const k of P.sk) if (k.state === 'stand') k.state = 'leave'; ev.push(['leave']); }
        if (P.phase === 'leave' && gone === P.n) { P.done = true; ev.push(['done']); }
        return ev;
    }
    // Where on the run-out each place in the figure is peeled off for: where the
    // run-out passes 10 m beyond it (or its end), so the glide there is forward
    // all the way. Sorted so the first down takes the first peel: nobody crosses
    // the line to reach a place behind the others.
    function planFinish(T, spots) {
        const P = T.pts, g0 = Math.max(0, T.faceEnd);
        return spots.map(sp => {
            let peel = T.length;
            for (let i = g0; i < P.length; i++) if (P[i].z <= sp.z + 10 / T.zm) { peel = P[i].m; break; }
            return { ...sp, peel };
        }).sort((a, b) => a.peel - b.peel || a.x - b.x);
    }
    // From the track at s (offset `off` metres across) to a stop at `to`: a
    // cubic in metres across and depth whose depths only fall, so the skier
    // only ever comes toward us; slowing evenly from speed v to a stop.
    function glide(T, s, off, to, v) {
        const p = near(T, s), q = near(T, Math.min(T.length, s + 1)), r = near(T, Math.max(0, s - 1));
        const x0 = (p.xm ?? 0) + off, z0 = p.z, tx = (q.xm ?? 0) - (r.xm ?? 0), tz = (q.z - r.z) * T.zm, tl = Math.hypot(tx, tz) || 1;
        const D = Math.hypot(to.x - x0, (to.z - z0) * T.zm), dzm = Math.max(0, (z0 - to.z) * T.zm), tzu = Math.min(0, tz / tl);
        const l1 = Math.min(D * 0.4, tzu < -1e-3 ? 0.65 * dzm / -tzu : D * 0.4);
        const B = [[x0, z0], [x0 + tx / tl * l1, z0 + tzu * l1 / T.zm], [to.x, to.z + Math.max(0, z0 - to.z) * 0.3], [to.x, to.z]];
        B[1][1] = Math.max(B[1][1], B[2][1]);
        const table = [0];
        let prev = B[0], len = 0;
        for (let i = 1; i <= 24; i++) { const c = bez(B, i / 24); len += Math.hypot(c[0] - prev[0], (c[1] - prev[1]) * T.zm); table.push(len); prev = c; }
        return { B, table, len, v, T: len > 0.05 ? 2 * len / v : 0.01 };
    }
    function bez(B, t) { const q = 1 - t, a = q * q * q, b = 3 * q * q * t, c = 3 * q * t * t, d = t * t * t; return [a * B[0][0] + b * B[1][0] + c * B[2][0] + d * B[3][0], a * B[0][1] + b * B[1][1] + c * B[2][1] + d * B[3][1]]; }
    function glideAt(G, t, zm) {
        const tt = Math.min(t, G.T), d = Math.min(G.len, G.v * tt - G.v * tt * tt / (2 * G.T));
        let i = 1;
        while (i < 24 && G.table[i] < d) i++;
        const f = (d - G.table[i - 1]) / Math.max(1e-9, G.table[i] - G.table[i - 1]);
        return bez(G.B, (i - 1 + clamp(f)) / 24);
    }
    // The year's places for the skiers on the mountain ([{i, x, y}], y where
    // they will have stopped): rank by height, the highest place to the
    // highest skier and so on down, matched across in bands; and nobody's place
    // above where they are, so nobody climbs to it. Returns i → {x, y, lifted}.
    function assignFigure(points, skiers) {
        const P = points.slice().sort((a, b) => a.y - b.y), S = skiers.slice().sort((a, b) => a.y - b.y), out = new Map();
        if (!P.length || !S.length) return out;
        const pick = S.map((_, j) => P[Math.round(j * (P.length - 1) / Math.max(1, S.length - 1))]);
        const bands = Math.max(1, Math.round(S.length / 8));
        for (let b = 0; b < bands; b++) {
            const j0 = Math.floor(b * S.length / bands), j1 = Math.floor((b + 1) * S.length / bands);
            const ks = S.slice(j0, j1).sort((p, q) => p.x - q.x), ps = pick.slice(j0, j1).sort((p, q) => p.x - q.x);
            ks.forEach((k, j) => out.set(k.i, { x: ps[j].x, y: Math.max(ps[j].y, k.y), lifted: k.y > ps[j].y }));
        }
        return out;
    }
    // Where skier k is on the screen (not counting the year's figure): on the
    // track, aside by their offset; or, once off it, where they glide, stand
    // or walk on the meadow. out.ground: on the meadow.
    function place(k, T, cam, out = {}) {
        if (k.state === 'ski') { at(T, k.s, cam, out); out.x += k.off * out.sc; out.xm += k.off; return out; }
        out.z = k.z; out.xm = k.x; out.sc = cam.sc(k.z); out.x = cam.sx(k.x, k.z); out.y = cam.sy(k.z); out.ground = true;
        return out;
    }
    // After the year, back to the track: the first place on it at or below where the skier is.
    function rejoin(T, s, y) {
        const P = T.pts;
        for (const p of P) if (p.m >= s && p.y >= y) return p.m;
        return T.length;
    }

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

    return { clamp, lerp, smooth, TAU, noise, fbm, camera, mountainOf, layout, piste, track, at, lane, procession, stepProcession, slot, near, planFinish, glide, glideAt, assignFigure, rejoin, place, FACE_M, RUNOUT, formation, yearFigure, calendar, due, grandDue, GRAND_AT, shell, SHELLS, SHAPES, BANDS, Z_FOOT, Z_TOP, PACE };
})();
