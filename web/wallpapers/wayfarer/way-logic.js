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
    const BOUGH = 10;       // metres between one bough over the road and the next on the same side, in the deep forest
    // The countries, and what each does to the land: hills by the road (m),
    // how high the valley's sides climb, how much lower or higher it lies,
    // and how wooded it is.
    const BIOMES = ['meadow', 'forest', 'lake', 'pass', 'farm', 'moor', 'coast', 'grove', 'deepwood'];
    const RUN = 2;          // legs of road to a stretch of one country: it changes every 720 m, not every 360
    const LAND = {
        meadow: { relief: 5, wall: 12, lift: 0, trees: 0.13 },
        forest: { relief: 7, wall: 26, lift: 4, trees: 1 },
        lake: { relief: 4, wall: 34, lift: -6, trees: 0.4 },
        pass: { relief: 6, wall: 215, lift: 26, trees: 0.3 },
        farm: { relief: 1.6, wall: 6, lift: -2, trees: 0.05 },
        moor: { relief: 9, wall: 44, lift: 10, trees: 0.05 },
        coast: { relief: 4, wall: 20, lift: -8, trees: 0.12 },
        grove: { relief: 6, wall: 20, lift: 2, trees: 0.75 },
        // The deep forest: old, tall and close, the crowns meeting over the road.
        deepwood: { relief: 6, wall: 30, lift: 5, trees: 1.3 },
    };
    const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
    const ROAD = { half: 1.9, village: 2.7, city: 3.3 };
    // A grand city: its wall's oval (A along the road, B across), the ground levelled for it, the moat outside the wall,
    // the market square, and the rock the castle stands on (d to the city's own side, dz along the road from its middle).
    const GRAND = { A: 142, B: 112, radius: 150, plaza: 23, moat: [5, 17], rock: { d: 66, dz: 20, r0: 27, r1: 40, h: 25 }, cross: [-74, 0, 74], lanes: [25.4, 50.6] };
    // How far outside a grand city's wall a point is (metres along the line from the city's middle; negative inside).
    const beyondWall = (d, dz) => { const away = Math.hypot(d, dz), rho = Math.hypot(d / GRAND.B, dz / GRAND.A); return rho > 1e-6 ? away * (1 - 1 / rho) : -GRAND.B; };
    const moatQ = out => (GRAND.moat[1] - GRAND.moat[0]) / 2 - Math.abs(out - (GRAND.moat[0] + GRAND.moat[1]) / 2);

    // ---- The world ---------------------------------------------------------------
    // options: { towns: 0 to 2 (how many of the places are settled), season: 'journey' or one of SEASONS,
    // biomes: which countries the road passes through (ids from BIOMES; none, or nothing valid, is all of them) }
    function world(seed, options = {}) {
        seed = (seed >>> 0) || 1;
        const chosen = BIOMES.map((b, i) => i).filter(i => (options.biomes || BIOMES).includes(BIOMES[i])), allowed = chosen.length ? chosen : BIOMES.map((b, i) => i), NB = allowed.length;
        const towns = options.towns ?? 1, fixedSeason = SEASONS.indexOf(options.season);
        const s = k => seed + k * 7919;

        // Each round visits every country the road is allowed once, in its own order; and each stays for RUN legs.
        const rounds = new Map();
        function round(k) {
            let order = rounds.get(k);
            if (!order) {
                order = allowed.slice();
                for (let i = NB - 1; i > 0; i--) {
                    const j = Math.floor(hash(k, i, s(1)) * (i + 1));
                    [order[i], order[j]] = [order[j], order[i]];
                }
                if (rounds.size > 64) rounds.clear();
                rounds.set(k, order);
            }
            return order;
        }
        function biomeIndex(i) {
            const q = Math.floor(i / RUN), k = Math.floor(q / NB), order = round(k), at = q - k * NB;
            if (NB === 2) return allowed[((q % 2) + 2) % 2];           // two countries: by turns
            // Never the same country in two stretches running, across a round's edge either (unless it is the only one).
            if (NB > 1 && at < 2 && order[0] === round(k - 1)[NB - 1]) return order[1 - at];
            return order[at];
        }

        // A grand city wants gentle, open country, and never stands next to another. It lies level from gate to
        // gate, halfway in height between its neighbours, so the road does its climbing outside the walls.
        const height = i => 40 + 12 * hash(i, 0, s(2)) + LAND[BIOMES[biomeIndex(i)]].lift;
        const couldBeGrand = i => { const b = BIOMES[biomeIndex(i)], before = BIOMES[biomeIndex(i - 1)]; return (b === 'meadow' || b === 'farm') && before !== 'pass' && before !== 'forest' && before !== 'deepwood' && hash(i, 7, s(2)) < 0.34 * towns; };
        const isGrand = i => couldBeGrand(i) && !couldBeGrand(i - 1);

        // A leg: its country, how high its middle lies, and the place there.
        const legs = new Map();
        function leg(i) {
            let l = legs.get(i);
            if (l) return l;
            const biome = BIOMES[biomeIndex(i)], land = LAND[biome], zc = (i + 0.5) * SLOT;
            const r = k => hash(i, k, s(2));
            l = { i, biome, land, zc, e: 40 + 12 * r(0) + land.lift, side: r(1) < 0.5 ? -1 : 1, place: 'none', radius: 0, lake: null, sea: null, mound: null, stream: null, plaza: null };
            // Settled, or a landmark. Cities want room; the pass gets a hamlet.
            const roll = r(2), open = biome !== 'pass' && biome !== 'lake' && biome !== 'coast' && biome !== 'deepwood';
            // (The leg before a grand city keeps to a landmark: nothing stands between the road and the sight of its towers.)
            const clear = isGrand(i + 1);
            if (roll < 0.2 * towns && open && !clear) l.place = 'city';
            else if (roll < 0.56 * towns && !clear) l.place = biome === 'pass' ? 'hamlet' : 'village';
            else l.place = { meadow: r(3) < 0.5 ? 'stones' : 'castle', forest: r(3) < 0.5 ? 'elder' : 'ruin', lake: 'jetty', pass: 'cairn', farm: 'mill', moor: r(3) < 0.5 ? 'abbey' : 'castle', coast: 'lighthouse', grove: 'ring', deepwood: r(3) < 0.6 ? 'elder' : 'ruin' }[biome];
            // In open, gentle country some of the cities are grand: a wider wall with a moat, and a castle on a rock inside it.
            if (isGrand(i)) { l.place = 'city'; l.grand = GRAND; l.e = (height(i - 1) + height(i + 1)) / 2; }
            l.radius = l.grand ? GRAND.radius : { city: 118, village: 62, hamlet: 34 }[l.place] || 0;
            if (l.radius) l.plaza = { d: l.side * (l.place === 'city' ? 0 : 7.5), r: l.grand ? GRAND.plaza : l.place === 'city' ? 17 : l.place === 'village' ? 9.5 : 0 };
            if (l.grand) { l.rock = { d: l.side * GRAND.rock.d, dz: GRAND.rock.dz, r0: GRAND.rock.r0, r1: GRAND.rock.r1, h: GRAND.rock.h }; l.moat = l.e - 2.4; }
            if (biome === 'lake') l.lake = { side: l.side, r: 95 + 40 * r(4), gap: 17, level: l.e - 1.1 };
            if (biome === 'coast') l.sea = { side: l.side, gap: 24, level: l.e - 1.6 };
            if (l.place === 'castle') l.mound = { d: -l.side * (150 + 40 * r(5)), r: 78, h: 34 + 14 * r(6) };
            // A stream crosses the road where this leg begins, if the country on both sides allows.
            const before = BIOMES[biomeIndex(i - 1)], wet = b => b === 'pass' || b === 'lake' || b === 'coast';
            if (!wet(biome) && !wet(before) && !l.grand && !isGrand(i - 1) && hash(i, 9, s(2)) < 0.6) l.stream = { z: i * SLOT, flip: hash(i, 10, s(2)) < 0.5 ? -1 : 1 };
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
            row.y = mix(a.e, b.e, a.grand ? quintic(clamp((g - 0.47) / 0.53, 0, 1)) : b.grand ? quintic(clamp(g / 0.53, 0, 1)) : !b.stream ? quintic(g) : g < 0.5 ? 0.5 * quintic(2 * g) : 0.5 + 0.5 * quintic(2 * g - 1));
            row.relief = mix(a.land.relief, b.land.relief, t);
            row.wall = mix(a.land.wall, b.land.wall, t);
            row.near = g < 0.5 ? a : b;                 // the leg whose middle is nearest
            row.g = g;
            row.dz = z - row.near.zc;
            row.gate = b.stream;                        // the stream between the two, if any
            if (b.stream) row.streamY = b.streamY ?? (b.streamY = mix(a.e, b.e, 0.5) - 2.3);
        }
        const at = z => { if (z !== row.z) setRow(z); return row; };

        const shore = (q, level, deep) => level - (q < 3 ? 0.25 * q : Math.min(0.75 + (q - 3) * 0.11, deep));

        // How far the sea's shore has drawn back from the road, this far along from the bay's middle.
        const headland = dz => { const u = Math.min(1, Math.abs(dz) / 168), u4 = u * u * u * u; return 2000 * (1 - Math.sqrt(1 - u4)); };
        // How far inside a leg's water a point is (metres, negative on land), or -1e9.
        function lakeQ(p, d, dz, x, z, raw = false) {
            if (p.lake) {
                const l = p.lake, across = d * l.side - l.gap - l.r;
                return l.r - Math.hypot(across, dz / 1.1) + 16 * (noise2(x / 55, z / 55, s(7)) - 0.5);
            }
            // The sea comes in as a bay: open to the horizon, closed by headlands before the leg ends.
            // (Where a bay closes its shore runs nearly along the road's own direction: measured across it, not along d, or the
            // beach there would be a cliff.)
            if (p.sea) { const q = d * p.sea.side - p.sea.gap - 26 * noise1(z / 90, s(8)) - headland(dz); return raw ? q : q / Math.min(5, Math.hypot(1, (headland(dz + 1) - headland(dz - 1)) / 2)); }
            return -1e9;
        }
        const streamQ = (st, d, z) => 4.4 - Math.abs(z - st.z - st.flip * 18 * Math.sin(d / 45));

        // The ground's height. x and z in metres.
        function ground(x, z) {
            const r = z === row.z ? row : at(z), d = (x - r.x) * r.cos, ad = Math.abs(d), p = r.near;
            const n = noise2(x / 110, z / 110, s(5)) * 2 - 1 + 0.5 * (noise2(x / 41, z / 41, s(6)) * 2 - 1);
            let h = r.relief * 0.66 * n * smooth(3, 26, ad);
            // Water lies in a basin: the hills stand back from its shore.
            const q = p.lake || p.sea ? lakeQ(p, d, r.dz, x, z) : -1e9, qb = p.sea ? lakeQ(p, d, r.dz, x, z, true) + headland(r.dz) : q;
            const basin = qb > -90 ? 1 - (1 - smooth(-12, -90, qb)) * smooth(176, 130, Math.abs(r.dz)) : 1;
            if (ad > 16) {
                const ridge = 1 - Math.abs(noise2(x / 260, z / 260, s(9)) * 2 - 1);
                h += basin * r.wall * (smooth(16, 230, ad) * (0.35 + 0.65 * ridge) + Math.max(ad - 230, 0) * 0.0011 * (0.5 + ridge));
                if (ad > 60) h += basin * 34 * (noise2(x / 520, z / 520, s(10)) - 0.35) * smooth(60, 500, ad);
            }
            // A settlement stands on levelled ground.
            if (p.radius) h *= p.grand ? smooth(p.radius, 178, Math.hypot(d, r.dz)) : smooth(p.radius * 0.8, p.radius * 1.5, Math.hypot(d, r.dz));
            // A stream has a valley: the hills stand back from it all the way out, so it runs level to the edge of the land.
            const sq = r.gate ? streamQ(r.gate, d, z) : -1e9;
            if (sq > -70) h *= smooth(-8, -70, sq);
            if (p.mound) {
                const m = p.mound, away = Math.hypot(d - m.d, r.dz);
                if (away < m.r * 1.4) h = mix(h, m.h, smooth(m.r * 1.4, m.r * 0.38, away));
            }
            if (p.rock) {
                const k = p.rock, away = Math.hypot(d - k.d, r.dz - k.dz);
                if (away < k.r1) h += k.h * smooth(k.r1, k.r0, away) * (1 + 0.1 * (noise2(x / 9, z / 9, s(12)) - 0.5) * smooth(k.r0 - 2, k.r0 + 6, away));
            }
            h += r.y;
            if (p.grand) { const mq = moatQ(beyondWall(d, r.dz)); if (mq > -5) h = mix(h, shore(mq, p.moat, 2.2), smooth(-5, -1, mq)); }
            if (q > -9) h = mix(h, shore(q, (p.lake || p.sea).level, p.sea ? 9 : 4.5), smooth(-9, -2, q));
            if (sq > -7) h = mix(h, shore(sq, r.streamY, 1.4), smooth(-7, -1, sq));
            return h;
        }

        // The water standing over a point, if any is near: its level, else -1e9.
        function water(x, z) {
            const r = z === row.z ? row : at(z), p = r.near, d = (x - r.x) * r.cos;
            if (p.lake || p.sea) { if (lakeQ(p, d, r.dz, x, z) > -12) return (p.lake || p.sea).level; }
            if (r.gate && Math.abs(z - r.gate.z) < 40) return r.streamY;
            if (p.grand) { const out = beyondWall(d, r.dz); if (out > 1.5 && out < GRAND.moat[1] + 5) return p.moat; }
            return -1e9;
        }

        // A bridge carries the road over a stream: its deck, or null.
        function bridge(z) {
            const r = at(z);
            // A grand city's drawbridges lie level across its moat.
            if (r.near.grand) { const out = Math.abs(r.dz) - GRAND.A; if (out > GRAND.moat[0] - 6 && out < GRAND.moat[1] + 6) return r.y + 0.12; }
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
            if (p.grand) {
                // Three streets across and two lanes along each side, as far as the wall; and the way to the castle's ramp.
                const out = beyondWall(d, r.dz);
                for (const cz of GRAND.cross) margin = Math.max(margin, Math.min(2.2 - Math.abs(r.dz - cz), -out - 9));
                for (const ld of GRAND.lanes) margin = Math.max(margin, Math.min(1.7 - Math.abs(Math.abs(d) - ld), -out - 9));
                if (Math.hypot(d - p.rock.d, r.dz - p.rock.dz) < p.rock.r1 + 1) margin = Math.min(margin, half - Math.abs(d));
            } else if (p.place === 'city') {
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

        // Which of the two countries a point belongs to, where one gives way to the other: 0 the one behind, 1 the one
        // ahead. Not a line across the road and not a scatter of both: a border that wanders by forty metres or so,
        // with tongues of each into the other, and a narrow edge where they mingle. Trees, plants and the ground's
        // colour all ask this, so they change together, and in the same place however often it is asked.
        function share(x, z) {
            const r = z === row.z ? row : at(z);
            if (r.a.biome === r.b.biome) return 0;
            return smooth(0.42, 0.58, r.g + 0.22 * (noise2(x / 130, z / 130, s(13)) - 0.5) + 0.06 * (noise2(x / 31, z / 31, s(14)) - 0.5));
        }
        // The air of the place, for whatever is not rooted in the ground (mist, what drifts down, fireflies): each a
        // weight that turns slowly from one country's to the next along the road, never at a step.
        const AIR = { meadow: [0.4, 1, 0, 1], forest: [1, 1, 0, 1], lake: [1, 1, 0, 1], pass: [0.4, 0, 0, 0], farm: [0.4, 1, 0, 0], moor: [1, 0, 0, 0], coast: [0.4, 0, 0, 0], grove: [1, 0, 1, 1], deepwood: [1.5, 1.8, 0, 1] };
        function air(z) {
            const r = at(z), t = smooth(0.3, 0.7, r.g), A = AIR[r.a.biome], B = AIR[r.b.biome];
            return { mist: mix(A[0], B[0], t), leafy: mix(A[1], B[1], t), grove: mix(A[2], B[2], t), cover: mix(A[3], B[3], t) };
        }
        // The country at z, as its two neighbours and how far between them.
        const biome = z => { const r = at(z); return { a: r.a.biome, b: r.b.biome, t: r.t, near: r.near }; };
        // How cold: the pass and the winter. Rain falls as snow above a half.
        function cold(z) {
            const r = at(z), alpine = mix(r.a.biome === 'pass' ? 1 : 0, r.b.biome === 'pass' ? 1 : 0, r.t);
            return Math.max(alpine, season(z).snow);
        }

        const w = {
            seed, towns, leg, at, roadX, ground, water, surface, bridge, pave, place, lateral, heading, season, biome, cold, share, air, biomes: allowed.map(i => BIOMES[i]),
            moatQ: (x, z) => { const r = at(z); return r.near.grand ? moatQ(beyondWall((x - r.x) * r.cos, r.dz)) : -1e9; },
            lakeQ: (x, z) => { const r = at(z); return lakeQ(r.near, (x - r.x) * r.cos, r.dz, x, z); },
            streamQ: (x, z) => { const r = at(z); return r.gate ? streamQ(r.gate, (x - r.x) * r.cos, z) : -1e9; },
            hash: (i, j, k) => hash(i, j, s(k)),
        };
        w.layout = layouts(w);
        w.scatter = scatters(w);
        w.solids = solidsOf(w);
        w.wildlife = wildlifeOf(w);
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
            } else if (l.grand) {
                // A grand city: a curtain wall with a tower at every joint (round, then square), a moat, two gatehouses
                // with drawbridges; a market square the road crosses; a cathedral and the guilds on one side; and on the
                // other a rock with the castle on it, reached by a ramp on arches.
                const G = l.grand, A = G.A, B = G.B, N = 44, sd = l.side, rock = l.rock;
                const outside = (dz, d) => beyondWall(d, dz);
                for (let k = 0; k < N; k++) {
                    const a0 = (k + 0.5) / N * TAU, a1 = (k + 1.5) / N * TAU;
                    if (k === N - 1 || k === N / 2 - 1) continue;
                    const [x0, z0] = w.place(zc - Math.cos(a0) * A, Math.sin(a0) * B), [x1, z1] = w.place(zc - Math.cos(a1) * A, Math.sin(a1) * B);
                    out.push({ k: 'wall', x: x0, z: z0, x1, z1, grand: true });
                    if (k !== N - 2 && k !== N / 2 - 2) out.push({ k: 'tower', x: x1, z: z1, yaw: a1, h: k % 2 ? 19 : 23, r: k % 2 ? 3.6 : 4.3, square: k % 2 === 1, roof: k % 4 === 0 ? 2 : 1, v: rnd(k, 20), flag: k % 4 === 0, grand: true });
                }
                for (const [g, gz] of [zc - A, zc + A].entries()) {
                    const half = B * Math.sin(Math.PI / N), [x] = w.place(gz, 0), o = g ? 1 : -1;          // o: the way out of this gate
                    out.push({ k: 'gate', x, z: gz, yaw: w.heading(gz) + (g ? 0 : Math.PI), half, v: rnd(g, 21), grand: true });
                    out.push({ k: 'drawbridge', x: w.place(gz + o * 11, 0)[0], z: gz + o * 11, yaw: w.heading(gz) + (g ? 0 : Math.PI), d: 0, level: l.moat });
                    for (const side of [-1, 1]) {
                        folk(gz - o * 4.5, side * 4.1, 'guard', { faceTo: side * o * Math.PI / 2 });
                        folk(gz + o * 21, side * 3.4, 'guard', { faceTo: side * o * Math.PI / 2 });
                        lamp(gz - o * 8, side * 4.2);
                        lamp(gz + o * 21.5, side * 4.6);
                    }
                    // Outside the gate: the last of the country, come to market. Shacks, a stall or two, carts waiting, plots behind fences.
                    for (let k = 0; k < 6; k++) {
                        const side = k % 2 ? 1 : -1, z = gz + o * (30 + k * 10.5 + 4 * rnd(g * 9 + k, 60)), d = side * (9.5 + 5 * rnd(g * 9 + k, 61));
                        put(k === 3 ? 'barn' : 'hut', z, d, { w: 5.2 + 2.6 * rnd(g * 9 + k, 62), dp: 4.6 + 1.2 * rnd(g * 9 + k, 63), floors: 1, roof: 0, v: rnd(g * 9 + k, 64), barn: k === 3, deep: true, crooked: true, outskirts: true }, (rnd(g * 9 + k, 65) - 0.5) * 0.5);
                        if (k % 3 === 0) put('fence', z + o * 5, side * 5.2, { len: 4 }, Math.PI / 2);
                    }
                    put('stall', gz + o * 26, 5.6, { v: rnd(g, 66) }, Math.PI);
                    put('stall', gz + o * 33, -5.8, { v: rnd(g, 67) }, Math.PI);
                    folk(gz + o * 26, 4.2, 'stand', { faceTo: Math.PI });
                    folk(gz + o * 33, -4.4, 'stand', { faceTo: Math.PI });
                    put('cart', gz + o * 41, o * 4.6, { v: rnd(g, 68) }, o > 0 ? 1.45 : -1.45);
                    put('cart', gz + o * 55, -o * 5, { v: rnd(g, 69) }, o > 0 ? -1.5 : 1.5);
                    folk(gz + o * 42.5, o * 3.4, 'chat');
                    put('clutter', gz + o * 24, -4.7, { v: rnd(g, 70) });
                    put('spawn', gz + o * 62, -sd * 13, { kind: g ? 'hen' : 'goat', n: 3 });
                    folk(gz + o * 70, sd * 14, 'hoe');
                    lamp(gz + o * 38, 3.4);
                    lamp(gz + o * 58, -3.4);
                    put('sign', gz + o * 86, 3.1);
                }
                put('mill', zc - A - 66, -sd * 36, { v: rnd(71), deep: true });
                // What stands inside, before the houses: they keep clear of all of it.
                put('citadel', zc + rock.dz, rock.d, { v: rnd(72), far: true, r0: rock.r0 });
                put('ramp', zc + rock.dz, sd * 5.5, { v: rnd(73), len: Math.abs(rock.d) - rock.r0 - 5.5, rise: rock.h, far: true }, Math.PI);
                put('cathedral', zc + 60, -sd * 66, { v: rnd(74), far: true });
                put('hall', zc - 38, -sd * 39, { v: rnd(75), far: true });
                put('markethall', zc + 30, -sd * 33, { v: rnd(76) });
                put('fountain', zc, -sd * 11.5);
                put('cross', zc - 1, sd * 12, { v: rnd(77) });
                const clearOf = (dz, d, pad) => Math.hypot(dz, d) > G.plaza + pad && Math.hypot(d - rock.d, dz - rock.dz) > rock.r1 + pad
                    && !(Math.abs(dz - rock.dz) < 4.5 + pad && d * sd > 3 && d * sd < Math.abs(rock.d))
                    && !(Math.abs(dz - 60) < 12 + pad && -d * sd > 38 - pad && -d * sd < 94 + pad) && !(Math.abs(dz + 38) < 12.5 + pad && -d * sd > 30 - pad && -d * sd < 48 + pad)
                    && !(Math.abs(dz - 30) < 7.5 + pad && -d * sd > 26 - pad && -d * sd < 40 + pad);
                // Streets of tall houses: two rows fronting the high street and each lane.
                let n = 0;
                for (const side of [-1, 1]) {
                    for (const [row, base] of [[0, 4.6], [1, 13], [2, 28.4], [3, 36.8], [4, 53.6], [5, 62]]) {
                        for (let z = zc - A + 13 + 5 * rnd(row, side + 3); z < zc + A - 13; n++) {
                            const guild = side === -sd && row < 4 && z - zc < -8 && z - zc > -70;
                            const wd = (guild ? 7.4 : 5.4) + 3 * rnd(n, 22), dp = 6.6 + 1.2 * rnd(n, 23), zm = z + wd / 2, back = row % 2 === 1, set = row === 0 ? base + 1.0 * rnd(n, 30) : base, d = side * (set + dp / 2), dz = zm - zc;
                            const onStreet = G.cross.some(c => Math.abs(dz - c) < wd / 2 + 2.6);
                            if (!onStreet && clearOf(dz, d, Math.max(wd, dp) / 2 + 2.4) && outside(dz + wd / 2, d + side * dp / 2) < -10 && outside(dz - wd / 2, d + side * dp / 2) < -10) {
                                const floors = row === 0 ? 3 + (rnd(n, 24) < 0.4 ? 1 : 0) : row < 4 ? 2 + (rnd(n, 24) < 0.5 ? 1 : 0) : 1 + (rnd(n, 24) < 0.6 ? 1 : 0);
                                put('house', zm, d, { w: wd, dp, floors: guild ? Math.max(floors, 3) : floors, roof: guild ? 2 : rnd(n, 25) < 0.7 ? 1 : 2, v: rnd(n, 26), jetty: rnd(n, 27) < 0.75, shop: guild || (row === 0 && rnd(n, 28) < 0.45), guild, stoneBase: guild || rnd(n, 31) < 0.4, crooked: !guild && rnd(n, 32) < 0.4, row }, (back ? Math.PI : 0) + (rnd(n, 33) - 0.5) * 0.08);
                                if (row === 0 && rnd(n, 34) < 0.5) put('clutter', zm + (rnd(n, 35) < 0.5 ? -0.32 : 0.32) * wd, side * (set - 0.55), { v: rnd(n, 36) });
                                else if (row === 0 && rnd(n, 34) < 0.75) put('planter', zm + 0.3 * wd, side * (set - 0.5), { v: rnd(n, 37) });
                            }
                            z += wd + 0.5 + (rnd(n, 29) < 0.15 ? 2.6 : 0);
                        }
                    }
                }
                // The market: stalls in two arcs either side of the road, under awnings.
                for (let k = 0; k < 12; k++) {
                    const a = (k + 0.5) / 12 * TAU, ring = k % 2 ? 18.5 : 13, dz = Math.cos(a) * ring, d = Math.sin(a) * ring;
                    if (Math.abs(d) < 6.2 || Math.hypot(dz, d + sd * 11.5) < 5.4 || Math.hypot(dz + 1, d - sd * 12) < 3.4) continue;
                    put('stall', zc + dz, d, { v: rnd(k, 31) }, Math.PI);
                    folk(zc + dz, d - Math.sign(d) * 1.9, 'stand', { faceTo: Math.PI });
                }
                put('board', zc - 19, -sd * 5.8);
                put('bench', zc + 17.5, sd * 5.4);
                put('bench', zc - 8, -sd * 17, {}, 0.6);
                put('cart', zc + 12, sd * 17, { v: rnd(35) }, 0.6);
                put('cart', zc - 15, -sd * 15, { v: rnd(36) }, -0.9);
                for (const side of [-1, 1]) for (let z = zc - 118; z < zc + 120; z += 24) { const dz = z - zc + 6; if (clearOf(dz, side * 24.3, 5) && outside(dz, side * 30) < -12) put('washing', zc + dz, side * 24.3, { span: 8.2, v: rnd(z, 39) }); }
                for (let z = zc - A + 12; z < zc + A - 8; z += 14) {
                    if (Math.abs(z - zc) < G.plaza - 2) continue;
                    lamp(z, (Math.round(z / 14) % 2 ? 1 : -1) * 4);
                    if (Math.round(z / 14) % 2 && Math.abs(z - zc) > G.plaza + 6) put('bunting', z + 4, 0, { span: 9.8 });
                }
                for (let k = 0; k < 8; k++) { const a = (k + 0.5) / 8 * TAU; lamp(zc + Math.cos(a) * (G.plaza - 1.5), Math.sin(a) * (G.plaza - 1.5)); }
                for (let k = 0; k < 16; k++) folk(zc - 120 + 240 * rnd(40 + k), (k % 2 ? 1 : -1) * (1.5 + 1.5 * rnd(50 + k)), 'stroll', { range: 14 + 26 * rnd(60 + k) });
                for (let k = 0; k < 7; k++) { const a = k / 7 * TAU + 0.5; folk(zc + Math.cos(a) * 8.5, Math.sin(a) * 8.5 + (Math.sin(a) > 0 ? 3.2 : -3.2), k % 2 ? 'chat' : 'stand', { faceTo: a + 2 }); }
                folk(zc + rock.dz + 2.6, sd * 7.2, 'guard', { faceTo: -sd * Math.PI / 2 });
                folk(zc + rock.dz - 2.6, sd * 7.2, 'guard', { faceTo: -sd * Math.PI / 2 });
                folk(zc + 17.5, sd * 5.1, 'sit');
                put('spawn', zc + 6, sd * 7, { kind: 'child', n: 3 });
                put('spawn', zc - 9, -sd * 7.5, { kind: 'pigeon', n: 8 });
                put('spawn', zc + 52, -sd * 30, { kind: 'pigeon', n: 5 });
                put('drywall', zc - 52, 4.2, { v: rnd(37) }, -Math.PI / 2);
                put('spawn', zc - 52, 4.2, { kind: 'cat', n: 1, perch: 0.78 });
                put('spawn', zc + 84, -4.6, { kind: 'cat', n: 1 });
                put('sign', zc - A - 104, 3.1);
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
        deepwood: [['oak', 0.55], ['fir', 0.8], ['birch', 0.9], ['willow', 1]],
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
                    const r = w.at(z), b = w.hash(gi, gj, 34) < w.share(x, z) ? r.b : r.a, d = (x - r.x) * r.cos, ad = Math.abs(d), p = r.near;
                    // Woods have glades, and thin out up the valley's sides in the pass.
                    let want = b.land.trees * (0.35 + 1.3 * smooth(0.25, 0.7, noise2(x / 70, z / 70, w.seed + 77)));
                    if (b.biome === 'pass') want *= 1 - smooth(40, 140, ad);
                    if (b.biome === 'farm' && ad > 9) want *= 0.25;
                    if (pick > want || ad < 5.6) continue;
                    const kinds = TREES[b.biome], roll = w.hash(gi, gj, 35), kind = kinds.find(k => roll < k[1])[0];
                    if (ad < (kind === 'willow' ? 9.5 : kind === 'fir' || kind === 'elder' ? 6.6 : 5.6)) continue;        // the wide ones stand further back
                    if (p.radius && Math.hypot(d, r.dz) < p.radius * 1.12) continue;
                    const town = r.a.grand ? r.a : r.b.grand ? r.b : null;
                    if (town && Math.abs(z - town.zc) < GRAND.A + 112 && ad < 48) continue;          // the fields and shacks outside its gates
                    // And further out the woods stand back from the road, so the towers are seen from a long way off.
                    if (town && Math.abs(z - town.zc) < GRAND.A + 420 && ad < 70 && w.hash(gi, gj, 38) < 0.9 * smooth(GRAND.A + 420, GRAND.A + 300, Math.abs(z - town.zc))) continue;
                    if (p.mound && Math.hypot(d - p.mound.d, r.dz) < 34) continue;
                    if (p.place !== 'none' && !p.radius && Math.hypot(d - p.side * 16, r.dz) < 15) continue;
                    const y = w.ground(x, z);
                    if (y < w.water(x, z) + 0.5 || y - r.y > 60 || onCamp(x, z, 6)) continue;        // not in the water, nor above the tree line
                    // (In the deep forest they are half as big again: old trees, their crowns closing over the road.)
                    out.push({ k: 'tree', kind, x, z, y, yaw: roll * 40, s: (0.75 + 0.6 * w.hash(gi, gj, 36)) * (b.biome === 'deepwood' ? 1.55 : 1), v: w.hash(gi, gj, 37), b: b.biome });
                }
            }
            // In the deep forest great boughs lean out over the road from either side and meet above it: one a side every
            // BOUGH metres, turn about. Where another country begins they thin out with the border (the same share).
            for (let k = Math.ceil(z0 / (BOUGH / 2) - 1); k * (BOUGH / 2) < z0 + CHUNK + BOUGH; k++) {
                const side = k % 2 === 0 ? 1 : -1, z = (k + 0.6 * (w.hash(k, 3, 52) - 0.5)) * (BOUGH / 2), r = w.at(z), b = w.hash(k, 3, 50) < w.share(r.x, z) ? r.b : r.a;
                if (b.biome !== 'deepwood') continue;
                const d = side * (6.3 + 1.3 * w.hash(k, 3, 51)), x = r.x + d / r.cos, p = r.near;
                if (!inside(x, z) || (p.radius && Math.hypot(d, r.dz) < p.radius * 1.12 + 6) || (p.place !== 'none' && !p.radius && Math.abs(r.dz) < 24) || onCamp(x, z, 12)) continue;
                const y = w.ground(x, z);
                if (y < w.water(x, z) + 0.5 || w.bridge(z) !== null && w.bridge(z) !== undefined || Math.abs(y - r.y) > 2.5) continue;
                out.push({ k: 'bough', x, z, y, yaw: w.heading(z) - side * Math.PI / 2 + 0.5 * (w.hash(k, 3, 53) - 0.5), s: 0.92 + 0.22 * w.hash(k, 3, 54), v: w.hash(k, 3, 55), b: 'deepwood', side });
            }
            // What a place put here.
            const li = Math.floor((z0 + CHUNK / 2) / SLOT);
            for (const i of [li - 1, li, li + 1]) {
                for (const item of w.layout(i)) {
                    if (!inside(item.x, item.z) || (far && !(item.far || item.k === 'cathedral' || item.k === 'hall' || item.k === 'citadel' || item.k === 'ramp' || item.k === 'house' || item.k === 'tower' || item.k === 'wall' || item.k === 'gate' || item.k === 'keep' || item.k === 'spire' || item.k === 'mill' || item.k === 'chapel' || item.k === 'barn'))) continue;
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
                    const r = w.at(z), d = (x - r.x) * r.cos, ad = Math.abs(d), b = w.hash(gi, gj, 43) < w.share(x, z) ? r.b : r.a;
                    if (ad < 2.5 || pick > 0.5 * (1 - smooth(14, 60, ad) * (b.biome === 'deepwood' ? 0.9 : 1)) + 0.05) continue;
                    if ((r.near.radius && Math.hypot(d, r.dz) < r.near.radius && !(r.near.grand && beyondWall(d, r.dz) > 2)) || onCamp(x, z, 4.6)) continue;
                    const town = r.a.grand ? r.a : r.b.grand ? r.b : null;
                    if (town && Math.abs(z - town.zc) < GRAND.A + 100 && ad < 22 && Math.abs(z - town.zc) > GRAND.A) continue;
                    const y = w.ground(x, z), level = w.water(x, z), roll = w.hash(gi, gj, 44), v = w.hash(gi, gj, 45);
                    if (y < level - 0.05) { if (y > level - 0.9 && roll < 0.5) out.push({ k: 'reed', x, z, y: level, v, s: 0.8 + 0.6 * roll }); else if (roll > 0.8 && y > level - 2.5 && r.near.lake) out.push({ k: 'lily', x, z, y: level, v, s: 1 }); continue; }
                    if (y < level + 0.5) { if (roll < 0.6) out.push({ k: 'reed', x, z, y, v, s: 0.7 + 0.5 * roll }); continue; }
                    const kind = b.biome === 'pass' ? (roll < 0.36 ? 'rock' : 'tuft') : b.biome === 'moor' ? (roll < 0.14 ? 'rock' : roll < 0.6 ? 'heather' : 'tuft')
                        : b.biome === 'grove' ? (roll < 0.3 ? 'shroom' : roll < 0.55 ? 'fern' : 'flower') : b.biome === 'deepwood' ? (roll < 0.46 ? 'fern' : roll < 0.54 ? 'shroom' : roll < 0.66 ? 'bush' : roll < 0.74 ? 'rock' : roll < 0.78 && ad > 4.5 ? 'logs' : 'litter') : b.biome === 'forest' ? (roll < 0.3 ? 'fern' : roll < 0.42 ? 'shroom' : roll < 0.6 ? 'bush' : roll < 0.7 ? 'rock' : 'tuft')
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
                deepwood: lives < 0.3 ? 'deer' : lives < 0.5 ? 'rabbit' : lives < 0.62 ? 'wisp' : '', pass: lives < 0.2 ? 'goat' : '', lake: lives < 0.4 ? 'duck' : lives < 0.5 ? 'deer' : '', coast: lives < 0.35 ? 'gull' : '', grove: lives < 0.45 ? 'wisp' : lives < 0.6 ? 'deer' : '' }[b.biome];
            if (herd) {
                const x = x0 + CHUNK * (0.2 + 0.6 * w.hash(cx, cz, 61)), z = z0 + CHUNK * (0.2 + 0.6 * w.hash(cx, cz, 62)), d = w.lateral(x, z), y = w.ground(x, z), level = w.water(x, z);
                const afloat = herd === 'duck', okay = afloat ? y < level - 0.3 : y > level + 0.4;
                if (Math.abs(d) > 7 && Math.abs(d) < 90 && okay && open(z, 20)) out.push({ k: 'spawn', kind: herd, n: herd === 'wisp' ? 4 : herd === 'deer' ? 2 : 3 + Math.floor(lives * 97 % 3), x, z, y: afloat ? level : y, d, yaw: 0 });
            }
            return out;
        };
    }

    // ---- What a camera could be inside ---------------------------------------------------------
    // The solid things rooted in a square, as upright drums { x, z, r, y0, y1 } and boxes { x, z, yaw, hw, hd, y0, y1 }
    // (hw across, hd along the way the thing faces). Generous: a roof is its whole block.
    function solidsOf(w) {
        const cache = new Map();
        const drum = (out, x, z, r, y0, y1) => out.push({ x, z, r, y0, y1 });
        const box = (out, item, hw, hd, y0, y1, along = 0, across = 0) => { const s = Math.sin(item.yaw || 0), c = Math.cos(item.yaw || 0); out.push({ x: item.x + c * across + s * along, z: item.z - s * across + c * along, yaw: item.yaw || 0, hw, hd, y0, y1 }); };
        return function solids(cx, cz) {
            const key = cx + ',' + cz;
            let out = cache.get(key);
            if (out) return out;
            out = [];
            for (const it of w.scatter(cx, cz)) {
                const y = it.y, k = it.k;
                if (k === 'tree') {
                    const sc = it.s * 1.25, slim = it.kind === 'fir' || it.kind === 'poplar' || it.kind === 'birch';
                    drum(out, it.x, it.z, 0.6 * sc, y - 1, y + 3.2 * sc);
                    if (it.kind !== 'snag') drum(out, it.x, it.z, (slim ? 2.1 : 3.3) * sc, y + (it.kind === 'fir' ? 1.6 : 2.4) * sc, y + (it.kind === 'poplar' ? 11.6 : 8.6) * sc);
                } else if (k === 'house' || k === 'hut' || k === 'barn') box(out, it, it.w / 2 + 0.9, it.dp / 2 + 1.2, y - 1, y + 1.2 + it.floors * 3 + (Math.min(it.w, it.dp) / 2 + 0.6) * 1.4);
                else if (k === 'wall') { const dx = it.x1 - it.x, dz = it.z1 - it.z; out.push({ x: it.x + dx / 2, z: it.z + dz / 2, yaw: Math.atan2(dx, dz), hw: 1.7, hd: Math.hypot(dx, dz) / 2 + 0.5, y0: y - 4, y1: y + (it.grand ? 16 : 12.4) }); }
                else if (k === 'tower') drum(out, it.x, it.z, it.r * (it.square ? 1.5 : 1.3) + 0.4, y - 2, y + it.h + 2 + it.r * 2.3);
                else if (k === 'gate') { const far = it.grand ? 8.6 : 6.4; for (const side of [-1, 1]) drum(out, it.x + Math.cos(it.yaw) * side * far, it.z - Math.sin(it.yaw) * side * far, it.grand ? 5.6 : 4.4, y - 2, y + (it.grand ? 36 : 27)); box(out, it, it.grand ? 4.4 : 3.8, it.grand ? 4.2 : 2, y + (it.grand ? 7.2 : 6.6), y + (it.grand ? 22 : 15.2)); }
                else if (k === 'keep') box(out, it, 11, 11, y - 1, y + 40);
                else if (k === 'spire') box(out, it, 6.6, 17.5, y - 1, y + 49, -3);
                else if (k === 'chapel') box(out, it, 4.6, 10.5, y - 1, y + 17, -2);
                else if (k === 'castle') box(out, it, 16.5, 13.5, y - 2, y + 36);
                else if (k === 'citadel') drum(out, it.x, it.z, it.r0 + 2.5, y - 16, y + 62);
                else if (k === 'ramp') box(out, it, 3.2, it.len / 2 + 1, y - 1, y + it.rise + 2.4, it.len / 2);
                else if (k === 'cathedral') box(out, it, 11.5, 29, y - 1, y + 62, -22);
                else if (k === 'hall') box(out, it, 12.5, 8.5, y - 1, y + 34);
                else if (k === 'markethall') box(out, it, 7.4, 5.4, y - 1, y + 9.5);
                else if (k === 'mill') drum(out, it.x, it.z, 8.4, y - 1, y + 19);
                else if (k === 'lighthouse') drum(out, it.x, it.z, 3.9, y - 2, y + 23);
                else if (k === 'bough') drum(out, it.x, it.z, 0.7 * it.s, y - 1, y + 4.5 * it.s);
                else if (k === 'elder') { drum(out, it.x, it.z, 3.6, y - 1, y + 10); drum(out, it.x, it.z, 9.6, y + 6.5, y + 19.5); }
                else if (k === 'ruin' || k === 'abbey') box(out, it, 10.5, 3.4, y - 1, y + (k === 'ruin' ? 13 : 7.5));
                else if (k === 'stone') drum(out, it.x, it.z, 1.4, y - 1, y + 1.2 + (it.flat ? 0.6 : 1.7 * it.h));
                else if (k === 'shroom' && it.tree) { drum(out, it.x, it.z, 3.2, y - 1, y + 21); drum(out, it.x, it.z, 14.5, y + 17, y + 27); }
                else if (k === 'fountain' || k === 'cross') drum(out, it.x, it.z, 3, y - 1, y + (k === 'cross' ? 7 : 3.6));
                else if (k === 'stall' || k === 'well' || k === 'cart' || k === 'board') drum(out, it.x, it.z, 1.9, y - 1, y + 3.3);
                else if (k === 'cairn' || k === 'shrine' || k === 'clutter' || k === 'rock' || k === 'bush' || k === 'logs') drum(out, it.x, it.z, 1.1, y - 1, y + (k === 'cairn' ? 3 : 1.5));
            }
            if (cache.size > 80) cache.clear();
            cache.set(key, out);
            return out;
        };
    }
    const within = (o, x, y, z, pad) => {
        if (y < o.y0 - pad || y > o.y1 + pad) return false;
        const dx = x - o.x, dz = z - o.z;
        if (o.r !== undefined) return dx * dx + dz * dz < (o.r + pad) * (o.r + pad);
        const s = Math.sin(o.yaw), c = Math.cos(o.yaw);
        return Math.abs(c * dx - s * dz) < o.hw + pad && Math.abs(s * dx + c * dz) < o.hd + pad;
    };
    // Whether a point is in the open: above the ground and the water and inside nothing (pad metres to spare).
    function inOpen(w, x, y, z, pad = 0.3) {
        if (y < Math.max(w.surface(x, z), w.water(x, z)) + pad) return false;
        const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) for (const o of w.solids(cx + i, cz + j)) if (within(o, x, y, z, pad)) return false;
        return true;
    }
    // How far the air is clear from a point along a direction, up to `far` metres: a swept test against the
    // ground, the water and whatever stands near.
    const near = [];
    function sightline(w, from, dir, far) {
        const x1 = from[0] + dir[0] * far, z1 = from[2] + dir[2] * far, R = 31;
        const i0 = Math.floor((Math.min(from[0], x1) - R) / CHUNK), i1 = Math.floor((Math.max(from[0], x1) + R) / CHUNK), j0 = Math.floor((Math.min(from[2], z1) - R) / CHUNK), j1 = Math.floor((Math.max(from[2], z1) + R) / CHUNK);
        const mx = (from[0] + x1) / 2, mz = (from[2] + z1) / 2, reach = far / 2 + 1;
        near.length = 0;
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) for (const o of w.solids(i, j)) if (Math.hypot(o.x - mx, o.z - mz) < reach + (o.r !== undefined ? o.r : Math.hypot(o.hw, o.hd))) near.push(o);
        for (let t = 0.7; t < far + 0.6; t += 0.3 + t * 0.012) {
            const x = from[0] + dir[0] * t, y = from[1] + dir[1] * t, z = from[2] + dir[2] * t;
            let hit = t > 1.4 && y < Math.max(w.surface(x, z), w.water(x, z)) + 0.3;
            for (let k = 0; !hit && k < near.length; k++) hit = within(near[k], x, y, z, 0.45);
            if (hit) return Math.max(0.9, t - 0.75);
        }
        return far;
    }

    // A place to rest every 120 m or so, off the road: where, or null when
    // the ground there won't do (a town, water, a bridge).
    function camp(w, k) {
        const z = k * 120 + 20 + 60 * w.hash(k, 0, 53), side = w.hash(k, 1, 53) < 0.5 ? -1 : 1, d = side * (6.2 + 1.5 * w.hash(k, 2, 53));
        const r = w.at(z);
        if (r.near.radius && Math.abs(r.dz) < r.near.radius + 24) return null;
        if (r.gate && Math.abs(z - r.gate.z) < 30) return null;
        if (r.near.place !== 'none' && Math.abs(r.dz) < 40) return null;
        for (const l of [r.a, r.b]) if (l.grand && Math.abs(z - l.zc) < GRAND.A + 125) return null;
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
        return { z, d: 0, face: 0, distance: 0, speed: 0, mode: 'walk', timer: 0, stride: 0, look: 0, sit: 0, sinceRest: 1e9, sinceGaze: 0, camp: null, fire: 0, moving: 1, gazed: -1 };
    }
    // Something worth stopping for near z: which way to look (-1 left, 1 right, 0 ahead), or null.
    function sight(w, z) {
        const r = w.at(z), p = r.near, dz = r.dz;
        // The first sight of a grand city, from the last of the country before it: toward its castle.
        if (r.b.grand && Math.abs(z - (r.b.zc - GRAND.A - 215)) < 3) { const to = w.place(r.b.zc + GRAND.rock.dz, r.b.rock.d); return { id: r.b.i * 4 + 0.5, look: clamp((Math.atan2(to[0] - w.roadX(z), to[1] - z) - w.heading(z)) / 1.2, -1, 1), long: 3 }; }
        if ((p.lake || p.sea) && Math.abs(dz + 30) < 3) return { id: p.i * 4, look: (p.lake || p.sea).side };
        // Before a grand city's gate: the whole of it, and the castle above the wall.
        if (p.grand && Math.abs(dz + GRAND.A + 34) < 3) return { id: p.i * 4 + 1, look: p.side * 0.3, long: 5 };
        if (p.place === 'city' && !p.grand && Math.abs(dz + 150) < 3) return { id: p.i * 4 + 1, look: 0 };
        if (p.mound && Math.abs(dz + 60) < 3) return { id: p.i * 4 + 2, look: Math.sign(p.mound.d) * 0.7 };
        if (!p.radius && p.place !== 'none' && !p.mound && Math.abs(dz + 8) < 3) return { id: p.i * 4 + 3, look: p.side };
        return null;
    }
    // options: { pace, night (0 to 1), camps (rest by a fire at night), rests (stop at views) }
    function journeyStep(j, dt, w, options) {
        const r = w.at(j.z), ease = (v, to, secs) => v + (to - v) * (1 - Math.exp(-dt / secs));
        const inTown = r.near.radius && Math.abs(r.dz) < r.near.radius ? 1 : 0;
        let want = WALK * options.pace * (inTown ? 0.8 : 1), lookTo = 0, sitTo = 0, dTo = 0;
        // Which way the traveller walks, as an angle from the road's line (j.face): by default toward the road's middle a few paces on.
        let faceTo = Math.atan2(-j.d, 3.5), across = 0, left = 0;
        j.sinceRest += dt;
        j.sinceGaze += dt;
        if (j.mode === 'walk') {
            const s = options.rests && j.sinceGaze > 40 ? sight(w, j.z) : null;
            if (s && s.id !== j.gazed) { j.mode = 'gaze'; j.gazed = s.id; j.timer = 5 + 3 * w.hash(s.id, 0, 70) + (s.long || 0); j.gaze = s.look; }
            else if (options.camps && options.night > 0.75 && j.sinceRest > 200) {
                const c = nextCamp(w, j.z - 6);
                if (c && c.z - j.z < 9) { j.mode = 'toCamp'; j.camp = c; }
            }
        }
        if (j.mode === 'gaze') {
            want = 0; lookTo = j.gaze;
            if ((j.timer -= dt) <= 0) { j.mode = 'walk'; j.sinceGaze = 0; }
        } else if (j.mode === 'toCamp') {
            // Off the road to the fire: straight for the place beside it, slowing as it arrives.
            const c = j.camp;
            dTo = c.d - c.side * 1.5; across = dTo - j.d; left = (c.z - j.z) / r.cos;
            const far = Math.hypot(across, left);
            faceTo = far > 0.05 ? Math.atan2(across, left) : j.face ?? 0;
            want = Math.min(want, Math.max(0.35, far * 0.5));
            if (far < 0.3) { j.mode = 'camp'; j.timer = options.campSeconds || 55; }
        } else if (j.mode === 'camp') {
            // Sat down facing the fire (the body turned to it, and the head a little more).
            want = 0; sitTo = 1; faceTo = j.camp.side * 1.2; lookTo = j.camp.side * 0.3;
            if ((j.timer -= dt) <= 0 || (options.night < 0.3 && j.timer < 40)) { j.mode = 'fromCamp'; j.sinceRest = 0; }
        } else if (j.mode === 'fromCamp' && Math.abs(j.d) < 0.5) j.mode = 'walk';
        j.fire = ease(j.fire, j.mode === 'camp' || (j.mode === 'toCamp' && j.camp.z - j.z < 5) ? 1 : 0, j.mode === 'walk' || j.mode === 'fromCamp' ? 6 : 1.2);
        if (j.mode === 'walk' && j.fire < 0.02) j.camp = null;
        j.sit = ease(j.sit, sitTo, 0.6);
        j.speed = ease(j.speed, j.sit > 0.2 ? 0 : want, want > j.speed ? 0.7 : 0.45);
        // They walk the way they face, and turn to face the way they mean to go: off the road to a fire and back onto it
        // is a walk on a curve, not a walk down the road with a slide across it. (Turned far from the way to go, they
        // turn before they stride.)
        j.face = turnTo(j.face ?? 0, faceTo, dt * 4, dt * 2.6);
        const err = Math.abs(turnTo(0, faceTo - j.face, 1)), step = j.speed * Math.max(0.12, Math.cos(Math.min(err, Math.PI / 2))) * dt;
        j.z += step * Math.cos(j.face) * r.cos;
        j.d += step * Math.sin(j.face);
        j.distance += step;
        j.stride += step / 1.52;                               // a pair of steps every 1.52 m
        j.look = ease(j.look, lookTo, 0.8);
        j.moving = ease(j.moving, clamp(j.speed / (WALK * 0.6), 0, 1), 0.2);
        return j;
    }
    // Where the traveller stands: world x, y, z and the way they face.
    function standing(j, w) {
        const [x] = w.place(j.z, j.d), y = w.surface(x, j.z);
        // (heading: the way they face; travel: the way they walk, which is the same but for a look aside.)
        const travel = w.heading(j.z) + (j.face ?? 0);
        return { x, y, z: j.z, heading: travel + j.look * 1.2, travel };
    }

    // ---- Wildlife -----------------------------------------------------------------------------
    // What lives in each country, off the road and about its own business. rig: who it is drawn as close by
    // (WayCompanions), far: who stands in for it further off (WayActors' plainer beasts and birds; none: it is too
    // small to see from there) with farSize and farCoat, size; rare: the share of its chances it takes (a bear is not behind every tree); n: how many together; young: [who, how many] that follow the first of them;
    // where: land (the default), water, shore, tree, air; keep: no nearer the road's middle than this, ever; range: how
    // far it wanders from home; pace and run (metres a second); shy: it is off when the traveller comes this near (on the
    // wing, if it has `wing`); act: what it does between whiles; hours: 'day' or 'night' for those only out then.
    const WILD = {
        bear: { tall: 1.25, rig: 'grizzly', far: 'bear', rare: 0.3, n: [1, 1], keep: 20, range: 14, pace: 0.7, act: 'amble', big: 1 },
        // The same bear at the water's edge, after fish.
        bearfishing: { tall: 1.1, rig: 'grizzly', far: 'bear', rare: 0.5, n: [1, 1], where: 'shore', keep: 14, act: 'fish', big: 1 },
        stag: { tall: 1.7, rig: 'stag', far: 'stag', n: [3, 6], keep: 7, range: 6, pace: 0.6, shy: 9, run: 7, act: 'graze', big: 1 },
        boar: { tall: 0.7, rig: 'boar', far: 'boar', rare: 0.6, n: [1, 1], young: ['piglet', 3], keep: 9, range: 9, pace: 0.8, shy: 16, run: 5, act: 'graze' },
        piglet: { tall: 0.25, rig: 'piglet', far: 'boar', farSize: 0.4, farCoat: [176, 136, 96], n: [0, 0], keep: 7, pace: 1.6, act: 'follow', see: 50 },
        foxcubs: { tall: 0.32, rig: 'fox', size: 0.55, far: 'fox', farSize: 0.55, n: [2, 3], keep: 7, range: 5, pace: 2.4, act: 'play', see: 80 },
        badger: { tall: 0.35, rig: 'badger', far: 'cat', farSize: 1.6, farCoat: [110, 110, 116], n: [1, 2], keep: 7, range: 8, pace: 0.6, act: 'graze', see: 55 },
        hedgehog: { tall: 0.15, rig: 'hedgehog', far: 'rabbit', farSize: 0.7, farCoat: [150, 126, 100], n: [1, 1], keep: 6, range: 4, pace: 0.25, act: 'graze', see: 35 },
        hare: { tall: 0.45, rig: 'brownhare', far: 'rabbit', farSize: 1.5, n: [2, 2], keep: 7, range: 3, pace: 2, shy: 16, run: 8, act: 'box', see: 90 },
        squirrel: { tall: 0.22, rig: 'squirrel', far: 'cat', farSize: 0.5, farCoat: [196, 96, 46], n: [1, 2], where: 'tree', keep: 6, pace: 2.2, act: 'climb', see: 45 },
        wildpony: { tall: 1.3, rig: 'wildpony', far: 'wildpony', n: [3, 6], keep: 8, range: 6, pace: 0.6, shy: 8, run: 6, act: 'graze', big: 1 },
        ibex: { tall: 1.05, rig: 'ibex', far: 'ibex', n: [3, 5], keep: 7, range: 8, pace: 0.5, act: 'graze' },
        marmot: { tall: 0.35, rig: 'marmot', far: 'rabbit', farSize: 1.3, farCoat: [176, 144, 98], n: [1, 3], keep: 6.5, range: 3, pace: 0.9, shy: 12, run: 4, act: 'sentry', see: 50 },
        moonhare: { tall: 0.45, rig: 'hare', far: 'rabbit', farSize: 1.4, n: [1, 2], keep: 7, range: 6, pace: 1.6, shy: 13, run: 7, act: 'graze', glow: [0.5, 0.7, 1], see: 90 },
        // A white stag of the grove, that glows after dark.
        moonstag: { tall: 1.7, rig: 'moonstag', far: 'stag', farCoat: [236, 240, 250], n: [1, 3], keep: 7, range: 6, pace: 0.5, shy: 8, run: 7, act: 'graze', big: 1, glow: [0.5, 0.7, 1] },
        mushling: { tall: 0.5, rig: 'mushling', n: [2, 3], keep: 7, range: 5, pace: 0.5, act: 'amble', see: 50 },
        pheasant: { tall: 0.4, rig: 'pheasant', far: 'pheasant', bird: true, n: [1, 2], keep: 7, range: 6, pace: 0.7, shy: 13, wing: true, act: 'graze', see: 80 },
        heron: { tall: 1.0, rig: 'heron', far: 'heron', bird: true, n: [1, 1], where: 'shore', keep: 8, shy: 12, wing: true, act: 'stand' },
        swan: { tall: 0.9, rig: 'swan', far: 'swan', bird: true, n: [1, 2], young: ['cygnet', 3], where: 'water', keep: 7, act: 'swim' },
        cygnet: { tall: 0.2, rig: 'cygnet', far: 'duck', bird: true, n: [0, 0], where: 'water', keep: 7, act: 'follow', pace: 1.2, see: 50 },
        otter: { tall: 0.3, rig: 'otter', far: 'cat', farSize: 1.7, farCoat: [112, 78, 54], n: [1, 2], where: 'water', keep: 7, act: 'swim', see: 60 },
        fish: { tall: 0.3, n: [1, 1], where: 'water', keep: 7, act: 'jump', see: 70 },
        seal: { tall: 0.6, rig: 'seal', far: 'seal', n: [1, 3], where: 'shore', keep: 9, act: 'bask' },
        crab: { tall: 0.12, n: [2, 4], where: 'shore', keep: 7, act: 'scuttle', see: 30 },
        kestrel: { tall: 0.5, rig: 'kestrel', far: 'kestrel', bird: true, rare: 0.35, n: [1, 1], where: 'air', keep: 0, act: 'hover' },
        eagle: { tall: 1.2, rig: 'eagle', far: 'eagle', bird: true, rare: 0.2, n: [1, 1], where: 'air', keep: 0, act: 'soar', see: 400 },
        owl: { tall: 0.4, rig: 'owl', far: 'owl', bird: true, rare: 0.6, n: [1, 1], where: 'tree', keep: 6, act: 'perch', see: 90 },
        woodpecker: { tall: 0.25, rig: 'woodpecker', far: 'woodpecker', bird: true, n: [1, 1], where: 'tree', keep: 6, act: 'peck', see: 60 },
        butterflies: { tall: 0.1, swarm: 'butterfly', n: [5, 8], keep: 4, hours: 'day', see: 40 },
        swallows: { tall: 0.3, swarm: 'swallow', rare: 0.6, n: [4, 6], keep: 0, where: 'air', hours: 'day', see: 90 },
        bats: { tall: 0.3, swarm: 'bat', rare: 0.6, n: [5, 8], keep: 0, where: 'air', hours: 'night', see: 60 },
        glowworms: { tall: 0.14, swarm: 'glow', n: [8, 12], keep: 3, hours: 'night', see: 60 },
    };
    // Who is at home where (twice in a list: twice as likely).
    const WILDLIFE = {
        meadow: ['hare', 'hare', 'foxcubs', 'hedgehog', 'kestrel', 'butterflies', 'butterflies', 'swallows', 'pheasant', 'stag', 'glowworms', 'bats'],
        farm: ['pheasant', 'pheasant', 'hare', 'hedgehog', 'swallows', 'swallows', 'butterflies', 'kestrel', 'bats', 'foxcubs'],
        forest: ['bear', 'stag', 'stag', 'squirrel', 'squirrel', 'boar', 'foxcubs', 'badger', 'woodpecker', 'owl', 'hedgehog', 'bats', 'glowworms'],
        deepwood: ['bear', 'stag', 'squirrel', 'squirrel', 'squirrel', 'boar', 'badger', 'owl', 'woodpecker', 'woodpecker', 'glowworms', 'bats'],
        lake: ['heron', 'heron', 'swan', 'swan', 'otter', 'fish', 'fish', 'stag', 'butterflies', 'bats', 'squirrel', 'bearfishing'],
        coast: ['seal', 'seal', 'heron', 'otter', 'fish', 'fish', 'swallows', 'hare', 'crab', 'crab'],
        moor: ['wildpony', 'wildpony', 'stag', 'hare', 'kestrel', 'eagle', 'marmot', 'glowworms'],
        pass: ['ibex', 'ibex', 'marmot', 'marmot', 'eagle', 'eagle', 'bear'],
        grove: ['moonhare', 'moonhare', 'mushling', 'mushling', 'squirrel', 'owl', 'glowworms', 'glowworms', 'butterflies'],
    };
    // The big ones of each country, seen from a long way off: every stretch of road has a place for one party of them,
    // somewhere with a clear view from the road.
    const WILD_SHOW = {
        meadow: ['stag', 'stag', 'stag', 'wildpony'], farm: ['stag', 'stag', 'heron'], forest: ['stag', 'stag', 'stag', 'stag', 'bear'], deepwood: ['stag', 'stag', 'stag', 'bear'],
        lake: ['heron', 'swan', 'stag', 'stag', 'bearfishing'], coast: ['heron', 'seal', 'wildpony', 'wildpony'], moor: ['wildpony', 'wildpony', 'stag'], pass: ['ibex', 'ibex', 'ibex', 'bear'], grove: ['moonstag', 'moonstag', 'stag'],
    };
    // How much of it there is: the share of the places that could hold somebody that do.
    const WILD_LEVELS = { none: 0, few: 0.15, some: 0.6, plenty: 0.96 };
    // (The line of a bough over the road, height and reach, as WayModels builds it: a squirrel's way out along one.)
    const BOUGH_LINE = [[0, 0], [2.6, 0.25], [5.2, 1.3], [6.8, 3.2], [7.5, 5.4], [7.4, 7.2]];
    // wildlife(cz): who could be at home along this CHUNK metres of the road (within fifty metres of it, where they
    // are seen), the same every time it is asked: up to six parties, each { kind, n, x, z, y, d, roll, v, biome } and,
    // for those in trees, the tree or the bough. `roll` is what the setting is held against (WILD_LEVELS): turning it
    // up adds to those already there, never moves them.
    function wildlifeOf(w) {
        const cache = new Map();
        return function wildlife(cz) {
            let out = cache.get(cz);
            if (out) return out;
            if (cache.size > 800) cache.clear();
            cache.set(cz, out = []);
            const z0 = cz * CHUNK;
            let trees = null;
            const fits = (K, x, z) => {
                const r = w.at(z), d = (x - r.x) * r.cos, ad = Math.abs(d), p = r.near, where = K.where || 'land';
                if (ad < Math.max(K.keep, where === 'air' ? 0 : 6) || ad > (where === 'air' ? 110 : 85)) return null;
                if (where !== 'air') {
                    if (p.radius && Math.hypot(d, r.dz) < p.radius * 1.15 + 16) return null;                     // not in town
                    if (r.gate && Math.abs(z - r.gate.z) < 40) return null;
                    for (const l of [r.a, r.b]) if (l.grand && Math.abs(z - l.zc) < GRAND.A + 130) return null;
                    if (p.place !== 'none' && !p.radius && Math.hypot(d - p.side * 16, r.dz) < 24) return null;   // nor on a landmark
                    if (p.mound && Math.hypot(d - p.mound.d, r.dz) < 36) return null;
                    for (let k = Math.floor((z - 20) / 120) - 1; k * 120 < z + 140; k++) { const c = camp(w, k); if (c && Math.hypot(c.x - x, c.z - z) < 12) return null; }
                }
                const y = w.ground(x, z), level = w.water(x, z);
                if (where === 'water' ? !(y < level - 0.35) : where === 'shore' ? !(y > level - 0.3 && y < level + 0.45) : where === 'air' ? false : !(y > level + 0.4)) return null;
                return { y: where === 'water' ? level : Math.max(y, where === 'shore' ? level - 0.05 : y), d, level };
            };
            // (In a town the air still has somebody in it: swallows about the roofs by day, bats by night.)
            const mid = w.at(z0 + CHUNK / 2);
            if (mid.near.radius && Math.abs(mid.dz) < mid.near.radius) for (const [kind, salt] of [['swallows', 60], ['bats', 61]]) { const z = z0 + CHUNK * w.hash(cz, 9, salt), [x] = w.place(z, 3 * (w.hash(cz, 10, salt) - 0.5)); out.push({ kind, n: 6, x, z, y: w.surface(x, z), d: w.lateral(x, z), roll: w.hash(cz, 11, salt), v: w.hash(cz, 12, salt), biome: mid.near.biome, town: true }); }
            for (let slot = 0; slot < 8; slot++) {
                const h = k => w.hash(cz, slot, 70 + k), roll = slot < 2 ? h(0) ** 1.5 : h(0), side = slot < 2 ? (slot ? -1 : 1) * (h(2) < 0.5 ? -1 : 1) : h(2) < 0.5 ? -1 : 1;
                const sz = z0 + CHUNK * h(1), r = w.at(sz), b = h(3) < w.share(r.x, sz) ? r.b : r.a, show = slot < 2, list = (show ? WILD_SHOW : WILDLIFE)[b.biome];
                const kind = list[Math.floor(h(4) * list.length)], K = WILD[kind], n = K.n[0] + Math.floor(h(5) * (K.n[1] - K.n[0] + 1));
                if (!show && K.rare && h(8) > K.rare) continue;
                if (K.where === 'tree') {
                    const cx = Math.floor(r.x / CHUNK);
                    trees ??= [cx - 1, cx, cx + 1].flatMap(c => w.scatter(c, cz)).filter(it => (it.k === 'tree' && it.kind !== 'snag' && it.kind !== 'shroom') || it.k === 'bough');
                    const near = trees.filter(it => { const d = Math.abs(w.lateral(it.x, it.z)); return d > 6 && d < 40 && fits({ keep: 6 }, it.x, it.z); });
                    // (A squirrel likes a bough over the road best.)
                    const boughs = kind === 'squirrel' ? near.filter(it => it.k === 'bough') : [], pick = boughs.length ? boughs : near.filter(it => it.k === 'tree');
                    if (!pick.length) continue;
                    const tr = pick[Math.floor(h(6) * pick.length)];
                    out.push({ kind, n, x: tr.x, z: tr.z, y: tr.y, d: w.lateral(tr.x, tr.z), roll, v: h(7), biome: b.biome, ...(tr.k === 'bough' ? { bough: { yaw: tr.yaw, s: tr.s } } : { tree: { h: (tr.kind === 'birch' ? 5.2 : tr.kind === 'fir' ? 2.6 : 3.3) * tr.s * 1.25, r: (tr.kind === 'birch' ? 0.2 : 0.42) * tr.s * 1.25 } }) });
                    continue;
                }
                // A few tries for a place that suits it (water for a swan, the water's edge for a heron, dry land off the
                // road for a bear): mostly within a stone's throw of the road, where they are seen.
                let fallback = null;
                for (let t = 0; t < (K.where === 'shore' || K.where === 'water' ? 24 : show ? 12 : 7); t++) {
                    const wet = K.where === 'shore' || K.where === 'water', small = K.tall < 0.6 && !K.swarm;
                    const z = z0 + CHUNK * w.hash(cz * 7 + slot, t, 91), d = side * (K.where === 'air' ? 4 + 22 * w.hash(cz * 7 + slot, t, 92) : Math.max(K.keep, 6) + 0.5 + (wet ? 78 : show ? 3.5 : small ? 8 : 24) * w.hash(cz * 7 + slot, t, 92) ** (wet ? 2 : 1.4)), [x] = w.place(z, d);
                    if (K.where === 'air') { out.push({ kind, n, x, z, y: Math.max(w.ground(x, z), w.water(x, z)), d, roll, v: h(7), biome: b.biome }); break; }
                    const ok = fits(K, x, z);
                    if (!ok) continue;
                    const party = { kind, n, x, z, y: ok.y, d: ok.d, roll, v: h(7), biome: b.biome };
                    // Some will cross the road when the traveller is still a long way off (those with dry ground to go to
                    // on the other side, and no bridge to cross by): the most that wildlife can do to be seen.
                    if (!K.bird && K.rig !== 'grizzly' && K.act !== 'follow' && h(9) < (show ? 0.6 : 0.4) && w.bridge(z) === null) { const over = w.place(z, -ok.d)[0]; if (fits(K, over, z)) party.cross = true; }
                    // The big ones stand where they can be seen coming: a clear line from the road forty metres back.
                    if (show) { const from = [w.place(z - 40, 0.9)[0], 0, z - 40]; from[1] = w.surface(from[0], from[2]) + 2.5; const dx = x - from[0], dy = ok.y + 1 - from[1], dz = z - from[2], far = Math.hypot(dx, dy, dz); if (sightline(w, from, [dx / far, dy / far, dz / far], far) < far - 1.3) { fallback ??= party; continue; } }
                    if (kind === 'bear') { const cx = Math.floor(x / CHUNK); let best = 15; for (const it of [cx - 1, cx, cx + 1].flatMap(c => w.scatter(c, cz))) if (it.k === 'tree' && it.kind !== 'snag' && Math.abs(w.lateral(it.x, it.z)) > K.keep) { const far = Math.hypot(it.x - x, it.z - z); if (far < best) { best = far; party.post = { x: it.x, z: it.z, r: 0.5 * it.s * 1.25 }; } } }
                    out.push(party);
                    fallback = null;
                    break;
                }
                if (fallback) out.push(fallback);
            }
            return out;
        };
    }
    // The animals of one party, where they start: [{ kind, i, x, z, y, home, yaw, ... }]. `share` (0 to 1) thins a
    // party on the lower tiers.
    function wildStart(g, w, share = 1) {
        const K = WILD[g.kind], out = [], rnd = k => hash(Math.floor(g.v * 1e6), k, 4177), n = K.swarm ? 1 : Math.max(1, Math.round(g.n * (0.5 + 0.5 * share)));
        const one = (kind, i) => {
            const k = WILD[kind], away = Math.sign(g.d) || 1, a = rnd(i * 7 + 1) * TAU, far = i ? 1.2 + (k.range || 3) * 0.4 * rnd(i * 7 + 2) : 0, r = w.at(g.z);
            // (Others of the party stand further from the road than the first, never nearer.)
            let x = g.x + Math.sin(a) * far + (i ? away * far * 0.6 / r.cos : 0), z = g.z + Math.cos(a) * far;
            if ((k.where || 'land') !== 'land' && k.where !== 'water') { x = g.x; z = g.z; }
            return { kind, K: k, g, i, x, z, y: g.y, hx: x, hz: z, yaw: rnd(i * 7 + 3) * TAU, alt: 0, gait: rnd(i * 7 + 4), moving: 0, state: 'idle', timer: 1 + 6 * rnd(i * 7 + 5), v: rnd(i * 7 + 6), rest: 0, down: 0, wing: 0, pitch: 0, bank: 0, alert: 0, alarm: 0, u: 0, turn: rnd(i * 7 + 3) * TAU, hidden: false, count: K.swarm ? Math.max(2, Math.round(g.n * (0.4 + 0.6 * share))) : 1 };
        };
        for (let i = 0; i < n; i++) out.push(one(g.kind, i));
        if (K.young && !K.swarm) for (let i = 0; i < Math.max(1, Math.round(K.young[1] * share)); i++) out.push(one(K.young[0], n + i));
        return out;
    }
    // Along a tree's trunk or out along a bough, u from 0 (the ground) to 1: where, how high, and how steep.
    function wildPath(g, u) {
        if (g.bough) {
            const s = g.bough.s, at = u * (BOUGH_LINE.length - 1), i = Math.min(BOUGH_LINE.length - 2, Math.floor(at)), f = at - i, A = BOUGH_LINE[i], B = BOUGH_LINE[i + 1], y = mix(A[0], B[0], f) * s, out = mix(A[1], B[1], f) * s;
            return { x: g.x + Math.sin(g.bough.yaw) * out, z: g.z + Math.cos(g.bough.yaw) * out, alt: y + 0.24 * s * (1 - u * 0.6), pitch: Math.atan2(B[0] - A[0], B[1] - A[1]), yaw: g.bough.yaw, len: 12.5 * s };
        }
        const t = g.tree, a = g.v * TAU;
        return { x: g.x + Math.sin(a) * t.r, z: g.z + Math.cos(a) * t.r, alt: u * t.h, pitch: Math.PI / 2, yaw: a + Math.PI, len: t.h };
    }
    // One step of one wild animal's small life. ctx: { t, night (0 to 1), me: { x, z } (the traveller), random, party
    // (the others of its party) }. Those on the ground walk the way they face, turn no faster than their size allows,
    // and never come nearer the road than their kind keeps (so never onto it).
    function wildStep(a, dt, w, ctx) {
        const K = a.K, g = a.g, me = ctx.me, random = ctx.random, act = K.act, dxm = a.x - me.x, dzm = a.z - me.z, near = Math.hypot(dxm, dzm);
        const ease = (v, to, secs) => v + (to - v) * (1 - Math.exp(-dt / secs)), rate = (K.big ? 1.4 : 3.2) * dt;
        const go = (tx, tz, speed, most = rate) => {
            const dx = tx - a.x, dz = tz - a.z, left = Math.hypot(dx, dz);
            if (left < 1e-3) return 0;
            const to = Math.atan2(dx, dz);
            a.yaw = turnTo(a.yaw, to, dt * 5, most);
            const step = Math.min(speed * Math.max(0.1, Math.cos(Math.min(Math.abs(turnTo(0, to - a.yaw, 1)), Math.PI / 2))) * dt, left);
            a.x += Math.sin(a.yaw) * step; a.z += Math.cos(a.yaw) * step; a.gait += step; a.moving = ease(a.moving, 1, 0.2);
            return left - step;
        };
        const dry = (x, z) => Math.abs(w.lateral(x, z)) >= K.keep && w.ground(x, z) > w.water(x, z) + 0.4;
        a.alert = ease(a.alert, near < (K.shy || 8) + 12 ? 1 : 0, 0.5);
        a.timer -= dt;
        if (K.swarm) return a;
        if (act === 'climb') {
            // Up the trunk (or out along the bough), a look about, and down again to forage at the foot of it.
            const p0 = wildPath(g, a.u);
            if (a.state === 'idle') { a.moving = ease(a.moving, 0, 0.2); a.rest = ease(a.rest, 1, 0.3); if (a.timer < 0) { a.state = a.u < 0.5 ? 'up' : 'down'; a.top = 0.55 + 0.45 * random(); } }
            else { a.rest = ease(a.rest, 0, 0.15); a.u = clamp(a.u + (a.state === 'up' ? 1 : -1) * K.pace * dt / p0.len, 0, 1); a.gait += K.pace * dt; a.moving = 1; if (a.state === 'up' ? a.u >= a.top : a.u <= 0) { a.state = 'idle'; a.timer = (a.u > 0 ? 2 : 4) + 5 * random(); } }
            const p = wildPath(g, a.u), up = a.state === 'down' ? -1 : 1, onTrunk = a.u > 0.02;
            a.x = p.x; a.z = p.z; a.alt = p.alt; a.y = g.y;
            a.pitch = ease(a.pitch, onTrunk ? p.pitch * up : 0, 0.12);
            a.yaw = turnTo(a.yaw, onTrunk ? p.yaw + (up < 0 && g.bough ? Math.PI : 0) : p.yaw + Math.PI, dt * 8, 6 * dt);
            return a;
        }
        if (act === 'swim') {
            // Round and about on the water, the young in a line behind.
            a.turn += dt * 0.2 * (a.v < 0.5 ? 1 : -1);
            const wide = 2.5 + 3 * a.v, x = a.hx + Math.sin(a.turn) * wide, z = a.hz + Math.cos(a.turn * 0.7) * wide * 0.7;
            const moved = Math.hypot(x - a.x, z - a.z);
            if (moved > 1e-4) a.yaw = turnTo(a.yaw, Math.atan2(x - a.x, z - a.z), dt * 4, 3 * dt);
            a.x = x; a.z = z; a.moving = 0.4; a.gait += moved;
            a.alt = K.rig === 'otter' ? -0.1 - 0.12 * Math.max(0, Math.sin(ctx.t * 0.5 + a.v * 9)) : 0;
            return a;
        }
        if (act === 'jump') {
            // A fish: out of the water in an arc, now and then, and gone again.
            if (a.leap > 0) { a.leap -= dt; const u = 1 - Math.max(0, a.leap) / 0.9; a.x = a.jx + Math.sin(a.yaw) * u * 1.3; a.z = a.jz + Math.cos(a.yaw) * u * 1.3; a.alt = Math.sin(Math.PI * u) * 0.65 - 0.12; a.pitch = Math.cos(Math.PI * u) * 1.1; a.hidden = a.leap <= 0; if (a.hidden) a.timer = 4 + 9 * random(); }
            else if (a.timer < 0) { a.leap = 0.9; a.yaw = random() * TAU; a.jx = a.hx + (random() - 0.5) * 4; a.jz = a.hz + (random() - 0.5) * 4; a.hidden = false; }
            else a.hidden = true;
            return a;
        }
        if (act === 'scuttle') {
            // A crab goes sideways along the water's edge, and stops, and goes back.
            const along = 1.4 * Math.sin(ctx.t * 0.35 + a.v * 40 + a.i * 2) + 0.5 * Math.sin(ctx.t * 0.9 + a.i), z = a.hz + along, x = a.hx + 0.3 * Math.sin(a.i * 3 + a.v * 9);
            a.moving = Math.min(1, Math.abs(z - a.z) / Math.max(dt, 1e-3) * 2); a.gait += Math.abs(z - a.z);
            a.x = x; a.z = z; a.yaw = w.heading(a.z) + (g.d > 0 ? 1 : -1) * Math.PI / 2; a.y = Math.max(w.ground(x, z), w.water(x, z) - 0.03);
            return a;
        }
        if (act === 'fish') {
            // A bear in the shallows, head down over the water; now and then a lunge at something.
            const lunge = (ctx.t * 0.11 + a.v) % 1 < 0.06;
            a.down = ease(a.down, lunge ? 0.3 : 1, lunge ? 0.1 : 0.6); a.alarm = lunge ? 1 : 0; a.moving = 0; a.rest = 0;
            a.yaw = turnTo(a.yaw, w.heading(a.z) + (g.d > 0 ? 1 : -1) * Math.PI / 2 + 0.3 * Math.sin(ctx.t * 0.1 + a.v * 9), dt, 0.8 * dt);
            a.y = Math.max(w.ground(a.x, a.z), w.water(a.x, a.z) - 0.25);
            return a;
        }
        if (act === 'hover' || act === 'soar') {
            // A kestrel hangs on the wind and moves on; an eagle goes round on a thermal, high up.
            const soar = act === 'soar', wide = soar ? 38 : 9, hang = !soar && (ctx.t * 0.07 + a.v) % 1 < 0.4;
            if (!hang) a.turn += dt * (soar ? 0.12 : 0.3);
            const x = g.x + Math.sin(a.turn) * wide, z = g.z + Math.cos(a.turn) * wide;
            a.yaw = turnTo(a.yaw, hang ? a.yaw : a.turn + Math.PI / 2, dt * 3, 2 * dt);
            a.x = x; a.z = z; a.y = g.y; a.alt = ease(a.alt || (soar ? 40 : 13), soar ? 42 + 4 * Math.sin(ctx.t / 17 + a.v * 6) : 13 + Math.sin(ctx.t / 5), 2);
            a.wing = 1; a.bank = soar ? 0.4 : 0; a.gait += dt * (hang ? 3.2 : soar ? 0.3 : 1.2);
            return a;
        }
        if (act === 'perch' || act === 'peck') {
            // In a tree: an owl dozes by day and goes round on silent wings by night; a woodpecker works at the trunk.
            const p = wildPath(g, act === 'peck' ? 0.5 : 0.72), abroad = act === 'perch' && ctx.night > 0.6 && (ctx.t * 0.035 + a.v) % 1 < 0.45;
            a.fly = ease(a.fly || 0, abroad ? 1 : 0, 0.8);
            if (a.fly > 0.02) a.turn += dt * 0.5;
            const wide = 10 * a.fly, cx = p.x - Math.sin(a.perch ?? (a.perch = a.turn)) * wide, cz = p.z - Math.cos(a.perch) * wide;
            if (a.fly < 0.02) a.perch = a.turn;
            const x = cx + Math.sin(a.turn) * wide, z = cz + Math.cos(a.turn) * wide;
            a.yaw = turnTo(a.yaw, a.fly > 0.3 ? a.turn + Math.PI / 2 : act === 'peck' ? Math.atan2(g.x - p.x, g.z - p.z) : p.yaw + 0.6 * Math.sin(ctx.t * 0.3 + a.v * 9), dt * 3, 3 * dt);
            a.x = x; a.z = z; a.y = g.y; a.alt = p.alt + 1.5 * a.fly + (act === 'peck' && (ctx.t * 0.4 + a.v) % 1 < 0.3 ? 0.012 * Math.sin(ctx.t * 40) : 0);
            a.wing = a.fly > 0.1 ? 1 : 0; a.rest = 0; a.gait += dt * (a.wing ? 1 : 0); a.bank = 0.3 * a.fly;
            return a;
        }
        if (act === 'follow') {
            // The young keep behind the first of the party, in a line.
            const lead = ctx.party[0], back = 0.55 + 0.4 * (a.i - 1), tx = lead.x - Math.sin(lead.yaw) * back, tz = lead.z - Math.cos(lead.yaw) * back, left = Math.hypot(tx - a.x, tz - a.z);
            if (K.where === 'water') { a.x = ease(a.x, tx, 0.5); a.z = ease(a.z, tz, 0.5); a.yaw = turnTo(a.yaw, lead.yaw + 0.3 * Math.sin(ctx.t * 2 + a.i), dt * 4, 4 * dt); a.moving = 0.4; return a; }
            if (left > 0.25) go(tx, tz, Math.min(K.pace + left * 1.5, 9), 5 * dt); else a.moving = ease(a.moving, 0, 0.2);
            a.down = ease(a.down, left > 0.25 ? 0 : 1, 0.4);
            a.y = w.surface(a.x, a.z);
            return a;
        }
        // On the wing for a while (a heron put up from the shallows, a pheasant from the grass), and down again further off.
        if (a.state === 'fly') {
            a.wing = 1; a.rest = 0; a.down = 0; a.moving = 0; a.gait += dt * 1.6;
            a.yaw = turnTo(a.yaw, a.turn, dt * 3, 2.5 * dt);
            a.x += Math.sin(a.yaw) * 8 * dt; a.z += Math.cos(a.yaw) * 8 * dt;
            const ground = Math.max(w.ground(a.x, a.z), w.water(a.x, a.z) - 0.05);
            a.alt = ease(a.alt, a.timer > 1.2 ? 5 : 0, 0.7); a.y = ease(a.y, ground, 0.5);
            if (a.timer < 0 && a.alt < 0.15) { a.state = 'idle'; a.alt = 0; a.wing = 0; a.y = ground; a.timer = 5 + 6 * random(); a.hx = a.x; a.hz = a.z; }
            return a;
        }
        a.wing = 0;
        if (g.cross && !a.crossed) {
            // Over the road to the other side, once, while the traveller is still well short of the place; and smartly,
            // if they come on faster than it thought.
            const ahead = (g.z - me.z) / w.at(g.z).cos;
            if (a.state !== 'cross' && ahead < 62 && ahead > 40) { a.state = 'cross'; a.tz = a.hz; a.tx = w.place(a.hz, -w.lateral(a.hx, a.hz))[0]; }
            if (a.state === 'cross') {
                a.down = ease(a.down, 0, 0.2); a.rest = 0; a.alarm = 0;
                const onRoad = Math.abs(w.lateral(a.x, a.z)) < 6, left = go(a.tx, a.tz, near < 32 && onRoad ? (K.run || 5) + 3 : K.big ? 1.9 : Math.max(K.pace, 1.8), (K.big ? 2.2 : 4.5) * dt);
                if (left < 0.6) { a.state = 'idle'; a.crossed = true; a.hx = a.x; a.hz = a.z; a.timer = 3 + 5 * random(); }
                a.y = w.surface(a.x, a.z);
                return a;
            }
        }
        if (K.shy && near < K.shy && a.state !== 'flee') {
            // Away from whoever is coming, and from the road.
            const side = Math.sign(w.lateral(a.x, a.z)) || 1, r = w.at(a.z), ax = dxm / (near || 1) + side * 0.9 / r.cos, az = dzm / (near || 1), al = Math.hypot(ax, az) || 1;
            if (K.wing) { a.state = 'fly'; a.timer = 5; a.turn = Math.atan2(ax, az); return a; }
            a.state = 'flee'; a.timer = 3.5 + random(); a.tx = a.x + ax / al * 26; a.tz = a.z + az / al * 26;
        }
        if (a.state === 'flee') {
            a.down = ease(a.down, 0, 0.1); a.rest = 0; a.alarm = 0;
            const left = go(a.tx, a.tz, K.run || 4, (K.big ? 2.4 : 5) * dt);
            if (a.timer < 0 || left < 0.5) { a.state = 'idle'; a.timer = 5 + 6 * random(); a.hx = a.x; a.hz = a.z; }
        } else if (a.state === 'scratch') {
            // A bear with its back to a tree, having a good scratch.
            a.moving = ease(a.moving, 0, 0.2); a.rest = ease(a.rest, 1, 0.4); a.alarm = 0.6; a.down = 0;
            a.yaw = turnTo(a.yaw, Math.atan2(a.x - g.post.x, a.z - g.post.z), dt * 3, 1.4 * dt);
            if (a.timer < 0) { a.state = 'idle'; a.alarm = 0; a.timer = 6 + 6 * random(); }
        } else if (a.state === 'walk') {
            a.down = ease(a.down, 0, 0.3); a.rest = ease(a.rest, 0, 0.2);
            if (a.toPost && Math.hypot(a.tx - a.x, a.tz - a.z) < 0.5) { a.state = 'scratch'; a.toPost = false; a.timer = 7 + 3 * random(); }
            else
            if (go(a.tx, a.tz, K.pace) < 0.3 || a.timer < -30) { a.state = 'idle'; a.timer = act === 'play' ? 0.3 + 1.2 * random() : act === 'box' ? 2 + 4 * random() : 3 + 9 * random(); }
        } else {
            a.moving = ease(a.moving, 0, 0.25);
            const calm = a.alert < 0.5;
            a.down = ease(a.down, act === 'graze' && calm ? 1 : 0, 0.6);
            a.rest = ease(a.rest, act === 'bask' ? 1 - 0.4 * a.alert : act === 'sentry' || (act === 'amble' && a.v > 0.5 && a.timer > 2) ? 1 : 0, 0.5);
            if (act === 'box' && ctx.party.length > 1) {
                // Two hares up on their hind legs at one another.
                const o = ctx.party[a.i ? 0 : 1], close = Math.hypot(o.x - a.x, o.z - a.z) < 1.4;
                a.alarm = close && o.state === 'idle' ? 1 : 0;
                if (close) a.yaw = turnTo(a.yaw, Math.atan2(o.x - a.x, o.z - a.z), dt * 5, 4 * dt);
            }
            if (act !== 'bask' && act !== 'stand' && a.timer < 0) {
                // Somewhere else to be, not far off and no nearer the road.
                if (g.post && !a.toPost && random() < 0.6) { const far = Math.hypot(a.x - g.post.x, a.z - g.post.z) || 1; a.tx = g.post.x + (a.x - g.post.x) / far * (g.post.r + 0.75); a.tz = g.post.z + (a.z - g.post.z) / far * (g.post.r + 0.75); if (dry(a.tx, a.tz)) { a.state = 'walk'; a.toPost = true; a.timer = 0; } }
                if (a.state !== 'walk') for (let tries = 0; tries < 5; tries++) {
                    const o = act === 'box' && ctx.party.length > 1 ? ctx.party[a.i ? 0 : 1] : null, turn = random() * TAU, far = o ? 0.9 : (K.range || 4) * (0.3 + 0.7 * random());
                    let tx = (o ? o.x : a.hx) + Math.sin(turn) * far, tz = (o ? o.z : a.hz) + Math.cos(turn) * far;
                    if (K.big && !o) { const d0 = w.lateral(a.hx, a.hz); tz = a.hz + (random() - 0.5) * 2 * far; tx = w.place(tz, d0 + (random() - 0.5) * 3)[0]; }
                    if (dry(tx, tz)) { a.tx = tx; a.tz = tz; a.state = 'walk'; a.timer = 0; break; }
                }
                if (a.state !== 'walk') a.timer = 2;
            }
            if (act === 'stand') a.yaw = turnTo(a.yaw, a.turn + 0.5 * Math.sin(ctx.t * 0.2 + a.v * 9), dt, 0.5 * dt);
        }
        a.y = K.where === 'shore' ? Math.max(w.ground(a.x, a.z), w.water(a.x, a.z) - 0.05) : w.ground(a.x, a.z);
        return a;
    }

    // How many of these animals a camera has in its picture, plainly: on the screen, at least `px` pixels tall on a
    // screen `H` high, and with nothing between (the ground, a trunk, a wall). cam: { x, y, z, heading, pitch }.
    function wildSeen(w, cam, animals, o = {}) {
        const tanY = o.tanY || Math.tan(28 * RAD), tanX = tanY * (o.aspect || 16 / 9), H = o.H || 1080, px = o.px || 12, night = o.night || 0;
        const sh = Math.sin(cam.heading), ch = Math.cos(cam.heading), sp = Math.sin(cam.pitch), cp = Math.cos(cam.pitch), from = [cam.x, cam.y, cam.z];
        let n = 0;
        for (const a of animals) {
            const K = a.K;
            if (a.hidden || (K.hours === 'night' && night < 0.6) || (K.hours === 'day' && night > 0.5)) continue;
            const tall = K.tall * (K.size || 1), dx = a.x - cam.x, dy = a.y + (K.swarm ? 1 : a.alt) + tall / 2 - cam.y, dz = a.z - cam.z, fwd = dx * sh * cp + dy * sp + dz * ch * cp;
            if (fwd < 2 || tall / fwd / tanY * H / 2 < px) continue;
            if (Math.abs((dx * ch - dz * sh) / fwd / tanX) > 0.96 || Math.abs((dy * cp - (dx * sh + dz * ch) * sp) / fwd / tanY) > 0.96) continue;
            const far = Math.hypot(dx, dy, dz);
            if (sightline(w, from, [dx / far, dy / far, dz / far], far) < far - 1.3) {
                // (Something as long as a stag is not hidden by one trunk: try its other end.)
                if (tall < 0.9) continue;
                const ox = dx + ch * 0.8, oz = dz - sh * 0.8, of = Math.hypot(ox, dy, oz);
                if (sightline(w, from, [ox / of, dy / of, oz / of], of) < of - 1.3) continue;
            }
            n++;
        }
        return n;
    }

    // ---- Companions --------------------------------------------------------------------------
    // Who can walk with the traveller. group: how the panel sorts them. role: what they do on the road (heel: keep
    // their place; scout: run ahead and wait; lag: stop to sniff, then catch up; chase: go after butterflies; herd:
    // weave about behind; zoom: sudden mad dashes; led: on a rope; plod: steady, a little behind; fly and soar:
    // circle overhead; flit: fly low, and walk; hover: float at the shoulder; ride: on the pack). top: m/s flat out.
    // big: metres of room it wants. rest: what it does when the traveller stops (sit, curl, lie, belly, graze, perch,
    // tuck, hover, stand). nerve: brave ones point at a deer, shy ones hide behind the traveller.
    // The named cats are the owner's own, by the names and coats they have in The Cat vs. the Ornament (SPEC §10.27)
    // and on Sky Island (§10.31): `from` says where, `coat` is that roster's.
    const pal = (id, label, group, role, top, big, rest, more = {}) => ({ id, label, group, role, top, big, rest, ...more });
    const COMPANIONS = [
        pal('moofy', '🐈‍⬛ Moofy', 'cats', 'lag', 4.5, 0.4, 'curl', { cat: true, coat: 'black-fluffy', from: ['cat-ornament', 'sky-island'] }),
        pal('butters', '🐈 Butters', 'cats', 'heel', 4, 0.4, 'belly', { cat: true, coat: 'buff-tabby', from: ['cat-ornament', 'sky-island'], close: true }),
        pal('waffles', '🐄 Waffles', 'cats', 'scout', 5, 0.35, 'sit', { cat: true, coat: 'holstein', from: ['cat-ornament', 'sky-island'] }),
        pal('ras', '🤵 Ras The Destroyer', 'cats', 'chase', 5.5, 0.35, 'sit', { cat: true, coat: 'tuxedo', from: ['cat-ornament', 'sky-island'] }),
        pal('ibbie', '😴 Ibbie', 'cats', 'ride', 4, 0.3, 'curl', { cat: true, coat: 'grey-tabby', from: ['cat-ornament', 'sky-island'] }),
        pal('maus', '🦇 Maus', 'cats', 'zoom', 7, 0.3, 'sit', { cat: true, coat: 'tortie', from: ['cat-ornament', 'sky-island'] }),
        pal('turkey', '🦃 Turkey', 'cats', 'plod', 4, 0.45, 'belly', { cat: true, coat: 'grey-mottled', from: ['cat-ornament', 'sky-island'] }),
        pal('harry', '🧡 Harry', 'cats', 'chase', 5.5, 0.35, 'sit', { cat: true, coat: 'orange-white', from: ['cat-ornament', 'sky-island'] }),
        pal('kittytoes', '👑 Kitty Toes', 'cats', 'heel', 4, 0.4, 'sit', { cat: true, coat: 'blue-persian', from: ['cat-ornament', 'sky-island'], aloof: true }),
        pal('cat', '🐈 A stray tabby', 'cats', 'scout', 5, 0.35, 'curl'),
        pal('dog', '🐕 A good brown dog', 'dogs', 'heel', 6, 0.5, 'sit', { nerve: 1 }),
        pal('hound', '🐕‍🦺 A long-eared hound', 'dogs', 'lag', 6.5, 0.55, 'lie', { nerve: 1 }),
        pal('sheepdog', '🐑 A sheepdog', 'dogs', 'herd', 7, 0.5, 'lie', { nerve: 1 }),
        pal('pup', '🐶 A terrier pup', 'dogs', 'chase', 5.5, 0.35, 'sit', { nerve: 1 }),
        pal('pony', '🐴 A pack pony', 'farm', 'led', 5, 1.1, 'graze'),
        pal('donkey', '🫏 A donkey with panniers', 'farm', 'led', 4.5, 1.0, 'graze'),
        pal('goat', '🐐 A goat with a bell', 'farm', 'lag', 5, 0.6, 'graze'),
        pal('pig', '🐖 A pig', 'farm', 'lag', 4, 0.6, 'lie'),
        pal('lamb', '🐑 A lamb', 'farm', 'heel', 5, 0.45, 'lie', { nerve: -1, gambol: true }),
        pal('goose', '🪿 A goose', 'farm', 'heel', 3.5, 0.45, 'tuck', { bird: true, grounded: true }),
        pal('hen', '🐔 A hen', 'farm', 'ride', 3, 0.3, 'tuck', { bird: true, grounded: true, nerve: -1 }),
        pal('duck', '🦆 A duck and her ducklings', 'farm', 'heel', 3, 0.5, 'tuck', { bird: true, grounded: true, brood: 3 }),
        pal('fox', '🦊 A fox', 'wild', 'scout', 6.5, 0.4, 'curl'),
        pal('badger', '🦡 A badger', 'wild', 'heel', 4, 0.5, 'lie'),
        pal('otter', '🦦 An otter', 'wild', 'scout', 5.5, 0.45, 'lie'),
        pal('hedgehog', '🦔 A hedgehog', 'wild', 'ride', 2.5, 0.25, 'curl'),
        pal('hare', '🐇 A snow hare', 'wild', 'scout', 7, 0.35, 'sit', { nerve: -1 }),
        pal('fawn', '🦌 A spotted fawn', 'wild', 'heel', 7, 0.5, 'lie', { nerve: -1, gambol: true }),
        pal('cub', '🐻 A bear cub', 'wild', 'lag', 5, 0.6, 'sit'),
        pal('squirrel', '🐿️ A red squirrel', 'wild', 'ride', 5, 0.25, 'sit'),
        pal('tortoise', '🐢 A moss-backed tortoise', 'wild', 'plod', 3.4, 0.6, 'tuck'),
        pal('frog', '🐸 A big green frog', 'wild', 'heel', 4.5, 0.3, 'sit'),
        pal('raven', '🐦‍⬛ A raven', 'wild', 'fly', 9, 0.3, 'perch', { bird: true }),
        pal('owl', '🦉 An owl', 'wild', 'fly', 8, 0.35, 'perch', { bird: true, nocturnal: true }),
        pal('hawk', '🦅 A hawk', 'wild', 'soar', 12, 0.35, 'perch', { bird: true }),
        pal('wisp', '✨ A wisp of light', 'fantastic', 'hover', 6, 0.3, 'hover', { light: [0.5, 0.9, 0.8] }),
        pal('lantern', '🏮 A paper-lantern spirit', 'fantastic', 'hover', 5, 0.35, 'hover', { light: [1, 0.6, 0.28] }),
        pal('whelp', '🐉 A dragon whelp', 'fantastic', 'flit', 7, 0.5, 'curl'),
        pal('beetle', '🪲 A clockwork beetle', 'fantastic', 'heel', 4, 0.35, 'tuck', { light: [1, 0.75, 0.3] }),
        pal('tinker', '🤖 A little brass automaton', 'fantastic', 'heel', 3.6, 0.4, 'sit', { light: [1, 0.7, 0.3] }),
        pal('mushling', '🍄 A mushroom-folk child', 'fantastic', 'lag', 3.6, 0.4, 'tuck', { nerve: -1 }),
        pal('cloudlet', '🌧️ A small cloud of your own', 'fantastic', 'hover', 5, 0.5, 'hover', { high: 2.75 }),
        pal('tome', '📖 A spellbook that flaps along', 'fantastic', 'hover', 6, 0.35, 'perch'),
        pal('moth', '🦋 A moon moth', 'fantastic', 'hover', 6, 0.3, 'perch', { light: [0.6, 1, 0.7] }),
        pal('snail', '🐌 A great snail with a lit window', 'fantastic', 'plod', 3.2, 0.7, 'tuck', { light: [1, 0.7, 0.3] }),
        pal('pebble', '🪨 A boulderling', 'fantastic', 'heel', 3.8, 0.4, 'tuck'),
    ];
    const COMPANION = Object.fromEntries(COMPANIONS.map(c => [c.id, c]));
    const GROUPS = ['cats', 'dogs', 'farm', 'wild', 'fantastic'];
    // Who comes along. options: { pick: 'surprise' or 'choose', count (0 to PARTY_MAX, for surprise), choice: [ids] }.
    // Surprise is one of the named cats and then one from each kind by turns, settled by the world's seed; chosen
    // by hand it is the ones ticked, in the order ticked, and nothing else has a say.
    function party(seed, options = {}) {
        if (options.pick === 'choose') return (options.choice || []).filter((id, i, all) => COMPANION[id] && all.indexOf(id) === i).slice(0, PARTY_MAX);
        const count = clamp(Math.round(options.count ?? 3), 0, PARTY_MAX), out = [];
        const shuffled = (list, salt) => list.map((c, i) => [hash(seed, i * 31 + salt, 9173), c]).sort((a, b) => a[0] - b[0]).map(e => e[1]);
        // Not two on a rope, nor two on the pack, when it is left to chance.
        const has = fn => out.some(id => fn(COMPANION[id])), fits = c => !(c.role === 'led' && has(o => o.role === 'led')) && !(c.role === 'ride' && has(o => o.role === 'ride'));
        const order = [COMPANIONS.filter(c => c.group === 'cats'), ...shuffled(GROUPS.slice(1), 2).map(g => COMPANIONS.filter(c => c.group === g))];
        for (let k = 0; out.length < count && k < 400; k++) { const pool = shuffled(order[k % order.length], 3 + k).filter(c => !out.includes(c.id) && fits(c) && (k || c.cat)); if (pool.length) out.push(pool[0].id); }
        return out;
    }

    // Each has a place about the traveller, in the road's own terms: metres ahead and metres to their right. Kept
    // on the road's own width (the verge is full of fences, lamps and bushes) and out of the middle of the picture.
    // (The first six are the company there always was; six more places behind and before them, for a company of twelve.)
    const PARTY_MAX = 12;
    const STATIONS = [[2.5, -1.5], [1.2, 1.7], [-1.7, -1.6], [3.9, 1.0], [-3.0, -0.8], [0.3, -2.3], [-4.3, 1.4], [5.4, -0.7], [-5.6, -1.7], [-2.6, 2.1], [6.8, 1.3], [-7.0, 0.4]];
    // And a place by the fire: metres along the road from it, and metres beyond it (away from the road, where the traveller looks).
    const HEARTH = [[1.6, 0.5], [0.3, 1.8], [-1.3, 1.3], [2.1, -1.0], [-2.4, -0.4], [1.2, -2.3], [3.2, 1.6], [-3.4, 1.4], [0.2, 3.3], [3.6, -0.6], [-1.6, 3.0], [1.9, 3.0]];
    // (`most`: no more than this much of a turn in one step, so nothing spins.)
    const turnTo = (yaw, to, k, most = Infinity) => { let turn = (to - yaw) % TAU; if (turn > Math.PI) turn -= TAU; if (turn < -Math.PI) turn += TAU; return yaw + clamp(turn * Math.min(1, k), -most, most); };
    // How fast each may turn, radians a second: the big ones come round slowly.
    const turnRate = kind => kind.big > 0.9 ? 1.7 : kind.big > 0.55 ? 2.6 : 4.5;
    function companionStart(id, slot) {
        const kind = COMPANION[id];
        return { id, kind, slot, role: kind.role, x: null, z: 0, y: 0, yaw: 0, speed: 0, gait: 0, rest: 0, down: 0, alt: 0, wing: 0, riding: 0, alarm: 0, bank: 0, mode: 'go', timer: 4 + 3 * slot, since: 0, prey: null, turn: slot * 2.1, cool: 0, still: 0 };
    }
    // A whole party, in order: later ones give way to earlier ones. Two who would ride: the second walks.
    function partyStart(ids) {
        const out = ids.map((id, slot) => companionStart(id, slot));
        let riders = 0, led = 0;
        for (const c of out) { if (c.role === 'ride' && riders++) c.role = 'heel'; if (c.role === 'led' && led++) c.led2 = true; }
        return out;
    }
    // The company changes on the road (the settings): whoever stays keeps walking where they were, in their new
    // place; newcomers start a little way back down the road and run up; the rest turn back the way they came
    // (`leaving`: the caller steps them until they are well behind, then forgets them).
    function partyChange(old, ids, j, w) {
        const spare = old.slice(), row = w.at(j.z), newcomers = [];
        const party = ids.map((id, slot) => {
            const at = spare.findIndex(c => c.id === id);
            if (at >= 0) { const c = spare.splice(at, 1)[0]; c.slot = slot; c.role = c.kind.role; c.led2 = false; return c; }
            const c = companionStart(id, slot);
            newcomers.push(c);
            return c;
        });
        let riders = 0, led = 0;
        for (const c of party) { if (c.role === 'ride' && riders++) c.role = 'heel'; if (c.role === 'led' && led++) c.led2 = true; }
        newcomers.forEach((c, k) => {
            // (The slow ones start nearer: a snail would never catch up.)
            const back = (c.kind.top < WALK * 1.6 ? 3 : 8) + 1.6 * k, z = j.z - back * row.cos, [x] = w.place(z, clamp(j.d + (k % 2 ? 1.3 : -1.3), -2.2, 2.2));
            Object.assign(c, { x, z, y: w.surface(x, z), yaw: w.heading(z) });
        });
        const leavers = spare.filter(c => c.x !== null);
        for (const c of leavers) { c.leaving = true; c.riding = 0; if (c.role === 'ride') c.role = 'heel'; c.mode = 'go'; c.prey = null; }
        return { party, leavers };
    }
    // One step of one companion's own small life. ctx: { t (seconds), night (0 to 1), passing (somebody is coming the
    // other way), others (the party), scare ({ x, z } of a deer or a rabbit near by, or null), random }.
    function companionStep(c, dt, w, j, ctx) {
        const kind = c.kind, r = w.at(j.z), me = standing(j, w), random = ctx.random, others = ctx.others || [];
        const ease = (v, to, secs) => v + (to - v) * (1 - Math.exp(-dt / secs));
        const camping = (j.mode === 'camp' || j.mode === 'toCamp') && j.camp, stopped = j.speed < 0.25;
        c.still = stopped ? c.still + dt : 0;
        c.timer -= dt; c.cool -= dt; c.since += dt;
        c.alarm = Math.max(0, c.alarm - dt / 2.5);
        // Where it would like to be, in the road's terms (ahead, to the right), and what it is doing there.
        const st = STATIONS[c.slot % STATIONS.length];
        let ahead = st[0] + 0.5 * Math.sin(ctx.t / (7 + c.slot) + c.slot * 2), side = st[1] + 0.35 * Math.sin(ctx.t / (9.3 + c.slot) + c.slot), rest = 0, down = 0, role = c.role, fly = 0, high = 0, haste = 1;
        if (kind.nocturnal) role = c.leaving || ctx.night > 0.5 ? 'fly' : 'ride';       // an owl sleeps the day away on a shoulder (sent home, it flies there)
        if (kind.close) { ahead = -0.2 + 0.2 * Math.sin(ctx.t / 5); side = 0.75; }                // at the heel
        if (kind.aloof) side += Math.sign(side) * 0.5;
        if (role === 'led') { ahead = c.led2 ? -2.9 : 2.7; side = c.led2 ? -1.1 : -1.5; }
        if (role === 'plod') { ahead = -1.8 - 0.4 * c.slot; side = c.slot % 2 ? 1.9 : -1.7; }
        if (role === 'herd') { ahead = -2.6 + 0.5 * Math.sin(ctx.t / 3.1); side = 2.3 * Math.sin(ctx.t / 2.3); haste = 1.6; }
        if (role === 'scout') {
            // Out ahead; then it sits and waits to be caught up.
            if (c.mode === 'go' && c.timer < 0) { c.mode = 'wait'; c.timer = 30; }
            if (c.mode === 'wait') { rest = stopped || c.still > 0 ? 1 : 0.85; if (c.z - j.z < 2.6 || c.timer < 0) { c.mode = 'go'; c.timer = 5 + 6 * random(); } }
            ahead = c.mode === 'go' ? 7.5 + 2 * Math.sin(c.slot) : (c.z - j.z) / r.cos;
            if (c.mode === 'wait') side = lateralOf(w, c) - j.d;
            haste = 1.5;
        }
        if (role === 'lag') {
            // Something by the road wants looking into: nose down a while, then a run to catch up.
            if (c.mode === 'go' && c.timer < 0 && !stopped) { c.mode = 'sniff'; c.timer = 3 + 3 * random(); }
            if (c.mode === 'sniff') { down = 1; ahead = (c.z - j.z) / r.cos; side = lateralOf(w, c) - j.d; if (c.timer < 0 || ahead < -7.5) { c.mode = 'go'; c.timer = 11 + 14 * random(); } }
            else if ((c.z - j.z) / r.cos < st[0] - 2) haste = 1.9;
        }
        if (role === 'chase' || role === 'zoom') {
            // A butterfly over the road (or nothing at all, for a cat with the wind in her tail).
            if (c.mode === 'go' && c.timer < 0 && !stopped) { c.mode = 'dart'; c.timer = role === 'zoom' ? 3.2 : 5; c.prey = { a: 3 + 3 * random(), s: (random() < 0.5 ? -1 : 1) * (0.6 + 1.5 * random()), turn: random() * TAU }; }
            if (c.mode === 'dart') {
                const p = c.prey;
                p.turn += dt * (role === 'zoom' ? 5.5 : 2.2);
                ahead = role === 'zoom' ? 3.5 + 3.4 * Math.cos(p.turn) : p.a + 1.1 * Math.sin(p.turn * 0.7); side = role === 'zoom' ? 2.0 * Math.sin(p.turn * 1.3) : p.s + 0.8 * Math.cos(p.turn);
                haste = role === 'zoom' ? 3 : 1.8;
                if (c.timer < 0) { c.mode = 'go'; c.timer = (role === 'zoom' ? 14 : 9) + 14 * random(); c.prey = null; }
            }
        }
        // Somebody wild near the road: the dogs point, the timid get behind the traveller's legs.
        if (ctx.scare && kind.nerve && c.cool < 0 && Math.hypot(ctx.scare.x - me.x, ctx.scare.z - me.z) < 17) { c.cool = 24; c.alarm = 1; c.startle = { x: ctx.scare.x, z: ctx.scare.z }; }
        if (c.alarm > 0.05 && c.startle) {
            const toward = Math.sign(w.lateral(c.startle.x, c.startle.z) - j.d) || 1;
            if (kind.nerve > 0) { ahead = clamp((c.startle.z - j.z) / r.cos, -3, 5); side = toward * 2.3; haste = 2.2; } else { ahead = -0.7; side = -toward * 0.8; haste = 2.4; }
        } else c.startle = null;
        if (c.bristle) { if (c.alarm > 0.05) { ahead = -3.2 - 0.3 * c.slot; haste = 2.2; } else c.bristle = false; }
        // Keep right while a cart goes by; and always on the road.
        if (ctx.passing) side = Math.abs(side) * 0.55 + 0.5;
        let d = clamp(j.d + side, -2.3, 2.45), tz = j.z + ahead * r.cos, tx = w.place(tz, d)[0], spot = null;
        if (c.prey) { c.prey.x = tx; c.prey.z = tz; }
        if (stopped && c.still > 1.2 && role !== 'scout') rest = 1;
        if (camping) {
            // By the fire: each to its own place round it; the big ones graze a little way off, the fliers come down.
            const cp = j.camp, big = kind.big > 0.9, h = HEARTH[c.slot % HEARTH.length], along = big ? (c.slot % 2 ? 4.4 : -4.6) : h[0], beyond = big ? -2.2 : h[1] * (kind.big > 0.55 ? 1.25 : 1);
            tz = cp.z + along * r.cos; d = cp.d + cp.side * beyond; tx = w.place(tz, d)[0];
            spot = { x: tx, z: tz, face: Math.atan2(cp.x - tx, cp.z - tz) };
            rest = j.mode === 'camp' ? 1 : 0;
            haste = 1.2; down = 0;
            if (c.mode !== 'go') { c.mode = 'go'; c.prey = null; c.timer = 6 + 8 * random(); }
        }
        // Somebody who likes cats has stopped: the first cat of the company comes to her hand.
        c.petted = !!ctx.pet && stopped && ctx.pet === c;
        if (c.petted) { tx = me.x + Math.cos(me.heading) * 0.42 + Math.sin(me.heading) * 0.3; tz = me.z - Math.sin(me.heading) * 0.42 + Math.cos(me.heading) * 0.3; spot = { x: tx, z: tz, face: me.heading + 2.4 }; rest = Math.hypot(c.x - tx, c.z - tz) < 0.5 ? 1 : 0; haste = 1.4; }
        // Sent home: back down the road, at a walk.
        if (c.leaving) { tz = j.z - 40 * r.cos; tx = w.place(tz, clamp(lateralOf(w, c), -2.3, 2.45))[0]; spot = null; rest = 0; down = 0; haste = 1; c.petted = false; }
        const air = role === 'fly' || role === 'soar' || role === 'hover' || role === 'flit';
        if (c.x === null || Math.hypot(c.x - me.x, c.z - me.z) > 45) { c.x = tx; c.z = tz; c.yaw = me.heading; c.y = w.surface(tx, tz); c.mode = 'go'; c.prey = null; }
        if (role === 'ride') {
            // On the pack; down by the fire, and up again when the walk goes on.
            const offDuty = camping && j.mode === 'camp';
            if (!offDuty) { tx = me.x; tz = me.z; haste = 2.5; }
            const close = Math.hypot(c.x - me.x, c.z - me.z) < 0.9;
            c.riding = ease(c.riding, !offDuty && (close || c.riding > 0.5) ? 1 : 0, 0.3);
            if (c.riding > 0.5) { c.x = me.x; c.z = me.z; c.yaw = turnTo(c.yaw, me.heading, dt * 6); c.speed = 0; rest = 1; }
        } else c.riding = 0;
        if (air) {
            // Fliers go round a point that moves with the traveller; they come down when the walk stops.
            const landed = (rest > 0.5 && kind.rest !== 'hover') || (role === 'flit' && Math.floor((ctx.t + c.slot * 5) / 11) % 2 === 1);
            const wide = role === 'soar' ? 15 : role === 'fly' ? 6 + c.slot : role === 'flit' ? 2.6 : kind.high ? 0.5 : 1.15, rate = role === 'soar' ? 0.35 : role === 'fly' ? 0.75 : role === 'flit' ? 1.3 : 0.6;
            c.turn += dt * rate * (c.slot % 2 ? -1 : 1);
            high = landed ? 0 : role === 'soar' ? 19 + 3 * Math.sin(ctx.t / 13) : role === 'fly' ? 5 + 1.6 * Math.sin(ctx.t / 5 + c.slot) : role === 'flit' ? 1.5 + 0.5 * Math.sin(ctx.t / 2) : (kind.high || 1.75) + 0.16 * Math.sin(ctx.t * 1.3 + c.slot);
            const ox = landed || c.leaving ? tx : me.x + Math.sin(me.heading) * (role === 'hover' ? 0.2 : 3) + Math.sin(c.turn) * wide, oz = landed || c.leaving ? tz : me.z + Math.cos(me.heading) * (role === 'hover' ? 0.2 : 3) + Math.cos(c.turn) * wide;
            const k = 1 - Math.exp(-dt / (role === 'hover' ? 0.45 : 0.9)), nx = c.x + (ox - c.x) * k, nz = c.z + (oz - c.z) * k, moved = Math.hypot(nx - c.x, nz - c.z);
            if (moved > 1e-4) { const to = Math.atan2(nx - c.x, nz - c.z); c.bank = ease(c.bank, clamp((((to - c.yaw) % TAU) + TAU + Math.PI) % TAU - Math.PI, -1, 1) * (landed ? 0 : 0.9), 0.4); c.yaw = turnTo(c.yaw, role === 'hover' && moved / Math.max(dt, 1e-3) < 0.6 ? me.heading : to, dt * 5, dt * 6); }
            c.speed = moved / Math.max(dt, 1e-3);
            c.x = nx; c.z = nz;
            c.alt = ease(c.alt, high, landed ? 0.7 : 1.1);
            c.wing = ease(c.wing, c.alt > 0.25 || role === 'hover' ? 1 : 0, 0.3);
            c.gait += dt * (1.2 + c.speed * 0.25);
            fly = 1;
        }
        if (!fly && c.riding < 0.5) {
            const dx = tx - c.x, dz = tz - c.z, gap = Math.hypot(dx, dz);
            // The place it makes for moves with the walk. It keeps the walk's pace and closes the gap on top of that: one
            // that finds itself a little ahead of its place slows down, where it used to turn round and come back (the
            // pack animals, whose place is ahead of the traveller, did it every time the traveller slowed).
            // (Only a place in the company moves so: not a place by the fire, nor where it stopped to sniff or wait, nor the way home.)
            const keeps = !camping && !c.leaving && !c.petted && !(c.mode === 'sniff' || c.mode === 'wait'), fx = keeps ? Math.sin(me.travel) * j.speed : 0, fz = keeps ? Math.cos(me.travel) * j.speed : 0;
            const settle = (stopped || camping) && gap < 0.45, close = Math.min(gap * 1.6 * haste, kind.top);
            let vx = settle ? 0 : fx + (gap > 1e-4 ? dx / gap * close : 0), vz = settle ? 0 : fz + (gap > 1e-4 ? dz / gap * close : 0);
            // Nobody walks through anybody: later ones go round earlier ones, and everyone round the traveller. Going
            // round is part of where it means to go (so it is walked, facing it); only what is left is a nudge.
            const rooms = [[me.x, me.z, c.petted ? 0.3 : 0.42 + kind.big * 0.6]];
            if (ctx.avoid) rooms.push([ctx.avoid.x, ctx.avoid.z, ctx.avoid.room + kind.big]);           // nobody stands in front of a low camera
            for (const o of others) { if (o === c) break; if (o.x !== null && o.alt < 0.8 && o.riding < 0.5) rooms.push([o.x, o.z, (kind.big + o.kind.big) * 0.62 + 0.12]); }
            if (!settle) for (const [ox, oz, room] of rooms) { const ax = c.x - ox, az = c.z - oz, a = Math.hypot(ax, az), wide = room * 1.6; if (a < wide && a > 1e-4) { const k = (wide - a) / wide * 3.2 / a; vx += ax * k; vz += az * k; } }
            let want = Math.hypot(vx, vz);
            if (want > kind.top) { vx *= kind.top / want; vz *= kind.top / want; want = kind.top; }
            c.speed += (want - c.speed) * Math.min(1, dt * 4);
            const most = turnRate(kind) * dt, ahead0 = w.heading(c.z), x0 = c.x, z0 = c.z;
            // Going somewhere, it walks the way it faces and turns to face the way it means to go (turned far from it, it
            // turns before it strides): to a place by the fire and back to the road on a curve, never sideways. Only a
            // small shuffle (a slow step back or aside to keep its place) is taken as it stands.
            const to = Math.atan2(vx, vz), going = want > 0.5 && c.speed > 0.05 && !(gap < 1.6 && want < 1.8 && Math.abs(turnTo(0, to - c.yaw, 1)) > 1.6);
            if (going) {
                c.yaw = turnTo(c.yaw, to, dt * 6, most);
                const err = Math.abs(turnTo(0, to - c.yaw, 1)), step = Math.min(c.speed * Math.max(0.1, Math.cos(Math.min(err, Math.PI / 2))) * dt, gap + Math.hypot(fx, fz) * dt);
                c.x += Math.sin(c.yaw) * step; c.z += Math.cos(c.yaw) * step;
            } else if (want > 0.05 && c.speed > 0.05) { const step = Math.min(c.speed * dt, gap + Math.hypot(fx, fz) * dt); c.x += vx / want * step; c.z += vz / want * step; }
            for (const [ox, oz, room] of rooms) { const ax = c.x - ox, az = c.z - oz, a = Math.hypot(ax, az); if (a < room && a > 1e-4) { const push = Math.min(room - a, dt * 1.6) / a; c.x += ax * push; c.z += az * push; } }
            // Standing or shuffling, it faces the fire if it has a place by one, and down the road otherwise.
            const gone = dt > 1e-4 ? Math.hypot(c.x - x0, c.z - z0) / dt : 0;
            if (!going) c.yaw = turnTo(c.yaw, spot && (rest > 0.5 || gap < 0.6) ? spot.face : c.mode === 'go' && !camping ? ahead0 : c.yaw, dt * 3, most);
            c.gait += Math.min(gone, kind.top) * dt;
            c.alt = ease(c.alt, 0, 0.3); c.wing = ease(c.wing, 0, 0.3);
            if (c.speed > 0.3) rest = 0;
        }
        // On a bridge, between its parapets.
        if (c.alt < 0.5 && c.riding < 0.5 && w.bridge(c.z) !== null) { const side = w.lateral(c.x, c.z); if (Math.abs(side) > 2.0) c.x = w.place(c.z, clamp(side, -2.0, 2.0))[0]; }
        c.rest = ease(c.rest, rest, rest ? 0.5 : 0.25);
        c.down = ease(c.down, down, 0.35);
        c.y = w.surface(c.x, c.z);
        return c;
    }
    const lateralOf = (w, c) => w.lateral(c.x, c.z);

    // ---- A traveller's craft ------------------------------------------------------------------
    // The druid changes her shape now and then, and back: a bear, an owl-beast or a great black cat, by the
    // country and the hour. often: 'never', 'sometimes' or 'often'. All of it by the seed and by elapsed time, so
    // the same walk changes at the same places at any frame rate; and never while she rests (a change that falls
    // due then waits for the road).
    const FORMS = ['bear', 'owlbeast', 'panther'];
    const SHIFT = { secs: 1.7, first: [22, 50], self: { sometimes: [80, 150], often: [22, 36] }, beast: { sometimes: [35, 85], often: [30, 60] } };
    function shiftStart(seed) { return { seed, form: 'self', from: 'self', to: 'self', change: 1, n: 0, timer: SHIFT.first[0] + SHIFT.first[1] * hash(seed, 0, 4421), want: false }; }
    // options: { often, night (0 to 1), biome }
    function shiftStep(s, dt, j, options) {
        const often = options.often || 'sometimes';
        if (s.change < 1) {
            s.change = Math.min(1, s.change + dt / SHIFT.secs);
            if (s.change >= 1) s.form = s.to;
            return s;
        }
        if (often !== 'never' || s.form !== 'self') s.timer -= dt;
        if ((s.timer <= 0 || s.want) && j.mode === 'walk' && j.sit < 0.05) {
            const r = k => hash(s.seed, s.n * 7 + k, 4421);
            let to = 'self';
            if (s.form === 'self') {
                // The bear for the forest and the pass, the owl-beast for the enchanted grove, the cat for the night.
                const weight = { bear: options.biome === 'forest' || options.biome === 'pass' ? 4 : 1, owlbeast: options.biome === 'grove' ? 5 : 1, panther: options.night > 0.5 ? 5 : 1 };
                let roll = r(1) * (weight.bear + weight.owlbeast + weight.panther);
                to = FORMS.find(f => (roll -= weight[f]) < 0) || 'bear';
            }
            const span = (to === 'self' ? SHIFT.self : SHIFT.beast)[often === 'often' ? 'often' : 'sometimes'];
            Object.assign(s, { from: s.form, to, change: 0, n: s.n + 1, want: false, timer: span[0] + span[1] * r(2) });
        }
        return s;
    }
    // The rogue goes unseen for a while: past the guards at a city's gate, into a town after dark, when somebody
    // is coming up the road; and, set to 'often', for a stretch now and then for no reason but practice. Never at a rest.
    function stealthStart(seed) { return { seed, hide: false, hidden: 0, left: 0, want: false }; }
    // options: { often, night, traffic: metres to whoever is coming the other way (Infinity if nobody) }
    function stealthStep(s, dt, j, w, options) {
        const r = w.at(j.z), p = r.near, often = options.often || 'sometimes', walking = j.mode === 'walk' && j.sit < 0.05;
        let cause = false;
        if (often !== 'never') {
            if (p.place === 'city' && Math.abs(Math.abs(r.dz) - (p.grand ? GRAND.A : 104)) < (p.grand ? 38 : 28)) cause = true;
            if (p.radius && options.night > 0.6 && Math.abs(Math.abs(r.dz) - p.radius * 0.85) < 20) cause = true;
            if (options.traffic < 24) cause = true;
            if (often === 'often' && hash(s.seed, Math.floor(j.distance / 80), 4423) < 0.3) cause = true;
        }
        if (s.want) { s.want = false; s.hide = !s.hide; s.left = s.hide ? 20 : 0; s.held = !s.hide ? 6 : 0; }
        s.held = Math.max(0, (s.held || 0) - dt);                  // shown by hand: she stays shown a little while
        if (cause && walking && !s.held) { s.hide = true; s.left = Math.max(s.left, 2.5); }
        else if ((s.left -= dt) <= 0) s.hide = false;
        if (!walking) { s.hide = false; s.left = 0; }
        s.hidden = clamp(s.hidden + (s.hide ? 1 : -1) * dt / 0.9, 0, 1);
        return s;
    }
    // Fences run beside the road in farm and meadow country (WayLogic's scatter puts them there): how far out one
    // stands on this side at z (metres), or 0.
    function fenceAt(w, z, side) {
        const r = w.at(z), b = r.t > 0.5 ? r.b : r.a, run = w.hash(Math.floor(Math.round(z / 4) / 9), side, 50);
        if (r.near.radius && Math.abs(r.dz) < r.near.radius + 6) return 0;
        return b.biome === 'farm' && run < 0.8 ? 3.5 : b.biome === 'meadow' && run < 0.3 ? 3.4 : 0;
    }
    // The rogue does not walk round a fence between the road and a fire: she goes over it. 0 on the ground, 1 at the top of the vault.
    function vault(j, w) {
        if (j.mode !== 'toCamp' && j.mode !== 'fromCamp') return 0;
        const at = fenceAt(w, j.z, Math.sign(j.d) || 1), u = at ? (Math.abs(j.d) - at + 0.85) / 1.7 : -1;
        return u > 0 && u < 1 ? Math.sin(Math.PI * u) : 0;
    }
    // Something startling at the traveller's own heels (a bear, where she was): the cats in the company bristle and drop back.
    function spook(party) { for (const c of party) if (c.kind.cat) { c.alarm = 1; c.bristle = true; } }

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
    // The orbiting camera: round the traveller at any bearing (az, radians: 0 behind them, a quarter turn at
    // their right hand, a half in front, measured from the way the road is going, so it keeps its side of them as
    // the road turns) and any height from the grass to straight overhead (el). It is the one camera that leaves
    // the road, so it is the one that has to know what it might be inside: it comes in toward the traveller when
    // the ground, a wall, a house or a tree is in the way.
    const ORBIT = { elMin: 0.035, elMax: Math.PI / 2, distMin: 2.5, distMax: 60, rate: TAU / 75, swing: 0.16, swingSecs: 47, resume: 4, ease: 7, dragAz: TAU * 0.6, dragEl: Math.PI * 0.62 };
    const wrapPi = a => a - TAU * Math.round(a / TAU);
    function orbitStart(az = 0.5, el = 0.3, dist = 8) { return { az: wrapPi(az), el: clamp(el, ORBIT.elMin, ORBIT.elMax), dist: clamp(dist, ORBIT.distMin, ORBIT.distMax), reach: dist, held: false, idle: 1e9, sway: 0, shown: null, cam: null }; }
    const orbitEl = (o, turning) => clamp(o.el + (turning ? ORBIT.swing * Math.sin(o.sway * TAU / ORBIT.swingSecs) : 0), ORBIT.elMin, ORBIT.elMax);
    // A hand on it: it stays wherever it is left. from: the angles when the drag began; dx, dy in pixels of a width × height screen.
    function orbitGrab(o, turning) { o.el = orbitEl(o, turning); o.sway = 0; o.held = true; o.idle = 0; return { az: o.az, el: o.el }; }
    function orbitDrag(o, from, dx, dy, width, height) {
        o.az = wrapPi(from.az - dx / width * ORBIT.dragAz);
        o.el = clamp(from.el + dy / height * ORBIT.dragEl, ORBIT.elMin, ORBIT.elMax);
        o.idle = 0;
        return o;
    }
    // Where the camera is for these angles, `reach` metres out (already known to be clear).
    function orbitCamera(j, w, az, el, reach) {
        const me = standing(j, w), h = w.heading(j.z), b = h + Math.PI - az, ce = Math.cos(el), at = [me.x, me.y + 1.3 - 0.5 * j.sit, me.z];
        const x = at[0] + Math.sin(b) * ce * reach, z = at[2] + Math.cos(b) * ce * reach, y = Math.max(at[1] + Math.sin(el) * reach, Math.max(w.surface(x, z), w.water(x, z)) + 0.5);
        const flat = Math.hypot(x - at[0], z - at[2]);
        return { x, y, z, heading: b + Math.PI, pitch: flat < 1e-3 ? -Math.PI / 2 : Math.atan2(at[1] - y, flat), reach, at, dir: [Math.sin(b) * ce, Math.sin(el), Math.cos(b) * ce] };
    }
    // options: { turning (it circles by itself; else it holds), still (reduced motion: it holds), pan (Android's pages, radians) }
    function orbitStep(o, dt, j, w, options = {}) {
        o.idle += dt;
        if (o.held) o.idle = 0;
        if (options.turning && !options.still && o.idle > ORBIT.resume) { o.az = wrapPi(o.az + ORBIT.rate * dt); o.sway += dt; }
        const az = o.az + (options.pan || 0), el = orbitEl(o, options.turning);
        const aim0 = orbitCamera(j, w, az, el, 0), clear = sightline(w, aim0.at, aim0.dir, o.dist);
        // In at once when something comes between; out again gently when it has gone.
        o.reach = clear < o.reach ? clear : Math.min(clear, o.reach + ORBIT.ease * dt);
        o.shown = { az, el };
        // The sweep steps, and the camera is lifted clear of the ground where it ends: be sure of the place itself.
        let cam = orbitCamera(j, w, az, el, o.reach);
        for (let tries = 0; tries < 24 && o.reach > 0.9 && !inOpen(w, cam.x, cam.y, cam.z, 0.25); tries++) { o.reach = Math.max(0.9, o.reach * 0.88 - 0.25); cam = orbitCamera(j, w, az, el, o.reach); }
        return o.cam = cam;
    }

    // mode: 'follow', 'first', 'orbit' or 'drift'. shot: { index, t, z0 (where the traveller was when it began) }. orbit: an orbitStart().
    function camera(mode, j, w, seconds, shot, orbit) {
        if (mode === 'orbit') return orbit.cam || orbitStep(orbit, 0, j, w);
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
        RAD, TAU, SLOT, CHUNK, RUN, BIOMES, LAND, SEASONS, ROAD, GRAND, WEATHER, WALK, SHOTS, beyondWall,
        clamp, mix, mix3, smooth, hash, noise1, noise2,
        world, camp, nextCamp, bodies, light, weatherStart, weatherStep,
        WILD, WILDLIFE, WILD_SHOW, WILD_LEVELS, wildStart, wildStep, wildSeen,
        COMPANIONS, COMPANION, GROUPS, PARTY_MAX, party, partyStart, partyChange, companionStart, companionStep, FORMS, SHIFT, shiftStart, shiftStep, stealthStart, stealthStep, spook, fenceAt, vault,
        journeyStart, journeyStep, standing, sight, camera, ORBIT, orbitStart, orbitGrab, orbitDrag, orbitStep, orbitCamera, sightline, inOpen, wrapPi,
    };
})();
