// Sky Island (SPEC §10.31): a village on a terraced island floating in an
// enormous sky, in 16-bit pixel art. A new island every load (or one kept
// by its seed): three tiers of ground stepping down from a crag with a
// castle tower and a windmill, through the village round its square, to
// the lake and the farm; a spring that falls into the pond, the pond into
// the lake, and the lake over the edge in a cascade that dissolves into
// the sea of cloud below, where the far ground rolls slowly past. The
// island's underside is banded rock trailing roots, with something cyan
// crackling in its cracks and bits of rock in orbit. A town of little
// people with jobs and a day; cats everywhere (the owner's, by name and
// temperament, and strays), dogs, birds, deer, goats, ducks, a fox at
// dusk, an owl at night, and something in a cave in the cliff. The real
// clock lights the sky; the real date dresses the island for the season
// and the holiday. Other islands drift past (whole islands of their own),
// a small one may come and orbit for a while, and a balloon brings a
// visitor.
//
// The canvas is the picture at its own resolution (a pixel is a couple of
// CSS pixels) and CSS scales it up pixelated, so a frame is cheap: the
// terrain, the sky, the cloud sea and the ground are baked, everything
// standing on the island is a sprite drawn in order of where it stands,
// and the night is one tint over the lot.

class SkyIslandAnimationManager {
    constructor(host) {
        this.host = host;
        this.config = WP.settings.load();
        this.running = false;
        this.time = 0;
        this.listeners = [];
        this.sparks = [];
        this.puffs = [];
        this.drops = [];
        this.flakes = [];
        this.leaves = [];
        this.bugs = [];
        this.rockets = [];
        this.confetti = [];
        this.ripples = [];
        this.lightOverride = {};
        this.scroll = 0;
        this.stats = { frames: 0, bakes: 0, skies: 0, fireworks: 0 };
        this.epoch = host.now();
        this.quality = host.quality;
    }

    // ---- Lifecycle --------------------------------------------------------------------------------

    start() {
        if (this.running) return;
        this.running = true;
        this.canvas = document.createElement('canvas');
        Object.assign(this.canvas.style, { position: 'fixed', left: '0', top: '0', zIndex: '-1', pointerEvents: 'none', imageRendering: 'pixelated' });
        document.body.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
        this.scratch = document.createElement('canvas');
        this.sg = this.scratch.getContext('2d');
        this.resize();
        this.listen();
        this.lastNow = 0;
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

    listen() {
        const on = (target, type, fn) => { target.addEventListener(type, fn); this.listeners.push(() => target.removeEventListener(type, fn)); };
        on(window, 'resize', () => this.resize());
        if (this.host.params.thumb) return;
        on(document, 'pointerdown', e => { this.pointerType = e.pointerType; });
        this.listeners.push(this.host.gestures({ tap: (x, y) => { if (this.config.touch || this.pointerType === 'mouse') this.tap(x, y); } }));
    }

    applySettings(config) {
        const old = this.config;
        this.config = config;
        if (!this.running) return;
        const changed = keys => keys.some(k => JSON.stringify(old[k]) !== JSON.stringify(config[k]));
        if (changed(['seed', 'islandSize', 'houses', 'forest', 'fields', 'dragon', 'pixelSize'])) { this.resize(); return; }
        if (changed(['people'])) this.folk.resize(this.peopleWanted());
        if (changed(['cats', 'strays'])) this.cats.resize(config.cats, this.straysWanted());
        if (changed(['dogs'])) this.dogs.build(this.dogsWanted());
        if (changed(['wildlife'])) this.wild.build(config.wildlife);
        if (changed(['season', 'holiday', 'specialDates', 'decorations', 'sky', 'cycleMinutes'])) { this.calendar(true); this.rebake(); }
        if (changed(['weather'])) this.weatherPlan(true);
        if (changed(['clouds'])) this.makeClouds();
        if (changed(['lights'])) this.glowKey = null;
        this.feed();
        this.host.idleUntil(0);
    }

    onQuality(quality) {
        this.quality = quality;
        if (!this.running) return;
        if ((quality.tier === 'high') !== this.sway) this.bakeBands();
        this.folk.resize(this.peopleWanted());
        this.cats.resize(this.config.cats, this.straysWanted());
        this.wild.build(this.config.wildlife);
    }
    onScroll(x) { this.scroll = x; this.host.idleUntil(0); }
    onAction(name) {
        if (name === 'newIsland') this.newIsland();
        if (name === 'keepIsland') this.keepIsland();
    }
    peopleWanted() { return Math.round(this.config.people * (0.4 + 0.6 * (this.quality?.density ?? 1))); }
    straysWanted() { return Math.round(this.config.strays * (0.5 + 0.5 * (this.quality?.density ?? 1))); }
    dogsWanted() { return Math.min(this.config.dogs, Math.max(0, this.config.people > 0 ? this.config.dogs : 0)); }

    // ---- The island ------------------------------------------------------------------------------

    resize() {
        if (!this.canvas) return;
        const c = this.config, W = innerWidth, H = innerHeight;
        // A pixel is 2 CSS px on a laptop or a 1080p monitor, 3 at 1440p, 4 at 4K, 1 on a phone.
        const px = this.px = Math.max(1, Math.round(Math.min(W, H) / 480 * c.pixelSize - 0.1));
        const bw = this.bw = Math.ceil(W / px), bh = this.bh = Math.ceil(H / px);
        this.canvas.width = bw; this.canvas.height = bh;
        this.canvas.style.width = `${bw * px}px`; this.canvas.style.height = `${bh * px}px`;
        this.portrait = H > W * 1.1;
        this.build();
    }

    // The island from its seed: the layout, every sprite, the folk.
    build() {
        const c = this.config, L = SkyIslandLogic, A = SkyIslandArt;
        this.seed = c.seed > 0 ? Math.floor(c.seed) : (Math.floor(Math.random() * 899999) + 100000);
        this.rand = L.rng(this.seed * 7 + 1);
        // As wide as the screen allows, and no taller than its share of it (the underside and the tower included).
        let w = Math.round(this.bw * (this.portrait ? 0.94 : 0.66) * c.islandSize);
        const budget = this.bh * (this.portrait ? 0.62 : 0.8) - 60;
        const opts = { portrait: this.portrait, houses: c.houses, forest: c.forest, fields: c.fields, dragon: c.dragon };
        let I = L.layout(this.seed, { w, ...opts });
        const tall = I => I.depth + I.underH + I.crag.h;
        if (tall(I) > budget) { w = Math.round(w * budget / tall(I)); I = L.layout(this.seed, { w, ...opts }); }
        this.I = I;
        this.ix = Math.round((this.bw - I.w) / 2);
        const block = tall(I) + 50;
        this.iy = Math.round(Math.max(this.bh * 0.07 + I.crag.h + 50, this.bh * (this.portrait ? 0.44 : 0.46) - block / 2 + I.crag.h + 50));
        this.seaY = Math.round(this.bh * (this.portrait ? 0.8 : 0.74));
        // Where rain lands: the highest ground at each x.
        this.landY = [];
        for (let x = 0; x <= I.w; x++) { const t = I.tiers.find(t => x >= t.x0 && x <= t.x1 && t.back[x] !== undefined); this.landY[x] = t ? t.back[x] + Math.round((t.front[x] - t.back[x]) * L.hash(x, 1)) : I.depth; }
        this.calendar(true);
        const date = this.now();
        this.hour = date.getHours() + date.getMinutes() / 60;
        this.bodies = HarvestSky.bodies(date);
        this.light = SkyIslandLand.light(this.bodies.sun.alt, this.bodies.moon.light, this.season);
        this.dark = this.light.dark;
        this.stars = [];
        const starRand = L.rng(this.seed + 99);
        for (let i = 0; i < this.bw * this.bh / 500; i++) this.stars.push({ x: Math.floor(starRand() * this.bw), y: Math.floor(starRand() * this.bh * 0.85), k: starRand(), big: starRand() < 0.08 });
        this.makeClouds();
        // Sprites that don't change with the season.
        this.lampArt = A.lamp(); this.benchArt = A.bench(); this.wellArt = A.well(); this.stallArt = A.stall(); this.lighthouseArt = A.lighthouse(); this.boatArt = A.boat();
        this.sunArt = A.sun(); this.pumpkinArt = A.pumpkin(); this.snowmanArt = A.snowman(); this.wreathArt = A.wreath(); this.cakeArt = A.cake(); this.sleighArt = A.sleigh();
        this.propArt = {};
        this.glows = { lamp: SkyIslandLand.glow(9, '#ffd77a', 0.5), window: SkyIslandLand.glow(5, '#ffd77a', 0.45), crystal: { cyan: SkyIslandLand.glow(6, '#5af0ff', 0.5), violet: SkyIslandLand.glow(6, '#b080f0', 0.5) }, ember: SkyIslandLand.glow(8, '#ff8a2a', 0.5), magic: SkyIslandLand.glow(14, '#40e0ff', 0.4), bulb: {} };
        this.fragmentArt = I.fragments.map(f => A.fragment(f.size, f.k, f.grass, 'summer'));
        this.rebake();
        // Who lives here.
        this.folk = new SkyIslandActors.Townsfolk(this);
        this.folk.build(this.peopleWanted());
        this.cats = new SkyIslandActors.Cats(this);
        this.cats.build(c.cats, this.straysWanted());
        this.dogs = new SkyIslandActors.Dogs(this);
        this.dogs.build(this.dogsWanted());
        this.wild = new SkyIslandActors.Wildlife(this);
        this.wild.build(c.wildlife);
        this.visitors = new SkyIslandActors.Visitors(this);
        this.weatherPlan(true);
        this.weather.rain = 0; this.weather.snowing = 0;
        this.drops = []; this.flakes = []; this.leaves = []; this.bugs = []; this.puffs = []; this.sparks = []; this.rockets = []; this.confetti = []; this.ripples = [];
        this.lightOverride = {};
        this.lightT = 0;
        this.settle();
        this.feed();
        if (!this.host.params.thumb && this.stats.frames > 0) this.callout(`Welcome to ${I.name}`);
        this.host.idleUntil(0);
    }

    // A few minutes of the island's life, so the first frame is already lived in.
    settle() {
        for (let i = 0; i < 90; i++) { this.folk.update(0.5); this.cats.update(0.5); this.dogs.update(0.5); this.wild.update(0.5); }
        this.time += 45;
        for (const p of this.folk.people) p.bubbleT = 0;
    }

    newIsland() {
        if (this.config.seed > 0) { this.config.seed = 0; WP.settings.save(this.config); }
        this.resize();
        return `A new island: ${this.I.name}`;
    }
    keepIsland() {
        const kept = this.config.seed === this.seed;
        this.config.seed = kept ? 0 : this.seed;
        WP.settings.save(this.config);
        this.feed();
        return kept ? `${this.I.name} is let go: a new island next time` : `${this.I.name} is yours to keep (seed ${this.seed})`;
    }
    feed() {
        if (!this.I) return;
        const kept = this.config.seed === this.seed;
        const h = this.holiday;
        this.host.panel({ status: { island: `${this.I.name} · seed ${this.seed}${kept ? ' (kept)' : ''} · pop. ${this.folk.people.length}, ${this.cats.cats.length} cats · ${this.season}${h ? ` · ${h.icon} ${h.name}` : ''}` }, kept });
    }
    callout(text) { if (this.config.callouts && !this.host.params.thumb && this.stats.frames > 5) this.host.toast(text, 3500); }

    // The season and the holiday from the date (or the settings), and
    // everything that depends on them.
    calendar(force) {
        const L = SkyIslandLogic, c = this.config, date = this.host.now();
        const season = c.season === 'auto' ? L.seasonOf(date) : c.season;
        const month = date.getMonth();
        let holiday = c.holiday === 'auto' ? L.holidayOf(date, L.parseSpecialDates(c.specialDates)) : c.holiday === 'none' ? null : { id: c.holiday, name: L.HOLIDAYS[c.holiday]?.name || c.holiday, icon: L.HOLIDAYS[c.holiday]?.icon || '🎉', day: true, eve: c.holiday === 'christmas' ? false : c.holiday === 'newyear' };
        if (!c.decorations && holiday && holiday.id !== 'party') holiday = { ...holiday, plain: true };
        const frozen = season === 'winter' && (c.season !== 'auto' || month === 0 || month === 1);
        const changed = force || season !== this.season || frozen !== this.frozen || JSON.stringify(holiday) !== JSON.stringify(this.holiday);
        this.season = season; this.holiday = holiday; this.holidayId = holiday?.id || null; this.frozen = frozen;
        this.dayKey = date.getFullYear() * 400 + date.getMonth() * 32 + date.getDate();
        return changed;
    }

    // Bake what the season and the holiday change: the terrain, the trees,
    // the houses, the decorations.
    rebake() {
        const A = SkyIslandArt, I = this.I, season = this.season, rand = SkyIslandLogic.rng(this.seed + 5);
        this.stats.bakes++;
        this.terrain = SkyIslandLand.terrain(I, season, { frozen: this.frozen });
        this.falls = SkyIslandLand.falls(I);
        this.rootArt = [0, 1, 2].map(k => this.bakeRoots(k));
        this.houseSprites = new Map();
        for (const h of I.houses) this.houseSprites.set(h.id, A.house(h, season));
        this.treeSprites = new Map();
        for (const t of I.trees) this.treeSprites.set(t, A.tree(t.kind, t.size, season, t.phase));
        this.bushSprites = new Map();
        for (const b of I.bushes) this.bushSprites.set(b, A.bush(b.size, season, b.k, b.berry));
        this.towerArt = A.tower(season);
        this.windmillArt = I.windmill ? A.windmill(season) : null;
        this.scratch.width = this.terrain.w; this.scratch.height = this.terrain.h + this.towerArt.h;
        this.groundArt = this.config.ground ? SkyIslandLand.ground(this.seed, this.bw * 2, Math.ceil(this.bh - this.seaY + 20), season) : null;
        this.decor = [];
        this.bunting = null;
        this.lights = [];
        this.squareTree = null;
        this.eggs = [];
        const h = this.holiday, id = h?.plain ? null : h?.id;
        const sq = I.square;
        if (id === 'halloween') for (const hs of I.houses) { const art = this.houseArt(hs); this.decor.push({ x: hs.x + art.door.x + 5, y: hs.base + 0.2, sprite: () => this.dark > 0.4 ? this.pumpkinArt.lit : this.pumpkinArt.dark }); }
        if (id === 'thanksgiving') { this.bunting = ['#e07a2a', '#8a4a2a', '#e8c23a']; for (let i = 0; i < 4; i++) this.decor.push({ x: sq.x - 12 + i * 4, y: sq.y + 6 + (i % 2), sprite: () => this.pumpkinArt.dark, static: true }); }
        if (id === 'christmas') {
            this.squareTree = A.squareTree(this.portrait ? 20 : 26);
            for (const hs of I.houses) { const art = this.houseArt(hs); this.decor.push({ x: hs.x + art.door.x, y: hs.base + 0.1, sprite: () => this.wreathArt, dy: -8, static: true }); for (let x = 0; x < hs.w; x += 2) this.lights.push({ x: hs.x + x, y: hs.base - art.h + 1 + art.eaves, k: (hs.id * 7 + x) % 5 }); }
            for (let i = 0; i < 3; i++) { const spot = rand.chance(0.5) ? I.spots.meadow : I.spots.lookout; this.decor.push({ x: spot.x + i * 10 - 10, y: spot.y + (i % 2) + 2, sprite: () => this.snowmanArt, static: true }); }
            if (h.day) { const gifts = ['#d9453a', '#3a6fd9', '#3aa86a', '#e0a63a'].map(A.present); for (let i = 0; i < 4; i++) this.decor.push({ x: sq.x - 9 + i * 6, y: sq.y + 3, sprite: () => gifts[i], static: true }); }
        }
        if (id === 'newyear' || id === 'july4') this.bunting = id === 'july4' ? ['#d9453a', '#f8f8f8', '#3a6fd9'] : ['#f0c040', '#f8f8f8', '#9a7ae0'];
        if (id === 'stpatricks') { this.bunting = ['#3aa86a', '#f8f8f8', '#e0a63a']; const pot = A.potOfGold(); this.decor.push({ x: I.spots.edgeR.x - 6, y: I.spots.edgeR.y + 2, sprite: () => pot, static: true }); const sham = A.shamrock(); for (let i = 0; i < 8; i++) { const f = I.flowers[i * 3 % Math.max(1, I.flowers.length)]; if (f) this.decor.push({ x: f.x, y: f.y, sprite: () => sham, static: true }); } }
        if (id === 'easter') { const cols = ['#f08ab0', '#9ad0e8', '#f0c040', '#a8e08a', '#c8a0f0']; for (let i = 0; i < 10; i++) { const f = I.flowers[(i * 5 + 2) % Math.max(1, I.flowers.length)]; if (f) this.eggs.push({ x: f.x, y: f.y, sprite: A.egg(cols[i % 5]) }); } }
        if (id === 'party') { this.bunting = ['#f08ab0', '#f0c040', '#3ab6c0']; this.decor.push({ x: sq.x, y: sq.y + 3.5, sprite: () => this.cakeArt, static: true }); for (const l of I.lamps) { const b = A.balloon(['#d9453a', '#3a6fd9', '#f0c040'][l.x % 3]); this.decor.push({ x: l.x + 3, y: l.y + 0.1, sprite: () => b, dy: -12, sway: true }); } }
        if (id === 'valentines') this.bunting = ['#f05a8a', '#f8f8f8', '#f08ab0'];
        this.rebakeSky(true);
        this.bakeBands();
        this.glowKey = null;
        this.host.idleUntil(0);
    }

    // Everything that stands still (houses, trees, lamps, benches, the
    // well, the stall, the tower, the mill, the lighthouse, the props, the
    // trimmings) is baked into one layer per street band, in order of
    // where it stands, so a frame draws a few layers instead of a few
    // hundred sprites. The bands split at the streets: whoever walks a
    // street stands in front of that street's houses and behind the next
    // street's. Trees sway only on High, where they're drawn live instead.
    bakeBands() {
        const I = this.I, A = SkyIslandArt;
        this.sway = this.quality?.tier === 'high';
        const art = { house: h => this.houseArt(h), tree: t => this.treeArt(t), bush: b => this.bushSprites.get(b), prop: k => this.prop(k), tower: this.towerArt, windmill: this.windmillArt, lighthouse: this.lighthouseArt, stall: this.stallArt, well: this.wellArt, bench: this.benchArt, lamp: this.lampArt, liveTrees: this.sway };
        const statics = SkyIslandLand.statics(I, this.season, art);
        const put = (x, y, s, sortY, dy = 0) => statics.push({ x: Math.round(x), y: Math.round(y), s, sortY: sortY ?? y, dy });
        if (this.squareTree) put(I.square.x, I.square.y - 2, this.squareTree);
        for (const d of this.decor) if (d.static) put(d.x, d.y, d.sprite(), d.y, d.dy || 0);
        statics.sort((a, b) => a.sortY - b.sortY);
        const bounds = I.streets.map(s => s.y - 1);
        this.bandBounds = bounds;
        this.bands = [];
        for (let k = 0; k <= bounds.length; k++) {
            const lo = k === 0 ? -Infinity : bounds[k - 1] + 1, hi = k === bounds.length ? Infinity : bounds[k];
            const mine = statics.filter(st => st.sortY >= lo && st.sortY <= hi);
            if (!mine.length) { this.bands.push(null); continue; }
            let top = Infinity, bottom = -Infinity, left = Infinity, right = -Infinity;
            for (const st of mine) { top = Math.min(top, st.y - st.s.h + 1 + st.dy); bottom = Math.max(bottom, st.y + st.dy); left = Math.min(left, st.x - st.s.ax); right = Math.max(right, st.x - st.s.ax + st.s.w); }
            const c = A.canvas(right - left + 1, bottom - top + 1), g = c.getContext('2d');
            for (const st of mine) g.drawImage(st.s.c, st.x - st.s.ax - left, st.y - st.s.h + 1 + st.dy - top);
            this.bands.push({ c, x: left, y: top, lo, hi });
        }
    }
    houseArt(h) { return this.houseSprites.get(h.id); }
    treeArt(t) { return this.treeSprites.get(t); }
    prop(kind) { return this.propArt[kind] ||= SkyIslandArt[kind] ? SkyIslandArt[kind]() : null; }
    // The way from here to there, by the streets and the stairs (SkyIslandLogic.route).
    route(from, to, mover) {
        const L = SkyIslandLogic, I = this.I;
        const tf = from.tier ?? L.tierAt(I, from.x, from.y);
        const f = { x: Math.round(from.x), y: Math.round(from.y), tier: tf >= 0 ? tf : (mover?.tier ?? 1) };
        return L.route(f, { x: Math.round(to.x), y: Math.round(to.y), tier: to.tier }, I);
    }
    // Send a walker to a spot: back off any pier it's on, by the streets,
    // then out along the spot's own legs (`then`: the dock's planks).
    walkTo(m, spot) {
        const from = m.retrace?.length ? m.retrace.at(-1) : { x: m.x, y: m.y, tier: m.tier };
        const points = [...(m.retrace || []), ...this.route(from, spot, m), ...(spot.then || [])];
        m.retrace = spot.then ? [...spot.then.slice(0, -1).reverse(), { x: spot.x, y: spot.y, tier: spot.tier }] : null;
        m.tier = spot.tier ?? m.tier;
        m.goTo(points);
    }

    // What the holiday puts on heads.
    holidayHat(p) {
        const id = this.holiday?.plain ? null : this.holidayId;
        if (!id) return null;
        const want = id === 'christmas' ? 'santa' : id === 'halloween' ? (p.id % 3 === 0 ? 'witch' : null) : id === 'party' || id === 'newyear' ? 'party' : id === 'stpatricks' ? (p.id % 2 ? 'beanie' : null) : null;
        if (!want) return null;
        this.hatCache ||= {};
        this.hatCache[want] ||= { l: SkyIslandArt.hat(want, false), r: SkyIslandArt.hat(want, true) };
        return this.hatCache[want];
    }
    catHat() {
        const id = this.holiday?.plain ? null : this.holidayId;
        const H = SkyIslandArt.CAT_HATS;
        return id === 'halloween' ? H.witch : id === 'christmas' ? H.santa : id === 'party' || id === 'newyear' ? H.party : id === 'easter' ? H.bunny : null;
    }

    makeClouds() {
        const rand = SkyIslandLogic.rng(this.seed + 3), n = this.config.clouds;
        this.clouds = [];
        const far = Math.round(6 * n), near = Math.round(3 * n);
        for (let i = 0; i < far; i++) this.clouds.push({ far: true, x: rand() * this.bw, y: rand() * this.bh * 0.5, w: 26 + Math.floor(rand() * 50), h: 9 + Math.floor(rand() * 10), v: 1.5 + rand() * 2, k: rand() });
        const under = this.iy + this.I.depth;
        for (let i = 0; i < near; i++) this.clouds.push({ far: false, x: rand() * this.bw, y: under + this.I.underH * (0.35 + rand() * 0.6), w: 70 + Math.floor(rand() * 60), h: 22 + Math.floor(rand() * 16), v: 3 + rand() * 3, k: rand() });
        for (let i = 0; i < 2; i++) this.clouds.push({ far: false, mid: true, x: rand() * this.bw, y: this.iy + rand() * this.I.depth * 0.7, w: 50 + Math.floor(rand() * 50), h: 16 + Math.floor(rand() * 10), v: 2 + rand() * 2, k: rand() });
        this.cloudArt = null;
    }

    // ---- Time and weather ---------------------------------------------------------------------------

    now() {
        const c = this.config, real = this.host.now();
        if (c.sky === 'cycle') return new Date(this.epoch.getTime() + this.time * 1000 * (24 * 60 / Math.max(0.1, c.cycleMinutes)));
        if (c.sky === 'live') return real;
        return HarvestSky.pinned(c.sky, real, HarvestSky.moonAge(real));
    }

    weatherPlan(reset) {
        const c = this.config, rand = this.rand;
        this.weather ||= { state: 'fair', rain: 0, snowing: 0, wind: 0.2, windTarget: 0.2, until: 0, rainbow: 0, dark: 0 };
        const w = this.weather;
        if (reset) w.until = 0;
        if (w.until > this.time) return;
        const cold = this.season === 'winter';
        if (c.weather === 'fair') w.state = 'fair';
        else if (c.weather === 'rain') w.state = cold ? 'snow' : 'rain';
        else if (c.weather === 'snow') w.state = 'snow';
        else {
            const r = rand();
            const wet = this.season === 'autumn' ? 0.3 : this.season === 'spring' ? 0.28 : cold ? 0.3 : 0.18;
            w.state = w.state === 'fair' ? (r < wet ? (cold ? 'snow' : 'rain') : 'fair') : (r < 0.6 ? 'fair' : w.state);
        }
        w.until = this.time + (w.state === 'fair' ? 180 + rand() * 420 : 60 + rand() * 120);
        w.windTarget = Math.min(1, rand() * 0.7 * c.wind + (w.state === 'fair' ? 0 : 0.2));
    }
    nextWeather() {
        const order = ['fair', 'rain', 'snow'];
        const next = order[(order.indexOf(this.weather.state) + 1) % order.length];
        this.weather.state = next; this.weather.until = this.time + 240;
        return `Weather: ${next}`;
    }
    nextHoliday() {
        const ids = ['auto', 'none', ...Object.keys(SkyIslandLogic.HOLIDAYS)];
        this.config.holiday = ids[(ids.indexOf(this.config.holiday) + 1) % ids.length];
        WP.settings.save(this.config);
        this.calendar(true); this.rebake(); this.feed();
        return `Holiday: ${this.config.holiday === 'auto' ? 'by the date' : this.config.holiday === 'none' ? 'none' : `${this.holiday.icon} ${this.holiday.name}`}`;
    }
    nextSeason() {
        const ids = ['auto', 'spring', 'summer', 'autumn', 'winter'];
        this.config.season = ids[(ids.indexOf(this.config.season) + 1) % ids.length];
        WP.settings.save(this.config);
        this.calendar(true); this.rebake(); this.feed();
        return `Season: ${this.config.season === 'auto' ? `by the date (${this.season})` : this.season}`;
    }
    visitorNow() { const v = this.visitors.spawn(); return `${v.name} is coming`; }
    balloonNow() { const v = this.visitors.islands[0] || this.visitors.spawn(); if (!this.visitors.balloon) this.visitors.launch(v); return 'A balloon is on its way'; }
    orbiterNow() { if (this.visitors.orbiter) return 'One is already going round'; const v = this.visitors.spawnOrbiter(); return `${v.name} has come to go round`; }

    // ---- Taps --------------------------------------------------------------------------------------

    tap(cssX, cssY) {
        const L = SkyIslandLogic, I = this.I;
        const x = cssX / this.px - this.ix, y = cssY / this.px - this.iy - this.bob, lk = I.lake;
        // A house at night: its lights.
        for (const h of I.houses) if (x >= h.x && x <= h.x + h.w && y <= h.base && y >= h.y && this.dark > 0.3) { this.lightOverride[h.id] = !this.windowsLit(h); this.host.idleUntil(0); return; }
        // The lake: a fish.
        if (((x - lk.x) / lk.rx) ** 2 + ((y - lk.y) / lk.ry) ** 2 <= 1 && !this.frozen) { this.wild.jump(); return; }
        // A person: a wave. A cat: it comes over.
        const p = this.folk.near(x, y, 9);
        if (p) { p.wave = 2.5; p.dir = x < p.x ? -1 : 1; p.bubble = 'heart'; p.bubbleT = 2; return; }
        const tier = L.tierAt(I, x, y);
        if (tier >= 0) { const t = I.tiers[tier], xx = Math.round(L.clamp(x, t.x0 + 2, t.x1 - 2)); const c = this.cats.call(xx, L.clamp(y, t.back[xx] + 1, t.front[xx] - 1), tier); if (c) return; }
        // The sky: a bird sets off from here.
        const dir = cssX / this.px < this.bw / 2 ? 1 : -1;
        this.wild.sky.push({ geese: false, x: cssX / this.px, y: cssY / this.px, vx: dir * 30, vy: -2, t: 0, k: this.rand() * 9, dir, coat: this.rand.int(0, 4) });
        this.host.idleUntil(0);
    }

    // ---- The frame loop -----------------------------------------------------------------------------

    frame(now) {
        if (!this.running) return;
        const raw = this.lastNow ? (now - this.lastNow) / 1000 : 0;
        this.lastNow = now;
        const dt = Math.min(0.1, raw);
        this.time += raw > 1 ? 0.1 : raw;
        this.update(dt);
        this.draw();
        this.stats.frames++;
        // Frames on a steady timeline: the next is due a frame after the last was, never sooner.
        const fps = Math.min(this.config.fps, this.quality?.fps || 60, this.quality?.tier === 'low' ? 12 : 60);
        const at = performance.now();
        this.nextFrameAt = Math.max(at, (this.nextFrameAt || 0) + 1000 / fps);
        this.host.idleUntil(Math.max(0, this.nextFrameAt - at - 1));
        this.frameId = requestAnimationFrame(t => this.frame(t));
    }

    update(dt) {
        const c = this.config, I = this.I, rand = this.rand, w = this.weather;
        // The clock, the sky's light, the calendar.
        const date = this.now();
        this.hour = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
        this.bodies = HarvestSky.bodies(date);
        const lt = SkyIslandLand.light(this.bodies.sun.alt, this.bodies.moon.light, this.season);
        this.light = lt;
        this.dark = lt.dark;
        if (this.calendar(false)) { this.rebake(); this.feed(); if (this.holiday) this.callout(`${this.holiday.icon} ${this.holiday.name}`); }
        this.lightT += dt;
        if (this.lightT > (Math.abs(this.bodies.sun.alt) < 12 ? 6 : 60) || !this.skyArt) this.rebakeSky();
        // The island rides the air: a slow bob, the loose bits lagging.
        this.bob = c.bob ? Math.round(Math.sin(this.time * Math.PI * 2 / 25) * 4) : 0;
        this.bobLag = c.bob ? Math.round(Math.sin((this.time - 0.9) * Math.PI * 2 / 25) * 4) : 0;
        // Weather.
        this.weatherPlan(false);
        w.wind += (w.windTarget - w.wind) * Math.min(1, dt * 0.2);
        if (rand.chance(dt * 0.02)) w.windTarget = Math.min(1, rand() * 0.8 * c.wind);
        const raining = w.state === 'rain', snowing = w.state === 'snow';
        const wasRain = w.rain;
        w.rain += ((raining ? 1 : 0) - w.rain) * Math.min(1, dt * 0.3);
        w.snowing += ((snowing ? 1 : 0) - w.snowing) * Math.min(1, dt * 0.3);
        if (wasRain > 0.5 && w.rain < 0.5 && this.dark < 0.5) w.rainbow = 60;
        if (w.rainbow > 0) w.rainbow -= dt;
        this.particles(dt);
        // Everyone.
        this.folk.update(dt);
        this.cats.update(dt);
        this.dogs.update(dt);
        this.wild.update(dt);
        this.visitors.update(dt);
        this.visitors.updateWalker(dt);
        // Clouds drift with the wind; the sails and the flag turn with it; the world below rolls by.
        for (const cl of this.clouds) { cl.x += cl.v * (0.5 + w.wind) * dt * (cl.far ? 0.5 : 1); if (cl.x > this.bw + cl.w) cl.x = -cl.w; }
        this.sail = (this.sail || 0) + dt * (0.5 + w.wind * 3);
        this.travel = (this.travel || 0) + dt * (2.5 + w.wind * 1.5);
        // The boat drifts about the lake.
        this.boatX = I.boat.x + Math.sin(this.time * 0.07) * I.boat.rx;
        // Eggs get found at Easter.
        if (this.eggs.length) for (const p of this.folk.people) if (p.kid && !p.inside) { const i = this.eggs.findIndex(e => Math.abs(e.x - p.x) < 4 && Math.abs(e.y - p.y) < 4); if (i >= 0) { this.eggs.splice(i, 1); p.bubble = 'bang'; p.bubbleT = 1.5; } }
        // Holiday skies: fireworks, a sleigh, hearts.
        const id = this.holiday?.plain ? null : this.holidayId;
        if ((id === 'newyear' && (this.hour >= 18 || this.hour < 1)) || (id === 'july4' && this.holiday.day && this.dark > 0.6) || (id === 'party' && this.dark > 0.6)) { if (rand.chance(dt * (id === 'newyear' && this.holiday.day && this.hour < 1 ? 1.5 : 0.35))) this.launchRocket(); }
        this.rockets = this.rockets.filter(r => { r.t += dt; if (!r.burst) { r.x += r.vx * dt; r.y += r.vy * dt; r.vy += 20 * dt; if (r.vy > -5) { r.burst = true; r.t = 0; r.bits = []; for (let i = 0; i < 30; i++) { const a = i / 30 * Math.PI * 2, s = 16 + rand() * 12; r.bits.push({ x: r.x, y: r.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s }); } } return true; } for (const b of r.bits) { b.x += b.vx * dt; b.y += b.vy * dt; b.vy += 9 * dt; b.vx *= 0.98; } return r.t < 1.6; });
        if (id === 'christmas' && this.holiday.eve && this.dark > 0.6 && !this.sleigh && rand.chance(dt * 0.01)) this.sleigh = { x: -30, y: this.iy * 0.4, dir: 1, t: 0 };
        if (this.sleigh) { this.sleigh.x += 22 * dt; this.sleigh.t += dt; if (this.sleigh.x > this.bw + 40) this.sleigh = null; }
        if (id === 'valentines' && rand.chance(dt * 0.5)) { const h = rand.pick(I.houses), art = this.houseArt(h); if (art.chimney) this.sparks.push({ heart: true, x: h.x + art.chimney.x, y: h.base - art.h + 1 + art.chimney.y, vx: (rand() - 0.5) * 2, vy: -5, t: 0, life: 4 }); }
        if (id === 'party' && this.dark < 0.9 && rand.chance(dt * 6)) this.confetti.push({ x: I.square.x + (rand() - 0.5) * 30, y: I.square.y - 26 - rand() * 10, vx: (rand() - 0.5) * 4, vy: 4 + rand() * 4, c: rand.pick(['#f08ab0', '#f0c040', '#3ab6c0', '#9a7ae0']), t: 0, floor: I.square.y + (rand() - 0.5) * 8 });
        this.confetti = this.confetti.filter(p => { p.t += dt; p.x += (p.vx + Math.sin(p.t * 5) * 3) * dt; p.y += p.vy * dt; return p.y < p.floor && p.t < 8; });
        // The magic under the island: a crackle now and then, an arc to a passing fragment.
        this.arc = this.arc && this.arc.t < 0.35 ? { ...this.arc, t: this.arc.t + dt } : null;
        if (!this.arc && rand.chance(dt * 0.25)) { const f = this.fragmentAt(rand.int(0, I.fragments.length - 1)); if (f.front) this.arc = { from: rand.pick(I.cracks), to: f, t: 0, k: rand() * 9 }; }
    }

    particles(dt) {
        const c = this.config, I = this.I, rand = this.rand, w = this.weather, density = this.quality?.density ?? 1;
        // Rain and snow fall from a cloud over the island, onto it.
        const rainN = Math.round(I.w * 0.45 * w.rain * density), snowN = Math.round(I.w * 0.4 * w.snowing * density);
        const landAt = x => (x < 0 || x > I.w ? I.depth + I.underH : this.landY[Math.round(x)]);
        while (this.drops.length < rainN) this.drops.push({ x: rand() * (I.w + 20) - 10, y: -70 - rand() * 50, v: 80 + rand() * 30 });
        if (this.drops.length > rainN) this.drops.length = rainN;
        for (const d of this.drops) { d.y += d.v * dt; d.x += w.wind * 8 * dt; if (d.y > landAt(d.x)) { d.y = -70 - rand() * 30; d.x = rand() * (I.w + 20) - 10; } }
        while (this.flakes.length < snowN) this.flakes.push({ x: rand() * (I.w + 30) - 15, y: -80 - rand() * 80, v: 8 + rand() * 8, k: rand() * 9 });
        if (this.flakes.length > snowN) this.flakes.length = snowN;
        for (const f of this.flakes) { f.y += f.v * dt; f.x += (Math.sin(this.time + f.k) * 3 + w.wind * 6) * dt; if (f.y > landAt(f.x)) { f.y = -80; f.x = rand() * (I.w + 30) - 15; } }
        // Leaves in autumn, petals in spring, loosed by the wind from the trees.
        const loose = this.season === 'autumn' ? 0.6 : this.season === 'spring' ? 0.3 : 0;
        if (loose && I.trees.length && this.leaves.length < 60 * density && rand.chance(dt * (2 + w.wind * 14) * loose)) { const t = rand.pick(I.trees.filter(t => t.kind !== 'pine')) || I.trees[0]; const ts = this.treeArt(t); this.leaves.push({ x: t.x + (rand() - 0.5) * ts.canopy.w, y: t.y - ts.canopy.h + 4 + rand() * 6, vx: 0, t: 0, k: rand() * 9, c: this.season === 'spring' ? (t.kind === 'cherry' ? '#fbd4e4' : '#f8e0ea') : rand.pick(['#e0902e', '#d9453a', '#e8c23a', '#b85c22']), floor: t.y + rand.int(-1, 1) }); }
        this.leaves = this.leaves.filter(l => { l.t += dt; l.x += (Math.sin(l.t * 3 + l.k) * 6 + w.wind * 18 + 4) * dt; l.y += (6 + Math.cos(l.t * 2 + l.k) * 3) * dt; return l.y < l.floor && l.x < I.w + 20; });
        // Fireflies on warm nights by the lake and the pond.
        const bugN = this.season === 'summer' && this.dark > 0.7 && !w.rain ? Math.round(16 * density) : 0;
        while (this.bugs.length < bugN) { const at = rand.chance(0.6) ? I.lake : I.pond; this.bugs.push({ x: at.x + (rand() - 0.5) * at.rx * 2.6, y: at.y - 8 + (rand() - 0.5) * at.ry * 1.5, k: rand() * 9, t: rand() * 9 }); }
        if (this.bugs.length > bugN) this.bugs.length = bugN;
        for (const b of this.bugs) { b.t += dt; b.x += Math.sin(b.t * 0.7 + b.k) * 4 * dt; b.y += Math.cos(b.t * 0.9 + b.k) * 2 * dt; }
        // Chimney smoke in the cold or the evening.
        if (c.smoke && (this.season === 'winter' || this.season === 'autumn' || this.dark > 0.4) && rand.chance(dt * 1.2 * density)) { const h = rand.pick(I.houses); const art = this.houseArt(h); if (art.chimney && rand.chance(0.6)) this.puffs.push({ x: h.x + art.chimney.x, y: h.base - art.h + 1 + art.chimney.y, t: 0, k: rand() * 9 }); }
        this.puffs = this.puffs.filter(p => { p.t += dt; p.y -= 5 * dt; p.x += (w.wind * 6 + Math.sin(p.t * 2 + p.k)) * dt; return p.t < 3.5; });
        this.sparks = this.sparks.filter(s => { s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; if (!s.heart) s.vy += 10 * dt; return s.t < s.life; });
        this.ripples = this.ripples.filter(r => (r.t += dt) < 1);
    }
    launchRocket() { const I = this.I, r = this.rand; this.stats.fireworks++; this.rockets.push({ x: this.ix + I.square.x + (r() - 0.5) * I.w * 0.6, y: this.iy + this.bob, vx: (r() - 0.5) * 6, vy: -50 - r() * 25, t: 0, burst: false, c: r.pick(['#ff6a6a', '#ffd060', '#6ab0ff', '#a0ff8a', '#ff8ad0', '#ffffff']) }); }
    ripple(at) { this.ripples.push({ x: at.x, y: at.y, t: 0 }); }
    onFish(p) { if (!this.cats.steal(p)) this.callout('The fisher has caught something'); }

    windowsLit(h) {
        if (h.id in this.lightOverride) return this.lightOverride[h.id];
        if (!this.config.lights || this.dark < 0.3) return false;
        const late = this.hour >= 23 || this.hour < 5;
        return SkyIslandLogic.hash(h.id * 7 + 1, this.dayKey) > (late ? 0.8 : 0.25);
    }
    // Where a fragment is right now, in island pixels, and whether it's in front of the island.
    fragmentAt(i) {
        const f = this.I.fragments[i], a = f.phase + this.time * f.speed;
        return { x: this.I.w / 2 + Math.cos(a) * f.rx, y: f.cy + Math.sin(a) * f.ry * 0.3 + Math.sin(this.time * 0.5 + f.k) * 2, front: Math.sin(a) > 0, i };
    }

    // ---- Drawing -----------------------------------------------------------------------------------

    rebakeSky(force) {
        const lt = this.light || SkyIslandLand.light(30, 0, this.season);
        this.stats.skies++;
        this.lightT = 0;
        this.skyArt = SkyIslandLand.sky(this.bw, this.bh, lt, this.seaY + 10);
        const A = SkyIslandArt, rand = SkyIslandLogic.rng(this.seed + 11);
        const lit = SkyIslandLand.rgb(lt.cloudLit), shade = SkyIslandLand.rgb(lt.cloudShade), deep = SkyIslandLand.rgb(lt.cloudDeep);
        this.cloudArt = this.clouds.map(cl => A.cloud(cl.w, cl.h, rand, lit, shade, deep));
        this.sea = SkyIslandLand.cloudSea(this.bw * 2, Math.ceil(this.bh - this.seaY + 20), lt, SkyIslandLogic.rng(this.seed + 13));
        { const h = Math.max(1, this.bh - this.seaY), c = A.canvas(this.bw, h), g = c.getContext('2d'); const grad = g.createLinearGradient(0, 0, 0, h); const col = lt.horizon; grad.addColorStop(0, SkyIslandLand.rgb(col, 1)); grad.addColorStop(0.3, SkyIslandLand.rgb(col, 0.6 + 0.2 * lt.dark)); grad.addColorStop(1, SkyIslandLand.rgb(col, 0.45 + 0.25 * lt.dark)); g.fillStyle = grad; g.fillRect(0, 0, this.bw, h); this.hazeArt = c; }
        this.farIslands = [0, 1, 2].map(i => ({ s: A.fragment(14 + i * 6, 0.2 + i * 0.3, true, this.season), x: (i + 0.5) / 3 * this.bw * 2 + rand() * 80, y: 4 + rand() * 12 }));
        this.moonArt = A.moon(this.bodies ? this.bodies.moon.phase : 0.5);
        this.rainbowArt = A.rainbow(Math.round(this.I.w * 0.45), 0.55);
        this.rainClouds = [0, 1, 2].map(i => A.cloud(Math.round(this.I.w * (0.18 + i * 0.03)), 18 + i * 3, rand, SkyIslandLand.rgb(lt.cloudShade.map(v => v * 0.75)), SkyIslandLand.rgb(lt.cloudShade.map(v => v * 0.5)), SkyIslandLand.rgb(lt.cloudDeep.map(v => v * 0.5))));
        // The stars, in four states of twinkle.
        this.starArt = [0, 1, 2, 3].map(tick => {
            const c = A.canvas(this.bw, Math.ceil(this.bh * 0.85)), g = c.getContext('2d');
            for (const s of this.stars) {
                const on = SkyIslandLogic.hash(Math.round(s.k * 9999), tick) > 0.1;
                g.fillStyle = on ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)';
                g.fillRect(s.x, s.y, 1, 1);
                if (s.big && on) { g.fillRect(s.x - 1, s.y, 1, 1); g.fillRect(s.x + 1, s.y, 1, 1); g.fillRect(s.x, s.y - 1, 1, 1); g.fillRect(s.x, s.y + 1, 1, 1); }
            }
            return c;
        });
    }

    draw() {
        const g = this.ctx, I = this.I, lt = this.light, t = this.time, bw = this.bw, bh = this.bh;
        const far = Math.round(this.scroll * bw * 0.08), near = Math.round(this.scroll * bw * 0.25);
        // The sky, stars, the sun and the moon.
        g.drawImage(this.skyArt, 0, 0);
        if (lt.stars > 0.05) { g.globalAlpha = lt.stars; g.drawImage(this.starArt[Math.floor(t * 3) % 4], 0, 0); g.globalAlpha = 1; }
        const hz = this.seaY + 10;
        const place = b => ({ x: Math.round(b.x * bw), y: Math.round(hz - Math.max(-10, Math.min(70, b.alt)) / 70 * hz * 0.92) });
        const sun = place(this.bodies.sun), moon = place(this.bodies.moon);
        if (this.bodies.sun.alt > 0) g.drawImage(this.sunArt.c, sun.x - 4, sun.y - 4);
        if (this.bodies.moon.alt > 1 && lt.dark > 0.2) { g.globalAlpha = Math.min(1, lt.dark * 1.5); g.drawImage(this.moonArt.c, moon.x - 6, moon.y - 6); g.globalAlpha = 1; }
        // Far clouds and far visitors, behind the island.
        this.clouds.forEach((cl, i) => { if (cl.far) g.drawImage(this.cloudArt[i].c, Math.round(cl.x - far), Math.round(cl.y)); });
        if (this.weather.rainbow > 0 && this.dark < 0.6) { g.globalAlpha = Math.min(1, this.weather.rainbow / 10) * (1 - this.dark); g.drawImage(this.rainbowArt.c, this.ix + Math.round(I.w / 2) - this.rainbowArt.ax, this.iy - this.rainbowArt.h + Math.round(I.depth * 0.3)); g.globalAlpha = 1; }
        if (this.holidayId === 'stpatricks' && !this.holiday.plain && this.dark < 0.6) { g.globalAlpha = 0.5 * (1 - this.dark); g.drawImage(this.rainbowArt.c, this.ix + Math.round(I.w * 0.75) - this.rainbowArt.ax, this.iy - this.rainbowArt.h + Math.round(I.depth * 0.5)); g.globalAlpha = 1; }
        this.drawVisitors('far', far);
        // The world below: the ground rolling by under the sea of cloud, the island's shadow on it.
        this.drawBelow('back');
        this.clouds.forEach((cl, i) => { if (cl.mid) g.drawImage(this.cloudArt[i].c, Math.round(cl.x - near * 0.5), Math.round(cl.y + this.bobLag)); });
        if (this.sleigh) { const s = this.sleighArt[Math.floor(this.sleigh.t * 6) % 2 ? 'a' : 'b'].r; g.drawImage(s.c, Math.round(this.sleigh.x) - s.ax, Math.round(this.sleigh.y + Math.sin(this.sleigh.t * 2) * 2)); }
        // Fragments and the orbiter behind the island; then the island, into the scratch, tinted for the hour.
        this.drawFragments(false);
        this.visitors.drawOrbiter(g, false);
        this.drawIsland();
        g.drawImage(this.scratch, this.ix - this.terrain.ox, this.iy - this.terrain.oy - this.towerArt.h + this.bob);
        this.drawFragments(true);
        this.visitors.drawOrbiter(g, true);
        // The rain cloud over it.
        if (this.weather.rain > 0.02 || this.weather.snowing > 0.02) {
            g.globalAlpha = Math.max(this.weather.rain, this.weather.snowing);
            this.rainClouds.forEach((rc, i) => g.drawImage(rc.c, this.ix + Math.round(I.w * (0.32 + i * 0.17)) - rc.ax + Math.round(Math.sin(t * 0.1 + i) * 5), this.iy - 60 - rc.h + i * 4 + this.bob));
            g.globalAlpha = 1;
            g.fillStyle = 'rgba(190,220,255,0.55)';
            for (const d of this.drops) g.fillRect(this.ix + Math.round(d.x), this.iy + Math.round(d.y) + this.bob, 1, 3);
            g.fillStyle = '#f8f8ff';
            for (const f of this.flakes) g.fillRect(this.ix + Math.round(f.x), this.iy + Math.round(f.y) + this.bob, 1, 1);
        }
        // Near visitors, the balloon, the front of the cloud sea, near clouds, fireworks and birds.
        this.drawVisitors('near', near);
        this.visitors.drawBalloon(g);
        this.drawBelow('front');
        this.clouds.forEach((cl, i) => { if (!cl.far && !cl.mid) g.drawImage(this.cloudArt[i].c, Math.round(cl.x - near), Math.round(cl.y)); });
        for (const r of this.rockets) {
            if (!r.burst) { g.fillStyle = '#fff0c0'; g.fillRect(Math.round(r.x), Math.round(r.y), 1, 2); continue; }
            const a = Math.max(0, 1 - r.t / 1.5);
            g.fillStyle = r.c; g.globalAlpha = a;
            for (const b of r.bits) if (Math.floor((b.x + b.y + r.t * 20)) % 3) g.fillRect(Math.round(b.x), Math.round(b.y), 1, 1);
            g.globalAlpha = 1;
        }
        this.wild.drawSky(g);
    }

    // The ground far below (hazed for the distance, its towns lit at night)
    // and the two layers of the sea of cloud, rolling past.
    drawBelow(which) {
        const g = this.ctx, lt = this.light, bw = this.bw, W = bw * 2, y = this.seaY - 10;
        const wrap = (c, speed, yy) => { const off = Math.round((this.travel * speed) % W); g.drawImage(c, -off, yy); g.drawImage(c, W - off, yy); };
        if (which === 'back') {
            if (this.groundArt) {
                wrap(this.groundArt.c, 1, this.seaY);
                // The haze of the height: the horizon's colour over the ground, thick at the top.
                g.drawImage(this.hazeArt, 0, this.seaY);
                if (this.dark > 0.3) { g.globalAlpha = Math.min(1, (this.dark - 0.3) * 2); wrap(this.groundArt.lights, 1, this.seaY); g.globalAlpha = 1; }
            }
            // The island's shadow on the clouds.
            g.fillStyle = `rgba(20,30,60,${(0.14 * (1 - this.dark * 0.7)).toFixed(3)})`;
            g.beginPath(); g.ellipse(this.ix + this.I.w / 2 + 6, this.seaY + 26 + this.bob * 0.5, this.I.w * 0.42, 9, 0, 0, Math.PI * 2); g.fill();
            wrap(this.sea.back, 1.8, y);
            // Far islands poking through, hazed.
            g.globalAlpha = 0.55;
            for (const fi of this.farIslands) { const off = Math.round((this.travel * 1.4) % W); const x = ((fi.x - off) % W + W) % W; g.drawImage(fi.s.c, Math.round(x) - fi.s.ax, y + Math.round(fi.y) + 14); }
            g.globalAlpha = 1;
        } else wrap(this.sea.front, 2.8, y + 12);
    }

    // The bits of rock in orbit: behind the island (sinking) or in front, each washed for the hour.
    drawFragments(front) {
        const g = this.ctx, I = this.I, lt = this.light;
        for (let i = 0; i < I.fragments.length; i++) {
            const f = this.fragmentAt(i);
            if (f.front !== front) continue;
            const s = this.fragmentArt[i];
            const x = this.ix + Math.round(f.x) - s.ax, y = this.iy + Math.round(f.y) - s.h + 1 + this.bobLag;
            g.drawImage(s.c, x, y);
            if (lt.wash[3] > 0.005) { this.vs ||= document.createElement('canvas'); const vs = this.vs, vg = vs.getContext('2d'); if (vs.width !== s.w || vs.height !== s.h) { vs.width = s.w; vs.height = s.h; } vg.clearRect(0, 0, s.w, s.h); vg.drawImage(s.c, 0, 0); vg.globalCompositeOperation = 'source-atop'; vg.fillStyle = SkyIslandLand.rgb(lt.wash, lt.wash[3]); vg.fillRect(0, 0, s.w, s.h); vg.globalCompositeOperation = 'source-over'; g.drawImage(vs, x, y); }
            if (!front) { g.globalAlpha = 0.25; g.fillStyle = SkyIslandLand.rgb(lt.horizon); g.fillRect(x, y, s.w, s.h); g.globalAlpha = 1; }
        }
    }

    // Each passing island is drawn into its own small scratch, washed for
    // the hour like ours (far ones a little hazier), and copied over.
    drawVisitors(which, offset) {
        const g = this.ctx, lt = this.light;
        this.vs2 ||= document.createElement('canvas');
        const vs = this.vs2, vg = vs.getContext('2d');
        for (const v of this.visitors.islands) {
            if ((which === 'far') !== !v.near) continue;
            if (vs.width !== v.art.w || vs.height !== v.art.h) { vs.width = v.art.w; vs.height = v.art.h; }
            vg.clearRect(0, 0, vs.width, vs.height);
            this.visitors.drawOne(v, vg);
            const haze = v.near ? 0 : 0.3;
            const a = lt.wash[3] * 0.95 + haze * (1 - lt.wash[3]);
            if (a > 0.005) {
                const col = v.near ? lt.wash : lt.wash.map((c, i) => i < 3 ? c + (lt.horizon[i] - c) * 0.7 : c);
                vg.globalCompositeOperation = 'source-atop'; vg.fillStyle = `rgba(${col.slice(0, 3).map(Math.round).join(',')},${a.toFixed(3)})`; vg.fillRect(0, 0, vs.width, vs.height); vg.globalCompositeOperation = 'source-over';
            }
            const x = Math.round(v.x) - v.art.ox - Math.round(v.art.I.w / 2) - Math.round(offset * (v.near ? 0.6 : 1)), y = Math.round(v.y) - v.art.oy;
            g.drawImage(vs, x, y);
        }
    }

    // Everything on the island, in order of where it stands, then the
    // hour's wash over it, then whatever shines in the dark.
    drawIsland() {
        const g = this.sg, I = this.I, A = SkyIslandArt, t = this.time, lt = this.light, T = this.terrain;
        const ox = T.ox, oy = T.oy + this.towerArt.h;
        g.clearRect(0, 0, this.scratch.width, this.scratch.height);
        g.drawImage(T.c, 0, this.towerArt.h);
        g.save(); g.translate(ox, oy);
        // Ripples and sparkle on the lake; the roots and vines trailing from the rock.
        for (const r of this.ripples) { const rr = 1 + r.t * 6; g.strokeStyle = `rgba(234,246,255,${(1 - r.t).toFixed(2)})`; g.beginPath(); g.ellipse(r.x, r.y, rr, rr * 0.45, 0, 0, Math.PI * 2); g.stroke(); }
        if (!this.frozen) { g.fillStyle = A.WATER.pale; for (const wb of [I.lake, I.pond]) for (let i = 0; i < (wb === I.lake ? 8 : 3); i++) { const k = Math.floor(t * 2 + i * 7) % 11; g.fillRect(wb.x - wb.rx + 5 + ((i * 13 + k * 3) % Math.max(1, wb.rx * 2 - 10)), wb.y - Math.round(wb.ry * 0.4) + ((i * 5 + k) % Math.max(1, wb.ry)), 2, 1); } }
        { const r = this.rootArt[Math.floor(t * 1.2) % 3]; g.drawImage(r.c, r.x, r.y); }
        // The live list: whatever moves (and the trees, on High, so they sway).
        const list = [];
        const sprite = (x, y, s, sortY, dy = 0) => list.push({ y: sortY ?? y, draw: gg => gg.drawImage(s.c, Math.round(x) - s.ax, Math.round(y) - s.h + 1 + dy) });
        if (I.windmill) { const m = this.windmillArt; const s = m.sails[Math.floor(this.sail * 2) % 8]; list.push({ y: I.windmill.base + 0.01, draw: gg => gg.drawImage(s.c, I.windmill.x - s.ax, I.windmill.base - m.tower.h + 1 + m.hub.y - s.ax) }); }
        { const tw = this.towerArt, f = tw.flags[Math.floor(t * (2 + this.weather.wind * 6)) % 3]; list.push({ y: I.tower.base + 0.01, draw: gg => gg.drawImage(f.c, I.tower.x - tw.ax + tw.pole.x + 1, I.tower.base - tw.h + 1 + tw.pole.y) }); }
        if (!this.frozen) { const b = this.boatArt, dir = Math.cos(t * 0.07) < 0; list.push({ y: I.boat.y + 0.5, draw: gg => { const bx = Math.round(this.boatX), by = I.boat.y + (Math.sin(t * 1.3) > 0 ? 0 : 1); if (dir) { gg.save(); gg.translate(bx + b.w - b.ax, 0); gg.scale(-1, 1); gg.drawImage(b.c, 0, by - b.h + 1); gg.restore(); } else gg.drawImage(b.c, bx - b.ax, by - b.h + 1); } }); }
        const wind = this.weather.wind;
        if (this.sway) for (const tr of I.trees) { const ts = this.treeArt(tr); const sway = Math.round(Math.sin(t * (1.5 + wind * 2) + tr.phase * 6) * wind * 1.4) * tr.sway; list.push({ y: tr.y, draw: gg => { gg.drawImage(ts.trunk.c, tr.x - ts.trunk.ax, tr.y - ts.trunk.h + 1); gg.drawImage(ts.canopy.c, tr.x - ts.canopy.ax + sway, tr.y - ts.canopy.h + 1); } }); }
        for (const d of this.decor) { if (d.static) continue; const s = d.sprite(); const dy = (d.dy || 0) + (d.sway ? Math.round(Math.sin(t * 2 + d.x) * 1) : 0); sprite(d.x, d.y, s, d.y, dy); }
        for (const e of this.eggs) sprite(e.x, e.y, e.sprite);
        this.folk.draw(list);
        this.cats.draw(list);
        this.dogs.draw(list);
        this.wild.draw(list);
        this.visitors.drawWalker(list);
        list.sort((a, b) => a.y - b.y);
        let i = 0;
        this.bands.forEach((band, k) => {
            if (band) g.drawImage(band.c, band.x, band.y);
            const hi = k < this.bandBounds.length ? this.bandBounds[k] : Infinity;
            for (; i < list.length && list[i].y <= hi; i++) list[i].draw(g);
        });
        // Bunting between the roofs of neighbouring houses.
        if (this.bunting) {
            const rows = [...new Set(I.houses.map(h => h.row))];
            for (const row of rows) {
                const hs = I.houses.filter(h => h.row === row).sort((a, b) => a.x - b.x);
                for (let i = 0; i + 1 < hs.length; i++) {
                    const a = hs[i], b = hs[i + 1], aa = this.houseArt(a), ba = this.houseArt(b);
                    const x0 = a.x + a.w - 1, y0 = a.base - aa.h + 1 + aa.eaves, x1 = b.x, y1 = b.base - ba.h + 1 + ba.eaves;
                    if (x1 - x0 > 50 || x1 - x0 < 4) continue;
                    for (let x = x0; x <= x1; x += 2) { const k = (x - x0) / (x1 - x0); const y = Math.round(y0 + (y1 - y0) * k + Math.sin(k * Math.PI) * 4); g.fillStyle = this.bunting[Math.floor(x / 2) % this.bunting.length]; g.fillRect(x, y, 1, 2); g.fillStyle = '#3a3a3a'; g.fillRect(x + 1, y, 1, 1); }
                }
            }
        }
        // The waterfalls, smoke, leaves, confetti.
        this.falls.forEach((frames, k) => { const f = frames[Math.floor(t * 10) % 4], fl = I.falls[k]; g.drawImage(f.c, fl.x - f.ax, fl.top + 1); });
        for (const p of this.puffs) { const r = p.t < 0.8 ? 0 : p.t < 1.8 ? 1 : 2, x = Math.round(p.x), y = Math.round(p.y); g.fillStyle = p.t < 1.8 ? A.P.smoke : A.P.smokeDim; if (r === 0) g.fillRect(x, y, 1, 1); else if (r === 1) { g.fillRect(x - 1, y, 3, 1); g.fillRect(x, y - 1, 1, 3); } else { g.fillRect(x - 1, y - 1, 3, 3); g.fillRect(x - 2, y, 5, 1); } }
        for (const l of this.leaves) { g.fillStyle = l.c; g.fillRect(Math.round(l.x), Math.round(l.y), 1, 1); }
        for (const p of this.confetti) { g.fillStyle = p.c; g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); }
        g.restore();
        // The hour's wash over everything on the island.
        if (lt.wash[3] > 0.005) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = `rgba(${lt.wash.slice(0, 3).map(Math.round).join(',')},${lt.wash[3].toFixed(3)})`; g.fillRect(0, 0, this.scratch.width, this.scratch.height); g.globalCompositeOperation = 'source-over'; }
        // What shines after dark: windows and lamps (one baked layer, redone
        // when the lit set changes), crystals, the cave, lights, fireflies, sparks; the magic, always.
        g.save(); g.translate(ox, oy);
        const dark = this.dark;
        this.drawMagic(g);
        if (dark > 0.3) {
            const late = this.hour >= 23 || this.hour < 5;
            const key = `${late}|${this.config.lights}|${this.dayKey}|${JSON.stringify(this.lightOverride)}`;
            if (key !== this.glowKey) this.bakeGlows(key);
            g.globalAlpha = Math.min(1, (dark - 0.3) * 2);
            g.drawImage(this.glowLayer, -ox, -oy);
            g.globalAlpha = 1;
            for (const cr of I.crystals) { const gl = this.glows.crystal[cr.hue]; g.globalAlpha = dark * (0.6 + 0.4 * Math.sin(t * 2 + cr.x)); g.drawImage(gl.c, cr.x - gl.ax, cr.y + 1 - gl.ax); g.globalAlpha = 1; }
            if (I.lighthouse) { const k = Math.floor(t * 1.5) % 4; if (k < 2) { const lx = I.lighthouse.x, ly = I.lighthouse.base - this.lighthouseArt.h + 4; const d = k === 0 ? -1 : 1; g.fillStyle = `rgba(255,233,160,${(0.9 * dark).toFixed(2)})`; for (let i = 1; i < 26; i++) { g.globalAlpha = (1 - i / 26) * dark * 0.6; g.fillRect(lx + d * i, ly - Math.round(i * 0.15) - 1, 1, 2 + Math.round(i * 0.3)); } g.globalAlpha = 1; } }
            for (const b of this.bugs) { if (Math.sin(b.t * 3 + b.k) > 0.2) { g.fillStyle = '#d8ff70'; g.fillRect(Math.round(b.x), Math.round(b.y), 1, 1); } }
            // The watch's lantern casts a little pool.
            for (const p of this.folk.people) if (!p.inside && this.folk.toolFor(p) === A.TOOLS.lantern) { const gl = this.glows.lamp; g.globalAlpha = 0.7 * dark; g.drawImage(gl.c, Math.round(p.x) + (p.dir < 0 ? -5 : 5) - gl.ax, Math.round(p.y) - 5 - gl.ax); g.globalAlpha = 1; }
        }
        if (I.cave && this.wild.dragon.state !== 'asleep') { const gl = this.glows.ember; g.globalAlpha = 0.5 + 0.3 * Math.sin(t * 6); g.drawImage(gl.c, I.cave.x - gl.ax, I.cave.y + 1 - gl.ax); g.globalAlpha = 1; }
        for (const s of this.sparks) { g.fillStyle = s.heart ? '#f05a8a' : (Math.floor(s.t * 20) % 2 ? '#ffd060' : '#ff7a2a'); if (s.heart) { g.fillRect(Math.round(s.x), Math.round(s.y), 1, 1); g.fillRect(Math.round(s.x) - 1, Math.round(s.y) - 1, 1, 1); g.fillRect(Math.round(s.x) + 1, Math.round(s.y) - 1, 1, 1); } else g.fillRect(Math.round(s.x), Math.round(s.y), 1, 1); }
        if (this.lights.length && dark > 0.2) { const cols = ['#ff5a5a', '#ffd040', '#50d070', '#50a0ff', '#ff80d0']; for (const l of this.lights) { const on = Math.floor(t * 2 + l.k) % 3 !== 0; g.fillStyle = on ? cols[l.k] : '#3a3a3a'; g.fillRect(l.x, l.y + 1, 1, 1); } }
        if (this.squareTree && dark > 0.2) { const cols = ['#ff5a5a', '#ffd040', '#50d070', '#50a0ff']; const s = this.squareTree, x0 = I.square.x - s.ax, y0 = I.square.y - 2 - s.h + 1; s.lights.forEach((l, i) => { if (Math.floor(t * 3 + i) % 4 !== 0) { g.fillStyle = cols[i % 4]; g.fillRect(x0 + l.x, y0 + l.y, 1, 1); } }); }
        g.restore();
    }

    // Roots trailing from under the island and vines down the cliffs, in
    // three states of sway, baked: one image a frame instead of a few
    // hundred pixels.
    bakeRoots(k) {
        const I = this.I, R = SkyIslandArt.ROCK, phase = k * Math.PI * 2 / 3;
        const x0 = -4, y0 = I.tiers[0].front[I.tiers[0].x0] || 0, c = SkyIslandArt.canvas(I.w + 8, I.depth + I.underH + 6 - y0), g = c.getContext('2d');
        g.translate(-x0, -y0);
        for (const r of I.roots) {
            let x = r.x;
            for (let i = 0; i < r.len; i++) {
                const y = r.y + i, kk = i / r.len;
                if (SkyIslandLogic.hash(i, r.x) > 0.72) x += r.lean * (SkyIslandLogic.hash(i, r.x + 1) > 0.3 ? 1 : -1);
                const sway = Math.round(Math.sin(phase + r.k + kk * 2) * kk * 2);
                g.fillStyle = i % 5 === 4 ? R.root2 : R.root;
                g.fillRect(x + sway, y, r.thick && kk < 0.6 ? 2 : 1, 1);
                if (i % 9 === 4 && kk > 0.2) g.fillRect(x + sway + (r.lean > 0 ? -1 : 1), y, 1, 1);
            }
        }
        for (const v of I.vines) {
            for (let i = 0; i < v.len; i++) { const sway = Math.round(Math.sin(phase + v.k + i * 0.3) * (i / v.len) * 1.5); g.fillStyle = i % 3 === 2 ? '#3f8a39' : '#2f7f31'; g.fillRect(v.x + sway, v.y + i, 1, 1); if (i % 4 === 1) g.fillRect(v.x + sway + (i % 8 === 1 ? 1 : -1), v.y + i, 1, 1); }
        }
        return { c, x: x0, y: y0 };
    }
    // The cyan magic in the cracks under the island: a glow that pulses,
    // crackling lines, and an arc to a fragment now and then.
    drawMagic(g) {
        const I = this.I, t = this.time, gl = this.glows.magic, h = SkyIslandLogic.hash;
        for (const cr of I.cracks) {
            const pulse = 0.5 + 0.5 * Math.sin(t * 1.3 + cr.k);
            g.globalAlpha = 0.35 + 0.4 * pulse;
            g.drawImage(gl.c, cr.x - gl.ax, cr.y + Math.round(cr.len / 2) - gl.ax);
            g.globalAlpha = 1;
            let x = cr.x;
            const tick = Math.floor(t * 8);
            for (let i = 0; i < cr.len; i++) {
                if (h(i + tick, Math.round(cr.k * 100)) > 0.45) x += cr.lean * (h(i, tick) > 0.5 ? 1 : -1);
                const bright = h(i * 3, tick + Math.round(cr.k * 10)) > 0.5;
                g.fillStyle = bright ? '#c0f8ff' : SkyIslandArt.P.cyan;
                g.fillRect(x, cr.y + i, 1, 1);
                if (bright && h(i, tick * 7) > 0.7) g.fillRect(x + (h(i, 2) > 0.5 ? 1 : -1), cr.y + i, 1, 1);
            }
        }
        if (this.arc) {
            const a = this.arc, from = { x: a.from.x, y: a.from.y + a.from.len }, to = { x: a.to.x, y: a.to.y - 4 };
            const n = Math.max(6, Math.round(Math.hypot(to.x - from.x, to.y - from.y) / 4)), tick = Math.floor(t * 20);
            g.globalAlpha = Math.max(0, 1 - a.t / 0.35);
            for (let i = 0; i <= n; i++) { const k = i / n; const x = Math.round(from.x + (to.x - from.x) * k + (h(i, tick) - 0.5) * 6 * Math.sin(k * Math.PI)), y = Math.round(from.y + (to.y - from.y) * k + (h(i + 50, tick) - 0.5) * 4); g.fillStyle = i % 2 ? '#c0f8ff' : SkyIslandArt.P.cyan; g.fillRect(x, y, 1, 1); }
            g.globalAlpha = 1;
        }
    }

    // The lit windows and the lamps, with their glows, as one layer.
    bakeGlows(key) {
        const I = this.I, A = SkyIslandArt, T = this.terrain;
        this.glowKey = key;
        this.glowLayer ||= A.canvas(1, 1);
        const c = this.glowLayer;
        if (c.width !== this.scratch.width || c.height !== this.scratch.height) { c.width = this.scratch.width; c.height = this.scratch.height; }
        const g = c.getContext('2d');
        g.clearRect(0, 0, c.width, c.height);
        g.save(); g.translate(T.ox, T.oy + this.towerArt.h);
        const lit = (x, y, w, h) => { const gl = this.glows.window; g.drawImage(gl.c, x + Math.floor(w / 2) - gl.ax, y + Math.floor(h / 2) - gl.ax); g.fillStyle = A.P.glassLit; g.fillRect(x, y, w, h); g.fillStyle = '#6a4229'; if (w > 3) { g.fillRect(x + Math.floor(w / 2), y, 1, h); g.fillRect(x, y + Math.floor(h / 2), w, 1); } };
        for (const h of I.houses) {
            if (!this.windowsLit(h)) continue;
            const art = this.houseArt(h), top = h.base - art.h + 1;
            for (const win of art.windows) lit(h.x + win.x - 1 + 1, top + win.y + 1, win.w - 2, win.h - 2);
        }
        if (this.config.lights) {
            const tw = this.towerArt, top = I.tower.base - tw.h + 1;
            if (SkyIslandLogic.hash(99, this.dayKey) > 0.3) for (const win of tw.windows) lit(I.tower.x - tw.ax + win.x, top + win.y, win.w, win.h);
            if (I.windmill && SkyIslandLogic.hash(98, this.dayKey) > 0.4) { const m = this.windmillArt, w0 = m.windows[0]; lit(I.windmill.x - m.tower.ax + w0.x, I.windmill.base - m.tower.h + 1 + w0.y, w0.w, w0.h); }
            for (const l of I.lamps) { const gl = this.glows.lamp; g.drawImage(gl.c, l.x - gl.ax, l.y - 11 - gl.ax + 1); g.fillStyle = A.P.lamp; g.fillRect(l.x - 1, l.y - 12, 3, 3); }
        }
        g.restore();
    }

    // ---- Keys and tests ------------------------------------------------------------------------------

    debugState() {
        const v = this.visitors;
        return { seed: this.seed, name: this.I.name, kept: this.config.seed === this.seed, bw: this.bw, bh: this.bh, px: this.px, portrait: this.portrait, island: { w: this.I.w, depth: this.I.depth, underH: this.I.underH, tiers: this.I.tiers.length, houses: this.I.houses.length, trees: this.I.trees.length, lamps: this.I.lamps.length, fields: this.I.fields.length, side: this.I.side, falls: this.I.falls.length },
            season: this.season, holiday: this.holidayId, frozen: this.frozen, hour: +this.hour.toFixed(2), dark: +this.dark.toFixed(2), weather: { state: this.weather.state, rain: +this.weather.rain.toFixed(2), wind: +this.weather.wind.toFixed(2) }, bob: this.bob,
            people: this.folk.people.length, outdoors: this.folk.people.filter(p => !p.inside).length, acts: this.folk.people.filter(p => !p.inside).map(p => p.act), tiers: this.folk.people.filter(p => !p.inside).map(p => p.tier), cats: this.cats.cats.map(c => ({ id: c.spec.id, state: c.state, perch: c.perch?.kind || null })),
            dogs: this.dogs.dogs.length, wildlife: this.wild.things.filter(t => !t.hidden).map(t => t.kind), visitors: v.islands.map(i => ({ kind: i.kind, near: i.near, x: Math.round(i.x), waving: i.waving, name: i.name })), orbiter: v.orbiter ? { name: v.orbiter.name, front: v.orbiter.front, x: Math.round(v.orbiter.x) } : null, balloon: v.balloon ? v.balloon.phase : null,
            decor: this.decor.length, lights: this.lights.length, eggs: this.eggs.length, stats: { ...this.stats, folk: this.folk.stats, cats: this.cats.stats, wild: this.wild.stats, visits: v.stats } };
    }
}
