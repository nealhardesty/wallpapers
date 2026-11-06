// A Very Small Christmas (SPEC §10.30): the pure parts. The palettes (a
// full-colour night, and three four-shade screens the night is mapped onto
// by brightness), the blink patterns, the toy train's oval, the tree's hops,
// and the special days. No DOM in here: the unit tests run this file in a
// Node vm.

const SmallXmasLogic = (() => {
    // The full-colour night. Every other palette is this, by brightness.
    const NIGHT = {
        sky: '#0b1026', sky2: '#151a3d', star: '#f6f3d8', starDim: '#5d6294', moon: '#f3e7b5', moonDark: '#b9ab78',
        snow: '#e8eef8', snowShade: '#a9b7d9', snowDeep: '#7884b5',
        treeDark: '#0e3a2b', tree: '#1f6b3d', treeLight: '#41a650', trunk: '#6b3e1f', pot: '#b3262f', potLight: '#e3545e',
        gold: '#f2c14e', goldDark: '#a8792a', starGold: '#ffe066', white: '#ffffff',
        red: '#c8323a', redDark: '#7a1a22', black: '#1b1b24', blue: '#3d5ad6', grey: '#5d5f70', tie: '#6b4a2b', smoke: '#d7dce8', smokeDim: '#8a90ad',
        bulbs: ['#ff4d4d', '#4dff88', '#4da3ff', '#ffd24d', '#ff7ae0'],
        presents: ['#d93a3a', '#3a7fd9', '#3ab36b', '#e0a03a', '#a64dd9'],
        bulbOff: '#26302e',
    };
    // Four-shade screens, darkest first.
    const RAMPS = {
        pocket: ['#1c2a1c', '#3b5a32', '#7fa04a', '#d0e09a'],
        amber: ['#140a00', '#5a2e00', '#b56a00', '#ffb841'],
        ink: ['#101012', '#55565c', '#a6a7ad', '#f4f4f0'],
    };
    const LIGHTS = {
        classic: NIGHT.bulbs,
        warm: ['#ffd27a', '#ffb84d', '#ffe6a8'],
        blue: ['#6fb6ff', '#a8d8ff', '#4d7dff'],
        candy: ['#ff4d4d', '#ffffff'],
    };

    const lum = hex => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255; };
    // A colour on a four-shade ramp: by brightness, with the cut-offs set so
    // the night's sky is the darkest shade and snow the lightest.
    const shade = (hex, ramp) => { const l = lum(hex); return ramp[l < 0.16 ? 0 : l < 0.4 ? 1 : l < 0.7 ? 2 : 3]; };

    // The palette to draw with: the night (with the chosen lights), or the
    // night mapped onto a ramp. Lights on a ramp blink between its two
    // brightest shades, so they still read.
    function palette(name, lights = 'classic') {
        const base = { ...NIGHT, bulbs: LIGHTS[lights] || LIGHTS.classic };
        const ramp = RAMPS[name];
        if (!ramp) return base;
        const out = {};
        for (const [k, v] of Object.entries(base)) out[k] = Array.isArray(v) ? v.map(c => shade(c, ramp)) : shade(v, ramp);
        out.bulbs = [ramp[3]];
        out.bulbOff = ramp[1];
        out.sky = ramp[0]; out.sky2 = ramp[0];
        return out;
    }

    // ---- Blinking ----------------------------------------------------------------------------

    const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    const PATTERNS = ['twinkle', 'chase', 'alternate', 'together', 'steady'];
    // Is bulb i (of n) on at time t, in this pattern?
    function lit(pattern, i, n, t) {
        switch (pattern) {
            case 'steady': return true;
            case 'together': return Math.floor(t * 1.1) % 2 === 0;
            case 'alternate': return (i + Math.floor(t * 1.4)) % 2 === 0;
            case 'chase': return (i + Math.floor(t * 5)) % 3 !== 0;
            default: return hash(i, Math.floor(t * 1.6 + hash(i, 7) * 5)) > 0.32;      // twinkle
        }
    }

    // ---- The train's oval --------------------------------------------------------------------

    // The track round the tree: an ellipse on the floor, with a table of
    // distance along it so the cars keep their spacing on the bends.
    function oval(rx, ry, n = 240) {
        const pts = [];
        let s = 0;
        for (let i = 0; i <= n; i++) {
            const a = -Math.PI / 2 + i / n * Math.PI * 2;      // from the back, round the front
            const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
            if (i) s += Math.hypot(x - pts[i - 1].x, y - pts[i - 1].y);
            pts.push({ x, y, s });
        }
        return { rx, ry, pts, length: s };
    }
    // Where on the oval distance s is (wrapping), and which way it's heading.
    function along(o, s) {
        s = ((s % o.length) + o.length) % o.length;
        const pts = o.pts;
        let lo = 0, hi = pts.length - 1;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; pts[m].s <= s ? lo = m : hi = m; }
        const a = pts[lo], b = pts[hi], k = (s - a.s) / Math.max(1e-9, b.s - a.s);
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, dir: b.x >= a.x ? 1 : -1 };
    }

    // ---- Moving house --------------------------------------------------------------------------

    // The hops from one place to another: each about `step` px, landing
    // exactly on the target.
    function hops(from, to, step = 7) {
        const n = Math.max(1, Math.round(Math.abs(to - from) / step));
        return Array.from({ length: n }, (_, i) => Math.round(from + (to - from) * (i + 1) / n));
    }
    // A hop's height and squash at k (0…1) of it.
    const hop = (k, h = 4) => ({ y: -Math.round(Math.sin(Math.PI * Math.min(1, k)) * h) || 0, squash: k > 0.85 ? 1 : 0 });

    // Somewhere new along the floor for the tree, not too near where it is.
    function newSpot(width, margin, now, rand) {
        const lo = margin, hi = width - margin;
        if (hi <= lo) return Math.round(width / 2);
        for (let i = 0; i < 12; i++) {
            const x = Math.round(lo + rand() * (hi - lo));
            if (Math.abs(x - now) > (hi - lo) * 0.25) return x;
        }
        return Math.round(now < width / 2 ? hi - rand() * (hi - lo) * 0.2 : lo + rand() * (hi - lo) * 0.2);
    }

    // ---- Special days --------------------------------------------------------------------------

    // Christmas Eve (from dusk) and the night after: the sleigh is about.
    const sleighNight = d => d.getMonth() === 11 && ((d.getDate() === 24 && d.getHours() >= 17) || (d.getDate() === 25 && d.getHours() < 6));
    // Christmas morning on: more presents under the tree.
    const christmasDay = d => d.getMonth() === 11 && d.getDate() === 25;

    return { NIGHT, RAMPS, LIGHTS, palette, shade, lum, PATTERNS, lit, hash, oval, along, hops, hop, newSpot, sleighNight, christmasDay };
})();
