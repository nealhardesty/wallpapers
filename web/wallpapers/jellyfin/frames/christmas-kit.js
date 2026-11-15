// What the Christmas frames share (christmas-lights.js, snowed-in.js,
// christmas-tree.js): strings of lights, fir, bows, holly, baubles,
// presents, a tree, a fire and falling snow, all drawn in code.
//
// The split is the frames' own (jellyfin-frames.js): everything here that
// takes the art context paints once per resize; `shine`, `fire` and
// `snowfall` draw on the overlay, from baked sprites, about twelve times a
// second, and hold one still picture without frame motion (Low).
//
// The options (defaults.js, all `xmas…`) reach the frames as env.config.

const JellyfinXmas = (() => {
    'use strict';

    const STEP = 83;                                   // 12 fps: the fire, the twinkle, the snow
    const seeded = seed => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // A stable hash in 0..1, so a slice of time always looks the same however often it is drawn.
    const hash = (a, b) => {
        let x = Math.imul(a ^ 0x2c1b3c6d, 0x297a2d39) ^ Math.imul(b + 0x632be5ab, 0x85ebca6b);
        x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d); x ^= x >>> 12;
        return (x >>> 0) / 4294967296;
    };
    const clamp01 = q => Math.max(0, Math.min(1, q));
    const rgb = (c, a = 1) => `rgba(${c}, ${a})`;

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

    // A soft round glow, baked once per colour.
    const glows = new Map();
    function glow(color) {
        if (!glows.has(color)) glows.set(color, bake(64, 64, 1, c => {
            const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
            g.addColorStop(0, rgb(color, 1));
            g.addColorStop(0.3, rgb(color, 0.45));
            g.addColorStop(1, rgb(color, 0));
            c.fillStyle = g;
            c.fillRect(0, 0, 64, 64);
        }));
        return glows.get(color);
    }

    // ---- Lights ------------------------------------------------------------------

    const PALETTES = {
        multi: ['255, 66, 52', '255, 186, 44', '64, 214, 104', '76, 150, 255', '255, 104, 196'],
        warm: ['255, 204, 128'],
        cool: ['132, 192, 255', '238, 245, 255'],
        candy: ['255, 60, 60', '250, 246, 236', '64, 198, 100'],
    };
    const palette = config => PALETTES[config?.xmasColors] || PALETTES.multi;

    // A strand hung between hooks: each span sags (downwards, or the way
    // [dx, dy] points), and the bulbs sit along it. Returns the wire's points and the bulbs ({ x, y, r, i }).
    function strand(hooks, spacing, sag, r, from = 0, [dx, dy] = [0, 1]) {
        const path = [], bulbs = [];
        let carry = spacing / 2, i = from;
        for (let k = 0; k + 1 < hooks.length; k++) {
            const [ax, ay] = hooks[k], [bx, by] = hooks[k + 1], len = Math.hypot(bx - ax, by - ay);
            const at = q => { const drop = sag * len * 4 * q * (1 - q); return [ax + (bx - ax) * q + dx * drop, ay + (by - ay) * q + dy * drop]; };
            const steps = Math.max(4, Math.round(len / 6));
            for (let s = k ? 1 : 0; s <= steps; s++) path.push(at(s / steps));
            for (let d = carry; d < len; d += spacing) {
                const [x, y] = at(d / len);
                bulbs.push({ x, y, r, i: i++ });
                carry = d + spacing - len;
            }
        }
        return { path, bulbs };
    }

    function wire(ctx, path, width = 1.2, color = '#10231a') {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        path.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
    }

    // The bulbs themselves, unlit glass: a socket and a drop of colour. `big`
    // are the fat outdoor kind, hanging; the small ones are just beads.
    function bulbs(ctx, list, config, big = false) {
        const colors = palette(config);
        for (const b of list) {
            const c = colors[b.i % colors.length], r = b.r;
            if (big) {
                ctx.fillStyle = '#16301f';
                ctx.fillRect(b.x - r * 0.42, b.y - r * 0.2, r * 0.84, r * 0.9);
                ctx.fillStyle = rgb(c, 0.92);
                ctx.beginPath();
                ctx.moveTo(b.x - r * 0.5, b.y + r * 0.6);
                ctx.bezierCurveTo(b.x - r * 1.05, b.y + r * 1.7, b.x - r * 0.45, b.y + r * 2.9, b.x, b.y + r * 3.1);
                ctx.bezierCurveTo(b.x + r * 0.45, b.y + r * 2.9, b.x + r * 1.05, b.y + r * 1.7, b.x + r * 0.5, b.y + r * 0.6);
                ctx.fill();
                ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.beginPath(); ctx.ellipse(b.x - r * 0.25, b.y + r * 1.4, r * 0.16, r * 0.5, 0.2, 0, 7); ctx.fill();
            } else {
                ctx.fillStyle = rgb(c, 0.95);
                ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, 7); ctx.fill();
                ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
                ctx.beginPath(); ctx.arc(b.x - r * 0.3, b.y - r * 0.3, r * 0.35, 0, 7); ctx.fill();
            }
        }
    }

    // How bright bulb i burns at time t (ms), 0 to 1.
    function level(pattern, t, i, motion) {
        if (!motion || pattern === 'steady') return 0.85;
        if (pattern === 'chase') { const k = (((i - t / 240) % 4) + 4) % 4; return k < 1 ? 1 : k < 2 ? 0.5 : 0.16; }
        if (pattern === 'fade') return 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t / 1100 + (i % 5) * 1.257));
        const slow = Math.floor(t / 460), q = (t % 460) / 460, a = hash(slow, i), b = hash(slow + 1, i);
        return 0.3 + 0.7 * (a + (b - a) * q);
    }

    // The light the bulbs give, on the overlay. `big` bulbs glow from the glass below the wire.
    function shine(ctx, list, config, t, motion, big = false, spread = 4.2) {
        const colors = palette(config), pattern = config?.xmasPattern || 'twinkle';
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const b of list) {
            const k = level(pattern, t, b.i, motion), y = b.y + (big ? b.r * 1.8 : 0), R = b.r * spread * (0.7 + 0.3 * k);
            ctx.globalAlpha = 0.85 * k;
            ctx.drawImage(glow(colors[b.i % colors.length]), b.x - R, y - R, R * 2, R * 2);
            ctx.globalAlpha = 0.55 * k * k;
            ctx.drawImage(glow('255, 250, 235'), b.x - b.r * 1.1, y - b.r * 1.1, b.r * 2.2, b.r * 2.2);
        }
        ctx.restore();
    }

    // ---- Greenery ------------------------------------------------------------------

    const GREENS = ['#0f3a22', '#17502e', '#1f663a', '#2c7c47', '#0b2c1a'];

    // Fir along a path: a dark rope, bristling with needles.
    function garland(ctx, path, thick, random) {
        wire(ctx, path, thick * 0.9, '#0b2817');
        ctx.lineCap = 'round';
        for (let k = 0; k + 1 < path.length; k++) {
            const [ax, ay] = path[k], [bx, by] = path[k + 1], len = Math.hypot(bx - ax, by - ay), along = Math.atan2(by - ay, bx - ax);
            const n = Math.max(1, Math.round(len / 1.3));
            for (let j = 0; j < n; j++) {
                const q = (j + random()) / n, x = ax + (bx - ax) * q, y = ay + (by - ay) * q;
                const a = along + (random() < 0.5 ? 1 : -1) * (0.45 + random() * 1.1), l = thick * (0.5 + random() * 0.7);
                ctx.strokeStyle = GREENS[(random() * GREENS.length) | 0];
                ctx.lineWidth = Math.max(1, thick * 0.13);
                ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
            }
        }
        ctx.lineCap = 'butt';
    }

    // A ribbon bow: two loops, a knot, two tails.
    function bow(ctx, x, y, s, color = '#b8202c', dark = '#7c121c') {
        for (const side of [-1, 1]) {
            ctx.fillStyle = dark;
            ctx.beginPath();
            ctx.moveTo(x + side * s * 0.1, y + s * 0.1);
            ctx.quadraticCurveTo(x + side * s * 0.5, y + s * 0.7, x + side * s * 0.55, y + s * 1.25);
            ctx.lineTo(x + side * s * 0.25, y + s * 1.1);
            ctx.quadraticCurveTo(x + side * s * 0.2, y + s * 0.6, x, y + s * 0.15);
            ctx.fill();
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.bezierCurveTo(x + side * s * 0.5, y - s * 0.75, x + side * s * 1.25, y - s * 0.55, x + side * s * 1.1, y + s * 0.05);
            ctx.bezierCurveTo(x + side * s * 1.2, y + s * 0.55, x + side * s * 0.45, y + s * 0.45, x, y);
            ctx.fill();
            ctx.fillStyle = dark;
            ctx.beginPath(); ctx.ellipse(x + side * s * 0.62, y - s * 0.05, s * 0.3, s * 0.16, side * -0.25, 0, 7); ctx.fill();
        }
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.ellipse(x, y + s * 0.02, s * 0.24, s * 0.28, 0, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.beginPath(); ctx.ellipse(x - s * 0.06, y - s * 0.07, s * 0.09, s * 0.12, 0, 0, 7); ctx.fill();
    }

    // A sprig of holly: spiny leaves and three berries.
    function holly(ctx, x, y, s, turn = 0) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(turn);
        for (const [a, color] of [[-2.5, '#14522c'], [-0.65, '#1b6a37'], [-1.57, '#237a41']]) {
            ctx.save();
            ctx.rotate(a + Math.PI / 2);
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            for (const side of [1, -1]) {
                const ys = side > 0 ? [0.25, 0.5, 0.75, 1] : [0.75, 0.5, 0.25, 0];
                for (const q of ys) {
                    const yy = -s * 1.5 * q, wide = s * 0.42 * Math.sin(Math.PI * Math.min(0.95, q + 0.1));
                    if (side > 0) { ctx.quadraticCurveTo(side * wide * 0.4, yy + s * 0.2, side * wide, yy + s * 0.1); ctx.lineTo(side * wide * 0.45, yy); } else { ctx.lineTo(side * wide, yy - s * 0.27); ctx.quadraticCurveTo(side * wide * 0.4, yy - s * 0.15, side * wide * 0.45, yy - s * 0.37); }
                }
                if (side > 0) ctx.lineTo(0, -s * 1.7);
            }
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = 'rgba(190, 230, 190, 0.25)';
            ctx.lineWidth = Math.max(0.6, s * 0.04);
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -s * 1.5); ctx.stroke();
            ctx.restore();
        }
        for (const [bx, by] of [[-0.2, 0.05], [0.22, 0.02], [0, -0.26]]) {
            ctx.fillStyle = '#c8202a';
            ctx.beginPath(); ctx.arc(bx * s, by * s, s * 0.2, 0, 7); ctx.fill();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
            ctx.beginPath(); ctx.arc(bx * s - s * 0.06, by * s - s * 0.07, s * 0.06, 0, 7); ctx.fill();
        }
        ctx.restore();
    }

    // A ring of fir with berries and a bow.
    function wreath(ctx, x, y, r, random) {
        const ring = [];
        for (let i = 0; i <= 40; i++) ring.push([x + Math.cos((i / 40) * 6.2832) * r * 0.78, y + Math.sin((i / 40) * 6.2832) * r * 0.78]);
        garland(ctx, ring, r * 0.42, random);
        for (let i = 0; i < 9; i++) {
            const a = random() * 6.2832, d = r * (0.66 + random() * 0.24);
            ctx.fillStyle = '#c8202a';
            ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, Math.max(1.2, r * 0.07), 0, 7); ctx.fill();
        }
        bow(ctx, x, y + r * 0.72, r * 0.34);
    }

    // ---- Ornaments and presents ------------------------------------------------------

    const SHINY = [['210, 40, 48', '110, 12, 20'], ['216, 168, 60', '120, 84, 16'], ['46, 120, 210', '16, 50, 110'], ['196, 200, 214', '96, 100, 116'], ['150, 60, 170', '70, 20, 90'], ['40, 150, 110', '12, 70, 50']];

    // A glass ball on a gold cap. `kind` 1 and 2 add a band or a dusting of dots.
    function bauble(ctx, x, y, r, pick = 0, kind = 0) {
        const [lit, dark] = SHINY[pick % SHINY.length];
        ctx.fillStyle = '#c9a548';
        ctx.fillRect(x - r * 0.22, y - r * 1.22, r * 0.44, r * 0.34);
        ctx.strokeStyle = '#c9a548';
        ctx.lineWidth = Math.max(0.8, r * 0.09);
        ctx.beginPath(); ctx.arc(x, y - r * 1.36, r * 0.16, 0, 7); ctx.stroke();
        const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.08, x, y, r);
        g.addColorStop(0, rgb(lit.split(',').map(v => Math.min(255, +v + 70)).join(', ')));
        g.addColorStop(0.45, rgb(lit));
        g.addColorStop(1, rgb(dark));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
        ctx.save();
        ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.clip();
        if (kind === 1) {
            ctx.fillStyle = 'rgba(255, 244, 214, 0.5)';
            ctx.fillRect(x - r, y - r * 0.16, r * 2, r * 0.32);
            ctx.fillStyle = 'rgba(255, 244, 214, 0.28)';
            ctx.fillRect(x - r, y - r * 0.42, r * 2, r * 0.1);
            ctx.fillRect(x - r, y + r * 0.32, r * 2, r * 0.1);
        } else if (kind === 2) {
            ctx.fillStyle = 'rgba(255, 250, 230, 0.6)';
            for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.arc(x + Math.cos(i * 2.4) * r * 0.55, y + Math.sin(i * 2.4) * r * 0.5 + r * 0.1, r * 0.09, 0, 7); ctx.fill(); }
        }
        ctx.restore();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.beginPath(); ctx.ellipse(x - r * 0.38, y - r * 0.42, r * 0.16, r * 0.26, -0.6, 0, 7); ctx.fill();
    }

    const PAPERS = [['#a81e28', '#e8c765'], ['#1f6a3c', '#d83a3a'], ['#e9e2d0', '#b8202c'], ['#27498a', '#e6e9f2'], ['#c99a2e', '#7c121c'], ['#7a2a6a', '#e8c765'], ['#d8d2c2', '#1f6a3c'], ['#b8202c', '#f3efe2']];

    // A wrapped box standing on y (its bottom), with a ribbon and a bow.
    function present(ctx, x, y, w, h, pick, random) {
        const [paper, ribbon] = PAPERS[pick % PAPERS.length], top = y - h;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath(); ctx.ellipse(x + w / 2, y, w * 0.56, Math.max(2, h * 0.06), 0, 0, 7); ctx.fill();
        ctx.fillStyle = paper;
        ctx.fillRect(x, top, w, h);
        // The paper's print: dots, stripes or plain.
        ctx.save();
        ctx.beginPath(); ctx.rect(x, top, w, h); ctx.clip();
        const print = (random() * 3) | 0;
        ctx.fillStyle = ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
        if (print === 0) {
            const gap = Math.max(5, Math.min(w, h) * 0.2);
            for (let yy = top + gap / 2, row = 0; yy < y; yy += gap, row++) for (let xx = x + (row % 2 ? gap : gap / 2); xx < x + w; xx += gap) { ctx.beginPath(); ctx.arc(xx, yy, gap * 0.16, 0, 7); ctx.fill(); }
        } else if (print === 1) {
            ctx.lineWidth = Math.max(1.5, w * 0.05);
            for (let d = -h; d < w; d += Math.max(6, w * 0.16)) { ctx.beginPath(); ctx.moveTo(x + d, y); ctx.lineTo(x + d + h, top); ctx.stroke(); }
        }
        const shade = ctx.createLinearGradient(x, 0, x + w, 0);
        shade.addColorStop(0, 'rgba(255, 255, 255, 0.10)');
        shade.addColorStop(0.55, 'rgba(0, 0, 0, 0)');
        shade.addColorStop(1, 'rgba(0, 0, 0, 0.32)');
        ctx.fillStyle = shade;
        ctx.fillRect(x, top, w, h);
        ctx.restore();
        const rw = Math.max(2.5, Math.min(w, h) * 0.14);
        ctx.fillStyle = ribbon;
        ctx.fillRect(x + w / 2 - rw / 2, top, rw, h);
        if (h > w * 0.5) ctx.fillRect(x, top + h * 0.5 - rw / 2, w, rw);
        // The lid's edge.
        ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
        ctx.fillRect(x, top + Math.max(2, h * 0.13), w, Math.max(1, h * 0.025));
        bow(ctx, x + w / 2, top - rw * 0.2, Math.max(4, Math.min(w * 0.3, h * 0.42)), ribbon, 'rgba(0, 0, 0, 0.35)');
    }

    // A five-pointed star, lit from inside.
    function star(ctx, x, y, r) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, '#fff8d8');
        g.addColorStop(0.5, '#f4cf5c');
        g.addColorStop(1, '#c08a1c');
        ctx.fillStyle = g;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
            const a = -Math.PI / 2 + (i * Math.PI) / 5, d = i % 2 ? r * 0.44 : r;
            ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 250, 220, 0.6)';
        ctx.lineWidth = Math.max(0.8, r * 0.05);
        ctx.stroke();
    }

    // A stocking hanging from (x, y): a white cuff, a toe to the right.
    function stocking(ctx, x, y, s, color = '#b8202c') {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x - s * 0.3, y);
        ctx.lineTo(x - s * 0.3, y + s * 1.05);
        ctx.quadraticCurveTo(x - s * 0.32, y + s * 1.6, x + s * 0.2, y + s * 1.6);
        ctx.lineTo(x + s * 0.62, y + s * 1.6);
        ctx.quadraticCurveTo(x + s * 0.95, y + s * 1.55, x + s * 0.9, y + s * 1.25);
        ctx.quadraticCurveTo(x + s * 0.8, y + s * 1.0, x + s * 0.3, y + s * 1.02);
        ctx.lineTo(x + s * 0.3, y);
        ctx.fill();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
        ctx.beginPath(); ctx.ellipse(x + s * 0.72, y + s * 1.34, s * 0.2, s * 0.22, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#f1ece0';
        ctx.beginPath(); ctx.roundRect(x - s * 0.38, y - s * 0.06, s * 0.76, s * 0.38, s * 0.1); ctx.fill();
    }

    // A fir tree. T: { x (the trunk), base (the lowest boughs' tips), w, h }.
    // Returns half(y): how far the boughs reach either side at height y.
    function tree(ctx, T, random) {
        const { x, base, w, h } = T, top = base - h;
        const tiers = Math.max(5, Math.min(13, Math.round(h / 46)));
        const half = y => (w / 2) * Math.pow(clamp01((y - top) / h), 0.92);
        ctx.lineCap = 'round';
        for (let k = tiers - 1; k >= 0; k--) {
            // Bottom tier first, so each one lies over the one below.
            const q = (tiers - 1 - k) / tiers, low = base - h * q, high = Math.max(top, low - (h / tiers) * 2.1);
            const reach = half(low) + w * 0.035, n = Math.max(3, Math.round(reach / Math.max(9, w * 0.05)));
            ctx.beginPath();
            ctx.moveTo(x, high);
            ctx.lineTo(x - reach * 0.55, low - (low - high) * 0.5);
            for (let j = -n; j <= n; j++) {
                const px = x + (j / n) * reach, droop = (Math.abs(j) / n) ** 2 * (low - high) * 0.16, jig = (random() - 0.5) * (low - high) * 0.1;
                ctx.lineTo(px - reach / n / 2, low - (low - high) * 0.2 - droop + jig);
                ctx.lineTo(px, low - droop + jig);
            }
            ctx.lineTo(x + reach * 0.55, low - (low - high) * 0.5);
            ctx.closePath();
            const g = ctx.createLinearGradient(0, high, 0, low);
            g.addColorStop(0, '#071c10');
            g.addColorStop(0.55, '#0f3a22');
            g.addColorStop(1, '#1c5a33');
            ctx.fillStyle = g;
            ctx.fill();
            // Needles, fanning out and down from the trunk.
            const count = Math.round((reach * (low - high)) / 26);
            for (let i = 0; i < count; i++) {
                const yy = high + (low - high) * (0.25 + random() * 0.75), span = reach * ((yy - high) / (low - high));
                const xx = x + (random() * 2 - 1) * span, out = (xx - x) / Math.max(1, reach);
                const a = Math.PI / 2 - out * 1.05 + (random() - 0.5) * 0.5, l = Math.max(4, w * 0.022) * (0.6 + random());
                ctx.strokeStyle = GREENS[(random() * GREENS.length) | 0];
                ctx.lineWidth = Math.max(1, w * 0.0045);
                ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx + Math.cos(a) * l, yy + Math.sin(a) * l); ctx.stroke();
            }
        }
        ctx.lineCap = 'butt';
        return half;
    }

    // ---- The fire --------------------------------------------------------------------

    const HEAT = [[0, 18, 4, 2], [0.16, 84, 14, 4], [0.32, 166, 40, 8], [0.5, 224, 92, 14], [0.68, 252, 152, 32], [0.85, 255, 208, 104], [1, 255, 246, 210]];
    function heat(t) {
        for (let i = 1; i < HEAT.length; i++) {
            if (t <= HEAT[i][0] || i === HEAT.length - 1) {
                const lo = HEAT[i - 1], hi = HEAT[i], k = clamp01((t - lo[0]) / (hi[0] - lo[0]));
                return [1, 2, 3].map(j => Math.round(lo[j] + (hi[j] - lo[j]) * k));
            }
        }
        return HEAT[0].slice(1);
    }

    // Flame tongues, baked once: soft blobs up a wavering column, added together (the mantel's way).
    let tongues = null;
    function flames() {
        if (tongues) return tongues;
        const random = seeded(2512);
        tongues = Array.from({ length: 10 }, () => bake(36, 90, 1, c => {
            c.globalCompositeOperation = 'lighter';
            const lean = (random() - 0.5) * 14, wobble = 2 + random() * 4, phase = random() * 6, reach = 0.7 + random() * 0.3;
            for (let i = 0; i < 30; i++) {
                const k = i / 29, y = 84 - k * 78 * reach, x = 18 + lean * k * k + Math.sin(k * 6 + phase) * wobble * k;
                const r = 12.5 * (1 - k * 0.82) * (0.85 + random() * 0.3), [R, G, B] = heat(0.98 - k * 0.78);
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

    // Smoothed flicker for step n, 0 to 1.
    const flicker = n => hash(n, 1) * 0.5 + hash(n - 1, 1) * 0.3 + hash(n - 2, 1) * 0.2;

    // A log lying across (x, y) to (x + w, y), h thick.
    function log(ctx, x, y, w, h, tilt = 0) {
        ctx.save();
        ctx.translate(x + w / 2, y);
        ctx.rotate(tilt);
        const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
        g.addColorStop(0, '#4a2c18');
        g.addColorStop(0.5, '#2a170c');
        g.addColorStop(1, '#120904');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, h * 0.45); ctx.fill();
        ctx.fillStyle = '#6a4526';
        ctx.beginPath(); ctx.ellipse(w / 2 - h * 0.3, 0, h * 0.26, h * 0.42, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#8a6238';
        ctx.beginPath(); ctx.ellipse(w / 2 - h * 0.3, 0, h * 0.12, h * 0.2, 0, 0, 7); ctx.fill();
        ctx.restore();
    }

    // The flames over F: { x (centre), y (the logs' top), w, h }, for step n.
    function fire(ctx, F, n) {
        const sprites = flames(), flick = flicker(n);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.45 + flick * 0.35;
        ctx.drawImage(glow('255, 110, 30'), F.x - F.w * 0.75, F.y - F.h * 0.45, F.w * 1.5, F.h * 0.9);
        const spots = [[-0.36, 0.45], [-0.22, 0.7], [-0.08, 0.92], [0.04, 1], [0.15, 0.82], [0.28, 0.66], [0.4, 0.42], [-0.02, 0.6]];
        spots.forEach(([dx, tall], i) => {
            const pick = sprites[(hash(n, i) * sprites.length) | 0];
            const sh = F.h * tall * (0.85 + hash(n, i + 20) * 0.35), sw = sh * 0.6;
            const x = F.x + dx * F.w + (hash(n, i + 40) - 0.5) * F.w * 0.05;
            ctx.globalAlpha = 0.85 + hash(n, i + 60) * 0.15;
            ctx.drawImage(pick, x - sw / 2, F.y - sh * 0.92, sw, sh);
        });
        ctx.restore();
        return flick;
    }

    // ---- Snow ------------------------------------------------------------------------

    // Flakes in a unit box; near ones (z near 1) are bigger and faster.
    function flurry(flakes, count) {
        while (flakes.length < count) flakes.push({ x: Math.random(), y: Math.random(), z: 0.25 + Math.random() * 0.75, p: Math.random() * 6.28 });
        flakes.length = count;
        return flakes;
    }

    // Move them by dt seconds and draw them inside `box` (clip first). `wind` leans the fall.
    function snowfall(ctx, flakes, box, dt, speed = 0.16, wind = 0.05, size = 1) {
        ctx.fillStyle = 'rgba(240, 245, 255, 0.9)';
        for (const f of flakes) {
            f.y += speed * (0.45 + f.z) * dt;
            f.x += (wind * (0.4 + f.z) + Math.sin(f.p) * 0.012) * dt;
            f.p += dt * 1.7;
            if (f.y > 1) { f.y -= 1; f.x = Math.random(); }
            if (f.x > 1) f.x -= 1;
            if (f.x < 0) f.x += 1;
            const r = Math.max(1, (0.7 + f.z * 1.9) * size);
            ctx.globalAlpha = 0.45 + f.z * 0.5;
            ctx.fillRect(box.x + f.x * box.w - r / 2, box.y + f.y * box.h - r / 2, r, r);
        }
        ctx.globalAlpha = 1;
    }

    // ---- A window on the snow ------------------------------------------------------------

    // A window's parts: the casing's width, its panes, and the glass as a whole.
    function sash(win) {
        const f = Math.max(5, Math.min(win.w, win.h) * 0.045), mull = Math.max(2.5, f * 0.42);
        const cols = Math.max(2, Math.round(win.w / Math.max(90, win.h * 0.62))), rows = win.h > 150 ? 2 : 1;
        const pw = (win.w - f * 2 - mull * (cols - 1)) / cols, ph = (win.h - f * 2 - mull * (rows - 1)) / rows, panes = [];
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) panes.push({ x: win.x + f + c * (pw + mull), y: win.y + f + r * (ph + mull), w: pw, h: ph });
        return { casing: f, panes, glass: { x: win.x + f, y: win.y + f, w: win.w - f * 2, h: win.h - f * 2 } };
    }

    // The night outside: a snowy garden, pines, a lamp post. Then the casing and its bars over it.
    function outside(ctx, win, L, random, lamp = 0.05) {
        const g = L.glass, f = L.casing;
        ctx.save();
        ctx.beginPath(); ctx.rect(g.x, g.y, g.w, g.h); ctx.clip();
        const sky = ctx.createLinearGradient(0, g.y, 0, g.y + g.h);
        sky.addColorStop(0, '#0a1226');
        sky.addColorStop(0.7, '#1d2c4a');
        sky.addColorStop(1, '#34466a');
        ctx.fillStyle = sky;
        ctx.fillRect(g.x, g.y, g.w, g.h);
        // Far hills, then pines heavy with snow, then the garden's drifts.
        const hill = (base, amp, color, seed) => {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(g.x, g.y + g.h);
            for (let i = 0; i <= 40; i++) { const q = i / 40; ctx.lineTo(g.x + q * g.w, g.y + g.h * (base - amp * (Math.sin(q * 5 + seed) * 0.5 + Math.sin(q * 11 + seed * 2) * 0.25))); }
            ctx.lineTo(g.x + g.w, g.y + g.h);
            ctx.fill();
        };
        hill(0.62, 0.1, '#3d4f73', 1);
        const pines = Math.max(5, Math.round(g.w / 60));
        for (let i = 0; i < pines; i++) {
            const px = g.x + ((i + 0.2 + random() * 0.6) / pines) * g.w, ph = g.h * (0.28 + random() * 0.3), pw = ph * 0.46, py = g.y + g.h * (0.72 + random() * 0.08);
            for (let k = 0; k < 4; k++) {
                const q = k / 4, yy = py - ph * q, ww = pw * (1 - q * 0.78);
                ctx.fillStyle = '#12251f';
                ctx.beginPath(); ctx.moveTo(px, yy - ph * 0.42); ctx.lineTo(px + ww / 2, yy); ctx.lineTo(px - ww / 2, yy); ctx.fill();
                ctx.fillStyle = 'rgba(214, 226, 246, 0.8)';
                ctx.beginPath(); ctx.moveTo(px, yy - ph * 0.42); ctx.lineTo(px + ww * 0.3, yy - ph * 0.14); ctx.quadraticCurveTo(px, yy - ph * 0.2, px - ww * 0.3, yy - ph * 0.14); ctx.fill();
            }
        }
        hill(0.82, 0.05, '#aebbd6', 4);
        hill(0.9, 0.03, '#d3dcee', 7);
        // The lamp post, and the pool of light it makes in the falling snow.
        const lx = g.x + g.w * lamp, ly = g.y + g.h * 0.4, lh = g.h * 0.5, lr = Math.max(3, g.h * 0.022);
        ctx.fillStyle = '#0c0f16';
        ctx.fillRect(lx - lr * 0.3, ly, lr * 0.6, lh);
        ctx.fillRect(lx - lr * 1.1, ly - lr * 0.5, lr * 2.2, lr * 0.6);
        ctx.fillStyle = '#ffe2a0';
        ctx.fillRect(lx - lr * 0.8, ly - lr * 2.3, lr * 1.6, lr * 1.9);
        ctx.fillStyle = '#0c0f16';
        ctx.beginPath(); ctx.moveTo(lx - lr * 1.2, ly - lr * 2.3); ctx.lineTo(lx, ly - lr * 3.4); ctx.lineTo(lx + lr * 1.2, ly - lr * 2.3); ctx.fill();
        ctx.fillStyle = 'rgba(232, 240, 252, 0.9)';
        ctx.beginPath(); ctx.ellipse(lx, ly - lr * 3.1, lr * 1.1, lr * 0.45, 0, 0, 7); ctx.fill();
        const halo = ctx.createRadialGradient(lx, ly - lr * 1.3, 0, lx, ly - lr * 1.3, g.h * 0.5);
        halo.addColorStop(0, 'rgba(255, 214, 140, 0.5)');
        halo.addColorStop(0.3, 'rgba(255, 206, 130, 0.16)');
        halo.addColorStop(1, 'rgba(255, 206, 130, 0)');
        ctx.fillStyle = halo;
        ctx.fillRect(g.x, g.y, g.w, g.h);
        // Snow banked on the sill, and frost creeping in from each pane's corners.
        ctx.fillStyle = '#e6ecf8';
        ctx.beginPath();
        ctx.moveTo(g.x, g.y + g.h);
        for (let i = 0; i <= 30; i++) ctx.lineTo(g.x + (i / 30) * g.w, g.y + g.h - g.h * (0.035 + 0.02 * Math.sin(i * 1.7) + 0.012 * Math.sin(i * 4.1)));
        ctx.lineTo(g.x + g.w, g.y + g.h);
        ctx.fill();
        for (const p of L.panes) {
            for (const [cx, cy] of [[p.x, p.y + p.h], [p.x + p.w, p.y + p.h], [p.x, p.y], [p.x + p.w, p.y]]) {
                const R = Math.min(p.w, p.h) * (cy > p.y ? 0.3 : 0.13), frost = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
                frost.addColorStop(0, 'rgba(226, 236, 252, 0.4)');
                frost.addColorStop(1, 'rgba(226, 236, 252, 0)');
                ctx.fillStyle = frost;
                ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
            }
        }
        ctx.restore();
        // Casing and bars: everything that isn't a pane.
        ctx.save();
        ctx.beginPath();
        ctx.rect(win.x, win.y, win.w, win.h);
        for (const p of L.panes) ctx.rect(p.x, p.y, p.w, p.h);
        ctx.clip('evenodd');
        const wood = ctx.createLinearGradient(0, win.y, 0, win.y + win.h);
        wood.addColorStop(0, '#6d6253');
        wood.addColorStop(1, '#8a7c68');
        ctx.fillStyle = wood;
        ctx.fillRect(win.x, win.y, win.w, win.h);
        ctx.restore();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.lineWidth = 1;
        for (const p of L.panes) ctx.strokeRect(p.x - 0.5, p.y - 0.5, p.w + 1, p.h + 1);
        ctx.fillStyle = '#93856f';
        ctx.fillRect(win.x - f * 0.5, win.y + win.h - f * 0.2, win.w + f, f * 0.7);
    }

    // The snow outside, by the xmasSnow option: flakes, fall and wind. Clip to the glass first.
    const SNOW = { light: [130, 0.11, 0.015], heavy: [620, 0.2, 0.05], blizzard: [1100, 0.32, 0.34] };
    function weather(ctx, flakes, glass, dt, config, env) {
        const [count, fall, wind] = SNOW[config?.xmasSnow] || SNOW.heavy;
        flurry(flakes, Math.round(count * (env.quality?.density ?? 1) * Math.min(1, Math.max(0.25, (glass.w * glass.h) / 280000))));
        snowfall(ctx, flakes, glass, dt, fall, wind, Math.max(1, glass.h / 230));
    }

    // ---- The screen's own manners, shared: dim for a pause, blink through black for a change ----

    const ease = q => (q < 0.5 ? 2 * q * q : 1 - (-2 * q + 2) ** 2 / 2);
    function dimmer() {
        let dim = { from: 0, to: 0, at: 0, ms: 1, change: false };
        const at = (t, env) => {
            const q = clamp01((t - dim.at) / dim.ms);
            if (dim.change) return q >= 1 ? 0 : Math.max(dim.from * (1 - q), Math.sin(Math.PI * q));
            if (q >= 1) return env.paused ? 0.72 : dim.to;
            return dim.from + (dim.to - dim.from) * ease(q);
        };
        return {
            at,
            busy: t => t - dim.at < dim.ms,
            start(kind, env) {
                const now = performance.now(), from = at(now, env);
                dim = kind === 'change' ? { from, to: 0, at: now, ms: 800, change: true } : { from, to: kind === 'pause' ? 0.72 : 0, at: now, ms: kind === 'pause' ? 600 : 450, change: false };
                env.busy(dim.ms);
            },
            draw(ctx, t, env, s, tint = '6, 8, 12') {
                const d = at(t, env);
                if (d > 0.001) {
                    ctx.fillStyle = rgb(tint, d);
                    ctx.beginPath(); ctx.roundRect(s.x, s.y, s.w, s.h, s.radius || 0); ctx.fill();
                }
            },
        };
    }

    // The idle screen: a dark card with a line of the season's, and what to do about it.
    const WORDS = {
        setup: 'No signal', connecting: 'Tuning in…', offline: 'The server’s asleep', signedout: 'Signed out',
        empty: 'Nothing on tonight', loading: 'Warming up…', away: 'Showing in another room', demo: 'Season’s greetings',
    };
    const cards = new Map();
    function idle(ctx, s, kind, id) {
        const dpr = ctx.getTransform().a, key = `${id},${kind},${s.w},${s.h},${dpr}`;
        if (!cards.has(id) || cards.get(id).key !== key) cards.set(id, { key, canvas: bake(s.w, s.h, dpr, c => {
            const w = s.w, h = s.h, detail = (JellyfinFrames.IDLE[kind] || JellyfinFrames.IDLE.setup)[1];
            const bg = c.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, Math.hypot(w, h) * 0.6);
            bg.addColorStop(0, '#16261c');
            bg.addColorStop(1, '#060b08');
            c.fillStyle = bg;
            c.fillRect(0, 0, w, h);
            const size = Math.max(9, Math.min(h * 0.13, w * 0.075));
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillStyle = '#f0e2bf';
            c.font = `italic 400 ${size}px Georgia, "Iowan Old Style", serif`;
            c.fillText(WORDS[kind] || WORDS.setup, w / 2, h * 0.42);
            holly(c, w / 2, h * 0.42 - size * 1.05, size * 0.42);
            if (detail && h > 90) {
                const small = Math.max(8, size * 0.36);
                c.font = `400 ${small}px Georgia, "Iowan Old Style", serif`;
                c.fillStyle = 'rgba(226, 214, 180, 0.72)';
                JellyfinFrames.wrap(c, detail, w * 0.74).slice(0, 3).forEach((line, i) => c.fillText(line, w / 2, h * 0.42 + size * 1.15 + i * small * 1.4));
            }
        }) });
        ctx.drawImage(cards.get(id).canvas, s.x, s.y, s.w, s.h);
    }

    return { STEP, seeded, hash, clamp01, bake, glow, palette, strand, wire, bulbs, shine, garland, bow, holly, wreath, bauble, present, star, stocking, tree, log, fire, flicker, flurry, snowfall, sash, outside, weather, dimmer, idle };
})();
