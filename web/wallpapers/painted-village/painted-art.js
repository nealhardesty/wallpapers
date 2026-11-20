// Painted Village's scenery, as an underpainting: the sky's place, the
// mountain, the woods with the cabin's clearing, the trail up to it and
// the glades cut into them, the ground and its drifts, the pond, the
// trodden lanes, firs, frosted maples, the grand tree and the toy train's
// track, lamps, fences, the sledding hill, the snowman, the bonfire. Flat local colour only: the brushwork and the
// light come after (painted-bake.js). Buildings are in painted-buildings.js.
// Everything is placed in metres and depth (PaintedLogic.camera).

const PaintedArt = (() => {
    const { clamp, CLS } = PaintedLogic;
    const { MAT, TAU, poly, ell } = PaintedPlates;
    const SNOW = [0.95, 0.955, 1], LAMP = [1, 0.68, 0.30], WINDOW = [1, 0.62, 0.24];
    // A stroke size given in CSS pixels, as the design pixels plates keep.
    const fine = (P, px, lo, hi) => clamp(px / P.cam.u, lo, hi);

    // ---- The far things ---------------------------------------------------------
    // Far things have no foot on the ground we can see, so each is given the
    // row of a depth that puts the right amount of air in front of it.
    const farFoot = (cam, z) => cam.hor + cam.f / z;

    function mountains(P, L, config) {
        const { W, hor, u } = P.cam, k = Math.min(1, hor / (300 * u)), foot = farFoot(P.cam, 13.5);
        const top = x => { const t = x / W; return k * (176 * Math.exp(-(((t - 0.34) / 0.2) ** 2)) + 150 * Math.exp(-(((t - 0.9) / 0.16) ** 2)) + 76 * Math.exp(-(((t - 0.63) / 0.1) ** 2)) + 70 * Math.exp(-(((t - 0.03) / 0.1) ** 2)) + 15 * Math.sin(t * 23) + 8 * Math.sin(t * 61 + 2) + 40); };
        const ridge = [], step = 13 * u, base = hor + 8 * u;
        for (let x = -30 * u; x <= W + 30 * u; x += step) ridge.push([x, hor - (top(x) + P.rr(-5, 5)) * u]);
        P.set({ cls: CLS.UP, foot, haze: 0, m: MAT.SNOW, size: 7, ang: 1.1 });
        P.fill([0.90, 0.91, 1], g => poly(g, [[-30 * u, base], ...ridge, [W + 30 * u, base]]));
        // Its faces: the ones that look left take the day's sun, the others are in their own shade.
        for (let i = 0; i < ridge.length - 1; i++) {
            const [x0, y0] = ridge[i], [x1, y1] = ridge[i + 1], left = y1 < y0, lean = (left ? 1 : -1) * P.rr(20, 70) * u, drop = P.rr(0.5, 1);
            P.set({ cls: left ? CLS.SIDEL : CLS.SIDER, m: MAT.SNOW, size: 7, ang: left ? 1.0 : 2.1 });
            P.fill(P.vary(left ? [0.95, 0.95, 1] : [0.80, 0.83, 0.97], 0.03), g => poly(g, [[x0, y0], [x1 + 1, y1], [x1 + lean, y1 + (base - y1) * drop], [x0 + lean, y0 + (base - y0) * drop]]));
        }
        // Rock where it is too steep for snow.
        P.set({ cls: CLS.UP, m: MAT.STONE, size: 5, ang: 1.2 });
        for (let i = 2; i < ridge.length - 2; i += 2) {
            const [x, y] = ridge[i], d = hor - y;
            if (d < 60 * u) continue;
            for (let n = 0; n < 2; n++) { const px = x + P.rr(-10, 30) * u, py = y + d * P.rr(0.08, 0.45), tri = [[px, py], [px + P.rr(16, 40) * u, py + d * P.rr(0.16, 0.36)], [px + P.rr(2, 12) * u, py + d * P.rr(0.2, 0.4)]]; P.fill(P.vary([0.48, 0.47, 0.64], 0.12), g => poly(g, tri)); }
        }
        // Woods up the lower slopes, thinning out.
        P.set({ cls: CLS.UP, m: MAT.FIR, size: 3.2, ang: Math.PI / 2, foot: farFoot(P.cam, 12.5) });
        for (let i = 0; i < 420; i++) {
            const x = P.rr(-10, W + 10), up = P.R() ** 1.6 * 0.5 * top(x) * u, r = P.rr(3, 6.5) * u;
            P.fill(P.vary([0.27, 0.34, 0.44], 0.16), g => poly(g, [[x - r * 0.5, hor - up + r], [x, hor - up - r * 1.7], [x + r * 0.5, hor - up + r]]));
        }
    }

    // How the woods stand at a row of the picture: the rank's line, its trees' size, its depth.
    const RANKS = 11;
    const rank = (cam, i) => { const t = i / (RANKS - 1); return { y0: cam.hor + (-74 + 152 * t) * cam.u, r: (5.5 + 8.5 * t) * cam.u, z: 13 - 6.6 * t }; };
    const wave = (cam, x, i) => (16 * Math.sin(x / (210 * cam.u) + i * 1.7) + 9 * Math.sin(x / (83 * cam.u) + i * 0.6)) * cam.u;
    const woodsZ = (cam, y) => 13 - 6.6 * clamp(((y - cam.hor) / cam.u + 74) / 152);
    // Open snow among the trees.
    function meadow(P, x, y, rx, ry, lobes = [[0, 0, 1, 1]]) {
        P.set({ cls: CLS.TOP, foot: farFoot(P.cam, woodsZ(P.cam, y)), m: MAT.SNOW, size: 4, haze: 0, ang: 0 });
        for (const [dx, dy, kx, ky] of lobes) P.fill(P.vary([0.93, 0.935, 1], 0.015), g => ell(g, x + dx * rx, y + dy * ry, rx * kx, ry * ky));
    }

    // A glade: snow lying open in the woods, uneven at its edges, a young fir or two and a fallen trunk in it.
    function glade(P, x, y, rx, ry) {
        const u = P.cam.u, lobes = [[0, 0, 0.8, 0.9]];
        for (let i = 0; i < 9; i++) { const a = i / 9 * TAU + P.rr(-0.2, 0.2), k = P.rr(0.45, 0.72); lobes.push([Math.cos(a) * k, Math.sin(a) * k * 0.8, P.rr(0.3, 0.5), P.rr(0.45, 0.7)]); }
        meadow(P, x, y, rx, ry, lobes);
        P.soft(x - rx * 0.2, y - ry * 0.2, rx * 0.7, ry * 0.7, [0.98, 0.98, 1], 0.5);
        const foot = farFoot(P.cam, woodsZ(P.cam, y));
        for (const [kx, h] of [[-0.74, 15], [0.8, 12], [0.62, 8]]) {
            const fx = x + kx * rx + P.rr(-4, 4) * u, fy = y - ry * 0.3, r = h * u;
            P.set({ cls: CLS.UP, foot, m: MAT.FIR, size: 2.6, ang: Math.PI / 2, haze: 0 });
            P.fill(P.vary([0.16, 0.26, 0.28], 0.15), g => poly(g, [[fx - r * 0.3, fy], [fx, fy - r], [fx + r * 0.3, fy]]));
            P.set({ cls: CLS.TOP, m: MAT.ROOF, size: 2.2, ang: 0 }); P.fill([0.88, 0.90, 0.99], g => poly(g, [[fx - r * 0.12, fy - r * 0.5], [fx, fy - r], [fx + r * 0.12, fy - r * 0.5]]));
        }
        P.set({ cls: CLS.UP, foot, m: MAT.WOOD, size: 1.8, ang: 0.1, haze: 0 }); P.line([0.30, 0.24, 0.24], 2.2 * u, g => { g.moveTo(x + rx * 0.3, y + ry * 0.12); g.lineTo(x + rx * 0.52, y + ry * 0.02); });
        P.set({ cls: CLS.TOP, m: MAT.ROOF, size: 1.8, ang: 0.1 }); P.line(SNOW, 1.1 * u, g => { g.moveTo(x + rx * 0.3, y + ry * 0.12 - 1.4 * u); g.lineTo(x + rx * 0.52, y + ry * 0.02 - 1.4 * u); });
    }

    // The house up the mountain, in its clearing among the firs: two floors
    // of logs, lit windows, a lamp by the door, a deck out over the slope
    // with a hot tub steaming on it, woodsmoke. The way down from its door
    // is the trail's (trailPath).
    function cabin(P, c) {
        const { W, hor, u } = P.cam, x = W * c.fx, y = hor - c.up * u, s = 5.2 * u, grp = P.group('cabin', { kind: 'window', far: true });
        const foot = farFoot(P.cam, 10.5);
        meadow(P, x - 1 * s, y + 1.1 * s, 14 * s, 3.1 * s, [[0, 0, 1, 1], [-0.5, 0.5, 0.6, 0.8], [0.55, 0.3, 0.5, 0.7], [-0.1, -0.5, 0.7, 0.7]]);
        // The firs that stand round it.
        P.set({ cls: CLS.UP, foot, m: MAT.FIR, size: 2.6, ang: Math.PI / 2, haze: 0 });
        for (const [dx, h] of [[-10.5, 11], [-8, 15], [8.5, 14], [11, 10], [14.5, 12], [-13, 8], [-5.6, 17], [6.2, 16]]) P.fill(P.vary([0.16, 0.25, 0.28], 0.15), g => poly(g, [[x + (dx - 1.6) * s, y + 0.5 * s], [x + dx * s, y - h * s], [x + (dx + 1.6) * s, y + 0.5 * s]]));
        // Two floors of logs under a deep roof, a stone chimney up the gable.
        P.set({ cls: CLS.UP, m: MAT.WOOD, size: 2, ang: 0 });
        for (let v = 0; v < 7.9; v += 0.8) P.fill(P.vary([0.40, 0.28, 0.22], 0.1), g => g.rect(x - 5 * s, y - (v + 0.8) * s, 10 * s, 0.84 * s));
        P.fill([0.36, 0.25, 0.20], g => poly(g, [[x - 5 * s, y - 8 * s], [x, y - 11.2 * s], [x + 5 * s, y - 8 * s]]));
        P.fill([0.25, 0.17, 0.14], g => g.rect(x - 5.2 * s, y - 4.3 * s, 10.4 * s, 0.34 * s));          // the beam between the floors
        P.set({ m: MAT.STONE, size: 2 }); P.fill([0.50, 0.47, 0.50], g => g.rect(x + 2.6 * s, y - 12.4 * s, 1.5 * s, 4.8 * s));
        P.set({ cls: CLS.TOP, m: MAT.ROOF, size: 2.4, ang: 0 });
        P.line(SNOW, 1.1 * s, g => { g.moveTo(x - 6 * s, y - 7.7 * s); g.lineTo(x, y - 11.5 * s); g.lineTo(x + 6 * s, y - 7.7 * s); });
        P.fill(SNOW, g => ell(g, x + 3.35 * s, y - 12.5 * s, 1.0 * s, 0.4 * s));
        P.set({ cls: CLS.UP, m: MAT.WOOD, size: 1.6, ang: Math.PI / 2 }); P.fill([0.26, 0.15, 0.12], g => g.rect(x - 0.8 * s, y - 2.6 * s, 1.6 * s, 2.6 * s));
        // Lit windows: two beside the door, three upstairs, one small in the gable.
        const pane = (cx, cy, w, h) => {
            P.set({ cls: CLS.SELF, m: MAT.GLASS, size: 1.6, haze: 0.1 });
            P.fill('#ffd27a', g => g.rect(cx - w / 2, cy - h / 2, w, h));
            P.glowRect(grp, 'rgba(255,196,100,0.95)', cx - w / 2, cy - h / 2, w, h);
            P.set({ cls: CLS.UP, m: MAT.WOOD, size: 1.4, haze: 0 }); P.fill([0.24, 0.15, 0.12], g => { g.rect(cx - 0.07 * s, cy - h / 2, 0.14 * s, h); g.rect(cx - w / 2, cy - 0.07 * s, w, 0.14 * s); });
            P.set({ cls: CLS.TOP, m: MAT.ROOF, size: 1.6 }); P.line(SNOW, 0.26 * s, g => { g.moveTo(cx - w / 2 - 0.1 * s, cy + h / 2 + 0.1 * s); g.lineTo(cx + w / 2 + 0.1 * s, cy + h / 2 + 0.1 * s); });
        };
        for (const dx of [-3.1, 3.1]) pane(x + dx * s, y - 2.05 * s, 1.8 * s, 1.7 * s);
        for (const dx of [-3.1, 0, 3.1]) pane(x + dx * s, y - 6.1 * s, 1.7 * s, 1.6 * s);
        pane(x, y - 9.3 * s, 1.0 * s, 0.9 * s);
        // The deck, out over the slope on posts at the downhill end, with split logs stacked under it.
        const d0 = x + 5 * s, d1 = x + 13.2 * s, back = y - 2.5 * s, front = y - 0.9 * s, tub = P.group('cabin.tub', { kind: 'porch', far: true });
        P.set({ cls: CLS.UP, m: MAT.WOOD, size: 1.4, ang: 0, haze: 0 });
        for (let v = 0; v < 2; v++) for (let k = 0; k < 4 - v; k++) P.fill(P.vary([0.52, 0.40, 0.30], 0.18), g => ell(g, x + (6.0 + k * 0.75 + v * 0.38) * s, y - (0.1 + v * 0.5) * s, 0.36 * s, 0.26 * s));
        P.set({ ang: Math.PI / 2 });
        for (const px of [d0 + 0.3 * s, d0 + 4 * s, d1 - 0.5 * s]) P.fill([0.24, 0.17, 0.14], g => g.rect(px - 0.16 * s, front, 0.32 * s, (1.3 + 1.1 * (px - d0) / (d1 - d0)) * s));
        P.line([0.24, 0.17, 0.14], Math.max(0.8, 0.14 * s), g => { g.moveTo(d0 + 4 * s, front + 0.2 * s); g.lineTo(d1 - 0.5 * s, front + 1.9 * s); });
        P.set({ cls: CLS.TOP, m: MAT.WOOD, size: 1.6, ang: 0 }); P.fill([0.80, 0.80, 0.90], g => poly(g, [[d0, back], [d1 - 0.5 * s, back], [d1, front], [d0 - 0.3 * s, front]]));        // its boards, swept
        P.set({ cls: CLS.UP, m: MAT.WOOD, size: 1.4, ang: 0 }); P.fill([0.30, 0.21, 0.17], g => g.rect(d0 - 0.3 * s, front, d1 - d0 + 0.3 * s, 0.34 * s));
        // The rail behind, the hot tub, the rail in front.
        const rail = (x0, x1, yy) => {
            P.set({ cls: CLS.UP, m: MAT.WOOD, size: 1.4, ang: Math.PI / 2 });
            for (let px = x0; px <= x1 + 0.01; px += (x1 - x0) / Math.max(1, Math.round((x1 - x0) / (2 * s)))) P.fill([0.30, 0.21, 0.17], g => g.rect(px - 0.09 * s, yy - 1.1 * s, 0.18 * s, 1.1 * s));
            P.set({ cls: CLS.TOP, m: MAT.ROOF, size: 1.4, ang: 0 }); P.line(SNOW, Math.max(0.9, 0.2 * s), g => { g.moveTo(x0, yy - 1.12 * s); g.lineTo(x1, yy - 1.12 * s); });
        };
        rail(d0 + 0.2 * s, d1 - 0.6 * s, back);
        const tx = x + 9.3 * s, ty = y - 1.5 * s;          // the tub's foot, in the middle of the boards
        P.set({ cls: CLS.UP, m: MAT.WOOD, size: 1.4, ang: Math.PI / 2 });
        for (let k = -4; k <= 4; k++) P.fill(P.vary([0.56, 0.37, 0.24], 0.12), g => g.rect(tx + (k * 0.4 - 0.21) * s, ty - 1.3 * s, 0.42 * s, (1.3 + 0.2 * Math.sqrt(Math.max(0, 1 - (k / 4.4) ** 2))) * s));
        P.fill([0.18, 0.13, 0.12], g => { g.rect(tx - 1.8 * s, ty - 0.95 * s, 3.6 * s, 0.13 * s); g.rect(tx - 1.8 * s, ty - 0.38 * s, 3.6 * s, 0.13 * s); });        // its hoops
        P.fill([0.64, 0.45, 0.30], g => ell(g, tx, ty - 1.3 * s, 1.86 * s, 0.66 * s));
        P.set({ cls: CLS.SELF, m: MAT.GLASS, size: 1.4, ang: 0, haze: 0 }); P.fill('#66d2d6', g => ell(g, tx, ty - 1.3 * s, 1.52 * s, 0.48 * s));
        P.glowEll(tub, 'rgba(120,236,232,0.95)', tx, ty - 1.3 * s, 1.52 * s, 0.48 * s); P.halo(tub, tx, ty - 1.35 * s, 2.6 * s);
        P.smoke(tx, ty - 1.6 * s, 5.5 * u, 30);            // steam off the water
        // The rail in front, open before the tub so that we see it; a towel over it; a lantern on the corner post.
        rail(d0 - 0.2 * s, tx - 2.3 * s, front); rail(tx + 2.3 * s, d1 - 0.1 * s, front);
        P.set({ cls: CLS.UP, m: MAT.FIG, size: 1.4, ang: Math.PI / 2 }); P.fill([0.78, 0.16, 0.14], g => g.rect(d0 + 0.5 * s, front - 1.16 * s, 0.6 * s, 0.7 * s));
        P.set({ cls: CLS.SELF, m: MAT.GLASS, size: 1.4 }); P.fill('#ffe2a0', g => ell(g, d1 - 0.1 * s, front - 1.5 * s, 0.24 * s, 0.3 * s));
        P.glowEll(tub, 'rgba(255,210,120,1)', d1 - 0.1 * s, front - 1.5 * s, 0.28 * s, 0.32 * s); P.halo(tub, d1 - 0.1 * s, front - 1.5 * s, 1.2 * s);
        // Snow drifted up the wall, a lamp by the door.
        P.set({ cls: CLS.TOP, m: MAT.ROOF, size: 2 }); P.fill(SNOW, g => { for (const dx of [-4.2, -2, 2.2, 4.2]) ell(g, x + dx * s, y - 0.1 * s, 1.5 * s, 0.6 * s); });
        P.set({ cls: CLS.SELF, m: MAT.GLASS, size: 1.4 }); P.fill('#ffe2a0', g => ell(g, x - 1.5 * s, y - 2.2 * s, 0.26 * s, 0.32 * s));
        P.glowEll(grp, 'rgba(255,210,120,1)', x - 1.5 * s, y - 2.2 * s, 0.3 * s, 0.34 * s);
        // What the windows put on the snow in front.
        P.set({ cls: CLS.TOP, m: MAT.SNOW, size: 3, haze: 0, ang: 0 });
        P.soft(x, y + 1.3 * s, 8 * s, 1.6 * s, [1, 0.86, 0.66], 0.5);
        for (const [dx, dy] of [[-3.1, 2], [3.1, 2], [-3.1, 6.1], [3.1, 6.1], [-1.5, 2.2]]) P.halo(grp, x + dx * s, y - dy * s, dx === -1.5 ? 1.3 * s : 2.2 * s);
        P.smoke(x + 3.35 * s, y - 12.8 * s, 9 * u, 30);
        P.hit('cabin', x - 8 * s, y - 13 * s, x + 13.4 * s, y + 3 * s, { groups: [grp, tub] });
        P.spots.cabin = { x, y, s, group: grp };
    }

    // The trail from the top of the town up to the cabin's door: where it
    // goes, foot to door, in pixels. It swings from side to side as it climbs.
    function trailPath(P, c, L) {
        const cam = P.cam, { W, hor, u } = cam, n = L.nodes[L.trail], ex = cam.sx(n.x, n.z), ey = cam.sy(n.z), cx = W * c.fx, cy = hor - c.up * u + 3 * u;
        const amp = Math.min(60 * u, 22 * u + Math.abs(cx - ex) * 0.2), pts = [];
        for (let i = 0; i <= 48; i++) { const t = i / 48, e = t * t * (3 - 2 * t); pts.push([ex + (cx - ex) * (0.4 * t + 0.6 * e) + amp * Math.sin(t * Math.PI * 3) * Math.sin(Math.PI * t) ** 0.7, ey + (cy - ey) * t]); }
        return pts;
    }
    // Its lanterns: a post every so often, each a small light among the trees.
    function trailLamps(P, pts) {
        const u = P.cam.u, grp = P.group('trail', { kind: 'porch', far: true });
        for (let i = 5; i < pts.length - 4; i += 7) {
            const [x, y] = pts[i], k = (0.75 + 0.5 * (1 - i / pts.length)) * u, px = x + 4.5 * k;
            P.set({ cls: CLS.UP, foot: farFoot(P.cam, woodsZ(P.cam, y)), m: MAT.WOOD, size: 1.4, ang: Math.PI / 2, haze: 0 });
            P.fill([0.16, 0.13, 0.14], g => g.rect(px - 0.4 * k, y - 6.4 * k, 0.8 * k, 6.4 * k));
            P.set({ cls: CLS.SELF, m: MAT.GLASS, size: 1.4 }); P.fill('#ffe2a0', g => ell(g, px, y - 7.2 * k, 1.1 * k, 1.3 * k));
            P.glowEll(grp, 'rgba(255,206,116,1)', px, y - 7.2 * k, 1.2 * k, 1.4 * k); P.halo(grp, px, y - 7.2 * k, 6 * k);
        }
        P.spots.trail = pts;
    }

    // The woods between the town and the mountain: firs in ranks up the
    // foothills. `open` is where they stand back: the cabin's clearing, the
    // trail, the glades, each { x, y, rx, ry, draw }. An opening is painted
    // once the ranks behind it are, so the ranks in front stand in front of
    // it; of those, a tree that would hide most of it is not planted.
    function forest(P, L, open = []) {
        const { cam } = P, { W, u } = cam;
        for (const c of open) { c.rank = RANKS; for (let i = 0; i < RANKS; i++) if (rank(cam, i).y0 + wave(cam, c.x, i) > c.y) { c.rank = i; break; } }
        // The floor of the wood, from the first rank to the last: where two ranks stand apart, it is dark between them, not open ground.
        const line = (i, dy) => { const { y0, r } = rank(cam, i), out = []; for (let x = -20 * u; x <= W + 20 * u; x += 24 * u) out.push([x, y0 + wave(cam, x, i) + r * 0.6 + dy]); return out; };
        P.set({ cls: CLS.UP, foot: farFoot(cam, 9.7), haze: 0, m: MAT.FIR, size: 3.4, ang: Math.PI / 2 });
        P.fill([0.19, 0.26, 0.32], g => poly(g, [...line(0, 0), ...line(RANKS - 1, 12 * u).reverse()]));
        for (let i = 0; i < RANKS; i++) {
            const { y0, r, z } = rank(cam, i), near = open.filter(c => c.rank <= i), set = () => P.set({ cls: CLS.UP, foot: farFoot(cam, z), haze: 0, m: MAT.FIR, size: 3.4, ang: Math.PI / 2 });
            // The dark of the wood under them, what is open in it, then the trees along its top.
            const edge = []; for (let x = -20 * u; x <= W + 20 * u; x += 24 * u) edge.push([x, y0 + wave(cam, x, i) + r * 0.6]);
            set(); P.fill(P.vary([0.20, 0.27, 0.33], 0.06), g => poly(g, [...edge, ...edge.slice().reverse().map(([x, y]) => [x, y + 22 * u + r * 0.5])]));
            for (const c of open) if (c.rank === i) c.draw();
            set();
            for (let x = -10 * u + P.rr(0, r); x < W + 10 * u; x += r * P.rr(0.55, 1.05)) {
                const y = y0 + wave(cam, x, i) + P.rr(-0.3, 0.5) * r, h = r * P.rr(1.7, 2.5), snowy = P.R() < 0.34;
                if (near.some(c => Math.abs(x - c.x) < c.rx * 0.94 && y - h < c.y + c.ry * (c.cut ?? 0.3) && y + r > c.y - c.ry)) continue;
                P.fill(P.vary(snowy ? [0.52, 0.60, 0.70] : [0.17, 0.26, 0.29], 0.16), g => poly(g, [[x - r * 0.5, y + r], [x, y - h], [x + r * 0.5, y + r]]));
                if (snowy) P.fill([0.86, 0.89, 0.98], g => poly(g, [[x - r * 0.2, y - h * 0.45], [x, y - h], [x + r * 0.2, y - h * 0.45]]));
            }
        }
        for (const c of open) if (c.rank === RANKS) c.draw();
    }

    // ---- The ground -------------------------------------------------------------

    function ground(P) {
        const { W, H, hor, f, u, sx, sy, sc } = P.cam;
        P.set({ cls: CLS.GROUND, m: MAT.SNOW, size: 10, ang: null, haze: 0, foot: H });
        P.fill([0.95, 0.955, 1.0], g => g.rect(0, hor - 4, W, H - hor + 4));
        for (let i = 0; i < 90; i++) {
            const y = hor + f * P.R() ** 1.6, k = (y - hor) / f;
            P.soft(P.rr(0, W), y, P.rr(60, 320) * u * (0.3 + k), P.rr(8, 40) * u * (0.2 + k), P.pick([[0.99, 0.95, 0.96], [0.90, 0.93, 1], [0.98, 0.98, 1], [0.93, 0.92, 0.99]]), 0.4);
        }
        const half = P.cam.half(1);
        for (let i = 0; i < 260; i++) {
            const z = 1 / P.rr(0.07, 1.2), x = P.rr(-1.05, 1.05) * half * z, rx = P.rr(2, 9) * sc(z);
            P.hump(sx(x, z), sy(z), rx, rx * P.rr(0.16, 0.3), P.rr(0.12, 0.42));
        }
    }

    function pond(P, L) {
        if (!L.pond) return;
        const { W, H, u, sx, sy, sc } = P.cam;
        const left = L.pond.left.map(([x, z]) => [sx(x, z), sy(z), z]), right = L.pond.right.map(([x, z]) => [sx(x, z), sy(z), z]);
        const outline = [...left.map(p => [p[0], p[1]]), ...right.slice().reverse().map(p => [p[0], p[1]])];
        P.set({ cls: CLS.GROUND, m: MAT.ICE, size: 8, ang: 0.02, haze: 0, foot: H });
        P.fill([0.40, 0.47, 0.66], g => poly(g, outline));
        // Blown snow on the ice, and the marks of blades.
        const g = P.alb; g.save(); g.beginPath(); poly(g, outline); g.clip();
        const r = L.pond.rink;
        for (let i = 0; i < 54; i++) { const z = 1 / P.rr(0.1, 1.2), y = sy(z); P.soft(P.rr(0, W), y, P.rr(2, 9) * sc(z), P.rr(0.3, 0.9) * sc(z), [0.93, 0.95, 1], P.rr(0.25, 0.6)); }
        g.lineCap = 'round';
        for (let i = 0; i < 110; i++) {
            const z = P.rr(r.z0, r.z1), cx = sx(r.x + P.rr(-r.rx, r.rx) * 0.9, z), cy = sy(z), rad = P.rr(1, 6) * sc(z), a0 = P.rr(0, TAU);
            g.strokeStyle = 'rgba(232,240,255,0.45)'; g.lineWidth = P.rr(0.8, 1.8) * u;
            g.beginPath(); g.ellipse(cx, cy, rad, rad * 0.3, 0, a0, a0 + P.rr(0.8, 2.6)); g.stroke();
        }
        g.restore();
        // Banks: a raised lip of snow each side.
        for (const [edge, sign] of [[left, -1], [right, 1]]) for (const [x, y, z] of edge) {
            const s = sc(z);
            P.hump(x + sign * 1.4 * s, y, 3 * s, 0.7 * s, 0.5);
            P.set({ cls: CLS.GROUND, m: MAT.SNOW, size: 7, ang: null });
            P.fill(P.vary([0.97, 0.97, 1], 0.02), c => ell(c, x + sign * P.rr(0.5, 1.4) * s, y + P.rr(-0.1, 0.1) * s, P.rr(1.4, 2.8) * s, P.rr(0.3, 0.55) * s));
        }
        const xs = outline.map(p => p[0]), ys = outline.map(p => p[1]);
        P.spots.ice = [Math.max(0, Math.min(...xs)), Math.max(0, Math.min(...ys)), Math.min(W, Math.max(...xs)), Math.min(H, Math.max(...ys))];
    }

    // The brook out of the pond: a ribbon of ice between banks of snow.
    function brook(P, L) {
        if (!L.brook) return;
        const { H, sx, sy, sc } = P.cam, pts = [];
        for (let i = 0; i < L.brook.length - 1; i++) for (let t = 0; t < 1; t += 0.125) {
            const a = L.brook[i], b = L.brook[i + 1], e = t * t * (3 - 2 * t), z = a[1] + (b[1] - a[1]) * t;
            pts.push([a[0] + (b[0] - a[0]) * (t * 0.5 + e * 0.5) + 0.8 * Math.sin(z * 31), z, a[2] + (b[2] - a[2]) * t]);
        }
        P.set({ cls: CLS.GROUND, m: MAT.ICE, size: 4, ang: 0.02, haze: 0, foot: H });
        P.fill([0.34, 0.40, 0.58], g => poly(g, [...pts.map(([x, z, hw]) => [sx(x - hw, z), sy(z)]), ...pts.slice().reverse().map(([x, z, hw]) => [sx(x + hw, z), sy(z)])]));
        for (const [x, z, hw] of pts) for (const sign of [-1, 1]) {
            const s = sc(z);
            P.hump(sx(x + sign * (hw + 0.8), z), sy(z), 2 * s, 0.5 * s, 0.4);
            P.set({ cls: CLS.GROUND, m: MAT.SNOW, size: 6, ang: null });
            P.fill(P.vary([0.97, 0.97, 1], 0.02), c => ell(c, sx(x + sign * (hw + P.rr(0, 0.5)), z), sy(z), P.rr(0.8, 1.5) * s, P.rr(0.2, 0.36) * s));
        }
    }

    // Trodden snow along every way people walk, with a low bank each side;
    // and the street, packed by runners.
    function lanes(P, L) {
        if (L.road) {
            const { sx, sy, sc, W } = P.cam, z = L.road.z + P.cam.dz(1), s = sc(z), y = sy(z);
            P.set({ cls: CLS.GROUND, m: MAT.SNOW, size: 6, ang: 0.02, haze: 0 });
            for (let px = -20; px < W + 20; px += 1.6 * s) P.fill(P.vary([0.885, 0.875, 0.955], 0.02, 0.01), g => ell(g, px + P.rr(-0.4, 0.4) * s, y + P.rr(-0.25, 0.25) * s, P.rr(1.6, 2.6) * s, P.rr(0.5, 0.8) * s));
            const g = P.alb; g.save(); g.strokeStyle = 'rgba(176,180,214,0.7)'; g.lineWidth = Math.max(0.8, 0.12 * s);
            for (const dy of [-0.3, 0.25]) { g.beginPath(); for (let px = -20; px <= W + 20; px += 30) g.lineTo(px, y + dy * s + 0.12 * s * Math.sin(px / (40 * s))); g.stroke(); }
            g.restore();
            for (let px = 0; px < W; px += 5 * s) { P.hump(px, y - 1.3 * s, 3.4 * s, 0.5 * s, 0.25); P.hump(px, y + 1.3 * s, 3.4 * s, 0.5 * s, 0.25); }
        }
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
        if (o.star) {
            const grp = P.group('fir' + P.groups.length, { kind: 'tree' }), ty = fy - h * 1.01, r = Math.max(2.4 * u, 0.3 * s);
            P.set({ cls: CLS.SELF, m: MAT.GLASS, size: 1.6, ang: null, foot: fy, haze: 0 });
            P.fill('#fff0b0', g => star(g, fx, ty, r));
            P.glowEll(grp, 'rgba(255,226,140,0.95)', fx, ty, r * 0.8, r * 0.8); P.halo(grp, fx, ty, r * 1.2);
            P.light(grp, { x: xm, y: hM * 0.35, z, c: [1, 0.80, 0.56], I: 7, r2: 1.2, out: 1.2 });
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

    const star = (g, x, y, r) => { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * 0.44 : r; g[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rad, y + Math.sin(a) * rad); } g.closePath(); };

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
        const grp = P.group('tree', { kind: 'tree' }), R = t.h * 0.34;
        // The toy train's track: sleepers and two rails round the foot of it, the far half first.
        const track = far => {
            if (config.train === false) return;
            const { zm } = P.cam, at = (a, r) => [sx(t.x + Math.cos(a) * r, t.z + Math.sin(a) * r / zm), sy(t.z + Math.sin(a) * r / zm)], a0 = far ? 0 : Math.PI, n = Math.round(R * 2.6);
            P.set({ cls: CLS.GROUND, foot: fy, m: MAT.WOOD, size: 1.6, ang: null, haze: 0 });
            for (let i = 0; i <= n; i++) { const a = a0 + Math.PI * i / n, p = at(a, R - 0.5), q = at(a, R + 0.5); P.line(P.vary([0.36, 0.28, 0.24], 0.12), Math.max(1, 0.2 * s), g => { g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); }); }
            for (const r of [R - 0.3, R + 0.3]) P.line([0.24, 0.25, 0.32], Math.max(0.9, 0.07 * s), g => { for (let i = 0; i <= 40; i++) { const p = at(a0 + Math.PI * i / 40, r); g.lineTo(p[0], p[1]); } });
        };
        track(true);
        fir(P, t.x, t.z, t.h, { lights: config.lights === false ? 0 : Math.round(16 * t.h), set: 'tree', snow: 0.5, dark: [0.10, 0.24, 0.17], reflect: true });
        // The star.
        const ty = fy - h * 1.0, r = Math.max(0.6 * s, 0.045 * h);
        P.set({ cls: CLS.SELF, m: MAT.GLASS, size: 1.6, ang: null, foot: fy, haze: 0 });
        P.fill('#fff0b0', g => star(g, fx, ty, r));
        P.glowEll(grp, 'rgba(255,226,140,0.95)', fx, ty, r * 0.8, r * 0.8);
        P.halo(grp, fx, ty, r * 1.3);
        P.light(grp, { x: t.x, y: t.h * 0.3, z: t.z, c: [1, 0.78, 0.5], I: 30, r2: 3, out: 2.5 });
        P.light(grp, { x: t.x, y: t.h * 1.0, z: t.z, c: [1, 0.86, 0.6], I: 5, r2: 0.8 });
        // Parcels, half under the snow.
        for (let i = 0; i < 9; i++) {
            const px = fx + P.rr(-0.2, 0.2) * h, w = P.rr(0.9, 1.6) * s, hh = P.rr(0.6, 1.1) * s, col = P.pick([[0.72, 0.14, 0.14], [0.16, 0.36, 0.56], [0.86, 0.66, 0.2], [0.2, 0.46, 0.28], [0.56, 0.2, 0.5]]);
            P.set({ cls: CLS.UP, foot: fy, m: MAT.FIG, size: 2, ang: Math.PI / 2 });
            P.fill(col, g => g.rect(px - w / 2, fy - hh, w, hh));
            P.fill([0.95, 0.9, 0.7], g => { g.rect(px - w * 0.07, fy - hh, w * 0.14, hh); g.rect(px - w / 2, fy - hh * 0.6, w, hh * 0.14); });
            P.set({ cls: CLS.TOP, m: MAT.ROOF, size: 2.4 }); P.fill(SNOW, g => ell(g, px, fy - hh, w * 0.55, hh * 0.18));
        }
        track(false);
        P.spots.tree = { x: t.x, z: t.z, h: t.h, fx, fy, r: R, group: grp, top: ty };
        P.hit('tree', fx - h * 0.27, fy - h * 1.05, fx + h * 0.27, fy, { group: grp });
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
        const { sx, sy, sc } = P.cam, fx = sx(at.x, at.z), fy = sy(at.z), s = sc(at.z) * 1.5;
        const grp = P.group('lamp' + i, { kind: 'lamp', x: at.x, z: at.z });
        const post = () => {
            P.set({ cls: CLS.UP, foot: fy, m: MAT.WOOD, size: 2, ang: Math.PI / 2, haze: 0 });
            P.fill([0.10, 0.11, 0.14], g => { g.rect(fx - 0.06 * s, fy - 3.0 * s, 0.12 * s, 3.0 * s); g.rect(fx - 0.14 * s, fy - 0.5 * s, 0.28 * s, 0.5 * s); g.rect(fx - 0.3 * s, fy - 2.5 * s, 0.6 * s, 0.05 * s); });
        };
        P.solid(at.z, fx, fy, post, { reflect: [fx - 0.4 * s, fy - 3.6 * s, fx + 0.4 * s, fy] });
        lantern(P, grp, fx, fy - 3.25 * s, s * 1.35, { x: at.x, y: 4.9, z: at.z }, 26);
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
        if (o.snowy) for (const [x, z] of posts) P.bulb(sx(x, z), sy(z) - 1.36 * sc(z), Math.max(1.1 * P.cam.u, 0.05 * sc(z)), sy(z), 'string');
        if ('cardinal' in o) P.spots.fence = posts;
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
        const { sx, sy, sc } = P.cam, fx = sx(t.x, t.z), fy = sy(t.z), s = sc(t.z) * 1.5, X = x => fx + x * s, Y = y => fy - y * s;
        P.solid(t.z, fx, fy, () => {
            P.set({ cls: CLS.TOP, foot: fy, m: MAT.ROOF, size: 2.6, ang: null, haze: 0 });
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
        const { sx, sy, sc } = P.cam, fx = sx(t.x, t.z), fy = sy(t.z), s = sc(t.z) * 2.4;
        const grp = P.group('fire', { kind: 'fire' });
        P.set({ cls: CLS.GROUND, m: MAT.SNOW, size: 4, ang: null, foot: fy, haze: 0 });
        P.fill([0.62, 0.58, 0.62], g => ell(g, fx, fy, 1.15 * s, 0.3 * s));                    // thawed and trodden round it
        P.solid(t.z, fx, fy, () => {
            P.set({ cls: CLS.UP, foot: fy, m: MAT.STONE, size: 2.4, ang: null, haze: 0 });
            for (let a = 0; a < TAU; a += 0.5) P.fill(P.vary([0.42, 0.40, 0.42], 0.15), g => ell(g, fx + Math.cos(a) * 0.62 * s, fy + Math.sin(a) * 0.17 * s - 0.06 * s, 0.14 * s, 0.1 * s));
            P.set({ m: MAT.WOOD, size: 2.4, ang: 0.4 });
            for (const [a, b] of [[-0.5, 0.42], [0.5, -0.4], [-0.15, 0.5], [0.2, -0.5]]) P.line(P.vary([0.20, 0.13, 0.10], 0.2), 0.13 * s, g => { g.moveTo(fx + a * s, fy - 0.04 * s); g.lineTo(fx + b * 0.3 * s, fy - 0.62 * s); });
        }, { shadow: 0, reflect: [fx - s, fy - s, fx + s, fy] });
        // A log to sit on, on whichever side there is room for one (t.log: -1, 1, or 0 for none).
        const lx = fx + (t.log ?? -1) * 2.1 * s, ly = fy + 0.02 * s;
        if (t.log !== 0) P.solid(t.z + 0.01, lx, ly, () => {
            P.set({ cls: CLS.UP, foot: ly, m: MAT.WOOD, size: 2.6, ang: 0, haze: 0 }); P.fill([0.26, 0.19, 0.16], g => g.rect(lx - 0.9 * s, ly - 0.42 * s, 1.8 * s, 0.42 * s));
            P.set({ cls: CLS.TOP, m: MAT.ROOF, size: 2.6 }); P.fill(SNOW, g => ell(g, lx, ly - 0.44 * s, 0.92 * s, 0.1 * s));
        }, { shadow: 0.5 });
        P.light(grp, { x: t.x, y: 1.2, z: t.z, c: [1, 0.52, 0.18], I: 30, r2: 1, out: 0 });
        P.spots.fire = { x: t.x, z: t.z, fx, fy, s, group: grp };
        P.hit('fire', fx - 1.2 * s, fy - 1.6 * s, fx + 1.2 * s, fy + 0.3 * s, { group: grp });
    }

    // ---- The tree farm, the sledding hill, the sign, a bench -------------------------

    // Christmas trees in rows up the hill, a block of each age, gaps where some have gone home.
    function treeFarm(P, t) {
        const { sx, sy, sc, u } = P.cam, step = P.cam.dz(7.5), ages = [4.8, 3.2, 5.8, 2.4, 4.0];
        const rows = [];
        for (let z = t.z1, i = 0; z >= t.z0; z -= step, i++) rows.push([z, i]);
        for (const [z, i] of rows) {
            const s = sc(z), fy = sy(z), x0 = t.x0 - t.spread * (z - t.z0), x1 = t.x1 - t.slant * (z - t.z0), hM = ages[Math.floor(i / 3) % ages.length];
            for (let x = x1 - P.rr(0, 2); x > x0; x -= 3.9) {
                if (P.R() < 0.07) { if (P.R() < 0.5) { P.set({ cls: CLS.UP, foot: fy, m: MAT.WOOD, size: 1.6, ang: null, haze: 0 }); P.fill([0.50, 0.40, 0.32], g => ell(g, sx(x, z), fy - 0.12 * s, 0.26 * s, 0.16 * s)); } continue; }   // a stump
                const fx = sx(x + P.rr(-0.3, 0.3), z), h = hM * P.rr(0.86, 1.12) * s, w = h * 0.3;
                P.set({ cls: CLS.UP, foot: fy, m: MAT.FIR, size: fine(P, s * 0.07, 1.8, 3.4), ang: Math.PI / 2, haze: 0 });
                for (let k = 0; k < 3; k++) { const b = fy - h * (0.06 + 0.27 * k), tp = fy - h * (0.5 + 0.25 * k), hw = w * (1 - 0.26 * k); P.fill(P.vary([0.12, 0.27, 0.20], 0.2, 0.02), g => poly(g, [[fx - hw, b], [fx, tp], [fx + hw, b]])); }
                P.set({ cls: CLS.TOP, m: MAT.ROOF, size: fine(P, s * 0.06, 1.8, 3), ang: 0 });
                for (let k = 0; k < 3; k++) if (P.R() < 0.7) { const b = fy - h * (0.12 + 0.27 * k), hw = w * (1 - 0.26 * k) * 0.7; P.fill(P.vary([0.94, 0.95, 1], 0.03), g => ell(g, fx - hw * 0.3, b - h * 0.06, hw * 0.75, Math.max(0.8 * u, h * 0.035), 0.35)); }
                P.hump(fx, fy, w * 1.6, w * 0.4, 0.3);
            }
        }
        P.spots.farm = { z0: t.z0, z1: t.z1 };
    }

    // The sledding hill: a round knoll of snow (PaintedLogic.knollAt), in
    // facets far to near so that its brow hides what is behind it. Each facet
    // is brushed down its own slope, lighter where it faces the day and
    // bluer where it turns away; the runs the sleds have worn go down it and
    // out across the flat; firs stand on its far shoulder.
    function sledHill(P, t) {
        const cam = P.cam, { sx, sy, sc, zm } = cam, hAt = (x, z) => PaintedLogic.knollAt(t, zm, x, z);
        const NX = 32, NZ = 16, dzr = t.rd / zm, at = (x, z) => [sx(x, z), sy(z) - hAt(x, z) * sc(z)];
        const firs = [[0.2, 0.5, 7.5], [0.36, 0.4, 6], [0.5, 0.52, 8], [0.06, 0.62, 6.5], [-0.14, 0.42, 7], [0.64, 0.3, 5.5]].map(([kx, kz, h]) => ({ x: t.x + kx * t.rx, z: t.z + kz * dzr, h }));
        const fy = sy(t.z - dzr), day = [-0.52, 0.62, -0.58], flat = day[1];
        const body = () => {
            for (let j = NZ - 1; j >= 0; j--) {
                const z0 = t.z - dzr + 2 * dzr * j / NZ, z1 = z0 + 2 * dzr / NZ, zc = (z0 + z1) / 2;
                // Whatever stands on this row of it, before the rows in front.
                for (const f of firs) if (f.z >= z0 && f.z < z1) {
                    const [px, py] = at(f.x, f.z), r = f.h * sc(f.z);
                    P.set({ cls: CLS.UP, foot: sy(f.z), m: MAT.FIR, size: 2.4, ang: Math.PI / 2, haze: 0 });
                    for (let i = 0; i < 3; i++) P.fill(P.vary([0.13, 0.26, 0.21], 0.2), g => poly(g, [[px - r * 0.26 * (1 - 0.25 * i), py - r * 0.25 * i], [px, py - r * (0.5 + 0.25 * i)], [px + r * 0.26 * (1 - 0.25 * i), py - r * 0.25 * i]]));
                    P.set({ cls: CLS.TOP, m: MAT.ROOF, size: 2.2, ang: 0 });
                    for (let i = 0; i < 3; i++) P.fill(SNOW, g => ell(g, px - r * 0.07, py - r * (0.14 + 0.25 * i), r * 0.16 * (1 - 0.25 * i), r * 0.035, 0.3));
                }
                for (let i = 0; i < NX; i++) {
                    const x0 = t.x - t.rx + 2 * t.rx * i / NX, x1 = x0 + 2 * t.rx / NX, xc = (x0 + x1) / 2;
                    if (hAt(xc, zc) < 0.015) continue;
                    // Its slope across and away, and so which way it faces.
                    const gx = (hAt(xc + 0.5, zc) - hAt(xc - 0.5, zc)), gd = (hAt(xc, zc + 0.5 / zm) - hAt(xc, zc - 0.5 / zm)), len = Math.hypot(gx, 1, gd), n = [-gx / len, 1 / len, -gd / len];
                    const lit = n[0] * day[0] + n[1] * day[1] + n[2] * day[2] - flat, steep = Math.hypot(gx, gd);
                    const p = at(xc, zc), q = steep > 0.02 ? at(xc - gx / steep, zc - gd / steep / zm) : null;
                    P.set({ cls: n[0] < -0.2 ? CLS.TOPL : n[0] > 0.2 ? CLS.TOPR : CLS.TOP, foot: sy(zc), m: MAT.SNOW, size: 5, haze: 0, ang: q ? Math.atan2(q[1] - p[1], q[0] - p[0]) : null });
                    P.fill([0.95 + lit * 0.36, 0.955 + lit * 0.30, 1 + lit * 0.07], g => { const a = at(x0, z1), b = at(x1, z1), c = at(x1, z0), d = at(x0, z0); poly(g, [[a[0] - 0.4, a[1]], [b[0] + 0.4, b[1]], [c[0] + 0.4, c[1] + 0.8], [d[0] - 0.4, d[1] + 0.8]]); });
                }
            }
        };
        P.solid(t.z + dzr, sx(t.x, t.z), fy, body, { shadow: 0 });
        // The runs: down the slope, and a long way out over the flat.
        for (const k of [0.04, 0.3, 0.52, 0.76, 0.97]) {
            const a = t.a0 + (t.a1 - t.a0) * k, R = PaintedLogic.knollRim(t, a), run = s => PaintedLogic.knollRun(t, zm, a, s), col = P.vary([0.80, 0.83, 0.96], 0.02);
            for (const [s0, s1, cls] of [[0.12 * R, R, CLS.TOP], [R, R + 13, CLS.GROUND]]) {
                P.set({ cls, foot: sy(run((s0 + s1) / 2).z), m: MAT.SNOW, size: 2.4, haze: 0, ang: null });
                P.line(col, 0.4 * sc(run(s1).z), g => { for (let i = 0; i <= 14; i++) { const p = run(s0 + (s1 - s0) * i / 14); g.lineTo(sx(p.x, p.z), sy(p.z) - p.y * sc(p.z)); } });
            }
        }
        // What it does to the light: the afterglow is behind it, the day's sun over our left shoulder.
        P.shade('A', sx(t.x - 2, t.z - dzr), sy(t.z - dzr * 0.86), t.rx * 0.95 * sc(t.z - dzr), 0.7 * (sy(t.z - dzr) - sy(t.z)), 0.7);
        P.shade('B', sx(t.x + t.rx * 0.82, t.z + dzr * 0.25), sy(t.z + dzr * 0.25), t.rx * 0.5 * sc(t.z), 0.5 * (sy(t.z - dzr) - sy(t.z)), 0.6);
        P.spots.sled = { ...t };
    }

    // The town's name, on two posts, and a bit of stone wall beside it.
    function townSign(P, t) {
        const { sx, sy, sc } = P.cam, fx = sx(t.x, t.z), fy = sy(t.z), s = sc(t.z), X = x => fx + x * s, Y = y => fy - y * s;
        // Two lines at most, as even as they can be.
        const words = t.name.toUpperCase().split(/\s+/).filter(Boolean), lines = [];
        let cut = words.length, best = 1e9;
        for (let i = 1; i < words.length; i++) { const d = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length); if (d < best) { best = d; cut = i; } }
        lines.push(words.slice(0, cut).join(' ')); if (cut < words.length) lines.push(words.slice(cut).join(' '));
        const hw = 2.3, px = Math.min(0.64, hw * 1.84 / (Math.max(...lines.map(l => l.length)) * 0.64)), hh = lines.length > 1 ? 0.92 : 0.6, mid = 2.0;
        const stones = []; for (let x = -9; x < -2.9; x += P.rr(0.6, 1.0)) for (let y = 0.2; y < 0.9; y += 0.4) stones.push([X(x + P.rr(-0.1, 0.1)), Y(y), P.vary(P.pick([[0.52, 0.48, 0.48], [0.62, 0.54, 0.46], [0.44, 0.45, 0.54]]), 0.14)]);
        P.solid(t.z, fx, fy, () => {
            P.set({ cls: CLS.UP, foot: fy, m: MAT.STONE, size: 2.2, ang: null, haze: 0 });
            for (const [px0, py0, col] of stones) P.fill(col, g => ell(g, px0, py0, 0.5 * s, 0.24 * s));
            P.set({ cls: CLS.TOP, m: MAT.ROOF, size: 2.6, ang: 0 }); P.line(SNOW, 0.34 * s, g => { g.moveTo(X(-9.2), Y(1.06)); g.lineTo(X(-2.8), Y(1.06)); });
            P.set({ cls: CLS.UP, m: MAT.WOOD, size: 2, ang: Math.PI / 2 });
            for (const x of [-hw + 0.25, hw - 0.25]) P.fill([0.90, 0.89, 0.86], g => g.rect(X(x - 0.14), Y(mid + hh + 0.25), 0.28 * s, (mid + hh + 0.25) * s));
            P.set({ ang: 0, size: 1.6 });
            P.fill([0.86, 0.70, 0.30], g => g.rect(X(-hw), Y(mid + hh), 2 * hw * s, 2 * hh * s));
            P.fill([0.10, 0.22, 0.17], g => g.rect(X(-hw + 0.12), Y(mid + hh - 0.12), (2 * hw - 0.24) * s, (2 * hh - 0.24) * s));
            P.set({ cls: CLS.TOP, m: MAT.ROOF, size: 2.4 }); P.line(SNOW, 0.22 * s, g => { g.moveTo(X(-hw - 0.05), Y(mid + hh + 0.08)); g.lineTo(X(hw + 0.05), Y(mid + hh + 0.08)); });
            for (const x of [-hw + 0.25, hw - 0.25]) P.fill(SNOW, g => ell(g, X(x), Y(mid + hh + 0.3), 0.24 * s, 0.14 * s));
        }, { shadow: 0.6 });
        lines.forEach((str, i) => P.letter([0.96, 0.82, 0.40], str, X(0), Y(mid + (lines.length > 1 ? (i ? -0.38 : 0.4) : 0)), px * s, { foot: fy, squeeze: 0.86 }));
        P.hump(fx, fy, 3.4 * s, 0.5 * s, 0.4);
    }

    function bench(P, t) {
        const { sx, sy, sc } = P.cam, fx = sx(t.x, t.z), fy = sy(t.z), s = sc(t.z) * 1.3;
        P.solid(t.z, fx, fy, () => {
            P.set({ cls: CLS.UP, foot: fy, m: MAT.WOOD, size: 1.8, ang: 0, haze: 0 });
            P.fill([0.30, 0.22, 0.18], g => { g.rect(fx - 1.1 * s, fy - 0.55 * s, 2.2 * s, 0.14 * s); g.rect(fx - 1.1 * s, fy - 1.05 * s, 2.2 * s, 0.3 * s); for (const x of [-0.95, 0.85]) g.rect(fx + x * s, fy - 0.55 * s, 0.12 * s, 0.55 * s); });
            P.set({ cls: CLS.TOP, m: MAT.ROOF, size: 2 }); P.fill(SNOW, g => { ell(g, fx, fy - 0.6 * s, 1.1 * s, 0.1 * s); ell(g, fx, fy - 1.08 * s, 1.1 * s, 0.08 * s); });
        }, { shadow: 0.5 });
    }

    // ---- The whole underpainting --------------------------------------------------

    function compose(P, L, config) {
        const { cam } = P, { W, hor, u } = cam;
        P.sky(cam.hor + 12);
        ground(P); mountains(P, L, config);
        // Where the woods stand back: the cabin's clearing, the trail down from it, the glades.
        const open = [], c = L.things.find(t => t.kind === 'cabin');
        if (c) open.push({ x: W * c.fx - 5.2 * u, y: hor - c.up * u + 6 * u, rx: 78 * u, ry: 19 * u, draw: () => cabin(P, c) });
        const pts = c && L.trail ? trailPath(P, c, L) : null;
        if (pts) for (let i = 0; i < pts.length - 1; i++) { const [x, y] = pts[i], k = 0.75 + 0.5 * (1 - i / pts.length); open.push({ x, y, rx: 7.5 * k * u, ry: 3.4 * k * u, draw: () => meadow(P, x, y, 8.5 * k * u, 3.2 * k * u) }); }
        P.spots.glades = [];
        for (const g of L.glades) {
            const x = W * g.fx, y = hor + g.dy * u, rx = g.rx * u, ry = g.ry * u;
            open.push({ x, y, rx, ry, cut: 0.5, draw: () => glade(P, x, y, rx, ry) });
            P.spots.glades.push({ kind: g.kind, x, y, rx, ry, s: 7.5 * u });
        }
        forest(P, L, open);
        if (pts) trailLamps(P, pts);
        P.add(100, () => { pond(P, L); brook(P, L); lanes(P, L); });
        L.lamps.forEach((at, i) => P.add(at.z, () => lamp(P, at, i)));
        for (const t of L.things) {
            const B = PaintedBuildings;
            if (t.kind === 'fir' && t.near) (P.spots.firs ||= []).push({ x: t.x, z: t.z, h: t.h });
            const draw = {
                fir: () => fir(P, t.x, t.z, t.h, { mice: t.mice, shadow: t.z > 5 ? 0.5 : 1, lights: t.lit && config.lights !== false ? Math.round(t.h * 9) : 0, star: t.lit && config.lights !== false, reflect: t.near, haze: 0 }),
                frostTree: () => frostTree(P, t.x, t.z, t.h),
                grandTree: () => grandTree(P, t, config),
                railFence: () => railFence(P, t),
                picketFence: () => picketFence(P, t),
                snowman: () => snowman(P, t),
                bonfire: () => bonfire(P, t),
                treeFarm: () => treeFarm(P, t), sledHill: () => sledHill(P, t), townSign: () => townSign(P, t), bench: () => bench(P, t),
                store: () => B.store(P, t, config), house: () => B.house(P, t, config), shop: () => B.house(P, t, config), inn: () => B.house(P, t, config), church: () => B.church(P, t, config),
                school: () => B.school(P, t, config), mill: () => B.mill(P, t, config),
                bridge: () => B.bridge(P, t, config), barn: () => B.barn(P, t, config), cocoaHut: () => B.cocoaHut(P, t, config), bandstand: () => B.bandstand(P, t, config),
            }[t.kind];
            if (draw) P.add(t.kind === 'railFence' ? Math.max(t.from[1], t.to[1]) : t.kind === 'treeFarm' ? 99 : t.kind === 'sledHill' ? t.z + cam.dz(t.rd) : t.z, draw);
        }
        P.run();
    }

    return { compose, fir, frostTree, lantern, fine, star, SNOW, LAMP, WINDOW };
})();
