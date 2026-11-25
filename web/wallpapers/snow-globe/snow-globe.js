// Snow Globe (SPEC §10.43). A snow globe on a frosty windowsill at night (or alone on black),
// painted: a candle on one side, a cat on the other, the snow coming down
// outside. Inside the water a little scene stands on a turntable (a cottage
// in the firs, the village church, skaters on a pond, the cats' cottage, a
// Christmas tree with a train going round it) and the snow in the water
// settles over a minute: on the ground, on the roofs, on the snowman's hat.
//
// Drag to shake it: the water swirls, the snow goes up and comes down
// again. Tap the base to wind the music box: the scene turns and a carol
// plays (out loud too, if Sound is on), slowing as the spring runs down.
// Tap the cat to stroke it. The cat watches the snow, taps the glass now
// and then, and when it has all settled for a while it gives the globe a
// good swipe itself.
//
// Four canvases, back to front: the night outside, the snow falling past
// the window, the room (painted once, the window's panes left clear), and
// the globe, the cat, the candle's flame. When nothing moves but the candle
// and the cat, the stage is asked for fourteen frames a second, and fewer
// still when the cat's asleep.

const SNOW_GLOBE_CAP = { low: 0.8, medium: 1.4, high: 2.5 };     // megapixels the painting is made at, by tier
const SNOW_GLOBE_LIGHTS = {                                        // the room's strings of lights, by colour
    warm: [[255, 190, 100], [255, 214, 150], [255, 176, 86]],
    multi: [[255, 70, 60], [255, 200, 80], [80, 210, 110], [90, 140, 255], [255, 120, 200]],
    cool: [[150, 190, 255], [226, 238, 255], [120, 160, 255]],
    gold: [[255, 206, 110], [255, 230, 168]],
};

class SnowGlobeAnimationManager {
    constructor(host) {
        this.host = host;
        this.config = WP.settings.load();
        this.running = false;
        this.listeners = [];
        this.jobs = [];
        this.notes = [];
        this.outside = [];
        this.time = 0;
        this.wob = { a: 0, v: 0, x: 0, y: 0, vx: 0, vy: 0 };
        this.stats = { frames: 0, shakes: 0, catShakes: 0, taps: 0, winds: 0, notes: 0, bakes: 0, inner: 0, strokes: 0 };
    }

    get L() { return this.layout; }
    density() { return this.host.quality?.density ?? 1; }
    wants(name) { return this.host.quality?.effects?.includes(name) ?? true; }
    flakeCount() { return Math.max(60, Math.round(700 * this.config.snow * this.density())); }

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
        this.skyCanvas = layer();      // outside: the night, painted once
        this.snowCanvas = layer();     // snow falling past the window
        this.roomCanvas = layer();     // the room, painted once
        this.canvas = layer();         // the globe, the cat, the candle's flame
        this.ctx = this.canvas.getContext('2d');
        this.snowCtx = this.snowCanvas.getContext('2d');
        const now = this.host.now();
        this.festive = SnowGlobeLogic.festive(now);
        this.music = SnowGlobeLogic.musicBox();
        this.catState = SnowGlobeLogic.makeCat();
        this.pickScene();
        this.sim = SnowGlobeLogic.makeSim(this.flakeCount(), { rand: Math.random, settleSeconds: this.config.settle, kind: this.config.flakes });
        // The globe was shaken a little while ago: the snow is still coming down.
        SnowGlobeLogic.scatter(this.sim, 0.7, Math.random);
        if (this.festive) this.wind(true);
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
        for (const c of [this.skyCanvas, this.snowCanvas, this.roomCanvas, this.canvas]) c.remove();
        this.audio?.close?.();
        this.audio = null;
    }

    onPause() { this.audio?.suspend?.(); }
    onResume() { this.audio?.resume?.(); this.lastNow = 0; }

    pickScene() {
        const now = this.host.now();
        this.scene = SnowGlobeLogic.sceneFor(this.config.scene, now);
        this.catId = SnowGlobeLogic.catFor(this.config.cat, now);
    }

    listen() {
        const on = (target, type, fn) => { target.addEventListener(type, fn); this.listeners.push(() => target.removeEventListener(type, fn)); };
        on(window, 'resize', () => this.resize());
        if (this.host.params.thumb) return;
        on(document, 'pointerdown', e => { this.pointerType = e.pointerType; this.unlockAudio(); });
        const ok = () => this.config.touch || this.pointerType === 'mouse';
        this.listeners.push(this.host.gestures({
            tap: (x, y) => { if (ok()) this.tap(x, y); },
            start: (x, y) => { if (ok()) this.drag = { x0: x, y0: y, x, y, at: performance.now() }; },
            move: (x, y) => { if (this.drag) this.dragTo(x, y); },
            end: () => { this.drag = null; },
        }));
    }

    applySettings(config) {
        const old = this.config;
        this.config = config;
        if (!this.running) return;
        const changed = keys => keys.some(k => JSON.stringify(old[k]) !== JSON.stringify(config[k]));
        if (changed(['scene', 'cat'])) this.pickScene();
        if (changed(['flakes'])) { this.sim = SnowGlobeLogic.makeSim(this.flakeCount(), { rand: Math.random, settleSeconds: config.settle, kind: config.flakes }); SnowGlobeLogic.scatter(this.sim, 0.6, Math.random); }
        if (changed(['snow'])) SnowGlobeLogic.resize(this.sim, this.flakeCount(), Math.random);
        this.sim.settleSeconds = config.settle;
        if (changed(['scene', 'cat', 'catSide', 'room', 'base', 'size', 'candle', 'treeLights', 'lights', 'background', 'windowLights', 'deskTree', 'deskTreeSize', 'deskTreeTopper'])) this.resize();
        if (changed(['snowOutside'])) this.outside = [];
        if (!config.sound && this.audio) { this.audio.close?.(); this.audio = null; }
        this.innerDirty = true;
        this.host.idleUntil(0);
    }

    onQuality(q) {
        SnowGlobeLogic.resize(this.sim, this.flakeCount(), Math.random);
        this.outside = [];
        if (q && Math.abs((window.devicePixelRatio || 1) - (this.dpr || 1)) > 0.01) this.resize();
        this.host.idleUntil(0);
    }

    // ---- Layout and painting -------------------------------------------------------------------

    resize() {
        if (!this.canvas) return;
        const W = this.W = innerWidth, H = this.H = innerHeight, dpr = this.dpr = window.devicePixelRatio || 1;
        for (const c of [this.skyCanvas, this.snowCanvas, this.roomCanvas, this.canvas]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
        const c = this.config, A = SnowGlobeArt, M = SnowGlobeModels, S = SnowGlobeLogic, side = c.catSide === 'left' ? -1 : 1;
        // On black there is only the globe: no room, no cat, no candle.
        const black = this.black = c.background === 'black', catId = black ? null : this.catId;
        const month = this.host.now().getMonth();
        this.treeOn = !black && (c.deskTree === 'on' || (c.deskTree === 'december' && month === 11));
        this.candleOn = !black && c.candle;
        this.windowLightsOn = !black && c.windowLights !== 'off';
        const L = this.layout = S.layout(W, H, { insets: this.host.insets || {}, size: c.size, catSide: c.catSide, cat: !!catId, treeSize: c.deskTreeSize, room: c.room });
        this.side = catId ? side : 1;
        // The picture's own scale: the screen's, capped by the tier.
        const cap = SNOW_GLOBE_CAP[this.host.quality?.tier] || SNOW_GLOBE_CAP.high;
        const ps = this.ps = Math.max(0.5, Math.min(dpr, Math.sqrt(cap * 1e6 / (W * H))));
        const seed = 7, R = L.R;
        this.jobs = [];
        const brush = (name, src, opts, done) => { this.jobs.push({ name, it: A.strokes(src, opts), done }); };
        // The room and the night outside (or nothing but black).
        this.sky = black ? null : A.outside(L, ps, { side: -this.side, seed });
        this.room = black ? A.black(L, ps) : A.room(L, ps, { room: c.room, candle: this.candleOn, treeLights: c.treeLights, windowLights: this.windowLightsOn, deskTree: this.treeOn, topper: c.deskTreeTopper, treeSize: c.deskTreeSize, side: -this.side, cat: !!catId, seed });
        const keepOf = r => ({ flame: r.flame, panes: r.panes || [], bulbs: r.bulbs || [], treeBulbs: r.treeBulbs || [], treeTop: r.treeTop || null, crisp: r.crisp });
        this.roomKeep = keepOf(this.room);
        this.flame = this.roomKeep.flame;
        this.showRoom();
        // The globe: its base, its glass, what is seen through the water, its ground.
        this.baseArt = A.base(L, ps, c.base, this.side);
        this.glassArt = A.glass(L, ps, -this.side, { candle: this.candleOn, black });
        this.behindArt = A.behind(L, ps, black ? [] : [this.sky, c.room === 'mantel' ? null : this.room], { black });
        const list = S.SCENES[this.scene], house = list.find(o => S.KINDS[o.kind].box), door = {};
        if (house) {
            // Where the main house's door is, for the path to it in the snow.
            const rr = house.r * S.FLOOR_R, hx = Math.sin(house.a) * rr, hz = Math.cos(house.a) * rr, yaw = house.yaw || 0, d = S.KINDS[house.kind].d * (house.s || 1) / 2;
            const dx = hx + Math.sin(yaw) * d, dz = hz + Math.cos(yaw) * d;
            Object.assign(door, { doorAt: Math.atan2(dx, dz), doorR: Math.hypot(dx, dz) / S.FLOOR_R, door: Math.atan2(dx + Math.sin(yaw) * 0.6, dz + Math.cos(yaw) * 0.6) });
        }
        this.groundArt = A.ground(L, ps, -this.side, S.GROUND[this.scene] || 'path', door);
        this.inner = A.canvas(R * 2 * ps, R * 2 * ps);
        // What stands inside, each kind built once as a solid (globe-models.js), its textures painted and brushed.
        this.kit = M.kit(R, ps, -this.side, { lights: c.lights, black });
        const sprites = {};
        const art = { fir: kind => sprites[kind] || (sprites[kind] = (() => { const t = A.thing(kind, L, ps, -this.side), hold = { c: t.canvas, w: t.w, h: t.h, ax: t.ax, ay: t.ay }; brush(`thing:${kind}`, t.canvas, t.opts, out => { hold.c = out; }); return hold; })()) };
        this.models = list.map(o => (S.KINDS[o.kind].flat ? null : M.build(o.kind, o.v || 0, this.kit, art)));
        for (const j of this.kit.jobs) brush(j.name, j.src, j.opts, j.done);
        this.smoke = [];
        // The flakes, glitter, notes, lights.
        const hues = [[255, 236, 160], [214, 230, 255], [255, 170, 200], [170, 255, 210], [190, 200, 255], [255, 210, 130]];
        this.sprites = {
            flake: A.flake(R * 0.022, ps), soft: A.flake(R * 0.034, ps, 0.12), clump: A.clump(R * 0.03, ps),
            stars: Array.from({ length: 6 }, (_, k) => A.star(R * 0.028, ps, k * Math.PI / 18)),
            sequins: [6, 4].map(n => hues.map(col => A.sequin(R * 0.022, ps, col, n))),
            glints: hues.map(col => A.glint(R * 0.03, ps, col)),
            notes: [A.note(R * 0.16, ps, 0), A.note(R * 0.16, ps, 1)],
            glow: A.glow(R * 0.2 * ps, [255, 200, 120]),
            flameGlow: A.glow(R * 1.2 * ps, [255, 170, 90], 0.1),
            lampGlow: A.glow(R * 0.12 * ps, [255, 210, 140], 0.2),
            outside: A.flake(2.2, ps),
            puff: A.glow(R * 0.06 * ps, [200, 204, 214], 0.2),
            beam: A.glow(R * 0.5 * ps, [255, 240, 190], 0.15),
            bulbs: {},
        };
        // The cat.
        this.catArt = catId ? A.cat(catId, L.cat.h, ps, this.side) : null;
        if (this.catArt) for (const part of ['body', 'head', 'leg']) { const p = this.catArt[part]; brush(`cat-${part}`, p.canvas, p.opts, out => { p.canvas = out; }); }
        brush('base', this.baseArt.front, this.baseArt.frontOpts, out => { this.baseArt.front = out; this.reflection = null; });
        brush('ground', this.groundArt.canvas, this.groundArt.opts, out => { this.groundArt.canvas = out; });
        brush('floor', this.groundArt.top, this.groundArt.topOpts, out => { this.groundArt.top = out; });
        // The room and the night last: they are the biggest, and the underpainting stands in well meanwhile.
        const u = R * ps;
        const backV = L.back / L.H;
        if (!black) {
            brush('room', this.room, { widths: [u * 0.22, u * 0.11, u * 0.055, u * 0.03], seed: 3, len: 3, tol: 50, jit: 0.05, keep: true, fine: 0.55, dir: (x, y) => (y > backV + 0.01 ? 0.015 * Math.sin(x * 7) : null), after: g => { this.roomKeep.crisp?.(g); A.weave(g, this.room.width, this.room.height, 5); } }, out => { this.room = out; this.showRoom(); });
            brush('sky', this.sky, { widths: [u * 0.2, u * 0.1, u * 0.05], seed: 9, len: 4, tol: 40, jit: 0.05, keep: false, dir: (x, y) => (y < 0.55 ? -0.1 + 0.25 * Math.sin(x * 9 + y * 6) : null) }, out => { this.sky = out; this.showRoom(); this.behindArt = A.behind(this.layout, this.ps, [this.sky, this.config.room === 'mantel' ? null : this.room]); });
        }
        this.reflection = null;
        this.jobsTotal = this.jobs.length;
        this.innerDirty = true;
        this.outside = [];
        this.stats.bakes++;
    }
    showRoom() {
        const draw = (cv, src) => { const g = cv.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); if (src) g.drawImage(src, 0, 0, cv.width, cv.height); };
        draw(this.skyCanvas, this.config.room === 'mantel' || this.black ? null : this.sky);
        draw(this.roomCanvas, this.room);
    }
    // The brushwork, a few milliseconds at a time.
    pump(ms) {
        const t0 = performance.now();
        while (this.jobs.length && performance.now() - t0 < ms) {
            const j = this.jobs[0], r = j.it.next();
            if (r.done) { this.jobs.shift(); this.stats.strokes += r.value.strokes || 0; j.done(r.value); this.innerDirty = true; }
        }
    }
    painted() { return this.jobsTotal ? 1 - this.jobs.length / this.jobsTotal : 1; }

    // ---- What the hands do ---------------------------------------------------------------------

    // A tap: on the base, the music box; on the glass, a knock; on the cat, a stroke.
    tap(x, y) {
        const L = this.L, R = L.R;
        this.stats.taps++;
        if (this.catArt && Math.abs(x - L.cat.x) < L.cat.h * 0.35 && y > L.cat.y - L.cat.h && y < L.cat.y + 4) {
            SnowGlobeLogic.pet(this.catState);
            this.host.toast(`${this.catArt.C.name} purrs`, 1600);
        } else if (Math.abs(x - L.base.x) < L.base.w / 2 && y > L.base.top - R * 0.05 && y < L.foot + R * 0.1) this.wind();
        else if (Math.hypot(x - L.cx, y - L.cy) < R) { this.shake(x - L.cx, y - L.cy, 0.35); this.wob.v += Math.sign(L.cx - x) * 0.1; }
        this.host.idleUntil(0);
    }
    // A drag: the globe goes with the hand a little, and every move stirs it.
    dragTo(x, y) {
        const d = this.drag, now = performance.now(), dt = Math.max(0.008, (now - d.at) / 1000), dx = x - d.x, dy = y - d.y, R = this.L.R;
        d.x = x; d.y = y; d.at = now;
        const speed = Math.hypot(dx, dy) / dt;          // px a second
        const strength = Math.min(1.2, Math.hypot(dx, dy) / R * 1.4) * Math.min(1.5, speed / (R * 3));
        if (strength > 0.01) this.shake(dx, dy, strength, true);
        this.wob.x = Math.max(-0.1, Math.min(0.1, (x - d.x0) / R * 0.12)) * R;
        this.wob.y = Math.max(-0.06, Math.min(0.06, (y - d.y0) / R * 0.08)) * R;
        this.wob.v += Math.max(-0.4, Math.min(0.4, dx / R * 0.6));
        this.host.idleUntil(0);
    }
    shake(dx, dy, strength, quiet = false) {
        SnowGlobeLogic.shake(this.sim, dx, dy, strength, Math.random);
        if (!quiet) this.wob.v += Math.sign(dx || 1) * 0.15 * strength;
        this.stats.shakes++;
        this.innerDirty = true;
    }
    wind(silent) {
        const was = this.music.wind > 0;
        SnowGlobeLogic.wind(this.music);
        if (!was) this.tune = this.config.tune === 'auto' ? SnowGlobeLogic.TUNE_ORDER[this.stats.winds % SnowGlobeLogic.TUNE_ORDER.length] : this.config.tune;
        this.stats.winds++;
        if (!silent) this.host.toast(`♪ ${SnowGlobeLogic.TUNES[this.tune].name}`, 1800);
        this.host.idleUntil(0);
    }
    // Keys.
    keyShake() { const a = Math.random() * Math.PI * 2; this.shake(Math.cos(a), Math.sin(a) - 0.5, 1.1); this.wob.v += 0.3; this.host.idleUntil(0); return 'Shake, shake'; }
    keyWind() { this.wind(true); return `♪ ${SnowGlobeLogic.TUNES[this.tune].name}`; }
    keyBat() {
        if (!this.catArt) { this.keyShake(); return 'No cat today: shaken by hand'; }
        this.catState.state = 'bat'; this.catState.t = 0; this.catState.hit = false; this.host.idleUntil(0);
        return `${this.catArt.C.name} takes a swipe`;
    }
    keyScene() {
        const order = SnowGlobeLogic.SCENE_ORDER, next = order[(order.indexOf(this.scene) + 1) % order.length];
        this.config.scene = next;
        WP.settings.save(this.config);
        this.pickScene();
        this.resize();
        SnowGlobeLogic.scatter(this.sim, 0.4, Math.random);
        return SnowGlobeLogic.SCENE_NAMES[next];
    }

    // ---- Sound: a music box, if Sound is on (after the first tap or click) ----------------------
    unlockAudio() {
        if (!this.config.sound || this.audio || this.host.params.thumb) return;
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        try { this.audio = new Ctx(); this.master = this.audio.createGain(); this.master.gain.value = 0.16 * this.config.volume; this.master.connect(this.audio.destination); } catch { this.audio = null; }
    }
    pluck(midi) {
        const a = this.audio;
        if (!a || a.state !== 'running') return;
        this.master.gain.value = 0.16 * this.config.volume;
        const f = SnowGlobeLogic.hz(midi + 12), t = a.currentTime;
        for (const [k, g0, dec] of [[1, 1, 1.8], [2, 0.32, 0.9], [3.01, 0.12, 0.5], [5.4, 0.05, 0.12]]) {
            const o = a.createOscillator(), g = a.createGain();
            o.type = 'sine'; o.frequency.value = f * k;
            g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(g0, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0008, t + dec);
            o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dec + 0.05);
        }
    }

    // ---- A frame ---------------------------------------------------------------------------------

    frame(now) {
        if (!this.running) return;
        const dt = this.lastNow ? Math.min(0.1, Math.max(0, (now - this.lastNow) / 1000)) : 0;
        this.lastNow = now;
        this.pump(this.host.params.thumb ? 40 : 6);
        this.update(dt);
        this.draw();
        this.pace();
        this.stats.frames++;
        this.frameId = requestAnimationFrame(t => this.frame(t));
    }

    update(dt) {
        const L = this.L, S = SnowGlobeLogic, c = this.config, m = this.music;
        this.time += dt;
        // The music box and the turntable.
        const turning = m.omega;
        S.musicStep(m, dt, { seconds: c.musicSeconds, turning: c.turning });
        if (m.omega || turning) this.innerDirty = true;
        for (const n of S.notesDue(m, dt, this.tune || 'silent')) {
            this.stats.notes++;
            if (c.sound) this.pluck(n.midi);
            if (this.notes.length < 16) this.notes.push({ x: L.base.x + (Math.random() - 0.5) * L.R * 0.9, y: L.base.top, age: 0, kind: n.beats < 1 ? 1 : 0, sway: Math.random() * 6 });
        }
        for (const n of this.notes) { n.age += dt; n.y -= dt * L.R * 0.35; n.x += Math.sin(n.age * 2 + n.sway) * dt * L.R * 0.12; }
        this.notes = this.notes.filter(n => n.age < 2.6);
        // The snow in the water.
        this.sim.theta = m.theta;
        // (The skaters skate and the train goes round only while the music plays.)
        if (m.tempo > 0.05) this.spinT = (this.spinT || 0) + dt * m.tempo;
        this.placed = S.placed(this.scene, m.theta, this.spinT || 0);
        this.loose = S.step(this.sim, dt, this.placed);
        if (this.loose > 0) this.innerDirty = true;
        // The cat.
        if (this.catArt) {
            const swirl = Math.min(1, this.loose / Math.max(30, this.sim.flakes.length * 0.25)) * 0.7 + Math.min(0.3, S.stir(this.sim) * 0.2);
            const auto = c.autoShake === 'cat';
            for (const e of S.catStep(this.catState, dt, { rand: Math.random, swirl, calmFor: this.sim.calmFor, mischief: c.mischief, byCat: auto, every: c.shakeMinutes * 60, headTo: this.headTo() })) {
                const s = -this.side;
                if (e === 'tap') { this.shake(s, -0.4, 0.3, true); this.wob.v += s * 0.12; }
                if (e === 'bat') { this.shake(s, -0.6, 1.15, true); this.wob.v += s * 0.45; this.stats.catShakes++; }
            }
        }
        if (c.autoShake === 'timer' && this.sim.calmFor > c.shakeMinutes * 60) { this.keyShake(); this.stats.catShakes++; }
        // The globe rocks on its base, and comes back to where it was after a drag.
        const w = this.wob, k = 1 - Math.exp(-dt * 6);
        w.v += (-38 * w.a - 3.2 * w.v) * dt; w.a += w.v * dt;
        if (Math.abs(w.a) < 1e-4 && Math.abs(w.v) < 1e-3) { w.a = 0; w.v = 0; }
        w.a = Math.max(-0.12, Math.min(0.12, w.a));
        if (!this.drag) { w.x -= w.x * k; w.y -= w.y * k; if (Math.abs(w.x) < 0.05) w.x = 0; if (Math.abs(w.y) < 0.05) w.y = 0; }
        // Snow falling past the window; smoke from the chimneys inside.
        this.stepOutside(dt);
        this.stepSmoke(dt);
    }
    // Smoke from the chimneys in the globe (and the train's while it runs): puffs that rise, spread and fade.
    stepSmoke(dt) {
        const S = SnowGlobeLogic, R = this.L.R, playing = this.music.tempo > 0.05;
        for (const p of this.smoke) { p.age += dt; p.y -= dt * R * 0.07; p.x += dt * R * (0.025 + 0.02 * Math.sin(p.age * 1.5 + p.ph)); }
        this.smoke = this.smoke.filter(p => p.age < p.life);
        if (!this.placed || !this.config.lights) return;
        this.placed.forEach((pl, i) => {
            const m = this.models[i];
            if (!m?.smoke || (m.smokeMoving && !playing)) return;
            m.puffT = (m.puffT || 0) - dt;
            if (m.puffT > 0 || this.smoke.length > 36) return;
            m.puffT = 0.4 + Math.random() * 0.3;
            const v = S.view(pl), q = S.at(v, ...m.smoke);
            this.smoke.push({ x: q[0] * R, y: q[1] * R, age: 0, life: 3 + Math.random(), ph: Math.random() * 6, k: v.k });
        });
        if (this.smoke.length) this.innerDirty = true;
    }
    // Whether anything flickers, twinkles or drifts at rest (and so wants fourteen frames a second).
    ambient() {
        const c = this.config;
        return this.candleOn || this.outside.length > 0 || this.smoke.length > 0 || this.scene === 'lighthouse' && c.lights
            || ((this.windowLightsOn || this.treeOn) && c.twinkle !== 'steady');
    }
    // Where the cat looks when it watches: at the globe.
    headTo() { return 0.85; }
    stepOutside(dt) {
        const c = this.config, L = this.L, win = L.win;
        if (c.room === 'mantel' || c.snowOutside <= 0) { this.outside = []; return; }
        const want = Math.round(160 * c.snowOutside * this.density());
        while (this.outside.length < want) this.outside.push({ x: win.x + Math.random() * win.w, y: win.y + Math.random() * win.h * (this.outside.length < want * 0.9 && this.stats.frames < 2 ? 1 : 0) - 4, z: 0.3 + Math.random() * 0.7, ph: Math.random() * 6 });
        if (this.outside.length > want) this.outside.length = want;
        for (const f of this.outside) {
            f.y += dt * (14 + 40 * f.z); f.x += dt * (Math.sin(this.time * 0.6 + f.ph) * 8 * f.z + 5);
            if (f.y > win.y + win.h + 4) { f.y = win.y - 4; f.x = win.x + Math.random() * win.w; }
            if (f.x > win.x + win.w + 4) f.x = win.x - 4;
        }
    }
    // How often frames are needed: all of them while anything moves; fourteen a
    // second for the candle and the cat; a few while the cat sleeps and nothing
    // else stirs (SnowGlobeLogic.restWait: a wait in ms, as idleUntil takes it).
    pace() {
        const m = this.music, w = this.wob, busy = this.loose > 0 || m.omega > 0.001 || m.wind > 0 || w.a || w.v || w.x || w.y || this.drag || this.notes.length || this.jobs.length
            || (this.catArt && (this.catState.state === 'tap' || this.catState.state === 'bat' || this.catState.paw > 0.01));
        this.calm = !busy;
        if (busy) return;
        const cat = !this.catArt ? 'none' : this.catState.state === 'sleep' ? 'asleep' : 'awake';
        this.restMs = SnowGlobeLogic.restWait({ busy, cat, ambient: this.ambient() });
        this.host.idleUntil(this.restMs);
    }

    // ---- Drawing -----------------------------------------------------------------------------------

    draw() {
        const g = this.ctx, L = this.L, dpr = this.dpr;
        // Snow past the window.
        const sg = this.snowCtx;
        sg.setTransform(dpr, 0, 0, dpr, 0, 0);
        sg.clearRect(L.win.x - 8, L.win.y - 8, L.win.w + 16, L.win.h + 16);
        for (const f of this.outside) { const r = 0.6 + f.z * 1.6; sg.globalAlpha = 0.35 + 0.55 * f.z; sg.drawImage(this.sprites.outside, f.x - r * 1.6, f.y - r * 1.6, r * 3.2, r * 3.2); }
        sg.globalAlpha = 1;
        // Everything in front.
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, this.canvas.width, this.canvas.height);
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.drawCandle(g);
        this.drawLights(g);
        if (this.innerDirty || this.scene === 'lighthouse') { this.drawInner(); this.innerDirty = false; }
        this.drawGlobe(g);
        if (this.catArt) this.drawCat(g);
        for (const n of this.notes) { const a = Math.min(1, n.age * 4) * Math.max(0, 1 - n.age / 2.6), s = this.sprites.notes[n.kind], wd = s.width / this.ps; g.globalAlpha = a; g.drawImage(s, n.x - wd / 2, n.y - wd / 2, wd, wd); }
        g.globalAlpha = 1;
    }
    put(g, c, x, y, w = c.width / this.ps, h = c.height / this.ps) { g.drawImage(c, x, y, w, h); }

    drawCandle(g) {
        if (!this.candleOn || !this.flame) return;
        const f = this.flame, t = this.time, flick = 0.85 + 0.1 * Math.sin(t * 11.3) * Math.sin(t * 7.1) + 0.06 * Math.sin(t * 23.7);
        const s = this.sprites.flameGlow, gw = s.width / this.ps * (0.9 + 0.12 * flick);
        g.globalAlpha = 0.32 * flick; g.drawImage(s, f.x - gw / 2, f.y - gw / 2, gw, gw); g.globalAlpha = 1;
        const h = f.h * (0.9 + 0.2 * flick), lean = Math.sin(t * 1.7) * 0.15 + Math.sin(t * 5.3) * 0.05;
        g.save(); g.translate(f.x, f.y); g.rotate(lean);
        const gr = g.createRadialGradient(0, -h * 0.35, 0, 0, -h * 0.35, h * 0.6);
        gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(0.35, 'rgba(255,220,130,0.95)'); gr.addColorStop(0.8, 'rgba(255,140,50,0.6)'); gr.addColorStop(1, 'rgba(255,100,30,0)');
        g.fillStyle = gr; g.beginPath(); g.moveTo(0, -h); g.bezierCurveTo(h * 0.32, -h * 0.5, h * 0.26, 0, 0, h * 0.08); g.bezierCurveTo(-h * 0.26, 0, -h * 0.32, -h * 0.5, 0, -h); g.fill();
        g.fillStyle = 'rgba(80,120,255,0.35)'; g.beginPath(); g.ellipse(0, -h * 0.05, h * 0.09, h * 0.12, 0, 0, Math.PI * 2); g.fill();
        g.restore();
    }

    // The room's lights: the string round the window (or along the mantel),
    // the little tree's; steady, twinkling, chasing or fading, in the colours chosen.
    lightCols(name) { return SNOW_GLOBE_LIGHTS[name] || SNOW_GLOBE_LIGHTS.multi; }
    bulbGlow(col) { const k = col.join(','); return this.sprites.bulbs[k] || (this.sprites.bulbs[k] = SnowGlobeArt.glow(this.L.R * 0.09 * this.ps, col, 0.3)); }
    // How bright bulb i (u along its string, 0 to 1) is now.
    bright(i, u, mode) {
        const t = this.time;
        if (mode === 'steady') return 1;
        if (mode === 'chase') return 0.25 + 0.75 * Math.pow(Math.max(0, Math.sin(u * 26 - t * 3.2)), 2);
        if (mode === 'fade') return 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 0.9 + (i % 3) * 2.09));
        const q = Math.sin(i * 91.7) * 43758.5453, f = q - Math.floor(q);
        return 0.55 + 0.45 * Math.sin(t * (1.3 + f * 2.2) + f * 40) * (f > 0.75 ? 1.4 : 0.8);
    }
    drawBulbs(g, list, cols, mode, size, n) {
        const R = this.L.R;
        for (const b of list) {
            const col = cols[b.i % cols.length], k = Math.max(0, Math.min(1, this.bright(b.i, b.u ?? b.i / n, mode))) * (b.front != null ? 0.55 + 0.45 * b.front : 1), r = R * size;
            g.fillStyle = `rgb(${col[0] * (0.45 + 0.55 * k) | 0},${col[1] * (0.45 + 0.55 * k) | 0},${col[2] * (0.45 + 0.55 * k) | 0})`;
            g.beginPath(); g.ellipse(b.x, b.y, r * 0.55, r * 0.8, 0, 0, Math.PI * 2); g.fill();
            if (k > 0.08) {
                const s = this.bulbGlow(col), gr = R * size * 5;
                g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.6 * k; g.drawImage(s, b.x - gr, b.y - gr, gr * 2, gr * 2);
                g.globalAlpha = 0.9 * k; g.fillStyle = '#fffbe8'; g.beginPath(); g.arc(b.x, b.y - r * 0.15, r * 0.3, 0, Math.PI * 2); g.fill();
                g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
            }
        }
    }
    drawLights(g) {
        const c = this.config, K = this.roomKeep;
        if (this.windowLightsOn && K.bulbs.length) this.drawBulbs(g, K.bulbs, this.lightCols(c.windowLights), c.twinkle, 0.022, K.bulbs.length);
        if (this.treeOn && K.treeBulbs.length) {
            const T = this.L.tree;
            this.drawBulbs(g, K.treeBulbs, this.lightCols(c.deskTreeLights), c.twinkle, 0.016 * Math.min(1.3, T.h / (this.L.R * 1.45)), K.treeBulbs.length);
            if (K.treeTop) { const s = this.sprites.flameGlow, r = K.treeTop.r * (0.9 + 0.1 * Math.sin(this.time * 2)); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.35; g.drawImage(s, K.treeTop.x - r, K.treeTop.y - r, r * 2, r * 2); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
        }
    }

    // The scene inside, into its own canvas (only when something in it
    // changed): what is seen through the water behind, the floor (turned with
    // the turntable), the snow lying on it, the snow in the water behind the
    // scene, the scene's solids back to front, smoke and the lighthouse's
    // beam, and the snow in front.
    drawInner() {
        const S = SnowGlobeLogic, M = SnowGlobeModels, L = this.L, R = L.R, ps = this.ps, c = this.inner, g = c.getContext('2d'), sim = this.sim, t = this.time, G = this.groundArt, theta = this.music.theta;
        this.stats.inner++;
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, c.width, c.height);
        g.drawImage(this.behindArt, 0, 0, c.width, c.height);
        g.drawImage(G.canvas, 0, 0, c.width, c.height);
        const placed = this.placed || [], cover = S.cover(sim, placed);
        g.setTransform(ps, 0, 0, ps, R * ps, R * ps);         // CSS px, the globe's centre at 0
        // The floor's top, as it turns: its paths and pond and tracks go round with what stands on it.
        g.save(); g.beginPath(); g.arc(0, 0, R * 0.985, 0, Math.PI * 2); g.clip();
        g.translate(0, G.fy); g.scale(1, S.TILT * 0.98); g.rotate(-theta);
        g.drawImage(G.top, -G.fr, -G.fr, G.fr * 2, G.fr * 2);
        const fresh = Math.min(0.5, cover.ground * 0.7);
        if (fresh > 0.01) { g.globalAlpha = fresh * (S.GROUND[this.scene] === 'sea' || S.GROUND[this.scene] === 'floe' ? 0.6 : 1); g.drawImage(G.fresh, -G.fr, -G.fr, G.fr * 2, G.fr * 2); g.globalAlpha = 1; }
        g.restore();
        g.drawImage(G.shade, -R, -R, R * 2, R * 2);
        // Glitter that has settled on the floor, glinting.
        const glints = this.sprites.glints, twinkle = this.wants('glints');
        for (const f of sim.flakes) {
            if (!f.glitter || f.state !== 1 || f.on >= 0) continue;
            const d = theta - (f.th || 0), x = f.x * Math.cos(d) + f.z * Math.sin(d), z = f.z * Math.cos(d) - f.x * Math.sin(d), p = S.project(x, S.FLOOR, z);
            const a = twinkle ? Math.pow(Math.abs(Math.sin(t * 1.3 + f.phase)), 8) : 0.4;
            if (a < 0.05) continue;
            const sp = glints[Math.floor(f.hue * 5.99)], r = R * 0.02 * f.size;
            g.globalAlpha = a; g.drawImage(sp, p.sx * R - r, p.sy * R - r, r * 2, r * 2);
        }
        g.globalAlpha = 1;
        // Snow behind the scene, the scene, snow in front of it.
        this.drawFlakes(g, -2, -0.15);
        const D = { R, Ld: this.kit.Ld, time: t, spin: this.spinT || 0, lights: this.config.lights, glow: this.sprites.glow, cover: 0 };
        const order = placed.filter(p => !p.flat).sort((a, b) => a.depth - b.depth);
        for (const p of order) {
            const m = this.models[p.i];
            if (!m) continue;
            D.cover = cover.on[p.i] || 0;
            M.draw(g, m, p, D);
            if (m.cone) this.drawTreeLights(g, p, m.cone);
        }
        this.drawSmoke(g);
        for (const p of order) if (this.models[p.i]?.beam && this.config.lights) this.drawBeam(g, p, this.models[p.i].beam);
        this.drawFlakes(g, -0.15, 2);
        g.setTransform(1, 0, 0, 1, 0, 0);
    }
    drawSmoke(g) {
        const s = this.sprites.puff, R = this.L.R;
        for (const p of this.smoke) {
            const u = p.age / p.life, r = R * 0.035 * p.k * (0.6 + u * 2.2);
            g.globalAlpha = Math.min(1, u * 6) * (1 - u) * 0.45; g.drawImage(s, p.x - r, p.y - r, r * 2, r * 2);
        }
        g.globalAlpha = 1;
    }
    // The lighthouse's beam, going round on its own: brightest at the lamp,
    // a flash when it points at us, faint as it swings away.
    drawBeam(g, pl, lamp) {
        const S = SnowGlobeLogic, R = this.L.R, v = S.view(pl), b = this.time * 0.9, dir = [Math.sin(b), -0.06, Math.cos(b)];
        const a = S.at(v, ...lamp), e = S.at(v, lamp[0] + dir[0] * 0.8, lamp[1] + dir[1] * 0.8, lamp[2] + dir[2] * 0.8), f = S.facing(v, ...dir);
        const ax = a[0] * R, ay = a[1] * R, ex = e[0] * R, ey = e[1] * R, dx = ex - ax, dy = ey - ay, l = Math.hypot(dx, dy) || 1, w = R * 0.11 * v.k;
        g.globalCompositeOperation = 'lighter';
        if (l > R * 0.05) {
            const gr = g.createLinearGradient(ax, ay, ex, ey); gr.addColorStop(0, `rgba(255,244,200,${0.4 * (0.4 + 0.6 * (1 - Math.abs(f)))})`); gr.addColorStop(1, 'rgba(255,244,200,0)');
            g.fillStyle = gr; g.beginPath(); g.moveTo(ax - dy / l * w * 0.1, ay + dx / l * w * 0.1); g.lineTo(ex - dy / l * w, ey + dx / l * w); g.lineTo(ex + dy / l * w, ey - dx / l * w); g.lineTo(ax + dy / l * w * 0.1, ay - dx / l * w * 0.1); g.closePath(); g.fill();
        }
        const flash = Math.pow(Math.max(0, f), 6), s = this.sprites.beam, r = R * (0.12 + 0.45 * flash) * v.k;
        g.globalAlpha = 0.25 + 0.75 * flash; g.drawImage(s, ax - r, ay - r, r * 2, r * 2);
        g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
    // The snow in the water between two depths: snow flakes soft, starred or
    // clumped, bigger and softer the nearer the glass (out of focus), smaller
    // and dimmer far; glitter as sequins that tumble (squashed as they turn
    // edge on) and flash when they come face on to the light.
    drawFlakes(g, d0, d1) {
        const S = SnowGlobeLogic, R = this.L.R, t = this.time, sp = this.sprites, twinkle = this.wants('glints'), playing = this.music.tempo > 0.05;
        for (const f of this.sim.flakes) {
            if (f.state !== 0) continue;
            const p = S.project(f.x, f.y, f.z);
            if (p.depth < d0 || p.depth >= d1) continue;
            const k = 1 + 0.32 * p.depth, x = p.sx * R, y = p.sy * R;
            if (f.glitter) {
                const r = R * 0.019 * f.size * k, c = Math.cos(f.tum), sq = Math.max(0.12, Math.abs(c)), img = sp.sequins[f.shape === 4 ? 1 : 0][Math.floor(f.hue * 5.99)];
                g.globalAlpha = 0.55 + 0.4 * sq;
                if (f.i & 1) g.drawImage(img, x - r, y - r * sq, r * 2, r * 2 * sq); else g.drawImage(img, x - r * sq, y - r, r * 2 * sq, r * 2);
                if (twinkle) {
                    const flash = Math.pow(Math.max(0, Math.abs(c) - 0.9) * 10, 3) * (playing ? 1.2 : 1);
                    if (flash > 0.04) { const gr = r * (2.2 + flash * 1.6); g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.min(1, flash); g.drawImage(sp.glints[Math.floor(f.hue * 5.99)], x - gr, y - gr, gr * 2, gr * 2); g.globalCompositeOperation = 'source-over'; }
                }
            } else {
                const near = p.depth > 0.45, far = p.depth < -0.35, r = R * 0.02 * f.size * k * (near ? 1.5 : 1);
                g.globalAlpha = near ? 0.45 : far ? 0.5 + 0.2 * (p.depth + 1) : 0.85;
                const img = near ? sp.soft : f.shape === 1 ? sp.stars[Math.floor(((f.rot % 1.0472) + 1.0472) % 1.0472 / 0.17454) % 6] : f.shape === 2 ? sp.clump : sp.flake;
                const rr = f.shape === 1 && !near ? r * 1.25 : r;
                g.drawImage(img, x - rr, y - rr, rr * 2, rr * 2);
            }
        }
        g.globalAlpha = 1;
    }
    // The big tree's lights go round with it (on its cone, the far side's hidden).
    drawTreeLights(g, pl, cone) {
        const S = SnowGlobeLogic, v = S.view(pl), R = this.L.R, t = this.time, cols = [[255, 90, 70], [255, 210, 100], [100, 220, 130], [120, 160, 255], [255, 150, 220]], glow = this.sprites.glow;
        for (let i = 0; i < 46; i++) {
            const u = 0.1 + (i * 0.618 % 1) * 0.82, a = i * 2.39996, half = cone.w * 0.5 * (1 - u * 0.85) * 0.95, f = S.facing(v, Math.sin(a), 0.2, Math.cos(a));
            if (f < -0.1) continue;
            const q = S.at(v, Math.sin(a) * half, cone.h * (0.06 + u * 0.88), Math.cos(a) * half), x = q[0] * R, y = q[1] * R;
            const col = cols[i % 5], tw = this.config.lights ? 0.55 + 0.45 * Math.sin(t * 2.5 + i * 1.7) : 0;
            g.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`; g.globalAlpha = 0.6 + 0.4 * Math.max(0, f); g.beginPath(); g.arc(x, y, R * 0.009 * v.k, 0, Math.PI * 2); g.fill();
            if (tw > 0.05) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = tw * 0.5 * (0.5 + 0.5 * Math.max(0, f)); const r = R * 0.05 * v.k; g.drawImage(glow, x - r, y - r, r * 2, r * 2); g.globalCompositeOperation = 'source-over'; }
        }
        g.globalAlpha = 1;
    }

    // The globe on its base, rocking; the water's scene seen through the glass,
    // squeezed toward the rim as a ball of water bends it.
    drawGlobe(g) {
        const L = this.L, R = L.R, w = this.wob, B = this.baseArt, inner = this.inner;
        g.save();
        g.translate(L.base.x + w.x, L.foot + w.y); g.rotate(w.a); g.translate(-L.base.x, -L.foot);
        this.put(g, B.back, B.x, B.y);
        g.save(); g.beginPath(); g.arc(L.cx, L.cy, R, 0, Math.PI * 2); g.clip();
        g.drawImage(inner, L.cx - R, L.cy - R, R * 2, R * 2);
        if (this.wants('refraction')) {
            for (let i = 0; i < 5; i++) {
                const r0 = R * (0.8 + i * 0.04), r1 = r0 + R * 0.042, s = 1 - 0.035 * Math.pow(i + 1, 1.25);
                g.save(); g.beginPath(); g.arc(L.cx, L.cy, r1, 0, Math.PI * 2); g.arc(L.cx, L.cy, r0, 0, Math.PI * 2, true); g.clip();
                g.drawImage(inner, L.cx - R * s, L.cy - R * s, R * 2 * s, R * 2 * s);
                g.restore();
            }
        }
        // The room's lights, seen through the water: upside down, bigger, out of focus (as the room behind is).
        this.drawLightsInWater(g);
        g.restore();
        this.put(g, this.glassArt, L.cx - R, L.cy - R, R * 2, R * 2);
        if (this.candleOn) {
            // The candle's flicker on the glass.
            const t = this.time, flick = 0.5 + 0.5 * Math.sin(t * 9.1) * Math.sin(t * 5.3), s = this.sprites.glow, r = R * 0.35;
            g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.1 + 0.08 * flick;
            g.drawImage(s, L.cx - this.side * R * 0.6 - r, L.cy - R * 0.15 - r, r * 2, r * 2);
            g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
        }
        this.put(g, B.front, B.x, B.y);
        SnowGlobeArt.key(g, B.key.x, B.key.y, R * 0.18, this.music.theta * 3, this.side);
        g.restore();
        if (this.black && this.config.reflection) this.drawReflection(g);
    }
    drawLightsInWater(g) {
        const c = this.config, K = this.roomKeep, L = this.L, R = L.R;
        if (!(this.windowLightsOn || this.treeOn)) return;
        const put = (list, cols) => {
            for (const b of list) {
                const x = L.cx - 1.25 * (b.x - L.cx), y = L.cy - 1.25 * (b.y - (L.cy - R * 0.25));
                if (Math.hypot(x - L.cx, y - L.cy) > R * 0.95) continue;
                const col = cols[b.i % cols.length], k = Math.max(0, this.bright(b.i, b.u ?? 0, c.twinkle)), s = this.bulbGlow(col), r = R * 0.1;
                g.globalAlpha = 0.28 * k; g.drawImage(s, x - r, y - r, r * 2, r * 2);
            }
        };
        g.globalCompositeOperation = 'lighter';
        if (this.windowLightsOn) put(K.bulbs, this.lightCols(c.windowLights));
        if (this.treeOn) put(K.treeBulbs, this.lightCols(c.deskTreeLights));
        g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
    // On black: the globe and its base mirrored in the black it stands on, faint, fading away below.
    drawReflection(g) {
        const L = this.L, R = L.R, B = this.baseArt, w = this.wob, h = Math.min(L.H - L.foot, R * 1.4);
        if (h < 4) return;
        g.save();
        g.beginPath(); g.rect(0, L.foot, L.W, h); g.clip();
        g.translate(L.base.x + w.x, L.foot); g.rotate(-w.a); g.scale(1, -0.9); g.translate(-L.base.x, -L.foot);
        g.globalAlpha = 0.22;
        this.put(g, B.front, B.x, B.y);
        g.save(); g.beginPath(); g.arc(L.cx, L.cy, R, 0, Math.PI * 2); g.clip(); g.drawImage(this.inner, L.cx - R, L.cy - R, R * 2, R * 2); g.restore();
        g.globalAlpha = 1;
        g.restore();
        const gr = g.createLinearGradient(0, L.foot, 0, L.foot + h); gr.addColorStop(0, 'rgba(0,0,0,0.15)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.85)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
        g.fillStyle = gr; g.fillRect(0, L.foot, L.W, h);
    }

    // The cat: its body (breathing), its tail (dabs along a curve, live), the
    // near paw (which taps), its head (turning, tilting), its eyes and whiskers.
    drawCat(g) {
        const A = this.catArt, c = this.catState, L = this.L, h = L.cat.h, x0 = L.cat.x, y0 = L.cat.y, s = A.s, t = this.time, puff = A.puff;
        const X = x => x0 + x * h, Y = y => y0 - y * h;
        const breathe = 1 + 0.012 * Math.sin(t * (c.state === 'sleep' ? 1.3 : 2.2));
        // The tail: out from behind the haunch and round the front of the paws, the tip swishing (SnowGlobeLogic.tailLine).
        const sway = Math.sin(c.tail * 1.7) * (c.state === 'watch' ? 0.07 : 0.03) + (c.state === 'tap' || c.state === 'bat' ? 0.05 * Math.sin(t * 14) : 0), lift = c.state === 'watch' ? 0.05 + 0.03 * Math.sin(c.tail * 2.3) : 0.01;
        const tail = SnowGlobeLogic.tailLine(s, puff, sway, lift);
        this.drawTail(g, tail.pts, 0, X, Y, h);
        // The body.
        const B = A.body, bw = B.canvas.width / this.ps, bh = B.canvas.height / this.ps;
        g.save(); g.translate(X(0), Y(0)); g.scale(1, breathe); g.drawImage(B.canvas, -B.ax, -B.ay, bw, bh); g.restore();
        // The near fore leg: up to the glass for a tap or a swipe, to the mouth to groom.
        const groom = c.state === 'groom' ? 0.55 + 0.1 * Math.sin(t * 6) : 0, paw = Math.max(c.paw, groom);
        const Lg = A.leg, sh = A.shoulder, lw = Lg.canvas.width / this.ps, lh = Lg.canvas.height / this.ps;
        g.save(); g.translate(X(sh.x), Y(sh.y * breathe)); g.rotate(-s * paw * (c.state === 'bat' ? 1.75 : 1.45)); g.drawImage(Lg.canvas, -Lg.ax, -Lg.ay, lw, lh); g.restore();
        // The rest of the tail lies in front of the paws.
        this.drawTail(g, tail.pts, tail.front, X, Y, h);
        // The head.
        const sleep = c.sleep, look = c.head, H = A.head, hw = H.canvas.width / this.ps, hh = H.canvas.height / this.ps;
        const hx = X(A.headAt.x + s * look * 0.018), hy = Y(A.headAt.y * breathe - 0.06 * sleep - 0.04 * groom + 0.006 * Math.sin(t * 2.2));
        const tilt = s * (look * 0.12 - 0.15 * sleep + 0.25 * groom) + 0.06 * Math.sin(t * 0.7) * (c.state === 'sit' ? 1 : 0);
        g.save(); g.translate(hx, hy); g.rotate(tilt);
        g.drawImage(H.canvas, -H.ax, -H.ay, hw, hh);
        // Eyes: open, wide while the snow flies, shut asleep or in a slow blink.
        const open = Math.max(0, Math.min(1.25, c.eyes)), ex = s * (0.03 + look * 0.02), er = 0.034 * h;
        for (const e of [-1, 1]) {
            const x = (e * 0.065 + ex) * h, y = -0.025 * h;
            if (open < 0.12) { g.strokeStyle = 'rgba(30,22,26,0.85)'; g.lineWidth = Math.max(1, h * 0.006); g.beginPath(); g.arc(x, y - er * 0.4, er * 0.9, 0.35, Math.PI - 0.35); g.stroke(); continue; }
            g.save(); g.beginPath(); g.ellipse(x, y, er, er * 0.78 * Math.min(1, open), e * -0.1, 0, Math.PI * 2); g.clip();
            g.fillStyle = `rgb(${A.eyes[0]},${A.eyes[1]},${A.eyes[2]})`; g.fillRect(x - er, y - er, er * 2, er * 2);
            const pr = er * (open > 1.05 ? 0.62 : 0.24);
            g.fillStyle = '#0c0a0c'; g.beginPath(); g.ellipse(x + s * look * er * 0.25, y, pr, er * 0.75, 0, 0, Math.PI * 2); g.fill();
            g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.arc(x - er * 0.3, y - er * 0.3, er * 0.18, 0, Math.PI * 2); g.fill();
            g.restore();
            g.strokeStyle = 'rgba(20,16,18,0.7)'; g.lineWidth = Math.max(0.8, h * 0.004); g.beginPath(); g.ellipse(x, y, er, er * 0.78 * Math.min(1, open), e * -0.1, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
        }
        // Whiskers, and a grin for the one who has one.
        g.strokeStyle = 'rgba(245,240,230,0.7)'; g.lineWidth = Math.max(0.6, h * 0.0025);
        for (const e of [-1, 1]) for (const d of [-0.012, 0.004, 0.02]) { g.beginPath(); g.moveTo((s * 0.03 + e * 0.04) * h, (-0.045 + d * 0.3) * h); g.quadraticCurveTo((s * 0.03 + e * 0.13) * h, (-0.05 + d) * h, (s * 0.03 + e * 0.2) * h, (-0.035 + d * 1.6) * h); g.stroke(); }
        if (A.C.grin) { g.strokeStyle = 'rgba(230,220,200,0.6)'; g.lineWidth = Math.max(0.8, h * 0.004); g.beginPath(); g.arc(s * 0.03 * h, -0.07 * h, 0.035 * h, 0.3, Math.PI - 0.3); g.stroke(); }
        if (this.festive) {
            // A Santa hat, on Christmas Eve and Day.
            const hx0 = s * 0.01 * h, hy0 = -0.125 * h;
            g.fillStyle = '#c4262e'; g.beginPath(); g.moveTo(hx0 - 0.1 * h, hy0); g.quadraticCurveTo(hx0 + s * 0.01 * h, hy0 - 0.24 * h, hx0 + s * 0.16 * h, hy0 - 0.15 * h); g.lineTo(hx0 + 0.1 * h, hy0); g.closePath(); g.fill();
            g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.moveTo(hx0 + s * 0.02 * h, hy0); g.quadraticCurveTo(hx0 + s * 0.06 * h, hy0 - 0.16 * h, hx0 + s * 0.16 * h, hy0 - 0.15 * h); g.lineTo(hx0 + s * 0.1 * h, hy0); g.closePath(); g.fill();
            g.fillStyle = '#f4f0ea'; g.beginPath(); g.ellipse(hx0, hy0, 0.115 * h, 0.03 * h, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(hx0 + s * 0.16 * h, hy0 - 0.15 * h, 0.026 * h, 0, Math.PI * 2); g.fill();
        }
        g.restore();
        // Asleep: z's; stroked: a purr.
        if (c.sleep > 0.5) for (let i = 0; i < 3; i++) { const u = (t * 0.25 + i / 3) % 1; g.globalAlpha = Math.sin(u * Math.PI) * 0.8; g.fillStyle = '#e8ecf8'; g.font = `italic ${Math.round(h * (0.06 + u * 0.05))}px Georgia, serif`; g.fillText('z', hx - s * h * (0.12 + u * 0.12), hy - h * (0.12 + u * 0.22)); }
        if (c.purr > 0.3) { g.strokeStyle = `rgba(255,230,200,${0.5 * c.purr})`; g.lineWidth = Math.max(1, h * 0.005); for (let i = 0; i < 3; i++) { const r = h * (0.05 + ((t * 0.8 + i / 3) % 1) * 0.08); g.beginPath(); g.arc(X(s * 0.08), Y(0.55), r, -0.6, 0.6); g.stroke(); g.beginPath(); g.arc(X(s * 0.08), Y(0.55), r, Math.PI - 0.6, Math.PI + 0.6); g.stroke(); } }
        g.globalAlpha = 1;
    }

    // One smooth tapered stroke from point i0 to the tip: the coat, its stripes, a lit top and a shaded underside.
    drawTail(g, pts, i0, X, Y, h) {
        const A = this.catArt, P = A.P, n = pts.length - 1, left = [], right = [];
        for (let i = i0; i <= n; i++) {
            const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n, i + 1)], dx = X(b[0]) - X(a[0]), dy = Y(b[1]) - Y(a[1]), l = Math.hypot(dx, dy) || 1, r = pts[i][2] * h;
            const x = X(pts[i][0]), y = Y(pts[i][1]);
            left.push([x - dy / l * r, y + dx / l * r]); right.push([x + dy / l * r, y - dx / l * r]);
        }
        const tip = pts[n], tx = X(tip[0]), ty = Y(tip[1]), tr = tip[2] * h;
        // (Its outline goes out along one side and back along the other: one closed piece, one winding.)
        const path = new Path2D();
        path.moveTo(left[0][0], left[0][1]);
        for (const q of left) path.lineTo(q[0], q[1]);
        for (let i = right.length - 1; i >= 0; i--) path.lineTo(right[i][0], right[i][1]);
        path.closePath();
        const cap = new Path2D(); cap.arc(tx, ty, tr, 0, Math.PI * 2);
        const col = c => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
        g.fillStyle = col(P.base); g.fill(path); g.fill(cap);
        g.save(); g.clip(path); g.lineCap = 'round';
        // Along it: the underside in shadow, the top in the light.
        const line = (off, w, style) => { g.strokeStyle = style; g.lineWidth = w; g.beginPath(); for (let i = i0; i <= n; i++) { const p = pts[i], x = X(p[0]), y = Y(p[1]) + off * p[2] * h; i === i0 ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke(); };
        line(0.8, h * 0.035, 'rgba(10,8,18,0.32)');
        line(-0.6, h * 0.02, `rgba(${P.light[0]},${P.light[1]},${P.light[2]},0.5)`);
        // A painted coat: short strokes along it, in the coat's colours and its stripes or patches (the same every frame).
        const band = P.stripe || (P.mottle && P.mottle[0]) || P.patches, cols = [P.base, P.light, P.base, band || P.base];
        for (let i = i0 + 1; i < n; i++) {
            const a = pts[i - 1], b = pts[i + 1], dx = X(b[0]) - X(a[0]), dy = Y(b[1]) - Y(a[1]), l = Math.hypot(dx, dy) || 1, r = pts[i][2] * h, x = X(pts[i][0]), y = Y(pts[i][1]);
            for (let k = 0; k < 3; k++) {
                const q = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453, f = q - Math.floor(q), off = (f - 0.5) * 1.6 * r;
                const stripe = band && (P.stripe ? i % 3 === 0 : f > 0.6);
                g.strokeStyle = col(stripe ? band : cols[(i + k) % 3]); g.globalAlpha = stripe ? 0.55 : 0.38; g.lineWidth = r * (stripe ? 0.6 : 0.45);
                g.beginPath(); g.moveTo(x - dy / l * off - dx / l * r * 1.0, y + dx / l * off - dy / l * r * 1.0); g.lineTo(x - dy / l * off + dx / l * r * 1.4, y + dx / l * off + dy / l * r * 1.4); g.stroke();
            }
        }
        g.globalAlpha = 1;
        g.restore();
        if (P.white && P.bib) { g.fillStyle = col(P.white); g.beginPath(); g.arc(tx, ty, tr * 1.15, 0, Math.PI * 2); g.fill(); }
        // Fur at the edge, a fluffy coat's more so.
        const fl = A.C.fluff || 0;
        g.strokeStyle = `rgba(${P.base[0]},${P.base[1]},${P.base[2]},0.7)`; g.lineWidth = h * (0.006 + 0.006 * fl); g.lineJoin = 'round'; g.stroke(path);
    }

    // ---- For tests -------------------------------------------------------------------------------

    centres() { const L = this.L; return { globe: { x: L.cx, y: L.cy, r: L.R }, base: { x: L.base.x, y: (L.base.top + L.foot) / 2 }, cat: this.catArt ? { x: L.cat.x, y: L.cat.y - L.cat.h * 0.4 } : null }; }
    debugState() {
        const sim = this.sim, cover = SnowGlobeLogic.cover(sim, this.placed || []);
        return {
            scene: this.scene, cat: this.catArt ? this.catId : null, catState: this.catState.state, festive: this.festive, loose: SnowGlobeLogic.count(sim), flakes: sim.flakes.length,
            ground: +cover.ground.toFixed(3), roofs: cover.on.filter(Boolean).length, calm: !!this.calm, calmFor: +sim.calmFor.toFixed(2), stir: +SnowGlobeLogic.stir(sim).toFixed(3),
            music: { wind: +this.music.wind.toFixed(3), omega: +this.music.omega.toFixed(3), theta: +this.music.theta.toFixed(3), tempo: +this.music.tempo.toFixed(3), played: this.music.played, tune: this.tune || null },
            black: !!this.black, bulbs: this.windowLightsOn ? this.roomKeep.bulbs.length : 0, treeBulbs: this.treeOn ? this.roomKeep.treeBulbs.length : 0, models: this.models.filter(Boolean).length, smoke: this.smoke.length,
            wobble: +this.wob.a.toFixed(4), painted: +this.painted().toFixed(3), notes: this.notes.length, outside: this.outside.length, ps: this.ps, stats: { ...this.stats },
        };
    }
}
