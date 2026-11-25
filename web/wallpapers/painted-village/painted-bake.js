// Painted Village's brushwork and light (SPEC §10.41.3).
//
// bake() turns an underpainting (painted-plates.js) into a Painting, a
// little at a time (it is a generator: the manager runs it in slices):
//   paint    every stroke in its local colour, thinned by the air in front
//            of it; full size
//   S, A, B  how much of the sky's light, of the low light from behind
//            and of the day's sun each place takes: greys, painted with the
//            same strokes, half size
//   patches  each lamp's and each floor of windows' own light, in its own
//            colour, a canvas the size of its reach; so one can go out
//   hz       how much air is in front of each place; half size
// Strokes go broad to fine, and the broad ones are on the canvas in the
// first few slices, so the picture paints itself in front of whoever is
// watching.
//
// Painting.step() is the hour's arithmetic, in canvas blends, no pixel read:
//   light = S × sky colour + A × key colour + B × sun colour + patches + the sky itself
//   lit   = paint × light × 2, + the air's colour × hz, + glass glow, + the ice
// Light is kept at half strength in its plate so that it can pass 1.

const PaintedBake = (() => {
    const { clamp, CLS, clsOf, footOf, angOf, run } = PaintedLogic;
    const { MAT, TAU, rng, css, canvas } = PaintedPlates;
    const CODES = new Set(Object.values(CLS));
    const norm = v => { const l = Math.hypot(...v); return v.map(c => c / l); };
    const DIR_A = norm([-0.35, 0.22, 0.9]), DIR_B = norm([-0.5, 0.5, -0.7]);
    const NORMAL = { [CLS.TOP]: [0, 0.78, -0.62], [CLS.UP]: [0, 0.12, -0.99], [CLS.SIDEL]: [-0.97, 0.1, -0.22], [CLS.SIDER]: [0.97, 0.1, -0.22], [CLS.TOPL]: [-0.6, 0.76, -0.25], [CLS.TOPR]: [0.6, 0.76, -0.25] };
    const WARM_MAX = 1.25;                    // patches are painted for the darkest night; an hour shows a share of them
    const ZH = 12;                            // depths over which the air thickens
    // Per material: how much each stroke's value and warmth stray, and how long it runs (× its width).
    const JIT = { [MAT.SKY]: [0.034, 0.012], [MAT.SNOW]: [0.05, 0.035], [MAT.ROOF]: [0.045, 0.03], [MAT.WALL]: [0.09, 0.02], [MAT.STONE]: [0.16, 0.02], [MAT.FIR]: [0.3, 0.02], [MAT.FROST]: [0.09, 0.04], [MAT.ICE]: [0.06, 0.02], [MAT.FIG]: [0.08, 0.01], [MAT.WOOD]: [0.12, 0.01], [MAT.GLASS]: [0.05, 0.02] };
    const LEN = { [MAT.SKY]: 5.5, [MAT.SNOW]: 3.0, [MAT.ROOF]: 2.2, [MAT.WALL]: 2.6, [MAT.STONE]: 0.9, [MAT.FIR]: 1.7, [MAT.FROST]: 0.5, [MAT.ICE]: 4.0, [MAT.FIG]: 1.2, [MAT.WOOD]: 1.6, [MAT.GLASS]: 1.0 };

    // A blur without ctx.filter (WebKit has none): down and up again.
    function soften(src, factor) {
        const w = src.width, h = src.height, small = canvas(w / factor, h / factor), out = canvas(w, h);
        const s = small.getContext('2d'); s.imageSmoothingQuality = 'high'; s.drawImage(src, 0, 0, small.width, small.height);
        const o = out.getContext('2d', { willReadFrequently: true }); o.imageSmoothingQuality = 'high'; o.drawImage(small, 0, 0, w, h);
        return o;
    }

    class Painting {
        constructor(P, opts) {
            const { cam, pw, ph, hw, hh } = P;
            Object.assign(this, { cam, pw, ph, hw, hh, ps: P.ps, glowAt: P.glowAt, opts });
            this.paint = canvas(pw, ph); this.lit = canvas(pw, ph);
            for (const n of ['S', 'A', 'B', 'hz', 'skym', 'lc', 'tmp']) this[n] = canvas(hw, hh);
            { const c = this.skym.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, hw, hh); c.drawImage(P.skym.canvas, 0, 0); }      // white where the sky shows, to begin with
            this.groups = P.groups; this.lights = P.lights; this.bulbs = P.bulbs; this.smokes = P.smokes; this.hits = P.hits; this.spots = P.spots;
            this.masks = []; this.reflects = []; this.ice = null;
            this.progress = 0; this.done = false; this.strokes = 0; this.ms = 0;
        }

        // ---- The hour's arithmetic --------------------------------------------
        // `l` is PaintedLogic.light's; `sky(ctx, l)` draws the sky, at half
        // strength, in CSS pixels; `rect` [x, y, w, h] in CSS pixels limits the
        // work to where something changed; `fx` says which extras are on.
        step(l, sky, rect, fx = {}) {
            const { cam, ps, hw, hh } = this, h = ps / 2;
            const c = this.lc.getContext('2d'), t = this.tmp.getContext('2d'), g = this.lit.getContext('2d');
            const half = v => `rgb(${clamp(v[0] / 2) * 255 | 0},${clamp(v[1] / 2) * 255 | 0},${clamp(v[2] / 2) * 255 | 0})`;
            const clip = (x, s) => { x.save(); if (rect) { x.beginPath(); x.rect(Math.floor(rect[0] * s), Math.floor(rect[1] * s), Math.ceil(rect[2] * s) + 1, Math.ceil(rect[3] * s) + 1); x.clip(); } };
            clip(c, h); clip(t, h); clip(g, ps);
            c.globalCompositeOperation = 'copy'; c.fillStyle = '#000'; c.fillRect(0, 0, hw, hh);
            const term = (plate, colour) => {
                if (colour[0] + colour[1] + colour[2] < 0.012) return;
                t.globalCompositeOperation = 'copy'; t.fillStyle = half(colour); t.fillRect(0, 0, hw, hh);
                t.globalCompositeOperation = 'multiply'; t.drawImage(plate, 0, 0);
                c.globalCompositeOperation = 'lighter'; c.drawImage(this.tmp, 0, 0);
            };
            term(this.S, l.amb); term(this.A, l.keyA); term(this.B, l.keyB);
            // Lamps and windows are screened on, not added: where many meet, the snow keeps some colour.
            c.globalCompositeOperation = 'screen';
            for (const p of this.groups) {
                if (!p.patch || p.level < 0.004) continue;
                if (rect && (p.bx / h > rect[0] + rect[2] || (p.bx + p.patch.width) / h < rect[0] || p.by / h > rect[1] + rect[3] || (p.by + p.patch.height) / h < rect[1])) continue;
                c.globalAlpha = clamp(p.level * p.gain * l.warm / WARM_MAX); c.drawImage(p.patch, p.bx, p.by);
            }
            c.globalAlpha = 1;
            // Light of the caller's own (the Reading Room's shafts of sun), added before the sky's.
            if (fx.light) { fx.light(this, c, t, l); c.globalAlpha = 1; t.globalAlpha = 1; t.setTransform(1, 0, 0, 1, 0, 0); }
            // The sky is its own light.
            t.globalCompositeOperation = 'copy'; t.fillStyle = '#000'; t.fillRect(0, 0, hw, hh);
            t.globalCompositeOperation = 'source-over'; t.setTransform(h, 0, 0, h, 0, 0); sky(t, l); t.setTransform(1, 0, 0, 1, 0, 0);
            t.globalCompositeOperation = 'multiply'; t.drawImage(this.skym, 0, 0);
            c.globalCompositeOperation = 'lighter'; c.drawImage(this.tmp, 0, 0);
            // The corners fall away.
            let gr = c.createRadialGradient(hw * 0.5, hh * 0.52, hh * 0.42, hw * 0.5, hh * 0.52, Math.max(hw * 0.72, hh * 0.9));
            gr.addColorStop(0, '#fff'); gr.addColorStop(1, css(l.vignette));
            c.globalCompositeOperation = 'multiply'; c.fillStyle = gr; c.fillRect(0, 0, hw, hh);
            // The picture, lit.
            g.globalCompositeOperation = 'copy'; g.drawImage(this.paint, 0, 0);
            g.globalCompositeOperation = 'multiply'; g.imageSmoothingQuality = 'high'; g.drawImage(this.lc, 0, 0, hw, hh, 0, 0, hw * 2, hh * 2);
            g.globalCompositeOperation = 'lighter'; g.drawImage(this.lit, 0, 0);
            // The air: its colour, warmer toward the glow, as thick as the plate says.
            const gx = this.glowAt.x * h, gy = this.glowAt.y * h;
            t.globalCompositeOperation = 'copy'; t.fillStyle = css(l.haze0); t.fillRect(0, 0, hw, hh);
            t.globalCompositeOperation = 'source-over';
            t.save(); t.translate(gx, gy); t.scale(1, (cam.Hu * 0.3) / (cam.W * 0.34));
            gr = t.createRadialGradient(0, 0, 0, 0, 0, cam.W * 0.62 * h);
            for (const [at, a] of [[0, 1], [0.25, 0.78], [0.5, 0.37], [0.75, 0.1], [1, 0]]) gr.addColorStop(at, css(l.haze1, a));
            t.fillStyle = gr; t.fillRect(-hw * 3, -hh * 6, hw * 6, hh * 12); t.restore();
            t.globalCompositeOperation = 'multiply'; t.drawImage(this.hz, 0, 0);
            if (l.veil > 0.004) {
                t.globalCompositeOperation = 'lighter';
                gr = t.createRadialGradient(gx, gy, 0, gx, gy, cam.W * 0.42 * h); gr.addColorStop(0, css(l.glow, l.veil)); gr.addColorStop(1, css(l.glow, 0));
                t.fillStyle = gr; t.fillRect(0, 0, hw, hh);
            }
            g.globalCompositeOperation = 'lighter'; g.drawImage(this.tmp, 0, 0, hw, hh, 0, 0, hw * 2, hh * 2);
            g.globalCompositeOperation = 'source-over';
            // Light off the glass and round the lamps.
            g.globalCompositeOperation = 'lighter';
            for (const p of this.groups) if (p.glow && p.level > 0.004) { g.globalAlpha = clamp(p.level * (0.45 + 0.3 * l.warm)); g.drawImage(p.glow, p.gx, p.gy, p.glow.width * 2, p.glow.height * 2); }
            g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
            // Whatever the caller lays over the lit picture (the shafts in the air).
            if (fx.after) { fx.after(this, g, l); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
            if (fx.sets) this.stepBulbs(g, fx.sets, fx.palette);
            // The ice last: it shows the lamps and the bulbs too.
            if (this.ice && fx.reflections !== 0) this.stepIce(g, l, fx.reflections ?? 1);
            c.restore(); t.restore(); g.restore();
        }

        // The ice: the sky upside down in it, then whatever stands by it, run
        // down a little, kept to where the ice is bare.
        stepIce(g, l, alpha) {
            const { cam, ps } = this, h = ps / 2, I = this.ice, ic = I.ctx, w = I.canvas.width, hgt = I.canvas.height;
            const hor = cam.hor * ps;
            // Its own colour, and the top of the sky's: what is over our heads is in the near ice.
            ic.setTransform(1, 0, 0, 1, 0, 0); ic.globalAlpha = 1; ic.globalCompositeOperation = 'copy'; ic.fillStyle = css([l.ice[0] * 0.6 + l.sky0[0] * 0.4, l.ice[1] * 0.6 + l.sky0[1] * 0.4, l.ice[2] * 0.6 + l.sky0[2] * 0.4]); ic.fillRect(0, 0, w, hgt);
            ic.globalCompositeOperation = 'source-over';
            // Picture pixels to the ice's own canvas: half size, from its corner.
            const base = [0.5, 0, 0, 0.5, -I.x * h, -I.y * h];
            ic.setTransform(...base); ic.transform(1, 0, 0, -1, 0, hor * 2); ic.globalAlpha = 0.55;
            ic.drawImage(this.lit, 0, 0, this.pw, hor, 0, 0, this.pw, hor);
            const r = I.scratch, rc = r.getContext('2d');
            for (const m of this.reflects) {
                rc.globalCompositeOperation = 'copy'; rc.drawImage(this.lit, m.x * ps, m.y * ps, m.w * ps, m.h * ps, 0, 0, m.mask.width, m.mask.height);
                rc.globalCompositeOperation = 'destination-in'; rc.drawImage(m.mask, 0, 0);
                ic.setTransform(...base); ic.transform(1, 0, 0, -0.92, 0, m.fy * ps * 1.92); ic.globalAlpha = 0.42;
                ic.drawImage(r, 0, 0, m.mask.width, m.mask.height, m.x * ps, m.y * ps, m.w * ps, m.h * ps);
            }
            // Ice is not a mirror: what it shows runs down, a long way.
            ic.setTransform(1, 0, 0, 1, 0, 0); ic.globalAlpha = 1;
            const bc = I.blur.getContext('2d'); bc.imageSmoothingQuality = 'high';
            bc.globalCompositeOperation = 'copy'; bc.drawImage(I.canvas, 0, 0, w, hgt, 0, 0, I.blur.width, I.blur.height);
            ic.imageSmoothingQuality = 'high'; ic.globalAlpha = 0.9; ic.drawImage(I.blur, 0, 0, I.blur.width, I.blur.height, 0, 0, w, hgt);
            ic.globalAlpha = 1; ic.globalCompositeOperation = 'destination-in'; ic.drawImage(I.mask, 0, 0);
            g.globalAlpha = alpha * 0.66; g.drawImage(I.canvas, I.x * ps, I.y * ps, w * 2, hgt * 2); g.globalAlpha = 1;
        }

        // The strings and the trees' bulbs, as they burn steadily; the manager
        // twinkles a few on top. `sets` is how bright each kind is (tree,
        // trees, string, candle); candles are their own colour.
        stepBulbs(g, sets, palette) {
            const ps = this.ps, CANDLE = [1, 0.8, 0.45];
            for (const b of this.bulbs) {
                const level = sets[b.set] || 0;
                if (level < 0.01) continue;
                const c = b.set === 'candle' ? CANDLE : palette[b.i % palette.length];
                g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.5 * level; g.fillStyle = css(c, 0.5); g.beginPath(); g.arc(b.x * ps, b.y * ps, b.r * 3.2 * ps, 0, TAU); g.fill();
                g.globalCompositeOperation = 'source-over'; g.globalAlpha = Math.min(1, level * 1.4);
                g.fillStyle = css([c[0] * 0.55 + 0.45, c[1] * 0.55 + 0.45, c[2] * 0.55 + 0.45]); g.beginPath(); g.arc(b.x * ps, b.y * ps, b.r * ps, 0, TAU); g.fill();
            }
            g.globalAlpha = 1;
        }

        // The light on someone standing at (x metres, depth z), y metres up:
        // sky, key and whichever lamps are near and lit. For the cast.
        lightAt(l, x, z, y, out) {
            const zm = z * this.cam.zm;
            let r = l.amb[0] * 1.1 + l.keyA[0] * 0.26 + l.keyB[0] * 0.62, g = l.amb[1] * 1.1 + l.keyA[1] * 0.26 + l.keyB[1] * 0.62, b = l.amb[2] * 1.1 + l.keyA[2] * 0.26 + l.keyB[2] * 0.62;
            let side = 0;
            for (const L of this.lights) {
                const lv = this.groups[L.group].level;
                if (lv < 0.01) continue;
                const dx = L.x - x, dy = L.y - y, dz = L.zm - zm, d2 = dx * dx + dy * dy + dz * dz + 1.2;
                if (d2 > L.reach2) continue;
                const fall = 1 - (d2 / L.reach2) ** 2, e = L.I * 0.5 / d2 * fall * lv * l.warm;
                r += L.c[0] * e; g += L.c[1] * e; b += L.c[2] * e; side += e * Math.sign(dx);
            }
            out[0] = r; out[1] = g; out[2] = b; out[3] = side;
            return out;
        }
    }

    // ---- The bake ---------------------------------------------------------------
    // opts: { seed, brush (× stroke widths), passes (how many of the six), ridge, weave, air (depths over which the air thickens) }
    function* bake(P, opts = {}) {
        const T = new Painting(P, opts), t0 = performance.now();
        const { cam, pw: W, ph: H, hw, hh, ps } = P;
        const U = cam.u * ps, HOR = cam.hor * ps, F = cam.f * ps, PPM = cam.ppm * ps, ZM = cam.zm;
        const R = rng((opts.seed || 1) * 7919 + 13), rr = (a, b) => a + (b - a) * R();
        yield T;

        // The plates, as numbers. An edge blended between two kinds of surface
        // or two materials is neither: it takes a neighbour's.
        const A = P.alb.getImageData(0, 0, W, H).data, G = P.geo.getImageData(0, 0, W, H).data, M = P.mat.getImageData(0, 0, W, H).data;
        yield;
        for (let y = 0, i = 0; y < H; y++) {
            for (let x = 0; x < W; x++, i += 4) {
                if (CODES.has(G[i + 1]) && M[i + 2] % 20 === 0) continue;
                let from = -1;
                for (const q of [i - 4, i + 4, i - W * 4, i + W * 4, i - W * 4 - 4, i + W * 4 + 4]) if (q >= 0 && q < G.length && CODES.has(G[q + 1]) && M[q + 2] % 20 === 0) { from = q; break; }
                if (from < 0) { G[i + 1] = clsOf(G[i + 1]); M[i + 2] = Math.round(M[i + 2] / 20) * 20; } else { G[i] = G[from]; G[i + 1] = G[from + 1]; G[i + 2] = G[from + 2]; M[i] = M[from]; M[i + 1] = M[from + 1]; M[i + 2] = M[from + 2]; }
            }
            if (y % 200 === 199) yield;
        }
        const Bm = soften(P.bump.canvas, Math.max(1.5, 1.5 * U)).getImageData(0, 0, hw, hh).data;
        const ShA = soften(P.shadowA.canvas, Math.max(2, 2.5 * U)).getImageData(0, 0, hw, hh).data, ShB = soften(P.shadowB.canvas, Math.max(2, 2 * U)).getImageData(0, 0, hw, hh).data;
        yield;

        // Lights: how far each reaches, and a canvas per group the size of that.
        const lights = P.lights, h = 0.5;
        for (const L of lights) { L.reach = Math.min(18, Math.sqrt(L.I) * 4.6); L.reach2 = L.reach * L.reach; }
        for (const g of P.groups) {
            let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
            for (const L of g.lights) {
                const zl = L.zm / ZM, zn = Math.max(0.72, (L.zm - L.reach) / ZM), zf = (L.zm + L.reach) / ZM;
                for (const z of [zn, zl]) { x0 = Math.min(x0, W / 2 + (L.x - L.reach) * PPM / z); x1 = Math.max(x1, W / 2 + (L.x + L.reach) * PPM / z); y0 = Math.min(y0, HOR + F / z - (L.y + L.reach * 0.7) * PPM / z); }
                y0 = Math.min(y0, HOR + F / zf - 4); y1 = Math.max(y1, HOR + F / zn);
            }
            for (const s of g.glass) { x0 = Math.min(x0, s.x * ps - 4); x1 = Math.max(x1, (s.x + s.w) * ps + 4); y0 = Math.min(y0, s.y * ps - 4); y1 = Math.max(y1, (s.y + s.h) * ps + 4); }
            x0 = Math.max(0, Math.floor(x0 / 2)); y0 = Math.max(0, Math.floor(y0 / 2)); x1 = Math.min(hw, Math.ceil(x1 / 2)); y1 = Math.min(hh, Math.ceil(y1 / 2));
            if (x1 <= x0 || y1 <= y0) continue;
            g.patch = canvas(x1 - x0, y1 - y0); g.bx = x0; g.by = y0;
            g.pc = g.patch.getContext('2d'); g.pc.fillStyle = '#000'; g.pc.fillRect(0, 0, x1 - x0, y1 - y0);
            g.pc.setTransform(h, 0, 0, h, -x0, -y0); g.pc.lineCap = 'round';
        }
        const acc = new Float32Array(P.groups.length * 3), touched = [];

        // What a place is, read off the plates at picture pixel (x, y).
        const o = { r: 0, g: 0, b: 0, t: 0, S: 0, A: 0, B: 0, cls: 0, m: 0, ground: false, sky: false };
        const gx0 = P.glowAt.x * ps, gy0 = P.glowAt.y * ps, dB = Math.max(1, Math.round(0.75 * U));
        const place = (x, y, withLights) => {
            x = clamp(x | 0, 2, W - 3); y = clamp(y | 0, 2, H - 3);
            const i = (y * W + x) * 4, cls = G[i + 1], m = M[i + 2] / 20;
            o.cls = cls; o.m = m; o.r = A[i] / 255; o.g = A[i + 1] / 255; o.b = A[i + 2] / 255;
            const hz = G[i + 2] / 255;
            touched.length = 0;
            if (cls === CLS.SELF) {
                o.sky = m === MAT.SKY; o.ground = false; o.t = hz; o.S = o.sky ? 0 : 0.22; o.A = o.B = o.sky ? 0 : 0.04;
                return o;
            }
            o.sky = false;
            const ground = o.ground = cls === CLS.GROUND, foot = ground ? y : footOf(G[i], cam) * ps, z = foot > HOR + 1.5 ? F / (foot - HOR) : 400;
            const xm = (x - W / 2) * z / PPM, ym = ground ? 0 : Math.max(0, (foot - y) * z / PPM), zm = z * ZM;
            const hi = ((y >> 1) * hw + (x >> 1)) * 4;
            let nx, ny, nz, top = false;
            if (ground) {
                const bi = (clamp(y >> 1, dB, hh - 1 - dB) * hw + clamp(x >> 1, dB, hw - 1 - dB)) * 4;      // kept off the edges: the slope is read a few pixels each way
                const bx = (Bm[bi + dB * 4] - Bm[bi - dB * 4]) / 255 / dB * U, by = (Bm[bi + dB * hw * 4] - Bm[bi - dB * hw * 4]) / 255 / dB * U, kb = 9 * Math.min(3, Math.sqrt(z));
                nx = -bx * kb; nz = by * kb * 1.6; const len = Math.hypot(nx, 1, nz); nx /= len; ny = 1 / len; nz /= len;
            } else { const n = NORMAL[cls] || NORMAL[CLS.UP]; nx = n[0]; ny = n[1]; nz = n[2]; top = ny > 0.5; }
            const lies = ground || top, shA = lies ? ShA[hi + 3] / 255 : 0, shB = lies ? ShB[hi + 3] / 255 : 0;
            const glow = Math.exp(-(((x - gx0) / (W * 0.34)) ** 2) - (((y - gy0) / (H * 0.3)) ** 2));
            o.S = 0.56 + 0.44 * ny;
            let a = Math.max(0, nx * DIR_A[0] + ny * DIR_A[1] + nz * DIR_A[2]) * (1 - 0.9 * shA), b = Math.max(0, nx * DIR_B[0] + ny * DIR_B[1] + nz * DIR_B[2]) * (1 - 0.8 * shB);
            if (m === MAT.FROST) { a = 0.34 + 0.5 * glow; b = 0.55; }      // frost lets the light through
            if (m === MAT.FIR) { a += 0.10 * glow; b = b * 0.8 + 0.1; }
            if (top) { a += 0.1; b += 0.06; }                              // snow glows a little wherever it lies
            if (!lies) a += 0.07 * glow;                                    // and the glow gets round the edge of things
            o.A = Math.min(1, a); o.B = Math.min(1, b);
            o.t = Math.max(hz, 1 - Math.exp(-(z - 1) / (opts.air || ZH)));
            if (withLights) for (let j = 0; j < lights.length; j++) {
                const L = lights[j], dx = L.x - xm, dy = L.y - ym, dz = L.zm - zm, d2 = dx * dx + dy * dy + dz * dz + L.r2;
                if (d2 > L.reach2) continue;
                const inv = 1 / Math.sqrt(d2);
                let ndl = (nx * dx + ny * dy + nz * dz) * inv;
                if (!ground) ndl = (ndl + 0.3) / 1.3 * (top ? 0.9 : 0.55);
                if (ndl <= 0) continue;
                let e = L.I * ndl / d2 * (1 - (d2 / L.reach2) ** 2);
                if (L.face) e *= clamp(-(dx * L.face[0] + dz * L.face[1]) * inv * 1.6 + 0.25);
                const k = L.group * 3;
                if (acc[k] + acc[k + 1] + acc[k + 2] === 0) touched.push(L.group);
                acc[k] += L.c[0] * e; acc[k + 1] += L.c[1] * e; acc[k + 2] += L.c[2] * e;
            }
            return o;
        };

        // The first picture: the underpainting, thinned by the air, under a
        // light that is right by kind of surface and has no pools yet.
        {
            const pc = T.paint.getContext('2d'), put = (cv, fn) => {
                const c = cv.getContext('2d'), id = c.createImageData(hw, hh), d = id.data;
                for (let y = 0, q = 0; y < hh; y++) for (let x = 0; x < hw; x++, q += 4) { const v = fn(place(x * 2, y * 2, false)); d[q] = d[q + 1] = d[q + 2] = v * 255; d[q + 3] = 255; }
                c.putImageData(id, 0, 0);
            };
            put(T.S, p => p.S); yield; put(T.A, p => p.A); yield; put(T.B, p => p.B); yield; put(T.hz, p => p.t); yield;
            put(T.tmp, p => 1 - p.t);
            pc.drawImage(P.alb.canvas, 0, 0); pc.globalCompositeOperation = 'multiply'; pc.imageSmoothingQuality = 'high'; pc.drawImage(T.tmp, 0, 0, hw, hh, 0, 0, hw * 2, hh * 2); pc.globalCompositeOperation = 'source-over';
        }
        // The ice: where it is, and a canvas for what it shows.
        if (P.spots.ice) {
            const pad = 26 * cam.u, [x0, y0, x1, y1] = [P.spots.ice[0] - pad, P.spots.ice[1] - pad, P.spots.ice[2] + pad, P.spots.ice[3] + pad], bx = Math.max(0, Math.floor(x0 * ps / 2)), by = Math.max(0, Math.floor(y0 * ps / 2)), bw = Math.min(hw, Math.ceil(x1 * ps / 2)) - bx, bh = Math.min(hh, Math.ceil(y1 * ps / 2)) - by;
            if (bw > 4 && bh > 4) {
                const cv = canvas(bw, bh), mask = canvas(bw, bh), mc = mask.getContext('2d');
                mc.setTransform(h, 0, 0, h, -bx, -by); mc.lineCap = 'round';
                T.reflects = P.reflections();
                const big = T.reflects.reduce((m, r) => [Math.max(m[0], r.mask.width), Math.max(m[1], r.mask.height)], [1, 1]);
                T.ice = { canvas: cv, ctx: cv.getContext('2d'), mask, mc, x: bx * 2 / ps, y: by * 2 / ps, scratch: canvas(big[0], big[1]), blur: canvas(bw / 5, bh / 7) };
            }
        }
        T.masks = P.masks(P.cam.bands || PaintedLogic.BANDS);
        T.progress = 0.04;
        yield;

        const g = T.paint.getContext('2d'); g.lineCap = 'round';
        const lg = ['S', 'A', 'B'].map(n => { const c = T[n].getContext('2d'); c.setTransform(h, 0, 0, h, 0, 0); c.lineCap = 'round'; return c; });
        const hzc = T.hz.getContext('2d'); hzc.setTransform(h, 0, 0, h, 0, 0); hzc.lineCap = 'round';
        const skc = T.skym.getContext('2d'); skc.setTransform(h, 0, 0, h, 0, 0); skc.lineCap = 'round';
        const grey = v => { const n = clamp(v) * 255 | 0; return `rgb(${n},${n},${n})`; };
        const widths = [30, 15, 8, 4.4, 2.4, 1.4].slice(0, opts.passes || 6).map(w => w * U * (opts.brush || 1));
        const ridge = opts.ridge !== false;

        for (let pass = 0; pass < widths.length; pass++) {
            const w = widths[pass], stepG = w * 0.6, cols = Math.ceil(W / stepG) + 1, rows = Math.ceil(H / stepG) + 1;
            const cap = cols * rows, S = new Float32Array(cap * 11);
            let n = 0;
            // Lay the pass: a jittered grid, each stroke walking out both ways from its place.
            for (let gy = 0; gy < rows; gy++) {
                for (let gx = 0; gx < cols; gx++) {
                    const x = clamp((gx + rr(-0.5, 0.5)) * stepG, 2, W - 3), y = clamp((gy + rr(-0.5, 0.5)) * stepG, 2, H - 3);
                    const xi = x | 0, yi = y | 0, i = (yi * W + xi) * 4, m = M[i + 2] / 20, cls = G[i + 1];
                    let fine = M[i + 1] / 4 * U;
                    if (cls === CLS.GROUND && m !== MAT.ICE) fine = Math.max(fine * (0.3 + 0.9 * (yi - HOR) / F), 3.2 * U);     // far snow, smaller touches
                    if (w < fine * 0.72) continue;                       // this place wants nothing finer
                    if (w > fine * 4.2 && R() < 0.7) continue;           // and little of the broad coat shows under the fine
                    let ang = angOf(M[i]);
                    if (ang == null) {
                        if (m === MAT.SKY) ang = -0.18 + 0.3 * Math.sin(x / (240 * U) + y / (120 * U)) + 0.2 * Math.sin(y / (60 * U));
                        else if (cls === CLS.GROUND) {
                            const hi = ((yi >> 1) * hw + (xi >> 1)) * 4, bx = Bm[hi + 4] - Bm[hi - 4], by = Bm[hi + hw * 4] - Bm[hi - hw * 4];
                            let c = (bx * bx + by * by > 9) ? Math.atan2(by, bx) + Math.PI / 2 : 0; c = Math.atan(Math.tan(c));
                            ang = clamp(c, -0.5, 0.5) * 0.8 + (x - W / 2) / W * 0.25 * ((yi - HOR) / F);
                        } else ang = R() * Math.PI;
                    }
                    ang += rr(-0.22, 0.22);
                    const dx = Math.cos(ang), dy = Math.sin(ang), maxL = w * (LEN[m] || 2) * rr(0.6, 1.1), st = Math.max(1, w / 3), k = n * 11;
                    S[k] = x; S[k + 1] = y; S[k + 2] = dx; S[k + 3] = dy;
                    S[k + 4] = run(A, G, W, H, x, y, -dx, -dy, maxL, st); S[k + 5] = run(A, G, W, H, x, y, dx, dy, maxL, st);
                    S[k + 6] = w * rr(0.72, 1.18); S[k + 7] = R(); S[k + 8] = R(); S[k + 9] = rr(-0.22, 0.22); S[k + 10] = m === MAT.ICE && cls === CLS.GROUND ? 1 : 0;
                    n++;
                }
                if (gy % 6 === 5) yield;
            }
            const order = new Uint32Array(n);
            for (let i = 0; i < n; i++) order[i] = i;
            for (let i = n - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)), s = order[i]; order[i] = order[j]; order[j] = s; }
            const lightsToo = w >= 4 * U, pools = w >= 7 * U;
            // Paint it: into the picture, and into the light it will be seen by.
            for (let q = 0; q < n; q++) {
                const k = order[q] * 11, x = S[k], y = S[k + 1], dx = S[k + 2], dy = S[k + 3], sw = S[k + 6];
                const p = place(x, y, pools), jit = JIT[p.m] || JIT[MAT.WALL], kv = 1 + (S[k + 7] - 0.5) * 2 * jit[0], tw = (S[k + 8] - 0.5) * 2 * jit[1], air = 1 - p.t;
                const r = (p.r * kv + tw) * air, gg = p.g * kv * air, b = (p.b * kv - tw) * air;
                const x0 = x - dx * S[k + 4], y0 = y - dy * S[k + 4], x1 = x + dx * S[k + 5] + 0.01, y1 = y + dy * S[k + 5] + 0.01, len = S[k + 4] + S[k + 5];
                const mx = x - dy * S[k + 9] * len, my = y + dx * S[k + 9] * len;
                g.globalAlpha = 0.94; g.lineWidth = sw; g.strokeStyle = `rgb(${clamp(r) * 255 | 0},${clamp(gg) * 255 | 0},${clamp(b) * 255 | 0})`;
                g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(mx, my, x1, y1); g.stroke();
                if (ridge && sw >= 4 * U) {                              // the ridge the bristles leave: light one side, shade the other
                    const ox = -0.30 * sw, oy = -0.34 * sw;
                    g.lineWidth = sw * 0.22; g.globalAlpha = 0.30; g.strokeStyle = `rgb(${clamp(r * 1.1 + 0.03) * 255 | 0},${clamp(gg * 1.1 + 0.03) * 255 | 0},${clamp(b * 1.1 + 0.03) * 255 | 0})`;
                    g.beginPath(); g.moveTo(x0 + ox, y0 + oy); g.quadraticCurveTo(mx + ox, my + oy, x1 + ox, y1 + oy); g.stroke();
                    g.globalAlpha = 0.22; g.strokeStyle = `rgb(${clamp(r * 0.84) * 255 | 0},${clamp(gg * 0.84) * 255 | 0},${clamp(b * 0.88) * 255 | 0})`;
                    g.beginPath(); g.moveTo(x0 - ox, y0 - oy); g.quadraticCurveTo(mx - ox, my - oy, x1 - ox, y1 - oy); g.stroke();
                }
                // The air goes with the stroke, so that a far thing's edge is not a fringe.
                // The air goes with the stroke, and whether it is sky: each stroke owns its
                // place in every plate, so that no edge is a fringe of one thing lit as another.
                hzc.lineWidth = sw; hzc.strokeStyle = grey(p.t); hzc.beginPath(); hzc.moveTo(x0, y0); hzc.quadraticCurveTo(mx, my, x1, y1); hzc.stroke();
                skc.lineWidth = sw; skc.strokeStyle = p.sky ? '#fff' : '#000'; skc.beginPath(); skc.moveTo(x0, y0); skc.quadraticCurveTo(mx, my, x1, y1); skc.stroke();
                if (lightsToo) {
                    const v = [p.S, p.A, p.B];
                    for (let c = 0; c < 3; c++) { const lc = lg[c]; lc.lineWidth = sw; lc.strokeStyle = grey(v[c]); lc.beginPath(); lc.moveTo(x0, y0); lc.quadraticCurveTo(mx, my, x1, y1); lc.stroke(); }
                }
                for (let j = 0; j < touched.length; j++) {
                    const gi = touched[j], gk = gi * 3, grp = P.groups[gi], top = Math.max(acc[gk], acc[gk + 1], acc[gk + 2]);
                    // A soft knee, so that the hottest of a pool is still its own colour.
                    const knee = top > 0 ? 1.0 * (1 - Math.exp(-top / 1.0)) / top * WARM_MAX / 2 : 0, e0 = acc[gk] * knee, e1 = acc[gk + 1] * knee, e2 = acc[gk + 2] * knee;
                    acc[gk] = acc[gk + 1] = acc[gk + 2] = 0;
                    if (!grp.pc) continue;
                    const c = grp.pc; c.lineWidth = sw; c.strokeStyle = `rgb(${clamp(e0) * 255 | 0},${clamp(e1) * 255 | 0},${clamp(e2) * 255 | 0})`;
                    c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(mx, my, x1, y1); c.stroke();
                }
                if (S[k + 10] && T.ice) {                                // bare ice shows what stands by it; blown snow does not
                    const c = T.ice.mc, snow = clamp((p.r * 255 - 100) / 120);
                    c.globalAlpha = (1 - snow * 0.85) * (0.6 + 0.4 * S[k + 7]); c.lineWidth = sw; c.strokeStyle = '#000';
                    c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(mx, my, x1, y1); c.stroke();
                }
                if ((q & 127) === 127) { T.progress = 0.04 + 0.94 * (pass + q / n) / widths.length; yield; }
            }
            T.strokes += n; T.pass = pass + 1;
            yield;
        }

        // Glass is lit from within: it joins its own group's light. And the
        // glow off it, at three sizes, once.
        const emit = P.emit.canvas;
        for (const p of P.groups) {
            if (!p.patch || !p.glass.length) { delete p.pc; continue; }
            let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
            for (const s of p.glass) { x0 = Math.min(x0, s.x); y0 = Math.min(y0, s.y); x1 = Math.max(x1, s.x + s.w); y1 = Math.max(y1, s.y + s.h); }
            for (const s of p.halos) { x0 = Math.min(x0, s.x - s.r * 3); y0 = Math.min(y0, s.y - s.r * 3); x1 = Math.max(x1, s.x + s.r * 3); y1 = Math.max(y1, s.y + s.r * 3); }
            const pad = 44 * cam.u, bx = Math.max(0, Math.floor((x0 - pad) * ps / 2)), by = Math.max(0, Math.floor((y0 - pad) * ps / 2));
            const bw = Math.min(hw, Math.ceil((x1 + pad) * ps / 2)) - bx, bh = Math.min(hh, Math.ceil((y1 + pad) * ps / 2)) - by;
            if (bw < 2 || bh < 2) { delete p.pc; continue; }
            // Its own glass, where nothing stands in front of it.
            const own = canvas(bw, bh), oc = own.getContext('2d');
            oc.setTransform(ps / 2, 0, 0, ps / 2, -bx, -by);
            for (const s of p.glass) { oc.fillStyle = s.col; oc.beginPath(); if (s.round) oc.ellipse(s.x + s.w / 2, s.y + s.h / 2, s.w / 2, s.h / 2, 0, 0, TAU); else PaintedPlates.poly(oc, s.pts); oc.fill(); }
            oc.setTransform(1, 0, 0, 1, 0, 0); oc.globalCompositeOperation = 'destination-in'; oc.drawImage(emit, bx * 2, by * 2, bw * 2, bh * 2, 0, 0, bw, bh);
            // Into the patch, as light of its own: the glass shows its colour.
            const c = p.pc; c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'lighter';
            const flat = canvas(bw, bh), fc = flat.getContext('2d'); fc.drawImage(own, 0, 0); fc.globalCompositeOperation = 'source-in'; fc.fillStyle = 'rgb(160,160,160)'; fc.fillRect(0, 0, bw, bh);
            c.drawImage(flat, bx - p.bx, by - p.by);
            // The glow: the glass, spread.
            const glow = canvas(bw, bh), gc = glow.getContext('2d'); gc.imageSmoothingQuality = 'high';
            const s2 = canvas(bw / 4, bh / 4), s3 = canvas(bw / 14, bh / 14);
            s2.getContext('2d').drawImage(own, 0, 0, s2.width, s2.height); s3.getContext('2d').drawImage(s2, 0, 0, s3.width, s3.height);
            gc.globalCompositeOperation = 'lighter';
            gc.globalAlpha = 0.14; gc.drawImage(own, 0, 0); gc.globalAlpha = 0.2; gc.drawImage(s2, 0, 0, bw, bh); gc.globalAlpha = 0.16; gc.drawImage(s3, 0, 0, bw, bh);
            gc.globalAlpha = 1;
            for (const s of p.halos) {
                if (!visible(emit, s.x * ps, s.y * ps)) continue;
                const hx = s.x * ps / 2 - bx, hy = s.y * ps / 2 - by, hr = s.r * 3 * ps / 2, gr = gc.createRadialGradient(hx, hy, 0, hx, hy, hr);
                gr.addColorStop(0, 'rgba(255,214,140,0.42)'); gr.addColorStop(0.3, 'rgba(255,180,90,0.1)'); gr.addColorStop(1, 'rgba(255,160,70,0)');
                gc.fillStyle = gr; gc.beginPath(); gc.arc(hx, hy, hr, 0, TAU); gc.fill();
            }
            p.glow = glow; p.gx = bx * 2; p.gy = by * 2;
            delete p.pc;
            yield;
        }
        // A bulb behind something nearer is not seen.
        T.bulbs = P.bulbs.filter(b => { const x = clamp(b.x * ps | 0, 0, W - 1), y = clamp(b.y * ps | 0, 0, H - 1), i = (y * W + x) * 4; return G[i + 1] === CLS.SELF || footOf(G[i], cam) <= b.foot + 3 * cam.u || G[i + 1] === CLS.GROUND; });
        // Places where the sky is open, for the stars that twinkle.
        T.openSky = [];
        for (let i = 0; i < 600; i++) { const x = R() * cam.W, y = R() * cam.hor, q = ((y * ps | 0) * W + (x * ps | 0)) * 4; if (G[q + 1] === CLS.SELF && M[q + 2] === 0) T.openSky.push({ x, y, v: R() }); }
        // The signwriter's lettering, over the brushwork, unless something stands in front of it.
        for (const t of P.letters) {
            const x = clamp(t.x * ps | 0, 0, W - 1), y = clamp(t.y * ps | 0, 0, H - 1), i = (y * W + x) * 4;
            if (G[i + 1] !== CLS.GROUND && footOf(G[i], cam) > (t.foot ?? 0) + 3 * cam.u) continue;
            g.save(); g.globalAlpha = 0.95; g.font = `700 ${t.px * ps}px Georgia, "Times New Roman", serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = css(t.col);
            g.translate(t.x * ps, t.y * ps); g.scale(t.squeeze || 1, 1); g.fillText(t.str, 0, 0); g.restore();
        }
        // The weave of the canvas, once, into the painting.
        if (opts.weave !== false) {
            const t = canvas(128, 128), tc = t.getContext('2d'), id = tc.createImageData(128, 128);
            for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) { const v = 128 + 26 * Math.sin(x * Math.PI / 1.5) * Math.sin(y * Math.PI / 1.5) + rr(-22, 22), q = (y * 128 + x) * 4; id.data[q] = id.data[q + 1] = id.data[q + 2] = v; id.data[q + 3] = 255; }
            tc.putImageData(id, 0, 0);
            g.save(); g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.11; g.fillStyle = g.createPattern(t, 'repeat'); g.fillRect(0, 0, W, H); g.restore();
        }
        T.progress = 1; T.done = true; T.ms = performance.now() - t0;
        return T;
    }

    // Whether the emit plate still shows at a picture pixel (one small read, at bake time).
    function visible(emit, x, y) {
        const c = canvas(1, 1).getContext('2d', { willReadFrequently: true });
        c.drawImage(emit, x | 0, y | 0, 1, 1, 0, 0, 1, 1);
        return c.getImageData(0, 0, 1, 1).data[3] > 40;
    }

    return { bake, Painting, DIR_A, DIR_B, WARM_MAX };
})();
