// Fresh Tracks' shapes (SPEC §10.39): the mountain's mesh, every tree, the
// riders and whatever else stands on the snow, modelled here in code as
// triangles with painted colours. No asset files; typed arrays only, so the
// unit tests can build all of it without a browser.
//
// A solid vertex is 24 bytes: position (3 floats), normal and occlusion
// (4 signed bytes), colour (3 bytes, and whether an instance's tint colours
// it), and four bytes the shaders read (sway, glow, flutter, phase). SkiSoup
// is a growing list of them. A ground vertex is 28 bytes: position, how far
// across and along the run it is, its normal, and what it is made of.

class SkiSoup {
    constructor(cap = 256) {
        this.cap = cap;
        this.n = 0;
        this.buf = new ArrayBuffer(cap * 24);
        this.F = new Float32Array(this.buf);
        this.B = new Uint8Array(this.buf);
        this.slots = new Uint8Array(cap);
        this.col = [255, 255, 255];
        this.slot = 0;
        this.tint = 0;
        this.e = [0, 0, 0, 0];
        this.m = null;
    }

    need(k) {
        if (this.n + k <= this.cap) return;
        while (this.n + k > this.cap) this.cap *= 2;
        const B = this.B, S = this.slots;
        this.buf = new ArrayBuffer(this.cap * 24);
        this.F = new Float32Array(this.buf);
        this.B = new Uint8Array(this.buf);
        this.B.set(B.subarray(0, this.n * 24));
        this.slots = new Uint8Array(this.cap);
        this.slots.set(S.subarray(0, this.n));
    }

    clear() { this.n = 0; return this; }
    // Shapes added from here on go through this 3×4 matrix (null: none).
    at(m) { this.m = m; return this; }
    // What the next shapes are painted with: a colour, which of a stamp's
    // tints recolours it (0: none), and whether an instance's tint does.
    paint(col, slot = 0, tint = 0) { this.col = col; this.slot = slot; this.tint = tint; return this; }
    // What the shaders read: how much it sways, glows, flutters, and (trees) how much snow lies on it.
    fx(sway = 0, glow = 0, flutter = 0, snow = 0) { this.e = [sway, glow, flutter, snow]; return this; }

    v(x, y, z, nx, ny, nz, ao = 1) {
        this.need(1);
        const o = this.n * 6, b = this.n * 24, F = this.F, B = this.B, c = this.col, e = this.e, m = this.m;
        if (m) {
            const px = x, py = y, pz = z, qx = nx, qy = ny, qz = nz;
            x = m[0] * px + m[1] * py + m[2] * pz + m[3]; y = m[4] * px + m[5] * py + m[6] * pz + m[7]; z = m[8] * px + m[9] * py + m[10] * pz + m[11];
            nx = m[0] * qx + m[1] * qy + m[2] * qz; ny = m[4] * qx + m[5] * qy + m[6] * qz; nz = m[8] * qx + m[9] * qy + m[10] * qz;
            const l = Math.hypot(nx, ny, nz) || 1;
            nx /= l; ny /= l; nz /= l;
        }
        F[o] = x; F[o + 1] = y; F[o + 2] = z;
        B[b + 12] = nx * 127; B[b + 13] = ny * 127; B[b + 14] = nz * 127; B[b + 15] = ao * 127;
        B[b + 16] = c[0]; B[b + 17] = c[1]; B[b + 18] = c[2]; B[b + 19] = this.tint ? 255 : 0;
        B[b + 20] = e[0]; B[b + 21] = e[1]; B[b + 22] = e[2]; B[b + 23] = e[3];
        this.slots[this.n++] = this.slot;
    }
    // A point with its own normal, colour and shade.
    pt(p, n, col, ao = 1, tint = 0) {
        this.col = col;
        this.tint = tint;
        this.v(p[0], p[1], p[2], n[0], n[1], n[2], ao);
    }

    // Flat faces. Points are [x, y, z]; give the normal, or it is worked out (facing up).
    tri(a, b, c, n = null, ao = [1, 1, 1]) {
        if (!n) {
            const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
            n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
            const l = (Math.hypot(n[0], n[1], n[2]) || 1) * (n[1] < -0.01 ? -1 : 1);
            n = [n[0] / l, n[1] / l, n[2] / l];
        }
        this.v(a[0], a[1], a[2], n[0], n[1], n[2], ao[0]);
        this.v(b[0], b[1], b[2], n[0], n[1], n[2], ao[1]);
        this.v(c[0], c[1], c[2], n[0], n[1], n[2], ao[2]);
        return this;
    }
    quad(a, b, c, d, n = null, ao = [1, 1, 1, 1]) {
        this.tri(a, b, c, n, [ao[0], ao[1], ao[2]]);
        this.tri(a, c, d, n, [ao[0], ao[2], ao[3]]);
        return this;
    }
    // A box about (cx, cy, cz) with half-sizes; `foot` shades its lower edge, `top` paints its lid another colour.
    box(cx, cy, cz, hx, hy, hz, foot = 0.8, top = null) {
        const x0 = cx - hx, x1 = cx + hx, y0 = cy - hy, y1 = cy + hy, z0 = cz - hz, z1 = cz + hz, f = [foot, foot, 1, 1];
        this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], f);
        this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], f);
        this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], f);
        this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], f);
        const keep = this.col;
        if (top) this.col = top;
        this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]);
        this.col = keep;
        this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [foot, foot, foot, foot]);
        return this;
    }
    // A round post or cone from radius r0 at y0 to r1 at y1 (r1 = 0 is a
    // point), smooth round its sides; (dx, dz) leans its top.
    prism(sides, cx, y0, cz, r0, y1, r1, o = {}) {
        const dx = o.dx || 0, dz = o.dz || 0, foot = o.foot ?? 0.75, sy = (r0 - r1) / (y1 - y0), turn = o.turn || 0, squash = o.squash || 1;
        const ring = (i, r, y, ox, oz) => { const a = turn + i / sides * 6.2831853; return [cx + ox + Math.sin(a) * r, y, cz + oz + Math.cos(a) * r * squash]; };
        const nrm = i => { const a = turn + i / sides * 6.2831853, l = Math.hypot(1, sy); return [Math.sin(a) / l, sy / l, Math.cos(a) / l]; };
        for (let i = 0; i < sides; i++) {
            const a = ring(i, r0, y0, 0, 0), b = ring(i + 1, r0, y0, 0, 0), c = ring(i + 1, r1, y1, dx, dz), d = ring(i, r1, y1, dx, dz), n0 = nrm(i), n1 = nrm(i + 1);
            this.v(a[0], a[1], a[2], n0[0], n0[1], n0[2], foot); this.v(b[0], b[1], b[2], n1[0], n1[1], n1[2], foot); this.v(c[0], c[1], c[2], n1[0], n1[1], n1[2], 1);
            if (r1 > 0) { this.v(a[0], a[1], a[2], n0[0], n0[1], n0[2], foot); this.v(c[0], c[1], c[2], n1[0], n1[1], n1[2], 1); this.v(d[0], d[1], d[2], n0[0], n0[1], n0[2], 1); }
            if (o.cap && r1 > 0) this.tri(d, c, [cx + dx, y1, cz + dz], [0, 1, 0]);
        }
        return this;
    }
    // A lumpy ball, smooth all round, darker underneath. `cap` paints what
    // faces up another colour (snow on a rock, on a pine's crown).
    blob(cx, cy, cz, rx, ry, rz, o = {}) {
        const segs = o.segs || 6, bands = o.bands || 3, lump = o.lump ?? 0.12, seed = o.seed || 0, under = o.under ?? 0.6, turn = seed * 9, base = this.col, tint = this.tint;
        const h = (i, j) => { const s = Math.sin((i % segs) * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453; return s - Math.floor(s); };
        const put = (i, j) => {
            const lat = j / bands * Math.PI, a = turn + i / segs * 6.2831853, pole = j === 0 || j === bands;
            const k = 1 + (pole ? 0 : (h(i, j) - 0.5) * 2 * lump), nx = Math.sin(lat) * Math.sin(a), ny = Math.cos(lat), nz = Math.sin(lat) * Math.cos(a), t = ny * 0.5 + 0.5;
            const capped = o.cap && ny > (o.capFrom ?? 0.2);
            this.col = capped ? o.cap : base;
            this.tint = capped ? 0 : tint;
            this.v(cx + nx * rx * k, cy + ny * ry * k, cz + nz * rz * k, nx, ny, nz, under + (1 - under) * t);
        };
        for (let j = 0; j < bands; j++) {
            for (let i = 0; i < segs; i++) {
                if (j < bands - 1) { put(i, j); put(i, j + 1); put(i + 1, j + 1); }
                if (j > 0) { put(i, j); put(i + 1, j + 1); put(i + 1, j); }
            }
        }
        this.col = base;
        this.tint = tint;
        return this;
    }

    // Copy a model in through a 3×4 matrix; tints recolour its slots.
    stamp(t, m, tints = null) {
        this.need(t.n);
        const F = this.F, B = this.B, tf = t.F, tb = t.B, ts = t.slots;
        let o = this.n * 6, ob = this.n * 24;
        for (let i = 0, k = 0, kb = 0; i < t.n; i++, k += 6, kb += 24, o += 6, ob += 24) {
            const x = tf[k], y = tf[k + 1], z = tf[k + 2];
            F[o] = m[0] * x + m[1] * y + m[2] * z + m[3];
            F[o + 1] = m[4] * x + m[5] * y + m[6] * z + m[7];
            F[o + 2] = m[8] * x + m[9] * y + m[10] * z + m[11];
            const nx = tb[kb + 12] << 24 >> 24, ny = tb[kb + 13] << 24 >> 24, nz = tb[kb + 14] << 24 >> 24;
            const wx = m[0] * nx + m[1] * ny + m[2] * nz, wy = m[4] * nx + m[5] * ny + m[6] * nz, wz = m[8] * nx + m[9] * ny + m[10] * nz, inv = 127 / (Math.hypot(wx, wy, wz) || 1);
            B[ob + 12] = wx * inv; B[ob + 13] = wy * inv; B[ob + 14] = wz * inv; B[ob + 15] = tb[kb + 15];
            const tint = tints && tints[ts[i]];
            if (tint) { B[ob + 16] = tb[kb + 16] * tint[0] / 255; B[ob + 17] = tb[kb + 17] * tint[1] / 255; B[ob + 18] = tb[kb + 18] * tint[2] / 255; } else { B[ob + 16] = tb[kb + 16]; B[ob + 17] = tb[kb + 17]; B[ob + 18] = tb[kb + 18]; }
            B[ob + 19] = tb[kb + 19];
            B[ob + 20] = tb[kb + 20]; B[ob + 21] = tb[kb + 21]; B[ob + 22] = tb[kb + 22]; B[ob + 23] = tb[kb + 23];
        }
        this.n += t.n;
        return this;
    }
}

// A stack of 3×4 matrices, changed in place: no garbage while a figure is posed.
class SkiStack {
    constructor() { this.items = Array.from({ length: 12 }, () => new Float64Array(12)); this.depth = 0; this.top = this.items[0]; this.reset(0, 0, 0, 0, 1); }
    reset(x, y, z, yaw = 0, s = 1) {
        const c = Math.cos(yaw) * s, n = Math.sin(yaw) * s;
        this.depth = 0;
        this.top = this.items[0];
        this.top.set([c, 0, n, x, 0, s, 0, y, -n, 0, c, z]);
        return this;
    }
    push() { const next = this.items[++this.depth]; next.set(this.top); this.top = next; return this; }
    pop() { this.top = this.items[--this.depth]; return this; }
    move(x, y, z) { const m = this.top; m[3] += m[0] * x + m[1] * y + m[2] * z; m[7] += m[4] * x + m[5] * y + m[6] * z; m[11] += m[8] * x + m[9] * y + m[10] * z; return this; }
    spin(a, b, angle) {
        const m = this.top, c = Math.cos(angle), s = Math.sin(angle);
        for (let r = 0; r < 12; r += 4) { const p = m[r + a], q = m[r + b]; m[r + a] = p * c + q * s; m[r + b] = q * c - p * s; }
        return this;
    }
    rx(angle) { return this.spin(1, 2, angle); }     // nods: +y towards +z
    ry(angle) { return this.spin(2, 0, angle); }     // turns: +z towards +x
    rz(angle) { return this.spin(0, 1, angle); }     // tips: +x towards +y
    size(x, y = x, z = x) { const m = this.top; for (let r = 0; r < 12; r += 4) { m[r] *= x; m[r + 1] *= y; m[r + 2] *= z; } return this; }
}

const SkiModels = (() => {
    const L = SkiLogic, TAU = Math.PI * 2, clamp = L.clamp, mix = L.mix, smooth = L.smooth;
    const rnd = (v, k) => { const s = Math.sin(v * 91.7 + k * 47.3 + 1.3) * 43758.5453; return s - Math.floor(s); };
    const move = (x, y, z) => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z];
    const place = (x, y, z, yaw = 0, s = 1) => { const c = Math.cos(yaw) * s, n = Math.sin(yaw) * s; return [c, 0, n, x, 0, s, 0, y, -n, 0, c, z]; };
    const tilt = (x, y, z, a) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, x, 0, c, -s, y, 0, s, c, z]; };

    // The paintbox (sRGB bytes; the shaders square them).
    const C = {
        snow: [246, 249, 253], shade: [206, 218, 236], needle: [50, 82, 58], bark: [92, 70, 56], pine: [128, 88, 66], rock: [118, 116, 122], dark: [44, 46, 54],
        steel: [128, 134, 144], timber: [118, 84, 58], log: [142, 104, 70], stone: [150, 146, 142], glass: [70, 92, 120], lamp: [255, 226, 170], white: [255, 255, 255],
        orange: [240, 120, 40], red: [206, 56, 50], blue: [56, 110, 200], black: [34, 34, 40], yellow: [240, 200, 60], skin: [232, 186, 154],
    };
    const cache = new Map();
    const model = (key, make) => { let m = cache.get(key); if (!m) { m = new SkiSoup(); make(m); cache.set(key, m); } return m; };

    // ---- Trees ------------------------------------------------------------------
    // One bough of a conifer: a tapering spray from the trunk out to its
    // tip, sagging on the way. Its fourth "extra" byte says how much snow
    // lies where (most along the spine and at the tip): the shader breaks
    // that into ragged patches, so no two boughs wear it alike.
    function bough(s, a, y, R, wide, droop, snow, under) {
        const sa = Math.sin(a), ca = Math.cos(a), px = ca, pz = -sa, sag = droop * R;
        const root = [sa * R * 0.04, y + sag * 0.5, ca * R * 0.04], tip = [sa * R, y - sag, ca * R], my = y - sag * 0.25, mr = R * 0.56;
        const left = [sa * mr - px * wide, my - wide * 0.3, ca * mr - pz * wide], right = [sa * mr + px * wide, my - wide * 0.3, ca * mr + pz * wide], spine = [sa * mr, my + wide * 0.16, ca * mr];
        const put = (p, n, snowy, ao) => { s.e[3] = clamp(snowy + snow, 0, 1) * 255; s.pt(p, n, C.needle, ao, 1); };
        const up = [sa * 0.35, 0.94, ca * 0.35], out = [sa * 0.7, 0.71, ca * 0.7], nl = [sa * 0.4 - px * 0.55, 0.73, ca * 0.4 - pz * 0.55], nr = [sa * 0.4 + px * 0.55, 0.73, ca * 0.4 + pz * 0.55];
        if (wide > 0) {
            // A ridge down the middle, so the snow sits on a rounded back.
            for (const [edge, n] of [[left, nl], [right, nr]]) {
                put(root, up, 0.3, 0.5); put(edge, n, 0.12, 0.7); put(spine, up, 0.78, 0.85);
                put(edge, n, 0.12, 0.7); put(tip, out, 0.7, 1); put(spine, up, 0.78, 0.85);
            }
        } else { put(root, up, 0.35, 0.55); put([sa * mr - px * R * 0.3, my, ca * mr - pz * R * 0.3], nl, 0.3, 0.75); put(tip, out, 0.7, 1); put(root, up, 0.35, 0.55); put(tip, out, 0.7, 1); put([sa * mr + px * R * 0.3, my, ca * mr + pz * R * 0.3], nr, 0.3, 0.75); }
        if (!under) return;
        const low = [sa * R * 0.04, y - sag * 0.2 - R * 0.12, ca * R * 0.04], down = [sa * 0.5, -0.86, ca * 0.5];
        s.e[3] = 0;
        s.pt(low, [0, -1, 0], C.needle, 0.3, 1); s.pt(left, down, C.needle, 0.5, 1); s.pt(tip, down, C.needle, 0.75, 1);
        s.pt(low, [0, -1, 0], C.needle, 0.3, 1); s.pt(tip, down, C.needle, 0.75, 1); s.pt(right, down, C.needle, 0.5, 1);
    }

    // What makes each conifer itself: how wide for its height, how its boughs
    // droop, where its crown starts, how its width tapers, how much snow it carries.
    const CONIFERS = [
        { R: 0.19, droop: 0.6, from: 0.1, taper: 0.9, snow: 0, tiers: [10, 6, 2], boughs: [8, 6, 5], bark: C.bark, trunk: 0.5 },         // spruce: narrow, drooping
        { R: 0.26, droop: 0.32, from: 0.12, taper: 0.7, snow: 0.05, tiers: [8, 5, 2], boughs: [8, 6, 5], bark: C.bark, trunk: 0.5 },     // fir: broad, layered
        { R: 0.27, droop: 0.12, from: 0.5, taper: 0.45, snow: 0.08, tiers: [6, 4, 2], boughs: [8, 6, 5], bark: C.pine, trunk: 0.86 },    // pine: a long bare trunk, a spreading crown
        { R: 0.3, droop: 0.5, from: 0.06, taper: 0.8, snow: 0.55, tiers: [5, 3, 2], boughs: [7, 5, 4], bark: C.bark, trunk: 0.3 },       // a small one, plastered white
    ];

    // kind: 0 spruce, 1 fir, 2 pine, 3 a small tree plastered white, 4 a
    // snag, 5 a rock. lod: 0 close, 1 further, 2 far. One unit tall.
    function tree(kind, lod) {
        return model(`tree:${kind}:${lod}`, s => {
            if (kind < 4) {
                const k = CONIFERS[kind], tiers = k.tiers[lod], n = k.boughs[lod];
                s.paint(k.bark).fx(0).prism(lod ? 4 : 7, 0, -0.03, 0, 0.022, k.trunk, 0.008, { foot: 0.55, dx: kind === 2 ? 0.02 : 0 });
                for (let i = 0; i < tiers; i++) {
                    const f = i / tiers, y = k.from + (0.93 - k.from) * (f + 0.5 / tiers), r = k.R * Math.pow(1 - f * 0.94, k.taper) * (0.86 + 0.28 * rnd(kind + 2, i));
                    s.fx(10 + 40 * f);
                    for (let j = 0; j < n; j++) {
                        const a = (j + 0.5 * (i & 1) + 0.5 * rnd(kind * 7 + i, j)) / n * TAU, len = r * (0.78 + 0.44 * rnd(kind * 13 + i, j + 9));
                        bough(s, a, y + 0.02 * rnd(i, j), len, lod ? 0 : len * 0.5, k.droop * (0.8 + 0.4 * rnd(j, i)), k.snow, lod === 0);
                    }
                }
                s.e[3] = 150;
                s.paint(C.needle, 0, 1).prism(lod ? 3 : 5, 0, 0.9, 0, 0.016, 1, 0);
                s.fx(0);
            } else if (kind === 4) {
                s.paint([126, 114, 106]).fx(0).prism(5, 0, -0.03, 0, 0.03, 0.96, 0.008, { foot: 0.6, dx: 0.03 });
                for (let i = 0; i < (lod ? 2 : 5); i++) {
                    const a = i * 2.3, y = 0.42 + i * 0.1, len = 0.2 - i * 0.025;
                    s.prism(3, 0.01, y, 0, 0.012, y + 0.07, 0.003, { dx: Math.sin(a) * len, dz: Math.cos(a) * len });
                    if (!lod) s.paint(C.snow).blob(Math.sin(a) * len * 0.5, y + 0.05, Math.cos(a) * len * 0.5, len * 0.5, 0.012, 0.02, { segs: 4, bands: 2, lump: 0 }).paint([126, 114, 106]);
                }
                s.paint(C.snow).blob(0.03, 0.97, 0, 0.022, 0.02, 0.022, { segs: 4, bands: 2, lump: 0 });
            } else {
                // A boulder under its own drift: the shader lays the snow on whatever of it faces up.
                s.paint(C.rock).fx(0).blob(0, 0.3, 0, 0.75, 0.52, 0.62, { segs: lod ? 5 : 8, bands: lod ? 3 : 5, seed: 0.4, lump: 0.28, under: 0.5, cap: C.snow, capFrom: 0.3 });
                if (!lod) s.blob(0.62, 0.14, 0.3, 0.4, 0.28, 0.36, { segs: 6, bands: 4, seed: 0.9, lump: 0.3, cap: C.snow, capFrom: 0.3 });
            }
        });
    }

    // ---- People ---------------------------------------------------------------------
    // Slots a kit recolours: 1 jacket, 2 trousers, 3 helmet, 4 skin, 5 skis or board, 6 hair, 7 gloves and trim.
    const W = C.white;
    const part = (key, make) => model('part:' + key, make);
    const P = {
        thigh: () => part('thigh', s => s.paint(W, 2).prism(6, 0, -0.45, 0, 0.078, -0.2, 0.1, { foot: 0.85 }).prism(6, 0, -0.2, 0, 0.1, 0, 0.115, { foot: 1 }).blob(0, -0.45, 0.01, 0.082, 0.07, 0.085, { segs: 5, bands: 2, lump: 0 })),
        shin: () => part('shin', s => {
            s.paint(W, 2).prism(6, 0, -0.3, 0, 0.078, 0, 0.082, { foot: 0.85 });
            // A ski boot: a cuff tipped forward, a shell rounded over the toes, a sole.
            s.paint([58, 60, 70]).prism(6, 0, -0.4, 0.015, 0.082, -0.2, 0.09, { foot: 0.85, dz: -0.01 });
            s.blob(0, -0.41, 0.07, 0.066, 0.06, 0.15, { segs: 6, bands: 3, lump: 0, under: 0.7 });
            s.paint([30, 30, 36]).box(0, -0.465, 0.06, 0.06, 0.012, 0.16, 1);
            s.paint(W, 7).box(0, -0.36, 0.115, 0.07, 0.012, 0.012, 1).box(0, -0.3, 0.1, 0.085, 0.012, 0.012, 1);
        }),
        hips: () => part('hips', s => s.paint(W, 2).blob(0, 0.02, 0, 0.19, 0.15, 0.15, { segs: 8, bands: 4, lump: 0, under: 0.75 })),
        torso: () => part('torso', s => {
            // A jacket: in at the waist, out to the chest, rounded over the shoulders, a collar.
            s.paint(W, 1).prism(8, 0, -0.05, 0, 0.19, 0.16, 0.175, { squash: 0.7, foot: 0.8 }).prism(8, 0, 0.16, 0, 0.175, 0.4, 0.225, { squash: 0.66, foot: 1 });
            s.blob(0, 0.42, 0, 0.228, 0.14, 0.15, { segs: 8, bands: 3, lump: 0, under: 0.9 });
            for (const sg of [-1, 1]) s.blob(sg * 0.225, 0.455, 0, 0.085, 0.08, 0.09, { segs: 5, bands: 2, lump: 0, under: 0.85 });
            s.paint(W, 7).prism(8, 0, -0.07, 0, 0.196, -0.02, 0.193, { squash: 0.7 }).prism(8, 0, 0.5, 0.005, 0.09, 0.6, 0.075);
        }),

        pack: () => part('pack', s => s.paint(W, 7).blob(0, 0.3, -0.19, 0.15, 0.2, 0.09, { segs: 6, bands: 3, lump: 0.05, under: 0.7 })),
        upper: () => part('upper', s => s.paint(W, 1).prism(6, 0, -0.3, 0, 0.06, 0, 0.082, { foot: 0.85 }).blob(0, -0.3, 0, 0.062, 0.05, 0.062, { segs: 5, bands: 2, lump: 0 })),
        fore: () => part('fore', s => {
            s.paint(W, 1).prism(6, 0, -0.25, 0, 0.05, 0, 0.062);
            // A glove: a cuff, a mitt and a thumb.
            s.paint(W, 7).prism(6, 0, -0.27, 0, 0.06, -0.22, 0.058).blob(0, -0.32, 0.012, 0.052, 0.07, 0.06, { segs: 6, bands: 3, lump: 0 }).blob(0.04, -0.3, 0.03, 0.022, 0.035, 0.022, { segs: 4, bands: 2, lump: 0 });
        }),
        head: () => part('head', s => {
            s.paint(W, 4).blob(0, 0.1, 0.01, 0.1, 0.12, 0.105, { segs: 7, bands: 4, lump: 0, under: 0.85 });
            s.paint(W, 3).blob(0, 0.15, -0.01, 0.125, 0.115, 0.13, { segs: 8, bands: 4, lump: 0, under: 0.8 });
            // Goggles: a strap right round, and a lens that catches the sky.
            s.paint(C.black).prism(8, 0, 0.115, -0.005, 0.127, 0.15, 0.128, { squash: 1.04, foot: 1 });
            s.paint([236, 150, 60]).fx(0, 40).box(0, 0.133, 0.118, 0.07, 0.027, 0.012, 1).fx(0);
        }),
        tail: () => part('tail', s => s.paint(W, 6).prism(5, 0, 0.02, -0.11, 0.035, -0.22, 0.012, { dz: -0.06, foot: 0.9 })),
        ski: () => part('ski', s => {
            s.paint(W, 5).box(0, 0.012, -0.02, 0.045, 0.012, 0.78, 0.9);
            s.quad([-0.045, 0, 0.76], [0.045, 0, 0.76], [0.03, 0.09, 0.92], [-0.03, 0.09, 0.92], [0, 0.87, -0.5]);
            s.paint(C.dark).box(0, 0.035, 0, 0.04, 0.012, 0.16, 1);
        }),
        pole: () => part('pole', s => { s.paint([70, 72, 80]).prism(4, 0, -1.12, 0, 0.008, 0.06, 0.011); s.paint(W, 7).prism(6, 0, -1.04, 0, 0.045, -1.03, 0.045, { cap: true }).prism(5, 0, -0.02, 0, 0.018, 0.1, 0.02); }),
        board: () => part('board', s => {
            // Long along z, turned up at both ends.
            const w = 0.135, mid = 0.56;
            s.paint(W, 5).box(0, 0.012, 0, w, 0.012, mid, 0.9);
            for (const e of [-1, 1]) {
                s.quad([-w, 0.024, e * mid], [w, 0.024, e * mid], [w * 0.7, 0.07, e * (mid + 0.17)], [-w * 0.7, 0.07, e * (mid + 0.17)], [0, 0.93, -e * 0.36]);
                s.tri([-w * 0.7, 0.07, e * (mid + 0.17)], [w * 0.7, 0.07, e * (mid + 0.17)], [0, 0.085, e * (mid + 0.24)], [0, 0.97, -e * 0.24]);
            }
            for (const e of [-1, 1]) s.paint(C.dark).box(0, 0.045, e * 0.26, 0.12, 0.02, 0.05, 1);
        }),
    };
    // The same parts with a quarter of the triangles, for anyone too far off to tell.
    const PL = {
        thigh: () => part('lo:thigh', s => s.paint(W, 2).prism(4, 0, -0.45, 0, 0.085, 0, 0.115, { foot: 0.85 })),
        shin: () => part('lo:shin', s => { s.paint(W, 2).prism(4, 0, -0.3, 0, 0.08, 0, 0.085); s.paint([58, 60, 70]).box(0, -0.38, 0.05, 0.07, 0.09, 0.15, 0.8); }),
        hips: () => part('lo:hips', s => s.paint(W, 2).blob(0, 0.02, 0, 0.19, 0.15, 0.15, { segs: 5, bands: 2, lump: 0, under: 0.75 })),
        torso: () => part('lo:torso', s => { s.paint(W, 1).prism(6, 0, -0.05, 0, 0.19, 0.42, 0.23, { squash: 0.68, foot: 0.8 }).prism(6, 0, 0.42, 0, 0.23, 0.56, 0.1, { squash: 0.7, foot: 1 }); }),
        pack: () => part('lo:pack', s => s.paint(W, 7).box(0, 0.3, -0.2, 0.13, 0.18, 0.07, 0.8)),
        upper: () => part('lo:upper', s => s.paint(W, 1).prism(4, 0, -0.3, 0, 0.065, 0, 0.085, { foot: 0.85 })),
        fore: () => part('lo:fore', s => { s.paint(W, 1).prism(4, 0, -0.25, 0, 0.055, 0, 0.065); s.paint(W, 7).box(0, -0.31, 0.01, 0.05, 0.06, 0.055, 1); }),
        head: () => part('lo:head', s => {
            s.paint(W, 4).blob(0, 0.1, 0.01, 0.1, 0.12, 0.105, { segs: 5, bands: 3, lump: 0, under: 0.85 });
            s.paint(W, 3).blob(0, 0.15, -0.01, 0.125, 0.115, 0.13, { segs: 5, bands: 3, lump: 0, under: 0.8 });
            s.paint([236, 150, 60]).box(0, 0.133, 0.118, 0.07, 0.027, 0.012, 1);
        }),
        tail: () => part('lo:tail', s => s.paint(W, 6).prism(3, 0, 0.02, -0.11, 0.035, -0.22, 0.012, { dz: -0.06 })),
        ski: () => part('lo:ski', s => s.paint(W, 5).box(0, 0.012, 0.04, 0.045, 0.012, 0.84, 0.9)),
        pole: () => part('lo:pole', s => s.paint([70, 72, 80]).prism(3, 0, -1.12, 0, 0.012, 0.06, 0.014)),
        board: () => part('lo:board', s => s.paint(W, 5).box(0, 0.015, 0, 0.135, 0.015, 0.74, 0.9)),
    };
    const KITS = {
        ember: { jacket: [206, 62, 50], pants: [44, 46, 56], helmet: [240, 240, 240], trim: [40, 40, 48], gear: [240, 200, 60] },
        glacier: { jacket: [60, 140, 214], pants: [232, 236, 240], helmet: [36, 40, 52], trim: [250, 250, 250], gear: [230, 70, 90] },
        moss: { jacket: [96, 140, 76], pants: [176, 150, 104], helmet: [70, 60, 50], trim: [230, 170, 60], gear: [60, 70, 90] },
        plum: { jacket: [136, 70, 150], pants: [60, 52, 84], helmet: [246, 214, 90], trim: [240, 240, 240], gear: [80, 200, 190] },
        sunflower: { jacket: [244, 196, 48], pants: [70, 84, 110], helmet: [60, 100, 170], trim: [50, 50, 60], gear: [240, 240, 240] },
        slate: { jacket: [84, 96, 112], pants: [52, 56, 66], helmet: [226, 110, 50], trim: [226, 110, 50], gear: [160, 220, 90] },
        bubblegum: { jacket: [240, 120, 170], pants: [80, 196, 200], helmet: [250, 250, 250], trim: [250, 240, 120], gear: [140, 90, 200] },
        tangerine: { jacket: [240, 130, 44], pants: [56, 70, 96], helmet: [50, 54, 64], trim: [250, 250, 250], gear: [50, 170, 220] },
    };
    const KIT_ORDER = Object.keys(KITS);
    const SKIN = [[236, 190, 158], [214, 160, 124], [172, 120, 90], [128, 88, 66], [246, 210, 184]];
    const HAIR = [[76, 52, 38], [34, 30, 30], [196, 150, 80], [150, 70, 40], [222, 200, 150]];
    // Somebody to draw: { kind: 'ski' | 'board', woman, kit }; v picks the skin and hair.
    function look(kind, woman, kit, v = 0.3) {
        const k = KITS[kit] || KITS.ember;
        return { kind, woman, ...k, skin: SKIN[Math.floor(rnd(v, 1) * 4.99)], hair: HAIR[Math.floor(rnd(v, 2) * 4.99)], pack: rnd(v, 3) < 0.4 };
    }
    // A stranger, made up from a number.
    const anyone = v => look(rnd(v, 4) < 0.35 ? 'board' : 'ski', rnd(v, 5) < 0.5, KIT_ORDER[Math.floor(rnd(v, 6) * KIT_ORDER.length)], v);

    const tints = new Array(8).fill(null);
    const mugOf = () => model('mug', s => s.paint(C.white).fx(0).prism(6, 0, -0.05, 0, 0.04, 0.06, 0.045, { cap: true }).paint([120, 70, 40]).tri([-0.03, 0.062, -0.02], [0.03, 0.062, -0.02], [0, 0.062, 0.035], [0, 1, 0]));
    // What a rider leaves standing in the snow when they go in: a pair of skis, or a board, tails down.
    function gear(out, st, x, y, z, yaw, who) {
        tints[5] = who.gear;
        const board = who.kind === 'board';
        for (const side of board ? [0] : [-1, 1]) {
            st.reset(x, y, z, yaw).move(side * 0.07, board ? 0.62 : 0.72, 0).rz(side * 0.05).rx(-1.45);
            out.stamp(board ? P.board() : P.ski(), st.top, tints);
        }
    }
    // The last skier posed, for the tests, in the figure's own frame before its size (x to its right, y off the snow, z ahead):
    // for the left leg and then the right, the hip joint, the knee and the ankle (x, y, z each); then how far the torso
    // leans from the snow's normal (radians, to its right), and how far the hips are from between the feet; then the tip of
    // the left pole and of the right (x, y, z each, in the skis' own frame: y is off the snow), when the arms are worked out too.
    // For a snowboarder the frame is the rider's own on the board (x along the board to their right hand, y off the snow, z the way
    // their toes point, across it) and the legs are as above; [18] is how far the torso is tipped towards the toes from the snow's
    // normal and [19] how far the board is rolled (radians, towards the toes: the tilt, as the rider has it); then, from [26], the
    // middle of the hips, of the chest and of the head, and the left hand and the right (x, y, z each).
    const BONES = new Float64Array(41), THIGH = 0.45, SHIN = 0.43, ANKLE = 0.1, HIPS = 0.12, UPPER = 0.3, FORE = 0.3, POLE = 1.12;
    // A board: half as wide as it is, how far each binding is from its middle, and how far an ankle is above its base.
    const EDGE = 0.135, BIND = 0.26, BOOT = 0.11, SQUARE = Math.PI / 2;
    // How far the skis or the board are tipped on to an edge (radians, to their own right): what is across them of the turn's tilt,
    // and of the braking (in g), when they are turned `skid` from the way they are going. The snow they throw goes by it too.
    const tipped = (tilt, skid, brake) => skid ? clamp(Math.atan(Math.tan(tilt) * Math.cos(skid) + (brake || 0) * Math.sin(skid)), -1.1, 1.1) : tilt;
    // The skis' frame on the stack, and points in it: a shoulder, and what the old arms would have done (elbow, hand, pole's tip).
    const ROOT = new Float64Array(12), PT = new Float64Array(12);
    const within = (m, o) => {
        const s2 = ROOT[0] * ROOT[0] + ROOT[4] * ROOT[4] + ROOT[8] * ROOT[8], dx = m[3] - ROOT[3], dy = m[7] - ROOT[7], dz = m[11] - ROOT[11];
        PT[o] = (ROOT[0] * dx + ROOT[4] * dy + ROOT[8] * dz) / s2; PT[o + 1] = (ROOT[1] * dx + ROOT[5] * dy + ROOT[9] * dz) / s2; PT[o + 2] = (ROOT[2] * dx + ROOT[6] * dy + ROOT[10] * dz) / s2;
    };
    // A part that hangs down its own y, put at a point of the skis' frame and run along a direction in it.
    const along = (st, x, y, z, dx, dy, dz) => { st.top.set(ROOT); return st.move(x, y, z).rx(Math.atan2(-dz, -dy)).rz(Math.asin(clamp(dx, -1, 1))); };
    // Draw a rider with their skis or board at (x, y, z) from the camera, feet on y.
    // pose: { yaw (travel), pitch and bank (the snow under them), tilt (radians from the snow's normal that the line
    // from feet to hips is tipped into a turn, to their right; without it, lean, -1 to 1, stands in), press (the load
    // on the legs, in g), skid (radians the skis or board are turned to the right of the travel), brake (how hard the
    // edges are slowing them, in g), face (radians the chest is turned to the right of the travel), plant and plantSide
    // (0 to 1: that pole's tip, 1 the right, on the snow by its ski's tip), crouch, tuck, air, grab, spread, twist, spin [yaw, pitch,
    // roll], phase (of the turn), stop, sit (on a chair), plough, fall, t, size,
    // walk (the stride's angle, on foot), drink (0 to 1: a mug from the table to the mouth), sw (on a board: riding switch,
    // the other foot forward and the toes to the left of the way they are going), sink (metres the skis are down in the snow:
    // y is then that far under its surface, the skis are held together, and the hands and the poles' tips clear the surface, not
    // the skis), reach (metres come since a planted pole's tip went in: it stays there, and the hand goes over it), wide (metres
    // further apart each ski is stood) and upright (0 to 1: how much less the back is bent), for who skis so }.
    function figure(out, st, x, y, z, who, p) {
        const board = who.kind === 'board', afoot = who.kind === 'none', size = (p.size || 1) * (who.woman ? 0.95 : 1), t = p.t || 0;
        tints[1] = who.jacket; tints[2] = who.pants; tints[3] = who.helmet; tints[4] = who.skin; tints[5] = who.gear; tints[6] = who.hair; tints[7] = who.trim;
        const put = m => out.stamp(m, st.top, tints), Q = p.lo ? PL : P;
        const fall = p.fall, air = p.air ? 1 : 0, grab = p.grab || 0, spread = p.spread || 0;
        // How far into the turn, and how far of that the body over the hips goes: the harder the turn, the more upright against it.
        // The skis may be turned off the way they are going: then what tips them is what is across them, of the turn and of the
        // braking; and the chest may be turned less than the skis (or not at all), the hips between the two.
        const tilt = fall || afoot || p.sit ? 0 : clamp(p.tilt ?? (p.lean || 0) * 0.62, -1.1, 1.1), sk = fall || afoot || p.sit ? 0 : p.skid || 0;
        const tip = tipped(tilt, sk, p.brake), lean = clamp(tip / 0.62, -1, 1), tor = tip * clamp(0.625 - 0.25 * Math.abs(tip), 0.35, 0.62);
        const chest = board || fall || afoot || p.sit ? 0 : clamp((p.face || 0) - sk, -1.1, 1.1), pv = chest * 0.5, sP = Math.sin(pv), cP = Math.cos(pv);
        let sit = p.sit || 0, stop = p.stop || 0, lie = 0, tumble = 0, shake = 0, flail = 1;
        if (fall) {
            const k = fall.t / (L.FALL[fall.phase] || 1);
            if (fall.phase === 'tumble') tumble = fall.roll;
            // (Come to rest the right way up, they go over on to their back: what the tumble was doing with them eases off as they do.)
            else if (fall.phase === 'lie') { lie = smooth(0, 0.9, k); flail = 1 - lie; tumble = flail > 0 ? fall.roll : 0; sit = lie; }
            else if (fall.phase === 'sit') { lie = 1 - smooth(0, 0.6, k); sit = 1; } else if (fall.phase === 'shake') { sit = 1; shake = Math.sin(t * 26) * (1 - k * 0.5); } else sit = 1 - smooth(0, 1, k);
            if (lie || tumble) sit = Math.max(sit, 0.7);
            stop = 0;
        }
        // A boarder who has stopped sits down to wait.
        if (board && !fall && !p.sit) sit = Math.max(sit, smooth(0.6, 1, stop) * 0.9);
        const ground = sit && !p.sit;           // sitting in the snow, not on a chair
        // On a board, strapped in: the legs are worked out from the board (below). Which way the toes point across it (1: to the right
        // of the way the nose points; -1 riding switch); how far they are down in the snow, and whether on their knees (they stopped on
        // the toe edge, facing up the hill) or sat back behind the heel edge.
        const riding = board && !p.sit, toes = p.sw ? -1 : 1, seat = !ground || !riding ? 0 : fall ? Math.max(sit, lie) : smooth(0.6, 1, stop), kneel = riding && !fall ? smooth(0.2, 0.6, toes * Math.sin(sk)) : 0;
        let roll = 0, nod = 0, open = 0;
        // Legs: how far the thigh comes forward and the shin goes back, each from upright.
        let th = mix(0.45, 1.05, p.crouch || 0) + 0.4 * (p.tuck || 0), ps = mix(0.36, 0.66, p.crouch || 0) + 0.16 * (p.tuck || 0);
        th = mix(th, 0.2, stop); ps = mix(ps, 0.14, stop);
        th = mix(th, 1.45, Math.max(grab, air * 0.45)); ps = mix(ps, 1.0, Math.max(grab, air * 0.45));
        th = mix(th, 0.3, spread); ps = mix(ps, 0.25, spread);
        if (p.sit) { th = 1.5; ps = -0.1; } else if (sit) { th = mix(th, 1.95, sit); ps = mix(ps, 0.75, sit); }
        const hip = 0.1 + 0.43 * Math.cos(ps) + 0.45 * Math.cos(th), fore = (0.45 * Math.sin(th) - 0.43 * Math.sin(ps));

        st.reset(x, y, z, p.yaw, size);
        // (rz tips +x up: snow that is higher on their right lifts their right; a lean to the right is the other way.)
        if (!air) st.rx(-(p.pitch || 0)).rz(p.bank || 0);
        else st.rx(-(p.pitch || 0) * 0.6);
        if (tumble) st.move(0, 0.5, 0).rx(tumble).rz(Math.sin(tumble * 0.7) * 0.6 * (fall.turn || 1) * flail).move(0, -0.5, 0);
        if (p.spin && (p.spin[0] || p.spin[1] || p.spin[2])) st.move(0, 0.8, 0).rz(p.spin[2]).rx(p.spin[1]).ry(p.spin[0]).move(0, -0.8, 0);
        // Into the turn, from the edges up: the skis or the board stay on the snow, and the legs work it out below.
        if (board) st.ry(sk);
        if (ground && !riding) st.move(0, -hip + 0.2 + 0.12 * lie, 0).rx(-1.25 * lie);

        // What they stand on. A board lies along the way they are going; they stand across it.
        const stance = board ? (p.sw ? -1 : 1) * 1.28 : 0;
        st.ry(riding ? toes * SQUARE : stance + (p.twist || 0) * 0.5 + (board ? 0 : sk));
        if (riding) {
            // On a board both feet are strapped to it, across the way it goes, so a turn is a lean on to the toes or back on to the
            // heels, and the two are not the same shape. The board rolls on to that edge, which stays on the snow. The weight goes
            // on the line the tilt gives from that edge. On the heels they sit into a chair: legs short, hips low and back, and the
            // chest tipped forward over the board to balance them. On the toes the hips go forward over the edge and the knees
            // down towards the snow: legs long, the back straight along the line. Between the two, upright with the knees bent.
            const B = BONES, crouch = p.crouch || 0, tuck = p.tuck || 0, tucked = Math.max(grab, air * 0.45);
            // (Stood still across the hill, they rest on the edge that is up it. And a board that is sliding across its way is rolled
            // further on to that edge than the rider leans, from the ankles: the other edge must stay clear of the snow.)
            const ts = toes * clamp(tip + 0.12 * Math.sin(sk) * stop, -1.1, 1.1), ride = clamp(ts + toes * 0.3 * Math.sin(sk), -1.1, 1.1), sT = Math.sin(ts), cT = Math.cos(ts), toe = smooth(0.05, 0.6, ts), heel = smooth(0.05, 0.6, -ts);
            const reach = clamp(mix(mix(mix(0.86, 0.56, crouch) + 0.1 * toe - 0.1 * heel + 0.16 * smooth(0.45, 0.9, -ts) + 0.06 * smooth(0.6, 1, ts) - Math.min(0.15, 0.25 * Math.max(0, (p.press ?? 1 / cT) - 1.1)) - 0.1 * tuck, 0.5, tucked), 0.84, spread), 0.44, 0.86);
            nod = ts + (0.55 * mix(mix(0.34, 0.75, crouch), 1.15, tuck) * (1 - stop * 0.75) + 0.35 * grab - 0.3 * spread) * (1 - 0.85 * toe) - 0.06 * Math.max(ts, 0) + 0.9 * Math.max(-ts, 0) * (1 - 0.75 * smooth(0.5, 1.1, -ts));
            // The ankles, over the bindings on the rolled board. The hips: where the hips, the chest and the head between them
            // (three, five and two parts in ten) are on the line from the edge, and the legs as long as they should be.
            const side0 = ride < 0 ? -EDGE : EDGE, y0 = BOOT * Math.cos(ride) + side0 * Math.sin(ride), z0 = side0 + BOOT * Math.sin(ride) - side0 * Math.cos(ride), from = EDGE * (2 * smooth(-0.15, 0.15, ride) - 1);
            const qy = -0.27 * Math.cos(nod) - 0.024 * Math.cos(nod * 0.45), qz = from - 0.27 * Math.sin(nod) - 0.024 * Math.sin(nod * 0.45), nq = cT * (qy - y0) + sT * (qz - z0);
            const up = -nq + Math.sqrt(Math.max(0, nq * nq - (qy - y0) * (qy - y0) - (qz - z0) * (qz - z0) - (BIND - HIPS) * (BIND - HIPS) + reach * reach));
            let py = qy + up * cT, pz = qz + up * sT;
            roll = ride;
            // Down in the snow: sat behind the board, which stands on its heel edge, knees up; or knelt in front of it; or on their back.
            if (seat) { py = mix(py, mix(0.2, 0.46, kneel), seat); pz = mix(pz, mix(-0.52, 0.3, kneel), seat); nod = mix(nod, mix(mix(0.25, 0.1, kneel), -1.35, lie), seat); roll = mix(roll, mix(-0.55, 1, kneel), seat); }
            const pivot = roll < 0 ? -EDGE : EDGE, sR = Math.sin(roll), cR = Math.cos(roll), ay = BOOT * cR + pivot * sR, az = pivot + BOOT * sR - pivot * cR;
            // (Which way the knees go: towards the toes, as the body is tipped; up, sat down; down, on their knees.)
            const lift = 0.35 - 0.9 * kneel * seat, tipK = (ts < 0 ? ts : 0.5 * ts) * (1 - seat), ky = lift * Math.cos(tipK) - Math.sin(tipK), kz = lift * Math.sin(tipK) + Math.cos(tipK);
            ROOT.set(st.top);
            st.push().move(0, 0, pivot).rx(roll).move(0, 0, -pivot).ry(-toes * SQUARE);
            put(Q.board());
            st.pop();
            for (const side of [-1, 1]) {
                // Two bones from hip to ankle: the knee is off the line between them, towards the toes and a little out.
                const o = side < 0 ? 0 : 9, hx = side * HIPS;
                let dx = side * BIND - hx, dy = ay - py, dz = az - pz;
                const far = Math.hypot(dx, dy, dz) || 1, d = clamp(far, 0.12, THIGH + SHIN - 0.004);
                dx /= far; dy /= far; dz /= far;
                const part = (THIGH * THIGH - SHIN * SHIN + d * d) / (2 * d), off = Math.sqrt(Math.max(0, THIGH * THIGH - part * part)), dot = side * 0.4 * dx + ky * dy + kz * dz;
                let bx = side * 0.4 - dot * dx, by = ky - dot * dy, bz = kz - dot * dz;
                const bl = Math.hypot(bx, by, bz) || 1;
                bx /= bl; by /= bl; bz /= bl;
                const tx = (dx * part + bx * off) / THIGH, ty = (dy * part + by * off) / THIGH, tz = (dz * part + bz * off) / THIGH;
                const sx = (dx * d - tx * THIGH) / SHIN, sy = (dy * d - ty * THIGH) / SHIN, sz = (dz * d - tz * THIGH) / SHIN;
                B[o] = hx; B[o + 1] = py; B[o + 2] = pz;
                B[o + 3] = hx + tx * THIGH; B[o + 4] = py + ty * THIGH; B[o + 5] = pz + tz * THIGH;
                B[o + 6] = B[o + 3] + sx * SHIN; B[o + 7] = B[o + 4] + sy * SHIN; B[o + 8] = B[o + 5] + sz * SHIN;
                along(st, hx, py, pz, tx, ty, tz);
                put(Q.thigh());
                // (Feet a little apart at the toes, as the bindings are set.)
                along(st, B[o + 3], B[o + 4], B[o + 5], sx, sy, sz).ry(side * 0.3);
                put(Q.shin());
            }
            st.top.set(ROOT);
            st.move(0, py, pz);
            B[18] = nod; B[19] = roll;
            B[26] = 0; B[27] = py; B[28] = pz;
            B[29] = 0; B[30] = py + 0.3 * Math.cos(nod); B[31] = pz + 0.3 * Math.sin(nod);
            B[32] = 0; B[33] = py + 0.6 * Math.cos(nod) + 0.12 * Math.cos(nod * 0.45); B[34] = pz + 0.6 * Math.sin(nod) + 0.12 * Math.sin(nod * 0.45);
        } else if (board || afoot) {
            st.move(0, hip, -fore * 0.55);
            for (const side of [-1, 1]) {
                const inside = side * lean > 0 ? Math.abs(lean) : 0, stride = p.walk ? Math.sin(p.walk + (side > 0 ? 0 : Math.PI)) : 0;
                const a = th + 0.4 * inside - 0.08 * (1 - inside) * Math.abs(lean) + 0.5 * stride, b = ps + 0.22 * inside + (p.walk ? 0.45 * Math.max(0, Math.cos(p.walk + (side > 0 ? 0 : Math.PI))) : 0);
                st.push().move(side * (board ? 0.13 : 0.12), 0, 0).rz(side * ((board ? 0.3 : 0.11) + 0.55 * spread + (p.plough ? 0.12 : 0))).rx(-a);
                put(Q.thigh());
                st.move(0, -THIGH, 0).rx(a + b);
                put(Q.shin());
                st.pop();
            }
        } else {
            // On skis the legs are worked out from where things must be. The skis stay on the snow, a hip's width apart and
            // wider in a carve, each rolled on to its edge. The hips go inside, along the line the tilt gives, as far from
            // the feet as the outside leg is long: long as the turn builds, shorter again as the load on it peaks. Then each
            // leg is bent to fit, knee forward: the inside one comes out short, its knee high, with nothing said about it.
            // (Down in deep snow the skis are kept together, as one platform; whoever skis warily stands wider.)
            const sT = Math.sin(tip), cT = Math.cos(tip), at = Math.abs(tip), deep = smooth(0.06, 0.16, p.sink || 0), wide = 0.08 * smooth(0.15, 0.8, at) * (1 - deep) - 0.4 * HIPS * deep + (p.wide || 0), zP = -fore * 0.55, B = BONES;
            const press = p.press ?? 1 / cT, cR = cT, sR = sT, outer = tip < 0 ? 1 : -1;
            let reach = 0;
            for (const side of [-1, 1]) {
                const o = side < 0 ? 0 : 9, step = p.walk ? p.walk + (side > 0 ? 0 : Math.PI) : 0;
                const a = th + (p.walk ? 0.5 * Math.sin(step) : 0), b = ps + (p.walk ? 0.45 * Math.max(0, Math.cos(step)) : 0), splay = side * (0.55 * spread + (p.plough ? 0.12 : 0));
                const down = THIGH * Math.cos(a) + SHIN * Math.cos(b), ahead = THIGH * Math.sin(a) - SHIN * Math.sin(b);
                // The ankle: over the middle of its ski, which stands on its inside edge. The inside ski leads a little.
                B[o + 6] = side * (HIPS + wide) + Math.sin(splay) * down + ANKLE * sT;
                B[o + 7] = hip - Math.cos(splay) * down - ANKLE + 0.045 * Math.abs(sT) + ANKLE * cT;
                B[o + 8] = zP + ahead + (side !== outer ? 0.08 * Math.abs(sT) : 0);
                if (side === outer) reach = Math.min(0.875, Math.hypot(down, ahead) + 0.12 * smooth(0.05, 0.45, at) - 0.25 * Math.max(0, press - 1.1));
            }
            // How far up the tilted line the hips are, for the outside leg to be that long.
            const oo = outer < 0 ? 0 : 9, qx = outer * HIPS * cR * cP - B[oo + 6], qy = -outer * HIPS * sR * cP - B[oo + 7], qz = zP - outer * HIPS * sP - B[oo + 8], nq = sT * qx + cT * qy;
            ROOT.set(st.top);
            const up = -nq + Math.sqrt(Math.max(0, nq * nq - qx * qx - qy * qy - qz * qz + reach * reach));
            B[18] = tor; B[19] = up;
            for (const side of [-1, 1]) {
                const o = side < 0 ? 0 : 9, hx = up * sT + side * HIPS * cR * cP, hy = up * cT - side * HIPS * sR * cP, hz = zP - side * HIPS * sP;
                B[o] = hx; B[o + 1] = hy; B[o + 2] = hz;
                // Two bones between hip and ankle: the knee is off the line between them, forwards and a little into the turn
                // (and round with the hips, where they are turned off the skis).
                let dx = B[o + 6] - hx, dy = B[o + 7] - hy, dz = B[o + 8] - hz;
                const far = Math.hypot(dx, dy, dz) || 1, d = clamp(far, 0.12, THIGH + SHIN - 0.004);
                dx /= far; dy /= far; dz /= far;
                const part = (THIGH * THIGH - SHIN * SHIN + d * d) / (2 * d), off = Math.sqrt(Math.max(0, THIGH * THIGH - part * part)), kx = 0.3 * sT + 0.6 * sP, dot = kx * dx + dz;
                let bx = kx - dot * dx, by = -dot * dy, bz = 1 - dot * dz;
                const bl = Math.hypot(bx, by, bz) || 1;
                bx /= bl; by /= bl; bz /= bl;
                // The thigh, from the hip to the knee; the shin, from there to the ankle (or as near as the leg reaches).
                const tx = (dx * part + bx * off) / THIGH, ty = (dy * part + by * off) / THIGH, tz = (dz * part + bz * off) / THIGH;
                const sx = (dx * d - tx * THIGH) / SHIN, sy = (dy * d - ty * THIGH) / SHIN, sz = (dz * d - tz * THIGH) / SHIN;
                B[o + 3] = hx + tx * THIGH; B[o + 4] = hy + ty * THIGH; B[o + 5] = hz + tz * THIGH;
                // (A thigh may point above level, sat in the snow; a shin never does.)
                const over = ty > 0 ? -1 : 1, s1 = Math.atan2(tx * over, -ty * over), a1 = Math.atan2(tz, Math.hypot(tx, ty) * over), s2 = Math.atan2(sx, -sy), b2 = Math.atan2(-sz, Math.hypot(sx, sy));
                st.push().move(hx, hy, hz).rz(s1).rx(-a1);
                put(Q.thigh());
                st.move(0, -THIGH, 0).rx(a1).rz(s2 - s1).rx(b2);
                put(Q.shin());
                // The ski: level along the snow whatever the shin does, turned for a plough or a spread, and on its edge.
                st.move(0, -SHIN, 0).rx(-b2 - (p.sit ? 0.25 + 0.12 * Math.sin(t * 1.7 + side) : 0)).rz(-s2).ry(p.plough ? -side * 0.32 : -spread * side * 0.5).rz((p.plough ? side * 0.12 : 0) - tip);
                st.move(0, -ANKLE, 0.05);
                put(Q.ski());
                st.pop();
            }
            st.move(up * sT, up * cT, zP);
        }
        // Hips, and the body over them: upright against the lean, folded forward in a tuck.
        const bend = mix(mix(0.34, 0.75, p.crouch || 0), 1.15, p.tuck || 0) * (1 - stop * 0.75) * (1 - 0.8 * (p.sit ? 1 : 0)) * (1 - 0.3 * (p.upright || 0)) + 0.35 * grab - (ground ? 0.55 * sit : 0) - 0.3 * spread;
        if (riding) {
            // Hips and shoulders near the board's line, a little open to the way it is going. (The head goes on from here, below.)
            open = -toes * 0.29 - 0.4 * (p.twist || 0);
            st.push().rx(nod * 0.5).ry(open * 0.5);
            put(Q.hips());
            st.pop().push().rx(nod).ry(open).size(who.woman ? 0.9 : 1.04, 1, 1);
        } else {
            st.rz((board ? tip : 0) - tor).ry(-(p.twist || 0) * 0.9 + pv);
            put(Q.hips());
            st.ry(chest - pv).rx(board ? bend * 0.55 : bend).size(who.woman ? 0.9 : 1.04, 1, 1);
        }
        put(Q.torso());
        if (who.pack) put(Q.pack());
        // Arms. A skier riding has its hands where they are wanted, and its arms and poles are worked out from them (below);
        // tucked, in the air, stopped (`old`, 0 to 1) the arms are posed as they always were, and the hands go between the two.
        // A boarder's hands are quiet too: the front one out along the board ahead, the other trailing, both low; forward over the board
        // on the heels, and the trailing one down by the snow hard over on the toes.
        const hands = riding || !board && !afoot && !p.plough && !fall && !sit && !p.walk && (p.drink === undefined || p.drink === null);
        const old = riding ? clamp(Math.max(air, grab, spread, seat, tumble || shake || p.wave ? 1 : 0), 0, 1) : hands ? clamp(Math.max(p.tuck || 0, air, grab, spread, stop), 0, 1) : 1;
        let fx = 0, fz = 1;
        if (old < 1 && !board) {
            // The way the chest faces along the snow, in the skis' frame: from the way its right is.
            const m = st.top, ax = ROOT[0] * m[0] + ROOT[4] * m[4] + ROOT[8] * m[8], az = ROOT[2] * m[0] + ROOT[6] * m[4] + ROOT[10] * m[8], l = Math.hypot(ax, az) || 1;
            fx = -az / l; fz = ax / l;
        }
        for (const side of [-1, 1]) {
            const swing = Math.sin((p.phase || 0) + (side > 0 ? 0 : Math.PI)), reach = side > 0 ? grab : 0;
            let sh = -0.95 - 0.25 * swing * (1 - stop), outw = 0.8, el = -0.9;
            if (board) { sh = -0.25 + 0.2 * lean * side; outw = 1.0 + 0.25 * Math.sin(t * 2.3 + side); el = -0.35; }
            if (p.tuck) { sh = mix(sh, -1.5, p.tuck); el = mix(el, -1.6, p.tuck); outw = mix(outw, 0.12, p.tuck); }
            if (air) { outw = mix(outw, 1.15, 1 - reach); sh = mix(sh, -0.2, 0.7); }
            if (reach) { sh = mix(sh, 0.55, reach); el = mix(el, -0.15, reach); outw = mix(outw, 0.2, reach); }
            if (spread) { outw = mix(outw, 2.3, spread); el = mix(el, -0.1, spread); }
            if (stop && !board) { sh = mix(sh, -0.35, stop); el = mix(el, -0.6, stop); }
            if (ground) { sh = mix(sh, 0.5 - kneel, sit); outw = mix(outw, 0.5, sit); el = mix(el, -0.2, sit); }
            if (shake) { sh = -1.9 + 0.5 * shake * side; el = -1.7; outw = 0.3; }
            if (p.wave && side < 0) { sh = -2.7 + 0.3 * Math.sin(t * 9); el = -0.4; outw = 0.5; }
            if (tumble) { sh = mix(sh, -1.5 + Math.sin(tumble * 1.3 + side) * 1.2, flail); outw = mix(outw, 1.2, flail); el = mix(el, -0.4, flail); }
            if (p.walk) sh += 0.45 * Math.sin(p.walk + (side > 0 ? Math.PI : 0));
            // At the table: forearms on it, and one hand bringing the mug up.
            const mug = p.drink !== undefined && p.drink !== null;
            if (mug) { const up = side > 0 ? p.drink : 0; sh = mix(-0.7, -1.2, up); el = mix(-1.0, -1.95, up); outw = mix(0.3, 0.12, up); }
            const poleX = -(sh + el) - bend + mix(1.0 + 0.25 * swing, 1.5, p.tuck || 0) - 0.9 * stop + 0.8 * spread, poleZ = -side * (outw - 0.1);
            if (old < 1) {
                // The shoulder; and the elbow, the hand and the pole's tip as the old arm would have them.
                st.push().move(side * 0.245, 0.47, 0);
                within(st.top, 0);
                if (old > 0) { st.rz(side * outw).rx(sh).move(0, -UPPER, 0); within(st.top, 3); st.rx(el).move(0, -FORE, 0); within(st.top, 6); st.rx(poleX).rz(poleZ).move(0, -POLE, 0); within(st.top, 9); }
                const sx = PT[0], sy = PT[1], sz = PT[2], o = side < 0 ? 0 : 9, pl = p.plantSide === side ? p.plant || 0 : 0;
                // Hands forward and a little out, between hip and chest; the pole back from there along the skis, its tip clear of the
                // snow and a forearm's length outside its own foot, wherever the lean has put the shoulders (not out to the side, like
                // an outrigger). In a plant the tip is on the snow beside the tip of that ski, and the hand over it, forward and down;
                // and there on the snow it stays as they go by (`reach`), until it is beside the boot and comes out.
                const snow = p.sink || 0;
                let hx = sx + side * 0.1 * fz + (0.36 + 0.06 * pl) * fx, hy = Math.max(0.5 + snow, sy - 0.36 + 0.06 * pl), hz = sz - side * 0.1 * fx + (0.36 + 0.06 * pl) * fz;
                // (Hard over, the outside hand is carried out over its ski, as far as the arm goes, for the pole to get there.)
                const back = Math.sqrt(Math.max(0, POLE * POLE - (hy - 0.16 - snow) * (hy - 0.16 - snow))), need = BONES[o + 6] + side * 0.4 - hx, out = clamp(need, -0.55 * back, 0.55 * back);
                hx += 0.9 * (need - out);
                let tx = mix(hx + out, BONES[o + 6] + side * 0.32, pl), ty = snow + 0.16 * (1 - pl), tz = mix(hz - Math.sqrt(back * back - out * out), BONES[o + 8] + 0.7 - Math.min(p.reach || 0, 1.3), pl);
                // (The hand is a pole's length from where its tip is.)
                let dx = hx - tx, dy = hy - ty, dz = hz - tz, l = POLE / (Math.hypot(dx, dy, dz) || 1);
                hx = tx + dx * l; hy = ty + dy * l; hz = tz + dz * l;
                if (board) {
                    const front = side * toes < 0, heel = smooth(0.05, 0.6, -roll);
                    hx = sx + side * (front ? 0.36 : 0.3); hy = Math.max(0.1, mix(sy - 0.3 - 0.06 * heel, 0.1, front ? 0 : smooth(0.5, 1, roll))); hz = sz + 0.12 + 0.2 * heel + (front ? 0 : 0.1 * smooth(0.05, 0.6, roll));
                }
                // The elbow is off the line from shoulder to hand: down, out and a little back.
                let ex = side * 0.5 * fz - 0.3 * fx, ey = -1, ez = -side * 0.5 * fx - 0.3 * fz;
                if (old > 0) {
                    hx = mix(hx, PT[6], old); hy = mix(hy, PT[7], old); hz = mix(hz, PT[8], old);
                    tx = mix(tx, PT[9], old); ty = Math.max(0.03 + snow, mix(ty, PT[10], old)); tz = mix(tz, PT[11], old);
                    ex = mix(ex, PT[3] - sx, old); ey = mix(ey, PT[4] - sy, old); ez = mix(ez, PT[5] - sz, old);
                }
                dx = hx - sx; dy = hy - sy; dz = hz - sz;
                const far = Math.hypot(dx, dy, dz) || 1, d = clamp(far, 0.08, UPPER + FORE - 0.004), bow = Math.sqrt(Math.max(0, UPPER * UPPER - d * d / 4));
                dx /= far; dy /= far; dz /= far;
                const dot = ex * dx + ey * dy + ez * dz;
                ex -= dot * dx; ey -= dot * dy; ez -= dot * dz;
                l = bow / (Math.hypot(ex, ey, ez) || 1);
                // Upper arm from the shoulder to the elbow; forearm from there to the hand (or as near as the arm reaches); the pole from the hand.
                const kx = sx + dx * d / 2 + ex * l, ky = sy + dy * d / 2 + ey * l, kz = sz + dz * d / 2 + ez * l;
                hx = sx + dx * d; hy = sy + dy * d; hz = sz + dz * d;
                along(st, sx, sy, sz, (kx - sx) / UPPER, (ky - sy) / UPPER, (kz - sz) / UPPER);
                put(Q.upper());
                along(st, kx, ky, kz, (hx - kx) / FORE, (hy - ky) / FORE, (hz - kz) / FORE);
                put(Q.fore());
                if (board) { BONES[o ? 38 : 35] = hx; BONES[o ? 39 : 36] = hy; BONES[o ? 40 : 37] = hz; st.pop(); continue; }
                dx = tx - hx; dy = ty - hy; dz = tz - hz; l = 1 / (Math.hypot(dx, dy, dz) || 1);
                along(st, hx, hy, hz, dx * l, dy * l, dz * l);
                put(Q.pole());
                BONES[o ? 23 : 20] = hx + dx * l * POLE; BONES[o ? 24 : 21] = hy + dy * l * POLE; BONES[o ? 25 : 22] = hz + dz * l * POLE;
                st.pop();
                continue;
            }
            st.push().move(side * 0.245, 0.47, 0).rz(side * outw).rx(sh);
            put(Q.upper());
            st.move(0, -0.3, 0).rx(el);
            put(Q.fore());
            if (mug && side > 0) { st.push().move(0, -0.36, 0.05).rx(-(sh + el)); put(mugOf()); st.pop(); }
            if (!board && !afoot && !p.plough && !tumble && !lie) {
                // Poles trail behind, and come up under the arms in a tuck.
                st.move(0, -0.3, 0).rx(poleX).rz(poleZ);
                put(Q.pole());
            }
            st.pop();
        }
        // The head: more upright than the back, and turned to look where they are going.
        if (riding) st.pop().rx(nod).move(0, 0.6, 0).rx(nod * -0.55).ry(-toes * 1.315 - 0.4 * (p.twist || 0) + (shake ? shake * 0.7 : 0) + (p.head || 0));
        else st.move(0, 0.6, 0).rz(board ? 0 : tor * 0.85).rx(-bend * (board ? 0.4 : 0.8) + 0.1).ry(-stance * 0.8 + (shake ? shake * 0.7 : 0) + (p.head || 0));
        put(Q.head());
        if (who.woman) put(Q.tail());
    }

    // ---- Things that stand on the mountain ------------------------------------------
    const prop = (key, make) => model('prop:' + key, make);
    const hut = () => prop('hut', s => {
        // Front (the door, the terrace) faces +z. 9 m wide, 6.4 deep.
        s.paint(C.stone).fx(0).box(0, 0.6, 0, 4.5, 0.9, 3.2, 0.7);
        s.paint(C.log).box(0, 2.6, 0, 4.4, 1.1, 3.1, 0.85);
        for (let i = 0; i < 5; i++) s.paint(C.timber).box(0, 1.7 + i * 0.44, 3.12, 4.42, 0.02, 0.02, 1);
        // The roof, and a slab of snow lying on it, overhanging the eaves.
        for (const sg of [-1, 1]) {
            const n = [sg * 0.52, 0.85, 0];
            s.paint(C.timber).quad([sg * 5.2, 3.5, -3.9], [sg * 5.2, 3.5, 3.9], [0, 6.4, 3.9], [0, 6.4, -3.9], n);
            s.paint(C.snow).quad([sg * 5.45, 3.72, -4.1], [sg * 5.45, 3.72, 4.1], [0, 6.95, 4.1], [0, 6.95, -4.1], n);
            s.paint(C.shade).quad([sg * 5.45, 3.72, -4.1], [sg * 5.45, 3.72, 4.1], [sg * 5.2, 3.5, 3.9], [sg * 5.2, 3.5, -3.9], [sg * 0.85, -0.52, 0]);
            for (const e of [-1, 1]) {
                s.paint(C.log).tri([sg * 4.4, 3.7, e * 3.1], [0, 6.2, e * 3.1], [0, 3.7, e * 3.1], [0, 0, e]);
                s.paint(C.shade).quad([sg * 5.45, 3.72, e * 4.1], [0, 6.95, e * 4.1], [0, 6.4, e * 3.9], [sg * 5.2, 3.5, e * 3.9], [0, 0, e]);
            }
        }
        // Chimney, with its own cap of snow.
        s.paint(C.stone).box(2.4, 6.3, -1.2, 0.45, 1.3, 0.45, 0.8, C.snow);
        // Door and windows: warm when the lamps are lit.
        s.paint(C.timber).box(0, 2.25, 3.13, 0.55, 1.0, 0.04, 0.8);
        for (const x of [-2.9, -1.6, 1.6, 2.9]) s.paint(C.glass).fx(0, 255).box(x, 2.75, 3.13, 0.42, 0.42, 0.04, 1).fx(0).paint(C.timber).box(x, 2.28, 3.2, 0.5, 0.04, 0.08, 1);
        for (const z of [-1.6, 1.2]) for (const sg of [-1, 1]) s.paint(C.glass).fx(0, 255).box(sg * 4.42, 2.75, z, 0.04, 0.4, 0.45, 1).fx(0);
        s.paint(C.glass).fx(0, 255).box(0, 4.9, 3.13, 0.4, 0.35, 0.04, 1).fx(0);
        // The terrace: boards, a rail, two benches and a table.
        s.paint(C.timber).box(0, 1.42, 5.2, 4.6, 0.08, 2.0, 0.6, [150, 116, 84]);
        for (let i = -4; i <= 4; i += 2) s.paint(C.timber).box(i * 1.1, 0.7, 7.1, 0.09, 0.75, 0.09, 0.6).box(i * 1.1, 1.95, 7.1, 0.07, 0.45, 0.07, 1);
        s.box(0, 2.4, 7.1, 4.6, 0.06, 0.07, 1, C.snow);
        for (const sg of [-1, 1]) s.box(sg * 4.5, 2.4, 5.2, 0.07, 0.06, 1.95, 1, C.snow).box(sg * 4.5, 1.95, 3.6, 0.07, 0.45, 0.07, 1);
        s.box(-2.2, 2.25, 5.4, 0.9, 0.05, 0.4, 0.8, C.snow);
        for (const z of [4.6, 6.2]) s.box(-2.2, 1.95, z, 0.9, 0.04, 0.18, 0.8);
        // Steps down to the snow, and skis stood in a rack.
        s.paint(C.stone).box(2.6, 0.9, 7.6, 0.9, 0.5, 0.5, 0.7, C.snow).box(2.6, 0.45, 8.5, 0.9, 0.4, 0.5, 0.7, C.snow);
        s.paint(C.timber).box(-6.2, 1.0, 5.6, 0.06, 0.6, 1.3, 0.7).box(-6.2, 1.55, 5.6, 0.08, 0.05, 1.4, 1);
        [C.red, C.yellow, C.blue, C.orange, [80, 200, 190]].forEach((c, i) => s.paint(c).at(tilt(-6.05, 0.5, 4.6 + i * 0.5, 0.12)).box(0, 0.85, 0, 0.012, 0.85, 0.045, 0.8).at(null));
        // A flag on a pole.
        s.paint(C.steel).prism(5, 4.9, 1.4, 7.0, 0.04, 6.4, 0.03);
        s.paint(C.red).fx(0, 0, 255).quad([4.93, 6.3, 7.0], [4.93, 5.5, 7.0], [6.2, 5.6, 7.0], [6.2, 6.2, 7.0], [0, 0, 1]).fx(0);
    });
    // The grand lodge (L.LODGE has its plan): three floors on a stone plinth, a
    // great hall's gable of glass facing the piste (+z), and a terrace of
    // tables in front of it, steps down to the snow. y = 0 is its level pad.
    const lodge = () => prop('lodge', s => {
        const D = L.LODGE.deck, [T0, T1] = L.LODGE.steps, glass = (x, y, z, hx, hy, hz) => s.paint(C.glass).fx(0, 255).box(x, y, z, hx, hy, hz, 1).fx(0).paint(C.timber);
        // The plinth, down into the hill, and the terrace on it.
        s.paint(C.stone).fx(0).box(0, -0.75, 0, 13.6, 1.75, 6.0, 0.7);
        s.box(0, -0.8, 10.2, 13.6, 1.7, T0 - 10.2, 0.7);
        s.paint(C.timber).box(0, D - 0.05, 10.2, 13.6, 0.05, T0 - 10.2, 1, [150, 116, 84]);
        // A stone ground floor, and two of timber a little proud of it.
        s.paint(C.stone).box(0, 2.6, 0, 13, 1.6, 5.5, 0.8);
        s.paint(C.log).box(0, 6.7, 0, 13.25, 2.5, 5.75, 0.85);
        for (let i = 0; i < 10; i++) s.paint(C.timber).box(0, 4.45 + i * 0.5, 5.76, 13.26, 0.02, 0.02, 1);
        // The roof: its ridge along the front, and a slab of snow lying on it.
        for (const sg of [-1, 1]) {
            const n = [0, 0.77, sg * 0.64];
            s.paint(C.timber).quad([-14.4, 8.8, sg * 7.4], [14.4, 8.8, sg * 7.4], [14.4, 15, 0], [-14.4, 15, 0], n);
            s.paint(C.snow).quad([-14.7, 9.05, sg * 7.65], [14.7, 9.05, sg * 7.65], [14.7, 15.5, 0], [-14.7, 15.5, 0], n);
            s.paint(C.shade).quad([-14.7, 9.05, sg * 7.65], [14.7, 9.05, sg * 7.65], [14.4, 8.8, sg * 7.4], [-14.4, 8.8, sg * 7.4], [0, -0.64, sg * 0.77]);
            for (const e of [-1, 1]) {
                s.paint(C.log).tri([e * 13.25, 9.2, sg * 5.75], [e * 13.25, 15, 0], [e * 13.25, 9.2, 0], [e, 0, 0]);
                s.paint(C.shade).quad([e * 14.7, 9.05, sg * 7.65], [e * 14.7, 15.5, 0], [e * 14.4, 15, 0], [e * 14.4, 8.8, sg * 7.4], [e, 0, 0]);
            }
        }
        // The great hall: a bay out to the front under its own gable, all glass.
        s.paint(C.stone).box(0, 2.6, 6.35, 5, 1.6, 0.85, 0.8);
        s.paint(C.log).box(0, 6.6, 6.35, 5, 2.4, 0.85, 0.85);
        for (const sg of [-1, 1]) {
            const n = [sg * 0.72, 0.69, 0];
            s.paint(C.timber).quad([sg * 6.2, 8.4, 0], [sg * 6.2, 8.4, 8.3], [0, 14.3, 8.3], [0, 14.3, 0], n);
            s.paint(C.snow).quad([sg * 6.5, 8.62, 0], [sg * 6.5, 8.62, 8.6], [0, 14.8, 8.6], [0, 14.8, 0], n);
            s.paint(C.shade).quad([sg * 6.5, 8.62, 8.6], [0, 14.8, 8.6], [0, 14.3, 8.3], [sg * 6.2, 8.4, 8.3], [0, 0, 1]);
            s.paint(C.log).tri([sg * 5, 9, 7.2], [0, 13.6, 7.2], [0, 9, 7.2], [0, 0, 1]);
            // Posts and a brace under the gable's eaves.
            s.paint(C.timber).box(sg * 5.6, 4.7, 8.0, 0.16, 3.7, 0.16, 0.8).box(sg * 2.8, 11.3, 8.1, 0.12, 0.12, 0.12, 1);
        }
        glass(0, 6.4, 7.22, 3.9, 2.2, 0.03);
        s.paint(C.glass).fx(0, 255).tri([-3.5, 9.15, 7.23], [3.5, 9.15, 7.23], [0, 12.3, 7.23], [0, 0, 1]).fx(0).paint(C.timber);
        for (const x of [-3.9, -1.95, 0, 1.95, 3.9]) s.box(x, 6.4, 7.27, 0.09, 2.25, 0.05, 1);
        s.box(0, 8.8, 7.27, 4.3, 0.16, 0.07, 1).box(0, 6.4, 7.27, 3.95, 0.06, 0.05, 1).box(0, 10.6, 7.27, 0.09, 1.65, 0.05, 1);
        // The doors, a porch over them, and the bay's own ground-floor windows.
        s.box(0, 2.25, 7.22, 1.3, 1.25, 0.05, 0.8);
        for (const x of [-0.62, 0.62]) glass(x, 2.6, 7.26, 0.4, 0.6, 0.02);
        for (const x of [-3.4, 3.4]) glass(x, 2.7, 7.22, 0.9, 0.7, 0.03);
        s.box(0, 3.75, 7.9, 1.9, 0.07, 0.75, 1, C.snow);
        for (const x of [-1.75, 1.75]) s.box(x, 2.35, 8.5, 0.09, 1.35, 0.09, 0.8);
        // The wings: windows on every floor, a balcony along the first, dormers in the roof.
        for (const sg of [-1, 1]) {
            for (const x of [6.9, 9.1, 11.3]) {
                glass(sg * x, 2.8, 5.52, 0.7, 0.75, 0.03);
                for (const y of [5.6, 7.9]) { glass(sg * x, y, 5.77, 0.6, 0.6, 0.03); s.box(sg * x, y - 0.68, 5.85, 0.72, 0.05, 0.1, 1, C.snow); }
            }
            s.box(sg * 9.25, 4.3, 6.25, 4.0, 0.07, 0.5, 0.8, C.snow).box(sg * 9.25, 5.3, 6.72, 4.0, 0.05, 0.05, 1, C.snow);
            for (let x = 5.3; x <= 13.3; x += 1) s.box(sg * x, 4.8, 6.72, 0.04, 0.5, 0.04, 1);
            for (const x of [8, 11.3]) { s.paint(C.log).box(sg * x, 11.2, 4.4, 0.85, 0.9, 1.5, 0.9, C.snow); glass(sg * x, 11.25, 5.92, 0.5, 0.5, 0.03); }
            // The ends, and a few at the back.
            for (const z of [-3, 0, 3]) { glass(sg * 13.02, 2.8, z, 0.03, 0.75, 0.7); for (const y of [5.6, 7.9]) glass(sg * 13.27, y, z, 0.03, 0.6, 0.6); }
            glass(sg * 13.27, 11.3, 0, 0.03, 0.7, 0.6);
            for (const x of [2.5, 6.9, 11.3]) for (const y of [5.6, 7.9]) glass(sg * x, y, -5.77, 0.6, 0.6, 0.03);
            // Two great chimneys, each with its cap of snow.
            s.paint(C.stone).box(sg * 7.5, 14.6, -2, 0.75, 2.2, 0.75, 0.8, C.snow).paint(C.timber);
            // The terrace's rail, with a gap for the steps; tall posts and a string of lamps along the front.
            for (let x = 2.4; x <= 13.5; x += 1.85) s.box(sg * x, D + 0.5, T0 - 0.1, 0.06, 0.5, 0.06, 0.8);
            s.box(sg * 7.95, D + 1.0, T0 - 0.1, 5.6, 0.05, 0.07, 1, C.snow);
            for (let z = 6.2; z < T0 - 0.2; z += 2.05) s.box(sg * 13.5, D + 0.5, z, 0.06, 0.5, 0.06, 0.8);
            s.box(sg * 13.5, D + 1.0, 10.2, 0.07, 0.05, T0 - 10.25, 1, C.snow);
            for (const x of [2.4, 13.5]) s.box(sg * x, D + 1.45, T0 - 0.1, 0.05, 1.45, 0.05, 0.9);
            for (let i = 1; i < 14; i++) { const f = i / 14; s.paint(C.lamp).fx(0, 255).box(sg * mix(2.4, 13.5, f), D + 2.85 - 0.45 * Math.sin(Math.PI * f), T0 - 0.1, 0.06, 0.06, 0.06, 1).fx(0).paint(C.timber); }
            // Tables and benches (the friends' own is L.LODGE.table).
            for (const x of [5.5, 10.5]) {
                s.box(sg * x, D + 0.75, 11, 1.0, 0.04, 0.4, 1, C.log).box(sg * x, D + 0.37, 11, 0.06, 0.36, 0.3, 0.8);
                for (const e of [-1, 1]) s.box(sg * x, D + L.LODGE.seatY - 0.03, 11 + e * L.LODGE.bench, 1.0, 0.03, 0.17, 1).box(sg * x, D + 0.2, 11 + e * L.LODGE.bench, 0.7, 0.2, 0.04, 0.8);
            }
            // Racks of skis either side of the steps, and flags at the corners.
            s.box(sg * 5, 0.5, T1 + 0.3, 1.5, 0.5, 0.05, 0.7).box(sg * 5, 1.02, T1 + 0.3, 1.6, 0.04, 0.08, 1, C.snow);
            [C.red, C.yellow, C.blue, C.orange, [80, 200, 190], C.white].forEach((c, i) => s.paint(c).box(sg * (3.9 + i * 0.44), 0.86, T1 + 0.42, 0.045, 0.86, 0.012, 0.8));
            s.paint(C.steel).prism(5, sg * 13.4, D, T0 + 0.3, 0.05, D + 6.2, 0.03);
            s.paint(sg > 0 ? C.red : C.blue).fx(0, 0, 255).quad([sg * 13.4 + 0.03, D + 6.1, T0 + 0.3], [sg * 13.4 + 0.03, D + 5.2, T0 + 0.3], [sg * 13.4 + 1.5, D + 5.3, T0 + 0.3], [sg * 13.4 + 1.5, D + 6.0, T0 + 0.3], [0, 0, 1]).fx(0).paint(C.timber);
        }
        // Steps down to the snow.
        for (let i = 0; i < 4; i++) { const top = D * (3.5 - i) / 4; s.paint(C.stone).box(0, (top - 1.5) / 2, T0 + (i + 0.5) * (T1 - T0) / 4, 2.4, (top + 1.5) / 2, (T1 - T0) / 8, 0.7, C.snow); }
        // A fire in a ring of stones.
        s.paint(C.stone).prism(8, -3.6, D, 8.6, 0.8, D + 0.4, 0.7, { cap: true });
        s.paint(C.orange).fx(0, 255).prism(5, -3.6, D + 0.38, 8.6, 0.38, D + 1.05, 0).fx(0);
    });
    const tower = top => prop('tower:' + top, s => {
        s.paint(C.steel).fx(0).prism(8, 0, -0.5, 0, 0.3, top, 0.2, { foot: 0.6 });
        s.box(0, top, 0, 2.7, 0.14, 0.16, 1, C.snow);
        for (const sg of [-1, 1]) s.paint(C.dark).box(sg * 2.45, top - 0.28, 0, 0.1, 0.16, 0.8, 1).paint(C.steel);
        s.box(0, top + 0.5, 0, 0.07, 0.4, 0.07, 1);
        for (let y = 1; y < top - 0.5; y += 0.6) s.paint(C.dark).box(0.33, y, 0, 0.1, 0.02, 0.14, 1);
    });
    const station = () => prop('station', s => {
        s.paint(C.steel).fx(0).prism(8, 0, -0.5, 0, 0.45, 5.2, 0.4, { foot: 0.6 });
        s.paint(C.dark).prism(14, 0, 5.2, 0, 2.5, 5.4, 2.5, { cap: true, foot: 1 });
        s.paint(C.red).box(0, 6.2, 0, 3.1, 0.5, 3.4, 0.8, C.snow);
        s.paint(C.log).box(4.4, 1.2, 0, 1.3, 1.7, 1.6, 0.7, C.snow);
        s.paint(C.glass).fx(0, 255).box(4.4, 1.7, 1.62, 0.7, 0.4, 0.03, 1).fx(0);
    });
    // A chair: hung by its top at (0, 0, 0), facing +z, two abreast. All tube and slats: it should read as a line drawing against the sky.
    const chair = () => prop('chair', s => {
        s.paint(C.steel).fx(0).prism(5, 0, -1.85, 0, 0.03, 0, 0.03).box(0, -0.06, 0, 0.06, 0.07, 0.18, 1);
        s.box(0, -1.85, 0, 0.92, 0.025, 0.025, 1);
        for (const sg of [-1, 1]) s.prism(4, sg * 0.92, -2.72, 0.02, 0.022, -1.85, 0.022).box(sg * 0.92, -2.72, 0.2, 0.02, 0.02, 0.24, 1);
        for (const z of [0.0, 0.14, 0.28, 0.4]) s.paint([70, 110, 160]).box(0, -2.72, z, 0.92, 0.014, 0.05, 0.85);
        for (const y of [-2.5, -2.3, -2.1]) s.box(0, y, -0.05, 0.92, 0.05, 0.012, 0.85);
        s.paint(C.steel).box(0, -3.22, 0.5, 0.86, 0.016, 0.016, 1);
        for (const sg of [-1, 1]) s.box(sg * 0.86, -2.98, 0.46, 0.016, 0.25, 0.016, 1);
    });
    const pole = right => prop('pole:' + right, s => {
        s.paint(right ? C.orange : [230, 60, 120]).fx(8).prism(5, 0, -0.3, 0, 0.022, 1.7, 0.018);
        s.paint(right ? C.black : C.orange).prism(5, 0, 1.25, 0, 0.03, 1.5, 0.03);
    });
    const flag = hue => prop('flag:' + hue, s => {
        s.paint([110, 90, 60]).fx(10).prism(4, 0, -0.3, 0, 0.02, 2.3, 0.014);
        s.paint([C.red, C.blue, C.yellow][hue]).fx(10, 0, 220).tri([0, 2.25, 0], [0, 1.65, 0], [0.75, 1.95, 0.1], [0, 0, 1]);
    });
    const mast = () => prop('mast', s => {
        s.paint(C.steel).fx(0).prism(6, 0, -0.5, 0, 0.13, 8.5, 0.08, { foot: 0.6 });
        s.box(0, 8.5, 0.35, 0.5, 0.08, 0.45, 1, C.snow);
        s.paint(C.lamp).fx(0, 255).box(0, 8.38, 0.4, 0.42, 0.04, 0.34, 1).fx(0);
    });
    // A rail (or a box) of length 1 along z, lying from (0, 0, 0) to (0, rise, 1) once stretched.
    const rail = box => prop('rail:' + box, s => {
        if (box) s.paint(C.blue).fx(0).box(0, -0.2, 0.5, 0.32, 0.2, 0.5, 0.7, [226, 232, 240]);
        else {
            // Round, lying along z: an upright post turned on to its side.
            s.paint(C.yellow).fx(0).at([1, 0, 0, 0, 0, 0, 1, -0.05, 0, 1, 0, 0]).prism(6, 0, 0, 0, 0.05, 1, 0.05, { foot: 1 }).at(null);
            for (const z of [0.1, 0.5, 0.9]) s.paint(C.dark).box(0, -0.35, z, 0.03, 0.28, 0.006, 0.7);
        }
    });
    const arch = half => prop('arch:' + Math.round(half), s => {
        for (const sg of [-1, 1]) s.paint(C.red).fx(0).prism(8, sg * half, -0.5, 0, 0.32, 5.2, 0.28, { foot: 0.7 });
        s.paint(C.red).box(0, 5.5, 0, half + 0.3, 0.55, 0.3, 0.9, C.snow);
        for (let i = -3; i <= 3; i++) s.paint(i & 1 ? C.white : C.yellow).box(i * half * 0.27, 5.5, 0.31, half * 0.1, 0.34, 0.01, 1);
    });
    // A signpost: a board the colour of the run's grade (blue, red, black), and an arrow down the hill.
    const sign = grade => prop('sign:' + grade, s => {
        s.paint([110, 90, 60]).fx(0).prism(5, 0, -0.4, 0, 0.05, 2.5, 0.045);
        s.paint([236, 232, 220]).box(0, 2.05, 0.05, 0.62, 0.36, 0.03, 0.9, C.snow);
        const col = [C.blue, C.red, C.black][grade];
        if (grade === 2) s.paint(col).quad([-0.36, 2.05, 0.09], [-0.2, 1.87, 0.09], [-0.04, 2.05, 0.09], [-0.2, 2.23, 0.09], [0, 0, 1]);
        else s.paint(col).box(-0.2, 2.05, 0.085, 0.15, 0.15, 0.005, 1);
        s.paint(C.dark).box(0.24, 2.12, 0.085, 0.24, 0.035, 0.005, 1).box(0.2, 1.96, 0.085, 0.2, 0.03, 0.005, 1);
    });
    // The marks at a kicker's lip.
    const marker = () => prop('marker', s => {
        // A bamboo wand with a pennant, and a dab of blue dye on the snow at its foot.
        s.paint([190, 160, 96]).fx(12).prism(5, 0, -0.3, 0, 0.018, 1.5, 0.012);
        s.paint(C.blue).fx(12, 0, 200).tri([0, 1.48, 0], [0, 1.12, 0], [0.5, 1.3, 0.06], [0, 0, 1]);
        s.fx(0).prism(8, 0, 0.02, 0, 0.22, 0.05, 0.16, { cap: true, foot: 1 });
    });
    // A piste groomer: tracks, a cab, a blade in front and a tiller behind. Faces +z.
    const groomer = () => prop('groomer', s => {
        for (const sg of [-1, 1]) s.paint(C.dark).fx(0).box(sg * 1.5, 0.45, 0, 0.55, 0.45, 2.6, 0.6);
        s.paint(C.red).box(0, 1.25, -0.4, 1.9, 0.5, 2.3, 0.8, C.snow);
        s.paint(C.red).box(0, 2.3, 0.6, 1.25, 0.7, 1.0, 0.9, C.snow);
        s.paint(C.glass).fx(0, 120).box(0, 2.4, 1.61, 1.1, 0.48, 0.02, 1).fx(0);
        for (const sg of [-1, 1]) s.paint(C.glass).box(sg * 1.26, 2.4, 0.6, 0.02, 0.48, 0.8, 1);
        s.paint(C.steel).box(0, 0.6, 3.3, 2.5, 0.55, 0.12, 0.7).box(0, 0.7, 2.9, 0.2, 0.1, 0.4, 1);
        s.paint(C.dark).box(0, 0.35, -3.3, 2.6, 0.3, 0.5, 0.7);
        for (const sg of [-1, 1]) s.paint(C.lamp).fx(0, 255).box(sg * 0.9, 3.08, 1.5, 0.16, 0.08, 0.06, 1).fx(0);
        s.paint(C.orange).fx(0, 255).box(0, 3.14, 0.3, 0.09, 0.1, 0.09, 1).fx(0);
    });
    // A hare or a fox, in its own metres, facing +z; bounding by its gait.
    function creature(out, st, kind, x, y, z, yaw, gait) {
        const fox = kind === 'fox', len = fox ? 0.66 : 0.34, tall = fox ? 0.36 : 0.2, coat = fox ? [222, 120, 50] : [206, 198, 188];
        const body = prop('beast:' + kind, s => {
            s.paint(coat).fx(0).blob(0, 0, 0, len * 0.2, len * 0.2, len * 0.5, { segs: 6, bands: 4, lump: 0.04, under: 0.6 });
            s.blob(0, len * 0.18, len * 0.5, len * 0.16, len * 0.15, len * 0.22, { segs: 6, bands: 3, lump: 0 });
            for (const sg of [-1, 1]) s.tri([sg * len * 0.05, len * 0.3, len * 0.48], [sg * len * 0.14, len * 0.3, len * 0.44], [sg * len * 0.1, len * (fox ? 0.48 : 0.7), len * 0.42], [0, 0.3, 0.95]);
            if (fox) s.prism(5, 0, 0, -len * 0.45, len * 0.1, 0.02, len * 0.14, { dz: -len * 0.4, cap: true }).paint(C.white).prism(5, 0, 0.02, -len * 0.85, len * 0.14, 0.04, 0, { dz: -len * 0.2 });
            else s.paint(C.white).blob(0, len * 0.08, -len * 0.5, len * 0.1, len * 0.1, len * 0.1, { segs: 5, bands: 2, lump: 0 });
        });
        const leg = prop('beastleg:' + kind, s => s.paint(fox ? [60, 44, 40] : coat).fx(0).prism(4, 0, -tall * 0.75, 0, len * 0.035, 0, len * 0.06));
        const a = gait * TAU, hop = Math.abs(Math.sin(a)) * tall * 0.9;
        st.reset(x, y + tall * 0.8 + hop, z, yaw, 1).rx(-0.3 * Math.cos(a));
        out.stamp(body, st.top);
        for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
            st.push().move(sx * len * 0.12, -len * 0.08, sz * len * 0.3).rx((sz > 0 ? -1 : 1) * 0.9 * Math.sin(a));
            out.stamp(leg, st.top);
            st.pop();
        }
    }
    // An eagle, wings out; flap is how far they are raised.
    function eagle(out, st, x, y, z, yaw, roll, flap) {
        const body = prop('eagle', s => {
            s.paint([70, 52, 40]).fx(0).blob(0, 0, 0, 0.16, 0.14, 0.42, { segs: 6, bands: 3, lump: 0, under: 0.7 });
            s.paint(C.white).blob(0, 0.04, 0.42, 0.09, 0.09, 0.11, { segs: 5, bands: 3, lump: 0 });
            s.paint(C.yellow).prism(4, 0, 0.03, 0.5, 0.03, 0.031, 0, { dz: 0.1 });
            s.paint(C.white).tri([-0.16, 0, -0.38], [0.16, 0, -0.38], [0, 0, -0.75], [0, 1, 0]);
        });
        const wing = prop('eaglewing', s => s.paint([60, 46, 36]).fx(0).tri([0, 0, 0.2], [1.05, 0, 0.12], [0.6, 0, -0.28], [0, 1, 0]).tri([0, 0, 0.2], [0.6, 0, -0.28], [0, 0, -0.24], [0, 1, 0]).tri([1.05, 0, 0.12], [1.2, 0.02, -0.1], [0.6, 0, -0.28], [0, 1, 0]));
        st.reset(x, y, z, yaw, 1.15).rz(roll);
        out.stamp(body, st.top);
        for (const side of [-1, 1]) {
            st.push().move(side * 0.1, 0.05, 0).size(side, 1, 1).rz(flap);
            out.stamp(wing, st.top);
            st.pop();
        }
    }

    // ---- The ground ---------------------------------------------------------------
    // Where the mesh's columns stand across the run, metres from its centre:
    // close together on the piste, further and further apart up the valley sides.
    const COLS = (() => {
        const half = [];
        for (let u = 1; u <= 12; u += 1) half.push(u);
        for (let u = 13.5; u <= 42; u += 1.5) half.push(u);
        let u = 42, step = 2;
        while (u < 700) { u += step; step *= 1.2; half.push(u); }
        return [...half.map(v => -v).reverse(), 0, ...half];
    })();
    const ROWS = [32, 16, 8, 4];       // rows of triangles to a chunk, by level of detail
    // Coarser grids for the lighter tiers: every column still one of the finest's, so the land is the same land.
    const thin = (near, mid, far) => COLS.filter((u, i) => { const a = Math.abs(u), n = Math.abs(i - (COLS.length - 1) / 2); return u === 0 || i === 0 || i === COLS.length - 1 || (a <= 12 ? n % near === 0 : a <= 42 ? (n - 12) % mid === 0 : (n - 32) % far === 0); });
    const GRIDS = [COLS, thin(1, 2, 2), thin(2, 3, 2)], ROWSETS = [ROWS, ROWS, [16, 8, 4, 4]];
    const GROUND_BYTES = 28;

    // Chunk k of the course as a grid, sampled from C.height: positions from
    // the chunk's own corner (centre, elevation and z at its start).
    function ground(course, k, lod, level = 0) {
        const COLS = GRIDS[level], rows = ROWSETS[level][lod], cols = COLS.length, z0 = k * L.CHUNK, ox = course.centre(z0), oy = course.elev(z0), step = L.CHUNK / rows;
        const buf = new ArrayBuffer(cols * (rows + 1) * GROUND_BYTES), F = new Float32Array(buf), B = new Uint8Array(buf);
        const heights = new Float64Array(cols * (rows + 3));
        const centres = [];
        for (let j = -1; j <= rows + 1; j++) {
            const z = z0 + j * step, c = course.centre(z);
            centres.push(c);
            for (let i = 0; i < cols; i++) heights[(j + 1) * cols + i] = course.height(c + COLS[i], z);
        }
        let low = Infinity, high = -Infinity;
        for (let j = 0; j <= rows; j++) {
            const z = z0 + j * step, s = course.find(z), d = z - s.z0, t = d / s.len, w = course.widthIn(s, d), c = centres[j + 1], f = d >= s.B ? 1 : d <= 0 ? 0 : (q => q * q * (3 - 2 * q))(d / s.B);
            const prev = course.find(s.z0 - 1), groom = mix(prev.T.groom, s.T.groom, f), trees = mix(prev.T.trees, s.T.trees, f), lake = s.type === 'lake' ? L.win(t) : 0;
            for (let i = 0; i < cols; i++) {
                const at = (j + 1) * cols + i, v = j * cols + i, o = v * 7, b = v * GROUND_BYTES, u = COLS[i], a = Math.abs(u), h = heights[at];
                // The slope here, from the heights around it.
                const il = Math.max(0, i - 1), ir = Math.min(cols - 1, i + 1);
                const gx = (heights[(j + 1) * cols + ir] - heights[(j + 1) * cols + il]) / (COLS[ir] - COLS[il]);
                const dc = (centres[j + 2] - centres[j]) / (2 * step);
                const gz = (heights[at + cols] - heights[at - cols]) / (2 * step) - gx * dc;
                const l = Math.hypot(gx, 1, gz);
                F[o] = c + u - ox; F[o + 1] = h - oy; F[o + 2] = z - z0; F[o + 3] = u; F[o + 4] = z - z0;
                B[b + 20] = -gx / l * 127; B[b + 21] = 127 / l; B[b + 22] = -gz / l * 127; B[b + 23] = 0;
                const on = 1 - smooth(w - 2.5, w + 0.5, a), built = s.type === 'pipe' ? 1 - smooth(s.W + 6, s.W + 18, a) : on;
                // What it is: groomed snow, lake ice, how steep (the shader makes rock of that), how wooded.
                B[b + 24] = 255 * groom * (s.type === 'pipe' ? built : on);
                B[b + 25] = 255 * lake * (1 - smooth(w - 12, w - 2, a));
                B[b + 26] = clamp(Math.hypot(gx, gz + mix(prev.g, s.g, f)) * 127, 0, 255) * (1 - Math.max(groom * on, built && s.type === 'pipe' ? 1 : 0)) * (1 - 0.999 * Math.min(1, s.kickers.length) * on);
                B[b + 27] = 255 * clamp(trees * (a < w + 70 ? 0.85 : a < w + 190 ? 0.6 : 0.3) * smooth(w + 2, w + 14, a) * smooth(0.3, 0.55, course.na(c + u, z, 170)) * 1.25, 0, 1);
                if (h < low) low = h;
                if (h > high) high = h;
            }
        }
        return { k, lod, level, rows, cols, x: ox, y: oy, z: z0, low, high, buf, count: cols * (rows + 1) };
    }

    // The triangles of a chunk's grid, the same for every chunk of a level.
    function gridIndices(lod, level = 0) {
        const rows = ROWSETS[level][lod], cols = GRIDS[level].length, out = new Uint16Array((cols - 1) * rows * 6);
        let o = 0;
        for (let j = 0; j < rows; j++) {
            for (let i = 0; i < cols - 1; i++) {
                const v = j * cols + i;
                out[o++] = v; out[o++] = v + cols; out[o++] = v + 1; out[o++] = v + 1; out[o++] = v + cols; out[o++] = v + cols + 1;
            }
        }
        return out;
    }

    // What stands still in chunk k: markers, masts, rails, the hut, lift
    // towers. Positions from the chunk's own corner. Returns the soup and the lamps in it.
    function props(course, k, soup = new SkiSoup(512)) {
        const z0 = k * L.CHUNK, z1 = z0 + L.CHUNK, ox = course.centre(z0), oy = course.elev(z0), lamps = [];
        const put = (m, x, z, yaw = 0, size = 1, lift = 0) => soup.stamp(m, place(x - ox, course.height(x, z) + lift - oy, z - z0, yaw, size));
        soup.clear();
        for (let n = Math.ceil(z0 / 16); n * 16 < z1; n++) {
            const z = n * 16, s = course.find(z), d = z - s.z0, t = d / s.len, w = course.widthIn(s, d), c = course.centre(z), yaw = Math.atan(course.slope(z));
            if (s.type === 'pipe' && t > 0.1 && t < 0.9) { for (const sg of [-1, 1]) put(flag((n + (sg > 0 ? 1 : 0)) % 3), c + sg * (w + 2.5), z, yaw + 1.57); continue; }
            if (!s.T.groom && s.type !== 'lake') continue;
            const cut = course.cutU(s, d, w);
            for (const sg of [-1, 1]) {
                if (cut !== null && cut * sg > 0 && Math.abs(Math.abs(cut) - w) < 4) continue;
                if (s.type === 'cattrack' && sg === s.side) continue;
                put(pole(sg > 0), c + sg * (w + 0.7), z, yaw);
            }
        }
        for (const m of course.masts(z0, z1)) {
            soup.stamp(mast(), place(m.x - ox, m.y - oy, m.z - z0, m.side > 0 ? -1.57 : 1.57));
            lamps.push({ x: m.x - m.side * 0.4, y: m.y + 8.3, z: m.z });
        }
        const seen = new Set();
        for (const z of [z0, z1 - 0.01]) {
            const s = course.find(z);
            if (seen.has(s.i)) continue;
            seen.add(s.i);
            for (const kk of s.kickers) {
                if (kk.natural || kk.lip || kk.z < z0 || kk.z >= z1) continue;
                for (const sg of [-1, 1]) put(marker(), course.centre(kk.z) + kk.u + sg * (kk.half + 0.5), kk.z - 0.3, Math.atan(course.slope(kk.z)) + 1.57);
            }
            for (const r of s.rails) {
                if (r.z < z0 || r.z >= z1) continue;
                const e = L.railEnds(course, r), yaw = Math.atan2(e.x1 - e.x0, r.len), cy = Math.cos(yaw), sy = Math.sin(yaw), run = Math.hypot(e.x1 - e.x0, r.len), rise = e.y1 - e.y0;
                // Stretched from end to end: x and z along the rail, y sheared with its fall.
                soup.stamp(rail(r.box ? 1 : 0), [cy, 0, sy * run, e.x0 - ox, 0, 1, rise, e.y0 - oy, -sy, 0, cy * run, r.z - z0]);
            }
            const gate = s.z0 + 0.06 * s.len;
            if (s.type === 'park' && gate >= z0 && gate < z1) { const w = course.width(gate); soup.stamp(arch(w + 1), place(course.centre(gate) - ox, course.elev(gate) - oy - 0.3, gate - z0, Math.atan(course.slope(gate)))); }
            const post = s.z0 + 14;
            if (post >= z0 && post < z1 && s.type !== 'cattrack' && s.type !== 'pipe') { const w = course.width(post), x = course.centre(post) + s.side * (w + 2.2); put(sign(s.g < 0.2 ? 0 : s.g < 0.3 ? 1 : 2), x, post, Math.PI + (s.side > 0 ? 0.5 : -0.5)); }
            if (s.type === 'hut' && s.zs + 8 >= z0 && s.zs + 8 < z1) {
                const z = s.zs + 8, w = course.width(z), x = course.centre(z) + s.side * (w + 11), y = course.height(x, z);
                soup.stamp(hut(), place(x - ox, y - oy, z - z0, s.side > 0 ? -1.57 : 1.57));
                soup.stamp(groomer(), place(x - ox + s.side * 1.5, course.height(x + s.side * 1.5, z - 14) - oy, z - 14 - z0, 0.2 * s.side));
                lamps.push({ x: x - s.side * 6, y: y + 3.2, z, warm: true, side: s.side, hx: x, hy: y, hz: z });
            }
            if (s.type === 'lodge' && s.zs >= z0 && s.zs < z1) { const l = course.lodge(s); soup.stamp(lodge(), place(l.x - ox, l.y - oy, l.z - z0, l.yaw)); }
        }
        for (const lift of course.lifts) {
            if (lift.zb < z0 || lift.za > z1) continue;
            const yaw = Math.atan2(lift.xb - lift.xa, lift.zb - lift.za);
            lift.towers.forEach((tw, i) => {
                if (tw.z < z0 || tw.z >= z1) return;
                const end = i === 0 || i === lift.towers.length - 1;
                soup.stamp(end ? station() : tower(tw.top), place(tw.x - ox, tw.y - oy, tw.z - z0, yaw));
            });
        }
        return { soup, lamps };
    }

    return { C, COLS, ROWS, GRIDS, ROWSETS, GROUND_BYTES, KITS, KIT_ORDER, place, move, model, tree, figure, BONES, tipped, gear, look, anyone, hut, lodge, tower, station, chair, pole, flag, mast, rail, arch, sign, groomer, creature, eagle, ground, gridIndices, props };
})();
