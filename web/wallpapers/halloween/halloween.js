// Halloween night scene.
//
// The animation is a scene rather than a particle shower: a moon over layered
// silhouette bands, jack-o'-lanterns sitting on the ground acting as the only
// warm light sources, drifting ground fog, bats, ghost wisps, sagging webs and
// distant lightning. Everything static is baked into offscreen canvases at
// start-up so the per-frame cost is the lit entities plus a few full-screen
// passes, which the auto quality mode scales down when frames get long.

const hwClamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const hwLerp = (a, b, t) => a + (b - a) * t;
const hwSmooth = (t) => t * t * (3 - 2 * t);

// Deterministic PRNG so a scene seed rebuilds the exact same graveyard. The
// baked caches and the live entities both draw from it, so a cache rebuilt
// after a resize lines up with what is already on screen.
function hwRng(seed) {
    let a = (seed >>> 0) || 0x9e3779b9;
    return function () {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Summed low-frequency sines at incommensurable rates. A candle does not
// flicker on a clean sine, and a single sine is instantly readable as fake.
function hwFlicker(t, phase) {
    return (Math.sin(t * 7.3 + phase) * 0.5
        + Math.sin(t * 13.7 + phase * 2.1) * 0.3
        + Math.sin(t * 29.1 + phase * 3.7) * 0.2
        + Math.sin(t * 2.3 + phase * 0.7) * 0.6) / 1.6;
}

const hwRgba = (rgb, a) => `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;

function hwHexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hwMixRgb(a, b, t) {
    return [
        Math.round(hwLerp(a[0], b[0], t)),
        Math.round(hwLerp(a[1], b[1], t)),
        Math.round(hwLerp(a[2], b[2], t))
    ];
}

// Palettes. Each theme retunes the whole scene, not just the sky, because a
// red moon over purple hills reads as a bug rather than a mood.
const HW_THEMES = {
    classic: {
        label: '🌑 Classic Night',
        skyTop: '#120725', skyMid: '#241041', skyHorizon: '#4a1f55',
        hill: '#1d0f30', tree: '#0a0513', fence: '#120a1c', stone: '#1b1426',
        ground: '#130a1d', groundFar: '#1d1029',
        castle: '#190d2b', roof: '#2d1240', window: '#ffc247',
        moon: '#f6eed2', moonHalo: '#b89cd8',
        star: '#e8e0ff', fog: '#7a6a95', light: '#ffa32a', ghost: '#cfeaff', zombie: '#7fa06a',
        bolt: '#dcc8ff'
    },
    bloodmoon: {
        label: '🌕 Blood Moon',
        skyTop: '#140406', skyMid: '#330a0d', skyHorizon: '#731c18',
        hill: '#2a0b0c', tree: '#0d0304', fence: '#160707', stone: '#201210',
        ground: '#140606', groundFar: '#240d0c',
        castle: '#240c0a', roof: '#3a0f0c', window: '#ffb04a',
        moon: '#ff7a52', moonHalo: '#c43820',
        star: '#ffd9cc', fog: '#8a5048', light: '#ff7a14', ghost: '#ffd8c4', zombie: '#8f7a52',
        bolt: '#ffd0b0'
    },
    harvest: {
        label: '🍂 Harvest Dusk',
        skyTop: '#1b0d05', skyMid: '#43190a', skyHorizon: '#9c4a10',
        hill: '#33180a', tree: '#120803', fence: '#1d1008', stone: '#241a13',
        ground: '#1a0d06', groundFar: '#2c1709',
        castle: '#26150a', roof: '#3b1d0b', window: '#ffd067',
        moon: '#ffd37e', moonHalo: '#d08a34',
        star: '#ffeccb', fog: '#9a7148', light: '#ffb23a', ghost: '#fff0d4', zombie: '#93a066',
        bolt: '#ffe8bc'
    },
    mist: {
        label: '🌫️ Cold Mist',
        skyTop: '#070d12', skyMid: '#152532', skyHorizon: '#36505e',
        hill: '#132029', tree: '#060b0f', fence: '#0d151b', stone: '#162128',
        ground: '#0a1116', groundFar: '#132029',
        castle: '#101b22', roof: '#172a35', window: '#ffd98a',
        moon: '#e4f0f6', moonHalo: '#7fa6bc',
        star: '#dbeaf4', fog: '#9fb8c8', light: '#ffc56b', ghost: '#dff4ff', zombie: '#79947e',
        bolt: '#dff2ff'
    },
    midnight: {
        label: '🌌 Deep Midnight',
        skyTop: '#02040a', skyMid: '#070d1d', skyHorizon: '#131f3d',
        hill: '#0a1020', tree: '#030509', fence: '#080c14', stone: '#101623',
        ground: '#05080f', groundFar: '#0b1120',
        castle: '#0b1020', roof: '#111931', window: '#ffc247',
        moon: '#d4e4ff', moonHalo: '#6a84c0',
        star: '#eef4ff', fog: '#6a7ea8', light: '#ff9a22', ghost: '#cfe2ff', zombie: '#6f8f74',
        bolt: '#cfe0ff'
    }
};

// Presets decide what furniture the scene is built from. They are applied on
// top of the saved config at scene-build time, so switching preset does not
// clobber the user's slider values.
const HW_PRESETS = {
    graveyard: {
        label: '🪦 Graveyard',
        stones: 13, fenceRuns: 2, treeDensity: 1.0, pumpkinScatter: 0.55,
        vines: false, deadGrass: 1.0,
        castle: 0.85, crypts: 2, gate: true, lamps: 2, mounds: 0.5, zombies: 1.3
    },
    castle: {
        label: '🏰 Castle Dracula',
        stones: 9, fenceRuns: 1, treeDensity: 0.9, pumpkinScatter: 0.5,
        vines: false, deadGrass: 0.8,
        castle: 1.45, crypts: 1, gate: true, lamps: 2, mounds: 0.35, zombies: 1.0
    },
    pumpkinpatch: {
        label: '🎃 Pumpkin Patch',
        stones: 0, fenceRuns: 1, treeDensity: 0.45, pumpkinScatter: 1.0,
        vines: true, deadGrass: 1.3,
        castle: 0.5, crypts: 0, gate: false, lamps: 1, mounds: 0, zombies: 0.4
    },
    hauntedwood: {
        label: '🌲 Haunted Wood',
        stones: 4, fenceRuns: 0, treeDensity: 2.2, pumpkinScatter: 0.4,
        vines: false, deadGrass: 0.6,
        castle: 0.7, crypts: 1, gate: false, lamps: 1, mounds: 0.3, zombies: 0.8
    },
    minimal: {
        label: '🌙 Bare Hill',
        stones: 2, fenceRuns: 0, treeDensity: 0.25, pumpkinScatter: 0.3,
        vines: false, deadGrass: 0.4,
        castle: 0.6, crypts: 0, gate: false, lamps: 0, mounds: 0, zombies: 0.3
    }
};

// Depth bands. Parallax is the share of the camera pan a band receives, tint
// is how far it fades toward the horizon haze, and scale sizes the furniture
// standing in it.
const HW_BANDS = [
    { parallax: 0.06, tint: 0.80, scale: 0.26, yFrac: 0.02 },
    { parallax: 0.14, tint: 0.58, scale: 0.42, yFrac: 0.09 },
    { parallax: 0.30, tint: 0.34, scale: 0.64, yFrac: 0.26 },
    { parallax: 0.56, tint: 0.14, scale: 0.88, yFrac: 0.52 },
    { parallax: 0.92, tint: 0.00, scale: 1.20, yFrac: 0.86 }
];

// The baked sky/skyline cache is a little wider than the viewport so the
// slow pan across it never exposes an edge.
const HW_MARGIN = 40;

class HalloweenAnimationManager {
    constructor(host) {
        this.host = host;
        this.canvas = null;
        this.ctx = null;
        this.animationId = null;
        this.isRunning = false;
        this.time = 0;
        this.lastTime = 0;

        this.w = 0;
        this.h = 0;
        this.dpr = 1;
        this.autoScale = 1;
        this.frameSamples = [];
        this.autoClimbs = 0;
        this.autoFailures = 0;
        this.autoPending = false;

        // Baked art
        this.staticCanvas = null;   // sky, stars, moon, hills, far trees
        this.skylineCanvas = null;  // silhouette-only copy, for lightning backlight
        this.vignetteCanvas = null;
        this.grainCanvas = null;
        this.bloomA = null;
        this.bloomT = null;
        this.bloomB = null;
        this.glowSprite = null;     // radial light pool
        this.coneSprite = null;     // projected face light
        this.fogSprite = null;
        this.candySprites = null;
        this.leafSprites = null;
        this.webCanvas = null;
        this.zombieCanvas = null;
        this.grainPattern = null;
        this.activeSeed = null;

        // Entities
        this.pumpkins = [];
        this.candy = [];
        this.leaves = [];
        this.bats = [];
        this.ghosts = [];
        this.zombies = [];
        this.webs = [];
        this.fogBlobs = [];
        this.gusts = [];
        this.scene = null;

        this.wind = 0;
        this.windTarget = 0;
        this.lightning = { active: false, t: 0, seq: [], next: 12, bolt: null, level: 0 };

        this.pointer = { x: -1e5, y: -1e5, inside: false, down: false, lastX: 0 };
        this.pan = { x: 0, y: 0, tx: 0, ty: 0 };
        this.listeners = [];
        this._onResize = null;

        this.config = WP.settings.load();
    }

    defaultConfig() {
        return WP.settings.defaults();
    }

    saveConfig(config) {
        if (config) Object.assign(this.config, config);
        WP.settings.save(this.config);
    }

    get theme() {
        return HW_THEMES[this.config.theme] || HW_THEMES.classic;
    }

    get preset() {
        return HW_PRESETS[this.config.scenePreset] || HW_PRESETS.graveyard;
    }

    // Ground plane, measured against the area the host keeps clear.
    get usableHeight() {
        return Math.max(200, this.h - this.host.insets.bottom);
    }

    get horizonY() {
        return this.usableHeight * hwClamp(this.config.horizon, 0.3, 0.85);
    }

    // -----------------------------------------------------------------------
    // Lifecycle
    // -----------------------------------------------------------------------

    start() {
        if (this.isRunning) return;

        this.createCanvas();
        this.buildScene();
        this.bakeSprites();
        this.bakeStatic();
        this.bakeOverlays();
        this.spawnEntities();
        this.setupInteraction();

        this.isRunning = true;
        this.time = 0;
        this.lastTime = performance.now();
        this.animate();
    }

    stop() {
        if (!this.isRunning) return;
        this.isRunning = false;

        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.teardownInteraction();
        if (this._onResize) {
            window.removeEventListener('resize', this._onResize);
            this._onResize = null;
        }
        if (this.canvas) {
            this.canvas.remove();
            this.canvas = null;
            this.ctx = null;
        }

        this.pumpkins = [];
        this.candy = [];
        this.leaves = [];
        this.bats = [];
        this.ghosts = [];
        this.zombies = [];
        this.webs = [];
        this.fogBlobs = [];
        this.gusts = [];
        this.scene = null;
        this.staticCanvas = null;
        this.skylineCanvas = null;
        this.vignetteCanvas = null;
        this.grainCanvas = null;
        this.bloomA = null;
        this.bloomT = null;
        this.bloomB = null;
        this.webCanvas = null;
        this.zombieCanvas = null;
        this.glowSprite = null;
        this.coneSprite = null;
        this.fogSprite = null;
        this.candySprites = null;
        this.leafSprites = null;
        // The pattern belongs to the context that is going away with the canvas
        this.grainPattern = null;
    }

    createCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'halloween-canvas';
        this.canvas.style.position = 'fixed';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.zIndex = '-1';
        this.canvas.style.pointerEvents = 'none';

        this.w = window.innerWidth;
        this.h = window.innerHeight;
        this.ctx = this.canvas.getContext('2d');
        this.applyRenderScale(this.targetRenderScale());

        this._onResize = () => this.handleResize();
        window.addEventListener('resize', this._onResize);

        document.body.appendChild(this.canvas);
    }

    handleResize() {
        if (!this.canvas) return;
        this.w = window.innerWidth;
        this.h = window.innerHeight;
        this.applyRenderScale(this.targetRenderScale());
        // The skyline is cut to fit the viewport, so it and everything
        // standing on the ground has to be rebuilt
        this.buildScene();
        this.bakeStatic();
        this.bakeOverlays();
        this.rebuildWebs();
        this.placeGroundEntities();
        if (this.config.fog) this.spawnFog();
    }

    // Device pixels per CSS pixel. The full-screen passes -- fog, bloom,
    // vignette, grain, lightning wash -- all cost in proportion to the square
    // of this, so it is the main lever on frame rate.
    targetRenderScale() {
        const native = Math.min(window.devicePixelRatio || 1, 2);
        let scale;
        switch (this.config.quality) {
            case 'high': scale = native; break;
            case 'balanced': scale = Math.min(native, 1.35); break;
            case 'performance': scale = Math.min(native, 1); break;
            default: scale = hwClamp(this.autoScale, 0.7, Math.min(native, 1.6));
        }

        const budget = 3.0e6;
        const cssPixels = Math.max(1, this.w * this.h);
        if (cssPixels * scale * scale > budget) {
            scale = Math.max(0.6, Math.sqrt(budget / cssPixels));
        }
        return scale;
    }

    applyRenderScale(scale) {
        const width = Math.max(1, Math.round(this.w * scale));
        const height = Math.max(1, Math.round(this.h * scale));
        const changed = this.canvas.width !== width || this.canvas.height !== height;

        this.dpr = scale;
        if (changed) {
            this.canvas.width = width;
            this.canvas.height = height;
            // Caches sized in device pixels no longer match
            this.bloomA = null;
            this.bloomT = null;
            this.bloomB = null;
        }
        this.ctx.setTransform(scale, 0, 0, scale, 0, 0);
        return changed;
    }

    // Auto quality. Frame intervals are compared against the vsync budget
    // rather than a draw timer: canvas work finishes on the GPU long after
    // the draw calls return, so a CPU timer around draw() sees almost nothing.
    tuneQuality(frameMs) {
        if (this.config.quality !== 'auto') return;
        if (!(frameMs > 0) || frameMs > 120) return;   // tab stall, not a slow frame

        const samples = this.frameSamples;
        samples.push(frameMs);
        if (samples.length < 60) return;

        samples.sort((a, b) => a - b);
        const median = samples[30];
        samples.length = 0;

        const ceiling = Math.min(window.devicePixelRatio || 1, 2, 1.6);
        const before = this.autoScale;

        if (median > 20.5 && this.autoScale > 0.7) {
            this.autoScale = Math.max(0.7, this.autoScale * 0.85);
            // A step up that had to be undone is a step up worth not retrying
            if (this.autoPending) this.autoFailures++;
            this.autoPending = false;
        } else if (median < 17.2 && this.autoScale < ceiling
            && this.autoFailures < 2 && this.autoClimbs < 6) {
            this.autoScale = Math.min(ceiling, this.autoScale * 1.08);
            this.autoClimbs++;
            this.autoPending = true;
        } else {
            this.autoPending = false;
        }

        if (this.autoScale !== before) {
            if (this.applyRenderScale(this.targetRenderScale())) this.bakeOverlays();
        }
    }

    scratch(w, h) {
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w));
        c.height = Math.max(1, Math.round(h));
        return c;
    }

    // -----------------------------------------------------------------------
    // Scene generation
    // -----------------------------------------------------------------------

    buildScene() {
        // Reuse the seed already in play, so a resize re-lays the same scene
        // instead of handing back a different graveyard
        const seed = this.config.sceneSeed || this.activeSeed || ((Math.random() * 1e9) | 0);
        this.activeSeed = seed;
        const rng = hwRng(seed);
        const p = this.preset;
        const w = this.w;
        const horizon = this.horizonY;

        const scene = {
            seed,
            moon: {
                x: w * (0.12 + rng() * 0.2),
                y: horizon * (0.22 + rng() * 0.18),
                r: Math.max(34, Math.min(w, this.h) * 0.075)
            },
            stars: [],
            clouds: [],
            hills: [],
            trees: [],
            fences: [],
            stones: [],
            mounds: [],
            crypts: [],
            lamps: [],
            gate: null,
            castle: null,
            grass: [],
            vines: []
        };

        // Stars thin out toward the horizon haze and avoid the moon's halo
        const starCount = Math.round(this.config.starCount * hwClamp(w / 1440, 0.5, 1.6));
        for (let i = 0; i < starCount; i++) {
            const y = Math.pow(rng(), 1.5) * horizon;
            const x = rng() * w;
            const near = Math.hypot(x - scene.moon.x, y - scene.moon.y) / (scene.moon.r * 4);
            if (near < 1 && rng() > near * 0.8) continue;
            scene.stars.push({
                x, y,
                r: 0.4 + Math.pow(rng(), 3) * 1.5,
                a: 0.25 + rng() * 0.7,
                twinkle: rng() * Math.PI * 2,
                rate: 0.6 + rng() * 2.4
            });
        }

        // Thin cloud bands that pass in front of the moon
        if (this.config.cloudBands) {
            for (let i = 0; i < 7; i++) {
                scene.clouds.push({
                    y: horizon * (0.08 + rng() * 0.7),
                    len: w * (0.25 + rng() * 0.6),
                    thick: 6 + rng() * 26,
                    x: rng() * w * 1.4 - w * 0.2,
                    speed: 2 + rng() * 7,
                    a: 0.05 + rng() * 0.16,
                    wobble: rng() * Math.PI * 2
                });
            }
        }

        // Two hill ridges built from summed low-frequency waves
        for (let band = 0; band < 2; band++) {
            const amp = horizon * (band === 0 ? 0.09 : 0.055);
            const base = horizon + this.usableHeight * (band === 0 ? 0.015 : 0.055);
            const waves = [];
            for (let k = 0; k < 4; k++) {
                waves.push({
                    f: (0.4 + k * 0.9 + rng() * 0.5) / w * Math.PI * 2,
                    p: rng() * Math.PI * 2,
                    a: amp / (k + 1.2)
                });
            }
            const pts = [];
            const step = Math.max(6, w / 160);
            for (let x = -step; x <= w + step; x += step) {
                let y = base;
                for (const wv of waves) y -= Math.sin(x * wv.f + wv.p) * wv.a;
                pts.push([x, y]);
            }
            scene.hills.push({ pts, band });
        }

        // Bare trees. Each is generated once as a segment list and then baked.
        const treeBudget = Math.round((3 + w / 420) * p.treeDensity);
        for (let i = 0; i < treeBudget; i++) {
            const bandIndex = rng() < 0.45 ? 1 : (rng() < 0.6 ? 2 : 3);
            const band = HW_BANDS[bandIndex];
            const height = this.usableHeight * (0.22 + rng() * 0.3) * band.scale * 1.5;
            scene.trees.push({
                x: rng() * w * 1.2 - w * 0.1,
                bandIndex,
                height,
                segs: this.generateTree(rng, height),
                sway: rng() * Math.PI * 2,
                swayRate: 0.25 + rng() * 0.35
            });
        }
        scene.trees.sort((a, b) => a.bandIndex - b.bandIndex);

        // Leaning picket fence runs
        for (let i = 0; i < p.fenceRuns; i++) {
            const bandIndex = i === 0 ? 2 : 3;
            const band = HW_BANDS[bandIndex];
            const pickets = [];
            const spacing = 15 * band.scale + 5;
            const startX = -w * 0.1 + rng() * w * 0.3;
            const runLen = w * (0.6 + rng() * 0.7);
            for (let x = startX; x < startX + runLen; x += spacing) {
                if (rng() < 0.07) continue;                 // a missing picket
                pickets.push({
                    x,
                    h: (34 + rng() * 10) * band.scale,
                    lean: (rng() - 0.5) * 0.22,
                    w: 4.5 * band.scale
                });
            }
            scene.fences.push({ bandIndex, pickets, y: this.groundY(bandIndex) });
        }

        // Headstones, sorted so the near ones draw last. The leans are wider
        // than a real churchyard's on purpose -- a row of stones all standing
        // true reads as a fence, and tipping them is most of the charm.
        for (let i = 0; i < p.stones; i++) {
            const bandIndex = rng() < 0.35 ? 2 : (rng() < 0.65 ? 3 : 4);
            const band = HW_BANDS[bandIndex];
            const stone = {
                x: rng() * w * 1.1 - w * 0.05,
                bandIndex,
                h: (30 + rng() * 34) * band.scale,
                wd: (20 + rng() * 16) * band.scale,
                type: Math.floor(rng() * 6),   // round|cross|obelisk|slab|urn|ledger
                lean: (rng() - 0.5) * 0.3,
                cracked: rng() < 0.4,
                epitaph: 1 + Math.floor(rng() * 3)
            };
            scene.stones.push(stone);
            if (rng() < p.mounds) {
                scene.mounds.push({
                    x: stone.x, bandIndex,
                    wd: stone.wd * (1.5 + rng() * 0.6),
                    h: stone.h * (0.14 + rng() * 0.1)
                });
            }
        }
        scene.stones.sort((a, b) => a.bandIndex - b.bandIndex);

        // Crypts: a squat domed mausoleum with an arched door
        for (let i = 0; i < p.crypts; i++) {
            const bandIndex = rng() < 0.6 ? 2 : 3;
            const band = HW_BANDS[bandIndex];
            scene.crypts.push({
                x: rng() * w * 0.9 + w * 0.05,
                bandIndex,
                wd: (54 + rng() * 26) * band.scale,
                h: (46 + rng() * 22) * band.scale,
                dome: rng() < 0.6,
                lean: (rng() - 0.5) * 0.06,
                lit: rng() < 0.5,
                phase: rng() * Math.PI * 2
            });
        }

        // A wrought-iron arch over the way in
        if (p.gate) {
            const bandIndex = 3;
            const band = HW_BANDS[bandIndex];
            scene.gate = {
                x: w * (0.1 + rng() * 0.75),
                bandIndex,
                wd: (78 + rng() * 34) * band.scale,
                h: (74 + rng() * 26) * band.scale,
                bars: 5 + Math.floor(rng() * 3),
                swing: rng() * Math.PI * 2
            };
        }

        // Lamp posts. These are light sources in their own right, so the patch
        // is not lit by pumpkins alone.
        for (let i = 0; i < p.lamps; i++) {
            const bandIndex = rng() < 0.5 ? 3 : 4;
            const band = HW_BANDS[bandIndex];
            scene.lamps.push({
                x: rng() * w,
                bandIndex,
                h: (84 + rng() * 40) * band.scale,
                lean: (rng() - 0.5) * 0.12,
                phase: rng() * Math.PI * 2,
                scale: band.scale
            });
        }

        if (p.castle > 0 && this.config.castle) {
            scene.castle = this.buildCastle(rng, p.castle * this.config.castleSize);
        }

        // Foreground dead grass, drawn live so it can sway
        const grassCount = this.config.grass ? Math.round(w * 0.22 * p.deadGrass) : 0;
        for (let i = 0; i < grassCount; i++) {
            const bandIndex = rng() < 0.4 ? 3 : 4;
            scene.grass.push({
                x: rng() * w * 1.2 - w * 0.1,
                bandIndex,
                h: (10 + Math.pow(rng(), 2) * 30) * HW_BANDS[bandIndex].scale,
                lean: (rng() - 0.5) * 0.9,
                phase: rng() * Math.PI * 2,
                rate: 0.7 + rng() * 0.9,
                thick: 0.7 + rng() * 1.1
            });
        }

        // Pumpkin vines for the patch preset
        if (p.vines) {
            for (let i = 0; i < 9; i++) {
                const bandIndex = rng() < 0.5 ? 3 : 4;
                scene.vines.push({
                    x: rng() * w,
                    bandIndex,
                    len: (50 + rng() * 120) * HW_BANDS[bandIndex].scale,
                    dir: rng() < 0.5 ? -1 : 1,
                    wiggle: rng() * Math.PI * 2,
                    leaves: 3 + Math.floor(rng() * 4)
                });
            }
        }

        this.scene = scene;
    }

    // Ground line for a depth band: bands further back sit nearer the horizon.
    groundY(bandIndex) {
        const band = HW_BANDS[bandIndex];
        const horizon = this.horizonY;
        return horizon + (this.usableHeight - horizon) * band.yFrac;
    }

    // Recursive bare branching. Depth and length falloff are tuned for the
    // clawed, leafless look rather than a full canopy.
    generateTree(rng, height) {
        const segs = [];
        const branch = (x, y, angle, len, width, depth) => {
            const x2 = x + Math.sin(angle) * len;
            const y2 = y - Math.cos(angle) * len;
            segs.push({ x1: x, y1: y, x2, y2, w: width, depth });
            if (depth <= 0 || len < 3.5) return;

            const forks = rng() < 0.22 ? 3 : 2;
            for (let i = 0; i < forks; i++) {
                const spread = (i - (forks - 1) / 2) * (0.5 + rng() * 0.45)
                    + (rng() - 0.5) * 0.3;
                // A dead branch now and then, cut short
                const stunt = rng() < 0.12 ? 0.4 : 1;
                branch(x2, y2, angle + spread,
                    len * (0.6 + rng() * 0.22) * stunt,
                    width * 0.66, depth - 1);
            }
        };
        branch(0, 0, (rng() - 0.5) * 0.3, height * 0.34, Math.max(1.4, height * 0.05), 5);
        return segs;
    }

    // -----------------------------------------------------------------------
    // Baked art
    //
    // Gradients are the expensive part of this scene, so everything that does
    // not change per frame -- light pools, fog puffs, candy, leaves -- is
    // traced once into an offscreen canvas and afterwards only blitted.
    // -----------------------------------------------------------------------

    bakeSprites() {
        const t = this.theme;

        // Radial light pool, baked in the theme's light colour. Drawn with
        // 'lighter' so overlapping lanterns pool correctly.
        const gs = 256;
        this.glowSprite = this.scratch(gs, gs);
        const gc = this.glowSprite.getContext('2d');
        const lightRgb = hwHexToRgb(t.light);
        const grad = gc.createRadialGradient(gs / 2, gs / 2, 0, gs / 2, gs / 2, gs / 2);
        // A plain linear falloff reads as a flat disc; the stacked stops give
        // a hot core with a long tail, which is what a flame in a shell does
        grad.addColorStop(0.00, hwRgba(lightRgb, 0.95));
        grad.addColorStop(0.08, hwRgba(lightRgb, 0.62));
        grad.addColorStop(0.22, hwRgba(lightRgb, 0.28));
        grad.addColorStop(0.45, hwRgba(lightRgb, 0.09));
        grad.addColorStop(0.72, hwRgba(lightRgb, 0.02));
        grad.addColorStop(1.00, hwRgba(lightRgb, 0));
        gc.fillStyle = grad;
        gc.fillRect(0, 0, gs, gs);

        // Light cone projected out of a carved face. Baked pointing down with
        // the apex at the top centre, so drawing it is a rotate plus a scale.
        const cw = 128;
        const ch = 192;
        this.coneSprite = this.scratch(cw, ch);
        const cc = this.coneSprite.getContext('2d');
        const cone = cc.createLinearGradient(0, 0, 0, ch);
        cone.addColorStop(0, hwRgba(lightRgb, 0.5));
        cone.addColorStop(0.35, hwRgba(lightRgb, 0.16));
        cone.addColorStop(1, hwRgba(lightRgb, 0));
        cc.fillStyle = cone;
        cc.beginPath();
        cc.moveTo(cw * 0.5, 0);
        cc.lineTo(cw, ch);
        cc.lineTo(0, ch);
        cc.closePath();
        cc.fill();
        // Soften the hard edges of the wedge
        cc.globalCompositeOperation = 'destination-in';
        const soft = cc.createLinearGradient(0, 0, cw, 0);
        soft.addColorStop(0, 'rgba(0,0,0,0)');
        soft.addColorStop(0.3, 'rgba(0,0,0,1)');
        soft.addColorStop(0.7, 'rgba(0,0,0,1)');
        soft.addColorStop(1, 'rgba(0,0,0,0)');
        cc.fillStyle = soft;
        cc.fillRect(0, 0, cw, ch);

        this.bakeFogSprite();
        this.bakeCandySprites();
        this.bakeLeafSprites();
    }

    // One soft irregular puff. Fog banks are many of these overlapped, which
    // is cheaper and softer than noise sampled per pixel.
    bakeFogSprite() {
        const s = 256;
        this.fogSprite = this.scratch(s, s);
        const c = this.fogSprite.getContext('2d');
        const rng = hwRng(0x10c0ffee);
        // Baked in the theme's fog colour. Tinting the bank afterwards needed
        // a full-screen pass per bank and stained ground that had no fog on it.
        const fogRgb = hwHexToRgb(this.theme.fog);

        for (let i = 0; i < 10; i++) {
            const r = s * (0.18 + rng() * 0.3);
            const x = s / 2 + (rng() - 0.5) * s * 0.42;
            const y = s / 2 + (rng() - 0.5) * s * 0.3;
            const g = c.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, hwRgba(fogRgb, 0.13));
            g.addColorStop(0.5, hwRgba(fogRgb, 0.06));
            g.addColorStop(1, hwRgba(fogRgb, 0));
            c.fillStyle = g;
            c.fillRect(0, 0, s, s);
        }

        // Fade the sprite's own edges so tiled puffs never show a seam
        c.globalCompositeOperation = 'destination-in';
        const mask = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
        mask.addColorStop(0, 'rgba(0,0,0,1)');
        mask.addColorStop(0.62, 'rgba(0,0,0,0.85)');
        mask.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = mask;
        c.fillRect(0, 0, s, s);
    }

    // Candy corn, baked at 4x and drawn scaled. The old version was three
    // flat polygons under a hard dark outline, which is what made it read as
    // clipart; this one is a rounded body with soft band blending and a gloss.
    bakeCandySprites() {
        const W = 72;
        const H = 112;
        this.candySprites = [];

        // Muted on purpose: these are lit by the moon, and a kernel painted
        // at full daylight saturation out-shouts the lanterns it falls past
        const palettes = [
            ['#cdc7bb', '#b4661a', '#c2a742'],
            ['#c8c2c9', '#b05430', '#bda044'],
            ['#c3c8cd', '#bb7430', '#c9b35c']
        ];

        for (const pal of palettes) {
            const c = this.scratch(W, H);
            const g = c.getContext('2d');

            // Kernel outline: narrow rounded tip, swelling to a rounded base
            const path = new Path2D();
            path.moveTo(W * 0.5, H * 0.04);
            path.bezierCurveTo(W * 0.62, H * 0.1, W * 0.72, H * 0.42, W * 0.9, H * 0.76);
            path.quadraticCurveTo(W * 0.96, H * 0.93, W * 0.74, H * 0.96);
            path.quadraticCurveTo(W * 0.5, H * 0.99, W * 0.26, H * 0.96);
            path.quadraticCurveTo(W * 0.04, H * 0.93, W * 0.1, H * 0.76);
            path.bezierCurveTo(W * 0.28, H * 0.42, W * 0.38, H * 0.1, W * 0.5, H * 0.04);
            path.closePath();

            g.save();
            g.clip(path);

            // Bands as a vertical gradient with short blend zones, so the
            // colour changes read as dyed sugar rather than stuck-on paper
            const band = g.createLinearGradient(0, 0, 0, H);
            band.addColorStop(0.00, pal[0]);
            band.addColorStop(0.30, pal[0]);
            band.addColorStop(0.36, pal[1]);
            band.addColorStop(0.68, pal[1]);
            band.addColorStop(0.74, pal[2]);
            band.addColorStop(1.00, pal[2]);
            g.fillStyle = band;
            g.fillRect(0, 0, W, H);

            // Form shading: dark along the right edge, light down the left
            const shade = g.createLinearGradient(0, 0, W, 0);
            shade.addColorStop(0, 'rgba(0,0,0,0.12)');
            shade.addColorStop(0.3, 'rgba(255,255,255,0.1)');
            shade.addColorStop(0.72, 'rgba(0,0,0,0.05)');
            shade.addColorStop(1, 'rgba(0,0,0,0.3)');
            g.fillStyle = shade;
            g.fillRect(0, 0, W, H);

            // Gloss streak
            g.globalCompositeOperation = 'lighter';
            const gloss = g.createLinearGradient(W * 0.2, 0, W * 0.45, H);
            gloss.addColorStop(0, 'rgba(255,255,255,0)');
            gloss.addColorStop(0.45, 'rgba(255,255,255,0.3)');
            gloss.addColorStop(0.6, 'rgba(255,255,255,0.05)');
            gloss.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = gloss;
            g.fillRect(W * 0.14, 0, W * 0.3, H);
            g.restore();

            // Rim rather than an outline: a thin bright edge on the lit side
            g.save();
            g.globalCompositeOperation = 'source-atop';
            g.strokeStyle = 'rgba(255,255,255,0.35)';
            g.lineWidth = 2;
            g.stroke(path);
            g.restore();

            this.candySprites.push(c);
        }
    }

    bakeLeafSprites() {
        const S = 48;
        this.leafSprites = [];
        const colors = ['#8a3a12', '#a8521a', '#6b2d10', '#c2701f', '#54351a'];

        for (let ci = 0; ci < colors.length; ci++) {
            const c = this.scratch(S, S);
            const g = c.getContext('2d');
            const rng = hwRng(0xbead + ci * 977);
            const base = hwHexToRgb(colors[ci]);

            // A simple lobed blade; at the size these draw, more detail than
            // this is invisible
            const lobes = 3 + (ci % 3);
            g.beginPath();
            for (let i = 0; i <= 40; i++) {
                const a = (i / 40) * Math.PI * 2;
                const lobe = 1 + Math.cos(a * lobes) * 0.22;
                const r = S * 0.4 * lobe * (0.72 + 0.28 * Math.abs(Math.sin(a)));
                const x = S / 2 + Math.cos(a) * r * 0.78;
                const y = S / 2 + Math.sin(a) * r;
                if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
            }
            g.closePath();

            const grad = g.createLinearGradient(0, 0, S, S);
            grad.addColorStop(0, hwRgba(hwMixRgb(base, [255, 220, 150], 0.3), 1));
            grad.addColorStop(1, hwRgba(hwMixRgb(base, [0, 0, 0], 0.4), 1));
            g.fillStyle = grad;
            g.fill();

            // Veins
            g.strokeStyle = hwRgba(hwMixRgb(base, [0, 0, 0], 0.5), 0.5);
            g.lineWidth = 0.8;
            g.beginPath();
            g.moveTo(S / 2, S * 0.1);
            g.lineTo(S / 2, S * 0.9);
            for (let v = 0; v < 4; v++) {
                const y = S * (0.26 + v * 0.17);
                const spread = S * (0.2 - v * 0.03);
                g.moveTo(S / 2, y);
                g.lineTo(S / 2 - spread, y + S * 0.08);
                g.moveTo(S / 2, y);
                g.lineTo(S / 2 + spread, y + S * 0.08);
            }
            g.stroke();

            // A nibbled edge so they are not all identical ovals
            g.globalCompositeOperation = 'destination-out';
            for (let n = 0; n < 3; n++) {
                const a = rng() * Math.PI * 2;
                g.beginPath();
                g.arc(S / 2 + Math.cos(a) * S * 0.38, S / 2 + Math.sin(a) * S * 0.4,
                    S * (0.05 + rng() * 0.06), 0, Math.PI * 2);
                g.fill();
            }

            this.leafSprites.push(c);
        }
    }

    // Sky, stars, moon, hill ridges, the far trees and the ground plane. This
    // is one full-screen blit per frame instead of several hundred paths.
    bakeStatic() {
        const t = this.theme;
        const w = this.w;
        const h = this.h;
        const horizon = this.horizonY;
        const scene = this.scene;

        this.staticCanvas = this.scratch(w + HW_MARGIN * 2, h);
        const c = this.staticCanvas.getContext('2d');
        // Scene coordinates stay viewport-relative; the margin is absorbed here
        c.translate(HW_MARGIN, 0);

        // Sky. Three stops, because a two-stop gradient over this much height
        // bands visibly and gives the horizon nowhere to brighten.
        const sky = c.createLinearGradient(0, 0, 0, horizon);
        sky.addColorStop(0, t.skyTop);
        sky.addColorStop(0.55, t.skyMid);
        sky.addColorStop(1, t.skyHorizon);
        c.fillStyle = sky;
        c.fillRect(0, 0, w, horizon + 1);

        // Stars sit under the moon glow, so they are drawn first
        for (const s of scene.stars) {
            c.fillStyle = hwRgba(hwHexToRgb(t.star), s.a * 0.8);
            c.beginPath();
            c.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            c.fill();
        }

        if (this.config.moon) this.drawMoon(c, scene.moon);

        // Ground
        const ground = c.createLinearGradient(0, horizon, 0, h);
        ground.addColorStop(0, t.groundFar);
        ground.addColorStop(0.3, t.ground);
        ground.addColorStop(1, hwRgba(hwMixRgb(hwHexToRgb(t.skyTop), [0, 0, 0], 0.45), 1));
        c.fillStyle = ground;
        c.fillRect(0, horizon, w, h - horizon);

        // Hill ridges, far band first
        for (let i = scene.hills.length - 1; i >= 0; i--) {
            const hill = scene.hills[i];
            const tint = i === 0 ? 0.55 : 0.3;
            c.fillStyle = hwRgba(hwMixRgb(hwHexToRgb(t.hill), hwHexToRgb(t.skyHorizon), tint), 1);
            c.beginPath();
            c.moveTo(hill.pts[0][0], hill.pts[0][1]);
            for (const pt of hill.pts) c.lineTo(pt[0], pt[1]);
            c.lineTo(w + 20, h);
            c.lineTo(-20, h);
            c.closePath();
            c.fill();
        }

        // The two furthest tree bands are static; the near ones sway, so they
        // are drawn live
        for (const tree of scene.trees) {
            // Band 1 moved into the live pass when the castle landed in it
            if (tree.bandIndex > 0) continue;
            c.save();
            c.translate(tree.x, this.groundY(tree.bandIndex));
            this.strokeTree(c, tree, hwMixRgb(hwHexToRgb(t.tree), hwHexToRgb(t.skyHorizon),
                HW_BANDS[tree.bandIndex].tint), 0);
            c.restore();
        }

        // Horizon haze: ties the silhouettes into the sky instead of leaving
        // hard cutouts floating on it
        const haze = c.createLinearGradient(0, horizon - this.usableHeight * 0.12,
            0, horizon + this.usableHeight * 0.06);
        haze.addColorStop(0, hwRgba(hwHexToRgb(t.skyHorizon), 0));
        haze.addColorStop(0.6, hwRgba(hwHexToRgb(t.skyHorizon), 0.42));
        haze.addColorStop(1, hwRgba(hwHexToRgb(t.skyHorizon), 0));
        c.fillStyle = haze;
        c.fillRect(0, horizon - this.usableHeight * 0.12, w, this.usableHeight * 0.18);

        this.bakeSkyline();
    }

    // A silhouette-only copy of the skyline. Lightning blits this in near
    // white behind the live scene, so the ridges flash as backlit edges
    // instead of the whole frame just getting brighter.
    bakeSkyline() {
        const w = this.w;
        const h = this.h;
        this.skylineCanvas = this.scratch(w + HW_MARGIN * 2, h);
        const c = this.skylineCanvas.getContext('2d');
        c.translate(HW_MARGIN, 0);
        const scene = this.scene;

        c.fillStyle = '#ffffff';
        for (let i = scene.hills.length - 1; i >= 0; i--) {
            const hill = scene.hills[i];
            c.beginPath();
            c.moveTo(hill.pts[0][0], hill.pts[0][1]);
            for (const pt of hill.pts) c.lineTo(pt[0], pt[1]);
            c.lineTo(w + 20, h);
            c.lineTo(-20, h);
            c.closePath();
            c.fill();
        }
        for (const tree of scene.trees) {
            if (tree.bandIndex > 2) continue;
            c.save();
            c.translate(tree.x, this.groundY(tree.bandIndex));
            this.strokeTree(c, tree, [255, 255, 255], 0);
            c.restore();
        }

        // Keep only a rim: the fill minus a copy of itself shifted down
        // leaves the top edge, which is the part a backlight would catch
        const copy = this.scratch(this.skylineCanvas.width, this.skylineCanvas.height);
        copy.getContext('2d').drawImage(this.skylineCanvas, 0, 0);
        c.globalCompositeOperation = 'destination-out';
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.drawImage(copy, 0, 9);
    }

    drawMoon(c, moon) {
        const t = this.theme;
        const moonRgb = hwHexToRgb(t.moon);
        const haloRgb = hwHexToRgb(t.moonHalo);

        // Halo, well outside the disc
        const halo = c.createRadialGradient(moon.x, moon.y, moon.r * 0.6,
            moon.x, moon.y, moon.r * 7);
        halo.addColorStop(0, hwRgba(haloRgb, 0.3));
        halo.addColorStop(0.18, hwRgba(haloRgb, 0.12));
        halo.addColorStop(0.5, hwRgba(haloRgb, 0.035));
        halo.addColorStop(1, hwRgba(haloRgb, 0));
        c.fillStyle = halo;
        c.beginPath();
        c.arc(moon.x, moon.y, moon.r * 7, 0, Math.PI * 2);
        c.fill();

        // The disc is assembled on its own canvas and blitted. Cutting the
        // phase with destination-out directly onto the sky would punch a
        // transparent hole through the sky behind it as well.
        const r = moon.r;
        const pad = 2;
        const size = Math.ceil(r * 2 + pad * 2);
        const disc = this.scratch(size, size);
        const d = disc.getContext('2d');
        const cx = size / 2;

        d.save();
        d.beginPath();
        d.arc(cx, cx, r, 0, Math.PI * 2);
        d.clip();

        const face = d.createRadialGradient(
            cx - r * 0.25, cx - r * 0.3, r * 0.1, cx, cx, r * 1.1);
        face.addColorStop(0, hwRgba(hwMixRgb(moonRgb, [255, 255, 255], 0.15), 1));
        face.addColorStop(0.7, hwRgba(hwMixRgb(moonRgb, haloRgb, 0.12), 1));
        face.addColorStop(1, hwRgba(hwMixRgb(moonRgb, haloRgb, 0.45), 1));
        d.fillStyle = face;
        d.fillRect(0, 0, size, size);

        // Maria. Soft dark patches at seeded positions, scaled to the disc.
        const rng = hwRng(0x5eed);
        for (let i = 0; i < 9; i++) {
            const a = rng() * Math.PI * 2;
            const dist = Math.pow(rng(), 0.6) * r * 0.8;
            const mr = r * (0.08 + rng() * 0.2);
            const mx = cx + Math.cos(a) * dist;
            const my = cx + Math.sin(a) * dist;
            const g = d.createRadialGradient(mx, my, 0, mx, my, mr);
            g.addColorStop(0, hwRgba(hwMixRgb(moonRgb, haloRgb, 0.55), 0.5));
            g.addColorStop(1, hwRgba(moonRgb, 0));
            d.fillStyle = g;
            d.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
        }
        d.restore();

        // Phase: a shadow disc swept across the face, leaving a trace of
        // earthshine on the dark limb
        const phase = hwClamp(this.config.moonPhase, 0, 1);
        if (phase < 0.995) {
            const shift = r * 2 * phase;
            d.globalCompositeOperation = 'destination-out';
            d.beginPath();
            d.arc(cx - shift, cx, r * 1.02, 0, Math.PI * 2);
            d.fill();

            d.globalCompositeOperation = 'destination-over';
            d.fillStyle = hwRgba(haloRgb, 0.09);
            d.beginPath();
            d.arc(cx, cx, r, 0, Math.PI * 2);
            d.fill();
        }

        c.drawImage(disc, moon.x - cx, moon.y - cx);
    }

    strokeTree(c, tree, rgb, swayAmount) {
        c.strokeStyle = hwRgba(rgb, 1);
        c.lineCap = 'round';
        for (const s of tree.segs) {
            // Sway grows with height and with how far out the branch sits
            const bend = swayAmount * (1 - s.depth / 6);
            c.lineWidth = Math.max(0.6, s.w);
            c.beginPath();
            c.moveTo(s.x1 + bend * (-s.y1 / tree.height) * 0.5, s.y1);
            c.lineTo(s.x2 + bend * (-s.y2 / tree.height), s.y2);
            c.stroke();
        }
    }

    // Vignette and grain, both sized in device pixels so they are baked
    // whenever the render scale changes.
    bakeOverlays() {
        const dw = Math.max(1, this.canvas.width);
        const dh = Math.max(1, this.canvas.height);

        if (this.config.vignette) {
            this.vignetteCanvas = this.scratch(this.w, this.h);
            const c = this.vignetteCanvas.getContext('2d');
            const g = c.createRadialGradient(
                this.w * 0.5, this.h * 0.52, 0,
                this.w * 0.5, this.h * 0.52, Math.hypot(this.w, this.h) * 0.62);
            g.addColorStop(0, 'rgba(0,0,0,0)');
            g.addColorStop(0.55, 'rgba(0,0,0,0.06)');
            g.addColorStop(0.8, 'rgba(0,0,0,0.3)');
            g.addColorStop(1, 'rgba(0,0,0,0.62)');
            c.fillStyle = g;
            c.fillRect(0, 0, this.w, this.h);
        } else {
            this.vignetteCanvas = null;
        }

        if (this.config.grain > 0 && !this.grainCanvas) {
            // One 128px tile, scrolled by a random offset each frame. Baking
            // per-frame noise at full resolution is far too expensive.
            const s = 128;
            this.grainCanvas = this.scratch(s, s);
            const c = this.grainCanvas.getContext('2d');
            const img = c.createImageData(s, s);
            for (let i = 0; i < img.data.length; i += 4) {
                const v = 110 + Math.random() * 70;
                img.data[i] = v;
                img.data[i + 1] = v;
                img.data[i + 2] = v;
                img.data[i + 3] = 255;
            }
            c.putImageData(img, 0, 0);
        }

        if (this.config.bloom) {
            // Quarter resolution is plenty: the bloom is blurred anyway, and
            // the cost of the passes drops sixteenfold
            const bw = Math.max(1, Math.round(dw / 4));
            const bh = Math.max(1, Math.round(dh / 4));
            this.bloomA = this.scratch(bw, bh);
            this.bloomT = this.scratch(bw, bh);
            this.bloomB = this.scratch(Math.max(1, bw >> 1), Math.max(1, bh >> 1));
        } else {
            this.bloomA = null;
            this.bloomT = null;
            this.bloomB = null;
        }
    }

    // -----------------------------------------------------------------------
    // Entities
    // -----------------------------------------------------------------------

    spawnEntities() {
        const rng = hwRng(this.activeSeed ^ 0x51ced);

        this.spawnPumpkins(rng);
        this.rebuildWebs();

        this.candy = [];
        for (let i = 0; i < this.config.candyCount; i++) {
            this.candy.push(this.createCandy(true));
        }

        this.leaves = [];
        if (this.config.fallingLeaves) {
            for (let i = 0; i < this.config.leafCount; i++) {
                this.leaves.push(this.createLeaf(true));
            }
        }

        this.bats = [];
        if (this.config.bats) {
            for (let i = 0; i < this.config.batCount; i++) {
                this.bats.push({
                    x: Math.random() * this.w,
                    y: this.horizonY * (0.1 + Math.random() * 0.6),
                    vx: (Math.random() - 0.5) * 70,
                    vy: (Math.random() - 0.5) * 30,
                    flap: Math.random() * Math.PI * 2,
                    flapRate: 9 + Math.random() * 7,
                    size: 5 + Math.random() * 6,
                    band: 0.4 + Math.random() * 0.6,
                    wander: Math.random() * Math.PI * 2,
                    dive: 0,
                    diveIn: 4 + Math.random() * 14
                });
            }
        }

        this.ghosts = [];
        if (this.config.ghosts) {
            for (let i = 0; i < this.config.ghostCount; i++) {
                this.ghosts.push(this.createGhost(true));
            }
        }

        this.spawnZombies(rng);

        this.fogBlobs = [];
        if (this.config.fog) this.spawnFog();

        this.lightning.next = 6 + Math.random() * 20;
    }

    // Pumpkins sit on the ground across the three near bands. x is kept as a
    // fraction so a resize re-spreads the patch instead of bunching it left.
    spawnPumpkins(rng) {
        const p = this.preset;
        const count = Math.round(this.config.pumpkinCount * hwLerp(0.6, 1.3, p.pumpkinScatter));
        this.pumpkins = [];

        for (let i = 0; i < count; i++) {
            const r = rng();
            const bandIndex = r < 0.3 ? 2 : (r < 0.72 ? 3 : 4);
            this.pumpkins.push({
                fx: rng() * 1.1 - 0.05,
                bandIndex,
                size: (0.7 + rng() * 0.7),
                lit: rng() < this.config.litFraction,
                relight: 1,
                flickerPhase: rng() * Math.PI * 2,
                ribs: 4 + Math.floor(rng() * 3),
                squat: 0.72 + rng() * 0.2,        // height as a share of width
                tilt: (rng() - 0.5) * 0.3,
                stemLean: (rng() - 0.5) * 0.9,
                stemLen: 0.22 + rng() * 0.16,
                face: this.generateFace(rng),
                hueShift: (rng() - 0.5) * 0.25,
                x: 0, y: 0, scale: 1
            });
        }

        // Near bands last so they occlude the far ones
        this.pumpkins.sort((a, b) => a.bandIndex - b.bandIndex);
        this.placeGroundEntities();
    }

    placeGroundEntities() {
        for (const p of this.pumpkins) {
            p.x = p.fx * this.w;
            p.y = this.groundY(p.bandIndex);
            p.scale = 30 * p.size * this.config.pumpkinSize * HW_BANDS[p.bandIndex].scale;
        }
        if (this.scene) {
            for (const f of this.scene.fences) f.y = this.groundY(f.bandIndex);
        }
    }

    // Faces are assembled from parts instead of picked from three hard-coded
    // carvings, so a patch of fourteen lanterns has fourteen expressions.
    generateFace(rng) {
        return {
            eye: Math.floor(rng() * 4),        // triangle | slant | round | square
            eyeTilt: (rng() - 0.5) * 0.9,
            eyeSize: 0.8 + rng() * 0.6,
            eyeGap: 0.42 + rng() * 0.2,
            brow: rng() < 0.45,
            nose: Math.floor(rng() * 3),       // none | triangle | notch
            mouth: Math.floor(rng() * 4),      // grin | jagged | gape | sliver
            mouthW: 0.55 + rng() * 0.4,
            mouthH: 0.2 + rng() * 0.22,
            teeth: 2 + Math.floor(rng() * 4),
            asym: (rng() - 0.5) * 0.3,         // the carver's hand was unsteady
            drop: (rng() - 0.5) * 0.08
        };
    }

    createCandy(scatter) {
        return {
            x: Math.random() * this.w,
            y: scatter ? Math.random() * this.h : -30 - Math.random() * 120,
            vy: this.config.candyFallSpeed * (24 + Math.random() * 22),
            vx: (Math.random() - 0.5) * 14,
            spin: Math.random() * Math.PI * 2,
            spinRate: (Math.random() - 0.5) * 3.2,
            // Flip is a separate axis from spin: scaling x by its cosine makes
            // the kernel tumble through depth instead of pinwheeling flat
            flip: Math.random() * Math.PI * 2,
            flipRate: 1.2 + Math.random() * 2.6,
            size: this.config.candySize * (0.5 + Math.random() * 0.7),
            sprite: Math.floor(Math.random() * 3),
            sway: Math.random() * Math.PI * 2,
            swayRate: 0.8 + Math.random() * 1.2,
            depth: 0.5 + Math.random() * 0.8
        };
    }

    createLeaf(scatter) {
        return {
            x: Math.random() * this.w,
            y: scatter ? Math.random() * this.h : -40,
            vy: 18 + Math.random() * 30,
            vx: (Math.random() - 0.5) * 20,
            spin: Math.random() * Math.PI * 2,
            spinRate: (Math.random() - 0.5) * 2.4,
            flip: Math.random() * Math.PI * 2,
            flipRate: 1.5 + Math.random() * 2.5,
            size: 0.5 + Math.random() * 0.8,
            sprite: Math.floor(Math.random() * 5),
            // Once a leaf reaches the ground it skitters along it for a while
            // before fading, which keeps the lower third of the frame alive
            grounded: false,
            groundY: 0,
            skitter: 0,
            life: 1,
            depth: 0.6 + Math.random() * 0.6
        };
    }

    // Proper little sheet ghosts rather than formless blobs: a rounded body, a
    // hem that ripples, two eyes that blink, and a shimmer band that travels
    // across them so they read as translucent rather than merely faint.
    createGhost(scatter) {
        const horizon = this.horizonY;
        const dir = Math.random() < 0.5 ? -1 : 1;
        const size = 20 + Math.random() * 18;
        return {
            x: scatter ? Math.random() * this.w : (dir > 0 ? -70 : this.w + 70),
            y: horizon * (0.52 + Math.random() * 0.42)
                + (this.usableHeight - horizon) * Math.random() * 0.4,
            dir,
            vx: dir * (12 + Math.random() * 20),
            size,
            life: scatter ? Math.random() * 6 : 0,
            maxLife: 20 + Math.random() * 20,
            alpha: 0,
            bob: Math.random() * Math.PI * 2,
            bobRate: 0.7 + Math.random() * 0.7,
            hem: Math.random() * Math.PI * 2,
            hemRate: 1.6 + Math.random() * 1.4,
            lobes: 3 + Math.floor(Math.random() * 2),
            shimmer: Math.random(),
            shimmerRate: 0.22 + Math.random() * 0.2,
            // Blinking, and the occasional startled "boo" stretch
            blink: 0,
            blinkIn: 1.5 + Math.random() * 4,
            startle: 0,
            trail: []
        };
    }

    createGhostInward() {
        const g = this.createGhost(false);
        // An off-screen wisp given a random heading half the time drifts
        // further off-screen and is never seen
        g.vx = Math.abs(g.vx) * (g.x < 0 ? 1 : -1);
        g.dir = g.vx > 0 ? 1 : -1;
        return g;
    }
    spawnFog() {
        this.fogBlobs = [];
        const horizon = this.horizonY;
        const bottom = this.usableHeight;
        // Three banks at different depths. The far one is thin and slow, the
        // near one thick and quick, which is what sells the depth.
        const banks = [
            { y: horizon + (bottom - horizon) * 0.06, h: (bottom - horizon) * 0.2, speed: 4, a: 0.5, scale: 0.6 },
            { y: horizon + (bottom - horizon) * 0.34, h: (bottom - horizon) * 0.3, speed: 9, a: 0.75, scale: 1.0 },
            { y: horizon + (bottom - horizon) * 0.74, h: (bottom - horizon) * 0.4, speed: 17, a: 1.0, scale: 1.7 }
        ];

        for (let b = 0; b < banks.length; b++) {
            const bank = banks[b];
            const count = Math.max(3, Math.round((this.w / 320) * (1 + b * 0.5)));
            for (let i = 0; i < count; i++) {
                this.fogBlobs.push({
                    bank: b,
                    x: Math.random() * (this.w + 500) - 250,
                    y: bank.y + (Math.random() - 0.5) * bank.h,
                    r: (90 + Math.random() * 190) * bank.scale,
                    speed: bank.speed * (0.6 + Math.random() * 0.8),
                    a: bank.a * (0.4 + Math.random() * 0.6),
                    squash: 0.28 + Math.random() * 0.22,
                    phase: Math.random() * Math.PI * 2
                });
            }
        }
        // Far banks first
        this.fogBlobs.sort((a, b) => a.bank - b.bank);
    }

    rebuildWebs() {
        this.webs = [];
        if (!this.config.webs || this.config.webCount <= 0) return;
        const rng = hwRng(((this.activeSeed || 0) ^ 0xbeef) >>> 0);

        // Corners first -- a web wants two walls to span -- then anchors up in
        // the tree branches.
        const anchors = [
            { x: 0, y: 0, a: Math.PI * 0.25 },
            { x: this.w, y: 0, a: Math.PI * 0.75 },
            { x: 0, y: this.usableHeight, a: -Math.PI * 0.25 },
            { x: this.w, y: this.usableHeight, a: -Math.PI * 0.75 }
        ];

        for (let i = 0; i < this.config.webCount; i++) {
            let x, y, angle, span;
            if (i < 4) {
                const a = anchors[i];
                x = a.x; y = a.y; angle = a.a;
                span = Math.min(this.w, this.h) * (0.16 + rng() * 0.14);
            } else {
                // Hang the extras from a branch fork in a near tree
                const trees = this.scene.trees.filter(t => t.bandIndex >= 2);
                if (trees.length) {
                    const tree = trees[Math.floor(rng() * trees.length)];
                    const seg = tree.segs[Math.floor(rng() * tree.segs.length)];
                    x = tree.x + seg.x2;
                    y = this.groundY(tree.bandIndex) + seg.y2;
                } else {
                    x = rng() * this.w;
                    y = rng() * this.usableHeight * 0.5;
                }
                angle = rng() * Math.PI * 2;
                span = Math.min(this.w, this.h) * (0.08 + rng() * 0.1);
            }

            const radials = 9 + Math.floor(rng() * 5);
            const web = {
                x, y, angle, span,
                radials,
                rings: 4 + Math.floor(rng() * 4),
                // Each radial gets its own length, so the web is not a circle
                lengths: [],
                opacity: this.config.webOpacity * (0.6 + rng() * 0.5),
                wobble: rng() * Math.PI * 2,
                wobbleRate: 0.4 + rng() * 0.5,
                corner: i < 4,
                dew: [],
                spider: null,
                torn: rng() < 0.3 ? Math.floor(rng() * radials) : -1
            };
            for (let r = 0; r < radials; r++) {
                web.lengths.push(span * (0.78 + rng() * 0.32));
            }

            if (this.config.dew) {
                const dewCount = 5 + Math.floor(rng() * 10);
                for (let d = 0; d < dewCount; d++) {
                    web.dew.push({
                        // A corner web spans a quarter turn, so its last
                        // radial has no neighbour to string a ring to
                        radial: Math.floor(rng() * (i < 4 ? radials - 1 : radials)),
                        ring: 1 + Math.floor(rng() * web.rings),
                        t: rng(),                   // position along the ring arc
                        r: 0.9 + rng() * 1.6,
                        twinkle: rng() * Math.PI * 2
                    });
                }
            }

            if (this.config.spiders && rng() < 0.45) {
                web.spider = {
                    state: 'idle',                  // idle | drop | hang | climb
                    t: 2 + rng() * 14,
                    drop: 0,
                    maxDrop: span * (0.8 + rng() * 1.6),
                    size: 3 + rng() * 2.5,
                    legPhase: rng() * Math.PI * 2,
                    homeAngle: rng() * Math.PI * 2,
                    homeR: span * rng() * 0.4
                };
            }

            this.webs.push(web);
        }

        this.webCanvas = null;
    }

    // -----------------------------------------------------------------------
    // Simulation
    // -----------------------------------------------------------------------

    animate() {
        if (!this.isRunning) return;

        const now = performance.now();
        const frameMs = now - this.lastTime;
        // A backgrounded tab hands back a multi-second gap on return; clamp it
        // so nothing teleports across the frame
        const dt = Math.min(0.05, Math.max(0.001, frameMs / 1000));
        this.lastTime = now;
        this.time += dt;
        this.tuneQuality(frameMs);

        this.update(dt);
        this.draw();

        this.animationId = requestAnimationFrame(() => this.animate());
    }

    update(dt) {
        const t = this.time;

        // Wind wanders on its own and decays back to that baseline after a
        // drag, so a gust always settles
        const baseline = Math.sin(t * 0.13) * 14 + Math.sin(t * 0.41) * 6;
        this.windTarget = hwLerp(this.windTarget, baseline, 1 - Math.pow(0.2, dt));
        this.wind = hwLerp(this.wind, this.windTarget, 1 - Math.pow(0.05, dt));
        const wind = this.wind * this.config.wind;

        // Camera pan. The pointer nudges it and it drifts on its own, which
        // gives the silhouette bands something to parallax against.
        const drift = Math.sin(t * 0.07) * 18 + Math.sin(t * 0.021) * 26;
        if (this.pointer.inside && this.config.interactive) {
            this.pan.tx = (this.pointer.x / this.w - 0.5) * -46 + drift;
            this.pan.ty = (this.pointer.y / this.h - 0.5) * -14;
        } else {
            this.pan.tx = drift;
            this.pan.ty = 0;
        }
        this.pan.x = hwLerp(this.pan.x, this.pan.tx, 1 - Math.pow(0.08, dt));
        this.pan.y = hwLerp(this.pan.y, this.pan.ty, 1 - Math.pow(0.08, dt));

        this.updateGusts(dt);
        this.updatePumpkins(dt);
        this.updateCandy(dt, wind);
        this.updateLeaves(dt, wind);
        this.updateBats(dt, wind);
        this.updateGhosts(dt, wind);
        this.updateZombies(dt, wind);
        this.updateWebs(dt);
        this.updateFog(dt, wind);
        this.updateLightning(dt);

        // Clouds drift across the moon
        if (this.scene && this.config.cloudBands) {
            for (const cl of this.scene.clouds) {
                cl.x += cl.speed * dt + wind * dt * 0.3;
                if (cl.x - cl.len > this.w + 100) cl.x = -cl.len - 100;
            }
        }
    }

    updateGusts(dt) {
        for (let i = this.gusts.length - 1; i >= 0; i--) {
            const g = this.gusts[i];
            g.t += dt;
            g.r += g.speed * dt;
            if (g.t > g.life) this.gusts.splice(i, 1);
        }
    }

    updatePumpkins(dt) {
        for (const p of this.pumpkins) {
            // Relight ramps the flame back up after a click, so toggling one
            // on looks like a wick catching rather than a light switch
            if (p.lit && p.relight < 1) p.relight = Math.min(1, p.relight + dt * 1.6);
            if (!p.lit && p.relight > 0) p.relight = Math.max(0, p.relight - dt * 3.2);

            const flick = this.config.flicker > 0
                ? hwFlicker(this.time * this.config.flicker, p.flickerPhase) * 0.22
                : 0;

            // A slow pulse travelling across the patch by x position, so the
            // lanterns look like they are breathing together
            const breath = this.config.breathing
                ? Math.sin(this.time * 0.55 - p.x * 0.0035) * 0.1
                : 0;

            p.glow = hwClamp((0.78 + flick + breath) * p.relight, 0, 1.4);
        }

        // Lamp posts burn steadier than a candle in a gourd, but they are
        // light sources all the same and feed the same additive pass
        if (this.scene) {
            for (const lamp of this.scene.lamps) {
                const flick = this.config.flicker > 0
                    ? hwFlicker(this.time * this.config.flicker * 0.5, lamp.phase) * 0.1
                    : 0;
                lamp.glow = hwClamp(0.85 + flick, 0, 1.4);
            }
        }
    }

    updateCandy(dt, wind) {
        for (const c of this.candy) {
            c.sway += c.swayRate * dt;
            c.spin += c.spinRate * dt;
            c.flip += c.flipRate * dt;

            let push = wind * c.depth * 0.5 + Math.sin(c.sway) * 9;
            for (const g of this.gusts) {
                const d = Math.hypot(c.x - g.x, c.y - g.y);
                if (d < g.r && d > 1) {
                    const f = (1 - d / g.r) * g.strength * (1 - g.t / g.life);
                    push += ((c.x - g.x) / d) * f * 180;
                    c.y += ((c.y - g.y) / d) * f * 90 * dt;
                }
            }

            c.x += (c.vx + push) * dt;
            c.y += c.vy * c.depth * dt;

            if (c.y > this.h + 40 || c.x < -60 || c.x > this.w + 60) {
                Object.assign(c, this.createCandy(false));
            }
        }
    }

    updateLeaves(dt, wind) {
        const ground = this.usableHeight;
        for (const l of this.leaves) {
            if (!l.grounded) {
                l.spin += l.spinRate * dt;
                l.flip += l.flipRate * dt;
                // Flutter: a leaf falls on a slow horizontal oscillation, and
                // the sideways drift peaks when it is edge-on
                l.x += (l.vx + wind * l.depth + Math.sin(l.flip) * 26) * dt;
                l.y += l.vy * dt;

                if (l.y >= ground - 4) {
                    l.grounded = true;
                    l.y = ground - 2 - Math.random() * 6;
                    l.groundY = l.y;
                    l.spinRate *= 0.2;
                }
            } else {
                // Skitter: the leaf is dragged along the ground by the wind,
                // hopping when a gust catches it
                l.skitter = hwLerp(l.skitter, wind * 1.4, 1 - Math.pow(0.1, dt));
                for (const g of this.gusts) {
                    const d = Math.hypot(l.x - g.x, l.y - g.y);
                    if (d < g.r && d > 1) {
                        const f = (1 - d / g.r) * g.strength * (1 - g.t / g.life);
                        l.skitter += ((l.x - g.x) / d) * f * 420;
                        l.y -= f * 26;
                    }
                }
                l.x += l.skitter * dt;
                l.y = hwLerp(l.y, l.groundY, 1 - Math.pow(0.02, dt));
                l.spin += l.skitter * dt * 0.02;
                l.life -= dt * 0.045;
            }

            if (l.life <= 0 || l.x < -80 || l.x > this.w + 80 || l.y > this.h + 40) {
                Object.assign(l, this.createLeaf(false));
            }
        }
    }

    // Loose boids: cohesion and separation against near neighbours, a
    // preferred altitude band, and avoidance of the cursor. At these counts
    // the naive O(n^2) neighbour pass is cheaper than any index.
    updateBats(dt, wind) {
        const bats = this.bats;
        if (!bats.length) return;
        const horizon = this.horizonY;

        for (let i = 0; i < bats.length; i++) {
            const b = bats[i];
            let cx = 0, cy = 0, sx = 0, sy = 0, ax = 0, ay = 0, n = 0;

            for (let j = 0; j < bats.length; j++) {
                if (i === j) continue;
                const o = bats[j];
                const dx = o.x - b.x;
                const dy = o.y - b.y;
                const d2 = dx * dx + dy * dy;
                if (d2 > 26000) continue;
                cx += o.x; cy += o.y;
                ax += o.vx; ay += o.vy;
                n++;
                if (d2 < 1400 && d2 > 0.01) {
                    const d = Math.sqrt(d2);
                    sx -= dx / d * (1 - d / 37);
                    sy -= dy / d * (1 - d / 37);
                }
            }

            if (n) {
                b.vx += ((cx / n - b.x) * 0.35 + (ax / n - b.vx) * 0.5) * dt;
                b.vy += ((cy / n - b.y) * 0.35 + (ay / n - b.vy) * 0.5) * dt;
                b.vx += sx * 160 * dt;
                b.vy += sy * 160 * dt;
            }

            // Wander, so a settled flock does not fly in a straight line
            b.wander += (Math.random() - 0.5) * 3 * dt;
            b.vx += Math.cos(b.wander) * 34 * dt;
            b.vy += Math.sin(b.wander) * 26 * dt;

            // Preferred altitude, plus an occasional dive toward the ground
            b.diveIn -= dt;
            if (b.diveIn <= 0) {
                b.dive = 1.1;
                b.diveIn = 6 + Math.random() * 18;
            }
            b.dive = Math.max(0, b.dive - dt * 0.55);
            const targetY = hwLerp(horizon * 0.1, horizon * 0.82, b.band)
                + b.dive * (this.usableHeight - horizon) * 0.55;
            b.vy += (targetY - b.y) * 1.1 * dt;

            // The cursor scatters them
            if (this.config.interactive && this.pointer.inside) {
                const dx = b.x - this.pointer.x;
                const dy = b.y - this.pointer.y;
                const d = Math.hypot(dx, dy);
                if (d < 190 && d > 1) {
                    const f = (1 - d / 190);
                    b.vx += (dx / d) * f * 520 * dt;
                    b.vy += (dy / d) * f * 520 * dt;
                    b.flapRate = 16;
                }
            }
            // A lightning flash panics the whole flock
            if (this.lightning.level > 0.25) {
                b.vy -= 160 * dt * this.lightning.level;
                b.flapRate = 20;
            }
            b.flapRate = hwLerp(b.flapRate, 9 + b.size * 0.4, 1 - Math.pow(0.4, dt));

            b.vx += wind * 0.25 * dt;

            // Clamp speed: boids with no speed limit end up as a comet
            const sp = Math.hypot(b.vx, b.vy);
            const max = 150, min = 48;
            if (sp > max) { b.vx *= max / sp; b.vy *= max / sp; }
            else if (sp < min && sp > 0.01) { b.vx *= min / sp; b.vy *= min / sp; }

            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.flap += b.flapRate * dt;

            // Wrap horizontally, bounce off the sky and the treeline
            if (b.x < -60) b.x = this.w + 60;
            if (b.x > this.w + 60) b.x = -60;
            if (b.y < 10) { b.y = 10; b.vy = Math.abs(b.vy); }
            const floor = this.usableHeight * 0.92;
            if (b.y > floor) { b.y = floor; b.vy = -Math.abs(b.vy); }
        }
    }

    updateGhosts(dt, wind) {
        const horizon = this.horizonY;
        for (const g of this.ghosts) {
            g.life += dt;
            g.bob += g.bobRate * dt;
            g.hem += g.hemRate * dt;
            g.shimmer = (g.shimmer + g.shimmerRate * dt) % 1;

            g.x += (g.vx + wind * 0.12) * dt;
            g.y += Math.sin(g.bob) * 13 * dt;

            // Blink
            g.blinkIn -= dt;
            if (g.blinkIn <= 0) { g.blink = 0.14; g.blinkIn = 1.8 + Math.random() * 5; }
            g.blink = Math.max(0, g.blink - dt);

            // The cursor spooks them: they stretch tall and scoot away
            if (this.config.interactive && this.pointer.inside) {
                const dx = g.x - this.pointer.x;
                const dy = g.y - this.pointer.y;
                const d = Math.hypot(dx, dy);
                if (d < 150 && d > 1) {
                    const f = 1 - d / 150;
                    g.x += (dx / d) * f * 150 * dt;
                    g.y += (dy / d) * f * 90 * dt;
                    g.startle = Math.min(1, g.startle + dt * 3);
                }
            }
            if (this.lightning.level > 0.3) g.startle = 1;
            g.startle = Math.max(0, g.startle - dt * 1.1);

            g.trail.push([g.x, g.y]);
            if (g.trail.length > 14) g.trail.shift();

            // Fade in over the first stretch of life and out over the last
            const f = g.life / g.maxLife;
            g.alpha = f < 0.15 ? hwSmooth(f / 0.15)
                : f > 0.78 ? hwSmooth(hwClamp((1 - f) / 0.22, 0, 1)) : 1;

            if (g.life > g.maxLife || g.x < -160 || g.x > this.w + 160) {
                Object.assign(g, this.createGhostInward());
            }
            // Keep them above the ground and below the treetops
            g.y = hwClamp(g.y, horizon * 0.42, this.usableHeight - g.size * 1.6);
        }
    }
    updateWebs(dt) {
        for (const web of this.webs) {
            web.wobble += web.wobbleRate * dt;
            for (const d of web.dew) d.twinkle += dt * 1.4;

            const s = web.spider;
            if (!s) continue;
            s.legPhase += dt * (s.state === 'idle' ? 1.2 : 4.5);
            s.t -= dt;

            switch (s.state) {
                case 'idle':
                    if (s.t <= 0) { s.state = 'drop'; s.t = 0; }
                    break;
                case 'drop':
                    s.drop += (40 + s.maxDrop * 0.6) * dt;
                    if (s.drop >= s.maxDrop) { s.state = 'hang'; s.t = 1.5 + Math.random() * 3; }
                    break;
                case 'hang':
                    // Hangs on the thread, swinging a little
                    if (s.t <= 0) s.state = 'climb';
                    break;
                case 'climb':
                    s.drop -= 54 * dt;
                    if (s.drop <= 0) {
                        s.drop = 0;
                        s.state = 'idle';
                        s.t = 8 + Math.random() * 22;
                    }
                    break;
            }
        }
    }

    updateFog(dt, wind) {
        for (const f of this.fogBlobs) {
            f.phase += dt * 0.3;
            f.x += (f.speed + wind * (0.3 + f.bank * 0.25)) * dt;
            if (f.x - f.r > this.w + 200) f.x = -f.r - 200;
            if (f.x + f.r < -200) f.x = this.w + f.r + 200;
        }
    }

    // Strikes come in bursts of two or three sub-flashes, because a single
    // clean flash looks like a dropped frame rather than lightning.
    updateLightning(dt) {
        const L = this.lightning;
        if (!this.config.lightning) { L.level = 0; return; }

        if (!L.active) {
            L.next -= dt * this.config.lightningRate;
            if (L.next <= 0) this.strike();
            L.level = Math.max(0, L.level - dt * 2.5);
            return;
        }

        L.t += dt;
        let level = 0;
        for (const f of L.seq) {
            const dt0 = L.t - f.at;
            if (dt0 < 0 || dt0 > f.dur) continue;
            // Sharp attack, exponential decay
            const k = dt0 / f.dur;
            level = Math.max(level, f.power * Math.pow(1 - k, 2.2) * (k < 0.08 ? k / 0.08 : 1));
        }
        L.level = level;

        const last = L.seq[L.seq.length - 1];
        if (L.t > last.at + last.dur + 0.9) {
            L.active = false;
            L.bolt = null;
            L.next = 14 + Math.random() * 38;
        }
    }

    strike() {
        const L = this.lightning;
        L.active = true;
        L.t = 0;
        L.seq = [];

        const flashes = 2 + Math.floor(Math.random() * 2);
        let at = 0;
        for (let i = 0; i < flashes; i++) {
            L.seq.push({
                at,
                dur: 0.1 + Math.random() * 0.26,
                power: (i === 0 ? 0.8 + Math.random() * 0.35 : 0.3 + Math.random() * 0.5)
            });
            at += 0.07 + Math.random() * 0.2;
        }

        // Only some strikes show a visible bolt; the rest are sheet flashes
        // behind the ridge, which is what most distant lightning looks like
        if (Math.random() < 0.4) L.bolt = this.generateBolt();
    }

    generateBolt() {
        const startX = this.w * (0.1 + Math.random() * 0.8);
        const endY = this.horizonY * (0.8 + Math.random() * 0.22);
        const pts = [[startX, -20]];
        const branches = [];
        let x = startX;
        let y = -20;

        while (y < endY) {
            const step = 16 + Math.random() * 34;
            x += (Math.random() - 0.5) * 46;
            y += step;
            pts.push([x, y]);
            if (Math.random() < 0.16) {
                // A fork that peters out
                const sub = [[x, y]];
                let bx = x, by = y;
                const n = 2 + Math.floor(Math.random() * 4);
                for (let i = 0; i < n; i++) {
                    bx += (Math.random() - 0.5) * 60;
                    by += 12 + Math.random() * 26;
                    sub.push([bx, by]);
                }
                branches.push(sub);
            }
        }
        return { pts, branches, width: 1.4 + Math.random() * 2 };
    }

    // -----------------------------------------------------------------------
    // Rendering
    // -----------------------------------------------------------------------

    bandOffset(i) {
        const k = HW_BANDS[i].parallax * this.config.parallax;
        return { x: this.pan.x * k, y: this.pan.y * k };
    }

    bandColor(hex, i) {
        const t = this.theme;
        return hwMixRgb(hwHexToRgb(hex), hwHexToRgb(t.skyHorizon), HW_BANDS[i].tint);
    }

    // Built things keep most of their own value. A far band's full haze is
    // right for a hillside but turns a tower the same colour as the sky
    // behind it, which takes its roofline with it.
    builtColor(hex, i, k = 0.3) {
        const t = this.theme;
        return hwMixRgb(hwHexToRgb(hex), hwHexToRgb(t.skyHorizon), HW_BANDS[i].tint * k);
    }

    draw() {
        const ctx = this.ctx;
        const t = this.theme;
        const lightRgb = hwHexToRgb(t.light);

        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;

        // The far bands are baked together, so they share one small pan
        const far = this.pan.x * 0.1 * this.config.parallax;
        ctx.drawImage(this.staticCanvas, -HW_MARGIN + far, this.pan.y * 0.1);

        this.drawClouds();
        if (this.config.bats) this.drawBats();

        // Silhouette furniture, far band to near
        for (let b = 1; b <= 4; b++) this.drawBandFurniture(b);

        if (this.config.fog) {
            this.drawFogBank(0);
            this.drawFogBank(1);
        }

        // Ground pools go down before the lanterns so the light reads as
        // spilling out around their base rather than painted over them
        this.drawLightPools(1);

        for (const p of this.pumpkins) this.drawPumpkin(p, lightRgb);

        this.drawLightAuras();

        if (this.config.ghosts) this.drawGhosts();

        if (this.config.fog) {
            this.drawFogBank(2);
            // Re-light the near mist from the lanterns, so the fog glows from
            // within instead of hanging as a flat grey sheet in front of them
            this.drawLightPools(0.5);
        }

        this.drawGrass();
        this.drawVines();
        this.drawLeaves();
        this.drawCandy();
        this.drawWebs();
        this.drawLightningPass();
        this.post();
    }

    drawClouds() {
        if (!this.config.cloudBands || !this.scene) return;
        const ctx = this.ctx;
        const t = this.theme;
        const rgb = hwMixRgb(hwHexToRgb(t.skyHorizon), hwHexToRgb(t.moonHalo), 0.4);

        // One squashed radial gradient per band. It tapers at both ends on its
        // own, which an alpha mask over a linear fill cannot do without
        // compositing against the sky already underneath it.
        for (const cl of this.scene.clouds) {
            const y = cl.y + Math.sin(this.time * 0.2 + cl.wobble) * 3;
            const half = cl.len * 0.5;
            ctx.save();
            ctx.translate(cl.x + half, y);
            ctx.scale(1, cl.thick / half);
            const g = ctx.createRadialGradient(0, 0, 0, 0, 0, half);
            g.addColorStop(0, hwRgba(rgb, cl.a));
            g.addColorStop(0.45, hwRgba(rgb, cl.a * 0.55));
            g.addColorStop(1, hwRgba(rgb, 0));
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(0, 0, half, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    drawBandFurniture(bandIndex) {
        const ctx = this.ctx;
        const t = this.theme;
        const off = this.bandOffset(bandIndex);
        const scene = this.scene;
        const groundY = this.groundY(bandIndex);

        ctx.save();
        ctx.translate(off.x, off.y);

        // Trees sway; the amplitude follows the wind
        const sway = this.wind * 0.08 * this.config.wind;
        for (const tree of scene.trees) {
            if (tree.bandIndex !== bandIndex) continue;
            ctx.save();
            ctx.translate(tree.x, this.groundY(tree.bandIndex));
            this.strokeTree(ctx, tree,
                this.bandColor(t.tree, bandIndex),
                sway * (1 + Math.sin(this.time * tree.swayRate + tree.sway) * 0.6) * 10);
            ctx.restore();
        }

        for (const fence of scene.fences) {
            if (fence.bandIndex !== bandIndex) continue;
            this.drawFence(fence, bandIndex);
        }

        // The castle stands behind everything else in its band
        if (scene.castle && scene.castle.bandIndex === bandIndex) {
            ctx.restore();
            this.drawCastle();
            ctx.save();
            ctx.translate(off.x, off.y);
        }

        for (const crypt of scene.crypts) {
            if (crypt.bandIndex !== bandIndex) continue;
            this.drawCrypt(crypt, bandIndex, groundY);
        }

        for (const mound of scene.mounds) {
            if (mound.bandIndex !== bandIndex) continue;
            this.drawMound(mound, bandIndex, groundY);
        }

        for (const stone of scene.stones) {
            if (stone.bandIndex !== bandIndex) continue;
            this.drawHeadstone(stone, bandIndex, groundY);
        }

        if (scene.gate && scene.gate.bandIndex === bandIndex) {
            this.drawGate(scene.gate, bandIndex, groundY);
        }

        for (const lamp of scene.lamps) {
            if (lamp.bandIndex !== bandIndex) continue;
            this.drawLampPost(lamp, bandIndex, groundY);
        }

        for (const z of this.zombies) {
            if (z.bandIndex !== bandIndex) continue;
            this.drawZombie(z, bandIndex, groundY);
        }

        ctx.restore();
    }

    drawFence(fence, bandIndex) {
        const ctx = this.ctx;
        const t = this.theme;
        const rgb = this.bandColor(t.fence, bandIndex);
        const scale = HW_BANDS[bandIndex].scale;
        const y = fence.y;

        ctx.fillStyle = hwRgba(rgb, 1);
        ctx.strokeStyle = hwRgba(rgb, 1);

        // Two rails behind the pickets
        ctx.lineWidth = 2.6 * scale;
        for (const railFrac of [0.32, 0.68]) {
            ctx.beginPath();
            let started = false;
            for (const pk of fence.pickets) {
                const py = y - pk.h * (1 - railFrac);
                const px = pk.x + pk.lean * pk.h * (1 - railFrac);
                if (!started) { ctx.moveTo(px, py); started = true; }
                else ctx.lineTo(px, py);
            }
            ctx.stroke();
        }

        for (const pk of fence.pickets) {
            ctx.save();
            ctx.translate(pk.x, y);
            ctx.rotate(pk.lean);
            ctx.beginPath();
            // Pointed top
            ctx.moveTo(-pk.w / 2, 0);
            ctx.lineTo(-pk.w / 2, -pk.h * 0.88);
            ctx.lineTo(0, -pk.h);
            ctx.lineTo(pk.w / 2, -pk.h * 0.88);
            ctx.lineTo(pk.w / 2, 0);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
    }

    drawHeadstone(stone, bandIndex, groundY) {
        const ctx = this.ctx;
        const t = this.theme;
        const rgb = this.builtColor(t.stone, bandIndex, 0.45);
        const moon = this.scene.moon;
        const w = stone.wd;
        const h = stone.h;

        ctx.save();
        ctx.translate(stone.x, groundY);
        ctx.rotate(stone.lean);

        ctx.beginPath();
        switch (stone.type) {
            case 0: // round top
                ctx.moveTo(-w / 2, 0);
                ctx.lineTo(-w / 2, -h + w / 2);
                ctx.arc(0, -h + w / 2, w / 2, Math.PI, 0);
                ctx.lineTo(w / 2, 0);
                ctx.closePath();
                break;
            case 1: { // cross
                const arm = w * 0.5;
                const bar = w * 0.26;
                ctx.rect(-bar / 2, -h, bar, h);
                ctx.rect(-arm, -h * 0.78, arm * 2, bar);
                break;
            }
            case 2: // obelisk
                ctx.moveTo(-w * 0.34, 0);
                ctx.lineTo(-w * 0.26, -h * 0.82);
                ctx.lineTo(0, -h);
                ctx.lineTo(w * 0.26, -h * 0.82);
                ctx.lineTo(w * 0.34, 0);
                ctx.closePath();
                break;
            default: // slab with shoulders
                ctx.moveTo(-w / 2, 0);
                ctx.lineTo(-w / 2, -h * 0.72);
                ctx.quadraticCurveTo(-w * 0.44, -h * 0.9, -w * 0.22, -h * 0.92);
                ctx.lineTo(w * 0.22, -h * 0.92);
                ctx.quadraticCurveTo(w * 0.44, -h * 0.9, w / 2, -h * 0.72);
                ctx.lineTo(w / 2, 0);
                ctx.closePath();
                break;
        }

        const body = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
        body.addColorStop(0, hwRgba(hwMixRgb(rgb, [0, 0, 0], 0.35), 1));
        body.addColorStop(0.5, hwRgba(rgb, 1));
        body.addColorStop(1, hwRgba(hwMixRgb(rgb, [0, 0, 0], 0.5), 1));
        ctx.fillStyle = body;
        ctx.fill();

        // Moonlit edge on whichever side faces the moon
        const side = Math.sign(moon.x - stone.x) || 1;
        ctx.save();
        ctx.clip();
        ctx.globalCompositeOperation = 'lighter';
        const rim = ctx.createLinearGradient(side * -w * 0.6, 0, side * w * 0.1, 0);
        rim.addColorStop(0, hwRgba(hwHexToRgb(t.moon), 0.22));
        rim.addColorStop(1, hwRgba(hwHexToRgb(t.moon), 0));
        ctx.fillStyle = rim;
        ctx.fillRect(-w, -h - 4, w * 2, h + 8);

        if (stone.cracked) {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = hwRgba(hwMixRgb(rgb, [0, 0, 0], 0.6), 0.8);
            ctx.lineWidth = Math.max(0.6, w * 0.035);
            ctx.beginPath();
            ctx.moveTo(-w * 0.18, -h * 0.62);
            ctx.lineTo(w * 0.04, -h * 0.4);
            ctx.lineTo(-w * 0.1, -h * 0.2);
            ctx.stroke();
        }
        ctx.restore();
        ctx.restore();
    }

    // All lit lanterns in one additive pass. `alpha` lets the pass be re-run
    // at reduced strength to light the mist in front of them.
    drawLightPools(alpha) {
        if (!this.glowSprite) return;
        const ctx = this.ctx;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        for (const p of this.pumpkins) {
            if (p.relight <= 0.01) continue;
            const off = this.bandOffset(p.bandIndex);
            const glow = p.glow * this.config.lightIntensity;
            // The pool is wide and flat: light landing on a ground plane from
            // a source sitting on it spreads sideways, not in a circle
            const r = p.scale * 7 * (0.8 + glow * 0.3);
            const ry = r * 0.42;
            ctx.globalAlpha = hwClamp(glow * 0.38 * alpha, 0, 1);
            ctx.drawImage(this.glowSprite,
                p.x + off.x - r, p.y + off.y - ry * 0.75, r * 2, ry * 2);
        }

        // Lamp posts cast from the head of the post, not from the ground
        if (this.scene) {
            for (const lamp of this.scene.lamps) {
                const glow = (lamp.glow || 0) * this.config.lightIntensity;
                if (glow <= 0.01) continue;
                const off = this.bandOffset(lamp.bandIndex);
                const gy = this.groundY(lamp.bandIndex);
                const r = lamp.h * 1.5 * (0.85 + glow * 0.2);
                ctx.globalAlpha = hwClamp(glow * 0.22 * alpha, 0, 1);
                ctx.drawImage(this.glowSprite,
                    lamp.x + off.x - r, gy + off.y - lamp.h - r * 0.6, r * 2, r * 1.6);
            }
        }
        ctx.restore();
    }

    // Tight halo around each lantern plus the wedge thrown by the carving.
    drawLightAuras() {
        const ctx = this.ctx;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        for (const p of this.pumpkins) {
            if (p.relight <= 0.01) continue;
            const off = this.bandOffset(p.bandIndex);
            const glow = p.glow * this.config.lightIntensity;
            const x = p.x + off.x;
            const y = p.y + off.y - p.scale * p.squat;

            const r = p.scale * 3.2;
            ctx.globalAlpha = hwClamp(glow * 0.42, 0, 1);
            ctx.drawImage(this.glowSprite, x - r, y - r, r * 2, r * 2);

            if (this.config.faceLight && this.coneSprite) {
                // Thrown slightly downward and toward the viewer, flickering
                // in width with the flame
                const len = p.scale * 2.8 * (0.85 + glow * 0.3);
                const wid = p.scale * 4.2;
                ctx.save();
                ctx.globalAlpha = hwClamp(glow * 0.16, 0, 1);
                ctx.translate(x, y + p.scale * 0.5);
                ctx.rotate(0.12 + p.tilt * 0.4 + Math.sin(this.time * 0.4 + p.flickerPhase) * 0.05);
                ctx.drawImage(this.coneSprite, -wid / 2, 0, wid, len);
                ctx.restore();
            }
        }
        ctx.restore();
    }

    drawPumpkin(p, lightRgb) {
        const ctx = this.ctx;
        const t = this.theme;
        const off = this.bandOffset(p.bandIndex);
        const tint = HW_BANDS[p.bandIndex].tint;
        const rx = p.scale;
        const ry = p.scale * p.squat;
        const glow = p.glow * this.config.lightIntensity;

        // Flesh colour, shifted per pumpkin and faded toward the haze with depth
        const fleshBase = hwMixRgb([226, 104, 20], [255, 150, 40], p.hueShift + 0.5);
        const flesh = hwMixRgb(fleshBase, hwHexToRgb(t.skyHorizon), tint * 0.75);
        const shade = hwMixRgb(flesh, [0, 0, 0], 0.55);

        ctx.save();
        ctx.translate(p.x + off.x, p.y + off.y);

        // Contact shadow. Stretches away from the lantern's own light, which
        // keeps it from looking pasted under the body.
        const shadowW = rx * (1.5 + glow * 0.3);
        const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, shadowW);
        sg.addColorStop(0, 'rgba(0,0,0,0.55)');
        sg.addColorStop(0.5, 'rgba(0,0,0,0.22)');
        sg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.save();
        ctx.scale(1, 0.3);
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.arc(0, 0, shadowW, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.rotate(p.tilt * 0.35);
        ctx.translate(0, -ry);

        // Stem, behind the body
        ctx.save();
        ctx.strokeStyle = hwRgba(hwMixRgb([70, 92, 40], hwHexToRgb(t.skyHorizon), tint), 1);
        ctx.lineWidth = rx * 0.17;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, -ry * 0.82);
        ctx.quadraticCurveTo(
            p.stemLean * rx * 0.3, -ry * (0.82 + p.stemLen * 0.6),
            p.stemLean * rx * 0.5, -ry * (0.82 + p.stemLen));
        ctx.stroke();
        ctx.restore();

        // Body
        const bodyPath = new Path2D();
        bodyPath.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);

        const bodyGrad = ctx.createRadialGradient(
            -rx * 0.3, -ry * 0.35, rx * 0.1, 0, 0, rx * 1.15);
        bodyGrad.addColorStop(0, hwRgba(hwMixRgb(flesh, [255, 220, 150], 0.18), 1));
        bodyGrad.addColorStop(0.55, hwRgba(flesh, 1));
        bodyGrad.addColorStop(1, hwRgba(shade, 1));
        ctx.fillStyle = bodyGrad;
        ctx.fill(bodyPath);

        ctx.save();
        ctx.clip(bodyPath);

        // Ribs. Spacing the creases by angle rather than by x foreshortens
        // them toward the limb on its own, which is what gives the body
        // volume instead of looking like stripes on a ball.
        ctx.lineCap = 'round';
        for (let i = 1; i < p.ribs; i++) {
            const a = -Math.PI / 2 + Math.PI * (i / p.ribs);
            const xr = Math.sin(a);
            const depth = Math.cos(a);
            const x = xr * rx * 0.94;

            ctx.strokeStyle = hwRgba(hwMixRgb(shade, [0, 0, 0], 0.3), 0.5 * depth + 0.15);
            ctx.lineWidth = rx * 0.055;
            ctx.beginPath();
            ctx.moveTo(x * 0.22, -ry * 0.94);
            ctx.quadraticCurveTo(x * 1.08, 0, x * 0.22, ry * 0.94);
            ctx.stroke();

            // Highlight just inside each crease, on the lit side
            ctx.strokeStyle = hwRgba(hwMixRgb(flesh, [255, 240, 200], 0.4), 0.16 * depth);
            ctx.lineWidth = rx * 0.07;
            ctx.beginPath();
            ctx.moveTo(x * 0.22 - rx * 0.07, -ry * 0.88);
            ctx.quadraticCurveTo(x * 1.0 - rx * 0.09, 0, x * 0.22 - rx * 0.07, ry * 0.88);
            ctx.stroke();
        }

        // Moonlight rim along the limb facing the moon
        const moonSide = Math.sign(this.scene.moon.x - p.x) || -1;
        ctx.globalCompositeOperation = 'lighter';
        const rimGrad = ctx.createRadialGradient(
            moonSide * rx * 1.05, -ry * 0.55, 0,
            moonSide * rx * 1.05, -ry * 0.55, rx * 1.1);
        rimGrad.addColorStop(0, hwRgba(hwHexToRgb(t.moon), 0.3));
        rimGrad.addColorStop(1, hwRgba(hwHexToRgb(t.moon), 0));
        ctx.fillStyle = rimGrad;
        ctx.fillRect(-rx, -ry, rx * 2, ry * 2);

        // Light bleeding through the shell from the candle inside
        if (glow > 0.01) {
            const bleed = ctx.createRadialGradient(0, ry * 0.1, 0, 0, ry * 0.1, rx * 1.3);
            bleed.addColorStop(0, hwRgba(lightRgb, 0.34 * glow));
            bleed.addColorStop(0.45, hwRgba(lightRgb, 0.11 * glow));
            bleed.addColorStop(1, hwRgba(lightRgb, 0));
            ctx.fillStyle = bleed;
            ctx.fillRect(-rx, -ry, rx * 2, ry * 2);
        }
        ctx.restore();

        // Carving
        const face = this.buildFacePath(p, rx, ry);

        // The hole itself, so an unlit lantern still reads as carved
        ctx.fillStyle = 'rgba(8,3,0,0.88)';
        ctx.fill(face);

        if (glow > 0.01) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            // Hot interior
            ctx.fillStyle = hwRgba(hwMixRgb(lightRgb, [255, 228, 150], 0.12), hwClamp(glow * 0.55, 0, 1));
            ctx.fill(face);
            // The cut edge catches the most light, so it is the brightest part
            ctx.strokeStyle = hwRgba(hwMixRgb(lightRgb, [255, 245, 215], 0.5), hwClamp(glow * 0.25, 0, 1));
            ctx.lineWidth = Math.max(0.5, rx * 0.045);
            ctx.stroke(face);
            ctx.restore();
        } else {
            // Unlit: a sliver of moonlight on the inside wall
            ctx.strokeStyle = hwRgba(hwHexToRgb(t.moon), 0.14);
            ctx.lineWidth = Math.max(0.5, rx * 0.035);
            ctx.stroke(face);
        }

        ctx.restore();
    }

    // Faces are assembled from parts so the patch has no two alike. All
    // coordinates are relative to the body centre, in units of its radii.
    buildFacePath(p, rx, ry) {
        const f = p.face;
        const path = new Path2D();
        const yOff = ry * f.drop;

        const eyeY = -ry * 0.3 + yOff;
        const eyeR = rx * 0.17 * f.eyeSize;

        for (let side = -1; side <= 1; side += 2) {
            const ex = side * rx * f.eyeGap;
            const tilt = f.eyeTilt * side;
            // One eye is a little bigger -- a hand-carved asymmetry
            const r = eyeR * (1 + f.asym * side);

            // Path2D has no transform stack, so the tilt is applied by hand
            const rot = (x, y) => [
                ex + x * Math.cos(tilt) - y * Math.sin(tilt),
                eyeY + x * Math.sin(tilt) + y * Math.cos(tilt)
            ];

            switch (f.eye) {
                case 0: { // triangle, point down
                    const a = rot(-r, -r * 0.8), b = rot(r, -r * 0.8), c = rot(0, r * 1.1);
                    path.moveTo(a[0], a[1]); path.lineTo(b[0], b[1]); path.lineTo(c[0], c[1]);
                    path.closePath();
                    break;
                }
                case 1: { // angled slash, leaning toward the nose
                    const lean = -side * r * 0.5;
                    const a = rot(-r + lean, -r * 0.7), b = rot(r + lean, -r * 0.2);
                    const c = rot(r, r * 0.7), d = rot(-r, r * 0.2);
                    path.moveTo(a[0], a[1]); path.lineTo(b[0], b[1]);
                    path.lineTo(c[0], c[1]); path.lineTo(d[0], d[1]);
                    path.closePath();
                    break;
                }
                case 2: { // round
                    path.moveTo(ex + r, eyeY);
                    path.ellipse(ex, eyeY, r, r * 1.05, tilt, 0, Math.PI * 2);
                    break;
                }
                default: { // diamond
                    const a = rot(0, -r), b = rot(r, 0), c = rot(0, r), d = rot(-r, 0);
                    path.moveTo(a[0], a[1]); path.lineTo(b[0], b[1]);
                    path.lineTo(c[0], c[1]); path.lineTo(d[0], d[1]);
                    path.closePath();
                    break;
                }
            }

            if (f.brow) {
                const by = eyeY - r * 1.5;
                const bw = r * 1.3;
                const lift = side * r * 0.45;
                path.moveTo(ex - bw, by - lift);
                path.lineTo(ex + bw, by + lift);
                path.lineTo(ex + bw, by + lift + r * 0.3);
                path.lineTo(ex - bw, by - lift + r * 0.3);
                path.closePath();
            }
        }

        // Nose
        if (f.nose === 1) {
            const nr = rx * 0.11;
            path.moveTo(0, -ry * 0.04 + yOff - nr);
            path.lineTo(nr, -ry * 0.04 + yOff + nr);
            path.lineTo(-nr, -ry * 0.04 + yOff + nr);
            path.closePath();
        } else if (f.nose === 2) {
            const nr = rx * 0.09;
            path.moveTo(-nr * 0.6, -ry * 0.1 + yOff);
            path.lineTo(nr * 0.6, -ry * 0.1 + yOff);
            path.lineTo(nr, -ry * 0.04 + yOff + nr * 1.6);
            path.lineTo(-nr, -ry * 0.04 + yOff + nr * 1.6);
            path.closePath();
        }

        // Mouth
        const mw = rx * f.mouthW;
        const mh = ry * f.mouthH;
        const my = ry * 0.34 + yOff;

        switch (f.mouth) {
            case 0: { // grin with hanging teeth
                path.moveTo(-mw, my - mh * 0.45);
                path.quadraticCurveTo(0, my + mh * 1.5, mw, my - mh * 0.45);
                const n = f.teeth;
                for (let i = n; i >= 0; i--) {
                    const tx = -mw + (2 * mw) * (i / n);
                    // Teeth alternate, hanging down from the upper lip
                    const down = i % 2 === 0 ? mh * 0.7 : 0;
                    path.lineTo(tx, my - mh * 0.45 + down);
                }
                path.closePath();
                break;
            }
            case 1: { // jagged, both lips
                const n = Math.max(3, f.teeth + 1);
                path.moveTo(-mw, my);
                for (let i = 0; i <= n; i++) {
                    const tx = -mw + (2 * mw) * (i / n);
                    path.lineTo(tx, my + (i % 2 ? mh : -mh * 0.35));
                }
                for (let i = n; i >= 0; i--) {
                    const tx = -mw + (2 * mw) * (i / n);
                    path.lineTo(tx, my + (i % 2 ? mh * 0.25 : -mh * 0.9));
                }
                path.closePath();
                break;
            }
            case 2: { // open gape
                path.moveTo(-mw, my - mh * 0.5);
                path.quadraticCurveTo(-mw * 0.9, my + mh * 1.3, 0, my + mh * 1.35);
                path.quadraticCurveTo(mw * 0.9, my + mh * 1.3, mw, my - mh * 0.5);
                path.quadraticCurveTo(0, my - mh * 1.0, -mw, my - mh * 0.5);
                path.closePath();
                break;
            }
            default: { // thin crescent
                path.moveTo(-mw, my - mh * 0.3);
                path.quadraticCurveTo(0, my + mh * 1.1, mw, my - mh * 0.3);
                path.quadraticCurveTo(0, my + mh * 0.45, -mw, my - mh * 0.3);
                path.closePath();
                break;
            }
        }

        return path;
    }

    // A storybook castle rather than an architectural one: towers that lean,
    // roofs that lean further the other way, and windows lit like a dolls'
    // house. Nothing here is square, which is the whole point.
    buildCastle(rng, prominence) {
        const bandIndex = prominence > 1.1 ? 2 : 1;
        const band = HW_BANDS[bandIndex];
        const unit = this.usableHeight * 0.17 * prominence * (band.scale + 0.7);

        const castle = {
            bandIndex,
            x: this.w * (rng() < 0.5 ? 0.12 + rng() * 0.2 : 0.62 + rng() * 0.24),
            unit,
            towers: [],
            crag: [],
            windows: [],
            wall: null,
            gate: null,
            pennant: { phase: rng() * Math.PI * 2 }
        };

        // Crag. A rounded outcrop so the castle is not just standing in a field.
        const cragW = unit * (2.6 + rng() * 0.9);
        const cragH = unit * (0.9 + rng() * 0.7);
        castle.lift = cragH * 0.72;   // the castle stands on top of the crag
        const lumpA = rng() * Math.PI * 2;
        const lumpB = rng() * Math.PI * 2;
        for (let i = 0; i <= 40; i++) {
            const k = i / 40;
            const x = (k - 0.5) * cragW * 2;
            // A dome raised to a fractional power: rounded shoulders, and a
            // summit flat enough to stand a castle on
            const dome = Math.pow(Math.sin(k * Math.PI), 0.42);
            const lumps = Math.sin(k * 5.3 + lumpA) * 0.05
                + Math.sin(k * 11.7 + lumpB) * 0.025;
            castle.crag.push([x, -cragH * (dome + lumps * dome)]);
        }

        // Keep in the middle, towers either side. Heights deliberately uneven.
        const towerCount = 3 + Math.floor(rng() * 2);
        const spread = unit * 1.5;
        for (let i = 0; i < towerCount; i++) {
            const k = towerCount === 1 ? 0.5 : i / (towerCount - 1);
            const isKeep = Math.abs(k - 0.5) < 0.2;
            const wd = unit * (isKeep ? 0.72 + rng() * 0.12 : 0.4 + rng() * 0.18);
            const h = unit * (isKeep ? 2.1 + rng() * 0.6 : 1.1 + rng() * 1.0);

            const tower = {
                dx: (k - 0.5) * spread * 2 + (rng() - 0.5) * unit * 0.2,
                wd, h,
                lean: (rng() - 0.5) * 0.07,
                // Roofs lean the other way from the tower, which is what makes
                // the skyline look drawn rather than drafted
                roofH: unit * (0.5 + rng() * 0.75),
                roofLean: (rng() - 0.5) * 0.22,
                finial: rng() < 0.6,
                round: rng() < 0.55,
                crenels: !isKeep && rng() < 0.3,
                keep: isKeep,
                flag: false,
                windows: []
            };

            // Windows: a column of little arches, most of them lit
            const rows = Math.max(1, Math.round(h / (unit * 0.46)));
            for (let r = 0; r < rows; r++) {
                const cols = tower.wd > unit * 0.55 ? 2 : 1;
                for (let c = 0; c < cols; c++) {
                    tower.windows.push({
                        dx: cols === 1 ? 0 : (c - 0.5) * tower.wd * 0.46,
                        dy: -h * (0.18 + (r / rows) * 0.68),
                        wd: unit * 0.1,
                        h: unit * 0.17,
                        lit: rng() < 0.62,
                        phase: rng() * Math.PI * 2,
                        rate: 0.6 + rng() * 2.4
                    });
                }
            }
            if (isKeep) {
                // A rose window over the door
                tower.rose = { dy: -h * 0.2, r: unit * 0.085, phase: rng() * Math.PI * 2 };
            }
            castle.towers.push(tower);
        }

        castle.towers.sort((a, b) => a.dx - b.dx);

        // Tallest point of the whole silhouette, pennant included
        let top = 0;
        for (const tw of castle.towers) {
            top = Math.max(top, tw.h + tw.roofH + unit * 0.55);
        }
        const budget = this.groundY(bandIndex) * 0.82;
        castle.fit = Math.min(1, budget / (top + castle.lift));
        // The tallest spire flies the pennant
        let tallest = castle.towers[0];
        for (const t of castle.towers) {
            if (t.h + t.roofH > tallest.h + tallest.roofH) tallest = t;
        }
        tallest.flag = true;

        const first = castle.towers[0];
        const last = castle.towers[castle.towers.length - 1];
        castle.wall = {
            x1: first.dx - first.wd * 0.4,
            x2: last.dx + last.wd * 0.4,
            h: unit * (0.62 + rng() * 0.2),
            crenels: 7 + Math.floor(rng() * 6)
        };
        castle.gate = {
            dx: (rng() - 0.5) * unit * 0.6,
            wd: unit * 0.36,
            h: unit * 0.46
        };

        return castle;
    }

    drawCastle() {
        const scene = this.scene;
        if (!scene || !scene.castle) return;

        const ctx = this.ctx;
        const t = this.theme;
        const castle = scene.castle;
        const bandIndex = castle.bandIndex;
        const off = this.bandOffset(bandIndex);
        const groundY = this.groundY(bandIndex);
        const tint = HW_BANDS[bandIndex].tint;

        const stoneRgb = this.builtColor(t.castle, bandIndex, 0.3);
        const roofRgb = this.builtColor(t.roof, bandIndex, 0.22);
        const winRgb = hwHexToRgb(t.window);
        const moonRgb = hwHexToRgb(t.moon);
        const moonSide = Math.sign(scene.moon.x - (castle.x + off.x)) || -1;

        ctx.save();
        ctx.translate(castle.x + off.x, groundY + off.y);
        ctx.scale(castle.fit, castle.fit);

        // Crag
        const cragTop = -castle.lift / 0.72;
        const cragGrad = ctx.createLinearGradient(0, cragTop, 0, 0);
        cragGrad.addColorStop(0, hwRgba(this.bandColor(t.hill, bandIndex), 1));
        cragGrad.addColorStop(1, hwRgba(hwMixRgb(this.bandColor(t.hill, bandIndex),
            [0, 0, 0], 0.45), 1));
        ctx.fillStyle = cragGrad;
        ctx.beginPath();
        ctx.moveTo(castle.crag[0][0], 4);
        for (const pt of castle.crag) ctx.lineTo(pt[0], pt[1]);
        ctx.lineTo(castle.crag[castle.crag.length - 1][0], 4);
        ctx.closePath();
        ctx.fill();

        // Everything above the crag is built on its summit
        ctx.translate(0, -castle.lift);

        const stoneFill = (h) => {
            // Lighter at the top, so the mass does not read as one flat cutout
            const g = ctx.createLinearGradient(0, -h, 0, 0);
            g.addColorStop(0, hwRgba(hwMixRgb(stoneRgb, [255, 255, 255], 0.05), 1));
            g.addColorStop(1, hwRgba(hwMixRgb(stoneRgb, [0, 0, 0], 0.35), 1));
            return g;
        };

        // Curtain wall with battlements
        const wall = castle.wall;
        ctx.fillStyle = stoneFill(wall.h);
        ctx.fillRect(wall.x1, -wall.h, wall.x2 - wall.x1, wall.h);
        const merlonW = (wall.x2 - wall.x1) / (wall.crenels * 2 + 1);
        for (let i = 0; i <= wall.crenels; i++) {
            ctx.fillRect(wall.x1 + i * merlonW * 2, -wall.h - merlonW * 0.8,
                merlonW, merlonW * 0.9);
        }

        // Gate: an arch cut out of the wall, glowing faintly from inside
        const gate = castle.gate;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(gate.dx - gate.wd / 2, 0);
        ctx.lineTo(gate.dx - gate.wd / 2, -gate.h * 0.55);
        ctx.quadraticCurveTo(gate.dx, -gate.h * 1.1, gate.dx + gate.wd / 2, -gate.h * 0.55);
        ctx.lineTo(gate.dx + gate.wd / 2, 0);
        ctx.closePath();
        ctx.fillStyle = 'rgba(6,2,10,0.95)';
        ctx.fill();
        ctx.clip();
        ctx.globalCompositeOperation = 'lighter';
        const gateGlow = ctx.createLinearGradient(0, 0, 0, -gate.h);
        gateGlow.addColorStop(0, hwRgba(winRgb, 0.32));
        gateGlow.addColorStop(1, hwRgba(winRgb, 0));
        ctx.fillStyle = gateGlow;
        ctx.fillRect(gate.dx - gate.wd, -gate.h * 1.2, gate.wd * 2, gate.h * 1.2);
        ctx.restore();

        // Towers
        for (const tw of castle.towers) {
            ctx.save();
            ctx.translate(tw.dx, 0);
            ctx.rotate(tw.lean);

            ctx.fillStyle = stoneFill(tw.h);
            if (tw.round) {
                // A drum tower, slightly barrelled
                ctx.beginPath();
                ctx.moveTo(-tw.wd / 2, 0);
                ctx.quadraticCurveTo(-tw.wd * 0.56, -tw.h / 2, -tw.wd / 2, -tw.h);
                ctx.lineTo(tw.wd / 2, -tw.h);
                ctx.quadraticCurveTo(tw.wd * 0.56, -tw.h / 2, tw.wd / 2, 0);
                ctx.closePath();
                ctx.fill();
            } else {
                ctx.fillRect(-tw.wd / 2, -tw.h, tw.wd, tw.h);
            }

            if (tw.crenels) {
                const m = tw.wd / 5;
                for (let i = 0; i < 3; i++) {
                    ctx.fillRect(-tw.wd / 2 + i * m * 2, -tw.h - m * 0.9, m, m);
                }
            }

            // Moonlit edge
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const rim = ctx.createLinearGradient(
                moonSide * -tw.wd * 0.6, 0, moonSide * tw.wd * 0.3, 0);
            rim.addColorStop(0, hwRgba(moonRgb, 0.16 * (1 - tint * 0.5)));
            rim.addColorStop(1, hwRgba(moonRgb, 0));
            ctx.fillStyle = rim;
            ctx.fillRect(-tw.wd, -tw.h - tw.roofH, tw.wd * 2, tw.h + tw.roofH);
            ctx.restore();

            // Conical roof, leaning its own way
            ctx.save();
            ctx.translate(0, -tw.h);
            ctx.rotate(tw.roofLean);
            const eave = tw.wd * 0.72;
            ctx.fillStyle = hwRgba(roofRgb, 1);
            ctx.beginPath();
            ctx.moveTo(-eave, 0);
            // A slight belly in the slope reads as hand-drawn
            ctx.quadraticCurveTo(-eave * 0.34, -tw.roofH * 0.55, 0, -tw.roofH);
            ctx.quadraticCurveTo(eave * 0.34, -tw.roofH * 0.55, eave, 0);
            ctx.closePath();
            ctx.fill();

            // Lit side of the roof
            ctx.save();
            ctx.clip();
            ctx.globalCompositeOperation = 'lighter';
            const rg = ctx.createLinearGradient(moonSide * -eave, 0, 0, 0);
            rg.addColorStop(0, hwRgba(moonRgb, 0.14));
            rg.addColorStop(1, hwRgba(moonRgb, 0));
            ctx.fillStyle = rg;
            ctx.fillRect(-eave, -tw.roofH, eave * 2, tw.roofH);
            ctx.restore();

            if (tw.finial) {
                ctx.fillStyle = hwRgba(roofRgb, 1);
                ctx.beginPath();
                ctx.arc(0, -tw.roofH - eave * 0.12, eave * 0.1, 0, Math.PI * 2);
                ctx.fill();
            }

            if (tw.flag) {
                // A pennant snapping on its pole, driven by the same wind
                const poleH = tw.roofH * 0.42;
                const px = 0, py = -tw.roofH - eave * 0.16;
                ctx.strokeStyle = hwRgba(roofRgb, 1);
                ctx.lineWidth = Math.max(0.8, eave * 0.06);
                ctx.beginPath();
                ctx.moveTo(px, py);
                ctx.lineTo(px, py - poleH);
                ctx.stroke();

                const wave = Math.sin(this.time * 3 + castle.pennant.phase);
                const gust = 1 + this.wind * 0.004 * this.config.wind;
                ctx.fillStyle = hwRgba(hwMixRgb(roofRgb, [255, 255, 255], 0.2), 1);
                ctx.beginPath();
                ctx.moveTo(px, py - poleH);
                ctx.quadraticCurveTo(
                    px + poleH * 0.6 * gust, py - poleH + wave * poleH * 0.14,
                    px + poleH * 1.15 * gust, py - poleH * 0.78 + wave * poleH * 0.2);
                ctx.lineTo(px, py - poleH * 0.58);
                ctx.closePath();
                ctx.fill();
            }
            ctx.restore();

            // Windows last, so they sit on top of the stonework
            for (const win of tw.windows) {
                const flick = win.lit
                    ? 0.72 + 0.28 * Math.sin(this.time * win.rate + win.phase)
                    : 0;
                this.drawCastleWindow(win.dx, win.dy, win.wd, win.h, flick, winRgb);
            }
            if (tw.rose) {
                const flick = 0.7 + 0.3 * Math.sin(this.time * 0.9 + tw.rose.phase);
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.fillStyle = hwRgba(winRgb, 0.5 * flick);
                ctx.beginPath();
                ctx.arc(0, tw.rose.dy, tw.rose.r, 0, Math.PI * 2);
                ctx.fill();
                const halo = ctx.createRadialGradient(0, tw.rose.dy, 0, 0, tw.rose.dy, tw.rose.r * 4);
                halo.addColorStop(0, hwRgba(winRgb, 0.16 * flick));
                halo.addColorStop(1, hwRgba(winRgb, 0));
                ctx.fillStyle = halo;
                ctx.fillRect(-tw.rose.r * 4, tw.rose.dy - tw.rose.r * 4,
                    tw.rose.r * 8, tw.rose.r * 8);
                ctx.restore();
            }

            ctx.restore();
        }

        ctx.restore();
    }

    // A little arched window, plus the halo it throws onto the stone around it.
    drawCastleWindow(x, y, w, h, glow, winRgb) {
        const ctx = this.ctx;
        ctx.save();

        ctx.beginPath();
        ctx.moveTo(x - w / 2, y);
        ctx.lineTo(x - w / 2, y - h * 0.6);
        ctx.quadraticCurveTo(x, y - h * 1.25, x + w / 2, y - h * 0.6);
        ctx.lineTo(x + w / 2, y);
        ctx.closePath();

        ctx.fillStyle = glow > 0.01 ? 'rgba(10,4,0,0.9)' : 'rgba(4,2,8,0.85)';
        ctx.fill();

        if (glow > 0.01) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = hwRgba(winRgb, 0.62 * glow);
            ctx.fill();
            const r = Math.max(w, h) * 1.7;
            const halo = ctx.createRadialGradient(x, y - h * 0.5, 0, x, y - h * 0.5, r);
            halo.addColorStop(0, hwRgba(winRgb, 0.11 * glow));
            halo.addColorStop(1, hwRgba(winRgb, 0));
            ctx.fillStyle = halo;
            ctx.fillRect(x - r, y - h * 0.5 - r, r * 2, r * 2);
        }
        ctx.restore();
    }

    drawMound(mound, bandIndex, groundY) {
        const ctx = this.ctx;
        const t = this.theme;
        ctx.fillStyle = hwRgba(hwMixRgb(this.bandColor(t.ground, bandIndex),
            [0, 0, 0], 0.2), 1);
        ctx.beginPath();
        ctx.moveTo(mound.x - mound.wd / 2, groundY + 1);
        ctx.quadraticCurveTo(mound.x, groundY - mound.h * 2.2,
            mound.x + mound.wd / 2, groundY + 1);
        ctx.closePath();
        ctx.fill();
    }

    drawCrypt(crypt, bandIndex, groundY) {
        const ctx = this.ctx;
        const t = this.theme;
        const rgb = this.builtColor(t.stone, bandIndex, 0.45);
        const moonRgb = hwHexToRgb(t.moon);
        const winRgb = hwHexToRgb(t.window);
        const w = crypt.wd;
        const h = crypt.h;

        ctx.save();
        ctx.translate(crypt.x, groundY);
        ctx.rotate(crypt.lean);

        // Step at the base
        ctx.fillStyle = hwRgba(hwMixRgb(rgb, [0, 0, 0], 0.3), 1);
        ctx.fillRect(-w * 0.58, -h * 0.1, w * 1.16, h * 0.1 + 2);

        const body = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
        body.addColorStop(0, hwRgba(hwMixRgb(rgb, [255, 255, 255], 0.06), 1));
        body.addColorStop(1, hwRgba(hwMixRgb(rgb, [0, 0, 0], 0.5), 1));
        ctx.fillStyle = body;
        ctx.fillRect(-w / 2, -h, w, h);

        // Roof: a dome, or a pediment with a cross on it
        if (crypt.dome) {
            ctx.beginPath();
            ctx.moveTo(-w * 0.54, -h);
            ctx.quadraticCurveTo(0, -h * 1.62, w * 0.54, -h);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = hwRgba(hwMixRgb(rgb, [0, 0, 0], 0.5), 1);
            ctx.lineWidth = Math.max(0.8, w * 0.022);
            ctx.beginPath();
            ctx.moveTo(0, -h * 1.6);
            ctx.lineTo(0, -h * 1.86);
            ctx.moveTo(-w * 0.07, -h * 1.78);
            ctx.lineTo(w * 0.07, -h * 1.78);
            ctx.stroke();
        } else {
            ctx.beginPath();
            ctx.moveTo(-w * 0.58, -h);
            ctx.lineTo(0, -h * 1.38);
            ctx.lineTo(w * 0.58, -h);
            ctx.closePath();
            ctx.fill();
        }

        // Arched door, lit from within if anyone is home
        const dw = w * 0.3;
        const dh = h * 0.62;
        ctx.beginPath();
        ctx.moveTo(-dw / 2, 0);
        ctx.lineTo(-dw / 2, -dh * 0.6);
        ctx.quadraticCurveTo(0, -dh * 1.18, dw / 2, -dh * 0.6);
        ctx.lineTo(dw / 2, 0);
        ctx.closePath();
        ctx.fillStyle = 'rgba(6,3,10,0.92)';
        ctx.fill();

        if (crypt.lit) {
            const flick = 0.6 + 0.4 * Math.sin(this.time * 1.7 + crypt.phase);
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const g = ctx.createLinearGradient(0, 0, 0, -dh);
            g.addColorStop(0, hwRgba(winRgb, 0.5 * flick));
            g.addColorStop(1, hwRgba(winRgb, 0.05 * flick));
            ctx.fillStyle = g;
            ctx.fill();
            ctx.restore();
        }

        // Moonlit face
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const side = Math.sign(this.scene.moon.x - crypt.x) || 1;
        const rim = ctx.createLinearGradient(side * -w * 0.6, 0, side * w * 0.2, 0);
        rim.addColorStop(0, hwRgba(moonRgb, 0.14));
        rim.addColorStop(1, hwRgba(moonRgb, 0));
        ctx.fillStyle = rim;
        ctx.fillRect(-w, -h * 1.9, w * 2, h * 1.9);
        ctx.restore();

        ctx.restore();
    }

    drawGate(gate, bandIndex, groundY) {
        const ctx = this.ctx;
        const t = this.theme;
        const rgb = hwMixRgb(this.bandColor(t.fence, bandIndex), [0, 0, 0], 0.2);
        const w = gate.wd;
        const h = gate.h;
        const scale = HW_BANDS[bandIndex].scale;

        ctx.save();
        ctx.translate(gate.x, groundY);
        ctx.strokeStyle = hwRgba(rgb, 1);
        ctx.fillStyle = hwRgba(rgb, 1);
        ctx.lineCap = 'round';

        // Posts
        const postW = 4.5 * scale;
        for (const side of [-1, 1]) {
            ctx.fillRect(side * w / 2 - postW / 2, -h, postW, h);
            // Spear tip
            ctx.beginPath();
            ctx.moveTo(side * w / 2 - postW * 0.8, -h);
            ctx.lineTo(side * w / 2, -h - postW * 2);
            ctx.lineTo(side * w / 2 + postW * 0.8, -h);
            ctx.closePath();
            ctx.fill();
        }

        // The arch over the top, with a scrolled curl at each end
        ctx.lineWidth = 2.4 * scale;
        ctx.beginPath();
        ctx.moveTo(-w / 2, -h * 0.94);
        ctx.quadraticCurveTo(0, -h * 1.42, w / 2, -h * 0.94);
        ctx.stroke();

        ctx.lineWidth = 1.5 * scale;
        for (let i = 1; i < 5; i++) {
            const k = i / 5;
            const x = (k - 0.5) * w;
            // Follow the arch curve for the top of each hanging bar
            const ay = hwLerp(hwLerp(-h * 0.94, -h * 1.42, k), hwLerp(-h * 1.42, -h * 0.94, k), k);
            ctx.beginPath();
            ctx.moveTo(x, ay);
            ctx.lineTo(x, -h * 0.82);
            ctx.stroke();
        }

        // Two leaves of bars, one swinging gently ajar
        const swing = Math.sin(this.time * 0.35 + gate.swing) * 0.1;
        for (const side of [-1, 1]) {
            ctx.save();
            ctx.translate(side * w / 2, -h * 0.1);
            ctx.rotate(side * (0.18 + swing));
            ctx.lineWidth = 1.6 * scale;
            const leafW = w * 0.46;
            for (let i = 0; i <= gate.bars; i++) {
                const x = -side * leafW * (i / gate.bars);
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, -h * 0.78);
                ctx.stroke();
            }
            ctx.beginPath();
            ctx.moveTo(0, -h * 0.72);
            ctx.lineTo(-side * leafW, -h * 0.72);
            ctx.moveTo(0, -h * 0.2);
            ctx.lineTo(-side * leafW, -h * 0.2);
            ctx.stroke();
            ctx.restore();
        }

        ctx.restore();
    }

    drawLampPost(lamp, bandIndex, groundY) {
        const ctx = this.ctx;
        const t = this.theme;
        const rgb = hwMixRgb(this.bandColor(t.fence, bandIndex), [0, 0, 0], 0.3);
        const winRgb = hwHexToRgb(t.window);
        const h = lamp.h;
        const s = lamp.scale;
        const glow = lamp.glow || 0;

        ctx.save();
        ctx.translate(lamp.x, groundY);
        ctx.rotate(lamp.lean);

        ctx.strokeStyle = hwRgba(rgb, 1);
        ctx.lineWidth = 2.4 * s;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -h);
        ctx.stroke();

        // Base
        ctx.fillStyle = hwRgba(rgb, 1);
        ctx.beginPath();
        ctx.ellipse(0, 0, 5 * s, 2 * s, 0, 0, Math.PI * 2);
        ctx.fill();

        // Lantern head: a little four-sided cage with a cap
        const lw = 9 * s;
        const lh = 13 * s;
        ctx.beginPath();
        ctx.moveTo(-lw * 0.5, -h);
        ctx.lineTo(-lw * 0.36, -h - lh);
        ctx.lineTo(lw * 0.36, -h - lh);
        ctx.lineTo(lw * 0.5, -h);
        ctx.closePath();
        ctx.fillStyle = 'rgba(8,4,2,0.85)';
        ctx.fill();

        if (glow > 0.01) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = hwRgba(winRgb, 0.8 * glow);
            ctx.fill();
            ctx.restore();
        }

        ctx.strokeStyle = hwRgba(rgb, 1);
        ctx.lineWidth = 1.4 * s;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-lw * 0.6, -h - lh);
        ctx.lineTo(0, -h - lh * 1.5);
        ctx.lineTo(lw * 0.6, -h - lh);
        ctx.closePath();
        ctx.fillStyle = hwRgba(rgb, 1);
        ctx.fill();

        ctx.restore();
    }

    // Shambling residents. Half of them start underground at a grave mound and
    // claw their way out; the rest are already up and wandering. They are
    // drawn at the same depth as the headstones so they walk between them.
    spawnZombies(rng) {
        this.zombies = [];
        if (!this.config.zombies) return;

        const p = this.preset;
        const count = Math.round(this.config.zombieCount * (p.zombies != null ? p.zombies : 1));
        const mounds = this.scene ? this.scene.mounds.slice() : [];

        for (let i = 0; i < count; i++) {
            // A mound to climb out of, if one is going spare
            const useMound = mounds.length > 0 && rng() < 0.4;
            const mound = useMound ? mounds.splice(Math.floor(rng() * mounds.length), 1)[0] : null;
            const bandIndex = mound ? mound.bandIndex : (rng() < 0.45 ? 3 : 4);
            const band = HW_BANDS[bandIndex];

            this.zombies.push({
                x: mound ? mound.x : rng() * this.w,
                bandIndex,
                scale: (0.82 + rng() * 0.4) * band.scale,
                dir: rng() < 0.5 ? -1 : 1,
                speed: 5 + rng() * 9,

                // buried -> clawing -> rising -> shamble, or straight to shamble
                state: mound ? 'buried' : 'shamble',
                stateT: mound ? rng() * 9 : 0,
                emerge: mound ? 0 : 1,      // 0 fully underground, 1 fully out
                mound,

                step: rng() * Math.PI * 2,
                stepRate: 1.5 + rng() * 0.9,
                // One leg stiffer than the other gives the lurch its character
                limp: 0.35 + rng() * 0.45,
                lean: (rng() - 0.5) * 0.18,
                headTilt: (rng() - 0.5) * 0.5,
                armDrop: rng() < 0.35,      // one arm hangs instead of reaching
                jawPhase: rng() * Math.PI * 2,
                pause: 0,
                pauseIn: 4 + rng() * 10,
                shade: rng(),               // picks the clothing tone
                tatters: 3 + Math.floor(rng() * 3)
            });
        }

        this.zombies.sort((a, b) => a.bandIndex - b.bandIndex);
    }

    updateZombies(dt, wind) {
        if (!this.zombies.length) return;
        const ground = this.usableHeight;

        for (const z of this.zombies) {
            z.stateT -= dt;

            switch (z.state) {
                case 'buried':
                    // Waiting underground for its turn
                    if (z.stateT <= 0) { z.state = 'clawing'; z.stateT = 0.9 + Math.random() * 0.6; }
                    break;
                case 'clawing':
                    // One hand out of the earth, scrabbling
                    if (z.stateT <= 0) { z.state = 'rising'; z.stateT = 2.2 + Math.random(); }
                    break;
                case 'rising': {
                    const total = 2.2;
                    z.emerge = hwClamp(1 - z.stateT / total, 0, 1);
                    if (z.stateT <= 0) { z.emerge = 1; z.state = 'shamble'; }
                    break;
                }
                case 'shamble':
                    z.emerge = 1;
                    z.pauseIn -= dt;
                    if (z.pauseIn <= 0) {
                        z.pause = 1.2 + Math.random() * 2.2;
                        z.pauseIn = 6 + Math.random() * 14;
                    }
                    if (z.pause > 0) {
                        // Stops, sways, and sometimes turns around
                        z.pause -= dt;
                        if (z.pause <= 0 && Math.random() < 0.45) z.dir *= -1;
                    } else {
                        z.step += z.stepRate * dt;
                        // The lurch: forward progress stalls on the stiff leg
                        const gait = 0.72 + 0.28 * Math.sin(z.step * 2);
                        z.x += z.dir * z.speed * gait * dt;
                    }
                    break;
            }

            // They notice the cursor and shuffle toward it, which is the one
            // thing a zombie is reliably good at
            if (z.state === 'shamble' && this.config.interactive && this.pointer.inside) {
                const dx = this.pointer.x - z.x;
                if (Math.abs(dx) < 320 && Math.abs(dx) > 14) {
                    const want = Math.sign(dx);
                    if (want !== z.dir && Math.random() < dt * 1.6) z.dir = want;
                    z.pause = 0;
                }
            }

            // A lightning flash freezes them mid-step
            if (this.lightning.level > 0.35) z.pause = Math.max(z.pause, 0.5);

            z.jawPhase += dt * 1.1;

            // Wrap around the edges, re-picking a lane on the way through
            if (z.x < -90) { z.x = this.w + 90; z.mound = null; }
            if (z.x > this.w + 90) { z.x = -90; z.mound = null; }
        }
    }

    drawZombie(z, bandIndex, groundY) {
        const ctx = this.ctx;
        const t = this.theme;
        const s = 34 * z.scale;
        const tint = HW_BANDS[bandIndex].tint;

        if (z.state === 'buried') return;

        const skin = hwMixRgb(hwHexToRgb(t.zombie), hwHexToRgb(t.skyHorizon), tint * 0.3);
        const cloth = hwMixRgb(
            hwMixRgb([52, 58, 48], [66, 48, 60], z.shade),
            hwHexToRgb(t.skyHorizon), tint * 0.3);
        const dark = hwMixRgb(skin, [0, 0, 0], 0.55);

        // Just a hand out of the earth; no body yet to light
        if (z.state === 'clawing') {
            const reach = hwSmooth(hwClamp(1 - z.stateT / 1.2, 0, 1));
            ctx.save();
            ctx.translate(z.x, groundY);
            ctx.strokeStyle = hwRgba(skin, 1);
            ctx.lineWidth = s * 0.11;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(-s * 0.1, 0);
            ctx.lineTo(-s * 0.16, -s * 0.34 * reach);
            ctx.stroke();
            for (let i = -1; i <= 1; i++) {
                ctx.lineWidth = s * 0.05;
                ctx.beginPath();
                ctx.moveTo(-s * 0.16, -s * 0.34 * reach);
                ctx.lineTo(-s * 0.16 + i * s * 0.08, -s * (0.34 * reach + 0.12));
                ctx.stroke();
            }
            ctx.restore();
            return;
        }

        // The figure is drawn into a buffer rather than straight onto the
        // scene so the lantern rim can be masked to its own pixels with
        // source-atop. Filling a rectangle with the rim gradient in place
        // painted a visible square of light onto the ground around it -- the
        // headstones get away with that only because they have a single path
        // to clip to, and a body made of strokes does not.
        const padX = Math.ceil(s * 1.35);
        const padTop = Math.ceil(s * 2.25);
        const padBot = Math.ceil(s * 0.3);
        const bw = padX * 2;
        const bh = padTop + padBot;

        const buf = this.zombieBuffer(bw, bh);
        const b = buf.getContext('2d');
        b.setTransform(1, 0, 0, 1, 0, 0);
        b.globalCompositeOperation = 'source-over';
        b.globalAlpha = 1;
        b.clearRect(0, 0, bw, bh);

        b.save();
        b.translate(padX, padTop);          // buffer origin sits at the feet
        this.paintZombie(b, z, s, skin, cloth, dark);
        b.restore();

        // Warm edge from whichever lantern is nearest, so they sit in the same
        // light as everything else on the ground
        const lit = this.nearestLantern(z.x, bandIndex);
        if (lit) {
            const side = Math.sign(lit.x - z.x) || 1;
            const x0 = padX + side * s * 0.75;
            const x1 = padX - side * s * 0.35;
            const rim = b.createLinearGradient(x0, 0, x1, 0);
            rim.addColorStop(0, hwRgba(hwHexToRgb(t.light), 0.34 * lit.glow));
            rim.addColorStop(1, hwRgba(hwHexToRgb(t.light), 0));
            b.globalCompositeOperation = 'source-atop';
            b.fillStyle = rim;
            b.fillRect(0, 0, bw, bh);
        }

        ctx.drawImage(buf, 0, 0, bw, bh, z.x - padX, groundY - padTop, bw, bh);
    }

    // One buffer shared by every zombie, grown to fit the largest.
    zombieBuffer(w, h) {
        const have = this.zombieCanvas;
        if (!have || have.width < w || have.height < h) {
            this.zombieCanvas = this.scratch(
                Math.max(w, have ? have.width : 0),
                Math.max(h, have ? have.height : 0));
        }
        return this.zombieCanvas;
    }

    // Draws the figure with its feet at the origin of whatever context it is
    // handed, so it can go to the scene or to an offscreen buffer.
    paintZombie(ctx, z, s, skin, cloth, dark) {
        // Rising: clipped at the ground line so it comes up out of the earth
        if (z.emerge < 1) {
            ctx.beginPath();
            ctx.rect(-s * 1.6, -s * 3.2, s * 3.2, s * 3.2);
            ctx.clip();
            ctx.translate(0, s * 2.05 * (1 - z.emerge));
        }

        ctx.rotate(z.lean);

        const walking = z.state === 'shamble' && z.pause <= 0;
        const stepA = walking ? Math.sin(z.step) : Math.sin(this.time * 0.8) * 0.15;
        const stepB = walking ? Math.sin(z.step + Math.PI) * z.limp : -stepA * 0.4;
        const bob = walking ? Math.abs(Math.cos(z.step)) * s * 0.05 : 0;
        ctx.translate(0, -bob);

        // Skeleton reference points. Keeping these named stops the head from
        // creeping down into the shoulders when any one number is tweaked.
        const hipY = -s * 0.78;
        const shoulderY = -s * 1.44;
        const headY = -s * 1.74;
        const headR = s * 0.23;

        const limb = (x1, y1, cx, cy, x2, y2, width, rgb) => {
            ctx.strokeStyle = hwRgba(rgb, 1);
            ctx.lineWidth = width;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.quadraticCurveTo(cx, cy, x2, y2);
            ctx.stroke();
        };

        ctx.lineCap = 'round';
        const far = hwMixRgb(skin, [0, 0, 0], 0.4);
        const farCloth = hwMixRgb(cloth, [0, 0, 0], 0.35);

        // Far leg and far arm go down first, so the torso overlaps them
        limb(-s * 0.1, hipY,
            -s * 0.1 + stepB * s * 0.22, hipY * 0.45,
            -s * 0.08 + stepB * s * 0.44, -s * 0.02, s * 0.15, farCloth);

        const armSwing = walking ? Math.sin(z.step + 1.2) * 0.08 : 0;
        if (z.armDrop) {
            // One arm just hangs, which is half the charm of the pose
            limb(-z.dir * s * 0.18, shoulderY,
                -z.dir * s * 0.44, shoulderY + s * 0.3,
                -z.dir * s * 0.4, hipY + s * 0.08, s * 0.11, far);
        } else {
            // Higher and shorter than the near arm, so the two stay readable
            // as two arms rather than merging into one bar
            limb(-z.dir * s * 0.1, shoulderY,
                z.dir * s * 0.3, shoulderY - s * 0.3 + armSwing * s * 0.3,
                z.dir * s * 0.62, shoulderY - s * 0.26, s * 0.1, far);
        }

        // Torso: tapered, with a ragged shirt hem
        const torso = new Path2D();
        torso.moveTo(-s * 0.27, shoulderY);
        torso.quadraticCurveTo(0, shoulderY - s * 0.1, s * 0.27, shoulderY);
        torso.lineTo(s * 0.24, hipY - s * 0.04);
        for (let i = z.tatters; i >= 0; i--) {
            const k = i / z.tatters;
            torso.lineTo(-s * 0.24 + s * 0.48 * k, hipY + (i % 2 ? s * 0.16 : -s * 0.04));
        }
        torso.closePath();
        ctx.fillStyle = hwRgba(cloth, 1);
        ctx.fill(torso);

        // Near leg and near arm, in front of the torso
        limb(s * 0.1, hipY,
            s * 0.1 + stepA * s * 0.22, hipY * 0.45,
            s * 0.08 + stepA * s * 0.44, -s * 0.02, s * 0.16, cloth);

        limb(z.dir * s * 0.1, shoulderY + s * 0.06,
            z.dir * s * 0.5, shoulderY + s * 0.2 - armSwing * s * 0.3,
            z.dir * s * 0.95, shoulderY + s * 0.14, s * 0.12, skin);

        // Head
        ctx.save();
        ctx.translate(z.dir * s * 0.05, headY);
        ctx.rotate(z.headTilt);
        ctx.fillStyle = hwRgba(skin, 1);
        ctx.beginPath();
        ctx.ellipse(0, 0, headR, headR * 1.1, 0, 0, Math.PI * 2);
        ctx.fill();

        // Sunken eyes and a jaw that hangs open and shuts slowly
        ctx.fillStyle = hwRgba(dark, 0.95);
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.ellipse(side * headR * 0.4 + z.dir * headR * 0.16, -headR * 0.12,
                headR * 0.2, headR * 0.26, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        const jaw = headR * (0.16 + 0.14 * (0.5 + 0.5 * Math.sin(z.jawPhase)));
        ctx.beginPath();
        ctx.ellipse(z.dir * headR * 0.2, headR * 0.5, headR * 0.22, jaw, 0, 0, Math.PI * 2);
        ctx.fill();

        // A few tufts, because a bald zombie reads as an egg
        ctx.strokeStyle = hwRgba(dark, 0.75);
        ctx.lineWidth = Math.max(0.5, headR * 0.12);
        ctx.beginPath();
        ctx.moveTo(-headR * 0.5, -headR * 0.85);
        ctx.lineTo(-headR * 0.66, -headR * 1.3);
        ctx.moveTo(-headR * 0.05, -headR * 1.05);
        ctx.lineTo(headR * 0.04, -headR * 1.48);
        ctx.stroke();
        ctx.restore();
    }

    nearestLantern(x, bandIndex) {
        let best = null;
        let bestD = Infinity;
        for (const p of this.pumpkins) {
            if (p.bandIndex !== bandIndex || p.glow <= 0.05) continue;
            const d = Math.abs(p.x - x);
            if (d < bestD && d < 260) { bestD = d; best = p; }
        }
        return best;
    }

    drawFogBank(bank) {
        if (!this.fogSprite) return;
        const ctx = this.ctx;
        const density = this.config.fogDensity;

        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        for (const f of this.fogBlobs) {
            if (f.bank !== bank) continue;
            const wob = Math.sin(f.phase) * f.r * 0.06;
            ctx.globalAlpha = hwClamp(f.a * density * 0.55, 0, 1);
            ctx.drawImage(this.fogSprite,
                f.x - f.r, f.y - f.r * f.squash + wob,
                f.r * 2, f.r * 2 * f.squash);
        }
        ctx.restore();
    }

    drawBats() {
        const ctx = this.ctx;
        const t = this.theme;
        ctx.save();
        ctx.fillStyle = hwRgba(hwMixRgb(hwHexToRgb(t.tree), [0, 0, 0], 0.4), 0.92);

        for (const b of this.bats) {
            const s = b.size;
            // Wing span collapses as the wings beat; the body bobs with it
            const beat = Math.sin(b.flap);
            const span = 0.35 + Math.abs(beat) * 0.65;
            const lift = -beat * s * 0.22;

            ctx.save();
            ctx.translate(b.x, b.y + lift);
            // Bank into the turn
            ctx.rotate(hwClamp(b.vy / 220, -0.5, 0.5));
            ctx.scale(b.vx < 0 ? -1 : 1, 1);

            ctx.beginPath();
            // Body
            ctx.ellipse(0, 0, s * 0.3, s * 0.42, 0, 0, Math.PI * 2);
            ctx.fill();

            // Wings: a scalloped membrane either side, two arcs per wing
            for (let side = -1; side <= 1; side += 2) {
                ctx.beginPath();
                ctx.moveTo(0, -s * 0.1);
                ctx.quadraticCurveTo(
                    side * s * 1.0 * span, -s * 0.75 * span,
                    side * s * 1.9 * span, -s * 0.2 * span);
                // Scalloped trailing edge
                ctx.quadraticCurveTo(
                    side * s * 1.4 * span, s * 0.1,
                    side * s * 1.15 * span, s * 0.3 * span);
                ctx.quadraticCurveTo(
                    side * s * 0.85 * span, s * 0.05,
                    side * s * 0.6 * span, s * 0.34 * span);
                ctx.quadraticCurveTo(
                    side * s * 0.3 * span, s * 0.1,
                    0, s * 0.28);
                ctx.closePath();
                ctx.fill();
            }

            // Ears
            ctx.beginPath();
            ctx.moveTo(-s * 0.16, -s * 0.34);
            ctx.lineTo(-s * 0.1, -s * 0.62);
            ctx.lineTo(-s * 0.02, -s * 0.36);
            ctx.closePath();
            ctx.moveTo(s * 0.16, -s * 0.34);
            ctx.lineTo(s * 0.1, -s * 0.62);
            ctx.lineTo(s * 0.02, -s * 0.36);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
        ctx.restore();
    }

    drawGhosts() {
        const ctx = this.ctx;
        const t = this.theme;
        const rgb = hwHexToRgb(t.ghost);

        for (const g of this.ghosts) {
            const a = g.alpha;
            if (a <= 0.01) continue;

            // Wisps left behind, so the drift reads as floating
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            for (let i = 0; i < g.trail.length; i += 2) {
                const k = i / g.trail.length;
                const [tx, ty] = g.trail[i];
                const r = g.size * (0.25 + k * 0.5);
                const grad = ctx.createRadialGradient(tx, ty, 0, tx, ty, r);
                grad.addColorStop(0, hwRgba(rgb, a * k * 0.12));
                grad.addColorStop(1, hwRgba(rgb, 0));
                ctx.fillStyle = grad;
                ctx.fillRect(tx - r, ty - r, r * 2, r * 2);
            }
            ctx.restore();

            const s = g.size;
            // A startled ghost stretches tall and goes narrow
            const stretch = 1 + g.startle * 0.3;
            const squash = 1 - g.startle * 0.12;

            ctx.save();
            ctx.translate(g.x, g.y + Math.sin(g.bob) * s * 0.1);
            ctx.scale(g.dir * squash, stretch);

            // Halo first, so the body sits inside its own glow
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 2.6);
            halo.addColorStop(0, hwRgba(rgb, a * 0.26));
            halo.addColorStop(0.45, hwRgba(rgb, a * 0.08));
            halo.addColorStop(1, hwRgba(rgb, 0));
            ctx.fillStyle = halo;
            ctx.fillRect(-s * 2.6, -s * 2.6, s * 5.2, s * 5.2);
            ctx.restore();

            // Body: a dome with a rippling scalloped hem
            const body = new Path2D();
            body.moveTo(-s * 0.78, s * 0.25);
            body.bezierCurveTo(-s * 0.9, -s * 0.9, s * 0.9, -s * 0.9, s * 0.78, s * 0.25);

            const lobes = g.lobes;
            const hemY = s * 0.92;
            for (let i = 0; i < lobes; i++) {
                const x0 = s * 0.78 - (s * 1.56) * (i / lobes);
                const x1 = s * 0.78 - (s * 1.56) * ((i + 1) / lobes);
                const mid = (x0 + x1) / 2;
                // Each scallop swings on its own, a little behind its neighbour
                const wave = Math.sin(g.hem + i * 1.5) * s * 0.17;
                body.quadraticCurveTo(mid, hemY + wave + s * 0.4, x1, hemY + wave * 0.5);
            }
            body.closePath();

            ctx.save();
            const sheet = ctx.createLinearGradient(0, -s, 0, s * 1.1);
            sheet.addColorStop(0, hwRgba(hwMixRgb(rgb, [255, 255, 255], 0.5), a * 0.72));
            sheet.addColorStop(0.55, hwRgba(rgb, a * 0.5));
            sheet.addColorStop(1, hwRgba(rgb, a * 0.16));
            ctx.fillStyle = sheet;
            ctx.fill(body);

            // Shimmer: a soft diagonal band sweeping across the sheet
            ctx.clip(body);
            ctx.globalCompositeOperation = 'lighter';
            const k = g.shimmer * 3 - 1;
            const band = ctx.createLinearGradient(
                -s * 1.2 + k * s * 2.4, -s, -s * 0.2 + k * s * 2.4, s);
            band.addColorStop(0, hwRgba(rgb, 0));
            band.addColorStop(0.5, hwRgba([255, 255, 255], a * 0.3));
            band.addColorStop(1, hwRgba(rgb, 0));
            ctx.fillStyle = band;
            ctx.fillRect(-s * 1.2, -s * 1.2, s * 2.4, s * 2.6);
            ctx.restore();

            // Soft edge, brightest along the top
            ctx.strokeStyle = hwRgba(hwMixRgb(rgb, [255, 255, 255], 0.6), a * 0.4);
            ctx.lineWidth = Math.max(0.6, s * 0.05);
            ctx.stroke(body);

            // Face. Dark holes rather than painted features, which is what
            // makes a sheet ghost read as a sheet.
            const eyeY = -s * 0.2;
            const eyeX = s * 0.3;
            const eyeR = s * 0.15;
            const open = g.blink > 0 ? 0.12 : 1;
            ctx.fillStyle = `rgba(16, 10, 34, ${a * 0.75})`;
            for (const side of [-1, 1]) {
                ctx.beginPath();
                ctx.ellipse(side * eyeX, eyeY, eyeR * 0.82, eyeR * open * 1.15,
                    0, 0, Math.PI * 2);
                ctx.fill();
            }
            // Mouth: a small o, rounder when startled
            const mo = 1 + g.startle * 0.9;
            ctx.beginPath();
            ctx.ellipse(0, s * 0.3, s * 0.12, s * 0.16 * mo, 0, 0, Math.PI * 2);
            ctx.fill();

            // Little stub arms
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = hwRgba(rgb, a * 0.42);
            for (const side of [-1, 1]) {
                const lift = Math.sin(g.hem * 0.7 + (side > 0 ? 0 : 1.6)) * s * 0.12;
                ctx.beginPath();
                ctx.ellipse(side * s * 0.82, s * 0.18 + lift, s * 0.2, s * 0.13,
                    side * -0.5, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();
        }
    }
    drawGrass() {
        if (!this.scene || !this.config.grass) return;
        const ctx = this.ctx;
        const t = this.theme;

        for (let band = 3; band <= 4; band++) {
            const off = this.bandOffset(band);
            const y = this.groundY(band);
            ctx.save();
            ctx.translate(off.x, off.y);
            ctx.strokeStyle = hwRgba(this.bandColor(t.tree, band), 0.85);
            ctx.lineCap = 'round';

            for (const g of this.scene.grass) {
                if (g.bandIndex !== band) continue;
                const bend = g.lean + Math.sin(this.time * g.rate + g.phase) * 0.14
                    + this.wind * 0.012 * this.config.wind;
                ctx.lineWidth = g.thick;
                ctx.beginPath();
                ctx.moveTo(g.x, y + 2);
                ctx.quadraticCurveTo(
                    g.x + bend * g.h * 0.3, y - g.h * 0.6,
                    g.x + bend * g.h, y - g.h);
                ctx.stroke();
            }
            ctx.restore();
        }
    }

    drawVines() {
        if (!this.scene || !this.scene.vines.length) return;
        const ctx = this.ctx;
        const t = this.theme;

        for (const v of this.scene.vines) {
            const off = this.bandOffset(v.bandIndex);
            const y = this.groundY(v.bandIndex);
            ctx.save();
            ctx.translate(off.x, off.y);
            ctx.strokeStyle = hwRgba(this.bandColor('#3d4a1c', v.bandIndex), 0.8);
            ctx.lineWidth = 1.6 * HW_BANDS[v.bandIndex].scale;
            ctx.lineCap = 'round';

            ctx.beginPath();
            const steps = 14;
            for (let i = 0; i <= steps; i++) {
                const k = i / steps;
                const x = v.x + v.dir * v.len * k;
                const yy = y - Math.sin(k * 6 + v.wiggle) * 4 - k * 2;
                if (i === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
            }
            ctx.stroke();

            // A few leaves along it
            ctx.fillStyle = hwRgba(this.bandColor('#44521f', v.bandIndex), 0.85);
            for (let i = 1; i <= v.leaves; i++) {
                const k = i / (v.leaves + 1);
                const x = v.x + v.dir * v.len * k;
                const yy = y - Math.sin(k * 6 + v.wiggle) * 4 - k * 2;
                const r = 4 * HW_BANDS[v.bandIndex].scale;
                ctx.beginPath();
                ctx.ellipse(x, yy - r * 0.6, r, r * 0.65,
                    Math.sin(k * 9) * 0.6, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }
    }

    drawCandy() {
        if (!this.candySprites) return;
        const ctx = this.ctx;

        for (const c of this.candy) {
            const sprite = this.candySprites[c.sprite];
            const w = 13 * c.size * c.depth;
            const h = w * (112 / 72);
            // Flipping through depth: the kernel narrows to an edge and back
            const flip = Math.cos(c.flip);

            ctx.save();
            ctx.translate(c.x, c.y);
            ctx.rotate(c.spin);
            ctx.scale(Math.max(0.08, Math.abs(flip)), 1);
            // Far candy sits back in the haze
            ctx.globalAlpha = hwClamp(0.3 + c.depth * 0.38, 0, 1);
            ctx.drawImage(sprite, -w / 2, -h / 2, w, h);
            ctx.restore();
        }
    }

    drawLeaves() {
        if (!this.leafSprites || !this.config.fallingLeaves) return;
        const ctx = this.ctx;

        for (const l of this.leaves) {
            const sprite = this.leafSprites[l.sprite];
            const s = 17 * l.size * l.depth;
            const flip = Math.cos(l.flip);

            ctx.save();
            ctx.translate(l.x, l.y);
            ctx.rotate(l.spin);
            ctx.scale(1, l.grounded ? 0.45 : Math.max(0.12, Math.abs(flip)));
            ctx.globalAlpha = hwClamp(l.life * (0.5 + l.depth * 0.4), 0, 1);
            ctx.drawImage(sprite, -s / 2, -s / 2, s, s);
            ctx.restore();
        }
    }

    // Radials plus rings that sag between them. The sag is what separates a
    // web from a wire wheel, which is what the old concentric polygons were.
    drawWebs() {
        if (!this.webs.length) return;
        const ctx = this.ctx;
        const t = this.theme;
        const moonRgb = hwHexToRgb(t.moon);

        for (const web of this.webs) {
            const wob = Math.sin(web.wobble) * 2.5 + 1;
            const sag = 0.16 * this.config.webSag;

            ctx.save();
            ctx.translate(web.x, web.y);
            ctx.rotate(web.angle);
            ctx.lineCap = 'round';

            // Corner webs span a quarter turn; free-hanging ones a full circle
            const arc = web.corner ? Math.PI * 0.5 : Math.PI * 2;
            const n = web.radials;
            const ang = (i) => web.corner
                ? -Math.PI * 0.25 + arc * (i / (n - 1))
                : arc * (i / n);
            const len = (i) => web.lengths[((i % n) + n) % n] + wob;

            // Radials
            for (let i = 0; i < n; i++) {
                if (i === web.torn) continue;
                ctx.strokeStyle = hwRgba(moonRgb, web.opacity * 0.9);
                ctx.lineWidth = 0.75;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(Math.cos(ang(i)) * len(i), Math.sin(ang(i)) * len(i));
                ctx.stroke();
            }

            // Rings, sagging toward the hub between each pair of radials
            const lastRing = web.corner ? n - 2 : n - 1;
            for (let r = 1; r <= web.rings; r++) {
                const k = Math.pow(r / web.rings, 0.85);
                ctx.strokeStyle = hwRgba(moonRgb, web.opacity * (0.5 + 0.4 * k));
                ctx.lineWidth = 0.6;
                ctx.beginPath();
                let moved = false;

                for (let i = 0; i <= lastRing; i++) {
                    const i2 = i + 1;
                    if (i === web.torn || i2 === web.torn) { moved = false; continue; }
                    const a1 = ang(i), a2 = ang(i2);
                    const r1 = len(i) * k, r2 = len(i2) * k;
                    const x1 = Math.cos(a1) * r1, y1 = Math.sin(a1) * r1;
                    const x2 = Math.cos(a2) * r2, y2 = Math.sin(a2) * r2;

                    // Control point on the chord, pulled in toward the hub
                    const am = (a1 + a2) / 2;
                    const rm = ((r1 + r2) / 2) * (1 - sag);
                    const cx = Math.cos(am) * rm, cy = Math.sin(am) * rm;

                    if (!moved) { ctx.moveTo(x1, y1); moved = true; }
                    ctx.quadraticCurveTo(cx, cy, x2, y2);
                }
                ctx.stroke();
            }

            if (this.config.dew) this.drawDew(web, ang, len, moonRgb);
            if (web.spider) this.drawSpider(web, ang, len);

            ctx.restore();
        }
    }

    drawDew(web, ang, len, moonRgb) {
        const ctx = this.ctx;
        for (const d of web.dew) {
            const k = Math.pow(d.ring / web.rings, 0.85);
            const a1 = ang(d.radial);
            const a2 = ang(d.radial + 1);
            const a = hwLerp(a1, a2, d.t);
            const r = hwLerp(len(d.radial), len(d.radial + 1), d.t) * k
                * (1 - 0.16 * this.config.webSag * (1 - Math.abs(d.t - 0.5) * 2));
            const x = Math.cos(a) * r;
            const y = Math.sin(a) * r;

            // Twinkle: a drop catches the moon only at certain angles
            const spark = 0.45 + 0.55 * Math.pow(Math.max(0, Math.sin(d.twinkle)), 6);
            ctx.fillStyle = hwRgba(moonRgb, hwClamp(web.opacity * 2.4 * spark, 0, 0.9));
            ctx.beginPath();
            ctx.arc(x, y, d.r, 0, Math.PI * 2);
            ctx.fill();
            // Specular pinprick
            ctx.fillStyle = hwRgba([255, 255, 255], hwClamp(spark * 0.7, 0, 0.8));
            ctx.beginPath();
            ctx.arc(x - d.r * 0.3, y - d.r * 0.3, d.r * 0.32, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    drawSpider(web, ang, len) {
        const ctx = this.ctx;
        const t = this.theme;
        const s = web.spider;
        const rgb = hwMixRgb(hwHexToRgb(t.tree), [0, 0, 0], 0.3);

        // Home position on the web, then the drop measured straight down in
        // world space -- so the thread is undone from the web's rotation
        const hx = Math.cos(s.homeAngle) * s.homeR;
        const hy = Math.sin(s.homeAngle) * s.homeR;

        ctx.save();
        ctx.translate(hx, hy);
        ctx.rotate(-web.angle);   // back to screen-upright

        const swing = s.state === 'hang'
            ? Math.sin(this.time * 1.6) * s.drop * 0.04 : 0;

        if (s.drop > 0.5) {
            ctx.strokeStyle = hwRgba(hwHexToRgb(t.moon), web.opacity * 1.2);
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(swing * 0.5, s.drop * 0.5, swing, s.drop);
            ctx.stroke();
        }

        ctx.translate(swing, s.drop);
        const r = s.size;

        // Legs, two sets of four, cycling
        ctx.strokeStyle = hwRgba(rgb, 0.95);
        ctx.lineWidth = Math.max(0.5, r * 0.18);
        ctx.lineCap = 'round';
        for (let side = -1; side <= 1; side += 2) {
            for (let i = 0; i < 4; i++) {
                const base = (i - 1.5) * 0.42;
                const step = Math.sin(s.legPhase + i * 1.3 + (side > 0 ? Math.PI : 0)) * 0.22;
                const a = base + step;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.quadraticCurveTo(
                    side * r * 1.3 * Math.cos(a), r * 1.3 * Math.sin(a) - r * 0.9,
                    side * r * 2.2 * Math.cos(a), r * 2.2 * Math.sin(a) + r * 0.5);
                ctx.stroke();
            }
        }

        ctx.fillStyle = hwRgba(rgb, 1);
        ctx.beginPath();
        ctx.ellipse(0, r * 0.35, r * 0.85, r * 0.95, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(0, -r * 0.5, r * 0.5, r * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    drawLightningPass() {
        const L = this.lightning;
        if (L.level <= 0.004) return;
        const ctx = this.ctx;
        const t = this.theme;
        const lv = L.level;
        const boltRgb = hwHexToRgb(t.bolt);

        ctx.save();

        // A real flash floods the scene with cold light, which washes the
        // warm lantern colour out of it. Setting saturation to zero through
        // the blend mode does that properly rather than faking it with grey.
        ctx.globalCompositeOperation = 'saturation';
        ctx.globalAlpha = hwClamp(lv * 0.55, 0, 1);
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, this.w, this.h);

        // Backlit skyline rim
        if (this.skylineCanvas) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = hwClamp(lv * 0.5, 0, 1);
            ctx.drawImage(this.skylineCanvas, -HW_MARGIN + this.pan.x * 0.1, this.pan.y * 0.1);
        }

        // Sky wash, strongest at the horizon where the storm sits
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1;
        const wash = ctx.createLinearGradient(0, 0, 0, this.horizonY * 1.2);
        wash.addColorStop(0, hwRgba(boltRgb, lv * 0.1));
        wash.addColorStop(0.7, hwRgba(boltRgb, lv * 0.3));
        wash.addColorStop(1, hwRgba(boltRgb, lv * 0.06));
        ctx.fillStyle = wash;
        ctx.fillRect(0, 0, this.w, this.horizonY * 1.2);

        if (L.bolt && L.t < 0.42) {
            const fade = hwClamp(1 - L.t / 0.42, 0, 1);
            ctx.globalAlpha = fade;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            // Glow pass, then the core, so the bolt sits in its own light
            for (const pass of [
                { w: L.bolt.width * 7, a: 0.16, c: boltRgb },
                { w: L.bolt.width * 2.6, a: 0.5, c: boltRgb },
                { w: L.bolt.width, a: 1, c: [255, 255, 255] }
            ]) {
                ctx.strokeStyle = hwRgba(pass.c, pass.a);
                ctx.lineWidth = pass.w;
                ctx.beginPath();
                ctx.moveTo(L.bolt.pts[0][0], L.bolt.pts[0][1]);
                for (const p of L.bolt.pts) ctx.lineTo(p[0], p[1]);
                for (const br of L.bolt.branches) {
                    ctx.moveTo(br[0][0], br[0][1]);
                    for (const p of br) ctx.lineTo(p[0], p[1]);
                }
                ctx.stroke();
            }
        }

        ctx.restore();
    }

    // -----------------------------------------------------------------------
    // Post-processing
    // -----------------------------------------------------------------------

    post() {
        if (this.config.bloom && this.bloomA && this.bloomB && this.bloomT) this.applyBloom();

        const ctx = this.ctx;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        if (this.vignetteCanvas) {
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
            ctx.drawImage(this.vignetteCanvas, 0, 0, this.canvas.width, this.canvas.height);
        }

        if (this.config.grain > 0 && this.grainCanvas) {
            if (!this.grainPattern) {
                this.grainPattern = ctx.createPattern(this.grainCanvas, 'repeat');
            }
            if (this.grainPattern) {
                ctx.globalCompositeOperation = 'overlay';
                ctx.globalAlpha = this.config.grain * 0.5;
                // Scroll the tile each frame so the grain does not sit still
                ctx.translate(-Math.random() * 128, -Math.random() * 128);
                ctx.fillStyle = this.grainPattern;
                ctx.fillRect(0, 0, this.canvas.width + 128, this.canvas.height + 128);
            }
        }

        ctx.restore();
    }

    // Bloom without a shader: downscale, multiply by a blurred copy of itself
    // to suppress the darks (an approximate threshold), blur again, then add
    // it back. Five cheap blits instead of a per-pixel pass.
    applyBloom() {
        const a = this.bloomA;
        const b = this.bloomB;
        const t = this.bloomT;
        const ac = a.getContext('2d');
        const bc = b.getContext('2d');
        const tc = t.getContext('2d');

        ac.setTransform(1, 0, 0, 1, 0, 0);
        ac.globalCompositeOperation = 'source-over';
        ac.globalAlpha = 1;
        ac.clearRect(0, 0, a.width, a.height);
        ac.drawImage(this.canvas, 0, 0, a.width, a.height);

        // Threshold. Multiplying the frame by two unblurred copies of itself
        // cubes every channel: a 0.3 midtone falls to 0.03 and the night sky
        // drops out entirely, while a 0.95 flame core only falls to 0.86.
        // Multiplying by a *blurred* copy instead is far too gentle -- it
        // lifts the whole frame into haze rather than picking out the lit parts.
        tc.setTransform(1, 0, 0, 1, 0, 0);
        tc.globalCompositeOperation = 'source-over';
        tc.globalAlpha = 1;
        tc.clearRect(0, 0, t.width, t.height);
        tc.drawImage(a, 0, 0);

        ac.globalCompositeOperation = 'multiply';
        ac.drawImage(t, 0, 0);
        ac.drawImage(t, 0, 0);

        // Blur by a round trip through half resolution
        bc.setTransform(1, 0, 0, 1, 0, 0);
        bc.globalCompositeOperation = 'source-over';
        bc.globalAlpha = 1;
        bc.clearRect(0, 0, b.width, b.height);
        bc.drawImage(a, 0, 0, b.width, b.height);

        const ctx = this.ctx;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = hwClamp(0.5 * this.config.bloomStrength, 0, 1);
        ctx.drawImage(b, 0, 0, this.canvas.width, this.canvas.height);
        ctx.restore();
    }

    // -----------------------------------------------------------------------
    // Interaction
    // -----------------------------------------------------------------------

    setupInteraction() {
        this.teardownInteraction();
        if (!this.config.interactive) return;

        const move = (e) => {
            if (this.pointer.inside && this.pointer.down) {
                // Dragging drives the wind, which the candy, leaves, fog and
                // grass all already read from
                const dx = e.clientX - this.pointer.x;
                this.windTarget = hwClamp(this.windTarget + dx * 1.6, -220, 220);
            }
            this.pointer.x = e.clientX;
            this.pointer.y = e.clientY;
            this.pointer.inside = true;
        };

        const leave = () => { this.pointer.inside = false; };
        const down = () => { this.pointer.down = true; };
        const up = () => { this.pointer.down = false; };

        const isUi = (e) => e.target && e.target.closest
            && e.target.closest('a,button,input,select,textarea,label,[role="button"]');

        const click = (e) => {
            if (isUi(e)) return;

            if (this.config.clickToToggle) {
                // Nearest lantern within reach gets struck or snuffed
                let best = null;
                let bestD = Infinity;
                for (const p of this.pumpkins) {
                    const off = this.bandOffset(p.bandIndex);
                    const d = Math.hypot(
                        e.clientX - (p.x + off.x),
                        e.clientY - (p.y + off.y - p.scale * p.squat));
                    const reach = Math.max(42, p.scale * 1.6);
                    if (d < reach && d < bestD) { bestD = d; best = p; }
                }
                if (best) {
                    best.lit = !best.lit;
                    if (best.lit) best.relight = 0.05;
                    return;
                }
            }

            // Otherwise a gust, which scatters the candy and kicks the leaves
            this.gusts.push({
                x: e.clientX, y: e.clientY,
                r: 20, speed: 420, strength: 0.9, t: 0, life: 0.8
            });
        };

        const dbl = (e) => {
            if (isUi(e)) return;
            if (this.config.lightning) this.strike();
        };

        const bind = (target, type, fn, opts) => {
            target.addEventListener(type, fn, opts);
            this.listeners.push([target, type, fn, opts]);
        };

        bind(document, 'mousemove', move, { passive: true });
        bind(document, 'mouseleave', leave);
        bind(document, 'mousedown', down, { passive: true });
        bind(document, 'mouseup', up, { passive: true });
        bind(document, 'click', click);
        bind(document, 'dblclick', dbl);
    }

    teardownInteraction() {
        for (const [target, type, fn, opts] of this.listeners) {
            target.removeEventListener(type, fn, opts);
        }
        this.listeners = [];
    }

    // -----------------------------------------------------------------------
    // Settings dialog
    //
    // The controls are declared as data and the markup generated from it:
    // there are forty of them, and hand-written rows for each drowned the
    // interesting part of this file in the previous version.
    // -----------------------------------------------------------------------

    controlSpec() {
        const themeOptions = Object.keys(HW_THEMES)
            .map(k => ({ value: k, label: HW_THEMES[k].label }));
        const presetOptions = Object.keys(HW_PRESETS)
            .map(k => ({ value: k, label: HW_PRESETS[k].label }));

        const pct = (v) => `${Math.round(v * 100)}%`;
        const one = (v) => Number(v).toFixed(1);
        const int = (v) => String(Math.round(v));

        return [
            { section: '🌙 Scene' },
            { key: 'theme', label: 'Night', type: 'select', options: themeOptions, rebuild: true },
            { key: 'scenePreset', label: 'Setting', type: 'select', options: presetOptions, rebuild: true },
            { key: 'castle', label: 'Castle on the hill', type: 'check', rebuild: true },
            { key: 'castleSize', label: 'Castle Size', min: 0.4, max: 2.2, step: 0.1, format: one, rebuild: true },
            { key: 'horizon', label: 'Horizon Height', min: 0.35, max: 0.8, step: 0.01, format: pct, rebuild: true },
            { key: 'parallax', label: 'Parallax Depth', min: 0, max: 2, step: 0.1, format: one },
            { key: 'grass', label: 'Foreground Grass', type: 'check', rebuild: true },

            { section: '🎃 Jack-o\'-Lanterns' },
            { key: 'pumpkinCount', label: 'Count', min: 0, max: 40, step: 1, format: int, rebuild: true },
            { key: 'pumpkinSize', label: 'Size', min: 0.4, max: 2, step: 0.1, format: one },
            { key: 'litFraction', label: 'Share Lit', min: 0, max: 1, step: 0.05, format: pct, rebuild: true },
            { key: 'lightIntensity', label: 'Light Strength', min: 0.2, max: 2.5, step: 0.1, format: one },
            { key: 'flicker', label: 'Candle Flicker', min: 0, max: 2.5, step: 0.1, format: one },
            { key: 'faceLight', label: 'Light thrown from the carving', type: 'check' },
            { key: 'breathing', label: 'Pulse travelling across the patch', type: 'check' },

            { section: '✨ Sky' },
            { key: 'moon', label: 'Moon', type: 'check', rebuild: true },
            { key: 'moonPhase', label: 'Moon Phase', min: 0.1, max: 1, step: 0.02, format: pct, rebuild: true },
            { key: 'starCount', label: 'Stars', min: 0, max: 600, step: 20, format: int, rebuild: true },
            { key: 'cloudBands', label: 'Cloud bands drifting past the moon', type: 'check', rebuild: true },

            { section: '🌫️ Weather' },
            { key: 'fog', label: 'Ground Fog', type: 'check', rebuild: true },
            { key: 'fogDensity', label: 'Fog Density', min: 0.1, max: 2.5, step: 0.1, format: one },
            { key: 'wind', label: 'Wind', min: 0, max: 2.5, step: 0.1, format: one },
            { key: 'lightning', label: 'Distant Lightning', type: 'check' },
            { key: 'lightningRate', label: 'Storm Frequency', min: 0.2, max: 4, step: 0.2, format: one },

            { section: '🦇 Inhabitants' },
            { key: 'bats', label: 'Bats', type: 'check', rebuild: true },
            { key: 'batCount', label: 'Bat Count', min: 1, max: 480, step: 1, format: int, rebuild: true },
            { key: 'ghosts', label: 'Ghost Wisps', type: 'check', rebuild: true },
            { key: 'ghostCount', label: 'Wisp Count', min: 1, max: 12, step: 1, format: int, rebuild: true },
            { key: 'zombies', label: 'Zombies', type: 'check', rebuild: true },
            { key: 'zombieCount', label: 'Zombie Count', min: 1, max: 15, step: 1, format: int, rebuild: true },

            { section: '🕸️ Webs' },
            { key: 'webs', label: 'Spider Webs', type: 'check', rebuild: true },
            { key: 'webCount', label: 'Web Count', min: 0, max: 14, step: 1, format: int, rebuild: true },
            { key: 'webOpacity', label: 'Web Visibility', min: 0.05, max: 0.9, step: 0.05, format: pct, rebuild: true },
            { key: 'webSag', label: 'Strand Sag', min: 0, max: 2.5, step: 0.1, format: one },
            { key: 'dew', label: 'Dew catching the moonlight', type: 'check', rebuild: true },
            { key: 'spiders', label: 'Spiders on their threads', type: 'check', rebuild: true },

            { section: '🍬 Falling' },
            { key: 'candyCount', label: 'Candy Corn', min: 0, max: 200, step: 10, format: int, rebuild: true },
            { key: 'candyFallSpeed', label: 'Fall Speed', min: 0.3, max: 5, step: 0.1, format: one },
            { key: 'candySize', label: 'Candy Size', min: 0.4, max: 2.5, step: 0.1, format: one },
            { key: 'fallingLeaves', label: 'Dead Leaves', type: 'check', rebuild: true },
            { key: 'leafCount', label: 'Leaf Count', min: 0, max: 160, step: 10, format: int, rebuild: true },

            { section: '🎛️ Rendering' },
            {
                key: 'quality', label: 'Quality', type: 'select', options: [
                    { value: 'auto', label: '🎚️ Auto (match the frame rate)' },
                    { value: 'high', label: '💎 High (full resolution)' },
                    { value: 'balanced', label: '⚖️ Balanced' },
                    { value: 'performance', label: '🚀 Performance' }
                ]
            },
            { key: 'bloom', label: 'Bloom around the lit areas', type: 'check', rebuild: true },
            { key: 'bloomStrength', label: 'Bloom Strength', min: 0.1, max: 2, step: 0.1, format: one },
            { key: 'vignette', label: 'Vignette', type: 'check', rebuild: true },
            { key: 'grain', label: 'Film Grain', min: 0, max: 1, step: 0.05, format: pct },

            { section: '🖱️ Interaction' },
            { key: 'interactive', label: 'Respond to the cursor', type: 'check', rebuild: true },
            { key: 'clickToToggle', label: 'Click a lantern to light or snuff it', type: 'check' }
        ];
    }

    showConfigDialog() {
        if (document.getElementById('halloween-config-modal')) return;

        const spec = this.controlSpec();
        const c = this.config;

        const modal = document.createElement('div');
        modal.id = 'halloween-config-modal';
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.5); display: flex; align-items: center;
            justify-content: center; z-index: 1000;
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: var(--dark-surface); border: 1px solid var(--gray-700);
            border-radius: 0.5rem; padding: 1.5rem; min-width: 460px; max-width: 540px;
            color: var(--light-text); max-height: 84vh; overflow-y: auto;
        `;

        const rows = spec.map(s => {
            if (s.section) {
                return `<h4 style="margin: 1.4rem 0 0.7rem 0; padding-bottom: 0.3rem;
                    border-bottom: 1px solid var(--gray-700); color: var(--gray-300);
                    font-size: 0.85rem; letter-spacing: 0.04em; text-transform: uppercase;">
                    ${s.section}</h4>`;
            }

            const id = `hw-${s.key}`;
            if (s.type === 'check') {
                return `<div style="margin-bottom: 0.6rem;">
                    <label style="display: flex; align-items: center; color: var(--gray-300); font-size: 0.9rem;">
                        <input type="checkbox" id="${id}" ${c[s.key] ? 'checked' : ''}
                               style="margin-right: 0.5rem;">
                        ${s.label}
                    </label></div>`;
            }

            if (s.type === 'select') {
                const opts = s.options.map(o =>
                    `<option value="${o.value}" ${c[s.key] === o.value ? 'selected' : ''}>${o.label}</option>`
                ).join('');
                return `<div style="margin-bottom: 0.85rem;">
                    <label style="display: block; margin-bottom: 0.3rem; color: var(--gray-300); font-size: 0.9rem;">
                        ${s.label}</label>
                    <select id="${id}" style="width: 100%; padding: 0.3rem;
                        background: var(--gray-600); color: var(--light-text);
                        border: 1px solid var(--gray-500); border-radius: 0.25rem;">
                        ${opts}</select></div>`;
            }

            return `<div style="margin-bottom: 0.85rem;">
                <label style="display: block; margin-bottom: 0.3rem; color: var(--gray-300); font-size: 0.9rem;">
                    ${s.label}: <span id="${id}-value">${s.format(c[s.key])}</span></label>
                <input type="range" id="${id}" min="${s.min}" max="${s.max}" step="${s.step}"
                       value="${c[s.key]}" style="width: 100%;"></div>`;
        }).join('');

        dialog.innerHTML = `
            <h3 style="margin: 0 0 0.25rem 0; color: var(--light-text); font-size: 1.25rem;">
                🎃 Halloween Night
            </h3>
            <p style="margin: 0 0 0.5rem 0; color: var(--gray-400); font-size: 0.8rem;">
                Click a lantern to light or snuff it &nbsp;•&nbsp; click the ground for a gust
                &nbsp;•&nbsp; double-click for lightning &nbsp;•&nbsp; drag to raise the wind
            </p>
            ${rows}
            <div style="display: flex; gap: 0.5rem; margin-top: 1.5rem; justify-content: flex-end;">
                <button id="hw-reseed" style="padding: 0.5rem 1rem; background: var(--gray-600); color: white; border: none; border-radius: 0.25rem; cursor: pointer;">
                    🎲 New Scene
                </button>
                <button id="hw-reset" style="padding: 0.5rem 1rem; background: var(--gray-600); color: white; border: none; border-radius: 0.25rem; cursor: pointer;">
                    Reset
                </button>
                <button id="hw-cancel" style="padding: 0.5rem 1rem; background: var(--gray-600); color: white; border: none; border-radius: 0.25rem; cursor: pointer;">
                    Cancel
                </button>
                <button id="hw-apply" style="padding: 0.5rem 1rem; background: var(--accent-blue); color: white; border: none; border-radius: 0.25rem; cursor: pointer;">
                    Apply
                </button>
            </div>
        `;

        modal.appendChild(dialog);
        document.body.appendChild(modal);

        // Live value readouts
        for (const s of spec) {
            if (s.section || s.type) continue;
            const el = dialog.querySelector(`#hw-${s.key}`);
            const out = dialog.querySelector(`#hw-${s.key}-value`);
            if (el && out) {
                el.addEventListener('input', (e) => {
                    out.textContent = s.format(parseFloat(e.target.value));
                });
            }
        }

        const close = () => modal.remove();

        const readDialog = () => {
            const next = {};
            for (const s of spec) {
                if (s.section) continue;
                const el = dialog.querySelector(`#hw-${s.key}`);
                if (!el) continue;
                if (s.type === 'check') next[s.key] = el.checked;
                else if (s.type === 'select') next[s.key] = el.value;
                else next[s.key] = parseFloat(el.value);
            }
            return next;
        };

        dialog.querySelector('#hw-apply').addEventListener('click', () => {
            const next = readDialog();
            // Anything that changes what gets baked needs the caches thrown
            // away; the rest takes effect on the next frame on its own
            const heavy = this.config.quality !== next.quality
                || this.spec_needsRebuild(spec, next);
            this.saveConfig(next);
            if (this.isRunning && heavy) this.restart();
            close();
        });

        dialog.querySelector('#hw-reset').addEventListener('click', () => {
            const seed = this.activeSeed;
            this.config = this.defaultConfig();
            this.saveConfig();
            this.activeSeed = seed;
            if (this.isRunning) this.restart();
            close();
        });

        dialog.querySelector('#hw-reseed').addEventListener('click', () => {
            this.saveConfig(readDialog());
            this.activeSeed = null;
            if (this.isRunning) this.restart();
            close();
        });

        dialog.querySelector('#hw-cancel').addEventListener('click', close);
        modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    }

    spec_needsRebuild(spec, next) {
        for (const s of spec) {
            if (s.section || !s.rebuild) continue;
            if (this.config[s.key] !== next[s.key]) return true;
        }
        return false;
    }

    // Rebuild in place, keeping the scene seed so only what changed changes.
    restart() {
        const seed = this.activeSeed;
        this.stop();
        this.activeSeed = seed;
        this.start();
    }
}

// The homepage instantiates this itself; the standalone page uses the same
// class, so only expose it when a module system is actually present.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = HalloweenAnimationManager;
}
