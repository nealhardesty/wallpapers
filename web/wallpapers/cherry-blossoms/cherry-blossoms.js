// Cherry Blossoms (SPEC §10.33): a bough of blossom reaches in from a
// corner against the sky of the hour, and its petals come down: tumbling,
// fluttering, swaying, carried off by the gusts, settling on the grass or
// afloat on the water. The sky, the hills, the tree, the ground and the
// petal sprites are baked (CherryArt); a frame copies them and draws each
// petal once, nearer ones last. The logic (the tree, the wind, a petal's
// flight) is CherryLogic, tested in Node.
class CherryBlossomAnimationManager {
    constructor(host) {
        this.host = host;
        this.config = WP.settings.load();
        this.canvas = null;
        this.ctx = null;
        this.running = false;
        this.frameId = 0;
        this.listeners = [];
        this.petals = [];
        this.time = 0;
        this.stats = { frames: 0, settled: 0, flurries: 0, gusts: 0 };
        this.seed = Math.floor(Math.random() * 0x7fffffff) || 1;   // ?seed= makes Math.random repeatable
    }

    async init() {}

    start() {
        if (this.running) return;
        this.running = true;
        // Two canvases: the still scene (sky, hills, tree) behind, so a frame
        // never copies it, and everything that moves on the one in front.
        const back = this.back = document.createElement('canvas');
        back.id = 'cherry-blossom-scene';
        const canvas = this.canvas = document.createElement('canvas');
        canvas.id = 'cherry-blossom-canvas';
        for (const c of [back, canvas]) {
            Object.assign(c.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: '-1', pointerEvents: 'none' });
            document.body.appendChild(c);
        }
        back.style.background = '#dbe8f5';
        this.bg = back.getContext('2d');
        this.ctx = canvas.getContext('2d');
        this.random = CherryLogic.rng(this.seed);
        this.wind = CherryLogic.makeWind(this.random);
        this.build();
        const on = (target, type, fn) => { target.addEventListener(type, fn, { passive: true }); this.listeners.push(() => target.removeEventListener(type, fn)); };
        on(window, 'resize', () => this.build(true));
        this.listeners.push(this.host.gestures({
            tap: (x, y) => { if (this.config.touch) this.tapAt(x, y); },
            start: (x, y) => { if (this.config.touch) this.drag = { x, y, t: performance.now() }; },
            move: (x, y) => { if (this.config.touch && this.drag) this.dragTo(x, y); },
            end: () => { this.drag = null; },
        }));
        this.last = 0;
        this.frameId = requestAnimationFrame(t => this.frame(t));
    }

    stop() {
        if (!this.running) return;
        this.running = false;
        cancelAnimationFrame(this.frameId);
        for (const off of this.listeners) off();
        this.listeners = [];
        this.canvas.remove();
        this.back.remove();
        this.canvas = this.ctx = this.back = this.bg = null;
    }

    applySettings(config) {
        const old = this.config;
        this.config = config;
        if (!this.running) return;
        const changed = keys => keys.some(k => old[k] !== config[k]);
        if (changed(['tree', 'treeSide', 'branchCount', 'blossoms', 'sky', 'hills', 'sun', 'ground', 'petalColors', 'petalSize'])) this.build(true);
        if (changed(['petalCount', 'fallSpeed', 'rotationSpeed', 'swayAmount', 'flutter'])) this.refill();
    }

    onQuality() { this.refill(); }
    density() { return this.host.quality?.density ?? 1; }
    effect(name) { return this.host.quality?.effects?.includes(name) ?? true; }

    // ---- Building ----------------------------------------------------------------------------

    skyNow() {
        const c = this.config.sky;
        if (c === 'clock') { const d = this.host.now(); return CherryLogic.skyAt(d.getHours() + d.getMinutes() / 60); }
        return CherryLogic.SKIES[c] || CherryLogic.SKIES.day;
    }

    // Everything static, at this size: a resize keeps the petals in the air.
    build(keep = false) {
        const dpr = this.dpr = window.devicePixelRatio || 1;
        const W = this.W = window.innerWidth, H = this.H = window.innerHeight;
        for (const c of [this.canvas, this.back]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
        this.s = Math.min(W, H) / 800;
        const bottom = this.host.insets?.bottom || 0;
        const groundKinds = { none: 1, grass: 0.86, path: 0.88, water: 0.8 };
        this.groundY = this.config.ground === 'none' ? H - bottom : Math.min(H - bottom, H * (groundKinds[this.config.ground] || 0.86));
        const random = CherryLogic.rng(this.seed + Math.round(W * 7 + H * 13));
        const sky = this.skyLight = this.skyNow();
        this.skyKey = JSON.stringify(sky);
        this.skyArt = CherryArt.sky(W, H, dpr, sky, { hills: this.config.hills, sun: this.config.sun, random, groundY: this.groundY });
        this.tree = this.config.tree === 'none' ? null : CherryLogic.tree(this.seed, W, H, { style: this.config.tree, side: this.config.treeSide, branches: this.config.branchCount, blossoms: this.config.blossoms });
        this.treeArt = this.tree ? CherryArt.tree(this.tree, W, H, dpr, { light: sky.light, colours: this.config.petalColors, random }) : null;
        this.groundArt = CherryArt.ground(this.config.ground, W, H, dpr, this.groundY, sky, random);
        // Settled petals pile up on the ground's own layer (the ground is
        // painted into it first), so the two are one blit.
        this.pile = CherryArt.canvas(W, Math.max(1, H - this.groundY), dpr);
        if (this.groundArt) this.pile.g.drawImage(this.groundArt, 0, 0, W, H - this.groundY);
        this.pileCount = 0;
        this.bg.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.bg.drawImage(this.skyArt, 0, 0, W, H);
        if (this.treeArt) this.bg.drawImage(this.treeArt, 0, 0, W, H);
        this.sprites = CherryArt.petals(this.config.petalColors, dpr, 22 * this.s * this.config.petalSize * 1.3, sky.light);
        this.ripples = [];
        if (!keep) { this.petals = []; this.refill(true); }
        else this.refill();
        this.lastSkyCheck = 0;
    }

    petalTarget() { return Math.round(this.config.petalCount * this.density()); }

    petalOptions(from = null, depth = null) {
        const c = this.config;
        return { fallSpeed: c.fallSpeed, size: c.petalSize, spin: c.rotationSpeed, sway: c.swayAmount, flutter: c.flutter, colours: c.petalColors.length, shapes: 3, from, depth };
    }

    // A petal from the blossom (most of them) or from above the screen; on
    // the first fill, anywhere in the air already.
    newPetal(first = false) {
        const sources = this.tree?.clusters;
        let from = null;
        if (sources && sources.length && this.random() < 0.7) {
            const cl = sources[Math.floor(this.random() * sources.length)];
            from = { x: cl.x, y: cl.y, r: cl.r };
        }
        const p = CherryLogic.makePetal(this.random, this.W, this.H, this.petalOptions(from));
        if (first) { p.y = this.random() * this.groundY; p.x = this.random() * this.W; }
        return p;
    }

    refill(first = false) {
        const target = this.petalTarget();
        while (this.petals.length < target) this.petals.push(this.newPetal(first));
    }

    // ---- Frames ------------------------------------------------------------------------------

    frame(now) {
        if (!this.running) return;
        this.frameId = requestAnimationFrame(t => this.frame(t));
        const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
        this.last = now;
        this.time += dt;
        this.update(dt);
        this.draw();
        this.stats.frames++;
    }

    update(dt) {
        const c = this.config;
        const w = this.wind;
        const wasGust = w.phase !== 'calm';
        CherryLogic.stepWind(w, dt, { strength: c.windStrength, gustsPerMinute: c.gusts, gustLength: c.gustLength }, this.random, this.time);
        if (!wasGust && w.phase !== 'calm') { this.stats.gusts++; if (this.tree && this.random() < 0.6) this.flurry(Math.round(8 + 20 * c.windStrength / 3)); }
        const env = { wind: w, time: this.time, W: this.W, H: this.H, groundY: this.groundY, ground: c.ground, s: this.s, fade: c.fadeEnabled };
        const target = this.petalTarget();
        for (let i = this.petals.length - 1; i >= 0; i--) {
            const p = this.petals[i];
            const before = p.state;
            const state = CherryLogic.stepPetal(p, dt, env);
            if (state === 'settled') {
                this.settle(p);
                if (this.petals.length > target) this.petals.splice(i, 1); else Object.assign(p, this.newPetal());
            } else if (state === 'afloat' && before === 'falling') {
                if (this.ripples.length < 40) this.ripples.push({ x: p.x, y: p.y, t: 0 });
            } else if (state === 'gone') {
                if (this.petals.length > target) this.petals.splice(i, 1); else Object.assign(p, this.newPetal());
            }
        }
        for (let i = this.ripples.length - 1; i >= 0; i--) { this.ripples[i].t += dt; if (this.ripples[i].t > 1.6) this.ripples.splice(i, 1); }
        // The clock sky: rebuilt when the hour's colours move on.
        if (c.sky === 'clock' && this.time - this.lastSkyCheck > 30) {
            this.lastSkyCheck = this.time;
            if (JSON.stringify(this.skyNow()) !== this.skyKey) this.build(true);
        }
    }

    // A settled petal is drawn onto the pile and forgotten; now and then the
    // pile is washed with the ground's colour, so the oldest fade into it.
    settle(p) {
        if (!this.groundArt) return;
        const g = this.pile.g;
        this.drawPetal(g, p, -this.groundY);
        this.stats.settled++;
        if (++this.pileCount % 150 === 0) {
            g.save();
            g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
            g.globalAlpha = 0.06;
            g.drawImage(this.groundArt, 0, 0, this.W, this.H - this.groundY);
            g.restore();
        }
    }

    draw() {
        const { ctx, dpr, W, H } = this;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.globalAlpha = 1;
        ctx.clearRect(0, 0, W, H);
        // The ground and what lies on it, then the petals in the air, the far ones first.
        if (this.groundArt) {
            ctx.drawImage(this.pile.c, 0, this.groundY, W, H - this.groundY);
            if (this.config.ground === 'water') this.drawRipples(ctx);
            for (const p of this.petals) if (p.state === 'afloat') this.drawPetal(ctx, p);
        }
        const falling = this.petals.filter(p => p.state === 'falling').sort((a, b) => a.depth - b.depth);
        for (const p of falling) this.drawPetal(ctx, p);
    }

    // An axis-aligned blit from the atlas: the nearest baked turn and
    // flutter width, scaled for depth.
    drawPetal(g, p, dy = 0) {
        const A = this.sprites, atlas = A[p.colour % A.length][p.shape % A.shapes];
        const wide = Math.abs(CherryLogic.flutterWidth(p));
        const ai = ((Math.round(p.angle / (Math.PI * 2) * A.angles) % A.angles) + A.angles) % A.angles;
        const wi = wide > 0.8 ? 0 : wide > 0.45 ? 1 : 2;
        const box = atlas.box, k = atlas.bake, d = box * p.scale, dim = 0.55 + p.depth * 0.45;
        const x = p.x - d / 2, y = p.y + dy + (p.state === 'afloat' ? Math.sin(p.bob) * 1.5 * this.s : 0) - d / 2;
        g.globalAlpha = p.alpha * dim * (p.state === 'afloat' ? 0.92 : 1);
        g.drawImage(atlas.c, ai * box * k, wi * box * k, box * k, box * k, x, y, d, d);
        g.globalAlpha = 1;
    }

    drawRipples(ctx) {
        const s = this.s;
        for (const r of this.ripples) {
            const k = r.t / 1.6;
            ctx.strokeStyle = `rgba(255,255,255,${0.35 * (1 - k)})`;
            ctx.lineWidth = 1 * s;
            ctx.beginPath(); ctx.ellipse(r.x, r.y, (4 + 26 * k) * s, (1.5 + 9 * k) * s, 0, 0, Math.PI * 2); ctx.stroke();
        }
    }

    // ---- Input and keys ----------------------------------------------------------------------

    // Petals shaken loose from the blossom: a burst from the clusters nearest
    // a point (or from all of them), carried off by the wind.
    flurry(n = 24, at = null) {
        if (!this.tree || !this.tree.clusters.length) return;
        let pool = this.tree.clusters;
        if (at) pool = pool.slice().sort((a, b) => Math.hypot(a.x - at.x, a.y - at.y) - Math.hypot(b.x - at.x, b.y - at.y)).slice(0, 6);
        const cap = Math.round(this.petalTarget() * 1.5) + 60;
        for (let i = 0; i < n && this.petals.length < cap; i++) {
            const cl = pool[Math.floor(this.random() * pool.length)];
            const p = CherryLogic.makePetal(this.random, this.W, this.H, this.petalOptions({ x: cl.x, y: cl.y, r: cl.r }, 0.5 + this.random() * 0.5));
            p.vx = this.wind.dir * (40 + this.random() * 60) * this.s; p.vy = -(20 + this.random() * 40) * this.s;
            this.petals.push(p);
        }
        this.stats.flurries++;
    }

    // A tap on the bough shakes it (a flurry); elsewhere, a puff of wind from there.
    tapAt(x, y) {
        if (this.tree) {
            const near = this.tree.clusters.some(cl => Math.hypot(cl.x - x, cl.y - y) < cl.r + 30 * this.s);
            if (near) { this.flurry(30, { x, y }); return; }
        }
        this.wind.dir = x < this.W / 2 ? 1 : -1;
        this.wind.phase = 'rising'; this.wind.t = 0; this.wind.length = 3; this.wind.peak = this.config.windStrength * 1.2;
    }

    // Dragging pushes the air along: the wind follows the finger.
    dragTo(x, y) {
        const d = this.drag, now = performance.now();
        const dx = x - d.x, dtMs = Math.max(16, now - d.t);
        if (Math.abs(dx) > 4) {
            this.wind.dir = dx > 0 ? 1 : -1;
            this.wind.phase = 'blowing'; this.wind.t = 0; this.wind.length = 2;
            this.wind.peak = Math.min(8, Math.abs(dx) / dtMs * 60) * 0.8 + this.config.windStrength * 0.5;
        }
        this.drag = { x, y, t: now };
    }

    gustNow() {
        this.wind.phase = 'rising'; this.wind.t = 0; this.wind.length = this.config.gustLength; this.wind.peak = this.config.windStrength * 1.3;
        return 'A gust';
    }

    flurryNow() { this.flurry(40); return 'The bough shakes'; }

    newTree() {
        this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
        this.random = CherryLogic.rng(this.seed);
        this.build();
        return 'A new tree';
    }

    nextSky() {
        const order = ['day', 'dusk', 'night', 'clock'], i = order.indexOf(this.config.sky);
        this.config.sky = order[(i + 1) % order.length];
        WP.settings.save(this.config);
        this.build(true);
        return `Sky: ${this.config.sky === 'clock' ? 'by the clock' : this.config.sky}`;
    }

    nextGround() {
        const order = ['grass', 'path', 'water', 'none'], i = order.indexOf(this.config.ground);
        this.config.ground = order[(i + 1) % order.length];
        WP.settings.save(this.config);
        this.build(true);
        return `Ground: ${this.config.ground}`;
    }

    debugState() {
        const states = { falling: 0, afloat: 0 };
        for (const p of this.petals) states[p.state] = (states[p.state] || 0) + 1;
        return {
            petals: this.petals.length, target: this.petalTarget(), states, wind: { dir: this.wind.dir, phase: this.wind.phase, strength: Math.round(this.wind.strength * 100) / 100 },
            tree: this.tree ? { limbs: this.tree.limbs.length, clusters: this.tree.clusters.length, style: this.tree.style, side: this.tree.side } : null,
            sky: this.config.sky, light: this.skyLight.light, ground: this.config.ground, groundY: Math.round(this.groundY), ripples: this.ripples.length,
            stats: { ...this.stats }, time: Math.round(this.time * 10) / 10, seed: this.seed,
        };
    }
}
