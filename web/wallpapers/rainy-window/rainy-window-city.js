// Rainy Window: the city behind the glass (SPEC §10.15). A generic night
// skyline, laid out from a seed so a resize keeps the same city, painted in
// CSS px onto whatever context it's given. Every window is a record, so the
// manager can repaint one when the hour turns its light on or off without
// rebuilding the layers.
//
// No DOM at load time: the unit tests run this file in a Node vm for
// RainyCity.litShare.

class RainyCity {
    // Share of windows lit at each hour of the day (0–23), interpolated. Most
    // in the evening, a handful at 3 a.m., offices through the day.
    static LIT = [0.22, 0.15, 0.09, 0.06, 0.05, 0.07, 0.15, 0.25, 0.3, 0.3, 0.29, 0.29,
        0.29, 0.29, 0.3, 0.32, 0.36, 0.42, 0.48, 0.52, 0.53, 0.5, 0.44, 0.33];

    static litShare(hour) {
        const h = ((hour % 24) + 24) % 24, i = Math.floor(h), f = h - i;
        return RainyCity.LIT[i] * (1 - f) + RainyCity.LIT[(i + 1) % 24] * f;
    }

    static PALETTES = {
        sodium: {
            sky: ['#06050b', '#140e18', '#2e1c1f', '#6b3a1e'], glow: '255,138,52', cloud: '120,70,45',
            facade: [17, 13, 18], far: [52, 36, 36], off: [26, 22, 28],
            windows: ['#ffc56b', '#ffb257', '#ffd890', '#ffe2b0', '#ffcf80', '#d6e4ff'],
            street: '255,150,58', road: [16, 12, 13], water: ['#0b0a0e', '#1a1210'],
            haze: '150,105,80', signs: ['#ff7a3c', '#ffd25c', '#ff4f4f'],
        },
        neon: {
            sky: ['#04041a', '#0e0a2c', '#26104a', '#5a1a6a'], glow: '210,70,255', cloud: '110,50,140',
            facade: [12, 10, 26], far: [40, 28, 70], off: [22, 18, 40],
            windows: ['#ffe2b8', '#a8f6ff', '#ffd27a', '#ff9be9', '#c6ccff', '#8fe8ff'],
            street: '240,80,220', road: [12, 10, 22], water: ['#060616', '#14082a'],
            haze: '120,90,170', signs: ['#ff3fb4', '#3ff0ff', '#ffe14d', '#8a6cff', '#3dff9e'],
        },
        bluehour: {
            sky: ['#0b1838', '#173263', '#3a5a8f', '#8a90a8'], glow: '190,170,220', cloud: '90,110,150',
            facade: [13, 22, 42], far: [50, 70, 110], off: [24, 36, 62],
            windows: ['#ffd48a', '#ffc46a', '#ffe6b8', '#fff1d6', '#ffd9a0', '#ffe9c4'],
            street: '255,196,120', road: [14, 20, 34], water: ['#0a1428', '#1a2a48'],
            haze: '130,150,190', signs: ['#ffb84d', '#ff6a5c', '#7fe0ff'],
        },
    };

    constructor({ kind, palette, seed, w, h, bottom, hour }) {
        this.kind = RainyCity.KINDS.includes(kind) ? kind : 'downtown';
        this.pal = RainyCity.PALETTES[palette] || RainyCity.PALETTES.sodium;
        this.w = w;
        this.h = h;
        this.bottom = bottom;          // px kept clear at the bottom (host.insets)
        this.windows = [];
        this.beacons = [];             // blinking red lights on masts
        this.roads = [];               // polylines cars drive along: { points, scale, lanes }
        this.water = null;             // { top } where the harbour starts
        this.lamps = [];
        const rand = WP.seededRandom(seed);
        this.rand = rand;
        this[this.kind](rand);
        this.dropHidden();
        const share = RainyCity.litShare(hour);
        for (const win of this.windows) win.lit = win.u < share;
    }

    static KINDS = ['downtown', 'harbour', 'hills'];

    // ---- Layouts ------------------------------------------------------------

    downtown(rand) {
        const { w, h } = this;
        const ground = this.ground = h - this.bottom - Math.max(42, h * 0.085);
        this.horizon = ground - h * 0.02;
        this.buildings = [];
        this.row(rand, 0, this.horizon, 16, 46, 0.22, 0.52);
        this.row(rand, 1, ground, 34, 96, 0.26, 0.66, true);
        this.row(rand, 2, ground, 70, 170, 0.12, 0.34);
        const street = h - this.bottom - ground;
        this.roads.push({ points: [{ x: -60, y: ground + street * 0.38 }, { x: w + 60, y: ground + street * 0.38 }], scale: 0.85, dir: -1 });
        this.roads.push({ points: [{ x: -60, y: ground + street * 0.7 }, { x: w + 60, y: ground + street * 0.7 }], scale: 1.1, dir: 1 });
        for (let x = 30 + rand() * 60; x < w; x += 150 + rand() * 90) this.lamps.push({ x, y: ground + street * 0.18, height: 34 + rand() * 8 });
    }

    harbour(rand) {
        const { w, h } = this;
        const shore = this.ground = Math.round(h * 0.6);
        this.horizon = shore - h * 0.012;
        this.buildings = [];
        this.row(rand, 0, this.horizon, 14, 40, 0.14, 0.36);
        this.row(rand, 1, shore, 26, 80, 0.16, 0.46, true);
        this.water = { top: shore };
        this.cranes = [];
        const side = rand() < 0.5;
        for (let i = 0; i < 2 + Math.floor(rand() * 2); i++) {
            const x = side ? w * (0.06 + i * 0.09) : w * (0.94 - i * 0.09);
            this.cranes.push({ x, height: h * (0.14 + rand() * 0.06), arm: 50 + rand() * 30, flip: side ? 1 : -1 });
            this.beacons.push({ x, y: shore - h * 0.2 - 4, phase: rand(), period: 2 + rand() });
        }
        this.roads.push({ points: [{ x: -40, y: shore - 2 }, { x: w + 40, y: shore - 2 }], scale: 0.4, dir: 0 });
        this.boatLane = shore + (h - this.bottom - shore) * 0.32;
    }

    hills(rand) {
        const { w, h } = this;
        const base = h - this.bottom;
        this.ground = base;
        this.horizon = h * 0.5;
        this.buildings = [];
        // Three ridges, far to near, each a smooth noise line.
        this.ridges = [0.5, 0.62, 0.76].map((y, i) => {
            const points = [], phase = rand() * 10, amp = h * (0.06 - i * 0.012);
            for (let x = -20; x <= w + 20; x += 12) {
                points.push({ x, y: h * y + amp * Math.sin(x / (w * (0.28 + i * 0.1)) + phase) + amp * 0.5 * Math.sin(x / (w * 0.09) + phase * 2) });
            }
            return points;
        });
        const ridgeY = (i, x) => {
            const pts = this.ridges[i], k = Math.max(0, Math.min(pts.length - 2, Math.floor((x + 20) / 12))), f = (x + 20 - k * 12) / 12;
            return pts[k].y * (1 - f) + pts[k + 1].y * f;
        };
        this.ridgeY = ridgeY;
        // A small town in the far valley: low buildings on the first ridge.
        const town = w * (0.2 + rand() * 0.6);
        for (let x = town - w * 0.22; x < town + w * 0.22; x += 6 + rand() * 18) {
            const bw = 8 + rand() * 18, near = 1 - Math.abs(x - town) / (w * 0.22);
            const bh = (6 + rand() * 30) * (0.4 + near) + (rand() < 0.08 * near ? 40 + rand() * 50 : 0);
            this.addBuilding(rand, 0, x, bw, ridgeY(0, x + bw / 2) + 4, bh, 2.2, 3);
        }
        // Houses scattered over the nearer hills, mostly in clusters.
        for (let i = 1; i < 3; i++) {
            for (let c = 0; c < 5 + i * 3; c++) {
                const cx = rand() * w;
                for (let n = 0; n < 3 + rand() * 6; n++) {
                    const x = cx + (rand() - 0.5) * 140, bw = (10 + rand() * 12) * (i === 2 ? 1.5 : 1);
                    const y = ridgeY(i, x) + 6 + rand() * (i === 2 ? 70 : 40);
                    this.houses = this.houses || [];
                    this.houses.push({ x, y, w: bw, h: bw * (0.55 + rand() * 0.3), layer: i, roof: rand() < 0.7 });
                }
            }
        }
        const mastX = w * (0.1 + rand() * 0.8);
        this.mast = { x: mastX, y: ridgeY(1, mastX), height: h * 0.1 };
        this.beacons.push({ x: mastX, y: this.mast.y - this.mast.height, phase: rand(), period: 2.4 });
        // A road winding across the middle hill.
        const road = [];
        for (let x = -40; x <= w + 40; x += 20) road.push({ x, y: ridgeY(1, x) + 24 + 14 * Math.sin(x / 70) });
        this.roads.push({ points: road, scale: 0.6, dir: 0 });
    }

    // A row of buildings standing on `ground`, at one depth (0 far … 2 near).
    row(rand, layer, ground, minW, maxW, minH, maxH, towers = false) {
        const { w, h } = this;
        const tall = Math.max(h * 0.85, Math.min(h, w * 1.1));
        for (let x = -10 - rand() * 30; x < w + 10;) {
            const bw = minW + rand() * (maxW - minW);
            let bh = tall * (minH + Math.pow(rand(), 1.6) * (maxH - minH));
            if (towers && rand() < 0.08) bh = Math.min(ground - h * 0.06, bh * 1.45);
            this.addBuilding(rand, layer, x, bw, ground, bh, [1.6, 2.6, 5][layer], [3.4, 6, 12][layer]);
            x += bw + (rand() < 0.3 ? rand() * bw * 0.4 : -rand() * bw * 0.15);
        }
    }

    addBuilding(rand, layer, x, bw, ground, bh, size, pitch) {
        const top = ground - bh;
        const b = { x, w: bw, top, bottom: ground, layer, shade: rand() * 0.5 - 0.2, style: 'flat', bias: rand() };
        const r = rand();
        if (bh > this.h * 0.3 && r < 0.18) b.style = 'spire';
        else if (bh > this.h * 0.22 && r < 0.4) b.style = 'setback';
        else if (r < 0.52) b.style = 'slant';
        else if (r < 0.64 && layer > 0) b.style = 'tank';
        if ((b.style === 'spire' || (bh > this.h * 0.4 && rand() < 0.5)) && layer > 0) {
            this.beacons.push({ x: x + bw / 2, y: top - (b.style === 'spire' ? bh * 0.16 : 14), phase: rand(), period: 1.6 + rand() * 1.4 });
            if (b.style !== 'spire') b.antenna = true;
        }
        this.buildings.push(b);
        // Window grid. Offices light whole floors; homes one at a time.
        const margin = Math.max(2, pitch * 0.5), inset = layer === 0 ? 0.42 : 0.38;
        const cols = Math.max(1, Math.floor((bw - margin * 2) / pitch));
        const rows = Math.floor((bh - margin * 2 - (b.style === 'setback' ? bh * 0.2 : 0)) / (pitch * 1.25));
        const offset = (bw - cols * pitch) / 2;
        const office = rand() < 0.45, floorOdds = [];
        const dark = rand() < 0.12;   // a building that's empty tonight
        for (let row = 0; row < rows; row++) floorOdds.push(rand());
        const ww = pitch * (1 - inset), wh = pitch * 1.25 * (1 - inset * 0.8);
        const tint = Math.floor(rand() * this.pal.windows.length);
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                if (layer === 0 && rand() < 0.3) continue;
                const wx = x + offset + col * pitch + (pitch - ww) / 2, wy = ground - margin - (row + 1) * pitch * 1.25 + (pitch * 1.25 - wh) / 2;
                if (wy < top + margin + (b.style === 'setback' ? bh * 0.2 : 0)) continue;
                let u = office ? 0.15 * rand() + 0.85 * floorOdds[row] : rand();
                u = dark ? 0.75 + 0.25 * u : 0.97 * u + 0.03 * b.bias;
                this.windows.push({
                    x: wx, y: wy, w: ww, h: wh, layer, building: this.buildings.length - 1, u,
                    color: rand() < 0.75 ? this.pal.windows[tint] : this.pal.windows[Math.floor(rand() * this.pal.windows.length)],
                    blind: layer === 2 && rand() < 0.35 ? 0.2 + rand() * 0.5 : 0,
                    dim: 0.7 + rand() * 0.3, lit: false,
                });
            }
        }
    }

    // Windows a nearer building covers would be repainted on top of it when
    // they switch, so they're dropped at the start.
    dropHidden() {
        const covers = (b, win) => win.x + win.w > b.x && win.x < b.x + b.w && win.y + win.h > this.roofLine(b, win.x, win.w) && win.y < b.bottom;
        this.windows = this.windows.filter(win => {
            for (const b of this.buildings) if (b.layer > win.layer && covers(b, win)) return false;
            if (this.ridgeY && win.y + win.h > this.ridgeY(1, win.x) - 2) return false;
            if (this.ridgeY && win.y + win.h > this.ridgeY(1, win.x + win.w) - 2) return false;
            if (this.lamps.some(l => Math.abs(win.x - l.x - 8) < 50 && Math.abs(win.y - (l.y - l.height)) < 50)) return false;
            return !this.cranes?.some(c => Math.abs(win.x - c.x) < 6 && win.y > this.ground - c.height);
        });
    }

    roofLine(b) {
        return b.top - (b.style === 'tank' ? 12 : 0);
    }

    // ---- Painting -------------------------------------------------------------

    rgb(c, k = 1, toward = null, t = 0) {
        let [r, g, bl] = c;
        if (toward) {
            const tw = toward.split(',').map(Number);
            r += (tw[0] - r) * t; g += (tw[1] - g) * t; bl += (tw[2] - bl) * t;
        }
        return `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(bl * k)})`;
    }

    // The whole scene, in CSS px. `s` is the device pixel scale, used to snap
    // windows to whole pixels so a repaint covers exactly the same ones.
    paint(ctx, s) {
        this.s = s;
        const { w, h, pal } = this;
        const sky = ctx.createLinearGradient(0, 0, 0, this.horizon);
        pal.sky.forEach((c, i) => sky.addColorStop([0, 0.45, 0.8, 1][i], c));
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, h);
        this.paintGlow(ctx);
        this.paintClouds(ctx);
        if (this.kind === 'hills') this.paintHills(ctx);
        else {
            for (const layer of [0, 1, 2]) {
                if (layer === 1 && this.kind === 'harbour') this.paintCranes(ctx);
                for (const b of this.buildings) if (b.layer === layer) this.paintBuilding(ctx, b);
                for (const win of this.windows) if (win.layer === layer) this.paintWindow(ctx, win, false);
            }
        }
        if (this.kind === 'downtown') this.paintStreet(ctx);
        if (this.kind === 'harbour') this.paintWater(ctx);
        this.vignette = this.vignette || this.makeVignette(ctx);
        ctx.fillStyle = this.vignette;
        ctx.fillRect(0, 0, w, h);
    }

    makeVignette(ctx) {
        const { w, h } = this, r = Math.hypot(w, h) / 2;
        const g = ctx.createRadialGradient(w / 2, h * 0.45, r * 0.35, w / 2, h * 0.45, r * 1.05);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,0.5)');
        return g;
    }

    paintGlow(ctx) {
        const { w, h, pal } = this;
        const g = ctx.createRadialGradient(w / 2, this.horizon + h * 0.1, 0, w / 2, this.horizon + h * 0.1, Math.max(w, h) * 0.75);
        g.addColorStop(0, `rgba(${pal.glow},0.32)`);
        g.addColorStop(0.4, `rgba(${pal.glow},0.1)`);
        g.addColorStop(1, `rgba(${pal.glow},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
    }

    // Low rain clouds, lit from below by the city.
    paintClouds(ctx) {
        const { w, h, pal } = this, rand = WP.seededRandom(Math.floor(this.rand() * 1e9));
        for (let i = 0; i < 26; i++) {
            const x = rand() * w, y = this.horizon * (0.08 + rand() * 0.6), rx = w * (0.12 + rand() * 0.25), ry = rx * (0.18 + rand() * 0.15);
            const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
            const a = 0.05 + 0.1 * (y / this.horizon);
            g.addColorStop(0, `rgba(${pal.cloud},${a})`);
            g.addColorStop(1, `rgba(${pal.cloud},0)`);
            ctx.fillStyle = g;
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(1, ry / rx);
            ctx.translate(-x, -y);
            ctx.fillRect(x - rx, y - rx, rx * 2, rx * 2);
            ctx.restore();
        }
    }

    facadeColor(b) {
        const { pal } = this;
        if (b.layer === 0) return this.rgb(pal.far, 1 + b.shade * 0.3);
        return this.rgb(pal.facade, (b.layer === 1 ? 1.25 : 1) + b.shade * 0.6);
    }

    paintBuilding(ctx, b) {
        const { pal } = this;
        ctx.fillStyle = this.facadeColor(b);
        const { x, w, top, bottom } = b;
        ctx.beginPath();
        if (b.style === 'slant') {
            ctx.moveTo(x, bottom); ctx.lineTo(x, top + w * 0.25); ctx.lineTo(x + w, top); ctx.lineTo(x + w, bottom);
        } else if (b.style === 'setback') {
            const step = (bottom - top) * 0.2;
            ctx.moveTo(x, bottom); ctx.lineTo(x, top + step); ctx.lineTo(x + w * 0.18, top + step); ctx.lineTo(x + w * 0.18, top);
            ctx.lineTo(x + w * 0.82, top); ctx.lineTo(x + w * 0.82, top + step); ctx.lineTo(x + w, top + step); ctx.lineTo(x + w, bottom);
        } else if (b.style === 'spire') {
            const sh = (bottom - top) * 0.16;
            ctx.moveTo(x, bottom); ctx.lineTo(x, top + w * 0.1); ctx.lineTo(x + w * 0.35, top); ctx.lineTo(x + w / 2 - 1, top - sh * 0.4);
            ctx.lineTo(x + w / 2, top - sh); ctx.lineTo(x + w / 2 + 1, top - sh * 0.4); ctx.lineTo(x + w * 0.65, top);
            ctx.lineTo(x + w, top + w * 0.1); ctx.lineTo(x + w, bottom);
        } else {
            ctx.rect(x, top, w, bottom - top);
        }
        ctx.fill();
        if (b.style === 'tank') {
            const tx = x + w * (0.2 + b.bias * 0.4);
            ctx.fillRect(tx, top - 12, 9, 9);
            ctx.fillRect(tx + 1, top - 3, 1.2, 3);
            ctx.fillRect(tx + 7, top - 3, 1.2, 3);
        }
        if (b.antenna) ctx.fillRect(x + w / 2 - 0.75, top - 14, 1.5, 14);
        // A faint rim of sky light down one edge, and the street glow at the foot.
        if (b.layer > 0) {
            ctx.fillStyle = `rgba(${pal.glow},${0.05 + 0.04 * b.layer})`;
            ctx.fillRect(x, top, Math.min(2, w * 0.05), bottom - top);
            const g = ctx.createLinearGradient(0, bottom - 120, 0, bottom);
            g.addColorStop(0, `rgba(${pal.street},0)`);
            g.addColorStop(1, `rgba(${pal.street},${b.layer === 2 ? 0.16 : 0.08})`);
            ctx.fillStyle = g;
            ctx.fillRect(x, Math.max(top, bottom - 120), w, Math.min(120, bottom - top));
        }
        if (this.pal.signs && b.layer === 2 && b.bias > 0.72) {
            const color = this.pal.signs[Math.floor(b.bias * 1000) % this.pal.signs.length];
            const sx = b.bias > 0.86 ? x + 3 : x + w - 11, sy = bottom - (bottom - top) * 0.75;
            ctx.fillStyle = color;
            ctx.globalAlpha = 0.85;
            for (let i = 0; i < 5; i++) ctx.fillRect(sx, sy + i * 11, 8, 8);
            ctx.globalAlpha = 1;
        }
    }

    // One window, lit or not: painted over exactly its own pixels, with the
    // vignette and depth haze applied the same way as in the full paint.
    paintWindow(ctx, win, patch = true) {
        const s = this.s, { pal } = this;
        const x = Math.round(win.x * s) / s, y = Math.round(win.y * s) / s;
        const w = Math.max(1, Math.round(win.w * s)) / s, h = Math.max(1, Math.round(win.h * s)) / s;
        if (win.lit) {
            ctx.fillStyle = win.color;
            ctx.globalAlpha = win.layer === 0 ? 0.5 * win.dim : win.dim;
            if (win.layer === 0) {
                ctx.fillStyle = this.rgb(pal.far, 1.2);
                ctx.globalAlpha = 1;
                ctx.fillRect(x, y, w, h);
                ctx.fillStyle = win.color;
                ctx.globalAlpha = 0.55 * win.dim;
            }
            ctx.fillRect(x, y, w, h);
            ctx.globalAlpha = 1;
            if (win.blind) {
                ctx.fillStyle = 'rgba(0,0,0,0.35)';
                ctx.fillRect(x, y, w, h * win.blind);
            }
        } else {
            const b = this.buildings[win.building];
            ctx.fillStyle = win.layer === 0 ? this.rgb(pal.far, 1.05 + b.shade * 0.3) : this.rgb(pal.off, 1 + b.shade * 0.4);
            ctx.fillRect(x, y, w, h);
        }
        if (patch && this.vignette) {
            ctx.fillStyle = this.vignette;
            ctx.fillRect(x, y, w, h);
        }
    }

    paintStreet(ctx) {
        const { w, h, pal } = this, ground = this.ground, bottom = h;
        const g = ctx.createLinearGradient(0, ground, 0, bottom);
        g.addColorStop(0, this.rgb(pal.road, 1.4));
        g.addColorStop(1, this.rgb(pal.road, 0.8));
        ctx.fillStyle = g;
        ctx.fillRect(0, ground, w, bottom - ground);
        // Wet asphalt: the lamps and the city glow reflected as soft streaks.
        for (const lamp of this.lamps) {
            const top = lamp.y - lamp.height;
            ctx.fillStyle = this.rgb(pal.facade, 0.7);
            ctx.fillRect(lamp.x - 1, top, 2, lamp.height);
            ctx.fillRect(lamp.x - 1, top, 9, 2);
            const glow = ctx.createRadialGradient(lamp.x + 8, top + 3, 0, lamp.x + 8, top + 3, 46);
            glow.addColorStop(0, `rgba(${pal.street},0.9)`);
            glow.addColorStop(0.08, `rgba(${pal.street},0.45)`);
            glow.addColorStop(1, `rgba(${pal.street},0)`);
            ctx.fillStyle = glow;
            ctx.fillRect(lamp.x - 40, top - 43, 96, 92);
            const pool = ctx.createLinearGradient(0, ground, 0, bottom);
            pool.addColorStop(0, `rgba(${pal.street},0.0)`);
            pool.addColorStop(0.3, `rgba(${pal.street},0.22)`);
            pool.addColorStop(1, `rgba(${pal.street},0)`);
            ctx.fillStyle = pool;
            ctx.fillRect(lamp.x + 5, ground, 6, bottom - ground);
        }
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        for (let x = 0; x < w; x += 44) ctx.fillRect(x, ground + (bottom - ground) * 0.54, 22, 1.5);
    }

    paintWater(ctx) {
        const { w, h, pal } = this, top = this.water.top;
        const g = ctx.createLinearGradient(0, top, 0, h);
        g.addColorStop(0, pal.water[1]);
        g.addColorStop(1, pal.water[0]);
        ctx.fillStyle = g;
        ctx.fillRect(0, top, w, h - top);
        // The far shore's lights, broken into ripples.
        const rand = WP.seededRandom(97);
        for (const win of this.windows) {
            if (!win.lit || rand() < 0.4) continue;
            const depth = top - (win.y + win.h);
            const y = top + depth * 0.7 + 2;
            ctx.fillStyle = win.color;
            for (let k = 0; k < 4; k++) {
                const yy = y + (k - 1.5) * (3 + depth * 0.03) + rand() * 3;
                if (yy > h - this.bottom) continue;
                ctx.globalAlpha = 0.25 * (1 - k / 5) * win.dim;
                const len = win.w * (1 + rand() * 2.5);
                ctx.fillRect(win.x + win.w / 2 - len / 2 + (rand() - 0.5) * 3, yy, len, 1);
            }
        }
        ctx.globalAlpha = 1;
        // The glow on the water, and a quay in the foreground.
        const glow = ctx.createLinearGradient(0, top, 0, top + (h - top) * 0.5);
        glow.addColorStop(0, `rgba(${pal.glow},0.16)`);
        glow.addColorStop(1, `rgba(${pal.glow},0)`);
        ctx.fillStyle = glow;
        ctx.fillRect(0, top, w, h - top);
        const quay = h - this.bottom - Math.max(18, h * 0.035);
        ctx.fillStyle = this.rgb(pal.facade, 0.6);
        ctx.fillRect(0, quay, w, h - quay);
        for (let x = 24; x < w; x += 90) ctx.fillRect(x, quay - 9, 6, 9);
        ctx.fillRect(0, quay - 16, w, 2);
        for (let x = 0; x < w; x += 18) ctx.fillRect(x, quay - 16, 1.5, 16);
    }

    paintCranes(ctx) {
        const { pal } = this;
        ctx.strokeStyle = this.rgb(pal.facade, 1.6);
        ctx.lineWidth = 1.4;
        for (const c of this.cranes) {
            const base = this.ground, top = base - c.height;
            ctx.beginPath();
            ctx.moveTo(c.x - 9, base); ctx.lineTo(c.x - 5, top); ctx.moveTo(c.x + 9, base); ctx.lineTo(c.x + 5, top);
            for (let y = base; y > top; y -= 14) { ctx.moveTo(c.x - 8, y); ctx.lineTo(c.x + 8, y - 14); }
            ctx.moveTo(c.x - 22 * c.flip, top + 12); ctx.lineTo(c.x + c.arm * c.flip, top + 12);
            ctx.moveTo(c.x, top - this.h * 0.06); ctx.lineTo(c.x + c.arm * c.flip, top + 12);
            ctx.moveTo(c.x, top - this.h * 0.06); ctx.lineTo(c.x - 22 * c.flip, top + 12);
            ctx.moveTo(c.x, top + 12); ctx.lineTo(c.x, top - this.h * 0.06);
            ctx.stroke();
        }
    }

    paintHills(ctx) {
        const { w, h, pal } = this;
        const fill = (i, color) => {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(-20, h);
            for (const p of this.ridges[i]) ctx.lineTo(p.x, p.y);
            ctx.lineTo(w + 20, h);
            ctx.fill();
        };
        fill(0, this.rgb(pal.far, 0.7));
        for (const b of this.buildings) this.paintBuilding(ctx, b);
        for (const win of this.windows) this.paintWindow(ctx, win, false);
        fill(1, this.rgb(pal.facade, 1.5));
        const m = this.mast;
        ctx.strokeStyle = this.rgb(pal.facade, 2.2);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(m.x - 6, m.y); ctx.lineTo(m.x, m.y - m.height); ctx.lineTo(m.x + 6, m.y);
        ctx.stroke();
        this.paintHouses(ctx, 1);
        // The road, faintly wet.
        ctx.strokeStyle = `rgba(${pal.street},0.08)`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        this.roads[0].points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
        ctx.stroke();
        fill(2, this.rgb(pal.facade, 1));
        this.paintHouses(ctx, 2);
    }

    // Hill houses aren't switched by the hour: they're the warm constant.
    paintHouses(ctx, layer) {
        const { pal } = this;
        for (const house of this.houses || []) {
            if (house.layer !== layer) continue;
            const { x, y, w, h } = house;
            ctx.fillStyle = this.rgb(pal.facade, layer === 2 ? 0.7 : 1.1);
            ctx.fillRect(x, y - h, w, h);
            if (house.roof) {
                ctx.beginPath();
                ctx.moveTo(x - 2, y - h); ctx.lineTo(x + w / 2, y - h - w * 0.4); ctx.lineTo(x + w + 2, y - h);
                ctx.fill();
            }
            ctx.fillStyle = pal.windows[Math.floor(x) % pal.windows.length];
            const ww = Math.max(1.5, w * 0.18);
            if ((Math.floor(x * 7) % 3) !== 0) ctx.fillRect(x + w * 0.18, y - h * 0.7, ww, ww * 1.2);
            if ((Math.floor(y * 3) % 2) === 0) ctx.fillRect(x + w * 0.62, y - h * 0.7, ww, ww * 1.2);
        }
    }
}
