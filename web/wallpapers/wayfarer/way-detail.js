// Wayfarer, seen close and seen grand (SPEC §10.38). Two things live here.
//
// The fine models: what stands near the road in the squares about the
// traveller is built from these instead of WayModels' plainer ones: trees
// with roots, boughs and foliage in clumps, boulders in facets, a well with
// its bucket, a fence of round posts.
//
// And what a grand city is made of: its gatehouse and drawbridge, the castle
// on its rock (an inner wall, a great keep, towers of several heights, a
// chapel, a hall), the ramp up to it, the cathedral, the guildhall, the
// market hall and the market's pillar. Each has a `lite` build for the far
// squares, so the skyline is carried a long way down the road.

const WayDetail = (() => {
    const L = WayLogic, M = WayModels, C = M.C, TAU = Math.PI * 2;
    const hashf = (a, b) => { const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); };
    const LIGHT = [176, 172, 164], WINDOW = [255, 214, 140];

    // ---- Trees ------------------------------------------------------------------------------
    // The same kinds, sizes and leans as WayModels' trees (so one can stand in for the other), with more to them.
    // Slot 1 is the leaf, 2 the trunk, 3 blossom or fruit.
    // leafy (High): leaves on the clumps and fronds on a fir; without (Medium), the six sprays a clump had before.
    const tree = (kind, variant, leafy = true) => M.model(`fine:${kind}:${variant}${leafy ? '' : ':plain'}`, s => {
        const r = k => M.rnd(variant + 1, k + kind.length * 3), lean = (r(1) - 0.5) * 0.5, lz = (r(2) - 0.5) * 0.4;
        const bark = (i, k) => (k % 2 ? 0.74 : 1.04) * (0.86 + 0.2 * hashf(i * 7 + k, variant + 1));          // ridged
        const trunk = (h, r0, r1, col = C.trunk, roots = 4) => {
            s.paint(col, 2).fx(0).tube([[0, -0.4, 0, r0 * 1.6, 1], [lean * 0.02, 0.2, lz * 0.02, r0 * 1.12, 1], [lean * 0.12, h * 0.25, lz * 0.12, r0 * 0.96, 1], [lean * 0.42, h * 0.55, lz * 0.42, (r0 + r1) / 2, 1], [lean * 0.8, h * 0.85, lz * 0.8, r1 * 1.05, 1], [lean, h, lz, r1, 1]], 10, { k: bark, ao: i => i ? 1 : 0.55 });
            for (let i = 0; i < roots; i++) { const a = i / roots * TAU + r(30) * 6; s.tube([[Math.sin(a) * r0 * 0.5, 0.55, Math.cos(a) * r0 * 0.5, r0 * 0.42, 1], [Math.sin(a) * r0 * 1.7, 0.04, Math.cos(a) * r0 * 1.7, r0 * 0.3, 1], [Math.sin(a) * r0 * 2.8, -0.3, Math.cos(a) * r0 * 2.8, r0 * 0.1, 1]], 5, { k: bark, ao: () => 0.7 }); }
        };
        const bough = (from, to, r0, col = C.trunk) => s.paint(col, 2).fx(0).tube([[from[0], from[1], from[2], r0, 1], [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 + 0.25, (from[2] + to[2]) / 2, r0 * 0.7, 1], [to[0], to[1], to[2], r0 * 0.34, 1]], 5, { k: bark });
        // A clump of leaf, lit as part of the whole crown, with its own leaves standing out of it (the eighth pass: they
        // took the place of six sprays), so its edge against the sky is leaves and not a ball.
        let crown = null;
        const clump = (x, y, z, rx, ry, rz, sway, n, tone = 1, o = {}) => {
            s.paint([255 * tone, 255 * tone, 255 * tone], 1).fx(sway).blob(x + lean, y, z + lz, rx, ry, rz, { segs: 8, bands: 5, lump: 0.17, seed: variant + n * 0.37 + 0.1, under: 0.55, crown, ...o });
            if (!leafy) {
                for (let i = 0; i < 6; i++) {
                    const a = i * 2.4 + n, up = 0.9 - 1.5 * hashf(i, n + variant), c = Math.sqrt(Math.max(0, 1 - up * up)), ox = Math.sin(a) * c, oz = Math.cos(a) * c, t2 = tone * (0.86 + 0.3 * hashf(i, n + 7));
                    const px = x + lean + ox * rx * 0.94, py = y + up * ry * 0.94, pz = z + lz + oz * rz * 0.94, w = 0.34 * Math.min(rx, 2.2) / 1.6, tx = -oz * w, tz = ox * w;
                    s.paint([255 * t2, 255 * t2, 255 * t2], 1).fx(Math.min(255, sway + 50)).tri([px - tx, py - 0.1, pz - tz], [px + tx, py + 0.1, pz + tz], [px + ox * w * 2.4, py + up * w * 2.4 + 0.1, pz + oz * w * 2.4], [ox, up * 0.6 + 0.4, oz], [0.8, 0.8, 1]);
                }
                return;
            }
            s.fx(Math.min(255, sway + 30)).leaves(x + lean, y, z + lz, rx * 1.05, ry * 1.05, rz * 1.05, Math.round(L.clamp((rx + rz) * ry * 9, 24, 70)), o.leaf || Math.min(0.95, 0.4 + rx * 0.15), { seed: variant * 3 + n, crown, thin: o.thin, droop: o.droop });
        };
        if (kind === 'oak' || kind === 'apple') {
            const b = kind === 'oak' ? 1 : 0.62;
            crown = [lean, 5.3 * b, lz, 0.55, 3.6 * b];
            trunk(3.5 * b, 0.5 * b, 0.32 * b);
            clump(0, 5.7 * b, 0, 2.5 * b, 2.0 * b, 2.5 * b, 50, 1, 1, { segs: 8, bands: 5 });
            for (let i = 0; i < 6; i++) {
                const a = i * 1.05 + r(3) * 6, d = (1.75 + 0.5 * r(4 + i)) * b, y = (4.1 + 1.5 * r(10 + i) + (i % 2) * 0.5) * b;
                clump(Math.sin(a) * d, y, Math.cos(a) * d, (1.45 + 0.4 * r(16 + i)) * b, 1.2 * b, (1.45 + 0.4 * r(22 + i)) * b, 70, 2 + i, 0.88 + 0.2 * r(40 + i));
                if (i % 2 === 0) bough([lean * 0.8, 2.9 * b, lz * 0.8], [Math.sin(a) * d * 0.8 + lean, y - 0.5 * b, Math.cos(a) * d * 0.8 + lz], 0.17 * b);
            }
            clump(0.5 * b, 7.0 * b, -0.3 * b, 1.5 * b, 1.0 * b, 1.5 * b, 80, 9, 1.08);
            if (kind === 'apple') for (let i = 0; i < 9; i++) { const a = i * 2.4, y = 2.6 + 1.9 * r(10 + i), rr = 1.9 + 0.5 * r(20 + i); s.paint(C.white, 3).fx(60).blob(Math.sin(a) * rr + lean, y, Math.cos(a) * rr, 0.22, 0.22, 0.22, { segs: 5, bands: 3, lump: 0 }); }
        } else if (kind === 'poplar') {
            crown = [lean, 6.6, lz, 0.5, 3.2];
            trunk(3.0, 0.32, 0.2, C.trunk, 3);
            for (let i = 0; i < 6; i++) { const a = i * 2.2 + r(5) * 6, y = 2.9 + i * 1.55, w = 1.3 * (1 - Math.abs(i - 2.2) * 0.13); clump(Math.sin(a) * 0.3, y, Math.cos(a) * 0.3, w, 1.25, w, 70 + i * 8, 1 + i, 0.9 + 0.18 * r(20 + i)); }
            clump(0, 11.4, 0, 0.6, 0.9, 0.6, 120, 8, 1.05);
        } else if (kind === 'fir' || kind === 'pine') {
            if (kind === 'pine') {
                crown = [lean, 6.8, lz, 0.5, 2.8];
                trunk(6.2, 0.36, 0.2, C.bark, 4);
                for (const [x, y, z, w, n] of [[0.4, 7.2, 0, 2.5, 1], [-1.0, 6.2, 0.7, 1.7, 2], [1.3, 5.6, -0.8, 1.5, 3], [-0.3, 7.9, -0.5, 1.5, 4], [0.9, 6.7, 1.0, 1.3, 5]]) { clump(x, y, z, w, 0.62, w * 0.94, 40, n, 0.9 + 0.18 * r(n + 20), { leaf: 0.8, thin: 0.3 }); bough([lean * 0.9, y - 1.3, lz * 0.9], [x * 0.8 + lean, y - 0.35, z * 0.8 + lz], 0.11, C.bark); }
            } else {
                // Boughs in tiers, each a skirt hanging lower at its hem, ragged; the trunk shows between them.
                trunk(9.6, 0.36, 0.06, C.bark, 3);
                for (let k = 0; k < 6; k++) {
                    const y = 1.9 + k * 1.42, R = 2.35 - 0.36 * k, tone = 0.86 + 0.22 * r(40 + k), x = lean * (0.2 + k * 0.14), z = lz * (0.2 + k * 0.14);
                    s.paint([255 * tone, 255 * tone, 255 * tone], 1).fx(20 + k * 14).tube([[x, y + 1.9, z, 0.12, 1], [x, y + 1.0, z, R * 0.58, 1], [x, y, z, R, 1]], 9, { turn: k * 0.7 + r(5), rag: (i, kk) => i === 2 ? 0.74 + 0.4 * hashf(kk, k + variant) : 1, k: (i, kk) => 1 - 0.16 * (i === 1) + 0.1 * hashf(kk, i + k), ao: i => i === 2 ? 0.6 : 1 });
                    if (leafy) M.fronds(s, x, y, z, R, 12 - k, k * 0.7 + r(5) + 0.2, 20 + k * 14);          // boughs of needles hung round its hem
                }
                s.paint(C.white, 1).fx(110).prism(6, lean, 10.0, lz, 0.42, 11.6, 0, { foot: 0.7 });
            }
        } else if (kind === 'birch') {
            crown = [lean, 5.6, lz, 0.5, 2.4];
            s.mark((x, y, z) => hashf(Math.round(y * 5), Math.round(Math.atan2(x, z) * 2)) > 0.72 ? [70, 66, 64] : null);
            trunk(5.6, 0.2, 0.1, C.birch, 3);
            s.mark(null);
            for (const [x, y, z, w, n] of [[0, 6.3, 0, 1.5, 1], [0.95, 4.9, 0.3, 1.1, 2], [-0.85, 5.2, -0.5, 1.15, 3], [0.3, 5.5, -0.9, 1.0, 4], [-0.4, 4.4, 0.8, 0.95, 5], [0.2, 7.3, 0.2, 0.9, 6]]) { clump(x, y, z, w, w * 1.05, w, 110, n, 0.9 + 0.2 * r(n + 20), { lump: 0.26 }); if (n > 1 && n < 6) bough([lean * 0.7, y - 1.0, lz * 0.7], [x * 0.7 + lean, y - 0.3, z * 0.7 + lz], 0.06, C.birch); }
        } else if (kind === 'willow') {
            crown = [lean, 5.1, lz, 0.5, 3.6];
            trunk(3.1, 0.62, 0.42, C.trunk, 5);
            clump(0, 5.0, 0, 3.3, 1.8, 3.3, 40, 1, 1, { segs: 9, bands: 5 });
            clump(1.3, 5.7, 0.6, 1.8, 1.1, 1.8, 50, 2, 1.08); clump(-1.2, 5.6, -0.9, 1.9, 1.1, 1.9, 50, 3, 0.92);
            // The withies hang in a curtain all round, and move the most.
            for (let i = 0; i < 16; i++) {
                const a = i / 16 * TAU + r(6), d = 3.0 + 0.5 * r(30 + i), x = Math.sin(a) * d + lean, z = Math.cos(a) * d + lz, drop = 1.1 + 0.9 * r(50 + i), w = 0.42, px = Math.cos(a) * w, pz = -Math.sin(a) * w, tone = 0.84 + 0.2 * r(70 + i);
                s.paint([190 * tone, 196 * tone, 188 * tone], 1);
                for (let j = 0; j < 2; j++) { const y0 = 4.9 - j * (4.9 - drop) / 2, y1 = 4.9 - (j + 1) * (4.9 - drop) / 2, k0 = 1 - j * 0.18, k1 = 1 - (j + 1) * 0.18; s.fx(60 + j * 90).quad([x - px * k0, y0, z - pz * k0], [x + px * k0, y0, z + pz * k0], [x * 1.03 + px * k1 * (j ? 0.3 : 1), y1, z * 1.03 + pz * k1 * (j ? 0.3 : 1)], [x * 1.03 - px * k1 * (j ? 0.3 : 1), y1, z * 1.03 - pz * k1 * (j ? 0.3 : 1)], [Math.sin(a) * 0.9, 0.4, Math.cos(a) * 0.9], [1, 1, 0.7, 0.7]); }
            }
        } else if (kind === 'snag') {
            const grey = [124, 112, 104];
            trunk(4.8, 0.36, 0.12, grey, 4);
            for (let i = 0; i < 5; i++) { const a = i * 1.9 + r(7) * 3, y = 2.0 + i * 0.6, len = 1.7 - i * 0.15, tip = [lean * 0.6 + Math.sin(a) * len, y + 1.5, lz * 0.6 + Math.cos(a) * len]; bough([lean * (y / 4.8), y, lz * (y / 4.8)], tip, 0.12 - i * 0.012, grey); if (i < 3) bough([(lean * 0.6 + tip[0]) / 2, y + 0.95, (lz * 0.6 + tip[2]) / 2], [tip[0] + Math.cos(a) * 0.6, y + 2.0, tip[2] - Math.sin(a) * 0.6], 0.05, grey); }
        } else if (kind === 'glade') {
            crown = [lean, 5.8, lz, 0.55, 3.4];
            trunk(4.3, 0.46, 0.26, [92, 70, 110], 5);
            clump(0, 6.2, 0, 3.0, 1.6, 3.0, 60, 1, 1, { segs: 9, bands: 5 });
            for (const [x, y, z, n] of [[1.7, 5.0, 0.6, 2], [-1.6, 5.2, -0.8, 3], [0.4, 5.0, -1.8, 4], [-0.5, 5.3, 1.8, 5], [0.3, 7.3, 0.2, 6]]) { clump(x, y, z, 1.6, 1.05, 1.6, 80, n, 0.88 + 0.22 * r(n + 20)); if (n < 6) bough([lean * 0.8, 3.6, lz * 0.8], [x * 0.7 + lean, y - 0.4, z * 0.7 + lz], 0.14, [92, 70, 110]); }
            for (let i = 0; i < 8; i++) { const a = i * 1.9; s.paint(C.white, 3).fx(120, 255).blob(Math.sin(a) * 2.3 + lean, 3.3 + 1.0 * r(8 + i), Math.cos(a) * 2.3, 0.12, 0.16, 0.12, { segs: 5, bands: 3, lump: 0 }); }
        } else if (kind === 'shroom') {
            // A stem with a skirt, a domed cap with pale spots, and gills that glow a little.
            s.paint([240, 232, 214], 2).fx(0).tube([[0, -0.3, 0, 0.62, 1], [lean * 0.2, 0.5, 0, 0.44, 1], [lean * 0.7, 2.4, 0, 0.36, 1], [lean, 3.6, 0, 0.34, 1]], 8, { k: (i, k) => 0.9 + 0.1 * (k % 2) });
            s.tube([[lean * 0.8, 2.9, 0, 0.36, 1], [lean * 0.78, 2.6, 0, 0.62, 1]], 8, { rag: (i, k) => i ? 0.8 + 0.3 * hashf(k, variant) : 1 });
            s.paint(C.white, 1).fx(14).tube([[lean, 3.42, 0, 2.5, 1], [lean, 3.8, 0, 2.3, 1], [lean, 4.35, 0, 1.6, 1], [lean, 4.72, 0, 0.7, 1], [lean, 4.82, 0, 0, 1]], 12);
            s.paint([255, 236, 190], 0).fx(0, 150).tube([[lean, 3.3, 0, 0.36, 1], [lean, 3.43, 0, 2.48, 1]], 12, { k: (i, k) => k % 2 ? 0.7 : 1 });
            for (let i = 0; i < 9; i++) { const a = i * 2.4 + r(9), d = 0.5 + 1.5 * r(12 + i), y = 4.82 - (d / 2.5) ** 2 * 1.25; s.paint(C.white, 3).fx(14).blob(lean + Math.sin(a) * d, y + 0.02, Math.cos(a) * d, 0.26 - d * 0.05, 0.07, 0.26 - d * 0.05, { segs: 6, bands: 2, lump: 0 }); }
        }
    });

    // A boulder in facets, a little moss on its shoulder, and a stone or two fallen from it.
    const rock = variant => M.model(`fine:rock:${variant}`, s => {
        const r = k => M.rnd(variant + 2, k);
        const boulder = (cx, cy, cz, rx, ry, rz, seed) => {
            const segs = 9, bands = 6, at = (i, j) => { const lat = j / bands * Math.PI, a = seed * 9 + (i % segs) / segs * TAU, pole = j === 0 || j === bands, k = 1 + (pole ? 0 : (hashf((i % segs) * 3 + j * 11, seed) - 0.5) * 0.5); return [cx + Math.sin(lat) * Math.sin(a) * rx * k, cy + Math.cos(lat) * ry * k, cz + Math.sin(lat) * Math.cos(a) * rz * k]; };
            const face = (a, b, c) => {
                const mx = (a[0] + b[0] + c[0]) / 3 - cx, my = (a[1] + b[1] + c[1]) / 3 - cy, mz = (a[2] + b[2] + c[2]) / 3 - cz;
                let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
                const bed = Math.floor(((a[1] + b[1] + c[1]) / 3 + 0.02 * mx) / 0.13), l = (Math.hypot(nx, ny, nz) || 1) * (nx * mx + ny * my + nz * mz < 0 ? -1 : 1), tone = (0.84 + 0.22 * hashf(a[0] * 31 + b[1] * 17, c[2] * 13 + seed)) * (bed % 2 ? 0.86 : 1.04), up = ny / l;          // in beds
                s.paint([C.rock[0] * tone * (1 + 0.06 * up), C.rock[1] * tone * (1 + 0.05 * up), C.rock[2] * tone], 0).tri(a, b, c, [nx / l, ny / l, nz / l], [a[1] < 0.1 ? 0.6 : 1, b[1] < 0.1 ? 0.6 : 1, c[1] < 0.1 ? 0.6 : 1]);
            };
            for (let j = 0; j < bands; j++) for (let i = 0; i < segs; i++) { if (j < bands - 1) face(at(i, j), at(i, j + 1), at(i + 1, j + 1)); if (j > 0) face(at(i, j), at(i + 1, j + 1), at(i + 1, j)); }
        };
        s.fx(0);
        boulder(0, 0.26, 0, 0.82, 0.58, 0.66, variant + 0.3);
        if (r(1) < 0.7) boulder(0.68, 0.1, 0.34, 0.36, 0.26, 0.34, variant + 1.7);
        if (r(2) < 0.5) boulder(-0.5, 0.06, -0.56, 0.24, 0.16, 0.22, variant + 2.9);
        s.paint(C.moss, 0).blob(-0.12 + 0.3 * r(3), 0.66, 0.1, 0.42, 0.14, 0.36, { segs: 8, bands: 4, lump: 0.3, seed: variant }).blob(0.5, 0.3, 0.36, 0.2, 0.08, 0.18, { segs: 6, bands: 3, lump: 0.3, seed: variant + 1 });
        for (let i = 0; i < 5; i++) { const a = i * 1.3 + variant; s.paint([120, 170, 80], 0).fx(120).tri([Math.sin(a) * 0.95 - 0.04, 0, Math.cos(a) * 0.8], [Math.sin(a) * 0.95 + 0.04, 0, Math.cos(a) * 0.8], [Math.sin(a) * 1.05, 0.3 + 0.1 * r(10 + i), Math.cos(a) * 0.9], [Math.sin(a), 0.6, Math.cos(a)], [0.6, 0.6, 1]); }
        s.fx(0);
    });

    // A bush is a huddle of leaf clumps on a few stems; a tuft is a dozen blades; flowers have heads with petals.
    const small = (kind, variant) => M.model(`fine:${kind}:${variant}`, s => {
        const r = k => M.rnd(variant + 2, k);
        if (kind === 'bush') {
            for (let i = 0; i < 6; i++) {
                const a = i * 1.05 + r(1) * 6, d = i ? 0.5 + 0.2 * r(i + 2) : 0, y = i ? 0.42 + 0.2 * r(i + 8) : 0.72, w = i ? 0.5 + 0.14 * r(i + 14) : 0.62, tone = 0.84 + 0.3 * r(i + 20), x = Math.sin(a) * d, z = Math.cos(a) * d;
                s.paint([255 * tone, 255 * tone, 255 * tone], 1).fx(40).blob(x, y, z, w, w * 0.78, w, { segs: 8, bands: 5, lump: 0.2, seed: variant + i, under: 0.55 });
                for (let k = 0; k < 6; k++) { const b = k * 1.05 + i, up = 0.2 + 0.7 * hashf(k, i + variant), c = Math.sqrt(1 - up * up), ox = Math.sin(b) * c, oz = Math.cos(b) * c, px = x + ox * w * 0.92, py = y + up * w * 0.72, pz = z + oz * w * 0.92; s.fx(90).tri([px + oz * 0.07, py - 0.03, pz - ox * 0.07], [px - oz * 0.07, py + 0.03, pz + ox * 0.07], [px + ox * 0.22, py + up * 0.22 + 0.04, pz + oz * 0.22], [ox, up * 0.6 + 0.4, oz], [0.8, 0.8, 1]); }
                if (i) s.paint(C.trunk, 0).fx(0).tube([[x * 0.2, -0.1, z * 0.2, 0.035, 1], [x * 0.8, y - 0.2, z * 0.8, 0.02, 1]], 4);
            }
        } else if (kind === 'tuft') {
            for (let i = 0; i < 13; i++) { const a = i * 2.4 + r(i), d = 0.03 + 0.14 * r(i + 20), x = Math.sin(a) * d, z = Math.cos(a) * d, out = 0.1 + 0.2 * r(i + 9), h = 0.26 + 0.34 * r(i + 4), px = Math.cos(a) * 0.035, pz = -Math.sin(a) * 0.035, tone = 0.84 + 0.3 * r(i + 30); s.paint([255 * tone, 255 * tone, 255 * tone], 1).fx(130).tri([x - px, 0, z - pz], [x + px, 0, z + pz], [x + Math.sin(a) * out, h, z + Math.cos(a) * out], [Math.sin(a) * 0.5, 0.85, Math.cos(a) * 0.5], [0.55, 0.55, 1]); }
        } else if (kind === 'flower') {
            for (let i = 0; i < 6; i++) {
                const a = i * 1.3 + r(i) * 3, d = 0.12 + 0.4 * r(i + 5), x = Math.sin(a) * d, z = Math.cos(a) * d, h = 0.24 + 0.24 * r(i + 7);
                s.paint(C.white, 1).fx(140).tri([x - 0.02, 0, z], [x + 0.02, 0, z], [x, h, z], [0, 0.5, 1]).tri([x, h * 0.4, z], [x + 0.09, h * 0.5, z + 0.03], [x + 0.03, h * 0.62, z], [0, 1, 0]);
                for (let k = 0; k < 5; k++) { const b = k * 1.257; s.paint(C.white, 3).tri([x, h, z], [x + Math.sin(b - 0.5) * 0.06, h + 0.015, z + Math.cos(b - 0.5) * 0.06], [x + Math.sin(b + 0.5) * 0.06, h + 0.015, z + Math.cos(b + 0.5) * 0.06], [0, 1, 0]); }
                s.paint([250, 220, 90], 0).blob(x, h + 0.012, z, 0.018, 0.012, 0.018, { segs: 5, bands: 2, lump: 0, under: 1 });
            }
        }
        s.fx(0);
    });

    // What else by the road is worth a second look.
    const base = (s, kind, variant) => s.stamp(M.fixed(kind, variant), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]);
    const FIXED = {
        // A cart: the plain one's bed and load, with stakes and rails along its sides, an axle, a tailboard and a lantern hook.
        cart: (s, variant) => {
            base(s, 'cart', variant);
            s.paint(C.timber, 0).fx(0).at(M.mul(M.move(0, 0.6, 0.2), M.rotZ(Math.PI / 2))).tube([[0, -0.95, 0, 0.05, 1], [0, 0.95, 0, 0.05, 1]], 6, { cap: 3 });
            s.at(null);
            for (const x of [-0.78, 0.78]) { for (let i = 0; i < 5; i++) s.paint(C.plank, 0).tube([[x, 0.86, -1.2 + i * 0.6, 0.035, 1], [x * 1.04, 1.56, -1.2 + i * 0.6, 0.03, 1]], 5, { cap: 2 }); s.paint([130, 96, 66], 0).tube([[x * 1.04, 1.5, -1.3, 0.03, 1], [x * 1.04, 1.5, 1.3, 0.03, 1]], 5, { cap: 3 }); }
            for (const x of [-0.5, 0.5]) s.paint(C.plank, 0).tube([[x, 0.76, 1.2, 0.045, 1], [x, 0.72, 2.4, 0.04, 1], [x * 0.9, 0.62, 3.2, 0.035, 1]], 6, { cap: 2 });
            s.paint(C.iron, 0).tube([[0.8, 1.56, 1.2, 0.012, 1], [0.95, 1.62, 1.2, 0.012, 1], [0.95, 1.5, 1.2, 0.012, 1]], 4).paint(C.flame, 0).fx(0, 255).box(0.95, 1.42, 1.2, 0.04, 0.06, 0.04, 1).fx(0);
            for (const [x, z] of [[-0.3, 0.8], [0.3, 0.95], [0, -1.0]]) s.paint([196, 176, 136], 0).blob(x, 1.2, z, 0.26, 0.3, 0.22, { segs: 7, bands: 4, seed: x + z, lump: 0.1, under: 0.5 });
        },
        // A stall: turned posts, a valance cut in scallops along the awning's edge, a till, and a hanging scale.
        stall: (s, variant) => {
            base(s, 'stall', variant);
            for (const [x, z] of [[-1.3, -0.6], [1.3, -0.6], [-1.3, 0.75], [1.3, 0.75]]) s.paint(C.plank, 0).fx(0).tube([[x, 0, z, 0.075, 1], [x, 0.5, z, 0.06, 1], [x, 0.56, z, 0.085, 1], [x, 0.62, z, 0.06, 1], [x, 2.3, z, 0.055, 1]], 7);
            for (let i = 0; i < 12; i++) { const x0 = -1.55 + i * 3.1 / 12; s.paint(i % 2 ? [248, 240, 226] : C.white, i % 2 ? 0 : 3).fx(0, 0, 60).tri([x0, 2.2, 0.96], [x0 + 3.1 / 12, 2.2, 0.96], [x0 + 3.1 / 24, 1.96, 0.98], [0, 0, 1], [1, 1, 0.8]); }
            s.fx(0).paint(C.iron, 0).tube([[1.0, 2.3, 0.5, 0.008, 1], [1.0, 1.75, 0.5, 0.008, 1]], 3).paint(shine([200, 160, 80]), 0).prism(7, 1.0, 1.66, 0.5, 0.1, 1.7, 0.13, { cap: true }).box(1.0, 1.75, 0.5, 0.14, 0.008, 0.008, 1);
            s.paint([110, 80, 56], 0).box(-1.75, 0.32, 0.3, 0.28, 0.32, 0.28, 0.6, [C.plank, 0]).paint([196, 176, 136], 0).blob(-1.75, 0.84, 0.3, 0.24, 0.24, 0.22, { segs: 7, bands: 4, seed: variant, lump: 0.12, under: 0.5 });
        },
        // A bench of slats, with arms.
        bench: s => {
            s.fx(0);
            for (let i = 0; i < 4; i++) s.paint(i % 2 ? C.plank : [164, 124, 86], 0).box(0, 0.46, -0.17 + i * 0.115, 0.92, 0.022, 0.05, 1);
            for (let i = 0; i < 3; i++) s.paint(i % 2 ? [164, 124, 86] : C.plank, 0).box(0, 0.64 + i * 0.13, -0.25 - i * 0.02, 0.92, 0.05, 0.02, 1);
            for (const x of [-0.82, 0.82]) { s.paint(C.iron, 0).tube([[x, 0, 0.2, 0.03, 1], [x, 0.44, 0.18, 0.026, 1], [x, 0.66, 0.2, 0.024, 1], [x, 0.7, 0.0, 0.024, 1], [x, 0.66, -0.24, 0.024, 1], [x, 1.0, -0.3, 0.024, 1]], 5).tube([[x, 0, -0.22, 0.03, 1], [x, 0.66, -0.24, 0.026, 1]], 5); }
        },
        // A lamp post: a stepped foot, a fluted post, a scrolled bracket, a lantern of four panes under a cap.
        lamp: s => {
            s.paint(C.iron, 0).fx(0).tube([[0, -0.1, 0, 0.17, 1], [0, 0.08, 0, 0.15, 1], [0, 0.14, 0, 0.1, 1], [0, 0.5, 0, 0.075, 1], [0, 0.56, 0, 0.1, 1], [0, 0.62, 0, 0.07, 1], [0, 2.6, 0, 0.05, 1], [0, 2.8, 0, 0.055, 1], [0, 2.86, 0, 0, 1]], 8, { k: (i, k) => k % 2 ? 0.82 : 1.05 });
            s.tube([[0, 2.72, 0, 0.022, 1], [0, 2.82, 0.2, 0.02, 1], [0, 2.78, 0.42, 0.018, 1], [0, 2.7, 0.5, 0.016, 1]], 5).tube([[0, 2.5, 0.02, 0.016, 1], [0, 2.6, 0.2, 0.014, 1], [0, 2.74, 0.26, 0.012, 1]], 4);
            s.paint([214, 176, 110], 0).fx(0, 255).prism(4, 0, 2.3, 0.5, 0.075, 2.56, 0.115, { turn: 0.785, flat: true });
            s.fx(0).paint(C.iron, 0).prism(4, 0, 2.56, 0.5, 0.18, 2.7, 0.03, { turn: 0.785, flat: true }).box(0, 2.28, 0.5, 0.07, 0.02, 0.07, 1).blob(0, 2.73, 0.5, 0.03, 0.03, 0.03, { segs: 5, bands: 3, lump: 0 });
            for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.785; s.box(Math.sin(a) * 0.1, 2.43, 0.5 + Math.cos(a) * 0.1, 0.008, 0.14, 0.008, 1); }
        },
        // A bridge: the plain one's arch and parapets, with the arch's ring of stones and its keystone, a coping, and cutwaters.
        bridge: s => {
            base(s, 'bridge', 0);
            s.course(false).fx(0);
            for (const x of [-2.34, 2.34]) {
                for (let i = 0; i < 11; i++) { const a = (i + 0.5) / 11 * Math.PI, z = -Math.cos(a) * 6.9, y = -0.5 - 2.4 * (1 - Math.sin(a)) + 0.25; s.paint(i === 5 ? [196, 190, 180] : i % 2 ? [150, 146, 142] : [128, 124, 122], 0).at(M.mul(M.move(x, y, z), M.rotX(Math.PI / 2 - a))).box(0, 0, 0, 0.06, i === 5 ? 0.42 : 0.3, 0.56, 1); }
                s.at(null).paint([186, 182, 174], 0).box(x - Math.sign(x) * 0.17, 1.02, 0, 0.26, 0.07, 11, 1);
                s.course(true).paint(C.stone, 0).prism(4, x + Math.sign(x) * 0.5, -4, 7.4, 0.9, 0.3, 0.3, { flat: true, turn: 0.785 }).prism(4, x + Math.sign(x) * 0.5, -4, -7.4, 0.9, 0.3, 0.3, { flat: true, turn: 0.785 });
                s.course(false);
            }
        },

        well: s => {
            // A round wall of coursed stone under a shingled roof on two posts; a windlass, a rope and a bucket.
            s.course(true).paint(C.stone, 0).fx(0).tube([[0, -0.2, 0, 1.08, 1], [0, 0.82, 0, 1.0, 1], [0, 0.9, 0, 1.04, 1], [0, 0.9, 0, 0.8, 1], [0, 0.5, 0, 0.8, 1]], 12, { ao: i => i ? 1 : 0.6 });
            s.course(false).paint(C.water, 0).prism(12, 0, 0.5, 0, 0.8, 0.51, 0.8, { cap: true });
            for (const x of [-0.92, 0.92]) s.paint(C.plank, 0).tube([[x, 0.7, 0, 0.08, 1], [x, 2.3, 0, 0.07, 1]], 6);
            s.paint(C.timber, 0).at(M.mul(M.move(0, 1.85, 0), M.rotZ(Math.PI / 2))).tube([[0, -1.0, 0, 0.07, 1], [0, 1.0, 0, 0.07, 1]], 7, { cap: 3 }).paint(C.rope, 0).tube([[0, -0.2, 0, 0.085, 1], [0, 0.2, 0, 0.085, 1]], 7, { k: (i, k) => k % 2 ? 0.8 : 1 });
            s.at(null).paint(C.iron, 0).tube([[1.0, 1.85, 0, 0.02, 1], [1.16, 1.85, 0, 0.02, 1], [1.16, 1.6, 0, 0.02, 1], [1.3, 1.6, 0, 0.02, 1]], 4);
            s.paint(C.rope, 0).tube([[0.1, 1.8, 0, 0.014, 1], [0.1, 1.12, 0, 0.014, 1]], 4).paint(C.plank, 0).tube([[0.1, 0.84, 0, 0.14, 1], [0.1, 1.1, 0, 0.17, 1]], 8, { cap: 1, k: (i, k) => k % 2 ? 0.86 : 1 }).paint(C.iron, 0).tube([[0.1, 0.9, 0, 0.152, 1], [0.1, 0.94, 0, 0.158, 1]], 8);
            s.course(true).paint(C.white, 5).prism(4, 0, 2.2, 0, 1.6, 3.0, 0, { turn: 0.785, flat: true, squash: 0.75 });
            s.course(false);
        },
        fence: s => {
            s.paint(C.plank, 0).fx(0);
            for (const z of [-1.9, 0]) s.tube([[0, -0.2, z, 0.085, 1], [0.01, 0.6, z, 0.075, 1], [0, 1.08, z, 0.06, 1], [0, 1.14, z, 0, 1]], 6, { k: (i, k) => 0.86 + 0.2 * hashf(i, k + z) });
            for (const y of [0.82, 0.44]) s.at(M.mul(M.move(0.05, y, 0.05), M.rotX(Math.PI / 2))).tube([[0, -2.0, 0, 0.045, 1], [0.01, 0, 0.01, 0.05, 1], [0, 2.0, 0, 0.045, 1]], 5, { k: (i, k) => 0.9 + 0.14 * hashf(k, i + y) });
            s.at(null);
        },
        sign: s => {
            s.paint(C.plank, 0).fx(0).tube([[0, -0.2, 0, 0.09, 1], [0, 1.2, 0, 0.075, 1], [0, 2.55, 0, 0.065, 1]], 6, { cap: 2, k: (i, k) => 0.88 + 0.16 * hashf(i, k) });
            for (const [x, y, w, a] of [[0.42, 2.2, 0.5, 0], [-0.36, 1.84, 0.44, Math.PI]]) { s.at(M.mul(M.move(x, y, 0), M.rotY(a))).paint([170, 128, 86], 0).box(0, 0, 0, w, 0.13, 0.03, 1).tri([w, 0.13, 0.03], [w, -0.13, 0.03], [w + 0.14, 0, 0.03], [0, 0, 1]).tri([w, -0.13, -0.03], [w, 0.13, -0.03], [w + 0.14, 0, -0.03], [0, 0, -1]); for (let i = 0; i < 3; i++) s.paint([84, 62, 48], 0).box(-w * 0.5 + i * w * 0.42, 0.01, 0.034, w * 0.14, 0.018, 0.002, 1).box(-w * 0.5 + i * w * 0.42, 0.01, -0.034, w * 0.14, 0.018, 0.002, 1); }
            s.at(null);
        },
    };
    const shine = col => Object.assign(col, { shine: 0.8 });
    const fixed = (kind, variant = 0) => FIXED[kind] ? M.model(`fine:${kind}:${variant}`, s => FIXED[kind](s, variant)) : null;

    // ---- The pieces of a grand city ------------------------------------------------------------------
    const tw = (s, x, z, o) => { M.tower(s.at(M.move(x, 0, z)), o); s.at(null); };
    // A lit window on an upright face whose outward normal is (nx, nz).
    const win = (s, x, y, z, nx, nz, w, h, lit, col = WINDOW) => { const px = -nz * w, pz = nx * w; s.course(false).paint(lit ? col : C.glass, 0).fx(0, lit ? 255 : 0).quad([x - px, y - h, z - pz], [x + px, y - h, z + pz], [x + px, y + h, z + pz], [x - px, y + h, z - pz], [nx, 0, nz]).fx(0); };
    const banner = (s, x, y0, y1, z, nz, w, col) => s.course(false).paint(col, 0).fx(0, 0, 24).quad([x - w, y0, z], [x + w, y0, z], [x + w, y1, z], [x - w, y1, z], [0, 0, nz], [0.8, 0.8, 1, 1]).tri([x - w, y0, z], [x + w, y0, z], [x, y0 - w * 1.2, z], [0, 0, nz], [0.8, 0.8, 0.7]).fx(0);
    const merlons = (s, x0, z0, x1, z1, y, n) => { for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; s.box(L.mix(x0, x1, t), y + 0.5, L.mix(z0, z1, t), Math.abs(x1 - x0) > Math.abs(z1 - z0) ? Math.abs(x1 - x0) / n * 0.3 : 0.24, 0.5, Math.abs(x1 - x0) > Math.abs(z1 - z0) ? 0.24 : Math.abs(z1 - z0) / n * 0.3, 1); } };

    // The gatehouse: two great drums under cones, the gate passage between them with its portcullis half down, a
    // gallery over it on corbels, banners, and windows that are lit at night. +z is the way out of the city.
    function gatehouse(s, o) {
        const lite = !!o.lite, v = o.v || 0, out = { glow: [] };
        for (const x of [-1, 1]) tw(s, x * 8.3, 0.4, { h: 25, r: 4.7, roof: 1, v: v + x, flag: true, grand: true, lite, tall: true });
        s.course(true).paint(C.stone, 0).fx(0);
        s.box(0, 13.4, 0.2, 4.1, 6.4, 3.4, 1, [LIGHT, 0]);
        for (const x of [-3.85, 3.85]) s.box(x, 3.3, 0.2, 0.42, 3.9, 3.4, 0.6);
        for (let i = 0; i < 6; i++) {
            const a0 = i / 6 * Math.PI, a1 = (i + 1) / 6 * Math.PI, p = a => [-Math.cos(a) * 3.44, 4.9 + Math.sin(a) * 2.2], [x0, y0] = p(a0), [x1, y1] = p(a1);
            s.paint(C.darkStone, 0).quad([x0, y0, -3.2], [x0, y0, 3.6], [x1, y1, 3.6], [x1, y1, -3.2], null, [0.45, 0.45, 0.45, 0.45]);
            for (const z of [-3.2, 3.6]) s.paint(C.stone, 0).quad([x0, y0, z], [x1, y1, z], [x1, 7.2, z], [x0, 7.2, z], [0, 0, Math.sign(z)]);
        }
        if (!lite) {
            merlons(s, -4, 3.4, 4, 3.4, 19.8, 6); merlons(s, -4, -3, 4, -3, 19.8, 6);
            for (let i = 0; i < 7; i++) s.paint(C.darkStone, 0).box(-3.6 + i * 1.2, 18.9, 3.75, 0.22, 0.5, 0.26, 0.6);                // corbels under the gallery
            // The portcullis, drawn up to let the road through: iron bars with a row of points.
            s.course(false).paint(C.iron, 0);
            for (let i = 0; i < 8; i++) s.box(-2.87 + i * 0.82, 6.5, 2.7, 0.06, 1.1, 0.06, 1).prism(4, -2.87 + i * 0.82, 5.05, 2.7, 0.085, 5.4, 0.085, { flat: true });
            for (const y of [5.6, 6.4, 7.1]) s.box(0, y, 2.7, 3.3, 0.05, 0.05, 1);
            for (const x of [-2.6, 2.6]) s.tube([[x, 9.4, 3.62, 0.05, 1], [x * 0.92, 4.6, 9.5, 0.045, 1], [x * 0.9, 0.5, 16.2, 0.05, 1]], 4, { k: (i, k) => k % 2 ? 0.7 : 1 });       // the drawbridge's chains
        }
        for (const [x, y, lit] of [[-1.7, 11.2, true], [1.7, 11.2, M.rnd(v, 3) < 0.7], [0, 15.2, true]]) { win(s, x, y, 3.63, 0, 1, 0.42, 0.85, lit); win(s, x, y, -3.23, 0, -1, 0.42, 0.85, lit); if (lit) out.glow.push([x, y, 4]); }
        for (const x of [-2.9, 2.9]) for (const z of [3.66, -3.26]) banner(s, x, 8.2, 16.6, z, Math.sign(z), 0.62, M.BRIGHT[Math.floor(v * 5.99)]);
        s.course(false);
        return out;
    }
    // A drawbridge, lowered across the moat: planks on two beams, a rail of posts, stone at either end. Its deck is y = 0.
    function drawbridge(s, o) {
        s.course(false).fx(0);
        for (let i = 0; i < 13; i++) s.paint(i % 2 ? C.plank : [134, 100, 68], 0).box(0, -0.08, -6 + i, 2.5, 0.08, 0.48, 1);
        for (const x of [-2.2, 2.2]) { s.paint(C.timber, 0).box(x, -0.3, 0.3, 0.16, 0.16, 6.8, 0.7); if (!o.lite) for (let i = 0; i < 5; i++) s.paint(C.timber, 0).tube([[x * 1.08, -0.1, -5.4 + i * 2.9, 0.07, 1], [x * 1.08, 0.85, -5.4 + i * 2.9, 0.06, 1]], 5, { cap: 2 }); if (!o.lite) s.paint(C.rope, 0).tube([[x * 1.08, 0.72, -5.4, 0.025, 1], [x * 1.08, 0.6, -2.5, 0.025, 1], [x * 1.08, 0.72, 0.4, 0.025, 1], [x * 1.08, 0.6, 3.3, 0.025, 1], [x * 1.08, 0.72, 6.2, 0.025, 1]], 4); }
        s.course(true).paint(C.stone, 0).box(0, -1.6, 7.6, 3.2, 1.6, 1.1, 0.6, [LIGHT, 0]).box(0, -1.6, -7.2, 3.2, 1.6, 1.0, 0.6, [LIGHT, 0]);
        for (const x of [-2.9, 2.9]) s.box(x, 0.5, 7.9, 0.34, 0.6, 0.34, 0.8, [LIGHT, 0]);
        s.course(false);
    }
    // The castle on its rock. The ground at its middle is y = 0; +z looks down the ramp toward the road.
    function citadel(s, o) {
        const lite = !!o.lite, v = o.v || 0, out = { glow: [], beacons: [] }, R = 23, col = M.BRIGHT[Math.floor(v * 5.99)], skirt = lite ? 9 : 6;
        const lit = k => M.rnd(v + 0.3, k) < 0.68;
        s.course(true).fx(0);
        // The inner wall: eight lengths, a tower at each corner, by turns tall and short, and the gate at the ramp's head.
        for (let i = 0; i < 8; i++) {
            const a0 = (i + 0.5) / 8 * TAU, a1 = (i + 1.5) / 8 * TAU, x0 = Math.sin(a0) * R, z0 = Math.cos(a0) * R, x1 = Math.sin(a1) * R, z1 = Math.cos(a1) * R, nx = Math.sin((a0 + a1) / 2), nz = Math.cos((a0 + a1) / 2), H = 8.6;
            if (i !== 7) {
                s.paint(C.stone, 0).quad([x0 + nx * 0.8, -skirt, z0 + nz * 0.8], [x1 + nx * 0.8, -skirt, z1 + nz * 0.8], [x1 + nx * 0.8, H, z1 + nz * 0.8], [x0 + nx * 0.8, H, z0 + nz * 0.8], [nx, 0, nz], [0.55, 0.55, 1, 1]);
                s.quad([x1 - nx * 0.8, -1, z1 - nz * 0.8], [x0 - nx * 0.8, -1, z0 - nz * 0.8], [x0 - nx * 0.8, H, z0 - nz * 0.8], [x1 - nx * 0.8, H, z1 - nz * 0.8], [-nx, 0, -nz], [0.6, 0.6, 1, 1]);
                s.paint(LIGHT, 0).quad([x0 - nx * 0.8, H, z0 - nz * 0.8], [x0 + nx * 0.8, H, z0 + nz * 0.8], [x1 + nx * 0.8, H, z1 + nz * 0.8], [x1 - nx * 0.8, H, z1 - nz * 0.8], [0, 1, 0]);
                if (!lite) { s.paint(C.stone, 0); for (let k = 0; k < 6; k += 2) { const t = (k + 0.5) / 6; s.box(L.mix(x0, x1, t) + nx * 0.6, H + 0.5, L.mix(z0, z1, t) + nz * 0.6, 0.5 + 0.9 * Math.abs(nz), 0.5, 0.5 + 0.9 * Math.abs(nx), 1); } }
            }
            tw(s, x1, z1, { h: i % 2 ? 13.5 : 18.5, r: i % 2 ? 2.5 : 3.1, roof: 2, v: v + i * 0.13, flag: i % 2 === 0, grand: true, lite, skirt, tall: i % 2 === 0 });
        }
        // The inner gate: an arch between the two front towers, banners either side.
        s.course(true).paint(C.stone, 0).box(0, 9.2, R * 0.924 + 0.1, R * 0.383 - 1.6, 3.2, 1.2, 1, [LIGHT, 0]);
        for (const x of [-1, 1]) s.box(x * (R * 0.383 - 2.7), 2.5, R * 0.924 + 0.1, 1.1, 3.6, 1.2, 0.6);
        s.course(false).paint([92, 66, 48], 0).quad([-2.4, -0.5, R * 0.924 + 1.32], [2.4, -0.5, R * 0.924 + 1.32], [2.4, 5.4, R * 0.924 + 1.32], [-2.4, 5.4, R * 0.924 + 1.32], [0, 0, 1], [0.5, 0.5, 0.9, 0.9]).tri([-2.4, 5.4, R * 0.924 + 1.32], [2.4, 5.4, R * 0.924 + 1.32], [0, 7.2, R * 0.924 + 1.32], [0, 0, 1]);
        for (const x of [-1.2, 0, 1.2]) s.paint([60, 44, 36], 0).box(x, 2.5, R * 0.924 + 1.34, 0.03, 3, 0.01, 1);
        s.course(true);
        if (!lite) merlons(s, -5, R * 0.924 + 1.1, 5, R * 0.924 + 1.1, 12.4, 5);
        for (const x of [-4, 4]) banner(s, x, 5.5, 11.6, R * 0.924 + 1.34, 1, 0.7, col);
        // The great keep: square, tall, a turret at each corner of a different height, windows in rows.
        const kx = -3, kz = -4, kw = 7, kh = 27;
        s.course(true).paint(C.stone, 0).box(kx, kh / 2 - 2, kz, kw, kh / 2 + 2, kw, 0.55, [LIGHT, 0]);
        s.paint([186, 182, 174], 0).box(kx, kh + 0.3, kz, kw + 0.5, 0.5, kw + 0.5, 0.8, [LIGHT, 0]);
        if (!lite) { s.paint(C.stone, 0); for (const sgn of [-1, 1]) { merlons(s, kx - kw, kz + sgn * (kw + 0.3), kx + kw, kz + sgn * (kw + 0.3), kh + 0.8, 7); merlons(s, kx + sgn * (kw + 0.3), kz - kw, kx + sgn * (kw + 0.3), kz + kw, kh + 0.8, 7); } }
        for (const [i, [x, z]] of [[-1, -1], [1, -1], [-1, 1], [1, 1]].entries()) tw(s, kx + x * kw, kz + z * kw, { h: kh + 4 + 3.4 * i * (i % 2 ? 1 : 0.4), r: 2.3, roof: 2, v: v + i * 0.27, flag: i === 3, grand: true, lite, skirt: 2, tall: true });
        for (let f = 0; f < 4; f++) for (let i = 0; i < 3; i++) {
            const y = 6 + f * 5.4, u = -3.8 + i * 3.8;
            for (const [nx, nz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const on = lit(f * 12 + i * 4 + nx * 2 + nz); if (lite && !on) continue; win(s, kx + nx * (kw + 0.04) + nz * u, y, kz + nz * (kw + 0.04) + nx * u, nx, nz, 0.6, 1.25, on); if (on && nz > 0) out.glow.push([kx + u, y, kz + kw + 0.4]); }
        }
        for (const x of [-2.6, 2.6]) banner(s, kx + x, 12, 24, kz + kw + 0.06, 1, 0.9, col);
        // The great tower: round, the tallest thing for miles, a gallery near its top and a long spire with a pennant.
        const gx = 10, gz = -9;
        tw(s, gx, gz, { h: 40, r: 4.2, roof: 1, v: v + 0.71, flag: true, grand: true, lite, skirt: 3, tall: true, spire: 13 });
        for (let k = 0; k < 9; k++) { const a = k * 1.9 + v * 6, y = 9 + k * 3.3, on = lit(60 + k); if (lite && !on) continue; win(s, gx + Math.sin(a) * 4.3, y, gz + Math.cos(a) * 4.3, Math.sin(a), Math.cos(a), 0.5, 1.0, on); }
        // A slim watch tower at the back, and a turret on the wall walk.
        tw(s, -14, -11, { h: 30, r: 2.0, roof: 3, v: v + 0.4, flag: true, grand: true, lite, skirt: 3, tall: true, spire: 8 });
        // The hall: a long roof against the east wall, chimneys, a row of tall windows that are lit of an evening.
        s.at(M.mul(M.move(11.5, 0, 7), M.rotY(-0.35)));
        const hall = M.house(s, { w: 12, dp: 7.5, floors: 2, roof: 2, v: v + 0.2, stone: true, endOn: false, lite, fine: !lite, at: M.mul(M.move(11.5, 0, 7), M.rotY(-0.35)) });
        s.at(null);
        void hall;
        // The chapel: a small steep nave with a round end, a bell in a little turret, and coloured glass.
        s.at(M.move(-12, 0, 7.5)).course(true).paint(C.stone, 0).box(0, 3.4, 0, 3, 4, 5.5, 0.6);
        s.paint(C.white, 5);
        for (const sgn of [-1, 1]) s.quad([sgn * 3.5, 7.1, -5.9], [sgn * 3.5, 7.1, 5.9], [0, 11.8, 5.7], [0, 11.8, -5.7]);
        s.paint(C.stone, 0).tri([-3, 7.3, 5.5], [3, 7.3, 5.5], [0, 11.5, 5.5], [0, 0, 1]).tri([3, 7.3, -5.5], [-3, 7.3, -5.5], [0, 11.5, -5.5], [0, 0, -1]);
        s.prism(lite ? 5 : 7, 0, -0.6, -5.5, 3, 7, 3, { foot: 0.6 }).paint(C.white, 5).prism(lite ? 5 : 7, 0, 7, -5.5, 3.3, 10.2, 0);
        s.paint(C.stone, 0).box(0, 13, 4.4, 0.9, 1.4, 0.9, 1).paint(C.white, 5).prism(4, 0, 14.3, 4.4, 1.5, 17.4, 0, { turn: 0.785, flat: true });
        s.course(false).paint(C.gold, 0).blob(0, 17.6, 4.4, 0.22, 0.22, 0.22, { segs: 6, bands: 3, lump: 0 });
        win(s, 0, 5.2, 5.54, 0, 1, 0.9, 1.9, true, [120, 180, 255]);
        for (const z of [-2.6, 0.4, 3.2]) for (const sgn of [-1, 1]) win(s, sgn * 3.04, 4.2, z, sgn, 0, 0.4, 1.2, true, z > 0 ? [255, 190, 110] : [140, 200, 255]);
        s.at(null).course(false);
        out.glow.push([-12, 5, 13.5], [0, 4, R + 2]);
        // From a long way off at night: the keep's windows, the great tower's lamp, and a fire on the gate.
        out.beacons.push([kx, 16, kz + kw + 1, 15, 1, 0.66, 0.3], [gx, 34, gz + 4, 9, 1, 0.74, 0.4], [0, 9, R, 8, 1, 0.6, 0.26], [-14, 24, -11, 5, 1, 0.7, 0.36], [11.5, 5, 9, 9, 1, 0.66, 0.3]);
        return out;
    }
    // The way up: a ramp on arches from the street to the castle's gate. It climbs along +z from y = 0 to `rise`.
    function ramp(s, o) {
        const len = o.len, rise = o.rise + 0.5, n = Math.max(4, Math.round(len / 5)), w = 2.6, lite = !!o.lite;
        s.course(true).fx(0);
        for (let i = 0; i < n; i++) {
            const z0 = i / n * len, z1 = (i + 1) / n * len, y0 = z0 / len * rise, y1 = z1 / len * rise, zm = (z0 + z1) / 2, half = (z1 - z0) / 2;
            s.paint(C.cobble, 0).quad([-w, y0, z0], [w, y0, z0], [w, y1, z1], [-w, y1, z1], [0, 0.97, -0.24]);
            for (const x of [-w, w]) {
                const sx = Math.sign(x);
                // A pier, and the arch sprung from it to the next: the wall above the arch, and the arch's own underside.
                s.paint(C.stone, 0).box(x - sx * 0.1, y0 / 2 - 1.5, z0 + 0.5, 0.5, y0 / 2 + 1.5, 0.6, 0.6);
                for (let k = 0; k < 4; k++) { const a0 = k / 4 * Math.PI, a1 = (k + 1) / 4 * Math.PI, at = a => [zm - Math.cos(a) * (half - 0.5), Math.max(-0.5, L.mix(y0, y1, 0.5 - Math.cos(a) / 2) - 1.2 + Math.sin(a) * Math.min(1.6, 0.4 + y0 * 0.3) - Math.min(2.2, y0 * 0.5))], p = at(a0), q = at(a1); s.quad([x, p[1], p[0]], [x, q[1], q[0]], [x, L.mix(y0, y1, (q[0] - z0) / (z1 - z0)), q[0]], [x, L.mix(y0, y1, (p[0] - z0) / (z1 - z0)), p[0]], [sx, 0, 0], [0.6, 0.6, 1, 1]); }
                s.paint(LIGHT, 0).quad([x - sx * 0.35, y0 + 1.0, z0], [x + sx * 0.05, y0 + 1.0, z0], [x + sx * 0.05, y1 + 1.0, z1], [x - sx * 0.35, y1 + 1.0, z1], [0, 1, 0]);
                s.paint(C.stone, 0).quad([x, y0, z0], [x, y1, z1], [x, y1 + 1.0, z1], [x, y0 + 1.0, z0], [sx, 0, 0]).quad([x - sx * 0.35, y0, z0], [x - sx * 0.35, y1, z1], [x - sx * 0.35, y1 + 1.0, z1], [x - sx * 0.35, y0 + 1.0, z0], [-sx, 0, 0]);
            }
        }
        for (const x of [-w - 0.1, w + 0.1]) { s.paint(C.stone, 0).box(x, 1.1, -0.5, 0.5, 1.5, 0.5, 0.7, [LIGHT, 0]); if (!lite) s.course(false).paint(C.flame, 0).fx(0, 255, 60).prism(5, x, 2.6, -0.5, 0.26, 3.3, 0).fx(0).course(true); }
        s.course(false);
        return { glow: [[w, 2.9, -0.5], [-w, 2.9, -0.5]] };
    }
    // The cathedral. Its west front (two towers under spires, a round window between them, the great door) faces +z,
    // toward the road; the nave runs back from it under a steep roof, buttressed; a spire stands over the crossing.
    function cathedral(s, o) {
        const lite = !!o.lite, v = o.v || 0, out = { glow: [], beacons: [] }, zf = 8, zb = -26, H = 14, ridge = 22.5;
        s.course(true).fx(0).paint(C.stone, 0).box(0, H / 2 - 1, (zf + zb) / 2, 6, H / 2 + 1, (zf - zb) / 2, 0.55);
        for (const sgn of [-1, 1]) {
            s.paint(C.stone, 0).box(sgn * 8.2, 2.6, (zf + zb) / 2 - 1, 2.4, 3.6, (zf - zb) / 2 - 2, 0.55);                             // the aisles
            s.paint(C.white, 5).quad([sgn * 10.9, 5.9, zb + 1], [sgn * 10.9, 5.9, zf - 2], [sgn * 5.9, 8.9, zf - 2], [sgn * 5.9, 8.9, zb + 1]);
            s.quad([sgn * 6.6, H - 0.2, zb - 0.5], [sgn * 6.6, H - 0.2, zf], [0, ridge, zf], [0, ridge, zb - 0.5]);
            for (let i = 0; i < 6; i++) {
                const z = zf - 5 - i * 5.1, on = M.rnd(v, i * 2 + sgn) < 0.8;
                if (!lite) { s.course(true).paint(C.stone, 0).box(sgn * 11, 3.4, z + 2.5, 0.5, 4.4, 0.6, 0.6).paint(C.white, 5).prism(4, sgn * 11, 7.8, z + 2.5, 0.75, 9.9, 0, { turn: 0.785, flat: true }); }
                win(s, sgn * 6.04, 10.2, z, sgn, 0, 0.62, 2.1, on, i % 2 ? [255, 196, 120] : [150, 196, 255]);
                if (!lite) win(s, sgn * 10.64, 3.6, z, sgn, 0, 0.5, 1.4, on, [255, 204, 130]);
                s.course(true);
            }
            // The west towers and their spires.
            tw(s, sgn * 7.6, zf - 0.5, { h: 29 + 2 * (sgn > 0), r: 3.4, square: true, roof: 2, v: v + sgn, grand: true, lite, tall: true, spire: 17, skirt: 1 });
        }
        s.paint(C.stone, 0).tri([-6, H, zf], [6, H, zf], [0, ridge - 0.3, zf], [0, 0, 1]).tri([6, H, zb], [-6, H, zb], [0, ridge - 0.3, zb], [0, 0, -1]);
        s.prism(lite ? 5 : 7, 0, -1, zb, 6, H, 6, { foot: 0.55 }).paint(C.white, 5).prism(lite ? 5 : 7, 0, H - 0.2, zb, 6.5, ridge - 2, 0);                  // the round east end
        // Over the crossing, a spire.
        s.course(true).paint(C.stone, 0).prism(8, 0, ridge - 4, -12, 2.6, ridge + 4, 2.3, { flat: true }).paint(C.white, 5).prism(8, 0, ridge + 4, -12, 2.9, ridge + 30, 0);
        s.course(false).paint(C.gold, 0).blob(0, ridge + 30.2, -12, 0.4, 0.4, 0.4, { segs: 6, bands: 3, lump: 0 });
        // The west front: the round window (it glows blue and gold), and the door under its arch.
        s.paint([120, 170, 240], 0).fx(0, 255).prism(lite ? 8 : 12, 0, 11.4, zf + 0.06, 2.3, 11.41, 0, { squash: 0.01 });
        if (!lite) { s.paint([255, 210, 120], 0).prism(8, 0, 11.4, zf + 0.09, 0.8, 11.41, 0, { squash: 0.01 }); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; s.fx(0).paint(C.stone, 0).box(Math.sin(a) * 1.5, 11.4 + Math.cos(a) * 1.5, zf + 0.1, 0.07 + 0.7 * Math.abs(Math.sin(a)), 0.07 + 0.7 * Math.abs(Math.cos(a)), 0.05, 1); } }
        s.fx(0).paint([70, 48, 40], 0).quad([-1.6, -0.5, zf + 0.08], [1.6, -0.5, zf + 0.08], [1.6, 4.4, zf + 0.08], [-1.6, 4.4, zf + 0.08], [0, 0, 1], [0.5, 0.5, 0.9, 0.9]).tri([-1.6, 4.4, zf + 0.08], [1.6, 4.4, zf + 0.08], [0, 6.3, zf + 0.08], [0, 0, 1]);
        s.course(true).paint(LIGHT, 0).box(0, -0.2, zf + 1.6, 3.4, 0.4, 1.6, 0.7);
        s.course(false);
        out.glow.push([0, 11.4, zf + 1], [0, 3, zf + 2.4]);
        out.beacons.push([0, 11.4, zf + 1, 7, 0.55, 0.75, 1], [0, 10, -8, 14, 1, 0.7, 0.36]);
        return out;
    }
    // The guildhall: a long stone and timber hall on an arcade, with a belfry at one end and its clock lit.
    function hall(s, o) {
        const lite = !!o.lite, v = o.v || 0;
        const got = M.house(s, { w: 20, dp: 11, floors: 3, roof: 2, v, stoneBase: true, jetty: true, shop: !lite, lite, fine: !lite, endOn: false });
        s.at(null);
        tw(s, -12.4, -1, { h: 24, r: 2.9, square: true, roof: 2, v: v + 0.5, grand: true, lite, tall: true, spire: 9 });
        s.course(false).paint(C.gold, 0).fx(0, 180).prism(lite ? 8 : 12, -12.4, 19.5, 2.66, 1.5, 19.51, 0, { squash: 0.01 });
        if (!lite) s.paint([40, 34, 36], 0).fx(0).box(-12.4, 19.9, 2.7, 0.07, 0.55, 0.03, 1).box(-12.0, 19.5, 2.7, 0.42, 0.07, 0.03, 1);
        s.fx(0).course(true).paint(LIGHT, 0).box(0, -0.1, 6.6, 9.6, 0.36, 1.2, 0.7);
        s.course(false);
        return { glow: [...got.glow.filter(g => g[2] > 0).slice(0, 4), [-12.4, 19.5, 3.4]], smoke: got.smoke, beacons: [[-12.4, 19.5, 3, 5, 1, 0.8, 0.4], [0, 7, 6.5, 10, 1, 0.66, 0.3]] };
    }
    // The market hall: a great roof on posts, open all round, for when it rains.
    function markethall(s, o) {
        s.course(false).fx(0);
        for (const x of [-5.6, -1.9, 1.9, 5.6]) for (const z of [-3.6, 3.6]) { s.paint(C.timber, 0).tube([[x, -0.3, z, 0.24, 1], [x, 4.2, z, 0.2, 1]], 6); s.box(x, 4.1, z, 0.42, 0.12, 0.42, 1); if (Math.abs(x) < 5) for (const k of [-1, 1]) s.tube([[x, 3.1, z, 0.09, 1], [x + k * 1.0, 4.2, z, 0.09, 1]], 4); }
        for (const z of [-3.6, 3.6]) s.paint(C.timber, 0).box(0, 4.35, z, 6.2, 0.16, 0.2, 1);
        s.course(true).paint(C.white, 5);
        for (const sgn of [-1, 1]) { s.quad([-6.8, 4.3, sgn * 4.5], [6.8, 4.3, sgn * 4.5], [4.2, 8.2, 0], [-4.2, 8.2, 0]); s.tri([sgn * 6.8, 4.3, -4.5], [sgn * 6.8, 4.3, 4.5], [sgn * 4.2, 8.2, 0]); }
        s.course(true).paint(C.cobble, 0).box(0, -0.12, 0, 6.4, 0.2, 4.2, 0.8);
        s.course(false).paint(C.plank, 0).box(-2.6, 0.55, 0.4, 1.3, 0.5, 0.5, 0.7).box(2.4, 0.55, -0.6, 1.2, 0.5, 0.5, 0.7);
        for (let i = 0; i < 5; i++) s.paint(M.BRIGHT[i], 0).blob(-3.4 + i * 0.4, 1.16, 0.4, 0.17, 0.13, 0.17, { segs: 5, bands: 2, seed: i }).paint([206 - 14 * (i % 2), 150, 84], 0).blob(1.6 + i * 0.4, 1.14, -0.6, 0.19, 0.1, 0.13, { segs: 5, bands: 2, seed: i });
        return { glow: [[0, 3.6, 0]] };
    }
    // The market's pillar: steps, a shaft, a lantern head and a gilded ball.
    function pillar(s) {
        s.course(true).fx(0);
        for (let i = 0; i < 3; i++) s.paint(i % 2 ? LIGHT : C.stone, 0).prism(8, 0, i * 0.34 - 0.2, 0, 2.3 - i * 0.55, i * 0.34 + 0.34, 2.3 - i * 0.55, { cap: true, flat: true });
        s.paint(C.stone, 0).tube([[0, 1.0, 0, 0.5, 1], [0, 1.4, 0, 0.32, 1], [0, 4.6, 0, 0.26, 1], [0, 4.9, 0, 0.5, 1], [0, 5.1, 0, 0.5, 1]], 8);
        s.course(false).paint(C.flame, 0).fx(0, 255).prism(6, 0, 5.1, 0, 0.3, 5.75, 0.3).fx(0).paint(C.stone, 0).prism(6, 0, 5.75, 0, 0.56, 6.3, 0.05).paint(C.gold, 0).blob(0, 6.5, 0, 0.2, 0.2, 0.2, { segs: 7, bands: 4, lump: 0 });
        return { glow: [[0, 5.4, 0]] };
    }
    const BIG = { gatehouse, drawbridge, citadel, ramp, cathedral, hall, markethall, cross: pillar };
    // Build one of them into a soup; null when it is not one of these.
    function big(s, item) {
        const make = BIG[item.k === 'gate' ? 'gatehouse' : item.k];
        if (!make) return null;
        const got = make(s, item) || {};
        s.at(null).course(false).fx(0);
        return { glow: got.glow || [], smoke: got.smoke || null, beacons: got.beacons || [] };
    }

    return { tree, rock, small, fixed, big, BIG };
})();
