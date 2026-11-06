// The Last Bulb on the Strand (SPEC §10.28): a strand of old C9 bulbs hangs
// in swags from cup hooks along the top of the wall, pooling coloured light
// on the plaster. Except the last one, on the tail where the wire drops off
// the final hook: it's loose. Every so often it makes contact (flick...
// flick...) and lights, and stays lit for a while, and then goes out with a
// flutter; sometimes it flickers twice and thinks better of it. On Christmas
// Eve it lights first time. Very rarely the whole strand goes out, sits
// dark, and someone off-screen twists the last bulb: the strand stutters
// back, and the last bulb, for once, is on.
//
// Nothing moves most of the time, so it costs nothing: the stage is told to
// idle until the next thing happens. A flicker redraws only the corner
// round the last bulb. A draft (or a tap) sets the bulbs swinging on their
// sockets for a few seconds; tapping the last bulb jiggles it.
//
// The pure parts (colours, the strand's shape, the flicker scripts, the
// filament) are last-bulb-logic.js; the art is last-bulb-art.js.

const LAST_BULB_STEP = 1 / 60;

class LastBulbAnimationManager {
    constructor(host) {
        this.host = host;
        this.config = WP.settings.load();
        this.running = false;
        this.time = 0;
        this.slots = {};
        this.listeners = [];
        this.stats = { full: 0, corner: 0 };     // for tests: whole-screen and corner-only redraws
        this.strand = { mode: 'on', steps: null, t: 0, power: 1, f: 1 };
        this.last = { mode: 'dark', steps: null, t: 0, power: 0, f: 0, th: 0, om: 0 };
        this.tail = { a: 0.35, w: 0 };
        this.gust = null;
        this.twist = null;
    }

    // ---- Lifecycle ------------------------------------------------------------------------

    start() {
        if (this.running) return;
        this.running = true;
        this.canvas = document.createElement('canvas');
        Object.assign(this.canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: '-1', pointerEvents: 'none' });
        document.body.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        this.checkEve();
        this.schedule('last', this.eve ? 2.5 : 6 + Math.random() * 6, () => this.tryLast());
        this.planOutage();
        this.planDraft();
        this.listen();
        this.lastNow = 0;
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
        if (this.host.params.thumb) return;
        on(document, 'pointerdown', e => { this.pointerType = e.pointerType; });
        this.listeners.push(this.host.gestures({ tap: (x, y) => { if (this.config.touch || this.pointerType === 'mouse') this.tap(x, y); } }));
    }

    applySettings(config) {
        const old = this.config;
        this.config = config;
        if (!this.running) return;
        const changed = keys => keys.some(k => JSON.stringify(old[k]) !== JSON.stringify(config[k]));
        if (changed(['palette', 'myColors', 'lastColour', 'glass', 'size', 'spacing', 'sag', 'end', 'wall', 'roomLight', 'tag'])) this.resize();
        if (changed(['outages'])) this.planOutage();
        if (changed(['draft'])) this.planDraft();
        if (changed(['christmasEve'])) this.checkEve();
        if (changed(['tryEvery', 'staysLit']) && this.last.mode !== 'busy') { this.cancel('last'); this.settleLast(this.last.mode); }
        this.dirty = true;
        this.host.idleUntil(0);
    }

    // ---- Timers on the scene's clock --------------------------------------------------------

    schedule(name, seconds, fn) { this.slots[name] = seconds === Infinity ? null : { at: this.time + seconds, fn }; }
    cancel(name) { this.slots[name] = null; }
    nextAt() { let at = Infinity; for (const s of Object.values(this.slots)) if (s && s.at < at) at = s.at; return at; }
    minutes(m) { return m * 60 * (0.7 + Math.random() * 0.6); }
    checkEve() { this.eve = !!this.config.christmasEve && LastBulbLogic.christmasEve(this.host.now()); }

    planOutage() {
        const mean = LastBulbLogic.OUTAGES[this.config.outages] ?? Infinity;
        this.schedule('outage', mean === Infinity ? Infinity : -mean * Math.log(1 - Math.random() * 0.98), () => { this.goOut(); this.planOutage(); });
    }
    planDraft() {
        const mean = this.host.reducedMotion ? Infinity : LastBulbLogic.draftEvery(this.config.draft);
        this.schedule('draft', mean === Infinity ? Infinity : -mean * Math.log(1 - Math.random() * 0.98), () => { this.blow(); this.planDraft(); });
    }

    // ---- The last bulb ------------------------------------------------------------------------

    // It tries: two flicks, then it lights, or (stubborn) it doesn't.
    tryLast(sure) {
        this.checkEve();
        if (this.strand.mode !== 'on') { this.schedule('last', 5, () => this.tryLast()); return; }
        const lights = sure || this.eve || Math.random() >= this.config.stubborn;
        this.playLast(LastBulbLogic.attempt(Math.random, lights), lights ? 'lit' : 'failed');
    }

    playLast(steps, then, keep) {
        Object.assign(this.last, { steps, t: 0, then, mode: 'busy' });
        if (!keep) { this.cancel('last'); this.cancel('dip'); }
        this.host.idleUntil(0);
    }

    // Its script has settled: what happens next, and when.
    settleLast(mode) {
        this.last.mode = mode;
        if (mode === 'lit') {
            if (!this.eve && !this.slots.last) this.schedule('last', this.minutes(this.config.staysLit), () => this.playLast(LastBulbLogic.quit(Math.random), 'dark'));
            this.schedule('dip', 25 + Math.random() * 50, () => this.playLast(LastBulbLogic.dip(Math.random), 'lit', true));
        } else if (mode === 'failed') {
            this.schedule('last', 15 + Math.random() * 35, () => this.tryLast());
        } else {
            this.schedule('last', this.minutes(this.config.tryEvery), () => this.tryLast());
        }
    }

    // ---- The strand -----------------------------------------------------------------------------

    // The whole strand goes out; a few dark seconds later, someone twists
    // the last bulb, and it all comes back, the last bulb with it.
    goOut(always) {
        this.checkEve();
        if ((this.eve && !always) || this.strand.mode !== 'on') return;
        Object.assign(this.strand, { steps: LastBulbLogic.outage(Math.random), t: 0, then: 'out', mode: 'busy' });
        this.schedule('fix', 3.5 + Math.random() * 3, () => this.fix());
        this.host.idleUntil(0);
    }

    fix() {
        this.cancel('fix');
        this.twist = { t: 0, until: 0.9 };
        this.moving = true;
        this.host.idleUntil(0);
    }

    // The twist is done: the strand flickers twice and holds.
    relight() {
        Object.assign(this.strand, { steps: LastBulbLogic.attempt(Math.random, true), t: 0, then: 'on', mode: 'busy' });
        this.cancel('last'); this.cancel('dip');
        Object.assign(this.last, { steps: [[1, Infinity]], t: 0, then: 'lit', mode: 'busy' });
    }

    // A draft along the strand, from the open side.
    blow(strength = 1) {
        this.gust = { t: 0, strength: strength * (0.7 + Math.random() * 0.6), dir: Math.random() < 0.5 ? -1 : 1 };
        this.moving = true;
        this.host.idleUntil(0);
    }

    // ---- Touch and keys -------------------------------------------------------------------------

    tap(x, y) {
        const L = this.L, w = L.w;
        let best = null, bestD = (1.3 * w + 14) ** 2;
        const lc = this.lastCentre();
        const dl = (lc.x - x) ** 2 + (lc.y - y) ** 2;
        if (dl < bestD) { best = 'last'; bestD = dl; }
        for (const b of this.bulbs) {
            const c = LastBulbArt.centre(LastBulbLogic.mx(L, b.x), b.y, this.angle(b.rest + b.th), w);
            const d = (c.x - x) ** 2 + (c.y - y) ** 2;
            if (d < bestD) { best = b; bestD = d; }
        }
        if (!best) return;
        if (best === 'last') this.jiggle();
        else { best.om += (Math.random() < 0.5 ? -1 : 1) * 4; this.moving = true; }
        this.host.idleUntil(0);
    }

    // Someone jiggles the last bulb: it may take, it may not.
    jiggle() {
        this.last.om += (Math.random() < 0.5 ? -1 : 1) * 5;
        this.tail.w += 1.2;
        this.moving = true;
        if (this.strand.mode === 'out') { this.fix(); return; }
        if (this.strand.mode !== 'on' || this.last.mode === 'busy') return;
        if (this.last.mode === 'lit') {
            if (Math.random() < 0.4 && !this.eve) this.playLast(LastBulbLogic.quit(Math.random), 'dark');
            else this.playLast(LastBulbLogic.dip(Math.random), 'lit', true);
        } else {
            const lights = this.eve || Math.random() < 0.85;
            this.playLast(LastBulbLogic.attempt(Math.random, lights), lights ? 'lit' : 'failed');
        }
    }

    keyTry() {
        if (this.strand.mode === 'out') { this.fix(); return; }
        if (this.last.mode === 'lit') this.playLast(LastBulbLogic.quit(Math.random), 'dark');
        else if (this.last.mode !== 'busy') this.tryLast();
        this.host.idleUntil(0);
    }
    keyOut() {
        if (this.strand.mode === 'out') this.fix();
        else this.goOut(true);
        this.host.idleUntil(0);
    }

    // ---- Layout and baking -------------------------------------------------------------------

    get L() { return this.layout; }
    angle(a) { return this.layout.mirror ? -a : a; }

    resize() {
        if (!this.canvas) return;
        const dpr = this.dpr = window.devicePixelRatio || 1;
        const W = this.W = innerWidth, H = this.H = innerHeight;
        this.canvas.width = Math.round(W * dpr);
        this.canvas.height = Math.round(H * dpr);
        const c = this.config;
        const L = this.layout = LastBulbLogic.layout(W, H, { top: this.host.insets?.top || 0, size: c.size, spacing: c.spacing, sag: c.sag, end: c.end });
        const colours = LastBulbLogic.colours(c);
        const old = this.bulbs || [];
        this.bulbs = L.bulbs.map((b, i) => ({ ...b, colour: colours[i % colours.length], th: old[i]?.th || 0, om: old[i]?.om || 0, k: 0.6 + ((i * 7919) % 13) / 16 }));
        this.lastColour = LastBulbLogic.lastColour(c, colours, L.lastIndex);
        this.tail.rest = L.rest;
        // Sprites: dark, lit and ember for each colour on the strand.
        const w = L.w, glass = c.glass;
        this.sprites = {};
        for (const col of new Set([...colours, this.lastColour])) {
            this.sprites[col] = { dark: LastBulbArt.bulb(col, w, dpr, 'dark', glass), lit: LastBulbArt.bulb(col, w, dpr, 'lit', glass), ember: LastBulbArt.bulb(col, w, dpr, 'ember', glass) };
        }
        this.plug = LastBulbArt.plug(w, dpr);
        this.tagArt = c.tag ? LastBulbArt.tag(w, dpr, 'jiggle') : null;
        // The wall: lit by the strand, dark (the strand out), and the corner
        // round the last bulb lit by it as well.
        const random = WP.seededRandom(1209);
        const wall = LastBulbArt.albedo(L, dpr, c.wall, random);
        this.ambient = 0.05 + c.roomLight * 0.6;
        const lights = this.bulbs.map(b => ({ ...LastBulbArt.centre(LastBulbLogic.mx(L, b.x), b.y, this.angle(b.rest), w), colour: b.colour }));
        const full = { x: 0, y: 0, w: W, h: H };
        const withWire = (layer, rect, strong) => {
            const g = layer.getContext('2d');
            g.setTransform(dpr, 0, 0, dpr, -rect.x * dpr, -rect.y * dpr);
            LastBulbArt.wire(g, L, g2 => LastBulbArt.strandPath(g2, L), strong);
            LastBulbArt.hooks(g, L);
            return layer;
        };
        this.litBg = withWire(LastBulbArt.lit(wall, L, dpr, full, this.ambient, lights), full, true);
        this.darkBg = withWire(LastBulbArt.lit(wall, L, dpr, full, this.ambient, []), full, false);
        const rect = this.corner = this.cornerRect();
        const lc = this.lastCentre(this.tail.rest, 0);
        this.lastBg = withWire(LastBulbArt.lit(wall, L, dpr, rect, this.ambient, [...lights, { ...lc, colour: this.lastColour }]), rect, true);
        this.dirty = true;
        this.host.idleUntil(0);
    }

    // The corner a flicker of the last bulb can change: its light's reach,
    // and the tail, the tag and the plug, all in CSS px, on the screen.
    cornerRect() {
        const L = this.L, lc = this.lastCentre(L.rest, 0), r = L.reach;
        const T = LastBulbLogic.tail(L, L.rest);
        const xs = [lc.x - r, lc.x + r, ...[L.lastHook, T.P.x, T.Q.x].map(x => LastBulbLogic.mx(L, x))];
        // On whole device pixels: a clip edge part-way through a pixel would
        // blend that column twice and leave a seam (the stage may render below 1:1).
        const d = this.dpr, lo = v => Math.floor(v * d) / d, hi = v => Math.ceil(v * d) / d;
        const x0 = Math.max(0, lo(Math.min(...xs) - L.w * 2)), x1 = Math.min(this.canvas.width / d, hi(Math.max(...xs) + L.w * 2));
        const y0 = Math.max(0, lo(L.top)), y1 = Math.min(this.canvas.height / d, hi(Math.max(lc.y + r, T.Q.y + L.w * 3)));
        return { x: x0, y: y0, w: Math.max(1 / d, x1 - x0), h: Math.max(1 / d, y1 - y0) };
    }

    // The tail at angle a: where the last bulb hangs, turned how, in screen space.
    lastPose(a = this.tail.a, th = this.last.th) {
        const L = this.L, T = LastBulbLogic.tail(L, a);
        const phi = -(a - L.rest) * 0.5 + 0.06 + th;
        return { x: LastBulbLogic.mx(L, T.P.x), y: T.P.y, a: this.angle(phi), T };
    }
    lastCentre(a, th) { const p = this.lastPose(a, th); return LastBulbArt.centre(p.x, p.y, p.a, this.L.w); }

    // ---- The frame -----------------------------------------------------------------------------

    frame(now) {
        if (!this.running) return;
        const raw = this.lastNow ? (now - this.lastNow) / 1000 : 0;
        this.lastNow = now;
        // After an idle the scene's clock catches up on the real time that
        // passed (up to what was asked for), so the next event comes on time;
        // nothing was animating, so that frame animates nothing (a flick
        // started now would otherwise be over before it was drawn).
        const dt = this.idled ? 0 : Math.min(0.1, raw);
        const sceneDt = this.idled ? Math.min(raw, this.idled + 1) : dt;
        this.idled = 0;
        const changed = this.update(sceneDt, dt);
        this.draw(changed);
        const busy = changed.strand || changed.last;
        if (!busy) {
            if (this.moving) this.host.idleUntil(Math.max(0, 1000 / 30 - (performance.now() - now) - 4));
            else {
                const wait = this.nextAt() - this.time;
                this.idled = Math.max(0, wait);
                this.host.idleUntil(wait === Infinity ? Infinity : Math.max(0, wait * 1000));
            }
        }
        this.frameId = requestAnimationFrame(t => this.frame(t));
    }

    update(sceneDt, dt) {
        this.time += sceneDt;
        for (const [name, slot] of Object.entries(this.slots)) {
            if (slot && slot.at <= this.time) { this.slots[name] = null; slot.fn(); }
        }
        const run = (who, onDone) => {
            if (!who.steps) return;
            who.t += dt;
            const { power, done } = LastBulbLogic.play(who.steps, who.t);
            who.power = power;
            if (done) { who.steps = null; onDone(who.then); }
        };
        run(this.strand, then => { this.strand.mode = then; });
        run(this.last, then => this.settleLast(then));
        const s = this.strand, l = this.last;
        const sf = s.f, lf = l.f;
        s.f = LastBulbLogic.filament(s.f, s.power, dt);
        l.f = LastBulbLogic.filament(l.f, l.power * s.power, dt);
        const strand = !!s.steps || Math.abs(s.f - sf) > 0.0005 || Math.abs(s.f - s.power) > 0.002;
        const last = !!l.steps || Math.abs(l.f - lf) > 0.0005 || Math.abs(l.f - l.power * s.power) > 0.002;
        if (!strand && !last) { s.f = s.power; l.f = l.power * s.power; }
        if (this.moving) {
            this.acc += dt;
            while (this.acc >= LAST_BULB_STEP) { this.acc -= LAST_BULB_STEP; this.physics(LAST_BULB_STEP); }
        }
        return { strand, last };
    }

    physics(h) {
        const L = this.L, t = this.tail, l = this.last;
        let F = 0, Ft = 0;
        if (this.gust) {
            const gu = this.gust;
            gu.t += h;
            if (gu.t > 3) this.gust = null;
        }
        const pulse = u => Math.exp(-(((u - 0.6) / 0.45) ** 2));
        for (const b of this.bulbs) {
            const along = L.mirror ? 1 - b.x / L.W : b.x / L.W;
            F = this.gust ? this.gust.dir * this.gust.strength * 3.2 * b.k * pulse(this.gust.t - along * 1.2) : 0;
            b.om += (-55 * b.th - 1.8 * b.om + F) * h;
            b.th += b.om * h;
        }
        if (this.gust) Ft = this.gust.dir * this.gust.strength * 1.6 * pulse(this.gust.t - 1.2);
        let twist = 0;
        if (this.twist) {
            const tw = this.twist;
            tw.t += h;
            twist = Math.sin(tw.t * Math.PI * 2 * 4.5) * 45;
            Ft += Math.sin(tw.t * Math.PI * 2 * 2.2) * 1.1;
            if (tw.t >= tw.until) { this.twist = null; this.relight(); }
        }
        const ta = -9 * (t.a - L.rest) - 0.7 * t.w + Ft;
        t.w += ta * h;
        t.a += t.w * h;
        l.om += (-55 * l.th - 2.2 * l.om + ta * 0.5 + twist) * h;
        l.th += l.om * h;
        // Still again: snap to rest, and draw that once.
        const quiet = !this.gust && !this.twist && Math.abs(t.a - L.rest) < 0.002 && Math.abs(t.w) < 0.01 && Math.abs(l.th) < 0.002 && Math.abs(l.om) < 0.01
            && this.bulbs.every(b => Math.abs(b.th) < 0.002 && Math.abs(b.om) < 0.01);
        if (quiet) {
            for (const b of this.bulbs) b.th = b.om = 0;
            t.a = L.rest; t.w = 0; l.th = l.om = 0;
            this.moving = false;
            this.dirty = true;
        }
    }

    // ---- Drawing -------------------------------------------------------------------------------

    draw(changed) {
        const g = this.ctx;
        if (this.moving || changed.strand || this.dirty) {
            this.dirty = false;
            this.stats.full++;
            g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
            this.paint(g);
        } else if (changed.last) {
            // A flicker: only the corner round the last bulb.
            this.stats.corner++;
            const r = this.corner;
            g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
            g.save();
            g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
            this.paint(g, r);
            g.restore();
        }
    }

    paint(g, clip) {
        const L = this.L, w = L.w, dpr = this.dpr;
        const S = LastBulbLogic.light(this.strand.f), Se = LastBulbLogic.ember(this.strand.f);
        const lf = this.last.f, Ll = LastBulbLogic.light(lf), Le = LastBulbLogic.ember(lf);
        const bg = (layer, alpha, r = { x: 0, y: 0, w: L.W, h: L.H }) => {
            if (alpha <= 0.003) return;
            g.globalAlpha = Math.min(1, alpha);
            const sx = clip ? Math.max(r.x, clip.x) : r.x, sy = clip ? Math.max(r.y, clip.y) : r.y;
            const ex = clip ? Math.min(r.x + r.w, clip.x + clip.w) : r.x + r.w, ey = clip ? Math.min(r.y + r.h, clip.y + clip.h) : r.y + r.h;
            if (ex <= sx || ey <= sy) { g.globalAlpha = 1; return; }
            g.drawImage(layer, (sx - r.x) * dpr, (sy - r.y) * dpr, (ex - sx) * dpr, (ey - sy) * dpr, sx, sy, ex - sx, ey - sy);
            g.globalAlpha = 1;
        };
        if (S < 0.997) bg(this.darkBg, 1);
        bg(this.litBg, S);
        bg(this.lastBg, Ll, this.corner);
        // The tail: wire off the last hook to the last socket, then on to the plug.
        const pose = this.lastPose(), T = pose.T, X = x => LastBulbLogic.mx(L, x);
        LastBulbArt.wire(g, L, g2 => {
            g2.beginPath();
            g2.moveTo(X(L.lastHook), L.hookY);
            g2.quadraticCurveTo(X(T.C.x), T.C.y, X(T.P.x), T.P.y);
            g2.quadraticCurveTo(X(T.P.x + w * 0.9), T.P.y + w * 0.2, X(T.Q.x), T.Q.y);
        }, false);
        LastBulbArt.hooks(g, { ...L, hooks: [L.lastHook] });
        if (this.tagArt) {
            // Tied to the last hook, between the strand's last bulb and the tail.
            const bx = L.lastHook + w * 0.1, by = L.hookY + w * 0.15;
            const ta = this.angle(-(this.tail.a - L.rest) * 0.5 + 0.05 + this.last.th * 0.15);
            LastBulbArt.put(g, this.tagArt.lit, X(bx), by, ta);
            const bright = Math.min(1, this.ambient * 1.4 + 0.45 * S + 0.6 * Ll);
            LastBulbArt.put(g, this.tagArt.shade, X(bx), by, ta, (1 - bright) * 0.85);
        }
        const put = (sp, x, y, a, light, emb) => {
            if (light < 0.997) LastBulbArt.put(g, sp.dark, x, y, a);
            LastBulbArt.put(g, sp.ember, x, y, a, emb);
            LastBulbArt.put(g, sp.lit, x, y, a, light);
        };
        for (const b of this.bulbs) {
            const x = X(b.x);
            if (clip && (x < clip.x - w * 3 || x > clip.x + clip.w + w * 3)) continue;
            put(this.sprites[b.colour], x, b.y, this.angle(b.rest + b.th), S, Se);
        }
        put(this.sprites[this.lastColour], pose.x, pose.y, pose.a, Ll, Le);
        LastBulbArt.put(g, this.plug, X(T.Q.x), T.Q.y, this.angle(-(this.tail.a - L.rest) * 0.8 - 0.1));
    }

    // For tests.
    debugState() {
        return {
            strand: this.strand.mode, strandLight: +LastBulbLogic.light(this.strand.f).toFixed(3),
            last: this.last.mode, lastLight: +LastBulbLogic.light(this.last.f).toFixed(3),
            moving: !!this.moving, eve: this.eve, bulbs: this.bulbs.length,
            next: Object.fromEntries(Object.entries(this.slots).filter(([, s]) => s).map(([k, s]) => [k, +(s.at - this.time).toFixed(1)])),
            stats: { ...this.stats },
        };
    }
}
