// Fresh Tracks (SPEC §10.39): a ski run that never ends. A lead rider and
// their friends down a mountain stitched from groomed pistes, powder, glades,
// a half-pipe, a park, rollers, a frozen lake, a cliff, a gully, a cat track
// and a hut; strangers, a ski school and a chairlift; tracks, spray, long
// shadows, snow that comes and goes; a floodlit run at night.
//
//   ski-logic.js    the mountain, the riders, the camera, sky and weather (pure)
//   ski-models.js   the ground's mesh, trees, figures and props, as triangles (pure)
//   ski-gl.js       the view, in WebGL
//   ski-run.js      this: the manager that runs it
//
// Cheap by construction (SPEC §4.8): the GPU draws the world. The main thread
// steps a dozen riders, sorts a few thousand trees into batches, poses the
// figures near the camera and builds a chunk of mesh now and then.

const SKI_TIMES = { dawn: 0.268, day: 0.47, dusk: 0.735, night: 0.0 };
const SKI_TIME_ORDER = ['cycle', 'clock', 'dawn', 'day', 'dusk', 'night'];
const SKI_TIME_NAMES = { cycle: 'the day goes round', clock: 'by your clock', dawn: 'dawn', day: 'midday', dusk: 'dusk', night: 'night, under the floodlights' };
const SKI_WEATHER_ORDER = ['auto', 'clear', 'flurries', 'snow', 'fog'];
const SKI_WEATHER_NAMES = { auto: 'comes and goes', clear: 'clear', flurries: 'flurries', snow: 'snowing', fog: 'fog on the hill' };
const SKI_CAMERA_NAMES = { follow: 'Following behind', front: 'From in front', diorama: 'From on high', auto: 'The director decides' };
const SKI_STEER = { a: -1, arrowleft: -1, d: 1, arrowright: 1 };
// The other keys a hand holds: tuck (in the air, a front flip), brake (a backflip), jump (held longer, a bigger one; in the air, a grab).
const SKI_HOLD = { w: 'tuck', arrowup: 'tuck', s: 'brake', arrowdown: 'brake', j: 'jump', ' ': 'jump' };
const SKI_BRAKE = [0.4, 1.2];     // a tap of the brake checks speed by that much; held for that many seconds, it is a stop
const SKI_HINT = {
    keys: '⛷️ Yours: ←→ carve · ↑ tuck · ↓ brake (hold to stop) · J or Space jump (hold for more) · in the air ←→ spin, ↑↓ flip, J grab',
    touch: '⛷️ Yours: drag ←→ to carve, up to tuck, down to brake · tap to jump · in the air drag to spin and flip, tap to grab',
};
const SKI_TAP = 0.6;            // seconds a key counts as held when only its press was seen (longer than a keyboard's repeat delay)
// What a struggling GPU gives up, in turn: shadows, then resolution and far trees.
const SKI_GPU = [{ scale: 1, shadows: true, trees: 1 }, { scale: 1, shadows: false, trees: 1 }, { scale: 0.75, shadows: false, trees: 0.8 }, { scale: 0.55, shadows: false, trees: 0.6 }, { scale: 0.4, shadows: false, trees: 0.4 }];
const SKI_AHEAD = 48, SKI_BEHIND = 12;         // chunks of ground kept in front of the camera and behind it
const SKI_SEA = 380;            // metres below the camera that the valley's cloud lies

class SkiRunAnimationManager {
    constructor(host) {
        this.host = host;
        this.config = WP.settings.load();
        this.isRunning = false;
        this.animationId = null;
        this.lastTime = 0;
        this.seconds = 0;
        this.pan = 0;            // Android home-screen offset as a turn of the head, eased
        this.panTarget = 0;
        this.shadowFade = 0;
        // The stage's governor times this page's own work, and the GPU's is none
        // of it, so the frames are watched here (SKI_GPU). The step is
        // remembered, and each start tries one better.
        this.gpu = { step: 0, late: 0, calm: 0, pace: 0, gaveUp: false };
        this.chunks = new Map();
        this.trails = new Map();
        this.held = new Map();
        this.hold = new Map();
        this.drag = null;
        this.dragV = 0;
        this.braking = 0;
        this.hinted = false;
        this.input = { steer: 0, tuck: 0, brake: 0, jump: false };
        this.stack = new SkiStack();
        this.moving = new SkiSoup(16384);
        this.puffs = new SkiSprites(1400);
        this.glows = new SkiSprites(160);
        this.tracks = { data: new Float32Array(16000 * 12), n: 0 };
        this.scene = { cam: {}, chunks: [], batches: [], lamps: [], moving: this.moving, puffs: this.puffs, glows: this.glows, tracks: this.tracks };
        this.drift = [0, 0, 0];
        this.cloudDrift = [0, 0];
        this.onResize = () => this.resize();
        this.onKey = event => {
            const name = event.key.toLowerCase(), steer = SKI_STEER[name], hold = SKI_HOLD[name];
            if (!steer && !hold) return;
            const map = steer ? this.held : this.hold, what = steer || hold;
            if (event.type === 'keyup') map.delete(what);
            else if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.target.closest?.('input, select, textarea')) { map.set(what, Infinity); this.hint('keys'); }
        };
        this.onLetGo = () => { this.held.clear(); this.hold.clear(); this.drag = null; this.dragV = 0; };
        this.onLost = event => { event.preventDefault(); this.renderer.lost = true; };
        // A lost graphics context takes everything on the GPU with it: build the view again.
        this.onRestored = () => {
            this.renderer.lost = false;
            this.scene.treeAt = null;
            for (const c of this.chunks.values()) c.glGround = c.glProps = null;
            this.flat = !this.renderer.init();
            this.applyQuality(true);
            this.resize();
        };
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        const canvas = this.canvas = document.createElement('canvas');
        Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: '-1', pointerEvents: 'none' });
        document.body.appendChild(canvas);
        this.seedScene();
        const fields = this.world.course.fields;
        this.renderer = new SkiRenderer(canvas, { n: fields.n, ...SkiLogic.pack(fields.a, fields.n) });
        // No WebGL (or it was refused): the same run, drawn flat on a 2D canvas.
        this.flat = !this.renderer.init();
        if (this.flat) this.ctx = canvas.getContext('2d');
        canvas.addEventListener('webglcontextlost', this.onLost);
        canvas.addEventListener('webglcontextrestored', this.onRestored);
        window.addEventListener('resize', this.onResize);
        if (!this.host.params.thumb) {
            document.addEventListener('keydown', this.onKey);
            document.addEventListener('keyup', this.onKey);
            window.addEventListener('blur', this.onLetGo);
            document.addEventListener('visibilitychange', this.onLetGo);
            // A drag steers from where it began (across: carve; up: tuck; down: brake; in the air the same way spins and flips);
            // a tap sends it, and in the air is a grab.
            let fromX = 0, fromY = 0;
            const steer = (x, y) => {
                if (!this.config.touch) return;
                const reach = Math.min(this.width, this.height) * 0.25;
                this.drag = SkiLogic.clamp((x - fromX) / reach, -1, 1);
                this.dragV = SkiLogic.clamp((y - fromY) / reach, -1, 1);
                this.hint('touch');
            };
            const tap = () => {
                if (!this.config.touch) return;
                this.hint('touch');
                if (this.world.riders[0].air) this.hold.set('jump', this.seconds + 0.45); else this.sendIt(false);
            };
            this.stopGestures = this.host.gestures({ tap, start: (x, y) => { fromX = x; fromY = y; steer(x, y); }, move: steer, end: () => { this.drag = null; this.dragV = 0; } });
            this.gpu.step = SkiLogic.clamp((Number(this.host.storage.get('gpu')) || 0) - 1, 0, SKI_GPU.length - 1);
            // No GPU at all: start where it would end up, and stay there.
            if (this.renderer.software) Object.assign(this.gpu, { step: SKI_GPU.length - 1, gaveUp: true });
        }
        this.applyQuality(true);
        this.resize();
        // A whole first frame before the stage calls it ready.
        this.update(0);
        this.draw();
        this.lastTime = 0;
        this.animationId = requestAnimationFrame(t => this.frame(t));
    }

    stop() {
        this.isRunning = false;
        cancelAnimationFrame(this.animationId);
        window.removeEventListener('resize', this.onResize);
        document.removeEventListener('keydown', this.onKey);
        document.removeEventListener('keyup', this.onKey);
        window.removeEventListener('blur', this.onLetGo);
        document.removeEventListener('visibilitychange', this.onLetGo);
        this.stopGestures?.();
        this.canvas?.removeEventListener('webglcontextlost', this.onLost);
        this.canvas?.removeEventListener('webglcontextrestored', this.onRestored);
        this.renderer?.dispose();
        this.canvas?.remove();
        this.canvas = null;
    }

    // ---- The mountain and who is on it ------------------------------------------------
    worldConfig() {
        const c = this.config;
        return { speed: c.speed * (this.host.reducedMotion ? 0.6 : 1), tricks: c.tricks, wipeouts: c.wipeouts, friends: c.friends, others: c.others, wildlife: c.wildlife, kinds: [c.leadGear, c.friend1Gear, c.friend2Gear, c.friend3Gear] };
    }

    // Already under way on the first frame: a few seconds down the run, tracks behind everyone.
    seedScene() {
        const c = this.config;
        for (const chunk of this.chunks.values()) this.renderer?.release(chunk);
        this.chunks.clear();
        this.trails.clear();
        this.world = SkiLogic.world(Math.floor(Math.random() * 2147483647), this.worldConfig(), { steep: c.steep, sections: c.sections });
        this.cam = SkiLogic.camera();
        this.dress();
        this.pool = { n: 0, cap: 1400, d: new Float32Array(1400 * 12) };
        for (let i = 0; i < 420; i++) { SkiLogic.worldStep(this.world, 1 / 60, null); this.trace(); this.world.events.length = 0; }
        this.day ??= SKI_TIMES[c.time] ?? 0.37;         // 'cycle' sets off mid-morning
        this.weather ??= SkiLogic.weatherStart(c.weather, Math.random);
        this.kc = null;
    }

    // Who wears what.
    dress() {
        const c = this.config;
        this.looks = [['lead', 0.31], ['friend1', 0.52], ['friend2', 0.73], ['friend3', 0.94]].map(([key, v]) => SkiModels.look(c[key + 'Gear'], c[key + 'Who'] === 'woman', c[key + 'Kit'], v));
        this.world.riders.forEach((r, i) => { r.kind = this.looks[i].kind; });
    }

    lookOf(r) {
        const i = this.world.riders.indexOf(r);
        if (i >= 0) return this.looks[i];
        r.who ??= r.role === 'school' ? SkiModels.look('ski', r.id % 2 === 0, 'ember', 0.2) : r.role === 'kid' ? SkiModels.look('ski', r.id % 2 === 0, SkiModels.KIT_ORDER[r.id % 8], r.id * 0.37) : { ...SkiModels.anyone(r.id * 0.173), kind: r.kind };
        return r.who;
    }

    // ---- Quality ----------------------------------------------------------------------
    wants(effect) { return this.host.quality.effects.includes(effect); }

    applyQuality(now = false) {
        const q = this.host.quality, step = SKI_GPU[this.gpu.step], shadows = this.wants('shadows') && step.shadows;
        this.shadowTarget = shadows ? 1 : 0;
        if (now) this.shadowFade = this.shadowTarget;
        this.treeQ = q.density * step.trees;
        // How near a rider must be to be drawn in full, and how far off the chairs still carry anybody.
        this.figNear = q.tier === 'high' ? 30 : 18;
        this.figFar = 60 + 90 * q.density;
        // How fine the ground's grid is: all of it on High, thinner on Medium, thinner still on Low or for a GPU that is struggling.
        this.groundLevel = Math.min(2, (q.tier === 'high' ? 0 : q.tier === 'medium' ? 1 : 2) + (this.gpu.step >= 3 ? 1 : 0));
        this.pool.cap = Math.round(1400 * q.density);
        if (!this.flat) this.renderer.applyQuality({ shadows: shadows || this.shadowFade > 0 ? (q.tier === 'high' ? 2048 : 1024) : 0, sparkle: this.wants('sparkle'), flakes: Math.round(7000 * q.density) });
    }

    onQuality() { this.applyQuality(); }
    onScroll(x) { this.panTarget = (x - 0.5) * 0.5; }
    // The stage paused and came back: that gap says nothing about the GPU.
    onResume() { this.lastTime = 0; }

    applySettings(config) {
        const before = this.config;
        this.config = config;
        if (!config.touch) { this.drag = null; this.dragV = 0; }
        if (before.steep !== config.steep || String(before.sections) !== String(config.sections)) this.seedScene();
        else {
            Object.assign(this.world.cfg, this.worldConfig());
            SkiLogic.setFriends(this.world, config.friends, this.world.cfg.kinds);
            this.dress();
        }
        this.resize();
    }

    resize() {
        if (!this.canvas) return;
        const ratio = window.devicePixelRatio || 1;
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        const scale = ratio * (this.flat ? 1 : SKI_GPU[this.gpu.step].scale);
        const w = Math.max(1, Math.round(this.width * scale)), h = Math.max(1, Math.round(this.height * scale));
        if (this.flat) { this.canvas.width = w; this.canvas.height = h; } else this.renderer.resize(w, h);
    }

    // ---- Keys (declared in the catalog) ---------------------------------------------------
    cycle(key, order, names) {
        this.config[key] = order[(order.indexOf(this.config[key]) + 1) % order.length];
        WP.settings.save(this.config);
        this.applySettings(this.config);
        return names[this.config[key]];
    }
    nextCamera() { return this.cycle('camera', SkiLogic.CAMERAS, SKI_CAMERA_NAMES); }
    nextTime() { return `Time: ${this.cycle('time', SKI_TIME_ORDER, SKI_TIME_NAMES)}`; }
    nextWeather() { return `Weather: ${this.cycle('weather', SKI_WEATHER_ORDER, SKI_WEATHER_NAMES)}`; }
    swapGear() { return this.cycle('leadGear', ['ski', 'board'], { ski: 'On skis', board: 'On a board' }); }
    sendIt(badly) { return SkiLogic.sendIt(this.world, badly) ? (badly ? 'Sending it… badly' : 'Sending it') : 'Not here'; }
    // J or Space, by way of the catalog. Held here, the hand does it (a longer hold, a bigger jump); forwarded by the player
    // there is only the press: a jump from the snow, a moment's grab in the air.
    jumpKey(shift) {
        if (shift) return this.sendIt(true);
        if (this.hold.get('jump') === Infinity) return undefined;
        this.hint('keys');
        if (this.world.riders[0].air) { this.hold.set('jump', this.seconds + 0.45); return undefined; }
        return this.sendIt(false);
    }
    // The first time a hand goes on, what it can do: once a visit.
    hint(by) {
        if (this.hinted || this.host.params.thumb) return;
        this.hinted = true;
        this.host.toast?.(SKI_HINT[by], 6000);
    }
    // A carving key's press, by way of the catalog. With focus here the key's
    // own events already hold it; forwarded by the player there is only the
    // press, so it counts for a moment, and a held key's repeats keep it down.
    nudge(key) {
        const name = key.toLowerCase(), steer = SKI_STEER[name], hold = SKI_HOLD[name];
        if (steer && this.held.get(steer) !== Infinity) this.held.set(steer, this.seconds + SKI_TAP);
        if (hold && hold !== 'jump' && this.hold.get(hold) !== Infinity) this.hold.set(hold, this.seconds + SKI_TAP);
        if (steer || hold) this.hint('keys');
    }
    // What the hands are asking for this frame, or null with hands off.
    hand() {
        for (const map of [this.held, this.hold]) for (const [what, until] of map) if (until < this.seconds) map.delete(what);
        // A brake key checks speed at first, and held on, comes to a stop.
        this.braking = this.hold.has('brake') ? this.braking + (this.seconds - (this.handAt ?? this.seconds)) : 0;
        this.handAt = this.seconds;
        if (!this.held.size && !this.hold.size && this.drag === null) return null;
        let steer = this.drag || 0;
        for (const s of this.held.keys()) steer += s;
        const up = Math.max(0, -this.dragV - 0.2) / 0.8, down = Math.max(0, this.dragV - 0.2) / 0.8;
        const brake = this.hold.has('brake') ? SkiLogic.mix(SKI_BRAKE[0], 1, SkiLogic.clamp(this.braking / SKI_BRAKE[1], 0, 1)) : 0;
        Object.assign(this.input, { steer, tuck: Math.max(this.hold.has('tuck') ? 1 : 0, up), brake: Math.max(brake, down), jump: this.hold.has('jump') });
        return this.input;
    }

    // ---- A frame -----------------------------------------------------------------------------
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
            if (gpu.late > 2500 && gpu.step < SKI_GPU.length - 1) this.gpuStep(1);
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
        const dt = dtMs / 1000, c = this.config, W = this.world, still = this.host.reducedMotion;
        this.seconds += dt;
        // The riders, in steps of a sixtieth; tracks laid and events answered as they go.
        let left = dt;
        const input = this.hand();
        while (left > 1e-9) {
            const step = Math.min(left, 1 / 60);
            SkiLogic.worldStep(W, step, input);
            this.trace();
            left -= step;
        }
        W.course.trim(W.riders[0].z);
        this.answer();
        SkiLogic.cameraStep(this.cam, W, dt, c.camera, still);

        // The hour.
        if (c.time === 'cycle') this.day = (this.day + dt / (c.dayMinutes * 60)) % 1;
        else if (c.time === 'clock') {
            const d = this.host.now();
            this.day = (d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600) / 24;
        } else {
            // A chosen hour is eased to, the short way round, so T doesn't cut.
            const gap = ((SKI_TIMES[c.time] - this.day + 1.5) % 1) - 0.5;
            this.day = (this.day + gap * (1 - Math.exp(-dt / 1.2)) + 1) % 1;
        }
        SkiLogic.weatherStep(this.weather, dt, c.weather, Math.random, c.snowOften);
        this.air = SkiLogic.air(this.weather.level, this.weather.mist);
        const gust = 3 + 9 * this.weather.level + 2 * Math.sin(this.seconds / 6.3), bearing = 2.2 + 0.3 * Math.sin(this.seconds / 23);
        this.wind = [Math.sin(bearing) * gust, -1.1 - 0.8 * this.weather.level, Math.cos(bearing) * gust];
        const box = this.renderer.box;
        for (let i = 0; i < 3; i++) this.drift[i] = (this.drift[i] + this.wind[i] * dt) % box[i];
        this.cloudDrift[0] += dt * 0.0016;
        this.cloudDrift[1] += dt * 0.0007;
        this.pan += (this.panTarget - this.pan) * (1 - Math.exp(-dt / 0.35));
        if (this.shadowFade !== this.shadowTarget) {
            this.shadowFade = SkiLogic.clamp(this.shadowFade + Math.sign(this.shadowTarget - this.shadowFade) * dt / 1.5, 0, 1);
            if (this.shadowFade === 0) this.applyQuality();    // faded out: drop them from the shaders
        }
        this.spray(dt);
        this.land();
    }

    // Everybody who moves, for drawing and for tracks.
    everyone() {
        const W = this.world;
        return W.school ? W.riders.concat(W.others, W.school.lead, W.school.kids) : W.riders.concat(W.others);
    }

    // A point on each rider's track for every half metre they have come.
    trace() {
        const W = this.world, C = W.course;
        for (const r of this.everyone()) {
            let t = this.trails.get(r.id);
            if (!t) { t = { cap: r.role === 'lead' || r.role === 'friend' ? 420 : r.role === 'kid' ? 90 : 170, pts: [], last: [r.x, r.z], board: r.kind === 'board' ? 1 : 0, seen: 0 }; this.trails.set(r.id, t); }
            t.seen = this.seconds;
            if (Math.hypot(r.x - t.last[0], r.z - t.last[1]) < 0.55) continue;
            const dx = r.x - t.last[0], dz = r.z - t.last[1], l = Math.hypot(dx, dz) || 1, s = C.find(r.z), down = r.fall && r.fall.phase === 'tumble';
            const on = !r.air && !r.afoot && (!r.fall || down) && !(r.rail && r.y > C.height(r.x, r.z) + 0.1);
            // Deep in powder, faint on a groomed piste, hardly there on ice; wider and deeper through a turn.
            const depth = (s.type === 'lake' ? 0.14 : 0.3 + 0.32 * s.T.rough) + 0.22 * Math.abs(r.lean);
            // Skis that are turned across the way they are going leave a smear as wide as they are long across it, and softer: carved, two thin lines.
            const smear = Math.abs(Math.sin(r.skid || 0));
            const pt = { x: r.x, y: r.y, z: r.z, rx: dz / l, rz: -dx / l, w: down ? 0.55 : (t.board ? 0.2 + 0.22 * Math.abs(r.lean) : (r.size ? 0.2 : 0.26) + 0.06 * Math.abs(r.lean)) + (t.board ? 0.6 : 0.85) * smear, a: on ? Math.min(0.85, depth) * (r.size ? 0.7 : 1) * (down ? 0.5 : 1) * (1 - 0.45 * (this.air ? this.air.overcast : 0)) / (1 + 1.6 * smear) : 0 };
            t.board = r.kind === 'board' ? 1 : 0;
            pt.k = down ? 1 : Math.max(t.board, SkiLogic.smooth(0.08, 0.45, smear));
            t.pts.push(pt);
            if (t.pts.length > t.cap) t.pts.shift();
            t.last = [r.x, r.z];
        }
    }

    // ---- Spray, smoke and what answers the world's events ------------------------------------
    // One puff: where, how fast, how long it lasts, how big it starts and grows, how solid, what of (0 snow, 1 smoke).
    puff(x, y, z, vx, vy, vz, life, size, grow, alpha, kind = 0) {
        const p = this.pool;
        if (p.n >= p.cap) return;
        p.d.set([x, y, z, vx, vy, vz, 0, life, size, grow, alpha, kind], p.n++ * 12);
    }

    answer() {
        const W = this.world, R = Math.random;
        for (const e of W.events) {
            if (e.type === 'land') { const n = Math.round(4 + 18 * e.power); for (let i = 0; i < n; i++) { const a = R() * 6.28, v = (1 + 3 * R()) * e.power; this.puff(e.x, e.y + 0.1, e.z, Math.sin(a) * v, 0.6 + 2.2 * R() * e.power, Math.cos(a) * v + 3, 0.5 + 0.6 * R(), 0.3, 2.2, 0.4); } }
            if (e.type === 'wipe') for (let i = 0; i < 26; i++) { const a = R() * 6.28, v = 1 + 4 * R(); this.puff(e.x, e.y + 0.3, e.z, Math.sin(a) * v, 1 + 3 * R(), Math.cos(a) * v + 5, 0.8 + 0.8 * R(), 0.5, 2.6, 0.5); }
            // A trick by hand, called as it lands.
            if (e.type === 'stomp') this.stomped = e;
            if (e.type === 'stomp' && !this.host.params.thumb) this.host.toast?.(e.clean ? `🤘 ${e.name}` : e.down ? `${e.name}… not quite` : `${e.name}, just about`, 1800);
            if (e.type === 'shake') for (let i = 0; i < 12; i++) this.puff(e.x + R() - 0.5, e.y + 0.9 + 0.5 * R(), e.z + R() - 0.5, R() - 0.5, 0.3 - R(), R() - 0.5, 0.5 + 0.4 * R(), 0.14, 0.5, 0.5);
        }
        W.events.length = 0;
    }

    spray(dt) {
        const W = this.world, C = W.course, R = Math.random, cam = this.cam, q = this.host.quality.density, p = this.pool, d = p.d;
        for (const r of this.everyone()) {
            if (r.air || r.v < 1.5 || r.afoot || Math.hypot(r.x - cam.x, r.z - cam.z) > 170) continue;
            // Snow is thrown by edges that are skidding: as hard as they are pressed (m/s²) times how far across their travel they
            // are turned, times the speed; from the tails, square off the skis to the side they are sliding towards, which is the
            // outside of a turn and a little forward, and straight down the hill in a hockey stop (a sheet of it). A clean carve
            // throws only a thin plume, hard over; deep snow a plume behind; and there is a cloud round anyone tumbling.
            const s = C.find(r.z), powder = 0.5 + 1.3 * s.T.rough, down = r.fall && r.fall.phase === 'tumble', skid = r.skid || 0, across = Math.abs(Math.sin(skid)), tilt = Math.abs(r.tilt || 0);
            const yaw = r.heading + skid, sh = Math.sin(yaw), ch = Math.cos(yaw), push = (r.press || 1) * 9.81 * across;
            const rate = (down ? 70 : (12 * push * (1 + across * across) + 16 * SkiLogic.smooth(0.4, 0.9, tilt) + 6 * s.T.rough) * powder * r.v / 14) * q * (r.size || 1);
            let n = rate * dt;
            n = Math.floor(n) + (R() < n % 1 ? 1 : 0);
            const out = (across > 0.02 ? skid > 0 : r.lean > 0) ? -1 : 1, kick = 1 + 2 * tilt + 0.6 * r.v * across;
            // (Where it starts, across them: a board throws from the edge it is on, the heel edge or the toe edge, as the figure has it.)
            const from = r.kind === 'board' ? 0.13 * (Math.sign(SkiModels.tipped(r.tilt || 0, skid, (r.scrub || 0) * SkiLogic.GRIP / SkiLogic.G)) || -out) : out * 0.3;
            for (let i = 0; i < n; i++) {
                // (Along the skis from the boots back; a sheet comes off their whole length.)
                const back = R() * 0.8 - 0.8 * across * R();
                this.puff(r.x - sh * back + ch * from, r.y + 0.1, r.z - ch * back - sh * from,
                    r.vx * 0.45 + ch * out * kick * (0.5 + R()) + (down ? (R() - 0.5) * 4 : 0), 0.8 + (1.5 + 2 * tilt + 1.5 * across) * R() + (down ? 2 * R() : 0), r.vz * 0.45 - sh * out * kick * (0.5 + R()),
                    0.5 + 0.6 * R() + (down ? 0.5 : 0), 0.25 + 0.25 * R(), 2 + powder, 0.34 + 0.14 * powder);
            }
            // Down in deep snow it comes up over the tips and off the shins, and hangs behind: more the deeper and the harder the turn.
            const deep = (r.sink || 0) - 0.05;
            if (deep > 0 && !down) {
                let m = 90 * deep * (0.4 + tilt) * r.v / 14 * q * dt;
                m = Math.floor(m) + (R() < m % 1 ? 1 : 0);
                for (let i = 0; i < m; i++) {
                    const ahead = 0.2 + 0.8 * R(), wide = (R() - 0.5) * 0.4;
                    this.puff(r.x + sh * ahead + ch * wide, r.y + 0.05 + 0.3 * R(), r.z + ch * ahead - sh * wide, r.vx * 0.7 + ch * out * (0.3 + R()), 1 + 1.8 * R(), r.vz * 0.7 - sh * out * (0.3 + R()), 0.35 + 0.45 * R(), 0.3, 2.6, 0.4);
                }
            }
            // Brushing past a laden tree shakes its snow loose.
            if (r.lane && R() < dt * 2.2) {
                const chunk = this.chunks.get(Math.floor(r.z / SkiLogic.CHUNK));
                if (chunk && chunk.trees) {
                    for (let j = 0, t = chunk.trees.data; j < chunk.trees.n; j++) {
                        const tx = chunk.x + t[j * 8], tz = chunk.z + t[j * 8 + 2], tall = t[j * 8 + 3];
                        if (t[j * 8 + 5] > 2 || tall < 3 || Math.hypot(tx - r.x, tz - r.z) > 2.2 + tall * 0.12) continue;
                        for (let i = 0; i < 9; i++) this.puff(tx + (R() - 0.5) * tall * 0.2, chunk.y + t[j * 8 + 1] + tall * (0.3 + 0.4 * R()), tz + (R() - 0.5) * tall * 0.2, (R() - 0.5), -0.5 - R(), (R() - 0.5), 0.9 + 0.6 * R(), 0.3, 0.9, 0.45);
                        break;
                    }
                }
            }
        }
        // Smoke from the hut's chimney.
        for (const l of this.lodges || []) for (const sg of [-1, 1]) if (R() < dt * 5) { const p = l.at(sg * 7.5, 17, -2); this.puff(p[0], p[1], p[2], 0.4 + this.wind[0] * 0.08, 1.5, this.wind[2] * 0.08, 5 + 2 * R(), 0.6, 0.6, 0.3, 1); }
        for (const h of this.huts || []) if (R() < dt * 5) this.puff(h.x, h.y, h.z, 0.4 + this.wind[0] * 0.08, 1.4, this.wind[2] * 0.08, 4 + 2 * R(), 0.45, 0.55, 0.3, 1);
        // Everything in the air drifts, slows, falls a little and thins.
        for (let i = 0; i < p.n; i++) {
            const o = i * 12;
            d[o + 6] += dt;
            if (d[o + 6] >= d[o + 7]) { p.n--; d.copyWithin(o, p.n * 12, p.n * 12 + 12); i--; continue; }
            const drag = Math.exp(-dt * (d[o + 11] ? 0.3 : 2.2));
            d[o + 3] *= drag; d[o + 5] *= drag;
            d[o + 4] = d[o + 11] ? d[o + 4] : d[o + 4] * drag - 2.2 * dt;
            d[o] += d[o + 3] * dt; d[o + 1] += d[o + 4] * dt; d[o + 2] += d[o + 5] * dt;
            d[o + 8] += d[o + 9] * dt;
        }
    }

    // ---- The land about the camera: chunks of mesh, trees and props, built a little each frame ---
    lodOf(k) {
        const d = k - this.kc;
        return d >= -2 && d <= 3 ? 0 : d >= -4 && d <= 8 ? 1 : d >= -8 && d <= 16 ? 2 : 3;
    }

    land() {
        const C = this.world.course, kc = Math.floor(this.cam.z / SkiLogic.CHUNK), first = this.kc === null;
        if (kc !== this.kc) {
            this.kc = kc;
            for (const [k, chunk] of this.chunks) if (k < kc - SKI_BEHIND || k > kc + SKI_AHEAD) { this.renderer.release(chunk); this.chunks.delete(k); }
            for (let k = kc - SKI_BEHIND; k <= kc + SKI_AHEAD; k++) if (!this.chunks.has(k)) this.chunks.set(k, { k, x: C.centre(k * SkiLogic.CHUNK), y: C.elev(k * SkiLogic.CHUNK), z: k * SkiLogic.CHUNK, mesh: null, trees: null, props: null, lamps: [], glGround: null, glProps: null });
            this.masts = C.masts(this.cam.z - 300, this.cam.z + 1300);
            this.huts = [];
            // Lodges in sight: where each stands, and the lamp over its terrace.
            this.lodges = C.sections.filter(s => s.type === 'lodge' && s.zs > this.cam.z - 320 && s.zs < this.cam.z + 700).map(s => { const l = C.lodge(s), p = l.at(0, 4.2, 12.5); l.lamp ??= { x: p[0], y: p[1], z: p[2], warm: true }; l.i = s.i; return l; });
        }
        // The nearest chunk that is missing something gets it; on the first frame, all of them do.
        let budget = first ? Infinity : 2;
        const order = [...this.chunks.values()].sort((a, b) => Math.abs(a.k - kc) - Math.abs(b.k - kc));
        this.huts.length = 0;
        for (const chunk of order) {
            const d = chunk.k - kc, lod = this.lodOf(chunk.k), wantTrees = d >= -10 && d <= 30, wantProps = d >= -8 && d <= 18;
            if (!this.flat && budget > 0 && (!chunk.mesh || chunk.mesh.lod !== lod || chunk.mesh.level !== this.groundLevel)) {
                chunk.mesh = SkiModels.ground(C, chunk.k, lod, this.groundLevel);
                if (!this.flat) { this.renderer.release(chunk, 'ground'); this.renderer.upload(chunk); }
                budget--;
            }
            if (budget > 0 && wantTrees && !chunk.trees) { chunk.trees = C.trees(chunk.k); budget -= 0.5; }
            if (!wantTrees && chunk.trees && d > 34) chunk.trees = null;
            if (budget > 0 && wantProps && !chunk.props) {
                const made = SkiModels.props(C, chunk.k, new SkiSoup(64));
                chunk.props = made.soup;
                chunk.lamps = made.lamps;
                if (!this.flat) this.renderer.upload(chunk);
                budget -= 0.5;
            }
            // The hut's chimney, for its smoke: the hut stands side-on to the run.
            for (const l of chunk.lamps) if (l.warm) this.huts.push({ x: l.hx + 1.2 * l.side, y: l.hy + 7.8, z: l.hz + 2.4 * l.side, lamp: l });
        }
    }

    // ---- Drawing -------------------------------------------------------------------------------
    draw() {
        const c = this.config, W = this.world, C = W.course, cam = this.cam, scene = this.scene, air = this.air, lead = W.riders[0];
        const sky = SkiLogic.bodies(this.day), light = SkiLogic.light(sky.sunEl, air.overcast), night = 1 - light.day;
        const aspect = this.width / this.height, still = this.host.reducedMotion;
        let tanY = cam.tan / c.zoom;
        if (aspect < 1) tanY = Math.min(1.2, Math.max(tanY, cam.tan * 0.8 / aspect));     // a phone held upright still sees the piste's width
        Object.assign(scene.cam, { x: cam.x, y: cam.y, z: cam.z, heading: cam.heading + this.pan, pitch: cam.pitch, roll: cam.roll });
        scene.tanY = tanY;
        scene.lift = (this.host.insets.bottom || 0) / this.height;

        // The lamp of the hour: the sun, then the moon.
        const useSun = sky.sunEl > -4.5, moonUp = SkiLogic.smooth(0, 0.2, sky.moon[1]) * SkiLogic.smooth(-4.5, -9, sky.sunEl) * (1 - 0.8 * air.overcast), sunFade = SkiLogic.smooth(-4.5, -2.5, sky.sunEl);
        scene.light = light;
        scene.sunDir = sky.sun;
        scene.lightDir = useSun ? sky.sun : sky.moon;
        scene.lightCol = useSun ? light.sun.map(v => v * sunFade) : [0.1 * moonUp, 0.13 * moonUp, 0.2 * moonUp];
        scene.sunCol = light.sun;
        scene.moon = sky.moon;
        scene.moonCol = [0.36 + 1.1 * night, 0.37 + 1.1 * night, 0.4 + 1.15 * night].map(v => v * (1 - 0.9 * air.overcast));
        scene.stars = light.stars;
        scene.time = this.seconds;
        scene.sunLit = sunFade;
        const up = Math.max(scene.lightDir[1], 0);
        scene.bounce = light.fill.map((v, i) => v * 0.75 + scene.lightCol[i] * 0.42 * up);
        scene.sea = light.fill.map((v, i) => v * 1.55 + scene.lightCol[i] * 0.34 * up + light.horizon[i] * 0.25);
        scene.fog = [1 / air.visibility, -SKI_SEA, SKI_AHEAD * SkiLogic.CHUNK * 0.97, this.weather.mist * 0.005];
        scene.seaAt = [SKI_SEA, (cam.x / 5200) % 1, (cam.z / 5200) % 1, (cam.z / 90000) % 1];
        scene.shadow = this.shadowFade * (1 - air.overcast) * (useSun ? sunFade : 0.35 * moonUp);
        scene.sparkle = light.day * (1 - air.overcast);
        const cover = Math.max(air.overcast, 0.14 + 0.14 * Math.sin(this.seconds / 97 + 2));
        scene.cloud = [SkiLogic.mix(0.66, 0.24, cover), 0.17, 0.9 + 0.08 * air.overcast];
        scene.cloudOff = this.cloudDrift;
        scene.wind = [this.wind[0] / 10, this.wind[2] / 10, this.seconds, still ? 0.3 : 1];
        const lit = this.lit = Math.max(night, 0.5 * this.weather.mist);
        scene.lit = lit;
        scene.trackTint = [0.74, 0.8, 0.91];
        scene.flakes = air.flakes;
        scene.flakeCol = light.fill.map((v, i) => v * 1.7 + scene.lightCol[i] * 0.3 + 0.5 * lit);
        scene.streak = still ? 1 / 120 : 1 / 48;
        scene.snowVel = [this.wind[0] - lead.vx * 0.9, this.wind[1], this.wind[2] - lead.vz * 0.9];
        const box = this.renderer.box, at = [cam.x, cam.y, cam.z];
        scene.snowShift = at.map((p, i) => (((p - this.drift[i]) % box[i]) + box[i]) % box[i]);
        scene.focus = [lead.x - cam.x + Math.sin(cam.heading) * 20, lead.y - cam.y, lead.z - cam.z + Math.cos(cam.heading) * 20];
        scene.shadowReach = this.host.quality.tier === 'high' ? 170 : 130;

        if (this.flat) { this.drawFlat(scene, light); return; }
        if (this.renderer.lost) return;
        const view = this.renderer.aim(scene.cam, tanY, aspect, scene.lift);
        this.sortChunks(scene);
        // The trees are sorted into their batches every few frames, from where the camera was then; in between only that offset moves.
        const a = scene.treeAt, every = this.host.quality.tier === 'high' ? 2 : this.host.quality.tier === 'medium' ? 3 : 4;
        this.treeTurn = (this.treeTurn || 0) + 1;
        if (!a || this.cam.cut || this.treeTurn >= every || Math.abs(scene.cam.heading - a[3]) > 0.06 || Math.abs(scene.cam.pitch - a[4]) > 0.05 || Math.abs(tanY - a[5]) > 0.02) {
            this.treeTurn = 0;
            scene.treeAt = [scene.cam.x, scene.cam.y, scene.cam.z, scene.cam.heading, scene.cam.pitch, tanY];
            this.sortTrees(scene, view, tanY, aspect);
        }
        scene.treeOff = [scene.treeAt[0] - scene.cam.x, scene.treeAt[1] - scene.cam.y, scene.treeAt[2] - scene.cam.z];
        this.pose(scene, view);
        this.lay(scene);
        this.light(scene, light, lit);
        this.renderer.render(scene);
    }

    sortChunks(scene) {
        const cam = scene.cam;
        scene.chunks.length = 0;
        for (const chunk of this.chunks.values()) {
            chunk.seen = true;
            chunk.inShadow = Math.abs(chunk.z + 16 - cam.z - scene.focus[2]) < scene.shadowReach * 0.75 + 16;
            scene.chunks.push(chunk);
        }
        scene.chunks.sort((a, b) => Math.abs(a.k - this.kc) - Math.abs(b.k - this.kc));
    }

    // Every tree in view into the batch for its kind and how far off it is: full, plainer, or a few triangles.
    sortTrees(scene, view, tanY, aspect) {
        if (!scene.batches.length) {
            for (let kind = 0; kind < 6; kind++) {
                for (let lod = 0; lod < 3; lod++) {
                    const model = SkiModels.tree(kind, kind < 3 ? lod : Math.min(lod, 1));
                    scene.batches.push({ kind, lod, model, shadowModel: SkiModels.tree(kind, kind < 3 ? Math.max(1, lod) : 1), shadow: lod < 2, data: new Float32Array(1024 * 8), n: 0 });
                }
            }
        }
        for (const b of scene.batches) { b.n = 0; b.dirty = true; }
        const cam = scene.cam, f = view.f, r = view.r, u = view.u, tx = tanY * aspect, kx = Math.hypot(1, tx), ky = Math.hypot(1, tanY), q = this.treeQ;
        const near = 18 + 42 * q, mid = 60 + 150 * q, far = 260 + 640 * q, reach = scene.shadowReach * 0.6;
        for (const chunk of this.chunks.values()) {
            const t = chunk.trees;
            if (!t) continue;
            const ox = chunk.x - cam.x, oy = chunk.y - cam.y, oz = chunk.z - cam.z, d = t.data;
            if (Math.abs(oz + 16) > far + 40) continue;
            for (let j = 0; j < t.n; j++) {
                const o = j * 8, x = ox + d[o], y = oy + d[o + 1], z = oz + d[o + 2], tall = d[o + 3], dist = Math.hypot(x, z);
                if (dist > far) continue;
                // Out of the picture: skipped, unless its shadow could still fall into it.
                const depth = x * f[0] + (y + tall * 0.5) * f[1] + z * f[2], side = x * r[0] + y * r[1] + z * r[2], rise = x * u[0] + (y + tall * 0.5) * u[1] + z * u[2], pad = tall * 0.7;
                const out = depth < -pad - 8 || Math.abs(side) > depth * tx + (pad + 8) * kx || Math.abs(rise) > depth * tanY * (1 + scene.lift) + (pad + 8) * ky;
                if (out && !(scene.shadow > 0.01 && dist < reach + 30)) continue;
                // Thinned with distance on the lighter tiers: by the tree's own number, so the same ones go each frame.
                if (dist > 120 && d[o + 6] > q * q + 0.1) continue;
                const kind = d[o + 5], lod = dist * (kind > 2 ? 2 : 1) < near + tall ? 0 : dist < mid ? 1 : 2;
                const b = scene.batches[kind * 3 + lod];
                if (b.n * 8 >= b.data.length) { const grown = new Float32Array(b.data.length * 2); grown.set(b.data); b.data = grown; }
                const at = b.n++ * 8, yaw = d[o + 4];
                b.data[at] = x; b.data[at + 1] = y; b.data[at + 2] = z; b.data[at + 3] = tall;
                b.data[at + 4] = Math.cos(yaw); b.data[at + 5] = Math.sin(yaw); b.data[at + 6] = d[o + 6]; b.data[at + 7] = d[o + 4] % 1;
            }
        }
    }

    // Everyone and everything that moves, posed and stamped into one soup, already placed from the camera.
    pose(scene, view) {
        const W = this.world, C = W.course, cam = scene.cam, out = this.moving.clear(), st = this.stack, t = this.seconds, f = view.f;
        const where = { yaw: 0, pitch: 0, bank: 0, lean: 0, tilt: 0, press: 1, skid: 0, brake: 0, face: 0, plant: 0, plantSide: 0, crouch: 0, tuck: 0, air: 0, grab: 0, spread: 0, twist: 0, spin: null, phase: 0, stop: 0, sit: 0, plough: 0, fall: null, t: 0, size: 1, sw: false, wave: 0, head: 0, walk: 0, drink: null, sink: 0, reach: 0, wide: 0, upright: 0 };
        // A sip now and then: the mug up for a second in every five or so, each in their own time.
        const sip = k => SkiLogic.smooth(0.72, 0.9, Math.sin(t * 1.2 + k * 2.4)) * (0.8 + 0.2 * Math.sin(t * 7 + k));
        const lead = W.riders[0], turned = a => a - 6.283185307179586 * Math.round(a / 6.283185307179586);
        for (const r of this.everyone()) {
            // (In deep snow the skis ride under its surface, which is where `y` is: the figure is drawn that far down, and the snow hides what is in it.)
            const sink = r.sink || 0, wary = 1 - (r.skill ?? 1), x = r.x - cam.x, y = r.y - sink - cam.y, z = r.z - cam.z, dist = Math.hypot(x, z);
            if (dist > 420 || x * f[0] + y * f[1] + z * f[2] < -4) continue;
            // The chest and the eyes are yaws in the world: the figure wants the chest from the travel, and the head from the chest (a board's, from the board).
            const face = turned((r.face ?? r.heading) - r.heading), gaze = SkiLogic.clamp(turned((r.gaze ?? r.heading) - r.heading - (r.kind === 'board' ? r.skid || 0 : face)), -0.9, 0.9);
            Object.assign(where, {
                yaw: r.heading, pitch: r.pitch, bank: r.bank || 0, lean: r.lean, tilt: r.tilt || 0, press: r.press || 1, skid: r.skid || 0, brake: (r.scrub || 0) * SkiLogic.GRIP / SkiLogic.G, face, plant: r.plant || 0, plantSide: r.plantSide || 0, crouch: SkiLogic.clamp(0.46 + 0.7 * (r.impact || 0) / 8 + (r.pipe ? 0.25 : 0) + 0.45 * (r.load || 0) + 0.3 * (r.absorb || 0) + 1.6 * Math.max(0, sink - 0.08), 0, 1), tuck: r.tuck || 0,
                air: r.air && r.lift > 0.25 ? 1 : 0, grab: r.grab, spread: r.spread, twist: r.twist, spin: r.spin, phase: r.phase, stop: r.stop, sit: 0, plough: r.role === 'kid' ? 1 : 0, fall: r.fall, t: t + r.id, size: r.size || 1, sw: r.sw,
                lo: dist > this.figNear, wave: r.parked && r.role === 'stranger' && Math.abs(lead.z - r.z) < 14 ? 1 : 0, head: r !== lead && r.stop > 0.5 && lead.fall ? 2.4 : gaze,
                walk: 0, drink: null, sink, reach: r.reach || 0, wide: 0.07 * wary, upright: wary,
            });
            let who = this.lookOf(r);
            // In for a drink: on foot, their skis or board left standing in the snow by the piste.
            const a = r.afoot;
            if (a && a.gear) {
                SkiModels.gear(out, st, a.path[0][0] - cam.x, a.path[0][1] - cam.y, a.path[0][2] - cam.z, a.face + 0.3 * Math.sin(r.id * 2.1), who);
                who = r.onFoot ??= { ...who, kind: 'none' };
                Object.assign(where, { sit: a.seated, walk: a.walk * 3.3, drink: a.seated ? sip(r.id) : null, crouch: 0 });
            }
            SkiModels.figure(out, st, x, y, z, who, where);
        }
        Object.assign(where, { walk: 0, drink: null, sink: 0, reach: 0, wide: 0, upright: 0, pitch: 0, bank: 0, lean: 0, tilt: 0, press: 1, skid: 0, brake: 0, face: 0, plant: 0, plantSide: 0, crouch: 0, tuck: 0, air: 0, grab: 0, spread: 0, twist: 0, spin: null, stop: 1, plough: 0, fall: null, size: 1, sw: false, head: 0 });
        // Folk on the hut's terrace.
        for (const h of this.huts) {
            const l = h.lamp, s = C.find(l.hz), side = l.side, hx = l.hx - cam.x, hy = l.hy - cam.y, hz = l.hz - cam.z;
            if (Math.hypot(hx, hz) > 260) continue;
            [[-1.4, 5.4, 0, 0], [0.8, 6.0, 1, 0.31], [-2.2, 4.75, 0, 0.62], [2.6, 5.2, 0, 0.93]].forEach(([px, pz, wave, v], i) => {
                // The hut faces the piste: its own +z is across the run.
                Object.assign(where, { lo: Math.hypot(hx, hz) > this.figNear, yaw: -side * 1.57 + (i - 1.5) * 0.4, sit: i === 2 ? 1 : 0, wave: wave && Math.abs(lead.z - l.z) < 30 ? 1 : 0, t: t + i });
                SkiModels.figure(out, st, hx - side * pz, hy + (i === 2 ? 2.2 : 1.5), hz + side * px, { ...SkiModels.anyone(v + s.i * 0.07), kind: 'none' }, where);
            });
        }
        // Other people's afternoons on the lodge's terrace: at the tables, by the fire, at the rail.
        for (const l of this.lodges) {
            if (Math.hypot(l.x - cam.x, l.z - cam.z) > 300) continue;
            const D = SkiLogic.LODGE.deck, lo = Math.hypot(l.x - cam.x, l.z - cam.z) > this.figNear + 14, near = Math.abs(lead.z - l.z) < 40 && !lead.afoot;
            // [lx, lz, facing (0 the piste, 1 the lodge, 2 and 3 along the terrace), seated, waves]
            [[-5.0, 11.85, 1, 1, 0], [-6.0, 10.15, 0, 1, 0], [-5.4, 10.15, 0, 1, 0], [10.2, 11.85, 1, 1, 0], [10.9, 10.15, 0, 1, 0], [-10.0, 11.85, 1, 1, 0], [-11.0, 11.85, 1, 1, 0], [-10.5, 10.15, 0, 1, 0],
                [-8.2, 13.9, 0, 0, 1], [9.0, 13.9, 0, 0, 0], [-4.9, 8.4, 2, 0, 0], [-2.4, 8.9, 3, 0, 0], [1.2, 8.2, 0, 0, 0]].forEach(([lx, lz, facing, seated, wave], i) => {
                const p = l.at(lx, D, lz), dir = [[0, 1], [0, -1], [1, 0], [-1, 0]][facing];
                Object.assign(where, { lo, yaw: Math.atan2(-l.side * dir[1], l.side * dir[0]) + (seated ? 0 : 0.35 * Math.sin(i * 1.7)), sit: seated, stop: 1, drink: seated || i > 9 ? sip(i * 1.3 + l.i) : null, wave: wave && near ? 1 : 0, t: t + i });
                SkiModels.figure(out, st, p[0] - cam.x, p[1] - cam.y, p[2] - cam.z, (l.folk ??= [])[i] ??= { ...SkiModels.anyone(0.11 + i * 0.137 + l.i * 0.07), kind: 'none' }, where);
            });
        }
        Object.assign(where, { drink: null });
        // The chairlift: cables from tower to tower, chairs going round, people riding up.
        Object.assign(where, { sit: 1, wave: 0, stop: 0 });
        for (const lift of C.lifts) {
            if (lift.zb < cam.z - 300 || lift.za > cam.z + 800 || lift.towers.length < 2) continue;
            const yaw = Math.atan2(lift.xb - lift.xa, lift.zb - lift.za), cy = Math.cos(yaw), sy = Math.sin(yaw), tw = lift.towers;
            const top = (i, sg) => [tw[i].x + sg * 2.45 * cy - cam.x, tw[i].y + tw[i].top - 0.3 - cam.y, tw[i].z - sg * 2.45 * sy - cam.z];
            for (let i = 1; i < tw.length; i++) {
                for (const sg of [-1, 1]) {
                    const a = top(i - 1, sg), b = top(i, sg);
                    out.stamp(SkiModels.model('cable', s => s.paint(SkiModels.C.dark).box(0, 0, 0.5, 0.022, 0.022, 0.5, 1)), [cy, 0, b[0] - a[0], a[0], 0, 1, b[1] - a[1], a[1], -sy, 0, b[2] - a[2], a[2]]);
                }
            }
            const n = Math.floor(lift.length / 15);
            for (let j = 0; j < n; j++) {
                for (const sg of [-1, 1]) {
                    // Up one side and down the other.
                    const along = (((j * 15 + sg * t * 2.4) % lift.length) + lift.length) % lift.length;
                    let i = 1;
                    while (i < tw.length - 1 && tw[i].at < along) i++;
                    const k = (along - tw[i - 1].at) / (tw[i].at - tw[i - 1].at), a = top(i - 1, sg), b = top(i, sg);
                    const x = a[0] + (b[0] - a[0]) * k, y = a[1] + (b[1] - a[1]) * k, z = a[2] + (b[2] - a[2]) * k, dist = Math.hypot(x, z);
                    if (dist > 380 || x * f[0] + y * f[1] + z * f[2] < -6) continue;
                    const facing = sg > 0 ? yaw : yaw + Math.PI, swing = 0.04 * Math.sin(t * 1.3 + j);
                    st.reset(x, y, z, facing, 1).rx(swing);
                    out.stamp(SkiModels.chair(), st.top);
                    // Those going up have somebody on them, most of the time.
                    const who = SkiLogic.hash(lift.i, j, 3);
                    if (sg < 0 && dist < this.figFar && who < 0.75) {
                        for (const seat of who < 0.4 ? [-0.45, 0.45] : [who < 0.6 ? -0.45 : 0.45]) {
                            Object.assign(where, { yaw: facing, t: t + j + seat, lo: dist > this.figNear });
                            SkiModels.figure(out, st, x + Math.cos(facing) * seat, y - 2.68 - 0.52, z - Math.sin(facing) * seat, SkiModels.anyone(who + j * 0.13 + seat), where);
                        }
                    }
                }
            }
        }
        // A hare or a fox across the piste; an eagle turning over the valley.
        const cr = W.creature;
        if (cr) SkiModels.creature(out, st, cr.kind, cr.x - cam.x, cr.y - cam.y, cr.z - cam.z, cr.dir > 0 ? 1.57 : -1.57, cr.t * (cr.kind === 'hare' ? 3.2 : 2.6));
        if (this.config.wildlife) {
            const a = t * 0.3, ez = lead.z + 150 + 40 * Math.sin(t / 23), ex = C.centre(ez) + 60 * Math.sin(t / 31) + Math.sin(a) * 28;
            SkiModels.eagle(out, st, ex - cam.x, lead.y + 30 - 0.27 * 150 + 8 * Math.sin(t / 17) - cam.y, ez + Math.cos(a) * 28 - cam.z, a + 1.57, -0.35, 0.12 + 0.1 * Math.sin(t * 0.9));
        }
    }

    // Tracks as ribbons, from the camera: two points across for every point along.
    lay(scene) {
        const cam = scene.cam, tr = this.tracks, d = tr.data;
        let n = 0;
        for (const [id, t] of this.trails) {
            if (this.seconds - t.seen > 0.5 && t.pts.length) { t.pts.splice(0, 3); if (!t.pts.length) this.trails.delete(id); }
            const pts = t.pts, len = pts.length;
            if (len < 3 || n + len * 2 > 31000) continue;
            for (let i = 0; i < len; i++) {
                // Nothing at either end, so the ribbons never join each other; the oldest tracks fade.
                const p = pts[i], a = i === 0 || i === len - 1 ? 0 : p.a * Math.min(1, i / (len * 0.2));
                for (const sg of [-1, 1]) {
                    const o = n++ * 6;
                    d[o] = p.x + sg * p.rx * p.w - cam.x; d[o + 1] = p.y + 0.04 - cam.y; d[o + 2] = p.z + sg * p.rz * p.w - cam.z; d[o + 3] = sg; d[o + 4] = a; d[o + 5] = p.k;
                }
            }
        }
        tr.n = n;
    }

    // Spray and smoke as sprites; floodlights as light on the snow and a glow in the air.
    light(scene, light, lit) {
        const cam = scene.cam, puffs = this.puffs, glows = this.glows, p = this.pool, d = p.d, lead = this.world.riders[0];
        puffs.clear();
        glows.clear();
        const snow = light.fill.map((v, i) => v * 1.25 + scene.lightCol[i] * 0.6 + 0.05 * lit), smoke = light.fill.map((v, i) => v * 0.6 + scene.lightCol[i] * 0.2);
        for (let i = 0; i < p.n; i++) {
            const o = i * 12, k = d[o + 6] / d[o + 7], c = d[o + 11] ? smoke : snow;
            puffs.add(d[o] - cam.x, d[o + 1] - cam.y, d[o + 2] - cam.z, d[o + 8], c[0], c[1], c[2], d[o + 10] * (1 - k) * Math.min(1, k * 8));
        }
        // Fog rolling through: banks of it drifting across the hill, about the camera.
        const mist = this.weather.mist;
        if (mist > 0.02) {
            for (let i = 0; i < 26; i++) {
                const h = SkiLogic.hash(i, 7, 1), x = ((h * 240 + this.seconds * (1.5 + 2 * SkiLogic.hash(i, 3))) % 240) - 120, z = ((SkiLogic.hash(i, 11) * 260 - cam.z) % 260 + 260) % 260 - 90;
                puffs.add(x, this.world.course.height(cam.x + x, cam.z + z) - cam.y + 5, z, 26 + 18 * h, light.fill[0] * 1.4, light.fill[1] * 1.4, light.fill[2] * 1.45, 0.09 * mist);
            }
        }
        scene.lamps.length = 0;
        if (lit > 0.03) {
            const lamps = this.masts.map(m => ({ x: m.x - m.side * 0.4, y: m.y + 8.3, z: m.z })).concat(this.huts.map(h => h.lamp), this.lodges.map(l => l.lamp));
            for (const l of lamps) {
                const x = l.x - cam.x, y = l.y - cam.y, z = l.z - cam.z;
                l.d = Math.hypot(l.x - lead.x, l.z - lead.z);
                glows.add(x, y, z, l.warm ? 2.6 : 1.7, 2.6 * lit, 2.2 * lit, 1.5 * lit, 0.9);
                glows.add(x, y - (l.warm ? 3 : 8.2), z, l.warm ? 9 : 26, 0.16 * lit, 0.14 * lit, 0.09 * lit, 0.8, 1);
            }
            lamps.sort((a, b) => a.d - b.d);
            // The lead's head torch: a small pool of light that goes where they go, so they are never only a shadow.
            scene.lamps.push([lead.x + Math.sin(lead.heading) * 3 - cam.x, lead.y + 2.2 - cam.y, lead.z + Math.cos(lead.heading) * 3 - cam.z, 1.5 * lit, 1.45 * lit, 1.3 * lit, 40]);
            for (const l of lamps.slice(0, 5)) scene.lamps.push([l.x - cam.x, l.y - cam.y, l.z - cam.z, 3.0 * lit, 2.6 * lit, 1.9 * lit, l.warm ? 160 : 900]);
        }
    }

    // Without WebGL: the same run in flat colour, strips of the real slope from far to near, trees and riders on it.
    drawFlat(scene, light) {
        const ctx = this.ctx, w = this.canvas.width, h = this.canvas.height, cam = scene.cam, C = this.world.course;
        const tone = c => `rgb(${c.map(v => Math.round(255 * Math.pow(1 - Math.exp(-v), 0.4545))).join(',')})`;
        const sh = Math.sin(cam.heading), ch = Math.cos(cam.heading), sp = Math.sin(cam.pitch), cp = Math.cos(cam.pitch);
        const f = [sh * cp, sp, ch * cp], r = [ch, 0, -sh], u = [-sp * sh, cp, -sp * ch], k = h / 2 / scene.tanY;
        const project = (x, y, z) => { const dx = x - cam.x, dy = y - cam.y, dz = z - cam.z, depth = Math.max(0.4, dx * f[0] + dy * f[1] + dz * f[2]); return [w / 2 + (dx * r[0] + dz * r[2]) * k / depth, h / 2 - (dx * u[0] + dy * u[1] + dz * u[2]) * k / depth - scene.lift * h / 2, depth]; };
        const horizon = h / 2 + Math.tan(cam.pitch) * k - scene.lift * h / 2, gradient = ctx.createLinearGradient(0, 0, 0, Math.max(1, horizon));
        gradient.addColorStop(0, tone(light.zenith));
        gradient.addColorStop(1, tone(light.horizon));
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = tone(scene.sea);
        ctx.fillRect(0, horizon, w, h);
        const snow = light.fill.map((v, i) => 0.92 * (v + scene.lightCol[i] * 0.55));
        // Whatever the strips below leave bare at the foot of the picture is snow underfoot.
        ctx.fillStyle = tone(snow);
        ctx.fillRect(0, Math.max(horizon + h * 0.12, h * 0.55), w, h);
        const shade = light.fill.map(v => v * 0.95), way = f[2] >= 0 ? 1 : -1;
        const cols = [-520, -300, -170, -90, -50, -30, -18, -8, 0, 8, 18, 30, 50, 90, 170, 300, 520];
        const row = d => { const z = cam.z + way * d, c = C.centre(z); return cols.map(a => { const y = C.height(c + a, z); return project(c + a, y, z); }); };
        let far = null;
        for (let i = 33; i >= 0; i--) {
            const d = 3 + 2.2 * (Math.pow(1.21, i) - 1) / 0.21, here = row(d);
            if (far) {
                const fog = 1 - Math.exp(-d * (scene.fog[0] + 0.0012)), s = C.find(cam.z + way * d);
                for (let j = 0; j < cols.length - 1; j++) {
                    const on = Math.abs(cols[j] + cols[j + 1]) / 2 < C.width(cam.z + way * d), steep = (far[j][1] - here[j][1]) / Math.max(4, here[j][1] - horizon + 40);
                    ctx.fillStyle = tone(SkiLogic.mix3(SkiLogic.mix3(on ? snow : SkiLogic.mix3(shade, snow, 0.45 + 0.3 * ((i + j) & 1)), s.type === 'lake' && on ? [0.3, 0.45, 0.55] : snow, on ? 0.9 : 0.1 + SkiLogic.clamp(-steep, 0, 0.3)), scene.sea, fog));
                    ctx.beginPath();
                    ctx.moveTo(far[j][0], far[j][1]); ctx.lineTo(far[j + 1][0] + 1, far[j + 1][1]); ctx.lineTo(here[j + 1][0] + 1, here[j + 1][1] + 1); ctx.lineTo(here[j][0], here[j][1] + 1);
                    ctx.fill();
                }
            }
            far = here;
        }
        // Trees and riders, far to near.
        const things = [];
        for (const chunk of this.chunks.values()) {
            const t = chunk.trees;
            if (!t || Math.abs(chunk.z - cam.z) > 330) continue;
            for (let j = 0; j < t.n; j += 2) {
                const o = j * 8, p = project(chunk.x + t.data[o], chunk.y + t.data[o + 1], chunk.z + t.data[o + 2]);
                if (p[2] > 1 && p[2] < 330 && p[0] > -60 && p[0] < w + 60) things.push([p, t.data[o + 3], t.data[o + 5]]);
            }
        }
        for (const rider of this.everyone()) { const p = project(rider.x, rider.y, rider.z); if (p[2] > 1) things.push([p, 0, rider]); }
        for (const l of this.lodges) { const p = project(l.x, l.y, l.z); if (p[2] > 8 && p[2] < 700) things.push([p, -1, l]); }
        things.sort((a, b) => b[0][2] - a[0][2]);
        const green = tone(SkiLogic.mix3(shade, [0.01, 0.07, 0.03], 0.88)), white = tone(snow);
        for (const [p, tall, what] of things) {
            const s = k / p[2];
            if (tall < 0) {
                // A lodge, flat on: timber on stone, a roof of snow, the great gable's glass (lit at night).
                const [x, y] = p, glass = scene.lit > 0.3 ? 'rgb(255,226,170)' : tone(SkiLogic.mix3(shade, [0.1, 0.2, 0.4], 0.6));
                ctx.fillStyle = tone(SkiLogic.mix3(shade, [0.3, 0.3, 0.3], 0.5)); ctx.fillRect(x - 13.6 * s, y - 4.2 * s, 27.2 * s, 5.2 * s);
                ctx.fillStyle = tone(SkiLogic.mix3(shade, [0.26, 0.14, 0.07], 0.75)); ctx.fillRect(x - 13.2 * s, y - 9.2 * s, 26.4 * s, 5 * s);
                ctx.fillStyle = white;
                ctx.beginPath(); ctx.moveTo(x - 14.7 * s, y - 9 * s); ctx.lineTo(x - 12 * s, y - 15.5 * s); ctx.lineTo(x + 12 * s, y - 15.5 * s); ctx.lineTo(x + 14.7 * s, y - 9 * s); ctx.fill();
                ctx.beginPath(); ctx.moveTo(x - 6.5 * s, y - 8.6 * s); ctx.lineTo(x, y - 14.8 * s); ctx.lineTo(x + 6.5 * s, y - 8.6 * s); ctx.fill();
                ctx.fillStyle = glass;
                ctx.beginPath(); ctx.moveTo(x - 3.9 * s, y - 4.2 * s); ctx.lineTo(x - 3.9 * s, y - 8.8 * s); ctx.lineTo(x, y - 12.4 * s); ctx.lineTo(x + 3.9 * s, y - 8.8 * s); ctx.lineTo(x + 3.9 * s, y - 4.2 * s); ctx.fill();
                for (const sg of [-1, 1]) for (const wx of [6.9, 9.1, 11.3]) for (const wy of [2.8, 5.6, 7.9]) ctx.fillRect(x + (sg * wx - 0.6) * s, y - (wy + 0.6) * s, 1.2 * s, 1.2 * s);
            } else if (tall) {
                const th = tall * s, tw = th * (what === 5 ? 0.6 : 0.17);
                ctx.fillStyle = what > 2 ? white : green;
                ctx.beginPath(); ctx.moveTo(p[0] - tw, p[1]); ctx.lineTo(p[0], p[1] - th); ctx.lineTo(p[0] + tw, p[1]); ctx.fill();
                if (what < 3) { ctx.fillStyle = white; ctx.beginPath(); ctx.moveTo(p[0] - tw * 0.45, p[1] - th * 0.55); ctx.lineTo(p[0], p[1] - th); ctx.lineTo(p[0] + tw * 0.45, p[1] - th * 0.55); ctx.fill(); }
            } else {
                const who = this.lookOf(what), foot = what.afoot && what.afoot.gear, tallness = 1.7 * s * (what.size || 1) * (what.fall ? 0.4 : foot && what.afoot.seated ? 0.75 : 1), lean = what.lean * tallness * 0.35;
                ctx.fillStyle = `rgb(${who.pants})`;
                ctx.fillRect(p[0] - s * 0.16, p[1] - tallness * 0.5 - what.lift * s, s * 0.32, tallness * 0.5);
                ctx.fillStyle = `rgb(${who.jacket})`;
                ctx.fillRect(p[0] - s * 0.2 + lean * 0.5, p[1] - tallness * 0.9 - what.lift * s, s * 0.4, tallness * 0.45);
                ctx.fillStyle = `rgb(${who.helmet})`;
                ctx.beginPath(); ctx.arc(p[0] + lean, p[1] - tallness - what.lift * s, Math.max(1, s * 0.13), 0, 6.3); ctx.fill();
                // (Their skis or board under them: left in the snow by whoever has gone in for a drink.)
                const at = foot ? project(what.afoot.path[0][0], what.afoot.path[0][1], what.afoot.path[0][2]) : p, sg = foot ? k / at[2] : s;
                ctx.fillStyle = `rgb(${who.gear})`;
                ctx.fillRect(at[0] - sg * 0.45, at[1] - (foot ? 0 : what.lift * s) - Math.max(1, sg * 0.05), sg * 0.9, Math.max(1, sg * 0.07));
            }
        }
    }
}
