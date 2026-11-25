// Torchlight Descent's cast: whoever moves in the picture. The procession
// (TorchLogic.procession) with a torch each, the line snaking down the
// switchbacks and every torch lighting the snow it passes; the guide at its
// head with the inn's cat in his rucksack and a little lantern of its own;
// the torches planted at the bottom in a figure, burning down; the year
// spelt in torches on the mountain at midnight on New Year's Eve; skiers by
// day; the chairlift; the snowcat grooming by its headlamps; the cat in the
// parlour window and the cats about the inn; the St Bernard and his barrel;
// fireworks.
//
// A torch's light on the snow is Painted Village's moving light, done once
// for all of them: a pool sprite each into one half-size canvas, the
// painting there multiplied by it, added to the frame. Whoever is on the
// meadow behind something has the lit picture put back over them through
// the band's mask (TorchLogic.BANDS).

class TorchCast {
    constructor(m) {
        this.m = m;
        this.T = m.scene; this.L = m.L; this.cam = m.cam;
        const T = this.T;
        this.random = WP.seededRandom(m.host.params?.seed ? 4321 : Math.floor(Math.random() * 1e9));
        this.proc = null; this.planted = []; this.figure = null;
        this.day = []; this.sparks = []; this.shells = []; this.hearts = []; this.flash = [0, 0, 0, 0];
        this.lit = [1, 1, 1];
        this.since = Infinity; this.ranToday = null; this.lastMinute = -1;
        this.sprites = {};
        this.lightCanvas = PaintedPlates.canvas(8, 8); this.lc = this.lightCanvas.getContext('2d');
        this.mixCanvas = PaintedPlates.canvas(8, 8); this.mc = this.mixCanvas.getContext('2d');
        this.scratch = PaintedPlates.canvas(8, 8); this.sc = this.scratch.getContext('2d');
        this.cells = T.masks.map(mask => {
            if (!mask) return null;
            const c = PaintedPlates.canvas(48, 27).getContext('2d', { willReadFrequently: true });
            c.drawImage(mask, 0, 0, 48, 27);
            const d = c.getImageData(0, 0, 48, 27).data, out = new Uint8Array(48 * 27);
            for (let i = 0; i < out.length; i++) out[i] = d[i * 4 + 3] > 8 ? 1 : 0;
            return out;
        });
        this.chairs = 0;
        this.build();
        this.wake();
    }

    rr(a, b) { return a + (b - a) * this.random(); }
    pick(a) { return a[Math.floor(this.random() * a.length)]; }

    // ---- Who is here ------------------------------------------------------------

    build() {
        const { T, L, m, cam } = this, cfg = m.config, S = T.spots;
        this.cats = [];
        const k = 1.7 * (cfg.catSize || 1);
        const coats = TorchCast.COATS;
        if (cfg.windowCat !== false && S.parlour) this.cats.push({ kind: 'window', coat: coats[0], state: 'sit', t: this.rr(3, 9), look: 0, tail: 0 });
        // Cats about the inn: each has a place, sits, washes, dozes, and now and then goes to another.
        const places = this.places = [];
        if (S.inn) places.push({ name: 'door', x: L.door.x - 1.2, z: L.door.z }, { name: 'bench', x: S.inn.x - S.inn.hw * 0.55, z: L.door.z + cam.dz(0.2) });
        places.push({ name: 'finish', x: L.finish.x - 4, z: L.finish.z - cam.dz(3), warm: true });
        if (L.tree) places.push({ name: 'tree', x: L.tree.x - 1.2, z: L.tree.z - cam.dz(1.5) });
        if (L.lamps[0]) places.push({ name: 'lamp', x: L.lamps[0].x + 0.8, z: L.lamps[0].z - cam.dz(0.5) });
        for (let i = 0; i < Math.round(cfg.cats ?? 2) && places.length; i++) {
            const at = places[(i * 2 + 1) % places.length];
            this.cats.push({ kind: 'roam', coat: coats[(i + 1) % coats.length], k, at: at.name, x: at.x + (i % 2 ? 0.7 : -0.7), z: at.z, state: i % 2 ? 'sit' : 'curl', t: this.rr(10, 40), dir: i % 2 ? 1 : -1, path: null, phase: this.rr(0, 6) });
        }
        this.dog = cfg.dog !== false && S.inn ? { x: L.door.x + 2.4, z: L.door.z - cam.dz(0.6), home: { x: L.door.x + 2.4, z: L.door.z - cam.dz(0.6) }, state: 'lie', t: 6, dir: -1, wag: 0, phase: 0 } : null;
        this.snowcat = cfg.snowcat !== false && S.garage ? { s: null, dir: -1, state: 'parked', t: this.rr(5, 30), beacon: 0 } : null;
    }

    // Look alive on the first frame: whatever this hour would have going.
    wake() {
        const m = this.m, dark = m.light.dark, cal = m.cal;
        // New Year's Eve, near midnight: the grand descent, already on the mountain (spelling the year, if it is time).
        if (m.config.newYear !== false && cal.newYear && cal.toMidnight != null && cal.toMidnight <= TorchLogic.GRAND_AT && cal.toMidnight > -150) {
            const p = this.start({ grand: true, year: cal.year });
            if (p) { this.wakeDown(p, p.figureAt / this.T.track.length); if (cal.toMidnight < TorchLogic.GRAND_AT - 300) { p.hold = { t: Math.max(20, cal.toMidnight + 150) }; p.speed = 0; for (const k of p.sk) k.v = 0; this.spellNow(p); for (const k of p.sk) k.fig = k.figAt ? 1 : 0; } }
        } else if (dark > 0.55 && m.descentsAllowed()) {
            const p = this.start({ quiet: true });
            if (p) {
                // Well under way: some still at the top, the head of it well down the mountain.
                const face = this.T.track.pts[Math.max(1, this.T.track.faceEnd)].m, at = face * this.rr(0.72, 0.97);
                p.lead = at; p.phase = 'down';
                for (const k of p.sk) { k.lit = 1; const s = TorchLogic.slot(p, k.i); if (s > 0) { k.state = 'ski'; k.s = Math.min(s, this.T.track.length - 1); k.v = p.v; } }
            }
        }
        if (dark < 0.5) for (let i = 0; i < 4; i++) this.daySkier(true);
    }

    // ---- The descent ------------------------------------------------------------

    // Send a procession down. o.grand: New Year's Eve's, twice the torches, spelling the year.
    start(o = {}) {
        if (this.proc && !this.proc.done) return null;
        const m = this.m, cfg = m.config, grand = !!o.grand;
        const n = Math.max(1, Math.round((grand ? Math.max(48, cfg.torches * 1.5) : cfg.torches) * (0.55 + 0.45 * m.density())));
        const shape = cfg.finale === 'surprise' ? this.pick(TorchLogic.SHAPES) : cfg.finale;
        // The grand descent stops to spell the year when its leader is below the figure; close enough
        // together that the last of them has left the hut by then.
        const track = this.T.track, Y = this.L.year, below = track.pts.find(q => !q.ground && q.y >= Y.cy + Y.h / 2 - 4 * this.cam.u) || track.pts[Math.max(0, track.faceEnd - 1)];
        const gap = grand ? Math.max(3, Math.min(cfg.spacing, (below.m - 25) / Math.max(1, n - 1))) : cfg.spacing;
        const p = this.proc = TorchLogic.procession(n, { random: this.random, pace: cfg.pace, gap, tumbles: cfg.tumbles, shape, grand, gather: 30 });
        p.linger = grand ? 240 : 70;
        this.spots = TorchLogic.planFinish(track, TorchLogic.formation(shape, n, this.L, this.cam));
        this.figure = grand ? this.yearFigure(n, o.year || TorchLogic.calendar(m.host.now()).year) : null;
        if (grand) p.figureAt = below.m;
        this.planted = this.planted.filter(t => t.life > 0);
        return p;
    }
    yearFigure(n, year) { const Y = this.L.year; return TorchLogic.yearFigure(year, n, Y.cx, Y.cy, Y.h); }
    // Each skier on the mountain to a place in the year, none above where they will have stopped.
    spellNow(p) {
        p.spelling = true;
        if (!this.figure) this.figure = this.yearFigure(p.n, TorchLogic.calendar(this.m.host.now()).year);
        const track = this.T.track, on = [];
        for (const k of p.sk) {
            k.figAt = null;
            if (k.state !== 'ski') continue;
            const stop = TorchLogic.near(track, k.s + k.v * k.v / 6 + 0.5);
            if (!stop.ground) on.push({ i: k.i, x: stop.x, y: stop.y });
        }
        const places = TorchLogic.assignFigure(this.figure, on);
        for (const k of p.sk) k.figAt = places.get(k.i) || null;
    }
    // The year done: back onto the track below where each of them is, gliding down to it.
    unspell(p) {
        p.spelling = false;
        for (const k of p.sk) if (k.figAt && k.state === 'ski') { k.s = TorchLogic.rejoin(this.T.track, k.s, k.figAt.y); k.v = 0; }
    }
    // Spell the new year on the mountain now (a key): the line stops where it is and makes the figure.
    spell() {
        let p = this.proc;
        if (!p || p.done) { p = this.start({ grand: true }); this.wakeDown(p, p.figureAt / this.T.track.length); }
        p.hold = { t: 50 }; p.spelt = true;
        if (!p.spelling) this.spellNow(p);
        return `🎆 ${TorchLogic.calendar(this.m.host.now()).year}`;
    }
    wakeDown(p, share) { p.lead = share * this.T.track.length; p.phase = 'down'; for (const k of p.sk) { k.lit = 1; const s = TorchLogic.slot(p, k.i); if (s > 0) { k.state = 'ski'; k.s = Math.min(s, this.T.track.length - 1); k.v = p.v; } } }

    update(dt) {
        const m = this.m, cfg = m.config, cal = m.cal, T = this.T.track;
        // Scheduling.
        const running = this.proc && !this.proc.done;
        if (!running) this.since += dt;
        const today = m.sky.toDateString();
        if (m.light.dark < 0.3) this.ranToday = null;
        // The grand descent will not wait for an ordinary one to finish.
        if (cfg.newYear !== false && TorchLogic.grandDue(cal, running && this.proc.grand)) { if (running) this.proc.done = true; this.start({ grand: true, year: cal.year }); this.ranToday = today; }
        else if (!running && TorchLogic.due(cfg.descents, { dark: m.light.dark, since: this.since, gap: cfg.gapMinutes, minute: m.host.now().getMinutes(), ranToday: this.ranToday === today })) { this.start(); this.ranToday = today; }
        const p = this.proc;
        if (p && !p.done) {
            // On New Year's Eve the line stops halfway down and spells the year until just after midnight.
            if (p.grand && p.figureAt && !p.spelling && !p.spelt && p.lead - (p.n - 1) * p.gap > 20 && p.lead > p.figureAt) { p.hold = { t: cal.toMidnight != null ? Math.max(20, cal.toMidnight + 150) : 60 }; p.spelt = true; this.spellNow(p); }
            const ev = TorchLogic.stepProcession(p, dt, T, this.spots, this.L.door, this.random);
            for (const [what, i] of ev) {
                if (what === 'plant') { const k = p.sk[i]; this.planted.push({ x: k.x, z: k.z, life: 1, burn: this.rr(150, 260), phase: this.rr(0, 6) }); }
                if (what === 'planted' && cfg.fireworks === 'finale') this.volley(5);
                if (what === 'planted' && this.dog) { this.dog.state = 'go'; this.dog.to = { x: this.L.finish.x - 3, z: this.L.finish.z - this.cam.dz(4) }; }
                if (what === 'done') this.since = 0;
            }
            for (const k of p.sk) k.fig = TorchLogic.clamp((k.fig || 0) + (p.hold && p.spelling && k.state === 'ski' && k.figAt ? 1 : -1) * dt / 7);
            if (!p.hold && p.spelling) this.unspell(p);
        }
        for (const t of this.planted) { t.burn -= dt; if (t.burn < 0) t.life -= dt / 20; }
        this.planted = this.planted.filter(t => t.life > 0);
        this.updateDay(dt);
        this.updateSnowcat(dt);
        this.updateCats(dt);
        this.updateDog(dt);
        this.updateFireworks(dt);
        // The lift runs while anyone might ride it: by day, and up to the evening's descent.
        if (cfg.lift !== false && (m.light.dark < 0.85 || (p && !p.done && p.phase === 'gather'))) this.chairs += dt * 0.04;
        for (const h of this.hearts) h.t += dt;
        this.hearts = this.hearts.filter(h => h.t < 2.4);
    }

    // Skiers by day: down any of the resort's runs in big turns, a few at a time (TorchLogic.lane: on the piste, never uphill).
    daySkier(mid) {
        const runs = this.L.runs, cfg = this.m.config;
        if (cfg.daySkiers === false || !runs || !runs.length) return;
        const r = this.random() < 0.4 ? 0 : 1 + Math.floor(this.random() * (runs.length - 1)), R = runs[r];
        this.day.push({ r, s: mid ? this.rr(0, R.length * 0.85) : 0, v: this.rr(5, 9), coat: Math.floor(this.random() * 1e6), phase: this.rr(0, 6.2832), amp: this.rr(3, 7), wave: this.rr(40, 60), kid: this.random() < 0.2 });
    }
    updateDay(dt) {
        const runs = this.L.runs, dark = this.m.light.dark;
        if (dark < 0.45 && this.day.length < 6 * this.m.density() + 1 && this.m.chance(70, dt)) this.daySkier(false);
        for (const d of this.day) d.s += d.v * dt;
        this.day = this.day.filter(d => runs[d.r] && d.s < runs[d.r].length);
    }

    // The snowcat: parked by its shed; after dark, when nobody is coming down, it grooms the run-out by its lamps.
    updateSnowcat(dt) {
        const c = this.snowcat;
        if (!c) return;
        const T = this.T.track, busy = this.proc && !this.proc.done, dark = this.m.light.dark, lo = T.pts[Math.max(0, T.faceEnd)].m;
        c.beacon += dt;
        if (c.state === 'parked') { if ((c.t -= dt) < 0 && !busy && dark > 0.4) { c.state = 'out'; c.s = lo + 4; c.dir = 1; } return; }
        if (busy && c.state !== 'home') c.state = 'home';
        const v = 3.2 * dt;
        if (c.state === 'home') { c.s -= v * 2; if (c.s <= lo) { c.state = 'parked'; c.t = this.rr(40, 120); c.s = null; } return; }
        c.s += c.dir * v;
        if (c.s > T.length - 6) c.dir = -1;
        if (c.s < lo + 2) { c.dir = 1; if (this.random() < 0.4 || dark < 0.3) c.state = 'home'; }
    }

    updateCats(dt) {
        const cam = this.cam, warm = this.planted.length > 3;
        for (const c of this.cats) {
            c.t -= dt; c.phase = (c.phase || 0) + dt;
            if (c.kind === 'window') { if (c.t <= 0) { c.state = this.pick(['sit', 'sit', 'wash', 'look', 'lie']); c.t = this.rr(4, 12); } c.look += ((c.state === 'look' ? 1 : 0) - c.look) * Math.min(1, dt * 3); continue; }
            if (c.state === 'walk') {
                const p = c.path, dx = p.x - c.x, dz = (p.z - c.z) * cam.zm, d = Math.hypot(dx, dz), step = 1.1 * dt;
                c.dir = Math.sign(dx) || c.dir;
                if (d < step) { c.x = p.x; c.z = p.z; c.state = this.pick(['sit', 'curl', 'wash']); c.t = this.rr(14, 50); c.at = p.name; }
                else { c.x += dx / d * step; c.z += dz / d * step / cam.zm; }
                continue;
            }
            if (c.t <= 0) {
                // Somewhere else to be; the planted torches are warm, and a cat knows it.
                const options = this.places.filter(pl => pl.name !== c.at && (!pl.warm || warm));
                if (options.length && this.random() < 0.6) { const to = warm && this.random() < 0.5 ? this.places.find(pl => pl.warm) : this.pick(options); c.path = { name: to.name, x: to.x + this.rr(-1.4, 1.4), z: to.z + cam.dz(this.rr(-0.6, 0.6)) }; c.state = 'walk'; }
                else { c.state = this.pick(['sit', 'curl', 'wash', 'sit']); c.t = this.rr(10, 40); }
            }
        }
    }
    updateDog(dt) {
        const d = this.dog, cam = this.cam;
        if (!d) return;
        d.t -= dt; d.wag = Math.max(0, d.wag - dt); d.phase += dt;
        const go = (to, v) => { const dx = to.x - d.x, dz = (to.z - d.z) * cam.zm, l = Math.hypot(dx, dz); d.dir = Math.sign(dx) || d.dir; if (l < v * dt) { d.x = to.x; d.z = to.z; return true; } d.x += dx / l * v * dt; d.z += dz / l * v * dt / cam.zm; return false; };
        if (d.state === 'go') { if (go(d.to, 2.2)) { d.state = 'greet'; d.t = this.rr(20, 40); d.wag = 3; } }
        else if (d.state === 'greet') { d.wag = Math.max(d.wag, 0.5); if (d.t <= 0) d.state = 'back'; }
        else if (d.state === 'back') { if (go(d.home, 1.3)) { d.state = 'lie'; d.t = 20; } }
        else if (d.state === 'romp') { if (go(d.to, 3.6)) { d.state = 'back'; } }
    }

    // ---- Fireworks --------------------------------------------------------------

    volley(n) { for (let i = 0; i < n; i++) this.shells.push({ ...TorchLogic.shell(this.random), delay: i * this.rr(0.4, 1.1), t: 0, burst: false }); }
    rocket(x, y) { const sh = TorchLogic.shell(this.random); sh.fx = x / this.m.W; sh.fy = y / this.cam.hor; this.shells.push({ ...sh, delay: 0, t: 0, burst: false }); }
    updateFireworks(dt) {
        const m = this.m, cfg = m.config, cal = m.cal, cam = this.cam, W = m.W;
        // New Year's: from the stroke of midnight, for a quarter of an hour, the finale at the end.
        if (cfg.fireworks !== 'never' && cal.newYear && cal.toMidnight != null && cal.toMidnight <= 1 && cal.toMidnight > -900 && m.light.dark > 0.5) {
            const finale = cal.toMidnight < -820 || cal.toMidnight > -25;
            if (m.chance(finale ? 5400 : 1500, dt)) this.volley(finale ? 2 : 1);
        }
        if (cfg.fireworks === 'often' && m.light.dark > 0.6 && m.chance(80, dt)) this.volley(this.random() < 0.3 ? 3 : 1);
        const cap = Math.round(1800 * m.density() + 200);
        for (const s of this.shells) {
            s.t += dt;
            if (s.t < s.delay || s.burst) continue;
            const up = (s.t - s.delay) / 1.6;
            s.x = s.fx * W; s.y0 = cam.hor + 20 * cam.u; s.y = TorchLogic.lerp(s.y0, s.fy * cam.hor, 1 - (1 - Math.min(1, up)) ** 2);
            if (up >= 1) {
                s.burst = true;
                const n = Math.min(cap - this.sparks.length, Math.round({ peony: 90, willow: 70, ring: 60, crackle: 70, palm: 36 }[s.kind] * s.size * (0.5 + 0.5 * m.density())));
                const sp = (s.kind === 'willow' ? 110 : s.kind === 'palm' ? 170 : 150) * cam.u * s.size;
                for (let i = 0; i < n; i++) {
                    const a = s.kind === 'ring' ? i / n * 6.2832 : this.rr(0, 6.2832), r = s.kind === 'ring' ? 1 : s.kind === 'palm' ? this.rr(0.7, 1) : Math.sqrt(this.random());
                    this.sparks.push({ x: s.x, y: s.y, vx: Math.cos(a) * sp * r, vy: Math.sin(a) * sp * r * (s.kind === 'ring' ? 0.45 : 1), age: 0, life: (s.kind === 'willow' ? 3.2 : 1.6) * this.rr(0.8, 1.2), c: i % 3 ? s.c : s.c2, kind: s.kind, px: s.x, py: s.y });
                }
                this.flash = [s.c[0], s.c[1], s.c[2], Math.min(1, this.flash[3] + 0.5 * s.size)];
            }
        }
        this.shells = this.shells.filter(s => !s.burst);
        const g = 60 * cam.u;
        for (const p of this.sparks) {
            p.px = p.x; p.py = p.y; p.age += dt;
            const drag = p.kind === 'willow' ? 1.6 : 2.3;
            p.vx -= p.vx * drag * dt; p.vy -= p.vy * drag * dt; p.vy += g * dt * (p.kind === 'willow' ? 0.7 : 0.5);
            p.x += p.vx * dt; p.y += p.vy * dt;
        }
        this.sparks = this.sparks.filter(p => p.age < p.life);
        this.flash[3] = Math.max(0, this.flash[3] - dt * 2.2);
    }

    // ---- Per frame: drawing ---------------------------------------------------------------

    // The light on a figure out on the snow: the sky's, the keys', and a torch's warmth if it has one.
    lightOf(torch) {
        const l = this.m.light, k = this.lit;
        k[0] = l.amb[0] * 1.1 + l.keyA[0] * 0.3 + l.keyB[0] * 0.65; k[1] = l.amb[1] * 1.1 + l.keyA[1] * 0.3 + l.keyB[1] * 0.65; k[2] = l.amb[2] * 1.1 + l.keyA[2] * 0.3 + l.keyB[2] * 0.65;
        if (torch) { const w = torch * l.warm * 0.85; k[0] += 1.0 * w; k[1] += 0.6 * w; k[2] += 0.28 * w; }
        return k;
    }
    tone(c, k, air = 0) {
        const h = this.m.light.haze0;
        return `rgb(${(Math.min(1, c[0] * k[0]) * (1 - air) + h[0] * air) * 255 | 0},${(Math.min(1, c[1] * k[1]) * (1 - air) + h[1] * air) * 255 | 0},${(Math.min(1, c[2] * k[2]) * (1 - air) + h[2] * air) * 255 | 0})`;
    }
    sprite(name, make) { return this.sprites[name] ||= make(); }
    flameSprite() {
        return this.sprite('flame', () => {
            const c = PaintedPlates.canvas(64, 64), g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
            gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(0.14, 'rgba(255,214,120,0.95)'); gr.addColorStop(0.36, 'rgba(255,140,40,0.45)'); gr.addColorStop(0.7, 'rgba(220,70,20,0.12)'); gr.addColorStop(1, 'rgba(200,60,20,0)');
            g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c;
        });
    }
    poolSprite(key, colour) {
        return this.sprite('pool' + key, () => {
            const c = PaintedPlates.canvas(64, 64), g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
            gr.addColorStop(0, PaintedPlates.css(colour)); gr.addColorStop(0.35, PaintedPlates.css(colour.map(v => v * 0.45))); gr.addColorStop(1, '#000');
            g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c;
        });
    }

    // Put the lit picture back over whatever is nearer than depth z, in a box (CSS px).
    restore(ctx, z, x, y, w, h) {
        const T = this.T, k = PaintedLogic.bandOf(z, this.L.bands), mask = k >= 0 ? T.masks[k] : null;
        if (!mask) return;
        const m = this.m, W = m.W, H = m.H;
        x = Math.max(0, Math.floor(x)); y = Math.max(0, Math.floor(y)); w = Math.min(W - x, Math.ceil(w)); h = Math.min(H - y, Math.ceil(h));
        if (w < 2 || h < 2) return;
        const cells = this.cells[k], c0 = Math.floor(x / W * 48), c1 = Math.min(47, Math.floor((x + w) / W * 48)), r0 = Math.floor(y / H * 27), r1 = Math.min(26, Math.floor((y + h) / H * 27));
        let any = false;
        for (let r = r0; r <= r1 && !any; r++) for (let c = c0; c <= c1; c++) if (cells[r * 48 + c]) { any = true; break; }
        if (!any) return;
        const ps = T.ps, dpr = m.dpr, sw = Math.ceil(w * dpr), sh = Math.ceil(h * dpr), s = this.scratch, g = this.sc;
        if (s.width < sw || s.height < sh) { s.width = Math.max(s.width, sw); s.height = Math.max(s.height, sh); }
        g.globalCompositeOperation = 'copy'; g.drawImage(T.lit, x * ps, y * ps, w * ps, h * ps, 0, 0, sw, sh);
        g.globalCompositeOperation = 'destination-in'; g.drawImage(mask, x * ps / 2, y * ps / 2, w * ps / 2, h * ps / 2, 0, 0, sw, sh);
        ctx.drawImage(s, 0, 0, sw, sh, x, y, w, h);
    }

    // Every torch's light on the snow, at once: pools into one half-size canvas, the painting multiplied by it, added.
    drawPools(ctx, pools) {
        const m = this.m, T = this.T, fx = m.fx.glints * m.light.warm;
        if (!pools.length || fx < 0.02) return;
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (const p of pools) { x0 = Math.min(x0, p.x - p.r); x1 = Math.max(x1, p.x + p.r); y0 = Math.min(y0, p.y - p.r * p.k); y1 = Math.max(y1, p.y + p.r * p.k); }
        x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(m.W, Math.ceil(x1)); y1 = Math.min(m.H, Math.ceil(y1));
        const bw = x1 - x0, bh = y1 - y0;
        if (bw < 2 || bh < 2) return;
        const q = 0.5, pw = Math.ceil(bw * q), ph = Math.ceil(bh * q), L = this.lightCanvas, g = this.lc, X = this.mixCanvas, xg = this.mc;
        for (const c of [L, X]) if (c.width < pw || c.height < ph) { c.width = Math.max(c.width, pw); c.height = Math.max(c.height, ph); }
        g.globalCompositeOperation = 'copy'; g.fillStyle = '#000'; g.fillRect(0, 0, pw, ph);
        // Screened, not added: where many torches meet, the snow is bright but keeps its colour.
        g.globalCompositeOperation = 'screen';
        for (const p of pools) { g.globalAlpha = Math.min(1, p.a * 0.75); g.drawImage(this.poolSprite(p.key, p.c), (p.x - p.r - x0) * q, (p.y - p.r * p.k - y0) * q, p.r * 2 * q, p.r * 2 * p.k * q); }
        g.globalAlpha = 1;
        const ps = T.ps;
        xg.globalCompositeOperation = 'copy'; xg.drawImage(T.paint, x0 * ps, y0 * ps, bw * ps, bh * ps, 0, 0, pw, ph);
        xg.globalCompositeOperation = 'multiply'; xg.drawImage(L, 0, 0, pw, ph, 0, 0, pw, ph);
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, fx);
        ctx.drawImage(X, 0, 0, pw, ph, x0, y0, bw, bh);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }

    draw(ctx) {
        const { m, cam, T } = this, l = m.light, dark = l.dark, t = m.time, track = T.track;
        const pools = [], figs = [], flames = [], at = this.at ||= {};
        // A pool of light at (px, py), r pixels; k flattens it (1 on the face, which stands up to us; a third on the meadow).
        const pool = (x, y, r, k, a, key = 'torch', c = TorchCast.TORCH) => pools.push({ x, y, r, k, a, key, c });
        // The procession.
        const p = this.proc;
        if (p && !p.done) {
            for (const k of p.sk) {
                if (k.state === 'gone') continue;
                let x, y, z, s, dir = 0, ground, xm;
                if (k.state === 'wait') {
                    // Gathered by the hut, torches catching one by one.
                    const h = T.spots.hut; if (!h) continue;
                    s = cam.sc(this.L.mountain.faceZ(h.y)); x = h.x + 12 * s + ((k.i % 7) - 3) * 1.6 * s; y = h.y + 2 * s + (Math.floor(k.i / 7) % 3) * 0.8 * s; z = this.L.mountain.faceZ(h.y); ground = false;
                } else if (k.state === 'ski') {
                    // Everyone in the leader's tracks: the line is the track, so it snakes by the switchbacks; aside only
                    // to sit down or go round someone who has (k.off, metres across, which never climbs).
                    TorchLogic.place(k, track, cam, at);
                    x = at.x; y = at.y; z = at.z; s = at.sc; ground = at.ground; xm = at.xm;
                    dir = this.heading(track, k.s);
                    if (k.fig > 0 && k.figAt) { const f = k.figAt, e = k.fig * k.fig * (3 - 2 * k.fig); x += (f.x - x) * e; y += (f.y - y) * e; z = this.L.mountain.faceZ(y); s = cam.sc(z); }
                } else {
                    TorchLogic.place(k, track, cam, at);
                    z = at.z; xm = at.xm; s = at.sc; x = at.x; y = at.y; ground = true;
                    if (k.state === 'glide' && k.glide) { const a = TorchLogic.glideAt(k.glide, k.t + 0.2, cam.zm); dir = Math.atan2(cam.sy(a[1]) - y, cam.sx(a[0], a[1]) - x); }
                }
                const flick = 0.85 + 0.15 * Math.sin(t * 13 + k.wob * 9) * Math.sin(t * 7.3 + k.wob);
                const reach = (ground ? 7 : 10.5) * s * (0.9 + 0.1 * flick);
                if (k.lit > 0.05 && dark > 0.12) pool(x, y, Math.max(reach, 5 * cam.u), ground ? 0.34 : 0.8, k.lit * flick * (ground ? 0.95 : 1) * Math.min(1, dark * 1.4));
                // The rucksack cat's lantern: a little cool light of its own among all the orange.
                if (k.guide && this.m.config.backpackCat !== false && dark > 0.2 && k.state !== 'gone') pool(x - 0.5 * s, y, Math.max(3.5 * s, 3 * cam.u), ground ? 0.34 : 0.8, 0.5 * dark, 'cat', [0.6, 0.78, 1]);
                figs.push({ kind: 'skier', k, x, y, z, s, dir, ground, xm, flick });
            }
        }
        for (const f of this.planted) {
            const s = cam.sc(f.z), x = cam.sx(f.x, f.z), y = cam.sy(f.z), flick = 0.8 + 0.2 * Math.sin(t * 11 + f.phase * 7) * Math.sin(t * 6.1 + f.phase), a = Math.min(1, f.life) * (f.burn < 30 ? 0.5 + 0.5 * Math.max(0, f.burn) / 30 : 1);
            if (dark > 0.12) pool(x, y, 7 * s * flick, 0.34, a * flick * 0.95 * Math.min(1, dark * 1.4));
            figs.push({ kind: 'planted', f, x, y, z: f.z, s, a, flick });
        }
        // The snowcat's lamps.
        const c = this.snowcat;
        if (c && c.s != null) {
            TorchLogic.at(track, c.s, cam, at);
            const s = at.sc, ahead = TorchLogic.at(track, c.s + c.dir * 9, cam, {});
            if (dark > 0.15) { pool(ahead.x, ahead.y, 9 * ahead.sc, 0.34, 0.9 * dark, 'lamp', [0.86, 0.9, 1]); pool(at.x, at.y, 5 * s, 0.34, 0.4 * dark, 'beacon', [1, 0.6, 0.2]); }
            figs.push({ kind: 'snowcat', x: at.x, y: at.y, z: at.z, s, dir: Math.sign(ahead.x - at.x) || 1, beacon: Math.sin(c.beacon * 7) > 0.2 });
        }
        this.drawPools(ctx, pools);
        // The lift's chairs, going round.
        this.drawLift(ctx);
        // By day: skiers carving, each down a run of their own; fading out as they reach the lift's station or the finish.
        const ahead = this.ahead ||= {};
        for (const d of this.day) {
            const R = this.L.runs[d.r];
            TorchLogic.lane(R, d.s, d.phase, d.amp, d.wave, cam, at);
            TorchLogic.lane(R, d.s + 0.8, d.phase, d.amp, d.wave, cam, ahead);
            figs.push({ kind: 'dayskier', d, x: at.x, y: at.y, z: at.z, s: at.sc, dir: Math.atan2(ahead.y - at.y, ahead.x - at.x), ground: at.ground, a: TorchLogic.clamp((R.length - d.s) / 12) * TorchLogic.clamp(d.s / 4 + 0.2) });
        }
        for (const cat of this.cats) if (cat.kind === 'roam') figs.push({ kind: 'cat', c: cat, x: cam.sx(cat.x, cat.z), y: cam.sy(cat.z), z: cat.z, s: cam.sc(cat.z) });
        if (this.dog) figs.push({ kind: 'dog', d: this.dog, x: cam.sx(this.dog.x, this.dog.z), y: cam.sy(this.dog.z), z: this.dog.z, s: cam.sc(this.dog.z) });
        // Far to near: the mountain's first, then the meadow's by depth.
        figs.sort((a, b) => (b.ground ? 0 : 1) - (a.ground ? 0 : 1) || b.z - a.z);
        const winCat = this.cats.find(q => q.kind === 'window');
        if (winCat) this.drawWindowCat(ctx, winCat);
        for (const f of figs) {
            if (f.kind === 'skier') this.drawSkier(ctx, f);
            else if (f.kind === 'planted') this.drawPlanted(ctx, f);
            else if (f.kind === 'dayskier') this.drawDaySkier(ctx, f);
            else if (f.kind === 'snowcat') this.drawSnowcat(ctx, f);
            else if (f.kind === 'cat') this.drawCat(ctx, f);
            else if (f.kind === 'dog') this.drawDog(ctx, f);
            if (f.ground !== false && f.z) { const h = (f.kind === 'snowcat' ? 4 : f.kind === 'cat' ? 1.2 : f.kind === 'dog' ? 1.6 : 3.4) * f.s; this.restore(ctx, f.z, f.x - h, f.y - h * 1.3, h * 2, h * 1.6); }
        }
        // Flames last of all, over everything: they are lights.
        for (const f of figs) if ((f.kind === 'skier' && f.k.lit > 0.05) || f.kind === 'planted') this.drawFlame(ctx, f);
        this.drawHearts(ctx);
    }
    drawOver(ctx) { this.drawFireworks(ctx); }
    // Which way the track runs at s, over a metre or two: smooth through the turns.
    heading(track, s) { const a = TorchLogic.near(track, s - 0.8), b = TorchLogic.near(track, s + 0.8); return Math.atan2(b.y - a.y, b.x - a.x); }

    drawFlame(ctx, f) {
        const dark = this.m.light.dark, spr = this.flameSprite(), s = f.s;
        let x = f.x, y = f.y, a = 1;
        if (f.kind === 'skier') { const k = f.k, up = k.fall > 0 ? 0.9 : 1.95; x += (f.fx ?? 0.45 * s); y -= up * s; a = k.lit; }
        else { y -= 1.4 * s; a = f.a; }
        const r = Math.max(2.2 * this.cam.u, 0.9 * s) * f.flick * (0.6 + 0.6 * dark), h = r * 1.1;
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * (0.5 + 0.5 * dark);
        ctx.drawImage(spr, x - r * 2.2, y - h * 2.4, r * 4.4, h * 4.4);
        ctx.globalAlpha = a; ctx.drawImage(spr, x - r * 0.7, y - h * 1.1, r * 1.4, h * 1.6);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }

    // A skier: skis, legs bent, a coat, a hat with a bobble, a torch held up.
    drawSkier(ctx, f) {
        const k = f.k, s = f.s * (k.kid ? 0.72 : 1), u = this.cam.u, coat = TorchCast.coatOf(this.m.config, k);
        const L = this.lightOf(k.lit * 0.8 * this.m.light.dark), air = f.ground ? 0 : 0.25;
        const x = f.x, y = f.y, lean = Math.cos(f.dir) * 0.12;
        f.fx = 0.45 * s;
        if (s * 1.8 < 5 * u) {
            // Far up the mountain: a dab and its skis.
            ctx.fillStyle = this.tone(coat, L, air); ctx.fillRect(x - 0.3 * s, y - 1.5 * s, Math.max(1, 0.6 * s), Math.max(1.2, 1.4 * s));
            ctx.fillStyle = this.tone([0.15, 0.14, 0.16], L, air); ctx.fillRect(x - 0.8 * s, y - 0.1 * s, Math.max(1, 1.6 * s), Math.max(0.6, 0.15 * s));
            return;
        }
        ctx.save(); ctx.translate(x, y);
        const dark = [0.12, 0.11, 0.13];
        ctx.lineCap = 'round';
        if (k.state === 'ski' && k.fall > 0) {
            // Sat in the snow, skis every which way, the torch still up.
            ctx.strokeStyle = this.tone([0.8, 0.2, 0.15], L); ctx.lineWidth = Math.max(1, 0.12 * s);
            ctx.beginPath(); ctx.moveTo(-1 * s, 0.1 * s); ctx.lineTo(0.9 * s, -0.3 * s); ctx.moveTo(-0.6 * s, -0.4 * s); ctx.lineTo(1.1 * s, 0.2 * s); ctx.stroke();
            ctx.fillStyle = this.tone(coat, L); ctx.beginPath(); ctx.ellipse(0, -0.55 * s, 0.4 * s, 0.45 * s, 0, 0, 6.2832); ctx.fill();
            ctx.fillStyle = this.tone([0.94, 0.84, 0.74], L); ctx.beginPath(); ctx.arc(0, -1.15 * s, 0.2 * s, 0, 6.2832); ctx.fill();
            ctx.strokeStyle = this.tone(coat, L); ctx.lineWidth = Math.max(1, 0.16 * s); ctx.beginPath(); ctx.moveTo(0.15 * s, -0.75 * s); ctx.lineTo(0.45 * s, -1.2 * s); ctx.stroke();
            ctx.strokeStyle = this.tone([0.36, 0.24, 0.14], L); ctx.lineWidth = Math.max(0.8, 0.07 * s); ctx.beginPath(); ctx.moveTo(0.4 * s, -1.0 * s); ctx.lineTo(0.45 * s, -1.75 * s); ctx.stroke();
            f.fx = 0.45 * s;
            ctx.restore();
            return;
        }
        const skiing = k.state === 'ski' || k.state === 'wait' || k.state === 'glide';
        if (skiing) { ctx.strokeStyle = this.tone(TorchCast.SKIS[k.coat % TorchCast.SKIS.length], L); ctx.lineWidth = Math.max(1, 0.1 * s); const a = f.dir, cs = Math.cos(a) * 0.95 * s, sn = Math.sin(a) * 0.3 * s; for (const dy of [0, 0.12 * s]) { ctx.beginPath(); ctx.moveTo(-cs, -sn + dy); ctx.lineTo(cs, sn + dy); ctx.stroke(); } }
        const bob = skiing ? 0 : Math.abs(Math.sin(this.m.time * 6 + k.wob)) * 0.05 * s, knee = skiing ? 0.3 : 0.05;
        ctx.strokeStyle = this.tone(dark, L); ctx.lineWidth = Math.max(1, 0.2 * s);
        ctx.beginPath(); ctx.moveTo(-0.14 * s, -0.05 * s); ctx.lineTo(-0.1 * s + knee * s, -0.5 * s); ctx.lineTo(-0.1 * s, -0.85 * s - bob); ctx.moveTo(0.14 * s, -0.05 * s); ctx.lineTo(0.18 * s + knee * s, -0.5 * s); ctx.lineTo(0.1 * s, -0.85 * s - bob); ctx.stroke();
        // The coat, leaning into the hill.
        ctx.fillStyle = this.tone(coat, L);
        ctx.beginPath(); ctx.moveTo(-0.3 * s, -0.8 * s - bob); ctx.lineTo(0.3 * s, -0.8 * s - bob); ctx.lineTo(0.26 * s + lean * s, -1.5 * s - bob); ctx.lineTo(-0.24 * s + lean * s, -1.5 * s - bob); ctx.closePath(); ctx.fill();
        // The guide's rucksack, and who rides in it.
        if (k.guide && this.m.config.backpackCat !== false) {
            ctx.fillStyle = this.tone([0.36, 0.26, 0.2], L); ctx.fillRect(-0.55 * s + lean * s, -1.48 * s - bob, 0.34 * s, 0.6 * s);
            const cx = -0.4 * s + lean * s, cy = -1.62 * s - bob, coatC = TorchCast.COATS[0];
            ctx.fillStyle = this.tone(coatC.body, L); ctx.beginPath(); ctx.ellipse(cx, cy, 0.17 * s, 0.14 * s, 0, 0, 6.2832); ctx.fill();
            ctx.beginPath(); ctx.moveTo(cx - 0.15 * s, cy - 0.05 * s); ctx.lineTo(cx - 0.11 * s, cy - 0.27 * s); ctx.lineTo(cx - 0.03 * s, cy - 0.12 * s); ctx.moveTo(cx + 0.15 * s, cy - 0.05 * s); ctx.lineTo(cx + 0.11 * s, cy - 0.27 * s); ctx.lineTo(cx + 0.03 * s, cy - 0.12 * s); ctx.fill();
            // Its own little lantern, hung off the pack: cool, like moonlight.
            const lx = -0.65 * s + lean * s, ly = -1.0 * s - bob;
            if (this.m.light.dark > 0.2) { ctx.globalCompositeOperation = 'lighter'; const r = Math.max(3 * this.cam.u, 0.5 * s), gr = ctx.createRadialGradient(lx, ly, 0, lx, ly, r); gr.addColorStop(0, 'rgba(210,235,255,0.95)'); gr.addColorStop(0.3, 'rgba(120,180,255,0.35)'); gr.addColorStop(1, 'rgba(80,140,255,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(lx, ly, r, 0, 6.2832); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
        }
        // Head, hat and bobble.
        ctx.fillStyle = this.tone([0.94, 0.80, 0.70], L); ctx.beginPath(); ctx.arc(lean * s, -1.68 * s - bob, 0.18 * s, 0, 6.2832); ctx.fill();
        const hat = TorchCast.HATS[k.coat % TorchCast.HATS.length];
        ctx.fillStyle = this.tone(hat, L); ctx.beginPath(); ctx.arc(lean * s, -1.74 * s - bob, 0.19 * s, Math.PI, 0); ctx.fill();
        ctx.fillStyle = this.tone([0.96, 0.95, 0.92], L); ctx.beginPath(); ctx.arc(lean * s, -1.96 * s - bob, 0.08 * s, 0, 6.2832); ctx.fill();
        // The arm up, and the torch.
        ctx.strokeStyle = this.tone(coat, L); ctx.lineWidth = Math.max(1, 0.15 * s);
        ctx.beginPath(); ctx.moveTo(0.18 * s + lean * s, -1.4 * s - bob); ctx.lineTo(0.42 * s, -1.6 * s - bob); ctx.stroke();
        ctx.strokeStyle = this.tone([0.36, 0.24, 0.14], L); ctx.lineWidth = Math.max(0.8, 0.07 * s);
        ctx.beginPath(); ctx.moveTo(0.42 * s, -1.25 * s - bob); ctx.lineTo(0.46 * s, -1.95 * s - bob); ctx.stroke();
        f.fx = 0.46 * s;
        // Poles, on the meadow they are under the arm.
        if (skiing && s > 9 * u) { ctx.strokeStyle = this.tone([0.6, 0.6, 0.64], L); ctx.lineWidth = Math.max(0.7, 0.05 * s); ctx.beginPath(); ctx.moveTo(-0.3 * s, -1.2 * s); ctx.lineTo(-0.7 * s, 0); ctx.stroke(); }
        ctx.restore();
    }
    drawPlanted(ctx, f) {
        const s = f.s, L = this.lightOf(0.8 * this.m.light.dark);
        ctx.strokeStyle = this.tone([0.32, 0.22, 0.14], L); ctx.lineWidth = Math.max(0.8, 0.08 * s); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x, f.y - 1.3 * s); ctx.stroke();
    }
    drawDaySkier(ctx, f) {
        const d = f.d, s = f.s * (d.kid ? 0.72 : 1), coat = TorchCast.COATS_DAY[d.coat % TorchCast.COATS_DAY.length], L = this.lightOf(0), air = f.ground ? 0 : 0.25, u = this.cam.u;
        if (f.a < 0.02) return;
        ctx.globalAlpha = f.a;
        if (s * 1.8 < 5 * u) { ctx.fillStyle = this.tone(coat, L, air); ctx.fillRect(f.x - 0.3 * s, f.y - 1.5 * s, Math.max(1, 0.6 * s), Math.max(1.2, 1.4 * s)); ctx.globalAlpha = 1; return; }
        // The skis along the way they are going, foreshortened; leaning into the turn.
        const cs = Math.cos(f.dir) * 0.9 * s, sn = Math.sin(f.dir) * 0.3 * s, lean = Math.cos(f.dir) * 0.22 * s;
        ctx.save(); ctx.translate(f.x, f.y); ctx.lineCap = 'round';
        ctx.strokeStyle = this.tone([0.15, 0.14, 0.16], L, air); ctx.lineWidth = Math.max(1, 0.1 * s);
        for (const dy of [0, 0.12 * s]) { ctx.beginPath(); ctx.moveTo(-cs, -sn + dy); ctx.lineTo(cs, sn + dy); ctx.stroke(); }
        ctx.lineWidth = Math.max(1, 0.2 * s); ctx.beginPath(); ctx.moveTo(-0.1 * s, -0.05 * s); ctx.lineTo(0.15 * s + lean * 0.4, -0.5 * s); ctx.lineTo(lean * 0.6, -0.85 * s); ctx.stroke();
        ctx.fillStyle = this.tone(coat, L, air); ctx.beginPath(); ctx.moveTo(-0.28 * s + lean * 0.6, -0.8 * s); ctx.lineTo(0.28 * s + lean * 0.6, -0.8 * s); ctx.lineTo(0.26 * s + lean, -1.5 * s); ctx.lineTo(-0.26 * s + lean, -1.5 * s); ctx.closePath(); ctx.fill();
        ctx.fillStyle = this.tone([0.94, 0.8, 0.7], L, air); ctx.beginPath(); ctx.arc(lean, -1.68 * s, 0.18 * s, 0, 6.2832); ctx.fill();
        ctx.restore();
        ctx.globalAlpha = 1;
    }
    drawSnowcat(ctx, f) {
        const s = f.s, L = this.lightOf(0), dir = f.dir;
        ctx.save(); ctx.translate(f.x, f.y); ctx.scale(dir, 1);
        ctx.fillStyle = this.tone([0.14, 0.13, 0.14], L); ctx.fillRect(-2.4 * s, -0.9 * s, 4.8 * s, 0.9 * s);
        ctx.fillStyle = this.tone([0.86, 0.22, 0.16], L); ctx.fillRect(-2.0 * s, -2.2 * s, 3.0 * s, 1.3 * s);
        ctx.fillStyle = this.tone([0.6, 0.7, 0.8], L); ctx.fillRect(0.0 * s, -2.0 * s, 0.9 * s, 0.8 * s);
        ctx.fillStyle = this.tone([0.7, 0.7, 0.72], L); ctx.fillRect(2.4 * s, -1.0 * s, 0.4 * s, 1.0 * s);
        if (this.m.light.dark > 0.15) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(230,240,255,0.95)'; ctx.fillRect(2.1 * s, -1.7 * s, 0.3 * s, 0.25 * s); if (f.beacon) { const gr = ctx.createRadialGradient(-0.5 * s, -2.5 * s, 0, -0.5 * s, -2.5 * s, 1.2 * s); gr.addColorStop(0, 'rgba(255,170,60,0.95)'); gr.addColorStop(1, 'rgba(255,120,20,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(-0.5 * s, -2.5 * s, 1.2 * s, 0, 6.2832); ctx.fill(); } ctx.globalCompositeOperation = 'source-over'; }
        ctx.restore();
    }

    // The lift's chairs going round: up on one side of the line, down the other.
    drawLift(ctx) {
        const l = this.T.spots.lift;
        if (!l || this.m.config.lift === false) return;
        const M = this.L.mountain, cam = this.cam, n = 16, L = this.lightOf(0), dark = this.m.light.dark;
        ctx.lineCap = 'round';
        for (let i = 0; i < n * 2; i++) {
            const up = i < n, t = ((i % n) / n + this.chairs * (up ? 1 : -1) % 1 + 2) % 1, x = TorchLogic.lerp(l.x0, l.x1, t), y = TorchLogic.lerp(l.y0, l.y1, t), s = cam.sc(M.faceZ(y)), dx = (up ? -1 : 1) * 1.4 * s;
            ctx.strokeStyle = this.tone([0.16, 0.16, 0.2], L, 0.3); ctx.lineWidth = Math.max(0.6, 0.12 * s);
            ctx.beginPath(); ctx.moveTo(x + dx, y - 0.2 * s); ctx.lineTo(x + dx, y + 1.2 * s); ctx.lineTo(x + dx + 0.8 * s, y + 1.2 * s); ctx.stroke();
            // Somebody riding up, now and then.
            if (up && (i * 7) % 3 === 0 && dark < 0.9) { ctx.fillStyle = this.tone(TorchCast.COATS_DAY[i % TorchCast.COATS_DAY.length], L, 0.3); ctx.fillRect(x + dx + 0.1 * s, y + 0.4 * s, Math.max(1, 0.5 * s), Math.max(1, 0.7 * s)); }
        }
    }

    // The cat in the parlour window: a shape against the lamplight, washing, looking round, lying down.
    drawWindowCat(ctx, c) {
        const sp = this.T.spots.parlour, s = sp.s * 1.15, lit = (this.m.scene.groups.find(g => g.name === 'inn0')?.level ?? 0);
        const x = sp.sill[0], y = sp.sill[1], col = lit > 0.3 ? `rgba(26,18,20,${0.75 + 0.2 * lit})` : this.tone(c.coat.body, this.lightOf(0));
        const tail = Math.sin(this.m.time * 1.7 + c.t) * 0.3, lie = c.state === 'lie';
        ctx.save(); ctx.translate(x, y); ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineCap = 'round';
        if (lie) { ctx.beginPath(); ctx.ellipse(0, -0.16 * s, 0.42 * s, 0.17 * s, 0, 0, 6.2832); ctx.fill(); ctx.beginPath(); ctx.arc(0.36 * s, -0.26 * s, 0.13 * s, 0, 6.2832); ctx.fill(); }
        else {
            ctx.beginPath(); ctx.ellipse(0, -0.28 * s, 0.2 * s, 0.3 * s, 0, 0, 6.2832); ctx.fill();
            const hx = c.look * 0.06 * s, hy = -0.66 * s + (c.state === 'wash' ? 0.06 * s * Math.sin(this.m.time * 5) : 0);
            ctx.beginPath(); ctx.arc(hx, hy, 0.14 * s, 0, 6.2832); ctx.fill();
            ctx.beginPath(); ctx.moveTo(hx - 0.13 * s, hy - 0.02 * s); ctx.lineTo(hx - 0.1 * s, hy - 0.24 * s); ctx.lineTo(hx - 0.02 * s, hy - 0.12 * s); ctx.moveTo(hx + 0.13 * s, hy - 0.02 * s); ctx.lineTo(hx + 0.1 * s, hy - 0.24 * s); ctx.lineTo(hx + 0.02 * s, hy - 0.12 * s); ctx.fill();
        }
        ctx.lineWidth = Math.max(1, 0.07 * s); ctx.beginPath(); ctx.moveTo(-0.18 * s, -0.06 * s); ctx.quadraticCurveTo(-0.5 * s, -0.1 * s + tail * s, -0.46 * s, -0.4 * s + tail * s); ctx.stroke();
        ctx.restore();
    }

    // A cat about the inn: sat, curled, washing, or trotting somewhere with its tail up.
    drawCat(ctx, f) {
        const c = f.c, s = f.s * (c.k || 1.7), L = this.lightOf(this.planted.length && Math.abs(c.x - this.L.finish.x) < 10 ? 0.5 * this.m.light.dark : 0);
        const body = this.tone(c.coat.body, L), belly = this.tone(c.coat.belly || c.coat.body, L);
        ctx.save(); ctx.translate(f.x, f.y); ctx.scale(c.dir, 1); ctx.lineCap = 'round';
        ctx.fillStyle = body; ctx.strokeStyle = body;
        if (c.state === 'curl') { ctx.beginPath(); ctx.ellipse(0, -0.14 * s, 0.32 * s, 0.15 * s, 0, 0, 6.2832); ctx.fill(); ctx.beginPath(); ctx.arc(0.24 * s, -0.2 * s, 0.11 * s, 0, 6.2832); ctx.fill(); ctx.lineWidth = Math.max(1, 0.06 * s); ctx.beginPath(); ctx.moveTo(-0.3 * s, -0.08 * s); ctx.quadraticCurveTo(-0.1 * s, 0.02 * s, 0.2 * s, -0.04 * s); ctx.stroke(); }
        else if (c.state === 'walk') {
            const g = Math.sin(c.phase * 9) * 0.06 * s;
            ctx.lineWidth = Math.max(1, 0.06 * s); ctx.beginPath(); ctx.moveTo(-0.2 * s, -0.2 * s); ctx.lineTo(-0.2 * s + g, 0); ctx.moveTo(0.2 * s, -0.2 * s); ctx.lineTo(0.2 * s - g, 0); ctx.stroke();
            ctx.beginPath(); ctx.ellipse(0, -0.28 * s, 0.3 * s, 0.12 * s, 0, 0, 6.2832); ctx.fill();
            ctx.beginPath(); ctx.arc(0.32 * s, -0.38 * s, 0.11 * s, 0, 6.2832); ctx.fill();
            ctx.beginPath(); ctx.moveTo(0.24 * s, -0.44 * s); ctx.lineTo(0.27 * s, -0.56 * s); ctx.lineTo(0.33 * s, -0.47 * s); ctx.moveTo(0.36 * s, -0.46 * s); ctx.lineTo(0.42 * s, -0.56 * s); ctx.lineTo(0.43 * s, -0.42 * s); ctx.fill();
            ctx.beginPath(); ctx.moveTo(-0.28 * s, -0.3 * s); ctx.quadraticCurveTo(-0.42 * s, -0.5 * s, -0.36 * s, -0.7 * s); ctx.stroke();
        } else {
            ctx.beginPath(); ctx.ellipse(0, -0.24 * s, 0.17 * s, 0.25 * s, 0, 0, 6.2832); ctx.fill();
            ctx.fillStyle = belly; ctx.beginPath(); ctx.ellipse(0.06 * s, -0.2 * s, 0.07 * s, 0.14 * s, 0, 0, 6.2832); ctx.fill(); ctx.fillStyle = body;
            const hy = -0.56 * s + (c.state === 'wash' ? 0.05 * s * Math.sin(c.phase * 5) : 0);
            ctx.beginPath(); ctx.arc(0.04 * s, hy, 0.12 * s, 0, 6.2832); ctx.fill();
            ctx.beginPath(); ctx.moveTo(-0.07 * s, hy - 0.03 * s); ctx.lineTo(-0.05 * s, hy - 0.2 * s); ctx.lineTo(0.02 * s, hy - 0.1 * s); ctx.moveTo(0.15 * s, hy - 0.03 * s); ctx.lineTo(0.14 * s, hy - 0.2 * s); ctx.lineTo(0.07 * s, hy - 0.1 * s); ctx.fill();
            ctx.lineWidth = Math.max(1, 0.06 * s); ctx.beginPath(); ctx.moveTo(-0.14 * s, -0.04 * s); ctx.quadraticCurveTo(-0.4 * s, -0.02 * s, -0.36 * s, -0.24 * s + 0.04 * s * Math.sin(c.phase * 2)); ctx.stroke();
        }
        ctx.restore();
    }
    // The St Bernard: brown and white, a barrel at his neck, a tail that goes.
    drawDog(ctx, f) {
        const d = f.d, s = f.s * 1.5, L = this.lightOf(0), moving = d.state === 'go' || d.state === 'back' || d.state === 'romp';
        const brown = this.tone([0.58, 0.32, 0.16], L), white = this.tone([0.94, 0.92, 0.88], L);
        ctx.save(); ctx.translate(f.x, f.y); ctx.scale(d.dir, 1); ctx.lineCap = 'round';
        if (d.state === 'lie') {
            ctx.fillStyle = brown; ctx.beginPath(); ctx.ellipse(0, -0.22 * s, 0.6 * s, 0.22 * s, 0, 0, 6.2832); ctx.fill();
            ctx.fillStyle = white; ctx.beginPath(); ctx.ellipse(0.55 * s, -0.28 * s, 0.2 * s, 0.17 * s, 0, 0, 6.2832); ctx.fill();
            ctx.fillStyle = brown; ctx.beginPath(); ctx.ellipse(0.5 * s, -0.36 * s, 0.12 * s, 0.1 * s, 0, 0, 6.2832); ctx.fill();
        } else {
            const g = moving ? Math.sin(d.phase * 10) * 0.12 * s : 0;
            ctx.strokeStyle = white; ctx.lineWidth = Math.max(1, 0.12 * s);
            ctx.beginPath(); ctx.moveTo(-0.4 * s, -0.4 * s); ctx.lineTo(-0.4 * s + g, 0); ctx.moveTo(0.4 * s, -0.4 * s); ctx.lineTo(0.4 * s - g, 0); ctx.stroke();
            ctx.fillStyle = brown; ctx.beginPath(); ctx.ellipse(0, -0.55 * s, 0.6 * s, 0.25 * s, 0, 0, 6.2832); ctx.fill();
            ctx.fillStyle = white; ctx.beginPath(); ctx.ellipse(0.55 * s, -0.82 * s, 0.2 * s, 0.18 * s, 0, 0, 6.2832); ctx.fill();
            ctx.fillStyle = brown; ctx.beginPath(); ctx.ellipse(0.5 * s, -0.92 * s, 0.14 * s, 0.1 * s, 0, 0, 6.2832); ctx.fill();
            ctx.strokeStyle = brown; ctx.lineWidth = Math.max(1, 0.1 * s); ctx.beginPath(); ctx.moveTo(-0.58 * s, -0.62 * s); ctx.lineTo(-0.85 * s, -0.75 * s + Math.sin(this.m.time * (d.wag > 0 ? 14 : 3)) * 0.18 * s); ctx.stroke();
        }
        // The barrel.
        ctx.fillStyle = this.tone([0.6, 0.4, 0.2], L); ctx.fillRect(0.3 * s, (d.state === 'lie' ? -0.2 : -0.6) * s, 0.22 * s, 0.16 * s);
        ctx.restore();
    }
    drawHearts(ctx) {
        for (const h of this.hearts) {
            const a = 1 - h.t / 2.4, y = h.y - h.t * 22 * this.cam.u, r = 4 * this.cam.u * (0.8 + h.t * 0.3);
            ctx.globalAlpha = a; ctx.fillStyle = '#ff6a8a';
            ctx.beginPath(); ctx.moveTo(h.x, y + r * 0.9); ctx.bezierCurveTo(h.x - r * 1.4, y - r * 0.2, h.x - r * 0.5, y - r * 1.3, h.x, y - r * 0.4); ctx.bezierCurveTo(h.x + r * 0.5, y - r * 1.3, h.x + r * 1.4, y - r * 0.2, h.x, y + r * 0.9); ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    drawFireworks(ctx) {
        const m = this.m, u = this.cam.u;
        // The flash lights the snow: the painting, in the burst's colour, added.
        if (this.flash[3] > 0.02 && this.T.paintHalf) {
            const P = this.T.paintHalf, g = this.mc, X = this.mixCanvas, w = P.width, h = P.height;
            if (X.width < w || X.height < h) { X.width = Math.max(X.width, w); X.height = Math.max(X.height, h); }
            g.globalCompositeOperation = 'copy'; g.drawImage(P, 0, 0);
            g.globalCompositeOperation = 'multiply'; g.fillStyle = PaintedPlates.css(this.flash); g.fillRect(0, 0, w, h);
            ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = this.flash[3] * 0.22 * m.light.dark;
            ctx.drawImage(X, 0, 0, w, h, 0, 0, m.W, m.H);
            ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        }
        if (!this.sparks.length && !this.shells.length) return;
        ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        for (const s of this.shells) if (s.t >= s.delay && s.y != null) { ctx.fillStyle = 'rgba(255,220,160,0.9)'; ctx.beginPath(); ctx.arc(s.x, s.y, 1.4 * u, 0, 6.2832); ctx.fill(); }
        for (const p of this.sparks) {
            const t = p.age / p.life, a = (1 - t) ** 1.3 * (p.kind === 'crackle' && t > 0.5 ? (Math.random() < 0.5 ? 1 : 0.1) : 1);
            ctx.strokeStyle = `rgba(${p.c[0] * 255 | 0},${p.c[1] * 255 | 0},${p.c[2] * 255 | 0},${a})`;
            ctx.lineWidth = (p.kind === 'willow' ? 1.6 : 2.2) * u;
            ctx.beginPath(); ctx.moveTo(p.px, p.py); ctx.lineTo(p.x + (p.x - p.px) * 2, p.y + (p.y - p.py) * 2); ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
    }

    // ---- Taps ----------------------------------------------------------------------------

    tap(x, y) {
        const cam = this.cam;
        for (const c of this.cats) {
            const p = c.kind === 'window' ? this.T.spots.parlour.sill : [cam.sx(c.x, c.z), cam.sy(c.z)], s = c.kind === 'window' ? this.T.spots.parlour.s : cam.sc(c.z) * (c.k || 1.7);
            if (Math.hypot(x - p[0], y - (p[1] - 0.4 * s)) < Math.max(14 * cam.u, 0.9 * s)) { this.hearts.push({ x: p[0], y: p[1] - s, t: 0 }); if (c.kind === 'window') { c.state = 'look'; c.t = 4; } else if (c.state !== 'walk') { c.state = 'sit'; c.t = this.rr(6, 14); } return true; }
        }
        const d = this.dog;
        if (d) { const px = cam.sx(d.x, d.z), py = cam.sy(d.z), s = cam.sc(d.z) * 1.5; if (Math.hypot(x - px, y - (py - 0.5 * s)) < Math.max(16 * cam.u, 1.2 * s)) { d.wag = 4; if (d.state === 'lie') { d.state = 'romp'; d.to = { x: d.home.x + this.rr(-5, 5), z: d.home.z + cam.dz(this.rr(2, 6)) }; } return true; } }
        return false;
    }
}

// The cats' coats; the jackets; the hats and skis.
TorchCast.COATS = [
    { body: [0.16, 0.14, 0.15], belly: [0.9, 0.88, 0.84] },      // a tuxedo, the inn's own
    { body: [0.86, 0.52, 0.22], belly: [0.96, 0.9, 0.8] },       // ginger
    { body: [0.56, 0.54, 0.56] },                                // grey
    { body: [0.92, 0.88, 0.80] },                                // cream
    { body: [0.32, 0.22, 0.16], belly: [0.82, 0.58, 0.32] },     // tortie
    { body: [0.95, 0.95, 0.95] },                                // white, and smug about it in the snow
];
TorchCast.TORCH = [1, 0.62, 0.28];
TorchCast.JACKETS = [[0.82, 0.14, 0.12], [0.16, 0.32, 0.66], [0.95, 0.78, 0.2], [0.18, 0.5, 0.32], [0.92, 0.92, 0.9], [0.95, 0.46, 0.14], [0.5, 0.24, 0.56], [0.12, 0.12, 0.14]];
TorchCast.COATS_DAY = [[0.12, 0.6, 0.8], [0.95, 0.3, 0.5], [0.95, 0.8, 0.2], [0.3, 0.7, 0.3], [0.85, 0.2, 0.15], [0.2, 0.2, 0.3]];
TorchCast.HATS = [[0.82, 0.14, 0.12], [0.94, 0.94, 0.92], [0.16, 0.3, 0.6], [0.24, 0.5, 0.3], [0.95, 0.78, 0.2]];
TorchCast.SKIS = [[0.85, 0.18, 0.14], [0.15, 0.15, 0.18], [0.92, 0.9, 0.86], [0.2, 0.36, 0.7]];
// The ski school wears red; everyone else what they like.
TorchCast.coatOf = (cfg, k) => cfg.jackets === 'school' ? (k.guide ? [0.12, 0.12, 0.14] : [0.82, 0.14, 0.12]) : TorchCast.JACKETS[k.coat % TorchCast.JACKETS.length];
