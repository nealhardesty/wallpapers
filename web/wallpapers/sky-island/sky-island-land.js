// Sky Island's land and sky: what gets baked. The light of the hour for a
// season (sky colours, the wash over the land, how dark it is); the sky as
// a dithered gradient; the island's terrain from its layout (the mountain,
// the plateau with its streets, fields and lake, the cliff with its roots,
// crystals and cave); the waterfall's frames; and the small islands that
// drift past. Everything that stands on the plateau (houses, trees, folk)
// is drawn each frame by the manager, sorted by where it stands.

const SkyIslandLand = (() => {
    const A = SkyIslandArt, L = SkyIslandLogic;
    const { canvas, dot } = A;
    const clamp = L.clamp;
    const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
    const ramp = (frames, x) => {
        if (x <= frames[0][0]) return frames[0].slice(1);
        for (let i = 1; i < frames.length; i++) if (x <= frames[i][0]) { const [k0, ...a] = frames[i - 1], [k1, ...b] = frames[i]; return mix(a, b, (x - k0) / (k1 - k0)); }
        return frames[frames.length - 1].slice(1);
    };
    const rgb = (c, a) => a === undefined ? `rgb(${c.map(Math.round).join(',')})` : `rgba(${c.slice(0, 3).map(Math.round).join(',')},${a.toFixed(3)})`;

    // ---- Light ----------------------------------------------------------------------------------

    // The sky by the sun's altitude: zenith, middle, horizon. Night and the
    // twilights are shared; the day is the season's: summer's deep blue,
    // spring's fresh one, autumn's haze, winter's pale wash.
    const DAY = {
        spring: [[16, [96, 164, 232], [150, 198, 240], [214, 230, 244]], [45, [84, 150, 228], [136, 190, 238], [206, 226, 242]]],
        summer: [[16, [78, 146, 226], [128, 182, 238], [200, 224, 244]], [45, [60, 128, 222], [112, 172, 236], [190, 220, 244]]],
        autumn: [[16, [112, 154, 206], [164, 190, 220], [230, 214, 188]], [45, [104, 150, 208], [156, 190, 222], [226, 216, 196]]],
        winter: [[16, [138, 172, 214], [182, 202, 226], [226, 230, 238]], [45, [130, 168, 214], [176, 200, 226], [222, 228, 238]]],
    };
    const NIGHT = [
        [-18, [8, 12, 34], [14, 20, 50], [24, 30, 64]],
        [-9, [14, 22, 58], [40, 34, 80], [86, 54, 92]],
        [-4, [34, 40, 92], [112, 70, 110], [224, 122, 100]],
        [0, [58, 76, 136], [200, 112, 116], [255, 178, 110]],
        [6, [86, 126, 190], [200, 172, 160], [255, 212, 150]],
    ];
    const WASH = [
        [-18, 14, 22, 62, 0.64],
        [-10, 20, 28, 76, 0.6],
        [-5, 70, 50, 110, 0.44],
        [-1, 150, 84, 110, 0.3],
        [2, 255, 138, 70, 0.18],
        [7, 255, 170, 88, 0.11],
        [14, 255, 196, 120, 0.05],
        [30, 255, 224, 170, 0.01],
        [60, 255, 230, 185, 0],
    ];
    const CLOUD = [
        [-18, [38, 46, 86], [20, 26, 54]],
        [-8, [96, 78, 120], [44, 40, 78]],
        [-2, [255, 150, 120], [120, 70, 100]],
        [4, [255, 200, 150], [200, 150, 140]],
        [12, [255, 232, 200], [214, 196, 190]],
        [30, [255, 255, 255], [196, 206, 224]],
    ];
    function light(sunAlt, moonLight, season) {
        const frames = [...NIGHT, ...DAY[season] || DAY.summer].map(([k, a, b, c]) => [k, ...a, ...b, ...c]);
        const sky = ramp(frames, sunAlt);
        const lift = smooth(-6, -14, sunAlt) * (moonLight || 0);
        const moonLift = [18, 26, 48];
        const wash = ramp(WASH, sunAlt);
        const cloud = ramp(CLOUD.map(([k, a, b]) => [k, ...a, ...b]), sunAlt);
        const bright = [60, 66, 74];
        return {
            top: sky.slice(0, 3).map((v, i) => v + moonLift[i] * lift * 0.7),
            mid: sky.slice(3, 6).map((v, i) => v + moonLift[i] * lift),
            horizon: sky.slice(6, 9).map((v, i) => v + moonLift[i] * lift * 1.2),
            wash: [wash[0], wash[1], wash[2], wash[3] * (1 - 0.22 * lift)],
            cloudLit: cloud.slice(0, 3).map((v, i) => v + bright[i] * lift),
            cloudShade: cloud.slice(3, 6).map((v, i) => v + bright[i] * lift * 0.5),
            stars: smooth(-4, -12, sunAlt),
            dark: smooth(6, -6, sunAlt),         // 0 by day, 1 at night: windows, lamps
            low: smooth(26, 2, sunAlt) * smooth(-6, 1, sunAlt),
            sunAlt,
        };
    }

    // ---- The sky ----------------------------------------------------------------------------------

    const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
    // The gradient, dithered into bands, as one bake (ImageData: once per
    // light change, never per frame).
    function sky(bw, bh, lt, horizonY) {
        const c = canvas(bw, bh), g = c.getContext('2d');
        const img = g.createImageData(bw, bh), d = img.data;
        const hz = horizonY ?? bh * 0.72;
        for (let y = 0; y < bh; y++) {
            const t = y < hz ? y / hz : 1;
            const a = t < 0.55 ? lt.top : lt.mid, b = t < 0.55 ? lt.mid : lt.horizon;
            const k = t < 0.55 ? t / 0.55 : (t - 0.55) / 0.45;
            // Four bands between each pair of colours, dithered at the seams.
            const steps = 5;
            for (let x = 0; x < bw; x++) {
                const q = k * steps, i = Math.floor(q), f = q - i;
                const up = BAYER[y % 4][x % 4] / 16 < f ? 1 : 0;
                const s = Math.min(steps, i + up) / steps;
                const o = (y * bw + x) * 4;
                d[o] = a[0] + (b[0] - a[0]) * s; d[o + 1] = a[1] + (b[1] - a[1]) * s; d[o + 2] = a[2] + (b[2] - a[2]) * s; d[o + 3] = 255;
            }
        }
        g.putImageData(img, 0, 0);
        return c;
    }

    // A soft glow sprite, for lamps, windows and crystals at night.
    function glow(r, colour, alpha) {
        const c = canvas(r * 2 + 1, r * 2 + 1), g = c.getContext('2d');
        for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
            const d = Math.hypot(x, y) / r;
            if (d > 1) continue;
            const a = alpha * (1 - d) * (1 - d);
            if (BAYER[(y + r) % 4][(x + r) % 4] / 16 < a * 2) { g.globalAlpha = Math.min(1, a * 1.6 + 0.08); dot(g, x + r, y + r, colour); }
        }
        return { c, w: r * 2 + 1, h: r * 2 + 1, ax: r };
    }

    // ---- The island's terrain ------------------------------------------------------------------------

    const MARGIN = 14;
    // The terrain as one bake: { c, ox, oy } where island (x, y) is drawn at
    // (x + ox, y + oy) on the canvas.
    function terrain(I, season, o = {}) {
        const G = A.GROUND[season], W = A.WATER, R = A.ROCK;
        const top = -(I.mountain.h + 6), bottomMost = Math.max(...I.bottom) + 4;
        const ox = MARGIN, oy = -top;
        const cw = I.w + MARGIN * 2, ch = bottomMost - top;
        const c = canvas(cw, ch), g = c.getContext('2d');
        const px = (x, y, col) => dot(g, x + ox, y + oy, col);
        const h = L.hash;
        const snow = season === 'winter';
        // The mountain: peaks of rock, lit from the left, snow on top.
        const m = I.mountain, peaks = [];
        for (let i = 0; i < m.peaks; i++) peaks.push({ x: m.x + (i - (m.peaks - 1) / 2) * m.w / (m.peaks + 0.6) + (h(i, I.seed + 3) - 0.5) * 6, h: m.h * (i === Math.floor(m.peaks / 2) ? 1 : 0.55 + h(i, I.seed) * 0.35), hw: m.w / 2 / Math.max(1, m.peaks * 0.55) });
        for (let y = -m.h; y <= m.y; y++) for (let x = Math.round(m.x - m.w / 2) - 2; x <= Math.round(m.x + m.w / 2) + 2; x++) {
            let best = null;
            for (const p of peaks) { const t = (y + p.h) / (p.h + m.y); const hw = p.hw * Math.max(0, t) * (1 + (h(Math.floor(y / 3), 9) - 0.5) * 0.25); if (t >= 0 && Math.abs(x - p.x) <= hw) best = best ? (p.h > best.h ? p : best) : p; }
            if (!best) continue;
            const t = (y + best.h) / (best.h + m.y);
            const shadeSide = x > best.x + (best.hw * t) * 0.15;
            let col = shadeSide ? R.dark : h(x, y) > 0.85 ? R.light : R.mid;
            const snowLine = snow ? 0.55 : 0.22;
            if (t < snowLine && h(x, y * 3) > t / snowLine * 0.9) col = (x + y) % 2 ? A.P.snow : A.P.snow2;
            if (t > 0.8 && !snow && h(x * 2, y) > 0.5) col = G.dark;
            px(x, y, col);
        }
        // The plateau, with its front lip and a grassy edge.
        for (let x = 0; x <= I.w; x++) {
            for (let y = I.back[x]; y <= I.front[x]; y++) {
                const k = h(x, y);
                let col = k > 0.9 ? G.dark : k > 0.7 ? G.grass2 : G.grass;
                if (y === I.front[x]) col = snow ? A.P.snow2 : G.dark;
                else if (y >= I.front[x] - 1) col = snow ? G.grass2 : G.grass2;
                if (y === I.back[x] && !snow) col = G.grass2;
                px(x, y, col);
            }
        }
        // Streets: packed earth through the town, and a lane to the dock.
        const street = (x, y) => { if (x >= 0 && x <= I.w && y > I.back[x] && y < I.front[x]) px(x, y, h(x, y) > 0.7 ? G.path2 : G.path); };
        for (const y of I.streets) for (let x = I.town.l - 3; x <= I.town.r + 3; x++) { street(x, y); street(x, y + 1); }
        const laneY = I.streets[0];
        const dockX = I.dock.x;
        for (let x = Math.min(dockX, I.town.l - 3); x <= Math.max(dockX, I.town.r + 3); x++) if (x < I.town.l - 3 || x > I.town.r + 3) { street(x, laneY); street(x, laneY + 1); }
        for (let y = Math.min(laneY, I.dock.y); y <= Math.max(laneY, I.dock.y); y++) street(dockX, y);
        // The square: paving stones.
        const sq = I.square;
        for (let y = sq.y - 3; y <= sq.y + 5; y++) for (let x = sq.x - 11; x <= sq.x + 11; x++) if (x >= 0 && x <= I.w && y > I.back[x] && y < I.front[x]) px(x, y, (Math.floor(x / 2) + Math.floor(y / 2)) % 2 ? A.P.stone : A.P.stone2);
        // Fields: a fence, rows of crop.
        for (const f of I.fields) {
            const crop = { wheat: ['#e0b84a', '#c89a30'], cabbage: ['#8ac86a', '#5fa84c'], pumpkin: ['#f08a2a', '#5fa84c'], flowers: ['#f08ab0', '#f0c040'] }[f.crop];
            for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) {
                const soilRow = y % 2 === 0;
                px(x, y, snow ? ((x + y) % 2 ? A.P.snow : A.P.snow2) : soilRow ? (h(x, y) > 0.5 ? '#9a7a5a' : '#8a6a4a') : (season === 'winter' ? '#8a6a4a' : (x % 2 ? crop[0] : crop[1])));
            }
            for (let x = f.x - 1; x <= f.x + f.w; x++) { if (x % 3 === 0) { px(x, f.y - 1, A.P.wood); px(x, f.y + f.h, A.P.wood); } else { px(x, f.y - 1, A.P.wood2); px(x, f.y + f.h, A.P.wood2); } }
            for (let y = f.y; y < f.y + f.h; y++) if (y % 2) { px(f.x - 1, y, A.P.wood); px(f.x + f.w, y, A.P.wood); }
        }
        // Flowers in the meadows: spring and summer in colour, autumn seed heads, none under snow.
        if (!snow) for (const fl of I.flowers) {
            const col = season === 'autumn' ? (fl.k > 0.5 ? '#c8a850' : '#a8905a') : ['#f08ab0', '#f0c040', '#f8f8f8', '#9a8ae0', '#f0602a'][Math.floor(fl.k * 5)];
            px(fl.x, fl.y, col);
        }
        // The lake, clipped to the plateau, with a lighter far shore. Frozen in deep winter.
        const lk = I.lake, frozen = !!o.frozen;
        for (let y = lk.y - lk.ry; y <= lk.y + lk.ry; y++) for (let x = lk.x - lk.rx; x <= lk.x + lk.rx; x++) {
            if (x < 0 || x > I.w) continue;
            const dx = (x - lk.x) / lk.rx, dy = (y - lk.y) / lk.ry;
            if (dx * dx + dy * dy > 1 || y <= I.back[x] || y > I.front[x]) continue;
            const edge = dx * dx + dy * dy > 0.8;
            px(x, y, frozen ? ((x + y) % 5 ? W.ice : W.ice2) : edge && y < lk.y ? W.light : dy > 0.3 && h(x, y) > 0.6 ? W.deep : W.base);
        }
        // Where the lake meets the lip, the water spills over.
        for (let x = I.fall.x - Math.floor(I.fall.w / 2); x <= I.fall.x + Math.floor(I.fall.w / 2); x++) px(x, I.front[x], frozen ? W.ice2 : W.light);
        // The dock: planks out over the water.
        for (let y = I.dock.y; y < I.dock.y + I.dock.len; y++) for (let x = I.dock.x - 1; x <= I.dock.x + 1; x++) px(x, y, y % 2 ? A.P.wood : A.P.wood2);
        px(I.dock.x - 1, I.dock.y + I.dock.len, A.P.wood2); px(I.dock.x + 1, I.dock.y + I.dock.len, A.P.wood2);
        // The cliff: soil under the grass, then strata of rock, tapering to the point.
        for (let x = 0; x <= I.w; x++) {
            const f = I.front[x], b = I.bottom[x];
            for (let y = f + 1; y <= b; y++) {
                const t = (y - f) / Math.max(1, b - f);
                let col;
                if (y - f <= 2 + (h(x, 1) > 0.5 ? 1 : 0)) col = h(x, y) > 0.6 ? R.soil2 : R.soil;
                else { const band = Math.floor((y - f) / 5) % 3; col = band === 0 ? R.mid : band === 1 ? R.dark : R.mid; if (h(x, y) > 0.9) col = R.light; if (h(x * 3, y) > 0.92) col = R.dark; }
                if (y >= b - 1 || x === 0 || x === I.w || (x > 0 && y > I.bottom[x - 1]) || (x < I.w && y > I.bottom[x + 1])) col = R.dark;
                px(x, y, col);
                if (t > 0.9 && h(x, y * 7) > 0.6) px(x, y, R.dark);
            }
        }
        // Roots trailing from the soil, crystals glinting underneath, the cave mouth.
        for (const r of I.roots) {
            let x = r.x;
            for (let i = 0; i < r.len; i++) { const y = r.y + i; if (y > I.bottom[clamp(x, 0, I.w)]) break; px(x, y, i % 4 === 3 ? R.soil2 : R.root); if (h(i, r.x) > 0.6) x += r.lean; }
        }
        for (const cr of I.crystals) {
            const col = { pink: '#f080c0', cyan: '#70e0f0', violet: '#b080f0' }[cr.hue], dark = A.shade(col, -0.35);
            px(cr.x, cr.y, col); px(cr.x - 1, cr.y + 1, dark); px(cr.x, cr.y + 1, col); px(cr.x + 1, cr.y + 1, dark); px(cr.x, cr.y + 2, dark); px(cr.x + 1, cr.y + 2, col); px(cr.x, cr.y + 3, dark);
        }
        if (I.cave) {
            const cv = I.cave;
            for (let y = -3; y <= 3; y++) for (let x = -5; x <= 5; x++) if (x * x / 25 + y * y / 9 <= 1) px(cv.x + x, cv.y + y, y > 1 ? '#1a1418' : '#241c20');
            for (let x = -5; x <= 5; x++) if (x * x / 25 <= 1) px(cv.x + x, cv.y - 3 - (Math.abs(x) < 3 ? 1 : 0), R.dark);
        }
        return { c, ox, oy, w: cw, h: ch, top, bottomMost };
    }

    // ---- The waterfall -----------------------------------------------------------------------------

    // Four frames of falling water, from the lip to a little past the
    // cliff's foot, widening and thinning into mist. Drawn over the cliff.
    function waterfall(I, extra) {
        const W = A.WATER, h = L.hash;
        const top = I.fall.top, height = I.fall.bottom - top + extra;
        const w0 = I.fall.w, w1 = w0 + 6;
        const frames = [];
        for (let f = 0; f < 4; f++) {
            const c = canvas(w1 + 2, height), g = c.getContext('2d');
            for (let y = 0; y < height; y++) {
                const t = y / height;
                const hw = (w0 / 2) + (w1 - w0) / 2 * t;
                const cx = (w1 + 2) / 2;
                for (let x = 0; x < w1 + 2; x++) {
                    const dx = Math.abs(x - cx);
                    if (dx > hw) continue;
                    const stripe = (Math.floor((y - f * 2) / 3) + x) % 4;
                    const fade = t > 0.7 ? (1 - t) / 0.3 : 1;
                    if (h(x, Math.floor(y / 2) + f * 97) > fade * 0.98 + 0.01) continue;
                    let col = stripe === 0 ? W.light : stripe === 2 ? W.deep : W.base;
                    if (dx > hw - 1 && (y + f) % 2) col = W.foam;
                    if (t > 0.85 && h(x + f, y) > 0.5) col = W.foam;
                    g.fillStyle = col; g.fillRect(x, y, 1, 1);
                }
            }
            frames.push({ c, w: w1 + 2, h: height, ax: Math.floor((w1 + 2) / 2) });
        }
        return frames;
    }

    // ---- Visitors -----------------------------------------------------------------------------------

    const VISITOR_KINDS = ['village', 'village', 'lighthouse', 'orchard', 'tower', 'cats', 'windmill', 'rock', 'village'];
    // A small island of a kind: terrain and buildings baked; its residents
    // (people or cats) returned as positions, to animate.
    function visitor(kind, rand, season, o = {}) {
        const w = Math.round(kind === 'rock' ? 28 + rand() * 20 : 44 + rand() * 60);
        const depth = Math.round(w * 0.16) + 2, cliff = Math.round(w * (0.28 + rand() * 0.2));
        const G = A.GROUND[season], R = A.ROCK, h = L.hash;
        const topRoom = 26;
        const cw = w + 12, ch = topRoom + depth + cliff + 4;
        const c = canvas(cw, ch), g = c.getContext('2d');
        const ox = 6, oy = topRoom;
        const px = (x, y, col) => dot(g, x + ox, y + oy, col);
        const seed = Math.floor(rand() * 1e6);
        const back = [], front = [], bottom = [];
        const cx = w / 2;
        for (let x = 0; x <= w; x++) {
            const u = (x - cx) / cx, round = Math.sqrt(Math.max(0, 1 - u * u));
            const hd = depth / 2 * Math.min(1, round * 1.4);
            back[x] = Math.round(depth / 2 - hd); front[x] = Math.round(depth / 2 + hd);
            bottom[x] = front[x] + Math.round(cliff * Math.max(0, 1 - Math.pow(Math.abs(u), 1.6)) * (0.7 + h(x, seed) * 0.3));
        }
        for (let x = 0; x <= w; x++) {
            for (let y = back[x]; y <= front[x]; y++) px(x, y, y === front[x] ? G.dark : h(x, y + seed) > 0.75 ? G.grass2 : G.grass);
            for (let y = front[x] + 1; y <= bottom[x]; y++) px(x, y, y - front[x] <= 2 ? R.soil : y >= bottom[x] - 1 ? R.dark : Math.floor((y - front[x]) / 4) % 2 ? R.mid : R.dark);
        }
        const residents = [], cats = [], lights = [], trees = [];
        const stand = (x, y, sprite) => { g.drawImage(sprite.c, x + ox - sprite.ax, y + oy - sprite.h + 1); };
        const treeAt = (x, kindT, size) => { const y = back[x] + 1 + Math.floor(rand() * Math.max(1, front[x] - back[x] - 2)); trees.push({ x, y, t: A.tree(kindT, size, season, rand()) }); };
        if (kind === 'rock') { treeAt(Math.round(w * 0.5), 'pine', 1); }
        else if (kind === 'orchard') { for (let x = 4; x < w - 3; x += 6) treeAt(x, 'apple', 1); }
        else if (kind === 'lighthouse') { const lh = A.lighthouse(); const x = Math.round(w / 2); stand(x, back[x] + Math.round(depth * 0.6), lh); lights.push({ x, y: back[x] + Math.round(depth * 0.6) - lh.h + 2 }); treeAt(3, 'pine', 0); treeAt(w - 3, 'pine', 0); }
        else if (kind === 'tower') {
            const x = Math.round(w / 2), base = back[x] + Math.round(depth * 0.6);
            const tower = A.house({ id: 0, x: 0, w: 9, h: 16, base, kind: 'tower', wall: 4, roof: 3, roofStyle: 'gable', door: 1, flip: false, shop: null }, season);
            stand(x, base, tower);
            lights.push({ x: x - 1, y: base - 12 }, { x: x, y: base - 12 }, { x: x + 1, y: base - 12 });
            treeAt(4, 'pine', 1); treeAt(w - 4, 'round', 0);
        } else {
            const n = Math.max(1, Math.round(w / 28));
            let x = 4 + Math.floor(rand() * 4);
            for (let i = 0; i < n && x < w - 10; i++) {
                const hw = 8 + Math.floor(rand() * 6), hh = 7 + Math.floor(rand() * 4);
                const base = back[x + Math.floor(hw / 2)] + Math.round(depth * 0.65);
                const hs = A.house({ id: i, x: 0, w: hw, h: hh, base, kind: 'cottage', wall: Math.floor(rand() * 6), roof: Math.floor(rand() * 5), roofStyle: rand() < 0.5 ? 'gable' : 'hip', door: 1, flip: rand() < 0.5, shop: null }, season);
                stand(x + Math.floor(hw / 2), base, hs);
                for (const win of hs.windows) lights.push({ x: x + win.x + 1, y: base - hs.h + 1 + win.y + 1 });
                x += hw + 3 + Math.floor(rand() * 4);
            }
            if (kind === 'windmill') { const mill = A.windmill(season); const mx = w - 7; stand(mx, back[mx] + Math.round(depth * 0.5), mill.tower); o.windmill = { x: mx, y: back[mx] + Math.round(depth * 0.5) - mill.tower.h + 1 + mill.hub.y, sails: mill.sails }; }
            treeAt(2, 'round', 0); if (w > 60) treeAt(w - 3, rand() < 0.5 ? 'pine' : 'round', 1);
        }
        for (const t of trees) { g.drawImage(t.t.trunk.c, t.x + ox - t.t.trunk.ax, t.y + oy - t.t.trunk.h + 1); g.drawImage(t.t.canopy.c, t.x + ox - t.t.canopy.ax, t.y + oy - t.t.canopy.h + 1); }
        // Who lives there: a few folk by the edge, or cats everywhere.
        const people = kind === 'cats' ? 0 : kind === 'rock' ? 1 : 1 + Math.floor(rand() * 2) + (w > 80 ? 1 : 0);
        for (let i = 0; i < people; i++) { const x = 3 + Math.floor(rand() * (w - 6)); residents.push({ x, y: front[x] - 1 - Math.floor(rand() * Math.max(1, depth - 3)) }); }
        if (kind === 'cats') for (let i = 0; i < 4 + Math.floor(rand() * 3); i++) { const x = 3 + Math.floor(rand() * (w - 6)); cats.push({ x, y: front[x] - 1 - Math.floor(rand() * Math.max(1, depth - 2)) }); }
        return { c, w: cw, h: ch, ox, oy, iw: w, depth, residents, cats, lights, kind, windmill: o.windmill || null, fall: kind !== 'rock' && rand() < 0.4 ? { x: Math.round(w * (0.2 + rand() * 0.6)), top: 0, h: Math.round(cliff * 0.9) } : null };
    }

    return { light, sky, glow, terrain, waterfall, visitor, VISITOR_KINDS, MARGIN, rgb, smooth, BAYER };
})();
