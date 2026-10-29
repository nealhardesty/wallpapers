// Harvest Valley's art, all drawn in code and baked once (SPEC §4.8): the
// land (hills, patchwork farmland, village, corn, pumpkin patch, meadow) is
// one layer per resize; the apple trees, leaves, apples, pumpkins, smoke,
// geese, moon and clouds are small sprites. Nothing here runs per frame.
//
// Everything is painted at full daylight colour. The manager washes the
// land with the light of the hour (harvest-sky.js), so one set of sprites
// serves dawn, noon, dusk and night.

const HARVEST_FOLIAGE = {
    mixed: ['#c9a227', '#d98a1f', '#b8432a', '#8a9a32', '#e0b13a', '#a8522a'],
    golden: ['#d8b02a', '#e6c24a', '#c99a1e', '#b8a02c', '#efd36a'],
    crimson: ['#a8322a', '#c24432', '#8e2a2a', '#d1593a', '#b8862a'],
    russet: ['#b8602a', '#c9742e', '#9a4a24', '#d8903a', '#8a5a2a'],
    ember: ['#d8441e', '#e8681e', '#f09030', '#b8321e', '#e8b040', '#9a2a1e'],
    burgundy: ['#7a2a3a', '#9a3a44', '#b8523a', '#5e2a3a', '#c8783a', '#8a3a50'],
    early: ['#7a9a32', '#a0b038', '#c8b836', '#5e8a30', '#d8a830', '#8aa83a'],
};
const HARVEST_WALLS = ['#e8d9b8', '#d9c29a', '#c9b08a', '#e2cfa6', '#d4b99a', '#bfa88a'];
const HARVEST_ROOFS = ['#8a3b2a', '#6e4a38', '#9a5a30', '#5a4a46', '#7a3a34', '#a8683a'];
const HARVEST_QUILT = ['#d9b45a', '#c8a064', '#8a5a3a', '#8f9d4c', '#b89a50', '#a8843e', '#9a8a48'];

const HarvestArt = {
    // The autumn palette: a preset, or the one the person made.
    palette(config) {
        const custom = config.foliage === 'custom' && config.autumnColors.length ? config.autumnColors : null;
        return custom || HARVEST_FOLIAGE[config.foliage] || HARVEST_FOLIAGE.mixed;
    },

    tint: ([r, g, b], a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`,

    canvas(w, h, dpr = 1) {
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.ceil(w * dpr));
        c.height = Math.max(1, Math.ceil(h * dpr));
        const g = c.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        return { c, g };
    },

    // ---- Layout: where everything goes, in CSS px ---------------------------------------

    layout(W, H, bottom, config, random) {
        const Hu = H - bottom, portrait = H > W;
        const u = Math.min(1.4, Math.max(0.55, (W + H) / 2000));
        const hz = Math.round(Hu * config.horizon);
        const vx = W * 0.5;
        const roadTop = hz + Hu * 0.1;
        const road = y => {
            const t = Math.min(1, Math.max(0, (y - roadTop) / (Hu - roadTop)));
            return { x: vx + Math.sin(t * 2.4 + 0.6) * W * 0.06 * t, w: W * 0.012 + (W * (portrait ? 0.2 : 0.11)) * Math.pow(t, 1.35) };
        };
        const L = { W, H, Hu, hz, u, portrait, road, roadTop, vx };
        // The village: a church, cottages either side of the road, a barn, a mill.
        const slots = [];
        const span = portrait ? [W * 0.03, W * 0.97] : [W * 0.2, W * 0.8];
        const n = Math.max(3, Math.min(config.houses, Math.floor((span[1] - span[0]) / (96 * u))));
        for (let i = 0; i < n; i++) {
            const t = (i + 0.5 + (random() - 0.5) * 0.35) / n;
            let x = span[0] + (span[1] - span[0]) * t;
            const gap = W * 0.045 * (portrait ? 0.6 : 1);
            if (Math.abs(x - vx) < gap) x += (x < vx ? -1 : 1) * gap;
            slots.push(x);
        }
        L.houses = slots.map((x, i) => ({
            x, base: hz + Hu * (0.055 + 0.04 * ((i * 7) % 5) / 4 + 0.012 * random()),
            w: (66 + random() * 34) * u * (portrait ? 0.82 : 1), kind: 'cottage', i,
        }));
        L.houses.forEach(h => { h.h = h.w * (0.62 + random() * 0.18); });
        // The first slot on the left is the church; the last on the right, the barn.
        if (n >= 4) { L.houses[0].kind = 'church'; L.houses[0].w *= 0.9; L.houses[0].h = L.houses[0].w * 1.05; L.houses[n - 1].kind = 'barn'; L.houses[n - 1].w *= 1.15; L.houses[n - 1].h = L.houses[n - 1].w * 0.75; }
        // The meadow, and with it the corn and the pumpkins, starts below the
        // village's lowest doorstep, fences and shocks included, never across it.
        const lowest = Math.max(...L.houses.map(h => h.base)) + 9 * u;
        L.meadowTop = Math.max(Hu * 0.625, lowest);
        L.corn = { x0: W * (portrait ? 0.5 : 0.64), x1: W * 0.99, y0: L.meadowTop + Hu * 0.006, y1: L.meadowTop + Hu * 0.1 };
        L.patch = { x0: W * 0.01, x1: W * (portrait ? 0.46 : 0.31), y0: L.meadowTop + Hu * 0.006, y1: L.meadowTop + Hu * 0.1 };
        L.scarecrow = { x: L.corn.x0 + (L.corn.x1 - L.corn.x0) * 0.2, y: L.corn.y1 + Hu * 0.012 };
        L.sincere = { x: L.patch.x0 + (L.patch.x1 - L.patch.x0) * 0.52, y: L.patch.y1 - Hu * 0.012 };
        L.mill = { x: portrait ? W * 0.84 : Math.min(W * 0.9, span[1] + W * 0.07), base: hz + Hu * 0.04, h: 120 * u * (portrait ? 0.8 : 1) };
        L.fire = { x: vx + (portrait ? W * 0.26 : W * 0.075), y: Math.min(L.meadowTop - 2 * u, hz + Hu * 0.125) };
        L.lamps = [];
        L.windows = [];
        L.chimneys = [];
        L.bunting = [];
        return L;
    },

    // ---- The land ---------------------------------------------------------------------------

    // Everything static, drawn at full daylight colour on a transparent
    // canvas (sky not included). Records where the windows, chimneys and
    // lamps are, so the manager can light and smoke them.
    land(L, config, dpr, random) {
        const { c, g } = this.canvas(L.W, L.H, dpr);
        const { W, H, Hu, hz, u } = L;
        const foliage = this.palette(config);
        L.windows.length = L.chimneys.length = L.lamps.length = L.bunting.length = 0;

        this.hills(g, L, foliage, random);
        if (config.fields) this.quilt(g, L, random);
        else this.plainField(g, L);
        this.meadow(g, L, random);
        if (config.village) this.village(g, L, config, foliage, random);
        this.road(g, L, config, random);
        if (config.village) this.villageFront(g, L);
        if (config.fields) this.corn(g, L, random);
        if (config.pumpkinPatch) this.patch(g, L, random);
        this.litter(g, L, foliage, random);
        return c;
    },

    // Hills in several ranges, forested in autumn colour. Each range back to
    // front is a little lower, warmer and less grey: the farthest is a pale
    // lavender-grey with only a rumour of rust, the nearest an olive-brown
    // full of colour, with haze lying at the foot of each.
    hills(g, L, foliage, random) {
        const { W, hz, Hu, u } = L, ranges = 5;
        const far = [158, 156, 178], near = [150, 124, 86];
        const grey = ([r, gg, b], k) => { const l = r * 0.3 + gg * 0.59 + b * 0.11 + 8; return [r + (l - r) * k, gg + (l - gg) * k, b + (l - b) * k]; };
        const css = (c, a2 = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a2})`;
        const hex = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
        for (let i = 0; i < ranges; i++) {
            const t = i / (ranges - 1), base = hz + 2 + i * Hu * 0.004, height = Hu * (0.155 - 0.1 * t);
            const p = random() * 6, q = random() * 6, r2 = random() * 6, f1 = 3 + i * 0.7, f2 = 8 + i * 3.2, f3 = 19 + i * 7;
            const top = x => base - height * (0.5 + 0.3 * Math.sin(x / W * f1 + p) + 0.14 * Math.sin(x / W * f2 + q) + (0.04 + 0.03 * t) * Math.sin(x / W * f3 + r2));
            const body = HarvestSky.mix(far, near, Math.pow(t, 0.9)), foot = HarvestSky.mix(body, [236, 214, 190], 0.28 * (1 - t) + 0.08);
            const grad = g.createLinearGradient(0, base - height, 0, base);
            grad.addColorStop(0, css(HarvestSky.mix(body, [255, 240, 224], 0.1 * (1 - t))));
            grad.addColorStop(1, css(foot));
            g.fillStyle = grad;
            g.beginPath();
            g.moveTo(0, hz + Hu * 0.2);
            for (let x = 0; x <= W + 4; x += 4) g.lineTo(x, top(x));
            g.lineTo(W, hz + Hu * 0.2);
            g.closePath();
            g.fill();
            // The forest: dabs of autumn along the ridge and down the slope,
            // greyer and fainter the farther the range.
            const count = W * (0.2 + 0.5 * t) * (1 + t);
            const veil = 0.75 * (1 - t) * (1 - t);
            for (let k = 0; k < count; k++) {
                const x = random() * W, depth = Math.pow(random(), 1.3), y = top(x) + depth * (base - top(x)) * 0.95;
                const colour = grey(hex(foliage[Math.floor(random() * foliage.length)]), veil);
                g.fillStyle = css(HarvestSky.mix(colour, body, 0.5 * (1 - t) * (1 - t)), (0.28 + 0.6 * t) * (0.6 + random() * 0.4));
                const r = (1.2 + random() * 2.6 + t * 1.2) * u;
                g.beginPath();
                g.ellipse(x, y, r * 1.5, r, 0, 0, Math.PI * 2);
                g.fill();
            }
            // Haze lying along the foot of the range.
            const mist = g.createLinearGradient(0, base - height * 0.28, 0, base + 4);
            mist.addColorStop(0, 'rgba(240,222,204,0)');
            mist.addColorStop(1, `rgba(240,222,204,${0.5 - 0.3 * t})`);
            g.fillStyle = mist;
            g.fillRect(0, base - height * 0.28, W, height * 0.28 + 6);
        }
    },

    // Fields in the middle distance: a quilt of wheat, plough, stubble and
    // late green, in bands that follow the land.
    quilt(g, L, random) {
        const { W, hz, Hu, meadowTop, u } = L;
        const bands = 7, top = hz + 3, bottom = meadowTop + 6;
        const curves = [];
        for (let k = 0; k <= bands; k++) {
            const t = Math.pow(k / bands, 1.2), p = random() * 6, a = (1.5 + random() * 3.5) * u * (0.4 + t);
            curves.push(x => top + (bottom - top) * t + a * Math.sin(x / W * (3 + k) + p));
        }
        for (let k = 0; k < bands; k++) {
            // Each band is cut into plots at slanting seams.
            const plots = 3 + Math.floor(random() * 3);
            for (let i = 0; i < plots; i++) {
                const x0 = W * i / plots + (random() - 0.5) * W * 0.04, x1 = W * (i + 1) / plots + (random() - 0.5) * W * 0.04;
                const colour = HARVEST_QUILT[Math.floor(random() * HARVEST_QUILT.length)];
                g.fillStyle = colour;
                g.beginPath();
                g.moveTo(x0, curves[k](x0));
                for (let x = x0; x <= x1; x += 6) g.lineTo(x, curves[k](x));
                for (let x = x1; x >= x0; x -= 6) g.lineTo(x, curves[k + 1](x));
                g.closePath();
                g.fill();
                // Furrows, converging a little towards the horizon.
                g.strokeStyle = 'rgba(60,40,20,0.13)';
                g.lineWidth = 0.7;
                const rows = Math.max(2, Math.round((x1 - x0) / (9 * u)));
                for (let r = 0; r <= rows; r++) {
                    const fx = x0 + (x1 - x0) * r / rows;
                    g.beginPath();
                    g.moveTo(fx, curves[k](fx));
                    g.lineTo(fx + (fx - W / 2) * 0.05 * (1 - k / bands), curves[k + 1](fx));
                    g.stroke();
                }
                // A seam of hedge.
                g.fillStyle = 'rgba(70,60,30,0.28)';
                g.fillRect(x0, curves[k](x0) - 0.5, x1 - x0, 1);
            }
        }
    },

    plainField(g, L) {
        const grad = g.createLinearGradient(0, L.hz, 0, L.meadowTop + 6);
        grad.addColorStop(0, '#b8a468');
        grad.addColorStop(1, '#9a9a50');
        g.fillStyle = grad;
        g.fillRect(0, L.hz, L.W, L.meadowTop - L.hz + 8);
    },

    // The meadow in the foreground: gold and olive grass, darker towards us,
    // its far edge a soft line of hedge.
    meadow(g, L, random) {
        const { W, H, Hu, meadowTop, u } = L;
        const top = x => meadowTop + 3 * Math.sin(x / 90) + 2 * Math.sin(x / 31 + 1);
        const grad = g.createLinearGradient(0, meadowTop, 0, H);
        grad.addColorStop(0, '#a3a24a');
        grad.addColorStop(0.35, '#8a8e3c');
        grad.addColorStop(1, '#5e6a2c');
        g.fillStyle = grad;
        g.beginPath();
        g.moveTo(0, H);
        for (let x = 0; x <= W + 4; x += 4) g.lineTo(x, top(x));
        g.lineTo(W, H);
        g.closePath();
        g.fill();
        // Hedge along the far edge.
        for (let x = 0; x < W; x += 3 * u) {
            g.fillStyle = random() < 0.5 ? '#6a7030' : '#7e6a30';
            g.globalAlpha = 0.7;
            const r = (2 + random() * 3) * u;
            g.beginPath();
            g.ellipse(x, top(x) - r * 0.2, r * 1.4, r, 0, 0, Math.PI * 2);
            g.fill();
        }
        g.globalAlpha = 1;
        // Grass: strokes of gold and green, longer and bolder in front.
        for (let i = 0; i < W * Hu / 900; i++) {
            const y = meadowTop + Math.pow(random(), 0.8) * (Hu - meadowTop), x = random() * W, t = (y - meadowTop) / (Hu - meadowTop), s = (3 + 8 * t) * u;
            g.strokeStyle = ['#c0b05a', '#9aa046', '#6e8030', '#b89a48'][Math.floor(random() * 4)];
            g.globalAlpha = 0.35 + random() * 0.35;
            g.lineWidth = 0.7 + t;
            g.beginPath();
            g.moveTo(x, y);
            g.quadraticCurveTo(x + (random() - 0.5) * s * 0.6, y - s * 0.6, x + (random() - 0.5) * s, y - s);
            g.stroke();
        }
        g.globalAlpha = 1;
    },

    // The road: from the village green down to the bottom of the screen.
    road(g, L, config, random) {
        if (!config.village && !config.fields) return;
        const { Hu, roadTop, u } = L;
        const left = [], right = [];
        for (let y = roadTop; y <= L.H + 4; y += 4) {
            const r = L.road(y);
            left.push([r.x - r.w / 2, y]);
            right.push([r.x + r.w / 2, y]);
        }
        const poly = (pts, rev) => { (rev ? pts.slice().reverse() : pts).forEach(([x, y], i) => g[i || !rev ? 'lineTo' : 'lineTo'](x, y)); };
        g.beginPath();
        g.moveTo(left[0][0], left[0][1]);
        poly(left);
        poly(right, true);
        g.closePath();
        const grad = g.createLinearGradient(0, roadTop, 0, L.H);
        grad.addColorStop(0, '#c9ab78');
        grad.addColorStop(1, '#b0875a');
        g.fillStyle = grad;
        g.fill();
        // Wheel ruts and a worn crown of grass down the middle.
        g.lineCap = 'round';
        for (const off of [-0.28, 0.28]) {
            g.strokeStyle = 'rgba(90,60,30,0.22)';
            g.beginPath();
            left.forEach(([x, y], i) => {
                const r = L.road(y);
                const px = r.x + r.w * off;
                i ? g.lineTo(px, y) : g.moveTo(px, y);
            });
            g.lineWidth = 3 * u;
            g.stroke();
        }
        g.strokeStyle = 'rgba(120,130,50,0.35)';
        g.beginPath();
        left.forEach(([x, y], i) => { const r = L.road(y); i ? g.lineTo(r.x, y) : g.moveTo(r.x, y); });
        g.lineWidth = 2 * u;
        g.stroke();
        // Stones and tufts at the edges.
        for (let i = 0; i < 70; i++) {
            const y = roadTop + Math.pow(random(), 0.9) * (L.H - roadTop), r = L.road(y), side = random() < 0.5 ? -1 : 1;
            const x = r.x + side * (r.w / 2 + (random() - 0.4) * r.w * 0.1), s = Math.max(1, (y - roadTop) / Hu * 5 * u);
            g.fillStyle = random() < 0.5 ? 'rgba(120,110,90,0.7)' : 'rgba(110,120,50,0.8)';
            g.beginPath();
            g.ellipse(x, y, s * 1.4, s, 0, 0, Math.PI * 2);
            g.fill();
        }
    },

    // ---- The village --------------------------------------------------------------------------

    // The village, drawn in one depth order: windmill and hills behind, then
    // every cottage, fence and small tree from the farthest base to the
    // nearest, so nothing is ever sliced by something that should be behind
    // it. Trees are only planted clear of every building, the mill and the
    // road, so a tree is never cut by a house's edge either.
    village(g, L, config, foliage, random) {
        const { u } = L;
        if (config.windmill) this.windmillTower(g, L);
        const items = [];
        const clear = (x, r) => !L.houses.some(h => Math.abs(x - h.x) < h.w * 0.6 + r + 3 * u)
            && !(config.windmill && Math.abs(x - L.mill.x) < L.mill.h * 0.34 + r)
            && !(L.roadTop && Math.abs(x - L.road(L.roadTop).x) < L.road(L.roadTop).w / 2 + r + 10 * u);
        for (const h of L.houses) {
            for (const side of [-1, 1]) {
                if (random() > 0.45) continue;
                const height = (28 + random() * 22) * u, x = h.x + side * h.w * (0.85 + random() * 0.35);
                if (!clear(x, height * 0.3)) continue;
                items.push({ base: h.base + 2, draw: () => this.smallTree(g, x, h.base + 2, height, foliage, random) });
            }
        }
        for (const h of L.houses) {
            items.push({ base: h.base, draw: () => {
                const out = h.kind === 'barn' ? this.barn(g, h, random, foliage) : h.kind === 'church' ? this.church(g, h, random, foliage) : this.cottage(g, h, random, foliage);
                for (const w of out.windows) L.windows.push(w);
                if (out.chimney) L.chimneys.push(out.chimney);
                if (random() < 0.8) this.fence(g, h.x - h.w * 0.6, h.x + h.w * 0.6, h.base + 3, u);
            } });
        }
        items.sort((p, q) => p.base - q.base);
        for (const item of items) item.draw();
        // Bunting between two roofs, if there are two to string it between.
        const a = L.houses.find(h => h.kind === 'cottage' && h.x < L.vx), b = L.houses.find(h => h.kind === 'cottage' && h.x > L.vx);
        if (a && b) L.bunting.push({ x0: a.x, y0: a.base - a.h * 0.9, x1: b.x, y1: b.base - b.h * 0.9 });
    },

    // What stands on the road, so it's drawn after it: the lamp posts and the
    // bonfire's ring of stones.
    villageFront(g, L) {
        const { u } = L;
        for (const t of [0.06, 0.2, 0.42]) {
            const y = L.roadTop + (L.H - L.roadTop) * t, r = L.road(y);
            for (const side of [-1, 1]) {
                if (t > 0.3 && side > 0) continue;
                const x = r.x + side * (r.w / 2 + 6 * u * (0.5 + t)), s = (0.55 + t * 1.1) * u;
                this.lamp(g, x, y, s);
                L.lamps.push({ x, y: y - 34 * s, s });
            }
        }
        g.fillStyle = 'rgba(90,80,70,0.8)';
        for (let i = 0; i < 9; i++) {
            const a = i / 9 * Math.PI * 2;
            g.beginPath();
            g.ellipse(L.fire.x + Math.cos(a) * 9 * u, L.fire.y + Math.sin(a) * 3.4 * u, 2.6 * u, 1.9 * u, 0, 0, Math.PI * 2);
            g.fill();
        }
    },

    smallTree(g, x, base, h, foliage, random) {
        g.fillStyle = '#4a3624';
        g.fillRect(x - h * 0.04, base - h * 0.45, h * 0.08, h * 0.45);
        for (let i = 0; i < 6; i++) {
            g.fillStyle = foliage[Math.floor(random() * foliage.length)];
            g.beginPath();
            g.arc(x + (random() - 0.5) * h * 0.4, base - h * (0.55 + random() * 0.35), h * (0.16 + random() * 0.1), 0, Math.PI * 2);
            g.fill();
        }
    },

    fence(g, x0, x1, y, u) {
        g.strokeStyle = '#e6dcc4';
        g.lineWidth = Math.max(0.8, 1.3 * u);
        for (let x = x0; x <= x1; x += 4.5 * u) {
            g.beginPath();
            g.moveTo(x, y);
            g.lineTo(x, y - 7 * u);
            g.stroke();
        }
        g.beginPath();
        g.moveTo(x0, y - 2.5 * u);
        g.lineTo(x1, y - 2.5 * u);
        g.moveTo(x0, y - 5.2 * u);
        g.lineTo(x1, y - 5.2 * u);
        g.stroke();
    },

    lamp(g, x, y, s) {
        g.strokeStyle = '#3a2f2a';
        g.lineWidth = Math.max(1, 1.8 * s);
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x, y - 34 * s);
        g.stroke();
        g.fillStyle = '#3a2f2a';
        g.fillRect(x - 3.5 * s, y - 40 * s, 7 * s, 6 * s);
        g.fillStyle = '#e8d49a';
        g.fillRect(x - 2.4 * s, y - 39 * s, 4.8 * s, 4 * s);
        g.beginPath();
        g.moveTo(x - 4.5 * s, y - 40 * s);
        g.lineTo(x, y - 45 * s);
        g.lineTo(x + 4.5 * s, y - 40 * s);
        g.closePath();
        g.fill();
    },

    // A window: frame, panes, a cross of muntins; recorded for lighting.
    window(g, x, y, w, h, out) {
        g.fillStyle = '#5a4332';
        g.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2);
        g.fillStyle = '#c9b88a';
        g.fillRect(x - w / 2, y, w, h);
        g.fillStyle = 'rgba(255,255,255,0.18)';
        g.fillRect(x - w / 2, y, w * 0.45, h * 0.5);
        g.fillStyle = '#5a4332';
        g.fillRect(x - 0.4, y, 0.8, h);
        g.fillRect(x - w / 2, y + h / 2 - 0.4, w, 0.8);
        out.push({ x, y: y + h / 2, w, h });
    },

    // An autumn wreath: a twig ring crowded with leaves in the season's
    // colours, a few berries, and a ribbon.
    wreath(g, x, y, r, foliage, random) {
        g.strokeStyle = '#5a4128';
        g.lineWidth = Math.max(0.8, r * 0.28);
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.stroke();
        const n = Math.max(10, Math.round(r * 3.4));
        for (let i = 0; i < n; i++) {
            const a = i / n * Math.PI * 2 + random() * 0.2, rr = r * (0.9 + random() * 0.25);
            g.fillStyle = foliage[Math.floor(random() * foliage.length)];
            g.save();
            g.translate(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
            g.rotate(a + Math.PI / 2 + (random() - 0.5) * 0.8);
            g.beginPath();
            g.ellipse(0, 0, r * 0.19, r * 0.4, 0, 0, Math.PI * 2);
            g.fill();
            g.restore();
        }
        g.fillStyle = '#b8302a';
        for (let i = 0; i < 4; i++) {
            const a = random() * Math.PI * 2;
            g.beginPath();
            g.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, Math.max(0.5, r * 0.13), 0, Math.PI * 2);
            g.fill();
        }
        g.fillStyle = '#a82a2a';
        g.beginPath();
        g.moveTo(x, y + r * 1.05);
        g.lineTo(x - r * 0.55, y + r * 1.55);
        g.lineTo(x - r * 0.15, y + r * 1.0);
        g.moveTo(x, y + r * 1.05);
        g.lineTo(x + r * 0.55, y + r * 1.55);
        g.lineTo(x + r * 0.15, y + r * 1.0);
        g.fill();
    },

    cottage(g, h, random, foliage) {
        const { x, base, w } = h, ht = h.h, u = h.w / 80;
        const out = { windows: [], chimney: null };
        const wall = HARVEST_WALLS[Math.floor(random() * HARVEST_WALLS.length)], roof = HARVEST_ROOFS[Math.floor(random() * HARVEST_ROOFS.length)];
        const wallH = ht * 0.58, top = base - wallH, rise = ht * 0.5;
        // The chimney first, so the roof overlaps its foot.
        const cx = x + w * (random() < 0.5 ? 0.24 : -0.24);
        g.fillStyle = '#8a6a58';
        g.fillRect(cx - w * 0.06, top - rise * 0.95, w * 0.12, rise * 0.8);
        g.fillStyle = '#6a4e40';
        g.fillRect(cx - w * 0.075, top - rise * 0.98, w * 0.15, w * 0.035);
        out.chimney = { x: cx, y: top - rise * 0.99, s: u };
        // Walls, shaded to one side.
        const grad = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
        grad.addColorStop(0, wall);
        grad.addColorStop(1, 'rgba(150,120,90,1)');
        g.fillStyle = wall;
        g.fillRect(x - w / 2, top, w, wallH);
        g.fillStyle = 'rgba(80,50,30,0.16)';
        g.fillRect(x + w * 0.1, top, w * 0.4, wallH);
        // Timber beams on some.
        if (random() < 0.5) {
            g.fillStyle = 'rgba(70,45,30,0.7)';
            for (const f of [-0.5, -0.17, 0.17, 0.5 - 0.02]) g.fillRect(x + w * f, top, 1.4 * u, wallH);
            g.fillRect(x - w / 2, top + wallH * 0.45, w, 1.4 * u);
        }
        // The roof: a gable with overhang, shingled in courses.
        g.fillStyle = roof;
        g.beginPath();
        g.moveTo(x - w * 0.6, top + 2 * u);
        g.lineTo(x, top - rise);
        g.lineTo(x + w * 0.6, top + 2 * u);
        g.closePath();
        g.fill();
        g.fillStyle = 'rgba(40,20,10,0.22)';
        g.beginPath();
        g.moveTo(x, top - rise);
        g.lineTo(x + w * 0.6, top + 2 * u);
        g.lineTo(x + w * 0.08, top + 2 * u);
        g.closePath();
        g.fill();
        g.strokeStyle = 'rgba(30,15,10,0.22)';
        g.lineWidth = 0.7;
        for (let k = 1; k < 5; k++) {
            const t = k / 5;
            g.beginPath();
            g.moveTo(x - w * 0.6 * (1 - t) - 0, top + 2 * u - rise * t);
            g.lineTo(x + w * 0.6 * (1 - t), top + 2 * u - rise * t);
            g.stroke();
        }
        // Door, windows, a pumpkin on the step, corn on the wall.
        const dx = x + w * (random() < 0.5 ? -0.12 : 0.12);
        g.fillStyle = '#6a3e28';
        g.beginPath();
        g.moveTo(dx - w * 0.09, base);
        g.lineTo(dx - w * 0.09, base - wallH * 0.52);
        g.arc(dx, base - wallH * 0.52, w * 0.09, Math.PI, 0);
        g.lineTo(dx + w * 0.09, base);
        g.closePath();
        g.fill();
        g.fillStyle = '#e8c860';
        g.fillRect(dx + w * 0.045, base - wallH * 0.28, 1.4 * u, 1.4 * u);
        this.wreath(g, dx, base - wallH * 0.36, Math.max(2.6, w * 0.052), foliage, random);
        const wx = dx < x ? x + w * 0.27 : x - w * 0.27;
        this.window(g, wx, top + wallH * 0.2, w * 0.2, wallH * 0.36, out.windows);
        if (random() < 0.7) {
            const lx = dx < x ? x - w * 0.36 : x + w * 0.36;
            this.window(g, lx, top + wallH * 0.2, w * 0.14, wallH * 0.3, out.windows);
        }
        // Mums in a window box.
        for (let i = 0; i < 5; i++) {
            g.fillStyle = ['#d86a2a', '#e8b030', '#b8402a', '#e8d070'][i % 4];
            g.beginPath();
            g.arc(wx - w * 0.08 + i * w * 0.04, top + wallH * 0.58, 1.8 * u, 0, Math.PI * 2);
            g.fill();
        }
        g.fillStyle = '#6a4a30';
        g.fillRect(wx - w * 0.11, top + wallH * 0.58, w * 0.22, 2 * u);
        const side = dx < x ? 1 : -1;
        this.pumpkin(g, dx + side * w * 0.2, base + 1, 4.4 * u, '#e07a1f');
        if (random() < 0.6) this.pumpkin(g, dx + side * w * 0.27, base + 1.5, 3 * u, '#d8861f');
        // A string of corn by the door.
        g.fillStyle = '#e0b83a';
        g.fillRect(dx - side * w * 0.2 - 1.3 * u, top + wallH * 0.28, 2.6 * u, 6 * u);
        g.fillStyle = '#8a8a3a';
        g.fillRect(dx - side * w * 0.2 - 2.2 * u, top + wallH * 0.28 + 3 * u, 1.2 * u, 5 * u);
        g.fillRect(dx - side * w * 0.2 + 1 * u, top + wallH * 0.28 + 3 * u, 1.2 * u, 5 * u);
        // The pie on the sill is lit later, by the manager; remember the window it sits in.
        out.windows[0].pie = true;
        return out;
    },

    barn(g, h, random, foliage) {
        const { x, base, w } = h, ht = h.h, u = w / 100;
        const out = { windows: [], chimney: null };
        const wallH = ht * 0.55, top = base - wallH;
        g.fillStyle = '#9a3a2a';
        g.fillRect(x - w / 2, top, w, wallH);
        g.fillStyle = 'rgba(40,10,5,0.18)';
        g.fillRect(x + w * 0.12, top, w * 0.38, wallH);
        // Gambrel roof.
        g.fillStyle = '#4e4440';
        g.beginPath();
        g.moveTo(x - w * 0.56, top + 2 * u);
        g.lineTo(x - w * 0.38, top - ht * 0.2);
        g.lineTo(x, top - ht * 0.38);
        g.lineTo(x + w * 0.38, top - ht * 0.2);
        g.lineTo(x + w * 0.56, top + 2 * u);
        g.closePath();
        g.fill();
        g.fillStyle = '#9a3a2a';
        g.beginPath();
        g.moveTo(x - w * 0.5, top);
        g.lineTo(x - w * 0.34, top - ht * 0.18);
        g.lineTo(x, top - ht * 0.33);
        g.lineTo(x + w * 0.34, top - ht * 0.18);
        g.lineTo(x + w * 0.5, top);
        g.closePath();
        g.fill();
        // Big doors with white X's, and the hay loft.
        g.fillStyle = '#7a2e22';
        g.fillRect(x - w * 0.2, base - wallH * 0.75, w * 0.4, wallH * 0.75);
        g.strokeStyle = '#f0e8d4';
        g.lineWidth = 1.2 * u;
        g.strokeRect(x - w * 0.2, base - wallH * 0.75, w * 0.4, wallH * 0.75);
        g.beginPath();
        for (const sx of [-1, 1]) {
            const bx = x + sx * w * 0.1 - w * 0.1;
            g.moveTo(bx, base - wallH * 0.75);
            g.lineTo(bx + w * 0.2, base);
            g.moveTo(bx + w * 0.2, base - wallH * 0.75);
            g.lineTo(bx, base);
        }
        g.stroke();
        g.fillStyle = '#d8b84a';
        g.fillRect(x - w * 0.07, top - ht * 0.15, w * 0.14, ht * 0.12);
        g.strokeRect(x - w * 0.07, top - ht * 0.15, w * 0.14, ht * 0.12);
        out.windows.push({ x, y: top - ht * 0.09, w: w * 0.14, h: ht * 0.12 });
        this.wreath(g, x, base - wallH * 0.4, Math.max(3, w * 0.07), foliage, random);
        // Hay bales at the foot.
        for (let i = 0; i < 3; i++) {
            const bx = x + w * 0.58 + (i % 2) * 8 * u, by = base + 1 - Math.floor(i / 2) * 6 * u;
            g.fillStyle = i % 2 ? '#d8b448' : '#c8a438';
            g.fillRect(bx - 5 * u, by - 5 * u, 10 * u, 5 * u);
            g.fillStyle = 'rgba(60,40,10,0.35)';
            g.fillRect(bx - 5 * u, by - 3 * u, 10 * u, 0.7);
        }
        // A weathervane's rooster, small and black; the manager turns the wind into it.
        out.vane = { x, y: top - ht * 0.38 };
        return out;
    },

    church(g, h, random, foliage) {
        const { x, base, w } = h, ht = h.h, u = w / 70;
        const out = { windows: [], chimney: null };
        const wallH = ht * 0.4, top = base - wallH;
        g.fillStyle = '#efe6d2';
        g.fillRect(x - w / 2, top, w, wallH);
        g.fillStyle = 'rgba(80,60,40,0.14)';
        g.fillRect(x + w * 0.1, top, w * 0.4, wallH);
        g.fillStyle = '#6a4a42';
        g.beginPath();
        g.moveTo(x - w * 0.56, top + u);
        g.lineTo(x - w * 0.12, top - ht * 0.16);
        g.lineTo(x + w * 0.12, top - ht * 0.16);
        g.lineTo(x + w * 0.56, top + u);
        g.closePath();
        g.fill();
        // The tower and its spire.
        const tw = w * 0.3, tt = top - ht * 0.5;
        g.fillStyle = '#f2ead8';
        g.fillRect(x - tw / 2, tt, tw, base - tt);
        g.fillStyle = 'rgba(80,60,40,0.16)';
        g.fillRect(x, tt, tw / 2, base - tt);
        g.fillStyle = '#5a4640';
        g.beginPath();
        g.moveTo(x - tw * 0.6, tt + u);
        g.lineTo(x, tt - ht * 0.45);
        g.lineTo(x + tw * 0.6, tt + u);
        g.closePath();
        g.fill();
        g.strokeStyle = '#3a2a26';
        g.lineWidth = Math.max(0.8, u);
        g.beginPath();
        g.moveTo(x, tt - ht * 0.45);
        g.lineTo(x, tt - ht * 0.56);
        g.moveTo(x - 2.5 * u, tt - ht * 0.5);
        g.lineTo(x + 2.5 * u, tt - ht * 0.5);
        g.stroke();
        // The belfry's arch, the tall windows, the door.
        g.fillStyle = '#3a2a26';
        g.beginPath();
        g.moveTo(x - tw * 0.2, tt + ht * 0.2);
        g.lineTo(x - tw * 0.2, tt + ht * 0.1);
        g.arc(x, tt + ht * 0.1, tw * 0.2, Math.PI, 0);
        g.lineTo(x + tw * 0.2, tt + ht * 0.2);
        g.closePath();
        g.fill();
        for (const sx of [-1, 1]) {
            const wx = x + sx * w * 0.32;
            g.fillStyle = '#c9b88a';
            g.beginPath();
            g.moveTo(wx - 2.4 * u, top + wallH * 0.75);
            g.lineTo(wx - 2.4 * u, top + wallH * 0.28);
            g.arc(wx, top + wallH * 0.28, 2.4 * u, Math.PI, 0);
            g.lineTo(wx + 2.4 * u, top + wallH * 0.75);
            g.closePath();
            g.fill();
            out.windows.push({ x: wx, y: top + wallH * 0.5, w: 4.8 * u, h: wallH * 0.5 });
        }
        g.fillStyle = '#6a3e28';
        g.beginPath();
        g.moveTo(x - 3.4 * u, base);
        g.lineTo(x - 3.4 * u, base - wallH * 0.4);
        g.arc(x, base - wallH * 0.4, 3.4 * u, Math.PI, 0);
        g.lineTo(x + 3.4 * u, base);
        g.closePath();
        g.fill();
        this.wreath(g, x, base - wallH * 0.3, Math.max(2.4, 3.3 * u), foliage, random);
        return out;
    },

    windmillTower(g, L) {
        const { mill, u } = L, x = mill.x, base = mill.base, h = mill.h;
        // A knoll to stand on.
        g.fillStyle = '#9a8a4a';
        g.beginPath();
        g.ellipse(x, base + 2, h * 0.7, h * 0.12, 0, 0, Math.PI * 2);
        g.fill();
        const wb = h * 0.26, wt = h * 0.15;
        g.fillStyle = '#e8dcc0';
        g.beginPath();
        g.moveTo(x - wb, base);
        g.lineTo(x - wt, base - h * 0.72);
        g.lineTo(x + wt, base - h * 0.72);
        g.lineTo(x + wb, base);
        g.closePath();
        g.fill();
        g.fillStyle = 'rgba(80,50,30,0.2)';
        g.beginPath();
        g.moveTo(x + wb * 0.1, base);
        g.lineTo(x + wt * 0.1, base - h * 0.72);
        g.lineTo(x + wt, base - h * 0.72);
        g.lineTo(x + wb, base);
        g.closePath();
        g.fill();
        g.fillStyle = '#6a4a38';
        g.beginPath();
        g.moveTo(x - wt * 1.25, base - h * 0.72);
        g.lineTo(x, base - h * 0.95);
        g.lineTo(x + wt * 1.25, base - h * 0.72);
        g.closePath();
        g.fill();
        g.fillStyle = '#5a3e2c';
        g.beginPath();
        g.moveTo(x - wb * 0.28, base);
        g.lineTo(x - wb * 0.28, base - h * 0.14);
        g.arc(x, base - h * 0.14, wb * 0.28, Math.PI, 0);
        g.lineTo(x + wb * 0.28, base);
        g.closePath();
        g.fill();
        mill.hub = { x, y: base - h * 0.74 };
    },

    pumpkin(g, x, y, r, colour, lit = false) {
        // A squat ribbed pumpkin sitting on y.
        g.fillStyle = 'rgba(30,20,10,0.22)';
        g.beginPath();
        g.ellipse(x + r * 0.15, y, r * 1.1, r * 0.28, 0, 0, Math.PI * 2);
        g.fill();
        const cy = y - r * 0.78;
        const grad = g.createRadialGradient(x - r * 0.35, cy - r * 0.35, r * 0.1, x, cy, r * 1.15);
        grad.addColorStop(0, this.lighter(colour, 0.28));
        grad.addColorStop(0.6, colour);
        grad.addColorStop(1, this.lighter(colour, -0.35));
        g.fillStyle = grad;
        for (const k of [-0.5, 0.5, 0]) {
            g.beginPath();
            g.ellipse(x + k * r * 0.72, cy, r * (k ? 0.58 : 0.7), r * 0.8, 0, 0, Math.PI * 2);
            g.fill();
        }
        g.strokeStyle = this.lighter(colour, -0.45);
        g.globalAlpha = 0.5;
        g.lineWidth = Math.max(0.5, r * 0.07);
        for (const k of [-0.28, 0.28]) {
            g.beginPath();
            g.ellipse(x + k * r, cy, r * 0.12, r * 0.74, 0, 0, Math.PI * 2);
            g.stroke();
        }
        g.globalAlpha = 1;
        g.fillStyle = '#5a6a28';
        g.fillRect(x - r * 0.07, cy - r * 0.98, r * 0.14, r * 0.3);
    },

    lighter(hex, amount) {
        const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255];
        return `rgb(${c.map(v => Math.max(0, Math.min(255, amount > 0 ? v + (255 - v) * amount : v * (1 + amount))) | 0)})`;
    },

    // ---- Fields ------------------------------------------------------------------------------

    corn(g, L, random) {
        const { corn, u } = L;
        // The field floor.
        const grad = g.createLinearGradient(0, corn.y0, 0, corn.y1);
        grad.addColorStop(0, '#9a8a40');
        grad.addColorStop(1, '#7a6a30');
        g.fillStyle = grad;
        g.fillRect(corn.x0, corn.y0, corn.x1 - corn.x0, corn.y1 - corn.y0);
        const rows = 9;
        for (let r = 0; r < rows; r++) {
            const t = (r + 0.5) / rows, y = corn.y0 + (corn.y1 - corn.y0) * t, s = (0.55 + 0.8 * t) * u;
            const step = 7 * s;
            for (let x = corn.x0 + (r % 2) * step / 2; x < corn.x1; x += step * (0.85 + random() * 0.3)) {
                this.stalk(g, x, y, s, random);
            }
        }
        // Shocks of cut corn along the near edge, and a couple of bales.
        for (let i = 0; i < 3; i++) {
            const x = corn.x0 + (corn.x1 - corn.x0) * (0.3 + i * 0.22) + random() * 14 * u;
            this.shock(g, x, corn.y1 + 6 * u * (i % 2), 1.1 * u);
        }
        for (let i = 0; i < 2; i++) this.bale(g, corn.x1 - (30 + i * 34) * u, corn.y1 + 9 * u, 1.1 * u);
    },

    stalk(g, x, y, s, random) {
        const h = (30 + random() * 8) * s;
        g.strokeStyle = random() < 0.5 ? '#c4a640' : '#a8a040';
        g.lineWidth = Math.max(0.8, 1.6 * s);
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (random() - 0.5) * 2 * s, y - h);
        g.stroke();
        g.strokeStyle = '#b09a38';
        g.lineWidth = Math.max(0.6, 1.1 * s);
        for (const side of [-1, 1]) {
            g.beginPath();
            g.moveTo(x, y - h * (0.35 + random() * 0.3));
            g.quadraticCurveTo(x + side * h * 0.3, y - h * 0.8, x + side * h * 0.42, y - h * (0.4 + random() * 0.2));
            g.stroke();
        }
        g.fillStyle = '#d8b848';
        g.beginPath();
        g.ellipse(x + 1.5 * s, y - h * 0.55, 1.6 * s, 4 * s, 0.2, 0, Math.PI * 2);
        g.fill();
    },

    shock(g, x, y, s) {
        g.fillStyle = 'rgba(30,20,10,0.25)';
        g.beginPath();
        g.ellipse(x, y, 13 * s, 3.4 * s, 0, 0, Math.PI * 2);
        g.fill();
        for (let i = -4; i <= 4; i++) {
            g.strokeStyle = i % 2 ? '#c8a840' : '#b09838';
            g.lineWidth = 2.4 * s;
            g.beginPath();
            g.moveTo(x + i * 1.6 * s, y);
            g.lineTo(x + i * 0.4 * s, y - 34 * s + Math.abs(i) * 1.5 * s);
            g.stroke();
        }
        g.strokeStyle = '#6a4a28';
        g.lineWidth = 1.8 * s;
        g.beginPath();
        g.moveTo(x - 6 * s, y - 14 * s);
        g.lineTo(x + 6 * s, y - 14 * s);
        g.stroke();
    },

    bale(g, x, y, s) {
        g.fillStyle = 'rgba(30,20,10,0.25)';
        g.beginPath();
        g.ellipse(x, y, 17 * s, 3.5 * s, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#d4b244';
        g.fillRect(x - 13 * s, y - 14 * s, 26 * s, 13 * s);
        g.fillStyle = '#e4c458';
        g.beginPath();
        g.ellipse(x - 13 * s, y - 7.5 * s, 3.4 * s, 6.5 * s, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(80,50,10,0.45)';
        g.lineWidth = 0.9;
        for (const k of [-6, 3]) { g.beginPath(); g.moveTo(x + k * s, y - 14 * s); g.lineTo(x + k * s, y - 1 * s); g.stroke(); }
        g.strokeStyle = 'rgba(255,240,170,0.5)';
        for (let i = 0; i < 7; i++) { g.beginPath(); g.moveTo(x - 10 * s + i * 3.4 * s, y - 13 * s); g.lineTo(x - 11 * s + i * 3.4 * s, y - 2 * s); g.stroke(); }
    },

    // The pumpkin patch: vines, leaves, pumpkins of several colours, a sign.
    patch(g, L, random) {
        const { patch, u } = L;
        const grad = g.createLinearGradient(0, patch.y0, 0, patch.y1);
        grad.addColorStop(0, '#8a8a3a');
        grad.addColorStop(1, '#6e7a30');
        g.fillStyle = grad;
        g.beginPath();
        g.ellipse((patch.x0 + patch.x1) / 2, (patch.y0 + patch.y1) / 2, (patch.x1 - patch.x0) / 2, (patch.y1 - patch.y0) / 2 + 3, 0, 0, Math.PI * 2);
        g.fill();
        const spots = [];
        const n = Math.round((patch.x1 - patch.x0) * (patch.y1 - patch.y0) / (1100 * u * u));
        for (let i = 0; i < n; i++) {
            const a = random() * Math.PI * 2, r = Math.sqrt(random()) * 0.92;
            const x = (patch.x0 + patch.x1) / 2 + Math.cos(a) * r * (patch.x1 - patch.x0) / 2;
            const y = (patch.y0 + patch.y1) / 2 + Math.sin(a) * r * (patch.y1 - patch.y0) / 2;
            if (Math.hypot(x - L.sincere.x, (y - L.sincere.y) * 2) < 40 * u) continue;
            spots.push({ x, y });
        }
        spots.sort((a, b) => a.y - b.y);
        // Vines wander between them.
        g.strokeStyle = '#4e6a24';
        g.lineWidth = Math.max(0.8, 1.2 * u);
        for (let i = 0; i < spots.length; i += 2) {
            const a = spots[i], b = spots[(i + 3) % spots.length];
            g.beginPath();
            g.moveTo(a.x, a.y);
            g.quadraticCurveTo((a.x + b.x) / 2 + (random() - 0.5) * 20 * u, (a.y + b.y) / 2 + 8 * u, b.x, b.y);
            g.stroke();
        }
        for (const s of spots) {
            const t = (s.y - patch.y0) / (patch.y1 - patch.y0), r = (6 + random() * 5) * u * (0.7 + 0.5 * t);
            // A leaf or two.
            g.fillStyle = '#5a7a2a';
            for (let k = 0; k < 2; k++) {
                g.beginPath();
                g.ellipse(s.x + (random() - 0.5) * r * 3, s.y - r * 0.2, r * 0.9, r * 0.5, random() - 0.5, 0, Math.PI * 2);
                g.fill();
            }
            const roll = random();
            this.pumpkin(g, s.x, s.y, r, roll < 0.7 ? ['#e07a1f', '#d8681a', '#e88a2a'][Math.floor(random() * 3)] : roll < 0.85 ? '#e8d8b8' : roll < 0.93 ? '#8aa05a' : '#c85a2a');
        }
        // The sign, a little crooked.
        const sx = L.sincere.x + 36 * u, sy = L.sincere.y + 3 * u;
        g.fillStyle = '#5a4030';
        g.fillRect(sx - 1.2 * u, sy - 22 * u, 2.4 * u, 22 * u);
        g.save();
        g.translate(sx, sy - 26 * u);
        g.rotate(-0.05);
        g.fillStyle = '#c8a46a';
        g.fillRect(-26 * u, -9 * u, 52 * u, 18 * u);
        g.strokeStyle = '#5a4030';
        g.lineWidth = 0.9 * u;
        g.strokeRect(-26 * u, -9 * u, 52 * u, 18 * u);
        g.fillStyle = '#4a3020';
        g.font = `bold ${Math.max(5, 5.6 * u)}px Georgia, serif`;
        g.textAlign = 'center';
        g.fillText('MOST SINCERE', 0, -1.6 * u);
        g.fillText('PUMPKIN PATCH', 0, 5.6 * u);
        g.restore();
        L.sign = { x: sx, y: sy - 26 * u };
    },

    // Fallen leaves over the meadow and the road.
    litter(g, L, foliage, random) {
        const { W, Hu, meadowTop, u } = L;
        for (let i = 0; i < W * (Hu - meadowTop) / 2600; i++) {
            const y = meadowTop + Math.pow(random(), 0.7) * (L.H - meadowTop), t = (y - meadowTop) / (L.H - meadowTop), s = (1.4 + 3.4 * t) * u;
            g.fillStyle = foliage[Math.floor(random() * foliage.length)];
            g.globalAlpha = 0.55 + random() * 0.35;
            g.beginPath();
            g.ellipse(random() * W, y, s, s * 0.55, random() * 3, 0, Math.PI * 2);
            g.fill();
        }
        g.globalAlpha = 1;
    },

    // ---- Sprites ------------------------------------------------------------------------------

    // An apple tree, each variant different: a gnarled trunk, a canopy of
    // clustered leaf-clumps in autumn colour, lit from the upper left.
    // Returns the canvas and where the canopy is, in px from the base.
    tree(height, dpr, foliage, random) {
        // The edge clumps reach about 0.12 of the height past the canopy, so the sprite pads for them.
        const w = height * 0.95, pad = 6 + height * 0.14;
        const { c, g } = this.canvas(w + pad * 2, height + pad * 2, dpr);
        const bx = w / 2 + pad, by = height + pad - 2;
        const canopy = { cx: 0, cy: -height * 0.66, rx: w * 0.46, ry: height * 0.34 };
        // A soft shadow on the grass.
        g.fillStyle = 'rgba(20,25,5,0.28)';
        g.beginPath();
        g.ellipse(bx + height * 0.04, by + 1, w * 0.36, height * 0.05, 0, 0, Math.PI * 2);
        g.fill();
        // Trunk and its boughs.
        g.strokeStyle = '#4a3626';
        g.lineCap = 'round';
        const bough = (x0, y0, x1, y1, w0, w1) => {
            g.lineWidth = (w0 + w1) / 2;
            g.beginPath();
            g.moveTo(bx + x0, by + y0);
            g.quadraticCurveTo(bx + (x0 + x1) / 2 + (random() - 0.5) * 8, by + (y0 + y1) / 2, bx + x1, by + y1);
            g.stroke();
        };
        const tw = height * 0.045;
        bough(0, 0, 0, -height * 0.32, tw * 2.7, tw * 1.6);
        bough(0, -height * 0.3, -w * 0.22, -height * 0.58, tw * 1.4, tw * 0.7);
        bough(0, -height * 0.3, w * 0.2, -height * 0.6, tw * 1.4, tw * 0.7);
        bough(0, -height * 0.32, (random() - 0.5) * 10, -height * 0.72, tw * 1.2, tw * 0.5);
        // The canopy: dark clumps behind, then colour, then light on top.
        const clump = (x, y, r, colour, a) => {
            g.fillStyle = colour;
            g.globalAlpha = a;
            g.beginPath();
            g.arc(bx + x, by + y, r, 0, Math.PI * 2);
            g.fill();
        };
        const inside = () => {
            const a = random() * Math.PI * 2, r = Math.sqrt(random());
            return [canopy.cx + Math.cos(a) * r * canopy.rx, canopy.cy + Math.sin(a) * r * canopy.ry];
        };
        for (let i = 0; i < 46; i++) { const [x, y] = inside(); clump(x, y, height * (0.07 + random() * 0.05), this.lighter(foliage[Math.floor(random() * foliage.length)], -0.5), 0.95); }
        for (let i = 0; i < 70; i++) {
            const [x, y] = inside();
            clump(x - 2, y - 2, height * (0.05 + random() * 0.045), this.lighter(foliage[Math.floor(random() * foliage.length)], -0.15 + 0.2 * (1 - (y - canopy.cy + canopy.ry) / (canopy.ry * 2))), 0.95);
        }
        for (let i = 0; i < 60; i++) {
            const [x, y] = inside();
            if (y > canopy.cy + canopy.ry * 0.2 || x > canopy.cx + canopy.rx * 0.3) continue;
            clump(x - 3, y - 4, height * (0.02 + random() * 0.03), this.lighter(foliage[Math.floor(random() * foliage.length)], 0.3), 0.8);
        }
        // Little gaps showing sky-coloured light through the leaves are left to the manager's wash.
        g.globalAlpha = 1;
        return { c, ax: bx, ay: by, w: w + pad * 2, h: height + pad * 2, canopy, trunk: tw };
    },

    apple(size, dpr, colour) {
        const { c, g } = this.canvas(size * 1.6, size * 1.6, dpr);
        const cx = size * 0.8, cy = size * 0.86, r = size * 0.5;
        const grad = g.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r * 1.1);
        grad.addColorStop(0, this.lighter(colour, 0.35));
        grad.addColorStop(0.55, colour);
        grad.addColorStop(1, this.lighter(colour, -0.4));
        g.fillStyle = grad;
        g.beginPath();
        g.arc(cx - r * 0.3, cy, r * 0.78, 0, Math.PI * 2);
        g.arc(cx + r * 0.3, cy, r * 0.78, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#4a3620';
        g.lineWidth = Math.max(0.8, size * 0.07);
        g.beginPath();
        g.moveTo(cx, cy - r * 0.6);
        g.lineTo(cx + r * 0.14, cy - r * 1.05);
        g.stroke();
        g.fillStyle = '#6a8a2a';
        g.beginPath();
        g.ellipse(cx + r * 0.5, cy - r * 0.9, r * 0.4, r * 0.18, -0.4, 0, Math.PI * 2);
        g.fill();
        return c;
    },

    // An acorn: a glossy nut in a scaled cap, with its little stalk.
    acorn(size, dpr) {
        const { c, g } = this.canvas(size * 1.6, size * 1.6, dpr);
        const cx = size * 0.8, cy = size * 0.9, r = size * 0.42;
        const nut = g.createRadialGradient(cx - r * 0.3, cy - r * 0.1, r * 0.1, cx, cy + r * 0.2, r * 1.3);
        nut.addColorStop(0, '#d8a45a');
        nut.addColorStop(0.6, '#a8702e');
        nut.addColorStop(1, '#6e4418');
        g.fillStyle = nut;
        g.beginPath();
        g.moveTo(cx - r * 0.85, cy - r * 0.2);
        g.quadraticCurveTo(cx - r * 0.9, cy + r * 1.3, cx, cy + r * 1.45);
        g.quadraticCurveTo(cx + r * 0.9, cy + r * 1.3, cx + r * 0.85, cy - r * 0.2);
        g.closePath();
        g.fill();
        g.fillStyle = '#6a4a28';
        g.beginPath();
        g.ellipse(cx, cy - r * 0.25, r * 0.98, r * 0.62, 0, Math.PI, 0);
        g.fill();
        g.strokeStyle = 'rgba(30,18,6,0.4)';
        g.lineWidth = Math.max(0.4, size * 0.04);
        for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(cx + i * r * 0.36 - r * 0.3, cy - r * 0.3); g.lineTo(cx + i * r * 0.36, cy - r * 0.62); g.stroke(); }
        g.strokeStyle = '#4a3218';
        g.lineWidth = Math.max(0.6, size * 0.08);
        g.beginPath();
        g.moveTo(cx, cy - r * 0.85);
        g.lineTo(cx + r * 0.1, cy - r * 1.15);
        g.stroke();
        return c;
    },

    // A leaf: one of three shapes, in one colour, about `size` across.
    leaf(shape, colour, size, dpr) {
        const { c, g } = this.canvas(size * 1.4, size * 1.4, dpr);
        const cx = size * 0.7, cy = size * 0.7, r = size * 0.5;
        g.fillStyle = colour;
        g.beginPath();
        if (shape === 0) {          // maple: five points
            for (let i = 0; i < 10; i++) {
                const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.5 : r * (i % 4 === 0 ? 1 : 0.88);
                g[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
            }
        } else if (shape === 1) {   // oak-ish oval
            g.ellipse(cx, cy, r * 0.55, r, 0, 0, Math.PI * 2);
        } else {                    // heart, like a birch
            g.moveTo(cx, cy + r);
            g.bezierCurveTo(cx - r * 1.1, cy + r * 0.2, cx - r * 0.7, cy - r, cx, cy - r * 0.4);
            g.bezierCurveTo(cx + r * 0.7, cy - r, cx + r * 1.1, cy + r * 0.2, cx, cy + r);
        }
        g.closePath();
        g.fill();
        g.strokeStyle = 'rgba(60,30,10,0.45)';
        g.lineWidth = Math.max(0.6, size * 0.05);
        g.beginPath();
        g.moveTo(cx, cy + r * 0.95);
        g.lineTo(cx, cy - r * 0.6);
        g.stroke();
        return c;
    },

    // A soft round blob in one colour: smoke, mist, glows.
    blob(size, dpr, [r, g, b], alpha, stops = [[0, 1], [0.5, 0.45], [1, 0]]) {
        const { c, g: x } = this.canvas(size, size, dpr);
        const grad = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        for (const [t, a] of stops) grad.addColorStop(t, `rgba(${r},${g},${b},${alpha * a})`);
        x.fillStyle = grad;
        x.fillRect(0, 0, size, size);
        return c;
    },

    // A long soft ellipse of mist.
    mistBand(w, h, dpr) {
        const { c, g } = this.canvas(w, h, dpr);
        g.save();
        g.scale(1, h / w);
        const grad = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
        grad.addColorStop(0, 'rgba(255,248,236,0.95)');
        grad.addColorStop(0.5, 'rgba(255,248,236,0.5)');
        grad.addColorStop(1, 'rgba(255,248,236,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, w, w);
        g.restore();
        return c;
    },

    // The great pumpkin itself: a vast, glowing, carved one. `face` is the
    // lit carving, drawn over it additively as it wakes.
    greatPumpkin(size, dpr) {
        const pad = size * 0.5, total = size + pad * 2;
        const body = this.canvas(total, total, dpr), face = this.canvas(total, total, dpr);
        const cx = total / 2, cy = total / 2, r = size / 2;
        this.pumpkin(body.g, cx, cy + r * 0.78, r, '#e8801f');
        // The carving, cut in the same shapes in both.
        const carve = (g, fill) => {
            g.fillStyle = fill;
            g.beginPath();
            g.moveTo(cx - r * 0.58, cy - r * 0.14);
            g.lineTo(cx - r * 0.2, cy - r * 0.42);
            g.lineTo(cx - r * 0.12, cy - r * 0.06);
            g.closePath();
            g.moveTo(cx + r * 0.58, cy - r * 0.14);
            g.lineTo(cx + r * 0.2, cy - r * 0.42);
            g.lineTo(cx + r * 0.12, cy - r * 0.06);
            g.closePath();
            g.moveTo(cx, cy + r * 0.02);
            g.lineTo(cx - r * 0.1, cy + r * 0.2);
            g.lineTo(cx + r * 0.1, cy + r * 0.2);
            g.closePath();
            g.moveTo(cx - r * 0.62, cy + r * 0.3);
            for (let i = 0; i <= 8; i++) g.lineTo(cx - r * 0.62 + r * 1.24 * i / 8, cy + r * (i % 2 ? 0.7 : 0.44));
            g.lineTo(cx + r * 0.62, cy + r * 0.3);
            g.closePath();
            g.fill();
        };
        carve(body.g, '#4a2208');
        const glow = face.g.createRadialGradient(cx, cy + r * 0.2, 0, cx, cy + r * 0.2, r * 1.9);
        glow.addColorStop(0, 'rgba(255,190,80,0.55)');
        glow.addColorStop(0.45, 'rgba(255,140,40,0.16)');
        glow.addColorStop(1, 'rgba(255,120,30,0)');
        face.g.fillStyle = glow;
        face.g.fillRect(0, 0, total, total);
        carve(face.g, 'rgba(255,226,140,0.95)');
        return { body: body.c, face: face.c, size: total, cx, cy: cy + r * 0.78 };
    },

    // A goose in flight, facing right, one sprite per step of a wingbeat.
    // Seen from a little below and to the side: a long neck held out level, a
    // heavy body, a short tail, and two broad wings, the far one a little
    // behind and darker. A wing is an arm and a hand: the downstroke is a
    // full, straight sweep; on the upstroke the wrist folds and the hand
    // trails, and the tips are fingered, separate primaries. Mid-stroke the
    // wing is swept back and foreshortened, so it never looks like a stick.
    //
    // `palette` is { body, belly, wing, tip, far, farTip, head, white } in CSS colours:
    // a Canada goose, brown-bodied with a cream belly, a black head and neck
    // with a white chinstrap, black flight feathers and a white rump patch.
    geese(length, dpr, palette, frames = 16) {
        const L = length, w = L * 1.7, h = L * 1.5, out = [];
        const cx = w * 0.42, cy = h * 0.55, rad = Math.PI / 180;
        for (let k = 0; k < frames; k++) {
            const { c, g } = this.canvas(w, h, dpr);
            const ph = k / frames, s = Math.cos(ph * Math.PI * 2);     // 1 at the top of the stroke, -1 at the bottom
            // The wing's angle: up and back, sweeping back through horizontal, down and back.
            const angle = (100 + (1 - s) / 2 * 160) * rad;
            const flex = ph > 0.5 ? Math.sin((ph - 0.5) * Math.PI * 2) : 0;     // the wrist folds on the way up
            const reach = 0.58 + 0.42 * Math.abs(s);                               // foreshortening mid-stroke
            const wing = (sx, sy, a, scale, fill) => {
                const dir = [Math.cos(a), -Math.sin(a)];
                let n = [dir[1], -dir[0]];
                if (n[0] > 0) n = [-n[0], -n[1]];                                 // the trailing edge faces backward
                const arm = L * 0.34 * reach * scale, hand = L * 0.44 * reach * scale * (1 - 0.3 * flex);
                const ah = a + (0.28 + flex * 0.9) * (dir[1] < 0 ? 1 : -1) * (s > 0 ? 1 : 1);
                const dh = [Math.cos(ah), -Math.sin(ah)];
                const W1 = [sx + dir[0] * arm, sy + dir[1] * arm];             // the wrist
                const T = [W1[0] + dh[0] * hand, W1[1] + dh[1] * hand];       // the tip
                const hn = [dh[1], -dh[0]];
                const hnb = hn[0] > 0 ? [-hn[0], -hn[1]] : hn;
                // Brown at the shoulder, darkening to black flight feathers at the tip.
                const shade = g.createLinearGradient(sx, sy, T[0], T[1]);
                shade.addColorStop(0, fill[0]);
                shade.addColorStop(0.5, fill[0]);
                shade.addColorStop(1, fill[1]);
                g.fillStyle = shade;
                g.beginPath();
                // Leading edge: shoulder, wrist, tip.
                g.moveTo(sx - n[0] * L * 0.012, sy - n[1] * L * 0.012);
                g.quadraticCurveTo(W1[0] - n[0] * L * 0.02 * scale, W1[1] - n[1] * L * 0.02 * scale, T[0], T[1]);
                // Back along the fingered primaries.
                const fingers = 5;
                for (let i = fingers; i >= 1; i--) {
                    const t = i / fingers, bx = W1[0] + (T[0] - W1[0]) * t, by = W1[1] + (T[1] - W1[1]) * t;
                    const len = L * 0.165 * scale * (1 - 0.4 * t) * reach;
                    g.lineTo(bx + hnb[0] * len * 0.55 + dh[0] * L * 0.02 * scale, by + hnb[1] * len * 0.55 + dh[1] * L * 0.02 * scale);
                    g.lineTo(bx + hnb[0] * len + dh[0] * L * 0.045 * scale, by + hnb[1] * len + dh[1] * L * 0.045 * scale);
                    g.lineTo(bx - dh[0] * L * 0.03 * scale + hnb[0] * len * 0.5, by - dh[1] * L * 0.03 * scale + hnb[1] * len * 0.5);
                }
                // The secondaries: a scalloped trailing edge along the arm.
                const sec = 5;
                for (let i = 1; i <= sec; i++) {
                    const t = 1 - i / (sec + 1), bx = sx + (W1[0] - sx) * t, by = sy + (W1[1] - sy) * t;
                    const out2 = L * (0.2 - 0.05 * Math.abs(t - 0.45)) * scale * reach;
                    g.quadraticCurveTo(bx + n[0] * out2 * 1.05 + dir[0] * L * 0.02, by + n[1] * out2 * 1.05 + dir[1] * L * 0.02, bx + n[0] * out2 * 0.8, by + n[1] * out2 * 0.8);
                }
                g.lineTo(sx + n[0] * L * 0.11 * scale, sy + n[1] * L * 0.11 * scale);
                g.closePath();
                g.fill();
            };
            const bob = -s * L * 0.012;                                  // the body rises on the downstroke
            // The far wing: behind, a little smaller, a touch out of step, darker.
            wing(cx + L * 0.03, cy - L * 0.05 + bob, angle - 0.16 * Math.sign(Math.sin(ph * Math.PI * 2) + 0.01), 0.86, [palette.far, palette.farTip]);
            // Feet, tucked up behind.
            g.strokeStyle = palette.head;
            g.lineWidth = Math.max(0.6, L * 0.012);
            g.beginPath();
            g.moveTo(cx - L * 0.12, cy + L * 0.06 + bob);
            g.lineTo(cx - L * 0.3, cy + L * 0.07 + bob);
            g.stroke();
            // The white rump patch, and the tail.
            g.fillStyle = palette.white;
            g.beginPath();
            g.ellipse(cx - L * 0.19, cy - L * 0.035 + bob, L * 0.05, L * 0.032, -0.2, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = palette.head;
            g.beginPath();
            g.moveTo(cx - L * 0.17, cy - L * 0.02 + bob);
            g.lineTo(cx - L * 0.36, cy - L * 0.025 + bob);
            g.lineTo(cx - L * 0.35, cy + L * 0.03 + bob);
            g.lineTo(cx - L * 0.17, cy + L * 0.045 + bob);
            g.closePath();
            g.fill();
            // The body: back and breast, the belly lighter.
            g.fillStyle = palette.body;
            g.beginPath();
            g.ellipse(cx, cy + bob, L * 0.235, L * 0.088, -0.03, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = palette.belly;
            g.beginPath();
            g.ellipse(cx + L * 0.01, cy + L * 0.03 + bob, L * 0.2, L * 0.052, -0.03, 0, Math.PI);
            g.fill();
            // The neck and head, held out level with a slight dip: black, with a pale chinstrap.
            g.fillStyle = palette.head;
            g.beginPath();
            g.moveTo(cx + L * 0.15, cy - L * 0.055 + bob);
            g.quadraticCurveTo(cx + L * 0.3, cy - L * 0.075 + bob, cx + L * 0.43, cy - L * 0.05 + bob);
            g.lineTo(cx + L * 0.43, cy - L * 0.005 + bob);
            g.quadraticCurveTo(cx + L * 0.3, cy + L * 0.015 + bob, cx + L * 0.16, cy + L * 0.045 + bob);
            g.closePath();
            g.fill();
            g.beginPath();
            g.ellipse(cx + L * 0.45, cy - L * 0.028 + bob, L * 0.04, L * 0.028, 0.1, 0, Math.PI * 2);
            g.fill();
            g.beginPath();                                                    // bill
            g.moveTo(cx + L * 0.48, cy - L * 0.04 + bob);
            g.lineTo(cx + L * 0.55, cy - L * 0.026 + bob);
            g.lineTo(cx + L * 0.48, cy - L * 0.012 + bob);
            g.closePath();
            g.fill();
            g.fillStyle = palette.white;
            g.beginPath();
            g.ellipse(cx + L * 0.44, cy - L * 0.008 + bob, L * 0.03, L * 0.014, 0.1, 0, Math.PI * 2);
            g.fill();
            // The near wing, in front.
            wing(cx + L * 0.05, cy - L * 0.04 + bob, angle, 1, [palette.wing, palette.tip]);
            out.push(c);
        }
        return { frames: out, w, h, ax: cx, ay: cy, length: L };
    },

    // The moon at a phase: dark face (a little earthshine), lit part with
    // its seas and craters, drawn waxing (lit on the right); the manager
    // mirrors it for a waning moon. `r` in px.
    moon(phase, r, dpr, waning) {
        const pad = Math.ceil(r * 0.2), size = (r + pad) * 2;
        const { c, g } = this.canvas(size, size, dpr);
        const cx = size / 2, cy = size / 2;
        const sign = waning ? -1 : 1;
        const k = Math.cos(2 * Math.PI * phase);
        // The seas: soft, overlapping patches that run together, as on the real moon.
        const maria = [[-0.3, -0.32, 0.36], [-0.05, -0.36, 0.26], [0.18, -0.22, 0.22], [-0.46, 0.0, 0.28], [-0.2, 0.02, 0.26], [0.3, 0.06, 0.3], [0.12, 0.36, 0.2], [-0.3, 0.38, 0.18], [0.5, 0.3, 0.14]];
        const surface = (alpha, tone) => {
            const body = g.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
            body.addColorStop(0, `rgba(${tone[0]},${tone[1]},${tone[2]},${alpha})`);
            body.addColorStop(1, `rgba(${tone[0] * 0.82 | 0},${tone[1] * 0.8 | 0},${tone[2] * 0.78 | 0},${alpha})`);
            g.fillStyle = body;
            g.beginPath();
            g.arc(cx, cy, r, 0, Math.PI * 2);
            g.fill();
            for (const [x, y, rr] of maria) {
                const px = cx + x * r * sign, py = cy + y * r, sea = g.createRadialGradient(px, py, 0, px, py, rr * r);
                sea.addColorStop(0, `rgba(118,112,116,${0.3 * alpha})`);
                sea.addColorStop(0.6, `rgba(118,112,116,${0.17 * alpha})`);
                sea.addColorStop(1, 'rgba(118,112,116,0)');
                g.fillStyle = sea;
                g.beginPath();
                g.arc(px, py, rr * r, 0, Math.PI * 2);
                g.fill();
            }
        };
        // Earthshine on the unlit face.
        surface(0.1, [150, 160, 190]);
        // The lit part: waxing, the right limb and a terminator ellipse.
        g.save();
        g.beginPath();
        g.save();
        g.translate(cx, cy);
        g.scale(sign, 1);
        g.moveTo(0, -r);
        g.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
        if (k >= 0) g.ellipse(0, 0, Math.max(0.01, k * r), r, 0, Math.PI / 2, -Math.PI / 2, true);
        else g.ellipse(0, 0, Math.max(0.01, -k * r), r, 0, Math.PI / 2, Math.PI * 1.5, false);
        g.restore();
        g.closePath();
        g.clip();
        surface(1, [246, 240, 224]);
        g.restore();
        return { c, size };
    },

    // A soft round of one colour, falling off smoothly to nothing: the grain
    // of a cloud.
    softDisc(colour) {
        const { c, g } = this.canvas(64, 64, 1);
        const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        for (const [t, a2] of [[0, 1], [0.3, 0.86], [0.55, 0.46], [0.8, 0.13], [1, 0]]) grad.addColorStop(t, this.tint(colour, a2));
        g.fillStyle = grad;
        g.fillRect(0, 0, 64, 64);
        return c;
    },

    // The cloud kinds: three cumulus, a long low stratus, a high wisp of cirrus.
    CLOUD_KINDS: [
        { w: 440, h: 170, domes: 3 },
        { w: 540, h: 190, domes: 4 },
        { w: 320, h: 130, domes: 2 },
        { w: 780, h: 74, stratus: true },
        { w: 600, h: 54, cirrus: true },
    ],

    // Clouds made of hundreds of soft blobs rather than a few circles, so the
    // outline is fluffy and there is no seam to read as a balloon: heaped
    // into domes over a flat, softly fading base, shaded dark underneath and
    // lit on top and on the sunward side, in the tones the manager gives
    // them for the hour (rebaked when the tone moves a step). Padded all
    // round, so nothing is cut off. Returns { c, w, h } sprites, CSS px.
    clouds(u, dpr, lit, shade, random) {
        const mid = HarvestSky.mix(lit, shade, 0.5);
        const discs = [lit, mid, shade].map(col => this.softDisc(col));
        return this.CLOUD_KINDS.map(kind => {
            const pad = 34 * u, w = kind.w * u, h = kind.h * u, W = w + pad * 2, H = h + pad * 2;
            const { c, g } = this.canvas(W, H, dpr);
            const blob = (img, x, y, r, a2, sx = 1) => {
                g.globalAlpha = a2;
                g.save();
                g.translate(x, y);
                g.scale(sx, 1);
                g.drawImage(img, -r, -r, r * 2, r * 2);
                g.restore();
            };
            if (kind.domes) {
                const base = pad + h * 0.88, blobs = [], domes = [];
                for (let i = 0; i < kind.domes; i++) {
                    domes.push({ cx: pad + w * (i + 0.5 + (random() - 0.5) * 0.35) / kind.domes, ht: h * (0.4 + random() * 0.5), wi: w / kind.domes * (0.7 + random() * 0.45) });
                }
                const top = x => base - Math.max(...domes.map(d => d.ht * Math.sqrt(Math.max(0, 1 - ((x - d.cx) / d.wi) ** 2))));
                for (let tries = 0, n = Math.round(w * h / 120); blobs.length < n && tries < n * 6; tries++) {
                    const x = pad + random() * w, t = top(x);
                    if (base - t < 5 * u) continue;
                    const y = t + (base - t) * Math.pow(random(), 1.6), depth = (base - t) / (h * 0.7);
                    blobs.push({ x, y, r: (12 + random() * 24) * u * (kind.h / 170) * (0.6 + 0.5 * Math.min(1, depth)) });
                }
                // The shaded body, then the sunward side lighter, then the sunlit tops.
                for (const b of blobs) blob(discs[2], b.x, b.y + 2 * u, b.r, 0.95);
                g.globalCompositeOperation = 'source-atop';
                for (const b of blobs) blob(discs[1], b.x - 0.03 * h, b.y - 0.06 * h, b.r * 0.94, 0.85);
                for (const b of blobs) if (b.y < base - h * 0.22) blob(discs[0], b.x - 0.07 * h, b.y - 0.13 * h, b.r * 0.8, 0.9);
                // A flat, soft base: the bottom fades away rather than ending in a curve.
                g.globalCompositeOperation = 'destination-out';
                g.globalAlpha = 1;
                const fade = g.createLinearGradient(0, base - h * 0.08, 0, base + h * 0.05);
                fade.addColorStop(0, 'rgba(0,0,0,0)');
                fade.addColorStop(1, 'rgba(0,0,0,1)');
                g.fillStyle = fade;
                g.fillRect(0, base - h * 0.08, W, H);
            } else if (kind.stratus) {
                // Long, low, layered bands: wide flat blobs, shaded below.
                const cy = pad + h * 0.55, items = [];
                for (let i = 0; i < 34; i++) items.push({ x: pad + w * (0.08 + random() * 0.84), y: cy + (random() - 0.5) * h * 0.45, r: (12 + random() * 16) * u, sx: 3.5 + random() * 4 });
                for (const b of items) blob(discs[2], b.x, b.y + 2 * u, b.r, 0.55, b.sx);
                g.globalCompositeOperation = 'source-atop';
                for (const b of items) blob(discs[1], b.x, b.y - 0.06 * h, b.r * 0.9, 0.6, b.sx);
                for (const b of items) if (b.y < cy) blob(discs[0], b.x, b.y - 0.14 * h, b.r * 0.7, 0.7, b.sx);
            } else {
                // Cirrus: thin streaks combed along a gentle arc.
                const cy = pad + h * 0.5;
                for (let i = 0; i < 20; i++) {
                    const t = random(), x = pad + w * (0.05 + 0.9 * t), y = cy + Math.sin(t * 3 + 1) * h * 0.25 + (random() - 0.5) * h * 0.35;
                    blob(discs[0], x, y, (5 + random() * 8) * u, 0.4, 7 + random() * 6);
                }
                g.globalCompositeOperation = 'source-atop';
                for (let i = 0; i < 10; i++) blob(discs[1], pad + w * random(), cy + (random() - 0.2) * h * 0.4, 6 * u, 0.25, 8);
            }
            g.globalAlpha = 1;
            g.globalCompositeOperation = 'source-over';
            return { c, w: W, h: H };
        });
    },
};
