// Harvest Valley: a calm, cosy autumn valley for the Thanksgiving season.
// A village with smoking chimneys and a windmill, patchwork farmland and
// corn, a pumpkin patch (the most sincere of them), an apple orchard whose
// apples fall and are carried off by squirrels, turkeys and sleepy cats
// about the meadow, geese in a V overhead, leaves on the wind, the real sun
// by day and the real moon, in its real phase, by night. Every part of it
// has a switch (settings.js), so it can be a bare moon over a dark field.
//
// Cheap by design (SPEC §4.8):
//   - the land (hills, farmland, village, corn, patch, meadow) is one baked
//     layer per resize; trees, leaves, apples and geese are baked sprites
//   - the scene is drawn at full daylight colour onto a "world" canvas and
//     washed once with the light of the hour (a source-atop fill), so one
//     set of art serves dawn, noon, dusk and night; the sky, geese and glows
//     are drawn on the main canvas around it
//   - leaves, apples, smoke and sparks are pooled arrays bounded by the tier
//   - mist and sunbeams are declared effects the tier can shed
//
// The sky is computed, not drawn from a script: harvest-sky.js knows where
// the sun and moon are for the date and hour (host.now(), so ?date= works).

class HarvestAnimationManager {
    constructor(host) {
        this.host = host;
        this.config = WP.settings.load();
        this.running = false;
        this.listeners = [];
        this.time = 0;
        this.wind = 1;
        this.windPush = 0;
        this.gust = 0;
        this.pointer = { x: 0, y: 0, active: false, speed: 0, type: 'mouse' };
        this.apples = [];
        this.leafPool = [];
        this.puffs = [];
        this.sparks = [];
        this.squirrels = [];
        this.turkeys = [];
        this.cats = [];
        this.catSpots = [];
        this.trees = [];
        this.drops = [];
        this.clouds = [];
        this.sprites = { apples: [], leaves: [], trees: [] };
        this.fx = { mist: 1, beams: 1 };
        this.light = HarvestSky.light(30, 0);
        this.sun = { alt: 30, x: 0.5 };
        this.moon = { alt: -30, x: 0.5, age: 10, phase: 0.3, illum: 0.5, light: 0 };
        this.holiday = null;
        this.den = null;
        this.doorGlow = 0;
        this.stashed = 0;
        this.shooting = null;
        this.shootIn = 20;
        this.millAngle = 0;
        this.moonCache = {};
        this.toneKey = { cloud: '', geese: '' };
    }

    // ---- Lifecycle ----------------------------------------------------------------------

    start() {
        if (this.running) return;
        this.running = true;
        const canvas = this.canvas = document.createElement('canvas');
        canvas.id = 'harvest-canvas';
        Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: '-1', pointerEvents: 'none' });
        document.body.appendChild(canvas);
        this.ctx = canvas.getContext('2d');
        this.world = document.createElement('canvas');
        this.wg = this.world.getContext('2d');
        this.cycleBase = this.host.now().getTime();
        this.holiday = HarvestSky.holiday(this.host.now());
        this.syncEffects(true);
        this.resize();
        this.seed();
        this.listen();
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
        this.canvas = this.ctx = this.world = this.wg = null;
    }

    listen() {
        const on = (target, type, fn) => {
            target.addEventListener(type, fn, { passive: true });
            this.listeners.push(() => target.removeEventListener(type, fn));
        };
        on(window, 'resize', () => this.resize());
        let lx = 0, ly = 0, lt = 0;
        on(document, 'pointermove', e => {
            const p = this.pointer, now = performance.now();
            p.type = e.pointerType;
            p.active = e.pointerType === 'mouse';
            if (lt) p.speed = Math.hypot(e.clientX - lx, e.clientY - ly) / Math.max(0.008, (now - lt) / 1000);
            p.x = lx = e.clientX; p.y = ly = e.clientY; lt = now;
        });
        on(document, 'pointerdown', e => { this.pointer.type = e.pointerType; });
        on(document, 'pointerleave', () => { this.pointer.active = false; });
        this.listeners.push(this.host.gestures({
            tap: (x, y) => { if (this.pointer.type === 'mouse' || this.config.touch) this.tapAt(x, y); },
        }));
    }

    // Live changes from the panel. Anything that's baked into the land or
    // the cast is rebuilt; the rest simply takes effect.
    applySettings(config) {
        const old = this.config;
        this.config = config;
        if (!this.running) return;
        const changed = keys => keys.some(k => old[k] !== config[k]);
        if (changed(['village', 'houses', 'windmill', 'fields', 'pumpkinPatch', 'horizon', 'foliage', 'autumnColors', 'orchard', 'trees', 'treeSize'])) {
            this.resize();
            this.seed();
        } else {
            if (changed(['squirrels', 'turkeys', 'cats', 'wind'])) this.buildCast();
            if (changed(['clouds'])) this.buildClouds();
            if (changed(['sky', 'moonPhase', 'cycleMinutes'])) { this.pinKey = null; this.cycleBase = this.host.now().getTime() - this.time * 1000 * 86400 / (config.cycleMinutes * 60); this.moonCache = {}; }
            if (changed(['moonSize'])) this.moonCache = {};
            if (changed(['stars'])) this.buildStars();
        }
    }

    onQuality() { this.syncEffects(false); }

    syncEffects(now) {
        const on = name => this.host.quality?.effects?.includes(name) ?? true;
        this.fxTarget = { mist: on('mist') ? 1 : 0, beams: on('beams') ? 1 : 0 };
        if (now) this.fx = { ...this.fxTarget };
    }

    density() { return this.host.quality?.density ?? 1; }

    // ---- Layout and baking ------------------------------------------------------------------

    resize() {
        if (!this.canvas) return;
        const dpr = this.dpr = window.devicePixelRatio || 1;
        const W = this.W = window.innerWidth, H = this.H = window.innerHeight;
        for (const c of [this.canvas, this.world]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
        const bottom = this.host.insets?.bottom || 0;
        const random = WP.seededRandom(Math.round(W * 3 + H * 17));
        const L = this.L = HarvestArt.layout(W, H, bottom, this.config, random);
        this.u = L.u;
        this.meadowMin = L.Hu * 0.745;
        this.meadowMax = L.Hu * 0.975;
        this.land = HarvestArt.land(L, this.config, dpr, random);
        this.bakeSprites(random);
        this.buildOrchard(random);
        this.buildStars();
        this.buildMist(random);
        this.buildClouds();
        this.buildCast();
        this.flocks = this.flocks || new HarvestFlocks(this);
        this.flocks.m = this;
        this.flocks.flocks = [];
        this.great = new HarvestGreatPumpkin(this);
        this.scarecrow = new HarvestScarecrow(this);
        this.toneKey = { cloud: '', geese: '' };
    }

    bakeSprites(random) {
        const { dpr, u, L } = this, foliage = HarvestArt.palette(this.config);
        const treeH = L.Hu * 0.26 * this.config.treeSize;
        this.sprites.trees = [0, 1, 2, 3].map(() => HarvestArt.tree(treeH, dpr, foliage, random));
        this.sprites.apples = ['#c8322a', '#d8402e', '#b8302c', '#c8a030'].map(c => HarvestArt.apple(14 * u, dpr, c));
        this.sprites.leaves = [];
        for (const colour of foliage.concat(['#8a4a22'])) for (let shape = 0; shape < 3; shape++) this.sprites.leaves.push(HarvestArt.leaf(shape, colour, 15 * u, dpr));
        this.sprites.smoke = HarvestArt.blob(40 * u, dpr, [214, 208, 200], 0.9);
        this.sprites.warm = HarvestArt.blob(64, dpr, [255, 190, 100], 1, [[0, 1], [0.25, 0.5], [1, 0]]);
        this.sprites.sun = HarvestArt.blob(128, dpr, [255, 220, 150], 1, [[0, 0.9], [0.12, 0.6], [0.4, 0.14], [1, 0]]);
        this.sprites.halo = HarvestArt.blob(128, dpr, [196, 214, 255], 1, [[0, 0.5], [0.2, 0.28], [0.5, 0.07], [1, 0]]);
        this.sprites.mist = HarvestArt.mistBand(Math.round(400 * u), Math.round(60 * u), dpr);
        this.sprites.great = HarvestArt.greatPumpkin(64 * u, dpr);
        this.sprites.spark = HarvestArt.blob(16, dpr, [255, 200, 110], 1, [[0, 1], [0.3, 0.55], [1, 0]]);
    }

    // The orchard: three rows in perspective, kept off the road and out of
    // the way of the pumpkins and corn; the den tree (with its small door)
    // is a front-row tree on the left when there is one.
    buildOrchard(random) {
        const { L, config } = this;
        this.trees = [];
        this.den = null;
        if (!config.orchard) return;
        const treeH = L.Hu * 0.26 * config.treeSize, found = [];
        const rows = [{ y: 0.77, s: 0.55, row: 0 }, { y: 0.865, s: 0.78, row: 1 }, { y: 0.96, s: 1, row: 2 }];
        for (const r of rows) {
            const w = treeH * 0.95 * r.s, spacing = w * 0.98, baseY = r.y * L.Hu;
            const road = L.road(baseY);
            for (let x = -w * 0.2 + random() * spacing * 0.5; x < L.W + w * 0.2; x += spacing * (0.92 + random() * 0.3)) {
                if (Math.abs(x - road.x) < road.w / 2 + w * 0.36) continue;
                if (config.pumpkinPatch && r.row === 2 && Math.abs(x - L.sincere.x) < w * 0.62) continue;
                if (r.row < 2 && ((x > L.patch.x0 - w * 0.3 && x < L.patch.x1 + w * 0.3) || (x > L.corn.x0 - w * 0.3 && x < L.corn.x1 + w * 0.3))) continue;
                found.push({ x, y: baseY + (random() - 0.5) * L.Hu * 0.02, s: r.s, row: r.row, variant: Math.floor(random() * this.sprites.trees.length), phase: random() * 6, shake: 0, hang: [] });
            }
        }
        // Keep the nearest rows first, if there are more than the setting.
        found.sort((a, b) => b.row - a.row || random() - 0.5);
        this.trees = found.slice(0, config.trees);
        const dens = this.trees.filter(t => t.row === 2 && t.x < L.W * 0.5);
        this.den = dens.length ? dens[0] : this.trees.filter(t => t.row === 2)[0] || this.trees[0] || null;
        this.trees.sort((a, b) => a.y - b.y);
        for (const t of this.trees) {
            const sprite = this.sprites.trees[t.variant], c = sprite.canopy, n = 6 + Math.floor(random() * 6);
            for (let i = 0; i < n; i++) {
                const a = random() * Math.PI * 2, rr = Math.sqrt(random()) * 0.82;
                t.hang.push({ lx: c.cx + Math.cos(a) * rr * c.rx, ly: c.cy + Math.sin(a) * rr * c.ry * 0.9 + c.ry * 0.12, ripe: 0.6 + random() * 0.4, regrow: 0, kind: Math.floor(random() * 4) });
            }
        }
        this.treeH = treeH;
    }

    denDoor() {
        const t = this.den;
        return t ? { x: t.x + this.treeH * 0.05 * t.s, y: t.y + 2 * this.u * t.s } : null;
    }

    stash() { this.doorGlow = 1; }

    depth(y) {
        return Math.min(1.15, Math.max(0.42, 0.55 + 0.45 * (y - this.L.Hu * 0.76) / (this.L.Hu * 0.19)));
    }

    randomMeadow() {
        return { x: this.W * (0.05 + Math.random() * 0.9), y: this.meadowMin + Math.random() * (this.meadowMax - this.meadowMin) };
    }

    buildStars() {
        const { c, g } = HarvestArt.canvas(this.W, this.L.hz + 6, this.dpr);
        const random = WP.seededRandom(Math.round(this.W + this.L.hz * 5)), hz = this.L.hz, W = this.W;
        this.twinkle = [];
        if (this.config.stars) {
            // A faint band of the galaxy, slanting.
            g.save();
            g.translate(W * 0.55, hz * 0.4);
            g.rotate(-0.45);
            const band = g.createLinearGradient(0, -hz * 0.2, 0, hz * 0.2);
            band.addColorStop(0, 'rgba(160,150,210,0)');
            band.addColorStop(0.5, 'rgba(160,150,210,0.09)');
            band.addColorStop(1, 'rgba(160,150,210,0)');
            g.fillStyle = band;
            g.fillRect(-W, -hz * 0.2, W * 2, hz * 0.4);
            g.restore();
            const n = Math.round(W * hz / 2300);
            for (let i = 0; i < n; i++) {
                const y = hz * Math.pow(random(), 1.4) * 0.97, x = random() * W, a = (0.25 + random() * 0.7) * (1 - y / hz * 0.7);
                const big = random() < 0.07, tint = random() < 0.2 ? '255,214,170' : random() < 0.4 ? '190,210,255' : '255,250,240';
                g.fillStyle = `rgba(${tint},${a})`;
                g.fillRect(x, y, big ? 1.8 : 1, big ? 1.8 : 1);
                if (big && this.twinkle.length < 40) this.twinkle.push({ x, y, phase: random() * 6, rate: 1 + random() * 2 });
            }
        }
        this.starLayer = c;
    }

    buildMist(random) {
        const { L, u } = this;
        this.mist = Array.from({ length: 6 }, (_, i) => ({
            x: random() * L.W, y: L.hz + L.Hu * (0.01 + 0.15 * i / 5 + 0.03 * random()),
            scale: 0.8 + random() * 1.6, speed: (3 + random() * 6) * u * (i % 2 ? 1 : -1), a: 0.5 + random() * 0.5,
        }));
    }

    buildClouds() {
        const random = WP.seededRandom(Math.round(this.W * 11 + 5)), n = Math.round(this.config.clouds * (0.45 + 0.55 * this.density()));
        this.clouds = Array.from({ length: n }, () => ({
            x: random() * (this.W + 400 * this.u) - 200 * this.u,
            y: this.L.hz * (0.06 + random() * 0.5),
            scale: 0.5 + random() * 0.9, speed: (3 + random() * 7) * this.u, kind: Math.floor(random() * 4),
        }));
        this.toneKey.cloud = '';
    }

    // The cast: squirrels, turkeys and cats, each placed in its own corner.
    buildCast() {
        const { config } = this, d = this.density();
        this.squirrels = []; this.turkeys = []; this.cats = [];
        if (config.orchard && this.trees.length) {
            const n = Math.max(config.squirrels ? 1 : 0, Math.round(config.squirrels * (0.5 + 0.5 * d)));
            for (let i = 0; i < n; i++) { const p = this.randomMeadow(); this.squirrels.push(new HarvestSquirrel(this, p.x, p.y)); }
        }
        const turkeys = Math.round(config.turkeys * (0.6 + 0.4 * d));
        for (let i = 0; i < turkeys; i++) { const p = this.randomMeadow(); this.turkeys.push(new HarvestTurkey(this, p.x, p.y)); }
        this.buildCatSpots();
        const spots = this.catSpots.slice().sort(() => Math.random() - 0.5);
        for (let i = 0; i < config.cats && spots.length; i++) {
            const spot = spots[i % spots.length], coat = HARVEST_COATS[Math.floor(Math.random() * HARVEST_COATS.length)];
            const cat = new HarvestCat(this, spot, coat, 0.55 + Math.random() * 0.4);
            if (spot.roof || spot.fixed) { cat.state = Math.random() < 0.8 ? 'sleep' : 'loaf'; cat.fixedSpot = true; }
            this.cats.push(cat);
        }
    }

    buildCatSpots() {
        const { L, u, config } = this, spots = [];
        if (config.village) {
            for (const h of L.houses) {
                if (h.kind !== 'cottage') continue;
                const ru = h.w / 80, top = h.base - h.h * 0.58, rise = h.h * 0.5, f = 0.5 + Math.random() * 0.2;
                spots.push({ x: h.x + h.w * 0.6 * f, y: top - rise + (rise + 2 * ru) * f, s: 0.5, roof: true, fixed: true });
                spots.push({ x: h.x + (Math.random() < 0.5 ? -1 : 1) * h.w * 0.62, y: h.base + 4 * ru, s: 0.55 });
            }
            spots.push({ x: L.fire.x + 26 * u, y: L.fire.y + 6 * u, s: 0.6, fire: true });
        }
        if (config.fields) spots.push({ x: L.corn.x1 - 30 * u, y: L.corn.y1 + 9 * u - 15 * u, s: 0.7, fixed: true });
        if (config.pumpkinPatch) spots.push({ x: L.patch.x0 + (L.patch.x1 - L.patch.x0) * 0.2, y: L.patch.y1 - 4 * u, s: 0.7 }, { x: L.sincere.x + 22 * u, y: L.sincere.y + 6 * u, s: 0.75 });
        for (const t of this.trees) spots.push({ x: t.x + (Math.random() - 0.5) * this.treeH * 0.4 * t.s, y: t.y + this.L.Hu * 0.016, s: this.depth(t.y) });
        if (!spots.length) spots.push({ x: L.W * 0.4, y: L.Hu * 0.9, s: 0.9 });
        this.catSpots = spots;
    }

    // ---- The first frame ---------------------------------------------------------------------

    // Look alive at once: some apples already down, leaves in the air, smoke
    // rising, a flock part-way across the sky.
    seed() {
        this.apples = []; this.leafPool = []; this.puffs = []; this.sparks = []; this.drops = [];
        for (const t of this.trees) for (const h of t.hang) h.ripe = 0.6 + Math.random() * 0.4;
        for (let i = 0; i < Math.round(this.trees.length * 1.2); i++) {
            const t = this.trees[Math.floor(Math.random() * this.trees.length)];
            if (t) this.dropApple(t, null, true);
        }
        const n = this.leafCap() * 0.8;
        for (let i = 0; i < n; i++) this.spawnLeaf(true);
        for (let i = 0; i < 70; i++) this.update(0.1, true);
        if (this.config.geese > 0) this.flocks.spawn(0.15 + Math.random() * 0.5);
        this.time = 0;
    }

    // ---- Time and sky -------------------------------------------------------------------------

    skyDate() {
        const mode = this.config.sky, now = this.host.now();
        if (mode === 'live') return now;
        if (mode === 'cycle') return new Date(this.cycleBase + this.time * 1000 * 86400 / (this.config.cycleMinutes * 60));
        const key = `${now.toDateString()}|${mode}|${this.config.moonPhase}`;
        if (key !== this.pinKey) { this.pinKey = key; this.pinDate = HarvestSky.pinned(mode, now, this.pinAge()); }
        return this.pinDate;
    }

    pinAge() { return { full: HarvestSky.SYNODIC / 2, gibbous: 11, half: 7.4, crescent: 3.5 }[this.config.moonPhase]; }

    updateSky() {
        const date = this.skyDate();
        const b = HarvestSky.bodies(date, this.pinAge());
        this.sky = date;
        this.sun = b.sun;
        this.moon = b.moon;
        if (!this.config.moon) this.moon.light = 0;
        this.light = HarvestSky.light(this.sun.alt, this.moon.light);
    }

    // On-screen position for a body at an altitude: up to 62° tops the sky.
    altY(alt) { return this.L.hz - alt / 62 * (this.L.hz - this.H * 0.07); }

    // ---- Per-frame update ----------------------------------------------------------------------

    frame(now) {
        if (!this.running) return;
        const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
        this.last = now;
        this.update(dt);
        this.draw();
        this.frameId = requestAnimationFrame(t => this.frame(t));
    }

    leafCap() { return Math.round(this.config.leaves * this.density()); }

    update(dt, quiet) {
        const { config, u, L } = this;
        this.time += dt;
        const t = this.time;
        // Wind: a steady breeze that swells and eases, and gusts on top.
        this.gust = Math.max(0, this.gust - dt * 0.35);
        if (Math.random() < dt / 22) this.gust = Math.max(this.gust, 0.8 + Math.random() * 0.8);
        this.wind = config.wind * (0.65 + 0.25 * Math.sin(t * 0.13) + 0.15 * Math.sin(t * 0.37 + 1)) * (1 + this.gust);
        this.windPush = Math.min(1, this.wind * 0.8) * Math.sign(Math.sin(t * 0.021 + 0.7) + 0.4);
        this.updateSky();
        const k = harvestEase(0.9, dt);
        for (const name of ['mist', 'beams']) this.fx[name] += (this.fxTarget[name] - this.fx[name]) * k;
        this.millAngle += (0.25 + this.wind * 0.9) * dt;
        this.doorGlow = Math.max(0, this.doorGlow - dt * 0.4);

        for (const c of this.clouds) {
            c.x += c.speed * (0.4 + this.wind * 0.7) * dt * (this.windPush >= 0 ? 1 : -0.5);
            if (c.x > this.W + 220 * u) c.x = -440 * u;
            if (c.x < -450 * u) c.x = this.W + 200 * u;
        }
        for (const m of this.mist) { m.x += m.speed * (0.5 + this.wind * 0.5) * dt; if (m.x > L.W + 250 * u) m.x = -250 * u; if (m.x < -250 * u) m.x = L.W + 250 * u; }
        if (config.geese > 0) this.flocks.update(dt);
        this.updateTrees(dt);
        this.updateApples(dt);
        this.updateLeaves(dt);
        for (const s of this.squirrels) s.update(dt);
        for (const s of this.turkeys) s.update(dt);
        for (const s of this.cats) s.update(dt);
        if (config.scarecrow && config.fields) this.scarecrow.update(dt);
        this.great.update(dt);
        this.updateSmoke(dt);
        this.updateFire(dt);
        this.updateShooting(dt);
        if (!quiet) this.greet();
    }

    // A word to the person who just opened it: the holiday, or a notable moon.
    greet() {
        if (this.greeted || this.time < 3 || !this.config.callouts) return;
        this.greeted = true;
        const date = this.host.now(), day = date.toDateString();
        let text = null;
        if (this.holiday === 'day') text = '🦃 Happy Thanksgiving!';
        else if (this.light.dark > 0.5 || this.moon.alt > 0) {
            const title = HarvestSky.moonTitle(this.sky, this.moon.age);
            if (/Moon$/.test(title) && this.moon.illum > 0.97 && this.config.moon) text = `🌕 The ${title}`;
        }
        if (!text || this.host.storage.get('greeted') === day + text) return;
        this.host.storage.set('greeted', day + text);
        this.host.toast(text, 5000);
    }

    updateTrees(dt) {
        for (const t of this.trees) {
            t.shake = Math.max(0, t.shake - dt * 0.9);
            for (const h of t.hang) {
                if (h.ripe < 1) { h.regrow -= dt; if (h.regrow <= 0 && h.ripe >= 0) h.ripe = Math.min(1, h.ripe + dt / 40); }
            }
        }
        // Apples shaken loose by the breeze and the gusts.
        const rate = this.config.apples * this.density() / 60 * (1 + this.gust * 2);
        if (this.trees.length && Math.random() < rate * dt) this.dropApple(this.trees[Math.floor(Math.random() * this.trees.length)]);
        for (let i = this.drops.length - 1; i >= 0; i--) {
            if (this.drops[i].at <= this.time) { this.dropApple(this.drops[i].tree); this.drops.splice(i, 1); }
        }
    }

    // An apple lets go: of a particular hanging one, or any ripe one.
    dropApple(tree, hang, landed) {
        if (this.apples.length > 130) return;
        const list = tree.hang.filter(h => h.ripe >= 0.55);
        const h = hang || list[Math.floor(Math.random() * list.length)];
        if (!h) return;
        const s = tree.s, up = -h.ly * s, groundY = tree.y + this.L.Hu * (0.006 + Math.random() * 0.03);
        h.ripe = 0.001;
        h.regrow = 15 + Math.random() * 40;
        const a = { x: tree.x + h.lx * s, y: groundY, h: landed ? 0 : up, vh: 0, vx: (Math.random() - 0.5) * 20 * this.u, kind: h.kind, state: landed ? 'rest' : 'fall', age: 0, bounces: 0, claimed: false, carried: null, spin: Math.random() * 6, fade: 1 };
        if (landed) { a.x += (Math.random() - 0.5) * 60 * this.u; a.age = Math.random() * 30; }
        this.apples.push(a);
        if (!landed) for (let i = 0; i < 2; i++) this.spawnLeaf(false, tree);
    }

    updateApples(dt) {
        const g = 900 * this.u;
        let resting = 0;
        for (const a of this.apples) {
            a.age += dt;
            if (a.state === 'fall') {
                a.vh -= g * dt;
                a.h += a.vh * dt;
                a.x += a.vx * dt;
                if (a.h <= 0) {
                    a.h = 0;
                    if (a.bounces >= 2 || Math.abs(a.vh) < 70 * this.u) { a.state = 'rest'; a.vh = 0; }
                    else { a.vh = -a.vh * 0.38; a.vx *= 0.7; a.bounces++; }
                }
            } else if (a.state === 'rest') {
                resting++;
                if (Math.abs(a.vx) > 1) { a.x += a.vx * dt; a.vx *= Math.exp(-3.2 * dt); }
                if (a.age > 75 && !a.claimed) a.fade -= dt / 3;
            }
        }
        if (resting > 60) { const old = this.apples.find(a => a.state === 'rest' && !a.claimed); if (old) old.fade = Math.min(old.fade, 0.99), old.age = Math.max(old.age, 76); }
        this.apples = this.apples.filter(a => a.state !== 'gone' && a.fade > 0);
    }

    spawnLeaf(seed, tree) {
        if (this.leafPool.length >= Math.max(1, this.leafCap()) + (tree ? 8 : 0)) return;
        const { L, u, W } = this;
        let x, y, ground;
        const from = tree || (this.trees.length && Math.random() < 0.8 ? this.trees[Math.floor(Math.random() * this.trees.length)] : null);
        if (from) {
            const c = this.sprites.trees[from.variant].canopy, s = from.s;
            x = from.x + (c.cx + (Math.random() - 0.5) * c.rx * 1.8) * s;
            y = from.y + (c.cy + (Math.random() - 0.3) * c.ry * 1.4) * s;
            ground = from.y + L.Hu * (Math.random() * 0.045);
        } else {
            x = Math.random() * W; y = -10 * u;
            ground = L.Hu * (0.7 + Math.random() * 0.28);
        }
        if (seed) y = from ? y + (ground - y) * Math.random() : Math.random() * ground;
        this.leafPool.push({
            x, y, ground, kind: Math.floor(Math.random() * this.sprites.leaves.length),
            fall: (24 + Math.random() * 26) * u, drift: (0.5 + Math.random()) * u, ang: Math.random() * 6.3, spin: (Math.random() - 0.5) * 3,
            flutter: Math.random() * 6.3, rate: 1.5 + Math.random() * 2.2, size: 0.8 + Math.random() * 0.5, rest: 0, down: false,
        });
    }

    updateLeaves(dt) {
        const u = this.u, cap = this.leafCap();
        // Spawn: the setting's count over a leaf's usual few seconds in the air.
        if (cap > 0 && this.leafPool.length < cap && Math.random() < dt * cap / 9 * (1 + this.gust * 2)) this.spawnLeaf(false);
        for (const l of this.leafPool) {
            if (l.down) { l.rest += dt; continue; }
            l.flutter += l.rate * dt;
            l.ang += l.spin * dt * (0.5 + Math.abs(Math.sin(l.flutter)));
            l.y += l.fall * (0.6 + 0.4 * Math.abs(Math.cos(l.flutter * 0.5))) * dt;
            l.x += (this.windPush * this.wind * 38 * u * l.drift + Math.sin(l.flutter) * 22 * u * l.drift) * dt;
            if (l.y >= l.ground) { l.y = l.ground; l.down = true; }
        }
        this.leafPool = this.leafPool.filter(l => l.rest < 7 && l.x > -60 * u && l.x < this.W + 60 * u);
    }

    updateSmoke(dt) {
        const { L, u, config } = this;
        if (config.village && config.smoke) {
            const chimneys = L.chimneys;
            chimneys.forEach((c, i) => {
                if (i % 3 === 2) return;               // some chimneys are cold
                if (Math.random() < dt * 0.9 * this.density() * (1 + this.light.dark * 0.6) && this.puffs.length < 140) {
                    this.puffs.push({ x: c.x, y: c.y, age: 0, life: 5 + Math.random() * 3.5, size: (0.6 + Math.random() * 0.4) * c.s * 5, vx: (Math.random() - 0.5) * 2 * u });
                }
            });
        }
        for (const p of this.puffs) {
            p.age += dt;
            p.y -= (11 + p.age * 2) * u * dt;
            p.x += (this.windPush * this.wind * 15 * u * (0.4 + p.age * 0.35) + p.vx) * dt;
        }
        this.puffs = this.puffs.filter(p => p.age < p.life);
    }

    updateFire(dt) {
        const { L, u } = this;
        const lit = this.config.village && this.config.bonfire ? this.light.dark : 0;
        if (lit > 0.1 && Math.random() < dt * 14 * lit * this.density() && this.sparks.length < 50) {
            this.sparks.push({ x: L.fire.x + (Math.random() - 0.5) * 8 * u, y: L.fire.y - 4 * u, vx: (Math.random() - 0.5) * 10 * u + this.windPush * 6 * u, vy: -(18 + Math.random() * 30) * u, age: 0, life: 1 + Math.random() * 1.6 });
        }
        for (const s of this.sparks) { s.age += dt; s.x += (s.vx + Math.sin(s.age * 9 + s.vy) * 6 * u) * dt; s.y += s.vy * dt; s.vy *= Math.exp(-0.5 * dt); }
        this.sparks = this.sparks.filter(s => s.age < s.life);
    }

    updateShooting(dt) {
        if (this.shooting) {
            const s = this.shooting;
            s.age += dt;
            if (s.age > s.life) this.shooting = null;
            return;
        }
        if (!this.config.stars || this.light.stars < 0.6) return;
        this.shootIn -= dt;
        if (this.shootIn <= 0) {
            this.shootIn = 25 + Math.random() * 50;
            const dir = Math.random() < 0.5 ? 1 : -1;
            this.shooting = { x: this.W * (0.2 + Math.random() * 0.6), y: this.L.hz * (0.05 + Math.random() * 0.3), vx: dir * (500 + Math.random() * 300) * this.u, vy: (150 + Math.random() * 120) * this.u, age: 0, life: 0.9 };
        }
    }

    // ---- Input -----------------------------------------------------------------------------------

    // A tap: the nearest apple tree shakes; a tap on the scarecrow scares the
    // crow; a tap in the empty sky calls a flock of geese.
    tapAt(x, y) {
        const { L } = this;
        if (this.config.scarecrow && this.config.fields && Math.hypot(x - L.scarecrow.x, y - (L.scarecrow.y - 40 * this.u)) < 40 * this.u) { this.scarecrow.scare(); return; }
        let best = null, bd = 1e9;
        for (const t of this.trees) {
            const c = this.sprites.trees[t.variant].canopy, cx = t.x + c.cx * t.s, cy = t.y + c.cy * t.s;
            const d = Math.hypot((x - cx) / (c.rx * t.s * 1.15), (y - cy) / (c.ry * t.s * 1.2));
            if (d < 1 && d < bd) { best = t; bd = d; }
        }
        if (best) { this.shake(best); return; }
        if (y < L.hz * 0.8 && this.config.geese > 0 && this.flocks.flocks.length < 5) this.flocks.spawn(0);
    }

    shake(tree) {
        tree.shake = 1;
        const n = 2 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) this.drops.push({ tree, at: this.time + 0.1 + i * 0.16 + Math.random() * 0.2 });
        for (let i = 0; i < 6; i++) this.spawnLeaf(false, tree);
        this.gust = Math.max(this.gust, 0.4);
    }

    // Keys, declared in the catalog.
    callGeese() {
        if (!this.config.geese) return 'No geese in this valley (Flocks is at 0)';
        this.flocks.spawn(0);
        return '🪿 Honk';
    }

    blow() { this.gust = 2; return '🍃 A gust'; }

    waitForGreatPumpkin() {
        if (!this.config.pumpkinPatch || !this.config.greatPumpkin) return 'There’s no patch for it to rise from (turn on the Pumpkin Patch and the Great Pumpkin)';
        if (this.light.dark < 0.85) return '🎃 It’s far too bright. The Great Pumpkin only rises at night, over the most sincere patch';
        if (!this.great.summon()) return '🎃 Shh. It’s already on its way';
        return '🎃 Waiting, very sincerely…';
    }

    moonReport() {
        const m = this.moon, hours = h => `${Math.floor(h)}:${String(Math.round((h % 1) * 60) % 60).padStart(2, '0')}`;
        const { rise, set } = HarvestSky.sunTimes(this.sky);
        return `🌙 ${HarvestSky.moonTitle(this.sky, m.age)}, ${Math.round(m.illum * 100)}% lit. Sunrise ${hours(rise)}, sunset ${hours(set)}`;
    }

    // ---- Drawing -----------------------------------------------------------------------------------

    draw() {
        const { ctx, wg, dpr, W, H, L, light, config } = this;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        this.drawSky(ctx);
        if (config.geese > 0) { this.syncGeese(); this.flocks.draw(ctx, dpr, this.geeseSprites); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }

        // The world, at daylight colour, then washed with the hour's light.
        wg.setTransform(1, 0, 0, 1, 0, 0);
        wg.globalCompositeOperation = 'source-over';
        wg.globalAlpha = 1;
        wg.clearRect(0, 0, this.world.width, this.world.height);
        wg.drawImage(this.land, 0, 0);
        wg.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.drawMist(wg);
        this.drawMill(wg);
        if (config.village && config.bunting) this.drawBunting(wg);
        this.drawSmoke(wg);
        this.drawActors(wg);
        this.drawLeaves(wg);
        // The wash.
        wg.globalCompositeOperation = 'source-atop';
        const h = light.horizon, hazeA = 0.26 * (1 - 0.5 * light.dark) + 0.1 * light.twilight;
        const haze = wg.createLinearGradient(0, L.hz - L.Hu * 0.12, 0, L.hz + L.Hu * 0.24);
        haze.addColorStop(0, `rgba(${h[0] | 0},${h[1] | 0},${h[2] | 0},0)`);
        haze.addColorStop(0.4, `rgba(${h[0] | 0},${h[1] | 0},${h[2] | 0},${hazeA})`);
        haze.addColorStop(1, `rgba(${h[0] | 0},${h[1] | 0},${h[2] | 0},0)`);
        wg.fillStyle = haze;
        wg.fillRect(0, 0, W, H);
        const w = light.wash;
        wg.fillStyle = `rgba(${w[0] | 0},${w[1] | 0},${w[2] | 0},${w[3]})`;
        wg.fillRect(0, 0, W, H);
        wg.globalCompositeOperation = 'source-over';
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(this.world, 0, 0);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        this.drawLights(ctx);
        this.drawGreat(ctx);
        if (config.beams) this.drawBeams(ctx);
    }

    drawSky(ctx) {
        const { W, L, light, sun, moon, config } = this, hz = L.hz;
        const grad = ctx.createLinearGradient(0, 0, 0, hz + 4);
        const rgb = c => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
        grad.addColorStop(0, rgb(light.top));
        grad.addColorStop(0.55, rgb(light.mid));
        grad.addColorStop(1, rgb(light.horizon));
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, hz + 4);
        // Stars, and the odd shooting one.
        if (config.stars && light.stars > 0.01) {
            ctx.globalAlpha = light.stars;
            ctx.drawImage(this.starLayer, 0, 0, W, hz + 6);
            ctx.fillStyle = '#fff';
            for (const s of this.twinkle) {
                ctx.globalAlpha = light.stars * (0.35 + 0.65 * Math.abs(Math.sin(this.time * s.rate + s.phase)));
                ctx.fillRect(s.x - 0.8, s.y - 0.8, 2.6, 2.6);
            }
            ctx.globalAlpha = 1;
            if (this.shooting) this.drawShooting(ctx);
        }
        ctx.globalCompositeOperation = 'lighter';
        if (config.sun && sun.alt > -2.5) this.drawSun(ctx);
        ctx.globalCompositeOperation = 'source-over';
        if (config.moon && moon.alt > -4) this.drawMoon(ctx);
        this.drawClouds(ctx);
    }

    drawShooting(ctx) {
        const s = this.shooting, k = s.age / s.life, x = s.x + s.vx * s.age, y = s.y + s.vy * s.age;
        const fade = Math.sin(Math.min(1, k) * Math.PI), len = 0.12;
        const g = ctx.createLinearGradient(x, y, x - s.vx * len, y - s.vy * len);
        g.addColorStop(0, `rgba(255,252,240,${0.9 * fade})`);
        g.addColorStop(1, 'rgba(255,252,240,0)');
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - s.vx * len, y - s.vy * len);
        ctx.stroke();
    }

    drawSun(ctx) {
        const { W, sun, u } = this, x = sun.x * W, y = this.altY(sun.alt), low = this.light.low;
        const r = 22 * u * (1 + 0.3 * low), a = HarvestSky.smooth(-2.5, 2, sun.alt);
        // Glow, wider and redder as it sinks.
        const gs = r * (7 + 4 * low);
        ctx.globalAlpha = a * (0.55 + 0.25 * low);
        ctx.drawImage(this.sprites.sun, x - gs / 2, y - gs / 2, gs, gs);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        const core = HarvestSky.mix([255, 250, 232], [255, 168, 80], low);
        g.addColorStop(0, `rgba(${core[0] | 0},${core[1] | 0},${core[2] | 0},1)`);
        g.addColorStop(0.8, `rgba(${core[0] | 0},${(core[1] * 0.92) | 0},${(core[2] * 0.8) | 0},0.96)`);
        g.addColorStop(1, `rgba(${core[0] | 0},${(core[1] * 0.85) | 0},${(core[2] * 0.6) | 0},0)`);
        ctx.globalAlpha = a;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r * 1.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    drawMoon(ctx) {
        const { W, moon, u, config } = this;
        const x = moon.x * W, y = this.altY(moon.alt);
        const r = Math.round(30 * u * config.moonSize * (1 + 0.2 * HarvestSky.smooth(22, 0, moon.alt)));
        const waning = moon.age > HarvestSky.SYNODIC / 2;
        const key = `${Math.round(moon.phase * 240)}|${waning}|${r}`;
        if (this.moonCache.key !== key) this.moonCache = { key, ...HarvestArt.moon(moon.phase, r, this.dpr, waning) };
        // Pale in the day sky, brilliant at night; warm and large near the horizon.
        const day = HarvestSky.smooth(-6, 12, this.sun.alt), a = (1 - 0.62 * day) * HarvestSky.smooth(-4, 1.5, moon.alt);
        // Its bright limb faces the sun.
        const sx = this.sun.x * W, sy = this.altY(this.sun.alt);
        let tilt = Math.atan2(sy - y, sx - x) - (waning ? Math.PI : 0);
        tilt = Math.atan2(Math.sin(tilt), Math.cos(tilt)) * 0.55;
        const warm = HarvestSky.smooth(26, 2, moon.alt);
        const halo = r * (6 + 3 * moon.illum);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a * (0.18 + 0.7 * moon.illum) * (1 - 0.5 * day);
        ctx.drawImage(this.sprites.halo, x - halo / 2, y - halo / 2, halo, halo);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = a;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(tilt);
        const s = this.moonCache.size;
        ctx.drawImage(this.moonCache.c, -s / 2, -s / 2, s, s);
        ctx.restore();
        if (warm > 0.02) {                                       // low on the horizon: harvest gold
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = a * warm * 0.32 * (0.2 + moon.illum);
            ctx.fillStyle = '#ff9a3c';
            ctx.beginPath();
            ctx.arc(x, y, r * 0.98, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
    }

    drawClouds(ctx) {
        const { light, u } = this;
        if (!this.clouds.length) return;
        const key = [light.cloudLit.map(v => Math.round(v / 12)), light.cloudShade.map(v => Math.round(v / 12))].join();
        if (this.toneKey.cloud !== key) {
            this.toneKey.cloud = key;
            this.cloudSprites = HarvestArt.clouds(Math.round(360 * u), Math.round(120 * u), this.dpr, light.cloudLit, light.cloudShade, WP.seededRandom(31), 4);
        }
        const day = HarvestSky.smooth(-12, 0, this.sun.alt);
        ctx.globalAlpha = 0.55 + 0.35 * day;
        for (const c of this.clouds) {
            const w = 360 * u * c.scale, h = 120 * u * c.scale;
            ctx.drawImage(this.cloudSprites[c.kind], c.x - w / 2, c.y - h / 2, w, h);
        }
        ctx.globalAlpha = 1;
    }

    // Geese in the colour of the hour: dark against the sunset, a moonlit
    // slate at night. Re-baked only when the colour moves a step.
    syncGeese() {
        const { light } = this;
        const day = [52, 44, 50], night = [78, 90, 128];
        const c = HarvestSky.mix(day, night, light.dark), key = c.map(v => Math.round(v / 8)).join();
        if (this.toneKey.geese !== key) {
            this.toneKey.geese = key;
            this.geeseSprites = HarvestArt.geese(44, this.dpr, HarvestArt.tint(c), 12);
        }
    }

    drawMist(g) {
        const level = this.config.mist * this.fx.mist * (0.4 + 0.6 * this.light.twilight + 0.25 * this.light.dark);
        if (level < 0.01) return;
        const { u } = this;
        g.globalAlpha = Math.min(1, level);
        for (const m of this.mist) {
            const w = 400 * u * m.scale, h = 60 * u * m.scale;
            g.globalAlpha = Math.min(1, level * m.a);
            g.drawImage(this.sprites.mist, m.x - w / 2, m.y - h / 2, w, h);
        }
        g.globalAlpha = 1;
    }

    drawMill(g) {
        const { L, config } = this;
        if (!config.village || !config.windmill || !L.mill.hub) return;
        const { x, y } = L.mill.hub, len = L.mill.h * 0.5;
        g.save();
        g.translate(x, y);
        g.rotate(this.millAngle);
        for (let k = 0; k < 4; k++) {
            g.save();
            g.rotate(k * Math.PI / 2);
            g.fillStyle = '#6a4a38';
            g.fillRect(0, -1, len, 2);
            g.fillStyle = 'rgba(240,228,200,0.88)';
            g.fillRect(len * 0.2, -len * 0.17, len * 0.78, len * 0.15);
            g.strokeStyle = 'rgba(100,70,50,0.6)';
            g.lineWidth = 0.7;
            for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(len * (0.2 + 0.78 * i / 5), -len * 0.17); g.lineTo(len * (0.2 + 0.78 * i / 5), -len * 0.02); g.stroke(); }
            g.restore();
        }
        g.fillStyle = '#4a3428';
        g.beginPath();
        g.arc(0, 0, len * 0.06, 0, Math.PI * 2);
        g.fill();
        g.restore();
    }

    // Flags between two roofs; in Thanksgiving week they spell out a message.
    drawBunting(g) {
        const b = this.L.bunting[0];
        if (!b) return;
        const u = this.u, n = 13, text = this.holiday ? 'GIVE THANKS' : '', colours = ['#c8402a', '#e8902a', '#e8c040', '#8a9a3a', '#a8522a'];
        const sag = Math.hypot(b.x1 - b.x0, b.y1 - b.y0) * 0.09;
        let letter = 0;
        for (let i = 0; i < n; i++) {
            const t = (i + 0.5) / n, x = b.x0 + (b.x1 - b.x0) * t, y = b.y0 + (b.y1 - b.y0) * t + Math.sin(t * Math.PI) * sag;
            const sw = Math.sin(this.time * 2.2 + i * 0.8) * 0.18 * (0.3 + this.wind * 0.6);
            g.save();
            g.translate(x, y);
            g.rotate(sw);
            g.fillStyle = colours[i % colours.length];
            const fw = 3.6 * u;
            g.beginPath();
            g.moveTo(-fw, 0); g.lineTo(fw, 0); g.lineTo(0, 8.5 * u);
            g.closePath();
            g.fill();
            if (text && i >= 1 && letter < text.length) {
                const ch = text[letter++];
                if (ch === ' ') { letter += 0; } else {
                    g.fillStyle = '#fff6dc';
                    g.font = `bold ${4.4 * u}px Georgia, serif`;
                    g.textAlign = 'center';
                    g.fillText(ch, 0, 3.8 * u);
                }
            }
            g.restore();
        }
        g.strokeStyle = 'rgba(60,40,30,0.7)';
        g.lineWidth = 0.7;
        g.beginPath();
        for (let i = 0; i <= 20; i++) { const t = i / 20; g[i ? 'lineTo' : 'moveTo'](b.x0 + (b.x1 - b.x0) * t, b.y0 + (b.y1 - b.y0) * t + Math.sin(t * Math.PI) * sag); }
        g.stroke();
    }

    drawSmoke(g) {
        if (!this.puffs.length) return;
        const sprite = this.sprites.smoke;
        for (const p of this.puffs) {
            const k = p.age / p.life, s = p.size * (1 + k * 3.2);
            g.globalAlpha = 0.5 * Math.sin(Math.min(1, k * 6) * Math.PI / 2) * (1 - k) * (1 - k);
            g.drawImage(sprite, p.x - s / 2, p.y - s / 2, s, s);
        }
        g.globalAlpha = 1;
    }

    // Everything standing on the ground, far to near.
    drawActors(g) {
        const items = this.items = this.items || [];
        items.length = 0;
        const { config, L } = this;
        for (const t of this.trees) items.push({ y: t.y, kind: 0, ref: t });
        for (const a of this.apples) if (a.state !== 'carried') items.push({ y: a.y, kind: 1, ref: a });
        for (const s of this.squirrels) items.push({ y: s.y + 1, kind: 2, ref: s });
        for (const s of this.turkeys) items.push({ y: s.y, kind: 3, ref: s });
        for (const s of this.cats) items.push({ y: s.y, kind: 6, ref: s });
        if (config.scarecrow && config.fields) items.push({ y: L.scarecrow.y, kind: 4, ref: this.scarecrow });
        if (config.pumpkinPatch && this.great.state !== 'rise' && this.great.state !== 'gone') items.push({ y: L.sincere.y, kind: 5, ref: this.great });
        items.sort((a, b) => a.y - b.y);
        for (const it of items) {
            switch (it.kind) {
                case 0: this.drawTree(g, it.ref); break;
                case 1: this.drawApple(g, it.ref); break;
                case 4: it.ref.draw(g); break;
                case 5: this.drawGreatBody(g); break;
                default: it.ref.draw(g);
            }
        }
        if (config.pumpkinPatch && this.great.state === 'rise') this.drawGreatBody(g);
        // A carried apple is drawn by its squirrel.
    }

    drawTree(g, t) {
        const { u } = this, s = t.s, sp = this.sprites.trees[t.variant];
        const sway = (0.012 + 0.016 * this.wind) * Math.sin(this.time * (0.9 + t.phase * 0.05) + t.phase) + this.windPush * this.wind * 0.012 + Math.sin(this.time * 21 + t.phase) * t.shake * 0.05 * t.shake;
        g.save();
        g.translate(t.x, t.y);
        g.rotate(sway);
        g.drawImage(sp.c, -sp.ax * s, -sp.ay * s, sp.w * s, sp.h * s);
        // Apples still on the tree, ripening.
        const shown = Math.ceil(t.hang.length * (0.5 + 0.5 * this.density()));
        for (let i = 0; i < shown; i++) {
            const h = t.hang[i];
            if (h.ripe < 0.05) continue;
            const size = 15 * u * s * Math.min(1, h.ripe) ;
            g.drawImage(this.sprites.apples[h.kind], h.lx * s - size * 0.8, h.ly * s - size * 0.86, size * 1.6, size * 1.6);
        }
        g.restore();
        // The den tree's very small door.
        if (t === this.den && this.config.squirrels > 0) {
            const d = this.denDoor(), k = u * s;
            g.fillStyle = '#6a3a22';
            g.beginPath();
            g.moveTo(d.x - 4.4 * k, d.y);
            g.lineTo(d.x - 4.4 * k, d.y - 6 * k);
            g.arc(d.x, d.y - 6 * k, 4.4 * k, Math.PI, 0);
            g.lineTo(d.x + 4.4 * k, d.y);
            g.closePath();
            g.fill();
            g.fillStyle = '#e8c860';
            g.fillRect(d.x + 1.8 * k, d.y - 4 * k, 1.1 * k, 1.1 * k);
        }
    }

    drawApple(g, a) {
        const s = this.depth(a.y), size = 14 * this.u * s;
        if (a.state === 'fall' || a.h > 0) {
            g.fillStyle = `rgba(20,25,5,${0.28 * Math.max(0.2, 1 - a.h / (120 * this.u))})`;
            g.beginPath();
            g.ellipse(a.x, a.y, size * 0.5, size * 0.16, 0, 0, Math.PI * 2);
            g.fill();
        } else {
            g.fillStyle = 'rgba(20,25,5,0.25)';
            g.beginPath();
            g.ellipse(a.x + 1, a.y + size * 0.04, size * 0.46, size * 0.14, 0, 0, Math.PI * 2);
            g.fill();
        }
        g.globalAlpha = Math.max(0, Math.min(1, a.fade));
        g.drawImage(this.sprites.apples[a.kind % this.sprites.apples.length], a.x - size * 0.8, a.y - a.h - size * 1.05, size * 1.6, size * 1.6);
        g.globalAlpha = 1;
    }

    drawLeaves(g) {
        if (!this.leafPool.length) return;
        const dpr = this.dpr, u = this.u, depthRef = this.L.Hu;
        for (const l of this.leafPool) {
            const f = 0.55 + 0.6 * Math.min(1, l.ground / depthRef), sprite = this.sprites.leaves[l.kind % this.sprites.leaves.length];
            const sx = l.down ? 0.55 : Math.cos(l.flutter * 0.9), a = l.ang, size = 15 * u * 1.4 * f * l.size;
            g.globalAlpha = l.down ? Math.max(0, 1 - Math.max(0, l.rest - 4) / 3) : 1;
            g.setTransform(dpr * Math.cos(a) * sx, dpr * Math.sin(a) * sx, -dpr * Math.sin(a), dpr * Math.cos(a), dpr * l.x, dpr * l.y);
            g.drawImage(sprite, -size / 2, -size / 2, size, size);
        }
        g.globalAlpha = 1;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // The great pumpkin as it sits in the patch, or high in the air.
    drawGreatBody(g) {
        const gp = this.great, sp = this.sprites.great, pres = gp.presence();
        if (pres <= 0) return;
        const scale = gp.size() / (32 * this.u * 2);
        g.globalAlpha = pres;
        g.drawImage(sp.body, gp.x - sp.cx * scale, gp.y - sp.cy * scale, sp.size * scale, sp.size * scale);
        g.globalAlpha = 1;
    }

    drawGreat(ctx) {
        const gp = this.great, sp = this.sprites.great;
        if (!this.config.pumpkinPatch || gp.glow < 0.01) return;
        const scale = gp.size() / (32 * this.u * 2);
        const flick = 0.85 + 0.15 * Math.sin(this.time * 9) * Math.sin(this.time * 5.3);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = gp.glow * flick * gp.presence();
        ctx.drawImage(sp.face, gp.x - sp.cx * scale, gp.y - sp.cy * scale, sp.size * scale, sp.size * scale);
        for (const s of gp.sparks) {
            const k = s.age / s.life, z = (6 + 10 * this.u) * (1 - k);
            ctx.globalAlpha = (1 - k) * 0.9;
            ctx.drawImage(this.sprites.spark, s.x - z / 2, s.y - z / 2, z, z);
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
    }

    // Everything that glows after dark: windows, lamps, the bonfire, the den door.
    drawLights(ctx) {
        const { config, L, light, u } = this, dark = light.dark;
        const festive = this.holiday === 'day' ? 1 : 0;
        if (dark > 0.02 && config.village && config.lights) {
            // Lit panes, then their glow.
            L.windows.forEach((w, i) => {
                const on = i % 7 !== 3 || festive;
                if (!on) return;
                const flick = 0.85 + 0.15 * Math.sin(this.time * 5 + i * 2.1) * Math.sin(this.time * 2.3 + i);
                ctx.globalAlpha = dark * 0.95 * flick;
                ctx.fillStyle = '#ffd27a';
                ctx.fillRect(w.x - w.w / 2, w.y - w.h / 2, w.w, w.h);
            });
            ctx.globalCompositeOperation = 'lighter';
            L.windows.forEach((w, i) => {
                if (i % 7 === 3 && !festive) return;
                const s = Math.max(w.w, w.h) * 3.4;
                ctx.globalAlpha = dark * 0.5;
                ctx.drawImage(this.sprites.warm, w.x - s / 2, w.y - s / 2, s, s);
            });
            for (const lamp of L.lamps) {
                const s = 46 * lamp.s * 1.6, flick = 0.9 + 0.1 * Math.sin(this.time * 3 + lamp.x);
                ctx.globalAlpha = dark * 0.8 * flick;
                ctx.drawImage(this.sprites.warm, lamp.x - s / 2, lamp.y - s / 2 + 4 * lamp.s, s, s);
            }
            ctx.globalCompositeOperation = 'source-over';
        }
        // The bonfire and the people round it.
        if (dark > 0.05 && config.village && config.bonfire) this.drawFire(ctx, dark);
        // The squirrels' door lights up when someone's home with an apple.
        if (this.den && config.squirrels > 0 && (dark > 0.1 || this.doorGlow > 0.02)) {
            const d = this.denDoor(), k = u * this.den.s, a = Math.max(dark * 0.8, this.doorGlow);
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = a;
            ctx.drawImage(this.sprites.warm, d.x - 12 * k, d.y - 14 * k, 24 * k, 24 * k);
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = '#ffd27a';
            ctx.globalAlpha = a * 0.9;
            ctx.beginPath();
            ctx.moveTo(d.x - 3.4 * k, d.y);
            ctx.lineTo(d.x - 3.4 * k, d.y - 5.4 * k);
            ctx.arc(d.x, d.y - 5.4 * k, 3.4 * k, Math.PI, 0);
            ctx.lineTo(d.x + 3.4 * k, d.y);
            ctx.fill();
            ctx.globalAlpha = 1;
        }
        ctx.globalAlpha = 1;
    }

    drawFire(ctx, dark) {
        const { L, u } = this, f = L.fire, t = this.time;
        const a = Math.min(1, dark * 1.3);
        // Figures sitting round it, dark against the light.
        ctx.globalAlpha = a;
        ctx.fillStyle = '#1a1214';
        for (const [dx, dy, s] of [[-24, 1, 1], [-15, 7, 0.9], [18, 5, 1.05], [26, -1, 0.9]]) {
            const x = f.x + dx * u, y = f.y + dy * u, k = s * u;
            ctx.beginPath();
            ctx.ellipse(x, y - 4 * k, 3.6 * k, 4.6 * k, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x, y - 10.4 * k, 2.2 * k, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = `rgba(255,170,80,${0.55 * a})`;
            ctx.beginPath();
            ctx.arc(x + (dx < 0 ? 2.2 : -2.2) * k, y - 10.4 * k, 1.1 * k, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#1a1214';
        }
        ctx.globalCompositeOperation = 'lighter';
        const glow = 150 * u * (0.9 + 0.1 * Math.sin(t * 8) * Math.sin(t * 3.1));
        ctx.globalAlpha = a * 0.65;
        ctx.drawImage(this.sprites.warm, f.x - glow / 2, f.y - glow * 0.5, glow, glow);
        // Flames: three tongues, each licking in its own time.
        for (let i = 0; i < 4; i++) {
            const ph = t * (7 + i * 1.7) + i * 2, h = (13 + 5 * Math.sin(ph) + i % 2 * 4) * u, w = (4.4 - i * 0.5) * u, x = f.x + (i - 1.5) * 3 * u + Math.sin(ph * 0.7) * 1.2 * u;
            const g = ctx.createLinearGradient(0, f.y, 0, f.y - h);
            g.addColorStop(0, 'rgba(255,200,90,0.95)');
            g.addColorStop(0.6, 'rgba(255,120,30,0.7)');
            g.addColorStop(1, 'rgba(255,60,20,0)');
            ctx.fillStyle = g;
            ctx.globalAlpha = a;
            ctx.beginPath();
            ctx.moveTo(x - w, f.y);
            ctx.quadraticCurveTo(x - w * 0.6, f.y - h * 0.6, x + Math.sin(ph) * u, f.y - h);
            ctx.quadraticCurveTo(x + w * 0.6, f.y - h * 0.6, x + w, f.y);
            ctx.fill();
        }
        for (const s of this.sparks) {
            const k = s.age / s.life, z = 7 * u * (1 - k * 0.6);
            ctx.globalAlpha = a * (1 - k);
            ctx.drawImage(this.sprites.spark, s.x - z / 2, s.y - z / 2, z, z);
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
    }

    // The low sun slanting through the trees, with dust turning in it.
    drawBeams(ctx) {
        const { sun, W, H, light, u } = this, a = this.fx.beams * light.low * HarvestSky.smooth(0.5, 3, sun.alt);
        if (a < 0.02 || !this.config.sun) return;
        const sx = sun.x * W, sy = this.altY(sun.alt), base = Math.atan2(H * 0.95 - sy, W * 0.5 - sx), len = H * 1.5;
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 7; i++) {
            const ang = base + (i - 3) * 0.15 + Math.sin(this.time * 0.11 + i * 1.7) * 0.025, wd = 0.03 + 0.02 * ((i * 5) % 3);
            const ex = sx + Math.cos(ang) * len, ey = sy + Math.sin(ang) * len;
            const g = ctx.createLinearGradient(sx, sy, ex, ey);
            g.addColorStop(0, 'rgba(255,214,140,0)');
            g.addColorStop(0.25, `rgba(255,206,130,${0.12 * a})`);
            g.addColorStop(0.7, `rgba(255,196,120,${0.07 * a})`);
            g.addColorStop(1, 'rgba(255,190,110,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx + Math.cos(ang - wd) * len, sy + Math.sin(ang - wd) * len);
            ctx.lineTo(sx + Math.cos(ang + wd) * len, sy + Math.sin(ang + wd) * len);
            ctx.closePath();
            ctx.fill();
        }
        // Motes, drifting up in the light.
        if (!this.motes) this.motes = Array.from({ length: 36 }, () => ({ x: Math.random(), y: Math.random(), p: Math.random() * 6, v: 0.2 + Math.random() }));
        const n = Math.round(this.motes.length * this.density());
        ctx.fillStyle = '#ffe2a8';
        for (let i = 0; i < n; i++) {
            const m = this.motes[i];
            m.y -= 0.004 * m.v * 0.016 * 60 * 0.3;
            m.x += Math.sin(this.time * 0.5 + m.p) * 0.0002;
            if (m.y < 0.3) m.y = 1;
            ctx.globalAlpha = a * 0.7 * (0.3 + 0.7 * Math.abs(Math.sin(this.time * 1.4 + m.p)));
            ctx.fillRect(m.x * W, m.y * H, 1.8 * u, 1.8 * u);
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
    }
}
