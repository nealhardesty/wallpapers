// The Orrery's baked art: every sprite and static layer, drawn once in code
// and reused (SPEC §4.8). Planets as shaded spheres lit from +x (the drawer
// turns each to face the Sun), seen from above the ecliptic, so the giants'
// bands are rings round the pole; the Sun's corona; ivory and brass balls;
// toothed gear wheels; the starfield, the parchment and the walnut base.
// Seeded, so a rebuild draws the same sky.

const OrreryArt = (() => {
    'use strict';

    const TAU = Math.PI * 2;
    const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
    const SERIF = 'ui-serif, "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';
    // Planet and zodiac glyphs, as text (with U+FE0E where a glyph has an
    // emoji form), from the fonts that have them.
    const SYMBOLS = '"Segoe UI Symbol", "Apple Symbols", "Noto Sans Symbols", "Noto Sans Symbols 2", "DejaVu Sans", FreeSerif, serif';
    const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
    const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    const css = ([r, g, b], a = 1) => `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
    const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
    const shade = (hex, t) => css(mix(rgb(hex), t > 0 ? [255, 255, 255] : [0, 0, 0], Math.abs(t)));

    function canvas(w, h) {
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w));
        c.height = Math.max(1, Math.round(h));
        return c;
    }

    // mulberry32: a small seeded generator, independent of Math.random.
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

    function radial(g, x, y, r, stops) {
        const gradient = g.createRadialGradient(x, y, 0, x, y, r);
        for (const [at, colour] of stops) gradient.addColorStop(at, colour);
        return gradient;
    }

    // A soft round glow, `size` px across.
    function glow(size, stops) {
        const c = canvas(size, size), g = c.getContext('2d');
        g.fillStyle = radial(g, size / 2, size / 2, size / 2, stops);
        g.fillRect(0, 0, size, size);
        return c;
    }

    // ---- Planets ----------------------------------------------------------------

    // The surface, seen from over its north pole, filling a disc of radius r
    // at (c, c). Rotation-invariant enough that turning it to the Sun looks
    // right.
    function surface(g, id, colour, c, r) {
        const rand = random(id.length * 977 + id.charCodeAt(0));
        g.fillStyle = colour;
        g.fillRect(0, 0, 2 * c, 2 * c);
        const ring = (from, to, fill) => {
            g.beginPath();
            g.arc(c, c, to * r, 0, TAU);
            if (from > 0) g.arc(c, c, from * r, 0, TAU, true);
            g.fillStyle = fill;
            g.fill('evenodd');
        };
        const blob = (x, y, rr, fill) => { g.beginPath(); g.arc(c + x * r, c + y * r, rr * r, 0, TAU); g.fillStyle = fill; g.fill(); };
        const spots = (n, size, fill) => {
            for (let i = 0; i < n; i++) {
                const a = rand() * TAU, d = Math.sqrt(rand()) * 0.9;
                blob(Math.cos(a) * d, Math.sin(a) * d, size * (0.4 + rand()), fill);
            }
        };
        switch (id) {
            case 'jupiter':
                [[0.0, 0.24, '#e8d6b6'], [0.32, 0.44, '#c49a72'], [0.52, 0.62, '#e6d2b0'], [0.68, 0.8, '#bb8d64'], [0.86, 0.93, '#dcc4a0']]
                    .forEach(([a, b, f]) => ring(a, b, f));
                blob(0.55, 0.38, 0.11, '#c0583a');
                break;
            case 'saturn':
                [[0, 0.18, '#d9c08a'], [0.34, 0.5, '#efdcaa'], [0.62, 0.76, '#cdb07a'], [0.86, 1, '#e8d3a0']].forEach(([a, b, f]) => ring(a, b, f));
                break;
            case 'earth':
                spots(7, 0.2, '#3d8a4e');
                spots(4, 0.13, '#a88a5a');
                spots(9, 0.09, 'rgba(255,255,255,0.75)');
                blob(0, 0, 0.3, '#f4f8ff');
                break;
            case 'mars':
                spots(7, 0.16, '#8e3f22');
                spots(4, 0.1, '#e0905e');
                blob(0, 0, 0.2, '#f6efe8');
                break;
            case 'venus':
                [[0.2, 0.36, '#f3e1b4'], [0.55, 0.7, '#d6ba82'], [0.8, 0.9, '#f0dcab']].forEach(([a, b, f]) => ring(a, b, f));
                break;
            case 'uranus':
                ring(0, 0.32, '#bfeaee');
                break;
            case 'neptune':
                ring(0.45, 0.62, '#3b5bc0');
                blob(-0.42, 0.3, 0.12, '#24388a');
                break;
            case 'pluto':
                spots(5, 0.16, '#8f7863');
                blob(0.25, 0.1, 0.32, '#efe1cc');
                break;
            default:   // mercury, the moon: craters
                spots(10, 0.1, 'rgba(60,58,54,0.35)');
                spots(6, 0.07, 'rgba(255,255,255,0.18)');
        }
    }

    // A planet lit from +x, half in shadow, as seen from above (a top view
    // always sees a planet at quadrature from the Sun). `px` is the
    // radius in device px. style 'space': the terminator and the dark side;
    // style 'ivory': an ivory ball under a lamp up and to the left (drawn
    // unrotated); style 'ink': unused.
    function sphere(id, colour, px, style = 'space') {
        const pad = 2, c = px + pad, size = 2 * c;
        const out = canvas(size, size), g = out.getContext('2d');
        g.save();
        g.beginPath();
        g.arc(c, c, px, 0, TAU);
        g.clip();
        if (style === 'ivory') {
            const tint = mix([243, 234, 210], rgb(colour), id === 'earth' || id === 'mars' || id === 'neptune' ? 0.32 : 0.16);
            g.fillStyle = radial(g, c - 0.35 * px, c - 0.4 * px, 1.5 * px, [[0, '#fffdf6'], [0.25, css(tint)], [0.75, css(mix(tint, [70, 50, 28], 0.45))], [1, css(mix(tint, [30, 20, 10], 0.8))]]);
            g.fillRect(0, 0, size, size);
            g.fillStyle = radial(g, c - 0.38 * px, c - 0.42 * px, 0.35 * px, [[0, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']]);
            g.fillRect(0, 0, size, size);
        } else if (style === 'brass') {
            g.fillStyle = radial(g, c - 0.35 * px, c - 0.4 * px, 1.6 * px, [[0, '#fff7d6'], [0.18, '#f4d27a'], [0.55, '#b9822e'], [0.85, '#5e3a10'], [1, '#2c1a06']]);
            g.fillRect(0, 0, size, size);
            g.fillStyle = radial(g, c - 0.36 * px, c - 0.42 * px, 0.3 * px, [[0, 'rgba(255,255,255,0.95)'], [1, 'rgba(255,255,255,0)']]);
            g.fillRect(0, 0, size, size);
        } else {
            surface(g, id, colour, c, px);
            // The night side, a soft terminator, and a little limb darkening.
            const night = g.createLinearGradient(c + 0.18 * px, 0, c - 0.32 * px, 0);
            night.addColorStop(0, 'rgba(2,3,8,0)');
            night.addColorStop(1, 'rgba(2,3,8,0.93)');
            g.fillStyle = night;
            g.fillRect(0, 0, size, size);
            g.fillStyle = radial(g, c, c, px, [[0, 'rgba(0,0,0,0)'], [0.7, 'rgba(0,0,0,0.05)'], [1, 'rgba(0,0,0,0.4)']]);
            g.fillRect(0, 0, size, size);
            g.fillStyle = radial(g, c + 0.45 * px, c, 0.7 * px, [[0, 'rgba(255,255,255,0.22)'], [1, 'rgba(255,255,255,0)']]);
            g.fillRect(0, 0, size, size);
        }
        g.restore();
        return out;
    }

    // ---- The Sun ------------------------------------------------------------------

    // The corona: a hot core fading through gold to nothing, `size` px
    // across, the photosphere at about a tenth of it.
    const corona = size => glow(size, [[0, 'rgba(255,253,240,1)'], [0.09, 'rgba(255,244,210,1)'], [0.11, 'rgba(255,214,130,0.75)'],
        [0.2, 'rgba(255,170,70,0.3)'], [0.45, 'rgba(255,130,40,0.08)'], [1, 'rgba(255,110,30,0)']]);

    // Streamers: faint long rays, turned slowly against each other for the
    // shimmer.
    function rays(size, seed) {
        const c = canvas(size, size), g = c.getContext('2d'), rand = random(seed), h = size / 2;
        g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 26; i++) {
            const a = rand() * TAU, len = h * (0.35 + rand() * 0.6), w = 0.04 + rand() * 0.07;
            const grad = g.createRadialGradient(h, h, h * 0.08, h, h, len);
            grad.addColorStop(0, `rgba(255,210,140,${0.10 + rand() * 0.12})`);
            grad.addColorStop(1, 'rgba(255,170,80,0)');
            g.fillStyle = grad;
            g.beginPath();
            g.moveTo(h, h);
            g.arc(h, h, len, a - w, a + w);
            g.closePath();
            g.fill();
        }
        return c;
    }

    // The photosphere: a disc with limb darkening and a few faculae.
    function sunDisc(px) {
        const c = px + 2, out = canvas(2 * c, 2 * c), g = out.getContext('2d');
        g.fillStyle = radial(g, c, c, px, [[0, '#fffbea'], [0.6, '#ffe7a6'], [0.9, '#ffbf5c'], [1, '#f0902e']]);
        g.beginPath();
        g.arc(c, c, px, 0, TAU);
        g.fill();
        return out;
    }

    // ---- Gears --------------------------------------------------------------------

    // A brass wheel: `teeth` trapezoid teeth round radius px (device px),
    // with spokes cut out. Concentric shading, so turning it looks right.
    const TONES = {
        brass: [[0, '#f3d384'], [0.5, '#c9973f'], [0.85, '#9a6a24'], [1, '#6e4714']],
        bronze: [[0, '#d9a46a'], [0.5, '#a8703a'], [0.85, '#7a4c22'], [1, '#4e2e12']],
        steel: [[0, '#e6e4dc'], [0.5, '#a9a69c'], [0.85, '#76736a'], [1, '#4a4840']],
    };
    function gear(teeth, px, spokes = 5, tone = 'brass') {
        const c = Math.ceil(px * 1.08) + 2, out = canvas(2 * c, 2 * c), g = out.getContext('2d');
        const depth = Math.min(px * 0.14, Math.max(2, TAU * px / teeth * 0.45)), root = px - depth;
        g.beginPath();
        for (let i = 0; i < teeth; i++) {
            const a = i * TAU / teeth, s = TAU / teeth;
            const pts = [[root, a], [px, a + s * 0.2], [px, a + s * 0.45], [root, a + s * 0.65]];
            for (const [r, t] of pts) g.lineTo(c + r * Math.cos(t), c + r * Math.sin(t));
        }
        g.closePath();
        g.fillStyle = radial(g, c, c, px, TONES[tone] || TONES.brass);
        g.fill();
        g.strokeStyle = 'rgba(40,24,6,0.7)';
        g.lineWidth = Math.max(0.8, px * 0.02);
        g.stroke();
        // The windows between the spokes.
        if (px > 10 && spokes) {
            g.save();
            g.globalCompositeOperation = 'destination-out';
            const r0 = root * 0.32, r1 = root * 0.78, half = TAU / spokes / 2 - Math.min(0.35, 0.18 * 30 / px);
            for (let i = 0; i < spokes; i++) {
                const a = i * TAU / spokes + TAU / spokes / 2;
                g.beginPath();
                g.arc(c, c, r1, a - half, a + half);
                g.arc(c, c, r0, a + half * 0.7, a - half * 0.7, true);
                g.closePath();
                g.fill();
            }
            g.restore();
        }
        // The rim and the hub, engraved.
        g.strokeStyle = 'rgba(255,236,180,0.35)';
        g.lineWidth = Math.max(0.6, px * 0.015);
        g.beginPath(); g.arc(c, c, root * 0.84, 0, TAU); g.stroke();
        g.fillStyle = radial(g, c, c, root * 0.3, [[0, '#ffe9a8'], [0.7, '#b8862f'], [1, '#5a3a10']]);
        g.beginPath(); g.arc(c, c, root * 0.3, 0, TAU); g.fill();
        return out;
    }

    // ---- Backgrounds --------------------------------------------------------------

    // Deep space: a dark gradient, a faint Milky Way band, and seeded stars
    // (count × density), with a few bright ones glinting. W, H in device px.
    function starfield(W, H, count, dpr) {
        const out = canvas(W, H), g = out.getContext('2d'), rand = random(4242);
        g.fillStyle = radial(g, W * 0.5, H * 0.45, Math.hypot(W, H) * 0.6, [[0, '#0a0f20'], [0.55, '#060914'], [1, '#03040a']]);
        g.fillRect(0, 0, W, H);
        // The Milky Way: soft blobs along a diagonal, then dust lanes.
        const band = (t, off) => [W * t, H * (0.85 - 0.7 * t) + off];
        const blob = glow(64, [[0, 'rgba(150,160,210,0.16)'], [1, 'rgba(150,160,210,0)']]);
        for (let i = 0; i < 220; i++) {
            const t = rand(), spread = (rand() - 0.5) * (rand() - 0.5) * H * 0.9;
            const [x, y] = band(t, spread), s = (40 + rand() * 160) * dpr;
            g.globalAlpha = 0.35 + rand() * 0.5;
            g.drawImage(blob, x - s / 2, y - s / 2, s, s);
        }
        g.globalAlpha = 1;
        const tints = ['#ffffff', '#dfe8ff', '#fff2dc', '#ffe0c0', '#cad8ff'];
        for (let i = 0; i < count; i++) {
            const inBand = rand() < 0.45;
            let x, y;
            if (inBand) [x, y] = band(rand(), (rand() - 0.5) * (rand() - 0.5) * H * 0.7);
            else { x = rand() * W; y = rand() * H; }
            const mag = rand() ** 3;
            g.globalAlpha = 0.25 + mag * 0.75;
            g.fillStyle = tints[Math.floor(rand() * tints.length)];
            const s = (0.5 + mag * 1.3) * dpr;
            g.beginPath();
            g.arc(x, y, s, 0, TAU);
            g.fill();
            if (mag > 0.85) {
                g.globalAlpha = 0.35;
                g.fillRect(x - 4 * s, y - 0.25 * dpr, 8 * s, 0.5 * dpr);
                g.fillRect(x - 0.25 * dpr, y - 4 * s, 0.5 * dpr, 8 * s);
            }
        }
        g.globalAlpha = 1;
        return out;
    }

    // An old chart's paper: parchment (warm, foxed, fibrous) or night (deep
    // blue, faint stars), with a ruled double border.
    function paper(W, H, dpr, palette) {
        const out = canvas(W, H), g = out.getContext('2d'), rand = random(1789);
        const night = palette === 'night';
        g.fillStyle = radial(g, W * 0.5, H * 0.48, Math.hypot(W, H) * 0.62,
            night ? [[0, '#14233a'], [0.6, '#0e1a2c'], [1, '#070d18']] : [[0, '#f7eed8'], [0.55, '#efe1c1'], [0.9, '#dcc495'], [1, '#c9ab76']]);
        g.fillRect(0, 0, W, H);
        // Stains and foxing.
        for (let i = 0; i < 46; i++) {
            const x = rand() * W, y = rand() * H, r = (20 + rand() * 140) * dpr;
            g.fillStyle = radial(g, x, y, r, night ? [[0, 'rgba(60,90,140,0.07)'], [1, 'rgba(60,90,140,0)']] : [[0, 'rgba(150,104,50,0.07)'], [1, 'rgba(150,104,50,0)']]);
            g.fillRect(x - r, y - r, 2 * r, 2 * r);
        }
        if (!night) {
            for (let i = 0; i < 90; i++) {
                g.fillStyle = `rgba(140,90,40,${0.05 + rand() * 0.12})`;
                g.beginPath();
                g.arc(rand() * W, rand() * H, (0.5 + rand() * 1.8) * dpr, 0, TAU);
                g.fill();
            }
        }
        // Fibres.
        g.lineWidth = 0.6 * dpr;
        for (let i = 0; i < 900; i++) {
            const x = rand() * W, y = rand() * H, a = rand() * TAU, l = (4 + rand() * 14) * dpr;
            g.strokeStyle = night ? `rgba(160,190,230,${rand() * 0.05})` : `rgba(120,80,40,${rand() * 0.06})`;
            g.beginPath();
            g.moveTo(x, y);
            g.quadraticCurveTo(x + Math.cos(a + 0.5) * l * 0.5, y + Math.sin(a + 0.5) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
            g.stroke();
        }
        if (night) {
            for (let i = 0; i < 260; i++) {
                g.fillStyle = `rgba(214,226,242,${0.15 + rand() * 0.45})`;
                g.beginPath();
                g.arc(rand() * W, rand() * H, (0.4 + rand() ** 3 * 1.2) * dpr, 0, TAU);
                g.fill();
            }
        }
        return out;
    }

    // The brass look's study: a dark warm room under a lamp up and to the
    // left.
    function study(W, H) {
        const out = canvas(W, H), g = out.getContext('2d');
        g.fillStyle = radial(g, W * 0.32, H * 0.22, Math.hypot(W, H) * 0.85, [[0, '#33210f'], [0.35, '#1d130a'], [0.75, '#0d0805'], [1, '#050302']]);
        g.fillRect(0, 0, W, H);
        const rand = random(77);
        for (let i = 0; i < 1400; i++) {
            g.fillStyle = `rgba(${rand() < 0.5 ? '255,220,170' : '0,0,0'},${rand() * 0.035})`;
            g.fillRect(rand() * W, rand() * H, 1 + rand() * 2, 1 + rand() * 2);
        }
        return out;
    }

    // A walnut plinth, W × h device px, its brass moulding along the top.
    function walnut(W, h, dpr) {
        const out = canvas(W, h), g = out.getContext('2d'), rand = random(1704);
        const wood = g.createLinearGradient(0, 0, 0, h);
        wood.addColorStop(0, '#6b3e1c');
        wood.addColorStop(0.35, '#4a2911');
        wood.addColorStop(1, '#1e0f06');
        g.fillStyle = wood;
        g.fillRect(0, 0, W, h);
        // Grain: long wavering lines, a few knots.
        for (let i = 0; i < 70; i++) {
            const y0 = rand() * h, amp = (1 + rand() * 4) * dpr, f = 0.002 + rand() * 0.006, p = rand() * TAU;
            g.strokeStyle = rand() < 0.6 ? `rgba(20,8,2,${0.12 + rand() * 0.2})` : `rgba(160,100,50,${0.06 + rand() * 0.1})`;
            g.lineWidth = (0.5 + rand() * 1.4) * dpr;
            g.beginPath();
            for (let x = 0; x <= W + 12 * dpr; x += 12 * dpr) g.lineTo(x, y0 + Math.sin(x * f / dpr + p) * amp + Math.sin(x * f * 3.1 / dpr) * amp * 0.3);
            g.stroke();
        }
        // The moulding.
        const m = Math.max(3, 5 * dpr);
        const brass = g.createLinearGradient(0, 0, 0, m);
        brass.addColorStop(0, '#fff0b8');
        brass.addColorStop(0.4, '#d6a650');
        brass.addColorStop(1, '#6e4714');
        g.fillStyle = brass;
        g.fillRect(0, 0, W, m);
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(0, m, W, 2 * dpr);
        return out;
    }

    return { TAU, SANS, SERIF, SYMBOLS, clamp, smooth, rgb, css, mix, shade, canvas, random, radial, glow, sphere, corona, rays, sunDisc, gear, starfield, paper, study, walnut };
})();
