// Northern Lights Animation Module
//
// The aurora is modelled the way the real thing is built: a thin, folded,
// vertical sheet of glowing gas hanging around 100 km up, seen in perspective
// from the ground. Almost everything that makes real aurora read as aurora
// falls out of that one idea:
//
//   * Rays are vertical because the electrons that excite the gas spiral down
//     magnetic field lines, so a curtain is drawn as a dense row of vertical
//     strips rather than a filled ribbon.
//   * The lower border is sharp and the top fades away, because emission is a
//     function of altitude: nitrogen pink/violet at the very bottom during
//     strong events, the 557.7 nm oxygen green from ~100-150 km, then diffuse
//     630 nm oxygen red above ~200 km.
//   * Where the sheet folds away from us we look along it instead of through
//     it, so those places flare into bright vertical curls. That is only light
//     conservation - a segment's fixed emission squeezed into fewer screen
//     pixels - and it is what gives real curtains their structure.
//   * Aurora arrives in substorms: a quiet homogeneous arc brightens, breaks
//     up into fast folding rays with a pink lower border, then decays into a
//     pulsating glow. One activity level drives brightness, folding, colour
//     and speed together so the sky has a story instead of a loop.

const TAU = Math.PI * 2;

// Vertical emission profiles, bottom (v = 0, the lower border) to top (v = 1).
// `act` is the substorm activity level: the low-altitude nitrogen bands and the
// high red oxygen only show up when the aurora is genuinely energetic.
const AURORA_PROFILES = {
    // The everyday aurora: green with a pink lower fringe and a red crown.
    classic: (act) => [
        { v: 0.000, rgb: [255, 105, 155], a: 0.0 },
        { v: 0.018, rgb: [255, 105, 155], a: 0.02 + 0.30 * act },
        { v: 0.035, rgb: [185, 255, 210], a: 0.55 + 0.35 * act },
        { v: 0.090, rgb: [150, 255, 190], a: 0.88 },
        { v: 0.190, rgb: [ 92, 246, 160], a: 0.70 },
        { v: 0.350, rgb: [ 58, 226, 140], a: 0.44 },
        { v: 0.520, rgb: [ 55, 190, 140], a: 0.23 },
        { v: 0.690, rgb: [ 85, 150, 190], a: 0.11 },
        { v: 0.830, rgb: [175,  80, 110], a: 0.05 + 0.07 * act },
        { v: 0.940, rgb: [190,  60,  80], a: 0.02 + 0.03 * act },
        { v: 1.000, rgb: [190,  60,  80], a: 0.0 }
    ],
    // Big-storm look: ionised nitrogen puts a blue-violet wash under the green.
    electric: (act) => [
        { v: 0.000, rgb: [130, 125, 255], a: 0.0 },
        { v: 0.020, rgb: [130, 125, 255], a: 0.08 + 0.34 * act },
        { v: 0.050, rgb: [150, 255, 235], a: 0.85 },
        { v: 0.150, rgb: [ 80, 240, 210], a: 0.68 },
        { v: 0.330, rgb: [ 60, 200, 240], a: 0.42 },
        { v: 0.550, rgb: [ 70, 150, 240], a: 0.22 },
        { v: 0.760, rgb: [120, 110, 240], a: 0.11 },
        { v: 0.920, rgb: [150,  90, 230], a: 0.04 },
        { v: 1.000, rgb: [150,  90, 230], a: 0.0 }
    ],
    // Proton-arc / high-latitude violet, rarer but it does happen.
    mystical: (act) => [
        { v: 0.000, rgb: [255, 120, 205], a: 0.0 },
        { v: 0.020, rgb: [255, 120, 205], a: 0.10 + 0.32 * act },
        { v: 0.060, rgb: [225, 175, 255], a: 0.82 },
        { v: 0.180, rgb: [180, 130, 250], a: 0.62 },
        { v: 0.380, rgb: [140,  90, 235], a: 0.36 },
        { v: 0.600, rgb: [115,  65, 200], a: 0.18 },
        { v: 0.820, rgb: [ 95,  50, 165], a: 0.07 },
        { v: 1.000, rgb: [ 95,  50, 165], a: 0.0 }
    ],
    // Deep red aurora - all high-altitude oxygen, seen in the biggest storms.
    warm: (act) => [
        { v: 0.000, rgb: [255, 190, 130], a: 0.0 },
        { v: 0.020, rgb: [255, 190, 130], a: 0.15 + 0.40 * act },
        { v: 0.060, rgb: [255, 185, 140], a: 0.70 },
        { v: 0.180, rgb: [255, 125,  95], a: 0.52 },
        { v: 0.380, rgb: [235,  75,  75], a: 0.32 },
        { v: 0.600, rgb: [195,  50,  65], a: 0.17 },
        { v: 0.840, rgb: [150,  32,  60], a: 0.06 },
        { v: 1.000, rgb: [150,  32,  60], a: 0.0 }
    ]
};

// Naked-eye colours of the main stellar classes, weighted so the sky is mostly
// white/yellow stars with a scattering of blue and orange.
const NL_STAR_TINTS = [
    { rgb: [170, 190, 255], weight: 0.06 },
    { rgb: [210, 222, 255], weight: 0.14 },
    { rgb: [248, 248, 255], weight: 0.28 },
    { rgb: [255, 246, 232], weight: 0.28 },
    { rgb: [255, 216, 170], weight: 0.18 },
    { rgb: [255, 182, 134], weight: 0.06 }
];

// --- small deterministic noise kit -----------------------------------------

function nlHash(ix, iy) {
    let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function nlSmooth(t) {
    return t * t * (3 - 2 * t);
}

// Value noise in 0..1. The second axis is normally time, so a curtain's shape
// evolves smoothly instead of jumping between frames.
function nlNoise(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = nlSmooth(x - ix);
    const fy = nlSmooth(y - iy);

    const a = nlHash(ix, iy);
    const b = nlHash(ix + 1, iy);
    const c = nlHash(ix, iy + 1);
    const d = nlHash(ix + 1, iy + 1);

    const top = a + (b - a) * fx;
    const bottom = c + (d - c) * fx;
    return top + (bottom - top) * fy;
}

// Fractal sum. Higher octaves are also faster in time, which is what fine
// auroral structure does - the big folds drift, the filaments flicker.
function nlFbm(x, y, octaves) {
    let sum = 0;
    let norm = 0;
    let amp = 0.5;
    let fx = x;
    let fy = y;

    for (let i = 0; i < octaves; i++) {
        sum += amp * nlNoise(fx, fy);
        norm += amp;
        amp *= 0.5;
        fx *= 2.03;
        fy *= 2.11;
    }
    return sum / norm;
}

function nlRandom(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

class NorthernLightsAnimationManager {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.curtains = [];
        this.stars = [];
        this.isEnabled = false;
        this.animationId = null;

        this.time = 0;      // drift-scaled clock used by the noise fields
        this.wall = 0;      // unscaled seconds, for twinkle and pulsation
        this.lastTime = 0;
        // Filament flicker and surge travel both speed up with activity. They
        // have to be accumulated rather than computed as time * rate(activity),
        // or every change in activity would jump their phase and the rays would
        // visibly lurch at the start of a substorm.
        this.flickerClock = 0;
        this.surgeClock = 0;

        // Substorm state machine
        this.phase = 'quiet';
        this.phaseLeft = 12;
        this.activity = 0.2;

        // One seed per session: the sky differs between page loads but stays put
        // across resizes and config changes, which both rebuild everything.
        this.seed = Math.floor(Math.random() * 0x7fffffff);

        // Offscreen buffers: the aurora is composited as light, and the
        // downsampled copies are the bloom (and the water reflection).
        this.auroraCanvas = null;
        this.auroraCtx = null;
        this.bloomA = null;
        this.bloomB = null;
        this.reflection = null;
        this.sprite = null;
        this.spriteAct = -1;
        this.terrain = null;   // ridges and snow, drawn over the aurora
        this.trees = null;     // near treeline, drawn over the reflection

        this.config = WP.settings.load();
    }

    saveConfig() {
        WP.settings.save(this.config);
    }

    async init() {
        this.createCanvas();
        console.log('Northern Lights animation manager initialized');
    }

    createCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'northern-lights-canvas';
        this.canvas.style.position = 'fixed';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.pointerEvents = 'none';
        this.canvas.style.zIndex = '-1';
        this.canvas.style.display = 'none';

        this.ctx = this.canvas.getContext('2d');
        document.body.appendChild(this.canvas);

        this.onResize = () => this.resizeCanvas();
        this.resizeCanvas();
        window.addEventListener('resize', this.onResize);
    }

    resizeCanvas() {
        if (!this.canvas) return;

        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.rebuild();
    }

    // Everything that depends on canvas size or config values.
    rebuild() {
        if (!this.canvas) return;

        const w = this.canvas.width;
        const h = this.canvas.height;

        // A plausible camera: a wide-ish lens with the horizon low in frame.
        this.focal = w * 0.85;
        this.cx = w / 2;
        this.horizonY = h * this.config.horizon;

        // One sample every few pixels of unfolded curtain. Curtains span about
        // 2.5 screen widths so folds always have off-screen material to pull in.
        this.sampleCount = Math.max(200, Math.min(700, Math.round(w / 3)));

        this.auroraCanvas = document.createElement('canvas');
        this.auroraCanvas.width = w;
        this.auroraCanvas.height = h;
        this.auroraCtx = this.auroraCanvas.getContext('2d');

        const bw = Math.max(1, Math.floor(w / 4));
        const bh = Math.max(1, Math.floor(h / 4));
        this.bloomA = document.createElement('canvas');
        this.bloomA.width = bw;
        this.bloomA.height = bh;
        this.bloomB = document.createElement('canvas');
        this.bloomB.width = Math.max(1, Math.floor(bw / 4));
        this.bloomB.height = Math.max(1, Math.floor(bh / 4));

        // Quarter-scale scratch for the mirrored reflection.
        const groundH = Math.max(1, h - (h * this.config.horizon + h * 0.035));
        this.reflection = document.createElement('canvas');
        this.reflection.width = bw;
        this.reflection.height = Math.max(1, Math.ceil(groundH / 4));

        this.buildSky();
        this.buildStars();
        this.buildCurtains();
        this.buildTerrain();
        this.spriteAct = -1;
    }

    buildSky() {
        const h = this.canvas.height;
        const sky = this.ctx.createLinearGradient(0, 0, 0, this.horizonY);
        sky.addColorStop(0, 'rgb(3, 5, 14)');
        sky.addColorStop(0.45, 'rgb(6, 11, 26)');
        sky.addColorStop(0.82, 'rgb(11, 19, 36)');
        sky.addColorStop(1, 'rgb(17, 28, 44)');
        this.skyGradient = sky;

        // Atmospheric haze thickens toward the horizon and washes out the far
        // curtains' bases, which is exactly what happens looking north.
        const haze = this.ctx.createLinearGradient(0, this.horizonY - h * 0.32, 0, this.horizonY);
        haze.addColorStop(0, 'rgba(18, 30, 48, 0)');
        haze.addColorStop(0.5, 'rgba(18, 30, 48, 0.10)');
        haze.addColorStop(1, 'rgba(22, 36, 54, 0.42)');
        this.hazeGradient = haze;
    }

    buildStars() {
        const rand = nlRandom(this.seed ^ 0x5eed1a);
        const w = this.canvas.width;
        this.stars = [];

        for (let i = 0; i < this.config.starCount; i++) {
            // Magnitude-like distribution: many faint stars, a few bright ones.
            const mag = Math.pow(rand(), 2.2);

            let pick = rand();
            let tint = NL_STAR_TINTS[2];
            for (const candidate of NL_STAR_TINTS) {
                pick -= candidate.weight;
                if (pick <= 0) {
                    tint = candidate;
                    break;
                }
            }

            this.stars.push({
                x: rand() * w,
                // Placed by elevation above the horizon, so none sit in the ground.
                elev: rand(),
                mag: mag,
                rgb: tint.rgb,
                size: 0.5 + mag * 1.4,
                twinklePhase: rand() * TAU,
                twinkleRate: 0.6 + rand() * 2.4
            });
        }
    }

    buildCurtains() {
        const rand = nlRandom(this.seed ^ 0x9a17c0);
        const count = Math.max(1, Math.min(6, this.config.curtainCount));
        this.curtains = [];

        for (let i = 0; i < count; i++) {
            const depth = count === 1 ? 0.25 : i / (count - 1); // 0 = nearest
            // Geometric depth spacing keeps the near curtain tall and the far
            // ones squeezed into a thin band above the horizon. The nearest is
            // far enough out that its ray tips fade inside the frame instead of
            // running off the top edge.
            const z0 = 520 * Math.pow(3.2, depth);

            this.curtains.push({
                z0: z0,
                span: z0 * 3.0,
                hBase: 100 * (0.92 + rand() * 0.2),
                hSpan: 115 * this.config.curtainHeight * (0.8 + rand() * 0.5),
                bow: 0.18 + rand() * 0.3,
                foldFreq: 2.6 + rand() * 2.2,
                phase: rand() * 40,
                seed: rand() * 60,
                rayPhase: rand() * 50,
                surgePhase: rand() * TAU,
                drift: (rand() < 0.5 ? -1 : 1) * (0.010 + rand() * 0.016),
                // Surface brightness barely falls with distance - haze does the
                // dimming - so far curtains stay nearly as strong as near ones.
                weight: 1 - depth * 0.22,
                // Reused scratch buffers - allocating these per frame would
                // churn the GC at 60 fps.
                sx: new Float32Array(this.sampleCount + 1),
                topY: new Float32Array(this.sampleCount + 1),
                botY: new Float32Array(this.sampleCount + 1),
                z: new Float32Array(this.sampleCount + 1),
                brt: new Float32Array(this.sampleCount + 1)
            });
        }

        // Draw the far curtains first so near ones layer over them.
        this.curtains.sort((a, b) => b.z0 - a.z0);
    }

    buildSprite(act) {
        const W = 24;
        const H = 256;
        const sprite = document.createElement('canvas');
        sprite.width = W;
        sprite.height = H;
        const g = sprite.getContext('2d');

        const profile = (AURORA_PROFILES[this.config.colorScheme] || AURORA_PROFILES.classic)(act);
        // Offset 0 is the bottom of the sprite: the sharp lower border.
        const grad = g.createLinearGradient(0, H, 0, 0);
        for (const stop of profile) {
            const a = Math.max(0, Math.min(1, stop.a));
            grad.addColorStop(stop.v, `rgba(${stop.rgb[0]}, ${stop.rgb[1]}, ${stop.rgb[2]}, ${a})`);
        }
        g.fillStyle = grad;
        g.fillRect(0, 0, W, H);

        // Triangular horizontal falloff. Strips are drawn two spacings wide and
        // one spacing apart, so overlapping triangles sum to exactly one - no
        // seams and no bright ridges where they meet.
        const mask = g.createLinearGradient(0, 0, W, 0);
        mask.addColorStop(0, 'rgba(0, 0, 0, 0)');
        mask.addColorStop(0.5, 'rgba(0, 0, 0, 1)');
        mask.addColorStop(1, 'rgba(0, 0, 0, 0)');
        g.globalCompositeOperation = 'destination-in';
        g.fillStyle = mask;
        g.fillRect(0, 0, W, H);

        this.sprite = sprite;
        this.spriteAct = act;
    }

    // Fractal ridge line via midpoint displacement, returned as 0..1 heights.
    ridgeLine(seed, roughness) {
        const n = 257;
        const line = new Float32Array(n);
        const rand = nlRandom(seed);

        line[0] = 0.35 + rand() * 0.3;
        line[n - 1] = 0.35 + rand() * 0.3;

        let step = n - 1;
        let scale = roughness;
        while (step > 1) {
            const half = step / 2;
            for (let i = half; i < n; i += step) {
                line[i] = (line[i - half] + line[i + half]) / 2 + (rand() - 0.5) * scale;
            }
            step = half;
            scale *= 0.52;
        }

        for (let i = 0; i < n; i++) {
            line[i] = Math.max(0, Math.min(1, line[i]));
        }
        return line;
    }

    strokeRidge(g, line, baseY, amplitude, fill) {
        const w = this.canvas.width;
        g.beginPath();
        g.moveTo(0, baseY - line[0] * amplitude);
        for (let i = 1; i < line.length; i++) {
            g.lineTo((i / (line.length - 1)) * w, baseY - line[i] * amplitude);
        }
        g.lineTo(w, this.canvas.height);
        g.lineTo(0, this.canvas.height);
        g.closePath();
        g.fillStyle = fill;
        g.fill();
    }

    buildTerrain() {
        const w = this.canvas.width;
        const h = this.canvas.height;

        this.terrain = document.createElement('canvas');
        this.terrain.width = w;
        this.terrain.height = h;
        const g = this.terrain.getContext('2d');

        // The flat ground: a frozen lake catching whatever light the sky gives.
        const groundTop = this.horizonY + h * 0.035;
        const ground = g.createLinearGradient(0, groundTop, 0, h);
        ground.addColorStop(0, 'rgb(15, 23, 36)');
        ground.addColorStop(0.35, 'rgb(9, 14, 24)');
        ground.addColorStop(1, 'rgb(4, 6, 12)');
        g.fillStyle = ground;
        // Painted from the horizon itself, not from groundTop: with the
        // silhouette turned off there is nothing else to cover that strip.
        g.fillRect(0, this.horizonY - 1, w, h - this.horizonY + 1);

        if (this.config.silhouette) {
            // Two ridges: the far one hazed by distance, the near one nearly black.
            this.strokeRidge(g, this.ridgeLine(this.seed ^ 0x1234, 0.55), this.horizonY + 2,
                h * 0.055, 'rgb(15, 24, 38)');
            this.strokeRidge(g, this.ridgeLine(this.seed ^ 0xbeef, 0.75), this.horizonY + h * 0.026,
                h * 0.04, 'rgb(8, 12, 20)');
        }

        this.trees = document.createElement('canvas');
        this.trees.width = w;
        this.trees.height = h;

        if (!this.config.silhouette) return;

        const t = this.trees.getContext('2d');
        const rand = nlRandom(this.seed ^ 0x7a1c3);
        const baseY = groundTop + h * 0.012;
        t.fillStyle = 'rgb(3, 5, 9)';

        // A spruce treeline along the far shore. Drawn back to front so the
        // taller foreground trees overlap the small ones behind them.
        for (let pass = 0; pass < 2; pass++) {
            const count = Math.round(w / (pass === 0 ? 14 : 34));
            for (let i = 0; i < count; i++) {
                const x = rand() * w;
                const scale = pass === 0 ? 0.5 + rand() * 0.5 : 1 + rand() * 1.1;
                this.drawSpruce(t, x, baseY + pass * h * 0.006,
                    h * 0.032 * scale, h * 0.011 * scale, rand);
            }
        }
    }

    drawSpruce(g, x, baseY, height, width, rand) {
        const tiers = 4 + Math.floor(rand() * 3);
        g.beginPath();
        g.moveTo(x, baseY - height);

        // Right side down, then left side back up: jagged branch tiers give the
        // conifer outline that says "somewhere cold" at a glance.
        for (let side = 0; side < 2; side++) {
            const dir = side === 0 ? 1 : -1;
            for (let i = tiers; i >= 1; i--) {
                const frac = i / tiers;
                const tierY = baseY - height * frac * 0.92;
                const spread = width * (1.05 - frac * 0.75) * (0.75 + rand() * 0.5);
                if (side === 0) {
                    g.lineTo(x + dir * spread, tierY);
                    g.lineTo(x + dir * spread * 0.45, tierY + height * 0.05);
                } else {
                    g.lineTo(x + dir * spread * 0.45, tierY + height * 0.05);
                    g.lineTo(x + dir * spread, tierY);
                }
            }
            if (side === 0) {
                g.lineTo(x + width * 0.12, baseY);
                g.lineTo(x - width * 0.12, baseY);
            }
        }
        g.closePath();
        g.fill();
    }

    start() {
        if (this.isEnabled) return;

        this.isEnabled = true;
        this.canvas.style.display = 'block';
        // Start somewhere arbitrary in the noise fields rather than always at
        // the same frame-zero shape.
        this.time = Math.random() * 600;
        this.wall = 0;
        this.lastTime = 0;
        this.flickerClock = Math.random() * 200;
        this.surgeClock = Math.random() * 200;
        this.phase = 'quiet';
        this.phaseLeft = 6 + Math.random() * 14;
        this.activity = this.config.substorms ? 0.18 : this.config.activity;
        this.rebuild();
        this.animate();
        console.log('Northern Lights animation started');
    }

    stop() {
        if (!this.isEnabled) return;

        this.isEnabled = false;
        this.canvas.style.display = 'none';

        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        console.log('Northern Lights animation stopped');
    }

    // Quiet arc -> slow growth -> breakup -> pulsating recovery, the standard
    // auroral substorm sequence. One number out of it drives the whole look.
    updateActivity(dt) {
        if (!this.config.substorms) {
            const target = this.config.activity;
            this.activity += (target - this.activity) * Math.min(1, dt * 0.8);
            return;
        }

        this.phaseLeft -= dt;
        if (this.phaseLeft <= 0) {
            switch (this.phase) {
                case 'quiet':
                    this.phase = 'growth';
                    this.phaseLeft = 14 + Math.random() * 18;
                    break;
                case 'growth':
                    this.phase = 'breakup';
                    this.phaseLeft = 14 + Math.random() * 26;
                    break;
                case 'breakup':
                    this.phase = 'recovery';
                    this.phaseLeft = 28 + Math.random() * 34;
                    break;
                default:
                    this.phase = 'quiet';
                    this.phaseLeft = 20 + Math.random() * 45;
                    break;
            }
        }

        const targets = { quiet: 0.14, growth: 0.38, breakup: 1.0, recovery: 0.42 };
        let target = targets[this.phase];
        if (this.phase === 'recovery') {
            // Fade out across the phase rather than sitting at one level.
            target *= 0.45 + 0.55 * Math.min(1, this.phaseLeft / 40);
        }
        // Breakups are sudden, recoveries are slow.
        const rate = target > this.activity ? 1.1 : 0.22;
        this.activity += (target - this.activity) * Math.min(1, dt * rate);
    }

    drawStars() {
        const ctx = this.ctx;
        const span = this.horizonY;

        for (const star of this.stars) {
            const y = span * (1 - star.elev * star.elev); // crowd them upward
            // Scintillation is strongest near the horizon, where the line of
            // sight passes through the most air.
            const shimmer = 1 - 0.55 * Math.pow(1 - y / span, 0.6);
            const twinkle = 1 - shimmer * 0.45 *
                (0.5 + 0.5 * Math.sin(star.twinklePhase + this.wall * star.twinkleRate));
            const alpha = (0.12 + star.mag * 0.88) * twinkle * this.config.starBrightness;
            if (alpha <= 0.01) continue;

            const [r, g, b] = star.rgb;
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${Math.min(1, alpha)})`;
            ctx.beginPath();
            ctx.arc(star.x, y, star.size, 0, TAU);
            ctx.fill();

            if (star.mag > 0.6) {
                // Cheap halo instead of shadowBlur, which is very slow per star.
                ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.12})`;
                ctx.beginPath();
                ctx.arc(star.x, y, star.size * 3.4, 0, TAU);
                ctx.fill();
            }
        }
    }

    // Project a curtain into screen space and splat it as vertical rays.
    drawCurtain(curtain, act) {
        const ctx = this.auroraCtx;
        const N = this.sampleCount;
        const f = this.focal;
        const w = this.canvas.width;
        const { sx, topY, botY, z, brt } = curtain;

        const foldAmp = 0.10 + 0.42 * act * this.config.foldAmount;
        const rayFreq = 130 * this.config.rayDensity;
        // Rays get harder-edged and the fine structure faster as things heat up.
        const sharp = 1.1 + 2.4 * act;
        const shimmer = this.config.shimmerSpeed;
        const surgeRate = this.surgeClock * curtain.drift;
        const pulseAmp = this.phase === 'recovery' ? 0.3 : 0.07;

        for (let i = 0; i <= N; i++) {
            const t = i / N;

            // Ground-plane shape of the sheet: a gently bowed arc plus folds.
            const u = t * curtain.foldFreq + curtain.phase + this.time * curtain.drift;
            const fold = nlFbm(u, curtain.seed + this.time * 0.12 * shimmer, 4) * 2 - 1;
            const bow = curtain.bow * (t - 0.5) * (t - 0.5) * 4;
            const zi = Math.max(curtain.z0 * 0.3, curtain.z0 * (1 + bow + fold * foldAmp));

            const X = (t - 0.5) * curtain.span;
            sx[i] = this.cx + f * X / zi;
            z[i] = zi;

            // Field-aligned filaments. Mostly noise, with a little periodicity
            // mixed in: real rays are quasi-regular but never evenly spaced, and
            // a pure sine train reads as a picket fence.
            const flicker = curtain.seed * 2 + this.flickerClock;
            const fine = nlFbm(t * rayFreq * 0.5 + curtain.rayPhase, flicker, 2);
            const rayN = nlFbm(t * rayFreq * 0.12 + curtain.rayPhase, flicker * 0.5, 3);
            const train = 0.5 + 0.5 * Math.sin(t * TAU * rayFreq * 0.5 + rayN * 7 + curtain.rayPhase);
            // Rays come in bundles with dark sky between them - an arc is never
            // lit evenly end to end.
            const bundle = nlFbm(t * 4.5 + curtain.seed * 3, this.time * 0.22 * shimmer, 3);
            // Stretched to the full 0..1 range before the contrast curve, or the
            // noise field's mid-heavy distribution would swallow all the light.
            const filament = Math.max(0, Math.min(1,
                ((0.68 * fine + 0.32 * train) - 0.18) / 0.62));
            const ray = (0.10 + 0.90 * Math.pow(filament, sharp)) *
                (0.55 + 0.45 * rayN) * (0.3 + 0.7 * bundle * bundle);

            // Travelling surge sweeping along the arc.
            const surge = 0.6 + 0.4 * Math.sin(t * TAU * 0.9 + curtain.surgePhase - surgeRate);
            // Pulsating patches, characteristic of the recovery phase.
            const pulse = 1 + pulseAmp * Math.sin(t * TAU * 1.7 + this.wall * 4.2 + curtain.seed);

            // The lower border is scalloped by the same filaments that light the
            // curtain - a perfectly smooth border reads as a hill, not aurora.
            const festoon = nlFbm(t * rayFreq * 0.16 + curtain.seed * 5,
                this.time * 0.35 * shimmer, 2);
            // Individual rays also start at slightly different heights, which
            // breaks the border into a comb instead of one continuous line.
            const hb = curtain.hBase *
                (1 + 0.2 * (festoon - 0.5) + 0.09 * (fine - 0.5) + 0.04 * (rayN - 0.5));
            // Brighter rays reach higher, so the top edge is ragged too.
            const ht = hb + curtain.hSpan * (0.5 + 0.65 * rayN);
            topY[i] = this.horizonY - f * ht / zi;
            botY[i] = this.horizonY - f * hb / zi;
            brt[i] = ray * surge * pulse;
        }

        const dXWorld = curtain.span / N;
        const scale = this.config.brightness * curtain.weight * (0.7 + 1.6 * act);
        ctx.globalCompositeOperation = 'lighter';

        for (let i = 0; i < N; i++) {
            const x0 = sx[i];
            const x1 = sx[i + 1];
            if ((x0 < -60 && x1 < -60) || (x0 > w + 60 && x1 > w + 60)) continue;

            const spacing = Math.max(0.8, Math.abs(x1 - x0));
            // Light conservation: the emission of this piece of sheet lands in
            // however many pixels perspective gives it. Folds that turn edge-on
            // collapse to a sliver and therefore blaze.
            const nominal = f * dXWorld / z[i];
            let alpha = brt[i] * Math.min(nominal / spacing, 4.5) * scale;
            if (alpha <= 0.004) continue;

            const top = Math.min(topY[i], topY[i + 1]);
            const height = Math.max(botY[i], botY[i + 1]) - top;
            if (height <= 1) continue;

            // Two spacings wide, centred on the segment: see buildSprite.
            const drawW = spacing * 2;
            const x = (x0 + x1) / 2 - spacing;
            // globalAlpha caps at 1, so the very brightest curls are drawn
            // more than once to keep their blown-out core.
            let reps = 1;
            if (alpha > 1) {
                reps = Math.min(3, Math.ceil(alpha));
                alpha /= reps;
            }
            ctx.globalAlpha = alpha;
            for (let r = 0; r < reps; r++) {
                ctx.drawImage(this.sprite, x, top, drawW, height);
            }
        }

        ctx.globalAlpha = 1;
    }

    drawAurora(act) {
        const w = this.canvas.width;
        const h = this.canvas.height;

        this.auroraCtx.clearRect(0, 0, w, h);
        for (const curtain of this.curtains) {
            this.drawCurtain(curtain, act);
        }

        // Two-step downsample is a cheap, good-enough gaussian. The result is
        // the airglow bloom above and the reflection below.
        const a = this.bloomA.getContext('2d');
        a.globalCompositeOperation = 'copy';
        a.drawImage(this.auroraCanvas, 0, 0, this.bloomA.width, this.bloomA.height);
        const b = this.bloomB.getContext('2d');
        b.globalCompositeOperation = 'copy';
        b.drawImage(this.bloomA, 0, 0, this.bloomB.width, this.bloomB.height);

        const ctx = this.ctx;
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(this.auroraCanvas, 0, 0);

        const bloom = this.config.bloom;
        if (bloom > 0) {
            ctx.globalAlpha = 0.3 * bloom;
            ctx.drawImage(this.bloomA, 0, 0, w, h);
            ctx.globalAlpha = 0.5 * bloom;
            ctx.drawImage(this.bloomB, 0, 0, w, h);
            ctx.globalAlpha = 1;
        }

        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = this.hazeGradient;
        ctx.fillRect(0, this.horizonY - h * 0.32, w, h * 0.32);
    }

    // Aurora on the ice: the blurred bloom, mirrored, drifting, fading out with
    // distance from the shore. Built in a scratch buffer so the fade can be a
    // single smooth gradient instead of visible bands.
    drawReflection() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        const top = this.horizonY + h * 0.035;
        if (top >= h - 4) return;

        const scratch = this.reflection;
        const r = scratch.getContext('2d');
        const rw = scratch.width;
        const rh = scratch.height;
        const scale = rw / w;

        r.setTransform(1, 0, 0, 1, 0, 0);
        r.globalCompositeOperation = 'source-over';
        r.clearRect(0, 0, rw, rh);

        // Mirror about the shoreline and squash: a shallow viewing angle
        // compresses a reflection toward the water line. Sky height above the
        // shore maps to depth below it, scaled into the scratch buffer.
        const squash = 0.8;
        const wobble = Math.sin(this.wall * 0.6) * 6;
        r.setTransform(scale, 0, 0, -scale * squash, wobble * scale, top * scale * squash);
        r.drawImage(this.bloomA, 0, 0, w, h);
        r.setTransform(1, 0, 0, 1, 0, 0);

        // Fade with distance from the shore.
        const fade = r.createLinearGradient(0, 0, 0, rh);
        fade.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
        fade.addColorStop(0.45, 'rgba(0, 0, 0, 0.18)');
        fade.addColorStop(1, 'rgba(0, 0, 0, 0)');
        r.globalCompositeOperation = 'destination-in';
        r.fillStyle = fade;
        r.fillRect(0, 0, rw, rh);

        const ctx = this.ctx;
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(scratch, 0, top, w, h - top);
        ctx.globalCompositeOperation = 'source-over';
    }

    animate(currentTime = 0) {
        if (!this.isEnabled) return;

        if (!this.lastTime) this.lastTime = currentTime;
        // Clamped so the first frame and backgrounded tabs cannot jump the sky.
        const dt = Math.min((currentTime - this.lastTime) / 1000, 0.05);
        this.lastTime = currentTime;

        this.wall += dt;
        this.time += dt * this.config.driftSpeed;
        this.updateActivity(dt);

        const act = Math.max(0, Math.min(1, this.activity));
        this.flickerClock += dt * (0.8 + 3.2 * act) * this.config.shimmerSpeed;
        this.surgeClock += dt * (2 + 10 * act) * this.config.driftSpeed;
        // The sprite carries the activity-dependent colours; rebuilding it only
        // when the level has moved noticeably keeps it off the per-frame path.
        if (!this.sprite || Math.abs(act - this.spriteAct) > 0.04) {
            this.buildSprite(act);
        }

        const ctx = this.ctx;
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = this.skyGradient;
        ctx.fillRect(0, 0, this.canvas.width, this.horizonY + 1);

        this.drawStars();
        this.drawAurora(act);

        ctx.drawImage(this.terrain, 0, 0);
        if (this.config.reflection) this.drawReflection();
        ctx.drawImage(this.trees, 0, 0);

        this.animationId = requestAnimationFrame((time) => this.animate(time));
    }

    destroy() {
        this.stop();
        if (this.onResize) {
            window.removeEventListener('resize', this.onResize);
            this.onResize = null;
        }
        if (this.canvas) {
            document.body.removeChild(this.canvas);
            this.canvas = null;
            this.ctx = null;
        }
        this.curtains = [];
        this.stars = [];
        this.auroraCanvas = null;
        this.auroraCtx = null;
        this.bloomA = null;
        this.bloomB = null;
        this.reflection = null;
        this.terrain = null;
        this.trees = null;
        this.sprite = null;
    }
}
