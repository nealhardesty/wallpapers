// Snow Globe (SPEC §10.43): what stands on the turntable, as solids. Each
// kind is built once per layout as a list of parts in its own frame (x to
// its right, y up, z out of its front; globe units): houses (walls, gable
// ends and roof slopes, each a painted texture laid on its face through an
// affine transform, which is exact for a flat face seen without
// perspective), boxes, ellipsoids (a painted ball sprite taken through the
// 2×2 matrix of the ellipse the solid is seen as), limbs and tapered
// strokes, flat cut-outs, cylinders and cones; and symmetrical things (a
// fir, a lamp) as painted sprites with a few details that go round them.
// Every frame each part is turned and stood where it is (SnowGlobeLogic.at),
// faces that look away are left out, the rest drawn back to front, and each
// face shaded by how it meets the light: so a house shows its gable, then
// its side, as the turntable brings it round, and the deer passes behind the
// cottage. The textures and sprites are painted and then brushed, as the
// room is (the manager runs their brushwork a few milliseconds a frame).

const SnowGlobeModels = (() => {
    const S = SnowGlobeLogic, A = SnowGlobeArt;
    const { TAU, clamp, rng, KINDS, at, facing, world, ellipseOf } = S;
    const { canvas, css, shade, lerp, blob, poly, mottle } = A;
    const SNOW = [238, 243, 252], WARMWIN = [255, 196, 110], DARKWIN = [40, 50, 74];
    const norm = v => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); };
    const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
    const rotY = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]; };

    // ---- The kit: painted textures and sprites, made once per layout -----------------------------
    // R: CSS px per globe unit; side: where the candle is (the light comes
    // from there, and from above). Each texture is a holder { c, w, h } whose
    // canvas the brushwork replaces when it's done; `jobs` is the brushwork.
    function kit(R, ps, side, o = {}) {
        const jobs = [], cache = {};
        const fine = [R * 0.032 * ps, R * 0.016 * ps, R * 0.008 * ps];
        const K = {
            R, ps, side, jobs, lights: o.lights !== false, black: !!o.black,
            Ld: norm([side * 0.62, 0.62, 0.5]),
            tex(key, w, h, draw, brush = {}) {
                if (cache[key]) return cache[key];
                const c = canvas(w * ps, h * ps), g = c.getContext('2d');
                g.scale(ps, ps); draw(g, w, h);
                const hold = cache[key] = { c, w, h };
                if (brush !== false) jobs.push({ name: key, src: c, opts: { widths: brush.widths || fine, seed: key.length * 13 + 5, len: brush.len || 2.4, tol: brush.tol || 46, jit: 0.06, fine: 0.5, keep: true, dir: brush.dir }, done: out => { hold.c = out; } });
                return hold;
            },
            // A painted ball, lit from the candle's side and from above: what every ellipsoid is drawn with.
            ball(col, key = '') {
                const rb = Math.max(9, R * 0.1);
                return K.tex(`ball:${col}:${key}`, rb * 2, rb * 2, g => {
                    const c = rb, Rr = rng(col[0] * 7 + col[1] * 3 + col[2]);
                    blob(g, c, c, rb * 0.99, rb * 0.99, col);
                    g.save(); g.beginPath(); g.arc(c, c, rb * 0.99, 0, TAU); g.clip();
                    mottle(g, 0, 0, rb * 2, rb * 2, [shade(col, 0.85), lerp(col, [255, 255, 255], 0.18), shade(col, 0.7)], 26, rb * 0.22, Rr, 0.35);
                    let gr = g.createRadialGradient(c + side * rb * 0.4, c - rb * 0.45, 0, c + side * rb * 0.4, c - rb * 0.45, rb * 1.1);
                    gr.addColorStop(0, css(lerp(col, [255, 236, 210], 0.45), 0.7)); gr.addColorStop(0.5, css(col, 0)); gr.addColorStop(1, css(col, 0));
                    g.fillStyle = gr; g.fillRect(0, 0, rb * 2, rb * 2);
                    gr = g.createRadialGradient(c + side * rb * 0.25, c - rb * 0.25, rb * 0.4, c + side * rb * 0.2, c - rb * 0.2, rb * 1.35);
                    gr.addColorStop(0, 'rgba(8,8,24,0)'); gr.addColorStop(0.6, 'rgba(8,8,24,0.18)'); gr.addColorStop(1, 'rgba(8,8,24,0.62)');
                    g.fillStyle = gr; g.fillRect(0, 0, rb * 2, rb * 2);
                    // A cool rim of the window's light on its top.
                    g.lineWidth = rb * 0.12; g.strokeStyle = css(A.COOL, 0.25); g.beginPath(); g.arc(c, c, rb * 0.92, -Math.PI * 0.85, -Math.PI * 0.15); g.stroke();
                    g.restore();
                }, { widths: [rb * 0.3 * ps, rb * 0.15 * ps], tol: 60 });
            },
            // A square of painted colour for a flat face: plain, bark, stone, ice, snow or shingles.
            swatch(col, kind = 'plain') {
                const s = Math.max(14, R * 0.16);
                return K.tex(`sw:${col}:${kind}`, s, s, g => {
                    const Rr = rng(col[0] + col[1] * 5 + kind.length * 31);
                    g.fillStyle = css(col); g.fillRect(0, 0, s, s);
                    mottle(g, 0, 0, s, s, [shade(col, 0.82), lerp(col, [255, 255, 255], 0.15), shade(col, 0.92)], 30, s * 0.12, Rr, 0.4);
                    if (kind === 'bark') { g.strokeStyle = css(shade(col, 0.55), 0.7); g.lineWidth = s * 0.03; for (let i = 0; i < 9; i++) { const x = Rr() * s; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (Rr() - 0.5) * s * 0.2, s); g.stroke(); } }
                    if (kind === 'stone') { for (let y = 0; y < s; y += s * 0.25) for (let x = (y / s * 4 % 2) * s * 0.15; x < s; x += s * 0.3) { blob(g, x + s * 0.13, y + s * 0.12, s * 0.13, s * 0.1, lerp(col, [Rr() * 255, Rr() * 255, Rr() * 255], 0.12), 1, Rr()); g.strokeStyle = css(shade(col, 0.5), 0.6); g.lineWidth = s * 0.02; g.stroke(); } }
                    if (kind === 'ice') { g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = s * 0.025; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(Rr() * s, 0); g.lineTo(Rr() * s, s); g.stroke(); } const gr = g.createLinearGradient(0, 0, s, s); gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(120,160,210,0.25)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }
                    if (kind === 'snow') { g.fillStyle = 'rgba(255,255,255,0.5)'; for (let i = 0; i < 12; i++) blob(g, Rr() * s, Rr() * s, s * 0.15, s * 0.08, [255, 255, 255], 0.4); }
                }, { widths: [s * 0.16 * ps, s * 0.08 * ps] });
            },
        };
        return K;
    }

    // ---- Parts ----------------------------------------------------------------------------------
    // Each part: { t (its type), c (its middle, for the order they're drawn
    // in), …its own }. Colours are [r, g, b].
    const P = {
        ell: (c, r, col, o = {}) => ({ t: 'ell', c, r, col, pitch: o.pitch || 0, yaw: o.yaw || 0, ...o }),
        limb: (a, b, w, col, o = {}) => ({ t: 'limb', a, b, w, w2: o.w2 ?? w, col, c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], ...o }),
        // A tapered stroke along points: w at the first, w2 at the last.
        line: (pts, w, w2, col, o = {}) => ({ t: 'line', pts, w, w2, col, c: pts[pts.length >> 1], ...o }),
        dot: (c, r, col, n = null, o = {}) => ({ t: 'dot', c, r, col, n, ...o }),
        poly: (pts, col, o = {}) => ({ t: 'poly', pts, col, c: o.c || pts.reduce((m, p) => add(m, p, 1 / pts.length), [0, 0, 0]), n: o.n || polyNormal(pts), two: o.two !== false, ...o }),
        // A flat textured rectangle: o its bottom-left corner, u along its width, v up its height.
        quad: (o, u, v, img, n, opt = {}) => ({ t: 'quad', o, u, v, img, n, c: add(add(o, u, 0.5), v, 0.5), ...opt }),
        box: (c, size, faces, o = {}) => ({ t: 'box', c: [c[0], c[1] + size[1] / 2, c[2]], base: c, size, faces, ...o }),
        cyl: (c, r, h, col, o = {}) => ({ t: 'cyl', c: [c[0], c[1] + h / 2, c[2]], base: c, r, r2: o.r2 ?? r, h, col, ...o }),
        cone: (c, r, h, cols, o = {}) => ({ t: 'cone', c: [c[0], c[1] + h * 0.35, c[2]], base: c, r, h, cols, n: o.n || 12, ...o }),
        sprite: (img, c, o = {}) => ({ t: 'sprite', img, c, ...o }),
        fn: (c, draw) => ({ t: 'fn', c, draw }),
    };
    function polyNormal(pts) {
        const a = pts[0], b = pts[1], c = pts[2], u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        return norm([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]);
    }

    // ---- Drawing parts -------------------------------------------------------------------------------
    // D: { R, Ld, time, spin, lights, cover (snow lying on this thing, 0 to 1) }.
    const _p = [0, 0, 0], _q = [0, 0, 0], _r = [0, 0, 0];
    const scr = (v, R, p, out) => { at(v, p[0], p[1], p[2], out); out[0] *= R; out[1] *= R; return out; };
    // How a face with normal n meets the light: 0 (away) to 1 (square on).
    const lit = (v, D, n) => { const w = world(v, n[0], n[1], n[2]); return clamp(w[0] * D.Ld[0] + w[1] * D.Ld[1] + w[2] * D.Ld[2]); };
    function shadeFill(g, pts, lam, up = 0) {
        g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath();
        g.fillStyle = `rgba(12,10,30,${(0.62 * (1 - lam) * (1 - up * 0.5)).toFixed(3)})`; g.fill();
        if (lam > 0.05) { g.fillStyle = `rgba(255,186,110,${(0.2 * lam).toFixed(3)})`; g.fill(); }
        if (up > 0.3) { g.fillStyle = `rgba(150,178,230,${(0.1 * up).toFixed(3)})`; g.fill(); }
    }
    const rgb = (c, k = 1) => `rgb(${clamp(c[0] * k, 0, 255) | 0},${clamp(c[1] * k, 0, 255) | 0},${clamp(c[2] * k, 0, 255) | 0})`;

    // A textured flat face, the texture's top-left at o + v, its bottom-left at o.
    function face(g, v, D, img, o, u, up, n, lamOverride) {
        const R = D.R, p0 = scr(v, R, o, [0, 0, 0]), p1 = scr(v, R, add(o, u), [0, 0, 0]), p3 = scr(v, R, add(o, up), [0, 0, 0]), p2 = scr(v, R, add(add(o, u), up), [0, 0, 0]);
        const iw = img.c.width, ih = img.c.height;
        g.save();
        g.transform((p1[0] - p0[0]) / iw, (p1[1] - p0[1]) / iw, (p0[0] - p3[0]) / ih, (p0[1] - p3[1]) / ih, p3[0], p3[1]);
        g.drawImage(img.c, 0, 0);
        g.restore();
        if (n) shadeFill(g, [p0, p1, p2, p3], lamOverride ?? lit(v, D, n), Math.max(0, world(v, ...n)[1]));
        return [p0, p1, p2, p3];
    }

    function drawPart(g, v, D, p) {
        const R = D.R;
        switch (p.t) {
            case 'ell': {
                // Its axes, pitched about its own z and turned about its y.
                const cp = scr(v, R, p.c, _p), c = Math.cos(p.pitch), sn = Math.sin(p.pitch);
                const B = ellipseOf(v, rotY([c * p.r[0], sn * p.r[0], 0], p.yaw), rotY([-sn * p.r[1], c * p.r[1], 0], p.yaw), rotY([0, 0, p.r[2]], p.yaw));
                g.save(); g.transform(B[0] * R, B[1] * R, B[2] * R, B[3] * R, cp[0], cp[1]);
                g.drawImage(p.img.c, -1, -1, 2, 2);
                g.restore();
                return;
            }
            case 'limb': case 'line': {
                const pts = p.t === 'limb' ? [p.a, p.b] : p.pts, n = pts.length;
                if (p.w === p.w2 && !p.taper) {
                    g.lineCap = p.cap || 'round'; g.lineJoin = 'round'; g.strokeStyle = p.css; g.lineWidth = Math.max(0.6, p.w * 2 * R * v.k);
                    g.beginPath(); for (let i = 0; i < n; i++) { scr(v, R, pts[i], _p); i ? g.lineTo(_p[0], _p[1]) : g.moveTo(_p[0], _p[1]); } g.stroke();
                    if (p.hi && p.w * R * v.k > 1.2) { g.strokeStyle = p.hi; g.lineWidth = p.w * 0.7 * R * v.k; g.beginPath(); for (let i = 0; i < n; i++) { scr(v, R, pts[i], _p); const x = _p[0] + D.Ld[0] * p.w * 0.6 * R * v.k, y = _p[1] - p.w * 0.6 * R * v.k; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
                    return;
                }
                // Tapered: a polygon out along one side and back along the other, a round end at each.
                const sp = pts.map(q => scr(v, R, q, [0, 0, 0])), L = [], Rt = [];
                for (let i = 0; i < n; i++) {
                    const a = sp[Math.max(0, i - 1)], b = sp[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, w = (p.w + (p.w2 - p.w) * i / (n - 1)) * R * v.k;
                    L.push([sp[i][0] - dy / l * w, sp[i][1] + dx / l * w]); Rt.push([sp[i][0] + dy / l * w, sp[i][1] - dx / l * w]);
                }
                g.fillStyle = p.css; g.beginPath(); g.moveTo(L[0][0], L[0][1]); for (const q of L) g.lineTo(q[0], q[1]); for (let i = n - 1; i >= 0; i--) g.lineTo(Rt[i][0], Rt[i][1]); g.closePath(); g.fill();
                for (const [i, w] of [[0, p.w], [n - 1, p.w2]]) { g.beginPath(); g.arc(sp[i][0], sp[i][1], Math.max(0.3, w * R * v.k), 0, TAU); g.fill(); }
                return;
            }
            case 'dot': {
                let f = 1;
                if (p.n) { f = facing(v, ...p.n); if (f <= 0.02) return; }
                const cp = scr(v, R, p.c, _p), r = Math.max(0.4, p.r * R * v.k);
                g.fillStyle = p.css; g.beginPath(); g.ellipse(cp[0], cp[1], r, r * (p.n && p.flat ? clamp(0.3 + f, 0.3, 1) : 1), 0, 0, TAU); g.fill();
                return;
            }
            case 'poly': {
                const f = facing(v, ...p.n);
                if (!p.two && f <= 0) return;
                g.beginPath(); for (let i = 0; i < p.pts.length; i++) { scr(v, R, p.pts[i], _p); i ? g.lineTo(_p[0], _p[1]) : g.moveTo(_p[0], _p[1]); } g.closePath();
                const lam = lit(v, D, f < 0 ? p.n.map(x => -x) : p.n);
                g.fillStyle = rgb(p.col, 0.5 + 0.6 * lam); g.fill();
                return;
            }
            case 'quad': {
                const f = facing(v, ...p.n);
                if (f > 0) face(g, v, D, p.img, p.o, p.u, p.v, p.shade === false ? null : p.n, p.lam);
                else if (p.back) face(g, v, D, p.back, add(p.o, p.u), p.u.map(x => -x), p.v, p.shade === false ? null : p.n.map(x => -x), p.lam);
                else if (!p.one) face(g, v, D, p.img, add(p.o, p.u), p.u.map(x => -x), p.v, p.n.map(x => -x));
                // Nearly edge on, a cut-out shows its thickness.
                if (p.edge && Math.abs(f) < 0.35) {
                    const a = scr(v, R, add(p.o, p.u, 0.5), _p), b = scr(v, R, add(add(p.o, p.u, 0.5), p.v, 0.92), _q);
                    g.strokeStyle = p.edge; g.lineCap = 'round'; g.lineWidth = Math.max(0.8, R * v.k * 0.012) * (1 - Math.abs(f) / 0.35) + 0.4; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
                }
                return;
            }
            case 'box': return drawBox(g, v, D, p);
            case 'cyl': return drawCyl(g, v, D, p);
            case 'cone': return drawCone(g, v, D, p);
            case 'house': return drawHouse(g, v, D, p);
            case 'sprite': {
                const cp = scr(v, R, p.c, _p), img = p.img, w = img.w * v.k, h = img.h * v.k;
                g.drawImage(img.c, cp[0] - img.ax * v.k, cp[1] - img.ay * v.k, w, h);
                return;
            }
            case 'fn': return p.draw(g, v, D);
        }
    }

    // A box on its bottom's middle: the faces that look our way, each a painted
    // swatch (or its own texture), shaded by the light; snow on its top as deep as lies.
    const BOX_FACES = [
        // name, normal, corner (in half sizes), along, up
        ['front', [0, 0, 1], [-1, 0, 1], [2, 0, 0], [0, 1, 0]], ['back', [0, 0, -1], [1, 0, -1], [-2, 0, 0], [0, 1, 0]],
        ['right', [1, 0, 0], [1, 0, 1], [0, 0, -2], [0, 1, 0]], ['left', [-1, 0, 0], [-1, 0, -1], [0, 0, 2], [0, 1, 0]],
        ['top', [0, 1, 0], [-1, 1, 1], [2, 0, 0], [0, 0, -2]],
    ];
    function drawBox(g, v, D, p) {
        const [w, h, d] = p.size, b = p.base, half = [w / 2, h, d / 2];
        const yaw = p.yaw || 0;
        for (const [name, n0, c0, u0, v0] of BOX_FACES) {
            const n = rotY(n0, yaw);
            if (facing(v, ...n) <= 0) continue;
            const img = p.faces[name] || p.faces.all;
            const o = add(b, rotY([c0[0] * half[0], c0[1] * half[1], c0[2] * half[2]], yaw)), u = rotY([u0[0] * half[0], u0[1] * half[1], u0[2] * half[2]], yaw), up = rotY([v0[0] * half[0], v0[1] * half[1], v0[2] * half[2]], yaw);
            face(g, v, D, img, o, u, up, n);
            if (name === 'top' && p.snow) {
                const a = clamp(0.25 + (D.cover || 0) * 1.6);
                if (a > 0.02) { g.globalAlpha = a; face(g, v, D, p.snow, o, u, up, null); g.globalAlpha = 1; }
            }
        }
    }
    // A cylinder standing on its bottom's middle (r2: the top's radius, for a
    // tower that narrows): a painted body lit across, bands round it, a top.
    function drawCyl(g, v, D, p) {
        const R = D.R, b = scr(v, R, p.base, [0, 0, 0]), t = scr(v, R, add(p.base, [0, p.h, 0]), [0, 0, 0]);
        const r0 = p.r * R * v.k, r1 = p.r2 * R * v.k, e = 0.98 * S.TILT;
        g.save();
        g.beginPath(); g.moveTo(t[0] - r1, t[1]); g.lineTo(b[0] - r0, b[1]); g.ellipse(b[0], b[1], r0, r0 * e, 0, Math.PI, 0, true); g.lineTo(t[0] + r1, t[1]); g.ellipse(t[0], t[1], r1, r1 * e, 0, 0, Math.PI, true); g.closePath();
        g.clip();
        const x0 = Math.min(b[0] - r0, t[0] - r1), x1 = Math.max(b[0] + r0, t[0] + r1);
        g.drawImage(p.img.c, x0, t[1] - r1 * e, x1 - x0, b[1] - t[1] + r0 * e + r1 * e);
        if (p.bands) {
            // Bands round it (a lighthouse's stripes), each between two of its rings, curving as rings seen from above do.
            const n = p.bands.length;
            for (let i = 0; i < n; i++) {
                if (!p.bands[i]) continue;
                const u0 = i / n, u1 = (i + 1) / n, ya = b[1] + (t[1] - b[1]) * u0, yb = b[1] + (t[1] - b[1]) * u1, ra = r0 + (r1 - r0) * u0, rb = r0 + (r1 - r0) * u1, xa = b[0] + (t[0] - b[0]) * u0, xb = b[0] + (t[0] - b[0]) * u1;
                g.beginPath(); g.ellipse(xa, ya, ra, ra * e, 0, Math.PI, 0, true); g.lineTo(xb + rb, yb); g.ellipse(xb, yb, rb, rb * e, 0, 0, Math.PI, false); g.closePath();
                g.fillStyle = p.bands[i]; g.fill();
            }
            // (The light across them again.)
            g.globalCompositeOperation = 'source-atop';
            const gr = g.createLinearGradient(x0, 0, x1, 0), sd = D.Ld[0] > 0;
            gr.addColorStop(sd ? 0 : 1, 'rgba(10,10,30,0.55)'); gr.addColorStop(0.5, 'rgba(10,10,30,0.08)'); gr.addColorStop(sd ? 0.85 : 0.15, 'rgba(255,200,140,0.18)'); gr.addColorStop(sd ? 1 : 0, 'rgba(10,10,30,0.25)');
            g.fillStyle = gr; g.fillRect(x0, t[1] - r1, x1 - x0, b[1] - t[1] + r0 + r1);
            g.globalCompositeOperation = 'source-over';
        }
        g.restore();
        if (p.top !== false) {
            g.fillStyle = p.topCss || rgb(p.col, 1.08); g.beginPath(); g.ellipse(t[0], t[1], r1, r1 * e, 0, 0, TAU); g.fill();
            if (p.snowTop) { const a = clamp(0.3 + (D.cover || 0) * 1.6); g.globalAlpha = a; g.fillStyle = '#eef3fc'; g.beginPath(); g.ellipse(t[0], t[1] - r1 * e * 0.2, r1 * 0.96, r1 * e * 1.05, 0, 0, TAU); g.fill(); g.globalAlpha = 1; }
        }
    }
    // A cone, point up, in n segments (alternating colours: a carousel's canopy, or one colour): the segments that face us, lit.
    function drawCone(g, v, D, p) {
        const R = D.R, apex = scr(v, R, add(p.base, [0, p.h, 0]), [0, 0, 0]), n = p.n;
        for (let i = 0; i < n; i++) {
            const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU, am = (a0 + a1) / 2;
            const nn = norm([Math.sin(am) * p.h, p.r, Math.cos(am) * p.h]);
            if (facing(v, ...nn) <= -0.02) continue;
            const q0 = scr(v, R, add(p.base, [Math.sin(a0) * p.r, 0, Math.cos(a0) * p.r]), _q), x0 = q0[0], y0 = q0[1];
            const q1 = scr(v, R, add(p.base, [Math.sin(a1) * p.r, 0, Math.cos(a1) * p.r]), _r);
            g.beginPath(); g.moveTo(apex[0], apex[1]); g.lineTo(x0, y0); g.lineTo(q1[0], q1[1]); g.closePath();
            const lam = lit(v, D, nn), col = p.cols[i % p.cols.length];
            g.fillStyle = rgb(col, 0.48 + 0.62 * lam); g.fill();
            g.strokeStyle = rgb(col, 0.4 + 0.6 * lam); g.lineWidth = 0.6; g.stroke();
        }
    }

    // ---- Houses ------------------------------------------------------------------------------------
    // A gable house in its own frame: walls x ∈ ±w/2, z ∈ ±d/2, eaves at h,
    // the ridge (along z) at h + rh, the roof standing out `ov` all round.
    // tex: { front, back, side, roof, snow } painted textures; a chimney on the
    // right-hand slope (or up the right wall: `wallChimney`).
    function drawHouse(g, v, D, p) {
        const { w, d, h, rh, tex } = p, ov = p.ov, hw = w / 2, hd = d / 2;
        const yE = h - ov * rh / hw, sw = [hw + ov, h + rh - yE, 0];
        const walls = [
            [tex.front, [-hw, 0, hd], [w, 0, 0], [0, h + rh, 0], [0, 0, 1]],
            [tex.back, [hw, 0, -hd], [-w, 0, 0], [0, h + rh, 0], [0, 0, -1]],
            [tex.side, [hw, 0, hd], [0, 0, -d], [0, h, 0], [1, 0, 0]],
            [tex.sideL || tex.side, [-hw, 0, -hd], [0, 0, d], [0, h, 0], [-1, 0, 0]],
        ];
        // The gable ends are pentagons in a rectangle's texture: shade only their own shape.
        for (const [img, o, u, up, n] of walls) {
            if (facing(v, ...n) <= 0) continue;
            const pts = face(g, v, D, img, o, u, up, null), lam = lit(v, D, n);
            if (n[2]) {
                const R = D.R, e0 = scr(v, R, add(o, [0, h, 0]), [0, 0, 0]), e1 = scr(v, R, add(add(o, u), [0, h, 0]), [0, 0, 0]), ap = scr(v, R, add(add(o, u, 0.5), [0, h + rh, 0]), [0, 0, 0]);
                shadeFill(g, [pts[0], pts[1], e1, ap, e0], lam);
            } else shadeFill(g, pts, lam);
        }
        const chimney = p.chimney, chimFirst = chimney && facing(v, ...p.rightN) <= 0;
        if (chimFirst) drawPart(g, v, D, chimney);
        const roofs = [
            [[-(hw + ov), yE, -(hd + ov)], [0, 0, d + ov * 2], [sw[0], sw[1], 0], p.leftN],
            [[hw + ov, yE, hd + ov], [0, 0, -(d + ov * 2)], [-sw[0], sw[1], 0], p.rightN],
        ];
        const snow = clamp(0.3 + (D.cover || 0) * 1.6);
        for (const [o, u, up, n] of roofs) {
            if (facing(v, ...n) <= -0.01) continue;
            face(g, v, D, tex.roof, o, u, up, n);
            if (tex.snow && snow > 0.02) { g.globalAlpha = snow; face(g, v, D, tex.snow, o, u, up, null); g.globalAlpha = 1; }
        }
        if (chimney && !chimFirst) drawPart(g, v, D, chimney);
        for (const x of p.extra || []) drawPart(g, v, D, x);
    }
    // The roof's and walls' textures for one style of house, painted.
    // style: { wall, roof, door, trim, timber, logs, ginger, stone, cat, church, windows: { front, side, back } }.
    function houseParts(Kt, kind, K, style) {
        const R = Kt.R, w = K.w, d = K.d, h = K.h, rh = K.roof, ov = w * 0.07, lights = Kt.lights;
        const W = w * R, Hf = (h + rh) * R, Hw = h * R, Dd = d * R, slope = Math.hypot(w / 2 + ov, rh + ov * rh / (w / 2)) * R, Wr = (d + ov * 2) * R;
        const key = `${kind}:${style.key || ''}:${lights ? 1 : 0}`, Rr = rng(kind.length * 977 + (style.seed || 0));
        const glows = [];
        const win = (g, x, y, ww, wh, o = {}) => {
            // A window: lit (or dark), its frame and bars, snow on its sill; and a glow at its middle.
            const col = lights ? (o.col || WARMWIN) : DARKWIN;
            g.fillStyle = css(o.frame || style.trim || [70, 46, 34]); g.fillRect(x - ww * 0.12, y - wh * 0.1, ww * 1.24, wh * 1.2);
            if (o.arch) { g.beginPath(); g.moveTo(x, y + wh); g.lineTo(x, y + ww / 2); g.arc(x + ww / 2, y + ww / 2, ww / 2, Math.PI, 0); g.lineTo(x + ww, y + wh); g.closePath(); g.fillStyle = css(col); g.fill(); }
            else { g.fillStyle = css(col); g.fillRect(x, y, ww, wh); }
            if (lights) { const gr = g.createRadialGradient(x + ww / 2, y + wh * 0.55, 0, x + ww / 2, y + wh * 0.55, Math.max(ww, wh) * 0.8); gr.addColorStop(0, 'rgba(255,244,210,0.85)'); gr.addColorStop(1, 'rgba(255,170,80,0)'); g.fillStyle = gr; g.fillRect(x, y, ww, wh); }
            if (o.stained) for (const [cc, yy] of [[[220, 70, 60], 0.3], [[80, 140, 220], 0.55], [[90, 180, 110], 0.78]]) { g.fillStyle = css(cc, lights ? 0.5 : 0.3); g.fillRect(x, y + wh * yy, ww, wh * 0.16); }
            if (o.bars !== false) { g.fillStyle = css([60, 40, 30]); g.fillRect(x + ww / 2 - ww * 0.06, y, ww * 0.12, wh); g.fillRect(x, y + wh * 0.48, ww, wh * 0.1); }
            if (o.cat) { const c = [36, 28, 32]; blob(g, x + ww / 2, y + wh * 0.8, ww * 0.3, wh * 0.24, c); blob(g, x + ww / 2, y + wh * 0.45, ww * 0.2, ww * 0.2, c); g.fillStyle = css(c); poly(g, [x + ww * 0.33, y + wh * 0.35, x + ww * 0.38, y + wh * 0.12, x + ww * 0.47, y + wh * 0.3]); g.fill(); poly(g, [x + ww * 0.67, y + wh * 0.35, x + ww * 0.62, y + wh * 0.12, x + ww * 0.53, y + wh * 0.3]); g.fill(); }
            g.fillStyle = css(SNOW, 0.95); g.fillRect(x - ww * 0.16, y + wh * 1.06, ww * 1.32, wh * 0.14);
            if (style.ginger) { g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = ww * 0.08; g.strokeRect(x - ww * 0.06, y - wh * 0.04, ww * 1.12, wh * 1.08); }
            return { x: x + ww / 2, y: y + wh / 2, r: Math.max(ww, wh) * 0.9 };
        };
        const paintWall = (g, ww, hh, gable) => {
            const top = gable ? hh - Hw : 0;
            g.fillStyle = css(style.wall);
            g.beginPath(); g.moveTo(0, hh); g.lineTo(0, top); if (gable) g.lineTo(ww / 2, 0); g.lineTo(ww, top); g.lineTo(ww, hh); g.closePath(); g.fill();
            g.save(); g.clip();
            mottle(g, 0, 0, ww, hh, [shade(style.wall, 0.88), lerp(style.wall, [255, 255, 255], 0.18), shade(style.wall, 0.95)], 40, R * 0.03, Rr, 0.4);
            if (style.logs) {
                // Round logs, chinked between; their cut ends stand out at the corners.
                const lh = R * 0.042;
                for (let y = hh; y > 0; y -= lh) {
                    const gr = g.createLinearGradient(0, y - lh, 0, y); gr.addColorStop(0, css(lerp(style.wall, [255, 220, 170], 0.25))); gr.addColorStop(0.5, css(style.wall)); gr.addColorStop(1, css(shade(style.wall, 0.55)));
                    g.fillStyle = gr; g.fillRect(0, y - lh, ww, lh * 0.92);
                    g.fillStyle = css([200, 190, 170], 0.6); g.fillRect(0, y - lh * 0.08, ww, lh * 0.08);
                    if (y > top + lh * 0.5 && !gable) for (const x of [lh * 0.5, ww - lh * 0.5]) { blob(g, x, y - lh / 2, lh * 0.48, lh * 0.46, [196, 150, 100]); g.strokeStyle = css([120, 80, 50], 0.7); g.lineWidth = lh * 0.06; g.beginPath(); g.arc(x, y - lh / 2, lh * 0.25, 0, TAU); g.stroke(); }
                }
            }
            if (style.timber) { g.strokeStyle = css(shade(style.wall, 0.42)); g.lineWidth = R * 0.012; g.beginPath(); g.moveTo(0, top + (hh - top) * 0.45); g.lineTo(ww, top + (hh - top) * 0.45); for (const x of [0.04, 0.3, 0.7, 0.96]) { g.moveTo(ww * x, top); g.lineTo(ww * x, hh); } g.moveTo(ww * 0.04, top + (hh - top) * 0.45); g.lineTo(ww * 0.3, hh); g.moveTo(ww * 0.96, top + (hh - top) * 0.45); g.lineTo(ww * 0.7, hh); g.stroke(); }
            if (style.stone) { g.strokeStyle = css(shade(style.wall, 0.7), 0.6); g.lineWidth = R * 0.005; for (let y = hh; y > 0; y -= R * 0.03) { g.beginPath(); g.moveTo(0, y); g.lineTo(ww, y); g.stroke(); for (let x = (y / (R * 0.03)) % 2 * R * 0.025; x < ww; x += R * 0.05) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - R * 0.03); g.stroke(); } } }
            if (style.ginger) {
                // Icing: scallops along the eaves and the corners, dots, and candy buttons.
                g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = R * 0.012; g.lineCap = 'round';
                for (let x = 0; x < ww; x += R * 0.04) { g.beginPath(); g.arc(x + R * 0.02, top + R * 0.012, R * 0.02, 0, Math.PI); g.stroke(); }
                for (const x of [R * 0.012, ww - R * 0.012]) { g.beginPath(); g.moveTo(x, top); g.lineTo(x, hh); g.stroke(); }
                const candy = [[230, 50, 60], [60, 170, 90], [250, 200, 60], [90, 120, 230], [240, 120, 190]];
                for (let i = 0; i < 6; i++) blob(g, ww * (0.12 + i * 0.15), hh - R * 0.025, R * 0.016, R * 0.016, candy[i % 5]);
            }
            // Snow drifted against its foot.
            for (let i = 0; i < 9; i++) blob(g, Rr() * ww, hh - Rr() * R * 0.02, ww * 0.1, R * 0.018, SNOW, 0.95);
            g.restore();
        };
        const front = Kt.tex(`${key}:front`, W, Hf, g => {
            paintWall(g, W, Hf, true);
            const top = Hf - Hw;
            if (style.church) {
                g.fillStyle = css([110, 40, 40]); g.beginPath(); g.moveTo(W * 0.38, Hf); g.lineTo(W * 0.38, Hf - Hw * 0.32); g.arc(W / 2, Hf - Hw * 0.32, W * 0.12, Math.PI, 0); g.lineTo(W * 0.62, Hf); g.closePath(); g.fill();
                const r = W * 0.13, cx = W / 2, cy = top + Hw * 0.3; g.fillStyle = css(style.trim); g.beginPath(); g.arc(cx, cy, r * 1.18, 0, TAU); g.fill();
                g.fillStyle = css(lights ? [255, 200, 120] : DARKWIN); g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
                g.strokeStyle = css([80, 50, 40]); g.lineWidth = r * 0.12; for (let k = 0; k < 4; k++) { const a = k * Math.PI / 4; g.beginPath(); g.moveTo(cx - Math.cos(a) * r, cy - Math.sin(a) * r); g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.stroke(); }
                glows.push(['front', cx, cy, r * 2.2]);
                return;
            }
            const dw = W * 0.22, dh = Hw * 0.58, dx = W / 2 - dw / 2;
            g.fillStyle = css(style.door); g.fillRect(dx, Hf - dh, dw, dh);
            g.fillStyle = css(shade(style.door, 0.7)); g.fillRect(dx + dw * 0.1, Hf - dh * 0.9, dw * 0.8, dh * 0.04); g.fillRect(dx + dw * 0.1, Hf - dh * 0.5, dw * 0.8, dh * 0.04);
            blob(g, dx + dw * 0.8, Hf - dh * 0.45, dw * 0.06, dw * 0.06, [230, 190, 90]);
            if (style.ginger) { for (let k = 0; k < 6; k++) { g.fillStyle = k % 2 ? '#fff' : '#d8323a'; g.fillRect(dx - dw * 0.16, Hf - dh * (k + 1) / 6, dw * 0.12, dh / 6); g.fillRect(dx + dw * 1.04, Hf - dh * (k + 1) / 6, dw * 0.12, dh / 6); } }
            else { g.strokeStyle = css([40, 110, 60]); g.lineWidth = dw * 0.16; g.beginPath(); g.arc(W / 2, Hf - dh * 0.72, dw * 0.24, 0, TAU); g.stroke(); blob(g, W / 2, Hf - dh * 0.55, dw * 0.08, dw * 0.06, [220, 40, 40]); }
            const ww = W * 0.19, wh = Hw * 0.3;
            for (const x of [W * 0.08, W * 0.73]) { const m = win(g, x, Hf - Hw * 0.8, ww, wh, { cat: style.cat && x > W / 2 }); glows.push(['front', m.x, m.y, m.r]); }
            if (style.cat) { g.fillStyle = css(lights ? [255, 200, 110] : DARKWIN); A.ell(g, W / 2, top * 0.55, W * 0.08, W * 0.045); g.fill(); poly(g, [W / 2 + W * 0.07, top * 0.55, W / 2 + W * 0.12, top * 0.47, W / 2 + W * 0.12, top * 0.63]); g.fill(); glows.push(['front', W / 2, top * 0.55, W * 0.18]); }
            else if (style.loft !== false) { const m = win(g, W / 2 - W * 0.06, top * 0.45, W * 0.12, top * 0.28, { bars: false }); glows.push(['front', m.x, m.y, m.r * 0.8]); }
        });
        const back = Kt.tex(`${key}:back`, W, Hf, g => {
            paintWall(g, W, Hf, true);
            const m = win(g, W * 0.4, Hf - Hw * 0.75, W * 0.2, Hw * 0.3); glows.push(['back', m.x, m.y, m.r]);
        });
        const side = Kt.tex(`${key}:side`, Dd, Hw, g => {
            paintWall(g, Dd, Hw, false);
            const n = style.church ? 3 : 2;
            for (let k = 0; k < n; k++) {
                const ww = Dd * (style.church ? 0.13 : 0.17), x = Dd * (k + 0.5) / n - ww / 2;
                const m = style.church ? win(g, x, Hw * 0.22, ww, Hw * 0.48, { arch: true, stained: true, bars: false, frame: style.trim }) : win(g, x, Hw * 0.25, ww, Hw * 0.32);
                glows.push(['side', m.x, m.y, m.r]);
            }
        });
        const roof = Kt.tex(`${key}:roof`, Wr, slope, g => {
            // Shingles (or icing on gingerbread), the eave's board at its foot.
            g.fillStyle = css(style.roof); g.fillRect(0, 0, Wr, slope);
            const rowH = slope / 7;
            for (let r = 0; r < 7; r++) {
                const y = r * rowH;
                g.fillStyle = css(shade(style.roof, 0.82 + 0.1 * (r % 2))); g.fillRect(0, y, Wr, rowH * 0.85);
                g.strokeStyle = css(shade(style.roof, 0.6)); g.lineWidth = R * 0.004;
                for (let x = (r % 2) * rowH * 0.6; x < Wr; x += rowH * 1.2) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + rowH * 0.85); g.stroke(); }
                if (style.ginger) { g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = R * 0.008; for (let x = 0; x < Wr; x += rowH) { g.beginPath(); g.arc(x + rowH / 2, y + rowH * 0.8, rowH / 2, 0, Math.PI); g.stroke(); } }
            }
            mottle(g, 0, 0, Wr, slope, [shade(style.roof, 0.75), lerp(style.roof, [255, 255, 255], 0.15)], 30, R * 0.03, Rr, 0.3);
            g.fillStyle = css(shade(style.roof, 0.45)); g.fillRect(0, slope - R * 0.012, Wr, R * 0.012);
            // A dusting of frost at its top.
            g.fillStyle = 'rgba(230,238,252,0.35)'; g.fillRect(0, 0, Wr, slope * 0.12);
        });
        const snow = Kt.tex(`${key}:snow`, Wr, slope, g => {
            // A blanket of snow: thick, soft-edged, ragged where it ends short of the eave, a lip over it here and there, icicles.
            const Rs = rng(kind.length * 31 + 7);
            g.fillStyle = css(SNOW);
            g.beginPath(); g.moveTo(0, 0); g.lineTo(Wr, 0);
            for (let x = Wr; x >= 0; x -= Wr / 18) g.lineTo(x, slope * (0.84 + Rs() * 0.12));
            g.closePath(); g.fill();
            for (let i = 0; i < 14; i++) blob(g, Rs() * Wr, slope * (0.86 + Rs() * 0.1), Wr * 0.05, slope * 0.05, SNOW, 0.95);
            const gr = g.createLinearGradient(0, 0, 0, slope); gr.addColorStop(0, 'rgba(255,255,255,0.4)'); gr.addColorStop(0.7, 'rgba(160,180,220,0)'); gr.addColorStop(1, 'rgba(120,140,190,0.35)');
            g.save(); g.globalCompositeOperation = 'source-atop'; g.fillStyle = gr; g.fillRect(0, 0, Wr, slope); g.restore();
            g.strokeStyle = 'rgba(225,236,252,0.9)'; g.lineCap = 'round'; for (let i = 0; i < 9; i++) { const x = Wr * (0.06 + Rs() * 0.88), l = slope * (0.05 + Rs() * 0.1); g.lineWidth = R * 0.008; g.beginPath(); g.moveTo(x, slope * 0.97); g.lineTo(x, slope * 0.97 + l); g.stroke(); }
        }, { tol: 30 });
        // The windows' glows, in the house's own frame (each face's texture px to where they are on it).
        const at3 = ([f, x, y, r]) => {
            const L = 0.006;
            if (f === 'front') return { at: [-w / 2 + x / R, (Hf - y) / R, d / 2 + L], n: [0, 0, 1], r: r / R };
            if (f === 'back') return { at: [w / 2 - x / R, (Hf - y) / R, -d / 2 - L], n: [0, 0, -1], r: r / R };
            return [{ at: [w / 2 + L, (Hw - y) / R, d / 2 - x / R], n: [1, 0, 0], r: r / R }, { at: [-w / 2 - L, (Hw - y) / R, -d / 2 + x / R], n: [-1, 0, 0], r: r / R }];
        };
        const g3 = glows.flatMap(at3);
        const rn = norm([rh + ov * rh / (w / 2), w / 2 + ov, 0]);
        const house = { t: 'house', c: [0, (h + rh) * 0.45, 0], w, d, h, rh, ov, tex: { front, back, side, roof, snow }, leftN: [-rn[0], rn[1], 0], rightN: rn };
        return { house, glows: g3 };
    }

    // ---- The kinds ---------------------------------------------------------------------------------
    // build(kind, variant, kit, art) → { parts, glows: [{ at, n, r, col, lamp }],
    // caps: [{ at, w, h }] (fresh snow on a top), smoke: a chimney's top, post: drawn after the scene (a beam) }.
    const HOUSES = {
        cottage: { wall: [226, 214, 188], roof: [96, 56, 44], door: [130, 34, 36], trim: [74, 48, 36], timber: true, key: 'c' },
        cathouse: { wall: [236, 196, 150], roof: [150, 70, 60], door: [60, 90, 140], trim: [96, 60, 44], timber: true, cat: true, key: 'k' },
        house0: { wall: [92, 110, 150], roof: [70, 50, 48], door: [180, 150, 80], trim: [236, 228, 214], key: 'h0', loft: false },
        house1: { wall: [150, 60, 50], roof: [64, 52, 56], door: [44, 70, 60], trim: [236, 228, 214], key: 'h1', loft: false },
        church: { wall: [214, 206, 196], roof: [80, 70, 76], trim: [150, 130, 110], church: true, stone: true, key: 'ch' },
        hut: { wall: [238, 236, 228], roof: [170, 40, 40], door: [40, 70, 110], trim: [60, 80, 110], key: 'hut', loft: false },
        gingerhouse: { wall: [168, 96, 48], roof: [130, 72, 36], door: [230, 60, 70], trim: [255, 250, 245], ginger: true, key: 'g', loft: false },
        cabin: { wall: [120, 78, 46], roof: [70, 52, 42], door: [80, 46, 30], trim: [60, 40, 28], logs: true, key: 'cb', loft: false },
    };

    function build(kind, variant, Kt, art) {
        const K = KINDS[kind], R = Kt.R, parts = [], glows = [], caps = [], out = { parts, glows, caps, smoke: null, post: null };
        const ball = (col, key) => Kt.ball(col, key);
        const ell = (c, r, col, o) => { const p = P.ell(c, r, col, o); p.img = ball(col); parts.push(p); return p; };
        const limb = (a, b, w, col, o = {}) => { const p = P.limb(a, b, w, col, o); p.css = rgb(col); if (o.hi !== false) p.hi = rgb(lerp(col, [255, 240, 220], 0.35), 0.9); parts.push(p); return p; };
        const line = (pts, w, w2, col, o = {}) => { const p = P.line(pts, w, w2, col, o); p.css = rgb(col); parts.push(p); return p; };
        const dot = (c, r, col, n, o) => { const p = P.dot(c, r, col, n, o); p.css = rgb(col); parts.push(p); return p; };
        const tri = (pts, col, o) => { const p = P.poly(pts, col, o); parts.push(p); return p; };
        const box = (c, size, faces, o) => { const p = P.box(c, size, faces, o); parts.push(p); return p; };
        const sw = (col, k) => Kt.swatch(col, k);
        const style = HOUSES[kind === 'house' ? `house${variant % 2}` : kind];
        if (K.box && style) {
            const { house, glows: gl } = houseParts(Kt, kind === 'house' ? `house${variant % 2}` : kind, K, style);
            parts.push(house);
            for (const q of gl) glows.push({ ...q, col: [255, 190, 110] });
            const w = K.w, d = K.d, h = K.h, rh = K.roof;
            if (kind === 'church') {
                // The tower over the door, its spire, a cross; its bell's window lit.
                const tw = w * 0.36, th = h + rh + K.spire * 0.32, tz = d / 2 + tw * 0.15, tc = [0, 0, tz - tw / 2];
                const tex = Kt.tex(`tower:${Kt.lights}`, tw * R, th * R, (g, W, H) => {
                    g.fillStyle = css(style.wall); g.fillRect(0, 0, W, H); mottle(g, 0, 0, W, H, [shade(style.wall, 0.88), lerp(style.wall, [255, 255, 255], 0.2)], 18, R * 0.02, rng(5), 0.4);
                    g.fillStyle = css(Kt.lights ? [255, 206, 130] : DARKWIN); g.beginPath(); g.moveTo(W * 0.3, H * 0.28); g.lineTo(W * 0.3, H * 0.14); g.arc(W / 2, H * 0.14, W * 0.2, Math.PI, 0); g.lineTo(W * 0.7, H * 0.28); g.closePath(); g.fill();
                    g.fillStyle = css([80, 60, 50]); g.fillRect(W * 0.47, H * 0.08, W * 0.06, H * 0.2);
                    g.fillStyle = css(style.trim); g.fillRect(0, H * 0.32, W, H * 0.025);
                    g.fillStyle = css([110, 40, 40]); g.beginPath(); g.moveTo(W * 0.28, H); g.lineTo(W * 0.28, H * 0.84); g.arc(W / 2, H * 0.84, W * 0.22, Math.PI, 0); g.lineTo(W * 0.72, H); g.closePath(); g.fill();
                    for (let i = 0; i < 6; i++) blob(g, W * (i / 5), H - R * 0.01, W * 0.12, R * 0.016, SNOW);
                });
                box(tc, [tw, th, tw], { all: tex });
                const sh = K.spire * 0.68, top = th, apex = [0, top + sh, tz - tw / 2], hc = tw * 0.52;
                const corners = [[-hc, top, tz - tw / 2 + hc], [hc, top, tz - tw / 2 + hc], [hc, top, tz - tw / 2 - hc], [-hc, top, tz - tw / 2 - hc]];
                for (let k = 0; k < 4; k++) tri([corners[k], corners[(k + 1) % 4], apex], [80, 72, 80], { two: false, c: add(apex, [0, -sh * 0.6, 0]) });
                limb(add(apex, [0, -0.005, 0]), add(apex, [0, 0.06, 0]), 0.006, [226, 190, 90]); limb(add(apex, [-0.02, 0.04, 0]), add(apex, [0.02, 0.04, 0]), 0.005, [226, 190, 90]);
                glows.push({ at: [0, th * 0.8, tz + 0.006], n: [0, 0, 1], r: tw * 0.3, col: [255, 200, 120] });
                caps.push({ at: apex, w: 0.012, h: 0.008 });
            }
            if (kind === 'cathouse') {
                // Cat ears on the roof's ridge, at its front.
                for (const e of [-1, 1]) {
                    const z = d * 0.36, base0 = [e * w * 0.04, h + rh * 0.98, z], base1 = [e * w * 0.2, h + rh * 0.4, z], tip = [e * w * 0.17, h + rh * 1.5, z];
                    tri([base0, base1, tip], [150, 70, 60], { n: [0, 0, 1] });
                    tri([add(base0, [e * w * 0.03, rh * 0.1, 0.004]), add(base1, [-e * w * 0.03, rh * 0.15, 0.004]), add(tip, [0, -rh * 0.18, 0.004])], [226, 150, 150], { n: [0, 0, 1], two: false });
                }
            }
            if (kind === 'cottage' || kind === 'hut' || kind === 'house' || kind === 'gingerhouse') {
                // A chimney through the right-hand slope (smoking), snow on its top.
                const cw = w * 0.13, x = w * 0.24, z = -d * 0.18, ybase = h + rh * (1 - (x + cw / 2) / (w / 2)) - 0.01, ch = h + rh * 1.18 - ybase;
                house.chimney = P.box([x, ybase, z], [cw, ch, cw], { all: sw(kind === 'gingerhouse' ? [150, 84, 40] : [130, 76, 58], kind === 'gingerhouse' ? 'plain' : 'stone'), top: sw([60, 40, 36]) }, { snow: sw(SNOW, 'snow') });
                if (kind !== 'house' || variant) out.smoke = [x, ybase + ch, z];
            }
            if (kind === 'cabin') {
                // A stone chimney up its right-hand wall, smoking; a wreath; a lantern by the door.
                const cw = w * 0.2, x = w / 2 + cw * 0.42, z = -d * 0.05;
                house.chimney = P.box([x, 0, z], [cw, h + rh * 1.12, cw * 1.1], { all: sw([120, 116, 112], 'stone') }, { snow: sw(SNOW, 'snow') });
                out.smoke = [x, h + rh * 1.12, z];
                glows.push({ at: [w * 0.18, h * 0.62, d / 2 + 0.01], n: [0, 0, 1], r: 0.05, col: [255, 200, 120], lamp: true });
            }
            if (kind === 'gingerhouse') {
                // Gumdrops along the ridge and the eaves; a candy-cane fence by the door.
                const candy = [[230, 50, 60], [60, 170, 90], [250, 200, 60], [90, 120, 230], [240, 120, 190]], ov = w * 0.07, yE = h - ov * rh / (w / 2);
                for (let i = 0; i < 7; i++) { const z = -d / 2 - ov + (d + ov * 2) * (i + 0.5) / 7; ell([0, h + rh + 0.012, z], [0.016, 0.014, 0.016], candy[i % 5]); }
                for (const e of [-1, 1]) for (let i = 0; i < 5; i++) { const z = -d / 2 + d * (i + 0.5) / 5; dot([e * (w / 2 + ov * 0.9), yE - 0.004, z], 0.008, candy[(i + (e > 0 ? 2 : 0)) % 5]); }
            }
            const up = h + rh;
            caps.push({ at: [0, up, 0], w: 0, h: 0, roof: true });
            return out;
        }
        switch (kind) {
            case 'fir': case 'bigtree': {
                const img = art.fir(kind);
                parts.push(P.sprite(img, [0, 0, 0]));
                const th = K.h, tw = K.w, Rr = rng(kind.length * 17 + variant);
                // Snow lying on the boughs at their tips, and (on the big tree) baubles: they go round with it.
                const n = kind === 'bigtree' ? 30 : 12;
                for (let i = 0; i < n; i++) {
                    const u = 0.12 + Rr() * 0.78, a = Rr() * TAU, rr = tw * 0.5 * (1 - u * 0.82) * 0.96, c = [Math.sin(a) * rr, th * (0.08 + u * 0.85), Math.cos(a) * rr], nn = [Math.sin(a), 0.3, Math.cos(a)];
                    if (kind === 'bigtree' && i % 2) dot(c, 0.012, [[220, 40, 50], [240, 200, 80], [60, 110, 200], [200, 200, 220]][i % 4], nn, { flat: true });
                    else dot(c, tw * 0.05, SNOW, nn, { flat: true });
                }
                caps.push({ at: [0, th * 0.93, 0], w: tw * 0.08, h: th * 0.03 });
                if (kind === 'bigtree') { out.cone = { h: th, w: tw }; glows.push({ at: [0, th * 1.02, 0], n: null, r: tw * 0.2, col: [255, 220, 120] }); }
                return out;
            }
            case 'lamp': {
                parts.push(P.sprite(art.fir('lamp'), [0, 0, 0]));
                glows.push({ at: [0, K.h * 0.93, 0], n: null, r: K.h * 0.25, col: [255, 200, 120], lamp: true });
                caps.push({ at: [0, K.h * 1.09, 0], w: K.h * 0.03, h: K.h * 0.02 });
                return out;
            }
            case 'snowman': {
                const sh = K.h, W = [242, 246, 253];
                const balls = [[sh * 0.2, sh * 0.21], [sh * 0.52, sh * 0.16], [sh * 0.8, sh * 0.12]];
                for (const [y, r] of balls) ell([0, y, 0], [r, r * 0.96, r], W);
                const hy = sh * 0.8, hr = sh * 0.12;
                // Coal eyes and buttons, a carrot nose (it points where he looks), a scarf, twig arms, a hat.
                for (const e of [-1, 1]) dot([e * hr * 0.4, hy + hr * 0.18, hr * 0.88], hr * 0.11, [24, 22, 26], [e * 0.3, 0.2, 0.93]);
                line([[0, hy, hr * 0.9], [0, hy - hr * 0.08, hr * 1.9]], hr * 0.13, hr * 0.02, [236, 120, 40]);
                for (let k = 0; k < 3; k++) { const a = 0.35 - k * 0.32, y = sh * 0.52 + Math.sin(a) * sh * 0.16, z = Math.cos(a) * sh * 0.16 * 0.98; dot([0, y, z], sh * 0.016, [30, 28, 30], [0, Math.sin(a), Math.cos(a)]); }
                parts.push({ ...P.cyl([0, sh * 0.64, 0], sh * 0.115, sh * 0.05, [190, 36, 40]), img: sw([190, 36, 40]), top: false });
                line([[sh * 0.06, sh * 0.67, sh * 0.1], [sh * 0.1, sh * 0.55, sh * 0.13], [sh * 0.11, sh * 0.47, sh * 0.12]], sh * 0.03, sh * 0.026, [190, 36, 40]);
                for (const e of [-1, 1]) { const a = [e * sh * 0.14, sh * 0.55, 0], b = [e * sh * 0.34, sh * 0.7, 0.02]; limb(a, b, 0.0045, [92, 62, 40], { hi: false }); limb(add(a, [e * sh * 0.13, sh * 0.08, 0.01]), add(a, [e * sh * 0.17, sh * 0.15, 0]), 0.0035, [92, 62, 40], { hi: false }); }
                parts.push({ ...P.cyl([0, sh * 0.9, 0], sh * 0.09, sh * 0.13, [30, 28, 32]), img: sw([30, 28, 32]) });
                parts.push({ ...P.cyl([0, sh * 0.895, 0], sh * 0.14, sh * 0.008, [30, 28, 32]), img: sw([30, 28, 32]), c: [0, sh * 0.88, 0] });
                caps.push({ at: [0, sh * 1.03, 0], w: sh * 0.09, h: sh * 0.035 });
                return out;
            }
            case 'catsnowman': {
                const sh = K.h, W = [242, 246, 253];
                ell([0, sh * 0.25, 0], [sh * 0.27, sh * 0.26, sh * 0.27], W); ell([0, sh * 0.66, 0], [sh * 0.2, sh * 0.19, sh * 0.2], W);
                const hy = sh * 0.66, hr = sh * 0.2;
                for (const e of [-1, 1]) {
                    tri([[e * hr * 0.25, hy + hr * 0.75, 0.01], [e * hr * 0.85, hy + hr * 0.6, 0], [e * hr * 0.75, hy + hr * 1.35, 0.01]], [236, 240, 250], { n: [0, 0.2, 1] });
                    tri([[e * hr * 0.4, hy + hr * 0.8, 0.02], [e * hr * 0.72, hy + hr * 0.7, 0.02], [e * hr * 0.66, hy + hr * 1.18, 0.02]], [236, 170, 176], { n: [0, 0.2, 1], two: false });
                    dot([e * hr * 0.38, hy + hr * 0.15, hr * 0.92], hr * 0.09, [24, 22, 26], [e * 0.35, 0.15, 0.92]);
                    for (const dy of [-0.08, 0.06]) limb([e * hr * 0.25, hy - hr * 0.15, hr * 0.95], [e * hr * 1.1, hy - hr * (0.2 - dy), hr * 0.75], 0.0016, [60, 56, 60], { hi: false });
                }
                dot([0, hy - hr * 0.08, hr * 0.98], hr * 0.08, [230, 130, 140], [0, 0, 1]);
                line([[sh * 0.2, sh * 0.12, -sh * 0.1], [sh * 0.38, sh * 0.18, -sh * 0.12], [sh * 0.4, sh * 0.42, -sh * 0.05], [sh * 0.3, sh * 0.5, 0]], sh * 0.045, sh * 0.03, [236, 240, 250]);
                dot([0, sh * 0.48, sh * 0.19], sh * 0.03, [230, 190, 70], [0, 0.2, 1]);
                parts.push({ ...P.cyl([0, sh * 0.46, 0], sh * 0.17, sh * 0.03, [190, 36, 40]), img: sw([190, 36, 40]), top: false });
                caps.push({ at: [0, hy + hr * 0.95, 0], w: hr * 0.5, h: hr * 0.15 });
                return out;
            }
            case 'fence': {
                const fw = K.w, fh = K.h, wood = [130, 90, 60];
                for (let k = 0; k < 6; k++) { const x = -fw / 2 + k * fw / 5; limb([x, 0, 0], [x, fh, 0], 0.007, wood, { cap: 'butt' }); dot([x, fh + 0.004, 0], 0.009, SNOW); }
                for (const y of [fh * 0.35, fh * 0.72]) limb([-fw / 2, y, 0.006], [fw / 2, y, 0.006], 0.0055, shade(wood, 0.9), { cap: 'butt' });
                limb([-fw / 2, fh * 0.76, 0.006], [fw / 2, fh * 0.76, 0.006], 0.0035, SNOW, { cap: 'butt', hi: false });
                return out;
            }
            case 'bench': {
                const bw = K.w, wood = [120, 76, 46], iron = [40, 36, 40];
                for (const x of [-bw * 0.42, bw * 0.38]) { limb([x, 0, 0.03], [x, 0.05, 0.03], 0.004, iron, { hi: false }); limb([x, 0, -0.03], [x, 0.11, -0.035], 0.004, iron, { hi: false }); }
                box([0, 0.048, 0], [bw, 0.008, 0.07], { all: sw(wood, 'bark') }, { snow: sw(SNOW, 'snow') });
                box([0, 0.07, -0.034], [bw, 0.045, 0.006], { all: sw(wood, 'bark') });
                caps.push({ at: [0, 0.117, -0.034], w: bw * 0.45, h: 0.006 });
                return out;
            }
            case 'skaters': {
                // Two skaters hand in hand, heading along x; their legs stride while the music plays.
                const sh = K.h;
                for (const [z, coat, hat] of [[-sh * 0.17, [170, 40, 44], [240, 236, 228]], [sh * 0.17, [50, 80, 140], [200, 50, 60]]]) {
                    for (const e of [-1, 1]) {
                        const leg = P.limb([0, sh * 0.32, z + e * sh * 0.04], [0, sh * 0.04, z + e * sh * 0.05], sh * 0.03, [40, 36, 44]);
                        leg.css = rgb([40, 36, 44]); leg.stride = e; parts.push(leg);
                        const blade = P.limb([-sh * 0.07, sh * 0.005, z + e * sh * 0.05], [sh * 0.08, sh * 0.005, z + e * sh * 0.05], sh * 0.008, [210, 214, 224]);
                        blade.css = rgb([210, 214, 224]); blade.stride = e; blade.blade = true; parts.push(blade);
                    }
                    ell([0, sh * 0.5, z], [sh * 0.09, sh * 0.2, sh * 0.1], coat);
                    ell([0, sh * 0.8, z], [sh * 0.075, sh * 0.085, sh * 0.075], [236, 196, 168]);
                    ell([0, sh * 0.85, z], [sh * 0.078, sh * 0.06, sh * 0.078], hat); dot([0, sh * 0.93, z], sh * 0.03, [250, 250, 250]);
                    dot([sh * 0.07, sh * 0.82, z + sh * 0.02], sh * 0.012, [30, 24, 26], [1, 0, 0]); dot([sh * 0.07, sh * 0.82, z - sh * 0.02], sh * 0.012, [30, 24, 26], [1, 0, 0]);
                    limb([0, sh * 0.68, z], [sh * 0.02, sh * 0.66, z * 0.4], sh * 0.025, [240, 220, 100]);
                }
                limb([0, sh * 0.55, -sh * 0.12], [sh * 0.04, sh * 0.45, 0], sh * 0.025, [170, 40, 44]); limb([0, sh * 0.55, sh * 0.12], [sh * 0.04, sh * 0.45, 0], sh * 0.025, [50, 80, 140]);
                return out;
            }
            case 'presents': {
                const pw = K.w, sets = variant ? [[[200, 60, 120], [250, 230, 120]], [[60, 140, 170], [240, 236, 228]], [[240, 200, 80], [200, 40, 50]]] : [[[180, 30, 40], [240, 210, 100]], [[40, 110, 70], [240, 236, 228]], [[60, 90, 170], [230, 60, 70]]];
                const gift = (col, rib) => Kt.tex(`gift:${col}:${rib}`, R * 0.12, R * 0.12, (g, W, H) => { g.fillStyle = css(col); g.fillRect(0, 0, W, H); mottle(g, 0, 0, W, H, [shade(col, 0.85), lerp(col, [255, 255, 255], 0.2)], 12, W * 0.1, rng(col[0]), 0.4); g.fillStyle = css(rib); g.fillRect(W * 0.43, 0, W * 0.14, H); g.fillRect(0, H * 0.43, W, H * 0.14); });
                const layout = [[-pw * 0.22, 0, 0.02, pw * 0.48, pw * 0.4, 0.3], [pw * 0.22, 0, -0.03, pw * 0.4, pw * 0.34, -0.4], [-pw * 0.05, pw * 0.4, 0.015, pw * 0.32, pw * 0.26, 0.6]];
                layout.forEach(([x, y, z, s, hgt, yaw], i) => {
                    const [col, rib] = sets[i], t = gift(col, rib);
                    box([x, y, z], [s, hgt, s], { all: t }, { yaw, snow: sw(SNOW, 'snow') });
                    for (const e of [-1, 1]) ell(add([x, y + hgt + s * 0.06, z], rotY([e * s * 0.12, 0, 0], yaw)), [s * 0.12, s * 0.07, s * 0.06], rib, { yaw: yaw + e * 0.3 });
                });
                return out;
            }
            case 'sledcat': {
                // An orange cat on a red sled, heading along x.
                const sw2 = K.w, cat = [226, 140, 60];
                for (const e of [-1, 1]) line([[-sw2 * 0.45, sw2 * 0.02, e * sw2 * 0.2], [sw2 * 0.38, sw2 * 0.02, e * sw2 * 0.2], [sw2 * 0.52, sw2 * 0.12, e * sw2 * 0.2]], sw2 * 0.018, sw2 * 0.018, [210, 176, 90]);
                box([0, sw2 * 0.06, 0], [sw2 * 0.85, sw2 * 0.05, sw2 * 0.45], { all: sw([180, 36, 40], 'bark') }, { snow: sw(SNOW, 'snow') });
                ell([-sw2 * 0.06, sw2 * 0.26, 0], [sw2 * 0.18, sw2 * 0.16, sw2 * 0.15], cat);
                ell([sw2 * 0.12, sw2 * 0.46, 0], [sw2 * 0.12, sw2 * 0.11, sw2 * 0.12], cat);
                for (const e of [-1, 1]) tri([[sw2 * 0.12, sw2 * 0.53, e * sw2 * 0.04], [sw2 * 0.12, sw2 * 0.52, e * sw2 * 0.12], [sw2 * 0.13, sw2 * 0.66, e * sw2 * 0.09]], cat);
                for (const e of [-1, 1]) dot([sw2 * 0.23, sw2 * 0.48, e * sw2 * 0.045], sw2 * 0.02, [40, 50, 30], [1, 0, e * 0.3]);
                dot([sw2 * 0.245, sw2 * 0.44, 0], sw2 * 0.016, [210, 110, 110], [1, 0, 0]);
                line([[-sw2 * 0.22, sw2 * 0.2, 0], [-sw2 * 0.4, sw2 * 0.3, -sw2 * 0.04], [-sw2 * 0.38, sw2 * 0.5, -sw2 * 0.06]], sw2 * 0.04, sw2 * 0.025, cat);
                parts.push({ ...P.cyl([sw2 * 0.08, sw2 * 0.36, 0], sw2 * 0.1, sw2 * 0.04, [40, 110, 70]), img: sw([40, 110, 70]), top: false });
                caps.push({ at: [sw2 * 0.12, sw2 * 0.57, 0], w: sw2 * 0.06, h: sw2 * 0.02 });
                return out;
            }
            case 'deer': case 'moose': {
                // A deer (or a moose), heading along x: a body, legs, a neck, a head, antlers.
                const m = kind === 'moose', L = K.w, col = m ? [86, 58, 40] : [150, 104, 66], dark = shade(col, 0.7), legH = L * (m ? 0.5 : 0.45);
                for (const [x, z] of [[-L * 0.22, -L * 0.07], [L * 0.2, -L * 0.07], [-L * 0.22, L * 0.07], [L * 0.2, L * 0.07]]) line([[x, legH + L * 0.02, z], [x + L * 0.01, legH * 0.45, z], [x, 0, z]], L * (m ? 0.032 : 0.022), L * 0.014, z < 0 ? dark : col);
                ell([0, legH + L * 0.1, 0], [L * 0.3, L * (m ? 0.15 : 0.13), L * 0.12], col);
                if (m) ell([L * 0.16, legH + L * 0.2, 0], [L * 0.14, L * 0.1, L * 0.1], col);
                line([[L * 0.22, legH + L * 0.14, 0], [L * 0.32, legH + L * (m ? 0.26 : 0.36), 0]], L * (m ? 0.075 : 0.05), L * (m ? 0.065 : 0.04), col);
                const hx = L * 0.36, hy = legH + L * (m ? 0.26 : 0.4);
                ell([hx, hy, 0], [L * (m ? 0.1 : 0.075), L * 0.06, L * 0.055], col, { pitch: m ? -0.5 : -0.2 });
                ell([hx + L * (m ? 0.11 : 0.07), hy - L * (m ? 0.07 : 0.03), 0], [L * (m ? 0.08 : 0.045), L * (m ? 0.05 : 0.032), L * (m ? 0.05 : 0.035)], shade(col, m ? 0.9 : 1.05), { pitch: -0.4 });
                for (const e of [-1, 1]) {
                    dot([hx + L * 0.04, hy + L * 0.015, e * L * 0.05], L * 0.012, [26, 20, 20], [0.4, 0, e]);
                    tri([[hx - L * 0.02, hy + L * 0.04, e * L * 0.04], [hx - L * 0.06, hy + L * 0.09, e * L * 0.08], [hx - L * 0.07, hy + L * 0.04, e * L * 0.06]], dark);
                    if (m) {
                        // Palms, broad and flat, with their tines.
                        const b = [hx - L * 0.02, hy + L * 0.06, e * L * 0.06];
                        tri([b, [b[0] - L * 0.05, b[1] + L * 0.14, e * L * 0.26], [b[0] + L * 0.08, b[1] + L * 0.1, e * L * 0.22]], [196, 168, 120], { n: [0, 0.5, e] });
                        for (let k = 0; k < 4; k++) limb([b[0] - L * 0.04 + k * L * 0.035, b[1] + L * 0.12 - k * L * 0.005, e * L * (0.25 - k * 0.01)], [b[0] - L * 0.05 + k * L * 0.04, b[1] + L * 0.17, e * L * (0.29 - k * 0.01)], L * 0.008, [196, 168, 120], { hi: false });
                    } else {
                        const b = [hx - L * 0.01, hy + L * 0.05, e * L * 0.03];
                        line([b, [b[0] - L * 0.02, b[1] + L * 0.12, e * L * 0.08], [b[0] - L * 0.08, b[1] + L * 0.2, e * L * 0.1]], L * 0.009, L * 0.006, [110, 80, 56]);
                        limb([b[0] - L * 0.02, b[1] + L * 0.09, e * L * 0.07], [b[0] + L * 0.03, b[1] + L * 0.15, e * L * 0.09], L * 0.007, [110, 80, 56], { hi: false });
                    }
                }
                if (m) line([[hx + L * 0.02, hy - L * 0.08, 0], [hx + L * 0.03, hy - L * 0.16, 0]], L * 0.02, L * 0.008, dark);
                else dot([-L * 0.3, legH + L * 0.13, 0], L * 0.035, [240, 232, 220]);
                caps.push({ at: [-L * 0.02, legH + L * (m ? 0.3 : 0.23), 0], w: L * 0.18, h: L * 0.02 });
                return out;
            }
            case 'train': {
                // An engine and a carriage, heading along x, wheels turning past.
                const tw = K.w, th = K.h, black = [40, 44, 56], red = [180, 36, 40];
                ell([tw * 0.12, th * 0.5, 0], [tw * 0.28, th * 0.25, th * 0.25], black, { pitch: 0 });
                box([-tw * 0.2, th * 0.25, 0], [tw * 0.26, th * 0.7, th * 0.55], { all: Kt.tex('cab', R * 0.06, R * 0.07, (g, W, H) => { g.fillStyle = css(black); g.fillRect(0, 0, W, H); g.fillStyle = css(Kt.lights ? [255, 200, 110] : DARKWIN); g.fillRect(W * 0.2, H * 0.15, W * 0.6, H * 0.3); g.fillStyle = css(red); g.fillRect(0, H * 0.7, W, H * 0.12); }) }, { snow: sw(SNOW, 'snow') });
                parts.push({ ...P.cyl([tw * 0.3, th * 0.68, 0], th * 0.08, th * 0.3, black), img: sw(black) });
                box([-tw * 0.62, th * 0.2, 0], [tw * 0.36, th * 0.6, th * 0.55], { all: Kt.tex('car', R * 0.08, R * 0.06, (g, W, H) => { g.fillStyle = css(red); g.fillRect(0, 0, W, H); for (const x of [0.15, 0.6]) { g.fillStyle = css(Kt.lights ? [255, 200, 110] : DARKWIN); g.fillRect(W * x, H * 0.2, W * 0.25, H * 0.35); } g.fillStyle = css([226, 190, 90]); g.fillRect(0, H * 0.75, W, H * 0.08); }) }, { snow: sw(SNOW, 'snow') });
                for (const x of [-0.7, -0.5, -0.25, 0.05, 0.28]) for (const e of [-1, 1]) ell([x * tw, th * 0.14, e * th * 0.29], [th * 0.14, th * 0.14, th * 0.02], [30, 30, 36]);
                dot([tw * 0.41, th * 0.55, 0], th * 0.07, [255, 230, 150], [1, 0, 0]);
                glows.push({ at: [tw * 0.42, th * 0.55, 0], n: [1, 0, 0], r: th * 0.4, col: [255, 220, 140], lamp: true });
                out.smoke = [tw * 0.3, th * 1.0, 0]; out.smokeMoving = true;
                return out;
            }
            case 'lighthouse': {
                // A white tower in red bands, narrowing, its gallery, the lantern and its dome; the beam goes round.
                const H = K.h * 0.74, r0 = K.w * 0.42, r1 = K.w * 0.3;
                const tower = { ...P.cyl([0, 0, 0], r0, H, [240, 238, 232], { r2: r1 }), img: Kt.tex('tower', R * 0.1, R * 0.3, (g, W, Hh) => { g.fillStyle = css([240, 238, 232]); g.fillRect(0, 0, W, Hh); mottle(g, 0, 0, W, Hh, [[226, 224, 218], [252, 250, 246]], 20, W * 0.12, rng(3), 0.4); }), bands: [null, '#b8262e', null, '#b8262e', null, '#b8262e', null], top: false };
                parts.push(tower);
                for (const [y, a] of [[0.0, 0], [0.45, 2.2], [0.68, -2.0]]) {
                    const rr = r0 + (r1 - r0) * (y || 0.06) - 0.002, n = [Math.sin(a), 0, Math.cos(a)];
                    if (y === 0) { parts.push(P.quad(add([Math.sin(a) * rr, 0, Math.cos(a) * rr], [-0.022, 0, 0]), [0.044, 0, 0], [0, 0.07, 0], Kt.tex('ldoor', R * 0.044, R * 0.07, (g, W, Hh) => { g.fillStyle = css([40, 70, 110]); g.beginPath(); g.moveTo(0, Hh); g.lineTo(0, W / 2); g.arc(W / 2, W / 2, W / 2, Math.PI, 0); g.lineTo(W, Hh); g.closePath(); g.fill(); }), n, { one: true, shade: false })); continue; }
                    dot([Math.sin(a) * (rr + 0.002), H * y, Math.cos(a) * (rr + 0.002)], 0.012, Kt.lights ? [255, 210, 130] : DARKWIN, n, { flat: true });
                    glows.push({ at: [Math.sin(a) * rr, H * y, Math.cos(a) * rr], n, r: 0.04, col: [255, 200, 120] });
                }
                parts.push({ ...P.cyl([0, H, 0], r1 * 1.45, 0.018, [40, 40, 48]), img: sw([40, 40, 48]), topCss: rgb([70, 70, 80]) });
                for (let k = 0; k < 10; k++) { const a = k / 10 * TAU, x = Math.sin(a) * r1 * 1.38, z = Math.cos(a) * r1 * 1.38; limb([x, H + 0.018, z], [x, H + 0.045, z], 0.0025, [30, 30, 36], { hi: false }); }
                parts.push({ ...P.cyl([0, H + 0.018, 0], r1 * 0.85, 0.07, [255, 230, 160]), img: Kt.tex('lantern', R * 0.05, R * 0.07, (g, W, Hh) => { const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, '#c89a50'); gr.addColorStop(0.5, Kt.lights ? '#fff6d0' : '#8090a8'); gr.addColorStop(1, '#a07840'); g.fillStyle = gr; g.fillRect(0, 0, W, Hh); g.fillStyle = 'rgba(40,40,48,0.8)'; for (const x of [0.25, 0.5, 0.75]) g.fillRect(W * x, 0, W * 0.04, Hh); }, false), top: false });
                parts.push({ ...P.cone([0, H + 0.088, 0], r1 * 1.0, 0.07, [[180, 36, 44]], { n: 10 }), c: [0, H + 0.11, 0] });
                dot([0, H + 0.162, 0], 0.008, [230, 200, 100]);
                caps.push({ at: [0, H + 0.15, 0], w: 0.02, h: 0.01 });
                const lamp = [0, H + 0.053, 0];
                glows.push({ at: lamp, n: null, r: 0.1, col: [255, 236, 170], lamp: true });
                out.beam = lamp;
                return out;
            }
            case 'rocks': {
                const Rr = rng(31 + variant * 7), grey = variant ? [150, 160, 176] : [104, 108, 118];
                for (let k = 0; k < 4; k++) {
                    const a = k * 1.7 + Rr(), rr = K.w * (k ? 0.28 : 0.05), x = Math.sin(a) * rr, z = Math.cos(a) * rr, s = K.w * (k ? 0.18 + Rr() * 0.1 : 0.3);
                    ell([x, s * 0.5, z], [s, s * 0.7, s * 0.85], shade(grey, 0.85 + Rr() * 0.3), { yaw: Rr() * 3 });
                    ell([x, s * 0.95, z], [s * 0.75, s * 0.25, s * 0.65], SNOW, { yaw: Rr() * 3 });
                }
                return out;
            }
            case 'candycane': {
                // A candy cane stuck in the snow: white, in red stripes, its crook turned toward its front.
                const hgt = K.h, pts = [];
                for (let i = 0; i <= 14; i++) pts.push([0, hgt * 0.82 * i / 14, 0]);
                for (let i = 1; i <= 10; i++) { const a = i / 10 * Math.PI; pts.push([0, hgt * 0.82 + Math.sin(a) * hgt * 0.14, hgt * 0.14 - Math.cos(a) * hgt * 0.14]); }
                for (let i = 0; i < pts.length - 1; i++) limb(pts[i], pts[i + 1], hgt * 0.05, i % 3 === 0 ? [200, 30, 40] : [248, 246, 240], { hi: false, cap: 'round' });
                caps.push({ at: [0, hgt * 0.97, hgt * 0.14], w: hgt * 0.05, h: hgt * 0.02 });
                return out;
            }
            case 'gingerman': {
                // A gingerbread man stood up in the snow: a flat cookie, iced on his front; he shows his edge as he turns.
                const gw = K.w, gh = K.h, Rv = variant;
                const shape = (g, W, Hh, iced) => {
                    g.fillStyle = css([170, 98, 46]);
                    const p = new Path2D(); const E = (x, y, rx, ry) => { p.moveTo(x + rx, y); p.ellipse(x, y, rx, ry, 0, 0, TAU); };
                    E(W / 2, Hh * 0.2, W * 0.2, Hh * 0.17); E(W / 2, Hh * 0.52, W * 0.24, Hh * 0.22);
                    for (const e of [-1, 1]) { E(W / 2 + e * W * 0.32, Hh * (Rv ? 0.36 : 0.46), W * 0.18, Hh * 0.08); E(W / 2 + e * W * 0.16, Hh * 0.82, W * 0.12, Hh * 0.17); }
                    g.fill(p);
                    g.save(); g.clip(p); mottle(g, 0, 0, W, Hh, [[150, 84, 38], [190, 116, 60]], 30, W * 0.06, rng(7), 0.4); g.restore();
                    if (!iced) return;
                    g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = W * 0.035; g.lineCap = 'round';
                    for (const e of [-1, 1]) { g.beginPath(); g.moveTo(W / 2 + e * W * 0.38, Hh * (Rv ? 0.33 : 0.43)); g.lineTo(W / 2 + e * W * 0.46, Hh * (Rv ? 0.39 : 0.49)); g.stroke(); g.beginPath(); g.moveTo(W / 2 + e * W * 0.1, Hh * 0.95); g.lineTo(W / 2 + e * W * 0.22, Hh * 0.95); g.stroke(); }
                    g.beginPath(); g.arc(W / 2, Hh * 0.22, W * 0.09, 0.3, Math.PI - 0.3); g.stroke();
                    for (const e of [-1, 1]) blob(g, W / 2 + e * W * 0.07, Hh * 0.16, W * 0.03, W * 0.03, [40, 20, 20]);
                    for (const [k, c] of [[0, [220, 40, 50]], [1, [60, 170, 90]], [2, [250, 200, 60]]]) blob(g, W / 2, Hh * (0.42 + k * 0.1), W * 0.045, W * 0.045, c);
                };
                const front = Kt.tex(`gman:${Rv}`, gw * R, gh * R, (g, W, Hh) => shape(g, W, Hh, true)), back = Kt.tex('gman:back', gw * R, gh * R, (g, W, Hh) => shape(g, W, Hh, false));
                parts.push(P.quad([-gw / 2, 0, 0], [gw, 0, 0], [0, gh, 0], front, [0, 0, 1], { back, shade: false, edge: rgb([130, 74, 34]) }));
                caps.push({ at: [0, gh * 0.99, 0], w: gw * 0.12, h: gh * 0.025 });
                return out;
            }
            case 'lolly': {
                const lh = K.h, lr = K.w * 0.5;
                limb([0, 0, 0], [0, lh - lr, 0], 0.006, [246, 244, 238]);
                const swirl = (g, W) => {
                    const c = W / 2, cols = variant ? ['#3d9a5c', '#fff'] : ['#d8323a', '#fff'];
                    g.fillStyle = cols[1]; g.beginPath(); g.arc(c, c, c * 0.98, 0, TAU); g.fill();
                    g.strokeStyle = cols[0]; g.lineWidth = c * 0.22; g.beginPath(); for (let a = 0; a < 18; a += 0.15) { const r = a / 18 * c * 0.9; g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r); } g.stroke();
                    const gr = g.createRadialGradient(c * 0.6, c * 0.6, 0, c, c, c); gr.addColorStop(0, 'rgba(255,255,255,0.4)'); gr.addColorStop(1, 'rgba(0,0,0,0.15)'); g.fillStyle = gr; g.beginPath(); g.arc(c, c, c * 0.98, 0, TAU); g.fill();
                };
                const disc = Kt.tex(`lolly:${variant}`, lr * 2 * R, lr * 2 * R, (g, W) => swirl(g, W));
                parts.push(P.quad([-lr, lh - lr * 2, 0], [lr * 2, 0, 0], [0, lr * 2, 0], disc, [0, 0, 1], { back: disc, shade: false, edge: variant ? '#3d9a5c' : '#d8323a' }));
                caps.push({ at: [0, lh, 0], w: lr * 0.4, h: lr * 0.12 });
                return out;
            }
            case 'bear': case 'cub': {
                // A polar bear (or her cub), heading along x: a heavy body, its haunch and shoulder, thick legs, a long head.
                const L = K.w, col = [238, 222, 188], dark = [206, 188, 156], legH = L * 0.22;
                for (const [x, z] of [[-L * 0.24, -L * 0.1], [L * 0.2, -L * 0.1], [-L * 0.24, L * 0.1], [L * 0.2, L * 0.1]]) limb([x, legH + L * 0.08, z], [x + L * 0.02, L * 0.02, z], L * 0.055, z < 0 ? dark : col, { hi: false });
                ell([0, legH + L * 0.12, 0], [L * 0.34, L * 0.16, L * 0.16], col);
                ell([-L * 0.2, legH + L * 0.13, 0], [L * 0.15, L * 0.15, L * 0.15], col);
                ell([L * 0.24, legH + L * 0.11, 0], [L * 0.12, L * 0.13, L * 0.13], col);
                const hx = L * 0.42, hy = legH + L * (kind === 'cub' ? 0.17 : 0.12);
                line([[L * 0.3, legH + L * 0.14, 0], [hx, hy, 0]], L * 0.09, L * 0.075, col);
                ell([hx + L * 0.04, hy, 0], [L * 0.1, L * 0.075, L * 0.075], col, { pitch: -0.15 });
                ell([hx + L * 0.13, hy - L * 0.02, 0], [L * 0.055, L * 0.045, L * 0.045], col, { pitch: -0.2 });
                dot([hx + L * 0.185, hy - L * 0.012, 0], L * 0.018, [24, 22, 26], [1, 0.1, 0]);
                for (const e of [-1, 1]) { dot([hx + L * 0.08, hy + L * 0.025, e * L * 0.05], L * 0.011, [24, 22, 26], [0.5, 0.2, e]); ell([hx + L * 0.0, hy + L * 0.07, e * L * 0.05], [L * 0.025, L * 0.025, L * 0.015], dark); }
                caps.push({ at: [-L * 0.05, legH + L * 0.28, 0], w: L * 0.2, h: L * 0.02 });
                return out;
            }
            case 'iceblocks': {
                const b = K.w * 0.46, ice = [160, 200, 236];
                const t = sw(ice, 'ice');
                box([-b * 0.55, 0, 0.01], [b, b * 0.8, b * 0.9], { all: t }, { yaw: 0.2, snow: sw(SNOW, 'snow') });
                box([b * 0.55, 0, -0.02], [b * 0.9, b * 0.7, b * 0.85], { all: t }, { yaw: -0.3, snow: sw(SNOW, 'snow') });
                if (!variant) box([0, b * 0.8, 0], [b * 0.9, b * 0.6, b * 0.7], { all: t }, { yaw: 0.6, snow: sw(SNOW, 'snow') });
                return out;
            }
            case 'carousel': {
                // A carousel: its platform, the centre pole, poles with horses that rise and fall as it plays, a
                // striped canopy with a scalloped edge and lights, a flag on top.
                const r = K.w * 0.5, H = K.h, gold = [226, 186, 90], red = [196, 40, 50], cream = [244, 236, 220];
                parts.push({ ...P.cyl([0, 0, 0], r * 0.96, 0.035, red), img: Kt.tex('cplat', R * 0.2, R * 0.04, (g, W, Hh) => { g.fillStyle = css(red); g.fillRect(0, 0, W, Hh); g.fillStyle = css(gold); g.fillRect(0, Hh * 0.15, W, Hh * 0.18); g.fillRect(0, Hh * 0.7, W, Hh * 0.12); }), topCss: rgb([150, 120, 100]), c: [0, 0.01, 0] });
                parts.push({ ...P.cyl([0, 0.035, 0], 0.04, H * 0.7, gold), img: Kt.tex('cpole', R * 0.05, R * 0.2, (g, W, Hh) => { const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, '#a07a30'); gr.addColorStop(0.5, '#f4dc90'); gr.addColorStop(1, '#a07a30'); g.fillStyle = gr; g.fillRect(0, 0, W, Hh); g.fillStyle = 'rgba(196,40,50,0.8)'; for (let y = 0; y < Hh; y += W * 0.8) g.fillRect(0, y, W, W * 0.2); }), top: false });
                const ch = H * 0.73, n = 5, colors = [[244, 240, 232], [60, 40, 36], [200, 160, 110], [244, 240, 232], [120, 120, 130]];
                for (let k = 0; k < n; k++) {
                    const a = k / n * TAU, pr = r * 0.66, px = Math.sin(a) * pr, pz = Math.cos(a) * pr, bob = { amp: 0.025, ph: k * 1.3 };
                    limb([px, 0.035, pz], [px, ch, pz], 0.005, gold, { hi: false });
                    // The horse, heading round (along the tangent), on its pole.
                    const T = p => { const q = rotY(p, a + Math.PI / 2); return [q[0] + px, q[1], q[2] + pz]; }, hc = colors[k], y0 = H * 0.24;
                    const hp = [];
                    const hell = (c, rr, col, o = {}) => { const p = P.ell(T(c), rr, col, { ...o, yaw: a + Math.PI / 2 }); p.img = ball(col); p.bob = bob; parts.push(p); hp.push(p); };
                    const hl = (a0, b0, w, col) => { const p = P.limb(T(a0), T(b0), w, col); p.css = rgb(col); p.bob = bob; parts.push(p); };
                    for (const [x, z, f] of [[-0.035, -0.012, 1], [0.035, -0.012, -1], [-0.035, 0.012, 1], [0.035, 0.012, -1]]) hl([x, y0, z], [x + f * 0.025, y0 - 0.045, z], 0.006, shade(hc, 0.85));
                    hell([0, y0 + 0.01, 0], [0.055, 0.028, 0.024], hc);
                    hl([0.04, y0 + 0.02, 0], [0.06, y0 + 0.06, 0], 0.012, hc);
                    hell([0.075, y0 + 0.065, 0], [0.025, 0.014, 0.013], hc, { pitch: -0.5 });
                    hl([-0.05, y0 + 0.015, 0], [-0.075, y0 - 0.02, 0], 0.007, [230, 200, 120]);
                    hell([0, y0 + 0.04, 0], [0.018, 0.008, 0.026], red);
                }
                parts.push({ ...P.cone([0, ch, 0], r * 1.02, H * 0.27, [red, cream], { n: 16 }), c: [0, ch + 0.05, 0] });
                for (let k = 0; k < 24; k++) { const a = (k + 0.5) / 24 * TAU; dot([Math.sin(a) * r * 1.02, ch - 0.008, Math.cos(a) * r * 1.02], 0.014, k % 2 ? gold : red, [Math.sin(a), 0, Math.cos(a)], { flat: true }); }
                for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; glows.push({ at: [Math.sin(a) * r * 1.02, ch + 0.004, Math.cos(a) * r * 1.02], n: [Math.sin(a), 0.3, Math.cos(a)], r: 0.035, col: [255, 214, 140], bulb: true }); }
                limb([0, ch + H * 0.26, 0], [0, ch + H * 0.36, 0], 0.003, gold, { hi: false });
                tri([[0, ch + H * 0.36, 0], [0, ch + H * 0.31, 0], [0.05, ch + H * 0.335, 0]], red, { n: [0, 0, 1] });
                caps.push({ at: [0, ch + H * 0.26, 0], w: 0.03, h: 0.012 });
                return out;
            }
            case 'penguin': case 'slider': {
                const black = [34, 36, 46], white = [244, 246, 250], orange = [240, 150, 50];
                if (kind === 'slider') {
                    // A penguin on its belly, sliding round, heading along x.
                    const L = K.w;
                    ell([0, L * 0.12, 0], [L * 0.38, L * 0.11, L * 0.13], black);
                    ell([0.005, L * 0.07, 0], [L * 0.32, L * 0.06, L * 0.1], white);
                    ell([L * 0.38, L * 0.17, 0], [L * 0.1, L * 0.09, L * 0.09], black);
                    line([[L * 0.46, L * 0.17, 0], [L * 0.56, L * 0.16, 0]], L * 0.025, L * 0.004, orange);
                    for (const e of [-1, 1]) { dot([L * 0.43, L * 0.21, e * L * 0.06], L * 0.016, white, [0.3, 0.2, e]); line([[0, L * 0.12, e * L * 0.12], [-L * 0.25, L * 0.12, e * L * 0.2]], L * 0.03, L * 0.01, black); ell([-L * 0.38, L * 0.06, e * L * 0.04], [L * 0.05, L * 0.015, L * 0.03], orange); }
                    return out;
                }
                const hgt = K.h;
                ell([0, hgt * 0.4, 0], [hgt * 0.24, hgt * 0.38, hgt * 0.22], black);
                ell([0, hgt * 0.38, hgt * 0.07], [hgt * 0.19, hgt * 0.32, hgt * 0.16], white);
                ell([0, hgt * 0.83, 0], [hgt * 0.15, hgt * 0.15, hgt * 0.15], black);
                for (const e of [-1, 1]) {
                    dot([e * hgt * 0.07, hgt * 0.86, hgt * 0.12], hgt * 0.028, white, [e * 0.4, 0.1, 0.9]); dot([e * hgt * 0.07, hgt * 0.86, hgt * 0.135], hgt * 0.013, [20, 20, 24], [e * 0.4, 0.1, 0.9]);
                    line([[e * hgt * 0.2, hgt * 0.62, 0], [e * hgt * 0.3, hgt * 0.35, 0.01], [e * hgt * 0.28, hgt * 0.2, 0.02]], hgt * 0.05, hgt * 0.02, black);
                    ell([e * hgt * 0.08, hgt * 0.02, hgt * 0.06], [hgt * 0.06, hgt * 0.02, hgt * 0.08], orange);
                }
                line([[0, hgt * 0.82, hgt * 0.13], [0, hgt * 0.79, hgt * 0.26]], hgt * 0.04, hgt * 0.006, orange);
                ell([0, hgt * 0.7, hgt * 0.09], [hgt * 0.1, hgt * 0.04, hgt * 0.06], [250, 210, 90]);
                caps.push({ at: [0, hgt * 0.98, 0], w: hgt * 0.08, h: hgt * 0.03 });
                return out;
            }
            case 'igloo': {
                // An igloo: a dome of snow blocks (their joints go round with it) and a tunnel to its door.
                const r = K.w * 0.5, H = K.h, Rr = rng(9);
                parts.push({ t: 'dome', c: [0, H * 0.4, 0], r, H, img: ball([236, 242, 252], 'snow'), rows: 4, seed: Rr() });
                parts.push({ t: 'dome', c: [0, H * 0.25, r * 1.05], r: r * 0.42, H: H * 0.55, img: ball([236, 242, 252], 'snow'), rz: r * 0.45, z: r * 0.92, rows: 0 });
                dot([0, H * 0.18, r * 1.36], r * 0.2, [40, 50, 74], [0, 0, 1], { flat: true, arch: true });
                if (Kt.lights) glows.push({ at: [0, H * 0.18, r * 1.37], n: [0, 0, 1], r: r * 0.5, col: [255, 190, 110] });
                caps.push({ at: [0, H, 0], w: r * 0.4, h: H * 0.06 });
                return out;
            }
            case 'woodpile': {
                const L = K.w, hgt = K.h;
                const ends = Kt.tex('logends', L * R, hgt * R, (g, W, Hh) => { g.fillStyle = css([80, 54, 34]); g.fillRect(0, 0, W, Hh); const r = Hh / 6; for (let row = 0; row < 3; row++) for (let x = r + (row % 2) * r; x < W - r * 0.5; x += r * 2) { const y = Hh - r - row * r * 1.75; blob(g, x, y, r * 0.95, r * 0.95, [196, 150, 100]); g.strokeStyle = css([140, 96, 60]); g.lineWidth = r * 0.12; g.beginPath(); g.arc(x, y, r * 0.5, 0, TAU); g.stroke(); g.beginPath(); g.arc(x, y, r * 0.95, 0, TAU); g.strokeStyle = css([90, 60, 36]); g.stroke(); } });
                box([0, 0, 0], [L, hgt, L * 0.4], { front: ends, back: ends, left: ends, right: sw([96, 64, 40], 'bark'), top: sw([96, 64, 40], 'bark') }, { snow: sw(SNOW, 'snow') });
                limb([L * 0.32, hgt, L * 0.05], [L * 0.3, hgt + 0.08, L * 0.02], 0.005, [120, 90, 60]);
                ell([L * 0.32, hgt + 0.08, L * 0.02], [0.03, 0.012, 0.006], [170, 170, 180], { yaw: 0.3 });
                return out;
            }
        }
        return out;
    }

    // ---- One thing, this frame --------------------------------------------------------------------------
    // Its parts back to front (each turned and stood where it is), its lit
    // windows and lamps, fresh snow on its tops. Returns nothing; `D.glow` is
    // the baked glow sprite.
    const _o = [0, 0, 0];
    function draw(g, model, place, D) {
        const v = S.view(place), parts = model.parts, R = D.R;
        for (const p of parts) { at(v, p.c[0], p.c[1], p.c[2], _o); p._d = _o[2]; }
        const order = parts.length > 1 ? parts.slice().sort((a, b) => a._d - b._d) : parts;
        for (const p of order) {
            if (p.bob) {
                // (A carousel's horses rise and fall as it plays.)
                const y0 = v.y, d0 = v.depth, off = p.bob.amp * Math.sin(D.spin * 3 + p.bob.ph);
                v.y -= off * S.CT * 0.98 * v.k; v.depth += off * S.TILT * v.k;
                drawPart(g, v, D, p);
                v.y = y0; v.depth = d0;
            } else if (p.stride) {
                // (A skater's feet swing forward and back in turn.)
                const a = p.a, b = p.b, dx = Math.sin(D.spin * 4) * p.stride * 0.03;
                if (p.blade) p.a = [a[0] + dx, a[1], a[2]];
                p.b = [b[0] + dx, b[1], b[2]];
                drawPart(g, v, D, p);
                p.a = a; p.b = b;
            } else if (p.t === 'dome') drawDome(g, v, D, p);
            else drawPart(g, v, D, p);
        }
        // Lit windows, lamps, bulbs.
        if (D.lights && model.glows.length && D.glow) {
            g.globalCompositeOperation = 'lighter';
            for (const gl of model.glows) {
                let f = 1;
                if (gl.n) { f = facing(v, ...gl.n); if (f <= 0) continue; f = clamp(f * 2.5); }
                scr(v, R, gl.at, _o);
                const r = gl.r * R * v.k * (gl.lamp ? 1.5 : 1), tw = gl.bulb ? 0.6 + 0.4 * Math.sin(D.time * 3 + gl.at[0] * 40) : 0.9 + 0.1 * Math.sin(D.time * 3 + gl.at[0] * 9);
                g.globalAlpha = (gl.lamp ? 0.75 : 0.5) * f * tw;
                g.drawImage(D.glow, _o[0] - r, _o[1] - r, r * 2, r * 2);
            }
            g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
        }
        // Fresh snow on its tops (a roof's is in its texture), as deep as has settled.
        const cap = D.cover || 0;
        if (cap > 0.03) {
            g.fillStyle = '#f4f7fd'; g.globalAlpha = Math.min(1, cap * 1.8);
            for (const c of model.caps) {
                if (c.roof) continue;
                scr(v, R, c.at, _o);
                const w = c.w * R * v.k * (0.6 + 0.5 * Math.min(1, cap * 1.4)), h = c.h * R * v.k * (0.5 + Math.min(1, cap * 1.4));
                g.beginPath(); g.ellipse(_o[0], _o[1], Math.max(0.5, w), Math.max(0.4, h), 0, Math.PI, 0); g.closePath(); g.fill();
            }
            g.globalAlpha = 1;
        }
    }
    // A dome on the floor (an igloo, its tunnel): the upper half of a ball, cut
    // where it meets the floor; its blocks' joints, which go round with it.
    function drawDome(g, v, D, p) {
        const R = D.R, rz = p.rz || p.r, base = [0, 0, p.z || 0], B = ellipseOf(v, [p.r, 0, 0], [0, p.H, 0], [0, 0, rz]), cp = scr(v, R, base, [0, 0, 0]);
        // The outline: over the top of the ball's ellipse, then back along the near half of its rim on the floor.
        const rim = [];
        for (let i = 0; i < 32; i++) { const a = i / 32 * TAU; rim.push(scr(v, R, add(base, [Math.sin(a) * p.r, 0, Math.cos(a) * rz]), [0, 0, 0])); }
        let iL = 0, iR = 0;
        rim.forEach((q, i) => { if (q[0] < rim[iL][0]) iL = i; if (q[0] > rim[iR][0]) iR = i; });
        const walk = step => { const out = []; for (let i = iR; ; i = (i + step + 32) % 32) { out.push(rim[i]); if (i === iL) break; } return out; };
        const a = walk(1), b = walk(-1), near = a.reduce((m, q) => m + q[1], 0) / a.length > b.reduce((m, q) => m + q[1], 0) / b.length ? a : b;
        g.save();
        g.beginPath();
        g.save(); g.transform(B[0] * R, B[1] * R, B[2] * R, B[3] * R, cp[0], cp[1]); g.moveTo(-1, 0); g.arc(0, 0, 1, Math.PI, TAU); g.restore();
        for (const q of near) g.lineTo(q[0], q[1]);
        g.closePath(); g.clip();
        g.save(); g.transform(B[0] * R, B[1] * R, B[2] * R, B[3] * R, cp[0], cp[1]); g.drawImage(p.img.c, -1, -1, 2, 2); g.restore();
        // The blocks: rows round it, and staggered joints between, that turn with it.
        if (p.rows) {
            g.strokeStyle = 'rgba(110,130,175,0.55)'; g.lineWidth = Math.max(0.6, R * v.k * 0.004);
            for (let row = 1; row <= p.rows; row++) {
                const el = row / (p.rows + 1) * Math.PI / 2, y = Math.sin(el) * p.H, rr = Math.cos(el), el0 = (row - 1) / (p.rows + 1) * Math.PI / 2, y0 = Math.sin(el0) * p.H, r0 = Math.cos(el0);
                g.beginPath();
                let pen = false;
                for (let i = 0; i <= 32; i++) {
                    const an = i / 32 * TAU;
                    if (facing(v, Math.sin(an), 0.3, Math.cos(an)) < -0.05) { pen = false; continue; }
                    scr(v, R, [Math.sin(an) * p.r * rr, y, base[2] + Math.cos(an) * rz * rr], _o);
                    pen ? g.lineTo(_o[0], _o[1]) : g.moveTo(_o[0], _o[1]); pen = true;
                }
                const n = 9 - row;
                for (let j = 0; j < n; j++) {
                    const an = (j + (row % 2) * 0.5) / n * TAU;
                    if (facing(v, Math.sin(an), 0.3, Math.cos(an)) < 0.05) continue;
                    scr(v, R, [Math.sin(an) * p.r * r0, y0, base[2] + Math.cos(an) * rz * r0], _o); g.moveTo(_o[0], _o[1]);
                    scr(v, R, [Math.sin(an) * p.r * rr, y, base[2] + Math.cos(an) * rz * rr], _o); g.lineTo(_o[0], _o[1]);
                }
                g.stroke();
            }
        }
        g.restore();
    }

    return { kit, build, draw, P, HOUSES };
})();
