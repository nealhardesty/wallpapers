// Christmas Village's pure logic: the winter light, the calendar (how far
// the town has got with its decorating, and whether it's Christmas Eve),
// when each window is lit, where everything stands, and how a skater keeps
// to the ice. No DOM in here, so tools/christmas-village.test.mjs can run
// it in Node. The sun and moon themselves come from harvest-sky.js.

const VillageLogic = (() => {
    const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
    const lerp = (a, b, t) => a + (b - a) * t;
    const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const ramp = (frames, x) => {
        if (x <= frames[0][0]) return frames[0].slice(1);
        for (let i = 1; i < frames.length; i++) {
            if (x <= frames[i][0]) {
                const a = frames[i - 1], b = frames[i], t = (x - a[0]) / (b[0] - a[0]);
                return a.slice(1).map((v, j) => v + (b[j + 1] - v) * t);
            }
        }
        return frames[frames.length - 1].slice(1);
    };

    // ---- Light ----------------------------------------------------------------
    // By the sun's altitude in degrees: the sky at the zenith, the middle and
    // the horizon. A snow sky: pale and a little grey by day, rose and
    // peach at the ends of it, and a deep, clear blue at night.
    const SKY = [
        [-18, 6, 10, 26, 11, 18, 44, 22, 32, 66],
        [-9, 12, 20, 50, 30, 36, 78, 70, 58, 100],
        [-4, 30, 40, 88, 96, 74, 118, 222, 132, 118],
        [0, 62, 84, 138, 176, 128, 142, 255, 186, 138],
        [5, 104, 138, 186, 198, 190, 196, 250, 218, 184],
        [14, 124, 158, 200, 184, 202, 220, 232, 232, 230],
        [40, 128, 162, 206, 176, 200, 222, 226, 232, 238],
    ];
    // What the hour does to the land: a colour laid over it, [r, g, b, alpha].
    // Snow takes the sky's colour, so the night is blue, not black.
    const WASH = [
        [-18, 16, 28, 78, 0.7],
        [-10, 22, 34, 88, 0.66],
        [-5, 62, 58, 124, 0.5],
        [-1, 150, 96, 128, 0.32],
        [2, 255, 150, 100, 0.2],
        [7, 255, 186, 130, 0.12],
        [14, 255, 214, 170, 0.05],
        [30, 255, 236, 210, 0],
    ];
    const CLOUD = [
        [-18, 40, 50, 90, 20, 28, 58],
        [-8, 92, 84, 130, 44, 44, 86],
        [-2, 255, 160, 138, 124, 84, 116],
        [4, 255, 208, 170, 196, 160, 160],
        [12, 250, 240, 228, 196, 200, 212],
        [30, 252, 252, 252, 200, 206, 218],
    ];

    function light(sunAlt, moonLight = 0) {
        const lift = smooth(-6, -14, sunAlt) * moonLight;      // a moonlit night on snow is bright
        const sky = ramp(SKY, sunAlt), wash = ramp(WASH, sunAlt), cloud = ramp(CLOUD, sunAlt);
        const up = [20, 30, 54];
        return {
            top: [0, 1, 2].map(i => sky[i] + up[i] * lift * 0.6),
            mid: [0, 1, 2].map(i => sky[3 + i] + up[i] * lift),
            horizon: [0, 1, 2].map(i => sky[6 + i] + up[i] * lift * 1.2),
            wash: [wash[0] + 14 * lift, wash[1] + 18 * lift, wash[2] + 22 * lift, wash[3] * (1 - 0.3 * lift)],
            cloudLit: [0, 1, 2].map(i => cloud[i] + 50 * lift),
            cloudShade: [0, 1, 2].map(i => cloud[3 + i] + 26 * lift),
            stars: smooth(-4, -12, sunAlt),
            dark: smooth(6, -7, sunAlt),                           // 0 by day, 1 at night: windows, lights, fires
            twilight: Math.max(0, 1 - Math.abs(sunAlt - 1) / 9),
        };
    }

    // ---- Calendar -------------------------------------------------------------
    // Where `date` is in the season: how much of the town is decorated when
    // it decorates day by day (a quarter on the 1st of December, all of it
    // by Christmas Eve), and the days that matter.
    function season(date) {
        const m = date.getMonth(), d = date.getDate();
        const year = m === 0 && d <= 6 ? date.getFullYear() - 1 : date.getFullYear();
        const daysTo = Math.round((Date.UTC(year, 11, 25) - Date.UTC(date.getFullYear(), m, d)) / 864e5);
        const december = m === 11;
        return {
            daysTo,
            advent: december && d <= 24 ? 0.25 + 0.75 * (d - 1) / 23 : m === 10 && d >= 20 ? 0.25 : 1,
            eve: december && d === 24,
            day: december && d === 25,
            newYear: (december && d === 31) || (m === 0 && d === 1),
        };
    }

    // A window: lit once it's dark enough for the people behind it (`dusk`,
    // against the light's `dark`), until their bedtime; again when they get
    // up before dawn. Hours run noon to noon (25 is one in the morning). On
    // Christmas Eve everybody stays up.
    function windowLit(win, hour, dark, eve) {
        if (dark <= win.dusk) return false;
        const h = hour < 12 ? hour + 24 : hour;
        return h < win.bed + (eve ? 2.5 : 0) || h >= win.rise;
    }
    function windowHabits(random) {
        const owl = random() < 0.12;
        return { dusk: 0.12 + random() * 0.6, bed: owl ? 40 : 21.6 + random() * 3.6, rise: 29.4 + random() * 1.8 };
    }

    // ---- Layout ---------------------------------------------------------------
    // Fractal value noise along x, for ridgelines: 0..1.
    function noise1(random, n = 64) {
        const table = Array.from({ length: n + 1 }, () => random());
        const at = x => {
            const i = Math.floor(x), f = x - i, a = table[((i % n) + n) % n], b = table[(((i + 1) % n) + n) % n];
            return a + (b - a) * f * f * (3 - 2 * f);
        };
        return x => (at(x) * 0.5 + at(x * 2.1 + 7.3) * 0.26 + at(x * 4.3 + 3.1) * 0.15 + at(x * 9.7 + 1.7) * 0.09);
    }

    const STYLES = {
        cape: { w: 92, weight: 3 },
        colonial: { w: 106, weight: 3 },
        saltbox: { w: 86, weight: 2 },
        gable: { w: 70, weight: 2 },
        store: { w: 98, weight: 0 },
        inn: { w: 124, weight: 0 },
    };

    // Where everything stands, for a window W × H whose bottom `bottom`
    // pixels are the host's. Everything is in CSS pixels.
    function layout(W, H, bottom, config, random) {
        const Hu = H - bottom;
        const portrait = W < Hu * 0.85;
        const s = clamp(Math.min(Hu / 780, W / 600), 0.42, 2.6) * (config.scale || 1);
        const hz = Hu * config.horizon;
        const L = { W, H, Hu, s, portrait, hz };

        // Two ranges. The near one rises to a shoulder where the cabin sits.
        const cabinX = W * (portrait ? 0.76 : 0.83);
        const peak = (x, at, width, height) => height * Math.exp(-(((x - at) / width) ** 2));
        const nFar = noise1(random), nNear = noise1(random);
        // Ridged noise: crests and saddles rather than rolling humps.
        const crag = (n, x) => 1 - Math.abs(2 * n(x) - 1);
        L.farRidge = x => hz - Hu * (0.1 + 0.075 * crag(nFar, x / (260 * s) + 3) + 0.02 * nFar(x / (40 * s))) - Hu * (peak(x, W * 0.36, W * 0.2, 0.15) + peak(x, W * 0.98, W * 0.2, 0.07));
        L.nearRidge = x => hz - Hu * (0.03 + 0.05 * crag(nNear, x / (230 * s) + 11) + 0.012 * nNear(x / (36 * s))) - Hu * (peak(x, cabinX + W * 0.03, W * (portrait ? 0.3 : 0.2), 0.16) + peak(x, W * 0.08, W * 0.2, 0.1));
        const ridgeAtCabin = L.nearRidge(cabinX);
        L.cabin = config.cabin ? { x: cabinX, y: lerp(ridgeAtCabin, hz, 0.56), k: 0.52 * s } : null;

        // The village: a back street and a front street, with the green between
        // the two halves of the front one, the church behind it.
        const backY = hz + Hu * 0.13, streetY = hz + Hu * (portrait ? 0.235 : 0.215);
        const kBack = portrait ? 0.74 : 0.86, kFront = portrait ? 1.02 : 1.32;
        const vx0 = W * (portrait ? 0.02 : 0.315), vx1 = W * (portrait ? 0.98 : 0.99);
        const gx = W * (portrait ? 0.5 : 0.625), gw = portrait ? W * 0.17 : Math.max(108 * s, W * 0.092);
        Object.assign(L, { backY, streetY, kBack, kFront, vx0, vx1 });
        L.green = { x: gx, y: streetY + 6 * s, w: gw };
        L.church = config.village && config.church ? { x: gx + gw * (portrait ? 0.9 : 0.5), y: backY + Hu * (portrait ? 0.03 : 0.05), k: (portrait ? 0.95 : 1.12) * s } : null;
        L.gazebo = config.village && config.gazebo && !portrait ? { x: gx - gw * 0.66, y: streetY + 36 * s, k: 1.2 * s } : null;
        L.townTree = config.village ? { x: gx - gw * (portrait ? 0 : 0.06), y: streetY + 46 * s, k: 1 } : null;

        L.houses = [];
        if (config.village) {
            const kinds = Object.keys(STYLES).filter(name => STYLES[name].weight);
            const pick = () => {
                let r = random() * kinds.reduce((sum, name) => sum + STYLES[name].weight, 0);
                for (const name of kinds) { r -= STYLES[name].weight; if (r <= 0) return name; }
                return kinds[0];
            };
            const fill = (a, b, y, k, row, list) => {
                let x = a + random() * 12 * s * k;
                for (;;) {
                    const style = list.length ? list.shift() : pick();
                    const w = STYLES[style].w * s * k;
                    if (x + w > b) break;
                    L.houses.push({ x: x + w / 2, y: y + (random() - 0.5) * 5 * s * k, w, k: s * k, style, row, tint: Math.floor(random() * 1e6), flip: random() < 0.5 });
                    x += w + (8 + random() * 16) * s * k;
                }
            };
            // The front street first (it's the one people look at), then the back.
            fill(vx0, gx - gw, streetY, kFront, 'front', ['store']);
            fill(gx + gw, vx1, streetY, kFront, 'front', portrait ? ['gable', 'cape'] : ['inn']);
            const cx = L.church ? L.church.x : gx, churchHalf = L.church ? 40 * L.church.k : 0;
            fill(vx0 + 20 * s, cx - churchHalf - 6 * s, backY, kBack, 'back', []);
            fill(cx + churchHalf * 1.7 + 6 * s, vx1 - 10 * s, backY, kBack, 'back', []);
            // No more than asked for: drop back-street houses first, then the ends of the front.
            const order = [...L.houses.filter(h => h.row === 'back'), ...L.houses.filter(h => h.row === 'front' && h.style !== 'store').sort((p, q) => Math.abs(q.x - gx) - Math.abs(p.x - gx))];
            while (L.houses.length > config.houses && order.length) L.houses.splice(L.houses.indexOf(order.shift()), 1);
        }

        // The covered bridge, where the brook comes down to the pond: wide screens only.
        L.bridge = config.village && config.bridge && !portrait && W > 760 * s ? { x: W * 0.95, y: streetY + 62 * s, k: 1.25 * s } : null;

        // The pond, in front of the green.
        const rx = portrait ? W * 0.43 : Math.min(W * 0.25, Hu * 0.6), ry = Math.min(rx * (portrait ? 0.34 : 0.25), Hu * 0.092);
        const pondY = portrait ? Hu * 0.79 : Hu * 0.835;
        L.pond = config.pond ? { cx: W * (portrait ? 0.5 : 0.565), cy: pondY, rx, ry } : null;
        const bank = L.pond || { cx: W * 0.56, cy: pondY, rx, ry };
        L.hut = config.pond && config.hut ? { x: bank.cx + bank.rx * (portrait ? 0.56 : 1.0), y: bank.cy - bank.ry * (portrait ? 1.3 : 0.92), k: 1.3 * s } : null;
        L.fire = config.pond && config.bonfire ? { x: bank.cx - bank.rx * (portrait ? 0.66 : 1.02), y: bank.cy - bank.ry * (portrait ? 1.16 : 0.62), k: 1.4 * s } : null;

        // The tree farm, on its hillside: rows running away up the slope.
        if (config.farm) {
            const x0 = W * (portrait ? 0 : 0.012), x1 = W * (portrait ? 0.56 : 0.295);
            const y0 = hz + Hu * 0.035, y1 = portrait ? backY - Hu * 0.015 : streetY + Hu * 0.02;
            const rows = [];
            const count = clamp(Math.round(config.farmRows), 2, 7);
            for (let i = 0; i < count; i++) {
                const t = count === 1 ? 1 : i / (count - 1), y = lerp(y0 + Hu * 0.012, y1, t ** 1.25), k = lerp(0.42, portrait ? 0.7 : 1, t) * s;
                const gap = 25 * k, trees = [];
                for (let x = x0 + gap * (0.5 + 0.5 * (i % 2)); x < x1 - gap * 0.6 - (i >= count - 2 ? 96 * s : 0); x += gap) trees.push({ x: x + (random() - 0.5) * gap * 0.16, size: 0.72 + random() * 0.5, v: Math.floor(random() * 4) });
                rows.push({ y, k, trees });
            }
            L.farm = { x0, x1, y0, y1, rows, barn: { x: x1 - 40 * s, y: y1 + 2 * s, k: (portrait ? 0.7 : 1.05) * s } };
        } else L.farm = null;

        // The sledding hill: down the near slope below the farm.
        L.sled = config.sledders > 0 ? (portrait
            ? { x0: W * 0.04, y0: streetY + Hu * 0.075, x1: W * 0.36, y1: streetY + Hu * 0.16 }
            : { x0: W * 0.035, y0: streetY + Hu * 0.07, x1: W * 0.24, y1: streetY + Hu * 0.2 }) : null;

        // The ground the villagers keep to: the street, and the path round the pond.
        L.walkY = streetY + 15 * s;
        L.bankY = bank.cy + bank.ry + 20 * s;
        L.depth = y => clamp(lerp(0.74, 1.75, (y - backY) / (Hu - backY)), 0.4, 1.8) * s;
        return L;
    }

    // ---- The ice ----------------------------------------------------------------
    // How far out (x, y) is on the pond: 0 at the middle, 1 at the edge.
    const pondR = (pond, x, y) => Math.hypot((x - pond.cx) / pond.rx, (y - pond.cy) / pond.ry);

    // One step for a skater at (x, y) heading `a` (radians, in the pond's own
    // flattened space) who wants to be `want` of the way out, lapping `turn`
    // (+1 anticlockwise on screen, -1 the other way): the new heading. It
    // curves round the middle, and turns in before the edge, always.
    function skate(pond, x, y, a, want, turn, dt, agility = 1.6) {
        const px = (x - pond.cx) / pond.rx, py = (y - pond.cy) / pond.ry;
        const r = Math.hypot(px, py), at = Math.atan2(py, px);
        // The heading that laps at this spot, leaning in or out to reach `want`.
        let inward = clamp((r - want) * 2.2, -0.9, 0.9);
        if (r > 0.9) inward = Math.max(inward, 0.25 + (r - 0.9) * 9);        // the edge: turn in, hard
        let d = at + turn * (Math.PI / 2 + inward) - a;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        return a + clamp(d, -agility * dt * (r > 0.9 ? 3 : 1), agility * dt * (r > 0.9 ? 3 : 1));
    }

    return { clamp, lerp, smooth, ramp, light, season, windowLit, windowHabits, noise1, STYLES, layout, pondR, skate };
})();
