// Ice Patrol (SPEC §10.34): an endless low patrol over an ice world, seen
// from the pilot's seat. Plains, hills and mountain chains of snow under a
// low sun, two moons and an aurora; snow that comes and goes; wingmen
// ahead; and a cockpit whose instruments read the world outside.
//
//   ice-logic.js    the world: terrain, autopilot, sky, weather, radar (pure)
//   ice-gl.js       the view outside, in WebGL
//   ice-cockpit.js  the canopy, the panel and its instruments, in 2D
//   ice-patrol.js   this: the manager that flies it
//
// Cheap by construction (SPEC §4.8): the GPU draws the world, and the main
// thread only steers (a few dozen height lookups a frame), sweeps the radar
// and repaints a handful of small instruments about fifteen times a second.

const ICE_TIMES = { dawn: 0.262, day: 0.5, dusk: 0.741, night: 0.0 };
const ICE_TIME_ORDER = ['cycle', 'clock', 'dawn', 'day', 'dusk', 'night'];
const ICE_TIME_NAMES = { cycle: 'the day goes round', clock: 'by your clock', dawn: 'dawn', day: 'midday', dusk: 'dusk', night: 'night' };
const ICE_WEATHER_ORDER = ['auto', 'clear', 'flurries', 'snow', 'blizzard'];
const ICE_WEATHER_NAMES = { auto: 'snow comes and goes', clear: 'clear', flurries: 'flurries', snow: 'steady snow', blizzard: 'blizzard' };
const ICE_VIEWS = ['full', 'panel', 'none'];
const ICE_VIEW_NAMES = { full: 'Canopy and panel', panel: 'Panel only', none: 'No cockpit' };
const ICE_RANGES = [2000, 4000, 8000];
const ICE_CRUISE = 80;          // metres a second at Speed 1
const ICE_WIND = 0.7;           // the prevailing wind's bearing, radians: the drifts lie along it
// Where the wingmen fly, from the lead: metres right, up and ahead.
// What a struggling GPU gives up, in turn: shadows, then resolution.
const ICE_GPU = [{ scale: 1, shadows: true }, { scale: 1, shadows: false }, { scale: 0.75, shadows: false }, { scale: 0.55, shadows: false }, { scale: 0.4, shadows: false }];
const ICE_SLOTS = [{ x: -24, y: 3, z: 66 }, { x: 31, y: 6, z: 108 }, { x: -60, y: 10, z: 156 }];

class IcePatrolAnimationManager {
    constructor(host) {
        this.host = host;
        this.config = WP.settings.load();
        this.isRunning = false;
        this.animationId = null;
        this.lastTime = 0;
        this.seconds = 0;
        this.pan = 0;            // Android home-screen offset as a turn of the head, eased
        this.panTarget = 0;
        this.shadowFade = 0;     // 0 to 1: shadows fade in and out with the tier
        // The stage's governor times this page's own work, and the GPU's is
        // none of it. So the frames are watched here: when they arrive late
        // though the work is light, the view gives up its shadows, then
        // pixels (ICE_GPU). The step is remembered, and each start tries one better.
        this.gpu = { step: 0, late: 0, calm: 0, pace: 0, gaveUp: false };
        this.drift = [0, 0, 0];  // where the snow has blown to, metres, wrapped
        this.cloudDrift = [0, 0];
        this.wingmen = [];
        this.beaconCache = new Map();
        this.contacts = [];
        this.scene = { cam: {}, craft: [], lights: [], layers: [] };
        this.onResize = () => this.resize();
        this.onLost = event => { event.preventDefault(); this.renderer.lost = true; };
        // A lost graphics context takes every canvas's picture with it: build the view again, and repaint the cockpit.
        this.onRestored = () => { this.renderer.lost = false; this.flat = !this.renderer.init(); this.applyQuality(true); this.resize(); };
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        const baked = IceLogic.bake(Math.random, 512);
        this.world = { n: baked.n, packs: { a: IceLogic.pack(baked.a, baked.n), b: IceLogic.pack(baked.b, baked.n, true) } };
        this.terrain = IceLogic.terrain(baked);

        const canvas = this.canvas = document.createElement('canvas');
        Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: '-3', pointerEvents: 'none' });
        document.body.appendChild(canvas);
        this.renderer = new IceRenderer(canvas, this.world);
        // No WebGL (or it was refused): the same flight as layered ridges on a 2D canvas.
        this.flat = !this.renderer.init();
        if (this.flat) this.ctx = canvas.getContext('2d');
        canvas.addEventListener('webglcontextlost', this.onLost);
        canvas.addEventListener('webglcontextrestored', this.onRestored);
        this.cockpit = new IceCockpit(this.host, this.terrain);
        this.cockpit.mount();
        window.addEventListener('resize', this.onResize);

        if (!this.host.params.thumb) {
            this.gpu.step = IceLogic.clamp((Number(this.host.storage.get('gpu')) || 0) - 1, 0, ICE_GPU.length - 1);
            // No GPU at all: start where it would end up, and stay there.
            if (this.renderer.software) Object.assign(this.gpu, { step: ICE_GPU.length - 1, gaveUp: true });
        }
        this.seedScene();
        this.applyQuality(true);
        this.resize();
        // A whole first frame before the stage calls it ready: cockpit and all.
        this.update(0);
        this.draw();
        this.lastTime = 0;
        this.animationId = requestAnimationFrame(t => this.frame(t));
    }

    stop() {
        this.isRunning = false;
        cancelAnimationFrame(this.animationId);
        window.removeEventListener('resize', this.onResize);
        this.canvas?.removeEventListener('webglcontextlost', this.onLost);
        this.canvas?.removeEventListener('webglcontextrestored', this.onRestored);
        this.renderer?.dispose();
        this.cockpit?.unmount();
        this.canvas?.remove();
        this.canvas = null;
    }

    get speed() { return ICE_CRUISE * this.config.speed * (this.host.reducedMotion ? 0.5 : 1); }

    // Already under way on the first frame: somewhere out on the ice, at
    // height, settled into the turn, the wingmen in their slots.
    seedScene() {
        const ground = this.terrain.height, flight = this.flight = IceLogic.flightStart(ground, this.config.clearance, Math.random());
        flight.x = (Math.random() - 0.5) * 2e5;
        flight.z = (Math.random() - 0.5) * 2e5;
        flight.y = ground(flight.x, flight.z) + this.config.clearance;
        for (let i = 0; i < 360; i++) IceLogic.flightStep(flight, 1 / 60, ground, this.speed, this.config.clearance, this.terrain.mountains);
        this.formation = flight.heading;
        this.day = ICE_TIMES[this.config.time] ?? 0.295;    // 'cycle' sets off just after sunrise
        this.weather = IceLogic.weatherStart(this.config.weather, Math.random);
        this.syncWingmen();
    }

    syncWingmen() {
        const want = Math.round(this.config.wingmen);
        while (this.wingmen.length > want) this.wingmen.pop();
        while (this.wingmen.length < want) {
            const slot = ICE_SLOTS[this.wingmen.length];
            this.wingmen.push({ slot, phase: Math.random() * 6.28, y: null, climb: 0, model: new Float32Array(16), x: 0, z: 0 });
        }
    }

    // ---- Quality ----------------------------------------------------------------
    wants(effect) { return this.host.quality.effects.includes(effect); }

    // The tier as the renderer's knobs. Shadows are compiled in or out of
    // the ground's shader, so they fade first and the swap is never seen.
    applyQuality(now = false) {
        const q = this.host.quality, shadows = this.wants('shadows') && ICE_GPU[this.gpu.step].shadows;
        this.shadowTarget = shadows ? 1 : 0;
        if (now) this.shadowFade = this.shadowTarget;
        const steps = shadows || this.shadowFade > 0 ? (q.tier === 'high' ? 10 : 6) : 0;
        if (!this.flat) {
            this.renderer.applyQuality({
                cells: q.density >= 0.85 ? 96 : q.density >= 0.5 ? 64 : 48,
                shadowSteps: steps,
                flakes: Math.round(9000 * q.density),
                sparkle: this.wants('sparkle'),
            });
        }
    }

    onQuality() { this.applyQuality(); }

    onScroll(x) { this.panTarget = (x - 0.5) * 0.6; }

    applySettings(config) {
        const before = this.config;
        this.config = config;
        if (before.weather !== config.weather && config.weather in IceLogic.WEATHER) this.weather.target = IceLogic.WEATHER[config.weather];
        this.syncWingmen();
        this.resize();
    }

    resize() {
        if (!this.canvas) return;
        const ratio = window.devicePixelRatio || 1;
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        const scale = ratio * (this.flat ? 1 : ICE_GPU[this.gpu.step].scale);
        const w = Math.max(1, Math.round(this.width * scale)), h = Math.max(1, Math.round(this.height * scale));
        if (this.flat) { this.canvas.width = w; this.canvas.height = h; } else this.renderer.resize(w, h);
        this.cockpit.layout(this.width, this.height, ratio, this.config);
    }

    // ---- Keys (declared in the catalog) ---------------------------------------------
    cycle(key, order, names) {
        this.config[key] = order[(order.indexOf(this.config[key]) + 1) % order.length];
        WP.settings.save(this.config);
        this.applySettings(this.config);
        return names[this.config[key]];
    }
    nextWeather() { return `Weather: ${this.cycle('weather', ICE_WEATHER_ORDER, ICE_WEATHER_NAMES)}`; }
    nextTime() { return `Time: ${this.cycle('time', ICE_TIME_ORDER, ICE_TIME_NAMES)}`; }
    nextView() { return this.cycle('cockpit', ICE_VIEWS, ICE_VIEW_NAMES); }
    nextRange() {
        this.config.radarRange = ICE_RANGES[(ICE_RANGES.indexOf(this.config.radarRange) + 1) % ICE_RANGES.length];
        WP.settings.save(this.config);
        return `Radar range: ${this.config.radarRange / 1000} km`;
    }

    // ---- A frame -------------------------------------------------------------------
    frame(now) {
        if (!this.isRunning) return;
        const gap = now - (this.lastTime || now), dtMs = Math.min(Math.max(gap, 0), 100);
        this.lastTime = now;
        this.watchGpu(gap);
        this.update(dtMs);
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
            if (gpu.late > 2500 && gpu.step < ICE_GPU.length - 1) this.gpuStep(1);
        } else {
            gpu.late = 0;
            gpu.calm += gap;
            if (gpu.calm > 90000 && gpu.step > 0 && !gpu.gaveUp) {
                gpu.gaveUp = true;
                this.gpuStep(-1);
            }
        }
    }

    gpuStep(by) {
        const gpu = this.gpu;
        gpu.step += by;
        gpu.late = gpu.calm = 0;
        gpu.pace = 0;
        this.host.storage.set('gpu', gpu.step);
        this.applyQuality();
        this.resize();
    }

    // The stage paused and came back: that gap says nothing about the GPU.
    onResume() { this.lastTime = 0; }

    update(dtMs) {
        const dt = dtMs / 1000, c = this.config, ground = this.terrain.height, flight = this.flight;
        this.seconds += dt;
        IceLogic.flightAdvance(flight, dtMs, ground, this.speed, c.clearance, this.terrain.mountains);

        // The hour.
        if (c.time === 'cycle') this.day = (this.day + dt / (c.dayMinutes * 60)) % 1;
        else if (c.time === 'clock') {
            const d = this.host.now();
            this.day = (d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600) / 24;
        } else {
            // A chosen hour is eased to, the short way round, so T doesn't cut.
            const gap = ((ICE_TIMES[c.time] - this.day + 1.5) % 1) - 0.5;
            this.day = (this.day + gap * (1 - Math.exp(-dt / 1.2)) + 1) % 1;
        }

        IceLogic.weatherStep(this.weather, dt, c.weather, Math.random, c.snowOften);
        const air = this.air = IceLogic.air(this.weather.level);

        // The wind: along the drifts, gusting harder as the snow thickens.
        const gust = 5 + 16 * this.weather.level + 3 * Math.sin(this.seconds / 6.3), bearing = ICE_WIND + 0.25 * Math.sin(this.seconds / 23);
        this.wind = [Math.sin(bearing) * gust, -1.3 - this.weather.level, Math.cos(bearing) * gust];
        const box = this.renderer.box;
        for (let i = 0; i < 3; i++) this.drift[i] = (this.drift[i] + this.wind[i] * dt) % box[i];
        this.cloudDrift[0] += dt * 0.0016;
        this.cloudDrift[1] += dt * 0.0007;

        this.pan += (this.panTarget - this.pan) * (1 - Math.exp(-dt / 0.35));
        const fadeStep = dt / 1.5;
        if (this.shadowFade !== this.shadowTarget) {
            this.shadowFade = IceLogic.clamp(this.shadowFade + Math.sign(this.shadowTarget - this.shadowFade) * fadeStep, 0, 1);
            if (this.shadowFade === 0) this.applyQuality();    // faded out: drop them from the shader
        }

        // The wingmen hold their slots off a heading that trails ours, so
        // they swing wide through a turn, and each rides its own ground.
        let turn = (flight.heading - this.formation) % (2 * Math.PI);
        if (turn > Math.PI) turn -= 2 * Math.PI;
        if (turn < -Math.PI) turn += 2 * Math.PI;
        this.formation += turn * (1 - Math.exp(-dt / 1.0));
        const sin = Math.sin(this.formation), cos = Math.cos(this.formation);
        for (const w of this.wingmen) {
            const ox = w.slot.x + 7 * Math.sin(this.seconds / 5.3 + w.phase), oz = w.slot.z + 13 * Math.sin(this.seconds / 8.1 + w.phase * 2);
            w.x = flight.x + sin * oz + cos * ox;
            w.z = flight.z + cos * oz - sin * ox;
            const floor = ground(w.x, w.z), lead = ground(w.x + Math.sin(flight.heading) * 90, w.z + Math.cos(flight.heading) * 90);
            const target = Math.max(floor, lead) + c.clearance * 0.8 + w.slot.y;
            if (w.y === null) w.y = target;
            const before = w.y;
            w.y += (target - w.y) * (1 - Math.exp(-dt / 0.6));
            w.y = Math.max(w.y, floor + 4);
            if (dt > 0) w.climb += ((w.y - before) / dt - w.climb) * (1 - Math.exp(-dt / 0.4));
        }
    }

    // A far light every few kilometres: a survey beacon blinking red, and
    // now and then a station's row of lit windows under a white strobe.
    beacons(out, contacts, bright) {
        const SIZE = 2600, flight = this.flight, cx = Math.floor(flight.x / SIZE), cz = Math.floor(flight.z / SIZE);
        if (this.beaconCache.size > 400) this.beaconCache.clear();
        for (let dz = -3; dz <= 3; dz++) {
            for (let dx = -3; dx <= 3; dx++) {
                const key = (cx + dx) + ',' + (cz + dz);
                let b = this.beaconCache.get(key);
                if (b === undefined) {
                    const h = k => { const s = Math.sin((cx + dx) * 127.1 + (cz + dz) * 311.7 + k * 74.7) * 43758.5453; return s - Math.floor(s); };
                    b = null;
                    if (h(0) < 0.3) {
                        const x = (cx + dx + 0.15 + 0.7 * h(1)) * SIZE, z = (cz + dz + 0.15 + 0.7 * h(2)) * SIZE;
                        b = { x, z, y: this.terrain.height(x, z), phase: h(3) * 2, station: h(4) < 0.3, turn: h(5) * 6.28 };
                    }
                    this.beaconCache.set(key, b);
                }
                if (!b) continue;
                const rx = b.x - flight.x, rz = b.z - flight.z, ry = b.y - flight.y;
                contacts.push({ x: rx, z: rz, kind: b.station ? 'station' : 'beacon' });
                const blink = (this.seconds + b.phase) % 1.9 < 0.14;
                if (b.station) {
                    for (let i = -2; i <= 2; i++) out.push([rx + Math.sin(b.turn) * i * 9, ry + 3, rz + Math.cos(b.turn) * i * 9, 1.0 * bright, 0.72 * bright, 0.35 * bright, 4]);
                    if (blink) out.push([rx, ry + 24, rz, 3, 3, 3.2, 9]);
                } else if (blink) out.push([rx, ry + 14, rz, 3.2, 0.3, 0.2, 8]);
                else out.push([rx, ry + 14, rz, 0.5 * bright, 0.04, 0.03, 5]);
            }
        }
    }

    draw() {
        const c = this.config, flight = this.flight, air = this.air, scene = this.scene;
        const sky = IceLogic.bodies(this.day), light = IceLogic.light(sky.sunEl, air.overcast);
        const night = 1 - light.day, level = this.weather.level;
        const still = this.host.reducedMotion;

        // The head: with the craft, a touch nose-down to keep the ground in view, and shaken by the weather.
        const shake = still ? 0 : (0.004 + 0.012 * level) * c.bank;
        const cam = scene.cam;
        cam.x = flight.x; cam.y = flight.y; cam.z = flight.z;
        cam.heading = flight.heading + this.pan;
        cam.pitch = flight.pitch * 0.6 - 0.045 + shake * Math.sin(this.seconds * 7.3) * Math.sin(this.seconds * 1.9);
        cam.roll = still ? 0 : flight.roll * c.bank + shake * Math.sin(this.seconds * 5.1 + 1) * Math.sin(this.seconds * 1.3);
        const aspect = this.width / this.height;
        let tanY = Math.tan(c.fov / 2 * IceLogic.RAD);
        if (aspect < 1) tanY = Math.min(1.25, Math.max(tanY, Math.tan(27 * IceLogic.RAD) / aspect));   // a phone held upright still sees 54° across
        scene.tanY = tanY;

        // The lamp of the hour: the sun, then the big moon (or the small one, or starlight).
        const useSun = sky.sunEl > -4.5;
        const moon = sky.moons[0][1] > 0.02 ? sky.moons[0] : sky.moons[1][1] > 0.02 ? sky.moons[1] : [0.3, 0.9, 0.3];
        const moonUp = IceLogic.smooth(0.0, 0.2, moon[1]) * IceLogic.smooth(-4.5, -9, sky.sunEl) * (1 - 0.8 * air.overcast);
        scene.light = light;
        scene.sunDir = sky.sun;
        scene.lightDir = useSun ? sky.sun : moon;
        const sunFade = IceLogic.smooth(-4.5, -2.5, sky.sunEl);
        scene.lightCol = useSun ? light.sun.map(v => v * sunFade) : [0.085 * moonUp, 0.11 * moonUp, 0.17 * moonUp];
        scene.moons = sky.moons;
        scene.moonCol = [0.36 + 1.1 * night, 0.37 + 1.1 * night, 0.4 + 1.15 * night].map(v => v * (1 - 0.9 * air.overcast));
        scene.stars = light.stars;
        scene.aurora = c.aurora ? light.stars * (0.3 + 0.7 * (0.5 + 0.5 * Math.sin(this.seconds / 47 + 1))) : 0;
        scene.time = this.seconds;
        scene.fog = 1 / air.visibility;
        scene.shadow = this.shadowFade * (1 - air.overcast);
        scene.sparkle = light.day * (1 - air.overcast);
        scene.cloudShade = 0.42 * light.day * (1 - air.overcast);
        const cover = Math.max(air.overcast, 0.3 + 0.22 * Math.sin(this.seconds / 97 + 2));
        scene.cloud = [IceLogic.mix(0.66, 0.24, cover), 0.17, 0.9 + 0.08 * air.overcast];
        scene.cloudOff = this.cloudDrift;
        scene.sunLit = sunFade;
        scene.halo = IceLogic.smooth(0.03, 0.2, level) * (1 - IceLogic.smooth(0.3, 0.6, level)) + 0.14 * (1 - IceLogic.smooth(6, 16, sky.sunEl));
        const lamps = this.lamps = c.lamps ? Math.max(night, IceLogic.smooth(0.45, 0.8, level) * 0.6) : 0;
        scene.lamp = [1.5 * lamps, 1.4 * lamps, 1.15 * lamps];
        const dip = flight.pitch * 0.6 - 0.16;       // the lamps point a little below the nose
        scene.lampAim = [Math.sin(flight.heading) * Math.cos(dip), Math.sin(dip), Math.cos(flight.heading) * Math.cos(dip)];
        scene.bounce = light.fill.map((v, i) => v * 0.7 + scene.lightCol[i] * 0.3 * Math.max(scene.lightDir[1], 0));
        scene.burn = 3.2;
        scene.flakes = air.flakes;
        scene.flakeCol = light.fill.map((v, i) => v * 1.7 + scene.lightCol[i] * 0.3);
        scene.streak = still ? 1 / 120 : 1 / 42;
        const sp = Math.sin(flight.pitch), cp = Math.cos(flight.pitch), v = this.speed;
        const vel = [Math.sin(flight.heading) * cp * v, sp * v, Math.cos(flight.heading) * cp * v];
        scene.snowVel = [this.wind[0] - vel[0], this.wind[1] - vel[1], this.wind[2] - vel[2]];
        const box = this.renderer.box, at = [flight.x, flight.y, flight.z];
        scene.snowShift = at.map((p, i) => (((p - this.drift[i]) % box[i]) + box[i]) % box[i]);

        // Tiles: the terrain's six, the wind's ridges and grain (light only), and the cloud shadows.
        if (!scene.layers.length) {
            for (const l of IceLogic.LAYERS) scene.layers.push([l.cos / l.size, l.sin / l.size, -l.sin / l.size, l.cos / l.size]);
            const ws = Math.sin(ICE_WIND), wc = Math.cos(ICE_WIND);
            scene.layers.push([wc / 34, -ws / 34, ws / 150, wc / 150], [0.92 / 5.3, 0.39 / 5.3, -0.39 / 5.3, 0.92 / 5.3], [1 / 5200, 0, 0, 1 / 5200, 0, 0]);
        }
        scene.layers[8][4] = this.seconds * 0.0021;
        scene.layers[8][5] = this.seconds * 0.0009;

        // Craft and lights, from the camera.
        scene.craft.length = 0;
        scene.lights.length = 0;
        this.contacts.length = 0;
        const dim = 0.25 + 0.75 * night;
        for (const w of this.wingmen) {
            const heading = flight.heading + 0.25 * flight.turn, pitch = Math.atan2(w.climb, v), roll = flight.roll * 1.15 + 0.07 * Math.sin(this.seconds / 2.9 + w.phase);
            const sh = Math.sin(heading), ch = Math.cos(heading), spp = Math.sin(pitch), cpp = Math.cos(pitch), sr = Math.sin(roll), cr = Math.cos(roll);
            const f = [sh * cpp, spp, ch * cpp], r0 = [ch, 0, -sh];
            const u0 = [f[1] * r0[2] - f[2] * r0[1], f[2] * r0[0] - f[0] * r0[2], f[0] * r0[1] - f[1] * r0[0]];
            const r = r0.map((x, i) => x * cr - u0[i] * sr), u = u0.map((x, i) => x * cr + r0[i] * sr);
            const t = [w.x - flight.x, w.y - flight.y, w.z - flight.z];
            w.model.set([r[0], r[1], r[2], 0, u[0], u[1], u[2], 0, f[0], f[1], f[2], 0, t[0], t[1], t[2], 1]);
            scene.craft.push(w.model);
            this.contacts.push({ x: t[0], z: t[2], kind: 'friend' });
            const place = p => [t[0] + r[0] * p[0] + u[0] * p[1] + f[0] * p[2], t[1] + r[1] * p[0] + u[1] * p[1] + f[1] * p[2], t[2] + r[2] * p[0] + u[2] * p[1] + f[2] * p[2]];
            for (const engine of IceCraft.engines) scene.lights.push([...place(engine), 1.5, 0.62, 0.2, 2.6]);
            if (night > 0.2 || level > 0.3) {
                scene.lights.push([...place([-2.7, 0.05, -1.4]), 1.6 * dim, 0.1, 0.08, 1.3], [...place([2.7, 0.05, -1.4]), 0.1, 1.5 * dim, 0.3, 1.3]);
                if ((this.seconds + w.phase) % 1.4 < 0.07) scene.lights.push([...place([0, 0.75, -1.8]), 4, 4, 4.4, 3.2]);
            }
        }
        if (c.beacons) this.beacons(scene.lights, this.contacts, dim);

        if (this.flat) this.drawFlat(scene, light);
        else if (!this.renderer.lost) this.renderer.render(scene);

        this.cockpit.update({
            config: c, seconds: this.seconds, flight, speed: v, light, night, lamps, level, flakes: air.flakes,
            contacts: this.contacts, sway: still ? 0 : 1, pan: this.pan, horizon: light.horizon,
        });
    }

    // Without WebGL: the same flight as ridgelines, back to front, each a
    // slice of the real terrain, fading into the day's haze.
    drawFlat(scene, light) {
        const ctx = this.ctx, w = this.canvas.width, h = this.canvas.height, cam = scene.cam, ground = this.terrain.height;
        const tone = c => `rgb(${c.map(v => Math.round(255 * Math.pow(1 - Math.exp(-v), 0.4545))).join(',')})`;
        const gradient = ctx.createLinearGradient(0, 0, 0, h * 0.6);
        gradient.addColorStop(0, tone(light.zenith));
        gradient.addColorStop(1, tone(light.horizon));
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);
        const tanX = scene.tanY * w / h, horizon = h * (0.5 + cam.pitch / scene.tanY / 2), rows = 34, cols = 40;
        ctx.translate(w / 2, horizon);
        ctx.rotate(cam.roll);
        const snow = light.fill.map((v, i) => 0.92 * (v + scene.lightCol[i] * 0.5));
        for (let row = rows - 1; row >= 0; row--) {
            const d = 40 * Math.pow(1.2, row), fog = 1 - Math.exp(-d * scene.fog * 1.4);
            ctx.fillStyle = tone(IceLogic.mix3(snow.map(v => v * (0.82 + 0.18 * (row % 2))), light.horizon, fog));
            ctx.beginPath();
            ctx.moveTo(-w, h * 2);
            for (let col = 0; col <= cols; col++) {
                const side = (col / cols * 2 - 1) * 1.3, bearing = cam.heading + Math.atan(side * tanX);
                const reach = d * Math.hypot(1, side * tanX);
                const y = ground(cam.x + Math.sin(bearing) * reach, cam.z + Math.cos(bearing) * reach) - cam.y;
                ctx.lineTo(side * w / 2, -y / d / scene.tanY * h / 2);
            }
            ctx.lineTo(w, h * 2);
            ctx.fill();
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
}
