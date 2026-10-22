// Fireplace Animation Module
//
// The flames are a particle system, but the particles are never drawn straight
// onto the page canvas. They go into a low-resolution offscreen buffer that is
// scaled back up with smoothing, and that upscale is what turns a cloud of
// hard-edged sprites into something gassy and translucent. Two buffers are kept
// rather than one so part of the fire can be drawn behind the logs and part in
// front, which is what makes the flames look like they wrap around the wood
// instead of sitting flat behind it.

// Flame colour is mostly blackbody emission from glowing soot, so each palette
// is a heating curve read coolest-first: dull red at the cooling tips, through
// orange, to a near-white core. Only driftwood breaks from blackbody, because
// the sea salts in it emit at their own lines rather than thermally.
const FIREPLACE_PALETTES = {
    hardwood: {
        stops: [
            [0.00, 18, 4, 2],
            [0.16, 84, 14, 4],
            [0.32, 166, 40, 8],
            [0.50, 224, 92, 14],
            [0.68, 252, 152, 32],
            [0.85, 255, 208, 104],
            [1.00, 255, 246, 210]
        ],
        ember: [255, 118, 28],
        spark: [255, 208, 132],
        glow: [255, 138, 48]
    },
    softwood: {
        // Resinous wood burns hotter and yellower, and throws far more sparks
        stops: [
            [0.00, 22, 6, 2],
            [0.16, 104, 22, 4],
            [0.32, 194, 62, 10],
            [0.50, 240, 128, 20],
            [0.68, 255, 186, 56],
            [0.85, 255, 228, 148],
            [1.00, 255, 252, 232]
        ],
        ember: [255, 140, 42],
        spark: [255, 226, 168],
        glow: [255, 158, 62]
    },
    ember: {
        // A fire that has burned down: low, deep, mostly coals
        stops: [
            [0.00, 14, 3, 2],
            [0.18, 68, 10, 3],
            [0.36, 132, 26, 6],
            [0.56, 186, 54, 10],
            [0.74, 224, 96, 22],
            [0.90, 244, 146, 52],
            [1.00, 255, 196, 108]
        ],
        ember: [232, 88, 20],
        spark: [255, 168, 90],
        glow: [226, 96, 30]
    },
    driftwood: {
        // Salt-laden wood: copper and sodium push the flame green and blue
        stops: [
            [0.00, 6, 14, 12],
            [0.16, 18, 62, 52],
            [0.32, 30, 122, 96],
            [0.50, 62, 178, 130],
            [0.68, 120, 214, 168],
            [0.85, 190, 238, 214],
            [1.00, 240, 252, 246]
        ],
        ember: [255, 132, 44],
        spark: [188, 240, 210],
        glow: [96, 190, 158]
    }
};

const FIREPLACE_SPRITE_LEVELS = 26;
const FIREPLACE_SPRITE_SIZE = 48;

// Three brick-wall tiers, coolest/faintest first. Each is a plain parameter
// set rather than a distinct code path, so the wall painter stays a single
// function regardless of how many tiers exist.
const FIREPLACE_BRICK_STYLES = {
    subtle: {
        mortarColor: '#141110',
        base: { r: 46, g: 28, b: 24 },
        variance: 8,
        mortarWidth: 4,
        shadeTop: 0.015,
        shadeBottom: 0.08,
        sootAlpha: 0.78,
        recede: 0.5
    },
    semi: {
        mortarColor: '#181412',
        base: { r: 66, g: 40, b: 33 },
        variance: 14,
        mortarWidth: 4,
        shadeTop: 0.02,
        shadeBottom: 0.1,
        sootAlpha: 0.7,
        recede: 0.28
    },
    visible: {
        mortarColor: '#241e1b',
        base: { r: 120, g: 58, b: 42 },
        variance: 34,
        mortarWidth: 5,
        shadeTop: 0.05,
        shadeBottom: 0.18,
        sootAlpha: 0.55,
        recede: 0
    }
};

class FireplaceAnimationManager {
    constructor(host) {
        this.host = host;
        this.canvas = null;
        this.ctx = null;

        // Low-resolution flame buffers, one for each side of the log stack
        this.backBuffer = null;
        this.backCtx = null;
        this.frontBuffer = null;
        this.frontCtx = null;

        // The log art is expensive to draw and never changes, so it is painted
        // once into a full-resolution buffer; only the ember glow on top of it
        // is redrawn each frame
        this.logBuffer = null;
        this.logCtx = null;

        // Same idea for the brick wall: a static pattern baked once, then just
        // blitted behind everything each frame so the existing 'lighter' room
        // glow lights it without any extra per-frame cost
        this.brickBuffer = null;
        this.brickCtx = null;

        this.flames = [];
        this.sparks = [];
        this.smoke = [];
        this.coals = [];
        this.logs = [];
        this.emitters = [];
        this.popBursts = [];   // brief crack-pop flashes/shockwaves
        this.popTimer = 0;

        this.companion = null;
        this.decorations = null;
        this.decorTheme = 'none';

        this.flameSprites = [];
        this.smokeSprite = null;

        this.isEnabled = false;
        this.animationId = null;

        this.lastTime = 0;
        this.elapsed = 0;
        this.flameCarry = 0;
        this.sparkCarry = 0;

        this.fireIntensity = 1;   // smoothed whole-fire brightness, drives the room glow
        this.draft = 0;
        this.draftTarget = 0;
        this.draftTimer = 0;

        this.bedTop = 0;

        this.noiseField = null;
        this.noiseSize = 128;

        this.config = WP.settings.load();
    }

    saveConfig() {
        WP.settings.save(this.config);
    }

    groundLevel() {
        const barHeight = this.host.insets.bottom;
        return this.canvas.height - barHeight;
    }

    palette() {
        return FIREPLACE_PALETTES[this.config.palette] || FIREPLACE_PALETTES.hardwood;
    }

    // ---------------------------------------------------------------- noise

    // Turbulence is sampled several thousand times a frame, so it reads from a
    // small pre-generated field rather than computing a hash per lookup
    buildNoiseField() {
        const size = this.noiseSize;
        this.noiseField = new Float32Array(size * size);
        for (let i = 0; i < size * size; i++) {
            this.noiseField[i] = Math.random();
        }
    }

    sampleNoise(x, y) {
        const size = this.noiseSize;
        const field = this.noiseField;

        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const fx = x - x0;
        const fy = y - y0;

        const u = fx * fx * (3 - 2 * fx);
        const v = fy * fy * (3 - 2 * fy);

        const xi = ((x0 % size) + size) % size;
        const yi = ((y0 % size) + size) % size;
        const xj = (xi + 1) % size;
        const yj = (yi + 1) % size;

        const a = field[yi * size + xi];
        const b = field[yi * size + xj];
        const c = field[yj * size + xi];
        const d = field[yj * size + xj];

        const top = a + (b - a) * u;
        const bottom = c + (d - c) * u;
        return top + (bottom - top) * v;
    }

    // Logs should survive a window resize looking like the same logs, so their
    // shape comes from a seeded generator rather than Math.random
    seededRandom(seed) {
        let a = seed | 0;
        return function () {
            a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // ------------------------------------------------------------- sprites

    sampleTemperature(t) {
        const stops = this.palette().stops;
        const clamped = Math.max(0, Math.min(1, t));

        for (let i = 1; i < stops.length; i++) {
            if (clamped <= stops[i][0] || i === stops.length - 1) {
                const lo = stops[i - 1];
                const hi = stops[i];
                const span = hi[0] - lo[0];
                const k = span > 0 ? (clamped - lo[0]) / span : 0;
                return [
                    Math.round(lo[1] + (hi[1] - lo[1]) * k),
                    Math.round(lo[2] + (hi[2] - lo[2]) * k),
                    Math.round(lo[3] + (hi[3] - lo[3]) * k)
                ];
            }
        }
        return [stops[0][1], stops[0][2], stops[0][3]];
    }

    buildSprites() {
        this.flameSprites = [];

        for (let i = 0; i < FIREPLACE_SPRITE_LEVELS; i++) {
            const t = i / (FIREPLACE_SPRITE_LEVELS - 1);
            // `heat` shifts the whole particle population up the ramp, which is
            // baked in here rather than applied per particle
            const shifted = Math.min(1, Math.pow(t, 1 / Math.max(0.3, this.config.heat)));
            const [r, g, b] = this.sampleTemperature(shifted);

            const sprite = document.createElement('canvas');
            sprite.width = FIREPLACE_SPRITE_SIZE;
            sprite.height = FIREPLACE_SPRITE_SIZE;
            const sctx = sprite.getContext('2d');

            const half = FIREPLACE_SPRITE_SIZE / 2;
            const gradient = sctx.createRadialGradient(half, half, 0, half, half, half);
            gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 1)`);
            gradient.addColorStop(0.24, `rgba(${r}, ${g}, ${b}, 0.62)`);
            gradient.addColorStop(0.58, `rgba(${r}, ${g}, ${b}, 0.16)`);
            gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

            sctx.fillStyle = gradient;
            sctx.fillRect(0, 0, FIREPLACE_SPRITE_SIZE, FIREPLACE_SPRITE_SIZE);

            this.flameSprites.push(sprite);
        }

        const smoke = document.createElement('canvas');
        smoke.width = FIREPLACE_SPRITE_SIZE;
        smoke.height = FIREPLACE_SPRITE_SIZE;
        const smctx = smoke.getContext('2d');
        const half = FIREPLACE_SPRITE_SIZE / 2;
        const smokeGradient = smctx.createRadialGradient(half, half, 0, half, half, half);
        smokeGradient.addColorStop(0, 'rgba(40, 36, 34, 0.55)');
        smokeGradient.addColorStop(0.5, 'rgba(32, 28, 27, 0.22)');
        smokeGradient.addColorStop(1, 'rgba(24, 22, 21, 0)');
        smctx.fillStyle = smokeGradient;
        smctx.fillRect(0, 0, FIREPLACE_SPRITE_SIZE, FIREPLACE_SPRITE_SIZE);
        this.smokeSprite = smoke;
    }

    spriteFor(temperature) {
        const index = Math.round(Math.max(0, Math.min(1, temperature)) * (FIREPLACE_SPRITE_LEVELS - 1));
        return this.flameSprites[index];
    }

    // -------------------------------------------------------------- canvas

    async init() {
        this.createCanvas();
        this.buildNoiseField();
        this.buildSprites();
        this.rebuildScene();
        console.log('Fireplace animation manager initialized');
    }

    createCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'fireplace-canvas';
        this.canvas.style.position = 'fixed';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.pointerEvents = 'none';
        this.canvas.style.zIndex = '-1';
        this.canvas.style.display = 'none';

        this.ctx = this.canvas.getContext('2d');

        this.backBuffer = document.createElement('canvas');
        this.backCtx = this.backBuffer.getContext('2d');
        this.frontBuffer = document.createElement('canvas');
        this.frontCtx = this.frontBuffer.getContext('2d');
        this.logBuffer = document.createElement('canvas');
        this.logCtx = this.logBuffer.getContext('2d');
        this.brickBuffer = document.createElement('canvas');
        this.brickCtx = this.brickBuffer.getContext('2d');

        document.body.appendChild(this.canvas);

        this.resizeCanvas();
        window.addEventListener('resize', () => {
            this.resizeCanvas();
            this.rebuildScene();
        });
    }

    resizeCanvas() {
        if (!this.canvas) return;

        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;

        const scale = Math.max(1, this.config.softness);
        this.backBuffer.width = Math.max(1, Math.ceil(this.canvas.width / scale));
        this.backBuffer.height = Math.max(1, Math.ceil(this.canvas.height / scale));
        this.frontBuffer.width = this.backBuffer.width;
        this.frontBuffer.height = this.backBuffer.height;

        this.logBuffer.width = this.canvas.width;
        this.logBuffer.height = this.canvas.height;

        this.brickBuffer.width = this.canvas.width;
        this.brickBuffer.height = this.canvas.height;
    }

    // Everything that depends on the canvas size or on log settings: the log
    // stack, the coal bed, the flame roots along it
    rebuildScene() {
        if (!this.canvas) return;

        this.buildLogs();
        this.buildCoals();
        this.buildEmitters();
        this.renderLogBuffer();
        this.renderBrickWall();
        this.buildCompanion();
        this.buildDecorations();
    }

    start() {
        if (this.isEnabled) return;

        this.isEnabled = true;
        this.canvas.style.display = 'block';

        this.flames = [];
        this.sparks = [];
        this.smoke = [];
        this.popBursts = [];
        this.popTimer = 6 + Math.random() * 10;
        this.lastTime = 0;
        this.elapsed = 0;
        this.flameCarry = 0;
        this.sparkCarry = 0;

        if (!this.noiseField) this.buildNoiseField();
        if (this.flameSprites.length === 0) this.buildSprites();
        this.rebuildScene();

        this.animate();
        console.log('Fireplace animation started');
    }

    stop() {
        if (!this.isEnabled) return;

        this.isEnabled = false;
        this.canvas.style.display = 'none';

        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        console.log('Fireplace animation stopped');
    }

    // ----------------------------------------------------------------- logs

    buildLogs() {
        this.logs = [];
        if (!this.config.showLogs) {
            this.bedTop = this.groundLevel() - 18;
            return;
        }

        const width = this.canvas.width;
        const ground = this.groundLevel();
        const random = this.seededRandom(1337 + this.config.logCount * 7919);

        // Narrow windows get proportionally smaller wood, otherwise five logs
        // across a phone-width canvas look like tree trunks
        const scale = this.config.logScale * Math.min(1, Math.max(0.62, width / 1400));
        const count = Math.max(2, Math.round(this.config.logCount));

        const baseRadius = 34 * scale * this.config.logThickness;
        const baseLength = width / (count - 0.7);

        // Bottom row: mostly buried in the ash, running the full width
        for (let i = 0; i < count; i++) {
            const radius = baseRadius * (0.86 + random() * 0.3);
            const length = baseLength * (0.9 + random() * 0.28);
            this.logs.push(this.makeLog({
                cx: -baseLength * 0.35 + baseLength * i + (random() - 0.5) * baseLength * 0.15,
                cy: ground - radius * 0.5,
                length,
                radius,
                angle: (random() - 0.5) * 0.1,
                random
            }));
        }

        // Upper row: crossed over the seams of the row below, tilted harder
        const upperRadius = baseRadius * 0.82;
        const upperCount = Math.max(1, count - 1);
        const upperLength = width / (upperCount - 0.5);
        for (let i = 0; i < upperCount; i++) {
            const radius = upperRadius * (0.82 + random() * 0.32);
            const length = upperLength * (0.82 + random() * 0.3);
            this.logs.push(this.makeLog({
                cx: -upperLength * 0.1 + upperLength * i + (random() - 0.5) * upperLength * 0.22,
                cy: ground - baseRadius * 1.05 - radius * (0.5 + random() * 0.3),
                length,
                radius,
                angle: (random() - 0.5) * 0.28,
                random
            }));
        }

        // A sparse capping row of split wood once the stack is big enough
        if (count >= 7) {
            const capCount = Math.max(1, Math.round(count / 2));
            const capSpan = width / capCount;
            for (let i = 0; i < capCount; i++) {
                const radius = baseRadius * (0.5 + random() * 0.22);
                this.logs.push(this.makeLog({
                    cx: capSpan * (i + 0.5) + (random() - 0.5) * capSpan * 0.4,
                    cy: ground - baseRadius * 2.0 - radius * 0.6,
                    length: capSpan * (0.55 + random() * 0.35),
                    radius,
                    angle: (random() - 0.5) * 0.5,
                    random
                }));
            }
        }

        this.bedTop = this.logs.reduce((top, log) => Math.min(top, log.cy - log.radius), ground);
    }

    makeLog({ cx, cy, length, radius, angle, random }) {
        const log = {
            cx,
            cy,
            length,
            radius,
            angle,
            seed: random() * 1000,
            bark: [],
            char: [],
            ash: [],
            cracks: []
        };

        // Bark runs as long striations down the length of the log
        const barkCount = Math.round(14 + radius * 0.5);
        for (let i = 0; i < barkCount; i++) {
            log.bark.push({
                y: (random() * 2 - 1) * radius * 0.88,
                x0: -length / 2 + random() * length * 0.3,
                x1: length / 2 - random() * length * 0.3,
                width: 0.6 + random() * 2.2,
                dark: random() < 0.7,
                alpha: 0.12 + random() * 0.3
            });
        }

        // Charring sits on the upper surfaces where the flame actually licks
        const charCount = Math.round(14 + length / 26);
        for (let i = 0; i < charCount; i++) {
            log.char.push({
                x: (random() * 2 - 1) * length * 0.46,
                y: -radius * (0.15 + random() * 0.75),
                rx: length * (0.04 + random() * 0.1),
                ry: radius * (0.15 + random() * 0.35),
                alpha: 0.25 + random() * 0.45
            });
        }

        // Wood that has burned a while wears patches of pale ash over the char,
        // and without them the surface reads as a smooth painted cylinder
        const ashCount = Math.round(6 + length / 70);
        for (let i = 0; i < ashCount; i++) {
            log.ash.push({
                x: (random() * 2 - 1) * length * 0.48,
                y: (random() * 2 - 1) * radius * 0.8,
                rx: length * (0.006 + random() * 0.018),
                ry: radius * (0.03 + random() * 0.09),
                rot: (random() - 0.5) * 0.6,
                alpha: 0.02 + random() * 0.05
            });
        }

        // Cracks are the glowing part: char splits open and the coal shows
        const crackCount = 4 + Math.round(random() * 4);
        for (let i = 0; i < crackCount; i++) {
            const points = [];
            const steps = 2 + Math.round(random() * 2);
            let x = (random() * 2 - 1) * length * 0.4;
            let y = -radius * (0.1 + random() * 0.6);
            for (let s = 0; s < steps; s++) {
                points.push({ x, y });
                x += (random() * 2 - 1) * length * 0.05 + length * 0.06;
                y += (random() * 2 - 1) * radius * 0.13;
                y = Math.max(-radius * 0.9, Math.min(radius * 0.7, y));
            }
            log.cracks.push({
                points,
                width: 0.7 + random() * 1.5,
                seed: random() * 1000,
                strength: 0.4 + random() * 0.6
            });
        }

        return log;
    }

    renderLogBuffer() {
        const ctx = this.logCtx;
        if (!ctx) return;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.logBuffer.width, this.logBuffer.height);
        if (!this.config.showLogs) return;

        for (const log of this.logs) {
            this.drawLogBody(ctx, log);
        }
    }

    logPath(ctx, log) {
        const halfLength = log.length / 2;
        ctx.beginPath();
        ctx.roundRect(-halfLength, -log.radius, log.length, log.radius * 2, log.radius);
    }

    drawLogBody(ctx, log) {
        ctx.save();
        ctx.translate(log.cx, log.cy);
        ctx.rotate(log.angle);

        this.logPath(ctx, log);
        ctx.clip();

        // Light comes from the fire above, so the top of the log is warm and
        // the underside falls away into the ash
        const body = ctx.createLinearGradient(0, -log.radius, 0, log.radius);
        body.addColorStop(0, '#4a2c17');
        body.addColorStop(0.16, '#2b1d14');
        body.addColorStop(0.45, '#171110');
        body.addColorStop(1, '#070505');
        ctx.fillStyle = body;
        ctx.fillRect(-log.length / 2, -log.radius, log.length, log.radius * 2);

        for (const stripe of log.bark) {
            ctx.beginPath();
            ctx.moveTo(stripe.x0, stripe.y);
            ctx.lineTo(stripe.x1, stripe.y + (stripe.y > 0 ? 1.5 : -1.5));
            ctx.lineWidth = stripe.width;
            ctx.strokeStyle = stripe.dark
                ? `rgba(0, 0, 0, ${stripe.alpha})`
                : `rgba(150, 104, 62, ${stripe.alpha * 0.5})`;
            ctx.stroke();
        }

        for (const blotch of log.char) {
            ctx.beginPath();
            ctx.ellipse(blotch.x, blotch.y, blotch.rx, blotch.ry, 0, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(10, 8, 8, ${blotch.alpha})`;
            ctx.fill();
        }

        for (const patch of log.ash) {
            ctx.beginPath();
            ctx.ellipse(patch.x, patch.y, patch.rx, patch.ry, patch.rot, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(146, 130, 116, ${patch.alpha})`;
            ctx.fill();
        }

        // The flame sits above the wood, so the top of every log carries a warm
        // rim. Without it the cylinders read as flat pipes.
        const rim = ctx.createLinearGradient(0, -log.radius, 0, -log.radius * 0.25);
        rim.addColorStop(0, 'rgba(184, 106, 48, 0.42)');
        rim.addColorStop(0.5, 'rgba(150, 84, 40, 0.14)');
        rim.addColorStop(1, 'rgba(150, 84, 40, 0)');
        ctx.fillStyle = rim;
        ctx.fillRect(-log.length / 2, -log.radius, log.length, log.radius);

        ctx.restore();

        // End grain is drawn outside the clip so the rings sit flush on the caps
        ctx.save();
        ctx.translate(log.cx, log.cy);
        ctx.rotate(log.angle);
        this.drawEndGrain(ctx, log, -log.length / 2 + log.radius * 0.28);
        this.drawEndGrain(ctx, log, log.length / 2 - log.radius * 0.28);
        ctx.restore();
    }

    drawEndGrain(ctx, log, x) {
        const rx = log.radius * 0.22;
        const ry = log.radius * 0.9;

        ctx.save();
        ctx.beginPath();
        ctx.ellipse(x, 0, rx, ry, 0, 0, Math.PI * 2);
        ctx.clip();

        const grain = ctx.createLinearGradient(0, -ry, 0, ry);
        grain.addColorStop(0, '#3f2a16');
        grain.addColorStop(0.5, '#251910');
        grain.addColorStop(1, '#0e0a07');
        ctx.fillStyle = grain;
        ctx.fillRect(x - rx, -ry, rx * 2, ry * 2);

        for (let i = 1; i <= 4; i++) {
            const k = i / 5;
            ctx.beginPath();
            ctx.ellipse(x, 0, rx * k, ry * k, 0, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(20, 12, 6, ${0.22 - k * 0.08})`;
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        ctx.beginPath();
        ctx.moveTo(x, -ry);
        ctx.lineTo(x + rx * 0.3, ry);
        ctx.strokeStyle = 'rgba(14, 9, 5, 0.5)';
        ctx.lineWidth = 1.4;
        ctx.stroke();

        ctx.restore();

        ctx.beginPath();
        ctx.ellipse(x, 0, rx, ry, 0, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
    }

    // --------------------------------------------------------------- bricks

    // A running-bond wall baked once into a full-resolution buffer. It sits
    // behind the room glow (which uses 'lighter' blending) so firelight tints
    // it for free, and gets a soot gradient near the log bed since that is
    // the one part of a real brick wall that never fully cools.
    renderBrickWall() {
        const ctx = this.brickCtx;
        if (!ctx) return;

        const width = this.brickBuffer.width;
        const height = this.brickBuffer.height;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, width, height);

        const style = FIREPLACE_BRICK_STYLES[this.config.brickBackground];
        if (!style) return;

        const scale = Math.min(1.6, Math.max(0.7, width / 1400));
        const brickW = 92 * scale;
        const brickH = 40 * scale;
        const mortar = style.mortarWidth * scale;
        const step = brickW + mortar;
        const rowStep = brickH + mortar;

        const random = this.seededRandom(7331 + Math.round(width) * 3 + Math.round(height));

        ctx.fillStyle = style.mortarColor;
        ctx.fillRect(0, 0, width, height);

        const base = style.base;
        const variance = style.variance;

        const rows = Math.ceil(height / rowStep) + 1;
        const cols = Math.ceil(width / step) + 2;

        for (let row = 0; row < rows; row++) {
            const y = row * rowStep;
            const offset = row % 2 === 0 ? 0 : -brickW / 2;

            for (let col = 0; col < cols; col++) {
                const x = offset + col * step;
                const jitterX = (random() - 0.5) * mortar * 0.4;
                const jitterY = (random() - 0.5) * mortar * 0.3;
                const w = brickW * (0.94 + random() * 0.12);
                const h = brickH * (0.94 + random() * 0.1);

                const v = (random() - 0.5) * variance;
                const r = Math.max(0, Math.min(255, base.r + v + (random() - 0.5) * 10));
                const g = Math.max(0, Math.min(255, base.g + v * 0.6));
                const b = Math.max(0, Math.min(255, base.b + v * 0.4));

                ctx.fillStyle = `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
                ctx.fillRect(x + jitterX, y + jitterY, w, h);

                // A faint top-light/bottom-shadow per brick reads as mortar
                // relief without needing separate mortar-line strokes
                const shade = ctx.createLinearGradient(x, y, x, y + h);
                shade.addColorStop(0, `rgba(255, 255, 255, ${style.shadeTop})`);
                shade.addColorStop(1, `rgba(0, 0, 0, ${style.shadeBottom})`);
                ctx.fillStyle = shade;
                ctx.fillRect(x + jitterX, y + jitterY, w, h);
            }
        }

        // Soot builds up on the wall right above where the fire actually sits
        const ground = this.groundLevel();
        const soot = ctx.createLinearGradient(0, ground - height * 0.55, 0, ground + 40);
        soot.addColorStop(0, 'rgba(0, 0, 0, 0)');
        soot.addColorStop(1, `rgba(6, 5, 5, ${style.sootAlpha})`);
        ctx.fillStyle = soot;
        ctx.fillRect(0, 0, width, height);

        // Fainter tiers get pushed further back overall so they read as
        // texture behind the fire rather than a distinct wall competing with it
        if (style.recede > 0) {
            ctx.fillStyle = `rgba(0, 0, 0, ${style.recede})`;
            ctx.fillRect(0, 0, width, height);
        }
    }

    drawBrickWall(ctx) {
        if (!FIREPLACE_BRICK_STYLES[this.config.brickBackground]) return;
        ctx.drawImage(this.brickBuffer, 0, 0);
    }

    // ---------------------------------------------------------- decorations

    // There's no mantel in this scene, so everything hangs straight from the
    // top edge of the screen instead: a swagged cord/garland with a handful
    // of themed ornaments dangling from it. Geometry is rebuilt on resize
    // like the logs, but nothing here needs a separate update() pass — sway
    // and twinkle are just read off this.elapsed at draw time.
    resolveDecorationTheme() {
        const mode = this.config.decorations;
        if (mode !== 'auto') return mode;

        const month = new Date().getMonth(); // 0-based
        if (month === 9) return 'halloween';               // October
        if (month === 10 || month === 11) return 'holiday'; // Nov / Dec
        return 'none';
    }

    buildDecorations() {
        const theme = this.resolveDecorationTheme();
        this.decorTheme = theme;
        this.decorations = null;
        if (theme === 'none' || !this.canvas) return;

        const width = this.canvas.width;
        const themeSeed = theme.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
        const random = this.seededRandom(6600 + themeSeed + Math.round(width));

        const scale = Math.min(1.5, Math.max(0.7, width / 1400));
        const segments = Math.max(3, Math.min(10, Math.round(width / 240)));
        const segW = width / segments;
        const swaySeeds = [];
        for (let i = 0; i <= segments; i++) swaySeeds.push(random() * 1000);

        const lights = [];
        if (theme !== 'birthday') {
            const perSeg = Math.max(2, Math.round(segW / 70));
            for (let s = 0; s < segments; s++) {
                for (let i = 0; i < perSeg; i++) {
                    lights.push({
                        seg: s,
                        t: (i + 0.5) / perSeg,
                        seed: random() * 1000,
                        colorIndex: Math.floor(random() * 3)
                    });
                }
            }
        }

        const pennants = [];
        if (theme === 'birthday') {
            const perSeg = Math.max(2, Math.round(segW / 46));
            for (let s = 0; s < segments; s++) {
                for (let i = 0; i < perSeg; i++) {
                    pennants.push({ seg: s, t: (i + 0.5) / perSeg, colorIndex: Math.floor(random() * 5) });
                }
            }
        }

        // Christmas keeps it to just the lights — no stockings
        const hangCount = theme === 'holiday' ? 0 : Math.max(2, Math.min(5, Math.round(segments * 0.6)));
        const hangs = [];
        for (let i = 0; i < hangCount; i++) {
            hangs.push({
                t: (i + 0.5) / hangCount,
                drop: (26 + random() * 16) * scale,
                swaySeed: random() * 1000,
                swaySpeed: 0.6 + random() * 0.5,
                colorIndex: Math.floor(random() * 4)
            });
        }

        this.decorations = { theme, scale, segments, segW, swaySeeds, lights, pennants, hangs };
    }

    decorationAnchor(deco, seg) {
        const x = seg * deco.segW;
        const y = 2 + Math.sin(this.elapsed * 0.5 + deco.swaySeeds[seg]) * 3 * deco.scale;
        return { x, y };
    }

    decorationSag(deco, seg) {
        return (30 + Math.sin(this.elapsed * 0.6 + deco.swaySeeds[seg] * 1.7) * 4) * deco.scale;
    }

    decorationPoint(deco, seg, t) {
        const a = this.decorationAnchor(deco, seg);
        const b = this.decorationAnchor(deco, seg + 1);
        const sag = this.decorationSag(deco, seg);
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2 + sag;

        const mt = 1 - t;
        return {
            x: mt * mt * a.x + 2 * mt * t * midX + t * t * b.x,
            y: mt * mt * a.y + 2 * mt * t * midY + t * t * b.y
        };
    }

    drawDecorations(ctx) {
        const deco = this.decorations;
        if (!deco) return;

        const width = this.canvas.width;

        // Christmas is just the lights, floating free with no visible wire;
        // the other themes keep a cord to hang their ornaments from
        if (deco.theme !== 'holiday') {
            const cordColor = deco.theme === 'halloween' ? '#171514' : '#3a2f28';
            const cordWidth = (deco.theme === 'birthday' ? 2 : 2.5) * deco.scale;

            ctx.save();
            ctx.strokeStyle = cordColor;
            ctx.lineWidth = cordWidth;
            ctx.lineCap = 'round';
            ctx.beginPath();
            const start = this.decorationAnchor(deco, 0);
            ctx.moveTo(start.x, start.y);
            for (let s = 0; s < deco.segments; s++) {
                const a = this.decorationAnchor(deco, s);
                const b = this.decorationAnchor(deco, s + 1);
                const sag = this.decorationSag(deco, s);
                ctx.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 + sag, b.x, b.y);
            }
            ctx.stroke();
            ctx.restore();
        }

        // String lights (holiday / halloween)
        if (deco.lights.length) {
            const palettes = deco.theme === 'holiday'
                ? [[255, 90, 70], [255, 210, 120], [130, 230, 150]]
                : [[255, 140, 50], [180, 100, 255], [255, 210, 120]];

            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            for (const light of deco.lights) {
                const p = this.decorationPoint(deco, light.seg, light.t);
                const drop = 4 * deco.scale;
                const flicker = 0.45 + 0.55 * this.sampleNoise(light.seed, this.elapsed * 0.5);
                const pulse = 0.85 + this.fireIntensity * 0.15;
                const alpha = flicker * pulse;
                const [r, g, b] = palettes[light.colorIndex % palettes.length];
                const radius = 9 * deco.scale;

                const glow = ctx.createRadialGradient(p.x, p.y + drop, 0, p.x, p.y + drop, radius * 2.2);
                glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`);
                glow.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
                ctx.fillStyle = glow;
                ctx.beginPath();
                ctx.arc(p.x, p.y + drop, radius * 2.2, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = `rgba(${Math.min(255, r + 40)}, ${Math.min(255, g + 40)}, ${Math.min(255, b + 40)}, ${Math.min(1, alpha + 0.2)})`;
                ctx.beginPath();
                ctx.arc(p.x, p.y + drop, radius * 0.5, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }

        // Pennant bunting (birthday)
        if (deco.pennants.length) {
            const colors = ['#ff6b81', '#ffd166', '#4dd0e1', '#7bd88f', '#c792ea'];
            for (const flag of deco.pennants) {
                const p = this.decorationPoint(deco, flag.seg, flag.t);
                const size = 12 * deco.scale;
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(Math.sin(this.elapsed * 0.6 + flag.seg) * 0.05);
                ctx.fillStyle = colors[flag.colorIndex % colors.length];
                ctx.beginPath();
                ctx.moveTo(-size * 0.5, 0);
                ctx.lineTo(size * 0.5, 0);
                ctx.lineTo(0, size * 1.1);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            }
        }

        // Hanging ornaments — a stocking, a sleeping bat, or a paper lantern
        for (const hang of deco.hangs) {
            const segFloat = hang.t * deco.segments;
            const seg = Math.min(deco.segments - 1, Math.floor(segFloat));
            const localT = segFloat - seg;
            const p = this.decorationPoint(deco, seg, localT);
            const sway = Math.sin(this.elapsed * hang.swaySpeed + hang.swaySeed) * 0.12;

            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(sway);

            ctx.strokeStyle = 'rgba(20, 16, 14, 0.7)';
            ctx.lineWidth = deco.scale;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(0, hang.drop);
            ctx.stroke();

            ctx.translate(0, hang.drop);

            if (deco.theme === 'holiday') {
                this.drawStocking(ctx, deco.scale, hang.colorIndex);
            } else if (deco.theme === 'halloween') {
                this.drawHangingBat(ctx, deco.scale, hang);
            } else if (deco.theme === 'birthday') {
                this.drawLantern(ctx, deco.scale, hang.colorIndex);
            }

            ctx.restore();
        }

        // A wisp of cobweb tucked in each top corner for Halloween
        if (deco.theme === 'halloween') {
            this.drawCobweb(ctx, 26 * deco.scale, 1, deco.scale);
            this.drawCobweb(ctx, width - 26 * deco.scale, -1, deco.scale);
        }
    }

    drawStocking(ctx, scale, colorIndex) {
        const colors = ['#c23b3b', '#2f7d4f'];
        const w = 16 * scale;
        const h = 26 * scale;

        ctx.fillStyle = colors[colorIndex % colors.length];
        ctx.beginPath();
        ctx.moveTo(-w * 0.35, 0);
        ctx.lineTo(w * 0.35, 0);
        ctx.lineTo(w * 0.35, h * 0.55);
        ctx.quadraticCurveTo(w * 0.35, h * 0.85, w * 0.05, h * 0.95);
        ctx.quadraticCurveTo(-w * 0.5, h, -w * 0.55, h * 0.7);
        ctx.quadraticCurveTo(-w * 0.5, h * 0.4, -w * 0.35, h * 0.3);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.beginPath();
        ctx.roundRect(-w * 0.42, -h * 0.05, w * 0.84, h * 0.22, 3 * scale);
        ctx.fill();
    }

    drawHangingBat(ctx, scale, hang) {
        const flap = 0.15 + Math.abs(Math.sin(this.elapsed * 1.2 + hang.swaySeed)) * 0.35;
        const r = 6 * scale;

        ctx.fillStyle = '#100d0c';
        ctx.beginPath();
        ctx.ellipse(0, r * 1.1, r * 0.65, r, 0, 0, Math.PI * 2);
        ctx.fill();

        [-1, 1].forEach((side) => {
            ctx.save();
            ctx.translate(side * r * 0.4, r * 0.7);
            ctx.rotate(side * (0.3 + flap));
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(side * r * 1.6, r * 0.2, side * r * 1.3, r * 1.5);
            ctx.quadraticCurveTo(side * r * 0.6, r * 0.9, 0, r * 0.6);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        });

        ctx.beginPath();
        ctx.moveTo(-r * 0.3, r * 0.25);
        ctx.lineTo(-r * 0.5, -r * 0.15);
        ctx.lineTo(-r * 0.05, r * 0.15);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(r * 0.3, r * 0.25);
        ctx.lineTo(r * 0.5, -r * 0.15);
        ctx.lineTo(r * 0.05, r * 0.15);
        ctx.closePath();
        ctx.fill();
    }

    drawLantern(ctx, scale, colorIndex) {
        const colors = ['#ff6b81', '#ffd166', '#4dd0e1', '#7bd88f'];
        const w = 18 * scale;
        const h = 22 * scale;

        ctx.fillStyle = colors[colorIndex % colors.length];
        ctx.beginPath();
        ctx.moveTo(-w * 0.15, 0);
        ctx.lineTo(w * 0.15, 0);
        ctx.quadraticCurveTo(w * 0.55, h * 0.5, w * 0.15, h);
        ctx.lineTo(-w * 0.15, h);
        ctx.quadraticCurveTo(-w * 0.55, h * 0.5, -w * 0.15, 0);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.lineWidth = 1.5 * scale;
        ctx.beginPath();
        for (let i = -1; i <= 1; i++) {
            const bow = w * 0.35 + w * 0.08 * (i === 0 ? 1 : 0);
            ctx.moveTo(i * w * 0.12, 0);
            ctx.quadraticCurveTo(i === 0 ? bow : i * bow, h * 0.5, i * w * 0.12, h);
        }
        ctx.stroke();

        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fillRect(-w * 0.18, -h * 0.06, w * 0.36, h * 0.06);
        ctx.fillRect(-w * 0.18, h, w * 0.36, h * 0.06);
    }

    drawCobweb(ctx, x, dir, scale) {
        const size = 46 * scale;
        const spokes = 5;

        ctx.save();
        ctx.translate(x, 0);
        ctx.strokeStyle = 'rgba(210, 205, 195, 0.35)';
        ctx.lineWidth = 1;

        for (let i = 0; i <= spokes; i++) {
            const angle = (Math.PI / 2) * (i / spokes);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(dir * Math.cos(angle) * size, Math.sin(angle) * size);
            ctx.stroke();
        }

        const rings = 3;
        for (let ring = 1; ring <= rings; ring++) {
            const rad = (size / rings) * ring;
            ctx.beginPath();
            for (let i = 0; i <= spokes; i++) {
                const angle = (Math.PI / 2) * (i / spokes);
                const ex = dir * Math.cos(angle) * rad;
                const ey = Math.sin(angle) * rad;
                if (i === 0) ctx.moveTo(ex, ey);
                else ctx.lineTo(ex, ey);
            }
            ctx.stroke();
        }

        ctx.restore();
    }

    // ---------------------------------------------------------------- coals

    buildCoals() {
        this.coals = [];
        const width = this.canvas.width;
        const ground = this.groundLevel();
        const random = this.seededRandom(9001 + Math.round(this.config.coalCount));
        const count = Math.max(0, Math.round(this.config.coalCount));

        for (let i = 0; i < count; i++) {
            const size = 3 + random() * 11;
            this.coals.push({
                x: random() * width,
                // The coal bed is a shallow band right at the ash line, so the
                // logs never bury it completely
                y: ground - random() * random() * 14,
                rx: size * (1 + random() * 0.8),
                ry: size * (0.4 + random() * 0.4),
                seed: random() * 1000,
                speed: 0.35 + random() * 0.9,
                heat: 0.35 + random() * 0.65
            });
        }
    }

    // ------------------------------------------------------------- emitters

    // Flame roots spaced along the log bed. Each one breathes on its own clock,
    // which is what makes parts of the fire flare while others sink.
    buildEmitters() {
        this.emitters = [];
        const width = this.canvas.width;
        const ground = this.groundLevel();
        const count = Math.max(14, Math.min(80, Math.round(width / 28)));
        const random = this.seededRandom(4242 + count);

        for (let i = 0; i < count; i++) {
            const t = (i + 0.5) / count;
            // Only the outermost few percent taper, so the bed still reads as
            // running off both edges rather than being sliced flat
            const edge = Math.min(1, Math.min(t, 1 - t) / 0.04);

            this.emitters.push({
                x: t * width,
                y: ground,
                base: (0.12 + Math.pow(random(), 1.7) * 0.88) * edge,
                strength: 0.5,
                seed: random() * 1000,
                speed: 0.6 + random() * 0.9
            });
        }
    }

    emitterTop(emitter) {
        // Flame leaves the stack somewhere between the coal bed and the top of
        // the wood, biased toward the top where the gases actually ignite
        const ground = this.groundLevel();
        const span = ground - this.bedTop;
        return ground - span * (0.35 + Math.random() * 0.65);
    }

    pickEmitter() {
        let total = 0;
        for (const emitter of this.emitters) total += emitter.strength;
        if (total <= 0) return this.emitters[Math.floor(Math.random() * this.emitters.length)];

        let target = Math.random() * total;
        for (const emitter of this.emitters) {
            target -= emitter.strength;
            if (target <= 0) return emitter;
        }
        return this.emitters[this.emitters.length - 1];
    }

    // ------------------------------------------------------------- physics

    spawnFlame() {
        const emitter = this.pickEmitter();
        if (!emitter) return;

        const config = this.config;
        const scale = Math.min(1.6, Math.max(0.7, this.canvas.width / 1400));
        const x = emitter.x + (Math.random() - 0.5) * 62 * config.flameSpread;
        const y = this.emitterTop(emitter);

        const life = (0.45 + Math.pow(Math.random(), 0.7) * 1.05) * config.flameHeight * (0.7 + emitter.strength * 0.6);

        this.flames.push({
            x,
            y,
            originX: emitter.x,
            vx: (Math.random() - 0.5) * 40 * config.flameSpread,
            vy: -(90 + Math.random() * 120) * config.flameHeight,
            life: 0,
            maxLife: life,
            temp: 1,
            radius: (16 + Math.random() * 16) * scale,
            growth: 1.4 + Math.random() * 1.6,
            alpha: 0,
            baseAlpha: (0.11 + Math.random() * 0.11) * (0.5 + emitter.strength * 0.7),
            // Roughly a third of the flame is drawn on the near side of the wood
            front: Math.random() < 0.32
        });
    }

    spawnSpark(x, y, energy = 1) {
        this.sparks.push({
            x,
            y,
            px: x,
            py: y,
            vx: (Math.random() - 0.5) * 90 + this.draft * 70,
            vy: -(160 + Math.random() * 300) * energy,
            life: 0,
            maxLife: 0.7 + Math.random() * 1.4,
            size: 0.8 + Math.random() * 1.6
        });
    }

    spawnSmoke(x, y) {
        this.smoke.push({
            x,
            y,
            vx: (Math.random() - 0.5) * 20,
            vy: -(30 + Math.random() * 50),
            radius: 18 + Math.random() * 28,
            growth: 26 + Math.random() * 34,
            life: 0,
            maxLife: 2.4 + Math.random() * 2.6
        });
    }

    updateEmitters(dt) {
        const config = this.config;
        let total = 0;

        for (const emitter of this.emitters) {
            const flow = this.sampleNoise(
                emitter.seed,
                this.elapsed * config.flickerSpeed * emitter.speed * 1.7
            );
            // A crack pop leaves the nearest root flaring hot for a moment; it
            // decays back to 0 on its own each frame rather than needing a
            // separate timer here
            const flare = emitter.flareBoost || 0;
            emitter.strength = emitter.base * (1 - config.flickerAmount + config.flickerAmount * flow) * (1 + flare);
            total += emitter.strength;

            if (flare > 0) {
                emitter.flareBoost = Math.max(0, flare - dt * 1.6);
            }
        }

        // The room glow tracks the whole fire rather than any one root, and is
        // eased so the walls do not strobe
        const average = this.emitters.length > 0 ? total / this.emitters.length : 0;
        const target = average * this.config.intensity;
        this.fireIntensity += (target - this.fireIntensity) * Math.min(1, dt * 6);
    }

    updateDraft(dt) {
        this.draftTimer -= dt;
        if (this.draftTimer <= 0) {
            this.draftTarget = (Math.random() * 2 - 1) * this.config.draftStrength;
            this.draftTimer = 1.6 + Math.random() * 3.2;
        }
        this.draft += (this.draftTarget - this.draft) * Math.min(1, dt * 0.8);
    }

    updateFlames(dt) {
        const config = this.config;
        const ground = this.groundLevel();
        const height = this.canvas.height;

        // Emission scales with canvas width so a wide screen does not thin out
        const rate = 1500 * (this.canvas.width / 1600) * config.flameDensity * config.intensity;
        this.flameCarry += rate * dt;
        let toSpawn = Math.floor(this.flameCarry);
        this.flameCarry -= toSpawn;
        toSpawn = Math.min(toSpawn, Math.max(0, config.maxParticles - this.flames.length));
        for (let i = 0; i < toSpawn; i++) this.spawnFlame();

        const riseDrag = Math.pow(0.968, dt * 60);
        const lateralDrag = Math.pow(0.93, dt * 60);
        const buoyancy = 820 * config.flameHeight * (0.6 + config.intensity * 0.4);
        const smokeStart = this.bedTop - height * 0.12;

        for (let i = this.flames.length - 1; i >= 0; i--) {
            const flame = this.flames[i];

            flame.life += dt;
            const k = flame.life / flame.maxLife;

            if (k >= 1) {
                // Flame does not simply stop; the tips that make it highest are
                // the ones still carrying enough soot to smoke
                if (config.smoke && flame.y < smokeStart && Math.random() < 0.012) {
                    this.spawnSmoke(flame.x, flame.y);
                }
                this.flames.splice(i, 1);
                continue;
            }

            const above = Math.max(0, ground - flame.y);
            // Turbulence has almost no grip at the base and takes over higher up,
            // which is why a real flame is a smooth column that breaks into
            // tongues as it rises
            const turbulence = (this.sampleNoise(
                flame.x * 0.0105,
                flame.y * 0.0038 + this.elapsed * 1.1
            ) - 0.5);
            const grip = Math.min(1.4, above / (height * 0.22));

            flame.vx += turbulence * 900 * config.turbulence * config.flameSpread * grip * dt;
            flame.vx += this.draft * 130 * grip * dt;

            // Air drawn into the base pinches the column in before it opens out
            if (k < 0.28) {
                flame.vx += (flame.originX - flame.x) * 3.4 * dt;
            }

            flame.vy -= buoyancy * flame.temp * dt;

            flame.vx *= lateralDrag;
            flame.vy *= riseDrag;

            flame.x += flame.vx * dt;
            flame.y += flame.vy * dt;

            flame.temp = Math.pow(1 - k, 1.25);
            flame.radius += flame.growth * 26 * dt;

            const fadeIn = Math.min(1, k / 0.07);
            flame.alpha = flame.baseAlpha * fadeIn * Math.pow(1 - k, 1.5);
        }
    }

    updateSparks(dt) {
        const config = this.config;

        if (config.sparks) {
            const rate = 14 * config.sparkRate * config.intensity * (this.canvas.width / 1400);
            this.sparkCarry += rate * dt;
            const toSpawn = Math.floor(this.sparkCarry);
            this.sparkCarry -= toSpawn;

            for (let i = 0; i < toSpawn; i++) {
                const emitter = this.pickEmitter();
                if (emitter) this.spawnSpark(emitter.x + (Math.random() - 0.5) * 20, this.emitterTop(emitter));
            }

            // A pocket of sap letting go throws a whole handful at once
            if (Math.random() < 0.25 * config.sparkRate * dt) {
                const emitter = this.pickEmitter();
                if (emitter) {
                    const burst = 6 + Math.floor(Math.random() * 14);
                    for (let i = 0; i < burst; i++) {
                        this.spawnSpark(emitter.x + (Math.random() - 0.5) * 30, this.emitterTop(emitter), 1.5);
                    }
                }
            }
        }

        const drag = Math.pow(0.985, dt * 60);
        for (let i = this.sparks.length - 1; i >= 0; i--) {
            const spark = this.sparks[i];
            spark.life += dt;
            if (spark.life >= spark.maxLife || spark.y < -40) {
                this.sparks.splice(i, 1);
                continue;
            }

            spark.px = spark.x;
            spark.py = spark.y;

            const turbulence = this.sampleNoise(spark.x * 0.02, spark.y * 0.01 - this.elapsed * 2.2) - 0.5;
            spark.vx += turbulence * 700 * this.config.turbulence * dt;
            spark.vx += this.draft * 200 * dt;
            spark.vy += 150 * dt; // sparks cool fast and start to fall back

            spark.vx *= drag;
            spark.vy *= drag;
            spark.x += spark.vx * dt;
            spark.y += spark.vy * dt;
        }
    }

    updateSmoke(dt) {
        for (let i = this.smoke.length - 1; i >= 0; i--) {
            const puff = this.smoke[i];
            puff.life += dt;
            if (puff.life >= puff.maxLife || puff.y < -120) {
                this.smoke.splice(i, 1);
                continue;
            }

            const turbulence = this.sampleNoise(puff.x * 0.004, puff.y * 0.003 - this.elapsed * 0.5) - 0.5;
            puff.vx += turbulence * 90 * dt + this.draft * 40 * dt;
            puff.vy -= 14 * dt;
            puff.x += puff.vx * dt;
            puff.y += puff.vy * dt;
            puff.radius += puff.growth * dt;
        }
    }

    update(dt) {
        this.updateDraft(dt);
        this.updateEmitters(dt);
        this.updateFlames(dt);
        this.updateSparks(dt);
        if (this.config.smoke) this.updateSmoke(dt);
        else if (this.smoke.length) this.smoke.length = 0;
        this.updatePopEvents(dt);
        if (this.companion) this.updateCompanion(dt);
    }

    // ------------------------------------------------------------ rendering

    backgroundColor() {
        // Never fully black: a dark room lit by fire still has a warm floor
        const k = 1 - Math.max(0, Math.min(1, this.config.backgroundDarkness));
        const r = Math.round(3 + 26 * k);
        const g = Math.round(2 + 19 * k);
        const b = Math.round(2 + 16 * k);
        return `rgb(${r}, ${g}, ${b})`;
    }

    drawRoomGlow(ctx) {
        const config = this.config;
        if (config.roomGlow <= 0) return;

        const width = this.canvas.width;
        const height = this.canvas.height;
        const ground = this.groundLevel();
        const [r, g, b] = this.palette().glow;
        const pulse = 0.55 + this.fireIntensity * 0.9;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        // The far light: a broad wash up the wall behind the fire
        const radius = Math.max(width, height) * 0.95 * config.glowRadius * (0.85 + this.fireIntensity * 0.3);
        const ambient = ctx.createRadialGradient(width / 2, ground - height * 0.05, 0, width / 2, ground - height * 0.05, radius);
        ambient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${0.22 * config.roomGlow * pulse})`);
        ambient.addColorStop(0.35, `rgba(${Math.round(r * 0.8)}, ${Math.round(g * 0.5)}, ${Math.round(b * 0.35)}, ${0.09 * config.roomGlow * pulse})`);
        ambient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = ambient;
        ctx.fillRect(0, 0, width, height);

        // The near light: a hard, flattened pool along the log bed itself
        ctx.save();
        ctx.translate(width / 2, ground);
        ctx.scale(1, 0.34 * config.glowRadius);
        const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, width * 0.75);
        pool.addColorStop(0, `rgba(255, ${Math.round(150 + g * 0.2)}, ${Math.round(60 + b * 0.3)}, ${0.24 * config.roomGlow * pulse})`);
        pool.addColorStop(0.45, `rgba(${r}, ${Math.round(g * 0.6)}, ${Math.round(b * 0.4)}, ${0.08 * config.roomGlow * pulse})`);
        pool.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = pool;
        ctx.fillRect(-width, -width, width * 2, width * 2);
        ctx.restore();

        ctx.restore();
    }

    renderFlameBuffer(bctx, buffer, front) {
        const scale = 1 / Math.max(1, this.config.softness);

        bctx.setTransform(1, 0, 0, 1, 0, 0);
        bctx.clearRect(0, 0, buffer.width, buffer.height);
        bctx.globalCompositeOperation = 'lighter';

        // The roots of the flame are always saturated white-hot, and the
        // particle cloud alone is too sparse to hold that at the base
        if (!front) {
            const ground = this.groundLevel();
            const sprite = this.flameSprites[FIREPLACE_SPRITE_LEVELS - 1];
            if (sprite) {
                for (const emitter of this.emitters) {
                    const radius = (14 + emitter.strength * 20) * scale;
                    bctx.globalAlpha = 0.04 + emitter.strength * 0.13 * this.config.intensity;
                    bctx.drawImage(
                        sprite,
                        emitter.x * scale - radius,
                        (ground - 6) * scale - radius,
                        radius * 2,
                        radius * 2
                    );
                }
            }
        }

        for (const flame of this.flames) {
            if (flame.front !== front) continue;
            if (flame.alpha <= 0.004) continue;

            const sprite = this.spriteFor(flame.temp);
            if (!sprite) continue;

            const radius = flame.radius * scale;
            bctx.globalAlpha = Math.min(1, flame.alpha);
            bctx.drawImage(sprite, flame.x * scale - radius, flame.y * scale - radius, radius * 2, radius * 2);
        }

        bctx.globalAlpha = 1;
    }

    blitFlameBuffer(ctx, buffer) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.max(0, Math.min(1.5, this.config.flameOpacity));
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(buffer, 0, 0, this.canvas.width, this.canvas.height);
        ctx.restore();
    }

    drawLogs(ctx) {
        if (!this.config.showLogs) return;
        ctx.drawImage(this.logBuffer, 0, 0);
    }

    drawEmberGlow(ctx) {
        if (!this.config.showLogs || this.config.emberGlow <= 0) return;

        const [r, g, b] = this.palette().ember;
        const strength = this.config.emberGlow * (0.55 + this.fireIntensity * 0.75);

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        for (const log of this.logs) {
            ctx.save();
            ctx.translate(log.cx, log.cy);
            ctx.rotate(log.angle);

            // Cracks are clipped to the log so the glow cannot leak past its edge
            this.logPath(ctx, log);
            ctx.save();
            ctx.clip();

            for (const crack of log.cracks) {
                const pulse = this.sampleNoise(crack.seed, this.elapsed * 0.9);
                const pop = crack.popPower || 0;
                const heat = crack.strength * strength * (0.3 + pulse * 0.9) + pop;
                if (heat <= 0.02) continue;

                ctx.beginPath();
                ctx.moveTo(crack.points[0].x, crack.points[0].y);
                for (let i = 1; i < crack.points.length; i++) {
                    ctx.lineTo(crack.points[i].x, crack.points[i].y);
                }

                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';

                // Two passes stand in for a blur: a wide dull halo and a thin
                // near-white centre, which is what a split coal actually looks like
                ctx.lineWidth = crack.width * 3.5;
                ctx.strokeStyle = `rgba(${r}, ${Math.round(g * 0.45)}, ${Math.round(b * 0.3)}, ${Math.min(0.4, heat * 0.2)})`;
                ctx.stroke();

                ctx.lineWidth = crack.width;
                ctx.strokeStyle = `rgba(${Math.min(255, r + 30)}, ${Math.round(110 + g * 0.3)}, ${Math.round(40 + b * 0.3)}, ${Math.min(0.7, heat * 0.5)})`;
                ctx.stroke();

                // A pop event blows the char open, and the fresh coal beneath
                // it flashes near-white before settling back to ember colour
                if (pop > 0.03) {
                    ctx.lineWidth = crack.width * 1.5;
                    ctx.strokeStyle = `rgba(255, 240, 205, ${Math.min(0.9, pop)})`;
                    ctx.stroke();
                }
            }

            ctx.restore();

            // Where the wood meets the coals below it, light spills upward
            const contact = ctx.createLinearGradient(0, log.radius, 0, -log.radius * 0.2);
            contact.addColorStop(0, `rgba(${r}, ${Math.round(g * 0.5)}, ${Math.round(b * 0.3)}, ${Math.min(0.4, 0.2 * strength)})`);
            contact.addColorStop(1, 'rgba(0, 0, 0, 0)');
            this.logPath(ctx, log);
            ctx.fillStyle = contact;
            ctx.fill();

            ctx.restore();
        }

        ctx.restore();
    }

    // ----------------------------------------------------------- pop events

    // A big pop: a random crack on a random log flashes white-hot for a
    // moment, throws a burst of sparks, and flares the nearest flame root.
    // Everything it touches (crack.popPower, emitter.flareBoost) is state
    // that already drives other systems, so this needs almost no drawing
    // code of its own beyond the shockwave puff.
    updatePopEvents(dt) {
        if (this.config.popEvents) {
            this.popTimer -= dt;
            if (this.popTimer <= 0) {
                this.triggerPop();
                this.popTimer = (14 + Math.random() * 20) / Math.max(0.05, this.config.popRate);
            }
        }

        for (let i = this.popBursts.length - 1; i >= 0; i--) {
            const burst = this.popBursts[i];
            burst.life += dt;

            if (burst.life >= burst.maxLife) {
                burst.crack.popPower = 0;
                this.popBursts.splice(i, 1);
                continue;
            }

            const k = burst.life / burst.maxLife;
            burst.crack.popPower = burst.power * Math.max(0, 1 - k * k);
        }
    }

    triggerPop() {
        if (!this.config.showLogs || this.logs.length === 0) return;

        const candidates = this.logs.filter(log => log.cracks.length > 0);
        if (candidates.length === 0) return;

        const log = candidates[Math.floor(Math.random() * candidates.length)];
        const crack = log.cracks[Math.floor(Math.random() * log.cracks.length)];
        const point = crack.points[Math.floor(Math.random() * crack.points.length)];

        // Cracks are stored in the log's own rotated local space
        const cos = Math.cos(log.angle);
        const sin = Math.sin(log.angle);
        const x = log.cx + point.x * cos - point.y * sin;
        const y = log.cy + point.x * sin + point.y * cos;

        this.popBursts.push({ crack, x, y, life: 0, maxLife: 0.5, power: 0.85 + Math.random() * 0.5 });

        if (this.config.sparks) {
            const count = 10 + Math.floor(Math.random() * 10);
            for (let i = 0; i < count; i++) {
                this.spawnSpark(x + (Math.random() - 0.5) * 16, y - Math.random() * 6, 1.5 + Math.random() * 0.9);
            }
        }

        // The nearest flame root flares up for a moment, as if the pop just
        // fed it a puff of gas
        let nearest = null;
        let bestDist = Infinity;
        for (const emitter of this.emitters) {
            const dist = Math.abs(emitter.x - x);
            if (dist < bestDist) {
                bestDist = dist;
                nearest = emitter;
            }
        }
        if (nearest) {
            nearest.flareBoost = Math.max(nearest.flareBoost || 0, 1.1 + Math.random() * 0.7);
        }
    }

    drawPopBursts(ctx) {
        if (this.popBursts.length === 0) return;

        const scale = Math.min(1.4, Math.max(0.7, this.canvas.width / 1400));

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        for (const burst of this.popBursts) {
            const k = burst.life / burst.maxLife;
            const alpha = Math.max(0, 1 - k) * 0.85;
            if (alpha <= 0.01) continue;

            const radius = (6 + k * 34) * scale;
            const glow = ctx.createRadialGradient(burst.x, burst.y, 0, burst.x, burst.y, radius);
            glow.addColorStop(0, `rgba(255, 244, 214, ${alpha})`);
            glow.addColorStop(0.4, `rgba(255, 176, 88, ${alpha * 0.5})`);
            glow.addColorStop(1, 'rgba(255, 120, 40, 0)');

            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(burst.x, burst.y, radius, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    drawCoals(ctx) {
        if (this.coals.length === 0) return;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        for (const coal of this.coals) {
            const pulse = this.sampleNoise(coal.seed, this.elapsed * coal.speed);
            const heat = coal.heat * (0.25 + pulse * 0.9) * (0.5 + this.fireIntensity * 0.7);
            if (heat <= 0.02) continue;

            // Coals glow by blackbody even when the flame above them does not:
            // the salts that turn driftwood green burn off in the gas phase, so
            // the embers stay red-orange whatever the flame is doing
            const tint = this.palette().ember;
            const k = Math.min(1, heat * 0.9);
            const r = Math.round(64 + (tint[0] - 64) * k);
            const g = Math.round(8 + (tint[1] - 8) * Math.pow(k, 1.5));
            const b = Math.round(4 + (tint[2] - 4) * Math.pow(k, 2.2));

            const glow = ctx.createRadialGradient(coal.x, coal.y, 0, coal.x, coal.y, coal.rx * 1.8);
            glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${Math.min(0.85, heat * 0.6)})`);
            glow.addColorStop(0.4, `rgba(${r}, ${Math.round(g * 0.6)}, ${Math.round(b * 0.4)}, ${Math.min(0.4, heat * 0.2)})`);
            glow.addColorStop(1, 'rgba(0, 0, 0, 0)');

            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.ellipse(coal.x, coal.y, coal.rx * 1.8, coal.ry * 2.0, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    drawSparks(ctx) {
        if (!this.config.sparks || this.sparks.length === 0) return;

        const [r, g, b] = this.palette().spark;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';

        for (const spark of this.sparks) {
            const k = spark.life / spark.maxLife;
            const alpha = Math.pow(1 - k, 1.4);
            if (alpha <= 0.01) continue;

            // Sparks cool as they climb, sliding from white through orange
            const fade = 1 - k * 0.75;
            ctx.strokeStyle = `rgba(${r}, ${Math.round(g * fade)}, ${Math.round(b * fade * fade)}, ${alpha})`;
            ctx.lineWidth = spark.size;
            ctx.beginPath();
            ctx.moveTo(spark.px, spark.py);
            ctx.lineTo(spark.x, spark.y);
            ctx.stroke();
        }

        ctx.restore();
    }

    drawSmoke(ctx) {
        if (!this.config.smoke || this.smoke.length === 0 || !this.smokeSprite) return;

        ctx.save();
        for (const puff of this.smoke) {
            const k = puff.life / puff.maxLife;
            // Smoke has to fade in as well as out, otherwise it appears as a
            // grey disc right where the flame was brightest
            const alpha = Math.sin(Math.PI * Math.min(1, k)) * this.config.smokeOpacity;
            if (alpha <= 0.01) continue;

            ctx.globalAlpha = alpha;
            ctx.drawImage(
                this.smokeSprite,
                puff.x - puff.radius,
                puff.y - puff.radius,
                puff.radius * 2,
                puff.radius * 2
            );
        }
        ctx.restore();
    }

    render() {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.fillStyle = this.backgroundColor();
        ctx.fillRect(0, 0, width, height);
        this.drawBrickWall(ctx);

        this.drawRoomGlow(ctx);
        this.drawDecorations(ctx);

        this.renderFlameBuffer(this.backCtx, this.backBuffer, false);
        this.blitFlameBuffer(ctx, this.backBuffer);

        this.drawLogs(ctx);
        this.drawEmberGlow(ctx);
        this.drawCoals(ctx);
        this.drawPopBursts(ctx);

        this.renderFlameBuffer(this.frontCtx, this.frontBuffer, true);
        this.blitFlameBuffer(ctx, this.frontBuffer);

        this.drawSparks(ctx);
        this.drawSmoke(ctx);
        this.drawCompanion(ctx);
    }

    animate(currentTime = 0) {
        if (!this.isEnabled) return;

        if (!this.lastTime) this.lastTime = currentTime;
        let dt = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;

        // A tab that has been in the background hands back an enormous delta,
        // and letting that through would fire every particle off the screen
        if (!isFinite(dt) || dt < 0) dt = 0;
        dt = Math.min(dt, 0.05);

        this.elapsed += dt;
        this.update(dt);
        this.render();

        this.animationId = requestAnimationFrame((time) => this.animate(time));
    }

    // ----------------------------------------------------------- companion

    // A cat or dog dozing off to one side of the hearth. Pose is a handful of
    // 0..1 blend values (curl, arch, headAngle, tailCurl, legLift) eased
    // toward a per-state target each frame; a small state machine decides
    // when to move between sleeping, waking, stretching, standing, and back
    // to sleeping (sometimes resettling facing the other way) — plus a
    // "shifty" side-trip where it stays curled up but its eyes pop open and
    // dart around before closing again. The silhouette itself is drawn from
    // primitive shapes (ellipse body, circle head, a couple of
    // triangles/curves) rather than a fixed sprite, so the same drawing code
    // reads correctly at every blend of that pose.
    buildCompanion() {
        if (this.config.companion === 'none' || !this.canvas) {
            this.companion = null;
            return;
        }

        const width = this.canvas.width;
        const ground = this.groundLevel();
        const random = this.seededRandom(5150 + (this.config.companion === 'cat' ? 11 : 29));
        const side = random() < 0.5 ? -1 : 1;
        const margin = width * (0.1 + random() * 0.08);
        const x = side < 0 ? margin : width - margin;
        const scale = Math.min(1.4, Math.max(0.7, width / 1400));

        if (!this.companion || this.companion.type !== this.config.companion) {
            const restPose = { curl: 1, arch: 0, headAngle: 0, tailCurl: 0.15, legLift: 0 };
            this.companion = {
                type: this.config.companion,
                baseX: x,
                x,
                y: ground,
                scale,
                facing: side < 0 ? 1 : -1, // face inward, toward the fire
                state: 'sleeping',
                stateTimer: 0,
                stateDuration: (16 + random() * 22) / Math.max(0.1, this.config.companionActivity),
                pose: { ...restPose },
                target: { ...restPose },
                seed: random() * 1000
            };
        } else {
            // Resize/rebuild: keep whatever it's doing, just relocate it
            this.companion.baseX = x;
            this.companion.x = x;
            this.companion.y = ground;
            this.companion.scale = scale;
        }
    }

    updateCompanion(dt) {
        const companion = this.companion;
        if (!companion) return;

        companion.stateTimer += dt;

        const ease = Math.min(1, dt * 5);
        for (const key in companion.pose) {
            companion.pose[key] += (companion.target[key] - companion.pose[key]) * ease;
        }

        if (companion.stateTimer >= companion.stateDuration) {
            this.advanceCompanionState(companion);
        }
    }

    advanceCompanionState(companion) {
        const random = Math.random;
        const activity = Math.max(0.1, this.config.companionActivity);
        const sleepDuration = () => (16 + random() * 22) / activity;
        companion.stateTimer = 0;

        switch (companion.state) {
            case 'sleeping': {
                // The full stand-up/stretch cycle is a big, obvious animation,
                // so it stays rare; shifty eyes and a quick peek are the more
                // common "still basically asleep" idle beats
                const roll = random();
                if (roll < 0.45) {
                    // Stays curled up, but the eyes pop open and dart around
                    // suspiciously before closing again — a slight head tilt
                    // rides along so it reads even as a peripheral glance
                    companion.state = 'shifty';
                    companion.target = { curl: 1, arch: 0, headAngle: (random() < 0.5 ? -1 : 1) * (0.08 + random() * 0.1), tailCurl: 0.15, legLift: 0 };
                    companion.stateDuration = 1.6 + random() * 1.2;
                } else if (roll < 0.9) {
                    // A quick peek: lift the head, glance around, back to sleep
                    companion.state = 'peek';
                    companion.target = { curl: 0.85, arch: 0, headAngle: (random() - 0.5) * 0.5, tailCurl: 0.25, legLift: 0 };
                    companion.stateDuration = 1.1 + random() * 0.6;
                } else {
                    companion.state = 'waking';
                    companion.target = { curl: 0.55, arch: 0.1, headAngle: 0.15, tailCurl: 0.35, legLift: 0.15 };
                    companion.stateDuration = 0.7 + random() * 0.3;
                }
                break;
            }

            case 'shifty':
            case 'peek':
                companion.state = 'sleeping';
                companion.target = { curl: 1, arch: 0, headAngle: 0, tailCurl: 0.15, legLift: 0 };
                companion.stateDuration = sleepDuration();
                break;

            case 'waking':
                companion.state = 'stretch';
                companion.target = { curl: 0.12, arch: 1, headAngle: -0.2, tailCurl: 0.55, legLift: 0.75 };
                companion.stateDuration = 1.5 + random() * 0.4;
                break;

            case 'stretch':
                companion.state = 'stand';
                companion.target = { curl: 0, arch: 0, headAngle: 0.05, tailCurl: 0.5, legLift: 1 };
                companion.stateDuration = 0.8 + random() * 0.4;
                break;

            case 'stand':
                companion.state = 'settle';
                companion.target = { curl: 1, arch: 0, headAngle: 0, tailCurl: 0.2, legLift: 0 };
                companion.stateDuration = 1.0 + random() * 0.4;
                // Sometimes it resettles facing the other way, just for variety
                if (random() < 0.35) companion.facing *= -1;
                break;

            case 'settle':
            default:
                companion.state = 'sleeping';
                companion.target = { curl: 1, arch: 0, headAngle: 0, tailCurl: 0.15, legLift: 0 };
                companion.stateDuration = sleepDuration();
                break;
        }
    }

    drawCompanion(ctx) {
        const companion = this.companion;
        if (!companion) return;

        const pose = companion.pose;
        const isDog = companion.type === 'dog';
        const unit = 90 * companion.scale * (isDog ? 1.22 : 1);

        const breathe = (companion.state === 'sleeping' || companion.state === 'peek' || companion.state === 'shifty')
            ? Math.sin(this.elapsed * 1.4 + companion.seed) * 0.02
            : 0;
        const idleWiggle = this.sampleNoise(companion.seed * 0.01, this.elapsed * 0.3) - 0.5;

        const curl = pose.curl;
        const bodyWidth = unit * (2.05 - curl * 0.85) * (1 + breathe);
        const bodyHeight = unit * (0.95 + curl * 0.35);
        const legLength = unit * 0.62 * pose.legLift;
        const bodyTilt = -pose.arch * 0.22;
        const bodyCenterY = -(bodyHeight / 2) - legLength;

        // Firelight comes roughly from screen-centre; figure out which local
        // side (after the facing flip) actually points toward it
        const fireSide = companion.baseX > this.canvas.width / 2 ? -1 : 1;
        const localFireDir = fireSide * companion.facing;
        const [gr, gg, gb] = this.palette().glow;
        const rimAlpha = 0.2 + this.fireIntensity * 0.25;

        // A near-black silhouette all but vanishes against this scene's very
        // dark background, so the coat gets an actual warm colour (like the
        // logs' own gradient) and the fire-glow rim is layered on top of that
        const fur = isDog
            ? { light: '#c08a52', base: '#8a5a34', shadow: '#2e1c10' }
            : { light: '#8a7565', base: '#5b4c40', shadow: '#221b16' };

        ctx.save();
        ctx.translate(companion.x, companion.y);
        ctx.scale(companion.facing, 1);

        // Ground-contact shadow, so it reads as sitting on the floor
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.beginPath();
        ctx.ellipse(0, 2, unit * (0.85 - curl * 0.15), unit * 0.16, 0, 0, Math.PI * 2);
        ctx.fill();

        // Legs (only once it's at least partway to standing)
        if (pose.legLift > 0.04) {
            ctx.fillStyle = fur.shadow;
            [-0.34, 0.32].forEach((lx) => {
                ctx.save();
                ctx.translate(lx * bodyWidth * 0.5, bodyCenterY + bodyHeight * 0.32);
                ctx.beginPath();
                ctx.roundRect(-unit * 0.09, 0, unit * 0.18, legLength, unit * 0.08);
                ctx.fill();
                ctx.restore();
            });
        }

        // Tail
        ctx.strokeStyle = fur.shadow;
        ctx.lineWidth = unit * (isDog ? 0.24 : 0.18);
        ctx.lineCap = 'round';
        const tailBaseX = -bodyWidth * 0.4;
        const tailBaseY = bodyCenterY + bodyHeight * 0.22;
        let tailCtrlX, tailCtrlY, tailTipX, tailTipY;
        if (curl > 0.5) {
            // Wrapped around the front of the curled-up body
            tailCtrlX = bodyWidth * 0.05;
            tailCtrlY = bodyCenterY + bodyHeight * 0.85;
            tailTipX = bodyWidth * 0.32 + idleWiggle * unit * 0.06;
            tailTipY = bodyCenterY + bodyHeight * 0.5;
        } else {
            // A dog wags continuously once up; a cat mostly just flicks
            const wag = isDog
                ? Math.sin(this.elapsed * 9 + companion.seed) * 0.35 * pose.tailCurl
                : Math.sin(this.elapsed * 1.6 + companion.seed) * 0.12 * pose.tailCurl;
            tailCtrlX = tailBaseX - unit * 0.5;
            tailCtrlY = tailBaseY - unit * (0.8 + wag);
            tailTipX = tailBaseX - unit * (0.9 + pose.tailCurl * 0.3);
            tailTipY = tailBaseY - unit * (1.3 + wag * 1.4);
        }
        ctx.beginPath();
        ctx.moveTo(tailBaseX, tailBaseY);
        ctx.quadraticCurveTo(tailCtrlX, tailCtrlY, tailTipX, tailTipY);
        ctx.stroke();

        // Body, plus a warm rim from the fire clipped to its silhouette
        ctx.save();
        ctx.translate(0, bodyCenterY);
        ctx.rotate(bodyTilt);
        const coat = ctx.createLinearGradient(0, -bodyHeight / 2, 0, bodyHeight / 2);
        coat.addColorStop(0, fur.light);
        coat.addColorStop(0.55, fur.base);
        coat.addColorStop(1, fur.shadow);
        ctx.fillStyle = coat;
        ctx.beginPath();
        ctx.ellipse(0, 0, bodyWidth / 2, bodyHeight / 2, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.clip();
        ctx.globalCompositeOperation = 'lighter';
        const rim = ctx.createLinearGradient(localFireDir * bodyWidth * 0.5, 0, -localFireDir * bodyWidth * 0.5, 0);
        rim.addColorStop(0, `rgba(${gr}, ${gg}, ${gb}, ${rimAlpha})`);
        rim.addColorStop(0.55, `rgba(${gr}, ${gg}, ${gb}, 0)`);
        ctx.fillStyle = rim;
        ctx.fillRect(-bodyWidth / 2, -bodyHeight / 2, bodyWidth, bodyHeight);
        ctx.restore();
        ctx.restore();

        // Head
        const headR = unit * (isDog ? 0.5 : 0.42);
        const headX = bodyWidth * (0.32 - curl * 0.22);
        const headY = bodyCenterY - bodyHeight * 0.12 - curl * bodyHeight * 0.05 + Math.sin(pose.headAngle) * unit * 0.15;
        ctx.fillStyle = fur.base;
        ctx.beginPath();
        ctx.arc(headX, headY, headR, 0, Math.PI * 2);
        ctx.fill();

        // Ears
        const earVisible = 1 - curl * 0.55;
        if (earVisible > 0.05) {
            ctx.fillStyle = fur.shadow;
            [-1, 1].forEach((side) => {
                ctx.save();
                ctx.translate(headX + side * headR * 0.5, headY - headR * 0.7);
                if (isDog) {
                    ctx.rotate(side * 0.15 + 0.35);
                    ctx.beginPath();
                    ctx.ellipse(0, headR * 0.35 * earVisible, headR * 0.22, headR * 0.55 * earVisible, 0, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    ctx.rotate(side * 0.3 + pose.headAngle * 0.3);
                    ctx.beginPath();
                    ctx.moveTo(-headR * 0.28, 0);
                    ctx.lineTo(headR * 0.28, 0);
                    ctx.lineTo(0, -headR * 0.75 * earVisible);
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.restore();
            });
        }

        // Eyes — closed to a small curved slit while asleep, opening into a
        // firelit iris with a pupil as it wakes, rather than just vanishing.
        // Two of them, same as the two ears already drawn, so the face
        // doesn't read as a one-eyed profile. "Shifty" forces them open even
        // while the body is still curled up asleep, and darts the pupils
        // side to side, for the little "is someone there?" glance.
        const isShifty = companion.state === 'shifty';
        const eyesDart = isShifty || companion.state === 'stand';
        const openness = isShifty ? 1 : Math.max(0, Math.min(1, 1 - curl * 1.15));
        // A blend of two noise frequencies reads as an erratic, glancing-around
        // dart rather than a metronome-regular sine sweep
        const lookShift = eyesDart
            ? ((this.sampleNoise(companion.seed * 0.037, this.elapsed * 1.1) - 0.5) * 0.7
                + (this.sampleNoise(companion.seed * 0.091 + 500, this.elapsed * 2.75) - 0.5) * 0.3) * unit * 0.1
            : 0;
        const eyeSpots = [
            { x: headX + headR * 0.62, y: headY - headR * 0.05, size: 1 },
            { x: headX - headR * 0.02, y: headY - headR * 0.1, size: 0.75 }
        ];

        for (const eye of eyeSpots) {
            ctx.strokeStyle = `rgba(20, 14, 10, ${0.6 * (1 - openness)})`;
            ctx.lineWidth = unit * 0.02;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(eye.x - unit * 0.1 * eye.size, eye.y);
            ctx.quadraticCurveTo(eye.x, eye.y + unit * 0.07 * eye.size, eye.x + unit * 0.1 * eye.size, eye.y);
            ctx.stroke();

            if (openness > 0.05) {
                const irisRadius = unit * 0.09 * openness * eye.size;
                const eyeGlow = openness * (0.5 + this.fireIntensity * 0.5);
                ctx.fillStyle = `rgba(255, 200, 120, ${Math.min(0.9, eyeGlow)})`;
                ctx.beginPath();
                ctx.arc(eye.x, eye.y, irisRadius, 0, Math.PI * 2);
                ctx.fill();

                // Keep the pupil's edge from poking out past the iris
                const pupilShift = Math.max(-irisRadius * 0.55, Math.min(irisRadius * 0.55, lookShift * eye.size));
                ctx.fillStyle = `rgba(24, 16, 12, ${Math.min(0.95, openness)})`;
                ctx.beginPath();
                ctx.arc(eye.x + pupilShift, eye.y, irisRadius * 0.45, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.restore();
    }

    // --------------------------------------------------------- config dialog

    showConfigDialog() {
        if (document.getElementById('fireplace-config-modal')) return;

        const modal = document.createElement('div');
        modal.id = 'fireplace-config-modal';
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background-color: rgba(0, 0, 0, 0.5); display: flex;
            align-items: center; justify-content: center; z-index: 1000;
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background-color: var(--dark-surface); border: 1px solid var(--gray-700);
            border-radius: 0.5rem; padding: 1.5rem; min-width: 400px; max-width: 500px;
            max-height: 80vh; overflow-y: auto; color: var(--light-text);
        `;

        const c = this.config;

        dialog.innerHTML = `
            <h3 style="margin: 0 0 1rem 0; color: var(--light-text); font-size: 1.25rem;">🔥 Fireplace Configuration</h3>

            <div style="display: grid; gap: 1rem;">
                <div class="config-group">
                    <h4 style="margin: 0 0 0.5rem 0; color: var(--gray-300); font-size: 1rem;">🔥 Fire</h4>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Intensity: <span id="intensity-value">${(c.intensity * 100).toFixed(0)}%</span>
                        <input type="range" id="intensity" min="0.15" max="2" step="0.05" value="${c.intensity}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Flame Height: <span id="flame-height-value">${(c.flameHeight * 100).toFixed(0)}%</span>
                        <input type="range" id="flame-height" min="0.3" max="2.2" step="0.05" value="${c.flameHeight}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Flame Spread: <span id="flame-spread-value">${(c.flameSpread * 100).toFixed(0)}%</span>
                        <input type="range" id="flame-spread" min="0.2" max="2.5" step="0.05" value="${c.flameSpread}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Flame Density: <span id="flame-density-value">${(c.flameDensity * 100).toFixed(0)}%</span>
                        <input type="range" id="flame-density" min="0.2" max="2" step="0.05" value="${c.flameDensity}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Turbulence: <span id="turbulence-value">${(c.turbulence * 100).toFixed(0)}%</span>
                        <input type="range" id="turbulence" min="0" max="2.5" step="0.05" value="${c.turbulence}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Flicker Amount: <span id="flicker-amount-value">${(c.flickerAmount * 100).toFixed(0)}%</span>
                        <input type="range" id="flicker-amount" min="0" max="1" step="0.05" value="${c.flickerAmount}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Flicker Speed: <span id="flicker-speed-value">${c.flickerSpeed.toFixed(2)}x</span>
                        <input type="range" id="flicker-speed" min="0.2" max="3" step="0.05" value="${c.flickerSpeed}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Draft: <span id="draft-strength-value">${(c.draftStrength * 100).toFixed(0)}%</span>
                        <input type="range" id="draft-strength" min="0" max="1.5" step="0.05" value="${c.draftStrength}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                </div>

                <div class="config-group">
                    <h4 style="margin: 0 0 0.5rem 0; color: var(--gray-300); font-size: 1rem;">🎨 Colour</h4>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Wood Type:
                        <select id="palette" style="width: 100%; margin-top: 0.25rem; padding: 0.25rem; background: var(--gray-600); color: var(--light-text); border: 1px solid var(--gray-500); border-radius: 0.25rem;">
                            <option value="hardwood" ${c.palette === 'hardwood' ? 'selected' : ''}>🪵 Hardwood (deep orange)</option>
                            <option value="softwood" ${c.palette === 'softwood' ? 'selected' : ''}>🌲 Softwood (hot & yellow)</option>
                            <option value="ember" ${c.palette === 'ember' ? 'selected' : ''}>🌑 Burned Down (dark red)</option>
                            <option value="driftwood" ${c.palette === 'driftwood' ? 'selected' : ''}>🌊 Driftwood (green salt flame)</option>
                        </select>
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Heat: <span id="heat-value">${(c.heat * 100).toFixed(0)}%</span>
                        <input type="range" id="heat" min="0.4" max="2" step="0.05" value="${c.heat}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Flame Opacity: <span id="flame-opacity-value">${(c.flameOpacity * 100).toFixed(0)}%</span>
                        <input type="range" id="flame-opacity" min="0.15" max="1.4" step="0.05" value="${c.flameOpacity}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                </div>

                <div class="config-group">
                    <h4 style="margin: 0 0 0.5rem 0; color: var(--gray-300); font-size: 1rem;">🪵 Logs</h4>
                    <label style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                        <input type="checkbox" id="show-logs" ${c.showLogs ? 'checked' : ''}>
                        Show Logs
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Log Count: <span id="log-count-value">${c.logCount}</span>
                        <input type="range" id="log-count" min="2" max="10" step="1" value="${c.logCount}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Log Size: <span id="log-scale-value">${(c.logScale * 100).toFixed(0)}%</span>
                        <input type="range" id="log-scale" min="0.5" max="1.8" step="0.05" value="${c.logScale}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Log Thickness: <span id="log-thickness-value">${(c.logThickness * 100).toFixed(0)}%</span>
                        <input type="range" id="log-thickness" min="0.5" max="4" step="0.05" value="${c.logThickness}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Ember Glow: <span id="ember-glow-value">${(c.emberGlow * 100).toFixed(0)}%</span>
                        <input type="range" id="ember-glow" min="0" max="2" step="0.05" value="${c.emberGlow}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Coals: <span id="coal-count-value">${c.coalCount}</span>
                        <input type="range" id="coal-count" min="0" max="1200" step="10" value="${c.coalCount}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                    <label style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                        <input type="checkbox" id="pop-events" ${c.popEvents ? 'checked' : ''}>
                        Log Pops
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Pop Rate: <span id="pop-rate-value">${(c.popRate * 100).toFixed(0)}%</span>
                        <input type="range" id="pop-rate" min="0.2" max="3" step="0.1" value="${c.popRate}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                </div>

                <div class="config-group">
                    <h4 style="margin: 0 0 0.5rem 0; color: var(--gray-300); font-size: 1rem;">🌒 Atmosphere</h4>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Room Glow: <span id="room-glow-value">${(c.roomGlow * 100).toFixed(0)}%</span>
                        <input type="range" id="room-glow" min="0" max="2" step="0.05" value="${c.roomGlow}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Glow Radius: <span id="glow-radius-value">${(c.glowRadius * 100).toFixed(0)}%</span>
                        <input type="range" id="glow-radius" min="0.3" max="2" step="0.05" value="${c.glowRadius}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Background Darkness: <span id="background-darkness-value">${(c.backgroundDarkness * 100).toFixed(0)}%</span>
                        <input type="range" id="background-darkness" min="0" max="1" step="0.02" value="${c.backgroundDarkness}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Brick Wall:
                        <select id="brick-background" style="width: 100%; margin-top: 0.25rem; padding: 0.25rem; background: var(--gray-600); color: var(--light-text); border: 1px solid var(--gray-500); border-radius: 0.25rem;">
                            <option value="none" ${c.brickBackground === 'none' ? 'selected' : ''}>None</option>
                            <option value="subtle" ${c.brickBackground === 'subtle' ? 'selected' : ''}>Subtle</option>
                            <option value="semi" ${c.brickBackground === 'semi' ? 'selected' : ''}>Semi-Subtle</option>
                            <option value="visible" ${c.brickBackground === 'visible' ? 'selected' : ''}>Clearly Visible</option>
                        </select>
                    </label>
                    <label style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                        <input type="checkbox" id="sparks" ${c.sparks ? 'checked' : ''}>
                        Sparks
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Spark Rate: <span id="spark-rate-value">${(c.sparkRate * 100).toFixed(0)}%</span>
                        <input type="range" id="spark-rate" min="0.1" max="3" step="0.05" value="${c.sparkRate}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                    <label style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                        <input type="checkbox" id="smoke" ${c.smoke ? 'checked' : ''}>
                        Smoke
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Smoke Opacity: <span id="smoke-opacity-value">${(c.smokeOpacity * 100).toFixed(0)}%</span>
                        <input type="range" id="smoke-opacity" min="0" max="1" step="0.05" value="${c.smokeOpacity}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                </div>

                <div class="config-group">
                    <h4 style="margin: 0 0 0.5rem 0; color: var(--gray-300); font-size: 1rem;">🐾 Companion</h4>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Companion:
                        <select id="companion" style="width: 100%; margin-top: 0.25rem; padding: 0.25rem; background: var(--gray-600); color: var(--light-text); border: 1px solid var(--gray-500); border-radius: 0.25rem;">
                            <option value="none" ${c.companion === 'none' ? 'selected' : ''}>None</option>
                            <option value="cat" ${c.companion === 'cat' ? 'selected' : ''}>🐱 Cat</option>
                            <option value="dog" ${c.companion === 'dog' ? 'selected' : ''}>🐶 Dog</option>
                        </select>
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Activity: <span id="companion-activity-value">${(c.companionActivity * 100).toFixed(0)}%</span>
                        <input type="range" id="companion-activity" min="0.2" max="9" step="0.1" value="${c.companionActivity}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                </div>

                <div class="config-group">
                    <h4 style="margin: 0 0 0.5rem 0; color: var(--gray-300); font-size: 1rem;">🎄 Decorations</h4>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Decorations:
                        <select id="decorations" style="width: 100%; margin-top: 0.25rem; padding: 0.25rem; background: var(--gray-600); color: var(--light-text); border: 1px solid var(--gray-500); border-radius: 0.25rem;">
                            <option value="none" ${c.decorations === 'none' ? 'selected' : ''}>None</option>
                            <option value="auto" ${c.decorations === 'auto' ? 'selected' : ''}>Auto (Seasonal)</option>
                            <option value="holiday" ${c.decorations === 'holiday' ? 'selected' : ''}>🎄 Christmas</option>
                            <option value="halloween" ${c.decorations === 'halloween' ? 'selected' : ''}>🎃 Halloween</option>
                            <option value="birthday" ${c.decorations === 'birthday' ? 'selected' : ''}>🎉 Birthday</option>
                        </select>
                    </label>
                </div>

                <div class="config-group">
                    <h4 style="margin: 0 0 0.5rem 0; color: var(--gray-300); font-size: 1rem;">⚙️ Performance</h4>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Max Particles: <span id="max-particles-value">${c.maxParticles}</span>
                        <input type="range" id="max-particles" min="200" max="4000" step="50" value="${c.maxParticles}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Flame Softness: <span id="softness-value">${c.softness}x</span>
                        <input type="range" id="softness" min="1" max="6" step="1" value="${c.softness}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                </div>
            </div>

            <div style="display: flex; gap: 0.5rem; margin-top: 1.5rem; justify-content: flex-end;">
                <button id="reset-fireplace-config" style="padding: 0.5rem 1rem; background: var(--gray-600); color: white; border: none; border-radius: 0.25rem; cursor: pointer;">
                    Reset to Defaults
                </button>
                <button id="cancel-fireplace-config" style="padding: 0.5rem 1rem; background: var(--gray-600); color: white; border: none; border-radius: 0.25rem; cursor: pointer;">
                    Cancel
                </button>
                <button id="apply-fireplace-config" style="padding: 0.5rem 1rem; background: var(--accent-blue); color: white; border: none; border-radius: 0.25rem; cursor: pointer;">
                    Apply
                </button>
            </div>
        `;

        modal.appendChild(dialog);
        document.body.appendChild(modal);

        this.addFireplaceConfigInfoIcons(dialog);
        this.attachConfigEventListeners(dialog);

        dialog.querySelector('#reset-fireplace-config').addEventListener('click', () => {
            this.resetConfigDialog(dialog);
        });

        dialog.querySelector('#cancel-fireplace-config').addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        dialog.querySelector('#apply-fireplace-config').addEventListener('click', () => {
            this.applyConfig(dialog);
            document.body.removeChild(modal);
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
    }

    configSliders() {
        const percent = (v) => (parseFloat(v) * 100).toFixed(0) + '%';
        return [
            { id: 'intensity', valueId: 'intensity-value', format: percent },
            { id: 'flame-height', valueId: 'flame-height-value', format: percent },
            { id: 'flame-spread', valueId: 'flame-spread-value', format: percent },
            { id: 'flame-density', valueId: 'flame-density-value', format: percent },
            { id: 'turbulence', valueId: 'turbulence-value', format: percent },
            { id: 'flicker-amount', valueId: 'flicker-amount-value', format: percent },
            { id: 'flicker-speed', valueId: 'flicker-speed-value', format: (v) => parseFloat(v).toFixed(2) + 'x' },
            { id: 'draft-strength', valueId: 'draft-strength-value', format: percent },
            { id: 'heat', valueId: 'heat-value', format: percent },
            { id: 'flame-opacity', valueId: 'flame-opacity-value', format: percent },
            { id: 'log-count', valueId: 'log-count-value', format: (v) => v },
            { id: 'log-scale', valueId: 'log-scale-value', format: percent },
            { id: 'log-thickness', valueId: 'log-thickness-value', format: percent },
            { id: 'ember-glow', valueId: 'ember-glow-value', format: percent },
            { id: 'coal-count', valueId: 'coal-count-value', format: (v) => v },
            { id: 'pop-rate', valueId: 'pop-rate-value', format: percent },
            { id: 'room-glow', valueId: 'room-glow-value', format: percent },
            { id: 'glow-radius', valueId: 'glow-radius-value', format: percent },
            { id: 'background-darkness', valueId: 'background-darkness-value', format: percent },
            { id: 'spark-rate', valueId: 'spark-rate-value', format: percent },
            { id: 'smoke-opacity', valueId: 'smoke-opacity-value', format: percent },
            { id: 'companion-activity', valueId: 'companion-activity-value', format: percent },
            { id: 'max-particles', valueId: 'max-particles-value', format: (v) => v },
            { id: 'softness', valueId: 'softness-value', format: (v) => v + 'x' }
        ];
    }

    attachConfigEventListeners(dialog) {
        this.configSliders().forEach(slider => {
            const element = dialog.querySelector(`#${slider.id}`);
            const valueElement = dialog.querySelector(`#${slider.valueId}`);
            if (!element || !valueElement) return;

            element.addEventListener('input', (e) => {
                valueElement.textContent = slider.format(e.target.value);
            });
        });
    }

    addFireplaceConfigInfoIcons(dialog) {
        const configs = [
            { label: 'Intensity:', description: 'Master control: how hard the fire burns, and how far its light reaches', default: '100%' },
            { label: 'Flame Height:', description: 'How strongly hot gas rises, and how long each flame lives before cooling out', default: '150%' },
            { label: 'Flame Spread:', description: 'How far the flame fans sideways as it climbs', default: '100%' },
            { label: 'Flame Density:', description: 'How much flame is emitted per second; thicker fire, more GPU work', default: '100%' },
            { label: 'Turbulence:', description: 'How violently rising air breaks the column into separate tongues', default: '100%' },
            { label: 'Flicker Amount:', description: 'How much each part of the fire swells and sinks over time', default: '55%' },
            { label: 'Flicker Speed:', description: 'How quickly the fire breathes; low is a lazy fire, high is a windy one', default: '1.00x' },
            { label: 'Draft:', description: 'A slow wandering sideways lean, as if air were moving through the room', default: '35%' },
            { label: 'Heat:', description: 'Shifts the whole flame up the temperature ramp toward white-hot', default: '100%' },
            { label: 'Flame Opacity:', description: 'Overall brightness of the flame layer; turn down if it washes out the page', default: '100%' },
            { label: 'Log Count:', description: 'How many logs are stacked across the bottom of the screen', default: '4 logs' },
            { label: 'Log Size:', description: 'Overall scale of the logs, length and girth together; larger logs also raise where the flame starts', default: '100%' },
            { label: 'Log Thickness:', description: 'Girth of the logs relative to their length, independent of overall size', default: '250%' },
            { label: 'Ember Glow:', description: 'Brightness of the glowing cracks and hot contact points on the logs', default: '100%' },
            { label: 'Coals:', description: 'Number of glowing coals scattered through the ash bed', default: '660 coals' },
            { label: 'Pop Rate:', description: 'How often a log pops with a flash, a shower of sparks, and a brief flare', default: '100%' },
            { label: 'Room Glow:', description: 'Warm firelight thrown across the rest of the screen; pulses with the fire', default: '100%' },
            { label: 'Glow Radius:', description: 'How far that firelight spreads before falling off to black', default: '100%' },
            { label: 'Background Darkness:', description: 'How dark the unlit room is; lower it if the page feels too black', default: '88%' },
            { label: 'Spark Rate:', description: 'How often embers are thrown up out of the fire', default: '100%' },
            { label: 'Smoke Opacity:', description: 'How visible the smoke rising off the flame tips is', default: '22%' },
            { label: 'Activity:', description: "How often the companion wakes up to stretch and stand; lower it and it mostly just sleeps", default: '300%' },
            { label: 'Max Particles:', description: 'Ceiling on live flame particles; the main cost of the animation', default: '1400 particles' },
            { label: 'Flame Softness:', description: 'How far the flame buffer is downscaled before being blown back up. Higher is softer and cheaper, lower is sharper and slower', default: '2x' }
        ];

        configs.forEach(config => {
            const labels = dialog.querySelectorAll('label');
            for (const label of labels) {
                if (label.textContent.includes(config.label)) {
                    const valueSpan = label.querySelector('span[id$="-value"]');
                    if (valueSpan) {
                        const icon = createInfoIcon(config.description, config.default);
                        valueSpan.parentNode.insertBefore(icon, valueSpan.nextSibling);
                    }
                    break;
                }
            }
        });
    }

    defaults() {
        return WP.settings.defaults();
    }

    resetConfigDialog(dialog) {
        const defaults = this.defaults();

        Object.keys(defaults).forEach(key => {
            if (key === 'palette' || key === 'brickBackground' || key === 'companion' || key === 'decorations') return;

            const element = dialog.querySelector(`#${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`);
            if (!element) return;

            if (element.type === 'checkbox') {
                element.checked = defaults[key];
            } else {
                element.value = defaults[key];
                element.dispatchEvent(new Event('input'));
            }
        });

        dialog.querySelector('#palette').value = defaults.palette;
        dialog.querySelector('#brick-background').value = defaults.brickBackground;
        dialog.querySelector('#companion').value = defaults.companion;
        dialog.querySelector('#decorations').value = defaults.decorations;
    }

    applyConfig(dialog) {
        const c = this.config;

        c.intensity = parseFloat(dialog.querySelector('#intensity').value);
        c.flameHeight = parseFloat(dialog.querySelector('#flame-height').value);
        c.flameSpread = parseFloat(dialog.querySelector('#flame-spread').value);
        c.flameDensity = parseFloat(dialog.querySelector('#flame-density').value);
        c.turbulence = parseFloat(dialog.querySelector('#turbulence').value);
        c.flickerAmount = parseFloat(dialog.querySelector('#flicker-amount').value);
        c.flickerSpeed = parseFloat(dialog.querySelector('#flicker-speed').value);
        c.draftStrength = parseFloat(dialog.querySelector('#draft-strength').value);

        c.palette = dialog.querySelector('#palette').value;
        c.heat = parseFloat(dialog.querySelector('#heat').value);
        c.flameOpacity = parseFloat(dialog.querySelector('#flame-opacity').value);

        c.showLogs = dialog.querySelector('#show-logs').checked;
        c.logCount = parseInt(dialog.querySelector('#log-count').value);
        c.logScale = parseFloat(dialog.querySelector('#log-scale').value);
        c.logThickness = parseFloat(dialog.querySelector('#log-thickness').value);
        c.emberGlow = parseFloat(dialog.querySelector('#ember-glow').value);
        c.coalCount = parseInt(dialog.querySelector('#coal-count').value);
        c.popEvents = dialog.querySelector('#pop-events').checked;
        c.popRate = parseFloat(dialog.querySelector('#pop-rate').value);

        c.roomGlow = parseFloat(dialog.querySelector('#room-glow').value);
        c.glowRadius = parseFloat(dialog.querySelector('#glow-radius').value);
        c.backgroundDarkness = parseFloat(dialog.querySelector('#background-darkness').value);
        c.brickBackground = dialog.querySelector('#brick-background').value;
        c.sparks = dialog.querySelector('#sparks').checked;
        c.sparkRate = parseFloat(dialog.querySelector('#spark-rate').value);
        c.smoke = dialog.querySelector('#smoke').checked;
        c.smokeOpacity = parseFloat(dialog.querySelector('#smoke-opacity').value);

        c.companion = dialog.querySelector('#companion').value;
        c.companionActivity = parseFloat(dialog.querySelector('#companion-activity').value);
        c.decorations = dialog.querySelector('#decorations').value;

        c.maxParticles = parseInt(dialog.querySelector('#max-particles').value);
        c.softness = parseInt(dialog.querySelector('#softness').value);

        // The palette and heat are baked into the sprites, and the buffer size
        // is baked into the canvases, so both have to be rebuilt on apply
        this.buildSprites();
        this.resizeCanvas();
        this.rebuildScene();

        if (this.flames.length > c.maxParticles) {
            this.flames.length = c.maxParticles;
        }

        this.saveConfig();
        console.log('Fireplace config applied:', this.config);
    }

    destroy() {
        this.stop();
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
    }
}
