// Matrix (SPEC §10.32): the film's digital rain, done the way the film did
// it. The symbols never fall: they sit in fixed cells, and a wave of light
// runs down each column, lighting the cell it passes and going dark behind.
// Symbols change in place on a shared clock. The glyphs are the ones in the
// 1999 title sequence, mirrored half-width katakana and a few numerals,
// drawn as strokes (MatrixLogic), baked into an atlas of brightness steps
// per colour, so a frame is one drawImage per lit cell and nothing else.
class MatrixAnimationManager {
    constructor(host) {
        this.host = host;
        this.config = WP.settings.load();
        this.canvas = null;
        this.ctx = null;
        this.running = false;
        this.frameId = 0;
        this.listeners = [];
        this.atlases = new Map();
        this.time = 0;
        this.layers = [];
        this.stats = { frames: 0, cells: 0, splashed: 0 };
        this.seed = Math.floor(Math.random() * 0x7fffffff) || 1;   // ?seed= makes Math.random repeatable
    }

    async init() {}

    start() {
        if (this.running) return;
        this.running = true;
        const canvas = this.canvas = document.createElement('canvas');
        canvas.id = 'matrix-canvas';
        Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: '-1', pointerEvents: 'none', background: '#000' });
        document.body.appendChild(canvas);
        this.ctx = canvas.getContext('2d');
        this.build();
        const on = (target, type, fn) => { target.addEventListener(type, fn, { passive: true }); this.listeners.push(() => target.removeEventListener(type, fn)); };
        on(window, 'resize', () => this.build(true));
        this.listeners.push(this.host.gestures({ tap: (x, y) => { if (this.config.touch) this.splash(x, y); } }));
        this.last = 0;
        this.nextFrameAt = 0;
        this.frameId = requestAnimationFrame(t => this.frame(t));
    }

    stop() {
        if (!this.running) return;
        this.running = false;
        cancelAnimationFrame(this.frameId);
        for (const off of this.listeners) off();
        this.listeners = [];
        this.canvas.remove();
        this.canvas = this.ctx = null;
    }

    // Changes from the panel. The grid is rebuilt when its shape changes; the
    // rest takes effect on the next frame.
    applySettings(config) {
        const old = this.config;
        this.config = config;
        if (!this.running) return;
        const changed = keys => keys.some(k => old[k] !== config[k]);
        if (changed(['look', 'glyphSize', 'depth', 'intro'])) this.build();
        else if (changed(['colour', 'glow'])) this.repaint();
        if (changed(['fps'])) this.nextFrameAt = 0;
    }

    onQuality() {
        const depth = this.config.depth && this.effect('depth');
        if (depth !== (this.layers.length === 2)) this.build(true); else this.repaint();
    }

    // New colours: every cell is drawn again.
    repaint() {
        this.atlases.clear();
        for (const L of this.layers) { L.tiers.fill(0); L.g.clearRect(0, 0, L.canvas.width, L.canvas.height); }
    }

    effect(name) { return this.host.quality?.effects?.includes(name) ?? true; }
    density() { return this.host.quality?.density ?? 1; }
    look() { return MatrixLogic.LOOKS[this.config.look] || MatrixLogic.LOOKS.operator; }

    // ---- The grid ----------------------------------------------------------------------------

    // Two layers: the rain, and (depth on) a smaller, dimmer, softer one behind
    // it. A resize keeps the rain going; only the cells are re-fitted.
    build(resize = false) {
        const dpr = this.dpr = window.devicePixelRatio || 1;
        const W = this.W = window.innerWidth, H = this.H = window.innerHeight;
        this.canvas.width = Math.round(W * dpr);
        this.canvas.height = Math.round(H * dpr);
        this.atlases.clear();
        const look = this.look();
        const random = MatrixLogic.rng(this.seed);
        const make = (scale, dim) => {
            // Cells scale with the screen, so a 4K display is as crowded as a laptop.
            const cw = Math.max(5, this.config.glyphSize * scale * Math.min(2.5, Math.max(0.75, Math.min(W, H) / 800))), ch = cw * look.aspect;
            const cols = Math.ceil(W / cw), rows = Math.ceil(H / ch) + 1;
            const columns = [];
            for (let c = 0; c < cols; c++) {
                const col = MatrixLogic.makeColumn(c, cols, random);
                col.start = this.config.intro ? MatrixLogic.introDelay(c, cols, random) : 0;
                columns.push(col);
            }
            const glyphs = new Uint8Array(cols * rows);
            for (let i = 0; i < glyphs.length; i++) glyphs[i] = Math.floor(random() * look.glyphs.length);
            // The layer's own canvas, where only the cells that change are redrawn.
            const canvas = document.createElement('canvas');
            canvas.width = this.canvas.width; canvas.height = this.canvas.height;
            return {
                scale, dim, cw, ch, cols, rows, columns, glyphs, random, tick: 0, nextTick: 0, canvas, g: canvas.getContext('2d'),
                tiers: new Uint8Array(cols * rows), shown: new Uint8Array(cols * rows), want: new Uint8Array(cols * rows), dirty: new Uint8Array(cols * rows),
            };
        };
        const front = make(1, 1);
        this.layers = this.config.depth && this.effect('depth') ? [make(0.62, 0.42), front] : [front];
        this.time = 0;
        this.ticks = 0;
        // Without the intro (or on a resize), it's been raining a while already.
        if (!this.config.intro || resize) this.advance(12, 0.1);
    }

    params(L) {
        const look = this.look(), c = this.config;
        return {
            rows: L.rows, speed: 18 * c.speed * (L.scale < 1 ? 0.7 : 1), trailRows: Math.max(3, Math.round(L.rows * c.trail * look.trail / 1.5)),
            brightShare: c.brightHeads, rate: c.density, density: Math.min(1, c.density * this.density() * (L.scale < 1 ? 0.7 : 1)),
            stutter: c.stutter, time: this.time,
        };
    }

    // Run every layer forward: the drops, then (on the look's clock) the symbols.
    advance(dt, step = dt) {
        const look = this.look();
        for (let t = 0; t < dt - 1e-9; t += step) {
            const d = Math.min(step, dt - t);
            this.time += d;
            for (const L of this.layers) {
                const p = this.params(L);
                for (const col of L.columns) MatrixLogic.stepColumn(col, d, p, L.random);
                L.nextTick -= d;
                if (L.nextTick <= 0) { L.nextTick += 1 / look.tick; this.cycle(L); }
            }
        }
    }

    // One tick of the symbol clock: every cell that's due changes, together.
    // Some cells (the look's flicker share) change every tick; the rest at
    // the look's rate times the setting, at random.
    cycle(L) {
        const look = this.look(), n = look.glyphs.length;
        const chance = look.cycle * this.config.cycle / look.tick;
        if (chance <= 0 && look.flicker <= 0) return;
        L.tick++;
        for (const col of L.columns) {
            for (const d of col.drops) {
                const top = Math.max(0, Math.ceil(d.head - d.len)), bottom = Math.min(L.rows - 1, Math.floor(d.head));
                for (let r = top; r <= bottom; r++) {
                    const flick = MatrixLogic.hash(col.c, r, 7) < look.flicker * Math.min(1, this.config.cycle);
                    if (flick || L.random() < chance) L.glyphs[col.c * L.rows + r] = Math.floor(L.random() * n);
                }
            }
        }
    }

    // ---- The atlas ---------------------------------------------------------------------------

    TIERS = 16;

    // Every glyph at every brightness step, plus the head row (with its glow)
    // and the head's white core, drawn once in white as a mask per layer;
    // then a copy per hue, each tier row tinted through it (source-in), so a
    // new colour, or the rainbow's twelve, costs a few fills, not a bake.
    mask(L) {
        const look = this.look(), dpr = this.dpr, glyphs = look.glyphs;
        const cw = Math.ceil(L.cw * dpr), ch = Math.ceil(L.ch * dpr), pad = Math.ceil(cw * 0.9);
        const T = this.TIERS, slotW = cw + pad * 2, slotH = ch + pad * 2;
        const c = document.createElement('canvas');
        c.width = glyphs.length * slotW;
        c.height = (T + 2) * slotH;
        const g = c.getContext('2d');
        const paths = glyphs.map(gl => new Path2D(gl.path));
        g.lineCap = 'round';
        g.lineJoin = 'round';
        const drawGlyph = (i, x, y, width, alpha = 1, blur = 0) => {
            const gl = glyphs[i];
            g.save();
            g.translate(x, y);
            // The glyph box: 10 × 14 units, fitted into the cell with a margin.
            const sx = cw * 0.88 / 10, sy = ch * 0.88 / 14;
            g.translate(cw * 0.06, ch * 0.06);
            if (gl.flip === 'x') { g.translate(10 * sx, 0); g.scale(-sx, sy); } else if (gl.flip === 'y') { g.translate(0, 14 * sy); g.scale(sx, -sy); } else g.scale(sx, sy);
            g.lineWidth = width / Math.min(sx, sy);
            g.strokeStyle = `rgba(255,255,255,${alpha})`;
            if (blur) { g.shadowColor = '#fff'; g.shadowBlur = blur; }
            g.stroke(paths[i]);
            g.restore();
        };
        const stroke = Math.max(1, cw * 0.11) * (L.dim < 1 ? 1.3 : 1);
        for (let t = 1; t < T; t++) for (let i = 0; i < glyphs.length; i++) drawGlyph(i, i * slotW + pad, t * slotH + pad, stroke);
        // The head row: a bloom round it (shadowBlur here, at bake time only),
        // and, a row below, its core alone.
        const glow = this.config.glow && this.effect('glow') && L.dim >= 1;
        for (let i = 0; i < glyphs.length; i++) {
            const x = i * slotW + pad, y = T * slotH + pad;
            if (glow) { drawGlyph(i, x, y, stroke * 1.6, 0.55, cw * 0.45); drawGlyph(i, x, y, stroke * 1.2, 0.8, cw * 0.18); }
            drawGlyph(i, x, y, stroke * (glow ? 1 : 1.15));
            drawGlyph(i, x, y + slotH, stroke * 0.9);
        }
        // Soft, for the layer behind: drawn through a smaller canvas and back.
        if (L.dim < 1) {
            const s = document.createElement('canvas');
            s.width = Math.max(1, Math.round(c.width / 3)); s.height = Math.max(1, Math.round(c.height / 3));
            s.getContext('2d').drawImage(c, 0, 0, s.width, s.height);
            g.clearRect(0, 0, c.width, c.height);
            g.globalAlpha = 0.9;
            g.drawImage(s, 0, 0, c.width, c.height);
            g.globalAlpha = 1;
        }
        return { c, cw, ch, pad, slotW, slotH };
    }

    atlas(L, hue) {
        const key = `${L.scale}|${hue}`;
        let a = this.atlases.get(key);
        if (a) return a;
        const maskKey = `mask|${L.scale}`;
        let m = this.atlases.get(maskKey);
        if (!m) { m = this.mask(L); this.atlases.set(maskKey, m); }
        const look = this.look(), colour = MatrixLogic.COLOURS[this.config.colour] || MatrixLogic.COLOURS.green, sat = colour.sat;
        const T = this.TIERS, { slotW, slotH } = m;
        const c = document.createElement('canvas');
        c.width = m.c.width; c.height = (T + 1) * slotH;
        const g = c.getContext('2d');
        g.drawImage(m.c, 0, 0, m.c.width, (T + 1) * slotH, 0, 0, m.c.width, (T + 1) * slotH);
        g.globalCompositeOperation = 'source-in';
        for (let t = 1; t <= T; t++) {
            const b = (t / (T - 1)) * L.dim;
            g.fillStyle = t === T ? MatrixLogic.hsl(MatrixLogic.headShade(hue, sat, look.head)) : MatrixLogic.hsl(MatrixLogic.shade(hue, sat, b));
            g.save(); g.beginPath(); g.rect(0, t * slotH, c.width, slotH); g.clip();
            g.fillRect(0, t * slotH, c.width, slotH);
            g.restore();
        }
        // The head's white core over its tinted bloom.
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 0.85;
        g.drawImage(m.c, 0, (T + 1) * slotH, m.c.width, slotH, 0, T * slotH, m.c.width, slotH);
        g.globalAlpha = 1;
        a = { c, cw: m.cw, ch: m.ch, pad: m.pad, slotW, slotH };
        this.atlases.set(key, a);
        return a;
    }

    hueFor(c) {
        const colour = MatrixLogic.COLOURS[this.config.colour] || MatrixLogic.COLOURS.green;
        if (colour.hue === 'column') return Math.round(MatrixLogic.columnHue(c) / 30) * 30;
        return colour.hue === null ? this.look().hue : colour.hue;
    }

    // ---- Frames ------------------------------------------------------------------------------

    // Paced on a steady timeline at the fps setting (the film ran at 24):
    // the next frame is due an interval after the last was, never sooner,
    // and between them the stage sends nothing.
    frame(now) {
        if (!this.running) return;
        const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
        this.last = now;
        this.advance(dt);
        this.draw();
        this.stats.frames++;
        const interval = 1000 / Math.max(6, Math.min(60, this.config.fps));
        const at = performance.now();
        this.nextFrameAt = Math.max(at, (this.nextFrameAt || 0) + interval);
        this.host.idleUntil(Math.max(0, this.nextFrameAt - at - 1));
        this.frameId = requestAnimationFrame(t => this.frame(t));
    }

    draw() {
        const { ctx, dpr } = this;
        let cells = 0;
        for (const L of this.layers) cells += this.drawLayer(L);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        for (const L of this.layers) ctx.drawImage(L.canvas, 0, 0);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.stats.cells = cells;
        if (this.config.crt) this.drawScanlines();
    }

    // What each cell should show now (its tier, from the drops over it, and
    // its symbol) against what it shows; only the difference is redrawn. A
    // head's bloom spills into the cells round it, so a head that moves on,
    // or one next to a cell being redrawn, takes its whole neighbourhood with it.
    drawLayer(L) {
        const look = this.look(), T = this.TIERS, { cols, rows, cw, ch, want, tiers, shown, dirty, glyphs, g } = L, dpr = this.dpr;
        want.fill(0);
        for (const col of L.columns) {
            const base = col.c * rows;
            for (const d of col.drops) {
                const headRow = Math.floor(d.head);
                const top = Math.max(0, Math.ceil(d.head - d.len)), bottom = Math.min(rows - 1, headRow);
                for (let r = top; r <= bottom; r++) {
                    const b = MatrixLogic.cover(d, r, look.ramp);
                    if (b < 0) continue;
                    const tier = r === headRow && d.bright ? T : Math.round(b * (T - 1));
                    if (tier > want[base + r]) want[base + r] = tier;
                }
            }
        }
        const n = cols * rows, queue = [];
        dirty.fill(0);
        for (let i = 0; i < n; i++) {
            if (want[i] !== tiers[i] || (want[i] && shown[i] !== glyphs[i])) { dirty[i] = 1; queue.push(i); }
        }
        if (!queue.length) return 0;
        // Round every head that is, or was, within a cell of a change, the 3 × 3 block is redrawn.
        const mark = i => { if (!dirty[i]) { dirty[i] = 1; queue.push(i); } };
        for (let q = 0; q < queue.length; q++) {
            const i = queue[q], c = Math.floor(i / rows), r = i - c * rows;
            for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) {
                const cc = c + dc, rr = r + dr;
                if (cc < 0 || cc >= cols || rr < 0 || rr >= rows) continue;
                const j = cc * rows + rr;
                if (want[j] !== T && tiers[j] !== T) continue;
                for (let ec = -1; ec <= 1; ec++) for (let er = -1; er <= 1; er++) {
                    const c2 = cc + ec, r2 = rr + er;
                    if (c2 >= 0 && c2 < cols && r2 >= 0 && r2 < rows) mark(c2 * rows + r2);
                }
            }
        }
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        for (const i of queue) { const c = Math.floor(i / rows), r = i - c * rows; g.clearRect(c * cw, r * ch, cw, ch); }
        let drawn = 0;
        for (const i of queue) {
            const c = Math.floor(i / rows), r = i - c * rows, tier = want[i];
            tiers[i] = tier;
            if (!tier) continue;
            shown[i] = glyphs[i];
            const a = this.atlas(L, this.hueFor(c)), gi = glyphs[i];
            if (tier === T) g.drawImage(a.c, gi * a.slotW, tier * a.slotH, a.slotW, a.slotH, c * cw - a.pad / dpr, r * ch - a.pad / dpr, a.slotW / dpr, a.slotH / dpr);
            else g.drawImage(a.c, gi * a.slotW + a.pad, tier * a.slotH + a.pad, a.cw, a.ch, c * cw, r * ch, a.cw / dpr, a.ch / dpr);
            drawn++;
        }
        return drawn;
    }

    // A CRT's lines: a baked stripe pattern, drawn once over the frame.
    drawScanlines() {
        const { ctx, dpr, W, H } = this;
        if (!this.scan || this.scan.dpr !== dpr) {
            const c = document.createElement('canvas');
            c.width = 4; c.height = Math.max(2, Math.round(3 * dpr));
            const g = c.getContext('2d');
            g.fillStyle = 'rgba(0,0,0,0.28)';
            g.fillRect(0, 0, 4, Math.max(1, Math.round(dpr)));
            this.scan = { pattern: ctx.createPattern(c, 'repeat'), dpr };
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = this.scan.pattern;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // ---- Input and keys ----------------------------------------------------------------------

    // A tap: the columns round it light up from that row, bright-headed.
    splash(x, y) {
        const L = this.layers[this.layers.length - 1];
        const c0 = Math.floor(x / L.cw), r0 = Math.floor(y / L.ch), p = this.params(L);
        for (let c = c0 - 3; c <= c0 + 3; c++) {
            const col = L.columns[c];
            if (!col) continue;
            MatrixLogic.spawn(col, L.rows, { ...p, brightShare: 1 }, L.random, Math.max(0, r0 - Math.abs(c - c0)));
            col.start = 0;
            this.stats.splashed++;
        }
        this.host.idleUntil(0);
    }

    rainAgain() {
        this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
        this.build();
        return this.config.intro ? 'The code comes down again' : 'New rain';
    }

    nextLook() {
        const order = MatrixLogic.LOOK_ORDER, i = order.indexOf(this.config.look);
        this.config.look = order[(i + 1) % order.length];
        WP.settings.save(this.config);
        this.build();
        return `Look: ${this.look().name}`;
    }

    nextColour() {
        const order = MatrixLogic.COLOUR_ORDER, i = order.indexOf(this.config.colour);
        this.config.colour = order[(i + 1) % order.length];
        WP.settings.save(this.config);
        this.repaint();
        return `Colour: ${MatrixLogic.COLOURS[this.config.colour].name}`;
    }

    debugState() {
        const L = this.layers[this.layers.length - 1];
        return {
            look: this.config.look, colour: this.config.colour, layers: this.layers.length, cols: L.cols, rows: L.rows,
            drops: L.columns.reduce((n, c) => n + c.drops.length, 0), bright: L.columns.reduce((n, c) => n + c.drops.filter(d => d.bright).length, 0),
            cells: this.stats.cells, frames: this.stats.frames, splashed: this.stats.splashed, time: Math.round(this.time * 10) / 10, atlases: this.atlases.size,
            glyphs: this.look().glyphs.length,
        };
    }
}
