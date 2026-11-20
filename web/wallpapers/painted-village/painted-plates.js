// Painted Village's underpainting (SPEC §10.41.3, step 1). Every shape is
// filled into several plates at once:
//   alb     its local colour, as it would be in flat daylight
//   geo     how it stands: the row of its foot (its depth), which way it
//           faces (PaintedLogic.CLS), how much extra air is in front of it
//   mat     how it wants to be brushed: direction, finest stroke, material
//   emit    what is lit from within (glass, lamp heads), still showing
//   skym    where the sky still shows
//   bump    the ground's humps (drifts, banks), as heights
//   shadowA, shadowB   each standing thing's shadow, for the two key lights
// and whatever stands is remembered as a silhouette, to cut the finished
// picture into "everything nearer than this" for whoever walks behind it.
// Coordinates are CSS pixels; the plates are `ps` picture pixels to one.

const PaintedPlates = (() => {
    const { clamp, CLS, footByte, angByte } = PaintedLogic;
    const TAU = Math.PI * 2;
    const MAT = { SKY: 0, SNOW: 1, ROOF: 2, WALL: 3, STONE: 4, FIR: 5, FROST: 6, ICE: 7, FIG: 8, WOOD: 9, GLASS: 10 };

    const rng = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const css = (c, a = 1) => `rgba(${clamp(c[0]) * 255 | 0},${clamp(c[1]) * 255 | 0},${clamp(c[2]) * 255 | 0},${a})`;
    const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
    const poly = (g, pts) => { g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); };
    const ell = (g, x, y, rx, ry, rot = 0) => { g.moveTo(x + Math.max(0.1, rx) * Math.cos(rot), y + Math.max(0.1, rx) * Math.sin(rot)); g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU); };

    class Plates {
        constructor(cam, pw, ph, seed, glow) {
            this.cam = cam; this.pw = pw; this.ph = ph; this.ps = pw / cam.W;
            this.hw = Math.ceil(pw / 2); this.hh = Math.ceil(ph / 2);
            this.glowAt = glow;                                   // where the afterglow is, in CSS px
            const ctx = (w, h, s, read) => { const g = canvas(w, h).getContext('2d', read ? { willReadFrequently: true } : undefined); g.setTransform(s, 0, 0, s, 0, 0); g.scale0 = s; return g; };
            for (const n of ['alb', 'geo', 'mat']) this[n] = ctx(pw, ph, this.ps, true);
            this.emit = ctx(pw, ph, this.ps, false);
            for (const n of ['skym', 'bump', 'shadowA', 'shadowB']) this[n] = ctx(this.hw, this.hh, this.ps / 2, true);
            this.bump.fillStyle = '#000'; this.bump.fillRect(0, 0, cam.W, cam.H);
            this.R = rng(seed);
            this.sil = null;                                      // while set, shapes go there as silhouettes and nowhere else
            this.o = {};
            this.groups = []; this.lights = []; this.bulbs = []; this.smokes = []; this.solids = []; this.queue = []; this.hits = []; this.letters = []; this.spots = {};
            this.set({ foot: cam.H, cls: CLS.GROUND, haze: 0, ang: null, size: 13, m: MAT.SNOW });
        }
        rr(a, b) { return a + (b - a) * this.R(); }
        pick(a) { return a[Math.floor(this.R() * a.length)]; }
        vary(c, v, w = 0) { const k = 1 + this.rr(-v, v), t = this.rr(-w, w); return [c[0] * k + t, c[1] * k, c[2] * k - t]; }

        // How what is filled next stands and is brushed. `size` is the finest
        // stroke wanted, in design pixels (a 900-pixel-high picture's).
        set(o) {
            Object.assign(this.o, o);
            const { foot, cls, haze, ang, size, m } = this.o;
            this.geoFill = `rgb(${footByte(foot, this.cam)},${cls},${clamp(haze) * 255 | 0})`;
            this.matFill = `rgb(${angByte(ang)},${clamp(Math.round(size * 4), 4, 255)},${m * 20})`;
            return this;
        }
        fill(col, fn) {
            if (this.sil) { if (this.o.cls === CLS.GROUND) return; const g = this.sil; g.beginPath(); fn(g); g.fillStyle = '#000'; g.fill(); return; }   // what lies on the ground is no silhouette
            let g = this.alb; g.beginPath(); fn(g); g.fillStyle = Array.isArray(col) ? css(col) : col; g.fill();
            g = this.geo; g.beginPath(); fn(g); g.fillStyle = this.geoFill; g.fill();
            g = this.mat; g.beginPath(); fn(g); g.fillStyle = this.matFill; g.fill();
            for (const e of [this.emit, this.skym]) { e.globalCompositeOperation = 'destination-out'; e.beginPath(); fn(e); e.fillStyle = '#000'; e.fill(); e.globalCompositeOperation = 'source-over'; }
        }
        line(col, w, fn) {
            const run = (g, style) => { g.beginPath(); fn(g); g.strokeStyle = style; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(); };
            if (this.sil) return run(this.sil, '#000');
            run(this.alb, Array.isArray(col) ? css(col) : col); run(this.geo, this.geoFill); run(this.mat, this.matFill);
            for (const e of [this.emit, this.skym]) { e.globalCompositeOperation = 'destination-out'; run(e, '#000'); e.globalCompositeOperation = 'source-over'; }
        }
        // The open sky: white, for the hour to colour.
        sky(y) {
            this.set({ cls: CLS.SELF, m: MAT.SKY, size: 9, ang: null, foot: 0, haze: 0 });
            this.fill('#fff', g => g.rect(0, 0, this.cam.W, y));
            this.skym.fillStyle = '#fff'; this.skym.fillRect(0, 0, this.cam.W, y);
        }
        // A soft touch of colour on the underpainting only.
        soft(x, y, rx, ry, col, a) {
            if (this.sil) return;
            const g = this.alb; g.save(); g.translate(x, y); g.scale(1, ry / rx);
            const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx); gr.addColorStop(0, css(col, a)); gr.addColorStop(1, css(col, 0));
            g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, TAU); g.fill(); g.restore();
        }
        // A rise in the ground, for the light to rake across.
        hump(x, y, rx, ry, h) {
            if (this.sil) return;
            const g = this.bump; g.save(); g.globalCompositeOperation = 'lighter'; g.translate(x, y); g.scale(1, ry / rx);
            const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx); gr.addColorStop(0, `rgba(255,255,255,${h})`); gr.addColorStop(0.6, `rgba(255,255,255,${h * 0.45})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, TAU); g.fill(); g.restore();
        }

        // ---- Light sources ------------------------------------------------------
        // A group is what goes on and off together: a floor of a house, a lamp.
        group(name, o = {}) { const g = { id: this.groups.length, name, lights: [], glass: [], halos: [], level: 0, want: 0, gain: 1, ...o }; this.groups.push(g); return g; }
        // A light at (x metres, y metres up, depth z), of colour c and strength
        // I; `face` [x, z] makes it a window, shining mostly the way it faces.
        light(group, o) { if (this.sil) return; const l = { r2: 0.4, ...o, zm: o.z * this.cam.zm - (o.out ?? 0.6), group: group.id }; delete l.z; this.lights.push(l); group.lights.push(l); }
        glowRect(group, col, x, y, w, h) { this.glowPoly(group, col, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]); }
        glowPoly(group, col, pts) {
            if (this.sil) return;
            const g = this.emit; g.fillStyle = col; g.beginPath(); poly(g, pts); g.fill();
            const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), x = Math.min(...xs), y = Math.min(...ys);
            group.glass.push({ col, pts, x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y });
        }
        // Lettering too small for a brush: the signwriter's, put on when the painting is done.
        letter(col, str, x, y, px, o = {}) { if (!this.sil) this.letters.push({ col, str, x, y, px, ...o }); }
        glowEll(group, col, x, y, rx, ry) { if (this.sil) return; const g = this.emit; g.fillStyle = col; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill(); group.glass.push({ col, x: x - rx, y: y - ry, w: rx * 2, h: ry * 2, round: true }); }
        halo(group, x, y, r) { if (!this.sil) group.halos.push({ x, y, r }); }
        // A bulb on a string: `set` is which string or tree, `foot` the row it stands on.
        bulb(x, y, r, foot, set = 'string') { if (!this.sil) this.bulbs.push({ x, y, r, foot, set, phase: this.R(), i: this.bulbs.length }); }
        smoke(x, y, s, z) { if (!this.sil) this.smokes.push({ x, y, s, z }); }
        // Somewhere a tap can land, or the cast needs to find.
        hit(kind, x0, y0, x1, y1, o = {}) { if (!this.sil) this.hits.push({ kind, x0, y0, x1, y1, ...o }); }

        // ---- Standing things ----------------------------------------------------
        // `body` draws the thing; it is drawn again, the same, as a shadow for
        // each key light, into the bands it is nearer than, and for the ice.
        // o.shadow: its length (0 for none); o.reflect: [x0, y0, x1, y1], if the
        // ice shows it; o.flat: it never hides anyone.
        solid(z, fx, fy, body, o = {}) {
            const seed = (this.R() * 1e9) | 0;
            const draw = () => { const keep = this.R; this.R = rng(seed); body(); this.R = keep; };
            draw();
            const len = o.shadow ?? 1, shade = o.shadowOf ? () => { const keep = this.R; this.R = rng(seed); o.shadowOf(); this.R = keep; } : draw;
            if (len > 0) {
                const s = this.shadowA.scale0, skew = (fx - this.glowAt.x) / (this.cam.W * 0.55) * len;
                this.shadowA.setTransform(s, 0, -skew * s, -len * 0.55 * s, skew * fy * s, fy * (1 + len * 0.55) * s);
                this.sil = this.shadowA; shade();
                this.shadowA.setTransform(s, 0, 0, s, 0, 0);
                const kx = 0.9 * len, ky = 0.3;
                this.shadowB.setTransform(s, 0, -kx * s, ky * s, kx * fy * s, fy * (1 - ky) * s);
                this.sil = this.shadowB; shade();
                this.shadowB.setTransform(s, 0, 0, s, 0, 0);
                this.sil = null;
            }
            this.solids.push({ z, fy, draw, reflect: o.reflect || null, flat: !!o.flat });
        }
        // Queue something to be drawn at depth z; run() draws far to near.
        add(z, fn) { this.queue.push([z, fn]); }
        run() { this.queue.sort((a, b) => b[0] - a[0]); for (const q of this.queue) q[1](); this.queue = []; }

        // "Everything nearer than `bands[k]`", as alpha, at half size.
        masks(bands) {
            return bands.map(limit => {
                const g = canvas(this.hw, this.hh).getContext('2d'), s = this.ps / 2;
                g.setTransform(s, 0, 0, s, 0, 0);
                let any = false;
                this.sil = g;
                for (const t of this.solids) if (!t.flat && t.z < limit) { t.draw(); any = true; }
                this.sil = null;
                return any ? g.canvas : null;
            });
        }
        // What the ice shows: each such thing's silhouette, in a canvas of its own.
        reflections() {
            const out = [], s = this.ps / 2;
            for (const t of this.solids) {
                if (!t.reflect) continue;
                const [x0, y0, x1, y1] = t.reflect, g = canvas((x1 - x0) * s + 2, (y1 - y0) * s + 2).getContext('2d');
                g.setTransform(s, 0, 0, s, -x0 * s, -y0 * s);
                this.sil = g; t.draw(); this.sil = null;
                out.push({ mask: g.canvas, x: x0, y: y0, w: x1 - x0, h: y1 - y0, fy: t.fy });
            }
            return out.sort((a, b) => a.fy - b.fy);
        }
    }

    return { Plates, MAT, TAU, rng, css, mixc, canvas, poly, ell };
})();
