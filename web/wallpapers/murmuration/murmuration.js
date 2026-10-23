// Murmuration: thousands of starlings at dusk over a marsh, swirling in one
// shape-shifting cloud, scattering when a falcon dives through, and at last
// pouring down into the reeds to roost as the sky goes dark. The flight is
// in flock.js; this file paints it and turns the pointer into the falcon.
//
// Cheap by design (SPEC §4.8): the skies (dusk and night) and the reeds are
// painted once per resize; a frame is the sky, one filled path per shade of
// bird, and the reeds over them.

const MURMURATION_SKIES = {
    amber: {
        sky: [[0, '#1c2442'], [0.3, '#3d4470'], [0.58, '#9a6c80'], [0.8, '#ec9a5c'], [1, '#ffcf87']],
        sun: [255, 196, 120], sunX: 0.68, bird: [24, 16, 22], trees: '#3a2c3a', water: '#2a2c44', reeds: '#0b0a0e',
    },
    pink: {
        sky: [[0, '#1d2046'], [0.32, '#4d4a80'], [0.6, '#b9789c'], [0.82, '#f29c9a'], [1, '#ffd4b2']],
        sun: [255, 190, 170], sunX: 0.3, bird: [28, 18, 30], trees: '#3b2a42', water: '#2b2a4a', reeds: '#0c0a10',
    },
    winter: {
        sky: [[0, '#323b4b'], [0.4, '#626b79'], [0.72, '#a3a3a3'], [1, '#dcd2c2']],
        sun: [250, 236, 214], sunX: 0.62, bird: [22, 24, 30], trees: '#4a4d55', water: '#3d434f', reeds: '#111318',
    },
};
const MURMURATION_NIGHT = [[0, '#04060d'], [0.55, '#0b1022'], [1, '#22263c']];

class MurmurationAnimationManager {
    constructor(host) {
        this.host = host;
        this.config = WP.settings.load();
        this.canvas = null;
        this.ctx = null;
        this.evening = null;
        this.running = false;
        this.frameId = null;
        this.last = 0;
        this.listeners = [];
        this.pointerType = 'mouse';
        this.paths = null;
    }

    // ---- Lifecycle -----------------------------------------------------------

    start() {
        if (this.running) return;
        this.running = true;
        const canvas = this.canvas = document.createElement('canvas');
        canvas.id = 'murmuration-canvas';
        Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: '-1', pointerEvents: 'none' });
        document.body.appendChild(canvas);
        this.ctx = canvas.getContext('2d');
        this.buildEvening();
        this.resize();
        this.listen();
        this.last = 0;
        this.frameId = requestAnimationFrame(now => this.frame(now));
    }

    stop() {
        if (!this.running) return;
        this.running = false;
        cancelAnimationFrame(this.frameId);
        for (const off of this.listeners) off();
        this.listeners = [];
        this.canvas.remove();
        this.canvas = this.ctx = null;
    }

    birdsWanted() {
        return Math.max(60, Math.round(this.config.birds * (this.host.quality?.density ?? 1)));
    }

    buildEvening() {
        this.evening = new MurmurationEvening({
            birds: this.birdsWanted(), capacity: this.config.birds,
            minutes: this.config.minutes, falcon: this.config.falcon,
        });
        if (this.width) this.placeEvening(true);
    }

    // The evening's sky is everything above the horizon; the reed bed is
    // where the flock roosts.
    placeEvening(warm) {
        const ev = this.evening, first = !ev.width;
        ev.resize(this.width, this.height, this.horizon, this.roost);
        // Fly the first seconds before anyone sees them, so the first frame
        // is a flock that has already found its shape.
        if (first && warm) for (let i = 0; i < 60; i++) ev.update(0.05);
    }

    // Panel changes: the flock and its sky change live; only a new flock
    // size starts a new flock.
    applySettings(config) {
        const old = this.config;
        this.config = config;
        if (!this.running) return;
        this.evening.options.minutes = config.minutes;
        this.evening.options.falcon = config.falcon;
        if (config.birds !== old.birds) this.buildEvening();
        if (config.skyPalette !== old.skyPalette) this.buildLayers();
    }

    onQuality() {
        if (this.evening) this.evening.setBirds(this.birdsWanted());
    }

    // ---- Keys (catalog) ---------------------------------------------------------------

    dive() {
        if (this.evening.phase !== 'swirl' && this.evening.phase !== 'arrive') return 'The starlings are roosting';
        this.evening.strike();
        return '🦅 A falcon stoops';
    }

    roostNow() {
        if (this.evening.phase !== 'swirl' && this.evening.phase !== 'arrive') return 'Already roosting';
        this.evening.next('roost');
        return '🌾 Into the reeds';
    }

    newEvening() {
        const ev = this.evening;
        // From the dark, the sky lightens first; at dusk the birds come now.
        if (ev.darkness() > 0.3) { ev.flock.clear(); ev.next('dusk'); }
        else { ev.next('arrive'); ev.arrive(); }
        return '🌅 A new evening';
    }

    // ---- The falcon you fly --------------------------------------------------------

    listen() {
        const on = (target, type, fn) => {
            target.addEventListener(type, fn, { passive: true });
            this.listeners.push(() => target.removeEventListener(type, fn));
        };
        on(window, 'resize', () => this.resize());
        // A mouse is the falcon just by hovering; touch flies it by dragging.
        on(document, 'pointerdown', event => { this.pointerType = event.pointerType; });
        on(document, 'pointermove', event => { if (event.pointerType === 'mouse') this.fly(event.clientX, event.clientY); });
        const touchy = () => this.pointerType === 'mouse' || this.config.touch;
        this.listeners.push(this.host.gestures({
            start: (x, y) => { if (touchy()) this.fly(x, y, true); },
            move: (x, y) => { if (touchy() && this.pointerType !== 'mouse') this.fly(x, y); },
            tap: (x, y) => { if (touchy() && this.config.falcon !== 'off' && y < this.horizon) this.evening.strike({ x, y }); },
        }));
    }

    fly(x, y, fresh = false) {
        if (this.config.falcon !== 'pointer') return;
        const ev = this.evening, p = ev.pointer, now = ev.time;
        if (p && !fresh && now > p.at) {
            // Velocity from the last move, smoothed: it decides which way
            // the birds break.
            const k = Math.min(1, (now - p.at) * 12), dt = Math.max(1 / 120, now - p.at);
            p.vx += ((x - p.x) / dt - p.vx) * k;
            p.vy += ((y - p.y) / dt - p.vy) * k;
            p.x = x; p.y = y; p.at = now;
        } else if (!p || fresh || now - p.at > 0.2) {
            ev.pointer = { x, y, vx: 0, vy: 0, at: now };
        } else {
            p.x = x; p.y = y;
        }
    }

    // ---- Layout and the cached layers -----------------------------------------------

    resize() {
        if (!this.canvas) return;
        const dpr = window.devicePixelRatio || 1;
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.dpr = dpr;
        this.canvas.width = Math.round(this.width * dpr);
        this.canvas.height = Math.round(this.height * dpr);
        const bottom = this.host.insets?.bottom || 0;
        this.horizon = Math.round((this.height - bottom) * (this.height > this.width ? 0.8 : 0.79));
        this.buildLayers();
        this.placeEvening(true);
    }

    buildLayers() {
        const W = this.width, H = this.height, Y = this.horizon, dpr = this.dpr;
        const palette = MURMURATION_SKIES[this.config.skyPalette] || MURMURATION_SKIES.amber;
        this.palette = palette;
        // Repeatable art: the same marsh every time for this screen.
        const random = WP.seededRandom(Math.round(W * 7 + H * 13));
        const layer = (h = H) => {
            const c = document.createElement('canvas');
            c.width = Math.round(W * dpr);
            c.height = Math.round(h * dpr);
            const g = c.getContext('2d');
            g.setTransform(dpr, 0, 0, dpr, 0, 0);
            return [c, g];
        };
        const [dusk, gd] = layer(), [night, gn] = layer();
        this.paintSky(gd, palette.sky, palette, random, false);
        this.paintSky(gn, MURMURATION_NIGHT, null, random, true);
        this.dusk = dusk;
        this.night = night;
        this.paintReeds(random);
    }

    // Sky above, its reflection in the water below, the far treeline on the
    // horizon between them.
    paintSky(g, stops, palette, random, night) {
        const W = this.width, H = this.height, Y = this.horizon;
        const sky = g.createLinearGradient(0, 0, 0, Y);
        for (const [at, colour] of stops) sky.addColorStop(at, colour);
        g.fillStyle = sky;
        g.fillRect(0, 0, W, Y);
        if (palette) {
            // The afterglow where the sun went down.
            const [r, gg, b] = palette.sun, sx = W * palette.sunX;
            const glow = g.createRadialGradient(sx, Y, 0, sx, Y, Math.max(W, Y) * 0.6);
            glow.addColorStop(0, `rgba(${r},${gg},${b},0.55)`);
            glow.addColorStop(0.35, `rgba(${r},${gg},${b},0.18)`);
            glow.addColorStop(1, `rgba(${r},${gg},${b},0)`);
            g.fillStyle = glow;
            g.fillRect(0, 0, W, Y);
        } else {
            // Stars, thicker towards the top.
            for (let i = 0; i < 220; i++) {
                const y = Y * Math.pow(random(), 1.6) * 0.92, x = random() * W, s = random() < 0.08 ? 1.6 : 0.9;
                g.fillStyle = `rgba(235,238,255,${(0.25 + random() * 0.6) * (1 - y / Y * 0.7)})`;
                g.fillRect(x, y, s, s);
            }
        }
        // Water: the sky upside down, darker and bluer, fading towards us.
        g.save();
        g.translate(0, 2 * Y);
        g.scale(1, -1);
        g.globalAlpha = 0.7;
        g.drawImage(g.canvas, 0, 0, g.canvas.width, Math.round(Y * this.dpr), 0, 0, W, Y);
        g.restore();
        const water = g.createLinearGradient(0, Y, 0, H);
        const tint = palette ? palette.water : '#05070f';
        water.addColorStop(0, this.rgba(tint, 0.35));
        water.addColorStop(1, this.rgba(tint, 0.95));
        g.fillStyle = water;
        g.fillRect(0, Y, W, H - Y);
        // Wind lines on the water: thin bright streaks, shorter far away.
        for (let i = 0; i < 70; i++) {
            const d = random(), y = Y + 2 + Math.pow(d, 1.8) * (H - Y);
            const len = (20 + random() * 120) * (0.3 + d);
            g.fillStyle = night ? `rgba(160,170,210,${0.05 + random() * 0.06})` : `rgba(255,236,210,${0.06 + random() * 0.1})`;
            g.fillRect(random() * W, y, len, 0.7 + d);
        }
        // The far shore: a continuous band of woodland, its top a run of
        // rounded crowns, paler behind and darker in front.
        const shore = (colour, scale, crowns) => {
            const step = 2, n = Math.ceil(W / step) + 2, top = new Float32Array(n);
            const k = (0.6 + Math.min(W, H) / 1600) * scale, p1 = random() * 6, p2 = random() * 6;
            for (let i = 0; i < n; i++) top[i] = k * (2.5 + 1.5 * Math.sin(i * step / 90 + p1) + Math.sin(i * step / 23 + p2));
            for (let c = 0; c < crowns; c++) {
                const cx = random() * W, w = 6 + random() * 18, h = k * (3 + random() * (random() < 0.15 ? 14 : 6));
                for (let i = Math.max(0, Math.floor((cx - w) / step)); i <= Math.min(n - 1, Math.ceil((cx + w) / step)); i++) {
                    const d = (i * step - cx) / w;
                    if (d * d < 1) top[i] = Math.max(top[i], h * Math.sqrt(1 - d * d) + k * 2);
                }
            }
            g.fillStyle = colour;
            g.beginPath();
            g.moveTo(0, Y + 1);
            for (let i = 0; i < n; i++) g.lineTo(i * step, Y - top[i]);
            g.lineTo(W, Y + 1);
            g.closePath();
            g.fill();
        };
        shore(night ? '#0b0e1a' : this.mix(palette.trees, palette.sky[palette.sky.length - 1][1], 0.5), 1.3, W / 10);
        shore(night ? '#070910' : palette.trees, 0.8, W / 16);
    }

    // a and b mixed, #rrggbb, k of the way from a to b.
    mix(a, b, k) {
        const p = parseInt(a.slice(1), 16), q = parseInt(b.slice(1), 16);
        const c = shift => Math.round((p >> shift & 255) * (1 - k) + (q >> shift & 255) * k);
        return `rgb(${c(16)},${c(8)},${c(0)})`;
    }

    // The reeds in front, painted once: two dense beds with feathery heads,
    // and scattered stems between. The flock roosts in the bigger bed.
    paintReeds(random) {
        const W = this.width, H = this.height, Y = this.horizon;
        const top = Math.round(Y - (H - Y) * 0.6);   // tallest plume
        const [c, g] = (() => {
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(W * this.dpr);
            canvas.height = Math.round((H - top) * this.dpr);
            const ctx = canvas.getContext('2d');
            ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, -top * this.dpr);
            return [canvas, ctx];
        })();
        this.reeds = c;
        this.reedsTop = top;
        g.fillStyle = g.strokeStyle = this.palette.reeds;
        const portrait = H > W, ps = Math.min(1, 0.45 + W / 1600);
        const beds = [
            { x: W * (portrait ? 0.3 : 0.24), w: W * (portrait ? 0.55 : 0.34), h: (H - Y) * (portrait ? 0.95 : 1.25) },
            { x: W * (portrait ? 0.92 : 0.84), w: W * (portrait ? 0.4 : 0.26), h: (H - Y) * (portrait ? 0.7 : 0.85) },
        ];
        const stem = (x, h, lean, plume) => {
            const base = H + 4, tipX = x + lean * h, tipY = base - h;
            g.lineWidth = 0.8 + random() * 1.1;
            g.beginPath();
            g.moveTo(x, base);
            g.quadraticCurveTo(x + lean * h * 0.2, base - h * 0.6, tipX, tipY);
            g.stroke();
            if (plume) {
                // A seed head: a drooping feather of short strokes.
                g.save();
                g.translate(tipX, tipY);
                g.rotate(lean * 1.4 + 0.25 * (random() - 0.5));
                g.beginPath();
                g.ellipse(lean * 4 * ps, 6 * ps, (2.2 + random() * 1.5) * ps, (7 + random() * 6) * ps, lean, 0, Math.PI * 2);
                g.fill();
                g.restore();
            } else {
                // A blade of a leaf, angled up off the stem and bending over.
                const ly = base - h * (0.25 + random() * 0.4), side = random() < 0.5 ? -1 : 1, len = h * (0.2 + random() * 0.2);
                g.lineWidth = 1;
                g.beginPath();
                g.moveTo(x + lean * (base - ly) * 0.2, ly);
                g.quadraticCurveTo(x + side * len * 0.4, ly - len * 0.9, x + side * len * 0.75, ly - len * 0.55);
                g.stroke();
            }
        };
        for (const bed of beds) {
            // The dense foot of the bed, where the roosting birds go: a mass
            // whose top is a thicket of blades.
            const mass = bed.h * 0.3;
            g.beginPath();
            g.moveTo(bed.x - bed.w * 0.6, H + 2);
            for (let x = bed.x - bed.w * 0.6; x <= bed.x + bed.w * 0.6; x += 1.5 + random() * 2.5) {
                const t = (x - bed.x) / (bed.w * 1.2) + 0.5;
                const top = H - mass * Math.pow(Math.max(0, Math.sin(Math.PI * t)), 0.7);
                g.lineTo(x, top + 2 + random() * 3);
                g.lineTo(x + 0.6 + random() * 0.8, top - random() * mass * 0.35);
            }
            g.lineTo(bed.x + bed.w * 0.6, H + 2);
            g.closePath();
            g.fill();
            const stems = Math.round(bed.w / 2.2);
            for (let i = 0; i < stems; i++) {
                const t = (random() + random() + random()) / 3;
                const x = bed.x - bed.w / 2 + t * bed.w;
                const h = bed.h * (0.45 + 0.55 * Math.sin(Math.PI * t)) * (0.7 + 0.35 * random());
                stem(x, Math.min(h, H - top - 14), (random() - 0.4) * 0.3, random() < 0.45);
            }
            bed.floor = H - mass * 0.7;
        }
        // Scattered stems along the shore.
        for (let i = 0; i < W / 9; i++) stem(random() * W, (H - Y) * (0.25 + random() * 0.5), (random() - 0.4) * 0.3, random() < 0.3);
        const bed = beds[0];
        this.roost = { x: bed.x, y: H - bed.h * 0.5, floor: bed.floor };
    }

    rgba(hex, alpha) {
        const n = parseInt(hex.slice(1), 16);
        return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`;
    }

    // ---- Frames -------------------------------------------------------------------

    frame(now) {
        if (!this.running) return;
        const ev = this.evening;
        const elapsed = this.last ? (now - this.last) / 1000 : 0;
        this.last = now;
        if (ev.phase === 'night') {
            // Nothing flies at night: no frames until the next evening,
            // and the pause counts in real time.
            ev.update(Math.min(elapsed, 15));
            if (ev.phase === 'night') {
                this.draw();
                this.host.idleUntil?.(Math.max(50, (12 - ev.phaseTime) * 1000));
                this.frameId = requestAnimationFrame(t => this.frame(t));
                return;
            }
        } else {
            // Steps of at most 1/20 s: one per frame on every tier.
            const dt = Math.min(0.1, elapsed), steps = Math.ceil(dt / 0.05);
            for (let i = 0; i < steps; i++) ev.update(dt / steps);
        }
        this.draw();
        this.frameId = requestAnimationFrame(t => this.frame(t));
    }

    draw() {
        const ctx = this.ctx, ev = this.evening, dpr = this.dpr, W = this.width, H = this.height;
        const dark = ev.darkness();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        if (dark < 0.999) ctx.drawImage(this.dusk, 0, 0);
        if (dark > 0.001) {
            ctx.globalAlpha = dark;
            ctx.drawImage(this.night, 0, 0);
            ctx.globalAlpha = 1;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.drawBirds(ctx, dark);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(this.reeds, 0, Math.round(this.reedsTop * dpr));
    }

    // Every bird, in four filled paths: far, middle and near shades, and
    // their reflections on the water. A bird is a tiny quad across its
    // heading; the wingbeat swaps a wide frame (wings out) for a narrow one
    // (wings up), and a bird banking in an alarm wave shows its whole wing.
    drawBirds(ctx, dark) {
        const f = this.evening.flock, n = f.count;
        if (!f.flying && !this.evening.activeFalcon()) return;
        const { x, y, vx, vy, z, flap, state, alarm, alarmAt } = f;
        const t = f.time, Y = this.horizon, mirror = Y - (this.height - Y);
        const size = Math.max(1.2, Math.min(2, this.evening.unit * 0.24));
        const toDepth = 0.5 / this.evening.depth();
        const paths = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
        for (let i = 0; i < n; i++) {
            if (!state[i]) continue;
            const px = x[i], py = y[i];
            if (px < -10 || px > this.width + 10 || py < -10 || py > this.height) continue;
            const sp = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]) + 1e-6;
            const fx = vx[i] / sp, fy = vy[i] / sp;
            // Nearer birds (z towards us) are bigger and darker.
            const depth = Math.max(0, Math.min(1, 0.5 + z[i] * toDepth));
            let s = size * (0.7 + 0.6 * depth), span, shade = depth < 0.36 ? 0 : depth < 0.66 ? 1 : 2;
            const since = t - alarmAt[i];
            if (since < 0.4 && alarm[i] > 0.3) { span = s * 1.9; shade = 2; }
            else span = (flap[i] % 1) < 0.5 ? s * 1.35 : s * 0.55;
            const path = paths[shade];
            const back = s * 0.4;
            path.moveTo(px + fy * span - fx * back, py - fx * span - fy * back);
            path.lineTo(px + fx * s * 0.9, py + fy * s * 0.9);
            path.lineTo(px - fy * span - fx * back, py + fx * span - fy * back);
            path.lineTo(px - fx * s * 0.7, py - fy * s * 0.7);
            if (py > mirror) {
                const ry = 2 * Y - py;
                paths[3].moveTo(px - span, ry);
                paths[3].lineTo(px + span, ry);
                paths[3].lineTo(px, ry + s * 0.8);
            }
        }
        const [r, g, b] = this.palette.bird;
        const bird = alpha => `rgba(${r},${g},${b},${alpha})`;
        ctx.fillStyle = bird(0.42);
        ctx.fill(paths[0]);
        ctx.fillStyle = bird(0.68);
        ctx.fill(paths[1]);
        ctx.fillStyle = bird(0.92);
        ctx.fill(paths[2]);
        ctx.fillStyle = bird(0.3 * (1 - dark));
        ctx.fill(paths[3]);
        this.drawFalcon(ctx, size);
    }

    // The falcon: bigger than a starling, with long pointed wings swept
    // back in a stoop.
    drawFalcon(ctx, size) {
        const F = this.evening.activeFalcon();
        if (!F || this.evening.phase === 'night') return;
        const sp = Math.hypot(F.vx, F.vy);
        const fx = sp > 1 ? F.vx / sp : 0, fy = sp > 1 ? F.vy / sp : -1;
        const s = size * 4.2, beat = sp > this.evening.unit * 30 ? 0.55 : 0.8 + 0.35 * Math.sin(this.evening.time * 14);
        const px = F.x, py = F.y, w = s * 1.9 * beat, sweep = s * (1.3 - beat * 0.5);
        ctx.fillStyle = `rgba(${this.palette.bird.join(',')},0.95)`;
        ctx.beginPath();
        ctx.moveTo(px + fx * s * 1.1, py + fy * s * 1.1);                       // head
        ctx.lineTo(px + fy * w - fx * sweep, py - fx * w - fy * sweep);          // wing tip
        ctx.lineTo(px - fx * s * 0.2 + fy * s * 0.25, py - fy * s * 0.2 - fx * s * 0.25);
        ctx.lineTo(px - fx * s * 1.2 + fy * s * 0.18, py - fy * s * 1.2 - fx * s * 0.18);   // tail
        ctx.lineTo(px - fx * s * 1.2 - fy * s * 0.18, py - fy * s * 1.2 + fx * s * 0.18);
        ctx.lineTo(px - fx * s * 0.2 - fy * s * 0.25, py - fy * s * 0.2 + fx * s * 0.25);
        ctx.lineTo(px - fy * w - fx * sweep, py + fx * w - fy * sweep);          // wing tip
        ctx.closePath();
        ctx.fill();
    }
}
