// Cherry Blossoms' pure logic (SPEC §10.33): the seeded random and noise,
// the tree (a bough reaching in from a corner, its branches, twigs and
// blossom clusters, from a seed), the wind (a breeze that gusts, with
// eddies), a petal's flight (tumbling, fluttering, swaying, carried by the
// wind, settling on the ground or afloat on the water) and the light of the
// hour. No DOM in here, so tools/cherry-blossoms.test.mjs runs it in Node.

const CherryLogic = (() => {
    // ---- Random and noise --------------------------------------------------------------------

    function rng(seed) {
        let a = (seed >>> 0) || 1;
        const next = () => {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        next.range = (lo, hi) => lo + next() * (hi - lo);
        next.int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
        next.pick = list => list[Math.floor(next() * list.length)];
        return next;
    }

    const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
    const lerp = (a, b, t) => a + (b - a) * t;
    const smooth = t => t * t * (3 - 2 * t);

    // Value noise in one and two dimensions, -1..1, smooth, repeatable.
    function hash1(i) {
        let h = Math.imul(i | 0, 374761393) >>> 0;
        h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
        return ((h ^ (h >>> 16)) >>> 0) / 4294967296 * 2 - 1;
    }
    function hash2(x, y) {
        return hash1(x * 73856093 ^ y * 19349663);
    }
    function noise1(t) {
        const i = Math.floor(t), f = smooth(t - i);
        return lerp(hash1(i), hash1(i + 1), f);
    }
    function noise2(x, y) {
        const xi = Math.floor(x), yi = Math.floor(y), fx = smooth(x - xi), fy = smooth(y - yi);
        return lerp(lerp(hash2(xi, yi), hash2(xi + 1, yi), fx), lerp(hash2(xi, yi + 1), hash2(xi + 1, yi + 1), fx), fy);
    }

    // ---- Colour ------------------------------------------------------------------------------

    function hexToRgb(hex) {
        const m = /^#?([0-9a-f]{6})/i.exec(String(hex).trim());
        if (!m) return [255, 183, 197];
        const n = parseInt(m[1], 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const rgb = ([r, g, b], a = 1) => a >= 1 ? `rgb(${r | 0},${g | 0},${b | 0})` : `rgba(${r | 0},${g | 0},${b | 0},${a})`;
    const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

    // ---- The tree ----------------------------------------------------------------------------

    // A bough comes in from a top corner (side: 'left' | 'right'), thick at
    // the edge of the screen and tapering, bending down and out, throwing
    // branches that throw twigs; every twig end and many a joint carries a
    // cluster of blossom. Coordinates are in CSS px for a W × H screen.
    // style: 'bough' (one big bough), 'branches' (several thinner ones from
    // the top edge), 'canopy' (boughs from both top corners meeting).
    function tree(seed, W, H, { style = 'bough', side = 'left', branches = 8, blossoms = 1 } = {}) {
        const random = rng(seed);
        const limbs = [], clusters = [];
        const s = Math.min(W, H) / 800;             // the scale of everything
        const addLimb = (x0, y0, angle, length, width, depth, gen) => {
            // A limb is a polyline that bends a little along its length.
            const pts = [];
            const n = Math.max(3, Math.round(length / (18 * s)));
            let x = x0, y = y0, a = angle;
            // Over its whole length a limb bends up to half a radian, and
            // droops a little more each generation; the rest is jitter.
            const bend = random.range(-0.45, 0.45) / n, droop = 0.22 * (gen + 1) / n;
            for (let i = 0; i <= n; i++) {
                const t = i / n;
                pts.push({ x, y, w: width * (1 - t * 0.85) });
                a += bend + droop * (Math.cos(a) >= 0 ? 1 : -1) + random.range(-0.04, 0.04);
                x += Math.cos(a) * length / n;
                y += Math.sin(a) * length / n;
            }
            const limb = { pts, width, depth, gen };
            limbs.push(limb);
            // Children: branches off a bough, twigs off a branch.
            if (gen < 3 && length > 60 * s) {
                const kids = gen === 0 ? branches : gen === 1 ? random.int(2, 4) : random.int(1, 3);
                for (let k = 0; k < kids; k++) {
                    const t = random.range(gen === 0 ? 0.15 : 0.25, 0.95);
                    const at = pts[Math.min(pts.length - 1, Math.round(t * n))];
                    const dir = Math.cos(angle) >= 0 ? 1 : -1;
                    const turn = (k % 2 ? 1 : -1) * random.range(0.35, 0.9) + random.range(-0.2, 0.2);
                    const childAngle = angle + turn + (gen === 0 ? 0.1 * dir : 0);
                    addLimb(at.x, at.y, childAngle, length * random.range(0.35, 0.6), at.w * random.range(0.45, 0.65), depth + 1, gen + 1);
                }
            }
            // Blossom: at the tip of every twig, and along twigs and branches.
            if (gen >= 1) {
                const tip = pts[pts.length - 1];
                clusters.push({ x: tip.x, y: tip.y, r: (26 + random() * 18) * s * (0.8 + blossoms * 0.3), n: Math.round(random.range(5, 9) * blossoms), depth });
                for (let i = 2; i < pts.length - 1; i++) {
                    if (random() < 0.32 * blossoms) clusters.push({ x: pts[i].x + random.range(-6, 6) * s, y: pts[i].y + random.range(-6, 6) * s, r: (18 + random() * 14) * s, n: Math.round(random.range(3, 6) * blossoms), depth });
                }
            }
        };
        const bough = (sideOf, big) => {
            const dir = sideOf === 'left' ? 1 : -1;
            const x0 = sideOf === 'left' ? -20 * s : W + 20 * s;
            const y0 = random.range(0.04, 0.22) * H;
            const angle = dir === 1 ? random.range(0.05, 0.3) : Math.PI - random.range(0.05, 0.3);
            addLimb(x0, y0, angle, (big ? random.range(0.55, 0.75) : random.range(0.4, 0.55)) * W, (big ? 34 : 26) * s, 0, 0);
        };
        if (style === 'bough') bough(side, true);
        else if (style === 'canopy') { bough('left', false); bough('right', false); }
        else if (style === 'branches') {
            // Thinner branches hanging in from the top edge.
            const n = Math.max(1, Math.round(branches));
            for (let i = 0; i < n; i++) {
                const x0 = W * (i + random.range(0.2, 0.8)) / n, y0 = -10 * s;
                const angle = Math.PI / 2 + random.range(-0.9, 0.9);
                addLimb(x0, y0, angle, random.range(0.16, 0.3) * H, 9 * s, 1, 1);
            }
        }
        // Nearer limbs (deeper down the tree) draw last.
        limbs.sort((a, b) => a.depth - b.depth);
        return { limbs, clusters, s, side, style };
    }

    // ---- Wind --------------------------------------------------------------------------------

    // A breeze from one side that wanders, and gusts on top: a gust rises,
    // blows, and dies down over `length` seconds, `rate` of them an hour.
    function makeWind(random, dir = null) {
        return { dir: dir ?? (random() < 0.5 ? 1 : -1), base: 0, gust: 0, phase: 'calm', t: 0, length: 6, wait: random.range(4, 20), eddy: random() * 100, strength: 0 };
    }

    function stepWind(w, dt, { strength = 3, gustsPerMinute = 3, gustLength = 6 }, random, time) {
        w.t += dt;
        // The breeze: a third of the strength, wandering, now and then turning.
        w.base = strength * (0.25 + 0.15 * noise1(time * 0.08 + w.eddy));
        if (w.phase === 'calm') {
            w.wait -= dt;
            if (w.wait <= 0 && gustsPerMinute > 0) { w.phase = 'rising'; w.t = 0; w.length = gustLength * random.range(0.7, 1.4); w.peak = strength * random.range(0.7, 1.3); }
        } else if (w.phase === 'rising') {
            w.gust = w.peak * smooth(clamp(w.t / (w.length * 0.3), 0, 1));
            if (w.t >= w.length * 0.3) { w.phase = 'blowing'; w.t = 0; }
        } else if (w.phase === 'blowing') {
            w.gust = w.peak * (0.85 + 0.15 * noise1(time * 1.7));
            if (w.t >= w.length * 0.4) { w.phase = 'falling'; w.t = 0; }
        } else if (w.phase === 'falling') {
            w.gust = w.peak * (1 - smooth(clamp(w.t / (w.length * 0.3), 0, 1)));
            if (w.t >= w.length * 0.3) {
                w.phase = 'calm'; w.gust = 0; w.t = 0;
                w.wait = gustsPerMinute > 0 ? (60 / gustsPerMinute) * random.range(0.4, 1.6) : Infinity;
                if (random() < 0.25) w.dir = -w.dir;
            }
        }
        w.strength = w.base + w.gust;
        return w;
    }

    // The wind at a point: the global wind plus eddies, px/s.
    function windAt(w, x, y, time, s = 1) {
        const k = 0.0025 / s;
        const ex = noise2(x * k + time * 0.2, y * k) * 0.55, ey = noise2(x * k + 50, y * k - time * 0.15) * 0.35;
        const push = w.strength * 22 * s;
        return { x: w.dir * push * (1 + ex) , y: push * ey * 0.5 - w.gust * 6 * s };
    }

    // ---- Petals ------------------------------------------------------------------------------

    // A petal falls at its terminal speed, is carried by the wind, sways side
    // to side, tumbles (its drawn angle) and flutters (turns on its long
    // axis, so it reads as a 3D flake catching the light), slower and
    // smaller the further back it is.
    function makePetal(random, W, H, { fallSpeed = 1, size = 1, spin = 1, sway = 2, flutter = 0.7, colours = 5, shapes = 4, from = null, depth = null } = {}) {
        const d = depth ?? random();                    // 0 far .. 1 near
        const scale = (0.55 + d * 0.75) * size;
        const p = {
            x: from ? from.x + random.range(-from.r, from.r) : random() * W,
            y: from ? from.y + random.range(-from.r * 0.5, from.r * 0.5) : -20 - random() * H * 0.5,
            vx: from ? random.range(-30, 30) : 0, vy: from ? random.range(-20, 20) : 0,
            depth: d, scale,
            terminal: (28 + random() * 22) * fallSpeed * (0.7 + d * 0.5),
            angle: random() * Math.PI * 2, spin: random.range(-1.6, 1.6) * spin,
            flip: random() * Math.PI * 2, flipRate: random.range(1.5, 4) * (0.3 + flutter), flutter,
            swayPhase: random() * Math.PI * 2, swayRate: random.range(0.8, 1.6), sway,
            shape: random.int(0, shapes - 1), colour: random.int(0, colours - 1),
            alpha: 1, state: 'falling', age: 0, bob: random() * Math.PI * 2,
        };
        return p;
    }

    // One step of a falling petal. env: { wind, time, W, H, groundY, ground
    // ('none' | 'grass' | 'water' | 'path'), s (scale), fade }. Returns the
    // petal's state after the step.
    function stepPetal(p, dt, env) {
        p.age += dt;
        if (p.state === 'falling') {
            const w = windAt(env.wind, p.x, p.y, env.time, env.s);
            const sway = Math.sin(p.swayPhase += p.swayRate * dt) * p.sway * 14 * env.s;
            const k = 1 - Math.exp(-dt * 1.8);
            p.vx += (w.x * (0.6 + p.depth * 0.5) + sway - p.vx) * k;
            p.vy += (p.terminal * env.s + w.y * 0.6 - p.vy) * k;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.angle += (p.spin + w.x * 0.004) * dt;
            p.flip += p.flipRate * dt * (1 + env.wind.gust * 0.15);
            if (env.fade && p.y > env.groundY - env.H * 0.25) p.alpha = clamp((env.groundY - p.y) / (env.H * 0.25), 0, 1);
            if (p.x < -60 * env.s || p.x > env.W + 60 * env.s || p.y > env.H + 40 * env.s) p.state = 'gone';
            else if (p.y >= env.groundY && env.ground !== 'none') {
                p.y = env.groundY + (p.depth - 0.5) * 16 * env.s;
                p.state = env.ground === 'water' ? 'afloat' : 'settled';
                p.vx = p.vy = 0;
                p.flip = Math.round(p.flip / Math.PI) * Math.PI;   // lies flat
            }
        } else if (p.state === 'afloat') {
            // Carried on the water, bobbing, drifting slowly nearer, out at the edges.
            const w = windAt(env.wind, p.x, p.y, env.time, env.s);
            p.x += (w.x * 0.25 + 4 * env.s) * dt;
            p.y = Math.min(env.H + 30 * env.s, p.y + (3 + p.depth * 4) * env.s * dt);
            p.bob += dt * 1.5;
            p.angle += Math.sin(p.bob) * 0.15 * dt;
            if (p.x < -40 * env.s || p.x > env.W + 40 * env.s) p.state = 'gone';
        }
        return p.state;
    }

    // How wide the petal is drawn against its length: cos of its flutter,
    // never quite edge-on.
    function flutterWidth(p) {
        const c = Math.cos(p.flip);
        return Math.sign(c || 1) * Math.max(0.18, Math.abs(c));
    }

    // ---- Light -------------------------------------------------------------------------------

    // The sky's colours by the hour (0..24) for the 'clock' sky, blending
    // the fixed skies: night till 5, dawn at 6, day 8–17, dusk at 19, night from 21.
    const SKIES = {
        day: { top: [150, 200, 240], mid: [205, 225, 245], horizon: [255, 232, 225], sun: [255, 250, 225], light: 1, stars: 0, moon: 0 },
        dusk: { top: [90, 70, 130], mid: [230, 130, 120], horizon: [255, 200, 140], sun: [255, 200, 120], light: 0.78, stars: 0.15, moon: 0.3 },
        night: { top: [12, 16, 48], mid: [30, 36, 85], horizon: [70, 70, 120], sun: [220, 225, 255], light: 0.36, stars: 1, moon: 1 },
    };
    function skyAt(hour) {
        const h = ((hour % 24) + 24) % 24;
        const blend = (a, b, t) => {
            const out = {};
            for (const k of Object.keys(a)) out[k] = Array.isArray(a[k]) ? mix(a[k], b[k], t) : lerp(a[k], b[k], t);
            return out;
        };
        if (h < 5) return SKIES.night;
        if (h < 7) return blend(SKIES.night, SKIES.dusk, (h - 5) / 2);
        if (h < 9) return blend(SKIES.dusk, SKIES.day, (h - 7) / 2);
        if (h < 17) return SKIES.day;
        if (h < 19.5) return blend(SKIES.day, SKIES.dusk, (h - 17) / 2.5);
        if (h < 21.5) return blend(SKIES.dusk, SKIES.night, (h - 19.5) / 2);
        return SKIES.night;
    }

    return { rng, clamp, lerp, smooth, noise1, noise2, hexToRgb, rgb, mix, tree, makeWind, stepWind, windAt, makePetal, stepPetal, flutterWidth, SKIES, skyAt };
})();
