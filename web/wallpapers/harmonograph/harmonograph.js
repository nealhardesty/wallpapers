// Harmonograph (SPEC §10.6): a pen on decaying pendulums draws a looping
// figure on a sheet of paper. When the pendulums run down the drawing is
// signed, admired for a while, then flies onto the pile in the corner and a
// fresh sheet slides in.
//
// Cost: the sheet (paper texture plus ink) is its own canvas. While the pen
// draws, each frame strokes only the new grid segments onto it and copies
// the small rectangle they touched to the screen, with the pen on top. The
// only full-screen frames are the slides between drawings. On Low the pen
// moves in strokes a few times a second, and the stage idles in between.

const HARMONOGRAPH_INKS = {
    // ink on light paper, ink on dark paper, and the paper 'auto' picks
    sumi:      { light: ['#1c1a1f'], dark: ['#ebe5d8'], paper: 'cream' },
    blueprint: { light: ['#1d4c8a'], dark: ['#eef4ff'], paper: 'blueprint' },
    sepia:     { light: ['#5e3b1f'], dark: ['#dcb88c'], paper: 'cream' },
    riso:      { light: ['#ff4f9e', '#1f6fd0'], dark: ['#ff6fb4', '#4fb6ff'], paper: 'white' },
    gold:      { light: ['#94681c'], dark: ['#e6c272'], paper: 'black' },
};

const HARMONOGRAPH_PAPERS = {
    cream:     { base: [242, 233, 214], dark: false },
    white:     { base: [249, 248, 244], dark: false },
    black:     { base: [24, 23, 27], dark: true },
    blueprint: { base: [31, 78, 140], dark: true, grid: true },
};

// Seconds for the finished sheet to fly onto the pile, and for a new one
// to slide in.
const HARMONOGRAPH_OUT = 2.4;
const HARMONOGRAPH_IN = 1.9;

class HarmonographAnimationManager {
    constructor(host) {
        this.host = host;
        this.config = WP.settings.load();
        this.canvas = null;
        this.ctx = null;
        this.running = false;
        this.frameId = null;
        this.phase = 'draw';      // draw → hold → out → in → draw
        this.phaseTime = 0;       // seconds into out / in
        this.holdLeft = 0;        // seconds left to admire a finished sheet
        this.fig = null;
        this.elapsed = 0;         // seconds into the drawing
        this.drawn = 0;           // grid points inked so far
        this.pile = [];           // finished sheets, small, oldest first
        this.flying = null;       // the sheet on its way to the pile
        this.pen = null;          // where the pen was drawn: {x, y} on screen
        this.last = 0;
        this.gap = 0;             // how long we asked the stage to idle, in s
        this.stride = this.strideFor(host.quality);
    }

    // ---- Lifecycle -----------------------------------------------------------

    start() {
        if (this.running) return;
        this.running = true;
        const canvas = this.canvas = document.createElement('canvas');
        canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;';
        document.body.appendChild(canvas);
        this.ctx = canvas.getContext('2d');
        this.onResize = () => this.resize();
        window.addEventListener('resize', this.onResize);
        // The first frame is a sheet already part-drawn, at a seeded point.
        this.newFigure();
        this.elapsed = this.drawSeconds() * (0.22 + Math.random() * 0.33);
        this.resize();
        this.frameId = requestAnimationFrame(t => this.frame(t));
    }

    stop() {
        this.running = false;
        cancelAnimationFrame(this.frameId);
        window.removeEventListener('resize', this.onResize);
        this.canvas?.remove();
        this.canvas = this.ctx = null;
    }

    applySettings(config) {
        const before = this.config;
        this.config = { ...config };
        // Keep the pen where it is on the grid when the pace changes.
        if (before.drawMinutes !== config.drawMinutes) this.elapsed *= config.drawMinutes / before.drawMinutes;
        if (['palette', 'paper', 'penWidth'].some(key => before[key] !== config[key])) this.resize();
        else if (before.keepPrevious !== config.keepPrevious) { this.buildDesk(); this.renderAll(); }
    }

    onQuality(quality) {
        const stride = this.strideFor(quality);
        if (stride !== this.stride) this.stride = stride;
    }

    // Low draws every other grid point, in strokes a few times a second.
    strideFor(quality) {
        return quality && quality.density < 0.5 ? 2 : 1;
    }

    // The 'n' key: whatever is on the sheet goes onto the pile, and a new
    // drawing begins.
    newDrawing() {
        if (this.phase === 'out' || this.phase === 'in') return;
        this.beginOut();
    }

    drawSeconds() {
        return this.config.drawMinutes * 60;
    }

    newFigure() {
        // Each figure has its own seed, drawn from Math.random (which ?seed=
        // makes reproducible), so a resize can redraw it exactly.
        this.fig = HarmonographMath.figure(WP.seededRandom(Math.floor(Math.random() * 2 ** 32)), this.config.ratios);
        this.elapsed = 0;
        this.drawn = 0;
        this.signed = false;
        this.blotted = false;
    }

    // ---- Layout and cached layers -------------------------------------------

    resize() {
        if (!this.canvas) return;
        const dpr = window.devicePixelRatio || 1;
        const W = this.canvas.width = Math.max(1, Math.round(innerWidth * dpr));
        const H = this.canvas.height = Math.max(1, Math.round(innerHeight * dpr));
        this.dpr = dpr;
        // The sheet: A-series proportions, turned to match the screen.
        const landscape = W >= H;
        const aspect = landscape ? Math.SQRT2 : 1 / Math.SQRT2;
        let sw = W * 0.86, sh = sw / aspect;
        if (sh > H * 0.8) { sh = H * 0.8; sw = sh * aspect; }
        sw = Math.round(sw); sh = Math.round(sh);
        const pad = Math.round(Math.min(sw, sh) * 0.05);
        this.sheetSize = { w: sw, h: sh, pad };
        this.rest = { x: Math.round((W - sw) / 2) - pad, y: Math.round((H - sh) / 2 - H * 0.01) - pad };
        // Where finished sheets land, by their centre: in whichever margin
        // is wider, tucked a little under the sheet on the desk.
        const side = (W - sw) / W > (H - sh) / H;
        const s = 0.26, left = this.rest.x + pad, top = this.rest.y + pad;
        this.pileAt = side
            ? { cx: left - sw * s * 0.2, cy: top + sh * s * 0.55, s }
            : { cx: left + sw * s * 0.62, cy: top - sh * s * 0.12, s };
        this.buildPen();
        this.buildPaper();
        this.buildDesk();
        this.buildSheet();
        this.renderAll();
    }

    look() {
        const inks = HARMONOGRAPH_INKS[this.config.palette] || HARMONOGRAPH_INKS.sumi;
        const paperId = this.config.paper === 'auto' ? inks.paper : this.config.paper;
        const paper = HARMONOGRAPH_PAPERS[paperId] || HARMONOGRAPH_PAPERS.cream;
        const colours = paper.dark ? inks.dark : inks.light;
        // Two-colour inks blend along the drawing; 32 steps are plenty.
        const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
        const [a, b] = [rgb(colours[0]), rgb(colours[colours.length - 1])];
        const ramp = Array.from({ length: 32 }, (_, i) => {
            const t = i / 31;
            return `rgb(${a.map((v, j) => Math.round(v + (b[j] - v) * t)).join(',')})`;
        });
        return { paper, ramp };
    }

    // The desk: dark walnut, a little warm light from the top left, and the
    // pile of finished drawings.
    buildDesk() {
        const W = this.canvas.width, H = this.canvas.height;
        const desk = this.desk = this.desk && this.desk.width === W && this.desk.height === H ? this.desk : document.createElement('canvas');
        desk.width = W; desk.height = H;
        const g = desk.getContext('2d');
        if (!this.grain || this.grain.width !== W || this.grain.height !== H) this.grain = this.buildGrain(W, H);
        g.drawImage(this.grain, 0, 0);
        if (this.config.keepPrevious) {
            for (const sheet of this.pile) this.drawSheet(g, sheet.canvas, { ...this.pileAt, r: sheet.tilt });
        }
    }

    buildGrain(W, H) {
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const g = c.getContext('2d');
        g.fillStyle = '#2a1f19';
        g.fillRect(0, 0, W, H);
        // Long, slightly wavy grain lines.
        const lines = Math.round(H / (3 * this.dpr));
        for (let i = 0; i < lines; i++) {
            const y0 = Math.random() * H;
            const dark = Math.random() < 0.6;
            g.strokeStyle = dark ? `rgba(14, 9, 7, ${0.12 + Math.random() * 0.2})` : `rgba(120, 82, 58, ${0.05 + Math.random() * 0.1})`;
            g.lineWidth = (0.6 + Math.random() * 2.2) * this.dpr;
            const amp = (1 + Math.random() * 7) * this.dpr, freq = (0.5 + Math.random() * 2) / W * Math.PI * 2, ph = Math.random() * 6;
            g.beginPath();
            for (let x = -10; x <= W + 10; x += 24 * this.dpr) {
                const y = y0 + Math.sin(x * freq + ph) * amp + Math.sin(x * freq * 3.1 + ph * 2) * amp * 0.3;
                x < 0 ? g.moveTo(x, y) : g.lineTo(x, y);
            }
            g.stroke();
        }
        // A few knots.
        for (let i = 0; i < 3; i++) {
            const x = Math.random() * W, y = Math.random() * H, r = (6 + Math.random() * 14) * this.dpr;
            g.strokeStyle = 'rgba(14, 9, 7, 0.25)';
            g.lineWidth = this.dpr;
            for (let j = 1; j <= 4; j++) { g.beginPath(); g.ellipse(x, y, r * j * 0.9, r * j * 0.35, 0, 0, Math.PI * 2); g.stroke(); }
        }
        // Light from the top left, and the corners in shadow.
        const light = g.createRadialGradient(W * 0.2, H * 0.1, 0, W * 0.2, H * 0.1, Math.hypot(W, H) * 0.7);
        light.addColorStop(0, 'rgba(255, 214, 160, 0.13)');
        light.addColorStop(1, 'rgba(255, 214, 160, 0)');
        g.fillStyle = light;
        g.fillRect(0, 0, W, H);
        const vignette = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.62);
        vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
        vignette.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
        g.fillStyle = vignette;
        g.fillRect(0, 0, W, H);
        return c;
    }

    // A blank sheet: its own soft shadow, a deckled edge, mottling and
    // fibres. Built once per size and paper; every drawing starts as a copy.
    buildPaper() {
        const { w, h, pad } = this.sheetSize;
        const { paper } = this.look();
        const c = this.paper = document.createElement('canvas');
        c.width = w + pad * 2; c.height = h + pad * 2;
        const g = c.getContext('2d');
        const d = this.dpr;

        // Shadow: stacked, widening translucent sheets stand in for a blur.
        for (let i = 7; i >= 0; i--) {
            const grow = i * pad / 9;
            g.fillStyle = `rgba(0, 0, 0, ${0.045 + (7 - i) * 0.012})`;
            g.beginPath();
            g.roundRect(pad - grow, pad - grow + pad * 0.22, w + grow * 2, h + grow * 2, grow + 2 * d);
            g.fill();
        }

        // The deckled edge: a gentle wave plus a fine tear.
        const edge = new Path2D();
        const corners = [[pad, pad], [pad + w, pad], [pad + w, pad + h], [pad, pad + h]];
        const step = 3 * d;
        corners.forEach(([x0, y0], i) => {
            const [x1, y1] = corners[(i + 1) % 4];
            const len = Math.hypot(x1 - x0, y1 - y0), nx = (y1 - y0) / len, ny = -(x1 - x0) / len;
            const ph = Math.random() * 9;
            for (let s = 0; s < len; s += step) {
                const t = s / len;
                const off = (Math.sin(s / (40 * d) + ph) * 0.7 + (Math.random() - 0.5) * 1.1) * d;
                const x = x0 + (x1 - x0) * t - nx * off, y = y0 + (y1 - y0) * t - ny * off;
                i === 0 && s === 0 ? edge.moveTo(x, y) : edge.lineTo(x, y);
            }
        });
        edge.closePath();

        g.save();
        g.clip(edge);
        const [r, gg, b] = paper.base;
        g.fillStyle = `rgb(${r}, ${gg}, ${b})`;
        g.fillRect(0, 0, c.width, c.height);
        // Mottling: broad, faint clouds of darker and lighter pulp.
        const tone = (k, a) => `rgba(${Math.round(r * k)}, ${Math.round(gg * k)}, ${Math.round(b * k)}, ${a})`;
        for (let i = 0; i < 30; i++) {
            const x = pad + Math.random() * w, y = pad + Math.random() * h, rad = (0.08 + Math.random() * 0.25) * Math.min(w, h);
            const blot = g.createRadialGradient(x, y, 0, x, y, rad);
            const k = Math.random() < 0.5 ? 0.92 : (paper.dark ? 1.25 : 1.04);
            blot.addColorStop(0, tone(k, paper.dark ? 0.08 : 0.12));
            blot.addColorStop(1, tone(k, 0));
            g.fillStyle = blot;
            g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
        }
        // Fibres: short, curled strokes, a little darker or lighter.
        const fibres = Math.round(w * h / (650 * d * d));
        g.lineCap = 'round';
        for (let i = 0; i < fibres; i++) {
            const x = pad + Math.random() * w, y = pad + Math.random() * h;
            const len = (2 + Math.random() * 9) * d, a = Math.random() * Math.PI * 2, bend = (Math.random() - 0.5) * len;
            const dark = Math.random() < 0.55;
            g.strokeStyle = dark ? tone(paper.dark ? 0.7 : 0.82, 0.05 + Math.random() * 0.08) : tone(paper.dark ? 1.6 : 1.06, 0.06 + Math.random() * 0.1);
            g.lineWidth = (0.4 + Math.random() * 0.6) * d;
            g.beginPath();
            g.moveTo(x, y);
            g.quadraticCurveTo(x + Math.cos(a) * len / 2 - Math.sin(a) * bend, y + Math.sin(a) * len / 2 + Math.cos(a) * bend, x + Math.cos(a) * len, y + Math.sin(a) * len);
            g.stroke();
        }
        // Blueprint paper carries its grid.
        if (paper.grid) {
            const cell = Math.min(w, h) / 24;
            for (let i = 0; i * cell <= w + 1; i++) this.gridLine(g, pad + i * cell, pad, pad + i * cell, pad + h, i % 4 ? 0.07 : 0.16, d);
            for (let i = 0; i * cell <= h + 1; i++) this.gridLine(g, pad, pad + i * cell, pad + w, pad + i * cell, i % 4 ? 0.07 : 0.16, d);
        }
        // Light falling across the sheet from the top left.
        const sheen = g.createLinearGradient(pad, pad, pad + w, pad + h);
        sheen.addColorStop(0, 'rgba(255, 250, 240, 0.07)');
        sheen.addColorStop(1, 'rgba(0, 0, 0, 0.07)');
        g.fillStyle = sheen;
        g.fillRect(0, 0, c.width, c.height);
        g.restore();
        // Rag paper edges catch a little more shadow.
        g.strokeStyle = paper.dark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(90, 70, 40, 0.22)';
        g.lineWidth = 0.8 * d;
        g.stroke(edge);
    }

    gridLine(g, x0, y0, x1, y1, alpha, d) {
        g.strokeStyle = `rgba(235, 244, 255, ${alpha})`;
        g.lineWidth = 0.7 * d;
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.stroke();
    }

    // The pen seen from above: a dark barrel tip with a glint, and its shadow.
    buildPen() {
        const d = this.dpr, size = Math.ceil(26 * d);
        const c = this.penSprite = document.createElement('canvas');
        c.width = c.height = size;
        const g = c.getContext('2d');
        const mid = size / 2;
        const shadow = g.createRadialGradient(mid + 4 * d, mid + 5 * d, 0, mid + 4 * d, mid + 5 * d, 7 * d);
        shadow.addColorStop(0, 'rgba(0, 0, 0, 0.32)');
        shadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        g.fillStyle = shadow;
        g.fillRect(0, 0, size, size);
        g.fillStyle = '#26252b';
        g.beginPath(); g.arc(mid, mid, 3.4 * d, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#5d5c66';
        g.beginPath(); g.arc(mid, mid, 2.4 * d, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(220, 225, 235, 0.85)';
        g.beginPath(); g.arc(mid - 1.1 * d, mid - 1.2 * d, 0.9 * d, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#111';
        g.beginPath(); g.arc(mid, mid, 0.9 * d, 0, Math.PI * 2); g.fill();
    }

    // The current sheet: a fresh copy of the paper with every segment so
    // far inked back on (after a resize or a new look).
    buildSheet() {
        const c = this.sheet = document.createElement('canvas');
        c.width = this.paper.width; c.height = this.paper.height;
        this.sheetCtx = c.getContext('2d');
        this.sheetCtx.drawImage(this.paper, 0, 0);
        this.ink = this.look();
        const { w, h, pad } = this.sheetSize;
        // The figure's frame on the sheet: a little wider on a landscape sheet.
        const ry = Math.min(w, h) * 0.42;
        this.figFrame = { cx: pad + w / 2, cy: pad + h / 2 - h * 0.015, rx: Math.min(w * 0.42, ry * (w > h ? 1.25 : 1)), ry: w > h ? ry : Math.min(h * 0.36, w * 0.46) };
        const lineScale = Math.max(1, 0.7 * this.dpr, Math.min(w, h) / 620 * this.config.penWidth);
        this.lineWidth = lineScale;
        const done = this.drawn;
        if (done > 0) this.blot();
        for (let k = 0; k < done; k += HarmonographMath.STROKE) this.inkStrokes([HarmonographMath.stroke(this.fig, k, this.stride)]);
        if (this.signed) this.sign();
    }

    // ---- Ink -----------------------------------------------------------------

    toSheet(x, y) {
        const f = this.figFrame;
        return [f.cx + x * f.rx, f.cy + y * f.ry];
    }

    // Strokes onto the sheet (or, for the live tail, onto the screen at
    // `offset`); the box they touched, in sheet space.
    inkStrokes(list, g = this.sheetCtx, offset = null) {
        if (!list.length) return null;
        const ramp = this.ink.ramp;
        g.globalCompositeOperation = this.ink.paper.dark ? 'screen' : 'multiply';
        // Butt ends, nudged back a hair, so where strokes meet there's
        // neither a gap nor a darker bead.
        g.lineCap = 'butt';
        g.lineJoin = 'round';
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const s of list) {
            g.globalAlpha = s.alpha;
            g.strokeStyle = ramp[Math.min(31, Math.floor(s.mix * 32))];
            g.lineWidth = s.width * this.lineWidth;
            g.beginPath();
            s.points.forEach(([px, py], i) => {
                let [x, y] = this.toSheet(px, py);
                if (i === 0 && s.points.length > 1) {
                    const [nx, ny] = this.toSheet(...s.points[1]), len = Math.hypot(nx - x, ny - y) || 1;
                    x -= (nx - x) / len * 0.35; y -= (ny - y) / len * 0.35;
                }
                x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
                if (offset) { x += offset.x; y += offset.y; }
                i ? g.lineTo(x, y) : g.moveTo(x, y);
            });
            g.stroke();
        }
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
        const m = this.lineWidth * 2 + 2;
        return { x0: x0 - m, y0: y0 - m, x1: x1 + m, y1: y1 + m };
    }

    // Where the pen first touches down, the ink pools.
    blot() {
        const g = this.sheetCtx, [x, y] = this.toSheet(...HarmonographMath.point(this.fig, 0));
        const random = WP.seededRandom(Math.round(this.fig.terms.y[0][2] * 1e6));
        g.globalCompositeOperation = this.ink.paper.dark ? 'screen' : 'multiply';
        g.fillStyle = this.ink.ramp[0];
        for (let i = 0; i < 5; i++) {
            g.globalAlpha = 0.35 + random() * 0.3;
            g.beginPath();
            g.arc(x + (random() - 0.5) * this.lineWidth * 2.2, y + (random() - 0.5) * this.lineWidth * 2.2, this.lineWidth * (0.9 + random() * 1.3), 0, Math.PI * 2);
            g.fill();
        }
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
        this.blotted = true;
    }

    // Signed in pencil when the pendulums have run down: the ratio, and the day.
    sign() {
        const g = this.sheetCtx, { w, h, pad } = this.sheetSize;
        const [p, q] = this.fig.ratio;
        const day = this.host.now().toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
        g.font = `italic ${Math.round(Math.min(w, h) * 0.026)}px Georgia, 'Times New Roman', serif`;
        g.textAlign = 'right';
        g.textBaseline = 'alphabetic';
        g.fillStyle = this.ink.paper.dark ? 'rgba(230, 230, 236, 0.42)' : 'rgba(70, 66, 62, 0.5)';
        g.fillText(`${p} : ${q}  ·  ${day}`, pad + w * 0.95, pad + h * 0.955);
        this.signed = true;
    }

    // ---- Frames --------------------------------------------------------------

    frame(now) {
        if (!this.running) return;
        // Clamp a frame's time at 100 ms, or at the idle we asked for.
        const dt = this.last ? Math.min((now - this.last) / 1000, Math.max(0.1, this.gap + 0.1)) : 0;
        this.last = now;
        this.gap = 0;
        if (this.phase === 'draw') this.drawFrame(dt);
        else if (this.phase === 'hold') this.holdFrame(dt);
        else this.slideFrame(dt);
        if (this.running) this.frameId = requestAnimationFrame(t => this.frame(t));
    }

    idle(seconds) {
        if (seconds <= 0) return;
        this.gap = seconds;
        this.host.idleUntil(seconds * 1000);
    }

    drawFrame(dt) {
        this.elapsed += dt;
        const H = HarmonographMath, step = H.advance(this.fig, this.drawn, this.elapsed, this.drawSeconds(), this.stride);
        if (this.drawn === 0 && step.due > 0 && !this.blotted) this.blot();
        const box = this.inkStrokes(step.strokes);
        this.drawn = step.drawn;
        const finished = this.drawn + H.STROKE > this.fig.steps;
        if (finished) {
            this.showPen(box, null);
            this.sign();
            this.renderAll();
            this.phase = 'hold';
            this.holdLeft = this.config.holdSeconds;
            return this.idle(this.holdLeft);
        }
        // Low: the pen moves a stroke at a time, and the stage idles until
        // the next one is due. Elsewhere the stroke in progress follows the
        // pen as a live tail, drawn on the screen only.
        const low = this.stride > 1;
        const tail = low ? [] : H.segments(this.fig, this.drawn, step.due, 1);
        if (box || tail.length || !this.pen) this.showPen(box, tail, low ? this.drawn : step.due);
        if (low) this.idle(H.secondsAt(this.fig, this.drawn + H.STROKE, this.drawSeconds()) - this.elapsed);
    }

    holdFrame(dt) {
        this.holdLeft -= dt;
        if (this.holdLeft > 0.02) return this.idle(this.holdLeft);
        this.beginOut();
    }

    // The ink just drawn reaches the screen: last frame's tail and pen are
    // painted over from the desk and sheet, then the new tail and the pen
    // go on top. `tail` is null when the pen lifts.
    showPen(box, tail, at = this.drawn) {
        const g = this.ctx, { x: ox, y: oy } = this.rest, half = this.penSprite.width / 2;
        const restore = r => {
            const x0 = Math.max(0, Math.floor(r.x0)), y0 = Math.max(0, Math.floor(r.y0));
            const x1 = Math.min(this.sheet.width, Math.ceil(r.x1)), y1 = Math.min(this.sheet.height, Math.ceil(r.y1));
            if (x1 <= x0 || y1 <= y0) return;
            g.drawImage(this.desk, ox + x0, oy + y0, x1 - x0, y1 - y0, ox + x0, oy + y0, x1 - x0, y1 - y0);
            g.drawImage(this.sheet, x0, y0, x1 - x0, y1 - y0, ox + x0, oy + y0, x1 - x0, y1 - y0);
        };
        if (this.pen) restore(this.pen);
        if (box) restore(box);
        this.pen = null;
        if (!tail) return;
        // The tail: one live path from the last stroke to the pen.
        let dirty = null;
        if (tail.length) {
            const mean = key => tail.reduce((sum, s) => sum + s[key], 0) / tail.length;
            const points = [[tail[0].x0, tail[0].y0], ...tail.map(s => [s.x1, s.y1])];
            dirty = this.inkStrokes([{ points, width: mean('width'), alpha: mean('alpha'), mix: tail[0].mix }], g, { x: ox, y: oy });
        }
        const [x, y] = this.toSheet(...HarmonographMath.point(this.fig, at));
        g.drawImage(this.penSprite, Math.round(ox + x - half), Math.round(oy + y - half));
        const pen = { x0: x - half, y0: y - half, x1: x + half, y1: y + half };
        this.pen = dirty ? { x0: Math.min(dirty.x0, pen.x0), y0: Math.min(dirty.y0, pen.y0), x1: Math.max(dirty.x1, pen.x1), y1: Math.max(dirty.y1, pen.y1) } : pen;
    }

    // The desk, then the sheet at rest, then the pen.
    renderAll() {
        const g = this.ctx;
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.drawImage(this.desk, 0, 0);
        if (this.phase === 'out' || this.phase === 'in') return this.slideFrame(0);
        g.drawImage(this.sheet, this.rest.x, this.rest.y);
        this.pen = null;
        if (this.phase === 'draw') this.showPen(null, []);
    }

    beginOut() {
        this.showPen(null, null);
        if (!this.signed && this.drawn > this.fig.steps * 0.15) this.sign();
        // What flies to the pile: a small copy, made once.
        const s = this.pileAt.s;
        const small = document.createElement('canvas');
        small.width = Math.round(this.sheet.width * s); small.height = Math.round(this.sheet.height * s);
        const sg = small.getContext('2d');
        sg.imageSmoothingQuality = 'high';
        sg.drawImage(this.sheet, 0, 0, small.width, small.height);
        const keep = this.config.keepPrevious && this.drawn > this.fig.steps * 0.15;
        // Pile sheets alternate their tilt, so the one beneath peeks out.
        const tilt = this.pile.length % 2 ? -0.07 : -0.12;
        this.flying = {
            canvas: this.sheet, small: keep ? small : null, tilt,
            to: keep ? { ...this.pileAt, r: tilt }
                : { cx: -this.sheet.width * 0.75, cy: this.restPlace().cy + this.sheet.height * 0.1, r: -0.18, s: 1 },
        };
        this.phase = 'out';
        this.phaseTime = 0;
    }

    // The sheet at rest, as a place: its centre, tilt and scale.
    restPlace() {
        return { cx: this.rest.x + this.paper.width / 2, cy: this.rest.y + this.paper.height / 2, r: 0, s: 1 };
    }

    slideFrame(dt) {
        const g = this.ctx;
        this.phaseTime += dt;
        const ease = t => t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
        const mix = (a, b, e) => ({ cx: a.cx + (b.cx - a.cx) * e, cy: a.cy + (b.cy - a.cy) * e, r: a.r + (b.r - a.r) * e, s: a.s + (b.s - a.s) * e });
        const rest = this.restPlace();
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.drawImage(this.desk, 0, 0);
        if (this.phase === 'out') {
            const t = Math.min(1, this.phaseTime / HARMONOGRAPH_OUT), e = ease(t);
            const place = mix(rest, this.flying.to, e);
            // A gentle arc: the sheet lifts a little on its way.
            place.cy -= Math.sin(Math.PI * e) * this.canvas.height * 0.04;
            this.drawSheet(g, this.flying.canvas, place);
            if (t >= 1) {
                if (this.flying.small) {
                    this.pile.push({ canvas: this.flying.small, tilt: this.flying.tilt });
                    if (this.pile.length > 2) this.pile.shift();
                }
                this.flying = null;
                this.buildDesk();
                this.newFigure();
                this.buildSheet();
                this.phase = 'in';
                this.phaseTime = 0;
            }
        } else if (this.phase === 'in') {
            const t = Math.min(1, this.phaseTime / HARMONOGRAPH_IN), e = 1 - (1 - t) ** 3;
            const from = { cx: this.canvas.width + this.paper.width * 0.6, cy: rest.cy + this.canvas.height * 0.12, r: 0.1, s: 1 };
            this.drawSheet(g, this.sheet, mix(from, rest, e));
            if (t >= 1) {
                this.phase = 'draw';
                this.renderAll();
            }
        }
    }

    // A sheet at a place {cx, cy, r, s}: its centre, tilt and scale, where
    // scale 1 is the paper's full size, whatever the canvas's own size (the
    // pile keeps small copies).
    drawSheet(g, canvas, place) {
        const w = this.paper.width * place.s, h = this.paper.height * place.s;
        g.save();
        g.translate(place.cx, place.cy);
        g.rotate(place.r);
        g.drawImage(canvas, -w / 2, -h / 2, w, h);
        g.restore();
    }
}
