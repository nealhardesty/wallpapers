// Torchlight Descent's scenery, as an underpainting (Painted Village's
// plates, painted-plates.js): the sky's place, the far peaks that take the
// alpenglow, the mountain with its piste cut in switchbacks through the firs,
// the hut at the top and the lift up to it, the woods at its foot, the
// valley's snow and its road, the chalets, the chapel and its onion dome,
// the snowcat's shed, the inn at the foot of the run with its balconies and
// its big lit window, the Christmas tree, lamps, and the firs we look past.
// Flat local colour only: the brushwork and the light come after
// (painted-bake.js). Far things are placed in pixels, near ones in metres
// and depth (TorchLogic.camera).

const TorchArt = (() => {
    const { clamp, CLS } = PaintedLogic;
    const { MAT, TAU, poly, ell } = PaintedPlates;
    const { fir, lantern, fine, star, SNOW, LAMP, WINDOW } = PaintedArt;
    const farFoot = (cam, z) => cam.hor + cam.f / z;
    const lerp = (a, b, t) => a + (b - a) * t;
    const TIMBER = [0.34, 0.22, 0.15], TIMBER2 = [0.42, 0.28, 0.18], PLASTER = [0.93, 0.90, 0.83], SHINGLE = [0.30, 0.24, 0.24];

    // ---- A massif, cell by cell -------------------------------------------------------
    // A mountain is too big and too varied to be filled a shape at a time, so
    // it is worked out in cells of two plate pixels: a relief first (the big
    // flanks under the skyline, ribs and gullies running down from the
    // summits), then for each cell its local colour, which way it faces, its
    // material, the way the brush runs and the air in front, all laid into the
    // plates at once through the skyline as a clip. A cell faces left (SIDEL,
    // in the light) where the relief rises to the right across it, right
    // (SIDER, in its own shade) where it falls, and square on otherwise; so
    // every rib has a lit side and a shaded one, and the strokes painted over
    // them (which stop where the colour or the facing changes) follow the
    // terrain. No pixel is read: the cells are worked out, not looked at.
    const { footByte, angByte } = PaintedLogic;
    const { noise, fbm, smooth, RUNOUT } = TorchLogic;
    function massif(P, o) {
        const { cam, ps } = P, cs = 2 / ps, [X0, Y0, X1, Y1] = o.box;
        const gw = Math.max(1, Math.ceil((X1 - X0) / cs)), gh = Math.max(1, Math.ceil((Y1 - Y0) / cs)), n = gw * gh;
        const D = new Float32Array(n), sky = new Float32Array(gw);
        for (let i = 0; i < gw; i++) sky[i] = o.sky(X0 + (i + 0.5) * cs);
        // The relief, in pixels toward us, wherever there is mountain (and a cell either side).
        // (Not where something nearer will be painted over it: o.under, the next ridge's skyline.)
        const under = new Float32Array(gw).fill(1e9);
        if (o.under) for (let i = 0; i < gw; i++) under[i] = o.under(X0 + (i + 0.5) * cs) + 4 * cs;
        for (let j = 0; j < gh; j++) { const y = Y0 + (j + 0.5) * cs; for (let i = 0; i < gw; i++) if (y > sky[i] - 3 * cs && y < under[i] + 2 * cs) D[j * gw + i] = o.relief(X0 + (i + 0.5) * cs, y, i, j); }
        const A = new Uint8ClampedArray(n * 4), G = new Uint8ClampedArray(n * 4), Mt = new Uint8ClampedArray(n * 4), c = {};
        for (let j = 0; j < gh; j++) {
            const y = Y0 + (j + 0.5) * cs;
            for (let i = 0; i < gw; i++) {
                if (y <= sky[i] - 2 * cs || y > under[i]) continue;
                const q = j * gw + i, g = (D[q + (i < gw - 1 ? 1 : 0)] - D[q - (i > 0 ? 1 : 0)]) / (cs * ((i > 0) + (i < gw - 1)));
                o.paint(X0 + (i + 0.5) * cs, y, D[q], g, c, i, j);
                const k = q * 4;
                A[k] = c.col[0] * 255; A[k + 1] = c.col[1] * 255; A[k + 2] = c.col[2] * 255; A[k + 3] = 255;
                G[k] = footByte(c.foot, cam); G[k + 1] = c.cls; G[k + 2] = 0; G[k + 3] = 255;
                Mt[k] = angByte(c.ang); Mt[k + 1] = clamp(Math.round(c.size * 4), 4, 255); Mt[k + 2] = c.m * 20; Mt[k + 3] = 255;
            }
        }
        const lay = (plate, data, smooth) => {
            const cv = PaintedPlates.canvas(gw, gh); cv.getContext('2d').putImageData(new ImageData(data, gw, gh), 0, 0);
            plate.save(); plate.beginPath(); poly(plate, o.clip); plate.clip(); plate.imageSmoothingEnabled = smooth;
            plate.drawImage(cv, X0, Y0, gw * cs, gh * cs); plate.restore();
        };
        lay(P.alb, A, true); lay(P.geo, G, false); lay(P.mat, Mt, false);
        return { gw, gh, cs, X0, Y0, D, sky, at: (x, y) => { const i = Math.floor((x - X0) / cs), j = Math.floor((y - Y0) / cs); return i < 0 || j < 0 || i >= gw || j >= gh ? -1 : j * gw + i; } };
    }
    // Which way a cell faces, from how the relief leans across it.
    const facing = (g, t) => g > t ? CLS.SIDEL : g < -t ? CLS.SIDER : CLS.UP;
    const lying = (g, t) => g > t ? CLS.TOPL : g < -t ? CLS.TOPR : CLS.TOP;
    // The skyline, blurred: the wider the deeper under it, so the big flanks lean the way the ridges above them do.
    function flanks(sky) {
        const pre = new Float64Array(sky.length + 1);
        for (let i = 0; i < sky.length; i++) pre[i + 1] = pre[i] + sky[i];
        return (i, r) => { const a = Math.max(0, i - r), b = Math.min(sky.length - 1, i + r); return (pre[b + 1] - pre[a]) / (b - a + 1); };
    }
    const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const SNOW_LIT = [0.96, 0.96, 1], SNOW_FACE = [0.92, 0.93, 0.99], SNOW_SHADE = [0.83, 0.86, 0.97], ROCK = [0.35, 0.33, 0.37], ROCK_WARM = [0.44, 0.38, 0.34], FOREST = [0.12, 0.19, 0.2], FOREST_SNOW = [0.38, 0.44, 0.5], GROOMED = [0.985, 0.985, 1];

    // ---- The far peaks ------------------------------------------------------------
    // A range across the whole width behind the mountain: summits of rock and
    // snow, ribs and couloirs down from each, the last of the forest low down,
    // all far enough to be blue with the air. Their snow that faces the light
    // is frost to the plates, so it takes the low light whichever way it
    // faces: the alpenglow at dusk, the moon at night.
    function peaks(P, L) {
        const { W, hor, u } = P.cam, foot = farFoot(P.cam, 16), base = hor + 6 * u, M = L.mountain;
        const h = x => { const t = x / W; return hor * (0.36 * Math.exp(-(((t - 0.06) / 0.09) ** 2)) + 0.62 * Math.exp(-(((t - 0.8) / 0.075) ** 2)) + 0.44 * Math.exp(-(((t - 0.66) / 0.06) ** 2)) + 0.5 * Math.exp(-(((t - 0.95) / 0.07) ** 2)) + 0.3 * Math.exp(-(((t - 0.22) / 0.08) ** 2)) + 0.18); };
        let ridge = [];
        for (let x = -40 * u; x <= W + 40 * u; x += 34 * u) ridge.push([x, hor - h(x)]);
        for (let lev = 0; lev < 4; lev++) {
            const out = [ridge[0]];
            for (let i = 0; i < ridge.length - 1; i++) { const a = ridge[i], b = ridge[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]), k = clamp((base - Math.min(a[1], b[1])) / hor); out.push([(a[0] + b[0]) / 2, Math.min(base, (a[1] + b[1]) / 2 + P.rr(-1, 1) * len * (0.1 + 0.22 * k))], b); }
            ridge = out;
        }
        // The summits: where the skyline is highest for a while around.
        const tops = [];
        for (let i = 3; i < ridge.length - 3; i++) if (ridge.slice(i - 6, i + 7).every(p => p[1] >= ridge[i][1])) tops.push(ridge[i]);
        if (!tops.length) tops.push(ridge[ridge.length >> 1]);
        const skyAt = x => { for (let i = 1; i < ridge.length; i++) if (x <= ridge[i][0]) return lerp(ridge[i - 1][1], ridge[i][1], (x - ridge[i - 1][0]) / (ridge[i][0] - ridge[i - 1][0])); return base; };
        const clip = [[-40 * u, base], ...ridge, [W + 40 * u, base]];
        P.set({ cls: CLS.UP, foot, haze: 0, m: MAT.SNOW, size: 6, ang: 1.1 });
        P.fill([0.86, 0.88, 0.98], g => poly(g, clip));
        const top = Math.min(...ridge.map(p => p[1]));
        const gw0 = Math.ceil(W / (2 / P.ps)), ribs = new Float32Array(gw0 * (Math.ceil((base - top + 2) / (2 / P.ps)) + 1));
        const near = x => { let b = tops[0]; for (const t of tops) if (Math.abs(t[0] - x) < Math.abs(b[0] - x)) b = t; return b; };
        massif(P, {
            box: [0, top - 2, W, base], clip, sky: skyAt, under: M.skyAt,
            relief: (x, y, i, j) => {
                const p = near(x), d = y - skyAt(x), a = (x - p[0]) / (y - p[1] + 0.22 * (base - p[1])), n = fbm(a * 3.1 + p[0] * 0.013, (y - p[1]) / (base - p[1]) * 1.5, 23, 2), rib = 1 - Math.abs(n);
                ribs[j * gw0 + i] = rib;
                return -(skyAt(x - 30 * u - d) + skyAt(x + 30 * u + d)) * 0.5 * 0.75 + rib * rib * (base - p[1]) * 0.09;
            },
            paint: (x, y, D, g, c, i, j) => {
                const p = near(x), hf = clamp((base - y) / (base - p[1])), rib = ribs[j * gw0 + i];
                const steep = Math.abs(g), cls = facing(g, 0.3), band = Math.sin((y + rib * 14 * u) / (9 * u)) > 0.55 && noise(x / (40 * u), y / (30 * u), 29) > -0.1;
                const rock = hf > 0.2 && (steep > 1.1 - 0.35 * hf || (rib > 0.8 && hf > 0.35) || (band && rib > 0.4 && hf > 0.3)) && noise(x / (7 * u), y / (7 * u), 31) > -0.55;
                c.foot = foot; c.ang = Math.atan2(y - p[1] + 0.22 * (base - p[1]), x - p[0]); c.cls = cls;
                if (hf < 0.16 + 0.05 * noise(x / (50 * u), 0, 33)) { c.col = P.vary(noise(x / (3 * u), y / (3 * u), 35) > 0.3 ? FOREST_SNOW : FOREST, 0.06); c.m = MAT.FIR; c.size = 3.6; c.ang = Math.PI / 2; return; }
                if (rock) { c.col = mixc(ROCK, ROCK_WARM, clamp(0.5 + noise(x / (12 * u), y / (20 * u), 37))); c.m = MAT.STONE; c.size = 3.4; return; }
                c.col = cls === CLS.SIDEL ? SNOW_LIT : cls === CLS.SIDER ? SNOW_SHADE : SNOW_FACE;
                c.m = cls !== CLS.SIDER && hf > 0.3 ? MAT.FROST : MAT.SNOW; c.size = 5;
            },
        });
    }

    // ---- The mountain -------------------------------------------------------------
    // The resort's own: the skyline (TorchLogic.mountainOf), the summit's
    // pyramid of rock bands and couloirs, snowfields that follow its ribs, the
    // open bowl under the summit, the tree line with its glades and the
    // avalanche paths that come down through it, and the forest below with the
    // runs cut through it: the torch run's broad corridor, a red down the
    // lift's line, a blue off the left ridge; groomed, with corduroy; the lift's
    // line cleared under it. The trees are a mass where they stand thick, and
    // stand one by one at its edges, in the glades and along the runs.
    function mountain(P, L) {
        const { cam } = P, { u } = cam, M = L.mountain, C = L.corridor, Y = L.year, S = M.cx;
        const top = M.top, foot = M.base, FH = foot - top, x0 = M.cx - M.half * 1.5, x1 = M.cx + M.half * 1.45;
        const hazeOf = y => farFoot(cam, lerp(6.8, 11, clamp((M.footY - y) / (M.footY - top))));
        const clip = [[x0, foot], ...M.outline, [x1, foot]];
        P.set({ cls: CLS.UP, foot: hazeOf(lerp(top, foot, 0.5)), haze: 0, m: MAT.SNOW, size: 5, ang: 1.4 });
        P.fill([0.92, 0.93, 0.99], g => poly(g, clip));
        // Where the runs are: a share of the half-width from the middle of a run (under 1 is on it), and the way it runs.
        const box = [Math.max(0, x0), top - 2, Math.min(cam.W, x1), foot], cs = 2 / P.ps, gw = Math.ceil((box[2] - box[0]) / cs), gh = Math.ceil((box[3] - box[1]) / cs);
        const pd = new Float32Array(gw * gh).fill(9), pang = new Float32Array(gw * gh), cut = new Uint8Array(gw * gh), cell = (x, y) => { const i = Math.floor((x - box[0]) / cs), j = Math.floor((y - box[1]) / cs); return i < 0 || j < 0 || i >= gw || j >= gh ? -1 : j * gw + i; };
        for (let j = 0; j < gh; j++) {
            const y = box[1] + (j + 0.5) * cs;
            if (y < C.y0 - 6 * u || y > M.footY + 12 * u) continue;
            const t = C.tOf(y), cx = C.cx(t), H = C.edge(t, cam.sc(M.faceZ(y))), lean = C.cx(C.tOf(y + 6 * u)) - C.cx(C.tOf(y - 6 * u));
            for (let i = Math.max(0, Math.floor((cx - H * 1.3 - box[0]) / cs)); i < gw && box[0] + i * cs < cx + H * 1.3; i++) { const q = j * gw + i, d = Math.abs(box[0] + (i + 0.5) * cs - cx) / H * (y < C.y0 ? 1 + (C.y0 - y) / (3 * u) : 1); if (d < pd[q]) { pd[q] = d; pang[q] = Math.atan2(12 * u, lean); } }
        }
        for (const R of L.runs.slice(1)) for (let k = 0; k < R.pts.length; k += 2) {
            const p = R.pts[k]; if (p.ground) break;
            const q0 = R.pts[Math.min(R.pts.length - 1, k + 2)], ang = Math.atan2(q0.y - p.y, q0.x - p.x), r = p.hw * 1.3;
            for (let y = p.y - r; y <= p.y + r; y += cs) for (let x = p.x - r; x <= p.x + r; x += cs) { const q = cell(x, y); if (q < 0) continue; const d = Math.hypot(x - p.x, y - p.y) / p.hw; if (d < pd[q]) { pd[q] = d; pang[q] = ang; } }
        }
        const lf = L.lift;
        if (lf) for (let y = lf.y1; y <= lf.y0; y += cs) { const x = lerp(lf.x1, lf.x0, (y - lf.y1) / (lf.y0 - lf.y1)), w = Math.max(2 * u, 3.5 * cam.sc(M.faceZ(y))); for (let xx = x - w; xx <= x + w; xx += cs) { const q = cell(xx, y); if (q >= 0) cut[q] = 1; } }
        const hutAt = (x, y) => Math.hypot(x - L.hut.x - 8 * u, (y - L.hut.y) * 1.4) < 22 * u;
        const inBowl = (x, y) => ((x - Y.cx) / (Y.h * 1.7)) ** 2 + ((y - Y.cy) / (Y.h * 0.62)) ** 2 < 1;
        const forest = new Float32Array(gw * gh);
        // The ribs, fanning out from the summit and wandering as they come down.
        const ribAt = (x, y) => { const a = (x - S) / (y - top + 0.3 * FH), n = fbm(a * 6, (y - top) / FH * 2.4, 5, 3); return [1 - Math.abs(n), a]; };
        let F = null;
        const ribs = new Float32Array(gw * gh), spokes = new Float32Array(gw * gh);
        const R = massif(P, {
            box, clip, sky: M.skyAt,
            relief: (x, y, i, j) => {
                F ||= flanks(Array.from({ length: gw }, (_, k) => M.skyAt(box[0] + (k + 0.5) * cs)));
                const d = Math.max(0, y - M.skyAt(x)), hf = clamp((foot - y) / FH), [rib, a] = ribAt(x, y), q = j * gw + i;
                ribs[q] = rib; spokes[q] = a;
                return -F(i, Math.round((0.03 * cam.W + 0.5 * d) / cs)) * 0.45 + rib * rib * FH * (0.025 + 0.05 * hf);
            },
            paint: (x, y, D, g, c, i, j) => {
                const q = j * gw + i, hf = clamp((foot - y) / FH), rib = ribs[q], a = spokes[q], steep = Math.abs(g);
                c.foot = hazeOf(y); c.ang = Math.atan2(y - top + 0.3 * FH, x - S);
                // The runs: groomed snow, brushed along the way they run.
                if (pd[q] < 1) { const cut = hf < 0.5, edge = pd[q] > 0.84; c.col = P.vary(cut && edge ? SNOW_SHADE : GROOMED, 0.008); c.cls = cut && !edge ? lying(g, 0.6) : facing(g, 0.5); c.m = hf > 0.5 && g > -0.5 ? MAT.FROST : MAT.SNOW; c.size = 3.2; c.ang = pang[q]; return; }
                const open = cut[q] || hutAt(x, y) || inBowl(x, y);
                // The tree line: lower in the bowl under the summit, higher up the ribs; glades, and the avalanche paths down the gullies.
                const tl = 0.6 + 0.08 * fbm(x / (0.25 * FH), 0.5, 7, 2) + 0.06 * (rib - 0.5) - 0.16 * Math.exp(-(((x - Y.cx) / (0.3 * M.half)) ** 2));
                let f = smooth(tl + 0.04, tl - 0.06, hf);
                f *= smooth(-0.62, -0.34, fbm(x / (26 * u), y / (18 * u), 9, 2));
                f *= 1 - smooth(0.26, 0.1, rib) * smooth(0.1, 0.4, noise(a * 1.7, 2.2, 11)) * smooth(0.16, 0.3, hf);
                if (pd[q] < 1.25) f *= smooth(1, 1.25, pd[q]);
                forest[q] = open ? 0 : f;
                const speck = noise(x / (2.2 * u), y / (2.2 * u), 13);
                if (!open && f + 0.2 * noise(x / (5 * u), y / (5 * u), 15) > 0.55) {
                    c.col = P.vary(speck > 0.35 - 0.3 * hf ? FOREST_SNOW : FOREST, 0.08); c.cls = g < -0.6 ? CLS.SIDER : g > 0.7 ? CLS.SIDEL : CLS.UP; c.m = MAT.FIR; c.size = 3.4; c.ang = Math.PI / 2; return;
                }
                // Rock: too steep to hold snow, the crests of the ribs, and cliff bands that the couloirs cut through.
                const rz = smooth(0.38, 0.64, hf + 0.08 * fbm(x / (60 * u), y / (60 * u), 17, 2));
                const band = Math.sin((y - rib * rib * 10 * u) / (FH * 0.022)) > 0.62 && noise(x / (70 * u), y / (40 * u), 19) > -0.2 && rib > 0.38;
                const crag = rz * (0.45 + 0.55 * rib) + 0.3 * fbm(x / (16 * u), y / (24 * u), 27, 3);
                const rock = !open && rz > 0 && (crag > 0.5 || steep > 1.2 - 0.5 * rz || (band && rz > 0.3)) && noise(x / (5 * u), y / (5 * u), 21) > -0.55 + 0.3 * (1 - rz);
                const cls = facing(g, 0.35);
                if (rock) { c.col = P.vary(mixc(ROCK, ROCK_WARM, clamp(0.5 + 0.8 * noise(x / (14 * u), y / (26 * u), 25))), 0.07); c.cls = cls; c.m = MAT.STONE; c.size = 3; return; }
                // Snow: lit, square on or in shade; the high snow that faces the light takes the alpenglow and the moon (frost).
                c.col = P.vary(cls === CLS.SIDEL ? SNOW_LIT : cls === CLS.SIDER ? SNOW_SHADE : SNOW_FACE, 0.012);
                c.cls = inBowl(x, y) && steep < 0.3 ? lying(g, 0.2) : cls;
                c.m = cls !== CLS.SIDER && hf > 0.42 ? MAT.FROST : MAT.SNOW; c.size = open ? 4 : 5;
            },
        });
        // Groomed: corduroy along the runs, faint lines a few metres apart.
        const g = P.alb; g.save(); g.strokeStyle = 'rgba(200,206,234,0.4)'; g.lineCap = 'round';
        for (const run of L.runs) {
            const pts = run.pts.filter(p => !p.ground && p.y > lerp(top, M.footY, 0.55)), lanes = run.kind === 'torch' ? 7 : 3;
            for (let l = -lanes; l <= lanes; l++) {
                g.beginPath();
                for (let k = 0; k < pts.length; k += 2) { const p = pts[k], w = run.kind === 'torch' ? C.edge(C.tOf(p.y), cam.sc(p.z)) : p.hw; g.lineTo(p.x + l / (lanes + 1) * w * 0.92, p.y); }
                g.lineWidth = Math.max(0.5, 0.5 * u); g.stroke();
            }
        }
        g.restore();
        // The trees one by one: along the forest's edges, in the glades, along the runs and up to the tree line.
        let trees = 0;
        for (let y = top + 0.2 * FH; y < M.footY; y += 4.2 * u) for (let x = box[0]; x < box[2]; x += 4.4 * u) {
            const px = x + P.rr(0, 4.4) * u, py = y + P.rr(0, 4.2) * u, q = R.at(px, py);
            if (q < 0 || py < M.skyAt(px) + 6 * u || pd[q] < 1.05 || cut[q]) continue;
            const f = forest[q], edge = f > 0.2 && f < 0.75, lone = f > 0.03 && f <= 0.2;
            if (!(edge && P.R() < 0.75) && !(lone && P.R() < 0.18) && !(f >= 0.75 && P.R() < 0.07)) continue;
            const z = M.faceZ(py), r = clamp(3.4 * cam.sc(z), 1.5 * u, 5 * u), snowy = P.R() < 0.45;
            P.set({ cls: CLS.UP, foot: hazeOf(py), m: MAT.FIR, size: 2, ang: Math.PI / 2, haze: 0 });
            P.fill(P.vary(snowy ? [0.3, 0.38, 0.45] : [0.12, 0.2, 0.22], 0.16), gg => poly(gg, [[px - r * 0.55, py + r * 0.6], [px, py - r * 2.1], [px + r * 0.55, py + r * 0.6]]));
            if (snowy) { P.set({ cls: CLS.TOP, m: MAT.ROOF }); P.fill([0.88, 0.9, 0.99], gg => poly(gg, [[px - r * 0.24, py - r * 0.9], [px, py - r * 2.1], [px + r * 0.24, py - r * 0.9]])); }
            trees++;
        }
        P.spots.slope = [x0, top, x1, foot];
        P.spots.mountainTrees = trees;
    }

    // The summit station, where the torches are lit: a long low restaurant with
    // a lit row of windows and a terrace, the lift's top station beside it; and
    // the cross on the summit above.
    function summit(P, L, groups) {
        const { cam } = P, u = cam.u, h = L.hut, M = L.mountain, s = cam.sc(M.faceZ(h.y)) * 1.4, foot = farFoot(cam, 11);
        const grp = groups.hut = P.group('hut', { kind: 'hut', far: true });
        P.set({ cls: CLS.UP, foot, m: MAT.WOOD, size: 1.6, ang: 0, haze: 0 });
        P.fill(TIMBER, g => g.rect(h.x - 7 * s, h.y - 3.2 * s, 11 * s, 3.2 * s));
        P.fill([0.5, 0.48, 0.5], g => g.rect(h.x - 7 * s, h.y - 1 * s, 11 * s, 1 * s));
        P.set({ cls: CLS.TOP, m: MAT.ROOF, size: 1.6 }); P.fill(SNOW, g => poly(g, [[h.x - 7.8 * s, h.y - 3 * s], [h.x - 6 * s, h.y - 4.6 * s], [h.x + 3 * s, h.y - 4.6 * s], [h.x + 4.8 * s, h.y - 3 * s]]));
        // The terrace, its rail.
        P.set({ cls: CLS.UP, m: MAT.WOOD, size: 1.4 }); P.line([0.25, 0.2, 0.18], Math.max(0.6, 0.18 * s), g => { g.moveTo(h.x - 11 * s, h.y - 0.9 * s); g.lineTo(h.x - 7 * s, h.y - 0.9 * s); });
        P.set({ cls: CLS.SELF, m: MAT.GLASS, size: 1.4 });
        for (let i = 0; i < 5; i++) { const x = h.x + (-6.2 + i * 2) * s; P.fill('#ffd27a', g => g.rect(x, h.y - 2.6 * s, 1.2 * s, 1.1 * s)); P.glowRect(grp, 'rgba(255,200,110,0.95)', x, h.y - 2.6 * s, 1.2 * s, 1.1 * s); }
        P.halo(grp, h.x - 2 * s, h.y - 1.8 * s, 7 * s);
        // The lift's top station: a grey house over the bullwheel, on its posts.
        const l = L.lift;
        if (l) {
            P.set({ cls: CLS.UP, m: MAT.WALL, size: 1.4, ang: Math.PI / 2 });
            P.fill([0.56, 0.56, 0.6], g => g.rect(l.x1 - 2.6 * s, l.y1 - 2.4 * s, 5.2 * s, 2.6 * s));
            P.fill([0.22, 0.22, 0.26], g => { g.rect(l.x1 - 0.3 * s, l.y1 - 0.2 * s, 0.6 * s, 1.6 * s); g.rect(l.x1 - 2.2 * s, l.y1 + 0.2 * s, 4.4 * s, 0.4 * s); });
            P.set({ cls: CLS.TOP, m: MAT.ROOF }); P.fill(SNOW, g => g.rect(l.x1 - 2.9 * s, l.y1 - 3 * s, 5.8 * s, 0.7 * s));
        }
        // The summit cross.
        const cs = cam.sc(M.faceZ(M.top)) * 1.6, cx = M.cx, cy = M.top + 1.5 * u;
        P.set({ cls: CLS.UP, foot: farFoot(cam, 12), m: MAT.WOOD, size: 1.2, ang: Math.PI / 2 });
        P.line([0.2, 0.17, 0.16], Math.max(0.7 * u, 0.35 * cs), g => { g.moveTo(cx, cy); g.lineTo(cx, cy - 5 * cs); g.moveTo(cx - 1.6 * cs, cy - 3.6 * cs); g.lineTo(cx + 1.6 * cs, cy - 3.6 * cs); });
        P.hit('hut', h.x - 12 * s, h.y - 6 * s, h.x + 6 * s, h.y + 1 * s, { group: grp });
        P.spots.hut = { x: h.x, y: h.y, s };
    }

    // The lift's line: a cable from the foot to the top, a tower now and then, the station at the foot.
    function liftLine(P, L, groups) {
        const l = L.lift;
        if (!l) return;
        const { cam } = P, u = cam.u, M = L.mountain, n = 7;
        P.set({ cls: CLS.UP, foot: farFoot(cam, 9.5), m: MAT.WOOD, size: 1.4, ang: Math.atan2(l.y1 - l.y0, l.x1 - l.x0), haze: 0 });
        for (let i = 1; i < n; i++) {
            const t = i / n, x = lerp(l.x0, l.x1, t), y = lerp(l.y0, l.y1, t), s = cam.sc(M.faceZ(y)), th = 8 * s;
            P.set({ ang: Math.PI / 2 }); P.fill([0.24, 0.24, 0.28], g => { g.rect(x - 0.25 * s, y, 0.5 * s, th); g.rect(x - 1.6 * s, y - 0.25 * s, 3.2 * s, 0.4 * s); });
        }
        P.set({ ang: Math.atan2(l.y1 - l.y0, l.x1 - l.x0) });
        for (const dx of [-1, 1]) P.line([0.16, 0.16, 0.2], Math.max(0.7 * u, 0.6), g => { const s0 = cam.sc(M.faceZ(l.y0)), s1 = cam.sc(M.faceZ(l.y1)); g.moveTo(l.x0 + dx * 1.4 * s0, l.y0 - 0.2 * s0); g.lineTo(l.x1 + dx * 1.4 * s1, l.y1 - 0.2 * s1); });
        // The station at the foot, lit.
        const s = cam.sc(M.faceZ(l.y0)) * 1.2, grp = groups.base = P.group('base', { kind: 'porch', far: true });
        P.set({ cls: CLS.UP, m: MAT.WOOD, size: 1.6, ang: 0, foot: farFoot(cam, 8.2) });
        P.fill(TIMBER, g => g.rect(l.x0 - 4 * s, l.y0 - 3 * s, 8 * s, 3.4 * s));
        P.set({ cls: CLS.TOP, m: MAT.ROOF }); P.fill(SNOW, g => poly(g, [[l.x0 - 4.8 * s, l.y0 - 2.8 * s], [l.x0 + 4.8 * s, l.y0 - 2.8 * s], [l.x0 + 4 * s, l.y0 - 4 * s], [l.x0 - 4 * s, l.y0 - 4 * s]]));
        P.set({ cls: CLS.SELF, m: MAT.GLASS, size: 1.4 }); P.fill('#ffd27a', g => g.rect(l.x0 - 2.6 * s, l.y0 - 2 * s, 1.6 * s, 1 * s));
        P.glowRect(grp, 'rgba(255,200,110,0.95)', l.x0 - 2.6 * s, l.y0 - 2 * s, 1.6 * s, 1 * s); P.halo(grp, l.x0 - 1.8 * s, l.y0 - 1.5 * s, 3 * s);
        P.spots.lift = { ...l, n };
    }

    // ---- The woods at the mountain's foot ----------------------------------------------
    // Ranks of firs, far to near, each a dark band with trees along its top; open
    // where the run comes out of them and where the lift's station stands.
    function woods(P, L, open) {
        const { cam } = P, { W, u } = cam, M = L.mountain, ranks = 7;
        for (let i = 0; i < ranks; i++) {
            const t = i / (ranks - 1), y0 = lerp(M.footY - 26 * u, M.footY + 14 * u, t), r = (4.5 + 5 * t) * u, z = lerp(9.5, 7.4, t);
            const wave = x => (9 * Math.sin(x / (150 * u) + i * 1.9) + 5 * Math.sin(x / (61 * u) + i)) * u;
            const set = () => P.set({ cls: CLS.UP, foot: farFoot(cam, z), haze: 0, m: MAT.FIR, size: 2.6, ang: Math.PI / 2 });
            const edge = []; for (let x = -20 * u; x <= W + 20 * u; x += 20 * u) edge.push([x, y0 + wave(x) + r * 0.6]);
            const holes = open.filter(c => Math.abs(c.y - y0) < c.ry * 2.5);
            set();
            // The dark under the trees, broken where something stands open.
            P.fill(P.vary([0.17, 0.24, 0.29], 0.05), g => poly(g, [...edge, ...edge.slice().reverse().map(([x, y]) => [x, y + 16 * u + r * 0.4])]));
            // Where a run comes out of the trees: a lane cut through the rank, as wide as the run, the way the run goes.
            // At the woods' own depth and in their air, so it takes the same light as the snow about it; groomed down
            // the middle, in the trees' shade along ragged edges, opening toward us.
            for (const c of holes) {
                const ya = y0 - r * 1.2, yb = y0 + 16 * u + r * 0.4, w = c.rx * (0.5 + 0.6 * t), L = [], R = [];
                for (let k = 0; k <= 6; k++) { const y = lerp(ya, yb, k / 6), x = c.xAt(y), e = w * (0.9 + 0.12 * k / 6); L.push([x - e - P.rr(0, 0.7) * r, y]); R.push([x + e + P.rr(0, 0.7) * r, y]); }
                P.set({ cls: CLS.UP, m: MAT.SNOW, size: 3, ang: Math.PI / 2, foot: farFoot(cam, z), haze: 0 });
                P.fill(P.vary([0.8, 0.83, 0.94], 0.02), g => poly(g, [...L, ...R.slice().reverse()]));
                P.set({ cls: CLS.TOP });
                P.fill(P.vary([0.93, 0.94, 1], 0.015), g => poly(g, [...L.map(([x, y], k) => [lerp(x, R[k][0], 0.22), y]), ...R.map(([x, y], k) => [lerp(L[k][0], x, 0.78), y]).reverse()]));
                set();
            }
            for (let x = -10 * u + P.rr(0, r); x < W + 10 * u; x += r * P.rr(0.5, 1.0)) {
                const y = y0 + wave(x) + P.rr(-0.3, 0.5) * r, h = r * P.rr(1.8, 2.7), snowy = P.R() < 0.38;
                if (holes.some(c => Math.abs(x - c.xAt(y)) < c.rx * (0.5 + 0.6 * t) * 0.95)) continue;
                P.fill(P.vary(snowy ? [0.44, 0.52, 0.62] : [0.15, 0.24, 0.27], 0.16), g => poly(g, [[x - r * 0.5, y + r], [x, y - h], [x + r * 0.5, y + r]]));
                if (snowy) P.fill([0.86, 0.89, 0.98], g => poly(g, [[x - r * 0.2, y - h * 0.45], [x, y - h], [x + r * 0.2, y - h * 0.45]]));
            }
        }
    }

    // ---- The valley ------------------------------------------------------------------------

    function ground(P, L) {
        const { W, H, hor, f, u, sx, sy, sc } = P.cam;
        P.set({ cls: CLS.GROUND, m: MAT.SNOW, size: 10, ang: null, haze: 0, foot: H });
        P.fill([0.95, 0.955, 1.0], g => g.rect(0, hor - 4, W, H - hor + 4));
        for (let i = 0; i < 80; i++) {
            const y = hor + f * P.R() ** 1.5, k = (y - hor) / f;
            P.soft(P.rr(0, W), y, P.rr(60, 300) * u * (0.3 + k), P.rr(8, 36) * u * (0.2 + k), P.pick([[0.99, 0.95, 0.96], [0.90, 0.93, 1], [0.98, 0.98, 1], [0.93, 0.92, 0.99]]), 0.4);
        }
        const half = P.cam.half(1);
        for (let i = 0; i < 240; i++) { const z = 1 / P.rr(0.12, 1.1), x = P.rr(-1.05, 1.05) * half * z, rx = P.rr(2, 9) * sc(z); P.hump(sx(x, z), sy(z), rx, rx * P.rr(0.16, 0.3), P.rr(0.12, 0.42)); }
        // The road along the valley: packed by runners, a low bank each side.
        if (L.road) {
            const z = L.road.z, s = sc(z), y = sy(z);
            P.set({ cls: CLS.GROUND, m: MAT.SNOW, size: 6, ang: 0.02 });
            for (let px = -20; px < W + 20; px += 1.6 * s) P.fill(P.vary([0.89, 0.88, 0.96], 0.02, 0.01), g => ell(g, px + P.rr(-0.4, 0.4) * s, y + P.rr(-0.25, 0.25) * s, P.rr(1.6, 2.6) * s, P.rr(0.5, 0.8) * s));
            const g = P.alb; g.save(); g.strokeStyle = 'rgba(176,180,214,0.7)'; g.lineWidth = Math.max(0.8, 0.12 * s);
            for (const dy of [-0.3, 0.25]) { g.beginPath(); for (let px = -20; px <= W + 20; px += 30) g.lineTo(px, y + dy * s + 0.12 * s * Math.sin(px / (40 * s))); g.stroke(); }
            g.restore();
            for (let px = 0; px < W; px += 5 * s) { P.hump(px, y - 1.3 * s, 3.4 * s, 0.5 * s, 0.25); P.hump(px, y + 1.3 * s, 3.4 * s, 0.5 * s, 0.25); }
        }
        // The run-out, groomed: corduroy across the meadow to the finish.
        const T = L.track;
        P.set({ cls: CLS.GROUND, m: MAT.SNOW, size: 5, ang: 0.02 });
        for (let i = Math.max(0, T.faceEnd); i < T.pts.length; i++) {
            const p = T.pts[i], s = sc(p.z);
            P.fill(P.vary([0.975, 0.975, 1], 0.012), g => ell(g, p.x, p.y, 8.2 * s, 1.3 * s));
            if (i % 3 === 0) { P.hump(p.x - 8.8 * s, p.y, 2.4 * s, 0.5 * s, 0.3); P.hump(p.x + 8.8 * s, p.y, 2.4 * s, 0.5 * s, 0.3); }
        }
        const g = P.alb; g.save(); g.strokeStyle = 'rgba(200,206,236,0.6)';
        for (let i = Math.max(0, T.faceEnd); i < T.pts.length - 1; i += 1) { const p = T.pts[i], q = T.pts[i + 1], s = sc(p.z); g.lineWidth = Math.max(0.5, 0.06 * s); for (let k = -4; k <= 4; k++) { g.beginPath(); g.moveTo(p.x + k * 1.7 * s, p.y); g.lineTo(q.x + k * 1.7 * s, q.y); g.stroke(); } }
        g.restore();
        // Trodden snow from the finish to the inn's door.
        if (L.inn) {
            const a = L.finish, b = L.door, n = 26;
            P.set({ cls: CLS.GROUND, m: MAT.SNOW, size: 6, ang: null });
            for (let i = 0; i <= n; i++) { const t = i / n, x = lerp(a.x, b.x, t), z = lerp(a.z, b.z, t) + Math.sin(t * Math.PI) * P.cam.dz(4), s = sc(z); P.fill(P.vary([0.90, 0.89, 0.97], 0.025, 0.012), c => ell(c, sx(x + P.rr(-0.3, 0.3), z), sy(z), P.rr(0.9, 1.5) * s, P.rr(0.14, 0.24) * s)); }
        }
    }

    // ---- Buildings -------------------------------------------------------------------------
    // A building's own coordinates, as Painted Village's are: F(u, v) on the
    // front wall (u metres from its middle, v up), S(u, v) on the side wall
    // that faces the middle of the picture (u metres back from the front).
    function frame(P, t, d) {
        const cam = P.cam, z = t.z, side = t.side ?? (t.x < 0 ? 1 : -1), hw = t.w / 2, xs = t.x + side * hw;
        const B = { t, z, d, side, hw, xs, fy: cam.sy(z), s: cam.sc(z), zmid: z + d / 2 / cam.zm };
        B.F = (a, v) => cam.pt(t.x + a, v, z);
        B.S = (a, v) => cam.pt(xs, v, z + a / cam.zm);
        B.front = () => P.set({ cls: CLS.UP, foot: B.fy, haze: 0 });
        B.sideW = () => P.set({ cls: side > 0 ? CLS.SIDER : CLS.SIDEL, foot: cam.sy(B.zmid), haze: 0 });
        return B;
    }
    const quad = (m, a0, v0, a1, v1) => [m(a0, v0), m(a1, v0), m(a1, v1), m(a0, v1)];
    function snowBand(P, pts, th, icicles) {
        P.set({ cls: CLS.TOP, m: MAT.ROOF, size: 3, ang: 0 });
        for (let i = 0; i < pts.length - 1; i++) {
            const [ax, ay] = pts[i], [bx, by] = pts[i + 1], n = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay) / (th * 0.9)));
            for (let k = 0; k <= n; k++) { const q = k / n; P.fill(P.vary([0.95, 0.955, 1], 0.025), g => ell(g, ax + (bx - ax) * q, ay + (by - ay) * q - th * 0.15, th * P.rr(0.9, 1.3), th * P.rr(0.5, 0.72))); }
            if (icicles) {
                P.set({ cls: CLS.UP, m: MAT.ICE, size: 2 });
                for (let k = 0; k < n * 2; k++) { const q = P.R(), x = ax + (bx - ax) * q, y = ay + (by - ay) * q + th * 0.35, len = th * P.rr(0.6, 2.4); P.fill([0.80, 0.86, 1], g => poly(g, [[x - th * 0.1, y], [x + th * 0.1, y], [x, y + len]])); }
                P.set({ cls: CLS.TOP, m: MAT.ROOF, size: 3, ang: 0 });
            }
        }
    }
    // A window in wall m: centre (c, v), w × h metres; grp lights it; o.shutter colour; o.candle; o.box (a flower box under it).
    function win(P, B, m, c, v, w, h, grp, o = {}) {
        const isFront = m === B.F, sl = Math.abs(m(c, v)[1] - m(c, v + 1)[1]), size = fine(P, sl * 0.04, 1.2, 3);
        const wall = () => (isFront ? B.front() : B.sideW());
        const a0 = c - w / 2, a1 = c + w / 2, v0 = v - h / 2, v1 = v + h / 2;
        wall(); P.set({ m: MAT.WOOD, size, ang: Math.PI / 2 });
        if (o.shutter && isFront) for (const sg of [-1, 1]) {
            P.fill(P.vary(o.shutter, 0.06), g => poly(g, quad(m, c + sg * (w / 2 + 0.06), v0 - 0.05, c + sg * (w / 2 + 0.5), v1 + 0.05)));
            // A heart cut in it, as they are here.
            const p = m(c + sg * (w / 2 + 0.28), v1 - 0.32); P.fill([0.15, 0.1, 0.08], g => ell(g, p[0], p[1], 0.07 * sl, 0.07 * sl));
            P.fill(P.vary(o.shutter, 0.06, 0.02), g => { for (let k = 0.2; k < h; k += 0.32) { const q = m(c + sg * (w / 2 + 0.06), v0 + k), r = m(c + sg * (w / 2 + 0.5), v0 + k); g.moveTo(q[0], q[1]); g.lineTo(r[0], r[1]); g.lineTo(r[0], r[1] - 0.04 * sl); g.lineTo(q[0], q[1] - 0.04 * sl); g.closePath(); } });
        }
        P.fill(o.trim || [0.86, 0.80, 0.70], g => poly(g, quad(m, a0 - 0.1, v0 - 0.1, a1 + 0.1, v1 + 0.1)));
        const glass = quad(m, a0, v0, a1, v1), ctr = m(c, v - h * 0.05);
        if (!grp) { P.set({ m: MAT.GLASS, size }); P.fill([0.14, 0.15, 0.25], g => poly(g, glass)); }
        else {
            P.set({ cls: CLS.SELF, m: MAT.GLASS, size, ang: Math.PI / 2, haze: 0 });
            const gr = P.alb.createRadialGradient(ctr[0], ctr[1], 0, ctr[0], ctr[1], Math.max(w, h) * sl * 0.75);
            gr.addColorStop(0, '#ffeeaa'); gr.addColorStop(0.45, '#ffc452'); gr.addColorStop(1, '#e07a22');
            P.fill(gr, g => poly(g, glass));
            if (sl > 7) P.fill('rgba(200,70,40,0.6)', g => { for (const [a, b] of [[a0, a0 + w * 0.3], [a1, a1 - w * 0.3]]) { const p0 = m(a, v1), p1 = m(b, v1), p2 = m(a, v0 + h * 0.3), q = m(a + (b - a) * 0.55, v0 + h * 0.55); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.quadraticCurveTo(q[0], q[1], p2[0], p2[1]); g.closePath(); } });
            P.glowPoly(grp, 'rgba(255,196,96,0.95)', glass);
            if (o.candle) { const p = m(c, v0 + 0.22); P.bulb(p[0], p[1] - 0.06 * sl, Math.max(0.9 * P.cam.u, 0.07 * sl), B.fy, 'candle'); }
        }
        wall(); P.set({ m: MAT.WOOD, size });
        P.fill([0.22, 0.15, 0.11], g => { const a = m(c - 0.04, v0), b = m(c + 0.04, v1); g.rect(Math.min(a[0], b[0]), b[1], Math.max(0.6, Math.abs(b[0] - a[0])), a[1] - b[1]); const p = m(a0, v), q = m(a1, v + 0.06); g.rect(p[0], q[1], q[0] - p[0], Math.max(0.6, p[1] - q[1])); });
        if (o.box) { P.fill([0.42, 0.24, 0.16], g => poly(g, quad(m, a0 - 0.15, v0 - 0.45, a1 + 0.15, v0 - 0.12))); const p = m(c, v0 - 0.1); snowBand(P, [m(a0 - 0.2, v0 - 0.08), m(a1 + 0.2, v0 - 0.08)], 0.16 * sl); void p; }
        else snowBand(P, [m(a0 - 0.12, v0 - 0.1), m(a1 + 0.12, v0 - 0.1)], 0.1 * sl);
        if (grp) P.light(grp, isFront ? { x: B.t.x + c, y: v, z: B.z, c: WINDOW, I: 1.6 * w * h, face: [0, -1], out: 0.4 } : { x: B.xs, y: v, z: B.z + c / P.cam.zm, c: WINDOW, I: 1.2 * w * h, face: [B.side, 0], out: 0.4 });
    }
    // Horizontal boards on a wall, rows that vary.
    function boards(P, m, colour, a0, a1, v0, v1, size, dv = 0.36) {
        P.set({ m: MAT.WALL, size, ang: 0 });
        for (let v = v0; v < v1 - 0.01; v += dv) { const top = Math.min(v1, v + dv); P.fill(P.vary(colour, 0.06, 0.01), g => poly(g, quad(m, a0, v, a1, top + 0.02))); }
    }
    // A balcony across wall m at height v: boards, carved balusters, snow along the rail.
    function balcony(P, B, m, a0, a1, v, size) {
        const sl = Math.abs(m(0, v)[1] - m(0, v + 1)[1]);
        B.front(); P.set({ m: MAT.WOOD, size, ang: 0 });
        P.fill(TIMBER, g => poly(g, quad(m, a0, v - 0.25, a1, v + 0.05)));
        P.set({ ang: Math.PI / 2 });
        for (let a = a0 + 0.1; a < a1; a += 0.32) P.fill(Math.round(a / 0.32) % 2 ? [0.52, 0.36, 0.22] : [0.40, 0.26, 0.17], g => { const p = quad(m, a, v + 0.05, a + 0.2, v + 1.0); poly(g, p); });
        P.set({ ang: 0 }); P.fill(TIMBER, g => poly(g, quad(m, a0, v + 1.0, a1, v + 1.14)));
        snowBand(P, [m(a0, v + 1.16), m(a1, v + 1.16)], 0.16 * sl);
        snowBand(P, [m(a0, v + 0.06), m(a1, v + 0.06)], 0.1 * sl);
    }

    // The inn at the foot of the run: a stone ground floor, two of timber
    // above with balconies across, a broad gable deep under snow, the big
    // window of the parlour, the door under its lantern, its name on a board.
    function inn(P, t, config, groups) {
        const B = frame(P, t, 14), F = B.F, S = B.S, s = B.s, hw = B.hw, size = fine(P, s * 0.09, 2, 6);
        const g0 = groups.inn0 = P.group('inn0', { kind: 'inn', floor: 0 }), g1 = groups.inn1 = P.group('inn1', { kind: 'inn', floor: 1, upstairs: true }), g2 = groups.inn2 = P.group('inn2', { kind: 'inn', floor: 2, upstairs: true });
        const E = 8.2, R = 11.6, xmas = config.candlesOn;
        const body = () => {
            // The side wall, running back.
            B.sideW(); P.set({ m: MAT.WALL, size, ang: 0 });
            P.fill(PLASTER, g => poly(g, quad(S, 0, 0, B.d, 3.2)));
            boards(P, S, TIMBER, 0, B.d, 3.2, E, size);
            // The front: stone, then timber, then the gable.
            B.front(); P.set({ m: MAT.WALL, size, ang: 0 });
            P.fill(PLASTER, g => poly(g, quad(F, -hw, 0, hw, 3.2)));
            P.set({ m: MAT.STONE, size: size * 0.8 }); for (const a of [-hw, hw - 0.7]) for (let v = 0; v < 3.1; v += 0.55) P.fill(P.vary([0.62, 0.60, 0.58], 0.1), g => poly(g, quad(F, a + (Math.round(v / 0.55) % 2 ? 0 : 0.15), v, a + 0.7, v + 0.5)));
            boards(P, F, TIMBER, -hw, hw, 3.2, E, size);
            boards(P, F, TIMBER2, -hw, hw, E, E + 0.1, size);
            P.set({ m: MAT.WALL, size, ang: 0 });
            P.fill(P.vary(TIMBER2, 0.04), g => poly(g, [F(-hw, E), F(hw, E), F(0, R)]));
            for (let v = E + 0.4; v < R - 0.4; v += 0.5) { const k = (R - v) / (R - E); P.fill(P.vary(TIMBER, 0.07), g => poly(g, quad(F, -hw * k, v, hw * k, v + 0.46))); }
        };
        P.solid(t.z, B.F(0, 0)[0], B.fy, body, { shadow: 1 });
        // Windows: the ground floor's, with the parlour's big one; two floors above, and one up in the gable.
        const shutter = [0.22, 0.38, 0.26];
        win(P, B, F, -hw + 2.4, 1.7, 1.2, 1.4, g0, { shutter, candle: xmas });
        // The parlour's window: wide, warm, the cat's place.
        const pw = Math.min(5.2, hw * 0.75);
        win(P, B, F, -hw * 0.18, 1.75, pw, 1.6, g0, { candle: xmas });
        P.spots.parlour = { a: F(-hw * 0.18 - pw / 2, 0.95), b: F(-hw * 0.18 + pw / 2, 2.55), sill: F(-hw * 0.18 + pw * 0.25, 0.95), s };
        // The door, under a lantern; the board with the inn's name over it.
        const dc = hw * 0.62;
        B.front(); P.set({ m: MAT.WOOD, size: fine(P, s * 0.06, 1.6, 4), ang: Math.PI / 2 });
        P.fill([0.84, 0.80, 0.72], g => poly(g, quad(F, dc - 0.85, 0, dc + 0.85, 2.45)));
        P.fill([0.36, 0.18, 0.12], g => { const a = F(dc - 0.7, 0), b = F(dc + 0.7, 2.1), top = F(dc, 2.45); g.moveTo(a[0], a[1]); g.lineTo(a[0], b[1]); g.quadraticCurveTo(a[0], top[1], top[0], top[1]); g.quadraticCurveTo(b[0], top[1], b[0], b[1]); g.lineTo(b[0], a[1]); g.closePath(); });
        if (config.wreaths !== false) { P.set({ m: MAT.FIR, size: 1.6 }); const p = F(dc, 1.6); P.line([0.14, 0.32, 0.18], 0.1 * s, g => g.arc(p[0], p[1], 0.3 * s, 0, TAU)); P.set({ m: MAT.FIG }); P.fill([0.8, 0.12, 0.1], g => ell(g, p[0], p[1] + 0.28 * s, 0.1 * s, 0.07 * s)); }
        const lp = F(dc, 2.85);
        lantern(P, g0, lp[0], lp[1], s * 1.1, { x: t.x + dc, y: 2.85, z: t.z - P.cam.dz(0.4) }, 8);
        const board = [F(-hw * 0.7, 3.25), F(hw * 0.25, 3.25)], bh = 0.7 * s;
        B.front(); P.set({ m: MAT.WOOD, size: 1.6, ang: 0 });
        P.fill([0.22, 0.13, 0.09], g => g.rect(board[0][0], board[0][1] - bh, board[1][0] - board[0][0], bh * 0.92));
        P.fill([0.80, 0.62, 0.30], g => { g.rect(board[0][0] + 0.06 * s, board[0][1] - bh + 0.06 * s, board[1][0] - board[0][0] - 0.12 * s, 0.05 * s); g.rect(board[0][0] + 0.06 * s, board[0][1] - 0.17 * s, board[1][0] - board[0][0] - 0.12 * s, 0.05 * s); });
        const name = String(config.innName ?? '').trim().slice(0, 28).toUpperCase();
        if (name) P.letter([0.98, 0.86, 0.52], name, (board[0][0] + board[1][0]) / 2, board[0][1] - bh * 0.48, Math.min(bh * 0.5, (board[1][0] - board[0][0]) * 1.7 / Math.max(6, name.length)), { foot: B.fy });
        // The floors above: windows with shutters and flower boxes, a balcony across each.
        for (const [grp, v, n] of [[g1, 4.6, 4], [g2, 6.9, 4]]) {
            for (let k = 0; k < n; k++) win(P, B, F, -hw + (k + 0.5) * (2 * hw / n), v, 1.05, 1.25, grp, { shutter: [0.62, 0.16, 0.14], box: true, candle: xmas });
            balcony(P, B, F, -hw + 0.2, hw - 0.2, v - 1.1, size);
            for (let k = 0; k < 3; k++) win(P, B, S, 2.2 + k * 3.8, v, 0.9, 1.1, grp, {});
        }
        win(P, B, S, 3, 1.7, 0.9, 1.1, g0, {}); win(P, B, S, 8.5, 1.7, 0.9, 1.1, g0, {});
        win(P, B, F, 0, E + 1.4, 0.9, 0.9, g2, {});
        // The roof: broad, low, deep under snow, the eaves far out, icicles all along.
        const o = 1.6, Fr = (a, v) => P.cam.pt(t.x + a, v, t.z - o / P.cam.zm);
        P.set({ cls: CLS.UP, foot: B.fy, m: MAT.WOOD, size: 2, ang: 0 });
        P.fill([0.18, 0.12, 0.10], g => poly(g, [Fr(-hw - o, E - 0.4), Fr(0, R + 0.2), Fr(hw + o, E - 0.4), Fr(hw + o, E - 0.85), Fr(0, R - 0.35), Fr(-hw - o, E - 0.85)]));
        const ridge = [P.cam.pt(t.x, R + 0.2, t.z - o / P.cam.zm), P.cam.pt(t.x, R + 0.2, t.z + (B.d + o) / P.cam.zm)];
        const eave = [P.cam.pt(B.xs + B.side * o, E - 0.4, t.z - o / P.cam.zm), P.cam.pt(B.xs + B.side * o, E - 0.4, t.z + (B.d + o) / P.cam.zm)];
        P.set({ cls: B.side > 0 ? CLS.TOPR : CLS.TOPL, foot: P.cam.sy(B.zmid), m: MAT.ROOF, size: 3, ang: 0.2 });
        P.fill(P.vary([0.93, 0.94, 1], 0.02), g => poly(g, [ridge[0], ridge[1], eave[1], eave[0]]));
        P.set({ cls: CLS.TOP, foot: B.fy, m: MAT.ROOF, size: 3, ang: 0.4 });
        P.fill([0.95, 0.955, 1], g => poly(g, [Fr(-hw - o - 0.2, E - 0.2), Fr(0, R + 0.9), Fr(hw + o + 0.2, E - 0.2), Fr(hw + o, E - 0.45), Fr(0, R + 0.25), Fr(-hw - o, E - 0.45)]));
        snowBand(P, [Fr(-hw - o, E - 0.55), Fr(0, R + 0.1)], 0.3 * s, true); snowBand(P, [Fr(0, R + 0.1), Fr(hw + o, E - 0.55)], 0.3 * s, true);
        snowBand(P, [eave[0], eave[1]], 0.26 * s, true);
        // A chimney with smoke, stone, up through the snow.
        const ch = P.cam.pt(t.x - hw * 0.35, R - 1.1, t.z + 4 / P.cam.zm), cs = s * 0.95;
        P.set({ cls: CLS.UP, m: MAT.STONE, size: 2, ang: Math.PI / 2 }); P.fill([0.50, 0.47, 0.48], g => g.rect(ch[0] - 0.55 * cs, ch[1] - 2.2 * cs, 1.1 * cs, 2.4 * cs));
        P.set({ cls: CLS.TOP, m: MAT.ROOF, size: 2 }); P.fill(SNOW, g => ell(g, ch[0], ch[1] - 2.25 * cs, 0.7 * cs, 0.24 * cs));
        P.smoke(ch[0], ch[1] - 2.5 * cs, s * 1.0, t.z);
        // Drifts against the walls, a bench under the window, skis stood against the wall.
        P.set({ cls: CLS.TOP, m: MAT.ROOF, size: 3 }); P.fill(SNOW, g => { for (let a = -hw; a <= hw; a += 1.6) { const p = F(a, 0.05); ell(g, p[0], p[1], 1.0 * s, 0.32 * s); } });
        P.set({ cls: CLS.UP, m: MAT.WOOD, size: 1.6, ang: Math.PI / 2 });
        for (let k = 0; k < 4; k++) { const a = hw - 0.6 - k * 0.34, p = F(a, 0), q = F(a + 0.12, 1.9); P.fill(P.pick([[0.8, 0.16, 0.12], [0.2, 0.34, 0.6], [0.9, 0.72, 0.2], [0.24, 0.24, 0.26]]), g => g.rect(p[0], q[1], Math.max(0.8, q[0] - p[0]), p[1] - q[1])); }
        P.hit('inn', F(-hw, 0)[0], Fr(0, R + 1)[1], F(hw, 0)[0], B.fy, { groups: [g0, g1, g2], name: 'inn' });
        P.spots.inn = { x: t.x, z: t.z, door: F(dc, 0), s, hw };
    }

    // A chalet of the valley: stone below, timber above, the gable to us, a balcony.
    function chalet(P, c, config) {
        const t = { ...c, side: c.x < 0 ? 1 : -1 }, B = frame(P, t, 10), F = B.F, S = B.S, s = B.s, hw = B.hw, size = fine(P, s * 0.09, 1.8, 5);
        const E = 5.4, R = 8.2, g0 = P.group('chalet' + c.i + '.0', { kind: 'window' }), g1 = P.group('chalet' + c.i + '.1', { kind: 'window', upstairs: true });
        const body = () => {
            B.sideW(); P.set({ m: MAT.WALL, size, ang: 0 }); P.fill(PLASTER, g => poly(g, quad(S, 0, 0, B.d, 2.6))); boards(P, S, TIMBER, 0, B.d, 2.6, E, size, 0.45);
            B.front(); P.set({ m: MAT.WALL, size, ang: 0 }); P.fill(P.vary(PLASTER, 0.03), g => poly(g, quad(F, -hw, 0, hw, 2.6)));
            boards(P, F, c.i % 2 ? TIMBER2 : TIMBER, -hw, hw, 2.6, E, size, 0.45);
            P.set({ m: MAT.WALL, size, ang: 0 }); P.fill(P.vary(TIMBER2, 0.05), g => poly(g, [F(-hw, E), F(hw, E), F(0, R)]));
        };
        P.solid(c.z, F(0, 0)[0], B.fy, body, { shadow: 1 });
        const xmas = config.candlesOn;
        for (const a of [-hw * 0.45, hw * 0.45]) { win(P, B, F, a, 1.4, 0.9, 1.0, g0, { shutter: c.i % 2 ? [0.2, 0.34, 0.24] : [0.6, 0.18, 0.14], candle: xmas }); win(P, B, F, a, 3.9, 0.9, 1.0, g1, { shutter: c.i % 2 ? [0.2, 0.34, 0.24] : [0.6, 0.18, 0.14], box: true, candle: xmas }); }
        balcony(P, B, F, -hw + 0.2, hw - 0.2, 2.85, size);
        win(P, B, F, 0, E + 1.1, 0.6, 0.7, g1, {});
        win(P, B, S, B.d * 0.5, 1.4, 0.8, 0.9, g0, {});
        const o = 1.1, Fr = (a, v) => P.cam.pt(t.x + a, v, t.z - o / P.cam.zm);
        P.set({ cls: CLS.UP, foot: B.fy, m: MAT.WOOD, size: 1.6, ang: 0 }); P.fill([0.18, 0.12, 0.10], g => poly(g, [Fr(-hw - o, E - 0.3), Fr(0, R + 0.2), Fr(hw + o, E - 0.3), Fr(hw + o, E - 0.7), Fr(0, R - 0.3), Fr(-hw - o, E - 0.7)]));
        const ridge = [P.cam.pt(t.x, R + 0.2, t.z - o / P.cam.zm), P.cam.pt(t.x, R + 0.2, t.z + (B.d + o) / P.cam.zm)], eave = [P.cam.pt(B.xs + B.side * o, E - 0.3, t.z - o / P.cam.zm), P.cam.pt(B.xs + B.side * o, E - 0.3, t.z + (B.d + o) / P.cam.zm)];
        P.set({ cls: B.side > 0 ? CLS.TOPR : CLS.TOPL, foot: P.cam.sy(B.zmid), m: MAT.ROOF, size: 2.6, ang: 0.2 }); P.fill(P.vary([0.93, 0.94, 1], 0.02), g => poly(g, [ridge[0], ridge[1], eave[1], eave[0]]));
        P.set({ cls: CLS.TOP, foot: B.fy, m: MAT.ROOF, size: 2.6 }); P.fill([0.95, 0.955, 1], g => poly(g, [Fr(-hw - o - 0.2, E - 0.1), Fr(0, R + 0.8), Fr(hw + o + 0.2, E - 0.1), Fr(hw + o, E - 0.35), Fr(0, R + 0.2), Fr(-hw - o, E - 0.35)]));
        snowBand(P, [Fr(-hw - o, E - 0.45), Fr(0, R + 0.1), Fr(hw + o, E - 0.45)], 0.26 * s, true);
        const ch = P.cam.pt(t.x + hw * 0.3, R - 0.9, t.z + 3 / P.cam.zm);
        P.set({ cls: CLS.UP, m: MAT.STONE, size: 1.6, ang: Math.PI / 2 }); P.fill([0.5, 0.47, 0.48], g => g.rect(ch[0] - 0.4 * s, ch[1] - 1.6 * s, 0.8 * s, 1.8 * s));
        P.smoke(ch[0], ch[1] - 1.8 * s, s * 0.8, c.z);
        P.set({ cls: CLS.TOP, m: MAT.ROOF, size: 2 }); P.fill(SNOW, g => { for (let a = -hw; a <= hw; a += 1.4) { const p = F(a, 0.05); ell(g, p[0], p[1], 0.9 * s, 0.28 * s); } });
        P.hit('chalet', F(-hw, 0)[0], Fr(0, R + 1)[1], F(hw, 0)[0], B.fy, { groups: [g0, g1], name: 'chalet' + c.i });
    }

    // The chapel on its rise: white walls, a steep roof, a tower with an onion dome and a clock.
    function chapel(P, c, config, groups) {
        const t = { ...c, w: 7, side: -1 }, B = frame(P, t, 11), F = B.F, S = B.S, s = B.s, hw = B.hw, size = fine(P, s * 0.09, 1.6, 4);
        const grp = groups.chapel = P.group('chapel', { kind: 'chapel' }), E = 6.2, R = 10.6, tx = -hw - 1.9, tw = 1.7;
        const body = () => {
            B.sideW(); P.set({ m: MAT.WALL, size, ang: 0 }); P.fill([0.86, 0.85, 0.84], g => poly(g, quad(S, 0, 0, B.d, E)));
            B.front(); P.set({ m: MAT.WALL, size, ang: 0 }); P.fill([0.95, 0.94, 0.9], g => poly(g, [F(-hw, 0), F(hw, 0), F(hw, E), F(0, R), F(-hw, E)]));
            // The tower beside it.
            P.fill([0.95, 0.94, 0.9], g => poly(g, quad(F, tx - tw, 0, tx + tw, 13)));
            P.set({ m: MAT.ROOF, size: 2 }); P.fill([0.34, 0.42, 0.40], g => { const a = F(tx - tw - 0.2, 13), b = F(tx + tw + 0.2, 13), mid = F(tx, 15.4), tip = F(tx, 17.2); g.moveTo(a[0], a[1]); g.bezierCurveTo(a[0] - 0.6 * s, mid[1], mid[0] - 0.4 * s, mid[1] - 0.6 * s, tip[0], tip[1]); g.bezierCurveTo(mid[0] + 0.4 * s, mid[1] - 0.6 * s, b[0] + 0.6 * s, mid[1], b[0], b[1]); g.closePath(); });
            P.set({ m: MAT.WOOD, size: 1.4, ang: Math.PI / 2 }); P.fill([0.2, 0.18, 0.18], g => { const a = F(tx, 17.2), b = F(tx, 18.6), c1 = F(tx - 0.4, 18.1), c2 = F(tx + 0.4, 18.1); g.rect(a[0] - 0.04 * s, b[1], 0.08 * s, a[1] - b[1]); g.rect(c1[0], c1[1] - 0.04 * s, c2[0] - c1[0], 0.08 * s); });
        };
        P.solid(c.z, F(0, 0)[0], B.fy, body, { shadow: 1 });
        // Arched windows lit gold, the door, the clock on the tower, snow on everything.
        for (const a of [-hw * 0.5, hw * 0.5]) win(P, B, F, a, 3.2, 0.9, 1.8, grp, { trim: [0.92, 0.9, 0.86], candle: config.candlesOn });
        win(P, B, S, 3, 3.2, 0.9, 1.8, grp, { trim: [0.88, 0.86, 0.84] }); win(P, B, S, 7.5, 3.2, 0.9, 1.8, grp, { trim: [0.88, 0.86, 0.84] });
        B.front(); P.set({ m: MAT.WOOD, size: 1.4, ang: Math.PI / 2 }); P.fill([0.42, 0.22, 0.14], g => poly(g, quad(F, -0.7, 0, 0.7, 2.2)));
        const cp = F(tx, 10.8), cr = 0.75 * s;
        P.set({ cls: CLS.UP, m: MAT.FIG, size: 1.4 }); P.fill([0.96, 0.95, 0.9], g => ell(g, cp[0], cp[1], cr, cr)); P.line([0.2, 0.18, 0.18], Math.max(0.6, 0.06 * s), g => g.arc(cp[0], cp[1], cr, 0, TAU));
        P.spots.clock = { x: cp[0], y: cp[1], r: cr };
        win(P, B, F, tx, 12, 0.7, 1.0, null, {});
        const o = 0.5, Fr = (a, v) => P.cam.pt(t.x + a, v, t.z - o / P.cam.zm);
        P.set({ cls: CLS.TOP, foot: B.fy, m: MAT.ROOF, size: 2.4, ang: 0.6 });
        P.fill([0.95, 0.955, 1], g => poly(g, [Fr(-hw - o, E - 0.1), Fr(0, R + 0.5), Fr(hw + o, E - 0.1), Fr(hw + o, E - 0.4), Fr(0, R), Fr(-hw - o, E - 0.4)]));
        const ridge = [P.cam.pt(t.x, R + 0.3, t.z), P.cam.pt(t.x, R + 0.3, t.z + B.d / P.cam.zm)], eave = [P.cam.pt(B.xs - o, E - 0.2, t.z), P.cam.pt(B.xs - o, E - 0.2, t.z + B.d / P.cam.zm)];
        P.set({ cls: CLS.TOPL, foot: P.cam.sy(B.zmid), m: MAT.ROOF, size: 2.4, ang: 0.3 }); P.fill(P.vary([0.93, 0.94, 1], 0.02), g => poly(g, [ridge[0], ridge[1], eave[1], eave[0]]));
        snowBand(P, [F(tx - tw - 0.2, 13.1), F(tx + tw + 0.2, 13.1)], 0.24 * s, false);
        snowBand(P, [Fr(-hw - o, E - 0.3), Fr(0, R + 0.2), Fr(hw + o, E - 0.3)], 0.22 * s, true);
        // A lantern by the door; the light inside of an evening (and late on the holy nights).
        const lp = F(0.95, 2.4); lantern(P, grp, lp[0], lp[1], s * 1.0, { x: t.x + 0.95, y: 2.4, z: t.z - P.cam.dz(0.3) }, 6);
        P.hit('chapel', F(tx - tw, 0)[0], F(tx, 18)[1], F(hw, 0)[0], B.fy, { groups: [grp], name: 'chapel' });
    }

    // The snowcat's shed at the foot of the run, a lamp over its door.
    function garage(P, gr, groups) {
        const t = { x: gr.x, z: gr.z, w: 8, side: gr.x < 0 ? 1 : -1 }, B = frame(P, t, 9), F = B.F, S = B.S, s = B.s, hw = B.hw, size = fine(P, s * 0.09, 1.6, 4);
        const grp = groups.garage = P.group('garage', { kind: 'porch' });
        const body = () => {
            B.sideW(); P.set({ m: MAT.WALL, size, ang: 0 }); boards(P, S, TIMBER2, 0, B.d, 0, 4.2, size, 0.5);
            B.front(); boards(P, F, TIMBER2, -hw, hw, 0, 4.2, size, 0.5);
            P.set({ m: MAT.WOOD, size }); P.fill([0.22, 0.16, 0.12], g => poly(g, quad(F, -hw + 1, 0, hw - 1, 3.4)));
        };
        P.solid(gr.z, F(0, 0)[0], B.fy, body, { shadow: 1 });
        snowBand(P, [F(-hw - 0.4, 4.3), F(hw + 0.4, 4.3)], 0.5 * s, true);
        const lp = F(0, 3.8); lantern(P, grp, lp[0], lp[1], s * 1.0, { x: t.x, y: 3.8, z: t.z - P.cam.dz(0.4) }, 7);
        P.spots.garage = { x: gr.x, z: gr.z - P.cam.dz(1.5), door: F(0, 0) };
    }

    // A lamp on a post, and its pool of light.
    function lamp(P, at, i) {
        const { sx, sy, sc } = P.cam, fx = sx(at.x, at.z), fy = sy(at.z), s = sc(at.z) * 1.4;
        const grp = P.group('lamp' + i, { kind: 'lamp', x: at.x, z: at.z });
        P.solid(at.z, fx, fy, () => { P.set({ cls: CLS.UP, foot: fy, m: MAT.WOOD, size: 2, ang: Math.PI / 2, haze: 0 }); P.fill([0.12, 0.1, 0.1], g => { g.rect(fx - 0.07 * s, fy - 2.8 * s, 0.14 * s, 2.8 * s); g.rect(fx - 0.14 * s, fy - 0.4 * s, 0.28 * s, 0.4 * s); }); });
        lantern(P, grp, fx, fy - 3.0 * s, s * 1.3, { x: at.x, y: 4.2, z: at.z }, 20);
        P.hump(fx, fy, 0.7 * s, 0.16 * s, 0.4);
        P.hit('lamp', fx - 0.6 * s, fy - 3.6 * s, fx + 0.6 * s, fy, { group: grp });
    }

    // A split-rail fence across the near meadow, snow along its rails.
    function fence(P, f) {
        const { cam } = P, [x0, z0] = f.from, [x1, z1] = f.to, n = Math.max(3, Math.round(Math.hypot(x1 - x0, (z1 - z0) * cam.zm) / 3.2));
        const at = t => { const x = lerp(x0, x1, t), z = lerp(z0, z1, t); return { x, z, px: cam.sx(x, z), py: cam.sy(z), s: cam.sc(z) }; };
        for (let i = 0; i <= n; i++) {
            const a = at(i / n), b = i < n ? at((i + 1) / n) : null, wob = P.rr(-0.06, 0.06);
            P.solid(a.z, a.px, a.py, () => {
                P.set({ cls: CLS.UP, foot: a.py, m: MAT.WOOD, size: fine(P, a.s * 0.08, 1.6, 4), ang: Math.PI / 2, haze: 0 });
                P.fill(P.vary([0.30, 0.22, 0.16], 0.12), g => poly(g, [[a.px - 0.09 * a.s, a.py], [a.px + 0.09 * a.s, a.py], [a.px + (0.08 + wob) * a.s, a.py - 1.25 * a.s], [a.px + (-0.08 + wob) * a.s, a.py - 1.25 * a.s]]));
                if (b) { P.set({ ang: Math.atan2(b.py - a.py, b.px - a.px) }); for (const v of [0.55, 1.0]) P.fill(P.vary([0.36, 0.27, 0.19], 0.12), g => poly(g, [[a.px, a.py - v * a.s], [b.px, b.py - v * b.s], [b.px, b.py - (v + 0.1) * b.s], [a.px, a.py - (v + 0.1) * a.s]])); }
            }, { shadow: 0.6 });
            P.set({ cls: CLS.TOP, m: MAT.ROOF, size: 2, ang: 0 });
            P.fill(SNOW, g => ell(g, a.px + wob * a.s, a.py - 1.28 * a.s, 0.14 * a.s, 0.07 * a.s));
            if (b) for (const v of [0.55, 1.0]) P.line(SNOW, Math.max(0.8, 0.06 * a.s), g => { g.moveTo(a.px, a.py - (v + 0.13) * a.s); g.lineTo(b.px, b.py - (v + 0.13) * b.s); });
            P.hump(a.px, a.py, 1.2 * a.s, 0.3 * a.s, 0.35);
        }
        P.spots.fence = [];
        for (let i = 0; i <= n; i++) { const a = at(i / n); P.spots.fence.push([a.x, a.z]); }
    }
    // ---- Everything, far to near ------------------------------------------------------------

    function compose(P, L, config) {
        const { cam } = P, { u } = cam, groups = {};
        P.sky(cam.hor + 12);
        ground(P, L);
        peaks(P, L);
        mountain(P, L);
        summit(P, L, groups);
        liftLine(P, L, groups);
        // The runs come out of the woods: the torch run's way across the meadow, and the red's to the lift's station.
        const T = L.track, xAt = y => { const P = T.pts; let i = Math.max(1, T.faceEnd - 1); while (i < P.length - 1 && P[i].y < y) i++; return P[i].x; }, foot = T.pts[Math.max(0, T.faceEnd)];
        woods(P, L, [{ x: foot.x, y: L.mountain.footY, rx: RUNOUT * cam.sc(TorchLogic.Z_FOOT) * 1.1, ry: 40 * u, xAt }, ...(L.lift ? [{ x: L.lift.x0 + 10 * u, y: L.lift.y0, rx: 18 * u, ry: 40 * u, xAt: () => L.lift.x0 + 10 * u }] : [])]);
        // What stands in the valley, far to near.
        if (L.chapel) P.add(L.chapel.z, () => chapel(P, L.chapel, config, groups));
        for (const c of L.chalets) P.add(c.z, () => chalet(P, c, config));
        if (config.snowcat !== false) P.add(L.garage.z, () => garage(P, L.garage, groups));
        for (const f of L.firs) P.add(f.z, () => fir(P, f.x, f.z, f.h, { shadow: 1 }));
        if (L.tree) P.add(L.tree.z, () => { fir(P, L.tree.x, L.tree.z, L.tree.h, { lights: config.treeLights !== false ? Math.round(L.tree.h * 11) : 0, set: 'tree', star: config.treeLights !== false, snow: 0.45 }); P.spots.tree = { x: cam.sx(L.tree.x, L.tree.z), y: cam.sy(L.tree.z), s: cam.sc(L.tree.z), h: L.tree.h }; });
        L.lamps.forEach((at, i) => P.add(at.z, () => lamp(P, at, i)));
        if (L.inn) P.add(L.inn.z, () => inn(P, L.inn, config, groups));
        if (L.fence) P.add(Math.max(L.fence.from[1], L.fence.to[1]), () => fence(P, L.fence));
        for (const b of L.bushes || []) P.add(b.z, () => fir(P, b.x, b.z, P.rr(2.2, 3.6), { shadow: 0.6, snow: 0.8 }));
        for (const f of L.near) P.add(f.z, () => fir(P, f.x, f.z, f.h, { shadow: 1, lights: config.nearLights ? Math.round(f.h * 8) : 0, set: 'trees' }));
        P.run();
        P.spots.groups = groups;
    }

    return { compose, frame, win };
})();
