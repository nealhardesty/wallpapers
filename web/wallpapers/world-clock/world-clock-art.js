// World Clock's shared art: fonts, colours, the sky's colours for a sun
// altitude, small baked glyphs (sun, moon, twilight), and a seeded random
// source, so the stars and the city lights are the same at every rebuild.

const WorldClockArt = (() => {
    'use strict';

    const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
    const SERIF = 'ui-serif, "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';
    const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
    const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    const css = ([r, g, b], a = 1) => `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
    const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

    function canvas(w, h) {
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w));
        c.height = Math.max(1, Math.round(h));
        return c;
    }

    // mulberry32: a small seeded generator.
    function random(seed) {
        let a = seed >>> 0;
        return () => {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // The sky at a sun altitude (degrees): its top and bottom colours, how
    // much the stars show, and whether text on it should be dark.
    const SKY = [
        [-90, '#03060f', '#070d1c'], [-18, '#050a1a', '#0b1630'], [-12, '#0a1533', '#1b2650'],
        [-6, '#1a2a5e', '#56477a'], [-2, '#2b4483', '#d47a62'], [1, '#3f68b0', '#f2a46e'],
        [6, '#4f86cf', '#f5cf9e'], [15, '#4a8fe0', '#b8daf3'], [40, '#3b83de', '#a2d1f5'], [90, '#3379d6', '#95caf2'],
    ].map(([alt, top, bottom]) => [alt, rgb(top), rgb(bottom)]);
    function sky(alt) {
        let i = 1;
        while (i < SKY.length - 1 && SKY[i][0] < alt) i++;
        const [a0, t0, b0] = SKY[i - 1], [a1, t1, b1] = SKY[i];
        const t = clamp((alt - a0) / (a1 - a0), 0, 1);
        const top = mix(t0, t1, t), bottom = mix(b0, b1, t), mid = mix(top, bottom, 0.5);
        const light = (0.2126 * mid[0] + 0.7152 * mid[1] + 0.0722 * mid[2]) / 255;
        return { top, bottom, stars: smooth(-4, -14, alt), dark: light > 0.42 };
    }

    // 'day' above the horizon, 'twilight' to −6°, then 'night'.
    const phase = alt => alt > -0.833 ? 'day' : alt > -6 ? 'twilight' : 'night';

    // A glyph for a phase, baked once per size and colour: a sun with rays,
    // a crescent moon, or the sun half under the horizon.
    const glyphs = new Map();
    function glyph(kind, size, colour) {
        const key = `${kind}|${Math.round(size)}|${colour}`;
        if (glyphs.has(key)) return glyphs.get(key);
        const s = Math.max(4, Math.round(size)), c = canvas(s, s), g = c.getContext('2d');
        const r = s / 2;
        g.fillStyle = g.strokeStyle = colour;
        g.lineCap = 'round';
        if (kind === 'night') {
            g.beginPath();
            g.arc(r, r, r * 0.72, 0, Math.PI * 2);
            g.fill();
            g.globalCompositeOperation = 'destination-out';
            g.beginPath();
            g.arc(r + r * 0.42, r - r * 0.3, r * 0.62, 0, Math.PI * 2);
            g.fill();
        } else {
            const cy = kind === 'twilight' ? r * 1.25 : r;
            g.lineWidth = Math.max(1, s * 0.09);
            const rays = kind === 'twilight' ? [-4, -3, -2, -1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
            for (const i of rays) {
                const a = i * Math.PI / 4 + (kind === 'twilight' ? Math.PI : 0);
                g.beginPath();
                g.moveTo(r + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62);
                g.lineTo(r + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9);
                g.stroke();
            }
            g.beginPath();
            if (kind === 'twilight') g.arc(r, cy, r * 0.42, Math.PI, 0);
            else g.arc(r, cy, r * 0.42, 0, Math.PI * 2);
            g.fill();
            if (kind === 'twilight') g.fillRect(r * 0.1, cy + s * 0.02, s * 0.8, Math.max(1, s * 0.08));
        }
        glyphs.set(key, c);
        return c;
    }

    // The moon's disc in its phase (age 0 new, 0.5 full), lit from the
    // right while it waxes, as the northern hemisphere sees it.
    function moon(g, x, y, r, age, lit = '#eef1f8', dark = 'rgba(44,52,72,0.85)') {
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fillStyle = dark;
        g.fill();
        const k = Math.cos(2 * Math.PI * age);
        g.save();
        g.translate(x, y);
        if (age > 0.5) g.scale(-1, 1);
        g.beginPath();
        g.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
        g.ellipse(0, 0, Math.max(0.01, Math.abs(k) * r), r, 0, Math.PI / 2, -Math.PI / 2, k > 0);
        g.fillStyle = lit;
        g.fill();
        g.restore();
    }

    // A soft round glow, baked: a radial gradient from `colour` at the
    // centre to nothing at the edge.
    function glow(size, stops) {
        const c = canvas(size, size), g = c.getContext('2d'), r = size / 2;
        const gradient = g.createRadialGradient(r, r, 0, r, r, r);
        for (const [at, colour] of stops) gradient.addColorStop(at, colour);
        g.fillStyle = gradient;
        g.fillRect(0, 0, size, size);
        return c;
    }

    // A rounded rectangle path.
    function rounded(g, x, y, w, h, r) {
        g.beginPath();
        g.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
    }

    // The time text split into its digits and the rest ("9:41" and "PM"),
    // so the rest can be set smaller; `before` when the rest comes first.
    function splitTime(text) {
        const m = /\d[\d:.]*\d|\d/.exec(text);
        if (!m) return { main: text, rest: '', before: false };
        const rest = (text.slice(0, m.index) + text.slice(m.index + m[0].length)).trim();
        return { main: m[0], rest, before: m.index > 0 && !!text.slice(0, m.index).trim() };
    }

    return { SANS, SERIF, clamp, smooth, rgb, css, mix, canvas, random, sky, phase, glyph, moon, glow, rounded, splitTime };
})();
