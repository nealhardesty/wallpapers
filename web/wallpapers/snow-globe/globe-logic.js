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

    // ---- The scenes ---------------------------------------------------------------------------
    // What stands on the turntable: kind, its angle round it (a, radians, 0 at
    // the back), how far out (r, of FLOOR_R), its own turn (yaw), its scale
    // (s, × its kind's own size). `box` kinds are buildings with a front and a
    // side; the rest look much the same from anywhere (or have a back).
    const KINDS = {
        cottage: { box: true, w: 0.42, d: 0.34, h: 0.36, roof: 0.2 },
        cathouse: { box: true, w: 0.42, d: 0.34, h: 0.36, roof: 0.22 },
        house: { box: true, w: 0.3, d: 0.26, h: 0.3, roof: 0.15 },
        church: { box: true, w: 0.3, d: 0.4, h: 0.36, roof: 0.16, spire: 0.42 },
        fir: { w: 0.2, h: 0.44 },
        bigtree: { w: 0.5, h: 0.92 },
        snowman: { w: 0.14, h: 0.24, back: true },
        catsnowman: { w: 0.15, h: 0.24, back: true },
        lamp: { w: 0.05, h: 0.3 },
        fence: { w: 0.26, h: 0.07 },
        bench: { w: 0.18, h: 0.08, back: true },
        skaters: { w: 0.14, h: 0.17, back: true },
        presents: { w: 0.2, h: 0.1 },
        sledcat: { w: 0.14, h: 0.12, back: true },
        deer: { w: 0.2, h: 0.2, back: true },
        pond: { w: 0.6, h: 0, flat: true },
        train: { w: 0.16, h: 0.09, back: true },
    };
    for (const K of Object.values(KINDS)) for (const f of ['w', 'd', 'h', 'roof', 'spire']) if (K[f]) K[f] *= 1.22;     // (the scene a little bigger in its glass)
    const SCENES = {
        cottage: [
            { kind: 'cottage', a: 0, r: 0.22, yaw: 0.35 }, { kind: 'fir', a: -1.1, r: 0.62, s: 1.1 }, { kind: 'fir', a: 1.25, r: 0.66, s: 0.9 },
            { kind: 'fir', a: 2.6, r: 0.7, s: 0.75 }, { kind: 'snowman', a: 2.05, r: 0.52 }, { kind: 'lamp', a: -2.2, r: 0.55 }, { kind: 'fence', a: -2.9, r: 0.7, yaw: 0.4 },
            { kind: 'deer', a: 3.4, r: 0.58, s: 0.9 },
        ],
        village: [
            { kind: 'church', a: 0.2, r: 0.4, yaw: -0.2 }, { kind: 'house', a: -1.5, r: 0.5, yaw: 0.6 }, { kind: 'house', a: 1.7, r: 0.52, yaw: -0.5, s: 0.9 },
            { kind: 'fir', a: -0.6, r: 0.74, s: 0.85 }, { kind: 'fir', a: 0.95, r: 0.76, s: 0.8 }, { kind: 'fir', a: 3.05, r: 0.66, s: 0.9 },
            { kind: 'lamp', a: 2.5, r: 0.35 }, { kind: 'snowman', a: -2.55, r: 0.45, s: 0.9 }, { kind: 'bench', a: -3.4, r: 0.3, yaw: 0.2 },
        ],
        pond: [
            { kind: 'pond', a: 0, r: 0 }, { kind: 'skaters', a: 0.6, r: 0.24, spin: 1 }, { kind: 'fir', a: -0.3, r: 0.78, s: 1.15 },
            { kind: 'fir', a: 1.4, r: 0.8, s: 0.9 }, { kind: 'fir', a: 2.3, r: 0.8, s: 0.75 }, { kind: 'fir', a: -1.5, r: 0.8, s: 0.95 },
            { kind: 'bench', a: 3.1, r: 0.72, yaw: 0 }, { kind: 'lamp', a: 3.7, r: 0.76 }, { kind: 'snowman', a: -2.4, r: 0.74, s: 0.85 },
        ],
        catcottage: [
            { kind: 'cathouse', a: 0, r: 0.22, yaw: -0.3 }, { kind: 'catsnowman', a: 1.9, r: 0.55 }, { kind: 'fir', a: -1.2, r: 0.66, s: 1.05 },
            { kind: 'fir', a: 1.0, r: 0.72, s: 0.8 }, { kind: 'sledcat', a: 2.8, r: 0.6, spin: 0.6 }, { kind: 'lamp', a: -2.1, r: 0.56 },
            { kind: 'fir', a: 3.5, r: 0.74, s: 0.7 },
        ],
        tree: [
            { kind: 'bigtree', a: 0, r: 0 }, { kind: 'presents', a: 1.0, r: 0.32 }, { kind: 'presents', a: -1.9, r: 0.34, s: 0.85, yaw: 0.6 },
            { kind: 'train', a: 0, r: 0.62, orbit: 0.9 }, { kind: 'snowman', a: 2.6, r: 0.66, s: 0.85 }, { kind: 'fir', a: -0.9, r: 0.8, s: 0.6 }, { kind: 'fir', a: 1.9, r: 0.8, s: 0.55 },
        ],
    };
    const SCENE_ORDER = ['cottage', 'village', 'pond', 'catcottage', 'tree'];
    const SCENE_NAMES = { cottage: 'A cottage in the firs', village: 'The village church', pond: 'Skaters on the pond', catcottage: 'The cats’ cottage', tree: 'The Christmas tree' };

    // 'auto': the tree from Christmas Eve to Boxing Day, the village through
    // Advent, and the rest of the year a different one each day.
    function sceneFor(choice, date) {
        if (SCENES[choice]) return choice;
        const m = date.getMonth(), d = date.getDate();
        if (m === 11 && d >= 24 && d <= 26) return 'tree';
        if (m === 11) return 'village';
        const day = Math.floor((Date.UTC(date.getFullYear(), m, d) / 86400000));
        return ['cottage', 'pond', 'catcottage'][((day % 3) + 3) % 3];
    }
    const festive = date => date.getMonth() === 11 && (date.getDate() === 24 || date.getDate() === 25);

    // Where each thing on the turntable is now, turned `theta`, in globe units:
    // { x, z, y (its foot), r (how far it reaches round), top, depth, face
    // (its own facing, 0 = toward us), i }. Skaters and the train go round on
    // their own as well.
    function placed(scene, theta, t = 0) {
        const out = [];
        (SCENES[scene] || SCENES.cottage).forEach((o, i) => {
            const K = KINDS[o.kind], s = o.s || 1;
            const a = o.a + theta + (o.orbit ? t * o.orbit * 0.35 : 0) + (o.spin ? t * 0.5 * o.spin : 0);
            const rr = o.r * FLOOR_R, x = Math.sin(a) * rr, z = Math.cos(a) * rr;
            const face = (o.yaw || 0) + theta + (o.orbit ? t * o.orbit * 0.35 + Math.PI / 2 : 0) + (o.spin ? t * 0.5 * o.spin + Math.PI / 2 : 0);
            const p = project(x, FLOOR, z);
            out.push({ kind: o.kind, i, x, z, y: FLOOR, s, w: K.w * s, top: FLOOR + K.h * s + (K.roof || 0) * s, r: Math.max(K.w, K.d || 0) * s * 0.5, depth: p.depth, face, flat: !!K.flat, box: !!K.box });
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
        const sim = { flakes: [], water: { slosh: [0, 0, 0], eddies: [] }, settleSeconds: o.settleSeconds || 60, kind: o.kind || 'mixed', t: 0, ground: 0, onThings: [], calmFor: 0 };
        for (let i = 0; i < n; i++) sim.flakes.push(newFlake(sim, rand, i));
        return sim;
    }
    function newFlake(sim, rand, i) {
        const k = sim.kind, glitter = k === 'glitter' || k === 'rainbow' ? rand() < 0.85 : k === 'mixed' ? rand() < 0.22 : false;
        const size = glitter ? 0.5 + rand() * 0.6 : Math.pow(rand(), 1.8) * 1.6 + 0.45;
        const f = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size, glitter, hue: k === 'rainbow' ? rand() : k === 'glitter' ? (rand() < 0.5 ? 0.12 : 0.6) : 0.14, phase: rand() * TAU, spin: 3 + rand() * 9, state: 1, on: -1, age: 0, sinkK: (glitter ? 0.62 : 0.55 + 0.4 * size) * (0.75 + rand() * 0.5), i };
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
        const lift = clamp(s * 0.75), up = 0.6 + 0.9 * s;
        let lifted = 0;
        for (const f of sim.flakes) {
            if (f.state !== 1) continue;
            if (rand() > (f.on >= 0 ? Math.min(1, lift * 1.4) : lift)) continue;
            const from = { x: f.x, z: f.z, on: f.on };
            loose(sim, f, rand, 0.25);
            if (from.on < 0) { f.x = from.x; f.z = from.z; }
            f.vx = ux * s * 0.3 + (rand() - 0.5) * s * 1.1; f.vy = up * (0.3 + rand()); f.vz = (rand() - 0.5) * s * 1.0;
            lifted++;
        }
        sim.calmFor = 0;
        return lifted;
    }

    // The water's speed at a point, into `out`.
    function waterAt(sim, x, y, z, out) {
        const w = sim.water;
        let vx = w.slosh[0], vy = w.slosh[1], vz = w.slosh[2];
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
        let e = Math.hypot(...w.slosh);
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
    // o: { insets, size (× the globe), catSide ('left'|'right'), cat (true if there is one), room }.
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
        return { W, H, u, portrait, top, bottom, left, right, back, foot, cx, cy, R, base, cat, candle, win };
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
        TAU, clamp, mix, smooth, rng, FLOOR, FLOOR_R, TILT, WALL, project, KINDS, SCENES, SCENE_ORDER, SCENE_NAMES, sceneFor, festive, placed,
        makeSim, scatter, shake, step, count, resize, cover, waterAt, stir, OMEGA, musicBox, wind, musicStep, notesDue, TUNES, TUNE_ORDER, hz,
        CATS, CAT_ORDER, catFor, makeCat, catStep, pet, CAT_STATES, restWait, layout, run,
    };
})();
