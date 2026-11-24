// Torchlight Descent: an alpine valley at nightfall, as a painting, and a
// line of skiers with flaming torches snaking down the mountain in
// switchbacks, every torch lighting the snow it passes (SPEC §10.42).
//
// Painted Village's method, on a mountain (painted-plates.js,
// painted-bake.js): the picture is brush strokes laid once and lit by
// arithmetic on canvases, so the hour can turn without repainting:
//   - a bake, in slices of a few milliseconds a frame: on a first load the
//     picture paints itself, broad strokes first
//   - a light step, when the hour's colour has moved or a window has gone
//     on or off: about a dozen blends, no pixel read
//   - a frame: one blit of the lit picture, then the cast (torch-cast.js):
//     every torch's pool of light at once, the skiers, cats, the dog, the
//     snowcat, the lift, fireworks; smoke, a few bulbs, the falling snow
// The sun and moon are the real ones (harvest-sky.js, through host.now(),
// so ?date= works); New Year's Eve and Christmas come from the same clock.

class TorchlightAnimationManager {
    constructor(host) {
        this.host = host;
        this.config = WP.settings.load();
        this.running = false;
        this.listeners = [];
        this.time = 0;
        this.wind = 0;
        this.gust = 0;
        this.pointerType = 'mouse';
        this.scene = null; this.next = null;
        this.flakes = []; this.puffs = []; this.clouds = []; this.stars = [];
        this.light = PaintedLogic.light(-20, 0);
        this.lightKey = '';
        this.sun = { alt: -20, x: 0.5 };
        this.moon = { alt: 30, x: 0.5, age: 10, phase: 0.3, illum: 0.5, light: 0 };
        this.dirty = null;
        this.lastStep = 0; this.lastSky = 0;
        this.fx = { glints: 1 };
        this.bakes = 0;
        this.cal = TorchLogic.calendar(host.now());
    }

    // ---- Lifecycle ------------------------------------------------------------

    start() {
        if (this.running) return;
        this.running = true;
        const canvas = this.canvas = document.createElement('canvas');
        canvas.id = 'torchlight-canvas';
        Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: '-1', pointerEvents: 'none' });
        document.body.appendChild(canvas);
        this.ctx = canvas.getContext('2d');
        this.cycleBase = this.host.now().getTime();
        this.syncEffects(true);
        this.resize();
        this.listen();
        canvas.addEventListener('contextlost', e => e.preventDefault());
        canvas.addEventListener('contextrestored', () => this.rebuild(true));
        this.last = 0;
        this.frameId = requestAnimationFrame(now => this.frame(now));
    }

    stop() {
        if (!this.running) return;
        this.running = false;
        cancelAnimationFrame(this.frameId);
        for (const off of this.listeners) off();
        this.listeners = [];
        this.canvas.remove();
        this.canvas = this.ctx = this.scene = this.next = this.cast = null;
    }

    listen() {
        const on = (target, type, fn) => { target.addEventListener(type, fn, { passive: true }); this.listeners.push(() => target.removeEventListener(type, fn)); };
        on(window, 'resize', () => this.resize());
        on(document, 'pointerdown', e => { this.pointerType = e.pointerType; });
        this.listeners.push(this.host.gestures({ tap: (x, y) => { if (this.pointerType === 'mouse' || this.config.touch) this.tapAt(x, y); } }));
    }

    // Live changes from the panel: what is in the painting means painting it
    // again (the old one stays up meanwhile); the rest takes effect at once.
    applySettings(config) {
        const old = this.config;
        this.config = config;
        if (!this.running) return;
        const changed = keys => keys.some(k => JSON.stringify(old[k]) !== JSON.stringify(config[k]));
        if (changed(['horizon', 'chalets', 'chapel', 'inn', 'innName', 'tree', 'treeLights', 'nearLights', 'lamps', 'candles', 'wreaths', 'snowcat', 'lift', 'brush'])) { this.rebuildAt = performance.now() + 300; return; }
        if (changed(['sky', 'moonPhase', 'cycleMinutes'])) { this.pinKey = null; this.cycleBase = this.host.now().getTime() - this.time * 1000 * 86400 / (config.cycleMinutes * 60); }
        if (changed(['clouds'])) this.buildClouds();
        if (changed(['stars'])) this.buildStars();
        if (this.cast && changed(['cats', 'windowCat', 'dog', 'catSize'])) this.cast.build();
        this.dirty = 'all';
    }

    onQuality() { this.syncEffects(false); }
    syncEffects(now) {
        const on = name => this.host.quality?.effects?.includes(name) ?? true;
        this.fxTarget = { glints: on('moving-lights') ? 1 : 0 };
        if (now) this.fx = { ...this.fxTarget };
    }
    density() { return this.host.quality?.density ?? 1; }
    descentsAllowed() { return this.config.descents !== 'tap' && this.config.descents !== 'newyear'; }

    // ---- Layout and baking ------------------------------------------------------

    resize() {
        if (!this.canvas) return;
        const dpr = this.dpr = window.devicePixelRatio || 1;
        const W = window.innerWidth, H = window.innerHeight;
        if (!(W >= 16 && H >= 16)) return;
        this.canvas.width = Math.round(W * dpr); this.canvas.height = Math.round(H * dpr);
        const bottom = this.host.insets?.bottom || 0;
        if (this.W !== W || this.H !== H || this.bottom !== bottom || !(this.scene || this.next)) { this.W = W; this.H = H; this.bottom = bottom; this.rebuild(); }
    }

    // Lay the valley out for this window and start painting it.
    rebuild(lost) {
        if (!this.running || !(this.W >= 16)) return;
        if (lost) this.scene = null;
        const { W, H } = this, q = this.host.quality || {}, tier = q.tier || 'high';
        this.cal = TorchLogic.calendar(this.host.now());
        const config = this.paintConfig();
        const cam = TorchLogic.camera(W, H, this.bottom, config.horizon);
        cam.bands = TorchLogic.BANDS;
        const L = TorchLogic.layout(cam, config);
        const full = W * H * this.dpr * this.dpr, cap = { low: 0.8e6, medium: 1.4e6, high: 2.5e6 }[tier] || 2.5e6, k = Math.sqrt(Math.min(full, cap) / (W * H));
        const pw = Math.round(W * k / 2) * 2, ph = Math.round(H * k / 2) * 2;
        const P = new PaintedPlates.Plates(cam, pw, ph, Math.round(W * 7 + H * 13) + 20261231, { x: L.glow.x * W, y: L.glow.y });
        TorchArt.compose(P, L, config);
        const gen = PaintedBake.bake(P, { seed: Math.round(W + H * 3), brush: config.brush, passes: tier === 'low' ? 4 : tier === 'medium' ? 5 : 6, ridge: tier !== 'low', weave: tier !== 'low' });
        const T = gen.next().value;
        T.track = L.track;
        this.next = { gen, T, P, L, cam };
        this.day = this.host.now().toDateString();
        this.bakes++;
        if (!this.scene) { while (T.progress < 0.04 && !gen.next().done); this.show(); }
    }
    // What the painting needs to know beyond the settings: whether it is the season for candles.
    paintConfig() {
        const c = this.config, cal = this.cal;
        return { ...c, candlesOn: c.candles === 'always' || (c.candles === 'season' && cal.season), tree: c.tree === 'always' || (c.tree === 'season' && cal.season) ? undefined : false };
    }

    show() {
        const n = this.next;
        this.scene = n.T; this.L = n.L; this.cam = n.cam;
        this.buildClouds(); this.buildStars();
        const random = WP.seededRandom(417);
        for (const g of this.scene.groups) { g.habit = VillageLogic.windowHabits(random); if (g.upstairs) { g.habit.dusk = Math.min(0.9, g.habit.dusk + 0.18); g.habit.bed += 0.7; } g.shown = -1; }
        this.updateSky();
        for (const g of this.scene.groups) g.level = g.want = this.wantOf(g);
        this.puffs = []; this.flakes = [];
        const keep = this.cast;
        this.cast = new TorchCast(this);
        // A new painting of the same valley keeps whoever was coming down.
        if (keep && keep.proc && !keep.proc.done && keep.T.track.length === this.scene.track.length) { this.cast.proc = keep.proc; this.cast.spots = keep.spots; this.cast.figure = keep.figure; this.cast.planted = keep.planted; }
        this.seedSmoke();
        this.dirty = 'all';
        this.stepLight(performance.now(), true);
    }

    bakeSlice(budget) {
        const n = this.next;
        if (!n) return;
        const until = performance.now() + budget;
        let done = false;
        while (!done && performance.now() < until) done = n.gen.next().done;
        if (n.T !== this.scene && (n.T.pass >= 3 || done)) this.show();
        if (n.T === this.scene) this.painting = !done;
        if (done) { this.next = null; this.painting = false; this.dirty = 'all'; this.halfPaint(); }
    }
    // A half-size copy of the painting, for the fireworks' flash.
    halfPaint() {
        const T = this.scene, c = PaintedPlates.canvas(Math.ceil(T.pw / 4), Math.ceil(T.ph / 4));
        c.getContext('2d').drawImage(T.paint, 0, 0, c.width, c.height);
        T.paintHalf = c;
    }

    buildStars() {
        const { W } = this, cam = this.cam, random = WP.seededRandom(88);
        this.stars = [];
        if (!this.config.stars) return;
        const n = Math.round(320 * Math.min(2, W / 1400));
        for (let i = 0; i < n; i++) this.stars.push({ x: random() * W, y: random() ** 1.2 * cam.hor, r: (0.5 + random() * 1.1) * cam.u, a: 0.4 + random() * 0.6, c: ['#ffffff', '#dfe8ff', '#fff2d8'][Math.floor(random() * 3)] });
    }
    buildClouds() {
        const { W } = this, cam = this.cam, random = WP.seededRandom(51);
        this.clouds = [];
        const n = Math.round((this.config.clouds ?? 3) * 18);
        for (let i = 0; i < n; i++) this.clouds.push({ x: random() * (W + 600 * cam.u) - 300 * cam.u, y: 10 * cam.u + random() * (cam.hor * 0.55), w: (90 + random() * 210) * cam.u, h: (10 + random() * 22) * cam.u, dx: (random() - 0.5) * 80 * cam.u, v: 0.6 + random() * 0.8 });
    }

    paintLost() {
        try {
            const g = this.probe ||= PaintedPlates.canvas(1, 1).getContext('2d', { willReadFrequently: true }), T = this.scene;
            g.clearRect(0, 0, 1, 1); g.drawImage(T.paint, T.pw >> 1, T.ph - 2, 1, 1, 0, 0, 1, 1);
            return g.getImageData(0, 0, 1, 1).data[3] === 0;
        } catch (e) { return false; }
    }

    // ---- Time and light ---------------------------------------------------------

    skyDate() {
        const mode = this.config.sky, now = this.host.now();
        if (mode === 'live') return now;
        if (mode === 'cycle') return new Date(this.cycleBase + this.time * 1000 * 86400 / (this.config.cycleMinutes * 60));
        const key = `${now.toDateString()}|${mode}|${this.config.moonPhase}`;
        if (key !== this.pinKey) {
            this.pinKey = key;
            // Dusk is the paintings' hour, and the torches': the sun gone, the peaks still alight.
            if (mode === 'dusk') { const set = HarvestSky.sunTimes(now).set, d = new Date(now.getFullYear(), now.getMonth(), now.getDate()); d.setMinutes(Math.round((set + 0.5) * 60)); this.pinDate = d; }
            else this.pinDate = HarvestSky.pinned(mode, now, this.pinAge());
        }
        return this.pinDate;
    }
    pinAge() { return { full: HarvestSky.SYNODIC / 2, gibbous: 11, half: 7.4, crescent: 3.5 }[this.config.moonPhase]; }

    updateSky() {
        const date = this.sky = this.skyDate();
        const b = HarvestSky.bodies(date, this.pinAge());
        this.sun = b.sun; this.moon = b.moon;
        if (!this.config.moon) this.moon.light = 0;
        this.light = PaintedLogic.light(this.sun.alt, this.moon.light);
        this.hour = this.config.sky === 'night' || this.config.sky === 'dusk' ? 19.5 : date.getHours() + date.getMinutes() / 60;
        const key = PaintedLogic.lightKey(this.light, 3) + '|' + Math.round(this.lightsOn() * 20);
        if (key !== this.lightKey) { this.lightKey = key; this.dirty = 'all'; this.tintSmoke = true; }
    }
    lightsOn() { return Math.min(1, this.light.dark * 2.5); }
    evening() { return this.hour < 12 ? this.hour + 24 : this.hour; }

    wantOf(g) {
        if (g.forced != null) return g.forced ? 1 : 0;
        const d = this.light.dark, h = this.evening(), cal = this.cal, late = cal.newYear || cal.christmas;
        switch (g.kind) {
            case 'window': return this.config.windows === false ? 0 : VillageLogic.windowLit(g.habit, this.hour, d, late) ? 1 : 0;
            // The inn keeps late hours; the floors above go to bed first. New Year's Eve, nobody does.
            case 'inn': return d > 0.12 && (late || h < (g.floor ? 23.4 : 24.5) || h >= 30) ? 1 : 0;
            case 'chapel': return d > 0.3 && (h < 21.5 || (cal.christmas && h < 25.5) || (cal.newYear && h < 24.6)) ? 1 : 0;
            case 'hut': return d > 0.25 || (this.cast?.proc && !this.cast.proc.done) ? 1 : 0;
            case 'porch': case 'lamp': return d > 0.3 ? 1 : 0;
            case 'tree': return this.lightsOn();
            default: return 0;
        }
    }

    updateGroups(dt) {
        const T = this.scene, h = T.ps / 2;
        for (const g of T.groups) {
            g.want = this.wantOf(g);
            if (g.level !== g.want) g.level += (g.want - g.level) * Math.min(1, dt * 2.6);
            if (Math.abs(g.level - g.want) < 0.01) g.level = g.want;
            if (Math.abs(g.level - g.shown) < 0.035 && !(g.level === g.want && g.shown !== g.want)) continue;
            g.shown = g.level;
            if (!g.patch && !g.glow) continue;
            let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
            if (g.patch) { x0 = g.bx / h; y0 = g.by / h; x1 = x0 + g.patch.width / h; y1 = y0 + g.patch.height / h; }
            if (g.glow) { x0 = Math.min(x0, g.gx / T.ps); y0 = Math.min(y0, g.gy / T.ps); x1 = Math.max(x1, (g.gx + g.glow.width * 2) / T.ps); y1 = Math.max(y1, (g.gy + g.glow.height * 2) / T.ps); }
            this.smudge([x0, y0, x1 - x0, y1 - y0]);
        }
    }
    smudge(r) {
        if (this.dirty === 'all') return;
        if (!this.dirty) { this.dirty = r.slice(); return; }
        const d = this.dirty, x0 = Math.min(d[0], r[0]), y0 = Math.min(d[1], r[1]), x1 = Math.max(d[0] + d[2], r[0] + r[2]), y1 = Math.max(d[1] + d[3], r[1] + r[3]);
        this.dirty = [x0, y0, x1 - x0, y1 - y0];
    }

    stepLight(now, force) {
        const T = this.scene;
        if (!T) return;
        if (this.painting && now - this.lastStep > 170) this.dirty = 'all';
        if (!this.dirty && now - this.lastSky > 5000 && this.clouds.length) this.dirty = [0, 0, this.W, this.cam.hor + 14];
        if (!this.dirty || (!force && now - this.lastStep < 70)) return;
        const rect = this.dirty === 'all' ? null : this.dirty;
        const on = this.lightsOn(), sets = { tree: on, trees: on, string: on, candle: this.light.dark > 0.3 ? 1 : 0 };
        T.step(this.light, (g, l) => this.drawSky(g, l), rect, { reflections: 0, sets, palette: this.palette() });
        this.dirty = null; this.lastStep = now; this.lastSky = now;
        this.steps = (this.steps || 0) + 1;
    }

    palette() {
        const sets = { classic: ['#ff3d2e', '#2fd05a', '#3f8cff', '#ffd23f', '#ff8a1e'], warm: ['#ffd28a', '#ffc46a', '#ffe0a8'], ice: ['#bfe4ff', '#8fc8ff', '#e8f6ff'] }, list = sets[this.config.treeColors] || sets.warm;
        const key = list.join(), hex = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
        if (key !== this.paletteKey) { this.paletteKey = key; this.paletteRGB = list.map(hex); }
        return this.paletteRGB;
    }

    // The sky, into the light plate at half strength: it is its own light.
    drawSky(g, l) {
        const { W } = this, cam = this.cam, u = cam.u, T = this.scene, bottom = cam.hor + 14;
        const css = PaintedPlates.css, mix = PaintedPlates.mixc;
        const gr = g.createLinearGradient(0, 0, 0, bottom);
        [[0, l.sky0], [0.3, l.sky1], [0.55, l.sky2], [0.78, l.sky3], [1, l.sky4]].forEach(([at, c]) => gr.addColorStop(at, css(c)));
        g.fillStyle = gr; g.fillRect(0, 0, W, bottom);
        const soft = (x, y, rx, ry, c, a) => { g.save(); g.translate(x, y); g.scale(1, ry / rx); const r = g.createRadialGradient(0, 0, 0, 0, 0, rx); r.addColorStop(0, css(c, a)); r.addColorStop(1, css(c, 0)); g.fillStyle = r; g.beginPath(); g.arc(0, 0, rx, 0, 6.2832); g.fill(); g.restore(); };
        const gx = T.glowAt.x, gy = T.glowAt.y;
        if (l.glowA > 0.01) { soft(gx, gy, 640 * u, 300 * u, l.glow, l.glowA); soft(gx, gy + 6 * u, 280 * u, 130 * u, l.glowIn, Math.min(1, l.glowA * 1.15)); }
        if (l.stars > 0.02) for (const s of this.stars) { g.globalAlpha = s.a * l.stars * (1 - 0.6 * s.y / cam.hor); g.fillStyle = s.c; g.beginPath(); g.arc(s.x, s.y, s.r, 0, 6.2832); g.fill(); }
        g.globalAlpha = 1;
        if (this.config.moon && this.moon.alt > -3) {
            const m = this.moon, R = 22 * u * (this.config.moonSize || 1), x = m.x * W, y = cam.hor - Math.min(60, m.alt) / 62 * (cam.hor - this.H * 0.06), up = PaintedLogic.smooth(-3, 3, m.alt), night = 0.45 + 0.55 * l.dark;
            soft(x, y, R * 7, R * 7, [0.62, 0.72, 1], 0.34 * m.illum * up * l.dark);
            g.save(); g.translate(x, y); g.globalAlpha = up * night;
            const waxing = m.phase < 0.5, k = Math.cos(m.phase * 6.2832);
            if (!waxing) g.scale(-1, 1);
            const disc = g.createRadialGradient(-R * 0.3, -R * 0.3, R * 0.1, 0, 0, R); disc.addColorStop(0, '#fffdf2'); disc.addColorStop(1, '#e8e4d6');
            g.fillStyle = disc; g.beginPath(); g.arc(0, 0, R, -Math.PI / 2, Math.PI / 2, false); g.ellipse(0, 0, Math.abs(k) * R, R, 0, Math.PI / 2, -Math.PI / 2, k > 0); g.fill();
            g.restore();
        }
        const drift = this.time * 2.2 * u * (0.4 + this.config.wind);
        for (const c of this.clouds) {
            const span = W + 600 * u, x = ((c.x + drift * c.v) % span + span) % span - 300 * u, near = Math.exp(-(((x - gx) / (W * 0.45)) ** 2));
            soft(x, c.y - c.h * 0.35, c.w, c.h, mix(l.cloudTop0, l.cloudTop1, near), 0.55);
            soft(x + c.dx, c.y + c.h * 0.45, c.w * 0.85, c.h * 0.65, mix(l.cloudLow0, l.cloudLow1, near), 0.4 + 0.4 * near);
        }
        g.globalCompositeOperation = 'multiply'; g.fillStyle = '#808080'; g.fillRect(0, 0, W, bottom); g.globalCompositeOperation = 'source-over';
    }

    // ---- Per frame ----------------------------------------------------------------

    frame(now) {
        if (!this.running) return;
        this.frameId = requestAnimationFrame(t => this.frame(t));
        if (!this.scene && !this.next) { this.last = 0; this.resize(); return; }
        const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
        this.last = now;
        if (this.rebuildAt && now >= this.rebuildAt) { this.rebuildAt = 0; this.rebuild(); }
        if (this.next) this.bakeSlice(Math.max(5, Math.min(14, 350 / (this.host.quality?.fps || 60))));
        if (!this.scene) return;
        this.update(dt);
        this.stepLight(now);
        this.draw();
    }

    chance(perHour, dt) { return Math.random() < perHour * dt / 3600; }

    update(dt) {
        const cfg = this.config;
        this.time += dt;
        this.cal = TorchLogic.calendar(this.host.now());
        this.updateSky();
        if (this.host.now().toDateString() !== this.day && !this.next) { for (const g of this.scene.groups) g.forced = null; this.rebuild(); }
        for (const k of Object.keys(this.fx)) this.fx[k] += Math.sign(this.fxTarget[k] - this.fx[k]) * Math.min(Math.abs(this.fxTarget[k] - this.fx[k]), dt * 0.6);
        this.gust = Math.max(0, this.gust - dt * 0.25);
        this.wind = cfg.wind * (0.5 + 0.5 * Math.sin(this.time * 0.13) + 0.3 * Math.sin(this.time * 0.41 + 1)) + this.gust * 2.4;
        if ((this.lostCheck = (this.lostCheck || 0) + dt) > 2 && !this.next) { this.lostCheck = 0; if (this.paintLost()) { this.recoveries = (this.recoveries || 0) + 1; console.warn('torchlight: the painting was lost; painting it again'); this.rebuild(true); return; } }
        this.updateGroups(dt);
        this.updateSnow(dt);
        this.updateSmoke(dt);
        if (this.cast) this.cast.update(dt);
    }

    flakeCount() { return Math.round(380 * this.config.snowfall * this.density() * Math.min(2.2, this.W * this.H / 1.3e6 + 0.35)); }
    updateSnow(dt) {
        const { W, H } = this, want = this.flakeCount(), u = this.cam.u, size = this.config.flakeSize;
        const make = top => { const d = Math.random(); return { x: Math.random() * (W + 200) - 100, y: top ? -10 : Math.random() * H, d, r: (0.6 + d * d * 2.4) * u * size, v: (26 + d * 60) * u, sway: Math.random() * 6.28, f: 0.6 + Math.random() }; };
        while (this.flakes.length < want) this.flakes.push(make(this.flakes.length > want * 0.2 && this.time > 0.5));
        if (this.flakes.length > want) this.flakes.length = Math.max(want, this.flakes.length - Math.ceil(dt * 60));
        for (const f of this.flakes) {
            f.y += f.v * dt; f.x += (this.wind * (22 + 46 * f.d) + Math.sin(this.time * f.f + f.sway) * 7) * u * dt;
            if (f.y > H + 6) Object.assign(f, make(true));
            if (f.x > W + 110) f.x -= W + 210; else if (f.x < -110) f.x += W + 210;
        }
    }

    seedSmoke() { if (this.config.smoke) for (let i = 0; i < 260; i++) this.updateSmoke(0.12); }
    updateSmoke(dt) {
        const T = this.scene;
        if (!this.config.smoke) { this.puffs.length = 0; return; }
        for (const s of T.smokes) {
            s.t = (s.t ?? Math.random()) + dt * 3.2;
            if (s.t >= 1 && this.puffs.length < 220 * this.density() + 40) { s.t = 0; this.puffs.push({ s, x: s.x, y: s.y, age: 0, life: 4.5 + Math.random() * 2.5, k: s.s / 40, wob: Math.random() * 6.28 }); }
        }
        for (let i = this.puffs.length - 1; i >= 0; i--) {
            const p = this.puffs[i];
            p.age += dt;
            const t = p.age / p.life;
            if (t >= 1) { this.puffs[i] = this.puffs[this.puffs.length - 1]; this.puffs.pop(); continue; }
            p.y -= (26 - 10 * t) * p.k * dt;
            p.x += (this.wind * 15 * (0.3 + t) + Math.sin(p.wob + p.age * 1.3) * 3) * p.k * dt;
        }
    }

    // ---- Drawing ------------------------------------------------------------------

    draw() {
        const { ctx, dpr } = this, T = this.scene, l = this.light, u = this.cam.u;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(T.lit, 0, 0, this.canvas.width, this.canvas.height);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (l.stars > 0.3 && T.openSky) {
            ctx.fillStyle = '#fff';
            for (let i = 0; i < T.openSky.length; i += 7) { const s = T.openSky[i], a = Math.sin(this.time * (1.2 + s.v * 2.4) + s.v * 40); if (a > 0.55) { ctx.globalAlpha = (a - 0.55) * 1.6 * l.stars; ctx.fillRect(s.x, s.y, 1.6 * u, 1.6 * u); } }
            ctx.globalAlpha = 1;
        }
        this.drawClock(ctx);
        if (this.cast) this.cast.draw(ctx);
        this.drawSmoke(ctx);
        this.drawTwinkle(ctx);
        if (this.cast) this.cast.drawOver(ctx);
        this.drawSnow(ctx);
    }

    // The chapel's clock keeps the real time.
    drawClock(ctx) {
        const c = this.scene.spots.clock;
        if (!c) return;
        const d = this.sky, h = (d.getHours() % 12 + d.getMinutes() / 60) / 12 * 6.2832, m = d.getMinutes() / 60 * 6.2832;
        ctx.strokeStyle = 'rgba(30,26,34,0.9)'; ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(1, c.r * 0.16); ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x + Math.sin(h) * c.r * 0.5, c.y - Math.cos(h) * c.r * 0.5); ctx.stroke();
        ctx.lineWidth = Math.max(0.8, c.r * 0.1); ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x + Math.sin(m) * c.r * 0.82, c.y - Math.cos(m) * c.r * 0.82); ctx.stroke();
    }

    smokeSprite() {
        if (!this.tintSmoke && this.smokeA) return;
        this.tintSmoke = false;
        const make = c => { const cv = PaintedPlates.canvas(48, 48), g = cv.getContext('2d'), gr = g.createRadialGradient(24, 24, 0, 24, 24, 24); gr.addColorStop(0, PaintedPlates.css(c, 0.5)); gr.addColorStop(1, PaintedPlates.css(c, 0)); g.fillStyle = gr; g.fillRect(0, 0, 48, 48); return cv; };
        this.smokeA = make(this.light.smoke0); this.smokeB = make(this.light.smoke1);
    }
    drawSmoke(ctx) {
        if (!this.puffs.length) return;
        this.smokeSprite();
        const gx = this.scene.glowAt.x, W = this.W;
        for (const p of this.puffs) {
            const t = p.age / p.life, r = (5 + 26 * t) * p.k, near = Math.exp(-(((p.x - gx) / (W * 0.3)) ** 2));
            ctx.globalAlpha = Math.min(1, t * 6) * (1 - t) ** 1.2 * 0.9;
            ctx.drawImage(near > 0.5 ? this.smokeB : this.smokeA, p.x - r, p.y - r, r * 2, r * 2);
        }
        ctx.globalAlpha = 1;
    }
    drawTwinkle(ctx) {
        const T = this.scene, on = this.lightsOn();
        if (on < 0.05 || !T.bulbs.length) return;
        const pal = this.palette();
        ctx.globalCompositeOperation = 'lighter';
        for (const b of T.bulbs) {
            if (b.set === 'candle') continue;
            const a = Math.sin(this.time * 1.6 * (1.4 + b.phase * 2.2) + b.phase * 40);
            if (a < 0.72) continue;
            const c = pal[b.i % pal.length];
            ctx.globalAlpha = (a - 0.72) * 3 * on; ctx.fillStyle = `rgb(${c[0] * 255 | 0},${c[1] * 255 | 0},${c[2] * 255 | 0})`;
            ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 2.6, 0, 6.2832); ctx.fill();
        }
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    drawSnow(ctx) {
        if (!this.flakes.length) return;
        ctx.fillStyle = '#fff';
        ctx.globalAlpha = 0.55; ctx.beginPath();
        for (const f of this.flakes) if (f.d < 0.5) ctx.rect(f.x, f.y, f.r * 1.7, f.r * 1.7);
        ctx.fill();
        ctx.globalAlpha = 0.82; ctx.beginPath();
        for (const f of this.flakes) if (f.d >= 0.5) { ctx.moveTo(f.x + f.r, f.y); ctx.arc(f.x, f.y, f.r, 0, 6.2832); }
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    // ---- Taps and keys ---------------------------------------------------------------

    tapAt(x, y) {
        const T = this.scene;
        if (!T) return;
        if (this.cast && this.cast.tap(x, y)) return;
        for (let i = T.hits.length - 1; i >= 0; i--) {
            const h = T.hits[i];
            if (x < h.x0 || x > h.x1 || y < h.y0 || y > h.y1) continue;
            const groups = h.groups || (h.group ? [h.group] : []);
            if (h.kind === 'hut') { this.descend(); return; }
            if (!groups.length) continue;
            const lit = groups.some(g => g.level > 0.5);
            for (const g of groups) g.forced = !lit;
            return;
        }
        // The mountain: send them down; the night sky: a rocket.
        const sl = T.spots.slope;
        if (sl && x > sl[0] && x < sl[2] && y > sl[1] && y < sl[3] && !this.inSky(x, y)) { this.descend(); return; }
        if (y < this.cam.hor * 0.9 && this.light.dark > 0.4 && this.config.fireworks !== 'never' && this.cast) this.cast.rocket(x, y);
    }
    // Whether (x, y) is open sky (above the mountain's outline there).
    inSky(x, y) {
        const o = this.L.outline;
        if (!o) return y < this.cam.hor;
        for (let i = 0; i < o.length - 1; i++) if (x >= o[i][0] && x <= o[i + 1][0]) return y < o[i][1] + (o[i + 1][1] - o[i][1]) * (x - o[i][0]) / (o[i + 1][0] - o[i][0]);
        return y < this.cam.hor;
    }

    descend() {
        if (!this.cast) return null;
        if (this.cast.proc && !this.cast.proc.done) return '🔥 They are on their way down';
        this.cast.start();
        return this.light.dark > 0.3 ? '🔥 Torches lit: here they come' : '🔥 Torches lit (they are brighter after dark)';
    }
    rockets() { if (!this.cast) return null; this.cast.volley(6); return '🎆 Fireworks'; }
    spellYear() { return this.cast ? this.cast.spell() : null; }
    groom() { const c = this.cast?.snowcat; if (!c) return '🚜 The snowcat is not out tonight'; if (c.state === 'parked') { c.t = 0; c.state = 'out'; c.s = this.scene.track.pts[Math.max(0, this.scene.track.faceEnd)].m + 4; c.dir = 1; return '🚜 Out to groom the run'; } c.state = 'home'; return '🚜 Back to the shed'; }
    flurry() { this.gust = 1; return '🌬️ A flurry'; }
    repaint() { this.scene = null; this.rebuild(); return '🖌️ Painting it again'; }
    report() {
        const d = this.sky, pad = n => String(n).padStart(2, '0'), cal = this.cal, p = this.cast?.proc;
        const when = cal.newYear ? 'New Year’s Eve' : cal.christmas ? 'Christmas' : HarvestSky.moonTitle(d, this.moon.age);
        const doing = p && !p.done ? (p.phase === 'gather' ? 'torches being lit at the hut' : p.phase === 'down' ? `${p.sk.filter(k => k.state === 'ski').length} torches on the mountain` : 'torches planted at the bottom') : 'nobody on the mountain';
        return `🕯️ ${d.getHours()}:${pad(d.getMinutes())} · ${when} · ${doing}`;
    }
}
