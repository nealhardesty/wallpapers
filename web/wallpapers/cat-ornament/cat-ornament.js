// The Cat vs. the Ornament (SPEC §10.27): a classic Christmas problem. A
// tree in a warm room; one ornament hangs low; the household's cats take
// turns with it. One lurks under the boughs with only its eyes (and, if
// it's Moofy, its grin) showing; one stares at it for an uncomfortably long
// time; a paw comes out; the ornament swings, and sometimes ends up on the
// floor. Now and then a cat goes up the tree, and the tree comes down:
// ornaments everywhere, the lights out, a cat with no idea what happened.
// Then a fade, "some time later", and the tree is up again. The cats not
// at the ornament sleep, loaf, lounge belly-up, sleep in a box, groom, slow
// blink at you, or (Maus) do laps of the room.
//
// The pure parts (the roster, the pendulum, the fall, the odds) are
// cat-ornament-logic.js; the cats are drawn by cat-ornament-cats.js and the
// room by cat-ornament-room.js. Physics runs on a fixed 60 Hz step; the
// cats move by elapsed time. Tap to shine a laser dot for them to chase.

const CAT_ORNAMENT_STEP = 1 / 60;
const CAT_ORNAMENT_G = 2400;      // px/s², for falling things (CSS px, scaled by the room)

class CatOrnamentAnimationManager {
    constructor(host) {
        this.host = host;
        this.config = WP.settings.load();
        this.running = false;
        this.time = 0;
        this.cats = [];
        this.loose = [];
        this.hearts = [];
        this.caption = null;
        this.laser = null;
        this.fade = null;
        this.listeners = [];
        this.timers = [];
        this.stats = { cats: 0, still: 0, misses: 0 };     // for tests: cat draws, from the cache, cache misses
    }

    // Something to do in a few of the scene's seconds (paused with it).
    later(seconds, fn) { this.timers.push({ at: this.time + seconds, fn }); }

    get L() { return this.layout; }
    density() { return this.host.quality?.density ?? 1; }
    wants(name) { return this.host.quality?.effects?.includes(name) ?? true; }

    // ---- Lifecycle ----------------------------------------------------------------------

    start() {
        if (this.running) return;
        this.running = true;
        this.canvas = document.createElement('canvas');
        Object.assign(this.canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: '-1', pointerEvents: 'none' });
        document.body.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
        this.lurk = document.createElement('canvas');
        this.holiday = CatOrnamentLogic.holiday(this.host.now());
        this.resize();
        this.buildCast();
        this.seed();
        this.listen();
        this.last = 0;
        this.acc = 0;
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
        if (!this.host.params.thumb) {
            const point = (x, y) => { if (this.config.touch || this.pointerType === 'mouse') this.shine(x, y); };
            on(document, 'pointerdown', e => { this.pointerType = e.pointerType; });
            this.listeners.push(this.host.gestures({ tap: point, start: point, move: point }));
        }
    }

    applySettings(config) {
        const old = this.config;
        this.config = config;
        if (!this.running) return;
        const changed = keys => keys.some(k => JSON.stringify(old[k]) !== JSON.stringify(config[k]));
        if (changed(['time', 'lights', 'ornaments', 'catSize', 'tree', 'treeHeight', 'treeWidth', 'fullness', 'lightCount', 'ornamentCount', 'garland', 'topper', 'presents', 'flocked'])) this.resize();
        if (changed(['cats', 'inRoom', ...CatOrnamentLogic.ROSTER.map(c => this.nameKey(c.id))])) { this.buildCast(); this.seed(true); }
        if (changed(['topple']) && !config.topple && this.tree.state !== 'still') this.resetScene();
    }

    onQuality() { this.snow = null; if (this.wants('firelight') !== this.lively) this.resize(); }

    nameKey(id) { return `name${id[0].toUpperCase()}${id.slice(1)}`; }

    // ---- Layout and baking ----------------------------------------------------------------

    dayAmount() {
        const mode = this.config.time;
        if (mode === 'day') return 1;
        if (mode !== 'live') return 0;
        const d = this.host.now(), h = d.getHours() + d.getMinutes() / 60;
        return h < 7 || h > 17.5 ? 0 : h < 8.5 ? (h - 7) / 1.5 : h > 16 ? (17.5 - h) / 1.5 : 1;
    }

    resize() {
        if (!this.canvas) return;
        const prev = this.layout;
        const dpr = this.dpr = window.devicePixelRatio || 1;
        const W = this.W = innerWidth, H = this.H = innerHeight;
        this.canvas.width = Math.round(W * dpr);
        this.canvas.height = Math.round(H * dpr);
        const c = this.config;
        const L = this.layout = CatRoom.layout(W, H, this.host.insets || {}, c.tree, c.treeHeight, c.treeWidth);
        L.treeKind = c.tree;
        L.u *= this.config.catSize;
        const random = WP.seededRandom(1225);
        // The ornament's side: toward the open floor.
        this.side = L.tall ? -1 : L.treeX > W / 2 ? -1 : 1;
        this.day = Math.round(this.dayAmount() * 2) / 2;
        const palette = CatRoom.PALETTES[this.config.lights] || CatRoom.PALETTES.classic;
        const ornamentColours = CatRoom.ORNAMENTS[this.config.ornaments] || CatRoom.ORNAMENTS.classic;
        this.treeArt = CatRoom.tree({ ...L, u: L.u / this.config.catSize }, dpr, random, palette,
            { fullness: c.fullness, lights: c.lightCount, ornaments: c.ornamentCount, garland: c.garland, topper: c.topper, flocked: c.flocked });
        const ou = L.u / this.config.catSize;
        this.sprites = {
            bulbs: palette.map(c => CatRoom.bulb(c, 11 * ou, dpr)),
            ornaments: this.treeArt.ornaments.map(o => CatRoom.ornament(this.treeArt.charlie ? '#c8202a' : ornamentColours[o.colour % ornamentColours.length], 8 * o.size, o.kind, dpr)),
            the: CatRoom.ornament(ornamentColours[0], 11 * ou, 'ball', dpr),
            star: this.treeArt.topper === 'bow' ? CatRoom.bow(this.treeArt.starR, dpr) : CatRoom.star(this.treeArt.starR, dpr),
            treeGlow: CatRoom.glow(this.glowR(), '#ffb860', 0.32, dpr),
            unlit: CatRoom.glow(this.glowR(), '#060306', 0.75, dpr),
            fire: CatRoom.glow(Math.max(W, H) * 0.5, '#ff8a3a', 0.3, dpr),
            laser: CatRoom.glow(10 * ou, '#ff2a2a', 1, dpr),
            shadow: CatArt.shadowSprite(80 * L.u * dpr),
        };
        this.presents = CatRoom.presents({ ...L, u: ou }, dpr, random, c.presents);
        // The room, with the fire's and the tree's glow painted in (a frame
        // only adds the fire's flicker, at High, and darkness while the tree's
        // lights are out): big soft fills are what a phone can't afford each frame.
        this.lively = this.wants('firelight');
        const fr = Math.max(W, H) * 0.5;
        this.fireX = this.side < 0 ? W + fr * 0.35 : -fr * 0.35;
        this.bg = CatRoom.background({ ...L, u: ou }, dpr, this.day, WP.seededRandom(1225), { fire: this.sprites.fire, glow: this.sprites.treeGlow, glowR: this.glowR(), fireX: this.fireX });
        this.palette = palette;
        this.hookLocal = this.treeArt.hooks[this.side < 0 ? 0 : 1];
        this.tree = this.tree && prev ? this.tree : { phi: 0, omega: 0, state: 'still', lights: 1 };
        this.pendulum = this.pendulum || { theta: 0.15, omega: 0, length: 34 * ou, hung: true };
        this.pendulum.length = 34 * ou;
        this.snow = null;
        this.still = null;
        for (const a of this.cats) a.cache.clear();
        // A resize keeps the cats, moved to the same place in the new room.
        if (prev) {
            const sx = W / prev.W, sy = H / prev.H;
            for (const a of this.cats) { a.x *= sx; a.y = Math.min(L.floor.y1, Math.max(L.baseY, a.y * sy)); if (a.target) a.target = { x: a.target.x * sx, y: Math.min(L.floor.y1, a.target.y * sy) }; }
            for (const o of this.loose) { o.x *= sx; o.y *= sy; o.floor = Math.min(L.floor.y1, o.floor * sy); }
        }
    }

    // How far the tree's warm light reaches, round its middle.
    glowR() { return Math.max(this.layout.treeH, this.layout.treeW * 1.2) * 0.75; }

    // ---- The tree's frame of reference ----------------------------------------------------

    // Where a point of the tree (local px) is now: it pivots on the corner
    // of its stand on the side it's leaning to.
    treePoint(lx, ly) {
        const L = this.layout, t = this.tree, side = t.phi >= 0 ? 1 : -1, px = side * this.treeArt.pivot;
        const c = Math.cos(t.phi), s = Math.sin(t.phi), dx = lx - px;
        return { x: L.treeX + px + dx * c - ly * s, y: L.baseY + dx * s + ly * c };
    }

    hook() { return this.treePoint(this.hookLocal.x, this.hookLocal.y); }

    ornamentAt() {
        const h = this.hook(), p = this.pendulum;
        if (!p.hung) return p.free ? { x: p.free.x, y: p.free.y } : h;
        return { x: h.x + Math.sin(p.theta) * p.length, y: h.y + Math.cos(p.theta) * p.length };
    }

    // ---- The cast -------------------------------------------------------------------------

    buildCast() {
        const enabled = (this.config.cats || []).filter(id => CatOrnamentLogic.byId(id));
        const n = Math.max(1, Math.min(this.config.inRoom, enabled.length || 1));
        const chosen = CatOrnamentLogic.cast(enabled.length ? enabled : ['moofy'], n, Math.random);
        const L = this.layout;
        this.cats = chosen.map((cat, i) => {
            const name = CatOrnamentLogic.pickName(cat, this.config[this.nameKey(cat.id)], Math.random);
            const a = new CatOrnamentCat(this, cat, CatArt.make(cat, WP.seededRandom(7 + i * 31)), name);
            a.x = L.W * (0.15 + Math.random() * 0.7);
            a.y = L.floor.y0 + Math.random() * (L.floor.y1 - L.floor.y0);
            return a;
        });
        this.lead = 0;
        this.leadUntil = this.time + this.config.turnMinutes * 60;
    }

    // Look alive on the first frame: the lead already at the ornament, the
    // others settled into their places, the ornament mid-swing.
    seed(quiet) {
        const lead = this.cats[this.lead];
        this.pendulum.theta = 0.3; this.pendulum.omega = 0;
        if (!lead) return;
        lead.lead = true;
        if (lead.cat.traits.lurk > 0.8 && Math.random() < 0.5) lead.begin('lurk', { at: 0 });
        else { lead.placeAt(this.spot()); lead.begin('stare', { long: Math.random() < 0.3 }); }
        this.cats.forEach((a, i) => { if (i !== this.lead) { a.lead = false; a.idle(true); } });
        if (!quiet) this.greet();
    }

    greet() {
        if (this.holiday === 'day') this.say(`Merry Christmas from ${this.cats.map(a => a.name).join(', ').replace(/, ([^,]*)$/, ' and $1')}!`, 7);
        else if (this.holiday === 'eve') this.say('It’s Christmas Eve. Everyone is being very good. Mostly.', 6);
    }

    // Where the cat at the ornament sits: just outside the low bough, facing in.
    spot() {
        const h = this.hook(), L = this.layout;
        return { x: h.x + this.side * 44 * L.u, y: Math.max(L.floor.y0, L.baseY + 16 * L.u), dir: -this.side };
    }

    // Under the tree, between the presents: the body back under the boughs, the face toward the room.
    lurkSpot() { const L = this.layout; return { x: L.treeX - this.side * this.treeArt.w * 0.1, y: L.baseY + 3 * L.u, dir: this.side }; }

    // A free place on the floor, away from the tree and the other cats.
    floorSpot(near) {
        const L = this.layout;
        let best = null, bestScore = -Infinity;
        for (let i = 0; i < 14; i++) {
            const x = near ? near.x + (Math.random() - 0.5) * L.W * 0.3 : L.W * (0.1 + Math.random() * 0.8);
            const y = L.floor.y0 + Math.random() * (L.floor.y1 - L.floor.y0);
            let score = Math.min(...this.cats.map(a => Math.hypot(a.x - x, (a.y - y) * 2)).concat([1e4]));
            if (Math.abs(x - L.treeX) < this.treeArt.w * 0.5 && y < L.baseY + 40 * L.u) score -= 400;
            if (x < 90 * L.u || x > L.W - 90 * L.u) score -= 300;
            if (score > bestScore) { bestScore = score; best = { x, y }; }
        }
        return best;
    }

    nextLead() {
        if (this.cats.length < 2) { this.leadUntil = this.time + this.config.turnMinutes * 60; return null; }
        const old = this.cats[this.lead];
        old.lead = false;
        old.idle();
        this.lead = (this.lead + 1) % this.cats.length;
        const lead = this.cats[this.lead];
        lead.lead = true;
        lead.begin('approach');
        this.leadUntil = this.time + this.config.turnMinutes * 60;
        return lead;
    }

    // ---- Events ---------------------------------------------------------------------------

    say(text, seconds = 4.5) {
        if (!this.config.captions || this.host.params.thumb) return;
        if (this.caption && this.caption.t < 1.2 && this.caption.text !== text) return;   // don't trample one just shown
        this.caption = { text, t: 0, dur: seconds };
    }

    // A swat lands: the ornament swings, or with `knock`, comes off its hook.
    hit(dir, strength, knock) {
        const p = this.pendulum;
        if (!p.hung) {
            if (p.free) { p.free.vx += dir * (160 + 260 * strength) * this.layout.u; p.free.vy -= 120 * this.layout.u; }
            return;
        }
        CatOrnamentLogic.swat(p, dir, strength);
        if (knock) this.unhook();
    }

    unhook() {
        const p = this.pendulum, at = this.ornamentAt(), L = this.layout;
        p.hung = false;
        const v = p.omega * p.length;
        p.free = { x: at.x, y: at.y, vx: Math.cos(p.theta) * v, vy: -Math.sin(p.theta) * v * 0.3, spin: 0, angle: 0, floor: Math.min(L.floor.y1, L.baseY + 26 * L.u + Math.random() * 30 * L.u), sprite: this.sprites.the, rest: 0 };
    }

    // The tree starts to go. `dir` the side.
    push(force) {
        if (this.tree.state === 'fall' || this.tree.state === 'down') return;
        if (this.tree.state === 'still') this.tree.state = 'wobble';
        this.tree.omega += force;
    }

    topple(dir) {
        const t = this.tree;
        if (t.state === 'fall' || t.state === 'down') return;
        t.state = 'fall';
        t.dir = dir;
        t.phi = dir * Math.max(Math.abs(t.phi), CatOrnamentLogic.TREE.tip + 0.01);
        t.omega = dir * 0.6;
        t.detached = new Set();
        this.say('TIMBER!', 2.5);
    }

    // The fall's aftermath is over: fade out, put everything back, fade in.
    resetScene() {
        this.tree = { phi: 0, omega: 0, state: 'still', lights: 1 };
        this.pendulum = { theta: 0.2, omega: 0, length: this.pendulum.length, hung: true };
        this.loose = [];
        this.starOff = false;
        this.timers = [];
        for (const a of this.cats) { a.x = Math.min(this.layout.W - 40, Math.max(40, a.x)); a.y = Math.max(this.layout.floor.y0, a.y); a.idle(true); }
        this.nextLead() || this.cats[this.lead]?.begin('approach');
    }

    // A laser dot where the pointer is, for a few seconds; the nearest cat that's awake gives chase.
    shine(x, y) {
        const L = this.layout;
        const fy = Math.min(L.floor.y1, Math.max(L.floor.y0 - 10 * L.u, y));
        const fresh = !this.laser;
        this.laser = { x, y: fy, until: this.time + 5 };
        if (!fresh) return;
        let best = null, d = Infinity;
        for (const a of this.cats) {
            if (a.task.kind === 'climb' || a.task.kind === 'rear' || a.task.kind === 'jump') continue;
            const dd = Math.hypot(a.x - x, a.y - fy) * (a.task.kind === 'sleep' || a.task.kind === 'box' ? 2.5 : 1);
            if (dd < d) { d = dd; best = a; }
        }
        if (best) { best.begin('chase'); this.say(`${best.name} has seen the dot.`, 3); }
    }

    // Keys.
    keyNext() { const lead = this.nextLead(); return lead ? `🐾 ${lead.name}’s turn` : '🐾 Only one cat in the room'; }
    keyTimber() {
        if (this.tree.state === 'fall' || this.tree.state === 'down') return '🎄 It’s already down';
        const lead = this.cats[this.lead];
        if (!lead) return '🐾 No cats in the room';
        lead.placeAt(this.spot());
        lead.begin('rear', { force: true });
        return this.config.topple ? `🎄 ${lead.name} is going up` : `🎄 ${lead.name} is going up (the tree stays up: Topple is off)`;
    }
    keyBat() { const lead = this.cats[this.lead]; if (!lead) return null; lead.placeAt(this.spot()); lead.begin('bat', { count: 3 }); return '🐾 Bap'; }
    keyZoom() {
        const pick = [...this.cats].sort((a, b) => b.cat.traits.zoom - a.cat.traits.zoom).find(a => !a.lead) || this.cats[0];
        if (!pick) return null;
        pick.begin('zoom');
        return `💨 ${pick.name} has the zoomies`;
    }

    // ---- The frame ------------------------------------------------------------------------

    frame(now) {
        if (!this.running) return;
        const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
        this.last = now;
        this.update(dt);
        this.draw();
        // A calm room (the cats sitting or asleep, the ornament barely
        // swinging, the tree up) is paced at 15 frames a second (30 on a fast
        // display); anything quick gets the tier's full rate.
        if (this.calm()) {
            const fps = (this.host.quality?.fps || 60) >= 60 ? 30 : 15;
            this.host.idleUntil(Math.max(0, 1000 / fps - (performance.now() - now) - 4));
        }
        this.frameId = requestAnimationFrame(t => this.frame(t));
    }

    calm() {
        if (this.fade || this.laser || this.tree.state !== 'still' || !this.pendulum.hung || Math.abs(this.pendulum.omega) > 1.6) return false;
        return this.cats.every(a => !a.moving && !['bat', 'chase', 'zoom', 'climb', 'rear', 'jump', 'startle'].includes(a.task.kind));
    }

    update(dt) {
        this.time += dt;
        if (this.timers.length) { const due = this.timers.filter(t => t.at <= this.time); this.timers = this.timers.filter(t => t.at > this.time); for (const t of due) t.fn(); }
        // The time of day, once a minute.
        if (Math.floor(this.time / 60) !== this.minute) {
            this.minute = Math.floor(this.time / 60);
            const day = Math.round(this.dayAmount() * 2) / 2;
            if (day !== this.day) this.resize();
        }
        // Physics on a fixed step.
        this.acc = Math.min(0.25, this.acc + dt);
        while (this.acc >= CAT_ORNAMENT_STEP) { this.physics(CAT_ORNAMENT_STEP); this.acc -= CAT_ORNAMENT_STEP; }
        for (const a of this.cats) a.update(dt);
        // Turns at the ornament.
        if (this.time > this.leadUntil && this.tree.state === 'still' && !this.fade) {
            const lead = this.cats[this.lead];
            if (!lead || ['stare', 'lurk', 'sit', 'settle', 'groom', 'approach'].includes(lead.task.kind)) this.nextLead();
        }
        // After a fall: a while to take it in, then the fade.
        if (this.tree.state === 'down') {
            this.tree.downFor = (this.tree.downFor || 0) + dt;
            if (this.tree.downFor > 9 && !this.fade) this.fade = { t: 0, dir: 1 };
        }
        if (this.fade) {
            this.fade.t += dt / 1.6;
            if (this.fade.t >= 1) {
                if (this.fade.dir > 0) { this.resetScene(); this.fade = { t: 0, dir: -1 }; this.say('Some time later…', 3.5); }
                else this.fade = null;
            }
        }
        // A knocked ornament that's lain about long enough goes back up.
        const p = this.pendulum;
        if (!p.hung && p.free && p.free.rest > 40 && this.tree.state === 'still' && !this.cats.some(a => a.task.kind === 'chase')) {
            p.free.fade = (p.free.fade || 0) + dt;
            if (p.free.fade > 1) { p.hung = true; p.free = null; p.theta = 0.25; p.omega = 0; }
        }
        if (this.laser && this.time > this.laser.until) this.laser = null;
        for (const h of this.hearts) h.t += dt;
        this.hearts = this.hearts.filter(h => h.t < 2.6);
        if (this.caption) { this.caption.t += dt; if (this.caption.t > this.caption.dur) this.caption = null; }
        // Snow beyond the window.
        if (this.config.snow) this.updateSnow(dt);
    }

    physics(dt) {
        const L = this.layout, t = this.tree;
        const before = this.hook();
        const fallen = t.state === 'fall';
        CatOrnamentLogic.treeStep(t, dt, this.treeArt.h, CAT_ORNAMENT_G * L.u / 1.3);
        if (fallen && t.state === 'down') this.landed();
        if (t.state === 'fall' && !t.detached) { t.detached = new Set(); this.say('TIMBER!', 2.5); }
        if (t.state === 'fall') {
            t.lights = Math.random() < 0.3 ? 0.3 : 1;
            // Ornaments fly off as it goes.
            this.treeArt.ornaments.forEach((o, i) => { if (!t.detached.has(i) && Math.abs(t.phi) > o.detach) { t.detached.add(i); this.fling(o.x, o.y, this.sprites.ornaments[i]); } });
            if (!this.starOff && Math.abs(t.phi) > 0.7) { this.starOff = true; if (this.treeArt.topper !== 'none') this.fling(this.treeArt.star.x, this.treeArt.star.y, null, true); }
            if (this.pendulum.hung && Math.abs(t.phi) > 0.45) this.unhook();
        }
        // The ornament: a pendulum driven by the hook's sway, or a free body.
        const after = this.hook();
        const ax = this.prevHookV === undefined ? 0 : ((after.x - before.x) / dt - this.prevHookV) / dt;
        this.prevHookV = (after.x - before.x) / dt;
        const p = this.pendulum;
        if (p.hung) CatOrnamentLogic.pendulumStep(p, dt, ax, CAT_ORNAMENT_G * L.u / 1.3);
        else if (p.free) this.body(p.free, dt);
        for (const o of this.loose) this.body(o, dt);
    }

    // A point on the tree comes loose, moving as the tree is.
    fling(lx, ly, sprite, star) {
        const a = this.treePoint(lx, ly), t = this.tree, L = this.layout;
        const side = t.phi >= 0 ? 1 : -1, px = L.treeX + side * this.treeArt.pivot;
        const rx = a.x - px, ry = a.y - L.baseY;
        this.loose.push({ x: a.x, y: a.y, vx: -ry * t.omega, vy: rx * t.omega, spin: 0, angle: Math.random() * 6, sprite, star,
            floor: Math.min(L.floor.y1, L.baseY + (8 + Math.random() * 46) * L.u), rest: 0 });
    }

    body(o, dt) {
        const L = this.layout, g = CAT_ORNAMENT_G * L.u / 1.3;
        o.vy += g * dt;
        o.x += o.vx * dt;
        o.y += o.vy * dt;
        const r = (o.sprite ? o.sprite.r : 12 * L.u);
        if (o.y >= o.floor) {
            o.y = o.floor;
            if (o.vy > 60 * L.u) { o.vy = -o.vy * 0.38; o.vx *= 0.82; }
            else { o.vy = 0; o.vx *= Math.exp(-1.4 * dt); if (Math.abs(o.vx) < 2) { o.vx = 0; o.rest += dt; } }
        }
        if (o.x < r) { o.x = r; o.vx = Math.abs(o.vx) * 0.5; }
        if (o.x > L.W - r) { o.x = L.W - r; o.vx = -Math.abs(o.vx) * 0.5; }
        o.angle += o.vx / Math.max(4, r) * dt;
    }

    landed() {
        this.tree.lights = 0;
        this.tree.downFor = 0;
        // Everything that was still on it comes off now.
        this.treeArt.ornaments.forEach((o, i) => { if (!this.tree.detached.has(i)) { this.tree.detached.add(i); this.fling(o.x, o.y, this.sprites.ornaments[i]); } });
        for (const o of this.loose) { o.vy -= (100 + Math.random() * 260) * this.layout.u; o.vx += (Math.random() - 0.5) * 220 * this.layout.u; }
        // Everyone reacts.
        for (const a of this.cats) a.react();
        const persian = this.cats.find(a => a.cat.id === 'persian');
        if (persian) this.later(7.5, () => this.say(`${persian.name} is unimpressed.`, 4));
    }

    updateSnow(dt) {
        const L = this.layout, w = L.win, n = Math.round(46 * this.density());
        if (!this.snow) this.snow = Array.from({ length: n }, () => ({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random(), p: Math.random() * 6 }));
        for (const f of this.snow) {
            f.y += dt * 0.05 * f.s;
            f.x += Math.sin(this.time * 0.6 + f.p) * dt * 0.01;
            if (f.y > 1) { f.y = 0; f.x = Math.random(); }
        }
        void w;
    }

    // ---- Drawing --------------------------------------------------------------------------

    draw() {
        const g = this.ctx, L = this.layout, d = this.dpr, t = this.time, art = this.treeArt;
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
        const lights = this.tree.lights * (this.tree.state === 'down' ? 0 : 1);
        const standing = this.tree.state === 'still' && this.tree.phi === 0 && lights >= 1 && !this.starOff && !this.tree.detached?.size;
        g.drawImage(standing ? this.stillLayer() : this.bg, 0, 0);
        g.setTransform(d, 0, 0, d, 0, 0);
        if (this.config.snow) this.drawSnow(g);
        // The tree's warm light is in the room's layer; with the lights out, the room goes dim there.
        if (lights < 1) {
            const r = this.glowR();
            g.globalAlpha = (1 - lights) * (0.9 - this.day * 0.5);
            g.drawImage(this.sprites.unlit, L.treeX - r, L.baseY - L.treeH * 0.5 - r, r * 2, r * 2);
            g.globalAlpha = 1;
        }
        // The fire, somewhere off to the side.
        if (this.lively) {
            // The flicker's brighter moments, over the fire already in the room.
            const fr = Math.max(L.W, L.H) * 0.5, flicker = Math.max(0, Math.sin(t * 7.3) * 0.08 + Math.sin(t * 13.1 + 1) * 0.06 + Math.sin(t * 2.1) * 0.08);
            g.globalAlpha = flicker * 1.4 * (1 - this.day * 0.7);
            g.drawImage(this.sprites.fire, this.fireX - fr, L.H * 0.7 - fr, fr * 2, fr * 2);
            g.globalAlpha = 1;
        }
        // Who's where: behind the tree's front boughs (lurking, climbing), and in front.
        const behind = this.cats.filter(a => a.under), inFront = this.cats.filter(a => !a.under);
        // The tree.
        if (standing) this.drawTree(g, null, lights, { bulbs: 'back' });
        else this.drawTree(g, lights > 0.5 ? art.lit : art.main, lights, { bulbs: 'back', ornaments: true, star: true });
        for (const a of behind) this.drawCat(g, a);
        this.drawTree(g, lights > 0.5 ? art.frontLit : art.front, lights, { bulbs: 'front' });
        for (const a of behind) if (a.task.kind === 'lurk' || a.dark > 0.2) a.draw(g, { eyesOnly: true });
        // The presents, and the box.
        g.drawImage(this.presents.canvas, this.presents.x, this.presents.y, this.presents.w, this.presents.h);
        const box = this.presents.back;
        g.drawImage(box.canvas, box.x, box.y, box.w, box.h);
        // The floor, by depth: cats and the ornaments lying about.
        const items = inFront.map(a => ({ y: a.y, a }));
        for (const o of this.loose) items.push({ y: o.floor, o });
        const p = this.pendulum;
        if (!p.hung && p.free) items.push({ y: p.free.floor, o: p.free });
        items.sort((a, b) => a.y - b.y);
        for (const it of items) {
            if (it.a) { this.drawCat(g, it.a); if (it.a.task.kind === 'box') { const f = this.presents.front; g.drawImage(f.canvas, f.x, f.y, f.w, f.h); } }
            else this.drawLoose(g, it.o);
        }
        if (!this.cats.some(a => a.task.kind === 'box')) { const f = this.presents.front; g.drawImage(f.canvas, f.x, f.y, f.w, f.h); }
        // The ornament on its hook, over everything at the tree.
        if (p.hung) this.drawHung(g);
        for (const h of this.hearts) this.drawHeart(g, h);
        if (this.laser) {
            const s = this.sprites.laser, r = 10 * L.u, jx = Math.sin(t * 31) * 0.8, jy = Math.cos(t * 27) * 0.8;
            g.globalCompositeOperation = 'lighter';
            g.drawImage(s, this.laser.x - r + jx, this.laser.y - r + jy, r * 2, r * 2);
            g.globalCompositeOperation = 'source-over';
        }
        if (this.caption) this.drawCaption(g);
        if (this.fade) {
            const a = this.fade.dir > 0 ? this.fade.t : 1 - this.fade.t;
            g.fillStyle = `rgba(6,3,4,${Math.min(1, a)})`;
            g.fillRect(0, 0, L.W, L.H);
        }
    }

    // The tree where it is now: its sprite, and as asked its bulbs, its ornaments (swaying unless `still`) and its star.
    drawTree(g, sprite, lights, parts = {}) {
        const L = this.layout, art = this.treeArt, t = this.tree, d = this.dpr;
        const side = t.phi >= 0 ? 1 : -1, px = side * art.pivot;
        g.save();
        g.translate(L.treeX + px, L.baseY);
        g.rotate(t.phi);
        g.translate(-px, 0);
        if (sprite) g.drawImage(sprite, -art.ox, -art.oy, sprite.width / d, sprite.height / d);
        if (parts.bulbs) {
            // Lights, twinkling; on Low, fewer of them.
            const n = Math.round(art.lights.length * (0.5 + 0.5 * this.density()));
            const tw = this.config.twinkle;
            for (let i = 0; i < n; i++) {
                const b = art.lights[i];
                if (b.front !== (parts.bulbs === 'front')) continue;
                const on = lights * (0.65 + 0.35 * Math.sin(this.time * b.rate * tw + b.phase));
                if (on <= 0.02) { g.fillStyle = 'rgba(30,30,30,0.7)'; g.beginPath(); g.arc(b.x, b.y, 2.2 * L.u / this.config.catSize, 0, Math.PI * 2); g.fill(); continue; }
                const k = b.colour % this.sprites.bulbs.length, r = 11 * L.u / this.config.catSize;
                g.globalAlpha = on;
                g.drawImage(this.sprites.bulbs[k], b.x - r, b.y - r, r * 2, r * 2);
            }
            g.globalAlpha = 1;
        }
        if (parts.ornaments) {
            // Ornaments still on it.
            art.ornaments.forEach((o, i) => {
                if (t.detached?.has(i)) return;
                const s = this.sprites.ornaments[i], sway = parts.still ? 0 : Math.sin(this.time * 1.1 + i) * 0.04 - t.phi * 0.8;
                g.save(); g.translate(o.x, o.y); g.rotate(sway);
                g.drawImage(s.canvas, -s.ax, -s.ay, s.w, s.h);
                g.restore();
            });
        }
        if (parts.star && !this.starOff && art.topper !== 'none') { const s = this.sprites.star, r = art.starR * 1.3; g.drawImage(s, art.star.x - r, art.star.y - r, r * 2, r * 2); }
        g.restore();
    }

    // The room with the standing tree in it, ornaments and all: one layer,
    // drawn once, for the long stretches when the tree isn't moving.
    stillLayer() {
        if (this.still) return this.still;
        const c = document.createElement('canvas'), d = this.dpr;
        c.width = this.canvas.width; c.height = this.canvas.height;
        const sg = c.getContext('2d');
        sg.drawImage(this.bg, 0, 0);
        sg.setTransform(d, 0, 0, d, 0, 0);
        const phi = this.tree.phi;
        this.tree.phi = 0;
        this.drawTree(sg, this.treeArt.lit, 1, { ornaments: true, star: true, still: true });
        this.tree.phi = phi;
        return (this.still = c);
    }

    drawHung(g) {
        const h = this.hook(), p = this.pendulum, s = this.sprites.the, at = this.ornamentAt();
        g.strokeStyle = 'rgba(220,200,150,0.7)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(h.x, h.y); g.lineTo(at.x, at.y); g.stroke();
        g.save(); g.translate(at.x, at.y); g.rotate(-p.theta);
        g.drawImage(s.canvas, -s.ax, -s.ay, s.w, s.h);
        g.restore();
    }

    drawLoose(g, o) {
        const L = this.layout;
        if (o.fade) g.globalAlpha = Math.max(0, 1 - o.fade);
        g.fillStyle = 'rgba(0,0,0,0.25)';
        const r = o.sprite ? o.sprite.r : 12 * L.u;
        g.beginPath(); g.ellipse(o.x, o.floor + 1, r * 1.1, r * 0.3, 0, 0, Math.PI * 2); g.fill();
        g.save(); g.translate(o.x, o.y); g.rotate(o.angle);
        if (o.star) { const s = this.sprites.star, rr = this.treeArt.starR * 1.3; g.drawImage(s, -rr, -rr - rr * 0.4, rr * 2, rr * 2); }
        else { const s = o.sprite; g.drawImage(s.canvas, -s.cx, -s.cy - s.r * 0.9, s.w, s.h); }
        g.restore();
        g.globalAlpha = 1;
    }

    drawCat(g, a) {
        const L = this.layout;
        if (a.task.kind === 'out') return;
        // Its shadow on the floor (not when it's up the tree or in the air).
        if (!a.airborne && a.task.kind !== 'box') {
            const sw = 64 * L.u * a.cat.size * a.cat.chunk, sh = sw * 0.28;
            g.globalAlpha = 0.9;
            g.drawImage(this.sprites.shadow, a.x - sw / 2, a.y - sh / 2, sw, sh);
            g.globalAlpha = 1;
        }
        if (a.dark > 0.02 && a.live()) this.drawDark(g, a);
        else a.draw(g);
    }

    // A cat in the shadow under the tree: drawn small offscreen, darkened, and its eyes added back on top later.
    drawDark(g, a) {
        const L = this.layout, d = this.dpr, bw = 190 * L.u * a.cat.size, bh = 150 * L.u * a.cat.size;
        const c = this.lurk;
        if (c.width !== Math.round(bw * d) || c.height !== Math.round(bh * d)) { c.width = Math.round(bw * d); c.height = Math.round(bh * d); }
        const lg = c.getContext('2d');
        lg.setTransform(1, 0, 0, 1, 0, 0);
        lg.clearRect(0, 0, c.width, c.height);
        lg.setTransform(d, 0, 0, d, (bw / 2 - a.x) * d, (bh - 12 * L.u - a.y) * d);
        a.draw(lg);
        lg.setTransform(1, 0, 0, 1, 0, 0);
        lg.globalCompositeOperation = 'source-atop';
        lg.fillStyle = `rgba(6,4,10,${a.dark * 0.82})`;
        lg.fillRect(0, 0, c.width, c.height);
        lg.globalCompositeOperation = 'source-over';
        g.drawImage(c, a.x - bw / 2, a.y - bh + 12 * L.u, bw, bh);
    }

    drawSnow(g) {
        const w = this.layout.win, u = this.layout.u / this.config.catSize, t = 9 * u;
        if (!this.snow) return;
        g.save();
        g.beginPath();
        // The four panes, not the bars.
        const bx = w.x + w.w / 2 - t * 0.35, by = w.y + w.h * 0.45 - t * 0.35;
        g.rect(w.x, w.y, bx - w.x, by - w.y); g.rect(bx + t * 0.7, w.y, w.x + w.w - bx - t * 0.7, by - w.y);
        g.rect(w.x, by + t * 0.7, bx - w.x, w.y + w.h - by - t * 0.7); g.rect(bx + t * 0.7, by + t * 0.7, w.x + w.w - bx - t * 0.7, w.y + w.h - by - t * 0.7);
        g.clip();
        g.fillStyle = this.day > 0.5 ? 'rgba(255,255,255,0.95)' : 'rgba(230,236,255,0.85)';
        for (const f of this.snow) { const r = f.s * 1.4 * u; g.beginPath(); g.arc(w.x + f.x * w.w, w.y + f.y * w.h, r, 0, Math.PI * 2); g.fill(); }
        g.restore();
    }

    drawHeart(g, h) {
        const s = (6 + h.t * 2) * this.layout.u, x = h.x + Math.sin(h.t * 3 + h.p) * 6 * this.layout.u, y = h.y - h.t * 40 * this.layout.u;
        g.globalAlpha = Math.max(0, 1 - h.t / 2.6) * 0.9;
        g.fillStyle = '#ff6a88';
        g.beginPath();
        g.moveTo(x, y + s * 0.35);
        g.bezierCurveTo(x - s, y - s * 0.3, x - s * 0.45, y - s * 0.95, x, y - s * 0.45);
        g.bezierCurveTo(x + s * 0.45, y - s * 0.95, x + s, y - s * 0.3, x, y + s * 0.35);
        g.fill();
        g.globalAlpha = 1;
    }

    drawCaption(g) {
        const c = this.caption, L = this.layout, u = Math.max(0.85, L.u / this.config.catSize);
        const a = Math.min(1, c.t / 0.5, (c.dur - c.t) / 0.8);
        if (a <= 0) return;
        const size = 15 * u, pad = 10 * u;
        g.font = `italic 500 ${size}px Georgia, 'Times New Roman', serif`;
        const w = Math.min(L.W - 40, g.measureText(c.text).width + pad * 2), h = size + pad * 1.6;
        const x = 20 * u + (this.host.insets?.left || 0), y = L.bottom - h - 18 * u;
        g.globalAlpha = a;
        g.fillStyle = 'rgba(20,10,8,0.62)';
        g.beginPath(); g.roundRect(x, y, w, h, h / 2); g.fill();
        g.fillStyle = '#fbeed8';
        g.textBaseline = 'middle';
        g.fillText(c.text, x + pad, y + h / 2, w - pad * 2);
        g.globalAlpha = 1;
    }

    // For tests: where things are.
    debugState() {
        return {
            tree: { ...this.tree, detached: this.tree.detached?.size || 0 }, pendulum: { theta: this.pendulum.theta, omega: this.pendulum.omega, hung: this.pendulum.hung },
            ornament: this.ornamentAt(), loose: this.loose.length, lead: this.cats[this.lead]?.cat.id, caption: this.caption?.text || null,
            cats: this.cats.map(a => ({ id: a.cat.id, name: a.name, task: a.task.kind, x: a.x, y: a.y, lead: !!a.lead })), fade: this.fade, layout: this.layout,
        };
    }
}

// ---- A cat ---------------------------------------------------------------------------------

// What a cat is doing is its `task` ({ kind, t, … }); begin() starts one and
// update() runs it; when it's done, the lead goes back to the ornament and
// the rest pick something from their temperament.
class CatOrnamentCat {
    constructor(m, cat, rig, name) {
        this.m = m;
        this.cat = cat;
        this.rig = rig;
        this.name = name;
        this.x = 0; this.y = 0;
        this.dir = 1;
        this.pose = CatArt.copy(CatArt.POSES.sit);
        this.poseName = 'sit';
        this.task = { kind: 'sit', t: 0, dur: 3 };
        this.gait = 0;
        this.swish = 0;
        this.puff = 0;
        this.paw = 0;
        this.breath = Math.random() * 6;
        this.blinkIn = 2 + Math.random() * 4;
        this.blink = 0;
        this.face = { open: 1, look: [0, 0], pupil: 0.35 };
        this.zs = [];
        this.dark = 0;
        this.under = false;
        this.airborne = false;
        this.cache = new Map();     // still poses, drawn once (see draw())
    }

    get u() { return this.m.layout.u; }
    get speed() { return (this.task.run ? 330 : 70) * this.u * (this.cat.traits.zoom > 0.8 && this.task.run ? 1.25 : 1); }

    placeAt(p) { this.x = p.x; this.y = p.y; if (p.dir) this.dir = p.dir; }

    begin(kind, o = {}) {
        this.task = { kind, t: 0, ...o };
        this.airborne = false;
        const m = this.m, T = this.cat.traits, name = this.name;
        switch (kind) {
            case 'approach': {
                const lurk = T.lurk > 0.6 && Math.random() < T.lurk * 0.6;
                this.goTo(lurk ? m.lurkSpot() : m.spot(), lurk ? 'lurk' : 'stare');
                break;
            }
            case 'lurk': this.placeAt(m.lurkSpot()); this.task.dur = 15 + Math.random() * 30 * T.lurk;
                if (o.at === undefined) m.say(this.cat.id === 'moofy' ? `${name} is lurking. You may only see the grin.` : `${name} is lurking under the tree.`); break;
            case 'stare': this.dir = -m.side; this.task.dur = (o.long ? 40 : 7) + Math.random() * 30 * T.stare; this.task.said = 0;
                if (Math.random() < 0.3 && m.pendulum.hung) m.say(`${name} has noticed the ornament.`);
                break;
            case 'bat': this.dir = -m.side; this.task.count = o.count || 1 + Math.floor(Math.random() * 3); this.task.i = 0; this.task.phase = 0;
                this.task.eye = this.cat.id === 'ras' && Math.random() < 0.6;
                if (this.task.eye) m.say(`${name} is making eye contact.`);
                break;
            case 'rear': this.dir = -m.side; this.task.dur = 1.2; m.say(`${name} is going up.`, 3); break;
            case 'climb': this.task.dur = 2.6 + Math.random() * 1.5; this.task.from = { x: this.x, y: this.y }; break;
            case 'sleep': this.task.dur = (40 + Math.random() * 120) * (0.5 + T.sleep); if (this.cat.id === 'ibbie' && Math.random() < 0.4) m.say('Ibbie is asleep. Again.'); break;
            case 'box': { const b = m.presents.open; this.goTo({ x: b.x, y: b.y - 2 * this.u }, null); this.task.then = 'inbox'; break; }
            case 'inbox': this.task.dur = 60 + Math.random() * 120; this.placeAt({ x: m.presents.open.x, y: m.presents.open.y - 2 * this.u }); break;
            case 'zoom': this.task.laps = 2 + Math.floor(Math.random() * 3); this.task.run = true; this.nextLap();
                if (this.cat.id === 'maus') m.say(Math.random() < 0.5 ? 'Die Fleder Maus has the zoomies.' : 'Maus has the zoomies.'); break;
            case 'chase': this.task.run = true; this.task.dur = 12; break;
            case 'wander': { const p = m.floorSpot(); this.goTo(p, null); this.task.then = 'sit'; break; }
            case 'blink': this.task.dur = 8 + Math.random() * 8; this.dir = Math.random() < 0.5 ? -1 : 1;
                if (this.cat.traits.love > 0.8) m.say(`${name} loves you.`); break;
            case 'lounge': this.task.dur = 40 + Math.random() * 90; if (this.cat.id === 'turkey' && Math.random() < 0.5) m.say('Turkey is lounging.'); break;
            case 'jump': this.airborne = true; break;
            case 'innocent': this.task.dur = 1e9; this.dir = Math.random() < 0.5 ? -1 : 1;
                m.later(2.2, () => m.say(this.cat.id === 'ras' ? `${name} regrets nothing.` : this.cat.id === 'turkey' ? `${name} only meant to sit on it.` : `${name} has no idea what happened here.`, 5));
                break;
            case 'startle': this.task.dur = 1.4; this.puff = 1; break;
            default: this.task.dur = o.dur || 6 + Math.random() * 14;
        }
    }

    goTo(p, then, thenOpts) {
        this.task.target = { x: p.x, y: p.y };
        this.task.walking = true;
        if (then) { this.task.then = then; this.task.thenOpts = thenOpts; }
    }

    // Done with this: back to the ornament, or something else to do.
    done() { if (this.lead) this.begin('approach'); else this.idle(); }

    nextLap() {
        const L = this.m.layout, t = this.task;
        t.target = { x: this.x < L.W / 2 ? L.W * (0.82 + Math.random() * 0.12) : L.W * (0.06 + Math.random() * 0.12), y: L.floor.y0 + Math.random() * (L.floor.y1 - L.floor.y0) };
        t.walking = true;
    }

    // The rest of the household: something from its temperament.
    idle(now) {
        const m = this.m, T = this.cat.traits;
        const boxFree = !m.cats.some(a => a !== this && (a.task.kind === 'box' || a.task.kind === 'inbox'));
        const lurkFree = !m.cats.some(a => a !== this && a.task.kind === 'lurk');
        const kind = CatOrnamentLogic.idle(this.cat, Math.random, { box: boxFree, lurk: lurkFree && !this.lead, zoom: !m.host.reducedMotion && !now });
        if (now) {
            // Settled already: put it somewhere sensible for the first frame.
            if (kind === 'box') { this.begin('inbox'); return; }
            if (kind === 'lurk') { this.begin('lurk', { at: 0 }); return; }
            this.placeAt(m.floorSpot());
            if (kind === 'wander' || kind === 'zoom') { this.begin('sit'); return; }
            this.begin(kind === 'watch' ? 'watch' : kind);
            return;
        }
        if (kind === 'sleep' || kind === 'lounge' || kind === 'loaf' || kind === 'blink' || kind === 'groom' || kind === 'watch') {
            // A short stroll first, now and then.
            if (Math.random() < 0.4) { this.begin('wander'); this.task.then = kind; return; }
        }
        this.begin(kind);
        void T;
    }

    // The tree came down.
    react() {
        const k = this.task.kind;
        if (k === 'climb' || k === 'jump' || k === 'rear') return;
        if (k === 'sleep' || k === 'inbox' || k === 'lounge') { this.begin('startle'); return; }
        if (this.lead) return;
        this.begin('startle');
    }

    // ---- Each frame -------------------------------------------------------------------

    update(dt) {
        const m = this.m, L = m.layout, task = this.task, T = this.cat.traits;
        task.t += dt;
        this.breath += dt * (task.kind === 'sleep' ? 1.6 : 2.4);
        this.under = task.kind === 'lurk' || task.kind === 'climb' || task.kind === 'rear';
        let pose = 'sit', moving = false;
        const face = this.face;
        face.mouth = null; face.lids = null; face.wide = false; face.blush = 0;
        let pupil = 0.35, open = 1, look = [0, 0], swishRate = 1.2, swishAmp = 0.15, ears = 0;
        this.paw += ((task.paw || 0) - this.paw) * Math.min(1, dt * 14);
        task.paw = 0;
        let targetDark = 0;
        // Walking toward something, whatever the task.
        if (task.walking && task.target) {
            const dx = task.target.x - this.x, dy = task.target.y - this.y, dist = Math.hypot(dx, dy * 1.4);
            const step = this.speed * dt * (m.host.reducedMotion ? 0.6 : 1);
            if (dist <= step + 0.5) {
                this.x = task.target.x; this.y = task.target.y; task.walking = false;
                if (task.kind === 'zoom') { if (--task.laps > 0) this.nextLap(); else { this.begin('sit', { dur: 4 }); this.face.wide = true; } return this.finishPose(dt, 'sit', false); }
                if (task.kind === 'chase') { /* keep following the dot */ }
                else if (task.then) { const { then, thenOpts } = task; this.begin(then, thenOpts); return this.finishPose(dt, 'sit', false); }
            } else {
                this.x += dx / dist * step; this.y += dy / dist * step / 1.4;
                this.dir = dx < 0 ? -1 : 1;
                this.gait += dt * (task.run ? 17 : 7.5);
                moving = true;
                pose = 'stand';
                if (task.kind === 'zoom') { face.wide = true; ears = 0.5; pupil = 0.95; }
            }
        }
        switch (task.kind) {
            case 'approach': case 'wander': case 'box': if (!moving) pose = 'sit'; break;
            case 'lurk':
                pose = 'loaf'; targetDark = 0.85; this.dir = m.side; look = [0, -0.2];
                pupil = 0.9; face.glow = 1;
                if (this.cat.face === 'grin') face.mouth = 'grin';
                if (task.t > task.dur && this.lead) this.afterStare();
                else if (task.t > task.dur) this.done();
                break;
            case 'stare': {
                pose = 'sit'; this.dir = -m.side;
                const orn = m.ornamentAt();
                look = this.lookAt(orn); pupil = Math.min(1, 0.4 + task.t / 20); swishRate = 2.6; swishAmp = 0.35; ears = -0.25;
                this.tiltTo(orn);
                if (this.cat.face === 'grin') face.mouth = 'grin';
                if (this.cat.id === 'persian') face.lids = 'judge';
                if (task.t > 25 && task.said < 1) { task.said = 1; m.say(`${this.name} is still staring at the ornament.`); }
                if (task.t > 55 && task.said < 2) { task.said = 2; m.say('This has been going on for some time.'); }
                if (task.t > task.dur) this.afterStare();
                break;
            }
            case 'bat': {
                pose = 'sit'; this.dir = -m.side;
                const orn = m.ornamentAt();
                look = task.eye ? [0, 0.1] : this.lookAt(orn); pupil = 0.85; ears = -0.3; swishRate = 3; swishAmp = 0.4;
                if (task.eye) { face.lids = 'scheme'; face.mouth = 'smirk'; }
                this.tiltTo(orn);
                // Wind up, swat, recover; Ras sometimes pushes slowly, looking at you.
                const period = task.eye ? 2.8 : 1.1, ph = (task.t % period) / period;
                const reach = task.eye ? (ph < 0.85 ? ph / 0.85 : 1 - (ph - 0.85) / 0.15) : ph < 0.35 ? 0 : ph < 0.55 ? (ph - 0.35) / 0.2 : Math.max(0, 1 - (ph - 0.55) / 0.3);
                task.paw = reach;
                this.pawAim = this.reachFor(orn);
                this.claws = reach > 0.7;
                const hitAt = task.eye ? 0.84 : 0.52;
                if (ph >= hitAt && task.lastHit !== Math.floor(task.t / period)) {
                    task.lastHit = Math.floor(task.t / period);
                    const pawW = this.world(this.pawAim);
                    if (Math.hypot(pawW.x - orn.x, pawW.y - orn.y) < 40 * this.u * this.cat.size) {
                        const knock = task.knock && task.i === task.count - 1;
                        const indy = knock && this.name === 'Indiana Jones';
                        // Indiana Jones knocks it the wrong way, and it comes rolling after him.
                        m.hit(indy ? m.side : -m.side, task.eye ? 0.8 : 0.4 + Math.random() * 0.6, knock);
                        if (indy) { m.say('Indiana Jones and the Ornament of Doom.', 5); if (m.pendulum.free) m.pendulum.free.vx = m.side * 260 * this.u; this.begin('zoom'); this.task.laps = 1; this.task.target = { x: m.side < 0 ? 50 * this.u : L.W - 50 * this.u, y: this.y }; break; }
                        if (knock) m.say(`The ornament is on the floor. ${this.name} is very pleased.`);
                    }
                    task.i++;
                }
                if (task.i >= task.count && ph > 0.9) {
                    task.paw = 0;
                    if (!m.pendulum.hung && Math.random() < 0.5 + T.play * 0.4) this.begin('chase', { ornament: true });
                    else this.begin('stare', { long: false });
                }
                break;
            }
            case 'rear': {
                pose = 'rear'; this.dir = -m.side; look = [0, -1]; pupil = 0.9; ears = -0.3;
                if (task.t > task.dur) this.begin('climb', { force: task.force });
                break;
            }
            case 'climb': {
                // Up into the boughs; the tree sways more with every scramble.
                pose = 'rear'; this.dir = -m.side; moving = true; this.gait += dt * 10; pupil = 1; face.wide = true;
                const art = m.treeArt, k = Math.min(1, task.t / task.dur);
                const lx = m.side * art.w * (0.42 - 0.3 * k), ly = -art.h * (0.05 + 0.32 * k);
                const p = m.treePoint(lx, ly);
                this.x = p.x; this.y = p.y + 30 * this.u * this.cat.size;
                if (Math.random() < dt * 3) m.push(m.side * (0.25 + 0.4 * this.cat.size * this.cat.chunk) * (Math.random() < 0.5 ? 1 : 0.6));
                if (task.t > task.dur) {
                    const topples = m.config.topple && !m.host.reducedMotion && (task.force ? CatOrnamentLogic.climbTopples(this.cat, () => 0) : CatOrnamentLogic.climbTopples(this.cat, Math.random));
                    if (topples) m.topple(m.side);
                    this.leap(topples);
                }
                break;
            }
            case 'jump': {
                // A leap clear, landing on the floor.
                const j = task, k = Math.min(1, task.t / j.dur);
                this.x = j.from.x + (j.to.x - j.from.x) * k;
                this.y = j.from.y + (j.to.y - j.from.y) * k - Math.sin(k * Math.PI) * 60 * this.u;
                pose = k < 0.5 ? 'stand' : 'crouch'; this.dir = j.to.x < j.from.x ? -1 : 1; face.wide = true; pupil = 1; ears = 0.6;
                if (k >= 1) { this.airborne = false; this.begin(j.innocent ? 'innocent' : 'sit', { dur: 5 }); }
                break;
            }
            case 'innocent': pose = 'sit'; look = [0, 0.15]; pupil = 0.55; face.mouth = this.cat.face === 'grin' ? 'grin' : 'w'; open = 0.95; break;
            case 'chase': {
                // The laser dot, or the ornament rolling about.
                const target = task.ornament ? (m.pendulum.free || null) : m.laser;
                if (!target) { this.lead ? this.begin('stare') : this.begin('sit', { dur: 5 }); break; }
                const dx = target.x - this.x, dy = (task.ornament ? target.floor : target.y) - this.y, dist = Math.hypot(dx, dy);
                pupil = 1; ears = -0.4; face.wide = true;
                if (dist > 30 * this.u) {
                    const step = this.speed * dt;
                    this.x += dx / dist * Math.min(step, dist); this.y += dy / dist * Math.min(step, dist) * 0.8;
                    this.dir = dx < 0 ? -1 : 1; this.gait += dt * 16; moving = true; pose = 'crouch';
                } else {
                    pose = 'crouch'; this.dir = dx < 0 ? -1 : 1;
                    task.pounce = (task.pounce || 0) + dt;
                    if (task.pounce > 0.7) {
                        task.pounce = 0;
                        if (task.ornament) m.hit(this.dir, 0.5 + Math.random() * 0.5);
                        else if (m.laser) { m.laser.x += (Math.random() - 0.5) * 160 * this.u; m.laser.x = Math.max(20, Math.min(L.W - 20, m.laser.x)); }
                        task.paw = 1; this.pawAim = [40, -4]; this.claws = true;
                    }
                }
                if (task.t > (task.ornament ? 9 : 14)) this.lead ? this.begin('stare') : this.done();
                break;
            }
            case 'sleep': pose = 'curl'; open = 0; swishAmp = 0.04; swishRate = 0.5;
                if (Math.random() < dt / 2.2) this.zs.push({ t: 0, x: Math.random() * 4 });
                if (task.t > task.dur) this.done();
                break;
            case 'inbox': pose = 'loaf'; open = task.t % 30 < 20 ? 0 : 0.6; if (open === 0 && Math.random() < dt / 2.5) this.zs.push({ t: 0, x: Math.random() * 4 });
                this.dir = -1; if (task.t > task.dur) this.done(); break;
            case 'loaf': pose = 'loaf'; open = 0.55; face.lids = 'sleepy'; if (task.t > task.dur) this.done(); break;
            case 'lounge': pose = 'belly'; open = 0.5; face.lids = 'sleepy'; face.mouth = 'smile'; swishAmp = 0.08;
                if (task.t > task.dur) this.done(); break;
            case 'blink': {
                pose = 'sit'; look = [0, 0.15]; face.mouth = 'smile';
                const ph = task.t % 4;
                open = ph < 2.6 ? 1 : ph < 3.2 ? 1 - (ph - 2.6) / 0.6 : ph < 3.5 ? 0 : (ph - 3.5) / 0.5;
                if (this.cat.traits.love > 0.8) { face.blush = 1; if (ph > 3.2 && ph - dt <= 3.2) m.hearts.push({ x: this.headWorld().x, y: this.headWorld().y - 20 * this.u, t: 0, p: Math.random() * 6 }); }
                if (this.cat.face === 'love' && ph >= 3.2 && ph < 3.5) face.lids = 'happy';
                if (task.t > task.dur) this.done();
                break;
            }
            case 'groom': pose = 'sit'; task.paw = 0.55 + Math.sin(task.t * 6) * 0.25; this.pawAim = [this.pose.N[0] + 2, this.pose.N[1] + 10]; open = 0.3; this.tiltBy(-0.25);
                if (task.t > task.dur) this.done(); break;
            case 'watch': {
                pose = 'sit';
                const lead = m.cats[m.lead];
                const focus = lead && lead !== this ? (lead.task.kind === 'lurk' ? m.ornamentAt() : { x: lead.x, y: lead.y - 40 * this.u }) : m.ornamentAt();
                this.dir = focus.x < this.x ? -1 : 1; look = this.lookAt(focus); this.tiltTo(focus);
                if (task.t > task.dur) this.done(); break;
            }
            case 'startle': pose = 'stand'; face.wide = true; pupil = 1; ears = 0.9; this.puff = Math.max(this.puff, 1 - task.t / task.dur);
                this.y = Math.min(this.y, L.floor.y1);
                if (task.t > task.dur) { this.puff = 0; this.lead ? this.begin('innocent') : this.begin('watch', { dur: 8 }); } break;
            case 'sit': default:
                if (!moving) pose = 'sit';
                if (task.t > (task.dur || 5)) this.done();
        }
        if (!this.lead && task.kind !== 'chase' && task.kind !== 'zoom' && Math.random() < dt / 6) this.dir = Math.random() < 0.5 ? -1 : 1;
        // The face's resting expression, by temperament, unless the task set one.
        if (!face.mouth) face.mouth = { grin: 'grin', love: 'smile', curious: 'w', scheme: 'smirk', sweet: 'smile', wild: 'open', play: 'open', judge: 'frown' }[this.cat.face];
        if (!face.lids && this.cat.face === 'scheme' && task.kind !== 'blink') face.lids = 'scheme';
        if (!face.lids && this.cat.face === 'judge') face.lids = 'judge';
        if (this.cat.face === 'love' && task.kind === 'sit' && !face.lids) face.lids = 'happy';
        if (this.cat.face === 'wild' && !face.lids) face.wide = true;
        face.ears = ears;
        face.pupil += (pupil - (face.pupil ?? 0.35)) * Math.min(1, dt * 2);
        face.open += (open - face.open) * Math.min(1, dt * 6);
        face.look = look;
        // Blinks.
        this.blinkIn -= dt;
        if (this.blinkIn < 0) { this.blink = Math.min(1, this.blink + dt * 12); if (this.blinkIn < -0.18) { this.blinkIn = 2.5 + Math.random() * 5; } }
        else this.blink = Math.max(0, this.blink - dt * 10);
        face.blink = this.blink;
        face.glow = (face.glow || 0) * (targetDark > 0 ? 1 : 0);
        this.dark += (targetDark - this.dark) * Math.min(1, dt * 3);
        this.swishPhase = (this.swishPhase || 0) + dt * swishRate;
        this.swish = Math.sin(this.swishPhase) * swishAmp + (task.kind === 'stare' ? Math.sin(this.swishPhase * 3.3) * 0.12 : 0);
        for (const z of this.zs) z.t += dt;
        this.zs = this.zs.filter(z => z.t < 3);
        this.finishPose(dt, pose, moving);
    }

    finishPose(dt, pose, moving) {
        CatArt.toward(this.pose, pose, Math.min(1, dt * (moving ? 10 : 5)));
        // Settled into the pose: close enough to it that a cached picture of it will do.
        const target = CatArt.POSES[pose];
        this.settled = !moving && ['S', 'H', 'N', 'fpn'].every(k => Math.abs(this.pose[k][0] - target[k][0]) + Math.abs(this.pose[k][1] - target[k][1]) < 0.4);
        this.poseName = pose;
        this.moving = moving;
        this.tilt = (this.tilt || 0) + ((this.tiltTarget || 0) - (this.tilt || 0)) * Math.min(1, dt * 4);
        this.tiltTarget = 0;
    }

    tiltTo(p) {
        const h = this.headWorld();
        const a = Math.atan2(p.y - h.y, (p.x - h.x) * this.dir);
        this.tiltTarget = Math.max(-0.35, Math.min(0.35, a * 0.35));
    }

    tiltBy(a) { this.tiltTarget = a; }

    // Eyes toward a point on screen.
    lookAt(p) {
        const h = this.headWorld(), dx = p.x - h.x, dy = p.y - h.y, l = Math.hypot(dx, dy) || 1;
        return [Math.max(-1, Math.min(1, dx / l * 1.3 * this.dir)), Math.max(-1, Math.min(1, dy / l * 1.3))];
    }

    // A paw toward a point, as far as a front leg reaches from the shoulder.
    reachFor(p) {
        const q = this.local(p), S = this.pose.S, dx = q[0] - S[0], dy = q[1] - S[1], l = Math.hypot(dx, dy), max = 50;
        return l <= max ? q : [S[0] + dx / l * max, S[1] + dy / l * max];
    }

    // Between the cat's own units and the screen.
    local(p) { const k = this.u * this.cat.size; return [(p.x - this.x) / (this.dir * k), (p.y - this.y) / k]; }
    world(q) { const k = this.u * this.cat.size; return { x: this.x + q[0] * this.dir * k, y: this.y + q[1] * k }; }
    headWorld() { return this.world(this.pose.N); }

    // After a stare: the director's roll.
    afterStare() {
        const m = this.m;
        if (!m.pendulum.hung) { this.begin('stare'); return; }
        const next = CatOrnamentLogic.escalate(this.cat, m.config.mischief, Math.random, m.config.topple && !m.host.reducedMotion && m.tree.state === 'still');
        const [kind, opts] = next === 'climb' ? ['rear', {}] : next === 'knock' ? ['bat', { count: 2 + Math.floor(Math.random() * 2), knock: true }]
            : next === 'bat' ? ['bat', {}] : Math.random() < 0.5 ? ['groom', { dur: 6 + Math.random() * 6 }] : [this.cat.traits.lurk > 0.6 && Math.random() < 0.5 ? 'lurk' : 'stare', {}];
        // Out from under the tree first, on foot.
        if (this.task.kind === 'lurk' && kind !== 'lurk') { this.begin('sit'); this.goTo(m.spot(), kind, opts); return; }
        this.begin(kind, opts);
    }

    // Off the tree: clear of where it's falling, or straight down.
    leap(topples) {
        const m = this.m, L = m.layout;
        const away = topples ? -m.side : m.side;
        const to = { x: Math.max(40, Math.min(L.W - 40, L.treeX + away * m.treeArt.w * (topples ? 0.9 : 0.6))), y: L.floor.y0 + (L.floor.y1 - L.floor.y0) * 0.3 };
        this.begin('jump', { from: { x: this.x, y: this.y }, to, dur: 0.75, innocent: topples });
        this.airborne = true;
    }

    state(extra) {
        const face = { ...this.face };
        if (this.task.kind === 'lurk') face.glow = 1;
        return {
            x: this.x, y: this.y, u: this.u, dir: this.dir, pose: this.pose, face, gait: this.gait, moving: this.moving, run: !!this.task.run,
            swish: this.swish, puff: this.puff, breath: this.breath, paw: this.paw, pawAim: this.pawAim, claws: this.claws, tilt: this.tilt, ...extra,
        };
    }

    // A cat that isn't on the move changes only a little from frame to frame
    // (its breath, its tail, a blink, its eyes): it's drawn from cached
    // pictures of it, with those quantized to steps too small to notice,
    // rather than path by path each frame. On the move (walking, swatting,
    // climbing, leaping) it's drawn live.
    live(extra = {}) { return !!extra.eyesOnly || !this.settled || ['bat', 'chase', 'climb', 'rear', 'jump', 'startle', 'zoom'].includes(this.task.kind) || this.paw > 0.02; }

    draw(g, extra = {}) {
        const live = this.live(extra);
        this.m.stats.cats += 1;
        if (live) CatArt.draw(g, this.rig, this.state(extra));
        else { this.m.stats.still += 1; this.drawCached(g); }
        if (extra.eyesOnly) return;
        this.drawZs(g);
    }

    drawCached(g) {
        const TAU = Math.PI * 2, f = this.face, m = this.m, q = (v, n) => Math.round((v || 0) * n) / n;
        // The picture changes at most every 0.15 s: about seven new ones a second for a cat that's awake, one for one asleep.
        if (this.shown && m.time - this.shown.at < 0.15 && this.shown.kind === this.task.kind && this.shown.dir === this.dir) return this.blit(g, this.shown.c);
        const asleep = f.open < 0.2, steps = asleep ? 6 : 4;
        const s = {
            breath: Math.round(((this.breath % TAU) + TAU) % TAU / TAU * steps) % steps / steps * TAU,
            swish: asleep ? 0 : q(this.swish, 6), tilt: q(this.tilt, 8), puff: q(this.puff, 2),
            face: { ...f, open: q(f.open, 3), blink: asleep ? 0 : q(f.blink, 2), pupil: q(f.pupil, 4), look: [q(f.look?.[0], 2), q(f.look?.[1], 2)], ears: q(f.ears, 3), glow: this.task.kind === 'lurk' ? 1 : 0, blush: q(f.blush, 1) },
        };
        const key = [this.task.kind, this.poseName, this.dir, s.breath.toFixed(2), s.swish, s.tilt, s.puff, s.face.open, s.face.blink, s.face.pupil, s.face.look.join(), s.face.ears,
            f.mouth, f.lids, f.wide, s.face.blush, q(this.dark, 4), this.u.toFixed(3), m.dpr].join('|');
        let c = this.cache.get(key);
        if (c) { this.cache.delete(key); this.cache.set(key, c); }     // most recently used last
        else {
            const k = this.u * this.cat.size, w = 190 * k, h = 160 * k, d = m.dpr;
            // The oldest picture's canvas, reused, once there are enough.
            let canvas = null;
            if (this.cache.size >= 16) { const old = this.cache.keys().next().value; canvas = this.cache.get(old).canvas; this.cache.delete(old); }
            if (!canvas || canvas.width !== Math.ceil(w * d) || canvas.height !== Math.ceil(h * d)) { canvas = document.createElement('canvas'); canvas.width = Math.ceil(w * d); canvas.height = Math.ceil(h * d); }
            const cg = canvas.getContext('2d');
            cg.setTransform(1, 0, 0, 1, 0, 0);
            cg.globalCompositeOperation = 'source-over';
            cg.clearRect(0, 0, canvas.width, canvas.height);
            cg.setTransform(d, 0, 0, d, 0, 0);
            CatArt.draw(cg, this.rig, { ...this.state({}), ...s, x: w / 2, y: h - 14 * k, moving: false, paw: 0 });
            // In the shadow under the tree: darkened in the picture itself (its eyes come back on top later).
            if (this.dark > 0.02) {
                cg.setTransform(1, 0, 0, 1, 0, 0);
                cg.globalCompositeOperation = 'source-atop';
                cg.fillStyle = `rgba(6,4,10,${q(this.dark, 4) * 0.82})`;
                cg.fillRect(0, 0, canvas.width, canvas.height);
            }
            c = { canvas, w, h, ox: -w / 2, oy: -(h - 14 * k) };
            m.stats.misses += 1;
            this.cache.set(key, c);
        }
        this.shown = { at: m.time, kind: this.task.kind, dir: this.dir, c };
        this.blit(g, c);
    }

    blit(g, c) { g.drawImage(c.canvas, this.x + c.ox, this.y + c.oy, c.w, c.h); }

    // Z's from a sleeper.
    drawZs(g) {
        if (!this.zs.length) return;
        const h = this.headWorld();
        g.fillStyle = 'rgba(255,246,226,0.85)';
        g.font = `italic 600 ${Math.round(11 * this.u)}px Georgia, serif`;
        for (const z of this.zs) { g.globalAlpha = Math.min(1, z.t) * Math.max(0, 1 - z.t / 3); g.fillText('z', h.x + this.dir * (10 + z.t * 8) * this.u, h.y - (12 + z.t * 16) * this.u); }
        g.globalAlpha = 1;
    }
}
