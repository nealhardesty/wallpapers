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

    // The strand along the top edge, in CSS px. It comes in off one side,
    // hangs in shallow swags from cup hooks every two bulbs, and at the far
    // end the wire drops off the last hook into a short tail: the last
    // bulb, then the end plug. Built for the end on the right; `end: 'left'`
    // mirrors it.
    function layout(W, H, o = {}) {
        const top = o.top || 0;
        const size = o.size ?? 1, spacing = o.spacing ?? 3.6, sag = o.sag ?? 0.5;
        const w = size * Math.max(12, Math.min(28, Math.sqrt(W * H) / 40));      // a bulb's width
        const s = w * spacing;                                                   // bulb to bulb
        const rail = Math.max(6, w * 0.55);                                      // the picture rail's depth
        const hookY = top + rail + w * 0.45;
        const d = sag * 2 * s * 0.2;                                             // a swag's depth
        const lastHook = W - 1.35 * s;
        const hooks = [];
        for (let x = lastHook; x > -3 * s; x -= 2 * s) hooks.unshift(x);
        const swagY = x => {
            // The swag that holds x, and how far along it.
            const i = Math.max(0, Math.min(hooks.length - 2, Math.floor((x - hooks[0]) / (2 * s))));
            const t = (x - hooks[i]) / (2 * s);
            return { y: hookY + 4 * d * t * (1 - t), slope: 4 * d * (1 - 2 * t) / (2 * s) };
        };
        const bulbs = [];
        for (let x = lastHook - 0.5 * s; x > -0.7 * s; x -= s) {
            const { y, slope } = swagY(x);
            bulbs.unshift({ x, y, rest: Math.atan(slope) * 0.6 });
        }
        const tail = w * (2.4 + sag * 1.6);
        const L = { W, H, w, s, rail, top, hookY, sag: d, hooks, bulbs, lastHook, tail, rest: 0.45, mirror: o.end === 'left' };
        L.lastIndex = bulbs.length;
        // Where the light reaches on the wall, and the region the last bulb's
        // light can change.
        L.reach = w * 7;
        return L;
    }
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

    return { PALETTES, NAMED, colours, lastColour, attempt, quit, dip, outage, play, filament, light, ember, layout, mx, tail, christmasEve, OUTAGES, draftEvery };
})();
