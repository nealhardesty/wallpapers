// Wayfarer (SPEC §10.38): the world's own logic, with no browser in it. An
// endless road, the land it crosses (eight kinds of country, in a shuffled
// round so the walk always arrives somewhere new), the villages, cities and
// landmarks along it, the sky by the hour, the weather, and the traveller's
// own journey. tools/wayfarer.test.mjs walks it for days.
//
// The world is laid out along the road. The road runs on in +z for ever,
// wandering in x; every 360 m of it is a "leg" of one country, with a place
// (a village, a walled city, a landmark) at its middle. Everything is a pure
// function of the seed and of where you ask, so nothing is stored and
// nothing repeats; z is only ever a JavaScript double, and the renderer is
// handed positions from the camera, so the walk never runs out of precision.

const WayLogic = (() => {
    const RAD = Math.PI / 180, TAU = Math.PI * 2;
    const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
    const mix = (a, b, t) => a + (b - a) * t;
    const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const quintic = t => t * t * t * (t * (t * 6 - 15) + 10);

    // A number from 0 to 1 for a pair of whole numbers (of any size: Math.imul wraps them).
    function hash(i, j, seed) {
        let h = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1);
        h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
        h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
        return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    }
    function noise1(t, seed) {
        const i = Math.floor(t);
        return mix(hash(i, 7, seed), hash(i + 1, 7, seed), quintic(t - i));
    }
    function noise2(x, z, seed) {
        const i = Math.floor(x), j = Math.floor(z), u = quintic(x - i), v = quintic(z - j);
        return mix(mix(hash(i, j, seed), hash(i + 1, j, seed), u), mix(hash(i, j + 1, seed), hash(i + 1, j + 1, seed), u), v);
    }

    const SLOT = 360;       // metres of road to a leg
    const CHUNK = 64;       // metres to a side of the ground's near squares
    // The countries, and what each does to the land: hills by the road (m),
    // how high the valley's sides climb, how much lower or higher it lies,
    // and how wooded it is.
    const BIOMES = ['meadow', 'forest', 'lake', 'pass', 'farm', 'moor', 'coast', 'grove'];
    const LAND = {
        meadow: { relief: 5, wall: 12, lift: 0, trees: 0.13 },
        forest: { relief: 7, wall: 26, lift: 4, trees: 1 },
        lake: { relief: 4, wall: 34, lift: -6, trees: 0.4 },
        pass: { relief: 6, wall: 215, lift: 26, trees: 0.3 },
        farm: { relief: 1.6, wall: 6, lift: -2, trees: 0.05 },
        moor: { relief: 9, wall: 44, lift: 10, trees: 0.05 },
        coast: { relief: 4, wall: 20, lift: -8, trees: 0.12 },
        grove: { relief: 6, wall: 20, lift: 2, trees: 0.75 },
    };
    const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
    const ROAD = { half: 1.9, village: 2.7, city: 3.3 };

    // ---- The world ---------------------------------------------------------------
    // options: { towns: 0 to 2 (how many of the places are settled), season: 'journey' or one of SEASONS }
    function world(seed, options = {}) {
        seed = (seed >>> 0) || 1;
        const towns = options.towns ?? 1, fixedSeason = SEASONS.indexOf(options.season);
        const s = k => seed + k * 7919;

        // Each run of eight legs visits every country once, in its own order.
        const rounds = new Map();
        function round(k) {
            let order = rounds.get(k);
            if (!order) {
                order = BIOMES.map((_, i) => i);
                for (let i = 7; i > 0; i--) {
                    const j = Math.floor(hash(k, i, s(1)) * (i + 1));
                    [order[i], order[j]] = [order[j], order[i]];
                }
                if (rounds.size > 64) rounds.clear();
                rounds.set(k, order);
            }
            return order;
        }
        function biomeIndex(i) {
            const k = Math.floor(i / 8), order = round(k), at = i - k * 8;
            // Never the same country twice running, across a round's edge either.
            if (at < 2 && order[0] === round(k - 1)[7]) return order[1 - at];
            return order[at];
        }

        // A leg: its country, how high its middle lies, and the place there.
        const legs = new Map();
        function leg(i) {
            let l = legs.get(i);
            if (l) return l;
            const biome = BIOMES[biomeIndex(i)], land = LAND[biome], zc = (i + 0.5) * SLOT;
            const r = k => hash(i, k, s(2));
            l = { i, biome, land, zc, e: 40 + 12 * r(0) + land.lift, side: r(1) < 0.5 ? -1 : 1, place: 'none', radius: 0, lake: null, sea: null, mound: null, stream: null, plaza: null };
            // Settled, or a landmark. Cities want room; the pass gets a hamlet.
            const roll = r(2), open = biome !== 'pass' && biome !== 'lake' && biome !== 'coast';
            if (roll < 0.2 * towns && open) l.place = 'city';
            else if (roll < 0.56 * towns) l.place = biome === 'pass' ? 'hamlet' : 'village';
            else l.place = { meadow: r(3) < 0.5 ? 'stones' : 'castle', forest: r(3) < 0.5 ? 'elder' : 'ruin', lake: 'jetty', pass: 'cairn', farm: 'mill', moor: r(3) < 0.5 ? 'abbey' : 'castle', coast: 'lighthouse', grove: 'ring' }[biome];
            l.radius = { city: 118, village: 62, hamlet: 34 }[l.place] || 0;
            if (l.radius) l.plaza = { d: l.side * (l.place === 'city' ? 0 : 7.5), r: l.place === 'city' ? 17 : l.place === 'village' ? 9.5 : 0 };
            if (biome === 'lake') l.lake = { side: l.side, r: 95 + 40 * r(4), gap: 17, level: l.e - 1.1 };
            if (biome === 'coast') l.sea = { side: l.side, gap: 24, level: l.e - 1.6 };
            if (l.place === 'castle') l.mound = { d: -l.side * (150 + 40 * r(5)), r: 78, h: 34 + 14 * r(6) };
            // A stream crosses the road where this leg begins, if the country on both sides allows.
            const before = BIOMES[biomeIndex(i - 1)], wet = b => b === 'pass' || b === 'lake' || b === 'coast';
            if (!wet(biome) && !wet(before) && hash(i, 9, s(2)) < 0.6) l.stream = { z: i * SLOT, flip: hash(i, 10, s(2)) < 0.5 ? -1 : 1 };
            if (legs.size > 96) legs.clear();
            legs.set(i, l);
            return l;
        }

        // The road: where it is at z, and how it is heading.
        const roadX = z => 260 * (noise1(z / 700, s(3)) - 0.5) + 32 * (noise1(z / 170, s(4)) - 0.5);

        // Everything about one z, worked out once for a whole row of ground.
        const row = { z: NaN };
        function setRow(z) {
            row.z = z;
            row.x = roadX(z);
            const slope = (roadX(z + 1) - roadX(z - 1)) / 2;
            row.slope = slope;
            row.cos = 1 / Math.sqrt(1 + slope * slope);
            const u = z / SLOT - 0.5, j = Math.floor(u), g = u - j, a = leg(j), b = leg(j + 1), t = smooth(0.28, 0.72, g);
            row.a = a; row.b = b; row.t = t;
            // The road climbs from one leg's middle to the next; where a stream crosses between, it levels for the bridge.
            row.y = mix(a.e, b.e, !b.stream ? quintic(g) : g < 0.5 ? 0.5 * quintic(2 * g) : 0.5 + 0.5 * quintic(2 * g - 1));
            row.relief = mix(a.land.relief, b.land.relief, t);
            row.wall = mix(a.land.wall, b.land.wall, t);
            row.near = g < 0.5 ? a : b;                 // the leg whose middle is nearest
            row.dz = z - row.near.zc;
            row.gate = b.stream;                        // the stream between the two, if any
            if (b.stream) row.streamY = b.streamY ?? (b.streamY = mix(a.e, b.e, 0.5) - 2.3);
        }
        const at = z => { if (z !== row.z) setRow(z); return row; };

        const shore = (q, level, deep) => level - (q < 3 ? 0.25 * q : Math.min(0.75 + (q - 3) * 0.11, deep));

        // How far the sea's shore has drawn back from the road, this far along from the bay's middle.
        const headland = dz => { const u = Math.min(1, Math.abs(dz) / 168), u4 = u * u * u * u; return 2000 * (1 - Math.sqrt(1 - u4)); };
        // How far inside a leg's water a point is (metres, negative on land), or -1e9.
        function lakeQ(p, d, dz, x, z) {
            if (p.lake) {
                const l = p.lake, across = d * l.side - l.gap - l.r;
                return l.r - Math.hypot(across, dz / 1.1) + 16 * (noise2(x / 55, z / 55, s(7)) - 0.5);
            }
            // The sea comes in as a bay: open to the horizon, closed by headlands before the leg ends.
            if (p.sea) return d * p.sea.side - p.sea.gap - 26 * noise1(z / 90, s(8)) - headland(dz);
            return -1e9;
        }
        const streamQ = (st, d, z) => 4.4 - Math.abs(z - st.z - st.flip * 18 * Math.sin(d / 45));

        // The ground's height. x and z in metres.
        function ground(x, z) {
            const r = z === row.z ? row : at(z), d = (x - r.x) * r.cos, ad = Math.abs(d), p = r.near;
            const n = noise2(x / 110, z / 110, s(5)) * 2 - 1 + 0.5 * (noise2(x / 41, z / 41, s(6)) * 2 - 1);
            let h = r.relief * 0.66 * n * smooth(3, 26, ad);
            // Water lies in a basin: the hills stand back from its shore.
            const q = p.lake || p.sea ? lakeQ(p, d, r.dz, x, z) : -1e9, qb = p.sea ? q + headland(r.dz) : q;
            const basin = qb > -90 ? 1 - (1 - smooth(-12, -90, qb)) * smooth(176, 130, Math.abs(r.dz)) : 1;
            if (ad > 16) {
                const ridge = 1 - Math.abs(noise2(x / 260, z / 260, s(9)) * 2 - 1);
                h += basin * r.wall * (smooth(16, 230, ad) * (0.35 + 0.65 * ridge) + Math.max(ad - 230, 0) * 0.0011 * (0.5 + ridge));
                if (ad > 60) h += basin * 34 * (noise2(x / 520, z / 520, s(10)) - 0.35) * smooth(60, 500, ad);
            }
            // A settlement stands on levelled ground.
            if (p.radius) h *= smooth(p.radius * 0.8, p.radius * 1.5, Math.hypot(d, r.dz));
            // A stream has a valley: the hills stand back from it all the way out, so it runs level to the edge of the land.
            const sq = r.gate ? streamQ(r.gate, d, z) : -1e9;
            if (sq > -70) h *= smooth(-8, -70, sq);
            if (p.mound) {
                const m = p.mound, away = Math.hypot(d - m.d, r.dz);
                if (away < m.r * 1.4) h = mix(h, m.h, smooth(m.r * 1.4, m.r * 0.38, away));
            }
            h += r.y;
            if (q > -9) h = mix(h, shore(q, (p.lake || p.sea).level, p.sea ? 9 : 4.5), smooth(-9, -2, q));
            if (sq > -7) h = mix(h, shore(sq, r.streamY, 1.4), smooth(-7, -1, sq));
            return h;
        }

        // The water standing over a point, if any is near: its level, else -1e9.
        function water(x, z) {
            const r = z === row.z ? row : at(z), p = r.near, d = (x - r.x) * r.cos;
            if (p.lake || p.sea) { if (lakeQ(p, d, r.dz, x, z) > -12) return (p.lake || p.sea).level; }
            if (r.gate && Math.abs(z - r.gate.z) < 40) return r.streamY;
            return -1e9;
        }

        // A bridge carries the road over a stream: its deck, or null.
        function bridge(z) {
            const r = at(z);
            if (!r.gate || Math.abs(z - r.gate.z) > 11) return null;
            return r.y + 0.45 * Math.cos((z - r.gate.z) / 11 * Math.PI / 2);
        }
        // What the traveller's feet are on: the ground, or a bridge's deck.
        function surface(x, z) {
            const g = ground(x, z);
            if (Math.abs((x - row.x) * row.cos) < 2.5) { const deck = bridge(z); if (deck !== null) return Math.max(g, deck); }
            return g;
        }

        // The road's surface under a point: how far inside its edge (metres,
        // negative off it), and how cobbled the ground is there (0 to 1).
        const paved = { margin: 0, cobble: 0 };
        function pave(x, z) {
            const r = z === row.z ? row : at(z), p = r.near, d = (x - r.x) * r.cos, away = Math.hypot(d, r.dz);
            let half = ROAD.half, cobble = 0;
            if (p.radius) {
                const inTown = smooth(p.radius * 1.05, p.radius * 0.8, away);
                half = mix(half, p.place === 'city' ? ROAD.city : ROAD.village, inTown);
                cobble = p.place === 'hamlet' ? 0 : inTown;
            }
            let margin = half - Math.abs(d);
            if (p.plaza && p.plaza.r) margin = Math.max(margin, p.plaza.r - Math.hypot(d - p.plaza.d, r.dz));
            if (p.place === 'city') {
                // Side streets: one across the square, lanes behind the first row of houses.
                margin = Math.max(margin, Math.min(2.2 - Math.abs(r.dz), 66 - Math.abs(d)), Math.min(1.7 - Math.abs(Math.abs(d) - 26), 78 - Math.abs(r.dz)));
            }
            paved.margin = margin;
            paved.cobble = cobble;
            return paved;
        }

        // From the road's own coordinates (z along it, d metres to its right) to the world's, and back.
        const place = (z, d) => { const r = at(z); return [r.x + d / r.cos, z]; };
        const lateral = (x, z) => { const r = at(z); return (x - r.x) * r.cos; };
        const heading = z => Math.atan(at(z).slope);

        // The season the road is passing through: it turns every dozen legs.
        function season(z) {
            if (fixedSeason >= 0) return { index: fixedSeason, next: fixedSeason, t: 0, snow: fixedSeason === 3 ? 1 : 0 };
            const u = z / (SLOT * 11) + hash(1, 2, s(11)) * 4, k = Math.floor(u), index = ((k % 4) + 4) % 4, t = smooth(0.7, 1, u - k);
            const next = (index + 1) % 4;
            return { index, next, t, snow: index === 3 ? 1 - t : next === 3 ? t : 0 };
        }

        // The country at z, as its two neighbours and how far between them.
        const biome = z => { const r = at(z); return { a: r.a.biome, b: r.b.biome, t: r.t, near: r.near }; };
        // How cold: the pass and the winter. Rain falls as snow above a half.
        function cold(z) {
            const r = at(z), alpine = mix(r.a.biome === 'pass' ? 1 : 0, r.b.biome === 'pass' ? 1 : 0, r.t);
            return Math.max(alpine, season(z).snow);
        }

        const w = {
            seed, towns, leg, at, roadX, ground, water, surface, bridge, pave, place, lateral, heading, season, biome, cold,
            lakeQ: (x, z) => { const r = at(z); return lakeQ(r.near, (x - r.x) * r.cos, r.dz, x, z); },
            streamQ: (x, z) => { const r = at(z); return r.gate ? streamQ(r.gate, (x - r.x) * r.cos, z) : -1e9; },
            hash: (i, j, k) => hash(i, j, s(k)),
        };
        w.layout = layouts(w);
        w.scatter = scatters(w);
        return w;
    }

    // ---- Places --------------------------------------------------------------------
    // What stands at a leg's middle, as a list of things in the world's
    // coordinates: { k: kind, x, z, yaw, ... }. Yaw 0 faces +z.
    function layouts(w) {
        const cache = new Map();
        return function layout(i) {
            let out = cache.get(i);
            if (out) return out;
            out = [];
            const l = w.leg(i), zc = l.zc, rnd = (a, b = 0) => w.hash(i * 131 + a, b, 20);
            // Put a thing at (z along the road, d to its right), turned to face the road (or by `turn` from that).
            const put = (k, z, d, more = {}, turn = 0) => {
                const [x] = w.place(z, d), face = w.heading(z) + (d > 0 ? -Math.PI / 2 : Math.PI / 2) + turn;
                const item = { k, x, z, yaw: face, d, ...more };
                out.push(item);
                return item;
            };
            const lamp = (z, d) => put('lamp', z, d);
            const folk = (z, d, role, more = {}) => put('folk', z, d, { role, v: rnd(out.length, 7), ...more });

            if (l.place === 'village' || l.place === 'hamlet') {
                const hamlet = l.place === 'hamlet', span = hamlet ? 22 : 50, roofs = hamlet ? 2 : l.biome === 'coast' || l.biome === 'moor' ? 2 : rnd(1) < 0.5 ? 0 : 1;
                let n = 0;
                for (const side of [-1, 1]) {
                    for (let z = zc - span + 4 * rnd(2, side); z < zc + span; n++) {
                        const wd = 6.2 + 3.4 * rnd(n, 3), dp = 5.6 + 2.6 * rnd(n, 4), inn = !hamlet && n === 2;
                        const onPlaza = l.plaza.r && side === l.side && Math.abs(z + wd / 2 - zc) < l.plaza.r + 5;
                        const d = side * ((onPlaza ? 7.5 + l.plaza.r : 4.4 + 3.6 * rnd(n, 5)) + dp / 2), floors = inn ? 2 : rnd(n, 6) < 0.4 ? 2 : 1, front = d - side * (dp / 2 + 0.6);
                        put('house', z + wd / 2, d, { w: inn ? wd + 3 : wd, dp: inn ? dp + 2 : dp, floors, roof: roofs, v: rnd(n, 7), inn, stone: hamlet, stoneBase: rnd(n, 17) < 0.3, crooked: rnd(n, 18) < 0.35, jetty: floors > 1 && rnd(n, 19) < 0.6, shop: !inn && !hamlet && rnd(n, 20) < 0.2 }, hamlet || onPlaza ? 0 : (rnd(n, 21) - 0.5) * 0.3);
                        if (!hamlet && rnd(n, 13) < 0.55) put('clutter', z + wd / 2 + (rnd(n, 14) < 0.5 ? -0.34 : 0.34) * wd, front, { v: rnd(n, 15) });
                        if (!hamlet && rnd(n, 16) < 0.4) put('planter', z + wd / 2 + (rnd(n, 14) < 0.5 ? 0.3 : -0.3) * wd, front, { v: rnd(n, 22) });
                        // A second row, set back, with a garden between.
                        if (!hamlet && rnd(n, 8) < 0.45) put('house', z + wd / 2 + 2, d + side * (dp + 9 + 5 * rnd(n, 9)), { w: wd, dp, floors: 1, roof: roofs, v: rnd(n, 10) }, (rnd(n, 11) - 0.5) * 0.5);
                        z += (inn ? wd + 3 : wd) + 2.5 + 5 * rnd(n, 12);
                    }
                }
                for (let z = zc - span; z <= zc + span; z += 17) lamp(z, (Math.round(z / 17) % 2 ? 1 : -1) * 3.4);
                if (hamlet) {
                    put('tower', zc + 6, -l.side * 13, { h: 13, r: 2.6, roof: 2, v: rnd(30) });
                    put('bunting', zc - 12, 0, { span: 13 });
                    put('bunting', zc + 16, 0, { span: 13 });
                    folk(zc - 3, l.side * 3.2, 'stand');
                } else {
                    const pd = l.plaza.d;
                    put('well', zc, pd + l.side * 2.5);
                    put('stall', zc - 5.5, pd + l.side * 6.2, { v: rnd(31) }, Math.PI);
                    put('stall', zc + 5.5, pd + l.side * 6.2, { v: rnd(32) }, Math.PI);
                    put('chapel', zc + span + 9, -l.side * 13, { v: rnd(33) });
                    put('cart', zc - 9, -l.side * 4.4, { v: rnd(34) }, 1.2);
                    put('bench', zc + 2, -l.side * 3.6);
                    put('board', zc - 3.5, -l.side * 3.7);
                    // A garden wall by the street, and the cat that owns it.
                    put('drywall', zc - 25.5, -l.side * 3.9, { v: rnd(36) }, l.side > 0 ? -Math.PI / 2 : Math.PI / 2);
                    put('spawn', zc - 25.5, -l.side * 3.9, { kind: 'cat', n: 1, perch: 0.78 });
                    put('bunting', zc - 2, 0, { span: 15 });
                    folk(zc - 5.5, pd + l.side * 4.4, 'stand', { faceTo: Math.PI });
                    folk(zc + 5.5, pd + l.side * 4.5, 'stand', { faceTo: Math.PI });
                    folk(zc + 1, pd - l.side * 0.5, 'chat');
                    folk(zc + 2, -l.side * 3.3, 'sit');
                    for (let k = 0; k < 4; k++) folk(zc - span + 2 * span * rnd(40 + k), (k % 2 ? 1 : -1) * (1.3 + 0.9 * rnd(50 + k)), 'stroll', { range: 14 + 12 * rnd(60 + k) });
                    put('spawn', zc + 4.6, pd + l.side * 2.2, { kind: 'child', n: 2 });
                    put('spawn', zc - 16, l.side * 3.8, { kind: 'hen', n: 4 });
                    put('spawn', zc + 20, -l.side * 5, { kind: 'cat', n: 1 });
                }
                put('sign', zc - span - 14, 2.9);
            } else if (l.place === 'city') {
                // Walls on an oval the road runs through, gate to gate.
                const A = 104, B = 76, gateZ = [zc - A, zc + A];
                const N = 30;
                for (let k = 0; k < N; k++) {
                    const a0 = (k + 0.5) / N * TAU, a1 = (k + 1.5) / N * TAU, p0 = [Math.sin(a0) * B, zc - Math.cos(a0) * A], p1 = [Math.sin(a1) * B, zc - Math.cos(a1) * A];
                    if (k === N - 1 || k === N / 2 - 1) continue;      // the gates stand in these two
                    const [x0, z0] = w.place(p0[1], p0[0]), [x1, z1] = w.place(p1[1], p1[0]);
                    out.push({ k: 'wall', x: x0, z: z0, x1, z1 });
                    if (k % 3 === 1) out.push({ k: 'tower', x: x1, z: z1, yaw: 0, h: 19, r: 3.5, roof: 1, v: rnd(k, 20), flag: true });
                }
                for (const [g, gz] of gateZ.entries()) {
                    const half = B * Math.sin(Math.PI / N), [x] = w.place(gz, 0);
                    out.push({ k: 'gate', x, z: gz, yaw: w.heading(gz), half, v: rnd(g, 21) });
                    folk(gz + (g ? -4 : 4), 3.6, 'guard', { faceTo: g ? Math.PI / 2 : -Math.PI / 2 });
                    folk(gz + (g ? -4 : 4), -3.6, 'guard', { faceTo: g ? -Math.PI / 2 : Math.PI / 2 });
                    lamp(gz + (g ? 7 : -7), 3.6);
                    lamp(gz + (g ? 7 : -7), -3.6);
                }
                // Streets of tall houses: two rows either side of the high street, a lane between them.
                let n = 0;
                const inside = (z, d, pad) => ((z - zc) / (A - pad)) ** 2 + (d / (B - pad)) ** 2 < 1;
                for (const side of [-1, 1]) {
                    for (const [row, base] of [[0, 4.4], [1, 12.6], [2, 29], [3, 37]]) {
                        for (let z = zc - A + 12 + 5 * rnd(row, side + 3); z < zc + A - 12; n++) {
                            const wd = 5.6 + 3 * rnd(n, 22), dp = 6.4 + 1.4 * rnd(n, 23);
                            const zm = z + wd / 2, back = row % 2 === 1, set = row === 0 ? base + 1.1 * rnd(n, 30) : base, d = side * (set + dp / 2);
                            const clear = Math.abs(zm - zc) > wd / 2 + 2.6 && (row > 1 || Math.abs(zm - zc) > 19 + wd / 2) && Math.hypot(zm - zc - 30, d - l.side * 43) > 19 && Math.hypot(zm - zc + 32, d + l.side * 45) > 19;
                            if (clear && inside(zm + wd / 2, d + side * dp / 2, 9) && inside(zm - wd / 2, d + side * dp / 2, 9)) {
                                const floors = row === 0 ? 2 + (rnd(n, 24) < 0.45 ? 1 : 0) : 1 + (rnd(n, 24) < 0.6 ? 1 : 0);
                                put('house', zm, d, { w: wd, dp, floors, roof: rnd(n, 25) < 0.75 ? 1 : 2, v: rnd(n, 26), jetty: floors > 1 && rnd(n, 27) < 0.7, shop: row === 0 && rnd(n, 28) < 0.4, stoneBase: rnd(n, 31) < 0.35, crooked: rnd(n, 32) < 0.4 }, (back ? Math.PI : 0) + (rnd(n, 33) - 0.5) * 0.1);
                                if (row === 0 && rnd(n, 34) < 0.5) put('clutter', zm + (rnd(n, 35) < 0.5 ? -0.32 : 0.32) * wd, side * (set - 0.55), { v: rnd(n, 36) });
                                else if (row === 0 && rnd(n, 34) < 0.75) put('planter', zm + 0.3 * wd, side * (set - 0.5), { v: rnd(n, 37) });
                            }
                            z += wd + 0.6 + (rnd(n, 29) < 0.2 ? 3 : 0);
                        }
                    }
                }
                // The square: a fountain, stalls, and across it the keep and the spire.
                put('fountain', zc, 0.0001 + l.side * 8.5);
                for (const [k, [dz, d]] of [[-10.5, 8.5], [10.5, 8.5], [-7.5, -7.5], [0, -10.5], [7.5, -7.5]].entries()) put('stall', zc + dz, l.side * d, { v: rnd(k, 31) }, Math.PI);
                put('keep', zc + 30, l.side * 43, { v: rnd(33) });
                put('spire', zc - 30, -l.side * 45, { v: rnd(34) });
                put('board', zc - 13, -l.side * 5.6);
                put('bench', zc + 12.5, -l.side * 5);
                // Washing hangs across the back lanes.
                for (const side of [-1, 1]) for (let z = zc - 66; z < zc + 70; z += 26) put('washing', z + 6 * rnd(z, 38), side * 24.7, { span: 8.4, v: rnd(z, 39) });
                for (let z = zc - A + 14; z < zc + A - 8; z += 15) {
                    lamp(z, (Math.round(z / 15) % 2 ? 1 : -1) * 3.9);
                    if (Math.round(z / 15) % 2 && Math.abs(z - zc) > 22) put('bunting', z + 4, 0, { span: 9.5 });
                }
                put('cart', zc + 9, -l.side * 9, { v: rnd(35) }, 0.6);
                for (let k = 0; k < 9; k++) folk(zc - 70 + 140 * rnd(40 + k), (k % 2 ? 1 : -1) * (1.4 + 1.4 * rnd(50 + k)), 'stroll', { range: 12 + 22 * rnd(60 + k) });
                for (let k = 0; k < 5; k++) { const a = k / 5 * TAU + 0.9; folk(zc + Math.cos(a) * 10, l.side * 4 + Math.sin(a) * 7, k % 2 ? 'chat' : 'stand', { faceTo: a + 2 }); }
                put('spawn', zc + 5.6, l.side * 5, { kind: 'child', n: 3 });
                put('drywall', zc - 40, 3.95, { v: rnd(37) }, -Math.PI / 2);
                put('spawn', zc - 40, 3.95, { kind: 'cat', n: 1, perch: 0.78 });
                put('spawn', zc + 50, -5, { kind: 'cat', n: 1 });
                put('spawn', zc, l.side * 9, { kind: 'pigeon', n: 6 });
                put('sign', zc - A - 22, 3.1);
            } else if (l.place === 'stones') {
                for (let k = 0; k < 9; k++) { const a = k / 9 * TAU; put('stone', zc + Math.cos(a) * 8.5, l.side * 21 + Math.sin(a) * 8.5, { v: rnd(k), h: 2.6 + 1.6 * rnd(k, 1) }, a); }
                put('stone', zc, l.side * 21, { v: 0.5, h: 1.1, flat: true });
            } else if (l.place === 'castle') {
                const [x] = w.place(zc, l.mound.d);
                out.push({ k: 'castle', x, z: zc, yaw: w.heading(zc) + (l.mound.d > 0 ? -1.2 : 1.2), v: rnd(0), far: true });
                put('sign', zc - 30, 2.8);
            } else if (l.place === 'elder') {
                put('elder', zc, l.side * 15, { v: rnd(0) });
                put('lamp', zc - 4, l.side * 3.3, { hang: true });
                put('spawn', zc + 4, l.side * 9, { kind: 'deer', n: 2 });
            } else if (l.place === 'ruin' || l.place === 'abbey') {
                put(l.place, zc, l.side * 19, { v: rnd(0) });
                put('spawn', zc, l.side * 19, { kind: 'crow', n: 5 });
            } else if (l.place === 'jetty') {
                put('jetty', zc, l.side * (l.lake.gap - 5), { v: rnd(0), len: 15 });
                put('hut', zc - 9, l.side * 7.5, { w: 5, dp: 4.4, floors: 1, roof: 0, v: rnd(1) });
                folk(zc + 0.7, l.side * (l.lake.gap + 8.2), 'fish', { faceTo: 0 });
                put('boat', zc + 16, l.side * (l.lake.gap + 15), { v: rnd(2) });
                lamp(zc - 2, l.side * 3.2);
            } else if (l.place === 'cairn') {
                put('cairn', zc, l.side * 5, { v: rnd(0) });
                put('tower', zc + 14, -l.side * 17, { h: 11, r: 2.8, roof: 3, v: rnd(1), ruined: true });
                put('bunting', zc + 2, 0, { span: 11 });
            } else if (l.place === 'mill') {
                put('mill', zc + 6, l.side * 24, { v: rnd(0) });
                put('barn', zc - 22, -l.side * 17, { w: 11, dp: 7.5, floors: 1, roof: 0, v: rnd(1), barn: true });
                put('house', zc - 6, -l.side * 12, { w: 7.5, dp: 6, floors: 1, roof: 0, v: rnd(2) });
                folk(zc - 12, -l.side * 26, 'hoe');
                put('cart', zc - 12, -l.side * 5.6, { v: rnd(3) }, 1.4);
                lamp(zc - 6, -l.side * 3.3);
            } else if (l.place === 'lighthouse') {
                put('lighthouse', zc + 10, l.side * 15, { v: rnd(0), far: true });
                put('hut', zc - 4, l.side * 9, { w: 5.6, dp: 4.6, floors: 1, roof: 2, v: rnd(1) });
                put('boat', zc - 26, l.side * (l.sea.gap + 34), { v: rnd(2), sail: true });
                put('spawn', zc, l.side * 20, { kind: 'gull', n: 6 });
            } else if (l.place === 'ring') {
                for (let k = 0; k < 11; k++) { const a = k / 11 * TAU; put('shroom', zc + Math.cos(a) * 5.5, l.side * 13 + Math.sin(a) * 5.5, { v: rnd(k), s: 0.5 + 0.5 * rnd(k, 1), glow: true }); }
                put('shroom', zc + 9, -l.side * 11, { v: rnd(20), s: 5.5, glow: true, tree: true });
                put('spawn', zc, l.side * 13, { kind: 'wisp', n: 5 });
            }
            // Villages by the water keep boats.
            if (l.place === 'village' && (l.lake || l.sea)) {
                const gap = (l.lake || l.sea).gap, side = (l.lake || l.sea).side;
                put('jetty', zc + 20, side * (gap - 5), { v: rnd(70), len: 15 });
                put('boat', zc + 27, side * (gap + 13), { v: rnd(71), sail: !!l.sea });
                put('boat', zc - 10, side * (gap + 22), { v: rnd(72) });
            }
            if (cache.size > 24) cache.clear();
            cache.set(i, out);
            return out;
        };
    }

    // ---- What grows and stands in a square of ground ------------------------------------
    // scatter(cx, cz, far): everything rooted in the CHUNK-metre square whose
    // corner is (cx, cz) × CHUNK. Far squares keep the big things, thinned.
    const TREES = {
        meadow: [['oak', 0.7], ['poplar', 1]], forest: [['fir', 0.55], ['oak', 0.85], ['birch', 1]], lake: [['willow', 0.45], ['birch', 0.8], ['oak', 1]],
        pass: [['fir', 0.8], ['snag', 1]], farm: [['apple', 0.6], ['poplar', 1]], moor: [['snag', 0.5], ['fir', 1]], coast: [['pine', 0.8], ['oak', 1]],
        grove: [['shroom', 0.3], ['glade', 0.8], ['willow', 1]],
    };
    function scatters(w) {
        return function scatter(cx, cz, far = false) {
            const out = [], x0 = cx * CHUNK, z0 = cz * CHUNK;
            // Resting places near this square: nothing grows on them.
            const camps = [];
            for (let k = Math.floor((z0 - 100) / 120); k * 120 < z0 + CHUNK + 20; k++) { const c = camp(w, k); if (c) camps.push(c); }
            const onCamp = (x, z, pad) => camps.some(c => Math.abs(c.z - z) < pad && Math.hypot(c.x - x, c.z - z) < pad);
            const inside = (x, z) => x >= x0 && x < x0 + CHUNK && z >= z0 && z < z0 + CHUNK;
            const r0 = w.at(z0 + CHUNK / 2);
            if (Math.abs((x0 + CHUNK / 2 - r0.x) * r0.cos) > 1500) return out;

            // Trees, on a jittered grid.
            const STEP = 6.4, N = CHUNK / STEP;
            for (let j = 0; j < N; j++) {
                for (let i = 0; i < N; i++) {
                    const gi = cx * N + i, gj = cz * N + j, pick = w.hash(gi, gj, 30);
                    if (far && w.hash(gi, gj, 31) > 0.34) continue;
                    const x = (gi + 0.15 + 0.7 * w.hash(gi, gj, 32)) * STEP, z = (gj + 0.15 + 0.7 * w.hash(gi, gj, 33)) * STEP;
                    const r = w.at(z), b = w.hash(gi, gj, 34) < r.t ? r.b : r.a, d = (x - r.x) * r.cos, ad = Math.abs(d), p = r.near;
                    // Woods have glades, and thin out up the valley's sides in the pass.
                    let want = b.land.trees * (0.35 + 1.3 * smooth(0.25, 0.7, noise2(x / 70, z / 70, w.seed + 77)));
                    if (b.biome === 'pass') want *= 1 - smooth(40, 140, ad);
                    if (b.biome === 'farm' && ad > 9) want *= 0.25;
                    if (pick > want || ad < 5.6) continue;
                    const kinds = TREES[b.biome], roll = w.hash(gi, gj, 35), kind = kinds.find(k => roll < k[1])[0];
                    if (ad < (kind === 'willow' ? 9.5 : kind === 'fir' || kind === 'elder' ? 6.6 : 5.6)) continue;        // the wide ones stand further back
                    if (p.radius && Math.hypot(d, r.dz) < p.radius * 1.12) continue;
                    if (p.mound && Math.hypot(d - p.mound.d, r.dz) < 34) continue;
                    if (p.place !== 'none' && !p.radius && Math.hypot(d - p.side * 16, r.dz) < 15) continue;
                    const y = w.ground(x, z);
                    if (y < w.water(x, z) + 0.5 || y - r.y > 60 || onCamp(x, z, 6)) continue;        // not in the water, nor above the tree line
                    out.push({ k: 'tree', kind, x, z, y, yaw: roll * 40, s: 0.75 + 0.6 * w.hash(gi, gj, 36), v: w.hash(gi, gj, 37), b: b.biome });
                }
            }
            // What a place put here.
            const li = Math.floor((z0 + CHUNK / 2) / SLOT);
            for (const i of [li - 1, li, li + 1]) {
                for (const item of w.layout(i)) {
                    if (!inside(item.x, item.z) || (far && !(item.far || item.k === 'house' || item.k === 'tower' || item.k === 'wall' || item.k === 'gate' || item.k === 'keep' || item.k === 'spire' || item.k === 'mill' || item.k === 'chapel' || item.k === 'barn'))) continue;
                    out.push({ ...item, y: w.ground(item.x, item.z) });
                }
            }
            if (far) return out;

            // Small things, thick by the road where they are seen: bushes, rocks, flowers, reeds.
            const FINE = 3.2, M = CHUNK / FINE;
            for (let j = 0; j < M; j++) {
                for (let i = 0; i < M; i++) {
                    const gi = cx * M + i, gj = cz * M + j, pick = w.hash(gi, gj, 40);
                    if (pick > 0.5) continue;
                    const x = (gi + w.hash(gi, gj, 41)) * FINE, z = (gj + w.hash(gi, gj, 42)) * FINE;
                    const r = w.at(z), d = (x - r.x) * r.cos, ad = Math.abs(d), b = w.hash(gi, gj, 43) < r.t ? r.b : r.a;
                    if (ad < 2.5 || pick > 0.5 * (1 - smooth(14, 60, ad)) + 0.05) continue;
                    if ((r.near.radius && Math.hypot(d, r.dz) < r.near.radius) || onCamp(x, z, 4.6)) continue;
                    const y = w.ground(x, z), level = w.water(x, z), roll = w.hash(gi, gj, 44), v = w.hash(gi, gj, 45);
                    if (y < level - 0.05) { if (y > level - 0.9 && roll < 0.5) out.push({ k: 'reed', x, z, y: level, v, s: 0.8 + 0.6 * roll }); else if (roll > 0.8 && y > level - 2.5 && r.near.lake) out.push({ k: 'lily', x, z, y: level, v, s: 1 }); continue; }
                    if (y < level + 0.5) { if (roll < 0.6) out.push({ k: 'reed', x, z, y, v, s: 0.7 + 0.5 * roll }); continue; }
                    const kind = b.biome === 'pass' ? (roll < 0.36 ? 'rock' : 'tuft') : b.biome === 'moor' ? (roll < 0.14 ? 'rock' : roll < 0.6 ? 'heather' : 'tuft')
                        : b.biome === 'grove' ? (roll < 0.3 ? 'shroom' : roll < 0.55 ? 'fern' : 'flower') : b.biome === 'forest' ? (roll < 0.3 ? 'fern' : roll < 0.42 ? 'shroom' : roll < 0.6 ? 'bush' : roll < 0.7 ? 'rock' : 'tuft')
                        : b.biome === 'farm' ? (roll < 0.25 ? 'flower' : 'tuft') : roll < 0.38 ? 'flower' : roll < 0.52 ? 'bush' : roll < 0.6 ? 'rock' : 'tuft';
                    if (kind === 'bush' && ad < 4.4) continue;
                    out.push({ k: kind, x, z, y, v, s: 0.7 + 0.7 * w.hash(gi, gj, 46), yaw: v * 30, b: b.biome, glow: kind === 'shroom' && b.biome === 'grove' });
                }
            }
            // Along the road: fences, lanterns, milestones, camps, a bridge, and who lives here.
            const along = (step, fn) => { for (let k = Math.ceil((z0 - 40) / step); k * step < z0 + CHUNK + 40; k++) fn(k, k * step); };
            const drop = (k, z, d, more = {}, turn = 0) => {
                const [x] = w.place(z, d);
                if (!inside(x, z)) return null;
                const item = { k, x, z, y: w.ground(x, z), d, yaw: w.heading(z) + turn, ...more };
                out.push(item);
                return item;
            };
            const open = (z, pad = 0) => { const r = w.at(z); return !(r.near.radius && Math.abs(r.dz) < r.near.radius + pad) && !(r.gate && Math.abs(z - r.gate.z) < 16 + pad); };
            along(4, (k, z) => {
                const r = w.at(z), b = r.t > 0.5 ? r.b : r.a;
                if (!open(z, 6)) return;
                for (const side of [-1, 1]) {
                    const run = w.hash(Math.floor(k / 9), side, 50);
                    if (b.biome === 'farm' && run < 0.8) drop('fence', z, side * 3.5, { len: 4 });
                    else if (b.biome === 'moor' && run < 0.3) drop('drywall', z, side * 4.4, { len: 4, v: w.hash(k, side, 51) });
                    else if (b.biome === 'meadow' && run < 0.3) drop('fence', z, side * 3.4, { len: 4 });
                }
            });
            along(48, (k, z) => {
                if (!open(z, 10)) return;
                const side = w.hash(k, 0, 52) < 0.5 ? -1 : 1, roll = w.hash(k, 1, 52);
                if (roll < 0.42) drop('lamp', z, side * 3.1, {}, side > 0 ? -Math.PI / 2 : Math.PI / 2);
                else if (roll < 0.52) drop('milestone', z, side * 2.7, { v: roll });
                else if (roll < 0.6) drop('shrine', z, side * 4.2, { v: roll }, side > 0 ? -Math.PI / 2 : Math.PI / 2);
                else if (roll < 0.68) drop('logs', z, side * 4, { v: roll });
            });
            along(120, (k, z) => {
                const c = camp(w, k);
                if (c) drop('camp', c.z, c.d, { v: c.v, slot: k });
            });
            const gate = w.at(z0 + CHUNK / 2).gate || w.at(z0).gate || w.at(z0 + CHUNK).gate;
            if (gate) {
                drop('bridge', gate.z, 0, { len: 22, level: w.at(gate.z).streamY, deck: w.at(gate.z).y });
                drop('lamp', gate.z - 13, 2.6, {}, -Math.PI / 2);
                drop('spawn', gate.z + gate.flip * 18 * Math.sin(14 / 45), 14, { kind: 'duck', n: 3 });
            }
            // Animals, by the country: a few to a square, well off the road.
            const r = w.at(z0 + CHUNK / 2), b = r.t > 0.5 ? r.b : r.a, lives = w.hash(cx, cz, 60);
            const herd = { meadow: lives < 0.3 ? 'sheep' : lives < 0.42 ? 'deer' : lives < 0.55 ? 'rabbit' : '', farm: lives < 0.35 ? 'cow' : lives < 0.6 ? 'sheep' : '', forest: lives < 0.25 ? 'deer' : lives < 0.4 ? 'rabbit' : '', moor: lives < 0.3 ? 'sheep' : lives < 0.4 ? 'crow' : '',
                pass: lives < 0.2 ? 'goat' : '', lake: lives < 0.4 ? 'duck' : lives < 0.5 ? 'deer' : '', coast: lives < 0.35 ? 'gull' : '', grove: lives < 0.45 ? 'wisp' : lives < 0.6 ? 'deer' : '' }[b.biome];
            if (herd) {
                const x = x0 + CHUNK * (0.2 + 0.6 * w.hash(cx, cz, 61)), z = z0 + CHUNK * (0.2 + 0.6 * w.hash(cx, cz, 62)), d = w.lateral(x, z), y = w.ground(x, z), level = w.water(x, z);
                const afloat = herd === 'duck', okay = afloat ? y < level - 0.3 : y > level + 0.4;
                if (Math.abs(d) > 7 && Math.abs(d) < 90 && okay && open(z, 20)) out.push({ k: 'spawn', kind: herd, n: herd === 'wisp' ? 4 : herd === 'deer' ? 2 : 3 + Math.floor(lives * 97 % 3), x, z, y: afloat ? level : y, d, yaw: 0 });
            }
            return out;
        };
    }

    // A place to rest every 120 m or so, off the road: where, or null when
    // the ground there won't do (a town, water, a bridge).
    function camp(w, k) {
        const z = k * 120 + 20 + 60 * w.hash(k, 0, 53), side = w.hash(k, 1, 53) < 0.5 ? -1 : 1, d = side * (6.2 + 1.5 * w.hash(k, 2, 53));
        const r = w.at(z);
        if (r.near.radius && Math.abs(r.dz) < r.near.radius + 24) return null;
        if (r.gate && Math.abs(z - r.gate.z) < 30) return null;
        if (r.near.place !== 'none' && Math.abs(r.dz) < 40) return null;
        const [x] = w.place(z, d), y = w.ground(x, z);
        if (y < w.water(x, z) + 0.6 || Math.abs(y - r.y) > 1.2) return null;
        return { z, d, x, y, side, v: w.hash(k, 3, 53), slot: k, tended: w.hash(k, 4, 53) < 0.3 };
    }
    // The next resting place at or after z.
    function nextCamp(w, z) {
        for (let k = Math.floor((z - 20) / 120), n = 0; n < 8; k++, n++) {
            const c = camp(w, k);
            if (c && c.z > z + 6) return c;
        }
        return null;
    }

    // ---- The sky, by the hour -------------------------------------------------------------
    // day: 0 midnight, 0.25 sunrise, 0.5 noon. The sun rises behind the
    // traveller's right shoulder and sets ahead and to the left, so the
    // evenings are walked into.
    const SUNRISE = [0.8, 0, -0.6], NOON = [0.2, 0.93, 0.3];
    const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
    const arc = (a, up) => norm([SUNRISE[0] * Math.cos(a) + up[0] * Math.sin(a), up[1] * Math.sin(a), SUNRISE[2] * Math.cos(a) + up[2] * Math.sin(a)]);
    function bodies(day) {
        const a = TAU * (day - 0.25), sun = arc(a, NOON);
        // Two moons: a big pale one that keeps the night, and a small amber one on its own round.
        return { sun, sunEl: Math.asin(sun[1]) / RAD, moons: [arc(a + Math.PI + 0.45, [-0.25, 0.8, -0.4]), arc(a * 1.31 + 2.2, [0.5, 0.62, 0.2])] };
    }
    // The light for a sun elevation (degrees) and how overcast it is (0 to 1).
    const SKY = [
        // el, zenith, horizon, sun colour, sky fill, ground bounce
        [-18, [0.03, 0.05, 0.14], [0.08, 0.11, 0.24], [0, 0, 0], [0.04, 0.062, 0.155], [0.018, 0.026, 0.06]],
        [-6, [0.07, 0.1, 0.27], [0.33, 0.25, 0.37], [0, 0, 0], [0.11, 0.14, 0.3], [0.05, 0.05, 0.1]],
        [-1, [0.16, 0.24, 0.5], [0.98, 0.52, 0.3], [0.9, 0.36, 0.14], [0.3, 0.3, 0.46], [0.16, 0.12, 0.13]],
        [5, [0.2, 0.38, 0.72], [1.0, 0.72, 0.42], [1.25, 0.72, 0.36], [0.4, 0.42, 0.56], [0.24, 0.2, 0.16]],
        [16, [0.17, 0.42, 0.84], [0.74, 0.84, 0.95], [1.3, 1.02, 0.7], [0.36, 0.46, 0.7], [0.36, 0.32, 0.24]],
        [60, [0.14, 0.4, 0.86], [0.6, 0.8, 0.97], [1.3, 1.1, 0.82], [0.38, 0.48, 0.72], [0.4, 0.36, 0.26]],
    ];
    function light(sunEl, overcast = 0) {
        let i = 0;
        while (i < SKY.length - 2 && sunEl > SKY[i + 1][0]) i++;
        const a = SKY[i], b = SKY[i + 1], t = smooth(a[0], b[0], sunEl);
        const out = { zenith: mix3(a[1], b[1], t), horizon: mix3(a[2], b[2], t), sun: mix3(a[3], b[3], t), fill: mix3(a[4], b[4], t), bounce: mix3(a[5], b[5], t) };
        out.day = smooth(-7, 4, sunEl);
        out.night = 1 - smooth(-9, -1, sunEl);
        out.stars = (1 - smooth(-11, -3, sunEl)) * (1 - overcast);
        out.lit = 1 - smooth(-3, 3.5, sunEl);                  // windows and lanterns
        out.golden = smooth(-4, 3, sunEl) * (1 - smooth(6, 20, sunEl));
        // Cloud takes the colour out of everything and the sun with it.
        const grey = (out.zenith[0] + out.zenith[1] + out.zenith[2] + out.horizon[0] + out.horizon[1] + out.horizon[2]) / 6 * 1.05;
        out.zenith = mix3(out.zenith, [grey * 0.8, grey * 0.84, grey * 0.92], overcast * 0.85);
        out.horizon = mix3(out.horizon, [grey * 1.1, grey * 1.12, grey * 1.16], overcast * 0.8);
        out.sun = out.sun.map(v => v * (1 - 0.82 * overcast));
        out.fill = mix3(out.fill, [grey * 1.0, grey * 1.02, grey * 1.08], overcast * 0.6);
        return out;
    }

    // ---- Weather ---------------------------------------------------------------------------
    // cloud: 0 clear to 1 overcast. wet: 0 dry to 1 pouring. Fronts come and go.
    const WEATHER = { clear: [0.12, 0], fair: [0.4, 0], cloudy: [0.82, 0], rain: [1, 0.75], storm: [1, 1] };
    function weatherStart(mode, random) {
        const [cloud, wet] = WEATHER[mode] || [0.25 + 0.3 * random(), 0];
        return { cloud, wet, toCloud: cloud, toWet: wet, until: 40 + 80 * random() };
    }
    function weatherStep(state, dt, mode, random, often = 1) {
        if (WEATHER[mode]) [state.toCloud, state.toWet] = WEATHER[mode];
        else if ((state.until -= dt) <= 0) {
            // Mostly fair; now and then cloud; and a share of the cloud brings rain.
            const roll = random(), rainy = 0.22 * often;
            [state.toCloud, state.toWet] = roll < rainy ? [1, 0.45 + 0.55 * random()] : roll < rainy + 0.25 ? [0.6 + 0.3 * random(), 0] : [0.1 + 0.4 * random(), 0];
            state.until = (state.toWet ? 70 : 110) + 150 * random();
        }
        const ease = (v, to, secs) => v + (to - v) * (1 - Math.exp(-dt / secs));
        state.cloud = ease(state.cloud, state.toCloud, state.toCloud > state.cloud ? 14 : 22);
        // Rain waits for the cloud, and stops before it clears.
        state.wet = ease(state.wet, state.cloud > 0.85 ? state.toWet : 0, 9);
        return state;
    }

    // ---- The journey -----------------------------------------------------------------------
    // The traveller walks the road, stops to look at things, and at night
    // sits a while by a fire. z is where along the road; d is metres to its right.
    const WALK = 1.75;                // metres a second at Pace 1
    function journeyStart(w, z) {
        return { z, d: 0, distance: 0, speed: 0, mode: 'walk', timer: 0, stride: 0, look: 0, sit: 0, sinceRest: 1e9, sinceGaze: 0, camp: null, fire: 0, moving: 1, gazed: -1 };
    }
    // Something worth stopping for near z: which way to look (-1 left, 1 right, 0 ahead), or null.
    function sight(w, z) {
        const r = w.at(z), p = r.near, dz = r.dz;
        if ((p.lake || p.sea) && Math.abs(dz + 30) < 3) return { id: p.i * 4, look: (p.lake || p.sea).side };
        if (p.place === 'city' && Math.abs(dz + 150) < 3) return { id: p.i * 4 + 1, look: 0 };
        if (p.mound && Math.abs(dz + 60) < 3) return { id: p.i * 4 + 2, look: Math.sign(p.mound.d) * 0.7 };
        if (!p.radius && p.place !== 'none' && !p.mound && Math.abs(dz + 8) < 3) return { id: p.i * 4 + 3, look: p.side };
        return null;
    }
    // options: { pace, night (0 to 1), camps (rest by a fire at night), rests (stop at views) }
    function journeyStep(j, dt, w, options) {
        const r = w.at(j.z), ease = (v, to, secs) => v + (to - v) * (1 - Math.exp(-dt / secs));
        const inTown = r.near.radius && Math.abs(r.dz) < r.near.radius ? 1 : 0;
        let want = WALK * options.pace * (inTown ? 0.8 : 1), lookTo = 0, sitTo = 0, dTo = 0;
        j.sinceRest += dt;
        j.sinceGaze += dt;
        if (j.mode === 'walk') {
            const s = options.rests && j.sinceGaze > 40 ? sight(w, j.z) : null;
            if (s && s.id !== j.gazed) { j.mode = 'gaze'; j.gazed = s.id; j.timer = 5 + 3 * w.hash(s.id, 0, 70); j.gaze = s.look; }
            else if (options.camps && options.night > 0.75 && j.sinceRest > 200) {
                const c = nextCamp(w, j.z - 6);
                if (c && c.z - j.z < 9) { j.mode = 'toCamp'; j.camp = c; }
            }
        }
        if (j.mode === 'gaze') {
            want = 0; lookTo = j.gaze;
            if ((j.timer -= dt) <= 0) { j.mode = 'walk'; j.sinceGaze = 0; }
        } else if (j.mode === 'toCamp') {
            // Off the road to the fire, slowing as it arrives.
            const c = j.camp, left = c.z - j.z;
            dTo = c.d - c.side * 1.5;
            want = Math.min(want, Math.max(0.35, left * 0.5 + Math.abs(dTo - j.d) * 0.4));
            if (left < 0.25 && Math.abs(dTo - j.d) < 0.3) { j.mode = 'camp'; j.timer = options.campSeconds || 55; }
        } else if (j.mode === 'camp') {
            want = 0; sitTo = 1; dTo = j.camp.d - j.camp.side * 1.5; lookTo = j.camp.side;
            if ((j.timer -= dt) <= 0 || (options.night < 0.3 && j.timer < 40)) { j.mode = 'fromCamp'; j.sinceRest = 0; }
        } else if (j.mode === 'fromCamp' && Math.abs(j.d) < 0.5) j.mode = 'walk';
        j.fire = ease(j.fire, j.mode === 'camp' || (j.mode === 'toCamp' && j.camp.z - j.z < 5) ? 1 : 0, j.mode === 'walk' || j.mode === 'fromCamp' ? 6 : 1.2);
        if (j.mode === 'walk' && j.fire < 0.02) j.camp = null;
        j.sit = ease(j.sit, sitTo, 0.6);
        j.speed = ease(j.speed, j.sit > 0.2 ? 0 : want, want > j.speed ? 0.7 : 0.45);
        if (j.mode === 'toCamp' && j.camp.z - j.z < 0.25) j.speed = Math.min(j.speed, 0.2 * Math.abs(dTo - j.d));
        const step = j.speed * dt;
        j.z += step * r.cos * (j.mode === 'toCamp' && j.camp.z - j.z < 0.25 ? 0 : 1);
        j.d = j.mode === 'toCamp' || j.mode === 'camp' ? j.d + clamp(dTo - j.d, -1, 1) * Math.min(1, dt * 1.1 * Math.max(j.speed, 0.5)) : ease(j.d, 0, 1.4);
        j.distance += step;
        j.stride += step / 1.52;                               // a pair of steps every 1.52 m
        j.look = ease(j.look, lookTo, 0.8);
        j.moving = ease(j.moving, clamp(j.speed / (WALK * 0.6), 0, 1), 0.2);
        return j;
    }
    // Where the traveller stands: world x, y, z and the way they face.
    function standing(j, w) {
        const [x] = w.place(j.z, j.d), y = w.surface(x, j.z);
        return { x, y, z: j.z, heading: w.heading(j.z) + j.look * 1.2 };
    }

    // ---- Cameras ---------------------------------------------------------------------------
    // Each is a pure function of the journey and the seconds since the shot
    // began, and each keeps to places that are known to be clear: the road
    // itself, or well above everything.
    const SHOTS = [
        { name: 'crane', secs: 17 }, { name: 'meet', secs: 15 }, { name: 'bird', secs: 18 }, { name: 'low', secs: 14 }, { name: 'pass', secs: 16 }, { name: 'high', secs: 16 },
    ];
    // The point of the road `ahead` metres on from z (by road length, near enough), `side` metres right, `up` above it.
    function onRoad(w, z, ahead, side, up) {
        const r = w.at(z), zz = z + ahead * r.cos, [x] = w.place(zz, side);
        return [x, w.surface(x, zz) + up, zz];
    }
    function aim(from, to) {
        const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
        return { x: from[0], y: from[1], z: from[2], heading: Math.atan2(dx, dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
    }
    // mode: 'follow', 'first' or 'drift'. shot: { index, t, z0 (where the traveller was when it began) }.
    function camera(mode, j, w, seconds, shot) {
        const me = standing(j, w), head = [me.x, me.y + 1.55, me.z];
        if (mode === 'first') {
            const eye = [me.x, me.y + 1.66 * (1 - 0.42 * j.sit) + 0.03 * Math.sin(j.stride * TAU * 2) * j.moving, me.z];
            const cam = aim(eye, onRoad(w, j.z, 14, j.d * 0.3, 1.2));
            cam.heading += j.look * 1.15 + 0.16 * Math.sin(seconds / 9.7) + 0.07 * Math.sin(seconds / 4.1);
            cam.pitch += 0.04 * Math.sin(seconds / 7.3) - 0.03;
            return cam;
        }
        if (mode === 'follow') {
            // Behind and above, a little to the right, looking past the traveller down the road.
            // By the fire it stays on the road and looks across at them.
            const back = 6.4 - 1.4 * j.sit, from = onRoad(w, j.z, -back, j.d * (0.7 - 0.55 * j.sit) + 0.9, 2.5 - 0.5 * j.sit);
            const cam = aim(from, onRoad(w, j.z, 10 - 9.5 * j.sit, j.d * (0.5 + 0.5 * j.sit) - 0.8 * (1 - j.sit), 1.2 - 0.3 * j.sit));
            cam.heading += j.look * 0.5 * (1 - j.sit);
            return cam;
        }
        const s = SHOTS[shot.index % SHOTS.length], u = clamp(shot.t / s.secs, 0, 1), e = u * u * (3 - 2 * u);
        if (s.name === 'crane') return aim(onRoad(w, j.z, -9 - 9 * e, 1.5, 2.2 + 15 * e), onRoad(w, j.z, 12 + 30 * e, 0, 1.5));
        if (s.name === 'meet') return aim(onRoad(w, shot.z0, (shot.span || 26) + 5, -1.3, 1.25), [head[0], head[1] - 0.35, head[2]]);
        if (s.name === 'bird') { const c = aim(onRoad(w, j.z, -34, 4, 52 + 8 * e), onRoad(w, j.z, 40, 0, 0)); c.heading += 0.3 * Math.sin((u - 0.5) * 2.2); return c; }
        if (s.name === 'low') return aim(onRoad(w, j.z, 5.5 + 2 * e, 1.5, 0.55), [head[0], head[1] - 0.5, head[2]]);
        if (s.name === 'pass') return aim(onRoad(w, shot.z0, (shot.span || 28) * 0.6, 1.6, 2.0), head);
        const c = aim(onRoad(w, j.z, -22, -3, 24), onRoad(w, j.z, 60, 0, 6));
        c.heading += 0.5 * (u - 0.5);
        return c;
    }

    return {
        RAD, TAU, SLOT, CHUNK, BIOMES, LAND, SEASONS, ROAD, WEATHER, WALK, SHOTS,
        clamp, mix, mix3, smooth, hash, noise1, noise2,
        world, camp, nextCamp, bodies, light, weatherStart, weatherStep,
        journeyStart, journeyStep, standing, sight, camera,
    };
})();
