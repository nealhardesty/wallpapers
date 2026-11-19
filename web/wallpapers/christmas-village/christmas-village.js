// Christmas Village: Evergreen Hollow, a New England town deep in snow. A
// meetinghouse with a clock that keeps the time, capes and colonials with
// lights along the eaves, a grand tree on the green with a toy train
// round its foot, a pond with skaters, a cocoa hut and a bonfire, a tree
// farm on the hill, and a cabin up the mountain with deer at the door.
// Cats on the roofs. Snow, a great deal of it. Every part has a switch.
//
// Cheap by design (SPEC §4.8):
//   - the land is one baked painting per layout, washed with the hour's
//     light into a second canvas only when the light has changed
//   - the lights are baked too: one steady layer (windows, lamps) that is
//     repainted when a window goes on or off, and two layers of bulbs
//     faded against each other for the twinkle
//   - the cast is a few filled shapes apiece in colours toned for the hour;
//     trees among them are sprites toned the same way, only when it changes
//   - snow is pooled: far flakes are one path of squares, near ones a sprite
//   - northern lights and the lights in the ice are effects the tier can shed
//
// The sun and moon are the real ones for the date and hour (harvest-sky.js,
// through host.now(), so ?date= works); the light is winter's own
// (village-logic.js).

class ChristmasVillageAnimationManager {
    constructor(host) {
        this.host = host;
        this.config = WP.settings.load();
        this.running = false;
        this.listeners = [];
        this.time = 0;
        this.wind = 0;
        this.gust = 0;
        this.pointerType = 'mouse';
        this.skaters = [];
        this.walkers = [];
        this.dogs = [];
        this.cats = [];
        this.sledders = [];
        this.deer = [];
        this.flakes = [];
        this.puffs = [];
        this.bits = [];             // snow kicked up, sparks, steam
        this.notes = [];            // ♪ z ♥
        this.prints = [];
        this.sparks = [];
        this.singing = [];
        this.sleigh = null;
        this.owl = null;
        this.shooting = null;
        this.slide = null;
        this.train = null;
        this.alarm = 0;             // the deer look up
        this.aurora = 0;            // 0..1, and where it's heading
        this.auroraWant = 0;
        this.light = VillageLogic.light(-20, 0);
        this.sun = { alt: -20, x: 0.5 };
        this.moon = { alt: 30, x: 0.5, age: 10, phase: 0.3, illum: 0.5, light: 0 };
        this.fx = { aurora: 1, reflections: 1 };
        this.tones = new Map();
        this.toneKey = '';
        this.glowKey = '';
        this.moonCache = {};
        this.timers = {};
        this.seeded = false;
        this.recoveries = 0;
        this.lastBakeCheck = 0;
        this.struck = null;
    }

    // ---- Lifecycle ------------------------------------------------------------

    start() {
        if (this.running) return;
        this.running = true;
        const canvas = this.canvas = document.createElement('canvas');
        canvas.id = 'christmas-village-canvas';
        Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: '-1', pointerEvents: 'none' });
        document.body.appendChild(canvas);
        this.ctx = canvas.getContext('2d');
        this.washed = document.createElement('canvas');
        this.cycleBase = this.host.now().getTime();
        this.syncEffects(true);
        this.resize();
        this.listen();
        // A host that drops every canvas's contents at once (SPEC §10.22): bake again.
        canvas.addEventListener('contextlost', e => e.preventDefault());
        canvas.addEventListener('contextrestored', () => this.recover('contextrestored'));
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
        this.canvas = this.ctx = this.washed = this.scene = null;
    }

    listen() {
        const on = (target, type, fn) => {
            target.addEventListener(type, fn, { passive: true });
            this.listeners.push(() => target.removeEventListener(type, fn));
        };
        on(window, 'resize', () => this.resize());
        on(document, 'pointerdown', e => { this.pointerType = e.pointerType; });
        this.listeners.push(this.host.gestures({
            tap: (x, y) => { if (this.pointerType === 'mouse' || this.config.touch) this.tapAt(x, y); },
        }));
    }

    // Live changes from the panel. What's painted into the land is laid out
    // again; the rest takes effect where it stands.
    applySettings(config) {
        const old = this.config;
        this.config = config;
        if (!this.running) return;
        const changed = keys => keys.some(k => JSON.stringify(old[k]) !== JSON.stringify(config[k]));
        if (changed(['village', 'houses', 'church', 'gazebo', 'bridge', 'pond', 'hut', 'bonfire', 'farm', 'farmRows', 'cabin', 'horizon', 'scale', 'townTree', 'townTreeSize', 'litTrees',
            'lights', 'lightColors', 'lightPalette', 'decorate', 'snowman', 'lamps']) || (old.sledders > 0) !== (config.sledders > 0) || (old.cats > 0) !== (config.cats > 0)) {
            this.resize(true);
            return;
        }
        if (changed(['skaters', 'sledders', 'cats', 'deer', 'train'])) this.buildCast();
        if (changed(['sky', 'moonPhase', 'cycleMinutes'])) { this.pinKey = null; this.cycleBase = this.host.now().getTime() - this.time * 1000 * 86400 / (config.cycleMinutes * 60); }
        if (changed(['moonSize', 'moonPhase'])) this.moonCache = {};
        if (changed(['stars'])) this.buildStars();
        if (changed(['clouds'])) this.buildClouds();
        if (changed(['windows', 'candles'])) this.glowKey = '';
        if (changed(['aurora'])) this.auroraWant = 0;
    }

    onQuality() { this.syncEffects(false); }
    syncEffects(now) {
        const on = name => this.host.quality?.effects?.includes(name) ?? true;
        this.fxTarget = { aurora: on('aurora') ? 1 : 0, reflections: on('reflections') ? 1 : 0 };
        if (now) this.fx = { ...this.fxTarget };
    }
    density() { return this.host.quality?.density ?? 1; }

    // ---- Layout and baking ------------------------------------------------------

    resize(recast) {
        if (!this.canvas) return;
        const dpr = this.dpr = window.devicePixelRatio || 1;
        const W = this.W = window.innerWidth, H = this.H = window.innerHeight;
        // No window yet (a saver's web view before its frame is set): wait for a real size.
        if (!(W >= 16 && H >= 16)) { this.L = null; return; }
        const first = !this.L, prev = this.L;
        for (const c of [this.canvas, this.washed]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
        const random = WP.seededRandom(Math.round(W * 3 + H * 17));
        const L = this.L = VillageLogic.layout(W, H, this.host.insets?.bottom || 0, this.config, random);
        this.season = VillageLogic.season(this.host.now());
        const share = this.config.decorate === 'advent' ? this.season.advent : 1;
        this.scene = VillageScene.build(L, this.config, dpr, random, { share });
        this.day = this.host.now().toDateString();
        // The ice remembers the skates: a canvas the size of the pond.
        if (L.pond) {
            const p = L.pond;
            [this.ice, this.iceG] = VillageArt.canvas(p.rx * 2.2, p.ry * 2.2, dpr);
            this.iceG.translate(-(p.cx - p.rx * 1.1), -(p.cy - p.ry * 1.1));
            this.iceG.lineCap = 'round';
        } else this.ice = null;
        this.farmSprites = [0, 1, 2, 3].map(v => VillageArt.firSprite(40 * L.s, dpr, WP.seededRandom(91 + v), { v, snow: 0.5, tier: 8 }));
        this.flakeSprite = VillageArt.glow(16, dpr, 'rgba(255,255,255,1)', 'rgba(255,255,255,0.8)', 0.4, 'rgba(255,255,255,0)');
        this.warm = VillageScene.bulbSprite('#ffb44a', dpr);
        this.buildStars();
        this.buildClouds();
        this.buildAurora();
        this.toneKey = '';
        this.glowKey = '';
        this.moonCache = {};
        if (first || recast || !prev || prev.W !== W || prev.H !== H) this.buildCast();
        if (!this.seeded) this.seed();
    }

    // The land read as transparent where it is always opaque means the host
    // dropped the canvases' contents: bake everything again.
    bakesLost() {
        if (!this.scene || !this.L) return false;
        try {
            const land = this.scene.land, g = land.getContext('2d', { willReadFrequently: true });
            const x = Math.floor(land.width / 2);
            return g.getImageData(x, land.height - 1, 1, 1).data[3] === 0 && g.getImageData(x, Math.min(land.height - 1, Math.floor((this.L.hz + 12) * this.dpr)), 1, 1).data[3] === 0;
        } catch (e) { return false; }
    }
    recover(why) {
        if (!this.running) return;
        this.recoveries++;
        console.warn(`christmas-village: the baked layers were lost (${why}); baking again`);
        this.resize();
    }

    buildStars() {
        const { W, L, dpr } = this, hz = L.hz + L.Hu * 0.02, random = WP.seededRandom(404);
        const [c, g] = VillageArt.canvas(W, hz, dpr);
        this.twinkle = [];
        if (this.config.stars) {
            const n = Math.round(W * hz / 2600);
            for (let i = 0; i < n; i++) {
                const x = random() * W, y = random() ** 1.3 * hz, m = random();
                g.fillStyle = m > 0.9 ? '#ffe9c4' : m > 0.8 ? '#cfe0ff' : '#ffffff';
                g.globalAlpha = 0.35 + random() * 0.65;
                const r = m > 0.96 ? 1.6 : m > 0.7 ? 1.1 : 0.7;
                g.fillRect(x, y, r, r);
                if (m > 0.93 && this.twinkle.length < 46) this.twinkle.push({ x, y, rate: 0.8 + random() * 2.4, phase: random() * 6 });
            }
        }
        this.starLayer = c;
    }

    buildClouds() {
        const { W, L } = this, random = WP.seededRandom(777 + Math.round(this.config.clouds));
        this.clouds = [];
        for (let i = 0; i < Math.round(this.config.clouds); i++) {
            const w = (180 + random() * 260) * L.s, puffs = [];
            for (let j = 0; j < 14; j++) puffs.push({ x: (random() - 0.5) * w, y: (random() - 0.5) * w * 0.12 - Math.abs(random() - 0.5) * w * 0.06, r: w * (0.1 + random() * 0.12) });
            this.clouds.push({ x: random() * (W + w) - w / 2, y: L.hz * (0.08 + random() * 0.5), w, puffs, speed: (3 + random() * 6) * L.s, sprite: null });
        }
        this.cloudKey = '';
    }

    // The northern lights: a curtain of rays, baked once and drifted.
    buildAurora() {
        const { W, L, dpr } = this, h = L.hz * 0.8, random = WP.seededRandom(1225);
        const [c, g] = VillageArt.canvas(W * 1.5, h, Math.min(1, dpr));
        g.globalCompositeOperation = 'lighter';
        for (let x = 0; x < W * 1.5; x += 5 * L.s) {
            const lift = (Math.sin(x * 0.006 / L.s) + Math.sin(x * 0.017 / L.s + 2) * 0.5) * h * 0.11, top = h * (0.1 + random() * 0.18) + lift, len = h * (0.34 + random() * 0.34);
            const ray = g.createLinearGradient(0, top, 0, top + len);
            ray.addColorStop(0, 'rgba(150,90,255,0)');
            ray.addColorStop(0.3, `rgba(120,160,255,${0.05 + random() * 0.05})`);
            ray.addColorStop(0.75, `rgba(70,255,170,${0.1 + random() * 0.1})`);
            ray.addColorStop(1, 'rgba(70,255,170,0)');
            g.fillStyle = ray;
            g.fillRect(x, top, 7 * L.s, len);
        }
        this.auroraLayer = c;
    }

    buildCast() {
        const { config, L, scene } = this, n = Math.round;
        for (const s of scene.spots) s.cat = null;
        this.skaters = [];
        if (L.pond) {
            const want = n(config.skaters * Math.max(0.5, this.density()));
            const kinds = ['lap', 'figure', 'kid', 'beginner', 'lap', 'pair', 'kid', 'lap', 'beginner', 'lap', 'kid', 'pair'];
            for (let i = 0; this.skaters.length < want; i++) {
                const kind = kinds[i % kinds.length];
                if (kind === 'pair') {
                    if (this.skaters.length + 2 > want) { this.skaters.push(new VillageSkater(this, 'lap')); continue; }
                    const lead = new VillageSkater(this, 'pair');
                    lead.kind = 'lead';
                    this.skaters.push(lead, new VillageSkater(this, 'pair', lead));
                } else this.skaters.push(new VillageSkater(this, kind));
            }
        }
        this.walkers = [];
        this.dogs = [];
        this.singing = [];
        this.party = null;
        this.owl = this.slide = null;
        this.sparks = [];
        this.prints = [];
        this.sledders = L.sled ? Array.from({ length: n(config.sledders) }, (_, i) => new VillageSledder(this, i)) : [];
        this.cats = [];
        const perches = scene.spots.slice().sort(() => Math.random() - 0.5);
        for (const spot of perches) { if (this.cats.length >= n(config.cats)) break; this.cats.push(new VillageCat(this, spot)); }
        this.deer = scene.cabin ? Array.from({ length: n(config.deer) }, (_, i) => new VillageDeer(this, i)) : [];
        this.train = scene.grand && config.train ? new VillageTrain(this) : null;
        this.timers = {};
    }

    // Alive on the first frame: snow already in the air, people already out,
    // smoke already rising, the ice already marked.
    seed() {
        this.seeded = true;
        this.updateSky();
        for (let i = 0; i < 260; i++) this.update(0.1, true);
        if (this.config.callouts) this.greet();
    }

    greet() {
        const s = this.season;
        const text = s.eve ? '🎄 Christmas Eve in Evergreen Hollow' : s.day ? '🎁 Merry Christmas from Evergreen Hollow' : s.newYear ? '🥂 Happy New Year from Evergreen Hollow'
            : s.daysTo > 0 && s.daysTo <= 24 ? `🎄 ${s.daysTo} day${s.daysTo === 1 ? '' : 's'} until Christmas` : null;
        if (text) this.host.toast(text, 5000);
    }

    // ---- Time and light ---------------------------------------------------------

    skyDate() {
        const mode = this.config.sky, now = this.host.now();
        if (mode === 'live') return now;
        if (mode === 'cycle') return new Date(this.cycleBase + this.time * 1000 * 86400 / (this.config.cycleMinutes * 60));
        const key = `${now.toDateString()}|${mode}|${this.config.moonPhase}`;
        if (key !== this.pinKey) {
            this.pinKey = key;
            if (mode === 'dusk') { const set = HarvestSky.sunTimes(now).set, d = new Date(now.getFullYear(), now.getMonth(), now.getDate()); d.setMinutes(Math.round((set + 0.42) * 60)); this.pinDate = d; }
            else this.pinDate = HarvestSky.pinned(mode, now, this.pinAge());
        }
        return this.pinDate;
    }
    pinAge() { return { full: HarvestSky.SYNODIC / 2, gibbous: 11, half: 7.4, crescent: 3.5 }[this.config.moonPhase]; }

    updateSky() {
        const date = this.sky = this.skyDate();
        const b = HarvestSky.bodies(date, this.pinAge());
        this.sun = b.sun;
        this.moon = b.moon;
        if (!this.config.moon) this.moon.light = 0;
        this.light = VillageLogic.light(this.sun.alt, this.moon.light);
        // A pinned night is an evening as far as the town goes: people up, the hut open.
        this.hour = this.config.sky === 'night' ? 19.75 : date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
        // The hour's colour, in steps coarse enough that the toned copies are rarely redone.
        const w = this.light.wash, key = `${Math.round(w[0] / 6)},${Math.round(w[1] / 6)},${Math.round(w[2] / 6)},${Math.round(w[3] * 50)}`;
        if (key !== this.toneKey) {
            this.toneKey = key;
            this.tones.clear();
            this.washRGB = [Math.round(w[0] / 6) * 6, Math.round(w[1] / 6) * 6, Math.round(w[2] / 6) * 6];
            this.washA = Math.round(w[3] * 50) / 50;
            this.shadow = `rgba(${Math.round(60 - 40 * this.light.dark)},${Math.round(84 - 50 * this.light.dark)},${Math.round(140 - 60 * this.light.dark)},0.3)`;
            this.landDirty = true;
        }
    }

    // A daylight colour as it looks at this hour.
    tone(color) {
        let c = this.tones.get(color);
        if (!c) {
            const p = VillageArt.hex(color), a = this.washA, w = this.washRGB;
            c = `rgb(${Math.round(p[0] + (w[0] - p[0]) * a)},${Math.round(p[1] + (w[1] - p[1]) * a)},${Math.round(p[2] + (w[2] - p[2]) * a)})`;
            this.tones.set(color, c);
        }
        return c;
    }

    // A sprite as it looks at this hour: a toned copy, redone when the light moves on.
    toned(sprite) {
        if (sprite.toneKey === this.toneKey && sprite.tonedC) return sprite.tonedC;
        const c = sprite.tonedC || (sprite.tonedC = document.createElement('canvas'));
        c.width = sprite.c.width; c.height = sprite.c.height;
        const g = c.getContext('2d');
        g.drawImage(sprite.c, 0, 0);
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = `rgba(${this.washRGB[0]},${this.washRGB[1]},${this.washRGB[2]},${this.washA})`;
        g.fillRect(0, 0, c.width, c.height);
        sprite.toneKey = this.toneKey;
        return c;
    }

    // The land, washed: haze toward the sky's colour at the foot of the
    // mountains, then the hour's tint, only where something is painted.
    washLand() {
        const { W, H, L, dpr, light } = this, g = this.washed.getContext('2d');
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalCompositeOperation = 'source-over';
        g.clearRect(0, 0, this.washed.width, this.washed.height);
        g.drawImage(this.scene.land, 0, 0);
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.globalCompositeOperation = 'source-atop';
        const h = light.horizon, a = 0.22 * (1 - 0.5 * light.dark) + 0.12 * light.twilight;
        const haze = g.createLinearGradient(0, L.hz - L.Hu * 0.2, 0, L.hz + L.Hu * 0.12);
        haze.addColorStop(0, `rgba(${h[0] | 0},${h[1] | 0},${h[2] | 0},0)`);
        haze.addColorStop(0.62, `rgba(${h[0] | 0},${h[1] | 0},${h[2] | 0},${a})`);
        haze.addColorStop(1, `rgba(${h[0] | 0},${h[1] | 0},${h[2] | 0},0)`);
        g.fillStyle = haze;
        g.fillRect(0, 0, W, H);
        g.fillStyle = `rgba(${this.washRGB[0]},${this.washRGB[1]},${this.washRGB[2]},${this.washA})`;
        g.fillRect(0, 0, W, H);
        this.landDirty = false;
    }

    // Which windows are lit, and the steady glow repainted when that changes.
    isLit(w) {
        const { config, light, hour, season } = this, dark = light.dark;
        if (!config.windows || w.cabin) return false;
        const o = w.owner;
        if (o && o.forced !== undefined) return o.forced && dark > 0.05;
        if (dark <= 0.08) return false;
        const h = hour < 12 ? hour + 24 : hour;
        if (o && o.sung > this.time) return true;
        if (w.church) return h < (season.eve ? 25.5 : 21.5) && dark > 0.2;
        if (w.hatch) return h < 23.5 && dark > 0.12;
        if (w.shop) return h < 21 && dark > 0.1;
        if (w.dim) return dark > 0.3;
        return VillageLogic.windowLit(w, hour, dark, season.eve);
    }
    syncGlow() {
        let key = this.light.dark > 0.25 ? 'c' : '';
        const ws = this.scene.windows;
        for (let i = 0; i < ws.length; i++) key += this.isLit(ws[i]) ? '1' : '0';
        if (key === this.glowKey) return;
        this.glowKey = key;
        VillageScene.paintGlow(this.scene, this.config, w => this.isLit(w), this.light.dark);
    }

    // ---- Things other parts ask for -----------------------------------------------

    track(x0, y0, x1, y1) {
        if (!this.ice || !this.config.tracks) return;
        const g = this.iceG;
        g.strokeStyle = 'rgba(255,255,255,0.5)';
        g.lineWidth = 0.9 * this.L.s;
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
    trackSpin(x, y, spin) {
        if (!this.ice || !this.config.tracks) return;
        const g = this.iceG, r = 3.2 * this.L.depth(y);
        g.strokeStyle = 'rgba(255,255,255,0.22)';
        g.lineWidth = 0.7 * this.L.s;
        g.beginPath(); g.ellipse(x, y, r, r * 0.4, 0, spin * 6.28, spin * 6.28 + 1.2); g.stroke();
    }
    spray(x, y, n, k) {
        for (let i = 0; i < n && this.bits.length < 220; i++) this.bits.push({ x, y, vx: (Math.random() - 0.5) * 26 * k, vy: -(8 + Math.random() * 22) * k, g: 60 * k, r: (0.7 + Math.random() * 1.1) * k, age: 0, life: 0.5 + Math.random() * 0.5, kind: 'snow' });
    }
    steam(x, y, k) {
        if (this.bits.length < 220) this.bits.push({ x, y, vx: (Math.random() - 0.5) * 3 * k + this.wind * 5 * k, vy: -7 * k, g: 0, r: 1.3 * k, age: 0, life: 1.4, kind: 'steam' });
    }
    note(x, y, ch, size) {
        if (this.notes.length < 40) this.notes.push({ x, y, ch, size, age: 0, life: 2.6, sway: Math.random() * 6 });
    }
    print(x, y, k) {
        this.prints.push({ x, y, k, age: 0 });
        if (this.prints.length > 90) this.prints.shift();
    }

    // ---- Per-frame update ---------------------------------------------------------

    frame(now) {
        if (!this.running) return;
        this.frameId = requestAnimationFrame(t => this.frame(t));
        if (!this.L) { this.last = 0; this.resize(); return; }
        const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
        this.last = now;
        this.update(dt);
        this.draw();
    }

    // True about `perHour` times an hour.
    chance(perHour, dt) { return Math.random() < perHour * dt / 3600; }
    // How busy the town is at this hour: 1 by day and evening, nearly nobody at three in the morning.
    bustle() {
        const h = this.hour, eve = this.season.eve ? 1.5 : 0;
        return h >= 7 && h < 21.5 + eve ? 1 : h >= 21.5 + eve && h < 23.5 + eve ? 0.45 : h >= 5.5 && h < 7 ? 0.3 : 0.1;
    }

    update(dt, quiet) {
        const { config, L, scene } = this, t = this.time += dt, dark = this.light.dark;
        this.gust = Math.max(0, this.gust - dt * 0.25);
        this.wind = config.wind * (0.5 * Math.sin(t * 0.07) + 0.3 * Math.sin(t * 0.19 + 1) + 0.25) * (1 + this.gust * 1.6) + this.gust * 0.8 * Math.sign(Math.sin(t * 0.07) + 0.3);
        this.updateSky();
        if (this.host.now().toDateString() !== this.day && !quiet) { this.resize(); return; }     // midnight: one more house decorated
        const k = villageEase(0.9, dt);
        for (const name of ['aurora', 'reflections']) this.fx[name] += (this.fxTarget[name] - this.fx[name]) * k;

        this.updateSnow(dt);
        for (const c of this.clouds) { c.x += c.speed * (0.4 + Math.abs(this.wind)) * dt * (this.wind >= 0 ? 1 : -1); if (c.x > this.W + c.w) c.x = -c.w; if (c.x < -c.w) c.x = this.W + c.w; }

        for (const s of this.skaters) s.update(dt);
        if (this.ice && (this.timers.melt = (this.timers.melt || 0) + dt) > 1.5) {
            // The marks fade: a little of the ice comes back, every so often.
            this.timers.melt = 0;
            const g = this.iceG, p = L.pond;
            g.save(); g.globalCompositeOperation = 'destination-out'; g.fillStyle = 'rgba(0,0,0,0.045)';
            g.fillRect(p.cx - p.rx * 1.1, p.cy - p.ry * 1.1, p.rx * 2.2, p.ry * 2.2);
            g.restore();
        }
        this.updateTown(dt, quiet);
        for (const w of this.walkers) w.update(dt);
        this.walkers = this.walkers.filter(w => !w.done);
        for (const d of this.dogs) d.update(dt);
        this.dogs = this.dogs.filter(d => !d.done);
        for (const c of this.cats) c.update(dt);
        for (const tr of scene.trees) if (tr.shake > 0) tr.shake -= dt;
        for (const s of this.sledders) s.update(dt);
        for (const d of this.deer) d.update(dt);
        if (this.train) this.train.update(dt);
        this.updateFarm(dt);
        this.updateCabin(dt, quiet);
        this.updateSky2(dt, quiet);
        this.updateBits(dt);
        if (!quiet) {
            this.syncGlow();
            if (t - this.lastBakeCheck > 4) { this.lastBakeCheck = t; if (this.bakesLost()) this.recover('blank layers'); }
        }
    }

    flakeCount() {
        const area = this.W * this.H / (1280 * 800);
        return Math.min(1800, Math.round(520 * this.config.snowfall * this.density() * Math.max(0.5, area)));
    }
    updateSnow(dt) {
        const { W, H, flakes } = this, want = this.flakeCount(), s = this.L.s;
        // Toward the count a few at a time, so a change of tier never shows.
        for (let i = 0; i < 12 && flakes.length < want; i++) {
            const z = Math.random();        // 0 far … 1 near
            flakes.push({ x: Math.random() * W, y: this.seeded ? -8 : Math.random() * H, z, r: (0.7 + z * z * 2.6) * (0.8 + Math.random() * 0.5), v: (16 + z * 46) * (0.8 + Math.random() * 0.4), sway: Math.random() * 6.28, rate: 0.6 + Math.random() * 1.4 });
        }
        if (flakes.length > want) flakes.length = Math.max(want, flakes.length - 12);
        const push = this.wind * 46 * s;
        for (const f of flakes) {
            f.y += f.v * s * dt * (1 + this.gust * 0.5);
            f.x += (push * (0.35 + f.z) + Math.sin(this.time * f.rate + f.sway) * 7 * s * (0.4 + f.z)) * dt;
            if (f.y > H + 6) { f.y = -6; f.x = Math.random() * W; }
            if (f.x < -8) f.x += W + 16; else if (f.x > W + 8) f.x -= W + 16;
        }
    }

    // The street: villagers on errands, carollers, dogs; the smoke; the hour striking.
    updateTown(dt, quiet) {
        const { config, L, scene } = this, dark = this.light.dark, busy = this.bustle();
        if (config.village && this.walkers.filter(w => !w.offset).length < Math.round(config.villagers * busy * Math.max(0.5, this.density())) && Math.random() < dt * 0.8) this.sendVillager();
        if (config.village && config.carollers > 0 && dark > 0.4 && busy > 0.4 && !this.singers() && this.chance(config.carollers * (this.season.eve ? 2 : 1), dt)) this.carol();
        if (config.dogs > 0 && this.dogs.length < 2 && this.chance(config.dogs * 0.5 * busy, dt)) this.looseDog();
        this.singing = this.singing.filter(s => s.until > this.time);
        for (const s of this.singing) if (Math.random() < dt * 2.2) this.note(s.x + (Math.random() - 0.5) * 22 * s.k, s.y - 20 * s.k, Math.random() < 0.5 ? '♪' : '♫', 1);
        // Smoke from the chimneys.
        if (config.smoke) {
            for (const c of scene.chimneys) {
                if (c.cold === undefined) c.cold = c.owner !== 'cabin' && c.owner !== 'hut' && Math.random() < 0.25;
                if (c.cold || Math.random() > dt * 2.4 || this.puffs.length > 150 * Math.max(0.4, this.density())) continue;
                this.puffs.push({ x: c.x, y: c.y, k: c.k, vx: (Math.random() - 0.5) * 2, age: 0, life: 4 + Math.random() * 3, r: 1.6 + Math.random() });
            }
        }
        for (const p of this.puffs) { p.age += dt; p.y -= (7 + p.age) * p.k * dt; p.x += (p.vx + this.wind * 9 * (0.4 + p.age * 0.5)) * p.k * dt; }
        this.puffs = this.puffs.filter(p => p.age < p.life);
        // The bonfire's sparks.
        if (L.fire && dark > 0.1 && Math.random() < dt * 9 && this.sparks.length < 40) this.sparks.push({ x: L.fire.x + (Math.random() - 0.5) * 8 * L.fire.k, y: L.fire.y - 6 * L.fire.k, vx: (Math.random() - 0.5) * 9 + this.wind * 10, vy: -(14 + Math.random() * 20), age: 0, life: 1 + Math.random() * 1.6 });
        if (!L.fire) this.sparks = [];
        for (const s of this.sparks) { s.age += dt; s.x += s.vx * L.fire.k * dt; s.y += s.vy * L.fire.k * dt; }
        this.sparks = this.sparks.filter(s => s.age < s.life);
        // The meetinghouse clock strikes the hour.
        if (!quiet && scene.church && config.callouts && this.config.sky === 'live') {
            const h = Math.floor(this.hour);
            if (this.struck === null) this.struck = h;
            else if (h !== this.struck) { this.struck = h; const twelve = h % 12 || 12; this.host.toast(`🔔 The meetinghouse clock strikes ${['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'][twelve - 1]}`, 4000); }
        }
    }

    singers() { return this.walkers.some(w => w.offset); }
    frontDoors() { return this.scene.doors.filter(d => d.owner && d.owner.row === 'front'); }
    edge(side) { return { x: side < 0 ? (this.L.farm ? this.L.farm.x1 - 20 * this.L.s : -30) : this.W + 30, y: this.L.walkY + (Math.random() - 0.5) * 8 * this.L.s }; }

    sendVillager() {
        const { L, scene, config } = this, s = L.s, doors = this.frontDoors(), lane = () => L.walkY + (Math.random() - 0.5) * 9 * s;
        const start = Math.random() < 0.55 && doors.length ? villagePick(doors) : null;
        const from = start ? { x: start.x, y: start.y + 2 * s } : this.edge(Math.random() < 0.3 ? -1 : 1);
        const route = [from];
        if (start) route.push({ x: start.x, y: lane() });
        const r = Math.random();
        let carry = null, child = Math.random() < 0.22;
        const leave = () => {
            const d = Math.random() < 0.5 && doors.length ? villagePick(doors) : null;
            if (d && d !== start) route.push({ x: d.x, y: lane() }, { x: d.x, y: d.y + 2 * s, gone: true });
            else { const e = this.edge(Math.random() < 0.3 ? -1 : 1); route.push({ x: e.x, y: e.y, gone: true }); }
        };
        if (r < 0.26 && L.hut && this.hour < 23.5 && this.hour > 9) {
            // Down to the hut for a cocoa, and a while by the fire or watching the skaters.
            const h = scene.hut.doors[0].p, k = L.hut.k;
            route.push({ x: h[0] + 20 * k, y: lane() }, { x: h[0], y: h[1] + 3 * k, wait: 3 + Math.random() * 3, pose: 'stand', face: 1, carry: 'cup' });
            if (L.fire && Math.random() < 0.6) route.push({ x: L.fire.x + (Math.random() < 0.5 ? -1 : 1) * (15 + Math.random() * 8) * L.fire.k, y: L.fire.y + (3 + Math.random() * 5) * L.fire.k, wait: 12 + Math.random() * 20, pose: 'stand' });
            else route.push({ x: h[0] - (26 + Math.random() * 30) * k, y: h[1] + (9 + Math.random() * 5) * k, wait: 10 + Math.random() * 16, pose: 'stand', face: -1 });
            route.push({ x: h[0] + 24 * k, y: lane(), carry: null });
        } else if (r < 0.46 && scene.grand) {
            // To stand and look up at the tree.
            const g = scene.grand;
            route.push({ x: g.x + (Math.random() - 0.5) * g.h * 0.9, y: g.y + (8 + Math.random() * 10) * s, wait: 7 + Math.random() * 12, pose: Math.random() < 0.4 ? 'look' : 'stand', face: Math.random() < 0.5 ? -1 : 1 });
        } else if (r < 0.62) carry = 'gift';
        leave();
        this.walkers.push(new VillageWalker(this, route, { carry, child, dog: config.dogs > 0 && !child && Math.random() < Math.min(0.5, config.dogs / 40) }));
    }

    // Carollers: four or five of them, door to door. The house they sing to lights every window.
    carol() {
        const { L } = this, s = L.s, doors = this.frontDoors().sort((a, b) => a.x - b.x);
        if (!doors.length) return false;
        const dir = Math.random() < 0.5 ? 1 : -1, stops = (dir > 0 ? doors : doors.reverse()).filter(() => Math.random() < 0.6).slice(0, 3);
        if (!stops.length) stops.push(doors[0]);
        const n = 4 + Math.floor(Math.random() * 2), start = this.edge(-dir), end = this.edge(dir);
        for (let i = 0; i < n; i++) {
            const off = { x: (i - (n - 1) / 2) * 6.5 * s, y: (i % 2) * 3 * s };
            const route = [{ x: start.x + off.x - dir * 20 * s, y: L.walkY + off.y }];
            for (const d of stops) {
                route.push({
                    x: d.x + off.x, y: L.walkY - 2 * s + off.y, wait: 13, pose: 'sing', face: i < n / 2 ? 1 : -1,
                    then: i ? null : () => { d.owner.sung = this.time + 15; this.singing.push({ x: d.x, y: L.walkY, k: L.depth(L.walkY), until: this.time + 13 }); },
                });
            }
            route.push({ x: end.x + off.x + dir * 20 * s, y: L.walkY + off.y, gone: true });
            this.walkers.push(new VillageWalker(this, route, { offset: off, speed: 13, carry: i === 0 ? 'lantern' : 'book', child: i === n - 1 && Math.random() < 0.5 }));
        }
        return true;
    }

    looseDog() {
        const d = new VillageDog(this, null), L = this.L;
        d.dir = Math.random() < 0.5 ? 1 : -1;
        d.x = d.dir > 0 ? -40 : this.W + 40;
        d.y = Math.random() < 0.5 ? L.bankY + Math.random() * 14 * L.s : L.walkY + (8 + Math.random() * 12) * L.s;
        this.dogs.push(d);
        return true;
    }

    // The tree farm: a family comes, chooses, saws, and drags it home; the stump grows a new one.
    updateFarm(dt) {
        const row = this.scene.farmRow;
        if (!row) return;
        for (const t of row.trees) {
            if (t.grown < 1) t.grown = Math.min(1, t.grown + dt / (t.grown < 0.05 ? 1200 : 440));      // a stump for a minute, then a sapling: eight minutes to a tree
            if (t.shake > 0) t.shake -= dt;
        }
        if (!this.party && this.config.farmVisits > 0 && this.hour > 8 && this.hour < 21.5 && this.chance(this.config.farmVisits, dt)) this.visitFarm();
        if (this.party && this.party.every(w => w.done)) this.party = null;
    }
    visitFarm() {
        const row = this.scene.farmRow, { L } = this, s = L.s;
        if (!row || this.party) return false;
        const ripe = row.trees.filter(t => t.grown >= 1 && !t.taken);
        if (!ripe.length) return false;
        const tree = villagePick(ripe), barn = this.scene.barn.doors[0].p, k = row.k;
        tree.taken = true;
        const out = this.edge(1), y = row.y + 5 * k;
        const adult = new VillageWalker(this, [
            { x: barn[0], y: barn[1] + 4 * s },
            { x: tree.x + 9 * k, y, wait: 2.2, pose: 'look', face: -1 },
            { x: tree.x + 6 * k, y: y + 0.01, wait: 4.5, pose: 'saw', face: -1, then: () => { tree.shake = 4.5; } },
            { x: tree.x + 6 * k, y: y + 0.02, wait: 0.9, pose: 'stand', face: -1, then: w => { tree.grown = 0; tree.taken = false; tree.fell = this.time; w.drag = tree; this.spray(tree.x, tree.y, 10, k); } },
            { x: barn[0] + 6 * s, y: barn[1] + 5 * s, wait: 2.5, pose: 'stand' },
            { x: L.vx0 + 10 * s, y: L.walkY + 2 * s },
            { x: out.x, y: out.y, gone: true },
        ], { speed: 12 });
        const child = new VillageWalker(this, [
            { x: barn[0] - 6 * s, y: barn[1] + 6 * s },
            { x: tree.x - 9 * k, y: y + 2 * k, wait: 8, pose: 'look', face: 1 },
            { x: barn[0], y: barn[1] + 8 * s, wait: 2, pose: 'stand' },
            { x: L.vx0 + 4 * s, y: L.walkY + 5 * s },
            { x: out.x + 10, y: out.y + 3 * s, gone: true },
        ], { child: true, speed: 13 });
        this.party = [adult, child];
        this.walkers.push(adult, child);
        return true;
    }
    // The tree somebody is dragging home, lying behind them.
    drawDragged(g, w, k) {
        const t = w.drag, sp = this.farmSprites[t.v % 4], scale = t.h / sp.tall;
        g.save();
        g.translate(w.x - w.dir * 3 * k, w.y - 1.5 * k);
        g.rotate(-w.dir * (Math.PI / 2 - 0.12));
        g.drawImage(this.toned(sp), -sp.ax * scale, -sp.ay * scale, sp.w * scale, sp.h * scale);
        g.restore();
    }

    updateCabin(dt, quiet) {
        const { scene, config } = this, c = scene.cabin;
        this.alarm = Math.max(0, this.alarm - dt);
        if (!c) return;
        if (config.owl && !this.owl && this.light.dark > 0.6 && this.chance(50, dt)) { this.owl = new VillageOwl(this); this.alarm = 3; }
        if (this.owl) { this.owl.update(dt); if (this.owl.done) this.owl = null; }
        if (config.roofSlides && !this.slide && !quiet && this.chance(40 * Math.max(0.3, config.snowfall), dt)) this.slideRoof();
        if (this.slide) {
            const sl = this.slide;
            sl.age += dt;
            if (sl.age > 1.5) { this.spray(c.slide.drop[0], c.slide.drop[1], 14, c.k * 1.4); this.slide = null; this.alarm = 4; }
        }
    }
    slideRoof() { if (!this.scene.cabin || this.slide) return false; this.slide = { age: 0 }; return true; }

    // The sky's own events: shooting stars, the northern lights, the sleigh.
    updateSky2(dt, quiet) {
        const { config, light } = this, dark = light.dark;
        if (this.shooting) { this.shooting.age += dt; if (this.shooting.age > this.shooting.life) this.shooting = null; }
        else if (config.stars && light.stars > 0.6 && !quiet && this.chance(70, dt)) this.shoot();
        // Northern lights: now and then, for a minute or so; every dark night if asked.
        if (config.aurora === 'always') this.auroraWant = 1;
        else if (config.aurora === 'never') this.auroraWant = 0;
        else {
            this.timers.aurora = (this.timers.aurora || 0) - dt;
            if (this.timers.aurora <= 0) { this.auroraWant = this.auroraWant ? 0 : 1; this.timers.aurora = this.auroraWant ? 50 + Math.random() * 60 : 150 + Math.random() * 260; if (this.time < 30) this.auroraWant = 0; }
        }
        this.aurora += ((dark > 0.85 ? this.auroraWant : 0) - this.aurora) * villageEase(0.25, dt);
        if (this.sleigh) { this.sleigh.update(dt); if (this.sleigh.done) this.sleigh = null; }
        else if (config.sleigh > 0 && dark > 0.8 && !quiet && this.time > 20 && this.chance(config.sleigh * (this.season.eve ? 6 : 1), dt)) this.fly(false);
    }
    shoot() {
        const { W, L } = this;
        this.shooting = { x: W * (0.1 + Math.random() * 0.8), y: L.hz * (0.05 + Math.random() * 0.4), vx: (Math.random() < 0.5 ? -1 : 1) * W * (0.25 + Math.random() * 0.25), vy: L.hz * (0.12 + Math.random() * 0.2), age: 0, life: 0.7 + Math.random() * 0.5 };
    }
    // The sleigh: across the moon, if the moon is up where it can be crossed.
    fly(say) {
        if (this.sleigh) return null;
        const m = this.moonAt();
        this.sleigh = new VillageSleigh(this, this.config.moon && this.moon.alt > 8 && m.y < this.L.hz * 0.8 ? m : null);
        this.alarm = 8;
        if (this.config.callouts && (say || this.season.eve)) return '🔔 Sleigh bells…';
        return null;
    }

    updateBits(dt) {
        for (const b of this.bits) { b.age += dt; b.vy += b.g * dt; b.x += b.vx * dt; b.y += b.vy * dt; if (b.kind === 'steam') b.r += dt * 1.6; }
        this.bits = this.bits.filter(b => b.age < b.life);
        for (const n of this.notes) { n.age += dt; n.y -= 9 * this.L.s * dt; }
        this.notes = this.notes.filter(n => n.age < n.life);
        for (const p of this.prints) p.age += dt * Math.max(0.2, this.config.snowfall);
        while (this.prints.length && this.prints[0].age > 70) this.prints.shift();
    }

    // ---- Taps and keys --------------------------------------------------------------

    tapAt(x, y) {
        const { L, scene } = this, s = L.s, near = (o, r) => Math.hypot(o.x - x, (o.y - y)) < r;
        const cat = this.cats.find(c => near({ x: c.x, y: c.y - 4 * c.k() }, 12 * s));
        if (cat) return cat.poke();
        const skater = this.skaters.filter(k => Math.hypot(k.x - x, k.y - 9 * s - y) < 16 * s).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
        if (skater) return skater.poke();
        if (y < L.hz * 0.6 && this.light.stars > 0.3) return this.shoot();
        if (scene.cabin && Math.hypot(x - scene.cabin.x, y - (scene.cabin.y - 12 * scene.cabin.k)) < 34 * scene.cabin.k) return this.slideRoof();
        // A tree: the snow comes off it.
        const tree = [...scene.trees, ...(scene.farmRow ? scene.farmRow.trees : [])].find(t => Math.abs(t.x - x) < t.h * 0.22 && y < t.y && y > t.y - t.h);
        if (tree) { for (let i = 0; i < 5; i++) this.spray(tree.x + (Math.random() - 0.5) * tree.h * 0.3, tree.y - tree.h * (0.3 + Math.random() * 0.5), 5, s); tree.shake = 1; return; }
        // A house: its lights go on, or off; and a puff from its chimney.
        const house = scene.houses.find(h => Math.abs(h.x - x) < h.w / 2 && y < h.y + 4 * h.k && y > h.y - 62 * h.k);
        if (house) {
            const lit = scene.windows.some(w => w.owner === house && this.isLit(w));
            house.forced = !lit;
            for (const c of scene.chimneys) if (c.owner === house) for (let i = 0; i < 4; i++) this.puffs.push({ x: c.x, y: c.y - i * 2, k: c.k, vx: (Math.random() - 0.5) * 3, age: 0, life: 4 + Math.random() * 2, r: 2.2 });
        }
    }

    // Keys (catalog): each returns a toast, or nothing.
    callSleigh() { return this.light.dark < 0.5 ? '🛷 Not before dark' : this.fly(true) || '🛷 It’s on its way already'; }
    callCarollers() { return this.singers() ? '🎶 They’re out already' : this.config.village && this.carol() ? '🎶 The carollers are out' : null; }
    callAurora() { if (this.light.dark < 0.85) return '🌌 Too bright for northern lights'; this.auroraWant = 1; this.timers.aurora = 70; return '🌌 Northern lights'; }
    flurry() { this.gust = 1; return '🌬️ A flurry'; }
    callFamily() { return this.visitFarm() ? '🌲 A family comes for a tree' : null; }
    callDog() { return this.looseDog() && '🐕 Somebody is loose'; }
    report() {
        const d = this.sky, s = this.season, pad = n => String(n).padStart(2, '0');
        const when = s.eve ? 'Christmas Eve' : s.day ? 'Christmas Day' : s.daysTo > 0 ? `${s.daysTo} day${s.daysTo === 1 ? '' : 's'} to Christmas` : `${-s.daysTo} days since Christmas`;
        return `🕰️ ${d.getHours()}:${pad(d.getMinutes())} in Evergreen Hollow · ${when} · ${HarvestSky.moonTitle(d, this.moon.age)}`;
    }

    // ---- Drawing ----------------------------------------------------------------------

    altY(alt) { return this.L.hz - alt / 62 * (this.L.hz - this.H * 0.07); }
    moonAt() { return { x: this.moon.x * this.W, y: this.altY(this.moon.alt) }; }
    lightsOn() { return this.config.lights ? Math.max(this.config.lightsByDay ? 0.3 : 0, Math.min(1, this.light.dark * 2.5)) : 0; }

    draw() {
        const { ctx, dpr, W, H, L, light, config, scene } = this, dark = light.dark, t = this.time;
        if (this.landDirty) this.washLand();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        this.drawSky(ctx);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(this.washed, 0, 0);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // What shines on the land: windows, lamps, then the strings twinkling.
        const glowA = Math.min(1, dark * 3);
        if (glowA > 0.01) { ctx.globalAlpha = glowA; ctx.drawImage(scene.glow, 0, scene.top, W, H - scene.top); ctx.globalAlpha = 1; }
        this.drawCabinLight(ctx);
        const on = this.lightsOn(), tw = config.twinkle, wave = tw > 0 ? Math.sin(t * 1.9 * tw) : 0;
        this.bulbA = on * (tw > 0 ? 0.62 + 0.38 * wave : 1);
        this.bulbB = on * (tw > 0 ? 0.62 - 0.38 * wave : 1);
        if (on > 0.01) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = this.bulbA; ctx.drawImage(scene.twinkle[0], 0, scene.top, W, H - scene.top);
            ctx.globalAlpha = this.bulbB; ctx.drawImage(scene.twinkle[1], 0, scene.top, W, H - scene.top);
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
        }
        if (scene.church) this.drawClock(ctx);
        this.drawSmoke(ctx);
        if (L.pond) this.drawPond(ctx);
        this.drawPrints(ctx);
        this.drawCast(ctx);
        this.drawBits(ctx);
        this.drawSnow(ctx);
    }

    drawSky(ctx) {
        const { W, H, L, light, config } = this, hz = L.hz;
        const rgb = c => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
        const sky = ctx.createLinearGradient(0, 0, 0, hz);
        sky.addColorStop(0, rgb(light.top));
        sky.addColorStop(0.55, rgb(light.mid));
        sky.addColorStop(1, rgb(light.horizon));
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, W, H);
        if (config.stars && light.stars > 0.01) {
            ctx.globalAlpha = light.stars;
            ctx.drawImage(this.starLayer, 0, 0, W, hz + L.Hu * 0.02);
            ctx.fillStyle = '#ffffff';
            for (const s of this.twinkle) { ctx.globalAlpha = light.stars * (0.3 + 0.7 * Math.abs(Math.sin(this.time * s.rate + s.phase))); ctx.fillRect(s.x - 0.6, s.y - 0.6, 2.4, 2.4); }
            ctx.globalAlpha = 1;
            if (this.shooting) {
                const s = this.shooting, x = s.x + s.vx * s.age, y = s.y + s.vy * s.age, fade = Math.sin(Math.min(1, s.age / s.life) * Math.PI);
                const g = ctx.createLinearGradient(x, y, x - s.vx * 0.12, y - s.vy * 0.12);
                g.addColorStop(0, `rgba(255,252,240,${0.9 * fade})`);
                g.addColorStop(1, 'rgba(255,252,240,0)');
                ctx.strokeStyle = g; ctx.lineWidth = 1.6;
                ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - s.vx * 0.12, y - s.vy * 0.12); ctx.stroke();
            }
        }
        // Northern lights, swaying.
        const aurora = this.aurora * this.fx.aurora;
        if (aurora > 0.01) {
            ctx.globalCompositeOperation = 'lighter';
            for (let i = 0; i < 2; i++) {
                ctx.globalAlpha = aurora * (0.55 + 0.3 * Math.sin(this.time * 0.23 + i * 2.1));
                ctx.drawImage(this.auroraLayer, -W * 0.25 + Math.sin(this.time * 0.05 + i * 1.7) * W * 0.2, hz * (0.02 + i * 0.08), W * 1.5, hz * 0.8);
            }
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
        }
        // The sun, low and pale; the moon in its phase.
        if (this.sun.alt > -3) {
            const x = this.sun.x * W, y = this.altY(this.sun.alt), r = 150 * L.s;
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.85;
            ctx.drawImage(VillageScene.bulbSprite(light.twilight > 0.3 ? '#ffb070' : '#ffe9c0', this.dpr), x - r, y - r, r * 2, r * 2);
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#fff8e6';
            ctx.beginPath(); ctx.arc(x, y, 11 * L.s, 0, 6.2832); ctx.fill();
        }
        if (config.moon && this.moon.alt > -4) this.drawMoon(ctx);
        if (this.sleigh) this.sleigh.draw(ctx);
        this.drawClouds(ctx);
    }

    drawMoon(ctx) {
        const { L, moon, dpr } = this, R = 21 * L.s * this.config.moonSize, at = this.moonAt();
        const key = `${Math.round(moon.phase * 60)}|${R}`;
        if (this.moonCache.key !== key) {
            const [c, g] = VillageArt.canvas(R * 2 + 4, R * 2 + 4, dpr), cx = R + 2;
            const disc = g.createRadialGradient(cx - R * 0.3, cx - R * 0.3, R * 0.1, cx, cx, R);
            disc.addColorStop(0, '#fffdf2'); disc.addColorStop(1, '#e6e2d2');
            g.fillStyle = disc;
            g.beginPath(); g.arc(cx, cx, R, 0, 6.2832); g.fill();
            g.fillStyle = 'rgba(150,150,160,0.2)';
            for (const [x, y, r] of [[-0.3, -0.25, 0.26], [0.2, -0.4, 0.17], [0.32, 0.12, 0.22], [-0.2, 0.35, 0.2], [-0.5, 0.05, 0.12]]) { g.beginPath(); g.arc(cx + x * R, cx + y * R, r * R, 0, 6.2832); g.fill(); }
            // The unlit part, cut away: a half disc and the terminator's ellipse.
            const waxing = moon.phase < 0.5, k = Math.cos(moon.phase * 6.2832);
            g.globalCompositeOperation = 'destination-out';
            g.fillStyle = 'rgba(0,0,0,0.95)';
            g.save();
            g.translate(cx, cx);
            if (!waxing) g.scale(-1, 1);
            g.beginPath();
            g.arc(0, 0, R + 1, -Math.PI / 2, Math.PI / 2, true);
            g.ellipse(0, 0, Math.abs(k) * R, R + 1, 0, Math.PI / 2, -Math.PI / 2, k > 0);
            g.fill();
            g.restore();
            this.moonCache = { key, c, size: R * 2 + 4 };
        }
        const up = VillageLogic.smooth(-4, 3, moon.alt), glow = R * 4.5;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.5 * moon.illum * up * (0.4 + 0.6 * this.light.dark);
        ctx.drawImage(VillageScene.bulbSprite('#9db8e8', dpr), at.x - glow, at.y - glow, glow * 2, glow * 2);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = up * (0.55 + 0.45 * this.light.dark);
        ctx.drawImage(this.moonCache.c, at.x - R - 2, at.y - R - 2, this.moonCache.size, this.moonCache.size);
        ctx.globalAlpha = 1;
    }

    drawClouds(ctx) {
        const { light, dpr } = this;
        const key = `${light.cloudLit.map(v => Math.round(v / 8)).join()}|${light.cloudShade.map(v => Math.round(v / 8)).join()}`;
        for (const c of this.clouds) {
            if (!c.sprite || c.key !== key) {
                const pad = c.w * 0.3, [cv, g] = VillageArt.canvas(c.w + pad * 2, c.w * 0.5, Math.min(1, dpr));
                for (const [dy, col, a] of [[5, light.cloudShade, 0.5], [0, light.cloudLit, 0.6]]) {
                    for (const p of c.puffs) {
                        const x = c.w / 2 + pad + p.x, y = c.w * 0.25 + p.y + dy, fill = g.createRadialGradient(x, y, 0, x, y, p.r);
                        fill.addColorStop(0, `rgba(${col[0] | 0},${col[1] | 0},${col[2] | 0},${a})`);
                        fill.addColorStop(1, `rgba(${col[0] | 0},${col[1] | 0},${col[2] | 0},0)`);
                        g.fillStyle = fill;
                        g.fillRect(x - p.r, y - p.r, p.r * 2, p.r * 2);
                    }
                }
                c.sprite = cv; c.key = key; c.pad = pad;
            }
            ctx.globalAlpha = 0.9;
            ctx.drawImage(c.sprite, c.x - c.w / 2 - c.pad, c.y - c.w * 0.25, c.w + c.pad * 2, c.w * 0.5);
        }
        ctx.globalAlpha = 1;
    }

    // The cabin's windows: firelight, never quite steady.
    drawCabinLight(ctx) {
        const c = this.scene.cabin, dark = this.light.dark;
        if (!c || !this.config.windows || dark < 0.08) return;
        const flick = 0.82 + 0.1 * Math.sin(this.time * 7.3) + 0.08 * Math.sin(this.time * 12.7 + 1), a = Math.min(1, dark * 3);
        for (const w of c.windows) {
            const q = w.q, cx = (q[0][0] + q[2][0]) / 2, cy = (q[0][1] + q[2][1]) / 2, r = 9 * c.k;
            ctx.globalAlpha = a * flick;
            ctx.fillStyle = '#ffb84e';
            ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(q[i][0], q[i][1]); ctx.closePath(); ctx.fill();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = a * flick * 0.7;
            ctx.drawImage(this.warm, cx - r, cy - r, r * 2, r * 2);
            ctx.globalCompositeOperation = 'source-over';
        }
        // The glow it throws on the clearing.
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a * flick * 0.22;
        ctx.drawImage(this.warm, c.x - 44 * c.k, c.y - 6 * c.k, 70 * c.k, 18 * c.k);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        // The snow letting go of the roof.
        if (this.slide) {
            const sl = c.slide, u = Math.min(1, this.slide.age / 1.1) ** 2, x = sl.a[0] + (sl.b[0] - sl.a[0]) * u, y = sl.a[1] + (sl.b[1] - sl.a[1]) * u + Math.max(0, this.slide.age - 1.1) * 60 * c.k;
            ctx.fillStyle = this.tone('#ffffff');
            ctx.beginPath(); ctx.ellipse(x, y, sl.w / 2, 2.4 * c.k, 0.05, 0, 6.2832); ctx.fill();
        }
    }

    drawClock(ctx) {
        const { p, r } = this.scene.church.clock, d = this.sky, h = (d.getHours() % 12 + d.getMinutes() / 60) / 12 * 6.2832, m = (d.getMinutes() + d.getSeconds() / 60) / 60 * 6.2832;
        const lit = this.light.dark > 0.3;
        if (lit) { ctx.globalAlpha = 0.85; ctx.fillStyle = '#ffe9b0'; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 6.2832); ctx.fill(); ctx.globalAlpha = 1; }
        ctx.strokeStyle = lit ? '#2a1c14' : this.tone('#20242c');
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(0.8, r * 0.2);
        ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + Math.sin(h) * r * 0.5, p[1] - Math.cos(h) * r * 0.5); ctx.stroke();
        ctx.lineWidth = Math.max(0.6, r * 0.13);
        ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + Math.sin(m) * r * 0.8, p[1] - Math.cos(m) * r * 0.8); ctx.stroke();
        ctx.lineCap = 'butt';
    }

    drawSmoke(ctx) {
        ctx.fillStyle = this.tone('#e9edf4');
        for (const p of this.puffs) {
            const u = p.age / p.life;
            ctx.globalAlpha = 0.34 * Math.sin(Math.min(1, u * 4) * Math.PI / 2) * (1 - u);
            ctx.beginPath(); ctx.arc(p.x, p.y, (p.r + p.age * 1.5) * p.k, 0, 6.2832); ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    // The ice: the lights in it, the moon on it, and the marks of the skates.
    drawPond(ctx) {
        const { L, scene, config, W, H } = this, p = L.pond, dark = this.light.dark, shore = p.cy - p.ry;
        const shine = config.reflections ? this.fx.reflections * Math.min(1, dark * 2) : 0;
        if (shine > 0.02) {
            ctx.save();
            VillageArt.pondPath(ctx, p, 0.985);
            ctx.clip();
            // Everything above the far shore, upside down in the ice and squashed.
            ctx.translate(0, shore);
            ctx.scale(1, -0.36);
            ctx.translate(0, -shore);
            ctx.globalAlpha = 0.22 * shine;
            ctx.drawImage(scene.glow, 0, scene.top, W, H - scene.top);
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.5 * shine * this.bulbA; ctx.drawImage(scene.twinkle[0], 0, scene.top, W, H - scene.top);
            ctx.globalAlpha = 0.5 * shine * this.bulbB; ctx.drawImage(scene.twinkle[1], 0, scene.top, W, H - scene.top);
            ctx.restore();
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
        }
        if (config.moon && this.moon.alt > 4 && dark > 0.4) {
            const at = this.moonAt(), x = VillageLogic.clamp(at.x, p.cx - p.rx * 0.8, p.cx + p.rx * 0.8);
            ctx.save();
            VillageArt.pondPath(ctx, p, 0.97);
            ctx.clip();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.22 * this.moon.illum * dark;
            ctx.drawImage(VillageScene.bulbSprite('#9db8e8', this.dpr), x - p.rx * 0.16, p.cy - p.ry * 1.4, p.rx * 0.32, p.ry * 2.8);
            ctx.restore();
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
        }
        if (this.ice && config.tracks) {
            ctx.globalAlpha = 0.75 - 0.4 * dark;
            ctx.drawImage(this.ice, p.cx - p.rx * 1.1, p.cy - p.ry * 1.1, p.rx * 2.2, p.ry * 2.2);
            ctx.globalAlpha = 1;
        }
    }

    drawPrints(ctx) {
        ctx.fillStyle = this.tone('#9fb3d2');
        for (const p of this.prints) {
            ctx.globalAlpha = 0.7 * (1 - p.age / 70);
            ctx.fillRect(p.x - p.k, p.y - 0.5 * p.k, 1.3 * p.k, 0.8 * p.k);
            ctx.fillRect(p.x + 0.9 * p.k, p.y + 0.4 * p.k, 1.3 * p.k, 0.8 * p.k);
        }
        ctx.globalAlpha = 1;
    }

    drawTree(ctx, t) {
        const sp = t.sprite, shake = t.shake > 0 ? Math.sin(this.time * 40) * 1.2 * t.shake : 0;
        if (t.grand && this.train) this.train.draw(ctx, false);
        ctx.drawImage(this.toned(sp), t.x - sp.ax + shake, t.y - sp.ay, sp.w, sp.h);
        if (t.layers && this.bulbA + this.bulbB > 0.02) {
            const x = t.x - sp.ax - t.pad + shake, y = t.y - sp.ay - t.pad, w = sp.w + t.pad * 2, h = sp.h + t.pad * 2;
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = this.bulbA; ctx.drawImage(t.layers[0], x, y, w, h);
            ctx.globalAlpha = this.bulbB; ctx.drawImage(t.layers[1], x, y, w, h);
            if (t.grand && this.light.dark > 0.2) {
                // The grand tree lights the snow round it.
                ctx.globalAlpha = 0.3 * Math.min(1, this.light.dark * 2);
                ctx.drawImage(this.warm, t.x - t.h * 0.6, t.y - t.h * 0.1, t.h * 1.2, t.h * 0.24);
            }
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
        }
        if (t.grand && this.train) this.train.draw(ctx, true);
    }

    drawFarmTree(ctx, t) {
        if (t.grown < 0.03) {
            ctx.fillStyle = this.tone('#6b4a33');
            ctx.fillRect(t.x - 1.2, t.y - 2.2, 2.4, 2.2);
            return;
        }
        const sp = this.farmSprites[t.v % 4], scale = t.h / sp.tall * (0.25 + 0.75 * t.grown), shake = t.shake > 0 ? Math.sin(this.time * 30) * 1.5 : 0;
        ctx.drawImage(this.toned(sp), t.x - sp.ax * scale + shake, t.y - sp.ay * scale, sp.w * scale, sp.h * scale);
        if (t.lit && t.grown >= 1 && this.bulbA + this.bulbB > 0.02) {
            const colors = this.scene.colors, h = t.h;
            for (let i = 0; i < 9; i++) {
                const u = i / 9, y = t.y - h * (0.12 + u * 0.74), half = h * 0.2 * (1 - u * 0.9);
                ctx.globalAlpha = i % 2 ? this.bulbA : this.bulbB;
                ctx.fillStyle = colors[i % colors.length];
                ctx.fillRect(t.x + Math.sin(i * 2.4) * half - 0.8, y, 1.7, 1.7);
            }
            ctx.globalAlpha = 1;
        }
    }

    drawFire(ctx) {
        const f = this.L.fire, k = f.k, t = this.time, dark = this.light.dark;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.25 + 0.5 * dark;
        const r = (30 + 3 * Math.sin(t * 9)) * k;
        ctx.drawImage(this.warm, f.x - r, f.y - 8 * k - r, r * 2, r * 2);
        ctx.globalAlpha = (0.12 + 0.3 * dark);
        ctx.drawImage(this.warm, f.x - 52 * k, f.y - 9 * k, 104 * k, 22 * k);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        for (const [color, scale, ph] of [['#e8541c', 1, 0], ['#ffa126', 0.72, 1.7], ['#ffe27a', 0.42, 3.1]]) {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(f.x - 6 * k * scale, f.y - 2 * k);
            for (let i = 0; i <= 6; i++) {
                const u = i / 6, w = Math.sin(u * Math.PI), flick = Math.sin(t * (7 + i) + ph + i * 1.3);
                ctx.lineTo(f.x + (u - 0.5) * 12 * k * scale + flick * 1.2 * k, f.y - 2 * k - (w * 15 + (i % 2) * 4 + flick * 2.5) * k * scale);
            }
            ctx.lineTo(f.x + 6 * k * scale, f.y - 2 * k);
            ctx.closePath();
            ctx.fill();
        }
        ctx.fillStyle = '#ffd27a';
        for (const s of this.sparks) { ctx.globalAlpha = 1 - s.age / s.life; ctx.fillRect(s.x, s.y, 1.3 * k, 1.3 * k); }
        ctx.globalAlpha = 1;
    }

    // Everyone and every tree among them, far to near.
    drawCast(ctx) {
        const { L, scene } = this, list = [];
        const add = (y, draw) => list.push({ y, draw });
        for (const t of scene.trees) add(t.y, () => this.drawTree(ctx, t));
        if (scene.farmRow) for (const t of scene.farmRow.trees) add(t.y, () => this.drawFarmTree(ctx, t));
        for (const s of this.skaters) add(s.y, () => s.draw(ctx));
        for (const w of this.walkers) add(w.y, () => w.draw(ctx));
        for (const d of this.dogs) add(d.y, () => d.draw(ctx));
        for (const s of this.sledders) add(s.y ?? L.sled.y0, () => s.draw(ctx));
        for (const c of this.cats) add(c.state === 'walk' || ['fire', 'step', 'wall', 'porch'].includes(c.spot.kind) ? c.y : c.y + 40 * L.s, () => c.draw(ctx));
        for (const d of this.deer) add(d.y - L.Hu, () => d.draw(ctx));
        if (this.owl) add(-1e4, () => this.owl.draw(ctx));
        if (L.fire) add(L.fire.y, () => this.drawFire(ctx));
        list.sort((a, b) => a.y - b.y);
        for (const item of list) item.draw();
    }

    drawBits(ctx) {
        for (const b of this.bits) {
            const u = b.age / b.life;
            ctx.globalAlpha = b.kind === 'steam' ? 0.4 * (1 - u) : 1 - u * u;
            ctx.fillStyle = this.tone(b.kind === 'steam' ? '#eef1f6' : '#ffffff');
            ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.2832); ctx.fill();
        }
        ctx.textAlign = 'center';
        for (const n of this.notes) {
            const u = n.age / n.life;
            ctx.globalAlpha = Math.sin(Math.min(1, u * 5) * Math.PI / 2) * (1 - u);
            ctx.fillStyle = n.ch === '♥' ? '#ff6b81' : this.light.dark > 0.4 ? '#fff2c8' : '#3a4a6a';
            ctx.font = `${Math.round(11 * this.L.s * n.size)}px Georgia, serif`;
            ctx.fillText(n.ch, n.x + Math.sin(n.age * 2.4 + n.sway) * 3 * this.L.s, n.y);
        }
        ctx.globalAlpha = 1;
    }

    drawSnow(ctx) {
        const { flakes, light, config } = this, size = config.flakeSize;
        if (!flakes.length) return;
        // By night the flakes catch what light there is: brighter than the land behind them.
        const b = Math.round(255 - 70 * light.dark), color = `rgb(${b},${b + Math.round(8 * light.dark)},${Math.min(255, b + Math.round(26 * light.dark))})`;
        ctx.fillStyle = color;
        for (const band of [0, 1]) {
            ctx.globalAlpha = band ? 0.85 : 0.55;
            ctx.beginPath();
            for (const f of flakes) {
                if (f.z >= 0.72 || (f.z >= 0.38) !== !!band) continue;
                const r = f.r * size;
                ctx.rect(f.x, f.y, r, r);
            }
            ctx.fill();
        }
        ctx.globalAlpha = 0.9 - 0.25 * light.dark;
        for (const f of flakes) {
            if (f.z < 0.72) continue;
            const r = f.r * size * 1.25;
            ctx.drawImage(this.flakeSprite, f.x - r, f.y - r, r * 2, r * 2);
        }
        ctx.globalAlpha = 1;
    }
}
