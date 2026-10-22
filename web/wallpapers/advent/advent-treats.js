// Advent Calendar -- treats, art kit, holidays and themes
//
// This is the content half of the advent calendar wallpaper (advent.js is
// the engine). Everything here is drawn procedurally on a 2D canvas:
//
//   AdvArt        small drawing kit: shapes, props and a configurable
//                 "critter" that covers every cute animal in the calendar
//   ADVENT_TREATS the vignettes that play behind each door. Each one draws
//                 into a box centred on the origin whose shorter half-side
//                 is 50 units, so the same code serves a 60px door and a
//                 full-size spotlight replay
//   AdventHolidays which holidays fall in a given month of a given year
//   ADVENT_THEMES  palettes, scenery, frame style and the pool of treats
//                 for each theme
//
// A treat is driven by `S.age`, seconds since its door opened, so a fresh
// door can play an entrance while older doors just loop.

const advTAU = Math.PI * 2;
const advClamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const advLerp = (a, b, t) => a + (b - a) * t;
const advSmooth = (t) => { t = advClamp(t, 0, 1); return t * t * (3 - 2 * t); };
const advEaseOut = (t) => 1 - Math.pow(1 - advClamp(t, 0, 1), 3);
const advEaseIn = (t) => Math.pow(advClamp(t, 0, 1), 3);
const advEaseOutBack = (t) => {
    t = advClamp(t, 0, 1);
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
const advEaseOutElastic = (t) => {
    t = advClamp(t, 0, 1);
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (advTAU / 3)) + 1;
};
// 0 -> 1 -> 0 over [a, b], with soft shoulders
const advPulse = (t, a, b) => (t < a || t > b ? 0 : Math.sin(((t - a) / (b - a)) * Math.PI));

// Deterministic per-thing randomness, so a door looks the same every frame
function advHash(seed, i = 0) {
    const h = Math.sin(seed * 127.1 + i * 311.7 + 0.5) * 43758.5453;
    return h - Math.floor(h);
}

function advRng(seed) {
    let a = (seed >>> 0) || 1;
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const advRgbCache = new Map();
function advRgb(hex) {
    let v = advRgbCache.get(hex);
    if (v) return v;
    const n = parseInt(hex.slice(1), 16);
    v = hex.length === 4
        ? [((n >> 8) & 15) * 17, ((n >> 4) & 15) * 17, (n & 15) * 17]
        : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    advRgbCache.set(hex, v);
    return v;
}

function advMix(a, b, t) {
    const A = advRgb(a), B = advRgb(b);
    const r = Math.round(A[0] + (B[0] - A[0]) * t);
    const g = Math.round(A[1] + (B[1] - A[1]) * t);
    const bl = Math.round(A[2] + (B[2] - A[2]) * t);
    return '#' + (((r << 16) | (g << 8) | bl) | 0x1000000).toString(16).slice(1);
}

function advRgba(hex, alpha) {
    const c = advRgb(hex);
    return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
}

const advLighten = (hex, t) => advMix(hex, '#ffffff', t);
const advDarken = (hex, t) => advMix(hex, '#000000', t);

// ===========================================================================
// AdvArt: the drawing kit
// ===========================================================================

const AdvArt = {
    INK: '#3b2a2a',
    BLUSH: '#ff8fa3',

    // ---- paths -----------------------------------------------------------

    rr(ctx, x, y, w, h, r) {
        r = Math.max(0, Math.min(r, w / 2, h / 2));
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    },

    starPath(ctx, x, y, r, points = 5, inner = 0.48, rot = -Math.PI / 2) {
        ctx.beginPath();
        for (let i = 0; i < points * 2; i++) {
            const a = rot + (i * Math.PI) / points;
            const rad = i % 2 ? r * inner : r;
            const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
    },

    // Heart centred on (x, y), roughly 2s wide
    heartPath(ctx, x, y, s) {
        ctx.beginPath();
        ctx.moveTo(x, y + s * 0.95);
        ctx.bezierCurveTo(x - s * 1.25, y + s * 0.1, x - s * 1.05, y - s * 1.05, x, y - s * 0.4);
        ctx.bezierCurveTo(x + s * 1.05, y - s * 1.05, x + s * 1.25, y + s * 0.1, x, y + s * 0.95);
        ctx.closePath();
    },

    ellipse(ctx, x, y, rx, ry, fill, rot = 0) {
        ctx.beginPath();
        ctx.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, advTAU);
        if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    },

    circle(ctx, x, y, r, fill) {
        ctx.beginPath();
        ctx.arc(x, y, Math.abs(r), 0, advTAU);
        if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    },

    line(ctx, x1, y1, x2, y2, color, width, cap = 'round') {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = cap;
        ctx.stroke();
    },

    // Soft outline used across the kit so everything shares one "inked" look
    ink(ctx, w = 1.6, color = AdvArt.INK, alpha = 0.55) {
        ctx.save();
        ctx.globalAlpha *= alpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = w;
        ctx.lineJoin = 'round';
        ctx.stroke();
        ctx.restore();
    },

    // ---- backgrounds -----------------------------------------------------

    sky(ctx, S, top, bottom) {
        const g = ctx.createLinearGradient(0, -S.hh, 0, S.hh);
        g.addColorStop(0, top);
        g.addColorStop(1, bottom || top);
        ctx.fillStyle = g;
        ctx.fillRect(-S.hw - 1, -S.hh - 1, S.hw * 2 + 2, S.hh * 2 + 2);
    },

    ground(ctx, S, y, color, bump = 4, seed = 1) {
        ctx.beginPath();
        ctx.moveTo(-S.hw - 2, S.hh + 2);
        ctx.lineTo(-S.hw - 2, y);
        const n = 6;
        for (let i = 0; i <= n; i++) {
            const x = -S.hw + (i / n) * S.hw * 2;
            const yy = y + Math.sin(i * 1.7 + seed) * bump;
            ctx.lineTo(x, yy);
        }
        ctx.lineTo(S.hw + 2, S.hh + 2);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
    },

    hill(ctx, S, cx, y, rx, ry, color) {
        ctx.beginPath();
        ctx.ellipse(cx, y, rx, ry, 0, Math.PI, 0);
        ctx.lineTo(cx + rx, S.hh + 2);
        ctx.lineTo(cx - rx, S.hh + 2);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
    },

    stars(ctx, S, n, seed, t, color = '#fff8d6') {
        for (let i = 0; i < n; i++) {
            const x = (advHash(seed, i) * 2 - 1) * S.hw;
            const y = (advHash(seed, i + 50) * 1.6 - 1) * S.hh;
            const tw = 0.5 + 0.5 * Math.sin(t * (1.5 + advHash(seed, i + 9) * 2) + i);
            ctx.globalAlpha = 0.35 + tw * 0.65;
            if (i % 4 === 0) {
                AdvArt.sparkle(ctx, x, y, 2.2 + tw * 1.2, color);
            } else {
                AdvArt.circle(ctx, x, y, 0.8 + advHash(seed, i + 3) * 0.7, color);
            }
        }
        ctx.globalAlpha = 1;
    },

    // ---- faces -----------------------------------------------------------

    // Blink: mostly open, with a quick close every few seconds
    blink(t, seed = 0) {
        const period = 3.2 + advHash(seed, 7) * 2.5;
        const ph = (t + advHash(seed, 3) * period) % period;
        return ph < 0.14 ? 1 : 0;
    },

    // A kawaii face: two shiny eyes, a tiny mouth and rosy cheeks. `s` is
    // roughly the face half-width.
    face(ctx, x, y, s, o = {}) {
        const eyeDx = s * (o.eyeSpread || 0.42);
        const eyeR = s * (o.eyeSize || 0.16);
        const ink = o.ink || AdvArt.INK;
        const lookX = (o.lookX || 0) * eyeR * 0.6;
        const lookY = (o.lookY || 0) * eyeR * 0.6;

        if (o.blush !== false) {
            ctx.globalAlpha *= 0.55;
            AdvArt.ellipse(ctx, x - eyeDx - s * 0.12, y + s * 0.22, s * 0.17, s * 0.1, o.blushColor || AdvArt.BLUSH);
            AdvArt.ellipse(ctx, x + eyeDx + s * 0.12, y + s * 0.22, s * 0.17, s * 0.1, o.blushColor || AdvArt.BLUSH);
            ctx.globalAlpha /= 0.55;
        }

        const eyes = o.eyes || (o.closed ? 'closed' : 'dot');
        for (const side of (eyes === 'none' ? [] : o.oneEye ? [0] : [-1, 1])) {
            const ex = x + side * eyeDx + lookX, ey = y + lookY;
            if (eyes === 'closed' || o.blink) {
                ctx.beginPath();
                ctx.arc(ex, ey - eyeR * 0.2, eyeR * 0.9, 0.15 * Math.PI, 0.85 * Math.PI);
                ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1, s * 0.07); ctx.lineCap = 'round';
                ctx.stroke();
            } else if (eyes === 'happy') {
                ctx.beginPath();
                ctx.arc(ex, ey + eyeR * 0.5, eyeR * 0.9, 1.15 * Math.PI, 1.85 * Math.PI);
                ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1, s * 0.07); ctx.lineCap = 'round';
                ctx.stroke();
            } else if (eyes === 'heart') {
                ctx.fillStyle = '#e8456b';
                AdvArt.heartPath(ctx, ex, ey, eyeR * 1.1);
                ctx.fill();
            } else if (eyes === 'star') {
                ctx.fillStyle = '#ffcf33';
                AdvArt.starPath(ctx, ex, ey, eyeR * 1.4);
                ctx.fill();
            } else if (eyes === 'x') {
                AdvArt.line(ctx, ex - eyeR * 0.7, ey - eyeR * 0.7, ex + eyeR * 0.7, ey + eyeR * 0.7, ink, s * 0.07);
                AdvArt.line(ctx, ex + eyeR * 0.7, ey - eyeR * 0.7, ex - eyeR * 0.7, ey + eyeR * 0.7, ink, s * 0.07);
            } else {
                AdvArt.ellipse(ctx, ex, ey, eyeR, eyeR * 1.18, o.eyeColor || ink);
                AdvArt.circle(ctx, ex - eyeR * 0.32, ey - eyeR * 0.4, eyeR * 0.38, '#ffffff');
                AdvArt.circle(ctx, ex + eyeR * 0.3, ey + eyeR * 0.35, eyeR * 0.16, 'rgba(255,255,255,0.8)');
            }
        }

        const my = y + s * (o.mouthY || 0.28);
        const mw = s * 0.16;
        ctx.strokeStyle = ink;
        ctx.lineWidth = Math.max(1, s * 0.065);
        ctx.lineCap = 'round';
        switch (o.mouth || 'smile') {
            case 'cat':
                ctx.beginPath();
                ctx.arc(x - mw * 0.55, my, mw * 0.55, 0, Math.PI);
                ctx.arc(x + mw * 0.55, my, mw * 0.55, 0, Math.PI);
                ctx.stroke();
                break;
            case 'open':
                ctx.beginPath();
                ctx.moveTo(x - mw * 1.1, my - mw * 0.2);
                ctx.quadraticCurveTo(x, my + mw * 2.2, x + mw * 1.1, my - mw * 0.2);
                ctx.closePath();
                ctx.fillStyle = '#9b3b45'; ctx.fill();
                ctx.save(); ctx.clip();
                AdvArt.ellipse(ctx, x, my + mw * 1.2, mw * 0.7, mw * 0.5, '#ff8a8a');
                ctx.restore();
                break;
            case 'o':
                AdvArt.ellipse(ctx, x, my + mw * 0.3, mw * 0.5, mw * 0.65, '#9b3b45');
                break;
            case 'flat':
                AdvArt.line(ctx, x - mw * 0.6, my + mw * 0.2, x + mw * 0.6, my + mw * 0.2, ink, s * 0.06);
                break;
            case 'grin':
                ctx.beginPath();
                ctx.arc(x, my - mw * 0.4, mw * 1.3, 0.15 * Math.PI, 0.85 * Math.PI);
                ctx.stroke();
                break;
            case 'none':
                break;
            default:
                ctx.beginPath();
                ctx.arc(x, my - mw * 0.3, mw * 0.85, 0.2 * Math.PI, 0.8 * Math.PI);
                ctx.stroke();
        }
    },

    // ---- little props ----------------------------------------------------

    sparkle(ctx, x, y, r, color = '#fff6c2') {
        ctx.beginPath();
        ctx.moveTo(x, y - r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.quadraticCurveTo(x, y, x, y + r);
        ctx.quadraticCurveTo(x, y, x - r, y);
        ctx.quadraticCurveTo(x, y, x, y - r);
        ctx.fillStyle = color;
        ctx.fill();
    },

    star(ctx, x, y, r, color = '#ffd447', rot = -Math.PI / 2, face = false, t = 0) {
        ctx.save();
        ctx.lineJoin = 'round';
        AdvArt.starPath(ctx, x, y, r, 5, 0.5, rot);
        ctx.fillStyle = color;
        ctx.fill();
        AdvArt.ink(ctx, r * 0.08, advDarken(color, 0.4), 0.6);
        if (face) AdvArt.face(ctx, x, y + r * 0.08, r * 0.42, { blink: AdvArt.blink(t, x) });
        ctx.restore();
    },

    heart(ctx, x, y, s, color = '#ff5d7d', face = false, t = 0) {
        AdvArt.heartPath(ctx, x, y, s);
        ctx.fillStyle = color;
        ctx.fill();
        AdvArt.ink(ctx, s * 0.08, advDarken(color, 0.45), 0.5);
        ctx.save();
        ctx.globalAlpha *= 0.45;
        AdvArt.ellipse(ctx, x - s * 0.45, y - s * 0.3, s * 0.22, s * 0.13, '#ffffff', -0.6);
        ctx.restore();
        if (face) AdvArt.face(ctx, x, y + s * 0.05, s * 0.5, { blink: AdvArt.blink(t, x + y) });
    },

    snowflake(ctx, x, y, r, color = '#ffffff', rot = 0) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(0.8, r * 0.16);
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const a = (i * Math.PI) / 3;
            const c = Math.cos(a), s = Math.sin(a);
            ctx.moveTo(0, 0);
            ctx.lineTo(c * r, s * r);
            const bx = c * r * 0.55, by = s * r * 0.55;
            const a1 = a + 0.7, a2 = a - 0.7;
            ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(a1) * r * 0.3, by + Math.sin(a1) * r * 0.3);
            ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(a2) * r * 0.3, by + Math.sin(a2) * r * 0.3);
        }
        ctx.stroke();
        ctx.restore();
    },

    leaf(ctx, x, y, len, rot, color = '#e8873a', kind = 'oval') {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.beginPath();
        if (kind === 'maple') {
            const r = len * 0.55;
            for (let i = 0; i <= 10; i++) {
                const a = -Math.PI / 2 + (i / 10) * advTAU;
                const rad = i % 2 ? r * 0.55 : r * (i === 0 || i === 10 ? 1.05 : i === 5 ? 0.25 : 0.95);
                const px = Math.cos(a) * rad, py = Math.sin(a) * rad;
                if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.closePath();
        } else {
            ctx.moveTo(0, -len / 2);
            ctx.quadraticCurveTo(len * 0.42, 0, 0, len / 2);
            ctx.quadraticCurveTo(-len * 0.42, 0, 0, -len / 2);
        }
        ctx.fillStyle = color;
        ctx.fill();
        AdvArt.ink(ctx, len * 0.05, advDarken(color, 0.4), 0.5);
        AdvArt.line(ctx, 0, -len * 0.35, 0, len * 0.55, advDarken(color, 0.3), len * 0.05);
        ctx.restore();
    },

    petal(ctx, x, y, r, rot, color = '#ffc0d6') {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.beginPath();
        ctx.moveTo(0, r);
        ctx.bezierCurveTo(-r, r * 0.2, -r * 0.6, -r, -r * 0.08, -r * 0.7);
        ctx.lineTo(0, -r * 0.45);
        ctx.lineTo(r * 0.08, -r * 0.7);
        ctx.bezierCurveTo(r * 0.6, -r, r, r * 0.2, 0, r);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.restore();
    },

    flower(ctx, x, y, r, petalColor = '#ff8fb8', centerColor = '#ffd447', rot = 0, petals = 5) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        for (let i = 0; i < petals; i++) {
            const a = (i / petals) * advTAU;
            AdvArt.ellipse(ctx, Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.5, r * 0.36, petalColor, a);
        }
        ctx.beginPath();
        for (let i = 0; i < petals; i++) {
            const a = (i / petals) * advTAU;
            ctx.ellipse(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.5, r * 0.36, a, 0, advTAU);
        }
        AdvArt.circle(ctx, 0, 0, r * 0.36, centerColor);
        AdvArt.ink(ctx, r * 0.07, advDarken(centerColor, 0.4), 0.5);
        ctx.restore();
    },

    tulip(ctx, x, y, r, color = '#ff6b8b') {
        ctx.beginPath();
        ctx.moveTo(x - r * 0.8, y - r * 0.5);
        ctx.lineTo(x - r * 0.4, y - r * 0.05);
        ctx.lineTo(x, y - r * 0.7);
        ctx.lineTo(x + r * 0.4, y - r * 0.05);
        ctx.lineTo(x + r * 0.8, y - r * 0.5);
        ctx.quadraticCurveTo(x + r * 0.9, y + r * 0.7, x, y + r * 0.75);
        ctx.quadraticCurveTo(x - r * 0.9, y + r * 0.7, x - r * 0.8, y - r * 0.5);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        AdvArt.ink(ctx, r * 0.07, advDarken(color, 0.45), 0.5);
    },

    clover(ctx, x, y, r, color = '#43b05c', leaves = 4, rot = 0) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        AdvArt.line(ctx, 0, 0, r * 0.25, r * 1.3, advDarken(color, 0.2), r * 0.16);
        for (let i = 0; i < leaves; i++) {
            ctx.save();
            ctx.rotate((i / leaves) * advTAU);
            AdvArt.heartPath(ctx, 0, -r * 0.52, r * 0.5);
            ctx.fillStyle = color;
            ctx.fill();
            AdvArt.ink(ctx, r * 0.06, advDarken(color, 0.45), 0.4);
            ctx.restore();
        }
        AdvArt.circle(ctx, 0, 0, r * 0.12, advLighten(color, 0.3));
        ctx.restore();
    },

    cloud(ctx, x, y, w, color = '#ffffff', face = false, t = 0) {
        const r = w * 0.22;
        ctx.beginPath();
        ctx.arc(x - w * 0.28, y + r * 0.2, r * 0.95, Math.PI * 0.5, Math.PI * 1.5);
        ctx.arc(x - w * 0.08, y - r * 0.45, r * 1.15, Math.PI, Math.PI * 1.9);
        ctx.arc(x + w * 0.2, y - r * 0.25, r * 1.0, Math.PI * 1.15, Math.PI * 2);
        ctx.arc(x + w * 0.3, y + r * 0.2, r * 0.9, Math.PI * 1.5, Math.PI * 0.5);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        AdvArt.ink(ctx, w * 0.02, '#8aa0c0', 0.5);
        if (face) AdvArt.face(ctx, x, y - r * 0.1, w * 0.18, { blink: AdvArt.blink(t, x) });
    },

    sun(ctx, x, y, r, t, face = true) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(t * 0.3);
        ctx.fillStyle = '#ffcf4a';
        for (let i = 0; i < 10; i++) {
            ctx.save();
            ctx.rotate((i / 10) * advTAU);
            ctx.beginPath();
            ctx.moveTo(-r * 0.2, -r * 1.05);
            ctx.lineTo(0, -r * (1.45 + 0.08 * Math.sin(t * 3 + i)));
            ctx.lineTo(r * 0.2, -r * 1.05);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
        ctx.restore();
        AdvArt.circle(ctx, x, y, r, '#ffd84d');
        AdvArt.ink(ctx, r * 0.06, '#d69a1c', 0.6);
        if (face) AdvArt.face(ctx, x, y + r * 0.05, r * 0.6, { blink: AdvArt.blink(t, 11), mouth: 'smile' });
    },

    moon(ctx, x, y, r, t, o = {}) {
        ctx.save();
        if (o.glow !== false) {
            const g = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 2.2);
            g.addColorStop(0, 'rgba(255,244,200,0.35)');
            g.addColorStop(1, 'rgba(255,244,200,0)');
            ctx.fillStyle = g;
            ctx.fillRect(x - r * 2.2, y - r * 2.2, r * 4.4, r * 4.4);
        }
        if (o.crescent) {
            ctx.beginPath();
            ctx.arc(x, y, r, 0, advTAU);
            ctx.arc(x + r * 0.55, y - r * 0.25, r * 0.85, 0, advTAU, true);
            ctx.fillStyle = o.color || '#fff1b8';
            ctx.fill('evenodd');
            if (o.face !== false) {
                // Sleeping face on the inner curve of the crescent
                const fx = x - r * 0.52, fy = y + r * 0.1;
                ctx.beginPath();
                ctx.arc(fx, fy - r * 0.05, r * 0.11, 0.1 * Math.PI, 0.9 * Math.PI);
                ctx.strokeStyle = AdvArt.INK; ctx.lineWidth = r * 0.05; ctx.lineCap = 'round';
                ctx.stroke();
                ctx.globalAlpha *= 0.5;
                AdvArt.ellipse(ctx, fx - r * 0.02, fy + r * 0.2, r * 0.1, r * 0.06, AdvArt.BLUSH);
            }
        } else {
            AdvArt.circle(ctx, x, y, r, o.color || '#fff1b8');
            ctx.globalAlpha *= 0.18;
            AdvArt.circle(ctx, x + r * 0.35, y - r * 0.3, r * 0.18, '#c9a96a');
            AdvArt.circle(ctx, x - r * 0.3, y + r * 0.4, r * 0.12, '#c9a96a');
            AdvArt.circle(ctx, x + r * 0.1, y + r * 0.5, r * 0.08, '#c9a96a');
            ctx.globalAlpha /= 0.18;
            if (o.face) AdvArt.face(ctx, x, y + r * 0.05, r * 0.55, { closed: o.sleepy, blink: AdvArt.blink(t, 5) });
        }
        ctx.restore();
    },

    balloon(ctx, x, y, r, color, stringLen, sway = 0, face = false, t = 0) {
        ctx.beginPath();
        ctx.moveTo(x, y + r * 1.15);
        ctx.bezierCurveTo(x + sway * 0.5 + 4, y + r * 1.15 + stringLen * 0.35, x - sway * 0.5 - 4, y + r * 1.15 + stringLen * 0.7, x + sway, y + r * 1.15 + stringLen);
        ctx.strokeStyle = 'rgba(80,60,60,0.6)';
        ctx.lineWidth = 0.9;
        ctx.stroke();
        AdvArt.ellipse(ctx, x, y, r * 0.88, r * 1.05, color);
        AdvArt.ink(ctx, r * 0.07, advDarken(color, 0.4), 0.5);
        ctx.beginPath();
        ctx.moveTo(x - r * 0.15, y + r * 1.17);
        ctx.lineTo(x + r * 0.15, y + r * 1.17);
        ctx.lineTo(x, y + r * 1.0);
        ctx.closePath();
        ctx.fillStyle = advDarken(color, 0.15);
        ctx.fill();
        ctx.globalAlpha *= 0.5;
        AdvArt.ellipse(ctx, x - r * 0.35, y - r * 0.45, r * 0.18, r * 0.3, '#ffffff', -0.4);
        ctx.globalAlpha /= 0.5;
        if (face) AdvArt.face(ctx, x, y + r * 0.05, r * 0.55, { blink: AdvArt.blink(t, x) });
    },

    gift(ctx, x, y, w, h, box = '#e8505b', ribbon = '#ffd447', lid = 0, lidTilt = 0) {
        // (x, y) is the bottom centre of the box
        const bx = x - w / 2, by = y - h;
        AdvArt.rr(ctx, bx, by, w, h, w * 0.06);
        ctx.fillStyle = box; ctx.fill();
        AdvArt.ink(ctx, w * 0.025, advDarken(box, 0.5), 0.5);
        ctx.fillStyle = ribbon;
        ctx.fillRect(x - w * 0.08, by, w * 0.16, h);
        // Lid
        ctx.save();
        ctx.translate(x, by - lid);
        ctx.rotate(lidTilt);
        AdvArt.rr(ctx, -w * 0.56, -h * 0.22, w * 1.12, h * 0.24, w * 0.05);
        ctx.fillStyle = advLighten(box, 0.08); ctx.fill();
        AdvArt.ink(ctx, w * 0.025, advDarken(box, 0.5), 0.5);
        ctx.fillStyle = ribbon;
        ctx.fillRect(-w * 0.08, -h * 0.22, w * 0.16, h * 0.24);
        // Bow
        for (const s of [-1, 1]) {
            ctx.beginPath();
            ctx.ellipse(s * w * 0.15, -h * 0.3, w * 0.16, w * 0.1, s * 0.5, 0, advTAU);
            ctx.fillStyle = ribbon; ctx.fill();
            AdvArt.ink(ctx, w * 0.02, advDarken(ribbon, 0.4), 0.5);
        }
        AdvArt.circle(ctx, 0, -h * 0.25, w * 0.06, advDarken(ribbon, 0.1));
        ctx.restore();
    },

    ornament(ctx, x, y, r, color = '#e8505b', pattern = 0, t = 0) {
        AdvArt.rr(ctx, x - r * 0.25, y - r * 1.22, r * 0.5, r * 0.32, r * 0.06);
        ctx.fillStyle = '#d9b44a'; ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y - r * 1.3, r * 0.15, Math.PI, 0);
        ctx.strokeStyle = '#a88a2e'; ctx.lineWidth = r * 0.07; ctx.stroke();
        AdvArt.circle(ctx, x, y, r, color);
        ctx.save();
        ctx.beginPath(); ctx.arc(x, y, r, 0, advTAU); ctx.clip();
        if (pattern === 1) {
            for (let i = -2; i <= 2; i++) {
                ctx.fillStyle = i % 2 ? '#ffffff' : advLighten(color, 0.35);
                ctx.fillRect(x - r, y + i * r * 0.36 - r * 0.07, r * 2, r * 0.14);
            }
        } else if (pattern === 2) {
            for (let i = 0; i < 6; i++) {
                AdvArt.circle(ctx, x + Math.cos(i) * r * 0.55, y + Math.sin(i * 2.1) * r * 0.55, r * 0.12, '#ffffff');
            }
        } else if (pattern === 3) {
            ctx.beginPath();
            for (let i = 0; i <= 8; i++) {
                const xx = x - r + (i / 8) * r * 2;
                ctx.lineTo(xx, y + (i % 2 ? -r * 0.18 : r * 0.18));
            }
            ctx.strokeStyle = '#fff3c4'; ctx.lineWidth = r * 0.14; ctx.stroke();
        }
        ctx.restore();
        AdvArt.ink(ctx, r * 0.06, advDarken(color, 0.5), 0.5);
        ctx.save();
        ctx.globalAlpha *= 0.55 + 0.3 * Math.sin(t * 2 + x);
        AdvArt.ellipse(ctx, x - r * 0.38, y - r * 0.38, r * 0.2, r * 0.32, '#ffffff', 0.7);
        ctx.restore();
    },

    candyCane(ctx, x, y, h, rot = 0, w = 0) {
        w = w || h * 0.14;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        const path = () => {
            ctx.beginPath();
            ctx.moveTo(0, h / 2);
            ctx.lineTo(0, -h / 2 + h * 0.18);
            ctx.arc(-h * 0.18, -h / 2 + h * 0.18, h * 0.18, 0, Math.PI, true);
        };
        path();
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = w; ctx.stroke();
        ctx.setLineDash([w * 0.7, w * 0.9]);
        path();
        ctx.strokeStyle = '#e8384f'; ctx.lineWidth = w * 0.8; ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
    },

    pine(ctx, x, y, h, color = '#3f8f5a', snow = false, trunk = '#7a5236') {
        // (x, y) is the base of the trunk
        ctx.fillStyle = trunk;
        ctx.fillRect(x - h * 0.06, y - h * 0.14, h * 0.12, h * 0.14);
        const tiers = 3;
        for (let i = 0; i < tiers; i++) {
            const ty = y - h * 0.12 - i * h * 0.26;
            const tw = h * (0.42 - i * 0.09);
            ctx.beginPath();
            ctx.moveTo(x - tw, ty);
            ctx.quadraticCurveTo(x, ty + h * 0.05, x + tw, ty);
            ctx.lineTo(x, ty - h * 0.42);
            ctx.closePath();
            ctx.fillStyle = i % 2 ? advLighten(color, 0.06) : color;
            ctx.fill();
            AdvArt.ink(ctx, h * 0.015, advDarken(color, 0.5), 0.45);
            if (snow) {
                ctx.beginPath();
                ctx.moveTo(x - tw * 0.55, ty - h * 0.18);
                ctx.lineTo(x, ty - h * 0.42);
                ctx.lineTo(x + tw * 0.55, ty - h * 0.18);
                ctx.quadraticCurveTo(x + tw * 0.25, ty - h * 0.12, x, ty - h * 0.17);
                ctx.quadraticCurveTo(x - tw * 0.25, ty - h * 0.12, x - tw * 0.55, ty - h * 0.18);
                ctx.fillStyle = '#ffffff';
                ctx.fill();
            }
        }
    },

    pumpkin(ctx, x, y, r, o = {}) {
        const color = o.color || '#f28c28';
        ctx.fillStyle = '#5c7a3a';
        ctx.beginPath();
        ctx.moveTo(x - r * 0.08, y - r * 0.82);
        ctx.quadraticCurveTo(x - r * 0.05, y - r * 1.2, x + r * 0.2, y - r * 1.25);
        ctx.lineTo(x + r * 0.12, y - r * 0.82);
        ctx.closePath();
        ctx.fill();
        for (const [dx, rx] of [[-0.48, 0.55], [0.48, 0.55], [-0.2, 0.55], [0.2, 0.55], [0, 0.45]]) {
            AdvArt.ellipse(ctx, x + dx * r, y, rx * r, r * 0.88, dx === 0 ? advLighten(color, 0.08) : color);
            AdvArt.ink(ctx, r * 0.04, advDarken(color, 0.45), 0.45);
        }
        if (o.face === 'jack') {
            const glow = o.glow == null ? 1 : o.glow;
            const fc = advMix('#5a2a10', '#ffe066', glow);
            ctx.fillStyle = fc;
            for (const s of [-1, 1]) {
                ctx.beginPath();
                ctx.moveTo(x + s * r * 0.15, y - r * 0.1);
                ctx.lineTo(x + s * r * 0.5, y - r * 0.12);
                ctx.lineTo(x + s * r * 0.33, y - r * 0.42);
                ctx.closePath();
                ctx.fill();
            }
            ctx.beginPath();
            ctx.moveTo(x - r * 0.55, y + r * 0.15);
            ctx.quadraticCurveTo(x, y + r * 0.75, x + r * 0.55, y + r * 0.15);
            ctx.lineTo(x + r * 0.32, y + r * 0.28);
            ctx.lineTo(x + r * 0.2, y + r * 0.15);
            ctx.lineTo(x + r * 0.05, y + r * 0.3);
            ctx.lineTo(x - r * 0.1, y + r * 0.15);
            ctx.lineTo(x - r * 0.25, y + r * 0.3);
            ctx.lineTo(x - r * 0.38, y + r * 0.17);
            ctx.closePath();
            ctx.fill();
        } else if (o.face) {
            AdvArt.face(ctx, x, y + r * 0.05, r * 0.6, { blink: AdvArt.blink(o.t || 0, x), mouth: o.mouth });
        }
    },

    egg(ctx, x, y, r, base = '#ffd1e3', accent = '#8fd3ff', pattern = 0, rot = 0) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        const path = () => {
            ctx.beginPath();
            ctx.moveTo(0, -r * 1.25);
            ctx.bezierCurveTo(r * 0.95, -r * 1.2, r * 1.05, r * 0.9, 0, r);
            ctx.bezierCurveTo(-r * 1.05, r * 0.9, -r * 0.95, -r * 1.2, 0, -r * 1.25);
        };
        path();
        ctx.fillStyle = base; ctx.fill();
        ctx.save();
        ctx.clip();
        if (pattern % 3 === 0) {
            ctx.beginPath();
            for (let i = 0; i <= 10; i++) ctx.lineTo(-r + (i / 10) * r * 2, -r * 0.1 + (i % 2 ? -r * 0.22 : r * 0.1));
            ctx.strokeStyle = accent; ctx.lineWidth = r * 0.18; ctx.stroke();
            ctx.fillStyle = advLighten(accent, 0.4);
            ctx.fillRect(-r, r * 0.35, r * 2, r * 0.16);
        } else if (pattern % 3 === 1) {
            for (let i = 0; i < 9; i++) {
                AdvArt.circle(ctx, (advHash(pattern, i) * 2 - 1) * r * 0.75, (advHash(pattern, i + 20) * 2 - 1.1) * r, r * 0.13, accent);
            }
        } else {
            for (let i = -2; i <= 2; i++) {
                ctx.fillStyle = i % 2 ? accent : advLighten(accent, 0.5);
                ctx.fillRect(-r, i * r * 0.42 - r * 0.08, r * 2, r * 0.16);
            }
        }
        ctx.restore();
        path();
        AdvArt.ink(ctx, r * 0.06, advDarken(base, 0.5), 0.5);
        ctx.restore();
    },

    mug(ctx, x, y, s, color = '#e8505b', face = true, t = 0) {
        // (x, y) is the bottom centre
        ctx.beginPath();
        ctx.arc(x + s * 0.55, y - s * 0.55, s * 0.28, -Math.PI / 2, Math.PI / 2);
        ctx.strokeStyle = color; ctx.lineWidth = s * 0.14; ctx.stroke();
        AdvArt.rr(ctx, x - s * 0.55, y - s * 1.0, s * 1.1, s, s * 0.18);
        ctx.fillStyle = color; ctx.fill();
        AdvArt.ink(ctx, s * 0.04, advDarken(color, 0.5), 0.5);
        AdvArt.ellipse(ctx, x, y - s * 0.97, s * 0.5, s * 0.1, '#7a4a2c');
        if (face) AdvArt.face(ctx, x, y - s * 0.5, s * 0.36, { blink: AdvArt.blink(t, x), mouth: 'cat' });
    },

    acorn(ctx, x, y, r, rot = 0) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        AdvArt.ellipse(ctx, 0, r * 0.25, r * 0.7, r * 0.85, '#c98a4b');
        AdvArt.ink(ctx, r * 0.06, '#6b4423', 0.5);
        ctx.beginPath();
        ctx.ellipse(0, -r * 0.3, r * 0.85, r * 0.5, 0, Math.PI, 0);
        ctx.quadraticCurveTo(0, -r * 0.05, -r * 0.85, -r * 0.3);
        ctx.fillStyle = '#7a5032'; ctx.fill();
        AdvArt.line(ctx, 0, -r * 0.75, r * 0.15, -r * 1.05, '#5a3a22', r * 0.14);
        ctx.restore();
    },

    apple(ctx, x, y, r, color = '#e8434f') {
        ctx.beginPath();
        ctx.moveTo(x, y - r * 0.6);
        ctx.bezierCurveTo(x + r * 1.2, y - r * 1.2, x + r * 1.2, y + r * 0.9, x, y + r * 0.85);
        ctx.bezierCurveTo(x - r * 1.2, y + r * 0.9, x - r * 1.2, y - r * 1.2, x, y - r * 0.6);
        ctx.fillStyle = color; ctx.fill();
        AdvArt.ink(ctx, r * 0.07, advDarken(color, 0.5), 0.5);
        AdvArt.line(ctx, x, y - r * 0.55, x + r * 0.1, y - r * 1.0, '#6b4423', r * 0.12);
        AdvArt.leaf(ctx, x + r * 0.35, y - r * 0.9, r * 0.6, 1.1, '#5cb85c');
        ctx.globalAlpha *= 0.5;
        AdvArt.ellipse(ctx, x - r * 0.4, y - r * 0.2, r * 0.13, r * 0.25, '#ffffff', 0.3);
        ctx.globalAlpha /= 0.5;
    },

    mushroom(ctx, x, y, r, cap = '#e8505b') {
        AdvArt.rr(ctx, x - r * 0.35, y - r * 0.9, r * 0.7, r * 0.9, r * 0.2);
        ctx.fillStyle = '#fff3dc'; ctx.fill();
        AdvArt.ink(ctx, r * 0.06);
        ctx.beginPath();
        ctx.ellipse(x, y - r * 0.85, r, r * 0.7, 0, Math.PI, 0);
        ctx.closePath();
        ctx.fillStyle = cap; ctx.fill();
        AdvArt.ink(ctx, r * 0.06, advDarken(cap, 0.5));
        for (const [dx, dy, rr] of [[-0.5, -1.05, 0.15], [0.1, -1.35, 0.17], [0.55, -1.0, 0.12]]) {
            AdvArt.circle(ctx, x + dx * r, y + dy * r, rr * r, '#ffffff');
        }
    },

    cupcake(ctx, x, y, s, frosting = '#ffb3d1', liner = '#7fc8f8') {
        // (x, y) is the bottom centre
        ctx.beginPath();
        ctx.moveTo(x - s * 0.5, y - s * 0.6);
        ctx.lineTo(x + s * 0.5, y - s * 0.6);
        ctx.lineTo(x + s * 0.38, y);
        ctx.lineTo(x - s * 0.38, y);
        ctx.closePath();
        ctx.fillStyle = liner; ctx.fill();
        AdvArt.ink(ctx, s * 0.03);
        for (let i = -2; i <= 2; i++) {
            AdvArt.line(ctx, x + i * s * 0.17, y - s * 0.58, x + i * s * 0.13, y - s * 0.03, advDarken(liner, 0.2), s * 0.03);
        }
        for (const [dx, dy, r] of [[-0.32, -0.68, 0.25], [0.32, -0.68, 0.25], [0, -0.75, 0.3], [-0.14, -0.95, 0.22], [0.14, -0.95, 0.22], [0, -1.12, 0.18]]) {
            AdvArt.circle(ctx, x + dx * s, y + dy * s, r * s, frosting);
        }
        const cols = ['#ff5d7d', '#ffd447', '#7fd8be', '#8fa8ff', '#ffffff'];
        for (let i = 0; i < 9; i++) {
            const sx = x + (advHash(s, i) - 0.5) * s * 0.75, sy = y - s * (0.7 + advHash(s, i + 9) * 0.4);
            AdvArt.line(ctx, sx, sy, sx + s * 0.05, sy + s * 0.02, cols[i % cols.length], s * 0.045);
        }
    },

    flame(ctx, x, y, h, t, seed = 0) {
        const f = 1 + 0.12 * Math.sin(t * 17 + seed) + 0.08 * Math.sin(t * 29 + seed * 2);
        const sway = Math.sin(t * 9 + seed) * h * 0.08;
        ctx.save();
        const g = ctx.createRadialGradient(x, y - h * 0.4, 0, x, y - h * 0.4, h * 1.4);
        g.addColorStop(0, 'rgba(255,220,120,0.45)');
        g.addColorStop(1, 'rgba(255,200,80,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - h * 1.4, y - h * 1.8, h * 2.8, h * 2.8);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x - h * 0.42, y - h * 0.35, x + sway, y - h * f);
        ctx.quadraticCurveTo(x + h * 0.42, y - h * 0.35, x, y);
        ctx.fillStyle = '#ff9a2e'; ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x - h * 0.2, y - h * 0.25, x + sway * 0.6, y - h * f * 0.6);
        ctx.quadraticCurveTo(x + h * 0.2, y - h * 0.25, x, y);
        ctx.fillStyle = '#ffe680'; ctx.fill();
        ctx.restore();
    },

    candle(ctx, x, y, h, color = '#ff8fb8', t = 0, lit = true) {
        const w = h * 0.22;
        AdvArt.rr(ctx, x - w / 2, y - h, w, h, w * 0.2);
        ctx.fillStyle = color; ctx.fill();
        AdvArt.ink(ctx, w * 0.1);
        ctx.save();
        ctx.beginPath(); ctx.rect(x - w / 2, y - h, w, h); ctx.clip();
        for (let i = 0; i < 5; i++) {
            AdvArt.line(ctx, x - w, y - h + i * w * 1.1, x + w, y - h + i * w * 1.1 + w * 0.8, '#ffffff', w * 0.25);
        }
        ctx.restore();
        AdvArt.line(ctx, x, y - h, x, y - h - w * 0.5, AdvArt.INK, w * 0.15);
        if (lit) AdvArt.flame(ctx, x, y - h - w * 0.35, h * 0.38, t, x);
    },

    lantern(ctx, x, y, r, color = '#e8384f', t = 0, glow = 1) {
        ctx.save();
        if (glow > 0) {
            const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 2.2);
            g.addColorStop(0, `rgba(255,190,90,${0.4 * glow})`);
            g.addColorStop(1, 'rgba(255,190,90,0)');
            ctx.fillStyle = g;
            ctx.fillRect(x - r * 2.2, y - r * 2.2, r * 4.4, r * 4.4);
        }
        ctx.fillStyle = '#d9a83a';
        ctx.fillRect(x - r * 0.45, y - r * 0.95, r * 0.9, r * 0.18);
        ctx.fillRect(x - r * 0.45, y + r * 0.77, r * 0.9, r * 0.18);
        AdvArt.ellipse(ctx, x, y, r * 1.05, r * 0.82, color);
        AdvArt.ink(ctx, r * 0.06, advDarken(color, 0.5), 0.6);
        for (const k of [-0.55, 0, 0.55]) {
            ctx.beginPath();
            ctx.ellipse(x, y, Math.abs(k) * r * 1.05 + 0.01, r * 0.82, 0, -Math.PI / 2, Math.PI / 2, k < 0);
            ctx.strokeStyle = advDarken(color, 0.25); ctx.lineWidth = r * 0.05; ctx.stroke();
        }
        ctx.globalAlpha *= 0.35 * glow;
        AdvArt.ellipse(ctx, x, y, r * 0.6, r * 0.5, '#ffe9a8');
        ctx.globalAlpha = 1;
        for (let i = -1; i <= 1; i++) {
            AdvArt.line(ctx, x + i * r * 0.15, y + r * 0.95, x + i * r * 0.18 + Math.sin(t * 2 + i) * r * 0.1, y + r * 1.5, '#d9a83a', r * 0.07);
        }
        ctx.restore();
    },

    bat(ctx, x, y, s, flap, color = '#4a3b5c') {
        const f = Math.sin(flap);
        ctx.save();
        ctx.translate(x, y);
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(side * s * 0.25, 0);
            ctx.quadraticCurveTo(side * s * 0.8, -s * (0.25 + f * 0.55), side * s * 1.25, -s * f * 0.3);
            ctx.quadraticCurveTo(side * s * 1.05, s * 0.2, side * s * 0.9, s * 0.15);
            ctx.quadraticCurveTo(side * s * 0.75, s * 0.4, side * s * 0.55, s * 0.2);
            ctx.quadraticCurveTo(side * s * 0.4, s * 0.4, side * s * 0.2, s * 0.25);
            ctx.closePath();
            ctx.fillStyle = color; ctx.fill();
        }
        AdvArt.circle(ctx, 0, 0, s * 0.38, color);
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(side * s * 0.12, -s * 0.28);
            ctx.lineTo(side * s * 0.3, -s * 0.6);
            ctx.lineTo(side * s * 0.33, -s * 0.18);
            ctx.closePath();
            ctx.fill();
        }
        AdvArt.circle(ctx, -s * 0.13, -s * 0.03, s * 0.08, '#ffffff');
        AdvArt.circle(ctx, s * 0.13, -s * 0.03, s * 0.08, '#ffffff');
        AdvArt.circle(ctx, -s * 0.12, -s * 0.02, s * 0.04, AdvArt.INK);
        AdvArt.circle(ctx, s * 0.14, -s * 0.02, s * 0.04, AdvArt.INK);
        AdvArt.line(ctx, -s * 0.05, s * 0.13, -s * 0.03, s * 0.2, '#ffffff', s * 0.05);
        AdvArt.line(ctx, s * 0.05, s * 0.13, s * 0.03, s * 0.2, '#ffffff', s * 0.05);
        ctx.restore();
    },

    fish(ctx, x, y, s, color = '#ff9a4d', dir = 1, t = 0) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(dir, 1);
        const wag = Math.sin(t * 8) * 0.25;
        ctx.save();
        ctx.translate(-s * 0.8, 0);
        ctx.rotate(wag);
        ctx.beginPath();
        ctx.moveTo(s * 0.1, 0);
        ctx.lineTo(-s * 0.55, -s * 0.45);
        ctx.quadraticCurveTo(-s * 0.35, 0, -s * 0.55, s * 0.45);
        ctx.closePath();
        ctx.fillStyle = advDarken(color, 0.1); ctx.fill();
        ctx.restore();
        AdvArt.ellipse(ctx, 0, 0, s, s * 0.62, color);
        AdvArt.ink(ctx, s * 0.06, advDarken(color, 0.5), 0.5);
        AdvArt.circle(ctx, s * 0.45, -s * 0.12, s * 0.15, AdvArt.INK);
        AdvArt.circle(ctx, s * 0.41, -s * 0.17, s * 0.06, '#ffffff');
        ctx.globalAlpha *= 0.5;
        AdvArt.ellipse(ctx, s * 0.35, s * 0.15, s * 0.12, s * 0.07, AdvArt.BLUSH);
        ctx.restore();
    },

    umbrella(ctx, x, y, r, color = '#ff6b8b', rot = 0) {
        // (x, y) is the top of the canopy
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        AdvArt.line(ctx, 0, 0, 0, r * 1.5, '#5a4a4a', r * 0.07);
        ctx.beginPath();
        ctx.arc(-r * 0.12, r * 1.5, r * 0.12, 0, Math.PI);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-r, r * 0.55);
        ctx.quadraticCurveTo(-r, -r * 0.05, 0, -r * 0.05);
        ctx.quadraticCurveTo(r, -r * 0.05, r, r * 0.55);
        for (let i = 3; i >= -3; i--) {
            const xx = (i / 3) * r;
            ctx.quadraticCurveTo(xx + r / 6, r * 0.38, xx, r * 0.55);
        }
        ctx.closePath();
        ctx.fillStyle = color; ctx.fill();
        AdvArt.ink(ctx, r * 0.05, advDarken(color, 0.5));
        ctx.restore();
    },

    drop(ctx, x, y, r, color = '#7fc8f8') {
        ctx.beginPath();
        ctx.moveTo(x, y - r * 1.6);
        ctx.quadraticCurveTo(x + r * 1.1, y, x, y + r);
        ctx.quadraticCurveTo(x - r * 1.1, y, x, y - r * 1.6);
        ctx.fillStyle = color; ctx.fill();
    },

    // A stubby rainbow arc centred on (x, y)
    rainbow(ctx, x, y, r, w, amount = 1) {
        const cols = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#4dabf7', '#9775fa'];
        ctx.save();
        ctx.lineCap = 'round';
        cols.forEach((c, i) => {
            ctx.beginPath();
            ctx.arc(x, y, r - i * w, Math.PI, Math.PI + Math.PI * amount);
            ctx.strokeStyle = c; ctx.lineWidth = w + 0.5;
            ctx.stroke();
        });
        ctx.restore();
    },

    coin(ctx, x, y, r, spin = 0) {
        const sx = Math.max(0.15, Math.abs(Math.cos(spin)));
        AdvArt.ellipse(ctx, x, y, r * sx, r, '#ffd447');
        AdvArt.ink(ctx, r * 0.12, '#b88a1a', 0.7);
        AdvArt.ellipse(ctx, x, y, r * sx * 0.6, r * 0.6, '#ffe58a');
    },

    firework(ctx, x, y, r, color, k, seed = 0) {
        // k: 0 -> 1 progress of the burst
        const n = 14;
        const alpha = 1 - advSmooth((k - 0.55) / 0.45);
        ctx.save();
        ctx.globalAlpha *= alpha;
        for (let i = 0; i < n; i++) {
            const a = (i / n) * advTAU + seed;
            const d = advEaseOut(k) * r;
            const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d + k * k * r * 0.25;
            AdvArt.line(ctx, x + Math.cos(a) * d * 0.7, y + Math.sin(a) * d * 0.7 + k * k * r * 0.2, px, py, color, r * 0.06);
            AdvArt.circle(ctx, px, py, r * 0.06, '#fffbe6');
        }
        ctx.restore();
    },

    confetti(ctx, x, y, s, rot, color) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.scale(1, Math.abs(Math.cos(rot * 1.7)) + 0.2);
        ctx.fillStyle = color;
        ctx.fillRect(-s, -s * 0.5, s * 2, s);
        ctx.restore();
    },

    speech(ctx, x, y, text, size, o = {}) {
        ctx.save();
        ctx.font = `700 ${size}px ${ADVENT_FONT_ROUND}`;
        const w = ctx.measureText(text).width + size * 0.9;
        const h = size * 1.5;
        const bx = x - w / 2, by = y - h;
        AdvArt.rr(ctx, bx, by, w, h, h * 0.45);
        ctx.fillStyle = o.fill || '#ffffff';
        ctx.fill();
        ctx.beginPath();
        const tailX = x + (o.tail || 0) * w * 0.3;
        ctx.moveTo(tailX - size * 0.3, by + h - 1);
        ctx.lineTo(tailX - size * 0.35 * (o.tailDir || 1) , by + h + size * 0.55);
        ctx.lineTo(tailX + size * 0.3, by + h - 1);
        ctx.closePath();
        ctx.fill();
        AdvArt.rr(ctx, bx, by, w, h, h * 0.45);
        AdvArt.ink(ctx, size * 0.08, AdvArt.INK, 0.35);
        ctx.fillStyle = o.color || AdvArt.INK;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, by + h * 0.53);
        ctx.restore();
    },

    zzz(ctx, x, y, t, size = 8, color = '#ffffff') {
        ctx.save();
        ctx.font = `700 ${size}px ${ADVENT_FONT_ROUND}`;
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        for (let i = 0; i < 3; i++) {
            const k = ((t * 0.45 + i / 3) % 1);
            ctx.globalAlpha = advPulse(k, 0, 1);
            ctx.font = `700 ${size * (0.7 + k * 0.6)}px ${ADVENT_FONT_ROUND}`;
            ctx.fillText('z', x + k * size * 1.6 + Math.sin(k * 6) * 2, y - k * size * 2.6);
        }
        ctx.restore();
    },

    // ---- the critter -----------------------------------------------------
    //
    // One routine draws every chibi animal in the calendar. (x, y) is the
    // centre of the head and `s` is the head radius; the body hangs below
    // it, so a critter stands about 2.3s tall. `o` takes:
    //   t        time, for blinking and idle motion
    //   wave     -1..1 how far the right arm is raised
    //   arms     'down' | 'up' | 'hug' | 'none'
    //   mouth    face mouth style; eyes: 'dot' | 'happy' | 'closed' | ...
    //   hat      'santa' | 'party' | 'witch' | 'top' | 'beanie' | 'earmuffs'
    //            | 'bow' | 'crown' | 'flower' | 'sunhat' | 'pilgrim' | 'antlers'
    //            | 'leprechaun' | 'chef' | 'scarf' (scarf goes on the neck)
    //   scarf    colour of a scarf
    //   body     false to draw a head only (peeking out of things)
    //   squash   >1 squashes, <1 stretches
    //   lookX    -1..1 eye direction
    //   color    override fur colour; nose: override nose colour (reindeer!)

    CRITTERS: {
        bunny:    { name: 'Bun', fur: '#f6efe8', belly: '#ffffff', ears: 'long', inner: '#ffb7c5', mouth: 'cat', nose: '#ff9bb0' },
        bear:     { name: 'Bear', fur: '#b98058', belly: '#e9c9a6', ears: 'round', inner: '#e9c9a6', muzzle: '#ecd2b4', nose: '#4a3328' },
        cat:      { name: 'Kitty', fur: '#f5a35c', belly: '#fff1dc', ears: 'pointy', inner: '#ffb7a0', mouth: 'cat', whiskers: true, stripes: true, tail: 'cat' },
        fox:      { name: 'Fox', fur: '#ee7a3b', belly: '#fff4e6', ears: 'pointy', inner: '#3b2a2a', muzzle: '#fff4e6', nose: '#3b2a2a', tail: 'fox' },
        mouse:    { name: 'Mouse', fur: '#bdb6c9', belly: '#ece8f2', ears: 'big', inner: '#ffb7c5', nose: '#ff9bb0', whiskers: true, tail: 'mouse' },
        penguin:  { name: 'Penguin', fur: '#34405a', belly: '#ffffff', ears: 'none', mask: '#ffffff', beak: '#ffab3d', flippers: true },
        owl:      { name: 'Owl', fur: '#9a7354', belly: '#eedcc0', ears: 'tufts', eyeRing: '#fff3dc', beak: '#ffb347', flippers: true },
        frog:     { name: 'Froggy', fur: '#7cc46a', belly: '#d9f2c4', ears: 'frog', mouth: 'grin' },
        chick:    { name: 'Chick', fur: '#ffd84d', belly: '#fff0a8', ears: 'tuft', beak: '#ff9a3d', flippers: true },
        duck:     { name: 'Duckling', fur: '#ffe066', belly: '#fff3b0', ears: 'tuft', bill: '#ff9a3d', flippers: true },
        pig:      { name: 'Piglet', fur: '#f9b9c8', belly: '#ffd6e0', ears: 'pointy', inner: '#f28aa5', snout: '#f28aa5' },
        hedgehog: { name: 'Hedgie', fur: '#f3d9b8', belly: '#fff0dc', ears: 'spiky', spikes: '#8a6248', nose: '#3b2a2a' },
        squirrel: { name: 'Squirrel', fur: '#c97a45', belly: '#f6dfc4', ears: 'pointy', inner: '#f6b39a', tail: 'squirrel', nose: '#5a3328' },
        reindeer: { name: 'Reindeer', fur: '#b07b4b', belly: '#ecd2b4', ears: 'pointy', inner: '#ecd2b4', antlers: true, muzzle: '#ecd2b4', nose: '#e8384f' },
        alien:    { name: 'Zib', fur: '#9be37a', belly: '#d4f7c0', ears: 'antenna', eyes3: true },
        dragon:   { name: 'Dragon', fur: '#7fd39b', belly: '#fff0b8', ears: 'horns', inner: '#ffd447', spinesColor: '#4fae76', tail: 'dragon' },
        monster:  { name: 'Mo', fur: '#a785e8', belly: '#d9c8ff', ears: 'horns', inner: '#fff3c4', cyclops: true, mouth: 'grin' },
        sheep:    { name: 'Lamb', fur: '#f3dcc8', belly: '#ffffff', ears: 'droop', wool: '#fffaf2', inner: '#ffc1cc' },
        bee:      { name: 'Bee', fur: '#ffd23f', belly: '#ffe680', ears: 'antenna', stripes: true, wings: true },
        octopus:  { name: 'Octo', fur: '#f58fb4', belly: '#ffc4da', ears: 'none', tentacles: true },
        cow:      { name: 'Moo', fur: '#ffffff', belly: '#ffd6e0', ears: 'droop', inner: '#ffc1cc', snout: '#ffc1cc', spots: true },
        ghost:    { name: 'Ghostie', special: 'ghost' },
        snowman:  { name: 'Snowy', special: 'snowman' },
        ginger:   { name: 'Ginger', special: 'ginger' },
        turkey:   { name: 'Turkey', special: 'turkey' }
    },

    critterName(kind) {
        const def = AdvArt.CRITTERS[kind];
        return def ? def.name : 'Friend';
    },

    critter(ctx, kind, x, y, s, o = {}) {
        const def = AdvArt.CRITTERS[kind] || AdvArt.CRITTERS.bunny;
        const t = o.t || 0;
        const seed = o.seed != null ? o.seed : x * 0.37 + y * 0.11;

        ctx.save();
        ctx.translate(x, y);
        if (o.flip) ctx.scale(-1, 1);
        if (o.squash) {
            // Squash about the feet so a landing hop flattens into the ground
            ctx.translate(0, s * 1.6);
            ctx.scale(Math.sqrt(o.squash), 1 / Math.sqrt(o.squash));
            ctx.translate(0, -s * 1.6);
        }
        if (o.rot) ctx.rotate(o.rot);
        ctx.lineJoin = 'round';

        if (def.special) {
            AdvArt['critter_' + def.special](ctx, s, o, t, seed);
            ctx.restore();
            return;
        }

        const fur = o.color || def.fur;
        const belly = def.belly;
        const outline = advDarken(fur === '#ffffff' ? '#c9b8b8' : fur, 0.45);
        const blink = o.blink != null ? o.blink : AdvArt.blink(t, seed);
        const bodyOn = o.body !== false;

        // Tail sits behind everything
        if (bodyOn && def.tail) AdvArt.critterTail(ctx, def, fur, s, t, outline);
        if (bodyOn && def.wings) {
            const f = Math.sin(t * 40) * 0.3;
            ctx.globalAlpha *= 0.75;
            AdvArt.ellipse(ctx, -s * 0.75, s * 0.4, s * 0.45, s * 0.28, '#e8f6ff', -0.6 - f);
            AdvArt.ellipse(ctx, s * 0.75, s * 0.4, s * 0.45, s * 0.28, '#e8f6ff', 0.6 + f);
            ctx.globalAlpha /= 0.75;
        }

        // Body
        if (bodyOn) {
            if (def.tentacles) {
                for (let i = 0; i < 5; i++) {
                    const bx = (i - 2) * s * 0.32;
                    const wig = Math.sin(t * 3 + i * 1.3) * s * 0.18;
                    ctx.beginPath();
                    ctx.moveTo(bx - s * 0.13, s * 0.6);
                    ctx.quadraticCurveTo(bx + wig, s * 1.2, bx + wig * 1.4 + (i - 2) * s * 0.12, s * 1.5);
                    ctx.quadraticCurveTo(bx + wig * 0.6 + s * 0.16, s * 1.15, bx + s * 0.13, s * 0.6);
                    ctx.fillStyle = fur; ctx.fill();
                    AdvArt.ink(ctx, s * 0.05, outline, 0.5);
                }
            } else {
                // Feet
                AdvArt.ellipse(ctx, -s * 0.32, s * 1.5, s * 0.26, s * 0.15, def.beak && def.flippers ? def.beak : advDarken(fur, 0.08));
                AdvArt.ellipse(ctx, s * 0.32, s * 1.5, s * 0.26, s * 0.15, def.beak && def.flippers ? def.beak : advDarken(fur, 0.08));
                AdvArt.ellipse(ctx, 0, s * 1.02, s * 0.72, s * 0.56, fur);
                AdvArt.ink(ctx, s * 0.06, outline, 0.5);
                AdvArt.ellipse(ctx, 0, s * 1.1, s * 0.45, s * 0.38, belly);
                if (def.stripes && kind === 'bee') {
                    ctx.save();
                    AdvArt.ellipse(ctx, 0, s * 1.02, s * 0.72, s * 0.56);
                    ctx.clip();
                    ctx.fillStyle = '#3b2a2a';
                    ctx.fillRect(-s, s * 0.85, s * 2, s * 0.14);
                    ctx.fillRect(-s, s * 1.15, s * 2, s * 0.14);
                    ctx.restore();
                }
                if (def.spots) {
                    AdvArt.ellipse(ctx, -s * 0.4, s * 0.95, s * 0.16, s * 0.12, '#3b2a2a');
                    AdvArt.ellipse(ctx, s * 0.45, s * 1.15, s * 0.12, s * 0.1, '#3b2a2a');
                }
                if (def.wool) {
                    for (let i = 0; i < 9; i++) {
                        const a = (i / 9) * advTAU;
                        AdvArt.circle(ctx, Math.cos(a) * s * 0.55, s * 1.02 + Math.sin(a) * s * 0.42, s * 0.24, def.wool);
                    }
                    AdvArt.ellipse(ctx, 0, s * 1.02, s * 0.6, s * 0.45, def.wool);
                }
            }

            if (o.scarf) {
                ctx.beginPath();
                ctx.ellipse(0, s * 0.62, s * 0.62, s * 0.18, 0, 0, advTAU);
                ctx.fillStyle = o.scarf; ctx.fill();
                AdvArt.rr(ctx, s * 0.2, s * 0.62, s * 0.24, s * 0.62, s * 0.08);
                ctx.fill();
                AdvArt.ink(ctx, s * 0.04, advDarken(o.scarf, 0.4), 0.5);
                for (let i = 0; i < 3; i++) {
                    AdvArt.line(ctx, s * 0.24 + i * s * 0.08, s * 1.24, s * 0.24 + i * s * 0.08, s * 1.32, advDarken(o.scarf, 0.2), s * 0.04);
                }
            }

            // Arms
            const arms = o.arms || 'down';
            if (arms !== 'none' && !def.tentacles) {
                const armColor = def.flippers ? advDarken(fur, 0.05) : fur;
                const wave = o.wave || 0;
                const left = arms === 'up' ? -2.4 : arms === 'hug' ? -0.9 : 0.35;
                const right = arms === 'up' ? 2.4 : arms === 'hug' ? 0.9 : -0.35 - wave * 2.3;
                for (const [side, ang] of [[-1, left], [1, right]]) {
                    ctx.save();
                    ctx.translate(side * s * 0.55, s * 0.82);
                    ctx.rotate(ang);
                    AdvArt.ellipse(ctx, 0, s * 0.28, s * (def.flippers ? 0.15 : 0.16), s * 0.3, armColor);
                    AdvArt.ink(ctx, s * 0.05, outline, 0.45);
                    ctx.restore();
                }
                if (o.hold) {
                    ctx.save();
                    ctx.translate(s * 0.55 + Math.sin(right) * s * 0.55, s * 0.82 + Math.cos(right) * s * 0.55);
                    o.hold(ctx, s);
                    ctx.restore();
                }
            }
        }

        // Ears (behind the head)
        AdvArt.critterEars(ctx, def, fur, s, t, outline);

        // Head
        if (def.spikes) {
            ctx.beginPath();
            for (let i = 0; i <= 14; i++) {
                const a = Math.PI * 0.85 + (i / 14) * Math.PI * 1.3;
                const rad = i % 2 ? s * 1.05 : s * 1.32;
                ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad - s * 0.05);
            }
            ctx.closePath();
            ctx.fillStyle = def.spikes; ctx.fill();
            AdvArt.ink(ctx, s * 0.05, advDarken(def.spikes, 0.4), 0.5);
        }
        if (def.wool) {
            for (let i = 0; i < 10; i++) {
                const a = Math.PI * 0.95 + (i / 9) * Math.PI * 1.1;
                AdvArt.circle(ctx, Math.cos(a) * s * 0.9, Math.sin(a) * s * 0.85 - s * 0.05, s * 0.32, def.wool);
            }
        }
        AdvArt.ellipse(ctx, 0, 0, s * 1.02, s * 0.94, fur);
        AdvArt.ink(ctx, s * 0.06, outline, 0.5);
        if (def.wool) {
            for (let i = 0; i < 5; i++) AdvArt.circle(ctx, (i - 2) * s * 0.3, -s * 0.78 + Math.abs(i - 2) * s * 0.08, s * 0.26, def.wool);
        }
        if (def.mask) {
            ctx.beginPath();
            ctx.ellipse(-s * 0.32, s * 0.12, s * 0.42, s * 0.55, 0.2, 0, advTAU);
            ctx.ellipse(s * 0.32, s * 0.12, s * 0.42, s * 0.55, -0.2, 0, advTAU);
            ctx.fillStyle = def.mask; ctx.fill();
        }
        if (def.stripes && kind === 'cat') {
            for (const dx of [-0.22, 0, 0.22]) {
                AdvArt.line(ctx, dx * s, -s * 0.9, dx * s * 1.1, -s * 0.62, advDarken(fur, 0.18), s * 0.09);
            }
        }
        if (def.spots) {
            AdvArt.ellipse(ctx, s * 0.5, -s * 0.45, s * 0.25, s * 0.2, '#3b2a2a', 0.4);
        }
        if (def.eyeRing) {
            AdvArt.circle(ctx, -s * 0.42, -s * 0.02, s * 0.36, def.eyeRing);
            AdvArt.circle(ctx, s * 0.42, -s * 0.02, s * 0.36, def.eyeRing);
        }
        if (def.muzzle) AdvArt.ellipse(ctx, 0, s * 0.35, s * 0.42, s * 0.3, def.muzzle);
        if (def.belly && kind === 'fox') {
            ctx.beginPath();
            ctx.moveTo(-s * 0.98, s * 0.05);
            ctx.quadraticCurveTo(-s * 0.4, s * 0.1, 0, s * 0.25);
            ctx.quadraticCurveTo(s * 0.4, s * 0.1, s * 0.98, s * 0.05);
            ctx.quadraticCurveTo(s * 0.7, s * 0.85, 0, s * 0.92);
            ctx.quadraticCurveTo(-s * 0.7, s * 0.85, -s * 0.98, s * 0.05);
            ctx.fillStyle = def.belly; ctx.fill();
        }

        // Face
        const faceOpts = {
            blink, eyes: o.eyes, mouth: o.mouth || def.mouth || 'smile',
            lookX: o.lookX, lookY: o.lookY,
            eyeSize: def.eyeRing ? 0.2 : def.cyclops ? 0.3 : 0.16,
            eyeSpread: def.eyeRing ? 0.42 : 0.4,
            blush: o.blush !== false
        };
        if (def.cyclops) {
            AdvArt.circle(ctx, 0, -s * 0.12, s * 0.34, '#ffffff');
            AdvArt.ink(ctx, s * 0.04, outline, 0.4);
            AdvArt.face(ctx, 0, -s * 0.12, s, Object.assign({}, faceOpts, { oneEye: true, blush: false, mouth: 'none', eyeSize: 0.2 }));
            AdvArt.face(ctx, 0, s * 0.1, s, { eyes: 'none', mouth: faceOpts.mouth, eyeSpread: 0.45 });
        } else {
            AdvArt.face(ctx, 0, 0.02 * s, s, faceOpts);
        }
        if (def.whiskers) {
            for (const side of [-1, 1]) {
                for (const k of [-1, 1]) {
                    AdvArt.line(ctx, side * s * 0.62, s * 0.25 + k * s * 0.05, side * s * 1.08, s * 0.2 + k * s * 0.13, advDarken(fur, 0.4), s * 0.03);
                }
            }
        }
        if (def.nose && !o.noNose) {
            const nc = o.nose || def.nose;
            AdvArt.ellipse(ctx, 0, s * 0.18, s * (kind === 'reindeer' ? 0.14 : 0.09), s * (kind === 'reindeer' ? 0.11 : 0.065), nc);
            if (o.noseGlow) {
                const g = ctx.createRadialGradient(0, s * 0.18, 0, 0, s * 0.18, s * 0.6);
                g.addColorStop(0, advRgba(nc, 0.6 * o.noseGlow));
                g.addColorStop(1, advRgba(nc, 0));
                ctx.fillStyle = g;
                ctx.fillRect(-s * 0.6, -s * 0.42, s * 1.2, s * 1.2);
            }
        }
        if (def.snout) {
            AdvArt.ellipse(ctx, 0, s * 0.3, s * 0.26, s * 0.18, def.snout);
            AdvArt.ellipse(ctx, -s * 0.08, s * 0.3, s * 0.04, s * 0.06, advDarken(def.snout, 0.4));
            AdvArt.ellipse(ctx, s * 0.08, s * 0.3, s * 0.04, s * 0.06, advDarken(def.snout, 0.4));
        }
        if (def.beak) {
            ctx.beginPath();
            ctx.moveTo(-s * 0.14, s * 0.15);
            ctx.lineTo(s * 0.14, s * 0.15);
            ctx.lineTo(0, s * 0.36);
            ctx.closePath();
            ctx.fillStyle = def.beak; ctx.fill();
        }
        if (def.bill) {
            AdvArt.ellipse(ctx, 0, s * 0.3, s * 0.28, s * 0.13, def.bill);
            AdvArt.ink(ctx, s * 0.04, advDarken(def.bill, 0.4), 0.5);
        }

        if (o.hat) AdvArt.hat(ctx, o.hat, s, t, o.hatColor);
        ctx.restore();
    },

    critterEars(ctx, def, fur, s, t, outline) {
        const inner = def.inner || advLighten(fur, 0.3);
        switch (def.ears) {
            case 'long': {
                for (const side of [-1, 1]) {
                    const flop = side === 1 ? Math.sin(t * 1.3) * 0.08 : 0;
                    ctx.save();
                    ctx.translate(side * s * 0.38, -s * 0.7);
                    ctx.rotate(side * 0.18 + flop);
                    AdvArt.ellipse(ctx, 0, -s * 0.6, s * 0.25, s * 0.7, fur);
                    AdvArt.ink(ctx, s * 0.05, outline, 0.5);
                    AdvArt.ellipse(ctx, 0, -s * 0.55, s * 0.12, s * 0.52, inner);
                    ctx.restore();
                }
                break;
            }
            case 'round':
            case 'big': {
                const r = def.ears === 'big' ? 0.45 : 0.3;
                const dx = def.ears === 'big' ? 0.72 : 0.68;
                for (const side of [-1, 1]) {
                    AdvArt.circle(ctx, side * s * dx, -s * 0.68, s * r, fur);
                    AdvArt.ink(ctx, s * 0.05, outline, 0.5);
                    AdvArt.circle(ctx, side * s * dx, -s * 0.66, s * r * 0.58, inner);
                }
                break;
            }
            case 'pointy': {
                for (const side of [-1, 1]) {
                    ctx.beginPath();
                    ctx.moveTo(side * s * 0.25, -s * 0.8);
                    ctx.lineTo(side * s * 0.72, -s * 1.28);
                    ctx.lineTo(side * s * 0.9, -s * 0.4);
                    ctx.closePath();
                    ctx.fillStyle = fur; ctx.fill();
                    AdvArt.ink(ctx, s * 0.05, outline, 0.5);
                    ctx.beginPath();
                    ctx.moveTo(side * s * 0.4, -s * 0.78);
                    ctx.lineTo(side * s * 0.7, -s * 1.1);
                    ctx.lineTo(side * s * 0.8, -s * 0.55);
                    ctx.closePath();
                    ctx.fillStyle = inner; ctx.fill();
                }
                if (def.antlers) AdvArt.antlers(ctx, s);
                break;
            }
            case 'droop': {
                for (const side of [-1, 1]) {
                    AdvArt.ellipse(ctx, side * s * 0.95, -s * 0.2, s * 0.38, s * 0.17, fur, side * 0.5);
                    AdvArt.ellipse(ctx, side * s * 0.95, -s * 0.2, s * 0.24, s * 0.09, inner, side * 0.5);
                }
                break;
            }
            case 'tufts': {
                for (const side of [-1, 1]) {
                    ctx.beginPath();
                    ctx.moveTo(side * s * 0.3, -s * 0.8);
                    ctx.quadraticCurveTo(side * s * 0.75, -s * 1.15, side * s * 0.85, -s * 1.25);
                    ctx.quadraticCurveTo(side * s * 0.95, -s * 0.8, side * s * 0.8, -s * 0.5);
                    ctx.closePath();
                    ctx.fillStyle = fur; ctx.fill();
                }
                break;
            }
            case 'tuft': {
                ctx.beginPath();
                ctx.moveTo(-s * 0.1, -s * 0.88);
                ctx.quadraticCurveTo(-s * 0.15, -s * 1.3, s * 0.12, -s * 1.25);
                ctx.quadraticCurveTo(-s * 0.02, -s * 1.1, s * 0.12, -s * 0.9);
                ctx.fillStyle = fur; ctx.fill();
                break;
            }
            case 'frog': {
                for (const side of [-1, 1]) {
                    AdvArt.circle(ctx, side * s * 0.5, -s * 0.72, s * 0.36, fur);
                    AdvArt.ink(ctx, s * 0.05, outline, 0.5);
                }
                break;
            }
            case 'spiky': {
                break;
            }
            case 'antenna': {
                for (const side of [-1, 1]) {
                    const w = Math.sin(t * 3 + side) * s * 0.1;
                    ctx.beginPath();
                    ctx.moveTo(side * s * 0.3, -s * 0.8);
                    ctx.quadraticCurveTo(side * s * 0.4, -s * 1.3, side * s * 0.55 + w, -s * 1.45);
                    ctx.strokeStyle = def.stripes ? AdvArt.INK : advDarken(fur, 0.2);
                    ctx.lineWidth = s * 0.07; ctx.lineCap = 'round'; ctx.stroke();
                    AdvArt.circle(ctx, side * s * 0.55 + w, -s * 1.45, s * 0.13, def.stripes ? AdvArt.INK : '#ffe066');
                }
                break;
            }
            case 'horns': {
                for (const side of [-1, 1]) {
                    ctx.beginPath();
                    ctx.moveTo(side * s * 0.3, -s * 0.8);
                    ctx.quadraticCurveTo(side * s * 0.55, -s * 1.15, side * s * 0.5, -s * 1.38);
                    ctx.quadraticCurveTo(side * s * 0.75, -s * 1.0, side * s * 0.65, -s * 0.65);
                    ctx.closePath();
                    ctx.fillStyle = inner; ctx.fill();
                    AdvArt.ink(ctx, s * 0.04, advDarken(inner, 0.4), 0.5);
                }
                if (def.spinesColor) {
                    for (let i = 0; i < 3; i++) {
                        ctx.beginPath();
                        ctx.moveTo(-s * 0.12, -s * 0.9 + i * 0.01);
                        ctx.lineTo(0, -s * 1.15 + i * s * 0.05);
                        ctx.lineTo(s * 0.12, -s * 0.9);
                        ctx.fillStyle = def.spinesColor; ctx.fill();
                    }
                }
                break;
            }
        }
    },

    antlers(ctx, s) {
        ctx.save();
        ctx.strokeStyle = '#8a5a32';
        ctx.lineWidth = s * 0.11;
        ctx.lineCap = 'round';
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(side * s * 0.3, -s * 0.85);
            ctx.quadraticCurveTo(side * s * 0.45, -s * 1.4, side * s * 0.9, -s * 1.65);
            ctx.moveTo(side * s * 0.4, -s * 1.25);
            ctx.lineTo(side * s * 0.15, -s * 1.55);
            ctx.moveTo(side * s * 0.62, -s * 1.5);
            ctx.lineTo(side * s * 0.55, -s * 1.8);
            ctx.stroke();
        }
        ctx.restore();
    },

    critterTail(ctx, def, fur, s, t, outline) {
        const sw = Math.sin(t * 2.2) * 0.25;
        ctx.save();
        ctx.translate(-s * 0.5, s * 1.25);
        ctx.rotate(sw);
        switch (def.tail) {
            case 'cat':
            case 'mouse':
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.bezierCurveTo(-s * 0.7, s * 0.1, -s * 0.9, -s * 0.5, -s * 0.65, -s * 0.9);
                ctx.strokeStyle = def.tail === 'mouse' ? '#f2a7b8' : fur;
                ctx.lineWidth = s * (def.tail === 'mouse' ? 0.08 : 0.2);
                ctx.lineCap = 'round';
                ctx.stroke();
                break;
            case 'fox':
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.quadraticCurveTo(-s * 1.0, s * 0.2, -s * 1.05, -s * 0.6);
                ctx.quadraticCurveTo(-s * 0.6, -s * 0.2, 0, -s * 0.25);
                ctx.fillStyle = fur; ctx.fill();
                AdvArt.ink(ctx, s * 0.05, outline, 0.5);
                AdvArt.ellipse(ctx, -s * 0.98, -s * 0.5, s * 0.13, s * 0.18, '#ffffff', 0.4);
                break;
            case 'squirrel':
                ctx.beginPath();
                ctx.moveTo(s * 0.1, 0);
                ctx.bezierCurveTo(-s * 1.2, s * 0.3, -s * 1.2, -s * 1.5, -s * 0.3, -s * 1.6);
                ctx.bezierCurveTo(-s * 0.9, -s * 1.1, -s * 0.5, -s * 0.4, s * 0.1, -s * 0.35);
                ctx.fillStyle = advLighten(fur, 0.08); ctx.fill();
                AdvArt.ink(ctx, s * 0.05, outline, 0.5);
                break;
            case 'dragon':
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.quadraticCurveTo(-s * 0.9, s * 0.4, -s * 1.1, -s * 0.2);
                ctx.lineTo(-s * 0.85, -s * 0.05);
                ctx.quadraticCurveTo(-s * 0.6, 0, 0, -s * 0.3);
                ctx.fillStyle = fur; ctx.fill();
                AdvArt.ink(ctx, s * 0.05, outline, 0.5);
                break;
        }
        ctx.restore();
    },

    hat(ctx, kind, s, t, color) {
        ctx.save();
        switch (kind) {
            case 'santa': {
                const c = color || '#e8384f';
                ctx.beginPath();
                ctx.moveTo(-s * 0.8, -s * 0.55);
                ctx.quadraticCurveTo(-s * 0.3, -s * 1.7, s * 0.55, -s * 1.35 + Math.sin(t * 2) * s * 0.05);
                ctx.quadraticCurveTo(s * 0.3, -s * 0.9, s * 0.8, -s * 0.55);
                ctx.closePath();
                ctx.fillStyle = c; ctx.fill();
                AdvArt.ink(ctx, s * 0.05, advDarken(c, 0.5));
                AdvArt.rr(ctx, -s * 0.9, -s * 0.72, s * 1.8, s * 0.3, s * 0.15);
                ctx.fillStyle = '#ffffff'; ctx.fill();
                AdvArt.ink(ctx, s * 0.04, '#c9c0c0');
                AdvArt.circle(ctx, s * 0.6, -s * 1.35 + Math.sin(t * 2) * s * 0.05, s * 0.2, '#ffffff');
                break;
            }
            case 'party': {
                const c = color || '#8fa8ff';
                ctx.save();
                ctx.translate(s * 0.2, -s * 0.7);
                ctx.rotate(0.25);
                ctx.beginPath();
                ctx.moveTo(-s * 0.4, 0);
                ctx.lineTo(0, -s * 1.0);
                ctx.lineTo(s * 0.4, 0);
                ctx.closePath();
                ctx.fillStyle = c; ctx.fill();
                ctx.save(); ctx.clip();
                for (let i = 0; i < 4; i++) {
                    AdvArt.line(ctx, -s * 0.5, -i * s * 0.28, s * 0.5, -i * s * 0.28 - s * 0.2, '#ffffff', s * 0.08);
                }
                ctx.restore();
                AdvArt.ink(ctx, s * 0.04, advDarken(c, 0.5));
                AdvArt.circle(ctx, 0, -s * 1.02, s * 0.14, '#ffd447');
                ctx.restore();
                break;
            }
            case 'witch': {
                const c = color || '#4a3b6b';
                AdvArt.ellipse(ctx, 0, -s * 0.72, s * 1.2, s * 0.22, c);
                ctx.beginPath();
                ctx.moveTo(-s * 0.6, -s * 0.75);
                ctx.quadraticCurveTo(-s * 0.2, -s * 1.5, s * 0.15, -s * 2.0);
                ctx.quadraticCurveTo(s * 0.25, -s * 1.6, s * 0.6, -s * 1.85);
                ctx.quadraticCurveTo(s * 0.3, -s * 1.4, s * 0.6, -s * 0.75);
                ctx.closePath();
                ctx.fillStyle = c; ctx.fill();
                AdvArt.ink(ctx, s * 0.04, advDarken(c, 0.5));
                ctx.fillStyle = '#ff9a3d';
                ctx.fillRect(-s * 0.55, -s * 0.98, s * 1.1, s * 0.16);
                break;
            }
            case 'top':
            case 'leprechaun':
            case 'pilgrim': {
                const c = color || (kind === 'leprechaun' ? '#2f9e57' : '#2d2a35');
                AdvArt.ellipse(ctx, 0, -s * 0.78, s * 0.95, s * 0.18, c);
                AdvArt.rr(ctx, -s * 0.55, -s * 1.6, s * 1.1, s * 0.85, s * 0.08);
                ctx.fillStyle = c; ctx.fill();
                AdvArt.ink(ctx, s * 0.04, advDarken(c, 0.5));
                ctx.fillStyle = kind === 'leprechaun' ? '#2d2a35' : kind === 'pilgrim' ? '#2d2a35' : '#e8384f';
                ctx.fillRect(-s * 0.55, -s * 1.0, s * 1.1, s * 0.18);
                if (kind !== 'top') {
                    AdvArt.rr(ctx, -s * 0.17, -s * 1.04, s * 0.34, s * 0.26, s * 0.04);
                    ctx.strokeStyle = '#ffd447'; ctx.lineWidth = s * 0.07; ctx.stroke();
                }
                if (kind === 'leprechaun') AdvArt.clover(ctx, s * 0.38, -s * 1.15, s * 0.16, '#7ddc8c', 3);
                break;
            }
            case 'beanie': {
                const c = color || '#5aa9e6';
                ctx.beginPath();
                ctx.ellipse(0, -s * 0.55, s * 0.95, s * 0.75, 0, Math.PI, 0);
                ctx.fillStyle = c; ctx.fill();
                AdvArt.ink(ctx, s * 0.04, advDarken(c, 0.5));
                AdvArt.rr(ctx, -s * 0.98, -s * 0.72, s * 1.96, s * 0.3, s * 0.12);
                ctx.fillStyle = advLighten(c, 0.35); ctx.fill();
                for (let i = -4; i <= 4; i++) AdvArt.line(ctx, i * s * 0.2, -s * 0.68, i * s * 0.2, -s * 0.46, advDarken(c, 0.05), s * 0.05);
                AdvArt.circle(ctx, 0, -s * 1.32, s * 0.24, advLighten(c, 0.6));
                break;
            }
            case 'earmuffs': {
                const c = color || '#ff8fb8';
                ctx.beginPath();
                ctx.arc(0, -s * 0.15, s * 1.0, Math.PI * 1.1, Math.PI * 1.9);
                ctx.strokeStyle = '#8b8fa8'; ctx.lineWidth = s * 0.1; ctx.stroke();
                AdvArt.circle(ctx, -s * 0.95, -s * 0.2, s * 0.3, c);
                AdvArt.circle(ctx, s * 0.95, -s * 0.2, s * 0.3, c);
                break;
            }
            case 'bow': {
                const c = color || '#ff5d8f';
                ctx.translate(s * 0.55, -s * 0.75);
                AdvArt.ellipse(ctx, -s * 0.22, 0, s * 0.24, s * 0.16, c, 0.5);
                AdvArt.ellipse(ctx, s * 0.22, 0, s * 0.24, s * 0.16, c, -0.5);
                AdvArt.circle(ctx, 0, 0, s * 0.1, advDarken(c, 0.15));
                break;
            }
            case 'crown': {
                const c = color || '#ffd447';
                ctx.beginPath();
                ctx.moveTo(-s * 0.5, -s * 0.8);
                ctx.lineTo(-s * 0.55, -s * 1.3);
                ctx.lineTo(-s * 0.25, -s * 1.05);
                ctx.lineTo(0, -s * 1.4);
                ctx.lineTo(s * 0.25, -s * 1.05);
                ctx.lineTo(s * 0.55, -s * 1.3);
                ctx.lineTo(s * 0.5, -s * 0.8);
                ctx.closePath();
                ctx.fillStyle = c; ctx.fill();
                AdvArt.ink(ctx, s * 0.04, advDarken(c, 0.5));
                AdvArt.circle(ctx, 0, -s * 0.95, s * 0.08, '#e8384f');
                break;
            }
            case 'flower': {
                AdvArt.flower(ctx, s * 0.55, -s * 0.75, s * 0.3, color || '#ff8fb8', '#ffd447');
                break;
            }
            case 'sunhat': {
                const c = color || '#f5d38a';
                AdvArt.ellipse(ctx, 0, -s * 0.7, s * 1.35, s * 0.28, c);
                AdvArt.ink(ctx, s * 0.04, advDarken(c, 0.4));
                ctx.beginPath();
                ctx.ellipse(0, -s * 0.75, s * 0.62, s * 0.55, 0, Math.PI, 0);
                ctx.fillStyle = c; ctx.fill();
                AdvArt.ink(ctx, s * 0.04, advDarken(c, 0.4));
                ctx.fillStyle = '#ff6b8b';
                ctx.fillRect(-s * 0.62, -s * 0.92, s * 1.24, s * 0.14);
                break;
            }
            case 'antlers':
                AdvArt.antlers(ctx, s);
                break;
            case 'chef': {
                AdvArt.rr(ctx, -s * 0.5, -s * 1.15, s, s * 0.45, s * 0.05);
                ctx.fillStyle = '#ffffff'; ctx.fill();
                for (const dx of [-0.35, 0, 0.35]) AdvArt.circle(ctx, dx * s, -s * 1.3, s * 0.35, '#ffffff');
                AdvArt.ink(ctx, s * 0.03, '#c9c0c0');
                break;
            }
            case 'headband-bunny': {
                ctx.beginPath();
                ctx.arc(0, -s * 0.1, s * 0.98, Math.PI * 1.15, Math.PI * 1.85);
                ctx.strokeStyle = color || '#ff8fb8'; ctx.lineWidth = s * 0.09; ctx.stroke();
                for (const side of [-1, 1]) {
                    AdvArt.ellipse(ctx, side * s * 0.4, -s * 1.45, s * 0.18, s * 0.5, '#ffffff', side * 0.2);
                    AdvArt.ellipse(ctx, side * s * 0.4, -s * 1.42, s * 0.09, s * 0.36, '#ffb7c5', side * 0.2);
                }
                break;
            }
        }
        ctx.restore();
    },

    critter_ghost(ctx, s, o, t) {
        const wob = t * 3;
        ctx.globalAlpha *= o.alpha == null ? 0.95 : o.alpha;
        ctx.beginPath();
        ctx.moveTo(-s, 0);
        ctx.arc(0, 0, s, Math.PI, 0);
        ctx.lineTo(s, s * 1.3);
        for (let i = 0; i <= 6; i++) {
            const xx = s - (i / 6) * s * 2;
            ctx.lineTo(xx, s * 1.3 + (i % 2 ? -s * 0.22 : s * 0.05) + Math.sin(wob + i) * s * 0.08);
        }
        ctx.closePath();
        ctx.fillStyle = o.color || '#fbfbff';
        ctx.fill();
        AdvArt.ink(ctx, s * 0.06, '#9aa0c8', 0.6);
        AdvArt.ellipse(ctx, -s * 0.95, s * 0.6, s * 0.25, s * 0.14, o.color || '#fbfbff', 0.8 + Math.sin(t * 4) * 0.4);
        AdvArt.ellipse(ctx, s * 0.95, s * 0.6, s * 0.25, s * 0.14, o.color || '#fbfbff', -0.8 - Math.sin(t * 4 + 1) * 0.4);
        AdvArt.face(ctx, 0, s * 0.1, s, { blink: AdvArt.blink(t, 2), mouth: o.mouth || 'o', eyes: o.eyes, lookX: o.lookX });
        if (o.hat) AdvArt.hat(ctx, o.hat, s, t, o.hatColor);
    },

    critter_snowman(ctx, s, o, t) {
        AdvArt.circle(ctx, 0, s * 1.65, s * 0.95, '#ffffff');
        AdvArt.ink(ctx, s * 0.05, '#a9bed8', 0.7);
        AdvArt.circle(ctx, 0, 0, s * 0.8, '#ffffff');
        AdvArt.ink(ctx, s * 0.05, '#a9bed8', 0.7);
        for (const yy of [1.3, 1.65, 2.0]) AdvArt.circle(ctx, 0, s * yy, s * 0.08, '#4a3b3b');
        // Stick arms
        const wave = o.wave || 0;
        ctx.strokeStyle = '#7a5236'; ctx.lineWidth = s * 0.08; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-s * 0.8, s * 1.2); ctx.lineTo(-s * 1.5, s * 0.8);
        ctx.moveTo(s * 0.8, s * 1.2); ctx.lineTo(s * 1.5, s * (0.8 - wave * 0.8));
        ctx.stroke();
        AdvArt.face(ctx, 0, -s * 0.05, s * 0.8, { blink: AdvArt.blink(t, 3), mouth: o.mouth || 'smile', eyes: o.eyes });
        ctx.beginPath();
        ctx.moveTo(0, s * 0.08);
        ctx.lineTo(s * 0.55, s * 0.16);
        ctx.lineTo(0, s * 0.24);
        ctx.closePath();
        ctx.fillStyle = '#ff8a2a'; ctx.fill();
        if (o.scarf !== false) {
            const c = o.scarf || '#e8384f';
            AdvArt.ellipse(ctx, 0, s * 0.72, s * 0.65, s * 0.16, c);
            AdvArt.rr(ctx, -s * 0.45, s * 0.72, s * 0.22, s * 0.6, s * 0.06);
            ctx.fillStyle = c; ctx.fill();
        }
        AdvArt.hat(ctx, o.hat || 'top', s * 0.8, t, o.hatColor);
    },

    critter_ginger(ctx, s, o, t) {
        const c = '#c98648';
        const wave = o.wave || 0;
        const kick = o.kick || 0;
        ctx.fillStyle = c;
        // Legs
        for (const [side, k] of [[-1, kick], [1, -kick]]) {
            ctx.save();
            ctx.translate(side * s * 0.35, s * 1.25);
            ctx.rotate(k * 0.6);
            AdvArt.rr(ctx, -s * 0.24, 0, s * 0.48, s * 0.75, s * 0.24);
            ctx.fillStyle = c; ctx.fill();
            AdvArt.ink(ctx, s * 0.05, '#7a4a22');
            ctx.restore();
        }
        // Arms
        for (const [side, a] of [[-1, 0.4 + wave * 0.3], [1, -0.4 - wave * 1.2]]) {
            ctx.save();
            ctx.translate(side * s * 0.45, s * 0.75);
            ctx.rotate(side * -1.2 + a);
            AdvArt.rr(ctx, -s * 0.2, 0, s * 0.4, s * 0.75, s * 0.2);
            ctx.fillStyle = c; ctx.fill();
            AdvArt.ink(ctx, s * 0.05, '#7a4a22');
            ctx.beginPath();
            ctx.moveTo(-s * 0.12, s * 0.55);
            ctx.quadraticCurveTo(0, s * 0.62, s * 0.12, s * 0.55);
            ctx.strokeStyle = '#ffffff'; ctx.lineWidth = s * 0.06; ctx.stroke();
            ctx.restore();
        }
        AdvArt.rr(ctx, -s * 0.6, s * 0.6, s * 1.2, s * 0.95, s * 0.4);
        ctx.fillStyle = c; ctx.fill();
        AdvArt.ink(ctx, s * 0.05, '#7a4a22');
        AdvArt.circle(ctx, 0, 0, s * 0.85, c);
        AdvArt.ink(ctx, s * 0.05, '#7a4a22');
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.72, 0, advTAU);
        ctx.setLineDash([s * 0.12, s * 0.1]);
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = s * 0.05; ctx.stroke();
        ctx.setLineDash([]);
        AdvArt.face(ctx, 0, 0, s * 0.85, { blink: AdvArt.blink(t, 4), mouth: o.mouth || 'grin', blushColor: '#ff7a8a' });
        AdvArt.circle(ctx, 0, s * 0.85, s * 0.1, '#e8384f');
        AdvArt.circle(ctx, 0, s * 1.15, s * 0.1, '#43b05c');
        if (o.hat) AdvArt.hat(ctx, o.hat, s * 0.85, t, o.hatColor);
    },

    critter_turkey(ctx, s, o, t) {
        const fan = o.fan == null ? 1 : o.fan;
        const cols = ['#e8505b', '#f28c28', '#ffd447', '#8bc34a', '#f28c28', '#e8505b', '#a0522d'];
        for (let i = 0; i < 7; i++) {
            const a = -Math.PI / 2 + (i - 3) * 0.36 * fan;
            ctx.save();
            ctx.translate(0, s * 0.9);
            ctx.rotate(a + Math.PI / 2);
            AdvArt.ellipse(ctx, 0, -s * 1.35, s * 0.32, s * 0.9, cols[i]);
            AdvArt.ink(ctx, s * 0.04, advDarken(cols[i], 0.4), 0.5);
            ctx.restore();
        }
        AdvArt.ellipse(ctx, -s * 0.3, s * 1.75, s * 0.18, s * 0.1, '#ff9a3d');
        AdvArt.ellipse(ctx, s * 0.3, s * 1.75, s * 0.18, s * 0.1, '#ff9a3d');
        AdvArt.ellipse(ctx, 0, s * 1.05, s * 0.8, s * 0.72, '#8b5a3c');
        AdvArt.ink(ctx, s * 0.05, '#4a2c1c');
        AdvArt.ellipse(ctx, 0, s * 1.15, s * 0.45, s * 0.42, '#c08a62');
        AdvArt.circle(ctx, 0, 0, s * 0.7, '#9b6a4a');
        AdvArt.ink(ctx, s * 0.05, '#4a2c1c');
        AdvArt.face(ctx, 0, -s * 0.05, s * 0.7, { blink: AdvArt.blink(t, 6), mouth: 'none' });
        ctx.beginPath();
        ctx.moveTo(-s * 0.12, s * 0.08); ctx.lineTo(s * 0.12, s * 0.08); ctx.lineTo(0, s * 0.3); ctx.closePath();
        ctx.fillStyle = '#ffb347'; ctx.fill();
        AdvArt.ellipse(ctx, s * 0.08, s * 0.38 + Math.sin(t * 5) * s * 0.03, s * 0.08, s * 0.16, '#e8384f');
        if (o.hat) AdvArt.hat(ctx, o.hat, s * 0.7, t, o.hatColor);
    }
};

const ADVENT_FONT_ROUND = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", "Avenir Next", system-ui, sans-serif';
const ADVENT_FONT_FANCY = '"Chalkboard SE", "Comic Sans MS", "Marker Felt", ui-rounded, "Arial Rounded MT Bold", cursive';

// ===========================================================================
// Treats
//
// draw(ctx, S): S carries
//   t      global seconds        age   seconds since the door opened
//   hw/hh  half extents of the window, the shorter one is always 50
//   p      the theme's parameters for this door
//   pal    the theme palette     seed  a per-door number for variety
//   year/month/day                big   true in the spotlight replay
// ===========================================================================

const advA = AdvArt;

// Shared bits used by several treats
const advT = {
    // Standing height helper: head centre for a critter of head-radius s whose
    // feet rest on the line y = gy
    headOn: (gy, s) => gy - s * 1.62,

    night(ctx, S, seed = 3) {
        advA.sky(ctx, S, '#1d2350', '#4b3f7a');
        advA.stars(ctx, S, 26, seed, S.t);
    },

    day(ctx, S, top = '#9fd8ff', bottom = '#e6f7ff') {
        advA.sky(ctx, S, top, bottom);
    },

    windowSky(ctx, S) {
        const w = S.pal.window || ['#bfe6ff', '#f2fbff'];
        advA.sky(ctx, S, w[0], w[1]);
    },

    butterfly(ctx, x, y, s, t, color = '#ff8fb8', rot = 0) {
        const f = 0.35 + 0.65 * Math.abs(Math.sin(t * 9));
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        for (const side of [-1, 1]) {
            ctx.save();
            ctx.scale(side * f, 1);
            advA.ellipse(ctx, s * 0.55, -s * 0.35, s * 0.6, s * 0.45, color, 0.4);
            advA.ellipse(ctx, s * 0.45, s * 0.35, s * 0.4, s * 0.32, advLighten(color, 0.25), -0.4);
            advA.circle(ctx, s * 0.6, -s * 0.4, s * 0.14, '#ffffff');
            ctx.restore();
        }
        advA.ellipse(ctx, 0, 0, s * 0.12, s * 0.5, advA.INK);
        advA.line(ctx, 0, -s * 0.45, -s * 0.25, -s * 0.85, advA.INK, s * 0.06);
        advA.line(ctx, 0, -s * 0.45, s * 0.25, -s * 0.85, advA.INK, s * 0.06);
        ctx.restore();
    },

    bee(ctx, x, y, s, t, dir = 1) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(dir, 1);
        const f = Math.sin(t * 50) * 0.4;
        ctx.globalAlpha *= 0.8;
        advA.ellipse(ctx, -s * 0.15, -s * 0.6, s * 0.4, s * 0.25, '#eaf8ff', -0.5 + f);
        advA.ellipse(ctx, s * 0.2, -s * 0.6, s * 0.35, s * 0.22, '#eaf8ff', 0.5 - f);
        ctx.globalAlpha /= 0.8;
        advA.ellipse(ctx, 0, 0, s * 0.75, s * 0.55, '#ffd23f');
        ctx.save();
        advA.ellipse(ctx, 0, 0, s * 0.75, s * 0.55);
        ctx.clip();
        ctx.fillStyle = advA.INK;
        ctx.fillRect(-s * 0.25, -s, s * 0.18, s * 2);
        ctx.fillRect(s * 0.1, -s, s * 0.18, s * 2);
        ctx.restore();
        advA.ink(ctx, s * 0.06);
        advA.circle(ctx, s * 0.5, -s * 0.1, s * 0.09, advA.INK);
        advA.line(ctx, -s * 0.75, 0, -s * 0.98, 0, advA.INK, s * 0.1);
        ctx.restore();
    },

    // A rising wisp of steam: k is 0..1 through its life
    steam(ctx, x, y, k, len = 22, width = 2.2, color = '#ffffff') {
        ctx.save();
        ctx.globalAlpha *= advPulse(k, 0, 1) * 0.85;
        ctx.beginPath();
        const top = y - k * len * 1.2;
        for (let i = 0; i <= 12; i++) {
            const u = i / 12;
            const yy = top - u * len * 0.6;
            const xx = x + Math.sin(u * 5 + k * 6) * (2 + u * 3);
            if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.restore();
    },

    firefly(ctx, x, y, r, t, seed) {
        const glow = 0.4 + 0.6 * Math.max(0, Math.sin(t * 2.5 + seed * 7));
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
        g.addColorStop(0, `rgba(230,255,140,${0.7 * glow})`);
        g.addColorStop(1, 'rgba(230,255,140,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
        advA.circle(ctx, x, y, r, advMix('#8a9a40', '#f6ff9a', glow));
    },

    // Things that drift down in several treats
    faller(ctx, kind, x, y, s, rot, t, color) {
        switch (kind) {
            case 'snow': advA.snowflake(ctx, x, y, s, '#ffffff', rot); break;
            case 'leaf': advA.leaf(ctx, x, y, s * 2, rot, color || '#e8873a', 'maple'); break;
            case 'petal': advA.petal(ctx, x, y, s, rot, color || '#ffc0d6'); break;
            case 'heart': advA.heart(ctx, x, y, s * 0.8, color || '#ff6b8b'); break;
            case 'star': advA.star(ctx, x, y, s, color || '#ffd447', rot); break;
            case 'clover': advA.clover(ctx, x, y, s * 0.8, '#43b05c', 3, rot); break;
            case 'confetti': advA.confetti(ctx, x, y, s * 0.6, rot + t, color || '#ff6b8b'); break;
            case 'candy': {
                advA.circle(ctx, x, y, s * 0.7, color || '#ff6b8b');
                ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
                ctx.beginPath(); ctx.moveTo(s * 0.6, 0); ctx.lineTo(s * 1.2, -s * 0.5); ctx.lineTo(s * 1.2, s * 0.5); ctx.closePath();
                ctx.moveTo(-s * 0.6, 0); ctx.lineTo(-s * 1.2, -s * 0.5); ctx.lineTo(-s * 1.2, s * 0.5); ctx.closePath();
                ctx.fillStyle = color || '#ff6b8b'; ctx.fill();
                ctx.restore();
                break;
            }
            case 'drop': advA.drop(ctx, x, y, s * 0.5, '#7fc8f8'); break;
            default: advA.circle(ctx, x, y, s * 0.5, color || '#ffffff');
        }
    },

    confettiBurst(ctx, x, y, k, n, seed, colors, spread = 40) {
        if (k <= 0 || k >= 1) return;
        for (let i = 0; i < n; i++) {
            const a = -Math.PI / 2 + (advHash(seed, i) - 0.5) * 2.6;
            const v = spread * (0.5 + advHash(seed, i + 40));
            const px = x + Math.cos(a) * v * k;
            const py = y + Math.sin(a) * v * k + k * k * spread * 0.9;
            ctx.globalAlpha = 1 - advSmooth((k - 0.6) / 0.4);
            advA.confetti(ctx, px, py, 1.6, i + k * 9, colors[i % colors.length]);
        }
        ctx.globalAlpha = 1;
    },

    grass(ctx, S, y, color = '#7cc46a') {
        advA.ground(ctx, S, y, color, 2, 2);
        ctx.strokeStyle = advDarken(color, 0.18);
        ctx.lineWidth = 1;
        for (let x = -S.hw; x < S.hw; x += 7) {
            ctx.beginPath();
            ctx.moveTo(x, y + 2);
            ctx.lineTo(x + 1.5, y - 2.5 + Math.sin(x + S.t * 2) * 0.6);
            ctx.stroke();
        }
    },

    snowGround(ctx, S, y) {
        advA.ground(ctx, S, y, '#f4f8ff', 3, 5);
        ctx.save();
        ctx.globalAlpha = 0.5;
        advA.ground(ctx, S, y + 6, '#dde8f8', 2, 1);
        ctx.restore();
    },

    flakes(ctx, S, n, seed, speed = 10, kind = 'snow', colors) {
        for (let i = 0; i < n; i++) {
            const span = S.hh * 2 + 20;
            const y = -S.hh - 10 + ((advHash(seed, i) * span + S.t * speed * (0.6 + advHash(seed, i + 7) * 0.8)) % span);
            const x = (advHash(seed, i + 20) * 2 - 1) * S.hw + Math.sin(S.t * 1.3 + i) * 3;
            const col = colors ? colors[i % colors.length] : undefined;
            advT.faller(ctx, kind, x, y, kind === 'snow' ? 1.6 + advHash(seed, i + 3) * 1.4 : 2.4 + advHash(seed, i + 3) * 1.4, S.t * (0.6 + advHash(seed, i)) + i, S.t, col);
        }
    },

    cover(ctx, S, kind, y) {
        // A foreground mound for things to peek out from behind
        const col = { bush: '#5fae5a', snow: '#f7fbff', leaves: '#e48a3a', sand: '#f3d7a0', cloud: '#ffffff', grass: '#79c267', pumpkins: '#f28c28' }[kind] || '#5fae5a';
        ctx.beginPath();
        ctx.moveTo(-S.hw - 2, S.hh + 2);
        ctx.lineTo(-S.hw - 2, y + 6);
        const bumps = 5;
        for (let i = 0; i < bumps; i++) {
            const x0 = -S.hw + (i / bumps) * S.hw * 2;
            const x1 = -S.hw + ((i + 1) / bumps) * S.hw * 2;
            ctx.quadraticCurveTo((x0 + x1) / 2, y - 7 - (i % 2) * 3, x1, y + 2);
        }
        ctx.lineTo(S.hw + 2, S.hh + 2);
        ctx.closePath();
        ctx.fillStyle = col; ctx.fill();
        advA.ink(ctx, 1.4, advDarken(col, 0.4), 0.45);
        if (kind === 'leaves') {
            for (let i = 0; i < 9; i++) {
                advA.leaf(ctx, -S.hw + (i + 0.5) * (S.hw * 2 / 9), y + 2 + (i % 2) * 5, 8, i, ['#e8505b', '#ffb347', '#d9822b'][i % 3], 'maple');
            }
        } else if (kind === 'bush') {
            for (let i = 0; i < 5; i++) advA.circle(ctx, -S.hw + (i + 0.5) * (S.hw * 2 / 5), y + 4, 1.6, '#ff8fb8');
        }
    }
};

const ADVENT_TREATS = {

    peekaboo: {
        caption: (p) => p.word ? `${advA.critterName(p.c)} says "${p.word}"` : `Peekaboo, ${advA.critterName(p.c)}!`,
        draw(ctx, S) {
            const p = S.p;
            advT.windowSky(ctx, S);
            if (p.night) advA.stars(ctx, S, 16, S.seed, S.t);
            const gy = S.hh * 0.45;
            const k = (S.age % 6.5);
            const up = k < 0.7 ? advEaseOutBack(k / 0.7) : k < 5 ? 1 : k < 5.5 ? 1 - advEaseIn((k - 5) / 0.5) : 0;
            const s = 16;
            const y = gy + 6 + (1 - up) * 46 - s * 0.9;
            const wave = k > 1 && k < 4.5 ? Math.sin(k * 9) * 0.5 + 0.5 : 0;
            advA.critter(ctx, p.c || 'bunny', 0, y, s, { t: S.t, wave, hat: p.hat, scarf: p.scarf, hatColor: p.hatColor, eyes: k > 2.2 && k < 3.2 ? 'happy' : undefined });
            advT.cover(ctx, S, p.cover || 'bush', gy + 6);
            if (k > 1.4 && k < 3.6) advA.speech(ctx, 20, y - s * 0.9, p.word || 'hi!', 8, { tail: -1 });
        }
    },

    balloonRide: {
        caption: (p) => `${advA.critterName(p.c)} goes up, up, up!`,
        draw(ctx, S) {
            const p = S.p;
            advT.windowSky(ctx, S);
            for (let i = 0; i < 3; i++) {
                const x = ((S.t * (6 + i * 3) + i * 50) % (S.hw * 2 + 60)) - S.hw - 30;
                advA.cloud(ctx, -x, -S.hh * 0.6 + i * 30, 26 - i * 4, 'rgba(255,255,255,0.9)');
            }
            const bob = Math.sin(S.t * 1.4) * 4;
            const rise = S.age < 2 ? (1 - advEaseOut(S.age / 2)) * 40 : 0;
            const cols = p.colors || S.pal.accent || ['#ff6b8b', '#ffd447', '#7fc8f8'];
            const cy = 18 + bob + rise;
            const pts = [[-12, -34], [0, -42], [12, -33]];
            pts.forEach(([dx, dy], i) => {
                const sw = Math.sin(S.t * 1.7 + i) * 2;
                ctx.beginPath();
                ctx.moveTo(4, cy - 6);
                ctx.quadraticCurveTo(dx * 0.4, cy + dy * 0.5, dx + sw, cy + dy + 14);
                ctx.strokeStyle = 'rgba(80,60,60,0.55)'; ctx.lineWidth = 0.8; ctx.stroke();
                if (p.hearts) advA.heart(ctx, dx + sw, cy + dy, 9, cols[i % cols.length]);
                else advA.balloon(ctx, dx + sw, cy + dy, 10, cols[i % cols.length], 0, 0, i === 1, S.t);
            });
            advA.critter(ctx, p.c || 'bear', 0, cy - 6, 11, { t: S.t, arms: 'up', hat: p.hat, scarf: p.scarf });
        }
    },

    snowGlobe: {
        caption: (p) => `A snow globe with ${p.inside === 'critter' ? 'a tiny ' + advA.critterName(p.c) : 'a tiny forest'} inside`,
        draw(ctx, S) {
            const p = S.p;
            advT.windowSky(ctx, S);
            const k = S.age % 7;
            const shake = k < 0.9 ? Math.sin(k * 40) * 3 * (1 - k / 0.9) : 0;
            ctx.save();
            ctx.translate(shake, 0);
            // Base
            advA.rr(ctx, -26, 26, 52, 16, 5);
            ctx.fillStyle = p.base || '#b5523b'; ctx.fill();
            advA.ink(ctx, 1.4);
            ctx.fillStyle = '#ffd447';
            ctx.fillRect(-26, 31, 52, 3);
            // Glass
            ctx.save();
            advA.circle(ctx, 0, -2, 33);
            ctx.clip();
            advA.sky(ctx, S, p.globe || '#c9e8ff', '#f2fbff');
            advA.ellipse(ctx, 0, 30, 40, 16, '#ffffff');
            if (p.inside === 'critter') {
                advA.critter(ctx, p.c || 'penguin', 0, 1, 10, { t: S.t, wave: Math.sin(S.t * 3) * 0.5 + 0.5, hat: p.hat, scarf: p.scarf });
            } else if (p.inside === 'house') {
                advA.rr(ctx, -12, 0, 24, 18, 2);
                ctx.fillStyle = '#e8b27a'; ctx.fill();
                ctx.beginPath(); ctx.moveTo(-16, 1); ctx.lineTo(0, -14); ctx.lineTo(16, 1); ctx.closePath();
                ctx.fillStyle = '#c0392b'; ctx.fill();
                advA.rr(ctx, -4, 6, 8, 12, 3); ctx.fillStyle = '#7a4a2c'; ctx.fill();
                advA.pine(ctx, -20, 20, 22, '#3f8f5a', true);
                advA.pine(ctx, 21, 20, 18, '#3f8f5a', true);
            } else {
                advA.pine(ctx, -10, 22, 34, '#3f8f5a', true);
                advA.pine(ctx, 12, 22, 26, '#4a9e65', true);
                advA.critter(ctx, 'bunny', 14, 12, 4.5, { t: S.t, body: true });
            }
            const swirl = 1 + (k < 2 ? (1 - k / 2) * 5 : 0);
            for (let i = 0; i < 26; i++) {
                const a = advHash(S.seed, i) * advTAU + S.t * 0.3 * swirl * (i % 2 ? 1 : -1);
                const r = 6 + advHash(S.seed, i + 30) * 26;
                const fy = ((advHash(S.seed, i + 60) * 70 + S.t * 5 * (0.6 + advHash(S.seed, i))) % 70) - 36;
                advA.circle(ctx, Math.cos(a) * r * 0.9, k < 2 ? Math.sin(a) * r * 0.9 : fy, 1.1, '#ffffff');
            }
            ctx.restore();
            advA.circle(ctx, 0, -2, 33);
            advA.ink(ctx, 2, '#7aa6c8', 0.8);
            ctx.globalAlpha = 0.45;
            ctx.beginPath();
            ctx.arc(0, -2, 28, Math.PI * 1.1, Math.PI * 1.45);
            ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.restore();
        }
    },

    fireworks: {
        caption: () => 'Fireworks!',
        draw(ctx, S) {
            const p = S.p;
            advT.night(ctx, S, S.seed);
            const cols = p.colors || ['#ff6b8b', '#ffd447', '#7fc8f8', '#9df29d', '#c99bff'];
            for (let i = 0; i < 4; i++) {
                const period = 2.6;
                const k = ((S.age + i * 0.8 + advHash(S.seed, i) * 0.5) % period) / period;
                const fx = (advHash(S.seed + Math.floor((S.age + i * 0.8) / period), i) * 1.4 - 0.7) * S.hw;
                const fy = -S.hh * 0.35 + advHash(S.seed, i + 9) * 18 - 8;
                if (k < 0.3) {
                    const ry = advLerp(S.hh, fy, advEaseOut(k / 0.3));
                    advA.circle(ctx, fx, ry, 1.4, '#fff3c4');
                } else {
                    advA.firework(ctx, fx, fy, 24, cols[i % cols.length], (k - 0.3) / 0.7, i);
                }
            }
            const gy = S.hh * 0.62;
            ctx.fillStyle = p.ground || '#2a2448';
            advA.ground(ctx, S, gy, p.ground || '#2a2448', 3, 1);
            if (p.c) advA.critter(ctx, p.c, -S.hw * 0.45, gy - 8, 9, { t: S.t, lookY: -1, lookX: 0.5, eyes: 'dot', mouth: 'open', hat: p.hat });
            if (p.c2) advA.critter(ctx, p.c2, -S.hw * 0.45 + 22, gy - 6, 8, { t: S.t + 1, lookY: -1, mouth: 'o', hat: p.hat2 });
        }
    },

    sleepyMoon: {
        caption: (p) => `${advA.critterName(p.c)} naps on the moon`,
        draw(ctx, S) {
            const p = S.p;
            advT.night(ctx, S, S.seed);
            const rock = Math.sin(S.t * 0.9) * 0.12;
            ctx.save();
            ctx.translate(4, 6);
            ctx.rotate(rock);
            advA.moon(ctx, 0, 0, 32, S.t, { crescent: true, face: true });
            advA.critter(ctx, p.c || 'bunny', -2, -26, 9, { t: S.t, eyes: 'closed', blink: false, arms: 'hug', hat: p.hat || 'santa', hatColor: p.hatColor || '#6a7bd8', rot: -0.35 });
            ctx.restore();
            advA.zzz(ctx, 14, -38, S.t, 9);
        }
    },

    hopTrio: {
        caption: (p) => `Hop, hop, hop!`,
        draw(ctx, S) {
            const p = S.p;
            advT.windowSky(ctx, S);
            const gy = S.hh * 0.62;
            if (p.snow) advT.snowGround(ctx, S, gy); else advT.grass(ctx, S, gy, p.grass || '#7cc46a');
            const cast = p.cast || [p.c || 'bunny', p.c || 'bunny', p.c || 'bunny'];
            cast.forEach((c, i) => {
                const ph = (S.age * 1.6 - i * 0.33) % 2;
                const k = ph < 0 ? 0 : ph;
                const hop = k < 0.6 ? Math.sin((k / 0.6) * Math.PI) : 0;
                const squash = k >= 0.6 && k < 0.75 ? 1.25 : 1;
                const s = 9 - i * 0.5;
                const x = (i - 1) * S.hw * 0.6;
                advA.critter(ctx, c, x, advT.headOn(gy, s) - hop * 18, s, { t: S.t + i, squash, arms: hop > 0.4 ? 'up' : 'down', hat: p.hats && p.hats[i], scarf: p.scarf });
            });
        }
    },

    giftPop: {
        caption: (p) => p.item === 'critter' ? `A ${advA.critterName(p.c)} in a box!` : 'A surprise in a box!',
        draw(ctx, S) {
            const p = S.p;
            advT.windowSky(ctx, S);
            const k = S.age % 7;
            const gy = S.hh * 0.7;
            ctx.fillStyle = advRgba('#000000', 0.12);
            advA.ellipse(ctx, 0, gy, 26, 4, advRgba('#000000', 0.12));
            const wob = k < 1.3 ? Math.sin(k * 30) * 0.06 * (k / 1.3) : 0;
            const open = k < 1.3 ? 0 : k < 5.5 ? 1 : 1 - advSmooth((k - 5.5) / 0.8);
            const pop = k < 1.3 ? 0 : k < 2.2 ? advEaseOutBack((k - 1.3) / 0.9) : k < 5.3 ? 1 : 1 - advSmooth((k - 5.3) / 0.6);
            // Surprise rising out of the box
            ctx.save();
            ctx.beginPath();
            ctx.rect(-S.hw, -S.hh, S.hw * 2, gy - 34 + S.hh);
            ctx.clip();
            const iy = gy - 30 - pop * 22;
            const item = p.item || 'critter';
            if (item === 'critter') {
                advA.critter(ctx, p.c || 'cat', 0, iy, 11, { t: S.t, arms: pop > 0.8 ? 'up' : 'down', eyes: k > 2 && k < 3 ? 'happy' : undefined, hat: p.hat });
            } else if (item === 'star') {
                advA.star(ctx, 0, iy, 13, '#ffd447', -Math.PI / 2 + Math.sin(S.t * 2) * 0.2, true, S.t);
            } else if (item === 'heart') {
                advA.heart(ctx, 0, iy, 12, '#ff6b8b', true, S.t);
            } else if (item === 'teddy') {
                advA.critter(ctx, 'bear', 0, iy, 11, { t: S.t, arms: 'up', hat: 'bow', hatColor: '#ff6b8b' });
            }
            ctx.restore();
            ctx.save();
            ctx.translate(0, gy);
            ctx.rotate(wob);
            advA.gift(ctx, 0, 0, 44, 30, p.box || S.pal.accent[0], p.ribbon || '#ffd447', open * 28, open * -0.5);
            ctx.restore();
            advT.confettiBurst(ctx, 0, gy - 34, (k - 1.3) / 1.6, 24, S.seed, S.pal.accent || ['#ff6b8b', '#ffd447'], 44);
        }
    },

    catchFalling: {
        caption: (p) => ({ snow: `${advA.critterName(p.c)} catches snowflakes`, leaf: `${advA.critterName(p.c)} chases falling leaves`, petal: 'Petals on the breeze', heart: 'It\'s raining hearts!', candy: 'It\'s raining candy!', star: 'Catching falling stars', clover: 'Lucky clovers falling', confetti: 'Confetti shower!' }[p.thing || 'snow']),
        draw(ctx, S) {
            const p = S.p;
            if (p.night) advT.night(ctx, S, S.seed); else advT.windowSky(ctx, S);
            const gy = S.hh * 0.62;
            if (p.thing === 'snow' || p.snow) advT.snowGround(ctx, S, gy); else advT.grass(ctx, S, gy, p.grass || '#86c46a');
            advT.flakes(ctx, S, 14, S.seed, 12, p.thing || 'snow', p.colors || S.pal.accent);
            const x = Math.sin(S.t * 0.8) * S.hw * 0.4;
            advA.critter(ctx, p.c || 'bunny', x, advT.headOn(gy, 12), 12, { t: S.t, lookY: -1, lookX: Math.cos(S.t * 0.8), mouth: 'open', arms: 'up', hat: p.hat, scarf: p.scarf, flip: Math.cos(S.t * 0.8) < 0 });
        }
    },

    steamyMug: {
        caption: (p) => p.label || 'A warm mug of cocoa',
        draw(ctx, S) {
            const p = S.p;
            advT.windowSky(ctx, S);
            advA.rr(ctx, -S.hw - 2, S.hh * 0.5, S.hw * 2 + 4, S.hh, 0);
            ctx.fillStyle = p.table || '#c58b5a'; ctx.fill();
            const cy = S.hh * 0.55;
            for (let i = 0; i < 3; i++) {
                const k = ((S.t * 0.35 + i / 3) % 1);
                const x = (i - 1) * 9;
                if ((p.steam || 'heart') === 'heart' && i === 1) {
                    ctx.globalAlpha = advPulse(k, 0, 1) * 0.85;
                    advA.heart(ctx, x + Math.sin(k * 7) * 3, cy - 32 - k * 34, 4 + k * 3, '#ffffff');
                    ctx.globalAlpha = 1;
                } else {
                    advT.steam(ctx, x, cy - 30, k, 20);
                }
            }
            advA.mug(ctx, 0, cy, 26, p.mug || S.pal.accent[0], true, S.t);
            // Marshmallows bob in the cocoa
            for (let i = 0; i < 3; i++) {
                const bob = Math.sin(S.t * 2 + i * 2) * 1.2;
                advA.rr(ctx, -9 + i * 6, cy - 28 + bob, 5, 4, 1.2);
                ctx.fillStyle = i === 1 ? '#ffd1e3' : '#ffffff'; ctx.fill();
            }
            if (p.cookie) {
                advA.circle(ctx, 24, cy - 3, 9, '#d79b5a');
                for (let i = 0; i < 4; i++) advA.circle(ctx, 20 + advHash(i, 2) * 8, cy - 7 + advHash(i, 5) * 8, 1.4, '#5a3320');
            }
        }
    },

    cupcakeCandle: {
        caption: (p) => p.label || 'Make a wish!',
        draw(ctx, S) {
            const p = S.p;
            advT.windowSky(ctx, S);
            const gy = S.hh * 0.6;
            advA.rr(ctx, -S.hw - 2, gy, S.hw * 2 + 4, S.hh, 0);
            ctx.fillStyle = p.table || '#ffe0ef'; ctx.fill();
            const k = S.age % 7;
            const lit = !(k > 3.2 && k < 5.4);
            advA.cupcake(ctx, -4, gy + 2, 34, p.frosting || '#ffb3d1', p.liner || '#7fc8f8');
            advA.candle(ctx, -4, gy - 34, 16, p.candle || '#8fd3ff', S.t, lit);
            if (k > 3.2 && k < 4.6) {
                const sk = (k - 3.2) / 1.4;
                ctx.globalAlpha = 1 - sk;
                ctx.beginPath();
                ctx.arc(-4 + Math.sin(sk * 8) * 3, gy - 56 - sk * 18, 3 + sk * 4, 0.3, Math.PI * 1.7);
                ctx.strokeStyle = '#c8c8d8'; ctx.lineWidth = 2; ctx.stroke();
                ctx.globalAlpha = 1;
            }
            if (k > 5.4 && k < 6.2) advA.sparkle(ctx, -4, gy - 58, 6 * advPulse(k, 5.4, 6.2), '#fff3a0');
            // A friend peeks in from the side and blows the candle out
            const peek = k > 2 && k < 4.5 ? advSmooth((k - 2) / 0.6) * (1 - advSmooth((k - 3.9) / 0.6)) : 0;
            advA.critter(ctx, p.c || 'mouse', S.hw + 6 - peek * 22, gy - 26, 10, { t: S.t, body: false, mouth: k > 2.9 && k < 3.4 ? 'o' : 'smile', eyes: k > 2.9 && k < 3.4 ? 'closed' : undefined, flip: true, hat: p.hat || 'party' });
            if (k > 2.9 && k < 3.4) {
                for (let i = 0; i < 3; i++) advA.line(ctx, S.hw - 22 - i * 3, gy - 22 + i * 2, S.hw - 28 - i * 4 - (k - 2.9) * 20, gy - 24 + i * 3, 'rgba(255,255,255,0.8)', 1.2);
            }
        }
    },

    growFlower: {
        caption: (p) => ({ tulip: 'A tulip pops up', sunflower: 'A sunflower says good morning', daisy: 'A daisy blooms' }[p.flower || 'daisy']),
        draw(ctx, S) {
            const p = S.p;
            advT.windowSky(ctx, S);
            const gy = S.hh * 0.66;
            advT.grass(ctx, S, gy, p.grass || '#7cc46a');
            const k = S.age % 8;
            const grow = advEaseOut(k / 2.2) * (1 - advSmooth((k - 7.2) / 0.8));
            const bloom = advEaseOutBack((k - 2.2) / 0.8) * (1 - advSmooth((k - 7) / 0.6));
            const top = gy - 52 * grow;
            const sway = Math.sin(S.t * 1.5) * 3 * grow;
            ctx.beginPath();
            ctx.moveTo(0, gy);
            ctx.quadraticCurveTo(-4, (gy + top) / 2, sway, top);
            ctx.strokeStyle = '#4caf50'; ctx.lineWidth = 2.6; ctx.stroke();
            if (grow > 0.4) {
                advA.leaf(ctx, -6, gy - 16 * grow, 14 * grow, -0.9, '#5cbf60');
                advA.leaf(ctx, 6, gy - 26 * grow, 12 * grow, 0.9, '#5cbf60');
            }
            if (bloom > 0.01) {
                ctx.save();
                ctx.translate(sway, top);
                ctx.scale(bloom, bloom);
                const f = p.flower || 'daisy';
                if (f === 'tulip') advA.tulip(ctx, 0, 0, 13, p.color || '#ff6b8b');
                else if (f === 'sunflower') {
                    advA.flower(ctx, 0, 0, 20, '#ffcf33', '#8a5a2b', S.t * 0.1, 12);
                    advA.face(ctx, 0, 0, 6, { blink: advA.blink(S.t, 1) });
                } else {
                    advA.flower(ctx, 0, 0, 15, p.color || '#ffffff', '#ffd447', 0, 8);
                    advA.face(ctx, 0, 0, 4.5, { blink: advA.blink(S.t, 2) });
                }
                ctx.restore();
            } else if (grow > 0.6) {
                advA.ellipse(ctx, sway, top, 4, 6, '#6fcf6f');
            }
            if (k > 3 && k < 7) {
                const bk = k - 3;
                advT.bee(ctx, Math.sin(bk * 1.8) * 26, top - 10 + Math.cos(bk * 3.2) * 9, 5, S.t, Math.cos(bk * 1.8) > 0 ? 1 : -1);
            }
        }
    },

    flutter: {
        caption: (p) => ({ butterfly: 'Butterflies dancing', bee: 'Busy bees', bat: 'Bats out for a flap', firefly: 'Fireflies twinkling', bird: 'Little birds singing' }[p.flyer || 'butterfly']),
        draw(ctx, S) {
            const p = S.p;
            const night = p.flyer === 'bat' || p.flyer === 'firefly';
            if (night) advT.night(ctx, S, S.seed); else advT.windowSky(ctx, S);
            const center = p.center || (night ? 'moon' : 'flower');
            if (center === 'moon') advA.moon(ctx, 0, -4, 18, S.t, { face: true, sleepy: true });
            else if (center === 'flower') {
                advT.grass(ctx, S, S.hh * 0.66, '#7cc46a');
                advA.line(ctx, 0, S.hh * 0.66, 0, 0, '#4caf50', 2.4);
                advA.flower(ctx, 0, 0, 14, p.color || '#ff8fb8', '#ffd447', S.t * 0.2, 6);
            } else if (center === 'pumpkin') {
                advA.ground(ctx, S, S.hh * 0.62, '#3a2f55', 2);
                advA.pumpkin(ctx, 0, S.hh * 0.45, 16, { face: 'jack', glow: 0.7 + 0.3 * Math.sin(S.t * 8) });
            } else if (center === 'jar') {
                advA.rr(ctx, -12, -6, 24, 30, 6);
                ctx.fillStyle = 'rgba(200,230,255,0.25)'; ctx.fill();
                advA.ink(ctx, 1.5, '#9ec5e0', 0.9);
            }
            const n = p.n || 4;
            for (let i = 0; i < n; i++) {
                const a = S.t * (0.7 + i * 0.13) + i * 1.7;
                const x = Math.sin(a) * S.hw * 0.6;
                const y = Math.sin(a * 2 + i) * S.hh * 0.32 - 8;
                const dir = Math.cos(a) > 0 ? 1 : -1;
                switch (p.flyer || 'butterfly') {
                    case 'butterfly': advT.butterfly(ctx, x, y, 6, S.t + i, (S.pal.accent || ['#ff8fb8'])[i % (S.pal.accent || [0]).length] || '#ff8fb8', Math.sin(a) * 0.3); break;
                    case 'bee': advT.bee(ctx, x, y, 5, S.t + i, dir); break;
                    case 'bat': advA.bat(ctx, x, y, 7, S.t * 12 + i, '#4a3b5c'); break;
                    case 'firefly': advT.firefly(ctx, x * 0.8, y, 1.5, S.t, i); break;
                    case 'bird': {
                        ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
                        advA.circle(ctx, 0, 0, 5, ['#7fc8f8', '#ff9a76', '#ffd447'][i % 3]);
                        advA.ellipse(ctx, -1, -1 - Math.abs(Math.sin(S.t * 10 + i)) * 3, 4, 2, advDarken(['#7fc8f8', '#ff9a76', '#ffd447'][i % 3], 0.15), -0.5);
                        advA.circle(ctx, 2, -1.5, 0.9, advA.INK);
                        ctx.beginPath(); ctx.moveTo(4.5, -0.5); ctx.lineTo(7, 0.5); ctx.lineTo(4.5, 1.2); ctx.fillStyle = '#ffab3d'; ctx.fill();
                        ctx.restore();
                        break;
                    }
                }
            }
            if (p.flyer === 'bird' && Math.sin(S.t * 2) > 0.6) {
                ctx.font = `700 9px ${ADVENT_FONT_ROUND}`; ctx.fillStyle = '#5a4a8a';
                ctx.fillText('♪', S.hw * 0.4, -S.hh * 0.5 + Math.sin(S.t * 3) * 3);
            }
        }
    },

    rainbowAfterRain: {
        caption: () => 'After the rain, a rainbow',
        draw(ctx, S) {
            const k = S.age % 9;
            const sunny = advSmooth((k - 3.5) / 1.2) * (1 - advSmooth((k - 8.2) / 0.8));
            advA.sky(ctx, S, advMix('#8a9bb5', '#8fd3ff', sunny), advMix('#c9d3e3', '#e6f7ff', sunny));
            if (sunny > 0) {
                advA.rainbow(ctx, 0, S.hh * 0.6, 44, 4.2, advEaseOut((k - 4.2) / 1.6) * (1 - advSmooth((k - 8.2) / 0.8)));
                advA.sun(ctx, S.hw * 0.55, -S.hh * 0.55 + (1 - sunny) * 30, 10, S.t);
            }
            advT.grass(ctx, S, S.hh * 0.66, '#7cc46a');
            const rain = 1 - sunny;
            if (rain > 0.05) {
                ctx.globalAlpha = rain;
                for (let i = 0; i < 16; i++) {
                    const x = -24 + advHash(S.seed, i) * 48;
                    const y = -18 + ((advHash(S.seed, i + 5) * 60 + S.t * 70) % 60);
                    advA.line(ctx, x, y, x - 1, y + 5, '#7fb8e8', 1.4);
                }
                ctx.globalAlpha = 1;
            }
            advA.cloud(ctx, -4 - sunny * 30, -24, 46, advMix('#c4ccda', '#ffffff', sunny), true, S.t);
            advA.critter(ctx, S.p.c || 'duck', -S.hw * 0.4, advT.headOn(S.hh * 0.66, 8), 8, { t: S.t, eyes: sunny > 0.5 ? 'happy' : undefined, arms: sunny > 0.5 ? 'up' : 'down' });
            if (rain > 0.5) advA.umbrella(ctx, -S.hw * 0.4 + 3, advT.headOn(S.hh * 0.66, 8) - 20, 13, '#ff6b8b', 0.15);
        }
    },

    eggHatch: {
        caption: (p) => `Who's in the egg? A ${advA.critterName(p.baby || 'chick')}!`,
        draw(ctx, S) {
            const p = S.p;
            advT.windowSky(ctx, S);
            const gy = S.hh * 0.66;
            advT.grass(ctx, S, gy, '#86c96a');
            // Nest
            const k = S.age % 8.5;
            const wob = k < 2.5 ? Math.sin(k * (8 + k * 6)) * 0.12 * advSmooth(k / 1.5) : 0;
            const hatch = advEaseOutBack((k - 2.8) / 0.7) * (1 - advSmooth((k - 7.8) / 0.6));
            const baby = p.baby || 'chick';
            ctx.save();
            ctx.translate(0, gy - 4);
            if (hatch > 0.01) {
                advA.critter(ctx, baby, 0, -14 - hatch * 12, 9, { t: S.t, arms: hatch > 0.9 ? 'up' : 'down', eyes: k > 3.5 && k < 4.5 ? 'happy' : undefined });
                // Shell cap tossed up and worn as a hat
                ctx.save();
                ctx.translate(0, -30 - hatch * 12);
                ctx.rotate(0.3);
                ctx.beginPath();
                ctx.moveTo(-9, 0);
                for (let i = 0; i <= 6; i++) ctx.lineTo(-9 + i * 3, i % 2 ? -3 : 1);
                ctx.quadraticCurveTo(10, -14, 0, -15);
                ctx.quadraticCurveTo(-10, -14, -9, 0);
                ctx.fillStyle = p.egg || '#ffd1e3'; ctx.fill();
                advA.ink(ctx, 1);
                ctx.restore();
                // Bottom half of the shell
                ctx.beginPath();
                ctx.moveTo(-15, -12);
                for (let i = 0; i <= 10; i++) ctx.lineTo(-15 + i * 3, -12 + (i % 2 ? -4 : 0));
                ctx.quadraticCurveTo(16, 12, 0, 12);
                ctx.quadraticCurveTo(-16, 12, -15, -12);
                ctx.fillStyle = p.egg || '#ffd1e3'; ctx.fill();
                advA.ink(ctx, 1.2);
            } else {
                ctx.rotate(wob);
                advA.egg(ctx, 0, -6, 16, p.egg || '#ffd1e3', p.accent || '#8fd3ff', S.seed % 3);
                if (k > 1.6) {
                    ctx.beginPath();
                    ctx.moveTo(-10, -10); ctx.lineTo(-5, -14); ctx.lineTo(-1, -9); ctx.lineTo(4, -15); ctx.lineTo(9, -10);
                    ctx.strokeStyle = advA.INK; ctx.lineWidth = 1.2; ctx.stroke();
                }
            }
            ctx.restore();
            // Nest straw
            ctx.beginPath();
            ctx.ellipse(0, gy + 4, 24, 8, 0, 0, advTAU);
            ctx.fillStyle = '#c9934f'; ctx.fill();
            for (let i = 0; i < 10; i++) advA.line(ctx, -22 + i * 4.5, gy + 1 + (i % 2) * 3, -18 + i * 4.5, gy + 7 - (i % 2) * 3, '#a87536', 1);
        }
    },

    hopAcross: {
        caption: (p) => `${advA.critterName(p.c)} hops by`,
        draw(ctx, S) {
            const p = S.p;
            if (p.night) advT.night(ctx, S, S.seed); else advT.windowSky(ctx, S);
            const gy = S.hh * 0.62;
            if (p.snow) advT.snowGround(ctx, S, gy); else advT.grass(ctx, S, gy, p.grass || '#86c46a');
            if (p.props === 'eggs') {
                for (let i = 0; i < 3; i++) advA.egg(ctx, -S.hw * 0.6 + i * S.hw * 0.6, gy + 2, 5, ['#ffd1e3', '#c9f2ff', '#fff3a0'][i], ['#8fd3ff', '#ff8fb8', '#9be37a'][i], i);
            }
            const span = S.hw * 2 + 40;
            const x = ((S.age * 18) % span) - S.hw - 20;
            const ph = (S.age * 2.2) % 1;
            const hop = Math.sin(ph * Math.PI);
            advA.critter(ctx, p.c || 'bunny', x, advT.headOn(gy, 10) - hop * 12, 10, { t: S.t, squash: ph < 0.08 ? 1.2 : 1, hat: p.hat, scarf: p.scarf, hold: p.basket ? (c, s) => { advA.rr(c, -s * 0.4, -s * 0.1, s * 0.8, s * 0.5, s * 0.15); c.fillStyle = '#c9934f'; c.fill(); advA.egg(c, 0, -s * 0.15, s * 0.22, '#ffd1e3', '#8fd3ff', 1); } : null });
        }
    },

    swingOrnaments: {
        caption: (p) => ({ ornament: 'Shiny baubles', lantern: 'Glowing lanterns', heart: 'Hearts on strings', star: 'Swinging stars', bat: 'Hanging around', snowflake: 'Paper snowflakes' }[p.item || 'ornament']),
        draw(ctx, S) {
            const p = S.p;
            if (p.night) advT.night(ctx, S, S.seed); else advT.windowSky(ctx, S);
            const n = 3;
            const cols = p.colors || S.pal.accent || ['#e8505b', '#ffd447', '#7fc8f8'];
            if (p.garland !== false) {
                ctx.beginPath();
                ctx.moveTo(-S.hw, -S.hh + 4);
                ctx.quadraticCurveTo(0, -S.hh + 14, S.hw, -S.hh + 4);
                ctx.strokeStyle = p.garland || '#3f8f5a'; ctx.lineWidth = 4; ctx.stroke();
            }
            for (let i = 0; i < n; i++) {
                const x = (i - 1) * S.hw * 0.62;
                const len = 22 + (i % 2) * 14;
                const a = Math.sin(S.t * 1.8 + i * 1.3) * 0.25;
                const top = -S.hh + 8;
                const ex = x + Math.sin(a) * len, ey = top + Math.cos(a) * len;
                advA.line(ctx, x, top, ex, ey, 'rgba(90,70,60,0.7)', 0.8);
                ctx.save();
                ctx.translate(ex, ey);
                ctx.rotate(a);
                const c = cols[i % cols.length];
                switch (p.item || 'ornament') {
                    case 'ornament': advA.ornament(ctx, 0, 12, 10, c, i + 1, S.t); break;
                    case 'lantern': advA.lantern(ctx, 0, 12, 10, c, S.t); break;
                    case 'heart': advA.heart(ctx, 0, 10, 9, c, i === 1, S.t); break;
                    case 'star': advA.star(ctx, 0, 10, 11, c, -Math.PI / 2, i === 1, S.t); break;
                    case 'bat': advA.bat(ctx, 0, 10, 12, 0.3 + Math.sin(S.t * 3 + i) * 0.4, '#8a76b8'); break;
                    case 'snowflake': advA.snowflake(ctx, 0, 10, 10, '#ffffff', S.t * 0.4); break;
                }
                ctx.restore();
                if ((S.t * 1.3 + i) % 3 < 0.25) advA.sparkle(ctx, ex - 4, ey + 6, 3.5, '#ffffff');
            }
        }
    },

    snowmanBuild: {
        caption: () => 'Let\'s build a snowman!',
        draw(ctx, S) {
            advT.windowSky(ctx, S);
            const gy = S.hh * 0.66;
            advT.snowGround(ctx, S, gy);
            advT.flakes(ctx, S, 10, S.seed, 8);
            const k = S.age % 10;
            ctx.globalAlpha = 1 - advSmooth((k - 9.3) / 0.7);
            const bottomX = advLerp(-S.hw - 20, 0, advEaseOut(k / 1.4));
            // Bottom ball rolls in
            advA.circle(ctx, bottomX, gy - 12, 13, '#ffffff');
            advA.ink(ctx, 1.2, '#a9bed8', 0.8);
            if (k > 1.5) {
                const y = advLerp(-S.hh - 20, gy - 31, advEaseOutBack((k - 1.5) / 0.8));
                advA.circle(ctx, 0, y, 9.5, '#ffffff');
                advA.ink(ctx, 1.2, '#a9bed8', 0.8);
                if (k > 3.6) for (const yy of [-4, 1]) advA.circle(ctx, 0, y + yy, 1.2, '#4a3b3b');
            }
            if (k > 2.4) {
                const y = advLerp(-S.hh - 20, gy - 46, advEaseOutBack((k - 2.4) / 0.8));
                const wave = k > 4.8 ? Math.sin(k * 6) * 0.5 + 0.5 : 0;
                if (k > 4.2) {
                    ctx.strokeStyle = '#7a5236'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(-8, gy - 33); ctx.lineTo(-19, gy - 40);
                    ctx.moveTo(8, gy - 33); ctx.lineTo(19, gy - 40 - wave * 7);
                    ctx.stroke();
                }
                advA.circle(ctx, 0, y, 7.5, '#ffffff');
                advA.ink(ctx, 1.2, '#a9bed8', 0.8);
                if (k > 3.2) {
                    advA.face(ctx, 0, y, 6.5, { blink: advA.blink(S.t, 3), mouth: k > 4.8 ? 'open' : 'smile' });
                    ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(6, y + 1.5); ctx.lineTo(0, y + 2.6); ctx.closePath();
                    ctx.fillStyle = '#ff8a2a'; ctx.fill();
                }
                if (k > 3.6) {
                    // The hat drops in from the sky and lands on the head
                    const hy = advLerp(-S.hh - 30, y, advEaseOutBack((k - 3.6) / 0.6));
                    ctx.save();
                    ctx.translate(0, hy);
                    advA.hat(ctx, S.p.hat || 'top', 6.5, S.t, S.p.hatColor);
                    ctx.restore();
                }
                if (k > 4.2) {
                    advA.ellipse(ctx, 0, y + 7, 7, 2, S.p.scarf || '#e8384f');
                }
            }
            ctx.globalAlpha = 1;
        }
    }
};

Object.assign(ADVENT_TREATS, {

    flyby: {
        caption: (p) => ({ sleigh: 'Is that a sleigh?!', broom: 'A witch\'s cat on a broom', rocket: 'Zoom! A rocket', balloon: 'A hot air balloon drifts by', stork: 'Special delivery!', cupid: 'Cupid on a mission', bats: 'Bats across the moon', owl: 'An owl on night patrol' }[p.flyer || 'sleigh']),
        draw(ctx, S) {
            const p = S.p;
            const flyer = p.flyer || 'sleigh';
            const dayish = flyer === 'balloon' || flyer === 'stork' || flyer === 'cupid';
            if (dayish) advT.windowSky(ctx, S); else advT.night(ctx, S, S.seed);
            if (!dayish) advA.moon(ctx, 6, -6, 24, S.t, { face: true, sleepy: flyer !== 'broom' });
            else advA.cloud(ctx, 10, 8, 40, '#ffffff', true, S.t);
            const period = 6;
            const k = (S.age % period) / period;
            const x = advLerp(-S.hw - 34, S.hw + 34, k);
            const y = -6 - Math.sin(k * Math.PI) * 16 + Math.sin(S.t * 3) * 2;
            // Sparkly trail
            for (let i = 1; i < 7; i++) {
                const kk = k - i * 0.025;
                const tx = advLerp(-S.hw - 34, S.hw + 34, kk) - 14;
                const ty = -6 - Math.sin(kk * Math.PI) * 16 + 4;
                ctx.globalAlpha = (1 - i / 7) * 0.8;
                advA.sparkle(ctx, tx, ty + Math.sin(i * 2) * 2, 2.5 - i * 0.25, flyer === 'cupid' ? '#ff9ab8' : '#fff3a0');
            }
            ctx.globalAlpha = 1;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(-Math.cos(k * Math.PI) * 0.18);
            switch (flyer) {
                case 'sleigh': {
                    for (let i = 0; i < 2; i++) {
                        const rx = 16 + i * 13, ry = -4 + Math.sin(S.t * 8 + i) * 1.5;
                        advA.ellipse(ctx, rx, ry, 6, 3.5, '#a8743f');
                        advA.circle(ctx, rx + 6, ry - 3, 3, '#a8743f');
                        advA.line(ctx, rx + 6, ry - 6, rx + 4, ry - 10, '#7a4a22', 1);
                        advA.line(ctx, rx + 7, ry - 6, rx + 10, ry - 10, '#7a4a22', 1);
                        for (const l of [-3, 3]) advA.line(ctx, rx + l, ry + 2, rx + l + Math.sin(S.t * 12 + l) * 2, ry + 7, '#7a4a22', 1.2);
                        if (i === 1) advA.circle(ctx, rx + 9, ry - 3, 1.4, '#ff3b4f');
                    }
                    advA.line(ctx, 6, 0, 30, -3, '#d9b44a', 0.7);
                    ctx.beginPath();
                    ctx.moveTo(-12, -4); ctx.lineTo(8, -4); ctx.quadraticCurveTo(10, 4, 4, 6); ctx.lineTo(-10, 6); ctx.quadraticCurveTo(-14, 0, -12, -4);
                    ctx.fillStyle = '#e8384f'; ctx.fill(); advA.ink(ctx, 1);
                    advA.line(ctx, -14, 9, 10, 9, '#d9b44a', 1.3);
                    advA.gift(ctx, -6, -4, 7, 6, '#7fd8be', '#ffffff');
                    advA.critter(ctx, 'mouse', 0, -9, 4.5, { t: S.t, hat: 'santa', body: false, wave: 1 });
                    break;
                }
                case 'broom': {
                    advA.line(ctx, -16, 4, 16, 0, '#8a5a32', 1.8);
                    ctx.beginPath(); ctx.moveTo(-14, 4); ctx.lineTo(-26, -2); ctx.lineTo(-26, 10); ctx.closePath();
                    ctx.fillStyle = '#d9a84a'; ctx.fill();
                    advA.critter(ctx, 'cat', 0, -10, 6, { t: S.t, color: '#3b3546', hat: 'witch', arms: 'hug' });
                    break;
                }
                case 'rocket': {
                    ctx.rotate(0.3);
                    advA.flame(ctx, -16, 0, 9, S.t);
                    ctx.save(); ctx.rotate(Math.PI / 2); advA.flame(ctx, 0, 14, 10, S.t); ctx.restore();
                    ctx.beginPath(); ctx.moveTo(18, 0); ctx.quadraticCurveTo(8, -9, -12, -6); ctx.lineTo(-12, 6); ctx.quadraticCurveTo(8, 9, 18, 0);
                    ctx.fillStyle = '#f2f2f8'; ctx.fill(); advA.ink(ctx, 1);
                    advA.circle(ctx, 4, 0, 3.5, '#7fc8f8'); advA.ink(ctx, 1);
                    ctx.beginPath(); ctx.moveTo(-8, -6); ctx.lineTo(-15, -11); ctx.lineTo(-12, -4); ctx.closePath(); ctx.fillStyle = '#e8384f'; ctx.fill();
                    ctx.beginPath(); ctx.moveTo(-8, 6); ctx.lineTo(-15, 11); ctx.lineTo(-12, 4); ctx.closePath(); ctx.fill();
                    break;
                }
                case 'balloon': {
                    ctx.beginPath(); ctx.moveTo(-12, 0); ctx.quadraticCurveTo(-14, -22, 0, -24); ctx.quadraticCurveTo(14, -22, 12, 0); ctx.quadraticCurveTo(6, 8, 0, 9); ctx.quadraticCurveTo(-6, 8, -12, 0);
                    const g = ctx.createLinearGradient(-12, 0, 12, 0);
                    ['#ff6b6b', '#ffd43b', '#69db7c', '#4dabf7', '#9775fa'].forEach((c, i) => g.addColorStop(i / 4, c));
                    ctx.fillStyle = g; ctx.fill(); advA.ink(ctx, 1);
                    advA.line(ctx, -5, 8, -4, 15, '#7a5236', 0.8); advA.line(ctx, 5, 8, 4, 15, '#7a5236', 0.8);
                    advA.critter(ctx, p.c || 'bear', 0, 13, 4, { t: S.t, body: false, wave: 1 });
                    advA.rr(ctx, -5, 15, 10, 7, 2); ctx.fillStyle = '#c9934f'; ctx.fill(); advA.ink(ctx, 0.8);
                    break;
                }
                case 'stork': {
                    advA.ellipse(ctx, 0, 0, 10, 6, '#ffffff'); advA.ink(ctx, 1);
                    advA.ellipse(ctx, -2, -4 - Math.abs(Math.sin(S.t * 6)) * 6, 9, 3, '#f0f0f8', -0.4);
                    advA.line(ctx, 8, -2, 14, -9, '#ffffff', 3); advA.circle(ctx, 15, -10, 3.5, '#ffffff');
                    advA.line(ctx, 18, -10, 24, -8, '#ff9a3d', 1.6);
                    advA.circle(ctx, 16, -11, 0.8, advA.INK);
                    advA.line(ctx, 22, -8, 22, 2, '#c9b8b8', 0.6);
                    advA.critter(ctx, p.c || 'bunny', 22, 7, 3.5, { t: S.t, body: false });
                    ctx.beginPath(); ctx.moveTo(17, 4); ctx.quadraticCurveTo(22, 14, 27, 4); ctx.fillStyle = '#c9e8ff'; ctx.fill();
                    break;
                }
                case 'cupid': {
                    advA.ellipse(ctx, -6, -4 - Math.abs(Math.sin(S.t * 8)) * 4, 7, 4, '#ffffff', -0.6);
                    advA.critter(ctx, p.c || 'bunny', 0, -2, 6, { t: S.t, arms: 'hug', hat: 'bow', hatColor: '#ff6b8b' });
                    ctx.beginPath(); ctx.arc(9, 4, 6, -1.2, 1.2); ctx.strokeStyle = '#c9934f'; ctx.lineWidth = 1.2; ctx.stroke();
                    advA.line(ctx, 4, 4, 17, 4, '#8a5a32', 0.8);
                    advA.heart(ctx, 18, 4, 2.2, '#ff6b8b');
                    break;
                }
                case 'bats': {
                    for (let i = 0; i < 3; i++) advA.bat(ctx, -i * 12, (i % 2) * 8 - 4, 6 - i, S.t * 12 + i, '#3b3046');
                    break;
                }
                case 'owl': {
                    advA.critter(ctx, 'owl', 0, 0, 7, { t: S.t, arms: 'up' });
                    break;
                }
            }
            ctx.restore();
        }
    },

    jackOLantern: {
        caption: () => 'The jack-o\'-lantern is glowing',
        draw(ctx, S) {
            advT.night(ctx, S, S.seed);
            advA.moon(ctx, S.hw * 0.55, -S.hh * 0.55, 10, S.t, {});
            const gy = S.hh * 0.62;
            advA.ground(ctx, S, gy, '#3a2f55', 3);
            const k = S.age % 7;
            const peek = advSmooth((k - 2.5) / 0.5) * (1 - advSmooth((k - 5) / 0.5));
            advA.critter(ctx, 'ghost', 18 + peek * 12, gy - 16 - peek * 8, 9, { t: S.t, alpha: 0.9 * peek, mouth: 'o', lookX: -1 });
            const glow = 0.75 + 0.25 * Math.sin(S.t * 9) * Math.sin(S.t * 5.3);
            const g = ctx.createRadialGradient(0, gy - 12, 4, 0, gy - 12, 40);
            g.addColorStop(0, `rgba(255,170,60,${0.35 * glow})`);
            g.addColorStop(1, 'rgba(255,170,60,0)');
            ctx.fillStyle = g; ctx.fillRect(-S.hw, -S.hh, S.hw * 2, S.hh * 2);
            advA.pumpkin(ctx, 0, gy - 14, 20, { face: 'jack', glow });
            advA.bat(ctx, -S.hw * 0.5 + Math.sin(S.t) * 6, -S.hh * 0.45 + Math.sin(S.t * 2) * 4, 6, S.t * 12);
        }
    },

    ghostBoo: {
        caption: () => 'BOO! (just kidding, hi!)',
        draw(ctx, S) {
            advT.night(ctx, S, S.seed);
            const k = S.age % 7;
            const near = advSmooth((k - 1.5) / 0.8) * (1 - advSmooth((k - 4) / 1));
            const fade = advSmooth(k / 0.8) * (1 - advSmooth((k - 6.3) / 0.7));
            const s = 13 + near * 9;
            advA.critter(ctx, 'ghost', Math.sin(S.t * 0.9) * 10, -6 + Math.sin(S.t * 2.2) * 4 - near * 4, s, { t: S.t, alpha: 0.92 * fade, mouth: near > 0.6 ? 'open' : 'smile', eyes: k > 3.4 && k < 4.5 ? 'happy' : undefined, hat: S.p.hat });
            if (near > 0.7 && k < 3.4) advA.speech(ctx, 0, -S.hh * 0.45, 'boo!', 10);
            if (k > 3.4 && k < 4.6) advA.speech(ctx, 0, -S.hh * 0.45, 'hehe', 8);
        }
    },

    spiderDrop: {
        caption: () => 'A friendly spider drops in',
        draw(ctx, S) {
            advT.night(ctx, S, S.seed);
            // Corner web
            ctx.save();
            ctx.translate(-S.hw, -S.hh);
            ctx.strokeStyle = 'rgba(230,230,255,0.5)'; ctx.lineWidth = 0.7;
            for (let i = 0; i <= 4; i++) {
                const a = (i / 4) * Math.PI / 2;
                ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 34, Math.sin(a) * 34); ctx.stroke();
            }
            for (let r = 10; r <= 30; r += 10) {
                ctx.beginPath();
                for (let i = 0; i <= 4; i++) { const a = (i / 4) * Math.PI / 2; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
                ctx.stroke();
            }
            ctx.restore();
            const k = S.age % 7;
            const drop = k < 1.5 ? advEaseOutElastic(k / 1.5) : k < 5.5 ? 1 : 1 - advSmooth((k - 5.5) / 1.2);
            const y = -S.hh + 6 + drop * (S.hh + 4) + Math.sin(S.t * 2) * 2;
            const x = 6;
            advA.line(ctx, x, -S.hh, x, y - 6, 'rgba(240,240,255,0.7)', 0.8);
            for (let i = 0; i < 4; i++) {
                for (const side of [-1, 1]) {
                    const w = Math.sin(S.t * 8 + i + side) * 0.25 + (k > 2 && k < 4 && i === 0 && side === 1 ? Math.sin(S.t * 14) * 0.6 - 0.6 : 0);
                    const a = side * (0.5 + i * 0.32) + w;
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.quadraticCurveTo(x + Math.sin(a) * 12, y - 6 + i * 3, x + Math.sin(a) * 16, y + 2 + i * 3);
                    ctx.strokeStyle = '#2f2638'; ctx.lineWidth = 1.6; ctx.stroke();
                }
            }
            advA.circle(ctx, x, y, 9, '#3b3046');
            advA.face(ctx, x, y + 1, 7, { blink: advA.blink(S.t, 9), mouth: k > 2 && k < 4 ? 'open' : 'smile', ink: '#ffffff', eyeColor: '#ffffff' });
            if (k > 2 && k < 4) advA.speech(ctx, x + 18, y - 8, 'hiya!', 7, { tail: -1 });
        }
    },

    cauldron: {
        caption: () => 'Something sweet is brewing',
        draw(ctx, S) {
            advT.night(ctx, S, S.seed);
            const gy = S.hh * 0.68;
            advA.ground(ctx, S, gy, '#3a2f55', 2);
            for (let i = 0; i < 3; i++) advA.flame(ctx, -10 + i * 10, gy, 8, S.t, i);
            for (let i = 0; i < 6; i++) {
                const k = ((S.t * 0.5 + i / 6) % 1);
                const bx = -14 + advHash(i, 3) * 28 + Math.sin(k * 8 + i) * 3;
                const by = gy - 30 - k * 40;
                ctx.globalAlpha = 1 - k;
                if (i % 3 === 0) advA.star(ctx, bx, by, 3 + k * 2, ['#ffd447', '#ff8fb8', '#9df29d'][i % 3]);
                else advA.circle(ctx, bx, by, 2 + k * 3, advRgba('#9df29d', 0.8));
            }
            ctx.globalAlpha = 1;
            // Peeking cat behind the pot
            const peek = 0.5 + 0.5 * Math.sin(S.age * 0.9);
            advA.critter(ctx, 'cat', 22, gy - 30 - peek * 8, 8, { t: S.t, color: '#3b3546', body: false, lookX: -1 });
            ctx.beginPath();
            ctx.moveTo(-24, gy - 30);
            ctx.quadraticCurveTo(-28, gy - 2, 0, gy - 2);
            ctx.quadraticCurveTo(28, gy - 2, 24, gy - 30);
            ctx.closePath();
            ctx.fillStyle = '#2d2a35'; ctx.fill(); advA.ink(ctx, 1.2, '#000000');
            advA.ellipse(ctx, 0, gy - 30, 25, 5, '#5c4a6e');
            advA.ellipse(ctx, 0, gy - 29, 21, 3.5, '#7ee07a');
            for (let i = 0; i < 4; i++) {
                const b = ((S.t * 1.3 + i * 0.4) % 1);
                advA.circle(ctx, -14 + i * 9, gy - 30 - b * 3, 1.5 + b * 2, advRgba('#b6f5a8', 1 - b));
            }
        }
    },

    turkeyStrut: {
        caption: () => 'Gobble gobble!',
        draw(ctx, S) {
            advT.windowSky(ctx, S);
            const gy = S.hh * 0.66;
            advT.grass(ctx, S, gy, '#b9a35a');
            for (let i = -1; i <= 1; i += 2) advA.pumpkin(ctx, i * S.hw * 0.75, gy - 4, 6, { color: '#f2a03d' });
            const k = S.age % 8;
            const dir = k < 4 ? 1 : -1;
            const kk = k % 4;
            const x = dir * advLerp(-S.hw * 0.35, S.hw * 0.35, advSmooth(kk / 3));
            const fan = kk > 3 ? advEaseOutBack((kk - 3) / 0.6) : 0.35;
            const step = kk < 3 ? Math.abs(Math.sin(kk * 7)) * 2 : 0;
            advA.critter(ctx, 'turkey', x, advT.headOn(gy, 10) - step + 3, 10, { t: S.t, fan, flip: dir < 0, hat: S.p.hat });
            if (kk > 3.1) advA.speech(ctx, x + dir * 4, -S.hh * 0.35, 'gobble!', 7);
        }
    },

    pieWindow: {
        caption: (p) => `${advA.critterName(p.c)} smells pie`,
        draw(ctx, S) {
            const p = S.p;
            advA.sky(ctx, S, '#ffe2b8', '#ffd09a');
            // Curtains
            for (const side of [-1, 1]) {
                ctx.beginPath();
                ctx.moveTo(side * S.hw, -S.hh);
                ctx.lineTo(side * S.hw * 0.45, -S.hh);
                ctx.quadraticCurveTo(side * S.hw * 0.6, 0, side * S.hw * 0.85, S.hh * 0.3);
                ctx.lineTo(side * S.hw, S.hh * 0.3);
                ctx.closePath();
                ctx.fillStyle = p.curtain || '#e8505b'; ctx.fill();
            }
            const sill = S.hh * 0.38;
            advA.rr(ctx, -S.hw, sill, S.hw * 2, 8, 2);
            ctx.fillStyle = '#fff3dc'; ctx.fill(); advA.ink(ctx, 1);
            // Steam
            for (let i = 0; i < 3; i++) advT.steam(ctx, -6 + i * 6, sill - 10, ((S.t * 0.4 + i / 3) % 1), 16, 1.8);
            ctx.beginPath();
            ctx.moveTo(-22, sill);
            ctx.lineTo(-18, sill - 7);
            ctx.lineTo(18, sill - 7);
            ctx.lineTo(22, sill);
            ctx.closePath();
            ctx.fillStyle = '#d98a3a'; ctx.fill(); advA.ink(ctx, 1);
            advA.ellipse(ctx, 0, sill - 8, 18, 4, '#e8a85a');
            for (let i = -2; i <= 2; i++) advA.line(ctx, i * 6 - 2, sill - 9, i * 6 + 2, sill - 7, '#b5651d', 1);
            const k = S.age % 7;
            const up = advSmooth((k - 1) / 0.8) * (1 - advSmooth((k - 5.5) / 0.8));
            advA.critter(ctx, p.c || 'fox', 26, sill + 14 - up * 18, 10, { t: S.t, body: false, eyes: up > 0.8 ? 'happy' : undefined, mouth: 'cat', lookX: -1 });
            ctx.beginPath(); ctx.rect(-S.hw, sill + 8, S.hw * 2, S.hh); ctx.fillStyle = p.wall || '#f5d9b5'; ctx.fill();
            if (up > 0.8) advA.heart(ctx, 14, sill - 26 - Math.sin(S.t * 3) * 2, 3.5, '#ff6b8b');
        }
    },

    leafJump: {
        caption: (p) => `${advA.critterName(p.c)} jumps in the leaf pile`,
        draw(ctx, S) {
            const p = S.p;
            advT.windowSky(ctx, S);
            const gy = S.hh * 0.66;
            advT.grass(ctx, S, gy, '#a5b85a');
            const k = S.age % 7;
            const cols = ['#e8505b', '#ffb347', '#d9822b', '#f2c94c'];
            // Pile
            for (let i = 0; i < 18; i++) {
                const a = advHash(i, 1) * Math.PI;
                const r = advHash(i, 2) * 22;
                advA.leaf(ctx, Math.cos(a) * r * 1.3, gy - Math.sin(a) * r * 0.7, 9, i, cols[i % 4], 'maple');
            }
            const jumpX = advLerp(-S.hw - 10, 0, advSmooth(k / 1.2));
            const jumpY = k < 1.2 ? gy - 24 - Math.sin((k / 1.2) * Math.PI) * 20 : gy - 6;
            if (k < 1.25) advA.critter(ctx, p.c || 'fox', jumpX, jumpY - 10, 9, { t: S.t, arms: 'up', eyes: 'happy' });
            else {
                const pop = advEaseOutBack((k - 2.4) / 0.5) * (1 - advSmooth((k - 6) / 0.6));
                advA.critter(ctx, p.c || 'fox', 2, gy - 4 - pop * 10, 9, { t: S.t, body: false, eyes: 'happy', mouth: 'open' });
                // Front of the pile covers the critter
                for (let i = 0; i < 8; i++) advA.leaf(ctx, -18 + i * 5, gy + 2 - (i % 2) * 3, 9, i * 2, cols[(i + 1) % 4], 'maple');
            }
            // Burst
            const bk = (k - 1.2) / 2.8;
            if (bk > 0 && bk < 1) {
                for (let i = 0; i < 14; i++) {
                    const a = -Math.PI / 2 + (advHash(i, 7) - 0.5) * 2.4;
                    const v = 30 + advHash(i, 8) * 20;
                    const lx = Math.cos(a) * v * Math.min(bk * 2.5, 1) + Math.sin(bk * 10 + i) * 4 * bk;
                    const ly = gy - 10 + Math.sin(a) * v * Math.min(bk * 2.5, 1) + bk * bk * 50;
                    advA.leaf(ctx, lx, ly, 8, i + bk * 8, cols[i % 4], 'maple');
                }
            }
        }
    },

    juggle: {
        caption: (p) => `${advA.critterName(p.c)} juggles ${p.thing === 'apple' ? 'apples' : p.thing === 'egg' ? 'eggs' : p.thing === 'snowball' ? 'snowballs' : 'acorns'}`,
        draw(ctx, S) {
            const p = S.p;
            advT.windowSky(ctx, S);
            const gy = S.hh * 0.66;
            if (p.thing === 'snowball') advT.snowGround(ctx, S, gy); else advT.grass(ctx, S, gy, p.grass || '#a5b85a');
            const s = 11;
            const hy = advT.headOn(gy, s);
            advA.critter(ctx, p.c || 'squirrel', 0, hy, s, { t: S.t, arms: 'up', lookY: -1, eyes: Math.sin(S.t) > 0.9 ? 'happy' : undefined, hat: p.hat });
            for (let i = 0; i < 3; i++) {
                const ph = ((S.t * 0.9 + i / 3) % 1);
                const x = Math.cos(ph * advTAU) * 14;
                const y = hy - 16 - Math.sin(ph * Math.PI) * 22 - (ph > 0.5 ? 0 : 0);
                const th = p.thing || 'acorn';
                if (th === 'apple') advA.apple(ctx, x, y, 4.5, ['#e8434f', '#9ccc3a', '#f2c94c'][i]);
                else if (th === 'egg') advA.egg(ctx, x, y, 4, ['#ffd1e3', '#c9f2ff', '#fff3a0'][i], '#8fd3ff', i, ph * 6);
                else if (th === 'snowball') advA.circle(ctx, x, y, 4, '#ffffff'), advA.ink(ctx, 0.8, '#a9bed8');
                else advA.acorn(ctx, x, y, 4, ph * 8);
            }
        }
    },

    kiteFly: {
        caption: (p) => `${advA.critterName(p.c)} flies a kite`,
        draw(ctx, S) {
            const p = S.p;
            advT.windowSky(ctx, S);
            advA.cloud(ctx, -S.hw * 0.4 + Math.sin(S.t * 0.2) * 10, -S.hh * 0.5, 26, '#ffffff');
            const gy = S.hh * 0.66;
            advA.hill(ctx, S, -10, gy + 4, S.hw + 30, 14, '#7cc46a');
            const kx = S.hw * 0.35 + Math.sin(S.t * 0.9) * 8;
            const ky = -S.hh * 0.45 + Math.cos(S.t * 1.3) * 6;
            const hx = -S.hw * 0.35, hy = advT.headOn(gy - 6, 9);
            ctx.beginPath();
            ctx.moveTo(hx + 8, hy + 10);
            ctx.quadraticCurveTo((hx + kx) / 2, ky + 30, kx, ky + 10);
            ctx.strokeStyle = 'rgba(80,60,60,0.6)'; ctx.lineWidth = 0.7; ctx.stroke();
            // Tail
            ctx.beginPath();
            ctx.moveTo(kx, ky + 12);
            for (let i = 1; i <= 8; i++) ctx.lineTo(kx - i * 2.5, ky + 12 + i * 3 + Math.sin(S.t * 6 + i) * 2.5);
            ctx.strokeStyle = '#5a4a8a'; ctx.lineWidth = 0.8; ctx.stroke();
            for (let i = 2; i <= 8; i += 3) {
                const bx = kx - i * 2.5, by = ky + 12 + i * 3 + Math.sin(S.t * 6 + i) * 2.5;
                advA.ellipse(ctx, bx - 2, by, 2, 1.2, '#ff6b8b', 0.5);
                advA.ellipse(ctx, bx + 2, by, 2, 1.2, '#ff6b8b', -0.5);
            }
            ctx.save();
            ctx.translate(kx, ky);
            ctx.rotate(Math.sin(S.t * 1.5) * 0.15);
            ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(10, 0); ctx.lineTo(0, 12); ctx.lineTo(-10, 0); ctx.closePath();
            ctx.fillStyle = p.kite || '#ffd447'; ctx.fill(); advA.ink(ctx, 1);
            ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(10, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.fillStyle = '#ff6b8b'; ctx.fill();
            ctx.beginPath(); ctx.moveTo(0, 12); ctx.lineTo(-10, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.fillStyle = '#7fc8f8'; ctx.fill();
            advA.face(ctx, 0, 0, 5, { blink: advA.blink(S.t, 8) });
            ctx.restore();
            advA.critter(ctx, p.c || 'bunny', hx, hy, 9, { t: S.t, wave: 0.7, lookY: -1, lookX: 1, hat: p.hat });
        }
    },

    beachDay: {
        caption: () => 'Crab says: beach day!',
        draw(ctx, S) {
            advA.sky(ctx, S, '#8fd3ff', '#d8f3ff');
            advA.sun(ctx, -S.hw * 0.55, -S.hh * 0.55, 9, S.t);
            const sea = S.hh * 0.1;
            ctx.fillStyle = '#4fb3e8';
            ctx.fillRect(-S.hw - 1, sea, S.hw * 2 + 2, S.hh);
            const sand = S.hh * 0.45;
            ctx.beginPath();
            ctx.moveTo(-S.hw - 2, S.hh + 2);
            ctx.lineTo(-S.hw - 2, sand);
            for (let i = 0; i <= 12; i++) ctx.lineTo(-S.hw + (i / 12) * S.hw * 2, sand + Math.sin(i * 1.2 + S.t * 1.5) * 1.6);
            ctx.lineTo(S.hw + 2, S.hh + 2);
            ctx.closePath();
            ctx.fillStyle = '#f3d7a0'; ctx.fill();
            // Foam
            ctx.beginPath();
            for (let i = 0; i <= 12; i++) ctx.lineTo(-S.hw + (i / 12) * S.hw * 2, sand + Math.sin(i * 1.2 + S.t * 1.5) * 1.6);
            ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
            // Castle
            const cx = S.hw * 0.45;
            ctx.fillStyle = '#e8c27a';
            ctx.fillRect(cx - 10, sand + 2, 20, 12);
            ctx.fillRect(cx - 5, sand - 6, 10, 9);
            for (let i = 0; i < 3; i++) ctx.fillRect(cx - 10 + i * 8, sand - 1, 4, 3);
            advA.line(ctx, cx, sand - 6, cx, sand - 16, '#7a5236', 0.8);
            ctx.beginPath(); ctx.moveTo(cx, sand - 16); ctx.lineTo(cx + 6 + Math.sin(S.t * 5), sand - 14); ctx.lineTo(cx, sand - 12); ctx.fillStyle = '#ff6b8b'; ctx.fill();
            // Crab
            const x = Math.sin(S.age * 0.8) * S.hw * 0.4 - 8;
            const y = sand + 16 + Math.abs(Math.sin(S.age * 6)) * -1.5;
            const snap = Math.sin(S.t * 6) * 0.3;
            for (const side of [-1, 1]) {
                for (let l = 0; l < 3; l++) advA.line(ctx, x + side * 6, y + 2 + l, x + side * (12 + l), y + 6 + l * 2 + Math.sin(S.t * 14 + l) * 1, '#e8505b', 1.2);
                ctx.save();
                ctx.translate(x + side * 10, y - 8);
                ctx.rotate(side * snap);
                advA.circle(ctx, 0, 0, 4, '#ff6b6b');
                ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(side * 4, -3); ctx.lineTo(side * 4, 1); ctx.closePath(); ctx.fillStyle = '#f3d7a0'; ctx.fill();
                ctx.restore();
                advA.line(ctx, x + side * 6, y - 2, x + side * 9, y - 6, '#e8505b', 1.4);
            }
            advA.ellipse(ctx, x, y, 10, 7, '#ff6b6b'); advA.ink(ctx, 1, '#a83a3a');
            advA.line(ctx, x - 3, y - 6, x - 4, y - 10, '#e8505b', 1); advA.line(ctx, x + 3, y - 6, x + 4, y - 10, '#e8505b', 1);
            advA.circle(ctx, x - 4, y - 10, 2, '#ffffff'); advA.circle(ctx, x + 4, y - 10, 2, '#ffffff');
            advA.circle(ctx, x - 4, y - 10, 1, advA.INK); advA.circle(ctx, x + 4, y - 10, 1, advA.INK);
            advA.face(ctx, x, y - 1, 6, { eyes: 'none', mouth: 'smile' });
        }
    },

    iceCreamStack: {
        caption: () => 'Triple scoop!',
        draw(ctx, S) {
            advT.windowSky(ctx, S);
            const k = S.age % 8;
            const base = S.hh * 0.62;
            const fade = 1 - advSmooth((k - 7.3) / 0.6);
            ctx.globalAlpha = fade;
            ctx.beginPath();
            ctx.moveTo(-11, base - 26); ctx.lineTo(11, base - 26); ctx.lineTo(0, base + 4); ctx.closePath();
            ctx.fillStyle = '#e8b27a'; ctx.fill(); advA.ink(ctx, 1);
            ctx.save(); ctx.clip();
            for (let i = -3; i <= 3; i++) {
                advA.line(ctx, i * 6 - 10, base - 30, i * 6 + 10, base + 4, '#c98a4b', 0.8);
                advA.line(ctx, i * 6 + 10, base - 30, i * 6 - 10, base + 4, '#c98a4b', 0.8);
            }
            ctx.restore();
            const cols = S.p.scoops || ['#ffd1e3', '#fff3c4', '#8fd3a8'];
            const wob = Math.sin(S.t * 4) * Math.min(k / 4, 1) * 1.5;
            for (let i = 0; i < 3; i++) {
                const t0 = 0.3 + i * 0.9;
                if (k < t0) break;
                const y = advLerp(-S.hh - 20, base - 30 - i * 13, advEaseOutBack((k - t0) / 0.6));
                const x = wob * i;
                advA.circle(ctx, x, y, 12, cols[i]);
                for (let d = -2; d <= 2; d++) advA.circle(ctx, x + d * 5, y + 9, 3.2, cols[i]);
                advA.ink(ctx, 0.9, advDarken(cols[i], 0.4));
                if (i === 2 || (i === Math.floor((k - 0.3) / 0.9) && k < 3)) {
                    advA.face(ctx, x, y + 1, 7, { blink: advA.blink(S.t, i), mouth: 'cat' });
                }
            }
            if (k > 3.2) {
                const y = advLerp(-S.hh - 10, base - 30 - 26 - 13, advEaseOutBack((k - 3.2) / 0.5));
                advA.circle(ctx, wob * 2, y, 4.5, '#e8384f');
                advA.line(ctx, wob * 2, y - 4, wob * 2 + 4, y - 10, '#5a8a3a', 1);
                for (let i = 0; i < 7; i++) advA.line(ctx, wob * 2 - 8 + advHash(i, 3) * 16, base - 62 + advHash(i, 4) * 10, wob * 2 - 6 + advHash(i, 3) * 16, base - 61 + advHash(i, 4) * 10, ['#ff5d7d', '#7fd8be', '#ffd447', '#8fa8ff'][i % 4], 1.4);
            }
            ctx.globalAlpha = 1;
        }
    },

    underSea: {
        caption: (p) => p.c === 'octopus' ? 'Octo waves hello' : 'Under the sea',
        draw(ctx, S) {
            advA.sky(ctx, S, '#4fc3e8', '#1f6fa8');
            ctx.globalAlpha = 0.15;
            for (let i = 0; i < 3; i++) {
                ctx.beginPath(); ctx.moveTo(-S.hw + i * 30 + Math.sin(S.t) * 5, -S.hh); ctx.lineTo(-S.hw + i * 30 + 14, -S.hh); ctx.lineTo(-S.hw + i * 30 + 30, S.hh); ctx.lineTo(-S.hw + i * 30 + 6, S.hh); ctx.fillStyle = '#ffffff'; ctx.fill();
            }
            ctx.globalAlpha = 1;
            const gy = S.hh * 0.72;
            advA.ground(ctx, S, gy, '#f0d9a0', 2);
            for (let i = 0; i < 4; i++) {
                const x = -S.hw * 0.8 + i * S.hw * 0.5;
                ctx.beginPath(); ctx.moveTo(x, gy);
                for (let j = 1; j <= 6; j++) ctx.lineTo(x + Math.sin(S.t * 1.6 + j * 0.8 + i) * j * 0.8, gy - j * 6);
                ctx.strokeStyle = ['#3fae6b', '#5cc47a'][i % 2]; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.stroke();
            }
            for (let i = 0; i < 3; i++) {
                const dir = i % 2 ? -1 : 1;
                const span = S.hw * 2 + 40;
                const x = dir * (((S.t * (10 + i * 4) + i * 40) % span) - S.hw - 20);
                advA.fish(ctx, x, -S.hh * 0.45 + i * 16, 5 + (i % 2) * 2, ['#ff9a4d', '#ffd447', '#ff7ab8'][i], dir, S.t + i);
            }
            if (S.p.c) advA.critter(ctx, S.p.c, 0, gy - 26, 10, { t: S.t, wave: Math.sin(S.t * 3) * 0.5 + 0.5, hat: S.p.hat });
            for (let i = 0; i < 6; i++) {
                const k = ((S.t * 0.3 + advHash(S.seed, i)) % 1);
                advA.circle(ctx, -S.hw * 0.6 + advHash(S.seed, i + 4) * S.hw * 1.2 + Math.sin(k * 10) * 2, S.hh - k * S.hh * 2, 1.2 + k * 1.5, 'rgba(255,255,255,0.55)');
            }
        }
    },

    whaleSpout: {
        caption: () => 'A happy little whale',
        draw(ctx, S) {
            advA.sky(ctx, S, '#9fd8ff', '#e6f7ff');
            const sea = S.hh * 0.25;
            const k = S.age % 5;
            const bob = Math.sin(S.t * 1.5) * 2;
            // Spout
            if (k > 1 && k < 3.5) {
                const sk = (k - 1) / 2.5;
                const h = advEaseOut(Math.min(sk * 2, 1)) * 26 * (1 - advSmooth((sk - 0.7) / 0.3));
                ctx.strokeStyle = '#bfe8ff'; ctx.lineWidth = 3; ctx.lineCap = 'round';
                ctx.beginPath(); ctx.moveTo(-2, sea - 14 + bob); ctx.lineTo(-2, sea - 14 - h + bob); ctx.stroke();
                for (let i = 0; i < 6; i++) {
                    const a = -Math.PI / 2 + (i - 2.5) * 0.45;
                    const d = h * 0.6;
                    const fn = S.p.hearts ? (x, y) => advA.heart(ctx, x, y, 2.4, '#ff8fb8') : (x, y) => advA.drop(ctx, x, y, 1.8, '#bfe8ff');
                    fn(-2 + Math.cos(a) * d, sea - 14 - h + bob + Math.sin(a) * d * 0.5 + sk * 6);
                }
            }
            ctx.beginPath();
            ctx.moveTo(-26, sea + bob);
            ctx.quadraticCurveTo(-26, sea - 22 + bob, 0, sea - 20 + bob);
            ctx.quadraticCurveTo(24, sea - 18 + bob, 22, sea + bob);
            ctx.closePath();
            ctx.fillStyle = '#5c8fd6'; ctx.fill(); advA.ink(ctx, 1);
            ctx.save();
            ctx.translate(26, sea - 6 + bob);
            ctx.rotate(Math.sin(S.t * 2) * 0.3);
            ctx.beginPath(); ctx.moveTo(0, 4); ctx.quadraticCurveTo(6, -6, 12, -8); ctx.quadraticCurveTo(8, 0, 12, 6); ctx.quadraticCurveTo(6, 2, 0, 6);
            ctx.fillStyle = '#5c8fd6'; ctx.fill(); advA.ink(ctx, 1);
            ctx.restore();
            advA.face(ctx, -12, sea - 8 + bob, 7, { blink: advA.blink(S.t, 4), mouth: 'smile' });
            ctx.fillStyle = '#3d8fd0';
            ctx.fillRect(-S.hw - 1, sea, S.hw * 2 + 2, S.hh);
            ctx.beginPath();
            for (let i = 0; i <= 14; i++) ctx.lineTo(-S.hw + (i / 14) * S.hw * 2, sea + Math.sin(i * 1.4 + S.t * 2) * 1.5);
            ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6; ctx.stroke();
        }
    },

    campfire: {
        caption: (p) => `${advA.critterName(p.c)} toasts a marshmallow`,
        draw(ctx, S) {
            advT.night(ctx, S, S.seed);
            const gy = S.hh * 0.62;
            advA.ground(ctx, S, gy, '#2f4a3a', 2);
            advA.pine(ctx, -S.hw * 0.75, gy, 30, '#2a5a3a');
            advA.pine(ctx, S.hw * 0.8, gy, 24, '#2a5a3a');
            const fx = 6;
            const g = ctx.createRadialGradient(fx, gy - 6, 2, fx, gy - 6, 40);
            g.addColorStop(0, 'rgba(255,170,60,0.4)');
            g.addColorStop(1, 'rgba(255,170,60,0)');
            ctx.fillStyle = g; ctx.fillRect(-S.hw, -S.hh, S.hw * 2, S.hh * 2);
            advA.line(ctx, fx - 12, gy + 2, fx + 12, gy - 3, '#7a4a2c', 4);
            advA.line(ctx, fx - 12, gy - 3, fx + 12, gy + 2, '#8a5a32', 4);
            advA.flame(ctx, fx - 4, gy - 2, 12, S.t, 1);
            advA.flame(ctx, fx + 4, gy - 2, 10, S.t, 2);
            advA.flame(ctx, fx, gy - 2, 16, S.t, 3);
            for (let i = 0; i < 5; i++) {
                const k = ((S.t * 0.6 + i / 5) % 1);
                advA.circle(ctx, fx + Math.sin(k * 9 + i) * 6, gy - 16 - k * 40, 0.9, advRgba('#ffcf6a', 1 - k));
            }
            const cx = -S.hw * 0.4;
            const toast = (S.age % 8) / 8;
            const hy = advT.headOn(gy, 9);
            advA.critter(ctx, S.p.c || 'bear', cx, hy, 9, { t: S.t, wave: 0.6, lookX: 1, scarf: S.p.scarf, hat: S.p.hat, eyes: toast > 0.85 ? 'happy' : undefined });
            const sx = cx + 12, sy = hy + 10;
            advA.line(ctx, sx, sy, fx - 2, gy - 18, '#8a5a32', 1);
            advA.rr(ctx, fx - 5, gy - 21, 5, 5, 1.5);
            ctx.fillStyle = advMix('#ffffff', '#c98a4b', toast); ctx.fill();
            for (let i = 0; i < 3; i++) advT.firefly(ctx, Math.sin(S.t * 0.5 + i * 2) * S.hw * 0.7, -S.hh * 0.3 + Math.cos(S.t * 0.7 + i) * 10, 1.1, S.t, i);
        }
    },

    rocketLaunch: {
        caption: () => '3... 2... 1... liftoff!',
        draw(ctx, S) {
            advA.sky(ctx, S, '#141a3a', '#3a3270');
            advA.stars(ctx, S, 26, S.seed, S.t);
            const gy = S.hh * 0.66;
            const k = S.age % 7;
            const lift = k < 2 ? 0 : advEaseIn((k - 2) / 2.5) * (S.hh * 2 + 50);
            const rumble = k > 1 && k < 2.4 ? Math.sin(S.t * 60) * 1.2 : 0;
            if (k > 4.5) {
                const pk = (k - 4.5) / 2.5;
                advA.circle(ctx, -S.hw * 0.4, -S.hh * 0.3, 12, '#f2a03d');
                advA.ellipse(ctx, -S.hw * 0.4, -S.hh * 0.3, 20, 4, null, -0.3);
                ctx.strokeStyle = '#ffd447'; ctx.lineWidth = 1.5; ctx.stroke();
                advA.critter(ctx, 'alien', -S.hw * 0.4, -S.hh * 0.3 - 18 - Math.abs(Math.sin(pk * 12)) * 4, 5, { t: S.t, wave: Math.sin(S.t * 8) * 0.5 + 0.5 });
            }
            advA.ground(ctx, S, gy, '#7a7a9a', 2);
            // Smoke
            if (k > 1 && k < 5) {
                for (let i = 0; i < 7; i++) {
                    const sk = advClamp((k - 1) / 2 - i * 0.05, 0, 1);
                    advA.circle(ctx, (i - 3) * 7 * sk + rumble, gy - 3 - Math.sin(i) * 3, 5 + sk * 6, advRgba('#e8e8f0', 0.9 * (1 - advSmooth((k - 3.5) / 1.5))));
                }
            }
            ctx.save();
            ctx.translate(rumble, gy - 22 - lift);
            if (k > 1.2) advA.flame(ctx, 0, 18, 12 + Math.sin(S.t * 30) * 2, S.t);
            ctx.beginPath(); ctx.moveTo(0, -24); ctx.quadraticCurveTo(10, -10, 8, 14); ctx.lineTo(-8, 14); ctx.quadraticCurveTo(-10, -10, 0, -24);
            ctx.fillStyle = '#f2f2f8'; ctx.fill(); advA.ink(ctx, 1.2);
            ctx.beginPath(); ctx.moveTo(0, -24); ctx.quadraticCurveTo(6, -18, 7, -12); ctx.lineTo(-7, -12); ctx.quadraticCurveTo(-6, -18, 0, -24);
            ctx.fillStyle = '#e8384f'; ctx.fill();
            advA.circle(ctx, 0, -2, 5, '#7fc8f8'); advA.ink(ctx, 1.2);
            advA.critter(ctx, S.p.c || 'cat', 0, -2, 3, { t: S.t, body: false });
            for (const side of [-1, 1]) {
                ctx.beginPath(); ctx.moveTo(side * 8, 4); ctx.lineTo(side * 15, 16); ctx.lineTo(side * 7, 14); ctx.closePath();
                ctx.fillStyle = '#e8384f'; ctx.fill(); advA.ink(ctx, 1);
            }
            ctx.restore();
            if (k < 2) {
                ctx.font = `800 14px ${ADVENT_FONT_ROUND}`;
                ctx.fillStyle = '#ffd447'; ctx.textAlign = 'center';
                ctx.fillText(String(3 - Math.floor(k * 1.5)), S.hw * 0.55, -S.hh * 0.4);
            }
        }
    },

    planetPal: {
        caption: () => 'Zib waves from a tiny planet',
        draw(ctx, S) {
            advA.sky(ctx, S, '#141a3a', '#2d2660');
            advA.stars(ctx, S, 30, S.seed, S.t);
            const r = 20;
            // Back half of the ring
            ctx.save(); ctx.translate(0, 8); ctx.rotate(-0.25);
            ctx.beginPath(); ctx.ellipse(0, 0, r * 1.7, r * 0.42, 0, Math.PI, advTAU); ctx.strokeStyle = '#ffd447'; ctx.lineWidth = 3; ctx.stroke();
            ctx.restore();
            advA.circle(ctx, 0, 8, r, S.p.planet || '#ff9a76'); advA.ink(ctx, 1.2);
            ctx.save(); advA.circle(ctx, 0, 8, r); ctx.clip();
            for (let i = 0; i < 3; i++) advA.ellipse(ctx, ((S.t * 4 + i * 16) % 60) - 30, 2 + i * 6, 6, 2, advLighten(S.p.planet || '#ff9a76', 0.25));
            ctx.restore();
            advA.face(ctx, 0, 12, 10, { blink: advA.blink(S.t, 2) });
            ctx.save(); ctx.translate(0, 8); ctx.rotate(-0.25);
            ctx.beginPath(); ctx.ellipse(0, 0, r * 1.7, r * 0.42, 0, 0, Math.PI); ctx.strokeStyle = '#ffd447'; ctx.lineWidth = 3; ctx.stroke();
            ctx.restore();
            const a = S.t * 0.8;
            advA.circle(ctx, Math.cos(a) * 36, 8 + Math.sin(a) * 12, 4, '#e8e8f0');
            const hop = Math.abs(Math.sin(S.age * 3)) * 5;
            advA.critter(ctx, 'alien', 0, 8 - r - 12 - hop, 5.5, { t: S.t, wave: Math.sin(S.t * 6) * 0.5 + 0.5 });
        }
    },

    loveBugs: {
        caption: (p) => `${advA.critterName(p.c)} & ${advA.critterName(p.c2 || p.c)}, best friends`,
        draw(ctx, S) {
            const p = S.p;
            advT.windowSky(ctx, S);
            const gy = S.hh * 0.66;
            advT.grass(ctx, S, gy, p.grass || '#9fd88a');
            const k = S.age % 6;
            const lean = advSmooth((k - 1) / 0.6) * (1 - advSmooth((k - 5) / 0.7));
            const s = 11;
            const c2 = p.c2 || p.c || 'bear';
            advA.critter(ctx, p.c || 'bunny', -15 + lean * 4, advT.headOn(gy, s), s, { t: S.t, rot: lean * 0.15, eyes: lean > 0.9 ? 'happy' : undefined, hat: p.hat });
            advA.critter(ctx, c2, 15 - lean * 4, advT.headOn(gy, s), s, { t: S.t + 2, rot: -lean * 0.15, flip: true, eyes: lean > 0.9 ? 'happy' : undefined, hat: p.hat2 });
            if (lean > 0.5) {
                for (let i = 0; i < 3; i++) {
                    const kk = ((S.t * 0.5 + i / 3) % 1);
                    ctx.globalAlpha = advPulse(kk, 0, 1) * lean;
                    advA.heart(ctx, Math.sin(kk * 6 + i) * 6, -10 - kk * 34, 3 + kk * 2, '#ff6b8b');
                }
                ctx.globalAlpha = 1;
                advA.heart(ctx, 0, advT.headOn(gy, s) - 20, 5 + Math.sin(S.t * 6) * 0.8, '#ff4d6d');
            }
        }
    },

    loveLetter: {
        caption: () => 'You\'ve got a love letter',
        draw(ctx, S) {
            advA.sky(ctx, S, '#ffe0ec', '#ffc2d6');
            const k = S.age % 7;
            const flap = advSmooth((k - 0.8) / 0.7) * (1 - advSmooth((k - 6.2) / 0.6));
            const rise = advEaseOutBack((k - 1.5) / 0.8) * (1 - advSmooth((k - 5.6) / 0.6));
            const w = 50, h = 32, y = 10;
            // Back of envelope
            advA.rr(ctx, -w / 2, y - h / 2, w, h, 3);
            ctx.fillStyle = '#f6d1b6'; ctx.fill();
            // Flap (opens upward)
            ctx.beginPath();
            ctx.moveTo(-w / 2, y - h / 2);
            ctx.lineTo(0, y - h / 2 + (1 - flap * 2) * h * 0.55);
            ctx.lineTo(w / 2, y - h / 2);
            ctx.closePath();
            ctx.fillStyle = flap > 0.5 ? '#eebc98' : '#f9dcc6'; ctx.fill(); advA.ink(ctx, 1);
            // Letter
            ctx.save();
            ctx.beginPath(); ctx.rect(-w, -S.hh, w * 2, y + S.hh + 4); ctx.clip();
            const ly = y - 4 - rise * 26;
            advA.rr(ctx, -w * 0.4, ly - 12, w * 0.8, 30, 2);
            ctx.fillStyle = '#ffffff'; ctx.fill(); advA.ink(ctx, 0.8);
            for (let i = 0; i < 3; i++) advA.line(ctx, -14, ly - 4 + i * 5, 14 - i * 6, ly - 4 + i * 5, '#ffb3c6', 1.2);
            advA.heart(ctx, 0, ly - 9, 3.5, '#ff4d6d');
            ctx.restore();
            // Front pocket
            ctx.beginPath();
            ctx.moveTo(-w / 2, y - h / 2);
            ctx.lineTo(0, y + 2);
            ctx.lineTo(w / 2, y - h / 2);
            ctx.lineTo(w / 2, y + h / 2);
            ctx.lineTo(-w / 2, y + h / 2);
            ctx.closePath();
            ctx.fillStyle = '#ffe3cf'; ctx.fill(); advA.ink(ctx, 1);
            if (flap < 0.5) advA.heart(ctx, 0, y - 2, 5, '#e8384f');
            for (let i = 0; i < 4; i++) {
                const kk = ((S.t * 0.4 + i / 4) % 1);
                ctx.globalAlpha = advPulse(kk, 0, 1) * rise;
                advA.heart(ctx, -20 + i * 13 + Math.sin(kk * 7) * 4, -6 - kk * 36, 3, ['#ff6b8b', '#ff9ab8', '#e8384f'][i % 3]);
            }
            ctx.globalAlpha = 1;
        }
    },

    potOfGold: {
        caption: () => 'Gold at the end of the rainbow!',
        draw(ctx, S) {
            advT.windowSky(ctx, S);
            const gy = S.hh * 0.66;
            advA.rainbow(ctx, -S.hw * 0.15, gy + 6, S.hw * 0.95, 4.5, 1);
            advT.grass(ctx, S, gy, '#5cbf60');
            const px = S.hw * 0.45;
            for (let i = 0; i < 5; i++) {
                const k = ((S.age * 0.7 + i / 5) % 1);
                const a = -Math.PI / 2 + (i - 2) * 0.35;
                advA.coin(ctx, px + Math.cos(a) * k * 30, gy - 14 + Math.sin(a) * k * 30 + k * k * 34, 3.2, S.t * 6 + i);
            }
            ctx.beginPath();
            ctx.moveTo(px - 14, gy - 14);
            ctx.quadraticCurveTo(px - 18, gy + 4, px, gy + 4);
            ctx.quadraticCurveTo(px + 18, gy + 4, px + 14, gy - 14);
            ctx.closePath();
            ctx.fillStyle = '#2d2a35'; ctx.fill(); advA.ink(ctx, 1, '#000000');
            for (let i = 0; i < 6; i++) advA.coin(ctx, px - 10 + i * 4, gy - 15 - (i % 2) * 2, 3, i);
            advA.ellipse(ctx, px, gy - 14, 15, 3, null);
            ctx.strokeStyle = '#4a4458'; ctx.lineWidth = 2; ctx.stroke();
            const jig = Math.abs(Math.sin(S.age * 4)) * 3;
            ctx.save(); ctx.translate(px + 3, gy - 18 - jig); ctx.rotate(0.2);
            advA.hat(ctx, 'leprechaun', 9, S.t);
            ctx.restore();
            if ((S.t % 2) < 1) advA.sparkle(ctx, px - 8, gy - 22, 3, '#fff6a8');
        }
    },

    luckyClover: {
        caption: () => 'A four-leaf clover. Lucky you!',
        draw(ctx, S) {
            advT.windowSky(ctx, S);
            advT.grass(ctx, S, S.hh * 0.72, '#6cc46a');
            const pulse = 1 + Math.sin(S.t * 2) * 0.04;
            ctx.save();
            ctx.translate(0, -6);
            ctx.scale(pulse, pulse);
            advA.clover(ctx, 0, 0, 26, '#43b05c', 4, Math.sin(S.t * 0.8) * 0.2);
            ctx.restore();
            advA.face(ctx, 0, -6, 8, { blink: advA.blink(S.t, 3) });
            // Ladybug walks around the leaves
            const a = S.t * 0.7;
            const lx = Math.cos(a) * 18, ly = -6 + Math.sin(a) * 18;
            ctx.save(); ctx.translate(lx, ly); ctx.rotate(a + Math.PI);
            advA.circle(ctx, 0, 0, 4, '#e8384f'); advA.ink(ctx, 0.7);
            advA.circle(ctx, 0, -3.5, 2, advA.INK);
            advA.line(ctx, 0, -2, 0, 4, advA.INK, 0.6);
            advA.circle(ctx, -1.8, 1, 0.8, advA.INK); advA.circle(ctx, 1.8, 1, 0.8, advA.INK);
            ctx.restore();
            for (let i = 0; i < 4; i++) {
                const tw = (S.t * 0.8 + i * 0.25) % 1;
                advA.sparkle(ctx, Math.cos(i * 1.6) * 34, -6 + Math.sin(i * 2.1) * 26, 3.5 * advPulse(tw, 0, 1), '#fff6a8');
            }
        }
    },

    flagPicnic: {
        caption: () => 'A star-spangled picnic',
        draw(ctx, S) {
            advT.windowSky(ctx, S);
            const gy = S.hh * 0.62;
            advT.grass(ctx, S, gy, '#6cc46a');
            // Flag
            const fx = -S.hw * 0.45, top = -S.hh * 0.6;
            advA.line(ctx, fx, gy, fx, top - 3, '#9a8a7a', 1.6);
            advA.circle(ctx, fx, top - 4, 2, '#ffd447');
            const fw = 32, fh = 20;
            for (let row = 0; row < 7; row++) {
                ctx.beginPath();
                for (let i = 0; i <= 10; i++) {
                    const u = i / 10;
                    const wave = Math.sin(S.t * 4 - u * 5) * 2.2 * u;
                    const x = fx + u * fw;
                    ctx.lineTo(x, top + row * (fh / 7) + wave);
                }
                for (let i = 10; i >= 0; i--) {
                    const u = i / 10;
                    const wave = Math.sin(S.t * 4 - u * 5) * 2.2 * u;
                    ctx.lineTo(fx + u * fw, top + (row + 1) * (fh / 7) + wave);
                }
                ctx.fillStyle = row % 2 ? '#ffffff' : '#e8384f';
                ctx.fill();
            }
            ctx.beginPath();
            for (let i = 0; i <= 4; i++) { const u = i / 10; ctx.lineTo(fx + u * fw, top + Math.sin(S.t * 4 - u * 5) * 2.2 * u); }
            for (let i = 4; i >= 0; i--) { const u = i / 10; ctx.lineTo(fx + u * fw, top + fh * 0.57 + Math.sin(S.t * 4 - u * 5) * 2.2 * u); }
            ctx.fillStyle = '#3c5ab8'; ctx.fill();
            for (let i = 0; i < 4; i++) advA.circle(ctx, fx + 3 + (i % 2) * 6, top + 3 + Math.floor(i / 2) * 5, 0.9, '#ffffff');
            // Blanket + watermelon
            ctx.beginPath();
            ctx.moveTo(-6, gy + 4); ctx.lineTo(S.hw * 0.9, gy + 4); ctx.lineTo(S.hw * 0.75, gy + 16); ctx.lineTo(-14, gy + 16); ctx.closePath();
            ctx.fillStyle = '#ff6b6b'; ctx.fill();
            ctx.save(); ctx.clip();
            for (let i = 0; i < 8; i++) { ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(-14 + i * 9, gy, 4, 20); }
            ctx.restore();
            const wx = S.hw * 0.35;
            ctx.beginPath(); ctx.moveTo(wx - 13, gy); ctx.arc(wx, gy, 13, Math.PI, 0); ctx.closePath();
            ctx.save(); ctx.translate(0, 0);
            ctx.fillStyle = '#5cbf60'; ctx.fill();
            ctx.beginPath(); ctx.arc(wx, gy, 11, Math.PI, 0); ctx.closePath(); ctx.fillStyle = '#ff5d6c'; ctx.fill();
            ctx.restore();
            for (let i = 0; i < 5; i++) advA.ellipse(ctx, wx - 7 + i * 3.5, gy - 4 - (i % 2) * 2, 0.8, 1.3, advA.INK);
            advA.face(ctx, wx, gy - 4, 5, { blink: advA.blink(S.t, 6), eyes: 'none', mouth: 'smile' });
            // Ants marching in
            for (let i = 0; i < 4; i++) {
                const ax = S.hw + 8 - ((S.age * 6 + i * 6) % (S.hw * 0.6 + 10));
                advA.circle(ctx, ax, gy + 13, 1.3, advA.INK); advA.circle(ctx, ax + 2.4, gy + 13, 1.6, advA.INK);
                if (i === 0) advA.circle(ctx, ax - 1, gy + 10, 1.4, '#ff5d6c');
            }
        }
    },

    sparkler: {
        caption: (p) => `${advA.critterName(p.c)} writes with a sparkler`,
        draw(ctx, S) {
            advT.night(ctx, S, S.seed);
            const gy = S.hh * 0.66;
            advA.ground(ctx, S, gy, '#2a2448', 2);
            const s = 10;
            const hy = advT.headOn(gy, s);
            const shape = S.p.shape || 'heart';
            const path = (u) => {
                const a = u * advTAU;
                if (shape === 'star') {
                    const r = 12 * (1 + 0.45 * Math.cos(a * 5));
                    return [Math.cos(a - Math.PI / 2) * r, Math.sin(a - Math.PI / 2) * r];
                }
                return [16 * Math.pow(Math.sin(a), 3) * 0.9, -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) * 0.9];
            };
            const cx = 10, cy = -S.hh * 0.25;
            const u = (S.age * 0.35) % 1;
            for (let i = 0; i < 40; i++) {
                const uu = u - i * 0.012;
                if (uu < 0) break;
                const [x, y] = path(uu);
                ctx.globalAlpha = 1 - i / 40;
                advA.circle(ctx, cx + x, cy + y, 1.6, '#ffe38a');
            }
            ctx.globalAlpha = 1;
            const [tx, ty] = path(u);
            for (let i = 0; i < 10; i++) {
                const a = advHash(i, Math.floor(S.t * 20)) * advTAU;
                const d = 2 + advHash(i + 3, Math.floor(S.t * 20)) * 6;
                advA.line(ctx, cx + tx, cy + ty, cx + tx + Math.cos(a) * d, cy + ty + Math.sin(a) * d, '#fff3c4', 0.8);
            }
            advA.line(ctx, -14 + 8, hy + 9, cx + tx, cy + ty, '#9a9aaa', 1);
            advA.critter(ctx, S.p.c || 'bunny', -14, hy, s, { t: S.t, wave: 0.8, lookX: 1, lookY: -0.6, hat: S.p.hat });
        }
    },

    dragonDance: {
        caption: () => 'The dragon dance!',
        draw(ctx, S) {
            advA.sky(ctx, S, '#3a1830', '#7a2a3a');
            advA.stars(ctx, S, 10, S.seed, S.t, '#ffd99a');
            for (let i = 0; i < 3; i++) advA.lantern(ctx, (i - 1) * S.hw * 0.65, -S.hh * 0.62 + Math.sin(S.t * 1.5 + i) * 1.5, 6, '#e8384f', S.t);
            const gy = S.hh * 0.7;
            advA.ground(ctx, S, gy, '#4a2030', 1);
            const segs = 7;
            const head = ((S.age * 16) % (S.hw * 2 + 70)) - S.hw - 10;
            for (let i = segs; i >= 0; i--) {
                const x = head - i * 9;
                const y = gy - 22 + Math.sin(S.t * 4 - i * 0.8) * 6;
                advA.line(ctx, x, y + 4, x, gy, '#8a5a32', 1.2);
                if (i === 0) {
                    ctx.save(); ctx.translate(x + 4, y - 2);
                    advA.circle(ctx, 0, 0, 10, '#e8384f'); advA.ink(ctx, 1, '#7a1020');
                    for (let m = 0; m < 5; m++) advA.circle(ctx, -8 + m * 1, -8 + m * 2, 2.6, '#ffd447');
                    advA.face(ctx, 3, -1, 7, { blink: advA.blink(S.t, 5), mouth: 'open' });
                    for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(side * 3, -8); ctx.lineTo(side * 7, -15); ctx.lineTo(side * 7, -8); ctx.fillStyle = '#ffd447'; ctx.fill(); }
                    advA.line(ctx, 10, 2, 16, 5 + Math.sin(S.t * 5) * 2, '#ffd447', 1);
                    ctx.restore();
                } else {
                    advA.circle(ctx, x, y, 7, i % 2 ? '#ffd447' : '#e8384f');
                    advA.ink(ctx, 0.8, '#7a1020');
                    ctx.beginPath(); ctx.moveTo(x - 3, y - 6); ctx.lineTo(x, y - 11); ctx.lineTo(x + 3, y - 6); ctx.fillStyle = '#ffffff'; ctx.fill();
                }
            }
        }
    },

    lanternRise: {
        caption: () => 'Wishes float up on lanterns',
        draw(ctx, S) {
            advA.sky(ctx, S, '#1b1d45', '#5b3a6b');
            advA.stars(ctx, S, 20, S.seed, S.t);
            const gy = S.hh * 0.68;
            ctx.fillStyle = '#2a2650'; ctx.fillRect(-S.hw - 1, gy, S.hw * 2 + 2, S.hh);
            for (let i = 0; i < 5; i++) {
                const k = ((S.age * 0.09 + i / 5) % 1);
                const x = (advHash(S.seed, i) * 1.6 - 0.8) * S.hw + Math.sin(S.t * 0.8 + i) * 3;
                const y = gy - 6 - k * (S.hh * 2);
                const sc = 1 - k * 0.5;
                ctx.globalAlpha = Math.min(1, (1 - k) * 2.2);
                advA.lantern(ctx, x, y, 7 * sc, i % 2 ? '#ff9a4d' : '#e8384f', S.t + i);
                // Reflection
                ctx.globalAlpha *= 0.25;
                advA.ellipse(ctx, x, gy + 6 + k * 8, 4 * sc, 1.5 * sc, '#ffc46a');
            }
            ctx.globalAlpha = 1;
        }
    },

    partyPopper: {
        caption: (p) => `${advA.critterName(p.c)} pops a party popper`,
        draw(ctx, S) {
            const p = S.p;
            advA.sky(ctx, S, p.night ? '#1d2350' : '#ffe9f3', p.night ? '#4b3f7a' : '#fff7d6');
            if (p.night) advA.stars(ctx, S, 16, S.seed, S.t);
            const gy = S.hh * 0.66;
            advA.ground(ctx, S, gy, p.night ? '#2a2448' : '#ffd1e3', 1);
            const k = S.age % 5;
            const s = 11;
            const hy = advT.headOn(gy, s);
            advA.critter(ctx, p.c || 'cat', -10, hy, s, { t: S.t, wave: k > 1 ? 1 : 0.3, eyes: k > 1 && k < 2.5 ? 'happy' : undefined, mouth: k > 1 && k < 2.5 ? 'open' : 'smile', hat: p.hat || 'party', hatColor: p.hatColor });
            ctx.save();
            ctx.translate(8, hy + 2);
            ctx.rotate(-0.7);
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-4, 12); ctx.lineTo(4, 12); ctx.closePath();
            ctx.fillStyle = '#ffd447'; ctx.fill(); advA.ink(ctx, 0.8);
            ctx.restore();
            const ck = (k - 1) / 2.6;
            if (ck > 0 && ck < 1) {
                const cols = S.pal.accent || ['#ff6b8b', '#ffd447', '#7fc8f8', '#9df29d'];
                for (let i = 0; i < 26; i++) {
                    const a = -1.2 + (advHash(i, 4) - 0.5) * 1.4;
                    const v = 40 + advHash(i, 5) * 30;
                    const x = 10 + Math.cos(a) * v * advEaseOut(ck);
                    const y = hy - 4 + Math.sin(a) * v * advEaseOut(ck) + ck * ck * 40;
                    ctx.globalAlpha = 1 - advSmooth((ck - 0.7) / 0.3);
                    if (i % 5 === 0) {
                        ctx.beginPath();
                        ctx.moveTo(10, hy - 4);
                        ctx.quadraticCurveTo((10 + x) / 2 + 6, (hy + y) / 2 - 8, x, y);
                        ctx.strokeStyle = cols[i % cols.length]; ctx.lineWidth = 1; ctx.stroke();
                    } else advA.confetti(ctx, x, y, 1.6, i + ck * 10, cols[i % cols.length]);
                }
                ctx.globalAlpha = 1;
                if (ck < 0.3) advA.speech(ctx, 24, -S.hh * 0.45, 'POP!', 9);
            }
        }
    },

    midnightClock: {
        caption: (p, S) => `Happy New Year${S ? ', ' + (S.month === 12 ? S.year + 1 : S.year) : ''}!`,
        draw(ctx, S) {
            advT.night(ctx, S, S.seed);
            const k = S.age % 8;
            const spin = advEaseInOutQuad(advClamp(k / 2.5, 0, 1));
            const cy = -2;
            const r = 26;
            const ring = k > 2.5 && k < 3.6 ? Math.sin(k * 60) * 0.06 : 0;
            ctx.save();
            ctx.translate(0, cy);
            ctx.rotate(ring);
            for (const side of [-1, 1]) {
                advA.circle(ctx, side * 18, -r + 1, 7, '#ffd447'); advA.ink(ctx, 1);
            }
            advA.circle(ctx, 0, 0, r, '#ffffff'); advA.ink(ctx, 2, '#8a6a4a', 0.9);
            for (let i = 0; i < 12; i++) {
                const a = (i / 12) * advTAU;
                advA.circle(ctx, Math.sin(a) * r * 0.82, -Math.cos(a) * r * 0.82, i % 3 ? 0.9 : 1.8, '#8a6a4a');
            }
            advA.face(ctx, 0, 8, 10, { blink: advA.blink(S.t, 7), eyes: k > 2.6 ? 'happy' : undefined, mouth: k > 2.6 ? 'open' : 'smile' });
            const mAng = advLerp(-advTAU * 0.25, advTAU * 2, spin);
            const hAng = advLerp(-advTAU / 24, 0, spin);
            advA.line(ctx, 0, 0, Math.sin(hAng) * r * 0.5, -Math.cos(hAng) * r * 0.5, '#3b2a2a', 2.4);
            advA.line(ctx, 0, 0, Math.sin(mAng) * r * 0.75, -Math.cos(mAng) * r * 0.75, '#3b2a2a', 1.6);
            advA.circle(ctx, 0, 0, 1.8, '#e8384f');
            ctx.restore();
            advT.confettiBurst(ctx, 0, cy - r, (k - 2.6) / 3, 30, S.seed, ['#ffd447', '#ff6b8b', '#7fc8f8', '#9df29d', '#ffffff'], 50);
            if (k > 2.8 && k < 7) {
                ctx.font = `800 12px ${ADVENT_FONT_ROUND}`;
                ctx.fillStyle = '#ffd447'; ctx.textAlign = 'center';
                ctx.globalAlpha = advSmooth((k - 2.8) / 0.4) * (1 - advSmooth((k - 6.4) / 0.6));
                const yr = S.month === 12 ? S.year + 1 : S.year;
                ctx.fillText(String(yr), 0, S.hh * 0.75);
                ctx.globalAlpha = 1;
            }
        }
    },

    starCatch: {
        caption: (p) => `${advA.critterName(p.c)} catches a falling star`,
        draw(ctx, S) {
            advT.night(ctx, S, S.seed);
            const gy = S.hh * 0.66;
            advA.ground(ctx, S, gy, '#2f4a6a', 3);
            const k = S.age % 7;
            const s = 10;
            const cx = 8;
            const hy = advT.headOn(gy, s);
            const jarY = hy + 8;
            const fall = advClamp((k - 0.5) / 1.6, 0, 1);
            const caught = k > 2.1;
            advA.critter(ctx, S.p.c || 'mouse', cx - 12, hy, s, { t: S.t, arms: 'up', lookY: caught ? 0 : -1, lookX: 1, eyes: caught && k < 4 ? 'happy' : undefined, hat: S.p.hat });
            const jx = cx + 4, jy = hy - 14;
            ctx.save();
            advA.rr(ctx, jx - 8, jy - 8, 16, 18, 4);
            ctx.fillStyle = 'rgba(200,230,255,0.25)'; ctx.fill(); advA.ink(ctx, 1.1, '#bfe0ff', 0.9);
            ctx.fillStyle = '#c9934f'; ctx.fillRect(jx - 7, jy - 11, 14, 3);
            ctx.restore();
            if (!caught && fall > 0) {
                const sx = advLerp(S.hw * 0.9, jx, fall), sy = advLerp(-S.hh * 0.95, jy, fall);
                for (let i = 0; i < 8; i++) {
                    ctx.globalAlpha = 1 - i / 8;
                    advA.circle(ctx, sx + i * 3, sy - i * 3.2, 2 - i * 0.2, '#fff3a0');
                }
                ctx.globalAlpha = 1;
                advA.star(ctx, sx, sy, 5, '#ffd447', S.t * 4);
            }
            if (caught) {
                const glow = 0.6 + 0.4 * Math.sin(S.t * 3);
                const g = ctx.createRadialGradient(jx, jy, 1, jx, jy, 24);
                g.addColorStop(0, `rgba(255,236,140,${0.6 * glow})`);
                g.addColorStop(1, 'rgba(255,236,140,0)');
                ctx.fillStyle = g; ctx.fillRect(jx - 24, jy - 24, 48, 48);
                advA.star(ctx, jx, jy + 1, 5, '#ffd447', -Math.PI / 2, true, S.t);
            }
        }
    },

    fireflyJar: {
        caption: () => 'A jar full of fireflies',
        draw(ctx, S) {
            advT.night(ctx, S, S.seed);
            const gy = S.hh * 0.62;
            advT.grass(ctx, S, gy, '#2f5a3a');
            const k = S.age % 9;
            const out = advSmooth((k - 1.5) / 1.5) * (1 - advSmooth((k - 7) / 1.5));
            const jx = 0, jy = gy - 14;
            for (let i = 0; i < 7; i++) {
                const ix = jx + Math.sin(S.t * 2 + i * 2) * 6, iy = jy + Math.cos(S.t * 1.7 + i) * 6;
                const ox = Math.sin(S.t * 0.6 + i * 1.3) * S.hw * 0.8, oy = -S.hh * 0.35 + Math.cos(S.t * 0.8 + i * 2) * S.hh * 0.35;
                advT.firefly(ctx, advLerp(ix, ox, out), advLerp(iy, oy, out), 1.4, S.t, i);
            }
            advA.rr(ctx, jx - 12, jy - 14, 24, 28, 7);
            ctx.fillStyle = 'rgba(200,240,255,0.15)'; ctx.fill(); advA.ink(ctx, 1.2, '#bfe0ff', 0.9);
            ctx.save();
            ctx.translate(jx + 12 * out, jy - 16 - out * 6);
            ctx.rotate(out * 0.7);
            advA.rr(ctx, -10, -3, 20, 5, 2); ctx.fillStyle = '#c9934f'; ctx.fill(); advA.ink(ctx, 0.8);
            ctx.restore();
            advA.critter(ctx, S.p.c || 'frog', -S.hw * 0.55, advT.headOn(gy, 8), 8, { t: S.t, lookX: 1, lookY: -out, mouth: 'grin', eyes: out > 0.9 ? 'happy' : undefined });
        }
    },

    stockings: {
        caption: () => 'Stockings hung with care',
        draw(ctx, S) {
            advA.sky(ctx, S, '#7a2f3a', '#5a2030');
            // Wallpaper stripes
            ctx.globalAlpha = 0.12;
            for (let x = -S.hw; x < S.hw; x += 10) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x, -S.hh, 4, S.hh * 2); }
            ctx.globalAlpha = 1;
            const my = -S.hh * 0.45;
            // Fireplace
            advA.rr(ctx, -S.hw * 0.8, my + 4, S.hw * 1.6, S.hh * 2, 2);
            ctx.fillStyle = '#c9714f'; ctx.fill();
            ctx.fillStyle = '#2a1a1a';
            advA.rr(ctx, -S.hw * 0.45, S.hh * 0.2, S.hw * 0.9, S.hh, 8); ctx.fill();
            advA.flame(ctx, -6, S.hh * 0.85, 12, S.t, 1);
            advA.flame(ctx, 6, S.hh * 0.85, 10, S.t, 2);
            advA.flame(ctx, 0, S.hh * 0.85, 15, S.t, 3);
            advA.rr(ctx, -S.hw * 0.95, my - 2, S.hw * 1.9, 7, 2);
            ctx.fillStyle = '#f3e3cf'; ctx.fill(); advA.ink(ctx, 1);
            const cols = S.pal.accent || ['#e8384f', '#3f8f5a', '#ffd447'];
            for (let i = 0; i < 3; i++) {
                const x = (i - 1) * S.hw * 0.55;
                const sw = Math.sin(S.t * 1.6 + i * 1.2) * 0.12;
                ctx.save();
                ctx.translate(x, my + 4);
                ctx.rotate(sw);
                if (i === 1) {
                    const bob = Math.abs(Math.sin(S.age * 2)) * 4;
                    advA.candyCane(ctx, 4, -2 - bob, 14, 0.2);
                }
                ctx.beginPath();
                ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.lineTo(5, 18); ctx.quadraticCurveTo(14, 18, 14, 24); ctx.quadraticCurveTo(14, 29, 4, 29); ctx.lineTo(-2, 29); ctx.quadraticCurveTo(-5, 29, -5, 24);
                ctx.closePath();
                ctx.fillStyle = cols[i % cols.length]; ctx.fill(); advA.ink(ctx, 1);
                advA.rr(ctx, -6.5, -1, 13, 6, 2); ctx.fillStyle = '#ffffff'; ctx.fill(); advA.ink(ctx, 0.8, '#c0b0b0');
                ctx.restore();
            }
        }
    },

    treeLights: {
        caption: () => 'O Christmas tree!',
        draw(ctx, S) {
            advA.sky(ctx, S, '#2a3a6a', '#4a5a9a');
            advT.flakes(ctx, S, 10, S.seed, 6);
            const gy = S.hh * 0.72;
            advT.snowGround(ctx, S, gy);
            advA.pine(ctx, 0, gy, 70, '#3f8f5a');
            const cols = ['#ff5d6c', '#ffd447', '#7fc8f8', '#9df29d', '#ff9ad5'];
            for (let row = 0; row < 3; row++) {
                const ty = gy - 18 - row * 17;
                const tw = 22 - row * 6;
                for (let i = 0; i < 5 - row; i++) {
                    const u = (i + 0.5) / (5 - row);
                    const x = -tw + u * tw * 2;
                    const y = ty - Math.sin(u * Math.PI) * 4;
                    const on = Math.floor(S.t * 3 + i + row * 2) % 3 !== 0;
                    if (on) {
                        const g = ctx.createRadialGradient(x, y, 0, x, y, 6);
                        g.addColorStop(0, advRgba(cols[(i + row) % 5], 0.7));
                        g.addColorStop(1, advRgba(cols[(i + row) % 5], 0));
                        ctx.fillStyle = g; ctx.fillRect(x - 6, y - 6, 12, 12);
                    }
                    advA.circle(ctx, x, y, 2, on ? cols[(i + row) % 5] : advDarken(cols[(i + row) % 5], 0.4));
                }
            }
            const glow = 0.7 + 0.3 * Math.sin(S.t * 3);
            const g = ctx.createRadialGradient(0, gy - 70, 1, 0, gy - 70, 18);
            g.addColorStop(0, `rgba(255,236,140,${0.7 * glow})`);
            g.addColorStop(1, 'rgba(255,236,140,0)');
            ctx.fillStyle = g; ctx.fillRect(-18, gy - 88, 36, 36);
            advA.star(ctx, 0, gy - 70, 8, '#ffd447', -Math.PI / 2 + Math.sin(S.t) * 0.1, true, S.t);
            advA.gift(ctx, -16, gy + 2, 12, 9, '#e8384f', '#ffd447');
            advA.gift(ctx, 15, gy + 2, 10, 8, '#7fc8f8', '#ffffff');
        }
    },

    gingerDance: {
        caption: () => 'The gingerbread jig',
        draw(ctx, S) {
            advA.sky(ctx, S, '#ffe9d1', '#ffd3a8');
            const gy = S.hh * 0.68;
            advA.rr(ctx, -S.hw - 2, gy, S.hw * 2 + 4, S.hh, 0);
            ctx.fillStyle = '#d8eef8'; ctx.fill();
            for (let i = -4; i <= 4; i++) advA.line(ctx, i * 12, gy, i * 12 - 4, S.hh, '#c4dce8', 1);
            const beat = S.t * 4;
            const kick = Math.sin(beat);
            const bounce = Math.abs(Math.sin(beat)) * 4;
            advA.critter(ctx, 'ginger', 0, gy - 42 - bounce, 13, { t: S.t, kick, wave: Math.sin(beat + 1) * 0.5 + 0.5, hat: S.p.hat });
            for (let i = 0; i < 3; i++) {
                const k = ((S.t * 0.5 + i / 3) % 1);
                ctx.globalAlpha = advPulse(k, 0, 1);
                ctx.font = `700 ${8 + i}px ${ADVENT_FONT_ROUND}`;
                ctx.fillStyle = '#7a4a22';
                ctx.fillText(i % 2 ? '♫' : '♪', (i - 1) * 22 + Math.sin(k * 6) * 4, -S.hh * 0.3 - k * 20);
            }
            ctx.globalAlpha = 1;
            for (let i = 0; i < 5; i++) advA.circle(ctx, -20 + advHash(i, 3) * 40, gy + 3 + advHash(i, 5) * 5, 1, '#c98648');
        }
    },

    rudolph: {
        caption: () => 'Rudolph\'s nose is glowing',
        draw(ctx, S) {
            advT.night(ctx, S, S.seed);
            advT.flakes(ctx, S, 12, S.seed, 8);
            const glow = 0.5 + 0.5 * Math.sin(S.t * 3);
            advA.critter(ctx, 'reindeer', 0, 2, 22, { t: S.t, body: false, noseGlow: glow, nose: advMix('#a8283a', '#ff3b4f', glow), scarf: '#3f8f5a' });
            if (glow > 0.9) advA.sparkle(ctx, 8, 2, 4, '#ffffff');
        }
    },

    penguinSlide: {
        caption: () => 'Wheee! Belly slide!',
        draw(ctx, S) {
            advA.sky(ctx, S, '#bfe6ff', '#eaf8ff');
            const gy = S.hh * 0.5;
            ctx.fillStyle = '#eef7ff'; ctx.fillRect(-S.hw - 1, gy, S.hw * 2 + 2, S.hh);
            advA.line(ctx, -S.hw, gy, S.hw, gy, '#bcd8ee', 1.2);
            const hole = S.hw * 0.55;
            advA.ellipse(ctx, hole, gy + 10, 14, 4, '#4f9fd8');
            const k = S.age % 6;
            const x = advLerp(-S.hw - 20, hole, advClamp(k / 2.2, 0, 1));
            if (k < 2.2) {
                ctx.save(); ctx.translate(x, gy + 2); ctx.rotate(-Math.PI / 2 + 0.15);
                advA.critter(ctx, 'penguin', 0, 0, 8, { t: S.t, arms: 'up', eyes: 'happy', mouth: 'open', hat: S.p.hat, scarf: S.p.scarf });
                ctx.restore();
                for (let i = 1; i < 5; i++) advA.circle(ctx, x - 14 - i * 5, gy + 6 + Math.sin(i) * 1, 1.4 - i * 0.2, '#ffffff');
            } else {
                const sk = (k - 2.2) / 0.9;
                if (sk < 1) {
                    for (let i = 0; i < 8; i++) {
                        const a = -Math.PI / 2 + (i - 3.5) * 0.3;
                        advA.drop(ctx, hole + Math.cos(a) * sk * 18, gy + 8 + Math.sin(a) * sk * 18 + sk * sk * 14, 1.5, '#7fc8f8');
                    }
                }
                const pop = advEaseOutBack((k - 3.4) / 0.6) * (1 - advSmooth((k - 5.4) / 0.5));
                if (pop > 0) {
                    ctx.save();
                    ctx.beginPath(); ctx.rect(-S.hw, -S.hh, S.hw * 2, gy + 10 + S.hh); ctx.clip();
                    advA.critter(ctx, 'penguin', hole, gy + 18 - pop * 16, 8, { t: S.t, body: false, eyes: 'happy', hat: S.p.hat });
                    ctx.restore();
                }
            }
        }
    },

    yarnKitten: {
        caption: () => 'Kitten vs. the yarn ball',
        draw(ctx, S) {
            advA.sky(ctx, S, '#fff1dc', '#ffe0c0');
            const gy = S.hh * 0.62;
            advA.rr(ctx, -S.hw - 2, gy, S.hw * 2 + 4, S.hh, 0);
            ctx.fillStyle = '#d9a873'; ctx.fill();
            for (let i = -5; i <= 5; i++) advA.line(ctx, -S.hw, gy + 6 + i * 6, S.hw, gy + 6 + i * 6, '#c9935e', 0.6);
            const k = S.age % 6;
            const bx = Math.sin(k / 6 * advTAU) * S.hw * 0.45;
            const roll = bx / 8;
            ctx.beginPath();
            ctx.moveTo(-S.hw, gy + 4);
            ctx.bezierCurveTo(-S.hw * 0.5, gy + 12, bx - 20, gy - 2, bx, gy - 1);
            ctx.strokeStyle = S.p.yarn || '#ff6b8b'; ctx.lineWidth = 1; ctx.stroke();
            ctx.save(); ctx.translate(bx, gy - 8); ctx.rotate(roll);
            advA.circle(ctx, 0, 0, 8, S.p.yarn || '#ff6b8b'); advA.ink(ctx, 1);
            for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(0, 0, 7, 3 + i, i * 0.8, 0, advTAU); ctx.strokeStyle = advDarken(S.p.yarn || '#ff6b8b', 0.2); ctx.lineWidth = 0.6; ctx.stroke(); }
            ctx.restore();
            const cx = bx - 22 * Math.sign(Math.cos(k / 6 * advTAU) || 1);
            const pounce = Math.abs(Math.sin(S.age * 3)) * 5;
            advA.critter(ctx, S.p.c || 'cat', cx, advT.headOn(gy, 9) - pounce, 9, { t: S.t, wave: 1, flip: Math.cos(k / 6 * advTAU) < 0, lookX: 1, color: S.p.color });
        }
    },

    catNap: {
        caption: () => 'Shh... kitty is napping',
        draw(ctx, S) {
            advA.sky(ctx, S, '#fff1dc', '#ffe3c4');
            const gy = S.hh * 0.45;
            advA.ellipse(ctx, 0, gy + 4, 36, 10, S.p.cushion || '#8fa8ff');
            advA.ink(ctx, 1);
            for (let i = 0; i < 4; i++) advA.circle(ctx, -24 + i * 16, gy + 4, 1.3, advLighten(S.p.cushion || '#8fa8ff', 0.4));
            const breathe = 1 + Math.sin(S.t * 1.5) * 0.03;
            const fur = S.p.color || '#f5a35c';
            ctx.save(); ctx.translate(0, gy - 4); ctx.scale(1, breathe);
            // Tail curled around with a flick at the tip
            ctx.beginPath();
            ctx.moveTo(18, 2);
            ctx.quadraticCurveTo(26, 12, 4, 10);
            ctx.quadraticCurveTo(-16, 10, -20 + Math.sin(S.t * 2) * 3, 4 + Math.sin(S.t * 2) * 2);
            ctx.strokeStyle = fur; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.stroke();
            advA.ellipse(ctx, 4, -2, 22, 12, fur); advA.ink(ctx, 1, advDarken(fur, 0.45));
            for (const dx of [-4, 4, 12]) advA.line(ctx, dx, -13, dx + 2, -6, advDarken(fur, 0.18), 2);
            ctx.restore();
            advA.critter(ctx, 'cat', -14, gy - 8, 9, { t: S.t, body: false, eyes: 'closed', blink: false, color: fur, mouth: 'cat', rot: -0.2 });
            advA.zzz(ctx, -4, -S.hh * 0.05, S.t, 8, '#7a6aa8');
            const k = S.age % 9;
            if (k > 3 && k < 8) {
                const mx = advLerp(S.hw + 10, -S.hw - 10, (k - 3) / 5);
                const tip = Math.abs(Math.sin(k * 8)) * 1.5;
                advA.critter(ctx, 'mouse', mx, S.hh * 0.62 - tip, 5, { t: S.t, wave: Math.abs(mx) < 10 ? 1 : 0, flip: true, eyes: Math.abs(mx) < 10 ? 'happy' : undefined });
            }
        }
    },

    teaTime: {
        caption: () => 'Time for tea',
        draw(ctx, S) {
            advT.windowSky(ctx, S);
            const gy = S.hh * 0.55;
            advA.rr(ctx, -S.hw - 2, gy, S.hw * 2 + 4, S.hh, 0);
            ctx.fillStyle = S.p.table || '#ffffff'; ctx.fill();
            ctx.save(); ctx.clip();
            for (let i = -6; i <= 6; i++) { ctx.fillStyle = 'rgba(255,120,150,0.25)'; ctx.fillRect(i * 10, gy, 5, S.hh); }
            ctx.restore();
            const k = S.age % 7;
            const tilt = advSmooth((k - 0.8) / 0.6) * (1 - advSmooth((k - 3.6) / 0.6));
            // Cup
            const cx = 16;
            ctx.beginPath(); ctx.moveTo(cx - 10, gy - 12); ctx.lineTo(cx + 10, gy - 12); ctx.quadraticCurveTo(cx + 9, gy, cx, gy); ctx.quadraticCurveTo(cx - 9, gy, cx - 10, gy - 12);
            ctx.fillStyle = '#ffffff'; ctx.fill(); advA.ink(ctx, 1);
            ctx.beginPath(); ctx.arc(cx + 11, gy - 7, 3, -1.4, 1.4); ctx.strokeStyle = '#c9b8b8'; ctx.lineWidth = 1.4; ctx.stroke();
            advA.ellipse(ctx, cx, gy - 12, 10, 2, k > 1.3 ? '#c98a4b' : '#f2e8e0');
            advA.heart(ctx, cx, gy - 6, 2.4, '#ff8fb8');
            // Pot
            ctx.save();
            ctx.translate(-14, gy - 14);
            ctx.rotate(tilt * 0.6);
            advA.ellipse(ctx, 0, 0, 14, 11, S.p.pot || '#8fd3ff'); advA.ink(ctx, 1);
            ctx.beginPath(); ctx.moveTo(12, -2); ctx.quadraticCurveTo(20, -4, 22, -10); ctx.lineTo(19, -10); ctx.quadraticCurveTo(17, -5, 11, 2);
            ctx.fillStyle = S.p.pot || '#8fd3ff'; ctx.fill(); advA.ink(ctx, 0.8);
            ctx.beginPath(); ctx.arc(-14, 0, 6, Math.PI / 2, Math.PI * 1.5); ctx.strokeStyle = S.p.pot || '#8fd3ff'; ctx.lineWidth = 2.5; ctx.stroke();
            advA.ellipse(ctx, 0, -11, 7, 2, advDarken(S.p.pot || '#8fd3ff', 0.15));
            advA.circle(ctx, 0, -14, 2, advDarken(S.p.pot || '#8fd3ff', 0.15));
            advA.face(ctx, -2, 1, 6, { blink: advA.blink(S.t, 1), eyes: tilt > 0.5 ? 'happy' : undefined, mouth: 'cat' });
            ctx.restore();
            if (tilt > 0.6) {
                ctx.beginPath();
                ctx.moveTo(-14 + 21, gy - 14 - 6);
                ctx.quadraticCurveTo(cx - 2, gy - 22, cx, gy - 12);
                ctx.strokeStyle = '#c98a4b'; ctx.lineWidth = 1.6; ctx.stroke();
            }
            for (let i = 0; i < 2; i++) advT.steam(ctx, cx - 3 + i * 6, gy - 14, ((S.t * 0.4 + i / 2) % 1), 14, 1.6);
            if (k > 4.2 && k < 5) {
                const sy = advLerp(-S.hh, gy - 14, advEaseIn((k - 4.2) / 0.5));
                ctx.fillStyle = '#ffffff'; ctx.fillRect(cx - 2.5, sy, 5, 5); advA.ink(ctx, 0.5);
            }
            if (k > 4.7 && k < 5.5) advA.speech(ctx, cx, gy - 26, 'plop!', 6);
        }
    },

    puddleSplash: {
        caption: (p) => `${advA.critterName(p.c)} loves puddles`,
        draw(ctx, S) {
            advA.sky(ctx, S, '#9fb4cf', '#d4deea');
            const gy = S.hh * 0.6;
            advT.grass(ctx, S, gy, '#7cb86a');
            advA.ellipse(ctx, 0, gy + 8, 30, 6, '#6fa8d8');
            for (let i = 0; i < 14; i++) {
                const x = (advHash(S.seed, i) * 2 - 1) * S.hw;
                const y = -S.hh + ((advHash(S.seed, i + 5) * S.hh * 2 + S.t * 60) % (S.hh * 2));
                advA.line(ctx, x, y, x - 1, y + 4, 'rgba(120,160,210,0.8)', 1);
            }
            const k = S.age % 4;
            const hop = Math.sin(advClamp(k / 1.2, 0, 1) * Math.PI);
            const s = 9;
            advA.critter(ctx, S.p.c || 'duck', 0, advT.headOn(gy + 8, s) - hop * 18, s, { t: S.t, arms: hop > 0.2 ? 'up' : 'down', eyes: k > 1.2 && k < 2.4 ? 'happy' : undefined, mouth: 'open', hat: S.p.hat || 'sunhat', hatColor: '#ffd447' });
            const sk = (k - 1.2) / 1;
            if (sk > 0 && sk < 1) {
                for (let i = 0; i < 10; i++) {
                    const a = -Math.PI / 2 + (i - 4.5) * 0.3;
                    advA.drop(ctx, Math.cos(a) * 24 * sk, gy + 6 + Math.sin(a) * 22 * sk + sk * sk * 22, 1.6, '#8fc4ef');
                }
                for (let r = 0; r < 2; r++) {
                    ctx.beginPath(); ctx.ellipse(0, gy + 8, 10 + sk * 22 + r * 6, 2 + sk * 4, 0, 0, advTAU);
                    ctx.strokeStyle = `rgba(255,255,255,${(1 - sk) * 0.7})`; ctx.lineWidth = 1; ctx.stroke();
                }
            }
        }
    },

    appleBonk: {
        caption: () => 'Hedgie catches an apple. Boing!',
        draw(ctx, S) {
            advT.windowSky(ctx, S);
            const gy = S.hh * 0.66;
            advT.grass(ctx, S, gy, '#86c46a');
            // Branch
            ctx.beginPath(); ctx.moveTo(-S.hw - 4, -S.hh * 0.8); ctx.quadraticCurveTo(-S.hw * 0.2, -S.hh * 0.7, S.hw * 0.4, -S.hh * 0.85);
            ctx.strokeStyle = '#7a5236'; ctx.lineWidth = 4; ctx.stroke();
            for (let i = 0; i < 5; i++) advA.leaf(ctx, -S.hw * 0.8 + i * S.hw * 0.3, -S.hh * 0.75 + (i % 2) * 4, 12, i * 1.3, '#5cbf60');
            const k = S.age % 7;
            const s = 11;
            const hy = advT.headOn(gy, s);
            const fallStart = 1;
            const ay = k < fallStart ? -S.hh * 0.68 : k < 2 ? advLerp(-S.hh * 0.68, hy - s * 1.3, advEaseIn(k - fallStart)) : hy - s * 1.3 - (k < 2.4 ? Math.sin((k - 2) / 0.4 * Math.PI) * 6 : 0);
            const hit = k > 2 && k < 2.5;
            advA.critter(ctx, 'hedgehog', 0, hy + (hit ? 2 : 0), s, { t: S.t, squash: hit ? 1.15 : 1, eyes: k > 2 && k < 3 ? 'x' : k >= 3 ? 'happy' : undefined, mouth: k > 2 && k < 3 ? 'o' : 'smile', lookY: k < 2 ? -1 : 0 });
            if (k < 6.5) advA.apple(ctx, Math.sin(Math.min(k, 1) * 2) * 2, ay + (k > 2 ? 2 : 0), 6, '#e8434f');
            if (k > 2 && k < 2.8) advA.speech(ctx, 22, hy - 16, 'boing!', 7, { tail: -1 });
            if (k >= 3 && k < 6) advA.heart(ctx, 16, hy - 6 - (k - 3) * 6, 2.5, '#ff6b8b');
        }
    },

    bookOwl: {
        caption: () => 'Owl\'s bedtime story',
        draw(ctx, S) {
            advT.night(ctx, S, S.seed);
            advA.moon(ctx, S.hw * 0.6, -S.hh * 0.55, 9, S.t, {});
            const gy = S.hh * 0.62;
            ctx.beginPath(); ctx.moveTo(-S.hw, gy); ctx.quadraticCurveTo(0, gy - 4, S.hw, gy + 2);
            ctx.strokeStyle = '#7a5236'; ctx.lineWidth = 5; ctx.stroke();
            const s = 13;
            const hy = advT.headOn(gy, s) + 2;
            advA.critter(ctx, 'owl', 0, hy, s, { t: S.t, arms: 'hug', lookY: 0.6, eyes: Math.sin(S.t * 0.5) > 0.85 ? 'closed' : undefined });
            // Glasses
            for (const side of [-1, 1]) { advA.circle(ctx, side * s * 0.42, hy, s * 0.3); ctx.strokeStyle = '#3b2a2a'; ctx.lineWidth = 1; ctx.stroke(); }
            advA.line(ctx, -s * 0.12, hy, s * 0.12, hy, '#3b2a2a', 1);
            // Book with a flipping page
            const by = hy + s * 1.05;
            ctx.beginPath(); ctx.moveTo(0, by); ctx.lineTo(-14, by - 3); ctx.lineTo(-14, by + 8); ctx.lineTo(0, by + 11); ctx.lineTo(14, by + 8); ctx.lineTo(14, by - 3); ctx.closePath();
            ctx.fillStyle = '#e8384f'; ctx.fill(); advA.ink(ctx, 0.8);
            ctx.beginPath(); ctx.moveTo(0, by - 1); ctx.lineTo(-12, by - 4); ctx.lineTo(-12, by + 6); ctx.lineTo(0, by + 9); ctx.lineTo(12, by + 6); ctx.lineTo(12, by - 4); ctx.closePath();
            ctx.fillStyle = '#fffaf0'; ctx.fill();
            const flip = (S.t * 0.4) % 1;
            if (flip < 0.3) {
                const fx = Math.cos(flip / 0.3 * Math.PI) * 12;
                ctx.beginPath(); ctx.moveTo(0, by - 1); ctx.lineTo(fx, by - 4 - Math.sin(flip / 0.3 * Math.PI) * 4); ctx.lineTo(fx, by + 6 - Math.sin(flip / 0.3 * Math.PI) * 4); ctx.lineTo(0, by + 9); ctx.closePath();
                ctx.fillStyle = '#f2ead8'; ctx.fill(); advA.ink(ctx, 0.5);
            }
        }
    },

    scarecrow: {
        caption: () => 'Scarecrow makes a friend',
        draw(ctx, S) {
            advT.windowSky(ctx, S);
            const gy = S.hh * 0.66;
            advT.grass(ctx, S, gy, '#c9b35a');
            for (let i = -2; i <= 2; i++) advA.line(ctx, i * 14, gy, i * 14 + 2, gy - 14, '#d9a84a', 1.5);
            const sway = Math.sin(S.t * 1.2) * 0.06;
            ctx.save();
            ctx.translate(0, gy);
            ctx.rotate(sway);
            advA.line(ctx, 0, 0, 0, -48, '#7a5236', 2.4);
            const wave = Math.sin(S.t * 2) * 0.15;
            advA.line(ctx, -22, -32 + wave * 10, 22, -32 - wave * 10, '#7a5236', 2);
            advA.rr(ctx, -9, -36, 18, 20, 3); ctx.fillStyle = '#5a8ac8'; ctx.fill(); advA.ink(ctx, 0.8);
            ctx.fillStyle = '#e8b04a'; ctx.fillRect(-4, -30, 6, 6);
            for (const side of [-1, 1]) for (let i = 0; i < 3; i++) advA.line(ctx, side * 22, -32 - side * wave * 10, side * (25 + i), -30 + i * 2 - side * wave * 10, '#e8c25a', 1);
            advA.circle(ctx, 0, -44, 9, '#f3d9a8'); advA.ink(ctx, 0.8);
            advA.face(ctx, 0, -44, 7, { blink: advA.blink(S.t, 2), mouth: 'grin', blushColor: '#ff8a6a' });
            ctx.save(); ctx.translate(0, -44);
            advA.hat(ctx, 'sunhat', 9, S.t, '#c9934f');
            ctx.restore();
            // Crow hops on and off the hat
            const k = S.age % 8;
            const on = advSmooth((k - 1) / 0.8) * (1 - advSmooth((k - 6) / 0.8));
            const crX = advLerp(S.hw + 10, 3, on);
            const crY = advLerp(-S.hh * 0.6 - gy, -60, on) - Math.abs(Math.sin(S.t * 3)) * (on > 0.95 ? 2 : 0);
            ctx.save(); ctx.translate(crX, crY);
            advA.ellipse(ctx, 0, 0, 6, 4.5, '#3b3546');
            advA.ellipse(ctx, 2, -2 - (on < 0.95 ? Math.abs(Math.sin(S.t * 12)) * 4 : 0), 5, 2.4, '#2d2a35', 0.4);
            advA.circle(ctx, -4, -3, 3.4, '#3b3546');
            advA.circle(ctx, -5, -3.5, 0.9, '#ffffff');
            ctx.beginPath(); ctx.moveTo(-7, -3); ctx.lineTo(-10, -2); ctx.lineTo(-7, -1.5); ctx.fillStyle = '#ffb347'; ctx.fill();
            ctx.restore();
            ctx.restore();
        }
    },

    parade: {
        caption: (p) => p.label || 'The little parade',
        draw(ctx, S) {
            const p = S.p;
            advT.windowSky(ctx, S);
            const gy = S.hh * 0.62;
            if (p.snow) advT.snowGround(ctx, S, gy); else advT.grass(ctx, S, gy, p.grass || '#86c46a');
            const cast = p.cast || ['penguin', 'penguin', 'penguin', 'penguin'];
            const span = S.hw * 2 + 30 * cast.length;
            cast.forEach((c, i) => {
                const x = ((S.age * 12 + (cast.length - i) * 24) % span) - S.hw - 15;
                const step = Math.abs(Math.sin(S.age * 6 + i)) * 2;
                const s = i === 0 ? 8 : 7;
                advA.critter(ctx, c, x, advT.headOn(gy, s) - step, s, {
                    t: S.t + i, rot: Math.sin(S.age * 6 + i) * 0.08, hat: p.hats ? p.hats[i % p.hats.length] : undefined, scarf: p.scarves ? p.scarves[i % p.scarves.length] : undefined,
                    arms: i === 0 && p.flag ? 'down' : 'down', wave: i === 0 ? 0.8 : 0,
                    hold: i === 0 && p.flag ? (c2, s2) => { advA.line(c2, 0, 0, 0, -s2 * 1.8, '#7a5236', s2 * 0.08); c2.fillStyle = p.flag; c2.fillRect(0, -s2 * 1.8, s2 * 0.9, s2 * 0.6); } : null
                });
            });
        }
    },

    bubbles: {
        caption: (p) => `${advA.critterName(p.c)} blows bubbles`,
        draw(ctx, S) {
            advT.windowSky(ctx, S);
            const gy = S.hh * 0.66;
            advT.grass(ctx, S, gy, S.p.grass || '#86c46a');
            const s = 10;
            const hx = -S.hw * 0.45, hy = advT.headOn(gy, s);
            advA.critter(ctx, S.p.c || 'pig', hx, hy, s, { t: S.t, mouth: 'o', wave: 0.6, lookX: 1, hat: S.p.hat });
            advA.circle(ctx, hx + 14, hy + 2, 3); ctx.strokeStyle = '#8a7ab8'; ctx.lineWidth = 0.9; ctx.stroke();
            for (let i = 0; i < 7; i++) {
                const k = ((S.age * 0.22 + i / 7) % 1);
                const bx = hx + 16 + k * S.hw * 1.3 + Math.sin(k * 8 + i) * 6;
                const by = hy - k * S.hh * 1.2 + Math.cos(k * 6 + i) * 4;
                const r = 2 + advHash(i, 3) * 4 + k * 2;
                if (k > 0.92) {
                    for (let j = 0; j < 5; j++) { const a = j * 1.26; advA.line(ctx, bx + Math.cos(a) * r, by + Math.sin(a) * r, bx + Math.cos(a) * (r + 2), by + Math.sin(a) * (r + 2), 'rgba(255,255,255,0.8)', 0.7); }
                    continue;
                }
                const g = ctx.createRadialGradient(bx - r * 0.3, by - r * 0.3, 0, bx, by, r);
                g.addColorStop(0, 'rgba(255,255,255,0.1)');
                g.addColorStop(0.8, `hsla(${(i * 50 + S.t * 40) % 360},90%,75%,0.35)`);
                g.addColorStop(1, 'rgba(255,255,255,0.7)');
                advA.circle(ctx, bx, by, r, g);
                advA.circle(ctx, bx - r * 0.35, by - r * 0.35, r * 0.2, 'rgba(255,255,255,0.9)');
            }
        }
    },

    sunrise: {
        caption: () => 'Good morning, sunshine!',
        draw(ctx, S) {
            const k = (S.age % 9) / 9;
            const up = advSmooth(k / 0.35) * (1 - advSmooth((k - 0.88) / 0.12));
            advA.sky(ctx, S, advMix('#4a5a9a', '#8fd3ff', up), advMix('#ff9a76', '#fff1c4', up));
            advA.sun(ctx, 0, advLerp(S.hh * 0.7, -S.hh * 0.25, up), 12, S.t, true);
            advA.hill(ctx, S, -S.hw * 0.5, S.hh * 0.55, S.hw * 0.9, 16, '#6cc46a');
            advA.hill(ctx, S, S.hw * 0.6, S.hh * 0.62, S.hw * 0.9, 12, '#5cb85c');
            for (let i = 0; i < 2; i++) {
                const bx = -S.hw + ((S.t * 10 + i * 40) % (S.hw * 2));
                const by = -S.hh * 0.6 + i * 10;
                const f = Math.sin(S.t * 8 + i) * 3;
                ctx.beginPath(); ctx.moveTo(bx - 4, by - f); ctx.quadraticCurveTo(bx - 2, by - 2, bx, by); ctx.quadraticCurveTo(bx + 2, by - 2, bx + 4, by - f);
                ctx.strokeStyle = advA.INK; ctx.lineWidth = 1; ctx.stroke();
            }
            for (let i = 0; i < 4; i++) {
                const fx = -S.hw * 0.7 + i * S.hw * 0.45;
                const open = advSmooth((up - 0.5) * 3);
                advA.line(ctx, fx, S.hh * 0.75, fx, S.hh * 0.6, '#4caf50', 1.2);
                if (open > 0.05) advA.flower(ctx, fx, S.hh * 0.58, 4 * open, ['#ff8fb8', '#ffd447', '#ffffff', '#c99bff'][i], '#ffb347');
                else advA.ellipse(ctx, fx, S.hh * 0.58, 1.5, 2.5, '#6fcf6f');
            }
        }
    },

    mushroomHouse: {
        caption: () => 'Someone lives in this mushroom',
        draw(ctx, S) {
            advT.night(ctx, S, S.seed);
            const gy = S.hh * 0.66;
            advT.grass(ctx, S, gy, '#3f6a4a');
            const r = 26;
            advA.rr(ctx, -12, gy - 26, 24, 26, 8);
            ctx.fillStyle = '#fff3dc'; ctx.fill(); advA.ink(ctx, 1);
            advA.rr(ctx, -5, gy - 14, 10, 14, 5); ctx.fillStyle = '#9a6a4a'; ctx.fill(); advA.ink(ctx, 0.8);
            advA.circle(ctx, 3, gy - 7, 0.9, '#ffd447');
            const lit = 0.75 + 0.25 * Math.sin(S.t * 2);
            advA.circle(ctx, 0, gy - 21, 3.5, advMix('#7a6a4a', '#ffe38a', lit));
            ctx.beginPath(); ctx.ellipse(0, gy - 24, r, r * 0.75, 0, Math.PI, 0); ctx.closePath();
            ctx.fillStyle = S.p.cap || '#e8505b'; ctx.fill(); advA.ink(ctx, 1);
            for (const [dx, dy, rr] of [[-14, -30, 4], [2, -40, 5], [15, -31, 3.5], [-4, -28, 2.5]]) advA.circle(ctx, dx, gy + dy, rr, '#ffffff');
            // Snail slides past
            const sx = S.hw + 10 - ((S.age * 5) % (S.hw * 2 + 20));
            advA.ellipse(ctx, sx, gy - 1, 7, 2, '#b8c48a');
            advA.circle(ctx, sx + 2, gy - 6, 5, '#c98a4b'); advA.ink(ctx, 0.7);
            ctx.beginPath(); ctx.arc(sx + 2, gy - 6, 2.5, 0, Math.PI * 1.6); ctx.strokeStyle = '#7a4a22'; ctx.lineWidth = 0.7; ctx.stroke();
            advA.line(ctx, sx - 5, gy - 2, sx - 7, gy - 7, '#b8c48a', 0.8);
            advA.circle(ctx, sx - 7, gy - 7, 0.9, advA.INK);
            for (let i = 0; i < 4; i++) advT.firefly(ctx, Math.sin(S.t * 0.5 + i * 2) * S.hw * 0.8, -S.hh * 0.4 + Math.cos(S.t * 0.6 + i) * 12, 1.1, S.t, i);
        }
    },

    snowballToss: {
        caption: (p) => `Snowball fight: ${advA.critterName(p.c)} vs ${advA.critterName(p.c2)}`,
        draw(ctx, S) {
            advT.windowSky(ctx, S);
            const gy = S.hh * 0.6;
            advT.snowGround(ctx, S, gy);
            const s = 9;
            const lx = -S.hw * 0.55, rx = S.hw * 0.55;
            const k = (S.age % 4) / 4;
            const toRight = Math.floor(S.age / 4) % 2 === 0;
            const u = advClamp(k / 0.6, 0, 1);
            const bx = toRight ? advLerp(lx + 10, rx - 6, u) : advLerp(rx - 10, lx + 6, u);
            const by = advT.headOn(gy, s) - Math.sin(u * Math.PI) * 22;
            const hitL = !toRight && k > 0.6 && k < 0.85;
            const hitR = toRight && k > 0.6 && k < 0.85;
            advA.critter(ctx, S.p.c || 'penguin', lx, advT.headOn(gy, s), s, { t: S.t, wave: toRight && k < 0.2 ? 1 : 0, eyes: hitL ? 'x' : undefined, mouth: hitL ? 'o' : 'smile', scarf: '#e8384f', hat: 'beanie' });
            advA.critter(ctx, S.p.c2 || 'bunny', rx, advT.headOn(gy, s), s, { t: S.t + 1, flip: true, wave: !toRight && k < 0.2 ? 1 : 0, eyes: hitR ? 'x' : undefined, mouth: hitR ? 'o' : 'smile', hat: 'earmuffs' });
            if (k < 0.62) { advA.circle(ctx, bx, by, 3.5, '#ffffff'); advA.ink(ctx, 0.8, '#a9bed8'); }
            else if (k < 0.9) {
                const pk = (k - 0.62) / 0.28;
                const hx = toRight ? rx : lx;
                for (let i = 0; i < 7; i++) { const a = i * 0.9; advA.circle(ctx, hx + Math.cos(a) * pk * 10, advT.headOn(gy, s) - 2 + Math.sin(a) * pk * 10, 1.4 * (1 - pk), '#ffffff'); }
            }
        }
    },

    sledding: {
        caption: (p) => `${advA.critterName(p.c)} goes sledding!`,
        draw(ctx, S) {
            advT.windowSky(ctx, S);
            advT.flakes(ctx, S, 8, S.seed, 6);
            ctx.beginPath();
            ctx.moveTo(-S.hw - 2, -S.hh * 0.2);
            ctx.quadraticCurveTo(0, S.hh * 0.1, S.hw + 2, S.hh * 0.55);
            ctx.lineTo(S.hw + 2, S.hh + 2); ctx.lineTo(-S.hw - 2, S.hh + 2); ctx.closePath();
            ctx.fillStyle = '#f4f8ff'; ctx.fill(); advA.ink(ctx, 1, '#a9bed8');
            advA.pine(ctx, -S.hw * 0.7, -S.hh * 0.12, 20, '#3f8f5a', true);
            const k = (S.age % 4) / 4;
            const u = advEaseIn(k) * 1.2 - 0.1;
            const x = advLerp(-S.hw - 10, S.hw + 20, u);
            const t2 = (x + S.hw) / (S.hw * 2);
            const y = advLerp(-S.hh * 0.2, S.hh * 0.55, t2 * t2 * 0.6 + t2 * 0.4) - 2;
            const ang = Math.atan2(S.hh * 0.75, S.hw * 2) * (0.6 + t2);
            ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
            advA.critter(ctx, S.p.c || 'bear', 0, -16, 7, { t: S.t, arms: 'up', eyes: 'happy', mouth: 'open', scarf: S.p.scarf || '#e8384f', hat: S.p.hat || 'beanie' });
            advA.rr(ctx, -12, -6, 24, 5, 2); ctx.fillStyle = '#e8384f'; ctx.fill(); advA.ink(ctx, 0.8);
            ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(10, 0); ctx.quadraticCurveTo(16, 0, 15, -6); ctx.strokeStyle = '#7a5236'; ctx.lineWidth = 1.4; ctx.stroke();
            ctx.restore();
            for (let i = 1; i < 6; i++) advA.circle(ctx, x - i * 6, y - 2 + i * 0.5, 1.3, 'rgba(255,255,255,0.9)');
        }
    },

    harvestBasket: {
        caption: () => 'A basket full of harvest',
        draw(ctx, S) {
            advT.windowSky(ctx, S);
            const gy = S.hh * 0.66;
            advT.grass(ctx, S, gy, '#b9a35a');
            const k = S.age % 8;
            const items = ['apple', 'pumpkin', 'corn', 'apple2', 'pear'];
            items.forEach((it, i) => {
                const t0 = 0.5 + i * 0.7;
                if (k < t0) return;
                const u = advClamp((k - t0) / 0.6, 0, 1);
                const x = advLerp(i % 2 ? S.hw + 10 : -S.hw - 10, -12 + i * 6, u);
                const y = advLerp(-S.hh * 0.6, gy - 20 - (i % 2) * 3, u) - Math.sin(u * Math.PI) * 14;
                ctx.globalAlpha = 1 - advSmooth((k - 7.3) / 0.6);
                if (it === 'pumpkin') advA.pumpkin(ctx, x, y, 7, { face: true, t: S.t });
                else if (it === 'corn') {
                    advA.ellipse(ctx, x, y, 3.5, 8, '#ffd447', 0.3); advA.ink(ctx, 0.6);
                    advA.leaf(ctx, x + 2, y + 5, 10, 0.7, '#8bc34a');
                } else if (it === 'pear') {
                    advA.circle(ctx, x, y + 2, 5, '#c9d94a'); advA.circle(ctx, x, y - 3, 3.4, '#c9d94a');
                } else advA.apple(ctx, x, y, 5, it === 'apple2' ? '#f2c94c' : '#e8434f');
            });
            ctx.globalAlpha = 1;
            ctx.beginPath(); ctx.moveTo(-24, gy - 18); ctx.lineTo(24, gy - 18); ctx.lineTo(18, gy + 2); ctx.lineTo(-18, gy + 2); ctx.closePath();
            ctx.fillStyle = '#c9934f'; ctx.fill(); advA.ink(ctx, 1);
            ctx.save(); ctx.clip();
            for (let i = 0; i < 4; i++) advA.line(ctx, -24, gy - 14 + i * 5, 24, gy - 14 + i * 5, '#a87536', 1.2);
            ctx.restore();
            ctx.beginPath(); ctx.arc(0, gy - 18, 20, Math.PI, 0); ctx.strokeStyle = '#a87536'; ctx.lineWidth = 2.4; ctx.stroke();
            advA.face(ctx, 0, gy - 8, 7, { blink: advA.blink(S.t, 2) });
        }
    },

    trickOrTreat: {
        caption: (p) => `${advA.critterName(p.c)} goes trick-or-treating`,
        draw(ctx, S) {
            advT.night(ctx, S, S.seed);
            const gy = S.hh * 0.66;
            advA.ground(ctx, S, gy, '#3a2f55', 2);
            // Door
            const dx = S.hw * 0.45;
            advA.rr(ctx, dx - 14, gy - 44, 28, 44, 3); ctx.fillStyle = '#7a4a6a'; ctx.fill(); advA.ink(ctx, 1);
            const k = S.age % 7;
            const open = advSmooth((k - 2) / 0.4) * (1 - advSmooth((k - 5) / 0.4));
            ctx.fillStyle = '#ffd98a';
            ctx.fillRect(dx - 12, gy - 42, 24 * open, 42);
            advA.rr(ctx, dx - 12 + 24 * open, gy - 42, 24 * (1 - open) + 0.01, 42, 2); ctx.fillStyle = '#9a5a7a'; ctx.fill();
            advA.pumpkin(ctx, dx + 20, gy - 6, 6, { face: 'jack', glow: 0.8 + 0.2 * Math.sin(S.t * 8) });
            const x = advLerp(-S.hw - 10, dx - 26, advSmooth(k / 1.8));
            const s = 10;
            advA.critter(ctx, S.p.c || 'bear', x, advT.headOn(gy, s), s, {
                t: S.t, hat: S.p.hat || 'witch', wave: k > 2.4 && k < 3.5 ? 1 : 0,
                eyes: k > 3.4 && k < 5 ? 'happy' : undefined, mouth: k > 2.4 && k < 3.4 ? 'open' : 'smile',
                hold: (c, ss) => advA.pumpkin(c, 0, ss * 0.2, ss * 0.45, { face: 'jack', glow: 0.3 })
            });
            if (k > 2.4 && k < 3.4) advA.speech(ctx, x, -S.hh * 0.35, 'trick or treat!', 6);
            if (k > 3.2 && k < 5) {
                const ck = (k - 3.2) / 1.8;
                for (let i = 0; i < 3; i++) advT.faller(ctx, 'candy', advLerp(dx - 6, x + 6, Math.min(ck * 2, 1)), advLerp(gy - 24, advT.headOn(gy, s) + 8, Math.min(ck * 2, 1)) - Math.sin(Math.min(ck * 2, 1) * Math.PI) * 10 + i * 3, 2, i, S.t, ['#ff6b8b', '#ffd447', '#9df29d'][i]);
            }
        }
    },

    candyRain: {
        caption: () => 'Candy corn shower!',
        draw(ctx, S) {
            advT.night(ctx, S, S.seed);
            for (let i = 0; i < 16; i++) {
                const span = S.hh * 2 + 20;
                const y = -S.hh - 10 + ((advHash(S.seed, i) * span + S.t * 14 * (0.6 + advHash(S.seed, i + 7))) % span);
                const x = (advHash(S.seed, i + 20) * 2 - 1) * S.hw;
                ctx.save(); ctx.translate(x, y); ctx.rotate(S.t + i);
                ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(4, 4); ctx.quadraticCurveTo(0, 6, -4, 4); ctx.closePath();
                ctx.fillStyle = '#ff9a3d'; ctx.fill();
                ctx.save(); ctx.clip();
                ctx.fillStyle = '#ffd447'; ctx.fillRect(-5, 1.5, 10, 5);
                ctx.fillStyle = '#ffffff'; ctx.fillRect(-5, -6, 10, 3.5);
                ctx.restore();
                ctx.restore();
            }
            const gy = S.hh * 0.66;
            advA.ground(ctx, S, gy, '#3a2f55', 2);
            advA.critter(ctx, S.p.c || 'monster', 0, advT.headOn(gy, 12), 12, { t: S.t, arms: 'up', mouth: 'open', lookY: -1, hat: S.p.hat });
        }
    },

    witchBrew: {
        caption: () => 'Witch\'s cat stirs the pot',
        draw(ctx, S) { ADVENT_TREATS.cauldron.draw(ctx, S); }
    },

    owlMoon: {
        caption: () => 'Who-whoo!',
        draw(ctx, S) {
            advT.night(ctx, S, S.seed);
            advA.moon(ctx, 0, -6, 30, S.t, {});
            const gy = S.hh * 0.62;
            ctx.beginPath(); ctx.moveTo(-S.hw, gy + 4); ctx.quadraticCurveTo(0, gy - 6, S.hw, gy);
            ctx.strokeStyle = '#3b2a2a'; ctx.lineWidth = 4; ctx.stroke();
            const k = S.age % 6;
            const turn = Math.sin(k * 1.2) * 0.25;
            advA.critter(ctx, 'owl', 0, advT.headOn(gy, 11) + 3, 11, { t: S.t, rot: turn * 0.3, lookX: Math.sin(k * 1.2) * 1.2, arms: 'down', mouth: k > 3 && k < 4.2 ? 'o' : 'smile' });
            if (k > 3 && k < 4.2) advA.speech(ctx, 22, -S.hh * 0.4, 'whoo!', 7, { tail: -1 });
        }
    }
});

function advEaseInOutQuad(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

// ===========================================================================
// Holidays
// ===========================================================================

const AdventHolidays = {
    // Lunar New Year moves with the moon, so it comes from a table
    LUNAR: {
        2024: [2, 10], 2025: [1, 29], 2026: [2, 17], 2027: [2, 6], 2028: [1, 26], 2029: [2, 13],
        2030: [2, 3], 2031: [1, 23], 2032: [2, 11], 2033: [1, 31], 2034: [2, 19], 2035: [2, 8],
        2036: [1, 28], 2037: [2, 15], 2038: [2, 4], 2039: [1, 24], 2040: [2, 12]
    },
    ZODIAC: ['Rat', 'Ox', 'Tiger', 'Rabbit', 'Dragon', 'Snake', 'Horse', 'Goat', 'Monkey', 'Rooster', 'Dog', 'Pig'],

    // key -> how the holiday shows up on the calendar. `size` is the star
    // door's footprint in grid cells; `theme` is the holiday theme it unlocks.
    INFO: {
        newyear:      { name: 'New Year\'s Day', emoji: '🎉', size: [2, 2], theme: 'midnight-confetti', star: ['fireworks', { c: 'penguin', hat: 'party', c2: 'cat', hat2: 'party' }], caption: 'Happy New Year!' },
        lunar:        { name: 'Lunar New Year', emoji: '🏮', size: [2, 2], theme: 'lantern-festival', star: ['dragonDance', {}] },
        valentine:    { name: 'Valentine\'s Day', emoji: '💝', size: [2, 2], theme: 'love-bugs', star: ['loveBugs', { c: 'bunny', c2: 'bear', hat: 'bow', hat2: 'flower' }], caption: 'Happy Valentine\'s Day!' },
        stpat:        { name: 'St. Patrick\'s Day', emoji: '☘️', size: [2, 2], theme: 'lucky-clover', star: ['potOfGold', {}], caption: 'Happy St. Patrick\'s Day!' },
        easter:       { name: 'Easter', emoji: '🐣', size: [2, 2], theme: 'egg-hunt', star: ['eggHatch', { baby: 'chick', egg: '#c9f2ff', accent: '#ff8fb8' }], caption: 'Happy Easter!' },
        july4:        { name: 'Fourth of July', emoji: '🎆', size: [2, 2], theme: 'firecracker-picnic', star: ['fireworks', { c: 'bear', hat: 'top', hatColor: '#3c5ab8', c2: 'bunny', hat2: 'bow', colors: ['#ff5d6c', '#ffffff', '#5b8cff', '#ff5d6c', '#9fc2ff'] }], caption: 'Happy Fourth of July!' },
        halloween:    { name: 'Halloween', emoji: '🎃', size: [2, 2], theme: 'haunted-hollow', star: ['trickOrTreat', { c: 'bear', hat: 'witch' }], caption: 'Happy Halloween!' },
        thanksgiving: { name: 'Thanksgiving', emoji: '🦃', size: [2, 2], theme: 'harvest-table', star: ['turkeyStrut', { hat: 'pilgrim' }], caption: 'Happy Thanksgiving!' },
        xmaseve:      { name: 'Christmas Eve', emoji: '🛷', size: [2, 1], theme: 'north-pole', star: ['flyby', { flyer: 'sleigh' }], caption: 'Twas the night before Christmas...' },
        christmas:    { name: 'Christmas', emoji: '🎄', size: [2, 2], theme: 'north-pole', star: ['treeLights', {}], caption: 'Merry Christmas!' },
        nye:          { name: 'New Year\'s Eve', emoji: '🥳', size: [2, 1], theme: 'midnight-confetti', star: ['midnightClock', {}], caption: 'Counting down to midnight!' }
    },

    // When a month has several holiday themes, the earliest in this list wins
    // the automatic theme pick
    PRIORITY: ['christmas', 'halloween', 'thanksgiving', 'valentine', 'stpat', 'easter', 'july4', 'lunar', 'newyear'],

    easter(year) {
        // Anonymous Gregorian computus
        const a = year % 19, b = Math.floor(year / 100), c = year % 100;
        const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
        const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
        const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
        const m = Math.floor((a + 11 * h + 22 * l) / 451);
        const month = Math.floor((h + l - 7 * m + 114) / 31);
        const day = ((h + l - 7 * m + 114) % 31) + 1;
        return [month, day];
    },

    thanksgiving(year) {
        // Fourth Thursday of November
        const first = new Date(year, 10, 1).getDay();
        const firstThu = 1 + ((4 - first + 7) % 7);
        return firstThu + 21;
    },

    // All holidays in month (1-12) of year: [{ key, day, ...INFO[key] }]
    forMonth(year, month) {
        const out = [];
        const add = (key, day) => out.push(Object.assign({ key, day }, AdventHolidays.INFO[key]));
        if (month === 1) add('newyear', 1);
        const lunar = AdventHolidays.LUNAR[year];
        if (lunar && lunar[0] === month) add('lunar', lunar[1]);
        if (month === 2) add('valentine', 14);
        if (month === 3) add('stpat', 17);
        const easter = AdventHolidays.easter(year);
        if (easter[0] === month) add('easter', easter[1]);
        if (month === 7) add('july4', 4);
        if (month === 10) add('halloween', 31);
        if (month === 11) add('thanksgiving', AdventHolidays.thanksgiving(year));
        if (month === 12) { add('xmaseve', 24); add('christmas', 25); add('nye', 31); }
        // Two holidays on one day: keep the first
        return out.filter((h, i) => out.findIndex(o => o.day === h.day) === i);
    },

    zodiac(year) {
        return AdventHolidays.ZODIAC[((year - 4) % 12 + 12) % 12];
    }
};

// ===========================================================================
// Themes
//
//   months   which months (1-12) list this theme. Seasonal themes cover a
//            few months each so every month has at least four to pick from.
//   holiday  holiday themes only appear in a month that has that holiday
//   pal      colours. door: the door paint cycle; window: the sky inside a
//            door; accent: confetti and props; board/frame: the calendar body
//   scene    the wallpaper behind the calendar
//   frame    the calendar's outer frame style; motif: its little decorations
//   treats   [treatId, params] pool, dealt out across the month's doors
// ===========================================================================

const ADVENT_THEMES = [
    // ---------------------------------------------------------------- winter
    {
        id: 'snowy-woodland', name: 'Snowy Woodland', emoji: '🦊', months: [12, 1, 2],
        pal: {
            window: ['#a9d6f5', '#eef8ff'], accent: ['#e8505b', '#4fae76', '#ffd447', '#7fc8f8'],
            door: ['#c94f4f', '#3f8f6a', '#e0a63a', '#4f7fc9'], board: '#f3ead9', frame: '#8a5a3c', title: '#fff8ee', ink: '#5a3a2a'
        },
        scene: { sky: ['#5a78b8', '#c9dcf2'], celestial: 'moon', hills: ['#dfe9f7', '#f4f8ff'], props: 'pines', snowy: true, particles: 'snow' },
        frame: 'felt', motif: 'snowflake',
        treats: [
            ['peekaboo', { c: 'fox', cover: 'snow', scarf: '#e8505b' }], ['catchFalling', { c: 'bunny', thing: 'snow', hat: 'earmuffs' }],
            ['snowmanBuild', { scarf: '#4fae76' }], ['sledding', { c: 'fox', scarf: '#ffd447' }], ['snowGlobe', { inside: 'forest' }],
            ['hopTrio', { cast: ['bunny', 'fox', 'bunny'], snow: true }], ['owlMoon', {}], ['steamyMug', { mug: '#4fae76', cookie: true, label: 'Cocoa in the woods' }],
            ['snowballToss', { c: 'fox', c2: 'bunny' }], ['hopAcross', { c: 'hedgehog', snow: true, hat: 'beanie' }], ['juggle', { c: 'squirrel', thing: 'snowball' }],
            ['sleepyMoon', { c: 'fox' }], ['flutter', { flyer: 'bird', center: 'flower' }], ['balloonRide', { c: 'mouse', scarf: '#e8505b' }]
        ]
    },
    {
        id: 'penguin-parade', name: 'Penguin Parade', emoji: '🐧', months: [1, 2],
        pal: {
            window: ['#bfe6ff', '#f2fbff'], accent: ['#5aa9e6', '#ff8fb8', '#ffd447', '#9be3ff'],
            door: ['#5aa9e6', '#8fc9f2', '#3f7fc0', '#a8d8ff'], board: '#eaf6ff', frame: '#3f6fa8', title: '#ffffff', ink: '#2a4a7a'
        },
        scene: { sky: ['#8fc4ec', '#e8f6ff'], celestial: 'sun', hills: ['#e2f0fb', '#ffffff'], props: 'igloos', snowy: true, particles: 'snow' },
        frame: 'paper', motif: 'snowflake',
        treats: [
            ['parade', { cast: ['penguin', 'penguin', 'penguin', 'penguin', 'penguin'], snow: true, hats: ['beanie', undefined, 'earmuffs', undefined, 'party'], scarves: ['#ff8fb8', '#ffd447'], label: 'Penguin parade!' }],
            ['penguinSlide', { scarf: '#ff8fb8' }], ['snowGlobe', { inside: 'critter', c: 'penguin', hat: 'beanie' }], ['peekaboo', { c: 'penguin', cover: 'snow', hat: 'beanie', word: 'brrr!' }],
            ['snowballToss', { c: 'penguin', c2: 'penguin' }], ['catchFalling', { c: 'penguin', thing: 'snow', scarf: '#ffd447' }], ['underSea', { c: 'penguin' }],
            ['hopTrio', { cast: ['penguin', 'penguin', 'penguin'], snow: true }], ['sledding', { c: 'penguin', hat: 'earmuffs' }], ['whaleSpout', {}],
            ['fireworks', { c: 'penguin', hat: 'party' }], ['steamyMug', { mug: '#5aa9e6', label: 'Hot cocoa on the ice' }], ['balloonRide', { c: 'penguin' }], ['sleepyMoon', { c: 'penguin' }]
        ]
    },
    {
        id: 'cozy-cabin', name: 'Cozy Cabin', emoji: '🧶', months: [11, 12, 1, 2],
        pal: {
            window: ['#ffe9d1', '#fff6ea'], accent: ['#e8505b', '#f2a03d', '#7fbf8f', '#8fa8ff'],
            door: ['#c95c4a', '#e0a63a', '#5f9e7a', '#7a6ab8'], board: '#fbf1e2', frame: '#b5523b', title: '#fff4e6', ink: '#5a2a1a'
        },
        scene: { sky: ['#2c2a52', '#6a5a8a'], celestial: 'moon', hills: ['#e8eef8', '#f8fbff'], props: 'cabins', snowy: true, particles: 'snow' },
        frame: 'knit', motif: 'heart',
        treats: [
            ['steamyMug', { mug: '#c95c4a', cookie: true }], ['yarnKitten', { yarn: '#e0a63a' }], ['catNap', { cushion: '#7a6ab8' }], ['teaTime', { pot: '#7fbf8f' }],
            ['stockings', {}], ['bookOwl', {}], ['cupcakeCandle', { c: 'mouse', label: 'A cupcake by the fire' }], ['steamyMug', { mug: '#7a6ab8', steam: 'curl', label: 'Tea and a biscuit', cookie: true }],
            ['peekaboo', { c: 'bear', cover: 'snow', hat: 'beanie', scarf: '#e0a63a' }], ['snowGlobe', { inside: 'house', base: '#5f9e7a' }], ['yarnKitten', { yarn: '#8fa8ff', color: '#bdb6c9' }],
            ['campfire', { c: 'bear', scarf: '#c95c4a' }], ['sleepyMoon', { c: 'cat', hatColor: '#c95c4a' }], ['catchFalling', { c: 'cat', thing: 'snow', scarf: '#c95c4a' }]
        ]
    },
    {
        id: 'gingerbread-village', name: 'Gingerbread Village', emoji: '🍪', months: [12],
        pal: {
            window: ['#ffe7cf', '#fff6ee'], accent: ['#ff6b8b', '#7fd8be', '#ffd447', '#ffffff'],
            door: ['#c98648', '#b5733a', '#d99a5a', '#a8653a'], doorInk: '#ffffff', board: '#e8b27a', frame: '#9a5a2a', title: '#ffffff', ink: '#6a3a1a'
        },
        scene: { sky: ['#ffb8c9', '#ffe3c4'], celestial: 'none', hills: ['#ffffff', '#fff4f8'], props: 'candy', snowy: true, particles: 'snow' },
        frame: 'cookie', motif: 'candy',
        treats: [
            ['gingerDance', {}], ['gingerDance', { hat: 'santa' }], ['cupcakeCandle', { c: 'ginger', frosting: '#ffffff', liner: '#ff6b8b', label: 'Frosting time!' }],
            ['swingOrnaments', { item: 'star', colors: ['#ffd447', '#ff6b8b', '#7fd8be'], garland: '#c98648' }], ['giftPop', { item: 'critter', c: 'ginger', box: '#ff6b8b' }],
            ['steamyMug', { mug: '#ff6b8b', cookie: true, label: 'Milk and cookies' }], ['treeLights', {}], ['catchFalling', { c: 'ginger', thing: 'candy' }],
            ['peekaboo', { c: 'ginger', cover: 'snow', word: 'yum!' }], ['snowGlobe', { inside: 'house', base: '#c98648' }], ['stockings', {}],
            ['hopTrio', { cast: ['ginger', 'ginger', 'ginger'], snow: true }], ['juggle', { c: 'ginger', thing: 'snowball' }], ['balloonRide', { c: 'ginger', colors: ['#ff6b8b', '#ffffff', '#7fd8be'] }]
        ]
    },
    // ---------------------------------------------------------------- spring
    {
        id: 'rainy-ducks', name: 'Rainy Day Ducks', emoji: '🦆', months: [3, 4, 5],
        pal: {
            window: ['#b8cde3', '#e6eef7'], accent: ['#ffd447', '#ff6b8b', '#7fc8f8', '#9be37a'],
            door: ['#ffd447', '#7fc8f8', '#ff9ab8', '#9be37a'], doorInk: '#3b4a6a', board: '#f2f6fb', frame: '#5a7aa8', title: '#ffffff', ink: '#2f4a6a'
        },
        scene: { sky: ['#8aa0bf', '#d5e0ec'], celestial: 'none', hills: ['#7cb86a', '#93c97f'], props: 'puddles', particles: 'rain' },
        frame: 'paper', motif: 'drop',
        treats: [
            ['puddleSplash', { c: 'duck' }], ['rainbowAfterRain', { c: 'duck' }], ['puddleSplash', { c: 'frog', hat: 'sunhat' }], ['hopTrio', { cast: ['duck', 'duck', 'duck'] }],
            ['peekaboo', { c: 'frog', cover: 'bush', word: 'ribbit' }], ['growFlower', { flower: 'tulip', color: '#ffd447' }], ['parade', { cast: ['duck', 'duck', 'duck', 'duck'], label: 'Follow the leader' }],
            ['bubbles', { c: 'frog' }], ['catchFalling', { c: 'duck', thing: 'drop' }], ['fireflyJar', { c: 'frog' }], ['mushroomHouse', { cap: '#ffd447' }],
            ['rainbowAfterRain', { c: 'frog' }], ['teaTime', { pot: '#ffd447' }], ['sleepyMoon', { c: 'duck', hatColor: '#ffd447' }]
        ]
    },
    {
        id: 'cherry-blossom', name: 'Cherry Blossom Garden', emoji: '🌸', months: [3, 4],
        pal: {
            window: ['#ffe3ee', '#fff6fa'], accent: ['#ff8fb8', '#ffd1e3', '#b5e3c4', '#ffffff'],
            door: ['#ff9ab8', '#f6c3d6', '#b38a6a', '#9fd4b4'], doorInk: '#5a2a3a', board: '#fff3f7', frame: '#8a5a4a', title: '#ffffff', ink: '#6a3a4a'
        },
        scene: { sky: ['#ffd6e5', '#fff1f6'], celestial: 'sun', hills: ['#a8d8a0', '#bfe4b2'], props: 'blossoms', particles: 'petals' },
        frame: 'wood', motif: 'flower',
        treats: [
            ['catchFalling', { c: 'cat', thing: 'petal', hat: 'flower' }], ['teaTime', { pot: '#ff9ab8' }], ['catNap', { cushion: '#ff9ab8', color: '#ffffff' }],
            ['flutter', { flyer: 'butterfly', color: '#ff8fb8' }], ['growFlower', { flower: 'daisy', color: '#ffd1e3' }], ['loveBugs', { c: 'cat', c2: 'bunny', hat: 'flower' }],
            ['lanternRise', {}], ['swingOrnaments', { item: 'lantern', colors: ['#ff8fb8', '#ffd1e3', '#ff6b8b'], garland: '#8a5a4a' }], ['kiteFly', { c: 'bunny', kite: '#ff8fb8' }],
            ['peekaboo', { c: 'cat', cover: 'bush', hat: 'bow' }], ['bubbles', { c: 'bunny' }], ['yarnKitten', { yarn: '#ff8fb8', color: '#ffffff' }], ['sunrise', {}], ['flutter', { flyer: 'bird' }]
        ]
    },
    {
        id: 'bloom-buzz', name: 'Bloom & Buzz', emoji: '🐝', months: [4, 5, 6],
        pal: {
            window: ['#b8e6ff', '#f2fbff'], accent: ['#ffd23f', '#ff8fb8', '#9be37a', '#c99bff'],
            door: ['#ffcf4a', '#ff9ab8', '#8fd38a', '#b89cf2'], doorInk: '#4a3a1a', board: '#fffbe8', frame: '#5c9a4a', title: '#ffffff', ink: '#3a5a2a'
        },
        scene: { sky: ['#8fd3ff', '#e6f7ff'], celestial: 'sun', hills: ['#7cc46a', '#9fd88a'], props: 'flowers', particles: 'petals' },
        frame: 'vine', motif: 'flower',
        treats: [
            ['growFlower', { flower: 'sunflower' }], ['flutter', { flyer: 'bee' }], ['flutter', { flyer: 'butterfly', color: '#c99bff' }], ['growFlower', { flower: 'tulip', color: '#ff6b8b' }],
            ['peekaboo', { c: 'bee', cover: 'bush', word: 'bzz!' }], ['hopAcross', { c: 'bunny', hat: 'flower' }], ['sunrise', {}], ['bubbles', { c: 'pig', hat: 'flower' }],
            ['kiteFly', { c: 'bear' }], ['loveBugs', { c: 'bee', c2: 'bee' }], ['growFlower', { flower: 'daisy' }], ['hopTrio', { cast: ['chick', 'chick', 'chick'] }],
            ['rainbowAfterRain', { c: 'bee' }], ['balloonRide', { c: 'bee', colors: ['#ffd23f', '#ff8fb8', '#9be37a'] }]
        ]
    },
    {
        id: 'kite-day', name: 'Windy Kite Day', emoji: '🪁', months: [3, 4, 5],
        pal: {
            window: ['#a8dcff', '#eaf7ff'], accent: ['#ff6b8b', '#ffd447', '#7fc8f8', '#9be37a'],
            door: ['#ff7a7a', '#5ab8e6', '#ffc94a', '#7bc96a'], board: '#f3fbff', frame: '#4a8ac8', title: '#ffffff', ink: '#2a4a6a'
        },
        scene: { sky: ['#7fc4f2', '#dff3ff'], celestial: 'sun', hills: ['#7cc46a', '#9fd88a'], props: 'clouds', particles: 'petals' },
        frame: 'paper', motif: 'star',
        treats: [
            ['kiteFly', { c: 'bunny', kite: '#ffd447' }], ['kiteFly', { c: 'fox', kite: '#7fc8f8' }], ['balloonRide', { c: 'bear' }], ['flyby', { flyer: 'balloon', c: 'mouse' }],
            ['flutter', { flyer: 'bird' }], ['bubbles', { c: 'mouse' }], ['hopTrio', { cast: ['sheep', 'sheep', 'sheep'] }], ['sunrise', {}],
            ['catchFalling', { c: 'bunny', thing: 'petal' }], ['rainbowAfterRain', { c: 'chick' }], ['peekaboo', { c: 'sheep', cover: 'grass', word: 'baa!' }],
            ['kiteFly', { c: 'cow', kite: '#ff6b8b' }], ['flyby', { flyer: 'stork', c: 'bunny' }], ['hopAcross', { c: 'sheep' }]
        ]
    },
    // ---------------------------------------------------------------- summer
    {
        id: 'beach-day', name: 'Beach Day', emoji: '🦀', months: [6, 7, 8],
        pal: {
            window: ['#8fd3ff', '#e6f7ff'], accent: ['#ff6b6b', '#ffd447', '#4fc3e8', '#7fd8be'],
            door: ['#ff8a6a', '#4fc3e8', '#ffd166', '#7fd8be'], doorInk: '#2a4a5a', board: '#fff6e2', frame: '#4aa0c8', title: '#ffffff', ink: '#2a5a6a'
        },
        scene: { sky: ['#6fc6f5', '#d9f2ff'], celestial: 'sun', props: 'beach', particles: 'sparkles' },
        frame: 'rope', motif: 'shell',
        treats: [
            ['beachDay', {}], ['whaleSpout', {}], ['iceCreamStack', {}], ['underSea', { c: 'octopus' }], ['peekaboo', { c: 'pig', cover: 'sand', hat: 'sunhat', word: 'sunny!' }],
            ['kiteFly', { c: 'bear', kite: '#ff6b6b' }], ['sunrise', {}], ['bubbles', { c: 'octopus' }], ['flutter', { flyer: 'bird' }],
            ['iceCreamStack', { scoops: ['#8fd3a8', '#ffd1e3', '#c99bff'] }], ['whaleSpout', { hearts: true }], ['beachDay', {}], ['balloonRide', { c: 'pig', colors: ['#ff6b6b', '#ffd447', '#4fc3e8'] }], ['sparkler', { c: 'pig' }]
        ]
    },
    {
        id: 'firefly-camp', name: 'Firefly Campout', emoji: '🏕️', months: [6, 7, 8, 9],
        pal: {
            window: ['#1d2350', '#4b3f7a'], accent: ['#e6ff8a', '#ff9a4d', '#7fd8be', '#ffd447'],
            door: ['#3f7a5a', '#8a5a3c', '#5a6ab8', '#a87536'], board: '#2f3a2a', boardInk: '#e6efd8', frame: '#6b4423', title: '#fff5d6', ink: '#3a2a1a'
        },
        scene: { sky: ['#141a3a', '#3a3a6a'], celestial: 'moon', hills: ['#1f3a2a', '#2a4a35'], props: 'tents', particles: 'fireflies' },
        frame: 'wood', motif: 'star',
        treats: [
            ['campfire', { c: 'bear' }], ['fireflyJar', { c: 'frog' }], ['campfire', { c: 'fox', scarf: '#ff9a4d' }], ['flutter', { flyer: 'firefly', center: 'jar', n: 6 }],
            ['owlMoon', {}], ['starCatch', { c: 'mouse' }], ['mushroomHouse', {}], ['sleepyMoon', { c: 'bear' }], ['bookOwl', {}],
            ['hopTrio', { cast: ['frog', 'frog', 'frog'], grass: '#2f5a3a' }], ['fireworks', { c: 'fox' }], ['fireflyJar', { c: 'bunny' }], ['sparkler', { c: 'bear', shape: 'star' }], ['flyby', { flyer: 'owl' }]
        ]
    },
    {
        id: 'under-the-sea', name: 'Under the Sea', emoji: '🐙', months: [6, 7, 8],
        pal: {
            window: ['#4fc3e8', '#1f6fa8'], accent: ['#ff9a4d', '#ffd447', '#ff7ab8', '#7fe0d0'],
            door: ['#2f8fc8', '#3fb0b8', '#5a7ad8', '#2a9a8a'], board: '#d8f2fa', frame: '#2a6a9a', title: '#ffffff', ink: '#1a4a6a'
        },
        scene: { sky: ['#2a8ac8', '#123a6a'], celestial: 'none', props: 'seaweed', underwater: true, particles: 'bubbles' },
        frame: 'rope', motif: 'shell',
        treats: [
            ['underSea', { c: 'octopus' }], ['whaleSpout', {}], ['underSea', {}], ['peekaboo', { c: 'octopus', cover: 'sand', word: 'blub!' }],
            ['bubbles', { c: 'octopus', grass: '#f0d9a0' }], ['underSea', { c: 'frog' }], ['beachDay', {}], ['whaleSpout', { hearts: true }],
            ['underSea', { c: 'penguin' }], ['giftPop', { item: 'star', box: '#2f8fc8' }], ['underSea', { c: 'octopus', hat: 'crown' }], ['sleepyMoon', { c: 'octopus' }], ['bubbles', { c: 'frog' }], ['underSea', { c: 'duck' }]
        ]
    },
    {
        id: 'ice-cream-parlor', name: 'Ice Cream Parlor', emoji: '🍦', months: [6, 7, 8],
        pal: {
            window: ['#ffe9f3', '#fff7d6'], accent: ['#ff8fb8', '#8fd3a8', '#fff3c4', '#c99bff'],
            door: ['#ffb3d1', '#9fe0c0', '#ffe08a', '#c9b3ff'], doorInk: '#6a3a4a', board: '#fffaf2', frame: '#e86a9a', title: '#ffffff', ink: '#7a2a4a'
        },
        scene: { sky: ['#ffd6e8', '#fff3d6'], celestial: 'sun', hills: ['#ffe3ef', '#fff0f6'], props: 'sprinkles', particles: 'confetti' },
        frame: 'candycane', motif: 'heart',
        treats: [
            ['iceCreamStack', {}], ['iceCreamStack', { scoops: ['#c99bff', '#8fd3a8', '#ffd1e3'] }], ['cupcakeCandle', { c: 'pig' }], ['giftPop', { item: 'heart', box: '#ffb3d1' }],
            ['partyPopper', { c: 'cat' }], ['balloonRide', { c: 'pig', hearts: true, colors: ['#ff8fb8', '#c99bff', '#8fd3a8'] }], ['bubbles', { c: 'cow' }],
            ['teaTime', { pot: '#ffb3d1' }], ['catchFalling', { c: 'bear', thing: 'candy' }], ['peekaboo', { c: 'cow', cover: 'cloud', word: 'moo!' }],
            ['iceCreamStack', { scoops: ['#fff3c4', '#ff8fb8', '#8fd3a8'] }], ['loveBugs', { c: 'pig', c2: 'cow' }], ['cupcakeCandle', { c: 'bunny', frosting: '#c9b3ff' }], ['sunrise', {}]
        ]
    },
    // ---------------------------------------------------------------- autumn
    {
        id: 'apple-orchard', name: 'Apple Orchard', emoji: '🍎', months: [8, 9, 10],
        pal: {
            window: ['#bfe6ff', '#fff6e0'], accent: ['#e8434f', '#f2c94c', '#8bc34a', '#ff9a4d'],
            door: ['#d9534f', '#8bb84a', '#e8a33a', '#c9773a'], board: '#fff4e0', frame: '#8a5a32', title: '#fff8ea', ink: '#5a3a1a'
        },
        scene: { sky: ['#9fd3ff', '#fff3d6'], celestial: 'sun', hills: ['#8fbf5a', '#a8cf6a'], props: 'appletrees', particles: 'leaves' },
        frame: 'wood', motif: 'leaf',
        treats: [
            ['appleBonk', {}], ['juggle', { c: 'bear', thing: 'apple' }], ['harvestBasket', {}], ['bookOwl', {}], ['pieWindow', { c: 'fox' }],
            ['scarecrow', {}], ['peekaboo', { c: 'hedgehog', cover: 'leaves', word: 'hiya!' }], ['hopAcross', { c: 'hedgehog', grass: '#a5b85a' }],
            ['leafJump', { c: 'bear' }], ['steamyMug', { mug: '#d9534f', label: 'Hot apple cider', steam: 'curl' }], ['appleBonk', {}],
            ['juggle', { c: 'squirrel' }], ['kiteFly', { c: 'fox', kite: '#e8a33a' }], ['flutter', { flyer: 'bird' }]
        ]
    },
    {
        id: 'autumn-woods', name: 'Autumn Woods', emoji: '🍂', months: [9, 10, 11],
        pal: {
            window: ['#ffe2b8', '#fff4e0'], accent: ['#e8505b', '#ffb347', '#d9822b', '#f2c94c'],
            door: ['#d9622b', '#c94f3a', '#e8a33a', '#8a6a3a'], board: '#fdf0dc', frame: '#9a4a22', title: '#fff4e6', ink: '#5a2a12'
        },
        scene: { sky: ['#f4b67a', '#ffe7c4'], celestial: 'sun', hills: ['#c98a3a', '#d9a35a'], props: 'autumntrees', particles: 'leaves' },
        frame: 'felt', motif: 'leaf',
        treats: [
            ['leafJump', { c: 'fox' }], ['juggle', { c: 'squirrel' }], ['catchFalling', { c: 'hedgehog', thing: 'leaf', grass: '#a5b85a' }], ['mushroomHouse', { cap: '#d9622b' }],
            ['peekaboo', { c: 'squirrel', cover: 'leaves' }], ['hopAcross', { c: 'fox', grass: '#b9a35a' }], ['owlMoon', {}], ['steamyMug', { mug: '#d9622b', steam: 'curl', label: 'Pumpkin spice everything' }],
            ['leafJump', { c: 'bear' }], ['campfire', { c: 'fox', scarf: '#f2c94c' }], ['hopTrio', { cast: ['hedgehog', 'squirrel', 'fox'], grass: '#b9a35a' }],
            ['kiteFly', { c: 'squirrel', kite: '#e8505b' }], ['bookOwl', {}], ['sleepyMoon', { c: 'squirrel', hatColor: '#d9622b' }]
        ]
    },
    {
        id: 'harvest-moon', name: 'Harvest Moon', emoji: '🌕', months: [9, 10],
        pal: {
            window: ['#2a2450', '#6a4a7a'], accent: ['#ff9a3d', '#ffd447', '#e8505b', '#9df29d'],
            door: ['#c96a2b', '#7a4a6a', '#b5873a', '#5a5a8a'], board: '#3a2f4a', boardInk: '#f6e2c6', frame: '#5a3a22', title: '#ffe8c4', ink: '#3a2412'
        },
        scene: { sky: ['#1f1d45', '#7a4a5a'], celestial: 'harvestmoon', hills: ['#3a2f45', '#4a3a50'], props: 'pumpkins', particles: 'leaves' },
        frame: 'wood', motif: 'leaf',
        treats: [
            ['scarecrow', {}], ['owlMoon', {}], ['harvestBasket', {}], ['jackOLantern', {}], ['flutter', { flyer: 'bat', center: 'moon' }], ['flyby', { flyer: 'owl' }],
            ['campfire', { c: 'bear', scarf: '#c96a2b' }], ['fireflyJar', { c: 'mouse' }], ['sleepyMoon', { c: 'fox', hatColor: '#c96a2b' }], ['starCatch', { c: 'fox' }],
            ['flutter', { flyer: 'firefly', center: 'pumpkin', n: 6 }], ['mushroomHouse', { cap: '#c96a2b' }], ['pieWindow', { c: 'mouse' }], ['bookOwl', {}]
        ]
    },
    {
        id: 'sweater-weather', name: 'Sweater Weather', emoji: '🧣', months: [10, 11],
        pal: {
            window: ['#ffe9cf', '#fff6ea'], accent: ['#d9822b', '#8a3a3a', '#e8c25a', '#7a8a5a'],
            door: ['#b5523b', '#d9a03a', '#6a7a4a', '#8a5a7a'], board: '#fbf0e0', frame: '#c9934f', title: '#fff6e6', ink: '#5a3a1a'
        },
        scene: { sky: ['#d98a5a', '#f6d2a8'], celestial: 'sun', hills: ['#b5733a', '#c98a4a'], props: 'autumntrees', particles: 'leaves' },
        frame: 'knit', motif: 'leaf',
        treats: [
            ['steamyMug', { mug: '#b5523b', steam: 'curl', cookie: true, label: 'Cider and a cookie' }], ['yarnKitten', { yarn: '#d9a03a' }], ['catNap', { cushion: '#b5523b' }], ['leafJump', { c: 'cat' }],
            ['pieWindow', { c: 'bear', curtain: '#d9a03a' }], ['teaTime', { pot: '#d9a03a' }], ['bookOwl', {}], ['peekaboo', { c: 'bear', cover: 'leaves', hat: 'beanie', scarf: '#b5523b' }],
            ['catchFalling', { c: 'fox', thing: 'leaf', scarf: '#8a3a3a', grass: '#b9a35a' }], ['yarnKitten', { yarn: '#6a7a4a', color: '#3b3546' }], ['campfire', { c: 'bear', scarf: '#d9a03a', hat: 'beanie' }],
            ['harvestBasket', {}], ['kiteFly', { c: 'fox', kite: '#d9a03a' }], ['sleepyMoon', { c: 'bear', hatColor: '#b5523b' }]
        ]
    },
    // ---------------------------------------------------------------- year-round
    {
        id: 'sleepy-moon', name: 'Sleepy Moon', emoji: '🌙', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        pal: {
            window: ['#1d2350', '#4b3f7a'], accent: ['#ffd447', '#c99bff', '#7fc8f8', '#ff9ab8'],
            door: ['#3a3f8a', '#5a4a9a', '#2a4a7a', '#6a5aaa'], doorInk: '#ffe9a8', board: '#252a5a', boardInk: '#e6e0ff', frame: '#c9a24a', title: '#fff3c4', ink: '#2a2050'
        },
        scene: { sky: ['#0f1433', '#3a2f6a'], celestial: 'crescent', hills: ['#1f2350', '#2a2f60'], props: 'none', particles: 'stars' },
        frame: 'bezel', motif: 'star',
        treats: [
            ['sleepyMoon', { c: 'bunny' }], ['starCatch', { c: 'mouse' }], ['owlMoon', {}], ['bookOwl', {}], ['fireflyJar', { c: 'frog' }], ['flyby', { flyer: 'owl' }],
            ['lanternRise', {}], ['catNap', { cushion: '#5a4a9a', color: '#bdb6c9' }], ['mushroomHouse', {}], ['swingOrnaments', { item: 'star', night: true, garland: '#c9a24a', colors: ['#ffd447', '#fff3c4', '#ffb347'] }],
            ['sleepyMoon', { c: 'bear' }], ['starCatch', { c: 'bunny' }], ['flutter', { flyer: 'firefly', center: 'moon', n: 6 }], ['sleepyMoon', { c: 'cat', hatColor: '#c99bff' }]
        ]
    },
    {
        id: 'space-picnic', name: 'Space Picnic', emoji: '🚀', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        pal: {
            window: ['#141a3a', '#3a3270'], accent: ['#9be37a', '#ff9a76', '#ffd447', '#7fc8f8'],
            door: ['#5a4ab8', '#2f6fa8', '#8a4ab8', '#3a8a8a'], doorInk: '#e8fff0', board: '#1c2048', boardInk: '#d8e8ff', frame: '#8a9ab8', title: '#e8f4ff', ink: '#1a2040'
        },
        scene: { sky: ['#070a1f', '#2a1f55'], celestial: 'planets', props: 'none', particles: 'stars' },
        frame: 'bezel', motif: 'star',
        treats: [
            ['rocketLaunch', { c: 'cat' }], ['planetPal', { planet: '#ff9a76' }], ['flyby', { flyer: 'rocket' }], ['starCatch', { c: 'alien' }], ['sleepyMoon', { c: 'alien', hatColor: '#9be37a' }],
            ['planetPal', { planet: '#7fc8f8' }], ['peekaboo', { c: 'alien', cover: 'cloud', night: true, word: 'zorp!' }], ['hopTrio', { cast: ['alien', 'alien', 'alien'], grass: '#5a4a8a' }],
            ['rocketLaunch', { c: 'bear' }], ['balloonRide', { c: 'alien', colors: ['#9be37a', '#ffd447', '#ff9a76'] }], ['fireworks', { c: 'alien' }], ['planetPal', { planet: '#c99bff' }],
            ['giftPop', { item: 'critter', c: 'alien', box: '#5a4ab8' }], ['bubbles', { c: 'alien', grass: '#5a4a8a' }]
        ]
    },
    // ---------------------------------------------------------------- holidays
    {
        id: 'midnight-confetti', name: 'Midnight Confetti', emoji: '🎉', months: [1, 12], holiday: ['newyear', 'nye'],
        pal: {
            window: ['#1d2350', '#4b3f7a'], accent: ['#ffd447', '#ff6b8b', '#7fc8f8', '#9df29d', '#ffffff'],
            door: ['#2a2f6a', '#3a2a5a', '#1f3a6a', '#4a2a6a'], doorInk: '#ffd447', board: '#1a1d40', boardInk: '#ffe9a8', frame: '#d9b44a', title: '#fff3c4', ink: '#1a1a3a'
        },
        scene: { sky: ['#0b0f2a', '#3a2a5a'], celestial: 'none', hills: ['#141833', '#1c2040'], props: 'city', particles: 'confetti' },
        frame: 'bezel', motif: 'firework',
        treats: [
            ['fireworks', { c: 'cat', hat: 'party' }], ['partyPopper', { c: 'penguin', night: true }], ['midnightClock', {}], ['catchFalling', { c: 'bunny', thing: 'confetti', night: true, hat: 'party' }],
            ['balloonRide', { c: 'bear', colors: ['#ffd447', '#ff6b8b', '#7fc8f8'] }], ['sparkler', { c: 'bunny', shape: 'star' }], ['giftPop', { item: 'star', box: '#3a2a5a' }],
            ['partyPopper', { c: 'fox', night: true, hatColor: '#ffd447' }], ['fireworks', { c: 'penguin', c2: 'penguin', hat: 'party', hat2: 'crown' }], ['lanternRise', {}],
            ['sparkler', { c: 'cat', shape: 'heart' }], ['cupcakeCandle', { c: 'mouse', label: 'A wish for the new year' }], ['hopTrio', { cast: ['penguin', 'cat', 'bunny'], hats: ['party', 'party', 'party'] }], ['starCatch', { c: 'mouse' }]
        ]
    },
    {
        id: 'lantern-festival', name: 'Lantern Festival', emoji: '🏮', months: [1, 2], holiday: ['lunar'],
        pal: {
            window: ['#3a1830', '#7a2a3a'], accent: ['#e8384f', '#ffd447', '#ff9a4d', '#ffffff'],
            door: ['#c8283a', '#d9a02a', '#a81f30', '#e85a3a'], doorInk: '#ffe9a8', board: '#7a1a24', boardInk: '#ffe9a8', frame: '#d9b44a', title: '#ffe9a8', ink: '#4a0a14'
        },
        scene: { sky: ['#2a0f1f', '#7a2a3a'], celestial: 'moon', hills: ['#3a1424', '#4a1a2a'], props: 'lanterns', particles: 'sparkles' },
        frame: 'bezel', motif: 'lantern',
        treats: [
            ['dragonDance', {}], ['lanternRise', {}], ['swingOrnaments', { item: 'lantern', night: true, garland: '#d9b44a', colors: ['#e8384f', '#ff9a4d', '#e8384f'] }], ['fireworks', { c: 'dragon' }],
            ['peekaboo', { c: 'dragon', cover: 'cloud', night: true, word: 'roar~' }], ['giftPop', { item: 'critter', c: 'dragon', box: '#c8283a', ribbon: '#ffd447' }], ['sparkler', { c: 'dragon' }],
            ['balloonRide', { c: 'dragon', colors: ['#e8384f', '#ffd447', '#ff9a4d'] }], ['steamyMug', { mug: '#c8283a', steam: 'curl', label: 'Warm tea for the new year' }],
            ['hopTrio', { cast: ['dragon', 'dragon', 'dragon'], grass: '#7a2a3a' }], ['lanternRise', {}], ['catchFalling', { c: 'dragon', thing: 'star', night: true }],
            ['sleepyMoon', { c: 'dragon', hatColor: '#e8384f' }], ['dragonDance', {}]
        ]
    },
    {
        id: 'love-bugs', name: 'Love Bugs', emoji: '💌', months: [2], holiday: ['valentine'],
        pal: {
            window: ['#ffe0ec', '#fff5f8'], accent: ['#ff4d6d', '#ff8fb8', '#ffc2d6', '#ffffff'],
            door: ['#ff6b8b', '#ff9ab8', '#e8384f', '#ffb3c6'], doorInk: '#ffffff', board: '#fff0f4', frame: '#d93a5a', title: '#ffffff', ink: '#7a1a3a'
        },
        scene: { sky: ['#ffb3c6', '#ffe8ef'], celestial: 'none', hills: ['#ffd1dc', '#ffe3ea'], props: 'hearts', particles: 'hearts' },
        frame: 'scallop', motif: 'heart',
        treats: [
            ['loveLetter', {}], ['loveBugs', { c: 'bunny', c2: 'bunny' }], ['balloonRide', { c: 'bear', hearts: true, colors: ['#ff4d6d', '#ff8fb8', '#ffc2d6'] }], ['catchFalling', { c: 'cat', thing: 'heart', grass: '#ffd1dc' }],
            ['flyby', { flyer: 'cupid', c: 'bunny' }], ['giftPop', { item: 'teddy', box: '#ff6b8b' }], ['whaleSpout', { hearts: true }], ['loveBugs', { c: 'penguin', c2: 'penguin', hat: 'bow' }],
            ['sparkler', { c: 'bear', shape: 'heart' }], ['cupcakeCandle', { c: 'bunny', frosting: '#ff8fb8', liner: '#e8384f', label: 'A sweet treat for you' }], ['swingOrnaments', { item: 'heart', garland: '#ff8fb8' }],
            ['loveBugs', { c: 'frog', c2: 'frog' }], ['steamyMug', { mug: '#ff6b8b', label: 'Hot cocoa for two' }], ['loveLetter', {}]
        ]
    },
    {
        id: 'lucky-clover', name: 'Lucky Clover', emoji: '🍀', months: [3], holiday: ['stpat'],
        pal: {
            window: ['#c9f0d0', '#f2fff4'], accent: ['#43b05c', '#ffd447', '#7ddc8c', '#ffffff'],
            door: ['#3a9a54', '#5cbf60', '#2f7f45', '#7ddc8c'], doorInk: '#fff6c2', board: '#f0fff2', frame: '#2f7f45', title: '#fff6c2', ink: '#1a4a2a'
        },
        scene: { sky: ['#8fdca0', '#e6fff0'], celestial: 'rainbow', hills: ['#43b05c', '#5cbf60'], props: 'clovers', particles: 'clovers' },
        frame: 'felt', motif: 'clover',
        treats: [
            ['potOfGold', {}], ['luckyClover', {}], ['catchFalling', { c: 'bunny', thing: 'clover', hat: 'leprechaun' }], ['peekaboo', { c: 'mouse', cover: 'grass', hat: 'leprechaun', word: 'top o\' the mornin\'' }],
            ['rainbowAfterRain', { c: 'frog' }], ['hopTrio', { cast: ['frog', 'frog', 'frog'], hats: ['leprechaun'] }], ['juggle', { c: 'bear', thing: 'acorn', hat: 'leprechaun' }],
            ['parade', { cast: ['bear', 'bunny', 'mouse', 'frog'], hats: ['leprechaun'], flag: '#43b05c', label: 'St. Paddy\'s parade' }], ['luckyClover', {}], ['giftPop', { item: 'critter', c: 'frog', box: '#3a9a54' }],
            ['steamyMug', { mug: '#43b05c', label: 'Mint cocoa' }], ['potOfGold', {}], ['kiteFly', { c: 'mouse', kite: '#43b05c' }], ['balloonRide', { c: 'mouse', colors: ['#43b05c', '#ffd447', '#7ddc8c'] }]
        ]
    },
    {
        id: 'egg-hunt', name: 'Egg Hunt', emoji: '🐰', months: [3, 4], holiday: ['easter'],
        pal: {
            window: ['#c9ecff', '#fff9f2'], accent: ['#ff9ad5', '#8fd3ff', '#fff3a0', '#b8f2a8'],
            door: ['#ffb3d9', '#9fd8ff', '#fff08a', '#b8f2a8', '#d9b8ff'], doorInk: '#5a3a6a', board: '#fffaf3', frame: '#b98ad9', title: '#ffffff', ink: '#5a3a6a'
        },
        scene: { sky: ['#bfe6ff', '#fff6fb'], celestial: 'sun', hills: ['#8fd38a', '#a8e09a'], props: 'eggs', particles: 'petals' },
        frame: 'scallop', motif: 'egg',
        treats: [
            ['eggHatch', { baby: 'chick' }], ['hopAcross', { c: 'bunny', props: 'eggs', basket: true }], ['juggle', { c: 'bunny', thing: 'egg' }], ['peekaboo', { c: 'bunny', cover: 'grass', hat: 'flower' }],
            ['hopTrio', { cast: ['chick', 'chick', 'chick'] }], ['eggHatch', { baby: 'duck', egg: '#fff3a0', accent: '#b8f2a8' }], ['growFlower', { flower: 'tulip', color: '#ff9ad5' }],
            ['flutter', { flyer: 'butterfly' }], ['eggHatch', { baby: 'dragon', egg: '#d9b8ff', accent: '#fff3a0' }], ['giftPop', { item: 'critter', c: 'chick', box: '#9fd8ff' }],
            ['loveBugs', { c: 'bunny', c2: 'chick' }], ['parade', { cast: ['duck', 'chick', 'chick', 'chick'], label: 'Spring parade' }], ['catchFalling', { c: 'bunny', thing: 'petal', hat: 'headband-bunny' }], ['eggHatch', { baby: 'bunny' }]
        ]
    },
    {
        id: 'firecracker-picnic', name: 'Firecracker Picnic', emoji: '🎆', months: [7], holiday: ['july4'],
        pal: {
            window: ['#a8dcff', '#f2fbff'], accent: ['#ff5d6c', '#ffffff', '#5b8cff', '#ffd447'],
            door: ['#e8384f', '#3c5ab8', '#f6f6f6', '#5b8cff'], doorInk: '#ffffff', board: '#f4f7ff', frame: '#3c5ab8', title: '#ffffff', ink: '#1a2a5a'
        },
        scene: { sky: ['#1d2a5a', '#5a6ab0'], celestial: 'none', hills: ['#3a6a4a', '#4a7a55'], props: 'fireworks', particles: 'sparkles' },
        frame: 'candycane', motif: 'star',
        treats: [
            ['flagPicnic', {}], ['fireworks', { c: 'bear', hat: 'top', hatColor: '#3c5ab8', colors: ['#ff5d6c', '#ffffff', '#5b8cff'] }], ['sparkler', { c: 'bunny', shape: 'star' }], ['iceCreamStack', { scoops: ['#ff8a9a', '#ffffff', '#8fb0ff'] }],
            ['parade', { cast: ['bear', 'duck', 'bunny', 'pig'], flag: '#e8384f', hats: ['top'], label: 'The Fourth of July parade' }], ['beachDay', {}], ['balloonRide', { c: 'pig', colors: ['#ff5d6c', '#ffffff', '#5b8cff'] }],
            ['fireflyJar', { c: 'frog' }], ['sparkler', { c: 'cat', shape: 'heart' }], ['campfire', { c: 'bear' }], ['peekaboo', { c: 'bear', cover: 'grass', hat: 'top', hatColor: '#e8384f', word: 'yee-haw!' }],
            ['fireworks', { c: 'cat', c2: 'mouse', colors: ['#ff5d6c', '#ffd447', '#5b8cff'] }], ['flagPicnic', {}], ['iceCreamStack', {}]
        ]
    },
    {
        id: 'haunted-hollow', name: 'Haunted Hollow', emoji: '🎃', months: [10], holiday: ['halloween'],
        pal: {
            window: ['#1d1a3a', '#4a2f5a'], accent: ['#ff9a3d', '#9df29d', '#c99bff', '#ffd447'],
            door: ['#e8742a', '#5a3a7a', '#3a7a4a', '#7a3a6a'], doorInk: '#fff1d6', board: '#2a2340', boardInk: '#ffe3c4', frame: '#4a3a5a', title: '#ffb35a', ink: '#1a1028'
        },
        scene: { sky: ['#140f2a', '#4a2a5a'], celestial: 'moon', hills: ['#231a35', '#2d2240'], props: 'graveyard', particles: 'bats' },
        frame: 'house', motif: 'bat', roof: '#3a2f4a', crooked: true,
        treats: [
            ['jackOLantern', {}], ['ghostBoo', {}], ['spiderDrop', {}], ['cauldron', {}], ['flyby', { flyer: 'broom' }], ['flutter', { flyer: 'bat', center: 'moon' }],
            ['candyRain', { c: 'monster' }], ['peekaboo', { c: 'ghost', cover: 'pumpkins', night: true, word: 'boo!' }], ['trickOrTreat', { c: 'cat', hat: 'witch' }],
            ['ghostBoo', { hat: 'witch' }], ['swingOrnaments', { item: 'bat', night: true, garland: '#5a3a7a' }], ['owlMoon', {}], ['candyRain', { c: 'ghost' }], ['flyby', { flyer: 'bats' }]
        ]
    },
    {
        id: 'harvest-table', name: 'Harvest Table', emoji: '🦃', months: [11], holiday: ['thanksgiving'],
        pal: {
            window: ['#ffe2b8', '#fff4e0'], accent: ['#e8505b', '#f28c28', '#ffd447', '#8bc34a'],
            door: ['#c9622b', '#a8743a', '#e0a03a', '#8a4a2a'], board: '#fdf1dc', frame: '#7a4a22', title: '#fff4e0', ink: '#4a2a12'
        },
        scene: { sky: ['#e8955a', '#ffe0b8'], celestial: 'sun', hills: ['#c9a04a', '#d9b45a'], props: 'pumpkins', particles: 'leaves' },
        frame: 'house', motif: 'leaf', roof: '#a8432a',
        treats: [
            ['turkeyStrut', {}], ['pieWindow', { c: 'fox' }], ['harvestBasket', {}], ['scarecrow', {}], ['turkeyStrut', { hat: 'pilgrim' }], ['leafJump', { c: 'bear' }],
            ['pieWindow', { c: 'bear', curtain: '#e0a03a' }], ['juggle', { c: 'squirrel' }], ['steamyMug', { mug: '#c9622b', steam: 'curl', label: 'Warm cider' }],
            ['peekaboo', { c: 'turkey', cover: 'leaves', word: 'gobble!' }], ['harvestBasket', {}], ['campfire', { c: 'fox' }], ['hopTrio', { cast: ['hedgehog', 'squirrel', 'mouse'], grass: '#b9a35a' }], ['catchFalling', { c: 'hedgehog', thing: 'leaf', grass: '#b9a35a' }]
        ]
    },
    {
        id: 'north-pole', name: 'North Pole Workshop', emoji: '🎅', months: [12], holiday: ['xmaseve', 'christmas'],
        pal: {
            window: ['#2a3a6a', '#5a6aa8'], accent: ['#e8384f', '#3f8f5a', '#ffd447', '#ffffff'],
            door: ['#c0303f', '#2e7d4f', '#d4a017', '#2f6aa8'], doorInk: '#ffffff', board: '#f6ead6', frame: '#7a2a1a', title: '#ffffff', ink: '#4a1a10'
        },
        scene: { sky: ['#14204a', '#4a5a9a'], celestial: 'moon', hills: ['#dfe9f7', '#f4f8ff'], props: 'pines', snowy: true, particles: 'snow' },
        frame: 'house', motif: 'snowflake', roof: '#b5303a', snowRoof: true,
        treats: [
            ['treeLights', {}], ['rudolph', {}], ['stockings', {}], ['snowmanBuild', { scarf: '#e8384f' }], ['giftPop', { item: 'teddy', box: '#2e7d4f' }],
            ['flyby', { flyer: 'sleigh' }], ['gingerDance', { hat: 'santa' }], ['swingOrnaments', { item: 'ornament', night: true }], ['snowGlobe', { inside: 'house' }],
            ['peekaboo', { c: 'reindeer', cover: 'snow', word: 'ho ho!' }], ['catchFalling', { c: 'penguin', thing: 'snow', hat: 'santa' }], ['steamyMug', { mug: '#c0303f', cookie: true, label: 'Cookies for Santa' }],
            ['giftPop', { item: 'critter', c: 'cat', box: '#c0303f', hat: 'santa' }], ['hopTrio', { cast: ['reindeer', 'reindeer', 'reindeer'], snow: true }], ['sledding', { c: 'mouse', hat: 'santa' }], ['snowballToss', { c: 'penguin', c2: 'reindeer' }]
        ]
    }
];
