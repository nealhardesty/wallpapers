// Fireworks (SPEC §10.17): a show over a dark skyline and a lake.
//
// The running order comes from FireworksShow (fireworks-show.js). Here:
// shells rise on a spark trail and burst into one of eight shell types;
// every star is a pooled particle that keeps a short history, drawn as a
// fading polyline (batched by colour and age into a few Path2D strokes),
// so the sky behind stays visible and the cost is per particle. Bursts
// light the sky, light up the smoke left by earlier ones (effect `smoke`),
// and the lake reflects everything above it from a half-size flipped copy,
// drawn in rippling strips. The sky, skyline and lake are one cached layer.
//
// Modes: auto (a show with a finale every showMinutes), tap (silent until
// tapped), newyear (tap all year, then a countdown from 23:59:50 on
// 31 December by host.now(), the year written in stars at midnight, and a
// show). A tap launches a shell in every mode.

class FireworksAnimationManager {
    static PALETTES = {
        classic: ['255,72,72', '255,190,60', '90,255,120', '90,160,255', '200,110,255', '255,255,255', '255,120,200'],
        gold: ['255,200,90', '255,228,160', '255,170,60', '235,238,255', '255,242,210'],
        jewel: ['50,120,255', '30,225,150', '235,40,95', '170,70,255', '255,190,40'],
        pastel: ['255,170,205', '170,220,255', '200,255,205', '255,240,170', '222,192,255'],
        neon: ['255,40,200', '40,255,240', '190,255,40', '255,120,30', '140,80,255'],
    };
    static SPECIAL = { gold: '255,186,80', silver: '232,236,255', white: '255,255,255', ember: '255,120,50' };
    static TRAIL_HZ = 30;
    static HISTORY = 30;      // trail points kept per particle (1 s at 30 Hz)

    constructor(host) {
        this.host = host;
        this.config = WP.settings.load();
        this.show = new FireworksShow(this.showOptions());
        this.parts = [];
        this.free = [];
        this.shells = [];
        this.queue = [];
        this.puffs = [];
        this.flashes = [];
        this.digits = new Map();
        this.clock = 0;           // the auto show's timeline, s
        this.launched = 0;        // shells the show (not taps) sent up
        this.tapped = 0;
        this.countdown = 0;
        this.celebrating = false;
        this.yearFired = null;
        this.smokeFade = this.smokeWanted();
        this.wind = (Math.random() - 0.5) * 0.04;
        this.running = false;
    }

    showOptions() {
        const c = this.config;
        return { showMinutes: c.showMinutes, intensity: c.intensity, types: c.burstTypes };
    }

    // ---- Lifecycle ------------------------------------------------------------

    start() {
        if (this.running) return;
        this.running = true;
        const canvas = this.canvas = document.createElement('canvas');
        Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: '-1', pointerEvents: 'none' });
        document.body.appendChild(canvas);
        this.ctx = canvas.getContext('2d');
        this.bakeColours();
        this.onResize = () => this.resize();
        window.addEventListener('resize', this.onResize);
        this.resize();
        this.stopGestures = this.host.gestures({ tap: (x, y) => this.config.tapToLaunch && this.tapLaunch(x, y) });
        // Look alive: an automatic show starts mid-flow, with a few bursts
        // already open and more on the way.
        if (this.config.mode === 'auto') {
            this.clock = 60 + Math.random() * 60;
            for (let i = 0; i < 3; i++) {
                const shell = this.makeShell({ type: this.show.pick(this.show.types), x: 0.2 + 0.6 * Math.random(), height: 0.4 + 0.5 * Math.random(), colour: Math.random() });
                shell.y = shell.ty;
                this.burst(shell);
                this.advance(0.35 + i * 0.3);
            }
        }
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
        if (config.mode !== old.mode) this.show.nextAt = null;
        if (['showMinutes', 'intensity', 'burstTypes'].some(k => JSON.stringify(config[k]) !== JSON.stringify(old[k]))) {
            Object.assign(this.show, new FireworksShow(this.showOptions()), { nextAt: this.show.nextAt });
        }
        if (config.palette !== old.palette) this.bakeColours();
        if (config.scene !== old.scene) this.resize();
    }

    onQuality(quality) {
        this.host.quality = quality;   // caps and counts follow it from the next burst
    }

    smokeWanted() {
        return this.config.smoke && this.host.quality.effects.includes('smoke') ? 1 : 0;
    }

    cap() {
        return Math.round(2600 * this.host.quality.density);
    }

    // ---- Colours and sprites ------------------------------------------------------

    sprite(size, draw) {
        const c = document.createElement('canvas');
        c.width = c.height = size;
        draw(c.getContext('2d'), size / 2);
        return c;
    }

    bakeColours() {
        const palette = FireworksAnimationManager.PALETTES[this.config.palette] || FireworksAnimationManager.PALETTES.classic;
        const special = FireworksAnimationManager.SPECIAL;
        this.colours = [...palette, special.gold, special.silver, special.white, special.ember];
        this.paletteSize = palette.length;
        this.special = { gold: palette.length, silver: palette.length + 1, white: palette.length + 2, ember: palette.length + 3 };
        this.strokes = this.colours.map(rgb => `rgb(${rgb})`);
        this.glows = this.colours.map(rgb => this.sprite(32, (g, c) => {
            const d = g.createRadialGradient(c, c, 0, c, c, c);
            d.addColorStop(0, 'rgba(255,255,255,1)');
            d.addColorStop(0.15, `rgba(${rgb},0.95)`);
            d.addColorStop(0.4, `rgba(${rgb},0.3)`);
            d.addColorStop(1, `rgba(${rgb},0)`);
            g.fillStyle = d;
            g.fillRect(0, 0, c * 2, c * 2);
        }));
        this.halos = this.colours.map(rgb => this.sprite(64, (g, c) => {
            const d = g.createRadialGradient(c, c, 0, c, c, c);
            d.addColorStop(0, `rgba(${rgb},0.5)`);
            d.addColorStop(0.35, `rgba(${rgb},0.16)`);
            d.addColorStop(1, `rgba(${rgb},0)`);
            g.fillStyle = d;
            g.fillRect(0, 0, c * 2, c * 2);
        }));
        this.puffSprite = this.sprite(64, (g, c) => {
            const d = g.createRadialGradient(c, c, 0, c, c, c);
            d.addColorStop(0, 'rgba(150,150,165,0.5)');
            d.addColorStop(0.5, 'rgba(130,130,145,0.22)');
            d.addColorStop(1, 'rgba(120,120,135,0)');
            g.fillStyle = d;
            g.fillRect(0, 0, c * 2, c * 2);
        });
        this.digits.clear();
    }

    // ---- The scene ------------------------------------------------------------------

    resize() {
        const s = window.devicePixelRatio || 1, w = innerWidth, h = innerHeight;
        const W = Math.max(1, Math.round(w * s)), H = Math.max(1, Math.round(h * s));
        this.w = w; this.h = h; this.s = W / w;
        this.canvas.width = W;
        this.canvas.height = H;
        this.U = Math.min(w, h * 1.1);
        this.lake = Math.round(Math.max(60, h * (w > h ? 0.2 : 0.17)));
        this.horizon = h - this.host.insets.bottom - this.lake;
        this.lakeBottom = h;
        this.bg = this.paintScene();
        this.refl = document.createElement('canvas');
        this.refl.width = Math.max(1, Math.round(W / 2));
        this.refl.height = Math.max(1, Math.round(this.horizon * this.s / 2));
    }

    // Sky, stars, hills or a generic skyline, and a still lake: one layer.
    paintScene() {
        const { w, h, s } = this, horizon = this.horizon;
        const c = document.createElement('canvas');
        c.width = this.canvas.width;
        c.height = this.canvas.height;
        const g = c.getContext('2d');
        g.setTransform(s, 0, 0, s, 0, 0);
        const rand = WP.seededRandom(31);
        const sky = g.createLinearGradient(0, 0, 0, horizon);
        sky.addColorStop(0, '#03040c');
        sky.addColorStop(0.6, '#0a0e22');
        sky.addColorStop(1, '#1d1a33');
        g.fillStyle = sky;
        g.fillRect(0, 0, w, horizon);
        const glow = g.createRadialGradient(w / 2, horizon, 0, w / 2, horizon, w * 0.7);
        glow.addColorStop(0, 'rgba(255,150,90,0.12)');
        glow.addColorStop(1, 'rgba(255,150,90,0)');
        g.fillStyle = glow;
        g.fillRect(0, 0, w, horizon);
        for (let i = 0; i < w * horizon / 2600; i++) {
            const y = Math.pow(rand(), 1.4) * horizon * 0.85;
            g.fillStyle = `rgba(220,225,255,${0.15 + rand() * 0.5 * (1 - y / horizon)})`;
            g.fillRect(rand() * w, y, rand() < 0.1 ? 1.6 : 1, rand() < 0.1 ? 1.6 : 1);
        }
        // Far hills.
        g.fillStyle = '#0c0d1c';
        g.beginPath();
        g.moveTo(0, horizon);
        const ph = rand() * 9;
        for (let x = 0; x <= w + 10; x += 10) g.lineTo(x, horizon - h * 0.04 - h * 0.025 * Math.sin(x / (w * 0.13) + ph) - h * 0.015 * Math.sin(x / (w * 0.05) + ph * 2));
        g.lineTo(w, horizon);
        g.fill();
        if (this.config.scene === 'hills') this.paintTrees(g, rand);
        else this.paintSkyline(g, rand);
        // The lake, still and dark; the show's reflection is drawn live.
        const lake = g.createLinearGradient(0, horizon, 0, h);
        lake.addColorStop(0, '#0b0d1e');
        lake.addColorStop(1, '#030409');
        g.fillStyle = lake;
        g.fillRect(0, horizon, w, h - horizon);
        g.fillStyle = 'rgba(255,190,140,0.12)';
        g.fillRect(0, horizon, w, 1);
        return c;
    }

    paintSkyline(g, rand) {
        const { w, h } = this, horizon = this.horizon, top = h * 0.16;
        for (const layer of [0, 1]) {
            for (let x = -10; x < w;) {
                const bw = (layer ? 22 : 14) + rand() * (layer ? 46 : 26);
                const centre = 1 - Math.abs(x / w - 0.5) * 1.4;
                const bh = (layer ? 0.25 : 0.4) * top + rand() * top * (layer ? 0.75 : 0.8) * Math.max(0.25, centre);
                g.fillStyle = layer ? '#070811' : '#0d0f1e';
                g.fillRect(x, horizon - bh, bw, bh);
                if (layer && rand() < 0.15) g.fillRect(x + bw / 2 - 0.6, horizon - bh - 12, 1.2, 12);
                for (let wy = horizon - bh + 4; wy < horizon - 3; wy += 5) {
                    for (let wx = x + 3; wx < x + bw - 3; wx += 4.5) {
                        if (rand() < (layer ? 0.16 : 0.07)) {
                            g.fillStyle = `rgba(255,${190 + rand() * 50},${110 + rand() * 60},${layer ? 0.55 : 0.3})`;
                            g.fillRect(wx, wy, 1.6, 2);
                        }
                    }
                }
                x += bw + (rand() < 0.25 ? rand() * 8 : 0);
            }
        }
    }

    paintTrees(g, rand) {
        const { w, h } = this, horizon = this.horizon;
        g.fillStyle = '#05060d';
        g.beginPath();
        g.moveTo(0, horizon);
        for (let x = 0; x <= w + 8; x += 8) g.lineTo(x, horizon - h * 0.02 - h * 0.015 * Math.sin(x / 90));
        g.lineTo(w, horizon);
        g.fill();
        for (let x = 0; x < w; x += 4 + rand() * 9) {
            const th = h * (0.025 + rand() * 0.05), base = horizon - h * 0.015;
            g.beginPath();
            g.moveTo(x - th * 0.22, base);
            g.lineTo(x, base - th);
            g.lineTo(x + th * 0.22, base);
            g.fill();
        }
        for (let i = 0; i < 6; i++) {
            g.fillStyle = 'rgba(255,200,120,0.5)';
            g.fillRect(rand() * w, horizon - 2 - rand() * h * 0.015, 1.5, 1.5);
            g.fillStyle = '#05060d';
        }
    }

    // ---- Particles -----------------------------------------------------------------

    take() {
        if (this.parts.length >= this.cap()) return null;
        const p = this.free.pop() || { hist: new Float32Array(FireworksAnimationManager.HISTORY * 2) };
        p.hn = 0; p.hi = 0; p.ht = 0; p.age = 0; p.split = 0; p.kind = 0; p.flicker = 0; p.g = this.U * 0.3;
        this.parts.push(p);
        return p;
    }

    star(x, y, vx, vy, col, life, drag, trail, size) {
        const p = this.take();
        if (!p) return null;
        p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.col = col; p.life = life; p.drag = drag; p.trail = trail; p.size = size;
        return p;
    }

    // Stars a burst may still add, at this tier and intensity.
    budget(n) {
        const q = this.host.quality.density, k = (0.45 + 0.55 * q) * (0.75 + 0.25 * Math.min(2, this.config.intensity));
        return Math.max(4, Math.min(Math.round(n * k), this.cap() - this.parts.length));
    }

    makeShell({ type, x, height, colour }, at = null) {
        const { w } = this, U = this.U;
        const sx = at ? at.x : w * (0.08 + 0.84 * x);
        const top = this.h * 0.08, low = Math.max(top + 40, this.horizon - this.h * 0.3);
        const ty = at ? Math.min(at.y, this.horizon - 30) : low - (low - top) * height;
        const T = 1.15 + Math.random() * 0.45, dist = this.horizon - ty;
        return {
            type, x: sx + (Math.random() - 0.5) * U * 0.04, y: this.horizon, ty, vx: (Math.random() - 0.5) * U * 0.03,
            vy: -2 * dist / T, g: 2 * dist / (T * T), col: Math.floor(colour * this.paletteSize) % this.paletteSize,
            col2: Math.random() < 0.3 ? Math.floor(Math.random() * this.paletteSize) : -1, spark: 0,
        };
    }

    launch(event) {
        this.shells.push(this.makeShell(event));
    }

    tapLaunch(x, y) {
        const types = this.config.burstTypes.length ? this.config.burstTypes : FireworksShow.TYPES;
        this.shells.push(this.makeShell({ type: types[Math.floor(Math.random() * types.length)], colour: Math.random() }, { x, y }));
        this.tapped++;
        this.wake();
    }

    // Frames again after idling: a tap arrives on pointerup, which the
    // stage doesn't wake for.
    wake() {
        this.host.idleUntil(0);
        cancelAnimationFrame(this.frame);
        this.frame = requestAnimationFrame(t => this.tick(t));
    }

    // The L / space key.
    launchRandom() {
        const types = this.config.burstTypes.length ? this.config.burstTypes : FireworksShow.TYPES;
        this.launch({ type: types[Math.floor(Math.random() * types.length)], x: Math.random(), height: 0.3 + Math.random() * 0.7, colour: Math.random() });
        this.wake();
    }

    // The G key.
    grandFinale() {
        this.show.finale(this.timeline(), 20);
        if (this.config.mode !== 'auto') this.manualFinale = 20;
        this.wake();
    }

    burst(shell) {
        const { x, y } = shell, U = this.U, rand = Math.random;
        const R = U * (0.12 + 0.07 * rand()) * this.config.size;
        const S = this.special;
        let col = shell.col, col2 = shell.col2 >= 0 ? shell.col2 : col;
        const sphere = (n, speed, life, drag, trail, size, colourOf, kind = 0) => {
            n = this.budget(n);
            for (let i = 0; i < n; i++) {
                const z = rand() * 2 - 1, a = rand() * Math.PI * 2, r = Math.sqrt(1 - z * z);
                const v = speed * (0.92 + rand() * 0.12);
                const p = this.star(x, y, Math.cos(a) * r * v, Math.sin(a) * r * v, colourOf(i), life * (0.85 + rand() * 0.3), drag, trail, size);
                if (!p) return;
                p.kind = kind;
                p.flicker = rand();
            }
        };
        let flash = col;
        switch (shell.type) {
            case 'chrysanthemum':
                sphere(150, R * 2, 2.1, 2, 0.45, 1.2, i => i % 3 ? col : S.gold, 5);
                break;
            case 'willow':
                flash = S.gold;
                sphere(70, R * 0.9 * 2.8, 3.6, 2.8, 0.95, 1, () => S.gold, 0);
                for (const p of this.parts.slice(-70)) p.g = U * 0.42;
                break;
            case 'ring': {
                const n = this.budget(64), q = 0.25 + rand() * 0.75, phi = rand() * Math.PI;
                for (let i = 0; i < n; i++) {
                    const a = i / n * Math.PI * 2, vx = Math.cos(a), vy = Math.sin(a) * q, v = R * 1.9;
                    this.star(x, y, (vx * Math.cos(phi) - vy * Math.sin(phi)) * v, (vx * Math.sin(phi) + vy * Math.cos(phi)) * v, col, 1.7, 1.9, 0.2, 1.5);
                }
                if (rand() < 0.5) sphere(24, R * 0.7, 1.3, 2.2, 0.1, 1.2, () => col2 === col ? S.white : col2);
                break;
            }
            case 'palm': {
                flash = S.gold;
                const n = 8 + Math.floor(rand() * 3);
                for (let i = 0; i < n; i++) {
                    const a = -Math.PI / 2 + (i / n - 0.5) * Math.PI * 1.9 + (rand() - 0.5) * 0.2, v = R * 1.35 * (0.9 + rand() * 0.2);
                    this.star(x, y, Math.cos(a) * v, Math.sin(a) * v, S.gold, 2.3, 1.3, 0.7, 2.6);
                }
                sphere(20, R * 0.8, 1, 2.4, 0.08, 0.9, () => S.gold);
                break;
            }
            case 'crossette': {
                const n = this.budget(12);
                for (let i = 0; i < n; i++) {
                    const a = i / n * Math.PI * 2 + rand() * 0.3, v = R * 1.6;
                    const p = this.star(x, y, Math.cos(a) * v, Math.sin(a) * v, col, 0.6 + rand() * 0.15, 1.6, 0.25, 2);
                    if (p) p.split = 1;
                }
                break;
            }
            case 'strobe':
                sphere(110, R * 2.3, 2.5, 2.4, 0.06, 1.4, i => i % 2 ? S.white : col, 4);
                break;
            case 'crackle':
                flash = S.gold;
                sphere(60, R * 2.2, 1.2, 2.3, 0.16, 1.1, () => S.gold, 2);
                break;
            default:   // peony
                sphere(140, R * 2.2, 1.7, 2.2, 0.16, 1.6, i => i % 2 ? col2 : col);
        }
        this.flashes.push({ x, y, r: R * 3, col: flash, age: 0, life: 0.5 });
        if (this.flashes.length > 24) this.flashes.shift();
        // Smoke: puffs left behind, and old ones lit by this burst.
        for (const puff of this.puffs) {
            const d = Math.hypot(puff.x - x, puff.y - y), reach = R * 1.8 + puff.r;
            if (d < reach) { puff.light = Math.max(puff.light, 1 - d / reach); puff.col = flash; }
        }
        if (this.smokeFade > 0) {
            for (let i = 0; i < 2; i++) {
                if (this.puffs.length >= 40) this.puffs.shift();
                this.puffs.push({ x: x + (rand() - 0.5) * R * 0.6, y: y + (rand() - 0.3) * R * 0.5, r: R * (0.45 + rand() * 0.35), age: 0, life: 14 + rand() * 6, light: 0.6, col: flash });
            }
        }
    }

    // The year, written in stars, at midnight.
    yearBurst(year) {
        const text = String(year), probe = document.createElement('canvas');
        const W = 240, H = 90;
        probe.width = W; probe.height = H;
        const g = probe.getContext('2d', { willReadFrequently: true });
        g.fillStyle = '#fff';
        g.font = `bold ${H * 0.9}px system-ui, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(text, W / 2, H / 2);
        const data = g.getImageData(0, 0, W, H).data, points = [];
        for (let y = 0; y < H; y += 4) for (let x = 0; x < W; x += 4) if (data[(y * W + x) * 4 + 3] > 128) points.push([x, y]);
        const cx = this.w / 2, cy = Math.min(this.h * 0.32, this.horizon - this.h * 0.25), scale = Math.min(this.w * 0.8, this.U * 1.2) / W;
        const drag = 2.6;
        for (const [px, py] of points) {
            const tx = cx + (px - W / 2) * scale, ty = cy + (py - H / 2) * scale;
            const p = this.star(cx, cy, (tx - cx) * drag, (ty - cy) * drag, this.special.gold, 5 + Math.random(), drag, 0.12, 1.8);
            if (!p) break;
            p.g = this.U * 0.012;
            p.kind = 5;
            p.flicker = Math.random();
        }
        this.flashes.push({ x: cx, y: cy, r: this.U * 0.8, col: this.special.gold, age: 0, life: 0.8 });
    }

    // ---- Update -----------------------------------------------------------------

    timeline() {
        return this.config.mode === 'auto' ? this.clock : this.manualClock || 0;
    }

    schedule(dt) {
        const mode = this.config.mode;
        this.countdown = 0;
        if (mode === 'auto') {
            this.clock += dt;
            for (const e of this.show.run('auto', this.clock)) this.queue.push(e);
        } else {
            this.manualClock = (this.manualClock || 0) + dt;
            if (this.manualFinale > 0) {
                this.manualFinale -= dt;
                for (const e of this.show.run('auto', this.manualClock)) this.queue.push(e);
            }
        }
        if (mode === 'newyear') {
            const ny = FireworksShow.newYear(this.host.now());
            this.newYear = ny;
            if (ny.phase === 'countdown') this.countdown = ny.count;
            if (ny.phase === 'celebrate') {
                if (!this.celebrating) { this.celebrating = true; this.show.nextAt = null; }
                for (const e of this.show.run('celebrate', ny.s)) this.queue.push({ ...e, at: this.manualClock + (e.at - ny.s) });
                if (this.yearFired !== ny.year && ny.s < 20) { this.yearFired = ny.year; this.yearBurst(ny.year); }
            } else this.celebrating = false;
        }
        const now = this.timeline();
        for (let i = this.queue.length - 1; i >= 0; i--) {
            if (this.queue[i].at <= now) { this.launch(this.queue[i]); this.launched++; this.queue.splice(i, 1); }
        }
    }

    advance(dt) {
        const HZ = FireworksAnimationManager.TRAIL_HZ, N = FireworksAnimationManager.HISTORY, U = this.U;
        const wind = this.wind * U;
        // Shells climb, shedding sparks, and burst at the top.
        for (let i = this.shells.length - 1; i >= 0; i--) {
            const sh = this.shells[i];
            sh.vy += sh.g * dt;
            sh.x += sh.vx * dt;
            sh.y += sh.vy * dt;
            sh.spark += dt * 45 * this.host.quality.density;
            while (sh.spark >= 1) {
                sh.spark--;
                const p = this.star(sh.x, sh.y, (Math.random() - 0.5) * U * 0.05, sh.vy * 0.1 + Math.random() * U * 0.05, this.special.gold, 0.35 + Math.random() * 0.3, 3, 0, 0.7);
                if (p) p.kind = 1;
            }
            if (sh.vy >= 0) { this.burst(sh); this.shells.splice(i, 1); }
        }
        for (let i = this.parts.length - 1; i >= 0; i--) {
            const p = this.parts[i];
            p.age += dt;
            if (p.age >= p.life) {
                this.expire(p);
                this.parts[i] = this.parts[this.parts.length - 1];
                this.parts.pop();
                this.free.push(p);
                continue;
            }
            const k = Math.exp(-p.drag * dt);
            p.vx = p.vx * k + wind * (1 - k);
            p.vy = p.vy * k + p.g * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            if (p.trail > 0) {
                p.ht += dt * HZ;
                while (p.ht >= 1) {
                    p.ht--;
                    p.hist[p.hi * 2] = p.x; p.hist[p.hi * 2 + 1] = p.y;
                    p.hi = (p.hi + 1) % N;
                    if (p.hn < N) p.hn++;
                }
            }
        }
        for (const f of this.flashes) f.age += dt;
        this.flashes = this.flashes.filter(f => f.age < f.life);
        for (const puff of this.puffs) {
            puff.age += dt;
            puff.x += wind * 0.6 * dt;
            puff.y -= U * 0.004 * dt;
            puff.r += U * 0.006 * dt;
            puff.light *= Math.exp(-2.5 * dt);
        }
        this.puffs = this.puffs.filter(p => p.age < p.life);
    }

    // A star's end: crossettes split in four, crackle pops into glitter.
    expire(p) {
        if (p.split) {
            const v = this.U * 0.55, base = Math.atan2(p.vy, p.vx);
            for (let j = 0; j < 4; j++) {
                const a = base + Math.PI / 4 + j * Math.PI / 2;
                this.star(p.x, p.y, p.vx * 0.3 + Math.cos(a) * v, p.vy * 0.3 + Math.sin(a) * v, p.col, 0.9 + Math.random() * 0.3, 1.8, 0.22, 1.5);
            }
        } else if (p.kind === 2) {
            for (let j = 0; j < 3; j++) {
                const a = Math.random() * Math.PI * 2, v = this.U * (0.08 + Math.random() * 0.12);
                const q = this.star(p.x, p.y, Math.cos(a) * v, Math.sin(a) * v, this.special.white, 0.12 + Math.random() * 0.12, 3, 0, 0.8);
                if (q) q.kind = 1;
            }
        }
    }

    // ---- Draw ----------------------------------------------------------------------

    draw() {
        const ctx = this.ctx, s = this.s, U = this.U;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.drawImage(this.bg, 0, 0);
        ctx.setTransform(s, 0, 0, s, 0, 0);

        // Smoke: grey puffs, coloured where a burst lights them.
        if (this.smokeFade > 0 && this.puffs.length) {
            for (const puff of this.puffs) {
                const life = Math.min(1, puff.age / 1.5) * (1 - puff.age / puff.life), d = puff.r * 2;
                ctx.globalAlpha = 0.06 * life * this.smokeFade;
                ctx.drawImage(this.puffSprite, puff.x - puff.r, puff.y - puff.r, d, d);
            }
            ctx.globalCompositeOperation = 'lighter';
            for (const puff of this.puffs) {
                if (puff.light < 0.02) continue;
                const d = puff.r * 2.2;
                ctx.globalAlpha = Math.min(1, puff.light * 0.9 * this.smokeFade * (1 - puff.age / puff.life));
                ctx.drawImage(this.halos[puff.col], puff.x - d / 2, puff.y - d / 2, d, d);
            }
        }
        ctx.globalCompositeOperation = 'lighter';
        // The sky lit by each burst.
        for (const f of this.flashes) {
            const k = 1 - f.age / f.life, d = f.r * 2;
            ctx.globalAlpha = 0.45 * k * k;
            ctx.drawImage(this.halos[f.col], f.x - f.r, f.y - f.r, d, d);
        }
        this.drawTrails(ctx);
        // Heads.
        const t = this.time;
        for (const p of this.parts) {
            const f = 1 - p.age / p.life;
            let a = f < 0.3 ? f / 0.3 : 1;
            if (p.kind === 4 && ((t * 13 + p.flicker * 7) % 1) > 0.4) continue;
            if (p.kind === 5) a *= 0.45 + 0.55 * (((t * 9 + p.flicker * 5) % 1) > 0.5 ? 1 : 0.3);
            const r = (p.kind === 1 ? 1.8 : 4) * p.size * (0.6 + 0.4 * f);
            ctx.globalAlpha = a;
            ctx.drawImage(this.glows[p.col], p.x - r, p.y - r, r * 2, r * 2);
        }
        for (const sh of this.shells) {
            ctx.globalAlpha = 1;
            ctx.drawImage(this.glows[this.special.gold], sh.x - 3, sh.y - 3, 6, 6);
        }
        if (this.countdown) this.drawCountdown(ctx);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        if (this.config.reflection) this.drawReflection(ctx);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    // Trails, batched: one Path2D per colour, age band and brightness.
    drawTrails(ctx) {
        const N = FireworksAnimationManager.HISTORY, HZ = FireworksAnimationManager.TRAIL_HZ;
        const paths = new Map();
        const pathFor = key => paths.get(key) || paths.set(key, new Path2D()).get(key);
        for (const p of this.parts) {
            if (!p.trail || !p.hn) continue;
            const n = Math.min(p.hn, Math.ceil(p.trail * HZ));
            const f = 1 - p.age / p.life, bright = f > 0.6 ? 2 : f > 0.3 ? 1 : 0;
            let px = p.x, py = p.y;
            const bands = Math.max(1, Math.ceil(n / 3));
            for (let j = 0; j < n; j++) {
                const idx = ((p.hi - 1 - j) % N + N) % N, x = p.hist[idx * 2], y = p.hist[idx * 2 + 1];
                const path = pathFor((p.col * 3 + Math.min(2, Math.floor(j / bands))) * 3 + bright);
                path.moveTo(px, py);
                path.lineTo(x, y);
                px = x; py = y;
            }
        }
        ctx.lineCap = 'round';
        for (const [key, path] of paths) {
            const bright = key % 3, band = Math.floor(key / 3) % 3, col = Math.floor(key / 9);
            ctx.strokeStyle = this.strokes[col];
            ctx.globalAlpha = [0.55, 0.28, 0.1][band] * [0.35, 0.7, 1][bright];
            ctx.lineWidth = [2.2, 1.5, 0.9][band];
            ctx.stroke(path);
        }
    }

    drawCountdown(ctx) {
        const n = this.countdown, frac = this.newYear ? (this.newYear.s % 1 + 1) % 1 : 0;
        let sprite = this.digits.get(n);
        if (!sprite) {
            const size = Math.round(this.U * 0.4 * this.s);
            sprite = this.sprite(size, (g, c) => {
                g.font = `600 ${size * 0.62}px system-ui, sans-serif`;
                g.textAlign = 'center';
                g.textBaseline = 'middle';
                // A glow from wide, faint strokes, then the figure.
                g.lineJoin = 'round';
                for (const [width, alpha] of [[size * 0.09, 0.05], [size * 0.05, 0.1], [size * 0.025, 0.2]]) {
                    g.strokeStyle = `rgba(255,190,90,${alpha})`;
                    g.lineWidth = width;
                    g.strokeText(String(n), c, c);
                }
                g.fillStyle = 'rgb(255,236,190)';
                g.fillText(String(n), c, c);
            });
            this.digits.set(n, sprite);
        }
        const scale = 1.2 - 0.2 * Math.min(1, frac * 3), a = 1 - Math.pow(frac, 3);
        const d = this.U * 0.4 * scale, cx = this.w / 2, cy = Math.min(this.h * 0.36, this.horizon - this.h * 0.25);
        ctx.globalAlpha = a;
        ctx.drawImage(sprite, cx - d / 2, cy - d / 2, d, d);
    }

    // The lake: everything above the horizon, flipped and squashed into a
    // half-size buffer, then laid on the water in strips that sway.
    //
    // The whole sky maps onto the lake on a curve: little squashed near the
    // horizon (the skyline), much more far above it, so a burst high in the
    // sky still lands in the water.
    drawReflection(ctx) {
        const s = this.s, horizon = this.horizon, lake = this.lake;
        const rc = this.refl.getContext('2d'), RW = this.refl.width, RH = this.refl.height;
        rc.setTransform(1, 0, 0, -1, 0, RH);
        rc.globalCompositeOperation = 'copy';
        rc.drawImage(this.canvas, 0, 0, this.canvas.width, horizon * s, 0, 0, RW, RH);
        rc.setTransform(1, 0, 0, 1, 0, 0);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const strips = 20, t = this.time, W = this.canvas.width, reach = f => RH * Math.pow(f, 1.7);
        for (let i = 0; i < strips; i++) {
            const f = i / strips, g = (i + 1) / strips, sy = reach(f), sh = Math.max(0.5, reach(g) - sy);
            const dy = (horizon + lake * f) * s, dh = lake * s / strips + 1;
            const sway = Math.sin(t * 1.3 + i * 1.7) * (1 + f * 5) * s;
            ctx.globalAlpha = 0.5 * (1 - f * 0.7);
            ctx.drawImage(this.refl, 0, sy, RW, sh, sway, dy, W, dh);
        }
        ctx.globalAlpha = 1;
    }

    // ---- Frame ---------------------------------------------------------------------

    tick(now) {
        if (!this.running) return;
        this.frame = requestAnimationFrame(t => this.tick(t));
        const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
        this.last = now;
        this.time = (this.time || 0) + dt;
        this.smokeFade = Math.max(0, Math.min(1, this.smokeFade + (this.smokeWanted() ? dt : -dt) / 1.5));
        this.schedule(dt);
        this.advance(dt);
        this.draw();
        // Nothing in the sky and nothing due: no frames until a tap, or
        // (New Year) until the countdown.
        if (this.config.mode !== 'auto' && !this.parts.length && !this.shells.length && !this.queue.length && !this.flashes.length
            && !this.puffs.length && !this.countdown && !(this.manualFinale > 0) && this.newYear?.phase !== 'celebrate') {
            this.host.idleUntil(this.config.mode === 'newyear' && this.newYear ? Math.min(60000, this.newYear.untilCountdown * 1000) : Infinity);
            this.last = 0;
        }
    }
}
