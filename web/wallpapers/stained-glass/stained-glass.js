// Stained Glass: a leaded window in a dark stone wall, with the day's light
// moving through it and throwing coloured shafts across the floor below
// (SPEC §10.8).
//
// Layers, cheapest first:
//   wall + glass   built once per resize: the stone, a Voronoi window of a
//                  few hundred seeded pieces, each textured, and the lead
//   base           wall and glass lit for the hour: recomposed only when the
//                  light changes (every minute or so), a few drawImages
//   light          shafts and the window's pool of colour on the floor, at
//                  reduced resolution, screened over the base by the
//                  compositor; passing clouds only change its CSS opacity
//   motes          pooled sprites drifting in the shafts, the only per-frame
//                  drawing
// The time of day comes from host.now(), so ?date=…T12:00 and T00:00 show
// noon and midnight.

// ---- Pure helpers (no DOM): unit tested in tools/stained-glass.test.mjs -----

(function (root) {
    'use strict';

    // Keep the part of a convex or concave polygon where (p - m)·n <= 0.
    function clipHalfPlane(poly, mx, my, nx, ny) {
        const out = [];
        for (let i = 0; i < poly.length; i++) {
            const a = poly[i], b = poly[(i + 1) % poly.length];
            const da = (a[0] - mx) * nx + (a[1] - my) * ny, db = (b[0] - mx) * nx + (b[1] - my) * ny;
            if (da <= 0) out.push(a);
            if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
                const t = da / (da - db);
                out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
            }
        }
        return out;
    }

    // Voronoi cells of `sites` inside the convex polygon `bounds`, by
    // clipping each site's cell with the bisectors of its nearest neighbours
    // until no farther neighbour could reach it.
    function voronoi(sites, bounds) {
        return sites.map((p, index) => {
            const others = [];
            for (let j = 0; j < sites.length; j++) {
                if (j !== index) others.push([sites[j], (sites[j][0] - p[0]) ** 2 + (sites[j][1] - p[1]) ** 2]);
            }
            others.sort((a, b) => a[1] - b[1]);
            let cell = bounds.slice();
            for (const [q, d2] of others) {
                let reach = 0;
                for (const v of cell) reach = Math.max(reach, (v[0] - p[0]) ** 2 + (v[1] - p[1]) ** 2);
                if (d2 > 4 * reach) break;
                cell = clipHalfPlane(cell, (p[0] + q[0]) / 2, (p[1] + q[1]) / 2, q[0] - p[0], q[1] - p[1]);
                if (cell.length < 3) break;
            }
            return { site: p, points: cell };
        }).filter(cell => cell.points.length >= 3);
    }

    function area(points) {
        let sum = 0;
        for (let i = 0; i < points.length; i++) {
            const [x0, y0] = points[i], [x1, y1] = points[(i + 1) % points.length];
            sum += x0 * y1 - x1 * y0;
        }
        return sum / 2;
    }

    function centroid(points) {
        let x = 0, y = 0, a = 0;
        for (let i = 0; i < points.length; i++) {
            const [x0, y0] = points[i], [x1, y1] = points[(i + 1) % points.length];
            const c = x0 * y1 - x1 * y0;
            a += c;
            x += (x0 + x1) * c;
            y += (y0 + y1) * c;
        }
        return Math.abs(a) < 1e-9 ? points[0] : [x / (3 * a), y / (3 * a)];
    }

    const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

    // The sun for a moment, in a generic mid-northern climate: days longer in
    // summer, higher at noon. elevation in degrees (negative below the
    // horizon), azimuth -1 (morning, east) to 1 (evening), day 0..1, warmth
    // 0..1 (low sun), night 0..1, and the light's colour.
    function sunAt(date) {
        const start = new Date(date.getFullYear(), 0, 1);
        const doy = (date - start) / 864e5;
        const season = Math.cos(2 * Math.PI * (doy - 172) / 365.25);
        const length = 12 + 3 * season;
        const rise = 12.5 - length / 2, set = rise + length;
        const hour = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
        const peak = 48 + 18 * season;
        let elevation, azimuth;
        if (hour >= rise && hour <= set) {
            const p = (hour - rise) / length;
            elevation = peak * Math.sin(Math.PI * p);
            azimuth = 2 * p - 1;
        } else {
            const away = hour > set ? Math.min(hour - set, rise + 24 - hour) : Math.min(rise - hour, hour + 24 - set);
            elevation = -Math.min(30, away * 12);
            azimuth = hour > set || hour < rise - 6 ? 1 : -1;
        }
        const day = smooth(-5, 8, elevation);
        const warmth = 1 - smooth(4, 28, elevation);
        const night = 1 - smooth(-12, -3, elevation);
        const mix = (a, b, t) => Math.round(a + (b - a) * t);
        const colour = [255, mix(246, 160, warmth), mix(226, 96, warmth)];
        return { hour, rise, set, length, elevation, azimuth, day, warmth, night, colour };
    }

    // A pinned time of day, as an hour on that date.
    function pinnedHour(name, date) {
        const { rise, length } = sunAt(date);
        return { dawn: rise + 0.35, morning: rise + length * 0.22, noon: rise + length / 2, afternoon: rise + length * 0.72, dusk: rise + length - 0.25, night: 0.5 }[name];
    }

    root.StainedGlass = { clipHalfPlane, voronoi, area, centroid, sunAt, pinnedHour, smooth };
})(globalThis);

// ---- Palettes ----------------------------------------------------------------

// Glass colours (weighted by repetition), and the landscape design's scene.
const GLASS_PALETTES = {
    cathedral: {
        glass: ['#173a8c', '#1f4fb0', '#173a8c', '#2a62c4', '#9c1b2b', '#c42a35', '#1f6b3a', '#d8a21e', '#5a2878', '#e9dcae', '#173a8c', '#9c1b2b'],
        scene: { skyTop: '#1d3f96', skyLow: '#6b9bd8', sun: '#f2c84b', far: '#3f6e8c', mid: '#2f7a45', near: '#1f5a30', crown: '#2d6b2a', trunk: '#5b3a22', flower: '#c42a35' },
    },
    nouveau: {
        glass: ['#c98b2b', '#e2b04a', '#6f7f2e', '#2f6f6a', '#d7a6a0', '#efe2c4', '#8a4b2a', '#3f5b3a', '#e2b04a', '#efe2c4'],
        scene: { skyTop: '#d9b46a', skyLow: '#f0e2bd', sun: '#f6d68a', far: '#8e9a6a', mid: '#6f7f2e', near: '#3f5b3a', crown: '#4f6b2e', trunk: '#6b4226', flower: '#d7a6a0' },
    },
    seaglass: {
        glass: ['#9fd3c7', '#7fb8b0', '#bfe3e0', '#5f9ea0', '#d8efe9', '#a7c7e7', '#e9e4d0', '#4f7c8a', '#9fd3c7'],
        scene: { skyTop: '#7fb8c8', skyLow: '#d8efe9', sun: '#f4ecc8', far: '#a7c7e7', mid: '#5f9ea0', near: '#4f7c8a', crown: '#6fa38f', trunk: '#8a7a62', flower: '#e9e4d0' },
    },
    sunset: {
        glass: ['#f28c28', '#f6b44a', '#e0524f', '#b8336a', '#6d2e7a', '#3c2a6b', '#ffd27a', '#ff7a59', '#f28c28', '#b8336a'],
        scene: { skyTop: '#4a2a72', skyLow: '#f28c28', sun: '#ffd27a', far: '#b8336a', mid: '#6d2e7a', near: '#3c2a6b', crown: '#2a1f4f', trunk: '#1f1633', flower: '#ffd27a' },
    },
};

const hexRgb = hex => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const rgbCss = ([r, g, b], a = 1) => a === 1 ? `rgb(${r | 0}, ${g | 0}, ${b | 0})` : `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${a})`;
const tone = ([r, g, b], k) => k >= 0 ? [r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k] : [r * (1 + k), g * (1 + k), b * (1 + k)];

// ---- The wallpaper ---------------------------------------------------------------

class StainedGlassAnimationManager {
    constructor(host) {
        this.host = host;
        this.config = WP.settings.load();
        this.random = Math.random;
        this.running = false;
        this.windowSeed = Math.floor(this.random() * 1e9);
        this.motes = [];
        // glassBuilds: Voronoi window builds (once per resize: SPEC §9 8.3).
        this.stats = { glassBuilds: 0, lightBuilds: 0, frames: 0 };
    }

    start() {
        if (this.running) return;
        this.running = true;
        const canvas = (blend) => {
            const c = document.createElement('canvas');
            Object.assign(c.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: '-1', pointerEvents: 'none', mixBlendMode: blend });
            document.body.appendChild(c);
            return c;
        };
        this.base = canvas('normal');
        this.lightCanvas = canvas('screen');
        this.moteCanvas = canvas('normal');
        this.sprite = this.makeSprite();
        this.onResize = () => this.resize();
        window.addEventListener('resize', this.onResize);
        this.resize();
        this.animationId = requestAnimationFrame(t => this.frame(t));
    }

    stop() {
        this.running = false;
        cancelAnimationFrame(this.animationId);
        window.removeEventListener('resize', this.onResize);
        for (const c of [this.base, this.lightCanvas, this.moteCanvas]) c?.remove();
    }

    applySettings(config) {
        const before = this.config;
        this.config = { ...config };
        if (!this.running) return;
        if (['design', 'palette', 'cellCount'].some(k => config[k] !== before[k])) this.buildGlass();
        else if (['light', 'shafts'].some(k => config[k] !== before[k])) this.relight();
        this.kick();
    }

    onQuality() {
        // Shaft count and the light layer's resolution follow the tier; the
        // motes thin or fill in as they drift (frame()).
        if (this.glass) this.relight();
        this.kick();
    }

    newWindow() {
        this.windowSeed = Math.floor(this.random() * 1e9);
        this.buildGlass();
        this.kick();
    }

    kick() {
        if (!this.running) return;
        this.host.idleUntil(0);
        requestAnimationFrame(() => {});
    }

    // ---- Size and layout ---------------------------------------------------------

    resize() {
        this.W = innerWidth;
        this.H = innerHeight;
        this.dpr = window.devicePixelRatio || 1;
        this.base.width = Math.round(this.W * this.dpr);
        this.base.height = Math.round(this.H * this.dpr);
        const md = Math.min(this.dpr, 1.5);
        this.moteCanvas.width = Math.round(this.W * md);
        this.moteCanvas.height = Math.round(this.H * md);
        this.moteScale = md;
        this.buildWall();
        this.buildGlass();
    }

    // The window's openings (convex polygons, CSS px), by design and shape.
    layout() {
        const { W, H } = this;
        const portrait = H > W * 1.1;
        this.floorY = H * (portrait ? 0.7 : 0.74);
        const design = this.config.design;
        const arc = (cx, cy, r, a0, a1, n = 24) => Array.from({ length: n + 1 }, (_, i) => {
            const a = a0 + (a1 - a0) * i / n;
            return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
        });
        // A lancet: straight sides, a pointed (equilateral) arch.
        const lancet = (cx, w, top, bottom) => {
            const spring = top + w * 0.866;
            const left = cx - w / 2, right = cx + w / 2;
            const a = Math.acos(0.5);
            return [[left, bottom], [right, bottom], ...arc(left, spring, w, 0, -a, 12), ...arc(right, spring, w, Math.PI + a, Math.PI, 12)]
                .filter((p, i, all) => i === 0 || Math.hypot(p[0] - all[i - 1][0], p[1] - all[i - 1][1]) > 0.01);
        };
        const round = (cx, w, top, bottom) => {
            const r = w / 2;
            return [[cx - r, bottom], [cx + r, bottom], ...arc(cx, top + r, r, 0, -Math.PI, 28)];
        };
        if (design === 'rose') {
            const r = Math.min(W * 0.42, H * 0.3);
            const cy = Math.max(r + H * 0.05, H * (portrait ? 0.34 : 0.37));
            return [arc(W / 2, cy, r, 0, -Math.PI * 2, 96).slice(0, 96)];
        }
        const top = H * 0.06, bottom = H * (portrait ? 0.6 : 0.63);
        if (design === 'landscape') {
            const w = portrait ? W * 0.7 : Math.min(W * 0.52, (bottom - top) * 1.15);
            return [round(W / 2, w, top, bottom)];
        }
        if (portrait || W < H * 1.25) return [lancet(W / 2, Math.min(W * 0.6, (bottom - top) * 0.55), top, bottom)];
        const c = Math.min(W * 0.17, (bottom - top) * 0.36), side = c * 0.8, gap = c * 0.34;
        return [
            lancet(W / 2 - c / 2 - gap - side / 2, side, top + c * 0.55, bottom),
            lancet(W / 2, c, top, bottom),
            lancet(W / 2 + c / 2 + gap + side / 2, side, top + c * 0.55, bottom),
        ];
    }

    // ---- The wall (once per resize) -------------------------------------------------

    buildWall() {
        const { W, H, dpr } = this;
        const rand = WP.seededRandom(this.windowSeed ^ 0x5eed);
        const c = this.wall = this.wall || document.createElement('canvas');
        c.width = Math.round(W * dpr);
        c.height = Math.round(H * dpr);
        const g = c.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        const floorY = H * (H > W * 1.1 ? 0.7 : 0.74);
        // Ashlar: courses of dressed stone, each block a little different.
        g.fillStyle = '#16130f';
        g.fillRect(0, 0, W, floorY);
        const course = Math.max(26, H / 13);
        for (let y = floorY, row = 0; y > -course; y -= course, row++) {
            let x = -rand() * course * 2;
            while (x < W) {
                const w = course * (1.5 + rand() * 1.4);
                const l = 34 + rand() * 12;
                g.fillStyle = `rgb(${l + 6}, ${l + 1}, ${l - 5})`;
                g.fillRect(x + 1.5, y - course + 1.5, w - 3, course - 3);
                // A soft worn face: lighter towards the top of each block.
                g.fillStyle = 'rgba(255, 240, 220, 0.025)';
                g.fillRect(x + 1.5, y - course + 1.5, w - 3, (course - 3) * 0.4);
                x += w;
            }
        }
        for (let i = 0; i < (W * floorY) / 260; i++) {
            g.fillStyle = rand() < 0.5 ? 'rgba(0, 0, 0, 0.18)' : 'rgba(255, 235, 210, 0.05)';
            g.fillRect(rand() * W, rand() * floorY, 1 + rand() * 1.5, 1 + rand() * 1.5);
        }
        // The floor: flagstones in perspective, to a vanishing point at eye level.
        const horizon = H * 0.42, vx = W / 2;
        const floor = g.createLinearGradient(0, floorY, 0, H);
        floor.addColorStop(0, '#24201b');
        floor.addColorStop(1, '#14110e');
        g.fillStyle = floor;
        g.fillRect(0, floorY, W, H - floorY);
        g.strokeStyle = 'rgba(0, 0, 0, 0.45)';
        g.lineWidth = 1.2;
        g.beginPath();
        for (let k = -14; k <= 14; k++) {
            const x = vx + k * W * 0.12;
            g.moveTo(vx + (x - vx), floorY);
            g.lineTo(vx + (x - vx) * ((H - horizon) / (floorY - horizon)), H);
        }
        for (let z = 1; z < 12; z++) {
            const s = 1 + z * z * 0.06;
            const y = horizon + (floorY - horizon) * s;
            if (y > H) break;
            g.moveTo(0, y);
            g.lineTo(W, y);
        }
        g.stroke();
        // A skirting shadow where the wall meets the floor.
        const skirt = g.createLinearGradient(0, floorY - 6, 0, floorY + 18);
        skirt.addColorStop(0, 'rgba(0, 0, 0, 0)');
        skirt.addColorStop(0.3, 'rgba(0, 0, 0, 0.55)');
        skirt.addColorStop(1, 'rgba(0, 0, 0, 0)');
        g.fillStyle = skirt;
        g.fillRect(0, floorY - 6, W, 24);
    }

    // ---- The glass (once per resize, or for new settings) ------------------------------

    buildGlass() {
        this.stats.glassBuilds++;
        const { W, H, dpr } = this;
        const rand = WP.seededRandom(this.windowSeed);
        const openings = this.openings = this.layout();
        const pal = GLASS_PALETTES[this.config.palette] || GLASS_PALETTES.cathedral;
        const total = openings.reduce((s, o) => s + Math.abs(StainedGlass.area(o)), 0);

        const cells = [];
        this.rose = null;
        for (const opening of openings) {
            const share = Math.max(12, Math.round(this.config.cellCount * Math.abs(StainedGlass.area(opening)) / total));
            for (const cell of this.cellsFor(opening, share, rand, pal)) cells.push(cell);
        }
        this.cells = cells;

        const c = this.glass = this.glass || document.createElement('canvas');
        c.width = Math.round(W * dpr);
        c.height = Math.round(H * dpr);
        const g = c.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, W, H);
        const lead = Math.max(2.6, Math.min(W, H) * 0.0065);

        // Each piece: its colour, thicker (darker) at the edges, streaks
        // and the odd seed bubble from the pot.
        for (const cell of cells) {
            const path = this.pathOf(cell.points);
            g.save();
            g.clip(path);
            const [cx, cy] = cell.centre;
            const r = Math.sqrt(Math.abs(StainedGlass.area(cell.points))) * 0.9 + 4;
            const ox = cx + (rand() - 0.5) * r * 0.6, oy = cy + (rand() - 0.5) * r * 0.6;
            const body = g.createRadialGradient(ox, oy, 0, cx, cy, r);
            body.addColorStop(0, rgbCss(tone(cell.colour, 0.22)));
            body.addColorStop(0.6, rgbCss(cell.colour));
            body.addColorStop(1, rgbCss(tone(cell.colour, -0.3)));
            g.fillStyle = body;
            g.fill(path);
            const angle = rand() * Math.PI;
            g.strokeStyle = rgbCss(tone(cell.colour, 0.45), 0.12);
            g.lineWidth = 0.8 + rand();
            g.beginPath();
            for (let s = 0; s < 3; s++) {
                const off = (rand() - 0.5) * r * 1.6;
                g.moveTo(cx - Math.cos(angle) * r + Math.sin(angle) * off, cy - Math.sin(angle) * r - Math.cos(angle) * off);
                g.lineTo(cx + Math.cos(angle) * r + Math.sin(angle) * off, cy + Math.sin(angle) * r - Math.cos(angle) * off);
            }
            g.stroke();
            g.fillStyle = 'rgba(255, 255, 255, 0.18)';
            for (let s = Math.floor(rand() * 4); s > 0; s--) {
                g.beginPath();
                g.arc(cx + (rand() - 0.5) * r, cy + (rand() - 0.5) * r, 0.6 + rand() * 1.2, 0, Math.PI * 2);
                g.fill();
            }
            g.restore();
        }

        // Lead came: a dark round bead with a dull highlight, and solder
        // where the cames meet.
        const came = new Path2D();
        for (const cell of cells) came.addPath(this.pathOf(cell.points));
        g.lineJoin = 'round';
        g.lineWidth = lead;
        g.strokeStyle = '#141210';
        g.stroke(came);
        g.save();
        g.translate(-lead * 0.18, -lead * 0.22);
        g.lineWidth = lead * 0.28;
        g.strokeStyle = 'rgba(190, 180, 165, 0.16)';
        g.stroke(came);
        g.restore();
        const joints = new Map();
        for (const cell of cells) for (const [x, y] of cell.points) {
            const k = `${Math.round(x / 2)},${Math.round(y / 2)}`;
            joints.set(k, (joints.get(k) || 0) + 1);
        }
        g.fillStyle = '#1d1a16';
        for (const [k, n] of joints) {
            if (n < 3) continue;
            const [x, y] = k.split(',').map(v => v * 2);
            g.beginPath();
            g.arc(x, y, lead * 0.62, 0, Math.PI * 2);
            g.fill();
        }

        // A small, soft copy of the glass alone, for the pool of colour on
        // the floor (before any stone is drawn).
        const bottom = Math.max(...openings.flat().map(p => p[1]));
        const left = Math.min(...openings.flat().map(p => p[0])), right = Math.max(...openings.flat().map(p => p[0]));
        this.bounds = { x0: left, x1: right, y0: Math.min(...openings.flat().map(p => p[1])), y1: bottom };
        const height = bottom - this.bounds.y0;
        const low = this.glassLow = this.glassLow || document.createElement('canvas');
        low.width = Math.max(1, Math.round((right - left) / 6));
        low.height = Math.max(1, Math.round(height / 6));
        const lg = low.getContext('2d');
        lg.clearRect(0, 0, low.width, low.height);
        lg.drawImage(c, left * dpr, this.bounds.y0 * dpr, (right - left) * dpr, height * dpr, 0, 0, low.width, low.height);

        // A rose window's stone tracery: rings and spokes the glass sits in.
        if (this.rose) {
            const { cx, cy, R, rings } = this.rose;
            const at = k => R * Math.pow((k + 0.5) / (rings + 0.45), 0.92);
            const inner = at(1), middle = at(Math.ceil(rings / 2));
            const tracery = new Path2D();
            for (const r of [inner, middle]) {
                tracery.moveTo(cx + r, cy);
                tracery.arc(cx, cy, r, 0, Math.PI * 2);
            }
            for (let i = 0; i < 16; i++) {
                const a = (i + 0.5) / 16 * Math.PI * 2 - Math.PI / 2;
                const from = i % 2 ? middle : inner;
                tracery.moveTo(cx + from * Math.cos(a), cy + from * Math.sin(a));
                tracery.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a));
            }
            g.lineCap = 'round';
            g.lineWidth = lead * 2.6;
            g.strokeStyle = '#3a342c';
            g.stroke(tracery);
            g.lineWidth = lead * 1.5;
            g.strokeStyle = '#5d5447';
            g.stroke(tracery);
        }

        // The stone surround: a moulded reveal around each opening.
        for (const opening of openings) {
            const path = this.pathOf(opening);
            g.lineWidth = lead * 7;
            g.strokeStyle = '#4b4339';
            g.stroke(path);
            g.lineWidth = lead * 4.2;
            g.strokeStyle = '#5d5447';
            g.stroke(path);
            g.lineWidth = lead * 1.6;
            g.strokeStyle = '#2a251f';
            g.stroke(path);
        }
        // A sill under the window.
        g.fillStyle = '#5d5447';
        g.fillRect(left - lead * 6, bottom + lead * 2, right - left + lead * 12, lead * 4);
        g.fillStyle = 'rgba(0, 0, 0, 0.5)';
        g.fillRect(left - lead * 6, bottom + lead * 6, right - left + lead * 12, lead * 3);

        // Per column of the window: the average colour and how much is
        // glass, for the shafts.
        const columns = 48;
        this.columns = Array.from({ length: columns }, () => ({ rgb: [0, 0, 0], weight: 0 }));
        for (const cell of cells) {
            const a = Math.abs(StainedGlass.area(cell.points));
            const k = Math.min(columns - 1, Math.max(0, Math.floor((cell.centre[0] - left) / (right - left) * columns)));
            const col = this.columns[k];
            for (let i = 0; i < 3; i++) col.rgb[i] += cell.colour[i] * a;
            col.weight += a;
        }
        const colWidth = (right - left) / columns;
        for (const col of this.columns) {
            if (col.weight) col.rgb = col.rgb.map(v => v / col.weight);
            col.cover = Math.min(1, col.weight / (colWidth * height));
        }

        this.relight();
    }

    pathOf(points) {
        const p = new Path2D();
        p.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) p.lineTo(points[i][0], points[i][1]);
        p.closePath();
        return p;
    }

    // Sites and colours for one opening, by design.
    cellsFor(opening, count, rand, pal) {
        const xs = opening.map(p => p[0]), ys = opening.map(p => p[1]);
        const box = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
        const inside = ([x, y]) => {
            let sign = 0;
            for (let i = 0; i < opening.length; i++) {
                const a = opening[i], b = opening[(i + 1) % opening.length];
                const c = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
                if (c !== 0) { if (sign && Math.sign(c) !== sign) return false; sign = Math.sign(c); }
            }
            return true;
        };
        const glass = pal.glass.map(hexRgb);
        const design = this.config.design;
        const finish = (cells, colourOf) => cells.map(cell => {
            const centre = StainedGlass.centroid(cell.points);
            return { points: cell.points, centre, colour: colourOf(cell, centre) };
        });

        if (design === 'geometric') return finish(this.girihCells(opening, box, count, inside), cell => cell.colour);

        // Best-candidate sampling: evenly spread, never a grid.
        const scatter = (n, sites = []) => {
            for (let i = 0; i < n; i++) {
                let best = null, bestD = -1;
                for (let k = 0; k < 10; k++) {
                    const p = [box.x0 + rand() * (box.x1 - box.x0), box.y0 + rand() * (box.y1 - box.y0)];
                    if (!inside(p)) continue;
                    let d = Infinity;
                    for (const s of sites) d = Math.min(d, (s[0] - p[0]) ** 2 + (s[1] - p[1]) ** 2);
                    if (d > bestD) bestD = d, best = p;
                }
                if (best) sites.push(best);
            }
            return sites;
        };

        if (design === 'rose') {
            const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2, R = (box.x1 - box.x0) / 2;
            const rings = Math.max(3, Math.round(Math.sqrt(count / 4)));
            this.rose = { cx, cy, R, rings };
            const sites = [[cx, cy]];
            const ringOf = [0], indexOf = [0];
            for (let k = 1; k <= rings; k++) {
                const m = 8 * k, r = R * Math.pow(k / (rings + 0.45), 0.92);
                for (let i = 0; i < m; i++) {
                    const a = (i + (k % 2) * 0.5) / m * Math.PI * 2 - Math.PI / 2;
                    sites.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
                    ringOf.push(k);
                    indexOf.push(i % k);
                }
            }
            const order = Array.from({ length: rings + 1 }, () => Math.floor(rand() * glass.length));
            const cells = StainedGlass.voronoi(sites, opening);
            return finish(cells, cell => {
                const i = sites.indexOf(cell.site);
                const k = ringOf[i], j = indexOf[i];
                if (k === 0) return hexRgb('#e8b23a');
                // Symmetric: every ring an eightfold repeat of k pieces.
                return glass[(order[k] + (j === 0 ? 0 : j % 2 ? 3 : 5)) % glass.length];
            });
        }

        if (design === 'landscape') {
            const scene = Object.fromEntries(Object.entries(pal.scene).map(([k, v]) => [k, hexRgb(v)]));
            const u = x => (x - box.x0) / (box.x1 - box.x0), v = y => (y - box.y0) / (box.y1 - box.y0);
            const X = u0 => box.x0 + u0 * (box.x1 - box.x0), Y = v0 => box.y0 + v0 * (box.y1 - box.y0);
            const hill = [(t) => 0.56 + 0.05 * Math.sin(t * 5 + 1) + 0.03 * Math.sin(t * 11), (t) => 0.66 + 0.06 * Math.sin(t * 3.4 + 2.3), (t) => 0.8 + 0.05 * Math.sin(t * 2.2 + 0.4)];
            const sun = [0.7, 0.3, 0.1], crown = [0.27, 0.52, 0.13];
            const colourAt = (a, b) => {
                const round = c => Math.hypot((a - c[0]) * (box.x1 - box.x0), (b - c[1]) * (box.y1 - box.y0)) < c[2] * (box.x1 - box.x0);
                const tree = round(crown);
                if (tree) return tone(scene.crown, (rand() - 0.5) * 0.2);
                if (Math.abs(a - crown[0]) < 0.022 && b > crown[1] && b < hill[2](a) + 0.05) return scene.trunk;
                if (b > hill[2](a)) return rand() < 0.12 ? scene.flower : tone(scene.near, (rand() - 0.5) * 0.15);
                if (b > hill[1](a)) return tone(scene.mid, (rand() - 0.5) * 0.15);
                if (b > hill[0](a)) return scene.far;
                if (round(sun)) return scene.sun;
                const t = Math.min(1, b / 0.6);
                return tone(scene.skyTop.map((c, i) => c + (scene.skyLow[i] - c) * t), (rand() - 0.5) * 0.1);
            };
            // Pairs of sites straddling each outline, so the lead follows it.
            const sites = [];
            const straddle = (pts, gap) => {
                for (let i = 1; i < pts.length; i++) {
                    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
                    const len = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / len * gap, ny = (x1 - x0) / len * gap;
                    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
                    for (const p of [[mx + nx, my + ny], [mx - nx, my - ny]]) if (inside(p)) sites.push(p);
                }
            };
            const step = Math.sqrt((box.x1 - box.x0) * (box.y1 - box.y0) / count) * 1.15, gap = step * 0.28;
            for (const h of hill) {
                const n = Math.ceil((box.x1 - box.x0) / step);
                straddle(Array.from({ length: n + 1 }, (_, i) => [X(i / n), Y(h(i / n))]), gap);
            }
            for (const [cu, cv, r] of [sun, crown]) {
                const rx = r * (box.x1 - box.x0), n = Math.max(8, Math.ceil(2 * Math.PI * rx / step));
                straddle(Array.from({ length: n + 1 }, (_, i) => [X(cu) + rx * Math.cos(i / n * Math.PI * 2), Y(cv) + rx * Math.sin(i / n * Math.PI * 2)]), gap);
            }
            scatter(Math.max(0, count - sites.length), sites);
            return finish(StainedGlass.voronoi(sites, opening), (cell, [x, y]) => colourAt(u(x), v(y)));
        }

        // Abstract: a slow field of colour, broken up here and there.
        const sites = scatter(count);
        const f1 = rand() * 6, f2 = rand() * 6;
        return finish(StainedGlass.voronoi(sites, opening), (cell, [x, y]) => {
            const a = u01(x, box.x0, box.x1), b = u01(y, box.y0, box.y1);
            const field = 0.5 + 0.25 * Math.sin(a * 4.1 + f1 + Math.sin(b * 3.3 + f2)) + 0.25 * Math.sin(b * 5.3 - a * 2.1 + f2);
            const pick = rand() < 0.18 ? rand() : field;
            return glass[Math.min(glass.length - 1, Math.floor(pick * glass.length))];
        });

        function u01(value, lo, hi) { return (value - lo) / (hi - lo); }
    }

    // The geometric design: Girih's star and vertex cells (shared with the
    // Girih wallpaper), clipped to the opening and leaded as they fall.
    girihCells(opening, box, count, inside) {
        const pal = (GLASS_PALETTES[this.config.palette] || GLASS_PALETTES.cathedral).glass.map(hexRgb);
        const tiling = ['4.8.8', '6.6.6', '3.12.12', '4.6.12'][this.windowSeed % 4];
        const per = { '4.8.8': 13, '6.6.6': 7, '3.12.12': 33, '4.6.12': 50 }[tiling];   // pieces per lattice cell, roughly
        const t = Girih.TILINGS[tiling];
        const cellArea = Math.abs(t.a[0] * t.b[1] - t.a[1] * t.b[0]);
        const boxArea = (box.x1 - box.x0) * (box.y1 - box.y0);
        const edge = Math.sqrt(boxArea * per / (count * cellArea));
        const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
        const pattern = Girih.build(tiling, 62 * Math.PI / 180, { x0: (box.x0 - cx) / edge - 1, y0: (box.y0 - cy) / edge - 1, x1: (box.x1 - cx) / edge + 1, y1: (box.y1 - cy) / edge + 1 });
        const toScreen = pts => pts.map(([x, y]) => [cx + x * edge, cy + y * edge]);
        const clip = pts => {
            let poly = toScreen(pts);
            for (let i = 0; i < opening.length && poly.length >= 3; i++) {
                const a = opening[i], b = opening[(i + 1) % opening.length];
                // Keep the side the opening's interior is on.
                const inward = inside([(a[0] + b[0]) / 2 - (b[1] - a[1]) * 1e-3, (a[1] + b[1]) / 2 + (b[0] - a[0]) * 1e-3]);
                const nx = inward ? (b[1] - a[1]) : -(b[1] - a[1]), ny = inward ? -(b[0] - a[0]) : (b[0] - a[0]);
                poly = StainedGlass.clipHalfPlane(poly, a[0], a[1], nx, ny);
            }
            return poly.length >= 3 && Math.abs(StainedGlass.area(poly)) > 2 ? poly : null;
        };
        const cells = [];
        const pale = pal.reduce((best, c) => c[0] + c[1] + c[2] > best[0] + best[1] + best[2] ? c : best);
        for (const poly of pattern.polys) {
            const h = poly.hankin;
            const colour = pal[(poly.kind * 3 + poly.tone * 2) % pal.length];
            if (poly.n >= 6) {
                // Large stars become rosettes: a petal per point.
                for (let i = 0; i < poly.n; i++) {
                    const petal = clip([[poly.cx, poly.cy], h.points[(i + poly.n - 1) % poly.n], h.mids[i], h.points[i]]);
                    if (petal) cells.push({ points: petal, colour: i % 2 ? colour : tone(colour, 0.18) });
                }
            } else {
                const star = clip(h.star);
                if (star) cells.push({ points: star, colour });
            }
            for (const kite of h.kites) {
                const piece = clip(kite);
                if (piece) cells.push({ points: piece, colour: tone(pale, -0.05 * ((poly.kind + poly.tone) % 3)) });
            }
        }
        return cells;
    }

    // ---- Light (every minute, or for new settings) --------------------------------------

    sun() {
        const now = this.host.now();
        if (this.config.light !== 'clock') {
            const hour = StainedGlass.pinnedHour(this.config.light, now);
            now.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
        }
        return StainedGlass.sunAt(now);
    }

    relight() {
        if (!this.glass) return;
        this.stats.lightBuilds++;
        this.lastLight = performance.now();
        const light = this.light = this.sun();
        this.composeBase(light);
        this.drawLight(light);
    }

    composeBase(light) {
        const { W, H, dpr } = this;
        const g = this.base.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 1;
        g.drawImage(this.wall, 0, 0, W, H);
        g.drawImage(this.glass, 0, 0, W, H);
        const glassPath = new Path2D();
        for (const o of this.openings) glassPath.addPath(this.pathOf(o));
        // The room, stonework included, is lit by what comes through the glass.
        const room = new Path2D();
        room.rect(0, 0, W, H);
        room.addPath(glassPath);
        g.fillStyle = `rgba(4, 3, 2, ${0.62 - 0.56 * light.day})`;
        g.fill(room, 'evenodd');
        // Night: the glass goes dim, only faintly warm from the candles inside.
        const dim = Math.max(0, 1 - light.day) * 0.8;
        if (dim > 0) {
            g.fillStyle = `rgba(8, 10, 22, ${dim})`;
            g.fill(glassPath);
        }
        const b = this.bounds;
        g.globalCompositeOperation = 'lighter';
        if (light.day > 0) {
            // A broad highlight where the sun stands behind the glass.
            const sx = b.x0 + (b.x1 - b.x0) * (0.5 - light.azimuth * 0.4), sy = b.y0 + (b.y1 - b.y0) * (0.75 - 0.5 * Math.max(0, light.elevation) / 70);
            const r = Math.max(b.x1 - b.x0, b.y1 - b.y0) * 0.6;
            const hl = g.createRadialGradient(sx, sy, 0, sx, sy, r);
            hl.addColorStop(0, rgbCss(light.colour, 0.28 * light.day));
            hl.addColorStop(1, rgbCss(light.colour, 0));
            g.save();
            g.clip(glassPath);
            g.fillStyle = hl;
            g.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
            g.restore();
        }
        if (light.night > 0) {
            // Candlelight from below: warm on the floor, the wall and the
            // lower glass.
            const glow = g.createRadialGradient(W / 2, H * 1.05, 0, W / 2, H * 1.05, Math.max(W, H) * 0.75);
            glow.addColorStop(0, `rgba(255, 150, 60, ${0.17 * light.night})`);
            glow.addColorStop(0.5, `rgba(200, 100, 40, ${0.08 * light.night})`);
            glow.addColorStop(1, 'rgba(200, 100, 40, 0)');
            g.fillStyle = glow;
            g.fillRect(0, 0, W, H);
        }
        g.globalCompositeOperation = 'source-over';
    }

    // Where a point of the window (CSS px) lands on the floor, on screen.
    project(x, y, dir) {
        const { W, H } = this;
        const horizon = H * 0.42, depth = H * 1.8;
        const height = Math.max(0, this.floorY - y);
        const t = height / dir.down;
        const z = Math.min(depth * 0.8, dir.toward * t * 0.55);
        const s = depth / (depth - z);
        return [W / 2 + (x + dir.side * t * 0.4 - W / 2) * s, horizon + (this.floorY - horizon) * s];
    }

    drawLight(light) {
        const { W, H } = this;
        const q = this.host.quality;
        const scale = { low: 0.3, medium: 0.4 }[q.tier] || 0.5;
        const c = this.lightCanvas;
        c.width = Math.max(1, Math.round(W * scale));
        c.height = Math.max(1, Math.round(H * scale));
        const g = c.getContext('2d');
        g.setTransform(scale, 0, 0, scale, 0, 0);
        g.clearRect(0, 0, W, H);
        g.globalCompositeOperation = 'lighter';
        this.lightMap = null;

        // Sunlight by day, a little cool moonlight at night.
        const sunUp = light.elevation > 4;
        const intensity = sunUp ? light.day : light.night * 0.28;
        if (intensity <= 0.01 || this.config.shafts <= 0) return;
        const elevation = (sunUp ? Math.min(Math.max(light.elevation, 18), 62) : 38) * Math.PI / 180;
        const az = (sunUp ? light.azimuth : 0.35) * 0.85;
        const dir = { down: Math.sin(elevation), toward: Math.cos(elevation) * Math.cos(az), side: -Math.cos(elevation) * Math.sin(az) };
        const tint = sunUp ? light.colour : [150, 175, 230];
        const strength = this.config.shafts * intensity;
        const b = this.bounds;

        // The pool on the floor: the window itself, softly, in slices.
        const low = this.glassLow, slices = 18;
        g.globalAlpha = sunUp ? Math.min(1, 0.85 * strength + 0.1) : 0.45 * strength;
        for (let i = 0; i < slices; i++) {
            const ya = b.y0 + (b.y1 - b.y0) * i / slices, yb = b.y0 + (b.y1 - b.y0) * (i + 1) / slices;
            const p00 = this.project(b.x0, ya, dir), p10 = this.project(b.x1, ya, dir), p01 = this.project(b.x0, yb, dir);
            const sy0 = low.height * i / slices, sh = low.height / slices;
            g.setTransform(
                scale * (p10[0] - p00[0]) / low.width, scale * (p10[1] - p00[1]) / low.width,
                scale * (p01[0] - p00[0]) / sh, scale * (p01[1] - p00[1]) / sh,
                scale * p00[0], scale * p00[1]);
            g.drawImage(low, 0, sy0, low.width, sh, 0, 0, low.width, sh);
        }
        g.setTransform(scale, 0, 0, scale, 0, 0);
        g.globalAlpha = 1;

        // Shafts: one strip per few columns of the window, in their colours.
        const strips = Math.round(8 + 10 * q.density);
        const per = this.columns.length / strips;
        const rand = WP.seededRandom(this.windowSeed ^ 77);
        this.shafts = [];
        for (let s = 0; s < strips; s++) {
            const cols = this.columns.slice(Math.round(s * per), Math.round((s + 1) * per));
            const weight = cols.reduce((a, c) => a + c.weight, 0);
            const cover = cols.reduce((a, c) => a + c.cover, 0) / cols.length;
            if (!weight || cover < 0.05) continue;
            const rgb = [0, 1, 2].map(i => cols.reduce((a, c) => a + c.rgb[i] * c.weight, 0) / weight);
            const lit = rgb.map((v, i) => Math.min(255, (v * 0.6 + 120) * tint[i] / 255));
            const x0 = b.x0 + (b.x1 - b.x0) * s / strips, x1 = b.x0 + (b.x1 - b.x0) * (s + 1) / strips;
            const top = b.y0 + (b.y1 - b.y0) * 0.2;
            const pts = [[x0, top], [x1, top], [x1, b.y1], [x0, b.y1],
                this.project(x0, top, dir), this.project(x1, top, dir), this.project(x1, b.y1, dir), this.project(x0, b.y1, dir)];
            const hull = this.hull(pts);
            const from = [(x0 + x1) / 2, (top + b.y1) / 2], to = this.project((x0 + x1) / 2, (top + b.y1) / 2, dir);
            const a = 0.3 * strength * cover * (0.55 + rand() * 0.45);
            const grad = g.createLinearGradient(from[0], from[1], to[0], to[1]);
            grad.addColorStop(0, rgbCss(lit, a));
            grad.addColorStop(0.7, rgbCss(lit, a * 0.55));
            grad.addColorStop(1, rgbCss(lit, a * 0.25));
            g.fillStyle = grad;
            g.fill(this.pathOf(hull));
            this.shafts.push({ hull, rgb: lit, alpha: a });
        }
        g.globalCompositeOperation = 'source-over';
        this.buildLightMap();
    }

    hull(points) {
        const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
        const lower = [], upper = [];
        for (const pt of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop(); lower.push(pt); }
        for (const pt of p.reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) upper.pop(); upper.push(pt); }
        return lower.slice(0, -1).concat(upper.slice(0, -1));
    }

    // How bright each part of the shafts is, on a coarse grid, so motes
    // light up only inside them. Rebuilt with the light, never per frame.
    buildLightMap() {
        if (!this.shafts.length) return;
        const all = this.shafts.flatMap(s => s.hull);
        const box = { x0: Math.max(0, Math.min(...all.map(p => p[0]))), x1: Math.min(this.W, Math.max(...all.map(p => p[0]))), y0: Math.max(0, Math.min(...all.map(p => p[1]))), y1: Math.min(this.H, Math.max(...all.map(p => p[1]))) };
        const n = 40, cells = new Float32Array(n * n), tints = new Array(n * n).fill(null);
        const within = (hull, x, y) => hull.every((a, i) => { const b = hull[(i + 1) % hull.length]; return (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) >= 0; });
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
            const x = box.x0 + (i + 0.5) / n * (box.x1 - box.x0), y = box.y0 + (j + 0.5) / n * (box.y1 - box.y0);
            for (const s of this.shafts) if (within(s.hull, x, y)) { cells[j * n + i] += s.alpha; tints[j * n + i] = s.rgb; }
        }
        this.lightMap = { box, n, cells, tints };
    }

    lightAt(x, y) {
        const m = this.lightMap;
        if (!m) return 0;
        const i = Math.floor((x - m.box.x0) / (m.box.x1 - m.box.x0) * m.n), j = Math.floor((y - m.box.y0) / (m.box.y1 - m.box.y0) * m.n);
        return i < 0 || j < 0 || i >= m.n || j >= m.n ? 0 : m.cells[j * m.n + i];
    }

    // ---- Motes and clouds (per frame) ---------------------------------------------------

    makeSprite() {
        const c = document.createElement('canvas');
        c.width = c.height = 16;
        const g = c.getContext('2d');
        const grad = g.createRadialGradient(8, 8, 0, 8, 8, 8);
        grad.addColorStop(0, 'rgba(255, 248, 230, 1)');
        grad.addColorStop(0.35, 'rgba(255, 240, 210, 0.55)');
        grad.addColorStop(1, 'rgba(255, 240, 210, 0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, 16, 16);
        return c;
    }

    spawnMote(m) {
        const box = this.lightMap.box;
        m.x = box.x0 + this.random() * (box.x1 - box.x0);
        m.y = box.y0 + this.random() * (box.y1 - box.y0);
        m.vx = (this.random() - 0.5) * 6;
        m.vy = (this.random() - 0.5) * 6 - 1.5;
        m.size = 1.2 + this.random() * 2.4;
        m.phase = this.random() * Math.PI * 2;
        return m;
    }

    frame() {
        if (!this.running) return;
        this.animationId = requestAnimationFrame(t => this.frame(t));
        this.stats.frames++;
        const now = performance.now();
        const dt = Math.min(0.1, this.lastFrame ? (now - this.lastFrame) / 1000 : 0);
        this.lastFrame = now;
        if (now - this.lastLight > 60000) this.relight();

        const shining = !!this.lightMap;
        // Passing clouds: a slow, irregular breath in the light.
        const t = now / 1000;
        const cloud = this.config.clouds && shining && this.light.elevation > 4
            ? 0.8 + 0.2 * Math.max(-1, Math.min(1, 1.6 * (0.6 * Math.sin(t * 0.11) + 0.4 * Math.sin(t * 0.047 + 1.3)))) : 1;
        this.lightCanvas.style.opacity = cloud.toFixed(3);

        // Motes: the pool follows the setting and the tier's density.
        const want = shining ? Math.round(this.config.dustMotes * this.host.quality.density) : 0;
        while (this.motes.length < want) this.motes.push(this.spawnMote({}));
        const g = this.moteCanvas.getContext('2d');
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, this.moteCanvas.width, this.moteCanvas.height);
        if (this.motes.length) {
            const s = this.moteScale, box = shining ? this.lightMap.box : null;
            g.globalCompositeOperation = 'lighter';
            for (let i = this.motes.length - 1; i >= 0; i--) {
                const m = this.motes[i];
                m.vx += (this.random() - 0.5) * 8 * Math.sqrt(dt) - m.vx * 0.3 * dt;
                m.vy += (this.random() - 0.5) * 8 * Math.sqrt(dt) - (m.vy + 1.2) * 0.3 * dt;
                m.x += m.vx * dt;
                m.y += m.vy * dt;
                if (!box || m.x < box.x0 || m.x > box.x1 || m.y < box.y0 || m.y > box.y1) {
                    // Extra motes leave as they drift out; the rest come back.
                    if (this.motes.length > want) { this.motes.splice(i, 1); continue; }
                    this.spawnMote(m);
                }
                const lit = this.lightAt(m.x, m.y) * cloud;
                if (lit <= 0.003) continue;
                g.globalAlpha = Math.min(1, lit * 6 * (0.6 + 0.4 * Math.sin(t * 1.3 + m.phase)));
                const d = m.size * s;
                g.drawImage(this.sprite, m.x * s - d, m.y * s - d, d * 2, d * 2);
            }
            g.globalAlpha = 1;
            g.globalCompositeOperation = 'source-over';
        }

        // Nothing moving: no frames until the light next changes.
        if (!this.motes.length && cloud === 1) this.host.idleUntil(Math.max(1000, 60000 - (now - this.lastLight)));
    }
}
