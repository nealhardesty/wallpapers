// Ice Patrol's world, with no DOM and no WebGL, so tools/ice-patrol.test.mjs
// can run it in Node (SPEC §10.34):
//
//   bake      two tileable noise fields: smooth drifts and ridged mountains
//   terrain   the endless snowfield built from them: height(x, z) in metres.
//             The renderer's shaders evaluate the same formula from the same
//             fields (as textures), so what the pilot avoids is what is drawn.
//   flight    the autopilot: follows the low ground, climbs over what it must
//   sky       where the sun and the two moons are, and the light they give
//   weather   snow that comes and goes
//   radar     one ray of a ground-mapping radar: slopes facing the dish
//             shine, and whatever hides behind a ridge stays dark

const IceLogic = (() => {
    const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
    const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const mix = (a, b, t) => a + (b - a) * t;
    const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
    const RAD = Math.PI / 180;

    // ---- Noise ------------------------------------------------------------
    // Perlin noise on a lattice of `cells` × `cells` that wraps, so a field
    // built from it tiles.
    function lattice(cells, random) {
        const gx = new Float32Array(cells * cells), gy = new Float32Array(cells * cells);
        for (let i = 0; i < gx.length; i++) {
            const a = random() * Math.PI * 2;
            gx[i] = Math.cos(a);
            gy[i] = Math.sin(a);
        }
        return { cells, gx, gy };
    }

    // x and y in lattice cells.
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

    // out += amp × the lattice's noise over an n × n tile, one tile wide.
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

    // Slopes of a tile, per tile width (so a layer `size` metres wide
    // divides by its size), by central differences that wrap. n is a power of two.
    function slopes(field, n) {
        const gu = new Float32Array(n * n), gv = new Float32Array(n * n), mask = n - 1, half = n / 2;
        for (let y = 0; y < n; y++) {
            const row = y * n, up = ((y - 1) & mask) * n, down = ((y + 1) & mask) * n;
            for (let x = 0; x < n; x++) {
                gu[row + x] = (field[row + ((x + 1) & mask)] - field[row + ((x - 1) & mask)]) * half;
                gv[row + x] = (field[down + x] - field[up + x]) * half;
            }
        }
        return { gu, gv };
    }

    // The two fields, n × n (a power of two), each 0 to 1 and tileable:
    //   a  soft fractal noise: the biome map, hills, rolls and drifts
    //   b  ridged and domain-warped: mountain chains with broad valleys
    function bake(random, n = 512) {
        const a = new Float32Array(n * n), b = new Float32Array(n * n);
        let amp = 1;
        for (const cells of [2, 4, 8, 16, 32, 64]) {
            addOctave(a, n, lattice(cells, random), amp);
            amp *= 0.5;
        }
        const wu = new Float32Array(n * n), wv = new Float32Array(n * n);
        addOctave(wu, n, lattice(4, random), 0.045);
        addOctave(wv, n, lattice(4, random), 0.045);
        const ridged = [3, 6, 12, 24, 48].map(cells => lattice(cells, random));
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                const i = y * n + x, u = x / n + wu[i], v = y / n + wv[i];
                let ridge = 0, weight = 1;
                amp = 1;
                for (let o = 0; o < ridged.length; o++) {
                    const l = ridged[o];
                    let r = 1 - Math.abs(perlin(l, u * l.cells, v * l.cells)) * 1.7;
                    r = r < 0 ? 0 : r * r * weight;
                    weight = r * 1.8 > 1 ? 1 : r * 1.8;
                    ridge += r * amp;
                    amp *= 0.5;
                }
                b[i] = ridge;
            }
        }
        normalise(a);
        normalise(b);
        return { n, a, b };
    }

    // A field as texture mips, each RGBA bytes: the height in 16 bits (R high,
    // G low), its slopes in B and A (±gmax). Linear filtering of the bytes
    // filters the decoded values, and every mip is averaged from the floats.
    // `fine` adds a second set with the slopes alone, 16 bits each: eight
    // are too few for a mountainside the sun only grazes (it shades in steps).
    function pack(field, n, fine = false) {
        const mips = [], slopeMips = [];
        let gmax = 0, level = field, size = n;
        for (;;) {
            const { gu, gv } = slopes(level, size);
            if (!mips.length) {
                for (let i = 0; i < gu.length; i++) {
                    const m = Math.max(Math.abs(gu[i]), Math.abs(gv[i]));
                    if (m > gmax) gmax = m;
                }
            }
            // A clamped array rounds and clamps as it stores.
            const bytes = new Uint8ClampedArray(size * size * 4), k = 127.5 / gmax;
            for (let i = 0, o = 0; i < level.length; i++, o += 4) {
                const h = Math.round(level[i] * 65535);
                bytes[o] = h >> 8;
                bytes[o + 1] = h & 255;
                bytes[o + 2] = gu[i] * k + 127.5;
                bytes[o + 3] = gv[i] * k + 127.5;
            }
            mips.push(new Uint8Array(bytes.buffer));
            if (fine) {
                const wide = new Uint8Array(size * size * 4), k16 = 32767.5 / gmax;
                for (let i = 0, o = 0; i < level.length; i++, o += 4) {
                    const u = Math.round(clamp(gu[i] * k16 + 32767.5, 0, 65535)), v = Math.round(clamp(gv[i] * k16 + 32767.5, 0, 65535));
                    wide[o] = u >> 8;
                    wide[o + 1] = u & 255;
                    wide[o + 2] = v >> 8;
                    wide[o + 3] = v & 255;
                }
                slopeMips.push(wide);
            }
            if (size === 1) break;
            const half = size / 2, next = new Float32Array(half * half);
            for (let y = 0; y < half; y++) {
                for (let x = 0; x < half; x++) {
                    const i = y * 2 * size + x * 2;
                    next[y * half + x] = (level[i] + level[i + 1] + level[i + size] + level[i + size + 1]) / 4;
                }
            }
            level = next;
            size = half;
        }
        return { mips, gmax, slopeMips };
    }

    // ---- Terrain ------------------------------------------------------------
    // Six looks at the two fields, each at its own scale and turned its own
    // way, so the tiles never line up. Sizes are metres per tile.
    const LAYERS = [
        { field: 'a', size: 26000, turn: 0.0 },    // 0  biome: plain, hills or mountains
        { field: 'b', size: 9000, turn: 0.6 },     // 1  mountain chains
        { field: 'a', size: 3300, turn: 1.9 },     // 2  hills
        { field: 'a', size: 610, turn: 2.7 },      // 3  rolls
        { field: 'a', size: 97, turn: 0.9 },       // 4  drifts
        { field: 'b', size: 2300, turn: 2.2 },     // 5  gullies and spurs on the mountains
    ].map(l => ({ ...l, cos: Math.cos(l.turn), sin: Math.sin(l.turn) }));
    const SHAPE = { mountain: 1150, gully: 190, cut: 0.34, hill: 320, roll: 46, drift: 2.2, m0: 0.47, m1: 0.72, k0: 0.30, k1: 0.62 };

    // Where layer `l` reads its tile at world (x, z), in tile widths.
    const uvOf = (l, x, z) => [(x * l.cos + z * l.sin) / l.size, (-x * l.sin + z * l.cos) / l.size];

    // Bilinear, wrapping, with texel centres where a GPU puts them.
    function sample(field, n, u, v) {
        const fx = (u - Math.floor(u)) * n - 0.5, fy = (v - Math.floor(v)) * n - 0.5;
        const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
        const x0 = (ix + n) & (n - 1), x1 = (ix + 1 + n) & (n - 1), y0 = ((iy + n) & (n - 1)) * n, y1 = ((iy + 1 + n) & (n - 1)) * n;
        return (field[y0 + x0] * (1 - tx) + field[y0 + x1] * tx) * (1 - ty) + (field[y1 + x0] * (1 - tx) + field[y1 + x1] * tx) * ty;
    }

    function terrain(baked) {
        const { n } = baked;
        const at = (i, x, z) => {
            const l = LAYERS[i];
            return sample(baked[l.field], n, (x * l.cos + z * l.sin) / l.size, (-x * l.sin + z * l.cos) / l.size);
        };
        // How mountainous it is here, 0 (open plain) to 1.
        const mountains = (x, z) => smooth(SHAPE.m0, SHAPE.m1, at(0, x, z));
        function height(x, z) {
            const a0 = at(0, x, z);
            const m = smooth(SHAPE.m0, SHAPE.m1, a0), k = 0.3 + 0.7 * smooth(SHAPE.k0, SHAPE.k1, a0);
            return m * (SHAPE.mountain * at(1, x, z) + SHAPE.gully * (at(5, x, z) - SHAPE.cut)) + SHAPE.hill * k * (at(2, x, z) - 0.5)
                + SHAPE.roll * (at(3, x, z) - 0.5) + SHAPE.drift * (at(4, x, z) - 0.5);
        }
        return { height, mountains };
    }

    // ---- Flight ---------------------------------------------------------------
    // The autopilot. x east, z north, y up, in metres; heading in radians
    // clockwise from north; roll positive to the right; pitch positive up.
    const FLIGHT = {
        feel: [-0.95, -0.5, 0, 0.5, 0.95],   // where it looks for low ground, radians off the nose
        reach: [260, 620, 1150],             // and how far, metres (weights below)
        weight: [0.45, 0.33, 0.22],
        ahead: [0, 30, 70, 120, 190, 280, 400],   // the profile it climbs for, metres at 80 m/s
        maxTurn: 0.2,                        // radians a second
        maxBank: 0.62,
        grade: 0.12,                         // a rise it takes in its stride, metres per metre
    };

    function flightStart(ground, clearance, seed = 0) {
        return { x: 0, z: 0, y: ground(0, 0) + clearance, heading: seed * 6.283, turn: 0, climb: 0, roll: 0, pitch: 0, t: seed * 1000, distance: 0, agl: clearance, pull: 0, target: 0 };
    }

    // One step of at most 1/60 s; flightAdvance splits a frame into them.
    function flightStep(s, dt, ground, speed, clearance, lure) {
        const here = ground(s.x, s.z);
        // Steering: a slow wander, bent away from whatever stands higher
        // than it could comfortably climb to. Open country costs nothing, so
        // the wander leads; in the mountains the passes win. `lure` (0 to 1
        // at a place) is scenery worth a detour: by turns the pilot makes
        // for the mountains and keeps clear of them, out over the plain.
        const wander = 0.55 * Math.sin(s.t / 41) + 0.35 * Math.sin(s.t / 17.3 + 1.7) + 0.2 * Math.sin(s.t / 7.1 + 4);
        const level = s.y - clearance, appetite = lure ? clamp(0.4 + 0.9 * Math.sin(s.t / 130), -0.6, 1) : 0;
        let best = Infinity;
        const costs = FLIGHT.feel.map(az => {
            const sin = Math.sin(s.heading + az), cos = Math.cos(s.heading + az);
            let cost = 70 * Math.abs(az - wander);
            if (appetite) cost -= 60 * appetite * (lure(s.x + sin * 2200, s.z + cos * 2200) + lure(s.x + sin * 4500, s.z + cos * 4500));
            for (let i = 0; i < FLIGHT.reach.length; i++) {
                const d = FLIGHT.reach[i];
                cost += FLIGHT.weight[i] * Math.max(0, ground(s.x + sin * d, s.z + cos * d) - level - FLIGHT.grade * d);
            }
            best = Math.min(best, cost);
            return cost;
        });
        let sum = 0, want = 0;
        costs.forEach((cost, i) => {
            const w = Math.exp(-(cost - best) / 28);
            sum += w;
            want += w * FLIGHT.feel[i];
        });
        const turnTarget = clamp(want / sum * 0.38, -FLIGHT.maxTurn, FLIGHT.maxTurn);
        s.turn += (turnTarget - s.turn) * (1 - Math.exp(-dt / 1.3));
        s.heading += s.turn * dt;

        // Height: clear the ground it is about to cross; nearer counts in
        // full, further only for what it couldn't climb in time.
        const sin = Math.sin(s.heading), cos = Math.cos(s.heading), k = speed / 80;
        let target = here + clearance;
        for (const d of FLIGHT.ahead) {
            const far = d * k;
            target = Math.max(target, ground(s.x + sin * far, s.z + cos * far) + clearance - 0.42 * Math.max(0, far - 130 * k));
        }
        const climbTarget = clamp((target - s.y) / (target > s.y ? 0.55 : 2.0), -speed * 0.42, speed * 0.55);
        s.climb += (climbTarget - s.climb) * (1 - Math.exp(-dt / 0.3));
        s.y += s.climb * dt;
        const floor = here + Math.max(4, clearance * 0.3);
        if (s.y < floor) { s.y = floor; s.climb = Math.max(s.climb, 0); }

        s.x += sin * speed * dt;
        s.z += cos * speed * dt;
        s.distance += speed * dt;
        s.t += dt;
        s.roll += (clamp(s.turn * 3.1, -FLIGHT.maxBank, FLIGHT.maxBank) - s.roll) * (1 - Math.exp(-dt / 0.45));
        s.pitch += (Math.atan2(s.climb, speed) - s.pitch) * (1 - Math.exp(-dt / 0.35));
        s.agl = s.y - here;
        s.target = target;
        s.pull = clamp((target - s.y) / clearance, 0, 1);   // how hard it is pulling up, for the caution lamp
        return s;
    }

    // A frame of dtMs (clamped at 100 ms): the same ground covered at any frame rate.
    function flightAdvance(s, dtMs, ground, speed, clearance, lure) {
        let left = clamp(dtMs, 0, 100) / 1000;
        while (left > 1e-9) {
            const dt = Math.min(left, 1 / 60);
            flightStep(s, dt, ground, speed, clearance, lure);
            left -= dt;
        }
        return s;
    }

    // ---- Sky ------------------------------------------------------------------
    // A low polar sun: it never climbs past 34°, so the shadows stay long.
    // `day` is the fraction of a day since midnight. Directions are unit
    // vectors [east, up, north].
    const SUN_MAX = 34;
    const dirOf = (el, az) => [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];

    function bodies(day) {
        const phase = 2 * Math.PI * (day - 0.25);
        const sunEl = SUN_MAX * Math.sin(phase), sunAz = 2 * Math.PI * day + Math.PI;
        // The big moon rides opposite the sun, wandering a little; the small
        // one laps the sky every nine hours on a tilted path.
        const big = 2 * Math.PI * (day + 0.5 + 0.07 * Math.sin(day * 0.9));
        const small = 2 * Math.PI * day / 0.37;
        return {
            sunEl,
            sun: dirOf(sunEl * RAD, sunAz),
            moons: [
                dirOf(40 * RAD * Math.sin(big - Math.PI / 2) + 6 * RAD, big + Math.PI + 0.5),
                dirOf(52 * RAD * Math.sin(small) - 4 * RAD, small * 0.83 + 2.1),
            ],
        };
    }

    // Keyframes by the sun's elevation in degrees: zenith, horizon, the band
    // of colour under the sun, the sunlight itself and the sky's fill light.
    // Scene-referred: the shader tone-maps with 1 - exp(-c).
    const LIGHT = [
        { el: -18, zenith: [0.006, 0.010, 0.026], horizon: [0.016, 0.026, 0.052], glow: [0.00, 0.00, 0.00], sun: [0, 0, 0], fill: [0.020, 0.030, 0.058] },
        { el: -7, zenith: [0.020, 0.040, 0.110], horizon: [0.110, 0.110, 0.200], glow: [0.55, 0.20, 0.16], sun: [0, 0, 0], fill: [0.055, 0.075, 0.140] },
        { el: -1.5, zenith: [0.070, 0.140, 0.340], horizon: [0.420, 0.330, 0.380], glow: [1.50, 0.62, 0.22], sun: [0.25, 0.08, 0.03], fill: [0.130, 0.160, 0.270] },
        { el: 3, zenith: [0.110, 0.230, 0.520], horizon: [0.700, 0.560, 0.480], glow: [1.60, 0.85, 0.35], sun: [1.9, 0.95, 0.42], fill: [0.190, 0.240, 0.380] },
        { el: 10, zenith: [0.120, 0.290, 0.660], horizon: [0.720, 0.740, 0.780], glow: [0.90, 0.70, 0.45], sun: [2.5, 1.95, 1.35], fill: [0.240, 0.310, 0.470] },
        { el: 24, zenith: [0.105, 0.285, 0.740], horizon: [0.620, 0.770, 0.950], glow: [0.50, 0.50, 0.45], sun: [2.75, 2.55, 2.25], fill: [0.270, 0.350, 0.520] },
    ];
    const LIGHT_KEYS = ['zenith', 'horizon', 'glow', 'sun', 'fill'];

    // The light at a sun elevation, under `overcast` (0 clear to 1 snowing hard).
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
        // Cloud: the sky goes to its own grey, the sun mostly goes, the fill evens out.
        const o = clamp(overcast, 0, 1);
        const luma = c => 0.25 * c[0] + 0.55 * c[1] + 0.2 * c[2];
        const grey = 0.55 * luma(out.horizon) + 0.45 * luma(out.zenith) + 0.35 * luma(out.sun);
        const cloud = [grey * 0.94, grey * 0.98, grey * 1.06];
        out.zenith = mix3(out.zenith, cloud.map(c => c * 0.82), o * 0.94);
        out.horizon = mix3(out.horizon, cloud, o * 0.94);
        out.glow = out.glow.map(c => c * (1 - 0.9 * o));
        out.fill = mix3(out.fill, cloud.map(c => c * 0.62), o * 0.85);
        out.sun = out.sun.map(c => c * (1 - 0.93 * o));
        out.day = smooth(-7, 3, sunEl);                    // 0 night, 1 day: instrument lamps, headlights, cockpit shade
        out.stars = (1 - smooth(-14, -3, sunEl)) * (1 - o);
        out.moonlight = 1 - smooth(-9, -3, sunEl);         // the moons take over as the lamp
        return out;
    }

    // ---- Weather ----------------------------------------------------------------
    // level 0 is clear air, 1 a whiteout. In 'auto' fronts come and go;
    // `often` scales how much of the time it snows.
    const WEATHER = { clear: 0, flurries: 0.3, snow: 0.62, blizzard: 1 };

    function weatherStart(mode, random) {
        const fixed = WEATHER[mode];
        return { level: fixed ?? 0, target: fixed ?? 0, timer: fixed === undefined ? 25 + random() * 60 : 0 };
    }

    function weatherStep(w, dt, mode, random, often = 1) {
        if (mode in WEATHER) w.target = WEATHER[mode];
        else {
            w.timer -= dt;
            if (w.timer <= 0) {
                if (w.target > 0) {
                    w.target = 0;
                    w.timer = (90 + random() * 170) / Math.max(0.25, often);
                } else {
                    const roll = random();
                    w.target = roll < 0.4 ? 0.22 + random() * 0.18 : roll < 0.8 ? 0.5 + random() * 0.2 : 0.85 + random() * 0.15;
                    w.timer = (70 + random() * 110) * Math.max(0.5, Math.sqrt(often));
                }
            }
        }
        // A front rolls in over half a minute; a weather picked in the panel arrives sooner.
        w.level += (w.target - w.level) * (1 - Math.exp(-dt / (mode in WEATHER ? 5 : 16)));
        return w;
    }

    // What a snow level does to the air: how far you can see (metres to
    // lose 63% of the contrast), cloud cover, how many flakes.
    function air(level) {
        return {
            visibility: 26000 * Math.pow(420 / 26000, smooth(0, 1, level) * 0.5 + level * 0.5),
            overcast: smooth(0.02, 0.4, level),
            flakes: clamp(level * 1.15, 0, 1),
        };
    }

    // ---- Radar ------------------------------------------------------------------
    // One ray of a ground-mapping radar from (x, y, z) along bearing `az`
    // (radians from north): the strength of the return from each of `bins`
    // range cells out to `range` metres, written to `out`. A cell echoes if
    // it rises above everything nearer (the steeper it faces the dish, the
    // brighter); behind a ridge there is only shadow.
    function radarRay(ground, x, y, z, az, range, bins, out) {
        const sin = Math.sin(az), cos = Math.cos(az), step = range / bins;
        let horizon = -Infinity;
        for (let i = 0; i < bins; i++) {
            const r = (i + 0.5) * step;
            const slope = (ground(x + sin * r, z + cos * r) - y) / r;   // tangent of the angle up to this cell
            if (slope > horizon) {
                // The ground right below meets the beam squarely: the strongest return of all.
                out[i] = horizon === -Infinity ? 1 : clamp(0.16 + (slope - horizon) * r / step * 0.9, 0, 1);
                horizon = slope;
            } else out[i] = 0;
        }
        return out;
    }

    return {
        clamp, smooth, mix, mix3, RAD,
        bake, pack, slopes, sample, perlin, lattice,
        LAYERS, SHAPE, uvOf, terrain,
        FLIGHT, flightStart, flightStep, flightAdvance,
        SUN_MAX, bodies, light, LIGHT,
        WEATHER, weatherStart, weatherStep, air,
        radarRay,
    };
})();
