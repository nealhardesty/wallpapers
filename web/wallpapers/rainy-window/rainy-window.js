// Rainy Window (SPEC §10.15): a city at night through a fogged window, with
// drops running down the glass.
//
// Layers, all built once per resize (this.builds counts them):
//   sharp    the city, full resolution
//   blurred  the city through condensation: downscaled, upscaled and hazed,
//            at half resolution
// Every frame: the sharp city, then the blurred one through the fog mask
// (alpha = clear glass, painted by drops and fingers, regrowing in small
// steps), then the beads layer (tiny droplets, kept as pixels), then the
// running drops, each a clipped, upside-down copy of the sharp city with a
// baked rim, which reads as refraction. A window light switching repaints
// just that window and re-blurs the patch around it.
//
// Low (or the `fog` effect shed) drops the mask: a softened city under the
// drops, at the tier's density.

class RainyWindowAnimationManager {
    constructor(host) {
        this.host = host;
        this.config = WP.settings.load();
        this.seed = Math.floor(Math.random() * 2 ** 31);
        this.builds = 0;            // full layer builds: once per resize (smoke checks)
        this.patches = 0;           // single-window repaints
        this.drops = [];
        this.pool = [];
        this.cars = [];
        this.plane = null;
        this.boat = null;
        this.running = false;
        this.fogFade = this.wants('fog');
        this.regrowClock = 0;
        this.lightClock = 0;
        this.scanClock = 0;
        this.time = 0;
        this.finger = null;
    }

    // ---- Lifecycle ------------------------------------------------------------

    start() {
        if (this.running) return;
        this.running = true;
        const canvas = this.canvas = document.createElement('canvas');
        Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: '-1', pointerEvents: 'none' });
        document.body.appendChild(canvas);
        this.ctx = canvas.getContext('2d');
        this.bakeSprites();
        this.onResize = () => this.resize();
        window.addEventListener('resize', this.onResize);
        this.resize();
        this.stopGestures = this.host.gestures({
            start: (x, y) => this.touch(x, y, true),
            move: (x, y) => this.touch(x, y, false),
            end: () => { this.finger = null; },
            tap: (x, y) => { this.touch(x, y, true); this.finger = null; },
        });
        this.last = 0;
        this.frame = requestAnimationFrame(t => this.tick(t));
    }

    stop() {
        if (!this.running) return;
        this.running = false;
        cancelAnimationFrame(this.frame);
        window.removeEventListener('resize', this.onResize);
        this.stopGestures?.();
        this.canvas.remove();
    }

    applySettings(config) {
        const old = this.config;
        this.config = config;
        if (config.city !== old.city || config.palette !== old.palette) this.resize();
    }

    onQuality(quality) {
        // DPR changes arrive as a resize; density only changes how many
        // drops are let in from now on, so the glass thins or fills slowly.
        this.host.quality = quality;
    }

    wants(effect) {
        return this.host.quality.effects.includes(effect) ? 1 : 0;
    }

    // ---- Layers -----------------------------------------------------------------

    resize() {
        const s = window.devicePixelRatio || 1;
        const w = innerWidth, h = innerHeight;
        const W = Math.max(1, Math.round(w * s)), H = Math.max(1, Math.round(h * s));
        this.w = w; this.h = h; this.s = W / w;
        this.canvas.width = W;
        this.canvas.height = H;
        const make = (cw, ch) => { const c = document.createElement('canvas'); c.width = cw; c.height = ch; return c; };
        this.sharp = make(W, H);
        const HW = Math.ceil(W / 2), HH = Math.ceil(H / 2);
        this.blurred = make(HW, HH);
        this.fogged = make(HW, HH);
        this.mask = make(HW, HH);
        this.beads = make(W, H);
        this.maskCtx = this.mask.getContext('2d');
        this.beadCtx = this.beads.getContext('2d');
        this.blur = Math.max(4, 2 * Math.round(4 * this.s));   // device px per blurred texel, even
        this.city = new RainyCity({
            kind: this.config.city, palette: this.config.palette, seed: this.seed,
            w, h, bottom: this.host.insets.bottom, hour: this.hour(),
        });
        const sc = this.sharp.getContext('2d');
        sc.setTransform(this.s, 0, 0, this.s, 0, 0);
        this.city.paint(sc, this.s);
        this.blurRegion(0, 0, W, H, false);
        this.builds++;
        this.seedScene();
    }

    // The city through condensation: the sharp layer shrunk by `blur` and
    // smoothed back up into the half-size blurred layer, then hazed. A
    // region (device px of the sharp layer) re-blurs just a window's
    // surroundings; it's aligned to the blur grid and keeps a margin, so a
    // patch matches the full build.
    blurRegion(x, y, w, h, patch = true) {
        const D = this.blur, W = this.sharp.width, H = this.sharp.height, M = 3;
        let pad = patch ? D * 6 : 0;
        const x0 = Math.max(0, Math.floor((x - pad) / D) * D), y0 = Math.max(0, Math.floor((y - pad) / D) * D);
        const x1 = Math.min(W, Math.ceil((x + w + pad) / D) * D), y1 = Math.min(H, Math.ceil((y + h + pad) / D) * D);
        const sw = Math.max(1, Math.ceil((x1 - x0) / D)), sh = Math.max(1, Math.ceil((y1 - y0) / D));
        const cw = sw + M * 2, ch = sh + M * 2;
        if (!this.small || this.small.width < cw || this.small.height < ch) {
            const grow = c => { const n = document.createElement('canvas'); n.width = Math.max(cw, c?.width || 0); n.height = Math.max(ch, c?.height || 0); return n; };
            this.small = grow(this.small);
            this.small2 = grow(this.small2);
        }
        const small = this.small.getContext('2d'), tmp = this.small2.getContext('2d');
        small.imageSmoothingQuality = 'high';
        small.globalCompositeOperation = 'source-over';
        small.clearRect(0, 0, cw, ch);
        small.drawImage(this.sharp, x0, y0, sw * D, sh * D, M, M, sw, sh);
        // Edges repeat outwards, so the blur doesn't darken the borders.
        const c = this.small;
        small.drawImage(c, M, M, 1, sh, 0, M, M, sh);
        small.drawImage(c, M + sw - 1, M, 1, sh, M + sw, M, M, sh);
        small.drawImage(c, 0, M, cw, 1, 0, 0, cw, M);
        small.drawImage(c, 0, M + sh - 1, cw, 1, 0, M + sh, cw, M);
        // A binomial blur on the small copy, across then down: each tap
        // added with its weight ('lighter' sums them), so it's a true
        // weighted average and the lights bloom into soft round blobs.
        const taps = [1, 6, 15, 20, 15, 6, 1].map(v => v / 64);
        const pass = (from, to, dx, dy) => {
            to.globalCompositeOperation = 'source-over';
            to.clearRect(0, 0, cw, ch);
            to.globalCompositeOperation = 'lighter';
            taps.forEach((weight, i) => {
                to.globalAlpha = weight;
                to.drawImage(from.canvas, 0, 0, cw, ch, (i - 3) * dx, (i - 3) * dy, cw, ch);
            });
            to.globalAlpha = 1;
            to.globalCompositeOperation = 'source-over';
        };
        pass(small, tmp, 1, 0);
        pass(tmp, small, 0, 1);
        const b = this.blurred.getContext('2d');
        b.save();
        if (patch) {
            pad = D * 4;
            b.beginPath();
            b.rect((x0 > 0 ? x0 + pad : 0) / 2, (y0 > 0 ? y0 + pad : 0) / 2,
                ((x1 < W ? x1 - pad : W) - (x0 > 0 ? x0 + pad : 0)) / 2, ((y1 < H ? y1 - pad : H) - (y0 > 0 ? y0 + pad : 0)) / 2);
            b.clip();
        }
        b.imageSmoothingQuality = 'high';
        b.drawImage(this.small, M, M, sw, sh, x0 / 2, y0 / 2, sw * D / 2, sh * D / 2);
        // Condensation scatters the city's light: lift and flatten it,
        // more towards the bottom of the pane.
        const bh = this.blurred.height;
        const haze = b.createLinearGradient(0, 0, 0, bh);
        haze.addColorStop(0, `rgba(${this.city.pal.haze},0.1)`);
        haze.addColorStop(1, `rgba(${this.city.pal.haze},0.2)`);
        b.fillStyle = haze;
        b.fillRect(x0 / 2, y0 / 2, (x1 - x0) / 2, (y1 - y0) / 2);
        b.restore();
    }

    // A window's light changed: repaint it on the sharp layer and re-blur
    // around it. Not a build.
    patchWindow(win) {
        const sc = this.sharp.getContext('2d');
        sc.setTransform(this.s, 0, 0, this.s, 0, 0);
        this.city.paintWindow(sc, win);
        sc.setTransform(1, 0, 0, 1, 0, 0);
        this.blurRegion(win.x * this.s - 1, win.y * this.s - 1, win.w * this.s + 2, win.h * this.s + 2);
        this.patches++;
    }

    // ---- Sprites ------------------------------------------------------------------

    bakeSprites() {
        const sprite = (size, draw) => {
            const c = document.createElement('canvas');
            c.width = c.height = size;
            draw(c.getContext('2d'), size / 2);
            return c;
        };
        // The rim of a drop: dark where the glass bends light away, a bright
        // fleck of the street below, a highlight up top.
        this.rim = sprite(96, (g, c) => {
            const ring = g.createRadialGradient(c, c, 0, c, c, c);
            ring.addColorStop(0, 'rgba(0,0,0,0)');
            ring.addColorStop(0.7, 'rgba(0,0,0,0)');
            ring.addColorStop(0.85, 'rgba(0,0,0,0.14)');
            ring.addColorStop(0.91, 'rgba(0,0,0,0.32)');
            ring.addColorStop(0.97, 'rgba(0,0,0,0.08)');
            ring.addColorStop(1, 'rgba(0,0,0,0)');
            g.fillStyle = ring;
            g.fillRect(0, 0, c * 2, c * 2);
            const spot = (x, y, r, a) => {
                const s = g.createRadialGradient(x, y, 0, x, y, r);
                s.addColorStop(0, `rgba(255,255,255,${a})`);
                s.addColorStop(1, 'rgba(255,255,255,0)');
                g.fillStyle = s;
                g.fillRect(x - r, y - r, r * 2, r * 2);
            };
            spot(c * 0.72, c * 0.6, c * 0.2, 0.75);
            spot(c * 0.78, c * 0.62, c * 0.07, 0.9);
            g.strokeStyle = 'rgba(255,240,220,0.4)';
            g.lineWidth = c * 0.09;
            g.beginPath();
            g.arc(c, c, c * 0.74, Math.PI * 0.15, Math.PI * 0.85);
            g.stroke();
        });
        // A bead: a tiny droplet that never runs.
        this.bead = [0.5, 0.75, 1].map(k => sprite(24, (g, c) => {
            const ring = g.createRadialGradient(c, c * 1.1, 0, c, c * 1.1, c);
            ring.addColorStop(0, `rgba(255,236,210,${0.16 * k})`);
            ring.addColorStop(0.55, `rgba(255,236,210,${0.07 * k})`);
            ring.addColorStop(0.8, `rgba(0,0,0,${0.18 * k})`);
            ring.addColorStop(1, 'rgba(0,0,0,0)');
            g.fillStyle = ring;
            g.fillRect(0, 0, c * 2, c * 2);
            g.fillStyle = `rgba(255,250,240,${0.55 * k})`;
            g.beginPath();
            g.arc(c * 0.8, c * 0.66, c * 0.16, 0, Math.PI * 2);
            g.fill();
        }));
        // Brushes for the mask and the bead layer: soft-edged discs.
        this.brush = sprite(64, (g, c) => {
            const d = g.createRadialGradient(c, c, 0, c, c, c);
            d.addColorStop(0, 'rgba(255,255,255,1)');
            d.addColorStop(0.6, 'rgba(255,255,255,0.9)');
            d.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = d;
            g.fillRect(0, 0, c * 2, c * 2);
        });
        // Lights: a small sharp glow and a wide soft one per colour, and a
        // reflection streak for the wet street.
        const glow = (rgb, hard) => sprite(64, (g, c) => {
            const d = g.createRadialGradient(c, c, 0, c, c, c);
            d.addColorStop(0, hard ? 'rgba(255,255,255,1)' : `rgba(${rgb},0.9)`);
            d.addColorStop(hard ? 0.12 : 0.2, `rgba(${rgb},${hard ? 0.9 : 0.4})`);
            d.addColorStop(hard ? 0.35 : 0.55, `rgba(${rgb},${hard ? 0.25 : 0.12})`);
            d.addColorStop(1, `rgba(${rgb},0)`);
            g.fillStyle = d;
            g.fillRect(0, 0, c * 2, c * 2);
        });
        const streak = rgb => sprite(32, (g, c) => {
            const d = g.createLinearGradient(0, 0, 0, c * 2);
            d.addColorStop(0, `rgba(${rgb},0.5)`);
            d.addColorStop(1, `rgba(${rgb},0)`);
            g.fillStyle = d;
            g.beginPath();
            g.ellipse(c, c, c * 0.3, c, 0, 0, Math.PI * 2);
            g.fill();
        });
        const colours = { head: '255,236,200', tail: '255,46,36', red: '255,50,40', white: '235,245,255', green: '80,255,140' };
        this.lights = {};
        for (const [name, rgb] of Object.entries(colours)) this.lights[name] = { hard: glow(rgb, true), soft: glow(rgb, false), streak: streak(rgb) };
    }

    // ---- The scene ------------------------------------------------------------------

    hour() {
        const now = this.host.now();
        return now.getHours() + now.getMinutes() / 60;
    }

    // The size a drop runs at, in CSS px.
    get slideRadius() {
        return 9 * this.config.dropSize;
    }

    area() {
        return Math.max(0.3, Math.min(2.5, this.w * this.h / 1e6));
    }

    maxDrops() {
        return Math.round((90 + 300 * this.config.rain) * this.host.quality.density * this.area());
    }

    // The glass has been in the rain a while: beads, drops, a few old
    // trails half fogged over, and traffic already on the road.
    seedScene() {
        this.drops.length = 0;
        const rs = this.slideRadius;
        for (let i = 0, n = Math.round(this.maxDrops() * 0.75); i < n; i++) {
            const d = this.spawn(Math.random() * this.w, Math.random() * this.h, rs * (0.25 + 0.72 * Math.pow(Math.random(), 1.2)));
            if (Math.random() < 0.06) { d.r = rs * (1.1 + Math.random() * 0.5); d.sliding = true; d.v = 40; }
        }
        for (let i = 0, n = Math.round(this.beadRate() * 40); i < n; i++) this.addBead(Math.random() * this.w, Math.random() * this.h, 0.4 + Math.random() * 1.4);
        const m = this.maskCtx;
        m.clearRect(0, 0, this.mask.width, this.mask.height);
        for (let i = 0, n = 2 + Math.round(this.w / 320); i < n; i++) {
            let x = Math.random() * this.w, y = Math.random() * this.h * 0.7;
            const r = rs * (0.5 + Math.random() * 0.5), age = Math.random();
            while (y < this.h) {
                const ny = y + 3, nx = x + (Math.random() - 0.5) * 1.6;
                this.clearPath(x, y, nx, ny, r, (0.25 + 0.5 * (y / this.h)) * (1 - age * 0.6), r);
                x = nx; y = ny;
            }
        }
        this.cars.length = 0;
        for (let i = 0, n = Math.round(6 * this.config.traffic); i < n; i++) this.addCar(Math.random());
        this.time = 0;
        this.planeAt = 8 + Math.random() * 20;
    }

    beadRate() {
        return 70 * this.config.rain * this.host.quality.density * this.area();
    }

    addBead(x, y, r) {
        const s = this.s, size = r * 2 * s * 1.2;
        this.beadCtx.globalCompositeOperation = 'source-over';
        this.beadCtx.drawImage(this.bead[Math.floor(Math.random() * 3)], x * s - size / 2, y * s - size / 2, size, size);
    }

    spawn(x, y, r) {
        const d = this.pool.pop() || {};
        Object.assign(d, { x, y, r, sliding: false, v: 0, stall: 0, dir: 0, turn: 0, trail: 0, px: x, py: y });
        this.drops.push(d);
        return d;
    }

    // Clear the fog along a segment (CSS px), and wipe the beads under a
    // running drop.
    clearPath(x0, y0, x1, y1, radius, alpha, wipe = 0) {
        const len = Math.hypot(x1 - x0, y1 - y0), step = Math.max(1, radius * 0.45);
        const n = Math.max(1, Math.ceil(len / step));
        const ms = this.s / 2, m = this.maskCtx, b = this.beadCtx;
        const mr = radius * ms * 2, br = wipe * this.s * 2;
        m.globalAlpha = alpha;
        if (wipe) b.globalCompositeOperation = 'destination-out';
        for (let i = 1; i <= n; i++) {
            const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n;
            if (alpha > 0) m.drawImage(this.brush, x * ms - mr / 2, y * ms - mr / 2, mr, mr);
            if (wipe) b.drawImage(this.brush, x * this.s - br / 2, y * this.s - br / 2, br, br);
        }
        m.globalAlpha = 1;
        if (wipe) b.globalCompositeOperation = 'source-over';
    }

    // A finger in the fog. Now and then condensation gathers at the line
    // and a drip runs down from it.
    touch(x, y, first) {
        if (!this.config.fingerDrawing) return;
        const from = first || !this.finger ? { x, y } : this.finger;
        if (this.fogFade > 0) this.clearPath(from.x, from.y, x, y, 15, 1);
        const dist = Math.hypot(x - from.x, y - from.y);
        if (Math.random() < dist / 160) {
            const d = this.spawn(x + (Math.random() - 0.5) * 10, y + 12, this.slideRadius * 1.08);
            d.sliding = true;
        }
        this.finger = { x, y };
    }

    // The W key: a sleeve across the glass, a broad arc through the middle.
    wipe() {
        const r = Math.min(this.w, this.h) * 0.14, y = this.h * 0.42;
        let px = -r, py = y + r;
        for (let x = -r; x <= this.w + r; x += r * 0.3) {
            const ny = y + Math.sin((x / this.w) * Math.PI) * -r * 0.8 + r * 0.6;
            this.clearPath(px, py, x, ny, r, this.fogFade > 0 ? 1 : 0, r * 0.6);
            px = x; py = ny;
        }
    }

    // The fog closes back over clear glass, a few percent at a time.
    // Each step takes 7% off the mask; fogReturn seconds take 48 of them
    // to bring it under 3%.
    regrow(steps) {
        if (steps <= 0) return;
        const m = this.maskCtx;
        m.globalCompositeOperation = 'destination-out';
        m.globalAlpha = 1 - Math.pow(0.93, steps);
        m.fillRect(0, 0, this.mask.width, this.mask.height);
        m.globalCompositeOperation = 'source-over';
        m.globalAlpha = 1;
        // Beads evaporate as slowly, so the glass never silts up.
        const b = this.beadCtx;
        b.globalCompositeOperation = 'destination-out';
        b.globalAlpha = 1 - Math.pow(0.975, steps);
        b.fillRect(0, 0, this.beads.width, this.beads.height);
        b.globalCompositeOperation = 'source-over';
        b.globalAlpha = 1;
    }

    // Test hook: run the fog's clock forward (smoke uses it to see a line
    // fog over without waiting a minute). The same steps the frames take.
    advanceFog(seconds) {
        const per = this.config.fogReturn / 48;
        for (let i = 0; i < Math.floor(seconds / per); i++) this.regrow(1);
    }

    // Test hook: how clear the glass is at a point, 0 (fogged) to 1.
    clearness(x, y) {
        const ms = this.s / 2;
        return this.maskCtx.getImageData(Math.floor(x * ms), Math.floor(y * ms), 1, 1).data[3] / 255;
    }

    litCount() {
        return this.city.windows.filter(w => w.lit).length;
    }

    // ---- Window lights -------------------------------------------------------------

    // A slow pattern: every second or so one window re-rolls whether it's
    // a night owl; every 15 s the share for the hour is checked, and a few
    // windows that disagree switch, so the evening fades in and out.
    updateLights(dt) {
        const windows = this.city.windows;
        if (!windows.length) return;
        const share = RainyCity.litShare(this.hour());
        this.lightClock -= dt;
        if (this.lightClock <= 0) {
            this.lightClock = 0.6 + Math.random() * 1.2;
            const win = windows[Math.floor(Math.random() * windows.length)];
            win.u = Math.random();
            if ((win.u < share) !== win.lit) { win.lit = !win.lit; this.patchWindow(win); }
        }
        this.scanClock -= dt;
        if (this.scanClock <= 0) {
            this.scanClock = 15;
            let budget = 4;
            for (const win of windows) {
                if ((win.u < share) === win.lit) continue;
                win.lit = !win.lit;
                this.patchWindow(win);
                if (--budget <= 0) break;
            }
        }
    }

    // ---- Traffic, beacons, a plane, a boat -----------------------------------------

    addCar(at = null) {
        const roads = this.city.roads;
        if (!roads.length) return;
        const road = roads[Math.floor(Math.random() * roads.length)];
        const dir = road.dir || (Math.random() < 0.5 ? 1 : -1);
        const pts = road.points, len = pts.reduce((a, p, i) => i ? a + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0, 0);
        this.cars.push({ road, dir, len, t: at === null ? (dir > 0 ? 0 : len) : at * len, speed: (40 + Math.random() * 50) * road.scale + 10 });
    }

    roadPoint(road, t) {
        const pts = road.points;
        for (let i = 1; i < pts.length; i++) {
            const a = pts[i - 1], b = pts[i], seg = Math.hypot(b.x - a.x, b.y - a.y);
            if (t <= seg) return { x: a.x + (b.x - a.x) * t / seg, y: a.y + (b.y - a.y) * t / seg };
            t -= seg;
        }
        return pts[pts.length - 1];
    }

    updateTraffic(dt) {
        for (let i = this.cars.length - 1; i >= 0; i--) {
            const car = this.cars[i];
            car.t += car.dir * car.speed * dt;
            if (car.t < -20 || car.t > car.len + 20) this.cars.splice(i, 1);
        }
        const want = 6 * this.config.traffic;
        if (this.cars.length < want && Math.random() < dt * 0.6 * want / 6) this.addCar();
        this.planeAt -= dt;
        if (!this.plane && this.planeAt <= 0) {
            const dir = Math.random() < 0.5 ? 1 : -1;
            this.plane = { x: dir > 0 ? -20 : this.w + 20, y: this.city.horizon * (0.12 + Math.random() * 0.3), dir, speed: this.w / (35 + Math.random() * 25), t: 0 };
        }
        if (this.plane) {
            this.plane.x += this.plane.dir * this.plane.speed * dt;
            this.plane.y -= dt * 1.5;
            this.plane.t += dt;
            if (this.plane.x < -40 || this.plane.x > this.w + 40) { this.plane = null; this.planeAt = 40 + Math.random() * 60; }
        }
        if (this.city.water) {
            if (!this.boat && Math.random() < dt / 30) {
                const dir = Math.random() < 0.5 ? 1 : -1;
                this.boat = { x: dir > 0 ? -30 : this.w + 30, dir, speed: 8 + Math.random() * 8 };
            }
            if (this.boat) {
                this.boat.x += this.boat.dir * this.boat.speed * dt;
                if (this.boat.x < -40 || this.boat.x > this.w + 40) this.boat = null;
            }
        }
    }

    // The moving lights, sharp (soft = false) on the clear view, or as wide
    // soft glows through the fog. Additive.
    drawLights(ctx, k, soft) {
        const L = this.lights, t = this.time;
        ctx.globalCompositeOperation = 'lighter';
        const dot = (light, x, y, r, a = 1) => {
            if (a <= 0.01) return;
            const sprite = soft ? light.soft : light.hard, rr = (soft ? r * 5 : r) * k;
            ctx.globalAlpha = Math.min(1, soft ? a * 0.45 : a);
            ctx.drawImage(sprite, x * k - rr, y * k - rr, rr * 2, rr * 2);
        };
        const wet = this.city.kind === 'downtown';
        for (const car of this.cars) {
            const p = this.roadPoint(car.road, Math.max(0, Math.min(car.len, car.t)));
            const sc = car.road.scale, front = p.x + car.dir * 10 * sc, back = p.x - car.dir * 10 * sc;
            dot(L.head, front, p.y, 6 * sc);
            dot(L.tail, back, p.y, 4 * sc, 0.8);
            if (wet && !soft) {
                ctx.globalAlpha = 0.5;
                ctx.drawImage(L.head.streak, (front - 3 * sc) * k, (p.y + 2) * k, 6 * sc * k, 34 * sc * k);
                ctx.drawImage(L.tail.streak, (back - 2 * sc) * k, (p.y + 2) * k, 4 * sc * k, 24 * sc * k);
            }
        }
        for (const b of this.city.beacons) {
            const phase = ((t / b.period + b.phase) % 1);
            dot(L.red, b.x, b.y, 4, Math.max(0, Math.sin(phase * Math.PI * 2)) ** 3);
        }
        if (this.plane) {
            const p = this.plane, strobe = (p.t % 1.4) < 0.08 || ((p.t - 0.2) % 1.4 + 1.4) % 1.4 < 0.06;
            dot(L.white, p.x, p.y, 5, strobe ? 1 : 0);
            dot(L.red, p.x - p.dir * 6, p.y + 1, 2.4, 0.7);
            dot(L.green, p.x + p.dir * 6, p.y + 1, 2.4, 0.7);
            dot(L.red, p.x, p.y + 2, 3.5, Math.max(0, Math.sin(p.t * 4)) ** 4);
        }
        if (this.boat) {
            const y = this.city.boatLane, b = this.boat;
            dot(L.head, b.x, y - 9, 3);
            dot(L.green, b.x + 4, y - 3, 2.2);
            dot(L.red, b.x - 4, y - 3, 2.2);
            if (!soft) {
                ctx.globalAlpha = 0.35;
                ctx.drawImage(L.head.streak, (b.x - 2) * k, y * k, 4 * k, 40 * k);
            }
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
    }

    // ---- Drops ------------------------------------------------------------------------

    updateDrops(dt) {
        const rs = this.slideRadius, fog = this.fogFade > 0;
        // Rain arrives: new drops, merging into any they land on, and beads.
        const want = this.maxDrops();
        this.spawnDebt = (this.spawnDebt || 0) + dt * this.config.rain * 26 * this.host.quality.density * this.area();
        while (this.spawnDebt >= 1) {
            this.spawnDebt--;
            const x = Math.random() * this.w, y = Math.random() * this.h, r = rs * (0.22 + 0.6 * Math.pow(Math.random(), 1.4));
            const hit = this.drops.find(d => !d.sliding && Math.abs(d.x - x) < d.r + r && Math.abs(d.y - y) < d.r + r);
            if (hit) {
                hit.r = Math.cbrt(hit.r ** 3 + r ** 3);
                if (hit.r > rs) { hit.sliding = true; hit.v = 0; }
            } else if (this.drops.length < want) this.spawn(x, y, r);
            else this.addBead(x, y, r * 0.5);
        }
        this.beadDebt = (this.beadDebt || 0) + dt * this.beadRate();
        while (this.beadDebt >= 1) {
            this.beadDebt--;
            this.addBead(Math.random() * this.w, Math.random() * this.h, 0.35 + Math.random() * Math.random() * 1.6);
        }

        // Run: heavier drops faster, in fits and starts, wandering a little,
        // shedding beads behind them and losing weight until they stick.
        for (const d of this.drops) {
            d.px = d.x; d.py = d.y;
            if (!d.sliding) continue;
            const excess = d.r / rs;
            if (d.stall > 0) d.stall -= dt;
            else {
                const target = Math.min(420, 16 + 75 * Math.max(0, excess - 0.85) * excess * excess);
                d.v += (target - d.v) * Math.min(1, dt * 5);
                if (excess < 1.6 && Math.random() < dt * 0.7) { d.stall = 0.1 + Math.random() * 0.45; d.v *= 0.2; }
            }
            const move = d.stall > 0 ? 0 : d.v * dt;
            d.turn -= move;
            if (d.turn <= 0) { d.turn = 10 + Math.random() * 40; d.dir = (Math.random() - 0.5) * 0.5; }
            d.y += move;
            d.x += d.dir * move;
            d.trail -= move;
            if (d.trail <= 0) {
                d.trail = d.r * (1.4 + Math.random() * 1.6);
                const rb = d.r * (0.2 + Math.random() * 0.22);
                this.addBead(d.x - d.dir * d.r + (Math.random() - 0.5) * d.r * 0.4, d.y - d.r * 1.3, rb);
                d.r = Math.cbrt(Math.max(0, d.r ** 3 - rb ** 3 * 0.9));
            }
            if (move > 0) this.clearPath(d.px, d.py - d.r * 0.5, d.x, d.y, d.r * 0.85, fog ? 0.8 : 0, d.r * 0.9);
            if (d.r < rs * 0.72) { d.sliding = false; d.v = 0; }
        }

        // Merge: a running drop swallows any drop it touches and speeds up.
        const cell = Math.max(12, rs * 3), grid = new Map();
        for (const d of this.drops) {
            const key = Math.floor(d.x / cell) + Math.floor(d.y / cell) * 4096;
            (grid.get(key) || grid.set(key, []).get(key)).push(d);
        }
        for (const d of this.drops) {
            if (!d.sliding || d.dead) continue;
            const cx = Math.floor(d.x / cell), cy = Math.floor(d.y / cell);
            for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
                for (const o of grid.get(cx + ox + (cy + oy) * 4096) || []) {
                    if (o === d || o.dead) continue;
                    const dx = o.x - d.x, dy = o.y - d.y, reach = (d.r + o.r) * 0.85;
                    if (dx * dx + dy * dy > reach * reach) continue;
                    const m1 = d.r ** 3, m2 = o.r ** 3;
                    d.x = (d.x * m1 + o.x * m2) / (m1 + m2);
                    d.y = Math.max(d.y, o.y);
                    d.r = Math.cbrt(m1 + m2);
                    d.v = Math.max(d.v, o.v) + 20;
                    d.stall = 0;
                    o.dead = true;
                }
            }
        }
        // Off the bottom, or swallowed: back to the pool.
        for (let i = this.drops.length - 1; i >= 0; i--) {
            const d = this.drops[i];
            if (d.dead || d.y - d.r > this.h + 4) {
                d.dead = false;
                this.pool.push(d);
                this.drops[i] = this.drops[this.drops.length - 1];
                this.drops.pop();
            }
        }
    }

    drawDrops(ctx) {
        const s = this.s, W = this.sharp.width, H = this.sharp.height;
        const lift = `rgba(${this.city.pal.glow},0.13)`;
        for (const d of this.drops) {
            const rx = d.r * s * (d.sliding ? 0.92 : 1), ry = d.r * s * (d.sliding ? 1.12 : 0.96);
            const cx = d.x * s, cy = d.y * s;
            if (rx < 2.2) {
                const size = rx * 2.6;
                ctx.drawImage(this.bead[2], cx - size / 2, cy - size / 2, size, size);
                continue;
            }
            // A drop is a little lens: the city behind, wider and upside down.
            const span = rx * 16, sh = span * 1.1;
            const sx = Math.max(0, Math.min(W - span, cx - span / 2)), sy = Math.max(0, Math.min(H - sh, cy - sh * 0.62));
            ctx.save();
            ctx.beginPath();
            ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
            ctx.clip();
            ctx.translate(cx, cy);
            ctx.scale(-1, -1);
            ctx.drawImage(this.sharp, sx, sy, span, sh, -rx, -ry, rx * 2, ry * 2);
            // Water gathers light: a drop is always a little brighter
            // than the glass around it.
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = lift;
            ctx.fillRect(-rx, -ry, rx * 2, ry * 2);
            ctx.restore();
            ctx.drawImage(this.rim, cx - rx * 1.1, cy - ry * 1.1, rx * 2.2, ry * 2.2);
        }
    }

    // ---- Frame -------------------------------------------------------------------------

    tick(now) {
        if (!this.running) return;
        this.frame = requestAnimationFrame(t => this.tick(t));
        const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
        this.last = now;
        this.time += dt;
        this.fogFade = Math.max(0, Math.min(1, this.fogFade + (this.wants('fog') ? dt : -dt) / 1.5));

        this.regrowClock += dt;
        const per = this.config.fogReturn / 48;
        if (this.regrowClock >= per) {
            const steps = Math.floor(this.regrowClock / per);
            this.regrowClock -= steps * per;
            this.regrow(steps);
        }
        this.updateLights(dt);
        this.updateTraffic(dt);
        this.updateDrops(dt);
        this.draw();
    }

    draw() {
        const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height, s = this.s;
        const fog = this.config.fog * this.fogFade, soft = 1 - this.fogFade;
        if (soft < 1) {
            ctx.drawImage(this.sharp, 0, 0);
            this.drawLights(ctx, s, false);
        }
        if (fog > 0) {
            const f = this.fogged.getContext('2d');
            f.globalCompositeOperation = 'source-over';
            f.drawImage(this.blurred, 0, 0);
            this.drawLights(f, s / 2, true);
            f.globalCompositeOperation = 'destination-out';
            f.drawImage(this.mask, 0, 0);
            f.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = fog;
            ctx.drawImage(this.fogged, 0, 0, W, H);
            ctx.globalAlpha = 1;
        }
        if (soft > 0) {
            // Low: no fog, just a softened city.
            ctx.globalAlpha = soft;
            ctx.drawImage(this.blurred, 0, 0, W, H);
            ctx.globalAlpha = 1;
            this.drawLights(ctx, s, true);
        }
        ctx.drawImage(this.beads, 0, 0);
        this.drawDrops(ctx);
    }
}
