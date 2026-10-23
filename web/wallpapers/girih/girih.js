// Girih: Islamic geometric star patterns that slowly breathe from one form
// into the next (SPEC §10.7). The geometry is Hankin's "polygons in contact"
// (girih-geometry.js, unit tested); this file paints it.
//
// Cost model. The pattern lives on its own canvas and is repainted only
// while it changes: one full redraw per frame of a morph, nothing while a
// pattern holds (the stage gets host.idleUntil and sends no frames). A new
// base tiling is painted once onto a second canvas and crossfaded in by CSS
// opacity. The only per-frame work while holding is the sheen, a single
// gradient on a tiny canvas the compositor screens over the pattern, and
// Low drops it.

// Palettes. Stars take `stars` by kind and tone (girih-geometry's repeat
// colouring); the ground shows through as the cells around each vertex.
const GIRIH_PALETTES = {
    zellige: {
        ground: '#efe7d4', stars: ['#1b4f8a', '#0f6e5c', '#c58f2a', '#a3412a', '#20403a'],
        medallion: ['#e2b64e', '#f3ecdc', '#1b4f8a', '#efe7d4', '#c58f2a'], band: '#f7f1e3', edge: '#1d2327', line: null, glaze: 0.07,
        grout: '#1d2327', sheen: [255, 250, 236], sheenAlpha: 0.2,
    },
    lapis: {
        ground: '#101f52', stars: ['#1d3a8a', '#28509f', '#16306e'],
        medallion: ['#d6b25b', '#e8c977', '#c9a24a'], gold: ['#7d5d1e', '#e8c977', '#a37b2c', '#f6e2a0', '#8f6c24', '#d9b45e'],
        edge: '#070c24', line: 'rgba(255, 244, 205, 0.55)', glaze: 0.05, grout: '#070c24', sheen: [255, 226, 160], sheenAlpha: 0.32,
    },
    plaster: {
        ground: '#ece5d7', stars: ['#e4dccb', '#ddd3bf', '#e7e0d1'],
        medallion: ['#f2ede2', '#d3c7ae', '#f2ede2'], band: '#f8f5ee', edge: '#b9aa8d', line: null, glaze: 0.025,
        relief: { shadow: 'rgba(96, 74, 40, 0.38)', light: 'rgba(255, 255, 255, 0.85)' },
        grout: '#cfc3aa', sheen: [255, 246, 228], sheenAlpha: 0.28,
    },
    iznik: {
        ground: '#f5f1e8', stars: ['#1f4f9a', '#26968f', '#c0392b', '#2f7a4a'],
        medallion: ['#f5f1e8', '#c0392b', '#f5f1e8', '#1f4f9a'], band: '#173a74', edge: '#0b1c3a', line: 'rgba(255, 255, 255, 0.35)', glaze: 0.06,
        grout: '#0b1c3a', sheen: [255, 255, 255], sheenAlpha: 0.2,
    },
    night: {
        ground: '#0d1420', stars: ['#16424f', '#3b2347', '#123a2c', '#4a3216'],
        medallion: ['#c9a85a', '#5fb3b3', '#c9a85a', '#8fb9c9'], band: '#9fb4c4', edge: '#05080d', line: 'rgba(255, 255, 255, 0.4)', glaze: 0.06,
        grout: '#05080d', sheen: [190, 220, 255], sheenAlpha: 0.22,
    },
};

// Which colour each kind of tile starts from, per tiling (indices into
// `stars`, plus the tile's tone).
const GIRIH_KIND_COLOUR = {
    '4.4.4.4': [0], '6.6.6': [0], '4.8.8': [0, 2], '3.12.12': [0, 3, 3], '4.6.12': [0, 3, 3, 3, 1, 1],
};

class GirihAnimationManager {
    constructor(host) {
        this.host = host;
        this.config = WP.settings.load();
        this.random = Math.random;
        this.canvases = [];
        this.front = 0;
        this.animationId = null;
        this.running = false;
        // For the smoke test and the HUD: full repaints of the pattern, and
        // frames this manager drew (SPEC §9 8.2: one redraw per morph step).
        this.stats = { redraws: 0, frames: 0, tileDraws: 0 };
        this.sheenLevel = this.sheenWanted();
        this.tilingIndex = 0;
    }

    // ---- Life cycle ----------------------------------------------------------

    start() {
        if (this.running) return;
        this.running = true;
        for (let i = 0; i < 2; i++) this.canvases.push(this.makeCanvas(i === 0 ? 1 : 0));
        // Two still overlays the compositor blends: a patina of age (built
        // once per size) multiplied over the tiles, and the sheen screened on.
        this.patina = this.makeCanvas(1, 'multiply');
        this.sheen = this.makeCanvas(1, 'screen');

        // Seed the first scene mid-run: a pattern already holding.
        const now = performance.now() / 1000;
        this.tiling = this.config.baseTiling === 'cycle' ? Girih.IDS[Math.floor(this.random() * Girih.IDS.length)] : this.config.baseTiling;
        this.theta = this.pickAngle(null);
        this.holds = 0;
        this.state = { name: 'hold', until: now + Math.min(this.config.holdSeconds, 4 + this.random() * this.config.holdSeconds) };
        this.sheenStart = now - 12;
        this.onResize = () => this.resize();
        window.addEventListener('resize', this.onResize);
        this.resize();
        this.animationId = requestAnimationFrame(t => this.frame(t));
    }

    stop() {
        this.running = false;
        cancelAnimationFrame(this.animationId);
        window.removeEventListener('resize', this.onResize);
        for (const canvas of this.canvases) canvas.remove();
        this.sheen?.remove();
        this.patina?.remove();
        this.canvases = [];
    }

    makeCanvas(opacity, blend = 'normal') {
        const canvas = document.createElement('canvas');
        Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: '-1', pointerEvents: 'none', opacity: String(opacity), mixBlendMode: blend });
        document.body.appendChild(canvas);
        return canvas;
    }

    resize() {
        const dpr = window.devicePixelRatio || 1;
        this.width = innerWidth;
        this.height = innerHeight;
        this.dpr = dpr;
        for (const canvas of this.canvases) {
            canvas.width = Math.max(1, Math.round(innerWidth * dpr));
            canvas.height = Math.max(1, Math.round(innerHeight * dpr));
        }
        this.sheen.width = Math.max(1, Math.ceil(innerWidth / 8));
        this.sheen.height = Math.max(1, Math.ceil(innerHeight / 8));
        this.sheenDrawn = true;
        this.buildPatina();
        this.truchet = null;
        this.paint(this.canvases[this.front]);
        if (this.state.name === 'fade') this.paint(this.canvases[1 - this.front], this.state.next);
    }

    // Soft, uneven darkening, as on old glaze or plaster: a vignette and some
    // broad mottling, at quarter resolution since it has no edges.
    buildPatina() {
        const w = this.patina.width = Math.max(1, Math.ceil(this.width / 4));
        const h = this.patina.height = Math.max(1, Math.ceil(this.height / 4));
        const ctx = this.patina.getContext('2d');
        const strength = this.palette().patina ?? 1;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        const r = Math.hypot(w, h) / 2;
        const vignette = ctx.createRadialGradient(w / 2, h * 0.45, r * 0.35, w / 2, h / 2, r * 1.05);
        vignette.addColorStop(0, 'rgba(255, 255, 255, 0)');
        vignette.addColorStop(1, `rgba(40, 30, 20, ${0.34 * strength})`);
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 26; i++) {
            const x = this.random() * w, y = this.random() * h, s = (0.08 + this.random() * 0.22) * Math.max(w, h);
            const blot = ctx.createRadialGradient(x, y, 0, x, y, s);
            blot.addColorStop(0, `rgba(120, 100, 80, ${(0.04 + this.random() * 0.06) * strength})`);
            blot.addColorStop(1, 'rgba(120, 100, 80, 0)');
            ctx.fillStyle = blot;
            ctx.fillRect(x - s, y - s, s * 2, s * 2);
        }
    }

    // ---- Settings and quality -------------------------------------------------

    applySettings(config) {
        const before = this.config;
        this.config = { ...config };
        if (!this.running) return;
        const looks = ['style', 'palette', 'scale', 'interlace', 'medallions', 'bandWidth'];
        const tilingChanged = config.baseTiling !== before.baseTiling && config.baseTiling !== 'cycle';
        const angleOut = this.theta < this.radians(config.minAngle) || this.theta > this.radians(config.maxAngle);
        if (tilingChanged || angleOut || looks.some(key => config[key] !== before[key])) {
            if (config.style !== before.style || config.scale !== before.scale) this.truchet = null;
            this.crossfade({
                tiling: tilingChanged ? config.baseTiling : this.tiling,
                theta: angleOut ? this.pickAngle(this.theta) : this.theta,
            });
        }
    }

    onQuality() {
        this.kick();
    }

    sheenWanted() {
        return this.host.quality?.effects?.includes('sheen') ? 1 : 0;
    }

    // Something changed while idling: end the idle and ask for a frame (the
    // stage only schedules again when a frame is requested).
    kick() {
        if (!this.running) return;
        this.host.idleUntil(0);
        requestAnimationFrame(() => {});
    }

    // ---- Keys -------------------------------------------------------------------

    nextPattern() {
        if (this.config.style === 'truchet') this.startWave(performance.now() / 1000);
        else if (this.state.name === 'hold') this.state.until = 0;
        this.kick();
    }

    nextTiling() {
        if (this.config.style === 'truchet') return 'Truchet tiles have no base tiling';
        const next = Girih.IDS[(Girih.IDS.indexOf(this.state.next?.tiling || this.tiling) + 1) % Girih.IDS.length];
        this.crossfade({ tiling: next, theta: this.theta });
        return `${Girih.TILINGS[next].name} (${next})`;
    }

    // ---- The timeline -------------------------------------------------------------

    radians(deg) {
        return deg * Math.PI / 180;
    }

    // A fresh contact angle, well away from the current one, so each morph
    // is a real change of character.
    pickAngle(from) {
        const lo = this.radians(Math.min(this.config.minAngle, this.config.maxAngle - 5));
        const hi = this.radians(this.config.maxAngle);
        for (let tries = 0; tries < 12; tries++) {
            const theta = lo + this.random() * (hi - lo);
            if (from === null || Math.abs(theta - from) > (hi - lo) * 0.3) return theta;
        }
        return from < (lo + hi) / 2 ? hi - (hi - lo) * 0.15 : lo + (hi - lo) * 0.15;
    }

    crossfade(next) {
        const now = performance.now() / 1000;
        if (this.state.name === 'fade') this.finishFade();
        this.state = { name: 'fade', start: now, seconds: 2.8, next };
        const back = this.canvases[1 - this.front];
        this.paint(back, next);
        back.style.opacity = '0';
        this.kick();
    }

    finishFade() {
        const { next } = this.state;
        this.tiling = next.tiling;
        this.theta = next.theta;
        this.canvases[this.front].style.opacity = '0';
        this.front = 1 - this.front;
        this.canvases[this.front].style.opacity = '1';
    }

    startWave(now) {
        const t = this.truchet;
        if (!t) return this.hold(now);
        const [dx, dy] = [[1, 1], [-1, 1], [1, -1], [-1, -1]][Math.floor(this.random() * 4)];
        const reach = t.cols + t.rows;
        const sweep = 7 + 0.04 * reach;
        let last = now;
        for (const tile of t.tiles) {
            if (this.random() > 0.42) continue;
            const along = ((tile.i * dx + tile.j * dy) + reach) / (2 * reach);
            tile.flipAt = now + along * sweep * 2 - sweep * 0.5 + this.random() * 0.4;
            last = Math.max(last, tile.flipAt + 1);
        }
        this.state = { name: 'wave', until: last };
    }

    frame(ms) {
        if (!this.running) return;
        this.animationId = requestAnimationFrame(t => this.frame(t));
        this.stats.frames++;
        const now = performance.now() / 1000;
        const dt = Math.min(0.1, this.lastFrame ? now - this.lastFrame : 0);
        this.lastFrame = now;
        const state = this.state;

        if (state.name === 'hold' && now >= state.until) {
            this.holds++;
            if (this.config.style === 'truchet') this.startWave(now);
            else if (this.config.baseTiling === 'cycle' && this.holds % this.config.tilingEvery === 0) {
                const others = Girih.IDS.filter(id => id !== this.tiling);
                this.crossfade({ tiling: others[Math.floor(this.random() * others.length)], theta: this.pickAngle(this.theta) });
            } else {
                this.state = { name: 'morph', start: now, from: this.theta, to: this.pickAngle(this.theta) };
            }
        }

        if (this.state.name === 'morph') {
            const { start, from, to } = this.state;
            const p = Math.min(1, (now - start) / this.config.morphSeconds);
            const eased = p * p * (3 - 2 * p);
            this.theta = from + (to - from) * eased;
            this.paint(this.canvases[this.front]);
            if (p >= 1) this.hold(now);
        } else if (this.state.name === 'fade') {
            const p = Math.min(1, (now - this.state.start) / this.state.seconds);
            this.canvases[1 - this.front].style.opacity = String(p * p * (3 - 2 * p));
            if (p >= 1) {
                this.finishFade();
                this.hold(now);
            }
        } else if (this.state.name === 'wave') {
            this.stepWave(now);
            if (now >= this.state.until) this.hold(now);
        }

        const sheenOn = this.drawSheen(now, dt);

        // Holding still: no frames until the hold ends, or the next sheen
        // sweep. A pointer, a resize or new settings wake the stage early.
        if (this.state.name === 'hold') {
            const wakeAt = sheenOn ? now + 1 / 15 : Math.min(this.state.until, this.sheenLevel > 0 ? this.nextSheen(now) : Infinity);
            if (wakeAt > now) this.host.idleUntil((wakeAt - now) * 1000);
        }
    }

    hold(now) {
        this.state = { name: 'hold', until: now + this.config.holdSeconds };
    }

    // ---- The sheen ------------------------------------------------------------------

    // A broad soft band of light crossing the screen diagonally every 26 s,
    // taking 16 s, screened over the pattern by the compositor. True while it
    // has anything to show.
    drawSheen(now, dt) {
        const want = this.sheenWanted();
        this.sheenLevel += Math.sign(want - this.sheenLevel) * Math.min(Math.abs(want - this.sheenLevel), dt / 1.5);
        const ctx = this.sheen.getContext('2d');
        const w = this.sheen.width, h = this.sheen.height;
        const p = ((now - this.sheenStart) % 26) / 16;
        const visible = this.sheenLevel > 0 && p < 1;
        if (!visible && !this.sheenDrawn) return false;
        ctx.clearRect(0, 0, w, h);
        this.sheenDrawn = visible;
        if (!visible) return false;
        const palette = GIRIH_PALETTES[this.config.palette] || GIRIH_PALETTES.zellige;
        const span = w + h;
        const centre = -0.35 * span + p * 1.7 * span;
        const g = ctx.createLinearGradient(centre - span * 0.3, 0, centre + span * 0.3, span * 0.35);
        const [r, gr, b] = palette.sheen;
        const a = palette.sheenAlpha * this.sheenLevel * Math.sin(Math.PI * p);
        g.addColorStop(0, `rgba(${r}, ${gr}, ${b}, 0)`);
        g.addColorStop(0.45, `rgba(${r}, ${gr}, ${b}, ${a * 0.8})`);
        g.addColorStop(0.5, `rgba(${r}, ${gr}, ${b}, ${a})`);
        g.addColorStop(0.55, `rgba(${r}, ${gr}, ${b}, ${a * 0.8})`);
        g.addColorStop(1, `rgba(${r}, ${gr}, ${b}, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        return true;
    }

    nextSheen(now) {
        const into = (now - this.sheenStart) % 26;
        return into < 16 ? now : now + 26 - into;
    }

    // ---- Painting ---------------------------------------------------------------------

    paint(canvas, what = { tiling: this.tiling, theta: this.theta }) {
        if (this.config.style === 'truchet') return this.paintTruchet(canvas);
        this.paintGirih(canvas, what.tiling, what.theta);
    }

    palette() {
        return GIRIH_PALETTES[this.config.palette] || GIRIH_PALETTES.zellige;
    }

    // One full repaint of the star pattern. Everything is batched by colour
    // into a handful of paths, so the cost is building them, not draw calls.
    paintGirih(canvas, tiling, theta) {
        this.stats.redraws++;
        const ctx = canvas.getContext('2d');
        const pal = this.palette();
        const W = this.width, H = this.height, dpr = this.dpr;
        const edge = this.config.scale * Girih.TILINGS[tiling].size;          // px per edge
        const band = this.config.bandWidth * Math.sqrt(edge * 60) / edge;    // in edge units
        const rim = Math.max(0.9 / edge, band * 0.16);                        // outline either side
        const pattern = Girih.build(tiling, theta, { x0: -W / 2 / edge - 1, y0: -H / 2 / edge - 1, x1: W / 2 / edge + 1, y1: H / 2 / edge + 1 });

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = pal.ground;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(dpr * edge, 0, 0, dpr * edge, dpr * W / 2, dpr * H / 2);

        // Stars, by glaze shade, then their inlaid medallions on top.
        const stars = new Map(), inlays = new Map();
        const add = (fills, colour, points) => {
            let path = fills.get(colour);
            if (!path) fills.set(colour, path = new Path2D());
            path.moveTo(points[0][0], points[0][1]);
            for (let i = 1; i < points.length; i++) path.lineTo(points[i][0], points[i][1]);
            path.closePath();
        };
        const offsets = GIRIH_KIND_COLOUR[tiling];
        const largest = Math.max(...Girih.TILINGS[tiling].tiles.map(t => t.n));
        const medallions = new Path2D();
        let hasMedallions = false;
        // The medallion leans the other way: sharp while the star is blunt.
        const inner = Math.min(Math.max(Math.PI * 0.56 - theta * 0.6, this.radians(30)), this.radians(74));
        for (const poly of pattern.polys) {
            const index = (offsets[poly.kind] + poly.tone) % pal.stars.length;
            const shade = (Math.round(poly.cx * 7.3 + poly.cy * 3.1) % 3 + 3) % 3 - 1;
            add(stars, this.shade(pal.stars[index], shade * pal.glaze), poly.hankin.star);
            if (this.config.medallions && poly.n === largest) {
                const k = 0.4;
                const small = Girih.hankin(poly, inner).star.map(([x, y]) => [poly.cx + (x - poly.cx) * k, poly.cy + (y - poly.cy) * k]);
                add(inlays, pal.medallion[index % pal.medallion.length], small);
                medallions.moveTo(small[0][0], small[0][1]);
                for (const [x, y] of small) medallions.lineTo(x, y);
                medallions.closePath();
                hasMedallions = true;
            }
        }
        for (const fills of [stars, inlays]) {
            for (const [colour, path] of fills) {
                ctx.fillStyle = colour;
                ctx.fill(path);
            }
        }
        if (hasMedallions) {
            ctx.strokeStyle = pal.edge;
            ctx.lineWidth = rim * 1.2;
            ctx.stroke(medallions);
        }

        // The strapwork: chevrons M → P → M' through every star, then, at
        // each crossing, the over strand again on top.
        const straps = new Path2D();
        for (const poly of pattern.polys) {
            const { mids, points } = poly.hankin;
            for (let i = 0; i < poly.n; i++) {
                const next = mids[(i + 1) % poly.n];
                straps.moveTo(mids[i][0], mids[i][1]);
                straps.lineTo(points[i][0], points[i][1]);
                straps.lineTo(next[0], next[1]);
            }
        }
        let overs = null;
        if (this.config.interlace) {
            overs = new Path2D();
            // Long enough to clear the under strand, which crosses at 2θ.
            const cover = (band / 2 + rim) / Math.max(0.15, Math.sin(Math.min(2 * theta, Math.PI - 2 * theta))) + band * 0.6;
            for (const c of pattern.crossings) {
                const h = Math.min(c.reach * 0.92, cover);
                overs.moveTo(c.x - c.dir[0] * h, c.y - c.dir[1] * h);
                overs.lineTo(c.x + c.dir[0] * h, c.y + c.dir[1] * h);
            }
        }
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';
        ctx.miterLimit = 6;
        const bandStyle = pal.gold ? this.goldGradient(ctx, pal.gold, W / edge, H / edge) : pal.band;
        const strokeBand = path => {
            if (pal.relief) {
                ctx.lineWidth = band + rim * 2;
                ctx.strokeStyle = pal.relief.shadow;
                ctx.translate(rim * 1.2, rim * 1.6);
                ctx.stroke(path);
                ctx.translate(-rim * 2.2, -rim * 2.8);
                ctx.strokeStyle = pal.relief.light;
                ctx.stroke(path);
                ctx.translate(rim, rim * 1.2);
            }
            ctx.lineWidth = band + rim * 2;
            ctx.strokeStyle = pal.edge;
            ctx.stroke(path);
            ctx.lineWidth = band;
            ctx.strokeStyle = bandStyle;
            ctx.stroke(path);
            if (pal.line) {
                ctx.lineWidth = Math.max(0.7 / edge, band * 0.14);
                ctx.strokeStyle = pal.line;
                ctx.stroke(path);
            }
        };
        strokeBand(straps);
        if (overs) strokeBand(overs);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    // Gilded straps: a gradient with many stops across the screen, so the
    // gold catches light in places, as leaf does.
    goldGradient(ctx, stops, w, h) {
        const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
        const n = 18;
        for (let i = 0; i <= n; i++) g.addColorStop(i / n, stops[(i * 5 + (i >> 2)) % stops.length]);
        return g;
    }

    // A colour a little lighter (amount > 0) or darker, for glaze variation.
    shade(hex, amount) {
        if (!amount) return hex;
        const n = parseInt(hex.slice(1), 16);
        const mix = c => Math.round(amount > 0 ? c + (255 - c) * amount : c * (1 + amount));
        return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
    }

    // ---- Truchet ----------------------------------------------------------------------

    // Quarter-circle (Smith) tiles: two arcs per square, the regions
    // between them two-coloured. Every tile is drawn in whole device pixels
    // so neighbours meet without seams.
    truchetGrid() {
        if (this.truchet) return this.truchet;
        const size = Math.max(8, Math.round(this.config.scale * 0.36 * this.dpr));
        const cols = Math.ceil(this.width * this.dpr / size) + 1, rows = Math.ceil(this.height * this.dpr / size) + 1;
        const ox = Math.round((this.width * this.dpr - cols * size) / 2), oy = Math.round((this.height * this.dpr - rows * size) / 2);
        const tiles = [];
        for (let j = 0; j < rows; j++) {
            for (let i = 0; i < cols; i++) {
                // A gentle bias towards pairs, so the first frame has the
                // rounded "eyes" Truchet patterns are loved for.
                const o = ((i >> 1) + (j >> 1) + (this.random() < 0.3 ? 1 : 0)) & 1;
                tiles.push({ i, j, o, flipAt: Infinity });
            }
        }
        return this.truchet = { size, cols, rows, ox, oy, tiles };
    }

    paintTruchet(canvas) {
        this.stats.redraws++;
        const t = this.truchetGrid();
        const ctx = canvas.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = this.palette().grout;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        for (const tile of t.tiles) this.drawTile(ctx, t, tile, tile.o, 1);
    }

    stepWave(now) {
        const t = this.truchet;
        if (!t) return;
        const ctx = this.canvases[this.front].getContext('2d');
        const seconds = 0.9;
        for (const tile of t.tiles) {
            if (now < tile.flipAt) continue;
            const p = Math.min(1, (now - tile.flipAt) / seconds);
            const eased = p * p * (3 - 2 * p);
            // A card turning over: it narrows to an edge, shows its other
            // face (the other orientation, colours swapped) and widens again.
            this.drawTile(ctx, t, tile, eased < 0.5 ? tile.o : 1 - tile.o, Math.abs(Math.cos(Math.PI * eased)), true);
            if (p >= 1) {
                tile.o = 1 - tile.o;
                tile.flipAt = Infinity;
            }
        }
    }

    drawTile(ctx, t, tile, o, squash, clear = false) {
        this.stats.tileDraws++;
        const pal = this.palette();
        const s = t.size, x = t.ox + tile.i * s, y = t.oy + tile.j * s;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, s, s);
        ctx.clip();
        if (clear) {
            ctx.fillStyle = pal.grout;
            ctx.fillRect(x, y, s, s);
        }
        ctx.translate(x + s / 2, y + s / 2);
        ctx.scale(Math.max(0.001, squash), 1);
        const colours = [pal.ground, pal.stars[0]];
        const mid = colours[(tile.i + tile.j + o) & 1], corner = colours[(tile.i + tile.j + o + 1) & 1];
        const r = s / 2, h = s / 2;
        // Arc corners: top-left and bottom-right for o = 0, the others for 1.
        const corners = o ? [[h, -h, Math.PI / 2, Math.PI], [-h, h, -Math.PI / 2, 0]] : [[-h, -h, 0, Math.PI / 2], [h, h, Math.PI, Math.PI * 1.5]];
        ctx.fillStyle = mid;
        ctx.fillRect(-h, -h, s, s);
        ctx.fillStyle = corner;
        for (const [cx, cy, a0, a1] of corners) {
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, r, a0, a1);
            ctx.closePath();
            ctx.fill();
        }
        const band = Math.max(2, s * this.config.bandWidth * 1.3), rim = Math.max(1, band * 0.16);
        const arcs = new Path2D();
        for (const [cx, cy, a0, a1] of corners) {
            arcs.moveTo(cx + r * Math.cos(a0), cy + r * Math.sin(a0));
            arcs.arc(cx, cy, r, a0, a1);
        }
        ctx.lineCap = 'butt';
        ctx.lineWidth = band + rim * 2;
        ctx.strokeStyle = pal.edge;
        ctx.stroke(arcs);
        ctx.lineWidth = band;
        ctx.strokeStyle = pal.gold ? pal.gold[1] : pal.band;
        ctx.stroke(arcs);
        if (pal.line) {
            ctx.lineWidth = Math.max(1, band * 0.14);
            ctx.strokeStyle = pal.line;
            ctx.stroke(arcs);
        }
        if (squash < 1) {
            ctx.fillStyle = `rgba(0, 0, 0, ${(1 - squash) * 0.35})`;
            ctx.fillRect(-h, -h, s, s);
        }
        ctx.restore();
    }
}
