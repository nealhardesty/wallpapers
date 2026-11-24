// Wayfarer's shapes (SPEC §10.38): every tree, house, tower, cart and
// creature, modelled here in code as triangles with painted colours. No
// asset files. Pure typed-array work, so the unit tests can build a square
// of the world without a browser.
//
// A vertex is 24 bytes: position (3 floats), normal and occlusion (4 signed
// bytes), colour (4 bytes), and four bytes of "extra" that the shaders read
// (props: sway, glow, flutter, phase; ground: road edge, cobbles, furrows,
// snow). WaySoup is a growing list of them; a model is a soup in its own
// metres, stamped into a square's soup with a turn, a size and its colours.

class WaySoup {
    constructor(cap = 384) {
        this.cap = cap;
        this.n = 0;
        this.buf = new ArrayBuffer(cap * 24);
        this.F = new Float32Array(this.buf);
        this.B = new Uint8Array(this.buf);
        this.slots = new Uint8Array(cap);
        this.col = [255, 255, 255];
        this.slot = 0;
        this.e = [0, 0, 0, 0];
        this.m = null;
        this.dye = null;
        this.shine = 0;
        this.coursed = false;
    }
    // Coursed: the shaders lay what follows in blocks of stone (flags where it lies flat, tiles on a roof's slope).
    // It rides in the sign of the occlusion.
    course(on = true) { this.coursed = !!on; return this; }
    // How much the next shapes catch the light: 0 cloth and stone, 1 polished metal. (It rides in the colour's fourth byte.)
    gloss(shine = 0) { this.shine = shine; return this; }
    // Painted detail: a function of where a vertex is (in its shape's own metres) giving its colour, or nothing to leave it.
    // Stripes, patches, socks and bibs are all this. null switches it off.
    mark(dye) { this.dye = dye; return this; }

    // Shapes added from here on go through this 3×4 matrix (null: none).
    at(m) { this.m = m; return this; }

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
    // What the next shapes are painted with: a colour, which of the stamp's tints recolours it, and the shader's extras.
    paint(col, slot = 0) { this.col = col; this.slot = slot; this.shine = col.shine || 0; return this; }
    fx(sway = 0, glow = 0, flutter = 0) { this.e = [sway, glow, flutter, 0]; return this; }

    v(x, y, z, nx, ny, nz, ao = 1, k = 1) {
        this.need(1);
        const o = this.n * 6, b = this.n * 24, F = this.F, B = this.B, e = this.e, m = this.m;
        let c = this.col;
        if (this.dye) c = this.dye(x, y, z) || c;
        if (m) {
            const px = x, py = y, pz = z, qx = nx, qy = ny, qz = nz;
            x = m[0] * px + m[1] * py + m[2] * pz + m[3]; y = m[4] * px + m[5] * py + m[6] * pz + m[7]; z = m[8] * px + m[9] * py + m[10] * pz + m[11];
            nx = m[0] * qx + m[1] * qy + m[2] * qz; ny = m[4] * qx + m[5] * qy + m[6] * qz; nz = m[8] * qx + m[9] * qy + m[10] * qz;
        }
        F[o] = x; F[o + 1] = y; F[o + 2] = z;
        B[b + 12] = nx * 127; B[b + 13] = ny * 127; B[b + 14] = nz * 127; B[b + 15] = this.coursed ? -Math.max(ao, 0.04) * 127 : ao * 127;
        B[b + 16] = Math.min(255, c[0] * k); B[b + 17] = Math.min(255, c[1] * k); B[b + 18] = Math.min(255, c[2] * k); B[b + 19] = 255 - 255 * this.shine;
        B[b + 20] = e[0]; B[b + 21] = e[1]; B[b + 22] = e[2]; B[b + 23] = e[3];
        this.slots[this.n++] = this.slot;
    }

    // Flat faces. Points are [x, y, z]; counter-clockwise seen from outside, or give the normal.
    tri(a, b, c, n = null, ao = [1, 1, 1]) {
        if (!n) {
            const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
            n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
            const l = (Math.hypot(n[0], n[1], n[2]) || 1) * (n[1] < -0.01 ? -1 : 1);     // whichever way it was wound, it faces up
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
    // A box about (cx, cy, cz) with half-sizes; `foot` darkens its lower edge.
    box(cx, cy, cz, hx, hy, hz, foot = 0.8, top = null) {
        const x0 = cx - hx, x1 = cx + hx, y0 = cy - hy, y1 = cy + hy, z0 = cz - hz, z1 = cz + hz, f = [foot, foot, 1, 1];
        this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], f);
        this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], f);
        this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], f);
        this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], f);
        const keep = this.col, slot = this.slot;
        if (top) this.paint(top[0], top[1]);
        this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]);
        this.paint(keep, slot);
        return this;
    }
    // A many-sided post or cone from radius r0 at y0 to r1 at y1 (r1 = 0 is a
    // point). Smooth round its sides; (dx, dz) leans its top.
    prism(sides, cx, y0, cz, r0, y1, r1, o = {}) {
        const dx = o.dx || 0, dz = o.dz || 0, foot = o.foot ?? 0.7, sy = (r0 - r1) / (y1 - y0), turn = o.turn || 0, sq = o.squash || 1;
        const ring = (i, r, y, ox, oz) => { const a = turn + i / sides * 6.2831853; return [cx + ox + Math.sin(a) * r, y, cz + oz + Math.cos(a) * r * sq]; };
        const nrm = i => { const a = turn + i / sides * 6.2831853, l = Math.hypot(1, sy); return [Math.sin(a) / l, sy / l, Math.cos(a) / l]; };
        for (let i = 0; i < sides; i++) {
            const a = ring(i, r0, y0, 0, 0), b = ring(i + 1, r0, y0, 0, 0), c = ring(i + 1, r1, y1, dx, dz), d = ring(i, r1, y1, dx, dz);
            const n0 = o.flat ? nrm(i + 0.5) : nrm(i), n1 = o.flat ? n0 : nrm(i + 1);
            this.v(a[0], a[1], a[2], n0[0], n0[1], n0[2], foot); this.v(b[0], b[1], b[2], n1[0], n1[1], n1[2], foot); this.v(c[0], c[1], c[2], n1[0], n1[1], n1[2], 1);
            if (r1 > 0) { this.v(a[0], a[1], a[2], n0[0], n0[1], n0[2], foot); this.v(c[0], c[1], c[2], n1[0], n1[1], n1[2], 1); this.v(d[0], d[1], d[2], n0[0], n0[1], n0[2], 1); }
            if (o.cap && r1 > 0) this.tri(d, c, [cx + dx, y1, cz + dz], [0, 1, 0]);
        }
        return this;
    }
    // A round limb, trunk, tail or body along a path of rings, each [x, y, z, radius, squash]: smooth all round,
    // swelling and narrowing as the radii say. Rings stand square to the path; squash flattens them (front to back
    // on an upright tube, top to bottom on one lying along z). o: { cap: 1 the start, 2 the end, 3 both;
    // k(ring, side): a shade for painted folds; rag(ring, side): a ragged edge; ao(ring); turn; ref: the rings' "up" }.
    tube(path, sides = 8, o = {}) {
        const n = path.length, last = path[n - 1], first = path[0], TAU = 6.2831853;
        const ref = o.ref || (Math.abs(last[2] - first[2]) > 1.2 * Math.hypot(last[0] - first[0], last[1] - first[1]) ? [0, 1, 0] : [0, 0, 1]);
        const rings = [];
        for (let i = 0; i < n; i++) {
            const p = path[i], a = path[Math.max(i - 1, 0)], b = path[Math.min(i + 1, n - 1)];
            let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2];
            const tl = Math.hypot(tx, ty, tz) || 1;
            tx /= tl; ty /= tl; tz /= tl;
            let ux = ty * ref[2] - tz * ref[1], uy = tz * ref[0] - tx * ref[2], uz = tx * ref[1] - ty * ref[0];
            const ul = Math.hypot(ux, uy, uz) || 1;
            ux /= ul; uy /= ul; uz /= ul;
            const vx = uy * tz - uz * ty, vy = uz * tx - ux * tz, vz = ux * ty - uy * tx, sq = p[4] ?? 1, slope = (b[3] - a[3]) / tl, ring = [];
            for (let k = 0; k <= sides; k++) {
                const ang = (o.turn || 0) + k / sides * TAU, c = Math.cos(ang), s = Math.sin(ang), r = p[3] * (o.rag ? o.rag(i, k % sides) : 1);
                let nx = ux * c * sq + vx * s - tx * slope, ny = uy * c * sq + vy * s - ty * slope, nz = uz * c * sq + vz * s - tz * slope;
                const nl = Math.hypot(nx, ny, nz) || 1;
                ring.push([p[0] + (ux * c + vx * s * sq) * r, p[1] + (uy * c + vy * s * sq) * r, p[2] + (uz * c + vz * s * sq) * r, nx / nl, ny / nl, nz / nl, o.k ? o.k(i, k % sides) : 1]);
            }
            ring.t = [tx, ty, tz];
            ring.ao = o.ao ? o.ao(i) : 1;
            rings.push(ring);
        }
        const put = (q, ao) => this.v(q[0], q[1], q[2], q[3], q[4], q[5], ao, q[6]);
        for (let i = 0; i < n - 1; i++) {
            const A = rings[i], B = rings[i + 1];
            for (let k = 0; k < sides; k++) {
                if (path[i][3] > 0) { put(A[k], A.ao); put(A[k + 1], A.ao); put(B[k + 1], B.ao); }
                if (path[i + 1][3] > 0) { put(A[k], A.ao); put(B[k + 1], B.ao); put(B[k], B.ao); }
            }
        }
        for (const [bit, i, sign] of [[1, 0, -1], [2, n - 1, 1]]) {
            if (!((o.cap || 0) & bit) || !(path[i][3] > 0)) continue;
            const R = rings[i], t = R.t, p = path[i];
            for (let k = 0; k < sides; k++) { this.v(R[k][0], R[k][1], R[k][2], t[0] * sign, t[1] * sign, t[2] * sign, R.ao, R[k][6]); this.v(R[k + 1][0], R[k + 1][1], R[k + 1][2], t[0] * sign, t[1] * sign, t[2] * sign, R.ao, R[k + 1][6]); this.v(p[0], p[1], p[2], t[0] * sign, t[1] * sign, t[2] * sign, R.ao, 1); }
        }
        return this;
    }
    // A lumpy ball: treetops, bushes, heads, bodies. Lit from above by its
    // own colour (top to bottom), smooth all round.
    blob(cx, cy, cz, rx, ry, rz, o = {}) {
        const segs = o.segs || 6, bands = o.bands || 3, lump = o.lump ?? 0.16, seed = o.seed || 0, under = o.under ?? 0.62, turn = seed * 9;
        const h = (i, j) => { const s = Math.sin((i % segs) * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453; return s - Math.floor(s); };
        const put = (i, j) => {
            const lat = j / bands * Math.PI, a = turn + i / segs * 6.2831853, pole = j === 0 || j === bands;
            const k = 1 + (pole ? 0 : (h(i, j) - 0.5) * 2 * lump), x = cx + Math.sin(lat) * Math.sin(a) * rx * k, y = cy + Math.cos(lat) * ry * k, z = cz + Math.sin(lat) * Math.cos(a) * rz * k;
            let nx = Math.sin(lat) * Math.sin(a), ny = Math.cos(lat), nz = Math.sin(lat) * Math.cos(a), t = ny * 0.5 + 0.5, hollow = 1;
            if (o.crown) {
                // Part of a crown: lit as the whole tree is (its normal bent toward the crown's own), and darker deep inside it.
                const [qx, qy, qz, kk, R] = o.crown, dx = x - qx, dy = (y - qy) * 1.2, dz = z - qz, d = Math.hypot(dx, dy, dz) || 1;
                nx = nx * (1 - kk) + dx / d * kk; ny = ny * (1 - kk) + dy / d * kk; nz = nz * (1 - kk) + dz / d * kk;
                const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l; t = ny * 0.5 + 0.5;
                hollow = 0.55 + 0.45 * Math.min(1, d / R);
            }
            const keep = this.col;
            this.col = [keep[0] * (0.7 + 0.3 * t), keep[1] * (0.72 + 0.28 * t), keep[2] * (0.78 + 0.22 * t)];      // cooler and darker underneath
            this.v(x, y, z, nx, ny, nz, (under + (1 - under) * t) * hollow);
            this.col = keep;
        };
        for (let j = 0; j < bands; j++) {
            for (let i = 0; i < segs; i++) {
                if (j < bands - 1) { put(i, j); put(i, j + 1); put(i + 1, j + 1); }
                if (j > 0) { put(i, j); put(i + 1, j + 1); put(i + 1, j); }
            }
        }
        return this;
    }
    // Leaves on a clump of leaf (the eighth pass), so its edge against the sky is leaves and not a ball: n leaf-shaped
    // cards (a pointed oval in two triangles) spread over the clump's skin and a little out from it, each turned its own
    // way and tilted out so that some stand edge-on and some flat, in tones a little apart; lit as the crown is
    // (o.crown, as blob's) and fluttering in the shaders. size is a leaf's length; o.thin narrows it (needles); o.droop
    // hangs it down (a willow's, a fir's); o.up keeps them off the clump's underside.
    leaves(cx, cy, cz, rx, ry, rz, n, size, o = {}) {
        const seed = o.seed || 0, thin = o.thin || 0.55, droop = o.droop || 0, up = o.up ?? -0.55, keep = this.col, e = this.e;
        const h = k => { const s = Math.sin(k * 91.7 + seed * 47.3) * 43758.5453; return s - Math.floor(s); };
        this.e = [e[0], e[1], Math.max(e[2], 60), e[3]];
        const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], unit = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
        for (let i = 0; i < n; i++) {
            // A point on the skin by a golden spiral (so they spread evenly, none on the underside below `up`), jittered out.
            const ny0 = Math.max(up, 1 - 2 * (i + 0.5) / n), rr = Math.sqrt(Math.max(0, 1 - ny0 * ny0)), a = i * 2.39996 + seed * 7;
            const sn = [Math.sin(a) * rr, ny0, Math.cos(a) * rr], out = 0.97 + 0.2 * h(i * 3 + 1), p = [cx + sn[0] * rx * out, cy + sn[1] * ry * out, cz + sn[2] * rz * out];
            let nrm = sn;
            if (o.crown) { const [qx, qy, qz, kk] = o.crown, d = unit([p[0] - qx, (p[1] - qy) * 1.2, p[2] - qz]); nrm = [sn[0] * (1 - kk) + d[0] * kk, sn[1] * (1 - kk) + d[1] * kk, sn[2] * (1 - kk) + d[2] * kk]; }
            nrm = unit(nrm);
            // Its length lies along the skin, turned at random about the outward normal, then tipped out (and hung down).
            const t1 = unit(cross(Math.abs(sn[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0], sn)), t2 = cross(sn, t1), spin = h(i * 3 + 2) * 6.2832, c = Math.cos(spin), s = Math.sin(spin), tilt = 0.12 + 0.45 * h(i * 3 + 3);
            const u = unit([t1[0] * c + t2[0] * s + sn[0] * tilt, t1[1] * c + t2[1] * s + sn[1] * tilt - droop, t1[2] * c + t2[2] * s + sn[2] * tilt]), w = unit(cross(u, sn));
            const L = size * (0.75 + 0.5 * h(i * 3 + 4)), W = L * thin * 0.5, tone = 0.76 + 0.26 * h(i * 3 + 5) + 0.06 * ny0, ao = 0.62 + 0.38 * (ny0 * 0.5 + 0.5);
            const b0 = [p[0] - u[0] * L * 0.4, p[1] - u[1] * L * 0.4, p[2] - u[2] * L * 0.4], t0 = [p[0] + u[0] * L * 0.6, p[1] + u[1] * L * 0.6, p[2] + u[2] * L * 0.6];
            const s1 = [p[0] + w[0] * W, p[1] + w[1] * W, p[2] + w[2] * W], s2 = [p[0] - w[0] * W, p[1] - w[1] * W, p[2] - w[2] * W];
            this.col = [Math.min(255, keep[0] * tone), Math.min(255, keep[1] * tone), Math.min(255, keep[2] * tone)];
            this.v(...b0, ...nrm, ao); this.v(...s1, ...nrm, ao); this.v(...t0, ...nrm, ao);
            this.v(...b0, ...nrm, ao); this.v(...t0, ...nrm, ao); this.v(...s2, ...nrm, ao);
        }
        this.col = keep; this.e = e;
        return this;
    }

    // Copy a model in: m is a 3×4 matrix (rows), tints recolour its slots,
    // snow whitens what faces up, phase desynchronises its sway.
    stamp(t, m, tints = null, snow = 0, phase = 0, lit = 1) {
        this.need(t.n);
        const F = this.F, B = this.B, tf = t.F, tb = t.B, ts = t.slots;
        let o = this.n * 6, ob = this.n * 24;
        for (let i = 0, k = 0, kb = 0; i < t.n; i++, k += 6, kb += 24, o += 6, ob += 24) {
            const x = tf[k], y = tf[k + 1], z = tf[k + 2];
            F[o] = m[0] * x + m[1] * y + m[2] * z + m[3];
            F[o + 1] = m[4] * x + m[5] * y + m[6] * z + m[7];
            F[o + 2] = m[8] * x + m[9] * y + m[10] * z + m[11];
            const nx = tb[kb + 12] << 24 >> 24, ny = tb[kb + 13] << 24 >> 24, nz = tb[kb + 14] << 24 >> 24;
            const wx = m[0] * nx + m[1] * ny + m[2] * nz, wy0 = m[4] * nx + m[5] * ny + m[6] * nz, wz = m[8] * nx + m[9] * ny + m[10] * nz, inv = 127 / (Math.hypot(wx, wy0, wz) || 1), wy = wy0 * inv;
            B[ob + 12] = wx * inv;
            B[ob + 13] = wy;
            B[ob + 14] = wz * inv;
            B[ob + 15] = tb[kb + 15];
            let r = tb[kb + 16], g = tb[kb + 17], b = tb[kb + 18];
            const slot = ts[i], tint = tints && tints[slot];
            if (tint) { r = r * tint[0] / 255; g = g * tint[1] / 255; b = b * tint[2] / 255; }
            if (snow > 0 && slot && wy > 30) { const s = Math.min(1, snow * (wy - 30) / 50); r += (242 - r) * s; g += (246 - g) * s; b += (252 - b) * s; }
            B[ob + 16] = r; B[ob + 17] = g; B[ob + 18] = b; B[ob + 19] = tb[kb + 19];
            B[ob + 20] = tb[kb + 20]; B[ob + 21] = tb[kb + 21] * lit; B[ob + 22] = tb[kb + 22]; B[ob + 23] = phase;
            this.slots[this.n + i] = slot;
        }
        this.n += t.n;
    }
}

const WayModels = (() => {
    const L = WayLogic, TAU = Math.PI * 2;
    // A 3×4 matrix that turns by yaw (about y), sizes by s (sy for the height) and moves to (x, y, z).
    const place = (x, y, z, yaw = 0, s = 1, sy = s) => { const c = Math.cos(yaw) * s, n = Math.sin(yaw) * s; return [c, 0, n, x, 0, sy, 0, y, -n, 0, c, z]; };
    const mul = (a, b) => [
        a[0] * b[0] + a[1] * b[4] + a[2] * b[8], a[0] * b[1] + a[1] * b[5] + a[2] * b[9], a[0] * b[2] + a[1] * b[6] + a[2] * b[10], a[0] * b[3] + a[1] * b[7] + a[2] * b[11] + a[3],
        a[4] * b[0] + a[5] * b[4] + a[6] * b[8], a[4] * b[1] + a[5] * b[5] + a[6] * b[9], a[4] * b[2] + a[5] * b[6] + a[6] * b[10], a[4] * b[3] + a[5] * b[7] + a[6] * b[11] + a[7],
        a[8] * b[0] + a[9] * b[4] + a[10] * b[8], a[8] * b[1] + a[9] * b[5] + a[10] * b[9], a[8] * b[2] + a[9] * b[6] + a[10] * b[10], a[8] * b[3] + a[9] * b[7] + a[10] * b[11] + a[11],
    ];
    const rotX = a => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0]; };
    const rotZ = a => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0]; };
    const rotY = a => place(0, 0, 0, a);
    const move = (x, y, z) => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z];
    const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const rnd = (v, k) => { const s = Math.sin(v * 91.7 + k * 47.3 + 1.3) * 43758.5453; return s - Math.floor(s); };

    // ---- The paintbox (sRGB bytes) -----------------------------------------------------
    const C = {
        white: [255, 255, 255], trunk: [104, 76, 56], bark: [84, 62, 50], birch: [232, 228, 214], stone: [156, 152, 146], darkStone: [112, 110, 116], moss: [110, 136, 84],
        timber: [88, 60, 44], plank: [150, 112, 76], thatch: [198, 166, 98], tile: [190, 88, 58], slate: [98, 108, 128], glass: [64, 84, 112], iron: [58, 58, 66],
        dirt: [178, 142, 98], cobble: [150, 146, 142], sand: [228, 208, 152], rock: [124, 112, 100], cliff: [100, 94, 98], snow: [242, 246, 252],
        rope: [150, 128, 96], flame: [255, 190, 90], gold: [236, 196, 84], water: [70, 130, 160], skin: [232, 184, 150], cloth: [200, 196, 188], straw: [222, 190, 110],
    };
    // Metal and glass catch the light.
    for (const [name, shine] of [['gold', 0.85], ['iron', 0.45], ['glass', 0.7], ['water', 0.6]]) C[name].shine = shine;
    const PLASTER = [[238, 226, 198], [246, 240, 226], [234, 206, 166], [226, 196, 178], [214, 222, 204]];
    const ROOFS = [C.thatch, C.tile, C.slate, [150, 120, 96]];
    const BRIGHT = [[196, 64, 56], [64, 110, 176], [232, 184, 70], [84, 150, 96], [150, 90, 160], [226, 130, 60]];
    const bright = v => BRIGHT[Math.floor(Math.abs(v) * 6) % 6];
    // Leaves by the season: spring, summer, autumn (three of them), winter.
    const LEAF = {
        oak: [[136, 190, 84], [84, 150, 62], [[222, 140, 48], [196, 84, 44], [230, 186, 70]], [150, 150, 132]],
        poplar: [[150, 200, 90], [104, 164, 70], [[236, 200, 76], [226, 170, 60], [214, 190, 80]], [156, 156, 140]],
        fir: [[58, 124, 84], [46, 108, 76], [[50, 106, 74], [56, 110, 70], [48, 100, 78]], [58, 110, 90]],
        birch: [[170, 210, 100], [128, 180, 84], [[240, 208, 80], [232, 190, 64], [226, 200, 96]], [170, 166, 150]],
        willow: [[160, 200, 110], [118, 166, 96], [[206, 190, 96], [190, 176, 88], [214, 196, 100]], [160, 164, 140]],
        apple: [[120, 180, 80], [88, 152, 64], [[200, 160, 60], [180, 130, 50], [210, 170, 70]], [150, 150, 130]],
        pine: [[60, 120, 80], [50, 110, 76], [[52, 108, 74], [50, 104, 72], [56, 110, 78]], [60, 110, 88]],
        glade: [[90, 200, 180], [70, 176, 170], [[190, 120, 210], [150, 110, 220], [110, 160, 220]], [150, 190, 210]],
        shroom: [[214, 70, 70], [206, 66, 80], [[150, 90, 190], [220, 120, 60], [70, 150, 190]], [200, 80, 90]],
        snag: [[120, 104, 90], [120, 104, 90], [[120, 104, 90], [120, 104, 90], [120, 104, 90]], [130, 120, 112]],
    };
    const BLOOM = { apple: [[250, 196, 214], [210, 60, 50], [214, 70, 50], [150, 150, 130]], glade: [[255, 240, 180], [255, 240, 180], [255, 220, 160], [220, 240, 255]], shroom: [[250, 240, 220], [250, 240, 220], [250, 240, 220], [250, 240, 220]] };
    // Grass by the country, in the same four seasons.
    const GRASS = {
        meadow: [[122, 178, 72], [104, 158, 62], [142, 152, 62], [176, 184, 150]], forest: [[84, 136, 62], [72, 120, 56], [124, 116, 58], [150, 160, 140]],
        lake: [[116, 176, 78], [100, 160, 70], [146, 150, 70], [170, 180, 150]], pass: [[124, 150, 92], [116, 142, 86], [136, 132, 84], [190, 196, 190]],
        farm: [[126, 178, 72], [116, 166, 64], [164, 160, 70], [180, 186, 150]], moor: [[134, 142, 80], [128, 134, 74], [150, 124, 70], [170, 170, 150]],
        coast: [[150, 184, 96], [140, 172, 90], [166, 160, 86], [180, 186, 156]], deepwood: [[72, 122, 62], [60, 108, 54], [112, 104, 54], [142, 152, 132]], grove: [[70, 140, 98], [60, 128, 96], [96, 124, 104], [150, 176, 170]],
    };

    // ---- Models, made once ----------------------------------------------------------------
    const cache = new Map();
    const model = (key, make) => { let m = cache.get(key); if (!m) { m = new WaySoup(); make(m); cache.set(key, m); } return m; };

    // A fir's boughs, seen close: n fronds hung round the hem of a tier (a cone of radius R whose foot is at y), each a
    // long leaf of needles in two triangles that leans out past the hem and droops, in tones a little apart.
    function fronds(s, x, y, z, R, n, turn, sway) {
        const keep = s.col;
        s.fx(sway, 0, 30);
        for (let i = 0; i < n; i++) {
            const a = turn + (i + 0.5 * (i % 2)) / n * TAU, sa = Math.sin(a), ca = Math.cos(a), h = rnd(turn + i, 3), tone = 0.8 + 0.26 * h;
            const root = [x + sa * R * 0.45, y + 0.75, z + ca * R * 0.45], tip = [x + sa * R * (1.14 + 0.1 * h), y - 0.3 - 0.25 * h, z + ca * R * (1.14 + 0.1 * h)];
            const mid = [(root[0] + tip[0]) / 2, (root[1] + tip[1]) / 2 + 0.12, (root[2] + tip[2]) / 2], wd = 0.32 + 0.12 * h, wx = ca * wd, wz = -sa * wd;
            s.col = [keep[0] * tone, keep[1] * tone, keep[2] * tone];
            const nrm = [sa * 0.55, 0.83, ca * 0.55];
            s.tri(root, [mid[0] + wx, mid[1], mid[2] + wz], tip, nrm, [0.7, 0.95, 1]).tri(root, tip, [mid[0] - wx, mid[1], mid[2] - wz], nrm, [0.7, 1, 0.95]);
        }
        s.col = keep; s.fx(sway);
    }
    // Trees. Slot 1 is the leaf (tinted by season), 2 the trunk, 3 blossom or fruit. Each clump of leaf is lit as part
    // of the whole crown (its normals bent toward the crown's, darker deep inside it), which costs nothing. `rich` (High,
    // near the traveller: 1, or 0.6 in the thick of the woods) puts that share of leaves on the clumps and of drooping
    // fronds on a fir's tiers, so the crown's edge is leaves.
    function tree(kind, variant, rich = 0) {
        return model(`tree:${kind}:${variant}:${rich}`, s => {
            const r = k => rnd(variant + 1, k + kind.length * 3), lean = (r(1) - 0.5) * 0.5;
            const trunk = (h, r0, r1, col = C.trunk) => s.paint(col, 2).fx(0).prism(5, 0, -0.4, 0, r0, h, r1, { dx: lean, dz: (r(2) - 0.5) * 0.4, foot: 0.6 });
            let crown = null;
            const leaf = (x, y, z, rx, ry, rz, sway = 60, seedK = 0, o = {}) => {
                s.paint(C.white, 1).fx(sway).blob(x + lean, y, z, rx, ry, rz, { seed: variant + seedK * 0.37 + 0.1, crown, ...(rich ? { segs: 9, bands: 4 } : {}), ...o });
                if (rich) s.fx(Math.min(255, sway + 30)).leaves(x + lean, y, z, rx * 1.06, ry * 1.06, rz * 1.06, Math.round(L.clamp((rx + rz) * ry * 5, 14, 42) * rich), Math.min(1.1, 0.5 + rx * 0.17), { seed: variant + seedK, crown });
            };
            if (kind === 'oak' || kind === 'apple') {
                const big = kind === 'oak' ? 1 : 0.62;
                crown = [lean, 5.0 * big, 0, 0.55, 3.4 * big];
                trunk(3.4 * big, 0.5 * big, 0.3 * big);
                leaf(0, 5.6 * big, 0, 3.0 * big, 2.3 * big, 3.0 * big, 50, 1);
                for (let i = 0; i < 3; i++) { const a = i * 2.1 + r(3) * 6; leaf(Math.sin(a) * 1.9 * big, (4.3 + 1.1 * r(4 + i)) * big, Math.cos(a) * 1.9 * big, 1.9 * big, 1.5 * big, 1.9 * big, 70, 2 + i); }
                if (kind === 'apple') for (let i = 0; i < 9; i++) { const a = i * 2.4, y = 2.6 + 1.9 * r(10 + i), rr = 1.9 + 0.5 * r(20 + i); s.paint(C.white, 3).fx(60).blob(Math.sin(a) * rr + lean, y, Math.cos(a) * rr, 0.24, 0.24, 0.24, { segs: 4, bands: 2, lump: 0 }); }
            } else if (kind === 'poplar') {
                crown = [lean, 5.6, 0, 0.5, 2.6];
                trunk(2.6, 0.32, 0.2);
                leaf(0, 6.6, 0, 1.35, 4.9, 1.35, 90, 1, { bands: 4 });
                leaf(0.3, 3.9, 0.2, 1.1, 2.0, 1.1, 60, 2);
            } else if (kind === 'fir' || kind === 'pine') {
                const pine = kind === 'pine';
                trunk(pine ? 6 : 2.2, 0.36, 0.2, C.bark);
                if (pine) { crown = [lean, 6.6, 0, 0.5, 2.6]; leaf(0.4, 7.2, 0, 2.6, 0.9, 2.4, 40, 1); leaf(-0.9, 6.2, 0.6, 1.7, 0.7, 1.7, 40, 2); leaf(1.2, 5.6, -0.7, 1.4, 0.6, 1.5, 40, 3); }
                else for (let k = 0; k < 4; k++) {
                    const x = lean * (0.3 + k * 0.2), y0 = 2.5 + k * 1.9, R = 2.3 - 0.46 * k;
                    s.paint(C.white, 1).fx(22 + k * 16).prism(7, x, y0, 0, R, 5.6 + k * 2.05, 0, { foot: 0.5, turn: k * 0.7 + r(5), dx: lean * 0.25 });
                    if (rich) fronds(s, x, y0, 0, R, Math.round((7 - k) * rich), r(30 + k) * 6, 22 + k * 16);
                }
            } else if (kind === 'birch') {
                crown = [lean, 5.3, 0, 0.5, 2.4];
                trunk(5.4, 0.2, 0.12, C.birch);
                leaf(0, 6.0, 0, 1.7, 1.9, 1.7, 110, 1); leaf(0.9, 4.6, 0.3, 1.2, 1.2, 1.2, 110, 2); leaf(-0.8, 4.9, -0.5, 1.2, 1.3, 1.2, 110, 3);
            } else if (kind === 'willow') {
                crown = [lean, 4.6, 0, 0.5, 3.6];
                trunk(3.0, 0.62, 0.42);
                leaf(0, 4.9, 0, 3.5, 1.9, 3.5, 40, 1);
                if (!rich) s.paint([190, 196, 188], 1).fx(150).prism(8, lean, 1.3, 0, 3.6, 4.7, 3.1, { foot: 0.55, turn: r(6) });
                // Close to, the curtain is withies: long strands hung all round from the crown's rim, moving the most.
                else for (let i = 0; i < 14; i++) {
                    const a = i / 14 * TAU + r(6), d = 3.1 + 0.4 * r(30 + i), x = Math.sin(a) * d + lean, z = Math.cos(a) * d, drop = 1.0 + 1.0 * r(50 + i), px = Math.cos(a) * 0.4, pz = -Math.sin(a) * 0.4, tone = 0.84 + 0.2 * r(70 + i);
                    s.paint([190 * tone, 196 * tone, 188 * tone], 1).fx(150, 0, 40).quad([x - px, 4.8, z - pz], [x + px, 4.8, z + pz], [x * 1.04 + px * 0.3, drop, z * 1.04 + pz * 0.3], [x * 1.04 - px * 0.3, drop, z * 1.04 - pz * 0.3], [Math.sin(a) * 0.9, 0.4, Math.cos(a) * 0.9], [1, 1, 0.7, 0.7]);
                }
            } else if (kind === 'snag') {
                trunk(4.6, 0.36, 0.14, [124, 112, 104]);
                for (let i = 0; i < 3; i++) { const a = i * 2.3 + r(7) * 3; s.paint([124, 112, 104], 2).prism(4, lean * 0.6, 2.2 + i * 0.7, 0, 0.13, 3.7 + i * 0.6, 0.04, { dx: Math.sin(a) * 1.5, dz: Math.cos(a) * 1.5 }); }
            } else if (kind === 'glade') {
                crown = [lean, 5.7, 0, 0.55, 3.3];
                trunk(4.2, 0.46, 0.26, [92, 70, 110]);
                leaf(0, 6.2, 0, 3.2, 1.7, 3.2, 60, 1); leaf(1.6, 5.0, 0.6, 1.7, 1.2, 1.7, 80, 2); leaf(-1.5, 5.2, -0.8, 1.8, 1.2, 1.8, 80, 3);
                for (let i = 0; i < 6; i++) { const a = i * 1.9; s.paint(C.white, 3).fx(120, 255).blob(Math.sin(a) * 2.3 + lean, 3.4 + 0.9 * r(8 + i), Math.cos(a) * 2.3, 0.13, 0.17, 0.13, { segs: 4, bands: 2, lump: 0 }); }
            } else if (kind === 'shroom') {
                s.paint([240, 232, 214], 2).fx(0).prism(6, 0, -0.3, 0, 0.5, 3.6, 0.34, { dx: lean, foot: 0.7 });
                s.paint(C.white, 1).fx(14).blob(lean, 3.7, 0, 2.5, 1.15, 2.5, { seed: variant, lump: 0.05, segs: 8, under: 0.5 });
                s.paint([255, 236, 190], 0).fx(0, 150).prism(8, lean, 3.3, 0, 0.4, 3.62, 2.3, { flat: false, foot: 1 });
                for (let i = 0; i < 5; i++) { const a = i * 1.26 + r(9); s.paint(C.white, 3).fx(14).blob(lean + Math.sin(a) * 1.3, 4.46, Math.cos(a) * 1.3, 0.3, 0.1, 0.3, { segs: 5, bands: 2, lump: 0 }); }
            }
        });
    }
    // A bough over the road (the deep forest's): an old trunk that leans out and arches along +z to a little past the
    // middle of the road, a branch off it to either hand, and its leaves in broad flat clumps above the walker's head.
    // `how` is 'fine', 'lite' (fewer, plainer clumps), 'far' (one clump and a stick) or 'bare' (winter: the wood alone).
    const bough = (how, variant) => model(`bough:${how}:${variant}`, s => {
        const r = k => rnd(variant + 3, k + 60), far = how === 'far', lite = how === 'lite', sides = far || lite ? 3 : 4;
        const arch = [[0, -0.5, 0, 0.5, 1], [0, 2.6, 0.25, 0.4, 1], [0, 5.0, 1.3, 0.32, 1], [0, 6.6, 3.2, 0.24, 1], [0, 7.3, 5.4, 0.16, 1], [0, 7.2, 7.6, 0.06, 1]];
        s.paint(C.trunk, 2).fx(0).tube(far || lite ? [arch[0], arch[2], arch[3], arch[4], arch[5]] : arch, sides);
        if (!far && !lite) for (const x of [-1, 1]) s.tube([[0, 5.0, 1.3, 0.2, 1], [x * 1.3, 6.3, 2.2 + r(x + 2), 0.13, 1], [x * 2.7, 6.9, 3.4 + r(x + 4), 0.04, 1]], 3);
        if (how === 'bare') return;
        const leaf = (x, y, z, rx, ry, rz, k) => s.paint(C.white, 1).fx(46 + 10 * k).blob(x, y, z, rx, ry, rz, { seed: variant + k * 0.41 + 0.2, segs: far || lite ? 5 : 6, bands: 2, lump: 0.22, under: 0.7 });
        if (far) { leaf(0, 8.0, 5.0, 4.4, 1.5, 5.2, 1); return; }
        if (lite) { leaf(0.3 * (r(1) - 0.5), 8.0, 3.6, 3.9, 1.3, 3.2, 1); leaf(-1.7 + 0.6 * r(2), 8.0, 6.6, 3.7, 1.2, 3.2, 2); leaf(1.9 - 0.6 * r(3), 7.8, 8.0, 3.4, 1.1, 2.9, 3); return; }
        leaf(0.3 * (r(1) - 0.5), 8.1, 3.9, 3.5, 1.25, 3.0, 1);
        leaf(-2.2 + 0.6 * r(2), 7.9, 6.4, 3.0, 1.1, 2.9, 2);
        leaf(2.3 - 0.6 * r(3), 8.3, 6.1, 3.1, 1.15, 2.8, 3);
        leaf(0.4 * (r(4) - 0.5), 7.7, 8.5, 2.9, 1.0, 2.5, 4);
        leaf(-2.9 + 5.8 * (variant % 2), 7.4, 3.1, 2.0, 0.9, 2.0, 5);
    });
    // Far trees: a few triangles with the same outline.
    const farTree = cone => model(`far:${cone}`, s => {
        if (cone) s.paint(C.white, 1).prism(4, 0, 0.6, 0, 3.0, 10.5, 0, { foot: 0.5 });
        else s.paint(C.white, 1).blob(0, 4.6, 0, 3.4, 3.6, 3.4, { segs: 5, bands: 2, seed: 0.3, lump: 0.1, under: 0.5 });
    });

    const small = (kind, variant) => model(`${kind}:${variant}`, s => {
        const r = k => rnd(variant + 2, k);
        // (A toadstool by the path: the giant mushroom's shape in a dozen triangles, at the giant's size, for there are thousands.)
        if (kind === 'toadstool') { s.paint([240, 232, 214], 2).fx(0).prism(4, 0, -0.3, 0, 0.5, 3.6, 0.34, { foot: 0.7 }); s.paint(C.white, 1).fx(14).blob(0, 3.7, 0, 2.5, 1.15, 2.5, { seed: variant, lump: 0.05, segs: 6, bands: 2, under: 0.5 }); for (let i = 0; i < 3; i++) { const a = i * 2.1 + r(9); s.paint(C.white, 3).fx(14).blob(Math.sin(a) * 1.3, 4.46, Math.cos(a) * 1.3, 0.3, 0.1, 0.3, { segs: 4, bands: 2, lump: 0 }); } return; }
        if (kind === 'bush') { s.paint(C.white, 1).fx(40).blob(0, 0.55, 0, 1.0, 0.75, 0.9, { seed: variant }); s.blob(0.6, 0.4, 0.3, 0.6, 0.5, 0.6, { seed: variant + 0.5 }); }
        else if (kind === 'rock') { s.paint(C.rock, 0).fx(0).blob(0, 0.25, 0, 0.8, 0.55, 0.65, { seed: variant, lump: 0.3, segs: 5, under: 0.5 }); if (r(1) < 0.5) s.blob(0.6, 0.12, 0.3, 0.4, 0.3, 0.4, { seed: variant + 0.4, lump: 0.3, segs: 5 }); }
        else if (kind === 'heather') { s.paint(C.white, 3).fx(30).blob(0, 0.14, 0, 0.5, 0.26, 0.42, { seed: variant, lump: 0.3 }); s.paint(C.white, 1).blob(0.3, 0.08, 0.2, 0.3, 0.16, 0.3, { seed: variant + 0.3, lump: 0.3, segs: 5 }); }
        else if (kind === 'tuft' || kind === 'fern' || kind === 'reed') {
            const n = kind === 'reed' ? 5 : 6, tall = kind === 'reed' ? 1.5 : kind === 'fern' ? 0.6 : 0.42, wide = kind === 'fern' ? 0.55 : kind === 'reed' ? 0.2 : 0.3;
            for (let i = 0; i < n; i++) {
                const a = i / n * TAU + r(i), out = kind === 'fern' ? 0.6 : 0.18, x = Math.sin(a) * 0.12, z = Math.cos(a) * 0.12, tx = Math.sin(a) * out * (0.6 + r(i + 9)), tz = Math.cos(a) * out * (0.6 + r(i + 9)), h = tall * (0.6 + 0.6 * r(i + 4));
                s.paint(C.white, 1).fx(kind === 'reed' ? 200 : 120);
                const px = Math.cos(a) * wide * 0.5, pz = -Math.sin(a) * wide * 0.5, n0 = [Math.sin(a) * 0.5, 0.85, Math.cos(a) * 0.5];
                s.tri([x - px, 0, z - pz], [x + px, 0, z + pz], [x + tx, h, z + tz], n0, [0.6, 0.6, 1]);
                if (kind === 'reed' && i < 2) s.paint([110, 80, 56], 0).fx(200).blob(x + tx * 0.9, h * 0.92, z + tz * 0.9, 0.05, 0.17, 0.05, { segs: 4, bands: 2, lump: 0 });
            }
        } else if (kind === 'flower') {
            for (let i = 0; i < 5; i++) {
                const a = i * 1.3 + r(i) * 3, d = 0.15 + 0.4 * r(i + 5), x = Math.sin(a) * d, z = Math.cos(a) * d, h = 0.22 + 0.2 * r(i + 7);
                s.paint(C.white, 1).fx(140).tri([x - 0.03, 0, z], [x + 0.03, 0, z], [x, h, z], [0, 1, 0]);
                s.paint(C.white, 3).fx(140).blob(x, h, z, 0.06, 0.035, 0.06, { segs: 5, bands: 2, lump: 0, under: 1 });
            }
        } else if (kind === 'litter') {
            // Fallen leaves, lying.
            for (let i = 0; i < 9; i++) { const a = i * 2.4 + r(i) * 3, d = 0.1 + 0.6 * r(i + 5), x = Math.sin(a) * d, z = Math.cos(a) * d, t2 = r(i + 9) * 6, k = 0.8 + 0.3 * r(i + 14); s.paint([255 * k, 255 * k, 255 * k], 3).fx(0, 0, 4).tri([x + Math.sin(t2) * 0.07, 0.03, z + Math.cos(t2) * 0.07], [x + Math.cos(t2) * 0.04, 0.035 + 0.02 * r(i), z - Math.sin(t2) * 0.04], [x - Math.sin(t2) * 0.07, 0.03, z - Math.cos(t2) * 0.07], [0, 1, 0]).tri([x + Math.sin(t2) * 0.07, 0.03, z + Math.cos(t2) * 0.07], [x - Math.sin(t2) * 0.07, 0.03, z - Math.cos(t2) * 0.07], [x - Math.cos(t2) * 0.04, 0.03, z + Math.sin(t2) * 0.04], [0, 1, 0]); }
            s.fx(0);
        } else if (kind === 'lily') { s.paint([84, 150, 84], 0).fx(0).prism(7, 0, 0.02, 0, 0.5, 0.03, 0.5, { cap: true }); if (r(1) < 0.4) s.paint([250, 220, 230], 0).blob(0.1, 0.1, 0, 0.12, 0.08, 0.12, { segs: 5, bands: 2, lump: 0 }); }
    });

    // ---- Buildings ---------------------------------------------------------------------------
    // A timber-framed house, built for its plot: w wide (along the street),
    // dp deep, so many floors. The front faces +z. Slots: 1 walls, 2 timber, 3 shutters and doors, 5 roof.
    // Each is its own: floor heights, roof pitch, a stone ground floor, a jetty, a dormer, a lean, ivy, a lantern.
    // lite (far squares) keeps the shape and the lit windows and drops the rest.
    // Returns where its chimney smokes, its windows glow and its lantern hangs, in its own metres.
    function house(s, o) {
        const lite = !!o.lite, w = o.w, dp = o.dp, hw = w / 2, hd = dp / 2, r = k => rnd(o.v + 0.1, k), stone = !!o.stone, barn = !!o.barn, fine = !!o.fine && !lite, rich = (fine || !!o.rich) && !lite;          // rich: High, near the traveller (timbers, frames and roof boards with depth)
        // (Built as part of something bigger, it stands where that says: o.at.)
        const base = o.at || null, AT = m => s.at(base ? (m ? mul(base, m) : base) : m);
        const FL = 2.6 + 0.4 * r(50), floors = o.floors, wallTop = 0.45 + floors * FL, jut = o.jetty ? 0.5 : 0, stoneBase = !!o.stoneBase && !stone && !barn;
        const out = { smoke: null, glow: [], lamp: null };
        // An old house leans: everything above the ground floor goes through this.
        const lean = floors > 1 && o.crooked && !lite ? mul(move(0, 0.45 + FL, 0), mul(rotZ((r(51) - 0.5) * 0.09), move(0, -0.45 - FL, 0))) : null;
        AT(null).fx(0).course(true).paint(C.stone, 0).box(0, o.deep ? -1.2 : 0, 0, hw + 0.06, o.deep ? 1.7 : 0.5, hd + 0.06, 0.6).course(false);
        // A timber: its face 7 cm proud of the wall and its two edges, so it stands off the plaster and catches the light.
        const beam = (x0, y0, x1, y1, z, t = 0.11) => {             // on the front (z > 0) or back face
            const sz = Math.sign(z), n = [0, 0, sz], dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy), px = -dy / l * t, py = dx / l * t, e = z + sz * 0.01, f = z + sz * (rich ? 0.07 : 0.03);
            s.paint(C.white, 2).quad([x0 - px, y0 - py, f], [x1 - px, y1 - py, f], [x1 + px, y1 + py, f], [x0 + px, y0 + py, f], n);
            if (!rich) return;
            s.quad([x0 + px, y0 + py, f], [x1 + px, y1 + py, f], [x1 + px, y1 + py, e], [x0 + px, y0 + py, e], [px / t, py / t, 0], [1, 1, 0.6, 0.6]);
            s.quad([x0 - px, y0 - py, e], [x1 - px, y1 - py, e], [x1 - px, y1 - py, f], [x0 - px, y0 - py, f], [-px / t, -py / t, 0], [0.6, 0.6, 1, 1]);
        };
        // A window set in a frame that stands out from the wall (and from the timbers), the glass back in its opening
        // behind four faces in shade: it reads as a window in a thick wall, not a pane painted on it.
        const windowAt = (x, y, z, ww = 0.42, wh = 0.52, lit = true, dress = false) => {     // on a z face
            const sz = Math.sign(z), n = [0, 0, sz], g = z + sz * (rich ? 0.08 : 0.06), f = z + sz * (rich ? 0.14 : 0.04), fw = 0.09, e = f;
            if (!lite && !rich) s.paint(C.white, 2).quad([x - ww - fw, y - wh - fw, f], [x + ww + fw, y - wh - fw, f], [x + ww + fw, y + wh + fw, f], [x - ww - fw, y + wh + fw, f], n);          // (a plain frame behind the glass)
            if (rich) {
                s.paint(C.white, 2);
                s.quad([x - ww - fw, y - wh - fw, f], [x - ww, y - wh - fw, f], [x - ww, y + wh + fw, f], [x - ww - fw, y + wh + fw, f], n).quad([x + ww, y - wh - fw, f], [x + ww + fw, y - wh - fw, f], [x + ww + fw, y + wh + fw, f], [x + ww, y + wh + fw, f], n);
                s.quad([x - ww, y + wh, f], [x + ww, y + wh, f], [x + ww, y + wh + fw, f], [x - ww, y + wh + fw, f], n).quad([x - ww, y - wh - fw, f], [x + ww, y - wh - fw, f], [x + ww, y - wh, f], [x - ww, y - wh, f], n);
                // The reveal: the opening's four sides, from the frame back to the glass, in shade (the head darkest).
                s.quad([x - ww, y - wh, g], [x - ww, y + wh, g], [x - ww, y + wh, f], [x - ww, y - wh, f], [1, 0, 0], [0.45, 0.45, 0.7, 0.7]).quad([x + ww, y + wh, g], [x + ww, y - wh, g], [x + ww, y - wh, f], [x + ww, y + wh, f], [-1, 0, 0], [0.45, 0.45, 0.7, 0.7]);
                s.quad([x + ww, y + wh, g], [x - ww, y + wh, g], [x - ww, y + wh, f], [x + ww, y + wh, f], [0, -1, 0], [0.3, 0.3, 0.55, 0.55]).quad([x - ww, y - wh, g], [x + ww, y - wh, g], [x + ww, y - wh, f], [x - ww, y - wh, f], [0, 1, 0], [0.7, 0.7, 0.9, 0.9]);
            }
            s.paint(C.glass, 0).fx(0, lit ? 255 : 0).quad([x - ww, y - wh, g], [x + ww, y - wh, g], [x + ww, y + wh, g], [x - ww, y + wh, g], n);
            s.fx(0);
            if (lit) out.glow.push([x, y, z]);
            if (lite) return;
            // Its mullion (and, close to, a transom).
            if (rich) s.paint(C.white, 2).box(x, y, g + sz * 0.015, 0.035, wh, 0.015, 1).box(x, y + wh * 0.3, g + sz * 0.015, ww, 0.028, 0.015, 1);
            else s.paint(C.white, 2).quad([x - 0.035, y - wh, g + sz * 0.01], [x + 0.035, y - wh, g + sz * 0.01], [x + 0.035, y + wh, g + sz * 0.01], [x - 0.035, y + wh, g + sz * 0.01], n);
            if (fine && dress) {
                // Close to, on the street's side: the panes leaded in a lattice, and a lintel over the frame.
                for (const k of [-0.5, 0.5]) s.paint([70, 64, 60], 0).box(x + k * ww, y - wh * 0.35, g + sz * 0.01, 0.012, wh * 0.65, 0.008, 1);
                s.paint(C.white, 2).box(x, y + wh + fw + 0.07, z + sz * 0.1, ww + fw + 0.12, 0.07, 0.08, 1);
            }
            // A sill that catches the light.
            const sy = y - wh - 0.1, so = e + sz * 0.14;
            s.paint([226, 220, 206], 0).quad([x - ww - 0.14, sy, e], [x + ww + 0.14, sy, e], [x + ww + 0.14, sy, so], [x - ww - 0.14, sy, so], [0, 1, 0]).quad([x - ww - 0.14, sy - 0.07, so], [x + ww + 0.14, sy - 0.07, so], [x + ww + 0.14, sy, so], [x - ww - 0.14, sy, so], n, [0.7, 0.7, 1, 1]);
            if (!dress) return;
            if (!stone && r(x * 3 + y) < 0.6) for (const side of [-1, 1]) { if (rich) s.paint(C.white, 3).box(x + side * (ww + fw + 0.17), y, e + sz * 0.02, 0.17, wh, 0.02, 1); else s.paint(C.white, 3).quad([x + side * (ww + 0.12) - 0.16, y - wh, e + sz * 0.01], [x + side * (ww + 0.12) + 0.16, y - wh, e + sz * 0.01], [x + side * (ww + 0.12) + 0.16, y + wh, e + sz * 0.01], [x + side * (ww + 0.12) - 0.16, y + wh, e + sz * 0.01], n); }          // shutters, folded back
            if (r(x * 5 + y * 2) < 0.38) {
                // A window box, in flower.
                const by = sy - 0.02, bo = e + sz * 0.3;
                s.paint([124, 88, 62], 0).quad([x - ww, by - 0.2, bo], [x + ww, by - 0.2, bo], [x + ww, by, bo], [x - ww, by, bo], n, [0.7, 0.7, 1, 1]);
                s.paint([92, 150, 70], 0).fx(40).quad([x - ww, by, e], [x + ww, by, e], [x + ww, by + 0.06, bo], [x - ww, by + 0.06, bo], [0, 1, 0]);
                s.paint(C.white, 3).quad([x - ww * 0.9, by + 0.02, bo], [x + ww * 0.9, by + 0.02, bo], [x + ww * 0.9, by + 0.2, bo - sz * 0.06], [x - ww * 0.9, by + 0.2, bo - sz * 0.06], n);
                s.fx(0);
            }
        };
        for (let f = 0; f < floors; f++) {
            const y0 = 0.45 + f * FL, j = f > 0 ? jut : 0, x1 = hw + j * 0.5, z1 = hd + j, rough = stone || (f === 0 && stoneBase);
            if (f === 1) AT(lean);
            s.course(rough).paint(rough ? [196, 190, 180] : C.white, rough ? 0 : 1).box(0, y0 + FL / 2, j / 2, x1, FL / 2, hd + j / 2, f ? 1 : 0.55).course(false);
            if (fine && !rough && !barn) for (const px of [-x1, x1]) for (const pz of [z1, -hd]) s.paint(C.white, 2).tube([[px, y0, pz, 0.14, 1], [px, y0 + FL, pz, 0.14, 1]], 6);          // corner posts, in the round
            // Stone corners in dressed blocks, long and short by turns, standing a little proud.
            if (fine && rough && !barn) for (const px of [-x1, x1]) for (const pz of [z1, -hd]) for (let k = 0; k < Math.floor(FL / 0.32); k++) { const long = k % 2 === 0, sx = Math.sign(px), sz = Math.sign(pz); s.course(false).paint([214, 208, 198], 0).box(px - sx * (long ? 0.2 : 0.1), y0 + 0.16 + k * 0.32, pz - sz * (long ? 0.1 : 0.2), long ? 0.24 : 0.14, 0.14, long ? 0.14 : 0.24, 0.85); }
            if (f === 1 && jut && !lite) s.paint(C.white, 2).box(0, y0 - 0.07, hd + jut / 2, x1, 0.08, jut / 2 + 0.03, 0.6);       // the beam the upper floor rides out on
            if (!rough && !barn && !lite) {
                for (const z of [z1, -hd]) {
                    beam(-x1, y0 + 0.08, x1, y0 + 0.08, z); beam(-x1, y0 + FL - 0.08, x1, y0 + FL - 0.08, z);
                    const n = Math.max(2, Math.round(w / 1.7));
                    for (let i = 0; i <= n; i++) beam(-x1 + 0.1 + (2 * x1 - 0.2) * i / n, y0, -x1 + 0.1 + (2 * x1 - 0.2) * i / n, y0 + FL, z);
                    if (f > 0 || r(f + 3) < 0.5) { beam(-x1 + 0.1, y0 + 0.1, -x1 + 0.1 + (2 * x1 - 0.2) / n, y0 + FL * 0.55, z, 0.09); beam(x1 - 0.1, y0 + 0.1, x1 - 0.1 - (2 * x1 - 0.2) / n, y0 + FL * 0.55, z, 0.09); }
                }
                for (const side of [-1, 1]) {
                    AT(lean && f ? mul(lean, rotY(side * Math.PI / 2)) : rotY(side * Math.PI / 2));
                    const zs = hd + j / 2, off = -side * j / 2;
                    beam(-zs + off, y0 + 0.08, zs + off, y0 + 0.08, x1); beam(-zs + off, y0 + FL - 0.08, zs + off, y0 + FL - 0.08, x1);
                    for (const z of [-zs + 0.1, 0, zs - 0.1]) beam(z + off, y0, z + off, y0 + FL, x1);
                    AT(f ? lean : null);
                }
            }
            // Windows: across the front, one at the back, one in each end wall.
            const n = Math.max(1, Math.floor(w / 2.3)), doorX = barn || w < 6.5 ? 0 : (r(52) < 0.5 ? -1 : 1) * w * 0.22;
            for (let i = 0; i < n; i++) {
                const x = (i - (n - 1) / 2) * (2 * x1 - 1.3) / n;
                if (f === 0 && Math.abs(x - doorX) < 0.95) continue;
                windowAt(x, y0 + FL * 0.56, z1, barn ? 0.3 : 0.42, barn ? 0.3 : 0.52, !barn && r(f * 7 + i) < 0.72, !barn);
            }
            if (!barn && !lite) {
                windowAt((r(f + 20) - 0.5) * w * 0.5, y0 + FL * 0.56, -hd, 0.4, 0.5, r(f + 30) < 0.6);
                for (const side of [-1, 1]) { AT(lean && f ? mul(lean, rotY(side * Math.PI / 2)) : rotY(side * Math.PI / 2)); windowAt(-side * j / 2, y0 + FL * 0.56, x1, 0.4, 0.5, r(f * 5 + side + 60) < 0.6); AT(f ? lean : null); }
            }
            // The eaves' shadow lies along the top of the wall.
            if (f === floors - 1 && !lite) for (const z of [z1, -hd]) s.paint([150, 142, 150], rough ? 0 : 1).quad([-x1, y0 + FL - 0.5, z + Math.sign(z) * 0.02], [x1, y0 + FL - 0.5, z + Math.sign(z) * 0.02], [x1, y0 + FL, z + Math.sign(z) * 0.02], [-x1, y0 + FL, z + Math.sign(z) * 0.02], [0, 0, Math.sign(z)], [1, 1, 0.7, 0.7]);
        }
        // The door, under a lintel, up a step; a barn's is a pair.
        AT(null);
        const dx = barn || w < 6.5 ? 0 : (r(52) < 0.5 ? -1 : 1) * w * 0.22, dw = barn ? 1.3 : 0.52, dh = barn ? 2.4 : 1.95, e = hd + (rich ? 0.08 : 0.07), f = hd + (rich ? 0.15 : 0.05), top = 0.5 + dh;
        if (!lite && !rich) {
            s.fx(0).paint(C.white, 2).quad([dx - dw - 0.1, 0.4, f], [dx + dw + 0.1, 0.4, f], [dx + dw + 0.1, top + 0.1, f], [dx - dw - 0.1, top + 0.1, f], [0, 0, 1]);
            s.paint(C.white, 3).quad([dx - dw, 0.45, e], [dx + dw, 0.45, e], [dx + dw, top, e], [dx - dw, top, e], [0, 0, 1], [0.6, 0.6, 1, 1]);
            s.paint(C.white, 2).box(dx, top + 0.12, hd + 0.1, dw + 0.22, 0.09, 0.1, 1);
            s.paint(C.gold, 0).box(dx + dw - 0.12, 1.4, e + 0.03, 0.03, 0.03, 0.03, 1);
        }
        if (rich) {
            // A frame standing out from the wall, the door back in its opening behind faces in shade, a lintel over it.
            s.fx(0).paint(C.white, 2).quad([dx - dw - 0.1, 0.4, f], [dx - dw, 0.4, f], [dx - dw, top + 0.1, f], [dx - dw - 0.1, top + 0.1, f], [0, 0, 1]).quad([dx + dw, 0.4, f], [dx + dw + 0.1, 0.4, f], [dx + dw + 0.1, top + 0.1, f], [dx + dw, top + 0.1, f], [0, 0, 1]).quad([dx - dw, top, f], [dx + dw, top, f], [dx + dw, top + 0.1, f], [dx - dw, top + 0.1, f], [0, 0, 1]);
            s.quad([dx - dw, 0.4, e], [dx - dw, top, e], [dx - dw, top, f], [dx - dw, 0.4, f], [1, 0, 0], [0.45, 0.45, 0.7, 0.7]).quad([dx + dw, top, e], [dx + dw, 0.4, e], [dx + dw, 0.4, f], [dx + dw, top, f], [-1, 0, 0], [0.45, 0.45, 0.7, 0.7]).quad([dx + dw, top, e], [dx - dw, top, e], [dx - dw, top, f], [dx + dw, top, f], [0, -1, 0], [0.3, 0.3, 0.55, 0.55]);
            s.paint(C.white, 3).quad([dx - dw, 0.45, e], [dx + dw, 0.45, e], [dx + dw, top, e], [dx - dw, top, e], [0, 0, 1], [0.6, 0.6, 1, 1]);
            s.paint(C.white, 2).box(dx, top + 0.12, hd + 0.17, dw + 0.22, 0.09, 0.06, 1);
            s.paint(C.gold, 0).box(dx + dw - 0.12, 1.4, e + 0.03, 0.03, 0.03, 0.03, 1);
            if (fine) {
                // Planks, strap hinges, and a ring to knock with.
                const n = barn ? 6 : 3;
                for (let i = 1; i < n; i++) s.paint([60, 44, 36], 0).box(dx - dw + i * 2 * dw / n, 0.5 + dh / 2, e + 0.004, 0.012, dh / 2 - 0.04, 0.004, 1);
                for (const y of [0.85, 0.3 + dh]) s.paint(C.iron, 0).box(dx - dw * 0.3, y, e + 0.011, dw * 0.66, 0.035, 0.012, 1);
                s.tube([[dx + dw - 0.2, 1.39, e + 0.03, 0.012, 1], [dx + dw - 0.14, 1.3, e + 0.05, 0.012, 1], [dx + dw - 0.2, 1.21, e + 0.05, 0.012, 1], [dx + dw - 0.26, 1.3, e + 0.05, 0.012, 1], [dx + dw - 0.2, 1.39, e + 0.03, 0.012, 1]], 4, { ref: [0, 0, 1] });
                if (!barn && r(61) < 0.55) {
                    // A little roof over the door on two brackets, tiled as the house is.
                    for (const sx of [-1, 1]) s.paint(C.white, 2).box(dx + sx * (dw + 0.18), top + 0.32, hd + 0.3, 0.05, 0.05, 0.28, 1).box(dx + sx * (dw + 0.18), top + 0.12, hd + 0.2, 0.05, 0.16, 0.05, 1);
                    s.course(true).paint([230, 230, 230], 5).quad([dx - dw - 0.35, top + 0.42, hd + 0.62], [dx + dw + 0.35, top + 0.42, hd + 0.62], [dx + dw + 0.35, top + 0.78, hd + 0.02], [dx - dw - 0.35, top + 0.78, hd + 0.02]).course(false);
                    s.paint(C.white, 2).box(dx, top + 0.4, hd + 0.62, dw + 0.37, 0.04, 0.03, 1);
                }
            }
        }
        if (!lite) s.course(true).paint(C.stone, 0).box(dx, 0.2, hd + 0.4, dw + 0.25, 0.22, 0.35, 0.7).course(false);          // a step
        AT(lean);
        // The roof: a steep gable in lapping courses, flared at the eaves, its ridge along the street or (a narrow town house) end-on.
        const endOn = o.endOn ?? (floors > 1 && w < dp + 1.2), span = (endOn ? hw : hd + jut / 2) + 0.55, len = (endOn ? hd + jut / 2 : hw + jut / 2) + 0.5, rise = span * (barn ? 0.85 : 0.95 + 0.4 * r(53)), zc = endOn ? 0 : jut / 2;
        const pt = (a, y, b) => endOn ? [a, y, b + jut / 2] : [b, y, a + zc];           // a across the gable, b along the ridge
        const y0 = wallTop - 0.12, y1 = wallTop + rise, sag = 0.1, COURSES = lite ? 1 : 5, curve = t => y0 + rise * Math.pow(Math.max(t, 0), 1.22);
        for (const sgn of [-1, 1]) {
            for (let c = 0; c < COURSES; c++) {
                const t0 = Math.max(0, c / COURSES - 0.05), t1 = (c + 1) / COURSES, k = (c % 2 ? 0.9 : 1) * (0.8 + 0.2 * t1), l0 = len - sag * t0, l1 = len - sag * t1;
                s.course(true).paint([255 * k, 255 * k, 255 * k], 5);
                s.quad(pt(sgn * span * (1 - t0), curve(t0) + (lite ? 0 : 0.07), -l0), pt(sgn * span * (1 - t0), curve(t0) + (lite ? 0 : 0.07), l0), pt(sgn * span * (1 - t1), curve(t1), l1), pt(sgn * span * (1 - t1), curve(t1), -l1));
            }
            s.course(stone).paint(stone ? [200, 196, 190] : C.white, stone ? 0 : 1);
            for (let c = 0; c < COURSES; c++) for (const side of [-1, 1]) {
                const t0 = c / COURSES, t1 = (c + 1) / COURSES, at = t => pt(side * (span - 0.55) * (1 - t), curve(t) - 0.2 * (1 - t) - 0.5 * t, sgn * (len - 0.5));
                s.tri(pt(0, wallTop - 0.1, sgn * (len - 0.5)), at(t0), at(t1), endOn ? [0, 0, sgn] : [sgn, 0, 0]);
            }
        }
        s.course(false);
        if (rich) {
            // The roof has thickness: the lower edge of every course of tiles, a board along each eave and up each gable's
            // verge, and (close to) the ends of the rafters under the eaves.
            const across = endOn ? [1, 0, 0] : [0, 0, 1], along = endOn ? [0, 0, 1] : [1, 0, 0];
            for (const sgn of [-1, 1]) {
                s.course(true).paint([200, 200, 200], 5);
                for (let c = 0; c < COURSES; c++) {
                    const t0 = Math.max(0, c / COURSES - 0.05), l0 = len - sag * t0, a0 = sgn * span * (1 - t0), y = curve(t0) + 0.07;
                    s.quad(pt(a0, y - 0.06, -l0), pt(a0, y - 0.06, l0), pt(a0, y, l0), pt(a0, y, -l0), [across[0] * sgn * 0.8, -0.6, across[2] * sgn * 0.8], [0.6, 0.6, 1, 1]);
                }
                s.course(false).paint(C.white, 2);
                const ae = sgn * (span + 0.015), ye = curve(0) + 0.01;
                s.quad(pt(ae, ye - 0.2, -len - 0.04), pt(ae, ye - 0.2, len + 0.04), pt(ae, ye, len + 0.04), pt(ae, ye, -len - 0.04), [across[0] * sgn, 0, across[2] * sgn], [0.7, 0.7, 1, 1]);
                for (const end of [-1, 1]) for (let c = 0; c < COURSES; c++) {
                    const t0 = c / COURSES, t1 = (c + 1) / COURSES, b0 = end * (len - sag * t0 + 0.03), b1 = end * (len - sag * t1 + 0.03), A = sgn * span * (1 - t0), B = sgn * span * (1 - t1), Y0 = curve(t0) + 0.09, Y1 = curve(t1) + 0.09;
                    s.quad(pt(A, Y0 - 0.24, b0), pt(B, Y1 - 0.24, b1), pt(B, Y1, b1), pt(A, Y0, b0), [along[0] * end, 0, along[2] * end], [0.7, 0.7, 1, 1]);
                }
                if (fine) for (let k = -len + 0.4; k < len - 0.2; k += 0.62) { const c0 = pt(sgn * (span - 0.25), y0 - 0.04, k); s.box(c0[0], c0[1], c0[2], endOn ? 0.25 : 0.04, 0.05, endOn ? 0.04 : 0.25, 0.6); }
            }
        }
        const front = hd + jut;
        if (endOn && !stone && !lite) { beam(-span + 0.65, wallTop + 0.05, span - 0.65, wallTop + 0.05, front); beam(0, wallTop, 0, wallTop + rise - 0.7, front); windowAt(0, wallTop + rise * 0.36, front, 0.3, 0.36, r(40) < 0.6); }
        if (!lite) {
            // A ridge of darker tiles; and on a wide roof, a dormer looking at the street.
            const ridge = pt(0, y1 + 0.03, 0), r0 = pt(0, y1 + 0.02, -(len - sag) - 0.05), r1 = pt(0, y1 + 0.02, len - sag + 0.05);
            if (rich) s.paint([196, 196, 196], 5).tube([[...r0, 0.13, 0.8], [...r1, 0.13, 0.8]], 6, { cap: 3 });          // ridge tiles, in the round
            else s.paint([196, 196, 196], 5).box(ridge[0], ridge[1], ridge[2], endOn ? 0.15 : len - sag, 0.1, endOn ? len - sag : 0.15, 1);
            if (!endOn && !barn && w > 6.8 && r(54) < 0.65) {
                const t = 0.4, mx = (r(57) - 0.5) * w * 0.4, mz = zc + span * (1 - t) - 0.15, my = curve(t);
                s.paint(C.white, 1).box(mx, my + 0.35, mz, 0.52, 0.55, 0.62, 1);
                s.paint(C.glass, 0).fx(0, r(58) < 0.6 ? 255 : 0).quad([mx - 0.3, my + 0.15, mz + 0.63], [mx + 0.3, my + 0.15, mz + 0.63], [mx + 0.3, my + 0.75, mz + 0.63], [mx - 0.3, my + 0.75, mz + 0.63], [0, 0, 1]);
                s.fx(0).paint([230, 230, 230], 5);
                for (const sx of [-1, 1]) s.quad([mx + sx * 0.72, my + 0.8, mz + 0.75], [mx + sx * 0.72, my + 0.8, mz - 0.9], [mx, my + 1.35, mz - 0.9], [mx, my + 1.35, mz + 0.75]);
                s.paint(C.white, 1).tri([mx - 0.6, my + 0.86, mz + 0.63], [mx + 0.6, my + 0.86, mz + 0.63], [mx, my + 1.3, mz + 0.63], [0, 0, 1]);
            }
        }
        // A chimney, off the ridge, with a pot.
        if (!barn) {
            const cx = endOn ? (r(41) < 0.5 ? -1 : 1) * span * 0.45 : (r(41) - 0.5) * w * 0.6, cz = endOn ? (r(42) - 0.5) * dp * 0.5 : -span * 0.35 + zc, top = y1 + 0.55, foot = y1 - rise * 0.62;
            s.course(true).paint(C.stone, 0).box(cx, (foot + top) / 2, cz, 0.36, (top - foot) / 2, 0.36, 0.8, [[70, 62, 60], 0]).course(false);
            if (rich) s.course(true).paint(C.stone, 0).box(cx, top - 0.06, cz, 0.43, 0.07, 0.43, 0.9).course(false);          // a capping
            if (!lite) s.paint([170, 96, 70], 0).box(cx, top + 0.16, cz, 0.16, 0.16, 0.16, 1, [[50, 44, 44], 0]);          // a pot
            out.smoke = [cx, top + 1.0, cz];
        }
        AT(null);
        if (lite) return out;
        if (o.inn || o.shop) {
            // A sign on a bracket.
            const sx = -hw + 0.9;
            s.paint(C.white, 2).box(sx, 3.0, hd + 0.6, 0.04, 0.04, 0.6, 1);
            s.paint(o.inn ? C.gold : C.white, o.inn ? 0 : 3).fx(8).box(sx, 2.55, hd + 0.9, 0.05, 0.36, 0.3, 1);
            if (o.shop) { s.fx(0, 0, 60).paint(C.white, 3).quad([hw - 2.6, 2.3, hd + 0.05], [hw - 0.2, 2.3, hd + 0.05], [hw - 0.2, 1.95, hd + 1.2], [hw - 2.6, 1.95, hd + 1.2]); }
            s.fx(0);
        }
        if (o.inn || o.shop || r(55) < 0.3) {
            // A lantern on a bracket by the door.
            const lx = dx + dw + 0.5;
            s.paint(C.iron, 0).fx(0).box(lx, 2.5, hd + 0.2, 0.025, 0.025, 0.2, 1);
            s.paint([214, 176, 110], 0).fx(0, 255).box(lx, 2.28, hd + 0.36, 0.08, 0.12, 0.08, 1);
            s.fx(0);
            out.lamp = [lx, 2.28, hd + 0.4];
        }
        if (!stone && !barn && r(56) < 0.28) {
            // Ivy up one corner.
            const side = r(59) < 0.5 ? -1 : 1;
            for (let i = 0; i < 4; i++) s.paint([70 + 20 * r(60 + i), 122, 62], 0).fx(20).blob(side * (hw - 0.5 - 0.5 * r(64 + i)), 0.9 + i * 0.75, hd + 0.05, 0.62 - i * 0.08, 0.56, 0.1, { segs: 5, bands: 2, seed: i + o.v, lump: 0.3, under: 0.7 });
            s.fx(0);
        }
        return out;
    }

    // The rest of what a place is made of: fixed models, some with tinted slots.
    const fixed = (kind, variant = 0) => model(`${kind}:${variant}`, s => {
        const r = k => rnd(variant + 3, k);
        if (kind === 'lamp') {
            s.paint(C.iron, 0).fx(0).prism(5, 0, 0, 0, 0.09, 2.7, 0.06).box(0, 2.75, 0.25, 0.03, 0.03, 0.28, 1);
            s.paint([214, 176, 110], 0).fx(0, 255).prism(4, 0, 2.3, 0.5, 0.07, 2.56, 0.11, { turn: 0.785, flat: true });
            s.paint(C.iron, 0).fx(0).prism(4, 0, 2.56, 0.5, 0.17, 2.72, 0.02, { turn: 0.785, flat: true }).box(0, 2.28, 0.5, 0.06, 0.02, 0.06, 1);
        } else if (kind === 'sign') {
            s.paint(C.plank, 0).fx(0).prism(4, 0, 0, 0, 0.08, 2.5, 0.07);
            s.box(0.42, 2.2, 0, 0.5, 0.13, 0.03, 1).box(-0.36, 1.85, 0, 0.44, 0.12, 0.03, 1);
        } else if (kind === 'milestone') { s.paint(C.stone, 0).fx(0).prism(5, 0, -0.1, 0, 0.26, 0.7, 0.2, { cap: true }); s.paint(C.moss, 0).blob(0.1, 0.05, 0.16, 0.24, 0.12, 0.2, { seed: variant }); }
        else if (kind === 'shrine') {
            s.paint(C.stone, 0).fx(0).box(0, 0.5, 0, 0.42, 0.5, 0.36, 0.7).paint(C.slate, 5).prism(4, 0, 1.0, 0, 0.72, 1.6, 0, { turn: 0.785, flat: true });
            s.paint(C.flame, 0).fx(0, 255).box(0, 0.62, 0.37, 0.14, 0.2, 0.02, 1);
            s.paint(BRIGHT[2], 0).fx(120).blob(0.3, 0.1, 0.5, 0.1, 0.08, 0.1, { segs: 5, bands: 2 }).blob(-0.25, 0.1, 0.52, 0.1, 0.08, 0.1, { segs: 5, bands: 2 });
        } else if (kind === 'logs') {
            for (const [x, y] of [[-0.24, 0.22], [0.24, 0.22], [0, 0.6]]) s.paint(C.trunk, 0).fx(0).at(mul(move(x, y, 0), rotX(Math.PI / 2))).prism(6, 0, -1.1, 0, 0.22, 1.1, 0.22, { cap: true, foot: 1 });
            s.at(null);
        }
        else if (kind === 'fence') {
            s.paint(C.plank, 0).fx(0);
            for (const z of [-1.9, 0]) s.box(0, 0.5, z, 0.07, 0.6, 0.07, 0.7);
            s.box(0, 0.8, 0.05, 0.03, 0.05, 2.0, 1).box(0, 0.42, 0.05, 0.03, 0.05, 2.0, 1);
        } else if (kind === 'drywall') {
            for (let i = 0; i < 4; i++) {
                const z0 = -2 + i, k = 0.74 + 0.24 * r(i), c = lerp3(C.stone, C.darkStone, 0.3 + 0.5 * r(i + 4)), h = 0.62 + 0.08 * r(i + 8);
                s.paint([c[0] * k, c[1] * k, c[2] * k], 0).fx(0);
                s.quad([0.3, 0, z0], [0.3, 0, z0 + 1], [0.2, h, z0 + 1], [0.2, h, z0], [0.97, 0.24, 0], [0.55, 0.55, 1, 1]).quad([-0.3, 0, z0 + 1], [-0.3, 0, z0], [-0.2, h, z0], [-0.2, h, z0 + 1], [-0.97, 0.24, 0], [0.55, 0.55, 1, 1]);
                for (let j = 0; j < 2; j++) s.paint(lerp3(C.darkStone, [170, 164, 154], r(i * 2 + j + 12)), 0).box((r(i + j) - 0.5) * 0.05, h + 0.07, z0 + 0.25 + j * 0.5, 0.22, 0.09 + 0.04 * r(i + j + 20), 0.23, 0.8);
            }
        }
        else if (kind === 'well') {
            s.course(true).paint(C.stone, 0).fx(0).prism(8, 0, 0, 0, 1.0, 0.85, 1.0, { flat: true }).course(false).paint([40, 60, 80], 0).prism(8, 0, 0.7, 0, 0.82, 0.71, 0.82, { cap: true });
            s.paint(C.plank, 0).box(-0.9, 1.4, 0, 0.07, 0.75, 0.07).box(0.9, 1.4, 0, 0.07, 0.75, 0.07).box(0, 1.9, 0, 0.9, 0.05, 0.05, 1);
            s.paint(C.white, 5).prism(4, 0, 2.1, 0, 1.5, 2.9, 0, { turn: 0.785, flat: true, squash: 0.75 });
        } else if (kind === 'fountain') {
            s.paint(C.stone, 0).fx(0).prism(10, 0, 0, 0, 2.6, 0.7, 2.6, { flat: true }).paint([60, 130, 170], 0).fx(0, 0, 0).prism(10, 0, 0.55, 0, 2.35, 0.56, 2.35, { cap: true });
            s.paint(C.stone, 0).prism(6, 0, 0.5, 0, 0.42, 2.0, 0.3).prism(8, 0, 2.0, 0, 0.3, 2.2, 1.0).paint([60, 130, 170], 0).prism(8, 0, 2.15, 0, 0.9, 2.16, 0.9, { cap: true });
            s.paint(C.gold, 0).blob(0, 2.75, 0, 0.26, 0.5, 0.26, { segs: 5, lump: 0.1 });
        } else if (kind === 'stall') {
            s.paint(C.plank, 0).fx(0).box(0, 0.5, 0, 1.3, 0.5, 0.55, 0.7);
            for (const [x, z] of [[-1.3, -0.6], [1.3, -0.6], [-1.3, 0.75], [1.3, 0.75]]) s.box(x, 1.2, z, 0.05, 1.2, 0.05, 0.8);
            // A striped awning.
            for (let i = 0; i < 6; i++) { const x0 = -1.55 + i * 3.1 / 6, x1 = x0 + 3.1 / 6; s.paint(i % 2 ? [248, 240, 226] : C.white, i % 2 ? 0 : 3).fx(0, 0, 40).quad([x0, 2.2, 0.95], [x1, 2.2, 0.95], [x1, 2.62, -0.75], [x0, 2.62, -0.75]); }
            s.fx(0);
            // What it sells: fruit, loaves, bolts of cloth, pots, or fish on ice.
            if (variant === 0) for (let i = 0; i < 6; i++) s.paint(BRIGHT[i % 6], 0).blob(-1.0 + i * 0.4, 1.08, 0.1 * (i % 2 ? 1 : -1), 0.17, 0.13, 0.17, { segs: 5, bands: 2, seed: i });
            else if (variant === 1) for (let i = 0; i < 5; i++) s.paint([206 - 14 * (i % 2), 150, 84], 0).blob(-0.9 + i * 0.45, 1.07, 0.05 * (i % 2 ? 1 : -1), 0.2, 0.1, 0.13, { segs: 5, bands: 2, seed: i, lump: 0.1 });
            else if (variant === 2) for (let i = 0; i < 5; i++) s.paint(BRIGHT[(i * 2 + 1) % 6], 0).box(-1.0 + i * 0.5, 1.09 + 0.05 * (i % 2), 0, 0.2, 0.09 + 0.05 * (i % 2), 0.42, 0.9);
            else if (variant === 3) for (let i = 0; i < 5; i++) s.paint(i % 2 ? [170, 104, 70] : [120, 132, 150], 0).prism(6, -1.0 + i * 0.5, 1.0, 0.05, 0.1, 1.24 + 0.1 * (i % 3), 0.16, { cap: true });
            else { s.paint([226, 236, 244], 0).box(0, 1.03, 0, 1.2, 0.04, 0.45, 1); for (let i = 0; i < 6; i++) s.paint([150 + 20 * (i % 2), 170, 186], 0).blob(-1.0 + i * 0.4, 1.1, 0.08 * (i % 2 ? 1 : -1), 0.19, 0.05, 0.08, { segs: 5, bands: 2, lump: 0 }); }
            s.paint(C.plank, 0).box(1.75, 0.22, 0.3, 0.26, 0.22, 0.26, 0.6);
        } else if (kind === 'clutter') {
            // What stands by a door: a barrel or two, a crate, a sack.
            const barrel = (x, z, h = 0.86) => { s.paint([150, 110, 74], 0).fx(0).prism(7, x, 0, z, 0.3, h, 0.3, { foot: 0.55, cap: true }); s.paint(C.iron, 0).prism(7, x, h * 0.28, z, 0.315, h * 0.36, 0.315).prism(7, x, h * 0.7, z, 0.315, h * 0.78, 0.315); };
            const crate = (x, y, z, k = 0.3) => s.paint([176 - 20 * r(x), 136, 92], 0).fx(0).box(x, y + k, z, k, k, k, 0.6, [[150, 112, 76], 0]);
            const sack = (x, z) => s.paint([196, 176, 136], 0).fx(0).blob(x, 0.26, z, 0.3, 0.34, 0.26, { segs: 5, bands: 3, seed: variant + x, lump: 0.12, under: 0.5 });
            if (variant === 0) { barrel(0, 0); barrel(0.66, 0.1, 0.8); crate(-0.7, 0, 0.05); }
            else if (variant === 1) { crate(0, 0, 0, 0.34); crate(0.05, 0.68, 0.03, 0.26); sack(0.75, 0.1); sack(-0.7, 0.05); }
            else { barrel(0.1, 0); sack(-0.6, 0.12); sack(0.75, 0.15); crate(-0.1, 0, 0.72, 0.24); }
        } else if (kind === 'planter') {
            s.paint([150, 112, 76], 0).fx(0).box(0, 0.22, 0, 0.5, 0.22, 0.26, 0.6);
            s.paint([84, 142, 66], 0).fx(40).blob(0, 0.56, 0, 0.5, 0.26, 0.28, { segs: 6, bands: 2, seed: variant, lump: 0.2 });
            for (let i = 0; i < 4; i++) s.paint(C.white, 3).fx(60).blob(-0.36 + i * 0.24, 0.72 + 0.04 * (i % 2), 0.06 * (i % 2 ? 1 : -1), 0.08, 0.06, 0.08, { segs: 4, bands: 2, lump: 0, under: 1 });
        } else if (kind === 'board') {
            s.paint(C.plank, 0).fx(0).box(-0.7, 0.9, 0, 0.05, 0.95, 0.05, 0.6).box(0.7, 0.9, 0, 0.05, 0.95, 0.05, 0.6).box(0, 1.3, 0, 0.72, 0.5, 0.03, 1);
            s.paint(C.white, 5).quad([-0.85, 1.86, 0.2], [0.85, 1.86, 0.2], [0.85, 2.0, -0.14], [-0.85, 2.0, -0.14]);
            for (const [x, y, k] of [[-0.4, 1.42, 0], [0.1, 1.5, 1], [0.42, 1.18, 0], [-0.2, 1.08, 1]]) s.paint(k ? [244, 236, 214] : [226, 214, 184], 0).fx(0, 0, 6).quad([x - 0.15, y - 0.17, 0.04], [x + 0.15, y - 0.17, 0.04], [x + 0.15, y + 0.17, 0.04], [x - 0.15, y + 0.17, 0.04], [0, 0, 1]);
        } else if (kind === 'washing') {
            // A line between two walls (x from -1 to 1, stamped to the gap), with the wash on it.
            s.paint(C.rope, 0).fx(0);
            for (let i = 0; i < 4; i++) { const x0 = -1 + i / 2, x1 = x0 + 0.5, y0 = 3.3 + 0.25 * x0 * x0, y1 = 3.3 + 0.25 * x1 * x1; s.quad([x0, y0, 0], [x1, y1, 0], [x1, y1 + 0.03, 0], [x0, y0 + 0.03, 0], [0, 0, 1]); }
            for (let i = 0; i < 5; i++) { const x = -0.76 + i * 0.38, y = 3.3 + 0.25 * x * x, hang = 0.5 + 0.35 * r(i); s.paint(i % 2 ? [244, 240, 230] : BRIGHT[(i + variant) % 6], 0).fx(0, 0, 110).quad([x - 0.075, y - hang, 0], [x + 0.075, y - hang, 0], [x + 0.075, y, 0], [x - 0.075, y, 0], [0, 0, 1], [0.8, 0.8, 1, 1]); }
        } else if (kind === 'bench') { s.paint(C.plank, 0).fx(0).box(0, 0.45, 0, 0.9, 0.04, 0.22, 1).box(-0.75, 0.22, 0, 0.05, 0.22, 0.2).box(0.75, 0.22, 0, 0.05, 0.22, 0.2).box(0, 0.8, -0.2, 0.9, 0.2, 0.03, 1); }
        else if (kind === 'cart') {
            s.paint(C.plank, 0).fx(0).box(0, 0.85, 0, 0.75, 0.08, 1.3, 0.8).box(0.75, 1.1, 0, 0.04, 0.26, 1.3).box(-0.75, 1.1, 0, 0.04, 0.26, 1.3).box(0, 1.1, -1.3, 0.75, 0.26, 0.04);
            for (const x of [-0.86, 0.86]) s.stamp(fixed('wheel'), mul(move(x, 0.6, 0.2), rotZ(Math.PI / 2)));
            s.paint(C.plank, 0).box(-0.5, 0.75, 2.2, 0.04, 0.04, 1.0, 1).box(0.5, 0.75, 2.2, 0.04, 0.04, 1.0, 1);
            s.paint(variant < 0.5 ? C.straw : [150, 110, 80], 0).blob(0, 1.3, -0.1, 0.66, 0.5, 1.15, { seed: variant, lump: 0.12 });
        } else if (kind === 'bunting') {
            // A line of pennants across the street, in the model's x, sagging; stamped at the right width.
            for (let i = 0; i < 9; i++) { const x = -1 + (i + 0.5) / 9 * 2, y = 5.4 + 0.5 * (x * x) - 0.5; s.paint(BRIGHT[i % 6], 0).fx(0, 0, 150).tri([x - 0.085, y, 0], [x + 0.085, y, 0], [x, y - 0.55, 0], [0, 0, 1], [1, 1, 0.8]); }
            s.paint(C.rope, 0).fx(0);
            for (let i = 0; i < 6; i++) { const x0 = -1 + i / 3, x1 = x0 + 1 / 3, y0 = 5.4 + 0.5 * x0 * x0 - 0.5, y1 = 5.4 + 0.5 * x1 * x1 - 0.5; s.quad([x0, y0, 0], [x1, y1, 0], [x1, y1 + 0.04, 0], [x0, y0 + 0.04, 0], [0, 0, 1]); }
            for (const x of [-1, 1]) s.paint(C.plank, 0).prism(4, x, 0, 0, 0.012, 5.45, 0.008);
        } else if (kind === 'stone') { s.paint(C.darkStone, 0).fx(0).prism(5, 0, -0.3, 0, 0.62, 1, 0.4, { cap: true, flat: true, dx: (r(1) - 0.5) * 0.3, squash: 0.6 }); s.paint(C.moss, 0).blob(0.2, 0.0, 0.2, 0.4, 0.12, 0.3, { seed: variant }); }
        else if (kind === 'cairn') { for (let i = 0; i < 5; i++) s.paint(lerp3(C.stone, C.darkStone, r(i)), 0).fx(0).blob((r(i + 3) - 0.5) * 0.12, 0.2 + i * 0.36, 0, 0.62 - i * 0.1, 0.22, 0.56 - i * 0.09, { seed: i + variant, lump: 0.2, segs: 5, under: 0.5 }); }
        else if (kind === 'camp') {
            // A ring of stones, the wood laid in it, a log to sit on, and a bedroll.
            for (let i = 0; i < 7; i++) { const a = i / 7 * TAU; s.paint(C.stone, 0).fx(0).blob(Math.sin(a) * 0.55, 0.08, Math.cos(a) * 0.55, 0.17, 0.13, 0.17, { seed: i, lump: 0.25, segs: 5, bands: 2 }); }
            for (let i = 0; i < 3; i++) { const a = i * 2.1; s.paint(C.bark, 0).prism(5, Math.sin(a) * 0.3, 0.05, Math.cos(a) * 0.3, 0.08, 0.5, 0.06, { dx: -Math.sin(a) * 0.3, dz: -Math.cos(a) * 0.3 }); }
            s.paint(C.trunk, 0).box(-1.5, 0.22, 0, 0.22, 0.22, 0.9, 0.7, [C.plank, 0]);
            s.paint(BRIGHT[1], 0).blob(0.4, 0.14, -1.7, 0.9, 0.14, 0.34, { seed: 2, lump: 0.05 });
        } else if (kind === 'tent') {
            s.paint(C.white, 3).fx(0, 0, 14).quad([-1.2, 0, -1.3], [-1.2, 0, 1.3], [0, 1.6, 1.3], [0, 1.6, -1.3]).quad([1.2, 0, 1.3], [1.2, 0, -1.3], [0, 1.6, -1.3], [0, 1.6, 1.3]);
            s.paint([60, 50, 46], 0).fx(0).tri([-1.2, 0, -1.3], [0, 1.6, -1.3], [1.2, 0, -1.3]);
        } else if (kind === 'boat') {
            s.paint(C.plank, 0).fx(0);
            const rib = (z, hw, y) => [[-hw, y, z], [hw, y, z], [0, -0.28, z]];
            const ribs = [rib(-1.7, 0.42, 0.34), rib(-0.6, 0.72, 0.3), rib(0.7, 0.66, 0.3), rib(1.9, 0.05, 0.5)];
            for (let i = 0; i < 3; i++) { const a = ribs[i], b = ribs[i + 1]; s.quad(a[2], b[2], b[1], a[1]).quad(b[2], a[2], a[0], b[0]); s.paint([120, 90, 62], 0).quad(a[0], a[1], b[1], b[0], [0, 1, 0]); s.paint(C.plank, 0); }
            s.tri(ribs[0][0], ribs[0][2], ribs[0][1]);
            s.paint(bright(variant), 0).box(0, 0.36, 0, 0.74, 0.03, 0.12, 1);
        } else if (kind === 'sail') {
            s.paint(C.plank, 0).fx(0).prism(4, 0, 0, 0.3, 0.05, 3.6, 0.03);
            s.paint([246, 238, 220], 0).fx(0, 0, 50).tri([0, 0.7, 0.24], [0, 3.5, 0.3], [0, 0.8, -1.6], [1, 0, 0]).tri([0, 0.7, 0.24], [0, 0.8, -1.6], [0, 3.5, 0.3], [-1, 0, 0]);
        } else if (kind === 'jetty') {
            s.paint(C.plank, 0).fx(0).box(0, 0.42, 7, 0.9, 0.06, 7.2, 1);
            for (let z = 1; z < 15; z += 3.2) for (const x of [-0.85, 0.85]) s.paint(C.trunk, 0).prism(5, x, -2.2, z, 0.11, 0.75, 0.1);
        } else if (kind === 'bridge') {
            // A stone arch, 22 m long, the road 4.6 m wide between parapets; its deck humps a little.
            const hump = z => 0.45 * Math.cos(z / 11 * Math.PI / 2), arch = z => -0.5 - 2.4 * (1 - Math.sqrt(Math.max(0, 1 - (z / 6.6) ** 2)));
            s.course(true);
            for (let i = 0; i < 12; i++) {
                const z0 = -11 + i * 22 / 12, z1 = z0 + 22 / 12, y0 = hump(z0), y1 = hump(z1);
                s.paint(C.cobble, 0).fx(0).quad([-2.3, y0, z0], [-2.3, y1, z1], [2.3, y1, z1], [2.3, y0, z0], [0, 1, 0]);
                for (const x of [-2.3, 2.3]) {
                    const u0 = Math.abs(z0) < 6.6 ? arch(z0) : -4, u1 = Math.abs(z1) < 6.6 ? arch(z1) : -4, n = [Math.sign(x), 0, 0];
                    s.paint(i % 2 ? C.stone : [146, 142, 138], 0).quad([x, u0, z0], [x, u1, z1], [x, y1 + 0.75, z1], [x, y0 + 0.75, z0], n, [0.55, 0.55, 1, 1]);
                    s.quad([x - Math.sign(x) * 0.34, y0, z0], [x - Math.sign(x) * 0.34, y1, z1], [x - Math.sign(x) * 0.34, y1 + 0.75, z1], [x - Math.sign(x) * 0.34, y0 + 0.75, z0], [-n[0], 0, 0]);
                    s.paint([176, 172, 164], 0).quad([x - Math.sign(x) * 0.34, y0 + 0.75, z0], [x - Math.sign(x) * 0.34, y1 + 0.75, z1], [x, y1 + 0.75, z1], [x, y0 + 0.75, z0], [0, 1, 0]);
                }
                const u0 = Math.abs(z0) < 6.6 ? arch(z0) : -4, u1 = Math.abs(z1) < 6.6 ? arch(z1) : -4;
                if (Math.abs(z0 + 11 / 12) < 6.6) s.paint(C.darkStone, 0).quad([-2.3, u0, z0], [2.3, u0, z0], [2.3, u1, z1], [-2.3, u1, z1], null, [0.5, 0.5, 0.5, 0.5]);
            }
            for (const z of [-11, 11]) for (const x of [-2.3, 2.3]) s.paint(C.stone, 0).box(x - Math.sign(x) * 0.17, 0.6, z, 0.3, 0.7, 0.3, 0.8, [[176, 172, 164], 0]);
            s.course(false);
        } else if (kind === 'wheel') {
            // A felloe in an iron tyre, eight spokes and a hub. Its axle is y.
            const rim = [];
            for (let i = 0; i <= 12; i++) { const a = i / 12 * TAU; rim.push([Math.sin(a) * 0.55, 0, Math.cos(a) * 0.55, 0.055, 1.25]); }
            s.paint(C.timber, 0).fx(0).tube(rim, 5, { ref: [0, 1, 0], k: i => i % 2 ? 0.86 : 1 });
            for (let i = 0; i < 8; i++) { const a = (i + 0.5) / 8 * TAU; s.paint(i % 2 ? C.plank : [130, 96, 66], 0).tube([[Math.sin(a) * 0.08, 0, Math.cos(a) * 0.08, 0.035, 1], [Math.sin(a) * 0.52, 0, Math.cos(a) * 0.52, 0.026, 1]], 4, { ref: [0, 1, 0] }); }
            s.paint(C.timber, 0).prism(8, 0, -0.1, 0, 0.11, 0.1, 0.09, { cap: true }).paint(C.iron, 0).prism(6, 0, 0.1, 0, 0.05, 0.13, 0.04, { cap: true });
        } else if (kind === 'sails') {
            // A windmill's four sails, turning about z.
            for (let i = 0; i < 4; i++) {
                const m = rotZ(i * Math.PI / 2), p = (x, y, z) => [m[0] * x + m[1] * y, m[4] * x + m[5] * y, z];
                s.paint(C.plank, 0).fx(0).quad(p(-0.08, 0, 0.1), p(0.08, 0, 0.1), p(0.08, 7.4, 0.1), p(-0.08, 7.4, 0.1), [0, 0, 1]);
                s.paint([240, 232, 212], 0).quad(p(0.1, 1.4, 0.06), p(1.5, 1.4, 0.06), p(1.5, 7.2, 0.06), p(0.1, 7.2, 0.06), [0, 0, 1]).quad(p(1.5, 1.4, 0.04), p(0.1, 1.4, 0.04), p(0.1, 7.2, 0.04), p(1.5, 7.2, 0.04), [0, 0, -1]);
            }
            s.paint(C.timber, 0).box(0, 0, 0.1, 0.3, 0.3, 0.3, 1);
        } else if (kind === 'fire') {
            for (let i = 0; i < 3; i++) { const a = i * 2.1; s.paint([255, 150 + 40 * i, 60], 0).fx(0, 255, 120).prism(4, Math.sin(a) * 0.12, 0.05, Math.cos(a) * 0.12, 0.2, 0.75 + 0.2 * i, 0, { turn: a }); }
        }
    });

    // Big buildings, each built to its own measure.
    // A tower: round, or (square) four-sided; ruined, or under a roof. grand: its parapet stands out on corbels;
    // tall or spire: a longer roof; skirt: metres more of it below the ground it is given; lite: for a long way off.
    function tower(s, o) {
        const h = o.h, r = o.r, top = o.ruined ? h * 0.8 : h, sq = !!o.square, lite = !!o.lite, sides = sq ? 4 : lite ? 6 : 8, turn = sq ? 0.7854 : 0, R = sq ? r * 1.3 : r;
        s.course(true).paint(C.stone, 0).fx(0).prism(sides, 0, -1.5 - (o.skirt || 0), 0, R * 1.08, top, R, { foot: 0.6, turn, flat: sq });
        if (o.ruined) { for (let i = 0; i < 4; i++) s.paint(C.darkStone, 0).box(Math.sin(i * 2.3) * r * 0.8, top + 0.4, Math.cos(i * 2.3) * r * 0.8, 0.5, 0.7 + 0.5 * rnd(o.v, i), 0.5, 1); s.course(false); return; }
        if (o.grand) s.paint(C.darkStone, 0).prism(sides, 0, top - 1.4, 0, R, top, R * 1.24, { flat: sq, turn, foot: 0.7 });
        s.paint([176, 172, 164], 0).prism(sides, 0, top, 0, R * 1.22, top + 1.1, R * 1.22, { flat: true, foot: 0.8, turn });
        const rim = R * 1.15 * (sq ? 0.7071 : 1), out = a => sq ? 1 / Math.max(Math.abs(Math.sin(a)), Math.abs(Math.cos(a))) : 1;
        if (!lite) for (let i = 0; i < 8; i++) { const a = (i + 0.5) / 8 * TAU; s.paint(C.stone, 0).box(Math.sin(a) * rim * out(a), top + 1.5, Math.cos(a) * rim * out(a), 0.36, 0.4, 0.36, 1); }
        const roof = o.spire || r * (o.roof === 3 ? 0.9 : o.tall ? 2.9 : 2.1);
        s.paint(C.white, 5).prism(sides, 0, top + 1.0, 0, R * 1.02, top + 1.0 + roof, 0, { foot: 0.75, turn, flat: sq });
        s.course(false);
        for (let k = 0; k < 3; k++) {
            if (lite && k !== 1) continue;
            const a = sq ? Math.round((o.v * 6 + k * 2.1) / (Math.PI / 2)) * Math.PI / 2 : o.v * 6 + k * 2.1, y = h * (0.35 + 0.22 * k), m = sq ? R * 0.7071 * 1.03 : r * 1.03, w = sq ? 0.4 / m : 0.09, far = 1 / Math.cos(w);
            s.paint(C.glass, 0).fx(0, k === 1 ? 255 : 0).quad([Math.sin(a - w) * m * far, y, Math.cos(a - w) * m * far], [Math.sin(a + w) * m * far, y, Math.cos(a + w) * m * far], [Math.sin(a + w) * m * far, y + 1.2, Math.cos(a + w) * m * far], [Math.sin(a - w) * m * far, y + 1.2, Math.cos(a - w) * m * far], [Math.sin(a), 0, Math.cos(a)]);
        }
        s.fx(0);
        if (o.flag) flag(s, 0, top + 1.0 + roof, 0, 3.2, bright(o.v));
    }
    function flag(s, x, y, z, h, col) {
        s.paint(C.iron, 0).fx(0).prism(4, x, y - 0.2, z, 0.05, y + h, 0.04);
        for (let i = 0; i < 4; i++) {
            const z0 = z + i * 0.55, z1 = z0 + 0.55, k0 = 1 - i * 0.14, k1 = 1 - (i + 1) * 0.14;
            s.paint(col, 0).fx(0, 0, 60 + i * 60);
            s.quad([x, y + h - 1.3 * k0 - 0.05, z0], [x, y + h - 1.3 * k1 - 0.05, z1], [x, y + h - 0.05, z1], [x, y + h - 0.05, z0], [1, 0, 0]);
            s.quad([x, y + h - 1.3 * k1 - 0.05, z1], [x, y + h - 1.3 * k0 - 0.05, z0], [x, y + h - 0.05, z0], [x, y + h - 0.05, z1], [-1, 0, 0]);
        }
        s.fx(0);
    }
    // A length of city wall from (0,0,0) to (0,0,len), 11 m high, with a walk and merlons.
    // (A grand city's is higher and thicker, with a string course and arrow loops on its outer face, +x.)
    function wall(s, len, drop0, drop1, grand = false, lite = false) {
        const H = grand ? 13.4 : 10.6, T = grand ? 1.5 : 1.1;
        s.course(true).paint(C.stone, 0).fx(0);
        s.quad([T, -3 + drop0, 0], [T, -3 + drop1, len], [T, H + drop1, len], [T, H + drop0, 0], [1, 0, 0], [0.6, 0.6, 1, 1]);
        s.quad([-T, -3 + drop1, len], [-T, -3 + drop0, 0], [-T, H + drop0, 0], [-T, H + drop1, len], [-1, 0, 0], [0.6, 0.6, 1, 1]);
        s.paint([176, 172, 164], 0).quad([-T, H + drop0, 0], [T, H + drop0, 0], [T, H + drop1, len], [-T, H + drop1, len], [0, 1, 0]);
        const n = Math.max(2, Math.round(len / 2.4));
        // (From a way off the battlements are a low kerb each side; close to, merlons.)
        if (lite) for (const x of [T - 0.2, -T + 0.2]) s.paint(C.stone, 0).box(x, H + (drop0 + drop1) / 2 + 0.3, len / 2, 0.22, 0.3, len / 2, 1);
        else for (let i = 0; i < n; i += 2) { const z = (i + 0.5) / n * len, d = drop0 + (drop1 - drop0) * z / len; for (const x of [T - 0.2, -T + 0.2]) s.paint(C.stone, 0).box(x, H + d + 0.5, z, 0.22, 0.5, len / n * 0.5, 1); }
        if (grand && !lite) {
            const d = (drop0 + drop1) / 2;
            s.paint([176, 172, 164], 0).box(T + 0.1, H - 1.3 + d, len / 2, 0.16, 0.18, len / 2, 1);
            s.course(false);
            for (let z = 2.2; z < len - 1; z += 4.4) s.paint([40, 36, 40], 0).quad([T + 0.02, H - 5.2 + d, z - 0.1], [T + 0.02, H - 5.2 + d, z + 0.1], [T + 0.02, H - 3.5 + d, z + 0.1], [T + 0.02, H - 3.5 + d, z - 0.1], [1, 0, 0]);
        }
        s.course(false);
    }
    function gate(s, o) {
        // Two drum towers and the arch between them; the road runs through along z.
        for (const x of [-1, 1]) (tower(s.at(move(x * 6.4, 0, 0)), { h: 17.5, r: 3.3, roof: 1, v: o.v + x, flag: true }), s.at(null));
        s.course(true).paint(C.stone, 0).fx(0);
        s.box(0, 10.4, 0, 3.6, 3.4, 1.5, 1, [[176, 172, 164], 0]);
        for (let i = 0; i < 6; i++) {                              // the arch's underside, in steps
            const a0 = i / 6 * Math.PI, a1 = (i + 1) / 6 * Math.PI, p = a => [-Math.cos(a) * 3.3, 4.2 + Math.sin(a) * 2.9];
            const [x0, y0] = p(a0), [x1, y1] = p(a1);
            s.paint(C.darkStone, 0).quad([x0, y0, -1.5], [x0, y0, 1.5], [x1, y1, 1.5], [x1, y1, -1.5], null, [0.5, 0.5, 0.5, 0.5]);
            for (const z of [-1.5, 1.5]) s.paint(C.stone, 0).quad([x0, y0, z], [x1, y1, z], [x1, 7.2, z], [x0, 7.2, z], [0, 0, Math.sign(z)]);
        }
        for (const x of [-3.45, 3.45]) s.paint(C.stone, 0).box(x, 2.1, 0, 0.16, 2.2, 1.5, 0.7);
        for (let i = 0; i < 5; i++) s.box(-2.9 + i * 1.45, 14.2, 1.2, 0.36, 0.45, 0.3, 1).box(-2.9 + i * 1.45, 14.2, -1.2, 0.36, 0.45, 0.3, 1);
        // Banners hang either side of the arch.
        s.course(false);
        for (const x of [-2.4, 2.4]) for (const z of [-1.56, 1.56]) s.paint(bright(o.v), 0).fx(0, 0, 26).quad([x - 0.55, 7.6, z], [x + 0.55, 7.6, z], [x + 0.55, 12.6, z], [x - 0.55, 12.6, z], [0, 0, Math.sign(z)], [0.8, 0.8, 1, 1]);
        s.fx(0);
    }
    function big(s, item) {
        const v = item.v || 0, out = { smoke: null, glow: [] };
        // A grand city's own pieces are WayDetail's.
        if (item.k !== 'gate' || item.grand) { const got = WayDetail.big(s, item); if (got) return got; }
        s.course(item.k === 'keep' || item.k === 'castle' || item.k === 'ruin' || item.k === 'abbey');
        if (item.k === 'tower') tower(s, item);
        else if (item.k === 'gate') gate(s, item);
        else if (item.k === 'chapel') {
            const h = house(s, { w: 7, dp: 11, floors: 1, roof: 2, v, endOn: true, stone: true, doorX: 0 });
            out.glow = h.glow;
            (tower(s.at(move(0, 0, -7.6)), { h: 12, r: 2.1, roof: 2, v }), s.at(null));
        } else if (item.k === 'keep') {
            s.paint(C.stone, 0).fx(0).box(0, 13, 0, 7.5, 16, 7.5, 0.55, [[176, 172, 164], 0]);
            for (let i = 0; i < 6; i++) for (const [x, z] of [[-6 + i * 2.4, 7.3], [-6 + i * 2.4, -7.3], [7.3, -6 + i * 2.4], [-7.3, -6 + i * 2.4]]) s.box(x, 29.5, z, 0.5, 0.55, 0.5, 1);
            for (const [x, z] of [[-7.5, -7.5], [7.5, -7.5], [-7.5, 7.5], [7.5, 7.5]]) (tower(s.at(move(x, 0, z)), { h: 31 + 4 * rnd(v, x + z), r: 2.9, roof: 2, v: v + x * 0.1 + z * 0.01, flag: x * z > 0 }), s.at(null));
            for (let f = 0; f < 3; f++) for (let i = 0; i < 3; i++) { const x = -4 + i * 4, y = 8 + f * 6; s.paint(C.glass, 0).fx(0, rnd(v, f * 3 + i) < 0.6 ? 255 : 0).quad([x - 0.45, y, 7.54], [x + 0.45, y, 7.54], [x + 0.45, y + 1.7, 7.54], [x - 0.45, y + 1.7, 7.54], [0, 0, 1]); if (rnd(v, f * 3 + i) < 0.6) out.glow.push([x, y + 0.8, 7.7]); }
            s.fx(0);
            for (const x of [-2.6, 2.6]) s.paint(bright(v), 0).fx(0, 0, 22).quad([x - 0.9, 14, 7.6], [x + 0.9, 14, 7.6], [x + 0.9, 27, 7.6], [x - 0.9, 27, 7.6], [0, 0, 1], [0.8, 0.8, 1, 1]);
            s.fx(0);
        } else if (item.k === 'spire') {
            const h = house(s, { w: 10, dp: 20, floors: 2, roof: 2, v, endOn: true, stone: true, doorX: 0 });
            out.glow = h.glow;
            s.paint(C.stone, 0).fx(0).box(0, 10, -12.5, 3.2, 11.5, 3.2, 0.6);
            s.paint(C.white, 5).prism(4, 0, 21.5, -12.5, 4.4, 47, 0, { turn: 0.785, flat: true, foot: 0.75 });
            for (const [x, z] of [[-3, -9.4], [3, -9.4], [-3, -15.6], [3, -15.6]]) s.paint(C.white, 5).prism(4, x, 21.5, z, 0.8, 26, 0, { turn: 0.785, flat: true });
            for (const sx of [-1, 1]) { s.paint([255, 220, 150], 0).fx(0, 255).quad([sx * 3.24, 15, -13.3], [sx * 3.24, 15, -11.7], [sx * 3.24, 19, -11.7], [sx * 3.24, 19, -13.3], [sx, 0, 0]); }
            s.paint([120, 170, 230], 0).fx(0, 255).prism(8, 0, 8.2, 10.12, 1.5, 8.21, 0, { squash: 0.01 });
            s.fx(0);
            out.glow.push([0, 17, -9]);
        } else if (item.k === 'castle') {
            s.paint(C.stone, 0).fx(0).box(0, 5, 0, 13, 6.5, 10, 0.6, [[176, 172, 164], 0]);
            s.box(2, 13, -1, 5, 8, 5, 0.9, [[176, 172, 164], 0]);
            for (const [x, z, h] of [[-13, -10, 17], [13, -10, 19], [-13, 10, 16], [13, 10, 21], [2, -1, 30], [-5, 3, 24]]) (tower(s.at(move(x, 0, z)), { h, r: h > 22 ? 3.2 : 2.6, roof: 2, v: v + h, flag: h > 18 }), s.at(null));
            for (let i = 0; i < 6; i++) { const x = -9 + i * 3.6, lit = rnd(v, i) < 0.6; s.paint(C.glass, 0).fx(0, lit ? 255 : 0).quad([x - 0.4, 6, 10.05], [x + 0.4, 6, 10.05], [x + 0.4, 8, 10.05], [x - 0.4, 8, 10.05], [0, 0, 1]); if (lit) out.glow.push([x, 7, 10.3]); }
            s.fx(0);
        } else if (item.k === 'mill') {
            s.paint(C.white, 1).fx(0).prism(8, 0, -1, 0, 3.6, 10.5, 2.5, { foot: 0.6 });
            s.paint(C.white, 5).prism(8, 0, 10.4, 0, 2.9, 13.2, 0.2, { foot: 0.75 });
            s.paint(C.white, 3).quad([-0.5, 0.2, 3.5], [0.5, 0.2, 3.5], [0.5, 2.2, 3.35], [-0.5, 2.2, 3.35]);
            s.paint(C.glass, 0).fx(0, 255).quad([-0.35, 5.2, 3.02], [0.35, 5.2, 3.02], [0.35, 6.2, 2.93], [-0.35, 6.2, 2.93]);
            s.fx(0).paint(C.timber, 0).box(0, 9.6, 2.9, 0.22, 0.22, 0.8, 1);
            out.glow.push([0, 5.7, 3.2]);
        } else if (item.k === 'lighthouse') {
            for (let k = 0; k < 4; k++) s.paint(k % 2 ? [198, 70, 60] : [244, 240, 232], 0).fx(0).prism(8, 0, k * 4.5 - (k ? 0 : 2), 0, 3.2 - k * 0.4, k * 4.5 + 4.5, 2.8 - k * 0.4, { foot: k ? 1 : 0.6 });
            s.paint(C.iron, 0).prism(8, 0, 18, 0, 2.3, 18.3, 2.3, { cap: true, flat: true });
            s.paint([255, 236, 170], 0).fx(0, 255).prism(8, 0, 18.3, 0, 1.2, 20.2, 1.2);
            s.fx(0).paint(C.white, 5).prism(8, 0, 20.2, 0, 1.7, 21.8, 0);
        } else if (item.k === 'ruin' || item.k === 'abbey') {
            // What is left: a run of arches, a broken wall, fallen stones.
            const n = item.k === 'abbey' ? 5 : 2;
            for (let i = 0; i <= n; i++) {
                const x = (i - n / 2) * 3.4, h = 5.6 - 2.5 * rnd(v, i) * (i % 2);
                s.paint(lerp3(C.stone, C.moss, 0.2 * rnd(v, i + 9)), 0).fx(0).box(x, h / 2 - 0.5, 0, 0.5, h / 2 + 0.5, 0.55, 0.6);
                if (i < n && rnd(v, i + 20) < 0.75) for (let k = 0; k < 5; k++) { const a0 = k / 5 * Math.PI, a1 = (k + 1) / 5 * Math.PI; s.paint(C.stone, 0).quad([x + 1.7 - Math.cos(a0) * 1.25, 4.2 + Math.sin(a0) * 1.25, 0.5], [x + 1.7 - Math.cos(a1) * 1.25, 4.2 + Math.sin(a1) * 1.25, 0.5], [x + 1.7 - Math.cos(a1) * 1.7, 4.2 + Math.sin(a1) * 1.9, 0.5], [x + 1.7 - Math.cos(a0) * 1.7, 4.2 + Math.sin(a0) * 1.9, 0.5], [0, 0, 1]).quad([x + 1.7 - Math.cos(a1) * 1.25, 4.2 + Math.sin(a1) * 1.25, -0.5], [x + 1.7 - Math.cos(a0) * 1.25, 4.2 + Math.sin(a0) * 1.25, -0.5], [x + 1.7 - Math.cos(a0) * 1.7, 4.2 + Math.sin(a0) * 1.9, -0.5], [x + 1.7 - Math.cos(a1) * 1.7, 4.2 + Math.sin(a1) * 1.9, -0.5], [0, 0, -1]).quad([x + 1.7 - Math.cos(a0) * 1.25, 4.2 + Math.sin(a0) * 1.25, -0.5], [x + 1.7 - Math.cos(a1) * 1.25, 4.2 + Math.sin(a1) * 1.25, -0.5], [x + 1.7 - Math.cos(a1) * 1.25, 4.2 + Math.sin(a1) * 1.25, 0.5], [x + 1.7 - Math.cos(a0) * 1.25, 4.2 + Math.sin(a0) * 1.25, 0.5], null, [0.5, 0.5, 0.5, 0.5]); }
            }
            if (item.k === 'ruin') (tower(s.at(move(-6, 0, -3)), { h: 12, r: 2.9, v, ruined: true }), s.at(null));
            for (let i = 0; i < 6; i++) s.paint(C.darkStone, 0).blob((rnd(v, i + 40) - 0.5) * 16, 0.2, 2 + rnd(v, i + 50) * 5, 0.6, 0.4, 0.5, { seed: i, lump: 0.3, segs: 5, under: 0.5 });
        } else if (item.k === 'elder') {
            // A tree older than the road, with a door in it and lanterns in its boughs.
            s.paint(C.bark, 2).fx(0).prism(9, 0, -1, 0, 3.0, 9, 1.7, { foot: 0.55 });
            for (let i = 0; i < 5; i++) { const a = i * 1.26; s.paint(C.bark, 2).prism(5, Math.sin(a) * 2.2, -0.6, Math.cos(a) * 2.2, 1.1, 2.4, 0.3, { dx: -Math.sin(a) * 0.9, dz: -Math.cos(a) * 0.9 }); }
            for (let i = 0; i < 7; i++) { const a = i * 0.9 + v * 6, d = i ? 4.6 : 0; s.paint(C.white, 1).fx(40).blob(Math.sin(a) * d, i ? 11 + 2 * rnd(v, i) : 14.5, Math.cos(a) * d, i ? 4.2 : 5.6, i ? 3.0 : 3.6, i ? 4.2 : 5.6, { seed: v + i }); }
            s.fx(0).paint(BRIGHT[0], 0).quad([-0.55, 0, 3.02], [0.55, 0, 3.02], [0.5, 2.0, 2.86], [-0.5, 2.0, 2.86]);
            s.paint(C.glass, 0).fx(0, 255).quad([1.0, 2.7, 2.72], [1.6, 2.7, 2.5], [1.6, 3.4, 2.44], [1.0, 3.4, 2.66]);
            for (let i = 0; i < 4; i++) { const a = i * 1.7 + 0.4, d = 4.4, y = 6.2 + rnd(v, i + 30); s.paint(C.rope, 0).fx(60).prism(3, Math.sin(a) * d, y, Math.cos(a) * d, 0.015, y + 2.6, 0.015); s.paint(C.flame, 0).fx(60, 255).box(Math.sin(a) * d, y, Math.cos(a) * d, 0.14, 0.2, 0.14, 1); out.glow.push([Math.sin(a) * d, y, Math.cos(a) * d]); }
            s.fx(0);
            out.glow.push([1.3, 3, 3]);
            out.smoke = [0.8, 9.5, -0.6];
        }
        s.course(false);
        return out;
    }

    // ---- A square of the world, as triangles -----------------------------------------------------
    const TINT = new Array(8).fill(null);
    // The leaf of a tree here: its season's colour, one of three in autumn, a touch its own.
    function leafTint(kind, season, v) {
        const table = LEAF[kind] || LEAF.oak, pick = e => Array.isArray(e[0]) ? e[Math.floor(v * 2.999)] : e;
        const c = lerp3(pick(table[season.index]), pick(table[season.next]), season.t), k = 0.88 + 0.24 * rnd(v, 3);
        return [c[0] * k, c[1] * k, c[2] * k];
    }

    // The ground's colour at a point, painted: grass by country and season,
    // rock where it is steep, sand by the water, snow where it is cold, and
    // the fields of a farm.
    function groundColour(w, x, z, y, ny, row, season, out) {
        // (Which country a point is in is the world's to say, WayLogic's share: the ground, the trees and the plants agree.)
        const a = GRASS[row.a.biome], b = GRASS[row.b.biome], t = w.share(x, z), si = season.index, sn = season.next, st = season.t;
        const patch = L.noise2(x / 23, z / 23, w.seed + 5), big = L.noise2(x / 90, z / 90, w.seed + 6);
        let r = L.mix(L.mix(a[si][0], a[sn][0], st), L.mix(b[si][0], b[sn][0], st), t), g = L.mix(L.mix(a[si][1], a[sn][1], st), L.mix(b[si][1], b[sn][1], st), t), bl = L.mix(L.mix(a[si][2], a[sn][2], st), L.mix(b[si][2], b[sn][2], st), t);
        const k = 0.8 + 0.26 * patch + 0.14 * big;
        r *= k + 0.22 * (big - 0.5); g *= k; bl *= k - 0.22 * (patch - 0.5);
        const d = (x - row.x) * row.cos, ad = Math.abs(d), farm = L.mix(row.a.biome === 'farm' ? 1 : 0, row.b.biome === 'farm' ? 1 : 0, t), moor = L.mix(row.a.biome === 'moor' ? 1 : 0, row.b.biome === 'moor' ? 1 : 0, t);
        let furrow = 0;
        if (farm > 0.5 && ad > 9 && ad < 240 && !(row.near.radius && Math.hypot(d, row.dz) < row.near.radius * 1.2)) {
            // Fields: strips a furlong long, each its own crop.
            const fi = Math.floor(d / 34), fj = Math.floor((z + fi * 13) / 52), crop = w.hash(fi, fj, 80), edge = Math.min(Math.abs(d / 34 - fi - 0.5), Math.abs((z + fi * 13) / 52 - fj - 0.5));
            if (edge < 0.46) {
                const c = crop < 0.3 ? [222, 190, 96] : crop < 0.5 ? [134, 98, 66] : crop < 0.65 ? [160, 130, 200] : crop < 0.8 ? [120, 176, 60] : [232, 212, 90];
                const k2 = (0.9 + 0.2 * patch) * (season.snow > 0.5 ? 0.9 : 1);
                r = c[0] * k2; g = c[1] * k2; bl = c[2] * k2; furrow = 1;
            }
        }
        // Under the trees in autumn the leaves lie where they fell, in drifts.
        const fallen = (si === 2 ? 1 - st : sn === 2 ? st : 0) * L.mix(row.a.biome === 'deepwood' ? 1 : row.a.biome === 'forest' ? 0.6 : 0, row.b.biome === 'deepwood' ? 1 : row.b.biome === 'forest' ? 0.6 : 0, t) * L.smooth(0.3, 0.62, patch) * 0.7;
        if (fallen > 0) { r = L.mix(r, 184, fallen); g = L.mix(g, 110, fallen); bl = L.mix(bl, 46, fallen); }
        if (moor > 0.3 && patch > 0.6) { const h = moor * L.smooth(0.6, 0.74, patch) * 0.6 * (1 - season.snow); r = L.mix(r, 150, h); g = L.mix(g, 96, h); bl = L.mix(bl, 150, h); }
        // Rock on the steeps; scree and snow in the pass; sand at the water's edge.
        const alpine = L.mix(row.a.biome === 'pass' ? 1 : 0, row.b.biome === 'pass' ? 1 : 0, t), high = y - row.y;
        // Steep ground is rock; in the pass, so is everything well above the road.
        const steep = Math.max(L.smooth(0.8, 0.62, ny + 0.1 * (patch - 0.5)), alpine * L.smooth(14 + 30 * patch, 46 + 40 * patch, high) * L.smooth(0.985, 0.9, ny));
        const rc = alpine > 0.5 ? C.cliff : C.rock, rk = 0.85 + 0.3 * big;
        r = L.mix(r, rc[0] * rk, steep); g = L.mix(g, rc[1] * rk, steep); bl = L.mix(bl, rc[2] * rk, steep);
        const level = w.water(x, z);
        if (level > -1e8) { const s = L.smooth(1.3, 0.25, y - level) * (1 - steep); r = L.mix(r, C.sand[0], s); g = L.mix(g, C.sand[1], s); bl = L.mix(bl, C.sand[2], s); if (y < level) { const u = L.smooth(0, -2.5, y - level); r = L.mix(r, 90, u); g = L.mix(g, 120, u); bl = L.mix(bl, 110, u); } }
        // Snow: all of winter's, and the pass above its road.
        const snow = Math.max(season.snow * 0.92, alpine * L.smooth(60 + 50 * patch, 130 + 60 * big, high)) * L.smooth(0.5, 0.78, ny + 0.15 * patch);
        out[0] = L.mix(r, C.snow[0], snow); out[1] = L.mix(g, C.snow[1], snow); out[2] = L.mix(bl, C.snow[2], snow);
        out[3] = furrow; out[4] = snow;
    }

    // Build the square at (cx, cz) × size metres, `cells` to a side. Far
    // squares are coarse and carry only the big things.
    // Returns { ground, props, water (soups), lights, smokes, spawns, low, high }.
    // detail: 0 the plain models; 1 the fine ones for what stands right by the road; 2 for a wider band.
    const BIGS = new Set(['tower', 'gate', 'chapel', 'keep', 'spire', 'castle', 'mill', 'lighthouse', 'ruin', 'abbey', 'elder', 'citadel', 'ramp', 'cathedral', 'hall', 'markethall', 'cross', 'drawbridge']);
    function square(w, cx, cz, size, cells, far, density = 1, detail = 0) {
        const steps = squareSteps(w, cx, cz, size, cells, far, density, detail);
        for (;;) { const step = steps.next(); if (step.done) return step.value; }
    }
    // The same, a few items at a time: each next() does a little, and the last returns the square.
    function* squareSteps(w, cx, cz, size, cells, far, density = 1, detail = 0) {
        const x0 = cx * size, z0 = cz * size, step = size / cells, G = cells + 3, heights = new Float32Array(G * G), shade = new Float32Array(G * G).fill(1);
        let low = Infinity, high = -Infinity;
        for (let j = 0; j < G; j++) {
            const z = z0 + (j - 1) * step;
            w.at(z);
            for (let i = 0; i < G; i++) { const h = w.ground(x0 + (i - 1) * step, z); heights[j * G + i] = h; if (h < low) low = h; if (h > high) high = h; }
        }
        // What stands here.
        const props = new WaySoup(far ? 2048 : 8192), lights = [], smokes = [], spawns = [], beacons = [];
        const band = detail > 1 ? 18 : 9;
        const items = [];
        const per = L.CHUNK, across = size / per;
        for (let b = 0; b < across; b++) for (let a = 0; a < across; a++) for (const item of w.scatter(cx * across + a, cz * across + b, far)) items.push(item);
        const temp = new WaySoup(1024);
        const darken = (x, z, radius, by) => {
            const i0 = Math.max(0, Math.floor((x - radius - x0) / step) + 1), i1 = Math.min(G - 1, Math.ceil((x + radius - x0) / step) + 1), j0 = Math.max(0, Math.floor((z - radius - z0) / step) + 1), j1 = Math.min(G - 1, Math.ceil((z + radius - z0) / step) + 1);
            for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const d = Math.hypot(x0 + (i - 1) * step - x, z0 + (j - 1) * step - z); if (d < radius) shade[j * G + i] = Math.min(shade[j * G + i], 1 - by * (1 - d / radius)); }
        };
        yield;
        let done = 0;
        for (const item of items) {
            if (++done % 3 === 0) yield;
            const lx = item.x - x0, lz = item.z - z0, season = w.season(item.z), v = item.v || 0, phase = Math.floor(v * 255);
            if (item.k === 'tree') {
                if (density < 1 && rnd(v, 11) > density + (item.b === 'deepwood' ? -0.05 : item.b === 'grove' ? 0 : 0.15)) continue;     // (the deep forest and the grove have trees to spare)
                const cone = item.kind === 'fir', sc = item.s * (item.kind === 'shroom' ? 1.3 : 1.25);
                TINT[1] = leafTint(item.kind, season, v);
                TINT[2] = null;
                TINT[3] = (BLOOM[item.kind] || BLOOM.apple)[season.t > 0.5 ? season.next : season.index];
                const bare = item.kind === 'snag' || (season.snow > 0.5 && !cone && item.kind !== 'pine' && item.kind !== 'shroom' && item.kind !== 'glade');
                if (far && bare) continue;          // a bare tree is nothing at a distance
                const woods = item.b === 'deepwood' || item.b === 'forest' || item.b === 'grove';
                // (Where the trees stand thick, the fine ones are only those right by the road; the deep forest's fine work is its boughs.)
                const close = !far && detail > 0 && item.b !== 'deepwood' && item.b !== 'grove' && Math.abs(w.lateral(item.x, item.z)) < (woods ? band * 0.5 : band);
                const m = far ? farTree(cone || item.kind === 'poplar') : close ? WayDetail.tree(bare ? 'snag' : item.kind, Math.floor(v * 3)) : tree(bare ? 'snag' : item.kind, Math.floor(v * 3), detail > 1 && !far ? (woods ? 0.6 : 1) : 0);          // (in the thick of the woods, fewer leaves to a crown: there are more crowns)
                props.stamp(m, place(lx, item.y - 0.1, lz, item.yaw, far ? sc * 1.3 : sc, far ? sc * 1.2 : sc * (0.9 + 0.3 * rnd(v, 5))), TINT, Math.max(season.snow, w.cold(item.z)) * 0.6, phase);
                if (!far) { darken(item.x, item.z, 3.4 * sc, 0.34); if (item.kind === 'glade' || item.kind === 'shroom') lights.push([item.x, item.y + 3.5 * sc, item.z, 5, 0.3, 0.9, 0.8, 1]); }
                continue;
            }
            const snow = Math.max(season.snow, w.cold(item.z)) * 0.9;
            if (item.k === 'bough') {
                TINT[1] = leafTint('oak', season, v); TINT[2] = TINT[3] = null;
                const bare = season.snow > 0.5;
                if (far && bare) continue;
                props.stamp(bough(far ? 'far' : bare ? 'bare' : detail > 1 ? 'fine' : 'lite', Math.floor(v * 3)), place(lx, item.y, lz, item.yaw, item.s, item.s * (0.94 + 0.14 * rnd(v, 5))), TINT, snow * 0.6, phase);
                // Under it the road is in shade, with the light coming through between one bough's leaves and the next's.
                if (!far && !bare) darken(item.x + Math.sin(item.yaw) * 5.4 * item.s, item.z + Math.cos(item.yaw) * 5.4 * item.s, 4.6, 0.3);
                continue;
            }
            if (item.k === 'house' || item.k === 'hut' || item.k === 'barn') {
                temp.clear();
                // Far off, and in the back rows of a grand city, a house is its shape, its roof and its lit windows; by the road it is trimmed.
                const lite = far || (item.row >= 2 && !(detail > 1 && item.row < 4)) || (item.row === 1 && detail === 0);
                const got = house(temp, lite ? { ...item, lite: true } : detail > 1 && Math.abs(item.d) < band + 4 ? { ...item, fine: true } : detail > 1 ? { ...item, rich: true } : item), m = place(lx, item.y - 0.25, lz, item.yaw);
                TINT[1] = PLASTER[Math.floor(v * 4.99)]; TINT[2] = lerp3(C.timber, [120, 80, 56], rnd(v, 2)); TINT[3] = BRIGHT[Math.floor(rnd(v, 3) * 5.99)]; TINT[5] = lerp3(ROOFS[item.roof], [255, 255, 255], 0.1 * rnd(v, 4));
                props.stamp(temp, m, TINT, snow, phase, 1);
                
                if (far) continue;
                darken(item.x, item.z, Math.max(item.w, item.dp) * 0.5 + 1.6, 0.5);
                const to = p => [m[0] * p[0] + m[2] * p[2] + item.x, p[1] + item.y - 0.25, m[8] * p[0] + m[10] * p[2] + item.z];
                if (got.smoke && rnd(v, 6) < 0.7) smokes.push(to(got.smoke));
                // One glow for the front's windows, and the door's lantern if it has one.
                const front = got.glow.filter(g => g[2] > 0);
                if (front.length) lights.push([...to([0, 1.9, item.dp / 2 + 0.6]), 4.2 + item.w * 0.3, 1, 0.66, 0.3, 0]);
                if (got.lamp) lights.push([...to(got.lamp), 2.6, 1, 0.7, 0.34, 1]);
                continue;
            }
            if (item.k === 'wall') {
                temp.clear();
                const len = Math.hypot(item.x1 - item.x, item.z1 - item.z), y1 = w.ground(item.x1, item.z1);
                wall(temp, len, 0, y1 - item.y, item.grand, far || detail === 0);
                props.stamp(temp, place(lx, item.y, lz, Math.atan2(item.x1 - item.x, item.z1 - item.z)), null, snow);
                continue;
            }
            if (BIGS.has(item.k)) {
                temp.clear();
                const got = big(temp, far || (detail === 0 && (item.grand || item.k === 'citadel' || item.k === 'cathedral' || item.k === 'hall')) ? { ...item, lite: true } : item), m = place(lx, item.k === 'drawbridge' ? w.bridge(item.z) ?? item.y : item.y - 0.2, lz, item.yaw);
                TINT[1] = item.k === 'elder' ? leafTint('oak', season, v) : PLASTER[1]; TINT[2] = null; TINT[3] = BRIGHT[Math.floor(v * 5.99)]; TINT[5] = lerp3(ROOFS[item.roof ?? 2], [255, 255, 255], 0.08);
                props.stamp(temp, m, TINT, snow, phase);
                const to = p => [m[0] * p[0] + m[2] * p[2] + item.x, p[1] + item.y - 0.2, m[8] * p[0] + m[10] * p[2] + item.z];
                // What a far square keeps of it after dark: a few lights to be seen a long way down the road.
                for (const b of got.beacons || []) beacons.push([...to(b), b[3], b[4], b[5], b[6]]);
                if (far) continue;
                darken(item.x, item.z, 7, 0.3);
                for (const g of got.glow) lights.push([...to(g), 3.4, 1, 0.68, 0.32, item.k === 'elder' ? 1 : 0]);
                if (got.smoke) smokes.push(to(got.smoke));
                if (item.k === 'mill') spawns.push({ kind: 'sails', at: to([0, 9.6, 3.8]), yaw: item.yaw });
                if (item.k === 'lighthouse') { spawns.push({ kind: 'beam', at: to([0, 19.2, 0]) }); lights.push([...to([0, 19.2, 0]), 9, 1, 0.9, 0.6, 1]); }
                continue;
            }
            if (far) continue;
            if (item.k === 'spawn' || item.k === 'folk') { spawns.push(item); continue; }
            // Small and fixed things.
            let m = null, model3 = null, lit = 1;
            TINT[1] = TINT[2] = TINT[3] = TINT[5] = null;
            // Leaves on the ground are autumn's: there only while it lasts.
            if (item.k === 'litter' && (season.index === 2 ? 1 - season.t : season.next === 2 ? season.t : 0) < 0.25) continue;
            if (item.k === 'bush' || item.k === 'tuft' || item.k === 'fern' || item.k === 'flower' || item.k === 'heather' || item.k === 'reed' || item.k === 'litter') {
                if (item.b === 'grove' && item.k !== 'bush' && rnd(v, 15) < 0.35) continue;          // (the grove's floor is thick with them: a third fewer costs nothing to the eye)
                if ((density < 1 && rnd(v, 12) > density) || (season.snow > 0.5 && item.k !== 'bush' && item.k !== 'reed' && rnd(v, 14) < 0.6)) continue;
                const g = GRASS[item.b || 'meadow'], gc = lerp3(g[season.index], g[season.next], season.t);
                TINT[1] = item.k === 'bush' ? leafTint('oak', season, v) : item.k === 'reed' ? [150, 170, 90] : season.snow > 0.5 ? [176, 160, 112] : [gc[0] * 0.92, gc[1] * 0.98, gc[2] * 0.9];
                TINT[3] = item.k === 'litter' ? LEAF.oak[2][Math.floor(v * 2.999)] : item.k === 'heather' ? [150 + 30 * v, 92, 150] : BRIGHT[Math.floor(v * 5.99)];
                model3 = detail > 0 && (item.k === 'bush' ? Math.abs(w.lateral(item.x, item.z)) < (item.b === 'deepwood' ? band * 0.3 : item.b === 'forest' || item.b === 'grove' ? band * 0.5 : band) : (item.k === 'tuft' || item.k === 'flower') && Math.abs(w.lateral(item.x, item.z)) < band / 2) ? WayDetail.small(item.k, Math.floor(v * 3)) : small(item.k, Math.floor(v * 3));
                m = place(lx, item.y, lz, item.yaw, item.s * (item.k === 'reed' ? 1.5 : 1.05));
            } else if (item.k === 'rock') { model3 = detail > 0 && !item.stack ? WayDetail.rock(Math.floor(v * 3)) : small('rock', Math.floor(v * 3)); m = place(lx, item.y, lz, item.yaw, item.s * 1.2, item.stack ? item.s * (1.6 + 1.2 * v) : item.s * 1.2); }
            else if (item.k === 'lily') { model3 = small('lily', Math.floor(v * 3)); m = place(lx, item.y, lz, v * 6, 0.7 + 0.5 * v); }
            else if (item.k === 'shroom') {
                TINT[1] = leafTint('shroom', season, v); TINT[3] = BLOOM.shroom[0];
                model3 = item.tree ? tree('shroom', Math.floor(v * 3)) : small('toadstool', Math.floor(v * 3)); m = place(lx, item.y, lz, v * 6, (item.s || 1) * (item.tree ? 1 : 0.11));
                lit = item.glow ? 1 : 0;
                if (item.glow && (item.tree || rnd(v, 13) < 0.3)) lights.push([item.x, item.y + (item.tree ? 16 : 0.5), item.z, item.tree ? 9 : 1.6, 0.4, 0.9, 0.75, 1]);
            } else if (item.k === 'lamp') {
                model3 = (detail > 0 && WayDetail.fixed('lamp')) || fixed('lamp'); m = place(lx, item.y, lz, item.yaw);
                lights.push([item.x + Math.sin(item.yaw) * 0.5, item.y + 2.45, item.z + Math.cos(item.yaw) * 0.5, 2.4, 1, 0.72, 0.36, 2]);
            } else if (item.k === 'bunting') { model3 = fixed('bunting'); const h = w.heading(item.z); m = mul(place(lx, item.y, lz, h), [item.span / 2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]); }
            else if (item.k === 'stall') { TINT[3] = BRIGHT[Math.floor(v * 5.99)]; model3 = (detail > 0 && WayDetail.fixed('stall', Math.floor(v * 4.99))) || fixed('stall', Math.floor(v * 4.99)); m = place(lx, item.y, lz, item.yaw); darken(item.x, item.z, 2.4, 0.35); }
            else if (item.k === 'well' || item.k === 'fountain') { TINT[5] = ROOFS[1]; model3 = (detail > 0 && WayDetail.fixed(item.k)) || fixed(item.k); m = place(lx, item.y, lz, item.yaw); }
            else if (item.k === 'boat') {
                const level = w.water(item.x, item.z);
                if (level < -1e8 || w.ground(item.x, item.z) > level - 0.3) continue;
                spawns.push({ ...item, kind: 'boat', y: level });
                continue;
            } else if (item.k === 'jetty') { model3 = fixed('jetty'); m = place(lx, w.water(item.x, item.z) > -1e8 ? w.water(item.x, item.z) : item.y, lz, item.yaw + Math.PI); }
            else if (item.k === 'bridge') { model3 = (detail > 0 && WayDetail.fixed('bridge')) || fixed('bridge'); m = place(lx, item.deck, lz, item.yaw); }
            else if (item.k === 'camp') { model3 = fixed('camp'); m = place(lx, item.y, lz, item.yaw + (item.d > 0 ? 0 : Math.PI)); spawns.push({ ...item, kind: 'camp' }); }
            else if (item.k === 'stone') { model3 = fixed('stone', Math.floor(v * 3)); m = item.flat ? mul(place(lx, item.y + 0.5, lz, item.yaw, 1.4), rotX(1.45)) : place(lx, item.y, lz, item.yaw, 1.6, item.h); }
            else if (item.k === 'washing') { model3 = fixed('washing', Math.floor(v * 3)); m = mul(place(lx, item.y + (item.up || 0), lz, item.yaw), [item.span / 2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]); }
            else if (item.k === 'clutter' || item.k === 'planter' || item.k === 'board') { TINT[3] = BRIGHT[Math.floor(v * 5.99)]; TINT[5] = ROOFS[1]; model3 = fixed(item.k, Math.floor(v * 3)); m = place(lx, item.y, lz, item.yaw + (item.k === 'clutter' ? v * 0.6 - 0.3 : 0)); darken(item.x, item.z, 1.3, 0.35); }
            else if (item.k === 'fence' || item.k === 'drywall' || item.k === 'sign' || item.k === 'milestone' || item.k === 'shrine' || item.k === 'logs' || item.k === 'bench' || item.k === 'cart' || item.k === 'cairn') {
                model3 = (detail > 0 && WayDetail.fixed(item.k, Math.floor(v * 3))) || fixed(item.k, Math.floor(v * 3)); m = place(lx, item.y, lz, item.yaw, item.k === 'cairn' ? 1.5 : 1);
                if (item.k === 'shrine') lights.push([item.x, item.y + 0.7, item.z, 1.5, 1, 0.7, 0.34, 1]);
            }
            // Small plants keep their colour in the pass; only winter whitens them.
            const tiny = item.k === 'litter' || item.k === 'tuft' || item.k === 'fern' || item.k === 'flower' || item.k === 'heather' || item.k === 'reed' || item.k === 'bush';
            if (model3) props.stamp(model3, m, TINT, item.k === 'bridge' ? 0 : tiny ? 0 : snow * 0.8, phase, lit);
        }

        yield;
        // The ground: heights, slopes, painted colour, where the road runs.
        const ground = new WaySoup(G * G), season = w.season(z0 + size / 2), colour = [0, 0, 0, 0, 0], skirt = far ? 14 : 3;
        const F = ground.F, B = ground.B;
        for (let j = 0; j < G; j++) {
            const jj = Math.min(Math.max(j, 1), G - 2), z = z0 + (jj - 1) * step, row = w.at(z);
            for (let i = 0; i < G; i++) {
                const ii = Math.min(Math.max(i, 1), G - 2), x = x0 + (ii - 1) * step, at = jj * G + ii, y = heights[at], edge = ii !== i || jj !== j;
                const nx = heights[at - 1] - heights[at + 1], nz = heights[at - G] - heights[at + G], nl = Math.hypot(nx, 2 * step, nz);
                groundColour(w, x, z, y, 2 * step / nl, row, season, colour);
                const p = w.pave(x, z), o = (j * G + i) * 6, b = (j * G + i) * 24;
                if (p.cobble > 0) { const inside = p.cobble * 0.55 * (1 - 0.85 * colour[4]); colour[0] = L.mix(colour[0], 150, inside); colour[1] = L.mix(colour[1], 132, inside); colour[2] = L.mix(colour[2], 104, inside); }
                F[o] = x - x0; F[o + 1] = y - (edge ? skirt : 0); F[o + 2] = z - z0;
                B[b + 12] = nx / nl * 127; B[b + 13] = 2 * step / nl * 127; B[b + 14] = nz / nl * 127; B[b + 15] = shade[at] * 127;
                B[b + 16] = colour[0]; B[b + 17] = colour[1]; B[b + 18] = colour[2]; B[b + 19] = 255;
                B[b + 20] = L.clamp(128 + p.margin * 10, 0, 255); B[b + 21] = p.cobble * 255; B[b + 22] = colour[3] * 255; B[b + 23] = colour[4] * 255;
            }
        }
        ground.n = G * G;

        // Water, wherever the ground dips under it.
        let water = null;
        const wc = far ? cells : cells / 2, ws = size / wc, WG = wc + 1, depth = new Float32Array(WG * WG), level = new Float32Array(WG * WG);
        let any = false;
        for (let j = 0; j < WG; j++) for (let i = 0; i < WG; i++) {
            const x = x0 + i * ws, z = z0 + j * ws, l = w.water(x, z);
            level[j * WG + i] = l;
            depth[j * WG + i] = l > -1e8 ? l - heights[(j * (far ? 1 : 2) + 1) * G + i * (far ? 1 : 2) + 1] : -9;
            if (depth[j * WG + i] > 0) any = true;
        }
        if (any) {
            water = new WaySoup(256);
            for (let j = 0; j < wc; j++) for (let i = 0; i < wc; i++) {
                const k = [j * WG + i, j * WG + i + 1, (j + 1) * WG + i + 1, (j + 1) * WG + i];
                if (Math.max(depth[k[0]], depth[k[1]], depth[k[2]], depth[k[3]]) < -0.2 || Math.min(level[k[0]], level[k[1]], level[k[2]], level[k[3]]) < -1e8) continue;
                const l = Math.max(level[k[0]], level[k[1]], level[k[2]], level[k[3]]);
                const corner = (q, di, dj) => { water.fx(L.clamp(128 + depth[q] * 40, 0, 255), 0, 0); water.v((i + di) * ws, l, (j + dj) * ws, 0, 1, 0); };
                corner(k[0], 0, 0); corner(k[3], 0, 1); corner(k[2], 1, 1); corner(k[0], 0, 0); corner(k[2], 1, 1); corner(k[1], 1, 0);
            }
        }
        return { cx, cz, x0, z0, size, cells, far, density, detail, ground, props, water, lights, smokes, spawns, beacons, low: low - skirt, high: high + (far ? 70 : 75) };
    }

    // The ground's triangles for a grid of `cells`, skirt included: shared by every square of that size.
    function gridIndices(cells) {
        const G = cells + 3, out = new Uint16Array((G - 1) * (G - 1) * 6);
        let o = 0;
        for (let j = 0; j < G - 1; j++) for (let i = 0; i < G - 1; i++) { const a = j * G + i; out[o++] = a; out[o++] = a + G; out[o++] = a + 1; out[o++] = a + 1; out[o++] = a + G; out[o++] = a + G + 1; }
        return out;
    }

    return { C, BRIGHT, PLASTER, GRASS, mul, rotX, rotY, rotZ, move, rnd, lerp3, fixed, house, tower, wall, flag, square, squareSteps, gridIndices, leafTint, model, fronds, tree };
})();
