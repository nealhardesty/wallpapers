// The Reading Room: a vast university library at the hour it really is,
// painted (SPEC §10.44). We stand at the south end of the hall and look
// down it: three tiers of galleries, iron rails, books to the vault, rolling
// ladders, long tables under green lamps, low bookcases down the middle,
// busts and globes, a fire, the great clock over the far door, and a
// coffered vault with a skylight in every bay. The real sun comes in
// through the real windows (ReadingLogic) and its shafts swing across the
// floor through the day, dust turning in
// them; the lamps come on table by table at dusk; at night it is
// lamplight, moonlight and the fire. And cats, of course: one asleep in
// the sun who follows it as it moves, one on a gallery rail with a book
// she means to push off, one riding a ladder, a kitten after a pen, and
// others where it is warm.
//
// Painted Village's machinery paints it: the hall is filled into plates
// (reading-art.js), brushed by painted-bake.js in slices, and lit by its
// arithmetic, with two hooks of ours: the sun's patches on the floor and
// the walls go into the light before the sky's, and the shafts in the air
// over the lit picture. A frame is one blit and the cast (reading-cast.js).

class ReadingRoomAnimationManager {
    constructor(host) {
        this.host = host;
        this.config = WP.settings.load();
        this.running = false;
        this.listeners = [];
        this.time = 0;
        this.pointerType = 'mouse';
        this.scene = null;
        this.next = null;
        this.light = null;
        this.lightKey = '';
        this.sun = { alt: -20, x: 0.5 };
        this.moon = { alt: 30, x: 0.5, age: 10, phase: 0.3, illum: 0.5, light: 0 };
        this.dirty = null;
        this.lastStep = 0;
        this.beamKey = '';
        this.motes = [];
        this.outside = [];
        this.clouds = [];
        this.stars = [];
        this.bakes = 0;
        this.fx = { motes: 1, shafts: 1 };
    }

    // ---- Lifecycle ------------------------------------------------------------

    start() {
        if (this.running) return;
        this.running = true;
        const canvas = this.canvas = document.createElement('canvas');
        canvas.id = 'reading-room-canvas';
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

    // Live changes from the panel: what is in the painting means painting it again (the old one stays up meanwhile).
    applySettings(config) {
        const old = this.config;
        this.config = config;
        if (!this.running) return;
        const changed = keys => keys.some(k => JSON.stringify(old[k]) !== JSON.stringify(config[k]));
        if (changed(['tables', 'fireplace', 'chandeliers', 'desk', 'shades', 'decorations', 'tree', 'brush'])) { this.rebuildAt = performance.now() + 300; return; }
        if (changed(['time', 'season', 'cycleMinutes'])) { this.pinKey = null; this.cycleBase = this.host.now().getTime() - this.time * 1000 * 86400 / (config.cycleMinutes * 60); this.beamKey = ''; }
        if (changed(['clouds'])) this.buildClouds();
        if (changed(['sunbeams', 'beamStrength', 'moonbeams'])) this.beamKey = '';
        for (const g of this.scene?.groups || []) g.forced = null;
        if (this.cast) this.cast.settings(old, config);
        this.dirty = 'all';
    }

    onQuality() { this.syncEffects(false); if (this.cast) this.cast.trim(); this.beamKey = ''; }
    syncEffects(now) {
        const on = name => this.host.quality?.effects?.includes(name) ?? true;
        this.fxTarget = { motes: on('dust') ? 1 : 0, shafts: on('shafts') ? 1 : 0 };
        if (now) this.fx = { ...this.fxTarget };
    }
    density() { return this.host.quality?.density ?? 1; }

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

    rebuild(lost) {
        if (!this.running || !(this.W >= 16)) return;
        if (lost) this.scene = null;
        const { W, H } = this, config = { ...this.config, date: this.host.now() }, q = this.host.quality || {}, tier = q.tier || 'high';
        const cam = ReadingLogic.camera(W, H, this.bottom);
        const L = ReadingLogic.layout(cam, config);
        cam.bands = L.bandsD.map(D => cam.z(D));
        L.bands = cam.bands;
        const full = W * H * this.dpr * this.dpr, cap = { low: 0.8e6, medium: 1.4e6, high: 2.5e6 }[tier] || 2.5e6, k = Math.sqrt(Math.min(full, cap) / (W * H));
        const pw = Math.round(W * k / 2) * 2, ph = Math.round(H * k / 2) * 2;
        const [gx, gy] = cam.p(0, L.glow.y, L.glow.D);
        const P = new PaintedPlates.Plates(cam, pw, ph, Math.round(W * 7 + H * 13) + 20261124, { x: gx, y: gy });
        ReadingArt.compose(P, L, config);
        const gen = PaintedBake.bake(P, { seed: Math.round(W + H * 3), brush: config.brush, passes: tier === 'low' ? 4 : tier === 'medium' ? 5 : 6, ridge: tier !== 'low', weave: tier !== 'low', air: 26 });
        const T = gen.next().value;
        T.windows = P.windows; T.shelves = P.shelves;
        this.next = { gen, T, P, L, cam };
        this.day = this.host.now().toDateString();
        this.bakes++;
        if (!this.scene) { while (T.progress < 0.04 && !gen.next().done); this.show(); }
    }

    show() {
        const n = this.next;
        this.scene = n.T; this.L = n.L; this.cam = n.cam;
        // The glass, as one path, for the weather outside and the sky.
        this.glass = new Path2D();
        for (const w of this.scene.windows) { const p = w.pts; this.glass.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) this.glass.lineTo(p[i][0], p[i][1]); this.glass.closePath(); }
        this.sunC = PaintedPlates.canvas(this.scene.hw, this.scene.hh);
        this.rayC = PaintedPlates.canvas(this.scene.hw, this.scene.hh);
        this.beamKey = '';
        this.buildClouds(); this.buildStars();
        this.updateSky();
        this.order();
        for (const g of this.scene.groups) { g.level = g.want = this.wantOf(g); g.shown = -1; }
        this.cast = typeof ReadingCast === 'function' ? new ReadingCast(this) : null;
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
        if (done) { this.next = null; this.painting = false; this.dirty = 'all'; this.beamKey = ''; }
    }

    // Which table's lamps come on first at dusk: from the door at the far end toward us, as if someone walked down
    // lighting them; each with a moment of its own.
    order() {
        const tables = this.scene.groups.filter(g => g.kind === 'table' || g.kind === 'case').sort((a, b) => b.k - a.k || (a.side || 0) - (b.side || 0));
        tables.forEach((g, i) => { g.turn = 0.14 + 0.32 * i / Math.max(1, tables.length - 1); });
    }

    buildStars() { const random = WP.seededRandom(88); this.stars = []; for (let i = 0; i < 260; i++) this.stars.push({ x: random() * this.W, y: random() * this.cam.hor, r: (0.5 + random()) * this.cam.u, a: 0.4 + random() * 0.6 }); }
    buildClouds() { const random = WP.seededRandom(51), u = this.cam.u; this.clouds = []; for (let i = 0; i < Math.round((this.config.clouds ?? 4) * 10); i++) this.clouds.push({ x: random() * (this.W + 600 * u) - 300 * u, y: random() * this.cam.hor, w: (60 + random() * 160) * u, h: (12 + random() * 20) * u, v: 0.5 + random() }); }

    paintLost() {
        try {
            const g = this.probe ||= PaintedPlates.canvas(1, 1).getContext('2d', { willReadFrequently: true }), T = this.scene;
            g.clearRect(0, 0, 1, 1); g.drawImage(T.paint, T.pw >> 1, T.ph - 2, 1, 1, 0, 0, 1, 1);
            return g.getImageData(0, 0, 1, 1).data[3] === 0;
        } catch (e) { return false; }
    }

    // ---- Time and light ---------------------------------------------------------

    skyDate() {
        const mode = this.config.time, now = ReadingLogic.seasonDate(this.config.season, this.host.now());
        if (mode === 'live') return now;
        if (mode === 'cycle') return ReadingLogic.seasonDate(this.config.season, new Date(this.cycleBase + this.time * 1000 * 86400 / (this.config.cycleMinutes * 60)));
        const key = `${now.toDateString()}|${mode}`;
        if (key !== this.pinKey) {
            this.pinKey = key;
            const { rise, set } = HarvestSky.sunTimes(now), d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const hour = { morning: Math.max(rise + 2.2, 9.4), afternoon: Math.min(set - 1.6, 14.9), dusk: set + 0.32, night: 21.6 }[mode] ?? 12;
            d.setMinutes(Math.round(hour * 60));
            this.pinDate = d;
        }
        return this.pinDate;
    }

    updateSky() {
        const date = this.sky = this.skyDate();
        const b = HarvestSky.bodies(date);
        this.sun = b.sun; this.moon = b.moon;
        this.hour = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
        this.season = this.config.season === 'live' ? ReadingLogic.seasonOf(date) : this.config.season;
        const sky = PaintedLogic.light(this.sun.alt, this.moon.light);
        this.light = ReadingLogic.roomLight(sky, this.sun.alt, this.moon.light);
        const key = ReadingLogic.lightKey(this.light, 3);
        if (key !== this.lightKey) { this.lightKey = key; this.dirty = 'all'; }
        // The shafts: where they fall moves with the sun, slowly; they are worked out again when it has moved a little.
        const s = ReadingLogic.sunDir(date), m = ReadingLogic.moonDir(date, this.moon.age);
        this.sunV = s; this.moonV = m;
        const night = this.light.dark > 0.6, use = !night ? s : m, bk = [Math.round(use.x * 500), Math.round(use.y * 500), Math.round(use.z * 500), night ? 'm' : 's', Math.round(this.moon.light * 20)].join();
        if (bk !== this.beamKey && this.scene) { this.beamKey = bk; this.buildBeams(night ? m : s, night); }
    }

    // How much the sun (or, at night, the moon) is shining in, and in what colour.
    beamColour() {
        const cfg = this.config, k = cfg.beamStrength ?? 1;
        if (this.beamNight) return cfg.moonbeams === false ? null : [0.32 * k * this.moon.light, 0.42 * k * this.moon.light, 0.7 * k * this.moon.light];
        if (!cfg.sunbeams) return null;
        const alt = this.sun.alt, warm = ReadingLogic.smooth(22, 2, alt), up = ReadingLogic.smooth(0, 6, alt);
        return [1.05 * k * up, (0.9 - 0.2 * warm) * k * up, (0.68 - 0.36 * warm) * k * up];
    }

    // The patches of sun on the floor and the bookcases, and the shafts in the air, as half-size greys.
    buildBeams(s, night) {
        const T = this.scene, cam = this.cam, h = T.ps / 2, RL = ReadingLogic;
        this.beamNight = night;
        const wanted = night ? this.config.moonbeams !== false : this.config.sunbeams;
        this.beams = wanted && s && s.y > 0.02 ? RL.beams(s) : [];
        this.spots = night ? [] : RL.sunSpots(this.beams);
        const sc = this.sunC.getContext('2d'), rc = this.rayC.getContext('2d');
        for (const c of [sc, rc]) { c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, T.hw, T.hh); c.fillStyle = '#000'; c.fillRect(0, 0, T.hw, T.hh); c.setTransform(h, 0, 0, h, 0, 0); }
        this.shafts = [];
        const proj = p => cam.p(p[0], p[1], Math.max(0.6, p[2]));
        const nearOf = poly => Math.min(...poly.map(p => p[2]));
        const cut = (c, D) => { const k = PaintedLogic.bandOf(cam.z(D), T.cam.bands), mask = k >= 0 ? T.masks[k] : null; if (!mask) return; c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'destination-out'; c.drawImage(mask, 0, 0); c.restore(); };
        const layer = PaintedPlates.canvas(T.hw, T.hh), lc = layer.getContext('2d');
        // Patches near to far are each cut by whatever stands nearer than they lie.
        const list = this.beams.flatMap(b => [b.floor && { poly: b.floor, k: b.k }, b.wall && { poly: b.wall, k: b.k }].filter(Boolean)).sort((a, b) => nearOf(b.poly) - nearOf(a.poly));
        for (const p of list) {
            lc.setTransform(1, 0, 0, 1, 0, 0); lc.clearRect(0, 0, T.hw, T.hh); lc.setTransform(h, 0, 0, h, 0, 0);
            lc.fillStyle = `rgba(255,255,255,${Math.min(1, p.k)})`; lc.beginPath(); PaintedPlates.poly(lc, p.poly.map(proj)); lc.fill();
            cut(lc, nearOf(p.poly));
            sc.save(); sc.setTransform(1, 0, 0, 1, 0, 0); sc.globalCompositeOperation = 'lighter'; sc.drawImage(layer, 0, 0); sc.restore();
        }
        // The shafts: from the glass (or where it comes past us) to where it lands, brightest at the glass.
        const strong = (this.config.shafts ?? 1) * (night ? 0.6 : 1);
        if (strong > 0) for (const b of this.beams) {
            const pts = RL.shaft(b, s), w = b.window;
            if (!pts) continue;
            const sp = pts.map(proj), hull = RL.hull(sp);
            if (hull.length < 3) continue;
            const top = sp.slice(0, w.pts.length), land = sp.slice(w.pts.length), cx = q => q.reduce((a, p) => a + p[0], 0) / q.length, cy = q => q.reduce((a, p) => a + p[1], 0) / q.length;
            lc.setTransform(1, 0, 0, 1, 0, 0); lc.clearRect(0, 0, T.hw, T.hh); lc.setTransform(h, 0, 0, h, 0, 0);
            const gr = lc.createLinearGradient(cx(top), cy(top), cx(land), cy(land)), a = Math.min(1, b.k) * 0.16 * strong;
            gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.55, `rgba(255,255,255,${a * 0.55})`); gr.addColorStop(1, `rgba(255,255,255,${a * 0.18})`);
            lc.fillStyle = gr; lc.beginPath(); PaintedPlates.poly(lc, hull); lc.fill();
            cut(lc, Math.max(2, Math.min(...pts.map(p => p[2]))));
            rc.save(); rc.setTransform(1, 0, 0, 1, 0, 0); rc.globalCompositeOperation = 'lighter'; rc.drawImage(layer, 0, 0); rc.restore();
            this.shafts.push({ hull, k: b.k, top: [cx(top), cy(top)], land: [cx(land), cy(land)] });
        }
        // Soft at the edges, as light is, without ctx.filter.
        for (const [cv, f] of [[this.sunC, 3], [this.rayC, 6]]) {
            const small = PaintedPlates.canvas(T.hw / f, T.hh / f), g = small.getContext('2d'), c = cv.getContext('2d');
            g.imageSmoothingQuality = 'high'; g.drawImage(cv, 0, 0, small.width, small.height);
            c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'copy'; c.imageSmoothingQuality = 'high'; c.globalAlpha = 1; c.drawImage(small, 0, 0, T.hw, T.hh);
            c.globalCompositeOperation = 'source-over';
        }
        this.buildMotes();
        if (this.cast) this.cast.sunMoved();
        this.dirty = 'all';
    }

    // Dust in the shafts: points inside each shaft's outline, more where it is brighter.
    buildMotes() {
        const want = Math.round(170 * (this.config.dust ?? 1) * this.density() * (this.beamNight ? 0.3 : 1)), random = Math.random;
        this.motes = [];
        if (!this.shafts.length || want <= 0) return;
        const total = this.shafts.reduce((a, s) => a + s.k, 0);
        for (const s of this.shafts) {
            const n = Math.round(want * s.k / total), xs = s.hull.map(p => p[0]), ys = s.hull.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
            for (let i = 0, tries = 0; i < n && tries < n * 20; tries++) {
                const x = x0 + random() * (x1 - x0), y = y0 + random() * (y1 - y0);
                if (x < 0 || x > this.W || y < 0 || y > this.H || !ReadingLogic.inside(s.hull, x, y, 0, 1)) continue;
                this.motes.push({ x, y, s, ph: random() * 6.28, sp: 0.2 + random() * 0.6, r: (0.6 + random() * 1.1) * this.cam.u, dx: (random() - 0.5) * 18 * this.cam.u, dy: (random() - 0.5) * 12 * this.cam.u }); i++;
            }
        }
    }

    // The light's hook: the patches of sun go into the light before the sky's.
    sunLight(T, c, t, l) {
        const col = this.beamColour();
        if (!col || col[0] + col[1] + col[2] < 0.02) return;
        t.globalCompositeOperation = 'copy'; t.fillStyle = `rgb(${Math.min(255, col[0] * 128) | 0},${Math.min(255, col[1] * 128) | 0},${Math.min(255, col[2] * 128) | 0})`; t.fillRect(0, 0, T.hw, T.hh);
        t.globalCompositeOperation = 'multiply'; t.drawImage(this.sunC, 0, 0);
        c.globalCompositeOperation = 'lighter'; c.drawImage(T.tmp, 0, 0);
    }
    // And over the lit picture: the shafts in the air.
    shaftsOver(T, g, l) {
        const col = this.beamColour();
        if (!col || this.fx.shafts < 0.02 || col[0] + col[1] + col[2] < 0.02) return;
        const t = T.tmp.getContext('2d');
        t.save(); t.setTransform(1, 0, 0, 1, 0, 0);
        t.globalCompositeOperation = 'copy'; t.fillStyle = `rgb(${Math.min(255, col[0] * 230) | 0},${Math.min(255, col[1] * 230) | 0},${Math.min(255, col[2] * 230) | 0})`; t.fillRect(0, 0, T.hw, T.hh);
        t.globalCompositeOperation = 'multiply'; t.drawImage(this.rayC, 0, 0);
        t.restore();
        g.globalCompositeOperation = 'screen'; g.globalAlpha = this.fx.shafts; g.imageSmoothingQuality = 'high'; g.drawImage(T.tmp, 0, 0, T.hw, T.hh, 0, 0, T.pw, T.ph);
    }

    // Whether a group of lights should be on.
    wantOf(g) {
        if (g.forced != null) return g.forced ? 1 : 0;
        const d = this.light.dark, cfg = this.config;
        switch (g.kind) {
            // At dusk: as the librarian lights them, if she is about; else each by itself as it gets darker.
            case 'table': case 'case': return cfg.lamps === 'never' ? 0 : cfg.lamps === 'always' ? 1 : g.lit != null ? (g.lit ? 1 : 0) : cfg.librarian && this.cast?.librarian ? 0 : d > g.turn ? 1 : 0;
            case 'desk': return cfg.lamps === 'never' ? 0 : d > 0.05 || cfg.lamps === 'always' || this.cast?.atDesk() ? 1 : 0;
            case 'chandelier': return d > 0.45 && this.hour > 12 || d > 0.45 && this.hour < 7 ? 1 : 0;
            case 'fire': return cfg.fire && (d > 0.04 || this.season !== 'summer') ? 1 : 0;
            case 'tree': return 1;
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
        if (!this.dirty && now - this.lastStep > 6000 && this.clouds.length) this.dirty = 'all';
        if (!this.dirty || (!force && now - this.lastStep < 70)) return;
        const rect = this.dirty === 'all' ? null : this.dirty, xmas = this.L.tree || ReadingLogic.christmas(this.config.decorations, this.host.now());
        const sets = { tree: xmas ? 1 : 0, string: xmas ? 1 : 0, candle: this.scene.groups.some(g => g.kind === 'chandelier' && g.level > 0.5) ? 1 : 0 };
        T.step(this.light, (g, l) => this.drawSky(g, l), rect, { sets, palette: this.palette(), light: (P, c, t, l) => this.sunLight(P, c, t, l), after: (P, g, l) => this.shaftsOver(P, g, l) });
        this.dirty = null; this.lastStep = now;
        this.steps = (this.steps || 0) + 1;
    }

    palette() {
        if (!this.paletteRGB) this.paletteRGB = [[1, 0.24, 0.18], [0.18, 0.82, 0.35], [0.25, 0.55, 1], [1, 0.82, 0.25], [1, 0.54, 0.12]];
        return this.paletteRGB;
    }

    // The sky through the glass, at half strength, as Painted Village keeps every light.
    drawSky(g, l) {
        const { W } = this, cam = this.cam, u = cam.u, css = PaintedPlates.css, mix = PaintedPlates.mixc, bottom = cam.hor + 40 * u;
        const gr = g.createLinearGradient(0, 0, 0, bottom);
        [[0, l.sky0], [0.3, l.sky1], [0.55, l.sky2], [0.78, l.sky3], [1, l.sky4]].forEach(([at, c]) => gr.addColorStop(at, css(c)));
        g.fillStyle = gr; g.fillRect(0, 0, W, this.H);
        if (l.stars > 0.02) { for (const s of this.stars) { g.globalAlpha = s.a * l.stars; g.fillStyle = '#fff'; g.fillRect(s.x, s.y, s.r, s.r); } g.globalAlpha = 1; }
        const drift = this.time * 3 * u;
        for (const c of this.clouds) {
            const span = W + 600 * u, x = ((c.x + drift * c.v) % span + span) % span - 300 * u;
            g.save(); g.translate(x, c.y); g.scale(1, c.h / c.w);
            const r = g.createRadialGradient(0, 0, 0, 0, 0, c.w); r.addColorStop(0, css(mix(l.cloudTop1, l.cloudLow1, 0.5), 0.5)); r.addColorStop(1, css(l.cloudTop1, 0));
            g.fillStyle = r; g.beginPath(); g.arc(0, 0, c.w, 0, 6.2832); g.fill(); g.restore();
        }
        // Frost in the bottom of the panes in winter.
        if (this.season === 'winter') for (const w of this.scene.windows) {
            const ys = w.pts.map(p => p[1]), xs = w.pts.map(p => p[0]), y1 = Math.max(...ys), y0 = Math.min(...ys), x0 = Math.min(...xs), x1 = Math.max(...xs), hh = (y1 - y0) * 0.35;
            const f = g.createLinearGradient(0, y1, 0, y1 - hh); f.addColorStop(0, 'rgba(240,246,255,0.55)'); f.addColorStop(1, 'rgba(240,246,255,0)');
            g.fillStyle = f; g.fillRect(x0, y1 - hh, x1 - x0, hh);
        }
        g.globalCompositeOperation = 'multiply'; g.fillStyle = '#808080'; g.fillRect(0, 0, W, this.H); g.globalCompositeOperation = 'source-over';
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

    update(dt) {
        this.time += dt;
        this.updateSky();
        if (this.host.now().toDateString() !== this.day && !this.next) { for (const g of this.scene.groups) g.forced = null; this.rebuild(); }
        for (const k of Object.keys(this.fx)) this.fx[k] += Math.sign(this.fxTarget[k] - this.fx[k]) * Math.min(Math.abs(this.fxTarget[k] - this.fx[k]), dt * 0.6);
        if ((this.lostCheck = (this.lostCheck || 0) + dt) > 2 && !this.next) { this.lostCheck = 0; if (this.paintLost()) { this.recoveries = (this.recoveries || 0) + 1; console.warn('reading-room: the painting was lost; painting it again'); this.rebuild(true); return; } }
        this.updateGroups(dt);
        this.updateOutside(dt);
        if (this.cast) this.cast.update(dt);
    }

    // The weather outside the glass: snow in winter, leaves in autumn, petals in spring, swifts in summer; or rain.
    weather() { const w = this.config.weather; return w && w !== 'season' ? w : { winter: 'snow', autumn: 'leaves', spring: 'petals', summer: 'swifts' }[this.season] || 'clear'; }
    updateOutside(dt) {
        const kind = this.weather(), want = kind === 'clear' ? 0 : Math.round((kind === 'swifts' ? 8 : kind === 'rain' ? 220 : 130) * this.density() * (this.config.outside ?? 1)), u = this.cam.u, W = this.W;
        if (this.outsideKind !== kind) { this.outsideKind = kind; this.outside = []; }
        const make = top => ({ x: Math.random() * W, y: top ? -10 : Math.random() * this.cam.hor * 1.2, v: (kind === 'rain' ? 420 : kind === 'swifts' ? 90 : 26 + Math.random() * 30) * u, r: (0.8 + Math.random() * 1.6) * u, ph: Math.random() * 6.28, d: Math.random() < 0.5 ? -1 : 1 });
        while (this.outside.length < want) this.outside.push(make(false));
        if (this.outside.length > want) this.outside.length = want;
        for (const f of this.outside) {
            if (kind === 'swifts') { f.x += f.d * f.v * dt; f.y += Math.sin(this.time * 2 + f.ph) * 20 * u * dt; if (f.x < -40 || f.x > W + 40) { f.x = f.d > 0 ? -30 : W + 30; f.y = Math.random() * this.cam.hor; } continue; }
            f.y += f.v * dt; f.x += (kind === 'rain' ? -60 : Math.sin(this.time * 0.9 + f.ph) * 24 + 10) * u * dt;
            if (f.y > this.cam.hor * 1.2) Object.assign(f, make(true));
            if (f.x < -20) f.x += W + 40; else if (f.x > W + 20) f.x -= W + 40;
        }
    }

    draw() {
        const { ctx, dpr } = this, T = this.scene;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(T.lit, 0, 0, this.canvas.width, this.canvas.height);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.drawOutside(ctx);
        this.drawClock(ctx);
        if (this.cast) this.cast.draw(ctx);
        this.drawMotes(ctx);
        this.drawTwinkle(ctx);
        if (this.cast) this.cast.drawOver(ctx);
    }

    drawOutside(ctx) {
        if (!this.outside.length || !this.glass) return;
        const kind = this.outsideKind, l = this.light, lum = 0.35 + 0.65 * Math.min(1, (l.sky2[0] + l.sky2[1] + l.sky2[2]) / 1.6);
        ctx.save(); ctx.clip(this.glass);
        ctx.globalAlpha = 0.85;
        if (kind === 'snow') { ctx.fillStyle = `rgba(255,255,255,${0.5 + 0.5 * lum})`; ctx.beginPath(); for (const f of this.outside) { ctx.moveTo(f.x + f.r, f.y); ctx.arc(f.x, f.y, f.r, 0, 6.2832); } ctx.fill(); }
        else if (kind === 'rain') { ctx.strokeStyle = `rgba(200,214,236,${0.25 + 0.3 * lum})`; ctx.lineWidth = 0.8 * this.cam.u; ctx.beginPath(); for (const f of this.outside) { ctx.moveTo(f.x, f.y); ctx.lineTo(f.x - 3 * this.cam.u, f.y + 12 * this.cam.u); } ctx.stroke(); }
        else if (kind === 'leaves' || kind === 'petals') {
            for (const f of this.outside) { ctx.fillStyle = kind === 'petals' ? `rgba(255,${200 + (f.ph * 8 | 0)},220,0.85)` : ['#c8642a', '#d89a2a', '#a8402a', '#e0b040'][Math.floor(f.ph) % 4]; ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r * 1.8, f.r * 0.9, this.time * 2 + f.ph, 0, 6.2832); ctx.fill(); }
        } else if (kind === 'swifts') {
            ctx.strokeStyle = `rgba(30,30,40,${0.5 + 0.3 * lum})`; ctx.lineWidth = 1.2 * this.cam.u; ctx.beginPath();
            for (const f of this.outside) { const w = 5 * this.cam.u, flap = Math.sin(this.time * 14 + f.ph) * 2 * this.cam.u; ctx.moveTo(f.x - w, f.y - flap); ctx.quadraticCurveTo(f.x - w * 0.3, f.y, f.x, f.y + 1); ctx.quadraticCurveTo(f.x + w * 0.3, f.y, f.x + w, f.y - flap); }
            ctx.stroke();
        }
        ctx.restore();
        ctx.globalAlpha = 1;
    }

    // The great clock keeps the real time.
    drawClock(ctx) {
        const c = this.scene.spots.clock;
        if (!c) return;
        const d = this.sky, h = (d.getHours() % 12 + d.getMinutes() / 60) / 12 * 6.2832, m = (d.getMinutes() + d.getSeconds() / 60) / 60 * 6.2832;
        const lit = 0.35 + 0.65 * Math.min(1, this.light.amb[0] * 1.8 + this.light.dark * 0.5);
        ctx.strokeStyle = `rgba(24,20,22,${0.6 + 0.3 * lit})`; ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(1, c.r * 0.12); ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x + Math.sin(h) * c.r * 0.5, c.y - Math.cos(h) * c.r * 0.5); ctx.stroke();
        ctx.lineWidth = Math.max(0.8, c.r * 0.07); ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x + Math.sin(m) * c.r * 0.8, c.y - Math.cos(m) * c.r * 0.8); ctx.stroke();
        if (this.cast?.chime > 0) { const t = 1 - this.cast.chime % 1; ctx.strokeStyle = `rgba(255,236,190,${0.5 * (1 - t)})`; ctx.lineWidth = 1.5 * this.cam.u; ctx.beginPath(); ctx.arc(c.x, c.y, c.r * (1.1 + t * 1.6), 0, 6.2832); ctx.stroke(); }
    }

    drawMotes(ctx) {
        if (!this.motes.length || this.fx.motes < 0.02) return;
        const col = this.beamColour();
        if (!col || col[0] < 0.05) return;
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgb(${Math.min(255, col[0] * 255) | 0},${Math.min(255, col[1] * 245) | 0},${Math.min(255, col[2] * 220) | 0})`;
        for (const m of this.motes) {
            const t = this.time * m.sp + m.ph, glint = Math.max(0, Math.sin(t * 1.7)) ** 3;
            ctx.globalAlpha = (0.15 + 0.75 * glint) * this.fx.motes * Math.min(1, m.s.k);
            ctx.fillRect(m.x + Math.sin(t * 0.4) * m.dx, m.y + Math.sin(t * 0.31 + 1) * m.dy - (t % 40) * 0.15, m.r, m.r);
        }
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }

    drawTwinkle(ctx) {
        const T = this.scene;
        if (!T.bulbs.length) return;
        const pal = this.palette(), jingle = this.cast ? this.cast.jingle : 0;
        ctx.globalCompositeOperation = 'lighter';
        for (const b of T.bulbs) {
            if (b.set === 'candle') {
                if (!this.scene.groups.some(g => g.kind === 'chandelier' && g.level > 0.5)) continue;
                const a = 0.5 + 0.5 * Math.sin(this.time * 9 + b.phase * 30) * Math.sin(this.time * 5.3 + b.phase * 11);
                ctx.globalAlpha = 0.35 * a; ctx.fillStyle = '#ffd890'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 2.2, 0, 6.2832); ctx.fill();
                continue;
            }
            const a = jingle > 0 && b.set === 'tree' ? 0.72 + 0.28 * Math.sin(this.time * 16 + b.phase * 40) : Math.sin(this.time * (1.4 + b.phase * 2.2) + b.phase * 40);
            if (a < 0.72) continue;
            const c = pal[b.i % pal.length];
            ctx.globalAlpha = (a - 0.72) * 3; ctx.fillStyle = `rgb(${c[0] * 255 | 0},${c[1] * 255 | 0},${c[2] * 255 | 0})`;
            ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 2.6, 0, 6.2832); ctx.fill();
        }
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }

    // ---- Taps and keys ---------------------------------------------------------------

    tapAt(x, y) {
        const T = this.scene;
        if (!T) return;
        if (this.cast && this.cast.tap(x, y)) return;
        for (let i = T.hits.length - 1; i >= 0; i--) {
            const h = T.hits[i];
            if (x < h.x0 || x > h.x1 || y < h.y0 || y > h.y1) continue;
            if (h.kind === 'clock') { if (this.cast) this.cast.strike(true); return; }
            if (h.kind === 'tree') { if (this.cast) this.cast.jingle = 1.6; return; }
            if (h.kind === 'shelf') { if (this.cast) this.cast.pull(h, x, y); return; }
            if (h.kind === 'catalogue') { if (this.cast) this.cast.mouse(); return; }
            if (h.kind === 'window') { if (this.cast) this.cast.bird(x, y); return; }
            if (h.kind === 'globe') { this.host.toast?.(this.globeWord()); return; }
            if (h.kind === 'lectern') { this.host.toast?.(this.wordOfTheDay()); return; }
            if (h.kind === 'armillary') { this.host.toast?.(this.sunWord()); return; }
            if (h.kind === 'vitrine') { this.host.toast?.(['🔒 The Founder’s own catalogue: every cat in the library, with notes', '🔒 A book of hours, open at a page of cats in the margins', '🔒 Please do not tap the glass. (The cats do.)'][Math.floor(Math.random() * 3)]); return; }
            const groups = h.groups || (h.group ? [h.group] : []);
            if (!groups.length) continue;
            const lit = groups.some(g => g.level > 0.5);
            for (const g of groups) g.forced = !lit;
            return;
        }
    }
    // The great dictionary on its lectern, open at the day's word.
    wordOfTheDay() {
        const words = ReadingRoomAnimationManager.WORDS, d = this.host.now(), n = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
        const [w, m] = words[((n % words.length) + words.length) % words.length];
        return `📖 ${w}: ${m}`;
    }
    // The armillary sphere: where the real sun stands.
    sunWord() {
        const s = this.sunV, alt = this.sun.alt;
        if (alt < -6) return '🌙 The sun is below the world; the sphere keeps its place for the morning';
        const az = (Math.atan2(s.x, s.z) * 180 / Math.PI + 360) % 360, dirs = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
        return `☀️ The sun stands ${Math.round(alt)}° up in the ${dirs[Math.round(az / 45) % 8]}`;
    }
    globeWord() { return ['🌍 Somewhere, it is teatime', '🌏 Here be dragons', '🌎 The cats have marked their favourite places', '🌍 It turns, slowly'][Math.floor(Math.random() * 4)]; }

    callCat() { return this.cast ? this.cast.callCat() : null; }
    callPlane() { return this.cast ? this.cast.callPlane() : null; }
    callOwl() { return this.cast ? this.cast.callOwl() : null; }
    callLibrarian() { return this.cast ? this.cast.callLibrarian() : null; }
    callBook() { return this.cast ? this.cast.callBook() : null; }
    repaint() { this.scene = null; this.rebuild(); return '🖌️ Painting it again'; }
    report() {
        const d = this.sky, pad = n => String(n).padStart(2, '0'), s = this.sun.alt;
        const when = s > 30 ? 'the sun is high' : s > 5 ? 'the sun is in at the windows' : s > -6 ? 'the light is going' : 'the lamps are lit';
        return `🕰️ ${d.getHours()}:${pad(d.getMinutes())} in the Reading Room · ${when} · ${this.cast ? this.cast.census() : ''}`;
    }
}
// The great dictionary's words of the day: real words, about books and reading.
ReadingRoomAnimationManager.WORDS = [
    ['Bibliosmia', 'the smell of old books'], ['Tsundoku', 'buying books and letting them pile up unread'], ['Marginalia', 'notes in the margins (and a cat of that name)'],
    ['Colophon', 'the printer’s note at the end of a book'], ['Incunabula', 'books printed before 1501'], ['Palimpsest', 'a page written over, the old words still showing'],
    ['Foxing', 'the brown spots that come on old paper'], ['Quire', 'a gathering of sheets folded together'], ['Vellum', 'fine parchment, of calfskin'],
    ['Lucubration', 'study by lamplight, late into the night'], ['Bibliophile', 'one who loves books'], ['Rubric', 'a heading written in red'],
    ['Folio', 'a sheet folded once: a big book'], ['Octavo', 'a sheet folded three times: a pocket book'], ['Errata', 'a list of mistakes, found too late'],
    ['Florilegium', 'a gathering of the best passages'], ['Scriptorium', 'the room where books were copied by hand'], ['Book-louse', 'a tiny insect that eats paste and paper'],
];
