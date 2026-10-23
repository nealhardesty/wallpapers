// Lantern Festival: paper sky lanterns rising from a lakeshore into the
// night, their reflections trembling on the water. Tap the shore to release
// one of your own.
//
// Cheap by design (SPEC §4.8):
//   - the sky, far shore, water and near shore are one cached layer per resize
//   - each lantern is a sprite baked once per tint at three sizes, glow
//     included; the flame flickers by the alpha of a second baked sprite,
//     drawn additively, so nothing is redrawn per frame
//   - a reflection is the same sprite stretched and dimmed, wobbling
//     sideways on a per-lantern sine: ripples without any pixel work
//   - a fixed pool of lanterns, recycled; it never grows
//   - a lantern's place is a closed-form function of its age, so any frame
//     rate draws the same flight, and the sky is pre-seeded by age
//
// The lake is laid out in perspective: a lantern at distance d (1 at the
// near shore, larger further out) floats above the point of water at
//   y = horizon + (shore - horizon) / d,  drawn 1/d the size.

const LANTERN_TINTS = {
    warm: [[255, 168, 76], [255, 146, 58], [255, 190, 104], [248, 132, 54]],
    mixed: [[255, 168, 76], [255, 120, 104], [255, 208, 118], [255, 146, 150], [240, 98, 62], [255, 182, 92]],
};
const LANTERN_SIZES = [14, 28, 56];        // baked body heights, CSS px
const LANTERN_SPARE = 12;                  // pool room for tapped lanterns, above the setting

class LanternsAnimationManager {
    constructor(host) {
        this.host = host;
        this.config = WP.settings.load();
        this.running = false;
        this.pool = [];
        this.listeners = [];
        this.pointerType = 'mouse';
        this.time = 0;
        this.due = 0;            // automatic releases owed, fractional
        this.effect = 1;         // the ripples effect, faded in and out
    }

    // ---- Lifecycle -----------------------------------------------------------

    start() {
        if (this.running) return;
        this.running = true;
        const canvas = this.canvas = document.createElement('canvas');
        canvas.id = 'lanterns-canvas';
        Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: '-1', pointerEvents: 'none' });
        document.body.appendChild(canvas);
        this.ctx = canvas.getContext('2d');
        this.effect = this.ripples() ? 1 : 0;
        this.buildPool();
        this.resize();
        this.seedSky();
        this.listen();
        this.last = 0;
        this.frameId = requestAnimationFrame(now => this.frame(now));
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

    // The pool: as many lanterns as the setting allows, plus room for taps.
    // It's made once and never grows.
    buildPool() {
        this.pool = Array.from({ length: this.config.count + LANTERN_SPARE }, () => ({ alive: false }));
    }

    // Lanterns the tier wants aloft at once.
    target() {
        return Math.max(4, Math.round(this.config.count * (this.host.quality?.density ?? 1)));
    }

    alive() {
        let n = 0;
        for (const l of this.pool) if (l.alive) n++;
        return n;
    }

    ripples() {
        return this.host.quality?.effects?.includes('ripples') ?? true;
    }

    applySettings(config) {
        const old = this.config;
        this.config = config;
        if (!this.running) return;
        if (config.count !== old.count) {
            // A new pool, carrying over the lanterns already aloft.
            const aloft = this.pool.filter(l => l.alive).slice(0, config.count + LANTERN_SPARE);
            this.buildPool();
            aloft.forEach((l, i) => { this.pool[i] = l; });
        }
        if (config.colour !== old.colour) this.buildSprites();
    }

    // Fewer lanterns are simply released less often; the ones aloft finish
    // their flight. The ripples fade over a second and a half.
    onQuality() {}

    listen() {
        const on = (target, type, fn) => {
            target.addEventListener(type, fn, { passive: true });
            this.listeners.push(() => target.removeEventListener(type, fn));
        };
        on(window, 'resize', () => this.resize());
        on(document, 'pointerdown', event => { this.pointerType = event.pointerType; });
        this.listeners.push(this.host.gestures({
            tap: (x, y) => { if (this.pointerType === 'mouse' || this.config.touch) this.releaseAt(x, y); },
        }));
    }

    // ---- Layout ---------------------------------------------------------------------

    resize() {
        if (!this.canvas) return;
        const dpr = this.dpr = window.devicePixelRatio || 1;
        const W = this.width = window.innerWidth, H = this.height = window.innerHeight;
        this.canvas.width = Math.round(W * dpr);
        this.canvas.height = Math.round(H * dpr);
        const bottom = this.host.insets?.bottom || 0, portrait = H > W;
        this.horizon = Math.round((H - bottom) * (portrait ? 0.66 : 0.62));
        this.shore = Math.round(this.horizon + (H - bottom - this.horizon) * 0.8);
        // Sizes in CSS px at the near shore.
        this.scale = Math.min(1.2, Math.max(0.7, Math.min(W, H) / 800));
        this.buildSprites();
        this.buildScene();
        this.buildBoats();
    }

    // The point of water at distance d, and back again.
    waterY(d) { return this.horizon + (this.shore - this.horizon) / d; }
    distanceAt(y) { return (this.shore - this.horizon) / Math.max(1, y - this.horizon); }

    // ---- Sprites ---------------------------------------------------------------------

    // Each tint at each size: the glowing paper body with its halo, and the
    // flame's hot glow on its own, for the flicker.
    buildSprites() {
        const tints = LANTERN_TINTS[this.config.colour] || LANTERN_TINTS.warm;
        const dpr = this.dpr;
        this.sprites = tints.map(tint => LANTERN_SIZES.map(h => this.bakeLantern(tint, h * dpr)));
        this.flames = LANTERN_SIZES.map(h => this.bakeFlame(h * dpr));
        this.starGlow = this.bakeFlame(10 * dpr);
    }

    bakeLantern([r, g, b], h) {
        const size = Math.ceil(h * 3), c = document.createElement('canvas');
        c.width = c.height = size;
        const x = c.getContext('2d'), cx = size / 2, cy = size / 2;
        // The halo: warm light spilling into the night around it.
        const halo = x.createRadialGradient(cx, cy + h * 0.15, 0, cx, cy + h * 0.15, size / 2);
        halo.addColorStop(0, `rgba(${r},${g},${b},0.42)`);
        halo.addColorStop(0.25, `rgba(${r},${g},${b},0.16)`);
        halo.addColorStop(0.6, `rgba(${r},${g},${b},0.04)`);
        halo.addColorStop(1, `rgba(${r},${g},${b},0)`);
        x.fillStyle = halo;
        x.fillRect(0, 0, size, size);
        // The paper body: a little wider at the top, rounded shoulders.
        const top = cy - h / 2, bottom = cy + h / 2, wt = h * 0.36, wb = h * 0.28;
        x.beginPath();
        x.moveTo(cx - wb, bottom);
        x.lineTo(cx - wt, top + h * 0.16);
        x.quadraticCurveTo(cx - wt, top, cx - wt * 0.6, top);
        x.lineTo(cx + wt * 0.6, top);
        x.quadraticCurveTo(cx + wt, top, cx + wt, top + h * 0.16);
        x.lineTo(cx + wb, bottom);
        x.closePath();
        // Lit from inside, brightest low down near the flame and in the
        // middle, deeper at the edges and the top.
        const across = x.createLinearGradient(cx - wt, 0, cx + wt, 0);
        across.addColorStop(0, `rgb(${r * 0.72 | 0},${g * 0.5 | 0},${b * 0.42 | 0})`);
        across.addColorStop(0.5, `rgb(${Math.min(255, r + 10)},${Math.min(255, g + 50)},${Math.min(255, b + 70)})`);
        across.addColorStop(1, `rgb(${r * 0.72 | 0},${g * 0.5 | 0},${b * 0.42 | 0})`);
        x.fillStyle = across;
        x.fill();
        x.save();
        x.clip();
        const down = x.createLinearGradient(0, top, 0, bottom);
        down.addColorStop(0, 'rgba(90,30,20,0.45)');
        down.addColorStop(0.55, 'rgba(255,240,200,0)');
        down.addColorStop(1, 'rgba(255,246,214,0.55)');
        x.fillStyle = down;
        x.fillRect(cx - wt, top, wt * 2, h);
        // Two faint ribs of the bamboo frame.
        x.strokeStyle = `rgba(${r * 0.5 | 0},${g * 0.3 | 0},${b * 0.2 | 0},0.35)`;
        x.lineWidth = Math.max(0.6, h / 60);
        for (const k of [-0.4, 0.4]) {
            x.beginPath();
            x.moveTo(cx + k * wt, top);
            x.lineTo(cx + k * wb, bottom);
            x.stroke();
        }
        x.restore();
        // The open bottom ring.
        x.fillStyle = `rgba(${r * 0.35 | 0},${g * 0.18 | 0},${b * 0.1 | 0},0.8)`;
        x.beginPath();
        x.ellipse(cx, bottom, wb, Math.max(0.8, h * 0.035), 0, 0, Math.PI * 2);
        x.fill();
        return c;
    }

    // The flame's glow: a hot white-gold core under the paper, drawn with
    // 'lighter' at a flickering alpha.
    bakeFlame(h) {
        const size = Math.ceil(h * 1.6), c = document.createElement('canvas');
        c.width = c.height = size;
        const x = c.getContext('2d'), r = size / 2;
        const glow = x.createRadialGradient(r, r, 0, r, r, r);
        glow.addColorStop(0, 'rgba(255,250,225,0.95)');
        glow.addColorStop(0.18, 'rgba(255,214,140,0.55)');
        glow.addColorStop(0.5, 'rgba(255,150,60,0.14)');
        glow.addColorStop(1, 'rgba(255,120,40,0)');
        x.fillStyle = glow;
        x.fillRect(0, 0, size, size);
        return c;
    }

    // ---- The scene, cached per resize -------------------------------------------------

    buildScene() {
        const W = this.width, H = this.height, Y = this.horizon, S = this.shore, dpr = this.dpr;
        const random = WP.seededRandom(Math.round(W * 3 + H * 17));
        const c = document.createElement('canvas');
        c.width = Math.round(W * dpr);
        c.height = Math.round(H * dpr);
        const g = c.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Night sky: deep blue overhead, warming to a plum and ember haze
        // low down, where a thousand lanterns light the air.
        const sky = g.createLinearGradient(0, 0, 0, Y);
        sky.addColorStop(0, '#050817');
        sky.addColorStop(0.45, '#121638');
        sky.addColorStop(0.78, '#2f2347');
        sky.addColorStop(0.93, '#5a3443');
        sky.addColorStop(1, '#7a4636');
        g.fillStyle = sky;
        g.fillRect(0, 0, W, Y);
        // Stars, fewer and fainter towards the haze.
        for (let i = 0; i < W * Y / 2600; i++) {
            const y = Y * Math.pow(random(), 1.5) * 0.85, x = random() * W;
            const a = (0.2 + random() * 0.7) * (1 - y / Y);
            g.fillStyle = `rgba(255,248,236,${a})`;
            const s = random() < 0.06 ? 1.6 : 0.9;
            g.fillRect(x, y, s, s);
        }
        // A faint band of the galaxy, slanting.
        g.save();
        g.translate(W * 0.55, Y * 0.35);
        g.rotate(-0.5);
        const band = g.createLinearGradient(0, -Y * 0.18, 0, Y * 0.18);
        band.addColorStop(0, 'rgba(150,150,210,0)');
        band.addColorStop(0.5, 'rgba(150,150,210,0.07)');
        band.addColorStop(1, 'rgba(150,150,210,0)');
        g.fillStyle = band;
        g.fillRect(-W, -Y * 0.18, W * 2, Y * 0.36);
        g.restore();

        // The glow of the festival, warming the low sky.
        const warm = g.createRadialGradient(W * 0.5, Y, 0, W * 0.5, Y, Math.max(W, Y) * 0.7);
        warm.addColorStop(0, 'rgba(255,140,70,0.22)');
        warm.addColorStop(0.5, 'rgba(255,110,70,0.06)');
        warm.addColorStop(1, 'rgba(255,110,70,0)');
        g.fillStyle = warm;
        g.fillRect(0, 0, W, Y);

        // Far hills, two ranges, with windows lit along the shore.
        const range = (colour, height, rough) => {
            g.fillStyle = colour;
            g.beginPath();
            g.moveTo(0, Y + 1);
            const p = random() * 6, q = random() * 6;
            for (let x = 0; x <= W + 4; x += 4) {
                const h = height * (0.55 + 0.3 * Math.sin(x / W * 4 + p) + 0.15 * Math.sin(x / W * 13 + q)) + rough * random();
                g.lineTo(x, Y - h);
            }
            g.lineTo(W, Y + 1);
            g.closePath();
            g.fill();
        };
        range('#1c1630', (H - Y) * 0.32 + 10, 1);
        range('#120e20', (H - Y) * 0.16 + 4, 1.5);
        const windows = [];
        for (let i = 0; i < W / 22; i++) {
            const x = random() * W, y = Y - 1 - random() * 5;
            windows.push([x, y]);
            g.fillStyle = `rgba(255,${190 + random() * 40 | 0},120,${0.5 + random() * 0.4})`;
            g.fillRect(x, y, 1.4, 1.2);
        }

        // The lake: the sky's warm haze reflected, darkening towards us.
        const water = g.createLinearGradient(0, Y, 0, S);
        water.addColorStop(0, '#4a2c34');
        water.addColorStop(0.2, '#24182c');
        water.addColorStop(1, '#0a0b18');
        g.fillStyle = water;
        g.fillRect(0, Y, W, S - Y + 2);
        for (const [x, y] of windows) {
            g.fillStyle = 'rgba(255,200,120,0.18)';
            g.fillRect(x - 0.3, Y + (Y - y), 2, 3 + random() * 6);
        }
        // Long faint swells, closer together far away.
        for (let i = 0; i < 90; i++) {
            const t = Math.pow(random(), 1.7), y = Y + 2 + t * (S - Y);
            g.fillStyle = `rgba(160,140,200,${0.03 + random() * 0.05})`;
            g.fillRect(random() * W, y, (15 + random() * 90) * (0.3 + t), 0.6 + t);
        }

        // The near shore: grass and a few people watching, one tree.
        g.fillStyle = '#05050b';
        g.beginPath();
        g.moveTo(0, H);
        for (let x = 0; x <= W; x += 3) g.lineTo(x, S + 2 + 3 * Math.sin(x / 70) + random() * 2.5);
        g.lineTo(W, H);
        g.closePath();
        g.fill();
        g.strokeStyle = '#05050b';
        g.lineWidth = 1;
        for (let x = 0; x < W; x += 2 + random() * 4) {
            const h = 3 + random() * 9;
            g.beginPath();
            g.moveTo(x, S + 5);
            g.lineTo(x + (random() - 0.5) * 4, S + 4 - h);
            g.stroke();
        }
        const k = this.scale, people = Math.max(4, Math.round(W / 160));
        this.watchers = [];
        for (let i = 0; i < people; i++) {
            const x = W * (0.06 + 0.88 * (i + random() * 0.6) / people), tall = (40 + random() * 18) * k;
            this.watchers.push(x);
            this.person(g, x, S + 4, tall, random);
            if (random() < 0.4) this.person(g, x + tall * 0.35, S + 5, tall * 0.62, random);   // a child
        }
        this.scene = c;
    }

    person(g, x, ground, tall, random) {
        const head = tall * 0.12, lean = (random() - 0.5) * tall * 0.06;
        g.beginPath();
        g.arc(x + lean, ground - tall + head, head, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.moveTo(x - tall * 0.13, ground);
        g.lineTo(x - tall * 0.16 + lean, ground - tall * 0.72);
        g.quadraticCurveTo(x + lean, ground - tall * 0.84, x + tall * 0.16 + lean, ground - tall * 0.72);
        g.lineTo(x + tall * 0.13, ground);
        g.closePath();
        g.fill();
        if (random() < 0.5) {
            // An arm raised towards the lanterns.
            g.lineWidth = tall * 0.06;
            g.beginPath();
            g.moveTo(x + lean + tall * 0.12, ground - tall * 0.7);
            g.lineTo(x + lean + tall * 0.25, ground - tall * 1.05);
            g.stroke();
        }
    }

    // A few boats out on the lake, each with its lantern; they drift.
    buildBoats() {
        const random = WP.seededRandom(Math.round(this.width + this.height));
        const n = this.width > 900 ? 3 : 2;
        this.boats = Array.from({ length: n }, (_, i) => ({
            x: this.width * (0.2 + 0.6 * (i + random() * 0.5) / n),
            d: 1.7 + random() * 2.8,
            speed: (random() < 0.5 ? -1 : 1) * (2 + random() * 3),
            phase: random() * 6,
        }));
    }

    // ---- Lanterns ---------------------------------------------------------------------

    // A lantern into a free slot of the pool, or, when every slot is aloft,
    // into the place of the one furthest through its flight.
    launch(x, d, age = 0) {
        let slot = this.pool.find(l => !l.alive);
        if (!slot) slot = this.pool.reduce((a, b) => (b.age / b.life > a.age / a.life ? b : a));
        const tints = this.sprites.length, cx = this.width / 2;
        Object.assign(slot, {
            alive: true,
            age,
            life: 150 + Math.random() * 70,      // seconds before it's lost among the stars
            x0: cx + (x - cx) * d,                // across the lake, at distance 1
            d0: d,
            rise: (0.018 + Math.random() * 0.016) * this.shore,   // px/s at distance 1
            recede: 0.018 + Math.random() * 0.03, // distance per second
            wind: (Math.random() - 0.35) * 6,
            sway: 3 + Math.random() * 5,
            swayRate: 0.35 + Math.random() * 0.35,
            phase: Math.random() * 6.3,
            flicker: Math.random() * 100,
            tint: Math.floor(Math.random() * tints),
            size: (0.85 + Math.random() * 0.35) * 48 * this.scale,
            mirror: this.pool.indexOf(slot) % 2 === 0,
        });
        return slot;
    }

    // A tap: a lantern from the shore under the pointer.
    releaseAt(x, y) {
        const d = y > this.shore ? Math.max(0.8, this.distanceAt(y)) : 1;
        this.launch(x, d);
    }

    // A release from somewhere on the lake: the near shore, a boat, or the
    // far shore, in twos and threes.
    releaseSome() {
        const roll = Math.random();
        let x, d;
        if (roll < 0.5) { x = this.watchers[Math.floor(Math.random() * this.watchers.length)] + (Math.random() - 0.5) * 30; d = 1 + Math.random() * 0.12; }
        else if (roll < 0.7) { const b = this.boats[Math.floor(Math.random() * this.boats.length)]; x = b.x; d = b.d; }
        else { x = Math.random() * this.width; d = 5 + Math.random() * 7; }
        const group = 1 + Math.floor(Math.random() * 2.4);
        for (let i = 0; i < group && this.alive() < this.target(); i++) this.launch(x + (Math.random() - 0.5) * 24 * i, d * (1 + i * 0.03), -i * 0.8);
    }

    // The sky as it would be after the festival had been going a while:
    // lanterns at every age, already up and away.
    seedSky() {
        const n = this.target();
        for (let i = 0; i < n; i++) {
            const roll = Math.random(), far = roll > 0.55;
            const l = this.launch(Math.random() * this.width, far ? 4 + Math.random() * 8 : 1 + Math.random() * 1.5);
            l.age = Math.pow(Math.random(), 1.5) * l.life * 0.8;
        }
        this.due = 0;
    }

    // Where a lantern is at its age: everything follows from that, so the
    // flight is the same at any frame rate.
    place(l) {
        const t = Math.max(0, l.age);
        const lift = l.rise * t * t / (t + 6);              // eases up off the ground
        const d = l.d0 + l.recede * t;
        const cx = this.width / 2;
        const sway = l.sway * Math.sin(this.time * l.swayRate + l.phase);
        const wx = l.x0 + l.wind * t + sway;
        const x = cx + (wx - cx) / d, water = this.waterY(d), y = water - lift / d;
        // Fades in as it's lit, out as it's lost high and far away.
        const fade = Math.min(1, t / 1.5) * Math.min(1, (l.life - t) / 25) * Math.min(1, y / (this.horizon * 0.12));
        return { x, y, water, lift: lift / d, s: l.size / d, fade: Math.max(0, fade) };
    }

    update(dt) {
        this.time += dt;
        const want = this.ripples() ? 1 : 0;
        this.effect += Math.sign(want - this.effect) * Math.min(Math.abs(want - this.effect), dt / 1.5);
        for (const l of this.pool) {
            if (!l.alive) continue;
            l.age += dt;
            if (l.age > l.life) l.alive = false;
        }
        for (const b of this.boats) {
            b.x += b.speed * dt / b.d;
            if (b.x < -40 || b.x > this.width + 40) b.speed = -b.speed;
        }
        // Automatic releases, per minute, fewer on lower tiers.
        this.due += dt * this.config.releases * (this.host.quality?.density ?? 1) / 60;
        while (this.due >= 1) {
            this.due -= 1;
            if (this.alive() < this.target()) this.releaseSome();
        }
    }

    frame(now) {
        if (!this.running) return;
        const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
        this.last = now;
        this.update(dt);
        this.draw();
        this.frameId = requestAnimationFrame(t => this.frame(t));
    }

    // ---- Drawing ---------------------------------------------------------------------------

    draw() {
        const ctx = this.ctx, dpr = this.dpr;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(this.scene, 0, 0);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Far to near, so nearer lanterns pass in front.
        const lit = [];
        for (const l of this.pool) {
            if (!l.alive || l.age < 0) continue;
            const p = this.place(l);
            // Gone over the top of the sky: its slot is free again.
            if (p.y < -p.s * 2) l.alive = false;
            else lit.push([l, p]);
        }
        lit.sort((a, b) => b[0].d0 + b[0].recede * b[0].age - (a[0].d0 + a[0].recede * a[0].age));

        if (this.config.reflections) this.drawReflections(ctx, lit);
        this.drawBoats(ctx);
        for (const [l, p] of lit) this.drawLantern(ctx, l, p);
        // The flames, all at once, added onto the paper.
        ctx.globalCompositeOperation = 'lighter';
        for (const [l, p] of lit) {
            const f = this.flicker(l);
            const sprite = this.flames[this.sizeIndex(p.s)];
            const w = p.s * 1.1;
            ctx.globalAlpha = p.fade * (0.35 + 0.45 * f);
            ctx.drawImage(sprite, p.x - w / 2, p.y + p.s * 0.28 - w / 2, w, w);
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
    }

    // Flicker, 0 to 1: a few incommensurate sines, so it never repeats.
    flicker(l) {
        const t = this.time * 7 + l.flicker;
        return 0.55 + 0.25 * Math.sin(t) * Math.sin(t * 1.73 + 1) + 0.2 * Math.sin(t * 3.1 + l.flicker);
    }

    sizeIndex(s) {
        return s > LANTERN_SIZES[1] * 1.1 ? 2 : s > LANTERN_SIZES[0] * 1.1 ? 1 : 0;
    }

    drawLantern(ctx, l, p) {
        if (p.fade <= 0.003 || p.y < -p.s * 2) return;
        const i = this.sizeIndex(p.s), sprite = this.sprites[l.tint % this.sprites.length][i];
        const k = p.s / LANTERN_SIZES[i] / this.dpr, w = sprite.width * k;
        ctx.globalAlpha = p.fade * (0.85 + 0.15 * this.flicker(l));
        // A slight tilt as it sways.
        const tilt = 0.06 * Math.cos(this.time * l.swayRate + l.phase);
        if (p.s > 8) {
            ctx.translate(p.x, p.y);
            ctx.rotate(tilt);
            ctx.drawImage(sprite, -w / 2, -w / 2, w, w);
            ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        } else {
            ctx.drawImage(sprite, p.x - w / 2, p.y - w / 2, w, w);
        }
    }

    // On the water: each lantern again, below its point of water as far as
    // it is above, stretched tall, dimmed, wobbling. With ripples, three
    // slices each wobble on their own; without (Low), every other lantern
    // gets one plain copy.
    drawReflections(ctx, lit) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, this.horizon, this.width, this.shore - this.horizon - 1);
        ctx.clip();
        const ripples = this.effect;
        for (const [l, p] of lit) {
            if (!l.mirror && ripples < 0.5) continue;
            const ry = p.water + p.lift * 0.9;
            if (ry > this.shore + p.s || p.fade < 0.01) continue;
            const i = this.sizeIndex(p.s), sprite = this.sprites[l.tint % this.sprites.length][i];
            const k = p.s / LANTERN_SIZES[i] / this.dpr, w = sprite.width * k, h = w * 1.7;
            const near = Math.min(1, 0.4 + 0.9 * (ry - this.horizon) / (this.shore - this.horizon));
            const alpha = p.fade * 0.42 * near;
            const wob = (1.5 + 3 / (1 + p.lift / 60)) * this.scale;
            if (ripples > 0.01) {
                const sh = sprite.height / 3;
                for (let s = 0; s < 3; s++) {
                    const off = wob * Math.sin(this.time * (1.6 + s * 0.7) + l.phase * 3 + s * 1.9);
                    ctx.globalAlpha = alpha * (1 - s * 0.22) * (l.mirror ? 1 : ripples);
                    ctx.drawImage(sprite, 0, s * sh, sprite.width, sh, p.x - w / 2 + off, ry - h / 2 + s * h / 3, w, h / 3 + 0.5);
                }
            } else {
                ctx.globalAlpha = alpha;
                const off = wob * Math.sin(this.time * 1.6 + l.phase * 3);
                ctx.drawImage(sprite, p.x - w / 2 + off, ry - h / 2, w, h);
            }
        }
        ctx.restore();
    }

    drawBoats(ctx) {
        ctx.globalAlpha = 1;
        for (const b of this.boats) {
            const y = this.waterY(b.d), s = 44 * this.scale / b.d, bob = Math.sin(this.time * 1.2 + b.phase) * s * 0.04;
            ctx.fillStyle = '#06060c';
            ctx.beginPath();
            ctx.moveTo(b.x - s, y - s * 0.12 + bob);
            ctx.quadraticCurveTo(b.x, y + s * 0.2 + bob, b.x + s, y - s * 0.16 + bob);
            ctx.lineTo(b.x + s * 0.7, y + s * 0.02 + bob);
            ctx.lineTo(b.x - s * 0.75, y + s * 0.02 + bob);
            ctx.closePath();
            ctx.fill();
            // Someone sitting in it.
            ctx.beginPath();
            ctx.arc(b.x - s * 0.15, y - s * 0.52 + bob, s * 0.11, 0, Math.PI * 2);
            ctx.moveTo(b.x - s * 0.32, y - s * 0.05 + bob);
            ctx.lineTo(b.x - s * 0.25, y - s * 0.4 + bob);
            ctx.lineTo(b.x - s * 0.02, y - s * 0.4 + bob);
            ctx.lineTo(b.x + s * 0.05, y - s * 0.05 + bob);
            ctx.fill();
            // Its own lamp, and the lamp's light on the water.
            const glow = this.starGlow, gw = s * 1.3;
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.6 + 0.15 * Math.sin(this.time * 5 + b.phase);
            ctx.drawImage(glow, b.x + s * 0.45 - gw / 2, y - s * 0.45 + bob - gw / 2, gw, gw);
            ctx.globalAlpha = 0.25;
            ctx.drawImage(glow, b.x + s * 0.45 - gw / 2, y + s * 0.2, gw, gw * 1.8);
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
        }
    }
}
