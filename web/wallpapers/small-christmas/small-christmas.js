// A Very Small Christmas (SPEC §10.30): a little pixel tree near the bottom
// of a big dark screen, on a strip of snow, with a few presents and a toy
// train parked on its oval of track. The lights blink (twinkle, chase,
// alternate, all together or steady). Every few minutes the train toots
// and does its laps round the tree. Now and then the whole set moves house:
// the track packs itself away, the tree hops along the floor to somewhere
// new with the presents and the train hopping after it in a line like
// ducklings, and the track lays itself back down round it. Stars twinkle;
// pixel snow falls; sometimes a sleigh crosses the sky.
//
// The picture is drawn at its own pixel size (a few hundred pixels across)
// and CSS scales it up, pixelated, so every frame is a small canvas and
// costs almost nothing; it runs at a retro 12 frames a second by default,
// idling between them.
//
// Tap the tree to jingle it, the train to send it round, the floor to move
// the tree there. The pure parts are small-christmas-logic.js; the sprites
// are small-christmas-art.js.

class SmallChristmasAnimationManager {
    constructor(host) {
        this.host = host;
        this.config = WP.settings.load();
        this.running = false;
        this.time = 0;
        this.listeners = [];
        this.slots = {};
        this.puffs = [];
        this.flakes = [];
        this.prints = [];
        this.sparkles = [];
        this.stats = { frames: 0, laps: 0, moves: 0, sleighs: 0 };
    }

    // ---- Lifecycle --------------------------------------------------------------------------

    start() {
        if (this.running) return;
        this.running = true;
        this.canvas = document.createElement('canvas');
        Object.assign(this.canvas.style, { position: 'fixed', left: '0', top: '0', zIndex: '-1', pointerEvents: 'none', imageRendering: 'pixelated' });
        document.body.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
        this.lines = document.createElement('canvas');
        Object.assign(this.lines.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: '-1', pointerEvents: 'none' });
        document.body.appendChild(this.lines);
        this.resize();
        this.plan();
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
        this.canvas.remove(); this.lines.remove();
        this.canvas = this.ctx = this.lines = null;
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
        if (changed(['treeSize', 'lights', 'garland', 'ornaments', 'presents', 'palette', 'pixelSize', 'snow', 'sky', 'scanlines', 'cars'])) this.resize();
        if (changed(['moveMinutes', 'train', 'trainMinutes', 'sleigh'])) this.plan();
        this.host.idleUntil(0);
    }

    // ---- Timers -----------------------------------------------------------------------------

    schedule(name, seconds, fn) { this.slots[name] = !isFinite(seconds) ? null : { at: this.time + seconds, fn }; }
    plan() {
        const c = this.config, vary = m => m * 60 * (0.7 + Math.random() * 0.6);
        this.schedule('move', c.moveMinutes > 0 ? vary(c.moveMinutes) : Infinity, () => { this.moveHouse(); this.plan1('move'); });
        this.schedule('train', c.train ? (this.trainPlanned ? vary(c.trainMinutes) : 6 + Math.random() * 6) : Infinity, () => { this.runTrain(); this.plan1('train'); });
        this.trainPlanned = true;
        this.schedule('sleigh', this.sleighEvery(), () => { this.flySleigh(); this.plan1('sleigh'); });
    }
    // Plan just one of them again.
    plan1(name) {
        const c = this.config, vary = m => m * 60 * (0.7 + Math.random() * 0.6);
        if (name === 'move') this.schedule('move', c.moveMinutes > 0 ? vary(c.moveMinutes) : Infinity, () => { this.moveHouse(); this.plan1('move'); });
        if (name === 'train') this.schedule('train', c.train ? vary(c.trainMinutes) : Infinity, () => { this.runTrain(); this.plan1('train'); });
        if (name === 'sleigh') this.schedule('sleigh', this.sleighEvery(), () => { this.flySleigh(); this.plan1('sleigh'); });
    }
    sleighEvery() {
        const mode = this.config.sleigh, eve = SmallXmasLogic.sleighNight(this.host.now());
        if (mode === 'never') return Infinity;
        if (eve) return 90 + Math.random() * 120;
        return mode === 'sometimes' ? 8 * 60 * (0.6 + Math.random() * 0.8) : Infinity;
    }

    // ---- Layout and sprites -----------------------------------------------------------------------

    resize() {
        if (!this.canvas) return;
        const c = this.config, W = innerWidth, H = innerHeight;
        const px = this.px = Math.max(2, Math.round(Math.max(3, Math.min(W, H) / 200) * c.pixelSize));
        const bw = this.bw = Math.ceil(W / px), bh = this.bh = Math.ceil(H / px);
        this.canvas.width = bw; this.canvas.height = bh;
        this.canvas.style.width = `${bw * px}px`; this.canvas.style.height = `${bh * px}px`;
        const P = this.P = SmallXmasLogic.palette(c.palette, c.lights);
        const random = WP.seededRandom(1224);
        this.tree = SmallXmasArt.tree(c.treeSize, P, random, { snow: c.snow > 0, garland: c.garland, ornaments: c.ornaments });
        this.trainArt = SmallXmasArt.train(P);
        this.sleighArt = SmallXmasArt.sleigh(P);
        // The floor: the track's oval, and room below it to the inset.
        const inset = Math.ceil((this.host.insets?.bottom || 0) / px);
        const rx = Math.round(this.tree.w / 2) + 12, ry = Math.max(4, Math.round(rx * 0.34));
        this.oval = SmallXmasLogic.oval(rx, ry);
        this.cy = bh - inset - ry - 4;
        this.groundTop = this.cy - ry - 6;
        this.bg = SmallXmasArt.night(bw, bh, P, { groundTop: this.groundTop, moon: c.sky, moonX: Math.round(bw * 0.82), moonY: Math.round(Math.min(bh * 0.14, 24)) });
        this.margin = rx + 3;
        if (this.setX === undefined || this.setX < this.margin || this.setX > bw - this.margin) this.setX = Math.round(bw * 0.5);
        // The presents: inside the oval, in front of the pot. More on Christmas Day.
        const n = Math.min(9, c.presents + (SmallXmasLogic.christmasDay(this.host.now()) && c.presents ? 3 : 0));
        const spots = [[-7, 2], [6, 2], [-1, 3], [-13, 1], [12, 1], [2, 1], [-17, 2], [17, 2], [-5, 4]];
        this.presents = [];
        for (let i = 0; i < n; i++) {
            const w = 3 + Math.floor(random() * 4), h = 2 + Math.floor(random() * 4);
            const colour = P.presents[i % P.presents.length];
            const art = SmallXmasArt.present(w, h, colour, P, colour === P.gold ? P.white : null);
            const [dx, dy] = spots[i];
            this.presents.push({ art, dx: Math.max(-rx + 3, Math.min(rx - 3, dx)), dy: Math.min(ry - 1, dy) });
        }
        // The train: its cars, and where they park (behind the tree).
        const kinds = ['tender', 'gift', 'caboose'].slice(0, Math.max(0, Math.min(3, c.cars)));
        this.cars = [{ kind: 'engine', gap: 0 }, ...kinds.map(kind => ({ kind, gap: kind === 'tender' ? 9.5 : 8.5 }))];
        let off = 0;
        for (const car of this.cars) { off += car.gap; car.offset = off; }
        this.trainS = this.trainS ?? this.oval.length * 0.04 + off * 0.5;     // parked: the back of the oval, behind the tree
        this.trackPixels = this.trackPix();
        this.track = this.track ?? 1;
        // Stars, in the sky above the floor.
        this.stars = [];
        if (c.sky) for (let i = 0; i < Math.round(bw * this.groundTop / 600); i++) this.stars.push({ x: Math.floor(random() * bw), y: Math.floor(random() * (this.groundTop - 6)), big: random() < 0.08, k: random() });
        // Scanlines over it all, baked.
        this.lines.width = Math.round(W * (window.devicePixelRatio || 1));
        this.lines.height = Math.round(H * (window.devicePixelRatio || 1));
        const lg = this.lines.getContext('2d');
        lg.clearRect(0, 0, this.lines.width, this.lines.height);
        if (c.scanlines) {
            const d = this.lines.height / H;
            lg.fillStyle = 'rgba(0,0,0,0.22)';
            for (let y = 0; y < bh; y++) lg.fillRect(0, Math.round((y + 1) * px * d - Math.max(1, px * d * 0.3)), this.lines.width, Math.max(1, Math.round(px * d * 0.3)));
        }
        this.flakes = [];
        this.host.idleUntil(0);
    }

    // The track as pixels in order round the oval (two rails, ties between),
    // relative to the oval's centre: drawn whole, or partly while it packs
    // itself away or lays itself down.
    trackPix() {
        const o = this.oval, P = this.P, seen = new Set(), out = [];
        const put = (x, y, c, at) => { const k = x + ',' + y; if (!seen.has(k)) { seen.add(k); out.push({ x, y, c, at }); } };
        for (let i = 0; i < o.pts.length; i++) {
            const a = -Math.PI / 2 + i / (o.pts.length - 1) * Math.PI * 2, at = i / (o.pts.length - 1);
            if (i % 9 === 0) for (let r = -1; r <= 1; r++) put(Math.round(Math.cos(a) * (o.rx + r)), Math.round(Math.sin(a) * (o.ry + r * 0.5)), P.tie, at);
            put(Math.round(Math.cos(a) * (o.rx + 1.2)), Math.round(Math.sin(a) * (o.ry + 0.6)), P.grey, at);
            put(Math.round(Math.cos(a) * (o.rx - 1.2)), Math.round(Math.sin(a) * (o.ry - 0.6)), P.grey, at);
        }
        // Packing away goes in a scatter; laying down goes round.
        const rand = WP.seededRandom(25);
        for (const p of out) p.scatter = rand();
        return out;
    }

    // ---- Things that happen ------------------------------------------------------------------------

    // The train toots and goes round, laps times, and parks again.
    runTrain(laps = this.config.laps) {
        if (this.move || this.trainRun) return;
        this.trainRun = { from: this.trainS, to: this.trainS + laps * this.oval.length, laps };
        for (let i = 0; i < 3; i++) this.puff(i * 0.4);
        this.host.idleUntil(0);
    }

    // Move house: the track packs away, everyone hops to the new spot in a
    // line, and the track lays itself down again.
    moveHouse(to) {
        if (this.move || this.trainRun) return;
        const target = to ?? SmallXmasLogic.newSpot(this.bw, this.margin, this.setX, Math.random);
        if (Math.abs(target - this.setX) < 3) return;
        const dx = target - this.setX;
        const hopper = (x, y, delay) => ({ x, y, hops: SmallXmasLogic.hops(x, x + dx, 7), i: 0, t: -delay, from: x });
        const followers = [{ who: 'tree', ...hopper(this.setX, 0, 0) }];
        this.presents.forEach((p, i) => followers.push({ who: p, ...hopper(this.setX + p.dx, p.dy, 0.25 + i * 0.16) }));
        const base = 0.25 + this.presents.length * 0.16 + 0.15;
        this.cars.forEach((car, i) => { const at = this.carAt(car); followers.push({ who: car, ...hopper(this.setX + at.x, at.y, base + i * 0.16), dir: Math.sign(dx) }); });
        this.move = { phase: 'pack', t: 0, to: target, followers };
        this.stats.moves++;
        this.host.idleUntil(0);
    }

    flySleigh(always) {
        if (this.sleighRun || (this.config.sleigh === 'never' && !always)) return;
        const dir = Math.random() < 0.5 ? 1 : -1;
        this.sleighRun = { x: dir > 0 ? -30 : this.bw + 30, y: Math.round(this.groundTop * (0.18 + Math.random() * 0.3)), dir, t: 0 };
        this.stats.sleighs++;
        this.host.idleUntil(0);
    }

    jingle() {
        this.jingling = 1.6;
        this.host.idleUntil(0);
    }

    puff(delay = 0) { this.puffs.push({ delay, t: 0, x: null, y: null }); }

    tap(cssX, cssY) {
        const x = cssX / this.px, y = cssY / this.px;
        const t = this.tree;
        if (Math.abs(x - this.setX) <= t.w / 2 + 1 && y >= this.cy - t.h - 1 && y <= this.cy + 1) return this.jingle();
        for (const car of this.cars) {
            const at = this.carAt(car);
            if (Math.abs(x - (this.setX + at.x)) < 6 && Math.abs(y - (this.cy + at.y - 3)) < 5) { this.trainRun ? this.puff() : this.runTrain(1); return; }
        }
        if (y >= this.groundTop - 2) this.moveHouse(Math.max(this.margin, Math.min(this.bw - this.margin, Math.round(x))));
    }

    // Where a car is on the oval now (relative to the oval's centre).
    carAt(car) { return SmallXmasLogic.along(this.oval, this.trainS - car.offset); }

    // ---- The frame loop -----------------------------------------------------------------------------

    frame(now) {
        if (!this.running) return;
        const raw = this.lastNow ? (now - this.lastNow) / 1000 : 0;
        this.lastNow = now;
        const dt = Math.min(0.25, raw);
        this.time += raw > 1 ? 0.25 : raw;
        for (const [name, slot] of Object.entries(this.slots)) if (slot && slot.at <= this.time) { this.slots[name] = null; slot.fn(); }
        this.update(dt);
        this.draw();
        this.stats.frames++;
        const fps = Math.min(this.config.fps, this.host.quality?.fps || 60);
        this.host.idleUntil(Math.max(0, 1000 / fps - (performance.now() - now) - 2));
        this.frameId = requestAnimationFrame(t => this.frame(t));
    }

    update(dt) {
        const c = this.config;
        // The train.
        if (this.trainRun) {
            const r = this.trainRun, total = r.to - r.from, done = this.trainS - r.from;
            const ease = Math.min(1, (done + 4) / 30, (total - done + 2) / 30);
            const before = Math.floor(done / this.oval.length);
            this.trainS = Math.min(r.to, this.trainS + 16 * c.trainSpeed * Math.max(0.15, ease) * dt);
            if (Math.floor((this.trainS - r.from) / this.oval.length) > before) this.stats.laps++;
            if (Math.random() < dt * 3.5) this.puff();
            if (this.trainS >= r.to) { this.trainS = r.from; this.trainRun = null; }
        }
        // Moving house.
        if (this.move) {
            const m = this.move;
            m.t += dt;
            if (m.phase === 'pack') { this.track = Math.max(0, 1 - m.t / 0.8); if (m.t >= 0.9) { m.phase = 'hop'; m.t = 0; } }
            else if (m.phase === 'hop') {
                let all = true;
                for (const f of m.followers) {
                    f.t += dt;
                    if (f.t < 0) { all = false; continue; }
                    while (f.i < f.hops.length && f.t >= 0.32) {
                        f.t -= 0.32; f.from = f.hops[f.i]; f.i++;
                        if (f.who === 'tree') this.prints.push({ x: f.from, life: 25 });
                    }
                    if (f.i < f.hops.length) all = false;
                }
                if (all) { this.setX = m.to; m.phase = 'lay'; m.t = 0; }
            } else if (m.phase === 'lay') { this.track = Math.min(1, m.t / 1.4); if (m.t >= 1.5) { this.track = 1; this.move = null; } }
        }
        for (const p of this.prints) p.life -= dt;
        this.prints = this.prints.filter(p => p.life > 0);
        if (this.jingling) this.jingling = Math.max(0, this.jingling - dt);
        // Smoke from the stack.
        for (const p of this.puffs) {
            if (p.delay > 0) { p.delay -= dt; continue; }
            if (p.x === null) {
                const at = this.carAt(this.cars[0]), mx = this.move?.followers.find(f => f.who === this.cars[0]);
                const x = mx ? mx.from : this.setX + at.x;
                p.x = x + (at.dir > 0 ? 2 : -2); p.y = this.cy + at.y - 7; p.drift = -at.dir * 2;
            }
            p.t += dt; p.y -= 5 * dt; p.x += p.drift * dt;
        }
        this.puffs = this.puffs.filter(p => p.t < 1.6);
        // The sleigh, and the sparkle it leaves.
        if (this.sleighRun) {
            const s = this.sleighRun;
            s.t += dt; s.x += s.dir * 22 * dt;
            if (Math.random() < dt * 14) this.sparkles.push({ x: Math.round(s.x - s.dir * 4), y: Math.round(s.y + 5 + Math.sin(s.t * 3) * 1.5), life: 0.8 + Math.random() * 0.8 });
            if (s.x < -40 || s.x > this.bw + 40) this.sleighRun = null;
        }
        for (const p of this.sparkles) p.life -= dt;
        this.sparkles = this.sparkles.filter(p => p.life > 0);
        // Pixel snow.
        const want = Math.round(this.bw * this.bh / 900 * c.snow * (this.host.quality?.density ?? 1));
        while (this.flakes.length < want) this.flakes.push({ x: Math.random() * this.bw, y: this.flakes.length < want * 0.8 && !this.seeded ? Math.random() * this.bh : -2, v: 4 + Math.random() * 6, w: Math.random() * 6, big: Math.random() < 0.12 });
        this.seeded = true;
        if (this.flakes.length > want) this.flakes.length = want;
        for (const f of this.flakes) {
            f.y += f.v * dt; f.x += Math.sin(this.time * 0.8 + f.w) * 2 * dt;
            if (f.y >= (this.bg.edge[Math.max(0, Math.min(this.bw - 1, Math.round(f.x)))] ?? this.bh)) { f.y = -2; f.x = Math.random() * this.bw; }
        }
    }

    draw() {
        const g = this.ctx, P = this.P, t = this.time, c = this.config;
        g.drawImage(this.bg.c, 0, 0);
        // Stars: most hold, a few twinkle.
        const tick = Math.floor(t * 3);
        for (const s of this.stars) {
            const on = SmallXmasLogic.hash(Math.round(s.k * 9999), tick) > 0.12;
            g.fillStyle = on ? P.star : P.starDim;
            g.fillRect(s.x, s.y, 1, 1);
            if (s.big && on && SmallXmasLogic.hash(s.x, tick) > 0.5) { g.fillRect(s.x - 1, s.y, 1, 1); g.fillRect(s.x + 1, s.y, 1, 1); g.fillRect(s.x, s.y - 1, 1, 1); g.fillRect(s.x, s.y + 1, 1, 1); }
        }
        // The sleigh, up among them.
        for (const p of this.sparkles) { g.fillStyle = (Math.floor(p.life * 8) % 2) ? P.starGold : P.white; g.fillRect(p.x, p.y, 1, 1); }
        if (this.sleighRun) {
            const s = this.sleighRun, art = this.sleighArt[Math.floor(s.t * 6) % 2][s.dir > 0 ? 'right' : 'left'];
            g.drawImage(art.c, Math.round(s.x - art.w / 2), Math.round(s.y + Math.sin(s.t * 3) * 1.5));
        }
        // Footprints in the snow, where the tree landed.
        g.fillStyle = P.snowShade;
        for (const p of this.prints) { g.fillRect(p.x - 2, this.cy + 1, 1, 1); g.fillRect(p.x + 2, this.cy + 1, 1, 1); }
        // The track (all of it, or the part that's laid).
        const T = this.track, ox = this.setX, oy = this.cy;
        if (T > 0) {
            const laying = this.move?.phase === 'lay';
            for (const p of this.trackPixels) {
                if (T < 1 && (laying ? p.at > T : p.scatter > T)) continue;
                g.fillStyle = p.c; g.fillRect(ox + p.x, oy + p.y, 1, 1);
            }
        }
        // Everything standing on the floor, back to front.
        const things = [];
        const hopping = who => this.move?.followers.find(f => f.who === who);
        const hopAt = f => {
            if (!f || this.move.phase !== 'hop' || f.t < 0 || f.i >= f.hops.length) return null;
            const k = f.t / 0.32, h = SmallXmasLogic.hop(k, f.who === 'tree' ? 5 : 3);
            return { x: Math.round(f.from + (f.hops[f.i] - f.from) * Math.min(1, k)), lift: h.y, squash: h.squash };
        };
        const placed = (who, x, y) => { const f = hopping(who); const h = hopAt(f); return f ? { x: h ? h.x : f.i >= f.hops.length ? f.hops[f.hops.length - 1] : f.from, y, lift: h?.lift || 0, squash: h?.squash || 0 } : { x, y, lift: 0, squash: 0 }; };
        const tp = placed('tree', this.setX, 0);
        const shake = this.jingling ? (Math.floor(t * 16) % 2 ? 1 : -1) : 0;
        things.push({ y: oy, draw: () => this.drawTree(g, tp.x + shake, oy + tp.lift, tp.squash) });
        for (const p of this.presents) {
            const q = placed(p, this.setX + p.dx, p.dy);
            things.push({ y: oy + p.dy + 0.5, draw: () => g.drawImage(p.art.c, Math.round(q.x - p.art.w / 2), oy + p.dy + q.lift - p.art.h + 1 + (q.squash ? 1 : 0), p.art.w, p.art.h - (q.squash ? 1 : 0)) });
        }
        this.cars.forEach(car => {
            const at = this.carAt(car), q = placed(car, this.setX + at.x, at.y);
            const f = hopping(car), dir = f ? f.dir : at.dir;
            const art = car.kind === 'engine' ? this.trainArt.engine[this.trainRun ? Math.floor(t * 8) % 2 : 0][dir > 0 ? 'right' : 'left'] : this.trainArt[car.kind][dir > 0 ? 'right' : 'left'];
            const y = Math.round(oy + at.y);
            things.push({ y: oy + at.y, draw: () => g.drawImage(art.c, Math.round(q.x - art.w / 2), y - art.h + 1 + q.lift) });
        });
        things.sort((a, b) => a.y - b.y);
        for (const th of things) th.draw();
        // Smoke, rising and thinning.
        for (const p of this.puffs) {
            if (p.delay > 0 || p.x === null) continue;
            const r = p.t < 0.4 ? 0 : p.t < 1 ? 1 : 2, x = Math.round(p.x), y = Math.round(p.y);
            g.fillStyle = p.t < 1 ? P.smoke : P.smokeDim;
            if (r === 0) g.fillRect(x, y, 1, 1);
            else if (r === 1) { g.fillRect(x - 1, y, 3, 1); g.fillRect(x, y - 1, 1, 3); }
            else { g.fillRect(x - 1, y - 1, 3, 3); g.fillRect(x - 2, y, 5, 1); g.fillRect(x, y - 2, 1, 5); }
        }
        // Snow in front of it all.
        g.fillStyle = P.snow;
        for (const f of this.flakes) {
            const x = Math.round(f.x), y = Math.round(f.y);
            g.fillRect(x, y, 1, 1);
            if (f.big) { g.fillStyle = P.snowShade; g.fillRect(x - 1, y, 1, 1); g.fillRect(x + 1, y, 1, 1); g.fillStyle = P.snow; }
        }
    }

    // The tree, its bulbs blinking, at (x, base y); squashed a pixel as it lands.
    drawTree(g, x, y, squash) {
        const T = this.tree, P = this.P, t = this.time;
        const left = Math.round(x - T.cx), top = Math.round(y - T.h + 1) + (squash ? 1 : 0);
        g.drawImage(T.c, left, top, T.w, T.h - (squash ? 1 : 0));
        const pattern = this.jingling ? 'chase' : this.config.lightPattern;
        const speed = this.jingling ? 2.5 : 1;
        const n = T.lights.length, colours = P.bulbs, night = !SmallXmasLogic.RAMPS[this.config.palette];
        for (const l of T.lights) {
            const on = SmallXmasLogic.lit(pattern, l.i, n, t * speed);
            const ly = top + l.y - (squash && l.y > T.h / 2 ? 1 : 0);
            if (on && night) {
                // A soft pixel of glow round a lit bulb.
                g.globalAlpha = 0.35;
                g.fillStyle = colours[l.i % colours.length];
                g.fillRect(left + l.x - 1, ly, 3, 1); g.fillRect(left + l.x, ly - 1, 1, 3);
                g.globalAlpha = 1;
            }
            g.fillStyle = on ? colours[l.i % colours.length] : P.bulbOff;
            g.fillRect(left + l.x, ly, 1, 1);
        }
        // The star twinkles: its arms reach out now and then.
        if (SmallXmasLogic.hash(7, Math.floor(t * 2)) > 0.6) {
            g.fillStyle = P.white;
            const sx = left + T.star.x, sy = top + T.star.y;
            g.fillRect(sx - 3, sy, 1, 1); g.fillRect(sx + 3, sy, 1, 1); g.fillRect(sx, sy - 3, 1, 1);
        }
    }

    // ---- Keys and tests ------------------------------------------------------------------------------

    keyTrain() { this.runTrain(); }
    keyMove() { this.moveHouse(); }
    keySleigh() { this.flySleigh(true); }

    debugState() {
        return { setX: this.setX, bw: this.bw, bh: this.bh, px: this.px, track: +this.track.toFixed(2), moving: this.move?.phase || null, train: !!this.trainRun, trainS: +this.trainS.toFixed(1),
            sleigh: !!this.sleighRun, presents: this.presents.length, lights: this.tree.lights.length, flakes: this.flakes.length, stats: { ...this.stats },
            next: Object.fromEntries(Object.entries(this.slots).filter(([, s]) => s).map(([k, s]) => [k, +(s.at - this.time).toFixed(1)])) };
    }
}
