// Wayfarer's people, close up (SPEC §10.38): the traveller, and whoever is
// near enough to the camera to be looked at. The same skeleton as
// WayActors.person, hung with rounder parts: limbs that swell and narrow on
// real joints, hands with a thumb, a face, hair with some weight to it,
// clothes with folds, belts, pouches and straps. Further off, and on the
// Low tier, WayActors' lighter figures stand in for these.

const WayPeople = (() => {
    const L = WayLogic, M = WayModels, A = WayActors, C = M.C, W = C.white, TAU = Math.PI * 2;
    const LEATHER = [96, 68, 48], DARK = [64, 46, 36], STEEL = Object.assign([176, 180, 190], { shine: 0.9 }), GOLD = C.gold, BONE = [240, 232, 212];
    const SIDES = 12;         // round a limb
    const part = (key, make) => M.model('person:' + key, make);
    const noise = (i, k) => { const s = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return s - Math.floor(s); };
    // Painted on: the folds of cloth, the mottle of fur, the links of mail; and a hem cut ragged.
    const fold = (depth = 0.1, twist = 0.9) => (i, k) => 1 - depth * (0.5 + 0.5 * Math.sin(k * 2.4 + i * twist));
    const fur = (i, k) => 0.78 + 0.3 * noise(i, k);
    const mail = (i, k) => (i + k) % 2 ? 0.82 : 1;
    const rag = (at, by = 0.22) => (i, k) => i === at ? 1 - by / 2 + by * noise(k, 3) : 1;
    const ball = (s, x, y, z, rx, ry = rx, rz = rx, segs = 7, bands = 4) => s.blob(x, y, z, rx, ry, rz, { segs, bands, lump: 0, under: 0.84 });

    // The trunk as rings from the hips to the root of the neck: [x, y, z, half-width, depth as a share of it].
    const TRUNK = {
        m: [[0, -0.02, 0, 0.17, 0.72], [0, 0.04, 0, 0.192, 0.7], [0, 0.12, 0, 0.182, 0.68], [0, 0.21, 0, 0.166, 0.66], [0, 0.31, 0.008, 0.196, 0.66], [0, 0.4, 0.014, 0.228, 0.63], [0, 0.47, 0.01, 0.236, 0.58], [0, 0.52, 0.002, 0.212, 0.54], [0, 0.56, -0.004, 0.15, 0.6], [0, 0.6, -0.004, 0.08, 0.86]],
        // A woman's: a narrow waist over the hips, a bust, slight shoulders, a slim neck.
        f: [[0, -0.02, 0, 0.172, 0.76], [0, 0.04, 0, 0.206, 0.76], [0, 0.11, 0, 0.196, 0.74], [0, 0.2, 0, 0.118, 0.74], [0, 0.275, 0.008, 0.134, 0.78], [0, 0.345, 0.03, 0.164, 0.98], [0, 0.405, 0.036, 0.172, 1.0], [0, 0.46, 0.012, 0.168, 0.7], [0, 0.525, 0, 0.162, 0.52], [0, 0.565, -0.004, 0.105, 0.62], [0, 0.6, -0.004, 0.062, 0.86]],
        // Fuller still in the hip and the breast, under her robes: an hourglass.
        c: [[0, -0.02, 0, 0.182, 0.76], [0, 0.04, 0, 0.224, 0.76], [0, 0.11, 0, 0.212, 0.74], [0, 0.2, 0, 0.118, 0.76], [0, 0.27, 0.01, 0.136, 0.8], [0, 0.335, 0.04, 0.174, 1.1], [0, 0.4, 0.048, 0.184, 1.1], [0, 0.455, 0.018, 0.172, 0.78], [0, 0.525, 0, 0.162, 0.52], [0, 0.565, -0.004, 0.105, 0.62], [0, 0.6, -0.004, 0.062, 0.86]],
    };
    // More rings between the rings (so paint has somewhere to go), and a limb slimmed for a slighter build.
    const finer = (path, n = 2) => { const out = []; for (let i = 0; i < path.length - 1; i++) for (let k = 0; k < n; k++) { const t = k / n, e = t * t * (3 - 2 * t); out.push(path[i].map((v, j) => v + (path[i + 1][j] - v) * (j === 1 ? t : e))); } out.push(path[path.length - 1]); return out; };
    const slim = (path, k) => path.map(p => [p[0], p[1], p[2], p[3] * k, p[4] ?? 1]);
    // Tufts of fur standing out of an edge: a ring of them round an oval at a height, pointing out and down (or up).
    const tufts = (s, y, rx, ratio, z0, n, len, droop, seed = 0) => {
        for (let i = 0; i < n; i++) {
            const a = (i + 0.5 * noise(i, seed)) / n * TAU, c = Math.cos(a), sn = Math.sin(a), w = 0.9 / n * TAU, l = len * (0.6 + 0.8 * noise(i, seed + 1)), tone = 0.72 + 0.4 * noise(i, seed + 2);
            const p = b => [Math.sin(b) * rx, y, z0 + Math.cos(b) * rx * ratio];
            s.paint([255 * tone, 255 * tone, 255 * tone], 1).tri(p(a - w), p(a + w), [sn * (rx + l), y + droop * l, z0 + c * (rx + l) * ratio], [sn, 0.3, c], [0.75, 0.75, 1]);
        }
    };
    // A band lying on the trunk between two heights, a little proud of it.
    const band = (build, y0, y1, out = 0.012, steps = 3) => {
        const T = TRUNK[build], at = y => { let i = 0; while (i < T.length - 2 && y > T[i + 1][1]) i++; const a = T[i], b = T[i + 1], t = L.clamp((y - a[1]) / (b[1] - a[1]), 0, 1); return [0, y, L.mix(a[2], b[2], t), L.mix(a[3], b[3], t) + out, L.mix(a[4], b[4], t)]; };
        return Array.from({ length: steps + 1 }, (_, i) => at(L.mix(y0, y1, i / steps)));
    };

    const P = {
        // (g: how slight the limb is: 1 a man's, less a woman's.)
        thigh: (v, g = 1) => part(`thigh:${v}:${g}`, s => {
            const skin = v !== 'cloth';
            s.paint(W, skin ? 4 : 2).fx(0).tube(slim(finer([[0, 0.07, 0, 0.092, 1.06], [0, -0.03, 0.008, 0.118, 1.12], [0, -0.16, 0.014, 0.112, 1.12], [0, -0.3, 0.008, 0.09, 1.06], [0, -0.4, 0.002, 0.076, 1.0], [0, -0.47, 0, 0.07, 1.0]]), g), SIDES, { k: skin ? null : fold(0.1), cap: 3, ao: i => i < 2 ? 0.7 : 1 });
            ball(s, 0, -0.425, 0.016, 0.08 * g, 0.078, 0.084 * g, 9, 5);                                                                       // the knee, over the joint
            if (v === 'fur') { s.paint(W, 1).tube(slim([[0, 0.07, 0, 0.108, 1.08], [0, -0.03, 0.006, 0.13, 1.12], [0, -0.12, 0.01, 0.124, 1.12]], g), SIDES, { k: fur }); tufts(s, -0.12, 0.118 * g, 1.12, 0.01, 11, 0.05, -1.1, 3); }
        }),
        shin: (v, g = 1) => part(`shin:${v}:${g}`, s => {
            const skin = v !== 'boot', furry = v === 'fur';
            s.paint(W, skin ? 4 : 2).fx(0).tube(slim(finer([[0, 0.06, 0, 0.07, 1.0], [0, -0.03, -0.004, 0.082, 1.08], [0, -0.12, -0.016, 0.094, 1.14], [0, -0.21, -0.012, 0.076, 1.08], [0, -0.3, -0.002, 0.056, 1.0], [0, -0.38, 0, 0.05, 1.0]]), g), SIDES, { k: skin ? null : fold(0.08, 1.3), cap: 1 });
            // The boot: a turned cuff, a shaft that narrows to the ankle, a heel and a toe, on a sole.
            s.paint(furry ? W : LEATHER, furry ? 1 : 0).tube(slim(finer([[0, -0.17, -0.004, 0.09, 1.08], [0, -0.26, -0.004, 0.074, 1.04], [0, -0.35, 0.002, 0.06, 1.0], [0, -0.41, 0.006, 0.066, 1.0], [0, -0.455, 0.012, 0.078, 1.0]]), g), SIDES, { k: furry ? fur : (i, k) => 1 - 0.02 * i - 0.05 * (k % 3 === 0) });
            if (furry) { tufts(s, -0.17, 0.092 * g, 1.08, -0.004, 12, 0.055, 0.7, 5); tufts(s, -0.2, 0.094 * g, 1.08, -0.004, 12, 0.05, -0.9, 6); }
            else s.tube(slim([[0, -0.135, -0.004, 0.092, 1.08], [0, -0.165, -0.004, 0.1, 1.08], [0, -0.2, -0.004, 0.094, 1.08]], g), SIDES);
            ball(s, 0, -0.4, -0.01, 0.062 * g, 0.05, 0.07 * g, 8, 4);                                                                           // the ankle and heel
            s.tube(slim(finer([[0, -0.41, -0.05, 0.062, 0.8], [0, -0.415, 0.05, 0.078, 0.72], [0, -0.428, 0.14, 0.07, 0.6], [0, -0.44, 0.215, 0.036, 0.5]]), g), 10, { cap: 3, k: furry ? fur : null });
            s.paint([54, 40, 32], 0).box(0, -0.468, 0.07, 0.074 * g, 0.014, 0.15, 1);
            if (furry) for (const y of [-0.28, -0.35]) s.paint(LEATHER, 0).tube(slim([[0, y + 0.012, 0, 0.08 - (y < -0.3 ? 0.012 : 0), 1.03], [0, y - 0.012, 0.002, 0.078 - (y < -0.3 ? 0.012 : 0), 1.03]], g), SIDES);
            else s.paint(GOLD, 0).box(0.088 * g, -0.165, 0, 0.008, 0.016, 0.016, 1);
        }),
        upper: (v, g = 1) => part(`upper:${v}:${g}`, s => {
            const skin = v === 'bare' || v === 'ring';
            // A shoulder that slopes into the arm: the deltoid, the swell of the upper arm, and a cap over the elbow.
            s.paint(W, skin ? 4 : 1).fx(0).tube(slim(finer([[-0.01, 0.075, 0, 0.03, 1], [0, 0.05, 0, 0.082, 1.0], [0, -0.01, 0, 0.104, 1.04], [0, -0.09, 0.004, 0.098, 1.06], [0, -0.17, 0.006, 0.086, 1.06], [0, -0.25, 0.002, 0.072, 1.0], [0, -0.33, 0, 0.064, 1.0]]), g), SIDES, { k: skin ? null : fold(0.1, 1.1), cap: 3 });
            ball(s, 0, -0.308, -0.008, 0.07 * g, 0.064, 0.074 * g, 8, 5);
            if (v === 'ring') s.paint(GOLD, 0).tube(slim([[0, -0.12, 0.005, 0.098, 1.06], [0, -0.132, 0.005, 0.102, 1.06], [0, -0.16, 0.005, 0.1, 1.06], [0, -0.172, 0.005, 0.094, 1.06]], g), SIDES);
            if (v === 'plate') { s.paint(STEEL, 0).blob(0, 0.01, 0, 0.13, 0.09, 0.13, { segs: 10, bands: 5, lump: 0, under: 0.6 }); s.tube([[0, -0.06, 0, 0.114, 1], [0, -0.13, 0, 0.104, 1], [0, -0.14, 0, 0.11, 1]], SIDES); }
        }),
        fore: (v, g = 1) => part(`fore:${v}:${g}`, s => {
            const skin = v === 'bare' || v === 'bracer';
            s.paint(W, skin ? 4 : 1).fx(0).tube(slim(finer([[0, 0.04, 0, 0.06, 1.0], [0, -0.04, 0.004, 0.078, 1.06], [0, -0.11, 0.006, 0.074, 1.08], [0, -0.2, 0.002, 0.056, 1.0], [0, -0.285, 0, 0.042, 0.9]]), g), SIDES, { k: skin ? null : fold(0.08, 1.5), cap: 1 });
            if (v === 'sleeve') s.paint(LEATHER, 0).tube(slim([[0, -0.19, 0.002, 0.064, 1], [0, -0.2, 0.002, 0.068, 1], [0, -0.265, 0, 0.058, 1], [0, -0.275, 0, 0.052, 1]], g), SIDES);
            if (v === 'bracer') {
                s.paint(LEATHER, 0).tube(slim(finer([[0, -0.075, 0.004, 0.084, 1.06], [0, -0.16, 0.004, 0.07, 1.04], [0, -0.262, 0, 0.052, 0.95]]), g), SIDES, { k: (i, k) => k % 3 === 0 ? 0.8 : 1 });
                s.paint(GOLD, 0).tube(slim([[0, -0.07, 0.004, 0.087, 1.06], [0, -0.092, 0.004, 0.085, 1.06]], g), SIDES).tube(slim([[0, -0.248, 0, 0.057, 0.95], [0, -0.266, 0, 0.054, 0.95]], g), SIDES);
            }
            if (v === 'gauntlet') s.paint(STEEL, 0).tube([[0, -0.08, 0, 0.086, 1], [0, -0.17, 0, 0.068, 1], [0, -0.27, 0, 0.058, 1], [0, -0.28, 0, 0.064, 1]], SIDES);
            // The hand: the heel of it, a palm, four fingers that curl round whatever they hold, and a thumb across them.
            s.paint(W, 4);
            const h = 0.9 + 0.1 * g;
            ball(s, 0, -0.3, 0.002, 0.04 * h, 0.03, 0.03 * h, 8, 4);
            s.tube([[0, -0.295, 0.004, 0.04 * h, 0.62], [0, -0.335, 0.006, 0.047 * h, 0.56], [0, -0.365, 0.01, 0.044 * h, 0.5]], 10, { cap: 2 });
            for (let i = 0; i < 4; i++) { const x = (-0.033 + i * 0.022) * h, l = (i === 0 || i === 3 ? 0.88 : 1) * h; s.tube([[x, -0.36, 0.012, 0.0115 * h, 1], [x, -0.36 - 0.036 * l, 0.022, 0.011 * h, 1], [x, -0.36 - 0.058 * l, 0.042, 0.0098 * h, 1], [x, -0.36 - 0.05 * l, 0.062, 0.0085 * h, 1]], 6, { cap: 2 }); }
            s.tube([[0.036 * h, -0.31, 0.014, 0.015 * h, 1], [0.05 * h, -0.34, 0.036, 0.0135 * h, 1], [0.034 * h, -0.368, 0.058, 0.011 * h, 1], [0.016 * h, -0.38, 0.068, 0.0085 * h, 1]], 6, { cap: 2 });
        }),
        // build m or f; garb: tunic, robe, dress, mail, fur, hide.
        torso: (build, garb) => part(`torso:${build}:${garb}`, s => {
            const T = TRUNK[build], bare = garb === 'fur' || garb === 'hide', wide = T[0][3], trunk = build === 'm' ? 'm' : build;
            const F = finer(T, 3);
            // (Bare: the hollow down the middle of a strong belly and the lines across it, and the shadow under the ribs.)
            const toned = (i, k) => { const y = F[i][1], front = k === 4 || k === 3; return y > 0.13 && y < 0.31 ? (k === 4 ? 0.94 : 1) * (front && Math.abs(((y - 0.13) / 0.06) % 1 - 0.5) > 0.42 ? 0.93 : 1) : 1; };
            s.paint(W, bare ? 4 : 1).fx(0).tube(F, 16, { k: bare ? toned : garb === 'mail' ? mail : fold(0.08, 0.5), cap: 1, turn: Math.PI / 16 * 0 });
            const nk = build === 'm' ? 1 : 0.8;
            s.paint(W, 4).tube([[0, 0.55, -0.004, 0.085 * nk, 0.9], [0, 0.6, 0, 0.066 * nk, 0.92], [0, 0.66, 0.006, 0.058 * nk, 0.95], [0, 0.7, 0.01, 0.062 * nk, 0.95]], 10);                                  // the neck
            if (bare) for (const x of [-1, 1]) s.tube([[x * 0.02, 0.555, 0.07 * nk, 0.012, 1], [x * 0.09, 0.548, 0.05, 0.013, 1], [x * 0.17, 0.54, 0.01, 0.01, 1]], 5);          // the collarbones
            if (garb === 'fur') {
                // A fur top, tied behind the neck; a necklace of teeth.
                const top = band('f', 0.325, 0.465, 0.022, 4);
                s.paint(W, 1).tube(top, 16, { k: fur });
                tufts(s, 0.325, top[0][3], top[0][4], top[0][2], 22, 0.03, -1.2, 11); tufts(s, 0.465, top[4][3], top[4][4], top[4][2], 20, 0.028, 1.0, 12); tufts(s, 0.4, top[2][3] + 0.004, top[2][4], top[2][2], 18, 0.02, -0.4, 13);
                for (const x of [-1, 1]) s.paint(LEATHER, 0).tube([[x * 0.1, 0.49, 0.13, 0.011, 1], [x * 0.085, 0.575, 0.075, 0.011, 1], [x * 0.05, 0.6, -0.02, 0.011, 1], [0, 0.585, -0.075, 0.011, 1]], 4);
                for (let i = -3; i <= 3; i++) { const a = i * 0.3; s.paint(BONE, 0).tube([[Math.sin(a) * 0.1, 0.545 - Math.cos(a) * 0.035, 0.07 + Math.cos(a) * 0.075, 0.009, 1], [Math.sin(a) * 0.105, 0.515 - Math.cos(a) * 0.045, 0.08 + Math.cos(a) * 0.08, 0.002, 1]], 4); }
                s.paint(LEATHER, 0).tube([[-0.1, 0.57, 0, 0.012, 1], [0, 0.56, 0.065, 0.012, 1], [0.1, 0.57, 0, 0.012, 1]], 4, { ref: [0, 1, 0] });
            } else if (garb === 'hide') {
                // A pelt across the shoulders, and a strap from shoulder to hip.
                s.paint(W, 1).tube([[0, 0.45, 0, 0.275, 0.6], [0, 0.52, 0, 0.275, 0.58], [0, 0.585, 0, 0.19, 0.62], [0, 0.62, 0, 0.11, 0.8]], 14, { k: fur });
                tufts(s, 0.45, 0.275, 0.6, 0, 26, 0.06, -1.0, 21); tufts(s, 0.53, 0.27, 0.58, 0, 22, 0.04, -0.3, 22);
            } else {
                s.paint(W, 1).tube([[0, 0.565, 0, 0.115, 0.8], [0, 0.615, 0, 0.088, 0.86]], 10, { k: (i, k) => 0.9 });               // a collar
                if (garb === 'tunic') s.paint(DARK, 0).quad([-0.012, 0.42, wide * 0.6 + 0.002], [0.012, 0.42, wide * 0.6 + 0.002], [0.03, 0.58, 0.085], [-0.03, 0.58, 0.085], [0, 0.3, 0.95]);      // laced at the throat
            }
            if (bare) {
                // The strap the axe hangs from, shoulder to hip; then a broad belt, fur trunks and a fur kilt cut ragged.
                const tilt = 0.62, c = Math.cos(tilt), n = Math.sin(tilt), r = build === 'f' ? 0.248 : 0.274;
                s.paint(LEATHER, 0).tube([[0.014 * n, 0.33 - 0.014 * c, 0, r, build === 'f' ? 0.565 : 0.54], [-0.014 * n, 0.33 + 0.014 * c, 0, r, build === 'f' ? 0.565 : 0.54]], 14, { ref: [0, 0, 1] });
                s.paint(GOLD, 0).box(-0.06, 0.4, build === 'f' ? 0.135 : 0.15, 0.02, 0.02, 0.008, 1);
                s.paint(W, 1).tube([[0, -0.085, 0, 0.15, 0.78], [0, -0.01, 0, 0.2, 0.72], [0, 0.1, 0, 0.198, 0.71]], 14, { k: fur });
                // The kilt: two lengths of pelt, the upper short, each ending in tufts; open a little at one hip.
                s.tube([[0, 0.11, 0, 0.204, 0.72], [0, 0.03, 0, 0.222, 0.74], [0, -0.06, 0, 0.244, 0.78]], 16, { k: fur });
                s.tube([[0, 0.05, 0, 0.212, 0.73], [0, -0.08, 0, 0.242, 0.78], [0, -0.2, 0, 0.268, 0.82]], 16, { k: (i, k) => fur(i, k) * (k === 12 || k === 13 ? 0.55 : 0.92), rag: (i, k) => (k === 12 || k === 13) && i ? 0.86 : 1 });
                tufts(s, -0.06, 0.244, 0.78, 0, 24, 0.045, -1.3, 31); tufts(s, -0.2, 0.268, 0.82, 0, 26, 0.06, -1.5, 32); tufts(s, 0.105, 0.208, 0.72, 0, 20, 0.022, 0.6, 33);
            }
            // A belt with a buckle; a pouch at one hip and a knife at the other.
            const by = garb === 'fur' || garb === 'hide' ? 0.12 : 0.15, belt = band(trunk, by - 0.035, by + 0.035, 0.024, 2);
            if (garb === 'fur' || garb === 'hide') { belt[0][3] += 0.012; belt[1][3] += 0.012; }
            s.paint(garb === 'robe' ? GOLD : garb === 'leaf' ? [84, 130, 66] : LEATHER, 0).tube(belt, 16);
            s.paint(GOLD, 0).box(0, by, belt[0][3] * belt[0][4] + 0.004, 0.034, 0.034, 0.008, 1).paint(DARK, 0).box(0, by, belt[0][3] * belt[0][4] + 0.011, 0.016, 0.016, 0.004, 1);
            if (garb !== 'robe' && garb !== 'dress' && garb !== 'leaf') {
                s.paint([134, 98, 66], 0).box(belt[0][3] * 0.82, by - 0.07, 0.07, 0.035, 0.06, 0.05, 0.75, [DARK, 0]).paint(GOLD, 0).box(belt[0][3] * 0.82 + 0.036, by - 0.05, 0.07, 0.004, 0.012, 0.012, 1);
                s.paint(DARK, 0).tube([[-belt[0][3] * 0.9, by, 0.05, 0.022, 0.6], [-belt[0][3] * 0.98, by - 0.2, 0.03, 0.012, 0.6]], 5, { cap: 2 }).paint(BONE, 0).tube([[-belt[0][3] * 0.9, by + 0.07, 0.055, 0.014, 1], [-belt[0][3] * 0.9, by, 0.05, 0.016, 1]], 5, { cap: 1 });
            }
            if (garb === 'tunic' || garb === 'mail' || garb === 'leathers') s.paint(W, 1).tube([[0, 0.12, 0, wide + 0.012, 0.68], [0, 0, 0, wide + 0.035, 0.72], [0, -0.12, 0, wide + 0.058, 0.76], [0, -0.22, 0, wide + 0.074, 0.78]], 12, { k: garb === 'mail' ? mail : fold(0.14, 0.4), rag: rag(3, 0.08) });
            if (garb === 'mail') for (const z of [1, -1]) s.paint(W, 3).quad([-0.13, -0.3, z * 0.2], [0.13, -0.3, z * 0.2], [0.15, 0.54, z * 0.158], [-0.15, 0.54, z * 0.158], [0, 0.05, z], [0.75, 0.75, 1, 1]);        // a tabard
            if (garb === 'dress') s.paint(W, 3).tube(band('f', 0.17, 0.36, 0.02, 6), 16, { k: (i, k) => k === 3 ? 0.6 : 1 });           // a laced bodice
            if (garb === 'leaf') {
                // A druid's robe: a bodice of bark-brown leather laced with vine, a mantle of feathers on the shoulders, and a stone at the belt.
                s.paint([98, 72, 52], 0).tube(band(trunk, 0.16, 0.4, 0.02, 8), 16, { k: (i, k) => 0.82 + 0.2 * noise(k, i) });
                for (let i = 0; i < 4; i++) s.paint([120, 170, 84], 0).tube([[-0.04, 0.2 + i * 0.05, wide * 0.72, 0.006, 1], [0.04, 0.225 + i * 0.05, wide * 0.72 + 0.004, 0.006, 1]], 4);
                for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, r0 = 0.15, r1 = 0.25, c = Math.cos(a), n = Math.sin(a), tone = 0.8 + 0.3 * noise(i, 7); s.paint([255 * tone, 255 * tone, 255 * tone], 3).tri([n * r0 - c * 0.05, 0.6, c * r0 * 0.6 + n * 0.03], [n * r0 + c * 0.05, 0.6, c * r0 * 0.6 - n * 0.03], [n * r1, 0.5 + 0.02 * (i % 2), c * r1 * 0.6 - 0.01], [n * 0.5, 0.8, c * 0.5]); }      // a small collar of feathers, lying on the shoulders
                s.paint([90, 220, 190], 0).fx(0, 200).blob(0, 0.15, wide * 0.7 + 0.022, 0.024, 0.024, 0.012, { segs: 6, bands: 3, lump: 0, under: 1 }).fx(0);
            }
            if (garb === 'leathers') {
                // Fitted leathers: a second belt slung low, pouches, a strap across the chest with a buckle, a high collar.
                s.paint(DARK, 0).tube(band(trunk, 0.2, 0.44, 0.018, 8), 16, { k: (i, k) => k % 3 ? 0.92 : 0.7 });
                const tilt = -0.5, c = Math.cos(tilt), n = Math.sin(tilt);
                s.paint(LEATHER, 0).tube([[0.014 * n, 0.33 - 0.014 * c, 0, 0.246, 0.57], [-0.014 * n, 0.33 + 0.014 * c, 0, 0.246, 0.57]], 14, { ref: [0, 0, 1] });
                s.paint(GOLD, 0).box(0.05, 0.37, 0.142, 0.018, 0.018, 0.008, 1);
                s.paint(LEATHER, 0).tube([[0.01, 0.045, 0, wide + 0.02, 0.7], [-0.01, 0.085, 0, wide + 0.02, 0.7]], 12, { ref: [0.12, 0, 1] });
                for (const [x, z] of [[-0.13, 0.12], [0.17, 0.07], [-0.19, -0.02]]) s.paint([110, 80, 56], 0).box(x, 0.03, z, 0.036, 0.05, 0.036, 0.75, [DARK, 0]);
                s.paint(DARK, 0).tube([[0, 0.56, 0, 0.1, 0.84], [0, 0.66, 0, 0.082, 0.9]], 10);
            }
        }),
        // A skirt or a robe from the waist: long (to the ankle) or short.
        skirt: long => part('skirt:' + long, s => s.paint(W, 1).fx(0, 0, 8).tube([[0, 0.06, 0, 0.2, 0.7], [0, -0.12, 0, 0.25, 0.76], [0, -0.4, 0, 0.31, 0.8], [0, long ? -0.76 : -0.56, 0, long ? 0.37 : 0.34, 0.82]], 14, { k: fold(0.2, 0.25), rag: rag(3, 0.05) })),
        // A druid's skirts: two lengths of long leaves, the under ones darker, each cut to a point.
        leafskirt: () => part('leafskirt', s => {
            const point = at => (i, k) => i === at ? (k % 2 ? 1.06 : 0.8) : 1, veined = (i, k) => (k % 2 ? 0.86 : 1) - 0.04 * i;
            s.paint([200, 200, 200], 1).fx(0, 0, 8).tube([[0, 0.06, 0, 0.21, 0.72], [0, -0.2, 0, 0.27, 0.78], [0, -0.5, 0, 0.33, 0.82], [0, -0.78, 0, 0.36, 0.84]], 16, { k: veined, rag: point(3) });
            s.paint(W, 1).fx(0, 0, 12).tube([[0, 0.08, 0, 0.222, 0.72], [0, -0.14, 0, 0.29, 0.78], [0, -0.4, 0, 0.36, 0.82]], 16, { k: veined, rag: point(2), turn: 0.2 });
            s.paint([98, 72, 52], 0).fx(0).quad([-0.07, 0.06, 0.168], [0.07, 0.06, 0.168], [0.05, -0.5, 0.305], [-0.05, -0.5, 0.305], [0, 0.3, 0.95], [1, 1, 0.8, 0.8]).tri([-0.05, -0.5, 0.305], [0.05, -0.5, 0.305], [0, -0.62, 0.32], [0, 0.3, 0.95]);
        }),
        // Twin daggers, one to a thigh, on straps.
        dagger: () => part('dagger', s => {
            s.paint(LEATHER, 0).fx(0).tube([[0, -0.1, 0.004, 0.118, 1.08], [0, -0.13, 0.005, 0.117, 1.08]], 8).tube([[0, -0.24, 0.008, 0.101, 1.08], [0, -0.27, 0.008, 0.099, 1.08]], 8);
            s.paint(DARK, 0).tube([[0.125, -0.08, 0.01, 0.022, 0.6], [0.11, -0.34, 0.01, 0.012, 0.6]], 5, { cap: 2 });
            s.paint(STEEL, 0).box(0.127, -0.07, 0.01, 0.03, 0.008, 0.012, 1).paint([40, 34, 40], 0).tube([[0.128, -0.06, 0.01, 0.014, 1], [0.132, 0.04, 0.01, 0.013, 1]], 5, { cap: 2 }).paint(GOLD, 0).blob(0.132, 0.05, 0.01, 0.017, 0.017, 0.017, { segs: 5, bands: 3, lump: 0 });
        }),
        knife: () => part('knife', s => { s.paint(STEEL, 0).fx(0).tube([[0, 0.02, 0, 0.018, 0.3], [0, 0.2, 0, 0.012, 0.3], [0, 0.26, 0, 0, 1]], 5); s.box(0, 0.015, 0, 0.034, 0.008, 0.012, 1).paint([40, 34, 40], 0).tube([[0, -0.1, 0, 0.013, 1], [0, 0.01, 0, 0.014, 1]], 5, { cap: 1 }); }),
        // A quiver across the back, its arrows fletched in white and red.
        quiver: () => part('quiver', s => {
            s.at(M.mul(M.move(0.05, 0.3, -0.2), M.rotZ(-0.45)));
            s.paint(LEATHER, 0).fx(0).tube([[0, -0.3, 0, 0.05, 0.8], [0, 0.1, 0, 0.06, 0.8], [0, 0.3, 0, 0.066, 0.8]], 8, { cap: 1, k: (i, k) => k % 2 ? 0.86 : 1 });
            s.paint(GOLD, 0).tube([[0, 0.27, 0, 0.069, 0.8], [0, 0.3, 0, 0.069, 0.8]], 8);
            for (let i = 0; i < 5; i++) { const x = -0.035 + i * 0.018, z = 0.02 * (i % 2 ? 1 : -1); s.paint([120, 88, 60], 0).tube([[x, 0.28, z, 0.006, 1], [x * 1.3, 0.5, z, 0.006, 1]], 4); for (const a of [0, 1.05, 2.1]) s.paint(i % 2 ? [236, 232, 224] : [190, 60, 50], 0).quad([x * 1.3, 0.4, z], [x * 1.3 + Math.cos(a) * 0.022, 0.41, z + Math.sin(a) * 0.022], [x * 1.3 + Math.cos(a) * 0.022, 0.49, z + Math.sin(a) * 0.022], [x * 1.3, 0.5, z], [-Math.sin(a), 0, Math.cos(a)]); }
            s.at(null).paint(LEATHER, 0).tube([[0.1, 0.56, 0.04, 0.013, 1], [0, 0.4, 0.15, 0.013, 1], [-0.13, 0.2, 0.1, 0.013, 1]], 4);
        }),
        // A longbow, as tall as she is: held by its grip (the origin), strung; `drawn` with the string back and an arrow on it.
        bow: drawn => part('bow:' + drawn, s => {
            const limb = [];
            // A recurve: the limbs belly toward the archer and their ends turn away again; flat and broad in the limb,
            // round at the grip, nocked in horn. Drawn, they bend in and the nocks come back.
            const bend = drawn ? 1.5 : 1, shape = u => 0.11 - 0.3 * bend * u * u + (0.3 * bend - 0.08) * Math.pow(Math.abs(u), 5) + (drawn ? -0.06 * u * u : 0);
            for (let i = -12; i <= 12; i++) { const u = i / 12, a = Math.abs(u); limb.push([0, u * (drawn ? 0.74 : 0.82), shape(u), a < 0.12 ? 0.02 : 0.0125 - 0.004 * a, a < 0.12 ? 0.9 : 2.3 - 0.9 * a]); }
            s.paint([132, 88, 54], 0).fx(0).tube(limb, 6, { ref: [1, 0, 0], k: (i, k) => (0.9 + 0.12 * noise(i, k)) * (i % 4 === 0 ? 0.82 : 1) });
            s.paint(LEATHER, 0).tube([[0, -0.085, shape(0.1), 0.024, 0.86], [0, 0, 0.112, 0.026, 0.86], [0, 0.085, shape(0.1), 0.024, 0.86]], 8, { ref: [1, 0, 0], k: (i, k) => k % 2 ? 0.78 : 1 });
            s.paint(GOLD, 0).box(0.02, 0.1, 0.105, 0.01, 0.006, 0.02, 1);
            const tipY = drawn ? 0.74 : 0.82, tipZ = shape(1), pull = drawn ? -0.46 : tipZ;
            for (const y of [-tipY, tipY]) s.paint(BONE, 0).blob(0, y, tipZ, 0.012, 0.02, 0.014, { segs: 6, bands: 3, lump: 0 });
            s.paint([240, 236, 224], 0).tube([[0, tipY, tipZ, 0.0045, 1], [0, 0.02, pull, 0.0045, 1], [0, -tipY, tipZ, 0.0045, 1]], 4, { ref: [1, 0, 0] });
            if (drawn) {
                s.paint([120, 88, 60], 0).tube([[0, 0.03, -0.46, 0.007, 1], [0, 0.03, 0.3, 0.007, 1]], 4).paint(STEEL, 0).tube([[0, 0.03, 0.3, 0.016, 0.4], [0, 0.03, 0.37, 0, 1]], 4);
                for (const a of [0, 2.1, 4.2]) s.paint([236, 232, 224], 0).quad([0, 0.03, -0.44], [Math.cos(a) * 0.025, 0.03 + Math.sin(a) * 0.025, -0.44], [Math.cos(a) * 0.025, 0.03 + Math.sin(a) * 0.025, -0.34], [0, 0.03, -0.34], [-Math.sin(a), Math.cos(a), 0]);
            }
        }),
        // A staff grown, not cut: two stems twisted about one another, opening at the top round a bud that glows.
        budstaff: () => part('budstaff', s => {
            for (const ph of [0, Math.PI]) { const path = []; for (let i = 0; i <= 8; i++) { const y = -1.05 + i * 0.26, a = ph + i * 0.9, r = i > 6 ? 0.03 + (i - 6) * 0.03 : 0.012; path.push([Math.sin(a) * r, y, Math.cos(a) * r, 0.022 - i * 0.001, 1]); } s.paint(ph ? [110, 84, 60] : [96, 72, 52], 0).fx(0).tube(path, 5, { k: (i, k) => 0.86 + 0.2 * noise(i, k) }); }
            s.paint([140, 255, 190], 0).fx(0, 255).blob(0, 1.1, 0, 0.055, 0.075, 0.055, { segs: 7, bands: 4, lump: 0, under: 1 });
            for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.4; s.paint([110, 170, 80], 0).fx(40).tri([Math.sin(a) * 0.03, 1.02, Math.cos(a) * 0.03], [Math.sin(a + 0.5) * 0.09, 1.1, Math.cos(a + 0.5) * 0.09], [Math.sin(a) * 0.07, 1.22, Math.cos(a) * 0.07], [Math.sin(a), 0.3, Math.cos(a)]); }
            s.fx(30).paint([226, 214, 190], 0).tube([[0.02, 0.7, 0, 0.004, 1], [0.05, 0.52, 0.01, 0.004, 1]], 3).paint([150, 110, 200], 0).tri([0.035, 0.52, 0.01], [0.065, 0.52, 0.01], [0.05, 0.4, 0.02], [0, 0, 1]);
            s.fx(0);
        }),
        // A small horn lantern at the belt, for those whose hands are full.
        beltlamp: () => part('beltlamp', s => { s.paint(C.iron, 0).fx(0).tube([[-0.2, 0.12, 0.06, 0.005, 1], [-0.235, 0.02, 0.07, 0.005, 1]], 3).prism(6, -0.235, 0.0, 0.07, 0.04, 0.03, 0.008).prism(6, -0.235, -0.11, 0.07, 0.036, -0.1, 0.036, { cap: true }); s.paint(C.flame, 0).fx(0, 255).prism(6, -0.235, -0.1, 0.07, 0.03, 0.0, 0.03); s.fx(0); }),
        // The druid's helm: a cap of bark plates bound in bronze, a brow piece that comes to a point between the eyes with a
        // stone in it, leaf-shaped cheek guards, a crest of bronze leaves; and a stag's rack, each beam sweeping back, out and
        // up again in a long curve with five tines, moss on it, a charm of beads and a feather hanging from each side, a
        // sprig of blossom, and a light at every tip that shows after dark.
        antlers: () => part('antlers', s => {
            s.paint(W, 7).fx(0).tube(finer([[0, 0.205, -0.02, 0.166, 1.0], [0, 0.26, -0.03, 0.162, 0.98], [0, 0.31, -0.04, 0.128, 0.98], [0, 0.345, -0.04, 0.07, 0.98], [0, 0.358, -0.04, 0, 1]]), 14, { k: (i, k) => (k % 2 ? 0.8 : 1.04) * (0.9 + 0.14 * noise(i, k)) });
            s.paint(BRONZE, 0).tube([[0, 0.196, -0.016, 0.169, 1.0], [0, 0.212, -0.016, 0.173, 1.0], [0, 0.236, -0.018, 0.169, 1.0]], 14);
            for (let i = 0; i < 6; i++) { const z = 0.1 - i * 0.05, y = 0.325 + 0.03 * Math.sin((i + 0.5) / 6 * Math.PI); s.paint(BRONZE, 0).tri([-0.03, y, z], [0.03, y, z], [0, y + 0.07 - i * 0.004, z - 0.06], [0, 0.6, 0.8]).tri([0.03, y, z], [-0.03, y, z], [0, y + 0.07 - i * 0.004, z - 0.06], [0, 0.6, -0.8]); }
            s.paint(BRONZE, 0).tri([-0.062, 0.236, 0.14], [0.062, 0.236, 0.14], [0, 0.128, 0.172], [0, 0.25, 0.97]).tri([-0.062, 0.236, 0.14], [0, 0.275, 0.15], [0.062, 0.236, 0.14], [0, 0.25, 0.97]);
            s.paint([96, 236, 204], 0).fx(0, 235).blob(0, 0.222, 0.158, 0.021, 0.027, 0.011, { segs: 8, bands: 4, lump: 0, under: 1 }).fx(0);
            for (const x of [-1, 1]) {
                s.paint([255, 196, 96], 0).fx(0, 200).blob(x * 0.1, 0.216, 0.128, 0.011, 0.011, 0.007, { segs: 6, bands: 3, lump: 0, under: 1 }).fx(0);
                s.paint(BRONZE, 0).tri([x * 0.092, 0.222, 0.138], [x * 0.17, 0.222, 0.02], [x * 0.146, 0.07, 0.092], [x * 0.75, 0, 0.66]).paint([70, 124, 84], 0).tri([x * 0.112, 0.2, 0.125], [x * 0.16, 0.2, 0.05], [x * 0.146, 0.1, 0.094], [x * 0.76, 0, 0.65]);
                // The beam, and its tines.
                const beam = finer([[x * 0.1, 0.3, -0.03, 0.03, 1], [x * 0.17, 0.4, -0.1, 0.027, 1], [x * 0.27, 0.5, -0.17, 0.024, 1], [x * 0.37, 0.64, -0.17, 0.02, 1], [x * 0.41, 0.8, -0.1, 0.016, 1], [x * 0.38, 0.94, 0.0, 0.011, 1], [x * 0.33, 1.02, 0.08, 0, 1]], 3);
                s.paint(BONE, 0).tube(beam, 6, { k: (i, k) => (k % 2 ? 0.86 : 1) * (0.92 + 0.1 * noise(i, k)) });
                const tips = [[x * 0.33, 1.02, 0.08]];
                for (const [at, dx, dy, dz, len] of [[2, 0.02, 0.1, 0.16, 1], [5, 0.1, 0.14, 0.1, 1.1], [8, 0.14, 0.12, -0.02, 1], [11, 0.1, 0.16, -0.1, 0.9], [14, -0.06, 0.14, -0.08, 0.7]]) {
                    const b = beam[at], tip = [b[0] + x * dx * len, b[1] + dy * len, b[2] + dz * len];
                    s.tube([[b[0], b[1], b[2], b[3] * 0.8, 1], [b[0] + x * dx * len * 0.62, b[1] + dy * len * 0.4, b[2] + dz * len * 0.62, b[3] * 0.6, 1], [tip[0], tip[1], tip[2], 0, 1]], 5);
                    tips.push(tip);
                }
                for (const tip of tips) s.paint([150, 255, 214], 0).fx(0, 255).blob(tip[0], tip[1], tip[2], 0.0085, 0.0085, 0.0085, { segs: 5, bands: 3, lump: 0, under: 1 });
                s.fx(0);
                for (const at of [3, 7, 10]) s.paint([104, 150, 78], 0).blob(beam[at][0], beam[at][1] + 0.018, beam[at][2], 0.034, 0.016, 0.034, { segs: 6, bands: 3, lump: 0.3, seed: at });
                // A charm on a thread: two beads and a feather; and a sprig in blossom.
                const h = beam[6];
                s.fx(50).paint([226, 214, 190], 0).tube([[h[0], h[1], h[2], 0.003, 1], [h[0] + x * 0.01, h[1] - 0.2, h[2] + 0.01, 0.003, 1]], 3);
                s.paint([96, 236, 204], 0).fx(50, 160).blob(h[0] + x * 0.005, h[1] - 0.1, h[2] + 0.005, 0.012, 0.012, 0.012, { segs: 5, bands: 3, lump: 0 }).paint([255, 196, 96], 0).blob(h[0] + x * 0.008, h[1] - 0.15, h[2] + 0.008, 0.009, 0.009, 0.009, { segs: 5, bands: 3, lump: 0 });
                s.fx(70).paint([236, 240, 250], 0).tri([h[0] + x * 0.01, h[1] - 0.2, h[2]], [h[0] + x * 0.04, h[1] - 0.27, h[2] + 0.01], [h[0] - x * 0.005, h[1] - 0.34, h[2] + 0.02], [x * 0.3, 0, 0.95]);
                for (let i = 0; i < 4; i++) { const b = beam[12], a = i * 1.6; s.fx(40).paint(i % 2 ? [250, 200, 220] : [124, 176, 84], 0).blob(b[0] + Math.sin(a) * 0.03, b[1] + 0.03 + 0.01 * i, b[2] + Math.cos(a) * 0.03, 0.016, 0.01, 0.016, { segs: 5, bands: 2, lump: 0, under: 1 }); }
                s.fx(0);
            }
        }),
        // A cowl, and a scarf drawn up over the nose.
        cowl: () => part('cowl', s => {
            const ring = (z, r, y, sq) => [0, y, z, r, sq];
            s.paint(W, 7).fx(0).tube([ring(0.14, 0.168, 0.2, 1.1), ring(0.07, 0.19, 0.2, 1.1), ring(-0.04, 0.2, 0.2, 1.08), ring(-0.14, 0.17, 0.21, 1.02), ring(-0.21, 0.09, 0.22, 1), ring(-0.24, 0, 0.22, 1)], 10, { cap: 2, k: fold(0.1, 0.6) });
            s.paint([70, 70, 70], 7).tube([ring(0.138, 0.162, 0.2, 1.1), ring(0.05, 0.18, 0.2, 1.1)], 10, { ao: () => 0.55 });
            s.paint(W, 7).tube([[0, 0.06, -0.01, 0.17, 0.9], [0, -0.02, -0.01, 0.23, 0.8], [0, -0.07, -0.01, 0.262, 0.76]], 10, { k: fold(0.14, 0.5), rag: rag(2, 0.08) });
            s.paint([210, 210, 210], 7).tube([[0, -0.01, 0.03, 0.11, 1.0], [0, 0.06, 0.04, 0.128, 1.06], [0, 0.108, 0.042, 0.136, 1.1], [0, 0.132, 0.03, 0.134, 1.08], [0, 0.138, 0.022, 0.128, 1.08]], 12, { k: fold(0.14, 1.1) });
        }),
        // A head: chin, jaw, cheekbones, brow and cranium as one form; eyes set into it under lids, a nose with a
        // bridge, lips, ears. v: m, f or e (one of the Evenfolk), then p for warpaint or 1, 2 for the Evenfolk's marks.
        face: v => part('face:' + v, s => {
            const f = v[0] !== 'm', paint = v[1] === 'p', elf = v[0] === 'e', j = f ? 0.86 : 1;
            const skull = finer([[0, -0.012, 0.05, 0.03 * j, 1.0], [0, 0.012, 0.042, 0.066 * j, 1.0], [0, 0.05, 0.026, 0.1 * j, 1.04], [0, 0.095, 0.012, 0.124 * (f ? 0.93 : 1), 1.08], [0, 0.13, 0.006, 0.141, 1.1], [0, 0.185, 0, 0.144, 1.1], [0, 0.23, -0.006, 0.143, 1.1], [0, 0.275, -0.012, 0.13, 1.1], [0, 0.31, -0.016, 0.1, 1.1], [0, 0.332, -0.018, 0.05, 1.1], [0, 0.338, -0.018, 0, 1]], 2);
            s.paint(W, 4).fx(0).tube(skull, 16, { cap: 1, ao: i => i < 3 ? 0.75 : 1 });
            const ey = 0.178, front = 0.151;
            for (const x of [-1, 1]) {
                const ex = x * 0.054;
                // An eye lies in the face, not on it: a flat white a hair proud of the skin, a big soft iris, a pupil and
                // a point of light; a line of lashes over it.
                const big = f ? 1.32 : 1.16;
                s.paint([250, 248, 244], 0).blob(ex, ey, front - 0.0068, 0.0225 * big, 0.0142 * big, 0.003, { segs: 10, bands: 3, lump: 0, under: 1 });
                s.paint(elf ? (v[1] === '2' ? [96, 168, 214] : [214, 160, 70]) : f ? [72, 132, 108] : [104, 80, 58], 0).blob(ex + x * 0.0008, ey - 0.0008, front - 0.0048, 0.0122 * big, 0.013 * big, 0.0018, { segs: 10, bands: 3, lump: 0, under: 1 });
                s.paint([26, 20, 22], 0).blob(ex + x * 0.0008, ey - 0.0008, front - 0.0036, 0.0056 * big, 0.0062 * big, 0.0012, { segs: 7, bands: 3, lump: 0, under: 1 });
                s.paint([255, 255, 255], 0).blob(ex + 0.0045, ey + 0.0048, front - 0.0028, 0.0034, 0.0034, 0.0008, { segs: 6, bands: 3, lump: 0, under: 1 });
                s.paint([52, 38, 36], 0).tube([[ex - x * 0.024 * big, ey + 0.007, front - 0.006, 0.0016, 1], [ex, ey + 0.0142 * big, front - 0.003, f ? 0.0026 : 0.002, 1], [ex + x * 0.0265 * big, ey + 0.0085, front - 0.0095, f ? 0.0024 : 0.0016, 1]], 4, { ref: [0, 1, 0] });
                // A brow: arched and fine, or straight and heavy.
                s.paint([200, 200, 200], 6).tube([[ex - x * 0.03, ey + (f ? 0.03 : 0.024), front + 0.002, f ? 0.004 : 0.0065, 1], [ex + x * 0.004, ey + (f ? 0.04 : 0.031), front + 0.004, f ? 0.0052 : 0.008, 1], [ex + x * 0.036, ey + (f ? 0.034 : 0.03), front - 0.014, f ? 0.003 : 0.006, 1]], 5, { ref: [0, 1, 0] });
                s.paint(W, 4);
                if (!f) s.tube([[ex - x * 0.034, ey + 0.022, front - 0.006, 0.011, 1], [ex + x * 0.04, ey + 0.026, front - 0.018, 0.011, 1]], 5, { ref: [0, 1, 0] });           // a heavy brow under it
                // An ear; the Evenfolk's are long and swept back.
                if (elf) s.tube([[x * 0.136, 0.168, 0.0, 0.03, 0.5], [x * 0.19, 0.212, -0.07, 0.032, 0.4], [x * 0.25, 0.28, -0.18, 0.02, 0.4], [x * 0.285, 0.33, -0.27, 0, 1]], 7, { ref: [0, 1, 0] });
                else { s.blob(x * 0.146, 0.168, -0.006, 0.016, 0.036, 0.026, { segs: 7, bands: 4, lump: 0 }); s.paint([200, 170, 170], 4).blob(x * 0.152, 0.168, 0, 0.008, 0.02, 0.012, { segs: 5, bands: 3, lump: 0 }); }
                if (elf) for (let i = 0; i < 3; i++) s.paint([236, 250, 255], 0).fx(0, 110).blob(x * (0.074 + i * 0.02), 0.146 - i * 0.004, 0.13 - i * 0.013, 0.006 - i * 0.001, 0.006 - i * 0.001, 0.003, { segs: 5, bands: 3, lump: 0, under: 1 }).fx(0);
                // Warpaint: two bars across each cheek.
                if (paint) for (const [y, w2] of [[0.15, 0.04], [0.13, 0.03]]) s.paint([52, 110, 168], 0).quad([x * 0.07, y - 0.006, 0.137], [x * (0.07 + w2), y - 0.002, 0.137 - w2 * 0.6], [x * (0.07 + w2), y + 0.005, 0.137 - w2 * 0.6], [x * 0.07, y + 0.003, 0.137], [x * 0.5, 0, 0.86]);
                s.paint(W, 4).blob(x * 0.016, 0.119, front + 0.008, 0.011, 0.009, 0.011, { segs: 5, bands: 3, lump: 0 });                             // the wings of the nose
            }
            // The nose: a bridge from between the brows, a tip, and the turn under it.
            s.paint(W, 4).tube(f ? [[0, 0.2, front - 0.004, 0.011, 1], [0, 0.165, front + 0.008, 0.011, 1], [0, 0.135, front + 0.02, 0.0135, 1], [0, 0.123, front + 0.021, 0.014, 0.9], [0, 0.114, front + 0.006, 0.01, 1]] : [[0, 0.205, front - 0.002, 0.014, 1], [0, 0.165, front + 0.012, 0.015, 1], [0, 0.13, front + 0.026, 0.019, 1], [0, 0.118, front + 0.026, 0.02, 0.9], [0, 0.108, front + 0.006, 0.013, 1]], 7, { cap: 2 });
            // The mouth: a bow of an upper lip, a fuller lower one, and the line between; the chin under it.
            const lip = f ? [186, 92, 96] : [168, 112, 100], my = 0.084;
            s.paint([lip[0] * 0.86, lip[1] * 0.8, lip[2] * 0.8], 0).tube([[-(f ? 0.027 : 0.032), my + 0.002, front - 0.016, 0.003, 1], [-0.01, my + 0.006, front - 0.004, 0.0062, 1], [0, my + 0.004, front - 0.002, 0.005, 1], [0.01, my + 0.006, front - 0.004, 0.0062, 1], [f ? 0.027 : 0.032, my + 0.002, front - 0.016, 0.003, 1]], 5, { ref: [0, 1, 0] });
            s.paint(lip, 0).tube([[-(f ? 0.024 : 0.028), my - 0.003, front - 0.017, 0.003, 1], [0, my - 0.008, front - 0.004, f ? 0.0085 : 0.0075, 1], [f ? 0.024 : 0.028, my - 0.003, front - 0.017, 0.003, 1]], 5, { ref: [0, 1, 0] });
            s.paint([96, 50, 52], 0).tube([[-(f ? 0.028 : 0.033), my + 0.0015, front - 0.0145, 0.0016, 1], [0, my - 0.001, front - 0.0005, 0.0018, 1], [f ? 0.028 : 0.033, my + 0.0015, front - 0.0145, 0.0016, 1]], 4, { ref: [0, 1, 0] });
            if (elf && v[1] === '1') s.paint([236, 250, 255], 0).fx(0, 110).quad([-0.0035, 0.008, front - 0.012], [0.0035, 0.008, front - 0.012], [0.0035, 0.06, front - 0.002], [-0.0035, 0.06, front - 0.002], [0, 0, 1]).fx(0);
        }),
        // Lids, for a blink: skin over each eye and the lashes' line along the bottom of it.
        blink: f => part('blink:' + f, s => {
            for (const x of [-1, 1]) {
                const ex = x * 0.054, ey = 0.178, front = 0.151, big = f ? 1.32 : 1.16;
                s.paint(W, 4).fx(0).blob(ex, ey + 0.001, front - 0.0052, 0.024 * big, 0.0155 * big, 0.0034, { segs: 10, bands: 3, lump: 0, under: 1 });
                s.paint([52, 38, 36], 0).tube([[ex - x * 0.022 * big, ey - 0.006, front - 0.0045, 0.0016, 1], [ex, ey - 0.0105, front - 0.0015, 0.0022, 1], [ex + x * 0.024 * big, ey - 0.005, front - 0.008, 0.0016, 1]], 4, { ref: [0, 1, 0] });
            }
        }),
        hair: v => part('hair:' + v, s => {
            s.paint(W, 6).fx(0);
            const strands = (i, k) => 0.86 + 0.22 * noise(k, 1) - 0.03 * i;
            if (v !== 'bald') {
                // Over the crown and down behind the ears, in locks; a fringe that falls across the brow.
                const locks = (i, k) => 0.8 + 0.24 * noise(k, 1) * (k % 2 ? 1 : 0.6) - 0.02 * i;
                s.tube(finer([[0, 0.12, -0.05, 0.146, 0.86], [0, 0.19, -0.04, 0.156, 0.98], [0, 0.25, -0.03, 0.156, 1.06], [0, 0.3, -0.03, 0.134, 1.08], [0, 0.335, -0.03, 0.09, 1.08], [0, 0.352, -0.03, 0.03, 1.08], [0, 0.355, -0.03, 0, 1]], 2), 18, { k: locks });
                const loose = v === 'short' || v === 'bun' ? 0.7 : 1;
                for (let i = -3; i <= 3; i++) { const x = i * 0.036, side = Math.sign(i) || 1; s.tube([[x * 0.8, 0.325 - Math.abs(i) * 0.012, 0.06, 0.03, 0.5], [x, 0.275 - Math.abs(i) * 0.006, 0.128 - Math.abs(i) * 0.012, 0.03, 0.4], [x + side * 0.012, 0.232 + Math.abs(i) * 0.004 * loose, 0.146 - Math.abs(i) * 0.016, 0.018, 0.4], [x + side * 0.02, 0.212, 0.146 - Math.abs(i) * 0.018, 0, 1]], 6, { k: locks, ref: [1, 0, 0] }); }
                for (const x of [-1, 1]) s.tube([[x * 0.13, 0.28, 0.03, 0.036, 0.5], [x * 0.15, 0.2, 0.05, 0.034, 0.45], [x * 0.152, 0.12 * loose + 0.05, 0.05, 0.022, 0.45], [x * 0.148, 0.07 * loose + 0.05, 0.045, 0, 1]], 6, { k: locks });
            }
            if (v === 'bald') s.tube([[0, 0.12, -0.03, 0.156, 0.95], [0, 0.2, -0.04, 0.15, 0.9]], 10, { k: strands });
            if (v === 'long') s.tube([[0, 0.26, -0.085, 0.11, 0.7], [0, 0.1, -0.13, 0.142, 0.52], [0, -0.08, -0.15, 0.13, 0.42], [0, -0.24, -0.14, 0.095, 0.4], [0, -0.34, -0.13, 0.03, 0.4]], 10, { k: strands });
            if (v === 'flow') {
                // Loose to the waist, and a lock over each shoulder.
                s.tube([[0, 0.27, -0.08, 0.115, 0.72], [0, 0.1, -0.13, 0.16, 0.55], [0, -0.12, -0.16, 0.17, 0.42], [0, -0.36, -0.17, 0.15, 0.36], [0, -0.56, -0.16, 0.1, 0.34], [0, -0.66, -0.15, 0.02, 0.34]], 12, { k: strands });
                for (const x of [-1, 1]) s.tube([[x * 0.12, 0.16, 0.04, 0.042, 0.8], [x * 0.15, 0.02, 0.08, 0.04, 0.7], [x * 0.15, -0.16, 0.12, 0.036, 0.7], [x * 0.14, -0.34, 0.13, 0.014, 0.7]], 6, { k: strands, cap: 2 });
            }
            if (v === 'tail') {
                // Drawn up high and tied, falling to the shoulder blades.
                s.tube([[0, 0.32, -0.13, 0.05, 1], [0, 0.36, -0.2, 0.058, 1], [0, 0.26, -0.27, 0.062, 0.8], [0, 0.06, -0.27, 0.05, 0.8], [0, -0.14, -0.24, 0.016, 0.8]], 8, { k: strands, cap: 2 });
                s.paint(LEATHER, 0).tube([[0, 0.325, -0.14, 0.054, 1], [0, 0.34, -0.165, 0.056, 1]], 8).paint(W, 6);
            }
            if (v === 'bun') { s.blob(0, 0.3, -0.12, 0.075, 0.07, 0.075, { segs: 7, bands: 4, lump: 0.06 }); s.tube([[0, 0.2, -0.1, 0.12, 0.6], [0, 0.06, -0.12, 0.1, 0.5]], 8, { k: strands }); }
            if (v === 'mane') {
                s.tube([[0, 0.28, -0.07, 0.13, 0.8], [0, 0.12, -0.12, 0.19, 0.62], [0, -0.06, -0.14, 0.2, 0.5], [0, -0.2, -0.13, 0.15, 0.45]], 12, { k: strands, rag: rag(3, 0.5) });
                for (const x of [-1, 1]) s.tube([[x * 0.12, 0.2, 0.03, 0.05, 1], [x * 0.15, 0.06, 0.05, 0.05, 1], [x * 0.14, -0.08, 0.07, 0.022, 1]], 6, { k: strands, cap: 2 });
            }
            if (v === 'braid') {
                // A mane at the temples, a heavy braid down the back bound with thongs, and two slighter ones in front.
                s.tube([[0, 0.27, -0.08, 0.12, 0.75], [0, 0.12, -0.125, 0.165, 0.58], [0, 0, -0.14, 0.12, 0.5]], 12, { k: strands });
                s.tube([[0, 0.14, -0.15, 0.062, 1], [0, 0.04, -0.175, 0.052, 1], [0, -0.05, -0.18, 0.064, 1], [0, -0.14, -0.175, 0.047, 1], [0, -0.23, -0.17, 0.058, 1], [0, -0.32, -0.165, 0.042, 1], [0, -0.41, -0.155, 0.052, 1], [0, -0.49, -0.15, 0.02, 1]], 8, { k: (i, k) => 0.8 + 0.25 * ((k + i) % 2), cap: 2 });
                s.paint(LEATHER, 0).tube([[0, -0.355, -0.16, 0.05, 1], [0, -0.385, -0.158, 0.05, 1]], 8).paint(GOLD, 0).tube([[0, 0.1, -0.165, 0.066, 1], [0, 0.07, -0.17, 0.064, 1]], 8);
                for (const x of [-1, 1]) {
                    s.paint(W, 6).tube([[x * 0.125, 0.15, 0.03, 0.04, 1], [x * 0.14, 0.03, 0.066, 0.031, 1], [x * 0.138, -0.08, 0.092, 0.035, 1], [x * 0.132, -0.17, 0.105, 0.028, 1], [x * 0.128, -0.25, 0.108, 0.012, 1]], 6, { k: (i, k) => 0.8 + 0.25 * ((k + i) % 2), cap: 2 });
                    s.paint(GOLD, 0).tube([[x * 0.131, -0.16, 0.104, 0.033, 1], [x * 0.13, -0.185, 0.106, 0.031, 1]], 6);
                }
            }
        }),
        beard: v => part('beard:' + v, s => {
            s.paint(W, 6).fx(0).blob(0, 0.058, 0.066, 0.1, 0.075, 0.08, { segs: 8, bands: 4, lump: 0.08, seed: 0.7, under: 0.8 });
            s.box(0, 0.108, 0.138, 0.045, 0.01, 0.012, 1);
            if (v === 'long') s.tube([[0, 0.05, 0.1, 0.085, 0.6], [0, -0.1, 0.13, 0.07, 0.5], [0, -0.24, 0.14, 0.02, 0.5]], 8, { k: (i, k) => 0.86 + 0.2 * noise(k, 2) });
        }),
        // A cloak in eight lengths and twelve gores, both its faces; the hem moves most.
        cloak: (short = false) => part('cloak:' + short, s => {
            // One sheet: every corner has its own slope and its own share of the wind, so it folds and never tears.
            const COLS = 14, ROWS = short ? 7 : 9, at = (i, j) => {
                const u = i / COLS * 2 - 1, v = j / ROWS * (short ? 0.66 : 1), w = 0.275 + 0.2 * v, wrap = 1 - u * u;
                return [u * w * (1 + 0.05 * Math.cos(i * 1.9 + 1) * v), 0.56 - 1.16 * v, -0.15 - (0.17 * Math.sin(v * 2.2) + 0.05 * Math.cos(i * 1.8) * v) * (0.35 + 0.65 * wrap) + 0.17 * (1 - wrap)];
            };
            const corner = (i, j, inside) => {
                const p = at(i, j), a = at(Math.max(i - 1, 0), j), b = at(Math.min(i + 1, COLS), j), c = at(i, Math.max(j - 1, 0)), d = at(i, Math.min(j + 1, ROWS));
                const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - c[0], vy = d[1] - c[1], vz = d[2] - c[2];
                let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
                const l = -(Math.hypot(nx, ny, nz) || 1) * Math.sign(nz || 1);
                nx /= l; ny /= l; nz /= l;                      // facing back, away from the body
                // (A band of trim along the hem: a paler edge and a darker line over it.)
                const k = (1 - 0.03 * j) * (0.86 + 0.14 * Math.cos(i * 1.8) * (j / ROWS)) * (inside ? 0.55 : j === ROWS ? 1.34 : j === ROWS - 1 ? 0.72 : 1);
                s.fx(0, 0, Math.round(j * j * 1.7));
                s.v(p[0] * (inside ? 0.97 : 1), p[1], p[2] + (inside ? 0.014 : 0), nx, ny, nz, inside ? 0.6 : 1, k);
            };
            s.paint(W, 3);
            for (const inside of [false, true]) for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) { corner(i, j, inside); corner(i, j + 1, inside); corner(i + 1, j + 1, inside); corner(i, j, inside); corner(i + 1, j + 1, inside); corner(i + 1, j, inside); }
            // Gathered over the shoulders, standing a little at the neck, and held at the throat by a clasp on a chain.
            s.fx(0).tube([[0, 0.42, -0.01, short ? 0.262 : 0.3, 0.66], [0, 0.5, -0.004, short ? 0.248 : 0.275, 0.64], [0, 0.565, 0, 0.17, 0.7], [0, 0.625, 0, 0.1, 0.84]], 14, { k: fold(0.14, 0.5) });
            s.paint(GOLD, 0).gloss(0.8).blob(0, 0.53, short ? 0.15 : 0.172, 0.03, 0.034, 0.014, { segs: 8, bands: 4, lump: 0 }).gloss(0);
            for (const x of [-1, 1]) s.paint(GOLD, 0).tube([[x * 0.025, 0.53, short ? 0.152 : 0.174, 0.006, 1], [x * 0.1, 0.515, short ? 0.13 : 0.15, 0.006, 1]], 4, { ref: [0, 1, 0] });
        }),
        // A hood round the face, deep enough to shade it, with a peak behind; gathered on the shoulders.
        hood: () => part('hood', s => {
            const ring = (z, r, y, sq) => [0, y, z, r, sq];
            s.paint(W, 3).fx(0).tube([ring(0.165, 0.176, 0.182, 1.16), ring(0.1, 0.2, 0.19, 1.12), ring(-0.02, 0.212, 0.2, 1.08), ring(-0.13, 0.19, 0.216, 1.02), ring(-0.21, 0.12, 0.25, 1), ring(-0.275, 0.03, 0.295, 1)], 10, { cap: 2, k: fold(0.1, 0.6) });
            s.paint([96, 96, 96], 3).tube([ring(0.163, 0.17, 0.182, 1.16), ring(0.07, 0.19, 0.19, 1.12), ring(-0.05, 0.19, 0.2, 1.08)], 10, { ao: () => 0.55 });
            s.paint(W, 3).tube([[0, 0.09, -0.02, 0.19, 0.9], [0, 0.0, -0.02, 0.25, 0.8], [0, -0.075, -0.02, 0.292, 0.75]], 10, { k: fold(0.14, 0.5), rag: rag(2, 0.08) });
        }),
        apron: () => part('apron', s => s.paint([244, 238, 226], 0).fx(0).quad([-0.17, -0.5, 0.215], [0.17, -0.5, 0.215], [0.14, 0.16, 0.15], [-0.14, 0.16, 0.15], [0, 0.1, 1], [0.8, 0.8, 1, 1]).quad([-0.11, 0.16, 0.15], [0.11, 0.16, 0.15], [0.1, 0.4, 0.15], [-0.1, 0.4, 0.15], [0, 0, 1])),
        pack: () => part('pack', s => {
            // A pack with a flap and side pockets, a bedroll strapped across the top, a pan and a coil of rope.
            const body = [134, 98, 66];
            s.paint(body, 0).fx(0).tube([[0, 0.1, -0.25, 0.15, 0.62], [0, 0.2, -0.26, 0.175, 0.66], [0, 0.42, -0.26, 0.17, 0.64], [0, 0.5, -0.25, 0.13, 0.6]], 8, { cap: 3, k: (i, k) => 1 - 0.07 * noise(i, k) });
            s.paint([116, 84, 56], 0).tube([[0, 0.3, -0.265, 0.178, 0.66], [0, 0.45, -0.262, 0.176, 0.65], [0, 0.51, -0.25, 0.134, 0.6]], 8);                 // the flap
            for (const x of [-0.07, 0.07]) s.paint(DARK, 0).box(x, 0.33, -0.385, 0.012, 0.09, 0.006, 1).paint(GOLD, 0).box(x, 0.27, -0.39, 0.016, 0.014, 0.006, 1);
            for (const x of [-1, 1]) s.paint(body, 0).box(x * 0.19, 0.22, -0.26, 0.04, 0.085, 0.07, 0.8, [[116, 84, 56], 0]);
            s.paint([92, 124, 150], 0).at(M.mul(M.move(0, 0.59, -0.25), M.rotZ(Math.PI / 2))).tube([[0, -0.26, 0, 0.088, 1], [0, 0.26, 0, 0.088, 1]], 9, { cap: 3, k: (i, k) => 0.82 + 0.2 * ((k % 3) === 0) });
            for (const y of [-0.15, 0.15]) s.paint(DARK, 0).tube([[0, y - 0.012, 0, 0.092, 1], [0, y + 0.012, 0, 0.092, 1]], 9);
            s.at(M.mul(M.move(0.21, 0.32, -0.33), M.rotX(0.3))).paint([70, 70, 78], 0).prism(8, 0, 0, 0, 0.075, 0.014, 0.075, { cap: true }).box(0, 0.005, -0.12, 0.012, 0.006, 0.06, 1);
            s.at(M.mul(M.move(-0.2, 0.36, -0.3), M.rotZ(Math.PI / 2))).paint(C.rope, 0).tube([[0, -0.018, 0, 0.07, 1], [0, 0.018, 0, 0.07, 1]], 8);
            s.at(null);
            for (const x of [-1, 1]) s.paint(DARK, 0).tube([[x * 0.13, 0.2, -0.16, 0.014, 1], [x * 0.17, 0.36, 0.02, 0.014, 1], [x * 0.15, 0.56, 0.04, 0.014, 1], [x * 0.12, 0.58, -0.14, 0.014, 1]], 4);        // the straps
        }),
        lute: () => part('lute', s => {
            s.paint([176, 120, 66], 0).fx(0).blob(0.06, 0.2, -0.25, 0.16, 0.2, 0.075, { segs: 9, bands: 5, lump: 0, under: 0.7 });
            s.paint([226, 196, 140], 0).prism(9, 0.06, 0.2, -0.326, 0.13, 0.201, 0.13, { squash: 0.01 });
            s.paint([40, 30, 26], 0).prism(8, 0.06, 0.24, -0.33, 0.04, 0.241, 0.04, { squash: 0.01 });
            s.paint([96, 66, 44], 0).at(M.mul(M.move(0.06, 0.36, -0.25), M.rotZ(-0.5))).box(0, 0.26, 0, 0.022, 0.26, 0.02, 1).box(0, 0.55, 0.02, 0.03, 0.045, 0.02, 1);
            s.at(null).paint(C.rope, 0).tube([[-0.16, 0.5, 0.06, 0.012, 1], [0.05, 0.3, 0.17, 0.012, 1], [0.2, 0.1, 0.02, 0.012, 1]], 4);
        }),
        shield: () => part('shield', s => {
            s.paint(W, 3).fx(0).at(M.mul(M.move(0, 0.3, -0.24), M.rotX(Math.PI / 2))).prism(12, 0, 0, 0, 0.29, 0.045, 0.27, { cap: true, foot: 1 });
            s.paint(STEEL, 0).tube([[0, 0.046, 0, 0.275, 1], [0, 0.06, 0, 0.275, 1], [0, 0.06, 0, 0.245, 1]], 12).blob(0, 0.05, 0, 0.07, 0.045, 0.07, { segs: 8, bands: 3, lump: 0, under: 0.6 });
            for (let i = 0; i < 4; i++) { const a = i * TAU / 4 + 0.78; s.paint(GOLD, 0).box(Math.sin(a) * 0.17, 0.05, Math.cos(a) * 0.17, 0.014, 0.008, 0.014, 1); }
            s.at(null);
        }),
        // A bearded axe slung across the back, head up at the shoulder.
        axe: () => part('axe', s => {
            s.at(M.mul(M.move(0.02, 0.26, -0.2), M.rotZ(0.62)));
            s.paint([112, 82, 56], 0).fx(0).tube([[0, -0.5, 0, 0.022, 1], [0, 0.1, 0, 0.02, 1], [0, 0.62, 0, 0.024, 1]], 6, { cap: 3 });
            for (const y of [-0.3, -0.22, 0.34]) s.paint(LEATHER, 0).tube([[0, y - 0.03, 0, 0.026, 1], [0, y + 0.03, 0, 0.026, 1]], 6);
            const blade = (x0, x1, y0, y1, y2, y3) => { for (const z of [1, -1]) s.paint(STEEL, 0).quad([x0, y1, z * 0.014], [x1, y0, 0], [x1, y3, 0], [x0, y2, z * 0.014], [0.15, 0, z], [0.85, 1, 1, 0.85]); s.paint([226, 230, 238], 0).quad([x1, y0, 0.003], [x1 + 0.012, y0 - 0.01, 0], [x1 + 0.012, y3 + 0.01, 0], [x1, y3, 0.003], [1, 0, 0]); };
            blade(-0.02, -0.24, 0.3, 0.46, 0.58, 0.64);
            s.paint(DARK, 0).box(0, 0.52, 0, 0.034, 0.07, 0.03, 1);
            s.at(null);
        }),
        sword: () => part('sword', s => {
            s.at(M.mul(M.move(-0.02, 0.2, -0.19), M.rotZ(-0.6)));
            s.paint([84, 58, 44], 0).fx(0).tube([[0, -0.5, 0, 0.022, 0.5], [0, 0.34, 0, 0.042, 0.4]], 6, { cap: 3 });
            s.paint(GOLD, 0).box(0, -0.47, 0, 0.03, 0.035, 0.016, 1).box(0, 0.37, 0, 0.11, 0.014, 0.02, 1).blob(0, 0.56, 0, 0.03, 0.03, 0.03, { segs: 6, bands: 3, lump: 0 });
            s.paint(LEATHER, 0).tube([[0, 0.38, 0, 0.02, 1], [0, 0.54, 0, 0.018, 1]], 6);
            s.at(null);
        }),
        staff: () => part('staff', s => {
            s.paint([120, 88, 60], 0).fx(0).tube([[0, -1.05, 0, 0.02, 1], [0.006, -0.5, 0, 0.024, 1], [-0.005, 0, 0.004, 0.027, 1], [0.004, 0.45, 0, 0.026, 1], [0, 0.86, 0, 0.03, 1]], 6, { cap: 1, k: (i, k) => 0.9 + 0.14 * noise(i, k) });
            s.paint(LEATHER, 0).tube([[0, -0.07, 0.002, 0.031, 1], [0, 0.09, 0.002, 0.031, 1]], 6, { k: (i, k) => k % 2 ? 0.8 : 1 });
            s.paint([58, 58, 66], 0).tube([[0, -1.07, 0, 0.022, 1], [0, -1.0, 0, 0.024, 1]], 6);
        }),
        crook: () => part('crook', s => s.paint([120, 88, 60], 0).fx(0).tube([[0, 0.84, 0, 0.03, 1], [0, 0.96, 0.03, 0.028, 1], [0, 1.04, 0.1, 0.026, 1], [0, 1.03, 0.18, 0.024, 1], [0, 0.96, 0.21, 0.02, 1], [0, 0.9, 0.18, 0.014, 1]], 6, { cap: 2 })),
        crystal: () => part('crystal', s => {
            for (let i = 0; i < 3; i++) { const a = i * 2.1; s.paint([120, 88, 60], 0).fx(0).tube([[0, 0.84, 0, 0.03, 1], [Math.sin(a) * 0.07, 0.94, Math.cos(a) * 0.07, 0.014, 1], [Math.sin(a) * 0.06, 1.04, Math.cos(a) * 0.06, 0.008, 1]], 4); }
            s.paint([120, 230, 255], 0).fx(0, 255).prism(6, 0, 0.9, 0, 0.012, 1.0, 0.07, { flat: true }).prism(6, 0, 1.0, 0, 0.07, 1.17, 0, { flat: true });
        }),
        lantern: () => part('lantern', s => {
            s.paint(C.iron, 0).fx(0).box(0, 0.84, 0.09, 0.012, 0.012, 0.1, 1).box(0, 0.775, 0.18, 0.005, 0.055, 0.005, 1);
            s.prism(6, 0, 0.7, 0.18, 0.07, 0.75, 0.012).prism(6, 0, 0.53, 0.18, 0.062, 0.55, 0.062, { cap: true });
            for (let i = 0; i < 4; i++) { const a = i * TAU / 4 + 0.78; s.box(Math.sin(a) * 0.056, 0.625, 0.18 + Math.cos(a) * 0.056, 0.006, 0.075, 0.006, 1); }
            s.paint(C.flame, 0).fx(0, 255).prism(6, 0, 0.55, 0.18, 0.05, 0.7, 0.05);
        }),
        spear: () => part('spear', s => {
            s.paint([120, 88, 60], 0).fx(0).tube([[0, -1.05, 0, 0.02, 1], [0, 0.2, 0, 0.022, 1], [0, 1.22, 0, 0.019, 1]], 6, { cap: 1 });
            s.paint([196, 200, 210], 0).tube([[0, 1.2, 0, 0.022, 1], [0, 1.28, 0, 0.052, 0.3], [0, 1.4, 0, 0.04, 0.26], [0, 1.56, 0, 0, 1]], 6);
            s.paint(LEATHER, 0).tube([[0, 1.12, 0, 0.026, 1], [0, 1.22, 0, 0.026, 1]], 6, { k: (i, k) => k % 2 ? 0.8 : 1 }).tube([[0, -0.06, 0, 0.027, 1], [0, 0.1, 0, 0.027, 1]], 6);
            for (const [x, z] of [[0.03, 0.01], [-0.02, 0.03]]) s.paint([190, 60, 50], 0).tube([[x * 0.6, 1.13, z * 0.6, 0.008, 1], [x * 1.5, 1.02, z * 1.5, 0.016, 1], [x * 1.7, 0.92, z * 1.7, 0.003, 1]], 4);
        }),
        // A long axe, walked with like a staff.
        longaxe: () => part('longaxe', s => {
            s.paint([112, 82, 56], 0).fx(0).tube([[0, -1.05, 0, 0.022, 1], [0, 0.2, 0, 0.025, 1], [0, 1.02, 0, 0.022, 1]], 6, { cap: 3 });
            for (const z of [1, -1]) s.paint(STEEL, 0).quad([0, 0.78, z * 0.016], [0, 0.98, z * 0.016], [0, 1.08, 0.24], [0, 0.66, 0.22], [z, 0, 0.1], [0.85, 0.85, 1, 1]);
            s.paint([226, 230, 238], 0).quad([0.004, 0.66, 0.22], [0.004, 1.08, 0.24], [0, 1.09, 0.252], [0, 0.65, 0.232], [0, 0, 1]);
            s.paint(LEATHER, 0).tube([[0, -0.06, 0, 0.029, 1], [0, 0.1, 0, 0.029, 1]], 6).paint(DARK, 0).box(0, 0.88, 0, 0.03, 0.12, 0.03, 1);
        }),
        hoe: () => A.P.hoe(), rod: () => A.P.rod(),
        // A burning brand for the dark: held up in the free hand by those who carry no staff to hang a lantern from.
        torch: () => part('torch', s => {
            s.paint([104, 76, 52], 0).fx(0).tube([[0, -0.12, 0, 0.018, 1], [0, 0.34, 0, 0.024, 1]], 6, { cap: 1 });
            s.paint([60, 46, 40], 0).tube([[0, 0.3, 0, 0.03, 1], [0, 0.42, 0, 0.042, 1], [0, 0.46, 0, 0.03, 1]], 6, { cap: 2 });
            for (let i = 0; i < 3; i++) { const a = i * 2.1; s.paint([255, 160 + 36 * i, 64], 0).fx(0, 255, 110).prism(5, Math.sin(a) * 0.022, 0.42, Math.cos(a) * 0.022, 0.045, 0.6 + 0.07 * i, 0, { turn: a }); }
            s.fx(0);
        }),
    };

    // What a look wears, worked out once: which variant of each part.
    const BRONZE = Object.assign([176, 136, 84], { shine: 0.7 });
    // What a look wears, worked out once: which variant of each part.
    const kits = new WeakMap();
    function kit(look) {
        let k = kits.get(look);
        if (k) return k;
        const build = look.build || (look.skirt ? 'f' : 'm'), garb = look.garb || (look.robe ? 'robe' : look.skirt ? 'dress' : look.hat === 'helm' ? 'mail' : 'tunic'), wild = garb === 'fur' || garb === 'hide';
        const covered = look.hat === 'hood' || look.hat === 'helm' || look.hat === 'kerchief' || look.hat === 'cowl';
        const v = look.v ?? 0.5, style = look.hairStyle || (covered ? null : build !== 'm' ? (v < 0.4 ? 'long' : v < 0.75 ? 'bun' : 'braid') : v > 0.85 ? 'bald' : 'short');
        const arms = look.arms || (wild ? 'bare' : garb === 'mail' ? 'plate' : 'sleeve');
        // A woman's limbs are slighter and her shoulders narrower.
        const g = build === 'm' ? 1 : build === 'c' ? 0.88 : 0.84;
        k = {
            build, garb, shoulder: build === 'm' ? 0.268 : 0.224, hips: build === 'm' ? 0.1 : 0.098,
            thigh: P.thigh(wild ? 'fur' : 'cloth', build === 'm' ? 1 : 0.92), shin: P.shin(wild ? 'fur' : 'boot', g),
            upper: P.upper(arms === 'bare' ? 'ring' : arms === 'plate' ? 'plate' : 'sleeve', g), fore: P.fore(arms === 'bare' || arms === 'bracer' ? 'bracer' : arms === 'plate' ? 'gauntlet' : 'sleeve', g),
            torso: P.torso(build, garb), skirt: garb === 'leaf' ? P.leafskirt() : garb === 'robe' || garb === 'dress' ? P.skirt(garb === 'robe' || v > 0.3) : null,
            face: P.face(look.face || ((build === 'm' ? 'm' : 'f') + (look.paint ? 'p' : '-'))), hair: style ? P.hair(style) : null,
            beard: look.beard ? P.beard(look.beard) : build === 'm' && !look.hairStyle && v > 0.62 && look.hat !== 'helm' ? P.beard(v > 0.9 ? 'long' : 'short') : null,
        };
        kits.set(look, k);
        return k;
    }

    const tints = new Array(8).fill(null);
    // The same call as WayActors.person, and the same poses.
    function person(out, st, x, y, z, look, pose) {
        const K = kit(look), size = pose.size || 1, tau = pose.stride * TAU, mv = pose.moving ?? 1, sit = pose.sit || 0, t = pose.t || 0;
        tints[1] = look.tunic; tints[2] = look.legs; tints[3] = look.cloak; tints[4] = A.SKIN[look.skin]; tints[6] = A.HAIR[look.hair]; tints[7] = look.hatCol || look.cloak;
        const lit = pose.lit ? 1 : 0, put = model => out.stamp(model, st.top, tints, 0, 0, lit);
        // crouch: a stalking walk, low, the knees bent and the back forward.
        // vault: over a fence, a hand on the rail, the knees drawn up.
        const vault = pose.vault || 0, act0 = pose.act || '', crouch = Math.max(pose.crouch || 0, act0 === 'stroke' ? 0.75 : 0, vault * 0.6) * (1 - sit), bob = 0.028 * Math.cos(tau * 2) * mv, hip = 0.88 - 0.44 * sit - 0.17 * crouch + bob + 0.95 * vault;
        st.reset(x, y, z, pose.yaw, size).move(0, hip, 0).rx(0.05 * mv + 0.12 * sit);
        for (const side of [-1, 1]) {
            const ph = tau + (side > 0 ? Math.PI : 0), swing = 0.55 * Math.sin(ph) * mv, knee = 0.85 * Math.max(0, Math.cos(ph)) * mv;
            st.push().move(side * K.hips, 0, 0).rx((-swing * (1 - sit) - 1.45 * sit - 0.05 * mv) * (1 - vault) - 0.62 * crouch - 0.9 * vault).rz(side * 0.25 * vault);
            put(K.thigh);
            if (look.daggers) { st.push().size(side, 1, 1); put(P.dagger()); st.pop(); }
            st.move(0, -0.42, 0).rx(knee * (1 - sit) + 1.4 * sit + 1.1 * crouch);
            put(K.shin);
            st.pop();
        }
        st.rx(0.42 * crouch);
        if (K.skirt && sit < 0.5) put(K.skirt);
        // The body turns a touch with the stride, and the shoulders against the hips.
        st.ry(0.08 * Math.sin(tau) * mv);
        put(K.torso);
        if (look.apron) put(P.apron());
        if (look.cloak && look.cape !== false) { st.push().rx(0.06 + 0.14 * mv + 0.05 * Math.sin(tau * 2 - 0.9) * mv - 0.06 * sit).rz(0.05 * Math.sin(tau - 0.7) * mv).ry(0.04 * Math.sin(tau - 0.7) * mv); put(P.cloak(look.cape === 'short')); st.pop(); }       // it swings a beat behind the stride
        if (look.lamp && pose.lantern) put(P.beltlamp());
        if (look.back) { st.push(); if (look.cape === 'short') st.move(0, 0, -0.1); put(P[look.back]()); st.pop(); }      // (a quiver rides outside a cape)
        const act = pose.act || '', torch = !!(pose.lantern && look.torch && sit < 0.5);
        for (const side of [-1, 1]) {
            const ph = tau + (side > 0 ? 0 : Math.PI), holds = side > 0 && look.hand, brand = side < 0 && torch;
            let shoulder = 0.42 * Math.sin(ph) * mv, elbow = -0.25 - 0.2 * mv, out2 = 0.1;
            if (holds) { shoulder = -0.55 + 0.22 * Math.sin(tau + 0.6) * mv; elbow = -0.75; }
            if (sit > 0) { shoulder = L.mix(shoulder, -0.55, sit); elbow = L.mix(elbow, -0.9, sit); }
            if (brand) { shoulder = -1.0 + 0.05 * Math.sin(tau) * mv; elbow = -0.85; out2 = 0.3; }
            if (act === 'wave' && side < 0 && !brand) { shoulder = -2.6 + 0.25 * Math.sin(t * 9); elbow = -0.5; out2 = 0.5; }
            if (act === 'chat') { shoulder = -0.5 + 0.35 * Math.sin(t * 2.1 + side); elbow = -1.1 + 0.3 * Math.sin(t * 3.3 + side * 2); }
            if (act === 'hoe') { shoulder = -0.9 + 0.5 * Math.sin(t * 2.4); elbow = -0.7; }
            if (act === 'fish') { shoulder = -0.75; elbow = -0.5; }
            if (act === 'warm') { shoulder = -1.05 + 0.04 * Math.sin(t * 1.7 + side); elbow = -0.35; }
            // Sighting along an arrow: the bow arm out straight, the other hand back at the cheek.
            if (act === 'aim') { if (side > 0) { shoulder = -1.5; elbow = -0.06; out2 = 0.34; } else { shoulder = -1.35; elbow = -2.0; out2 = 0.5; } }
            // Tossing a knife and catching it.
            if (act === 'flip' && side > 0) { shoulder = -0.45; elbow = -1.25 + 0.12 * Math.sin(t * 3.1); out2 = 0.2; }
            if (crouch) { shoulder -= 0.4 * crouch; elbow -= 0.5 * crouch; }
            // A hand down to the cat that has come to be stroked; a hand on the rail, going over.
            if (act === 'stroke' && side > 0) { shoulder = -0.75 + 0.14 * Math.sin(t * 3.2); elbow = -0.25; out2 = 0.45; }
            if (vault && side < 0) { shoulder = L.mix(shoulder, 0.5, vault); elbow = L.mix(elbow, -0.1, vault); out2 = 0.5 * vault; }
            st.push().move(side * K.shoulder, 0.47, 0).rz(side * out2).rx(shoulder);
            put(K.upper);
            st.move(0, -0.3, 0).rx(elbow);
            put(K.fore);
            if (brand) { st.move(0, -0.34, 0.02).rx(-(shoulder + elbow) + 0.25); put(P.torch()); }
            else if (act === 'flip' && side > 0) { const up = Math.abs(Math.sin(t * 1.55)); st.move(0, -0.36, 0.03).rx(-(shoulder + elbow)).move(0, 0.1 + 0.5 * up, 0).rx(up > 0.04 ? t * 9.7 : 0); put(P.knife()); }
            else if (holds || (act === 'hoe' && side > 0) || (act === 'fish' && side > 0)) {
                // What the hand holds stays near upright, whatever the arm is doing.
                st.move(0, -0.3, 0).rx(-(shoulder + elbow) + (act === 'hoe' ? 1.0 : act === 'fish' ? 1.05 : 0.1 + 0.1 * Math.sin(tau + 0.6) * mv) - 0.12 * sit);
                st.move(0, 0.42 * sit, 0);
                if (act === 'hoe') put(P.hoe());
                else if (act === 'fish') put(P.rod());
                else if (look.hand === 'spear') put(P.spear());
                else if (look.hand === 'longaxe') put(P.longaxe());
                else if (look.hand === 'bow') { st.rx(act === 'aim' ? 0.02 : -0.1); put(P.bow(act === 'aim')); }
                else if (look.hand === 'budstaff') put(P.budstaff());
                else { put(P.staff()); put(look.hand === 'crystal' ? P.crystal() : P.crook()); if (look.hand !== 'crystal' && pose.lantern) put(P.lantern()); }
            }
            st.pop();
        }
        st.move(0, 0.63, 0).ry(pose.head || 0).rx(act === 'fish' || sit > 0.5 ? 0.12 : -0.03);
        put(K.face);
        // A blink every few seconds (each in their own time).
        if (((t * 0.23 + (look.v || 0.37) * 7) % 1) < 0.03) put(P.blink(K.build !== 'm'));
        if (K.hair) put(K.hair);
        if (K.beard) put(K.beard);
        if (look.hat) put((P[look.hat] || A.P[look.hat])());
    }

    return { P, TRUNK, kit, person };
})();
