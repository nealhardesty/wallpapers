// Wayfarer's people, close up (SPEC §10.38): the traveller, and whoever is
// near enough to the camera to be looked at. The same skeleton as
// WayActors.person, hung with rounder parts: limbs that swell and narrow on
// real joints, hands with a thumb, a face, hair with some weight to it,
// clothes with folds, belts, pouches and straps. Further off, and on the
// Low tier, WayActors' lighter figures stand in for these.

const WayPeople = (() => {
    const L = WayLogic, M = WayModels, A = WayActors, C = M.C, W = C.white, TAU = Math.PI * 2;
    const LEATHER = [96, 68, 48], DARK = [64, 46, 36], STEEL = Object.assign([176, 180, 190], { shine: 0.9 }), GOLD = C.gold, BONE = [240, 232, 212];
    const SIDES = 10;         // round a limb
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
        m: [[0, 0, 0, 0.2, 0.66], [0, 0.09, 0, 0.19, 0.66], [0, 0.2, 0, 0.18, 0.63], [0, 0.34, 0.006, 0.228, 0.6], [0, 0.46, 0.006, 0.266, 0.55], [0, 0.545, 0, 0.245, 0.48], [0, 0.6, 0, 0.085, 0.82]],
        f: [[0, 0, 0, 0.2, 0.68], [0, 0.09, 0, 0.194, 0.68], [0, 0.21, 0, 0.152, 0.68], [0, 0.33, 0.008, 0.184, 0.68], [0, 0.43, 0.012, 0.212, 0.66], [0, 0.535, 0, 0.216, 0.47], [0, 0.6, 0, 0.074, 0.84]],
        // Fuller in the hip and the breast, under her robes.
        c: [[0, 0, 0, 0.216, 0.7], [0, 0.09, 0, 0.208, 0.7], [0, 0.21, 0, 0.156, 0.7], [0, 0.32, 0.014, 0.192, 0.74], [0, 0.42, 0.024, 0.226, 0.76], [0, 0.535, 0, 0.216, 0.48], [0, 0.6, 0, 0.074, 0.84]],
    };
    // A band lying on the trunk between two heights, a little proud of it.
    const band = (build, y0, y1, out = 0.012, steps = 3) => {
        const T = TRUNK[build], at = y => { let i = 0; while (i < T.length - 2 && y > T[i + 1][1]) i++; const a = T[i], b = T[i + 1], t = L.clamp((y - a[1]) / (b[1] - a[1]), 0, 1); return [0, y, L.mix(a[2], b[2], t), L.mix(a[3], b[3], t) + out, L.mix(a[4], b[4], t)]; };
        return Array.from({ length: steps + 1 }, (_, i) => at(L.mix(y0, y1, i / steps)));
    };

    const P = {
        thigh: v => part('thigh:' + v, s => {
            const skin = v !== 'cloth';
            s.paint(W, skin ? 4 : 2).fx(0).tube([[0, 0.05, 0, 0.098, 1.08], [0, -0.07, 0.006, 0.113, 1.1], [0, -0.21, 0.01, 0.099, 1.08], [0, -0.35, 0.004, 0.08, 1.05], [0, -0.44, 0, 0.074, 1]], SIDES, { k: skin ? null : fold(0.1), cap: 1 });
            ball(s, 0, -0.43, 0.012, 0.076, 0.07, 0.078, 6, 3);                                                                       // the knee
            if (v === 'fur') s.paint(W, 1).tube([[0, 0.06, 0, 0.112, 1.08], [0, -0.04, 0.004, 0.126, 1.1], [0, -0.14, 0.008, 0.118, 1.1]], 8, { k: fur, rag: rag(2) });
        }),
        shin: v => part('shin:' + v, s => {
            const skin = v !== 'boot', furry = v === 'fur';
            s.paint(W, skin ? 4 : 2).fx(0).tube([[0, 0.03, 0, 0.075, 1.05], [0, -0.07, -0.012, 0.088, 1.1], [0, -0.17, -0.01, 0.074, 1.05], [0, -0.26, 0, 0.058, 1]], SIDES, { k: skin ? null : fold(0.08, 1.3) });
            // The boot: a turned cuff, a shaft, a heel and a toe, on a sole.
            s.paint(furry ? W : LEATHER, furry ? 1 : 0).tube([[0, -0.2, 0, 0.084, 1.05], [0, -0.3, 0, 0.071, 1], [0, -0.39, 0.008, 0.074, 1], [0, -0.455, 0.012, 0.082, 1]], 8, { k: furry ? fur : (i, k) => 1 - 0.05 * i });
            s.tube([[0, -0.15, -0.002, furry ? 0.1 : 0.09, 1.05], [0, -0.215, 0, furry ? 0.104 : 0.095, 1.05]], 8, { k: furry ? fur : null, rag: furry ? rag(0, 0.3) : null });
            s.tube([[0, -0.412, -0.035, 0.07, 0.74], [0, -0.418, 0.07, 0.078, 0.68], [0, -0.43, 0.16, 0.067, 0.56], [0, -0.44, 0.218, 0.034, 0.5]], 8, { cap: 3, k: furry ? fur : null });
            s.paint([54, 40, 32], 0).box(0, -0.468, 0.075, 0.074, 0.014, 0.152, 1);
            if (furry) for (const y of [-0.275, -0.345]) s.paint(LEATHER, 0).tube([[0, y + 0.013, 0.002, 0.081, 1], [0, y - 0.013, 0.004, 0.08, 1]], 8);        // bound with thongs
            else s.paint(GOLD, 0).box(0.086, -0.19, 0, 0.008, 0.016, 0.016, 1);
        }),
        upper: v => part('upper:' + v, s => {
            const skin = v === 'bare' || v === 'ring';
            s.paint(W, skin ? 4 : 1).fx(0);
            ball(s, 0, -0.015, 0, skin ? 0.098 : 0.108, 0.098, skin ? 0.098 : 0.106, 8, 4);
            s.tube([[0, -0.03, 0, 0.09, 1], [0, -0.13, 0.006, skin ? 0.088 : 0.095, 1.05], [0, -0.24, 0, 0.072, 1], [0, -0.31, 0, 0.066, 1]], SIDES, { k: skin ? null : fold(0.1, 1.1) });
            ball(s, 0, -0.305, -0.004, 0.066, 0.06, 0.068, 6, 3);
            if (v === 'ring') s.paint(GOLD, 0).tube([[0, -0.132, 0.005, 0.095, 1.05], [0, -0.166, 0.005, 0.094, 1.05]], 8);
            if (v === 'plate') { s.paint(STEEL, 0).blob(0, 0.005, 0, 0.128, 0.088, 0.128, { segs: 8, bands: 4, lump: 0, under: 0.6 }); s.tube([[0, -0.07, 0, 0.112, 1], [0, -0.13, 0, 0.104, 1]], 8); }
        }),
        fore: v => part('fore:' + v, s => {
            const skin = v === 'bare' || v === 'bracer';
            s.paint(W, skin ? 4 : 1).fx(0).tube([[0, 0.01, 0, 0.066, 1], [0, -0.07, 0.004, 0.073, 1.05], [0, -0.19, 0, 0.055, 1], [0, -0.275, 0, 0.045, 1]], SIDES, { k: skin ? null : fold(0.08, 1.5) });
            if (v === 'sleeve') s.paint(LEATHER, 0).tube([[0, -0.2, 0, 0.063, 1], [0, -0.268, 0, 0.056, 1]], 8);
            if (v === 'bracer') {
                s.paint(LEATHER, 0).tube([[0, -0.085, 0.003, 0.08, 1.05], [0, -0.17, 0.001, 0.066, 1], [0, -0.258, 0, 0.054, 1]], 8, { k: (i, k) => k % 2 ? 0.84 : 1 });
                s.paint(GOLD, 0).tube([[0, -0.08, 0.003, 0.083, 1.05], [0, -0.1, 0.003, 0.081, 1.05]], 8).tube([[0, -0.245, 0, 0.058, 1], [0, -0.262, 0, 0.056, 1]], 8);
            }
            if (v === 'gauntlet') s.paint(STEEL, 0).tube([[0, -0.09, 0, 0.082, 1], [0, -0.17, 0, 0.066, 1], [0, -0.265, 0, 0.058, 1]], 8);
            // The hand: a palm, the fingers curled as one, and a thumb.
            s.paint(W, 4);
            ball(s, 0, -0.322, 0.004, 0.043, 0.05, 0.03, 7, 4);
            ball(s, 0, -0.384, 0.016, 0.039, 0.036, 0.027, 6, 3);
            s.tube([[0.012, -0.3, 0.026, 0.016, 1], [0.02, -0.342, 0.05, 0.0145, 1], [0.016, -0.382, 0.058, 0.009, 1]], 5, { cap: 2 });
        }),
        // build m or f; garb: tunic, robe, dress, mail, fur, hide.
        torso: (build, garb) => part(`torso:${build}:${garb}`, s => {
            const T = TRUNK[build], bare = garb === 'fur' || garb === 'hide', wide = T[0][3], trunk = build === 'm' ? 'm' : build;
            s.paint(W, bare ? 4 : 1).fx(0).tube(T, 14, { k: bare ? null : garb === 'mail' ? mail : fold(0.1, 0.7), cap: 1 });
            s.paint(W, 4).tube([[0, 0.57, 0, 0.07, 0.9], [0, 0.67, 0.004, 0.058, 0.95]], 8);                                  // the neck
            if (garb === 'fur') {
                // A fur top, tied behind the neck; a necklace of teeth.
                s.paint(W, 1).tube(band('f', 0.352, 0.495, 0.02, 3).map((r, i) => [r[0], r[1], r[2] + 0.006, r[3] + (i === 1 || i === 2 ? 0.008 : 0), r[4] * 1.06]), 12, { k: fur, rag: (i, k) => i === 0 || i === 3 ? 0.95 + 0.1 * noise(k, i) : 1 });
                for (const x of [-1, 1]) s.paint(LEATHER, 0).tube([[x * 0.1, 0.49, 0.13, 0.011, 1], [x * 0.085, 0.575, 0.075, 0.011, 1], [x * 0.05, 0.6, -0.02, 0.011, 1], [0, 0.585, -0.075, 0.011, 1]], 4);
                for (let i = -3; i <= 3; i++) { const a = i * 0.3; s.paint(BONE, 0).tube([[Math.sin(a) * 0.1, 0.545 - Math.cos(a) * 0.035, 0.07 + Math.cos(a) * 0.075, 0.009, 1], [Math.sin(a) * 0.105, 0.515 - Math.cos(a) * 0.045, 0.08 + Math.cos(a) * 0.08, 0.002, 1]], 4); }
                s.paint(LEATHER, 0).tube([[-0.1, 0.57, 0, 0.012, 1], [0, 0.56, 0.065, 0.012, 1], [0.1, 0.57, 0, 0.012, 1]], 4, { ref: [0, 1, 0] });
            } else if (garb === 'hide') {
                // A pelt across the shoulders, and a strap from shoulder to hip.
                s.paint(W, 1).tube([[0, 0.44, 0, 0.3, 0.56], [0, 0.52, 0, 0.3, 0.56], [0, 0.6, 0, 0.2, 0.62], [0, 0.63, 0, 0.11, 0.8]], 12, { k: fur, rag: rag(0, 0.3) });
            } else {
                s.paint(W, 1).tube([[0, 0.565, 0, 0.115, 0.8], [0, 0.615, 0, 0.088, 0.86]], 10, { k: (i, k) => 0.9 });               // a collar
                if (garb === 'tunic') s.paint(DARK, 0).quad([-0.012, 0.42, wide * 0.6 + 0.002], [0.012, 0.42, wide * 0.6 + 0.002], [0.03, 0.58, 0.085], [-0.03, 0.58, 0.085], [0, 0.3, 0.95]);      // laced at the throat
            }
            if (bare) {
                // The strap the axe hangs from, shoulder to hip; then a broad belt, fur trunks and a fur kilt cut ragged.
                const tilt = 0.62, c = Math.cos(tilt), n = Math.sin(tilt), r = build === 'f' ? 0.248 : 0.274;
                s.paint(LEATHER, 0).tube([[0.014 * n, 0.33 - 0.014 * c, 0, r, build === 'f' ? 0.565 : 0.54], [-0.014 * n, 0.33 + 0.014 * c, 0, r, build === 'f' ? 0.565 : 0.54]], 14, { ref: [0, 0, 1] });
                s.paint(GOLD, 0).box(-0.06, 0.4, build === 'f' ? 0.135 : 0.15, 0.02, 0.02, 0.008, 1);
                s.paint(W, 1).tube([[0, -0.085, 0, 0.15, 0.78], [0, -0.01, 0, 0.207, 0.7], [0, 0.1, 0, 0.202, 0.69]], 12, { k: fur });
                s.tube([[0, 0.12, 0, 0.208, 0.7], [0, 0.02, 0, 0.228, 0.74], [0, -0.1, 0, 0.262, 0.8], [0, -0.23, 0, 0.292, 0.84]], 14, { k: fur, rag: (i, k) => i === 3 ? 0.8 + 0.3 * noise(k, 5) : 1 });
            }
            // A belt with a buckle; a pouch at one hip and a knife at the other.
            const by = garb === 'fur' || garb === 'hide' ? 0.12 : 0.15, belt = band(trunk, by - 0.035, by + 0.035, 0.014, 1);
            if (garb === 'fur' || garb === 'hide') { belt[0][3] += 0.012; belt[1][3] += 0.012; }
            s.paint(garb === 'robe' ? GOLD : garb === 'leaf' ? [84, 130, 66] : LEATHER, 0).tube(belt, 12);
            s.paint(GOLD, 0).box(0, by, belt[0][3] * belt[0][4] + 0.004, 0.034, 0.034, 0.008, 1).paint(DARK, 0).box(0, by, belt[0][3] * belt[0][4] + 0.011, 0.016, 0.016, 0.004, 1);
            if (garb !== 'robe' && garb !== 'dress' && garb !== 'leaf') {
                s.paint([134, 98, 66], 0).box(belt[0][3] * 0.82, by - 0.07, 0.07, 0.035, 0.06, 0.05, 0.75, [DARK, 0]).paint(GOLD, 0).box(belt[0][3] * 0.82 + 0.036, by - 0.05, 0.07, 0.004, 0.012, 0.012, 1);
                s.paint(DARK, 0).tube([[-belt[0][3] * 0.9, by, 0.05, 0.022, 0.6], [-belt[0][3] * 0.98, by - 0.2, 0.03, 0.012, 0.6]], 5, { cap: 2 }).paint(BONE, 0).tube([[-belt[0][3] * 0.9, by + 0.07, 0.055, 0.014, 1], [-belt[0][3] * 0.9, by, 0.05, 0.016, 1]], 5, { cap: 1 });
            }
            if (garb === 'tunic' || garb === 'mail' || garb === 'leathers') s.paint(W, 1).tube([[0, 0.12, 0, wide + 0.012, 0.68], [0, 0, 0, wide + 0.035, 0.72], [0, -0.12, 0, wide + 0.058, 0.76], [0, -0.22, 0, wide + 0.074, 0.78]], 12, { k: garb === 'mail' ? mail : fold(0.14, 0.4), rag: rag(3, 0.08) });
            if (garb === 'mail') for (const z of [1, -1]) s.paint(W, 3).quad([-0.13, -0.3, z * 0.2], [0.13, -0.3, z * 0.2], [0.15, 0.54, z * 0.158], [-0.15, 0.54, z * 0.158], [0, 0.05, z], [0.75, 0.75, 1, 1]);        // a tabard
            if (garb === 'dress') s.paint(W, 3).tube(band('f', 0.17, 0.36, 0.01, 2), 12, { k: (i, k) => k === 3 ? 0.6 : 1 });           // a laced bodice
            if (garb === 'leaf') {
                // A druid's robe: a bodice of bark-brown leather laced with vine, a mantle of feathers on the shoulders, and a stone at the belt.
                s.paint([98, 72, 52], 0).tube(band(trunk, 0.16, 0.4, 0.011, 3), 14, { k: (i, k) => 0.82 + 0.2 * noise(k, i) });
                for (let i = 0; i < 4; i++) s.paint([120, 170, 84], 0).tube([[-0.04, 0.2 + i * 0.05, wide * 0.72, 0.006, 1], [0.04, 0.225 + i * 0.05, wide * 0.72 + 0.004, 0.006, 1]], 4);
                for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, r0 = 0.2, r1 = 0.33, c = Math.cos(a), n = Math.sin(a), tone = 0.8 + 0.3 * noise(i, 7); s.paint([255 * tone, 255 * tone, 255 * tone], 3).tri([n * r0 - c * 0.06, 0.6, c * r0 * 0.6 + n * 0.04], [n * r0 + c * 0.06, 0.6, c * r0 * 0.6 - n * 0.04], [n * r1, 0.44 + 0.02 * (i % 2), c * r1 * 0.62], [n * 0.5, 0.8, c * 0.5]); }
                s.paint([90, 220, 190], 0).fx(0, 200).blob(0, 0.15, wide * 0.7 + 0.022, 0.024, 0.024, 0.012, { segs: 6, bands: 3, lump: 0, under: 1 }).fx(0);
            }
            if (garb === 'leathers') {
                // Fitted leathers: a second belt slung low, pouches, a strap across the chest with a buckle, a high collar.
                s.paint(DARK, 0).tube(band(trunk, 0.2, 0.44, 0.008, 3), 14, { k: (i, k) => k % 3 ? 0.92 : 0.7 });
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
            for (let i = -6; i <= 6; i++) { const u = i / 6; limb.push([0, u * 0.82, 0.13 - 0.2 * u * u + 0.09 * u * u * u * u, 0.017 - 0.008 * Math.abs(u), 0.7]); }
            s.paint([124, 84, 52], 0).fx(0).tube(limb, 6, { ref: [1, 0, 0], k: (i, k) => 0.9 + 0.12 * noise(i, k) });
            s.paint(LEATHER, 0).tube([[0, -0.07, 0.128, 0.022, 0.8], [0, 0.07, 0.128, 0.022, 0.8]], 6, { ref: [1, 0, 0] });
            const tipZ = 0.13 - 0.2 + 0.09, pull = drawn ? -0.46 : tipZ;
            s.paint([236, 232, 220], 0).tube([[0, 0.82, tipZ, 0.004, 1], [0, 0.02, pull, 0.004, 1], [0, -0.82, tipZ, 0.004, 1]], 3, { ref: [1, 0, 0] });
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
        // A helm of bark and bronze over the brow, with a stone in it and a stag's antlers.
        antlers: () => part('antlers', s => {
            s.paint(W, 7).fx(0).tube([[0, 0.2, -0.02, 0.166, 1.0], [0, 0.27, -0.03, 0.16, 0.98], [0, 0.33, -0.04, 0.11, 0.98], [0, 0.355, -0.04, 0, 1]], 12, { k: (i, k) => 0.84 + 0.2 * noise(i, k) });
            s.paint(BRONZE, 0).tube([[0, 0.2, -0.016, 0.17, 1.0], [0, 0.235, -0.018, 0.168, 1.0]], 12);
            for (const x of [-1, 1]) {
                s.paint(BRONZE, 0).tri([x * 0.1, 0.22, 0.135], [x * 0.168, 0.22, 0.03], [x * 0.14, 0.09, 0.105], [x * 0.7, 0, 0.7]);                              // a cheek-piece like a leaf
                const beam = [[x * 0.11, 0.3, -0.03, 0.026, 1], [x * 0.2, 0.44, -0.07, 0.022, 1], [x * 0.3, 0.6, -0.08, 0.018, 1], [x * 0.33, 0.78, -0.04, 0.012, 1], [x * 0.3, 0.9, 0.02, 0, 1]];
                s.paint(BONE, 0).tube(beam, 5, { k: (i, k) => 0.9 + 0.12 * noise(i, k) });
                for (const [i, dx, dy, dz] of [[1, 0.02, 0.17, 0.12], [2, 0.12, 0.14, 0.06], [3, 0.1, 0.08, -0.1]]) s.tube([[beam[i][0], beam[i][1], beam[i][2], 0.015, 1], [beam[i][0] + x * dx, beam[i][1] + dy, beam[i][2] + dz, 0, 1]], 4);
            }
            s.paint([90, 230, 200], 0).fx(0, 230).blob(0, 0.245, 0.15, 0.026, 0.032, 0.014, { segs: 6, bands: 3, lump: 0, under: 1 }).fx(0);
            s.paint(BRONZE, 0).tri([-0.05, 0.235, 0.145], [0.05, 0.235, 0.145], [0, 0.15, 0.165], [0, 0.2, 0.98]);
        }),
        // A cowl, and a scarf drawn up over the nose.
        cowl: () => part('cowl', s => {
            const ring = (z, r, y, sq) => [0, y, z, r, sq];
            s.paint(W, 7).fx(0).tube([ring(0.14, 0.168, 0.2, 1.1), ring(0.07, 0.19, 0.2, 1.1), ring(-0.04, 0.2, 0.2, 1.08), ring(-0.14, 0.17, 0.21, 1.02), ring(-0.21, 0.09, 0.22, 1), ring(-0.24, 0, 0.22, 1)], 10, { cap: 2, k: fold(0.1, 0.6) });
            s.paint([70, 70, 70], 7).tube([ring(0.138, 0.162, 0.2, 1.1), ring(0.05, 0.18, 0.2, 1.1)], 10, { ao: () => 0.55 });
            s.paint(W, 7).tube([[0, 0.06, -0.01, 0.17, 0.9], [0, -0.02, -0.01, 0.23, 0.8], [0, -0.07, -0.01, 0.262, 0.76]], 10, { k: fold(0.14, 0.5), rag: rag(2, 0.08) });
            s.paint([210, 210, 210], 7).tube([[0, 0.04, 0.03, 0.118, 1.0], [0, 0.1, 0.034, 0.126, 1.02], [0, 0.148, 0.03, 0.132, 1.04]], 10, { k: fold(0.12, 1.1) });
        }),
        face: v => part('face:' + v, s => {
            const f = v[0] !== 'm', paint = v[1] === 'p', elf = v[0] === 'e';
            // A flush in the cheeks and a warmer nose and ears, painted into the skin.
            s.mark((x, y, z) => { const c = Math.max(0, 1 - Math.hypot(Math.abs(x) - 0.07, y - 0.125, (z - 0.11) * 0.7) / 0.05); return c > 0 ? [255, 255 - (f ? 34 : 20) * c, 255 - (f ? 30 : 22) * c] : null; });
            s.paint(W, 4).fx(0).blob(0, 0.168, 0, f ? 0.14 : 0.148, 0.168, 0.152, { segs: 12, bands: 8, lump: 0, under: 0.82 });
            s.blob(0, 0.072, 0.036, f ? 0.086 : 0.108, f ? 0.066 : 0.07, f ? 0.094 : 0.102, { segs: 9, bands: 5, lump: 0, under: 0.8 });                 // the jaw
            s.mark(null);
            s.tube(f ? [[0, 0.19, 0.136, 0.009, 1], [0, 0.15, 0.156, 0.013, 1], [0, 0.126, 0.158, 0.0165, 0.85], [0, 0.114, 0.142, 0.009, 1]] : [[0, 0.2, 0.134, 0.011, 1], [0, 0.15, 0.164, 0.019, 1], [0, 0.118, 0.158, 0.024, 0.8], [0, 0.106, 0.14, 0.011, 1]], 6);           // the nose
            if (!f) s.box(0, 0.207, 0.136, 0.09, 0.012, 0.014, 1);                                                                    // a heavy brow
            for (const x of [-1, 1]) {
                s.paint(W, 4).blob(x * 0.146, 0.158, -0.004, 0.02, 0.038, 0.028, { segs: 6, bands: 3, lump: 0 });
                const ey = f ? 0.172 : 0.175, ew = f ? 0.025 : 0.022, eh = f ? 0.0155 : 0.0125;
                s.paint([250, 248, 244], 0).gloss(0.5).blob(x * 0.054, ey, 0.136, ew, eh, 0.012, { segs: 8, bands: 3, lump: 0, under: 1 });
                if (elf) s.paint(v[1] === '2' ? [150, 230, 255] : [255, 214, 120], 0).fx(0, 170).blob(x * 0.055, ey, 0.143, 0.0125, 0.0135, 0.007, { segs: 7, bands: 3, lump: 0, under: 1 }).fx(0);
                else s.paint(f ? [56, 120, 96] : [84, 66, 50], 0).blob(x * 0.055, ey, 0.143, f ? 0.012 : 0.0105, f ? 0.013 : 0.0115, 0.007, { segs: 7, bands: 3, lump: 0, under: 1 });
                s.paint([22, 18, 18], 0).gloss(1).blob(x * 0.055, ey, 0.1475, 0.0055, 0.006, 0.004, { segs: 6, bands: 3, lump: 0, under: 1 }).gloss(0);
                s.paint([28, 22, 22], 0).quad([x * 0.028, ey + eh - 0.003, 0.149], [x * 0.082, ey + eh - 0.001, 0.1405], [x * 0.084, ey + eh + 0.003, 0.14], [x * 0.028, ey + eh + 0.001, 0.149], [0, 0.3, 0.95]);        // the lid's line
                // A brow: arched and fine, or straight and heavy.
                s.paint(W, 6).quad([x * 0.026, ey + (f ? 0.03 : 0.023), 0.151], [x * 0.086, ey + (f ? 0.036 : 0.029), 0.141], [x * 0.086, ey + (f ? 0.041 : 0.037), 0.141], [x * 0.026, ey + (f ? 0.036 : 0.032), 0.151], [0, 0, 1], [0.6, 0.6, 0.6, 0.6]);
                // Warpaint: two bars across each cheek.
                if (paint) for (const [y, w2] of [[0.146, 0.04], [0.124, 0.03]]) s.paint([52, 110, 168], 0).quad([x * 0.066, y - 0.007, 0.137], [x * (0.066 + w2), y - 0.003, 0.137 - w2 * 0.66], [x * (0.066 + w2), y + 0.005, 0.137 - w2 * 0.66], [x * 0.066, y + 0.003, 0.137], [x * 0.5, 0, 0.86]);
                if (elf) {
                    // The Evenfolk's long ears, swept back; and their own marks: three pale stars along the cheekbone (a line at the chin for some).
                    s.paint(W, 4).tube([[x * 0.138, 0.165, 0.0, 0.03, 0.5], [x * 0.2, 0.215, -0.08, 0.03, 0.4], [x * 0.262, 0.29, -0.2, 0.016, 0.4], [x * 0.285, 0.33, -0.27, 0, 1]], 6, { ref: [0, 1, 0] });
                    for (let i = 0; i < 3; i++) s.paint([236, 250, 255], 0).fx(0, 120).blob(x * (0.07 + i * 0.022), 0.15 - i * 0.004, 0.134 - i * 0.012, 0.0075 - i * 0.001, 0.0075 - i * 0.001, 0.004, { segs: 5, bands: 3, lump: 0, under: 1 }).fx(0);
                }
                // The corners of the mouth, turned up a little.
                s.paint(f ? [168, 70, 74] : [140, 90, 80], 0).quad([x * 0.016, 0.0925, 0.1385], [x * (f ? 0.034 : 0.04), 0.098, 0.133], [x * (f ? 0.034 : 0.04), 0.1, 0.133], [x * 0.016, 0.098, 0.1385], [x * 0.2, 0, 0.98]);
            }
            s.paint(f ? [176, 74, 78] : [146, 94, 84], 0).blob(0, 0.0975, 0.132, f ? 0.021 : 0.026, 0.0055, 0.008, { segs: 6, bands: 3, lump: 0, under: 1 });
            s.paint(f ? [204, 98, 98] : [160, 106, 94], 0).blob(0, 0.0885, 0.131, f ? 0.017 : 0.022, 0.0065, 0.008, { segs: 6, bands: 3, lump: 0, under: 1 });
            if (elf && v[1] === '1') s.paint([236, 250, 255], 0).fx(0, 120).quad([-0.004, 0.03, 0.128], [0.004, 0.03, 0.128], [0.004, 0.076, 0.136], [-0.004, 0.076, 0.136], [0, 0, 1]).fx(0);
        }),
        hair: v => part('hair:' + v, s => {
            s.paint(W, 6).fx(0);
            const strands = (i, k) => 0.86 + 0.22 * noise(k, 1) - 0.03 * i;
            if (v !== 'bald') {
                s.mark((x, y, z) => { const k = 0.8 + 0.2 * Math.abs(Math.sin(Math.atan2(x, y - 0.1) * 9)); return [255 * k, 255 * k, 255 * k]; });      // combed back from the brow
                s.blob(0, 0.21, -0.026, 0.16, 0.162, 0.162, { segs: 12, bands: 6, lump: 0.04, seed: 0.4, under: 0.75 });
                s.mark(null);
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
            const COLS = 14, ROWS = short ? 5 : 9, at = (i, j) => {
                const u = i / COLS * 2 - 1, v = j / ROWS * (short ? 0.5 : 1), w = 0.275 + 0.2 * v, wrap = 1 - u * u;
                return [u * w * (1 + 0.05 * Math.cos(i * 1.9 + 1) * v), 0.56 - 1.16 * v, -0.15 - (0.17 * Math.sin(v * 2.2) + 0.05 * Math.cos(i * 1.8) * v) * (0.35 + 0.65 * wrap) + 0.17 * (1 - wrap)];
            };
            const corner = (i, j, inside) => {
                const p = at(i, j), a = at(Math.max(i - 1, 0), j), b = at(Math.min(i + 1, COLS), j), c = at(i, Math.max(j - 1, 0)), d = at(i, Math.min(j + 1, ROWS));
                const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - c[0], vy = d[1] - c[1], vz = d[2] - c[2];
                let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
                const l = -(Math.hypot(nx, ny, nz) || 1) * Math.sign(nz || 1);
                nx /= l; ny /= l; nz /= l;                      // facing back, away from the body
                const k = (1 - 0.03 * j) * (0.86 + 0.14 * Math.cos(i * 1.8) * (j / ROWS)) * (inside ? 0.55 : 1);
                s.fx(0, 0, Math.round(j * j * 1.7));
                s.v(p[0] * (inside ? 0.97 : 1), p[1], p[2] + (inside ? 0.014 : 0), nx, ny, nz, inside ? 0.6 : 1, k);
            };
            s.paint(W, 3);
            for (const inside of [false, true]) for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) { corner(i, j, inside); corner(i, j + 1, inside); corner(i + 1, j + 1, inside); corner(i, j, inside); corner(i + 1, j + 1, inside); corner(i + 1, j, inside); }
            s.fx(0).tube([[0, 0.46, 0, 0.3, 0.7], [0, 0.53, 0, 0.26, 0.68], [0, 0.6, 0, 0.16, 0.74]], 12, { k: fold(0.12, 0.5) });
            s.paint(GOLD, 0).gloss(0.8).blob(0, 0.52, 0.185, 0.03, 0.03, 0.014, { segs: 6, bands: 3, lump: 0 }).gloss(0);
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
        k = {
            build, garb, shoulder: build === 'm' ? 0.3 : 0.275,
            thigh: P.thigh(wild ? 'fur' : 'cloth'), shin: P.shin(wild ? 'fur' : 'boot'),
            upper: P.upper(arms === 'bare' ? 'ring' : arms === 'plate' ? 'plate' : 'sleeve'), fore: P.fore(arms === 'bare' || arms === 'bracer' ? 'bracer' : arms === 'plate' ? 'gauntlet' : 'sleeve'),
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
        const crouch = (pose.crouch || 0) * (1 - sit), bob = 0.028 * Math.cos(tau * 2) * mv, hip = 0.88 - 0.44 * sit - 0.17 * crouch + bob;
        st.reset(x, y, z, pose.yaw, size).move(0, hip, 0).rx(0.05 * mv + 0.12 * sit);
        for (const side of [-1, 1]) {
            const ph = tau + (side > 0 ? Math.PI : 0), swing = 0.55 * Math.sin(ph) * mv, knee = 0.85 * Math.max(0, Math.cos(ph)) * mv;
            st.push().move(side * 0.105, 0, 0).rx(-swing * (1 - sit) - 1.45 * sit - 0.05 * mv - 0.62 * crouch);
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
        if (look.cloak && look.cape !== false) { st.push().rx(0.06 + 0.14 * mv + 0.05 * Math.sin(tau * 2) * mv - 0.06 * sit).rz(0.035 * Math.sin(tau) * mv); put(P.cloak(look.cape === 'short')); st.pop(); }
        if (look.lamp && pose.lantern) put(P.beltlamp());
        if (look.back) put(P[look.back]());
        const act = pose.act || '', torch = !!(pose.lantern && look.torch && sit < 0.5);
        for (const side of [-1, 1]) {
            const ph = tau + (side > 0 ? 0 : Math.PI), holds = side > 0 && look.hand, brand = side < 0 && torch;
            let shoulder = 0.42 * Math.sin(ph) * mv, elbow = -0.25 - 0.2 * mv, out2 = 0.12;
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
            st.push().move(side * K.shoulder, 0.5, 0).rz(side * out2).rx(shoulder);
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
        if (K.hair) put(K.hair);
        if (K.beard) put(K.beard);
        if (look.hat) put((P[look.hat] || A.P[look.hat])());
    }

    return { P, TRUNK, kit, person };
})();
