// Painted Village's scenery, as an underpainting: the sky's place, the
// mountain and its cabin, the woods, the ground and its drifts, the pond,
// the trodden lanes, firs, frosted maples, the grand tree, lamps, fences,
// the snowman, the bonfire. Flat local colour only: the brushwork and the
// light come after (painted-bake.js). Buildings are in painted-buildings.js.
// Everything is placed in metres and depth (PaintedLogic.camera).

const PaintedArt = (() => {
    const { clamp, CLS } = PaintedLogic;
    const { MAT, TAU, poly, ell } = PaintedPlates;
    const SNOW = [0.95, 0.955, 1], LAMP = [1, 0.68, 0.30], WINDOW = [1, 0.62, 0.24];
    // A stroke size given in CSS pixels, as the design pixels plates keep.
    const fine = (P, px, lo, hi) => clamp(px / P.cam.u, lo, hi);

    // ---- The far things ---------------------------------------------------------

    function mountains(P, L, config) {
        const { W, hor, u } = P.cam;
        P.set({ cls: CLS.UP, foot: hor + 3, haze: 0.58, m: MAT.SNOW, size: 8, ang: 1.1 });
        const ridge = [], top = x => { const t = x / W; return 150 * Math.exp(-(((t - 0.84) / 0.2) ** 2)) + 96 * Math.exp(-(((t - 0.1) / 0.17) ** 2)) + 54 * Math.exp(-(((t - 0.5) / 0.22) ** 2)) + 14 * Math.sin(t * 23) + 7 * Math.sin(t * 61 + 2); };
        for (let x = -20; x <= W + 20; x += 14 * u) ridge.push([x, hor - (top(x) + P.rr(-4, 4)) * u]);
        P.fill([0.90, 0.90, 1], g => poly(g, [[-20, hor + 6], ...ridge, [W + 20, hor + 6]]));
        // Rock where it is too steep for snow, and the hollows between the spurs.
        for (let i = 3; i < ridge.length - 3; i += 2) {
            const [x, y] = ridge[i], d = hor - y;
            if (d < 30 * u) continue;
            P.fill(P.vary([0.50, 0.48, 0.68], 0.12), g => poly(g, [[x, y + d * 0.06], [x + P.rr(18, 46) * u, y + d * P.rr(0.5, 0.9)], [x + P.rr(2, 12) * u, y + d * P.rr(0.55, 0.95)]]));
        }
        // Woods up the lower slopes.
        P.set({ m: MAT.FIR, size: 3.5, ang: Math.PI / 2, haze: 0.62 });
        for (let i = 0; i < 240; i++) {
            const x = P.rr(-10, W + 10), up = P.rr(0, 0.42) * top(x) * u, r = P.rr(3, 7) * u;
            P.fill(P.vary([0.30, 0.36, 0.48], 0.15), g => poly(g, [[x - r * 0.5, hor - up + r], [x, hor - up - r * 1.7], [x + r * 0.5, hor - up + r]]));
        }
        // The cabin, on a shoulder: one window, and woodsmoke.
        if (config.cabin !== false) {
            const c = L.things.find(t => t.kind === 'cabin');
            if (c) {
                const x = W * c.fx, y = hor - c.up * u, s = 2.6 * u, grp = P.group('cabin', { kind: 'window', far: true });
                P.set({ cls: CLS.TOP, m: MAT.SNOW, size: 4, haze: 0.5, ang: 0 });
                P.fill([0.93, 0.93, 1], g => ell(g, x, y + 1.5 * s, 16 * s, 3 * s));
                P.set({ cls: CLS.UP, m: MAT.WOOD, size: 2, haze: 0.42, ang: 0 });
                P.fill([0.36, 0.26, 0.24], g => g.rect(x - 4 * s, y - 3 * s, 8 * s, 4 * s));
                P.set({ cls: CLS.TOP, m: MAT.ROOF, size: 2.2, haze: 0.46 });
                P.fill(SNOW, g => poly(g, [[x - 5 * s, y - 2.8 * s], [x, y - 6 * s], [x + 5 * s, y - 2.8 * s]]));
                P.set({ cls: CLS.SELF, m: MAT.GLASS, size: 2, haze: 0.16 });
                P.fill('#ffd27a', g => g.rect(x - 1.1 * s, y - 2 * s, 2 * s, 1.8 * s));
                P.glowRect(grp, 'rgba(255,196,100,0.95)', x - 1.1 * s, y - 2 * s, 2 * s, 1.8 * s);
                P.halo(grp, x, y - 1.1 * s, 3.4 * s);
                P.smoke(x + 2.6 * s, y - 5.6 * s, 14 * u, 40);
                P.hit('cabin', x - 8 * s, y - 8 * s, x + 8 * s, y + 3 * s, { group: grp });
            }
        }
    }

    function farWoods(P, L) {
        const { W, hor, u } = P.cam;
        // The hillside the back of the town climbs.
        P.set({ cls: CLS.TOP, foot: hor + 10 * u, m: MAT.SNOW, size: 6, ang: 0.05, haze: 0.5 });
        P.fill([0.84, 0.83, 0.95], g => ell(g, W * (L.kind === 'upright' ? 0.5 : 0.62), hor + 34 * u, W * 0.5, 104 * u));
        // Woods along its brow.
        for (let i = 0; i < 90; i++) {
            const k = P.rr(-1, 1), x = W * (L.kind === 'upright' ? 0.5 : 0.62) + k * W * 0.46, y = hor + 34 * u - 104 * u * Math.sqrt(Math.max(0, 1 - k * k)) + P.rr(-4, 10) * u, r = P.rr(6, 12) * u;
            P.set({ cls: CLS.UP, foot: hor + 14 * u, haze: 0.5, m: P.R() < 0.4 ? MAT.FIR : MAT.FROST, size: 3.5, ang: null });
            if (P.o.m === MAT.FIR) P.fill(P.vary([0.20, 0.27, 0.32], 0.2), g => poly(g, [[x - r * 0.5, y + r], [x, y - r * 1.9], [x + r * 0.5, y + r]]));
            else P.fill(P.vary([0.84, 0.76, 0.88], 0.08, 0.04), g => ell(g, x, y, r, r * 0.8));
        }
        for (let i = 0; i < 520; i++) {
            const x = P.rr(-20, W + 20), band = P.R(), y = hor + (8 - band * 30) * u + 10 * u * Math.sin(x / (170 * u));
            const r = P.rr(7, 17) * u * (0.7 + 0.5 * (1 - band));
            if (P.R() < 0.3) {
                P.set({ cls: CLS.UP, foot: hor + 16 * u, haze: 0.5 + 0.2 * band, m: MAT.FIR, size: 3.5, ang: Math.PI / 2 });
                P.fill(P.vary([0.16, 0.24, 0.26], 0.2), g => poly(g, [[x - r * 0.5, y + r], [x, y - r * 1.9], [x + r * 0.5, y + r]]));
            } else {
                P.set({ cls: CLS.UP, foot: hor + 16 * u, haze: 0.42 + 0.2 * band, m: MAT.FROST, size: 3.5, ang: null });
                P.fill(P.vary([0.86, 0.80, 0.90], 0.08, 0.04), g => ell(g, x, y, r, r * 0.8));
            }
        }
    }

    // ---- The ground -------------------------------------------------------------

    function ground(P) {
        const { W, H, hor, f, u, sx, sy, sc } = P.cam;
        P.set({ cls: CLS.GROUND, m: MAT.SNOW, size: 10, ang: null, haze: 0, foot: H });
        P.fill([0.95, 0.955, 1.0], g => g.rect(0, hor - 4, W, H - hor + 4));
        for (let i = 0; i < 90; i++) {
            const y = hor + f * P.R() ** 1.6, k = (y - hor) / f;
            P.soft(P.rr(0, W), y, P.rr(60, 320) * u * (0.3 + k), P.rr(8, 40) * u * (0.2 + k), P.pick([[1, 0.93, 0.94], [0.88, 0.91, 1], [0.98, 0.98, 1], [0.92, 0.90, 0.99]]), 0.55);
        }
        const half = P.cam.half(1);
        for (let i = 0; i < 260; i++) {
            const z = 1 / P.rr(0.07, 1.2), x = P.rr(-1.05, 1.05) * half * z, rx = P.rr(0.7, 3.2) * sc(z);
            P.hump(sx(x, z), sy(z), rx, rx * P.rr(0.16, 0.3), P.rr(0.12, 0.42));
        }
    }

    function pond(P, L) {
        if (!L.pond) return;
        const { W, H, u, sx, sy, sc } = P.cam;
        const left = L.pond.left.map(([x, z]) => [sx(x, z), sy(z), z]), right = L.pond.right.map(([x, z]) => [sx(x, z), sy(z), z]);
        const outline = [...left.map(p => [p[0], p[1]]), ...right.slice().reverse().map(p => [p[0], p[1]])];
        P.set({ cls: CLS.GROUND, m: MAT.ICE, size: 8, ang: 0.02, haze: 0, foot: H });
        P.fill([0.34, 0.40, 0.58], g => poly(g, outline));
        // Blown snow on the ice, and the marks of blades.
        const g = P.alb; g.save(); g.beginPath(); poly(g, outline); g.clip();
        const r = L.pond.rink;
        for (let i = 0; i < 54; i++) { const z = 1 / P.rr(0.1, 1.2), y = sy(z); P.soft(P.rr(left[0][0] - 200 * u, W), y, P.rr(1, 4.5) * sc(z), P.rr(0.1, 0.35) * sc(z), [0.93, 0.95, 1], P.rr(0.25, 0.6)); }
        g.lineCap = 'round';
        for (let i = 0; i < 46; i++) {
            const z = P.rr(r.z0, r.z1), cx = sx(r.x + P.rr(-r.rx, r.rx), z), cy = sy(z), rad = P.rr(0.6, 3.2) * sc(z), a0 = P.rr(0, TAU);
            g.strokeStyle = 'rgba(232,240,255,0.45)'; g.lineWidth = P.rr(0.8, 1.8) * u;
            g.beginPath(); g.ellipse(cx, cy, rad, rad * 0.26, 0, a0, a0 + P.rr(0.8, 2.6)); g.stroke();
        }
        g.restore();
        // Banks: a raised lip of snow each side.
        for (const [edge, sign] of [[left, -1], [right, 1]]) for (const [x, y, z] of edge) {
            const s = sc(z);
            P.hump(x + sign * 0.7 * s, y, 1.5 * s, 0.34 * s, 0.5);
            P.set({ cls: CLS.GROUND, m: MAT.SNOW, size: 9, ang: null });
            P.fill(P.vary([0.97, 0.97, 1], 0.02), c => ell(c, x + sign * P.rr(0.3, 0.8) * s, y + P.rr(-0.05, 0.05) * s, P.rr(0.7, 1.4) * s, P.rr(0.12, 0.24) * s));
        }
        const xs = outline.map(p => p[0]), ys = outline.map(p => p[1]);
        P.spots.ice = [Math.max(0, Math.min(...xs)), Math.max(0, Math.min(...ys)), Math.min(W, Math.max(...xs)), Math.min(H, Math.max(...ys))];
    }

    // Trodden snow along every way people walk, with a low bank each side.
    function lanes(P, L) {
        const { sx, sy, sc } = P.cam, bridge = L.things.some(t => t.kind === 'bridge');
        P.set({ cls: CLS.GROUND, m: MAT.SNOW, size: 8, ang: null, haze: 0 });
        for (const [an, bn] of L.edges) {
            const a = L.nodes[an], b = L.nodes[bn];
            if (bridge && ((an === 'roadW' && bn === 'roadE') || (an === 'roadE' && bn === 'roadW'))) continue;       // the bridge carries it
            const n = Math.max(4, Math.ceil(Math.hypot(b.x - a.x, (b.z - a.z) * P.cam.zm) / 0.8));
            for (let i = 0; i <= n; i++) {
                const t = i / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, s = sc(z);
                P.fill(P.vary([0.90, 0.89, 0.97], 0.025, 0.012), g => ell(g, sx(x + P.rr(-0.3, 0.3), z), sy(z), P.rr(0.9, 1.4) * s, P.rr(0.14, 0.22) * s));
                if (i % 2 === 0) { P.hump(sx(x - 1.8, z), sy(z), 1.0 * s, 0.2 * s, 0.22); P.hump(sx(x + 1.8, z), sy(z), 1.0 * s, 0.2 * s, 0.22); }
            }
        }
    }

    // ---- Trees ------------------------------------------------------------------

    // A fir, hM metres tall. o.lights: how many bulbs it wears (in `o.set`).
    function fir(P, xm, z, hM, o = {}) {
        const { u, sx, sy, sc } = P.cam, fx = sx(xm, z), fy = sy(z), s = sc(z), h = hM * s;
        const dark = o.dark || [0.13, 0.26, 0.22], haze = o.haze || 0;
        const body = () => {
            P.set({ cls: CLS.UP, foot: fy, m: MAT.WOOD, size: fine(P, s * 0.1, 2.5, 9), ang: Math.PI / 2, haze });
            P.fill([0.20, 0.15, 0.14], g => g.rect(fx - h * 0.016, fy - h * 0.22, h * 0.032, h * 0.22));
            const tiers = Math.round(9 + hM * 0.7);
            for (let i = 0; i < tiers; i++) {
                const t = i / (tiers - 1), y = fy - h * (0.09 + 0.87 * t), half = h * (0.25 * (1 - t) ** 0.85 + 0.012);
                const n = Math.max(2, Math.round(8 * (1 - t) + 2));
                for (let k = 0; k < n; k++) {
                    const v = clamp((k / (n - 1)) * 2 - 1 + P.rr(-0.14, 0.14), -1, 1);
                    const len = half * (0.5 + 0.5 * Math.abs(v)) * P.rr(0.82, 1.12), th = half * P.rr(0.13, 0.2) + h * 0.006;
                    const tx = fx + v * len, ty = y + len * (0.30 + 0.25 * (1 - Math.abs(v))) + P.rr(-0.02, 0.02) * h;
                    const mx = fx + (tx - fx) * 0.55, my = y + (ty - y) * 0.2 - th * 0.6;
                    P.set({ cls: CLS.UP, m: MAT.FIR, ang: Math.atan2(ty - y, tx - fx), size: fine(P, s * 0.075, 2.2, 7) });
                    P.fill(P.vary(dark, 0.3, 0.02), g => { g.moveTo(fx, y - th); g.quadraticCurveTo(mx, my - th, tx, ty); g.quadraticCurveTo(mx, my + th * 2.2, fx, y + th * 1.4); g.closePath(); });
                    if (P.R() < (o.snow ?? 0.62)) {
                        P.set({ cls: CLS.TOP, m: MAT.ROOF, size: fine(P, s * 0.07, 2.2, 6), ang: 0 });
                        const rot = Math.atan2(ty - y, tx - fx);
                        for (let q = P.rr(0.25, 0.5); q < 1; q += P.rr(0.2, 0.34)) {
                            const bx = (1 - q) * (1 - q) * fx + 2 * q * (1 - q) * mx + q * q * tx, by = (1 - q) * (1 - q) * (y - th) + 2 * q * (1 - q) * (my - th) + q * q * ty;
                            P.fill(P.vary([0.94, 0.95, 1], 0.03), g => ell(g, bx, by - th * 0.3, th * P.rr(1.2, 1.9) * (1.1 - 0.5 * q), th * P.rr(0.3, 0.44) * (1.1 - 0.4 * q), Math.atan(Math.tan(rot)) * 0.45));
                        }
                    }
                }
            }
        };
        P.solid(z, fx, fy, body, { shadow: o.shadow ?? 1, reflect: o.reflect ? [fx - h * 0.3, fy - h, fx + h * 0.3, fy] : null, flat: o.flat });
        if (o.lights) {
            for (let i = 0; i < o.lights; i++) {
                const t = P.R() ** 0.8, half = h * (0.25 * (1 - t) ** 0.85) * 0.92;
                P.bulb(fx + P.rr(-1, 1) * half, fy - h * (0.12 + 0.84 * t) + P.rr(0, 0.05) * h, clamp(s * 0.035, 1.2 * u, 3.2 * u), fy, o.set || 'trees');
            }
        }
        P.hump(fx, fy, hM * 0.2 * s, hM * 0.045 * s, 0.4);
        // Somebody small lives at the foot of this one.
        if (o.mice) {
            const grp = P.group('mice', { kind: 'window', small: true }), k = s * 0.3, dx = fx + h * 0.03, dy = fy - 0.02 * s;
            P.set({ cls: CLS.UP, foot: fy, m: MAT.WOOD, size: 1.6, ang: Math.PI / 2, haze: 0 });
            P.fill([0.22, 0.15, 0.12], g => { g.moveTo(dx - 0.62 * k, dy); g.lineTo(dx - 0.62 * k, dy - 1.0 * k); g.arc(dx, dy - 1.0 * k, 0.62 * k, Math.PI, TAU); g.lineTo(dx + 0.62 * k, dy); g.closePath(); });
            P.set({ m: MAT.FIG }); P.fill([0.62, 0.16, 0.14], g => { g.moveTo(dx - 0.45 * k, dy); g.lineTo(dx - 0.45 * k, dy - 1.0 * k); g.arc(dx, dy - 1.0 * k, 0.45 * k, Math.PI, TAU); g.lineTo(dx + 0.45 * k, dy); g.closePath(); });
            const wx = dx + 1.25 * k, wy = dy - 0.95 * k;
            P.set({ m: MAT.WOOD }); P.fill([0.22, 0.15, 0.12], g => ell(g, wx, wy, 0.46 * k, 0.46 * k));
            P.set({ cls: CLS.SELF, m: MAT.GLASS, size: 1.4 }); P.fill('#ffd67a', g => ell(g, wx, wy, 0.34 * k, 0.34 * k));
            P.glowEll(grp, 'rgba(255,200,110,0.95)', wx, wy, 0.34 * k, 0.34 * k);
            P.set({ cls: CLS.UP, m: MAT.WOOD, size: 1.4 }); P.fill([0.22, 0.15, 0.12], g => { g.rect(wx - 0.03 * k, wy - 0.34 * k, 0.06 * k, 0.68 * k); g.rect(wx - 0.34 * k, wy - 0.03 * k, 0.68 * k, 0.06 * k); });
            P.set({ cls: CLS.TOP, m: MAT.ROOF, size: 1.6 }); P.fill(SNOW, g => { ell(g, dx, dy - 1.66 * k, 0.7 * k, 0.16 * k); ell(g, wx, wy - 0.5 * k, 0.5 * k, 0.12 * k); });
            P.light(grp, { x: xm + (wx - fx) / s, y: 0.28, z, c: WINDOW, I: 0.5, r2: 0.05, out: 0.25 });
            P.halo(grp, wx, wy, 0.5 * k);
            P.smoke(dx - 0.9 * k, dy - 2.3 * k, s * 0.12, z);
            P.spots.mice = { x: wx, y: wy, k };
            P.hit('mice', dx - 1.2 * k, dy - 2 * k, wx + 0.8 * k, dy, { group: grp });
        }
    }

    // A bare maple, every twig thick with frost.
    function frostTree(P, xm, z, hM, o = {}) {
        const { sx, sy, sc } = P.cam, fx = sx(xm, z), fy = sy(z), s = sc(z), haze = o.haze ?? clamp((z - 4.5) * 0.03, 0, 0.2);
        const tint = o.tint || [0.86, 0.76, 0.88];
        const grow = () => {
            const segs = [], frost = [];
            const branch = (x, y, a, len, w, d) => {
                const x2 = x + Math.cos(a) * len, y2 = y - Math.sin(a) * len;
                segs.push([x, y, x2, y2, w]);
                if (d >= 2) frost.push([x2, y2, len * P.rr(0.55, 1.0)]);
                if (d >= 3) frost.push([(x + x2) / 2 + P.rr(-0.2, 0.2) * len, (y + y2) / 2 + P.rr(-0.2, 0.2) * len, len * P.rr(0.4, 0.7)]);
                if (d < 5) { const n = d < 1 ? 3 : 2 + (P.R() < 0.45 ? 1 : 0); for (let k = 0; k < n; k++) branch(x2, y2, clamp(a + P.rr(-0.8, 0.8), 0.25, Math.PI - 0.25), len * P.rr(0.6, 0.8), w * 0.6, d + 1); }
            };
            branch(fx, fy, Math.PI / 2 + P.rr(-0.08, 0.08), hM * s * 0.3, hM * s * 0.034, 0);
            return { segs, frost };
        };
        const wood = t => { P.set({ cls: CLS.UP, foot: fy, m: MAT.WOOD, size: fine(P, s * 0.05, 2, 4), ang: Math.PI / 2, haze }); for (const [x, y, x2, y2, w] of t.segs) P.line([0.26, 0.20, 0.24], Math.max(0.8, w), g => { g.moveTo(x, y); g.lineTo(x2, y2); }); };
        const blobs = (t, from, to) => { for (let i = from; i < to; i++) { const [x, y, r] = t.frost[i]; P.set({ cls: CLS.UP, foot: fy, m: MAT.FROST, size: fine(P, s * 0.07, 2.2, 4.5), ang: null, haze }); P.fill(P.vary(tint, 0.07, 0.035), g => ell(g, x, y, r, r * 0.62, P.rr(-0.4, 0.4))); } };
        P.solid(z, fx, fy, () => { const t = grow(), cut = Math.floor(t.frost.length * 0.6); blobs(t, 0, cut); wood(t); blobs(t, cut, t.frost.length); },
            { shadowOf: () => wood(grow()), flat: z > 6 });
    }

    // The grand tree on the green: bulbs to the top, a star, parcels at its foot.
    function grandTree(P, t, config) {
        const { sx, sy, sc } = P.cam, fx = sx(t.x, t.z), fy = sy(t.z), s = sc(t.z), h = t.h * s;
        const grp = P.group('tree', { kind: 'tree' });
        fir(P, t.x, t.z, t.h, { lights: config.lights === false ? 0 : Math.round(150 * (t.h / 9.5)), set: 'tree', snow: 0.5, dark: [0.10, 0.24, 0.17], reflect: true });
        // The star.
        const ty = fy - h * 1.0, r = 0.42 * s;
        P.set({ cls: CLS.SELF, m: MAT.GLASS, size: 1.6, ang: null, foot: fy, haze: 0 });
        P.fill('#fff0b0', g => { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * 0.44 : r; g[i ? 'lineTo' : 'moveTo'](fx + Math.cos(a) * rad, ty + Math.sin(a) * rad); } g.closePath(); });
        P.glowEll(grp, 'rgba(255,226,140,0.95)', fx, ty, r * 0.8, r * 0.8);
        P.halo(grp, fx, ty, r * 1.3);
        P.light(grp, { x: t.x, y: t.h * 0.3, z: t.z, c: [1, 0.78, 0.5], I: 10, r2: 1.6, out: 1.4 });
        P.light(grp, { x: t.x, y: t.h * 1.0, z: t.z, c: [1, 0.86, 0.6], I: 2.5, r2: 0.6 });
        // Parcels, half under the snow.
        for (let i = 0; i < 7; i++) {
            const px = fx + P.rr(-0.2, 0.2) * h, w = P.rr(0.5, 0.9) * s, hh = P.rr(0.35, 0.6) * s, col = P.pick([[0.72, 0.14, 0.14], [0.16, 0.36, 0.56], [0.86, 0.66, 0.2], [0.2, 0.46, 0.28], [0.56, 0.2, 0.5]]);
            P.set({ cls: CLS.UP, foot: fy, m: MAT.FIG, size: 2, ang: Math.PI / 2 });
            P.fill(col, g => g.rect(px - w / 2, fy - hh, w, hh));
            P.fill([0.95, 0.9, 0.7], g => { g.rect(px - w * 0.07, fy - hh, w * 0.14, hh); g.rect(px - w / 2, fy - hh * 0.6, w, hh * 0.14); });
            P.set({ cls: CLS.TOP, m: MAT.ROOF, size: 2.4 }); P.fill(SNOW, g => ell(g, px, fy - hh, w * 0.55, hh * 0.18));
        }
        P.spots.tree = { x: t.x, z: t.z, h: t.h, fx, fy, r: t.h * 0.34, group: grp, top: ty };
        P.hit('tree', fx - h * 0.27, fy - h * 1.05, fx + h * 0.27, fy, { group: grp });
    }

    // Boughs of a fir we stand under, across a top corner.
    function boughs(P, side) {
        const { W, H, u } = P.cam, x0 = side > 0 ? W + 30 * u : -30 * u;
        const body = () => {
            for (let i = 0; i < 9; i++) {
                const y = (-30 + i * 34 + P.rr(-8, 8)) * u, len = (330 - i * 26 + P.rr(-20, 20)) * u * clamp(W / (1600 * u), 0.4, 1.2), th = (20 - i * 0.9) * u, droop = (70 + i * 9) * u;
                const tx = x0 - side * len, ty = y + droop, mx = x0 - side * len * 0.5, my = y + droop * 0.1;
                P.set({ cls: CLS.UP, foot: H, m: MAT.FIR, size: 6, ang: Math.atan2(ty - y, tx - x0), haze: 0 });
                P.fill(P.vary([0.08, 0.17, 0.16], 0.25, 0.02), g => { g.moveTo(x0, y - th); g.quadraticCurveTo(mx, my - th, tx, ty); g.quadraticCurveTo(mx, my + th * 2.4, x0, y + th * 1.6); g.closePath(); });
                P.set({ cls: CLS.TOP, m: MAT.ROOF, size: 5, ang: 0 });
                for (let q = 0.12; q < 0.9; q += P.rr(0.13, 0.2)) {
                    const bx = (1 - q) * (1 - q) * x0 + 2 * q * (1 - q) * mx + q * q * tx, by = (1 - q) * (1 - q) * (y - th) + 2 * q * (1 - q) * (my - th) + q * q * ty;
                    P.fill(P.vary([0.93, 0.94, 1], 0.03), g => ell(g, bx, by - th * 0.2, th * P.rr(1.3, 2.0) * (1.1 - 0.5 * q), th * P.rr(0.3, 0.42), -side * 0.25));
                }
            }
        };
        P.solid(0.9, x0, H, body, { shadow: 0, flat: true });
    }

    // ---- Lamps, fences, the snowman, the fire ---------------------------------------

    // A lantern's glass and its light, on something already drawn.
    function lantern(P, grp, x, y, s, at, I) {
        P.set({ cls: CLS.UP, m: MAT.WOOD, size: 2, ang: Math.PI / 2 });
        P.fill([0.10, 0.10, 0.12], g => g.rect(x - 0.13 * s, y - 0.2 * s, 0.26 * s, 0.4 * s));
        P.set({ cls: CLS.SELF, m: MAT.GLASS, size: 2 });
        P.fill([1, 0.93, 0.66], g => g.rect(x - 0.09 * s, y - 0.15 * s, 0.18 * s, 0.3 * s));
        P.glowEll(grp, 'rgba(255,214,130,1)', x, y, 0.2 * s, 0.24 * s);
        P.set({ cls: CLS.TOP, m: MAT.ROOF, size: 2 }); P.fill(SNOW, g => ell(g, x, y - 0.25 * s, 0.2 * s, 0.09 * s));
        P.light(grp, { x: at.x, y: at.y, z: at.z, c: LAMP, I, r2: 0.4, out: 0.5 });
        P.halo(grp, x, y, s * 0.55 * Math.sqrt(I / 6));
    }

    function lamp(P, at, i) {
        const { sx, sy, sc } = P.cam, fx = sx(at.x, at.z), fy = sy(at.z), s = sc(at.z);
        const grp = P.group('lamp' + i, { kind: 'lamp', x: at.x, z: at.z });
        const post = () => {
            P.set({ cls: CLS.UP, foot: fy, m: MAT.WOOD, size: 2, ang: Math.PI / 2, haze: 0 });
            P.fill([0.10, 0.11, 0.14], g => { g.rect(fx - 0.06 * s, fy - 3.0 * s, 0.12 * s, 3.0 * s); g.rect(fx - 0.14 * s, fy - 0.5 * s, 0.28 * s, 0.5 * s); g.rect(fx - 0.3 * s, fy - 2.5 * s, 0.6 * s, 0.05 * s); });
        };
        P.solid(at.z, fx, fy, post, { reflect: [fx - 0.4 * s, fy - 3.6 * s, fx + 0.4 * s, fy] });
        lantern(P, grp, fx, fy - 3.25 * s, s * 1.35, { x: at.x, y: 3.25, z: at.z }, 22);
        P.set({ cls: CLS.UP, m: MAT.FIR, size: 2 }); P.line([0.12, 0.30, 0.18], 0.13 * s, g => g.arc(fx, fy - 2.25 * s, 0.22 * s, 0, TAU));
        P.set({ m: MAT.FIG }); P.fill([0.80, 0.12, 0.10], g => ell(g, fx, fy - 2.02 * s, 0.1 * s, 0.07 * s));
        P.hump(fx, fy, 0.7 * s, 0.16 * s, 0.4);
        P.hit('lamp', fx - 0.6 * s, fy - 3.8 * s, fx + 0.6 * s, fy, { group: grp });
        return grp;
    }

    // Split rails, from o.from to o.to ([x metres, depth]); a place for a bird.
    function railFence(P, o) {
        const { sx, sy, sc, zm } = P.cam, [x0, z0] = o.from, [x1, z1] = o.to;
        const n = Math.max(2, Math.round(Math.hypot(x1 - x0, (z1 - z0) * zm) / 2.6)), posts = [];
        for (let i = 0; i <= n; i++) { const t = i / n, z = z0 + (z1 - z0) * t; posts.push([x0 + (x1 - x0) * t, z]); }
        for (let i = posts.length - 1; i >= 0; i--) {
            const [x, z] = posts[i], fx = sx(x, z), fy = sy(z), s = sc(z), nx = posts[i + 1];
            const body = () => {
                P.set({ cls: CLS.UP, foot: fy, m: MAT.WOOD, size: fine(P, s * 0.05, 2, 4), ang: 0.05, haze: 0 });
                if (nx) for (const hgt of [0.5, 0.95]) {
                    const ex = sx(nx[0], nx[1]), ey = sy(nx[1]) - hgt * sc(nx[1]);
                    P.line(P.vary([0.34, 0.27, 0.24], 0.12), 0.12 * s, g => { g.moveTo(fx, fy - hgt * s); g.lineTo(ex, ey); });
                    P.set({ cls: CLS.TOP, m: MAT.ROOF, size: fine(P, s * 0.05, 2, 4), ang: 0 });
                    P.line(SNOW, 0.07 * s, g => { g.moveTo(fx, fy - (hgt + 0.08) * s); g.lineTo(ex, ey - 0.08 * sc(nx[1])); });
                    P.set({ cls: CLS.UP, m: MAT.WOOD, ang: 0.05 });
                }
                P.set({ ang: Math.PI / 2 });
                P.fill(P.vary([0.30, 0.24, 0.22], 0.12), g => g.rect(fx - 0.09 * s, fy - 1.2 * s, 0.18 * s, 1.2 * s));
                P.set({ cls: CLS.TOP, m: MAT.ROOF, size: fine(P, s * 0.05, 2, 4), ang: 0 });
                P.fill(SNOW, g => ell(g, fx, fy - 1.22 * s, 0.17 * s, 0.1 * s));
            };
            P.solid(z, fx, fy, body, { shadow: 0.8 });
            P.hump(fx, fy, 0.9 * s, 0.2 * s, 0.35);
        }
        const perch = posts[Math.min(posts.length - 1, 2)];
        if (o.cardinal) P.spots.cardinal = { x: perch[0], z: perch[1], y: 1.3 };
        if (o.rabbits) { const p = posts[Math.min(posts.length - 1, 1)]; P.spots.rabbits = { x: p[0] + 0.8, z: p[1] + 0.1 }; }
    }

    // White pickets along the front of a yard, with a gap for the gate.
    function picketFence(P, t) {
        const { sx, sy, sc } = P.cam, z = t.z, fy = sy(z), s = sc(z);
        const run = (a, b) => {
            const body = () => {
                P.set({ cls: CLS.UP, foot: fy, m: MAT.WALL, size: fine(P, s * 0.04, 1.6, 3), ang: Math.PI / 2, haze: 0 });
                for (let x = a; x <= b; x += 0.22) P.fill(P.vary([0.74, 0.74, 0.84], 0.05), g => { const px = sx(x, z); g.moveTo(px - 0.05 * s, fy); g.lineTo(px - 0.05 * s, fy - 0.86 * s); g.lineTo(px, fy - 0.98 * s); g.lineTo(px + 0.05 * s, fy - 0.86 * s); g.lineTo(px + 0.05 * s, fy); g.closePath(); });
                P.fill([0.66, 0.66, 0.78], g => { g.rect(sx(a, z), fy - 0.72 * s, (b - a) * s, 0.06 * s); g.rect(sx(a, z), fy - 0.3 * s, (b - a) * s, 0.06 * s); });
                P.set({ cls: CLS.TOP, m: MAT.ROOF, size: 2.2, ang: 0 });
                for (let x = a; x <= b; x += 0.22) if (P.R() < 0.7) P.fill(SNOW, g => ell(g, sx(x, z), fy - 0.98 * s, 0.08 * s, 0.05 * s));
            };
            P.solid(z, sx((a + b) / 2, z), fy, body, { shadow: 0.7 });
            for (let x = a; x <= b; x += 1.2) P.hump(sx(x, z), fy, 1.0 * s, 0.2 * s, 0.3);
        };
        run(t.from, t.gate - 0.9); run(t.gate + 0.9, t.to);
        // Gate posts, each with a ball of snow.
        for (const x of [t.gate - 0.9, t.gate + 0.9]) {
            P.solid(z, sx(x, z), fy, () => {
                P.set({ cls: CLS.UP, foot: fy, m: MAT.WALL, size: 2, ang: Math.PI / 2, haze: 0 }); P.fill([0.86, 0.85, 0.9], g => g.rect(sx(x, z) - 0.09 * s, fy - 1.15 * s, 0.18 * s, 1.15 * s));
                P.set({ cls: CLS.TOP, m: MAT.ROOF, size: 2.2 }); P.fill(SNOW, g => ell(g, sx(x, z), fy - 1.2 * s, 0.16 * s, 0.11 * s));
            }, { shadow: 0.7 });
        }
    }

    // The snowman, without a face: that is drawn each frame, so that he can look round.
    function snowman(P, t) {
        const { sx, sy, sc } = P.cam, fx = sx(t.x, t.z), fy = sy(t.z), s = sc(t.z), X = x => fx + x * s, Y = y => fy - y * s;
        P.solid(t.z, fx, fy, () => {
            P.set({ cls: CLS.TOP, foot: fy, m: MAT.ROOF, size: 3.2, ang: null, haze: 0 });
            P.fill(SNOW, g => { ell(g, X(0), Y(0.42), 0.52 * s, 0.46 * s); ell(g, X(0), Y(1.06), 0.38 * s, 0.34 * s); ell(g, X(0), Y(1.55), 0.26 * s, 0.24 * s); });
            P.set({ cls: CLS.UP, m: MAT.FIG, size: 1.6, ang: null });
            P.fill([0.10, 0.10, 0.13], g => { g.rect(X(-0.2), Y(2.12), 0.4 * s, 0.36 * s); g.rect(X(-0.32), Y(1.8), 0.64 * s, 0.06 * s); for (const y of [0.9, 1.08, 1.24]) ell(g, X(0), Y(y), 0.035 * s, 0.035 * s); });
            P.line([0.26, 0.18, 0.14], 0.035 * s, g => { g.moveTo(X(-0.34), Y(1.12)); g.lineTo(X(-0.82), Y(1.5)); g.moveTo(X(0.34), Y(1.12)); g.lineTo(X(0.8), Y(1.42)); });
        }, { reflect: [X(-0.9), Y(2.2), X(0.9), fy] });
        P.set({ cls: CLS.TOP, m: MAT.ROOF, size: 2.4 }); P.fill(SNOW, g => ell(g, X(0), Y(2.14), 0.22 * s, 0.07 * s));
        P.spots.snowman = { x: t.x, z: t.z, fx, fy, s };
        P.hit('snowman', X(-0.7), Y(2.3), X(0.7), fy);
    }

    // The fire on the bank: stones, logs, and its light. The flames are the cast's.
    function bonfire(P, t) {
        const { sx, sy, sc } = P.cam, fx = sx(t.x, t.z), fy = sy(t.z), s = sc(t.z);
        const grp = P.group('fire', { kind: 'fire' });
        P.set({ cls: CLS.GROUND, m: MAT.SNOW, size: 4, ang: null, foot: fy, haze: 0 });
        P.fill([0.62, 0.58, 0.62], g => ell(g, fx, fy, 1.15 * s, 0.3 * s));                    // thawed and trodden round it
        P.solid(t.z, fx, fy, () => {
            P.set({ cls: CLS.UP, foot: fy, m: MAT.STONE, size: 2.4, ang: null, haze: 0 });
            for (let a = 0; a < TAU; a += 0.5) P.fill(P.vary([0.42, 0.40, 0.42], 0.15), g => ell(g, fx + Math.cos(a) * 0.62 * s, fy + Math.sin(a) * 0.17 * s - 0.06 * s, 0.14 * s, 0.1 * s));
            P.set({ m: MAT.WOOD, size: 2.4, ang: 0.4 });
            for (const [a, b] of [[-0.5, 0.42], [0.5, -0.4], [-0.15, 0.5], [0.2, -0.5]]) P.line(P.vary([0.20, 0.13, 0.10], 0.2), 0.13 * s, g => { g.moveTo(fx + a * s, fy - 0.04 * s); g.lineTo(fx + b * 0.3 * s, fy - 0.62 * s); });
        }, { shadow: 0, reflect: [fx - s, fy - s, fx + s, fy] });
        // A log to sit on.
        const lx = fx - 2.1 * s, ly = fy + 0.02 * s;
        P.solid(t.z + 0.01, lx, ly, () => {
            P.set({ cls: CLS.UP, foot: ly, m: MAT.WOOD, size: 2.6, ang: 0, haze: 0 }); P.fill([0.26, 0.19, 0.16], g => g.rect(lx - 0.9 * s, ly - 0.42 * s, 1.8 * s, 0.42 * s));
            P.set({ cls: CLS.TOP, m: MAT.ROOF, size: 2.6 }); P.fill(SNOW, g => ell(g, lx, ly - 0.44 * s, 0.92 * s, 0.1 * s));
        }, { shadow: 0.5 });
        P.light(grp, { x: t.x, y: 0.5, z: t.z, c: [1, 0.52, 0.18], I: 12, r2: 0.5, out: 0 });
        P.spots.fire = { x: t.x, z: t.z, fx, fy, s, group: grp };
        P.hit('fire', fx - 1.2 * s, fy - 1.6 * s, fx + 1.2 * s, fy + 0.3 * s, { group: grp });
    }

    // ---- The whole underpainting --------------------------------------------------

    function compose(P, L, config) {
        const { cam } = P;
        P.sky(cam.hor + 12);
        mountains(P, L, config); farWoods(P, L); ground(P);
        P.add(100, () => { pond(P, L); lanes(P, L); });
        L.lamps.forEach((at, i) => P.add(at.z, () => lamp(P, at, i)));
        for (const t of L.things) {
            const B = PaintedBuildings;
            const draw = {
                fir: () => fir(P, t.x, t.z, t.h, { mice: t.mice, shadow: t.z > 5 ? 0.5 : 1, lights: t.lit ? 26 : 0, haze: clamp((t.z - 5) * 0.03, 0, 0.2) }),
                frostTree: () => frostTree(P, t.x, t.z, t.h),
                grandTree: () => grandTree(P, t, config),
                boughs: () => boughs(P, t.side),
                railFence: () => railFence(P, t),
                picketFence: () => picketFence(P, t),
                snowman: () => snowman(P, t),
                bonfire: () => bonfire(P, t),
                store: () => B.store(P, t, config), house: () => B.house(P, t, config), church: () => B.church(P, t, config),
                bridge: () => B.bridge(P, t, config), farHouse: () => B.farHouse(P, t, config),
            }[t.kind];
            if (draw) P.add(t.kind === 'railFence' ? 1.5 : t.z, draw);
        }
        P.run();
    }

    return { compose, fir, frostTree, lantern, fine, SNOW, LAMP, WINDOW };
})();
