// Snow Globe (SPEC §10.43): the pure parts. Where everything stands on the
// screen; the water and the snow in it (a shake stirs the water, the water
// carries the flakes, the flakes sink and settle on the ground and on the
// roofs, and a shake lifts them again: none is ever lost); the turntable
// and its music box, which slows as it runs down; the tunes; the cat beside
// the globe, who watches the snow and now and then has a go at it; the
// scenes inside; and how far a brush stroke runs before the colour under
// it changes. No DOM in here: the unit tests run this file in a Node vm.

const SnowGlobeLogic = (() => {
    const TAU = Math.PI * 2;
    const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
    const mix = (a, b, t) => a + (b - a) * t;
    const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

    // A small seeded generator (mulberry32): the same scene every time.
    function rng(seed) {
        let s = (seed >>> 0) || 1;
        return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    }

    // ---- Inside the glass -------------------------------------------------------------------
    // Globe units: the sphere has radius 1, x to the right, y up, z toward us.
    // The scene stands on a level floor at y = FLOOR; we look down on it a
    // little (TILT is the sine of how far), so the floor is an ellipse.
    const FLOOR = -0.42, FLOOR_R = Math.sqrt(1 - FLOOR * FLOOR) * 0.96, TILT = 0.3, WALL = 0.965;

    // Where a point inside the globe is drawn, in globe units from the
    // centre of the glass (screen y down), and how much nearer it is.
    function project(x, y, z) {
        const ct = Math.sqrt(1 - TILT * TILT);
        return { sx: x, sy: -(y * ct - z * TILT) * 0.98, depth: z * ct + y * TILT };
    }

    // ---- Seeing it turn ------------------------------------------------------------------------
    // Everything on the turntable is a solid in its own frame (x to its right,
    // y up, z out of its front), turned `face` about the vertical and stood at
    // its place on the floor. view(p) is one placed thing as the camera sees
    // it; at(v, x, y, z) is a point of it on the screen (globe units, y down)
    // and how near it is; facing(v, n) how squarely a surface with normal n
    // faces us (seen if above 0); world(v, n) that normal in the globe's frame,
    // for the light. A face's width on the screen goes as the cosine of its
    // turn, and things behind pass behind: the scene is a turntable, not a
    // picture squeezed round the middle.
    const CT = Math.sqrt(1 - TILT * TILT);
    function view(p) {
        const pr = project(p.x, FLOOR, p.z);
        return { x: pr.sx, y: pr.sy, depth: pr.depth, k: (1 + 0.16 * pr.depth) * (p.s || 1), c: Math.cos(p.face), s: Math.sin(p.face) };
    }
    function at(v, x, y, z, out = [0, 0, 0]) {
        const wx = x * v.c + z * v.s, wz = -x * v.s + z * v.c;
        out[0] = v.x + wx * v.k; out[1] = v.y - (y * CT - wz * TILT) * 0.98 * v.k; out[2] = v.depth + (wz * CT + y * TILT) * v.k;
        return out;
    }
    const facing = (v, nx, ny, nz) => (-nx * v.s + nz * v.c) * CT + ny * TILT;
    const world = (v, nx, ny, nz) => [nx * v.c + nz * v.s, ny, -nx * v.s + nz * v.c];
    // A vector of the thing's frame as a screen offset (globe units), for ellipses.
    function offset(v, x, y, z, out = [0, 0]) { const wx = x * v.c + z * v.s, wz = -x * v.s + z * v.c; out[0] = wx * v.k; out[1] = -(y * CT - wz * TILT) * 0.98 * v.k; return out; }
    // The ellipse a solid ellipsoid (radii along its own axes, given as three
    // vectors) is seen as: a 2×2 matrix B taking the unit circle to it (the
    // symmetric root of A·Aᵀ, so a sprite drawn through it isn't turned).
    function ellipseOf(v, ax, ay, az) {
        const a = offset(v, ...ax, [0, 0]), b = offset(v, ...ay, [0, 0]), c = offset(v, ...az, [0, 0]);
        const m00 = a[0] * a[0] + b[0] * b[0] + c[0] * c[0], m01 = a[0] * a[1] + b[0] * b[1] + c[0] * c[1], m11 = a[1] * a[1] + b[1] * b[1] + c[1] * c[1];
        const sq = Math.sqrt(Math.max(0, m00 * m11 - m01 * m01)), t = Math.sqrt(m00 + m11 + 2 * sq) || 1;
        return [(m00 + sq) / t, m01 / t, m01 / t, (m11 + sq) / t];
    }

    // ---- The scenes ---------------------------------------------------------------------------
    // What stands on the turntable: kind, its angle round it (a, radians, 0
    // toward us), how far out (r, of FLOOR_R), its own turn (yaw), its scale
    // (s, × its kind's own size). `box` kinds are houses (w across the gable
    // end, d along the ridge, h to the eaves, roof to the ridge). Things that
    // go round on their own (orbit: round the middle; spin: round where they
    // stand) head along their own x. `ground`: what the floor is painted as.
    const KINDS = {
        cottage: { box: true, w: 0.42, d: 0.34, h: 0.36, roof: 0.2 },
        cathouse: { box: true, w: 0.42, d: 0.34, h: 0.36, roof: 0.22 },
        house: { box: true, w: 0.3, d: 0.26, h: 0.3, roof: 0.15 },
        church: { box: true, w: 0.3, d: 0.4, h: 0.36, roof: 0.16, spire: 0.42 },
        hut: { box: true, w: 0.26, d: 0.24, h: 0.2, roof: 0.13 },
        gingerhouse: { box: true, w: 0.4, d: 0.34, h: 0.3, roof: 0.22 },
        cabin: { box: true, w: 0.42, d: 0.34, h: 0.26, roof: 0.2 },
        fir: { w: 0.2, h: 0.44 },
        bigtree: { w: 0.5, h: 0.92 },
        snowman: { w: 0.14, h: 0.24 },
        catsnowman: { w: 0.15, h: 0.24 },
        lamp: { w: 0.05, h: 0.3 },
        fence: { w: 0.26, h: 0.07 },
        bench: { w: 0.18, h: 0.08 },
        skaters: { w: 0.14, h: 0.17 },
        presents: { w: 0.2, h: 0.1 },
        sledcat: { w: 0.14, h: 0.12 },
        deer: { w: 0.2, h: 0.2 },
        pond: { w: 0.6, h: 0, flat: true },
        train: { w: 0.16, h: 0.09 },
        lighthouse: { w: 0.2, h: 0.6 },
        rocks: { w: 0.26, h: 0.08 },
        candycane: { w: 0.07, h: 0.2 },
        gingerman: { w: 0.11, h: 0.15 },
        lolly: { w: 0.1, h: 0.22 },
        bear: { w: 0.34, h: 0.19 },
        cub: { w: 0.2, h: 0.11 },
        iceblocks: { w: 0.2, h: 0.1 },
        carousel: { w: 0.64, h: 0.56 },
        penguin: { w: 0.08, h: 0.15 },
        slider: { w: 0.14, h: 0.06 },
        igloo: { w: 0.38, h: 0.17 },
        moose: { w: 0.32, h: 0.32 },
        woodpile: { w: 0.2, h: 0.09 },
    };
    for (const K of Object.values(KINDS)) for (const f of ['w', 'd', 'h', 'roof', 'spire']) if (K[f]) K[f] *= 1.22;     // (the scene a little bigger in its glass)
    const SCENES = {
        cottage: [
            { kind: 'cottage', a: 0, r: 0.22, yaw: 0.35 }, { kind: 'fir', a: -1.1, r: 0.62, s: 1.1 }, { kind: 'fir', a: 1.25, r: 0.66, s: 0.9 },
            { kind: 'fir', a: 2.6, r: 0.7, s: 0.75 }, { kind: 'snowman', a: 2.05, r: 0.52, yaw: -0.5 }, { kind: 'lamp', a: -2.2, r: 0.55 }, { kind: 'fence', a: -2.9, r: 0.7, yaw: 0.4 },
            { kind: 'deer', a: 3.4, r: 0.58, s: 1.15, yaw: 2.2 },
        ],
        village: [
            { kind: 'church', a: 0.2, r: 0.4, yaw: -0.2 }, { kind: 'house', a: -1.5, r: 0.5, yaw: 0.6 }, { kind: 'house', a: 1.7, r: 0.52, yaw: -0.5, s: 0.9, v: 1 },
            { kind: 'fir', a: -0.6, r: 0.74, s: 0.85 }, { kind: 'fir', a: 0.95, r: 0.76, s: 0.8 }, { kind: 'fir', a: 3.05, r: 0.66, s: 0.9 },
            { kind: 'lamp', a: 2.5, r: 0.35 }, { kind: 'snowman', a: -2.55, r: 0.45, s: 0.9, yaw: 0.6 }, { kind: 'bench', a: -3.4, r: 0.3, yaw: 0.2 },
        ],
        pond: [
            { kind: 'pond', a: 0, r: 0 }, { kind: 'skaters', a: 0.6, r: 0.24, spin: 1, s: 1.35 }, { kind: 'fir', a: -0.3, r: 0.78, s: 1.15 },
            { kind: 'fir', a: 1.4, r: 0.8, s: 0.9 }, { kind: 'fir', a: 2.3, r: 0.8, s: 0.75 }, { kind: 'fir', a: -1.5, r: 0.8, s: 0.95 },
            { kind: 'bench', a: 3.1, r: 0.72, yaw: 3.1 }, { kind: 'lamp', a: 3.7, r: 0.76 }, { kind: 'snowman', a: -2.4, r: 0.74, s: 0.85, yaw: -2.4 },
        ],
        catcottage: [
            { kind: 'cathouse', a: 0, r: 0.22, yaw: -0.3 }, { kind: 'catsnowman', a: 1.9, r: 0.55, yaw: 0.8 }, { kind: 'fir', a: -1.2, r: 0.66, s: 1.05 },
            { kind: 'fir', a: 1.0, r: 0.72, s: 0.8 }, { kind: 'sledcat', a: 2.8, r: 0.6, spin: 0.6, s: 1.3 }, { kind: 'lamp', a: -2.1, r: 0.56 },
            { kind: 'fir', a: 3.5, r: 0.74, s: 0.7 },
        ],
        tree: [
            { kind: 'bigtree', a: 0, r: 0 }, { kind: 'presents', a: 1.0, r: 0.32 }, { kind: 'presents', a: -1.9, r: 0.34, s: 0.85, yaw: 0.6, v: 1 },
            { kind: 'train', a: 0, r: 0.62, orbit: 0.9 }, { kind: 'snowman', a: 2.6, r: 0.66, s: 0.85, yaw: 2.6 }, { kind: 'fir', a: -0.9, r: 0.8, s: 0.6 }, { kind: 'fir', a: 1.9, r: 0.8, s: 0.55 },
        ],
        lighthouse: [
            { kind: 'lighthouse', a: 0.5, r: 0.16, yaw: 0.3 }, { kind: 'hut', a: -1.3, r: 0.44, yaw: -0.9 }, { kind: 'rocks', a: 2.1, r: 0.58 },
            { kind: 'rocks', a: -2.6, r: 0.6, s: 0.85, yaw: 1 }, { kind: 'rocks', a: 0.9, r: 0.66, s: 0.7, yaw: 2 }, { kind: 'fir', a: -0.35, r: 0.62, s: 0.8 },
            { kind: 'fir', a: 3.5, r: 0.52, s: 0.7 }, { kind: 'lamp', a: -1.95, r: 0.62, s: 0.8 },
        ],
        gingerbread: [
            { kind: 'gingerhouse', a: 0, r: 0.2, yaw: -0.25 }, { kind: 'candycane', a: 0.75, r: 0.62 }, { kind: 'candycane', a: -0.6, r: 0.64, yaw: 3.1 },
            { kind: 'gingerman', a: 2.0, r: 0.56, yaw: 2.2, s: 1.3 }, { kind: 'gingerman', a: -2.2, r: 0.56, yaw: -2.0, v: 1, s: 1.3 }, { kind: 'lolly', a: 3.0, r: 0.66, yaw: 3.0, s: 1.2 },
            { kind: 'lolly', a: -1.5, r: 0.7, s: 0.85, yaw: -1.5, v: 1 }, { kind: 'fir', a: 1.45, r: 0.74, s: 0.72 },
        ],
        polar: [
            { kind: 'bear', a: 0.35, r: 0.28, yaw: 0.6 }, { kind: 'cub', a: 1.45, r: 0.46, yaw: -0.2 }, { kind: 'cub', a: 2.15, r: 0.5, yaw: 2.7, s: 0.85 },
            { kind: 'iceblocks', a: -1.3, r: 0.56, yaw: 0.4 }, { kind: 'iceblocks', a: 3.4, r: 0.64, yaw: 1.2, s: 0.8, v: 1 }, { kind: 'rocks', a: -2.5, r: 0.66, s: 0.8, v: 1 },
        ],
        carousel: [
            { kind: 'carousel', a: 0, r: 0, spin: 1 }, { kind: 'lamp', a: 0.8, r: 0.8 }, { kind: 'lamp', a: -2.3, r: 0.8 },
            { kind: 'fir', a: -0.9, r: 0.82, s: 0.7 }, { kind: 'fir', a: 2.0, r: 0.82, s: 0.75 }, { kind: 'fir', a: 3.2, r: 0.82, s: 0.62 },
            { kind: 'bench', a: 1.45, r: 0.8, yaw: 1.45 },
        ],
        penguins: [
            { kind: 'igloo', a: -0.5, r: 0.28, yaw: -0.2 }, { kind: 'penguin', a: 0.85, r: 0.4, yaw: 0.5 }, { kind: 'penguin', a: 1.25, r: 0.56, yaw: -0.4, s: 0.78 },
            { kind: 'penguin', a: 2.4, r: 0.44, yaw: 2.9 }, { kind: 'penguin', a: -2.1, r: 0.56, yaw: -1.0, s: 0.9 }, { kind: 'slider', a: 0, r: 0.72, orbit: 0.8 },
            { kind: 'iceblocks', a: 3.4, r: 0.64, s: 0.7, yaw: 0.5 },
        ],
        cabin: [
            { kind: 'cabin', a: 0, r: 0.2, yaw: 0.4 }, { kind: 'moose', a: 2.15, r: 0.55, yaw: 0.9, s: 1.15 }, { kind: 'fir', a: -1.1, r: 0.66, s: 1.1 },
            { kind: 'fir', a: 1.15, r: 0.72, s: 0.9 }, { kind: 'fir', a: 3.05, r: 0.74, s: 0.85 }, { kind: 'woodpile', a: -2.2, r: 0.56, yaw: -2.6 },
            { kind: 'fence', a: -3.2, r: 0.72, yaw: -1.6 },
        ],
    };
    const GROUND = { cottage: 'path', village: 'lane', pond: 'pond', catcottage: 'paws', tree: 'track', lighthouse: 'sea', gingerbread: 'candy', polar: 'floe', carousel: 'ring', penguins: 'ice', cabin: 'path' };
    const SCENE_ORDER = ['cottage', 'village', 'pond', 'catcottage', 'tree', 'lighthouse', 'gingerbread', 'polar', 'carousel', 'penguins', 'cabin'];
    const SCENE_NAMES = {
        cottage: 'A cottage in the firs', village: 'The village church', pond: 'Skaters on the pond', catcottage: 'The cats’ cottage', tree: 'The Christmas tree',
        lighthouse: 'The lighthouse on the rocks', gingerbread: 'The gingerbread house', polar: 'Polar bears on the ice', carousel: 'The carousel', penguins: 'The penguins’ igloo', cabin: 'The cabin and the moose',
    };
    const ADVENT = ['village', 'gingerbread', 'carousel', 'cabin'];
    const YEAR = ['cottage', 'pond', 'catcottage', 'lighthouse', 'polar', 'penguins', 'cabin', 'gingerbread', 'carousel', 'village'];

    // 'auto': the tree from Christmas Eve to Boxing Day; through Advent, a
    // different Christmas one each day (the village, the gingerbread house,
    // the carousel, the cabin); the rest of the year a different one each day.
    function sceneFor(choice, date) {
        if (SCENES[choice]) return choice;
        const m = date.getMonth(), d = date.getDate(), day = Math.floor(Date.UTC(date.getFullYear(), m, d) / 86400000);
        if (m === 11 && d >= 24 && d <= 26) return 'tree';
        if (m === 11 && d < 24) return ADVENT[(d - 1) % ADVENT.length];
        return YEAR[((day % YEAR.length) + YEAR.length) % YEAR.length];
    }
    const festive = date => date.getMonth() === 11 && (date.getDate() === 24 || date.getDate() === 25);

    // Where each thing on the turntable is now, turned `theta`, in globe units:
    // { x, z, y (its foot), r (how far it reaches round), top, depth, face
    // (its own facing, 0 = toward us), i }. Skaters, the sled, the slider and
    // the train go round on their own as well, heading along their own x.
    function placed(scene, theta, t = 0) {
        const out = [];
        (SCENES[scene] || SCENES.cottage).forEach((o, i) => {
            const K = KINDS[o.kind], s = o.s || 1, own = (o.orbit ? t * o.orbit * 0.35 : 0) + (o.spin ? t * 0.5 * o.spin : 0);
            const a = o.a + theta + (o.r ? own : 0);
            const rr = o.r * FLOOR_R, x = Math.sin(a) * rr, z = Math.cos(a) * rr;
            const moves = o.orbit || o.spin, face = (o.yaw || 0) + (moves && o.r ? a : theta + own);
            const p = project(x, FLOOR, z);
            out.push({ kind: o.kind, i, v: o.v || 0, x, z, y: FLOOR, s, w: K.w * s, top: FLOOR + K.h * s + (K.roof || 0) * s, r: Math.max(K.w, K.d || 0) * s * 0.5, depth: p.depth, face, flat: !!K.flat, box: !!K.box });
        });
        return out;
    }

    // ---- The water and the snow --------------------------------------------------------------
    // Every flake is suspended (state 0) or settled (1) on the ground (on: -1)
    // or on one of the scene's things (on: its index). A shake stirs the water:
    // a slosh that dies in a second and a few eddies that last several; the
    // flakes follow the water (drag) and sink at their own pace. They settle
    // where they meet the floor or a roof. Nothing is ever lost: suspended and
    // settled always add up to the flakes there are.
    const DRAG = 2.4;            // how fast a flake takes the water's speed, 1/s
    const CORE = 0.42;           // an eddy's size

    function makeSim(n, o = {}) {
        const rand = o.rand || Math.random;
        const sim = { flakes: [], water: { slosh: [0, 0, 0], eddies: [], turb: 0, ph: [0, 1.7, 3.1, 4.4, 2.2, 5.3] }, settleSeconds: o.settleSeconds || 60, kind: o.kind || 'mixed', t: 0, ground: 0, onThings: [], calmFor: 0 };
        for (let i = 0; i < n; i++) sim.flakes.push(newFlake(sim, rand, i));
        return sim;
    }
    function newFlake(sim, rand, i) {
        const k = sim.kind, glitter = k === 'glitter' || k === 'rainbow' ? rand() < 0.85 : k === 'mixed' ? rand() < 0.22 : false;
        const size = glitter ? 0.5 + rand() * 0.6 : Math.pow(rand(), 1.8) * 1.6 + 0.45;
        // Its shape: snow a soft round flake, a six-armed star or a clump (the big ones); glitter a hexagon or a square
        // sequin. Each turns (rot) and tumbles (tum: a sequin flashes when it comes face on to the light).
        const r = rand(), shape = glitter ? (r < 0.6 ? 3 : 4) : size > 1.25 && r < 0.45 ? 2 : r < 0.42 ? 1 : 0;
        const f = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size, glitter, shape, rot: rand() * TAU, rotV: (rand() - 0.5) * 3, tum: rand() * TAU, tumV: (2 + rand() * 6) * (rand() < 0.5 ? -1 : 1),
            hue: k === 'rainbow' ? rand() : k === 'glitter' ? (rand() < 0.5 ? 0.12 : 0.6) : 0.14, phase: rand() * TAU, spin: 3 + rand() * 9, state: 1, on: -1, age: 0, sinkK: (glitter ? 0.62 : 0.55 + 0.4 * size) * (0.75 + rand() * 0.5), i };
        floorSpot(f, rand);
        sim.ground++;
        return f;
    }
    // A place on the floor (settled), at random.
    function floorSpot(f, rand) {
        const a = rand() * TAU, r = Math.sqrt(rand()) * FLOOR_R * 0.98;
        f.x = Math.sin(a) * r; f.z = Math.cos(a) * r; f.y = FLOOR; f.vx = f.vy = f.vz = 0;
    }
    // A flake loose in the water, somewhere above the floor.
    function loose(sim, f, rand, low = 0) {
        if (f.state === 1) { if (f.on < 0) sim.ground--; else sim.onThings[f.on] = Math.max(0, (sim.onThings[f.on] || 0) - 1); }
        f.state = 0; f.on = -1; f.age = 0;
        for (let k = 0; k < 20; k++) {
            const x = (rand() * 2 - 1) * 0.9, z = (rand() * 2 - 1) * 0.9, y = FLOOR + 0.03 + (low ? rand() * low : rand() * (1 - FLOOR) * 0.95);
            if (x * x + y * y + z * z < WALL * WALL * 0.97) { f.x = x; f.y = y; f.z = z; break; }
        }
    }
    function settle(sim, f, on) {
        f.state = 1; f.on = on; f.vx = f.vy = f.vz = 0; f.th = sim.theta || 0;
        if (on < 0) { sim.ground++; f.y = FLOOR; } else sim.onThings[on] = (sim.onThings[on] || 0) + 1;
    }

    // The globe was just shaken: as if it had been shaken a while ago and the
    // snow was still coming down (`share` of it still in the water).
    function scatter(sim, share, rand) {
        for (const f of sim.flakes) if (rand() < share) { loose(sim, f, rand); f.vx = (rand() - 0.5) * 0.1; f.vz = (rand() - 0.5) * 0.1; }
        sim.water.eddies.push({ c: [0.1, 0.1, 0], n: [0, 0, 1], w: 0.5, life: 6, age: 0 });
    }

    // A shake. (dx, dy): which way, in screen terms (y down), and how hard:
    // 1 is a good firm shake. Lifts that much of what has settled (the roofs'
    // snow first comes loose), stirs the water and starts eddies.
    function shake(sim, dx, dy, strength, rand) {
        const s = clamp(strength, 0, 2.5);
        if (s < 0.02) return 0;
        const len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = -dy / len;
        sim.water.slosh[0] += ux * s * 0.3; sim.water.slosh[1] += uy * s * 0.3 + s * 0.25; sim.water.slosh[2] += (rand() - 0.5) * s * 0.3;
        const eddies = 2 + Math.round(s * 2.5);
        for (let k = 0; k < eddies; k++) {
            const n = [(rand() - 0.5) * 0.7, (rand() - 0.5) * 0.7, rand() < 0.5 ? 1 : -1], nl = Math.hypot(...n);
            sim.water.eddies.push({ c: [(rand() - 0.5) * 1.1, FLOOR + 0.25 + rand() * 0.7, (rand() - 0.5) * 0.8], n: n.map(v => v / nl), w: (2.2 + rand() * 2.2) * Math.min(1.4, s), life: 3 + rand() * 4 + s, age: 0 });
        }
        if (sim.water.eddies.length > 12) sim.water.eddies.splice(0, sim.water.eddies.length - 12);
        // And the water stays turbulent a good while after: rolls that drift, curl and slowly die.
        sim.water.turb = Math.min(1.6, (sim.water.turb || 0) + s * 0.6);
        const lift = clamp(s * 0.75), up = 0.6 + 0.9 * s;
        let lifted = 0;
        for (const f of sim.flakes) {
            if (f.state !== 1) continue;
            if (rand() > (f.on >= 0 ? Math.min(1, lift * 1.8) : lift)) continue;
            const from = { x: f.x, z: f.z, on: f.on };
            // A hard shake mixes it all through the water; a gentle one lifts it from where it lay.
            const mixed = rand() < clamp((s - 0.4) * 0.8);
            loose(sim, f, rand, mixed ? 0 : 0.25);
            if (from.on < 0 && !mixed) { f.x = from.x; f.z = from.z; }
            const k = mixed ? 0.35 : 1;
            f.vx = ux * s * 0.3 * k + (rand() - 0.5) * s * 1.1 * k; f.vy = up * (0.3 + rand()) * k; f.vz = (rand() - 0.5) * s * 1.0 * k;
            lifted++;
        }
        sim.calmFor = 0;
        return lifted;
    }

    // The water's speed at a point, into `out`: the slosh, the eddies (a
    // Gaussian core each) and the turbulence, the curl of a slowly drifting
    // field of sines (so it neither gathers the snow nor spreads it, only
    // stirs it round in rolls that come and go).
    const TK = 2.7;
    function waterAt(sim, x, y, z, out) {
        const w = sim.water;
        let vx = w.slosh[0], vy = w.slosh[1], vz = w.slosh[2];
        if (w.turb > 0.004) {
            const p = w.ph, T = w.turb * 0.2, kx = TK * x, ky = TK * y, kz = TK * z;
            const s1 = Math.sin(ky + p[0]), c1 = Math.cos(ky + p[0]), s2 = Math.sin(kz + p[1]), c2 = Math.cos(kz + p[1]), s3 = Math.sin(kz + p[2]), c3 = Math.cos(kz + p[2]);
            const s4 = Math.sin(kx + p[3]), c4 = Math.cos(kx + p[3]), s5 = Math.sin(kx + p[4]), c5 = Math.cos(kx + p[4]), s6 = Math.sin(ky + p[5]), c6 = Math.cos(ky + p[5]);
            vx += T * (s5 * c6 - c3 * s4); vy += T * (s1 * c2 - c5 * s6); vz += T * (s3 * c4 - c1 * s2);
        }
        for (const e of w.eddies) {
            const px = x - e.c[0], py = y - e.c[1], pz = z - e.c[2], d2 = px * px + py * py + pz * pz;
            const k = e.w * Math.exp(-d2 / (CORE * CORE)) * Math.exp(-e.age / e.life * 1.6);
            vx += k * (e.n[1] * pz - e.n[2] * py); vy += k * (e.n[2] * px - e.n[0] * pz); vz += k * (e.n[0] * py - e.n[1] * px);
        }
        out[0] = vx; out[1] = vy; out[2] = vz;
        return out;
    }
    // How stirred the water is, 0 to about 3.
    function stir(sim) {
        const w = sim.water;
        let e = Math.hypot(...w.slosh) + (w.turb || 0) * 0.4;
        for (const d of w.eddies) e += Math.abs(d.w) * Math.exp(-d.age / d.life * 1.6) * 0.3;
        return e;
    }

    // One step. `things`: placed()'s list, for the roofs a flake can land on.
    // Returns how many are still in the water.
    const _v = [0, 0, 0];
    function step(sim, dt, things = []) {
        if (dt <= 0) return count(sim);
        sim.t += dt;
        const w = sim.water, decay = Math.exp(-dt / 0.55);
        w.slosh[0] *= decay; w.slosh[1] *= decay; w.slosh[2] *= decay;
        for (const e of w.eddies) e.age += dt;
        w.eddies = w.eddies.filter(e => e.age < e.life * 2);
        // The turbulence dies over a fifth of the settling time; its rolls drift and turn over as they go.
        w.turb = (w.turb || 0) * Math.exp(-dt / clamp(sim.settleSeconds * 0.2, 3, 20));
        if (w.turb < 0.004) w.turb = 0;
        for (let i = 0; i < 6; i++) w.ph[i] += dt * (0.35 + 0.09 * i) * (i % 2 ? -1 : 1) * (0.6 + w.turb);
        // The time a typical flake takes to come down from the middle is about half the settling time.
        const sink = (1 - FLOOR) * 0.85 / (sim.settleSeconds * 0.5), kd = 1 - Math.exp(-DRAG * dt);
        let loose = 0;
        for (const f of sim.flakes) {
            if (f.state === 1) continue;
            f.age += dt;
            waterAt(sim, f.x, f.y, f.z, _v);
            // A late one sinks faster and faster, so everything is down within about twice the settling time.
            const late = 1 + Math.max(0, f.age / sim.settleSeconds - 0.9) * 3;
            let vt = sink * f.sinkK * late;
            if (f.glitter) { const fl = Math.sin(sim.t * f.spin * 0.3 + f.phase); _v[0] += fl * 0.03; _v[2] += Math.cos(sim.t * f.spin * 0.21 + f.phase) * 0.03; vt *= 0.8 + 0.4 * Math.abs(fl); }
            f.vx += (_v[0] - f.vx) * kd; f.vy += (_v[1] - vt - f.vy) * kd; f.vz += (_v[2] - f.vz) * kd;
            f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
            // It turns and tumbles as it goes, faster while the water carries it.
            const sp = Math.abs(f.vx) + Math.abs(f.vy) + Math.abs(f.vz);
            f.rot += dt * f.rotV * (0.3 + sp * 2); f.tum += dt * f.tumV * (0.25 + sp * 2.5);
            // The glass.
            const d = Math.hypot(f.x, f.y, f.z);
            if (d > WALL) {
                // (Off the glass a little, and slowed by it: snow doesn't ride round the inside in a ring.)
                const k = WALL / d * 0.99; f.x *= k; f.y *= k; f.z *= k;
                const nx = f.x / WALL, ny = f.y / WALL, nz = f.z / WALL, vn = f.vx * nx + f.vy * ny + f.vz * nz;
                if (vn > 0) { f.vx -= vn * nx * 1.6; f.vy -= vn * ny * 1.6; f.vz -= vn * nz * 1.6; }
                f.vx *= 0.9; f.vy *= 0.9; f.vz *= 0.9;
            }
            // A roof, or the ground.
            let landed = false;
            if (f.vy <= 0) for (const th of things) {
                if (th.flat || f.y > th.top || f.y < th.top - 0.06) continue;
                const hx = f.x - th.x, hz = f.z - th.z;
                if (hx * hx + hz * hz < th.r * th.r * 0.7) { settle(sim, f, th.i); f.y = th.top; landed = true; break; }
            }
            if (!landed && f.y <= FLOOR) {
                const rr = Math.hypot(f.x, f.z);
                if (rr > FLOOR_R) { f.x *= FLOOR_R / rr; f.z *= FLOOR_R / rr; }
                settle(sim, f, -1);
                landed = true;
            }
            if (!landed) loose++;
        }
        if (loose === 0 && stir(sim) < 0.02) sim.calmFor += dt; else sim.calmFor = 0;
        return loose;
    }
    function count(sim) { let n = 0; for (const f of sim.flakes) if (f.state === 0) n++; return n; }

    // More or fewer flakes (the setting, or a new quality): new ones arrive
    // settled on the ground; those taken away are settled ones if possible.
    function resize(sim, n, rand) {
        while (sim.flakes.length < n) sim.flakes.push(newFlake(sim, rand, sim.flakes.length));
        if (sim.flakes.length > n) {
            sim.flakes.sort((a, b) => b.state - a.state);           // settled first, to be taken
            const gone = sim.flakes.splice(0, sim.flakes.length - n);
            for (const f of gone) if (f.state === 1) { if (f.on < 0) sim.ground--; else sim.onThings[f.on] = Math.max(0, (sim.onThings[f.on] || 0) - 1); }
            sim.flakes.forEach((f, i) => { f.i = i; });
        }
    }
    // How deep the snow lies: on the ground (0 to 1) and on each thing.
    function cover(sim, things) {
        const n = Math.max(1, sim.flakes.length);
        const out = { ground: clamp(sim.ground / n), on: [] };
        for (const th of things) out.on[th.i] = clamp((sim.onThings[th.i] || 0) / Math.max(4, n * th.r * th.r * 0.9));
        return out;
    }

    // ---- The turntable and the music box ------------------------------------------------------
    const OMEGA = 0.55;          // radians a second, fully wound
    function musicBox() { return { wind: 0, omega: 0, theta: 0, beat: 0, tempo: 0, note: -1, played: 0 }; }
    // Wound up again: a tap on the base.
    function wind(m) { m.wind = 1; if (m.tempo < 0.05) { m.beat = 0; m.note = -1; } return m; }
    // turning: 'music' (only while it plays), 'always' (slowly, all the time), 'never'.
    function musicStep(m, dt, o = {}) {
        const seconds = o.seconds || 40, turning = o.turning || 'music';
        m.wind = Math.max(0, m.wind - dt / seconds);
        const playing = m.wind > 0;
        let target = playing ? OMEGA * (0.25 + 0.75 * Math.sqrt(m.wind)) : turning === 'always' ? OMEGA * 0.22 : 0;
        if (turning === 'never') target = 0;
        m.omega += (target - m.omega) * (1 - Math.exp(-dt / 0.9));
        if (Math.abs(m.omega) < 1e-4 && target === 0) m.omega = 0;
        m.theta = (m.theta + m.omega * dt) % (TAU * 1000);
        // The tune slows with the spring: its tempo, 1 fully wound, falling toward a stop.
        m.tempo = playing ? 0.45 + 0.55 * Math.sqrt(m.wind) : Math.max(0, m.tempo - dt * 1.5);
        return m;
    }
    // The tune: which notes start in this step. Returns [{ midi, beats }].
    function notesDue(m, dt, tune) {
        const T = TUNES[tune] || TUNES.silent, out = [];
        if (m.tempo <= 0.01) return out;
        m.beat += dt * m.tempo * T.bpm / 60;
        const total = T.length || (T.length = T.notes.reduce((s, n) => s + n[1], 0));
        if (m.beat >= total) { m.beat -= total; m.note = -1; }
        let at = 0;
        for (let i = 0; i < T.notes.length; i++) {
            if (at > m.beat) break;
            if (i > m.note) { m.note = i; if (T.notes[i][0] > 0) { out.push({ midi: T.notes[i][0], beats: T.notes[i][1] }); m.played++; } }
            at += T.notes[i][1];
        }
        return out;
    }
    // Melodies in the public domain, as [midi, beats]; 0 is a rest.
    const C4 = 60, D4 = 62, E4 = 64, F4 = 65, Fs4 = 66, G4 = 67, A4 = 69, B4 = 71, C5 = 72, D5 = 74, E5 = 76, F5 = 77, B3 = 59;
    const TUNES = {
        silent: { name: 'Silent Night', bpm: 150, notes: [
            [G4, 3], [A4, 1], [G4, 2], [E4, 6], [G4, 3], [A4, 1], [G4, 2], [E4, 6], [D5, 4], [D5, 2], [B4, 6], [C5, 4], [C5, 2], [G4, 6],
            [A4, 4], [A4, 2], [C5, 3], [B4, 1], [A4, 2], [G4, 3], [A4, 1], [G4, 2], [E4, 6], [A4, 4], [A4, 2], [C5, 3], [B4, 1], [A4, 2], [G4, 3], [A4, 1], [G4, 2], [E4, 6],
            [D5, 4], [D5, 2], [F5, 3], [D5, 1], [B4, 2], [C5, 6], [E5, 6], [C5, 3], [G4, 1], [E4, 2], [G4, 3], [F4, 1], [D4, 2], [C4, 9], [0, 3]] },
        jingle: { name: 'Jingle Bells', bpm: 116, notes: [
            [E4, 1], [E4, 1], [E4, 2], [E4, 1], [E4, 1], [E4, 2], [E4, 1], [G4, 1], [C4, 1.5], [D4, 0.5], [E4, 4], [F4, 1], [F4, 1], [F4, 1.5], [F4, 0.5],
            [F4, 1], [E4, 1], [E4, 1], [E4, 0.5], [E4, 0.5], [E4, 1], [D4, 1], [D4, 1], [E4, 1], [D4, 2], [G4, 2],
            [E4, 1], [E4, 1], [E4, 2], [E4, 1], [E4, 1], [E4, 2], [E4, 1], [G4, 1], [C4, 1.5], [D4, 0.5], [E4, 4], [F4, 1], [F4, 1], [F4, 1.5], [F4, 0.5],
            [F4, 1], [E4, 1], [E4, 1], [E4, 0.5], [E4, 0.5], [G4, 1], [G4, 1], [F4, 1], [D4, 1], [C4, 3], [0, 1]] },
        deck: { name: 'Deck the Halls', bpm: 120, notes: [
            [G4, 1.5], [F4, 0.5], [E4, 1], [D4, 1], [C4, 1], [D4, 1], [E4, 1], [C4, 1], [D4, 0.5], [E4, 0.5], [F4, 0.5], [D4, 0.5], [E4, 1.5], [D4, 0.5], [C4, 1], [B3, 1], [C4, 2],
            [G4, 1.5], [F4, 0.5], [E4, 1], [D4, 1], [C4, 1], [D4, 1], [E4, 1], [C4, 1], [D4, 0.5], [E4, 0.5], [F4, 0.5], [D4, 0.5], [E4, 1.5], [D4, 0.5], [C4, 1], [B3, 1], [C4, 2],
            [D4, 1.5], [E4, 0.5], [F4, 1], [D4, 1], [E4, 1.5], [F4, 0.5], [G4, 1], [D4, 1], [E4, 0.5], [Fs4, 0.5], [G4, 1], [A4, 0.5], [B4, 0.5], [C5, 1], [B4, 1], [A4, 1], [G4, 2],
            [G4, 1.5], [F4, 0.5], [E4, 1], [D4, 1], [C4, 1], [D4, 1], [E4, 1], [C4, 1], [A4, 0.5], [A4, 0.5], [A4, 0.5], [A4, 0.5], [G4, 1.5], [F4, 0.5], [E4, 1], [D4, 1], [C4, 2], [0, 2]] },
        wish: { name: 'We Wish You a Merry Christmas', bpm: 132, notes: [
            [D4, 1], [G4, 1], [G4, 0.5], [A4, 0.5], [G4, 0.5], [Fs4, 0.5], [E4, 1], [E4, 1], [E4, 1], [A4, 1], [A4, 0.5], [B4, 0.5], [A4, 0.5], [G4, 0.5], [Fs4, 1], [D4, 1], [D4, 1],
            [B4, 1], [B4, 0.5], [C5, 0.5], [B4, 0.5], [A4, 0.5], [G4, 1], [E4, 1], [D4, 0.5], [D4, 0.5], [E4, 1], [A4, 1], [Fs4, 1], [G4, 2], [0, 1]] },
    };
    const TUNE_ORDER = ['silent', 'jingle', 'deck', 'wish'];
    const hz = midi => 440 * Math.pow(2, (midi - 69) / 12);

    // ---- The cat ------------------------------------------------------------------------------
    // The owner's cats, by their coats (as on the Ornament and Sky Island).
    const CATS = {
        moofy: { name: 'Moofy', coat: 'black-fluffy', eyes: '#c6d64a', fluff: 1, size: 1.12, grin: true },
        butters: { name: 'Butters', coat: 'buff-tabby', eyes: '#d8a43c', fluff: 0.2, size: 1.08 },
        waffles: { name: 'Waffles', coat: 'holstein', eyes: '#8cc06a', fluff: 0, size: 0.98 },
        ras: { name: 'Ras The Destroyer', coat: 'tuxedo', eyes: '#e0c040', fluff: 0, size: 1 },
        ibbie: { name: 'Ibbie', coat: 'grey-tabby', eyes: '#9cc27a', fluff: 0, size: 0.93 },
        maus: { name: 'Maus', coat: 'tortie', eyes: '#e8b030', fluff: 0, size: 0.92 },
        turkey: { name: 'Turkey', coat: 'grey-mottled', eyes: '#c8b050', fluff: 0.1, size: 1.15 },
        harry: { name: 'Harry', coat: 'orange-white', eyes: '#d8b440', fluff: 0, size: 1 },
        kittytoes: { name: 'Kitty Toes', coat: 'blue-persian', eyes: '#e08a2c', fluff: 1.3, size: 1.02, flat: true },
    };
    const CAT_ORDER = Object.keys(CATS);
    // 'random': a different one each day.
    function catFor(choice, date) {
        if (choice === 'none') return null;
        if (CATS[choice]) return choice;
        const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
        return CAT_ORDER[((day * 7 + 3) % CAT_ORDER.length + CAT_ORDER.length) % CAT_ORDER.length];
    }

    // What the cat is doing. States: sit (looking about), watch (eyes on the
    // snow), groom (a paw, licked), blink (a slow one, at you), sleep, tap (a
    // paw at the glass: a nudge), bat (a proper swipe: it shakes the globe),
    // purr (being stroked). ctx: { rand, swirl (0 to 1: snow on the move),
    // calmFor (s since it all settled), mischief (0 to 1), byCat (the cat
    // shakes it when it has been still `every` seconds), every }. Returns
    // the events of this step: 'tap', 'bat' (the paw meets the glass), 'yawn'.
    function makeCat() { return { state: 'sit', t: 0, dur: 3, blink: 2, eyes: 1, paw: 0, head: 0, headTo: 0, look: 0, tail: 0, sleep: 0, purr: 0, ear: 0, hit: false }; }
    const CAT_STATES = ['sit', 'watch', 'groom', 'blink', 'sleep', 'tap', 'bat', 'purr'];
    function catStep(c, dt, ctx) {
        const rand = ctx.rand || Math.random, ev = [];
        c.t += dt;
        c.blink -= dt;
        c.tail += dt * (c.state === 'watch' ? 2.6 : c.state === 'sleep' ? 0.4 : 1);
        const go = (state, dur) => { c.state = state; c.t = 0; c.dur = dur; c.hit = false; };
        // Moving snow catches the eye, whatever it was doing (unless asleep, mostly).
        if ((ctx.swirl || 0) > 0.35 && (c.state === 'sit' || c.state === 'groom' || (c.state === 'sleep' && rand() < dt * 0.5))) go('watch', 4 + rand() * 6);
        if (c.state === 'tap' || c.state === 'bat') {
            // Up, a beat, out to the glass, and down.
            const T = c.state === 'bat' ? 1.6 : 1.1, u = c.t / T, contact = c.state === 'bat' ? 0.5 : 0.55;
            c.paw = u < contact ? smooth(0, contact, u) : u < contact + 0.12 ? 1 : 1 - smooth(contact + 0.12, 1, u);
            if (!c.hit && u >= contact) { c.hit = true; ev.push(c.state); }
            if (c.t >= T) { go('watch', 2 + rand() * 3); c.paw = 0; }
        } else if (c.t >= c.dur) {
            const m = ctx.mischief ?? 0.5, moving = (ctx.swirl || 0) > 0.15;
            if (ctx.byCat && ctx.calmFor > (ctx.every || 120) && c.state !== 'sleep') go('bat', 1.6);
            else {
                const w = {
                    sit: 1, watch: moving ? 3 : 0.3, groom: moving ? 0.2 : 0.8, blink: 0.7, sleep: moving ? 0 : 0.5 + (c.state === 'sleep' ? 2 : 0),
                    tap: (moving ? 0.6 : 0.25) * m * 2, bat: moving ? 0 : 0.05 * m,
                };
                let r = rand() * Object.values(w).reduce((a, b) => a + b, 0), next = 'sit';
                for (const [k, v] of Object.entries(w)) { r -= v; if (r <= 0) { next = k; break; } }
                const dur = { sit: 3 + rand() * 5, watch: 3 + rand() * 6, groom: 4 + rand() * 4, blink: 1.6, sleep: 15 + rand() * 30, tap: 1.1, bat: 1.6 }[next];
                go(next, dur);
            }
        }
        if (c.state === 'purr' && c.t >= c.dur) go('sit', 2 + rand() * 3);
        // Eyes: open, wide while the snow flies, shut asleep or blinking slow.
        const shut = c.state === 'sleep' || c.state === 'purr' || (c.state === 'blink' && c.t > 0.2 && c.t < 1.2) || c.blink < 0;
        if (c.blink < -0.14) c.blink = 2 + rand() * 4;
        c.eyes += ((shut ? 0 : c.state === 'watch' ? 1.25 : 1) - c.eyes) * (1 - Math.exp(-dt / 0.07));
        c.sleep += ((c.state === 'sleep' ? 1 : 0) - c.sleep) * (1 - Math.exp(-dt / 1.2));
        c.purr += ((c.state === 'purr' ? 1 : 0) - c.purr) * (1 - Math.exp(-dt / 0.4));
        // The head goes where it looks: at the snow (headTo, from the manager), at us, or about.
        if (c.state === 'sit' && c.t < dt + 1e-9) c.look = (rand() - 0.5) * 0.8;
        const want = c.state === 'watch' || c.state === 'tap' || c.state === 'bat' ? ctx.headTo ?? 0.6 : c.state === 'blink' || c.state === 'purr' ? -0.05 : c.state === 'sleep' ? 0.1 : c.state === 'groom' ? 0.35 : c.look;
        c.head += (want - c.head) * (1 - Math.exp(-dt / 0.35));
        c.ear = Math.max(0, c.ear - dt * 3);
        if (rand() < dt * 0.08) c.ear = 1;
        return ev;
    }
    // The ear on side e (-1, 1) of the head, in head units (y up): a triangle.
    const earAt = (e, s, puff, earH) => [[e * 0.15 * puff, 0.03], [e * 0.12 * puff + s * 0.02, earH], [e * 0.03, 0.12]];
    // Twice a polygon's signed area: positive counter-clockwise (y up).
    function area(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a; }

    // The tail's middle line, in cat units (y up from where it sits, s: toward
    // the globe), from the root to the tip: out from behind the haunch, down
    // round its back to the floor, then along the floor in front of the paws,
    // the tip curling up. `sway` and `lift` move only its last third. Returns
    // [[x, y, radius]…] (n + 1 points) and `front`, the index from which it
    // lies in front of the body (drawn after it): before that it is behind the
    // haunch, so it wraps round the cat and never passes through it.
    function tailLine(s, puff, sway, lift, n = 28) {
        const A = [[-s * 0.3, 0.15], [-s * 0.43, 0.11], [-s * 0.43, -0.02], [-s * 0.25, -0.036]];
        const B = [[-s * 0.25, -0.036], [-s * 0.1, -0.046], [s * (0.05 + sway * 0.5), -0.048], [s * (0.14 + sway), -0.014 + lift]];
        const bez = (P, u, i) => { const v = 1 - u; return v * v * v * P[0][i] + 3 * v * v * u * P[1][i] + 3 * v * u * u * P[2][i] + u * u * u * P[3][i]; };
        const pts = [];
        for (let i = 0; i <= n; i++) {
            const u = i / n, P = u < 0.5 ? A : B, w = u < 0.5 ? u * 2 : (u - 0.5) * 2;
            pts.push([bez(P, w, 0), bez(P, w, 1), (0.052 - 0.022 * u - 0.012 * u * u * u) * puff]);
        }
        return { pts, front: Math.round(n * 0.2) };
    }

    // A stroke: the cat purrs a while.
    function pet(c) { c.state = 'purr'; c.t = 0; c.dur = 3.5; c.paw = 0; return c; }

    // ---- Pacing at rest ----------------------------------------------------------------------
    // How long the stage may wait before the next frame, in ms from now (a
    // wait, never a deadline: host.idleUntil takes a duration). 0 while
    // anything moves; fourteen frames a second for something that flickers
    // or breathes (the candle, a cat awake, snow outside, lights, smoke); four
    // while the cat sleeps and nothing else stirs; and with nothing at all,
    // a frame now and then for the timers (who shakes it, the music box).
    // o: { busy, cat: 'none'|'awake'|'asleep', ambient (anything else that flickers) }.
    function restWait(o) {
        if (o.busy) return 0;
        if (o.ambient || o.cat === 'awake') return 1000 / 14;
        if (o.cat === 'asleep') return 250;
        return 1500;
    }

    // ---- Where it all stands on the screen -----------------------------------------------------
    // The surface (sill, mantel or desk) runs across the bottom; the globe sits
    // on its base on it, the cat beside it, the candle on the other side.
    // o: { insets, size (× the globe), catSide ('left'|'right'), cat (true if there is one), treeSize, room }.
    function layout(W, H, o = {}) {
        const ins = o.insets || {}, top = ins.top || 0, bottom = H - (ins.bottom || 0), left = ins.left || 0, right = W - (ins.right || 0);
        const w = right - left, h = bottom - top, portrait = h > w * 1.15, u = Math.max(0.5, Math.min(w, h) / 800);
        const back = top + h * (portrait ? 0.62 : 0.6);                 // where the surface meets the wall
        const foot = top + h * (portrait ? 0.79 : 0.82);                // where the globe's base stands
        let R = Math.min(w * (portrait ? 0.34 : 0.19), h * 0.25) * (o.size || 1);
        const baseH = R * 0.5;
        R = Math.min(R, (foot - top - 10 * u) / 2.32, w * 0.46);
        const shift = o.cat ? (o.catSide === 'left' ? 1 : -1) * Math.max(0, Math.min(w * 0.06, R * 0.5, w / 2 - R - 4 * u)) : 0;
        const cx = left + w / 2 + shift, cy = foot - R * 0.5 - R * 0.8;
        const base = { x: cx, y: foot, w: R * 1.62, h: R * 0.5, top: foot - R * 0.5 };
        // The cat: about as tall as the globe and its base, sitting beside them.
        let catH = R * 1.75;
        const side = o.catSide === 'left' ? -1 : 1, room = side > 0 ? right - (cx + R * 1.06) : (cx - R * 1.06) - left;
        const catW = h => h * 0.62;
        if (catW(catH) > room * 0.95) catH = Math.max(R * 1.1, room * 0.95 / 0.62);
        const cat = { x: cx + side * (R * 1.06 + catW(catH) * 0.5 - R * 0.05), y: foot + R * 0.04, h: catH, side };
        if (portrait) {
            // On a phone held upright the cat sits a little in front, by the base, and as big as fits.
            cat.h = Math.min(R * 1.25, w * 0.42); cat.y = foot + R * 0.2;
            const half = catW(cat.h) * 0.52;
            cat.x = clamp(cx + side * (R * 0.98 + catW(cat.h) * 0.32), left + half, right - half);
        }
        // The candle on the other side, smaller and further back if there's little room.
        const cside = -side, croom = cside > 0 ? right - (cx + R * 1.1) : (cx - R * 1.1) - left;
        const candle = { x: cx + cside * Math.min(R * 1.9, croom * 0.6), y: back + (foot - back) * 0.45, h: R * 0.75 * (croom < R * 1.2 ? 0.7 : 1), side: cside };
        // (No room beside the globe, on a phone held upright: the candle stands at the back of the sill, behind the cat.)
        if (croom < R * 0.9) { candle.x = side > 0 ? right - w * 0.12 : left + w * 0.12; candle.y = back + (foot - back) * 0.22; candle.h = R * 0.42; candle.side = side; }
        const win = { x: cx - Math.min(w * 0.36, R * 2.6), y: top + h * 0.06, w: Math.min(w * 0.72, R * 5.2), h: back - (top + h * 0.06) - 6 * u };
        if (portrait) { win.x = left + w * 0.1; win.w = w * 0.8; }
        // By the bookshelves the window is narrower, so the shelves have the wall either side of it.
        if (o.room === 'desk' && !portrait) { win.w = Math.min(w * 0.42, R * 3.3); win.x = cx - win.w / 2; }
        // A little Christmas tree on the candle's side, further back and further out (on a phone held upright,
        // at the back beside the globe). h: its height with its pot, × the size setting; y: where its pot stands.
        const th = R * (portrait ? 1.05 : 1.45) * (o.treeSize || 1), tside = candle.side;
        const tree = { h: th, y: back + (foot - back) * (portrait ? 0.14 : 0.3), side: tside, x: 0 };
        const half = th * 0.36, troom = tside > 0 ? right - (cx + R) : (cx - R) - left;
        tree.x = cx + tside * (portrait ? R * 0.9 : Math.max(R * 1.25 + half, Math.min(R * 3.05, troom * 0.8)));
        tree.x = clamp(tree.x, left + half + 4 * u, right - half - 4 * u);
        return { W, H, u, portrait, top, bottom, left, right, back, foot, cx, cy, R, base, cat, candle, win, tree };
    }

    // ---- Brushwork ------------------------------------------------------------------------------
    // How far a stroke may run from (x, y) along (dx, dy) before the colour
    // under it changes by more than `tol` (summed over r, g, b, 0 to 765) or
    // it leaves the shape (alpha under 128): in steps of `st`, at most `max`.
    // data: an RGBA array W×H.
    function run(data, W, H, x, y, dx, dy, max, st, tol = 60) {
        const i0 = ((y | 0) * W + (x | 0)) * 4, r0 = data[i0], g0 = data[i0 + 1], b0 = data[i0 + 2];
        let d = 0;
        while (d + st <= max) {
            const nx = x + dx * (d + st), ny = y + dy * (d + st);
            if (nx < 0 || ny < 0 || nx >= W - 1 || ny >= H - 1) break;
            const i = ((ny | 0) * W + (nx | 0)) * 4;
            if (data[i + 3] < 128) break;
            if (Math.abs(data[i] - r0) + Math.abs(data[i + 1] - g0) + Math.abs(data[i + 2] - b0) > tol) break;
            d += st;
        }
        return d;
    }

    return {
        TAU, clamp, mix, smooth, rng, FLOOR, FLOOR_R, TILT, CT, WALL, project, view, at, facing, world, offset, ellipseOf, KINDS, SCENES, GROUND, SCENE_ORDER, SCENE_NAMES, ADVENT, YEAR, sceneFor, festive, placed,
        makeSim, scatter, shake, step, count, resize, cover, waterAt, stir, OMEGA, musicBox, wind, musicStep, notesDue, TUNES, TUNE_ORDER, hz,
        CATS, CAT_ORDER, catFor, makeCat, catStep, pet, CAT_STATES, earAt, area, tailLine, restWait, layout, run,
    };
})();
