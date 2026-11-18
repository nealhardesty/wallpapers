// Fresh Tracks' mountain, with no DOM and no WebGL, so tools/ski-run.test.mjs
// can run it in Node (SPEC §10.39):
//
//   course    an endless run stitched from sections (groomed piste, powder,
//             glades, a half-pipe, a park, rollers, a frozen lake, a cliff, a
//             gully, a cat track, a hut), and height(x, z) in metres: the one
//             ground the riders ski and the renderer's mesh is sampled from
//   trees     where they stand, never in anybody's way
//   riders    a lead and friends, strangers, a ski school: their lines, their
//             airs and tricks, the odd harmless wipeout, and room for each other
//   camera    behind, in front, from on high, or a director cutting between
//   sky       the sun, the moon, the light they give; weather that comes and goes
//
// z runs down the mountain and x across it; the course's centre is a function
// of z, so it winds but never doubles back, and u = x - centre(z) is how far
// across the run something is. y is up.

const SkiLogic = (() => {
    const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
    const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const sq = t => t * t * (3 - 2 * t);
    const mix = (a, b, t) => a + (b - a) * t;
    const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
    const RAD = Math.PI / 180, TAU = Math.PI * 2, G = 9.81;

    // Whole numbers in, 0 to 1 out: the same every time.
    const hash = (a, b = 0, c = 0) => {
        let h = Math.imul(a | 0, 0x9E3779B1) ^ Math.imul(b | 0, 0x85EBCA77) ^ Math.imul(c | 0, 0xC2B2AE3D);
        h = Math.imul(h ^ (h >>> 15), 0x2C1B3C6D);
        h = Math.imul(h ^ (h >>> 12), 0x297A2D39);
        return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
    };
    const rng = seed => {
        let a = seed >>> 0;
        return () => {
            a = (a + 0x6d2b79f5) >>> 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    };

    // ---- Noise (as Ice Patrol bakes it: SPEC §10.34) ------------------------------
    function lattice(cells, random) {
        const gx = new Float32Array(cells * cells), gy = new Float32Array(cells * cells);
        for (let i = 0; i < gx.length; i++) {
            const a = random() * TAU;
            gx[i] = Math.cos(a);
            gy[i] = Math.sin(a);
        }
        return { cells, gx, gy };
    }

    function perlin(l, x, y) {
        const n = l.cells, gx = l.gx, gy = l.gy;
        const fx = Math.floor(x), fy = Math.floor(y), tx = x - fx, ty = y - fy;
        let x0 = fx % n, y0 = fy % n;
        if (x0 < 0) x0 += n;
        if (y0 < 0) y0 += n;
        const x1 = x0 + 1 === n ? 0 : x0 + 1, r0 = y0 * n, r1 = (y0 + 1 === n ? 0 : y0 + 1) * n;
        const sx = tx * tx * tx * (tx * (tx * 6 - 15) + 10), sy = ty * ty * ty * (ty * (ty * 6 - 15) + 10);
        const a = gx[r0 + x0] * tx + gy[r0 + x0] * ty, b = gx[r0 + x1] * (tx - 1) + gy[r0 + x1] * ty;
        const c = gx[r1 + x0] * tx + gy[r1 + x0] * (ty - 1), d = gx[r1 + x1] * (tx - 1) + gy[r1 + x1] * (ty - 1);
        const top = a + (b - a) * sx;
        return top + (c + (d - c) * sx - top) * sy;
    }

    function addOctave(out, n, l, amp) {
        const k = l.cells / n;
        for (let y = 0; y < n; y++) {
            const row = y * n, ly = y * k;
            for (let x = 0; x < n; x++) out[row + x] += amp * perlin(l, x * k, ly);
        }
    }

    function normalise(field) {
        let lo = Infinity, hi = -Infinity;
        for (let i = 0; i < field.length; i++) {
            if (field[i] < lo) lo = field[i];
            if (field[i] > hi) hi = field[i];
        }
        const k = 1 / (hi - lo);
        for (let i = 0; i < field.length; i++) field[i] = (field[i] - lo) * k;
        return field;
    }

    // Two tileable fields, n × n (a power of two), each 0 to 1: `a` soft
    // (drifts, rolls, where the forest thins), `b` ridged (the far ridges).
    function bake(random, n = 256) {
        const a = new Float32Array(n * n), b = new Float32Array(n * n);
        let amp = 1;
        for (const cells of [2, 4, 8, 16, 32, 64]) {
            addOctave(a, n, lattice(cells, random), amp);
            amp *= 0.5;
        }
        const ridged = [3, 6, 12, 24].map(cells => lattice(cells, random));
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                let ridge = 0, weight = 1;
                amp = 1;
                for (const l of ridged) {
                    let r = 1 - Math.abs(perlin(l, x / n * l.cells, y / n * l.cells)) * 1.7;
                    r = r < 0 ? 0 : r * r * weight;
                    weight = r * 1.8 > 1 ? 1 : r * 1.8;
                    ridge += r * amp;
                    amp *= 0.5;
                }
                b[y * n + x] = ridge;
            }
        }
        normalise(a);
        normalise(b);
        return { n, a, b };
    }

    // A field as texture mips, RGBA bytes: the height in 16 bits (R high, G
    // low) and its slopes in B and A (±gmax, per tile width).
    function pack(field, n) {
        const mips = [];
        let gmax = 0, level = field, size = n;
        for (;;) {
            const gu = new Float32Array(size * size), gv = new Float32Array(size * size), mask = size - 1, half = size / 2;
            for (let y = 0; y < size; y++) {
                const row = y * size, up = ((y - 1) & mask) * size, down = ((y + 1) & mask) * size;
                for (let x = 0; x < size; x++) {
                    gu[row + x] = (level[row + ((x + 1) & mask)] - level[row + ((x - 1) & mask)]) * half;
                    gv[row + x] = (level[down + x] - level[up + x]) * half;
                }
            }
            if (!mips.length) for (let i = 0; i < gu.length; i++) gmax = Math.max(gmax, Math.abs(gu[i]), Math.abs(gv[i]));
            const bytes = new Uint8ClampedArray(size * size * 4), k = 127.5 / gmax;
            for (let i = 0, o = 0; i < level.length; i++, o += 4) {
                const h = Math.round(level[i] * 65535);
                bytes[o] = h >> 8;
                bytes[o + 1] = h & 255;
                bytes[o + 2] = gu[i] * k + 127.5;
                bytes[o + 3] = gv[i] * k + 127.5;
            }
            mips.push(new Uint8Array(bytes.buffer));
            if (size === 1) break;
            const next = new Float32Array(half * half);
            for (let y = 0; y < half; y++) {
                for (let x = 0; x < half; x++) {
                    const i = y * 2 * size + x * 2;
                    next[y * half + x] = (level[i] + level[i + 1] + level[i + size] + level[i + size + 1]) / 4;
                }
            }
            level = next;
            size = half;
        }
        return { mips, gmax };
    }

    // Bilinear, wrapping.
    function sample(field, n, u, v) {
        const fx = (u - Math.floor(u)) * n - 0.5, fy = (v - Math.floor(v)) * n - 0.5;
        const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
        const x0 = (ix + n) & (n - 1), x1 = (ix + 1 + n) & (n - 1), y0 = ((iy + n) & (n - 1)) * n, y1 = ((iy + 1 + n) & (n - 1)) * n;
        return (field[y0 + x0] * (1 - tx) + field[y0 + x1] * tx) * (1 - ty) + (field[y1 + x0] * (1 - tx) + field[y1 + x1] * tx) * ty;
    }

    // ---- The course ---------------------------------------------------------------
    // Each kind of section: how long, how wide (half the piste, metres), how
    // steep (metres down per metre on), how far it drifts and winds, how
    // rough the snow, how wooded its sides, whether it is groomed and lit,
    // how fast it is ridden (× the cruise), whether riders go through one at
    // a time, whether strangers ski it, and how often it comes up.
    const TYPES = {
        groomer: { len: [280, 440], w: [22, 30], grade: 0.25, drift: 0.3, wig: 1, rough: 0.12, trees: 1, groom: 1, pace: 1, open: true, weight: 3 },
        powder: { len: [280, 460], w: [42, 58], grade: 0.34, drift: 0.25, wig: 0.6, rough: 1, trees: 0.3, groom: 0, pace: 1.06, open: true, weight: 3 },
        glade: { len: [220, 340], w: [26, 32], grade: 0.29, drift: 0.3, wig: 0.7, rough: 0.7, trees: 1, groom: 0, pace: 0.8, weight: 2.5 },
        pipe: { len: [150, 170], w: [9, 9], grade: 0.17, drift: 0, wig: 0, rough: 0.04, trees: 0.8, groom: 1, pace: 0.62, single: true, weight: 1.2 },
        park: { len: [250, 300], w: [24, 28], grade: 0.22, drift: 0.1, wig: 0.2, rough: 0.06, trees: 0.9, groom: 1, pace: 0.96, weight: 1.6 },
        rollers: { len: [160, 220], w: [20, 26], grade: 0.24, drift: 0.2, wig: 0.4, rough: 0.08, trees: 0.9, groom: 1, pace: 0.95, open: true, weight: 1.4 },
        lake: { len: [180, 240], w: [60, 80], grade: 0.02, drift: 0.2, wig: 0.2, rough: 0.03, trees: 0.6, groom: 0, pace: 0.92, open: true, weight: 1 },
        cliff: { len: [150, 180], w: [26, 32], grade: 0.3, drift: 0.2, wig: 0.3, rough: 0.8, trees: 0.6, groom: 0, pace: 0.95, weight: 1 },
        gully: { len: [220, 300], w: [4.2, 5], grade: 0.31, drift: 0.2, wig: 1.2, rough: 0.4, trees: 0.35, groom: 0, pace: 0.78, single: true, weight: 1.2 },
        cattrack: { len: [260, 340], w: [5, 6], grade: 0.075, drift: 0.8, wig: 0.15, rough: 0.08, trees: 0.9, groom: 1, pace: 0.85, single: true, weight: 1.2 },
        hut: { len: [150, 170], w: [30, 34], grade: 0.1, drift: 0.1, wig: 0.2, rough: 0.08, trees: 0.8, groom: 1, pace: 0.8, open: true, weight: 0.7, stop: true },
        lodge: { len: [210, 240], w: [34, 40], grade: 0.08, drift: 0.05, wig: 0, rough: 0.08, trees: 0.8, groom: 1, pace: 0.8, open: true, weight: 0.7, stop: true },
    };
    // The grand lodge, in its own metres: lx along its front (down the mountain
    // on one side of the run, up it on the other), lz out from its middle
    // towards the piste, whose edge is `out` away. It stands on a level pad;
    // its terrace is `deck` above that, between the front wall and the steps.
    const LODGE = {
        out: 24, deck: 1, steps: [14.6, 16.6], table: [5.5, 11], bench: 0.85, seatY: 0.45, berth: 1.9,
        // Four places at the friends' table, two a side: [lx, lz, which way they face along lz].
        seat: i => [LODGE.table[0] + (i & 1 ? 0.55 : -0.55), LODGE.table[1] + (i < 2 ? LODGE.bench : -LODGE.bench), i < 2 ? -1 : 1],
    };
    // In for a drink: seconds getting out of the skis, on foot to the table (and back), and sitting over it; and between one setting off and the next.
    const APRES = { off: 1.2, walk: 7.5, sit: 16, gap: 0.7 };
    const ORDER = Object.keys(TYPES);
    const CHUNK = 32;                 // metres of course to a square of mesh, and to a batch of trees
    const BLEND = 40;                 // metres over which one section's shape becomes the next's
    const SLOTS = 4;                  // lines abreast down the piste
    const PIPE = { flat: 3.2, wall: 4.3, speed: 10.5 };      // speed: across the flat, metres a second
    const slotU = (slot, wu) => (-0.75 + 0.5 * slot) * wu;
    const win = t => smooth(0.06, 0.16, t) * (1 - smooth(0.84, 0.94, t));

    // A jump: rising to its lip over `run` metres, falling away over `land`.
    function kicker(dz, du, k) {
        if (dz < -k.run || dz > k.land) return 0;
        const m = 1 - smooth(k.half, k.half + 3, Math.abs(du));
        if (m <= 0) return 0;
        if (dz <= 0) { const q = 1 + dz / k.run; return k.h * q * q * m; }
        return k.h * (1 - sq(dz / k.land)) * m;
    }

    // seed: which mountain. o: { z, x } where it starts (anywhere: nothing
    // here depends on being near zero), steep (× every grade), sections (the
    // kinds allowed).
    function course(seed, o = {}) {
        const steep = o.steep ?? 1, z00 = o.z || 0, x00 = o.x || 0;
        const listed = (o.sections || []).filter(t => TYPES[t]), allowed = listed.length ? listed : ORDER;
        const fields = bake(rng(seed ^ 0x51ED270B), 256), N = fields.n, A = fields.a, B = fields.b;
        const na = (x, z, size) => sample(A, N, x / size, z / size);
        const sections = [], lifts = [];

        function make(i, p) {
            const r = rng(Math.floor(hash(seed, i, 77) * 4294967296));
            let type = allowed.includes('groomer') ? 'groomer' : allowed[0];
            if (p) {
                // Never two alike in a row, nor two narrow ones, nor straight off the wide lake into a narrow place.
                let pool = allowed.filter(t => t !== p.type && !(TYPES[t].single && (p.T.single || p.type === 'lake')) && !(TYPES[t].stop && (i < 3 || p.T.stop)));
                if (!pool.length) pool = allowed;
                let total = 0;
                for (const t of pool) total += TYPES[t].weight;
                let pick = r() * total;
                type = pool[pool.length - 1];
                for (const t of pool) { pick -= TYPES[t].weight; if (pick <= 0) { type = t; break; } }
            }
            const T = TYPES[type], len = Math.round(mix(T.len[0], T.len[1], r())), W = mix(T.w[0], T.w[1], r());
            const g = T.grade * steep * mix(0.9, 1.1, r()), k = (r() < 0.5 ? -1 : 1) * T.drift * mix(0.4, 1, r());
            const wigN = Math.max(1, Math.round(len / mix(150, 240, r())));
            const s = {
                i, type, T, len, W, g, k, z0: p ? p.z1 : z00, z1: 0, E0: p ? p.E1 : 0, C0: p ? p.C1 : x00,
                wp: p ? p.W : W, gp: p ? p.g : g, kp: p ? p.k : k, rp: p ? p.T.rough : T.rough, B: Math.min(clamp(Math.abs(W - (p ? p.W : W)) * 2.2, BLEND, 110), len * 0.45),
                wigA: T.wig * 0.4 * len / (TAU * wigN), wigN, wigP: r() * TAU, side: r() < 0.5 ? -1 : 1,
                kickers: [], rails: [], lanes: null, cut: null, lift: null, E1: 0, C1: 0,
            };
            s.z1 = s.z0 + len;
            const wu = W - 1.5;
            if (type === 'park') {
                const js = r() < 0.5 ? 1 : 2, rs = js === 1 ? 3 : 0;
                [[0.2, 1.7, 12, 15], [0.47, 2.2, 14, 18], [0.76, 3.1, 17, 24]].forEach(([t, h, run, land], n) => s.kickers.push({ z: s.z0 + t * len, u: slotU(js, wu), slot: js, h, run, land, half: 3.2, big: n === 2 }));
                [[0.2, 9, 0], [0.48, 11, 1], [0.77, 9, 0]].forEach(([t, l, box]) => {
                    const z = s.z0 + t * len, u = slotU(rs, wu);
                    s.rails.push({ z, u, slot: rs, len: l, box });
                    s.kickers.push({ z, u, slot: rs, h: 0.5, run: 5, land: 3, half: 1.3, lip: true });
                });
            } else if (type === 'powder' && r() < 0.6) {
                const slot = Math.floor(r() * SLOTS);
                s.kickers.push({ z: s.z0 + mix(0.35, 0.65, r()) * len, u: slotU(slot, wu), slot, h: 1.5, run: 11, land: 15, half: 4.5, natural: true });
            } else if (type === 'rollers') s.lam = mix(20, 26, r());
            else if (type === 'cliff') { s.drop = mix(5, 6.4, r()); s.zc = s.z0 + 0.5 * len; s.half = 11; }
            else if (T.stop) s.zs = s.z0 + 0.5 * len;
            else if (type === 'glade') s.lanes = [0, 1, 2, 3].map(() => ({ a: mix(0.5, 1, r()), lam: mix(70, 110, r()), ph: r() * TAU }));
            else if (type === 'cattrack') s.side = k > 0 ? 1 : -1;       // the hill rises on the side the track bears to
            // A way off the piste, through the trees and back.
            if (type === 'groomer' && r() < 0.7) s.cut = { side: r() < 0.5 ? -1 : 1, t0: mix(0.15, 0.25, r()), t1: mix(0.62, 0.7, r()), out: mix(9, 14, r()) };
            s.wantLift = type === 'cattrack' || (type === 'groomer' && r() < 0.5) || (type === 'powder' && r() < 0.25);
            s.liftAt = mix(0.4, 0.6, r());
            s.E1 = elevIn(s, len);
            s.C1 = centreIn(s, len);
            return s;
        }

        // A chairlift over section s, once the section after it exists: a
        // straight line that crosses the run, its ends off in the trees.
        function hang(s, next) {
            const zm = s.z0 + s.liftAt * s.len, first = sections[0];
            const za = Math.max(zm - 250, first.z0 + 5), zb = Math.min(zm + 250, next.z1 - 10);
            if (zb - za < 260) return;
            const sg = s.side, xa = centre(za) - sg * (width(za) + 26), xb = centre(zb) + sg * (width(zb) + 26);
            const lift = { za, zb, xa, xb, towers: [], i: s.i };
            lift.x = z => xa + (xb - xa) * (z - za) / (zb - za);
            const n = Math.round((zb - za) / 52);
            for (let j = 0; j <= n; j++) {
                const z = za + (zb - za) * j / n, x = lift.x(z);
                // Never a tower on the piste: the cable spans it.
                if (j > 0 && j < n && Math.abs(x - centre(z)) < width(z) + 5) continue;
                lift.towers.push({ x, z, y: height(x, z), top: j === 0 || j === n ? 5.5 : 9.5 });
            }
            if (lift.towers.length < 3) return;
            // Clear of the snow all the way: where a span sags into rising ground, a tower goes in under
            // its lowest point, or (over a piste, where no tower may stand) the towers either side grow.
            if (!clear(lift)) return;
            lift.length = 0;
            for (let j = 1; j < lift.towers.length; j++) {
                const a = lift.towers[j - 1], b = lift.towers[j];
                a.at = lift.length;
                lift.length += Math.hypot(b.x - a.x, b.z - a.z);
                b.at = lift.length;
            }
            s.lift = lift;
            lifts.push(lift);
        }

        // How far the lowest feet on a chair hang below the cable (the chair is 2.7 m, a rider's boots
        // and skis below that), and the room they need above the snow: off the piste, and over it,
        // where riders pass under (and now and then pop a jump).
        // At either station the chairs swing in low over its platform to load, so the room grows from a little
        // under nothing (`platform`) to all of it over the first `station` metres.
        // (apart: no two towers closer than that.)
        const HANG = 4, ROOM = { off: 2, piste: 5.5, station: 40, platform: 1.2, apart: 30 }, TOP = { max: 30 };
        // The worst shortfall of room along the span from tower a to tower b: { need, f } with f how
        // far along it is, or null if the chairs are clear everywhere.
        function shortfall(lift, a, b) {
            const tw = lift.towers, first = tw[0], last = tw[tw.length - 1], yaw = Math.atan2(lift.xb - lift.xa, lift.zb - lift.za), cy = Math.cos(yaw), sy = Math.sin(yaw);
            const len = Math.hypot(b.x - a.x, b.z - a.z), steps = Math.max(2, Math.ceil(len / 2));
            let worst = null;
            for (let k = 1; k < steps; k++) {
                const f = k / steps, x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f, feet = a.y + a.top + (b.y + b.top - a.y - a.top) * f - 0.3 - HANG;
                // Both cables, and the width of a chair about each.
                for (const off of [-3.4, -2.45, -1.5, 1.5, 2.45, 3.4]) {
                    const px = x + off * cy, pz = z - off * sy, on = Math.abs(px - centre(pz)) < width(pz) + 2;
                    const fromEnd = Math.min(Math.hypot(x - first.x, z - first.z), Math.hypot(x - last.x, z - last.z));
                    const need = height(px, pz) + (on ? ROOM.piste : ROOM.off) * smooth(0, ROOM.station, fromEnd) - ROOM.platform * (1 - smooth(0, ROOM.station, fromEnd)) - feet;
                    if (need > 0 && (!worst || need > worst.need)) worst = { need, f, x, z };
                }
            }
            return worst;
        }
        function clear(lift) {
            const tw = lift.towers;
            for (let pass = 0; pass < 60; pass++) {
                let fixed = true;
                for (let j = 1; j < tw.length; j++) {
                    const a = tw[j - 1], b = tw[j], w = shortfall(lift, a, b);
                    if (!w) continue;
                    fixed = false;
                    // A tower goes under the lowest point if it may stand there (off the piste, and not on top of
                    // either end); over the piste, at its edge, the nearest place to the low point that it may.
                    const len = Math.hypot(b.x - a.x, b.z - a.z), may = f => { const z = a.z + (b.z - a.z) * f, x = lift.x(z); return f * len > ROOM.apart && (1 - f) * len > ROOM.apart && Math.abs(x - centre(z)) > width(z) + 5; };
                    let at = null;
                    for (let d = 0; d <= 1 && at === null; d += 1 / Math.max(8, len)) {
                        if (may(w.f - d)) at = w.f - d; else if (may(w.f + d)) at = w.f + d;
                    }
                    if (at !== null) {
                        const z = a.z + (b.z - a.z) * at, x = lift.x(z);
                        tw.splice(j, 0, { x, z, y: height(x, z), top: 9.5 });
                    } else {
                        // Else both ends grow, by half a metre at a time, the one nearer the low point first.
                        const near = w.f < 0.5 ? a : b, far = near === a ? b : a, end = t => t === tw[0] || t === tw[tw.length - 1];
                        const grow = t => { if (end(t) || t.top >= TOP.max) return false; t.top = Math.min(TOP.max, t.top + 0.5); return true; };
                        if (!grow(near) && !grow(far)) return false;        // nothing left to give: no lift here
                    }
                    break;
                }
                if (fixed) return true;
            }
            return false;
        }

        let building = false;
        function ensure(z) {
            if (building) return;           // a lift being hung asks only about what is already there
            building = true;
            if (!sections.length) sections.push(make(0, null));
            let last = sections[sections.length - 1];
            while (last.z0 <= z + 800) {
                const next = make(last.i + 1, last);
                sections.push(next);
                if (last.wantLift) hang(last, next);
                last = next;
            }
            building = false;
        }

        let cur = null;
        function find(z) {
            if (cur && z >= cur.z0 && z < cur.z1) return cur;
            ensure(z);
            let lo = 0, hi = sections.length - 1;
            while (lo < hi) {
                const m = (lo + hi + 1) >> 1;
                if (sections[m].z0 <= z) lo = m; else hi = m - 1;
            }
            return (cur = sections[lo]);
        }

        // Forget what is far behind (an endless run would otherwise keep it all).
        function trim(z) {
            while (sections.length > 6 && sections[1].z1 < z - 1500) sections.shift();
            while (lifts.length && lifts[0].zb < z - 1500) lifts.shift();
            cur = null;
        }

        // Within section s, d metres in. Before a section's start (only ever
        // the first's) everything carries on straight.
        const ramp = (s, d) => d <= 0 ? 0 : d >= s.B ? d - s.B / 2 : s.B * ((q => q * q * q - q * q * q * q / 2)(d / s.B));
        const blend = (s, d) => d <= 0 ? 0 : d >= s.B ? 1 : sq(d / s.B);
        function elevIn(s, d) { return s.E0 - (s.gp * d + (s.g - s.gp) * ramp(s, d)); }
        function centreIn(s, d) {
            let c = s.C0 + s.kp * d + (s.k - s.kp) * ramp(s, d);
            if (d > 0 && s.wigA) { const t = d / s.len, e = Math.sin(Math.PI * t); c += s.wigA * Math.sin(TAU * s.wigN * t + s.wigP) * e * e; }
            return c;
        }
        const widthIn = (s, d) => s.wp + (s.W - s.wp) * blend(s, d);
        function centre(z) { const s = find(z); return centreIn(s, z - s.z0); }
        function elev(z) { const s = find(z); return elevIn(s, z - s.z0); }
        function width(z) { const s = find(z); return widthIn(s, z - s.z0); }
        const slope = z => centre(z + 0.5) - centre(z - 0.5);

        // A glade's line for a slot: the slot's own band, wandering.
        // The lanes start as wide as the piste they come from and draw together at the far end.
        function laneU(s, slot, d) {
            const l = s.lanes[slot], t = d / s.len, full = s.W - 1.5;
            const wu = mix(mix(Math.min(full, s.wp - 1.5), full, smooth(0, 0.2, t)), Math.min(full, 9), smooth(0.78, 0.98, t));
            return slotU(slot, wu) + l.a * Math.max(0, 0.25 * wu - 2.2) * Math.sin(TAU * d / l.lam + l.ph) * win(t);
        }
        // The way off a groomer and back, as u; null where it is not.
        function cutU(s, d, w) {
            const c = s.cut, t = d / s.len;
            if (!c || t <= c.t0 || t >= c.t1) return null;
            const e = Math.sin(Math.PI * (t - c.t0) / (c.t1 - c.t0)), wu = w - 1.5;
            return c.side * (0.75 * wu + (w + c.out - 0.75 * wu) * e * e);
        }

        // What a section adds to the plain slope at u across and d along.
        function feature(s, u, d, w, x, z) {
            const t = d / s.len, a = Math.abs(u);
            let h = 0;
            for (const k of s.kickers) h += kicker(z - k.z, u - k.u, k);
            switch (s.type) {
                case 'pipe': {
                    if (a <= PIPE.flat) return h;
                    // Walls up to the lip, a deck beyond it, then back down to the hill.
                    return h + win(t) * PIPE.wall * (a < s.W ? 1 - Math.cos((a - PIPE.flat) / (s.W - PIPE.flat) * Math.PI / 2) : 1 - smooth(s.W + 5, s.W + 19, a));
                }
                case 'gully': {
                    const out = a - w;
                    return h + win(t) * (0.012 * Math.min(a, w) ** 2 + (out > 0 ? 11 * (1 - Math.exp(-out / 11)) : 0));
                }
                case 'rollers': return h + win(t) * 1.15 * (0.5 - 0.5 * Math.cos(TAU * d / s.lam));
                case 'cliff': {
                    // The whole section loses `drop` metres more than its grade: all
                    // at once in the middle of the run, and gently round the sides.
                    const L = mix(2.2, 0.55 * s.len, smooth(s.half, s.half + 9, a));
                    return h + s.drop * (smooth(0.08, 0.92, t) - smooth(-0.5, 0.5, (z - s.zc) / L));
                }
                case 'powder': {
                    // Pillows: a mound in some squares of an 18 m grid.
                    const cx = Math.floor(u / 18), cz = Math.floor(z / 18);
                    if (hash(seed, cx * 7919 + cz, 5) < 0.24 && a < w - 4) {
                        const px = (cx + 0.3 + 0.4 * hash(seed, cx, cz)) * 18, pz = (cz + 0.3 + 0.4 * hash(seed, cz, cx + 9)) * 18;
                        const q = 1 - ((u - px) ** 2 + (z - pz) ** 2) / 20;
                        if (q > 0) h += win(t) * smooth(w - 4, w - 9, a) * (0.6 + 0.6 * hash(seed, cx + 3, cz)) * q * q;
                    }
                    return h;
                }
                case 'cattrack': {
                    // Cut across the hill: a bank up on one side, a drop on the other.
                    const out = u > w ? u - w : u < -w ? u + w : 0;
                    return h + win(t) * s.side * 0.62 * out / (1 + Math.abs(out) / 120);
                }
                default: return h;
            }
        }

        // Where the lodge stands, and anything in its own metres put into the world's.
        function lodge(s) {
            if (!s.lodge) {
                const side = s.side, d = s.zs - s.z0, x = centreIn(s, d) + side * (s.W + LODGE.out), y = elevIn(s, d), z = s.zs;
                s.lodge = { x, y, z, side, yaw: -side * Math.PI / 2, at: (lx, ly, lz) => [x - side * lz, y + ly, z + side * lx] };
            }
            return s.lodge;
        }
        // How much of the lodge's level pad is under (u, z): all of it under the building and its terrace, none by the piste's edge.
        function pad(s, u, z) {
            const out = s.side * u - s.W, dx = Math.max(0, Math.abs(z - s.zs) - 15), dz = Math.max(0, 6.5 - out, out - 32);
            return dx > 6 || dz > 6 ? 0 : 1 - smooth(0, 6, Math.hypot(dx, dz));
        }

        function shape(s, u, d, x, z) {
            const f = blend(s, d), w = s.wp + (s.W - s.wp) * f, a = Math.abs(u), out = a - w;
            const rough = s.rp + (s.T.rough - s.rp) * f, off = out <= -4 ? 0 : out >= 14 ? 1 : sq((out + 4) / 18);
            let h = ((na(x, z, 47) - 0.5) * 1.5 + (na(x + 300, z, 190) - 0.5) * 4.5) * (rough + (1 - rough) * off);
            if (out > 0) {
                // The valley's sides: each rises or falls away as it pleases, and further out there are ridges.
                // A side that rises comes to a crest and sinks again before the land runs out, so its far edge is never seen; one that falls just falls away.
                const sg = u > 0 ? 1 : -1, far = smooth(25, 280, out);
                const side = (na(z, sg * 5000, 800) - 0.38) * 1.6 * 230 * (1 - Math.exp(-out / 230)) * out / (out + 25) + far * ((sample(B, N, x / 1300, z / 1300) - 0.35) * 150 + (na(x, z + 500, 310) - 0.5) * 40);
                h += side > 0 ? side * (1 - smooth(450, 690, out)) : side;
                if (s.type === 'lodge') { const m = pad(s, u, z); if (m > 0) h = mix(h, elevIn(s, s.zs - s.z0) - elevIn(s, d), m); }
            }
            return h + feature(s, u, d, w, x, z);
        }

        function height(x, z) {
            const s = find(z), d = z - s.z0;
            return elevIn(s, d) + shape(s, x - centreIn(s, d), d, x, z);
        }

        // How far (x, z) is from anywhere a rider may go: negative on the
        // piste. Trees keep their distance from it.
        function room(x, z) {
            const s = find(z), d = z - s.z0, t = d / s.len, w = widthIn(s, d), u = x - centreIn(s, d), a = Math.abs(u);
            let m = a - w;
            if (s.type === 'glade') {
                // Among a glade's trees only its lanes are kept clear; its ends are open piste.
                let lane = Infinity;
                for (let j = 0; j < SLOTS; j++) lane = Math.min(lane, Math.abs(u - laneU(s, j, d)));
                m = t > 0.12 && t < 0.9 ? Math.min(lane, a > w ? a - w + 3 : Infinity) : Math.min(m, lane);
            }
            const c = cutU(s, d, w);
            if (c !== null) m = Math.min(m, Math.abs(u - c) - 0.6);
            if (s.type === 'pipe') m = Math.min(m, a - w - 22);
            if (s.type === 'gully') m = Math.min(m, a - w - 5);
            if (s.type === 'hut') m = Math.min(m, Math.hypot(u - s.side * (w + 11), z - s.zs - 8) - 15);
            if (s.type === 'lodge') m = Math.min(m, Math.max(Math.abs(z - s.zs) - 20, Math.abs(s.side * u - s.W - 18) - 20));
            for (const l of lifts) if (z > l.za - 8 && z < l.zb + 8) m = Math.min(m, Math.abs(x - l.x(z)) - 4.5);
            return m;
        }

        // The trees and rocks of chunk k, eight floats each: x, y, z from the
        // chunk's own corner (centre(z0), elev(z0), z0), height in metres,
        // turn, kind (0 spruce, 1 fir, 2 pine, 3 snow ghost, 4 snag, 5 rock),
        // a tint 0 to 1, and its trunk's radius.
        function trees(k) {
            const z0 = k * CHUNK, ox = centre(z0), oy = elev(z0), out = [], CELL = 4.5, rows = Math.round(CHUNK / CELL);
            for (let j = 0; j < rows; j++) {
                const zc = z0 + (j + 0.5) * CHUNK / rows, s = find(zc), cz = k * rows + j;
                const c0 = centre(zc), cu = Math.round(c0 / CELL);
                for (let i = -116; i <= 116; i++) {
                    const ci = cu + i, h0 = hash(seed, ci, cz);
                    const x = (ci + 0.15 + 0.7 * hash(seed, ci, cz + 77777)) * CELL, z = z0 + (j + 0.15 + 0.7 * hash(seed, ci + 55555, cz)) * CHUNK / rows;
                    const a = Math.abs(x - c0);
                    // Thick by the piste, thinning up the valley sides; clumps and clearings.
                    const near = a < 70 ? 0.85 : a < 190 ? 0.6 : 0.26;
                    if (h0 > near * s.T.trees) continue;
                    const gap = room(x, z);
                    if (gap < 2.6) continue;
                    const rocky = gap > 3.8;
                    const clump = smooth(0.34, 0.52, na(x, z, 170));
                    if (h0 > near * s.T.trees * (0.12 + 0.88 * clump)) continue;
                    const y = height(x, z), steepX = Math.abs(height(x + 1.5, z) - height(x - 1.5, z)) / 3, steepZ = Math.abs(height(x, z + 1.5) - height(x, z - 1.5)) / 3;
                    const pick = hash(seed, ci + 31, cz + 17);
                    if (Math.hypot(steepX, steepZ) > 0.95) {
                        if (pick < 0.12 && rocky) out.push(x - ox, y - oy, z - z0, 1.2 + 2.6 * hash(seed, ci, cz + 5), pick * 60, 5, hash(seed, ci + 9, cz), 0.9);
                        continue;
                    }
                    // Small beside the runs and the lanes, tall in the deep wood.
                    const grown = 0.3 + 0.7 * smooth(2.6, 9, gap), size = (0.55 + 0.45 * hash(seed, ci + 1, cz + 1)) * grown;
                    let kind = pick < 0.5 ? 0 : pick < 0.74 ? 1 : pick < 0.87 ? 2 : pick < 0.92 ? 4 : 3;
                    if (grown < 0.45 && pick > 0.6) kind = 3;
                    if (kind === 3 && pick > 0.97 && rocky) kind = 5;
                    // Its boughs reach a fifth of its height or so: never as far as the gap it stands in.
                    const tall = kind === 3 ? 1.4 + 3 * size : kind === 5 ? 0.8 + 1.4 * size : kind === 2 ? 5 + 14 * size : kind === 1 ? 16 * size : kind === 4 ? 4 + 9 * size : 22 * size;
                    out.push(x - ox, y - oy, z - z0, tall, pick * 60, kind, hash(seed, ci + 9, cz), kind === 5 ? 0.8 : kind === 3 ? 0.25 : 0.1 + tall * 0.016);
                }
            }
            return { k, x: ox, y: oy, z: z0, n: out.length / 8, data: new Float32Array(out) };
        }

        // Floodlight masts by the groomed runs, every 48 m, a side in turn.
        function masts(za, zb, out = []) {
            for (let n = Math.ceil(za / 48); n * 48 < zb; n++) {
                const z = n * 48, s = find(z);
                if (!s.T.groom || s.type === 'cattrack') continue;
                const sg = n & 1 ? 1 : -1, w = width(z), reach = s.type === 'pipe' ? w + 8 : w + 2.2, x = centre(z) + sg * reach;
                out.push({ x, z, y: height(x, z), top: 8.5, side: sg });
            }
            return out;
        }

        ensure(z00);
        return { seed, steep, sections, lifts, fields, find, ensure, trim, centre, centreIn, elev, elevIn, width, widthIn, slope, height, room, lodge, trees, masts, laneU, cutU, na };
    }

    // ---- Riders -------------------------------------------------------------------
    const CRUISE = 14;                // metres a second at Speed 1 on a groomer
    const TRICKS = [
        { name: 'grab', T: 0.42, grab: 1, hard: 0.2 },
        { name: 'spread eagle', T: 0.45, spread: 1, kind: 'ski', hard: 0.2 },
        { name: 'shifty', T: 0.42, twist: 1, hard: 0.15 },
        { name: '360', T: 0.75, yaw: 1, hard: 0.5 },
        { name: '360 grab', T: 0.85, yaw: 1, grab: 1, hard: 0.6 },
        { name: 'backflip', T: 1.0, pitch: -1, hard: 0.8 },
        { name: 'front flip', T: 1.05, pitch: 1, hard: 0.85 },
        { name: '720', T: 1.25, yaw: 2, hard: 0.9 },
        { name: 'cork 720', T: 1.3, yaw: 2, tilt: 0.6, grab: 1, hard: 1 },
    ];
    const FALL = { lie: 0.7, sit: 1.3, shake: 1.2, rise: 0.8 };
    // What moves a rider is the hill: gravity down the snow under it, less the
    // snow's drag (more in powder than on ice) and the air's (less in a tuck).
    // All a rider adds is a skate to get going and the scrub of its edges, and
    // no edge holds more than GRIP, across the hill or against it.
    const DRAG = 0.003, GRIP = 0.7 * G, SIDE = 6, POP = { load: 0.2, vy: 4 };
    const snowDrag = rough => (0.025 + 0.04 * rough) * G;
    // A turn's shape, for sin: rounder at its apex and quicker from edge to edge, as carved arcs are.
    const B3 = 1 / 27;
    const wave = p => (Math.sin(p) + B3 * Math.sin(3 * p)) / (1 - B3), waveD = p => (Math.cos(p) + 3 * B3 * Math.cos(3 * p)) / (1 - B3);
    // What a line's own turn asks of the edges at a phase of it, in m/s² to the rider's right: its speed squared times the line's
    // curvature, and the hill's pull across the skis (`pull` is g sin(alpha)), which helps a turn above the fall line and fights it below.
    // (k is 2 pi over the turn's length, dC the way the piste itself runs across.)
    const carve = (v, dC, k, a, phase, pull) => {
        const m = dC + a * k * waveD(phase), n = Math.hypot(1, m);
        return -v * v * a * k * k * (Math.sin(phase) + 9 * B3 * Math.sin(3 * phase)) / (1 - B3) / (n * n * n) + pull * (m - dC) / (n * Math.hypot(1, dC));
    };
    // How far ahead of the force a rider moves inside (seconds): what the short filter on it takes, and a little, as a skier does who knows the turn.
    const AHEAD = 0.07, ROLL = 3.2;
    // How the skis sit to the way they are going (`skid`, radians, tips to the rider's right of its travel). An edge that is turned
    // across its travel brakes by the force on it times the sine of that angle, so the angle is what the braking asks for, on top of
    // the little any skier steers by; pulled up to a halt, the skis come right across (a hockey stop). SWING is as fast as skis are
    // swung (radians a second); PLANT how long a pole plant takes, and how long of that its tip is coming to the snow and leaving it.
    const SWING = 2.2, PLANT = { T: 0.28, in: 0.06, out: 0.08, far: [0.85, 1.25] };
    const turned = a => a - TAU * Math.round(a / TAU);
    // A hand on the lead (`input` to worldStep: { steer -1 to 1, tuck 0 to 1, brake 0 to 1, jump: held }):
    // back: seconds hands-off before the lines are the riders' own again; speed: metres a second a held key moves the
    // lead across; want: how much faster a tuck wants to go; yaw, flip: radians a second it spins and flips by hand in
    // the air; charge: the most seconds of crouch a held jump takes (a longer crouch, a bigger spring: up to `more` ×);
    // clean: how far off a whole turn (radians) a landing may be and be stomped.
    const HAND = { back: 4, speed: 7, want: 0.45, yaw: 7.5, flip: 6.3, charge: 0.6, more: 0.55, clean: { yaw: 0.55, flip: 0.6 } };       // seconds hands-off before the lines are the riders' own again; metres a second a held key moves the lead across

    // cfg: { speed, tricks (0 to 2), wipeouts, friends (1 to 3), others (0 to 2), kinds: ['ski' | 'board', …] }
    function world(seed, cfg, o = {}) {
        const C = course(seed, o), random = rng(seed ^ 0x2F6E2B1);
        const W = { seed, course: C, rng: random, cfg: { ...cfg }, time: 0, riders: [], others: [], school: null, events: [], lastWipe: -30, nextId: 1,
            ghosts: 0, group: { done: -1, phase: 'ride', timer: 0, swap: 20, wood: -1 }, hand: { idle: Infinity, active: false, jump: false }, spawn: 4, creature: null, nextCreature: 25 + random() * 30 };
        const z = (o.z || 0) + 90;
        const starts = [[1, 0], [2, 13], [0, -12], [3, 25]];
        for (let i = 0; i <= 3; i++) {
            const r = rider(W, i === 0 ? 'lead' : 'friend', starts[i][0], z + starts[i][1], { kind: cfg.kinds?.[i] || 'ski', pace: 1 });
            r.v = CRUISE * cfg.speed;
            settle(W, r);
            W.riders.push(r);
        }
        W.riders.length = 1 + clamp(Math.round(cfg.friends ?? 2), 0, 3);
        return W;
    }

    function rider(W, role, slot, z, o = {}) {
        const C = W.course, wu = Math.max(1.2, C.width(z) - 1.5), u = o.u ?? slotU(slot, wu), x = C.centre(z) + u, random = W.rng;
        // How well it skis (`skill`, 0 to 1): the friends well, strangers anything from cautious (slower, wider stood, skidding their turns) to quick and tidy.
        const id = W.nextId++, rough = hash(W.seed, id + 1, 0x51D), skill = role === 'stranger' ? 1 - rough : role === 'kid' || role === 'school' ? 0.5 : 0.8 + 0.2 * (1 - rough);
        const r = settle(W, {
            id, role, slot, kind: o.kind || 'ski', z, u, x, y: C.height(x, z), vy: 0, vyG: 0, v: o.v || 0, vu: 0, vx: 0, vz: 0,
            c: u, a: 0, phase: random() * TAU, lam: o.lam ?? 44 + 26 * random(), ampPref: o.amp ?? 4.5 + 2.5 * random(), pace: (o.pace ?? 1) * (role === 'stranger' ? mix(0.88, 1.12, skill) : 1), paceP: random() * TAU,
            lane0: o.lane ?? 0, lean: 0, bank: 0, heading: 0, pitch: 0, air: false, airT: 0, lift: 0, trick: null, spin: [0, 0, 0], grab: 0, spread: 0, twist: 0,
            sw: false, fall: null, stop: 0, parked: false, pipe: 0, rail: null, pop: 0, popT: 0, manual: 0, tuck: 0, edge: 0, dist: 0, lane: false, impact: 0,
            cv: 0, pw: 0, sl: 0, psi: 0, scrub: 0, load: 0, absorb: 0, vyS: 0, tilt: 0, press: 1, force: 0, dodge: 0,
            // How far it steers its skis off their path in any turn (the friends ski well; strangers less so), how far across it stands when it stops, and which way.
            skid: 0, steer: RAD * (role === 'stranger' ? 8 + 12 * rough : 4 + 4 * rough), across: RAD * (70 + 14 * hash(W.seed, W.nextId, 0xAC5)), stopSide: 0,
            face: 0, gaze: 0, plant: 0, plantSide: 0, plantT: 1, swung: 0, tilt0: 0, y0: 0,
            // Its rhythm: which turn it is on, what this one is to its usual (`lenK` its length, `ampK` its swing), and the length its turns
            // have just now (`lamNow`, metres for a left and a right). How far its skis are down in the snow (`sink`, metres under `y`,
            // which stays on the surface); how far it has come since a planted pole's tip went in (`reach`, metres).
            skill, turn: 0, half: 0, lenK: 1, ampK: 1, lamNow: 0, sink: 0, reach: 0, berth: 0, berthAt: -1,
        });
        r.half = Math.floor(r.phase / Math.PI);
        rhythm(W, r);
        r.lamNow = r.lam * r.lenK;
        return r;
    }

    // Nobody turns like a metronome. From turn to turn the length and the swing wander by about 15%, each rider in its own way;
    // and now and then one strings three or four short turns together, or lets a long one run. (The same for the same seed, rider
    // and turn: nothing is drawn from the world's dice.) Asked at each edge change; the line eases to it.
    function rhythm(W, r) {
        const n = r.turn, id = r.id * 7919, wander = t => { const i = Math.floor(t); return mix(hash(W.seed, id, i), hash(W.seed, id, i + 1), sq(t - i)) * 2 - 1; };
        r.lenK = 1 + 0.18 * wander(n / 3);
        r.ampK = 1 + 0.18 * wander(n / 3 + 4096.5);
        if (r.role === 'school') { r.lenK = r.ampK = 1; return; }
        const spell = hash(W.seed, id + 1, Math.floor(n / 12)), at = n % 12;
        if (spell < 0.4 && at >= 5 && at < (spell < 0.2 ? 9 : 8)) r.lenK *= 0.62;
        else if (spell > 0.65 && at === 6) { r.lenK *= 1.5; r.ampK *= 1.15; }
    }

    // On the snow from the first step, at the speed it has: the snow is falling away under it just so fast.
    function settle(W, r) {
        r.sl = W.course.elev(r.z + 0.5) - W.course.elev(r.z - 0.5);
        r.vyG = r.vyS = r.sl * r.v;
        return r;
    }

    // Will this rider take that jump? The same answer every time it is asked.
    function hits(W, r, k) {
        if (r.role !== 'lead' && r.role !== 'friend') return false;
        if (k.lip) return r.slot === k.slot;
        if (r.slot !== k.slot) return false;
        return hash(W.seed, r.id * 131, Math.floor(k.z)) < (k.natural ? 0.6 : 0.9) * clamp(0.3 + W.cfg.tricks, 0, 1);
    }
    // Does this rider leave the piste for the trees on this section?
    const cuts = (W, r, s) => !!s.cut && (r.role === 'lead' || r.role === 'friend') && r.slot === (s.cut.side < 0 ? 0 : 3) && hash(W.seed, r.id * 17, s.i) < 0.6;

    // The line a rider means to take at z: where its middle is (u), how wide
    // it swings and over what length, and whether it is a lane between trees.
    function line(W, r, z) {
        // Where the piste is about to narrow, the line is already drawing in.
        const C = W.course, s = C.find(z), d = z - s.z0, t = d / s.len, w = C.widthIn(s, d), far = Math.max(1, r.v / CRUISE), wu = Math.max(1.2, Math.min(w, C.width(z + 25 * far), C.width(z + 55 * far), C.width(z + 85 * far), C.width(z + 115 * far)) - 1.5);
        // Turns are shorter the steeper the snow (that is how speed is kept in hand) and longer the faster they are taken; on a
        // flat they run long and shallow. (`own`: the section sets the length itself, and it is kept to at once.)
        const grade = C.elev(z - 0.5) - C.elev(z + 0.5), hill = clamp(1.6 - 2.4 * grade, 0.75, 1.45);
        const out = { c: 0, a: 0, lam: r.lam, own: false, lane: false, wu, w, s, tuck: 0 };
        if (r.role === 'stranger' || r.role === 'school') {
            // They only ski the open pistes, so the piste as it is here is all they need.
            out.wu = Math.max(1.2, w - 1.5);
            out.c = clamp(r.lane0 * out.wu, -out.wu + 1, out.wu - 1);
            out.a = Math.min(r.ampPref * r.ampK, out.wu * 0.5);
            if (r.role === 'stranger') out.lam = r.lam * r.lenK * Math.sqrt(hill);
            return out;
        }
        out.lam = r.lam * r.lenK * hill * clamp(0.7 + 0.3 * r.v / (CRUISE * W.cfg.speed), 0.8, 1.15);
        out.c = slotU(r.slot, wu);
        // The steeper it is, the rounder the turns too.
        out.a = Math.max(0.3, Math.min(r.ampPref * r.ampK * clamp(0.35 + 0.65 * s.g / 0.25, 0.5, 1.3), 0.25 * wu - 0.5));
        const next = C.find(z + 34);
        if (next.type === 'glade' || next.type === 'pipe' || next.type === 'cattrack') out.a = Math.min(out.a, 0.5);
        switch (s.type) {
            case 'glade': out.c = C.laneU(s, r.slot, d); out.a = 0.5; out.lam = 17; out.own = out.lane = true; break;
            case 'pipe': out.c = (r.slot - 1.5) * 0.6; out.a = 0.3; out.lam = r.lam; out.own = true; break;
            case 'gully': out.c = 0; out.a = 0.3 + (s.W + 1.2) * win(t); out.lam = 62; out.own = true; break;
            case 'cattrack': out.c = (r.slot - 1.5) * 0.8; out.a = 0.35; out.lam = 18; out.own = true; out.tuck = 1; break;
            case 'lake': out.a *= 0.35; out.tuck = win(t); break;
            case 'rollers': out.a *= 0.4; break;
            case 'cliff': if (r.slot === 1 || r.slot === 2) out.a = mix(out.a, 0.3, smooth(45, 25, Math.abs(z - s.zc + 5))); break;
            default: break;
        }
        // Pulling in at the lodge: over to its side of the piste, one beside the next, by the steps.
        if (s.type === 'lodge' && W.group.done !== s.i && z > s.zs - 120 && z < s.zs + 6) {
            // (In the order they are across the piste as they come, so nobody has to get past anybody: `berth`, 0 the nearest the lodge.)
            const near = smooth(s.zs - 120, s.zs - 45, z), rank = r.berthAt === s.i ? r.berth : s.side > 0 ? SLOTS - 1 - r.slot : r.slot;
            out.c = mix(out.c, s.side * (wu - 1.2 - rank * LODGE.berth), near);
            out.a *= 1 - near;
        }
        if (r.cutOn === s.i) {
            const c = C.cutU(s, d, w);
            if (c !== null) { out.c = c; out.a = 0.45; out.lam = 14; out.own = out.lane = true; }
        }
        if (cuts(W, r, s) && t > s.cut.t0 - 0.08 && t < s.cut.t0) out.a = Math.min(out.a, 0.45);
        // No turn pulls harder than a rider's legs can hold: about a g.
        // (By the length its turns have now, where that is still coming round to a longer one.)
        out.a = Math.min(out.a, 9 * ((out.own ? out.lam : Math.min(out.lam, r.lamNow || out.lam)) / (TAU * Math.max(4, r.v))) ** 2);
        for (const k of s.kickers) {
            if (z > k.z - k.run - 32 && z < k.z + k.land + 8 && hits(W, r, k)) { out.c = k.u; out.a = 0; out.kicker = k; }
        }
        return out;
    }

    // What holds a rider up at (x, z): the snow, or a rail it is sliding.
    function support(W, r, x, z) {
        const g = W.course.height(x, z);
        if (r.rail && z > r.rail.z && z < r.rail.z + r.rail.len) return Math.max(g, r.rail.y0 + (r.rail.y1 - r.rail.y0) * (z - r.rail.z) / r.rail.len);
        return g;
    }
    // A rail's ends, in the world.
    function railEnds(C, rail) {
        if (rail.y0 === undefined) {
            const x0 = C.centre(rail.z) + rail.u, z1 = rail.z + rail.len, x1 = C.centre(z1) + rail.u;
            Object.assign(rail, { x0, x1, y0: C.height(x0, rail.z) + 0.12, y1: C.height(x1, z1) + 0.62 });
        }
        return rail;
    }

    // How long this rider will be in the air, from where and how it is going now.
    function airtime(W, r) {
        let x = r.x, y = r.y, z = r.z, vy = r.vy;
        for (let i = 1; i <= 240; i++) {
            vy -= G / 60;
            y += vy / 60;
            x += r.vx / 60;
            z += r.vz / 60;
            if (y <= W.course.height(x, z)) return i / 60;
        }
        return 4;
    }

    function takeOff(W, r, vy) {
        r.air = true;
        r.airT = 0;
        r.vy = vy;
        r.trick = null;
        r.load = 0;
        r.y0 = r.y;
        // Through the air at the speed it left the snow with, whichever way it was squared up.
        const vh = Math.hypot(r.vx, r.vz);
        if (vh > 1 && !r.pipe) { r.vx *= r.v / vh; r.vz *= r.v / vh; }
        const C = W.course, cfg = W.cfg, T = r.T = airtime(W, r), random = W.rng;
        if (r.role !== 'lead' && r.role !== 'friend') return;
        // With a hand on the lead, the air is the hand's: it spins, flips and grabs as it is told (and a jump sent badly still goes wrong).
        if (r === W.riders[0] && W.hand.active && r.forced !== 2 && !r.rail) {
            // (Whatever the hand was already holding when it left the snow, carving or tucking into the jump, does nothing up
            // there until it is let go: only what is pressed in the air spins or flips it.)
            const h = W.hand.now || NONE;
            r.trick = { manual: true, T, yaw: 0, flip: 0, yr: 0, fr: 0, grabbed: 0, step: r.kind === 'board' ? Math.PI : TAU, was: { yaw: Math.sign(h.steer || 0), flip: Math.sign((h.tuck || 0) - (h.brake || 0)) } };
            r.forced = 0;
            return;
        }
        const s = C.find(r.z + r.vz * T), open = s.T.open || s.type === 'park' || s.type === 'cliff';
        const want = r.pipe ? 0.8 : r.forced ? 1 : clamp(0.3 + 0.55 * cfg.tricks, 0, 1);
        if (T < 0.4 || cfg.tricks <= 0 && !r.forced || random() > want) { r.forced = 0; return; }
        const can = TRICKS.filter(k => k.T <= T * (r.pipe ? 1.25 : 0.96) && (!k.kind || k.kind === r.kind) && !(r.pipe && (k.pitch || k.yaw > 1)));
        if (!can.length) { r.forced = 0; return; }
        let total = 0;
        for (const k of can) total += 0.25 + k.hard * k.hard * 2;
        let pick = random() * total, trick = can[can.length - 1];
        for (const k of can) { pick -= 0.25 + k.hard * k.hard * 2; if (pick <= 0) { trick = k; break; } }
        // Now and then it goes wrong: only where there is open snow to tumble on.
        const landU = r.u + r.vu * T, landW = C.width(r.z + r.vz * T), clear = open && !r.pipe && Math.abs(landU) < landW - 7 && (C.find(r.z + r.vz * T + 30).T.open || C.find(r.z + r.vz * T + 30) === s) && !C.find(r.z + r.vz * T + 140).T.single;
        const wipe = r.forced === 2 || (!r.forced && cfg.wipeouts && clear && T > 0.55 && W.time - W.lastWipe > 18 && random() < 0.07 + 0.15 * trick.hard);
        r.trick = { ...trick, T, sign: random() < 0.5 ? -1 : 1, wipe: r.forced === 2 || wipe && clear, off: wipe ? (random() < 0.5 ? 0.6 : 1.32) : 1 };
        if (r.trick.wipe) W.lastWipe = W.time;
        r.forced = 0;
        W.events.push({ type: 'trick', id: r.id, name: trick.name, T });
    }

    function land(W, r, g, rate) {
        const impact = Math.max(0, rate - r.vy);
        r.air = false;
        r.y = g;
        r.vyG = rate;
        r.lift = 0;
        r.impact = impact;
        // What it was doing along the snow it keeps; what it was doing into the snow is gone. It comes away faster than it took off
        // only for having really fallen: further than a jump's own arc comes down (45% of its length), and then by no more than
        // that much height can give. (In the pipe `v` is its speed down the pipe, which a landing on the wall does not touch.)
        const vh = r.v;
        if (vh > 1 && !r.pipe) {
            const m = clamp(rate / vh, -1, 1), fell = Math.max(0, r.y0 - g - 0.45 * vh * r.airT);
            r.v = clamp((vh + r.vy * m) / (1 + m * m), 0.7 * vh, Math.max(vh, Math.min(vh * (1 + 0.1 * smooth(0.3, 1, r.airT)), 1.4 * CRUISE * W.cfg.speed, Math.sqrt(vh * vh + 2 * G * fell))));
            r.vyG = rate * r.v / vh;
        }
        if (r.pipe) r.pw = r.vu = r.pipe * clamp(0.5 * impact, 0.55, 4);
        // Back on its line, from wherever it came down.
        r.c = r.u - r.a * wave(r.phase);
        W.events.push({ type: 'land', id: r.id, x: r.x, y: g, z: r.z, power: clamp(impact / 8, 0.15, 1.5) * (r.airT > 0.25 ? 1 : 0.3) });
        const k = r.trick;
        if (k && k.manual) {
            // Stomped, if it is all but round: within HAND.clean of a whole turn (a half one on a board, which rides away switch).
            const yawOff = k.yaw - k.step * Math.round(k.yaw / k.step), flipOff = k.flip - TAU * Math.round(k.flip / TAU);
            const clean = Math.abs(yawOff) < HAND.clean.yaw && Math.abs(flipOff) < HAND.clean.flip, name = trickName(k);
            const down = !clean && W.cfg.wipeouts && !r.pipe;
            if (name) W.events.push({ type: 'stomp', id: r.id, name, clean, down });
            r.trick = null;
            if (down) { tumble(W, r); return; }
            if (Math.round(k.yaw / Math.PI) % 2) r.sw = !r.sw;
        } else if (k) {
            if (k.wipe) { r.trick = null; tumble(W, r); return; }
            if (k.yaw && k.half) r.sw = !r.sw;
            r.trick = null;
        }
        r.spin[0] = r.spin[1] = r.spin[2] = 0;
        r.grab = r.spread = r.twist = 0;
    }

    // What a trick by hand is called: its flips, its spin in degrees, and a grab if one was held.
    function trickName(k) {
        const half = Math.round(Math.abs(k.yaw) / Math.PI), flips = Math.round(Math.abs(k.flip) / TAU), grab = k.grabbed > 0.25;
        if (!half && !flips && !grab) return '';
        const flip = flips ? `${['', '', 'double ', 'triple '][Math.min(3, flips)]}${k.flip > 0 ? 'front flip' : 'backflip'}` : '';
        const name = [flip, half ? String(half * 180) : '', grab ? 'grab' : ''].filter(Boolean).join(' ');
        return name[0].toUpperCase() + name.slice(1);
    }

    // Down in the snow: a tumble, a moment lying there, sitting up, shaking it off, and up.
    function tumble(W, r) {
        // (Over and over as it slides, by how far it has come, as it always was: but in whole turns of how far it has to go, so that it comes to rest the right way up.)
        const far = slide(r.v, W.course, r.z), turns = Math.round(0.85 * far / TAU);
        r.fall = { phase: 'tumble', t: 0, roll: 0, turn: (W.rng() - 0.5) * 2, turns, k: TAU * turns / Math.max(far, 0.5) };
        r.air = false;
        r.trick = null;
        r.spin[0] = r.spin[1] = r.spin[2] = 0;
        r.grab = r.spread = r.twist = 0;
        W.lastWipe = W.time;
        W.events.push({ type: 'wipe', id: r.id, x: r.x, y: r.y, z: r.z });
    }

    // How far a tumble at v has still to slide before it stops, on the slope it is on (as fallStep slows it).
    function slide(v, C, z) {
        const c = Math.max(0.8, 4 - G * (C.elev(z - 0.5) - C.elev(z + 0.5)));
        return v > 0.7 ? 2 * (v - 0.7) - 4 * c * Math.log((v + 2 * c) / (0.7 + 2 * c)) : 0;
    }

    function fallStep(W, r, dt) {
        const f = r.fall, C = W.course;
        f.t += dt;
        if (f.phase === 'tumble') {
            // Sliding and rolling: further where it is steep.
            r.v = Math.max(0, r.v - Math.max(1.5, 4 + 0.5 * r.v - G * (C.elev(r.z - 0.5) - C.elev(r.z + 0.5))) * dt);
            r.vu *= Math.exp(-dt / 0.4);
            const w = C.width(r.z);
            r.z += r.v / Math.hypot(1, C.slope(r.z)) * dt;
            r.u = clamp(r.u + r.vu * dt, -(w - 2.5), w - 2.5);
            f.roll = Math.max(f.roll, TAU * f.turns - f.k * slide(r.v, C, r.z));
            if (r.v < 0.7) { r.v = 0; f.phase = 'lie'; f.t = 0; }
        } else if (f.t > FALL[f.phase]) {
            f.t = 0;
            if (f.phase === 'lie') f.phase = 'sit';
            else if (f.phase === 'sit') { f.phase = 'shake'; W.events.push({ type: 'shake', id: r.id, x: r.x, y: r.y, z: r.z }); } else if (f.phase === 'shake') f.phase = 'rise';
            else { r.fall = null; r.c = r.u; r.a = 0; r.phase = 0; r.cv = 0; }
        }
        r.x = C.centre(r.z) + r.u;
        r.y = C.height(r.x, r.z);
        r.vy = r.vyG = 0;
        r.lean *= Math.exp(-dt / 0.2);
        r.tilt *= Math.exp(-dt / 0.2);
        r.force = r.dodge = 0;
        r.press = 1;
        r.tuck = r.scrub = r.load = r.absorb = 0;
        r.sink *= Math.exp(-dt / 0.2);
        r.skid *= Math.exp(-dt / 0.1);
        r.face = r.gaze = r.heading;
        r.plant = r.stopSide = r.swung = 0;
    }

    // Out of the skis and across the terrace to a place at the table; a drink; and back the way they came.
    // `order`: its turn to set off, of the `n` going in (whoever stands nearest the steps goes first, and takes the furthest place at the
    // table, so nobody has to pass anybody); `lane`: which width of the steps is its own, counted along the lodge's front as they stand,
    // so no two paths to the steps cross. Back out, the last in is the first away.
    function walkIn(W, r, s, order, lane, n) {
        const C = W.course, at = C.lodge(s).at, place = SLOTS - 1 - order, seat = LODGE.seat(place), [tx, tz] = LODGE.table, lx = (lane - (n - 1) / 2) * 0.9 - 0.05, foot = at(lx, 0, LODGE.steps[1] + 0.4);
        foot[1] = C.height(foot[0], foot[2]);
        const path = [[r.x, r.y, r.z], foot, at(lx, LODGE.deck, LODGE.steps[0] - 0.4)], len = [0];
        // To the near bench from behind it; round the end of the table for the far bench (and for its far end, along behind the near one first).
        if (seat[2] < 0) path.push(at(seat[0], LODGE.deck, tz + LODGE.bench + 0.9));
        else {
            if (place & 1) path.push(at(tx + 1.9, LODGE.deck, tz + LODGE.bench + 1.15));
            path.push(at(tx + (place & 1 ? 1.9 : -1.7), LODGE.deck, tz - 0.3));
        }
        path.push(at(seat[0], LODGE.deck, seat[1]));
        for (let j = 1; j < path.length; j++) len.push(len[j - 1] + Math.hypot(path[j][0] - path[j - 1][0], path[j][2] - path[j - 1][2]));
        // (face: the way the lodge is from the piste, and sat: the way this place at the table looks. And how they stood when they
        // stopped, skis or board across the hill, which is how they stand until they are out of them, and when they are back in.)
        return { t: 0, wait: APRES.gap * order, last: APRES.gap * (n - 1), place, path, len, gear: false, seated: 0, walk: 0, face: Math.atan2(s.side, 0), sat: Math.atan2(-s.side * seat[2], 0), heading0: r.heading,
            skid: r.skid, side: r.stopSide, chest: turned(r.face - r.heading), eyes: turned(r.gaze - r.heading) };
    }
    function afootStep(W, r, dt) {
        const a = r.afoot, C = W.course, T = APRES, t = a.t += dt, tIn = T.off + a.wait, tOut = T.off + a.last + T.walk + T.sit + a.last - a.wait, total = tOut + T.walk + T.off, back = t > tOut;
        const k = t < tIn ? 0 : t < tIn + T.walk ? sq((t - tIn) / T.walk) : !back ? 1 : t < tOut + T.walk ? 1 - sq((t - tOut) / T.walk) : 0;
        const far = k * a.len[a.len.length - 1];
        let j = 1;
        while (j < a.len.length - 1 && a.len[j] < far) j++;
        const p = a.path[j - 1], q = a.path[j], f = clamp((far - a.len[j - 1]) / Math.max(1e-6, a.len[j] - a.len[j - 1]), 0, 1);
        r.x = mix(p[0], q[0], f); r.z = mix(p[2], q[2], f);
        // Over the snow to the steps, and up them.
        r.y = j === 1 ? C.height(r.x, r.z) : j === 2 ? Math.max(mix(p[1], q[1], f), C.height(r.x, r.z)) : q[1];
        r.u = r.x - C.centre(r.z);
        a.gear = t > tIn - 0.5 * T.off && t < total - 0.5 * T.off;
        a.seated = k >= 1 ? 1 : 0;
        a.walk = k > 0 && k < 1 ? far : 0;
        // Facing the way they walk; at the table, the table; back at the skis, down the hill again.
        let want = k <= 0 ? (back ? a.heading0 : r.heading) : k >= 1 ? a.sat : Math.atan2(q[0] - p[0], q[2] - p[2]) + (back ? Math.PI : 0);
        want -= r.heading;
        want -= TAU * Math.round(want / TAU);
        r.heading += want * (1 - Math.exp(-dt / 0.2));
        r.v = r.vx = r.vz = r.vu = r.vy = r.cv = r.manual = r.lean = r.tilt = r.force = r.dodge = r.pitch = r.bank = r.tuck = r.scrub = r.load = r.absorb = r.impact = r.sink = 0;
        r.press = 1;
        r.stop = 1;
        // (Until the skis are off, and once they are back on, they stand in them as they stopped: a boarder who knelt is still kneeling.)
        r.skid = a.gear ? 0 : a.skid;
        r.stopSide = a.gear ? 0 : a.side;
        r.face = r.heading + (a.gear ? 0 : a.chest);
        r.gaze = r.heading + (a.gear ? 0 : a.eyes);
        r.plant = r.swung = 0;
        if (t >= total) { r.afoot = null; r.c = r.u; r.a = 0; r.phase = 0; r.half = 0; settle(W, r); }
    }

    // Everything a rider must give room to this step: { z0, z1, lo, hi, v, id }.
    function obstacles(W) {
        const list = [];
        const add = r => {
            const wide = r.pipe || r.fall ? 2.2 : r.a + 0.55, mid = r.pipe || r.fall ? r.u : r.c;
            list.push({ z0: r.z - 1.2, z1: r.z + 1.2, lo: mid - wide, hi: mid + wide, v: r.v, id: r.id, z: r.z, u: r.u, air: r.air, parked: r.parked || !!r.fall || !!r.afoot });
        };
        for (const r of W.riders) { add(r); list[list.length - 1].mate = true; }
        for (const r of W.others) add(r);
        const sc = W.school;
        if (sc) {
            let lo = sc.lead.u, hi = sc.lead.u, z0 = sc.lead.z;
            for (const kid of sc.kids) { lo = Math.min(lo, kid.u); hi = Math.max(hi, kid.u); z0 = Math.min(z0, kid.z); }
            const band = sc.lead.parked ? 0.6 : sc.lead.a;
            list.push({ z0: z0 - 2, z1: sc.lead.z + 2.5, lo: Math.min(lo, sc.lead.c - band) - 0.6, hi: Math.max(hi, sc.lead.c + band) + 0.6, v: sc.lead.v, id: sc.lead.id, z: sc.lead.z, u: sc.lead.u, parked: sc.lead.parked });
        }
        if (W.creature) { const c = W.creature; list.push({ z0: c.z - 1.5, z1: c.z + 1.5, lo: c.u - 1.5, hi: c.u + 1.5, v: 0, id: -1, z: c.z, u: c.u, parked: true }); }
        return list;
    }

    // Where between everything in its way a rider can put its line: the
    // middle and swing it is left with, and whoever it must wait behind.
    function thread(W, r, pref, amp, wu, list, kickers, queue) {
        const blocked = [], look = 12 + 2.2 * r.v;
        let wait = null;
        for (const o of list) {
            // Coming up to a narrow place they go in line, by the gaps between them, not side by side.
            if (o.id === r.id || o.z1 < r.z - 2.5 || o.z0 > r.z + look || queue && o.mate && !o.parked) continue;
            blocked.push([o.lo - 1.2, o.hi + 1.2]);
            // Dead ahead, in the way of where it is swinging now: hold back.
            if (o.z0 > r.z && o.lo - 0.6 < r.c + r.a && o.hi + 0.6 > r.c - r.a && (!wait || o.z0 < wait.z0)) wait = o;
        }
        for (const k of kickers) {
            if (r.z > k.z - k.run - 26 && r.z < k.z + k.land && !hits(W, r, k)) blocked.push([k.u - k.half - 2.6, k.u + k.half + 2.6]);
        }
        if (!blocked.length) return { c: clamp(pref, -wu + Math.min(amp, wu), wu - Math.min(amp, wu)), a: Math.min(amp, wu), wait };
        blocked.sort((p, q) => p[0] - q[0]);
        // The free stretches across the piste, and the best of them: the one
        // it is in if that will do, else the nearest that is wide enough.
        let from = -wu, best = null, bestCost = Infinity;
        const consider = (lo, hi) => {
            if (hi - lo < 1.2) return;
            const here = r.u >= lo && r.u <= hi, cost = (here ? 0 : Math.min(Math.abs(r.u - lo), Math.abs(r.u - hi)) * 3 + 2) + Math.abs(clamp(pref, lo, hi) - pref) * 0.3;
            if (cost < bestCost) { bestCost = cost; best = [lo, hi]; }
        };
        for (const [lo, hi] of blocked) {
            if (lo > from) consider(from, Math.min(lo, wu));
            from = Math.max(from, hi);
        }
        if (from < wu) consider(from, wu);
        if (!best) return { c: r.c, a: Math.min(r.a, 0.3), wait };
        const a = Math.min(amp, (best[1] - best[0]) / 2);
        return { c: clamp(pref, best[0] + a, best[1] - a), a, wait };
    }

    function riderStep(W, r, dt, list, steer, hand = null) {
        const C = W.course, cfg = W.cfg;
        if (r.fall) { fallStep(W, r, dt); return; }
        if (r.afoot) { afootStep(W, r, dt); return; }
        const s = C.find(r.z), d = r.z - s.z0, t = d / s.len, group = r.role === 'lead' || r.role === 'friend', lead = W.riders[0];
        const L = line(W, r, r.z), wu = L.wu, dC = C.slope(r.z);
        // The length of its turns comes round to what its line asks for over half a second, so nothing jumps when its rhythm changes.
        if (L.own) r.lamNow = L.lam; else r.lamNow += (L.lam - r.lamNow) * (1 - Math.exp(-dt / 0.5));
        const lam = r.lamNow;

        // ---- How fast.
        const f = d >= s.B ? 1 : d <= 0 ? 0 : sq(d / s.B), prev = s.i > C.sections[0].i ? C.find(s.z0 - 1) : s;
        let V = CRUISE * cfg.speed * mix(prev.T.pace, s.T.pace, f) * r.pace * (1 + 0.06 * Math.sin(W.time / 9 + r.paceP)), idle = false;
        const ghost = r.ghost > 0;
        if (group && r !== lead) {
            // Friends range ahead and behind, and wait when the lead is down.
            const gap = r.z - lead.z;
            V *= 1 - 0.55 * smooth(28, 70, gap) + 0.45 * smooth(28, 80, -gap);
            if ((lead.fall || lead.halt) && gap > 12) { V *= 1 - smooth(14, 30, gap); idle = gap > 22; }
        }
        // Tucked by hand, the lead wants to run.
        const ground = hand && !r.air ? hand : null;
        if (ground) V *= 1 + HAND.want * clamp(ground.tuck || 0, 0, 1);
        let brake = false;
        const limit = v => { if (v < V) { V = Math.max(0, v); brake = true; } };
        // Friends pull up together at a hut, and at a lodge.
        const hut = group ? (s.T.stop ? s : C.find(r.z + 70).T.stop ? C.find(r.z + 70) : null) : null;
        let resting = false;
        if (hut && W.group.done !== hut.i) {
            // (At a lodge their places go by how they are across the piste now: whoever is nearest the lodge's side has the place nearest
            // it, and the furthest down the hill; so one who has cut across in front of another has taken the nearer place with it.)
            if (hut.type === 'lodge') {
                r.berth = 0;
                r.berthAt = hut.i;
                for (const o of W.riders) if (o !== r && (hut.side * (o.u - r.u) > 0 || o.u === r.u && o.id < r.id)) r.berth++;
            }
            const zs = hut.zs + (hut.type === 'lodge' ? 1.5 - r.berth : r.slot - 1.5) * 1.3;
            if (r.z < zs + 4) { limit(W.group.phase === 'rest' || W.group.phase === 'apres' ? 0 : Math.sqrt(2 * 2.2 * Math.max(0, zs - r.z))); resting = true; }
        }
        // One at a time through the narrow places.
        const narrow = s.T.single || C.find(r.z + 120).T.single;
        // The gaps open without anybody stopping dead: whoever is behind eases off.
        if (narrow && !ghost && !resting) {
            const full = V;
            for (const o of list) {
                const gap = o.z - r.z;
                if (o.mate && o.id !== r.id && !o.parked && gap > 0 && gap < 20) limit(Math.max(o.v + (gap - 12) * 0.8, gap < 2.5 ? 0 : Math.min(0.5 * full, o.v * 0.75)));
            }
        }
        // Strangers stop at the side rather than ski what is not for them.
        if (r.role === 'stranger' || r.role === 'school') {
            const ahead = C.find(r.z + 130), end = ahead.T.open ? null : (s.T.open ? s.z1 : r.z);
            if (end !== null) { idle = true; limit(Math.sqrt(2 * 1.6 * Math.max(0, end - 50 - (r.id % 7) * 3.5 - r.z))); r.lane0 = (r.lane0 < 0 ? -1 : 1) * 0.98; if (r.v < 0.25) r.parked = true; }
        }
        if (r.parked) V = 0;
        // Braking by hand: checked, and held on, pulled up to a stop (and the friends wait for it there).
        const braked = ground ? clamp(ground.brake || 0, 0, 1) : 0;
        if (braked > 0) { limit(V * (1 - braked)); if (braked > 0.6) idle = true; }
        r.halt = braked > 0.6 && r.v < 1;
        r.want = !(idle || resting || r.parked);
        // Pulling up to a halt (not just easing off): at a hut, at the side, behind somebody who has stopped.
        const halting = r.parked || resting && brake || idle && (brake || V < 2) || brake && V < 2;

        // ---- Which way across.
        let c = L.c, a = L.a;
        // Off into the trees, if it is lined up for it when the way out comes.
        if (s.cut && r.cutOn !== s.i && !r.air && t > s.cut.t0 - 0.03 && t <= s.cut.t0 && cuts(W, r, s) && Math.abs(r.u - L.c) < 2.5) r.cutOn = s.i;
        r.lane = L.lane;
        if (r === lead) {
            // A hand on it: the line moves across, within what is safe, and drifts back when let go.
            const reach = L.lane ? 0.9 : Math.max(0, wu - 0.6);
            if (steer && !r.air) r.manual = clamp(r.manual + steer * HAND.speed * dt, -reach - c, reach - c);
            else if (!W.hand.active) r.manual *= Math.exp(-dt / 1.2);
            c += clamp(r.manual, -reach - c, reach - c);
            if (L.lane) c = clamp(c, L.c - 0.9, L.c + 0.9);
        }
        if (r.parked || resting && r.v < 3) a = 0;
        // A tuck runs straight.
        if (ground && ground.tuck) a = mix(a, Math.min(a, 0.35), clamp(ground.tuck, 0, 1));
        const inPipe = s.type === 'pipe' && t > 0.12 && t < 0.88 && group && !r.parked;
        if (!L.lane && !inPipe && !r.air) {
            const got = thread(W, r, c, a, wu, list, s.kickers, narrow);
            c = got.c;
            a = got.a;
            if (got.wait && !L.kicker && !ghost) limit(got.wait.v + (got.wait.z0 - r.z - 6) * 0.9);
        }
        // ---- How fast it is really going: the hill gives, the snow and the air take, and its edges scrub off what it does not want.
        let scrub = 0;
        if (!r.air) {
            const sl = inPipe ? C.elev(r.z + 0.5) - C.elev(r.z - 0.5) : r.sl;
            const drive = -G * sl - (r.v > 0.05 ? snowDrag(mix(prev.T.rough, s.T.rough, f)) + DRAG * (1 - 0.45 * r.tuck) * (r.v / Math.max(0.3, cfg.speed)) ** 2 : 0);
            let acc;
            if (r.v > V) {
                // Checked hardest coming across the hill, least in the fall line; all at once only to give way or to stop.
                const hard = brake || V < r.v - 3, across = Math.abs(Math.cos(r.phase));
                scrub = Math.min(GRIP, ((r.v - V) / (hard ? 0.4 : 0.9) + Math.max(0, drive)) * (hard || r.a < 0.6 ? 1 : 0.3 + 1.1 * across));
                acc = Math.max(drive - scrub, (V - r.v) / Math.max(dt, 1e-6));
            } else {
                // A skate or a push of the poles from a standstill, and no more.
                acc = Math.min(drive + 3.2 * (1 - smooth(2.5, 8, r.v)), (V - r.v) / 0.3);
            }
            r.v = Math.max(0, r.v + acc * dt);
        }
        r.scrub += (scrub / GRIP - r.scrub) * (1 - Math.exp(-dt / 0.15));
        if (r.v < 0.02) r.v = 0;
        r.stop += ((r.v < 1.2 ? 1 : 0) - r.stop) * (1 - Math.exp(-dt / 0.35));
        r.tuck += (Math.max(L.tuck, ground ? clamp(ground.tuck || 0, 0, 1) : 0) - r.tuck) * (1 - Math.exp(-dt / (ground && ground.tuck ? 0.25 : 0.6)));

        // Down the mountain it makes only what its line leaves it: least while it is coming across.
        const vz = r.air ? r.vz : r.v / Math.hypot(1, dC + (inPipe ? 0 : r.a * TAU / lam * waveD(r.phase))), z = r.z + vz * dt, x0 = r.x, zWas = r.z;
        let u = r.u, x;
        // The piste's edge, for anyone not on a lane through the trees; whoever is past it comes back in.
        const edge = L.lane ? Infinity : Math.max(s.type === 'gully' ? L.w + 1.8 : Math.max(0.5, L.w - 0.8), Math.abs(r.u) - 5 * dt);
        if (!inPipe && r.pipe && !r.air) { r.pipe = 0; r.c = r.u; r.a = 0; r.phase = 0; r.cv = 0; }
        if (L.lane) {
            // A lane between trees is kept to, on the snow or off it.
            r.c += clamp(c - r.c, -12 * dt, 12 * dt) * (r.want ? 1 : Math.min(1, r.v / 2));
            r.a += (a - r.a) * (1 - Math.exp(-dt / 0.5));
            r.phase += TAU * vz * dt / lam;
            r.half = Math.floor(r.phase / Math.PI);
            u = r.c + r.a * wave(r.phase);
            r.cv = 0;
            x = C.centre(z) + u;
            r.vu = dt > 0 ? (u - r.u) / dt : 0;
            if (r.air) r.vx = dt > 0 ? (x - x0) / dt : 0;
        } else if (r.air) {
            // Nobody flies off the piste: the air only carries them down it.
            u = clamp(r.x + r.vx * dt - C.centre(z), -edge, edge);
            x = C.centre(z) + u;
        } else if (inPipe) {
            // Wall to wall: across the flat, up the transition, and off the lip.
            // Pumped across the flat, and then the wall takes it back: fast at the bottom, slow at the lip.
            // (pw is its speed along the wall's own curve, so what it has at the bottom less the climb is what it has at the lip.)
            if (!r.pipe) { r.pipe = r.slot & 1 ? 1 : -1; r.pw = r.vu || 0; }
            const hu = (C.height(r.x + 0.3, r.z) - C.height(r.x - 0.3, r.z)) / 0.6, steep = Math.hypot(1, hu), flat = 1 - smooth(0.05, 0.5, Math.abs(hu));
            r.pw += (flat * (r.pipe * PIPE.speed - r.pw) / 0.35 - G * hu / steep) * dt;
            if (r.pipe * r.pw < 1.5) r.pw = r.pipe * 1.5;      // never stalled on a wall
            r.vu = r.pw / steep;
            u += r.vu * dt;
            x = C.centre(z) + u;
        } else {
            const go = r.want ? 1 : Math.min(1, r.v / 2);     // stopped where it means to be, nobody slides sideways
            // A line moves across as a body can: it takes time to get going sideways, and room to stop.
            // (A turn opens and closes no faster than half its speed forward, or pulling up and setting off again it would slide
            // sideways from a stand; whoever has stopped part-way through one stands where it is.)
            if (!r.want && r.v < 0.3) { r.c = r.u; r.a = 0; }
            const off = c - r.c, far = Math.abs(off), cv = Math.sign(off) * Math.min(far / 0.6, 6.5, Math.sqrt(2 * SIDE * far)) * go;
            r.cv += clamp(cv - r.cv, -(Math.abs(cv) < Math.abs(r.cv) ? 2 : 1) * SIDE * dt, SIDE * dt * (Math.abs(cv) < Math.abs(r.cv) ? 2 : 1));
            r.c += r.cv * dt;
            r.a += clamp((a - r.a) * (1 - Math.exp(-dt / 0.5)), -0.5 * r.v * dt, 0.5 * r.v * dt);
            // (Nor ever wider than its legs can hold at the length its turns have now.)
            if (r.want && r.a > 0.6) r.a = Math.max(0.6, Math.min(r.a, 9.5 * (lam / (TAU * Math.max(4, r.v))) ** 2));
            r.phase += TAU * vz * dt / lam;
            // At each edge change, the next turn's own length and swing.
            const half = Math.floor(r.phase / Math.PI);
            if (half !== r.half) { r.half = half; r.turn++; rhythm(W, r); }
            u = clamp(r.c + r.a * wave(r.phase), -edge, edge);
            x = C.centre(z) + u;
            r.vu = dt > 0 ? (u - r.u) / dt : 0;
        }
        // On to a rail that is this rider's to slide.
        if (!r.rail && group) for (const rail of s.rails) if (rail.slot === r.slot && z > rail.z - 1 && z < rail.z + 1 && Math.abs(u - rail.u) < 0.6) r.rail = railEnds(C, rail);
        if (r.rail && z > r.rail.z + r.rail.len) r.rail = null;

        // ---- Up and down: on the snow until it falls away faster than a fall.
        const g = support(W, r, x, z), yWas = r.y;
        if (!r.air) {
            const rate = dt > 0 ? (g - r.y) / dt : 0;
            if (inPipe && r.pipe * u > s.W - 0.3 && r.pipe * r.vu > 0) {
                // The lip: straight up, a turn in the air, and back down the wall.
                r.vx = dC * vz - r.pipe * 0.55;
                r.vz = vz;
                r.x = x; r.z = z; r.u = u; r.y = g;
                // What it has left at the lip all goes up.
                takeOff(W, r, clamp(Math.abs(r.pw), 3.8, 6.4));
                r.vu = -r.pipe * 0.55;
                r.pipe = -r.pipe;
                r.y += r.vy * dt;
            } else if (r.pop && r.popT >= POP.load && !(ground && ground.jump && r.popT < POP.load + HAND.charge)) {
                // Down, and up: as much of a spring as legs have. (Held down by hand for longer, more of it: a deeper crouch.)
                r.vx = dC * vz + clamp(r.vu, -2.5, 2.5);
                r.vz = vz;
                r.x = x; r.z = z; r.u = u; r.y = g;
                const popT = r.popT;
                r.forced = r.pop;
                r.pop = r.popT = 0;
                takeOff(W, r, rate + POP.vy * (1 + HAND.more * clamp((popT - POP.load) / HAND.charge, 0, 1)));
            } else if (r.vyG - G * dt > rate + 1.2 && r.v > 3) {
                // (The 1.2 m/s is what legs take up: over less than that they reach down and stay on the snow.)
                r.vx = dC * vz + clamp(r.vu, -2.5, 2.5);     // squared up for the air
                r.vz = vz;
                r.x = x; r.z = z; r.u = u;
                r.y += (r.vyG - G * dt) * dt;
                takeOff(W, r, r.vyG - G * dt);
            } else {
                r.y = g;
                r.vyG = clamp(rate, -30, 9);
                r.vx = dt > 0 ? (x - x0) / dt : 0;
                r.vz = vz;
                // The snow it is on, for the next step: up or down, along the way it is going.
                const ds = Math.hypot(x - x0, z - zWas);
                r.sl = ds > 0.02 ? clamp((g - yWas) / ds, -0.8, 0.8) : C.elev(z + 0.5) - C.elev(z - 0.5);
                // Legs take up what the snow does under them: folded over a crest, long in a hollow.
                r.vyS += (r.vyG - r.vyS) * (1 - Math.exp(-dt / 0.15));
                r.absorb = clamp(r.absorb * Math.exp(-dt / 0.3) + (r.vyG - r.vyS) * dt / 0.3, -1, 1);
            }
            // A jump by hand waits for the crouch before it; it is off where nobody may jump.
            if (r.pop && !r.air) { if (r.v > 4 && !L.lane && !s.T.single && !r.parked) r.popT += dt; else r.pop = r.popT = 0; }
            // Down before a lip that is theirs, to spring off it.
            const lip = L.kicker ? L.kicker.z - z : -1;
            r.load += ((r.pop || lip > 0 && lip < 0.45 * r.v ? 1 : 0) - r.load) * (1 - Math.exp(-dt / 0.1));
            if (r.air) r.load = 0;
        } else {
            r.vy -= G * dt;
            r.y += r.vy * dt;
            r.airT += dt;
            if (r.y <= g) {
                r.x = x; r.z = z; r.u = u;
                const gn = support(W, r, x + r.vx * dt, z + r.vz * dt);
                land(W, r, g, dt > 0 ? (gn - g) / dt : 0);
            }
        }
        r.dist += Math.hypot(x - x0, z - zWas);
        r.x = x; r.z = z; r.u = u;
        r.lift = r.air ? r.y - g : 0;
        r.impact *= Math.exp(-dt / 0.25);

        // ---- How it holds itself.
        const speed = Math.hypot(r.vx, r.vz), headed = r.heading;
        let swing = 0;
        if (speed > 0.5) {
            // How hard it is really turning: what it leans against.
            const psi = Math.atan2(r.vx, r.vz);
            if (dt > 0) swing = clamp(speed * (psi - r.psi) / dt, -GRIP * 1.4, GRIP * 1.4);
            r.psi = psi;
            let turn = psi - r.heading;
            turn -= TAU * Math.round(turn / TAU);
            // (At a walking pace nobody swings round that fast: it comes round as the speed builds.)
            r.heading += turn * (1 - Math.exp(-dt / (r.air ? 0.3 : 0.08 + 0.4 * smooth(3, 0.5, speed))));
            if (!r.air) r.pitch += (Math.atan2(r.vyG, speed) - r.pitch) * (1 - Math.exp(-dt / 0.08));
            else r.pitch += (Math.atan2(r.vy, speed) * 0.5 - r.pitch) * (1 - Math.exp(-dt / 0.25));
        }
        // The lean into a turn is what its edges carry: the turn itself and the hill's pull across the skis, so least early in a
        // turn and most late in it. `force` is that in m/s² to its right; `tilt` the angle from the snow's normal of the line from
        // feet to hips that balances it (radians, to its right); `press` the load on its legs in g; `lean` the same force from -1 to 1.
        // Its own line it knows, so it moves inside as the force comes, not after it; a dodge or a hand on it is felt first.
        const grade = (C.elev(r.z - 0.5) - C.elev(r.z + 0.5)) / Math.hypot(1, dC), ca = 1 / Math.hypot(1, grade), pull = G * grade * ca;
        let force = 0;
        if (!r.air && !inPipe && !r.pipe && speed > 0.5) {
            const k = TAU / lam, felt = swing + pull * Math.sin(r.psi - Math.atan(dC));
            r.dodge += (felt - carve(r.v, dC, k, r.a, r.phase, pull) - r.dodge) * (1 - Math.exp(-dt / 0.08));
            force = (carve(r.v, dC, k, r.a, r.phase + k * vz * AHEAD, pull) + r.dodge) * smooth(0.5, 3, speed);
        } else r.dodge = 0;
        // (And no body rolls from one side to the other faster than about three radians a second.)
        r.force += clamp((force - r.force) * (1 - Math.exp(-dt / (r.air ? 0.15 : 0.05))), -ROLL * G * ca * dt, ROLL * G * ca * dt);
        r.tilt = Math.atan2(r.force, G * ca);
        r.press = Math.hypot(r.force, G * ca) / G;
        r.lean = clamp(r.force / 8.5, -1, 1);
        if (!r.air) {
            const ch = Math.cos(r.heading), sh = Math.sin(r.heading);
            r.bank = Math.atan((C.height(x + ch * 0.5, z - sh * 0.5) - C.height(x - ch * 0.5, z + sh * 0.5)));
        }
        // How far the skis ride down in the snow (`sink`, metres: `y` stays on the surface): hardly at all on a groomed piste, to the
        // shins in powder and in the rough off the side of a run; less the faster they go, deepest where the turn loads them, and up
        // out of it as they come across from one edge to the other.
        const out = Math.abs(r.u) - L.w, rough = mix(prev.T.rough, s.T.rough, f), soft = rough + (1 - rough) * (out <= -4 ? 0 : sq(Math.min(1, (out + 4) / 18)));
        const deep = r.air || r.rail ? 0 : (0.02 + 0.2 * soft * Math.sqrt(soft)) * mix(1.15, 0.8, smooth(6, 20, r.v)) * (0.45 + 0.55 * smooth(0.08, 0.5, Math.abs(r.tilt)));
        r.sink += (deep - r.sink) * (1 - Math.exp(-dt / 0.08));
        // ---- The skis on their path, the body over them, and the poles.
        const edged = !r.air && !inPipe && !r.pipe && !r.rail, tiltWas = r.tilt0;
        r.tilt0 = r.tilt;
        let skid = 0;
        if (edged) {
            // What the braking asks of the edges, as an angle; and what a turn is steered by, most of it after the fall line.
            const bite = Math.asin(Math.min(0.9, r.scrub * GRIP / Math.max(0.6 * G, Math.hypot(r.force, G * ca))));
            const turn = clamp(r.force / 3, -1, 1), late = smooth(-0.1, 0.3, Math.sin(r.psi - Math.atan(dC)) * Math.sign(r.force));
            skid = turn * (r.steer * (0.35 + 0.65 * late) * (0.6 + 0.4 * Math.abs(r.lean)) + bite) * (1 - 0.9 * r.tuck) * smooth(1.5, 5, speed);
            if (halting || r.stopSide) {
                // A hockey stop: the skis come across the hill as the speed goes: the way it is already crossing it, or the way
                // they were already turned, or else tips towards the hut (at the side of a piste, towards its middle). Whoever is
                // traversing is across the hill already, and has little to turn. And there they stay, stood across it.
                // (So the angle is kept from the fall line, not from a travel that wanders at a walking pace.)
                const off = turned(r.heading - Math.atan(dC));
                if (!r.stopSide) r.stopSide = Math.abs(off) > 0.3 ? Math.sign(off) : Math.abs(r.skid) > 0.05 ? Math.sign(r.skid) : hut ? hut.side : r.role === 'stranger' ? (r.u > 0 ? -1 : 1) : r.force < 0 ? -1 : 1;
                // (Until the skis have begun to come round, the side is still to choose: the one its line is taking it to.)
                else if (halting && Math.abs(r.skid) < 0.2 && off * r.stopSide < -0.15) r.stopSide = -r.stopSide;
                const full = r.stopSide * r.across - off;
                if (halting) {
                    skid = full * smooth(10, 2.5, r.v);
                    if (Math.abs(skid) < bite && full * r.stopSide > bite) skid = r.stopSide * bite;
                } else {
                    // Setting off again, they come round to the way they are going as the speed builds.
                    skid = mix(skid, full, smooth(3.5, 0.5, r.v));
                    if (r.v > 4) r.stopSide = 0;
                }
            }
        } else r.stopSide = 0;
        // (Skis are swung only so fast; and in a stop it is over the snow that they are swung, whatever the travel does under them.)
        const held = r.stopSide ? turned(headed - r.heading) : 0;
        r.skid += held + clamp((skid - r.skid - held) * (1 - Math.exp(-dt / (edged ? 0.12 : 0.04))), -SWING * dt, SWING * dt);
        if (!edged && Math.abs(r.skid) < 5e-3) r.skid = 0;
        // The chest (`face`, a yaw in the world): in short turns it keeps to the fall line while the legs turn under it; in long ones
        // it follows the skis, though not all the way; in a stop it stays facing down the hill, and comes round once stood.
        const skis = r.heading + r.skid, fl = Math.atan(dC);
        const face = !edged ? r.heading : fl + turned(skis - fl) * (r.stopSide ? mix(0.15, 0.75, r.stop) : mix(0.72, 0.15, smooth(34, 24, lam)));
        r.face += turned(face - r.face) * (1 - Math.exp(-dt / 0.12));
        r.face = skis + clamp(turned(r.face - skis), -1, 1);
        // The eyes (`gaze`, the same) are on where the line goes next: into the coming turn, a little before the chest.
        const gaze = !edged || r.stopSide || speed < 0.5 ? r.face : Math.atan(dC + r.a * TAU / lam * waveD(r.phase + TAU / lam * vz * 0.6));
        r.gaze += turned(gaze - r.gaze) * (1 - Math.exp(-dt / 0.2));
        r.gaze = r.face + clamp(turned(r.gaze - r.face), -0.8, 0.8);
        // A pole plant at each edge change in linked turns: the new inside pole (`plantSide`, 1 the right) touches the snow, `plant` from 0 to 1 and back.
        if (tiltWas * r.tilt < 0 || tiltWas === 0 && r.tilt !== 0) {
            if (edged && !halting && !r.stopSide && r.kind === 'ski' && r.swung > 0.12 && speed > 5 && r.tuck < 0.3) { r.plantSide = r.tilt > 0 ? 1 : -1; r.plantT = 0; r.reach = 0; }
            r.swung = 0;
        }
        r.swung = Math.max(r.swung, Math.abs(r.tilt));
        r.plantT = Math.min(1, r.plantT + dt);
        // (Once in, the tip stays where it touched the snow and the hand goes over it: so it is out again by the time they are a
        // pole's reach past it (PLANT.far), however little of the plant's time that is.)
        if (r.plantT >= PLANT.in && r.plantT < PLANT.T) r.reach += speed * dt;
        r.plant = edged && r.plantT < PLANT.T ? smooth(0, PLANT.in, r.plantT) * smooth(PLANT.T, PLANT.T - PLANT.out, r.plantT) * smooth(PLANT.far[1], PLANT.far[0], r.reach) : 0;
        const k = r.trick;
        if (r.air && k && k.manual) {
            // By hand: held, it spins (steer) and flips (tuck forward, brake back) at up to HAND.yaw and HAND.flip; let go, it
            // goes on round to the next whole turn and stops there, spotting its landing. A held jump is a grab.
            const h = hand || NONE, fresh = (axis, want) => { if (want && Math.sign(want) === k.was[axis]) return 0; k.was[axis] = 0; return want; };
            [k.yaw, k.yr] = spinBy(k.yaw, k.yr, fresh('yaw', clamp((h.steer || 0) * 1.5, -1, 1)), HAND.yaw, k.step, dt);
            [k.flip, k.fr] = spinBy(k.flip, k.fr, fresh('flip', clamp((h.tuck || 0) - (h.brake || 0), -1, 1)), HAND.flip, TAU, dt);
            r.grab += ((h.jump ? 1 : 0) - r.grab) * (1 - Math.exp(-dt / 0.1));
            if (r.grab > 0.6) k.grabbed += dt;
            r.spin[0] = k.yaw;
            r.spin[1] = k.flip;
            r.spin[2] = r.spread = r.twist = 0;
        } else if (r.air && k) {
            // Set spinning at the lip and spinning at one rate, but for the pull of a tuck in the middle; round before the snow comes up.
            const p = clamp(r.airT / k.T, 0, 1), q = Math.min(1, p / 0.92), e = (q - 0.3 / TAU * Math.sin(TAU * q)) * k.off, arc = Math.sin(Math.PI * p) ** 0.6;
            r.spin[0] = TAU * (k.yaw || 0) * k.sign * e;
            r.spin[1] = TAU * (k.pitch || 0) * e;
            r.spin[2] = (k.tilt || 0) * arc * k.sign;
            r.grab = (k.grab || 0) * arc;
            r.spread = (k.spread || 0) * arc;
            r.twist = (k.twist || 0) * arc * k.sign;
        }
    }

    // The ski school: kids in a line behind an instructor, each on the
    // instructor's own tracks a little later.
    function schoolStep(W, dt, list) {
        const sc = W.school, C = W.course, lead = sc.lead;
        riderStep(W, lead, dt, list, 0);
        const last = sc.path[sc.path.length - 1];
        if (!last || Math.hypot(lead.z - last[0], lead.u - last[1]) > 0.5) { sc.path.push([lead.z, lead.u, lead.heading, lead.lean, lead.tilt]); if (sc.path.length > 90) sc.path.shift(); }
        sc.kids.forEach((kid, i) => {
            // When the instructor stops, the line closes up behind.
            const back = Math.round((lead.parked ? 3.2 : 6) * (i + 1)), at = sc.path[Math.max(0, sc.path.length - 1 - back)];
            const z0 = kid.z, zn = kid.z + clamp((at[0] - kid.z) * 4, 0, 9) * dt, un = kid.u + (at[1] - kid.u) * (1 - Math.exp(-dt / 0.25));
            // Not into anybody who has stopped in the line's way. (But by them closer than a rider may come to a child, 1.4 m by 1.1:
            // or whoever had pulled up that near the line to let it by would hold it up, and be held up by it, for good.)
            if (!list.some(o => o.id !== lead.id && Math.hypot(o.z - zn, o.u - un) < 1.25)) { kid.z = zn; kid.u = un; }
            kid.x = C.centre(kid.z) + kid.u;
            kid.y = C.height(kid.x, kid.z);
            kid.v = dt > 0 ? (kid.z - z0) / dt : 0;
            kid.heading += (at[2] - kid.heading) * (1 - Math.exp(-dt / 0.2));
            kid.lean = at[3] * 0.5;
            kid.tilt = at[4] * 0.5;
            kid.face = kid.gaze = kid.heading;
            kid.stop += ((kid.v < 0.8 ? 1 : 0) - kid.stop) * (1 - Math.exp(-dt / 0.4));
            kid.pitch = Math.atan(-C.find(kid.z).g);
        });
    }

    // Others on the mountain come into view ahead and are left behind.
    function populate(W, dt) {
        const C = W.course, lead = W.riders[0], random = W.rng, want = Math.round(4 * W.cfg.others);
        W.others = W.others.filter(r => r.z > lead.z - 130 && r.z < lead.z + 520);
        if (W.school && W.school.lead.z < lead.z - 150) W.school = null;
        W.spawn -= dt;
        if (W.spawn > 0) return;
        W.spawn = 3 + random() * 5;
        const z = lead.z + 300 + random() * 150, s = C.find(z);
        if (!s.T.open || z - s.z0 < 30 || s.z1 - z < 160) return;
        if (W.cfg.others > 0 && !W.school && s.type === 'groomer' && s.z1 - z > 220 && random() < 0.3) {
            const side = random() < 0.5 ? -1 : 1;
            const boss = rider(W, 'school', 0, z, { u: side * 0.45 * (s.W - 1.5), lane: side * 0.45, amp: 0.3 * (s.W - 1.5), lam: 40, pace: 0.3, v: 4 });
            const kids = [];
            for (let i = 0; i < 5; i++) { const kid = rider(W, 'kid', 0, z - 3 * (i + 1), { u: boss.u }); kid.size = 0.62 + 0.1 * random(); kids.push(kid); }
            W.school = { lead: boss, kids, path: Array.from({ length: 90 }, (_, j) => [z - (89 - j) * 0.5, boss.u, 0, 0]) };
            return;
        }
        if (W.others.length >= want) return;
        const lane = (random() * 2 - 1) * 0.85, pace = 0.5 + 0.25 * random(), short = random() < 0.5, standing = random() < 0.2 && !(s.cut && s.cut.side * lane > 0);
        const r = rider(W, 'stranger', 0, z, { u: (standing ? Math.sign(lane) * 0.98 : lane) * (C.width(z) - 1.5), lane: standing ? Math.sign(lane) * 0.98 : lane, amp: short ? 0.8 : 2 + 2 * random(), lam: short ? 15 + 6 * random() : 36 + 16 * random(), pace, v: standing ? 0 : CRUISE * pace * W.cfg.speed, kind: random() < 0.35 ? 'board' : 'ski' });
        r.parked = standing;
        // (Whoever is standing at the side stands across the hill, looking over the piste.)
        if (standing) { r.stopSide = lane > 0 ? -1 : 1; r.skid = r.stopSide * r.across; r.face = r.skid * 0.75; r.gaze = r.face; r.stop = 1; }
        r.c = r.u;
        r.look = Math.floor(random() * 1e6);
        W.others.push(r);
    }

    // A hare or a fox across the piste, well ahead of anyone.
    function wildlife(W, dt) {
        const C = W.course, lead = W.riders[0], random = W.rng;
        if (W.creature) {
            const c = W.creature;
            c.u += c.dir * c.v * dt;
            c.t += dt;
            c.x = C.centre(c.z) + c.u;
            c.y = C.height(c.x, c.z);
            if (Math.abs(c.u) > c.far || c.z < lead.z - 60) W.creature = null;
            return;
        }
        W.nextCreature -= dt;
        if (W.nextCreature > 0 || !W.cfg.wildlife) return;
        W.nextCreature = 35 + random() * 60;
        const z = lead.z + 50 + lead.v * 7, s = C.find(z);
        if (!s.T.open || s.type === 'lake' && random() < 0.5 || z - s.z0 < 20 || s.z1 - z < 20) return;
        const dir = random() < 0.5 ? -1 : 1, w = C.width(z), kind = random() < 0.6 ? 'hare' : 'fox';
        W.creature = { kind, z, u: -dir * (w + 9), dir, v: Math.max(kind === 'hare' ? 11 : 8.5, (w + 10) / 3.4), far: w + 12, t: 0, x: 0, y: 0 };
    }

    // The friends as a group: pulling up at a hut, and changing lines.
    function groupStep(W, dt) {
        const C = W.course, g = W.group, lead = W.riders[0], s = C.find(lead.z);
        if (s.T.stop && g.done !== s.i) {
            const there = W.riders.every(r => r.v < 0.3 || r.fall || r.z < lead.z - 60);
            if (g.phase === 'ride' && lead.v < 0.3 && lead.z > s.zs - 6) { g.phase = 'gather'; g.timer = 0; }
            if (g.phase === 'gather') {
                g.timer += dt;
                if (there || g.timer > 12) {
                    g.phase = s.type === 'lodge' ? 'apres' : 'rest';
                    g.timer = 0;
                    // At a lodge, whoever has pulled up goes in; anyone still on the way waits by the skis.
                    if (g.phase === 'apres') {
                        const going = W.riders.filter(r => r.v < 0.3 && !r.fall && !r.air && Math.abs(r.z - s.zs) < 30), foot = C.lodge(s).at(0, 0, LODGE.steps[1] + 0.4);
                        const near = going.map(r => Math.hypot(r.x - foot[0], r.z - foot[2])), along = going.map(r => s.side * r.z);
                        going.forEach((r, i) => { r.afoot = walkIn(W, r, s, near.filter((d, j) => d < near[i] || d === near[i] && j < i).length, along.filter((d, j) => d < along[i] || d === along[i] && j < i).length, going.length); });
                    }
                }
            }
            if (g.phase === 'rest') { g.timer += dt; if (g.timer > 5) { g.phase = 'ride'; g.done = s.i; } }
            if (g.phase === 'apres') { g.timer += dt; if (!W.riders.some(r => r.afoot)) { g.phase = 'ride'; g.done = s.i; } }
        } else if (g.phase !== 'ride') { g.phase = 'ride'; }
        // Coming up to a glade, the lanes go by how they are across the piste already: whoever is furthest to one side has the lane
        // on that side, so nobody has to get across anybody (which, riding level, they cannot) to be in their lane when the trees begin.
        const front = W.riders.reduce((p, q) => q.z > p.z ? q : p), wood = C.find(front.z + 110);
        if (wood.type === 'glade' && g.wood !== wood.i && front.z < wood.z0) {
            g.wood = wood.i;
            const slots = W.riders.map(r => r.slot).sort((p, q) => p - q);
            [...W.riders].sort((p, q) => p.u - q.u || p.id - q.id).forEach((r, j) => { r.slot = slots[j]; });
        }
        // Two of them change lines when they are well apart, so nobody crosses anybody.
        g.swap -= dt;
        if (g.swap > 0) return;
        g.swap = 14 + W.rng() * 16;
        const next = C.find(lead.z + 120), feat = next.kickers.find(k => !k.lip) || (next.cut ? { slot: next.cut.side < 0 ? 0 : 3 } : null);
        const tight = z => { const s = C.find(z); return s.T.single || s.type === 'glade'; };
        const calm = r => !r.air && !r.fall && !r.lane && !r.pipe && r.cutOn !== C.find(r.z).i && !tight(r.z) && !tight(r.z + 60) && !tight(r.z + 120) && !tight(r.z + 180);
        const a = feat && lead.slot !== feat.slot && W.rng() < 0.75 ? lead : W.riders[Math.floor(W.rng() * W.riders.length)];
        const to = a === lead && feat ? feat.slot : Math.floor(W.rng() * SLOTS);
        if (to === a.slot || !calm(a)) return;
        const b = W.riders.find(r => r.slot === to);
        if (b && (!calm(b) || Math.abs(b.z - a.z) < 30)) return;
        if (b) b.slot = a.slot;
        a.slot = to;
    }

    // One step of at most 1/60 s. input: { steer, tuck, brake, jump } (see HAND) while a hand is on it, else null.
    function worldStep(W, dt, input) {
        const hand = W.hand;
        hand.idle = input ? 0 : hand.idle + dt;
        hand.active = hand.idle < HAND.back;
        // A jump pressed (not held from before) is sent from the snow; held in the air, it is a grab.
        const jump = !!(input && input.jump), lead = W.riders[0];
        if (jump && !hand.jump && !lead.air) sendIt(W);
        hand.jump = jump;
        hand.now = input;
        W.time += dt;
        groupStep(W, dt);
        populate(W, dt);
        wildlife(W, dt);
        const list = obstacles(W);
        // From the front, so each sees where those ahead have got to.
        const all = W.riders.concat(W.others).sort((p, q) => q.z - p.z), solid = W.school ? all.concat(W.school.lead, W.school.kids) : all;
        for (const r of all) {
            const z0 = r.z, u0 = r.u;
            r.ghost = Math.max(0, (r.ghost || 0) - dt);
            riderStep(W, r, dt, list, r === lead && input ? clamp(input.steer || 0, -1, 1) : 0, r === lead ? input : null);
            // The last word: nobody ends a step inside somebody else.
            // Held up for seconds by something that will not move: slip by it (it should never come to this).
            // (Four of them: setting off from a stop, the last of four abreast waits that long for room.)
            r.stuck = r.want && !r.fall && r.v < 0.3 ? (r.stuck || 0) + dt : 0;
            if (r.stuck > 4) { r.ghost = 2; r.stuck = 0; W.ghosts++; }
            if (!r.air && !r.fall && !r.ghost && !r.afoot) {
                for (const o of solid) {
                    const dz = Math.abs(o.z - r.z), du = Math.abs(o.u - r.u);
                    if (o === r || o.air || o.afoot || dz > 1.4 || du > 1.1 || (dz >= Math.abs(o.z - z0) && du >= Math.abs(o.u - u0))) continue;
                    // Whoever is behind gives way; alongside, it only keeps its distance.
                    if (o.z >= r.z) { r.z = z0; r.v = Math.min(r.v, o.v * 0.8); }
                    r.u = u0;
                    r.x = W.course.centre(r.z) + u0;
                    r.y = W.course.height(r.x, r.z);
                    r.c = u0 - r.a * wave(r.phase);
                    r.cv = 0;
                    break;
                }
            }
            const me = list.find(o => o.id === r.id);
            if (me) { me.z = r.z; me.z0 = r.z - 1.2; me.z1 = r.z + 1.2; me.v = r.v; me.u = r.u; }
        }
        if (W.school) schoolStep(W, dt, list);
    }

    // A frame of dtMs (clamped at 100 ms): the same mountain covered at any frame rate.
    function worldAdvance(W, dtMs, input) {
        let left = clamp(dtMs, 0, 100) / 1000;
        while (left > 1e-9) {
            const dt = Math.min(left, 1 / 60);
            worldStep(W, dt, input);
            left -= dt;
        }
        W.course.trim(W.riders[0].z);
        return W;
    }

    // More friends, or fewer: a new one joins from behind, out of everybody's way.
    function setFriends(W, n, kinds) {
        n = clamp(Math.round(n), 0, 3);
        while (W.riders.length > n + 1) W.riders.pop();
        while (W.riders.length < n + 1) {
            const lead = W.riders[0], used = W.riders.map(r => r.slot), slot = [1, 2, 0, 3].find(s => !used.includes(s));
            let z = lead.z - 18;
            for (const r of W.riders) z = Math.min(z, r.z - 14);
            const r = rider(W, 'friend', slot, z, { kind: kinds?.[W.riders.length] || 'ski' });
            r.v = lead.v;
            settle(W, r);
            W.riders.push(r);
        }
    }

    // Send it: the lead jumps where it stands (and with `badly`, comes down in a heap).
    function sendIt(W, badly = false) {
        const r = W.riders[0], s = W.course.find(r.z);
        if (r.air || r.fall || r.afoot || r.v < 4 || r.lane || s.T.single || r.parked) return false;
        r.pop = badly ? 2 : 1;
        return true;
    }

    const NONE = {};
    // One axis of a trick by hand: [angle, rate] a step on. With `want` (-1 to 1) the rate comes round to want × max in about
    // 0.12 s; without, it keeps going (at least 0.6 × max) to the next multiple of `step`, and stops there.
    function spinBy(angle, rate, want, max, step, dt) {
        if (want) { const r = rate + (want * max - rate) * (1 - Math.exp(-dt / 0.12)); return [angle + r * dt, r]; }
        if (Math.abs(rate) < 1e-3) return [angle, 0];
        const go = Math.sign(rate) * Math.max(Math.abs(rate), 0.6 * max), next = (go > 0 ? Math.floor(angle / step + 1e-9) + 1 : Math.ceil(angle / step - 1e-9) - 1) * step, to = angle + go * dt;
        return (to - next) * go >= 0 ? [next, 0] : [to, go];
    }

    // ---- Camera ---------------------------------------------------------------------
    const CAMERAS = ['follow', 'front', 'diorama', 'auto'];
    function camera() {
        return { shot: '', x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0, heading: 0, pitch: 0, roll: 0, sway: 0, tan: 0.6, h: 0, cut: true, hold: 8, base: 'follow', turn: 0, side: 1, fix: null, until: 0, jump: null };
    }

    // The jump the lead is about to take, if any.
    function nextJump(W, r) {
        const C = W.course;
        for (const s of [C.find(r.z), C.find(r.z + 40)]) {
            for (const k of s.kickers) if (!k.lip && k.z - r.z > 6 && k.z - r.z < 30 && hits(W, r, k)) return k;
            if (s.type === 'cliff' && (r.slot === 1 || r.slot === 2) && s.zc - r.z > 6 && s.zc - r.z < 30) return { z: s.zc, u: r.u, land: 22, half: 4 };
        }
        return null;
    }

    // The director: follows, and cuts to the side of a jump, to the front, up high, to a camera left by the piste.
    function direct(cam, W, dt) {
        const C = W.course, r = W.riders[0], s = C.find(r.z);
        // In for a drink: the whole lodge, from out on the piste, until they are back in their skis.
        if (r.afoot) {
            if (cam.shot !== 'lodge') { const l = C.lodge(s); cam.fix = l.at(-14, 4, LODGE.out + 30); cam.fix[1] = Math.max(cam.fix[1], C.height(cam.fix[0], cam.fix[2]) + 2.2); cam.look = l.at(2, 4.2, 8); }
            return 'lodge';
        }
        if (cam.shot === 'lodge') { cam.base = 'follow'; cam.hold = 8 + W.rng() * 6; return 'follow'; }
        if (cam.shot === 'side') {
            if (r.z > cam.until || r.fall && r.fall.phase !== 'tumble') { cam.base = 'follow'; cam.hold = 6 + W.rng() * 6; return 'follow'; }
            return 'side';
        }
        const k = !r.air && !r.fall ? nextJump(W, r) : null;
        if (k && k !== cam.jump) {
            cam.jump = k;
            const w = C.width(k.z + 8), sg = k.u > 0 ? -1 : 1, u = clamp(k.u + sg * (k.half + 9), -(w - 1), w - 1), x = C.centre(k.z + 8) + u;
            cam.fix = [x, C.height(x, k.z + 8) + 1.7, k.z + 8];
            cam.until = k.z + k.land + 24;
            return 'side';
        }
        cam.hold -= dt;
        if (cam.hold <= 0 && !r.air && !r.fall) {
            const calm = s.T.open && C.find(r.z + 110).T.open;
            cam.turn++;
            const next = ['front', 'follow', 'diorama', 'follow', calm ? 'trackside' : 'front', 'follow'][cam.turn % 6];
            if (next === 'trackside') {
                const z = r.z + 70, sg = r.u > 0 ? 1 : -1, x = C.centre(z) + sg * (C.width(z) - 0.8);
                cam.fix = [x, C.height(x, z) + 1.9, z];
                cam.until = z + 40;
                return 'side';
            }
            cam.base = next;
            cam.hold = next === 'follow' ? 14 + W.rng() * 12 : 8 + W.rng() * 5;
        }
        return cam.base;
    }

    // mode: follow, front, diorama or auto. still: no cuts (reduced motion).
    function cameraStep(cam, W, dt, mode, still = false) {
        const C = W.course, r = W.riders[0];
        const shot = mode === 'auto' ? (still ? 'follow' : direct(cam, W, dt)) : mode;
        cam.cut = shot !== cam.shot;
        cam.shot = shot;
        // On foot at a lodge, the camera that follows stands on the piste side and looks at the lodge.
        let way = (r.afoot ? r.afoot.face : Math.atan(C.slope(r.z)) * 0.6 + r.heading * 0.4) - cam.h;
        way -= TAU * Math.round(way / TAU);
        cam.h += cam.cut ? way : way * (1 - Math.exp(-dt / 1.1));
        const sh = Math.sin(cam.h), ch = Math.cos(cam.h);
        let px, py, pz, tx = r.x, ty = r.y + 1, tz = r.z, tan = 0.6, ease = 0.22;
        if (shot === 'front') {
            const z = r.z + 9.5, l = line(W, r, z);
            px = C.centre(z) + l.c + (l.lane ? 0 : clamp(r.manual, -3, 3));
            pz = z;
            py = C.height(px, pz) + 1.3;
            ty = r.y + 0.95;
            tan = 0.46;
        } else if (shot === 'diorama') {
            // From the side that falls away, so the hill is not in the way.
            const lo = C.height(r.x - 15, r.z - 15), hi = C.height(r.x + 15, r.z - 15);
            if ((hi - lo) * cam.side > 3) cam.side = -cam.side;
            if (r.afoot) cam.side = -C.find(r.z).side;        // and never from inside the lodge
            cam.lat = cam.cut || cam.lat === undefined ? cam.side : cam.lat + (cam.side - cam.lat) * (1 - Math.exp(-dt / 1.5));
            px = r.x + cam.lat * 15;
            pz = r.z - 15;
            py = Math.max(r.y + 17 - r.lift * 0.5, C.height(px, pz) + 12);
            tz = r.z + 4;
            ty = r.y - r.lift * 0.5;
            tan = 0.36;
            ease = 0.4;
        } else if (shot === 'lodge') {
            [px, py, pz] = cam.fix;
            [tx, ty, tz] = cam.look;
            tan = 0.36;
            ease = 0;
        } else if (shot === 'side') {
            [px, py, pz] = cam.fix;
            tan = clamp(7 / Math.hypot(px - r.x, pz - r.z, py - r.y), 0.12, 0.62);
            ease = 0;
        } else {
            // On the hips, not the feet: the body takes the straighter line down, and the feet are seen to swing out under it.
            const inside = 0.8 * Math.sin(r.tilt || 0) * (r.size || 1), bx = r.x + Math.cos(r.heading) * inside, bz = r.z - Math.sin(r.heading) * inside;
            // And the camera takes a straighter line still: of the swing of a turn about its line's middle, a little over half. (That
            // is what keeps its own way across the hill gentler than the rider's, with nothing lagging behind.)
            const swing = r.air || r.fall || r.afoot || r.pipe ? 0 : clamp(0.45 * (r.u - r.c), -2.5, 2.5);
            cam.sway = cam.cut ? swing : cam.sway + (swing - cam.sway) * (1 - Math.exp(-dt / 0.3));
            px = bx - cam.sway - sh * 6.3;
            pz = bz - ch * 6.3;
            py = Math.max(r.y - r.lift * 0.6 + 2.5, C.height(px, pz) + 1.7);
            tx = bx + sh * 10;
            tz = bz + ch * 10;
            ty = r.y - r.lift * 0.5 + 0.9 - 10 * C.find(r.z).g * 0.5;
            tan = 0.53;
        }
        const k = cam.cut || !ease ? 1 : 1 - Math.exp(-dt / ease), kt = cam.cut ? 1 : 1 - Math.exp(-dt / 0.12);
        cam.x += (px - cam.x) * k;
        cam.y += (py - cam.y) * k;
        cam.z += (pz - cam.z) * k;
        cam.tx += (tx - cam.tx) * kt;
        cam.ty += (ty - cam.ty) * kt;
        cam.tz += (tz - cam.tz) * kt;
        cam.tan += (tan - cam.tan) * (cam.cut ? 1 : 1 - Math.exp(-dt / 0.5));
        cam.y = Math.max(cam.y, C.height(cam.x, cam.z) + 1);
        const dx = cam.tx - cam.x, dy = cam.ty - cam.y, dz = cam.tz - cam.z;
        cam.heading = Math.atan2(dx, dz);
        cam.pitch = Math.atan2(dy, Math.hypot(dx, dz));
        // Banked into the lead's turn as a camera that chases them would be: its top towards the inside (so the horizon tips the other
        // way in the picture), three degrees at the most, and coming on gently.
        const roll = shot === 'follow' && !still ? clamp(r.lean, -1, 1) * 0.05 : 0;
        cam.roll = cam.cut ? roll : cam.roll + (roll - cam.roll) * (1 - Math.exp(-dt / 0.35));
        return cam;
    }

    // ---- Sky ------------------------------------------------------------------------
    // `day` is the fraction of a day since midnight. Directions are unit
    // vectors [x, up, z]; downhill is +z, so a sun ahead lights the spray from behind.
    const dirOf = (el, az) => [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
    function bodies(day) {
        const sunEl = 31 * Math.sin(TAU * (day - 0.25));
        return {
            sunEl,
            sun: dirOf(sunEl * RAD, (day - 0.5) * TAU * 0.9 + 0.6),
            moon: dirOf((12 + 30 * Math.cos(TAU * day)) * RAD, -0.7 - (day < 0.5 ? day : day - 1) * 2.4),
        };
    }

    // Keyframes by the sun's elevation in degrees, scene-referred (the
    // shaders tone-map with 1 - exp(-c)): the sky overhead and at the
    // horizon, the band of colour under the sun, sunlight, and the sky's fill.
    const LIGHT = [
        { el: -18, zenith: [0.006, 0.010, 0.026], horizon: [0.016, 0.026, 0.052], glow: [0.00, 0.00, 0.00], sun: [0, 0, 0], fill: [0.020, 0.030, 0.058] },
        { el: -7, zenith: [0.020, 0.040, 0.110], horizon: [0.110, 0.110, 0.200], glow: [0.55, 0.20, 0.16], sun: [0, 0, 0], fill: [0.055, 0.075, 0.140] },
        { el: -1.5, zenith: [0.070, 0.140, 0.340], horizon: [0.420, 0.330, 0.380], glow: [1.50, 0.62, 0.22], sun: [0.25, 0.08, 0.03], fill: [0.130, 0.160, 0.270] },
        { el: 3, zenith: [0.110, 0.230, 0.520], horizon: [0.700, 0.560, 0.480], glow: [1.60, 0.85, 0.35], sun: [1.9, 0.95, 0.42], fill: [0.190, 0.240, 0.380] },
        { el: 10, zenith: [0.120, 0.290, 0.660], horizon: [0.720, 0.740, 0.780], glow: [0.90, 0.70, 0.45], sun: [2.5, 1.95, 1.35], fill: [0.240, 0.310, 0.470] },
        { el: 24, zenith: [0.105, 0.285, 0.740], horizon: [0.620, 0.770, 0.950], glow: [0.50, 0.50, 0.45], sun: [2.75, 2.55, 2.25], fill: [0.270, 0.350, 0.520] },
    ];
    const LIGHT_KEYS = ['zenith', 'horizon', 'glow', 'sun', 'fill'];

    function light(sunEl, overcast = 0) {
        let lo = LIGHT[0], hi = LIGHT[LIGHT.length - 1], t = 0;
        if (sunEl <= lo.el) hi = lo;
        else if (sunEl >= hi.el) lo = hi;
        else {
            for (let i = 1; i < LIGHT.length; i++) {
                if (sunEl <= LIGHT[i].el) { lo = LIGHT[i - 1]; hi = LIGHT[i]; t = (sunEl - lo.el) / (hi.el - lo.el); break; }
            }
        }
        const out = {};
        for (const key of LIGHT_KEYS) out[key] = mix3(lo[key], hi[key], t);
        const o = clamp(overcast, 0, 1), luma = c => 0.25 * c[0] + 0.55 * c[1] + 0.2 * c[2];
        const grey = 0.55 * luma(out.horizon) + 0.45 * luma(out.zenith) + 0.35 * luma(out.sun);
        const cloud = [grey * 0.94, grey * 0.98, grey * 1.06];
        out.zenith = mix3(out.zenith, cloud.map(c => c * 0.82), o * 0.94);
        out.horizon = mix3(out.horizon, cloud, o * 0.94);
        out.glow = out.glow.map(c => c * (1 - 0.9 * o));
        out.fill = mix3(out.fill, cloud.map(c => c * 0.62), o * 0.85);
        out.sun = out.sun.map(c => c * (1 - 0.93 * o));
        out.day = smooth(-7, 3, sunEl);                    // 0 night, 1 day: floodlights, windows
        out.stars = (1 - smooth(-14, -3, sunEl)) * (1 - o);
        return out;
    }

    // ---- Weather --------------------------------------------------------------------
    // level: how hard it snows, 0 to 1. mist: fog on the hill, 0 to 1. In
    // 'auto' fronts come and go; `often` scales how much of the time.
    const WEATHER = { clear: [0, 0], flurries: [0.3, 0], snow: [0.7, 0.15], fog: [0.05, 1] };

    function weatherStart(mode, random) {
        const fixed = WEATHER[mode];
        return { level: fixed ? fixed[0] : 0, mist: fixed ? fixed[1] : 0, target: fixed ? fixed[0] : 0, mistTarget: fixed ? fixed[1] : 0, timer: fixed ? 0 : 30 + random() * 60 };
    }

    function weatherStep(w, dt, mode, random, often = 1) {
        if (WEATHER[mode]) [w.target, w.mistTarget] = WEATHER[mode];
        else {
            w.timer -= dt;
            if (w.timer <= 0) {
                if (w.target > 0 || w.mistTarget > 0) {
                    w.target = w.mistTarget = 0;
                    w.timer = (90 + random() * 170) / Math.max(0.25, often);
                } else {
                    const roll = random();
                    if (roll < 0.25) { w.target = 0.05; w.mistTarget = 0.7 + random() * 0.3; } else { w.target = roll < 0.6 ? 0.22 + random() * 0.18 : 0.5 + random() * 0.4; w.mistTarget = w.target * 0.2; }
                    w.timer = (60 + random() * 100) * Math.max(0.5, Math.sqrt(often));
                }
            }
        }
        const k = 1 - Math.exp(-dt / (WEATHER[mode] ? 4 : 14));
        w.level += (w.target - w.level) * k;
        w.mist += (w.mistTarget - w.mist) * k;
        return w;
    }

    // What the weather does to the air: how far you can see (metres to lose
    // 63% of the contrast), cloud cover, how many flakes.
    function air(level, mist) {
        return {
            visibility: Math.min(6500 * Math.pow(260 / 6500, level), mix(6500, 240, smooth(0, 1, mist))),
            overcast: Math.max(smooth(0.02, 0.4, level), 0.75 * mist),
            flakes: clamp(level * 1.2, 0, 1),
        };
    }

    return {
        clamp, smooth, mix, mix3, RAD, TAU, G, hash, rng,
        bake, pack, sample, TYPES, ORDER, CHUNK, SLOTS, PIPE, LODGE, APRES, slotU, win, kicker, course,
        CRUISE, TRICKS, FALL, HAND, POP, GRIP, wave, world, rider, setFriends, hits, cuts, line, support, railEnds, airtime, tumble, riderStep, worldStep, worldAdvance, sendIt, trickName, obstacles,
        CAMERAS, camera, cameraStep, nextJump, bodies, light, LIGHT, WEATHER, weatherStart, weatherStep, air,
    };
})();
