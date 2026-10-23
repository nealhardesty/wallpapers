// Koi Pond (SPEC §10.12): koi seen from above, gliding under lily pads.
// Petals or leaves land on the water by the season; a tap sends out ripples
// and draws the fish (and, with Feed on, scatters pellets they rise to eat).
//
// Each koi is a chain of spine points pulled along behind its head, with a
// travelling wave added down the body as it swims. Its body is a sprite of
// the straight fish (koi-art.js), drawn in slices along the bent spine, so
// the pattern bends with it; fins and tail are translucent shapes drawn
// under it. Shadows on the floor are drawn small and scaled up, which blurs
// them for free. The floor, the surface sheen and winter's ice are cached
// per resize; ripples, glints, petals and pellets come from pools.

const KOI_WAVE = 0.55;          // radians of the body wave per spine point
const KOI_SPINE = 10;           // spine points from nose to tail

class KoiPondAnimationManager {
    constructor(host) {
        this.host = host;
        this.config = WP.settings.load();
        this.quality = host.quality;
        this.density = host.quality.density;
        this.running = false;
        this.frame = null;
        this.last = 0;
        this.time = 0;
        this.koi = [];
        this.pads = [];
        this.ripples = [];
        this.floating = [];
        this.pellets = [];
        this.glints = [];
        this.nextId = 1;
        // Effects fade over about 1.5 s when the tier changes (SPEC §4.8).
        this.fade = { shadows: this.hasEffect('shadows'), sparkles: this.hasEffect('sparkles') };
        this.spawnPetalIn = 0;
        this.attracted = [];   // ids of the koi the last tap called, for tests
        this.loop = this.loop.bind(this);
        this.onResize = () => this.build(false);
    }

    hasEffect(name) {
        return this.quality.effects.includes(name) ? 1 : 0;
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.canvas = document.createElement('canvas');
        Object.assign(this.canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: '-1', pointerEvents: 'none' });
        document.body.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
        this.shadow = document.createElement('canvas');
        this.shadowCtx = this.shadow.getContext('2d');
        window.addEventListener('resize', this.onResize);
        this.bindTouch();
        this.build(true);
        this.draw();   // the first frame is a living pond
        this.frame = requestAnimationFrame(this.loop);
    }

    stop() {
        this.running = false;
        cancelAnimationFrame(this.frame);
        window.removeEventListener('resize', this.onResize);
        this.stopGestures?.();
        this.stopGestures = null;
        this.canvas?.remove();
        this.canvas = this.ctx = null;
    }

    // ---- Settings and quality ------------------------------------------------

    applySettings(next) {
        const before = this.config;
        this.config = next;
        if (before.touch !== next.touch) this.bindTouch();
        if (['lilyPads', 'season'].some(key => before[key] !== next[key])) this.build(false);
        if (['varieties', 'fishSize'].some(key => JSON.stringify(before[key]) !== JSON.stringify(next[key]))) {
            // New fish rise in; the old ones swim down out of sight.
            for (const k of this.koi) k.leaving = true;
        }
    }

    // Density changes how many koi swim: extras dive away, newcomers rise
    // from the deep. Effects fade in the loop.
    onQuality(quality) {
        this.quality = quality;
        this.density = quality.density;
    }

    fishTarget() {
        return Math.max(1, Math.round(this.config.fishCount * this.density));
    }

    bindTouch() {
        this.stopGestures?.();
        this.stopGestures = null;
        document.documentElement.style.touchAction = this.config.touch === 'ignore' ? '' : 'none';
        if (this.config.touch === 'ignore') return;
        let trail = null;
        this.stopGestures = this.host.gestures({
            tap: (x, y) => this.tap(x, y),
            start: (x, y) => { trail = { x, y }; this.stir(x, y); },
            move: (x, y) => {
                if (trail && Math.hypot(x - trail.x, y - trail.y) > 24) { trail = { x, y }; this.stir(x, y); }
            },
            end: () => { trail = null; },
        });
    }

    // ---- The season ---------------------------------------------------------------

    season() {
        if (this.config.season !== 'auto') return this.config.season;
        const month = this.host.now().getMonth();
        return month >= 2 && month <= 4 ? 'spring' : month <= 7 && month >= 5 ? 'summer' : month >= 8 && month <= 10 ? 'autumn' : 'winter';
    }

    // ---- Building ---------------------------------------------------------------------

    build(first) {
        const dpr = this.dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = this.width = window.innerWidth, h = this.height = window.innerHeight;
        this.canvas.width = Math.round(w * dpr);
        this.canvas.height = Math.round(h * dpr);
        this.shadow.width = Math.ceil(w / 4);
        this.shadow.height = Math.ceil(h / 4);
        this.unit = Math.max(64, Math.min(170, Math.sqrt(w * h) * 0.14));
        this.seasonNow = this.season();
        const random = WP.seededRandom(7);
        this.floorLayer = KoiArt.floor(w, h, dpr, random, this.seasonNow === 'winter');
        this.surfaceLayer = KoiArt.surface(w, h, dpr);
        this.iceLayer = this.seasonNow === 'winter' ? KoiArt.ice(w, h, dpr, random) : null;
        this.buildSprites();
        this.placePads();
        if (first) {
            this.koi = [];
            for (let k = 0; k < this.fishTarget(); k++) this.koi.push(this.makeKoi(false));
            // Already on the water: a few petals or leaves, and a glint or two.
            const kinds = this.floatKinds();
            if (kinds) for (let k = 0; k < Math.round(10 * this.density); k++) this.addFloating(Math.random() * w, Math.random() * h, kinds, true);
        } else {
            for (const k of this.koi) { k.x = Math.min(w, k.x); k.y = Math.min(h, k.y); }
            this.floating = this.floating.filter(f => f.x < w && f.y < h);
        }
    }

    buildSprites() {
        const dpr = this.dpr;
        this.glintSprite = KoiArt.glint(dpr);
        this.pelletSprite = KoiArt.pellet(dpr);
        this.petalSprites = [['#f7c6d4', '#fde8ee'], ['#f2b0c4', '#fbdde6'], ['#fbd3df', '#fff4f7']].map(c => KoiArt.petal(dpr, c));
        this.leafSprites = [...[['#8f1622', '#d8402a'], ['#b5301f', '#ec7a2c'], ['#c4561a', '#f0a531']].map(c => KoiArt.maple(dpr, c)), KoiArt.ginkgo(dpr)];
    }

    // Lily pads in two or three loose clusters, a flower here and there
    // (more in summer, none in winter).
    placePads() {
        const random = WP.seededRandom(11);
        const w = this.width, h = this.height - this.host.insets.bottom;
        const season = this.seasonNow;
        const count = Math.round(this.config.lilyPads * (season === 'winter' ? 0.5 : 1));
        const bloom = season === 'summer' ? 0.55 : season === 'winter' ? 0 : 0.25;
        const clusters = [];
        for (let k = 0; k < 3; k++) clusters.push({ x: w * (0.1 + random() * 0.8), y: h * (0.1 + random() * 0.8) });
        this.pads = [];
        for (let k = 0; k < count; k++) {
            const c = clusters[k % clusters.length];
            const R = this.unit * (0.22 + random() * 0.26);
            let x = c.x, y = c.y;
            for (let tries = 0; tries < 30; tries++) {
                x = c.x + (random() - 0.5) * this.unit * 3;
                y = c.y + (random() - 0.5) * this.unit * 3;
                if (this.pads.every(p => Math.hypot(p.x - x, p.y - y) > (p.R + R) * 0.92)) break;
            }
            const pad = {
                x, y, ax: x, ay: y, R, rot: random() * 6.28, phase: random() * 6.28,
                sprite: KoiArt.pad(R, this.dpr, random, season === 'autumn'),
                flower: random() < bloom ? KoiArt.flower(R * (0.42 + random() * 0.15), this.dpr, random) : null,
                fx: (random() - 0.5) * R * 0.5, fy: (random() - 0.5) * R * 0.5, bob: 0,
            };
            this.pads.push(pad);
        }
    }

    // ---- Koi ----------------------------------------------------------------------------

    makeKoi(rising) {
        const varieties = this.config.varieties.length ? this.config.varieties : KoiArt.VARIETIES;
        const variety = varieties[Math.floor(Math.random() * varieties.length)];
        const len = this.unit * this.config.fishSize * (0.72 + Math.random() * 0.5);
        const body = len * 0.78, width = len * 0.235;
        const art = KoiArt.koi(variety, body, width, this.dpr, Math.random);
        const x = this.width * (0.1 + Math.random() * 0.8), y = this.height * (0.1 + Math.random() * 0.8);
        const heading = Math.random() * Math.PI * 2;
        const seg = body / (KOI_SPINE - 1);
        const spine = [];
        for (let i = 0; i < KOI_SPINE; i++) spine.push({ x: x - Math.cos(heading) * seg * i, y: y - Math.sin(heading) * seg * i });
        const k = {
            id: this.nextId++, variety, len, body, width, seg, spine, sprite: art.sprite, fin: art.fin,
            x, y, heading, speed: 0, cruise: (0.32 + Math.random() * 0.18) * len,
            phase: Math.random() * 6.28, depth: rising ? 1 : 0.3 + Math.random() * 0.6, targetDepth: 0.3 + Math.random() * 0.6,
            alpha: rising ? 0 : 1, leaving: false, mode: 'wander', modeUntil: 0, target: null, retargetAt: 0,
            glide: 1, glideAt: Math.random() * 8, points: spine.map(p => ({ ...p })),
        };
        this.pickTarget(k);
        k.speed = k.cruise * 0.6;
        return k;
    }

    // Somewhere to go: open water, under a pad to hide, or after a friend.
    pickTarget(k) {
        const margin = k.len * 0.6, roll = Math.random();
        if (roll < 0.25 && this.pads.length) {
            const pad = this.pads[Math.floor(Math.random() * this.pads.length)];
            k.target = { x: pad.x, y: pad.y };
        } else if (roll < 0.45 && this.koi.length > 1) {
            const friend = this.koi[Math.floor(Math.random() * this.koi.length)];
            k.target = { x: friend.x - Math.cos(friend.heading) * friend.len, y: friend.y - Math.sin(friend.heading) * friend.len };
        } else {
            k.target = { x: margin + Math.random() * (this.width - margin * 2), y: margin + Math.random() * (this.height - this.host.insets.bottom - margin * 2) };
        }
        k.target.x = Math.max(margin, Math.min(this.width - margin, k.target.x));
        k.target.y = Math.max(margin, Math.min(this.height - margin, k.target.y));
        k.retargetAt = this.time + 6 + Math.random() * 9;
        k.targetDepth = 0.25 + Math.random() * 0.7;
    }

    updateKoi(k, dt) {
        const t = this.time, speedScale = this.config.swimSpeed * (this.seasonNow === 'winter' ? 0.6 : 1);
        if (k.mode === 'feed') {
            const food = this.nearestPellet(k);
            if (food) k.target = food;
            else if (t > k.modeUntil || !this.pellets.length) k.mode = 'wander';
        }
        if (k.mode !== 'wander' && k.mode !== 'feed' && t > k.modeUntil) { k.mode = 'wander'; this.pickTarget(k); }
        if (k.mode === 'wander' && (t > k.retargetAt || Math.hypot(k.target.x - k.x, k.target.y - k.y) < k.len * 0.7)) this.pickTarget(k);

        // Steer: towards the target, away from close neighbours' heads.
        let dx = k.target.x - k.x, dy = k.target.y - k.y;
        const dist = Math.hypot(dx, dy) || 1;
        dx /= dist; dy /= dist;
        if (k.mode !== 'feed') {
            for (const o of this.koi) {
                if (o === k) continue;
                const ox = k.x - o.x, oy = k.y - o.y, d = Math.hypot(ox, oy), reach = (k.len + o.len) * 0.45;
                if (d > 0 && d < reach) { dx += ox / d * (1 - d / reach) * 1.4; dy += oy / d * (1 - d / reach) * 1.4; }
            }
        }
        const want = Math.atan2(dy, dx);
        let diff = want - k.heading;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        const eager = k.mode === 'wander' ? 1 : 2.8;
        const rate = (0.55 + 0.6 * Math.min(1, Math.abs(diff))) * eager * Math.sqrt(speedScale);
        k.heading += Math.max(-rate * dt, Math.min(rate * dt, diff * Math.min(1, dt * 2.5 * eager)));

        // Speed: cruise, with slow glides now and then; quicker when called.
        if (t > k.glideAt) { k.glide = Math.random() < 0.4 ? 0.35 : 1; k.glideAt = t + 3 + Math.random() * 6; }
        const near = k.mode === 'feed' || k.mode === 'curious' ? Math.min(1, dist / (k.len * 1.5)) : 1;
        const urge = k.mode === 'flee' ? 2.6 : k.mode === 'wander' ? k.glide : 1.7 * Math.max(0.35, near);
        k.speed += (k.cruise * urge * speedScale - k.speed) * Math.min(1, dt * (k.mode === 'flee' ? 4 : 1.2));
        k.x += Math.cos(k.heading) * k.speed * dt;
        k.y += Math.sin(k.heading) * k.speed * dt;
        k.phase += dt * (1.4 + k.speed / k.len * 7);

        // Depth: rise to feed, sink to hide; leavers dive out of sight.
        const depthWant = k.leaving ? 1.3 : k.mode === 'feed' || k.mode === 'curious' ? 0.05 : k.targetDepth;
        k.depth += (depthWant - k.depth) * Math.min(1, dt * 0.6);
        k.alpha = k.leaving ? Math.max(0, k.alpha - dt / 3) : Math.min(1, k.alpha + dt / 3);
        if (k.depth < 0.12 && Math.random() < dt * 0.25) this.ripple(k.x + Math.cos(k.heading) * k.len * 0.05, k.y + Math.sin(k.heading) * k.len * 0.05, 0.5, k.width * 1.6);

        // The spine follows the head, each joint bending only so far.
        const s = k.spine;
        s[0].x = k.x; s[0].y = k.y;
        let prev = k.heading;
        for (let i = 1; i < s.length; i++) {
            let a = Math.atan2(s[i - 1].y - s[i].y, s[i - 1].x - s[i].x);
            let bend = Math.atan2(Math.sin(a - prev), Math.cos(a - prev));
            if (Math.abs(bend) > 0.3) a = prev + Math.sign(bend) * 0.3;
            s[i].x = s[i - 1].x - Math.cos(a) * k.seg;
            s[i].y = s[i - 1].y - Math.sin(a) * k.seg;
            prev = a;
        }
        // The swimming wave, travelling from head to tail, stronger behind.
        const amp = k.width * 0.3 * (0.35 + 0.65 * Math.min(1, k.speed / k.cruise));
        for (let i = 0; i < s.length; i++) {
            const a = i ? Math.atan2(s[i - 1].y - s[i].y, s[i - 1].x - s[i].x) : k.heading;
            const sway = amp * Math.sin(k.phase - i * KOI_WAVE) * (0.08 + 0.92 * Math.pow(i / (s.length - 1), 1.6));
            k.points[i].x = s[i].x - Math.sin(a) * sway;
            k.points[i].y = s[i].y + Math.cos(a) * sway;
        }
    }

    nearestPellet(k) {
        let best = null, bestD = Infinity;
        for (const p of this.pellets) {
            const d = Math.hypot(p.x - k.x, p.y - k.y);
            if (d < bestD) { best = p; bestD = d; }
        }
        if (best && bestD < k.len * 0.14) {
            this.pellets.splice(this.pellets.indexOf(best), 1);
            this.ripple(best.x, best.y, 0.8, k.width * 2);
            return this.nearestPellet(k);
        }
        return best;
    }

    // Trim to the density's count by letting fish dive away, or let new ones rise.
    population() {
        const staying = this.koi.filter(k => !k.leaving);
        const target = this.fishTarget();
        if (staying.length > target) for (const k of staying.slice(target)) k.leaving = true;
        else if (staying.length < target && !this.koi.some(k => k.alpha < 0.2 && !k.leaving)) this.koi.push(this.makeKoi(true));
        this.koi = this.koi.filter(k => !(k.leaving && k.alpha <= 0));
    }

    // ---- Touch ---------------------------------------------------------------------------

    // A tap: rings spread from it, and the nearest koi turn to see; with
    // Feed on, pellets float there and the koi rise to eat them.
    tap(x, y) {
        this.ripple(x, y, 1, this.unit * 1.6);
        this.ripple(x, y, 0.7, this.unit * 1.1, 0.25);
        this.ripple(x, y, 0.45, this.unit * 0.7, 0.5);
        const feed = this.config.feed;
        if (feed) {
            for (let k = 0; k < 5 && this.pellets.length < 30; k++) {
                const a = Math.random() * 6.28, d = Math.random() * this.unit * 0.3;
                this.pellets.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, t: 0, life: 40 });
            }
        }
        const callers = this.koi.filter(k => !k.leaving)
            .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))
            .slice(0, Math.max(2, Math.ceil(this.koi.length / 3)));
        for (const k of callers) {
            k.mode = feed ? 'feed' : 'curious';
            k.modeUntil = this.time + (feed ? 15 : 5);
            k.target = { x, y };
        }
        this.attracted = callers.map(k => k.id);
    }

    // A finger dragged through the water: small rings, and the fish nearby dart off.
    stir(x, y) {
        this.ripple(x, y, 0.6, this.unit * 0.6);
        for (const k of this.koi) {
            const d = Math.hypot(k.x - x, k.y - y);
            if (d > k.len * 1.6 || k.mode === 'feed') continue;
            k.mode = 'flee';
            k.modeUntil = this.time + 1.2 + Math.random() * 0.8;
            k.target = { x: k.x + (k.x - x) / (d || 1) * k.len * 3, y: k.y + (k.y - y) / (d || 1) * k.len * 3 };
            k.targetDepth = 0.9;
        }
    }

    // ---- Ripples, glints, things floating ---------------------------------------------------

    ripple(x, y, strength, radius, delay = 0) {
        if (this.ripples.length >= 48) this.ripples.shift();
        this.ripples.push({ x, y, strength, radius, t: -delay, life: 1.6 + radius / 120 });
    }

    floatKinds() {
        const season = this.seasonNow;
        return season === 'spring' ? 'petal' : season === 'autumn' ? 'leaf' : null;
    }

    addFloating(x, y, kind, settled) {
        if (this.floating.length >= Math.round(40 * this.density) + 4) return;
        const leaf = kind === 'leaf';
        const sprites = leaf ? this.leafSprites : this.petalSprites;
        this.floating.push({
            kind, x, y, sprite: Math.floor(Math.random() * sprites.length), rot: Math.random() * 6.28,
            spin: (Math.random() - 0.5) * 0.3, vx: (Math.random() - 0.3) * 5, vy: (Math.random() - 0.5) * 4,
            fall: settled ? 0 : 1, t: settled ? Math.random() * 30 : 0, life: 45 + Math.random() * 40, scale: 0.8 + Math.random() * 0.4,
        });
    }

    // ---- Frames -------------------------------------------------------------------------------

    loop(time) {
        if (!this.running) return;
        const dt = Math.min(0.1, Math.max(0, (time - (this.last || time)) / 1000));
        this.last = time;
        this.update(dt);
        this.draw();
        this.frame = requestAnimationFrame(this.loop);
    }

    update(dt) {
        this.time += dt;
        for (const name of ['shadows', 'sparkles']) {
            const want = this.hasEffect(name);
            this.fade[name] += Math.max(-dt / 1.5, Math.min(dt / 1.5, want - this.fade[name]));
        }
        this.population();
        for (const k of this.koi) this.updateKoi(k, dt);

        for (const r of this.ripples) r.t += dt;
        this.ripples = this.ripples.filter(r => r.t < r.life);

        // Pads drift on their stems and turn a little; ripples rock them.
        for (const p of this.pads) {
            p.x = p.ax + Math.sin(this.time * 0.05 + p.phase) * 5;
            p.y = p.ay + Math.cos(this.time * 0.043 + p.phase) * 4;
            p.turn = Math.sin(this.time * 0.07 + p.phase) * 0.12;
        }

        // Petals and leaves fall onto the water, drift, and in time sink.
        const kind = this.floatKinds();
        if (kind) {
            this.spawnPetalIn -= dt;
            if (this.spawnPetalIn <= 0) {
                this.spawnPetalIn = (kind === 'leaf' ? 6 : 2.5) * (0.5 + Math.random()) / Math.max(0.2, this.density);
                this.addFloating(Math.random() * this.width, Math.random() * this.height, kind, false);
            }
        }
        for (const f of this.floating) {
            f.t += dt;
            if (f.fall > 0) {
                f.fall = Math.max(0, f.fall - dt / 1.4);
                if (f.fall === 0) this.ripple(f.x, f.y, 0.5, f.kind === 'leaf' ? 46 : 28);
                continue;
            }
            f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.spin * dt;
        }
        this.floating = this.floating.filter(f => f.t < f.life && f.x > -30 && f.x < this.width + 30 && f.y > -30 && f.y < this.height + 30);
        for (const p of this.pellets) p.t += dt;
        this.pellets = this.pellets.filter(p => p.t < p.life);

        // Glints of sun: a few at a time, pooled.
        if (this.fade.sparkles > 0) {
            for (const g of this.glints) g.t += dt;
            this.glints = this.glints.filter(g => g.t < g.life);
            if (this.glints.length < 14 * this.density && Math.random() < dt * 6 * this.density) {
                const x = Math.pow(Math.random(), 1.4) * this.width, y = Math.pow(Math.random(), 1.4) * this.height;
                if (!this.pads.some(p => Math.hypot(p.x - x, p.y - y) < p.R)) this.glints.push({ x, y, t: 0, life: 0.5 + Math.random() * 1.1, size: 0.6 + Math.random() * 0.8 });
            }
        }
    }

    draw() {
        const ctx = this.ctx, dpr = this.dpr;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(this.floorLayer, 0, 0);
        if (this.fade.shadows > 0) this.drawShadows();

        const order = [...this.koi].sort((a, b) => b.depth - a.depth);
        for (const k of order) this.drawKoi(k);

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.drawRipples();
        for (const p of this.pellets) {
            const s = this.pelletSprite, size = s.width / dpr;
            ctx.globalAlpha = Math.min(1, (p.life - p.t) / 3);
            ctx.drawImage(s, p.x - size / 2, p.y - size / 2, size, size);
        }
        ctx.globalAlpha = 1;
        for (const f of this.floating) this.drawFloating(f);
        for (const p of this.pads) {
            const size = p.sprite.width / dpr;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot + p.turn);
            ctx.drawImage(p.sprite, -size / 2, -size / 2, size, size);
            if (p.flower) {
                const fs = p.flower.width / dpr;
                ctx.drawImage(p.flower, p.fx - fs / 2, p.fy - fs / 2, fs, fs);
            }
            ctx.restore();
        }
        if (this.fade.sparkles > 0 && this.glints.length) {
            ctx.globalCompositeOperation = 'lighter';
            const s = this.glintSprite, base = s.width / dpr;
            for (const g of this.glints) {
                ctx.globalAlpha = Math.sin(Math.PI * g.t / g.life) * 0.75 * this.fade.sparkles;
                const size = base * g.size;
                ctx.drawImage(s, g.x - size / 2, g.y - size / 2, size, size);
            }
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(this.surfaceLayer, 0, 0);
        if (this.iceLayer) ctx.drawImage(this.iceLayer, 0, 0);
    }

    // Shadows on the floor, at a quarter of the size: the koi as soft
    // strokes along their spines, the pads as discs, offset from the light.
    drawShadows() {
        const sctx = this.shadowCtx, ctx = this.ctx;
        sctx.setTransform(1, 0, 0, 1, 0, 0);
        sctx.clearRect(0, 0, this.shadow.width, this.shadow.height);
        sctx.setTransform(0.25, 0, 0, 0.25, 0, 0);
        sctx.lineCap = 'round';
        sctx.lineJoin = 'round';
        for (const k of this.koi) {
            const lift = 6 + 26 * Math.max(0, 1 - k.depth);
            sctx.strokeStyle = `rgba(0, 14, 10, ${(0.32 + 0.3 * Math.min(1, k.depth)) * k.alpha})`;
            sctx.lineWidth = k.width * 0.9;
            sctx.beginPath();
            k.points.forEach((p, i) => sctx[i ? 'lineTo' : 'moveTo'](p.x + lift * 0.6, p.y + lift * 0.8));
            sctx.stroke();
        }
        sctx.fillStyle = 'rgba(0, 14, 10, 0.45)';
        for (const p of this.pads) {
            sctx.beginPath();
            sctx.arc(p.x + 22, p.y + 30, p.R, 0, Math.PI * 2);
            sctx.fill();
        }
        ctx.globalAlpha = this.fade.shadows;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(this.shadow, 0, 0, this.canvas.width, this.canvas.height);
        ctx.globalAlpha = 1;
    }

    drawKoi(k) {
        const ctx = this.ctx, dpr = this.dpr, pts = k.points, n = pts.length;
        const alpha = k.alpha * (1 - Math.min(1, k.depth) * 0.42);
        if (alpha <= 0.01) return;
        const scale = 1 + (1 - Math.min(1, k.depth)) * 0.06;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.globalAlpha = alpha;
        const [cr, cg, cb] = k.fin;
        const angleAt = i => Math.atan2(pts[Math.max(0, i - 1)].y - pts[Math.min(n - 1, i)].y, pts[Math.max(0, i - 1)].x - pts[Math.min(n - 1, i)].x);

        // Tail: a translucent fan that trails the body's last swing.
        const tip = pts[n - 1], back = angleAt(n - 1) + Math.PI + Math.sin(k.phase - n * KOI_WAVE - 0.8) * 0.3;
        const tl = k.len * 0.3 * scale, spread = 0.55;
        const at = (a, r) => [tip.x + Math.cos(back + a) * r, tip.y + Math.sin(back + a) * r];
        ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, 0.26)`;
        // The whole fan, then a smaller one over its root, so it thins towards the edge.
        for (const r of [tl, tl * 0.6]) {
            ctx.beginPath();
            ctx.moveTo(tip.x, tip.y);
            ctx.quadraticCurveTo(...at(spread * 0.7, r * 0.6), ...at(spread, r));
            ctx.quadraticCurveTo(...at(spread * 0.4, r * 0.75), ...at(0, r * 0.62));
            ctx.quadraticCurveTo(...at(-spread * 0.4, r * 0.75), ...at(-spread, r));
            ctx.quadraticCurveTo(...at(-spread * 0.7, r * 0.6), tip.x, tip.y);
            ctx.fill();
        }
        ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, 0.16)`;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        for (const s of [-0.6, 0, 0.6]) { ctx.moveTo(tip.x, tip.y); ctx.quadraticCurveTo(...at(s * spread * 0.5, tl * 0.4), ...at(s * spread * 0.85, tl * 0.75)); }
        ctx.stroke();

        // Pectoral fins, rowing slowly.
        const base = pts[2], bodyAngle = angleAt(2);
        const flap = 0.25 * Math.sin(this.time * 2.2 + k.phase * 0.2);
        ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, 0.45)`;
        for (const side of [-1, 1]) {
            const a = bodyAngle + Math.PI + side * (1.05 + flap);
            const fl = k.width * 1.05 * scale;
            const bx = base.x - Math.sin(bodyAngle) * side * k.width * 0.32, by = base.y + Math.cos(bodyAngle) * side * k.width * 0.32;
            ctx.beginPath();
            ctx.ellipse(bx + Math.cos(a) * fl * 0.5, by + Math.sin(a) * fl * 0.5, fl * 0.55, k.width * 0.22, a, 0, Math.PI * 2);
            ctx.fill();
        }

        // The body, in slices along the spine, tail first, so the pattern bends.
        const sprite = k.sprite, sw = sprite.width / k.body, sh = sprite.height;
        const over = k.seg * 0.14;
        for (let i = n - 2; i >= 0; i--) {
            const a = pts[i], b = pts[i + 1];
            const ang = Math.atan2(a.y - b.y, a.x - b.x), len = Math.hypot(a.x - b.x, a.y - b.y) * scale;
            const from = Math.max(0, k.body - (i + 1) * k.seg - over), to = Math.min(k.body, k.body - i * k.seg + over);
            const stretch = len / k.seg;
            const c = Math.cos(ang), s = Math.sin(ang);
            ctx.setTransform(dpr * c, dpr * s, -dpr * s, dpr * c, dpr * b.x, dpr * b.y);
            const start = (from - (k.body - (i + 1) * k.seg)) * stretch;
            ctx.drawImage(sprite, from * sw, 0, (to - from) * sw, sh, start, -k.width * scale / 2, (to - from) * stretch, k.width * scale);
        }
        // The dorsal fin: a fine pale line down the back.
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, 0.3)`;
        ctx.lineWidth = Math.max(0.8, k.width * 0.08);
        ctx.beginPath();
        for (let i = 2; i <= 6; i++) ctx[i === 2 ? 'moveTo' : 'lineTo'](pts[i].x, pts[i].y);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    drawRipples() {
        const ctx = this.ctx;
        ctx.lineWidth = 1.4;
        for (const r of this.ripples) {
            if (r.t < 0) continue;
            const p = r.t / r.life, radius = r.radius * (1 - Math.pow(1 - p, 2.2));
            const a = r.strength * Math.pow(1 - p, 1.4);
            ctx.strokeStyle = `rgba(225, 248, 240, ${a * 0.55})`;
            ctx.beginPath();
            ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
            ctx.stroke();
            if (radius > 4) {
                ctx.strokeStyle = `rgba(0, 22, 26, ${a * 0.35})`;
                ctx.beginPath();
                ctx.arc(r.x, r.y, radius - 3, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
    }

    drawFloating(f) {
        const ctx = this.ctx, dpr = this.dpr;
        const sprites = f.kind === 'leaf' ? this.leafSprites : this.petalSprites;
        const s = sprites[f.sprite % sprites.length], size = s.width / dpr * f.scale * (1 + f.fall * 0.8);
        ctx.save();
        ctx.globalAlpha = Math.min(1, (1 - f.fall) * 3, (f.life - f.t) / 4);
        ctx.translate(f.x, f.y);
        ctx.rotate(f.rot + f.fall * 2);
        ctx.drawImage(s, -size / 2, -size / 2, size, size);
        ctx.restore();
    }
}
