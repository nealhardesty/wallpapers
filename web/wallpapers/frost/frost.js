// Frost on the Glass (SPEC §10.29). Outside on a cold night, looking in
// through a window: behind the glass a warm room, out of focus, and a
// Christmas tree that's only a dark cone and the soft discs of its lights.
// Fern frost creeps in from the cold edges and corners of each pane:
// stems that branch at ice's sixty degrees and stop where another crystal
// already is. It glows amber where the tree's behind it, and glints. Now
// and then someone inside draws in it with a fingertip (a heart, a star, a
// cat's paw print, NOEL backwards from out here), and the drawing slowly
// frosts over. After a long while the room's warmth thaws the glass from
// the middle out, and it starts again from the corners. Snow falls outside;
// now and then a flake sticks to the glass.
//
// Drag to draw in the frost; tap to breathe on the glass.
//
// Three canvases: the room and the frost (redrawn ten times a second at
// most: frost is slow), the window frame (baked, never redrawn) and the
// snow (every frame, when it's snowing). The pure parts are frost-logic.js;
// the art is frost-art.js.

const FROST_THAW = 40;     // seconds for the glass to clear

class FrostAnimationManager {
    constructor(host) {
        this.host = host;
        this.config = WP.settings.load();
        this.running = false;
        this.time = 0;
        this.listeners = [];
        this.tips = [];
        this.glints = [];
        this.spots = [];           // glint candidates: places with frost
        this.fogs = [];
        this.flakes = [];
        this.stuck = [];
        this.slots = {};
        this.stats = { ticks: 0, segments: 0, doodles: 0, thaws: 0, resizes: 0 };
    }

    get L() { return this.layout; }
    density() { return this.host.quality?.density ?? 1; }
    wants(name) { return this.host.quality?.effects?.includes(name) ?? true; }
    growSeconds() { return Math.max(30, this.config.growMinutes * 60); }

    // ---- Lifecycle --------------------------------------------------------------------------

    start() {
        if (this.running) return;
        this.running = true;
        const layer = () => {
            const c = document.createElement('canvas');
            Object.assign(c.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: '-1', pointerEvents: 'none' });
            document.body.appendChild(c);
            return c;
        };
        this.canvas = layer();        // the room and the frost
        this.frameCanvas = layer();   // the window frame, baked
        this.snowCanvas = layer();    // snow falling outside
        this.ctx = this.canvas.getContext('2d');
        this.snowCtx = this.snowCanvas.getContext('2d');
        this.festive = FrostLogic.festive(this.host.now());
        this.resize();
        this.planDoodle(true);
        this.listen();
        this.lastNow = 0;
        this.acc = 0;
        this.frameId = requestAnimationFrame(t => this.frame(t));
    }

    stop() {
        if (!this.running) return;
        this.running = false;
        cancelAnimationFrame(this.frameId);
        for (const off of this.listeners) off();
        this.listeners = [];
        for (const c of [this.canvas, this.frameCanvas, this.snowCanvas]) c.remove();
        this.canvas = this.frameCanvas = this.snowCanvas = this.ctx = this.snowCtx = null;
    }

    listen() {
        const on = (target, type, fn) => { target.addEventListener(type, fn); this.listeners.push(() => target.removeEventListener(type, fn)); };
        on(window, 'resize', () => this.resize());
        if (this.host.params.thumb) return;
        on(document, 'pointerdown', e => { this.pointerType = e.pointerType; });
        const ok = () => this.config.touch || this.pointerType === 'mouse';
        this.listeners.push(this.host.gestures({
            tap: (x, y) => { if (ok()) this.breathe(x, y); },
            start: (x, y) => { if (ok()) this.finger = { x, y, path: [{ x, y }] }; },
            move: (x, y) => { if (this.finger) { this.wipe(this.finger.x, this.finger.y, x, y, this.brush); this.finger.x = x; this.finger.y = y; this.finger.path.push({ x, y }); } },
            end: () => { if (this.finger) { this.heal(this.finger.path, 20, 50); this.finger = null; } },
        }));
    }

    applySettings(config) {
        const old = this.config;
        this.config = config;
        if (!this.running) return;
        const changed = keys => keys.some(k => JSON.stringify(old[k]) !== JSON.stringify(config[k]));
        if (changed(['window', 'frameColour', 'lights', 'blur', 'treeSide', 'treeStyle', 'treeSize', 'treeWidth', 'lightCount', 'coverage'])) this.resize();
        if (changed(['growMinutes'])) this.speed = this.depth / (this.growSeconds() * 0.9);
        if (changed(['doodles', 'doodleMinutes'])) this.planDoodle();
        if (changed(['snow'])) this.flakes = [];
        this.host.idleUntil(0);
    }

    onQuality() { this.flakes = []; }

    // ---- Timers -----------------------------------------------------------------------------

    schedule(name, seconds, fn) { this.slots[name] = seconds === Infinity ? null : { at: this.time + seconds, fn }; }
    planDoodle(soon) {
        if (!this.config.doodles) { this.schedule('doodle', Infinity); return; }
        const mean = this.config.doodleMinutes * 60;
        this.schedule('doodle', soon ? 25 + Math.random() * 40 : mean * (0.6 + Math.random() * 0.8), () => { this.doodle(); this.planDoodle(); });
    }

    // ---- Layout and baking -------------------------------------------------------------------

    resize() {
        if (!this.canvas) return;
        this.stats.resizes++;
        const dpr = this.dpr = window.devicePixelRatio || 1;
        const W = this.W = innerWidth, H = this.H = innerHeight;
        for (const c of [this.canvas, this.frameCanvas, this.snowCanvas]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
        const c = this.config;
        const L = this.layout = FrostLogic.layout(W, H, { kind: c.window, insets: this.host.insets || {} });
        const random = WP.seededRandom(2412);
        this.room = FrostArt.room(L, dpr, { lights: c.lights, blur: c.blur, treeSide: c.treeSide, treeStyle: c.treeStyle, treeSize: c.treeSize, treeWidth: c.treeWidth, lightCount: c.lightCount }, random);
        const fg = this.frameCanvas.getContext('2d');
        fg.clearRect(0, 0, this.frameCanvas.width, this.frameCanvas.height);
        fg.drawImage(FrostArt.frame(L, dpr, { colour: c.frameColour }, random), 0, 0);
        this.sprites = {
            haze: FrostArt.soft(15 * L.u, dpr),
            brush: FrostArt.soft(10 * L.u, dpr, 0.45),
            breath: FrostArt.soft(46 * L.u, dpr, 0.3),
            glint: FrostArt.glint(5 * L.u, dpr),
            crystal: FrostArt.crystal(4 * L.u, dpr),
            flake: FrostArt.soft(2.4 * L.u, dpr, 0.4),
            near: FrostArt.soft(14 * L.u, dpr, 0.2),
        };
        this.brush = 10 * L.u;
        this.brushes = {};
        this.lit = this.lit || document.createElement('canvas');
        this.lit.width = this.canvas.width; this.lit.height = this.canvas.height;
        // Only the render scale changed (Auto quality): keep the frost, scaled.
        if (this.mask && this.sized && this.sized.W === W && this.sized.H === H && this.sized.kind === c.window && this.sized.coverage === c.coverage) {
            const old = this.mask;
            this.mask = document.createElement('canvas');
            this.mask.width = this.canvas.width; this.mask.height = this.canvas.height;
            this.mask.getContext('2d').drawImage(old, 0, 0, this.mask.width, this.mask.height);
            this.dirty = true;
            this.host.idleUntil(0);
            return;
        }
        this.sized = { W, H, kind: c.window, coverage: c.coverage };
        this.mask = this.mask || document.createElement('canvas');
        this.mask.width = this.canvas.width; this.mask.height = this.canvas.height;
        // A new screen grows its frost afresh, already well along (alive on
        // the first frame), or full if it had already filled.
        const was = this.phase === 'hold' ? 1 : this.phase === 'grow' ? Math.min(1, this.phaseT / this.growSeconds()) : 0;
        this.reseed();
        this.pregrow(this.host.params.thumb ? 0.85 : Math.max(0.5, was));
        this.flakes = [];
        this.stuck = [];
        this.dirty = true;
        this.host.idleUntil(0);
    }

    // Fresh glass: seeds at every pane's edges and corners.
    reseed() {
        const L = this.L, random = Math.random;
        this.grid = FrostLogic.grid(L.W, L.H, Math.max(3, Math.round(4 * L.u)));
        const mg = this.mask.getContext('2d');
        mg.setTransform(1, 0, 0, 1, 0, 0);
        mg.clearRect(0, 0, this.mask.width, this.mask.height);
        this.tips = [];
        let stem = 0;
        const minPane = Math.min(...L.panes.map(p => Math.min(p.w, p.h)));
        this.depth = this.config.coverage * minPane * 0.8 * 1.5;
        this.speed = this.depth / (this.growSeconds() * 0.9);
        const delayScale = this.growSeconds();
        L.panes.forEach((pane, i) => {
            const s = FrostLogic.seeds(pane, random, { u: L.u, coverage: this.config.coverage, stem });
            stem = s.stem;
            for (const t of s.tips) { t.pane = i; t.delay *= delayScale; this.tips.push(t); }
        });
        this.stem = stem;
        this.spots = [];
        this.glints = [];
        this.phase = 'grow';
        this.phaseT = 0;
        this.cycleT = 0;
    }

    // Grow the frost to `share` of its growing time at once.
    pregrow(share) {
        const total = share * this.growSeconds();
        for (let t = 0; t < total; t += 2) this.growTips(Math.min(2, total - t));
        this.phaseT = total;
        this.cycleT = total;
        if (share >= 1) this.phase = 'hold';
    }

    // ---- Growth ------------------------------------------------------------------------------

    growTips(h) {
        const L = this.L, u = L.u, rand = Math.random;
        const segs = [[], [], [], []];
        const push = (x0, y0, x1, y1, gen) => { segs[gen].push(x0, y0, x1, y1); };
        const born = [];
        const cap = Math.round(9000 * Math.max(0.5, this.density()));
        for (const t of this.tips) {
            if (t.delay > 0) { t.delay -= h; continue; }
            const kids = FrostLogic.grow(t, this.speed * h, L.panes[t.pane], this.grid, rand, push, u);
            for (const k of kids) { k.pane = t.pane; born.push(k); }
        }
        this.tips = this.tips.filter(t => !t.dead);
        for (const k of born) if (this.tips.length < cap) this.tips.push(k);
        this.deposit(segs);
        return segs.some(s => s.length);
    }

    // Ice onto the mask: lines by generation (stems thickest), a faint haze
    // where it's dense, and places for glints.
    deposit(segs) {
        const g = this.mask.getContext('2d'), u = this.L.u, d = this.dpr;
        g.setTransform(d, 0, 0, d, 0, 0);
        g.lineCap = 'round';
        const width = [1.5, 1.05, 0.75, 0.55], alpha = [0.85, 0.68, 0.5, 0.4];
        let n = 0;
        for (let gen = 0; gen < 4; gen++) {
            const s = segs[gen];
            if (!s.length) continue;
            n += s.length / 4;
            g.beginPath();
            for (let i = 0; i < s.length; i += 4) { g.moveTo(s[i], s[i + 1]); g.lineTo(s[i + 2], s[i + 3]); }
            g.globalAlpha = alpha[gen];
            g.lineWidth = Math.max(0.5, width[gen] * Math.sqrt(u));
            g.strokeStyle = '#fff';
            g.stroke();
            // Haze and glint spots along the stems and their first branches.
            // The milky sheet the feathers grow in: haze wherever the ice is.
            if (gen < 3) {
                const hz = this.sprites.haze;
                g.globalAlpha = [0.07, 0.05, 0.035][gen];
                for (let i = 0; i < s.length; i += 4) {
                    if (Math.random() < 0.3) g.drawImage(hz.c, s[i] - hz.s / 2, s[i + 1] - hz.s / 2, hz.s, hz.s);
                    if (gen < 2 && Math.random() < 0.02) {
                        if (this.spots.length < 400) this.spots.push({ x: s[i], y: s[i + 1] });
                        else this.spots[Math.floor(Math.random() * 400)] = { x: s[i], y: s[i + 1] };
                    }
                }
            }
        }
        g.globalAlpha = 1;
        this.stats.segments += n;
        if (n) this.dirty = true;
    }

    // ---- Fingers, breath and thaw ----------------------------------------------------------------

    // Clear the frost along a line, a fingertip wide.
    wipe(x0, y0, x1, y1, r) {
        const g = this.mask.getContext('2d'), d = this.dpr, b = this.brushFor(r);
        g.setTransform(d, 0, 0, d, 0, 0);
        g.globalCompositeOperation = 'destination-out';
        const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (r * 0.3)));
        for (let i = 0; i <= n; i++) {
            const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n;
            g.drawImage(b.c, x - b.s / 2, y - b.s / 2, b.s, b.s);
            FrostLogic.unclaim(this.grid, x, y, r * 0.8);
        }
        g.globalCompositeOperation = 'source-over';
        this.spots = this.spots.filter(p => Math.min(Math.hypot(p.x - x0, p.y - y0), Math.hypot(p.x - x1, p.y - y1)) > r);
        this.dirty = true;
        this.host.idleUntil(0);
    }

    brushFor(r) {
        this.brushes = this.brushes || {};
        const k = Math.round(r * 4);
        return this.brushes[k] = this.brushes[k] || FrostArt.soft(r, this.dpr, 0.45);
    }

    // The frost grows back into a cleared line: fine new crystals from its
    // edges, after a while.
    heal(path, after, spread) {
        const u = this.L.u;
        for (let i = 0; i < path.length; i += 2) {
            const p = path[i];
            const pane = this.L.panes.findIndex(q => p.x > q.x && p.x < q.x + q.w && p.y > q.y && p.y < q.y + q.h);
            if (pane < 0) continue;
            for (const side of [-1, 1]) {
                const a = Math.random() * Math.PI * 2;
                this.tips.push({ x: p.x + Math.cos(a) * this.brush * 0.9 * side, y: p.y + Math.sin(a) * this.brush * 0.9 * side, a: a + Math.PI, gen: 2, len: 0, max: (5 + Math.random() * 9) * u,
                    delay: after + Math.random() * spread, stem: this.stem++, since: 0, curl: 0, pane });
            }
        }
    }

    // Breath on the glass: a round clear patch, fogged for a moment.
    breathe(x, y) {
        const r = 46 * this.L.u;
        const g = this.mask.getContext('2d'), d = this.dpr, b = this.sprites.breath;
        g.setTransform(d, 0, 0, d, 0, 0);
        g.globalCompositeOperation = 'destination-out';
        g.drawImage(b.c, x - r, y - r, 2 * r, 2 * r);
        g.globalCompositeOperation = 'source-over';
        FrostLogic.unclaim(this.grid, x, y, r * 0.7);
        this.spots = this.spots.filter(p => Math.hypot(p.x - x, p.y - y) > r * 0.8);
        this.fogs.push({ x, y, r: r * 1.1, t: 0 });
        this.heal(Array.from({ length: 24 }, (_, i) => ({ x: x + Math.cos(i / 24 * Math.PI * 2) * r * 0.6, y: y + Math.sin(i / 24 * Math.PI * 2) * r * 0.6 })), 8, 30);
        this.dirty = true;
        this.host.idleUntil(0);
    }

    keyBreathe() {
        const p = this.L.panes[Math.floor(Math.random() * this.L.panes.length)];
        this.breathe(p.x + p.w * (0.3 + Math.random() * 0.4), p.y + p.h * (0.3 + Math.random() * 0.4));
    }

    // The room's warmth: the glass clears from the middle of each pane out.
    thaw() {
        if (this.phase === 'thaw') return;
        this.phase = 'thaw';
        this.phaseT = 0;
        this.stats.thaws++;
        this.host.idleUntil(0);
    }
    keyThaw() { if (this.phase === 'thaw') { this.reseed(); this.pregrow(0.3); } else this.thaw(); this.host.idleUntil(0); }

    melt(h) {
        const g = this.mask.getContext('2d'), d = this.dpr;
        g.setTransform(d, 0, 0, d, 0, 0);
        g.globalCompositeOperation = 'destination-out';
        const k = this.phaseT / FROST_THAW;
        for (const p of this.L.panes) {
            const cx = p.x + p.w / 2, cy = p.y + p.h / 2, r = Math.hypot(p.w, p.h) * (0.25 + k * 0.6);
            const grd = g.createRadialGradient(cx, cy, 0, cx, cy, r);
            grd.addColorStop(0, `rgba(0,0,0,${Math.min(1, h * 0.25)})`);
            grd.addColorStop(0.7, `rgba(0,0,0,${Math.min(1, h * 0.12)})`);
            grd.addColorStop(1, 'rgba(0,0,0,0)');
            g.fillStyle = grd;
            g.fillRect(p.x, p.y, p.w, p.h);
        }
        g.fillStyle = `rgba(0,0,0,${Math.min(1, h * 0.05)})`;
        g.fillRect(0, 0, this.L.W, this.L.H);
        g.globalCompositeOperation = 'source-over';
        this.dirty = true;
    }

    // ---- Doodles ------------------------------------------------------------------------------

    doodle(name) {
        if (this.doodling || this.phase === 'thaw') return;
        const names = this.festive ? ['tree', 'star', 'heart'] : Object.keys(FrostLogic.SHAPES);
        const shape = name || names[Math.floor(Math.random() * names.length)];
        // Where there's frost to draw in, clear of a pane's edges.
        const scale = shape === 'noel' ? 0.3 : 0.2;
        const places = [];
        for (const pane of this.L.panes) {
            const size = Math.min(pane.w, pane.h) * scale, m = size * 1.15;
            for (const p of this.spots) if (p.x > pane.x + m && p.x < pane.x + pane.w - m && p.y > pane.y + m && p.y < pane.y + pane.h - m) places.push({ ...p, size });
        }
        const pane = this.L.panes[Math.floor(Math.random() * this.L.panes.length)];
        const at = places.length ? places[Math.floor(Math.random() * places.length)]
            : { x: pane.x + pane.w / 2, y: pane.y + pane.h / 2, size: Math.min(pane.w, pane.h) * scale };
        const size = at.size * (0.85 + Math.random() * 0.3);
        const cx = at.x, cy = at.y;
        const tilt = (Math.random() - 0.5) * 0.3, cos = Math.cos(tilt), sin = Math.sin(tilt);
        const path = FrostLogic.trace(FrostLogic.SHAPES[shape], 0.05).map(p => ({ ...p, x: cx + (p.x * cos - p.y * sin) * size, y: cy + (p.x * sin + p.y * cos) * size }));
        this.doodling = { shape, path, i: 0, at: null, wait: 0 };
        this.stats.doodles++;
        this.host.idleUntil(0);
    }

    drawDoodle(h) {
        const dd = this.doodling, speed = 140 * this.L.u, r = this.brush * 0.85;
        let budget = speed * h;
        while (budget > 0 && dd.i < dd.path.length) {
            const p = dd.path[dd.i];
            if (dd.wait > 0) { dd.wait -= h; return; }
            if (p.lift || !dd.at) { this.wipe(p.x, p.y, p.x, p.y, r); dd.at = p; dd.i++; if (p.lift && dd.i > 1) { dd.wait = 0.15; return; } continue; }
            const step = Math.hypot(p.x - dd.at.x, p.y - dd.at.y);
            this.wipe(dd.at.x, dd.at.y, p.x, p.y, r);
            budget -= p.dab ? step * 3 : step;
            dd.at = p;
            dd.i++;
        }
        if (dd.i >= dd.path.length) {
            // It stays a while, then frosts over.
            this.heal(dd.path, 90, 90);
            this.doodling = null;
        }
    }

    // ---- The frame loop -----------------------------------------------------------------------

    frame(now) {
        if (!this.running) return;
        const raw = this.lastNow ? (now - this.lastNow) / 1000 : 0;
        this.lastNow = now;
        const dt = Math.min(0.25, raw);
        this.time += raw > 1 ? 0.25 : raw;
        for (const [name, slot] of Object.entries(this.slots)) if (slot && slot.at <= this.time) { this.slots[name] = null; slot.fn(); }
        const tickEvery = (this.host.quality?.fps || 60) <= 30 ? 1 / 6 : 1 / 10;
        this.acc += dt;
        if (this.acc >= tickEvery || this.dirty || this.doodling) {
            this.tick(Math.min(this.acc, 0.5));
            this.acc = 0;
        }
        const snowing = this.config.snow > 0;
        if (snowing || this.stuck.length) this.drawSnow(Math.min(0.1, raw));
        // Snow wants every frame; frost alone, ten a second.
        if (!snowing && !this.stuck.length && !this.fogs.length && !this.finger && !this.doodling) {
            this.host.idleUntil(Math.max(0, tickEvery * 1000 - (performance.now() - now) - 2));
        }
        this.frameId = requestAnimationFrame(t => this.frame(t));
    }

    tick(h) {
        this.stats.ticks++;
        this.phaseT += h;
        this.cycleT += h;
        if (this.phase === 'thaw') {
            this.melt(h);
            if (this.phaseT >= FROST_THAW) { this.reseed(); }
        } else {
            this.growTips(h);
            if (this.phase === 'grow' && !this.tips.length && this.phaseT > 10) this.phase = 'hold';
            const cycle = this.config.cycleMinutes * 60;
            if (cycle > 0 && this.cycleT >= Math.max(cycle, this.growSeconds() + 60) && !this.doodling) this.thaw();
        }
        if (this.doodling) this.drawDoodle(h);
        this.draw();
    }

    draw() {
        const g = this.ctx, d = this.dpr, L = this.L, t = this.time, R = this.room;
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.drawImage(R.base, 0, 0);
        g.setTransform(d, 0, 0, d, 0, 0);
        // The tree's lights, softly twinkling.
        g.globalCompositeOperation = 'lighter';
        const tw = this.config.twinkle;
        for (const k of R.discs) {
            const a = k.a * (1 - 0.35 * tw + 0.35 * tw * Math.sin(t * k.speed + k.phase));
            if (a <= 0.01) continue;
            g.globalAlpha = Math.min(1, a);
            g.drawImage(k.sprite.c, k.x - k.sprite.s / 2, k.y - k.sprite.s / 2, k.sprite.s, k.sprite.s);
        }
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
        // The frost: its backlit colour, through the mask.
        if (this.dirty) {
            const lg = this.lit.getContext('2d');
            lg.globalCompositeOperation = 'copy';
            lg.drawImage(R.tint, 0, 0);
            lg.globalCompositeOperation = 'destination-in';
            lg.drawImage(this.mask, 0, 0);
            lg.globalCompositeOperation = 'source-over';
            this.dirty = false;
        }
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.drawImage(this.lit, 0, 0);
        g.setTransform(d, 0, 0, d, 0, 0);
        // Breath fog, fading.
        for (const f of this.fogs) {
            f.t += 1 / 10;
            const s = this.sprites.breath;
            g.globalAlpha = 0.32 * Math.max(0, 1 - f.t / 4);
            g.drawImage(s.c, f.x - f.r, f.y - f.r, 2 * f.r, 2 * f.r);
        }
        this.fogs = this.fogs.filter(f => f.t < 4);
        g.globalAlpha = 1;
        // Glints: light catching a facet now and then.
        if (this.config.sparkle && this.wants('glints') && this.spots.length > 20) {
            const want = Math.round(16 * this.density());
            while (this.glints.length < want) this.glints.push({ ...this.spots[Math.floor(Math.random() * this.spots.length)], phase: Math.random() * 6, speed: 0.5 + Math.random() * 1.2 });
            this.glints.length = Math.min(this.glints.length, want);
            g.globalCompositeOperation = 'lighter';
            const s = this.sprites.glint;
            for (const gl of this.glints) {
                const v = Math.sin(t * gl.speed + gl.phase);
                if (v < 0.97) {
                    if (v < -0.99) Object.assign(gl, this.spots[Math.floor(Math.random() * this.spots.length)]);
                    continue;
                }
                g.globalAlpha = 0.85 * Math.pow((v - 0.97) / 0.03, 2);
                g.drawImage(s.c, gl.x - s.s / 2, gl.y - s.s / 2, s.s, s.s);
            }
            g.globalAlpha = 1;
            g.globalCompositeOperation = 'source-over';
        }
    }

    // ---- Snow, outside --------------------------------------------------------------------------

    drawSnow(dt) {
        const g = this.snowCtx, d = this.dpr, L = this.L, u = L.u;
        const want = Math.round(80 * this.config.snow * this.density());
        while (this.flakes.length < want) this.flakes.push(this.flake(this.flakes.length < want * 0.5));
        if (this.flakes.length > want) this.flakes.length = want;
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, this.snowCanvas.width, this.snowCanvas.height);
        g.setTransform(d, 0, 0, d, 0, 0);
        const sill = L.inner.y + L.inner.h;
        for (const f of this.flakes) {
            f.y += f.v * dt;
            f.x += Math.sin(this.time * f.w + f.p) * f.sway * dt;
            if (f.stick && f.y >= f.stick && this.stuck.length < 14) {
                this.stuck.push({ x: f.x, y: f.y, life: 40 + Math.random() * 50, t: 0, a: Math.random() * Math.PI });
                Object.assign(f, this.flake(false));
                continue;
            }
            if (f.y > (f.near ? L.H + 20 * u : sill) || f.x < -30 || f.x > L.W + 30) { Object.assign(f, this.flake(false)); continue; }
            const s = f.near ? this.sprites.near : this.sprites.flake;
            g.globalAlpha = f.a;
            g.drawImage(s.c, f.x - f.r, f.y - f.r, 2 * f.r, 2 * f.r);
        }
        const c = this.sprites.crystal;
        for (const s of this.stuck) {
            s.t += dt;
            g.globalAlpha = Math.min(1, s.t * 2, (s.life - s.t) / (s.life * 0.3)) * 0.85;
            g.save(); g.translate(s.x, s.y); g.rotate(s.a);
            g.drawImage(c.c, -c.s / 2, -c.s / 2, c.s, c.s);
            g.restore();
        }
        this.stuck = this.stuck.filter(s => s.t < s.life);
        g.globalAlpha = 1;
    }

    flake(anywhere) {
        const L = this.L, u = L.u, near = Math.random() < 0.06;
        const r = near ? (10 + Math.random() * 8) * u : (1 + Math.random() * 1.8) * u;
        const x = Math.random() * L.W, y = anywhere ? Math.random() * L.H : -r - Math.random() * 40;
        const inPane = L.panes.some(p => x > p.x && x < p.x + p.w);
        return { x, y, r, near, v: (near ? 70 : 22 + r * 9) * u * (0.8 + Math.random() * 0.4), w: 0.5 + Math.random(), p: Math.random() * 6, sway: (8 + Math.random() * 14) * u,
            a: near ? 0.22 : 0.55 + Math.random() * 0.4, stick: !near && inPane && Math.random() < 0.05 ? L.inner.y + Math.random() * L.inner.h * 0.9 : 0 };
    }

    // For tests.
    debugState() {
        return { phase: this.phase, phaseT: +this.phaseT.toFixed(1), tips: this.tips.length, growing: this.tips.filter(t => t.delay <= 0).length, spots: this.spots.length,
            doodling: this.doodling?.shape || null, flakes: this.flakes.length, stuck: this.stuck.length, stats: { ...this.stats } };
    }
}
