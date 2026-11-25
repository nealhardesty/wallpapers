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

    // ---- The far peaks ------------------------------------------------------------
    // A range across the whole width behind the mountain. The faces that look
    // left are frost to the plates, so they take the low light whatever way
    // they face: the alpenglow at dusk, the moon at night.
    function peaks(P, L) {
        const { W, hor, u } = P.cam, foot = farFoot(P.cam, 16), base = hor + 6 * u;
        const h = x => { const t = x / W; return hor * (0.36 * Math.exp(-(((t - 0.06) / 0.09) ** 2)) + 0.62 * Math.exp(-(((t - 0.8) / 0.075) ** 2)) + 0.44 * Math.exp(-(((t - 0.66) / 0.06) ** 2)) + 0.5 * Math.exp(-(((t - 0.95) / 0.07) ** 2)) + 0.3 * Math.exp(-(((t - 0.22) / 0.08) ** 2)) + 0.18) + (9 * Math.sin(t * 37) + 5 * Math.sin(t * 91 + 1)) * u; };
        const ridge = [];
        for (let x = -30 * u; x <= W + 30 * u; x += 11 * u) ridge.push([x, hor - h(x) + P.rr(-4, 4) * u]);
        P.set({ cls: CLS.UP, foot, haze: 0, m: MAT.SNOW, size: 6, ang: 1.1 });
        P.fill([0.86, 0.88, 0.98], g => poly(g, [[-30 * u, base], ...ridge, [W + 30 * u, base]]));
        for (let i = 0; i < ridge.length - 1; i++) {
            const [x0, y0] = ridge[i], [x1, y1] = ridge[i + 1], left = y1 < y0, lean = (left ? 1 : -1) * P.rr(14, 50) * u, drop = P.rr(0.35, 0.8);
            P.set({ cls: left ? CLS.SIDEL : CLS.SIDER, m: left ? MAT.FROST : MAT.SNOW, size: 6, ang: left ? 1.05 : 2.1 });
            P.fill(P.vary(left ? [0.97, 0.96, 1] : [0.74, 0.78, 0.94], 0.03), g => poly(g, [[x0, y0], [x1 + 1, y1], [x1 + lean, y1 + (base - y1) * drop], [x0 + lean, y0 + (base - y0) * drop]]));
        }
        // Rock where it is too steep to hold snow.
        P.set({ cls: CLS.UP, m: MAT.STONE, size: 4, ang: 1.25 });
        for (let i = 1; i < ridge.length - 1; i += 2) {
            const [x, y] = ridge[i], d = base - y;
            if (d < 50 * u) continue;
            for (let n = 0; n < 2; n++) { const px = x + P.rr(-8, 20) * u, py = y + d * P.rr(0.06, 0.4), tri = [[px, py], [px + P.rr(10, 30) * u, py + d * P.rr(0.12, 0.3)], [px + P.rr(2, 8) * u, py + d * P.rr(0.16, 0.36)]]; P.fill(P.vary([0.42, 0.42, 0.56], 0.12), g => poly(g, tri)); }
        }
    }

    // ---- The mountain -------------------------------------------------------------
    // Its outline, its faces, rock bands near the top, firs thick on the lower
    // slopes and thinning out, and the piste and the lift's line cut through them.
    function mountain(P, L) {
        const { cam } = P, { W, u } = cam, M = L.mountain, T = L.track;
        const top = M.top, foot = M.footY + 10 * u, x0 = M.cx - M.half * 1.5, x1 = M.cx + M.half * 1.45;
        const hazeOf = y => farFoot(cam, lerp(7.5, 12, clamp((M.footY - y) / (M.footY - top))));
        const outline = [];
        for (let i = 0; i <= 40; i++) {
            const t = i / 40, x = lerp(x0, x1, t), k = (x - M.cx) / (x < M.cx ? M.cx - x0 : x1 - M.cx);
            const shoulder = Math.exp(-(((t - 0.72) / 0.1) ** 2)) * 0.16 + Math.exp(-(((t - 0.26) / 0.12) ** 2)) * 0.1;
            const y = lerp(top, foot, clamp(Math.abs(k) ** 1.35 - shoulder * (1 - Math.abs(k)))) + (i > 0 && i < 40 ? P.rr(-3, 3) * u : 0);
            outline.push([x, y]);
        }
        // The face, in long facets down its gullies: some catch the sun, some are in their own shade.
        P.set({ cls: CLS.UP, foot: hazeOf(lerp(top, foot, 0.5)), haze: 0, m: MAT.SNOW, size: 5, ang: 1.4 });
        P.fill([0.93, 0.94, 1], g => poly(g, [[x0, foot], ...outline, [x1, foot]]));
        for (let i = 0; i < outline.length - 1; i++) {
            const [ax, ay] = outline[i], [bx, by] = outline[i + 1], left = by < ay, steep = (foot - Math.min(ay, by)) / (foot - top);
            const lean = (left ? 1 : -1) * P.rr(10, 40) * u, drop = P.rr(0.3, 0.7), high = steep > 0.55;
            P.set({ cls: left ? CLS.SIDEL : CLS.SIDER, foot: hazeOf(Math.min(ay, by)), m: left && high ? MAT.FROST : MAT.SNOW, size: 5, ang: left ? 1.15 : 2.0 });
            P.fill(P.vary(left ? [0.97, 0.96, 1] : [0.80, 0.83, 0.96], 0.025), g => poly(g, [[ax, ay], [bx + 1, by], [bx + lean, by + (foot - by) * drop], [ax + lean, ay + (foot - ay) * drop]]));
        }
        // Rock showing through under the summit: streaks down the fall line, snow lying between.
        P.set({ cls: CLS.SIDER, m: MAT.STONE, size: 2.6, ang: 1.45 });
        for (let i = 0; i < 70; i++) {
            const y = lerp(top + 10 * u, lerp(top, foot, 0.36), P.R() ** 1.3), hw = widthAt(outline, y) * 0.85, x = M.cx + P.rr(-hw, hw), len = P.rr(8, 26) * u, w = P.rr(1.2, 3.2) * u, lean = P.rr(-0.25, 0.25) * len;
            if (nearPiste(T, x, y, 10 * u) || hw <= 0) continue;
            P.set({ foot: hazeOf(y) }); P.fill(P.vary([0.46, 0.45, 0.56], 0.14), g => poly(g, [[x - w, y], [x + w, y], [x + lean + w * 0.4, y + len], [x + lean - w * 0.4, y + len]]));
        }
        // The piste: groomed snow down the switchbacks, a little whiter than the rest; corduroy where it is near.
        const faceEnd = T.faceEnd > 0 ? T.faceEnd : T.pts.length;
        P.set({ cls: CLS.TOP, m: MAT.SNOW, size: 3, ang: 0 });
        for (let i = 0; i < faceEnd; i += 2) {
            const p = T.pts[i], w = 9 * cam.sc(p.z);
            P.set({ foot: hazeOf(p.y) }); P.fill(P.vary([0.985, 0.985, 1], 0.012), g => ell(g, p.x, p.y, w * 1.1, w * 0.55));
        }
        // Firs: thick on the lower slopes, thinning toward the rock, none on the piste or under the lift.
        const lift = L.lift;
        for (let i = 0; i < 2600; i++) {
            const t = P.R() ** 0.7, y = lerp(top + (foot - top) * 0.32, foot, t), hw = widthAt(outline, y);
            if (hw <= 0) continue;
            const x = M.cx + P.rr(-hw, hw) * 0.98, z = M.faceZ(y), r = clamp(5.5 * cam.sc(z), 1.6 * u, 6 * u);
            if (P.R() > 0.25 + 0.75 * t) continue;
            if (nearPiste(T, x, y, 8 * cam.sc(z) + r)) continue;
            if (lift && Math.abs(x - lerp(lift.x0, lift.x1, (y - lift.y0) / (lift.y1 - lift.y0))) < r * 1.6 && y < lift.y0 && y > lift.y1) continue;
            const snowy = P.R() < 0.4;
            P.set({ cls: CLS.UP, foot: hazeOf(y), m: MAT.FIR, size: 2.2, ang: Math.PI / 2, haze: 0 });
            P.fill(P.vary(snowy ? [0.36, 0.44, 0.52] : [0.15, 0.24, 0.27], 0.18), g => poly(g, [[x - r * 0.55, y + r * 0.6], [x, y - r * 1.9], [x + r * 0.55, y + r * 0.6]]));
            if (snowy) { P.set({ cls: CLS.TOP, m: MAT.ROOF }); P.fill([0.88, 0.9, 0.99], g => poly(g, [[x - r * 0.22, y - r * 0.8], [x, y - r * 1.9], [x + r * 0.22, y - r * 0.8]])); }
        }
        L.outline = outline;
        P.spots.slope = [x0, top, x1, foot];
    }
    function widthAt(outline, y) {
        let xl = null, xr = null;
        for (let i = 0; i < outline.length - 1; i++) {
            const [ax, ay] = outline[i], [bx, by] = outline[i + 1];
            if ((ay - y) * (by - y) <= 0 && ay !== by) { const x = ax + (bx - ax) * (y - ay) / (by - ay); if (xl === null || x < xl) xl = x; if (xr === null || x > xr) xr = x; }
        }
        return xl === null ? 0 : (xr - xl) / 2;
    }
    function nearPiste(T, x, y, d) {
        const end = T.faceEnd > 0 ? T.faceEnd : T.pts.length;
        for (let i = 0; i < end; i += 3) { const p = T.pts[i]; if (Math.abs(p.x - x) < d && Math.abs(p.y - y) < d * 0.7) return true; }
        return false;
    }

    // The hut at the top, where the torches are lit, and the lift's top station beside it.
    function summit(P, L, groups) {
        const { cam } = P, u = cam.u, h = L.hut, s = cam.sc(L.mountain.faceZ(h.y)) * 1.4, foot = farFoot(cam, 11);
        const grp = groups.hut = P.group('hut', { kind: 'hut', far: true });
        P.set({ cls: CLS.UP, foot, m: MAT.WOOD, size: 1.6, ang: 0, haze: 0 });
        P.fill(TIMBER, g => g.rect(h.x - 4 * s, h.y - 3 * s, 8 * s, 3 * s));
        P.set({ cls: CLS.TOP, m: MAT.ROOF, size: 1.6 }); P.fill(SNOW, g => poly(g, [[h.x - 5 * s, h.y - 2.8 * s], [h.x, h.y - 5.6 * s], [h.x + 5 * s, h.y - 2.8 * s]]));
        P.set({ cls: CLS.SELF, m: MAT.GLASS, size: 1.4 });
        for (const dx of [-2, 1.2]) { P.fill('#ffd27a', g => g.rect(h.x + dx * s, h.y - 2.2 * s, 1.1 * s, 1 * s)); P.glowRect(grp, 'rgba(255,200,110,0.95)', h.x + dx * s, h.y - 2.2 * s, 1.1 * s, 1 * s); }
        P.halo(grp, h.x, h.y - 1.7 * s, 4 * s);
        // The lift's top station: a wheel house on posts.
        const l = L.lift;
        if (l) {
            P.set({ cls: CLS.UP, m: MAT.WOOD, size: 1.4, ang: Math.PI / 2 });
            P.fill([0.22, 0.22, 0.26], g => { g.rect(l.x1 - 2.2 * s, l.y1 - 2 * s, 4.4 * s, 2.4 * s); g.rect(l.x1 - 0.3 * s, l.y1 - 2 * s, 0.6 * s, 2 * s); });
            P.set({ cls: CLS.TOP, m: MAT.ROOF }); P.fill(SNOW, g => g.rect(l.x1 - 2.4 * s, l.y1 - 2.5 * s, 4.8 * s, 0.6 * s));
        }
        P.hit('hut', h.x - 6 * s, h.y - 6 * s, h.x + 6 * s, h.y + 1 * s, { group: grp });
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
            for (const c of holes) { P.set({ cls: CLS.GROUND, m: MAT.SNOW, size: 4, ang: 0, foot: cam.H }); P.fill([0.94, 0.95, 1], g => ell(g, c.x, y0 + r, c.rx * (1 + 0.15 * i), 9 * u + r)); set(); }
            for (let x = -10 * u + P.rr(0, r); x < W + 10 * u; x += r * P.rr(0.5, 1.0)) {
                const y = y0 + wave(x) + P.rr(-0.3, 0.5) * r, h = r * P.rr(1.8, 2.7), snowy = P.R() < 0.38;
                if (holes.some(c => Math.abs(x - c.x) < c.rx * (0.9 + 0.15 * i))) continue;
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
            P.fill(P.vary([0.975, 0.975, 1], 0.012), g => ell(g, p.x, p.y, 5.5 * s, 1.1 * s));
            if (i % 3 === 0) { P.hump(p.x - 6 * s, p.y, 2.4 * s, 0.5 * s, 0.3); P.hump(p.x + 6 * s, p.y, 2.4 * s, 0.5 * s, 0.3); }
        }
        const g = P.alb; g.save(); g.strokeStyle = 'rgba(200,206,236,0.6)';
        for (let i = Math.max(0, T.faceEnd); i < T.pts.length - 1; i += 1) { const p = T.pts[i], q = T.pts[i + 1], s = sc(p.z); g.lineWidth = Math.max(0.5, 0.06 * s); for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(p.x + k * 1.6 * s, p.y); g.lineTo(q.x + k * 1.6 * s, q.y); g.stroke(); } }
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
        const foot = L.track.pts[Math.max(0, L.track.faceEnd)];
        woods(P, L, [{ x: foot.x, y: L.mountain.footY, rx: 34 * u, ry: 12 * u }, ...(L.lift ? [{ x: L.lift.x0, y: L.lift.y0, rx: 26 * u, ry: 10 * u }] : [])]);
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
