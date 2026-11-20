// Painted Village's pure logic: where we stand (a camera, in metres), what
// the hour does to the light, and where everything is put for a screen of
// a given shape. No DOM in here, so tools/painted-village.test.mjs can run
// it in Node. The sun and moon come from harvest-sky.js, the calendar and
// the windows' hours from village-logic.js.

const PaintedLogic = (() => {
    const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
    const lerp = (a, b, t) => a + (b - a) * t;
    const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
    const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

    // ---- The camera -------------------------------------------------------------
    // We stand on the hill above the pond, the eye some way up, looking level
    // over the town. Depth is `z`: 1 at the bottom of the picture, growing
    // toward the horizon, `zm` metres to the unit. Ground at depth z is drawn
    // at sy(z); a thing standing there is sc(z) pixels to the metre. A screen
    // narrower than 16:9 stands higher (the same town, smaller); a phone held
    // upright gets its own arrangement (layout).
    function camera(W, H, bottom = 0, horizon = 0.34) {
        const Hu = H - bottom, aspect = W / Hu;
        const kind = aspect < 0.9 ? 'upright' : aspect > 2.15 ? 'panorama' : 'wide';
        const hor = Hu * (kind === 'upright' ? horizon - 0.08 : horizon), f = Hu - hor, u = Hu / 900;
        const eye = kind === 'upright' ? 34 : 26 * clamp(1.74 / aspect, 1, 1.6);
        const ppm = f / eye, foc = 1100 * u, zm = eye * foc / f;
        const cam = { W, H, Hu, aspect, kind, hor, f, u, eye, ppm, zm };
        cam.sy = z => hor + f / z;
        cam.sc = z => ppm / z;
        cam.sx = (x, z) => W / 2 + x * ppm / z;
        cam.zAt = y => f / Math.max(1e-3, y - hor);                  // the depth of the ground drawn at row y
        cam.xAt = (px, z) => (px - W / 2) * z / ppm;                 // metres across, for a pixel at depth z
        cam.at = (frac, z) => (frac - 0.5) * W * z / ppm;            // metres across, for a share of the width
        cam.half = z => W / 2 * z / ppm;                             // how far to each side we can see at depth z
        cam.dz = m => m / zm;                                        // metres of depth, as depth
        cam.pt = (x, y, z) => [W / 2 + x * ppm / z, hor + f / z - y * ppm / z];
        return cam;
    }

    // ---- The light --------------------------------------------------------------
    // By the sun's altitude in degrees. Colours are 0..1. `sky` is five
    // stops, zenith to horizon; `amb` is the sky's light on everything;
    // `keyA` the low light from behind the steeple (the afterglow, and after
    // it the moon); `keyB` the day's sun over our left shoulder; `haze` the
    // colour far things dissolve into, away from the glow and near it;
    // `warm` how much a lamp counts against all that.
    const F = ['sky0', 'sky1', 'sky2', 'sky3', 'sky4', 'amb', 'keyA', 'keyB', 'haze0', 'haze1', 'glow', 'glowIn', 'cloudTop0', 'cloudTop1', 'cloudLow0', 'cloudLow1', 'ice', 'smoke0', 'smoke1', 'vignette'];
    const S = ['glowA', 'warm', 'veil'];
    const KEYS = [
        { alt: -18, sky0: [0.03, 0.06, 0.17], sky1: [0.05, 0.09, 0.24], sky2: [0.07, 0.12, 0.30], sky3: [0.12, 0.19, 0.40], sky4: [0.19, 0.27, 0.49],
            amb: [0.15, 0.20, 0.40], keyA: [0.06, 0.08, 0.16], keyB: [0, 0, 0], haze0: [0.10, 0.15, 0.34], haze1: [0.16, 0.22, 0.44],
            glow: [0.30, 0.38, 0.66], glowIn: [0.4, 0.5, 0.8], cloudTop0: [0.08, 0.11, 0.25], cloudTop1: [0.12, 0.17, 0.34], cloudLow0: [0.15, 0.20, 0.40], cloudLow1: [0.26, 0.33, 0.56],
            ice: [0.05, 0.08, 0.20], smoke0: [0.30, 0.36, 0.58], smoke1: [0.50, 0.58, 0.82], vignette: [0.36, 0.40, 0.62], glowA: 0, warm: 1.25, veil: 0 },
        { alt: -9, sky0: [0.08, 0.11, 0.29], sky1: [0.13, 0.16, 0.38], sky2: [0.22, 0.21, 0.46], sky3: [0.38, 0.29, 0.50], sky4: [0.56, 0.38, 0.48],
            amb: [0.30, 0.33, 0.60], keyA: [0.50, 0.30, 0.34], keyB: [0, 0, 0], haze0: [0.32, 0.30, 0.54], haze1: [0.60, 0.42, 0.52],
            glow: [0.86, 0.50, 0.44], glowIn: [0.95, 0.64, 0.50], cloudTop0: [0.16, 0.18, 0.40], cloudTop1: [0.30, 0.26, 0.48], cloudLow0: [0.36, 0.28, 0.48], cloudLow1: [0.72, 0.44, 0.46],
            ice: [0.12, 0.13, 0.28], smoke0: [0.44, 0.44, 0.66], smoke1: [0.78, 0.58, 0.62], vignette: [0.44, 0.44, 0.66], glowA: 0.55, warm: 1.15, veil: 0.08 },
        { alt: -3.5, sky0: [0.39, 0.44, 0.67], sky1: [0.56, 0.53, 0.73], sky2: [0.78, 0.59, 0.71], sky3: [0.93, 0.69, 0.64], sky4: [0.98, 0.83, 0.64],
            amb: [0.38, 0.42, 0.68], keyA: [0.95, 0.56, 0.46], keyB: [0, 0, 0], haze0: [0.66, 0.54, 0.72], haze1: [0.97, 0.76, 0.58],
            glow: [1, 0.84, 0.60], glowIn: [1, 0.95, 0.80], cloudTop0: [0.50, 0.50, 0.74], cloudTop1: [0.72, 0.60, 0.76], cloudLow0: [0.96, 0.66, 0.66], cloudLow1: [1, 0.84, 0.64],
            ice: [0.24, 0.25, 0.42], smoke0: [0.82, 0.78, 0.90], smoke1: [1, 0.86, 0.76], vignette: [0.56, 0.53, 0.71], glowA: 0.8, warm: 1.1, veil: 0.12 },
        { alt: 1.5, sky0: [0.44, 0.56, 0.80], sky1: [0.62, 0.66, 0.84], sky2: [0.84, 0.74, 0.78], sky3: [0.98, 0.80, 0.66], sky4: [1, 0.90, 0.66],
            amb: [0.66, 0.70, 0.92], keyA: [1.3, 0.86, 0.60], keyB: [0.50, 0.34, 0.22], haze0: [0.84, 0.74, 0.82], haze1: [1, 0.86, 0.66],
            glow: [1, 0.88, 0.62], glowIn: [1, 0.97, 0.84], cloudTop0: [0.62, 0.62, 0.80], cloudTop1: [0.84, 0.70, 0.78], cloudLow0: [1, 0.76, 0.68], cloudLow1: [1, 0.90, 0.70],
            ice: [0.36, 0.40, 0.56], smoke0: [0.88, 0.86, 0.94], smoke1: [1, 0.92, 0.82], vignette: [0.66, 0.64, 0.80], glowA: 0.9, warm: 0.5, veil: 0.16 },
        { alt: 7, sky0: [0.44, 0.61, 0.85], sky1: [0.58, 0.71, 0.89], sky2: [0.75, 0.80, 0.91], sky3: [0.90, 0.87, 0.86], sky4: [0.99, 0.93, 0.83],
            amb: [0.60, 0.68, 0.92], keyA: [0.2, 0.16, 0.12], keyB: [1.0, 0.74, 0.50], haze0: [0.80, 0.82, 0.92], haze1: [0.98, 0.92, 0.82],
            glow: [1, 0.94, 0.80], glowIn: [1, 0.98, 0.90], cloudTop0: [0.84, 0.86, 0.94], cloudTop1: [0.96, 0.90, 0.88], cloudLow0: [0.80, 0.78, 0.86], cloudLow1: [1, 0.90, 0.78],
            ice: [0.38, 0.46, 0.64], smoke0: [0.90, 0.90, 0.96], smoke1: [1, 0.96, 0.90], vignette: [0.72, 0.74, 0.86], glowA: 0.45, warm: 0.14, veil: 0.08 },
        { alt: 16, sky0: [0.40, 0.59, 0.85], sky1: [0.52, 0.69, 0.89], sky2: [0.66, 0.78, 0.92], sky3: [0.79, 0.86, 0.94], sky4: [0.89, 0.92, 0.96],
            amb: [0.60, 0.70, 0.92], keyA: [0, 0, 0], keyB: [0.92, 0.86, 0.72], haze0: [0.78, 0.84, 0.94], haze1: [0.84, 0.88, 0.95],
            glow: [1, 1, 1], glowIn: [1, 1, 1], cloudTop0: [0.98, 0.98, 1], cloudTop1: [1, 0.99, 0.97], cloudLow0: [0.76, 0.80, 0.88], cloudLow1: [0.82, 0.84, 0.90],
            ice: [0.40, 0.50, 0.68], smoke0: [0.92, 0.93, 0.97], smoke1: [0.98, 0.98, 1], vignette: [0.76, 0.78, 0.88], glowA: 0, warm: 0.08, veil: 0 },
    ];
    const MOON_KEY = [0.50, 0.64, 1.05], MOON_AMB = [0.08, 0.11, 0.18], MOON_SKY = [0.05, 0.07, 0.11];

    function light(sunAlt, moonLight = 0) {
        let i = 1;
        while (i < KEYS.length - 1 && sunAlt > KEYS[i].alt) i++;
        const a = KEYS[i - 1], b = KEYS[i], t = clamp((sunAlt - a.alt) / (b.alt - a.alt));
        const out = {};
        for (const k of F) out[k] = mix(a[k], b[k], t);
        for (const k of S) out[k] = lerp(a[k], b[k], t);
        // A moonlit night on snow is bright, and blue.
        const lift = smooth(-5, -13, sunAlt) * moonLight;
        out.keyA = out.keyA.map((v, j) => v + MOON_KEY[j] * lift);
        out.amb = out.amb.map((v, j) => v + MOON_AMB[j] * lift);
        for (const k of ['sky0', 'sky1', 'sky2', 'sky3', 'sky4', 'haze0', 'haze1']) out[k] = out[k].map((v, j) => v + MOON_SKY[j] * lift);
        out.moon = lift;
        out.stars = smooth(-4, -12, sunAlt);
        out.dark = smooth(6, -7, sunAlt);                            // 0 by day, 1 at night: windows, lamps, fires
        out.alt = sunAlt;
        return out;
    }
    // The light as the few numbers a repaint depends on, in steps of `step` in 255.
    function lightKey(l, step = 4) {
        const q = v => Math.round(v * 255 / step);
        return [...F.flatMap(k => l[k].map(q)), ...S.map(k => q(l[k])), q(l.stars)].join(',');
    }

    // ---- What is where ----------------------------------------------------------
    // Everything is in metres across (x, 0 under the middle of the picture)
    // and depth units (z). The town is in rows: the pond nearest (z 1.2 to
    // 1.75), the green and its tree, the street (2.5), the front row of
    // houses (2.75), the meetinghouse and the back rows, the tree farm up
    // the left, then woods and the mountain. Moving things keep to lanes;
    // what stands still stands just nearer than one of BANDS, so that
    // whoever walks behind it is hidden by it (the bands are the depths at
    // which the picture is cut into "everything nearer than this").
    const BANDS = [1.17, 1.79, 2.12, 2.44, 2.95, 3.45];
    const STREET = 2.5, ROW = 2.75;

    function layout(cam, config, random) {
        const L = { kind: cam.kind, things: [], lamps: [], nodes: {}, edges: [], bands: BANDS };
        const on = key => config[key] !== false;
        const add = (kind, x, z, o = {}) => { const t = { kind, x, z, ...o }; L.things.push(t); return t; };
        const node = (name, x, z, o = {}) => { L.nodes[name] = { name, x, z, ...o }; };
        const edge = (...names) => { for (let i = 1; i < names.length; i++) if (L.nodes[names[i - 1]] && L.nodes[names[i]]) L.edges.push([names[i - 1], names[i]]); };
        const village = on('village'), up = cam.kind === 'upright', dz = cam.dz;
        const edgeX = z => cam.half(z) + 2.5, seen = (x, w, z) => Math.abs(x) - w / 2 < cam.half(z) - 2;
        const house = (x, z, style, w, tint) => add('house', x, z, { style, w, tint, side: x < 0 ? 1 : -1 });
        const door = (name, t, o = {}) => { if (t) node(name, t.x, t.z - dz(1.6), { door: true, at: t, ...o }); };
        const size = config.townTreeSize || 1;
        L.glow = { x: up ? 0.5 : 0.5, y: cam.hor - 150 * Math.min(cam.u, cam.hor / 300) };
        if (on('cabin')) add('cabin', 0, 0, { fx: up ? 0.74 : 0.83, up: up ? 84 : 62 });

        if (up) {
            // A phone held upright: the pond across the bottom, the tree and
            // the store over it, the meetinghouse up the middle, the farm
            // climbing the hill behind.
            L.pond = on('pond') ? { wob: 2.5, line: [[1.79, 0, 2], [1.74, 0, 9], [1.6, 0, 13.4], [1.42, 0, 14.2], [1.28, 0, 13], [1.19, 0, 8], [1.16, 0, 1.5]], rink: { x: 0, rx: 11.5, z0: 1.21, z1: 1.71 } } : null;
            let store = null, home = null, church = null;
            if (village) {
                store = add('store', -20.5, ROW, { w: 10, side: 1 });
                home = house(20.5, ROW + 0.02, 'colonial', 11, 0);
                if (on('church')) church = add('church', 2, 3.5, {});
                house(-34, 3.75, 'saltbox', 9, 4); house(-16.5, 3.92, 'colonial', 10.5, 1); house(22, 3.78, 'cape', 9.5, 5); house(37, 3.95, 'colonial', 10.5, 2);
                house(16, 5.0, 'cape', 9.5, 3); house(46, 4.9, 'saltbox', 9, 1); house(-6, 5.15, 'colonial', 10.5, 4); house(31, 6.1, 'cape', 9.5, 2);
                if (on('townTree')) add('grandTree', 6, 2.06, { h: 16 * size });
                if (on('lamps')) L.lamps.push({ x: -11.5, z: 2.4 }, { x: 13.5, z: 2.4 }, { x: -13.4, z: 1.77 }, { x: 8.5, z: 1.77 });
                if (on('cocoa') && L.pond) add('cocoaHut', 14.6, 1.76, { w: 4.6 });
            }
            if (on('treeFarm')) { add('treeFarm', 0, 0, { z0: 4.5, z1: 8.2, x0: -70, x1: -22, spread: 22, slant: 5 }); add('barn', -33, 4.42, { w: 9, side: 1 }); }
            if (on('snowman')) add('snowman', -8.5, 2.03);
            if (on('bonfire') && L.pond) add('bonfire', -11.8, 1.66);
            for (const [x, z, h] of [[-30, 3.2, 11], [-6, 3.3, 10], [32, 3.25, 11], [-26, 4.6, 10], [6, 4.5, 10], [38, 4.6, 11], [-44, 3.5, 11], [50, 3.6, 11]]) add('frostTree', x, z, { h });
            for (const [x, z, h] of [[-31, 2.9, 9], [31, 2.92, 9.5], [12, 3.05, 8], [-44, 4.3, 9], [58, 4.4, 10], [3, 5.6, 9], [44, 5.6, 9]]) add('fir', x, z, { h });
            add('fir', cam.at(0.085, 1.07), 1.07, { h: 6.6, near: true, lit: true, mice: on('mice') });
            add('fir', cam.at(0.925, 1.1), 1.1, { h: 5.8, near: true, lit: true });
            add('railFence', 0, 0, { from: [cam.at(0.0, 2.2) - 1, 2.2], to: [-14.5, 2.16], cardinal: on('cardinal'), rabbits: on('rabbits') });
            node('west', -edgeX(STREET), STREET, { exit: true }); node('storeF', -20.5, STREET); node('green', -3, STREET); node('houseF', 20.5, STREET); node('east', edgeX(STREET), STREET, { exit: true });
            door('store', store); door('house', home); if (church) { node('lych', 2.5, 2.98); door('church', church, { quiet: true }); }
            node('tree', -1.5, 2.15, { linger: on('townTree') && village }); node('snow', -9.5, 2.2); node('fire', -8.6, 1.76, { linger: on('bonfire') && !!L.pond });
            node('pondN', -1, 1.9); node('cocoa', 11.5, 1.86, { linger: on('cocoa') && village && !!L.pond });
            edge('west', 'storeF', 'green', 'houseF', 'east'); edge('storeF', 'store'); edge('houseF', 'house'); edge('green', 'lych', 'church');
            edge('green', 'tree', 'snow', 'fire'); edge('tree', 'pondN', 'cocoa', 'houseF'); edge('snow', 'pondN');
            L.road = { z: STREET - dz(1), x0: -edgeX(STREET) - 6, x1: edgeX(STREET) + 6 };
            return finish(L, cam, config);
        }

        // Wide: the pond right of the middle at our feet, the grand tree on
        // the green above it, the store and the inn left of the tree, the
        // meetinghouse behind it, more houses right and the covered bridge
        // beyond them; the tree farm and its barn up the left, the sledding
        // hill under it. Wider than 2:1, the street carries on both ways.
        L.pond = on('pond') ? { wob: 5, line: [[1.79, 4, 3], [1.75, 4, 19], [1.6, 4, 29], [1.42, 4, 30], [1.27, 5, 25], [1.19, 6, 13], [1.16, 6, 2]], rink: { x: 4, rx: 25, z0: 1.21, z1: 1.72 } } : null;
        // The brook that leaves it, under the bridge and away up the valley.
        if (L.pond) L.brook = [[33, 1.5, 2.6], [49, 1.76, 2.2], [60, 2.1, 2.0], [66.3, 2.46, 1.8], [72, 3.0, 1.6], [86, 3.7, 1.4], [110, 4.6, 1.2]];
        let store = null, inn = null, home = null, cape = null, church = null, barn = null;
        if (village) {
            store = add('store', -27.5, ROW, { w: 11, side: 1 });
            inn = house(-7.5, ROW + 0.03, 'inn', 13.5, 3);
            home = house(40, ROW + 0.01, 'colonial', 11, 0);
            cape = house(55.5, ROW + 0.05, 'cape', 9.5, 2);
            add('picketFence', 0, ROW - 0.075, { from: 33.4, to: 46.6, gate: 40 });
            if (on('church')) church = add('church', 37, 3.5, {});
            // The back rows, and the houses up the hill.
            house(-51, 3.72, 'saltbox', 9, 4); house(-33.5, 3.92, 'colonial', 10.5, 1); house(-15.5, 3.76, 'cape', 9.5, 5); house(3.5, 3.95, 'colonial', 10.5, 2);
            house(53, 3.74, 'cape', 9.5, 3); house(69, 3.92, 'colonial', 10.5, 4); house(87, 3.72, 'saltbox', 9, 1);
            house(-24, 5.0, 'cape', 9.5, 0); house(-2, 5.3, 'saltbox', 9, 3); house(42, 5.1, 'colonial', 10.5, 5); house(66, 5.3, 'cape', 9.5, 0); house(96, 5.0, 'saltbox', 9, 2);
            if (on('bridge') && L.brook) add('bridge', 66.3, 2.4, { len: 15 });
            if (on('townTree')) add('grandTree', 13, 2.06, { h: 18 * size });
            if (on('bandstand')) add('bandstand', 1.5, 2.3);
            add('townSign', -19.5, 2.2);
            if (on('lamps')) L.lamps.push({ x: -40.5, z: 2.4 }, { x: -17.5, z: 2.4 }, { x: 27, z: 2.4 }, { x: 47.5, z: 2.4 }, { x: -13, z: 1.77 }, { x: 24.5, z: 1.77 });
            if (on('cocoa') && L.pond) add('cocoaHut', 36.5, 1.76, { w: 5.2 });
            if (L.pond) add('bench', 27.5, 1.83);
            // The rest of the street, for whoever has the room to see it.
            const more = [[90, ROW + 0.04, 'saltbox', 9, 3], [106, ROW, 'colonial', 10.5, 1], [-128, ROW + 0.02, 'cape', 9.5, 2], [124, ROW + 0.05, 'cape', 9.5, 4], [-144, ROW, 'saltbox', 9, 0], [142, ROW + 0.02, 'inn', 13, 5], [-161, ROW + 0.04, 'colonial', 10.5, 3]];
            for (const [x, z, style, w, tint] of more) if (seen(x, w, z)) { house(x, z, style, w, tint); if (on('lamps')) L.lamps.push({ x: x + (x < 0 ? 9 : -9), z: 2.4 }); }
            for (const [x, z, style, w, tint] of [[108, 3.9, 'cape', 9.5, 0], [128, 3.74, 'colonial', 10.5, 2], [150, 3.9, 'saltbox', 9, 4], [172, 3.76, 'cape', 9.5, 1], [118, 5.2, 'colonial', 10.5, 3], [146, 5.0, 'cape', 9.5, 5]]) if (seen(x, w, z)) house(x, z, style, w, tint);
        }
        if (on('treeFarm')) { add('treeFarm', 0, 0, { z0: 2.68, z1: 5.7, x0: -116, x1: -61, spread: 30, slant: 26 }); barn = add('barn', -51, ROW + 0.03, { w: 10, side: 1 }); add('railFence', 0, 0, { from: [-118, 2.62], to: [-61, 2.62], snowy: true }); }
        if (on('sledders') && config.sledders !== 0) add('sledHill', -36, 2.0, { w: 40, h: 5 });
        if (on('snowman')) add('snowman', -6.5, 2.03);
        if (on('bonfire') && L.pond) add('bonfire', -22, 1.62);
        for (const [x, z, h] of [[-40, 3.25, 11], [-21, 3.3, 10], [12, 3.28, 11], [47, 3.25, 11], [76, 3.3, 12], [-4, 4.55, 10], [37, 4.6, 11], [-42, 4.5, 10], [58, 4.55, 10], [98, 3.3, 11], [80, 4.6, 11], [-64, 3.2, 10], [118, 3.3, 11], [-98, 3.3, 11], [140, 4.5, 11], [-124, 3.25, 11], [160, 3.3, 11]]) {
            if (Math.abs(x) < cam.half(z) + 6 && !(on('treeFarm') && x < -58 && x > -124)) add('frostTree', x, z, { h });
        }
        for (const [x, z, h] of [[-37.5, 2.93, 9], [-17.5, 2.96, 8.5], [48.5, 2.93, 9], [62, 2.97, 10], [21, 4.4, 9], [-11, 4.45, 9], [78, 3.05, 9], [94, 3.9, 10], [-60, 4.3, 9], [50, 4.5, 9], [10, 5.6, 9], [-36, 5.6, 9], [84, 5.6, 10], [-84, 2.93, 9.5], [100, 2.93, 9], [116, 2.96, 10], [-120, 2.95, 9]]) {
            if (Math.abs(x) < cam.half(z) + 4 && !(on('treeFarm') && x < -58 && x > -124)) add('fir', x, z, { h });
        }
        // The lit firs we look down between, in the bottom corners.
        for (const [fx, z, h, mice] of [[0.03, 1.08, 10.5, true], [0.11, 1.15, 9], [0.2, 1.3, 7.2], [0.895, 1.17, 8.4], [0.945, 1.08, 11], [0.985, 1.24, 7.6]]) add('fir', cam.at(fx, z), z, { h, near: true, lit: true, mice: !!mice && on('mice') });
        add('railFence', 0, 0, { from: [cam.at(0.0, 1.5) - 1, 1.5], to: [cam.at(0.0, 1.5) + 11, 1.62], cardinal: on('cardinal'), rabbits: on('rabbits') });

        // Where people walk. Doors are where they come from and go to; exits
        // are off the edges of the picture.
        node('west', -edgeX(STREET), STREET, { exit: true }); node('farmGate', -51, STREET); node('storeF', -27.5, STREET); node('innF', -7.5, STREET);
        node('green', 3, STREET); node('churchF', 29, STREET); node('houseF', 40, STREET); node('capeF', 55.5, STREET);
        node('roadW', 57.8, STREET); node('roadE', 74.8, STREET); node('east', edgeX(STREET), STREET, { exit: true });
        door('barn', barn, { quiet: true }); door('store', store); door('inn', inn); door('house', home); door('cape', cape);
        if (church) { node('lych', 30.5, 3.0); door('church', church, { quiet: true }); }
        node('farm', -66, 3.05, { linger: on('treeFarm') });
        node('snow', -10.5, 2.17); node('band', -3.5, 2.2, { linger: on('bandstand') && village }); node('tree', 5.5, 2.15, { linger: on('townTree') && village });
        node('fire', -19.6, 1.7, { linger: on('bonfire') && !!L.pond }); node('bank', -28.5, 1.5); node('low', -23, 1.2); node('near', -10, 1, { exit: true });
        node('pondW', -13.5, 1.9); node('pondN', 9, 1.9); node('cocoa', 32, 1.85, { linger: on('cocoa') && village && !!L.pond }); node('pondE', 34, 2.0);
        edge('west', 'farmGate', 'storeF', 'innF', 'green', 'churchF', 'houseF', 'capeF', 'roadW', 'roadE', 'east');
        edge('farmGate', 'barn'); edge('farmGate', 'farm'); edge('storeF', 'store'); edge('innF', 'inn'); edge('houseF', 'house'); edge('capeF', 'cape'); edge('churchF', 'lych', 'church');
        edge('innF', 'snow', 'fire', 'bank', 'low', 'near'); edge('snow', 'pondW', 'pondN', 'cocoa', 'pondE', 'houseF');
        edge('green', 'band', 'tree', 'pondN'); edge('snow', 'band');
        L.road = { z: STREET - dz(1), x0: -edgeX(STREET) - 6, x1: edgeX(STREET) + 6 };
        return finish(L, cam, config);
    }

    function finish(L, cam, config) {
        // The pond's two banks, far to near, in metres and depth.
        if (L.pond) {
            const left = [], right = [], line = L.pond.line, wob = L.pond.wob || 1;
            for (let i = 0; i < line.length - 1; i++) for (let t = 0; t < 1; t += 0.125) {
                const a = line[i], b = line[i + 1], e = t * t * (3 - 2 * t);
                const z = a[0] + (b[0] - a[0]) * t, x = a[1] + (b[1] - a[1]) * e, hw = a[2] + (b[2] - a[2]) * e;
                const w = wob * Math.min(1, hw / 8) * (0.25 * Math.sin(z * 43) + 0.15 * Math.sin(z * 97));
                left.push([x - hw + w, z]); right.push([x + hw + w * 0.6, z]);
            }
            L.pond.left = left; L.pond.right = right;
            // The rink, as an ellipse in metres both ways, for VillageLogic.skate.
            const r = L.pond.rink;
            r.z = (r.z0 + r.z1) / 2;
            r.ellipse = { cx: r.x, cy: r.z * cam.zm, rx: r.rx, ry: (r.z1 - r.z0) / 2 * cam.zm };
        }
        // Whoever is asked for at most: the houses furthest up the hill are first to go.
        const cap = Math.max(0, Math.round(config.houses ?? 99));
        const houses = L.things.filter(t => t.kind === 'house').sort((a, b) => a.z - b.z || Math.abs(a.x) - Math.abs(b.x));
        for (const h of houses.slice(cap)) L.things.splice(L.things.indexOf(h), 1);
        // A door nobody lives behind is no door.
        for (const n of Object.values(L.nodes)) if (n.door && n.at && !L.things.includes(n.at)) n.door = false;
        L.things.sort((a, b) => b.z - a.z);
        L.tree = L.things.find(t => t.kind === 'grandTree') || null;
        return L;
    }

    // The band a mover at depth z hides behind: the last one not beyond it, or -1.
    function bandOf(z, bands = BANDS) { let k = -1; for (let i = 0; i < bands.length; i++) if (bands[i] <= z) k = i; return k; }

    // ---- Brushwork, the part that is arithmetic ---------------------------------
    // How a place stands is kept in one byte of a plate: the kinds are spaced
    // so that an edge blended between two of them is seldom a third.
    const CLS = { GROUND: 0, TOP: 37, UP: 83, SIDEL: 127, SIDER: 167, TOPL: 199, TOPR: 229, SELF: 255 };
    const CODES = Object.values(CLS);
    const clsOf = byte => { let best = 0, d = 999; for (const c of CODES) { const e = Math.abs(c - byte); if (e < d) { d = e; best = c; } } return best; };
    // The row of a thing's foot, kept in a byte with most of its precision far away.
    const footByte = (foot, cam) => Math.round(255 * Math.sqrt(clamp((foot - cam.hor) / cam.f / 1.2)));
    const footOf = (byte, cam) => cam.hor + cam.f * 1.2 * (byte / 255) ** 2;
    // A stroke's direction, 0..π, in a byte; 255 means "follow the ground".
    const angByte = ang => ang == null ? 255 : Math.round((((ang % Math.PI) + Math.PI) % Math.PI) / Math.PI * 254);
    const angOf = byte => byte === 255 ? null : byte / 254 * Math.PI;

    // How far a stroke may run from pixel `i` of an RGBA albedo array `A`
    // (width `w`, height `h`) along (dx, dy): until the colour has changed by
    // more than `tol`, or the kind of surface (the green channel of `G`) is
    // another, or `max` is reached. In steps of `st`.
    function run(A, G, w, h, x, y, dx, dy, max, st, tol = 54) {
        const i = ((y | 0) * w + (x | 0)) * 4, r = A[i], g = A[i + 1], b = A[i + 2], c = G[i + 1];
        let l = 0;
        while (l < max) {
            const px = (x + dx * (l + st)) | 0, py = (y + dy * (l + st)) | 0;
            if (px < 0 || py < 0 || px >= w || py >= h) break;
            const q = (py * w + px) * 4;
            if (Math.abs(A[q] - r) + Math.abs(A[q + 1] - g) + Math.abs(A[q + 2] - b) > tol || G[q + 1] !== c) break;
            l += st;
        }
        return l;
    }

    return { clamp, lerp, smooth, mix, camera, light, lightKey, layout, bandOf, BANDS, CLS, clsOf, footByte, footOf, angByte, angOf, run };
})();
