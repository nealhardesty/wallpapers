// The Last Bulb on the Strand (SPEC §10.28): the pure parts. The colours,
// the strand's shape, how a loose bulb flickers and how a tungsten filament
// answers it, and when it's Christmas Eve. No DOM in here: the unit tests
// run this file in a Node vm.

const LastBulbLogic = (() => {
    // Old C9 colours: painted ceramic glass, as they came in the box.
    const PALETTES = {
        vintage: ['#e0262c', '#1f9e4c', '#2a5fd6', '#f2871d', '#f4c430'],
        warm: ['#ffcf86'],
        'red-green': ['#e0262c', '#1f9e4c'],
        'blue-white': ['#2a5fd6', '#f1ede4'],
        candy: ['#e0262c', '#f1ede4'],
        'all-red': ['#e0262c'],
        'all-blue': ['#2a5fd6'],
        pastel: ['#f7a1b8', '#9fd3f2', '#f9e08e', '#b8e4a8', '#d9b3f0'],
    };
    const NAMED = { red: '#e0262c', green: '#1f9e4c', blue: '#2a5fd6', orange: '#f2871d', gold: '#f4c430', white: '#f1ede4', pink: '#ee5b9a' };
    const HEX = /^#[0-9a-f]{6}$/i;

    // The strand's colours, in order along it.
    function colours(config) {
        if (config.palette === 'custom') {
            const mine = (config.myColors || []).filter(c => HEX.test(c));
            if (mine.length) return mine;
        }
        return PALETTES[config.palette] || PALETTES.vintage;
    }

    // The stubborn one's colour: its place in the pattern, or its own (the
    // one replacement bulb from a different box).
    function lastColour(config, list, index) {
        return NAMED[config.lastColour] || list[index % list.length];
    }

    // A flicker is a script of [power, seconds] steps; the last step runs
    // forever. A loose bulb makes contact twice, briefly, and then either
    // holds (lights) or doesn't (not tonight; sometimes a feeble third).
    function attempt(rand, lights) {
        const flick = () => 0.035 + rand() * 0.065;
        const steps = [[1, flick()], [0, 0.16 + rand() * 0.3], [rand() < 0.35 ? 0.6 : 1, flick()], [0, 0.28 + rand() * 0.5]];
        if (lights) steps.push([1, Infinity]);
        else {
            if (rand() < 0.3) steps.push([0.35, 0.05], [0, 0.4]);
            steps.push([0, Infinity]);
        }
        return steps;
    }
    // Lit, it's still loose: it goes out with one last flutter, or dips for
    // a moment and holds.
    const quit = rand => [[0, 0.05 + rand() * 0.05], [0.8, 0.06 + rand() * 0.06], [0, Infinity]];
    const dip = rand => [[0.55 + rand() * 0.3, 0.03 + rand() * 0.04], [1, Infinity]];
    // The whole strand: a stutter, then out.
    const outage = rand => [[0, 0.05], [1, 0.05 + rand() * 0.05], [0, Infinity]];

    // The power a script asks for, t seconds in, and whether it has settled
    // into its last step.
    function play(steps, t) {
        for (const [power, seconds] of steps) {
            if (t < seconds) return { power, done: seconds === Infinity };
            t -= seconds;
        }
        return { power: steps[steps.length - 1][0], done: true };
    }

    // A tungsten filament doesn't switch: it heats in about 40 ms and cools
    // in about 110 (exact for any dt, so it's frame-rate independent). Its
    // light goes as a steep power of its temperature, which is why a dim
    // filament is orange and a flick is a soft blink, not a hard square.
    function filament(f, power, dt) {
        const tau = power > f ? 0.04 : 0.11;
        return power + (f - power) * Math.exp(-dt / tau);
    }
    const light = f => Math.pow(Math.max(0, f), 2.4);
    // How orange it is (a filament warming or cooling): most at middling heat.
    const ember = f => Math.max(0, Math.min(1, f * 1.6)) * (1 - light(f));

    // The strand, in CSS px, as a path of cup hooks with the wire hanging in
    // swags between them and a bulb every `spacing` widths along it; at the
    // end the wire drops off the last hook into a short tail: the last bulb,
    // then the end plug. Routes: 'rail' hangs along the picture rail at the
    // top (and, with `rows`, snakes back and forth down the wall, dropping
    // down one side and then the other); 'border' goes up one side, along
    // the rail, down the other side and back along the bottom; 'arch' goes
    // up, across and down, like a doorway. Built for the end on the right;
    // `end: 'left'` mirrors it (mx). A swag droops by its horizontal span
    // (a vertical run hangs straight); a bulb hangs straight down from its
    // anchor, turned a little with the wire's slope.
    function layout(W, H, o = {}) {
        const top = o.top || 0, bottom = o.bottom || 0;
        const size = o.size ?? 1, spacing = o.spacing ?? 3.6, sag = o.sag ?? 0.5, route = o.route || 'rail', rows = Math.max(1, Math.round(o.rows ?? 1)), hookEvery = Math.max(1, Math.round(o.hookEvery ?? 2));
        const w = size * Math.max(12, Math.min(28, Math.sqrt(W * H) / 40));      // a bulb's width
        const s = w * spacing;                                                   // bulb to bulb
        const rail = Math.max(6, w * 0.55);                                      // the picture rail's depth
        const railY = top + rail + w * 0.45;                                     // the rail's hooks
        const floorY = H - bottom - w * 3.3 - sag * 0.1 * hookEvery * s;        // a wire along the bottom: its bulbs (a glass is 3 widths tall, plus the swag) above the inset
        const sideX = w * 1.1;                                                   // the side runs' hooks, in from the edge
        const margin = 1.35 * s;                                                 // the end hook, in from the edge
        // The corners the wire turns at, in order, from off-screen to the end hook.
        const corners = [];
        if (route === 'border') {
            corners.push({ x: sideX, y: H + 2 * s }, { x: sideX, y: railY }, { x: W - sideX, y: railY }, { x: W - sideX, y: Math.min(floorY, H - bottom - w) }, { x: Math.max(sideX + s, margin), y: Math.min(floorY, H - bottom - w) });
        } else if (route === 'arch') {
            corners.push({ x: sideX, y: H + 2 * s }, { x: sideX, y: railY }, { x: W - sideX, y: railY }, { x: W - sideX, y: Math.max(railY + 2 * s, H - bottom - w * 4.5) });
        } else {
            // Rows: the first from off the left, each later one the other way,
            // dropped down one side; the last ends at the right margin.
            const span = Math.max(0, floorY - railY), gap = rows > 1 ? Math.min(span / (rows - 1), Math.max(3 * s, w * 6)) : 0;
            const startLeft = rows % 2 === 1;
            let y = railY;
            for (let r = 0; r < rows; r++) {
                const goingRight = startLeft ? r % 2 === 0 : r % 2 === 1;
                const last = r === rows - 1;
                const from = goingRight ? (r ? sideX : -3 * s) : (r ? W - sideX : W + 3 * s);
                const to = last ? (goingRight ? W - margin : margin) : (goingRight ? W - sideX : sideX);
                if (!r) corners.push({ x: from, y });
                corners.push({ x: to, y });
                if (!last) { y += gap; corners.push({ x: to, y }); }
            }
        }
        // Hooks along each straight run, every `hookEvery` bulbs, the corners always.
        const hooks = [corners[0]];
        for (let i = 1; i < corners.length; i++) {
            const A = corners[i - 1], B = corners[i], len = Math.hypot(B.x - A.x, B.y - A.y), step = hookEvery * s;
            const n = Math.max(1, Math.ceil(len / step - 1e-9));
            for (let k = 1; k <= n; k++) hooks.push({ x: A.x + (B.x - A.x) * k / n, y: A.y + (B.y - A.y) * k / n });
        }
        const endHook = hooks[hooks.length - 1];
        // Swags: between hooks, drooping by the span; bulbs along them.
        const swags = [];
        for (let i = 1; i < hooks.length; i++) {
            const A = hooks[i - 1], B = hooks[i];
            swags.push({ A, B, d: sag * 0.2 * Math.abs(B.x - A.x), len: Math.hypot(B.x - A.x, B.y - A.y) });
        }
        const total = swags.reduce((t, sw) => t + sw.len, 0);
        const bulbs = [];
        let along = 0, nextAt = s * 0.5;
        for (const sw of swags) {
            while (nextAt <= along + sw.len) {
                const t = (nextAt - along) / sw.len;
                const p = swagPoint(sw, t), slope = swagSlope(sw, t);
                bulbs.push({ x: p.x, y: p.y, rest: Math.atan(slope) * 0.6, u: nextAt / total });
                nextAt += s;
            }
            along += sw.len;
        }
        // The last swag may be too short for a bulb at the very end: never a
        // bulb within half a spacing of the end hook, where the tail hangs.
        while (bulbs.length && Math.hypot(bulbs[bulbs.length - 1].x - endHook.x, bulbs[bulbs.length - 1].y - endHook.y) < 0.45 * s) bulbs.pop();
        // The lead-in runs off the screen: bulbs out there are never seen.
        const seen = bulbs.filter(b => b.x > -0.8 * s && b.x < W + 0.8 * s && b.y > -3 * w && b.y < H + 2 * w);
        bulbs.length = 0; bulbs.push(...seen);
        const tail = w * (2.4 + sag * 1.6);
        const L = { W, H, w, s, rail, top, railY, hookY: endHook.y, lastHook: endHook.x, sag: sag * 0.4 * s, hooks, swags, corners, bulbs, tail, rest: 0.45, mirror: o.end === 'left', route, rows, total };
        L.lastIndex = bulbs.length;
        // Where the light reaches on the wall, and the region the last bulb's
        // light can change.
        L.reach = w * 7 * (o.glow ?? 1);
        return L;
    }
    // A point on a swag, t from its first hook to its second: a straight
    // line with a quadratic droop (the wire's own weight).
    function swagPoint(sw, t) {
        return { x: sw.A.x + (sw.B.x - sw.A.x) * t, y: sw.A.y + (sw.B.y - sw.A.y) * t + 4 * sw.d * t * (1 - t) };
    }
    // dy/dx of the wire there (a vertical run counts as level: its bulbs hang straight).
    function swagSlope(sw, t) {
        const dx = sw.B.x - sw.A.x;
        if (Math.abs(dx) < 1e-6) return 0;
        return ((sw.B.y - sw.A.y) + 4 * sw.d * (1 - 2 * t)) / dx;
    }
    // Which bulbs twinkle: n of them, spread along the strand, never the
    // first (half off-screen) nor those on the tail.
    function twinklers(count, n) {
        const out = [];
        if (count < 2 || n <= 0) return out;
        for (let k = 0; k < Math.min(n, count - 1); k++) out.push(1 + Math.floor(((k + 0.5) * (count - 1)) / Math.min(n, count - 1)));
        return [...new Set(out)];
    }
    // A twinkle bulb (a bimetal strip in its base): on for a second or three,
    // off for a blink, over and over.
    const twinkle = rand => [[0, 0.22 + rand() * 0.3], [1, 0.9 + rand() * 2.2]];
    // x as drawn: the right-handed layout, mirrored for an end on the left.
    const mx = (L, x) => L.mirror ? L.W - x : x;

    // The tail at angle a (from straight down, toward the open end): the
    // last socket's top, the curve's control point, and the end plug.
    function tail(L, a) {
        const hx = L.lastHook, hy = L.hookY;
        const P = { x: hx + L.tail * Math.sin(a), y: hy + L.tail * Math.cos(a) };
        const C = { x: P.x, y: hy + L.tail * 0.15 };
        const b = a * 1.1;
        const Q = { x: P.x + L.w * (0.85 * Math.cos(b) + 1.5 * Math.sin(b)), y: P.y + L.w * (1.5 * Math.cos(b) - 0.85 * Math.sin(b)) };
        return { P, C, Q };
    }

    // Christmas Eve from five in the evening, and Christmas Day: it lights
    // first time and stays lit.
    function christmasEve(d) {
        if (d.getMonth() !== 11) return false;
        return (d.getDate() === 24 && d.getHours() >= 17) || d.getDate() === 25;
    }

    // Mean seconds between whole-strand outages; between drafts.
    const OUTAGES = { off: Infinity, rare: 25 * 60, sometimes: 8 * 60 };
    const draftEvery = draft => draft <= 0 ? Infinity : 600 / (draft * 12);

    return { PALETTES, NAMED, colours, lastColour, attempt, quit, dip, outage, play, filament, light, ember, layout, swagPoint, swagSlope, twinklers, twinkle, mx, tail, christmasEve, OUTAGES, draftEvery };
})();
