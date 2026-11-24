// Snow Globe (SPEC §10.42): the art. Everything is painted in two steps, as
// Painted Village is (§10.41): an underpainting (shapes filled in their
// colour and lit: the candle warm from one side, the window's moonlight cool
// from above and behind) and then brushwork over it, broad to fine, each
// stroke taking the colour under its middle and running along the form
// until that colour changes (SnowGlobeLogic.run), so silhouettes hold and
// everything else is loose. The brushwork is a generator: the manager runs
// it a few milliseconds a frame, so the first frame shows the underpainting
// and the strokes arrive over it. No pixel is read after the bake.

const SnowGlobeArt = (() => {
    const { TAU, clamp, mix, rng, run, FLOOR, FLOOR_R, TILT, project, KINDS } = SnowGlobeLogic;

    // ---- Small helpers ----------------------------------------------------------------------
    const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
    const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
    const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
    const lerp = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
    const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const WARM = [255, 186, 110], COOL = [150, 178, 230], SNOW = [236, 242, 252];
    function ell(g, x, y, rx, ry, rot = 0) { g.beginPath(); g.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU); }
    function blob(g, x, y, rx, ry, col, a = 1, rot = 0) { g.fillStyle = css(col, a); ell(g, x, y, rx, ry, rot); g.fill(); }
    function poly(g, pts) { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); }
    // Light a shape that is already drawn (within its own pixels): shade on
    // the side away from `side` (-1 left, 1 right: where the candle is), a
    // warm sheen toward it, and cool light from above.
    function light(g, x0, y0, x1, y1, side, o = {}) {
        g.save();
        g.globalCompositeOperation = 'source-atop';
        const gr = g.createLinearGradient(side > 0 ? x0 : x1, 0, side > 0 ? x1 : x0, 0);
        gr.addColorStop(0, `rgba(10,12,30,${o.dark ?? 0.5})`); gr.addColorStop(0.55, 'rgba(10,12,30,0)'); gr.addColorStop(1, css(WARM, o.warm ?? 0.28));
        g.fillStyle = gr; g.fillRect(x0, y0, x1 - x0, y1 - y0);
        const gv = g.createLinearGradient(0, y0, 0, y1);
        gv.addColorStop(0, css(COOL, o.top ?? 0.16)); gv.addColorStop(0.5, 'rgba(0,0,0,0)'); gv.addColorStop(1, `rgba(8,8,20,${o.foot ?? 0.3})`);
        g.fillStyle = gv; g.fillRect(x0, y0, x1 - x0, y1 - y0);
        g.restore();
    }
    // Soft dabs of a colour over a shape (texture before the brushwork).
    function mottle(g, x0, y0, w, h, cols, n, size, R, a = 0.35) {
        g.save(); g.globalCompositeOperation = 'source-atop';
        for (let i = 0; i < n; i++) { const c = cols[Math.floor(R() * cols.length)]; blob(g, x0 + R() * w, y0 + R() * h, size * (0.5 + R()), size * (0.3 + R() * 0.6), c, a * (0.4 + R() * 0.6), R() * TAU); }
        g.restore();
    }
    // A blur without ctx.filter (WebKit has none): down and up again.
    function soften(src, factor) {
        const small = canvas(src.width / factor, src.height / factor), out = canvas(src.width, src.height);
        const s = small.getContext('2d'); s.imageSmoothingQuality = 'high'; s.drawImage(src, 0, 0, small.width, small.height);
        const o = out.getContext('2d'); o.imageSmoothingQuality = 'high'; o.drawImage(small, 0, 0, out.width, out.height);
        return out;
    }
    // A soft round light, baked: [r, g, b], radius in px.
    function glow(r, col, core = 0.25) {
        const c = canvas(r * 2, r * 2), g = c.getContext('2d'), gr = g.createRadialGradient(r, r, 0, r, r, r);
        gr.addColorStop(0, css(lerp(col, [255, 255, 255], 0.4), 1)); gr.addColorStop(core, css(col, 0.5)); gr.addColorStop(0.6, css(col, 0.12)); gr.addColorStop(1, css(col, 0));
        g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2);
        return c;
    }

    // ---- Brushwork --------------------------------------------------------------------------
    // o: { widths: [px…], seed, dir(x, y) → angle or null (null follows the
    // form: across the way the colour changes), len (× width), tol, jit
    // (how much each stroke's value strays), keep (false: strokes may leave
    // the shape) }. Yields every few hundred strokes; returns the canvas.
    function* strokes(src, o = {}) {
        const w = src.width, h = src.height, out = canvas(w, h), g = out.getContext('2d');
        g.drawImage(src, 0, 0);
        if (w < 8 || h < 8) return out;
        const data = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
        const R = rng((o.seed || 1) * 7919 + 17), widths = o.widths || [12, 6, 3], len = o.len || 2.4, tol = o.tol || 64, jit = o.jit ?? 0.07;
        g.lineCap = 'round';
        let n = 0;
        for (let pass = 0; pass < widths.length; pass++) {
            const bw = widths[pass];
            if (bw < 0.8) continue;
            const step = bw * 0.62, cols = Math.ceil(w / step), rows = Math.ceil(h / step), skip = pass === widths.length - 1 ? (o.fine ?? 0.45) : pass === 0 ? 0.1 : 0;
            for (let gy = 0; gy < rows; gy++) {
                for (let gx = 0; gx < cols; gx++) {
                    if (skip && R() < skip) continue;
                    const x = Math.min(w - 2, Math.max(1, (gx + R()) * step)), y = Math.min(h - 2, Math.max(1, (gy + R()) * step)), i = ((y | 0) * w + (x | 0)) * 4;
                    if (data[i + 3] < 140) continue;
                    let ang = o.dir ? o.dir(x / w, y / h) : null;
                    if (ang == null) {
                        // Across the change of colour: along the form.
                        const s = Math.max(1, Math.round(bw * 0.5)), xa = Math.max(0, (x | 0) - s), xb = Math.min(w - 1, (x | 0) + s), ya = Math.max(0, (y | 0) - s), yb = Math.min(h - 1, (y | 0) + s);
                        const L = q => data[q] + data[q + 1] + data[q + 2];
                        const gxv = L(((y | 0) * w + xb) * 4) - L(((y | 0) * w + xa) * 4), gyv = L((yb * w + (x | 0)) * 4) - L((ya * w + (x | 0)) * 4);
                        ang = Math.abs(gxv) + Math.abs(gyv) > 30 ? Math.atan2(gyv, gxv) + Math.PI / 2 : R() * Math.PI;
                    }
                    ang += (R() - 0.5) * 0.45;
                    const dx = Math.cos(ang), dy = Math.sin(ang), max = bw * len * (0.6 + R() * 0.6), st = Math.max(1, bw / 3);
                    const a = run(data, w, h, x, y, -dx, -dy, max, st, tol), b = run(data, w, h, x, y, dx, dy, max, st, tol);
                    const kv = 1 + (R() - 0.5) * 2 * jit, tw = (R() - 0.5) * 2 * jit * 40;
                    const r = clamp((data[i] * kv + tw) / 255), gg = clamp(data[i + 1] * kv / 255), bb = clamp((data[i + 2] * kv - tw) / 255);
                    const x0 = x - dx * a, y0 = y - dy * a, x1 = x + dx * b + 0.01, y1 = y + dy * b + 0.01, bend = (R() - 0.5) * 0.3 * (a + b);
                    g.globalAlpha = 0.9; g.lineWidth = bw * (0.75 + R() * 0.4); g.strokeStyle = `rgb(${r * 255 | 0},${gg * 255 | 0},${bb * 255 | 0})`;
                    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(x - dy * bend, y + dx * bend, x1, y1); g.stroke();
                    if (bw >= 5) {             // the ridge the bristles leave
                        const ox = -0.28 * bw, oy = -0.32 * bw;
                        g.lineWidth = bw * 0.2; g.globalAlpha = 0.26; g.strokeStyle = `rgb(${clamp(r * 1.12 + 0.03) * 255 | 0},${clamp(gg * 1.12 + 0.03) * 255 | 0},${clamp(bb * 1.1 + 0.03) * 255 | 0})`;
                        g.beginPath(); g.moveTo(x0 + ox, y0 + oy); g.quadraticCurveTo(x - dy * bend + ox, y + dx * bend + oy, x1 + ox, y1 + oy); g.stroke();
                    }
                    if ((++n & 255) === 0) yield n;
                }
            }
        }
        g.globalAlpha = 1;
        if (o.keep !== false) { g.globalCompositeOperation = 'destination-in'; g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-over'; }
        // Crisp touches that the brush must not blur (windows' bars, eyes), drawn after.
        if (o.after) o.after(g);
        out.strokes = n;
        return out;
    }
    function paint(src, o) { const it = strokes(src, o); let r; while (!(r = it.next()).done); return r.value; }
    // The canvas's weave, once, over a painting.
    function weave(g, w, h, seed, a = 0.08) {
        const t = canvas(96, 96), tc = t.getContext('2d'), id = tc.createImageData(96, 96), R = rng(seed);
        for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) { const v = 128 + 24 * Math.sin(x * Math.PI / 1.5) * Math.sin(y * Math.PI / 1.5) + (R() - 0.5) * 40, q = (y * 96 + x) * 4; id.data[q] = id.data[q + 1] = id.data[q + 2] = v; id.data[q + 3] = 255; }
        tc.putImageData(id, 0, 0);
        g.save(); g.globalCompositeOperation = 'overlay'; g.globalAlpha = a; g.fillStyle = g.createPattern(t, 'repeat'); g.fillRect(0, 0, w, h); g.restore();
    }

    // ---- The room -----------------------------------------------------------------------------
    // Two layers: outside (the night through the window) and the room (the
    // wall, the window's frame with its panes left clear, the surface the
    // globe stands on, the shadows on it). ps: device px per CSS px.
    // o: { room: 'sill'|'mantel'|'desk', candle, treeLights, seed }.
    function outside(L, ps, o) {
        const W = L.W * ps, H = L.H * ps, c = canvas(W, H), g = c.getContext('2d'), R = rng(o.seed * 31 + 5), win = L.win;
        g.scale(ps, ps);
        const y0 = win.y, y1 = win.y + win.h;
        const sky = g.createLinearGradient(0, y0, 0, y1);
        sky.addColorStop(0, '#0a1230'); sky.addColorStop(0.55, '#1c2c58'); sky.addColorStop(1, '#3a4a78');
        g.fillStyle = sky; g.fillRect(0, 0, L.W, L.H);
        // The moon, high on one side, and its haze.
        const mx = win.x + win.w * (o.side > 0 ? 0.2 : 0.8), my = y0 + win.h * 0.22, mr = Math.min(win.w, win.h) * 0.06;
        g.drawImage(glow(mr * 7, [150, 170, 230], 0.08), mx - mr * 7, my - mr * 7);
        blob(g, mx, my, mr, mr, [244, 240, 222]);
        blob(g, mx - mr * 0.3, my - mr * 0.2, mr * 0.25, mr * 0.2, [220, 216, 200], 0.6);
        for (let i = 0; i < 90; i++) { const x = win.x + R() * win.w, y = y0 + R() * win.h * 0.55; if (Math.hypot(x - mx, y - my) < mr * 3) continue; blob(g, x, y, 0.5 + R() * 1.1, 0.5 + R() * 1.1, [230, 236, 255], 0.3 + R() * 0.6); }
        // Hills under snow, far and near, and a village's lights.
        const ridge = (base, amp, col, seed) => {
            const r = rng(seed); g.fillStyle = css(col); g.beginPath(); g.moveTo(win.x - 20, y1 + 10);
            for (let x = win.x - 20; x <= win.x + win.w + 20; x += 8) g.lineTo(x, base + Math.sin(x * 0.006 + seed) * amp + Math.sin(x * 0.017 + seed * 2) * amp * 0.4 + (r() - 0.5) * 2);
            g.lineTo(win.x + win.w + 20, y1 + 10); g.closePath(); g.fill();
        };
        ridge(y0 + win.h * 0.66, win.h * 0.05, [92, 110, 150], 3);
        ridge(y0 + win.h * 0.76, win.h * 0.04, [128, 146, 184], 7);
        for (let i = 0; i < 26; i++) {           // far firs on the ridge
            const x = win.x + R() * win.w, y = y0 + win.h * (0.74 + R() * 0.06), s = win.h * (0.03 + R() * 0.035);
            g.fillStyle = css([40, 58, 80]); poly(g, [x, y - s * 2.2, x - s * 0.7, y, x + s * 0.7, y]); g.fill();
            g.fillStyle = css([170, 186, 214], 0.7); poly(g, [x, y - s * 2.2, x - s * 0.25, y - s * 1.4, x + s * 0.25, y - s * 1.4]); g.fill();
        }
        for (let i = 0; i < 7; i++) {            // a village down the hill
            const x = win.x + win.w * (0.15 + R() * 0.7), y = y0 + win.h * (0.8 + R() * 0.05), s = win.h * 0.035;
            g.fillStyle = css([52, 50, 70]); g.fillRect(x - s, y - s, s * 2, s * 1.2); poly(g, [x - s * 1.2, y - s, x, y - s * 1.9, x + s * 1.2, y - s]); g.fill();
            g.fillStyle = css([210, 220, 240], 0.85); poly(g, [x - s * 1.2, y - s, x, y - s * 1.9, x + s * 1.2, y - s, x, y - s * 1.5]); g.fill();
            blob(g, x - s * 0.45, y - s * 0.4, s * 0.22, s * 0.24, [255, 200, 110]);
            g.drawImage(glow(s * 1.6, [255, 170, 80]), x - s * 0.45 - s * 1.6, y - s * 0.4 - s * 1.6);
        }
        ridge(y0 + win.h * 0.9, win.h * 0.025, [170, 186, 220], 11);
        return c;
    }
    function room(L, ps, o) {
        const W = L.W * ps, H = L.H * ps, c = canvas(W, H), g = c.getContext('2d'), R = rng(o.seed * 17 + 3), win = L.win, side = o.side;
        g.scale(ps, ps);
        const kind = o.room || 'sill', back = L.back, cand = L.candle;
        // The wall: plaster, warm where the candle is, cooler by the window.
        const wallCol = kind === 'mantel' ? [92, 48, 44] : kind === 'desk' ? [54, 62, 58] : [74, 58, 54];
        g.fillStyle = css(shade(wallCol, 0.7)); g.fillRect(0, 0, L.W, back + 2);
        mottle(g, 0, 0, L.W, back, [shade(wallCol, 0.85), shade(wallCol, 0.6), lerp(wallCol, [120, 90, 70], 0.3)], 260, L.R * 0.3, R, 0.3);
        if (kind === 'mantel') {                   // a papered wall: stripes of a damask
            g.save(); g.globalAlpha = 0.18;
            for (let x = 0; x < L.W; x += L.R * 0.5) { g.fillStyle = css([150, 96, 70]); g.fillRect(x, 0, L.R * 0.08, back); for (let y = L.R * 0.2; y < back; y += L.R * 0.45) { blob(g, x + L.R * 0.25, y, L.R * 0.06, L.R * 0.1, [170, 120, 80]); } }
            g.restore();
        }
        if (kind === 'desk') {                     // shelves of books along the wall
            const sh = L.R * 0.62;
            for (let y = L.top + L.R * 0.25; y < back - sh * 0.4; y += sh) {
                for (let x = 0; x < L.W;) {
                    if (x > win.x - 10 && x < win.x + win.w + 10) { x = win.x + win.w + 10; continue; }
                    const bw = L.R * (0.06 + R() * 0.07), bh = sh * (0.62 + R() * 0.3), col = [[120, 40, 36], [40, 70, 60], [150, 110, 60], [44, 50, 90], [110, 80, 60], [90, 30, 50]][Math.floor(R() * 6)];
                    g.fillStyle = css(col); g.fillRect(x, y + sh - bh - sh * 0.1, bw, bh);
                    g.fillStyle = css([220, 180, 100], 0.6); g.fillRect(x, y + sh - bh * 0.8 - sh * 0.1, bw, bh * 0.04);
                    x += bw + 1;
                }
                g.fillStyle = css([70, 46, 30]); g.fillRect(0, y + sh * 0.9, L.W, sh * 0.1);
            }
        }
        // Candlelight on the wall.
        if (o.candle) {
            const gr = g.createRadialGradient(cand.x, cand.y - cand.h, 0, cand.x, cand.y - cand.h, L.R * 4);
            gr.addColorStop(0, css(WARM, 0.55)); gr.addColorStop(0.35, css(WARM, 0.2)); gr.addColorStop(1, css(WARM, 0));
            g.fillStyle = gr; g.fillRect(0, 0, L.W, back);
        }
        const vg = g.createLinearGradient(0, 0, 0, back);
        vg.addColorStop(0, 'rgba(8,6,16,0.55)'); vg.addColorStop(1, 'rgba(8,6,16,0)');
        g.fillStyle = vg; g.fillRect(0, 0, L.W, back);
        if (kind !== 'mantel') {
            // The window: a painted frame, four panes or six, clear (the night shows through), frost in their corners.
            const fw = Math.max(6, L.R * 0.09), cols = win.w > win.h * 1.3 ? 3 : 2, rows = 2;
            const frame = [236, 228, 214];
            g.fillStyle = css(shade(frame, 0.55)); g.fillRect(win.x - fw * 1.6, win.y - fw * 1.6, win.w + fw * 3.2, win.h + fw * 2.6);
            g.fillStyle = css(shade(frame, 0.8)); g.fillRect(win.x - fw, win.y - fw, win.w + fw * 2, win.h + fw * 1.6);
            light(g, win.x - fw * 1.6, win.y - fw * 1.6, win.x + win.w + fw * 1.6, win.y + win.h + fw, side, { warm: 0.4, dark: 0.35 });
            const pw = (win.w - fw * (cols - 1)) / cols, ph = (win.h - fw * (rows - 1)) / rows;
            c.panes = [];
            for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) c.panes.push({ x: win.x + q * (pw + fw), y: win.y + r * (ph + fw), w: pw, h: ph });
            g.save(); g.globalCompositeOperation = 'destination-out';
            for (const p of c.panes) g.fillRect(p.x, p.y, p.w, p.h);
            g.restore();
            // Frost in the corners of the glass, and the room's own lights in it, out of focus.
            for (const p of c.panes) {
                for (const [fx, fy] of [[p.x, p.y + p.h], [p.x + p.w, p.y + p.h], [p.x, p.y], [p.x + p.w, p.y]]) {
                    const fr = Math.min(p.w, p.h) * (fy > p.y + 1 ? 0.45 : 0.25), gr = g.createRadialGradient(fx, fy, 0, fx, fy, fr);
                    gr.addColorStop(0, 'rgba(220,232,250,0.55)'); gr.addColorStop(0.5, 'rgba(210,226,250,0.18)'); gr.addColorStop(1, 'rgba(210,226,250,0)');
                    g.fillStyle = gr; g.fillRect(p.x, p.y, p.w, p.h);
                }
                for (let i = 0; i < 24; i++) { const x = p.x + R() * p.w, y = p.y + p.h * (0.7 + R() * 0.3); g.strokeStyle = 'rgba(230,240,255,0.25)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 12, y - R() * 14); g.stroke(); }
            }
            if (o.treeLights) {
                const cols2 = [[255, 90, 70], [255, 200, 90], [90, 200, 120], [110, 150, 255], [255, 140, 200]];
                g.save(); g.globalAlpha = 0.4;
                for (let i = 0; i < 18; i++) {
                    const p = c.panes[Math.floor(R() * c.panes.length)], x = p.x + R() * p.w, y = p.y + p.h * (0.45 + R() * 0.5), r = L.R * (0.025 + R() * 0.03);
                    g.drawImage(glow(r * 2, cols2[i % 5], 0.5), x - r * 2, y - r * 2);
                }
                g.restore();
            }
            // A garland along the top of the window, with its bulbs.
            for (let i = 0; i < 70; i++) {
                const t = i / 69, x = win.x - fw + t * (win.w + fw * 2), y = win.y - fw * 0.5 + Math.sin(t * Math.PI * 3) * fw * 1.2 + Math.abs(Math.sin(t * Math.PI * 3)) * fw * 0.8;
                blob(g, x, y, fw * 1.1, fw * 0.6, [30 + R() * 20, 70 + R() * 30, 46], 0.95, R() * TAU);
                if (i % 5 === 0) blob(g, x, y + fw * 0.4, fw * 0.28, fw * 0.28, [200, 40, 40]);
            }
            // Curtains, heavy and dark, at each side.
            for (const s of [-1, 1]) {
                const x0 = s < 0 ? win.x - fw * 1.6 - L.R * 0.6 : win.x + win.w + fw * 1.6 - L.R * 0.1, cw = L.R * 0.7, col = kind === 'desk' ? [48, 70, 60] : [110, 30, 36];
                const gr = g.createLinearGradient(x0, 0, x0 + cw, 0);
                for (let k = 0; k <= 6; k++) gr.addColorStop(k / 6, css(shade(col, 0.55 + 0.45 * Math.abs(Math.sin(k * 1.7)))));
                g.fillStyle = gr; g.fillRect(x0, L.top, cw, back - L.top);
                light(g, x0, L.top, x0 + cw, back, side, { warm: 0.3, dark: 0.3 });
            }
        } else {
            // Over the mantel, a gilt frame with a snowy hillside in it, dim.
            const fw = L.R * 2.2, fh = L.R * 1.5, fx = L.cx - fw / 2, fy = L.top + (back - L.top) * 0.12;
            g.fillStyle = css([150, 112, 50]); g.fillRect(fx - L.R * 0.1, fy - L.R * 0.1, fw + L.R * 0.2, fh + L.R * 0.2);
            light(g, fx - L.R * 0.1, fy - L.R * 0.1, fx + fw + L.R * 0.1, fy + fh + L.R * 0.1, side, { warm: 0.5 });
            const gr = g.createLinearGradient(0, fy, 0, fy + fh); gr.addColorStop(0, '#2b3550'); gr.addColorStop(0.6, '#6a7590'); gr.addColorStop(1, '#c8ccd8');
            g.fillStyle = gr; g.fillRect(fx, fy, fw, fh);
            for (let i = 0; i < 14; i++) { const x = fx + R() * fw, y = fy + fh * (0.55 + R() * 0.3), s = fh * 0.08; g.fillStyle = css([40, 56, 60]); poly(g, [x, y - s * 2, x - s * 0.6, y, x + s * 0.6, y]); g.fill(); }
        }
        // The surface: sill, mantel shelf or desk, from where it meets the wall to the bottom of the screen.
        const top = back, bot = L.H, surf = kind === 'desk' ? [84, 50, 32] : kind === 'mantel' ? [150, 140, 128] : [168, 150, 132];
        const sg = g.createLinearGradient(0, top, 0, bot);
        sg.addColorStop(0, css(shade(surf, 0.55))); sg.addColorStop(0.3, css(shade(surf, 0.82))); sg.addColorStop(0.75, css(shade(surf, 0.6))); sg.addColorStop(1, css(shade(surf, 0.38)));
        g.fillStyle = sg; g.fillRect(0, top, L.W, bot - top);
        if (kind === 'desk') { g.save(); g.globalAlpha = 0.25; for (let i = 0; i < 40; i++) { const y = top + R() * (bot - top); g.strokeStyle = css([40, 22, 14]); g.lineWidth = 1 + R() * 2; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(L.W * 0.3, y + (R() - 0.5) * 20, L.W * 0.7, y + (R() - 0.5) * 20, L.W, y + (R() - 0.5) * 10); g.stroke(); } g.restore(); }
        else { mottle(g, 0, top, L.W, bot - top, [shade(surf, 0.9), shade(surf, 0.75)], 60, L.R * 0.5, R, 0.15); g.save(); g.globalAlpha = 0.12; for (let i = 0; i < 30; i++) { const y = top + R() * (bot - top); g.strokeStyle = css(shade(surf, 0.6)); g.lineWidth = 1 + R() * 2; g.beginPath(); g.moveTo(0, y); g.lineTo(L.W, y + (R() - 0.5) * 6); g.stroke(); } g.restore(); }
        // Where it meets the wall, a shadow line; its front edge, a band.
        g.fillStyle = 'rgba(10,8,14,0.5)'; g.fillRect(0, top, L.W, Math.max(2, L.R * 0.03));
        const edge = kind === 'mantel' ? Math.min(L.foot + L.R * 0.3, L.bottom - L.R * 0.75) : L.foot + (L.bottom - L.foot) * 0.6;
        if (edge < L.H - 4) { const eg = g.createLinearGradient(0, edge, 0, L.H); eg.addColorStop(0, css(shade(surf, 0.55))); eg.addColorStop(0.1, css(shade(surf, 0.75))); eg.addColorStop(1, css(shade(surf, 0.3))); g.fillStyle = eg; g.fillRect(0, edge, L.W, L.H - edge); }
        if (kind === 'mantel') {                    // garland along the shelf's front edge, and stockings
            for (let i = 0; i < 80; i++) { const t = i / 79, x = t * L.W, y = edge + Math.abs(Math.sin(t * Math.PI * 5)) * L.R * 0.18; blob(g, x, y, L.R * 0.1, L.R * 0.06, [30 + R() * 20, 76 + R() * 30, 50], 0.95, R() * TAU); if (i % 6 === 0) blob(g, x, y + L.R * 0.04, L.R * 0.03, L.R * 0.03, [210, 40, 40]); }
            for (const sx of [0.14, 0.86]) {
                const x = L.W * sx, y = edge + L.R * 0.12, s = Math.min(L.R * 0.5, (L.bottom - edge) * 0.62), col = sx < 0.5 ? [180, 30, 36] : [40, 110, 70];
                g.fillStyle = css(col); g.beginPath(); g.moveTo(x - s * 0.3, y); g.lineTo(x + s * 0.3, y); g.lineTo(x + s * 0.3, y + s * 0.9); g.quadraticCurveTo(x + s * 0.3, y + s * 1.25, x - s * 0.1, y + s * 1.2); g.lineTo(x - s * 0.55, y + s * 1.2); g.quadraticCurveTo(x - s * 0.8, y + s * 1.0, x - s * 0.5, y + s * 0.85); g.lineTo(x - s * 0.3, y + s * 0.7); g.closePath(); g.fill();
                g.fillStyle = css([240, 236, 228]); g.fillRect(x - s * 0.36, y - s * 0.05, s * 0.72, s * 0.22);
                light(g, x - s * 0.8, y, x + s * 0.4, y + s * 1.3, side, {});
            }
        }
        // Light on the surface: the candle's pool, the window's cool sheen.
        if (o.candle) {
            const gr = g.createRadialGradient(cand.x, cand.y, 0, cand.x, cand.y, L.R * 3.4);
            gr.addColorStop(0, css(WARM, 0.5)); gr.addColorStop(0.4, css(WARM, 0.16)); gr.addColorStop(1, css(WARM, 0));
            g.save(); g.beginPath(); g.rect(0, top, L.W, L.H - top); g.clip(); g.fillStyle = gr; g.fillRect(0, top, L.W, L.H - top); g.restore();
        }
        if (kind !== 'mantel') { const gr = g.createLinearGradient(0, top, 0, top + L.R * 1.2); gr.addColorStop(0, css(COOL, 0.25)); gr.addColorStop(1, css(COOL, 0)); g.fillStyle = gr; g.fillRect(win.x - L.R, top, win.w + L.R * 2, L.R * 1.2); }
        // Soft shadows where the globe, the cat and the candle stand (away from the candle).
        g.save(); g.globalCompositeOperation = 'multiply';
        const shadow = (x, y, rx, ry, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, rx); gr.addColorStop(0, `rgba(40,30,40,${a})`); gr.addColorStop(1, 'rgba(40,30,40,0)'); g.save(); g.translate(x, y); g.scale(1, ry / rx); g.translate(-x, -y); g.fillStyle = gr; g.fillRect(x - rx, y - rx, rx * 2, rx * 2); g.restore(); };
        shadow(L.base.x - side * L.R * 0.5, L.foot + L.R * 0.02, L.R * 1.4, L.R * 0.28, 0.7);
        if (o.cat) shadow(L.cat.x - side * L.R * 0.3, L.cat.y, L.cat.h * 0.45, L.cat.h * 0.08, 0.6);
        if (o.candle) shadow(cand.x, cand.y + 2, cand.h * 0.45, cand.h * 0.1, 0.5);
        g.restore();
        // The light the water focuses: a warm bright spot on the far side of the globe from the candle.
        if (o.candle) { const x = L.base.x - side * L.R * 1.05, y = L.foot + L.R * 0.06; g.save(); g.translate(x, y); g.scale(1, 0.3); g.drawImage(glow(L.R * 0.5, [255, 210, 140], 0.3), -L.R * 0.5, -L.R * 0.5); g.restore(); }
        // The candle itself (its flame is the manager's): a pillar, a little melted, in a holly ring.
        if (o.candle) {
            const ch = cand.h, cw = ch * 0.34, x = cand.x, y = cand.y;
            g.fillStyle = css([236, 224, 200]); g.beginPath(); g.moveTo(x - cw / 2, y); g.lineTo(x - cw / 2, y - ch); g.quadraticCurveTo(x - cw * 0.2, y - ch * 1.04, x, y - ch * 0.99); g.quadraticCurveTo(x + cw * 0.2, y - ch * 1.05, x + cw / 2, y - ch); g.lineTo(x + cw / 2, y); g.closePath(); g.fill();
            light(g, x - cw / 2, y - ch * 1.06, x + cw / 2, y, -cand.side, { warm: 0.45, dark: 0.3 });
            const gr = g.createLinearGradient(0, y - ch, 0, y - ch * 0.7); gr.addColorStop(0, 'rgba(255,200,120,0.6)'); gr.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = gr; g.fillRect(x - cw / 2, y - ch, cw, ch * 0.3);
            g.strokeStyle = css([40, 30, 26]); g.lineWidth = Math.max(1, ch * 0.02); g.beginPath(); g.moveTo(x, y - ch); g.lineTo(x, y - ch * 1.07); g.stroke();
            for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, hx = x + Math.cos(a) * cw * 0.75, hy = y - ch * 0.04 + Math.sin(a) * cw * 0.18; blob(g, hx, hy, cw * 0.22, cw * 0.1, [30, 80, 46], 1, a); if (i % 3 === 0) blob(g, hx, hy - cw * 0.06, cw * 0.06, cw * 0.06, [210, 30, 40]); }
            c.flame = { x, y: y - ch * 1.07, h: ch * 0.22 };
        }
        return c;
    }

    // ---- The base ----------------------------------------------------------------------------------
    // Four styles. Returns { back (the collar's far rim, under the globe),
    // front (everything else, over it), x, y (its sprite's corner in CSS px),
    // key (where the wind-up key's stem is) }.
    const BASES = {
        wood: { body: [96, 56, 34], dark: [52, 28, 18], ring: [214, 170, 80], plaque: [218, 178, 92] },
        brass: { body: [196, 150, 66], dark: [110, 74, 30], ring: [240, 206, 120], plaque: [240, 230, 210], feet: true },
        ceramic: { body: [170, 34, 40], dark: [96, 16, 24], ring: [228, 190, 96], plaque: [244, 238, 228], flakes: true },
        silver: { body: [178, 184, 196], dark: [96, 100, 118], ring: [226, 230, 240], plaque: [60, 80, 120], holly: true },
    };
    function base(L, ps, style, side) {
        const S = BASES[style] || BASES.wood, R = L.R, bw = L.base.w, bh = L.base.h, cw = R * 1.24, pad = R * 0.1;
        const W = (bw + pad * 2) * ps, H = (bh + R * 0.3 + pad * 2) * ps, ox = L.base.x - bw / 2 - pad, oy = L.base.top - R * 0.15 - pad;
        const mk = () => { const c = canvas(W, H), g = c.getContext('2d'); g.scale(ps, ps); g.translate(-ox, -oy); return [c, g]; };
        const x = L.base.x, yt = L.base.top, yb = L.foot, rim = R * 0.1;
        const [bc, b] = mk();
        blob(b, x, yt, cw / 2, rim, S.dark);
        blob(b, x, yt - rim * 0.15, cw / 2 * 0.96, rim * 0.8, shade(S.ring, 0.6));
        const [fc, g] = mk();
        // The body: it swells from the collar to its foot, with a cove.
        g.fillStyle = css(S.body);
        g.beginPath(); g.moveTo(x - cw / 2, yt);
        g.bezierCurveTo(x - cw / 2, yt + bh * 0.35, x - bw / 2 * 0.86, yt + bh * 0.45, x - bw / 2, yb - bh * 0.12);
        g.lineTo(x - bw / 2, yb - bh * 0.02); g.ellipse(x, yb - bh * 0.02, bw / 2, rim * 1.2, 0, Math.PI, 0, true);
        g.lineTo(x + bw / 2, yb - bh * 0.12); g.bezierCurveTo(x + bw / 2 * 0.86, yt + bh * 0.45, x + cw / 2, yt + bh * 0.35, x + cw / 2, yt);
        g.ellipse(x, yt, cw / 2, rim, 0, 0, Math.PI, false); g.closePath(); g.fill();
        // Turned: highlights and shade round its curve.
        g.save(); g.globalCompositeOperation = 'source-atop';
        const gr = g.createLinearGradient(x - bw / 2, 0, x + bw / 2, 0);
        const k = side > 0 ? 1 : 0;
        gr.addColorStop(0, `rgba(10,6,10,${0.6 - 0.35 * k})`); gr.addColorStop(0.25, 'rgba(10,6,10,0.1)'); gr.addColorStop(0.42, 'rgba(255,240,220,0.16)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)');
        gr.addColorStop(0.78, css(WARM, 0.12 + 0.3 * k)); gr.addColorStop(0.9, css(WARM, 0.35 * k)); gr.addColorStop(1, `rgba(10,6,10,${0.25 + 0.3 * (1 - k)})`);
        g.fillStyle = gr; g.fillRect(x - bw, yt - R, bw * 2, bh + R * 2);
        const gv = g.createLinearGradient(0, yt, 0, yb); gv.addColorStop(0, 'rgba(0,0,0,0)'); gv.addColorStop(0.5, 'rgba(255,255,255,0.06)'); gv.addColorStop(1, 'rgba(0,0,0,0.35)');
        g.fillStyle = gv; g.fillRect(x - bw, yt - R, bw * 2, bh + R * 2);
        if (style === 'wood') { const Rr = rng(4); g.globalAlpha = 0.22; for (let i = 0; i < 26; i++) { const y = yt + Rr() * bh; g.strokeStyle = css(S.dark); g.lineWidth = 0.6 + Rr() * 1.2; g.beginPath(); g.moveTo(x - bw / 2, y); g.quadraticCurveTo(x, y + (Rr() - 0.5) * bh * 0.3, x + bw / 2, y + (Rr() - 0.5) * 4); g.stroke(); } g.globalAlpha = 1; }
        if (S.flakes) { const Rr = rng(9); for (let i = 0; i < 12; i++) { const fx = x - bw * 0.42 + Rr() * bw * 0.84, fy = yt + bh * (0.25 + Rr() * 0.55), s = R * 0.035; g.strokeStyle = 'rgba(250,246,240,0.85)'; g.lineWidth = Math.max(0.6, s * 0.25); for (let a = 0; a < 3; a++) { const an = a * Math.PI / 3; g.beginPath(); g.moveTo(fx - Math.cos(an) * s, fy - Math.sin(an) * s); g.lineTo(fx + Math.cos(an) * s, fy + Math.sin(an) * s); g.stroke(); } } }
        if (S.holly) { for (const s of [-1, 1]) { const hx = x + s * bw * 0.3, hy = yt + bh * 0.5; blob(g, hx, hy, R * 0.07, R * 0.03, [30, 96, 60], 1, s * 0.5); blob(g, hx + s * R * 0.05, hy + R * 0.02, R * 0.06, R * 0.026, [36, 110, 66], 1, -s * 0.4); blob(g, hx - s * R * 0.01, hy - R * 0.01, R * 0.018, R * 0.018, [200, 30, 40]); } }
        g.restore();
        // The collar's ring and a bead round the foot.
        g.lineWidth = rim * 0.7; g.strokeStyle = css(S.ring); g.beginPath(); g.ellipse(x, yt + rim * 0.1, cw / 2, rim, 0, 0, Math.PI); g.stroke();
        g.lineWidth = rim * 0.25; g.strokeStyle = css(lerp(S.ring, [255, 255, 240], 0.5), 0.8); g.beginPath(); g.ellipse(x, yt + rim * 0.05, cw / 2 * 0.98, rim * 0.9, 0, 0.2, Math.PI * 0.55); g.stroke();
        g.lineWidth = rim * 0.5; g.strokeStyle = css(shade(S.ring, 0.75)); g.beginPath(); g.ellipse(x, yb - bh * 0.1, bw / 2 * 0.99, rim * 1.1, 0, 0, Math.PI); g.stroke();
        if (S.feet) for (const s of [-0.38, 0, 0.38]) blob(g, x + s * bw, yb, R * 0.09, R * 0.05, S.ring);
        // A plaque on the front.
        const pw = R * 0.42, ph = R * 0.14, py = yt + bh * 0.52;
        g.fillStyle = css(S.plaque); g.beginPath(); g.ellipse(x, py, pw / 2, ph / 2, 0, 0, TAU); g.fill();
        g.lineWidth = Math.max(0.8, R * 0.012); g.strokeStyle = css(shade(S.ring, 0.7)); g.stroke();
        g.fillStyle = css(shade(S.plaque, 0.55)); g.font = `italic ${Math.max(6, ph * 0.62)}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Noël', x, py + ph * 0.04);
        // Into brushwork, softly (the base is near: fine strokes).
        const opts = { widths: [R * 0.09 * ps, R * 0.045 * ps, R * 0.022 * ps], seed: 21, len: 3, tol: 50, jit: 0.05, dir: (u, v) => (v > 0.12 ? 0.02 : null) };
        return { back: bc, front: fc, frontOpts: opts, x: ox, y: oy, w: W / ps, h: H / ps, key: { x: x + (side > 0 ? -1 : 1) * (bw / 2 * 0.95), y: yt + bh * 0.55 } };
    }
    // The wind-up key, seen from its side, at a turn of `a`: a bow that turns edge-on and back.
    function key(g, x, y, s, a, side) {
        const k = Math.cos(a), dir = side > 0 ? -1 : 1;
        g.fillStyle = css([200, 160, 70]); g.fillRect(x + (dir > 0 ? 0 : -s * 0.5), y - s * 0.06, s * 0.5, s * 0.12);
        const bx = x + dir * s * 0.62;
        g.save(); g.translate(bx, y); g.scale(Math.max(0.15, Math.abs(k)), 1);
        g.fillStyle = css(lerp([180, 140, 60], [250, 220, 140], Math.abs(k) * 0.6)); for (const sy of [-1, 1]) { g.beginPath(); g.ellipse(0, sy * s * 0.22, s * 0.18, s * 0.2, 0, 0, TAU); g.fill(); }
        g.fillStyle = 'rgba(20,14,10,0.7)'; for (const sy of [-1, 1]) { g.beginPath(); g.ellipse(0, sy * s * 0.22, s * 0.07, s * 0.08, 0, 0, TAU); g.fill(); }
        g.restore();
    }

    // ---- The glass ---------------------------------------------------------------------------------
    // What lies over the water: the rim's darkening, the window caught in the
    // curve, the candle's warm highlight, a pin of light. In CSS px about the
    // globe's centre; size 2R.
    function glass(L, ps, side, o = {}) {
        const R = L.R, D = R * 2, c = canvas(D * ps, D * ps), g = c.getContext('2d');
        g.scale(ps, ps); g.translate(R, R);
        g.save(); g.beginPath(); g.arc(0, 0, R, 0, TAU); g.clip();
        let gr = g.createRadialGradient(-R * 0.1, -R * 0.15, R * 0.55, 0, 0, R);
        gr.addColorStop(0, 'rgba(180,210,255,0)'); gr.addColorStop(0.75, 'rgba(170,200,240,0.08)'); gr.addColorStop(0.95, 'rgba(200,220,255,0.26)'); gr.addColorStop(1, 'rgba(230,240,255,0.5)');
        g.fillStyle = gr; g.fillRect(-R, -R, D, D);
        // The window, bent round the curve on the far side from the candle.
        const wx = -side * R * 0.42, wy = -R * 0.45;
        g.save(); g.translate(wx, wy); g.rotate(side * 0.35);
        for (const [k, a] of [[1.3, 0.05], [1, 0.1], [0.8, 0.14]]) {
            g.fillStyle = `rgba(200,220,255,${a})`;
            for (const [px, py] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { g.beginPath(); g.ellipse(px * R * 0.1, py * R * 0.09, R * 0.085 * k, R * 0.075 * k, 0, 0, TAU); g.fill(); }
        }
        g.restore();
        // A long soft sheen along the top, and the warm highlight on the candle's side.
        g.save(); g.rotate(-side * 0.5);
        gr = g.createLinearGradient(0, -R, 0, -R * 0.6); gr.addColorStop(0, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.beginPath(); g.ellipse(0, -R * 0.78, R * 0.6, R * 0.2, 0, 0, TAU); g.fill();
        g.restore();
        if (o.candle) {
            gr = g.createRadialGradient(side * R * 0.62, -R * 0.1, 0, side * R * 0.62, -R * 0.1, R * 0.5);
            gr.addColorStop(0, 'rgba(255,200,130,0.3)'); gr.addColorStop(1, 'rgba(255,190,120,0)');
            g.fillStyle = gr; g.fillRect(-R, -R, D, D);
            g.lineWidth = R * 0.04; g.strokeStyle = 'rgba(255,200,140,0.35)'; g.beginPath(); g.arc(0, 0, R * 0.95, side > 0 ? -0.9 : Math.PI - 0.5, side > 0 ? 0.5 : Math.PI + 0.9); g.stroke();
            // The water bends the candle's light into a warm glow low on the far side.
            gr = g.createRadialGradient(-side * R * 0.45, R * 0.55, 0, -side * R * 0.45, R * 0.55, R * 0.5);
            gr.addColorStop(0, 'rgba(255,210,150,0.18)'); gr.addColorStop(1, 'rgba(255,210,150,0)');
            g.fillStyle = gr; g.fillRect(-R, -R, D, D);
        }
        g.restore();
        // The pin of light, and the rim itself.
        g.drawImage(glow(R * 0.12, [255, 255, 255], 0.15), -side * R * 0.5 - R * 0.12, -R * 0.62 - R * 0.12);
        g.lineWidth = Math.max(1, R * 0.012); g.strokeStyle = 'rgba(20,24,40,0.55)'; g.beginPath(); g.arc(0, 0, R * 0.995, 0, TAU); g.stroke();
        g.lineWidth = Math.max(1, R * 0.008); g.strokeStyle = 'rgba(230,240,255,0.35)'; g.beginPath(); g.arc(0, 0, R * 0.975, -side > 0 ? -2.6 : -1.1, -side > 0 ? -1.4 : 0.1); g.stroke();
        return c;
    }
    // What is seen through the water behind the scene: the room behind the
    // globe, upside down and magnified (a sphere of water is a strong lens),
    // dark and soft. From the room and outside layers, once.
    function behind(L, ps, layers) {
        const R = L.R, D = R * 2, c = canvas(D * ps, D * ps), g = c.getContext('2d');
        g.fillStyle = '#16203a'; g.fillRect(0, 0, c.width, c.height);
        g.save(); g.translate(R * ps, R * ps); g.scale(-1.25, -1.25); g.translate(-L.cx * ps, -(L.cy - R * 0.25) * ps);
        for (const l of layers) if (l) g.drawImage(l, 0, 0);
        g.restore();
        const soft = soften(c, 6), s = soft.getContext('2d');
        s.fillStyle = 'rgba(14,22,48,0.55)'; s.fillRect(0, 0, c.width, c.height);
        s.globalCompositeOperation = 'destination-in'; s.beginPath(); s.arc(R * ps, R * ps, R * ps, 0, TAU); s.fill();
        return soft;
    }

    // ---- Inside: the ground ---------------------------------------------------------------------
    // The snowy ground the scene stands on, filling the bottom of the globe;
    // and fresh snow over it, shown as deep as the snow lies (the manager
    // draws it with that alpha). The pond, if the scene has one, is part of it.
    function ground(L, ps, side, scene) {
        const R = L.R, D = R * 2, c = canvas(D * ps, D * ps), g = c.getContext('2d'), Rr = rng(77);
        g.scale(ps, ps); g.translate(R, R);
        g.save(); g.beginPath(); g.arc(0, 0, R * 0.985, 0, TAU); g.clip();
        const fy = project(0, FLOOR, 0).sy * R, fr = FLOOR_R * R, fry = fr * TILT * 1.02;
        // The ground's top, then its front falling away below.
        const gr = g.createLinearGradient(0, fy - fry, 0, R);
        gr.addColorStop(0, '#c9d6ee'); gr.addColorStop(0.3, '#e9eef8'); gr.addColorStop(0.55, '#b9c6e0'); gr.addColorStop(1, '#6d7ca0');
        g.fillStyle = gr; g.beginPath(); g.ellipse(0, fy, fr, fry, 0, Math.PI, 0); g.lineTo(R, R); g.lineTo(-R, R); g.closePath(); g.fill();
        g.beginPath(); g.ellipse(0, fy, fr, fry, 0, 0, TAU); g.fill();
        light(g, -R, fy - fry, R, R, side, { warm: 0.32, dark: 0.3, foot: 0.4 });
        for (let i = 0; i < 60; i++) { const a = Rr() * TAU, r = Math.sqrt(Rr()) * fr, x = Math.sin(a) * r, y = fy + Math.cos(a) * r * TILT; blob(g, x, y, R * (0.04 + Rr() * 0.06), R * 0.015, Rr() < 0.5 ? [250, 252, 255] : [170, 186, 220], 0.35, 0); }
        if (scene === 'pond') {
            const pr = fr * 0.42, pry = pr * TILT;
            const pg = g.createLinearGradient(0, fy - pry, 0, fy + pry);
            pg.addColorStop(0, '#5f7fb2'); pg.addColorStop(0.5, '#9fb8dc'); pg.addColorStop(1, '#6f8cbc');
            g.fillStyle = pg; g.beginPath(); g.ellipse(0, fy, pr, pry, 0, 0, TAU); g.fill();
            g.strokeStyle = 'rgba(240,246,255,0.7)'; g.lineWidth = R * 0.012; g.stroke();
            for (let i = 0; i < 14; i++) { const a = Rr() * TAU, r = Rr() * pr * 0.8; g.strokeStyle = 'rgba(235,244,255,0.35)'; g.lineWidth = 0.7; g.beginPath(); g.ellipse(Math.sin(a) * r * 0.3, fy + Math.cos(a) * r * TILT * 0.3, pr * (0.2 + Rr() * 0.3), pry * (0.2 + Rr() * 0.3), 0, Rr() * TAU, Rr() * TAU + 1.5); g.stroke(); }
        }
        g.restore();
        const fresh = canvas(c.width, c.height), f = fresh.getContext('2d');
        f.scale(ps, ps); f.translate(R, R);
        f.save(); f.beginPath(); f.arc(0, 0, R * 0.985, 0, TAU); f.clip();
        const fg = f.createRadialGradient(0, fy, fr * 0.2, 0, fy, fr * 1.1);
        fg.addColorStop(0, 'rgba(252,253,255,0.9)'); fg.addColorStop(0.8, 'rgba(244,248,255,0.85)'); fg.addColorStop(1, 'rgba(240,246,255,0.95)');
        f.fillStyle = fg; f.beginPath(); f.ellipse(0, fy, fr * 1.01, fry * 1.06, 0, 0, TAU); f.fill();
        for (let i = 0; i < 40; i++) { const a = Rr() * TAU, r = (0.7 + Rr() * 0.3) * fr, x = Math.sin(a) * r, y = fy + Math.cos(a) * r * TILT; blob(f, x, y, R * (0.05 + Rr() * 0.08), R * (0.02 + Rr() * 0.02), [255, 255, 255], 0.5); }
        f.restore();
        return { canvas: c, fresh, opts: { widths: [R * 0.06 * ps, R * 0.03 * ps, R * 0.016 * ps], seed: 31, len: 3.5, tol: 40, jit: 0.04, dir: () => 0.04 } };
    }

    // ---- Inside: what stands on the turntable ------------------------------------------------------
    // One sprite per kind and face. h: the sprite's height in globe units
    // (its tallest), scaled by R to CSS px; anchored at its foot's middle.
    // face: 'front', 'side', 'back'. Returns { canvas, ax, ay (anchor in its
    // px), w, h (CSS px at depth 0), glows: [{ x, y, r, col }] (CSS px from the
    // anchor), caps: where fresh snow lies on it ({ x, y, w } from the anchor) }.
    function thing(kind, L, ps, side, face, o = {}) {
        const R = L.R, K = KINDS[kind], u = R, pad = R * 0.04;
        const w = (K.box ? Math.max(K.w, K.d) : K.w) * u * 1.25 + pad * 2, h = ((K.h || 0.1) + (K.roof || 0) + (K.spire || 0)) * u * 1.12 + pad * 2;
        const c = canvas(w * ps, h * ps), g = c.getContext('2d'), ax = w / 2, ay = h - pad, Rr = rng(kind.length * 131 + (face === 'side' ? 7 : 0));
        g.scale(ps, ps); g.translate(ax, ay);
        const out = { canvas: c, ax, ay, w, h, glows: [], caps: [] };
        const warmWin = (x, y, ww, wh, bars = true, col = [255, 196, 110]) => {
            g.fillStyle = css(shade(col, 0.95)); g.fillRect(x, y, ww, wh);
            const gr = g.createRadialGradient(x + ww / 2, y + wh / 2, 0, x + ww / 2, y + wh / 2, Math.max(ww, wh)); gr.addColorStop(0, 'rgba(255,240,200,0.8)'); gr.addColorStop(1, 'rgba(255,170,80,0)');
            g.fillStyle = gr; g.fillRect(x, y, ww, wh);
            if (bars) { g.fillStyle = css([60, 40, 30]); g.fillRect(x + ww / 2 - ww * 0.06, y, ww * 0.12, wh); g.fillRect(x, y + wh / 2 - wh * 0.06, ww, wh * 0.12); }
            g.fillStyle = css([250, 250, 255], 0.9); g.fillRect(x - ww * 0.1, y + wh, ww * 1.2, wh * 0.14);   // snow on its sill
            out.glows.push({ x: x + ww / 2, y: y + wh / 2, r: Math.max(ww, wh) * 1.6, col });
        };
        const roofSnow = (pts) => { g.fillStyle = css(SNOW); poly(g, pts); g.fill(); };
        if (K.box) {
            const front = face !== 'side', ww = (front ? K.w : K.d) * u, wh = K.h * u, rh = (K.roof || 0.15) * u;
            const wall = kind === 'church' ? [214, 206, 196] : kind === 'house' ? (o.v > 0.5 ? [150, 60, 50] : [92, 110, 150]) : kind === 'cathouse' ? [236, 196, 150] : [226, 214, 188];
            const roof = kind === 'church' ? [80, 70, 76] : kind === 'cathouse' ? [150, 70, 60] : [96, 56, 44];
            if (front) {
                // A gable end: the wall and its triangle, a door, windows.
                g.fillStyle = css(wall); g.beginPath(); g.moveTo(-ww / 2, 0); g.lineTo(-ww / 2, -wh); g.lineTo(0, -wh - rh); g.lineTo(ww / 2, -wh); g.lineTo(ww / 2, 0); g.closePath(); g.fill();
                mottle(g, -ww / 2, -wh - rh, ww, wh + rh, [shade(wall, 0.9), lerp(wall, [255, 255, 255], 0.2)], 30, ww * 0.06, Rr, 0.4);
                if (kind === 'cottage' || kind === 'cathouse') { g.strokeStyle = css(shade(wall, 0.45)); g.lineWidth = ww * 0.03; g.beginPath(); g.moveTo(-ww / 2, -wh * 0.55); g.lineTo(ww / 2, -wh * 0.55); g.moveTo(-ww * 0.3, 0); g.lineTo(-ww * 0.3, -wh); g.moveTo(ww * 0.3, 0); g.lineTo(ww * 0.3, -wh); g.stroke(); }
                // The roof's edge over the gable, deep in snow.
                g.lineWidth = ww * 0.07; g.strokeStyle = css(roof); g.beginPath(); g.moveTo(-ww * 0.56, -wh + rh * 0.04); g.lineTo(0, -wh - rh * 1.06); g.lineTo(ww * 0.56, -wh + rh * 0.04); g.stroke();
                roofSnow([-ww * 0.6, -wh, 0, -wh - rh * 1.16, ww * 0.6, -wh, ww * 0.5, -wh + rh * 0.12, 0, -wh - rh * 0.92, -ww * 0.5, -wh + rh * 0.12]);
                out.caps.push({ kind: 'gable', x: 0, y: -wh - rh * 1.08, w: ww * 0.57, h: rh * 1.08 });
                if (kind === 'church') {
                    // The steeple over the gable, and its spire.
                    const sw = ww * 0.34, sh = K.spire * u;
                    g.fillStyle = css(wall); g.fillRect(-sw / 2, -wh - rh - sh * 0.45, sw, sh * 0.45 + rh * 0.4);
                    g.fillStyle = css(roof); poly(g, [-sw * 0.62, -wh - rh - sh * 0.45, 0, -wh - rh - sh, sw * 0.62, -wh - rh - sh * 0.45]); g.fill();
                    roofSnow([-sw * 0.5, -wh - rh - sh * 0.5, 0, -wh - rh - sh * 0.98, sw * 0.1, -wh - rh - sh * 0.85, -sw * 0.3, -wh - rh - sh * 0.46]);
                    g.fillStyle = css([226, 190, 90]); g.fillRect(-sw * 0.04, -wh - rh - sh * 1.12, sw * 0.08, sh * 0.14); g.fillRect(-sw * 0.16, -wh - rh - sh * 1.07, sw * 0.32, sh * 0.03);
                    warmWin(-sw * 0.2, -wh - rh - sh * 0.36, sw * 0.4, sh * 0.16, false, [255, 210, 130]);
                    blob(g, 0, -wh * 0.72, ww * 0.12, ww * 0.12, [255, 200, 120]); out.glows.push({ x: 0, y: -wh * 0.72, r: ww * 0.3, col: [255, 190, 110] });
                    g.fillStyle = css([110, 40, 40]); g.beginPath(); g.moveTo(-ww * 0.12, 0); g.lineTo(-ww * 0.12, -wh * 0.3); g.arc(0, -wh * 0.3, ww * 0.12, Math.PI, 0); g.lineTo(ww * 0.12, 0); g.closePath(); g.fill();
                } else {
                    // A door with a wreath, and a window each side.
                    const dw = ww * 0.22, dh = wh * 0.55;
                    g.fillStyle = css(kind === 'cathouse' ? [60, 90, 140] : [130, 34, 36]); g.fillRect(-dw / 2, -dh, dw, dh);
                    g.strokeStyle = css([40, 110, 60]); g.lineWidth = dw * 0.14; g.beginPath(); g.arc(0, -dh * 0.7, dw * 0.22, 0, TAU); g.stroke(); blob(g, 0, -dh * 0.55, dw * 0.07, dw * 0.05, [220, 40, 40]);
                    warmWin(-ww * 0.42, -wh * 0.8, ww * 0.2, wh * 0.3);
                    if (kind === 'cathouse') {
                        // In this window, a cat, looking out.
                        const wx = ww * 0.22, wy = -wh * 0.8, wwn = ww * 0.2, whn = wh * 0.3;
                        warmWin(wx, wy, wwn, whn, false);
                        g.fillStyle = css([40, 30, 34]); blob(g, wx + wwn / 2, wy + whn * 0.78, wwn * 0.3, whn * 0.26, [40, 30, 34]); blob(g, wx + wwn / 2, wy + whn * 0.42, wwn * 0.2, wwn * 0.2, [40, 30, 34]);
                        poly(g, [wx + wwn * 0.33, wy + whn * 0.32, wx + wwn * 0.38, wy + whn * 0.1, wx + wwn * 0.47, wy + whn * 0.28]); g.fill(); poly(g, [wx + wwn * 0.67, wy + whn * 0.32, wx + wwn * 0.62, wy + whn * 0.1, wx + wwn * 0.53, wy + whn * 0.28]); g.fill();
                        // and a round window in the gable shaped like a fish.
                        g.fillStyle = css([255, 200, 110]); ell(g, 0, -wh - rh * 0.45, ww * 0.08, ww * 0.045); g.fill(); poly(g, [ww * 0.07, -wh - rh * 0.45, ww * 0.12, -wh - rh * 0.52, ww * 0.12, -wh - rh * 0.38]); g.fill();
                        out.glows.push({ x: 0, y: -wh - rh * 0.45, r: ww * 0.2, col: [255, 190, 110] });
                    } else warmWin(ww * 0.22, -wh * 0.8, ww * 0.2, wh * 0.3);
                }
                if (kind === 'cathouse') {
                    // Cat ears on the roof's peak.
                    for (const s of [-1, 1]) { g.fillStyle = css(roof); poly(g, [s * ww * 0.04, -wh - rh * 1.05, s * ww * 0.2, -wh - rh * 1.55, s * ww * 0.26, -wh - rh * 0.82]); g.fill(); g.fillStyle = css(SNOW); poly(g, [s * ww * 0.12, -wh - rh * 1.2, s * ww * 0.2, -wh - rh * 1.55, s * ww * 0.22, -wh - rh * 1.15]); g.fill(); }
                }
            } else {
                // The long side: wall, eaves, a roof slope, a chimney.
                g.fillStyle = css(shade(wall, 0.9)); g.fillRect(-ww / 2, -wh, ww, wh);
                mottle(g, -ww / 2, -wh, ww, wh, [shade(wall, 0.8), lerp(wall, [255, 255, 255], 0.15)], 30, ww * 0.05, Rr, 0.4);
                g.fillStyle = css(roof); poly(g, [-ww * 0.56, -wh + rh * 0.08, -ww * 0.5, -wh - rh, ww * 0.5, -wh - rh, ww * 0.56, -wh + rh * 0.08]); g.fill();
                g.strokeStyle = css(shade(roof, 0.7)); g.lineWidth = Math.max(0.5, rh * 0.06); for (let k = 1; k < 5; k++) { const y = -wh + rh * 0.08 - k * rh * 0.22; g.beginPath(); g.moveTo(-ww * 0.55, y); g.lineTo(ww * 0.55, y); g.stroke(); }
                roofSnow([-ww * 0.57, -wh - rh * 0.4, -ww * 0.52, -wh - rh * 1.08, ww * 0.52, -wh - rh * 1.08, ww * 0.57, -wh - rh * 0.4, ww * 0.4, -wh - rh * 0.3, ww * 0.1, -wh - rh * 0.45, -ww * 0.25, -wh - rh * 0.32]);
                out.caps.push({ kind: 'band', x: 0, y: -wh - rh * 1.06, w: ww * 1.06, h: rh * 0.8 });
                if (kind !== 'church') {
                    g.fillStyle = css([120, 70, 56]); g.fillRect(ww * 0.22, -wh - rh * 1.45, ww * 0.1, rh * 0.6);
                    g.fillStyle = css(SNOW); g.fillRect(ww * 0.21, -wh - rh * 1.5, ww * 0.12, rh * 0.1);
                    out.chimney = { x: ww * 0.27, y: -wh - rh * 1.5 };
                }
                const nwin = kind === 'church' ? 3 : 2;
                for (let k = 0; k < nwin; k++) {
                    const x = -ww / 2 + ww * (k + 0.5) / nwin - ww * 0.07;
                    if (kind === 'church') { const cw2 = ww * 0.13, ch2 = wh * 0.45; g.fillStyle = css([255, 196, 120]); g.beginPath(); g.moveTo(x, -wh * 0.25); g.lineTo(x, -wh * 0.25 - ch2 * 0.7); g.arc(x + cw2 / 2, -wh * 0.25 - ch2 * 0.7, cw2 / 2, Math.PI, 0); g.lineTo(x + cw2, -wh * 0.25); g.closePath(); g.fill(); for (const [cc, yy] of [[[220, 70, 60], 0.3], [[80, 140, 220], 0.55], [[90, 180, 110], 0.8]]) { g.fillStyle = css(cc, 0.5); g.fillRect(x, -wh * 0.25 - ch2 * yy, cw2, ch2 * 0.18); } out.glows.push({ x: x + cw2 / 2, y: -wh * 0.5, r: cw2 * 2.2, col: [255, 190, 120] }); }
                    else warmWin(x, -wh * 0.72, ww * 0.14, wh * 0.32);
                }
            }
            light(g, -ww * 0.6, -wh - rh * 1.6 - (K.spire || 0) * u, ww * 0.6, 0, side, { warm: 0.3, dark: front ? 0.32 : 0.45 });
            // Snow drifted against its foot.
            for (let i = 0; i < 9; i++) blob(g, -ww / 2 + Rr() * ww, -Rr() * wh * 0.06, ww * 0.1, wh * 0.06, SNOW, 0.9);
        } else if (kind === 'fir' || kind === 'bigtree') {
            const th = K.h * u, tw = K.w * u, tiers = kind === 'bigtree' ? 6 : 4;
            g.fillStyle = css([70, 46, 34]); g.fillRect(-tw * 0.06, -th * 0.12, tw * 0.12, th * 0.12);
            for (let k = 0; k < tiers; k++) {
                const t0 = k / tiers, y0 = -th * (0.08 + t0 * 0.85), y1 = -th * (0.08 + (k + 1.35) / tiers * 0.85), half = tw * 0.5 * (1 - t0 * 0.78);
                g.fillStyle = css([26 + k * 3, 70 + k * 5, 52]);
                g.beginPath(); g.moveTo(-half, y0); for (let s = 0; s <= 6; s++) g.lineTo(-half + s * half / 3, y0 + (s % 2 ? -th * 0.025 : th * 0.02)); g.lineTo(0, Math.min(y1, -th * 0.98)); g.closePath(); g.fill();
                // Snow lying on each tier's boughs.
                g.fillStyle = css(SNOW, 0.95); g.beginPath(); g.moveTo(-half * 0.92, y0 - th * 0.02); g.quadraticCurveTo(-half * 0.4, y0 - th * 0.07, 0, y1 * 0.6 + y0 * 0.4); g.quadraticCurveTo(half * 0.4, y0 - th * 0.07, half * 0.92, y0 - th * 0.02); g.quadraticCurveTo(half * 0.4, y0 - th * 0.045, 0, y0 - th * 0.06); g.quadraticCurveTo(-half * 0.4, y0 - th * 0.045, -half * 0.92, y0 - th * 0.02); g.fill();
            }
            mottle(g, -tw / 2, -th, tw, th, [[20, 56, 40], [44, 96, 66], [16, 40, 32]], 70, tw * 0.05, Rr, 0.5);
            light(g, -tw / 2, -th, tw / 2, 0, side, { warm: 0.25, dark: 0.45 });
            out.caps.push({ kind: 'mound', x: 0, y: -th * 0.93, w: tw * 0.16, h: th * 0.05 });
            if (kind === 'bigtree') {
                g.fillStyle = css([250, 220, 110]); const sy = -th * 1.02, sr = tw * 0.07; g.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? sr * 0.45 : sr; g.lineTo(Math.cos(a) * r, sy + Math.sin(a) * r); } g.closePath(); g.fill();
                out.glows.push({ x: 0, y: sy, r: sr * 4, col: [255, 220, 120] });
                out.cone = { h: th, w: tw };
            }
        } else if (kind === 'snowman' || kind === 'catsnowman') {
            const sh = K.h * u, cat = kind === 'catsnowman', back = face === 'back';
            const balls = cat ? [[0, -sh * 0.25, sh * 0.27], [0, -sh * 0.66, sh * 0.2]] : [[0, -sh * 0.2, sh * 0.21], [0, -sh * 0.52, sh * 0.16], [0, -sh * 0.8, sh * 0.12]];
            for (const [x, y, r] of balls) { blob(g, x, y, r, r * 0.95, [240, 244, 252]); }
            if (cat) { for (const s of [-1, 1]) { g.fillStyle = css([240, 244, 252]); poly(g, [s * sh * 0.05, -sh * 0.8, s * sh * 0.16, -sh * 0.98, s * sh * 0.19, -sh * 0.72]); g.fill(); } g.strokeStyle = css([236, 240, 250]); g.lineWidth = sh * 0.06; g.lineCap = 'round'; g.beginPath(); g.moveTo(sh * 0.22, -sh * 0.15); g.quadraticCurveTo(sh * 0.42, -sh * 0.2, sh * 0.36, -sh * 0.48); g.stroke(); }
            light(g, -sh * 0.45, -sh, sh * 0.45, 0, side, { warm: 0.28, dark: 0.36 });
            if (!back) {
                const hy = cat ? -sh * 0.68 : -sh * 0.8, hr = cat ? sh * 0.2 : sh * 0.12;
                for (const s of [-1, 1]) blob(g, s * hr * 0.38, hy - hr * 0.15, hr * 0.1, hr * 0.12, [24, 22, 26]);
                if (cat) { blob(g, 0, hy + hr * 0.12, hr * 0.1, hr * 0.07, [230, 130, 140]); g.strokeStyle = 'rgba(40,36,40,0.7)'; g.lineWidth = Math.max(0.5, hr * 0.03); for (const s of [-1, 1]) for (const d of [-0.08, 0.06]) { g.beginPath(); g.moveTo(s * hr * 0.2, hy + hr * 0.2); g.lineTo(s * hr * 0.9, hy + hr * (0.15 + d)); g.stroke(); } blob(g, 0, -sh * 0.5, sh * 0.035, sh * 0.035, [230, 190, 70]); }
                else { g.fillStyle = css([236, 120, 40]); poly(g, [0, hy, hr * 0.9, hy + hr * 0.12, 0, hy + hr * 0.25]); g.fill(); for (let k = 0; k < 3; k++) blob(g, 0, -sh * (0.46 - k * 0.07), sh * 0.016, sh * 0.016, [30, 28, 30]); }
            }
            if (!cat) {
                g.fillStyle = css([30, 28, 32]); g.fillRect(-sh * 0.09, -sh * 0.99, sh * 0.18, sh * 0.13); g.fillRect(-sh * 0.14, -sh * 0.87, sh * 0.28, sh * 0.03);
                g.fillStyle = css([190, 36, 40]); g.fillRect(-sh * 0.13, -sh * 0.69, sh * 0.26, sh * 0.05); g.fillRect(back ? -sh * 0.05 : sh * 0.04, -sh * 0.67, sh * 0.06, sh * 0.16);
            } else { g.fillStyle = css([190, 36, 40]); g.fillRect(-sh * 0.17, -sh * 0.5, sh * 0.34, sh * 0.04); }
            out.caps.push({ kind: 'mound', x: 0, y: cat ? -sh * 0.84 : -sh * 0.99, w: sh * 0.13, h: sh * 0.04 });
        } else if (kind === 'lamp') {
            const lh = K.h * u, lw = lh * 0.12;
            g.fillStyle = css([30, 32, 40]); g.fillRect(-lw * 0.12, -lh * 0.85, lw * 0.24, lh * 0.85); g.fillRect(-lw * 0.5, -lh * 0.06, lw, lh * 0.06);
            g.fillStyle = css([255, 214, 140]); g.fillRect(-lw * 0.45, -lh, lw * 0.9, lh * 0.15);
            g.fillStyle = css([30, 32, 40]); poly(g, [-lw * 0.65, -lh, 0, -lh * 1.1, lw * 0.65, -lh]); g.fill();
            g.fillStyle = css(SNOW); poly(g, [-lw * 0.55, -lh * 1.01, 0, -lh * 1.1, lw * 0.55, -lh * 1.01]); g.fill();
            out.glows.push({ x: 0, y: -lh * 0.93, r: lh * 0.5, col: [255, 200, 120], lamp: true });
            out.caps.push({ kind: 'mound', x: 0, y: -lh * 1.09, w: lw * 0.55, h: lh * 0.035 });
        } else if (kind === 'fence') {
            const fw = K.w * u, fh = K.h * u;
            g.fillStyle = css([110, 76, 52]); g.fillRect(-fw / 2, -fh * 0.7, fw, fh * 0.12); g.fillRect(-fw / 2, -fh * 0.35, fw, fh * 0.12);
            for (let k = 0; k < 6; k++) { const x = -fw / 2 + k * fw / 5 - fw * 0.02; g.fillStyle = css([130, 90, 60]); g.fillRect(x, -fh, fw * 0.04, fh); blob(g, x + fw * 0.02, -fh, fw * 0.035, fh * 0.12, SNOW); }
            g.fillStyle = css(SNOW); g.fillRect(-fw / 2, -fh * 0.76, fw, fh * 0.07);
            light(g, -fw / 2, -fh * 1.2, fw / 2, 0, side, {});
        } else if (kind === 'bench') {
            const bw2 = K.w * u, bh2 = K.h * u * 1.6;
            g.fillStyle = css([120, 76, 46]); g.fillRect(-bw2 / 2, -bh2 * 0.5, bw2, bh2 * 0.12); g.fillRect(-bw2 / 2, -bh2, bw2, bh2 * 0.1); g.fillRect(-bw2 / 2, -bh2 * 0.82, bw2, bh2 * 0.1);
            g.fillStyle = css([40, 36, 40]); for (const s of [-0.42, 0.38]) g.fillRect(s * bw2, -bh2 * 1.02, bw2 * 0.05, bh2 * 1.02);
            g.fillStyle = css(SNOW); g.fillRect(-bw2 / 2, -bh2 * 0.56, bw2, bh2 * 0.07); g.fillRect(-bw2 / 2, -bh2 * 1.05, bw2, bh2 * 0.05);
            light(g, -bw2 / 2, -bh2 * 1.1, bw2 / 2, 0, side, {});
        } else if (kind === 'skaters') {
            const sh = K.h * u, back = face === 'back';
            for (const [s, coat, hat] of [[-1, [170, 40, 44], [240, 236, 228]], [1, [50, 80, 140], [200, 50, 60]]]) {
                const x = s * sh * 0.17;
                g.fillStyle = css([40, 36, 44]); g.fillRect(x - sh * 0.05, -sh * 0.3, sh * 0.04, sh * 0.3); g.fillRect(x + sh * 0.01, -sh * 0.3, sh * 0.04, sh * 0.3);
                g.fillStyle = css([210, 214, 224]); g.fillRect(x - sh * 0.08, -sh * 0.015, sh * 0.16, sh * 0.015);
                g.fillStyle = css(coat); g.beginPath(); g.moveTo(x - sh * 0.1, -sh * 0.28); g.lineTo(x - sh * 0.07, -sh * 0.7); g.lineTo(x + sh * 0.07, -sh * 0.7); g.lineTo(x + sh * 0.1, -sh * 0.28); g.closePath(); g.fill();
                blob(g, x, -sh * 0.8, sh * 0.075, sh * 0.085, back ? [90, 60, 44] : [236, 196, 168]);
                g.fillStyle = css(hat); g.beginPath(); g.arc(x, -sh * 0.83, sh * 0.08, Math.PI, 0); g.fill(); blob(g, x, -sh * 0.92, sh * 0.03, sh * 0.03, [250, 250, 250]);
                g.fillStyle = css([240, 220, 100]); g.fillRect(x - sh * 0.08, -sh * 0.7, sh * 0.16, sh * 0.04);
            }
            g.strokeStyle = css([60, 70, 120]); g.lineWidth = sh * 0.04; g.beginPath(); g.moveTo(-sh * 0.1, -sh * 0.5); g.lineTo(sh * 0.1, -sh * 0.5); g.stroke();
            light(g, -sh * 0.35, -sh, sh * 0.35, 0, side, { warm: 0.25 });
        } else if (kind === 'presents') {
            const pw = K.w * u;
            for (const [x, y, w2, h2, col, rib] of [[-0.22, 0, 0.5, 0.42, [180, 30, 40], [240, 210, 100]], [0.2, 0, 0.42, 0.36, [40, 110, 70], [240, 236, 228]], [-0.02, -0.4, 0.36, 0.3, [60, 90, 170], [230, 60, 70]]]) {
                const X = x * pw, Y = y * pw, Ww = w2 * pw, Hh = h2 * pw;
                g.fillStyle = css(col); g.fillRect(X - Ww / 2, Y - Hh, Ww, Hh);
                g.fillStyle = css(rib); g.fillRect(X - Ww * 0.06, Y - Hh, Ww * 0.12, Hh); g.fillRect(X - Ww / 2, Y - Hh * 0.55, Ww, Hh * 0.1);
                blob(g, X - Ww * 0.1, Y - Hh, Ww * 0.12, Hh * 0.1, rib, 1, 0.4); blob(g, X + Ww * 0.1, Y - Hh, Ww * 0.12, Hh * 0.1, rib, 1, -0.4);
                g.fillStyle = css(SNOW, 0.9); g.fillRect(X - Ww / 2, Y - Hh - pw * 0.02, Ww, pw * 0.03);
            }
            light(g, -pw / 2, -pw, pw / 2, 0, side, {});
        } else if (kind === 'sledcat') {
            const sw = K.w * u, back = face === 'back';
            g.fillStyle = css([180, 36, 40]); g.fillRect(-sw * 0.45, -sw * 0.2, sw * 0.9, sw * 0.08);
            g.strokeStyle = css([200, 170, 90]); g.lineWidth = sw * 0.03; g.beginPath(); g.moveTo(-sw * 0.5, -sw * 0.03); g.lineTo(sw * 0.4, -sw * 0.03); g.quadraticCurveTo(sw * 0.55, -sw * 0.03, sw * 0.52, -sw * 0.15); g.stroke();
            blob(g, -sw * 0.05, -sw * 0.36, sw * 0.18, sw * 0.17, [226, 140, 60]); blob(g, sw * 0.06, -sw * 0.56, sw * 0.12, sw * 0.11, [226, 140, 60]);
            for (const s of [-1, 1]) { g.fillStyle = css([226, 140, 60]); poly(g, [sw * 0.06 + s * sw * 0.04, -sw * 0.62, sw * 0.06 + s * sw * 0.1, -sw * 0.75, sw * 0.06 + s * sw * 0.12, -sw * 0.56]); g.fill(); }
            if (!back) { blob(g, sw * 0.02, -sw * 0.57, sw * 0.02, sw * 0.025, [40, 50, 30]); blob(g, sw * 0.1, -sw * 0.57, sw * 0.02, sw * 0.025, [40, 50, 30]); g.fillStyle = css([40, 110, 70]); g.fillRect(-sw * 0.06, -sw * 0.46, sw * 0.24, sw * 0.04); }
            g.strokeStyle = css([226, 140, 60]); g.lineWidth = sw * 0.06; g.beginPath(); g.moveTo(-sw * 0.2, -sw * 0.3); g.quadraticCurveTo(-sw * 0.42, -sw * 0.4, -sw * 0.36, -sw * 0.6); g.stroke();
            light(g, -sw / 2, -sw * 0.8, sw / 2, 0, side, {});
        } else if (kind === 'deer') {
            const dw = K.w * u, back = face === 'back';
            g.fillStyle = css([150, 104, 66]); ell(g, 0, -dw * 0.55, dw * 0.32, dw * 0.14); g.fill();
            for (const x of [-0.22, -0.12, 0.14, 0.24]) g.fillRect(x * dw - dw * 0.025, -dw * 0.5, dw * 0.05, dw * 0.5);
            g.beginPath(); g.moveTo(dw * 0.22, -dw * 0.6); g.lineTo(dw * 0.34, -dw * 0.9); g.lineTo(dw * 0.42, -dw * 0.86); g.lineTo(dw * 0.34, -dw * 0.55); g.closePath(); g.fill();
            blob(g, dw * 0.42, -dw * 0.9, dw * 0.08, dw * 0.055, [150, 104, 66], 1, 0.3);
            g.strokeStyle = css([110, 80, 56]); g.lineWidth = dw * 0.02; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(dw * 0.38, -dw * 0.95); g.lineTo(dw * (0.36 + s * 0.05), -dw * 1.12); g.lineTo(dw * (0.32 + s * 0.09), -dw * 1.18); g.moveTo(dw * (0.37 + s * 0.03), -dw * 1.05); g.lineTo(dw * (0.43 + s * 0.06), -dw * 1.1); g.stroke(); }
            blob(g, -dw * 0.3, -dw * 0.6, dw * 0.05, dw * 0.04, [240, 232, 220]);
            if (!back) blob(g, dw * 0.48, -dw * 0.9, dw * 0.02, dw * 0.02, [30, 24, 26]);
            g.fillStyle = css(SNOW, 0.9); ell(g, -dw * 0.02, -dw * 0.68, dw * 0.24, dw * 0.03); g.fill();
            light(g, -dw / 2, -dw * 1.2, dw / 2, 0, side, {});
        } else if (kind === 'train') {
            const tw = K.w * u, th = K.h * u;
            g.fillStyle = css([40, 44, 56]); g.fillRect(-tw * 0.45, -th * 0.65, tw * 0.6, th * 0.4); g.fillRect(tw * 0.05, -th * 1.0, tw * 0.36, th * 0.75);
            g.fillStyle = css([180, 36, 40]); g.fillRect(-tw * 0.45, -th * 0.42, tw * 0.9, th * 0.1); g.fillRect(-tw * 0.38, -th * 0.95, tw * 0.1, th * 0.32);
            g.fillStyle = css([226, 190, 90]); g.fillRect(-tw * 0.5, -th * 0.6, tw * 0.05, th * 0.12);
            warmWin(tw * 0.12, -th * 0.9, tw * 0.2, th * 0.25, false);
            for (const x of [-0.32, -0.08, 0.25]) { blob(g, x * tw, -th * 0.12, th * 0.14, th * 0.14, [30, 30, 36]); blob(g, x * tw, -th * 0.12, th * 0.05, th * 0.05, [200, 40, 40]); }
            out.chimney = { x: -tw * 0.33, y: -th * 0.98 };
            light(g, -tw / 2, -th, tw / 2, 0, side, {});
        }
        out.opts = { widths: [R * 0.035 * ps, R * 0.018 * ps, R * 0.009 * ps], seed: kind.length * 13 + (face === 'side' ? 3 : 0), len: 2.4, tol: 46, jit: 0.06, fine: 0.55 };
        return out;
    }
    // ---- The cat -----------------------------------------------------------------------------------
    // Coats as functions of where on the cat (x, y in its own units: height
    // 1, x toward the globe negative) and which part: its colour.
    const COATS = {
        'black-fluffy': { base: [34, 30, 36], light: [70, 62, 70], pattern: null },
        'buff-tabby': { base: [222, 176, 120], light: [244, 214, 170], stripe: [184, 132, 84], chest: [244, 224, 190] },
        holstein: { base: [244, 240, 232], light: [255, 252, 246], patches: [32, 30, 36] },
        tuxedo: { base: [30, 28, 32], light: [64, 60, 68], white: [244, 242, 236], bib: true },
        'grey-tabby': { base: [140, 142, 150], light: [186, 188, 196], stripe: [86, 88, 98], chest: [200, 202, 208] },
        tortie: { base: [40, 30, 28], light: [80, 60, 50], mottle: [[150, 86, 40], [120, 64, 30], [180, 110, 60]] },
        'grey-mottled': { base: [128, 132, 140], light: [170, 174, 182], mottle: [[96, 100, 108], [150, 154, 162]] },
        'orange-white': { base: [226, 136, 58], light: [248, 178, 100], stripe: [196, 108, 40], white: [248, 242, 230], bib: true },
        'blue-persian': { base: [138, 148, 170], light: [176, 184, 204], chest: [160, 168, 188] },
    };
    // The parts, painted, for one cat at height `h` CSS px facing toward the
    // globe (side: where the cat is, 1 to the right of it). Returns
    // { body, head, leg (the near fore leg, which taps), each { canvas, ax,
    // ay (its pivot, px) }, tail colours, eye colour, and the head's and
    // shoulder's places in cat units }.
    function cat(id, h, ps, side) {
        const C = SnowGlobeLogic.CATS[id], P = COATS[C.coat], R0 = rng(id.length * 97 + 11), fl = C.fluff || 0, s = -side;   // s: toward the globe
        const colAt = (x, y, part) => {
            let col = P.base;
            const n = Math.sin(x * 23 + y * 7) * Math.sin(y * 19 - x * 5);
            if (P.stripe && part !== 'muzzle' && Math.sin(y * (part === 'head' ? 60 : 34) + Math.sin(x * 9) * 2.2) > 0.45) col = P.stripe;
            if (P.patches && (n > 0.35 || (part === 'head' && x * s > 0.02 && y > 0.75))) col = P.patches;
            if (P.mottle) { const m = Math.sin(x * 31 + 2) * Math.sin(y * 27 + x * 13) + Math.sin(x * 11 - y * 17) * 0.6; if (m > 0.2) col = P.mottle[(m * 7 | 0) % P.mottle.length]; }
            if (P.bib && ((part === 'body' && x * s > 0.02 && y > 0.36 && y < 0.6 && Math.abs(x - s * 0.08) < 0.09) || (part === 'body' && y < 0.09 && x * s > -0.04) || part === 'paw' || (part === 'leg' && y < -0.34) || part === 'muzzle')) col = P.white;
            if (P.chest && part === 'body' && x * s > 0.02 && y > 0.36 && y < 0.58) col = P.chest;
            return col;
        };
        // An ellipse as its own closed piece of a path.
        const E = (p, x, y, rx, ry, rot = 0) => { p.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot)); p.ellipse(x, y, rx, ry, rot, 0, TAU); p.closePath(); };
        // Paint a part: its silhouette (`shape(path)`, cat units, y up, from
        // its pivot), dabs of its coat over it, fur breaking the edge, lit.
        const make = (w, hh, ax, ay, shape, part, dirFn, extra) => {
            const W = w * h, H = hh * h, c = canvas(W * ps, H * ps), g = c.getContext('2d'), k = ps * h;
            const path = new Path2D(); shape(path);
            g.setTransform(k, 0, 0, -k, ax * k, ay * k);       // cat units, y up, origin at the pivot
            g.fillStyle = css(P.base); g.fill(path);
            g.save(); g.clip(path);
            for (let i = 0; i < 1100; i++) {
                const x = -ax + R0() * w, y = ay - R0() * hh;
                blob(g, x, y, 0.016 + R0() * 0.02, 0.008 + R0() * 0.01, colAt(x, y + (part === 'head' ? 0.72 : 0), part), 0.85, (dirFn ? dirFn(x, y) : 1.57) + (R0() - 0.5) * 0.4);
            }
            if (extra) extra(g);
            g.restore();
            // Fur that breaks the edge (fluffy coats more so): short strokes outward from inside the silhouette.
            g.lineCap = 'round';
            for (let i = 0; i < 260 * (0.4 + fl); i++) {
                const x = -ax + R0() * w, y = ay - R0() * hh;
                if (!g.isPointInPath(path, (x + ax) * k, (ay - y) * k)) continue;
                const a = (dirFn ? dirFn(x, y) : 1.57) + Math.PI + (R0() - 0.5) * 0.8, l = 0.012 + R0() * 0.014 * (1 + fl * 0.5);
                g.strokeStyle = css(colAt(x, y + (part === 'head' ? 0.72 : 0), part), 0.75); g.lineWidth = 0.006 + 0.002 * fl;
                g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
            }
            g.setTransform(1, 0, 0, 1, 0, 0);
            // Light: warm from the candle (across the globe, so on the side toward it), cool from the window above.
            g.globalCompositeOperation = 'source-atop';
            const gr = g.createLinearGradient(0, 0, c.width, 0), warmAt = s < 0 ? 0 : 1;
            gr.addColorStop(warmAt, css(WARM, 0.34)); gr.addColorStop(0.5, 'rgba(0,0,0,0)'); gr.addColorStop(1 - warmAt, 'rgba(8,6,18,0.45)');
            g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
            const gv = g.createLinearGradient(0, 0, 0, c.height); gv.addColorStop(0, css(COOL, 0.16)); gv.addColorStop(0.45, 'rgba(0,0,0,0)'); gv.addColorStop(1, 'rgba(8,6,18,0.35)');
            g.fillStyle = gv; g.fillRect(0, 0, c.width, c.height);
            g.globalCompositeOperation = 'source-over';
            return { canvas: c, ax: ax * h, ay: ay * h, w: W, h: H, opts: { widths: [h * 0.045 * ps, h * 0.024 * ps, h * 0.012 * ps], seed: id.length + part.length, len: 2.2 + fl * 0.4, tol: 70, jit: 0.08, fine: 0.4, dir: dirFn ? (u, v) => -dirFn(u * w - ax, ay - v * hh) : null } };
        };
        const furDown = (x, y) => -Math.PI / 2 + x * 1.2 * s;
        const puff = 1 + fl * 0.12;
        // The body: haunch away from the globe, chest toward it, the far fore leg.
        const body = make(0.84 * puff, 0.72, 0.42 * puff, 0.68, p => {
            E(p, -s * 0.13, 0.2, 0.25 * puff, 0.21 * puff);                 // haunch
            E(p, 0, 0.36, 0.2 * puff, 0.3 * puff, s * 0.18);                 // torso
            E(p, s * 0.08, 0.44, 0.14 * puff, 0.16 * puff);                  // chest
            E(p, s * 0.015, 0.03, 0.055, 0.03);                              // the far paw
            p.rect(s * 0.015 - 0.025, 0.03, 0.05, 0.38);                     // the far fore leg
            E(p, -s * 0.15, 0.03, 0.15 * puff, 0.05);                        // the haunch's foot
        }, 'body', furDown, g => {
            if (fl > 0.5) for (let i = 0; i < 50; i++) blob(g, (R0() - 0.5) * 0.5, 0.1 + R0() * 0.5, 0.05, 0.02, P.light, 0.3, R0() * TAU);
        });
        // The near fore leg, which taps: its pivot at the shoulder.
        const leg = make(0.16, 0.5, 0.08, 0.03, p => {
            p.moveTo(-0.04, 0); p.lineTo(-0.034, -0.41); p.ellipse(0, -0.425, 0.055, 0.04, 0, Math.PI, 0, true); p.lineTo(0.036, 0); p.ellipse(0, 0, 0.04, 0.03, 0, 0, Math.PI, false); p.closePath();
        }, 'leg', () => -Math.PI / 2, g => { for (let i = 0; i < 3; i++) blob(g, (i - 1) * 0.025, -0.445, 0.016, 0.01, shade(colAt(0, 0.02, 'paw'), 0.8), 0.9); });
        // The head (its eyes and whiskers are drawn live), its pivot at the middle of the face.
        const flat = C.flat ? 0.6 : 1, earH = C.flat ? 0.17 : 0.22;
        const head = make(0.5 * puff, 0.5, 0.25 * puff, 0.3, p => {
            E(p, 0, 0, 0.165 * puff, 0.145 * puff);
            E(p, s * 0.03, -0.045, 0.1, 0.07 * flat);                        // muzzle
            for (const e of [-1, 1]) { p.moveTo(e * 0.15 * puff, 0.03); p.lineTo(e * 0.12 * puff + s * 0.02, earH); p.lineTo(e * 0.03, 0.12); p.closePath(); }
        }, 'head', (x, y) => Math.atan2(y, x), g => {
            // Inner ears, the muzzle, a nose.
            for (const e of [-1, 1]) { g.fillStyle = css([226, 150, 150], 0.85); g.beginPath(); g.moveTo(e * 0.125 * puff, 0.06); g.lineTo(e * 0.115 * puff + s * 0.016, earH - 0.035); g.lineTo(e * 0.06, 0.11); g.closePath(); g.fill(); }
            const mz = colAt(0, 0, 'muzzle'); blob(g, s * 0.03, -0.05, 0.085, 0.055 * flat, lerp(mz, [255, 250, 240], P.bib ? 0 : 0.25), 0.85);
            g.fillStyle = css(C.coat === 'black-fluffy' || C.coat === 'tuxedo' ? [70, 50, 56] : [210, 120, 126]); g.beginPath(); g.moveTo(s * 0.03 - 0.022, -0.018); g.lineTo(s * 0.03 + 0.022, -0.018); g.lineTo(s * 0.03, -0.042); g.closePath(); g.fill();
        });
        const tail = [P.base, P.light, P.stripe || P.base, P.mottle ? P.mottle[0] : P.base];
        return { id, C, P, body, head, leg, tail, eyes: hex(C.eyes), s, headAt: { x: s * 0.06, y: 0.74 }, shoulder: { x: s * 0.1, y: 0.46 }, tailRoot: { x: -s * 0.3, y: 0.06 }, puff };
    }

    // ---- Little things -----------------------------------------------------------------------------
    // Flakes: a soft round one, and glitter in a few colours (a four-point glint).
    function flake(r, ps) { return glow(r * ps, [244, 248, 255], 0.55); }
    function glint(r, ps, col) {
        const R = r * ps, c = canvas(R * 2, R * 2), g = c.getContext('2d');
        g.translate(R, R); g.drawImage(glow(R * 0.6, col, 0.3), -R * 0.6, -R * 0.6);
        g.strokeStyle = css(lerp(col, [255, 255, 255], 0.6), 0.9); g.lineWidth = Math.max(0.6, R * 0.09); g.lineCap = 'round';
        for (const [dx, dy, l] of [[1, 0, 1], [0, 1, 0.75]]) { g.beginPath(); g.moveTo(-dx * R * l, -dy * R * l); g.lineTo(dx * R * l, dy * R * l); g.stroke(); }
        return c;
    }
    // A music note in gold, with its own soft light.
    function note(size, ps, kind) {
        const S = size * ps, c = canvas(S * 1.6, S * 1.6), g = c.getContext('2d');
        g.translate(S * 0.8, S * 0.8); g.drawImage(glow(S * 0.75, [255, 210, 120], 0.15), -S * 0.75, -S * 0.75);
        g.fillStyle = css([255, 222, 140]); g.strokeStyle = css([255, 222, 140]); g.lineWidth = S * 0.08;
        g.beginPath(); g.ellipse(-S * 0.16, S * 0.22, S * 0.16, S * 0.11, -0.4, 0, TAU); g.fill();
        g.beginPath(); g.moveTo(-S * 0.02, S * 0.2); g.lineTo(-S * 0.02, -S * 0.36); g.stroke();
        if (kind) { g.beginPath(); g.ellipse(S * 0.26, S * 0.12, S * 0.16, S * 0.11, -0.4, 0, TAU); g.fill(); g.beginPath(); g.moveTo(S * 0.4, S * 0.1); g.lineTo(S * 0.4, -S * 0.44); g.stroke(); g.lineWidth = S * 0.12; g.beginPath(); g.moveTo(-S * 0.02, -S * 0.36); g.lineTo(S * 0.4, -S * 0.44); g.stroke(); }
        else { g.beginPath(); g.moveTo(-S * 0.02, -S * 0.36); g.quadraticCurveTo(S * 0.25, -S * 0.2, S * 0.18, S * 0.02); g.stroke(); }
        return c;
    }

    return { canvas, css, shade, lerp, hex, glow, soften, strokes, paint, weave, outside, room, base, key, glass, behind, ground, thing, cat, flake, glint, note, COATS, BASES, WARM, COOL };
})();
