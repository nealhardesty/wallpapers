// The Reading Room's underpainting (SPEC §10.42): the whole hall, filled
// into Painted Village's plates (painted-plates.js) in metres through the
// Reading Room's camera, for painted-bake.js to brush and light. Far to
// near: the north wall and its great window and clock, the coffered vault
// and its skylights, the floor and its runner, then bay by bay the
// bookcases on two levels, the galleries and their iron rails, the
// clerestory, the piers; then the tables and their lamps and chairs, the
// fireplace, the busts and globes, the card catalogue, the desk, the
// chandeliers, the ladders, and in December the tree and the garlands.
// Every lamp, chandelier and the fire is a group of lights (a patch each),
// so each can go on and off by itself.

const ReadingArt = (() => {
    const { CLS } = PaintedLogic;
    const { MAT, poly, mixc } = PaintedPlates;
    const RL = ReadingLogic, R = RL.ROOM, TAU = Math.PI * 2;

    const C = {
        walnut: [0.29, 0.17, 0.1], walnutLight: [0.42, 0.27, 0.15], oak: [0.55, 0.36, 0.19], oakPale: [0.66, 0.47, 0.27], back: [0.12, 0.07, 0.05],
        plaster: [0.84, 0.77, 0.64], stone: [0.78, 0.72, 0.62], marble: [0.88, 0.85, 0.79], cream: [0.9, 0.84, 0.7], rib: [0.8, 0.72, 0.56],
        coffer: [0.6, 0.5, 0.38], cofferDeep: [0.42, 0.33, 0.26], gilt: [0.88, 0.67, 0.27], giltDark: [0.62, 0.44, 0.16], iron: [0.09, 0.08, 0.08],
        floor: [0.56, 0.37, 0.2], floorDark: [0.44, 0.28, 0.15], runner: [0.46, 0.09, 0.1], runnerEdge: [0.78, 0.6, 0.26], leather: [0.14, 0.27, 0.19],
        brass: [0.82, 0.62, 0.28], seat: [0.48, 0.12, 0.1], paper: [0.93, 0.89, 0.78], lead: [0.18, 0.16, 0.16], door: [0.34, 0.2, 0.11],
    };
    const BOOKS = [[0.5, 0.11, 0.09], [0.13, 0.29, 0.19], [0.12, 0.16, 0.33], [0.62, 0.45, 0.26], [0.35, 0.2, 0.11], [0.68, 0.5, 0.18], [0.11, 0.1, 0.1], [0.8, 0.74, 0.6], [0.11, 0.34, 0.36], [0.33, 0.14, 0.26], [0.56, 0.24, 0.12], [0.24, 0.3, 0.12]];
    const SHADES = { green: [0.1, 0.5, 0.26], amber: [0.86, 0.56, 0.16], ruby: [0.62, 0.08, 0.1], blue: [0.14, 0.3, 0.66], milk: [0.9, 0.86, 0.74] };
    const LAMP = { green: [1, 0.8, 0.5], amber: [1, 0.72, 0.38], ruby: [1, 0.6, 0.42], blue: [0.9, 0.82, 0.72], milk: [1, 0.86, 0.62] };

    function compose(P, L, cfg) {
        const cam = P.cam, W = cam.W;
        const pr = (x, y, D) => cam.p(x, y, Math.max(D, 0.5));
        const quad = pts => g => poly(g, pts.map(q => pr(q[0], q[1], q[2])));
        const set = (D, cls, m, size, ang = null) => P.set({ foot: cam.foot(Math.max(D, 0.5)), cls, m, size, ang, haze: 0 });
        const vp = (x, y) => Math.atan2(cam.hor - y, W / 2 - x);                      // the way to the vanishing point
        const rr = (a, b) => P.rr(a, b), pick = a => P.pick(a);
        const onScreen = (pts, pad = 20) => { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const q of pts) { const [x, y] = pr(q[0], q[1], q[2]); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return x1 > -pad && x0 < W + pad && y1 > -pad && y0 < cam.H + pad; };
        const wallCls = side => side > 0 ? CLS.SIDEL : CLS.SIDER;
        const shade = SHADES[cfg.shades] || SHADES.green, bulbC = LAMP[cfg.shades] || LAMP.green;
        const xmas = !!L.tree || RL.christmas(cfg.decorations, cfg.date);
        P.windows = []; P.shelves = [];

        // ---- The north wall ------------------------------------------------------
        {
            const D = R.len, end = [];
            for (let i = 0; i <= 24; i++) { const x = -R.hw + 2 * R.hw * i / 24; end.push([x, RL.vaultY(x), D]); }
            set(D, CLS.UP, MAT.WALL, 6, Math.PI / 2);
            P.fill(C.plaster, quad([[-R.hw, 0, D], ...end, [R.hw, 0, D]]));
            // The great window: tracery, and the sky in it.
            const win = RL.windows().find(w => w.kind === 'north');
            set(D, CLS.UP, MAT.STONE, 2.4, Math.PI / 2);
            P.fill(C.stone, quad(win.pts.map(([x, y, z]) => [x * 1.08, y + (y > 13 ? 0.4 : -0.3), z])));
            glass(win.pts, D);
            set(D, CLS.UP, MAT.STONE, 1.4, Math.PI / 2);
            for (const x of [-3.4, -1.1, 1.1, 3.4]) P.fill(C.stone, quad([[x - 0.09, 11.6, D], [x - 0.09, 19.5 + (2.2 - Math.abs(x)) * 0.9, D], [x + 0.09, 19.5 + (2.2 - Math.abs(x)) * 0.9, D], [x + 0.09, 11.6, D]]));
            P.fill(C.stone, quad([[-5.6, 15.4, D], [-5.6, 15.6, D], [5.6, 15.6, D], [5.6, 15.4, D]]));
            const rose = []; for (let i = 0; i < 20; i++) { const a = i / 20 * TAU; rose.push([Math.cos(a) * 2.2, 20.6 + Math.sin(a) * 2.2, D]); }
            P.line(C.stone, Math.max(1, 0.16 * cam.mpx(D)), g => poly(g, rose.map(q => pr(...q))));
            for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; P.line(C.stone, Math.max(0.8, 0.1 * cam.mpx(D)), g => { const [x0, y0] = pr(0, 20.6, D), [x1, y1] = pr(Math.cos(a) * 2.2, 20.6 + Math.sin(a) * 2.2, D); g.moveTo(x0, y0); g.lineTo(x1, y1); }); }
            P.hit('window', ...box(win.pts.map(q => pr(...q))), { which: 'north' });
            // Bookcases either side of the door on both levels, and the galleries across.
            for (const [x0, x1] of [[-R.hw, -2.6], [2.6, R.hw]]) { endCase(x0, x1, 0.15, 5.35, D); endCase(x0, x1, 6.0, 11.0, D); }
            set(D - 1.5, CLS.UP, MAT.WOOD, 2, 0);
            for (const [y0, y1] of [[5.35, 6.0], [11.0, 11.4]]) P.fill(C.walnutLight, quad([[-R.hw, y0, D - 1.5], [-R.hw, y1, D - 1.5], [R.hw, y1, D - 1.5], [R.hw, y0, D - 1.5]]));
            rail(-R.hw, R.hw, D - 1.5, 6.0, 'across'); rail(-R.hw, R.hw, D - 1.2, 11.4, 'across');
            // The door: an arch of stone, two leaves of oak, and a fanlight.
            set(D, CLS.UP, MAT.STONE, 2.4, Math.PI / 2);
            const door = [[-2.6, 0, D], [-2.6, 4.2, D], ...Array.from({ length: 9 }, (_, i) => { const a = Math.PI - Math.PI * (i + 1) / 10; return [Math.cos(a) * 2.6, 4.2 + Math.sin(a) * 2.6, D]; }), [2.6, 4.2, D], [2.6, 0, D]];
            P.fill(C.stone, quad(door));
            set(D, CLS.UP, MAT.WOOD, 1.8, Math.PI / 2);
            P.fill(C.door, quad(door.map(([x, y, z]) => [x * 0.8, y * 0.92, z])));
            for (const x of [-1.05, 1.05]) for (const y of [0.6, 2.4]) P.fill(mixc(C.door, C.back, 0.4), quad([[x - 0.75, y, D], [x - 0.75, y + 1.4, D], [x + 0.75, y + 1.4, D], [x + 0.75, y, D]]));
            P.fill(C.brass, quad([[-0.2, 1.9, D], [-0.2, 2.15, D], [0.2, 2.15, D], [0.2, 1.9, D]]));
            // The great clock, over the door, between the galleries.
            const cy = 8.55, r = 1.9;
            set(D - 0.2, CLS.UP, MAT.WOOD, 1.6, Math.PI / 2);
            P.fill(C.walnut, g => { const [x, y] = pr(0, cy, D - 0.2), s = cam.mpx(D - 0.2); g.ellipse(x, y, (r + 0.45) * s, (r + 0.45) * s, 0, 0, TAU); });
            P.fill(C.gilt, g => { const [x, y] = pr(0, cy, D - 0.2), s = cam.mpx(D - 0.2); g.ellipse(x, y, (r + 0.16) * s, (r + 0.16) * s, 0, 0, TAU); });
            P.fill(C.paper, g => { const [x, y] = pr(0, cy, D - 0.2), s = cam.mpx(D - 0.2); g.ellipse(x, y, r * s, r * s, 0, 0, TAU); });
            const [kx, ky] = pr(0, cy, D - 0.2), ks = cam.mpx(D - 0.2);
            for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; P.line(C.iron, Math.max(0.7, 0.07 * ks), g => { g.moveTo(kx + Math.sin(a) * r * 0.78 * ks, ky - Math.cos(a) * r * 0.78 * ks); g.lineTo(kx + Math.sin(a) * r * 0.92 * ks, ky - Math.cos(a) * r * 0.92 * ks); }); }
            P.spots.clock = { x: kx, y: ky, r: r * ks, D: D - 0.2 };
            P.hit('clock', kx - r * ks, ky - r * ks, kx + r * ks, ky + r * ks);
            if (xmas) { wreath(0, cy, D - 0.3, r + 0.75); wreath(0, 5.4, D - 0.1, 0.9); }
        }

        // ---- The vault -------------------------------------------------------------
        // Coffers across it in rows, a gilt rib over every pier, a skylight in the crown of each bay.
        {
            const bands = 12, th = i => i / bands * Math.PI, at = (t, z) => [R.hw * Math.cos(t), R.spring + R.vault * Math.sin(t), z];
            for (let k = R.bays - 1; k >= 0; k--) {
                const z0 = RL.pierZ(k), z1 = RL.pierZ(k + 1);
                for (let j = 0; j < 4; j++) {
                    const za = z0 + 0.4 + j * (R.bay - 0.8) / 4, zb = za + (R.bay - 0.8) / 4, Dm = (za + zb) / 2;
                    for (let i = 0; i < bands; i++) {
                        const ta = th(i), tb = th(i + 1), crown = i >= bands / 2 - 1 && i < bands / 2 + 1 && (j === 1 || j === 2);
                        const pts = [at(ta, za), at(tb, za), at(tb, zb), at(ta, zb)];
                        if (!onScreen(pts, 4)) continue;
                        set(Dm, CLS.UP, MAT.WALL, 6, vp(...pr(...at((ta + tb) / 2, Dm))));
                        P.fill(P.vary(C.rib, 0.05), quad(pts));
                        if (crown) continue;
                        const inset = (p, q, t) => p.map((v, m) => v + (q[m] - v) * t), mid = [(pts[0][0] + pts[2][0]) / 2, (pts[0][1] + pts[2][1]) / 2, (pts[0][2] + pts[2][2]) / 2];
                        set(Dm, CLS.UP, MAT.WALL, 4.6, vp(...pr(...mid)));
                        P.fill(C.coffer, quad(pts.map(p => inset(p, mid, 0.2))));
                        P.fill(C.cofferDeep, quad(pts.map(p => inset(p, mid, 0.42))));
                        const [rx, ry] = pr(...mid), s = cam.mpx(Dm) * 0.22;
                        if (s > 1.2) { set(Dm, CLS.UP, MAT.STONE, 3); P.fill(C.gilt, g => g.ellipse(rx, ry, s, s * 0.7, 0, 0, TAU)); }
                    }
                }
                // The skylight: a ring of gilt, and the sky through it.
                const zc = RL.bayZ(k), oc = RL.windows().find(w => w.kind === 'oculus' && w.k === k);
                set(zc, CLS.UP, MAT.STONE, 2, null);
                P.fill(C.gilt, quad(oc.pts.map(([x, y, z]) => [x * 1.35, y - 0.05, zc + (z - zc) * 1.35])));
                glass(oc.pts, zc);
                P.line(C.lead, Math.max(0.7, 0.06 * cam.mpx(zc)), g => { const a = pr(-R.oculus, R.apex, zc), b = pr(R.oculus, R.apex, zc), c = pr(0, R.apex, zc - R.oculus), d = pr(0, R.apex, zc + R.oculus); g.moveTo(...a); g.lineTo(...b); g.moveTo(...c); g.lineTo(...d); });
                // The rib over the pier in front of this bay.
                const ribZ = RL.pierZ(k), rib = [];
                for (let i = 0; i <= 24; i++) rib.push(at(i / 24 * Math.PI, ribZ - 0.4));
                for (let i = 24; i >= 0; i--) rib.push(at(i / 24 * Math.PI, ribZ + 0.4));
                if (ribZ > 2 && onScreen(rib)) { set(ribZ, CLS.UP, MAT.STONE, 2.2, null); P.fill(C.cream, quad(rib)); P.line(C.giltDark, Math.max(0.6, 0.08 * cam.mpx(ribZ)), g => poly(g, rib.slice(0, 25).map(q => pr(...q)))); }
            }
        }

        // ---- The floor -------------------------------------------------------------
        {
            const near = 1.2, far = R.len;
            P.set({ foot: cam.H, cls: CLS.GROUND, m: MAT.WOOD, size: 4, ang: null, haze: 0 });
            for (let x = -R.hw; x < R.hw - 0.01; x += 0.5) {
                const [ax, ay] = pr(x + 0.25, 0, 12), ang = vp(ax, ay);
                P.set({ ang });
                for (let z = near, z2; z < far; z = z2) {
                    z2 = Math.min(far, z + rr(2.5, 5));
                    P.fill(P.vary(Math.round(x * 2) % 2 ? C.floor : C.floorDark, 0.08, 0.02), quad([[x, 0, z], [x, 0, z2], [x + 0.5, 0, z2], [x + 0.5, 0, z]]));
                }
            }
            // The runner down the middle aisle, and the hearth rug.
            P.set({ m: MAT.WALL, size: 4.2, ang: Math.PI / 2 });
            P.fill(C.runnerEdge, quad([[-1.55, 0, near], [-1.55, 0, far - 1.2], [1.55, 0, far - 1.2], [1.55, 0, near]]));
            P.fill(C.runner, quad([[-1.38, 0, near], [-1.38, 0, far - 1.4], [1.38, 0, far - 1.4], [1.38, 0, near]]));
            for (let z = 5; z < far - 3; z += 4.5) P.fill(mixc(C.runner, C.runnerEdge, 0.35), quad([[-0.5, 0, z], [0, 0, z + 0.7], [0.5, 0, z], [0, 0, z - 0.7]]));
            if (L.rug) {
                const { x, z } = L.rug;
                P.fill(mixc(C.runner, C.runnerEdge, 0.25), quad([[x - 1.7, 0, z - 2.6], [x - 1.7, 0, z + 2.6], [x + 1.7, 0, z + 2.6], [x + 1.7, 0, z - 2.6]]));
                P.fill([0.22, 0.12, 0.2], quad([[x - 1.45, 0, z - 2.3], [x - 1.45, 0, z + 2.3], [x + 1.45, 0, z + 2.3], [x + 1.45, 0, z - 2.3]]));
            }
        }

        // ---- Bay by bay, and everything in them, far to near ---------------------------
        for (let k = R.bays - 1; k >= 0; k--) {
            const z0 = RL.pierZ(k), z1 = RL.pierZ(k + 1), zc = RL.bayZ(k);
            for (const side of [-1, 1]) {
                P.add(z1 - 0.02, () => wallBay(side, k, z0, z1, zc));
                P.add(z0 + 0.05, () => galleries(side, z0 + 0.5, z1 - 0.5));
                P.add(z0 + 0.03, () => pier(side, z0, k));
            }
        }
        P.add(R.len - 0.01, () => pier(-1, R.len, R.bays)); P.add(R.len - 0.01, () => pier(1, R.len, R.bays));
        for (const t of L.tables) P.add(t.z - R.tableLen / 2, () => table(t));
        for (const t of L.things) P.add(t.z, () => thing(t));
        for (const c of L.chandeliers) P.add(c.z - 0.6, () => chandelier(c));
        for (const l of L.ladders) P.add(l.z - 0.3, () => ladder(l));
        if (L.fire) P.add(L.fire.z - 2.4, () => fireplace(L.fire));
        if (L.desk) P.add(L.desk.z - 0.8, () => desk(L.desk));
        if (L.tree) P.add(L.tree.z - 1.6, () => tree(L.tree));
        P.run();

        // ---- How each part is drawn ---------------------------------------------------
        // A banker's lamp's shade: half a cylinder of glass, lying along the table, seen from down the hall.
        function dome(x, y, z, len, h) {
            const out = [], near = pr(x, y - h * 0.4, z - len * 0.5), far = pr(x, y - h * 0.4, z + len * 0.5), w = 0.2 * cam.mpx(z);
            for (let i = 0; i <= 10; i++) { const a = Math.PI * i / 10, [cx, cy] = pr(x, y - h * 0.4 + Math.sin(a) * h, z); out.push([cx - Math.cos(a) * w, cy]); }
            out.push([far[0] + w * 0.9, far[1]], [near[0] + w, near[1] + 0.02 * cam.mpx(z)], [near[0] - w, near[1] + 0.02 * cam.mpx(z)]);
            return out;
        }
        function box(pts) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return [x0, y0, x1, y1]; }
        // Glass: white, for the sky to colour (the sky light shows through it), and remembered for the weather outside.
        function glass(pts3, D) {
            const pts = pts3.map(q => pr(...q));
            set(D, CLS.SELF, MAT.SKY, 3, null);
            P.fill('#fff', g => poly(g, pts));
            P.skym.fillStyle = '#fff'; P.skym.beginPath(); poly(P.skym, pts); P.skym.fill();
            P.windows.push({ pts, D });
        }
        function wreath(x, y, D, r) {
            const [cx, cy] = pr(x, y, D), s = cam.mpx(D);
            set(D, CLS.UP, MAT.FIR, 1.4, null);
            P.line([0.12, 0.3, 0.16], Math.max(1, 0.32 * s), g => g.ellipse(cx, cy, r * s, r * s, 0, 0, TAU));
            P.fill([0.72, 0.08, 0.08], g => { g.moveTo(cx, cy + r * s); g.lineTo(cx - 0.3 * s, cy + (r + 0.3) * s); g.lineTo(cx + 0.3 * s, cy + (r + 0.3) * s); });
            for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; P.bulb(cx + Math.cos(a) * r * s, cy + Math.sin(a) * r * s, Math.max(0.8, 0.07 * s), cam.foot(D), 'string'); }
        }
        // A run of bookcase on the north wall, facing us.
        function endCase(x0, x1, y0, y1, D) {
            set(D, CLS.UP, MAT.WOOD, 5, Math.PI / 2);
            P.fill(C.back, quad([[x0, y0, D], [x0, y1, D], [x1, y1, D], [x1, y0, D]]));
            const n = Math.round((y1 - y0) / 0.4), sh = (y1 - y0) / n, s = cam.mpx(D);
            for (let j = 0; j < n; j++) {
                const yb = y0 + j * sh + 0.04, top = yb + sh - 0.07, by = {};
                for (let x = x0 + 0.05; x < x1 - 0.05;) { const w = rr(0.04, 0.09); if (rr(0, 1) > 0.05) { const c = pick(BOOKS), h = (top - yb) * rr(0.62, 0.97); (by[c] ||= []).push([[x, yb, D], [x, yb + h, D], [x + w, yb + h, D], [x + w, yb, D]]); } x += w + (s * 0.06 < 1 ? 0 : 0.004); }
                set(D, CLS.UP, MAT.FIG, 4.6, Math.PI / 2);
                for (const [c, list] of Object.entries(by)) P.fill(c.split(',').map(Number), g => { for (const q of list) poly(g, q.map(p => pr(...p))); });
                set(D, CLS.UP, MAT.WOOD, 4.6, 0);
                P.fill(C.walnutLight, quad([[x0, yb - 0.04, D], [x0, yb, D], [x1, yb, D], [x1, yb - 0.04, D]]));
            }
            for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / Math.max(1, Math.round((x1 - x0) / 2.4))) P.fill(C.walnut, quad([[x - 0.06, y0, D], [x - 0.06, y1, D], [x + 0.06, y1, D], [x + 0.06, y0, D]]));
        }

        // One bay of one wall: bookcases on the floor and on the first gallery, a
        // low case on the second, and the clerestory above with its twin lights.
        function wallBay(side, k, z0, z1, zc) {
            const x = side * R.hw, cls = wallCls(side);
            if (!onScreen([[x, 0, z0], [x, R.spring, z0], [x, R.spring, z1], [x, 0, z1]], 10)) return;
            const firebay = L.fire && side < 0 && Math.abs(zc - L.fire.z) < 1;
            if (firebay) {
                set(zc, cls, MAT.STONE, 3, Math.PI / 2);
                P.fill(mixc(C.stone, C.back, 0.25), quad([[x, 0, z0 + 0.5], [x, 5.35, z0 + 0.5], [x, 5.35, z1 - 0.5], [x, 0, z1 - 0.5]]));
                for (let y = 0, row = 0; y < 5.3; y += 0.42, row++) for (let z = z0 + 0.5 - (row % 2) * 0.35; z < z1 - 0.5; z += 0.7) { const a = Math.max(z0 + 0.5, z + 0.03), b = Math.min(z1 - 0.5, z + 0.67); if (b > a) P.fill(P.vary(C.stone, 0.09), quad([[x, y + 0.03, a], [x, y + 0.39, a], [x, y + 0.39, b], [x, y + 0.03, b]])); }
            }
            else books(side, k, z0 + 0.5, z1 - 0.5, 0.15, 5.35, 0);
            books(side, k, z0 + 0.5, z1 - 0.5, 6.0, 11.0, 1);
            books(side, k, z0 + 0.5, z1 - 0.5, 11.4, 12.3, 2);
            // The wall over the second gallery, and the window in it.
            set(zc, cls, MAT.WALL, 6, Math.PI / 2);
            P.fill(C.plaster, quad([[x, 12.3, z0 + 0.5], [x, R.spring, z0 + 0.5], [x, R.spring, z1 - 0.5], [x, 12.3, z1 - 0.5]]));
            const outer = RL.windows().filter(w => w.kind === 'side' && w.k === k && w.side === side);
            set(zc, cls, MAT.STONE, 3.6, Math.PI / 2);
            const h = R.winW / 2 + 0.3, sp = R.win1 - R.winW / 2;
            const surround = [[x, R.win0 - 0.3, zc - h], [x, sp, zc - h], ...Array.from({ length: 9 }, (_, i) => { const a = Math.PI - Math.PI * (i + 1) / 10; return [x, sp + (h) * Math.sin(a), zc + h * Math.cos(a)]; }), [x, sp, zc + h], [x, R.win0 - 0.3, zc + h]];
            P.fill(C.stone, quad(surround));
            for (const w of outer) glass(w.pts, zc);
            set(zc, cls, MAT.STONE, 1.4, 0);
            for (let y = R.win0 + 0.7; y < R.win1 - 0.8; y += 0.75) P.line(C.lead, Math.max(0.5, 0.04 * cam.mpx(zc)), g => { const a = pr(x, y, zc - R.winW / 2), b = pr(x, y, zc + R.winW / 2); g.moveTo(...a); g.lineTo(...b); });
            // The cornice where the vault begins.
            set(zc, cls, MAT.STONE, 2.2, null);
            P.fill(C.cream, quad([[x, R.spring - 0.35, z0], [x, R.spring, z0], [x - side * 0.4, R.spring + 0.1, z0], [x - side * 0.4, R.spring + 0.1, z1], [x, R.spring, z1], [x, R.spring - 0.35, z1]]));
            P.line(C.giltDark, Math.max(0.6, 0.05 * cam.mpx(zc)), g => { const a = pr(x, R.spring - 0.2, z0), b = pr(x, R.spring - 0.2, z1); g.moveTo(...a); g.lineTo(...b); });
            P.hit('window', ...box(outer.flatMap(w => w.pts).map(q => pr(...q))), { which: 'side', side, k });
        }

        // Shelves of books on a wall, z0 to z1, y0 to y1: each shelf its own row,
        // the books batched by colour, the far ones a mottle of their colours.
        function books(side, k, z0, z1, y0, y1, level) {
            const x = side * R.hw, cls = wallCls(side);
            if (!onScreen([[x, y0, z0], [x, y1, z0], [x, y1, z1], [x, y0, z1]], 10)) return;
            for (let z = z0; z < z1 - 0.01;) {
                const D0 = z, step = D0 < 16 ? 1 : D0 < 34 ? 2 : 4.2, za = z, zb = Math.min(z1, z + step), Dm = (za + zb) / 2, dense = R.hw * cam.foc / (Dm * Dm);
                z = zb;
                set(Dm, cls, MAT.WOOD, 5, Math.PI / 2);
                P.fill(C.back, quad([[x, y0, za], [x, y1, za], [x, y1, zb], [x, y0, zb]]));
                const n = Math.max(1, Math.round((y1 - y0 - 0.05) / 0.38)), sh = (y1 - y0) / n;
                for (let j = 0; j < n; j++) {
                    const yb = y0 + j * sh + 0.035, top = yb + sh - 0.055, by = {};
                    if (dense * 0.06 < 0.7) {
                        // Too far to tell one book from the next.
                        for (let q = 0; q < 5; q++) { const a = za + (zb - za) * q / 5, b = za + (zb - za) * (q + 1) / 5, c = pick(BOOKS).join(); (by[c] ||= []).push([[x, yb, a], [x, top - rr(0, 0.06), a], [x, top - rr(0, 0.06), b], [x, yb, b]]); }
                    } else {
                        for (let q = za + 0.02; q < zb - 0.02;) {
                            const w = rr(0.035, 0.085), h = (top - yb) * rr(0.6, 0.98);
                            if (rr(0, 1) > 0.04) { const c = pick(BOOKS).join(); (by[c] ||= []).push([[x, yb, q], [x, yb + h, q], [x, yb + h, Math.min(zb, q + w)], [x, yb, Math.min(zb, q + w)]]); if (h > (top - yb) * 0.82 && rr(0, 1) < 0.4) (by[C.gilt.join()] ||= []).push([[x, yb + h * 0.82, q], [x, yb + h * 0.86, q], [x, yb + h * 0.86, q + w], [x, yb + h * 0.82, q + w]]); }
                            q += w;
                        }
                    }
                    set(Dm, cls, MAT.FIG, Dm < 15 ? 3 : 4.6, Math.PI / 2);
                    for (const [c, list] of Object.entries(by)) P.fill(c.split(',').map(Number), g => { for (const q of list) poly(g, q.map(p => pr(...p))); });
                    set(Dm, cls, MAT.WOOD, Dm < 15 ? 3 : 4.6, vp(...pr(x, yb, Dm)));
                    P.fill(C.walnutLight, quad([[x - side * 0.02, yb - 0.035, za], [x - side * 0.02, yb, za], [x - side * 0.02, yb, zb], [x - side * 0.02, yb - 0.035, zb]]));
                }
            }
            P.shelves.push({ side, k, level, z0, z1, y0, y1 });
            P.hit('shelf', ...box([[x, y0, z0], [x, y1, z0], [x, y1, z1], [x, y0, z1]].map(q => pr(...q))), { side, k, level });
        }

        // The galleries along a bay: the slab's underside and its front, and the rail.
        function galleries(side, z0, z1) {
            for (const [y0, y1, gx] of [[5.35, 6.0, R.g1x], [11.0, 11.4, R.g2x]]) {
                const x = side * R.hw, xf = side * gx, Dm = (z0 + z1) / 2;
                if (!onScreen([[x, y0, z0], [xf, y1, z1], [x, y1, z1], [xf, y0, z0]], 10)) continue;
                // The underside, coffered, seen from below; then the fascia, carved, toward the hall.
                set(Dm, CLS.UP, MAT.WOOD, 4.4, vp(...pr(xf, y0, Dm)));
                P.fill(C.walnut, quad([[x, y0, z0], [xf, y0, z0], [xf, y0, z1], [x, y0, z1]]));
                for (let z = z0 + 0.3; z < z1 - 0.6; z += 1.5) P.fill(mixc(C.walnut, C.back, 0.4), quad([[x - side * 0.2, y0, z], [xf + side * 0.2, y0, z], [xf + side * 0.2, y0, z + 1.1], [x - side * 0.2, y0, z + 1.1]]));
                set(Dm, wallCls(side), MAT.WOOD, 3, vp(...pr(xf, (y0 + y1) / 2, Dm)));
                P.fill(C.walnutLight, quad([[xf, y0, z0], [xf, y1, z0], [xf, y1, z1], [xf, y0, z1]]));
                P.line(C.gilt, Math.max(0.5, 0.035 * cam.mpx(Dm)), g => { const a = pr(xf, y1 - 0.08, z0), b = pr(xf, y1 - 0.08, z1); g.moveTo(...a); g.lineTo(...b); });
                rail(side, z0, z1, y1, gx);
                if (xmas && y0 < 6) swag(side, z0, z1, y1 + R.rail, gx);
            }
        }
        // An iron rail: balusters, a scroll between, a gilt handrail. `along`: a run across the north wall.
        function rail(side, z0, z1, yb, gx) {
            if (gx === 'across') {
                const x0 = side, x1 = z0, D = z1;
                set(D, CLS.UP, MAT.STONE, 1.4, Math.PI / 2);
                const s = cam.mpx(D);
                P.line(C.iron, Math.max(0.5, 0.03 * s), g => { for (let x = x0; x <= x1; x += 0.3) { const a = pr(x, yb, D), b = pr(x, yb + R.rail, D); g.moveTo(...a); g.lineTo(...b); } });
                P.line(C.gilt, Math.max(0.7, 0.07 * s), g => { const a = pr(x0, yb + R.rail, D), b = pr(x1, yb + R.rail, D); g.moveTo(...a); g.lineTo(...b); });
                return;
            }
            const x = side * (gx + 0.06), Dm = (z0 + z1) / 2, s = cam.mpx(Dm);
            set(Dm, wallCls(side), MAT.STONE, 2, Math.PI / 2);
            P.line(C.iron, Math.max(0.45, 0.028 * s), g => {
                for (let z = z0; z <= z1; z += 0.24) { const a = pr(x, yb, z), b = pr(x, yb + R.rail, z); g.moveTo(...a); g.lineTo(...b); }
                // a run of loops along the middle of it
                for (let z = z0; z < z1 - 0.24; z += 0.48) { const a = pr(x, yb + R.rail * 0.5, z), b = pr(x, yb + R.rail * 0.78, z + 0.24), c = pr(x, yb + R.rail * 0.5, z + 0.48); g.moveTo(...a); g.quadraticCurveTo(b[0], b[1], c[0], c[1]); }
            });
            set(Dm, wallCls(side), MAT.STONE, 1.4, vp(...pr(x, yb + R.rail, Dm)));
            P.line(C.gilt, Math.max(0.7, 0.07 * s), g => { const a = pr(x, yb + R.rail, z0), b = pr(x, yb + R.rail, z1); g.moveTo(...a); g.lineTo(...b); });
            P.line(C.iron, Math.max(0.5, 0.04 * s), g => { const a = pr(x, yb + 0.06, z0), b = pr(x, yb + 0.06, z1); g.moveTo(...a); g.lineTo(...b); });
        }
        // Christmas: a garland swagged along the rail, with lights in it, and a bow at each end.
        function swag(side, z0, z1, y, gx) {
            const x = side * (gx + 0.1), Dm = (z0 + z1) / 2, s = cam.mpx(Dm), n = 3;
            set(Dm, wallCls(side), MAT.FIR, 1.4, null);
            P.line([0.1, 0.28, 0.15], Math.max(1, 0.22 * s), g => {
                for (let i = 0; i < n; i++) { const a = z0 + (z1 - z0) * i / n, b = z0 + (z1 - z0) * (i + 1) / n, p0 = pr(x, y, a), p1 = pr(x, y - 0.9, (a + b) / 2), p2 = pr(x, y, b); g.moveTo(...p0); g.quadraticCurveTo(p1[0], p1[1] * 2 - (p0[1] + p2[1]) / 2, p2[0], p2[1]); }
            });
            for (let i = 0; i < n; i++) for (let j = 1; j < 8; j++) { const a = z0 + (z1 - z0) * (i + j / 8) / n, t = j / 8, sag = 4 * t * (1 - t) * 0.45, [bx, by] = pr(x, y - sag, a); P.bulb(bx, by, Math.max(0.6, 0.032 * cam.mpx(a)), cam.foot(a), 'string'); }
            for (const z of [z0, z1]) { set(z, wallCls(side), MAT.FIG, 1.4, null); P.fill([0.74, 0.08, 0.08], quad([[x, y + 0.15, z - 0.25], [x, y - 0.15, z + 0.25], [x, y + 0.15, z + 0.25], [x, y - 0.15, z - 0.25]])); }
        }
        // A pier between bays: a pilaster of marble up to the cornice, and its face toward us.
        function pier(side, z, k) {
            const x = side * R.hw, xi = side * (R.hw - 0.45), w = 0.55;
            if (z < 2.5 || !onScreen([[xi, 0, z - w], [xi, R.spring, z + w]], 10)) return;
            set(z, wallCls(side), MAT.STONE, 4.6, Math.PI / 2);
            P.fill(C.marble, quad([[xi, 0, z - w], [xi, R.spring, z - w], [xi, R.spring, z + w], [xi, 0, z + w]]));
            set(z, CLS.UP, MAT.STONE, 4.6, Math.PI / 2);
            P.fill(mixc(C.marble, C.stone, 0.4), quad([[x, 0, z - w], [x, R.spring, z - w], [xi, R.spring, z - w], [xi, 0, z - w]]));
            // A capital at each level, gilt.
            for (const y of [5.0, 10.7, 16.7]) { set(z, wallCls(side), MAT.STONE, 3, 0); P.fill(C.gilt, quad([[xi - side * 0.06, y, z - w - 0.08], [xi - side * 0.06, y + 0.3, z - w - 0.08], [xi - side * 0.06, y + 0.3, z + w + 0.08], [xi - side * 0.06, y, z + w + 0.08]])); }
        }

        // A reading table: four legs, an apron, a top with a leather inset, three lamps; chairs both sides; books.
        function table(t) {
            const x = t.x, zc = t.z, hl = R.tableLen / 2, hw = R.tableW / 2, y = R.tableH, za = zc - hl, zb = zc + hl;
            const inner = t.side > 0 ? x - hw : x + hw, outer = t.side > 0 ? x + hw : x - hw, chairs = (L.seats || []).filter(s => s.table === t.id);
            // Chairs beyond the table first; then the table; then the near chairs.
            for (const s of chairs.filter(s => !s.near)) chair(s);
            const [fx, fy] = pr(x, 0, za);
            const group = P.group('table', { kind: 'table', table: t.id, k: t.k, side: t.side });
            t.group = group;
            P.solid(cam.z(za), fx, fy, () => {
                set(za, CLS.UP, MAT.WOOD, 2.4, Math.PI / 2);
                for (const [lx, lz] of [[outer, za + 0.15], [outer, zb - 0.15], [inner, za + 0.15], [inner, zb - 0.15]]) P.fill(C.walnut, quad([[lx - 0.05, 0, lz], [lx - 0.05, y - 0.05, lz], [lx + 0.05, y - 0.05, lz], [lx + 0.05, 0, lz]]));
                set(zc, wallCls(-t.side), MAT.WOOD, 3, vp(...pr(inner, y - 0.1, zc)));
                P.fill(C.walnut, quad([[inner, y - 0.16, za], [inner, y, za], [inner, y, zb], [inner, y - 0.16, zb]]));
                set(za, CLS.UP, MAT.WOOD, 2.6, 0);
                P.fill(C.walnutLight, quad([[x - hw, y - 0.16, za], [x - hw, y, za], [x + hw, y, za], [x + hw, y - 0.16, za]]));
                set(zc, CLS.TOP, MAT.WOOD, 3.4, vp(...pr(x, y, zc)));
                P.fill(C.oak, quad([[x - hw, y, za], [x - hw, y, zb], [x + hw, y, zb], [x + hw, y, za]]));
                P.fill(C.leather, quad([[x - hw + 0.12, y, za + 0.12], [x - hw + 0.12, y, zb - 0.12], [x + hw - 0.12, y, zb - 0.12], [x + hw - 0.12, y, za + 0.12]]));
                // Books on it: a stack, an open one, one lying shut.
                for (let i = 0; i < 4; i++) {
                    const bz = za + 0.6 + i * 1.7 + rr(-0.2, 0.2), bx = x + rr(-0.35, 0.35), open = (i + t.id) % 3 === 0;
                    set(bz, CLS.TOP, MAT.FIG, 2.4, null);
                    if (open) { P.fill(C.paper, quad([[bx - 0.32, y + 0.02, bz - 0.2], [bx - 0.32, y + 0.04, bz + 0.2], [bx + 0.32, y + 0.04, bz + 0.2], [bx + 0.32, y + 0.02, bz - 0.2]])); continue; }
                    for (let j = 0; j < 1 + (i % 3); j++) { const c = pick(BOOKS), h = 0.05; P.fill(c, quad([[bx - 0.17, y + j * h, bz - 0.12], [bx - 0.17, y + (j + 1) * h, bz - 0.12], [bx + 0.17, y + (j + 1) * h, bz - 0.12], [bx + 0.17, y + j * h, bz - 0.12]])); set(bz, CLS.TOP, MAT.FIG, 2.4, null); P.fill(mixc(c, C.paper, 0.2), quad([[bx - 0.17, y + (j + 1) * h, bz - 0.12], [bx - 0.17, y + (j + 1) * h, bz + 0.12], [bx + 0.17, y + (j + 1) * h, bz + 0.12], [bx + 0.17, y + (j + 1) * h, bz - 0.12]])); }
                }
                // The lamps: a brass foot and stem, a green glass shade, lit from under it.
                for (const lz of [zc - 2.3, zc, zc + 2.3]) {
                    const ly = y + R.shade, s = cam.mpx(lz);
                    set(lz, CLS.UP, MAT.STONE, 1.4, Math.PI / 2);
                    P.fill(C.brass, quad([[x - 0.12, y, lz], [x - 0.12, y + 0.04, lz], [x + 0.12, y + 0.04, lz], [x + 0.12, y, lz]]));
                    P.fill(C.brass, quad([[x - 0.018, y, lz], [x - 0.018, ly, lz], [x + 0.018, ly, lz], [x + 0.018, y, lz]]));
                    const shadePts = dome(x, ly, lz, 0.27, 0.13);
                    set(lz, CLS.SELF, MAT.GLASS, 1.4, 0);
                    P.fill(shade, g => poly(g, shadePts));
                    P.glowPoly(group, `rgb(${shade.map(v => Math.min(255, v * 330 + 40) | 0).join(',')})`, shadePts);
                    P.light(group, { x, y: ly - 0.1, z: cam.z(lz), c: bulbC, I: 1.1, r2: 0.12, out: 0 });
                    P.halo(group, ...pr(x, ly - 0.07, lz), Math.max(1, 0.12 * s));
                }
            }, { shadow: 0.35 });
            P.hit('table', ...box([[x - hw, 0, za], [x + hw, y + R.shade + 0.1, za], [x - hw, y + 0.1, zb], [x + hw, 0, zb]].map(q => pr(...q))), { group, table: t.id });
            for (const s of chairs.filter(s => s.near)) chair(s);
        }
        function chair(s) {
            const { x, z } = s, f = s.face, y = 0.46;
            const [fx, fy] = pr(x, 0, z);
            P.solid(cam.z(z - 0.25), fx, fy, () => {
                set(z, CLS.UP, MAT.WOOD, 2.4, Math.PI / 2);
                for (const [dx, dz] of [[-0.2, -0.2], [0.2, -0.2]]) P.fill(C.walnut, quad([[x + dx - 0.025, 0, z + dz], [x + dx - 0.025, y, z + dz], [x + dx + 0.025, y, z + dz], [x + dx + 0.025, 0, z + dz]]));
                set(z, CLS.TOP, MAT.WALL, 2.6, null);
                P.fill(C.seat, quad([[x - 0.23, y, z - 0.23], [x - 0.23, y, z + 0.23], [x + 0.23, y, z + 0.23], [x + 0.23, y, z - 0.23]]));
                // The back, on the side away from the table.
                const bx = x - f * 0.22;
                set(z, f > 0 ? CLS.SIDER : CLS.SIDEL, MAT.WOOD, 2.4, Math.PI / 2);
                P.fill(C.walnut, quad([[bx, y, z - 0.22], [bx, y + 0.5, z - 0.2], [bx, y + 0.5, z + 0.2], [bx, y, z + 0.22]]));
                P.fill(C.walnutLight, quad([[bx, y + 0.44, z - 0.22], [bx, y + 0.56, z - 0.22], [bx, y + 0.56, z + 0.22], [bx, y + 0.44, z + 0.22]]));
            }, { shadow: 0.2 });
        }
        function thing(t) {
            const { x, z } = t, [fx, fy] = pr(x, 0, z), s = cam.mpx(z);
            if (!onScreen([[x - 1, 0, z], [x + 1, 3, z]], 30)) return;
            if (t.kind === 'bust' || t.kind === 'globe') {
                P.solid(cam.z(z - 0.4), fx, fy, () => {
                    set(z, CLS.UP, MAT.STONE, 2.6, Math.PI / 2);
                    const ped = t.big ? 0.6 : 1.15;
                    P.fill(C.marble, quad([[x - 0.32, 0, z], [x - 0.32, 0.12, z], [x + 0.32, 0.12, z], [x + 0.32, 0, z]]));
                    P.fill(mixc(C.marble, C.stone, 0.3), quad([[x - 0.22, 0.12, z], [x - 0.22, ped, z], [x + 0.22, ped, z], [x + 0.22, 0.12, z]]));
                    P.fill(C.marble, quad([[x - 0.3, ped, z], [x - 0.3, ped + 0.1, z], [x + 0.3, ped + 0.1, z], [x + 0.3, ped, z]]));
                    if (t.kind === 'bust') {
                        const [hx, hy] = pr(x, ped + 0.72, z);
                        set(z, CLS.UP, MAT.STONE, 1.4, null);
                        P.fill(C.marble, g => { const a = pr(x - 0.3, ped + 0.1, z), b = pr(x + 0.3, ped + 0.1, z); g.moveTo(...a); g.quadraticCurveTo(hx - 0.34 * s, hy + 0.1 * s, hx - 0.1 * s, hy + 0.2 * s); g.lineTo(hx + 0.1 * s, hy + 0.2 * s); g.quadraticCurveTo(hx + 0.34 * s, hy + 0.1 * s, b[0], b[1]); });
                        P.fill(mixc(C.marble, C.cream, 0.3), g => g.ellipse(hx, hy - 0.02 * s, 0.13 * s, 0.17 * s, 0, 0, TAU));
                        // Some of the worthies have been given a scarf, and one a cat's ears, by students.
                        if (t.seed % 4 === 1) P.fill([0.56, 0.1, 0.12], quad([[x - 0.13, ped + 0.5, z - 0.05], [x - 0.13, ped + 0.57, z - 0.05], [x + 0.13, ped + 0.57, z - 0.05], [x + 0.13, ped + 0.5, z - 0.05]]));
                        if (t.seed % 7 === 3) P.fill([0.15, 0.13, 0.14], g => { for (const d of [-1, 1]) { g.moveTo(hx + d * 0.04 * s, hy - 0.14 * s); g.lineTo(hx + d * 0.13 * s, hy - 0.27 * s); g.lineTo(hx + d * 0.12 * s, hy - 0.11 * s); } });
                    } else {
                        const gy = ped + (t.big ? 0.9 : 0.42), r = t.big ? 0.75 : 0.34, [gx, gyy] = pr(x, gy, z);
                        set(z, CLS.UP, MAT.WOOD, 1.4, null);
                        P.line(C.brass, Math.max(0.6, 0.04 * s), g => g.ellipse(gx, gyy, (r + 0.06) * s, (r + 0.06) * s, -0.4, 0, TAU));
                        set(z, CLS.UP, MAT.STONE, 1.4, null);
                        P.fill([0.42, 0.52, 0.5], g => g.ellipse(gx, gyy, r * s, r * s, 0, 0, TAU));
                        for (let i = 0; i < 4; i++) { const a = rr(0, TAU), rx = rr(0.12, 0.3) * r; P.fill([0.7, 0.58, 0.34], g => g.ellipse(gx + Math.cos(a) * r * 0.5 * s, gyy + Math.sin(a) * r * 0.5 * s, rx * s, rx * 0.7 * s, a, 0, TAU)); }
                        P.hit('globe', gx - r * s, gyy - r * s, gx + r * s, gyy + r * s);
                    }
                }, { shadow: 0.3 });
            } else if (t.kind === 'catalogue') {
                const w = 1.8, h = 1.35, d = 0.6;
                P.solid(cam.z(z - d / 2), fx, fy, () => {
                    set(z, CLS.SIDER, MAT.WOOD, 1.6, Math.PI / 2);
                    P.fill(C.walnut, quad([[x + d / 2, 0, z - w / 2], [x + d / 2, h, z - w / 2], [x + d / 2, h, z + w / 2], [x + d / 2, 0, z + w / 2]]));
                    for (let i = 0; i < 6; i++) for (let j = 0; j < 5; j++) { const zz = z - w / 2 + 0.08 + i * (w - 0.16) / 6, yy = 0.2 + j * (h - 0.3) / 5; P.fill(C.walnutLight, quad([[x + d / 2 + 0.01, yy, zz + 0.02], [x + d / 2 + 0.01, yy + 0.17, zz + 0.02], [x + d / 2 + 0.01, yy + 0.17, zz + 0.24], [x + d / 2 + 0.01, yy, zz + 0.24]])); P.fill(C.brass, quad([[x + d / 2 + 0.02, yy + 0.07, zz + 0.1], [x + d / 2 + 0.02, yy + 0.1, zz + 0.1], [x + d / 2 + 0.02, yy + 0.1, zz + 0.16], [x + d / 2 + 0.02, yy + 0.07, zz + 0.16]])); }
                    set(z, CLS.TOP, MAT.WOOD, 1.6, null);
                    P.fill(C.oakPale, quad([[x - d / 2, h, z - w / 2], [x - d / 2, h, z + w / 2], [x + d / 2, h, z + w / 2], [x + d / 2, h, z - w / 2]]));
                    set(z - w / 2, CLS.UP, MAT.WOOD, 1.6, Math.PI / 2);
                    P.fill(mixc(C.walnut, C.back, 0.3), quad([[x - d / 2, 0, z - w / 2], [x - d / 2, h, z - w / 2], [x + d / 2, h, z - w / 2], [x + d / 2, 0, z - w / 2]]));
                }, { shadow: 0.3 });
                P.hit('catalogue', ...box([[x, 0, z - w / 2], [x + d / 2, h, z - w / 2]].map(q => pr(...q))));
            } else if (t.kind === 'armchair') {
                P.solid(cam.z(z - 0.45), fx, fy, () => {
                    set(z, CLS.UP, MAT.WALL, 1.8, null);
                    const c = [0.45, 0.13, 0.11];
                    P.fill(c, quad([[x - 0.45, 0.1, z - 0.4], [x - 0.45, 0.55, z - 0.4], [x + 0.45, 0.55, z - 0.4], [x + 0.45, 0.1, z - 0.4]]));
                    P.fill(mixc(c, C.back, 0.3), quad([[x + 0.3, 0.45, z - 0.45 * t.face], [x + 0.3, 1.25, z - 0.4 * t.face], [x + 0.45, 1.3, z + 0.45 * t.face], [x + 0.45, 0.45, z + 0.45 * t.face]]));
                    set(z, CLS.TOP, MAT.WALL, 1.8, null);
                    P.fill(mixc(c, C.paper, 0.1), quad([[x - 0.42, 0.55, z - 0.4], [x - 0.42, 0.55, z + 0.4], [x + 0.32, 0.55, z + 0.4], [x + 0.32, 0.55, z - 0.4]]));
                    P.fill(mixc(c, C.back, 0.15), quad([[x - 0.48, 0.55, z - 0.42], [x - 0.48, 0.8, z - 0.42], [x + 0.45, 0.8, z - 0.42], [x + 0.45, 0.55, z - 0.42]]));
                }, { shadow: 0.3 });
            }
        }

        // A chandelier: a chain from the crown, a brass hoop and two tiers of candles.
        function chandelier(c) {
            const { x, y, z } = c, s = cam.mpx(z);
            if (s < 2) return;
            const group = P.group('chandelier', { kind: 'chandelier', k: c.k });
            c.group = group;
            set(z, CLS.UP, MAT.STONE, 1.4, Math.PI / 2);
            P.line(C.iron, Math.max(0.5, 0.04 * s), g => { const a = pr(x, R.apex - 0.4, z), b = pr(x, y + 1.2, z); g.moveTo(...a); g.lineTo(...b); });
            for (const [ry, rr2, n] of [[y, 1.25, 12], [y + 0.75, 0.7, 8]]) {
                const ring = []; for (let i = 0; i <= 24; i++) { const a = i / 24 * TAU; ring.push(pr(x + Math.cos(a) * rr2, ry, z + Math.sin(a) * rr2)); }
                set(z, CLS.UP, MAT.STONE, 1.4, 0);
                P.line(C.brass, Math.max(0.7, 0.07 * s), g => poly(g, ring));
                for (let i = 0; i < n; i++) {
                    const a = i / n * TAU, cx = x + Math.cos(a) * rr2, cz = z + Math.sin(a) * rr2, [px, py] = pr(cx, ry + 0.12, cz), [tx, ty] = pr(cx, ry + 0.3, cz);
                    P.line(C.cream, Math.max(0.5, 0.04 * cam.mpx(cz)), g => { g.moveTo(px, py); g.lineTo(tx, ty); });
                    P.bulb(tx, ty - 0.04 * cam.mpx(cz), Math.max(0.6, 0.045 * cam.mpx(cz)), cam.foot(cz), 'candle');
                }
                P.line(C.brass, Math.max(0.5, 0.04 * s), g => { for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.4, b = pr(x + Math.cos(a) * rr2, ry, z + Math.sin(a) * rr2), t = pr(x, ry + 1.2, z); g.moveTo(...b); g.lineTo(...t); } });
            }
            P.light(group, { x, y: y + 0.4, z: cam.z(z), c: [1, 0.76, 0.44], I: 30, r2: 1.5, out: 0 });
            P.glowEll(group, 'rgb(255,214,150)', ...pr(x, y + 0.38, z), 0.9 * s, 0.25 * s);
            P.hit('chandelier', ...box([pr(x - 1.3, y - 0.2, z), pr(x + 1.3, y + 1.4, z)]), { group, k: c.k });
        }
        // A rolling ladder, leaning on the bookcase from its rail.
        function ladder(l) {
            const side = l.side, z = l.z, xt = side * (R.hw - 0.12), xb = side * (R.hw - 1.05), yt = 5.2;
            if (!onScreen([[xb, 0, z], [xt, yt, z + 0.5]], 10)) return;
            set(z, wallCls(side), MAT.WOOD, 1.4, null);
            P.line(C.oakPale, Math.max(0.6, 0.05 * cam.mpx(z)), g => {
                for (const dz of [-0.24, 0.24]) { const a = pr(xb, 0, z + dz), b = pr(xt, yt, z + dz); g.moveTo(...a); g.lineTo(...b); }
                for (let i = 1; i < 16; i++) { const t = i / 16, a = pr(xb + (xt - xb) * t, yt * t, z - 0.24), b = pr(xb + (xt - xb) * t, yt * t, z + 0.24); g.moveTo(...a); g.lineTo(...b); }
            });
            P.line(C.brass, Math.max(0.5, 0.04 * cam.mpx(z)), g => { const a = pr(xt, yt, z - 2.5), b = pr(xt, yt, z + 2.5); g.moveTo(...a); g.lineTo(...b); });
        }
        // The fireplace in the left wall: stone, a mantel, the firebox's glow, and a portrait over it.
        function fireplace(F) {
            const x = -R.hw + 0.02, z = F.z, s = cam.mpx(z);
            const group = P.group('fire', { kind: 'fire' });
            set(z, CLS.SIDER, MAT.STONE, 2, Math.PI / 2);
            P.fill(C.stone, quad([[x, 0, z - 2], [x, 3.0, z - 2], [x, 3.0, z + 2], [x, 0, z + 2]]));
            P.fill(mixc(C.stone, C.marble, 0.5), quad([[x + 0.3, 2.5, z - 2.2], [x + 0.3, 2.75, z - 2.2], [x + 0.3, 2.75, z + 2.2], [x + 0.3, 2.5, z + 2.2]]));
            const box3 = [[x, 0.1, z - 1.1], [x, 1.45, z - 1.1], [x, 1.45, z + 1.1], [x, 0.1, z + 1.1]], pts = box3.map(q => pr(...q));
            set(z, CLS.SELF, MAT.STONE, 1.6, null);
            P.fill([0.05, 0.03, 0.02], g => poly(g, pts));
            P.glowPoly(group, 'rgb(255,140,50)', pts.map(([px, py], i) => [px, i === 1 || i === 2 ? py + (pts[0][1] - py) * 0.5 : py]));
            P.light(group, { x: x + 0.8, y: 0.6, z: cam.z(z), c: [1, 0.52, 0.2], I: 4.2, r2: 0.6, out: 0 });
            // The founder over the mantel, in a gilt frame: a cat in a gown and mortarboard, of course.
            set(z, CLS.SIDER, MAT.WOOD, 1.4, Math.PI / 2);
            P.fill(C.gilt, quad([[x + 0.02, 3.2, z - 1.0], [x + 0.02, 5.0, z - 1.0], [x + 0.02, 5.0, z + 1.0], [x + 0.02, 3.2, z + 1.0]]));
            P.fill([0.16, 0.12, 0.1], quad([[x + 0.03, 3.35, z - 0.85], [x + 0.03, 4.85, z - 0.85], [x + 0.03, 4.85, z + 0.85], [x + 0.03, 3.35, z + 0.85]]));
            set(z, CLS.SIDER, MAT.FIG, 1.4, null);
            P.fill([0.08, 0.07, 0.1], quad([[x + 0.04, 3.35, z - 0.6], [x + 0.04, 4.0, z - 0.45], [x + 0.04, 4.0, z + 0.45], [x + 0.04, 3.35, z + 0.6]]));
            P.fill([0.84, 0.5, 0.2], g => { const [hx, hy] = pr(x + 0.04, 4.3, z); g.ellipse(hx, hy, 0.16 * s * 0.4, 0.28 * s, 0, 0, TAU); });
            P.fill([0.84, 0.5, 0.2], g => { for (const d of [-0.2, 0.2]) { const a = pr(x + 0.04, 4.48, z + d - 0.06), b = pr(x + 0.04, 4.7, z + d), c = pr(x + 0.04, 4.48, z + d + 0.06); g.moveTo(...a); g.lineTo(...b); g.lineTo(...c); } });
            P.fill([0.06, 0.06, 0.08], quad([[x + 0.05, 4.62, z - 0.3], [x + 0.05, 4.7, z - 0.3], [x + 0.05, 4.7, z + 0.3], [x + 0.05, 4.62, z + 0.3]]));
            P.spots.fire = { x: x + 0.35, z, y: 0.15, px: pr(x + 0.3, 0.12, z), s, group };
            P.hit('fire', ...box(pts), { group });
            if (xmas) for (const d of [-0.8, 0, 0.8]) { set(z, CLS.SIDER, MAT.FIG, 1.4, null); P.fill([0.7, 0.1, 0.1], quad([[x + 0.32, 2.45, z + d - 0.1], [x + 0.32, 2.45, z + d + 0.1], [x + 0.32, 1.9, z + d + 0.12], [x + 0.32, 1.9, z + d - 0.08]])); P.fill(C.paper, quad([[x + 0.33, 2.4, z + d - 0.1], [x + 0.33, 2.45, z + d - 0.1], [x + 0.33, 2.45, z + d + 0.1], [x + 0.33, 2.4, z + d + 0.1]])); }
        }
        // The librarian's desk: a long counter, its own lamp, stacks of books, a bell.
        function desk(d) {
            const { x, z } = d, w = 2.6, dp = 0.9, h = 0.95, [fx, fy] = pr(x, 0, z);
            const group = P.group('desk', { kind: 'desk' });
            d.group = group;
            P.solid(cam.z(z - dp / 2), fx, fy, () => {
                set(z - dp / 2, CLS.UP, MAT.WOOD, 1.6, Math.PI / 2);
                P.fill(C.walnut, quad([[x - dp / 2, 0, z - w / 2], [x - dp / 2, h, z - w / 2], [x + dp / 2, h, z - w / 2], [x + dp / 2, 0, z - w / 2]]));
                set(z, CLS.SIDER, MAT.WOOD, 1.6, vp(...pr(x - dp / 2, h / 2, z)));
                P.fill(C.walnutLight, quad([[x - dp / 2, 0, z - w / 2], [x - dp / 2, h, z - w / 2], [x - dp / 2, h, z + w / 2], [x - dp / 2, 0, z + w / 2]]));
                for (let i = 0; i < 3; i++) P.fill(mixc(C.walnut, C.back, 0.2), quad([[x - dp / 2 - 0.01, 0.15, z - w / 2 + 0.15 + i * 0.82], [x - dp / 2 - 0.01, h - 0.15, z - w / 2 + 0.15 + i * 0.82], [x - dp / 2 - 0.01, h - 0.15, z - w / 2 + 0.85 + i * 0.82], [x - dp / 2 - 0.01, 0.15, z - w / 2 + 0.85 + i * 0.82]]));
                set(z, CLS.TOP, MAT.WOOD, 1.6, null);
                P.fill(C.oak, quad([[x - dp / 2 - 0.05, h, z - w / 2 - 0.05], [x - dp / 2 - 0.05, h, z + w / 2], [x + dp / 2, h, z + w / 2], [x + dp / 2, h, z - w / 2 - 0.05]]));
                for (let i = 0; i < 7; i++) { const c = pick(BOOKS), by = h + i * 0.06; set(z, CLS.UP, MAT.FIG, 1.4, null); P.fill(c, quad([[x + 0.1, by, z + 0.6], [x + 0.1, by + 0.06, z + 0.6], [x + 0.36 + rr(-0.03, 0.03), by + 0.06, z + 0.6], [x + 0.36, by, z + 0.6]])); }
                const lz = z - 0.6, ly = h + 0.48, s = cam.mpx(lz);
                set(lz, CLS.UP, MAT.STONE, 1.4, Math.PI / 2);
                P.fill(C.brass, quad([[x - 0.02, h, lz], [x - 0.02, ly, lz], [x + 0.02, ly, lz], [x + 0.02, h, lz]]));
                const shadePts = dome(x, ly, lz, 0.26, 0.12);
                set(lz, CLS.SELF, MAT.GLASS, 1.4, 0); P.fill(shade, g => poly(g, shadePts));
                P.glowPoly(group, `rgb(${shade.map(v => Math.min(255, v * 330 + 40) | 0).join(',')})`, shadePts);
                P.light(group, { x, y: ly - 0.1, z: cam.z(lz), c: bulbC, I: 1.6, r2: 0.25, out: 0 });
                P.halo(group, ...pr(x, ly - 0.05, lz), Math.max(1, 0.12 * s));
                set(z, CLS.UP, MAT.STONE, 1.4, null);
                P.fill(C.brass, g => { const [bx, by] = pr(x - 0.1, h + 0.06, z + 0.1); g.ellipse(bx, by, 0.07 * cam.mpx(z), 0.05 * cam.mpx(z), 0, 0, TAU); });
            }, { shadow: 0.3 });
            P.spots.desk = { x, z, h };
            P.hit('desk', ...box([[x - dp / 2, 0, z - w / 2], [x + dp / 2, h + 0.6, z - w / 2], [x - dp / 2, h, z + w / 2]].map(q => pr(...q))), { group });
            P.letter([0.85, 0.7, 0.35], 'SILENCE, PLEASE', ...pr(x - dp / 2 - 0.02, h - 0.2, z - 0.2), Math.max(4, 0.09 * cam.mpx(z)), { foot: cam.foot(z), squeeze: 0.55 });
        }
        // The tree: tiers of fir, a star, bulbs, and parcels under it.
        function tree(t) {
            const { x, z, h } = t, [fx, fy] = pr(x, 0, z), s = cam.mpx(z);
            const group = P.group('tree', { kind: 'tree' });
            P.solid(cam.z(z - 1.6), fx, fy, () => {
                set(z, CLS.UP, MAT.WOOD, 1.6, Math.PI / 2);
                P.fill([0.6, 0.12, 0.1], quad([[x - 0.8, 0, z], [x - 0.8, 0.5, z], [x + 0.8, 0.5, z], [x + 0.8, 0, z]]));
                for (let i = 0; i < 7; i++) {
                    const t0 = i / 7, y0 = 0.5 + t0 * (h - 1), w = (1 - t0) * 2.1 + 0.25, y1 = y0 + (h - 0.5) / 5.2;
                    set(z, CLS.UP, MAT.FIR, 1.6, null);
                    P.fill(P.vary([0.12, 0.3, 0.17], 0.12), g => { const a = pr(x - w, y0, z), b = pr(x, y1 + 0.6, z), c = pr(x + w, y0, z); g.moveTo(...a); g.quadraticCurveTo((a[0] + b[0]) / 2 - 0.1 * s, (a[1] + b[1]) / 2, b[0], b[1]); g.quadraticCurveTo((b[0] + c[0]) / 2 + 0.1 * s, (b[1] + c[1]) / 2, c[0], c[1]); g.quadraticCurveTo(b[0], a[1] + 0.3 * s, a[0], a[1]); });
                }
                for (let i = 0; i < 6; i++) { const px = x + rr(-1.6, 1.6), c = pick([[0.7, 0.1, 0.1], [0.12, 0.3, 0.5], [0.85, 0.7, 0.3], [0.2, 0.45, 0.25]]), w = rr(0.3, 0.55), hh = rr(0.25, 0.45); set(z - 0.6, CLS.UP, MAT.FIG, 1.4, null); P.fill(c, quad([[px - w / 2, 0, z - 0.8], [px - w / 2, hh, z - 0.8], [px + w / 2, hh, z - 0.8], [px + w / 2, 0, z - 0.8]])); P.fill(C.gilt, quad([[px - 0.03, 0, z - 0.81], [px - 0.03, hh, z - 0.81], [px + 0.03, hh, z - 0.81], [px + 0.03, 0, z - 0.81]])); }
            }, { shadow: 0.4 });
            for (let i = 0; i < 90; i++) { const t0 = rr(0.02, 0.95), y = 0.6 + t0 * (h - 1.2), w = (1 - t0) * 2 + 0.2, bx = x + rr(-1, 1) * w * 0.85; const [px, py] = pr(bx, y, z - 0.3); P.bulb(px, py, Math.max(0.7, 0.06 * s), cam.foot(z - 0.4), 'tree'); }
            const [sx, sy] = pr(x, h + 0.15, z);
            P.glowEll(group, 'rgb(255,226,140)', sx, sy, 0.3 * s, 0.3 * s);
            P.halo(group, sx, sy, 0.5 * s);
            P.light(group, { x, y: h * 0.45, z: cam.z(z - 0.8), c: [1, 0.78, 0.5], I: 3, r2: 1, out: 0 });
            P.spots.tree = { x, z, h, px: sx, py: sy };
            P.hit('tree', ...box([pr(x - 2.2, 0, z), pr(x + 2.2, h + 0.4, z)]), { group });
        }
    }

    return { compose, C, BOOKS, SHADES };
})();
