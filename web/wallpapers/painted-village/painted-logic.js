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
    // We stand in the street, the eye a few metres up, looking level. Depth
    // is `z`: 1 at the bottom of the picture, growing toward the horizon,
    // `zm` metres to the unit. Ground at depth z is drawn at sy(z); a thing
    // standing there is sc(z) pixels to the metre. A screen narrower than
    // 16:9 stands further back (a higher eye, the same picture, smaller); a
    // phone held upright gets its own arrangement (layout).
    function camera(W, H, bottom = 0, horizon = 0.39) {
        const Hu = H - bottom, aspect = W / Hu;
        const kind = aspect < 0.9 ? 'upright' : aspect > 2.15 ? 'panorama' : 'wide';
        const hor = Hu * (kind === 'upright' ? horizon - 0.07 : horizon), f = Hu - hor, u = Hu / 900;
        const eye = kind === 'upright' ? 8.2 : 5 * clamp(1.74 / aspect, 1, 1.9);
        const ppm = f / eye, foc = 1900 * u, zm = eye * foc / f;
        const cam = { W, H, Hu, aspect, kind, hor, f, u, eye, ppm, zm };
        cam.sy = z => hor + f / z;
        cam.sc = z => ppm / z;
        cam.sx = (x, z) => W / 2 + x * ppm / z;
        cam.zAt = y => f / Math.max(1e-3, y - hor);                  // the depth of the ground drawn at row y
        cam.xAt = (px, z) => (px - W / 2) * z / ppm;                 // metres across, for a pixel at depth z
        cam.at = (frac, z) => (frac - 0.5) * W * z / ppm;            // metres across, for a share of the width
        cam.half = z => W / 2 * z / ppm;                             // how far to each side we can see at depth z
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
    const MOON_KEY = [0.80, 1.0, 1.6], MOON_AMB = [0.11, 0.15, 0.24], MOON_SKY = [0.05, 0.07, 0.11];

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
    // and depth units (z). Moving things keep to lanes; what stands still
    // stands just nearer than one of BANDS, so that whoever walks behind it
    // is hidden by it (the bands are the depths at which the picture is cut
    // into "everything nearer than this").
    const BANDS = [1.3, 2.55, 3.12, 4.36, 6.2];

    function layout(cam, config, random) {
        const L = { kind: cam.kind, things: [], lamps: [], nodes: {}, edges: [], doors: [], bands: BANDS };
        const on = key => config[key] !== false;
        const add = (kind, x, z, o = {}) => { const t = { kind, x, z, ...o }; L.things.push(t); return t; };
        const node = (name, x, z, o = {}) => { L.nodes[name] = { name, x, z, ...o }; };
        const edge = (...names) => { for (let i = 1; i < names.length; i++) L.edges.push([names[i - 1], names[i]]); };
        const village = on('village');

        if (cam.kind === 'upright') {
            // A lane climbing from the bottom edge between two houses to the
            // meetinghouse, the grand tree where it widens, a corner of ice.
            L.glow = { x: 0.5, y: cam.hor - 26 * cam.u };
            if (village && on('church')) add('church', 0, 12.5, { rise: 20 });
            L.pond = on('pond') ? { line: [[2.6, 6.2, 0.6], [2.1, 5.0, 2.2], [1.6, 4.6, 3.4], [1.2, 4.6, 3.9], [0.95, 4.8, 4.0], [0.8, 5.0, 4.0]], rink: { x: 4.6, z: 1.45, rx: 2.4, z0: 1.12, z1: 1.9 } } : null;
            if (village) {
                add('store', -7.4, 3.0, { w: 8.5, side: 1 });
                add('house', 7.6, 3.4, { style: 'colonial', w: 9, side: -1, tint: 0 });
                add('house', -7.8, 5.6, { style: 'cape', w: 8, side: 1, tint: 1 });
                add('house', 8.4, 6.4, { style: 'saltbox', w: 8, side: -1, tint: 2 });
                if (on('townTree')) add('grandTree', -0.4, 4.3, { h: 8.5 * (config.townTreeSize || 1) });
                if (on('lamps')) { L.lamps.push({ x: -2.6, z: 3.08 }, { x: 3.4, z: 2.5 }, { x: 2.8, z: 6.1 }); }
                for (const [x, z, rise] of [[-5, 9, 60], [6.5, 9.6, 70], [-11, 8.4, 40], [13, 8.2, 44]]) add('farHouse', x, z, { rise });
            }
            if (on('snowman')) add('snowman', -3.4, 2.5);
            if (on('bonfire') && L.pond) add('bonfire', 1.2, 1.72);
            for (const [x, z, h] of [[-9.5, 4.4, 11], [10.5, 5.0, 12], [-3.6, 7.4, 10], [4.6, 7.8, 11], [-12, 7, 11], [12.5, 7.4, 12]]) add('frostTree', x, z, { h });
            for (const [x, z, h] of [[-11.5, 6.6, 9], [11.8, 4.2, 9.5], [-4.6, 10.5, 8], [9, 11, 8]]) add('fir', x, z, { h });
            add('fir', cam.at(0.02, 1.24), 1.24, { h: 8.2, near: true, mice: on('mice') });
            add('boughs', 0, 1, { side: 1 });
            add('railFence', 0, 0, { from: [cam.at(0.0, 1.06), 1.06], to: [-4.4, 2.2], cardinal: on('cardinal'), rabbits: on('rabbits') });
            node('store', -7.4, 2.5, { door: true }); node('lane0', -1.6, 2.5); node('lane1', -1.2, 3.3); node('house', 6.6, 3.2, { door: true });
            node('green', -1.8, 4.0); node('lane2', 0.8, 5.0); node('lane3', 0.6, 6.4); node('top', 0.4, 9.5, { exit: true });
            node('fire', -0.2, 1.74, { linger: true }); node('near', -2.2, 1.0, { exit: true });
            edge('store', 'lane0', 'lane1', 'green', 'lane2', 'lane3', 'top'); edge('lane1', 'house'); edge('lane0', 'fire', 'near');
            L.road = null;
            L.tree = L.things.find(t => t.kind === 'grandTree') || null;
            return finish(L, cam, config);
        }

        // Wide: the store and the green left of the middle, the meetinghouse
        // behind them against the glow, the covered bridge in the middle
        // distance, a house right, and the pond coming down to the bottom
        // edge right of the middle. Wider than 2:1, the street carries on out
        // both sides.
        const church = village && on('church') ? add('church', -24, 10, { rise: 14 }) : null;
        L.glow = { x: 0.5 + (church ? church.x * cam.sc(church.z) : -24 * cam.sc(10)) / cam.W, y: cam.hor - 30 * cam.u };
        L.pond = on('pond') ? { line: [[9, 5.5, 1.3], [6.5, 3.0, 1.8], [5.0, 1.6, 2.3], [4.3, 0.9, 2.6], [3.6, 0.9, 3.2], [3.0, 1.6, 4.2], [2.5, 2.5, 5.9], [2.0, 2.9, 6.6], [1.5, 2.6, 7.0], [1.15, 2.2, 6.4], [0.92, 1.9, 6.0], [0.78, 1.8, 5.8]],
            rink: { x: 2.8, z: 1.8, rx: 5.0, z0: 1.26, z1: 2.44 } } : null;
        if (village) {
            add('store', -14.5, 2.75, { w: 10, side: 1 });
            add('house', 14.8, 3.0, { style: 'colonial', w: 11, side: -1, tint: 0 });
            if (on('bridge')) add('bridge', 0.6, 4.3, { len: 16.5 });
            if (on('townTree')) add('grandTree', -4.3, 3.0, { h: 9.5 * (config.townTreeSize || 1) });
            for (const [x, z, rise, w] of [[6.5, 8.4, 92, 4], [15.5, 7.6, 84, 4.4], [-4.5, 9.2, 76, 3.6], [25, 8.2, 74, 4], [-12, 8.6, 44, 4], [34, 7, 50, 4.2], [-38, 7.4, 8, 4]]) add('farHouse', x, z, { rise, w });
            if (on('lamps')) L.lamps.push({ x: -8.4, z: 3.08 }, { x: 8.0, z: 3.08 }, { x: 11.6, z: 2.5 });
            add('picketFence', 0, 2.52, { from: 9.4, to: 21.5, gate: 14.8 });
            // The rest of the street, for whoever has the room to see it.
            const more = [['house', -27.5, 2.95, { style: 'inn', w: 13, side: 1, tint: 3 }], ['house', 27.5, 3.05, { style: 'cape', w: 9.5, side: -1, tint: 1 }], ['house', 39.5, 3.0, { style: 'saltbox', w: 9, side: -1, tint: 2 }],
                ['house', -41, 3.05, { style: 'colonial', w: 10.5, side: 1, tint: 4 }], ['house', 51, 3.05, { style: 'cape', w: 9.5, side: -1, tint: 5 }], ['house', -53, 3.0, { style: 'saltbox', w: 9, side: 1, tint: 1 }]];
            for (const [kind, x, z, o] of more) if (Math.abs(x) - o.w / 2 < cam.half(z) - 3) { add(kind, x, z, o); if (on('lamps')) L.lamps.push({ x: x + (x < 0 ? 8.2 : -8.2), z: 3.08 }); }
        }
        if (on('snowman')) add('snowman', 9.9, 2.5);
        if (on('bonfire') && L.pond) add('bonfire', -4.6, 2.0);
        if (on('cabin')) add('cabin', 0, 0, { fx: 0.81, up: 64 });
        for (const [x, z, h] of [[-9.6, 5.0, 12], [-1.2, 5.7, 11], [11.6, 5.6, 12], [21.5, 4.25, 13], [-21, 5.4, 11], [6.4, 6.6, 10], [-16, 6.4, 11], [28, 5.6, 12], [-33, 5, 12], [36, 4.6, 13], [-45, 4.8, 12], [47, 5.2, 12]]) {
            if (Math.abs(x) < cam.half(z) + 6) add('frostTree', x, z, { h });
        }
        for (const [x, z, h] of [[-21.8, 3.08, 8.2], [22.8, 3.08, 9], [17.5, 6.2, 9], [-12, 7.2, 8.5], [26, 6.8, 9.5], [2, 9.5, 8], [-33, 3.1, 9], [34, 3.1, 9.5], [-47, 3.1, 9], [45, 3.1, 9]]) {
            if (Math.abs(x) < cam.half(z) + 4) add('fir', x, z, { h });
        }
        add('fir', cam.at(0.012, 1.18), 1.18, { h: 8.5, near: true, mice: on('mice') });
        add('boughs', 0, 1, { side: 1 });
        add('railFence', 0, 0, { from: [cam.at(0.03, 1.0), 1.0], to: [cam.at(0.03, 1.0) - 2.1, 2.2], cardinal: on('cardinal'), rabbits: on('rabbits') });

        // Where people walk. Doors are where they come from and go to; exits
        // are off the edges of the picture.
        const edgeX = z => cam.half(z) + 2.5;
        node('store', -14.5, 2.5, { door: village }); node('green', -9.0, 2.5); node('tree', -5.8, 2.5, { linger: on('townTree') });
        node('fire', -5.9, 2.06, { linger: on('bonfire') }); node('bank', -5.6, 1.6); node('near', -5.3, 1.0, { exit: true });
        node('west', -edgeX(2.45), 2.45, { exit: true });
        node('up', -9.4, 3.3); node('roadW', -9.8, 4.42); node('roadE', 10.2, 4.42); node('farW', -edgeX(4.42), 4.42, { exit: true }); node('farE', edgeX(4.42), 4.42, { exit: true });
        node('down', 9.6, 3.3); node('gateW', 10.6, 2.44); node('gate', 14.8, 2.44); node('house', 14.8, 2.94, { door: village }); node('east', edgeX(2.44), 2.44, { exit: true });
        edge('west', 'store', 'green', 'tree', 'fire', 'bank', 'near'); edge('green', 'up', 'roadW', 'roadE', 'down', 'gateW', 'gate', 'east');
        edge('gate', 'house'); edge('farW', 'roadW'); edge('roadE', 'farE');
        L.road = { z: 4.42, x0: -edgeX(4.42) - 4, x1: edgeX(4.42) + 4 };
        L.tree = L.things.find(t => t.kind === 'grandTree') || null;
        return finish(L, cam, config);
    }

    function finish(L, cam, config) {
        // The pond's two banks, far to near, in metres and depth.
        if (L.pond) {
            const left = [], right = [], line = L.pond.line;
            for (let i = 0; i < line.length - 1; i++) for (let t = 0; t < 1; t += 0.125) {
                const a = line[i], b = line[i + 1], e = t * t * (3 - 2 * t);
                const z = a[0] + (b[0] - a[0]) * t, x = a[1] + (b[1] - a[1]) * e, hw = a[2] + (b[2] - a[2]) * e;
                const wob = 0.25 * Math.sin(z * 7.3) + 0.15 * Math.sin(z * 17);
                left.push([x - hw + wob, z]); right.push([x + hw + wob * 0.6, z]);
            }
            L.pond.left = left; L.pond.right = right;
            // The rink, as an ellipse in metres both ways, for VillageLogic.skate.
            const r = L.pond.rink;
            r.ellipse = { cx: r.x, cy: (r.z0 + r.z1) / 2 * cam.zm, rx: r.rx, ry: (r.z1 - r.z0) / 2 * cam.zm };
        }
        // Whoever is asked for at most: far houses first to go.
        const cap = Math.max(0, Math.round(config.houses ?? 99));
        const houses = L.things.filter(t => t.kind === 'house' || t.kind === 'farHouse').sort((a, b) => (a.kind === 'farHouse') - (b.kind === 'farHouse') || Math.abs(a.x) - Math.abs(b.x));
        for (const h of houses.slice(cap)) L.things.splice(L.things.indexOf(h), 1);
        L.things.sort((a, b) => b.z - a.z);
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
