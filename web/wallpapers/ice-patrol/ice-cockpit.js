// Ice Patrol's cockpit (SPEC §10.34): a two-seat skimmer's, seen from the
// front seat. Dark, flat-panelled and angular; two heavy canopy struts lean
// in over the pilot's head and leave the picture at the top (nobody sees
// where they are rooted); the console is a trapezoid whose wings sweep back
// past the view on both sides, under louvred walls. Three 2D canvases over
// the WebGL view:
//
//   frame   everything that doesn't move: struts, glass, hood, plates,
//           housings, louvres, hoses, bolts, lettering. Painted once per
//           size, and again only when the light outside has moved on a step
//           (twelve from night to day), frost has crept another notch across
//           the glass, or a low sun has found the scratches.
//   gauges  what does move, in a strip over the console, about fifteen
//           times a second, and each instrument only when what it shows has
//           changed: the terrain scan, the attitude ball, the terrain
//           scope, the heading tape, the ladders, dials, lamps and switches.
//   grips   the yoke's two handles, painted with the frame and moved by a
//           CSS transform.
//
// The instruments are honest. The centre scope is a live scan of the real
// terrain about the craft (IceLogic.scanCell): relief lit from the
// north-west, a contour every few metres, whatever stands higher than we
// fly in the warning colour. The map is kept north-up and scrolled a cell
// at a time; a few rows are rescanned each tick; the scope turns and slides
// it under the craft. The rest of the panel's small life (switches thrown,
// lamps blinking) is IceLogic.greebles: a function of the time and a seed.

const ICE_PANEL_SIZES = { full: 1, small: 0.68, tiny: 0.48 };
const ICE_GLOWS = { green: [90, 255, 150], amber: [255, 186, 72], blue: [120, 205, 255] };
const ICE_LAMPS = { red: [255, 72, 52], amber: [255, 176, 64], white: [226, 238, 255], blue: [120, 196, 255], green: [87, 227, 137] };
// The rocker bays, left and right of the heading tape: which of
// IceLogic.greebles' switches each rocker is, its name and its lamp.
const ICE_BAYS = [
    [[3, 'PNL', 'white'], [4, 'HTR', 'amber'], [6, 'AUX', 'red'], [7, 'BUS', 'white']],
    [[8, 'PMP', 'white'], [9, 'VNT', 'red'], [5, 'BST', 'amber'], [10, 'REC', 'red']],
];
const ICE_TOGGLES = [[0, 'AP'], [-1, 'TF'], [1, 'LMP'], [2, 'ICE']];      // under the attitude ball; -1 is always up
const ICE_SIDE_TOGGLES = [[11, 12, 13], [14, 15, 16]];                     // on the wings
const ICE_FONT = 'ui-monospace, Menlo, Consolas, monospace';

class IceCockpit {
    constructor(host, terrain, seed = 1) {
        this.host = host;
        this.terrain = terrain;
        this.seed = seed;
        this.PAD = 28;               // the frame overhangs the screen, so it can sway without showing an edge
        this.key = '';
        this.gaugeClock = -1;
        this.frost = 0;
        this.then = 0;
        this.sigs = {};              // what each instrument last drew
        this.life = {};              // IceLogic.greebles' answer
        this.cell = [0, 0, 0];
        this.sprites = {};
        this.scan = null;
    }

    mount() {
        const wrap = this.wrap = document.createElement('div');
        Object.assign(wrap.style, { position: 'fixed', left: -this.PAD + 'px', top: -this.PAD + 'px', zIndex: '-2', pointerEvents: 'none', willChange: 'transform' });
        this.frame = document.createElement('canvas');
        this.gauges = document.createElement('canvas');
        this.grips = document.createElement('canvas');
        for (const canvas of [this.frame, this.gauges, this.grips]) {
            Object.assign(canvas.style, { position: 'absolute', left: '0', top: '0', pointerEvents: 'none' });
            wrap.appendChild(canvas);
        }
        this.radar = document.createElement('canvas');    // the scan's map: a pixel a cell, north-up
        // A 2D canvas can lose its picture too (the GPU process restarting): paint it again.
        this.onRestored = () => { this.key = ''; this.gaugeClock = -1; this.scan = null; };
        this.frame.addEventListener('contextrestored', this.onRestored);
        document.body.appendChild(wrap);
    }

    unmount() {
        this.wrap?.remove();
        this.wrap = null;
    }

    // Where everything sits, in CSS px from the screen's top left. The
    // console is drawn in shares of its height (`ph`), so a smaller one is
    // the same console, lower down, under more glass.
    layout(w, h, ratio, config) {
        if (!this.wrap) return;
        const P = this.PAD, bottom = h - (this.host.insets?.bottom || 0);
        const ph = Math.max(110, Math.min(0.34 * h, w / 2.72, bottom * 0.5)) * (ICE_PANEL_SIZES[config.panelSize] || 1);
        const top = bottom - ph, cx = w / 2, X = u => cx + u * ph, Y = v => top + v * ph;
        const g = this.g = { w, h, ratio, bottom, ph, top, cx };
        // The centre console: scan screen, a ladder and a grip each side of it, attitude left, terrain scope right.
        g.radar = { x: cx, y: Y(0.56), a: ph * 0.31 };
        g.adi = { x: X(-0.86), y: Y(0.565), r: ph * 0.235 };
        g.scope = { x: X(0.86), y: Y(0.545), w: ph * 0.56, h: ph * 0.41 };
        g.ladders = [-1, 1].map(side => ({ x: X(side * 0.455), y: Y(0.465), w: ph * 0.07, h: ph * 0.44 }));
        g.toggles = { x: g.adi.x, y: Y(0.905), gap: ph * 0.105 };
        g.status = { x: g.scope.x, y: Y(0.9), gap: ph * 0.13 };
        // Its brow: the heading tape between two warning lamps and two bays of rockers.
        g.tape = { x: cx, y: Y(0.105), w: ph * 0.78, h: ph * 0.085 };
        g.warn = [-1, 1].map(side => ({ x: X(side * 0.545), y: Y(0.105), w: ph * 0.125, h: ph * 0.085 }));
        g.bays = [-1, 1].map(side => ({ x: X(side * 0.93), y: Y(0.105), w: ph * 0.46, h: ph * 0.115 }));
        // The wings, where the screen is wide enough for them: sheared, as panels angled to the pilot are.
        g.wide = w / 2 > ph * 2.0;
        g.wing = 1.38;
        g.shear = 0.16;
        g.lamps = { x: X(-1.87), y: Y(0.34), w: ph * 0.5, h: ph * 0.13 };
        g.dial = { x: X(-2.04), y: Y(0.665), r: ph * 0.175 };
        g.load = { x: X(-1.665), y: Y(0.6), r: ph * 0.1 };
        g.time = { x: X(1.87), y: Y(0.34), w: ph * 0.5, h: ph * 0.115 };
        g.bars = { x: X(2.04), y: Y(0.665), w: ph * 0.34, h: ph * 0.42 };
        g.blinks = { x: X(1.665), y: Y(0.6), gap: ph * 0.085 };
        g.sideLadders = [-1, 1].map(side => ({ x: X(side * 1.485), y: Y(0.67), w: ph * 0.05, h: ph * 0.4 }));
        g.sideToggles = [-1, 1].map(side => ({ x: X(side * 1.665), y: Y(0.835), gap: ph * 0.09 }));
        // The dash line: a flat hood over the centre console, a chamfer, then the wings' sills falling away to the sides.
        g.coam = x => {
            const d = Math.abs(x - cx) / ph;
            return top + ph * (d < 1.3 ? 0 : d < g.wing ? 0.07 * (d - 1.3) / (g.wing - 1.3) : 0.07 + Math.min(g.shear * (d - g.wing), 0.3));
        };
        // Where each strut stands on the dash and where it leaves the top, as a share of the width from the side.
        g.pillar = w > h ? [0.2, 0.3] : [0.045, 0.17];
        g.grip = { x: X(-0.8), y: Y(0.55), w: ph * 1.6, h: h + P - Y(0.55) };

        Object.assign(this.wrap.style, { width: w + 2 * P + 'px', height: h + 2 * P + 'px' });
        const size = (canvas, cw, ch) => {
            canvas.width = Math.max(1, Math.round(cw * ratio));
            canvas.height = Math.max(1, Math.round(ch * ratio));
            canvas.style.width = cw + 'px';
            canvas.style.height = ch + 'px';
        };
        size(this.frame, w + 2 * P, h + 2 * P);
        g.gy = top - ph * 0.02;          // the gauge strip's top
        size(this.gauges, w, h - g.gy);
        Object.assign(this.gauges.style, { left: P + 'px', top: P + g.gy + 'px' });
        size(this.grips, g.grip.w, g.grip.h);
        Object.assign(this.grips.style, { left: P + g.grip.x + 'px', top: P + g.grip.y + 'px', transformOrigin: `50% ${(bottom + ph * 0.7 - g.grip.y).toFixed(1)}px` });
        this.key = '';
        this.gaugeClock = -1;
    }

    // ---- Every frame ----------------------------------------------------------------
    update(s) {
        if (!this.wrap || !this.g) return;
        const mode = s.config.cockpit;
        this.wrap.style.display = mode === 'none' ? 'none' : '';
        if (mode === 'none') return;
        const g = this.g, f = s.flight, dt = IceLogic.clamp(s.seconds - this.then, 0, 0.25);
        this.then = s.seconds;

        // The airframe moves about the pilot's head: back against a climb, away from a turn of the head, and with the air (IceLogic.bob).
        const x = -s.pan * 70 + s.bob.x, y = s.sway * IceLogic.clamp(f.climb * 0.12, -7, 7) + s.bob.y;
        this.wrap.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${(s.sway * f.roll * -0.35).toFixed(3)}deg)`;
        // The yoke: over with the turn, back with the climb, and further with a hand on it.
        const over = s.sway * IceLogic.clamp(f.turn * 9 + s.pilot.turn * 3, -6, 6), back = s.sway * IceLogic.clamp(f.climb * 0.1 + s.pilot.climb * 3, -5, 5);
        this.grips.style.transform = `translateY(${(-back * g.ph / 272).toFixed(2)}px) rotate(${over.toFixed(2)}deg)`;

        // Frost creeps in with the snow and clears slowly after.
        this.frost += ((s.level > 0.25 ? s.level : 0) - this.frost) * (1 - Math.exp(-dt / 4.2));
        const key = [mode, s.config.glow, Math.round(s.light.day * 12), Math.round(this.frost * 5), Math.round(s.lowSun * 3), g.wide].join('|');
        if (key !== this.key) {
            this.key = key;
            this.paintFrame(s, mode);
            this.sigs = {};
        }
        const every = s.calm ? 1 / 8 : 1 / 15;
        if (s.seconds - this.gaugeClock >= every || s.seconds < this.gaugeClock) {
            this.gaugeClock = s.seconds;
            this.paintGauges(s);
        }
    }

    // ---- Colour -----------------------------------------------------------------------
    // A surface colour under the cabin's light (0 to 1 a channel).
    lit(c, k = 1) {
        const L = this.cabin;
        return `rgb(${Math.round(c[0] * L[0] * k)},${Math.round(c[1] * L[1] * k)},${Math.round(c[2] * L[2] * k)})`;
    }
    glow(a = 1, k = 1) {
        const c = this.phosphor;
        return `rgba(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)},${a})`;
    }
    ink(name, a = 1, k = 1) {
        const c = ICE_LAMPS[name];
        return `rgba(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)},${a})`;
    }
    // The cold daylight along an edge that faces the glass.
    rim(k = 1) { return `rgba(206,226,248,${((0.07 + 0.5 * this.day) * k).toFixed(3)})`; }
    // The same marks every repaint: a little generator of its own, not Math.random.
    dice(seed) { return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296; }
    font(size) { return `600 ${size.toFixed(1)}px ${ICE_FONT}`; }

    // ---- Shapes ------------------------------------------------------------------------
    // A rectangle with its corners cut: nothing in here is round that needn't be.
    cham(ctx, x, y, w, h, c) {
        ctx.beginPath();
        ctx.moveTo(x + c, y);
        ctx.lineTo(x + w - c, y);
        ctx.lineTo(x + w, y + c);
        ctx.lineTo(x + w, y + h - c);
        ctx.lineTo(x + w - c, y + h);
        ctx.lineTo(x + c, y + h);
        ctx.lineTo(x, y + h - c);
        ctx.lineTo(x, y + c);
        ctx.closePath();
    }
    // A strip hanging from the dash line, between two offsets (shares of ph).
    band(ctx, x0, x1, v0, v1) {
        const g = this.g, n = 48;
        ctx.beginPath();
        for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n; ctx.lineTo(x, g.coam(x) + v0 * g.ph); }
        for (let i = n; i >= 0; i--) { const x = x0 + (x1 - x0) * i / n; ctx.lineTo(x, g.coam(x) + v1 * g.ph); }
        ctx.closePath();
    }
    bolt(ctx, x, y, r, hex = false) {
        if (r < 0.7) return;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.arc(x + r * 0.2, y + r * 0.3, r * 1.15, 0, 6.2832);
        ctx.fill();
        ctx.fillStyle = this.lit([104, 110, 120]);
        ctx.beginPath();
        if (hex) for (let i = 0; i < 6; i++) ctx.lineTo(x + Math.cos(i * 1.0472 + 0.3) * r, y + Math.sin(i * 1.0472 + 0.3) * r);
        else ctx.arc(x, y, r, 0, 6.2832);
        ctx.fill();
        ctx.fillStyle = this.rim(0.9);
        ctx.beginPath();
        ctx.arc(x - r * 0.25, y - r * 0.3, r * 0.42, 0, 6.2832);
        ctx.fill();
        ctx.strokeStyle = this.lit([20, 21, 24]);
        ctx.lineWidth = Math.max(0.5, r * 0.3);
        ctx.beginPath();
        if (hex) ctx.arc(x, y, r * 0.4, 0, 6.2832);
        else { ctx.moveTo(x - r * 0.7, y - r * 0.45); ctx.lineTo(x + r * 0.7, y + r * 0.45); }
        ctx.stroke();
    }
    // A raised plate: bevelled, bolted at the corners.
    plate(ctx, x, y, w, h, tone = 1) {
        const ph = this.g.ph, c = ph * 0.028, x0 = x - w / 2, y0 = y - h / 2;
        this.cham(ctx, x0, y0, w, h, c);
        const fill = ctx.createLinearGradient(0, y0, 0, y0 + h);
        fill.addColorStop(0, this.lit([50, 54, 61], tone));
        fill.addColorStop(1, this.lit([30, 32, 37], tone));
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.lineWidth = 1.6;
        ctx.stroke();
        // Light on the edges that face up and to the glass, shade under the others.
        ctx.strokeStyle = this.rim(0.55);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x0 + 1.4, y0 + h - c);
        ctx.lineTo(x0 + 1.4, y0 + c + 0.6);
        ctx.lineTo(x0 + c + 0.6, y0 + 1.4);
        ctx.lineTo(x0 + w - c, y0 + 1.4);
        ctx.stroke();
        const r = ph * 0.0125, in_ = ph * 0.04;
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) this.bolt(ctx, x + sx * (w / 2 - in_), y + sy * (h / 2 - in_), r);
    }
    // A hole in a plate: black, shadowed under its upper lip, a line of light on its lower one.
    recess(ctx, x, y, w, h, c = 2) {
        this.cham(ctx, x - w / 2 - 2.5, y - h / 2 - 2.5, w + 5, h + 5, c + 2);
        const edge = ctx.createLinearGradient(0, y - h / 2 - 3, 0, y + h / 2 + 3);
        edge.addColorStop(0, this.lit([12, 13, 15]));
        edge.addColorStop(1, this.lit([92, 100, 112]));
        ctx.fillStyle = edge;
        ctx.fill();
        this.cham(ctx, x - w / 2, y - h / 2, w, h, c);
        ctx.fillStyle = '#030506';
        ctx.fill();
    }
    ring(ctx, x, y, r) {
        const rim = ctx.createRadialGradient(x, y - r * 0.3, r * 0.6, x, y, r * 1.15);
        rim.addColorStop(0, this.lit([14, 15, 18]));
        rim.addColorStop(0.84, this.lit([78, 84, 95]));
        rim.addColorStop(1, this.lit([18, 19, 23]));
        ctx.fillStyle = rim;
        ctx.beginPath();
        ctx.arc(x, y, r * 1.15, 0, 6.2832);
        ctx.fill();
        ctx.fillStyle = '#030506';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 6.2832);
        ctx.fill();
    }
    knob(ctx, x, y, r, turn) {
        const cap = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r);
        cap.addColorStop(0, this.lit([116, 122, 132]));
        cap.addColorStop(1, this.lit([20, 21, 25]));
        ctx.fillStyle = cap;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) ctx.lineTo(x + Math.cos(i * 0.7854 + turn) * r, y + Math.sin(i * 0.7854 + turn) * r);
        ctx.fill();
        ctx.strokeStyle = this.lit([232, 234, 238]);
        ctx.lineWidth = Math.max(1, r * 0.18);
        ctx.beginPath();
        ctx.moveTo(x + Math.sin(turn) * r * 0.3, y - Math.cos(turn) * r * 0.3);
        ctx.lineTo(x + Math.sin(turn) * r * 0.9, y - Math.cos(turn) * r * 0.9);
        ctx.stroke();
    }
    // A ribbed hose through the points given.
    hose(ctx, points, width) {
        const run = () => { ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); };
        ctx.lineJoin = ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.lineWidth = width + 2;
        run();
        ctx.strokeStyle = this.lit([34, 36, 41]);
        ctx.lineWidth = width;
        run();
        ctx.lineCap = 'butt';
        ctx.setLineDash([Math.max(1, width * 0.22), Math.max(1.5, width * 0.4)]);
        ctx.strokeStyle = this.lit([78, 84, 94], 0.6 + 0.5 * this.day);
        ctx.lineWidth = width * 0.62;
        run();
        ctx.setLineDash([]);
        ctx.lineJoin = 'miter';
    }
    // A hydraulic ram from a to b: the barrel for the first part, bright rod for the rest.
    ram(ctx, ax, ay, bx, by, width) {
        const mx = ax + (bx - ax) * 0.58, my = ay + (by - ay) * 0.58, line = (x0, y0, x1, y1, w, style) => {
            ctx.strokeStyle = style;
            ctx.lineWidth = w;
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.stroke();
        };
        ctx.lineCap = 'butt';
        line(mx, my, bx, by, width * 0.42, this.lit([150, 160, 174], 0.5 + 0.6 * this.day));
        line(ax, ay, mx, my, width + 2, 'rgba(0,0,0,0.8)');
        line(ax, ay, mx, my, width, this.lit([44, 47, 54]));
        line(ax, ay, mx, my, width * 0.3, this.lit([84, 90, 102], 0.5 + 0.6 * this.day));
        line(mx - (bx - ax) * 0.03, my - (by - ay) * 0.03, mx, my, width * 1.25, this.lit([70, 75, 84]));
        this.bolt(ctx, ax, ay, width * 0.7, true);
        this.bolt(ctx, bx, by, width * 0.55, true);
    }
    label(ctx, text, x, y, size, style) {
        if (size < 5) return;
        ctx.font = this.font(size);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // Engraved by day; edge-lit in the panel's colour by night.
        ctx.fillStyle = style || (this.day < 0.5 ? this.glow(0.3 + 0.45 * (1 - this.day), 0.85) : this.lit([176, 184, 194], 0.85));
        ctx.fillText(text, x, y);
    }

    // ---- The frame: painted rarely -------------------------------------------------------
    paintFrame(s, mode) {
        const g = this.g, P = this.PAD, ctx = this.frame.getContext('2d'), { w, h } = g;
        const day = this.day = Math.round(s.light.day * 12) / 12;
        // Daylight through the glass, tinted a little by the sky; at night, only the panel's own lamps. The cabin sits in shade either way.
        const sky = s.horizon, peak = Math.max(sky[0], sky[1], sky[2], 1e-3);
        this.cabin = [0, 1, 2].map(i => IceLogic.mix(0.2 + 0.035 * i, 0.74 + 0.2 * sky[i] / peak, day));
        this.phosphor = ICE_GLOWS[s.config.glow] || ICE_GLOWS.green;
        this.inks = null;
        ctx.setTransform(g.ratio, 0, 0, g.ratio, P * g.ratio, P * g.ratio);
        ctx.clearRect(-P, -P, w + 2 * P, h + 2 * P);
        ctx.lineJoin = 'miter';
        if (mode === 'full') this.paintCanopy(ctx, s);
        this.paintConsole(ctx, mode);
        this.paintGrips();
    }

    // The canopy: glass, and the two struts that carry it.
    paintCanopy(ctx, s) {
        const g = this.g, P = this.PAD, { w, h, ph, cx } = g, [low, high] = g.pillar, day = this.day, night = 1 - day;
        const u = Math.min(w, h * 1.5), rnd = this.dice(11);       // u: the frame's scale
        const posts = [-1, 1].map(side => {
            const x0 = cx + side * (0.5 - low) * w, x1 = cx + side * (0.5 - high) * w;
            return { side, x0, y0: g.coam(x0) + ph * 0.05, x1, y1: -P, w0: u * 0.038, w1: u * 0.07 };
        });

        // Glass: a sheen across the panes, and a low sun in the scratches the wipers left.
        const sheen = ctx.createLinearGradient(w * 0.2, 0, w * 0.75, h * 0.7);
        sheen.addColorStop(0, 'rgba(255,255,255,0)');
        sheen.addColorStop(0.42, `rgba(220,235,255,${0.02 + 0.035 * day})`);
        sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
        sheen.addColorStop(0.63, `rgba(220,235,255,${0.012 + 0.02 * day})`);
        sheen.addColorStop(0.7, 'rgba(255,255,255,0)');
        ctx.fillStyle = sheen;
        ctx.fillRect(-P, -P, w + 2 * P, g.top + ph * 0.4 + P);
        const low_ = Math.round(s.lowSun * 3) / 3;
        if (low_ > 0) {
            const sx = cx + u * 0.16, sy = h * 0.2;
            ctx.lineWidth = 1;
            for (let i = 0; i < 70; i++) {
                const r = u * (0.03 + 0.3 * rnd()), a = rnd() * 6.283, len = 0.04 + 0.22 * rnd();
                ctx.strokeStyle = `rgba(255,236,208,${(low_ * (0.07 + 0.24 * rnd()) * (1 - r / (u * 0.4))).toFixed(3)})`;
                ctx.beginPath();
                ctx.arc(sx, sy, r, a, a + len);
                ctx.stroke();
            }
        }
        // Rime in the corners where glass meets metal, always a little; more, and crystals, when it snows.
        const frost = 0.22 + 0.78 * Math.round(this.frost * 5) / 5, cold = 0.45 + 0.55 * day;
        const corners = [];
        for (const p of posts) {
            corners.push([p.x0 - p.side * p.w0 * 0.6, p.y0 - ph * 0.05, 1], [p.x0 + p.side * p.w0 * 0.6, p.y0 - ph * 0.03, 0.8], [p.x1 - p.side * p.w1 * 0.5, 0, 0.7]);
            corners.push([cx + p.side * (w / 2 + P * 0.5), g.coam(cx + p.side * w / 2), 0.9], [cx + p.side * (w / 2 + P * 0.5), 0, 0.6]);
        }
        corners.push([cx - ph * 0.7, g.top, 0.5], [cx + ph * 0.7, g.top, 0.5]);
        for (const [x, y, k] of corners) {
            const r = u * (0.05 + 0.2 * frost) * k, ice = ctx.createRadialGradient(x, y, 0, x, y, r);
            ice.addColorStop(0, `rgba(232,242,252,${(0.4 * frost * cold).toFixed(3)})`);
            ice.addColorStop(1, 'rgba(232,242,252,0)');
            ctx.fillStyle = ice;
            ctx.fillRect(x - r, y - r, r * 2, r * 2);
            ctx.fillStyle = `rgba(245,250,255,${(0.34 * frost * cold).toFixed(3)})`;
            for (let i = 0; i < 110 * frost * k; i++) {
                const a = rnd() * 6.283, d = r * Math.pow(rnd(), 1.6) * 0.9, len = 2 + rnd() * 5;
                ctx.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d, Math.cos(a * 3) * len, 1);
            }
        }
        // By night the instruments stand in the windscreen, faintly and upside down.
        if (night > 0.3) {
            const a = (night - 0.3) * 0.16, y0 = g.top - ph * 0.02;
            const ghost = (x, gw, gh, colour) => {
                ctx.save();
                ctx.translate(x, y0 - gh * 0.42);
                ctx.scale(gw * 0.62, gh * 0.6);
                const fade = ctx.createRadialGradient(0, 0, 0.1, 0, 0, 1);
                fade.addColorStop(0, colour(a));
                fade.addColorStop(0.6, colour(a * 0.45));
                fade.addColorStop(1, colour(0));
                ctx.fillStyle = fade;
                ctx.fillRect(-1, -1, 2, 2);
                ctx.restore();
            };
            ghost(cx, g.radar.a * 2, ph * 0.5, k => this.glow(k));
            ghost(g.adi.x, g.adi.r * 1.7, ph * 0.32, k => `rgba(120,170,220,${k * 0.7})`);
            ghost(g.scope.x, g.scope.w, ph * 0.3, k => this.glow(k * 0.8));
            for (const l of g.ladders) ghost(l.x, l.w * 1.6, ph * 0.24, k => this.ink('red', k * 0.6));
        }

        // The struts: three long faces each (the outer in shadow, the flat,
        // and a bevel that catches the day), wider as they come back overhead.
        for (const p of posts) {
            const at = (t, o) => [p.x0 + (p.x1 - p.x0) * t - o * p.side * (p.w0 + (p.w1 - p.w0) * t) / 2, p.y0 + (p.y1 - p.y0) * t];
            const strip = (o0, o1, style) => {
                ctx.beginPath();
                ctx.moveTo(...at(0, o0));
                ctx.lineTo(...at(1, o0));
                ctx.lineTo(...at(1, o1));
                ctx.lineTo(...at(0, o1));
                ctx.closePath();
                ctx.fillStyle = style;
                ctx.fill();
            };
            const edge = (o, style, width) => {
                ctx.strokeStyle = style;
                ctx.lineWidth = width;
                ctx.beginPath();
                ctx.moveTo(...at(0, o));
                ctx.lineTo(...at(1, o));
                ctx.stroke();
            };
            const along = ctx.createLinearGradient(0, p.y0, 0, p.y1);
            along.addColorStop(0, this.lit([44, 47, 54]));
            along.addColorStop(1, this.lit([24, 26, 30]));
            strip(-1, -0.46, this.lit([17, 18, 21]));
            strip(-0.46, 0.5, along);
            const bevel = ctx.createLinearGradient(0, p.y0, 0, p.y1);
            bevel.addColorStop(0, this.lit([104, 114, 130], 0.45 + 0.75 * day));
            bevel.addColorStop(1, this.lit([64, 70, 82], 0.45 + 0.75 * day));
            strip(0.5, 1, bevel);
            // The rubber the glass sits in, and the light along the edges.
            edge(-1, 'rgba(0,0,0,0.85)', 2.4);
            edge(1, 'rgba(0,0,0,0.85)', 2.4);
            edge(0.5, 'rgba(0,0,0,0.55)', 1);
            edge(-0.46, 'rgba(0,0,0,0.6)', 1.2);
            edge(0.93, this.rim(1.2), 1.3);
            edge(-0.42, this.rim(0.35), 0.8);
            // Joints across it, each plate with its rivets.
            for (const t of [0.2, 0.47, 0.76]) {
                ctx.strokeStyle = 'rgba(0,0,0,0.7)';
                ctx.lineWidth = 1.4;
                ctx.beginPath();
                ctx.moveTo(...at(t, -0.46));
                ctx.lineTo(...at(t - 0.012, 0.5));
                ctx.stroke();
                ctx.strokeStyle = this.rim(0.3);
                ctx.lineWidth = 0.8;
                ctx.beginPath();
                ctx.moveTo(...at(t + 0.006, -0.46));
                ctx.lineTo(...at(t - 0.006, 0.5));
                ctx.stroke();
                for (const o of [-0.28, 0.32]) for (const dt of [-0.035, 0.03]) this.bolt(ctx, ...at(t + dt, o), u * 0.0032);
            }
            // A hose clipped along the shadowed face, and a ram bracing the strut off the sill.
            this.hose(ctx, [at(0.02, -0.74), at(0.3, -0.74), at(0.62, -0.72), at(0.66, -0.3)], Math.max(2, u * 0.006));
            for (const t of [0.12, 0.34, 0.56]) {
                ctx.fillStyle = this.lit([70, 75, 84]);
                const [bx, by] = at(t, -0.74);
                ctx.fillRect(bx - u * 0.005, by - 1.5, u * 0.01, 3);
            }
            const foot = p.x0 + p.side * u * 0.085;
            this.ram(ctx, foot, g.coam(foot) + ph * 0.02, ...at(0.3, -1.05), Math.max(3, u * 0.0085));
            // Its boot on the dash: a gusset, bolted down.
            ctx.beginPath();
            ctx.moveTo(...at(-0.02, -1.9));
            ctx.lineTo(...at(0.1, -1.08));
            ctx.lineTo(...at(0.14, 1.06));
            ctx.lineTo(...at(-0.02, 1.7));
            ctx.closePath();
            const boot = ctx.createLinearGradient(0, at(0.14, 0)[1], 0, p.y0);
            boot.addColorStop(0, this.lit([58, 63, 72]));
            boot.addColorStop(1, this.lit([26, 28, 33]));
            ctx.fillStyle = boot;
            ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,0.8)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.strokeStyle = this.rim(0.8);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(...at(0.1, -1.02));
            ctx.lineTo(...at(0.14, 1.0));
            ctx.stroke();
            for (const o of [-1.1, -0.35, 0.4, 1.05]) this.bolt(ctx, ...at(0.045, o), u * 0.0042, true);
        }
    }

    // The console: hood, brow, centre face, and the wings with their louvred walls.
    paintConsole(ctx, mode) {
        const g = this.g, P = this.PAD, { w, h, ph, top, cx, bottom } = g, day = this.day, night = 1 - day;
        const X = v => cx + v * ph, Y = v => top + v * ph, rnd = this.dice(5);
        const text = (t, x, y, size) => this.label(ctx, t, x, y, size);

        // The mass of it, under the dash line.
        ctx.beginPath();
        ctx.moveTo(-P, h + P);
        for (let i = 0; i <= 96; i++) { const x = -P + (w + 2 * P) * i / 96; ctx.lineTo(x, g.coam(x)); }
        ctx.lineTo(w + P, h + P);
        ctx.closePath();
        const face = ctx.createLinearGradient(0, top, 0, bottom);
        face.addColorStop(0, this.lit([38, 41, 47]));
        face.addColorStop(0.2, this.lit([27, 29, 34]));
        face.addColorStop(1, this.lit([15, 16, 19]));
        ctx.fillStyle = face;
        ctx.fill();
        // A fine grain, so it isn't a flat fill; and wear: scuffs where hands and boots go.
        ctx.save();
        ctx.clip();
        ctx.globalAlpha = 0.05;
        for (let i = 0; i < 1100; i++) {
            ctx.fillStyle = i % 2 ? '#fff' : '#000';
            ctx.fillRect(rnd() * w, top + rnd() * (h - top), 1 + rnd() * 2, 1);
        }
        ctx.globalAlpha = 1;
        ctx.strokeStyle = this.rim(0.16);
        ctx.lineWidth = 0.7;
        for (let i = 0; i < 26; i++) {
            const x = rnd() * w, y = Y(0.2 + 0.8 * rnd()), len = ph * (0.02 + 0.07 * rnd()), a = -0.5 + rnd();
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
            ctx.stroke();
        }
        ctx.restore();

        // The wings: a louvred wall under each sill, and the angled console below it.
        const edge = w / 2 / ph;
        if (edge > g.wing + 0.12) {
            for (const side of [-1, 1]) {
                const x0 = X(side * (g.wing + 0.035)), x1 = cx + side * (w / 2 + P);
                // The wall: a shadowed recess, and slats that each catch a line of day.
                this.band(ctx, x0, x1, 0.02, 0.135);
                ctx.fillStyle = '#04050699';
                ctx.fill();
                for (let i = 0; i < 5; i++) {
                    const v = 0.03 + i * 0.021;
                    this.band(ctx, x0, x1, v, v + 0.013);
                    ctx.fillStyle = this.lit([52, 56, 64], 0.55 + 0.6 * day);
                    ctx.fill();
                    this.band(ctx, x0, x1, v, v + 0.0035);
                    ctx.fillStyle = this.rim(0.75);
                    ctx.fill();
                }
                // Its frame, in panels.
                const span = Math.abs(x1 - x0);
                for (let d = ph * 0.02; d < span; d += ph * 0.62) {
                    const x = x0 + side * d;
                    ctx.fillStyle = this.lit([30, 32, 37]);
                    ctx.fillRect(x - ph * 0.017, g.coam(x) + ph * 0.02, ph * 0.034, ph * 0.118);
                    this.bolt(ctx, x, g.coam(x) + ph * 0.045, ph * 0.009);
                    this.bolt(ctx, x, g.coam(x) + ph * 0.112, ph * 0.009);
                }
                // The seam where the wing leaves the centre console, with a hose run down it.
                ctx.strokeStyle = 'rgba(0,0,0,0.7)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(X(side * g.wing), Y(0.08));
                ctx.lineTo(X(side * (g.wing + 0.05)), h + P);
                ctx.stroke();
                this.hose(ctx, [[X(side * (g.wing + 0.012)), Y(0.19)], [X(side * (g.wing + 0.02)), Y(0.5)], [X(side * (g.wing + 0.05)), Y(0.86)], [X(side * (g.wing + 0.2)), Y(1.12)]], Math.max(2.5, ph * 0.026));
            }
        }
        if (g.wide) for (const side of [-1, 1]) this.paintWing(ctx, side);
        // Whatever wing is left over (a wide screen's far ends, a narrower one's whole wing): a bolted plate with a vent in it.
        const spare = g.wide ? 2.37 : g.wing + 0.09, room = edge - 0.03 - spare;
        if (room > 0.3) {
            for (const side of [-1, 1]) {
                ctx.save();
                this.shear(ctx, side);
                const mid = X(side * (spare + room / 2)), vent = Math.min(room - 0.16, 0.7) * ph;
                this.plate(ctx, mid, Y(0.585), room * ph, ph * 0.72, 0.85);
                this.recess(ctx, mid, Y(0.5), vent, ph * 0.2, 2);
                for (let i = 0; i < 6; i++) {
                    ctx.fillStyle = this.lit([46, 50, 57], 0.55 + 0.6 * day);
                    ctx.fillRect(mid - vent / 2 + 2, Y(0.41 + i * 0.033), vent - 4, ph * 0.016);
                    ctx.fillStyle = this.rim(0.5);
                    ctx.fillRect(mid - vent / 2 + 2, Y(0.41 + i * 0.033), vent - 4, 1);
                }
                ctx.restore();
            }
        }

        // The hood: a hard lip along the whole dash, the day on its top edge, shade under it.
        const under = ctx.createLinearGradient(0, top, 0, Y(0.2));
        under.addColorStop(0, 'rgba(0,0,0,0.55)');
        under.addColorStop(1, 'rgba(0,0,0,0)');
        this.band(ctx, -P, w + P, 0.02, 0.1);
        ctx.fillStyle = under;
        if (g.coam(0) === top) ctx.fill();     // (a gradient can't follow the sills: only where the dash is flat)
        this.band(ctx, -P, w + P, -0.014, 0.03);
        ctx.fillStyle = this.lit([20, 21, 25]);
        ctx.fill();
        this.band(ctx, -P, w + P, -0.014, -0.004);
        ctx.fillStyle = this.rim(1.5);
        ctx.fill();
        this.band(ctx, -P, w + P, 0.024, 0.03);
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fill();

        // The centre console's joints.
        ctx.strokeStyle = 'rgba(0,0,0,0.65)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(X(-1.3), Y(0.2));
        ctx.lineTo(X(1.3), Y(0.2));
        for (const side of [-1, 1]) { ctx.moveTo(X(side * 1.25), Y(0.2)); ctx.lineTo(X(side * 1.3), h + P); }
        ctx.stroke();
        ctx.strokeStyle = this.rim(0.25);
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(X(-1.3), Y(0.2) + 1.2);
        ctx.lineTo(X(1.3), Y(0.2) + 1.2);
        ctx.stroke();

        const { radar, adi, scope, tape } = g;
        // The brow: the heading window, a warning lamp each side of it, and the rocker bays.
        this.recess(ctx, tape.x, tape.y, tape.w, tape.h, tape.h * 0.2);
        for (const lamp of g.warn) this.recess(ctx, lamp.x, lamp.y, lamp.w, lamp.h, 2);
        g.bays.forEach((bay, b) => {
            this.plate(ctx, bay.x, bay.y, bay.w + ph * 0.07, bay.h + ph * 0.035, 0.9);
            this.recess(ctx, bay.x, bay.y, bay.w, bay.h, 2);
            ICE_BAYS[b].forEach(([, name], i) => text(name, bay.x + (i - 1.5) * bay.w / 4, bay.y + bay.h / 2 + ph * 0.047, ph * 0.027));
        });

        // Centre: the scan screen in its housing, hooded, with a shelf of tell-tales under the glass.
        const a = radar.a;
        ctx.beginPath();
        ctx.moveTo(radar.x - a * 1.2, radar.y - a * 1.02);
        ctx.lineTo(radar.x - a * 1.0, radar.y - a * 1.21);
        ctx.lineTo(radar.x + a * 1.0, radar.y - a * 1.21);
        ctx.lineTo(radar.x + a * 1.2, radar.y - a * 1.02);
        ctx.closePath();
        const visor = ctx.createLinearGradient(0, radar.y - a * 1.21, 0, radar.y - a * 1.02);
        visor.addColorStop(0, this.lit([84, 92, 104], 0.6 + 0.6 * day));
        visor.addColorStop(0.25, this.lit([34, 36, 42]));
        visor.addColorStop(1, this.lit([14, 15, 18]));
        ctx.fillStyle = visor;
        ctx.fill();
        this.plate(ctx, radar.x, radar.y + a * 0.1, a * 2.36, a * 2.3, 1.1);
        this.cham(ctx, radar.x - a * 1.07, radar.y - a * 1.07, a * 2.14, a * 2.14, a * 0.16);
        const well = ctx.createLinearGradient(radar.x - a, radar.y - a, radar.x + a, radar.y + a);
        well.addColorStop(0, this.lit([10, 11, 13]));
        well.addColorStop(1, this.lit([88, 96, 108]));
        ctx.fillStyle = well;
        ctx.fill();
        this.cham(ctx, radar.x - a, radar.y - a, a * 2, a * 2, a * 0.1);
        ctx.fillStyle = '#020405';
        ctx.fill();
        this.knob(ctx, radar.x - a * 0.92, radar.y + a * 1.14, ph * 0.026, -0.6);
        this.knob(ctx, radar.x + a * 0.92, radar.y + a * 1.14, ph * 0.026, 0.9);
        text('RNG', radar.x - a * 0.6, radar.y + a * 1.14, ph * 0.026);
        text('GAIN', radar.x + a * 0.58, radar.y + a * 1.14, ph * 0.026);

        // The ladders either side of it.
        g.ladders.forEach((l, i) => {
            this.recess(ctx, l.x, l.y, l.w, l.h, 2);
            text(i ? 'THR' : 'CELL', l.x, l.y - l.h / 2 - ph * 0.032, ph * 0.027);
        });

        // Left: attitude, over four toggles.
        this.plate(ctx, adi.x, Y(0.61), adi.r * 2.62, ph * 0.75);
        this.ring(ctx, adi.x, adi.y, adi.r);
        ICE_TOGGLES.forEach(([, name], i) => text(name, g.toggles.x + (i - 1.5) * g.toggles.gap, g.toggles.y + ph * 0.06, ph * 0.028));
        // Right: the terrain scope, over three status lamps.
        this.plate(ctx, scope.x, Y(0.61), scope.w * 1.18, ph * 0.75);
        this.recess(ctx, scope.x, scope.y, scope.w, scope.h, ph * 0.02);
        text('TERRAIN FOLLOW', scope.x, scope.y + scope.h / 2 + ph * 0.05, ph * 0.03);
        for (let i = -1; i <= 1; i++) this.recess(ctx, g.status.x + i * g.status.gap, g.status.y, ph * 0.06, ph * 0.036, 1);

        // The instruments' own light on the metal about them, by night.
        if (night > 0.05) {
            ctx.globalCompositeOperation = 'lighter';
            const pool = (x, y, r, colour, k = 1) => {
                const fill = ctx.createRadialGradient(x, y, r * 0.25, x, y, r);
                fill.addColorStop(0, colour(0.15 * night * k));
                fill.addColorStop(1, colour(0));
                ctx.fillStyle = fill;
                ctx.fillRect(x - r, y - r, r * 2, r * 2);
            };
            const green = k => this.glow(k), red = k => this.ink('red', k), white = k => this.ink('white', k);
            pool(radar.x, radar.y, a * 2.7, green, 1.2);
            pool(adi.x, adi.y, adi.r * 2.3, k => `rgba(120,170,220,${k})`, 0.8);
            pool(scope.x, scope.y, scope.w * 1.2, green);
            pool(tape.x, tape.y, tape.w * 0.8, green, 0.8);
            for (const l of g.ladders) pool(l.x, l.y, l.h * 0.8, red, 0.9);
            for (const bay of g.bays) pool(bay.x, bay.y, bay.w * 0.75, white, 0.5);
            if (g.wide) {
                pool(g.lamps.x, g.lamps.y + ph * 0.08, g.lamps.w, green, 0.6);
                pool(g.time.x, g.time.y + ph * 0.08, g.time.w, green, 0.7);
                pool(g.bars.x, g.bars.y + ph * 0.1, g.bars.h, green, 0.7);
            }
            ctx.globalCompositeOperation = 'source-over';
            // And along the hood's underside, which leans over them.
            this.band(ctx, cx - ph * 1.25, cx + ph * 1.25, 0.03, 0.038);
            ctx.fillStyle = this.glow(0.2 * night);
            ctx.fill();
        }
        if (mode === 'panel') {
            // No canopy: the console stands by itself, so the dash casts a little shade up the view to seat it.
            const shade = ctx.createLinearGradient(0, top - ph * 0.12, 0, top);
            shade.addColorStop(0, 'rgba(0,0,0,0)');
            shade.addColorStop(1, 'rgba(0,0,0,0.3)');
            this.band(ctx, -P, w + P, -0.12, -0.012);
            ctx.fillStyle = shade;
            if (g.coam(0) === top) ctx.fill();
        }
    }

    // A wing's console: one plate, sheared like the sill above it.
    paintWing(ctx, side) {
        const g = this.g, { ph, top, cx } = g, X = v => cx + v * ph, Y = v => top + v * ph;
        const text = (t, x, y, size) => this.label(ctx, t, x, y, size);
        ctx.save();
        this.shear(ctx, side);
        this.plate(ctx, X(side * 1.865), Y(0.585), ph * 0.9, ph * 0.72);
        if (side < 0) {
            const { dial, lamps, load } = g;
            this.recess(ctx, lamps.x, lamps.y, lamps.w, lamps.h, 2);
            this.ring(ctx, dial.x, dial.y, dial.r);
            this.ring(ctx, load.x, load.y, load.r);
            text('LOAD', load.x, load.y + load.r + ph * 0.04, ph * 0.027);
        } else {
            const { bars, time, blinks } = g;
            this.recess(ctx, time.x, time.y, time.w, time.h, 2);
            this.recess(ctx, bars.x, bars.y, bars.w, bars.h, 3);
            for (let i = 0; i < 6; i++) this.recess(ctx, blinks.x + (i % 2 - 0.5) * blinks.gap, blinks.y + (Math.floor(i / 2) - 1) * blinks.gap * 0.62, ph * 0.05, ph * 0.03, 1);
        }
        const ladder = g.sideLadders[side < 0 ? 0 : 1];
        this.recess(ctx, ladder.x, ladder.y, ladder.w, ladder.h, 1.5);
        ctx.restore();
    }

    shear(ctx, side) {
        const g = this.g, k = side * g.shear;
        ctx.transform(1, k, 0, 1, 0, -k * (g.cx + side * g.wing * g.ph));
    }

    // The yoke's two grips, rising from under the console either side of the scan screen.
    paintGrips() {
        const g = this.g, ctx = this.grips.getContext('2d'), { ph } = g, day = this.day;
        ctx.setTransform(g.ratio, 0, 0, g.ratio, 0, 0);
        ctx.clearRect(0, 0, g.grip.w, g.grip.h);
        const baseY = g.bottom + ph * 0.06 - g.grip.y;
        for (const side of [-1, 1]) {
            ctx.save();
            ctx.translate(g.grip.w / 2 + side * ph * 0.455, baseY);
            ctx.rotate(-side * 0.1);
            ctx.scale(side * ph * 1.3, ph * 1.3);       // drawn once, for the right hand, in shares of ph; mirrored for the left
            const fill = (points, style) => {
                ctx.beginPath();
                points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
                ctx.closePath();
                ctx.fillStyle = style;
                ctx.fill();
            };
            // The column and its gaiter.
            fill([[-0.022, 0.4], [-0.022, -0.02], [0.022, -0.02], [0.022, 0.4]], this.lit([40, 43, 49]));
            for (let i = 0; i < 5; i++) {
                const y = 0.02 + i * 0.03, half = 0.04 + i * 0.006;
                fill([[-half, y + 0.03], [-half * 0.9, y], [half * 0.9, y], [half, y + 0.03]], this.lit([20, 21, 24]));
                fill([[-half * 0.9, y], [half * 0.9, y], [half * 0.9, y + 0.006], [-half * 0.9, y + 0.006]], this.rim(0.5));
            }
            // The handle: a slab with a guard on the outside, grooves for the fingers, a cap with a thumb button.
            const body = ctx.createLinearGradient(-0.05, 0, 0.055, 0);
            body.addColorStop(0, this.lit([22, 23, 27]));
            body.addColorStop(0.45, this.lit([50, 54, 61]));
            body.addColorStop(1, this.lit([24, 26, 30]));
            fill([[-0.034, -0.02], [-0.046, -0.19], [-0.04, -0.215], [0.04, -0.215], [0.05, -0.19], [0.036, -0.02]], body);
            ctx.lineWidth = 0.004;
            ctx.strokeStyle = 'rgba(0,0,0,0.7)';
            for (let i = 0; i < 4; i++) {
                ctx.beginPath();
                ctx.moveTo(-0.043, -0.05 - i * 0.036);
                ctx.lineTo(-0.008, -0.056 - i * 0.036);
                ctx.stroke();
            }
            fill([[0.036, -0.02], [0.05, -0.19], [0.066, -0.18], [0.07, -0.06], [0.05, -0.02]], this.lit([30, 32, 37]));
            fill([[-0.052, -0.215], [-0.046, -0.262], [0.03, -0.272], [0.056, -0.245], [0.054, -0.215]], this.lit([62, 67, 76]));
            fill([[-0.046, -0.262], [0.03, -0.272], [0.03, -0.266], [-0.046, -0.256]], this.rim(1.3));
            fill([[0.05, -0.19], [0.066, -0.18], [0.066, -0.174], [0.05, -0.184]], this.rim(0.6));
            ctx.fillStyle = `rgb(${Math.round(120 + 110 * day)},${Math.round(26 + 20 * day)},${Math.round(20 + 14 * day)})`;
            ctx.beginPath();
            ctx.arc(-0.014, -0.268, 0.014, Math.PI, 0);
            ctx.fill();
            ctx.fillStyle = this.lit([150, 158, 170]);
            ctx.fillRect(0.012, -0.238, 0.022, 0.012);
            ctx.restore();
        }
    }

    // ---- The gauges ----------------------------------------------------------------------
    // One instrument's patch of the strip: cleared and drawn only when `sig`
    // (what it is about to show) differs from what is there.
    region(ctx, name, sig, x, y, w, h, draw, side = 0) {
        if (this.sigs[name] === sig) return;
        this.sigs[name] = sig;
        ctx.save();
        if (side) this.shear(ctx, side);
        ctx.clearRect(x, y, w, h);
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        draw();
        ctx.restore();
    }

    // A lamp's halo: one soft sprite a colour, drawn over it.
    spark(ctx, name, x, y, r, a) {
        let sprite = this.sprites[name];
        if (!sprite) {
            sprite = this.sprites[name] = document.createElement('canvas');
            sprite.width = sprite.height = 48;
            const sctx = sprite.getContext('2d'), fill = sctx.createRadialGradient(24, 24, 2, 24, 24, 24), c = ICE_LAMPS[name].join(',');
            fill.addColorStop(0, `rgba(${c},0.75)`);
            fill.addColorStop(0.4, `rgba(${c},0.22)`);
            fill.addColorStop(1, `rgba(${c},0)`);
            sctx.fillStyle = fill;
            sctx.fillRect(0, 0, 48, 48);
        }
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a;
        ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
    }
    lamp(ctx, x, y, w, h, name, on, halo = Math.max(w, h) * 1.5) {
        ctx.fillStyle = on ? this.ink(name) : this.ink(name, 1, 0.16);
        ctx.fillRect(x - w / 2, y - h / 2, w, h);
        if (!on) return;
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillRect(x - w / 2 + 0.5, y - h / 2 + 0.5, w - 1, h * 0.36);
        this.spark(ctx, name, x, y, halo, 0.3 + 0.5 * (1 - this.day));
    }
    // A column of LEDs, lit from the bottom: white, the top three red.
    ladder(ctx, l, lit, n = 12) {
        const gap = l.h / n;
        for (let i = 0; i < n; i++) this.lamp(ctx, l.x, l.y + l.h / 2 - (i + 0.5) * gap, l.w * 0.72, gap * 0.62, i >= n - 3 ? 'red' : 'white', i < lit);
    }
    toggle(ctx, x, y, up) {
        const ph = this.g.ph;
        ctx.fillStyle = this.lit([12, 13, 15]);
        ctx.beginPath();
        ctx.arc(x, y, ph * 0.021, 0, 6.2832);
        ctx.fill();
        ctx.strokeStyle = this.lit([100, 106, 116]);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.strokeStyle = this.lit([206, 210, 216]);
        ctx.lineCap = 'round';
        ctx.lineWidth = ph * 0.017;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + (up ? -1 : 1) * ph * 0.04);
        ctx.stroke();
        ctx.lineCap = 'butt';
    }
    // A highlight across an instrument's glass.
    glass(ctx, x, y, r, round = true) {
        const shine = ctx.createLinearGradient(x - r, y - r, x + r * 0.4, y + r * 0.6);
        shine.addColorStop(0, `rgba(255,255,255,${0.05 + 0.12 * this.day})`);
        shine.addColorStop(0.45, 'rgba(255,255,255,0)');
        ctx.fillStyle = shine;
        ctx.beginPath();
        if (round) ctx.arc(x, y, r * 0.98, 0, 6.2832);
        else ctx.rect(x - r, y - r, r * 2, r * 2);
        ctx.fill();
    }

    paintGauges(s) {
        const g = this.g, ctx = this.gauges.getContext('2d'), f = s.flight, { ph } = g;
        ctx.setTransform(g.ratio, 0, 0, g.ratio, 0, -g.gy * g.ratio);
        if (!Object.keys(this.sigs).length) ctx.clearRect(0, g.gy, g.w, g.h - g.gy);     // the frame was repainted: start clean
        ctx.lineJoin = 'round';
        const font = size => this.font(Math.max(5, size));
        const heading = ((f.heading * 180 / Math.PI) % 360 + 360) % 360;
        const dim = 0.4 + 0.6 * s.light.day;                // painted faces need light; phosphor makes its own
        const life = IceLogic.greebles(s.seconds, this.seed, s, this.life), bits = array => array.join('');

        const { radar, tape, adi, scope } = g;
        this.region(ctx, 'scan', s.seconds, radar.x - radar.a, radar.y - radar.a, radar.a * 2, radar.a * 2, () => this.paintScan(ctx, s, heading, font));
        this.region(ctx, 'tape', Math.round(heading * tape.w / 70 * 2), tape.x - tape.w / 2, tape.y - tape.h / 2, tape.w, tape.h, () => this.paintTape(ctx, heading, font));
        const roll = f.roll * s.config.bank * s.sway;
        this.region(ctx, 'adi', Math.round(roll * 250) + '|' + Math.round(f.pitch * adi.r / 0.42 * 2), adi.x - adi.r, adi.y - adi.r, adi.r * 2, adi.r * 2, () => this.paintAttitude(ctx, roll, f.pitch, dim, font));
        this.region(ctx, 'scope', s.seconds, scope.x - scope.w / 2, scope.y - scope.h / 2, scope.w, scope.h, () => this.paintScope(ctx, s, font));

        // The ladders: the cells' heat creeping on the left, the throttle on the right.
        const thrust = IceLogic.clamp((s.pilot.throttle - IceLogic.PILOT.slow) / (IceLogic.PILOT.fast - IceLogic.PILOT.slow), 0, 1);
        [Math.round(life.creep[0] * 11), Math.max(1, Math.round(1 + thrust * 11))].forEach((lit, i) => {
            const l = g.ladders[i];
            this.region(ctx, 'ladder' + i, lit, l.x - l.w, l.y - l.h / 2 - 3, l.w * 2, l.h + 6, () => this.ladder(ctx, l, lit));
        });
        // The rocker bays: each rocker lies the way its switch is thrown, and its window lights.
        g.bays.forEach((bay, b) => {
            const sig = ICE_BAYS[b].map(([i]) => life.switches[i]).join('');
            this.region(ctx, 'bay' + b, sig, bay.x - bay.w / 2 - ph * 0.03, bay.y - bay.h / 2 - ph * 0.03, bay.w + ph * 0.06, bay.h + ph * 0.06, () => {
                ICE_BAYS[b].forEach(([i, , colour], n) => this.rocker(ctx, bay.x + (n - 1.5) * bay.w / 4, bay.y, bay.w / 4 * 0.8, bay.h * 0.84, colour, life.switches[i]));
            });
        });
        // The warning lamps: rough air or a steep bank on the left; a hand on the stick on the right.
        [[life.warn && life.blink, 'red', 'WARN'], [s.manual, 'amber', 'MAN']].forEach(([on, colour, name], i) => {
            const l = g.warn[i];
            this.region(ctx, 'warn' + i, on, l.x - l.w, l.y - l.h * 1.2, l.w * 2, l.h * 2.4, () => {
                this.lamp(ctx, l.x, l.y, l.w, l.h, colour, on, l.h * 1.2);
                this.label(ctx, name, l.x, l.y + 0.5, l.h * 0.42, on ? '#1a0d08' : this.ink(colour, 0.5, 0.6));
            });
        });
        const t = g.toggles;
        this.region(ctx, 'toggles', ICE_TOGGLES.map(([i]) => i < 0 ? 1 : life.switches[i]).join(''), t.x - t.gap * 2, t.y - ph * 0.05, t.gap * 4, ph * 0.094, () => {
            ICE_TOGGLES.forEach(([i], n) => this.toggle(ctx, t.x + (n - 1.5) * t.gap, t.y, i < 0 || life.switches[i]));
        });
        const st = g.status;
        this.region(ctx, 'status', bits(life.lamps.subarray(0, 3)), st.x - st.gap * 1.6, st.y - ph * 0.05, st.gap * 3.2, ph * 0.1, () => {
            for (let i = 0; i < 3; i++) this.lamp(ctx, st.x + (i - 1) * st.gap, st.y, ph * 0.06, ph * 0.036, i === 1 ? 'white' : 'blue', life.lamps[i], ph * 0.05);
        });
        // The shelf under the scan screen: three tell-tales.
        const shelf = radar.y + radar.a * 1.14;
        this.region(ctx, 'shelf', bits(life.lamps.subarray(9, 12)), radar.x - radar.a * 0.36, shelf - ph * 0.03, radar.a * 0.72, ph * 0.06, () => {
            for (let i = 0; i < 3; i++) this.lamp(ctx, radar.x + (i - 1) * radar.a * 0.2, shelf, ph * 0.032, ph * 0.02, i === 1 ? 'white' : 'red', life.lamps[9 + i], ph * 0.03);
        });
        if (g.wide) this.paintWings(ctx, s, life, font, dim);
    }

    // A fat rocker: the pressed half sits in shade, the proud half catches the light, and its window is lit while it is on.
    rocker(ctx, x, y, w, h, colour, on) {
        const x0 = x - w / 2, y0 = y - h / 2, half = h / 2;
        ctx.fillStyle = this.lit([54, 58, 66]);
        ctx.fillRect(x0, y0, w, h);
        ctx.fillStyle = this.lit(on ? [26, 28, 32] : [84, 90, 100]);
        ctx.fillRect(x0, y0, w, half);
        ctx.fillStyle = this.lit(on ? [84, 90, 100] : [26, 28, 32]);
        ctx.fillRect(x0, y0 + half, w, half);
        ctx.fillStyle = this.rim(0.9);
        ctx.fillRect(x0, on ? y0 + half : y0, w, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(x0, on ? y0 + half - 1 : y0 + h - 1, w, 1);
        this.lamp(ctx, x, y0 + half * 0.5, w * 0.6, half * 0.42, colour, on);
    }

    // The heading tape: the compass sliding under a fixed lubber line.
    paintTape(ctx, heading, font) {
        const tape = this.g.tape;
        ctx.font = font(tape.h * 0.52);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = ctx.strokeStyle = this.glow(0.95);
        ctx.lineWidth = 1;
        const perDeg = tape.w / 70;
        for (let d = Math.floor((heading - 40) / 5) * 5; d <= heading + 40; d += 5) {
            const x = tape.x + (d - heading) * perDeg, deg = ((d % 360) + 360) % 360;
            ctx.beginPath();
            ctx.moveTo(x, tape.y + tape.h / 2);
            ctx.lineTo(x, tape.y + tape.h / 2 - (deg % 10 ? 0.18 : 0.3) * tape.h);
            ctx.stroke();
            if (deg % 30 === 0) ctx.fillText(deg % 90 === 0 ? 'NESW'[deg / 90] : String(deg / 10).padStart(2, '0'), x, tape.y - tape.h * 0.1);
        }
        ctx.fillStyle = '#ffb347';
        ctx.beginPath();
        ctx.moveTo(tape.x, tape.y - tape.h * 0.2);
        ctx.lineTo(tape.x - tape.h * 0.2, tape.y - tape.h / 2);
        ctx.lineTo(tape.x + tape.h * 0.2, tape.y - tape.h / 2);
        ctx.fill();
    }

    // Attitude: a ball that stays level with the world while the craft rolls round it.
    paintAttitude(ctx, roll, pitch, dim, font) {
        const adi = this.g.adi, ay = adi.y, perRad = adi.r / 0.42;
        ctx.save();
        ctx.beginPath();
        ctx.arc(adi.x, ay, adi.r * 0.97, 0, 6.2832);
        ctx.clip();
        ctx.translate(adi.x, ay);
        ctx.rotate(-roll);
        ctx.translate(0, pitch * perRad);
        const k = v => Math.round(v * dim);
        ctx.fillStyle = `rgb(${k(46)},${k(104)},${k(150)})`;
        ctx.fillRect(-adi.r * 2, -adi.r * 3, adi.r * 4, adi.r * 3);
        ctx.fillStyle = `rgb(${k(94)},${k(70)},${k(48)})`;
        ctx.fillRect(-adi.r * 2, 0, adi.r * 4, adi.r * 3);
        ctx.strokeStyle = ctx.fillStyle = `rgba(245,248,250,${0.55 + 0.45 * dim})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(-adi.r * 2, 0);
        ctx.lineTo(adi.r * 2, 0);
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.font = font(adi.r * 0.13);
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        for (let deg = -40; deg <= 40; deg += 5) {
            if (!deg) continue;
            const y = -deg * Math.PI / 180 * perRad, half = adi.r * (deg % 10 ? 0.12 : 0.26);
            ctx.beginPath();
            ctx.moveTo(-half, y);
            ctx.lineTo(half, y);
            ctx.stroke();
            if (deg % 10 === 0) ctx.fillText(String(Math.abs(deg)), half + 3, y);
        }
        ctx.restore();
        ctx.save();
        ctx.beginPath();
        ctx.arc(adi.x, ay, adi.r * 0.97, 0, 6.2832);
        ctx.clip();
        // The bank scale above it, and the pointer that rides it.
        ctx.strokeStyle = `rgba(240,244,248,${0.5 + 0.5 * dim})`;
        ctx.lineWidth = 1.2;
        for (const deg of [-45, -30, -20, -10, 0, 10, 20, 30, 45]) {
            const a = deg * Math.PI / 180 - Math.PI / 2, len = deg % 30 === 0 ? 0.12 : 0.07;
            ctx.beginPath();
            ctx.moveTo(adi.x + Math.cos(a) * adi.r * 0.95, ay + Math.sin(a) * adi.r * 0.95);
            ctx.lineTo(adi.x + Math.cos(a) * adi.r * (0.95 - len), ay + Math.sin(a) * adi.r * (0.95 - len));
            ctx.stroke();
        }
        ctx.save();
        ctx.translate(adi.x, ay);
        ctx.rotate(-roll);
        ctx.fillStyle = '#ffb347';
        ctx.beginPath();
        ctx.moveTo(0, -adi.r * 0.8);
        ctx.lineTo(-adi.r * 0.07, -adi.r * 0.66);
        ctx.lineTo(adi.r * 0.07, -adi.r * 0.66);
        ctx.fill();
        ctx.restore();
        // The craft itself: fixed wings and a dot.
        ctx.strokeStyle = '#ffb347';
        ctx.lineWidth = Math.max(2, adi.r * 0.05);
        ctx.beginPath();
        ctx.moveTo(adi.x - adi.r * 0.62, ay);
        ctx.lineTo(adi.x - adi.r * 0.22, ay);
        ctx.lineTo(adi.x - adi.r * 0.22, ay + adi.r * 0.09);
        ctx.moveTo(adi.x + adi.r * 0.62, ay);
        ctx.lineTo(adi.x + adi.r * 0.22, ay);
        ctx.lineTo(adi.x + adi.r * 0.22, ay + adi.r * 0.09);
        ctx.stroke();
        ctx.fillStyle = '#ffb347';
        ctx.fillRect(adi.x - 2, ay - 2, 4, 4);
        this.glass(ctx, adi.x, ay, adi.r);
        ctx.restore();
    }

    // ---- The terrain scan ------------------------------------------------------------------
    // Paint cells [i0, i1) × [j0, j1) of the map: a pixel each, runs of one ink as one rectangle.
    scanCells(s, i0, i1, j0, j1) {
        const sc = this.scan, ctx = this.radar.getContext('2d'), ground = this.terrain.height, out = this.cell, y = s.flight.y;
        if (!this.inks) {
            // Twelve brightnesses of the phosphor; and two warning inks for ground that stands above us.
            const warm = this.phosphor === ICE_GLOWS.amber ? [255, 96, 60] : [255, 170, 60], hot = [255, 70, 50];
            this.inks = [this.phosphor, warm, hot].map(c => Array.from({ length: 12 }, (_, i) => `rgb(${c.map(v => Math.round(v * (0.06 + 0.94 * i / 11))).join(',')})`));
        }
        for (let j = j0; j < j1; j++) {
            let from = i0, last = '';
            for (let i = i0; i <= i1; i++) {
                let ink = '';
                if (i < i1) {
                    IceLogic.scanCell(ground, (sc.i + i) * sc.cell, (sc.j + j) * sc.cell, sc.cell, sc.interval, out);
                    const rise = out[0] - y, tone = 0.1 + 0.12 * (Math.floor(out[0] / sc.interval) & 1) + 0.5 * (out[1] - 0.42) + 0.2 * IceLogic.clamp((out[0] + 150) / 900, 0, 1) + 0.27 * out[2];
                    ink = this.inks[rise > 220 ? 2 : rise > 30 ? 1 : 0][Math.round(IceLogic.clamp(tone, 0, 1) * 11)];
                }
                if (ink !== last) {
                    if (last) { ctx.fillStyle = last; ctx.fillRect(from, j, i - from, 1); }
                    from = i;
                    last = ink;
                }
            }
        }
    }

    // Keep the map under the craft: scroll it by whole cells, scan what came
    // into view, and go over a few rows again (our own height moves the
    // warning ink). A new range, a new glow or a jump scans it all.
    scanStep(s) {
        const f = s.flight, map = this.radar, low = this.host.quality.tier === 'low', n = low ? 80 : 144;
        const cell = s.config.radarRange * 2.7 / n, i = Math.floor(f.x / cell) - n / 2, j = Math.floor(f.z / cell) - n / 2;
        let sc = this.scan;
        if (!sc || sc.cell !== cell || sc.glow !== s.config.glow || map.width !== n || Math.abs(i - sc.i) >= n || Math.abs(j - sc.j) >= n) {
            map.width = map.height = n;
            this.inks = null;
            sc = this.scan = { cell, i, j, row: 0, glow: s.config.glow, interval: s.config.radarRange / 50 };
            this.scanCells(s, 0, n, 0, n);
            return;
        }
        const di = i - sc.i, dj = j - sc.j;
        if (di || dj) {
            const ctx = map.getContext('2d');
            ctx.globalCompositeOperation = 'copy';
            ctx.drawImage(map, -di, -dj);
            ctx.globalCompositeOperation = 'source-over';
            sc.i = i;
            sc.j = j;
            if (di) this.scanCells(s, di > 0 ? n - di : 0, di > 0 ? n : -di, 0, n);
            if (dj) this.scanCells(s, 0, n, dj > 0 ? n - dj : 0, dj > 0 ? n : -dj);
        }
        for (let k = low ? 2 : 4; k > 0; k--) {
            this.scanCells(s, 0, n, sc.row, sc.row + 1);
            sc.row = (sc.row + 1) % n;
        }
    }

    // The scan screen: the map turned nose-up and slid under the craft, which sits a little below the middle.
    paintScan(ctx, s, heading, font) {
        this.scanStep(s);
        const g = this.g, f = s.flight, sc = this.scan, { x, y, a } = g.radar, range = s.config.radarRange, n = this.radar.width;
        const px = x, py = y + a * 0.3, perM = a * 1.25 / range;
        ctx.save();
        ctx.fillStyle = '#010302';
        ctx.fillRect(x - a, y - a, a * 2, a * 2);
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(-f.heading);
        ctx.scale(perM, -perM);
        ctx.globalAlpha = 0.9;
        ctx.drawImage(this.radar, sc.i * sc.cell - f.x, sc.j * sc.cell - f.z, n * sc.cell, n * sc.cell);
        ctx.restore();
        // Range rings every quarter, the nose line, and beam ticks.
        ctx.strokeStyle = this.glow(0.5);
        ctx.lineWidth = 1;
        for (let i = 1; i <= 5; i++) {
            ctx.beginPath();
            ctx.arc(px, py, a * 1.25 * i / 4, 0, 6.2832);
            ctx.stroke();
        }
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(px, py - a * 0.12);
        ctx.lineTo(px, y - a);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        for (const side of [-1, 1]) for (let i = 1; i <= 3; i++) { ctx.moveTo(px + side * a * 1.25 * i / 4, py - 3); ctx.lineTo(px + side * a * 1.25 * i / 4, py + 3); }
        ctx.stroke();
        // North, riding the rim.
        const north = -f.heading, nx = Math.sin(north), ny = -Math.cos(north), reach = Math.min(a * 0.9 / Math.max(Math.abs(nx), 1e-6), (ny < 0 ? a * 1.2 : a * 0.6) / Math.max(Math.abs(ny), 1e-6));
        ctx.font = font(a * 0.14);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = this.glow(0.95, 1.1);
        ctx.fillText('N', px + nx * reach, py + ny * reach);
        // Contacts: wingmen as carets, in the screen's colour; beacons (diamonds) and stations (squares) in red.
        ctx.lineWidth = 1.4;
        ctx.textAlign = 'left';
        let nearest = null;
        const blink = s.calm || s.seconds % 1.2 < 0.85;
        for (const c of s.contacts) {
            const d = Math.hypot(c.x, c.z), bearing = Math.atan2(c.x, c.z) - f.heading;
            const bx = px + Math.sin(bearing) * d * perM, by = py - Math.cos(bearing) * d * perM, k = Math.max(2.5, a * 0.045);
            if (Math.abs(bx - x) > a - k || Math.abs(by - y) > a - k) continue;
            ctx.beginPath();
            if (c.kind === 'friend') {
                ctx.strokeStyle = this.glow(1, 1.15);
                ctx.moveTo(bx - k, by + k);
                ctx.lineTo(bx, by - k);
                ctx.lineTo(bx + k, by + k);
                ctx.stroke();
                continue;
            }
            ctx.fillStyle = ctx.strokeStyle = this.ink('red', blink || c.kind === 'station' ? 1 : 0.45);
            if (c.kind === 'beacon') { ctx.moveTo(bx, by - k); ctx.lineTo(bx + k, by); ctx.lineTo(bx, by + k); ctx.lineTo(bx - k, by); ctx.closePath(); ctx.fill(); }
            else { ctx.rect(bx - k, by - k, k * 2, k * 2); ctx.stroke(); ctx.fillRect(bx - 1, by - 1, 2, 2); }
            if (!nearest || d < nearest.d) nearest = { d, bx, by, kind: c.kind };
        }
        if (nearest) {
            ctx.fillStyle = this.ink('red');
            ctx.textAlign = nearest.bx > x + a * 0.3 ? 'right' : 'left';
            ctx.fillText(`${nearest.kind === 'station' ? 'STN' : 'BCN'} ${(nearest.d / 1000).toFixed(1)}`, nearest.bx + (ctx.textAlign === 'right' ? -1 : 1) * a * 0.1, nearest.by);
        }
        // Own ship, white; the fixed nose mark; and the numbers in the corners.
        ctx.fillStyle = '#f2f6fa';
        ctx.beginPath();
        ctx.moveTo(px, py - a * 0.1);
        ctx.lineTo(px - a * 0.065, py + a * 0.055);
        ctx.lineTo(px, py + a * 0.02);
        ctx.lineTo(px + a * 0.065, py + a * 0.055);
        ctx.fill();
        ctx.fillStyle = '#ffb347';
        ctx.beginPath();
        ctx.moveTo(x, y - a * 0.86);
        ctx.lineTo(x - a * 0.07, y - a);
        ctx.lineTo(x + a * 0.07, y - a);
        ctx.fill();
        const corner = (label, sx, sy) => {
            const tw = ctx.measureText(label).width + a * 0.1, th = a * 0.2;
            ctx.fillStyle = 'rgba(0,6,3,0.72)';
            ctx.fillRect(sx < 0 ? x - a : x + a - tw, sy < 0 ? y - a : y + a - th, tw, th);
            ctx.fillStyle = this.glow(1, 1.1);
            ctx.textAlign = sx < 0 ? 'left' : 'right';
            ctx.fillText(label, x + sx * a * 0.95, y + sy * (a - th / 2) + 0.5);
        };
        ctx.textBaseline = 'middle';
        corner(`${range / 1000}KM`, -1, -1);
        corner(`H${String(Math.round(heading) % 360).padStart(3, '0')}`, 1, -1);
        corner('SCAN', -1, 1);
        corner(`${Math.round(s.speed * 3.6)}`, 1, 1);
        // The tube: darker into its corners, a shine across the glass.
        const tube = ctx.createRadialGradient(x, y, a * 0.6, x, y, a * 1.45);
        tube.addColorStop(0, 'rgba(0,0,0,0)');
        tube.addColorStop(1, 'rgba(0,0,0,0.75)');
        ctx.fillStyle = tube;
        ctx.fillRect(x - a, y - a, a * 2, a * 2);
        this.glass(ctx, x, y, a, false);
        ctx.restore();
    }

    // The terrain-following scope: the ground about to be crossed, side on.
    paintScope(ctx, s, font) {
        const g = this.g, f = s.flight, sc = g.scope, x0 = sc.x - sc.w / 2, y0 = sc.y - sc.h / 2, ground = this.terrain.height;
        const look = 1600, n = 36, sin = Math.sin(f.heading), cos = Math.cos(f.heading);
        ctx.fillStyle = this.glow(1, 0.045);
        ctx.fillRect(x0, y0, sc.w, sc.h);
        // The scale opens up when there is a wall ahead.
        let span = Math.max(90, s.config.clearance * 3.2);
        const heights = [];
        for (let i = 0; i <= n; i++) {
            const d = look * i / n, hh = ground(f.x + sin * d, f.z + cos * d) - f.y;
            heights.push(hh);
            span = Math.max(span, Math.abs(hh) * 1.25);
        }
        this.scopeSpan = (this.scopeSpan || span) + (span - (this.scopeSpan || span)) * 0.2;
        const left = x0 + sc.w * 0.12, wide = sc.w * 0.84, mid = y0 + sc.h * 0.42, perM = sc.h * 0.5 / this.scopeSpan;
        ctx.strokeStyle = this.glow(0.22);
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 1; i < 4; i++) { ctx.moveTo(left + wide * i / 4, y0); ctx.lineTo(left + wide * i / 4, y0 + sc.h); }
        ctx.moveTo(x0, mid);
        ctx.lineTo(x0 + sc.w, mid);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(left, y0 + sc.h);
        heights.forEach((hh, i) => ctx.lineTo(left + wide * i / n, mid - hh * perM));
        ctx.lineTo(left + wide, y0 + sc.h);
        ctx.fillStyle = this.glow(0.16);
        ctx.fill();
        ctx.beginPath();
        heights.forEach((hh, i) => ctx.lineTo(left + wide * i / n, mid - hh * perM));
        ctx.strokeStyle = this.glow(0.95);
        ctx.lineWidth = 1.6;
        ctx.stroke();
        // Where the craft is going: a dashed line along its climb.
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = this.glow(0.6);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(left, mid);
        ctx.lineTo(left + wide * 0.5, mid - f.climb / s.speed * look * 0.5 * perM);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = this.glow(1);
        ctx.beginPath();
        ctx.moveTo(left + 5, mid);
        ctx.lineTo(left - 5, mid - 4);
        ctx.lineTo(left - 5, mid + 4);
        ctx.fill();
        ctx.font = font(sc.h * 0.115);
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.fillText(`RALT ${String(Math.round(f.agl)).padStart(3, '0')}`, x0 + sc.w * 0.05, y0 + sc.h * 0.05);
        ctx.textAlign = 'right';
        if (f.pull > 0.55 && s.seconds % 0.5 < 0.3) {
            ctx.fillStyle = '#ff5a48';
            ctx.fillText('PULL UP', x0 + sc.w * 0.95, y0 + sc.h * 0.05);
        } else ctx.fillText(s.manual ? 'TF MAN' : 'TF AUTO', x0 + sc.w * 0.95, y0 + sc.h * 0.05);
    }

    // The wings, on wide screens. Left: caution lamps, airspeed, the engine's
    // load, a ladder. Right: the hour and the cold, height and climb, six
    // status lamps, a ladder. Three toggles each.
    paintWings(ctx, s, life, font, dim) {
        const g = this.g, f = s.flight, { ph, dial, lamps, load, bars, time, blinks } = g, kph = s.speed * 3.6;
        const white = `rgba(240,244,248,${0.45 + 0.55 * dim})`;
        const needle = (d, angle, len) => {
            ctx.strokeStyle = '#ffb347';
            ctx.lineWidth = Math.max(1.5, d.r * 0.07);
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(d.x - Math.cos(angle) * d.r * 0.15, d.y - Math.sin(angle) * d.r * 0.15);
            ctx.lineTo(d.x + Math.cos(angle) * d.r * len, d.y + Math.sin(angle) * d.r * len);
            ctx.stroke();
            ctx.lineCap = 'butt';
            ctx.fillStyle = white;
            ctx.beginPath();
            ctx.arc(d.x, d.y, d.r * 0.09, 0, 6.2832);
            ctx.fill();
        };
        // Airspeed: 0 to 800 km/h round 270°.
        const at = v => (-225 + 270 * IceLogic.clamp(v / 800, 0, 1)) * Math.PI / 180;
        const speed = at(kph + (s.calm ? 0 : 4 * Math.sin(s.seconds * 1.3) + 14 * s.level * Math.sin(s.seconds * 4.1)));
        this.region(ctx, 'dial', Math.round(speed * 200) + '|' + Math.round(kph), dial.x - dial.r, dial.y - dial.r, dial.r * 2, dial.r * 2, () => {
            ctx.strokeStyle = ctx.fillStyle = white;
            ctx.lineWidth = 1;
            ctx.font = font(dial.r * 0.2);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            for (let v = 0; v <= 800; v += 50) {
                const a = at(v), inner = v % 100 ? 0.84 : 0.76;
                ctx.beginPath();
                ctx.moveTo(dial.x + Math.cos(a) * dial.r * 0.93, dial.y + Math.sin(a) * dial.r * 0.93);
                ctx.lineTo(dial.x + Math.cos(a) * dial.r * inner, dial.y + Math.sin(a) * dial.r * inner);
                ctx.stroke();
                if (v % 200 === 0) ctx.fillText(String(v / 100), dial.x + Math.cos(a) * dial.r * 0.58, dial.y + Math.sin(a) * dial.r * 0.58);
            }
            ctx.font = font(dial.r * 0.15);
            ctx.fillText('KM/H', dial.x, dial.y - dial.r * 0.34);
            needle(dial, speed, 0.82);
            ctx.font = font(dial.r * 0.2);
            ctx.fillStyle = this.glow(0.95);
            ctx.fillText(String(Math.round(kph)), dial.x, dial.y + dial.r * 0.52);
            this.glass(ctx, dial.x, dial.y, dial.r);
        }, -1);
        // The engine's load: a green arc, an amber one, a red one, and a needle that is never quite still.
        const pull = (-210 + 240 * life.load) * Math.PI / 180;
        this.region(ctx, 'load', Math.round(pull * 120), load.x - load.r, load.y - load.r, load.r * 2, load.r * 2, () => {
            ctx.lineWidth = Math.max(1.5, load.r * 0.12);
            [['green', 0, 0.6], ['amber', 0.6, 0.82], ['red', 0.82, 1]].forEach(([colour, from, to]) => {
                ctx.strokeStyle = this.ink(colour, 0.45 + 0.5 * dim);
                ctx.beginPath();
                ctx.arc(load.x, load.y, load.r * 0.82, (-210 + 240 * from) * Math.PI / 180, (-210 + 240 * to) * Math.PI / 180);
                ctx.stroke();
            });
            needle(load, pull, 0.74);
            this.glass(ctx, load.x, load.y, load.r);
        }, -1);
        // Caution lamps, two rows of three.
        const blink = s.calm || s.seconds % 0.5 < 0.3;
        const cells = [
            ['AP', !s.manual, 'green'], ['LAMP', s.lamps > 0.3, 'green'], ['HEAT', s.level > 0.15 || s.night > 0.5, 'amber'],
            ['ICE', s.level > 0.5, 'amber'], ['TERR', f.pull > 0.55 && blink, 'red'], ['WIND', s.level > 0.8, 'amber'],
        ];
        this.region(ctx, 'lamps', cells.map(c => c[1] ? 1 : 0).join(''), lamps.x - lamps.w / 2, lamps.y - lamps.h / 2, lamps.w, lamps.h, () => {
            const cw = lamps.w / 3, ch = lamps.h / 2;
            cells.forEach(([name, on, colour], i) => {
                const x = lamps.x - lamps.w / 2 + (i % 3 + 0.5) * cw, y = lamps.y - lamps.h / 2 + (Math.floor(i / 3) + 0.5) * ch;
                ctx.fillStyle = on ? this.ink(colour, 0.92) : 'rgba(70,74,80,0.55)';
                ctx.fillRect(x - cw / 2 + 1, y - ch / 2 + 1, cw - 2, ch - 2);
                this.label(ctx, name, x, y + 0.5, Math.max(5, ch * 0.5), on ? '#10140f' : 'rgba(150,156,164,0.5)');
            });
        }, -1);

        // The hour out there, and how cold it is.
        const hour = Math.floor(s.day * 24), minute = Math.floor(s.day * 1440) % 60, cold = Math.round(-24 - 14 * s.night - 9 * s.level);
        const readout = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}  ${cold}C`;
        this.region(ctx, 'time', readout, time.x - time.w / 2, time.y - time.h / 2, time.w, time.h, () => {
            this.label(ctx, readout, time.x, time.y + 0.5, Math.max(5, time.h * 0.5), this.glow(0.95));
        }, 1);
        // Height above the snow (a log scale to 500 m) and climb (±40 m/s).
        const high = IceLogic.clamp(Math.log(1 + Math.max(f.agl, 0) / 10) / Math.log(51), 0, 1), climb = IceLogic.clamp(f.climb / 40, -1, 1);
        this.region(ctx, 'bars', [Math.round(high * bars.h), Math.round(climb * bars.h / 2), Math.round(f.agl), Math.round(f.climb)].join('|'), bars.x - bars.w / 2, bars.y - bars.h / 2, bars.w, bars.h, () => {
            const bx = bars.x - bars.w / 2, by = bars.y - bars.h / 2, bw = bars.w * 0.26, ty = by + bars.h * 0.17, th = bars.h * 0.66;
            ctx.fillStyle = this.glow(1, 0.1);
            ctx.fillRect(bx + bars.w * 0.14, ty, bw, th);
            ctx.fillRect(bx + bars.w * 0.6, ty, bw, th);
            ctx.fillStyle = this.glow(0.9);
            ctx.fillRect(bx + bars.w * 0.14, ty + th * (1 - high), bw, th * high);
            ctx.fillStyle = climb < -0.6 ? '#ffb347' : this.glow(0.9);
            ctx.fillRect(bx + bars.w * 0.6, ty + th / 2 - Math.max(climb, 0) * th / 2, bw, Math.abs(climb) * th / 2 + 1);
            ctx.font = font(bars.h * 0.085);
            ctx.fillStyle = this.glow(0.95);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('ALT', bx + bars.w * 0.14 + bw / 2, by + bars.h * 0.085);
            ctx.fillText('V/S', bx + bars.w * 0.6 + bw / 2, by + bars.h * 0.085);
            ctx.fillText(String(Math.round(f.agl)), bx + bars.w * 0.14 + bw / 2, by + bars.h * 0.925);
            ctx.fillText((f.climb >= 0 ? '+' : '-') + String(Math.abs(Math.round(f.climb))).padStart(2, '0'), bx + bars.w * 0.6 + bw / 2, by + bars.h * 0.925);
        }, 1);
        this.region(ctx, 'blinks', life.lamps.subarray(3, 9).join(''), blinks.x - blinks.gap * 1.1, blinks.y - blinks.gap, blinks.gap * 2.2, blinks.gap * 2, () => {
            for (let i = 0; i < 6; i++) this.lamp(ctx, blinks.x + (i % 2 - 0.5) * blinks.gap, blinks.y + (Math.floor(i / 2) - 1) * blinks.gap * 0.62, ph * 0.05, ph * 0.03, i % 3 ? 'blue' : 'white', life.lamps[3 + i]);
        }, 1);
        // A ladder and three toggles a side.
        [-1, 1].forEach((side, n) => {
            const l = g.sideLadders[n], lit = Math.round(life.creep[1 + n] * 10), t = g.sideToggles[n];
            this.region(ctx, 'side' + n, lit, l.x - l.w, l.y - l.h / 2 - 3, l.w * 2, l.h + 6, () => this.ladder(ctx, l, lit, 10), side);
            this.region(ctx, 'flick' + n, ICE_SIDE_TOGGLES[n].map(i => life.switches[i]).join(''), t.x - t.gap * 1.5, t.y - ph * 0.05, t.gap * 3, ph * 0.094, () => {
                ICE_SIDE_TOGGLES[n].forEach((i, k) => this.toggle(ctx, t.x + (k - 1) * t.gap, t.y, life.switches[i]));
            }, side);
        });
    }
}
