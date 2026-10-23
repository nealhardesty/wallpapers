// Night Train (SPEC §10.16): the view from a carriage window at night. The
// land slides past at speeds for its depth, rain streaks backwards across
// the glass, tunnels swallow the view and the carriage's reflection comes
// up in the dark glass, and at stations the train eases to a stop under
// the platform lamps, waits, and pulls away.
//
// Cheap by construction (SPEC §4.8): every layer is cached. The sky, the far
// hills and the clouds are baked strips; the middle and near layers are
// tiles, each painted once from the route (route.js) when it first scrolls
// into view and dropped when it leaves. A frame copies those, then draws a
// few poles and wires, the drops on the glass and the window frame.

const NIGHT_TRAIN_PALETTES = {
    blue: {
        sky: ['#03060f', '#08132b', '#16284a'], stars: true, moon: '#f3f1e6', cloud: [96, 116, 156], cloudAlpha: 0.18,
        far: '#070f22', farEdge: '#3a5a8e', mid: '#08101f', midEdge: '#1f3355', near: '#02040a', nearEdge: '#1b2a44',
        water: ['#0d1d38', '#050a16'], building: ['#0a1222', '#0d1729', '#0b1426'], windows: ['#ffd27a', '#ffc35e', '#cfe4ff'],
        lamp: '#ffcf8a', platform: ['#4a4a52', '#22232a'], rim: 'rgba(150, 180, 230, 0.35)', wire: 'rgba(150, 175, 215, 0.22)',
        tunnel: '#030304', tunnelLamp: '#ffd9a0', wall: ['#2b1d16', '#1a110c'], seal: '#070504', drop: [200, 220, 255], snow: false,
    },
    sodium: {
        sky: ['#0b0605', '#22120a', '#4d2810'], stars: false, moon: null, cloud: [150, 80, 40], cloudAlpha: 0.32,
        far: '#120a06', farEdge: '#7a4418', mid: '#120a06', midEdge: '#4a2810', near: '#050302', nearEdge: '#3a2210',
        water: ['#24150b', '#0a0603'], building: ['#140c08', '#1a100a', '#160d08'], windows: ['#ffb24a', '#ff9a2a', '#ffd38a'],
        lamp: '#ff9a2a', platform: ['#5a4632', '#2a2018'], rim: 'rgba(255, 160, 80, 0.3)', wire: 'rgba(255, 170, 90, 0.2)',
        tunnel: '#050302', tunnelLamp: '#ff9a3a', wall: ['#1f2422', '#121614'], seal: '#050605', drop: [255, 200, 150], snow: false,
    },
    snow: {
        sky: ['#0a1020', '#18233c', '#34405c'], stars: true, moon: '#f6f6f0', cloud: [150, 165, 195], cloudAlpha: 0.22,
        far: '#3a4866', farEdge: '#a9b8d4', mid: '#5d6c8a', midEdge: '#c8d4ea', near: '#2a3346', nearEdge: '#b8c6de',
        water: ['#1a2640', '#0a1020'], building: ['#141c2e', '#18213a', '#121a2c'], windows: ['#ffd68f', '#ffc970', '#ffe6b8'],
        lamp: '#ffd59a', platform: ['#7a8296', '#3a4152'], rim: 'rgba(220, 235, 255, 0.45)', wire: 'rgba(210, 225, 250, 0.25)',
        tunnel: '#040507', tunnelLamp: '#ffe3b5', wall: ['#3a1c1c', '#241010'], seal: '#080404', drop: [225, 235, 255], snow: true,
    },
};

const NIGHT_TRAIN = {
    TILE: 512,          // tile width, CSS px
    MID: 0.2,           // layer speeds, as a share of the near layer's
    FAR: 0.045,
    CLOUDS: 0.012,
    POLE: 620,          // units between catenary poles
    MID_BAND: [0.26, 0.93],   // the tiles' vertical extent, as fractions of the window
    NEAR_BAND: [0.6, 1],
};

class NightTrainAnimationManager {
    constructor(host) {
        this.host = host;
        this.config = WP.settings.load();
        this.canvas = null;
        this.ctx = null;
        this.animationId = null;
        this.isRunning = false;
        this.lastTime = 0;

        this.seed = Number(host.params.seed) || Math.floor(Math.random() * 2 ** 31);
        this.route = NightTrainRoute.create(this.seed, this.config);
        // In the country, already at speed, so the first frame is moving
        this.train = { x: -3000, v: NightTrainRoute.CRUISE * this.config.speed, dwell: 0, served: -Infinity };
        // Thumbnails and the panel's previews start in the first town, lit up
        if (host.params.thumb) {
            this.route.ensure(4e5);
            const town = this.route.segments.find(s => s.kind === 'town');
            this.train.x = (town.start + town.end) / 2;
        }
        this.pan = 0;
        this.panTarget = 0;
        this.fade = { reflection: this.wantsReflection(), soft: this.wants('softRain') };
        this.drops = [];
        this.flakes = [];
        this.cars = [];
        this.glows = new Map();
        this.mid = new Map();
        this.near = new Map();
        this.reflectionShown = 0;   // px of reflection drawn in the last frame (the smoke test reads it)
        this.onResize = () => this.build();
    }

    wants(effect) {
        return this.host.quality.effects.includes(effect) ? 1 : 0;
    }

    wantsReflection() {
        return this.config.reflection ? this.wants('reflection') : 0;
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        const canvas = this.canvas = document.createElement('canvas');
        Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: '-1', pointerEvents: 'none' });
        document.body.appendChild(canvas);
        this.ctx = canvas.getContext('2d');
        window.addEventListener('resize', this.onResize);
        this.build();
        this.seedGlass();
        this.lastTime = 0;
        this.animationId = requestAnimationFrame(t => this.frame(t));
    }

    stop() {
        this.isRunning = false;
        cancelAnimationFrame(this.animationId);
        window.removeEventListener('resize', this.onResize);
        this.canvas?.remove();
        this.canvas = this.ctx = null;
        this.mid.clear();
        this.near.clear();
    }

    applySettings(config) {
        const before = this.config;
        this.config = { ...config };
        if (before.stations !== config.stations || before.tunnels !== config.tunnels) {
            // Keep the land in view; plan again from just past the window
            this.route.replan(this.train.x + this.halfWidth() + 200, config);
            this.mid.clear();
            this.near.clear();
        }
        if (before.palette !== config.palette || before.frame !== config.frame) this.build();
        if (before.rain !== config.rain || before.palette !== config.palette) this.seedGlass();
    }

    // Auto changed the tier: the glass effects fade, drops and flakes thin
    // or fill in as they come and go, and new tiles take the new detail.
    onQuality() {}

    onScroll(x) {
        this.panTarget = x - 0.5;
    }

    // ---- Layout and baking ----------------------------------------------------

    layer(width, height, scale = this.dpr) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const g = canvas.getContext('2d');
        g.setTransform(scale, 0, 0, scale, 0, 0);
        return { canvas, g };
    }

    build() {
        if (!this.canvas) return;
        const w = this.w = window.innerWidth;
        const h = this.h = window.innerHeight;
        const dpr = this.dpr = window.devicePixelRatio || 1;
        this.canvas.width = Math.round(w * dpr);
        this.canvas.height = Math.round(h * dpr);
        this.palette = NIGHT_TRAIN_PALETTES[this.config.palette] || NIGHT_TRAIN_PALETTES.blue;

        // The window: inset from the edges when there's a frame, with a
        // deeper sill, kept above the host's bottom inset.
        const m = this.config.frame ? Math.round(Math.min(56, Math.max(12, Math.min(w, h) * 0.045))) : 0;
        const bottom = this.config.frame ? Math.round(m * 1.7) : 0;
        this.view = { x: m, y: m, w: w - m * 2, h: h - m - bottom - this.host.insets.bottom, r: m * 1.3 };
        this.k = this.view.h / 800;
        this.cx = this.view.x + this.view.w / 2;

        this.glows.clear();
        this.mid.clear();
        this.near.clear();
        this.bakeSky();
        this.bakeFar();
        this.bakeClouds();
        this.bakeFrame();
        this.bakeReflection();
        this.bakePortal();
        this.bakeBeads();
    }

    // Half the window's width, in units.
    halfWidth() {
        return this.view.w / 2 / this.k;
    }

    Y(fraction) {
        return this.view.y + fraction * this.view.h;
    }

    // A soft light, baked once per colour.
    glow(color) {
        let sprite = this.glows.get(color);
        if (!sprite) {
            const size = 64, c = size / 2;
            const { canvas, g } = this.layer(size, size, 1);
            const gradient = g.createRadialGradient(c, c, 0, c, c, c);
            gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
            gradient.addColorStop(0.1, rgba(color, 0.95));
            gradient.addColorStop(0.35, rgba(color, 0.3));
            gradient.addColorStop(1, rgba(color, 0));
            g.fillStyle = gradient;
            g.fillRect(0, 0, size, size);
            this.glows.set(color, sprite = canvas);
        }
        return sprite;
    }

    bakeSky() {
        const { view, palette: p } = this;
        const { canvas, g } = this.layer(view.w, view.h);
        const sky = g.createLinearGradient(0, 0, 0, view.h * 0.62);
        sky.addColorStop(0, p.sky[0]);
        sky.addColorStop(0.6, p.sky[1]);
        sky.addColorStop(1, p.sky[2]);
        g.fillStyle = sky;
        g.fillRect(0, 0, view.w, view.h);
        const random = WP.seededRandom(this.seed + 5);
        if (p.stars) {
            const count = Math.round(view.w * view.h * 0.5 / 2600);
            for (let i = 0; i < count; i++) {
                const y = Math.pow(random(), 1.4) * view.h * 0.5;
                g.globalAlpha = (0.2 + random() * 0.7) * (1 - y / (view.h * 0.55));
                g.fillStyle = '#e8eeff';
                const size = 0.5 + Math.pow(random(), 4) * 1.2;
                g.fillRect(random() * view.w, y, size, size);
            }
            g.globalAlpha = 1;
        }
        if (p.moon) {
            const mx = view.w * 0.74, my = view.h * 0.16, r = Math.max(8, view.h * 0.032);
            const halo = g.createRadialGradient(mx, my, r, mx, my, r * 9);
            halo.addColorStop(0, rgba(p.moon, 0.22));
            halo.addColorStop(1, rgba(p.moon, 0));
            g.fillStyle = halo;
            g.fillRect(mx - r * 9, my - r * 9, r * 18, r * 18);
            g.fillStyle = p.moon;
            g.beginPath();
            g.arc(mx, my, r, 0, Math.PI * 2);
            g.fill();
            // A few soft maria
            g.fillStyle = 'rgba(120, 130, 150, 0.18)';
            for (const [dx, dy, s] of [[-0.3, -0.2, 0.35], [0.25, 0.1, 0.28], [-0.05, 0.35, 0.22]]) {
                g.beginPath();
                g.arc(mx + dx * r, my + dy * r, s * r, 0, Math.PI * 2);
                g.fill();
            }
            this.moonX = mx;
        } else {
            this.moonX = null;
        }
        this.sky = canvas;
    }

    // Distant hills: one strip that repeats, so it's built once.
    bakeFar() {
        const { view, palette: p } = this;
        const period = this.farPeriod = Math.round(Math.max(view.w * 1.5, 1000));
        const top = view.h * 0.32, bottom = view.h * 0.8;
        const { canvas, g } = this.layer(period, bottom - top);
        g.translate(0, -top);
        const random = WP.seededRandom(this.seed + 7);
        const waves = [1, 2, 3, 5, 8].map(n => ({ n, a: (0.05 / n ** 0.7) * view.h * (0.5 + random()), phase: random() * Math.PI * 2 }));
        const ridge = x => view.h * 0.5 - waves.reduce((sum, { n, a, phase }) => sum + a * (0.5 + 0.5 * Math.sin(x / period * Math.PI * 2 * n + phase)), 0) * 0.9;
        g.fillStyle = p.far;
        g.beginPath();
        g.moveTo(0, bottom);
        for (let x = 0; x <= period; x += 4) g.lineTo(x, ridge(x));
        g.lineTo(period, bottom);
        g.fill();
        g.strokeStyle = p.farEdge;
        g.globalAlpha = p.snow ? 0.7 : 0.45;
        g.lineWidth = p.snow ? 2 : 1;
        g.beginPath();
        for (let x = 0; x <= period; x += 4) g.lineTo(x, ridge(x) + (p.snow ? 1 : 0.5));
        g.stroke();
        g.globalAlpha = 1;
        // Villages far off: a few specks of light along the foot of the hills
        g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < period / 60; i++) {
            const x = random() * period, y = Math.max(ridge(x) + 6, view.h * 0.5 + random() * view.h * 0.05);
            if (random() < 0.5) continue;
            for (let j = 0; j < 2 + random() * 5; j++) {
                g.fillStyle = p.windows[Math.floor(random() * p.windows.length)];
                g.globalAlpha = 0.4 + random() * 0.5;
                g.fillRect(x + (random() - 0.5) * 16, y + random() * 3, 1, 1);
            }
        }
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
        this.far = canvas;
        this.farTop = top;
        this.farHeight = bottom - top;
    }

    bakeClouds() {
        const { view, palette: p } = this;
        const period = this.cloudPeriod = Math.round(Math.max(view.w * 2, 1200));
        const height = view.h * 0.4;
        const { canvas, g } = this.layer(period, height, Math.min(1, this.dpr));
        const random = WP.seededRandom(this.seed + 11);
        const [r, gr, b] = p.cloud;
        const puffs = Math.round(period / 26);
        for (let i = 0; i < puffs; i++) {
            const bank = Math.floor(random() * 5) / 5;
            const x = (bank + random() * 0.14) * period, y = height * (0.15 + random() * 0.6), rx = 40 + random() * 120;
            for (const shift of [0, period, -period]) {
                const blob = g.createRadialGradient(x + shift, y, 0, x + shift, y, rx);
                blob.addColorStop(0, `rgba(${r}, ${gr}, ${b}, ${p.cloudAlpha * (0.4 + random() * 0.6)})`);
                blob.addColorStop(1, `rgba(${r}, ${gr}, ${b}, 0)`);
                g.fillStyle = blob;
                g.save();
                g.translate(x + shift, y);
                g.scale(1, 0.32);
                g.translate(-(x + shift), -y);
                g.fillRect(x + shift - rx, y - rx, rx * 2, rx * 2);
                g.restore();
            }
        }
        this.clouds = canvas;
        this.cloudHeight = height;
    }

    // The carriage wall around the window, and the glass's own sheen.
    bakeFrame() {
        const { w, h, view, palette: p } = this;
        const { canvas, g } = this.layer(w, h);
        if (this.config.frame) {
            const wall = g.createLinearGradient(0, 0, 0, h);
            wall.addColorStop(0, p.wall[0]);
            wall.addColorStop(1, p.wall[1]);
            g.fillStyle = wall;
            g.fillRect(0, 0, w, h);
            // Panelling: faint vertical grain
            const random = WP.seededRandom(this.seed + 13);
            for (let x = 0; x < w; x += 3 + random() * 9) {
                g.fillStyle = random() < 0.5 ? 'rgba(255, 255, 255, 0.025)' : 'rgba(0, 0, 0, 0.06)';
                g.fillRect(x, 0, 1 + random() * 2, h);
            }
            // A warm wash from the carriage lights above
            const light = g.createLinearGradient(0, 0, 0, view.y + 40);
            light.addColorStop(0, 'rgba(255, 210, 150, 0.12)');
            light.addColorStop(1, 'rgba(255, 210, 150, 0)');
            g.fillStyle = light;
            g.fillRect(0, 0, w, view.y + 40);
            // The sill, catching the light
            const sill = view.y + view.h + view.r * 0.25;
            g.fillStyle = 'rgba(255, 220, 170, 0.08)';
            g.fillRect(0, sill, w, 2);
            g.fillStyle = 'rgba(0, 0, 0, 0.25)';
            g.fillRect(0, sill + 2, w, 3);
            // Cut the window, then its rubber seal and a bevel
            g.globalCompositeOperation = 'destination-out';
            g.fillStyle = '#000';
            g.beginPath();
            g.roundRect(view.x, view.y, view.w, view.h, view.r);
            g.fill();
            g.globalCompositeOperation = 'source-over';
            g.strokeStyle = p.seal;
            g.lineWidth = Math.max(3, view.r * 0.18);
            g.beginPath();
            g.roundRect(view.x, view.y, view.w, view.h, view.r);
            g.stroke();
            g.strokeStyle = 'rgba(255, 225, 190, 0.1)';
            g.lineWidth = 1;
            g.beginPath();
            g.roundRect(view.x - g.lineWidth * 3, view.y - 3, view.w + 6, view.h + 6, view.r + 3);
            g.stroke();
        }
        // The glass: a faint diagonal glare, and condensation along the bottom
        g.save();
        g.beginPath();
        g.roundRect(view.x, view.y, view.w, view.h, view.r);
        g.clip();
        const glare = g.createLinearGradient(view.x, view.y, view.x + view.w * 0.6, view.y + view.h);
        glare.addColorStop(0, 'rgba(255, 255, 255, 0)');
        glare.addColorStop(0.42, 'rgba(255, 255, 255, 0)');
        glare.addColorStop(0.5, 'rgba(220, 230, 255, 0.035)');
        glare.addColorStop(0.58, 'rgba(255, 255, 255, 0)');
        g.fillStyle = glare;
        g.fillRect(view.x, view.y, view.w, view.h);
        const mist = g.createLinearGradient(0, view.y + view.h * 0.82, 0, view.y + view.h);
        mist.addColorStop(0, 'rgba(190, 205, 230, 0)');
        mist.addColorStop(1, 'rgba(190, 205, 230, 0.1)');
        g.fillStyle = mist;
        g.fillRect(view.x, view.y + view.h * 0.82, view.w, view.h * 0.18);
        if (this.config.frame) {
            // Shade inside the seal
            const edge = Math.max(6, view.r * 0.5);
            g.strokeStyle = 'rgba(0, 0, 0, 0.35)';
            g.lineWidth = edge;
            g.beginPath();
            g.roundRect(view.x, view.y, view.w, view.h, view.r);
            g.stroke();
        }
        g.restore();
        this.frameLayer = canvas;
    }

    // The carriage behind you, as the dark glass mirrors it: luggage racks,
    // ceiling lights running away down the coach, seat backs, a reading
    // lamp, and a cat asleep in a basket. Half resolution: reflections are soft.
    bakeReflection() {
        const { view } = this;
        const W = view.w, H = view.h;
        const { canvas, g } = this.layer(W, H, Math.min(1, this.dpr) * 0.5);
        const warm = '#ffc98a';
        // Ceiling lights, in perspective towards the far end of the coach
        for (let i = 0; i < 9; i++) {
            const t = i / 8, x = W * (0.08 + 0.84 * t), y = H * (0.07 + 0.05 * Math.sin(t * Math.PI));
            const r = H * (0.05 + 0.03 * Math.sin(t * Math.PI));
            const light = g.createRadialGradient(x, y, 0, x, y, r);
            light.addColorStop(0, 'rgba(255, 236, 200, 0.55)');
            light.addColorStop(0.3, 'rgba(255, 220, 170, 0.18)');
            light.addColorStop(1, 'rgba(255, 220, 170, 0)');
            g.fillStyle = light;
            g.fillRect(x - r, y - r, r * 2, r * 2);
        }
        // Luggage racks
        g.strokeStyle = 'rgba(200, 190, 175, 0.22)';
        g.lineWidth = Math.max(1, H * 0.005);
        for (const y of [0.2, 0.225]) {
            g.beginPath();
            g.moveTo(0, H * y);
            g.lineTo(W, H * y);
            g.stroke();
        }
        for (let x = W * 0.05; x < W; x += W * 0.18) {
            g.beginPath();
            g.moveTo(x, H * 0.16);
            g.lineTo(x + H * 0.02, H * 0.225);
            g.stroke();
        }
        // The opposite windows, dark, with a hint of their frames
        g.strokeStyle = 'rgba(150, 160, 180, 0.12)';
        g.lineWidth = Math.max(1, H * 0.004);
        for (let x = W * 0.03; x < W; x += W * 0.3) {
            g.beginPath();
            g.roundRect(x, H * 0.27, W * 0.24, H * 0.3, H * 0.03);
            g.stroke();
        }
        // A reading lamp, glowing
        const lx = W * 0.22, ly = H * 0.36;
        const lamp = g.createRadialGradient(lx, ly, 0, lx, ly, H * 0.32);
        lamp.addColorStop(0, rgba(warm, 0.7));
        lamp.addColorStop(0.15, rgba(warm, 0.3));
        lamp.addColorStop(1, rgba(warm, 0));
        g.fillStyle = lamp;
        g.fillRect(lx - H * 0.32, ly - H * 0.32, H * 0.64, H * 0.64);
        g.fillStyle = 'rgba(255, 210, 150, 0.4)';
        g.beginPath();
        g.moveTo(lx - H * 0.035, ly);
        g.lineTo(lx + H * 0.035, ly);
        g.lineTo(lx + H * 0.018, ly - H * 0.035);
        g.lineTo(lx - H * 0.018, ly - H * 0.035);
        g.fill();
        // Seat backs along the bottom, headrests with their cloths
        const seats = Math.max(3, Math.round(W / (H * 0.42)));
        for (let i = 0; i < seats; i++) {
            const x = W * (i + 0.5) / seats, sw = Math.min(W / seats * 0.8, H * 0.34);
            g.fillStyle = 'rgba(140, 60, 70, 0.22)';
            g.beginPath();
            g.roundRect(x - sw / 2, H * 0.6, sw, H * 0.5, H * 0.06);
            g.fill();
            g.fillStyle = 'rgba(230, 220, 200, 0.18)';
            g.beginPath();
            g.roundRect(x - sw * 0.3, H * 0.62, sw * 0.6, H * 0.09, H * 0.02);
            g.fill();
        }
        // The cat, curled in a wicker basket on the seat by the window
        const cx = W * 0.7, cy = H * 0.86, s = H * 0.11;
        g.fillStyle = 'rgba(190, 150, 90, 0.35)';
        g.beginPath();
        g.ellipse(cx, cy + s * 0.25, s * 1.15, s * 0.5, 0, 0, Math.PI);
        g.fill();
        g.strokeStyle = 'rgba(120, 90, 50, 0.3)';
        g.lineWidth = Math.max(1, s * 0.04);
        for (let i = -4; i <= 4; i++) {
            g.beginPath();
            g.moveTo(cx + i * s * 0.25, cy + s * 0.25);
            g.lineTo(cx + i * s * 0.22, cy + s * 0.7);
            g.stroke();
        }
        g.fillStyle = 'rgba(255, 170, 90, 0.42)';
        g.beginPath();
        g.ellipse(cx, cy + s * 0.12, s * 0.9, s * 0.42, 0, Math.PI, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.arc(cx + s * 0.62, cy, s * 0.3, 0, Math.PI * 2);
        g.fill();
        for (const side of [-1, 1]) {
            g.beginPath();
            g.moveTo(cx + s * 0.62 + side * s * 0.24, cy - s * 0.12);
            g.lineTo(cx + s * 0.62 + side * s * 0.12, cy - s * 0.42);
            g.lineTo(cx + s * 0.62 + side * s * 0.02 * -1, cy - s * 0.18);
            g.fill();
        }
        // Its tail around its nose, and a closed eye
        g.strokeStyle = 'rgba(255, 170, 90, 0.42)';
        g.lineWidth = s * 0.14;
        g.lineCap = 'round';
        g.beginPath();
        g.arc(cx + s * 0.2, cy + s * 0.1, s * 0.6, Math.PI * 0.15, Math.PI * 0.75);
        g.stroke();
        g.strokeStyle = 'rgba(60, 30, 10, 0.5)';
        g.lineWidth = Math.max(1, s * 0.03);
        g.beginPath();
        g.arc(cx + s * 0.7, cy - s * 0.02, s * 0.07, 0, Math.PI);
        g.stroke();
        this.reflection = canvas;
    }

    // A tunnel mouth's stone face, seen edge-on as it sweeps past.
    bakePortal() {
        const { view, palette: p } = this;
        const pw = this.portalWidth = Math.max(20, view.h * 0.09);
        const { canvas, g } = this.layer(pw, view.h);
        g.fillStyle = p.snow ? '#3a4152' : '#1c1a1a';
        g.fillRect(0, 0, pw, view.h);
        const random = WP.seededRandom(this.seed + 17);
        for (let y = 0; y < view.h; y += pw * 0.32) {
            for (let x = (Math.floor(y / (pw * 0.32)) % 2) * -pw * 0.25; x < pw; x += pw * 0.5) {
                const shade = 20 + random() * 26;
                g.fillStyle = `rgb(${shade + 6}, ${shade + 3}, ${shade})`;
                g.fillRect(x + 1, y + 1, pw * 0.5 - 2, pw * 0.32 - 2);
            }
        }
        // Lit on the outside edge by the night, dark towards the tunnel
        const shade = g.createLinearGradient(0, 0, pw, 0);
        shade.addColorStop(0, 'rgba(0, 0, 0, 0)');
        shade.addColorStop(1, 'rgba(0, 0, 0, 0.75)');
        g.fillStyle = shade;
        g.fillRect(0, 0, pw, view.h);
        this.portal = canvas;
    }

    // Beads of water clinging to the glass.
    bakeBeads() {
        const { view } = this;
        const { canvas, g } = this.layer(view.w, view.h);
        const random = WP.seededRandom(this.seed + 19);
        const [r, gr, b] = this.palette.drop;
        const count = Math.round(view.w * view.h / 2200);
        for (let i = 0; i < count; i++) {
            const x = random() * view.w, y = random() * view.h, size = 0.6 + Math.pow(random(), 3) * 2.4;
            g.fillStyle = `rgba(0, 0, 0, 0.25)`;
            g.beginPath();
            g.arc(x, y + size * 0.3, size, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = `rgba(${r}, ${gr}, ${b}, 0.28)`;
            g.beginPath();
            g.arc(x, y, size, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = 'rgba(255, 255, 255, 0.5)';
            g.fillRect(x - size * 0.35, y - size * 0.45, Math.max(0.6, size * 0.35), Math.max(0.6, size * 0.35));
        }
        this.beads = canvas;
    }

    // ---- Tiles ------------------------------------------------------------------

    // The ground line of the middle distance, by kind, continuous in L
    // (layer px) so tiles meet.
    midGround(kind, L) {
        const H = this.view.h, s = this.seed % 1000;
        if (kind === 'coast') return H * 0.548;
        if (kind === 'bridge') return H * 0.585;
        if (kind === 'town' || kind === 'station') return H * (0.675 + 0.004 * Math.sin(L / 90 + s));
        return H * (0.655 + 0.022 * Math.sin(L / 210 + s) + 0.012 * Math.sin(L / 77 + s * 2));
    }

    isWater(kind) {
        return kind === 'coast' || kind === 'bridge';
    }

    paintMid(index) {
        const { TILE, MID, MID_BAND } = NIGHT_TRAIN;
        const { view, palette: p, k } = this;
        const H = view.h, top = MID_BAND[0] * H, bottom = MID_BAND[1] * H;
        const { canvas, g } = this.layer(TILE, bottom - top);
        g.translate(0, -top);
        const L0 = index * TILE;
        const kindAt = L => this.route.at(L / (MID * k)).kind;

        // Water first, then the land over it
        const columns = [];
        for (let x = -4; x <= TILE + 4; x += 4) {
            const kind = kindAt(L0 + x);
            columns.push({ x, kind, y: this.isWater(kind) ? bottom : this.midGround(kind, L0 + x) });
        }
        const water = g.createLinearGradient(0, H * 0.54, 0, bottom);
        water.addColorStop(0, p.water[0]);
        water.addColorStop(1, p.water[1]);
        for (const c of columns) {
            if (!this.isWater(c.kind)) continue;
            const surface = this.midGround(c.kind, L0 + c.x);
            g.fillStyle = water;
            g.fillRect(c.x, surface, 4.5, bottom - surface);
            g.fillStyle = p.rim;
            g.fillRect(c.x, surface, 4.5, 1);
        }
        g.fillStyle = p.mid;
        g.beginPath();
        g.moveTo(-4, bottom);
        for (const c of columns) g.lineTo(c.x, c.y);
        g.lineTo(TILE + 4, bottom);
        g.fill();
        g.strokeStyle = p.midEdge;
        g.globalAlpha = p.snow ? 0.8 : 0.5;
        g.lineWidth = p.snow ? 1.6 : 1;
        g.beginPath();
        for (const c of columns) if (c.y < bottom) g.lineTo(c.x, c.y + 0.5); else g.moveTo(c.x, bottom);
        g.stroke();
        g.globalAlpha = 1;

        // Features at fixed slots along the layer, drawn by every tile they
        // touch, so they cross tile edges cleanly.
        const slots = (size, reach, fn) => {
            for (let n = Math.floor((L0 - reach) / size); n * size < L0 + TILE + reach; n++) fn(n, n * size - L0);
        };
        const seed = this.seed;
        // Countryside: trees and farmhouses with a lit window or two; a lane
        slots(18, 30, (n, x) => {
            const kind = kindAt(L0 + x);
            if (kind !== 'countryside' && kind !== 'tunnel') return;
            if (hash(n, seed) > 0.3) return;
            const gx = x + hash(n, seed + 1) * 18, gy = this.midGround(kind, L0 + gx);
            this.tree(g, gx, gy + 2, H * (0.018 + hash(n, seed + 2) * 0.03), p.mid, p.snow);
        });
        slots(260, 60, (n, x) => {
            const kind = kindAt(L0 + x);
            if (kind !== 'countryside' || hash(n, seed + 3) > 0.45) return;
            const hx = x + hash(n, seed + 4) * 180, gy = this.midGround(kind, L0 + hx);
            this.house(g, hx, gy + 3, H * (0.024 + hash(n, seed + 5) * 0.014), n, false);
        });
        // Towns: a crowded skyline of lit windows, a spire, street lamps
        slots(26, 70, (n, x) => {
            const kind = kindAt(L0 + x);
            if (kind !== 'town' && kind !== 'station') return;
            const bh = H * (0.04 + Math.pow(hash(n, seed + 6), 1.6) * (kind === 'station' ? 0.1 : 0.16));
            const bw = 22 + hash(n, seed + 7) * 34;
            const gy = this.midGround(kind, L0 + x);
            this.building(g, x, gy + 2, bw, bh, n, kind === 'station' ? 0.45 : 0.28);
        });
        slots(380, 40, (n, x) => {
            const kind = kindAt(L0 + x);
            if (kind !== 'town' || hash(n, seed + 8) > 0.35) return;
            this.spire(g, x + 20, this.midGround(kind, L0 + x) + 2, H * (0.2 + hash(n, seed + 9) * 0.06));
        });
        g.globalCompositeOperation = 'lighter';
        slots(48, 10, (n, x) => {
            const kind = kindAt(L0 + x);
            if (kind !== 'town' && kind !== 'station' && kind !== 'bridge') return;
            if (hash(n, seed + 10) > (kind === 'bridge' ? 0.3 : 0.75)) return;
            const ly = kind === 'bridge' ? H * 0.585 : this.midGround(kind, L0 + x) + H * 0.012;
            const size = H * 0.035;
            g.drawImage(this.glow(p.lamp), x - size / 2, ly - size / 2, size, size);
            if (kind === 'bridge') {
                // and its shimmer on the river
                g.globalAlpha = 0.35;
                g.drawImage(this.glow(p.lamp), x - size * 0.15, ly, size * 0.3, H * 0.12);
                g.globalAlpha = 1;
            }
        });
        // Coast: boat lights riding the swell, each with its reflection
        slots(170, 10, (n, x) => {
            const kind = kindAt(L0 + x);
            if (kind !== 'coast' || hash(n, seed + 11) > 0.3) return;
            const by = H * (0.565 + hash(n, seed + 12) * 0.08), size = H * (0.016 + hash(n, seed + 13) * 0.01);
            g.drawImage(this.glow(p.windows[n & 1]), x - size / 2, by - size / 2, size, size);
            g.globalAlpha = 0.3;
            g.drawImage(this.glow(p.windows[n & 1]), x - size * 0.12, by, size * 0.24, size * 3);
            g.globalAlpha = 1;
        });
        g.globalCompositeOperation = 'source-over';
        return canvas;
    }

    tree(g, x, y, size, color, snow) {
        g.fillStyle = color;
        g.beginPath();
        g.ellipse(x, y - size * 0.75, size * 0.55, size * 0.75, 0, 0, Math.PI * 2);
        g.fill();
        g.fillRect(x - size * 0.06, y - size * 0.3, size * 0.12, size * 0.3);
        if (snow) {
            g.fillStyle = 'rgba(210, 222, 240, 0.55)';
            g.beginPath();
            g.ellipse(x - size * 0.1, y - size * 1.25, size * 0.32, size * 0.12, -0.3, 0, Math.PI * 2);
            g.fill();
        }
    }

    house(g, x, y, size, n, snow) {
        const p = this.palette, w = size * 1.6;
        g.fillStyle = p.building[n % 3];
        g.fillRect(x, y - size, w, size);
        g.beginPath();
        g.moveTo(x - size * 0.12, y - size);
        g.lineTo(x + w / 2, y - size * 1.55);
        g.lineTo(x + w + size * 0.12, y - size);
        g.fill();
        if (p.snow) {
            g.strokeStyle = 'rgba(220, 230, 245, 0.8)';
            g.lineWidth = Math.max(1, size * 0.08);
            g.beginPath();
            g.moveTo(x - size * 0.12, y - size);
            g.lineTo(x + w / 2, y - size * 1.55);
            g.lineTo(x + w + size * 0.12, y - size);
            g.stroke();
        }
        g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) {
            if (hash(n * 3 + i, this.seed + 20) > 0.55) continue;
            const wx = x + size * (0.2 + i * 0.45), wy = y - size * 0.7;
            g.fillStyle = p.windows[i % p.windows.length];
            g.fillRect(wx, wy, size * 0.22, size * 0.28);
            const glow = size * 1.2;
            g.globalAlpha = 0.5;
            g.drawImage(this.glow(p.windows[0]), wx + size * 0.11 - glow / 2, wy + size * 0.14 - glow / 2, glow, glow);
            g.globalAlpha = 1;
        }
        g.globalCompositeOperation = 'source-over';
    }

    building(g, x, y, w, h, n, lit) {
        const p = this.palette;
        g.fillStyle = p.building[n % 3];
        g.fillRect(x, y - h, w, h);
        if (p.snow) {
            g.fillStyle = 'rgba(205, 218, 238, 0.7)';
            g.fillRect(x, y - h - 1.5, w, 2);
        }
        g.globalCompositeOperation = 'lighter';
        const cols = Math.max(1, Math.floor((w - 4) / 6)), rows = Math.max(1, Math.floor((h - 6) / 7));
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const roll = hash(n * 997 + r * 31 + c, this.seed + 21);
                if (roll > lit) continue;
                g.fillStyle = p.windows[Math.floor(roll * 97) % p.windows.length];
                g.globalAlpha = 0.55 + roll;
                g.fillRect(x + 3 + c * 6, y - h + 4 + r * 7, 2.6, 3.4);
            }
        }
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
    }

    spire(g, x, y, h) {
        g.fillStyle = this.palette.building[0];
        g.fillRect(x - h * 0.06, y - h * 0.62, h * 0.12, h * 0.62);
        g.beginPath();
        g.moveTo(x - h * 0.07, y - h * 0.62);
        g.lineTo(x, y - h);
        g.lineTo(x + h * 0.07, y - h * 0.62);
        g.fill();
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = this.palette.windows[0];
        g.globalAlpha = 0.7;
        g.fillRect(x - h * 0.02, y - h * 0.55, h * 0.04, h * 0.05);
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
    }

    // The near layer's ground: embankment, walls, the sea wall, a platform,
    // or the river under a bridge.
    nearGround(kind, L) {
        const H = this.view.h;
        if (kind === 'station') return H * 0.8;
        if (kind === 'town') return H * 0.86;
        if (kind === 'coast') return H * 0.9;
        if (kind === 'bridge') return H * 0.93;
        return H * (0.875 + 0.012 * Math.sin(L / 53 + this.seed) + 0.006 * Math.sin(L / 19));
    }

    paintNear(index) {
        const { TILE, NEAR_BAND } = NIGHT_TRAIN;
        const { view, palette: p, k } = this;
        const H = view.h, top = NEAR_BAND[0] * H, bottom = H;
        const { canvas, g } = this.layer(TILE, bottom - top);
        g.translate(0, -top);
        const L0 = index * TILE;
        const kindAt = L => this.route.at(L / k).kind;
        const seed = this.seed;
        // Low halves the near detail (SPEC §10.16)
        const detail = this.host.quality.density < 0.5 ? 2 : 1;

        const columns = [];
        for (let x = -3; x <= TILE + 3; x += 3) {
            const kind = kindAt(L0 + x);
            columns.push({ x, kind, y: this.nearGround(kind, L0 + x) });
        }
        // The river under a bridge
        for (const c of columns) {
            if (c.kind !== 'bridge') continue;
            g.fillStyle = p.water[1];
            g.fillRect(c.x, H * 0.84, 3.5, H * 0.16);
        }
        g.fillStyle = p.near;
        g.beginPath();
        g.moveTo(-3, bottom);
        for (const c of columns) g.lineTo(c.x, c.kind === 'bridge' ? H * 0.93 : c.y);
        g.lineTo(TILE + 3, bottom);
        g.fill();
        // A moonlit (or lamplit) edge along the top
        g.strokeStyle = p.nearEdge;
        g.globalAlpha = p.snow ? 0.75 : 0.45;
        g.lineWidth = p.snow ? 2.2 : 1.2;
        g.beginPath();
        for (const c of columns) if (c.kind !== 'station') g.lineTo(c.x, c.y + 1); else g.moveTo(c.x, c.y);
        g.stroke();
        g.globalAlpha = 1;

        const slots = (size, reach, fn) => {
            for (let n = Math.floor((L0 - reach) / size); n * size < L0 + TILE + reach; n++) fn(n, n * size - L0);
        };
        // Countryside: bushes, fence posts and wire, now and then a signal
        slots(22 * detail, 30, (n, x) => {
            const kind = kindAt(L0 + x);
            if (kind !== 'countryside' && kind !== 'tunnel') return;
            if (hash(n, seed + 30) > 0.4) return;
            const s = H * (0.02 + hash(n, seed + 31) * 0.035), gy = this.nearGround(kind, L0 + x);
            g.fillStyle = p.near;
            g.beginPath();
            g.ellipse(x, gy - s * 0.4, s * (0.8 + hash(n, seed + 32)), s, 0, 0, Math.PI * 2);
            g.fill();
            if (p.snow) {
                g.fillStyle = 'rgba(200, 214, 235, 0.55)';
                g.beginPath();
                g.ellipse(x, gy - s * 1.15, s * 0.7, s * 0.25, 0, 0, Math.PI * 2);
                g.fill();
            }
        });
        g.strokeStyle = p.near;
        g.lineWidth = 1.2;
        g.beginPath();
        slots(44 * detail, 0, (n, x) => {
            const kind = kindAt(L0 + x);
            if (kind !== 'countryside') return;
            const gy = this.nearGround(kind, L0 + x);
            g.fillStyle = p.near;
            g.fillRect(x - 1, gy - H * 0.045, 2.2, H * 0.045);
            g.moveTo(x, gy - H * 0.038);
            g.lineTo(x + 44 * detail, this.nearGround(kind, L0 + x + 44 * detail) - H * 0.038);
            g.moveTo(x, gy - H * 0.022);
            g.lineTo(x + 44 * detail, this.nearGround(kind, L0 + x + 44 * detail) - H * 0.022);
        });
        g.stroke();
        slots(900, 10, (n, x) => {
            const kind = kindAt(L0 + x);
            if (kind !== 'countryside' || hash(n, seed + 33) > 0.3) return;
            const gy = this.nearGround(kind, L0 + x);
            g.fillStyle = p.near;
            g.fillRect(x - 1.5, gy - H * 0.2, 3, H * 0.2);
            g.fillRect(x - H * 0.012, gy - H * 0.22, H * 0.024, H * 0.04);
            const size = H * 0.04;
            g.globalCompositeOperation = 'lighter';
            g.drawImage(this.glow(hash(n, seed + 34) < 0.5 ? '#ff3b30' : '#3dff9a'), x - size / 2, gy - H * 0.21 - size / 2, size, size);
            g.globalCompositeOperation = 'source-over';
        });
        // Town: a brick wall with coping
        slots(14, 0, (n, x) => {
            const kind = kindAt(L0 + x);
            if (kind !== 'town') return;
            g.fillStyle = p.nearEdge;
            g.globalAlpha = 0.18;
            g.fillRect(x, H * 0.86, 13, 1);
            g.globalAlpha = 1;
        });
        // Station: the platform, lit in pools under the lamps
        slots(3, 0, (n, x) => {
            if (kindAt(L0 + x) !== 'station') return;
            g.fillStyle = p.platform[0];
            g.fillRect(x, H * 0.8, 3.2, H * 0.03);
            g.fillStyle = p.platform[1];
            g.fillRect(x, H * 0.83, 3.2, H * 0.17);
            g.fillStyle = '#d8b84a';
            g.fillRect(x, H * 0.804, 3.2, H * 0.006);
        });
        g.globalCompositeOperation = 'lighter';
        slots(this.lampGap() * k, 40, (n, x) => {
            if (kindAt(L0 + x) !== 'station') return;
            g.globalAlpha = 0.55;
            g.drawImage(this.glow(p.lamp), x - H * 0.14, H * 0.77, H * 0.28, H * 0.09);
            g.globalAlpha = 0.25;
            g.drawImage(this.glow(p.lamp), x - H * 0.1, H * 0.83, H * 0.2, H * 0.14);
        });
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
        // and someone waiting, now and then, with a case
        slots(340, 20, (n, x) => {
            if (kindAt(L0 + x) !== 'station' || hash(n, seed + 35) > 0.4) return;
            this.figure(g, x, H * 0.802, H * 0.12, hash(n, seed + 36));
        });
        return canvas;
    }

    lampGap() {
        return 300;
    }

    figure(g, x, y, h, roll) {
        g.fillStyle = '#0b0a0c';
        g.beginPath();
        g.arc(x, y - h * 0.9, h * 0.08, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.roundRect(x - h * 0.11, y - h * 0.8, h * 0.22, h * 0.45, h * 0.06);
        g.fill();
        g.fillRect(x - h * 0.08, y - h * 0.38, h * 0.06, h * 0.38);
        g.fillRect(x + h * 0.02, y - h * 0.38, h * 0.06, h * 0.38);
        if (roll < 0.2) g.fillRect(x + h * 0.14, y - h * 0.22, h * 0.18, h * 0.2);
        // Hat
        if (roll > 0.25) g.fillRect(x - h * 0.1, y - h * 0.97, h * 0.2, h * 0.03);
    }

    // ---- The journey ------------------------------------------------------------

    seedGlass() {
        this.drops = [];
        this.flakes = [];
        if (!this.view) return;
        const count = this.dropCap();
        for (let i = 0; i < count; i++) this.drops.push(this.newDrop(Math.random()));
        if (this.palette.snow) for (let i = 0; i < this.flakeCap(); i++) this.flakes.push(this.newFlake(true));
    }

    dropCap() {
        return Math.round(this.config.rain * 160 * this.host.quality.density * Math.min(2, this.view.w * this.view.h / 900000));
    }

    flakeCap() {
        return Math.round(220 * this.host.quality.density * Math.min(2, this.view.w * this.view.h / 900000));
    }

    newDrop(age = 0) {
        const life = 0.8 + Math.random() * 2.2;
        return { x: this.view.x + Math.random() * (this.view.w + 120), y: this.view.y + Math.random() * this.view.h, age: age * life, life, weight: 0.5 + Math.random() };
    }

    newFlake(anywhere) {
        return {
            x: this.view.x + (anywhere ? Math.random() : 1.02) * this.view.w,
            y: this.view.y + Math.random() * this.view.h,
            z: 0.3 + Math.random() * 0.7,
            phase: Math.random() * 6.3,
        };
    }

    frame(time) {
        if (!this.isRunning) return;
        const wallMs = this.lastTime ? time - this.lastTime : 0;
        const dt = Math.min(wallMs, 100) / 1000;
        this.lastTime = time;
        const cruise = NightTrainRoute.CRUISE * this.config.speed;
        NightTrainRoute.step(this.train, dt, Math.min(wallMs, 60000) / 1000, this.route, cruise);
        this.pan += (this.panTarget - this.pan) * (1 - Math.exp(-dt * 4));
        const ease = Math.min(1, dt / 1.5 * 3);
        this.fade.reflection += (this.wantsReflection() - this.fade.reflection) * ease;
        this.fade.soft += (this.wants('softRain') - this.fade.soft) * ease;

        this.update(dt);
        this.draw();

        // Waiting at a platform: barely anything moves. Dry and snowless,
        // a frame a second (for the clock); with rain or snow, a gentle 14.
        if (this.train.dwell > 0.2) {
            const still = !this.config.rain && !this.palette.snow;
            this.host.idleUntil(still ? Math.min(1000, this.train.dwell * 1000) : 70);
        }
        this.animationId = requestAnimationFrame(t => this.frame(t));
    }

    update(dt) {
        const { view } = this;
        const speed = this.train.v / NightTrainRoute.CRUISE;   // 1 at Speed 1's cruise
        const scale = view.h / 800;
        // How much of the window is in a tunnel: no rain reaches the glass there
        const half = this.halfWidth();
        const dark = NightTrainRoute.darkSpans(this.route, this.train.x, -half, half).reduce((sum, [a, b]) => sum + b - a, 0) / (half * 2);
        this.dark = dark;

        // Drops on the glass: blown back and down, steeper as the train slows
        const vx = -(30 + 520 * Math.min(1.6, speed)) * scale;
        const vy = (50 + 160 * Math.max(0, 1 - speed * 0.75)) * scale;
        this.dropVelocity = [vx, vy];
        const cap = this.dropCap();
        for (let i = this.drops.length - 1; i >= 0; i--) {
            const d = this.drops[i];
            d.age += dt;
            d.x += vx * d.weight * dt;
            d.y += vy * d.weight * dt;
            if (d.age > d.life || d.x < view.x - 40 || d.y > view.y + view.h + 20) {
                if (this.drops.length > cap || Math.random() < dark) {
                    this.drops[i] = this.drops[this.drops.length - 1];
                    this.drops.pop();
                } else {
                    Object.assign(d, this.newDrop());
                }
            }
        }
        // New drops arrive as the rain allows, none in a tunnel
        let arrivals = (cap - this.drops.length) * dt * 0.8 * (1 - dark);
        while (arrivals > Math.random() && this.drops.length < cap) {
            this.drops.push(this.newDrop());
            arrivals--;
        }

        // Snow outside: flakes near the train stream past nearly as fast as
        // the poles; far ones drift
        if (this.palette.snow) {
            const flakeCap = this.flakeCap();
            for (let i = this.flakes.length - 1; i >= 0; i--) {
                const f = this.flakes[i];
                f.x -= this.train.v * this.k * (0.08 + 0.6 * f.z * f.z) * dt + 6 * dt;
                f.y += (18 + 40 * f.z) * scale * dt;
                f.phase += dt * 1.3;
                if (f.x < view.x - 30 || f.y > view.y + view.h + 10) {
                    if (this.flakes.length > flakeCap) {
                        this.flakes[i] = this.flakes[this.flakes.length - 1];
                        this.flakes.pop();
                        continue;
                    }
                    Object.assign(f, this.newFlake(false));
                    if (f.y > view.y + view.h + 10 || Math.random() < 0.5) {
                        f.y = view.y - 10;
                        f.x = view.x + Math.random() * (view.w + 30);
                    }
                }
            }
            while (this.flakes.length < flakeCap) this.flakes.push(this.newFlake(false));
        }

        // Cars on the lane in the middle distance, both ways
        const lane = NIGHT_TRAIN.MID * this.k;
        if (this.cars.length < 3 && Math.random() < dt * 0.25 * this.host.quality.density) {
            const toward = Math.random() < 0.5;
            const at = this.train.x * lane + (Math.random() - 0.5) * view.w;
            this.cars.push({ L: at, v: (toward ? -1 : 1) * (40 + Math.random() * 40) * scale, age: 0 });
        }
        for (const car of this.cars) {
            car.L += car.v * dt;
            car.age += dt;
        }
        this.cars = this.cars.filter(car => car.age < 30);
    }

    // Screen x of layer coordinate L on a layer moving at `factor`.
    layerX(L, factor) {
        return this.cx + L - this.train.x * factor * this.k + this.pan * 70 * factor;
    }

    draw() {
        const { ctx, view, dpr } = this;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(this.sky, view.x, view.y, view.w, view.h);
        this.drawStrip(this.clouds, this.cloudPeriod, NIGHT_TRAIN.CLOUDS, view.y + view.h * 0.02, this.cloudHeight, 8);
        this.drawStrip(this.far, this.farPeriod, NIGHT_TRAIN.FAR, view.y + this.farTop, this.farHeight, 0);
        this.drawTiles(this.mid, NIGHT_TRAIN.MID, NIGHT_TRAIN.MID_BAND, i => this.paintMid(i));
        this.drawMidLife();
        if (this.palette.snow) this.drawFlakes(0.6);
        this.drawTiles(this.near, 1, NIGHT_TRAIN.NEAR_BAND, i => this.paintNear(i));
        this.drawOverhead();
        if (this.palette.snow) this.drawFlakes(1);
        this.drawTunnels();
        this.drawGlass();
        ctx.drawImage(this.frameLayer, 0, 0, this.w, this.h);
    }

    // A repeating strip that drifts at `factor`, plus `drift` px/s of its own.
    drawStrip(canvas, period, factor, y, height, drift) {
        const { ctx, view } = this;
        const shift = this.train.x * factor * this.k - this.pan * 70 * factor + (drift ? performance.now() / 1000 * drift : 0);
        let x = view.x - (((shift % period) + period) % period);
        for (; x < view.x + view.w; x += period) ctx.drawImage(canvas, Math.round(x * this.dpr) / this.dpr, y, period, height);
    }

    drawTiles(cache, factor, band, paint) {
        const { ctx, view } = this;
        const TILE = NIGHT_TRAIN.TILE;
        const left = this.train.x * factor * this.k - this.pan * 70 * factor - (this.cx - view.x);
        const i0 = Math.floor(left / TILE), i1 = Math.floor((left + view.w) / TILE);
        const top = view.y + band[0] * view.h, height = (band[1] - band[0]) * view.h;
        let painted = 0;
        for (let i = i0; i <= i1; i++) {
            let tile = cache.get(i);
            if (!tile) {
                cache.set(i, tile = paint(i));
                painted++;
            }
            const x = Math.round((view.x + i * TILE - left) * this.dpr) / this.dpr;
            ctx.drawImage(tile, x, top, TILE, height);
        }
        // One tile ahead, if nothing else was painted this frame
        if (!painted && !cache.has(i1 + 1)) cache.set(i1 + 1, paint(i1 + 1));
        for (const key of cache.keys()) if (key < i0 - 1 || key > i1 + 2) cache.delete(key);
    }

    // Headlights on the lane, and the moon's path on the sea.
    drawMidLife() {
        const { ctx, view, palette: p, k } = this;
        const lane = NIGHT_TRAIN.MID;
        ctx.globalCompositeOperation = 'lighter';
        for (const car of this.cars) {
            const x = this.layerX(car.L, lane);
            if (x < view.x - 10 || x > view.x + view.w + 10) continue;
            if (this.route.at(car.L / (lane * k)).kind !== 'countryside') continue;
            const y = this.Y(this.midGround('countryside', car.L) / view.h + 0.012);
            const size = view.h * 0.03;
            ctx.globalAlpha = Math.min(1, car.age);
            ctx.drawImage(this.glow(car.v < 0 ? '#fff4d8' : '#ff3b30'), x - size / 2, y - size / 2, size, size);
            ctx.drawImage(this.glow(car.v < 0 ? '#fff4d8' : '#ff3b30'), x + size * 0.15 - size / 2, y - size / 2, size, size);
        }
        ctx.globalAlpha = 1;
        // The moon's glitter on open water, under the moon wherever the sea is
        if (this.moonX !== null) {
            const mx = view.x + this.moonX;
            const L = mx - this.cx + this.train.x * lane * k - this.pan * 70 * lane;
            const kind = this.route.at(L / (lane * k)).kind;
            if (kind === 'coast') {
                const t = performance.now() / 1000;
                for (let i = 0; i < 26; i++) {
                    const y = this.Y(0.552 + i * 0.0145);
                    const spread = view.h * (0.004 + i * 0.0022);
                    const flicker = 0.5 + 0.5 * Math.sin(t * 2.3 + i * 1.7);
                    ctx.globalAlpha = (0.55 - i * 0.017) * (0.4 + 0.6 * flicker);
                    ctx.fillStyle = p.moon;
                    ctx.fillRect(mx - spread * (0.5 + 0.5 * Math.sin(i * 2.1 + t)), y, spread * 2 * (0.6 + 0.4 * flicker), 1.2);
                }
                ctx.globalAlpha = 1;
            }
        }
        ctx.globalCompositeOperation = 'source-over';
    }

    // Poles and the wires between them, a bridge's girders, a station's
    // canopy, lamps and clock: near things that rise above the near tiles.
    drawOverhead() {
        const { ctx, view, palette: p, k } = this;
        const H = view.h, X = this.train.x, half = this.halfWidth() + 120 / k;
        const sx = W => this.cx + (W - X) * k + this.pan * 70;
        const pole = NIGHT_TRAIN.POLE;
        const segments = NightTrainRoute.between(this.route, X - half, X + half);
        const kindAt = W => this.route.at(W).kind;

        // Wires, sagging between the poles
        const first = Math.floor((X - half) / pole), last = Math.ceil((X + half) / pole);
        ctx.strokeStyle = p.wire;
        ctx.lineWidth = Math.max(1, H * 0.0016);
        ctx.beginPath();
        for (let n = first; n < last; n++) {
            const a = sx(n * pole), b = sx((n + 1) * pole);
            ctx.moveTo(a, this.Y(0.12));
            ctx.quadraticCurveTo((a + b) / 2, this.Y(0.17), b, this.Y(0.12));
            ctx.moveTo(a, this.Y(0.175));
            ctx.lineTo(b, this.Y(0.175));
        }
        ctx.stroke();
        // Poles
        ctx.fillStyle = p.near;
        for (let n = first; n <= last; n++) {
            const kind = kindAt(n * pole);
            if (kind === 'bridge' || kind === 'station' || kind === 'tunnel') continue;
            const x = sx(n * pole), ground = view.y + this.nearGround(kind, n * pole * k);
            ctx.fillRect(x - H * 0.007, this.Y(0.1), H * 0.014, ground - this.Y(0.1));
            ctx.fillRect(x - H * 0.03, this.Y(0.11), H * 0.06, H * 0.008);
            ctx.fillRect(x - H * 0.004, this.Y(0.165), H * 0.03, H * 0.006);
        }
        for (const s of segments) {
            if (s.kind === 'bridge') this.drawTruss(s, sx);
            if (s.kind === 'station') this.drawCanopy(s, sx);
        }
    }

    drawTruss(s, sx) {
        const { ctx, view, palette: p } = this;
        const H = view.h, bay = 300;
        const top = this.Y(0.07), bottom = this.Y(0.9);
        const x0 = sx(s.start), x1 = sx(s.end);
        ctx.strokeStyle = p.near;
        ctx.lineWidth = H * 0.016;
        ctx.beginPath();
        ctx.moveTo(x0, top); ctx.lineTo(x1, top);
        ctx.moveTo(x0, bottom); ctx.lineTo(x1, bottom);
        const bays = Math.max(1, Math.round((s.end - s.start) / bay));
        for (let i = 0; i <= bays; i++) {
            const x = x0 + (x1 - x0) * i / bays;
            ctx.moveTo(x, top);
            ctx.lineTo(x, bottom);
            if (i < bays) {
                const next = x0 + (x1 - x0) * (i + 1) / bays;
                ctx.moveTo(i % 2 ? x : next, top);
                ctx.lineTo(i % 2 ? next : x, bottom);
            }
        }
        ctx.stroke();
        // Rivet-line highlights where the moon catches the steel
        ctx.strokeStyle = p.rim;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x0, top - H * 0.008); ctx.lineTo(x1, top - H * 0.008);
        ctx.moveTo(x0, bottom - H * 0.008); ctx.lineTo(x1, bottom - H * 0.008);
        ctx.stroke();
    }

    drawCanopy(s, sx) {
        const { ctx, view, palette: p } = this;
        const H = view.h, gap = this.lampGap();
        const x0 = Math.max(view.x - 20, sx(s.start)), x1 = Math.min(view.x + view.w + 20, sx(s.end));
        if (x1 <= x0) return;
        // Roof and its fascia
        ctx.fillStyle = p.near;
        ctx.fillRect(x0, view.y, x1 - x0, H * 0.1);
        ctx.fillStyle = p.platform[1];
        ctx.fillRect(x0, view.y + H * 0.1, x1 - x0, H * 0.012);
        // Pillars every other lamp; lamps hanging under the roof
        for (let W = Math.ceil(s.start / gap) * gap; W < s.end; W += gap) {
            const x = sx(W);
            if (x < view.x - 60 || x > view.x + view.w + 60) continue;
            if (Math.round(W / gap) % 2 === 0) {
                ctx.fillStyle = p.near;
                ctx.fillRect(x - H * 0.008 - gap * this.k / 2, view.y + H * 0.1, H * 0.016, H * 0.7);
            }
            ctx.fillStyle = '#26262a';
            ctx.fillRect(x - H * 0.016, view.y + H * 0.112, H * 0.032, H * 0.012);
            ctx.globalCompositeOperation = 'lighter';
            const size = H * 0.16;
            ctx.drawImage(this.glow(p.lamp), x - size / 2, view.y + H * 0.13 - size / 2, size, size);
            ctx.globalCompositeOperation = 'source-over';
        }
        // A sign hung from the roof either side of the middle (no names: just its shape)
        for (const at of [s.stop - 700, s.stop + 900]) {
            const x = sx(at);
            ctx.fillStyle = '#1d2b4a';
            ctx.fillRect(x - H * 0.09, view.y + H * 0.16, H * 0.18, H * 0.045);
            ctx.fillStyle = 'rgba(240, 240, 230, 0.75)';
            ctx.fillRect(x - H * 0.07, view.y + H * 0.177, H * 0.09, H * 0.008);
            ctx.fillRect(x + H * 0.03, view.y + H * 0.177, H * 0.04, H * 0.008);
            ctx.fillStyle = '#26262a';
            ctx.fillRect(x - H * 0.06, view.y + H * 0.112, 1.5, H * 0.048);
            ctx.fillRect(x + H * 0.06, view.y + H * 0.112, 1.5, H * 0.048);
        }
        this.drawClock(sx(s.stop + 120), view.y + H * 0.215, H * 0.038);
    }

    // The station clock tells the stage's time (host.now()).
    drawClock(x, y, r) {
        const { ctx } = this;
        const now = this.host.now();
        ctx.fillStyle = '#26262a';
        ctx.fillRect(x - 1, y - r * 2.6, 2, r * 1.6);
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(this.glow('#fff1d0'), x - r * 2.2, y - r * 2.2, r * 4.4, r * 4.4);
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#f4eedc';
        ctx.strokeStyle = '#1b1b1f';
        ctx.lineWidth = Math.max(1.5, r * 0.14);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#1b1b1f';
        for (let i = 0; i < 12; i++) {
            const a = i / 12 * Math.PI * 2;
            ctx.fillRect(x + Math.sin(a) * r * 0.78 - 0.6, y - Math.cos(a) * r * 0.78 - 0.6, 1.2, 1.2);
        }
        const minutes = now.getMinutes() + now.getSeconds() / 60, hours = (now.getHours() % 12) + minutes / 60;
        ctx.lineCap = 'round';
        for (const [turn, length, width] of [[hours / 12, 0.5, 0.12], [minutes / 60, 0.78, 0.08]]) {
            const a = turn * Math.PI * 2;
            ctx.lineWidth = Math.max(1, r * width);
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + Math.sin(a) * r * length, y - Math.cos(a) * r * length);
            ctx.stroke();
        }
        ctx.lineCap = 'butt';
    }

    // Tunnels: black, the mouths sweeping past, lamps flashing by, and the
    // carriage mirrored in the glass, only there.
    drawTunnels() {
        const { ctx, view, palette: p, k } = this;
        const H = view.h, half = this.halfWidth() + (this.portalWidth + 80) / k;
        const sx = u => this.cx + u * k + this.pan * 70;
        this.reflectionShown = 0;
        for (const [a, b] of NightTrainRoute.darkSpans(this.route, this.train.x, -half, half)) {
            const x0 = Math.max(view.x, sx(a)), x1 = Math.min(view.x + view.w, sx(b));
            if (x1 <= x0) continue;
            ctx.fillStyle = p.tunnel;
            ctx.fillRect(x0, view.y, x1 - x0, view.h);
            // Lamps on the tunnel wall, smeared by the speed
            const gap = 460, X = this.train.x;
            const smear = H * 0.05 + this.train.v * k * 0.035;
            ctx.globalCompositeOperation = 'lighter';
            for (let W = Math.ceil((X + a) / gap) * gap; W < X + b; W += gap) {
                const x = sx(W - X);
                if (x < x0 - smear || x > x1 + smear) continue;
                ctx.globalAlpha = 0.18;
                ctx.drawImage(this.glow(p.tunnelLamp), x - H * 0.25, this.Y(0.05), H * 0.5, H * 0.5);
                ctx.globalAlpha = 1;
                ctx.drawImage(this.glow(p.tunnelLamp), x - smear / 2, this.Y(0.3) - H * 0.02, smear, H * 0.04);
            }
            if (this.fade.reflection > 0.01) {
                const s = this.reflection.width / view.w;
                ctx.globalAlpha = 0.6 * this.fade.reflection;
                ctx.drawImage(this.reflection, (x0 - view.x) * s, 0, (x1 - x0) * s, this.reflection.height, x0, view.y, x1 - x0, view.h);
                ctx.globalAlpha = 1;
                this.reflectionShown += x1 - x0;
            }
            ctx.globalCompositeOperation = 'source-over';
            // The mouths: stone faces just outside the dark
            const pw = this.portalWidth;
            if (sx(a) > view.x - pw) ctx.drawImage(this.portal, sx(a) - pw, view.y, pw, view.h);
            if (sx(b) < view.x + view.w + pw) {
                ctx.save();
                ctx.translate(sx(b) + pw, view.y);
                ctx.scale(-1, 1);
                ctx.drawImage(this.portal, 0, 0, pw, view.h);
                ctx.restore();
            }
        }
    }

    drawFlakes(nearness) {
        const { ctx } = this;
        const streak = this.train.v * this.k * 0.022;
        ctx.strokeStyle = 'rgba(235, 242, 255, 0.85)';
        ctx.lineCap = 'round';
        for (const band of [0, 1]) {
            ctx.lineWidth = band ? 2.4 : 1.3;
            ctx.globalAlpha = band ? 0.9 : 0.55;
            ctx.beginPath();
            for (const f of this.flakes) {
                if ((f.z > 0.65) !== !!band || (nearness < 1) === (f.z > 0.65)) continue;
                const x = f.x + Math.sin(f.phase) * 4, len = 0.4 + streak * f.z * f.z;
                ctx.moveTo(x, f.y);
                ctx.lineTo(x + len, f.y - len * 0.08);
            }
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.lineCap = 'butt';
    }

    // Rain on the window: clinging beads, and streaks running back.
    drawGlass() {
        const { ctx, view } = this;
        if (!this.config.rain) return;
        const speed = this.train.v / NightTrainRoute.CRUISE;
        ctx.globalAlpha = this.config.rain * (0.35 + 0.65 * Math.max(0, 1 - speed * 0.7)) * (1 - this.dark * 0.6);
        ctx.drawImage(this.beads, view.x, view.y, view.w, view.h);
        ctx.globalAlpha = 1;
        const [vx, vy] = this.dropVelocity || [0, 0];
        const trail = 0.05 + 0.04 * Math.min(1, speed);
        const [r, g, b] = this.palette.drop;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (const d of this.drops) {
            const fade = Math.min(1, d.age * 4, (d.life - d.age) * 3);
            if (fade <= 0.05) continue;
            const tx = Math.max(3, -vx * d.weight * trail), ty = Math.max(4, vy * d.weight * trail);
            ctx.moveTo(d.x, d.y);
            ctx.lineTo(d.x + tx, d.y - ty);
        }
        if (this.fade.soft > 0.01) {
            // The streaks' softness: a wide faint pass under the sharp one
            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${0.07 * this.fade.soft})`;
            ctx.lineWidth = 3.2;
            ctx.stroke();
        }
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.42)`;
        ctx.lineWidth = 1.1;
        ctx.stroke();
        ctx.lineCap = 'butt';
        // Each streak led by its drop: a bead with a lit edge
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.55)`;
        ctx.beginPath();
        for (const d of this.drops) {
            if (Math.min(d.age * 4, (d.life - d.age) * 3) <= 0.3) continue;
            const size = 0.9 + d.weight * 0.9;
            ctx.moveTo(d.x + size, d.y);
            ctx.arc(d.x, d.y, size, 0, Math.PI * 2);
        }
        ctx.fill();
    }
}

// ---- Helpers ------------------------------------------------------------------

function rgba(hex, alpha) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// A stable random number in [0, 1) for slot n: the same feature every time
// a tile is painted.
function hash(n, salt) {
    let h = Math.imul((n | 0) ^ Math.imul(salt | 0, 0x9e3779b1), 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}
