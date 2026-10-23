// Zen Garden (SPEC §10.11): raked sand seen from above. Drag to rake; the
// wind slowly smooths what you draw; an unseen gardener tends it when you
// don't.
//
// Layers, all in device px: `base` is clean sand (grain and mottling, built
// once per resize), `sand` is the garden (base plus every groove, kept
// between frames), `top` is the stones, moss, settled leaves and light
// (built once). The screen is `sand` then `top`, copied only where
// something changed. A rake stroke draws onto `sand` as it goes: first the
// clean base under each tine (so a new pass replaces the old pattern), then
// a dark groove and a pale ridge for each tine. Frames run only while a
// stroke is being drawn or a leaf is falling; otherwise the stage idles
// until the next gust of wind or the gardener's next stroke.

const ZEN_SANDS = {
    white: {
        base: [232, 229, 221], grain: 13, speckRate: 0.07,
        specks: [[150, 146, 138], [252, 252, 250], [186, 181, 172], [120, 116, 110]],
        groove: 'rgba(92, 84, 72, 0.40)', ridge: 'rgba(255, 255, 255, 0.78)',
        light: 'rgba(255, 246, 228, 0.10)', vignette: 'rgba(48, 40, 30, 0.26)',
    },
    slate: {
        base: [76, 79, 84], grain: 11, speckRate: 0.08,
        specks: [[44, 46, 50], [128, 132, 138], [100, 103, 110], [60, 58, 56]],
        groove: 'rgba(14, 16, 20, 0.55)', ridge: 'rgba(196, 202, 210, 0.30)',
        light: 'rgba(220, 230, 255, 0.06)', vignette: 'rgba(0, 0, 0, 0.40)',
    },
    warm: {
        base: [219, 199, 163], grain: 12, speckRate: 0.05,
        specks: [[170, 146, 110], [246, 232, 204], [150, 124, 92], [196, 172, 136]],
        groove: 'rgba(112, 78, 42, 0.38)', ridge: 'rgba(255, 248, 230, 0.62)',
        light: 'rgba(255, 230, 190, 0.10)', vignette: 'rgba(70, 44, 20, 0.26)',
    },
};

// Stone colours: [base, light, dark].
const ZEN_STONES = [
    [[126, 124, 120], [200, 196, 188], [46, 44, 42]],     // granite
    [[78, 78, 80], [150, 150, 152], [22, 22, 24]],        // basalt
    [[122, 106, 88], [190, 172, 150], [46, 38, 30]],      // weathered brown
    [[104, 112, 118], [176, 184, 190], [36, 40, 44]],     // blue-grey
];
const ZEN_MOSS = ['#3f5a26', '#56722f', '#6c8a38', '#88a447', '#4a6b2c', '#a3b85a'];

class ZenGardenAnimationManager {
    constructor(host) {
        this.host = host;
        this.config = WP.settings.load();
        this.density = host.quality.density;
        this.running = false;
        this.frame = null;
        this.last = 0;
        this.rake = null;            // the stroke a finger is drawing
        this.gardenerStroke = null;  // the gardener's stroke in progress
        this.planIndex = 0;
        this.visitors = [];          // leaves and petals still falling
        this.settled = [];           // ...and those lying on the sand
        this.strokes = 0;            // finished rake strokes, for tests
        const stored = host.storage.get('seed');
        this.seed = host.params.seed ? Number(host.params.seed) || 1 : Number.isInteger(stored) ? stored : 1;
        this.loop = this.loop.bind(this);
        this.onResize = () => { this.build(); this.composite(true); this.wake(); };
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.canvas = document.createElement('canvas');
        Object.assign(this.canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: '-1', pointerEvents: 'none' });
        document.body.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
        window.addEventListener('resize', this.onResize);
        this.bindTouch();
        this.build();
        this.composite(true);
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

    // ---- Settings and quality --------------------------------------------

    applySettings(next) {
        const before = this.config;
        this.config = next;
        const garden = ['sand', 'stones', 'tines', 'grooveSpacing'].some(key => before[key] !== next[key]);
        if (garden) { this.build(); this.composite(true); }
        if (before.touch !== next.touch) this.bindTouch();
        if (before.season !== next.season) this.planVisitors(true);
        this.windEvery = ZenGeometry.windInterval(next.fadeMinutes);
        this.nextGardenerAt = Math.min(this.nextGardenerAt, performance.now() + next.gardenerDelay * 1000);
        this.wake();
    }

    // Density thins the falling leaves; nothing else here costs per frame.
    onQuality(quality) {
        this.density = quality.density;
    }

    bindTouch() {
        this.stopGestures?.();
        this.stopGestures = null;
        document.documentElement.style.touchAction = this.config.touch === 'rake' ? 'none' : '';
        if (this.config.touch !== 'rake') return;
        this.stopGestures = this.host.gestures({
            start: (x, y) => this.rakeStart(x, y),
            move: (x, y) => this.rakeMove(x, y),
            end: () => this.rakeEnd(),
        });
    }

    // Out of an idle: clear the deadline and ask for a frame now.
    wake() {
        if (!this.running) return;
        this.host.idleUntil(0);
        cancelAnimationFrame(this.frame);
        this.frame = requestAnimationFrame(this.loop);
    }

    // ---- Building the garden ---------------------------------------------

    build() {
        const dpr = this.dpr = Math.min(window.devicePixelRatio || 1, 2);
        const width = this.width = window.innerWidth, height = this.height = window.innerHeight;
        this.canvas.width = Math.round(width * dpr);
        this.canvas.height = Math.round(height * dpr);
        this.palette = ZEN_SANDS[this.config.sand] || ZEN_SANDS.white;
        this.groove = this.config.grooveSpacing;
        this.rakeWidth = this.groove * this.config.tines;
        this.step = Math.max(2, this.groove * 0.2);

        const random = WP.seededRandom(this.seed * 7919 + 13);
        this.stones = ZenGeometry.layoutStones(random, {
            width, height, count: this.config.stones, unit: Math.sqrt(width * height),
            rake: this.rakeWidth, groove: this.groove, bottom: this.host.insets.bottom,
        });
        this.plan = ZenGeometry.gardenPlan({ width, height, stones: this.stones, rake: this.rakeWidth, step: this.step });
        this.planIndex = 0;

        this.base = this.buildBase(random);
        this.sand = this.layer();
        this.sandCtx = this.sand.getContext('2d');
        this.sandCtx.drawImage(this.base, 0, 0);
        this.sandCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.wipe = this.sandCtx.createPattern(this.base, 'no-repeat');
        this.wipe.setTransform(new DOMMatrix([1 / dpr, 0, 0, 1 / dpr, 0, 0]));

        // The first frame is a garden already tended: every row, every ring.
        for (const stroke of this.plan) this.rakeSamples(stroke.samples, stroke);

        this.settled = [];
        this.visitors = [];
        this.top = null;
        this.buildSprites();
        this.planVisitors(true);
        this.top = this.buildTop();

        const now = performance.now();
        this.windEvery = ZenGeometry.windInterval(this.config.fadeMinutes);
        this.nextWindAt = now + this.windEvery * 1000;
        this.nextGardenerAt = now + this.config.gardenerDelay * 1000;
        this.gardenerStroke = null;
        this.rake = null;
    }

    layer() {
        const canvas = document.createElement('canvas');
        canvas.width = this.canvas.width;
        canvas.height = this.canvas.height;
        return canvas;
    }

    // Clean sand: a tile of grain and specks, repeated, with soft mottling
    // over it so it doesn't look printed.
    buildBase(random) {
        const p = this.palette, size = 256;
        const tile = document.createElement('canvas');
        tile.width = tile.height = size;
        const tctx = tile.getContext('2d');
        const image = tctx.createImageData(size, size), data = image.data;
        const speck = Math.max(1, Math.round(this.dpr));
        for (let i = 0; i < size * size; i++) {
            const n = (random() + random() + random() - 1.5) * p.grain;
            const warm = (random() - 0.5) * 3;
            data[i * 4] = p.base[0] + n + warm;
            data[i * 4 + 1] = p.base[1] + n;
            data[i * 4 + 2] = p.base[2] + n - warm;
            data[i * 4 + 3] = 255;
        }
        const specks = size * size * p.speckRate / (speck * speck * 3);
        for (let k = 0; k < specks; k++) {
            const [r, g, b] = p.specks[Math.floor(random() * p.specks.length)];
            const x0 = Math.floor(random() * size), y0 = Math.floor(random() * size);
            const s = random() < 0.25 ? speck + 1 : speck;
            for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
                const i = (((y0 + y) % size) * size + ((x0 + x) % size)) * 4;
                const edge = (s > 1 && (x === 0 || y === 0 || x === s - 1 || y === s - 1)) ? 0.5 : 1;
                data[i] += (r - data[i]) * edge;
                data[i + 1] += (g - data[i + 1]) * edge;
                data[i + 2] += (b - data[i + 2]) * edge;
            }
        }
        tctx.putImageData(image, 0, 0);

        const base = this.layer(), ctx = base.getContext('2d');
        ctx.fillStyle = ctx.createPattern(tile, 'repeat');
        ctx.fillRect(0, 0, base.width, base.height);
        // Mottling: a few dozen random values, smoothly stretched over the screen.
        const mottle = document.createElement('canvas');
        mottle.width = 18; mottle.height = 12;
        const mctx = mottle.getContext('2d');
        for (let y = 0; y < 12; y++) for (let x = 0; x < 18; x++) {
            const v = Math.round(random() * 255);
            mctx.fillStyle = `rgb(${v},${v},${v})`;
            mctx.fillRect(x, y, 1, 1);
        }
        ctx.globalCompositeOperation = 'soft-light';
        ctx.globalAlpha = 0.22;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(mottle, 0, 0, base.width, base.height);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        return base;
    }

    // ---- Raking -----------------------------------------------------------

    // Draw a run of rake samples ({ x, y, tx, ty }: centre and unit tangent)
    // onto the sand. Rows keep out of every stone's ring zone; rings and
    // free strokes keep out of the stones, and free strokes bend around them.
    rakeSamples(samples, stroke) {
        if (samples.length < 2) return null;
        const ctx = this.sandCtx, g = this.groove, n = this.config.tines;
        const bend = stroke.kind === 'free';
        const keep = this.stones.map(s => ({ x: s.x, y: s.y, keep: s.keep }));
        const band = this.rakeWidth * 0.7;
        // Light comes from the upper left: each groove's far wall catches it
        // (the ridge, offset away from the light) and its near wall is shaded.
        // Offsets are sideways to the tine's own direction, so a chunk's
        // lines end exactly where the next chunk's begin; a groove running
        // along the light shows less relief, as real sand does.
        const lx = 0.55, ly = 0.83;
        const wipe = new Path2D(), dark = new Path2D(), pale = new Path2D();
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (let i = 0; i < n; i++) {
            const offset = (i - (n - 1) / 2) * g;
            for (let k = 0; k < samples.length; k++) {
                const s = samples[k];
                let x = s.x - s.ty * offset, y = s.y + s.tx * offset, dx = s.tx, dy = s.ty;
                if (bend) {
                    const p = ZenGeometry.deflect(x, y, keep, band);
                    const q = ZenGeometry.deflect(x + s.tx, y + s.ty, keep, band);
                    const length = Math.hypot(q.x - p.x, q.y - p.y) || 1;
                    x = p.x; y = p.y; dx = (q.x - p.x) / length; dy = (q.y - p.y) / length;
                }
                const facing = (-dy * lx + dx * ly) * g;
                const ox = -dy * facing, oy = dx * facing;
                const op = k ? 'lineTo' : 'moveTo';
                wipe[op](x, y);
                dark[op](x - ox * 0.12, y - oy * 0.12);
                pale[op](x + ox * 0.3, y + oy * 0.3);
                if (x < x0) x0 = x; if (x > x1) x1 = x;
                if (y < y0) y0 = y; if (y > y1) y1 = y;
            }
        }
        ctx.save();
        const clip = this.clipFor(stroke);
        if (clip) ctx.clip(clip, 'evenodd');
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = this.wipe;
        ctx.lineWidth = g * 1.08;
        ctx.stroke(wipe);
        ctx.strokeStyle = this.palette.ridge;
        ctx.lineWidth = g * 0.22;
        ctx.stroke(pale);
        ctx.strokeStyle = this.palette.groove;
        ctx.lineWidth = g * 0.34;
        ctx.stroke(dark);
        ctx.restore();
        return { x0: x0 - g, y0: y0 - g, x1: x1 + g, y1: y1 + g };
    }

    // The screen with holes where this stroke mustn't go.
    clipFor(stroke) {
        const holes = this.stones.map((s, i) => stroke.kind === 'row' ? s.zone : stroke.stone === i ? 0 : s.keep);
        if (!holes.some(Boolean)) return null;
        const path = new Path2D();
        path.rect(-50, -50, this.width + 100, this.height + 100);
        this.stones.forEach((s, i) => {
            if (!holes[i]) return;
            path.moveTo(s.x + holes[i], s.y);
            path.arc(s.x, s.y, holes[i], 0, Math.PI * 2);
        });
        return path;
    }

    rakeStart(x, y) {
        this.touched();
        this.gardenerStroke = null;
        this.rake = { points: [{ x, y }], segment: 0, last: null, tangent: null, ended: false, fresh: true };
        this.wake();
    }

    rakeMove(x, y) {
        if (!this.rake) return;
        this.touched();
        const points = this.rake.points, last = points[points.length - 1];
        if (Math.hypot(x - last.x, y - last.y) < this.groove * 0.6) return;
        points.push({ x, y });
        this.rake.fresh = true;
    }

    rakeEnd() {
        if (!this.rake) return;
        this.touched();
        this.rake.ended = true;
        this.rake.fresh = true;
        this.wake();
    }

    touched() {
        this.nextGardenerAt = performance.now() + this.config.gardenerDelay * 1000;
    }

    // Draw whatever of the finger's path is now settled: a Catmull-Rom
    // segment needs the point after its end, so the last one waits for the
    // next move, or for the lift. The rake turns smoothly: its tangent eases
    // towards the path's over about one groove of travel.
    advanceRake() {
        const rake = this.rake, points = rake.points;
        const ready = rake.ended ? points.length - 1 : points.length - 2;
        const samples = rake.last ? [rake.last] : [];
        while (rake.segment < ready) samples.push(...ZenGeometry.splineSegment(points, rake.segment++, this.step));
        if (rake.ended && points.length > 1) {
            const end = points[points.length - 1];
            samples.push({ x: end.x, y: end.y, tx: 0, ty: 0 });
        }
        for (let k = rake.last ? 1 : 0; k < samples.length; k++) {
            const s = samples[k], prev = samples[k - 1] || null;
            let tx = s.tx, ty = s.ty;
            if (!tx && !ty) ({ tx, ty } = rake.tangent || { tx: 1, ty: 0 });
            if (rake.tangent) {
                const ease = 1 - Math.exp(-(prev ? Math.hypot(s.x - prev.x, s.y - prev.y) : 0) / (this.groove * 1.2));
                tx = rake.tangent.tx + (tx - rake.tangent.tx) * ease;
                ty = rake.tangent.ty + (ty - rake.tangent.ty) * ease;
                const length = Math.hypot(tx, ty) || 1;
                tx /= length; ty /= length;
            }
            rake.tangent = { tx, ty };
            samples[k] = { x: s.x, y: s.y, tx, ty };
        }
        if (samples.length) rake.last = samples[samples.length - 1];
        const dirty = this.rakeSamples(samples, { kind: 'free' });
        if (dirty) this.markDirty(dirty);
        rake.fresh = false;
        if (rake.ended) {
            this.rake = null;
            this.strokes++;
        }
    }

    // ---- Keys -----------------------------------------------------------------

    // N: stones somewhere new, remembered for next time.
    newGarden() {
        this.seed = 1 + Math.floor(Math.random() * 1e6);
        this.host.storage.set('seed', this.seed);
        this.build();
        this.composite(true);
        this.wake();
    }

    // R: every row and ring at once, as on the first frame.
    rakeAll() {
        this.rake = this.gardenerStroke = null;
        this.sandCtx.save();
        this.sandCtx.setTransform(1, 0, 0, 1, 0, 0);
        this.sandCtx.drawImage(this.base, 0, 0);
        this.sandCtx.restore();
        for (const stroke of this.plan) this.rakeSamples(stroke.samples, stroke);
        this.touched();
        this.composite(true);
        this.wake();
    }

    // E: smooth sand to draw on, until the gardener comes back.
    smooth() {
        this.rake = this.gardenerStroke = null;
        this.sandCtx.save();
        this.sandCtx.setTransform(1, 0, 0, 1, 0, 0);
        this.sandCtx.drawImage(this.base, 0, 0);
        this.sandCtx.restore();
        this.planIndex = 0;
        this.touched();
        this.composite(true);
        this.wake();
    }

    // ---- The gardener ---------------------------------------------------------

    beginGardenerStroke(now) {
        if (!this.plan.length) return;
        const stroke = this.plan[this.planIndex];
        this.planIndex = (this.planIndex + 1) % this.plan.length;
        this.gardenerStroke = { ...stroke, at: 0, travel: 0, lastRound: this.planIndex === 0 };
    }

    // The gardener walks slowly; a long row takes several seconds.
    advanceGardener(dt, now) {
        const stroke = this.gardenerStroke;
        stroke.travel += dt * 170;
        const upTo = Math.min(stroke.samples.length - 1, Math.floor(stroke.travel / this.step));
        if (upTo > stroke.at) {
            const dirty = this.rakeSamples(stroke.samples.slice(stroke.at, upTo + 1), stroke);
            if (dirty) this.markDirty(dirty);
            stroke.at = upTo;
        }
        if (stroke.at >= stroke.samples.length - 1) {
            this.gardenerStroke = null;
            this.strokes++;
            // A breath between strokes; a longer rest after a whole round.
            this.nextGardenerAt = now + (stroke.lastRound ? this.config.gardenerDelay * 1000 : 3000 + Math.random() * 3000);
        }
    }

    // ---- Wind -----------------------------------------------------------------

    blowWind(now) {
        const ctx = this.sandCtx;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = ZenGeometry.windAlpha(this.config.fadeMinutes, this.windEvery);
        ctx.drawImage(this.base, 0, 0);
        ctx.restore();
        this.nextWindAt = now + this.windEvery * 1000;
        this.markDirty(null);
    }

    // ---- Stones, moss and light -------------------------------------------------

    buildTop() {
        const top = this.layer(), ctx = top.getContext('2d'), dpr = this.dpr;
        const w = this.width, h = this.height;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Shadows, blurred by drawing small and scaling up twice.
        const blur = (draw, scale) => {
            const small = document.createElement('canvas');
            small.width = Math.ceil(w / scale); small.height = Math.ceil(h / scale);
            const sctx = small.getContext('2d');
            sctx.scale(1 / scale, 1 / scale);
            draw(sctx);
            const smaller = document.createElement('canvas');
            smaller.width = Math.ceil(small.width / 2); smaller.height = Math.ceil(small.height / 2);
            const s2 = smaller.getContext('2d');
            s2.imageSmoothingQuality = 'high';
            s2.drawImage(small, 0, 0, smaller.width, smaller.height);
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(smaller, 0, 0, w, h);
        };
        blur(sctx => {
            sctx.fillStyle = 'rgba(20, 16, 10, 0.55)';
            for (const s of this.stones) {
                sctx.save();
                sctx.translate(s.r * 0.22, s.r * 0.3);
                sctx.fill(this.stonePath(s, 1.05));
                sctx.restore();
            }
        }, 8);
        blur(sctx => {
            sctx.fillStyle = 'rgba(14, 10, 6, 0.6)';
            for (const s of this.stones) {
                sctx.save();
                sctx.translate(s.r * 0.06, s.r * 0.08);
                sctx.fill(this.stonePath(s, 1.02));
                sctx.restore();
            }
        }, 3);

        for (const stone of this.stones) this.drawStone(ctx, stone);
        for (const leaf of this.settled) this.drawSettled(ctx, leaf);

        // Light from the upper left, and the edges falling into shade.
        const light = ctx.createLinearGradient(0, 0, w, h);
        light.addColorStop(0, this.palette.light);
        light.addColorStop(0.6, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = light;
        ctx.fillRect(0, 0, w, h);
        const vignette = ctx.createRadialGradient(w * 0.45, h * 0.42, Math.min(w, h) * 0.3, w * 0.5, h * 0.5, Math.hypot(w, h) * 0.62);
        vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
        vignette.addColorStop(1, this.palette.vignette);
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, w, h);
        return top;
    }

    // An irregular, faceted outline: long radius r, short r / stretch.
    stonePath(stone, grow = 1) {
        if (!stone.outline) {
            const random = WP.seededRandom(stone.seed);
            const n = 16, phases = [random() * 6.3, random() * 6.3, random() * 6.3];
            stone.outline = [];
            for (let k = 0; k < n; k++) {
                const a = k / n * Math.PI * 2;
                const wobble = 1 + 0.07 * Math.sin(2 * a + phases[0]) + 0.05 * Math.sin(3 * a + phases[1]) + 0.04 * Math.sin(5 * a + phases[2]) + (random() - 0.5) * 0.06;
                const rx = Math.cos(a) * stone.r, ry = Math.sin(a) * stone.r / stone.stretch;
                const c = Math.cos(stone.angle), s = Math.sin(stone.angle);
                stone.outline.push([(rx * c - ry * s) * wobble * 0.92, (rx * s + ry * c) * wobble * 0.92]);
            }
        }
        const path = new Path2D(), pts = stone.outline, n = pts.length;
        const at = k => [stone.x + pts[(k + n) % n][0] * grow, stone.y + pts[(k + n) % n][1] * grow];
        const mid = k => { const a = at(k), b = at(k + 1); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
        path.moveTo(...mid(0));
        for (let k = 1; k <= n; k++) path.quadraticCurveTo(...at(k), ...mid(k));
        path.closePath();
        return path;
    }

    drawStone(ctx, stone) {
        const random = WP.seededRandom(stone.seed + 1);
        const [base, light, dark] = ZEN_STONES[stone.seed % ZEN_STONES.length];
        const rgb = (c, a = 1) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
        const { x, y, r } = stone;
        const outline = this.stonePath(stone);

        // Moss collar where the stone meets the sand, thicker on the shaded side.
        this.drawMoss(ctx, stone, random, true);

        ctx.save();
        const body = ctx.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.05, x - r * 0.1, y - r * 0.1, r * 1.25);
        body.addColorStop(0, rgb(light));
        body.addColorStop(0.45, rgb(base));
        body.addColorStop(1, rgb(dark));
        ctx.fillStyle = body;
        ctx.fill(outline);
        ctx.clip(outline);
        // Grain of the rock: fine specks, and a vein or two of quartz.
        for (let k = 0; k < r * r / 18; k++) {
            const a = random() * Math.PI * 2, d = Math.sqrt(random()) * r;
            ctx.fillStyle = random() < 0.5 ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.18)';
            ctx.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d, 0.6 + random() * 1.1, 0.6 + random() * 1.1);
        }
        for (let v = 0; v < (random() < 0.6 ? 1 : 2); v++) {
            const a = stone.angle + (random() - 0.5) * 1.2, off = (random() - 0.5) * r;
            const cx = x - Math.sin(a) * off, cy = y + Math.cos(a) * off;
            ctx.beginPath();
            ctx.moveTo(cx - Math.cos(a) * r * 1.2, cy - Math.sin(a) * r * 1.2);
            ctx.quadraticCurveTo(cx + (random() - 0.5) * r * 0.5, cy + (random() - 0.5) * r * 0.5, cx + Math.cos(a) * r * 1.2, cy + Math.sin(a) * r * 1.2);
            ctx.strokeStyle = `rgba(235, 230, 220, ${0.18 + random() * 0.2})`;
            ctx.lineWidth = 0.8 + random() * 1.4;
            ctx.stroke();
        }
        // Soft top light and a darker underside, for weight.
        const sheen = ctx.createRadialGradient(x - r * 0.35, y - r * 0.45, 0, x - r * 0.35, y - r * 0.45, r * 0.7);
        sheen.addColorStop(0, 'rgba(255, 252, 240, 0.28)');
        sheen.addColorStop(1, 'rgba(255, 252, 240, 0)');
        ctx.fillStyle = sheen;
        ctx.fillRect(x - r * 1.5, y - r * 1.5, r * 3, r * 3);
        ctx.restore();
        ctx.strokeStyle = 'rgba(20, 16, 12, 0.35)';
        ctx.lineWidth = 1;
        ctx.stroke(outline);

        // Moss creeping up onto the rock on some stones.
        if (random() < 0.6) this.drawMoss(ctx, stone, random, false);
    }

    // The stone's radius towards angle a, near enough for placing moss.
    radiusAt(stone, a) {
        const along = Math.cos(a - stone.angle), across = Math.sin(a - stone.angle) * stone.stretch;
        return stone.r * 0.92 / Math.hypot(along, across);
    }

    // Moss: cushions packed tight in mixed greens. `collar` hugs the foot
    // of the stone, thickest on its shaded (lower right) side and thinning
    // to bare rock; otherwise it's a patch on top of the stone.
    drawMoss(ctx, stone, random, collar) {
        const { x, y, r } = stone;
        const blobs = [];
        if (collar) {
            const p1 = random() * 6.3, p2 = random() * 6.3;
            for (let a = 0; a < Math.PI * 2; a += 2 / r) {
                const cover = 0.55 * Math.cos(a - Math.PI * 0.28) + 0.35 * Math.sin(2 * a + p1) + 0.2 * Math.sin(5 * a + p2);
                if (cover <= 0) continue;
                const rho = this.radiusAt(stone, a);
                for (let k = 0; k < 2; k++) {
                    const d = rho * (0.97 + random() * 0.09 * (0.5 + cover));
                    blobs.push([x + Math.cos(a) * d, y + Math.sin(a) * d, (1.3 + random() * 2.6) * Math.min(1, 0.4 + cover)]);
                }
            }
        } else {
            const a = random() * Math.PI * 2, d = this.radiusAt(stone, a) * 0.55;
            const cx = x + Math.cos(a) * d, cy = y + Math.sin(a) * d, spread = r * (0.2 + random() * 0.15);
            for (let k = 0; k < spread * spread / 4; k++) {
                const t = random() * 6.3, s = Math.sqrt(random()) * spread;
                blobs.push([cx + Math.cos(t) * s, cy + Math.sin(t) * s * 0.8, 1 + random() * 2.2]);
            }
        }
        // Dark undergrowth, then lighter tops, then a few bright tips.
        for (const [bx, by, size] of blobs) {
            ctx.fillStyle = ZEN_MOSS[Math.floor(random() * 2)];
            ctx.beginPath();
            ctx.arc(bx, by, size, 0, Math.PI * 2);
            ctx.fill();
        }
        for (const [bx, by, size] of blobs) {
            if (random() < 0.3) continue;
            ctx.fillStyle = ZEN_MOSS[2 + Math.floor(random() * 3)];
            ctx.beginPath();
            ctx.arc(bx - size * 0.25, by - size * 0.3, size * 0.6, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = ZEN_MOSS[5];
        for (const [bx, by, size] of blobs) if (random() < 0.12) ctx.fillRect(bx - size * 0.4, by - size * 0.5, 1, 1);
    }

    // ---- Seasonal visitors: maple leaves in autumn, petals in spring ----------

    season() {
        const chosen = this.config.season;
        if (chosen !== 'auto') return chosen;
        const date = this.host.now(), day = date.getMonth() * 31 + date.getDate();
        if (day >= 2 * 31 + 20 && day <= 4 * 31 + 10) return 'spring';   // late March to early May
        if (day >= 8 * 31 + 15 && day <= 10 * 31 + 30) return 'autumn';   // mid September to November
        return 'off';
    }

    buildSprites() {
        const dpr = this.dpr;
        const sprite = (size, draw) => {
            const c = document.createElement('canvas');
            c.width = c.height = Math.ceil(size * dpr);
            const ctx = c.getContext('2d');
            ctx.scale(dpr, dpr);
            ctx.translate(size / 2, size / 2);
            draw(ctx);
            return c;
        };
        // A Japanese maple leaf: seven slender lobes fanned over 300°.
        const maple = (ctx, R) => {
            const path = new Path2D();
            for (let k = 0; k <= 210; k++) {
                const u = k / 210, phi = -Math.PI * 5 / 6 + u * Math.PI * 5 / 3;   // lower left, over the top, to lower right
                const tri = 1 - Math.abs((7 * u) % 1 - 0.5) * 2;                    // 1 at each lobe's tip, 0 between
                const teeth = 1 + 0.06 * tri * Math.sin(k * 2.2);
                const r = R * (0.36 + 0.64 * Math.pow(tri, 0.85) * (1 - 0.3 * Math.abs(phi) / Math.PI)) * teeth;
                const px = Math.sin(phi) * r, py = -Math.cos(phi) * r;
                k ? path.lineTo(px, py) : path.moveTo(px, py);
            }
            path.closePath();
            return path;
        };
        const R = 17;
        const colours = [['#8f1622', '#d8402a'], ['#b5301f', '#ec7a2c'], ['#c4561a', '#f0a531'], ['#a01e2c', '#e8552f']];
        this.leafSprites = colours.map(([deep, bright]) => sprite(R * 2.6, ctx => {
            const path = maple(ctx, R);
            const fill = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
            fill.addColorStop(0, bright);
            fill.addColorStop(1, deep);
            ctx.fillStyle = fill;
            ctx.fill(path);
            ctx.strokeStyle = 'rgba(70, 10, 10, 0.35)';
            ctx.lineWidth = 0.6;
            for (let k = 0; k < 7; k++) {
                const phi = -Math.PI * 5 / 6 + (k + 0.5) / 7 * Math.PI * 5 / 3;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(Math.sin(phi) * R * 0.8, -Math.cos(phi) * R * 0.8);
                ctx.stroke();
            }
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(1.5, R * 0.5, 0.5, R * 0.95);
            ctx.strokeStyle = deep;
            ctx.lineWidth = 1;
            ctx.stroke();
        }));
        this.leafShadow = sprite(R * 2.6, ctx => { ctx.fillStyle = 'rgba(30, 20, 10, 1)'; ctx.fill(maple(ctx, R)); });
        const petal = new Path2D();
        petal.moveTo(0, 5);
        petal.bezierCurveTo(4.5, 3, 4, -4, 1.2, -5);
        petal.lineTo(0, -3.6);
        petal.lineTo(-1.2, -5);
        petal.bezierCurveTo(-4, -4, -4.5, 3, 0, 5);
        this.petalSprites = [['#f7c6d4', '#fde8ee'], ['#f2b0c4', '#fbdde6'], ['#fbd3df', '#fff4f7']].map(([edge, centre]) => sprite(24, ctx => {
            ctx.scale(1.7, 1.7);
            const fill = ctx.createRadialGradient(0, 2, 0, 0, 0, 6);
            fill.addColorStop(0, centre);
            fill.addColorStop(1, edge);
            ctx.fillStyle = fill;
            ctx.fill(petal);
        }));
        this.petalShadow = sprite(24, ctx => { ctx.scale(1.7, 1.7); ctx.fillStyle = 'rgba(30, 20, 10, 1)'; ctx.fill(petal); });
        // Blur the shadows by shrinking them and drawing them back up.
        for (const key of ['leafShadow', 'petalShadow']) {
            const big = this[key], small = document.createElement('canvas');
            small.width = small.height = Math.max(4, Math.round(big.width / 4));
            const sctx = small.getContext('2d');
            sctx.imageSmoothingQuality = 'high';
            sctx.drawImage(big, 0, 0, small.width, small.height);
            this[key] = small;
        }
    }

    // When the next leaf or petal comes; on a fresh build, a few already lie
    // on the sand, so the season shows from the first frame.
    planVisitors(fresh) {
        const season = this.season();
        const now = performance.now();
        this.nextVisitorAt = season === 'off' ? Infinity : now + this.visitorGap(season) * (fresh ? 0.4 : 1);
        if (!fresh || !this.stones) return;
        this.settled = [];
        if (season !== 'off') {
            const random = WP.seededRandom(this.seed + 99);
            const count = season === 'autumn' ? 3 : 7;
            for (let k = 0; k < count; k++) {
                const spot = this.landingSpot(random);
                this.settled.push({ kind: season === 'autumn' ? 'leaf' : 'petal', x: spot.x, y: spot.y, rot: random() * 6.28, sprite: Math.floor(random() * 4), scale: 0.85 + random() * 0.3 });
            }
        }
        if (this.top) { this.top = this.buildTop(); this.markDirty(null); }
    }

    visitorGap(season) {
        const seconds = season === 'autumn' ? 25 + Math.random() * 45 : 18 + Math.random() * 30;
        return seconds * 1000 / Math.max(0.2, this.density);
    }

    landingSpot(random = Math.random) {
        for (let k = 0; k < 40; k++) {
            const x = this.width * (0.06 + random() * 0.88), y = (this.height - this.host.insets.bottom) * (0.06 + random() * 0.88);
            if (this.stones.every(s => Math.hypot(s.x - x, s.y - y) > s.keep + 12)) return { x, y };
        }
        return { x: this.width * 0.5, y: this.height * 0.5 };
    }

    spawnVisitors(now) {
        const season = this.season();
        this.nextVisitorAt = season === 'off' ? Infinity : now + this.visitorGap(season);
        if (season === 'off') return;
        const count = season === 'autumn' ? 1 : 2 + Math.floor(Math.random() * 3);
        const windX = (Math.random() - 0.3) * 40, windY = (Math.random() - 0.5) * 20;
        for (let k = 0; k < count; k++) {
            const land = this.landingSpot();
            const fall = 6 + Math.random() * 3;
            this.visitors.push({
                kind: season === 'autumn' ? 'leaf' : 'petal', sprite: Math.floor(Math.random() * (season === 'autumn' ? 4 : 3)),
                land, fall, t: -k * 0.8, windX, windY, rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 2.4,
                phase: Math.random() * 6.28, scale: 0.85 + Math.random() * 0.3, x: land.x, y: land.y, z: 1, box: null,
            });
        }
    }

    updateVisitors(dt) {
        for (const v of this.visitors) {
            v.t += dt;
            const left = Math.max(0, v.fall - Math.max(0, v.t));
            v.z = left / v.fall;
            // Drifting with the breeze, swinging from side to side as it falls.
            const sway = Math.sin(v.phase + v.t * 1.6) * 18 * v.z;
            v.x = v.land.x - v.windX * left - Math.cos(v.phase) * sway;
            v.y = v.land.y - v.windY * left + Math.sin(v.phase) * sway * 0.5;
            v.rot += v.spin * dt * (0.3 + v.z);
        }
        const landed = this.visitors.filter(v => v.t >= v.fall);
        if (!landed.length) return;
        this.visitors = this.visitors.filter(v => v.t < v.fall);
        for (const v of landed) {
            this.settled.push({ kind: v.kind, x: v.x, y: v.y, rot: v.rot, sprite: v.sprite, scale: v.scale });
            if (v.box) this.markDirty(v.box);
        }
        // Only so many lie about; the oldest blows away as a new one lands.
        const cap = { leaf: 7, petal: 16 };
        const kinds = ['leaf', 'petal'];
        let rebuilt = false;
        for (const kind of kinds) {
            while (this.settled.filter(l => l.kind === kind).length > cap[kind]) {
                this.settled.splice(this.settled.findIndex(l => l.kind === kind), 1);
                rebuilt = true;
            }
        }
        if (rebuilt) { this.top = this.buildTop(); this.markDirty(null); }
        else for (const v of landed) this.drawSettled(this.top.getContext('2d'), v, true);
    }

    drawSettled(ctx, leaf, fresh) {
        const sprite = leaf.kind === 'leaf' ? this.leafSprites[leaf.sprite] : this.petalSprites[leaf.sprite % 3];
        const shadow = leaf.kind === 'leaf' ? this.leafShadow : this.petalShadow;
        const size = sprite.width / this.dpr * leaf.scale;
        ctx.save();
        if (fresh) ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.translate(leaf.x, leaf.y);
        ctx.rotate(leaf.rot);
        ctx.globalAlpha = 0.35;
        ctx.drawImage(shadow, -size / 2 + 1.2, -size / 2 + 1.6, size, size);
        ctx.globalAlpha = 1;
        ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
        ctx.restore();
        if (fresh) this.markDirty({ x0: leaf.x - size, y0: leaf.y - size, x1: leaf.x + size, y1: leaf.y + size });
    }

    drawVisitors() {
        const ctx = this.ctx, dpr = this.dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        for (const v of this.visitors) {
            if (v.t < 0) continue;
            const sprite = v.kind === 'leaf' ? this.leafSprites[v.sprite] : this.petalSprites[v.sprite % 3];
            const shadow = v.kind === 'leaf' ? this.leafShadow : this.petalShadow;
            const size = sprite.width / dpr * v.scale * (1 + v.z * 0.7);
            const fade = Math.min(1, v.t / 0.8);
            const sx = v.x + v.z * 46, sy = v.y + v.z * 60;
            const tilt = 0.55 + 0.45 * Math.abs(Math.cos(v.phase + v.t * 1.3));
            ctx.save();
            ctx.globalAlpha = fade * 0.32 * (1 - v.z * 0.5);
            ctx.translate(sx, sy);
            ctx.rotate(v.rot);
            ctx.scale(1, tilt);
            const shadowSize = size * (1 + v.z * 0.4);
            ctx.drawImage(shadow, -shadowSize / 2, -shadowSize / 2, shadowSize, shadowSize);
            ctx.restore();
            ctx.save();
            ctx.globalAlpha = fade;
            ctx.translate(v.x, v.y);
            ctx.rotate(v.rot);
            ctx.scale(1, tilt);
            ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
            ctx.restore();
            const reach = shadowSize;
            v.box = { x0: Math.min(v.x, sx) - reach, y0: Math.min(v.y, sy) - reach, x1: Math.max(v.x, sx) + reach, y1: Math.max(v.y, sy) + reach };
        }
    }

    // ---- Frames -------------------------------------------------------------------

    markDirty(box) {
        if (!box) { this.dirty = 'all'; return; }
        if (this.dirty === 'all') return;
        const d = this.dirty;
        this.dirty = d ? { x0: Math.min(d.x0, box.x0), y0: Math.min(d.y0, box.y0), x1: Math.max(d.x1, box.x1), y1: Math.max(d.y1, box.y1) }
            : { ...box };
    }

    // Copy the changed part of the garden to the screen.
    composite(all) {
        if (all) this.dirty = 'all';
        const d = this.dirty;
        if (!d) return;
        const ctx = this.ctx, dpr = this.dpr, W = this.canvas.width, H = this.canvas.height;
        let x0 = 0, y0 = 0, x1 = W, y1 = H;
        if (d !== 'all') {
            x0 = Math.max(0, Math.floor(d.x0 * dpr)); y0 = Math.max(0, Math.floor(d.y0 * dpr));
            x1 = Math.min(W, Math.ceil(d.x1 * dpr)); y1 = Math.min(H, Math.ceil(d.y1 * dpr));
        }
        this.dirty = null;
        if (x1 <= x0 || y1 <= y0) return;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(this.sand, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
        ctx.drawImage(this.top, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
    }

    loop(time) {
        if (!this.running) return;
        const started = performance.now();
        const dt = Math.min(0.1, Math.max(0, (time - (this.last || time)) / 1000));
        this.last = time;

        if (this.rake && (this.rake.fresh || this.rake.ended)) this.advanceRake();
        if (this.gardenerStroke) this.advanceGardener(dt, started);
        else if (!this.rake && this.config.gardener && started >= this.nextGardenerAt) this.beginGardenerStroke(started);
        if (started >= this.nextWindAt) this.blowWind(started);
        if (started >= this.nextVisitorAt) this.spawnVisitors(started);
        for (const v of this.visitors) if (v.box) this.markDirty(v.box);
        if (this.visitors.length) this.updateVisitors(dt);

        this.composite();
        if (this.visitors.length) this.drawVisitors();

        this.frame = requestAnimationFrame(this.loop);
        // A finger on the sand: every frame it moves, none while it rests.
        if (this.rake) return this.rake.fresh || this.rake.ended ? undefined : this.host.idleUntil();
        // The gardener and falling leaves are slow: 30 frames a second is plenty.
        if (this.gardenerStroke || this.visitors.length) return this.host.idleUntil(Math.max(0, 1000 / 30 - 4 - (performance.now() - started)));
        // Nothing moving: sleep until the next gust, gardener's stroke or leaf.
        const gardener = this.config.gardener ? this.nextGardenerAt : Infinity;
        this.last = 0;
        this.host.idleUntil(Math.max(0, Math.min(this.nextWindAt, gardener, this.nextVisitorAt) - performance.now()));
    }
}
