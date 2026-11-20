// Painted Village's buildings, as underpainting: New England in clapboard.
// The general store with its porch, a colonial, a cape, a saltbox, the
// inn, the white meetinghouse and its steeple, the covered bridge, and the
// small houses up the hill behind. Each is a box in the world, seen in true
// perspective: a front square on to us and the side that faces the middle
// of the picture running back. Every floor of windows is its own group of
// lights (painted-plates.js), so a house can go to bed a floor at a time.

const PaintedBuildings = (() => {
    const { clamp, CLS } = PaintedLogic;
    const { MAT, TAU, poly, ell } = PaintedPlates;
    const { fine, SNOW, WINDOW, lantern } = PaintedArt;

    const SCHEMES = [
        { wall: [0.90, 0.82, 0.60], trim: [0.95, 0.94, 0.90], shutter: [0.16, 0.28, 0.22], door: [0.56, 0.14, 0.12] },     // cream
        { wall: [0.58, 0.18, 0.16], trim: [0.94, 0.93, 0.90], shutter: [0.14, 0.14, 0.16], door: [0.16, 0.26, 0.20] },     // barn red
        { wall: [0.42, 0.50, 0.60], trim: [0.94, 0.94, 0.92], shutter: [0.20, 0.24, 0.32], door: [0.62, 0.50, 0.20] },     // slate blue
        { wall: [0.92, 0.92, 0.90], trim: [0.97, 0.97, 0.95], shutter: [0.12, 0.13, 0.15], door: [0.14, 0.24, 0.18] },     // white
        { wall: [0.56, 0.62, 0.50], trim: [0.94, 0.94, 0.90], shutter: [0.24, 0.20, 0.18], door: [0.50, 0.16, 0.14] },     // sage
        { wall: [0.64, 0.62, 0.62], trim: [0.95, 0.95, 0.93], shutter: [0.34, 0.14, 0.14], door: [0.20, 0.22, 0.36] },     // grey
    ];
    const STYLES = {
        colonial: { e: 5.6, r: 8.7, d: 8, floors: 2, bays: 5, shutters: true },
        cape: { e: 3.3, r: 6.9, d: 8, floors: 1, bays: 5, dormers: 2, shutters: true },
        saltbox: { e: 5.4, r: 8.4, d: 9.5, floors: 2, bays: 3 },
        inn: { e: 6.0, r: 9.2, d: 9, floors: 2, bays: 7, shutters: true, porch: true },
    };
    const BRICK = [0.50, 0.24, 0.20], STONE = [0.46, 0.43, 0.44], DARK = [0.10, 0.10, 0.13];

    // A building's own coordinates: F(u, v) on the front wall (u metres from
    // its middle, v up), S(u, v) on the side wall (u metres back from the
    // front), and what stands in each of them.
    function frame(P, t, d, haze = 0) {
        const cam = P.cam, z = t.z, side = t.side || 1, hw = t.w / 2, xs = t.x + side * hw;
        const B = { t, z, d, side, hw, xs, haze, fy: cam.sy(z), s: cam.sc(z), zb: z + d / cam.zm, zmid: z + d / 2 / cam.zm };
        B.at = (x, v, depth) => cam.pt(x, v, depth);
        B.F = (u, v) => B.at(t.x + u, v, z);
        B.S = (u, v) => B.at(xs, v, z + u / cam.zm);
        B.front = () => P.set({ cls: CLS.UP, foot: B.fy, haze });
        B.sideW = () => P.set({ cls: side > 0 ? CLS.SIDER : CLS.SIDEL, foot: cam.sy(B.zmid), haze });
        B.fx = cam.sx(t.x, z);
        return B;
    }
    const quad = (m, u0, v0, u1, v1) => [m(u0, v0), m(u1, v0), m(u1, v1), m(u0, v1)];
    const lerp2 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];

    // Clapboards on a wall: rows that vary a little. `span(v)` is [u0, u1] at height v.
    function boards(P, m, colour, v0, v1, span, size, dv = 0.3) {
        P.set({ m: MAT.WALL, size, ang: 0 });
        for (let v = v0; v < v1 - 0.01; v += dv) {
            const top = Math.min(v1, v + dv), a = span(v), b = span(top);
            P.fill(P.vary(colour, 0.035, 0.008), g => poly(g, [m(a[0], v), m(a[1], v), m(b[1], top + 0.02), m(b[0], top + 0.02)]));
        }
    }

    // A thick lip of snow along a line of points, humped on top, icicles under it.
    function snowBand(P, pts, th, o = {}) {
        const set = () => P.set({ cls: o.cls ?? CLS.TOP, m: MAT.ROOF, size: o.size || 4.5, ang: o.ang ?? 0 });
        set();
        for (let i = 0; i < pts.length - 1; i++) {
            const [ax, ay] = pts[i], [bx, by] = pts[i + 1], n = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay) / (th * 0.9)));
            for (let k = 0; k <= n; k++) { const q = k / n; P.fill(P.vary([0.95, 0.955, 1], 0.025), g => ell(g, ax + (bx - ax) * q, ay + (by - ay) * q - th * 0.15, th * P.rr(0.9, 1.3), th * P.rr(0.5, 0.72))); }
            if (o.icicles) {
                P.set({ cls: CLS.UP, m: MAT.ICE, size: 2 });
                for (let k = 0; k < n * 2; k++) { const q = P.R(), x = ax + (bx - ax) * q, y = ay + (by - ay) * q + th * 0.35, len = th * P.rr(0.6, 2.2); P.fill([0.80, 0.86, 1], g => poly(g, [[x - th * 0.1, y], [x + th * 0.1, y], [x, y + len]])); }
                set();
            }
        }
    }

    // A window in wall `m` (B.F or B.S): centre (c, v), w × h metres.
    //   o.grp: the group it lights with (none: a dark pane); o.cols, o.rows;
    //   o.shutter: a colour; o.wreath; o.candle; o.tree; o.cat; o.arch; o.gain
    function win(P, B, m, c, v, w, h, o = {}) {
        const isFront = m === B.F, sl = Math.abs(m(c, v)[1] - m(c, v + 1)[1]), trim = o.trim || [0.95, 0.94, 0.90];
        const size = fine(P, sl * 0.035, 1.4, 3), wall = () => (isFront ? B.front() : B.sideW());
        const u0 = c - w / 2, u1 = c + w / 2, v0 = v - h / 2, v1 = v + h / 2;
        wall(); P.set({ m: MAT.WOOD, size, ang: Math.PI / 2 });
        if (o.shutter && isFront) for (const sgn of [-1, 1]) P.fill(P.vary(o.shutter, 0.08), g => poly(g, quad(m, c + sgn * (w / 2 + 0.1), v0 - 0.04, c + sgn * (w / 2 + 0.52), v1 + 0.04)));
        P.fill(trim, g => poly(g, quad(m, u0 - 0.1, v0 - 0.1, u1 + 0.1, v1 + (o.arch ? 0 : 0.12))));
        if (o.arch) P.fill(trim, g => { const a = m(u0 - 0.1, v1), b = m(u1 + 0.1, v1), top = m(c, v1 + w * 0.62); g.moveTo(a[0], a[1]); g.quadraticCurveTo(a[0], top[1], top[0], top[1]); g.quadraticCurveTo(b[0], top[1], b[0], b[1]); g.closePath(); });
        const glass = quad(m, u0, v0, u1, v1), ctr = m(c, v - h * 0.05);
        const arch = g => { if (!o.arch) return; const a = m(u0, v1), b = m(u1, v1), top = m(c, v1 + w * 0.5); g.moveTo(a[0], a[1]); g.quadraticCurveTo(a[0], top[1], top[0], top[1]); g.quadraticCurveTo(b[0], top[1], b[0], b[1]); g.closePath(); };
        if (!o.grp) {
            P.set({ m: MAT.GLASS, size }); P.fill([0.15, 0.17, 0.28], g => { poly(g, glass); arch(g); });
        } else {
            P.set({ cls: CLS.SELF, m: MAT.GLASS, size, ang: Math.PI / 2, haze: B.haze * 0.4 });
            const gr = P.alb.createRadialGradient(ctr[0], ctr[1], 0, ctr[0], ctr[1], Math.max(w, h) * sl * 0.75);
            gr.addColorStop(0, '#ffeeaa'); gr.addColorStop(0.45, '#ffc452'); gr.addColorStop(1, '#e87a22');
            P.fill(gr, g => { poly(g, glass); arch(g); });
            if (o.curtains !== false && sl > 9) P.fill('rgba(214,96,38,0.75)', g => {
                for (const [a, b] of [[u0, u0 + w * 0.34], [u1, u1 - w * 0.34]]) { const p0 = m(a, v1), p1 = m(b, v1), p2 = m(a, v0 + h * 0.28), q = m(a + (b - a) * 0.55, v0 + h * 0.5); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.quadraticCurveTo(q[0], q[1], p2[0], p2[1]); g.closePath(); }
            });
            if (o.tree) {
                P.fill('rgba(38,78,40,0.92)', g => poly(g, [m(c - w * 0.16, v0), m(c, v0 + h * 0.84), m(c + w * 0.16, v0)]));
                for (let i = 0; i < 7; i++) { const p = m(c + P.rr(-0.08, 0.08) * w, v0 + P.rr(0.06, 0.6) * h); P.bulb(p[0], p[1], Math.max(0.9 * P.cam.u, 0.03 * sl), B.fy, 'string'); }
            }
            if (o.cat) P.fill('rgba(30,22,26,0.94)', g => {                 // somebody on the sill, watching the snow
                const k = 0.3, bx = c + w * 0.2, p = (du, dv) => m(bx + du * k, v0 + dv * k);
                const at = (du, dv) => { const q = p(du, dv); return q; };
                let q = at(-0.9, 0); g.moveTo(q[0], q[1]);
                for (const [du, dv] of [[-0.9, 0.9], [-0.5, 1.5], [-0.3, 2.3], [-0.5, 2.9], [-0.25, 2.65], [0.15, 2.65], [0.4, 2.9], [0.3, 2.2], [0.6, 1.4], [0.9, 0.8], [0.9, 0]]) { q = at(du, dv); g.lineTo(q[0], q[1]); }
                g.closePath();
            });
            P.glowPoly(o.grp, 'rgba(255,190,90,0.95)', glass);
            const out = isFront ? { x: B.t.x + c, z: B.z, face: [0, -1] } : { x: B.xs + B.side * 0.5, z: B.z + c / P.cam.zm, face: [B.side, 0], out: 0 };
            P.light(o.grp, { ...out, y: v, c: WINDOW, I: 5.5 * w * h * (o.gain || 1), r2: 0.5 });
        }
        // Glazing bars.
        wall(); P.set({ m: MAT.WOOD, size });
        const cols = o.cols || 2, rows = o.rows || 2, bar = Math.max(1, 0.035 * sl);
        for (let i = 1; i < cols; i++) P.line(trim, bar, g => { const a = m(u0 + w * i / cols, v0), b = m(u0 + w * i / cols, v1); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); });
        for (let i = 1; i < rows; i++) P.line(trim, i === rows / 2 ? bar * 1.6 : bar, g => { const a = m(u0, v0 + h * i / rows), b = m(u1, v0 + h * i / rows); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); });
        // Snow on the sill and the head.
        P.set({ cls: CLS.TOP, m: MAT.ROOF, size: size + 0.5, ang: 0, haze: B.haze });
        P.line(SNOW, 0.13 * sl, g => { const a = m(u0 - 0.12, v0 - 0.04), b = m(u1 + 0.12, v0 - 0.04); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); });
        if (!o.arch) P.line(SNOW, 0.08 * sl, g => { const a = m(u0 - 0.06, v1 + 0.16), b = m(u1 + 0.06, v1 + 0.16); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); });
        if (o.wreath && isFront) wreath(P, B, m(c, v + h * 0.08), 0.24 * sl);
        if (o.candle && o.grp) { const p = m(c, v0 + 0.2); P.bulb(p[0], p[1], Math.max(0.9 * P.cam.u, 0.035 * sl), B.fy, 'candle'); }
    }

    function wreath(P, B, at, r) {
        B.front(); P.set({ m: MAT.FIR, size: 2, ang: null });
        P.line([0.12, 0.30, 0.18], r * 0.5, g => g.arc(at[0], at[1], r, 0, TAU));
        P.set({ m: MAT.FIG }); P.fill([0.80, 0.12, 0.10], g => ell(g, at[0], at[1] + r, r * 0.42, r * 0.28));
    }

    // A chimney on the ridge, u from the middle of the front; brick, capped with snow, smoking.
    function chimney(P, B, u, r, w = 1.1, h = 1.5) {
        const zc = B.zmid - 0.5 / P.cam.zm, zc2 = B.zmid + 0.5 / P.cam.zm, x = B.t.x + u, sd = B.side;
        const f = (du, v) => B.at(x + du, v, zc), top = r + h;
        P.set({ cls: sd > 0 ? CLS.SIDER : CLS.SIDEL, foot: B.fy, m: MAT.STONE, size: 2.4, ang: null, haze: B.haze });
        P.fill(P.vary(BRICK, 0.06).map(c => c * 0.9), g => poly(g, [f(sd * w / 2, r - 0.5), B.at(x + sd * w / 2, r - 0.5, zc2), B.at(x + sd * w / 2, top, zc2), f(sd * w / 2, top)]));
        P.set({ cls: CLS.UP });
        P.fill(BRICK, g => poly(g, [f(-w / 2, r - 0.5), f(w / 2, r - 0.5), f(w / 2, top), f(-w / 2, top)]));
        for (let v = r - 0.4; v < top; v += 0.24) for (let du = -w / 2 + P.rr(0, 0.2); du < w / 2 - 0.1; du += 0.36) P.fill(P.vary(BRICK, 0.16), g => poly(g, [f(du, v), f(Math.min(w / 2, du + 0.3), v), f(Math.min(w / 2, du + 0.3), v + 0.17), f(du, v + 0.17)]));
        const a = f(-w / 2 - 0.08, top), b = f(w / 2 + 0.08, top);
        snowBand(P, [a, b], Math.abs(b[0] - a[0]) * 0.16, { size: 3 });
        const p = f(0, top + 0.2); P.smoke(p[0], p[1], B.s * (1 - B.haze * 0.4), B.z);
    }

    // Drifts against a wall, and a hump for the light to catch.
    function drift(P, B, m, u0, u1, skip) {
        for (let u = u0; u < u1; u += P.rr(0.5, 1.1)) {
            const r = P.rr(0.5, 1.1), p = m(u, 0.05), sl = Math.abs(m(u, 0)[1] - m(u, 1)[1]);
            if (skip && Math.abs(u - skip[0]) < skip[1]) continue;
            P.set({ cls: CLS.GROUND, m: MAT.SNOW, size: 6, ang: null, foot: p[1], haze: B.haze });
            P.fill(P.vary([0.96, 0.965, 1], 0.02), g => ell(g, p[0], p[1], r * sl, r * 0.36 * sl));
            P.hump(p[0], p[1], r * 1.3 * sl, r * 0.4 * sl, 0.4);
        }
    }

    function shrub(P, B, u, k = 1) {
        const p = B.F(u, 0.42 * k), s = B.s * k;
        B.front(); P.set({ m: MAT.FIR, size: 3, ang: null }); P.fill(P.vary([0.12, 0.24, 0.18], 0.2), g => ell(g, p[0], p[1], 0.7 * s, 0.46 * s));
        P.set({ cls: CLS.TOP, m: MAT.ROOF, size: 3.5 }); P.fill(SNOW, g => ell(g, p[0] - 0.05 * s, p[1] - 0.24 * s, 0.66 * s, 0.3 * s));
    }

    // Bulbs along a line, sagging a little between the nails.
    function string(P, a, b, foot, r) {
        const n = Math.max(3, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / (r * 5.5)));
        for (let i = 0; i <= n; i++) { const k = i / n; P.bulb(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k + r * (1.6 + 1.4 * Math.abs(Math.sin(k * n * 0.8))), r, foot, 'string'); }
    }

    // ---- Houses -----------------------------------------------------------------

    function house(P, t, config) {
        const st = STYLES[t.style] || STYLES.colonial, col = SCHEMES[t.tint % SCHEMES.length], B = frame(P, t, st.d), { hw, side, s, fy } = B, { e, r, d } = st;
        const name = `${t.style}${Math.round(t.x)}`, decor = P.R() < (P.share ?? 1), candles = config.candles !== false && P.R() < 0.6, catAt = P.R() < 0.5 ? Math.floor(P.rr(0, st.bays)) : -1;
        const grp = { down: P.group(name + '.down', { kind: 'window', house: name }), up: P.group(name + '.up', { kind: 'window', house: name, upstairs: true }), porch: P.group(name + '.porch', { kind: 'porch', house: name }) };
        const size = fine(P, s * 0.09, 2.5, 5), door = (st.bays - 1) / 2, bay = i => -hw + (i + 0.5) * (t.w / st.bays);
        const wo = { trim: col.trim, shutter: st.shutters ? col.shutter : null, cols: 2, rows: 4 };
        const body = () => {
            // The side: a gable end.
            B.sideW();
            const dim = col.wall.map(c => c * 0.93);
            boards(P, B.S, dim, 0, r - 0.1, v => v <= e ? [0, d] : [d / 2 * (v - e) / (r - e), d - d / 2 * (v - e) / (r - e)], size);
            for (const u of [d * 0.27, d * 0.73]) { win(P, B, B.S, u, 1.75, 0.95, 1.5, { ...wo, grp: grp.down }); if (st.floors > 1) win(P, B, B.S, u, 4.3, 0.95, 1.4, { ...wo, grp: grp.up }); }
            if (r - e > 2.4) win(P, B, B.S, d / 2, e + (st.floors > 1 ? 0.9 : 1.3), 0.8, 1.0, { ...wo, grp: st.floors > 1 ? null : grp.up, rows: 2 });
            // The front.
            B.front();
            boards(P, B.F, col.wall, 0, e, () => [-hw, hw], size);
            P.set({ m: MAT.STONE, size: 2.6, ang: null }); P.fill(STONE, g => poly(g, quad(B.F, -hw, 0, hw, 0.32)));
            P.set({ m: MAT.WOOD, size: 2.4, ang: Math.PI / 2 });
            for (const u of [-hw, hw]) P.fill(col.trim, g => poly(g, quad(B.F, u - 0.09, 0.3, u + 0.09, e)));
            for (let i = 0; i < st.bays; i++) {
                if (i !== door) win(P, B, B.F, bay(i), 1.8, 1.0, 1.55, { ...wo, grp: grp.down, wreath: decor, candle: candles, tree: i === door + 1, cat: i === catAt });
                if (st.floors > 1) win(P, B, B.F, bay(i), 4.35, 1.0, 1.45, { ...wo, grp: grp.up, wreath: decor && i === door, candle: candles });
            }
            // The door: a surround, a light over it, a wreath, two steps.
            const du = bay(door);
            B.front(); P.set({ m: MAT.WOOD, size: 2.2, ang: Math.PI / 2 });
            P.fill(col.trim, g => { poly(g, quad(B.F, du - 0.82, 0.3, du + 0.82, 2.75)); poly(g, [B.F(du - 0.98, 2.72), B.F(du + 0.98, 2.72), B.F(du, 3.3)]); });
            P.fill(col.door, g => poly(g, quad(B.F, du - 0.52, 0.34, du + 0.52, 2.3)));
            P.fill(col.door.map(c => c * 0.72), g => { for (const [a, b, c2, d2] of [[-0.4, 0.5, -0.06, 1.2], [0.06, 0.5, 0.4, 1.2], [-0.4, 1.36, -0.06, 2.16], [0.06, 1.36, 0.4, 2.16]]) poly(g, quad(B.F, du + a, b, du + c2, d2)); });
            P.set({ cls: CLS.SELF, m: MAT.GLASS, size: 2 }); P.fill('#ffd98a', g => poly(g, quad(B.F, du - 0.5, 2.38, du + 0.5, 2.64)));
            P.glowPoly(grp.down, 'rgba(255,196,100,0.9)', quad(B.F, du - 0.5, 2.38, du + 0.5, 2.64));
            wreath(P, B, B.F(du, 1.62), 0.25 * s);
            B.front(); P.set({ m: MAT.STONE, size: 2.4, ang: 0 }); P.fill([0.56, 0.54, 0.56], g => { poly(g, quad(B.F, du - 0.95, 0, du + 0.95, 0.34)); });
            P.set({ cls: CLS.TOP, m: MAT.ROOF, size: 2.6 }); P.fill([0.90, 0.90, 0.97], g => { const a = B.at(t.x + du - 1.0, 0.34, B.z), b = B.at(t.x + du + 1.0, 0.34, B.z), c2 = B.at(t.x + du + 1.0, 0.17, B.z - 0.7 / P.cam.zm), d2 = B.at(t.x + du - 1.0, 0.17, B.z - 0.7 / P.cam.zm); poly(g, [a, b, c2, d2]); });
            const lp = B.F(du + 1.12, 2.05);
            lantern(P, grp.porch, lp[0], lp[1], s * 0.9, { x: t.x + du + 1.12, y: 2.05, z: B.z }, 7);
            // The inn's porch: a roof on posts across the front, and its sign.
            if (st.porch) porch(P, B, col, { depth: 2.2, v: 3.25, steps: du, grp: grp.porch });
            // The roof: the slope toward us, deep in snow, and its far edge down the gable.
            const zo = B.z - 0.35 / P.cam.zm, ov = 0.32;
            P.set({ cls: CLS.TOP, foot: fy, m: MAT.ROOF, size: fine(P, s * 0.16, 4, 9), ang: Math.PI / 2 + 0.1 * side, haze: 0 });
            const e0 = B.at(t.x - hw - ov, e - 0.12, zo), e1 = B.at(t.x + hw + ov, e - 0.12, zo), r1 = B.at(t.x + hw + ov, r, B.zmid), r0 = B.at(t.x - hw - ov, r, B.zmid);
            P.fill([0.93, 0.94, 1], g => poly(g, [e0, e1, r1, r0]));
            P.set({ m: MAT.STONE, size: 3 });
            for (let i = 0; i < 4; i++) { const k = P.rr(0.08, 0.92), q = P.rr(0.1, 0.5), a = lerp2(lerp2(e0, e1, k), lerp2(r0, r1, k), q); P.fill(P.vary([0.36, 0.32, 0.38], 0.1), g => ell(g, a[0], a[1], P.rr(0.2, 0.6) * s, P.rr(0.05, 0.1) * s)); }
            const back = B.at(B.xs + side * ov, e - 0.12, B.zb + 0.35 / P.cam.zm), ridgeEnd = side > 0 ? r1 : r0, eaveEnd = side > 0 ? e1 : e0;
            snowBand(P, [eaveEnd, ridgeEnd, back], 0.2 * s, { size: 3.5, cls: side > 0 ? CLS.TOPR : CLS.TOPL });
            snowBand(P, [e0, e1], 0.28 * s, { icicles: true });
            snowBand(P, [r0, r1], 0.17 * s, { size: 4 });
            for (let i = 0; i < (st.dormers || 0); i++) dormer(P, B, col, (i ? 1 : -1) * t.w * 0.24, st, grp.up, wo);
            chimney(P, B, st.floors > 1 ? 0 : t.w * 0.05, r, 1.2, 1.5);
            if (decor && config.lights !== false) string(P, B.at(t.x - hw, e - 0.34, zo), B.at(t.x + hw, e - 0.34, zo), fy, Math.max(1.1 * P.cam.u, 0.045 * s));
            drift(P, B, B.F, -hw - 0.4, hw + 0.4, [du, 1.2]); drift(P, B, B.S, 0.4, d);
            for (let i = 0; i < st.bays; i++) if (i !== door && !st.porch) shrub(P, B, bay(i) + P.rr(-0.2, 0.2));
        };
        const top = B.at(t.x, r + 2, B.zmid)[1];
        P.solid(t.z, B.fx, fy, body, { reflect: [B.F(-hw - 0.5, 0)[0], top, B.F(hw + 0.5, 0)[0], fy] });
        const x0 = Math.min(B.F(-hw, 0)[0], B.S(d, 0)[0]), x1 = Math.max(B.F(hw, 0)[0], B.S(d, 0)[0]);
        P.hit('house', x0, top, x1, fy, { groups: [grp.down, grp.up, grp.porch], name });
        (P.spots.houses ||= []).push({ name, x: t.x, z: t.z, door: [t.x + bay(door), t.z], groups: grp, style: t.style });
    }

    function dormer(P, B, col, u, st, grp, wo) {
        const dm = 1.7, v0 = st.e + (st.r - st.e) * dm / (st.d / 2), zd = B.z + dm / P.cam.zm, f = (du, v) => B.at(B.t.x + u + du, v, zd);
        B.front(); P.set({ m: MAT.WALL, size: 3, ang: 0 });
        P.fill(col.wall, g => poly(g, [f(-0.75, v0 - 0.3), f(0.75, v0 - 0.3), f(0.75, v0 + 1.25), f(0, v0 + 1.95), f(-0.75, v0 + 1.25)]));
        const D = { ...B, F: f };
        D.front = B.front; win(P, D, f, 0, v0 + 0.6, 0.8, 1.0, { ...wo, shutter: null, grp, rows: 2, gain: 0.7 });
        snowBand(P, [f(-0.95, v0 + 1.15), f(0, v0 + 2.1), f(0.95, v0 + 1.15)], 0.17 * B.s, { size: 3.2 });
    }

    // A porch across a front: the floor, what is on it, a roof on posts.
    function porch(P, B, col, o) {
        const { t, hw, s, fy } = B, zf = B.z - o.depth / P.cam.zm, f = (u, v) => B.at(t.x + u, v, zf), a = hw + 0.25;
        B.front(); P.set({ cls: CLS.TOP, foot: fy, m: MAT.WOOD, size: 3, ang: 0 });
        P.fill([0.62, 0.60, 0.64], g => poly(g, [B.F(-a, 0.36), B.F(a, 0.36), f(a, 0.36), f(-a, 0.36)]));
        P.set({ cls: CLS.UP, m: MAT.WOOD, size: 2.6 }); P.fill([0.30, 0.26, 0.26], g => poly(g, quad(f, -a, 0, a, 0.36)));
        // Steps, swept.
        P.set({ cls: CLS.TOP, m: MAT.ROOF, size: 2.6 });
        P.fill([0.86, 0.86, 0.94], g => { const zs = zf - 0.75 / P.cam.zm; poly(g, [f(o.steps - 1.1, 0.36), f(o.steps + 1.1, 0.36), B.at(t.x + o.steps + 1.1, 0.1, zs), B.at(t.x + o.steps - 1.1, 0.1, zs)]); });
        if (o.goods) o.goods(f);
        // The roof, seen from a little above.
        P.set({ cls: CLS.TOP, foot: fy, m: MAT.ROOF, size: 5, ang: Math.PI / 2 });
        P.fill([0.93, 0.94, 1], g => poly(g, [B.F(-a - 0.1, o.v + 0.35), B.F(a + 0.1, o.v + 0.35), f(a + 0.2, o.v), f(-a - 0.2, o.v)]));
        P.set({ cls: CLS.UP, m: MAT.WOOD, size: 2.2, ang: 0 }); P.fill(col.trim, g => poly(g, quad(f, -a - 0.2, o.v - 0.26, a + 0.2, o.v)));
        // Posts and a rail.
        const n = Math.max(2, Math.round(B.t.w / 2.6)), posts = [];
        for (let i = 0; i <= n; i++) posts.push(-a + 0.12 + (2 * a - 0.24) * i / n);
        P.set({ ang: Math.PI / 2 });
        for (const u of posts) P.fill(col.trim, g => poly(g, quad(f, u - 0.08, 0.36, u + 0.08, o.v - 0.26)));
        P.set({ ang: 0 });
        for (let i = 0; i < n; i++) {
            const u0 = posts[i], u1 = posts[i + 1];
            if (o.steps > u0 - 0.3 && o.steps < u1 + 0.3) continue;
            P.fill(col.trim, g => { poly(g, quad(f, u0, 1.16, u1, 1.26)); poly(g, quad(f, u0, 0.5, u1, 0.57)); });
            for (let u = u0 + 0.2; u < u1 - 0.1; u += 0.22) P.fill(col.trim, g => poly(g, quad(f, u - 0.025, 0.5, u + 0.025, 1.2)));
            P.set({ cls: CLS.TOP, m: MAT.ROOF, size: 2.2 }); P.line(SNOW, 0.07 * s, g => { const p = f(u0, 1.3), q = f(u1, 1.3); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); }); P.set({ cls: CLS.UP, m: MAT.WOOD, size: 2.2 });
        }
        snowBand(P, [f(-a - 0.25, o.v + 0.04), f(a + 0.25, o.v + 0.04)], 0.2 * s, { icicles: true, size: 3.6 });
        if (P.share == null || P.share > 0.3) string(P, f(-a, o.v - 0.34), f(a, o.v - 0.34), fy, Math.max(1.1 * P.cam.u, 0.045 * s));
        return { f, posts };
    }

    // The general store: its gable to the street, a porch, two big windows.
    function store(P, t, config) {
        const e = 6.4, r = 9.5, d = 12, col = { wall: [0.50, 0.17, 0.15], trim: [0.94, 0.93, 0.89], door: [0.14, 0.26, 0.20] }, B = frame(P, t, d), { hw, side, s, fy } = B;
        const grp = { down: P.group('store.down', { kind: 'window', house: 'store', shop: true }), up: P.group('store.up', { kind: 'window', house: 'store', upstairs: true }), porch: P.group('store.porch', { kind: 'porch', house: 'store' }) };
        const size = fine(P, s * 0.09, 2.5, 5), wo = { trim: col.trim, cols: 2, rows: 4 };
        const body = () => {
            B.sideW();
            boards(P, B.S, col.wall.map(c => c * 0.9), 0, e, () => [0, d], size);
            for (const u of [d * 0.2, d * 0.5, d * 0.8]) { win(P, B, B.S, u, 1.9, 1.0, 1.6, { ...wo, grp: u < d * 0.6 ? grp.down : null }); win(P, B, B.S, u, 4.9, 1.0, 1.45, { ...wo, grp: grp.up }); }
            B.front();
            boards(P, B.F, col.wall, 0, r - 0.05, v => v <= e ? [-hw, hw] : [-hw * (r - v) / (r - e), hw * (r - v) / (r - e)], size);
            P.set({ m: MAT.WOOD, size: 2.4, ang: Math.PI / 2 });
            for (const u of [-hw, hw]) P.fill(col.trim, g => poly(g, quad(B.F, u - 0.1, 0.3, u + 0.1, e)));
            // The shop: two windows full of things, a glazed door between them.
            for (const sgn of [-1, 1]) {
                const c = sgn * (hw * 0.56), gl = quad(B.F, c - 1.55, 0.95, c + 1.55, 2.85);
                B.front(); P.set({ m: MAT.WOOD, size: 2.2 }); P.fill(col.trim, g => poly(g, quad(B.F, c - 1.68, 0.8, c + 1.68, 3.0)));
                P.set({ cls: CLS.SELF, m: MAT.GLASS, size: 1.8, ang: Math.PI / 2 });
                const ctr = B.F(c, 1.9), gr = P.alb.createRadialGradient(ctr[0], ctr[1], 0, ctr[0], ctr[1], 2.0 * s);
                gr.addColorStop(0, '#fff0b4'); gr.addColorStop(0.5, '#ffc95c'); gr.addColorStop(1, '#ec8a2a');
                P.fill(gr, g => poly(g, gl));
                // What is in the window: a little tree, jars, a sled, a doll's house.
                P.fill('rgba(36,78,42,0.92)', g => poly(g, [B.F(c - sgn * 0.9 - 0.42, 0.95), B.F(c - sgn * 0.9, 2.5), B.F(c - sgn * 0.9 + 0.42, 0.95)]));
                for (let i = 0; i < 8; i++) { const p = B.F(c - sgn * 0.9 + P.rr(-0.24, 0.24), P.rr(1.05, 2.0)); P.bulb(p[0], p[1], Math.max(0.9 * P.cam.u, 0.03 * s), fy, 'string'); }
                for (let i = 0; i < 5; i++) { const u = c + sgn * 0.1 + i * 0.3 * sgn, hgt = P.rr(0.3, 0.62); P.fill(P.pick(['rgba(150,40,36,0.9)', 'rgba(52,78,120,0.9)', 'rgba(120,70,30,0.9)', 'rgba(60,96,60,0.9)']), g => poly(g, quad(B.F, u - 0.11, 0.95, u + 0.11, 0.95 + hgt))); }
                P.fill('rgba(120,70,36,0.7)', g => poly(g, quad(B.F, c - 1.55, 2.1, c + 1.55, 2.16)));
                P.glowPoly(grp.down, 'rgba(255,196,96,0.95)', gl);
                P.light(grp.down, { x: t.x + c, y: 1.9, z: B.z, c: WINDOW, I: 22, face: [0, -1], r2: 0.5 });
                B.front(); P.set({ m: MAT.WOOD, size: 1.8 });
                for (const k of [1 / 3, 2 / 3]) P.line(col.trim, Math.max(1, 0.04 * s), g => { const a = B.F(c - 1.55 + 3.1 * k, 0.95), b = B.F(c - 1.55 + 3.1 * k, 2.85); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); });
                P.line(col.trim, Math.max(1, 0.04 * s), g => { const a = B.F(c - 1.55, 2.3), b = B.F(c + 1.55, 2.3); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); });
            }
            B.front(); P.set({ m: MAT.WOOD, size: 2, ang: Math.PI / 2 });
            P.fill(col.trim, g => poly(g, quad(B.F, -0.72, 0.36, 0.72, 3.0)));
            P.fill(col.door, g => poly(g, quad(B.F, -0.56, 0.38, 0.56, 2.56)));
            P.set({ cls: CLS.SELF, m: MAT.GLASS, size: 1.8 }); P.fill('#ffd98a', g => { poly(g, quad(B.F, -0.4, 1.3, 0.4, 2.4)); poly(g, quad(B.F, -0.56, 2.64, 0.56, 2.9)); });
            P.glowPoly(grp.down, 'rgba(255,196,100,0.9)', quad(B.F, -0.4, 1.3, 0.4, 2.4));
            wreath(P, B, B.F(0, 1.85), 0.24 * s);
            for (const sgn of [-1, 1]) { const lp = B.F(sgn * 1.02, 2.5); lantern(P, grp.porch, lp[0], lp[1], s * 0.85, { x: t.x + sgn * 1.02, y: 2.5, z: B.z }, 6); }
            // Upstairs, and a light in the gable.
            for (const u of [-hw * 0.6, 0, hw * 0.6]) win(P, B, B.F, u, 5.35, 1.0, 1.45, { ...wo, grp: grp.up, wreath: u === 0, candle: true });
            win(P, B, B.F, 0, 7.75, 0.8, 0.9, { ...wo, rows: 2, grp: grp.up, gain: 0.6 });
            // The porch, and what is out on it.
            const goods = f => {
                P.set({ cls: CLS.UP, foot: fy, m: MAT.WOOD, size: 2.2, ang: Math.PI / 2 });
                const barrel = u => { P.fill([0.36, 0.25, 0.18], g => { const a = f(u - 0.34, 0.36), b = f(u + 0.34, 1.3); g.rect(a[0], b[1], b[0] - a[0], a[1] - b[1]); }); P.fill([0.16, 0.14, 0.14], g => { for (const v of [0.56, 1.1]) poly(g, quad(f, u - 0.36, v, u + 0.36, v + 0.07)); }); P.set({ cls: CLS.TOP, m: MAT.ROOF, size: 2.2 }); P.fill(SNOW, g => { const p = f(u, 1.32); ell(g, p[0], p[1], 0.36 * s, 0.09 * s); }); P.set({ cls: CLS.UP, m: MAT.WOOD }); };
                barrel(-hw + 0.7); barrel(-hw + 1.5);
                P.fill([0.42, 0.30, 0.20], g => { poly(g, quad(f, hw - 1.7, 0.36, hw - 0.6, 1.0)); poly(g, quad(f, hw - 1.5, 1.0, hw - 0.8, 1.5)); });
                // A sled against the wall, and a broom.
                P.line([0.62, 0.16, 0.14], 0.07 * s, g => { const a = f(hw - 2.5, 0.4), b = f(hw - 2.15, 1.9); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.moveTo(a[0] + 0.3 * s, a[1]); g.lineTo(b[0] + 0.3 * s, b[1]); });
                P.spots.cat = { x: t.x - hw + 2.6, z: B.z - 1.9 / P.cam.zm, y: 0.36 };
            };
            porch(P, B, col, { depth: 2.2, v: 3.3, steps: 0, goods });
            // The sign.
            B.front(); P.set({ m: MAT.WOOD, size: 1.4, ang: 0 });
            P.fill([0.90, 0.72, 0.30], g => poly(g, quad(B.F, -4.3, 3.8, 4.3, 4.68)));
            P.fill([0.10, 0.20, 0.16], g => poly(g, quad(B.F, -4.18, 3.9, 4.18, 4.58)));

            // The roof: the slope on the side we see, and the lips of snow up both rakes.
            const zo = B.z - 0.4 / P.cam.zm;
            P.set({ cls: side > 0 ? CLS.TOPR : CLS.TOPL, foot: fy, m: MAT.ROOF, size: fine(P, s * 0.16, 4, 9), ang: 0.5 * side, haze: 0 });
            P.fill([0.92, 0.93, 1], g => poly(g, [B.at(B.xs + side * 0.35, e - 0.1, zo), B.at(B.xs + side * 0.35, e - 0.1, B.zb), B.at(t.x, r, B.zb), B.at(t.x, r, zo)]));
            snowBand(P, [B.at(t.x - hw - 0.4, e - 0.14, zo), B.at(t.x, r + 0.06, zo), B.at(t.x + hw + 0.4, e - 0.14, zo)], 0.3 * s, { icicles: true });
            snowBand(P, [B.at(B.xs + side * 0.35, e - 0.1, zo), B.at(B.xs + side * 0.35, e - 0.1, B.zb)], 0.2 * s, { icicles: true, size: 3.6, cls: side > 0 ? CLS.TOPR : CLS.TOPL });
            B.zmid = B.z + d * 0.7 / P.cam.zm; chimney(P, B, 0, r - 0.2, 1.1, 1.7); B.zmid = B.z + d / 2 / P.cam.zm;
            if (config.lights !== false) string(P, B.at(t.x - hw, e - 0.2, zo), B.at(t.x, r - 0.25, zo), fy, Math.max(1.1 * P.cam.u, 0.045 * s)), string(P, B.at(t.x, r - 0.25, zo), B.at(t.x + hw, e - 0.2, zo), fy, Math.max(1.1 * P.cam.u, 0.045 * s));
            drift(P, B, B.S, 0.4, d);
        };
        const top = B.at(t.x, r + 2.2, B.z)[1];
        P.solid(t.z, B.fx, fy, body, {});
        P.letter([0.96, 0.82, 0.40], 'GENERAL STORE', B.F(0, 4.24)[0], B.F(0, 4.24)[1], 0.56 * s, { foot: fy, squeeze: 0.86 });
        const x0 = Math.min(B.F(-hw, 0)[0], B.S(d, 0)[0]), x1 = Math.max(B.F(hw, 0)[0], B.S(d, 0)[0]);
        P.hit('house', x0, top, x1, fy, { groups: [grp.down, grp.up, grp.porch], name: 'store' });
        (P.spots.houses ||= []).push({ name: 'store', x: t.x, z: t.z, door: [t.x, t.z], groups: grp, style: 'store' });
    }

    // ---- The meetinghouse ---------------------------------------------------------

    function church(P, t) {
        const w = 12, e = 8.6, r = 12.6, d = 20, haze = 0;
        t.w = w; t.side = t.x < 0 ? 1 : -1;
        const B = frame(P, t, d, haze), { hw, side, s, fy } = B, white = [0.90, 0.89, 0.92];
        const grp = P.group('church', { kind: 'window', house: 'church', church: true });
        const tall = { trim: white, cols: 2, rows: 5, arch: true, curtains: false, grp, gain: 1.3 };
        const body = () => {
            B.sideW();
            boards(P, B.S, white.map(c => c * 0.9), 0, e, () => [0, d], 2.6, 0.5);
            for (const u of [2.6, 6.3, 10, 13.7, 17.4]) win(P, B, B.S, u, 4.3, 1.25, 4.2, tall);
            B.front();
            boards(P, B.F, white, 0, r, v => v <= e ? [-hw, hw] : [-hw * (r - v) / (r - e), hw * (r - v) / (r - e)], 2.6, 0.5);
            for (const u of [-hw * 0.66, hw * 0.66]) win(P, B, B.F, u, 4.3, 1.2, 4.0, tall);
            // The roof's near slope.
            P.set({ cls: side > 0 ? CLS.TOPR : CLS.TOPL, foot: fy, m: MAT.ROOF, size: 3, ang: 0.5 * side, haze });
            P.fill([0.93, 0.94, 1], g => poly(g, [B.at(B.xs + side * 0.4, e - 0.1, B.z), B.at(B.xs + side * 0.4, e - 0.1, B.zb), B.at(t.x, r, B.zb), B.at(t.x, r, B.z)]));
            P.set({ cls: CLS.TOP });
            P.line(SNOW, 0.5 * s, g => { const a = B.F(-hw - 0.4, e - 0.1), b = B.F(0, r + 0.1), c = B.F(hw + 0.4, e - 0.1); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); });
            // The tower, a step forward of the front; the belfry; the spire.
            const zt = B.z - 1.2 / P.cam.zm, T = (u, v) => B.at(t.x + u, v, zt), TS = (u, v) => B.at(t.x + side * 2.3, v, zt + u / P.cam.zm);
            B.sideW(); boards(P, TS, white.map(c => c * 0.88), 0, 17, () => [0, 4.6], 2.4, 0.5);
            B.front(); boards(P, T, white, 0, 17, () => [-2.3, 2.3], 2.4, 0.5);
            // The door, and the light over it.
            P.set({ m: MAT.WOOD, size: 1.8, ang: Math.PI / 2 }); P.fill([0.30, 0.14, 0.12], g => poly(g, quad(T, -0.95, 0, 0.95, 3.0)));
            P.set({ cls: CLS.SELF, m: MAT.GLASS, size: 1.6, haze: haze * 0.4 });
            P.fill('#ffdc8c', g => { const a = T(-0.95, 3.1), b = T(0.95, 3.1), c = T(0, 4.3); g.moveTo(a[0], a[1]); g.quadraticCurveTo(a[0], c[1], c[0], c[1]); g.quadraticCurveTo(b[0], c[1], b[0], b[1]); g.closePath(); });
            P.glowPoly(grp, 'rgba(255,204,110,0.95)', [T(-0.95, 3.1), T(0.95, 3.1), T(0.95, 4.2), T(-0.95, 4.2)]);
            P.light(grp, { x: t.x, y: 3.4, z: zt, c: WINDOW, I: 14, face: [0, -1], r2: 0.8 });
            win(P, B, T, 0, 8.6, 1.1, 2.6, { ...tall, gain: 0.8 });
            // The clock: the manager draws its hands.
            const cp = T(0, 13.6), cr = 1.25 * s;
            B.front(); P.set({ m: MAT.WOOD, size: 1.6, ang: null }); P.fill([0.16, 0.16, 0.2], g => ell(g, cp[0], cp[1], cr * 1.12, cr * 1.12));
            P.set({ cls: CLS.SELF, m: MAT.GLASS, size: 1.6, haze: haze * 0.4 }); P.fill('#fff1c8', g => ell(g, cp[0], cp[1], cr, cr));
            P.glowEll(grp, 'rgba(255,226,160,0.8)', cp[0], cp[1], cr, cr);
            P.spots.clock = { x: cp[0], y: cp[1], r: cr };
            // Belfry: louvres between corner posts, under a cornice.
            const bel = (u, v) => B.at(t.x + u, v, zt + 0.3 / P.cam.zm);
            B.front(); P.set({ m: MAT.WALL, size: 2.2, ang: Math.PI / 2 });
            P.fill(white, g => { poly(g, quad(T, -2.5, 16.8, 2.5, 17.3)); poly(g, quad(bel, -2.0, 17.3, 2.0, 21.2)); poly(g, quad(bel, -2.3, 21.2, 2.3, 21.7)); });
            P.set({ m: MAT.WOOD, size: 1.8 }); P.fill([0.20, 0.20, 0.28], g => { const a = bel(-1.0, 17.9), b = bel(1.0, 17.9), c = bel(0, 20.9); g.moveTo(a[0], a[1]); g.lineTo(a[0], bel(0, 19.8)[1]); g.quadraticCurveTo(a[0], c[1], c[0], c[1]); g.quadraticCurveTo(b[0], c[1], b[0], bel(0, 19.8)[1]); g.lineTo(b[0], b[1]); g.closePath(); });
            B.sideW(); P.set({ m: MAT.WALL, size: 2.2 }); P.fill(white.map(c => c * 0.86), g => poly(g, [bel(side * 2.0, 17.3), B.at(t.x + side * 2.0, 17.3, zt + 4.3 / P.cam.zm), B.at(t.x + side * 2.0, 21.2, zt + 4.3 / P.cam.zm), bel(side * 2.0, 21.2)]));
            // The spire: slate, snow down the weather side.
            B.front(); P.set({ m: MAT.STONE, size: 2.2, ang: Math.PI / 2 + 0.1 });
            const apex = B.at(t.x, 31.5, zt + 2.3 / P.cam.zm), l = bel(-1.9, 21.7), rt = bel(1.9, 21.7), mid = bel(-side * 0.5, 21.7);
            P.fill([0.34, 0.33, 0.44], g => poly(g, [l, rt, apex]));
            P.set({ cls: CLS.TOP, m: MAT.ROOF, size: 2.2 }); P.fill([0.93, 0.94, 1], g => poly(g, side > 0 ? [l, mid, apex] : [mid, rt, apex]));
            P.set({ cls: CLS.UP, m: MAT.WOOD, size: 1.4 }); P.line(DARK, Math.max(1, 0.1 * s), g => { g.moveTo(apex[0], apex[1]); g.lineTo(apex[0], apex[1] - 1.6 * s); g.moveTo(apex[0] - 0.5 * s, apex[1] - 1.0 * s); g.lineTo(apex[0] + 0.5 * s, apex[1] - 1.0 * s); });
            P.set({ cls: CLS.TOP, m: MAT.ROOF, size: 2.2 }); P.line(SNOW, 0.3 * s, g => { const a = T(-2.6, 17.4), b = T(2.6, 17.4); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); const c = bel(-2.4, 21.8), d2 = bel(2.4, 21.8); g.moveTo(c[0], c[1]); g.lineTo(d2[0], d2[1]); });
        };
        P.solid(t.z, B.fx, fy, body, { shadow: 0.7 });
        const top = B.at(t.x, 33, B.z)[1];
        P.hit('church', B.F(-hw, 0)[0], top, Math.max(B.F(hw, 0)[0], B.S(d, 0)[0]), fy, { groups: [grp], name: 'church' });
        (P.spots.houses ||= []).push({ name: 'church', x: t.x, z: t.z, door: [t.x, t.z], groups: { down: grp }, style: 'church' });
    }

    // ---- The covered bridge ---------------------------------------------------------

    function bridge(P, t, config) {
        const len = t.len, d = 5, hd = 1.0, e = 4.4, r = 6.1, col = [0.52, 0.16, 0.14];
        t.w = len; t.side = 1;
        const B = frame(P, t, d), { hw, s, fy } = B, zm = P.cam.zm, zo = B.z - 0.45 / zm;
        const grp = P.group('bridge', { kind: 'lamp', bridge: true });
        // Where the brook goes under: between the stone abutments.
        const mid = t.brook ?? 0.3, gap = t.span ?? 3.3;
        const body = () => {
            B.front();
            P.set({ m: MAT.WOOD, size: 3, ang: 0 }); P.fill([0.09, 0.09, 0.15], g => poly(g, quad(B.F, mid - gap, -0.1, mid + gap, hd)));
            P.set({ cls: CLS.GROUND, m: MAT.ICE, size: 3, ang: 0 }); P.fill([0.34, 0.40, 0.56], g => { const p = B.F(mid, 0); ell(g, p[0], p[1], gap * 0.92 * s, 0.2 * s); });
            B.front(); P.set({ m: MAT.STONE, size: 3, ang: null });
            for (const [a, b] of [[-hw - 1.2, mid - gap], [mid + gap, hw + 1.2]]) {
                P.fill(STONE, g => poly(g, quad(B.F, a, 0, b, hd)));
                for (let v = 0.12; v < hd - 0.1; v += 0.3) for (let u = a + P.rr(0, 0.3); u < b - 0.1; u += P.rr(0.36, 0.6)) { const p = B.F(u, v); P.fill(P.vary(P.pick([[0.52, 0.48, 0.48], [0.62, 0.54, 0.46], [0.44, 0.45, 0.54], [0.38, 0.36, 0.42]]), 0.14), g => ell(g, p[0], p[1], P.rr(0.16, 0.26) * s, P.rr(0.09, 0.13) * s)); }
            }
            // The side: boards up and down, a row of openings under the eave.
            P.set({ m: MAT.WALL, size: fine(P, s * 0.1, 2.4, 4), ang: Math.PI / 2 });
            for (let u = -hw; u < hw - 0.01; u += 0.42) P.fill(P.vary(col, 0.07, 0.01), g => poly(g, quad(B.F, u, hd, Math.min(hw, u + 0.44), e)));
            P.set({ m: MAT.WOOD, size: 2.4, ang: 0 }); P.fill([0.22, 0.14, 0.12], g => poly(g, quad(B.F, -hw - 0.3, hd - 0.16, hw + 0.3, hd + 0.14)));
            P.set({ ang: Math.PI / 2 }); for (const u of [-hw, hw]) P.fill([0.93, 0.92, 0.88], g => poly(g, quad(B.F, u - 0.14, hd, u + 0.14, e)));
            const n = Math.round(len / 2.3);
            for (let i = 0; i < n; i++) {
                const c = -hw + (i + 0.5) * len / n, gl = quad(B.F, c - 0.5, 2.95, c + 0.5, 3.7);
                B.front(); P.set({ m: MAT.WOOD, size: 1.8 }); P.fill([0.90, 0.89, 0.86], g => poly(g, quad(B.F, c - 0.6, 2.85, c + 0.6, 3.8)));
                P.set({ cls: CLS.SELF, m: MAT.GLASS, size: 1.8 }); P.fill('#f4b45a', g => poly(g, gl));
                P.fill('rgba(92,44,24,0.8)', g => { for (const k of [-0.25, 0.25]) poly(g, quad(B.F, c + k - 0.04, 2.95, c + k + 0.04, 3.7)); });
                P.glowPoly(grp, 'rgba(255,180,80,0.8)', gl);
            }
            // The roof, and its snow.
            P.set({ cls: CLS.TOP, foot: fy, m: MAT.ROOF, size: fine(P, s * 0.16, 3.5, 7), ang: Math.PI / 2, haze: 0 });
            const e0 = B.at(t.x - hw - 0.6, e - 0.1, zo), e1 = B.at(t.x + hw + 0.6, e - 0.1, zo), r1 = B.at(t.x + hw + 0.6, r, B.zmid), r0 = B.at(t.x - hw - 0.6, r, B.zmid);
            P.fill([0.93, 0.94, 1], g => poly(g, [e0, e1, r1, r0]));
            snowBand(P, [e0, e1], 0.24 * s, { icicles: true, size: 3.6 });
            snowBand(P, [r0, r1], 0.16 * s, { size: 3.4 });
            wreath(P, B, B.F(0, 2.15), 0.42 * s);
            // The road comes up to it over a bank of snow at each end.
            for (const sgn of [-1, 1]) { const p = B.F(sgn * (hw + 2.2), 0.3); P.set({ cls: CLS.TOP, foot: fy, m: MAT.SNOW, size: 4, ang: 0 }); P.fill([0.95, 0.955, 1], g => ell(g, p[0], p[1], 3.2 * s, 0.75 * s)); }
            for (const sgn of [-1, 1]) {
                const u = sgn * (hw + 0.5), lp = B.F(u, 3.3);
                B.front(); P.set({ m: MAT.WOOD, size: 2, ang: Math.PI / 2 }); P.fill(DARK, g => poly(g, quad(B.F, u - 0.06, 0.6, u + 0.06, 3.1)));
                lantern(P, grp, lp[0], lp[1], s * 1.25, { x: t.x + u, y: 3.3, z: B.z }, 12);
            }
            if (config.lights !== false) string(P, B.at(t.x - hw - 0.5, e - 0.36, zo), B.at(t.x + hw + 0.5, e - 0.36, zo), fy, Math.max(1.1 * P.cam.u, 0.05 * s));
        };
        const top = B.at(t.x, r + 0.6, B.zmid)[1];
        P.solid(t.z, B.fx, fy, body, { shadow: 0.6, reflect: [B.F(-hw - 1.4, 0)[0], top, B.F(hw + 1.4, 0)[0], fy] });
        P.spots.bridge = { x0: t.x - hw, x1: t.x + hw, z: t.z, group: grp };
        P.hit('bridge', B.F(-hw, 0)[0], top, B.F(hw, 0)[0], fy, { group: grp });
    }

    // ---- The barn at the tree farm ------------------------------------------------------

    // Red boards, a gambrel roof, its gable and its big doors to the street.
    function barn(P, t, config) {
        const e = 4.4, k = 6.7, r = 8.5, d = 13, col = [0.56, 0.16, 0.14], trim = [0.94, 0.93, 0.89], B = frame(P, t, d), { hw, side, s, fy } = B, kx = hw * 0.6;
        const grp = P.group('barn', { kind: 'window', house: 'barn', shop: true }), lampG = P.group('barn.porch', { kind: 'porch', house: 'barn' });
        const topAt = u => { const a = Math.abs(u); return a <= kx ? r - (r - k) * a / kx : k - (k - e) * (a - kx) / (hw - kx); };
        const body = () => {
            B.sideW(); P.set({ m: MAT.WALL, size: fine(P, s * 0.1, 2.4, 4), ang: Math.PI / 2 });
            for (let u = 0; u < d - 0.01; u += 0.5) P.fill(P.vary(col.map(c => c * 0.88), 0.07, 0.01), g => poly(g, quad(B.S, u, 0, Math.min(d, u + 0.52), e)));
            for (const u of [d * 0.3, d * 0.7]) win(P, B, B.S, u, 2.2, 1.0, 1.1, { trim, rows: 2, grp });
            B.front(); P.set({ m: MAT.WALL, size: fine(P, s * 0.1, 2.4, 4), ang: Math.PI / 2 });
            for (let u = -hw; u < hw - 0.01; u += 0.5) { const u1 = Math.min(hw, u + 0.52); P.fill(P.vary(col, 0.07, 0.01), g => poly(g, [B.F(u, 0), B.F(u1, 0), B.F(u1, topAt(u1)), B.F(u, topAt(u))])); }
            // The doors stand open on the light inside; the loft door over them.
            P.set({ m: MAT.WOOD, size: 2, ang: Math.PI / 2 }); P.fill(trim, g => poly(g, quad(B.F, -2.1, 0, 2.1, 3.9)));
            const gl = quad(B.F, -1.85, 0.1, 1.85, 3.65), ctr = B.F(0, 1.6);
            P.set({ cls: CLS.SELF, m: MAT.GLASS, size: 2, ang: Math.PI / 2 });
            const gr = P.alb.createRadialGradient(ctr[0], ctr[1], 0, ctr[0], ctr[1], 3.2 * s); gr.addColorStop(0, '#ffe9a6'); gr.addColorStop(0.5, '#ffbf56'); gr.addColorStop(1, '#d9741f');
            P.fill(gr, g => poly(g, gl));
            P.fill('rgba(40,74,42,0.92)', g => { for (const u of [-1.2, 1.15]) poly(g, [B.F(u - 0.5, 0.1), B.F(u, 2.3), B.F(u + 0.5, 0.1)]); });        // trees for sale, inside
            P.glowPoly(grp, 'rgba(255,190,90,0.95)', gl);
            P.light(grp, { x: t.x, y: 1.9, z: B.z, c: WINDOW, I: 26, face: [0, -1], r2: 0.6 });
            B.front(); P.set({ m: MAT.WOOD, size: 2, ang: Math.PI / 2 });
            for (const sgn of [-1, 1]) {
                P.fill(trim, g => poly(g, quad(B.F, sgn * 2.1, 0.1, sgn * 3.9, 3.7)));
                P.fill(col, g => poly(g, quad(B.F, sgn * 2.3, 0.3, sgn * 3.7, 3.5)));
                P.line(trim, Math.max(1, 0.14 * s), g => { const a = B.F(sgn * 2.3, 0.3), b = B.F(sgn * 3.7, 3.5), c = B.F(sgn * 3.7, 0.3), d2 = B.F(sgn * 2.3, 3.5); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.moveTo(c[0], c[1]); g.lineTo(d2[0], d2[1]); });
            }
            P.fill(trim, g => poly(g, quad(B.F, -0.95, 4.9, 0.95, 6.7))); P.fill([0.20, 0.10, 0.10], g => poly(g, quad(B.F, -0.75, 5.05, 0.75, 6.55)));
            wreath(P, B, B.F(0, 4.35), 0.42 * s);
            const lp = B.F(2.9, 4.2); lantern(P, lampG, lp[0], lp[1], s * 1.1, { x: t.x + 2.9, y: 4.2, z: B.z }, 9);
            // The roof: two slopes on the side we see, snow up the rakes.
            const zo = B.z - 0.4 / P.cam.zm, ex = B.xs + side * 0.35, kxw = t.x + side * kx;
            P.set({ cls: side > 0 ? CLS.TOPR : CLS.TOPL, foot: fy, m: MAT.ROOF, size: fine(P, s * 0.16, 3, 7), ang: 0.5 * side, haze: 0 });
            P.fill([0.90, 0.91, 0.99], g => poly(g, [B.at(ex, e - 0.1, zo), B.at(ex, e - 0.1, B.zb), B.at(kxw, k, B.zb), B.at(kxw, k, zo)]));
            P.fill([0.94, 0.95, 1], g => poly(g, [B.at(kxw, k, zo), B.at(kxw, k, B.zb), B.at(t.x, r, B.zb), B.at(t.x, r, zo)]));
            snowBand(P, [B.at(t.x - hw - 0.4, e - 0.14, zo), B.at(t.x - kx, k + 0.05, zo), B.at(t.x, r + 0.06, zo), B.at(t.x + kx, k + 0.05, zo), B.at(t.x + hw + 0.4, e - 0.14, zo)], 0.3 * s, { icicles: true, size: 3.4 });
            if (config.lights !== false) for (const [a, b] of [[[-hw, e - 0.2], [-kx, k - 0.2]], [[-kx, k - 0.2], [0, r - 0.25]], [[0, r - 0.25], [kx, k - 0.2]], [[kx, k - 0.2], [hw, e - 0.2]]]) string(P, B.at(t.x + a[0], a[1], zo), B.at(t.x + b[0], b[1], zo), fy, Math.max(1.1 * P.cam.u, 0.05 * s));
            drift(P, B, B.S, 0.4, d); drift(P, B, B.F, -hw - 0.4, -2.2); drift(P, B, B.F, 2.2, hw + 0.4);
        };
        const top = B.at(t.x, r + 1, B.z)[1];
        P.solid(t.z, B.fx, fy, body, {});
        P.letter([0.96, 0.93, 0.84], 'TREES', B.F(0, 7.35)[0], B.F(0, 7.35)[1], 0.8 * s, { foot: fy, squeeze: 0.9 });
        const x0 = Math.min(B.F(-hw, 0)[0], B.S(d, 0)[0]), x1 = Math.max(B.F(hw, 0)[0], B.S(d, 0)[0]);
        P.hit('house', x0, top, x1, fy, { groups: [grp, lampG], name: 'barn' });
    }

    // ---- By the pond: cocoa, at a hatch ---------------------------------------------------

    function cocoaHut(P, t, config) {
        const e = 2.7, r = 4.1, d = 3.6, col = [0.44, 0.29, 0.20], trim = [0.95, 0.93, 0.86];
        t.side = t.x < 0 ? 1 : -1;
        const B = frame(P, t, d), { hw, side, s, fy } = B, zm = P.cam.zm;
        const grp = P.group('cocoa', { kind: 'window', house: 'cocoa', shop: true }), lampG = P.group('cocoa.porch', { kind: 'porch', house: 'cocoa' });
        const body = () => {
            B.sideW(); boards(P, B.S, col.map(c => c * 0.86), 0, e, () => [0, d], 2.4, 0.34);
            B.front(); boards(P, B.F, col, 0, r - 0.05, v => v <= e ? [-hw, hw] : [-hw * (r - v) / (r - e), hw * (r - v) / (r - e)], 2.4, 0.34);
            // The hatch, and who is serving.
            P.set({ m: MAT.WOOD, size: 1.8, ang: 0 }); P.fill(trim, g => poly(g, quad(B.F, -hw + 0.5, 0.95, hw - 0.5, 2.35)));
            const gl = quad(B.F, -hw + 0.68, 1.12, hw - 0.68, 2.22), ctr = B.F(0, 1.7);
            P.set({ cls: CLS.SELF, m: MAT.GLASS, size: 1.8, ang: Math.PI / 2 });
            const gr = P.alb.createRadialGradient(ctr[0], ctr[1], 0, ctr[0], ctr[1], 2.2 * s); gr.addColorStop(0, '#fff0b4'); gr.addColorStop(0.55, '#ffc65a'); gr.addColorStop(1, '#e88a2a');
            P.fill(gr, g => poly(g, gl));
            P.fill('rgba(70,40,30,0.9)', g => { ell(g, B.F(-0.5, 1.95)[0], B.F(-0.5, 1.95)[1], 0.2 * s, 0.22 * s); poly(g, quad(B.F, -0.82, 1.12, -0.18, 1.72)); poly(g, quad(B.F, 0.6, 1.12, 1.0, 1.62)); });
            P.glowPoly(grp, 'rgba(255,196,96,0.95)', gl);
            P.light(grp, { x: t.x, y: 1.7, z: B.z, c: WINDOW, I: 20, face: [0, -1], r2: 0.5 });
            // The counter, and a striped awning over it.
            const zf = B.z - 1.0 / zm, A = (u, v) => B.at(t.x + u, v, zf);
            B.front(); P.set({ cls: CLS.TOP, m: MAT.WOOD, size: 1.8, ang: 0 }); P.fill([0.70, 0.56, 0.40], g => poly(g, [B.F(-hw + 0.4, 1.0), B.F(hw - 0.4, 1.0), B.at(t.x + hw - 0.4, 1.0, B.z - 0.5 / zm), B.at(t.x - hw + 0.4, 1.0, B.z - 0.5 / zm)]));
            P.set({ cls: CLS.TOP, m: MAT.FIG, size: 1.8, ang: Math.PI / 2 });
            const n = 8; for (let i = 0; i < n; i++) { const u0 = -hw + 0.3 + (t.w - 0.6) * i / n, u1 = -hw + 0.3 + (t.w - 0.6) * (i + 1) / n; P.fill(i % 2 ? [0.94, 0.93, 0.90] : [0.76, 0.14, 0.13], g => poly(g, [B.F(u0, 2.75), B.F(u1, 2.75), A(u1, 2.3), A(u0, 2.3)])); }
            P.set({ cls: CLS.TOP, m: MAT.ROOF, size: 2 }); P.line(SNOW, 0.14 * s, g => { const a = B.F(-hw + 0.3, 2.78), b = B.F(hw - 0.3, 2.78); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); });
            B.front(); P.set({ m: MAT.WOOD, size: 1.4, ang: 0 }); P.fill([0.16, 0.10, 0.09], g => poly(g, quad(B.F, -1.25, 3.0, 1.25, 3.62)));
            // The roof, a stovepipe, snow.
            const zo = B.z - 0.35 / zm, ex = B.xs + side * 0.3;
            P.set({ cls: side > 0 ? CLS.TOPR : CLS.TOPL, foot: fy, m: MAT.ROOF, size: 3, ang: 0.5 * side, haze: 0 });
            P.fill([0.92, 0.93, 1], g => poly(g, [B.at(ex, e - 0.1, zo), B.at(ex, e - 0.1, B.zb), B.at(t.x, r, B.zb), B.at(t.x, r, zo)]));
            snowBand(P, [B.at(t.x - hw - 0.3, e - 0.12, zo), B.at(t.x, r + 0.05, zo), B.at(t.x + hw + 0.3, e - 0.12, zo)], 0.26 * s, { size: 3, icicles: true });
            const pp = B.at(t.x - side * 0.9, r + 0.7, B.zmid);
            B.front(); P.set({ m: MAT.WOOD, size: 1.6, ang: Math.PI / 2 }); P.fill(DARK, g => g.rect(pp[0] - 0.13 * s, pp[1], 0.26 * s, 1.5 * s));
            P.smoke(pp[0], pp[1], s * 0.9, B.z);
            const lp = B.F(side * (hw - 0.15), 2.5); lantern(P, lampG, lp[0], lp[1], s * 1.1, { x: t.x + side * (hw - 0.15), y: 2.5, z: B.z }, 9);
            if (config.lights !== false) string(P, A(-hw + 0.3, 2.22), A(hw - 0.3, 2.22), fy, Math.max(1.1 * P.cam.u, 0.06 * s));
            drift(P, B, B.S, 0.3, d);
        };
        const top = B.at(t.x, r + 1.6, B.z)[1];
        P.solid(t.z, B.fx, fy, body, { reflect: [B.F(-hw - 0.4, 0)[0], top, B.F(hw + 0.4, 0)[0], fy] });
        P.letter([0.98, 0.86, 0.50], 'COCOA', B.F(0, 3.3)[0], B.F(0, 3.3)[1], 0.52 * s, { foot: fy, squeeze: 0.9 });
        P.hit('house', B.F(-hw, 0)[0], top, B.F(hw, 0)[0], fy, { groups: [grp, lampG], name: 'cocoa' });
        P.spots.cocoa = { x: t.x, z: t.z };
    }

    // ---- The bandstand on the green ----------------------------------------------------------

    function bandstand(P, t, config) {
        const cam = P.cam, R = 3.4, base = 0.75, eave = 3.7, apex = 6.3, z = t.z, fy = cam.sy(z), s = cam.sc(z), fx = cam.sx(t.x, z);
        const at = (a, rad, v) => cam.pt(t.x + Math.cos(a) * rad, v, z + Math.sin(a) * rad / cam.zm);
        const A = Array.from({ length: 8 }, (_, i) => (i + 0.5) * TAU / 8), ring = (rad, v) => A.map(a => at(a, rad, v));
        const grp = P.group('bandstand', { kind: 'porch' });
        const far = A.map((a, i) => i).sort((i, j) => Math.sin(A[j]) - Math.sin(A[i]));          // far posts first
        const body = () => {
            const r0 = ring(R, 0), r1 = ring(R, base), white = [0.15, 0.30, 0.24];
            P.set({ cls: CLS.UP, foot: fy, m: MAT.STONE, size: 2.2, ang: 0, haze: 0 });
            for (let i = 0; i < 8; i++) { const j = (i + 1) % 8; P.fill(P.vary([0.56, 0.54, 0.58], 0.08), g => poly(g, [r0[i], r0[j], r1[j], r1[i]])); }
            P.set({ cls: CLS.TOP, m: MAT.WOOD, size: 2.4, ang: 0 }); P.fill([0.62, 0.58, 0.58], g => poly(g, r1));
            const post = i => { const a = at(A[i], R - 0.2, base), b = at(A[i], R - 0.2, eave); P.set({ cls: CLS.UP, m: MAT.WALL, size: 1.6, ang: Math.PI / 2 }); P.line(white, Math.max(1.2, 0.2 * s), g => { g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }); };
            const rail = (i, j) => { const a = at(A[i], R - 0.2, base + 0.95), b = at(A[j], R - 0.2, base + 0.95); P.set({ cls: CLS.UP, m: MAT.WALL, size: 1.6, ang: 0 }); P.line(white, Math.max(1, 0.1 * s), g => { g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }); };
            for (const i of far.slice(0, 4)) post(i);
            for (let i = 0; i < 8; i++) if (Math.sin(A[i]) + Math.sin(A[(i + 1) % 8]) > 0) rail(i, (i + 1) % 8);
            const lp = at(0, 0, eave - 0.9); lantern(P, grp, lp[0], lp[1], s * 1.5, { x: t.x, y: eave - 0.9, z }, 16);
            for (const i of far.slice(4)) post(i);
            for (let i = 0; i < 8; i++) { const j = (i + 1) % 8, m = Math.sin(A[i]) + Math.sin(A[j]); if (m < 0 && Math.abs(Math.cos(A[i]) + Math.cos(A[j])) > 0.6) rail(i, j); }
            // The roof: eight slopes to a point, the near ones over the far.
            const e = ring(R + 0.55, eave), top = at(0, 0, apex);
            for (const i of far) {
                const j = (i + 1) % 8, mid = (A[i] + A[j]) / 2 + (j === 0 ? Math.PI : 0), cx = Math.cos(mid);
                P.set({ cls: cx < -0.5 ? CLS.TOPL : cx > 0.5 ? CLS.TOPR : CLS.TOP, foot: fy, m: MAT.ROOF, size: 3, ang: Math.PI / 2 + cx * 0.5 });
                P.fill(P.vary([0.20, 0.36, 0.30], 0.06), g => poly(g, [e[i], e[j], top]));
                const k = 0.72, a = [top[0] + (e[i][0] - top[0]) * k, top[1] + (e[i][1] - top[1]) * k], b = [top[0] + (e[j][0] - top[0]) * k, top[1] + (e[j][1] - top[1]) * k];
                P.fill(P.vary([0.93, 0.94, 1], 0.02), g => poly(g, [a, b, top]));
            }
            P.set({ cls: CLS.UP, m: MAT.WOOD, size: 1.4, ang: Math.PI / 2 }); P.line(DARK, Math.max(1, 0.1 * s), g => { g.moveTo(top[0], top[1]); g.lineTo(top[0], top[1] - 0.9 * s); });
            // Garlands from post to post, and bulbs round the eave.
            for (let i = 0; i < 8; i++) {
                const j = (i + 1) % 8; if (Math.sin(A[i]) + Math.sin(A[j]) > 0.1) continue;
                const a = at(A[i], R - 0.2, eave - 0.1), b = at(A[j], R - 0.2, eave - 0.1);
                P.set({ cls: CLS.UP, m: MAT.FIR, size: 1.6, ang: null }); P.line([0.12, 0.30, 0.18], Math.max(1.2, 0.2 * s), g => { g.moveTo(a[0], a[1]); g.quadraticCurveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.8 * s, b[0], b[1]); });
                P.set({ m: MAT.FIG }); P.fill([0.80, 0.12, 0.10], g => ell(g, a[0], a[1], 0.2 * s, 0.16 * s));
                if (config.lights !== false) string(P, e[i], e[j], fy, Math.max(1.1 * P.cam.u, 0.06 * s));
            }
            // Steps, toward us.
            P.set({ cls: CLS.TOP, m: MAT.ROOF, size: 2, ang: 0 });
            P.fill([0.88, 0.88, 0.96], g => poly(g, [at(-Math.PI / 2 - 0.3, R, base), at(-Math.PI / 2 + 0.3, R, base), at(-Math.PI / 2 + 0.24, R + 1.3, 0), at(-Math.PI / 2 - 0.24, R + 1.3, 0)]));
        };
        const topY = at(0, 0, apex + 1)[1];
        P.solid(z, fx, fy, body, { shadow: 0.7 });
        P.hump(fx, fy, 5 * s, 0.8 * s, 0.35);
        P.hit('bandstand', fx - (R + 1) * s, topY, fx + (R + 1) * s, fy, { group: grp });
        P.spots.bandstand = { x: t.x, z: t.z };
    }

    return { house, store, church, bridge, barn, cocoaHut, bandstand };
})();
