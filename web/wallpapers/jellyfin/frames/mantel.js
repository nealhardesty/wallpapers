// Mantel: a cosy room at night. The video hangs in a walnut frame above a
// cream fireplace where a small fire burns, and its light breathes on the
// green damask walls. A window shows the night (snowing in winter), a
// bookcase stands in the corner, candles burn on the shelf and a cat sleeps
// on the rug. Stockings hang in December; in October jack-o'-lanterns grin
// on the hearth and the cat is black (from env.now). Upright phones get a
// taller fireplace with a little moonlit painting above the screen.
//
// Cheap: the room is painted once per resize. The fire is a few flame
// tongues baked once into sprites, then only picked and nudged at 12 fps;
// the light it throws is one baked glow whose alpha follows the flames.
// Without frame motion (Low) the fire holds one still frame.

(() => {
    'use strict';

    const STEP = 83;                                   // the fire's 12 fps
    const CHANGE_MS = 900, PAUSE_MS = 600, PLAY_MS = 450;
    // Hardwood's heating curve (the fireplace wallpaper's), coolest first.
    const HEAT = [[0, 18, 4, 2], [0.16, 84, 14, 4], [0.32, 166, 40, 8], [0.5, 224, 92, 14], [0.68, 252, 152, 32], [0.85, 255, 208, 104], [1, 255, 246, 210]];

    // A tiny seeded random, so the room is the same on every repaint.
    const seeded = seed => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // A stable hash in 0..1: the same 83 ms slice always flickers the same
    // way, however often the overlay is redrawn within it.
    const hash = (a, b) => {
        let x = Math.imul(a ^ 0x2c1b3c6d, 0x297a2d39) ^ Math.imul(b + 0x632be5ab, 0x85ebca6b);
        x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d); x ^= x >>> 12;
        return (x >>> 0) / 4294967296;
    };
    const ease = q => (q < 0.5 ? 2 * q * q : 1 - (-2 * q + 2) ** 2 / 2);
    const clamp01 = q => Math.max(0, Math.min(1, q));

    function heat(t) {
        for (let i = 1; i < HEAT.length; i++) {
            if (t <= HEAT[i][0] || i === HEAT.length - 1) {
                const lo = HEAT[i - 1], hi = HEAT[i], k = clamp01((t - lo[0]) / (hi[0] - lo[0]));
                return [1, 2, 3].map(j => Math.round(lo[j] + (hi[j] - lo[j]) * k));
            }
        }
        return HEAT[0].slice(1);
    }

    // An offscreen canvas of w × h CSS px at the given pixel ratio.
    function bake(w, h, dpr, draw) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.ceil(w * dpr));
        canvas.height = Math.max(1, Math.ceil(h * dpr));
        const c = canvas.getContext('2d');
        c.scale(dpr, dpr);
        draw(c);
        return canvas;
    }

    // A soft round glow, white-hot to clear, baked once per colour.
    const glows = new Map();
    function glow(rgb) {
        if (!glows.has(rgb)) glows.set(rgb, bake(64, 64, 1, c => {
            const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
            g.addColorStop(0, `rgba(${rgb}, 1)`);
            g.addColorStop(0.3, `rgba(${rgb}, 0.45)`);
            g.addColorStop(1, `rgba(${rgb}, 0)`);
            c.fillStyle = g;
            c.fillRect(0, 0, 64, 64);
        }));
        return glows.get(rgb);
    }

    // Flame tongues: soft blobs along a wavering column, hot at the root and
    // red at the tip, drawn small and added together. Scaled up when drawn,
    // smoothing turns them gassy, as the fireplace wallpaper's buffers do.
    let tongues = null;
    function flames() {
        if (tongues) return tongues;
        const random = seeded(4242);
        tongues = Array.from({ length: 10 }, () => bake(36, 90, 1, c => {
            c.globalCompositeOperation = 'lighter';
            const lean = (random() - 0.5) * 14, wobble = 2 + random() * 4, phase = random() * 6, reach = 0.7 + random() * 0.3;
            for (let i = 0; i < 30; i++) {
                const k = i / 29;
                const y = 84 - k * 78 * reach, x = 18 + lean * k * k + Math.sin(k * 6 + phase) * wobble * k;
                const r = 12.5 * (1 - k * 0.82) * (0.85 + random() * 0.3);
                const [R, G, B] = heat(0.98 - k * 0.78);
                const g = c.createRadialGradient(x, y, 0, x, y, r);
                g.addColorStop(0, `rgba(${R}, ${G}, ${B}, ${0.42 * (1 - k * 0.55)})`);
                g.addColorStop(0.5, `rgba(${R}, ${G}, ${B}, ${0.16 * (1 - k * 0.5)})`);
                g.addColorStop(1, `rgba(${R}, ${G}, ${B}, 0)`);
                c.fillStyle = g;
                c.fillRect(x - r, y - r, r * 2, r * 2);
            }
        }));
        return tongues;
    }

    // A candle's flame: a small teardrop, yellow-white in the middle.
    let candleFlame = null;
    function candle() {
        return candleFlame ||= bake(12, 26, 4, c => {
            const g = c.createRadialGradient(6, 18, 0, 6, 16, 10);
            g.addColorStop(0, 'rgba(255, 252, 230, 1)');
            g.addColorStop(0.35, 'rgba(255, 214, 120, 0.95)');
            g.addColorStop(0.8, 'rgba(255, 140, 40, 0.5)');
            g.addColorStop(1, 'rgba(255, 120, 30, 0)');
            c.fillStyle = g;
            c.beginPath();
            c.moveTo(6, 1);
            c.bezierCurveTo(9, 9, 11.5, 15, 11, 19);
            c.bezierCurveTo(10.5, 24, 1.5, 24, 1, 19);
            c.bezierCurveTo(0.5, 15, 3, 9, 6, 1);
            c.fill();
        });
    }

    // ---- Layout ------------------------------------------------------------------

    function layout(w, h, aspect, env) {
        const portrait = h > w * 1.1;
        const floor = h - env.insets.bottom - Math.max(18, h * (portrait ? 0.09 : 0.1));
        const top = h * 0.05;
        // Everything scales from the screen's height S; find the S that fits.
        const sizes = S => {
            const W = S * aspect, b = Math.max(7, Math.min(W, S) * 0.06);
            const fw = Math.min(w * (portrait ? 0.94 : 0.9), Math.max(W + b * 2 + S * (portrait ? 0 : 0.32), S * 1.2));
            return { S, W, b, fw, gap: S * (portrait ? 0.3 : 0.06), shelf: Math.max(8, fw * 0.028),
                fire: portrait ? fw * 0.62 : S * 0.5, hearth: Math.max(6, fw * 0.03) };
        };
        const tall = z => z.b * 2 + z.S + z.gap + z.shelf + z.fire + z.hearth;
        let S = (portrait ? w * 0.84 : w * 0.58) / aspect;
        for (let i = 0; i < 4; i++) {
            const z = sizes(S), room = floor - top;
            if (tall(z) > room) S *= room / tall(z);
            if (!portrait && z.fw >= w * 0.9 - 0.5) S *= 0.97;   // too wide: give the sides some room
        }
        const z = sizes(S), cx = w / 2;
        const hearthTop = floor - z.hearth;
        const surround = { x: cx - z.fw / 2, y: hearthTop - z.fire, w: z.fw, h: z.fire };
        const shelfW = Math.min(w * 0.99, z.fw * 1.08);
        const shelf = { x: cx - shelfW / 2, y: surround.y - z.shelf, w: shelfW, h: z.shelf };
        const frame = { x: cx - z.W / 2 - z.b, y: shelf.y - z.gap - z.S - z.b * 2, w: z.W + z.b * 2, h: z.S + z.b * 2, b: z.b };
        const screen = { x: frame.x + z.b, y: frame.y + z.b, w: z.W, h: z.S, radius: 2 };
        const oh = z.fire * 0.74, ow = Math.min(z.fw * (portrait ? 0.58 : 0.44), oh * 1.9);
        const opening = { x: cx - ow / 2, y: hearthTop - oh, w: ow, h: oh, arch: oh * 0.2 };
        const fire = { x: cx, y: hearthTop - oh * 0.11, w: Math.min(ow * 0.66, oh * 1.3), h: oh * 0.8 };
        const visible = h - env.insets.bottom - floor;
        const rug = { x: cx, y: floor + visible * 0.55, rx: Math.min(w * 0.48, z.fw * 0.6), ry: Math.max(8, visible * 0.4) };
        const catSize = Math.min(visible * 0.7, z.fw * 0.08, 64);
        const L = { portrait, floor, hearthTop, surround, shelf, frame, screen, opening, fire, rug, visible,
            cat: { x: cx + z.fw * 0.34, y: rug.y + catSize * 0.2, s: catSize }, rail: surround.y + z.fire * 0.42 };
        // Candles on the shelf's ends, short enough to clear the frame above.
        const room = shelf.y - (frame.y + frame.h);
        const overlaps = x => x > frame.x - 4 && x < frame.x + frame.w + 4;
        const unit = Math.min(S * 0.2, Math.max(14, shelf.w * 0.04));
        const tallest = x => (overlaps(x) ? room * 0.85 : unit * 1.5);
        const lx = shelf.x + shelf.w * 0.05, rx = shelf.x + shelf.w * 0.95;
        L.candles = [
            { x: lx, w: unit * 0.5, h: Math.min(unit * 1.0, tallest(lx)) },
            { x: lx + unit * 0.65, w: unit * 0.42, h: Math.min(unit * 0.66, tallest(lx + unit * 0.65)) },
            { x: rx, w: unit * 0.3, h: Math.min(unit * 1.3, tallest(rx)), stick: true },
        ];
        L.unit = unit;
        // What the overlay lights, found once here rather than every frame.
        L.wicks = wicks(L);
        L.pumpkins = pumpkins(L);
        L.lights = garlandLights(L);
        // The sides of the room, when there's room: a window and a bookcase.
        const side = shelf.x;
        if (!portrait && side > 80) {
            const ww = Math.min(side * 0.58, S * 0.5);
            L.window = { x: side / 2 - ww / 2, y: frame.y, w: ww, h: L.rail - frame.y };
            const bw = Math.min(side * 0.66, S * 0.62);
            const by = Math.max(frame.y, h * 0.12);
            L.bookcase = { x: w - side / 2 - bw / 2, y: by, w: bw, h: floor - by };
        }
        if (portrait && frame.y - top > 90) {
            const pw = Math.min(z.W * 0.5, (frame.y - top) * 1.1), ph = pw * 0.66;
            L.painting = { x: cx - pw / 2, y: top + (frame.y - top - ph) / 2, w: pw, h: ph };
        }
        return L;
    }

    // ---- The still room ------------------------------------------------------------

    function wall(ctx, L, w, h) {
        const paper = ctx.createLinearGradient(0, 0, 0, L.floor);
        paper.addColorStop(0, '#0f1a14');
        paper.addColorStop(1, '#1a2a20');
        ctx.fillStyle = paper;
        ctx.fillRect(0, 0, w, L.floor);
        // Damask: a small motif on a lattice, as a pattern tile.
        const tile = bake(44, 60, 1, c => {
            c.fillStyle = 'rgba(196, 214, 160, 0.06)';
            for (const [x, y] of [[22, 30], [0, 0], [44, 0], [0, 60], [44, 60]]) {
                c.beginPath();
                c.moveTo(x, y - 13); c.quadraticCurveTo(x + 9, y - 3, x, y + 13); c.quadraticCurveTo(x - 9, y - 3, x, y - 13);
                c.fill();
                c.beginPath(); c.arc(x, y - 16, 1.6, 0, 7); c.fill();
            }
            c.fillStyle = 'rgba(196, 214, 160, 0.035)';
            for (const [x, y] of [[0, 30], [44, 30], [22, 0], [22, 60]]) { c.beginPath(); c.arc(x, y, 2.4, 0, 7); c.fill(); }
        });
        ctx.fillStyle = ctx.createPattern(tile, 'repeat');
        ctx.fillRect(0, 0, w, L.rail);
        // Picture rail and crown moulding.
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fillRect(0, 0, w, Math.max(6, h * 0.012));
        ctx.fillStyle = 'rgba(214, 196, 160, 0.10)';
        ctx.fillRect(0, Math.max(6, h * 0.012), w, 2);
        // Wainscot under a chair rail: panels with a highlight and a shadow edge.
        ctx.fillStyle = '#122019';
        ctx.fillRect(0, L.rail, w, L.floor - L.rail);
        const ph = L.floor - L.rail, pw = Math.max(60, ph * 0.9), inset = Math.max(5, ph * 0.12);
        for (let x = -((w / 2) % pw); x < w; x += pw) {
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
            ctx.lineWidth = 2;
            ctx.strokeRect(x + inset, L.rail + inset, pw - inset * 2, ph - inset * 2.4);
            ctx.strokeStyle = 'rgba(200, 220, 180, 0.05)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x + inset + 2, L.rail + inset + 2, pw - inset * 2, ph - inset * 2.4);
        }
        ctx.fillStyle = '#26382c';
        ctx.fillRect(0, L.rail - 3, w, 6);
        ctx.fillStyle = 'rgba(230, 220, 190, 0.08)';
        ctx.fillRect(0, L.rail - 3, w, 1.5);
        ctx.fillStyle = '#0b120e';
        ctx.fillRect(0, L.floor - Math.max(6, ph * 0.08), w, Math.max(6, ph * 0.08));
        // The floorboards, warmer near the hearth.
        const boards = ctx.createLinearGradient(0, L.floor, 0, h);
        boards.addColorStop(0, '#3b2516');
        boards.addColorStop(1, '#170d07');
        ctx.fillStyle = boards;
        ctx.fillRect(0, L.floor, w, h - L.floor);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.lineWidth = 1;
        for (let y = L.floor + 5, i = 0; y < h; y += 5 + i * 2.5, i++) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }
    }

    // The rug in front of the hearth: a red oval with a gold border.
    function rug(ctx, { x, y, rx, ry }) {
        const rings = [['#2a0c0a', 1], ['#7a2a1c', 0.96], ['#b8893e', 0.84], ['#5d1914', 0.8], ['#3a100d', 0.56], ['#a7783a', 0.3], ['#5d1914', 0.24]];
        for (const [color, k] of rings) {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.ellipse(x, y, rx * k, ry * k, 0, 0, 7);
            ctx.fill();
        }
        // Little gold diamonds round the border.
        ctx.fillStyle = 'rgba(214, 170, 90, 0.55)';
        for (let i = 0; i < 28; i++) {
            const a = (i / 28) * Math.PI * 2, px = x + Math.cos(a) * rx * 0.9, py = y + Math.sin(a) * ry * 0.9, s = Math.max(1.5, ry * 0.05);
            ctx.beginPath(); ctx.moveTo(px, py - s); ctx.lineTo(px + s * 1.6, py); ctx.lineTo(px, py + s); ctx.lineTo(px - s * 1.6, py); ctx.fill();
        }
    }

    function windowArt(ctx, win, random, month) {
        const { x, y, w, h } = win;
        const f = Math.max(5, w * 0.07);
        const glass = { x: x + f, y: y + f, w: w - f * 2, h: h - f * 2 };
        const sky = ctx.createLinearGradient(0, glass.y, 0, glass.y + glass.h);
        sky.addColorStop(0, '#07122a');
        sky.addColorStop(0.75, '#1a2d52');
        sky.addColorStop(1, '#2a3c5c');
        ctx.fillStyle = sky;
        ctx.fillRect(glass.x, glass.y, glass.w, glass.h);
        ctx.save();
        ctx.beginPath();
        ctx.rect(glass.x, glass.y, glass.w, glass.h);
        ctx.clip();
        ctx.fillStyle = '#e8eefc';
        for (let i = 0; i < glass.w * glass.h / 700; i++) {
            ctx.globalAlpha = 0.25 + random() * 0.6;
            ctx.fillRect(glass.x + random() * glass.w, glass.y + random() * glass.h * 0.7, 1.2, 1.2);
        }
        ctx.globalAlpha = 1;
        // The moon, a crescent, in its own glow.
        const mx = glass.x + glass.w * 0.68, my = glass.y + glass.h * 0.2, mr = Math.max(5, glass.w * 0.11);
        ctx.globalAlpha = 0.35;
        ctx.drawImage(glow('190, 205, 255'), mx - mr * 4, my - mr * 4, mr * 8, mr * 8);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#f3efdc';
        ctx.beginPath(); ctx.arc(mx, my, mr, 0, 7); ctx.fill();
        ctx.fillStyle = '#0c1834';
        ctx.beginPath(); ctx.arc(mx + mr * 0.45, my - mr * 0.25, mr * 0.9, 0, 7); ctx.fill();
        // Hills and pines; snowy in winter.
        const winter = month === 11 || month <= 1;
        ctx.fillStyle = winter ? '#8f9fbd' : '#0b1424';
        ctx.beginPath();
        ctx.moveTo(glass.x, glass.y + glass.h);
        for (let i = 0; i <= 10; i++) ctx.lineTo(glass.x + (glass.w * i) / 10, glass.y + glass.h * (0.8 - Math.sin(i * 0.7 + 1) * 0.06));
        ctx.lineTo(glass.x + glass.w, glass.y + glass.h);
        ctx.fill();
        ctx.fillStyle = '#060b14';
        for (let i = 0; i < 5; i++) {
            const tx = glass.x + glass.w * (0.08 + i * 0.21 + random() * 0.05), th = glass.h * (0.12 + random() * 0.1), base = glass.y + glass.h * 0.86;
            ctx.beginPath(); ctx.moveTo(tx, base - th); ctx.lineTo(tx + th * 0.28, base); ctx.lineTo(tx - th * 0.28, base); ctx.fill();
        }
        ctx.restore();
        // The frame and glazing bars.
        ctx.strokeStyle = '#4b4134';
        ctx.lineWidth = f;
        ctx.strokeRect(x + f / 2, y + f / 2, w - f, h - f);
        ctx.lineWidth = Math.max(2, f * 0.4);
        ctx.beginPath();
        ctx.moveTo(x + w / 2, glass.y); ctx.lineTo(x + w / 2, glass.y + glass.h);
        for (const k of [1 / 3, 2 / 3]) { ctx.moveTo(glass.x, glass.y + glass.h * k); ctx.lineTo(glass.x + glass.w, glass.y + glass.h * k); }
        ctx.stroke();
        // The sill, with snow on it in winter.
        ctx.fillStyle = '#5a4e3e';
        ctx.fillRect(x - f * 0.6, y + h - f * 0.3, w + f * 1.2, f * 0.9);
        if (winter) {
            ctx.fillStyle = 'rgba(225, 232, 248, 0.75)';
            ctx.beginPath();
            ctx.ellipse(x + w / 2, glass.y + glass.h, glass.w * 0.5, Math.max(2, f * 0.5), 0, Math.PI, 0);
            ctx.fill();
        }
        // Heavy curtains, tied back, and their rod.
        for (const dir of [-1, 1]) {
            const cw = w * 0.32, cx = dir < 0 ? x - cw * 0.45 : x + w - cw * 0.55;
            const drape = ctx.createLinearGradient(cx, 0, cx + cw, 0);
            for (let i = 0; i <= 8; i++) drape.addColorStop(i / 8, ['#2e1d0a', '#55381a', '#6a4820', '#4a3012'][i % 4]);
            ctx.fillStyle = drape;
            ctx.beginPath();
            ctx.moveTo(cx, y - f);
            ctx.lineTo(cx + cw, y - f);
            ctx.quadraticCurveTo(cx + cw * (dir < 0 ? 0.55 : 0.45), y + h * 0.55, cx + cw, y + h + f * 1.5);
            ctx.lineTo(cx, y + h + f * 1.5);
            ctx.fill();
        }
        ctx.fillStyle = '#7a6338';
        ctx.fillRect(x - w * 0.3, y - f * 1.4, w * 1.6, Math.max(3, f * 0.5));
    }

    function bookcase(ctx, b, random) {
        const side = Math.max(5, b.w * 0.06);
        ctx.fillStyle = '#1e130b';
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.fillStyle = '#2d1d11';
        ctx.fillRect(b.x, b.y, side, b.h);
        ctx.fillRect(b.x + b.w - side, b.y, side, b.h);
        ctx.fillRect(b.x - side * 0.4, b.y - side, b.w + side * 0.8, side * 1.2);
        const shelves = Math.max(3, Math.min(6, Math.round(b.h / Math.max(46, b.w * 0.55))));
        const gap = (b.h - side * 2) / shelves;
        const colors = ['#6b1f1d', '#1f3550', '#2d4a2b', '#8a6a2a', '#cbb991', '#4a2a44', '#7a3a1a', '#24413f'];
        for (let s = 0; s < shelves; s++) {
            const floorY = b.y + side + gap * (s + 1);
            ctx.fillStyle = '#120b06';
            ctx.fillRect(b.x + side, floorY - gap, b.w - side * 2, gap);
            let x = b.x + side + 2;
            const end = b.x + b.w - side - 2;
            while (x < end - 4) {
                if (random() < 0.12) { x += 4 + random() * 10; continue; }
                const bw = Math.min(end - x, 3 + random() * b.w * 0.08), bh = gap * (0.55 + random() * 0.35);
                const lean = random() < 0.08 && x + bh * 0.5 < end;
                ctx.save();
                ctx.translate(x, floorY - 2);
                if (lean) ctx.rotate(0.35);
                ctx.fillStyle = colors[(random() * colors.length) | 0];
                ctx.fillRect(0, -bh, bw, bh);
                ctx.fillStyle = 'rgba(230, 200, 140, 0.35)';
                ctx.fillRect(0, -bh * 0.8, bw, 1);
                ctx.fillRect(0, -bh * 0.25, bw, 1);
                ctx.restore();
                x += lean ? bh * 0.4 + bw : bw + 0.5;
            }
            ctx.fillStyle = '#3a2615';
            ctx.fillRect(b.x + side, floorY - 2, b.w - side * 2, 3);
        }
        // A trailing plant on top.
        const px = b.x + b.w * 0.7, py = b.y - side, pot = Math.max(6, b.w * 0.14);
        ctx.fillStyle = '#7a4a2a';
        ctx.fillRect(px - pot / 2, py - pot, pot, pot);
        ctx.strokeStyle = '#2f4f2a';
        ctx.lineWidth = 1.4;
        ctx.fillStyle = '#3d6b34';
        for (let i = 0; i < 6; i++) {
            const dx = (i - 2.5) * pot * 0.35, len = pot * (1.2 + random() * 2.4);
            ctx.beginPath(); ctx.moveTo(px, py - pot); ctx.quadraticCurveTo(px + dx * 2, py - pot, px + dx * 2.4, py - pot + len); ctx.stroke();
            for (let k = 0.3; k < 1; k += 0.25) { ctx.beginPath(); ctx.ellipse(px + dx * 2.4 * k, py - pot + len * k * k, 2.6, 1.6, k, 0, 7); ctx.fill(); }
        }
        // Shade: the corner is far from the fire.
        const shade = ctx.createLinearGradient(b.x, 0, b.x + b.w, 0);
        shade.addColorStop(0, 'rgba(0, 0, 0, 0.1)');
        shade.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
        ctx.fillStyle = shade;
        ctx.fillRect(b.x - side, b.y - side * 3, b.w + side * 2, b.h + side * 3);
    }

    // The little painting above the screen on upright phones: moonlit hills.
    function painting(ctx, p) {
        const f = Math.max(4, p.w * 0.07);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fillRect(p.x + 3, p.y + 4, p.w, p.h);
        ctx.fillStyle = '#8a6a32';
        ctx.fillRect(p.x, p.y, p.w, p.h);
        const sky = ctx.createLinearGradient(0, p.y + f, 0, p.y + p.h - f);
        sky.addColorStop(0, '#1d2a4a');
        sky.addColorStop(1, '#5a5a6a');
        ctx.fillStyle = sky;
        ctx.fillRect(p.x + f, p.y + f, p.w - f * 2, p.h - f * 2);
        ctx.fillStyle = '#efe6c8';
        ctx.beginPath(); ctx.arc(p.x + p.w * 0.7, p.y + p.h * 0.36, p.h * 0.09, 0, 7); ctx.fill();
        ctx.fillStyle = '#2a3346';
        ctx.beginPath();
        ctx.moveTo(p.x + f, p.y + p.h - f);
        ctx.lineTo(p.x + f, p.y + p.h * 0.62); ctx.lineTo(p.x + p.w * 0.35, p.y + p.h * 0.45); ctx.lineTo(p.x + p.w * 0.6, p.y + p.h * 0.66); ctx.lineTo(p.x + p.w - f, p.y + p.h * 0.55);
        ctx.lineTo(p.x + p.w - f, p.y + p.h - f);
        ctx.fill();
        ctx.fillStyle = '#161c28';
        ctx.fillRect(p.x + f, p.y + p.h * 0.78, p.w - f * 2, p.h * 0.22 - f);
        // A few stars, and a cottage with its window lit.
        ctx.fillStyle = 'rgba(240, 236, 210, 0.8)';
        for (const [sx, sy] of [[0.2, 0.25], [0.32, 0.18], [0.46, 0.3], [0.85, 0.2], [0.58, 0.16], [0.14, 0.4]]) ctx.fillRect(p.x + p.w * sx, p.y + p.h * sy, 1.2, 1.2);
        const hx = p.x + p.w * 0.3, hy = p.y + p.h * 0.78, hs = p.h * 0.09;
        ctx.fillStyle = '#10141e';
        ctx.fillRect(hx - hs, hy - hs, hs * 2, hs);
        ctx.beginPath(); ctx.moveTo(hx - hs * 1.25, hy - hs); ctx.lineTo(hx, hy - hs * 1.9); ctx.lineTo(hx + hs * 1.25, hy - hs); ctx.fill();
        ctx.fillStyle = '#f2c060';
        ctx.fillRect(hx + hs * 0.25, hy - hs * 0.7, hs * 0.45, hs * 0.4);
        ctx.strokeStyle = 'rgba(255, 230, 170, 0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(p.x + f - 0.5, p.y + f - 0.5, p.w - f * 2 + 1, p.h - f * 2 + 1);
    }

    // The fireplace: a cream surround with fluted pilasters, a brick firebox
    // with an arched top, an iron grate and the back log, a slate hearth.
    function fireplace(ctx, L, random) {
        const s = L.surround, o = L.opening;
        // Hearth slab.
        const hw = s.w * 1.06;
        ctx.fillStyle = '#2b2a28';
        ctx.fillRect(s.x - (hw - s.w) / 2, L.hearthTop, hw, L.floor - L.hearthTop);
        ctx.fillStyle = 'rgba(255, 220, 180, 0.12)';
        ctx.fillRect(s.x - (hw - s.w) / 2, L.hearthTop, hw, 1.5);
        // The surround.
        const paint = ctx.createLinearGradient(0, s.y, 0, s.y + s.h);
        paint.addColorStop(0, '#5c5446');
        paint.addColorStop(1, '#8a7b62');
        ctx.fillStyle = paint;
        ctx.fillRect(s.x, s.y, s.w, s.h);
        // Fluted pilasters with little capitals, either side.
        const pil = Math.max(10, Math.min((s.w - o.w) * 0.12, s.w * 0.05)), frieze = s.y + s.h * 0.17;
        for (const px of [s.x + pil * 0.6, s.x + s.w - pil * 1.6]) {
            ctx.fillStyle = 'rgba(255, 240, 210, 0.07)';
            ctx.fillRect(px, frieze, pil, L.hearthTop - frieze);
            ctx.strokeStyle = 'rgba(30, 22, 14, 0.3)';
            ctx.lineWidth = 1;
            for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(px + (pil * k) / 4, frieze + pil * 0.8); ctx.lineTo(px + (pil * k) / 4, L.hearthTop - pil * 0.6); ctx.stroke(); }
            ctx.fillStyle = 'rgba(255, 240, 210, 0.1)';
            ctx.fillRect(px - pil * 0.2, frieze, pil * 1.4, pil * 0.4);
            ctx.fillRect(px - pil * 0.15, L.hearthTop - pil * 0.4, pil * 1.3, pil * 0.4);
        }
        // The frieze, with a raised tablet in the middle.
        ctx.fillStyle = 'rgba(30, 22, 14, 0.25)';
        ctx.fillRect(s.x, frieze, s.w, 2);
        const tw = Math.min(o.w * 0.5, s.w * 0.2), th = s.h * 0.1;
        ctx.fillStyle = 'rgba(255, 240, 210, 0.08)';
        ctx.fillRect(s.x + (s.w - tw) / 2, s.y + s.h * 0.035, tw, th);
        ctx.fillStyle = 'rgba(30, 22, 14, 0.3)';
        ctx.fillRect(s.x + (s.w - tw) / 2, s.y + s.h * 0.035 + th, tw, 1.5);
        // The firebox: black-edged arch, brick inside, soot above.
        const arch = c => {
            c.beginPath();
            c.moveTo(o.x, o.y + o.h);
            c.lineTo(o.x, o.y + o.arch);
            c.ellipse(o.x + o.w / 2, o.y + o.arch, o.w / 2, o.arch, 0, Math.PI, 0);
            c.lineTo(o.x + o.w, o.y + o.h);
            c.closePath();
        };
        ctx.save();
        ctx.lineWidth = Math.max(4, o.w * 0.03);
        ctx.strokeStyle = '#1b1714';
        arch(ctx);
        ctx.stroke();
        arch(ctx);
        ctx.clip();
        ctx.fillStyle = '#3a1810';
        ctx.fillRect(o.x, o.y, o.w, o.h);
        const bh = Math.max(4, o.h * 0.07), bw = bh * 2.6;
        ctx.fillStyle = '#4e2216';
        for (let row = 0, y = o.y + o.h - bh; y > o.y - bh; row++, y -= bh) {
            for (let x = o.x - (row % 2) * bw * 0.5; x < o.x + o.w; x += bw) {
                ctx.globalAlpha = 0.5 + random() * 0.5;
                ctx.fillRect(x + 1, y + 1, bw - 2, bh - 2);
            }
        }
        ctx.globalAlpha = 1;
        // Cheeks splaying in, for depth; soot from the top.
        ctx.fillStyle = 'rgba(10, 5, 3, 0.55)';
        for (const dir of [0, 1]) {
            const x0 = dir ? o.x + o.w : o.x, x1 = dir ? o.x + o.w * 0.86 : o.x + o.w * 0.14;
            ctx.beginPath(); ctx.moveTo(x0, o.y); ctx.lineTo(x1, o.y + o.arch * 1.5); ctx.lineTo(x1, o.y + o.h * 0.9); ctx.lineTo(x0, o.y + o.h); ctx.fill();
        }
        const soot = ctx.createLinearGradient(0, o.y, 0, o.y + o.h);
        soot.addColorStop(0, 'rgba(5, 3, 2, 0.97)');
        soot.addColorStop(0.55, 'rgba(5, 3, 2, 0.6)');
        soot.addColorStop(1, 'rgba(5, 3, 2, 0.15)');
        ctx.fillStyle = soot;
        ctx.fillRect(o.x, o.y, o.w, o.h);
        // Firelight on the back wall.
        const lit = ctx.createRadialGradient(L.fire.x, L.fire.y, 0, L.fire.x, L.fire.y, o.w * 0.6);
        lit.addColorStop(0, 'rgba(255, 130, 40, 0.5)');
        lit.addColorStop(1, 'rgba(255, 100, 30, 0)');
        ctx.fillStyle = lit;
        ctx.fillRect(o.x, o.y, o.w, o.h);
        // The back log and the grate.
        const f = L.fire;
        log(ctx, f.x - f.w * 0.42, f.y - f.h * 0.1, f.w * 0.84, Math.max(5, f.h * 0.15), -0.04);
        ctx.fillStyle = '#121010';
        ctx.fillRect(f.x - f.w * 0.55, f.y + f.h * 0.04, f.w * 1.1, Math.max(3, f.h * 0.05));
        for (let i = 0; i < 6; i++) ctx.fillRect(f.x - f.w * 0.5 + (i * f.w) / 5 - 1.5, f.y - f.h * 0.06, 3, f.h * 0.12);
        ctx.restore();
        // The surround's own light: warm round the opening, dark away from it.
        const shade = ctx.createRadialGradient(L.fire.x, L.fire.y, o.w * 0.3, L.fire.x, L.fire.y, s.w * 0.8);
        shade.addColorStop(0, 'rgba(255, 150, 70, 0.22)');
        shade.addColorStop(0.45, 'rgba(0, 0, 0, 0.05)');
        shade.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
        ctx.fillStyle = shade;
        ctx.fillRect(s.x, s.y, s.w, s.h);
        // Firelight spilling out across the hearth.
        const spill = ctx.createRadialGradient(L.fire.x, L.hearthTop, 0, L.fire.x, L.hearthTop, o.w * 0.9);
        spill.addColorStop(0, 'rgba(255, 150, 70, 0.35)');
        spill.addColorStop(1, 'rgba(255, 150, 70, 0)');
        ctx.fillStyle = spill;
        ctx.fillRect(s.x - s.w * 0.05, L.hearthTop, s.w * 1.1, L.floor - L.hearthTop);
        // The shelf: a thick board with a lit top edge and a moulding under it.
        const sh = L.shelf;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fillRect(sh.x + 4, sh.y + sh.h, sh.w - 8, Math.max(3, sh.h * 0.5));
        ctx.fillStyle = '#7e735e';
        ctx.fillRect(sh.x, sh.y, sh.w, sh.h);
        ctx.fillStyle = '#a89a7c';
        ctx.fillRect(sh.x, sh.y, sh.w, Math.max(2, sh.h * 0.25));
        ctx.fillStyle = '#5a5140';
        ctx.fillRect(sh.x + sh.h * 0.4, sh.y + sh.h, sh.w - sh.h * 0.8, Math.max(3, sh.h * 0.4));
    }

    // A log: bark, a cut end with rings.
    function log(c, x, y, w, h, tilt) {
        c.save();
        c.translate(x, y);
        c.rotate(tilt);
        const bark = c.createLinearGradient(0, -h / 2, 0, h / 2);
        bark.addColorStop(0, '#3a2516');
        bark.addColorStop(0.5, '#24160c');
        bark.addColorStop(1, '#5a2a10');
        c.fillStyle = bark;
        JellyfinFrames.roundRect(c, 0, -h / 2, w, h, h / 2);
        c.fill();
        c.strokeStyle = 'rgba(0, 0, 0, 0.35)';
        c.lineWidth = 1;
        for (let i = 1; i < 5; i++) { c.beginPath(); c.moveTo(w * (i / 5) - h, -h * 0.3); c.lineTo(w * (i / 5) + h * 0.6, -h * 0.25); c.stroke(); }
        c.fillStyle = '#8a6a44';
        c.beginPath(); c.ellipse(w - h * 0.25, 0, h * 0.28, h * 0.48, 0, 0, 7); c.fill();
        c.strokeStyle = 'rgba(60, 36, 18, 0.6)';
        c.beginPath(); c.ellipse(w - h * 0.25, 0, h * 0.14, h * 0.26, 0, 0, 7); c.stroke();
        c.restore();
    }

    // The framed screen: walnut moulding with a gold lip, hung clear of the wall.
    function frameArt(ctx, L) {
        const f = L.frame, b = f.b;
        for (let i = 3; i > 0; i--) {
            ctx.fillStyle = `rgba(0, 0, 0, ${0.12 * (4 - i) / 3})`;
            ctx.fillRect(f.x + i * 2, f.y + i * 3, f.w + i * 1.5, f.h + i * 1.5);
        }
        const wood = ctx.createLinearGradient(f.x, f.y, f.x + f.w * 0.3, f.y + f.h);
        wood.addColorStop(0, '#5a3820');
        wood.addColorStop(1, '#2b180c');
        ctx.fillStyle = wood;
        ctx.fillRect(f.x, f.y, f.w, f.h);
        // Bevels: light on the top and left, dark on the bottom and right.
        ctx.fillStyle = 'rgba(255, 220, 170, 0.12)';
        ctx.fillRect(f.x, f.y, f.w, b * 0.18);
        ctx.fillRect(f.x, f.y, b * 0.18, f.h);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(f.x, f.y + f.h - b * 0.18, f.w, b * 0.18);
        ctx.fillRect(f.x + f.w - b * 0.18, f.y, b * 0.18, f.h);
        // Firelight catching the bottom rail.
        const lit = ctx.createLinearGradient(0, f.y + f.h - b, 0, f.y + f.h);
        lit.addColorStop(0, 'rgba(255, 160, 80, 0)');
        lit.addColorStop(1, 'rgba(255, 160, 80, 0.18)');
        ctx.fillStyle = lit;
        ctx.fillRect(f.x, f.y + f.h - b, f.w, b);
        const s = L.screen, lip = Math.max(2, b * 0.22);
        const gold = ctx.createLinearGradient(s.x, s.y, s.x + s.w, s.y + s.h);
        gold.addColorStop(0, '#d9b45c');
        gold.addColorStop(0.5, '#8a6a2a');
        gold.addColorStop(1, '#c49a48');
        ctx.fillStyle = gold;
        ctx.fillRect(s.x - lip, s.y - lip, s.w + lip * 2, s.h + lip * 2);
        JellyfinFrames.cutScreen(ctx, s);
        // Glass: the frame's shadow along the top, a faint glare.
        ctx.save();
        ctx.beginPath();
        ctx.rect(s.x, s.y, s.w, s.h);
        ctx.clip();
        const shadow = ctx.createLinearGradient(0, s.y, 0, s.y + Math.max(6, s.h * 0.03));
        shadow.addColorStop(0, 'rgba(0, 0, 0, 0.35)');
        shadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = shadow;
        ctx.fillRect(s.x, s.y, s.w, s.h * 0.03 + 6);
        const glare = ctx.createLinearGradient(s.x, s.y, s.x + s.w * 0.5, s.y + s.h * 0.6);
        glare.addColorStop(0, 'rgba(255, 240, 220, 0.06)');
        glare.addColorStop(0.5, 'rgba(255, 240, 220, 0.015)');
        glare.addColorStop(0.51, 'rgba(255, 240, 220, 0)');
        ctx.fillStyle = glare;
        ctx.fillRect(s.x, s.y, s.w, s.h);
        ctx.restore();
    }

    function candles(ctx, L) {
        const y = L.shelf.y;
        for (const c of L.candles) {
            if (c.stick) {
                // A brass candlestick with a taper.
                const base = c.w * 2.2, stem = c.h * 0.45;
                ctx.fillStyle = '#9a7a3a';
                ctx.beginPath(); ctx.ellipse(c.x, y - 1.5, base / 2, Math.max(2, base * 0.15), 0, 0, 7); ctx.fill();
                ctx.fillRect(c.x - c.w * 0.25, y - stem, c.w * 0.5, stem);
                ctx.beginPath(); ctx.ellipse(c.x, y - stem, c.w * 0.8, Math.max(1.5, c.w * 0.2), 0, 0, 7); ctx.fill();
                ctx.fillStyle = 'rgba(255, 230, 160, 0.4)';
                ctx.fillRect(c.x - c.w * 0.2, y - stem, 1.2, stem);
                taper(ctx, c.x, y - stem, c.w, c.h - stem);
            } else taper(ctx, c.x, y, c.w, c.h);
        }
    }
    function taper(ctx, x, y, w, h) {
        const wax = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
        wax.addColorStop(0, '#f2e8cf');
        wax.addColorStop(1, '#a89a7c');
        ctx.fillStyle = wax;
        ctx.fillRect(x - w / 2, y - h, w, h);
        ctx.fillStyle = 'rgba(255, 220, 150, 0.5)';
        ctx.beginPath(); ctx.ellipse(x, y - h, w / 2, Math.max(1, w * 0.12), 0, 0, 7); ctx.fill();
        ctx.strokeStyle = '#2a2018';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, y - h); ctx.lineTo(x, y - h - Math.max(2, w * 0.18)); ctx.stroke();
    }

    // Where the candle flames sit, for the overlay.
    const wicks = L => L.candles.map(c => ({ x: c.x, y: L.shelf.y - c.h - Math.max(2, c.w * 0.18), size: Math.max(6, c.w * 0.75) }));

    // A sleeping cat, curled nose to tail, facing the fire; black in October.
    function cat(ctx, { x, y, s }, black) {
        const fur = black ? '#1b1720' : '#c0702e', light = black ? '#3c3446' : '#eaa564', dark = black ? '#08060a' : '#7a3a12';
        const outline = 'rgba(0, 0, 0, 0.35)';
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.beginPath(); ctx.ellipse(x, y + s * 0.02, s * 1.05, s * 0.16, 0, 0, 7); ctx.fill();
        ctx.lineWidth = Math.max(1, s * 0.03);
        ctx.strokeStyle = outline;
        // The body: a loaf, lit on the fire's side.
        const body = ctx.createLinearGradient(x - s, 0, x + s, 0);
        body.addColorStop(0, light);
        body.addColorStop(0.6, fur);
        body.addColorStop(1, dark);
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.moveTo(x - s * 0.85, y);
        ctx.bezierCurveTo(x - s * 0.95, y - s * 0.55, x - s * 0.2, y - s * 0.78, x + s * 0.35, y - s * 0.66);
        ctx.bezierCurveTo(x + s * 0.95, y - s * 0.52, x + s * 1.02, y - s * 0.05, x + s * 0.8, y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        if (!black) {
            ctx.strokeStyle = 'rgba(122, 58, 18, 0.55)';
            ctx.lineWidth = Math.max(1, s * 0.07);
            ctx.lineCap = 'round';
            for (const k of [0, 0.22, 0.44, 0.64]) {
                ctx.beginPath(); ctx.moveTo(x + s * (k - 0.05), y - s * 0.7 + k * k * s * 0.5); ctx.lineTo(x + s * (k + 0.05), y - s * 0.42 + k * s * 0.1); ctx.stroke();
            }
        }
        // The tail, wrapped round the front, its tip under the chin.
        ctx.lineCap = 'round';
        ctx.strokeStyle = fur;
        ctx.lineWidth = s * 0.2;
        ctx.beginPath(); ctx.moveTo(x + s * 0.72, y - s * 0.1); ctx.quadraticCurveTo(x + s * 0.2, y + s * 0.06, x - s * 0.5, y - s * 0.06); ctx.stroke();
        ctx.strokeStyle = black ? '#2a2430' : dark;
        ctx.lineWidth = s * 0.17;
        ctx.beginPath(); ctx.moveTo(x - s * 0.36, y - s * 0.03); ctx.lineTo(x - s * 0.52, y - s * 0.07); ctx.stroke();
        ctx.lineCap = 'butt';
        // The head, tucked down on the fire's side, ears up.
        const hx = x - s * 0.68, hy = y - s * 0.3, hr = s * 0.33;
        const head = black ? '#241f2a' : '#d07e38';
        ctx.strokeStyle = outline;
        ctx.lineWidth = Math.max(1, s * 0.03);
        for (const [ex, tip] of [[-0.75, -0.95], [0.45, 0.65]]) {
            ctx.fillStyle = head;
            ctx.beginPath();
            ctx.moveTo(hx + ex * hr, hy - hr * 0.3);
            ctx.lineTo(hx + tip * hr, hy - hr * 1.3);
            ctx.lineTo(hx + (ex + 0.6) * hr * 0.6, hy - hr * 0.78);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = black ? '#4a2a3a' : '#e8a080';
            ctx.beginPath();
            ctx.moveTo(hx + ex * hr * 0.85, hy - hr * 0.5);
            ctx.lineTo(hx + tip * hr * 0.92, hy - hr * 1.1);
            ctx.lineTo(hx + (ex + 0.6) * hr * 0.55, hy - hr * 0.8);
            ctx.fill();
        }
        ctx.fillStyle = head;
        ctx.beginPath(); ctx.ellipse(hx, hy, hr, hr * 0.82, -0.1, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = black ? 'rgba(255, 170, 90, 0.12)' : 'rgba(255, 200, 140, 0.35)';
        ctx.beginPath(); ctx.ellipse(hx - hr * 0.2, hy + hr * 0.25, hr * 0.55, hr * 0.4, 0, 0, 7); ctx.fill();
        // Closed eyes and a little nose.
        ctx.strokeStyle = black ? 'rgba(220, 200, 120, 0.8)' : '#3a1a06';
        ctx.lineWidth = Math.max(1, s * 0.035);
        for (const dir of [-1, 1]) { ctx.beginPath(); ctx.arc(hx + dir * hr * 0.38, hy - hr * 0.02, hr * 0.17, 0.4, Math.PI - 0.4); ctx.stroke(); }
        ctx.fillStyle = black ? '#7a4a5a' : '#c45a5a';
        ctx.beginPath(); ctx.arc(hx, hy + hr * 0.25, Math.max(1, hr * 0.08), 0, 7); ctx.fill();
    }

    // ---- The season's things -------------------------------------------------------

    // December: stockings along the shelf, a garland with little lights.
    function stockings(ctx, L, random) {
        const s = L.surround, n = 3, len = (L.opening.y - s.y) + L.opening.h * 0.3, w = Math.min(len * 0.42, s.w * 0.08);
        const kinds = [['#9b1c1c', 'stripes'], ['#1f5a32', 'star'], ['#e3dccb', 'heel']];
        for (let i = 0; i < n; i++) {
            const x = s.x + s.w * (0.27 + i * 0.23), y = L.shelf.y + L.shelf.h;
            const [color, kind] = kinds[i];
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate((random() - 0.5) * 0.06);
            ctx.strokeStyle = '#d8c9a8';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(-w * 0.2, 0); ctx.lineTo(-w * 0.2, len * 0.08); ctx.stroke();
            const leg = c => {
                c.beginPath();
                c.moveTo(-w / 2, len * 0.08);
                c.lineTo(w / 2, len * 0.08);
                c.lineTo(w / 2, len * 0.72);
                c.quadraticCurveTo(w / 2, len, w * 0.1, len);
                c.lineTo(-w * 0.95, len);
                c.quadraticCurveTo(-w * 1.35, len, -w * 1.3, len * 0.84);
                c.quadraticCurveTo(-w * 1.2, len * 0.72, -w / 2, len * 0.7);
                c.closePath();
            };
            leg(ctx);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.save();
            leg(ctx);
            ctx.clip();
            if (kind === 'stripes') {
                ctx.fillStyle = '#efe7d6';
                for (let y2 = len * 0.3; y2 < len; y2 += len * 0.14) ctx.fillRect(-w * 1.5, y2, w * 2.2, len * 0.05);
            } else if (kind === 'star') {
                ctx.fillStyle = '#e8c45a';
                ctx.beginPath();
                for (let k = 0; k < 10; k++) {
                    const a = -Math.PI / 2 + (k * Math.PI) / 5, r = k % 2 ? w * 0.12 : w * 0.28;
                    ctx.lineTo(Math.cos(a) * r, len * 0.48 + Math.sin(a) * r);
                }
                ctx.fill();
            } else {
                ctx.fillStyle = '#9b1c1c';
                ctx.fillRect(-w * 1.5, len * 0.86, w * 2.2, len);
                ctx.fillRect(w * 0.15, len * 0.62, w, len);
            }
            const shade = ctx.createLinearGradient(-w * 1.3, 0, w / 2, 0);
            shade.addColorStop(0, 'rgba(0, 0, 0, 0.35)');
            shade.addColorStop(0.6, 'rgba(255, 255, 255, 0.05)');
            shade.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
            ctx.fillStyle = shade;
            ctx.fillRect(-w * 1.5, 0, w * 2.2, len);
            ctx.restore();
            // The fluffy cuff.
            ctx.fillStyle = '#f1ece2';
            JellyfinFrames.roundRect(ctx, -w * 0.62, len * 0.06, w * 1.24, len * 0.2, w * 0.15);
            ctx.fill();
            ctx.fillStyle = 'rgba(160, 150, 140, 0.35)';
            ctx.fillRect(-w * 0.6, len * 0.22, w * 1.2, len * 0.04);
            ctx.restore();
        }
    }

    // The garland's swags along the shelf front; its bulbs, for the overlay.
    function garlandPoints(L) {
        const sh = L.shelf, swags = Math.max(3, Math.round(sh.w / 140)), points = [];
        for (let i = 0; i <= swags * 12; i++) {
            const k = i / (swags * 12), local = (k * swags) % 1;
            points.push({ x: sh.x + sh.w * 0.02 + k * sh.w * 0.96, y: sh.y + sh.h * 0.6 + Math.sin(local * Math.PI) * sh.h * 1.6 });
        }
        return points;
    }
    function garland(ctx, L, random) {
        const points = garlandPoints(L), r = Math.max(3, L.shelf.h * 0.5);
        for (const p of points) {
            for (let k = 0; k < 4; k++) {
                ctx.fillStyle = ['#1f3d24', '#2c5232', '#16301b'][(random() * 3) | 0];
                ctx.beginPath();
                ctx.ellipse(p.x + (random() - 0.5) * r * 1.6, p.y + (random() - 0.5) * r, r * 0.9, r * 0.35, random() * 3, 0, 7);
                ctx.fill();
            }
            if (random() < 0.25) {
                ctx.fillStyle = '#b3242a';
                ctx.beginPath(); ctx.arc(p.x + (random() - 0.5) * r, p.y + (random() - 0.5) * r * 0.6, Math.max(1.2, r * 0.22), 0, 7); ctx.fill();
            }
        }
    }
    const garlandLights = L => garlandPoints(L).filter((p, i) => i % 3 === 1);

    // October: a carved pumpkin on the hearth, a plain one, gourds on the shelf.
    function pumpkin(ctx, x, y, r, carved) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath(); ctx.ellipse(x, y, r * 1.15, r * 0.2, 0, 0, 7); ctx.fill();
        for (const [dx, k, color] of [[-0.55, 0.62, '#b8520e'], [0.55, 0.62, '#b8520e'], [-0.25, 0.8, '#d2661a'], [0.25, 0.8, '#d2661a'], [0, 0.6, '#e07a28']]) {
            ctx.fillStyle = color;
            ctx.beginPath(); ctx.ellipse(x + dx * r, y - r * 0.78, r * k, r * 0.8, 0, 0, 7); ctx.fill();
        }
        ctx.fillStyle = '#4a3a18';
        ctx.fillRect(x - r * 0.08, y - r * 1.75, r * 0.16, r * 0.25);
        if (carved) {
            ctx.fillStyle = '#2a0f02';
            pumpkinFace(ctx, x, y, r);
        }
        // Firelight on its left.
        ctx.fillStyle = 'rgba(255, 190, 110, 0.14)';
        ctx.beginPath(); ctx.ellipse(x - r * 0.4, y - r * 0.9, r * 0.45, r * 0.6, 0, 0, 7); ctx.fill();
    }
    function pumpkinFace(ctx, x, y, r) {
        ctx.beginPath();
        for (const dir of [-1, 1]) {
            ctx.moveTo(x + dir * r * 0.42, y - r * 0.92);
            ctx.lineTo(x + dir * r * 0.18, y - r * 0.92);
            ctx.lineTo(x + dir * r * 0.3, y - r * 1.2);
            ctx.closePath();
        }
        ctx.moveTo(x - r * 0.5, y - r * 0.62);
        for (let i = 0; i <= 6; i++) ctx.lineTo(x - r * 0.5 + (i * r) / 6, y - r * (i % 2 ? 0.55 : 0.66));
        ctx.quadraticCurveTo(x, y - r * 0.12, x - r * 0.5, y - r * 0.62);
        ctx.fill();
    }
    const pumpkins = L => {
        const o = L.opening, r = Math.min((L.surround.w - o.w) * 0.16, o.h * 0.22, 40);
        return [{ x: o.x + o.w + r * 1.6, y: L.hearthTop + Math.min(r * 0.25, (L.floor - L.hearthTop) * 0.6), r, carved: true },
            { x: o.x - r * 1.3, y: L.hearthTop + Math.min(r * 0.2, (L.floor - L.hearthTop) * 0.5), r: r * 0.7, carved: false }];
    };

    function paint(ctx, L, env) {
        const { w, h } = env.viewport;
        const random = seeded(1225);
        const month = env.now.getMonth();
        wall(ctx, L, w, h);
        // The fire's steady light, baked; the overlay breathes on top of it.
        const warm = ctx.createRadialGradient(L.fire.x, L.fire.y, 0, L.fire.x, L.fire.y, Math.max(w, h) * 0.7);
        warm.addColorStop(0, 'rgba(255, 140, 60, 0.30)');
        warm.addColorStop(0.35, 'rgba(255, 120, 50, 0.10)');
        warm.addColorStop(1, 'rgba(255, 120, 50, 0)');
        ctx.fillStyle = warm;
        ctx.fillRect(0, 0, w, h);
        rug(ctx, L.rug);
        if (L.window) windowArt(ctx, L.window, random, month);
        if (L.bookcase) bookcase(ctx, L.bookcase, random);
        if (L.painting) painting(ctx, L.painting);
        fireplace(ctx, L, random);
        frameArt(ctx, L);
        candles(ctx, L);
        if (month !== 9) {
            // A little succulent in a terracotta pot by the candlestick.
            const u = Math.min(L.unit * 0.42, (L.shelf.y - L.frame.y - L.frame.h) * 0.5 || L.unit), px = L.shelf.x + L.shelf.w * 0.88, py = L.shelf.y;
            ctx.fillStyle = '#9a5a36';
            ctx.beginPath(); ctx.moveTo(px - u * 0.7, py - u); ctx.lineTo(px + u * 0.7, py - u); ctx.lineTo(px + u * 0.5, py); ctx.lineTo(px - u * 0.5, py); ctx.fill();
            ctx.fillStyle = '#b06a40';
            ctx.fillRect(px - u * 0.75, py - u * 1.08, u * 1.5, u * 0.22);
            for (const [a, k, color] of [[-2.4, 0.9, '#4f7a4a'], [-0.7, 0.9, '#4f7a4a'], [-1.95, 1.05, '#6a9a5c'], [-1.15, 1.05, '#6a9a5c'], [-1.57, 1.1, '#7fb06a']]) {
                ctx.fillStyle = color;
                ctx.beginPath(); ctx.ellipse(px + Math.cos(a) * u * 0.45, py - u * 1.1 + Math.sin(a) * u * 0.45, u * 0.45 * k, u * 0.2, a, 0, 7); ctx.fill();
            }
        }
        if (month === 9) {
            for (const p of L.pumpkins) pumpkin(ctx, p.x, p.y, p.r, p.carved);
            const g = L.shelf.x + L.shelf.w * 0.88, u = L.unit * 0.3;
            for (const [dx, r, color] of [[-1.6, 1, '#d8c27a'], [0, 1.25, '#c46a1c'], [-0.6, 0.8, '#5f7a2a']]) {
                ctx.fillStyle = color;
                ctx.beginPath(); ctx.ellipse(g + dx * u * 1.6, L.shelf.y - u * r * 0.8, u * r * 1.1, u * r * 0.8, 0, 0, 7); ctx.fill();
            }
        }
        if (month === 11) { stockings(ctx, L, random); garland(ctx, L, random); }
        cat(ctx, L.cat, month === 9);
        // The room's dark corners.
        const corners = ctx.createRadialGradient(w / 2, h * 0.6, Math.min(w, h) * 0.35, w / 2, h * 0.6, Math.hypot(w, h) * 0.62);
        corners.addColorStop(0, 'rgba(0, 0, 0, 0)');
        corners.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
        ctx.fillStyle = corners;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, w, h);
        ctx.rect(L.screen.x, L.screen.y, L.screen.w, L.screen.h);
        ctx.clip('evenodd');
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
    }

    // ---- What moves --------------------------------------------------------------

    // Per-layout sprites for the overlay: the logs in front of the flames.
    let cache = { key: '', fronts: null };
    function fronts(L, dpr) {
        const f = L.fire, key = `${f.x},${f.y},${f.w},${dpr}`;
        if (cache.key !== key) {
            const pad = f.w * 0.1;
            cache = { key, fronts: bake(f.w + pad * 2, f.h * 0.5, dpr, c => {
                const lh = Math.max(5, f.h * 0.17);
                c.translate(pad, f.h * 0.34);
                log(c, f.w * 0.02, -lh * 0.1, f.w * 0.62, lh, 0.13);
                log(c, f.w * 0.36, -lh * 0.05, f.w * 0.62, lh * 0.9, -0.1);
                // Embers glowing in the cracks underneath.
                const ember = c.createLinearGradient(0, lh * 0.2, 0, lh * 0.9);
                ember.addColorStop(0, 'rgba(255, 120, 30, 0)');
                ember.addColorStop(1, 'rgba(255, 110, 30, 0.55)');
                c.fillStyle = ember;
                c.fillRect(0, lh * 0.2, f.w, lh * 0.7);
            }), pad };
        }
        return cache;
    }

    function drawFire(ctx, L, n, flick) {
        const f = L.fire, sprites = flames();
        // The coal bed's glow, then the tongues added together.
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.45 + flick * 0.35;
        ctx.drawImage(glow('255, 110, 30'), f.x - f.w * 0.75, f.y - f.h * 0.45, f.w * 1.5, f.h * 0.9);
        const spots = [[-0.36, 0.45], [-0.22, 0.7], [-0.08, 0.92], [0.04, 1], [0.15, 0.82], [0.28, 0.66], [0.4, 0.42], [-0.02, 0.6]];
        spots.forEach(([dx, tall], i) => {
            const pick = sprites[(hash(n, i) * sprites.length) | 0];
            const sh = f.h * tall * (0.85 + hash(n, i + 20) * 0.35), sw = sh * 0.6;
            const x = f.x + dx * f.w + (hash(n, i + 40) - 0.5) * f.w * 0.05;
            ctx.globalAlpha = 0.85 + hash(n, i + 60) * 0.15;
            ctx.drawImage(pick, x - sw / 2, f.y - sh * 0.92, sw, sh);
        });
        ctx.restore();
        const dpr = ctx.getTransform().a;
        const front = fronts(L, dpr);
        ctx.drawImage(front.fronts, f.x - f.w / 2 - front.pad, f.y - f.h * 0.34, f.w + front.pad * 2, f.h * 0.5);
    }

    // Flicker in 0..1 for step n: smoothed noise, so it breathes rather than strobes.
    const flicker = n => hash(n, 1) * 0.5 + hash(n - 1, 1) * 0.3 + hash(n - 2, 1) * 0.2;

    // State between calls: the screen's dimming, sparks, snow, and whether
    // idle() drew this frame.
    let dim = { from: 0, to: 0, at: 0, ms: 1, change: false };
    let sparks = [], snow = [], lastT = 0, idling = false;

    function dimAt(t, env) {
        const q = clamp01((t - dim.at) / dim.ms);
        if (dim.change) return q >= 1 ? 0 : Math.max(dim.from * (1 - q), Math.sin(Math.PI * q));
        if (q >= 1) return env.paused ? 0.78 : dim.to;
        return dim.from + (dim.to - dim.from) * ease(q);
    }

    function sparkle(L, env) {
        const f = L.fire, count = Math.round(14 * (env.quality?.density ?? 1));
        for (let i = 0; i < count; i++) {
            sparks.push({ x: f.x + (Math.random() - 0.5) * f.w * 0.6, y: f.y - f.h * 0.2, vx: (Math.random() - 0.5) * f.w * 0.5,
                vy: -f.h * (0.8 + Math.random() * 1.1), life: 0, max: 0.6 + Math.random() * 0.8 });
        }
    }

    function updateSnow(L, env, dt) {
        const win = L.window;
        if (!win) return;
        const want = Math.round(16 * (env.quality?.density ?? 1));
        while (snow.length < want) snow.push({ x: Math.random(), y: Math.random(), v: 0.04 + Math.random() * 0.06, r: Math.random() < 0.3 ? 1.6 : 1.1, p: Math.random() * 6 });
        snow.length = want;
        for (const s of snow) {
            s.y += s.v * dt;
            s.p += dt;
            if (s.y > 1) { s.y -= 1; s.x = Math.random(); }
        }
    }

    JellyfinFrames.add({
        id: 'mantel',
        name: 'Mantel',
        icon: '🔥',
        videoFilter: 'sepia(0.1) saturate(1.05)',
        layout,
        paint,

        transition(kind, env) {
            const now = performance.now(), from = dimAt(now, env);
            // A change cuts through black, and the fire crackles (tick throws the sparks).
            if (kind === 'change') dim = { from, to: 0, at: now, ms: CHANGE_MS, change: true, sparkle: true };
            else dim = { from, to: kind === 'pause' ? 0.78 : 0, at: now, ms: kind === 'pause' ? PAUSE_MS : PLAY_MS, change: false };
            env.busy(dim.ms);
        },

        tick(ctx, t, L, env) {
            const wasIdle = idling;
            idling = false;
            const n = env.motion ? Math.floor(t / STEP) : 0;
            const flick = flicker(n);
            const dt = Math.min(0.1, Math.max(0, (t - lastT) / 1000));
            lastT = t;
            if (dim.sparkle) { dim.sparkle = false; if (env.motion) sparkle(L, env); }
            const { w, h } = env.viewport, s = L.screen;
            // The firelight breathing on the walls, everywhere but the screen.
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, 0, w, h);
            ctx.rect(s.x, s.y, s.w, s.h);
            ctx.clip('evenodd');
            ctx.globalAlpha = 0.06 + flick * 0.1;
            const R = Math.max(w, h) * 0.55;
            ctx.drawImage(glow('255, 150, 70'), L.fire.x - R, L.fire.y - R * 0.9, R * 2, R * 1.8);
            ctx.restore();
            drawFire(ctx, L, n, flick);
            // Candle flames, each on its own small flicker.
            const flame = candle();
            L.wicks.forEach((c, i) => {
                const k = 0.85 + hash(n, 90 + i) * 0.3;
                ctx.globalAlpha = 0.3;
                ctx.drawImage(glow('255, 190, 110'), c.x - c.size * 2, c.y - c.size * 2.6, c.size * 4, c.size * 4);
                ctx.globalAlpha = 1;
                ctx.drawImage(flame, c.x - c.size * 0.25, c.y - c.size * 1.05 * k, c.size * 0.5, c.size * 1.08 * k);
            });
            const month = env.now.getMonth();
            if (month === 9) {
                const p = L.pumpkins[0];
                ctx.globalAlpha = 0.65 + flick * 0.35;
                ctx.fillStyle = '#ffc24a';
                pumpkinFace(ctx, p.x, p.y, p.r);
                ctx.globalAlpha = 0.25 + flick * 0.2;
                ctx.drawImage(glow('255, 170, 60'), p.x - p.r * 1.6, p.y - p.r * 2.4, p.r * 3.2, p.r * 3.2);
                ctx.globalAlpha = 1;
            }
            if (month === 11) {
                const lights = L.lights, colors = ['255, 200, 110', '255, 120, 90', '150, 220, 140', '130, 170, 255'];
                const r = Math.max(3, L.shelf.h * 0.55), slow = Math.floor(n / 5);
                lights.forEach((p, i) => {
                    ctx.globalAlpha = 0.45 + hash(slow, i + 200) * 0.55;
                    ctx.drawImage(glow(colors[i % 4]), p.x - r, p.y - r, r * 2, r * 2);
                });
                ctx.globalAlpha = 1;
            }
            // Snow past the window in winter.
            const winter = month === 11 || month <= 1;
            if (winter && L.window && env.motion) {
                updateSnow(L, env, dt);
                const win = L.window, inset = Math.max(5, win.w * 0.07);
                ctx.save();
                ctx.beginPath();
                ctx.rect(win.x + inset, win.y + inset, win.w - inset * 2, win.h - inset * 2);
                ctx.clip();
                ctx.fillStyle = 'rgba(235, 240, 255, 0.85)';
                for (const f of snow) {
                    const x = win.x + inset + (f.x + Math.sin(f.p) * 0.03) * (win.w - inset * 2), y = win.y + inset + f.y * (win.h - inset * 2);
                    ctx.fillRect(x, y, f.r, f.r);
                }
                ctx.restore();
            }
            // Sparks from a crackle, on a change of item.
            if (sparks.length) {
                const f = L.fire;
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                for (let i = sparks.length - 1; i >= 0; i--) {
                    const p = sparks[i];
                    p.life += dt;
                    if (p.life > p.max) { sparks[i] = sparks[sparks.length - 1]; sparks.pop(); continue; }
                    p.x += p.vx * dt;
                    p.y += p.vy * dt;
                    p.vy *= 0.97;
                    if (p.y < L.opening.y + L.opening.arch) continue;
                    ctx.globalAlpha = 1 - p.life / p.max;
                    const r = Math.max(2, f.w * 0.02);
                    ctx.drawImage(glow('255, 180, 80'), p.x - r, p.y - r, r * 2, r * 2);
                }
                ctx.restore();
            }
            // The screen: dimmed for a change or a pause, the fire's reflection on dark glass.
            const d = dimAt(t, env);
            if (d > 0.001) {
                ctx.fillStyle = `rgba(9, 6, 4, ${d})`;
                ctx.fillRect(s.x, s.y, s.w, s.h);
            }
            if (wasIdle || d > 0.3) {
                ctx.save();
                ctx.beginPath();
                ctx.rect(s.x, s.y, s.w, s.h);
                ctx.clip();
                ctx.globalAlpha = (wasIdle ? 1 : d) * (0.08 + flick * 0.06);
                ctx.drawImage(glow('255, 150, 70'), s.x + s.w * 0.2, s.y + s.h * 0.75, s.w * 0.6, s.h * 0.5);
                ctx.restore();
                ctx.globalAlpha = 1;
            }
            const busy = sparks.length || t - dim.at < dim.ms;
            if (busy) return 33;
            if (!env.motion) return Infinity;
            return STEP - (t % STEP) + 1;
        },

        idle(ctx, L, env, kind) {
            idling = true;
            const s = L.screen, dpr = ctx.getTransform().a;
            const key = `${kind},${s.w},${s.h},${dpr}`;
            if (idleCard.key !== key) idleCard = { key, canvas: bake(s.w, s.h, dpr, c => card(c, s.w, s.h, kind)) };
            ctx.drawImage(idleCard.canvas, s.x, s.y, s.w, s.h);
        },

        // Warm cream, serif, on a soft dark band.
        cue(ctx, text, L) {
            JellyfinFrames.drawCue(ctx, text, L.screen, { font: '600 {size}px Georgia, "Iowan Old Style", serif', color: '#fbf1dc', box: 'rgba(18, 11, 6, 0.62)', bottom: 0.07 });
        },
    });

    // The idle screen: dark glass with a cream card, the room's own words.
    const WORDS = {
        setup: 'No signal', connecting: 'Tuning in…', offline: 'The server’s asleep', signedout: 'Signed out',
        empty: 'Nothing on tonight', loading: 'Warming up…', away: 'Showing in another room', demo: 'No signal',
    };
    let idleCard = { key: '' };
    function card(c, w, h, kind) {
        const detail = (JellyfinFrames.IDLE[kind] || JellyfinFrames.IDLE.setup)[1];
        const bg = c.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, Math.hypot(w, h) * 0.6);
        bg.addColorStop(0, '#221b15');
        bg.addColorStop(1, '#0a0806');
        c.fillStyle = bg;
        c.fillRect(0, 0, w, h);
        const m = Math.min(w, h) * 0.07;
        c.strokeStyle = 'rgba(222, 196, 150, 0.35)';
        c.lineWidth = 1;
        c.strokeRect(m, m, w - m * 2, h - m * 2);
        c.strokeRect(m + 4, m + 4, w - m * 2 - 8, h - m * 2 - 8);
        const size = Math.max(14, Math.min(h * 0.11, w * 0.07));
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = '#ecdcbc';
        c.font = `italic 400 ${size}px Georgia, "Iowan Old Style", serif`;
        c.fillText(WORDS[kind] || WORDS.setup, w / 2, h * 0.42);
        c.fillStyle = 'rgba(222, 196, 150, 0.6)';
        c.fillRect(w / 2 - size * 1.6, h * 0.42 + size * 0.85, size * 1.2, 1);
        c.fillRect(w / 2 + size * 0.4, h * 0.42 + size * 0.85, size * 1.2, 1);
        c.font = `${size * 0.4}px Georgia, serif`;
        c.fillText('✦', w / 2, h * 0.42 + size * 0.86);
        if (detail) {
            const small = Math.max(10, size * 0.36);
            c.font = `400 ${small}px Georgia, "Iowan Old Style", serif`;
            c.fillStyle = 'rgba(226, 208, 176, 0.72)';
            JellyfinFrames.wrap(c, detail, w * 0.7).slice(0, 3).forEach((line, i) => c.fillText(line, w / 2, h * 0.42 + size * 1.6 + i * small * 1.4));
        }
    }
})();
