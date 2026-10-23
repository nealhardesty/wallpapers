// Fish Tank Animation Module
//
// A planted freshwater aquarium rendered on a single canvas. The scene is
// built in depth-sorted layers -- back glass, hardscape, substrate, fish,
// mid plants, more fish, foreground plants, caustics, water surface, front
// glass -- so the tank reads as a box with volume rather than a flat sprite
// field.
//
// Fish are not sprites. Each one carries a short chain of spine points that
// trail the head at fixed spacing, and a travelling sine wave is added
// perpendicular to that chain at draw time. The chain supplies the sweeping
// curve of a turn, the wave supplies the swimming stroke, and the body,
// fins and pattern are all painted relative to the resulting centreline.
//
// Interaction runs off document-level listeners (the canvas itself stays
// pointer-events:none so the homepage underneath keeps working): moving the
// cursor draws curious fish over or spooks them, clicking drops food that
// the tank races for, double-clicking taps the glass.

// ---------------------------------------------------------------------------
// Small helpers. These live at module scope so the hot paths are plain
// function calls, and they are prefixed to stay out of the global namespace
// the other animation modules share.
// ---------------------------------------------------------------------------

const ftClamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const ftLerp = (a, b, t) => a + (b - a) * t;
const ftRand = (a, b) => a + Math.random() * (b - a);
const ftRandInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const ftPick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const ftSmooth = (t) => t * t * (3 - 2 * t);

// Wrap an angle difference into -PI..PI so steering always turns the short way
const ftAngleDiff = (to, from) => {
    let d = (to - from) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
};

const ftRgbCache = new Map();
function ftRgb(hex) {
    let v = ftRgbCache.get(hex);
    if (v) return v;
    const n = parseInt(hex.slice(1), 16);
    v = hex.length === 4
        ? [((n >> 8) & 15) * 17, ((n >> 4) & 15) * 17, (n & 15) * 17]
        : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    ftRgbCache.set(hex, v);
    return v;
}

// Blend two hex colours, returning hex again so blends can be nested and
// fed straight back into ftRgba. Used constantly for depth fog.
function ftMix(a, b, t) {
    const A = ftRgb(a), B = ftRgb(b);
    const r = Math.round(A[0] + (B[0] - A[0]) * t);
    const g = Math.round(A[1] + (B[1] - A[1]) * t);
    const bl = Math.round(A[2] + (B[2] - A[2]) * t);
    return '#' + (((r << 16) | (g << 8) | bl) | 0x1000000).toString(16).slice(1);
}

function ftRgba(hex, alpha) {
    const c = ftRgb(hex);
    return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
}

// A cheap deterministic hash so per-fish detail (spots, fin scallops) stays
// put from frame to frame without storing an array for every one of them.
function ftHash(seed, i) {
    let h = Math.sin(seed * 127.1 + i * 311.7) * 43758.5453;
    return h - Math.floor(h);
}

// Catmull-Rom-ish smoothing: draw a polyline as a run of quadratics through
// the midpoints, which keeps fish outlines free of visible facets.
function ftSmoothPath(ctx, pts, moveFirst = true) {
    if (pts.length < 2) return;
    if (moveFirst) ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
        const xc = (pts[i][0] + pts[i + 1][0]) / 2;
        const yc = (pts[i][1] + pts[i + 1][1]) / 2;
        ctx.quadraticCurveTo(pts[i][0], pts[i][1], xc, yc);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last[0], last[1]);
}

// Sample a [t, value] control table with smoothstep interpolation
function ftSampleCurve(controls, t) {
    if (t <= controls[0][0]) return controls[0][1];
    const n = controls.length;
    if (t >= controls[n - 1][0]) return controls[n - 1][1];
    let k = 0;
    while (k < n - 2 && controls[k + 1][0] < t) k++;
    const span = controls[k + 1][0] - controls[k][0];
    const u = span === 0 ? 0 : (t - controls[k][0]) / span;
    return controls[k][1] + (controls[k + 1][1] - controls[k][1]) * ftSmooth(u);
}

class FishTankAnimationManager {
    constructor(host) {
        this.host = host;
        this.canvas = null;
        this.ctx = null;
        this.isEnabled = false;
        this.animationId = null;

        this.w = 0;
        this.h = 0;
        this.dpr = 1;
        this.time = 0;
        this.lastTime = 0;

        // Scene contents
        this.fish = [];
        this.plants = [];
        this.forePlants = [];
        this.bubbles = [];
        this.food = [];
        this.crumbs = [];
        this.motes = [];
        this.ripples = [];
        this.snail = null;

        // Cached static artwork (back wall, hardscape, gravel). Repainted only
        // on resize or a settings change, then blitted once per frame.
        this.sceneCanvas = null;
        this.sceneCtx = null;

        // Low-resolution caustic field, regenerated ten times a second into
        // two small textures that are cross-faded and stretched over the tank
        this.causticCanvases = null;
        this.causticData = null;
        this.causticW = 128;
        this.causticH = 128;

        // Distant fish are drawn into this downscaled buffer and upscaled,
        // which softens them for free (depth of field without ctx.filter)
        this.blurCanvas = null;
        this.blurCtx = null;

        // Substrate height field, sampled every substrateStep px
        this.substrate = null;
        this.substrateStep = 10;

        // Interaction state
        this.pointer = { x: -9999, y: -9999, speed: 0, inside: false, down: false, lastMove: 0 };
        this.current = 0;          // lateral water current, drives plants and motes
        this.currentTarget = 0;
        this.listeners = [];

        this.config = WP.settings.load();

        this.setupWaterThemes();
        this.setupSpecies();
        this.setupPopulations();
    }

    saveConfig() {
        WP.settings.save(this.config);
    }

    // -----------------------------------------------------------------------
    // Water themes. `fog` is what distant fish and plants are mixed toward,
    // which is the single biggest contributor to the sense of depth.
    // -----------------------------------------------------------------------
    setupWaterThemes() {
        this.waterThemes = {
            planted: {
                name: '🌿 Planted Tank',
                top: '#1d5e6b', mid: '#0f3d4c', deep: '#07202b',
                fog: '#134351', light: '#bff0ff', ray: '#9fe8ff',
                gravel: ['#4a4038', '#5d5044', '#6b5d4e', '#3b332c', '#7a6b58'],
                glass: '#0a1c24'
            },
            tropical: {
                name: '🐠 Tropical Blue',
                top: '#1a6fa8', mid: '#0d4576', deep: '#04203f',
                fog: '#155f95', light: '#d6f4ff', ray: '#bde8ff',
                gravel: ['#cdbfa4', '#ddd0b6', '#b9a98c', '#e6dcc6', '#a89878'],
                glass: '#07182b'
            },
            blackwater: {
                name: '🪵 Blackwater',
                top: '#4a3a22', mid: '#2c2113', deep: '#150f08',
                fog: '#3a2c19', light: '#ffe6b0', ray: '#ffd894',
                gravel: ['#2e2519', '#3d3223', '#4a3d2b', '#241c12', '#564630'],
                glass: '#120c06'
            },
            reef: {
                name: '🪸 Reef Lit',
                top: '#1b4fa0', mid: '#123a7d', deep: '#06183c',
                fog: '#1a4a90', light: '#e4f1ff', ray: '#cfe4ff',
                gravel: ['#e8e4d8', '#f2efe6', '#d6d0c0', '#fbf8f1', '#c4bcaa'],
                glass: '#050f24'
            },
            moonlit: {
                name: '🌙 Moonlit',
                top: '#16303f', mid: '#0c1d2b', deep: '#050c14',
                fog: '#122a3a', light: '#a9c8e8', ray: '#8fb4dc',
                gravel: ['#3a3d42', '#474b51', '#54585f', '#2d3035', '#61666e'],
                glass: '#040a12'
            }
        };
    }

    get water() {
        return this.waterThemes[this.config.waterTheme] || this.waterThemes.planted;
    }

    // -----------------------------------------------------------------------
    // Species. Everything about how a fish looks and behaves is data here;
    // the renderer and the steering code are generic.
    //
    //   body     half-height along the spine, as a fraction of body length
    //   caudal   tail shape, size given in body lengths
    //   dorsal   [tStart, tEnd, height, droop]  -- droop trails the tip back
    //   pectoral small sculling fin behind the gill, beats on its own clock
    //   wave     amplitude / beats-per-length of the swimming stroke
    //   zone     where in the water column the fish prefers to hold
    // -----------------------------------------------------------------------
    setupSpecies() {
        this.species = {
            neon: {
                name: 'Neon Tetra',
                length: 30, speed: 44, turnRate: 3.4, schooling: 0.95, zone: 'mid',
                body: [[0, .085], [.10, .165], [.28, .195], [.50, .168], [.76, .098], [1, .042]],
                colors: { top: '#2d4f66', mid: '#9db4c6', belly: '#edf4f8', fin: '#c8dce8', accent: '#3fd9ff' },
                sheen: 0.55, translucent: 0.92,
                pattern: 'neon',
                caudal: { type: 'fork', len: .30, height: .30, alpha: .52 },
                dorsal: [.30, .48, .16, .25], anal: [.58, .76, .10, .2],
                pectoral: { len: .13, height: .07, beat: 7.5 },
                wave: { amp: .17, freq: 1.45 },
                eye: .075
            },
            rasbora: {
                name: 'Harlequin Rasbora',
                length: 36, speed: 46, turnRate: 3.2, schooling: 0.85, zone: 'mid',
                body: [[0, .095], [.11, .205], [.30, .255], [.54, .210], [.80, .110], [1, .046]],
                colors: { top: '#8f4f21', mid: '#d78d4d', belly: '#f6dcb9', fin: '#e89a52', accent: '#2a2018' },
                sheen: 0.40, translucent: 1,
                pattern: 'harlequin',
                caudal: { type: 'fork', len: .30, height: .32, alpha: .70 },
                dorsal: [.28, .46, .20, .3], anal: [.60, .78, .11, .2],
                pectoral: { len: .14, height: .07, beat: 7 },
                wave: { amp: .15, freq: 1.35 },
                eye: .072
            },
            angel: {
                name: 'Angelfish',
                length: 48, speed: 25, turnRate: 2.0, schooling: 0.2, zone: 'mid',
                body: [[0, .095], [.12, .300], [.33, .415], [.56, .330], [.80, .160], [1, .050]],
                colors: { top: '#78828c', mid: '#c0c9d1', belly: '#eef2f5', fin: '#c4cdd4', accent: '#20262d' },
                sheen: 0.45, translucent: 1,
                pattern: 'bars',
                caudal: { type: 'lyre', len: .46, height: .46, alpha: .48 },
                dorsal: [.06, .58, .86, .55], anal: [.52, .92, .70, .5],
                pelvicFilament: { len: .95, wobble: .5 },
                pectoral: { len: .18, height: .10, beat: 5.2 },
                wave: { amp: .075, freq: .85 },
                eye: .062
            },
            betta: {
                name: 'Betta',
                length: 38, speed: 21, turnRate: 2.2, schooling: 0, zone: 'top',
                body: [[0, .095], [.12, .215], [.33, .255], [.60, .200], [.83, .110], [1, .052]],
                colors: { top: '#1c2f9e', mid: '#3a54d8', belly: '#7b8ff0', fin: '#a3339c', accent: '#f04fc4' },
                sheen: 0.75, translucent: 1,
                pattern: 'iridescent',
                caudal: { type: 'veil', len: .78, height: .62, alpha: .62 },
                dorsal: [.20, .62, .58, .45], anal: [.48, .95, .62, .45],
                pectoral: { len: .20, height: .13, beat: 4.8 },
                wave: { amp: .09, freq: .95 },
                eye: .068
            },
            guppy: {
                name: 'Guppy',
                length: 24, speed: 52, turnRate: 4.0, schooling: 0.35, zone: 'top',
                body: [[0, .085], [.11, .160], [.30, .185], [.55, .150], [.80, .090], [1, .040]],
                colors: { top: '#9a8f6e', mid: '#e3dbc6', belly: '#f8f3e6', fin: '#f0a03c', accent: '#4fc3a1' },
                sheen: 0.60, translucent: 0.95,
                pattern: 'speckle',
                caudal: { type: 'fan', len: .52, height: .48, alpha: .68 },
                dorsal: [.28, .48, .24, .35], anal: [.62, .76, .10, .2],
                pectoral: { len: .13, height: .07, beat: 8 },
                wave: { amp: .19, freq: 1.6 },
                eye: .080
            },
            cory: {
                name: 'Corydoras',
                length: 30, speed: 30, turnRate: 3.6, schooling: 0.55, zone: 'bottom',
                body: [[0, .110], [.13, .215], [.32, .225], [.58, .160], [.82, .085], [1, .038]],
                colors: { top: '#6a6250', mid: '#c4b89d', belly: '#efe8d6', fin: '#d8cfb8', accent: '#3c352a' },
                sheen: 0.30, translucent: 1,
                pattern: 'mottle', barbels: true, flatBelly: 0.55,
                caudal: { type: 'fork', len: .28, height: .30, alpha: .62 },
                dorsal: [.24, .40, .34, .15], anal: [.62, .76, .12, .2],
                pectoral: { len: .22, height: .09, beat: 6 },
                wave: { amp: .12, freq: 1.25 },
                eye: .085
            },
            pleco: {
                name: 'Bristlenose Pleco',
                length: 44, speed: 18, turnRate: 1.8, schooling: 0, zone: 'floor',
                body: [[0, .135], [.15, .200], [.34, .185], [.60, .120], [.84, .062], [1, .030]],
                colors: { top: '#332c24', mid: '#5a5043', belly: '#8b8271', fin: '#4a4236', accent: '#1d1914' },
                sheen: 0.18, translucent: 1,
                pattern: 'armor', bristles: true, flatBelly: 0.85, sucker: true,
                caudal: { type: 'fork', len: .26, height: .26, alpha: .75 },
                dorsal: [.16, .34, .55, .3], anal: [.64, .76, .10, .2],
                pectoral: { len: .30, height: .11, beat: 2.4 },
                wave: { amp: .07, freq: .8 },
                eye: .050
            },
            goldfish: {
                name: 'Fancy Goldfish',
                length: 44, speed: 23, turnRate: 2.1, schooling: 0.25, zone: 'mid',
                body: [[0, .110], [.13, .255], [.32, .300], [.58, .230], [.82, .115], [1, .050]],
                colors: { top: '#b34a0c', mid: '#f0871f', belly: '#f8c078', fin: '#f6a94b', accent: '#fbeedd' },
                sheen: 0.55, translucent: 1,
                pattern: 'koi',
                caudal: { type: 'double', len: .44, height: .36, alpha: .34 },
                dorsal: [.20, .48, .40, .35], anal: [.62, .82, .20, .35],
                pectoral: { len: .18, height: .09, beat: 5 },
                wave: { amp: .11, freq: 1.0 },
                eye: .072
            }
        };
    }

    // Species mixes. Weights are relative; the tank is stocked by drawing
    // from this distribution until fishCount is reached, with `min` entries
    // guaranteed so a community tank always has its centrepiece fish.
    setupPopulations() {
        this.populations = {
            community: {
                name: '🐟 Community',
                min: { angel: 2, pleco: 1, cory: 3 },
                weights: { neon: 6, rasbora: 4, cory: 2, angel: 0.6, pleco: 0.2, guppy: 1 }
            },
            nano: {
                name: '🐠 Nano School',
                min: { cory: 2 },
                weights: { neon: 8, rasbora: 5, guppy: 2, cory: 1 }
            },
            showpiece: {
                name: '👑 Betta Showpiece',
                min: { betta: 1, cory: 3 },
                weights: { neon: 6, cory: 2, rasbora: 2 }
            },
            goldfish: {
                name: '🟠 Goldfish',
                min: { goldfish: 3, pleco: 1 },
                weights: { goldfish: 5, pleco: 0.3 }
            },
            mixed: {
                name: '🎲 Everything',
                min: { angel: 1, betta: 1, pleco: 1, goldfish: 1, cory: 2 },
                weights: { neon: 5, rasbora: 4, guppy: 2, cory: 2, angel: 1, goldfish: 1, betta: 0.4, pleco: 0.3 }
            }
        };
    }

    // -----------------------------------------------------------------------
    // Canvas and tank geometry
    // -----------------------------------------------------------------------

    async init() {
        this.createCanvas();
        console.log('Fish tank animation manager initialized');
    }

    createCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'fishtank-canvas';
        this.canvas.style.position = 'fixed';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.pointerEvents = 'none';
        this.canvas.style.zIndex = '-1';
        this.canvas.style.display = 'none';

        this.ctx = this.canvas.getContext('2d', { alpha: false });
        document.body.appendChild(this.canvas);

        this.resizeCanvas();
        this._onResize = () => {
            this.resizeCanvas();
            this.glassCanvas = null;
            this.foreCanvas = null;
            this.surfBuf = null;
            if (this.isEnabled) this.buildScene();
        };
        window.addEventListener('resize', this._onResize);
    }

    // Everything downstream works in CSS pixels; the backing store is scaled
    // by the device pixel ratio so fins and gravel stay crisp on a retina
    // display instead of being stretched from a half-resolution buffer.
    resizeCanvas() {
        if (!this.canvas) return;

        this.w = window.innerWidth;
        this.h = window.innerHeight;
        this.applyRenderScale(this.targetRenderScale());
    }

    // How many device pixels to render per CSS pixel. Every full-screen pass
    // in draw() -- backdrop, light shafts, caustics, surface, glass -- costs
    // in proportion to the square of this, so it is by far the biggest lever
    // on frame rate. The stage caps devicePixelRatio by tier (SPEC §4.8).
    targetRenderScale() {
        let scale = Math.min(window.devicePixelRatio || 1, 2);

        // Hard ceiling on total pixels: at native ratio a 4K panel would ask
        // for four times the fill rate of a laptop
        const budget = 3.2e6;
        const cssPixels = Math.max(1, this.w * this.h);
        if (cssPixels * scale * scale > budget) {
            scale = Math.max(0.6, Math.sqrt(budget / cssPixels));
        }
        return scale;
    }

    applyRenderScale(scale) {
        const width = Math.round(this.w * scale);
        const height = Math.round(this.h * scale);
        if (this.canvas.width === width && this.canvas.height === height) return;

        this.dpr = scale;
        this.canvas.width = width;
        this.canvas.height = height;
        this.resetTransform(this.ctx);
        // These caches are sized in device pixels, so they have to go
        this.glassCanvas = null;
        this.foreCanvas = null;
        this.blurCanvas = null;
    }

    resetTransform(ctx) {
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    get surfaceY() {
        return this.h * this.config.waterLevel;
    }

    get floorBase() {
        // The gravel line sits above the homepage status bar so bottom
        // dwellers stay visible instead of grubbing about behind the footer
        return this.h - this.host.insets.bottom - this.h * 0.11;
    }

    // Height of the gravel bed at a given x, interpolated from the height field
    substrateY(x) {
        if (!this.substrate) return this.floorBase;
        const f = ftClamp(x / this.substrateStep, 0, this.substrate.length - 1.001);
        const i = Math.floor(f);
        return ftLerp(this.substrate[i], this.substrate[i + 1], f - i);
    }

    buildSubstrateProfile() {
        const cols = Math.ceil(this.w / this.substrateStep) + 2;
        const base = this.floorBase;
        const amp = this.h * 0.030;
        const seed = this.sceneSeed;

        this.substrate = new Float32Array(cols);
        for (let i = 0; i < cols; i++) {
            const x = i * this.substrateStep;
            // Summed low-frequency waves give slow dunes rather than noise,
            // so the bed reads as swept gravel instead of static
            const d =
                Math.sin(x * 0.0035 + seed * 1.7) * 0.55 +
                Math.sin(x * 0.0082 + seed * 4.1) * 0.28 +
                Math.sin(x * 0.0171 + seed * 9.3) * 0.13;
            this.substrate[i] = base - d * amp;
        }
    }

    // -----------------------------------------------------------------------
    // Static artwork. Back wall, hardscape and gravel never move, so they are
    // painted once into an offscreen canvas and blitted each frame.
    // -----------------------------------------------------------------------

    buildScene() {
        this.sceneSeed = this.sceneSeed || Math.random() * 1000;
        this.buildSubstrateProfile();
        this.stoneX = this.w * 0.14;

        if (!this.sceneCanvas) {
            this.sceneCanvas = document.createElement('canvas');
            this.sceneCtx = this.sceneCanvas.getContext('2d');
        }
        this.sceneCanvas.width = Math.round(this.w * this.dpr);
        this.sceneCanvas.height = Math.round(this.h * this.dpr);
        const ctx = this.sceneCtx;
        this.resetTransform(ctx);
        ctx.clearRect(0, 0, this.w, this.h);

        this.paintBackWall(ctx);
        this.paintHardscape(ctx);
        this.paintSubstrate(ctx);

        this.buildPlants();
        this.buildCausticBuffer();
        this.buildBubbleSprites();
    }

    buildBubbleSprites() {
        const wt = this.water;
        const count = 12;
        this.bubbleStep = 0.6;
        this.bubbleMinR = 0.8;
        this.bubbleCells = [];

        const maxR = this.bubbleMinR + (count - 1) * this.bubbleStep;
        const cell = Math.ceil((maxR + 2) * 2);
        const atlas = document.createElement('canvas');
        atlas.width = cell * count;
        atlas.height = cell;
        const g = atlas.getContext('2d');

        for (let i = 0; i < count; i++) {
            const r = this.bubbleMinR + i * this.bubbleStep;
            const cx = i * cell + cell / 2, cy = cell / 2;

            g.beginPath();
            g.arc(cx, cy, r, 0, Math.PI * 2);
            g.strokeStyle = ftRgba(wt.light, 1);
            g.lineWidth = Math.max(0.6, r * 0.3);
            g.stroke();

            // Refracted rim: bright at the top, dark underneath
            g.beginPath();
            g.arc(cx - r * 0.3, cy - r * 0.35, r * 0.34, 0, Math.PI * 2);
            g.fillStyle = ftRgba(wt.light, 1);
            g.fill();
            g.beginPath();
            g.arc(cx, cy, r * 0.92, Math.PI * 0.15, Math.PI * 0.85);
            g.strokeStyle = 'rgba(0,0,0,0.33)';
            g.lineWidth = Math.max(0.5, r * 0.22);
            g.stroke();

            this.bubbleCells.push(i * cell);
        }

        this.bubbleAtlas = atlas;
        this.bubbleCell = cell;
    }

    paintBackWall(ctx) {
        const wt = this.water;
        const surf = this.surfaceY;

        // Water column: brightest just under the surface, falling off with depth
        const g = ctx.createLinearGradient(0, surf, 0, this.h);
        g.addColorStop(0, wt.top);
        g.addColorStop(0.45, wt.mid);
        g.addColorStop(1, wt.deep);
        ctx.fillStyle = g;
        ctx.fillRect(0, surf - 2, this.w, this.h - surf + 2);

        // Air gap above the waterline plus the hood shadow, which frames the
        // scene and makes the surface read as a boundary instead of an edge
        const air = ctx.createLinearGradient(0, 0, 0, surf);
        air.addColorStop(0, '#05080b');
        air.addColorStop(1, ftMix(wt.deep, '#000000', 0.35));
        ctx.fillStyle = air;
        ctx.fillRect(0, 0, this.w, surf);

        // Soft pool of light under the hood lamp
        const lamp = ctx.createRadialGradient(this.w * 0.5, surf, 0, this.w * 0.5, surf, this.h * 0.75);
        lamp.addColorStop(0, ftRgba(wt.light, 0.10 * this.config.lightIntensity));
        lamp.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = lamp;
        ctx.fillRect(0, surf, this.w, this.h - surf);

        // The back pane is a long way off, so it only gets a soft darkening
        // toward the corners -- any texture here reads as wallpaper
        const back = ctx.createLinearGradient(0, surf, this.w, this.h);
        back.addColorStop(0, ftRgba(wt.deep, 0.35));
        back.addColorStop(0.5, 'rgba(0,0,0,0)');
        back.addColorStop(1, ftRgba(wt.deep, 0.35));
        ctx.fillStyle = back;
        ctx.fillRect(0, surf, this.w, this.h - surf);
    }

    paintSubstrate(ctx) {
        const wt = this.water;
        const step = this.substrateStep;

        // Bed body, dark toward the glass line at the bottom
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(0, this.h);
        for (let x = 0; x <= this.w; x += step) ctx.lineTo(x, this.substrateY(x));
        ctx.lineTo(this.w, this.h);
        ctx.closePath();
        ctx.clip();

        const bed = ctx.createLinearGradient(0, this.floorBase - this.h * 0.04, 0, this.h);
        bed.addColorStop(0, ftMix(wt.gravel[1], wt.light, 0.18));
        bed.addColorStop(0.35, wt.gravel[0]);
        bed.addColorStop(1, ftMix(wt.gravel[0], '#000000', 0.62));
        ctx.fillStyle = bed;
        ctx.fillRect(0, this.floorBase - this.h * 0.06, this.w, this.h);

        // Individual grains. Lit from above, so each gets a pale cap and a
        // dark underside; that pairing is what makes gravel look granular.
        const grains = Math.round((this.w * this.h * 0.00022) * 4);
        for (let i = 0; i < grains; i++) {
            const x = ftRand(-6, this.w + 6);
            const top = this.substrateY(x);
            const depthT = Math.pow(Math.random(), 0.65);
            const y = top + depthT * (this.h - top + 10);
            if (y > this.h + 6) continue;

            const r = ftRand(1.6, 4.4) * (1 - depthT * 0.25);
            const shade = ftClamp(1 - depthT * 1.15, 0.12, 1);
            const base = ftPick(wt.gravel);

            ctx.beginPath();
            ctx.ellipse(x, y, r * ftRand(0.9, 1.45), r * ftRand(0.65, 1), ftRand(0, Math.PI), 0, Math.PI * 2);
            ctx.fillStyle = ftMix('#000000', base, shade);
            ctx.fill();

            if (r > 2.2 && depthT < 0.5) {
                ctx.beginPath();
                ctx.ellipse(x - r * 0.18, y - r * 0.3, r * 0.55, r * 0.3, 0, 0, Math.PI * 2);
                ctx.fillStyle = ftRgba(wt.light, 0.10 * shade);
                ctx.fill();
            }
        }
        ctx.restore();

        // A thin bright crest right on the gravel line catches the lamp
        ctx.beginPath();
        for (let x = 0; x <= this.w; x += step) {
            const y = this.substrateY(x);
            if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = ftRgba(wt.light, 0.10);
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    paintHardscape(ctx) {
        const mode = this.config.hardscape;
        if (mode === 'none') return;

        if (mode === 'rocks' || mode === 'both') {
            const count = Math.max(2, Math.round(this.w / 620) + 2);
            for (let i = 0; i < count; i++) {
                const x = (i + 0.5) * (this.w / count) + ftRand(-this.w / count * 0.25, this.w / count * 0.25);
                this.paintRock(ctx, x, ftRand(this.h * 0.055, this.h * 0.125));
            }
        }

        if (mode === 'wood' || mode === 'both') {
            const x = this.w * ftRand(0.18, 0.34);
            this.paintDriftwood(ctx, x, this.substrateY(x), ftRand(-0.35, -0.9), this.h * ftRand(0.20, 0.30), 0);
            if (this.w > 900) {
                const x2 = this.w * ftRand(0.66, 0.84);
                this.paintDriftwood(ctx, x2, this.substrateY(x2), Math.PI + ftRand(0.35, 0.9), this.h * ftRand(0.16, 0.24), 0);
            }
        }
    }

    // Rocks are irregular polygons with a couple of flat internal facets.
    // Faceting beats a smooth blob: the eye reads the hard edges as stone.
    paintRock(ctx, cx, size) {
        const wt = this.water;
        const baseY = this.substrateY(cx) + size * 0.18;
        const seed = cx * 0.37 + size;
        const n = ftRandInt(7, 10);
        const pts = [];
        for (let i = 0; i < n; i++) {
            const a = Math.PI + (i / (n - 1)) * Math.PI;   // upper half only
            const r = size * (0.75 + ftHash(seed, i) * 0.5);
            pts.push([cx + Math.cos(a) * r * 1.35, baseY + Math.sin(a) * r * 0.85]);
        }

        // Contact shadow so the rock sits in the gravel instead of on it
        ctx.beginPath();
        ctx.ellipse(cx, baseY, size * 1.5, size * 0.22, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.filter = 'blur(6px)';
        ctx.fill();
        ctx.filter = 'none';

        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.closePath();

        const stone = ftMix(wt.gravel[2], '#5b5c5e', 0.55);
        const g = ctx.createLinearGradient(cx - size, baseY - size, cx + size * 0.6, baseY);
        g.addColorStop(0, ftMix(stone, wt.light, 0.28));
        g.addColorStop(0.55, stone);
        g.addColorStop(1, ftMix(stone, '#000000', 0.55));
        ctx.fillStyle = g;
        ctx.fill();

        // Facets
        ctx.save();
        ctx.clip();
        for (let i = 0; i < 3; i++) {
            const a = ftHash(seed, 20 + i) * Math.PI;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * size * 2, baseY + Math.sin(a) * size * 2 - size);
            ctx.lineTo(cx - Math.cos(a) * size * 2, baseY - Math.sin(a) * size * 2 - size);
            ctx.lineTo(cx - Math.cos(a) * size * 2, baseY + size * 2);
            ctx.closePath();
            ctx.fillStyle = ftHash(seed, 30 + i) > 0.5
                ? 'rgba(255,255,255,0.05)'
                : 'rgba(0,0,0,0.13)';
            ctx.fill();
        }
        ctx.restore();

        // Algae fringe along the lit upper edge
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.strokeStyle = ftRgba('#4c6b3a', 0.5);
        ctx.lineWidth = Math.max(2, size * 0.09);
        ctx.lineCap = 'round';
        ctx.setLineDash([size * 0.25, size * 0.35]);
        ctx.stroke();
        ctx.restore();

    }

    // Recursive tapered branch. Depth is capped low; driftwood reads better
    // as a few heavy limbs than as a fractal bush.
    paintDriftwood(ctx, x, y, angle, len, depth) {
        if (depth > 3 || len < 8) return;
        const wt = this.water;
        const x2 = x + Math.cos(angle) * len;
        const y2 = y + Math.sin(angle) * len;
        const width = Math.max(2, len * 0.16);

        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(
            x + Math.cos(angle + 0.3) * len * 0.55,
            y + Math.sin(angle + 0.3) * len * 0.55,
            x2, y2
        );
        const wood = ftMix('#77522f', wt.fog, 0.16);
        ctx.strokeStyle = ftMix(wood, '#000000', depth * 0.10);
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Lit edge along the top of the limb
        ctx.beginPath();
        ctx.moveTo(x, y - width * 0.22);
        ctx.quadraticCurveTo(
            x + Math.cos(angle + 0.3) * len * 0.55,
            y + Math.sin(angle + 0.3) * len * 0.55 - width * 0.22,
            x2, y2 - width * 0.18
        );
        ctx.strokeStyle = ftRgba('#c39a6c', 0.22);
        ctx.lineWidth = width * 0.3;
        ctx.stroke();

        const branches = depth === 0 ? 3 : 2;
        for (let i = 0; i < branches; i++) {
            if (Math.random() < 0.2 && depth > 0) continue;
            this.paintDriftwood(
                ctx, x2, y2,
                angle + ftRand(-0.85, 0.85),
                len * ftRand(0.52, 0.76),
                depth + 1
            );
        }
    }

    // -----------------------------------------------------------------------
    // Plants. Each is a chain of segments whose angles bend more the higher
    // up the stalk you go, driven by a travelling wave plus the tank current.
    // -----------------------------------------------------------------------

    buildPlants() {
        this.plants = [];
        this.forePlants = [];
        const density = this.config.plantDensity;
        if (density <= 0) return;

        const clusters = Math.max(2, Math.round((this.w / 165) * density));
        for (let i = 0; i < clusters; i++) {
            const x = ftRand(-40, this.w + 40);
            const z = ftRand(0.25, 0.95);
            const blades = ftRandInt(3, 6);
            const type = Math.random() < 0.82 ? 'ribbon' : 'stem';
            // One species per clump, the way a real aquascape is planted
            const clump = {
                hue: Math.random() < 0.22 ? 'red' : 'green',
                shade: ftRand(-0.22, 0.28),
                height: ftRand(0.6, 1.25),
                broad: Math.random() < 0.3
            };
            for (let b = 0; b < blades; b++) {
                this.plants.push(this.makePlant(
                    x + ftRand(-44, 44), z + ftRand(-0.10, 0.10), type, false, clump
                ));
            }
        }

        if (this.config.foregroundPlants) {
            const fore = Math.max(1, Math.round((this.w / 560) * density));
            for (let i = 0; i < fore; i++) {
                const x = ftRand(0, this.w);
                const blades = ftRandInt(3, 6);
                const clump = { hue: 'green', shade: ftRand(-0.3, 0), height: ftRand(0.5, 0.9), broad: true };
                for (let b = 0; b < blades; b++) {
                    this.forePlants.push(this.makePlant(x + ftRand(-48, 48), 0.02, 'ribbon', true, clump));
                }
            }
        }
    }

    makePlant(x, z, type, foreground = false, clump = null) {
        const scale = ftLerp(1, 0.62, z);
        const reach = (this.substrateY(x) - this.surfaceY);
        const height = clump ? clump.height : 1;
        const len = (foreground ? ftRand(0.30, 0.55) : ftRand(0.28, 0.86)) * reach * scale * height;
        const segs = Math.max(5, Math.round(len / 24));
        const hue = clump ? clump.hue : 'green';

        return {
            x, z, type, foreground, segs,
            baseY: this.substrateY(x) + 4,
            len,
            seg: len / segs,
            width: (type === 'ribbon' ? ftRand(4.5, 11) * (clump && clump.broad ? 1.7 : 1) : ftRand(2.4, 3.8)) * scale,
            shade: clump ? clump.shade : 0,
            lean: ftRand(-0.35, 0.35),
            phase: ftRand(0, Math.PI * 2),
            rate: ftRand(0.35, 0.65),
            flex: ftRand(0.5, 1.0),
            hue,
            tint: hue === 'red' ? ftRand(0, 40) : ftRand(0, 30),
            pts: new Float32Array((segs + 1) * 2)
        };
    }

    updatePlant(p, t) {
        // Bend accumulates up the stalk: each segment adds a little more
        // angle, so the base stays planted while the tip sweeps
        const sway = 0.26 * p.flex;
        let x = p.x, y = p.baseY, a = -Math.PI / 2 + p.lean * 0.4;
        p.pts[0] = x; p.pts[1] = y;

        for (let i = 1; i <= p.segs; i++) {
            const u = i / p.segs;
            const bend =
                Math.sin(t * p.rate * 2.2 + p.phase - u * 2.4) * sway * u * u +
                this.current * 0.055 * u * u * p.flex +
                p.lean * 0.18 * u;
            a += bend * 3 / p.segs;
            x += Math.cos(a) * p.seg;
            y += Math.sin(a) * p.seg;

            // Leaves that reach the surface lie over and trail along it
            if (y < this.surfaceY + 6) {
                y = this.surfaceY + 6 + (this.surfaceY + 6 - y) * 0.15;
                a += 0.55;
            }
            p.pts[i * 2] = x;
            p.pts[i * 2 + 1] = y;
        }
    }

    drawPlant(ctx, p) {
        const wt = this.water;
        const fog = p.foreground ? 0.1 : p.z * 0.40;
        // `shade` tilts a clump olive or lime so neighbouring plantings
        // read as different species
        const sh = p.shade || 0;
        const dark = p.hue === 'red'
            ? ftMix('#6e2a25', sh < 0 ? '#3d1a2c' : '#8a4a1c', Math.abs(sh))
            : ftMix('#2f5f24', sh < 0 ? '#1b4636' : '#5c7318', Math.abs(sh));
        const lit = p.hue === 'red'
            ? ftMix('#d9744f', sh < 0 ? '#a8486b' : '#e8a24a', Math.abs(sh))
            : ftMix('#96c94f', sh < 0 ? '#5fbf8e' : '#c3d24a', Math.abs(sh));

        const left = [], right = [];
        for (let i = 0; i <= p.segs; i++) {
            const u = i / p.segs;
            const x = p.pts[i * 2], y = p.pts[i * 2 + 1];
            const nx = i < p.segs ? p.pts[(i + 1) * 2] - x : x - p.pts[(i - 1) * 2];
            const ny = i < p.segs ? p.pts[(i + 1) * 2 + 1] - y : y - p.pts[(i - 1) * 2 + 1];
            const d = Math.hypot(nx, ny) || 1;
            // Ribbon leaves keep their width then taper hard at the tip;
            // stems taper evenly
            const wgt = p.type === 'ribbon'
                ? Math.sin(Math.min(1, u * 1.18) * Math.PI * 0.92) * 0.85 + 0.15
                : (1 - u * 0.85);
            const hw = p.width * wgt * 0.5;
            left.push([x - ny / d * hw, y + nx / d * hw]);
            right.push([x + ny / d * hw, y - nx / d * hw]);
        }

        ctx.beginPath();
        ftSmoothPath(ctx, left);
        ftSmoothPath(ctx, right.reverse(), false);
        ctx.closePath();

        if (!p.gradient || p.gradientCtx !== ctx) {
            const g = ctx.createLinearGradient(p.x, p.baseY, p.x, p.baseY - p.len);
            g.addColorStop(0, ftMix(ftMix(dark, '#000000', 0.30), wt.fog, fog));
            g.addColorStop(0.45, ftMix(dark, lit, 0.55));
            g.addColorStop(1, ftMix(ftMix(lit, wt.light, 0.30), wt.fog, fog * 0.5));
            p.gradient = g;
            p.gradientCtx = ctx;
            p.leafFill = ftMix(ftMix(dark, lit, 0.55), wt.fog, fog * 0.7);
            p.veinStroke = ftRgba(wt.light, 0.10 * (1 - fog));
        }
        ctx.fillStyle = p.gradient;
        ctx.fill();

        // Midrib highlight, worth drawing only on the broad blades
        if (p.width > 4.5) {
            ctx.beginPath();
            ctx.moveTo(p.pts[0], p.pts[1]);
            for (let i = 2; i <= p.segs; i += 2) {
                const xc = (p.pts[(i - 1) * 2] + p.pts[i * 2]) / 2;
                const yc = (p.pts[(i - 1) * 2 + 1] + p.pts[i * 2 + 1]) / 2;
                ctx.quadraticCurveTo(p.pts[(i - 1) * 2], p.pts[(i - 1) * 2 + 1], xc, yc);
            }
            ctx.strokeStyle = p.veinStroke;
            ctx.lineWidth = Math.max(0.6, p.width * 0.14);
            ctx.stroke();
        }

        // Paired leaves make a bare stalk read as a stem plant
        if (p.type === 'stem') {
            for (let i = 1; i < p.segs; i++) {
                const u = i / p.segs;
                const x = p.pts[i * 2], y = p.pts[i * 2 + 1];
                const a = Math.atan2(p.pts[i * 2 + 1] - p.pts[(i - 1) * 2 + 1], p.pts[i * 2] - p.pts[(i - 1) * 2]);
                const leaf = Math.min(p.len * 0.055, p.seg * 1.25) * (1 - u * 0.30);
                for (const s of [-1, 1]) {
                    // Leaves alternate around the stalk instead of forming
                    // a stack of identical discs
                    const tilt = s * (1.05 + (i % 2) * 0.45);
                    ctx.beginPath();
                    ctx.ellipse(
                        x + Math.cos(a + tilt) * leaf * 0.5,
                        y + Math.sin(a + tilt) * leaf * 0.5,
                        leaf * 0.5, leaf * 0.22, a + tilt, 0, Math.PI * 2
                    );
                    ctx.fillStyle = ftMix(ftMix(dark, lit, 0.35 + u * 0.5), wt.fog, fog * 0.7);
                    ctx.fill();
                }
            }
        }
    }

    // -----------------------------------------------------------------------
    // Stocking the tank
    // -----------------------------------------------------------------------

    populate() {
        this.fish = [];
        const pop = this.populations[this.config.population] || this.populations.community;
        const target = Math.max(1, this.config.fishCount);
        const roster = [];

        // Guaranteed residents first, trimmed if the tank is tiny
        for (const [key, n] of Object.entries(pop.min || {})) {
            for (let i = 0; i < n && roster.length < target; i++) roster.push(key);
        }

        const entries = Object.entries(pop.weights);
        const total = entries.reduce((s, [, w]) => s + w, 0);
        while (roster.length < target) {
            let r = Math.random() * total;
            let chosen = entries[0][0];
            for (const [key, w] of entries) {
                r -= w;
                if (r <= 0) { chosen = key; break; }
            }
            roster.push(chosen);
        }

        // Schooling species share a loose rally point so they start together
        this.schools = {};
        for (const key of new Set(roster)) {
            this.schools[key] = {
                x: ftRand(this.w * 0.25, this.w * 0.75),
                y: ftRand(this.surfaceY + this.h * 0.15, this.floorBase - this.h * 0.12),
                timer: ftRand(3, 9)
            };
        }

        // The whole roster is stocked, but only the first `fishShown` of it
        // swim at a time: the tier's density decides how many (SPEC §4.8),
        // and a change fades fish in or out rather than restocking.
        this.fishShown = this.fishTarget();
        roster.forEach((key, slot) => {
            const f = this.makeFish(key);
            f.slot = slot;
            f.fade = slot < this.fishShown ? 1 : 0;
            this.fish.push(f);
        });
        this.fish.sort((a, b) => b.z - a.z);

        this.snail = this.config.snail ? this.makeSnail() : null;
    }

    fishTarget() {
        return Math.max(1, Math.round(this.config.fishCount * this.host.quality.density));
    }

    hasEffect(name) {
        return this.host.quality.effects.includes(name);
    }

    // The quality changed (SPEC §4.8). Resolution follows from the resize
    // the stage sends; here, fish fade in or out to the new density, motes
    // are trimmed or topped up, and effects are read live while drawing.
    onQuality() {
        this.fishShown = this.fishTarget();
        this.seedMotes(true);
        for (const f of this.fish) f.palette = null;
    }

    makeFish(key) {
        const spec = this.species[key];
        const z = ftRand(0.05, 1);
        const sizeJitter = ftRand(0.82, 1.2);
        // Tank art scales with the window: a fish should be roughly the same
        // fraction of the tank on a laptop and on a big monitor
        const tankScale = ftClamp(this.h / 820, 0.72, 1.65) * 1.35;
        const scale = ftLerp(1.05, 0.52, z) * sizeJitter * tankScale;
        const len = spec.length * scale;

        const band = this.zoneBand(spec.zone);
        const x = ftRand(this.w * 0.1, this.w * 0.9);
        const y = ftRand(band[0], band[1]);
        const angle = Math.random() < 0.5 ? 0 : Math.PI;

        const SPINE = 11;
        const seg = len / (SPINE - 1);
        const spine = [];
        for (let i = 0; i < SPINE; i++) {
            spine.push({ x: x - Math.cos(angle) * seg * i, y: y - Math.sin(angle) * seg * i });
        }

        return {
            key, spec, x, y, z, scale, len, seg, spine,
            angle,
            speed: spec.speed * scale * 0.6,
            cruise: spec.speed * scale * ftRand(0.8, 1.15),
            turnRate: spec.turnRate,
            phase: ftRand(0, Math.PI * 2),
            pecPhase: ftRand(0, Math.PI * 2),
            finPhase: ftRand(0, Math.PI * 2),
            wanderAngle: ftRand(0, Math.PI * 2),
            bank: 1,
            hand: Math.cos(angle) >= 0 ? 1 : -1,
            handTarget: Math.cos(angle) >= 0 ? 1 : -1,
            seed: ftRand(0, 500),
            state: 'cruise',
            stateTimer: ftRand(1, 6),
            startle: 0,
            interest: 0,
            sated: 0,
            mouth: 0,
            gulpTimer: ftRand(8, 40),
            palette: null,
            paletteZ: -1
        };
    }

    // Preferred vertical band for a species, in absolute pixels
    zoneBand(zone) {
        const top = this.surfaceY + this.h * 0.05;
        const bottom = this.floorBase - this.h * 0.02;
        const span = bottom - top;
        switch (zone) {
            case 'top': return [top, top + span * 0.35];
            case 'bottom': return [top + span * 0.68, bottom];
            case 'floor': return [top + span * 0.86, bottom];
            default: return [top + span * 0.18, top + span * 0.78];
        }
    }

    makeSnail() {
        const x = ftRand(this.w * 0.2, this.w * 0.8);
        return {
            x, y: this.substrateY(x) - 4,
            dir: Math.random() < 0.5 ? -1 : 1,
            speed: ftRand(5, 10),
            phase: ftRand(0, Math.PI * 2),
            size: ftRand(7, 11) * ftClamp(this.h / 820, 0.8, 1.5),
            wall: 0            // >0 while climbing a side pane
        };
    }

    // -----------------------------------------------------------------------
    // Lifecycle
    // -----------------------------------------------------------------------

    start() {
        if (this.isEnabled) return;

        this.isEnabled = true;
        this.canvas.style.display = 'block';
        this.resizeCanvas();
        this.buildScene();
        this.populate();
        this.bubbles = [];
        this.food = [];
        this.crumbs = [];
        this.ripples = [];
        this.seedMotes();
        this.setupInteraction();

        this.lastTime = performance.now();
        this.animate();
        console.log('Fish tank animation started');
    }

    stop() {
        if (!this.isEnabled) return;

        this.isEnabled = false;
        this.canvas.style.display = 'none';
        this.teardownInteraction();

        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        console.log('Fish tank animation stopped');
    }

    // Top up (or trim) to the density's count; `keep` keeps the ones
    // already drifting, so a quality change doesn't reshuffle them.
    seedMotes(keep = false) {
        if (!keep) this.motes = [];
        if (!this.config.motes) return;
        const n = Math.round(this.w * this.h / 22000 * this.host.quality.density);
        if (this.motes.length > n) this.motes.length = n;
        for (let i = this.motes.length; i < n; i++) {
            this.motes.push({
                x: ftRand(0, this.w),
                y: ftRand(this.surfaceY, this.h),
                z: Math.random(),
                r: ftRand(0.5, 1.9),
                vy: ftRand(-4, 6),
                phase: ftRand(0, Math.PI * 2)
            });
        }
    }

    // -----------------------------------------------------------------------
    // Interaction. Listeners go on the document so the canvas can stay
    // pointer-events:none and leave the homepage links clickable.
    // -----------------------------------------------------------------------

    setupInteraction() {
        this.teardownInteraction();

        const move = (e) => {
            // A finger dragged across the tank is a cursor too
            const now = performance.now();
            const dt = Math.max(16, now - this.pointer.lastMove) / 1000;
            if (this.pointer.inside) {
                const dx = e.clientX - this.pointer.x;
                const dy = e.clientY - this.pointer.y;
                this.pointer.speed = ftLerp(this.pointer.speed, Math.hypot(dx, dy) / dt, 0.4);
                // Dragging pushes water around, which plants and motes feel
                if (this.pointer.down) this.currentTarget = ftClamp(this.currentTarget + dx * 0.05, -9, 9);
            }
            this.pointer.x = e.clientX;
            this.pointer.y = e.clientY;
            this.pointer.inside = true;
            this.pointer.lastMove = now;
        };

        const leave = () => { this.pointer.inside = false; this.pointer.speed = 0; };
        const down = (e) => { this.pointer.down = true; if (e.pointerType !== 'mouse') move(e); };
        // A lifted finger leaves nothing behind for the fish to investigate
        const up = (e) => { this.pointer.down = false; if (e.pointerType !== 'mouse') leave(); };

        const click = (e) => {
            if (!this.config.clickToFeed) return;
            // Don't turn a click on a homepage link or control into lunch
            if (e.target && e.target.closest && e.target.closest('a,button,input,select,textarea,label,[role="button"]')) return;
            this.feedAt(e.clientX, e.clientY);
        };

        const dbl = (e) => {
            if (e.target && e.target.closest && e.target.closest('a,button,input,select,textarea,label')) return;
            this.tapGlass(e.clientX, e.clientY);
        };

        const bind = (target, type, fn, opts) => {
            target.addEventListener(type, fn, opts);
            this.listeners.push([target, type, fn, opts]);
        };

        bind(document, 'pointermove', move, { passive: true });
        bind(document.documentElement, 'pointerleave', leave);
        bind(document, 'pointerdown', down, { passive: true });
        bind(document, 'pointerup', up, { passive: true });
        bind(document, 'pointercancel', up, { passive: true });
        bind(document, 'click', click);
        bind(document, 'dblclick', dbl);
    }

    teardownInteraction() {
        for (const [target, type, fn, opts] of this.listeners) {
            target.removeEventListener(type, fn, opts);
        }
        this.listeners = [];
    }

    feedAt(x, y) {
        const n = ftRandInt(7, 14);
        const dropIn = y < this.surfaceY + 10;
        for (let i = 0; i < n; i++) {
            this.food.push({
                x: x + ftRand(-16, 16),
                y: (dropIn ? this.surfaceY + ftRand(0, 6) : y) + ftRand(-10, 10),
                vx: ftRand(-14, 14),
                vy: ftRand(-6, 10),
                r: ftRand(1.4, 3.1),
                spin: ftRand(0, Math.PI * 2),
                spinRate: ftRand(-3, 3),
                life: ftRand(26, 40),
                settled: false,
                claimed: null
            });
        }
        this.addRipple(x, 0.9);
        // Dinner bell: everyone perks up and starts hunting
        for (const f of this.fish) {
            if (f.spec.zone === 'floor') continue;
            f.interest = Math.min(1, f.interest + 0.6);
            f.stateTimer = 0;
        }
    }

    tapGlass(x, y) {
        this.addRipple(x, 1.4);
        for (const f of this.fish) {
            const d = Math.hypot(f.x - x, f.y - y);
            const k = ftClamp(1 - d / (this.w * 0.55), 0, 1);
            f.startle = Math.max(f.startle, 0.45 + k * 0.8);
            f.state = 'flee';
            f.stateTimer = 0.7 + k * 0.9;
            f.fleeFrom = { x, y };
        }
        this.currentTarget += ftRand(-4, 4);
    }

    addRipple(x, strength) {
        this.ripples.push({ x, t: 0, strength });
        if (this.ripples.length > 24) this.ripples.shift();
    }

    // -----------------------------------------------------------------------
    // Simulation
    // -----------------------------------------------------------------------

    animate(now = performance.now()) {
        if (!this.isEnabled) return;

        // A backgrounded tab can hand back a multi-second gap; clamp it so
        // the fish don't teleport through the glass on return. Low tiers run
        // at 10-20 fps, so a long frame is stepped in halves to keep the
        // steering as stable as it is at 60.
        const dt = Math.min(0.1, Math.max(0.001, (now - this.lastTime) / 1000));
        this.lastTime = now;
        const steps = dt > 0.05 ? 2 : 1;
        for (let i = 0; i < steps; i++) {
            this.time += dt / steps;
            this.update(dt / steps);
        }
        this.draw();

        this.animationId = requestAnimationFrame(t => this.animate(t));
    }

    update(dt) {
        const t = this.time;

        // The current wanders on its own (filter outflow) and decays back
        // toward that baseline after a drag
        this.currentTarget += Math.sin(t * 0.17) * dt * 0.8;
        this.currentTarget *= Math.pow(0.35, dt);
        this.current = ftLerp(this.current, this.currentTarget + Math.sin(t * 0.43) * 0.9, 1 - Math.pow(0.02, dt));

        // Pointer speed decays when the mouse stops moving
        if (performance.now() - this.pointer.lastMove > 120) this.pointer.speed *= Math.pow(0.02, dt);

        for (const p of this.plants) this.updatePlant(p, t);
        for (const p of this.forePlants) this.updatePlant(p, t);

        this.updateSchools(dt);
        for (const f of this.fish) {
            // Fish beyond the density's count fade out and then wait,
            // unsimulated, until a higher tier wants them back
            f.fade = ftClamp(f.fade + (f.slot < this.fishShown ? dt : -dt) * 0.6, 0, 1);
            if (f.fade > 0) this.updateFish(f, dt);
        }
        this.updateFood(dt);
        this.updateBubbles(dt);
        this.updateMotes(dt);
        this.updateRipples(dt);
        this.updateSnail(dt);

        // Fish drift in depth over time; re-sorting keeps the painter's
        // ordering honest without doing it every frame
        if ((this.frameCount = (this.frameCount || 0) + 1) % 40 === 0) {
            this.fish.sort((a, b) => b.z - a.z);
        }
    }

    updateSchools(dt) {
        for (const key in this.schools) {
            const s = this.schools[key];
            s.timer -= dt;
            if (s.timer <= 0) {
                const band = this.zoneBand(this.species[key].zone);
                s.x = ftRand(this.w * 0.12, this.w * 0.88);
                s.y = ftRand(band[0], band[1]);
                s.timer = ftRand(5, 14);
            }
        }
    }

    // Steering is accumulated as a desired velocity vector, then converted to
    // a heading the fish turns toward at a bounded rate. Fish therefore arc
    // into new directions instead of snapping onto them.
    updateFish(f, dt) {
        const spec = f.spec;
        const t = this.time;
        const cfg = this.config;

        f.startle = Math.max(0, f.startle - dt * 1.15);
        f.interest = Math.max(0, f.interest - dt * 0.12);
        f.sated = Math.max(0, f.sated - dt);
        f.mouth = Math.max(0, f.mouth - dt * 4);
        f.stateTimer -= dt;

        // Steering accumulates onto the current heading, so a fish carries
        // its momentum rather than pivoting on the spot
        let wx = Math.cos(f.angle) * 0.9, wy = Math.sin(f.angle) * 0.9;
        let speedWant = f.cruise * cfg.swimSpeed;

        // --- wander -------------------------------------------------------
        f.wanderAngle += ftRand(-1, 1) * dt * 2.4;
        wx += Math.cos(f.wanderAngle) * 0.55;
        wy += Math.sin(f.wanderAngle) * 0.35;

        // --- depth drift --------------------------------------------------
        if (spec.zone !== 'floor') {
            f.z = ftClamp(f.z + Math.sin(t * 0.11 + f.seed) * dt * 0.05, 0.03, 1);
        }

        // --- vertical zone preference -------------------------------------
        const band = this.zoneBand(spec.zone);
        const mid = (band[0] + band[1]) / 2;
        const halfBand = Math.max(24, (band[1] - band[0]) / 2);
        const off = (f.y - mid) / halfBand;
        wy -= ftClamp(off, -2.5, 2.5) * 0.5;

        // --- schooling ----------------------------------------------------
        const schoolWeight = spec.schooling * cfg.schooling;
        if (schoolWeight > 0.05) {
            let cx = 0, cy = 0, ax = 0, ay = 0, sepx = 0, sepy = 0, n = 0;
            for (const o of this.fish) {
                if (o === f || o.key !== f.key || !o.fade) continue;
                const dx = o.x - f.x, dy = o.y - f.y;
                const d2 = dx * dx + dy * dy;
                if (d2 > 240 * 240) continue;
                const d = Math.sqrt(d2) || 1;
                cx += o.x; cy += o.y;
                ax += Math.cos(o.angle); ay += Math.sin(o.angle);
                const close = f.len * 1.5;
                if (d < close) { sepx -= dx / d * (1 - d / close); sepy -= dy / d * (1 - d / close); }
                n++;
            }
            if (n) {
                cx = cx / n - f.x; cy = cy / n - f.y;
                const cd = Math.hypot(cx, cy) || 1;
                wx += (cx / cd) * 0.75 * schoolWeight;
                wy += (cy / cd) * 0.75 * schoolWeight;
                const ad = Math.hypot(ax, ay) || 1;
                wx += (ax / ad) * 0.85 * schoolWeight;
                wy += (ay / ad) * 0.85 * schoolWeight;
                wx += sepx * 2.6; wy += sepy * 2.6;
            } else {
                // Lost the school: head for its rally point
                const s = this.schools[f.key];
                if (s) {
                    const dx = s.x - f.x, dy = s.y - f.y;
                    const d = Math.hypot(dx, dy) || 1;
                    wx += dx / d * 0.7 * schoolWeight;
                    wy += dy / d * 0.7 * schoolWeight;
                }
            }
        }

        // --- food ---------------------------------------------------------
        let hunting = null;
        if (this.food.length && f.sated <= 0 && spec.zone !== 'floor') {
            // A fish that saw food go in hunts further afield for a while
            let best = null, bestD = (spec.zone === 'bottom' ? 220 : 420) * f.scale * (1 + f.interest);
            for (const bit of this.food) {
                if (bit.claimed && bit.claimed !== f) continue;
                const d = Math.hypot(bit.x - f.x, bit.y - f.y);
                if (d < bestD) { bestD = d; best = bit; }
            }
            if (best) {
                hunting = best;
                best.claimed = f;
                const dx = best.x - f.x, dy = best.y - f.y;
                const d = Math.hypot(dx, dy) || 1;
                wx += dx / d * 4.5; wy += dy / d * 4.5;
                speedWant *= 1.5 + f.interest * 0.8;
                if (d < f.len * 0.45) {
                    this.eat(f, best);
                    hunting = null;
                }
            }
        }

        // --- cursor -------------------------------------------------------
        if (cfg.cursorMode !== 'off' && this.pointer.inside && !hunting) {
            const dx = this.pointer.x - f.x, dy = this.pointer.y - f.y;
            const d = Math.hypot(dx, dy) || 1;
            const fast = this.pointer.speed > 900;
            if (d < 260) {
                if (cfg.cursorMode === 'shy' || fast) {
                    const k = (1 - d / 260);
                    wx -= dx / d * 3.4 * k; wy -= dy / d * 3.4 * k;
                    if (fast && d < 150) f.startle = Math.max(f.startle, 0.5 * k);
                } else if (cfg.cursorMode === 'curious' && d > f.len * 1.3) {
                    // Curious fish drift over to investigate, more eagerly
                    // the longer the cursor sits still
                    const k = (1 - d / 260) * ftClamp(1 - this.pointer.speed / 700, 0, 1);
                    wx += dx / d * 1.9 * k; wy += dy / d * 1.9 * k;
                    speedWant *= 1 + 0.25 * k;
                }
            }
        }

        // --- startle ------------------------------------------------------
        if (f.startle > 0.02) {
            if (f.fleeFrom) {
                const dx = f.x - f.fleeFrom.x, dy = f.y - f.fleeFrom.y;
                const d = Math.hypot(dx, dy) || 1;
                wx += dx / d * 5 * f.startle; wy += dy / d * 5 * f.startle;
            }
            speedWant *= 1 + 2.6 * f.startle;
        }

        // --- bottom dwellers ----------------------------------------------
        if (spec.zone === 'floor' || spec.zone === 'bottom') {
            const floorY = this.substrateY(f.x) - f.len * (spec.flatBelly ? 0.14 : 0.24);
            const gap = f.y - floorY;
            wy += ftClamp(-gap / 40, -1.6, 1.6) * 1.5;

            // Corydoras periodically bolt to the surface for a gulp of air
            if (spec.zone === 'bottom') {
                f.gulpTimer -= dt;
                if (f.gulpTimer <= 0 && f.state !== 'gulp') { f.state = 'gulp'; f.stateTimer = 3.2; }
                if (f.state === 'gulp') {
                    wy -= 5; speedWant *= 2.1;
                    if (f.y < this.surfaceY + 26) { f.state = 'cruise'; f.gulpTimer = ftRand(20, 70); }
                    if (f.stateTimer <= 0) { f.state = 'cruise'; f.gulpTimer = ftRand(20, 70); }
                }
            }
        }

        // --- walls, surface and gravel ------------------------------------
        const m = 70;
        if (f.x < m) wx += (1 - f.x / m) * 3.2;
        if (f.x > this.w - m) wx -= (1 - (this.w - f.x) / m) * 3.2;
        const topLimit = this.surfaceY + f.len * 0.35 + 8;
        if (f.y < topLimit && f.state !== 'gulp') wy += (1 - Math.max(0, f.y - this.surfaceY) / (f.len * 0.4 + 8)) * 3.4;
        const floorLimit = this.substrateY(f.x) - f.len * 0.18;
        if (f.y > floorLimit) wy -= (f.y - floorLimit) / 18;

        // --- resting ------------------------------------------------------
        if (f.stateTimer <= 0 && f.state !== 'gulp') {
            if (f.state === 'hover') { f.state = 'cruise'; f.stateTimer = ftRand(4, 14); }
            else if (Math.random() < 0.3 && !hunting && f.startle < 0.05) { f.state = 'hover'; f.stateTimer = ftRand(1.2, 4); }
            else { f.state = 'cruise'; f.stateTimer = ftRand(3, 10); }
        }
        if (f.state === 'hover') speedWant *= 0.16;

        // --- apply --------------------------------------------------------
        let want = Math.atan2(wy, wx);
        // Level flight unless the fish is bolting or running for the surface
        const maxPitch = f.state === 'gulp' ? 1.35 : 0.55 + f.startle * 0.7;
        const horiz = Math.cos(want) >= 0 ? 0 : Math.PI;
        const pitch = ftAngleDiff(want, horiz);
        if (Math.abs(pitch) > maxPitch) want = horiz + Math.sign(pitch) * maxPitch;

        const diff = ftAngleDiff(want, f.angle);
        const maxTurn = f.turnRate * (1 + f.startle * 1.8) * dt;
        const turn = ftClamp(diff, -maxTurn, maxTurn);
        f.angle += turn;
        f.turnRate2 = ftLerp(f.turnRate2 || 0, turn / Math.max(dt, 0.001), 0.25);

        f.speed = ftLerp(f.speed, speedWant, 1 - Math.pow(0.08, dt));
        // Water pushes the fish around a little; big fish resist it more
        const drift = this.current * 6 * (1 - ftClamp(f.len / 90, 0, 0.7));
        f.x += (Math.cos(f.angle) * f.speed + drift) * dt;
        f.y += Math.sin(f.angle) * f.speed * dt;
        f.x = ftClamp(f.x, -f.len, this.w + f.len);
        f.y = ftClamp(f.y, this.surfaceY + 2, this.h);

        // Tail beat: faster and wider the harder the fish is working
        const effort = ftClamp(f.speed / (f.cruise * 1.1), 0.12, 3.2);
        f.phase += dt * spec.wave.freq * (2.2 + effort * 3.4);
        f.pecPhase += dt * spec.pectoral.beat * (0.7 + effort * 0.5);
        f.finPhase += dt * 1.6;
        f.waveAmp = spec.wave.amp * ftClamp(0.25 + effort * 0.7, 0.2, 1.5);

        // Banking: a turning fish rolls, which squashes its silhouette
        f.bank = ftLerp(f.bank, 1 - ftClamp(Math.abs(f.turnRate2) / 4.5, 0, 0.42), 1 - Math.pow(0.05, dt));

        // Handedness: which way "up" lies for this fish. It swings through
        // zero when the fish reverses, collapsing the silhouette for a beat,
        // which reads as the fish turning edge-on through the depth of the
        // tank and coming back the other way. The hysteresis band stops a
        // fish that is briefly nose-up from strobing between the two.
        const facing = Math.cos(f.angle);
        if (Math.abs(facing) > 0.12) f.handTarget = facing >= 0 ? 1 : -1;
        const step = dt * 7;
        f.hand += ftClamp(f.handTarget - f.hand, -step, step);

        this.updateSpine(f);
    }

    // Each spine point is pulled to a fixed distance behind the one ahead of
    // it. That is the whole trick: the head steers, the body follows, and
    // turns produce a real curve through the fish.
    updateSpine(f) {
        const s = f.spine;
        s[0].x = f.x; s[0].y = f.y;
        for (let i = 1; i < s.length; i++) {
            let dx = s[i].x - s[i - 1].x;
            let dy = s[i].y - s[i - 1].y;
            let d = Math.hypot(dx, dy);
            if (d < 0.0001) { dx = -Math.cos(f.angle); dy = -Math.sin(f.angle); d = 1; }
            s[i].x = s[i - 1].x + dx / d * f.seg;
            s[i].y = s[i - 1].y + dy / d * f.seg;
        }
    }

    eat(f, bit) {
        const i = this.food.indexOf(bit);
        if (i >= 0) this.food.splice(i, 1);
        f.mouth = 1;
        f.sated = ftRand(2.5, 7);
        for (let k = 0; k < 2; k++) {
            this.crumbs.push({
                x: bit.x, y: bit.y,
                vx: ftRand(-18, 18), vy: ftRand(-8, 14),
                r: ftRand(0.5, 1.2), life: ftRand(1.5, 3.5), max: 3.5
            });
        }
    }

    updateFood(dt) {
        for (let i = this.food.length - 1; i >= 0; i--) {
            const b = this.food[i];
            b.life -= dt;
            b.claimed = null;
            const floor = this.substrateY(b.x) - 2;

            if (b.y >= floor) {
                b.settled = true;
                b.y = floor;
                b.vx *= 0.7; b.vy = 0;
            } else {
                // Flakes are light: they sink slowly and flutter sideways
                b.vy = ftLerp(b.vy, 13, 1 - Math.pow(0.2, dt));
                b.vx = ftLerp(b.vx, this.current * 3 + Math.sin(this.time * 2.2 + b.spin) * 9, 1 - Math.pow(0.4, dt));
                b.x += b.vx * dt;
                b.y += b.vy * dt;
                b.spin += b.spinRate * dt;
            }
            if (b.life <= 0) this.food.splice(i, 1);
        }

        for (let i = this.crumbs.length - 1; i >= 0; i--) {
            const c = this.crumbs[i];
            c.life -= dt;
            c.vy += 14 * dt;
            c.x += (c.vx + this.current * 2) * dt;
            c.y += c.vy * dt;
            if (c.life <= 0) this.crumbs.splice(i, 1);
        }
    }

    updateBubbles(dt) {
        const rate = this.config.bubbleRate;
        if (rate > 0) {
            // Airstone buried in the gravel, left of centre
            this.bubbleAccum = (this.bubbleAccum || 0) + dt * 17 * rate;
            const stoneX = this.stoneX;
            while (this.bubbleAccum >= 1) {
                this.bubbleAccum -= 1;
                this.bubbles.push({
                    x: stoneX + ftRand(-14, 14),
                    y0: this.substrateY(stoneX),
                    y: this.substrateY(stoneX) - ftRand(0, 5),
                    r: ftRand(0.8, 3.8),
                    vy: 0,
                    phase: ftRand(0, Math.PI * 2),
                    wobble: ftRand(5, 16),
                    spread: ftRand(-1, 1) * ftRand(10, 55),
                    z: ftRand(0.2, 0.8)
                });
            }
        }

        for (let i = this.bubbles.length - 1; i >= 0; i--) {
            const b = this.bubbles[i];
            // Bubbles accelerate as they rise and expand slightly as the
            // pressure drops
            b.vy = ftLerp(b.vy, -(34 + b.r * 13), 1 - Math.pow(0.25, dt));
            b.y += b.vy * dt;
            b.phase += dt * 3.4;
            // Drift outward from the stone as the plume climbs
            const rise = ftClamp((b.y0 - b.y) / Math.max(1, b.y0 - this.surfaceY), 0, 1);
            b.x += (Math.sin(b.phase) * b.wobble + b.spread * rise + this.current * 2.5) * dt;
            b.r += dt * 0.28;
            if (b.y <= this.surfaceY + b.r) {
                this.addRipple(b.x, 0.16 + b.r * 0.05);
                this.bubbles.splice(i, 1);
            }
        }
    }

    updateMotes(dt) {
        for (const m of this.motes) {
            m.phase += dt * 0.6;
            m.x += (this.current * (0.4 + m.z) * 2.2 + Math.sin(m.phase) * 3) * dt;
            m.y += m.vy * dt * 0.35;
            if (m.y > this.h + 4) { m.y = this.surfaceY; m.x = ftRand(0, this.w); }
            if (m.y < this.surfaceY - 4) m.vy = Math.abs(m.vy);
            if (m.x < -5) m.x = this.w + 5;
            if (m.x > this.w + 5) m.x = -5;
        }
    }

    updateRipples(dt) {
        for (let i = this.ripples.length - 1; i >= 0; i--) {
            const r = this.ripples[i];
            r.t += dt;
            if (r.t > 3.2) this.ripples.splice(i, 1);
        }
    }

    updateSnail(dt) {
        const s = this.snail;
        if (!s) return;
        s.phase += dt * 3;
        // A snail on glass climbs; on gravel it follows the dunes
        if (s.wall > 0) {
            s.wall -= dt;
            s.y -= s.speed * 0.5 * dt;
            if (s.y < this.surfaceY + 30 || s.wall <= 0) {
                s.wall = 0;
                s.dir *= -1;
            }
        } else {
            s.x += s.dir * s.speed * dt;
            s.y = this.substrateY(s.x) - s.size * 0.35;
            if (s.x < 24) { s.wall = ftRand(6, 20); s.x = 18; }
            if (s.x > this.w - 24) { s.wall = ftRand(6, 20); s.x = this.w - 18; }
        }
    }

    // -----------------------------------------------------------------------
    // Rendering. Layers run back to front so that plants, fish and glass
    // genuinely occlude each other rather than sharing one flat plane.
    // -----------------------------------------------------------------------

    draw() {
        const ctx = this.ctx;
        this.resetTransform(ctx);

        // Back wall, hardscape and gravel, painted once at build time. It is
        // opaque and covers the viewport, so it doubles as the frame clear.
        if (this.sceneCanvas) {
            ctx.drawImage(this.sceneCanvas, 0, 0, this.w, this.h);
        } else {
            ctx.fillStyle = this.water.deep;
            ctx.fillRect(0, 0, this.w, this.h);
        }

        if (this.config.godRays) this.drawGodRays(ctx);

        // Far plants, then far fish, then near plants, then near fish:
        // two interleaved passes are enough to sell the depth
        this.drawPlantLayer(ctx, this.plants, 0.55, 1.01);
        this.drawFishLayer(ctx, 0.45, 1.01);
        this.drawPlantLayer(ctx, this.plants, -0.01, 0.55);
        this.drawMotes(ctx, 0.5, 1.01);
        this.drawFishLayer(ctx, -0.01, 0.45);

        this.drawSnail(ctx);
        this.drawFood(ctx);
        this.drawBubbles(ctx);
        this.drawMotes(ctx, -0.01, 0.5);

        if (this.config.foregroundPlants) this.drawForeground(ctx);

        this.drawCaustics(ctx);
        this.drawSurface(ctx);
        this.drawGlass(ctx);
    }

    drawPlantLayer(ctx, list, zMin, zMax) {
        const margin = 60;
        for (const p of list) {
            if (p.z < zMin || p.z >= zMax) continue;
            if (p.x < -margin || p.x > this.w + margin) continue;
            this.drawPlant(ctx, p);
        }
    }

    drawFishLayer(ctx, zMin, zMax) {
        const blur = this.config.depthBlur && this.hasEffect('depthBlur');
        let box = null;
        for (const f of this.fish) {
            if (f.z < zMin || f.z >= zMax || !f.fade) continue;
            if (blur && f.z > 0.65) {
                box = this.drawBlurredFish(ctx, f, box);
                continue;
            }
            if (box) box = this.flushBlur(ctx, box);
            this.drawFish(ctx, f);
        }
        if (box) this.flushBlur(ctx, box);
    }

    // Depth of field: the fish goes into a buffer at half the canvas's
    // resolution, and is softened when that is stretched back up. Its
    // shadow on the gravel stays sharp. Returns the dirty box, in CSS px.
    drawBlurredFish(ctx, f, box) {
        const k = this.dpr * 0.5;
        if (!this.blurCanvas) {
            this.blurCanvas = document.createElement('canvas');
            this.blurCanvas.width = Math.max(1, Math.round(this.w * k));
            this.blurCanvas.height = Math.max(1, Math.round(this.h * k));
            this.blurCtx = this.blurCanvas.getContext('2d');
        }
        this.drawFishShadow(ctx, f);
        this.blurCtx.setTransform(k, 0, 0, k, 0, 0);
        this.drawFish(this.blurCtx, f, false);

        const r = f.len * 1.1;
        const x0 = f.x - r, y0 = f.y - r, x1 = f.x + r, y1 = f.y + r;
        if (!box) return [x0, y0, x1, y1];
        return [Math.min(box[0], x0), Math.min(box[1], y0), Math.max(box[2], x1), Math.max(box[3], y1)];
    }

    flushBlur(ctx, box) {
        const k = this.dpr * 0.5;
        const c = this.blurCanvas;
        const sx = Math.max(0, Math.floor(box[0] * k)), sy = Math.max(0, Math.floor(box[1] * k));
        const sw = Math.min(c.width, Math.ceil(box[2] * k)) - sx, sh = Math.min(c.height, Math.ceil(box[3] * k)) - sy;
        if (sw > 0 && sh > 0) {
            ctx.save();
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(c, sx, sy, sw, sh, sx / k, sy / k, sw / k, sh / k);
            ctx.restore();
            this.blurCtx.setTransform(1, 0, 0, 1, 0, 0);
            this.blurCtx.clearRect(sx, sy, sw, sh);
        }
        return null;
    }

    drawForeground(ctx) {
        if (!this.forePlants.length) return;

        // Out-of-focus leaves pressed against the front pane. Dark and soft,
        // they frame the scene and give the tank a real front plane.
        const k = 0.34;
        if (!this.foreCanvas) {
            this.foreCanvas = document.createElement('canvas');
            this.foreCanvas.width = Math.max(1, Math.round(this.w * k));
            this.foreCanvas.height = Math.max(1, Math.round(this.h * k));
            this.foreCtx = this.foreCanvas.getContext('2d');
        }

        const fctx = this.foreCtx;
        fctx.setTransform(k, 0, 0, k, 0, 0);
        fctx.clearRect(0, 0, this.w, this.h);
        for (const p of this.forePlants) this.drawPlant(fctx, p);

        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(this.foreCanvas, 0, 0, this.w, this.h);
        ctx.restore();
    }

    drawGodRays(ctx) {
        const k = 0.5;
        if (!this.rayCanvas) {
            this.rayCanvas = document.createElement('canvas');
            this.rayCtx = this.rayCanvas.getContext('2d');
        }
        if (this.rayCanvas.width !== Math.round(this.w * k)) {
            this.rayCanvas.width = Math.max(1, Math.round(this.w * k));
            this.rayCanvas.height = Math.max(1, Math.round(this.h * k));
            this.rayTick = 0;
        }

        // The shafts drift on a ten-second cycle, so repainting them a few
        // times a second is indistinguishable from every frame
        this.rayTick = (this.rayTick || 0) + 1;
        if (this.rayTick % 4 === 1) {
            const rctx = this.rayCtx;
            rctx.setTransform(k, 0, 0, k, 0, 0);
            rctx.clearRect(0, 0, this.w, this.h);
            this.paintGodRays(rctx);
        }

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(this.rayCanvas, 0, 0, this.w, this.h);
        ctx.restore();
    }

    paintGodRays(ctx) {
        const wt = this.water;
        const surf = this.surfaceY;
        const n = 5;
        ctx.save();
        // Overlapping shafts should brighten each other, not just stack alpha
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < n; i++) {
            const seed = i * 37.7;
            const x = (i + 0.5) / n * this.w + Math.sin(this.time * 0.11 + seed) * this.w * 0.05;
            const lean = Math.sin(this.time * 0.07 + seed * 0.3) * 0.18 + (x / this.w - 0.5) * 0.35;
            const topW = this.w * 0.012 + Math.sin(this.time * 0.3 + seed) * 6;
            const len = this.h * (0.62 + Math.sin(seed) * 0.16);
            const botW = topW * 4.5;
            const bx = x + lean * len;

            const g = ctx.createLinearGradient(x, surf, bx, surf + len);
            const a = 0.055 * this.config.lightIntensity * (0.6 + 0.4 * Math.sin(this.time * 0.5 + seed));
            g.addColorStop(0, ftRgba(wt.ray, a));
            g.addColorStop(0.25, ftRgba(wt.ray, a * 0.55));
            g.addColorStop(0.65, ftRgba(wt.ray, a * 0.14));
            g.addColorStop(1, ftRgba(wt.ray, 0));

            ctx.beginPath();
            ctx.moveTo(x - topW, surf);
            ctx.lineTo(x + topW, surf);
            ctx.lineTo(bx + botW, surf + len);
            ctx.lineTo(bx - botW, surf + len);
            ctx.closePath();
            ctx.fillStyle = g;
            ctx.fill();
        }
        ctx.restore();
    }

    // Caustics are evaluated on a small grid and stretched over the tank.
    // Bright filaments form where the summed waves cross zero, which is a
    // good cheap match for light focused through a rippling surface. The
    // grid is painted ten times a second, into one of two textures, and the
    // pair is cross-faded in between, so the drift stays smooth without a
    // putImageData every frame (SPEC §4.8).
    buildCausticBuffer() {
        if (!this.causticCanvases) {
            this.causticCanvases = [0, 1].map(() => document.createElement('canvas'));
        }
        for (const c of this.causticCanvases) {
            c.width = this.causticW;
            c.height = this.causticH;
        }
        this.causticData = this.causticCanvases[0].getContext('2d').createImageData(this.causticW, this.causticH);
        // Untouched rows must read as black so the additive blend ignores them
        const d = this.causticData.data;
        for (let i = 3; i < d.length; i += 4) d[i] = 255;
        this.causticAt = null;
    }

    drawCaustics(ctx) {
        const strength = this.config.causticStrength * this.config.lightIntensity;
        if (strength <= 0.01 || !this.causticData || !this.hasEffect('caustics')) return;

        const W = this.causticW, H = this.causticH;
        const surfRow = (this.surfaceY / this.h) * H;
        const floorRow = (this.floorBase / this.h) * H;

        // Two bands carry essentially all of the light: the film just under
        // the surface and the gravel the beams land on. Everything between is
        // open water, where the falloff had already taken the pattern to
        // nothing -- so those rows are neither computed nor composited.
        const bandA = [Math.max(0, Math.floor(surfRow)), Math.min(H, Math.ceil(surfRow + H * 0.22))];
        const bandB = [Math.max(0, Math.floor(floorRow - H * 0.20)), H];

        // Keyframes a tenth of a second apart: [0] is the pattern at
        // causticAt, [1] the one after it
        const step = 0.1;
        const paint = (canvas, t) => {
            this.paintCausticField(this.causticData.data, W, H, t, ftRgb(this.water.light), surfRow, floorRow, strength, bandA, bandB);
            canvas.getContext('2d').putImageData(this.causticData, 0, 0);
        };
        if (this.causticAt === null || this.time >= this.causticAt + 2 * step) {
            this.causticAt = this.time;
            paint(this.causticCanvases[0], this.time);
            paint(this.causticCanvases[1], this.time + step);
        } else if (this.time >= this.causticAt + step) {
            this.causticCanvases.reverse();
            this.causticAt += step;
            paint(this.causticCanvases[1], this.causticAt + step);
        }
        const mix = ftClamp((this.time - this.causticAt) / step, 0, 1);

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.imageSmoothingEnabled = true;
        for (const [c, weight] of [[this.causticCanvases[0], 1 - mix], [this.causticCanvases[1], mix]]) {
            ctx.globalAlpha = 0.5 * weight;
            for (const [j0, j1] of [bandA, bandB]) {
                if (j1 <= j0) continue;
                const y = (j0 / H) * this.h;
                const hh = ((j1 - j0) / H) * this.h;
                ctx.drawImage(c, 0, j0, W, j1 - j0, 0, y, this.w, hh);
            }
        }
        ctx.restore();
    }

    paintCausticField(data, W, H, t, light, surfRow, floorRow, strength, bandA, bandB) {
        for (let j = bandA[0]; j < bandB[1]; j++) {
            if (j >= bandA[1] && j < bandB[0]) continue;
            // Light is strongest just under the surface and pools again on
            // the gravel where the beams land
            const depth = Math.max(0, j - surfRow);
            let fall = 0.02 + 0.30 * Math.exp(-depth / (H * 0.10));
            const nearFloor = 1 - Math.min(1, Math.abs(j - floorRow) / (H * 0.20));
            if (nearFloor > 0) fall += nearFloor * nearFloor * 0.60;
            if (j < surfRow) fall = 0;

            // Grid units of the original 192 x 120 field, so the ripples
            // keep their size on screen at any resolution of the texture
            const gj = j * 120 / H;
            const sj1 = Math.sin(gj * 0.76 - t * 0.74);
            for (let i = 0; i < W; i++) {
                const gi = i * 192 / W;
                const s =
                    Math.sin(gi * 0.70 + t * 0.93) +
                    sj1 +
                    Math.sin((gi + gj) * 0.45 + t * 1.22) +
                    Math.sin((gi - gj) * 0.38 - t * 0.55);
                const n = s * 0.25;
                let c = 1 - Math.abs(n) * 3.4;
                if (c <= 0) { 
                    const o = (j * W + i) * 4;
                    data[o] = data[o + 1] = data[o + 2] = 0; data[o + 3] = 255;
                    continue;
                }
                c = c * c * c * fall * strength;
                const v = ftClamp(c, 0, 1);
                const o = (j * W + i) * 4;
                data[o] = light[0] * v;
                data[o + 1] = light[1] * v;
                data[o + 2] = light[2] * v;
                data[o + 3] = 255;
            }
        }
    }

    // Local wave height of the water surface at x, including click ripples
    surfaceHeight(x) {
        const t = this.time;
        let y = Math.sin(x * 0.021 + t * 1.5) * 1.9
              + Math.sin(x * 0.047 - t * 2.3) * 1.1
              + Math.sin(x * 0.0091 + t * 0.9) * 2.6;
        for (const r of this.ripples) {
            const d = Math.abs(x - r.x);
            const front = r.t * 260;
            const w = 60;
            if (d > front + w * 2 || d < front - w * 2) continue;
            const env = Math.exp(-Math.pow((d - front) / w, 2)) * Math.exp(-r.t * 1.1) * r.strength;
            y += Math.sin((d - front) * 0.09 - r.t * 9) * 7 * env;
        }
        return y;
    }

    drawSurface(ctx) {
        const wt = this.water;
        const surf = this.surfaceY;
        const step = 14;
        const n = Math.ceil(this.w / step) + 1;

        if (!this.surfBuf || this.surfBuf.length !== n) this.surfBuf = new Float32Array(n);
        const line = this.surfBuf;
        for (let i = 0; i < n; i++) line[i] = surf + this.surfaceHeight(i * step);

        // One trace of the waterline, reused for the shimmer band below it,
        // the bright meniscus and the dark lip above
        const wave = new Path2D();
        wave.moveTo(0, line[0]);
        for (let i = 1; i < n; i++) wave.lineTo(i * step, line[i]);

        const band = new Path2D(wave);
        band.lineTo(this.w, surf + 26);
        band.lineTo(0, surf + 26);
        band.closePath();

        ctx.save();
        const shimmer = ctx.createLinearGradient(0, surf, 0, surf + 26);
        shimmer.addColorStop(0, ftRgba(wt.light, 0.20 * this.config.lightIntensity));
        shimmer.addColorStop(1, ftRgba(wt.light, 0));
        ctx.fillStyle = shimmer;
        ctx.fill(band);
        ctx.restore();

        // The waterline itself: a bright meniscus with a dark lip above it
        ctx.save();
        ctx.translate(0, -3);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 2.5;
        ctx.stroke(wave);
        ctx.restore();

        ctx.strokeStyle = ftRgba(wt.light, 0.55);
        ctx.lineWidth = 1.6;
        ctx.stroke(wave);

        // Glints riding the crests
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = ftRgba(wt.light, 1);
        for (let x = 0; x <= this.w; x += 44) {
            const a = Math.max(0, Math.sin(x * 0.03 + this.time * 2.1)) * 0.35;
            if (a < 0.05) continue;
            const hx = x + Math.sin(this.time * 0.8 + x * 0.01) * 14;
            ctx.globalAlpha = a;
            ctx.beginPath();
            // Size comes from the position, not from a fresh random number,
            // so a glint keeps its shape as it travels
            ctx.ellipse(hx, surf + this.surfaceHeight(hx), 6 + ftHash(1, x) * 7, 1.1, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    drawGlass(ctx) {
        // The pane never changes, so it is painted once and blitted. The
        // reflections drift on a two-minute cycle, which is slow enough to
        // bake in with them.
        if (!this.glassCanvas) {
            this.glassCanvas = document.createElement('canvas');
            this.glassCanvas.width = this.canvas.width;
            this.glassCanvas.height = this.canvas.height;
            const gctx = this.glassCanvas.getContext('2d');
            this.resetTransform(gctx);
            this.paintGlass(gctx);
        }
        ctx.drawImage(this.glassCanvas, 0, 0, this.w, this.h);
    }

    paintGlass(ctx) {
        const wt = this.water;

        // Corner vignette: the water is dimmer where the panes meet
        const v = ctx.createRadialGradient(
            this.w * 0.5, this.h * 0.45, Math.min(this.w, this.h) * 0.25,
            this.w * 0.5, this.h * 0.5, Math.max(this.w, this.h) * 0.72
        );
        v.addColorStop(0, 'rgba(0,0,0,0)');
        v.addColorStop(1, ftRgba(wt.glass, 0.45));
        ctx.fillStyle = v;
        ctx.fillRect(0, 0, this.w, this.h);

        // Silicone seams down the side panes
        for (const x of [0, this.w]) {
            const dir = x === 0 ? 1 : -1;
            const g = ctx.createLinearGradient(x, 0, x + dir * 26, 0);
            g.addColorStop(0, 'rgba(0,0,0,0.45)');
            g.addColorStop(0.35, ftRgba(wt.light, 0.06));
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.fillRect(Math.min(x, x + dir * 26), 0, 26, this.h);
        }

        // Two soft reflections skating across the front pane
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 2; i++) {
            const x0 = this.w * (0.18 + i * 0.5);
            const g = ctx.createLinearGradient(x0, 0, x0 + this.w * 0.22, this.h);
            g.addColorStop(0, 'rgba(255,255,255,0)');
            g.addColorStop(0.5, `rgba(255,255,255,${0.020 + i * 0.008})`);
            g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(x0, 0);
            ctx.lineTo(x0 + this.w * 0.14, 0);
            ctx.lineTo(x0 + this.w * 0.30, this.h);
            ctx.lineTo(x0 + this.w * 0.16, this.h);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();

        // Tank rim across the very top
        const rim = ctx.createLinearGradient(0, 0, 0, 10);
        rim.addColorStop(0, '#0b0e11');
        rim.addColorStop(1, 'rgba(11,14,17,0)');
        ctx.fillStyle = rim;
        ctx.fillRect(0, 0, this.w, 10);
    }

    // -----------------------------------------------------------------------
    // Fish rendering
    //
    // The spine gives the centreline; a travelling sine displaced along the
    // perpendicular gives the swimming stroke. Everything else -- outline,
    // fins, pattern, eye -- is positioned by sampling that curve, so a
    // species is described entirely by numbers in setupSpecies().
    // -----------------------------------------------------------------------

    // Depth fog, cached per fish and only recomputed when z moves enough to
    // matter. Distant fish wash out toward the water colour, which is what
    // makes the tank read as deep rather than as a sheet of stickers.
    fishPalette(f) {
        const qz = Math.round(f.z * 24) / 24;
        if (f.palette && f.paletteZ === qz) return f.palette;
        const wt = this.water;
        // Without depth of field (Low), distant fish sink further into the
        // water instead, which reads as depth just as well
        const dim = this.config.depthBlur && !this.hasEffect('depthBlur') ? Math.max(0, qz - 0.6) * 0.75 : 0;
        const k = qz * 0.62 + dim;
        const c = f.spec.colors;
        f.palette = {
            top: ftMix(c.top, wt.fog, k),
            mid: ftMix(c.mid, wt.fog, k),
            belly: ftMix(c.belly, wt.fog, k),
            fin: ftMix(c.fin, wt.fog, k),
            accent: ftMix(c.accent, wt.fog, k),
            light: ftMix(wt.light, wt.fog, k * 0.5),
            alpha: ftLerp(1, 0.72, qz) - dim * 0.5
        };
        f.paletteZ = qz;
        return f.palette;
    }

    // Fill the per-frame geometry buffers for one fish
    buildFishGeometry(f) {
        const S = f.spine.length;
        if (!f._px) {
            f._px = new Float32Array(S); f._py = new Float32Array(S);
            f._nx = new Float32Array(S); f._ny = new Float32Array(S);
            f._hw = new Float32Array(S);
        }

        const sign = f.hand >= 0 ? 1 : -1;
        const squash = Math.max(0.15, Math.abs(f.hand)) * f.bank;
        f._squash = squash;
        f._sign = sign;

        const spec = f.spec;
        for (let i = 0; i < S; i++) {
            const t = i / (S - 1);
            const a = f.spine[Math.max(0, i - 1)];
            const b = f.spine[Math.min(S - 1, i + 1)];
            let dx = a.x - b.x, dy = a.y - b.y;          // points toward the head
            const d = Math.hypot(dx, dy) || 1;
            dx /= d; dy /= d;

            // Perpendicular, flipped so the dorsal stays up
            const nx = dy * sign, ny = -dx * sign;

            // Stroke amplitude grows toward the tail; the head yaws a little
            // in counterphase, which is what a swimming fish actually does
            const ampT = 0.06 + 0.94 * t * t;
            const off = Math.sin(f.phase - t * 3.1) * ampT * f.waveAmp * f.len;

            f._px[i] = f.spine[i].x + nx * off;
            f._py[i] = f.spine[i].y + ny * off;
            f._nx[i] = nx; f._ny[i] = ny;
            f._hw[i] = ftSampleCurve(spec.body, t) * f.len * squash;
        }
    }

    // Interpolate the body curve at an arbitrary position along its length
    sampleFish(f, t) {
        const S = f.spine.length;
        const g = ftClamp(t, 0, 1) * (S - 1);
        const i = Math.min(S - 2, Math.floor(g));
        const u = g - i;
        return {
            x: ftLerp(f._px[i], f._px[i + 1], u),
            y: ftLerp(f._py[i], f._py[i + 1], u),
            nx: ftLerp(f._nx[i], f._nx[i + 1], u),
            ny: ftLerp(f._ny[i], f._ny[i + 1], u),
            hw: ftLerp(f._hw[i], f._hw[i + 1], u)
        };
    }

    drawFish(ctx, f, shadow = true) {
        const spec = f.spec;
        const pal = this.fishPalette(f);
        this.buildFishGeometry(f);

        // 2 = every detail, 1 = drop the finest, 0 = silhouette and eye only
        const apparent = f.len * (1 - f.z * 0.35);
        f.detail = apparent >= 46 ? 2 : apparent >= 30 ? 1 : 0;

        // Soft shadow cast down onto the gravel
        if (shadow) this.drawFishShadow(ctx, f);

        ctx.save();
        ctx.globalAlpha = pal.alpha * (spec.translucent || 1) * f.fade;

        const S = f.spine.length;
        const upper = [], lower = [];
        for (let i = 0; i < S; i++) {
            const belly = spec.flatBelly ? 1 - spec.flatBelly * 0.42 : 1;
            upper.push([f._px[i] + f._nx[i] * f._hw[i], f._py[i] + f._ny[i] * f._hw[i]]);
            lower.push([f._px[i] - f._nx[i] * f._hw[i] * belly, f._py[i] - f._ny[i] * f._hw[i] * belly]);
        }

        if (f.detail > 0) this.drawPectoral(ctx, f, pal, -1);   // far-side fin, behind the body
        this.drawCaudal(ctx, f, pal);
        this.drawEdgeFin(ctx, f, pal, spec.dorsal, 1);
        if (f.detail > 0 || (spec.anal && spec.anal[2] > 0.3)) {
            this.drawEdgeFin(ctx, f, pal, spec.anal, -1);
        }
        if (spec.pelvicFilament) this.drawPelvicFilaments(ctx, f, pal);

        // --- body ---------------------------------------------------------
        const body = new Path2D();
        ftSmoothPath(body, upper);
        ftSmoothPath(body, lower.slice().reverse(), false);
        body.closePath();

        const mid = this.sampleFish(f, 0.32);
        const g = ctx.createLinearGradient(
            mid.x + mid.nx * mid.hw * 1.15, mid.y + mid.ny * mid.hw * 1.15,
            mid.x - mid.nx * mid.hw * 1.15, mid.y - mid.ny * mid.hw * 1.15
        );
        g.addColorStop(0, pal.top);
        g.addColorStop(0.22, ftMix(pal.top, pal.mid, 0.65));
        g.addColorStop(0.55, pal.mid);
        g.addColorStop(0.86, ftMix(pal.mid, pal.belly, 0.6));
        g.addColorStop(1, pal.belly);
        ctx.fillStyle = g;
        ctx.fill(body);

        ctx.save();
        ctx.clip(body);
        this.drawPattern(ctx, f, pal);
        this.drawBodySheen(ctx, f, pal);
        ctx.restore();

        // A hair-thin darker outline keeps the fish from dissolving into the
        // water at distance
        ctx.strokeStyle = ftRgba(pal.top, 0.30 * (1 - f.z * 0.6));
        ctx.lineWidth = Math.max(0.5, f.len * 0.012);
        ctx.stroke(body);

        this.drawFace(ctx, f, pal);
        this.drawPectoral(ctx, f, pal, 1);           // near-side fin, over the body

        ctx.restore();
    }

    drawFishShadow(ctx, f) {
        const floor = this.substrateY(f.x);
        const drop = floor - f.y;
        if (drop < 0 || drop > this.h * 0.30) return;
        const k = 1 - drop / (this.h * 0.30);
        // Softer and wider the further the fish is above the gravel
        const rx = f.len * (0.42 + drop * 0.0016);
        const ry = f.len * (0.12 + drop * 0.0006);
        const cx = f.x + drop * 0.10, cy = floor + 2;

        ctx.save();
        ctx.globalAlpha = 0.30 * k * k * (1 - f.z * 0.5) * f.fade;
        ctx.translate(cx, cy);
        ctx.scale(1, ry / rx);
        const g = ctx.createRadialGradient(0, 0, rx * 0.15, 0, 0, rx);
        g.addColorStop(0, 'rgba(0,0,0,0.85)');
        g.addColorStop(0.55, 'rgba(0,0,0,0.42)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, rx, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // Dorsal and anal fins: a run along the body edge, pushed outward into a
    // hump and trailed backward by `droop`, with visible rays.
    drawEdgeFin(ctx, f, pal, def, side) {
        if (!def) return;
        const [t0, t1, height, droop] = def;
        const K = f.detail > 0 ? 5 : 3;
        const base = [], outer = [];
        const dir = this.sampleFish(f, Math.min(1, t1 + 0.05));
        const back = this.sampleFish(f, Math.max(0, t0 - 0.05));
        let bx = back.x - dir.x, by = back.y - dir.y;
        const bd = Math.hypot(bx, by) || 1;
        bx /= bd; by /= bd;                                  // toward the tail

        for (let i = 0; i <= K; i++) {
            const u = i / K;
            const s = this.sampleFish(f, t0 + (t1 - t0) * u);
            const bellyScale = side > 0 ? 1 : (f.spec.flatBelly ? 1 - f.spec.flatBelly * 0.42 : 1);
            const px = s.x + s.nx * side * s.hw * bellyScale * 0.94;
            const py = s.y + s.ny * side * s.hw * bellyScale * 0.94;
            base.push([px, py]);

            const hump = Math.pow(Math.sin(Math.pow(u, 0.85) * Math.PI), 0.65);
            const ripple = 1 + Math.sin(f.finPhase * 2.1 + u * 4.5) * 0.07;
            const out = height * f.len * hump * ripple * f._squash;
            outer.push([
                px + s.nx * side * out + bx * out * droop * u,
                py + s.ny * side * out + by * out * droop * u
            ]);
        }

        ctx.beginPath();
        ftSmoothPath(ctx, base);
        ftSmoothPath(ctx, outer.slice().reverse(), false);
        ctx.closePath();

        const gm = base[Math.floor(K / 2)], go = outer[Math.floor(K / 2)];
        const g = ctx.createLinearGradient(gm[0], gm[1], go[0], go[1]);
        g.addColorStop(0, ftRgba(pal.fin, 0.85));
        g.addColorStop(1, ftRgba(pal.accent, 0.30));
        ctx.save();
        ctx.globalAlpha *= 0.78;
        ctx.fillStyle = g;
        ctx.fill();

        if (f.detail > 1) {
            ctx.beginPath();
            for (let i = 1; i < K; i++) {
                ctx.moveTo(base[i][0], base[i][1]);
                ctx.lineTo(outer[i][0], outer[i][1]);
            }
            ctx.strokeStyle = ftRgba(pal.fin, 0.35);
            ctx.lineWidth = Math.max(0.4, f.len * 0.012);
            ctx.stroke();
        }
        ctx.restore();
    }

    caudalOutline(type, L, H, h0) {
        switch (type) {
            case 'fan':
                return [[0, -h0], [L * .55, -H * .75], [L, -H * .95], [L * 1.03, 0], [L, H * .95], [L * .55, H * .75], [0, h0]];
            case 'round':
                return [[0, -h0], [L * .6, -H], [L, -H * .45], [L * 1.05, 0], [L, H * .45], [L * .6, H], [0, h0]];
            case 'veil':
                return [[0, -h0], [L * .28, -H * .8], [L * .68, -H], [L * .98, -H * .5],
                        [L * 1.12, H * .08], [L * .92, H * .72], [L * .5, H * 1.02], [L * .18, H * .72], [0, h0]];
            case 'lyre':
                return [[0, -h0], [L * .32, -H * .5], [L, -H * 1.12], [L * .58, -H * .16],
                        [L * .5, 0], [L * .58, H * .16], [L, H * 1.12], [L * .32, H * .5], [0, h0]];
            case 'fork':
            default:
                return [[0, -h0], [L * .5, -H * .55], [L, -H], [L * .6, 0], [L, H], [L * .5, H * .55], [0, h0]];
        }
    }

    drawCaudal(ctx, f, pal) {
        const c = f.spec.caudal;
        const S = f.spine.length;
        const tail = { x: f._px[S - 1], y: f._py[S - 1] };
        let dx = f._px[S - 1] - f._px[S - 2];
        let dy = f._py[S - 1] - f._py[S - 2];
        const d = Math.hypot(dx, dy) || 1;
        dx /= d; dy /= d;                                    // away from the body
        const ux = f._nx[S - 1], uy = f._ny[S - 1];

        const L = c.len * f.len;
        const H = c.height * f.len * f._squash;
        const h0 = f._hw[S - 1] * 1.1;
        const lobes = c.type === 'double' ? [-0.22, 0.22] : [0];

        ctx.save();
        ctx.globalAlpha *= c.alpha + 0.25;

        for (const lobe of lobes) {
            // Paired lobes overlap, so each is drawn fainter than a single tail
            if (lobes.length > 1) ctx.globalAlpha *= 0.62;
            const shape = this.caudalOutline(c.type === 'double' ? 'veil' : c.type, L, H, h0);
            const pts = shape.map(([bx, by]) => {
                // Trailing ripple: the tail membrane lags behind its own base
                const lag = Math.sin(f.phase - 3.1 - (bx / Math.max(L, 1)) * 1.7) * H * 0.14 * (bx / Math.max(L, 1));
                const yy = by + lag + lobe * H;
                return [tail.x + dx * bx + ux * yy, tail.y + dy * bx + uy * yy];
            });

            ctx.beginPath();
            ftSmoothPath(ctx, pts);
            ctx.closePath();

            const g = ctx.createLinearGradient(tail.x, tail.y, tail.x + dx * L, tail.y + dy * L);
            g.addColorStop(0, ftRgba(pal.fin, 0.92));
            g.addColorStop(0.6, ftRgba(pal.fin, 0.60));
            g.addColorStop(1, ftRgba(pal.accent, 0.22));
            ctx.fillStyle = g;
            ctx.fill();

            // Fin rays fanning out of the peduncle
            if (f.detail > 0) {
                ctx.beginPath();
                for (let i = 1; i < pts.length - 1; i += f.detail > 1 ? 1 : 2) {
                    ctx.moveTo(tail.x + dx * L * 0.06, tail.y + dy * L * 0.06);
                    ctx.lineTo(pts[i][0], pts[i][1]);
                }
                ctx.strokeStyle = ftRgba(pal.fin, 0.28);
                ctx.lineWidth = Math.max(0.4, f.len * 0.013);
                ctx.stroke();
            }
        }
        ctx.restore();
    }

    drawPectoral(ctx, f, pal, near) {
        const p = f.spec.pectoral;
        const s = this.sampleFish(f, 0.24);
        const sweep = Math.sin(f.pecPhase) * 0.5;
        const len = p.len * f.len;
        const hgt = p.height * f.len * f._squash;

        // Recover the body axis from the perpendicular, then aim the fin
        // backward along it. Pectorals attach low on the flank, and the near
        // one sits lower and brighter than the fin on the far side.
        const headX = -s.ny * f._sign, headY = s.nx * f._sign;
        const lift = near > 0 ? -0.32 : -0.02;
        const cx = s.x + s.nx * s.hw * lift;
        const cy = s.y + s.ny * s.hw * lift;
        const angle = Math.atan2(-headY, -headX) + sweep * (near > 0 ? 1 : 0.65);

        ctx.save();
        ctx.globalAlpha *= near > 0 ? 0.62 : 0.30;
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.scale(1, f._sign * (near > 0 ? 1 : -1));
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(len * 0.7, hgt * 0.95, len, hgt * 0.2);
        ctx.quadraticCurveTo(len * 0.62, -hgt * 0.5, 0, -hgt * 0.25);
        ctx.closePath();
        ctx.fillStyle = ftRgba(pal.fin, 0.55);
        ctx.fill();
        ctx.restore();
    }

    drawPelvicFilaments(ctx, f, pal) {
        const def = f.spec.pelvicFilament;
        const s = this.sampleFish(f, 0.34);
        const len = def.len * f.len;
        ctx.save();
        ctx.globalAlpha *= 0.55;
        ctx.strokeStyle = ftRgba(pal.fin, 0.75);
        ctx.lineWidth = Math.max(0.7, f.len * 0.014);
        ctx.lineCap = 'round';
        for (const k of [-1, 1]) {
            const bx = s.x - s.nx * s.hw * 0.9;
            const by = s.y - s.ny * s.hw * 0.9;
            const wob = Math.sin(f.finPhase * 1.4 + k) * def.wobble;
            ctx.beginPath();
            ctx.moveTo(bx, by);
            ctx.quadraticCurveTo(
                bx - s.nx * len * 0.5 + wob * 8, by - s.ny * len * 0.5 + wob * 4,
                bx - s.nx * len + wob * 16 + k * f.len * 0.05,
                by - s.ny * len + wob * 6
            );
            ctx.stroke();
        }
        ctx.restore();
    }

    // Markings, painted inside the clipped body path
    drawPattern(ctx, f, pal) {
        const spec = f.spec;
        const c = spec.colors;

        switch (spec.pattern) {
            case 'neon': {
                // The tetra's two signature bands: an iridescent blue line
                // along the upper flank and red over the rear half
                this.paintBand(ctx, f, 0.04, 0.74, 0.40, 0.30, (x0, y0, x1, y1) => {
                    const g = ctx.createLinearGradient(x0, y0, x1, y1);
                    g.addColorStop(0, ftRgba('#1e7fbd', 0.0));
                    g.addColorStop(0.35, ftRgba(c.accent, 0.95));
                    g.addColorStop(0.75, ftRgba('#6ff0ff', 0.75));
                    g.addColorStop(1, ftRgba('#1e7fbd', 0.0));
                    return g;
                });
                this.paintBand(ctx, f, 0.42, 0.95, -0.22, 0.42, () => ftRgba('#e2483f', 0.80));
                break;
            }
            case 'harlequin': {
                // The rasbora's black wedge: tall at the shoulder, running
                // back to a point at the base of the tail
                const a = this.sampleFish(f, 0.34);
                const b = this.sampleFish(f, 0.50);
                const tip = this.sampleFish(f, 0.99);
                ctx.beginPath();
                ctx.moveTo(a.x + a.nx * a.hw * 0.45, a.y + a.ny * a.hw * 0.45);
                ctx.lineTo(b.x + b.nx * b.hw * 0.30, b.y + b.ny * b.hw * 0.30);
                ctx.lineTo(tip.x + tip.nx * tip.hw * 0.4, tip.y + tip.ny * tip.hw * 0.4);
                ctx.lineTo(tip.x - tip.nx * tip.hw * 1.2, tip.y - tip.ny * tip.hw * 1.2);
                ctx.lineTo(b.x - b.nx * b.hw * 1.2, b.y - b.ny * b.hw * 1.2);
                ctx.lineTo(a.x - a.nx * a.hw * 1.2, a.y - a.ny * a.hw * 1.2);
                ctx.closePath();
                ctx.fillStyle = ftRgba(c.accent, 0.85);
                ctx.fill();
                break;
            }
            case 'bars': {
                for (const bt of [0.10, 0.37, 0.68]) {
                    const a = this.sampleFish(f, bt);
                    const b = this.sampleFish(f, bt + 0.085);
                    ctx.beginPath();
                    ctx.moveTo(a.x + a.nx * a.hw * 1.3, a.y + a.ny * a.hw * 1.3);
                    ctx.lineTo(b.x + b.nx * b.hw * 1.3, b.y + b.ny * b.hw * 1.3);
                    ctx.lineTo(b.x - b.nx * b.hw * 1.3, b.y - b.ny * b.hw * 1.3);
                    ctx.lineTo(a.x - a.nx * a.hw * 1.3, a.y - a.ny * a.hw * 1.3);
                    ctx.closePath();
                    ctx.fillStyle = ftRgba(c.accent, 0.75);
                    ctx.fill();
                }
                break;
            }
            case 'koi': {
                for (let i = 0; i < 3; i++) {
                    const t = 0.15 + ftHash(f.seed, i) * 0.65;
                    const s = this.sampleFish(f, t);
                    const o = (ftHash(f.seed, i + 40) - 0.5) * 1.1;
                    ctx.beginPath();
                    ctx.ellipse(
                        s.x + s.nx * s.hw * o, s.y + s.ny * s.hw * o,
                        f.len * (0.05 + ftHash(f.seed, i + 10) * 0.07),
                        f.len * (0.04 + ftHash(f.seed, i + 20) * 0.05),
                        ftHash(f.seed, i + 30) * Math.PI, 0, Math.PI * 2
                    );
                    ctx.fillStyle = ftRgba(c.accent, 0.55);
                    ctx.fill();
                }
                break;
            }
            case 'speckle': {
                for (let i = 0; i < 9; i++) {
                    const t = 0.35 + ftHash(f.seed, i) * 0.6;
                    const s = this.sampleFish(f, t);
                    const o = (ftHash(f.seed, i + 50) - 0.5) * 1.5;
                    ctx.beginPath();
                    ctx.arc(s.x + s.nx * s.hw * o, s.y + s.ny * s.hw * o, f.len * 0.035, 0, Math.PI * 2);
                    ctx.fillStyle = ftRgba(i % 2 ? c.accent : c.fin, 0.75);
                    ctx.fill();
                }
                break;
            }
            case 'mottle': {
                for (let i = 0; i < 14; i++) {
                    const t = ftHash(f.seed, i) * 0.95;
                    const s = this.sampleFish(f, t);
                    const o = (ftHash(f.seed, i + 60) - 0.5) * 1.8;
                    ctx.beginPath();
                    ctx.ellipse(
                        s.x + s.nx * s.hw * o, s.y + s.ny * s.hw * o,
                        f.len * (0.03 + ftHash(f.seed, i + 70) * 0.055),
                        f.len * (0.025 + ftHash(f.seed, i + 80) * 0.04),
                        0, 0, Math.PI * 2
                    );
                    ctx.fillStyle = ftRgba(c.accent, 0.35);
                    ctx.fill();
                }
                break;
            }
            case 'armor': {
                // Plate seams running the length of the fish plus pale spots
                ctx.strokeStyle = ftRgba(c.belly, 0.20);
                ctx.lineWidth = Math.max(0.5, f.len * 0.012);
                for (const o of [0.55, 0.05, -0.5]) {
                    ctx.beginPath();
                    const line = [];
                    for (let t = 0.05; t <= 0.95; t += 0.1) {
                        const s = this.sampleFish(f, t);
                        line.push([s.x + s.nx * s.hw * o, s.y + s.ny * s.hw * o]);
                    }
                    ftSmoothPath(ctx, line);
                    ctx.stroke();
                }
                for (let i = 0; i < 16; i++) {
                    const t = ftHash(f.seed, i) * 0.95;
                    const s = this.sampleFish(f, t);
                    const o = (ftHash(f.seed, i + 90) - 0.5) * 1.7;
                    ctx.beginPath();
                    ctx.arc(s.x + s.nx * s.hw * o, s.y + s.ny * s.hw * o, f.len * 0.022, 0, Math.PI * 2);
                    ctx.fillStyle = ftRgba(c.belly, 0.28);
                    ctx.fill();
                }
                break;
            }
            case 'iridescent': {
                // Betta scales: a diagonal colour shift that slides as the
                // fish turns, plus a few bright scale rows
                const a = this.sampleFish(f, 0.1), b = this.sampleFish(f, 0.95);
                const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
                g.addColorStop(0, ftRgba(c.top, 0.55));
                g.addColorStop(0.45, ftRgba(c.mid, 0.0));
                g.addColorStop(1, ftRgba(c.accent, 0.55));
                ctx.fillStyle = g;
                ctx.fillRect(
                    Math.min(a.x, b.x) - f.len, Math.min(a.y, b.y) - f.len,
                    Math.abs(a.x - b.x) + f.len * 2, Math.abs(a.y - b.y) + f.len * 2
                );
                break;
            }
        }
    }

    // A band running along the body at a fixed height, used for the stripes
    // that most of the patterns are built from
    paintBand(ctx, f, t0, t1, offset, thickness, fillFactory) {
        const top = [], bot = [];
        const stride = f.detail > 0 ? 0.25 : 0.5;
        for (let u = 0; u <= 1.0001; u += stride) {
            const t = t0 + (t1 - t0) * u;
            const s = this.sampleFish(f, t);
            const half = s.hw * thickness;
            const cy = offset * s.hw;
            top.push([s.x + s.nx * (cy + half), s.y + s.ny * (cy + half)]);
            bot.push([s.x + s.nx * (cy - half), s.y + s.ny * (cy - half)]);
        }
        ctx.beginPath();
        ftSmoothPath(ctx, top);
        ftSmoothPath(ctx, bot.reverse(), false);
        ctx.closePath();
        const a = this.sampleFish(f, t0), b = this.sampleFish(f, t1);
        ctx.fillStyle = fillFactory(a.x, a.y, b.x, b.y);
        ctx.fill();
    }

    // Wet-scale highlight along the upper flank, plus caustic-coloured
    // glints that slide as the fish swims
    drawBodySheen(ctx, f, pal) {
        const sheen = f.spec.sheen * (1 - f.z * 0.55);
        if (sheen <= 0.02 || f.detail === 0) return;

        const pts = [];
        for (let t = 0.06; t <= 0.85; t += 0.18) {
            const s = this.sampleFish(f, t);
            const o = 0.35 + Math.sin(t * 3 + f.seed) * 0.12;
            pts.push([s.x + s.nx * s.hw * o, s.y + s.ny * s.hw * o]);
        }
        ctx.beginPath();
        ftSmoothPath(ctx, pts);
        ctx.strokeStyle = ftRgba(this.water.light, 0.22 * sheen);
        ctx.lineWidth = Math.max(1, f.len * 0.055);
        ctx.lineCap = 'round';
        ctx.stroke();

        if (f.len < 36 || f.z > 0.6) return;

        const glint = this.sampleFish(f, 0.30 + 0.12 * Math.sin(this.time * 0.7 + f.seed));
        const g = ctx.createRadialGradient(glint.x, glint.y, 0, glint.x, glint.y, f.len * 0.3);
        g.addColorStop(0, ftRgba(this.water.light, 0.20 * sheen));
        g.addColorStop(1, ftRgba(this.water.light, 0));
        ctx.fillStyle = g;
        ctx.fillRect(glint.x - f.len * 0.3, glint.y - f.len * 0.3, f.len * 0.6, f.len * 0.6);
    }

    drawFace(ctx, f, pal) {
        const spec = f.spec;
        const head = this.sampleFish(f, 0.02);
        const gill = this.sampleFish(f, 0.20);
        const eyeAt = this.sampleFish(f, spec.sucker ? 0.13 : 0.095);

        // Gill plate
        if (f.detail > 0) {
        ctx.beginPath();
        ctx.moveTo(gill.x + gill.nx * gill.hw * 0.92, gill.y + gill.ny * gill.hw * 0.92);
        ctx.quadraticCurveTo(
            gill.x - (-gill.ny * f._sign) * f.len * 0.07,
            gill.y - (gill.nx * f._sign) * f.len * 0.07,
            gill.x - gill.nx * gill.hw * 0.75, gill.y - gill.ny * gill.hw * 0.75
        );
        ctx.strokeStyle = ftRgba(pal.top, 0.30);
        ctx.lineWidth = Math.max(0.6, f.len * 0.016);
        ctx.stroke();
        }

        // Mouth, which opens for a beat when the fish takes food
        const headX = -head.ny * f._sign, headY = head.nx * f._sign;
        const mx = head.x + headX * f.len * 0.02;
        const my = head.y + headY * f.len * 0.02;
        if (spec.sucker) {
            ctx.beginPath();
            ctx.ellipse(mx, my, f.len * 0.055, f.len * 0.045, Math.atan2(headY, headX), 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(20,16,12,0.7)';
            ctx.fill();
        } else {
            const open = f.mouth * f.len * 0.05;
            ctx.beginPath();
            ctx.moveTo(mx, my + open * 0.5);
            ctx.lineTo(mx - headX * f.len * 0.09, my - headY * f.len * 0.09 - open * 0.5);
            ctx.strokeStyle = 'rgba(0,0,0,0.42)';
            ctx.lineWidth = Math.max(0.7, f.len * 0.018 + open);
            ctx.lineCap = 'round';
            ctx.stroke();
        }

        // Barbels sweep the gravel ahead of a corydoras
        if (spec.barbels) {
            ctx.strokeStyle = ftRgba(pal.belly, 0.55);
            ctx.lineWidth = Math.max(0.5, f.len * 0.012);
            for (let i = -1; i <= 1; i++) {
                const wob = Math.sin(f.finPhase * 3 + i) * f.len * 0.03;
                ctx.beginPath();
                ctx.moveTo(mx, my);
                ctx.quadraticCurveTo(
                    mx + headX * f.len * 0.08 + wob, my + headY * f.len * 0.08 - head.nx * 0,
                    mx + headX * f.len * 0.12 - head.nx * f.len * (0.06 * i - 0.05),
                    my + headY * f.len * 0.12 - head.ny * f.len * (0.06 * i - 0.05)
                );
                ctx.stroke();
            }
        }

        // Bristlenose tentacles
        if (spec.bristles) {
            ctx.strokeStyle = ftRgba(pal.belly, 0.45);
            ctx.lineWidth = Math.max(0.5, f.len * 0.010);
            for (let i = 0; i < 6; i++) {
                const a = (i / 5 - 0.5) * 1.5;
                ctx.beginPath();
                ctx.moveTo(mx, my);
                ctx.lineTo(
                    mx + headX * f.len * 0.11 + head.nx * f.len * 0.09 * a,
                    my + headY * f.len * 0.11 + head.ny * f.len * 0.09 * a
                );
                ctx.stroke();
            }
        }

        // Eye
        const r = spec.eye * f.len;
        const ex = eyeAt.x + eyeAt.nx * eyeAt.hw * 0.40;
        const ey = eyeAt.y + eyeAt.ny * eyeAt.hw * 0.40;
        ctx.beginPath();
        ctx.arc(ex, ey, r, 0, Math.PI * 2);
        ctx.fillStyle = ftMix(pal.belly, '#d9b25f', 0.5);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(ex, ey, r * 0.62, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(8,8,10,0.92)';
        ctx.fill();
        if (f.detail > 0) {
            ctx.beginPath();
            ctx.arc(ex - r * 0.28, ey - r * 0.30, r * 0.26, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.fill();
        }
    }

    // -----------------------------------------------------------------------
    // Particles and the tank's other inhabitants
    // -----------------------------------------------------------------------

    drawBubbles(ctx) {
        if (!this.bubbleAtlas) return;

        const cell = this.bubbleCell, half = cell / 2;
        const last = this.bubbleCells.length - 1;
        const prevAlpha = ctx.globalAlpha;
        for (const b of this.bubbles) {
            const i = ftClamp(Math.round((b.r - this.bubbleMinR) / this.bubbleStep), 0, last);
            ctx.globalAlpha = 0.55 * (1 - b.z * 0.4);
            ctx.drawImage(this.bubbleAtlas, this.bubbleCells[i], 0, cell, cell,
                          b.x - half, b.y - half, cell, cell);
        }
        ctx.globalAlpha = prevAlpha;
    }

    drawFood(ctx) {
        for (const b of this.food) {
            const fade = ftClamp(b.life / 8, 0, 1);
            ctx.save();
            ctx.translate(b.x, b.y);
            ctx.rotate(b.spin);
            ctx.globalAlpha = 0.9 * fade;
            ctx.beginPath();
            // Flakes are thin irregular chips, not pellets
            ctx.ellipse(0, 0, b.r * 1.6, b.r * 0.6, 0, 0, Math.PI * 2);
            ctx.fillStyle = b.settled ? '#8a6b3c' : '#c99347';
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(-b.r * 0.3, -b.r * 0.15, b.r * 0.7, b.r * 0.22, 0, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,225,170,0.55)';
            ctx.fill();
            ctx.restore();
        }

        for (const c of this.crumbs) {
            ctx.beginPath();
            ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(214,176,118,${0.6 * ftClamp(c.life / c.max, 0, 1)})`;
            ctx.fill();
        }
    }

    drawMotes(ctx, zMin, zMax) {
        if (!this.config.motes) return;

        const prevAlpha = ctx.globalAlpha;
        ctx.fillStyle = this.water.light;

        // Three depth buckets, one path and one fill each, rather than a
        // path and a fill per speck
        for (let b = 0; b < 3; b++) {
            const lo = Math.max(zMin, b / 3), hi = Math.min(zMax, (b + 1) / 3);
            if (hi <= lo) continue;
            let any = false;
            ctx.beginPath();
            for (const m of this.motes) {
                if (m.z < lo || m.z >= hi) continue;
                const r = m.r * (1.1 - m.z * 0.4);
                ctx.moveTo(m.x + r, m.y);
                ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
                any = true;
            }
            if (!any) continue;
            ctx.globalAlpha = 0.10 + 0.14 * (1 - (b + 0.5) / 3);
            ctx.fill();
        }
        ctx.globalAlpha = prevAlpha;
    }

    drawSnail(ctx) {
        const s = this.snail;
        if (!s) return;
        const wt = this.water;
        const lean = s.wall > 0 ? (s.x < this.w / 2 ? 1 : -1) * Math.PI / 2 : 0;

        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(lean);

        // Foot, rippling as it crawls
        ctx.beginPath();
        ctx.moveTo(-s.size * 1.1, s.size * 0.32);
        for (let i = 0; i <= 8; i++) {
            const u = i / 8;
            ctx.lineTo(
                -s.size * 1.1 + u * s.size * 2.3,
                s.size * 0.32 + Math.sin(s.phase + u * 6) * s.size * 0.06
            );
        }
        ctx.lineTo(s.size * 1.2, s.size * 0.05);
        ctx.quadraticCurveTo(0, -s.size * 0.2, -s.size * 1.1, s.size * 0.05);
        ctx.closePath();
        ctx.fillStyle = ftMix('#c9a98c', wt.fog, 0.2);
        ctx.fill();

        // Eye stalks
        ctx.strokeStyle = ftMix('#b5947a', wt.fog, 0.2);
        ctx.lineWidth = Math.max(0.8, s.size * 0.10);
        for (const k of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(s.size * 0.9 * s.dir, s.size * 0.05);
            ctx.lineTo(s.size * (1.35 + k * 0.08) * s.dir, -s.size * (0.35 + k * 0.1));
            ctx.stroke();
        }

        // Spiral shell
        ctx.beginPath();
        ctx.ellipse(0, -s.size * 0.25, s.size, s.size * 0.85, 0.2, 0, Math.PI * 2);
        const g = ctx.createRadialGradient(-s.size * 0.3, -s.size * 0.6, s.size * 0.1, 0, -s.size * 0.25, s.size);
        g.addColorStop(0, ftMix('#d8a447', wt.fog, 0.15));
        g.addColorStop(1, ftMix('#6a4a1f', wt.fog, 0.3));
        ctx.fillStyle = g;
        ctx.fill();
        ctx.beginPath();
        for (let a = 0; a < Math.PI * 4; a += 0.2) {
            const r = s.size * (1 - a / (Math.PI * 4.6));
            const px = Math.cos(a + 0.4) * r * 0.9;
            const py = -s.size * 0.25 + Math.sin(a + 0.4) * r * 0.75;
            if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = 'rgba(60,38,14,0.45)';
        ctx.lineWidth = Math.max(0.6, s.size * 0.09);
        ctx.stroke();
        ctx.restore();
    }

    // -----------------------------------------------------------------------
    // Configuration UI
    // -----------------------------------------------------------------------

    defaults() {
        return WP.settings.defaults();
    }

    destroy() {
        this.stop();
        if (this._onResize) window.removeEventListener('resize', this._onResize);
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
        this.canvas = null;
    }
}
