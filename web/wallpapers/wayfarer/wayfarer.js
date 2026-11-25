// Wayfarer (SPEC §10.38): an endless walk through a cosy fantasy world. A
// traveller follows a road that never ends, through forests and meadows,
// along lakes and the sea, over mountain passes and moors, into villages
// and walled cities, by day and by night, in every season and weather.
//
//   way-logic.js    the world: road, countries, places, sky, weather, the journey (pure)
//   way-models.js   every shape, and a square of the world as triangles (pure)
//   way-actors.js   people, animals, birds and carts, posed
//   way-gl.js       the view, in WebGL
//   wayfarer.js     this: the manager that walks it
//
// Cheap by construction (SPEC §4.8): the world is built a square at a time
// as the walk reaches it (a millisecond or two each, spread over frames),
// and drawn in a few dozen calls; the main thread poses a few dozen figures
// and steers the camera. The GPU does the rest, and is watched here.

const WAY_TIMES = { dawn: 0.262, day: 0.4, dusk: 0.738, night: 0.0 };     // 'day' is mid-morning: the sun high enough to be day, low enough to model a street
const WAY_TIME_ORDER = ['cycle', 'clock', 'dawn', 'day', 'dusk', 'night'];
const WAY_TIME_NAMES = { cycle: 'the day goes round', clock: 'by your clock', dawn: 'dawn', day: 'day', dusk: 'dusk', night: 'night' };
const WAY_WEATHER_ORDER = ['auto', 'clear', 'fair', 'cloudy', 'rain'];
const WAY_WEATHER_NAMES = { auto: 'comes and goes', clear: 'clear', fair: 'fair, with clouds', cloudy: 'overcast', rain: 'rain (snow where it is cold)' };
const WAY_CAMERAS = ['follow', 'orbit', 'first', 'drift'];
const WAY_CAMERA_NAMES = { follow: 'Behind the traveller', orbit: 'Orbit: drag to turn it about them', first: 'Through their eyes', drift: 'Cinematic' };
const WAY_ORBITS = ['fixed', 'turning'];
const WAY_PICKS = ['surprise', 'choose'];
// How much wildlife (WayLogic.WILD_LEVELS), and how the herds and flocks there always were scale with it.
const WAY_WILD = { none: 0, few: 0.6, some: 1, plenty: 1.5, abundant: 2, teeming: 2.6 };
const WAY_CRAFT = ['never', 'sometimes', 'often'];
// Which countries the road passes through: all of them, a kind of country, or the ones ticked.
const WAY_COUNTRY = { all: null, woods: ['forest', 'deepwood', 'grove'], open: ['meadow', 'farm', 'moor'], shore: ['lake', 'coast', 'meadow'], high: ['pass', 'moor', 'forest'], choose: null };
const WAY_FORM_NAMES = { self: 'herself again', bear: 'a bear', owlbeast: 'an owl-beast', panther: 'a great black cat' };
// What a struggling GPU gives up, in turn: shadows, then resolution, then the outer ring of detail.
const WAY_GPU = [{ scale: 1, shadows: true }, { scale: 1, shadows: false }, { scale: 0.75, shadows: false }, { scale: 0.55, shadows: false, thin: true }, { scale: 0.4, shadows: false, thin: true }];
const WAY_FAR = 256;            // metres to a side of the far squares

class WayfarerAnimationManager {
    constructor(host) {
        this.host = host;
        this.config = WP.settings.load();
        this.isRunning = false;
        this.animationId = null;
        this.lastTime = 0;
        this.seconds = 0;
        this.pan = 0;               // Android's pages, as a turn of the head
        this.panTarget = 0;
        this.glance = { yaw: 0, pitch: 0, held: false, idle: 9 };   // a drag looks around; it eases back
        this.orbit = this.orbitFrom(this.config);                    // the orbiting camera: a drag turns it, and it stays
        this.orbitDirty = false;
        this.onWheel = event => this.zoom(event.deltaY);
        this.gpu = { step: 0, late: 0, calm: 0, pace: 0, gaveUp: false };
        this.shadowFade = 0;
        this.wild = new Map();      // the wild animals, by the stretch of road they are at home along
        this.wildParties = [];
        this.near = new Map();      // squares by key, built and (with WebGL) on the GPU
        this.far = new Map();
        this.active = { near: [], far: [], hole: null, key: '' };
        this.queue = [];
        this.retired = [];
        this.actors = new Map();
        this.traffic = [];
        this.wonders = [];
        this.drift = [0, 0, 0];
        this.cloudDrift = [0.3, 0.7];
        this.cut = 9;               // seconds since the camera last cut
        this.shot = { index: 0, t: 0, z0: 0, span: 30 };
        this.cam = { x: 0, y: 0, z: 0, heading: 0, pitch: 0 };
        this.scene = { cam: this.cam, lamps: [], near: [], far: [], ghosts: [] };
        this.onResize = () => this.resize();
        this.onLost = event => { event.preventDefault(); this.renderer.lost = true; };
        // A lost graphics context takes every buffer with it: build the view again.
        this.onRestored = () => {
            this.renderer.lost = false;
            this.clearSquares();
            this.flat = !this.renderer.init();
            if (this.flat) this.ctx = this.canvas.getContext('2d');
            this.applyQuality(true);
            this.stream(true);
            this.resize();
        };
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        const canvas = this.canvas = document.createElement('canvas');
        Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: '-2', pointerEvents: 'none' });
        document.body.appendChild(canvas);
        // A veil the cinematic camera dips through when it cuts.
        const veil = this.veil = document.createElement('div');
        Object.assign(veil.style, { position: 'fixed', inset: '0', zIndex: '-1', pointerEvents: 'none', background: '#0b0d14', opacity: '0' });
        document.body.appendChild(veil);
        this.renderer = new WayRenderer(canvas);
        // No WebGL (or it was refused): the same walk, painted flat on a 2D canvas.
        this.flat = !this.renderer.init();
        if (this.flat) this.ctx = canvas.getContext('2d');
        canvas.addEventListener('webglcontextlost', this.onLost);
        canvas.addEventListener('webglcontextrestored', this.onRestored);
        window.addEventListener('resize', this.onResize);
        this.moving = new WaySoup(8192);
        // Whoever is half there (the rogue unseen, the druid between two shapes) is drawn apart, see-through.
        this.ghosts = [{ soup: new WaySoup(4096), alpha: 0, shimmer: 0 }, { soup: new WaySoup(4096), alpha: 0, shimmer: 0 }];
        this.scene.ghosts = this.ghosts;
        this.stack = new WayStack();
        this.glows = new WaySprites(900);
        this.puffs = new WaySprites(256);
        if (!this.host.params.thumb) {
            let from = null;
            const look = (x, y) => {
                if (!this.config.touch || !from) return;
                if (from.orbit) { WayLogic.orbitDrag(this.orbit, from.orbit, x - from.x, y - from.y, this.width, this.height); return; }
                this.glance.yaw = WayLogic.clamp(from.yaw + (x - from.x) / this.width * 2.4, -2.6, 2.6);
                this.glance.pitch = WayLogic.clamp(from.pitch + (from.y - y) / this.height * 1.2, -0.5, 0.7);
                this.glance.idle = 0;
            };
            // (Without this a phone's browser takes the finger for a page pan a few pixels in, and cancels the drag.)
            document.documentElement.style.touchAction = this.config.touch ? 'none' : '';
            this.stopGestures = this.host.gestures({
                start: (x, y) => {
                    // In orbit a drag turns the camera about the traveller and it stays; otherwise it turns the head, which eases back.
                    const orbiting = this.orbiting() && this.config.touch;
                    from = { x, y, yaw: this.glance.yaw, pitch: this.glance.pitch, orbit: orbiting ? WayLogic.orbitGrab(this.orbit, this.config.orbitMode === 'turning') : null };
                    this.glance.held = true;
                },
                move: look,
                end: () => { this.glance.held = false; if (from?.orbit) { this.orbit.held = false; this.orbitDirty = true; } from = null; },
            });
            document.addEventListener('wheel', this.onWheel, { passive: true });
            this.gpu.step = WayLogic.clamp((Number(this.host.storage.get('gpu')) || 0) - 1, 0, WAY_GPU.length - 1);
            // No GPU at all: start where it would end up, and stay there.
            if (this.renderer.software) Object.assign(this.gpu, { step: WAY_GPU.length - 1, gaveUp: true });
        }
        this.seedScene();
        this.applyQuality(true);
        this.resize();
        // The whole of the first view before the stage calls it ready.
        this.stream(true);
        this.update(0);
        this.snapCamera();
        this.draw();
        this.lastTime = 0;
        this.animationId = requestAnimationFrame(t => this.frame(t));
    }

    stop() {
        this.isRunning = false;
        cancelAnimationFrame(this.animationId);
        window.removeEventListener('resize', this.onResize);
        this.stopGestures?.();
        document.documentElement.style.touchAction = '';
        document.removeEventListener('wheel', this.onWheel);
        this.canvas?.removeEventListener('webglcontextlost', this.onLost);
        this.canvas?.removeEventListener('webglcontextrestored', this.onRestored);
        this.renderer?.dispose();
        this.canvas?.remove();
        this.veil?.remove();
        this.canvas = null;
    }

    // Already on the road on the first frame: a few minutes short of somewhere.
    seedScene() {
        const c = this.config, L = WayLogic;
        this.world = L.world(Math.floor(Math.random() * 2 ** 31), { towns: c.towns, season: c.season, biomes: this.countries(c) });
        let leg = 40 + Math.floor(Math.random() * 4000);
        // The panel's thumbnail wants the picture on the tin: a village in the woods, just ahead.
        if (this.host.params.thumb) for (let tries = 0; tries < 6000 && !(this.world.leg(leg).place === 'village' && this.world.leg(leg).biome === 'forest'); tries++) leg++;
        const want = this.host.params.place;           // ?place=grand, city, village…: set off just short of one (for looking at them)
        if (want) for (let tries = 0; tries < 6000 && !(want === 'grand' ? this.world.leg(leg).grand : this.world.leg(leg).place === want && !this.world.leg(leg).grand); tries++) leg++;
        const before = this.host.params.thumb ? 88 : (this.world.leg(leg).radius || 30) + 35 + 60 * Math.random();
        this.journey = L.journeyStart(this.world, (leg + 0.5) * L.SLOT - before);
        this.journey.speed = L.WALK * c.pace;
        this.day = WAY_TIMES[c.time] ?? 0.31;       // 'cycle' sets off in the morning
        this.weather = L.weatherStart(c.weather, Math.random);
        this.nextTraffic = this.journey.distance + 40 + 60 * Math.random();
        this.nextWonder = 20 + 40 * Math.random();
        this.gather(true);
        this.shift = L.shiftStart(this.world.seed);
        this.stealth = L.stealthStart(this.world.seed);
    }
    countries(c) { return c.biomePick === 'choose' ? c.biomeChoice : WAY_COUNTRY[c.biomePick]; }
    // Who walks with the traveller: by the settings, and by this world's seed where it is left to chance.
    gather(fresh = false) {
        const c = this.config, L = WayLogic;
        const ids = L.party(this.world.seed, { count: c.companions, pick: c.companionPick, choice: c.companionChoice });
        // The panel says how many of those ticked are walking.
        const ticked = c.companionChoice.length;
        this.host.panel({ status: { company: ticked === 0 ? 'Nobody is ticked: walking alone' : ticked > ids.length ? `${ticked} ticked: the first ${ids.length} walk with you` : `${ids.length} walk${ids.length === 1 ? 's' : ''} with you` } });
        // Setting off, the company is in its places. Changed on the road, newcomers run up from behind and the rest turn back.
        if (fresh || !this.party) { this.party = L.partyStart(ids); this.leavers = []; return; }
        const { party, leavers } = L.partyChange(this.party, ids, this.journey, this.world);
        this.party = party;
        this.leavers.push(...leavers);
    }

    // ---- Quality ----------------------------------------------------------------------
    wants(effect) { return this.host.quality.effects.includes(effect); }
    applyQuality(now = false) {
        const q = this.host.quality, shadows = this.wants('shadows') && WAY_GPU[this.gpu.step].shadows;
        this.shadowTarget = shadows ? 1 : 0;
        if (now) this.shadowFade = this.shadowTarget;
        const thin = WAY_GPU[this.gpu.step].thin;
        // High: 7×7 near squares in 9×9 far. Medium: 5×5 in 7×7. Low: 5×5 in 5×5, and thinner in both.
        this.nearR = q.density >= 0.85 && !thin ? 3 : 2;
        this.farR = thin ? 2 : q.density >= 0.85 ? 4 : q.density >= 0.5 ? 3 : 2;
        this.reach = this.farR * WAY_FAR + WAY_FAR / 2 - 110;          // how far the land is drawn: just inside its edge
        this.density = q.density;
        // Fine models by the road in the squares about the traveller: a wide band on High, a narrow one on Medium, none on Low.
        this.detail = thin || q.density < 0.5 ? 0 : q.density >= 0.85 ? 2 : 1;
        if (!this.flat) {
            this.renderer.applyQuality({
                shadows: shadows || this.shadowFade > 0 ? (q.tier === 'high' ? 2048 : 1024) : 0,
                mirror: this.wants('mirror'),
                drops: Math.round(4200 * q.density),
            });
        }
    }
    onQuality() { this.applyQuality(); }
    onScroll(x) { this.panTarget = (x - 0.5) * 0.7; }
    // The orbiting camera, from the settings (degrees and metres) and back to them.
    orbiting() { return this.config.camera === 'orbit' && !this.flat; }
    orbitFrom(c) { const R = WayLogic.RAD, held = this.orbit?.reach; const o = WayLogic.orbitStart(c.orbitAzimuth * R, c.orbitElevation * R, c.orbitDistance); if (held) o.reach = Math.min(held, o.dist); return o; }
    zoom(by) {
        if (!this.orbiting() || !this.config.touch) return;
        const O = WayLogic.ORBIT, o = this.orbit;
        o.dist = WayLogic.clamp(o.dist * Math.exp(WayLogic.clamp(by, -240, 240) * 0.0012), O.distMin, O.distMax);
        o.idle = 0;
        this.orbitDirty = true;
    }
    // Where a drag or the wheel left it goes into the settings, on their sliders' steps, once the hand is off it.
    saveOrbit() {
        const o = this.orbit, c = this.config, R = WayLogic.RAD;
        this.orbitDirty = false;
        const az = Math.round(o.az / R), el = WayLogic.clamp(Math.round(o.el / R), 2, 90), dist = Math.round(o.dist * 2) / 2;
        if (az === c.orbitAzimuth && el === c.orbitElevation && dist === c.orbitDistance) return;
        c.orbitAzimuth = az === -180 ? 180 : az; c.orbitElevation = el; c.orbitDistance = dist;
        WP.settings.save(c);
    }
    onResume() { this.lastTime = 0; }

    applySettings(config) {
        const before = this.config;
        this.config = config;
        if (before.towns !== config.towns || before.season !== config.season || before.biomePick !== config.biomePick || String(before.biomeChoice) !== String(config.biomeChoice)) {
            // Another world along the same road: rebuild what is in view. (The walk is not reset: the same place on the road, in other country.)
            this.world = WayLogic.world(this.world.seed, { towns: config.towns, season: config.season, biomes: this.countries(config) });
            this.clearSquares();
            this.journey.camp = null;
            this.journey.mode = 'walk';
            this.stream(true);
        }
        if (before.companions !== config.companions || before.companionPick !== config.companionPick || String(before.companionChoice) !== String(config.companionChoice)) this.gather();
        if (before.wildlife !== config.wildlife) {
            // More or fewer animals: the wild ones are let out afresh, and the herds counted again. Nothing else moves.
            for (const [id, made] of this.actors) if (made.herd) this.actors.delete(id);
            this.cast();
        }
        if (before.traveller !== config.traveller) { this.shift = WayLogic.shiftStart(this.world.seed); this.stealth = WayLogic.stealthStart(this.world.seed); }
        if (before.camera !== config.camera) { this.cut = 0; this.shot.t = 0; this.shot.z0 = this.journey.z; this.snap = true; }
        if (!config.touch) this.glance.yaw = this.glance.pitch = 0;
        if (this.stopGestures) document.documentElement.style.touchAction = config.touch ? 'none' : '';
        if (before.orbitAzimuth !== config.orbitAzimuth || before.orbitElevation !== config.orbitElevation || before.orbitDistance !== config.orbitDistance) this.orbit = this.orbitFrom(config);
    }

    resize() {
        if (!this.canvas) return;
        const ratio = window.devicePixelRatio || 1;
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        const scale = ratio * (this.flat ? 1 : WAY_GPU[this.gpu.step].scale);
        const w = Math.max(1, Math.round(this.width * scale)), h = Math.max(1, Math.round(this.height * scale));
        if (this.flat) { this.canvas.width = w; this.canvas.height = h; } else this.renderer.resize(w, h);
    }

    // The traveller's look: one of WayActors.LOOKS, with or without their warpaint.
    look() {
        const c = this.config, key = c.traveller + (c.warpaint ? '' : ':plain');
        if (this.lookKey !== key) { const base = WayActors.LOOKS[c.traveller] || WayActors.LOOKS.ranger; this.lookKey = key; this.lookNow = c.warpaint || !base.paint ? base : { ...base, paint: false }; }
        return this.lookNow;
    }

    // ---- Keys (declared in the catalog) -----------------------------------------------------
    cycle(key, order, names) {
        this.config[key] = order[(order.indexOf(this.config[key]) + 1) % order.length];
        WP.settings.save(this.config);
        return names[this.config[key]];
    }
    nextCamera() {
        const name = this.cycle('camera', WAY_CAMERAS, WAY_CAMERA_NAMES);
        Object.assign(this.shot, { t: 0, z0: this.journey.z });
        this.cut = 0;
        this.snap = true;
        return name;
    }
    nextTime() { return `Time: ${this.cycle('time', WAY_TIME_ORDER, WAY_TIME_NAMES)}`; }
    // The druid's other shapes and the rogue's shadows, now. (A change asked for at a rest waits for the road.)
    craftNow() {
        const look = this.look();
        if (look.shifts) { this.shift.want = true; return this.shift.form === 'self' ? 'She takes another shape' : 'She takes her own shape again'; }
        if (look.stealth) { this.stealth.want = true; return this.stealth.hide ? 'Out of the shadows' : 'Into the shadows'; }
        return 'Only the druid and the rogue have a craft to use';
    }
    nextWeather() { return `Weather: ${this.cycle('weather', WAY_WEATHER_ORDER, WAY_WEATHER_NAMES)}`; }
    // On down the road to just short of the next place, as if an hour had passed.
    // How a far beast keeps step with its near model: the near rig's stride and own gait, and its gait in turns of it.
    farGait(kind, metres) {
        const q = WayCompanions.KINDS[kind], g = this._farGait || (this._farGait = { gait: 0, stride: 1, base: 'walk' });
        g.stride = q ? q.stride : 1.3; g.base = q ? q.gait : 'walk'; g.gait = metres / g.stride;
        return g;
    }
    skipAhead() {
        const L = WayLogic, j = this.journey, short = l => l.zc - (l.radius || 30) - 70;
        let next = this.world.leg(Math.floor(j.z / L.SLOT));
        while (short(next) < j.z + 30) next = this.world.leg(next.i + 1);
        Object.assign(j, L.journeyStart(this.world, short(next)), { distance: j.distance, speed: L.WALK * this.config.pace, sinceRest: j.sinceRest, gazed: j.gazed });
        for (const p of this.party) p.x = null;
        this.leavers.length = 0;
        this.traffic.length = 0;
        this.cut = 0;
        this.shot.t = 0;
        this.shot.z0 = j.z;
        this.snap = true;
        if (this.config.time === 'cycle') this.day = (this.day + 0.04) % 1;
        this.stream(true);
        const names = { city: 'a city', village: 'a village', hamlet: 'a hamlet in the pass', stones: 'a ring of standing stones', castle: 'a castle on its hill', elder: 'the elder tree', ruin: 'a ruined tower', abbey: 'a ruined abbey', jetty: 'the lake', cairn: 'the top of the pass', mill: 'a windmill', lighthouse: 'a lighthouse', ring: 'a fairy ring' };
        return `On to ${names[next.place] || 'the next bend'}`;
    }

    // ---- The world, a square at a time ----------------------------------------------------------
    clearSquares() {
        for (const sq of [...this.near.values(), ...this.far.values(), ...this.retired]) this.renderer.release(sq);
        this.near.clear();
        this.far.clear();
        this.actors.clear();
        this.queue.length = this.retired.length = 0;
        this.pending = this.flatItems = this.building = null;
        this.active = { near: [], far: [], hole: null, key: '' };
    }
    // Decide which squares are wanted about the traveller, build what is
    // missing (all of it now, or a few milliseconds' worth a frame), and
    // switch to the new set only once it is whole, so nothing is seen half-made.
    stream(now = false) {
        if (this.flat) return;
        const L = WayLogic, me = L.standing(this.journey, this.world), C = L.CHUNK;
        const cx = Math.floor(me.x / C), cz = Math.floor(me.z / C), fx = Math.floor(me.x / WAY_FAR), fz = Math.floor(me.z / WAY_FAR), key = `${cx},${cz},${this.nearR},${this.farR},${this.density},${this.detail}`;
        if (key !== this.active.key && key !== this.pending?.key) {
            const near = [], far = [];
            for (let j = -this.nearR; j <= this.nearR; j++) for (let i = -this.nearR; i <= this.nearR; i++) near.push([cx + i, cz + j]);
            for (let j = -this.farR; j <= this.farR; j++) for (let i = -this.farR; i <= this.farR; i++) far.push([fx + i, fz + j]);
            this.pending = { key, near, far, hole: [(cx - this.nearR) * C, (cz - this.nearR) * C, (cx + this.nearR + 1) * C, (cz + this.nearR + 1) * C] };
            // A square built for another tier's density is built again; the old one is drawn until the new set is whole.
            // The squares the traveller is in and next to are built fine; one already finer than asked is left alone.
            const fine = k => Math.max(Math.abs(k[0] - cx), Math.abs(k[1] - cz)) <= 1 ? this.detail : 0, stale = k => { const sq = this.near.get(k.join()); return !sq || sq.density !== this.density || sq.detail < fine(k); };
            this.queue = [...near.filter(stale).map(k => [k, false, fine(k)]), ...far.filter(k => this.far.get(k.join())?.density !== this.density).map(k => [k, true, 0])];
            // Nearest first.
            const away = ([k, isFar]) => Math.hypot((k[0] + 0.5) * (isFar ? WAY_FAR : C) - me.x, (k[1] + 0.5) * (isFar ? WAY_FAR : C) - me.z);
            this.queue.sort((a, b) => away(a) - away(b));
        }
        const started = performance.now();
        // A square is built a few things at a time, so even a city's never holds a frame up.
        while ((this.building || this.queue.length) && (now || performance.now() - started < 3)) {
            if (!this.building) { const [k, isFar, fine] = this.queue.shift(); this.building = { k, isFar, steps: isFar ? WayModels.squareSteps(this.world, k[0], k[1], WAY_FAR, 16, true, this.density) : WayModels.squareSteps(this.world, k[0], k[1], C, this.density < 0.5 ? 16 : 32, false, this.density, fine) }; }      // Low's ground is 4 m to a cell
            const step = this.building.steps.next();
            if (!step.done) continue;
            const { k, isFar } = this.building, sq = step.value;
            this.building = null;
            this.renderer.upload(sq);
            sq.ground = sq.props = sq.water = null;
            const map = isFar ? this.far : this.near, old = map.get(k.join());
            if (old) this.retired.push(old);
            map.set(k.join(), sq);
        }
        if (this.pending && !this.queue.length && !this.building) {
            const p = this.pending, keepNear = new Set(p.near.map(k => k.join())), keepFar = new Set(p.far.map(k => k.join()));
            for (const [map, keep] of [[this.near, keepNear], [this.far, keepFar]]) for (const [k, sq] of map) if (!keep.has(k)) { this.renderer.release(sq); map.delete(k); }
            for (const sq of this.retired) this.renderer.release(sq);
            this.retired.length = 0;
            this.active = { near: [...this.near.values()], far: [...this.far.values()], hole: p.hole, key: p.key };
            this.pending = null;
            this.cast();
        }
    }

    // ---- Who lives here ---------------------------------------------------------------------------
    // Everyone the near squares call for, kept if they were already about.
    cast() {
        const L = WayLogic, seen = new Set(), night = this.light ? this.light.lit : 0, wet = this.weather.wet;
        for (const sq of this.active.near) {
            sq.spawns.forEach((s, index) => {
                const id = `${sq.cx},${sq.cz},${index}`;
                seen.add(id);
                if (this.actors.has(id)) return;
                const made = [], v = s.v ?? L.hash(sq.cx * 31 + index, sq.cz, 5), r = k => WayModels.rnd(v + 0.01, k);
                const life = this.config.life, herds = WAY_WILD[this.config.wildlife] ?? 1;
                if (s.k === 'folk') {
                    // Fewer about after dark and in the rain; the guards stay.
                    if (s.role !== 'guard' && (r(1) > life * (0.25 + 0.75 * this.density) || (night > 0.6 && r(2) < 0.6) || (wet > 0.3 && r(3) < 0.6))) { this.actors.set(id, made); return; }
                    const look = WayActors.townsfolk(v, s.role), heading = this.world.heading(s.z);
                    made.push({ kind: 'folk', role: s.role, look, x: s.x, z: s.z, z0: s.z, d: s.d, yaw: s.faceTo !== undefined ? heading + s.faceTo : s.yaw, range: s.range || 0, dir: r(4) < 0.5 ? -1 : 1, stride: r(5), v, wave: 0 });
                    if (s.role === 'chat') made.push({ kind: 'folk', role: 'chat', look: WayActors.townsfolk(r(6), 'chat'), x: s.x + Math.sin(s.yaw) * 1.1, z: s.z + Math.cos(s.yaw) * 1.1, yaw: s.yaw + Math.PI, v: r(6), stride: 0, wave: 0 });
                } else if (s.kind === 'sails' || s.kind === 'beam') made.push({ kind: s.kind, x: s.at[0], y: s.at[1], z: s.at[2], yaw: s.yaw || 0 });
                else if (s.kind === 'boat') made.push({ kind: 'boat', x: s.x, y: s.y, z: s.z, yaw: v * 6, v, sail: s.sail });
                else if (s.kind === 'camp') { if (L.camp(this.world, s.slot)?.tended) made.push({ kind: 'camp', x: s.x, y: s.y, z: s.z, yaw: s.yaw, d: s.d, v, look: WayActors.townsfolk(v, 'sit') }); }
                else if (s.kind === 'child') for (let i = 0; i < s.n * Math.min(1, life); i++) made.push({ kind: 'folk', role: 'child', look: WayActors.townsfolk(r(10 + i), 'child'), x: s.x, z: s.z, x0: s.x, z0: s.z, yaw: 0, stride: i / 3, v: r(10 + i), turn: i / s.n * 6.28, wave: 0 });
                else {
                    // The herds, flocks and strays: as many as the wildlife setting says, and none at 'none'.
                    const n = herds ? Math.min(s.kind === 'mouse' || s.kind === 'rat' ? 4 : Infinity, Math.max(1, Math.round((s.n || 1) * (0.4 + 0.6 * this.density) * herds))) : 0;          // (no more than four mice to a stretch of wall)
                    made.herd = true;
                    for (let i = 0; i < n; i++) {
                        // (Mice keep to the foot of the wall, strung along it; sparrows are a tight little flock.)
                        const along = s.kind === 'mouse' || s.kind === 'rat', a = along ? this.world.heading(s.z) : r(20 + i) * 6.28, d = along ? (i - (n - 1) / 2) * 1.3 + (r(30 + i) - 0.5) * 1.1 : i ? (s.kind === 'sparrow' ? 0.3 + 1.2 * r(30 + i) : 1.5 + 4 * r(30 + i)) : 0;
                        made.push({ kind: s.kind, x: s.x + Math.sin(a) * d, z: s.z + Math.cos(a) * d, x0: s.x, z0: s.z, y: s.y, yaw: r(40 + i) * 6.28, v: r(50 + i), gait: r(60 + i), moving: 0, graze: 1, timer: 2 + 9 * r(70 + i), state: 'idle', fold: 1, alt: 0, perch: s.perch || 0, dir: r(80 + i) < 0.5 ? -1 : 1 });
                    }
                }
                this.actors.set(id, made);
            });
        }
        for (const id of this.actors.keys()) if (!seen.has(id)) this.actors.delete(id);
    }

    // The wild ones (WayLogic.wildlife): whoever is at home along the road about the traveller, out to where nothing
    // is drawn. They are the world's (a stretch has the same animals whenever it is asked); the setting says how many
    // of them are let out, so turning it changes who is about and nothing else.
    castWild() {
        const L = WayLogic, c = this.config, me = this.standing, cz = Math.floor(me.z / L.CHUNK), key = `${cz},${c.wildlife},${this.density}`;
        if (this.wildWorld !== this.world) { this.wild.clear(); this.wildWorld = this.world; this.wildAt = null; }
        if (key === this.wildAt) return;
        if (this.wildAt && !this.wildAt.endsWith(`,${c.wildlife},${this.density}`)) this.wild.clear();
        this.wildAt = key;
        const share = (L.WILD_LEVELS[c.wildlife] ?? L.WILD_LEVELS.some) * (0.55 + 0.45 * this.density), keep = new Set();
        for (let dz = -3; dz <= 3; dz++) {
            const k = cz + dz;
            keep.add(k);
            if (!this.wild.has(k)) this.wild.set(k, share ? this.world.wildlife(cz + dz).filter(g => g.roll < share).map(g => L.wildStart(g, this.world, this.density)) : []);
        }
        for (const k of this.wild.keys()) if (!keep.has(k)) this.wild.delete(k);
        this.wildParties = [...this.wild.values()].flat();
    }
    stepWild(dt, me) {
        this.castWild();
        const ctx = { t: this.seconds, night: this.light.night, me, random: Math.random, party: null };
        for (const party of this.wildParties) {
            if (Math.abs(party[0].g.x - me.x) + Math.abs(party[0].g.z - me.z) > 260) continue;
            ctx.party = party;
            for (const a of party) WayLogic.wildStep(a, dt, this.world, ctx);
        }
    }

    // ---- A frame ---------------------------------------------------------------------------------
    frame(now) {
        if (!this.isRunning) return;
        const gap = now - (this.lastTime || now), dtMs = Math.min(Math.max(gap, 0), 100);
        this.lastTime = now;
        this.watchGpu(gap);
        this.update(dtMs);
        this.stream();
        this.draw();
        this.animationId = requestAnimationFrame(t => this.frame(t));
    }

    // Late frames for a few seconds: give something up. A long calm spell: try taking it back, once.
    watchGpu(gap) {
        const gpu = this.gpu;
        if (this.flat || this.host.params.thumb || gap <= 0) return;
        gap = Math.min(gap, 3000);
        const due = 1000 / (this.host.quality.fps || 60);
        gpu.pace += (gap - gpu.pace) * 0.2;
        if (gpu.pace > Math.max(due * 1.7, 45)) {
            gpu.calm = 0;
            gpu.late += gap;
            if (gpu.late > 2500 && gpu.step < WAY_GPU.length - 1) this.gpuStep(1);
        } else {
            gpu.late = 0;
            gpu.calm += gap;
            if (gpu.calm > 90000 && gpu.step > 0 && !gpu.gaveUp) { gpu.gaveUp = true; this.gpuStep(-1); }
        }
    }
    gpuStep(by) {
        const gpu = this.gpu;
        gpu.step += by;
        gpu.late = gpu.calm = gpu.pace = 0;
        this.host.storage.set('gpu', gpu.step);
        this.applyQuality();
        this.resize();
    }

    update(dtMs) {
        const L = WayLogic, dt = dtMs / 1000, c = this.config, w = this.world, j = this.journey;
        this.seconds += dt;
        this.frameDt = dt;
        // The hour.
        if (c.time === 'cycle') this.day = (this.day + dt / (c.dayMinutes * 60)) % 1;
        else if (c.time === 'clock') { const d = this.host.now(); this.day = (d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600) / 24; }
        else { const gap = ((WAY_TIMES[c.time] - this.day + 1.5) % 1) - 0.5; this.day = (this.day + gap * (1 - Math.exp(-dt / 1.2)) + 1) % 1; }
        L.weatherStep(this.weather, dt, c.weather, Math.random, c.rainOften);
        const sky = this.sky = L.bodies(this.day), overcast = L.smooth(0.55, 1, this.weather.cloud);
        const light = this.light = L.light(sky.sunEl, overcast);

        L.journeyStep(j, dt, w, { pace: c.pace, night: light.night, camps: c.campfire, rests: c.rests, keep: this.keepRight || 0 });
        const me = this.standing = L.standing(j, w);
        this.cold = w.cold(j.z);

        // The wind, and what it carries.
        const gust = 1.2 + 2.2 * this.weather.wet + 0.6 * Math.sin(this.seconds / 7.1), bearing = 2.2 + 0.4 * Math.sin(this.seconds / 31);
        this.wind = [Math.sin(bearing) * gust, 0, Math.cos(bearing) * gust];
        this.cloudDrift[0] += dt * 0.0034;
        this.cloudDrift[1] += dt * 0.0015;

        // The camera: cuts in the cinematic view, and a hand on the view when dragged.
        this.cut += dt;
        this.shot.t += dt;
        if (c.camera === 'drift' && this.shot.t > L.SHOTS[this.shot.index % L.SHOTS.length].secs) {
            this.shot = { index: this.shot.index + 1, t: 0, z0: j.z, span: L.WALK * c.pace * L.SHOTS[(this.shot.index + 1) % L.SHOTS.length].secs };
            this.cut = 0;
            this.snap = true;
        }
        const g = this.glance;
        g.idle += dt;
        if (!g.held && g.idle > 4) { const k = 1 - Math.exp(-dt / 1.1); g.yaw -= g.yaw * k; g.pitch -= g.pitch * k; }
        this.pan += (this.panTarget - this.pan) * (1 - Math.exp(-dt / 0.35));
        const still = this.host.reducedMotion, cam = this.cam, orbiting = this.orbiting();
        if (this.orbitDirty && !this.orbit.held && this.orbit.idle > 0.6) this.saveOrbit();
        // Orbit: Android's pages turn it about the traveller, who stays in the middle.
        const want = orbiting ? { ...L.orbitStep(this.orbit, dt, j, w, { turning: c.orbitMode === 'turning', still, pan: -this.pan }) } : L.camera(c.camera === 'orbit' ? 'follow' : c.camera, j, w, this.seconds, this.shot);
        if (c.camera === 'first' && still) want.y = me.y + 1.66 * (1 - 0.42 * j.sit);
        if (c.camera === 'first' && this.look().shifts && this.shift.form !== 'self') want.y -= { bear: 0.4, panther: 0.75, owlbeast: -0.05 }[this.shift.form] * (1 - j.sit);
        // Never under the ground or the water, whatever the shot asked for.
        want.y = Math.max(want.y, w.surface(want.x, want.z) + 0.45, w.water(want.x, want.z) + 0.5);
        if (this.snap || this.cam.x === 0 || orbiting) Object.assign(cam, want);
        else {
            const k = 1 - Math.exp(-dt * (c.camera === 'drift' ? 30 : 5)), kh = 1 - Math.exp(-dt * (c.camera === 'drift' ? 30 : 3.2));
            cam.x += (want.x - cam.x) * k; cam.y += (want.y - cam.y) * k; cam.z += (want.z - cam.z) * k;
            let turn = (want.heading - cam.heading) % (2 * Math.PI);
            if (turn > Math.PI) turn -= 2 * Math.PI;
            if (turn < -Math.PI) turn += 2 * Math.PI;
            cam.heading += turn * kh;
            cam.pitch += (want.pitch - cam.pitch) * kh;
        }
        this.justCut = this.snap;
        this.snap = false;

        const fade = dt / 1.5;
        if (this.shadowFade !== this.shadowTarget) {
            this.shadowFade = L.clamp(this.shadowFade + Math.sign(this.shadowTarget - this.shadowFade) * fade, 0, 1);
            if (this.shadowFade === 0) this.applyQuality();
        }
        this.stepActors(dt, me);
        this.stepWild(dt, me);
        this.stepRoad(dt, me);
        this.stepSky(dt, me);
    }
    snapCamera() { this.snap = true; this.update(0); }

    // Everyone's own small life.
    stepActors(dt, me) {
        const L = WayLogic, w = this.world, t = this.seconds, cam = this.cam;
        const ease = (v, to) => (v || 0) + (to - (v || 0)) * (dt > 1e-4 ? 1 - Math.exp(-dt / 0.25) : 0);          // (an animal's speed, for its gait: a quarter of a second behind)
        // A sidestep: whoever is on foot gives way to the camera, the traveller and each other, and comes back after,
        // walked out to the side of the road (WayLogic.giveWay).
        const folk = [];
        for (const group of this.actors.values()) for (const a of group) if (a.kind === 'folk' && Math.abs(a.x - me.x) + Math.abs(a.z - me.z) < 90) folk.push(a);
        const pushers = [];
        for (const a of folk) {
            pushers.length = 0;
            const ax = a.x + (a.ox || 0), az = a.z + (a.oz || 0);
            // Further from the lens in front of it than behind: nobody's head fills a corner of the picture.
            if (cam.y - me.y < 4.5) pushers.push([cam.x, cam.z, (ax - cam.x) * Math.sin(cam.heading) + (az - cam.z) * Math.cos(cam.heading) > 0 ? 6.2 : 3]);
            if (a.role === 'stroll' || a.role === 'child') { pushers.push([me.x, me.z, 1.3]); for (const b of folk) if (b !== a) pushers.push([b.x + (b.ox || 0), b.z + (b.oz || 0), 0.95]); }
            L.giveWay(a, dt, w.heading(a.z), pushers, this.justCut);          // (at a cut they are already out of the way)
        }
        for (const group of this.actors.values()) {
            for (const a of group) {
                const dx = me.x - a.x, dz = me.z - a.z, near = Math.hypot(dx, dz);
                if (a.kind === 'folk') {
                    a.wave = near < 7 && a.role !== 'guard' && a.role !== 'child' && a.v < 0.6 ? Math.min(1, a.wave + dt * 3) : Math.max(0, a.wave - dt * 2);
                    if (a.role === 'stroll') {
                        // Up and down the street, turning at the ends of a beat.
                        a.z += a.dir * 0.95 * dt * w.at(a.z).cos;
                        if (Math.abs(a.z - a.z0) > a.range) a.dir = a.z > a.z0 ? -1 : 1;
                        a.x = w.place(a.z, a.d)[0];
                        const to = w.heading(a.z) + (a.dir < 0 ? Math.PI : 0);
                        let turn = (to - a.yaw) % (2 * Math.PI);
                        if (turn > Math.PI) turn -= 2 * Math.PI;
                        if (turn < -Math.PI) turn += 2 * Math.PI;
                        a.yaw += turn * Math.min(1, dt * 4);
                        a.stride += 0.95 * dt / 1.4;
                    } else if (a.role === 'child') {
                        a.turn += dt * 1.25;
                        a.x = a.x0 + Math.sin(a.turn) * 2.1; a.z = a.z0 + Math.cos(a.turn) * 1.8;
                        a.yaw = a.turn + Math.PI / 2;
                        a.stride += dt * 2.6;
                    } else if (a.role === 'guard' || a.role === 'stand') a.head = L.clamp(Math.atan2(dx, dz) - a.yaw, -1, 1) * (near < 20 ? 1 : 0);
                    continue;
                }
                if (a.kind === 'sails') { a.turn = (a.turn || 0) + dt * (0.5 + 0.25 * this.weather.wet); continue; }
                if (a.kind === 'boat' || a.kind === 'beam' || a.kind === 'camp') continue;
                // Animals.
                if (a.perch) { a.head = near < 25 ? L.clamp(Math.atan2(dx, dz) - a.yaw, -1.3, 1.3) : 0; continue; }       // the cat on the wall only watches
                a.timer -= dt;
                const shy = a.kind === 'deer' || a.kind === 'rabbit' || a.kind === 'crow' || a.kind === 'pigeon' || a.kind === 'hen';
                if (a.kind === 'wisp' || a.kind === 'gull') continue;
                if (a.kind === 'duck') { a.turn = (a.turn || a.v * 6) + dt * 0.25; a.x = a.x0 + Math.sin(a.turn + a.v * 9) * 3 * (0.5 + a.v); a.z = a.z0 + Math.cos(a.turn + a.v * 9) * 3 * (0.5 + a.v); a.yaw = a.turn + a.v * 9 + Math.PI / 2; continue; }
                if (a.kind === 'mouse' || a.kind === 'rat') {
                    // Along the foot of the wall in dashes: a stop, a nibble, up on its haunches for a look; and when
                    // somebody comes close, a scurry away along the wall and into a crack until they have gone by.
                    const hd = w.heading(a.z0), fx = Math.sin(hd), fz = Math.cos(hd);
                    a.s ??= (a.x - a.x0) * fx + (a.z - a.z0) * fz;
                    if (a.state === 'hid') { if (a.timer < 0 && near > 8) { a.state = 'idle'; a.timer = 1 + 2 * Math.random(); } continue; }
                    if (a.state !== 'flee' && near < (a.kind === 'rat' ? 3.5 : 4.5)) { a.state = 'flee'; a.timer = 0.7 + 0.6 * a.v; a.dir = (-dx * fx - dz * fz) < 0 ? -1 : 1; }
                    let speed = 0;
                    if (a.state === 'flee') { speed = 2.6; if (a.timer < 0) { a.state = 'hid'; a.timer = 4 + 6 * Math.random(); } }
                    else if (a.state === 'walk') { speed = a.kind === 'rat' ? 1.1 : 1.5; if (a.timer < 0 || Math.abs(a.s - a.goal) < 0.05) { a.state = 'idle'; a.timer = 0.4 + 2 * Math.random(); } }
                    else if (a.timer < 0) { a.goal = L.clamp(a.s + (Math.random() < 0.5 ? -1 : 1) * (0.4 + 1.6 * Math.random()), -4, 4); a.dir = a.goal > a.s ? 1 : -1; a.state = 'walk'; a.timer = 3; }
                    if (speed) { const step = speed * dt; a.s = L.clamp(a.s + a.dir * (a.state === 'walk' ? Math.min(step, Math.abs(a.goal - a.s)) : step), -4.5, 4.5); a.gait += step; }
                    a.x = a.x0 + fx * a.s; a.z = a.z0 + fz * a.s; a.yaw = hd + (a.dir < 0 ? Math.PI : 0);
                    a.vel = ease(a.vel, speed); a.moving += ((speed ? 1 : 0) - a.moving) * Math.min(1, dt * 10);
                    const upright = !speed && Math.sin(t * 0.9 + a.v * 20) > 0.3;
                    a.rest = L.clamp((a.rest || 0) + (upright ? 1 : -1) * dt * 5, 0, 1); a.graze = L.clamp((a.graze || 0) + (!speed && !upright ? 1 : -1) * dt * 5, 0, 1);
                    continue;
                }
                if (a.kind === 'crow' || a.kind === 'pigeon' || a.kind === 'sparrow') {
                    // On the ground until the traveller comes close; then up, round, and down again further off.
                    const sparrow = a.kind === 'sparrow';
                    if (a.state === 'idle' && near < (sparrow ? 5 : 9)) { a.state = 'fly'; a.timer = (sparrow ? 5 : 9) + 6 * a.v; a.turn = Math.atan2(-dx, -dz); a.hop = 0; }
                    if (a.state === 'fly') {
                        a.turn += dt * (sparrow ? 1.1 : 0.5) * (a.v < 0.5 ? 1 : -1);
                        a.alt = Math.min(a.alt + dt * 3.2, (sparrow ? 2.5 + 3 * a.v : 7 + 6 * a.v)) * (a.timer < 2.5 ? Math.max(0, a.timer / 2.5) : 1);
                        a.x += Math.sin(a.turn) * 6 * dt; a.z += Math.cos(a.turn) * 6 * dt; a.yaw = a.turn;
                        if (a.timer < 0) { a.state = 'idle'; a.alt = 0; a.x0 = a.x; a.z0 = a.z; }
                    } else if (sparrow) {
                        // A sparrow hops: a little jump this way or that, a peck, another.
                        if (a.hop > 0) { a.hop -= dt; const step = Math.min(dt, a.hop + dt) * 1.6; a.x += Math.sin(a.yaw) * step; a.z += Math.cos(a.yaw) * step; a.alt = 0.06 * Math.sin(Math.PI * Math.max(0, a.hop) / 0.16); }
                        else { a.alt = 0; if (a.timer < 0) { a.hop = 0.16; a.timer = 0.3 + 1.4 * Math.random(); a.yaw = Math.hypot(a.x - a.x0, a.z - a.z0) > 2 ? Math.atan2(a.x0 - a.x, a.z0 - a.z) : Math.random() * 6.28; } }
                    }
                    a.fold = a.state === 'fly' ? 0 : 1;
                    continue;
                }
                if (shy && a.state !== 'flee' && near < (a.kind === 'hen' ? 3 : 14)) { a.state = 'flee'; a.timer = a.kind === 'hen' ? 1.2 : 4.5; a.turn = Math.atan2(-dx, -dz) + (a.v - 0.5); }
                if (a.state === 'flee') {
                    const speed = a.kind === 'deer' ? 7 : a.kind === 'hen' ? 2 : 4;
                    a.x += Math.sin(a.turn) * speed * dt; a.z += Math.cos(a.turn) * speed * dt; a.yaw = a.turn; a.gait += speed * dt / this.farGait(a.kind, 0).stride; a.vel = ease(a.vel, speed); a.moving = 1; a.graze = 0;
                    if (a.timer < 0) { a.state = 'idle'; a.timer = 6; a.x0 = a.x; a.z0 = a.z; }
                    continue;
                }
                if (a.timer < 0) {
                    // Graze a while, then amble a few steps to fresh grass.
                    if (a.state === 'idle') { a.state = 'walk'; a.timer = 2 + 3 * Math.random(); const back = Math.hypot(a.x - a.x0, a.z - a.z0) > 7; a.turn = back ? Math.atan2(a.x0 - a.x, a.z0 - a.z) : Math.random() * 6.28; }
                    else { a.state = 'idle'; a.timer = 5 + 12 * Math.random(); }
                }
                const walking = a.state === 'walk' ? 1 : 0, alert = near < 22 && (a.kind === 'deer' || a.kind === 'rabbit' || a.kind === 'cat');
                a.moving += (walking - a.moving) * Math.min(1, dt * 3);
                a.graze += ((walking || alert || a.kind === 'cat' ? 0 : 1) - a.graze) * Math.min(1, dt * 2);
                if (walking) {
                    let turn = (a.turn - a.yaw) % (2 * Math.PI);
                    if (turn > Math.PI) turn -= 2 * Math.PI;
                    if (turn < -Math.PI) turn += 2 * Math.PI;
                    a.yaw += turn * Math.min(1, dt * 2);
                    const speed = a.kind === 'rabbit' ? 1.6 : 0.55;
                    a.x += Math.sin(a.yaw) * speed * dt; a.z += Math.cos(a.yaw) * speed * dt; a.gait += speed * dt / this.farGait(a.kind, 0).stride; a.vel = ease(a.vel, speed);
                } else {
                    a.vel = ease(a.vel, 0);
                }
                if (alert) a.head = L.clamp(Math.atan2(dx, dz) - a.yaw, -1.2, 1.2); else a.head = 0;
            }
        }
    }

    // Who else is on the road: carts and walkers coming the other way, and the traveller's own companion.
    stepRoad(dt, me) {
        const L = WayLogic, w = this.world, j = this.journey, c = this.config;
        if (j.distance > this.nextTraffic && c.life > 0 && j.mode === 'walk') {
            // The road is busy near a grand city's gates.
            const r = w.at(j.z), busy = [r.a, r.b].some(l => l.grand && Math.abs(j.z - l.zc) < 520) ? 3 : 1;
            this.nextTraffic = j.distance + (130 + 200 * Math.random()) / Math.max(0.3, c.life) / busy;
            const roll = Math.random(), kind = roll < 0.4 ? 'wagon' : roll < 0.75 ? 'walker' : 'rider';
            this.traffic.push({ kind, z: j.z + 150, d: -1.25, v: Math.random(), speed: kind === 'walker' ? 1.3 : kind === 'wagon' ? 1.9 : 2.6, gait: 0, look: WayActors.townsfolk(Math.random(), 'stroll'), mate: Math.random() < 0.4 ? WayActors.townsfolk(Math.random(), 'stroll') : null });
        }
        for (const t of this.traffic) {
            t.z -= t.speed * dt * w.at(t.z).cos;
            t.gait += t.speed * dt / (t.kind === 'walker' ? 1.5 : 1.9);
        }
        this.traffic = this.traffic.filter(t => t.z > j.z - 90);
        // Keep to the right while somebody passes: the journey turns them that way and they walk it (it used to be set
        // straight, a slide across the road).
        this.keepRight = this.traffic.some(t => Math.abs(t.z - j.z) < 16) ? 0.9 : 0;

        // The traveller's own craft: the druid's shapes, the rogue's shadows.
        const look = this.look();
        if (look.shifts) {
            const was = this.shift.form;
            L.shiftStep(this.shift, dt, j, { often: c.craft, night: this.light.night, biome: w.biome(j.z).near.biome });
            if (this.shift.form !== was && this.shift.form === 'bear') L.spook(this.party);
        }
        if (look.stealth) L.stealthStep(this.stealth, dt, j, w, { often: c.craft, night: this.light.night, traffic: this.traffic.reduce((near, t) => t.z > j.z ? Math.min(near, t.z - j.z) : near, Infinity) });
        // The company: each with its own place and its own small business (WayLogic.companionStep). A deer or a
        // rabbit near the road is something for them to notice.
        let scare = null, nearest = 18;
        for (const group of this.actors.values()) for (const a of group) if (a.kind === 'deer' || a.kind === 'rabbit') { const away = Math.hypot(a.x - me.x, a.z - me.z); if (away < nearest) { nearest = away; scare = a; } }
        // A low camera wants the ground before it kept clear; and the rogue has a hand for the first cat when she stops.
        const cam = this.cam, low = cam.y - me.y < 3.2 && c.camera !== 'first';
        const ctx = { t: this.seconds, night: this.light.night, passing: this.keepRight > 0, others: this.party, scare, random: Math.random,
            avoid: low ? { x: cam.x + Math.sin(cam.heading) * 1.1, z: cam.z + Math.cos(cam.heading) * 1.1, room: 1.4 } : null,
            pet: look.stealth && (j.mode === 'gaze' || j.mode === 'camp') ? this.party.find(p => p.kind.group === 'cats' && p.role !== 'ride') || null : null };
        for (const p of this.party) L.companionStep(p, dt, w, j, ctx);
        // Those sent home walk back down the road until they are well behind.
        for (const p of this.leavers) { L.companionStep(p, dt, w, j, ctx); p.gone = (p.gone || 0) + dt; }
        if (this.leavers.length) this.leavers = this.leavers.filter(p => p.gone < 25 && Math.hypot(p.x - me.x, p.z - me.z) < 20);
    }

    // What crosses the sky, never close: geese, a dragon over the hills, an airship, a balloon.
    stepSky(dt, me) {
        const c = this.config;
        if ((this.nextWonder -= dt) < 0) {
            this.nextWonder = (50 + 90 * Math.random()) / Math.max(0.3, c.life);
            const roll = Math.random(), night = this.light.night > 0.5;
            const kind = !c.wonders || roll < 0.45 ? 'geese' : roll < 0.62 ? 'dragon' : roll < 0.82 ? (night ? 'geese' : 'balloon') : 'airship';
            const bearing = (Math.random() - 0.5) * 1.6 + this.world.heading(me.z), far = kind === 'geese' ? 150 + 100 * Math.random() : 420 + 240 * Math.random(), cross = Math.random() < 0.5 ? -1 : 1;
            const high = kind === 'geese' ? 40 + 30 * Math.random() : kind === 'balloon' ? 70 + 40 * Math.random() : 120 + 80 * Math.random();
            // It starts off to one side, ahead, and crosses.
            this.wonders.push({ kind, x: me.x + Math.sin(bearing) * far - cross * Math.cos(bearing) * 420, z: me.z + Math.cos(bearing) * far + cross * Math.sin(bearing) * 420, y: me.y + high, yaw: bearing + cross * Math.PI / 2 + (Math.random() - 0.5) * 0.4, speed: kind === 'geese' ? 13 : kind === 'dragon' ? 20 : kind === 'airship' ? 7 : 3, age: 0, v: Math.random() });
        }
        for (const s of this.wonders) {
            s.age += dt;
            if (s.kind === 'dragon') s.yaw += dt * 0.05 * (s.v < 0.5 ? 1 : -1);
            s.x += Math.sin(s.yaw) * s.speed * dt; s.z += Math.cos(s.yaw) * s.speed * dt;
        }
        this.wonders = this.wonders.filter(s => s.age < (s.kind === 'balloon' ? 260 : 130) && Math.hypot(s.x - me.x, s.z - me.z) < 1200);
    }

    // ---- Drawing ------------------------------------------------------------------------------------
    draw() {
        const L = WayLogic, c = this.config, cam = this.cam, light = this.light, sky = this.sky, scene = this.scene, w = this.world, j = this.journey, me = this.standing;
        const wet = this.weather.wet, overcast = L.smooth(0.55, 1, this.weather.cloud), still = this.host.reducedMotion;
        // The view: the camera's own, turned by a drag and by Android's pages.
        const orbiting = this.orbiting();
        const view = this.view = orbiting ? { x: cam.x, y: cam.y, z: cam.z, heading: cam.heading, pitch: L.clamp(cam.pitch, -Math.PI / 2, 1.3) }
            : { x: cam.x, y: cam.y, z: cam.z, heading: cam.heading + this.glance.yaw + this.pan, pitch: L.clamp(cam.pitch + this.glance.pitch, -1.3, 1.3) };
        scene.cam = view;
        const aspect = this.width / this.height;
        let tanY = Math.tan(c.fov / 2 * L.RAD);
        if (aspect < 1) {
            // A phone held upright still sees 48° across; and looks up a little, for more sky and less road.
            tanY = Math.min(1.1, Math.max(tanY, Math.tan(24 * L.RAD) / aspect));
            if (c.camera !== 'drift' && !orbiting) view.pitch += 0.17 * (1 - aspect);
        }
        scene.tanY = tanY;
        scene.lift = (this.host.insets.bottom || 0) / this.height;

        // The lamp of the hour: the sun, then the big moon.
        const useSun = sky.sunEl > -4, moon = sky.moons[0], moonUp = L.smooth(0.0, 0.25, moon[1]) * L.smooth(-4, -9, sky.sunEl) * (1 - 0.7 * overcast);
        const sunFade = L.smooth(-4, -1.5, sky.sunEl);
        scene.light = light;
        scene.sunDir = sky.sun;
        scene.lightDir = useSun ? sky.sun : moon[1] > 0.05 ? moon : [0.3, 0.9, 0.3];
        scene.lightCol = useSun ? light.sun.map(v => v * sunFade) : [0.075 * moonUp, 0.115 * moonUp, 0.24 * moonUp];
        scene.sunCol = light.sun.map(v => v * sunFade);
        scene.glow = light.sun.map(v => v * (0.2 + 0.5 * light.golden) * sunFade);
        scene.moons = sky.moons;
        const n = light.night;
        scene.moonCol = [0.5 + 1.3 * n, 0.52 + 1.3 * n, 0.58 + 1.4 * n, 0.7 + 1.0 * n, 0.5 + 0.6 * n, 0.3 + 0.3 * n].map(v => v * (1 - 0.85 * overcast));
        scene.stars = light.stars;
        scene.time = this.seconds;
        scene.lit = light.lit;
        scene.wet = wet * (1 - this.cold);
        // From the orbit, whatever leaves are between the eye and the traveller open about the line of sight.
        { const me = this.standing; scene.cut = [me.x - view.x, me.y + 1.2 - view.y, me.z - view.z, orbiting ? 5 : 0]; scene.cutY = me.y + 3.4; }
        // The air: clear by day, soft at dawn, close in the rain; mist lies in the low ground.
        // (The air turns slowly from one country's to the next: WayLogic's air, never the nearest leg's at a step.)
        const b = w.biome(j.z), air = this.air = w.air(j.z), misty = air.mist;
        scene.fog = [1 / (this.reach + 458) + 0.0003 * light.golden + 0.0035 * wet + 0.0003 * n, (0.001 + 0.003 * light.golden * (1 - light.day * 0.5) + 0.0016 * n) * misty, w.at(j.z).y + 3 - view.y, this.reach];
        scene.wind = [this.wind[0] * 0.16, this.wind[2] * 0.16, this.seconds, still ? 0.3 : 1];
        scene.cloud = [L.mix(0.66, 0.3, this.weather.cloud), 0.1, 0.96];
        // Clouds: white by day, lit from below and dark above at the ends of it.
        scene.cloudCol = [...light.sun.map((v, i) => v * sunFade * (0.75 + 0.6 * light.golden) + light.fill[i] * (1.25 - 0.6 * light.golden) + n * 0.1), L.mix(1.7, 0.8, Math.max(overcast, light.golden * 0.8))];
        scene.cloudOff = this.cloudDrift;
        const alpine = Math.max(b.a === 'pass' ? 1 - b.t : 0, b.b === 'pass' ? b.t : 0);
        scene.range = [0.1 + 0.1 * alpine, j.z / 60000, 0.085 + 0.02 * alpine - 0.04 * w.season(j.z).snow];
        scene.near = this.active.near;
        scene.far = this.active.far;
        scene.hole = this.active.hole;
        // Shadows: about the traveller, fading as the light gets low or dull.
        scene.focus = [me.x - view.x, me.y - view.y, me.z - view.z];
        scene.shadowReach = this.host.quality.tier === 'high' ? 110 : 50;
        scene.shadow = this.shadowFade * (1 - 0.85 * overcast) * L.smooth(0.03, 0.14, scene.lightDir[1]) * (useSun ? 0.9 : 0.6);

        this.lamps = [];
        if (!this.flat) {
            this.moving.clear();
            this.glows.clear();
            this.puffs.clear();
            this.drawLife(view, me);
            this.drawLights(view, me);
        }
        this.lamps.sort((p, q) => q[7] - p[7]);
        scene.lamps = this.lamps.slice(0, 4);
        scene.moving = this.moving;
        scene.glows = this.glows;
        scene.puffs = this.puffs;

        // What falls: rain, or snow where it is cold; else leaves, petals, or the grove's motes.
        const season = w.season(j.z), box = this.renderer.box;
        let vel = [this.wind[0], -9.5, this.wind[2]];
        if (wet > 0.02) {
            const snow = this.cold > 0.5;
            scene.fall = wet * (snow ? 0.8 : 1);
            vel = snow ? [this.wind[0], -1.3, this.wind[2]] : vel;
            scene.streak = snow ? 1 / 90 : 1 / 26;
            scene.dropSize = snow ? 0.05 : 0.02;
            scene.flutter = snow ? 0.4 : 0;
            scene.fallTint = snow ? [0.95, 0.96, 1, 0.9] : [0.78, 0.83, 0.94, 0.5];
        } else {
            const leaves = Math.max(season.index === 2 ? 1 - season.t : season.next === 2 ? season.t : 0, 0), petals = season.index === 0 ? 1 - season.t : season.next === 0 ? season.t : 0;
            const grove = air.grove > 0.5 ? 1 : 0;
            scene.fall = L.mix(Math.max(leaves, petals) * air.leafy * 0.045, 0.08, grove ? L.smooth(0.5, 1, air.grove) : 0) * (grove ? 1 : L.smooth(0.5, 0, air.grove));
            vel = grove ? [this.wind[0] * 0.1, 0.25, this.wind[2] * 0.1] : [this.wind[0] * 0.5, -0.8, this.wind[2] * 0.5];
            scene.streak = 1 / 200;
            scene.dropSize = grove ? 0.04 : 0.085;
            scene.flutter = 0.9;
            scene.fallTint = grove ? [0.5, 1, 0.9, 0.5 + 0.4 * n] : leaves > petals ? [0.86, 0.48, 0.16, 0.95] : [1, 0.78, 0.86, 0.95];
        }
        for (let i = 0; i < 3; i++) this.drift[i] = (this.drift[i] + vel[i] * (this.frameDt || 0)) % box[i];
        scene.fallVel = vel;
        scene.fallShift = [view.x, view.y, view.z].map((p, i) => (((p - this.drift[i]) % box[i]) + box[i]) % box[i]);

        if (this.flat) this.drawFlat(scene, view, me);
        else if (!this.renderer.lost) this.renderer.render(scene);
        // The cinematic cut: a breath of dark either side of it.
        const dip = c.camera === 'drift' ? Math.max(L.smooth(0.55, 0, this.cut), L.smooth(L.SHOTS[this.shot.index % L.SHOTS.length].secs - 0.5, L.SHOTS[this.shot.index % L.SHOTS.length].secs, this.shot.t)) : L.smooth(0.5, 0, this.cut);
        const shade = dip.toFixed(2);
        if (shade !== this.veilShade) { this.veilShade = shade; this.veil.style.opacity = shade; }
    }

    // Everything that moves, stamped from the camera into one soup; and their lights.
    drawLife(view, me) {
        const L = WayLogic, A = WayActors, c = this.config, w = this.world, j = this.journey, out = this.moving, st = this.stack, t = this.seconds, lit = this.light.lit;
        const rel = (x, y, z) => [x - view.x, y - view.y, z - view.z];
        const feet = (x, z) => w.surface(x, z);
        // Nobody is posed who is far off, or behind the eye (unless near enough to throw a shadow into the picture).
        const sh = Math.sin(view.heading), ch = Math.cos(view.heading);
        // (Looking steeply down, what is behind the eye on the map is under it in the picture.)
        const steep = view.pitch < -0.45, back = -4 - Math.max(0, view.y - me.y) * 0.7;
        const inView = (x, z, far = 150) => { const dx = x - view.x, dz = z - view.z, away = Math.hypot(dx, dz); return away < far && (away < 12 || steep || dx * sh + dz * ch > back); };

        // The traveller (not their own body from behind their own eyes), and the companion.
        const look = this.look(), shift = this.shift, hide = look.stealth ? this.stealth.hidden : 0, changed = !!look.shifts && shift.form !== 'self' && shift.change >= 1;
        const lantern = lit > 0.35 && !(look.torch && j.sit > 0.5) && hide < 0.5 && !changed;
        const fx = { glows: this.glows, puffs: this.puffs, lit }, ghosts = this.ghosts;
        for (const g of ghosts) { g.soup.clear(); g.alpha = g.shimmer = 0; }
        if (c.camera !== 'first') {
            const p = rel(me.x, me.y, me.z), calm = this.host.reducedMotion;
            // At a rest: hands to the fire; at a view the archer sights along an arrow, the rogue tosses a knife.
            const petting = this.party.some(k => k.petted && k.rest > 0.5 && Math.hypot(k.x - me.x, k.z - me.z) < 0.9);
            const act = petting ? 'stroke' : j.sit > 0.6 ? (look.daggers ? 'flip' : 'warm') : j.mode === 'gaze' && j.speed < 0.3 ? (look.hand === 'bow' ? 'aim' : look.daggers ? 'flip' : '') : '';
            // The bow comes up over a second and a half, and is down again before she walks on.
            const aimDt = Math.max(0, Math.min(0.1, t - (this.aimT ?? t)));
            this.aimT = t;
            this.aim = Math.max(0, Math.min(1, (this.aim || 0) + (act === 'aim' && j.timer > 1.6 ? aimDt / 1.7 : -aimDt / 1.2)));
            // (On Low the four travellers there always were keep their plainer figure; the newer ones have no other.)
            const draw = (soup, form) => form === 'self'
                ? ((this.detail === 0 || Math.hypot(p[0], p[2]) > (this.detail > 1 ? 45 : 22)) && !look.build ? A : WayPeople).person(soup, st, p[0], p[1], p[2], look, { yaw: me.heading, stride: j.stride, moving: j.moving, sit: j.sit, t, lantern, lit: true, act, head: j.look * 0.5, aim: this.aim, aimAt: j.look * 0.6, size: look.size, crouch: hide, vault: look.stealth ? L.vault(j, w) : 0 })
                : WayCompanions.pose(form, soup, st, p[0], p[1], p[2], { yaw: me.heading, gait: j.distance, speed: j.speed, moving: j.moving, rest: j.sit, t, head: j.look * 0.5 }, fx);
            if (look.shifts && shift.change < 1) {
                // Between two shapes: one fades as the other comes, in a swirl of leaves and green-gold motes (no swirl for those who asked for calm).
                const e = L.smooth(0, 1, shift.change), k = Math.sin(Math.PI * shift.change);
                draw(ghosts[0].soup, shift.from); draw(ghosts[1].soup, shift.to);
                ghosts[0].alpha = 1 - e; ghosts[1].alpha = e;
                for (let i = 0; i < 18; i++) {
                    const a = i * 2.4 + (calm ? 0 : t * 4.5), up = (i / 18 + (calm ? 0 : t * 0.55)) % 1, wide = (0.5 + 0.6 * up) * k;
                    this.glows.add(p[0] + Math.sin(a) * wide, p[1] + 0.15 + up * 2.0, p[2] + Math.cos(a) * wide, 0.06 + 0.04 * (i % 3), (i % 2 ? 0.5 : 0.95) * k, k, (i % 2 ? 0.45 : 0.22) * k, 1);
                    if (i % 2 === 0) { st.reset(p[0] + Math.sin(a + 1.2) * wide * 1.15, p[1] + 0.25 + ((up + 0.37) % 1) * 1.8, p[2] + Math.cos(a + 1.2) * wide * 1.15, a * 2, 1).rx(a * 1.3).rz(a); out.stamp(WayCompanions.leaf(), st.top, null, 0, 0, 1); }
                }
                this.glows.add(p[0], p[1] + 0.9, p[2], 2.4, 0.2 * k, 0.42 * k, 0.24 * k, 1);
                this.lamps.push([p[0], p[1] + 1, p[2], 0.6 * k, 1.3 * k, 0.8 * k, 14, 95]);
            } else if (hide > 0.02) { draw(ghosts[0].soup, 'self'); ghosts[0].alpha = 1; ghosts[0].shimmer = hide; }
            else draw(out, look.shifts ? shift.form : 'self');
            // After dark a few fireflies keep company with the druid's antlers.
            if (look.hat === 'antlers' && !changed && shift.change >= 1 && lit > 0.3) for (let i = 0; i < 4; i++) { const a = t * (0.5 + 0.13 * i) + i * 1.9, blink = Math.max(0, Math.sin(t * (1.1 + 0.3 * i) + i * 2)) ** 2 * lit; this.glows.add(p[0] + Math.sin(a) * (0.45 + 0.1 * i), p[1] + (2.25 + 0.25 * Math.sin(a * 1.7 + i) - 0.45 * j.sit) * (look.size || 1), p[2] + Math.cos(a) * (0.45 + 0.1 * i), 0.06, 0.8 * blink, blink, 0.3 * blink, 1); }
            // In another shape she carries no lantern: her marks give a little light of their own.
            if (changed && lit > 0.2) { this.glows.add(p[0], p[1] + 0.8, p[2], 1.6, 0.08 * lit, 0.26 * lit, 0.18 * lit, 1); this.lamps.push([p[0], p[1] + 1.1, p[2], 0.3 * lit, 0.9 * lit, 0.6 * lit, 11, 80]); }
        }
        if (lantern || look.hand === 'crystal') {
            // The light they carry: a glow at the staff's head (or the brand's), and a pool about their feet.
            const at = A.lightAt(look), hx = me.x + Math.cos(me.heading) * at[0] + Math.sin(me.heading) * at[1], hz = me.z - Math.sin(me.heading) * at[0] + Math.cos(me.heading) * at[1], p = rel(hx, me.y + at[2] - 0.5 * j.sit, hz), k = look.hand === 'crystal' ? [0.45, 0.85, 1.0] : [1.0, 0.62, 0.26], s = look.hand === 'crystal' ? 0.35 + 0.65 * lit : lit;
            if (c.camera !== 'first') this.glows.add(p[0], p[1], p[2], 1.1, k[0] * 0.5 * s, k[1] * 0.5 * s, k[2] * 0.5 * s, 1);
            this.lamps.push([p[0], p[1], p[2], k[0] * 1.5 * s, k[1] * 1.5 * s, k[2] * 1.5 * s, 16, 100]);
        }
        // The company. Whoever rides is on the pack (the owl, by day, on a shoulder) until the fire is lit.
        const sinH = Math.sin(me.heading), cosH = Math.cos(me.heading), tall = look.size || 1, mount = changed || (look.shifts && shift.change < 1) ? { bear: [0, -0.3, 1.38], panther: [0, -0.25, 0.98], owlbeast: [0, -0.1, 2.02] }[shift.form === 'self' ? shift.to : shift.form] : null;
        for (const k of this.leavers.length ? [...this.party, ...this.leavers] : this.party) {
            if (k.x === null) continue;
            let x = k.x, y = k.y, z = k.z, yaw = k.yaw, ride = 0, pitch = 0;
            if (k.riding > 0.02) {
                if (c.camera === 'first') continue;
                // A four-legged rider lies along the right shoulder, out past the hood, facing the way they walk, its fore
                // paws over the front and its hind end on the pack's strap if there is one (so a little nose-down); the
                // owl dozes on the left shoulder; a hen sits on the pack.
                const four = !!WayCompanions.KINDS[k.id] && !mount, pack = look.back === 'pack';
                const perch = mount || (k.kind.nocturnal ? [-0.3, 0.02, 1.5] : four ? (pack ? [0.29, 0, 1.47] : [0.28, 0, 1.45]) : pack ? [0, -0.27, 1.56] : [0.06, -0.24, 1.44]), up = (perch[2] - 0.44 * j.sit) * tall + 0.028 * Math.cos(j.stride * 12.566) * j.moving;
                const ax = me.x + cosH * perch[0] * tall + sinH * perch[1] * tall, az = me.z - sinH * perch[0] * tall + cosH * perch[1] * tall, r = L.smooth(0, 1, k.riding);
                x = L.mix(x, ax, r); z = L.mix(z, az, r); y = L.mix(y, me.y + up, r) + 0.35 * Math.sin(Math.PI * r) * (1 - r);
                yaw = me.heading + (k.kind.nocturnal || four ? 0 : 0.5);
                if (four) { ride = r; pitch = pack ? -0.12 * r : 0; }
            }
            if (!inView(x, z, 170)) continue;
            const p = rel(x, y, z);
            WayCompanions.pose(k.id, out, st, p[0], p[1], p[2], { lite: this.detail === 0 || k.slot >= 6 || (this.party.length > 6 && k.slot >= 3) || Math.hypot(p[0], p[2]) > (this.detail > 1 ? 16 : 6.5), yaw, gait: k.gait, speed: k.vel, moving: Math.min(1, k.speed / 1.2), rest: k.rest, down: k.down, alarm: k.alarm, alt: k.alt, wing: k.wing, bank: k.bank, t: t + k.slot * 3.7, ride, pitch, sway: j.stride * 6.2832, swayK: j.moving }, fx);
            if (k.kind.light && lit > 0.05) { const g = k.kind.light; this.lamps.push([p[0], p[1] + k.alt + 0.3, p[2], g[0] * lit, g[1] * lit, g[2] * lit, 10, 55]); }
            if (k.prey && k.role === 'chase') {
                // What it is after: a butterfly, always a wingbeat ahead.
                const b = rel(k.prey.x + 0.25 * Math.sin(t * 5.3 + k.slot), feet(k.prey.x, k.prey.z) + 0.45 + 0.2 * Math.sin(t * 3.1 + k.slot), k.prey.z + 0.25 * Math.cos(t * 4.1));
                for (const side of [-1, 1]) { st.reset(b[0], b[1], b[2], t * 1.3 + k.slot, 1).size(side, 1, 1).rz(0.9 * Math.sin(t * 22)); out.stamp(WayCompanions.butterfly(), st.top, null, 0, 0, 1); }
            }
        }

        // The wild ones. Near the eye they are the finer animals; further off the plainer ones stand in; the small are
        // not drawn from far away at all. The nearest so many, by the tier.
        {
            // (Past 'plenty' there are more of the small ones about, so more of them may be drawn.)
            const more = L.WILD_LEVELS[this.config.wildlife] > 2 ? 2 : L.WILD_LEVELS[this.config.wildlife] > 1 ? 1.5 : 1;
            const fineR = this.detail > 1 ? 13 : this.detail ? 8 : 0, most = Math.round((this.detail > 1 ? 44 : this.detail ? 26 : 14) * more), reach = this.detail > 1 ? 1 : this.detail ? 0.75 : 0.55, night = this.light.night, shown = [];
            for (const party of this.wildParties) for (const a of party) { if (!a.hidden && inView(a.x, a.z, (a.K.see || 170) * reach)) shown.push([Math.hypot(a.x - view.x, a.z - view.z), a]); }
            shown.sort((p, q) => p[0] - q[0]);
            let n = 0;
            for (const [away, a] of shown) {
                if (n++ >= most) break;
                const K = a.K, p = rel(a.x, a.y, a.z);
                if (K.swarm) {
                    // Many small things about one place: where each is, is only the time of day.
                    const out2 = K.hours === 'night' ? L.smooth(0.45, 0.7, night) : 1 - L.smooth(0.4, 0.65, night);
                    if (out2 < 0.05) { n--; continue; }
                    for (let i = 0; i < a.count; i++) {
                        const u = t + a.v * 40 + i * 7.3;
                        if (K.swarm === 'glow') { const blink = Math.max(0, Math.sin(u * 0.9 + i)) ** 2 * out2; this.glows.add(p[0] + Math.sin(i * 2.4 + u * 0.11) * 3.4, p[1] + 0.25 + 0.3 * Math.sin(u * 0.4 + i), p[2] + Math.cos(i * 1.7 + u * 0.09) * 3.4, 0.07, 0.7 * blink, blink, 0.35 * blink, 1); continue; }
                        if (K.swarm === 'dragonfly') {
                            // Darting low over the water's edge: a hang, a dash somewhere else, a hang.
                            const leg = Math.floor(u * 0.6), f = L.smooth(0, 0.25, u * 0.6 - leg), at = k => [Math.sin(k * 3.7 + i) * 2.6, 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(k * 2.3 + i * 1.7)), Math.cos(k * 2.9 + i * 0.7) * 2.6];
                            const A0 = at(leg), A1 = at(leg + 1), bx = p[0] + A0[0] + (A1[0] - A0[0]) * f, by = p[1] + A0[1] + (A1[1] - A0[1]) * f + 0.02 * Math.sin(u * 9), bz = p[2] + A0[2] + (A1[2] - A0[2]) * f;
                            st.reset(bx, by, bz, Math.atan2(A1[0] - A0[0], A1[2] - A0[2]), 2.2 * out2);
                            out.stamp(WayCompanions.flyerBody('dragonfly'), st.top, null, 0, 0, 1);
                            for (const side of [-1, 1]) { st.push().size(side, 1, 1).rz(0.35 * Math.sin(u * 60 + side)); out.stamp(WayCompanions.flyer('dragonfly'), st.top, null, 0, 0, 1); st.pop(); }
                            continue;
                        }
                        if (K.swarm === 'butterfly') {
                            const bx = p[0] + Math.sin(u * 0.5 + i * 2.1) * 2.4, by = p[1] + 0.6 + 0.4 * Math.sin(u * 0.9 + i), bz = p[2] + Math.cos(u * 0.37 + i * 1.3) * 2.4;
                            for (const side of [-1, 1]) { st.reset(bx, by, bz, u * 1.3 + i, 2.6 * out2).size(side, 1, 1).rz(0.9 * Math.sin(u * 22)); out.stamp(WayCompanions.butterfly(), st.top, null, 0, 0, 1); }
                            continue;
                        }
                        const bat = K.swarm === 'bat', turn = u * (bat ? 0.9 : 1.3) * (i % 2 ? 1 : -1) + i * 2.4, wide = (bat ? 5 : 8) + 2.5 * Math.sin(u * 0.31 + i), bx = p[0] + Math.sin(turn) * wide, by = p[1] + (bat ? 4 : 7) + 1.6 * Math.sin(u * 0.7 + i * 1.9), bz = p[2] + Math.cos(turn) * wide;
                        st.reset(bx, by, bz, turn + (i % 2 ? 1 : -1) * Math.PI / 2, 2.8 * out2);
                        out.stamp(WayCompanions.flyerBody(K.swarm), st.top, null, 0, 0, 1);
                        for (const side of [-1, 1]) { st.push().size(side, 1, 1).rz((bat ? 0.8 : 0.5) * Math.sin(u * (bat ? 26 : 17))); out.stamp(WayCompanions.flyer(K.swarm), st.top, null, 0, 0, 1); st.pop(); }
                    }
                    continue;
                }
                // (Nobody appears full size at the edge of sight: over the last of the distance they are small and grow.)
                const grow = L.smooth(1, 0.82, away / ((K.see || 170) * reach));
                if (a.kind === 'fish') { st.reset(p[0], p[1] + a.alt, p[2], a.yaw, 1).rx(-a.pitch); out.stamp(WayCompanions.fish(), st.top, null, 0, 0, 1); continue; }
                if (a.kind === 'seal') { st.reset(p[0], p[1], p[2], a.yaw, (0.85 + 0.3 * a.v) * grow).rx(-0.05 - 0.14 * a.alert); out.stamp(WayCompanions.seal(), st.top, null, 0, 0, 1); continue; }
                if (a.kind === 'crab') { st.reset(p[0], p[1] + 0.012 * Math.abs(Math.sin(a.gait * 30)), p[2], a.yaw, 1.5 * grow); out.stamp(WayCompanions.crab(), st.top, null, 0, 0, 1); continue; }
                if (away < fineR || !K.far) WayCompanions.pose(K.rig, out, st, p[0], p[1], p[2], { lite: true, size: (K.size || 1) * grow, yaw: a.yaw, gait: a.gait, speed: a.vel, moving: a.moving, rest: a.rest, down: a.down, alarm: a.alarm, alt: a.alt, wing: a.wing, bank: a.bank, pitch: a.pitch, t: t + a.v * 9 }, fx);
                else if (K.bird) A.bird(out, st, K.far, p[0], p[1] + a.alt + 0.12, p[2], { yaw: a.yaw, fold: a.wing ? 0 : 1, flap: a.wing ? (K.act === 'soar' ? 0.12 : 0.7) * Math.sin(t * (K.act === 'soar' ? 1.5 : 11) + a.v * 9) : 0, roll: -(a.bank || 0) * 0.6, size: grow });
                else A.beast(out, st, K.far, p[0], p[1], p[2], { yaw: a.yaw, ...this.farGait(K.rig, a.gait), speed: a.vel, moving: a.moving, graze: a.down, t: t + a.v * 9, size: (K.farSize || 1) * grow }, K.farCoat || null);
                // (The grove's moon-creatures: a faint halo about their own size, not a lamp.)
                if (K.glow && lit > 0.05) { const k = 0.3 * lit; this.glows.add(p[0], p[1] + K.tall * 0.5 * grow, p[2], K.glowR * grow, K.glow[0] * k, K.glow[1] * k, K.glow[2] * k, 1); }
            }
            this.wildDrawn = Math.min(n, most);
        }

        // The camp: the fire the traveller sits by, and other travellers' fires along the road.
        const fire = (x, y, z, strength) => {
            const p = rel(x, y, z), flick = 0.8 + 0.2 * Math.sin(t * 11) * Math.sin(t * 7.3) + 0.1 * Math.sin(t * 23);
            st.reset(p[0], p[1], p[2], t * 0.6, 1).size(strength, strength * (0.85 + 0.25 * flick), strength);
            out.stamp(WayModels.fixed('fire'), st.top, null, 0, Math.floor(t * 9) & 255, 1);
            this.glows.add(p[0], p[1] + 0.5, p[2], 2.2 * strength, 1.0 * flick * strength * 0.55, 0.5 * flick * strength * 0.55, 0.14 * strength * 0.55, 1);
            this.glows.add(p[0], p[1] + 0.06, p[2], 5.5, 0.5 * flick * strength * (0.3 + 0.7 * lit), 0.24 * flick * strength * (0.3 + 0.7 * lit), 0.07 * strength * (0.3 + 0.7 * lit), 1, 1);
            this.lamps.push([p[0], p[1] + 0.7, p[2], 2.6 * flick * strength, 1.2 * flick * strength, 0.4 * strength, 26, 90 * strength]);
            for (let i = 0; i < 5; i++) {              // sparks, and a thread of smoke
                const age = (t * 0.55 + i / 5) % 1, sx = Math.sin(i * 2.4 + t * 0.7) * 0.25 * age;
                this.glows.add(p[0] + sx, p[1] + 0.6 + age * 2.2, p[2] + Math.cos(i * 1.9) * 0.2 * age, 0.07, 1.0 * (1 - age) * strength, 0.6 * (1 - age) * strength, 0.2 * (1 - age) * strength, 1);
            }
            this.smoke(view, [x, y + 0.9, z], 0.6 * strength);
        };
        if (j.camp && j.fire > 0.02) fire(j.camp.x, j.camp.y, j.camp.z, j.fire);

        // The road's other travellers.
        for (const tr of this.traffic) {
            const [x] = w.place(tr.z, tr.d), y = feet(x, tr.z), yaw = w.heading(tr.z) + Math.PI, p = rel(x, y, tr.z);
            if (!inView(x, tr.z, 190)) continue;
            if (tr.kind === 'walker') {
                (this.detail > 0 && Math.hypot(p[0], p[2]) < 8 ? WayPeople : A).person(out, st, p[0], p[1], p[2], tr.look, { yaw, stride: tr.gait, moving: 1, t, size: tr.look.size, act: Math.abs(tr.z - j.z) < 8 ? 'wave' : '' });
                if (tr.mate) A.person(out, st, p[0] - Math.cos(yaw) * 0.9, p[1], p[2] + Math.sin(yaw) * 0.9, tr.mate, { yaw, stride: tr.gait + 0.3, moving: 1, t, size: tr.mate.size });
            } else {
                const fz = Math.cos(yaw), fx = Math.sin(yaw);
                if (this.detail > 0 && Math.hypot(p[0], p[2]) < 26) WayCompanions.quad(out, st, 'horse', p[0] + fx * (tr.kind === 'wagon' ? 3.2 : 0), p[1], p[2] + fz * (tr.kind === 'wagon' ? 3.2 : 0), { lite: Math.hypot(p[0], p[2]) > 11, yaw, gait: tr.gait, speed: tr.speed, moving: 1, t });
                else A.beast(out, st, 'horse', p[0] + fx * (tr.kind === 'wagon' ? 3.2 : 0), p[1], p[2] + fz * (tr.kind === 'wagon' ? 3.2 : 0), { yaw, gait: tr.gait, stride: 1.9, base: 'trot', speed: tr.speed, moving: 1, t }, tr.v < 0.5 ? [150, 110, 80] : [210, 200, 190]);
                if (tr.kind === 'wagon') {
                    st.reset(p[0], p[1], p[2], yaw, 1);
                    out.stamp(A.wagon(), st.top, null, 0, 0, lit > 0.3 ? 1 : 0);
                    for (const [wx, wz] of [[-0.92, 0.9], [0.92, 0.9], [-0.92, -0.9], [0.92, -0.9]]) { st.push().move(wx, 0.6, wz).rx(tr.gait * 3).rz(Math.PI / 2); out.stamp(WayModels.fixed('wheel'), st.top); st.pop(); }
                    A.person(out, st, p[0] + fx * 1.25, p[1] + 0.52, p[2] + fz * 1.25, tr.look, { yaw, stride: 0, moving: 0, sit: 1, t, size: tr.look.size });
                    if (lit > 0.3) { this.glows.add(p[0] + fx * 1.2, p[1] + 1.8, p[2] + fz * 1.2, 1.6, 0.5 * lit, 0.32 * lit, 0.14 * lit, 1); this.lamps.push([p[0] + fx * 1.2, p[1] + 1.8, p[2] + fz * 1.2, 1.2 * lit, 0.75 * lit, 0.32 * lit, 14, 50]); }
                } else A.person(out, st, p[0] + fx * 0.1, p[1] + 0.98, p[2] + fz * 0.1, tr.look, { yaw, stride: 0, moving: 0, sit: 1, t, size: tr.look.size, act: Math.abs(tr.z - j.z) < 8 ? 'wave' : '' });
            }
        }

        // Those who live here. Close to the eye they are the finer figures; further off, and on Low, the plainer.
        const closeBy = (x, z, near = 10) => this.detail > 0 && Math.hypot(x - view.x, z - view.z) < near * (this.detail > 1 ? 1 : 0.7);
        // The finest figures are dear: the traveller, and the few people nearest the eye (four on High, two on Medium).
        let fineFolk = this.detail > 1 ? 4 : this.detail ? 1 : 0;
        const finePerson = (x, z) => fineFolk > 0 && closeBy(x, z, 9) && fineFolk-- > 0;
        const sight = this.detail > 1 ? 160 : this.detail ? 55 : 30;           // how far off somebody is still drawn
        for (const group of this.actors.values()) {
            for (const a of group) {
                if (!inView(a.x, a.z, a.kind === 'beam' || a.kind === 'sails' ? 400 : sight)) continue;
                if (a.kind === 'folk') {
                    const fx = a.x + (a.ox || 0), fz = a.z + (a.oz || 0), p = rel(fx, feet(fx, fz), fz), sitting = a.role === 'sit' || a.role === 'fish';
                    (finePerson(fx, fz) ? WayPeople : A).person(out, st, p[0], p[1] - (sitting ? 0.02 : 0), p[2], a.look, { yaw: a.yaw + (a.veer || 0), stride: a.stride, moving: a.role === 'stroll' || a.role === 'child' ? 1 : a.stepping || 0, sit: sitting ? 1 : 0, t: t + a.v * 9, size: a.look.size, head: a.head || 0, act: a.wave > 0.3 ? 'wave' : a.role === 'chat' ? 'chat' : a.role === 'hoe' ? 'hoe' : a.role === 'fish' ? 'fish' : '' });
                } else if (a.kind === 'sails') {
                    const p = rel(a.x, a.y, a.z);
                    st.reset(p[0], p[1], p[2], a.yaw, 1).rz(a.turn || 0);
                    out.stamp(WayModels.fixed('sails'), st.top);
                } else if (a.kind === 'beam') {
                    if (lit < 0.2) continue;
                    const p = rel(a.x, a.y, a.z);
                    // Two beams sweeping round, as beads of light thinning with distance.
                    for (const turn of [0, Math.PI]) for (let i = 1; i <= 7; i++) { const reach = i * i * 1.6 + 2, k = lit * 0.34 / i; this.glows.add(p[0] + Math.sin(t * 0.5 + turn) * reach, p[1] - reach * 0.03, p[2] + Math.cos(t * 0.5 + turn) * reach, 1.2 + reach * 0.16, k, 0.9 * k, 0.62 * k, 1); }
                } else if (a.kind === 'boat') {
                    const p = rel(a.x, a.y + 0.05 + 0.05 * Math.sin(t * 1.1 + a.v * 9), a.z);
                    st.reset(p[0], p[1], p[2], a.yaw + 0.1 * Math.sin(t * 0.3 + a.v * 5), 1.25).rz(0.05 * Math.sin(t * 0.9 + a.v * 7));
                    out.stamp(WayModels.fixed('boat', Math.floor(a.v * 3)), st.top);
                    if (a.sail) out.stamp(WayModels.fixed('sail'), st.top);
                } else if (a.kind === 'camp') {
                    if (this.light.night < 0.4 || (j.camp && j.camp.slot !== undefined && Math.abs(j.camp.z - a.z) < 2)) continue;
                    fire(a.x, a.y, a.z, 1);
                    const side = a.d > 0 ? -1 : 1, hd = w.heading(a.z), sx = a.x + Math.cos(hd) * side * 1.5, sz = a.z - Math.sin(hd) * side * 1.5, p = rel(sx, feet(sx, sz), sz);
                    A.person(out, st, p[0], p[1], p[2], a.look, { yaw: hd + (side > 0 ? -Math.PI / 2 : Math.PI / 2), stride: 0, moving: 0, sit: 1, t: t + 3, act: 'warm', size: a.look.size });
                    const tp = rel(a.x - Math.cos(hd) * side * 2.6, a.y, a.z + Math.sin(hd) * side * 2.6);
                    st.reset(tp[0], tp[1], tp[2], hd, 1);
                    out.stamp(WayModels.fixed('tent'), st.top, [null, null, null, WayModels.BRIGHT[Math.floor(a.v * 5.99)]]);
                } else if (a.kind === 'wisp') {
                    // By day a wisp is a mote of light; at night it is a lantern with no one holding it.
                    const s = 0.12 + 0.88 * lit, p = rel(a.x + Math.sin(t * 0.5 + a.v * 20) * 2.5, a.y + 1.2 + 0.7 * Math.sin(t * 0.8 + a.v * 9), a.z + Math.cos(t * 0.37 + a.v * 30) * 2.5);
                    this.glows.add(p[0], p[1], p[2], 0.2 + 0.4 * lit, 0.4 * s, 0.9 * s, 0.75 * s, 1);
                    this.glows.add(p[0], p[1], p[2], 0.08, 0.9 * s, 1 * s, 1 * s, 1);
                } else if (a.kind === 'gull') {
                    const turn = t * 0.35 * (a.v < 0.5 ? 1 : -1) + a.v * 20, rad = 14 + 16 * a.v, p = rel(a.x0 + Math.sin(turn) * rad, a.y + 11 + 12 * a.v + 2 * Math.sin(t * 0.3 + a.v * 7), a.z0 + Math.cos(turn) * rad);
                    if (this.detail > 0 && Math.hypot(p[0], p[2]) < 45) WayCompanions.bird(out, st, 'gull', p[0], p[1], p[2], { yaw: turn + (a.v < 0.5 ? 1 : -1) * Math.PI / 2, wing: 1, gait: t * 0.5 + a.v, bank: (a.v < 0.5 ? 1 : -1) * 0.5, t });
                    else A.bird(out, st, 'gull', p[0], p[1], p[2], { yaw: turn + (a.v < 0.5 ? 1 : -1) * Math.PI / 2, flap: 0.12 * Math.sin(t * 1.4 + a.v * 9), roll: (a.v < 0.5 ? -1 : 1) * 0.3 });
                } else if (a.kind === 'mouse' || a.kind === 'rat') {
                    // Too small to see from far off; drawn plainly near at hand on every tier.
                    if (a.state === 'hid' || Math.hypot(a.x - view.x, a.z - view.z) > (this.detail ? 20 : 13)) continue;
                    const p = rel(a.x, feet(a.x, a.z), a.z);
                    WayCompanions.pose(a.kind, out, st, p[0], p[1], p[2], { lite: !closeBy(a.x, a.z, 5), yaw: a.yaw, gait: a.gait, speed: a.vel, moving: a.moving, rest: a.rest, down: a.graze, t: t + a.v * 9 });
                } else if (a.kind === 'sparrow') {
                    if (Math.hypot(a.x - view.x, a.z - view.z) > (this.detail ? 30 : 18)) continue;
                    const flying = a.state === 'fly', p = rel(a.x, feet(a.x, a.z) + (a.alt || 0), a.z);
                    if (closeBy(a.x, a.z, 14)) WayCompanions.bird(out, st, 'sparrow', p[0], p[1], p[2], { yaw: a.yaw, wing: flying ? 1 : 0, gait: flying ? t * 3 + a.v : 0, moving: 0, down: !flying && !(a.hop > 0) ? 0.6 * Math.max(0, Math.sin(t * 3.3 + a.v * 30)) : 0, t: t + a.v * 9 });
                    else A.bird(out, st, 'sparrow', p[0], p[1] + 0.05, p[2], { yaw: a.yaw, fold: flying ? 0 : 1, flap: flying ? 0.8 * Math.sin(t * 18 + a.v * 9) : 0 });
                } else if (a.kind === 'duck' || a.kind === 'hen' || a.kind === 'crow' || a.kind === 'pigeon') {
                    const y = a.kind === 'duck' ? a.y - 0.02 : feet(a.x, a.z) + 0.1 + (a.alt || 0), p = rel(a.x, y, a.z), flying = a.state === 'fly';
                    const fine = { crow: 'raven', hen: 'hen', duck: 'duck' }[a.kind];
                    if (fine && closeBy(a.x, a.z, 22)) WayCompanions.bird(out, st, fine, p[0], p[1] - (a.kind === 'duck' ? 0.1 : 0.1), p[2], { yaw: a.yaw, wing: flying ? 1 : 0, gait: flying ? t * 2.6 + a.v : a.kind === 'duck' ? 0 : t * 0.2 + a.v, moving: 0, down: !flying && a.kind !== 'duck' ? 0.5 * Math.max(0, Math.sin(t * 2.1 + a.v * 30)) : 0, t: t + a.v * 9, rest: a.kind === 'duck' ? 1 : 0 });
                    else A.bird(out, st, a.kind, p[0], p[1] + (a.kind === 'hen' ? 0.08 : 0), p[2], { yaw: a.yaw, fold: flying ? 0 : 1, flap: flying ? 0.7 * Math.sin(t * 13 + a.v * 9) : 0, pitch: !flying && a.kind !== 'duck' ? 0.35 * Math.max(0, Math.sin(t * 2.1 + a.v * 30)) : 0 });
                } else if (A.BEASTS[a.kind]) {
                    const p = rel(a.x, feet(a.x, a.z) + a.perch, a.z), coat = a.kind === 'cat' ? [[60, 56, 60], [220, 140, 60], [236, 232, 224], [130, 126, 124]][Math.floor(a.v * 3.99)] : a.kind === 'cow' && a.v < 0.4 ? [70, 60, 56] : null;
                    if (WayCompanions.KINDS[a.kind] && closeBy(a.x, a.z, 24)) WayCompanions.quad(out, st, a.kind, p[0], p[1], p[2], { lite: Math.hypot(p[0], p[2]) > 9, yaw: a.yaw, gait: a.gait, speed: a.vel, moving: a.moving, down: a.kind === 'cat' ? 0 : a.graze * (a.state === 'idle' ? 1 : 0), rest: a.kind === 'cat' && a.state === 'idle' ? 1 : 0, t: t + a.v * 9, size: 0.85 + 0.3 * a.v, head: a.head || 0 });
                    else A.beast(out, st, a.kind, p[0], p[1], p[2], { yaw: a.yaw, gait: a.gait, stride: this.farGait(a.kind, 0).stride, base: this.farGait(a.kind, 0).base, speed: a.vel, moving: a.moving, graze: a.kind === 'cat' ? 0 : a.graze, t: t + a.v * 9, size: 0.85 + 0.3 * a.v, sit: a.kind === 'cat' && a.state === 'idle' ? 1 : 0, head: a.head || 0 }, coat);
                }
            }
        }

        // The sky's travellers.
        for (const s of this.wonders) {
            const p = rel(s.x, s.y, s.z);
            if (s.kind === 'geese') { for (let i = 0; i < 9; i++) { const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1; A.bird(out, st, 'goose', p[0] + (Math.cos(s.yaw) * side * row * 1.6 - Math.sin(s.yaw) * row * 1.9), p[1] + 0.2 * Math.sin(t + i), p[2] + (-Math.sin(s.yaw) * side * row * 1.6 - Math.cos(s.yaw) * row * 1.9), { yaw: s.yaw, flap: 0.55 * Math.sin(t * 5.5 + i * 0.7) }); } }
            else if (s.kind === 'dragon') WayCompanions.quad(out, st, 'whelp', p[0], p[1], p[2], { lite: true, yaw: s.yaw, gait: 0, moving: 0, wing: 1, bank: (s.v < 0.5 ? -1 : 1) * 0.25, t: t * 0.16, size: 13 });          // the whelp's own kind, grown
            else {
                st.reset(p[0], p[1] + 2 * Math.sin(t * 0.2), p[2], s.yaw, 1);
                out.stamp(s.kind === 'airship' ? A.airship() : A.balloon(), st.top, [null, null, null, WayModels.BRIGHT[Math.floor(s.v * 5.99)]], 0, 0, lit > 0.2 ? 1 : 0);
            }
        }
    }

    // A chimney's or a fire's smoke: a few puffs, each its own age, rising and leaning with the wind.
    smoke(view, at, thick = 1) {
        const t = this.seconds, f = this.light.fill, grey = 0.2 + 0.26 * this.light.day;
        for (let i = 0; i < 5; i++) {
            const age = (((t * 0.09 + i / 5 + at[0] * 0.37) % 1) + 1) % 1, a = (1 - age) * Math.min(1, age * 4) * 0.17 * thick;
            this.puffs.add(at[0] - view.x + this.wind[0] * age * age * 1.6 + Math.sin(age * 5 + i) * 0.25, at[1] - view.y + age * 6, at[2] - view.z + this.wind[2] * age * age * 1.6, 0.45 + age * 2.2, (0.2 + f[0]) * grey * a, (0.2 + f[1]) * grey * a, (0.2 + f[2]) * grey * a, a);
        }
    }

    // Lit windows and lanterns: a glow each, a pool on the ground under a street lamp, and the nearest few as real lamps.
    drawLights(view, me) {
        const lit = this.light.lit, t = this.seconds, L = WayLogic;
        for (const sq of this.active.near) {
            if (Math.hypot(sq.x0 + 32 - view.x, sq.z0 + 32 - view.z) > 230) continue;
            if (lit > 0.02) {
                for (const l of sq.lights) {
                    const x = l[0] - view.x, y = l[1] - view.y, z = l[2] - view.z;
                    if (x * x + z * z > (l[7] ? 32400 : 8100)) continue;          // window glows to 90 m, lanterns to 180
                    const flick = 0.9 + 0.1 * Math.sin(t * 5 + l[0] * 3), s = lit * flick * (l[7] ? 0.42 : 0.11);
                    this.glows.add(x, y, z, l[3], l[4] * s, l[5] * s, l[6] * s, 1);
                    if (l[7] === 2) {
                        this.glows.add(x, y - 2.38, z, 5.2, l[4] * lit * 0.25, l[5] * lit * 0.22, l[6] * lit * 0.16, 1, 1);
                        const away = Math.hypot(l[0] - me.x, l[2] - me.z), k = L.smooth(46, 26, away) * lit * flick;
                        if (k > 0) this.lamps.push([x, y, z, 1.2 * k, 0.76 * k, 0.36 * k, 22, k * (60 - away)]);
                    }
                }
            }
            if (Math.hypot(sq.x0 + 32 - view.x, sq.z0 + 32 - view.z) < 170) for (const s of sq.smokes) this.smoke(view, s);
        }
        // A grand city's castle and cathedral after dark, from a long way down the road: a few lights the far squares keep.
        if (lit > 0.05) for (const sq of [...this.active.far, ...this.active.near]) for (const b of sq.beacons) {
            const x = b[0] - view.x, y = b[1] - view.y, z = b[2] - view.z, away = Math.hypot(x, z), hole = this.active.hole;
            if (away > this.reach || (sq.far && hole && b[0] > hole[0] && b[0] < hole[2] && b[2] > hole[1] && b[2] < hole[3])) continue;
            const s = lit * 0.95 * (1 - 0.8 * away / this.reach);
            this.glows.add(x, y, z, b[3] * (0.8 + away / 320), b[4] * s, b[5] * s, b[6] * s, 1);
        }
        // Fireflies on a warm night, wherever there is cover: a box of them about the eye, each blinking in its own time.
        const cover = this.world.air(me.z).cover;
        const flies = Math.round(46 * this.density * cover * this.light.night * (1 - this.cold) * (1 - this.weather.wet));
        for (let i = 0; i < flies; i++) {
            const h = k => L.hash(i, k, 91), bx = 44, by = 5, x = ((h(0) * bx - view.x + Math.sin(t * 0.3 + i) * 1.5) % bx + bx) % bx - bx / 2, z = ((h(1) * bx - view.z + Math.cos(t * 0.23 + i * 2) * 1.5) % bx + bx) % bx - bx / 2;
            const blink = Math.max(0, Math.sin(t * (0.9 + h(2)) + i * 2.4)) ** 3, y = this.world.ground(view.x + x, view.z + z) - view.y + 0.4 + h(3) * by * 0.5 + 0.3 * Math.sin(t * 0.7 + i);
            if (blink > 0.05 && x * x + z * z > 9) this.glows.add(x, y, z, 0.075, 0.8 * blink, 1.0 * blink, 0.3 * blink, 1);
        }
    }

    // ---- Without WebGL: the same walk, painted flat ---------------------------------------------------
    // Slices of the real ground, back to front, in the country's colours; the
    // road; the nearest trees and houses as cut-outs; the traveller.
    drawFlat(scene, view, me) {
        const L = WayLogic, ctx = this.ctx, W = this.canvas.width, H = this.canvas.height, w = this.world, light = scene.light, j = this.journey;
        const tone = c => `rgb(${c.map(v => Math.round(255 * Math.pow(1 - Math.exp(-v * 1.3), 0.4545))).join(',')})`;
        const sky = ctx.createLinearGradient(0, 0, 0, H * 0.62);
        sky.addColorStop(0, tone(light.zenith));
        sky.addColorStop(1, tone(light.horizon.map((v, i) => v + scene.glow[i] * 0.5)));
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, W, H);
        const tanY = scene.tanY, tanX = tanY * W / H, sh = Math.sin(view.heading), ch = Math.cos(view.heading), sp = Math.sin(view.pitch), cp = Math.cos(view.pitch);
        // A point in the world, on the screen: [x, y, depth] or null behind the eye.
        const project = (x, y, z) => {
            const dx = x - view.x, dy = y - view.y, dz = z - view.z, fwd = (dx * sh + dz * ch) * cp + dy * sp;
            if (fwd < 0.5) return null;
            return [W / 2 + (dx * ch - dz * sh) / fwd / tanX * W / 2, H / 2 * (1 - scene.lift) - (dy * cp - (dx * sh + dz * ch) * sp) / fwd / tanY * H / 2, fwd];
        };
        const lightOn = [0, 1, 2].map(i => light.fill[i] * 0.9 + scene.lightCol[i] * 0.55);
        const shade = (c, depth, k = 1) => tone(L.mix3(c.map((v, i) => (v / 255) ** 2 * lightOn[i] * k), light.horizon, 1 - Math.exp(-depth * scene.fog[0] * 1.2)));
        // The far ranges.
        const horizon = H / 2 * (1 - scene.lift) + Math.tan(view.pitch) / tanY * H / 2;
        ctx.fillStyle = tone(L.mix3([0.2, 0.24, 0.32].map((v, i) => v * lightOn[i]), light.horizon, 0.6));
        ctx.beginPath();
        ctx.moveTo(0, H);
        for (let i = 0; i <= 48; i++) { const a = view.heading + Math.atan((i / 24 - 1) * tanX); ctx.lineTo(i / 48 * W, horizon - (0.03 + 0.12 * L.noise1(a * 3 + 40, 9) + 0.03 * L.noise1(a * 14, 4)) * (1 + scene.range[0] * 5) / tanY * H / 2); }
        ctx.lineTo(W, H);
        ctx.fill();
        // The ground, in slices.
        const rows = 30, cols = 30, grass = WayModels.GRASS, season = w.season(j.z);
        for (let row = rows - 1; row >= 0; row--) {
            const d = 5 * Math.pow(1.21, row), r = w.at(view.z + ch * d * cp), g0 = grass[r.near.biome], g = L.mix3(g0[season.index], g0[season.next], season.t), snowy = Math.max(season.snow, r.near.biome === 'pass' ? 0.35 : 0);
            ctx.fillStyle = shade(L.mix3(g, [242, 246, 252], snowy).map(v => v * (0.9 + 0.1 * (row % 2))), d);
            ctx.beginPath();
            ctx.moveTo(-10, H + 10);
            let wetFrom = -1;
            const pts = [];
            for (let col = 0; col <= cols; col++) {
                const side = (col / cols * 2 - 1) * 1.15 * tanX, x = view.x + (sh + ch * side) * d, z = view.z + (ch - sh * side) * d, level = w.water(x, z), y = Math.max(w.ground(x, z), level);
                const p = project(x, y, z) || [W / 2 + side * W, H, d];
                pts.push([p[0], p[1], y === level]);
                ctx.lineTo(p[0], p[1]);
                void wetFrom;
            }
            ctx.lineTo(W + 10, H + 10);
            ctx.fill();
            // Water lies flat in its slice.
            ctx.fillStyle = tone(L.mix3([0.1, 0.3, 0.42].map((v, i) => v * lightOn[i] * 1.3), light.horizon, 0.35));
            for (let col = 0; col < cols; col++) if (pts[col][2] && pts[col + 1][2]) ctx.fillRect(pts[col][0] - 1, Math.min(pts[col][1], pts[col + 1][1]), pts[col + 1][0] - pts[col][0] + 2, H * 0.08 * 5 / (5 + d));
        }
        // The road ahead, as a ribbon.
        ctx.fillStyle = shade([176, 142, 98], 20);
        ctx.beginPath();
        const edge = [];
        for (let k = 0; k < 44; k++) {
            const z = view.z - 4 + k * k * 0.14 + k * 0.8, r = w.at(z);
            const a = project(r.x - 1.9 / r.cos, w.surface(r.x, z) + 0.03, z), bb = project(r.x + 1.9 / r.cos, w.surface(r.x, z) + 0.03, z);
            if (a && bb) edge.push([a, bb]);
        }
        edge.forEach(([a], i) => (i ? ctx.lineTo(a[0], a[1]) : ctx.moveTo(a[0], a[1])));
        for (let i = edge.length - 1; i >= 0; i--) ctx.lineTo(edge[i][1][0], edge[i][1][1]);
        ctx.fill();
        // What stands near, back to front.
        const C = L.CHUNK, cx = Math.floor(me.x / C), cz = Math.floor(me.z / C);
        this.flatItems = this.flatItems?.key === `${cx},${cz}` ? this.flatItems : { key: `${cx},${cz}`, list: [] };
        if (!this.flatItems.list.length) for (let jj = -1; jj <= 3; jj++) for (let i = -2; i <= 2; i++) for (const item of w.scatter(cx + i, cz + jj)) if (item.k === 'tree' || item.k === 'house' || item.k === 'tower' || item.k === 'lamp') this.flatItems.list.push(item);
        const seen = [];
        for (const item of this.flatItems.list) { const p = project(item.x, item.y, item.z); if (p && p[2] < 240 && p[0] > -200 && p[0] < W + 200) seen.push([p, item]); }
        seen.sort((a, b) => b[0][2] - a[0][2]);
        const lit = light.lit;
        for (const [p, item] of seen) {
            const s = H / 2 / tanY / p[2];           // pixels to a metre there
            if (item.k === 'tree') {
                const tall = 8 * item.s, leaf = WayModels.leafTint(item.kind, w.season(item.z), item.v);
                ctx.fillStyle = shade([104, 76, 56], p[2]);
                ctx.fillRect(p[0] - 0.25 * s, p[1] - tall * 0.5 * s, 0.5 * s, tall * 0.5 * s);
                ctx.fillStyle = shade(leaf, p[2], 1.1);
                ctx.beginPath();
                if (item.kind === 'fir' || item.kind === 'pine') { ctx.moveTo(p[0], p[1] - tall * 1.3 * s); ctx.lineTo(p[0] + 2.6 * item.s * s, p[1] - tall * 0.2 * s); ctx.lineTo(p[0] - 2.6 * item.s * s, p[1] - tall * 0.2 * s); }
                else ctx.ellipse(p[0], p[1] - tall * 0.72 * s, 3.4 * item.s * s, 2.9 * item.s * s, 0, 0, 6.2832);
                ctx.fill();
            } else if (item.k === 'house' || item.k === 'tower') {
                const wide = (item.w || item.r * 2) * s, tall = (item.h || 0.5 + item.floors * 2.75) * s, roof = item.k === 'tower' ? item.r * 2 * s : item.dp * 0.6 * s;
                ctx.fillStyle = shade(item.k === 'tower' ? [156, 152, 146] : WayModels.PLASTER[Math.floor(item.v * 4.99)], p[2]);
                ctx.fillRect(p[0] - wide / 2, p[1] - tall, wide, tall);
                ctx.fillStyle = shade([192, 88, 58], p[2]);
                ctx.beginPath(); ctx.moveTo(p[0] - wide * 0.56, p[1] - tall); ctx.lineTo(p[0], p[1] - tall - roof); ctx.lineTo(p[0] + wide * 0.56, p[1] - tall); ctx.fill();
                ctx.fillStyle = lit > 0.3 ? `rgba(255,190,96,${lit})` : shade([64, 84, 112], p[2]);
                for (let f = 0; f < (item.floors || 2); f++) for (const side of [-0.25, 0.25]) ctx.fillRect(p[0] + side * wide - 0.4 * s, p[1] - (1.9 + f * 2.75) * s, 0.8 * s, 1.0 * s);
            } else {
                ctx.fillStyle = shade([58, 58, 66], p[2]);
                ctx.fillRect(p[0] - 0.08 * s, p[1] - 2.7 * s, 0.16 * s, 2.7 * s);
                if (lit > 0.3) { ctx.fillStyle = `rgba(255,190,96,${lit})`; ctx.beginPath(); ctx.arc(p[0], p[1] - 2.5 * s, 0.3 * s, 0, 6.2832); ctx.fill(); }
            }
        }
        // The traveller: a cloak, a head, a staff, and the stride.
        const p = this.config.camera === 'first' ? null : project(me.x, me.y, me.z);
        if (p) {
            const s = H / 2 / tanY / p[2], look = { ...this.look() }, swing = Math.sin(j.stride * 6.2832) * 0.28 * j.moving, sit = j.sit * 0.45;
            ctx.strokeStyle = shade(look.legs, p[2]);
            ctx.lineWidth = Math.max(1, 0.2 * s);
            ctx.lineCap = 'round';
            for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(p[0] + side * 0.1 * s, p[1] - (0.88 - sit) * s); ctx.lineTo(p[0] + (side * 0.12 + side * swing * 0.5) * s, p[1]); ctx.stroke(); }
            look.cloak = look.cloak || look.tunic;
            ctx.fillStyle = shade(look.cloak, p[2]);
            ctx.beginPath(); ctx.moveTo(p[0] - 0.3 * s, p[1] - (1.5 - sit) * s); ctx.lineTo(p[0] + 0.3 * s, p[1] - (1.5 - sit) * s); ctx.lineTo(p[0] + 0.42 * s, p[1] - (0.35 - sit * 0.5) * s); ctx.lineTo(p[0] - 0.42 * s, p[1] - (0.35 - sit * 0.5) * s); ctx.fill();
            ctx.beginPath(); ctx.arc(p[0], p[1] - (1.66 - sit) * s, 0.2 * s, 0, 6.2832); ctx.fill();
            ctx.strokeStyle = shade([120, 88, 60], p[2]);
            ctx.lineWidth = Math.max(1, 0.06 * s);
            ctx.beginPath(); ctx.moveTo(p[0] + 0.45 * s, p[1]); ctx.lineTo(p[0] + (0.42 + swing * 0.3) * s, p[1] - (1.95 - sit) * s); ctx.stroke();
            if (lit > 0.3) { ctx.fillStyle = `rgba(255,190,96,${lit})`; ctx.beginPath(); ctx.arc(p[0] + 0.45 * s, p[1] - (1.6 - sit) * s, 0.12 * s, 0, 6.2832); ctx.fill(); }
        }
    }

    // Where a point of the world falls on the screen, in CSS pixels: [x, y], or null behind the eye.
    onScreen(x, y, z) {
        const v = this.view, sh = Math.sin(v.heading), ch = Math.cos(v.heading), sp = Math.sin(v.pitch), cp = Math.cos(v.pitch), dx = x - v.x, dy = y - v.y, dz = z - v.z;
        const fwd = (dx * sh + dz * ch) * cp + dy * sp, tanY = this.scene.tanY;
        if (fwd < 0.2) return null;
        return [this.width / 2 + (dx * ch - dz * sh) / fwd / (tanY * this.width / this.height) * this.width / 2, this.height / 2 * (1 - this.scene.lift) - (dy * cp - (dx * sh + dz * ch) * sp) / fwd / tanY * this.height / 2];
    }

    // What the tests ask about.
    debugState() {
        const j = this.journey, me = this.standing, r = this.world.at(j.z), grand = !!r.near.grand;       // (the world keeps one row: ask it first)
        return {
            flat: this.flat, z: j.z, d: j.d, distance: j.distance, speed: j.speed, mode: j.mode, y: me.y, ground: this.world.surface(me.x, me.z), biome: r.near.biome, place: r.near.place,
            wild: { level: this.config.wildlife, parties: this.wildParties.length, animals: this.wildParties.reduce((n, p) => n + p.length, 0), kinds: [...new Set(this.wildParties.map(p => p[0].kind))], drawn: this.wildDrawn || 0 }, herds: [...this.actors.values()].reduce((n, g) => n + (g.herd ? g.length : 0), 0),
            near: this.active.near.length, far: this.active.far.length, queue: this.queue.length, actors: [...this.actors.values()].reduce((n, g) => n + g.length, 0), moving: this.moving.n,
            glows: this.glows.n, puffs: this.puffs.n, lamps: this.lamps.length, day: this.day, lit: this.light.lit, night: this.light.night, stars: this.light.stars, cloud: this.weather.cloud, wet: this.weather.wet,
            fall: this.scene.fall, shadow: this.scene.shadow, camera: this.config.camera, cam: { ...this.cam }, orbit: { az: this.orbit.az, el: this.orbit.el, dist: this.orbit.dist, reach: this.orbit.reach, open: WayLogic.inOpen(this.world, this.cam.x, this.cam.y, this.cam.z, 0.2) }, clear: this.cam.y - Math.max(this.world.surface(this.cam.x, this.cam.z), this.world.water(this.cam.x, this.cam.z)),
            feet: this.onScreen(me.x, me.y, me.z), head: this.onScreen(me.x, me.y + 1.85, me.z), shot: this.shot.index, veil: Number(this.veilShade), tanY: this.scene.tanY, gpu: this.gpu.step, drawn: this.renderer.drawn, traffic: this.traffic.length, wonders: this.wonders.length, companion: this.party.length > 0 && this.party.every(p => p.x !== null), party: this.party.map(p => ({ id: p.id, x: p.x, z: p.z, alt: p.alt, rest: p.rest, riding: p.riding, mode: p.mode })), traveller: this.config.traveller, leafy: this.air ? this.air.leafy : 0, tint: this.scene.fallTint, countries: this.world.biomes, form: this.shift.form, change: this.shift.change, hidden: this.stealth.hidden, detail: this.detail, ghost: this.ghosts.map(g => g.soup.n * (g.alpha > 0 ? 1 : 0)), grand,
        };
    }
}
