// Sky Island's land and sky: what gets baked. The light of the hour for a
// season (sky colours, the wash over the land, how dark it is); the sky as
// a dithered gradient; the island's terrain from its layout (three tiers
// of grass with their cliff faces, the banded underside, the spring, the
// pond, the lake, the streets, the fields, the stairs, the bridge, the
// dock); the waterfalls' frames; the sea of cloud below and the far ground
// under it; and whole small islands baked for the ones that drift past.

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
    const hex = c => `#${c.slice(0, 3).map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
    const h = L.hash;

    // ---- Light ----------------------------------------------------------------------------------

    // The sky by the sun's altitude: zenith, middle, horizon. Night and the
    // twilights are shared; the day is the season's: summer's cornflower
    // blue, spring's fresh one, autumn's haze, winter's pale wash.
    const DAY = {
        spring: [[16, [86, 158, 236], [146, 198, 244], [214, 236, 248]], [45, [72, 144, 232], [130, 190, 242], [204, 232, 246]]],
        summer: [[16, [70, 140, 232], [120, 182, 242], [196, 230, 248]], [45, [52, 122, 226], [104, 170, 240], [186, 226, 248]]],
        autumn: [[16, [110, 154, 212], [164, 194, 226], [232, 218, 192]], [45, [100, 150, 212], [156, 192, 226], [228, 220, 200]]],
        winter: [[16, [136, 172, 218], [182, 204, 230], [228, 232, 240]], [45, [128, 168, 218], [176, 202, 230], [224, 230, 240]]],
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
        [-18, [38, 46, 86], [20, 26, 54], [12, 16, 40]],
        [-8, [96, 78, 120], [44, 40, 78], [28, 26, 56]],
        [-2, [255, 150, 120], [120, 70, 100], [80, 50, 80]],
        [4, [255, 200, 150], [200, 150, 140], [150, 110, 120]],
        [12, [255, 232, 200], [214, 196, 190], [170, 160, 170]],
        [30, [255, 255, 255], [202, 212, 230], [150, 168, 200]],
    ];
    function light(sunAlt, moonLight, season) {
        const frames = [...NIGHT, ...DAY[season] || DAY.summer].map(([k, a, b, c]) => [k, ...a, ...b, ...c]);
        const sky = ramp(frames, sunAlt);
        const lift = smooth(-6, -14, sunAlt) * (moonLight || 0);
        const moonLift = [18, 26, 48];
        const wash = ramp(WASH, sunAlt);
        const cloud = ramp(CLOUD.map(([k, a, b, c]) => [k, ...a, ...b, ...c]), sunAlt);
        const bright = [60, 66, 74];
        return {
            top: sky.slice(0, 3).map((v, i) => v + moonLift[i] * lift * 0.7),
            mid: sky.slice(3, 6).map((v, i) => v + moonLift[i] * lift),
            horizon: sky.slice(6, 9).map((v, i) => v + moonLift[i] * lift * 1.2),
            wash: [wash[0], wash[1], wash[2], wash[3] * (1 - 0.22 * lift)],
            cloudLit: cloud.slice(0, 3).map((v, i) => v + bright[i] * lift),
            cloudShade: cloud.slice(3, 6).map((v, i) => v + bright[i] * lift * 0.5),
            cloudDeep: cloud.slice(6, 9).map((v, i) => v + bright[i] * lift * 0.3),
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
            const steps = 6;
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

    // A soft glow sprite, for lamps, windows, crystals and the magic.
    function glow(r, colour, alpha) {
        const c = canvas(r * 2 + 1, r * 2 + 1), g = c.getContext('2d');
        for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
            const d = Math.hypot(x, y) / r;
            if (d > 1) continue;
            const a = alpha * (1 - d) * (1 - d);
            if (BAYER[(y + r) % 4][(x + r) % 4] / 16 < a * 2) { g.globalAlpha = Math.min(1, a * 1.6 + 0.08); dot(g, x + r, y + r, colour); }
        }
        g.globalAlpha = 1;
        return { c, w: r * 2 + 1, h: r * 2 + 1, ax: r };
    }

    // ---- The island's terrain ------------------------------------------------------------------------

    const MARGIN = 16;
    // The strata of the underside, top to bottom, each a few pixels thick.
    const STRATA = ['soil', 'soil2', 'terracotta', 'rust', 'sand', 'ochre', 'moss', 'charcoal', 'rust', 'terracotta', 'slate', 'charcoal', 'ochre', 'deep', 'charcoal', 'deep'];
    // The terrain as one bake: { c, ox, oy } where island (x, y) is drawn at
    // (x + ox, y + oy) on the canvas.
    function terrain(I, season, o = {}) {
        const G = A.GROUND[season], W = A.WATER, R = A.ROCK;
        const top = -(I.crag.h + 8), bottomMost = Math.max(...I.bottom) + 6;
        const ox = MARGIN, oy = -top;
        const cw = I.w + MARGIN * 2, ch = bottomMost - top;
        const c = canvas(cw, ch), g = c.getContext('2d');
        const px = (x, y, col) => dot(g, x + ox, y + oy, col);
        const snow = season === 'winter', frozen = !!o.frozen;
        const grassAt = (x, y, t) => { const k = h(x, y); return k > 0.93 ? G.light : k > 0.8 ? G.grass3 : k > 0.55 ? G.grass2 : G.grass; };
        const rockAt = (x, y, band) => { const name = STRATA[band % STRATA.length]; let col = R[name] || R.mid; const k = h(x * 3, y); if (k > 0.9) col = A.shade(col, 0.18); else if (k < 0.08) col = A.shade(col, -0.25); return col; };
        // ---- The tiers, lowest first, each over the one below ----
        for (let k = I.tiers.length - 1; k >= 0; k--) {
            const t = I.tiers[k], up = I.tiers[k - 1];
            for (let x = t.x0; x <= t.x1; x++) {
                const yb = t.back[x], yf = t.front[x];
                const covered = up && x >= up.x0 && x <= up.x1;
                for (let y = yb; y <= yf; y++) {
                    let col = grassAt(x, y);
                    if (covered && y - yb < 3) col = y - yb === 0 ? G.dark : (h(x, y) > 0.5 ? G.dark : G.grass3);       // the cliff's shadow
                    if (y === yf) col = G.light;
                    if (y === yb && !covered) col = G.grass3;
                    if (snow && y === yf) col = A.P.snow;
                    px(x, y, col);
                }
                // The cliff face below the front edge: a grassy overhang, soil, then rock.
                if (t.drop > 0) {
                    const face = t.foot[x] - yf;
                    for (let y = yf + 1; y <= t.foot[x]; y++) {
                        const d = y - yf;
                        let col;
                        if (d === 1) col = G.dark;
                        else if (d <= 3 + (h(x, 1) > 0.5 ? 1 : 0)) col = h(x, y) > 0.6 ? R.soil2 : R.soil;
                        else col = rockAt(x, y, 2 + Math.floor((d - 4 + (h(Math.floor(x / 9), k) > 0.5 ? 1 : 0)) / 5));
                        if (y === t.foot[x]) col = R.deep;
                        if (x === t.x0 || x === t.x1) col = R.deep;
                        else if (x - t.x0 < 3) col = A.shade(col, 0.2); else if (t.x1 - x < 4) col = A.shade(col, -0.3);
                        if (d > 4 && h(x * 7, y * 3) > 0.985) col = R.moss;
                        px(x, y, col);
                    }
                    if (!snow && face > 6 && h(x, 99) > 0.9) px(x, yf + 2, G.grass3);          // grass trailing over the edge
                }
            }
        }
        // ---- The underside: strata to a jagged point ----
        const t2 = I.tiers[2];
        const wob = L.noise1(I.seed + 77, 14);
        const bandH = Math.max(5, Math.round(I.underH / 22));
        for (let x = 0; x <= I.w; x++) {
            const f = t2.front[x], b = I.bottom[x];
            for (let y = f + 1; y <= b; y++) {
                const d = y - f;
                let col;
                if (d === 1) col = G.dark;
                else if (d <= 4) col = h(x, y) > 0.6 ? R.soil2 : R.soil;
                else col = rockAt(x, y, 2 + Math.floor((d - 5 + (wob(x) - 0.5) * bandH * 1.6) / bandH));
                const u = (x - I.w / 2) / (I.w / 2);
                if (u > 0.55) col = A.shade(col, -0.18 * (u - 0.55) / 0.45); else if (u < -0.6) col = A.shade(col, 0.12 * (-u - 0.6) / 0.4);
                const edge = y >= b - 1 || x === 0 || x === I.w || (x > 0 && y > I.bottom[x - 1]) || (x < I.w && y > I.bottom[x + 1]);
                if (edge) col = R.deep;
                else if ((x > 1 && y > I.bottom[x - 2]) || (x < I.w - 1 && y > I.bottom[x + 2])) col = A.shade(col, -0.3);
                px(x, y, col);
            }
        }
        // The cave mouth, dark with a lit rim.
        if (I.cave) {
            const cv = I.cave;
            for (let y = -4; y <= 4; y++) for (let x = -7; x <= 7; x++) if (x * x / 49 + y * y / 16 <= 1) px(cv.x + x, cv.y + y, y > 2 ? '#1a1418' : y > -2 && Math.abs(x) < 5 ? '#120e12' : '#241c20');
            for (let x = -7; x <= 7; x++) if (x * x / 49 <= 1) px(cv.x + x, cv.y - 4 - (Math.abs(x) < 4 ? 1 : 0), R.deep);
        }
        for (const cr of I.crystals) {
            const col = cr.hue === 'cyan' ? A.P.cyan : '#b080f0', dark = A.shade(col, -0.4);
            px(cr.x, cr.y, col); px(cr.x - 1, cr.y + 1, dark); px(cr.x, cr.y + 1, col); px(cr.x + 1, cr.y + 1, dark); px(cr.x, cr.y + 2, dark); px(cr.x + 1, cr.y + 2, col); px(cr.x, cr.y + 3, dark); px(cr.x + 1, cr.y + 3, dark);
        }
        // ---- The crag at the back of the top ----
        const cg = I.crag;
        for (let y = -cg.h; y <= 2; y++) for (let x = -Math.round(cg.w / 2); x <= Math.round(cg.w / 2); x++) {
            const u = x / (cg.w / 2);
            const peak = Math.max(0, 1 - Math.abs(u) ** 1.6) * (0.75 + h(Math.floor((x + 100) / 5), 3) * 0.25);
            if (-y > cg.h * peak) continue;
            const t = -y / (cg.h * peak + 0.01);
            let col = u > 0.25 ? R.dark : h(x, y) > 0.85 ? R.light : R.mid;
            if (t > 0.9 - (snow ? 0.4 : 0)) col = snow ? ((x + y) % 2 ? A.P.snow : A.P.snow2) : (x + y) % 2 ? R.light : R.mid;
            if (t < 0.3 && !snow && h(x * 2, y) > 0.6) col = G.dark;
            if (-y === Math.floor(cg.h * peak)) col = R.deep;
            px(cg.x + x, cg.y + y, col);
        }
        // ---- Streets: winding packed earth; the square's paving ----
        const street = (x, y, k) => { if (x < 0 || x > I.w) return; const tier = I.tiers[k]; if (tier.back[x] === undefined || y <= tier.back[x] || y >= tier.front[x]) return; px(x, y, h(x, y) > 0.75 ? G.path2 : h(x, y) < 0.06 ? G.stone : G.path); };
        for (const s of I.streets) {
            for (let x = s.l; x <= s.r; x++) {
                const wig = Math.round(Math.sin(x * 0.11 + s.tier) * 0.9);
                for (let dy = -1; dy <= 1; dy++) street(x, s.y + wig + dy, s.tier);
                if (h(x, 5) > 0.5) street(x, s.y + wig + 2, s.tier); if (h(x, 6) > 0.5) street(x, s.y + wig - 2, s.tier);
            }
        }
        // Lanes: from the stairs' feet up to the streets, and to the dock.
        for (const st of I.stairs) { const to = I.streets.find(s => s.tier === st.tier + 1); for (let y = st.bottom + 1; y < to.y; y++) for (let dx = -1; dx <= 1; dx++) street(st.x + dx, y, st.tier + 1); const from = I.streets.find(s => s.tier === st.tier && (st.tier === 0 || s === I.streets[2])); for (let y = from.y; y < st.top; y++) for (let dx = -1; dx <= 1; dx++) street(st.x + dx, y, st.tier); }
        for (let y = Math.min(I.streets[3].y, I.dock.y); y <= Math.max(I.streets[3].y, I.dock.y); y++) for (let dx = -1; dx <= 0; dx++) street(I.dock.shoreX - I.dir * 2 + dx, y, 2);
        const sq = I.square;
        for (let y = sq.y - 7; y <= sq.y + 8; y++) for (let x = sq.x - 16; x <= sq.x + 16; x++) {
            const t = I.tiers[1]; if (t.back[x] === undefined || y <= t.back[x] + 1 || y >= t.front[x]) continue;
            const r = Math.hypot((x - sq.x) / 16, (y - sq.y) / 8); if (r > 1) continue;
            const bx = Math.floor((x + (Math.floor(y / 2) % 2) * 2) / 4), by = Math.floor(y / 2);
            px(x, y, (x + (by % 2) * 2) % 4 === 0 || y % 2 === 0 ? A.P.stone2 : h(bx, by) > 0.7 ? A.P.stone3 : A.P.stone);
        }
        // ---- Fields: a fence, rows of crop ----
        for (const f of I.fields) {
            const crop = { wheat: ['#e8c050', '#c89a30', '#f0d870'], cabbage: ['#8ad06a', '#5fa84c', '#b0e890'], pumpkin: ['#f08a2a', '#5fa84c', '#ffb050'], carrot: ['#7ac860', '#4f9a3c', '#9ae080'], flowers: ['#f08ab0', '#f0c040', '#f8f8f8'] }[f.crop];
            for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) {
                const soilRow = (y - f.y) % 3 === 2;
                let col;
                if (snow) col = (x + y) % 2 ? A.P.snow : A.P.snow2;
                else if (season === 'winter' || soilRow) col = h(x, y) > 0.5 ? '#9a7a5a' : '#8a6a4a';
                else if (f.crop === 'wheat') col = (y - f.y) % 3 === 0 ? (x % 2 ? crop[2] : crop[0]) : (x % 2 ? crop[0] : crop[1]);
                else if (f.crop === 'cabbage' || f.crop === 'pumpkin') { const cx = (x - f.x) % 4, cy = (y - f.y) % 3; col = cx === 1 && cy === 0 ? crop[2] : (cx === 1 || cx === 2) && cy <= 1 ? (cx === 2 && cy === 1 ? crop[1] : crop[0]) : '#8a6a4a'; }
                else col = (x - f.x) % 3 === 1 ? ((y - f.y) % 3 === 0 ? crop[0] : crop[1]) : '#8a6a4a';
                px(x, y, col);
            }
            for (let x = f.x - 1; x <= f.x + f.w; x++) { const post = (x - f.x + 1) % 5 === 0; px(x, f.y - 1, post ? A.P.wood2 : A.P.wood3); px(x, f.y + f.h, post ? A.P.wood2 : A.P.wood3); if (post) { px(x, f.y - 2, A.P.wood); px(x, f.y + f.h - 1, A.P.wood); px(x, f.y + f.h + 1, A.P.wood2); } }
            for (let y = f.y; y < f.y + f.h; y++) if (y % 2) { px(f.x - 1, y, A.P.wood); px(f.x + f.w, y, A.P.wood); }
        }
        // ---- Flowers: spring and summer in colour, autumn seed heads, none under snow ----
        if (!snow) for (const fl of I.flowers) {
            const col = season === 'autumn' ? (fl.k > 0.5 ? '#c8a850' : '#a8905a') : ['#f08ab0', '#f0c040', '#f8f8f8', '#9a8ae0', '#f0602a', '#ffffff'][Math.floor(fl.k * 6)];
            px(fl.x, fl.y, col); if (fl.k > 0.4) px(fl.x + 1, fl.y - 1, col === '#ffffff' ? '#f08ab0' : A.shade(col, 0.3)); px(fl.x, fl.y + 1, G.dark);
        }
        // ---- Water: the spring, the pond, the lake, each clipped to its tier, banked in sand ----
        const water = (wb, tier) => {
            const t = I.tiers[tier];
            for (let y = wb.y - wb.ry - 1; y <= wb.y + wb.ry + 1; y++) for (let x = wb.x - wb.rx - 1; x <= wb.x + wb.rx + 1; x++) {
                if (x < t.x0 || x > t.x1 || t.back[x] === undefined || y <= t.back[x] || y > t.front[x]) continue;
                const dx = (x - wb.x) / wb.rx, dy = (y - wb.y) / wb.ry, r = dx * dx + dy * dy;
                const wobble = (h(x, y + wb.x) - 0.5) * 0.12;
                if (r > 1.25 + wobble) continue;
                if (r > 1 + wobble) { px(x, y, y < wb.y ? G.dark : (x + y) % 2 ? G.path : G.path2); continue; }
                if (frozen) { px(x, y, h(x, y) > 0.85 ? W.ice3 : (x + y) % 5 ? W.ice : W.ice2); continue; }
                px(x, y, r > 0.82 && dy < -0.2 ? W.pale : r > 0.7 && dy < 0 ? W.light : dy > 0.25 && h(x, y) > 0.55 ? W.deep : dy > 0.5 ? W.deep : h(x * 5, y * 3) > 0.96 ? W.light : W.base);
            }
            // Spilling over the lip.
            const fall = I.falls.find(f => f.into === (tier === 0 ? 'pond' : tier === 1 ? 'lake' : 'clouds'));
            if (fall) for (let x = fall.x - Math.floor(fall.w / 2); x <= fall.x + Math.floor(fall.w / 2); x++) { px(x, t.front[x], frozen ? W.ice2 : W.light); px(x, t.front[x] - 1, frozen ? W.ice : W.pale); }
        };
        water(I.spring, 0); water(I.pond, 1); water(I.lake, 2);
        // The trickle from the crag to the spring.
        for (let y = cg.y + 2; y < I.spring.y - I.spring.ry; y++) px(I.spring.x + (y % 4 === 0 ? 1 : 0), y, frozen ? W.ice : y % 3 ? W.light : W.pale);
        // Lily pads on the lake, reeds at the back.
        if (!frozen) for (let i = 0; i < 5; i++) { const x = I.lake.x + Math.round((h(i, 3) - 0.5) * I.lake.rx * 1.2), y = I.lake.y + Math.round((h(i, 4) - 0.2) * I.lake.ry * 1.1); px(x, y, '#5fb84c'); px(x + 1, y, '#4a9a3c'); px(x, y + 1, '#4a9a3c'); if (i % 2) px(x + 1, y - 1, '#f08ab0'); }
        for (let i = 0; i < 6; i++) { const x = I.lake.x - I.dir * Math.round(I.lake.rx * (0.55 + h(i, 8) * 0.4)), y = I.lake.y - Math.round(I.lake.ry * 0.3) + Math.round(h(i, 9) * I.lake.ry * 0.8); for (let k = 0; k < 4; k++) px(x + (k % 2 ? 1 : 0), y - k, k === 3 ? '#8a6a3a' : '#6a9a3a'); }
        // ---- The dock: planks out over the water, posts at the tip ----
        const dk = I.dock;
        for (let i = 0; i <= dk.len; i++) { const x = dk.shoreX + dk.dir * i; for (let dy = -1; dy <= 1; dy++) px(x, dk.y + dy, i % 4 === 3 ? A.P.wood2 : dy === 1 ? A.P.wood2 : A.P.wood3); }
        for (const i of [0, dk.len]) { const x = dk.shoreX + dk.dir * i; px(x, dk.y + 2, A.P.wood2); px(x, dk.y + 3, A.P.wood2); px(x, dk.y - 2, A.P.wood); }
        // ---- The bridge over the pond, the stairs down the cliffs ----
        const br = A.bridge(I.bridge.hw * 2 + 1);
        g.drawImage(br.c, I.bridge.x - br.ax + ox, I.bridge.y - 4 + oy);
        for (const st of I.stairs) { const s = A.stairs(st.bottom - st.top); g.drawImage(s.c, st.x - s.ax + ox, st.top + oy); }
        return { c, ox, oy, w: cw, h: ch, top, bottomMost };
    }

    // ---- The waterfalls -----------------------------------------------------------------------------

    // Four frames of each fall: narrow ones down the cliffs into the pond
    // and the lake, with a splash; the cascade off the edge, widening and
    // thinning into mist. Drawn over the cliff faces.
    function falls(I) {
        const W = A.WATER;
        return I.falls.map(f => {
            const cascade = f.into === 'clouds';
            const height = f.bottom - f.top + (cascade ? 0 : 5);
            const w0 = f.w, w1 = cascade ? w0 + Math.round(w0 * 1.6) : w0 + 4;
            const cw = w1 + 4;
            const frames = [];
            for (let k = 0; k < 4; k++) {
                const c = canvas(cw, height), g = c.getContext('2d');
                for (let y = 0; y < height; y++) {
                    const t = y / height;
                    const hw = (w0 / 2) + (w1 - w0) / 2 * (cascade ? Math.pow(t, 0.8) : Math.min(1, t * 1.5));
                    const cx = cw / 2;
                    for (let x = 0; x < cw; x++) {
                        const dx = Math.abs(x - cx + 0.5);
                        if (dx > hw) continue;
                        const stripe = (Math.floor((y - k * 2) / 3) + x) % 4;
                        const fade = cascade ? (t > 0.55 ? (1 - t) / 0.45 : 1) : 1;
                        if (h(x, Math.floor(y / 2) + k * 97) > fade * 0.96 + 0.04) continue;
                        let col = stripe === 0 ? W.foam : stripe === 2 ? W.base : stripe === 1 ? W.light : W.pale;
                        if (dx > hw - 1.2 && (y + k) % 2) col = W.foam;
                        if (cascade && t > 0.7 && h(x + k, y) > 0.35 + (1 - t)) col = W.foam;
                        dot(g, x, y, col);
                    }
                }
                // The splash where it lands.
                if (!cascade) { const sy = height - 5; for (let i = 0; i < 9; i++) { const x = Math.round(cw / 2 - 4 + h(i, k) * 8), y = sy + Math.round(h(i + 9, k) * 4); dot(g, x, y, (i + k) % 2 ? W.foam : W.pale); } }
                frames.push({ c, w: cw, h: height, ax: Math.floor(cw / 2) });
            }
            return frames;
        });
    }

    // ---- The sea of cloud and the ground far below ---------------------------------------------------

    // Two tileable strips of cumulus, `w` wide and `hgt` tall, the front one
    // bigger and brighter, both with gaps for the ground to show through.
    function cloudSea(w, hgt, lt, rand) {
        const lit = hex(lt.cloudLit), sh = hex(lt.cloudShade), deep = hex(lt.cloudDeep);
        const make = (count, scale, tint) => {
            const c = canvas(w, hgt), g = c.getContext('2d');
            const clouds = [];
            for (let i = 0; i < count; i++) clouds.push({ x: (i + rand() * 0.7) / count * w, y: hgt * (0.25 + rand() * 0.4), cw: Math.round((70 + rand() * 130) * scale), chh: Math.round((30 + rand() * 26) * scale) });
            for (const cl of clouds) {
                const sprite = A.cloud(cl.cw, cl.chh, rand, tint ? A.mixHex(lit, sh, tint) : lit, tint ? A.mixHex(sh, deep, tint) : sh, deep);
                for (const dx of [-w, 0, w]) g.drawImage(sprite.c, Math.round(cl.x - cl.cw / 2 + dx), Math.round(cl.y));
            }
            return c;
        };
        return { back: make(Math.round(w / 140), 0.8, 0.35), front: make(Math.round(w / 170), 1.25, 0) };
    }

    // The ground far below, seen through the clouds: a patchwork of fields,
    // woods, a river, roads, and little towns whose windows light at night.
    // One tileable strip `w` wide; { c, lights } where lights is the same
    // strip with only the windows, for the dark.
    function ground(seed, w, hgt, season) {
        const rand = L.rng(seed + 31);
        const c = canvas(w, hgt), g = c.getContext('2d');
        const lc = canvas(w, hgt), lg = lc.getContext('2d');
        const snow = season === 'winter';
        const FIELDS = snow ? ['#dfe6ee', '#d2dbe6', '#c8d4e2', '#e8eef4', '#d8e0ea'] : season === 'autumn' ? ['#9a9a58', '#b8a058', '#a08a58', '#8a9458', '#aca868', '#7e8a50'] : ['#7aaa66', '#92b866', '#b4aa62', '#6c9c5a', '#a0ae64', '#a89a6a', '#86b46c'];
        const WOOD = snow ? ['#9aa8b8', '#8a98a8'] : season === 'autumn' ? ['#8a6a38', '#6a7a38'] : ['#4e8a46', '#3e7a3c'];
        const px = (x, y, col) => dot(g, ((x % w) + w) % w, y, col);
        g.fillStyle = FIELDS[0]; g.fillRect(0, 0, w, hgt);
        // Fields: a patchwork of cells with hedges between.
        const cols = Math.round(w / 15), rowsN = Math.round(hgt / 8);
        const cellW = w / cols, cellH = hgt / rowsN;
        for (let j = 0; j < rowsN; j++) for (let i = 0; i < cols; i++) {
            const col = rand.pick(FIELDS);
            const x0 = Math.round(i * cellW + (rand() - 0.5) * 3), y0 = Math.round(j * cellH + (rand() - 0.5) * 2);
            const x1 = Math.round((i + 1) * cellW + (rand() - 0.5) * 3), y1 = Math.round((j + 1) * cellH + (rand() - 0.5) * 2);
            for (let y = Math.max(0, y0); y < Math.min(hgt, y1); y++) for (let x = x0; x < x1; x++) px(x, y, h(x, y) > 0.9 ? A.shade(col, 0.1) : h(x, y) < 0.1 ? A.shade(col, -0.08) : col);
            if (rand() < 0.6) for (let y = Math.max(0, y0); y < Math.min(hgt, y1); y++) px(x0, y, WOOD[1]);
            if (rand() < 0.6) for (let x = x0; x < x1; x++) px(x, Math.max(0, y0), WOOD[1]);
        }
        // Woods: blobs of stippled dark green.
        for (let i = 0; i < w / 50; i++) { const cx = rand() * w, cy = rand() * hgt, r = 5 + rand() * 10; for (let y = Math.max(0, Math.round(cy - r)); y < Math.min(hgt, cy + r); y++) for (let x = Math.round(cx - r * 1.4); x < cx + r * 1.4; x++) { if (((x - cx) / (r * 1.4)) ** 2 + ((y - cy) / r) ** 2 > 1 - h(x, y) * 0.3) continue; px(x, y, (x + y) % 3 ? WOOD[0] : WOOD[1]); } }
        // Lakes.
        for (let i = 0; i < 1 + Math.round(w / 500); i++) { const cx = rand() * w, cy = hgt * (0.2 + rand() * 0.6), rx = 8 + rand() * 14, ry = rx * 0.5; for (let y = Math.max(0, Math.round(cy - ry)); y < Math.min(hgt, cy + ry); y++) for (let x = Math.round(cx - rx); x < cx + rx; x++) { const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2; if (d > 1) continue; px(x, y, snow && d > 0.5 ? A.WATER.ice : d > 0.8 ? A.WATER.light : A.WATER.base); } }
        // A river winding across, with a lighter bank.
        const river = L.noise1(seed + 5, 70), river2 = L.noise1(seed + 6, 23);
        for (let x = 0; x < w; x++) { const k = x / w; const y = Math.round(hgt * 0.5 + (river(x) - 0.5) * hgt * 0.6 * Math.sin(k * Math.PI) + (river2(x) - 0.5) * hgt * 0.2 + (river(0) - river(w)) * hgt * 0.6 * k); px(x, y, A.WATER.base); if (x % 2 === 0) px(x, y + 1, A.WATER.deep); }
        // Roads, between the towns; towns of tiny roofs with a lit window each at night.
        const towns = [];
        for (let i = 0; i < 1 + Math.round(w / 220); i++) towns.push({ x: (i + 0.3 + rand() * 0.5) / (1 + Math.round(w / 220)) * w, y: hgt * (0.15 + rand() * 0.65), n: 5 + rand.int(0, 10) });
        for (let i = 0; i < towns.length; i++) {
            const a = towns[i], b = towns[(i + 1) % towns.length];
            const bx = b.x < a.x ? b.x + w : b.x;
            const steps = Math.round(Math.abs(bx - a.x));
            for (let s = 0; s <= steps; s++) { const t = s / steps; const x = Math.round(a.x + (bx - a.x) * t), y = Math.round(a.y + (b.y - a.y) * t + Math.sin(t * Math.PI * 3) * 6); if (s % 2 === 0) px(x, y, '#cfc2a4'); }
        }
        const ROOF = ['#c05a48', '#8a6a4a', '#6a7890', '#b08a50'];
        for (const tn of towns) for (let i = 0; i < tn.n; i++) {
            const x = Math.round(tn.x + (rand() - 0.5) * (10 + tn.n)), y = Math.round(tn.y + (rand() - 0.5) * (6 + tn.n * 0.4));
            const roof = rand.pick(ROOF);
            px(x, y, roof); px(x + 1, y, roof); px(x, y + 1, '#e8e0d0'); px(x + 1, y + 1, '#c8c0b0');
            if (snow) { px(x, y, A.P.snow); px(x + 1, y, A.P.snow2); }
            dot(lg, ((x + 1) % w + w) % w, y + 1, rand() < 0.7 ? '#ffd77a' : '#ffb060');
        }
        if (towns[0]) { const tn = towns[0]; for (let y = -3; y <= 0; y++) px(Math.round(tn.x), Math.round(tn.y) + y, y === -3 ? '#f0c040' : '#8a8a94'); }
        return { c, lights: lc, towns };
    }

    // ---- Whole islands baked --------------------------------------------------------------------------

    // Everything that stands still on an island, as sprites to place:
    // [{ x, y, s, sortY, dy }]. The manager bakes ours into bands; a passing
    // island is baked whole.
    function statics(I, season, art) {
        const out = [];
        const put = (x, y, s, sortY, dy = 0) => { if (s) out.push({ x: Math.round(x), y: Math.round(y), s, sortY: sortY ?? y, dy }); };
        for (const hs of I.houses) { const a = art.house(hs); put(hs.x + a.ax - 1, hs.base, a); }
        put(I.tower.x, I.tower.base, art.tower);
        if (I.windmill) put(I.windmill.x, I.windmill.base, art.windmill.tower);
        if (I.lighthouse) put(I.lighthouse.x, I.lighthouse.base, art.lighthouse);
        if (I.stall) put(I.stall.x, I.stall.base, art.stall);
        put(I.well.x, I.well.y, art.well);
        for (const b of I.benches) put(b.x, b.y, art.bench);
        for (const l of I.lamps) put(l.x, l.y, art.lamp.off);
        for (const p of I.props) put(p.x, p.y, art.prop(p.kind));
        for (const b of I.bushes) put(b.x, b.y, art.bush(b));
        if (!art.liveTrees) for (const tr of I.trees) { const ts = art.tree(tr); put(tr.x, tr.y, ts.trunk); put(tr.x, tr.y, ts.canopy, tr.y + 0.001); }
        return out;
    }

    // A small island of its own, from a seed: its terrain and every static
    // sprite baked into one canvas; what moves (the falls, the sails, the
    // flag, its folk and cats, its lit windows) returned for the frame.
    function island(seed, season, opts) {
        const w = opts.w;
        const I = L.layout(seed, { w, portrait: false, houses: opts.houses ?? 4, forest: opts.forest ?? 1, fields: opts.fields ?? true, dragon: false, islet: !!opts.islet });
        const T = terrain(I, season, { frozen: opts.frozen });
        const houseArt = new Map(), treeArt = new Map(), bushArt = new Map();
        const props = {};
        const art = {
            house: hs => { if (!houseArt.has(hs.id)) houseArt.set(hs.id, A.house(hs, season)); return houseArt.get(hs.id); },
            tree: tr => { const key = `${tr.kind}|${tr.size}|${Math.round(tr.phase * 4)}`; if (!treeArt.has(key)) treeArt.set(key, A.tree(tr.kind, tr.size, season, tr.phase)); return treeArt.get(key); },
            bush: b => { const key = `${b.size}|${b.berry}`; if (!bushArt.has(key)) bushArt.set(key, A.bush(b.size, season, b.k, b.berry)); return bushArt.get(key); },
            prop: kind => props[kind] ||= A[kind] ? A[kind]() : null,
            tower: A.tower(season), windmill: I.windmill ? A.windmill(season) : null, lighthouse: A.lighthouse(), stall: A.stall(), well: A.well(), bench: A.bench(), lamp: A.lamp(),
        };
        const list = statics(I, season, art).sort((a, b) => a.sortY - b.sortY);
        const topRoom = art.tower.h + 4;
        const c = canvas(T.w, T.h + topRoom), g = c.getContext('2d');
        const oy = T.oy + topRoom, ox = T.ox;
        g.drawImage(T.c, 0, topRoom);
        for (const st of list) g.drawImage(st.s.c, st.x - st.s.ax + ox, st.y - st.s.h + 1 + st.dy + oy);
        const lights = [];
        for (const hs of I.houses) { const a = art.house(hs); for (const win of a.windows) lights.push({ x: hs.x + win.x, y: hs.base - a.h + 1 + win.y, w: win.w, h: win.h }); }
        for (const win of art.tower.windows) lights.push({ x: I.tower.x - art.tower.ax + win.x, y: I.tower.base - art.tower.h + 1 + win.y, w: win.w, h: win.h });
        const rand = L.rng(seed + 3);
        const residents = [];
        const n = opts.people ?? 2;
        for (let i = 0; i < n; i++) { const s = rand.pick(I.streets); residents.push({ x: rand.int(s.l + 4, s.r - 4), y: s.y, tier: s.tier }); }
        const cats = [];
        for (let i = 0; i < (opts.cats ?? 1); i++) { const s = rand.pick(I.streets); cats.push({ x: rand.int(s.l + 4, s.r - 4), y: s.y + 1 }); }
        return { c, w: c.width, h: c.height, ox, oy, I, falls: falls(I), windmill: I.windmill ? { x: I.windmill.x, y: I.windmill.base - art.windmill.tower.h + 1 + art.windmill.hub.y, sails: art.windmill.sails } : null,
            flag: { x: I.tower.x - art.tower.ax + art.tower.pole.x + 1, y: I.tower.base - art.tower.h + 1 + art.tower.pole.y, frames: art.tower.flags }, lights, residents, cats, name: I.name };
    }

    return { light, sky, glow, terrain, falls, cloudSea, ground, statics, island, MARGIN, rgb, smooth, BAYER };
})();
