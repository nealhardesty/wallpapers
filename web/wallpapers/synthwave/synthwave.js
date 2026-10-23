// Synthwave (SPEC §10.10): the retro drive. A neon grid rushing towards a
// striped sun, wireframe mountains on the horizon, palms sliding past on
// the verges and tail lights pulling away up the highway.
//
// Cheap by construction (SPEC §4.8): the sky, stars, sun, mountains, floor,
// horizon fog and scanlines are baked once per resize or palette; a frame
// is a few image copies, about a hundred lines and a handful of sprites.
// The grid's glow is the grid drawn again into a quarter-size buffer and
// copied back up with 'lighter', never shadowBlur.

// The geometry, kept pure so the unit tests can prove the grid moves by
// elapsed time: the same distance at any frame rate (tools/synthwave.test.mjs).
const SynthwaveGrid = {
    SPACING: 0.25,    // world units between grid lines, both ways (the camera is 1 unit up)
    SPEED: 3,         // world units a second at Speed 1
    NEAR: 0.9,        // nearest depth drawn: just below the bottom of the screen
    FAR: 9,           // furthest grid line; the horizon fog takes over from about 5

    // Distance travelled after a frame of dtMs (clamped at 100 ms, so a
    // backgrounded tab doesn't lurch, and the slow 10 fps tier still runs).
    advance(distance, dtMs, speed) {
        return distance + Math.min(Math.max(dtMs, 0), 100) / 1000 * speed * SynthwaveGrid.SPEED;
    },

    // Depths of the cross lines in view, far to near. Lines sit at fixed
    // world positions, every `spacing`; the camera has come `distance`.
    rows(distance, spacing, near = SynthwaveGrid.NEAR, far = SynthwaveGrid.FAR) {
        const phase = ((distance % spacing) + spacing) % spacing;
        const out = [];
        for (let k = Math.floor((far + phase) / spacing); k * spacing - phase >= near; k--) {
            const z = k * spacing - phase;
            if (z <= far) out.push(z);
        }
        return out;
    },

    // The sun's gaps, as [top, bottom] fractions of its diameter. Each is
    // born as a hairline a third of the way down, then drifts down, widening
    // towards the horizon; `seconds` is elapsed time.
    stripes(seconds, count = 7, rate = 0.045) {
        const out = [];
        for (let k = 0; k < count; k++) {
            const p = ((k / count + seconds * rate) % 1 + 1) % 1;
            const y = 0.3 + 0.7 * p;
            const half = (0.004 + 0.08 * Math.pow(p, 1.25)) / 2;
            out.push([y - half, y + half]);
        }
        return out.sort((a, b) => a[0] - b[0]);
    },
};

const SYNTHWAVE_PALETTES = {
    outrun: {
        sky: ['#07011a', '#1d0840', '#4a0f63', '#b8237e'],
        sun: ['#fff27a', '#ffb33c', '#ff5a6e', '#ff1f9e'],
        sunGlow: '#ff3f9f', horizon: '#ff6ac1',
        grid: '#ff3fd2', floor: ['#1a0533', '#07010f'],
        mountain: ['#1b0838', '#0b0320'], mountainLine: '#8a5cff', ridge: '#ff5ad9',
        palm: '#0b0216', rim: '#ff4fd8', road: '#06010d', dash: '#ffd4f4',
        tail: '#ff2a3c', star: '#ffe9ff',
    },
    vaporwave: {
        sky: ['#1b1546', '#45307d', '#9b62b4', '#f6a9cd'],
        sun: ['#fff6c4', '#ffd0e4', '#ff9fd1', '#b892ff'],
        sunGlow: '#ffa8dc', horizon: '#ffd2f0',
        grid: '#7ef6ff', floor: ['#2d2163', '#120c30'],
        mountain: ['#35287a', '#1f1750'], mountainLine: '#ff9ee8', ridge: '#aef9ff',
        palm: '#1d1544', rim: '#7ef6ff', road: '#150f38', dash: '#fff3fb',
        tail: '#ff5c8a', star: '#fff6ff',
    },
    ice: {
        sky: ['#01040f', '#041a3a', '#0b3f74', '#3d9ad4'],
        sun: ['#ffffff', '#d4f6ff', '#7fd8ff', '#2f7bff'],
        sunGlow: '#5fc8ff', horizon: '#9fe6ff',
        grid: '#38d6ff', floor: ['#031634', '#010510'],
        mountain: ['#06183a', '#020a1e'], mountainLine: '#3c8dff', ridge: '#b8f4ff',
        palm: '#010612', rim: '#8ff0ff', road: '#010410', dash: '#e2fbff',
        tail: '#ff3355', star: '#eaf8ff',
    },
    sunset: {
        sky: ['#0d020b', '#33081f', '#7a1a2c', '#ff6a3a'],
        sun: ['#fff38a', '#ffc03a', '#ff7a2a', '#ff2f3f'],
        sunGlow: '#ff6a2a', horizon: '#ffb259',
        grid: '#ff8a2a', floor: ['#220610', '#0a0105'],
        mountain: ['#2a0918', '#12030a'], mountainLine: '#ff5a4a', ridge: '#ffc85a',
        palm: '#100207', rim: '#ff9a3c', road: '#0a0104', dash: '#fff0d0',
        tail: '#ff2a2a', star: '#fff2e0',
    },
};

class SynthwaveAnimationManager {
    constructor(host) {
        this.host = host;
        this.config = WP.settings.load();
        this.canvas = null;
        this.ctx = null;
        this.animationId = null;
        this.isRunning = false;
        this.lastTime = 0;

        this.distance = 0;       // world units driven: the grid's phase
        this.seconds = 0;        // elapsed time, for the sun's stripes
        this.pan = 0;            // Android home-screen offset, -0.5 to 0.5, eased
        this.panTarget = 0;
        this.hazeFade = this.wants('haze');
        this.palms = [[], []];   // left and right verges, far to near
        this.nextPalm = [0, 0];  // world position of the next palm to plant
        this.cars = [];
        this.carTimer = 2;       // seconds until the next car overtakes
        this.palmSprites = new Map();
        this.seed = Math.floor(Math.random() * 2 ** 31);
        this.onResize = () => this.build();
    }

    wants(effect) {
        return this.host.quality.effects.includes(effect) ? 1 : 0;
    }

    // Low draws every other grid line (SPEC §10.10).
    lineStep() {
        return this.host.quality.density < 0.5 ? 2 : 1;
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
        this.seedScene();
        this.lastTime = 0;
        this.animationId = requestAnimationFrame(t => this.frame(t));
    }

    stop() {
        this.isRunning = false;
        cancelAnimationFrame(this.animationId);
        window.removeEventListener('resize', this.onResize);
        this.canvas?.remove();
        this.canvas = this.ctx = null;
        this.palmSprites.clear();
    }

    applySettings(config) {
        const before = this.config;
        this.config = { ...config };
        const baked = ['palette', 'mountains', 'scanlines'].some(key => before[key] !== config[key]);
        if (baked && this.isRunning) {
            this.palmSprites.clear();
            this.build();
        }
        if (before.palms !== config.palms || before.road !== config.road) this.seedScene();
    }

    // Auto changed the tier: the haze fades, palms and cars thin or fill in
    // as they pass, and the grid's line count follows on the next frame.
    onQuality() {}

    onScroll(x) {
        this.panTarget = x - 0.5;
    }

    // ---- Baking ---------------------------------------------------------------

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
        this.palette = SYNTHWAVE_PALETTES[this.config.palette] || SYNTHWAVE_PALETTES.outrun;

        // The camera: horizon a little below the middle, and s pixels per
        // world unit at depth 1, which puts depth 1 at the bottom edge.
        const y0 = this.y0 = Math.round(h * 0.6);
        this.s = h - y0;
        this.cx = w / 2;
        this.margin = Math.ceil(w * 0.05);   // the front layer pans this far
        this.sunR = Math.round(Math.min(w * 0.36, h * 0.2));
        this.sunY = y0 - this.sunR * 0.42;

        this.bakeBack();
        this.bakeSun();
        this.bakeFront();
        this.bakeFog();
        this.bakeOverlay();
        this.bakeGlows();

        // The haze: the grid again at a quarter size, copied back up blurred.
        const haze = this.layer(Math.ceil(w / 4), Math.ceil((h - y0) / 4), 1);
        this.haze = haze.canvas;
        this.hazeCtx = haze.g;

        // The grid fades towards the horizon through one gradient stroke.
        this.gridStroke = this.fadeGradient(this.ctx, 0.12);
        this.hazeStroke = this.fadeGradient(this.hazeCtx, 0.05);
        this.roadFill = this.fadeGradient(this.ctx, 0.0, this.palette.dash);
    }

    fadeGradient(g, alphaAtHorizon, color = this.palette.grid) {
        const gradient = g.createLinearGradient(0, this.y0, 0, this.h);
        gradient.addColorStop(0, rgba(color, alphaAtHorizon));
        gradient.addColorStop(0.18, rgba(color, 0.55));
        gradient.addColorStop(1, rgba(color, 1));
        return gradient;
    }

    // Sky, stars and the wide glow around the sun.
    bakeBack() {
        const { w, h, y0, palette: p } = this;
        const { canvas, g } = this.layer(w, h);
        const sky = g.createLinearGradient(0, 0, 0, y0);
        sky.addColorStop(0, p.sky[0]);
        sky.addColorStop(0.45, p.sky[1]);
        sky.addColorStop(0.8, p.sky[2]);
        sky.addColorStop(1, p.sky[3]);
        g.fillStyle = sky;
        g.fillRect(0, 0, w, y0 + 1);
        g.fillStyle = p.floor[0];
        g.fillRect(0, y0, w, h - y0);

        // Stars from their own seed, so a tier change thins the same sky.
        const random = WP.seededRandom(this.seed);
        const count = Math.round(w * y0 / 2600);
        for (let i = 0; i < count; i++) {
            const x = random() * w, y = Math.pow(random(), 1.6) * y0 * 0.82;
            const fade = 1 - y / (y0 * 0.82);
            const size = 0.4 + Math.pow(random(), 3) * 1.3;
            g.globalAlpha = (0.25 + random() * 0.75) * fade;
            g.fillStyle = p.star;
            g.fillRect(x, y, size, size);
            if (size > 1.35) {
                g.globalAlpha *= 0.5;
                g.fillRect(x - size * 2, y + size / 2 - 0.25, size * 5, 0.5);
                g.fillRect(x + size / 2 - 0.25, y - size * 2, 0.5, size * 5);
            }
        }
        g.globalAlpha = 1;

        const r = this.sunR * 3.2;
        const glow = g.createRadialGradient(this.cx, this.sunY, this.sunR * 0.6, this.cx, this.sunY, r);
        glow.addColorStop(0, rgba(p.sunGlow, 0.45));
        glow.addColorStop(0.35, rgba(p.sunGlow, 0.14));
        glow.addColorStop(1, rgba(p.sunGlow, 0));
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = glow;
        g.fillRect(this.cx - r, this.sunY - r, r * 2, y0 - this.sunY + r);
        g.globalCompositeOperation = 'source-over';
        this.back = canvas;
    }

    // The disc, unstriped: the stripes are a clip, per frame.
    bakeSun() {
        const R = this.sunR, p = this.palette;
        const { canvas, g } = this.layer(R * 2, R * 2);
        const fill = g.createLinearGradient(0, 0, 0, R * 2);
        fill.addColorStop(0, p.sun[0]);
        fill.addColorStop(0.3, p.sun[1]);
        fill.addColorStop(0.52, p.sun[2]);
        fill.addColorStop(0.72, p.sun[3]);
        g.fillStyle = fill;
        g.beginPath();
        g.arc(R, R, R, 0, Math.PI * 2);
        g.fill();
        this.sun = canvas;
    }

    // Mountains and the floor, wider than the screen so they can pan.
    bakeFront() {
        const { w, h, y0, margin, palette: p } = this;
        const W = w + margin * 2;
        const { canvas, g } = this.layer(W, h);
        g.translate(margin, 0);
        if (this.config.mountains) {
            const random = WP.seededRandom(this.seed + 1);
            // A low far range right across, then two near massifs that
            // leave the middle open for the sun.
            this.range(g, random, { height: this.s * 0.32, rows: 4, alpha: 0.45, envelope: () => 0.55 });
            this.range(g, random, {
                height: this.s * 0.62, rows: 6, alpha: 0.8,
                envelope: x => Math.max(0, Math.min(1, (Math.abs(x - this.cx) / (w / 2) - 0.22) * 1.6)),
            });
        }
        const floor = g.createLinearGradient(0, y0, 0, h);
        floor.addColorStop(0, p.floor[0]);
        floor.addColorStop(1, p.floor[1]);
        g.fillStyle = floor;
        g.fillRect(-margin, y0, W, h - y0);
        this.front = canvas;
    }

    // One range of wireframe mountains: a filled silhouette, its contours
    // and ribs as a mesh fading towards the horizon, and a bright ridge.
    range(g, random, { height, rows, alpha, envelope }) {
        const { w, y0, cx, margin, palette: p } = this;
        const n = 64;
        const ridge = midpoint(n, 0.62, random);
        const points = ridge.map((v, i) => {
            const x = -margin + (w + margin * 2) * i / n;
            return { x, y: y0 - height * envelope(x) * (0.25 + 0.75 * v) };
        });
        // Points of contour j (0 at the ridge), widening slightly as they
        // come down, as if the slopes were nearer the camera.
        const at = (i, j) => {
            const t = j / rows, { x, y } = points[i];
            return [cx + (x - cx) * (1 + 0.06 * t), y + (y0 - y) * Math.pow(t, 0.85)];
        };

        const fill = g.createLinearGradient(0, y0 - height, 0, y0);
        fill.addColorStop(0, p.mountain[0]);
        fill.addColorStop(1, p.mountain[1]);
        g.fillStyle = fill;
        g.beginPath();
        g.moveTo(points[0].x, y0);
        for (const { x, y } of points) g.lineTo(x, y);
        g.lineTo(points[n].x, y0);
        g.closePath();
        g.fill();

        g.lineWidth = 0.8;
        g.strokeStyle = p.mountainLine;
        for (let j = 1; j < rows; j++) {
            g.globalAlpha = alpha * 0.55 * (1 - j / rows);
            g.beginPath();
            for (let i = 0; i <= n; i++) g[i ? 'lineTo' : 'moveTo'](...at(i, j));
            g.stroke();
        }
        g.globalAlpha = alpha * 0.35;
        g.beginPath();
        for (let i = 0; i <= n; i += 2) {
            for (let j = 0; j <= rows; j++) g[j ? 'lineTo' : 'moveTo'](...at(i, j));
            if (i + 2 <= n) {
                // Diagonals make the triangles of the mesh
                g.moveTo(...at(i, 0));
                for (let j = 1; j <= rows; j++) g.lineTo(...at(i + (j % 2 ? 2 : 0), j));
            }
        }
        g.stroke();

        g.globalAlpha = alpha;
        g.lineWidth = 1.6;
        g.strokeStyle = p.ridge;
        g.beginPath();
        for (const { x, y } of points) g.lineTo(x, y);
        g.stroke();
        g.globalAlpha = 1;
    }

    // The far grid melts into the floor colour, under a bright horizon line.
    bakeFog() {
        const { w, y0, s, palette: p } = this;
        this.fogTop = y0 - 2;
        this.fogHeight = Math.ceil(s / 4) + 2;
        const fog = this.layer(w, this.fogHeight);
        // Where the lines crowd too close to draw, the floor glows with
        // their colour instead, fading out as they come apart.
        const fade = fog.g.createLinearGradient(0, 0, 0, this.fogHeight);
        fade.addColorStop(0, rgba(p.floor[0], 0.85));
        fade.addColorStop(0.2, rgba(p.floor[0], 0.3));
        fade.addColorStop(1, rgba(p.floor[0], 0));
        fog.g.fillStyle = fade;
        fog.g.fillRect(0, 0, w, this.fogHeight);
        const sheen = fog.g.createLinearGradient(0, 0, 0, this.fogHeight);
        sheen.addColorStop(0, rgba(p.grid, 0.42));
        sheen.addColorStop(0.35, rgba(p.grid, 0.12));
        sheen.addColorStop(1, rgba(p.grid, 0));
        fog.g.fillStyle = sheen;
        fog.g.fillRect(0, 0, w, this.fogHeight);
        this.fog = fog.canvas;

        this.glowHeight = Math.max(6, Math.round(s * 0.09));
        const glow = this.layer(w, this.glowHeight);
        const band = glow.g.createLinearGradient(0, 0, 0, this.glowHeight);
        band.addColorStop(0, rgba(p.horizon, 0));
        band.addColorStop(0.5, rgba(p.horizon, 0.8));
        band.addColorStop(1, rgba(p.horizon, 0));
        glow.g.fillStyle = band;
        glow.g.fillRect(0, 0, w, this.glowHeight);
        // Brighter towards the middle, under the sun
        const side = glow.g.createLinearGradient(0, 0, w, 0);
        side.addColorStop(0, 'rgba(0, 0, 0, 0.6)');
        side.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
        side.addColorStop(1, 'rgba(0, 0, 0, 0.6)');
        glow.g.globalCompositeOperation = 'destination-out';
        glow.g.fillStyle = side;
        glow.g.fillRect(0, 0, w, this.glowHeight);
        this.glow = glow.canvas;
    }

    // Vignette, and the CRT's scanlines when they're on.
    bakeOverlay() {
        const { w, h, dpr } = this;
        const { canvas, g } = this.layer(w, h);
        const r = Math.hypot(w, h) / 2;
        const vignette = g.createRadialGradient(w / 2, h / 2, r * 0.55, w / 2, h / 2, r);
        vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
        vignette.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
        g.fillStyle = vignette;
        g.fillRect(0, 0, w, h);
        if (this.config.scanlines) {
            // In device pixels, so every line is the same crisp weight
            g.setTransform(1, 0, 0, 1, 0, 0);
            g.fillStyle = 'rgba(0, 0, 0, 0.2)';
            const pitch = Math.max(2, Math.round(3 * dpr)), weight = Math.max(1, Math.round(dpr));
            for (let y = 0; y < canvas.height; y += pitch) g.fillRect(0, y, canvas.width, weight);
        }
        this.overlay = canvas;
    }

    // Tail lights and their smear on the road.
    bakeGlows() {
        const size = 64, c = size / 2;
        const { canvas, g } = this.layer(size, size, 1);
        const glow = g.createRadialGradient(c, c, 0, c, c, c);
        glow.addColorStop(0, 'rgba(255, 240, 240, 1)');
        glow.addColorStop(0.12, rgba(this.palette.tail, 0.95));
        glow.addColorStop(0.4, rgba(this.palette.tail, 0.25));
        glow.addColorStop(1, rgba(this.palette.tail, 0));
        g.fillStyle = glow;
        g.fillRect(0, 0, size, size);
        this.tailSprite = canvas;
    }

    // A palm silhouette with a neon rim on the side facing the road, baked
    // at the power-of-two height nearest above what it's drawn at.
    palmSprite(variant, side, height) {
        const bucket = Math.min(1024, 2 ** Math.ceil(Math.log2(Math.max(24, height * this.dpr))));
        const key = `${variant}:${side}:${bucket}`;
        let sprite = this.palmSprites.get(key);
        if (!sprite) {
            const H = bucket, W = Math.round(H * 1.1);
            const { canvas, g } = this.layer(W, H, 1);
            g.translate(W / 2, H);
            if (side) g.scale(-1, 1);   // right-hand palms lean the other way
            const rim = Math.max(1, H * 0.007);
            drawPalm(g, H, WP.seededRandom(97 + variant * 31), this.palette.rim, rim, rim * -0.6);
            drawPalm(g, H, WP.seededRandom(97 + variant * 31), this.palette.palm, 0, 0);
            sprite = { canvas, W, H };
            this.palmSprites.set(key, sprite);
        }
        return sprite;
    }

    // ---- The scene ------------------------------------------------------------

    seedScene() {
        this.palms = [[], []];
        this.cars = [];
        if (!this.config.palms) return;
        for (const side of [0, 1]) {
            this.nextPalm[side] = this.distance + 1 + Math.random() * 2;
            this.plantPalms(side);
        }
    }

    // Palms stand at fixed world positions; new ones are planted out at the
    // far end of the grid. Fewer, further apart, at lower densities.
    plantPalms(side) {
        const list = this.palms[side];
        while (this.nextPalm[side] < this.distance + SynthwaveGrid.FAR * 2.5) {
            list.unshift({ at: this.nextPalm[side], x: (1.6 + Math.random() * 0.5) * (side ? 1 : -1), variant: Math.floor(Math.random() * 3), height: 2.4 + Math.random() * 0.9 });
            this.nextPalm[side] += (2.2 + Math.random() * 2.2) / Math.max(0.3, this.host.quality.density);
        }
    }

    frame(time) {
        if (!this.isRunning) return;
        const dtMs = this.lastTime ? time - this.lastTime : 0;
        const dt = Math.min(dtMs, 100) / 1000;
        this.lastTime = time;
        this.distance = SynthwaveGrid.advance(this.distance, dtMs, this.config.speed);
        this.seconds += dt;
        this.pan += (this.panTarget - this.pan) * (1 - Math.exp(-dt * 4));
        this.hazeFade += (this.wants('haze') - this.hazeFade) * Math.min(1, dt / 1.5 * 3);
        this.update(dt);
        this.draw();
        this.animationId = requestAnimationFrame(t => this.frame(t));
    }

    update(dt) {
        if (this.config.palms) {
            for (const side of [0, 1]) {
                const list = this.palms[side];
                while (list.length && list[list.length - 1].at - this.distance < 0.25) list.pop();
                this.plantPalms(side);
            }
        }
        if (!this.config.road) return;
        // Now and then a car overtakes and pulls away towards the sun.
        const travel = this.config.speed * SynthwaveGrid.SPEED;
        this.carTimer -= dt * this.host.quality.density;
        if (this.carTimer <= 0 && this.cars.length < 3) {
            this.carTimer = 5 + Math.random() * 9;
            this.cars.push({ z: 0.35, x: -0.42, v: travel * (0.35 + Math.random() * 0.45) + 0.6, age: 0 });
        }
        for (const car of this.cars) {
            car.z += car.v * dt;
            car.age += dt;
        }
        this.cars = this.cars.filter(car => car.z < 60);
    }

    // Screen position of a point on the ground, x across and z ahead.
    project(x, z) {
        const k = this.s / z;
        return [this.cx + (x - this.camX) * k, this.y0 + k];
    }

    draw() {
        const { ctx, w, h, y0, dpr } = this;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        this.camX = this.pan * 1.2;

        ctx.drawImage(this.back, 0, 0, w, h);
        this.drawSun(ctx);
        ctx.drawImage(this.front, -this.margin - this.pan * this.margin * 1.6, 0, w + this.margin * 2, h);

        this.drawGrid(ctx, 1, this.gridStroke);
        if (this.config.road) this.drawRoad(ctx);
        if (this.hazeFade > 0.01) {
            const g = this.hazeCtx;
            g.setTransform(1, 0, 0, 1, 0, 0);
            g.clearRect(0, 0, this.haze.width, this.haze.height);
            g.setTransform(0.25, 0, 0, 0.25, 0, -y0 * 0.25);
            this.drawGrid(g, 3, this.hazeStroke);
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.9 * this.hazeFade;
            ctx.drawImage(this.haze, 0, y0, w, h - y0);
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
        }
        ctx.drawImage(this.fog, 0, this.fogTop, w, this.fogHeight);
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(this.glow, 0, y0 - this.glowHeight / 2, w, this.glowHeight);
        ctx.globalCompositeOperation = 'source-over';

        if (this.config.road) this.drawCars(ctx);
        if (this.config.palms) this.drawPalms(ctx);
        ctx.drawImage(this.overlay, 0, 0, w, h);
    }

    drawSun(ctx) {
        const R = this.sunR, x = this.cx - R - this.pan * this.margin * 0.6, y = this.sunY - R;
        if (!this.config.sunStripes) {
            ctx.drawImage(this.sun, x, y, R * 2, R * 2);
            return;
        }
        // Clip to the bands between the gaps, then copy the disc through.
        ctx.save();
        ctx.beginPath();
        let top = 0;
        for (const [a, b] of SynthwaveGrid.stripes(this.seconds)) {
            if (a > top) ctx.rect(x, y + top * 2 * R, R * 2, (a - top) * 2 * R);
            top = Math.max(top, b);
        }
        if (top < 1) ctx.rect(x, y + top * 2 * R, R * 2, (1 - top) * 2 * R);
        ctx.clip();
        ctx.drawImage(this.sun, x, y, R * 2, R * 2);
        ctx.restore();
    }

    // The grid: rails converging on the vanishing point, and cross lines
    // at fixed world positions coming towards us. `weight` thickens them
    // for the haze buffer.
    drawGrid(g, weight, stroke) {
        const { w, h, y0, s, cx, camX } = this;
        const spacing = SynthwaveGrid.SPACING * this.lineStep();
        const far = SynthwaveGrid.FAR, bottom = s / (h + 2 - y0);
        g.strokeStyle = stroke;

        // Rails from just short of the horizon, as wide as the fog lets
        // them be seen, about depth 5
        const reach = (w / 2) / s * 5.5 + Math.abs(camX), start = far * 4;
        g.lineWidth = 1.1 * weight;
        g.beginPath();
        for (let i = Math.ceil((camX - reach) / spacing); i * spacing <= camX + reach; i++) {
            const x = i * spacing - camX;
            g.moveTo(cx + x * s / start, y0 + s / start);
            g.lineTo(cx + x * s / bottom, h + 2);
        }
        g.stroke();

        // Cross lines, thicker as they come near, batched by weight
        let width = 0;
        g.beginPath();
        for (const z of SynthwaveGrid.rows(this.distance, spacing, bottom * 0.98, far)) {
            const lw = Math.round(Math.min(2.6, Math.max(0.7, 1.9 / z)) * 4) / 4 * weight;
            if (lw !== width) {
                if (width) { g.lineWidth = width; g.stroke(); g.beginPath(); }
                width = lw;
            }
            const y = y0 + s / z;
            g.moveTo(0, y);
            g.lineTo(w, y);
        }
        if (width) { g.lineWidth = width; g.stroke(); }
    }

    // A dark highway over the grid, bright edges, and a dashed centre line.
    drawRoad(ctx) {
        const { h, y0, s, palette: p } = this;
        const far = SynthwaveGrid.FAR, bottom = s / (h + 2 - y0);
        const half = 0.95;
        const [a, ay] = this.project(-half, far), [b] = this.project(half, far);
        const [c, cy] = this.project(half, bottom), [d] = this.project(-half, bottom);
        ctx.globalAlpha = 0.72;
        ctx.fillStyle = p.road;
        ctx.beginPath();
        ctx.moveTo(a, ay); ctx.lineTo(b, ay); ctx.lineTo(c, cy); ctx.lineTo(d, cy);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = this.gridStroke;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(a, ay); ctx.lineTo(d, cy);
        ctx.moveTo(b, ay); ctx.lineTo(c, cy);
        ctx.stroke();

        // Dashes every 1.5 units, 0.6 long, at fixed places on the road
        ctx.fillStyle = this.roadFill;
        ctx.beginPath();
        const period = 1.5, length = 0.6, dash = 0.035;
        for (let k = Math.ceil((this.distance + bottom) / period); k * period - this.distance < far; k++) {
            const z0 = Math.max(bottom, k * period - this.distance), z1 = Math.min(far, k * period + length - this.distance);
            if (z1 <= z0) continue;
            const [x0, y0n] = this.project(-dash, z0), [x1] = this.project(dash, z0);
            const [x2, y1f] = this.project(dash, z1), [x3] = this.project(-dash, z1);
            ctx.moveTo(x0, y0n); ctx.lineTo(x1, y0n); ctx.lineTo(x2, y1f); ctx.lineTo(x3, y1f);
            ctx.closePath();
        }
        ctx.fill();
    }

    drawCars(ctx) {
        for (const car of this.cars) {
            if (car.z < SynthwaveGrid.NEAR * 0.6) continue;
            const k = this.s / car.z;
            const [x, y] = this.project(car.x, car.z);
            const fade = Math.min(1, car.age / 0.6) * (1 - smoothstep(25, 60, car.z));
            const bw = 0.5 * k, bh = 0.2 * k;
            ctx.globalAlpha = fade;
            // A low wedge of a sports car from behind, outlined in neon
            ctx.fillStyle = this.palette.road;
            ctx.strokeStyle = this.palette.grid;
            ctx.lineWidth = Math.max(0.6, k * 0.006);
            ctx.beginPath();
            ctx.moveTo(x - bw / 2, y - bh * 0.12);
            ctx.lineTo(x - bw / 2, y - bh * 0.62);
            ctx.lineTo(x - bw * 0.32, y - bh);
            ctx.lineTo(x + bw * 0.32, y - bh);
            ctx.lineTo(x + bw / 2, y - bh * 0.62);
            ctx.lineTo(x + bw / 2, y - bh * 0.12);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = this.palette.tail;
            ctx.fillRect(x - bw * 0.4, y - bh * 0.66, bw * 0.8, Math.max(0.6, bh * 0.08));
            const glow = Math.max(3, 0.3 * k);
            const ly = y - bh * 0.62;
            for (const side of [-1, 1]) {
                const lx = x + side * bw * 0.36;
                ctx.drawImage(this.tailSprite, lx - glow / 2, ly - glow / 2, glow, glow);
                // Smeared on the road beneath
                ctx.globalAlpha = fade * 0.35;
                ctx.drawImage(this.tailSprite, lx - glow * 0.2, y - bh * 0.1, glow * 0.4, glow * 1.1);
                ctx.globalAlpha = fade;
            }
            ctx.globalCompositeOperation = 'source-over';
        }
        ctx.globalAlpha = 1;
    }

    drawPalms(ctx) {
        const far = SynthwaveGrid.FAR * 2.5;
        for (const side of [0, 1]) {
            for (const palm of this.palms[side]) {
                const z = palm.at - this.distance;
                if (z <= 0.25 || z > far) continue;
                const height = palm.height * this.s / z;
                if (height < 4) continue;
                const sprite = this.palmSprite(palm.variant, side, height);
                const width = height * sprite.W / sprite.H;
                const [x, y] = this.project(palm.x, z);
                ctx.globalAlpha = 1 - smoothstep(far * 0.55, far, z);
                ctx.drawImage(sprite.canvas, x - width / 2, y - height, width, height);
            }
        }
        ctx.globalAlpha = 1;
    }
}

// ---- Helpers ------------------------------------------------------------------

function rgba(hex, alpha) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function smoothstep(a, b, x) {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
}

// A ridge line by midpoint displacement: n + 1 heights from 0 to 1.
function midpoint(n, roughness, random) {
    const v = new Array(n + 1).fill(0);
    v[0] = random(); v[n] = random();
    for (let step = n, amp = 0.6; step > 1; step /= 2, amp *= roughness) {
        for (let i = step / 2; i < n; i += step) v[i] = (v[i - step / 2] + v[i + step / 2]) / 2 + (random() - 0.5) * amp;
    }
    const lo = Math.min(...v), hi = Math.max(...v);
    return v.map(x => (x - lo) / (hi - lo || 1));
}

// A palm, base at the origin, growing up (negative y) to height H, leaning
// right. Drawn twice for the sprite: offset in the rim colour, then the
// silhouette on top, which leaves a lit edge.
function drawPalm(g, H, random, color, dx, dy) {
    g.save();
    g.translate(dx, dy);
    g.fillStyle = color;
    const lean = 0.12 + random() * 0.1;
    const crown = [lean * H, -H * 0.8];
    const control = [lean * H * 0.1, -H * 0.45];
    const point = t => [
        2 * (1 - t) * t * control[0] + t * t * crown[0],
        2 * (1 - t) * t * control[1] + t * t * crown[1],
    ];
    // Trunk: a tapered ribbon along the curve, with a notch at every ring
    const left = [], right = [];
    for (let i = 0; i <= 24; i++) {
        const t = i / 24, [x, y] = point(t), [nx, ny] = point(Math.min(1, t + 0.01));
        const len = Math.hypot(nx - x, ny - y) || 1;
        const half = H * (0.03 - 0.014 * t) * (i % 3 === 0 ? 0.85 : 1);
        left.push([x - (ny - y) / len * half, y + (nx - x) / len * half]);
        right.push([x + (ny - y) / len * half, y - (nx - x) / len * half]);
    }
    g.beginPath();
    for (const [x, y] of left) g.lineTo(x, y);
    for (const [x, y] of right.reverse()) g.lineTo(x, y);
    g.fill();

    // Fronds: drooping arcs with leaflets hanging off both sides
    const fronds = 9;
    for (let f = 0; f < fronds; f++) {
        const angle = -Math.PI * (0.02 + 0.96 * (f + random() * 0.6) / fronds);
        const length = H * (0.3 + random() * 0.12);
        const droop = length * (0.55 + random() * 0.35) * (1.1 - Math.abs(Math.sin(angle)) * 0.6);
        const at = t => [
            crown[0] + Math.cos(angle) * length * t,
            crown[1] + Math.sin(angle) * length * t + droop * t * t,
        ];
        g.beginPath();
        const spine = [];
        const n = 24;
        for (let i = 0; i <= n; i++) spine.push(at(i / n));
        // The frond's stem, tapering
        for (let i = 0; i <= n; i++) g.lineTo(spine[i][0], spine[i][1] - H * 0.008 * (1 - i / n));
        for (let i = n; i >= 0; i--) g.lineTo(spine[i][0], spine[i][1] + H * 0.008 * (1 - i / n));
        g.fill();
        for (let i = 2; i < n; i++) {
            const t = i / n, [x, y] = spine[i], [nx, ny] = spine[i + 1];
            const dir = Math.atan2(ny - y, nx - x);
            const leaf = H * 0.075 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + H * 0.01;
            for (const sideways of [-1, 1]) {
                const a = dir + sideways * 1.1 + 0.5;   // hang down and back along the frond
                g.beginPath();
                g.moveTo(x, y);
                g.lineTo(x + Math.cos(a) * leaf, y + Math.sin(a) * leaf + leaf * 0.35);
                g.lineTo(nx, ny);
                g.fill();
            }
        }
    }
    // Coconuts
    for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.arc(crown[0] + (i - 1) * H * 0.018, crown[1] + H * 0.025 + (i % 2) * H * 0.01, H * 0.014, 0, Math.PI * 2);
        g.fill();
    }
    g.restore();
}
