// Weather's pictures, all drawn in code (SPEC §10.2): the little looping
// scene for each kind of weather, the sky's colours, and the ambient layer
// of the weather outside (clouds, rain, snow, fog, lightning, stars).
//
// Cost: every soft or shaded shape (sun, moon, clouds, flakes, fog, glows)
// is baked once into a sprite per size and tone; per frame a scene is a few
// drawImage calls and one or two strokes. The scenes are pure functions of
// time, so they need no state; the ambient layer pools its particles and
// scales them by the tier's density.

const WeatherScenes = (() => {
    'use strict';

    const TAU = Math.PI * 2;
    const frac = x => x - Math.floor(x);
    // A fixed pseudo-random number per (index, salt), so scenes repeat exactly.
    const hash = (i, salt = 0) => frac(Math.sin(i * 127.1 + salt * 311.7) * 43758.5453);
    const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
    const rgb = (c, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;

    // ---- Sprites ------------------------------------------------------------------

    let dpr = 1;
    const cache = new Map();
    const canvasOf = (w, h) => {
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.ceil(w));
        c.height = Math.max(1, Math.ceil(h));
        return c;
    };
    // Sprites are baked in device pixels, in size steps, so a card of any size
    // reuses a handful of them.
    const step = css => Math.max(8, Math.min(1024, Math.ceil(css * dpr / 16) * 16));
    function sprite(key, px, paint, aspect = 1) {
        const id = `${key}:${px}`;
        let c = cache.get(id);
        if (!c) {
            c = canvasOf(px, px * aspect);
            paint(c.getContext('2d'), c.width, c.height);
            cache.set(id, c);
        }
        return c;
    }
    function setScale(ratio) {
        if (ratio !== dpr) cache.clear();
        dpr = ratio;
    }

    function radial(g, w, h, stops) {
        const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.min(w, h) / 2);
        for (const [at, colour] of stops) r.addColorStop(at, colour);
        g.fillStyle = r;
        g.fillRect(0, 0, w, h);
    }

    const glow = (colour, px) => sprite(`glow-${colour}`, px, (g, w, h) =>
        radial(g, w, h, [[0, `rgba(${colour},0.6)`], [0.35, `rgba(${colour},0.22)`], [1, `rgba(${colour},0)`]]));

    const sunCore = px => sprite('sun', px, (g, w) => {
        const r = g.createRadialGradient(w * 0.42, w * 0.4, 0, w / 2, w / 2, w / 2);
        r.addColorStop(0, '#fffbe0');
        r.addColorStop(0.55, '#ffd84d');
        r.addColorStop(1, '#ffae2b');
        g.fillStyle = r;
        g.beginPath();
        g.arc(w / 2, w / 2, w / 2 - 1, 0, TAU);
        g.fill();
    });

    // A crescent for the night icons, with a few faint maria.
    const crescent = px => sprite('crescent', px, (g, w) => {
        g.fillStyle = '#efeadb';
        g.beginPath();
        g.arc(w / 2, w / 2, w / 2 - 1, 0, TAU);
        g.fill();
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = 'rgba(160,156,140,0.3)';
        for (const [x, y, r] of [[0.35, 0.4, 0.1], [0.3, 0.65, 0.07], [0.5, 0.25, 0.06]]) {
            g.beginPath();
            g.arc(x * w, y * w, r * w, 0, TAU);
            g.fill();
        }
        g.globalCompositeOperation = 'destination-out';
        g.beginPath();
        g.arc(w * 0.78, w * 0.36, w * 0.42, 0, TAU);
        g.fill();
    });

    // The real moon for the night sky: phase 0 new, 0.5 full.
    const moonDisc = (px, phase) => sprite(`moon-${Math.round(phase * 40)}`, px, (g, w) => {
        const r = w / 2 - 1;
        g.translate(w / 2, w / 2);
        g.fillStyle = 'rgba(40,48,70,0.6)';
        g.beginPath();
        g.arc(0, 0, r, 0, TAU);
        g.fill();
        if (phase > 0.5) g.scale(-1, 1);
        const k = Math.cos(phase * TAU);
        g.beginPath();
        g.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
        g.ellipse(0, 0, Math.abs(k) * r, r, 0, Math.PI / 2, -Math.PI / 2, k > 0);
        g.fillStyle = '#ece8da';
        g.fill();
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = 'rgba(150,150,140,0.28)';
        for (const [x, y, m] of [[-0.3, -0.25, 0.28], [0.2, -0.35, 0.2], [0.05, 0.1, 0.25], [-0.15, 0.4, 0.16]]) {
            g.beginPath();
            g.arc(x * r, y * r, m * r, 0, TAU);
            g.fill();
        }
    });

    // Cloud tones: top and underside.
    const TONES = {
        light: ['#ffffff', '#d3deea'], grey: ['#d0d7e0', '#939fae'], dark: ['#8b94a4', '#4d5666'],
        storm: ['#6a7080', '#30353f'], night: ['#8f9cb6', '#525e78'], nightDark: ['#4d5871', '#262d40'],
    };
    const PUFFS = [[0.27, 0.6, 0.2], [0.46, 0.42, 0.26], [0.67, 0.52, 0.22], [0.83, 0.68, 0.14], [0.15, 0.72, 0.13]];
    // A puffy cloud, 1 : 0.62, shaded top to bottom.
    const cloud = (tone, px) => sprite(`cloud-${tone}`, px, (g, w, h) => {
        const [top, bottom] = TONES[tone] || TONES.light;
        g.beginPath();
        for (const [x, y, r] of PUFFS) {
            g.moveTo(x * w + r * w, y * h);
            g.arc(x * w, y * h, r * w, 0, TAU);
        }
        g.roundRect(w * 0.1, h * 0.6, w * 0.8, h * 0.32, h * 0.16);
        const fill = g.createLinearGradient(0, h * 0.1, 0, h * 0.95);
        fill.addColorStop(0, top);
        fill.addColorStop(1, bottom);
        g.fillStyle = fill;
        g.fill();
    }, 0.62);

    // A soft cloud for the sky behind the forecast, 2 : 1: overlapping
    // glows, lit on top and shaded underneath.
    const BLOBS = [[0.2, 0.62, 0.2], [0.36, 0.5, 0.26], [0.55, 0.42, 0.3], [0.73, 0.52, 0.24], [0.86, 0.64, 0.15], [0.45, 0.66, 0.24], [0.66, 0.68, 0.22]];
    const softCloud = tone => sprite(`soft-${tone}`, 256, (g, w, h) => {
        const [top, bottom] = TONES[tone] || TONES.light;
        for (const [x, y, r] of BLOBS) {
            // Inside the canvas, so no glow is cut off square.
            const R = Math.min(r * w, y * h, h - y * h, x * w, w - x * w);
            const blob = g.createRadialGradient(x * w, y * h, 0, x * w, y * h, R);
            blob.addColorStop(0, 'rgba(255,255,255,0.95)');
            blob.addColorStop(0.55, 'rgba(255,255,255,0.7)');
            blob.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = blob;
            g.fillRect(0, 0, w, h);
        }
        g.globalCompositeOperation = 'source-in';
        const fill = g.createLinearGradient(0, h * 0.2, 0, h * 0.85);
        fill.addColorStop(0, top);
        fill.addColorStop(1, bottom);
        g.fillStyle = fill;
        g.fillRect(0, 0, w, h);
    }, 0.62);

    const flake = px => sprite('flake', px, (g, w, h) =>
        radial(g, w, h, [[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.85)'], [1, 'rgba(255,255,255,0)']]));

    // A long soft band of fog, 4 : 1.
    const fogBand = px => sprite('fog', px, (g, w, h) => {
        g.scale(1, h / w);
        radial(g, w, w, [[0, 'rgba(225,230,236,0.75)'], [0.5, 'rgba(220,226,234,0.35)'], [1, 'rgba(220,226,234,0)']]);
    }, 0.25);

    // A dark soft blob for the minimal cards' text to sit on.
    const shade = () => sprite('shade', 64, (g, w, h) =>
        radial(g, w, h, [[0, 'rgba(4,10,22,0.85)'], [0.6, 'rgba(4,10,22,0.45)'], [1, 'rgba(4,10,22,0)']]));

    // ---- Parts of the mini scenes (all in CSS px, s = the square's size) ----------

    function sun(g, x, y, r, t) {
        const halo = r * 3.4;
        g.drawImage(glow('255,214,110', step(halo)), x - halo / 2, y - halo / 2, halo, halo);
        g.save();
        g.translate(x, y);
        g.rotate(t * 0.22);
        g.beginPath();
        for (let i = 0; i < 12; i++) {
            const a = i * TAU / 12, long = i % 2 ? 1.42 : 1.6, w = 0.09;
            g.moveTo(Math.cos(a - w) * r * 1.12, Math.sin(a - w) * r * 1.12);
            g.lineTo(Math.cos(a) * r * long, Math.sin(a) * r * long);
            g.lineTo(Math.cos(a + w) * r * 1.12, Math.sin(a + w) * r * 1.12);
        }
        g.fillStyle = 'rgba(255,206,84,0.9)';
        g.fill();
        g.restore();
        g.drawImage(sunCore(step(r * 2)), x - r, y - r, r * 2, r * 2);
    }

    function moon(g, x, y, r, t, stars = true) {
        const halo = r * 4;
        g.globalAlpha = base * (0.75 + 0.25 * Math.sin(t * 0.7));
        g.drawImage(glow('200,214,255', step(halo)), x - halo / 2, y - halo / 2, halo, halo);
        g.globalAlpha = base;
        g.drawImage(crescent(step(r * 2)), x - r, y - r, r * 2, r * 2);
        if (!stars) return;
        g.fillStyle = '#fffbe8';
        for (let i = 0; i < 4; i++) {
            const a = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * (1.6 + i * 0.4) + i * 2.1));
            const sx = x + [1.5, -1.6, 1.1, -0.9][i] * r, sy = y + [-1.1, -0.6, 1.2, 1.4][i] * r, k = r * [0.16, 0.12, 0.1, 0.13][i];
            g.globalAlpha = base * a;
            g.beginPath();
            g.moveTo(sx, sy - k); g.lineTo(sx + k * 0.25, sy); g.lineTo(sx, sy + k); g.lineTo(sx - k * 0.25, sy);
            g.moveTo(sx - k, sy); g.lineTo(sx, sy - k * 0.25); g.lineTo(sx + k, sy); g.lineTo(sx, sy + k * 0.25);
            g.fill();
        }
        g.globalAlpha = base;
    }

    function puff(g, tone, x, y, w, alpha = 1) {
        g.globalAlpha = base * alpha;
        g.drawImage(cloud(tone, step(w)), x - w / 2, y - w * 0.31, w, w * 0.62);
        g.globalAlpha = base;
    }

    // Falling streaks, lane by lane: each lane's drop restarts at the top
    // when it lands, with a splash where the last one hit.
    function drops(g, s, x, y, o) {
        const { n, x0, x1, top, bottom, len, speed, width, colour, slant = 0.18, t, splash } = o;
        const range = bottom - top;
        g.beginPath();
        const hits = [];
        for (let i = 0; i < n; i++) {
            const p = frac(t * speed / range + hash(i, 1));
            const lane = x + (x0 + (x1 - x0) * (i + 0.5) / n + (hash(i, 2) - 0.5) * (x1 - x0) / n) * s;
            const dy = top + p * range, dx = lane + slant * p * range * s;
            g.moveTo(dx, y + dy * s);
            g.lineTo(dx - slant * len * s, y + (dy - len) * s);
            if (splash && p < 0.14) hits.push([lane + slant * range * s, 1 - p / 0.14]);
        }
        g.strokeStyle = colour;
        g.lineWidth = Math.max(1, width * s);
        g.lineCap = 'round';
        g.stroke();
        if (!hits.length) return;
        g.lineWidth = Math.max(1, width * s * 0.6);
        for (const [hx, a] of hits) {
            g.globalAlpha = base * a;
            const r = (1 - a) * 0.05 * s + 0.015 * s, gy = y + bottom * s;
            g.beginPath();
            g.moveTo(hx - r, gy - r * 0.2);
            g.quadraticCurveTo(hx - r * 0.5, gy - r, hx - r * 0.15, gy - r * 0.15);
            g.moveTo(hx + r, gy - r * 0.2);
            g.quadraticCurveTo(hx + r * 0.5, gy - r, hx + r * 0.15, gy - r * 0.15);
            g.stroke();
        }
        g.globalAlpha = base;
    }

    function flakes(g, s, x, y, o) {
        const { n, x0, x1, top, bottom, size, speed, t } = o;
        const range = bottom - top, img = flake(step(size * s));
        for (let i = 0; i < n; i++) {
            const p = frac(t * speed / range + hash(i, 3));
            const fx = x + (x0 + (x1 - x0) * hash(i, 4)) * s + Math.sin(t * 1.4 + i * 1.7) * 0.03 * s;
            const fy = y + (top + p * range) * s, k = size * s * (0.7 + 0.5 * hash(i, 5));
            g.globalAlpha = base * (p > 0.85 ? (1 - p) / 0.15 : 1);
            g.drawImage(img, fx - k / 2, fy - k / 2, k, k);
        }
        g.globalAlpha = base;
    }

    // Snow building up along the ground, then thawing, on a ten-second loop.
    function drift(g, s, x, y, t, depth) {
        const p = frac(t / 10), grow = Math.min(1, p / 0.8), a = p > 0.85 ? (1 - p) / 0.15 : 1;
        const h = depth * s * (0.3 + 0.7 * grow);
        g.globalAlpha = base * 0.92 * a;
        g.fillStyle = '#f4f8ff';
        g.beginPath();
        g.ellipse(x + 0.5 * s, y + 0.94 * s, 0.36 * s, h, 0, Math.PI, 0);
        g.fill();
        g.globalAlpha = base;
    }

    function bolt(g, s, x, y, t, period, seed) {
        const p = frac(t / period + seed);
        const on = p < 0.05 || (p > 0.09 && p < 0.14);
        if (!on) return 0;
        g.beginPath();
        const pts = [[0.52, 0.5], [0.42, 0.68], [0.52, 0.68], [0.4, 0.92], [0.62, 0.62], [0.51, 0.62], [0.6, 0.5]];
        g.moveTo(x + pts[0][0] * s, y + pts[0][1] * s);
        for (const [px, py] of pts.slice(1)) g.lineTo(x + px * s, y + py * s);
        g.closePath();
        g.fillStyle = '#fff3a6';
        g.fill();
        return 1;
    }

    function hail(g, s, x, y, t) {
        g.fillStyle = '#f2f6ff';
        g.strokeStyle = 'rgba(120,140,170,0.8)';
        g.lineWidth = Math.max(1, s * 0.008);
        for (let i = 0; i < 6; i++) {
            const p = frac(t / 1.5 + hash(i, 6)), hx = x + (0.26 + 0.48 * hash(i, 7)) * s;
            let hy;
            if (p < 0.6) hy = 0.55 + 0.37 * (p / 0.6) ** 2;
            else { const q = (p - 0.6) / 0.4; hy = 0.92 - 0.14 * 4 * q * (1 - q) * (1 - q * 0.5); }
            const r = s * 0.028;
            g.beginPath();
            g.arc(hx + (p > 0.6 ? (p - 0.6) * 0.12 * s : 0), y + hy * s - r, r, 0, TAU);
            g.fill();
            g.stroke();
        }
    }

    function iceTicks(g, s, x, y, t) {
        g.strokeStyle = 'rgba(200,232,255,0.9)';
        g.lineWidth = Math.max(1, s * 0.012);
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(x + 0.22 * s, y + 0.93 * s);
        g.lineTo(x + 0.78 * s, y + 0.93 * s);
        g.stroke();
        for (let i = 0; i < 5; i++) {
            const tx = x + (0.27 + i * 0.115) * s, glint = 0.35 + 0.65 * Math.max(0, Math.sin(t * 2.2 - i * 1.3));
            g.globalAlpha = base * glint;
            g.beginPath();
            g.moveTo(tx, y + 0.93 * s);
            g.lineTo(tx + 0.02 * s, y + 0.885 * s);
            g.moveTo(tx - 0.012 * s, y + 0.905 * s);
            g.lineTo(tx + 0.032 * s, y + 0.905 * s);
            g.stroke();
        }
        g.globalAlpha = base;
    }

    function fogBands(g, s, x, y, t) {
        g.strokeStyle = 'rgba(226,232,240,0.8)';
        g.lineCap = 'round';
        g.lineWidth = Math.max(2, s * 0.055);
        for (let i = 0; i < 4; i++) {
            const dx = Math.sin(t * 0.45 + i * 1.9) * 0.08 * s, yy = y + (0.56 + i * 0.1) * s;
            const w = [0.56, 0.66, 0.5, 0.6][i] * s;
            g.globalAlpha = base * (0.55 + 0.25 * Math.sin(t * 0.6 + i));
            g.beginPath();
            g.moveTo(x + (s - w) / 2 + dx, yy);
            g.lineTo(x + (s + w) / 2 + dx, yy);
            g.stroke();
        }
        g.globalAlpha = base;
    }

    // ---- The scenes ------------------------------------------------------------------
    // One function per kind, into the square (x, y, s), animated by t
    // (seconds). Night swaps the sun for the moon and greys the clouds blue.

    const RAIN = 'rgba(150,200,255,0.95)';
    const SCENES = {
        'clear': (g, s, x, y, t, night) => night ? moon(g, x + s / 2, y + s / 2, s * 0.2, t) : sun(g, x + s / 2, y + s / 2, s * 0.2, t),
        'mostly-clear': (g, s, x, y, t, night) => {
            if (night) moon(g, x + s * 0.44, y + s * 0.42, s * 0.18, t); else sun(g, x + s * 0.44, y + s * 0.42, s * 0.18, t);
            puff(g, night ? 'night' : 'light', x + s * (0.64 + 0.06 * Math.sin(t * 0.35)), y + s * 0.68, s * 0.46);
        },
        'partly-cloudy': (g, s, x, y, t, night) => {
            if (night) moon(g, x + s * 0.37, y + s * 0.36, s * 0.16, t, false); else sun(g, x + s * 0.37, y + s * 0.36, s * 0.16, t);
            puff(g, night ? 'night' : 'light', x + s * (0.58 + 0.05 * Math.sin(t * 0.3)), y + s * 0.6, s * 0.66);
        },
        'cloudy': (g, s, x, y, t, night) => {
            puff(g, night ? 'nightDark' : 'grey', x + s * (0.38 + 0.05 * Math.sin(t * 0.25)), y + s * 0.42, s * 0.6);
            puff(g, night ? 'night' : 'light', x + s * (0.6 - 0.05 * Math.sin(t * 0.25 + 1)), y + s * 0.6, s * 0.7);
        },
        'fog': (g, s, x, y, t, night) => {
            puff(g, night ? 'night' : 'grey', x + s * 0.5, y + s * 0.36, s * 0.62, 0.85);
            fogBands(g, s, x, y, t);
        },
        'drizzle': (g, s, x, y, t, night) => {
            drops(g, s, x, y, { n: 7, x0: 0.26, x1: 0.7, top: 0.55, bottom: 0.92, len: 0.05, speed: 0.5, width: 0.012, colour: 'rgba(170,210,255,0.8)', t });
            puff(g, night ? 'night' : 'grey', x + s * 0.5, y + s * 0.38, s * 0.72);
        },
        'rain': (g, s, x, y, t, night) => {
            drops(g, s, x, y, { n: 8, x0: 0.24, x1: 0.68, top: 0.52, bottom: 0.92, len: 0.1, speed: 0.75, width: 0.02, colour: RAIN, t, splash: true });
            puff(g, night ? 'nightDark' : 'dark', x + s * 0.5, y + s * 0.36, s * 0.74);
        },
        'heavy-rain': (g, s, x, y, t, night) => {
            drops(g, s, x, y, { n: 14, x0: 0.2, x1: 0.68, top: 0.5, bottom: 0.93, len: 0.14, speed: 1, width: 0.022, colour: RAIN, slant: 0.28, t, splash: true });
            puff(g, night ? 'nightDark' : 'storm', x + s * 0.5, y + s * 0.34, s * 0.8);
        },
        'showers': (g, s, x, y, t, night) => {
            if (night) moon(g, x + s * 0.32, y + s * 0.3, s * 0.14, t, false); else sun(g, x + s * 0.32, y + s * 0.3, s * 0.14, t);
            drops(g, s, x, y, { n: 5, x0: 0.36, x1: 0.74, top: 0.6, bottom: 0.92, len: 0.09, speed: 0.75, width: 0.02, colour: RAIN, t, splash: true });
            puff(g, night ? 'night' : 'grey', x + s * 0.58, y + s * 0.46, s * 0.64);
        },
        'freezing-rain': (g, s, x, y, t, night) => {
            drops(g, s, x, y, { n: 7, x0: 0.26, x1: 0.68, top: 0.52, bottom: 0.88, len: 0.08, speed: 0.6, width: 0.018, colour: 'rgba(205,236,255,0.95)', slant: 0.1, t });
            iceTicks(g, s, x, y, t);
            puff(g, night ? 'nightDark' : 'grey', x + s * 0.5, y + s * 0.36, s * 0.72);
        },
        'snow': (g, s, x, y, t, night) => {
            drift(g, s, x, y, t, 0.05);
            flakes(g, s, x, y, { n: 9, x0: 0.24, x1: 0.76, top: 0.52, bottom: 0.92, size: 0.07, speed: 0.16, t });
            puff(g, night ? 'night' : 'light', x + s * 0.5, y + s * 0.37, s * 0.72);
        },
        'heavy-snow': (g, s, x, y, t, night) => {
            drift(g, s, x, y, t, 0.08);
            flakes(g, s, x, y, { n: 16, x0: 0.18, x1: 0.82, top: 0.5, bottom: 0.92, size: 0.075, speed: 0.22, t });
            puff(g, night ? 'nightDark' : 'grey', x + s * 0.5, y + s * 0.35, s * 0.78);
        },
        'snow-showers': (g, s, x, y, t, night) => {
            if (night) moon(g, x + s * 0.32, y + s * 0.3, s * 0.14, t, false); else sun(g, x + s * 0.32, y + s * 0.3, s * 0.14, t);
            flakes(g, s, x, y, { n: 6, x0: 0.36, x1: 0.78, top: 0.6, bottom: 0.92, size: 0.07, speed: 0.16, t });
            puff(g, night ? 'night' : 'light', x + s * 0.58, y + s * 0.46, s * 0.64);
        },
        'thunder': (g, s, x, y, t, night) => {
            const p = frac(t / 3.4 + 0.3), lit = p < 0.05 || (p > 0.09 && p < 0.14);
            if (lit) { const k = s * 1.1; g.drawImage(glow('210,220,255', step(k)), x + s / 2 - k / 2, y + s * 0.4 - k / 2, k, k); }
            drops(g, s, x, y, { n: 6, x0: 0.22, x1: 0.42, top: 0.55, bottom: 0.92, len: 0.1, speed: 0.8, width: 0.02, colour: RAIN, t });
            puff(g, night ? 'nightDark' : 'storm', x + s * 0.5, y + s * 0.36, s * 0.8);
            bolt(g, s, x, y, t, 3.4, 0.3);
        },
        'hail': (g, s, x, y, t, night) => {
            hail(g, s, x, y, t);
            puff(g, night ? 'nightDark' : 'storm', x + s * 0.5, y + s * 0.34, s * 0.8);
            bolt(g, s, x + s * 0.08, y, t, 5.2, 0.6);
        },
    };

    // alpha: the whole scene's opacity (the forecast is dimmed while loading).
    let base = 1;
    function draw(g, kind, x, y, s, t, night = false, alpha = 1) {
        base = alpha;
        g.globalAlpha = alpha;
        (SCENES[kind] || SCENES.cloudy)(g, s, x, y, t, night);
        g.globalAlpha = 1;
    }

    // ---- The sky ------------------------------------------------------------------------
    // Three stops, top to horizon, for each phase of a clear day; the kind of
    // weather greys and darkens them.

    const PHASES = {
        day: [[44, 110, 204], [102, 164, 230], [184, 218, 246]],
        dawn: [[50, 60, 118], [204, 126, 132], [255, 194, 138]],
        dusk: [[38, 38, 94], [186, 94, 112], [255, 158, 96]],
        night: [[5, 9, 24], [11, 20, 46], [24, 38, 70]],
    };
    // [grey amount, brightness, lift towards pale] per group of kinds.
    const GROUPS = {
        clear: [0, 1, 0], partly: [0.2, 0.97, 0], overcast: [0.66, 0.86, 0], rain: [0.72, 0.7, 0],
        snow: [0.6, 1, 0.18], storm: [0.8, 0.5, 0], fog: [0.85, 0.96, 0.3],
    };
    const GROUP_OF = {
        'clear': 'clear', 'mostly-clear': 'clear', 'partly-cloudy': 'partly', 'cloudy': 'overcast', 'fog': 'fog',
        'drizzle': 'rain', 'rain': 'rain', 'heavy-rain': 'rain', 'showers': 'partly', 'freezing-rain': 'rain',
        'snow': 'snow', 'heavy-snow': 'snow', 'snow-showers': 'snow', 'thunder': 'storm', 'hail': 'storm',
    };
    const groupOf = kind => GROUP_OF[kind] || 'overcast';

    // How much like day it is, 0 to 1, by phase.
    function daylight({ phase, t }) {
        if (phase === 'day') return 1;
        if (phase === 'night') return 0;
        return phase === 'dawn' ? t : 1 - t;
    }

    function skyColours(state, kind) {
        const { phase, t } = state;
        let stops;
        if (phase === 'dawn') stops = t < 0.5 ? PHASES.night.map((c, i) => mix(c, PHASES.dawn[i], t * 2)) : PHASES.dawn.map((c, i) => mix(c, PHASES.day[i], t * 2 - 1));
        else if (phase === 'dusk') stops = t < 0.5 ? PHASES.day.map((c, i) => mix(c, PHASES.dusk[i], t * 2)) : PHASES.dusk.map((c, i) => mix(c, PHASES.night[i], t * 2 - 1));
        else stops = PHASES[phase] || PHASES.day;
        const [grey, bright, lift] = GROUPS[groupOf(kind)];
        const day = daylight(state);
        return stops.map(c => {
            const y = (c[0] + c[1] + c[2]) / 3;
            const night = 1 - day;
            let out = mix(c, [y * (0.98 - 0.06 * night), y, y * (1.04 + 0.1 * night)], grey).map(v => v * (bright + (1 - bright) * 0.35 * night));
            if (lift) out = mix(out, [214, 220, 228], lift * day);
            return out.map(v => Math.max(0, Math.min(255, v)));
        });
    }

    // The sky into a quarter-size canvas (the caller scales it up: it is
    // all soft), dithered once so dark gradients don't band.
    function paintSky(c, state, kind) {
        const g = c.getContext('2d'), W = c.width, H = c.height;
        const [top, mid, low] = skyColours(state, kind);
        const fill = g.createLinearGradient(0, 0, 0, H);
        fill.addColorStop(0, rgb(top));
        fill.addColorStop(0.58, rgb(mid));
        fill.addColorStop(1, rgb(low));
        g.fillStyle = fill;
        g.fillRect(0, 0, W, H);
        const group = groupOf(kind), clearish = group === 'clear' || group === 'partly';
        // The low sun's glow along the horizon at dawn and dusk.
        if (state.phase === 'dawn' || state.phase === 'dusk') {
            const strength = (1 - Math.abs(state.t - 0.5) * 2) * (clearish ? 0.55 : 0.25);
            const sx = state.phase === 'dawn' ? W * 0.22 : W * 0.78;
            const r = g.createRadialGradient(sx, H * 1.05, 0, sx, H * 1.05, Math.max(W, H) * 0.7);
            r.addColorStop(0, `rgba(255,186,110,${strength})`);
            r.addColorStop(1, 'rgba(255,186,110,0)');
            g.fillStyle = r;
            g.fillRect(0, 0, W, H);
        }
        // The day's sun, high and to one side, as a soft brightening.
        if (state.phase === 'day' && clearish) {
            const r = g.createRadialGradient(W * 0.16, H * 0.12, 0, W * 0.16, H * 0.12, Math.max(W, H) * 0.5);
            r.addColorStop(0, 'rgba(255,248,220,0.5)');
            r.addColorStop(1, 'rgba(255,248,220,0)');
            g.fillStyle = r;
            g.fillRect(0, 0, W, H);
        }
        const image = g.getImageData(0, 0, W, H), d = image.data;
        for (let i = 0; i < d.length; i += 4) {
            const n = (hash(i, 9) - 0.5) * 1.8;
            d[i] += n; d[i + 1] += n; d[i + 2] += n;
        }
        g.putImageData(image, 0, 0);
    }

    // ---- The ambient layer ------------------------------------------------------------------
    // The weather outside over the sky: clouds drifting, rain or snow,
    // fog sheets, lightning now and then, stars and the moon at night.

    // Per kind: clouds, rain streaks, snowflakes (counts at 1280×800, full).
    const AMBIENT = {
        'clear': [0, 0, 0], 'mostly-clear': [2, 0, 0], 'partly-cloudy': [5, 0, 0], 'cloudy': [9, 0, 0], 'fog': [3, 0, 0],
        'drizzle': [8, 150, 0], 'rain': [9, 220, 0], 'heavy-rain': [10, 400, 0], 'showers': [7, 170, 0],
        'freezing-rain': [9, 170, 40], 'snow': [8, 0, 150], 'heavy-snow': [9, 0, 280], 'snow-showers': [6, 0, 110],
        'thunder': [10, 300, 0], 'hail': [10, 220, 70],
    };

    class Ambient {
        constructor() {
            this.W = 1; this.H = 1;
            this.kind = 'clear'; this.night = false; this.level = 'subtle'; this.density = 1;
            this.clouds = []; this.rain = []; this.snow = []; this.stars = [];
            this.targets = { clouds: 0, rain: 0, snow: 0 };
            this.flash = 0; this.flashAt = 3; this.boltPath = null; this.flicker = 0;
            this.fog = 0; this.fogX = 0;
            this.wind = 0.15;
            this.moonPhase = 0;
        }

        resize(W, H) {
            const first = this.W === 1;
            this.W = W; this.H = H;
            this.stars = [];
            const n = Math.round(170 * Math.min(1.6, Math.max(0.4, W * H / 1024000)));
            for (let i = 0; i < n; i++) this.stars.push({ x: Math.random() * W, y: Math.random() * H * 0.72, r: 0.5 + Math.random() ** 3 * 1.3, p: Math.random() * TAU, f: 0.6 + Math.random() * 1.6 });
            this.retarget(first);
        }

        // What it's like outside now. Particles of a kind that's gone finish
        // their fall; new ones come in from the edges.
        set({ kind, night, level, density, wind, moonPhase }) {
            const changed = kind !== this.kind || level !== this.level || density !== this.density;
            Object.assign(this, { kind, night, level, density, moonPhase: moonPhase ?? this.moonPhase });
            if (Number.isFinite(wind)) this.wind = Math.max(-0.5, Math.min(0.5, wind / 80));
            if (changed) this.retarget(false);
        }

        retarget(seed) {
            const [clouds, rain, snow] = AMBIENT[this.kind] || AMBIENT.cloudy;
            const area = Math.min(1.6, Math.max(0.4, this.W * this.H / 1024000));
            const amount = this.level === 'full' ? 1 : this.level === 'subtle' ? 0.5 : 0;
            this.targets = {
                clouds: Math.round(clouds * (this.level === 'full' ? 1 : 0.7) * (0.5 + 0.5 * this.density) * Math.sqrt(area) * (amount ? 1 : 0)),
                rain: Math.round(rain * amount * this.density * area),
                snow: Math.round(snow * amount * this.density * area),
            };
            this.fogTarget = this.kind === 'fog' && amount ? 1 : 0;
            if (seed) {
                // Look alive on the first frame: everything already in place.
                for (let i = 0; i < this.targets.clouds; i++) this.clouds.push(this.newCloud(Math.random() * (this.W + 600) - 300));
                for (let i = 0; i < this.targets.rain; i++) this.rain.push(this.newDrop(Math.random() * this.H));
                for (let i = 0; i < this.targets.snow; i++) this.snow.push(this.newFlake(Math.random() * this.H));
                this.fog = this.fogTarget;
            }
        }

        newCloud(x) {
            const w = this.W * (0.22 + Math.random() * 0.22) + 160;
            return { x: x ?? -w / 2, y: this.H * (0.04 + Math.random() * 0.38), w, v: 6 + Math.random() * 14, a: 0.5 + Math.random() * 0.4, live: true };
        }
        newDrop(y) {
            return { x: Math.random() * (this.W + 200) - 100, y: y ?? -Math.random() * 80, v: 650 + Math.random() * 450, len: 10 + Math.random() * 16, live: true };
        }
        newFlake(y) {
            return { x: Math.random() * this.W, y: y ?? -10, v: 30 + Math.random() * 45, r: 1.5 + Math.random() ** 2 * 3.5, p: Math.random() * TAU, live: true };
        }

        // Keep a pool at its target: spare ones finish and stop; missing ones
        // join from the edge a few at a time.
        static grow(list, target, dt, make, rate) {
            let live = 0;
            for (const p of list) if (p.live) live++;
            let add = live < target ? Math.max(1, Math.round(target * dt * rate)) : 0;
            for (let i = 0; i < list.length && add > 0; i++) if (!list[i].live) { Object.assign(list[i], make()); add--; live++; }
            while (add-- > 0 && list.length < target * 1.5 + 4) list.push(make());
            return live;
        }

        update(dt, t) {
            const { W, H } = this, rainy = this.kind === 'freezing-rain' || this.kind === 'hail';
            Ambient.grow(this.clouds, this.targets.clouds, dt, () => this.newCloud(), 0.02);
            Ambient.grow(this.rain, this.targets.rain, dt, () => this.newDrop(), 1.2);
            Ambient.grow(this.snow, this.targets.snow, dt, () => this.newFlake(), rainy ? 1 : 0.25);
            let live = 0;
            for (const c of this.clouds) {
                if (!c.live) continue;
                c.x += c.v * dt * (1 + this.wind * 2);
                if (c.x - c.w / 2 > W) {
                    if (live >= this.targets.clouds) { c.live = false; continue; }
                    Object.assign(c, this.newCloud());
                }
                live++;
            }
            live = 0;
            const slant = this.wind * 1.4 + 0.12;
            for (const d of this.rain) {
                if (!d.live) continue;
                d.y += d.v * dt;
                d.x += d.v * dt * slant;
                if (d.y - d.len > H) {
                    if (live >= this.targets.rain) { d.live = false; continue; }
                    Object.assign(d, this.newDrop());
                }
                live++;
            }
            live = 0;
            const fast = rainy ? 7 : 1;
            for (const f of this.snow) {
                if (!f.live) continue;
                f.y += f.v * fast * dt;
                f.x += (Math.sin(t * 0.8 + f.p) * 18 + this.wind * 60) * dt;
                if (f.y > H + 8) {
                    if (live >= this.targets.snow) { f.live = false; continue; }
                    Object.assign(f, this.newFlake());
                }
                live++;
            }
            this.fog += (this.fogTarget - this.fog) * Math.min(1, dt * 0.5);
            this.fogX += dt * 9;
            // Lightning for thunder and hail: a double flicker now and then.
            const stormy = (this.kind === 'thunder' || this.kind === 'hail') && this.level !== 'off';
            this.flash = Math.max(0, this.flash - dt * 3.5);
            if (this.flicker > 0 && (this.flicker -= dt) <= 0) this.flash = 0.8;
            if (stormy && (this.flashAt -= dt) <= 0) {
                this.flashAt = (this.level === 'full' ? 5 : 9) + Math.random() * 12;
                this.flash = 1;
                this.flicker = 0.16;
                this.boltPath = this.level === 'full' ? this.makeBolt() : null;
            }
        }

        makeBolt() {
            const pts = [];
            let x = this.W * (0.15 + Math.random() * 0.7), y = 0;
            const end = this.H * (0.35 + Math.random() * 0.25);
            while (y < end) {
                pts.push([x, y]);
                y += 14 + Math.random() * 30;
                x += (Math.random() - 0.5) * 46;
            }
            return pts;
        }

        // Everything behind the forecast. `sky` is the daylight 0..1.
        draw(g, t, day, animate) {
            const { W, H } = this, level = this.level, group = groupOf(this.kind);
            const clearish = group === 'clear' || group === 'partly';
            // Stars and the moon, through whatever cloud there is.
            const dark = 1 - day;
            if (dark > 0.05 && group !== 'rain' && group !== 'storm') {
                const through = (clearish ? 1 : group === 'fog' ? 0.1 : 0.25) * dark;
                g.fillStyle = '#f2f5ff';
                for (const s of this.stars) {
                    g.globalAlpha = through * (animate ? 0.55 + 0.45 * Math.sin(t * s.f + s.p) : 0.8) * (0.4 + 0.6 * (1 - s.y / H));
                    g.fillRect(s.x, s.y, s.r, s.r);
                }
                const r = Math.max(14, Math.min(W, H) * 0.032), mx = W * 0.84, my = H * 0.15, halo = r * 9;
                g.globalAlpha = through * (0.4 + 0.6 * (1 - Math.cos(this.moonPhase * TAU)) / 2);
                g.drawImage(glow('190,205,240', step(halo)), mx - halo / 2, my - halo / 2, halo, halo);
                g.globalAlpha = Math.min(1, through * 1.2);
                g.drawImage(moonDisc(step(r * 2), this.moonPhase), mx - r, my - r, r * 2, r * 2);
                g.globalAlpha = 1;
            }
            if (level === 'off') return;
            const strength = level === 'full' ? 1 : 0.7;
            const tone = this.night ? (group === 'storm' || group === 'rain' ? 'nightDark' : 'night')
                : group === 'storm' ? 'storm' : group === 'rain' ? 'dark' : group === 'clear' || group === 'partly' ? 'light' : 'grey';
            for (const c of this.clouds) {
                if (!c.live) continue;
                g.globalAlpha = c.a * strength * (this.night ? 0.45 : 0.75);
                g.drawImage(softCloud(tone), c.x - c.w / 2, c.y - c.w * 0.31, c.w, c.w * 0.62);
            }
            if (this.fog > 0.01) {
                const band = fogBand(256);
                for (let i = 0; i < 3; i++) {
                    // Two copies side by side, sliding, so a sheet never runs out.
                    const w = W * 1.3, h = H * 0.42, x = (this.fogX * (0.6 + i * 0.35) + i * W * 0.6) % w, y = H * (0.3 + i * 0.22) - h / 2;
                    g.globalAlpha = this.fog * strength * (this.night ? 0.25 : 0.5);
                    g.drawImage(band, x - w, y, w, h);
                    g.drawImage(band, x, y, w, h);
                }
            }
            g.globalAlpha = 1;
            if (this.rain.length) {
                const slant = this.wind * 1.4 + 0.12;
                g.beginPath();
                for (const d of this.rain) {
                    if (!d.live) continue;
                    g.moveTo(d.x, d.y);
                    g.lineTo(d.x - d.len * slant, d.y - d.len);
                }
                g.strokeStyle = this.kind === 'freezing-rain' ? `rgba(215,238,255,${0.5 * strength})` : this.kind === 'drizzle' ? `rgba(200,214,232,${0.32 * strength})` : `rgba(190,210,235,${0.42 * strength})`;
                g.lineWidth = this.kind === 'drizzle' ? 0.8 : 1.2;
                g.stroke();
            }
            if (this.snow.length) {
                const img = flake(16);
                g.globalAlpha = 0.85 * strength;
                for (const f of this.snow) if (f.live) g.drawImage(img, f.x - f.r, f.y - f.r, f.r * 2, f.r * 2);
                g.globalAlpha = 1;
            }
            if (this.flash > 0.01) {
                g.fillStyle = `rgba(214,224,255,${this.flash * 0.22 * strength})`;
                g.fillRect(0, 0, W, H);
                if (this.boltPath && this.flash > 0.3) {
                    g.beginPath();
                    this.boltPath.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
                    g.lineJoin = 'round';
                    g.strokeStyle = `rgba(190,205,255,${this.flash * 0.25})`;
                    g.lineWidth = 9;
                    g.stroke();
                    g.strokeStyle = `rgba(255,255,255,${this.flash})`;
                    g.lineWidth = 2;
                    g.stroke();
                }
            }
        }

        // Would a frame look the same as the last? (Then it can be painted
        // once, into the sky's layer.) day: the daylight, 0 to 1.
        still(day) {
            if (this.level === 'off') return true;
            if (this.flash > 0 || this.fog > 0.01 || [this.clouds, this.rain, this.snow].some(list => list.some(p => p.live))) return false;
            const group = groupOf(this.kind);
            return !(1 - day > 0.05 && group !== 'rain' && group !== 'storm');   // twinkling stars
        }
    }

    return { draw, setScale, skyColours, paintSky, groupOf, daylight, shade, Ambient };
})();
