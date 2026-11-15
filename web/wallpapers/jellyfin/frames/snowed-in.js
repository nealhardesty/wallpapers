// Snowed In: a den on Christmas Eve. A flat-panel TV stands on a low
// bookcase in front of a wide window, and outside it is snowing hard on
// the pines and a lamp post. Off to the side a brick fireplace burns under
// a garlanded mantel hung with stockings, a wreath above it and a cat
// asleep on the rug. A tall bookcase stands in the other corner, and by it
// a small tree twinkles over a stack of presents. An upright phone hangs
// the TV on the wall under the window, with the fire and the tree below.
//
// Options (env.config): xmasSnow (light, heavy, blizzard), xmasFire,
// xmasCat, xmasColors and xmasPattern. Cheap: the room is painted once;
// the overlay is the fire's baked tongues, a baked glow per bulb and the
// flakes as small rects, twelve times a second, and one still on Low.

(() => {
    'use strict';
    const X = JellyfinXmas;
    const dim = X.dimmer();
    let flakes = [], lastT = 0;

    function layout(w, h, aspect, env) {
        const portrait = h > w * 1.1, safe = h - env.insets.bottom;
        const floor = safe - Math.max(30, h * (portrait ? 0.07 : 0.13));
        const L = { portrait, floor, safe };
        let fp, treeBox;
        if (portrait) {
            const W = w * 0.86, S = W / aspect, b = Math.max(3, W * 0.014);
            const top = h * 0.05, winH = Math.max(70, Math.min(h * 0.19, floor * 0.22));
            L.window = { x: w * 0.07, y: top, w: w * 0.86, h: winH };
            L.screen = { x: (w - W) / 2, y: top + winH + h * 0.035 + b, w: W, h: S, radius: 2 };
            L.frame = { x: L.screen.x - b, y: L.screen.y - b, w: W + b * 2, h: S + b * 2, b };
            L.shelf = { x: w * 0.1, y: L.frame.y + L.frame.h + h * 0.022, w: w * 0.8, h: Math.max(5, h * 0.008) };
            const room = floor - L.shelf.y - h * 0.05;
            const fw = w * 0.5, fh = Math.min(room * 0.86, fw * 1.25);
            fp = { x: w * 0.03, y: floor - fh, w: fw, h: fh };
            const th = Math.min(room * 0.9, w * 0.62);
            treeBox = { x: w * 0.77, base: floor - th * 0.16, w: Math.min(w * 0.4, th * 0.66), h: th * 0.8 };
        } else {
            const fw = Math.max(150, Math.min(330, w * 0.2)), fh = Math.min(floor * 0.5, fw * 1.02);
            fp = { x: w * 0.028, y: floor - fh, w: fw, h: fh };
            const bw = Math.max(96, Math.min(210, w * 0.125)), by = h * 0.1;
            L.bookcase = { x: w - bw - w * 0.022, y: by, w: bw, h: floor - by };
            const left = fp.x + fp.w + w * 0.03, right = L.bookcase.x - w * 0.03, top = h * 0.065;
            const ch = Math.max(54, Math.min(130, h * 0.14)), stand = Math.max(8, h * 0.024);
            let W = Math.min((right - left) * 0.74, (floor - ch - stand - top - h * 0.13) * aspect);
            const S = W / aspect, b = Math.max(3, W * 0.012), cx = (left + right) / 2;
            L.console = { x: cx - Math.min(right - left, W * 1.3) / 2, y: floor - ch, w: Math.min(right - left, W * 1.3), h: ch };
            L.screen = { x: cx - W / 2, y: L.console.y - stand - b - S, w: W, h: S, radius: 2 };
            L.frame = { x: L.screen.x - b, y: L.screen.y - b, w: W + b * 2, h: S + b * 2, b };
            L.stand = { x: cx, y: L.frame.y + L.frame.h, h: stand, w: W * 0.3 };
            L.window = { x: left, y: top, w: right - left, h: L.console.y - h * 0.012 - top };
            const th = Math.min(h * 0.44, floor * 0.55);
            treeBox = { x: L.bookcase.x - th * 0.04, base: floor - th * 0.13, w: th * 0.6, h: th * 0.82 };
        }
        // The fireplace's parts.
        const shelfH = Math.max(7, fp.h * 0.07), hearth = Math.max(5, fp.h * 0.05);
        const ow = fp.w * 0.6, oh = (fp.h - hearth) * 0.66;
        L.fp = fp;
        L.mantel = { x: fp.x - fp.w * 0.05, y: fp.y - shelfH, w: fp.w * 1.1, h: shelfH };
        L.opening = { x: fp.x + (fp.w - ow) / 2, y: floor - hearth - oh, w: ow, h: oh };
        L.hearth = { x: fp.x - fp.w * 0.03, y: floor - hearth, w: fp.w * 1.06, h: hearth };
        L.fire = { x: fp.x + fp.w / 2, y: floor - hearth - oh * 0.1, w: ow * 0.62, h: oh * 0.74 };
        L.breast = { x: fp.x + fp.w * 0.06, w: fp.w * 0.88 };
        L.tree = treeBox;
        L.rug = { x: portrait ? w * 0.5 : fp.x + fp.w * 0.95, y: floor + (safe - floor) * 0.55, rx: portrait ? w * 0.42 : fp.w * 0.95, ry: Math.max(8, (safe - floor) * 0.36) };
        const cs = Math.min((safe - floor) * 0.62, fp.w * 0.2, 62);
        L.cat = { x: fp.x + fp.w * (portrait ? 0.62 : 1.02), y: floor + (safe - floor) * 0.56, s: cs };

        // The window's panes, and what stands in front of them (for the snow's clip).
        const win = L.window;
        Object.assign(L, X.sash(win));

        // Every bulb in the room: round the window, along the mantel's garland, on the tree.
        const r = Math.max(1.6, Math.min(w, h) * 0.0034);
        L.bulbs = [];
        const add = (hooks, spacing, sag, dir) => { const s = X.strand(hooks, spacing, sag, r, L.bulbs.length, dir); L.bulbs.push(...s.bulbs); return s.path; };
        const n = Math.max(2, Math.round(win.w / 130));
        L.wires = [add(Array.from({ length: n + 1 }, (_, i) => [win.x + (win.w * i) / n, win.y - r * 2.5]), r * 6, 0.05)];
        const mn = portrait ? 2 : 3;
        L.swag = X.strand(Array.from({ length: mn + 1 }, (_, i) => [L.mantel.x + (L.mantel.w * i) / mn, L.mantel.y + L.mantel.h * 0.4]), 1e9, 0.11, 0).path;
        L.bulbs.push(...X.strand(Array.from({ length: mn + 1 }, (_, i) => [L.mantel.x + (L.mantel.w * i) / mn, L.mantel.y + L.mantel.h * 0.4]), r * 7, 0.11, r, L.bulbs.length).bulbs);
        const T = L.tree, sweeps = Math.max(4, Math.round(T.h / 34));
        L.treeWires = [];
        for (let k = 0; k < sweeps; k++) {
            const y0 = T.base - T.h * (0.06 + (0.8 * k) / sweeps), y1 = y0 - T.h * 0.07, half = y => (T.w / 2) * Math.pow(X.clamp01((y - (T.base - T.h)) / T.h), 0.92) * 0.9;
            const side = k % 2 ? 1 : -1;
            L.treeWires.push(add([[T.x - side * half(y0), y0], [T.x + side * half(y1), y1]], r * 6.5, 0.1));
        }
        return L;
    }

    // ---- The room ------------------------------------------------------------------

    function wall(ctx, L, w, h) {
        const paint = ctx.createLinearGradient(0, 0, 0, L.floor);
        paint.addColorStop(0, '#231a1c');
        paint.addColorStop(1, '#3a2a26');
        ctx.fillStyle = paint;
        ctx.fillRect(0, 0, w, L.floor);
        // Board and batten, faintly.
        const gap = Math.max(46, w * 0.055);
        for (let x = (w / 2) % gap; x < w; x += gap) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
            ctx.fillRect(x, 0, 2, L.floor);
            ctx.fillStyle = 'rgba(255, 220, 180, 0.035)';
            ctx.fillRect(x + 2, 0, 1.5, L.floor);
        }
        const skirt = Math.max(6, h * 0.016);
        ctx.fillStyle = '#1a1211';
        ctx.fillRect(0, L.floor - skirt, w, skirt);
        const boards = ctx.createLinearGradient(0, L.floor, 0, h);
        boards.addColorStop(0, '#4a2f1c');
        boards.addColorStop(1, '#1a0f08');
        ctx.fillStyle = boards;
        ctx.fillRect(0, L.floor, w, h - L.floor);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.lineWidth = 1;
        for (let y = L.floor + 5, i = 0; y < h; y += 5 + i * 2.5, i++) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    }

    // Spines along a shelf: x to x + w, standing on y, no taller than h.
    function books(ctx, x, y, w, h, random) {
        const COLORS = ['#7c1f24', '#254c36', '#c9b88f', '#2c3f66', '#8a5a2b', '#5a2440', '#a33a2a', '#3d5c4a', '#d8cdb4', '#40403f'];
        let bx = x + 1;
        while (bx < x + w - 5) {
            const bw = Math.max(4, Math.min(x + w - bx, h * (0.1 + random() * 0.13))), bh = h * (0.62 + random() * 0.34);
            if (random() < 0.07) { bx += bw * 1.4; continue; }
            ctx.fillStyle = COLORS[(random() * COLORS.length) | 0];
            ctx.fillRect(bx, y - bh, bw - 1, bh);
            ctx.fillStyle = 'rgba(232, 200, 120, 0.5)';
            ctx.fillRect(bx + 1, y - bh * 0.82, bw - 3, 1);
            ctx.fillRect(bx + 1, y - bh * 0.24, bw - 3, 1);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
            ctx.fillRect(bx + bw - 2.5, y - bh, 1.5, bh);
            bx += bw;
        }
    }

    function cabinet(ctx, b, bays, shelves, random, festive) {
        const t = Math.max(4, Math.min(b.w, b.h) * 0.05);
        const wood = ctx.createLinearGradient(b.x, 0, b.x + b.w, 0);
        wood.addColorStop(0, '#4a2c18');
        wood.addColorStop(1, '#2e1a0e');
        ctx.fillStyle = wood;
        ctx.fillRect(b.x, b.y, b.w, b.h);
        const bw = (b.w - t * (bays + 1)) / bays, sh = (b.h - t * (shelves + 1)) / shelves;
        for (let r = 0; r < shelves; r++) {
            for (let c = 0; c < bays; c++) {
                const x = b.x + t + c * (bw + t), y = b.y + t + r * (sh + t);
                ctx.fillStyle = '#150c07';
                ctx.fillRect(x, y, bw, sh);
                if (festive && (r * bays + c) % 3 === 1) {
                    // A shelf kept for Christmas: three baubles and a sprig.
                    const br = Math.min(sh * 0.26, bw * 0.13);
                    for (let i = 0; i < 3; i++) X.bauble(ctx, x + bw * (0.24 + i * 0.26), y + sh - br, br, r + i * 2, i);
                    X.holly(ctx, x + bw * 0.86, y + sh - br * 0.5, br * 0.8, 0.4);
                } else books(ctx, x, y + sh, bw, sh, random);
                ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
                ctx.fillRect(x, y, bw, Math.max(2, sh * 0.08));
            }
        }
        ctx.fillStyle = 'rgba(255, 220, 170, 0.08)';
        ctx.fillRect(b.x, b.y, b.w, 1.5);
    }

    function fireplace(ctx, L, random, lit) {
        const fp = L.fp, o = L.opening;
        // Bricks: the chimney breast up to the ceiling, then the surround.
        const bricks = (x, y, w, h, tone) => {
            ctx.fillStyle = '#2a1512';
            ctx.fillRect(x, y, w, h);
            const bh = Math.max(7, fp.w * 0.045), bw = bh * 2.3;
            ctx.save();
            ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
            for (let yy = y, row = 0; yy < y + h; yy += bh, row++) {
                for (let xx = x - (row % 2 ? bw / 2 : 0); xx < x + w; xx += bw) {
                    const v = tone + random() * 26;
                    ctx.fillStyle = `rgb(${v + 62}, ${v * 0.5 + 22}, ${v * 0.4 + 16})`;
                    ctx.fillRect(xx + 1, yy + 1, bw - 2, bh - 2);
                }
            }
            ctx.restore();
        };
        if (!L.portrait) {
            bricks(L.breast.x, 0, L.breast.w, fp.y, 22);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.fillRect(L.breast.x + L.breast.w, 0, 5, fp.y);
        }
        bricks(fp.x, fp.y, fp.w, fp.h, 38);
        // The firebox: dark, sooty, arched.
        ctx.fillStyle = '#080504';
        ctx.beginPath();
        ctx.moveTo(o.x, o.y + o.h);
        ctx.lineTo(o.x, o.y + o.h * 0.22);
        ctx.quadraticCurveTo(o.x + o.w / 2, o.y - o.h * 0.12, o.x + o.w, o.y + o.h * 0.22);
        ctx.lineTo(o.x + o.w, o.y + o.h);
        ctx.fill();
        if (lit) {
            const back = ctx.createRadialGradient(L.fire.x, L.fire.y, 0, L.fire.x, L.fire.y, o.w * 0.6);
            back.addColorStop(0, 'rgba(255, 130, 40, 0.5)');
            back.addColorStop(1, 'rgba(255, 110, 30, 0)');
            ctx.fillStyle = back;
            ctx.fillRect(o.x, o.y, o.w, o.h);
        }
        const lh = Math.max(5, o.h * 0.13);
        X.log(ctx, L.fire.x - L.fire.w * 0.62, L.fire.y + lh * 0.25, L.fire.w * 0.95, lh, 0.08);
        X.log(ctx, L.fire.x - L.fire.w * 0.3, L.fire.y + lh * 0.3, L.fire.w * 0.95, lh * 0.9, -0.07);
        // The hearth stone and the mantel's beam.
        ctx.fillStyle = '#3b3532';
        ctx.fillRect(L.hearth.x, L.hearth.y, L.hearth.w, L.hearth.h);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.fillRect(L.hearth.x, L.hearth.y, L.hearth.w, 1.5);
        const m = L.mantel, beam = ctx.createLinearGradient(0, m.y, 0, m.y + m.h);
        beam.addColorStop(0, '#6a4526');
        beam.addColorStop(1, '#3a2312');
        ctx.fillStyle = beam;
        ctx.beginPath(); ctx.roundRect(m.x, m.y, m.w, m.h, 2); ctx.fill();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fillRect(m.x + m.w * 0.03, m.y + m.h, m.w * 0.94, Math.max(3, m.h * 0.4));
    }

    // A ginger cat, curled up asleep.
    function cat(ctx, { x, y, s }) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath(); ctx.ellipse(x, y + s * 0.3, s * 1.05, s * 0.16, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#c4772c';
        ctx.beginPath(); ctx.ellipse(x, y, s, s * 0.46, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = '#8a4a16';
        ctx.lineWidth = Math.max(1.2, s * 0.06);
        for (const q of [-0.35, -0.05, 0.25, 0.5]) { ctx.beginPath(); ctx.arc(x + q * s, y + s * 0.5, s * 0.75, -1.9, -1.25); ctx.stroke(); }
        // The tail, wrapped round to the nose.
        ctx.strokeStyle = '#c4772c';
        ctx.lineWidth = s * 0.2;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x + s * 0.9, y + s * 0.05); ctx.quadraticCurveTo(x + s * 0.7, y + s * 0.52, x - s * 0.25, y + s * 0.36); ctx.stroke();
        ctx.lineCap = 'butt';
        const hx = x - s * 0.7, hy = y + s * 0.06;
        ctx.fillStyle = '#d08434';
        ctx.beginPath(); ctx.arc(hx, hy, s * 0.36, 0, 7); ctx.fill();
        for (const side of [-1, 1]) {
            ctx.beginPath(); ctx.moveTo(hx + side * s * 0.3, hy - s * 0.18); ctx.lineTo(hx + side * s * 0.26, hy - s * 0.56); ctx.lineTo(hx + side * s * 0.04, hy - s * 0.3); ctx.fill();
        }
        ctx.strokeStyle = '#4a2408';
        ctx.lineWidth = Math.max(1, s * 0.04);
        for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(hx + side * s * 0.14, hy + s * 0.02, s * 0.08, 0.2, Math.PI - 0.2); ctx.stroke(); }
        ctx.fillStyle = '#e8a0a0';
        ctx.beginPath(); ctx.arc(hx, hy + s * 0.14, s * 0.04, 0, 7); ctx.fill();
    }

    // A poinsettia in a pot, standing on y.
    function poinsettia(ctx, x, y, s) {
        ctx.fillStyle = '#8a4a2c';
        ctx.beginPath(); ctx.moveTo(x - s * 0.5, y - s * 0.7); ctx.lineTo(x + s * 0.5, y - s * 0.7); ctx.lineTo(x + s * 0.36, y); ctx.lineTo(x - s * 0.36, y); ctx.fill();
        for (const [n, len, color] of [[7, 0.95, '#1d5a30'], [6, 0.8, '#a81c26'], [5, 0.52, '#d42a34']]) {
            ctx.fillStyle = color;
            for (let i = 0; i < n; i++) {
                const a = -Math.PI / 2 + ((i - (n - 1) / 2) / n) * 3.6;
                ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * s * len * 0.5, y - s * 0.95 + Math.sin(a) * s * len * 0.42, s * len * 0.5, s * 0.17, a, 0, 7); ctx.fill();
            }
        }
        ctx.fillStyle = '#f0d060';
        ctx.beginPath(); ctx.arc(x, y - s * 0.98, s * 0.09, 0, 7); ctx.fill();
    }

    function tv(ctx, L) {
        const f = L.frame, s = L.screen;
        if (L.stand) {
            const st = L.stand;
            ctx.fillStyle = '#17181a';
            ctx.fillRect(st.x - st.w * 0.07, st.y, st.w * 0.14, st.h);
            ctx.beginPath(); ctx.roundRect(st.x - st.w / 2, st.y + st.h - Math.max(3, st.h * 0.28), st.w, Math.max(3, st.h * 0.28), 2); ctx.fill();
        }
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.beginPath(); ctx.roundRect(f.x - 2, f.y, f.w + 4, f.h + 5, 5); ctx.fill();
        const body = ctx.createLinearGradient(0, f.y, 0, f.y + f.h);
        body.addColorStop(0, '#2b2d30');
        body.addColorStop(1, '#0c0d0e');
        ctx.fillStyle = body;
        ctx.beginPath(); ctx.roundRect(f.x, f.y, f.w, f.h, 4); ctx.fill();
        JellyfinFrames.cutScreen(ctx, s);
        ctx.fillStyle = '#d83a3a';
        ctx.beginPath(); ctx.arc(f.x + f.w - f.b * 2.2, f.y + f.h - f.b * 0.5, Math.max(0.8, f.b * 0.18), 0, 7); ctx.fill();
    }

    function paint(ctx, L, env) {
        const { w, h } = env.viewport, cfg = env.config || {}, random = X.seeded(1224), lit = cfg.xmasFire !== false, T = L.tree;
        wall(ctx, L, w, h);
        if (lit) {
            const warm = ctx.createRadialGradient(L.fire.x, L.fire.y, 0, L.fire.x, L.fire.y, Math.max(w, h) * 0.75);
            warm.addColorStop(0, 'rgba(255, 140, 60, 0.30)');
            warm.addColorStop(0.35, 'rgba(255, 120, 50, 0.10)');
            warm.addColorStop(1, 'rgba(255, 120, 50, 0)');
            ctx.fillStyle = warm;
            ctx.fillRect(0, 0, w, h);
        }
        // The rug.
        for (const [color, k] of [['#2a0c0a', 1], ['#7a2a1c', 0.96], ['#d8cdb4', 0.86], ['#5d1914', 0.8], ['#1f4a30', 0.5], ['#5d1914', 0.44]]) {
            ctx.fillStyle = color;
            ctx.beginPath(); ctx.ellipse(L.rug.x, L.rug.y, L.rug.rx * k, L.rug.ry * k, 0, 0, 7); ctx.fill();
        }
        X.outside(ctx, L.window, L, random, L.portrait ? 0.12 : 0.05);
        X.wire(ctx, L.wires[0], 1);
        if (L.bookcase) {
            cabinet(ctx, L.bookcase, 1, Math.max(4, Math.round(L.bookcase.h / 95)), random, true);
            const b = L.bookcase, top = X.strand([[b.x - 4, b.y + 3], [b.x + b.w / 2, b.y + 3], [b.x + b.w + 4, b.y + 3]], 1e9, 0.14, 0).path;
            X.garland(ctx, top, Math.max(7, b.w * 0.09), random);
            X.bow(ctx, b.x + b.w / 2, b.y + 5, Math.max(7, b.w * 0.09));
        }
        if (L.console) {
            const c = L.console;
            cabinet(ctx, c, 3, 1, random, true);
            ctx.fillStyle = '#5a3820';
            ctx.fillRect(c.x - 4, c.y - 4, c.w + 8, 6);
            const s = Math.min(c.h * 0.42, (L.frame.x - c.x) * 0.5);
            if (s > 8) { poinsettia(ctx, c.x + s * 1.0, c.y - 4, s); X.present(ctx, c.x + c.w - s * 2.1, c.y - 4, s * 1.5, s * 1.0, 2, random); }
        }
        if (L.shelf) {
            const s = L.shelf;
            ctx.fillStyle = '#5a3820';
            ctx.fillRect(s.x, s.y, s.w, s.h);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
            ctx.fillRect(s.x + 4, s.y + s.h, s.w - 8, 3);
        }
        fireplace(ctx, L, random, lit);
        // On the wall above the mantel, a wreath; on it, fir and stockings.
        const above = L.portrait ? L.shelf.y + L.shelf.h + 4 : h * 0.1, wr = Math.min(L.breast.w * 0.3, (L.mantel.y - above) * 0.36, 70);
        if (wr > 9) X.wreath(ctx, L.fp.x + L.fp.w / 2, L.mantel.y - wr * 1.5, wr, random);
        X.garland(ctx, L.swag, Math.max(7, L.mantel.h * 1.1), random);
        const n = L.portrait ? 3 : 4, ss = Math.min(L.fp.w * 0.11, (L.opening.y - L.mantel.y) * 0.5);
        for (let i = 0; i < n; i++) {
            const sx = L.fp.x + L.fp.w * (0.14 + (0.72 * i) / (n - 1));
            X.stocking(ctx, sx, L.mantel.y + L.mantel.h * 1.2, ss, ['#b8202c', '#1f6a3c', '#e9e2d0', '#b8202c'][i]);
        }
        tv(ctx, L);
        // The little tree: a pot, the fir, its lights' wire, baubles, a star, and the presents.
        ctx.fillStyle = '#3a2312';
        ctx.fillRect(T.x - T.w * 0.04, T.base - T.h * 0.05, T.w * 0.08, L.floor - T.base + T.h * 0.05);
        ctx.fillStyle = '#7c2a22';
        const pot = (L.floor - T.base) * 0.72;
        ctx.beginPath(); ctx.moveTo(T.x - T.w * 0.16, L.floor - pot); ctx.lineTo(T.x + T.w * 0.16, L.floor - pot); ctx.lineTo(T.x + T.w * 0.12, L.floor); ctx.lineTo(T.x - T.w * 0.12, L.floor); ctx.fill();
        const half = X.tree(ctx, T, random);
        for (const path of L.treeWires) X.wire(ctx, path, 0.8);
        const count = Math.round(T.h / 16);
        for (let i = 0; i < count; i++) {
            const y = T.base - T.h * (0.04 + random() * 0.8), x = T.x + (random() * 2 - 1) * half(y) * 0.82;
            X.bauble(ctx, x, y, Math.max(2.5, T.w * 0.028) * (0.8 + random() * 0.5), i, i % 3);
        }
        X.star(ctx, T.x, T.base - T.h - T.w * 0.03, Math.max(6, T.w * 0.09));
        const pw = T.w * 0.36;
        X.present(ctx, T.x - T.w * 0.62, L.floor + 2, pw, pw * 0.7, 0, random);
        X.present(ctx, T.x + T.w * 0.2, L.floor + 3, pw * 0.8, pw * 0.9, 3, random);
        X.present(ctx, T.x - T.w * 0.5, L.floor + 2 - pw * 0.7, pw * 0.6, pw * 0.42, 5, random);
        X.present(ctx, T.x - T.w * 0.2, L.floor + 5, pw * 0.62, pw * 0.5, 6, random);
        X.bulbs(ctx, L.bulbs, cfg);
        if (cfg.xmasCat !== false) cat(ctx, L.cat);
        // The room's dark corners (not over the screen).
        const corners = ctx.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.4, w / 2, h * 0.55, Math.hypot(w, h) * 0.62);
        corners.addColorStop(0, 'rgba(0, 0, 0, 0)');
        corners.addColorStop(1, lit ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 4, 0.62)');
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, w, h);
        ctx.rect(L.screen.x, L.screen.y, L.screen.w, L.screen.h);
        ctx.clip('evenodd');
        ctx.fillStyle = corners;
        ctx.fillRect(0, 0, w, h);
        if (!lit) { ctx.fillStyle = 'rgba(4, 8, 20, 0.3)'; ctx.fillRect(0, 0, w, h); }
        ctx.restore();
    }

    // Snow only where there is glass to see it through: the panes, less the TV and the tree in front.
    function clipToGlass(ctx, L, w, h) {
        ctx.beginPath();
        for (const p of L.panes) ctx.rect(p.x, p.y, p.w, p.h);
        ctx.clip();
        const f = L.frame, T = L.tree;
        ctx.beginPath();
        ctx.rect(0, 0, w, h);
        ctx.rect(f.x - 2, f.y - 2, f.w + 4, h);
        ctx.clip('evenodd');
        ctx.beginPath();
        ctx.rect(0, 0, w, h);
        ctx.moveTo(T.x, T.base - T.h * 1.12);
        ctx.lineTo(T.x + T.w * 0.62, T.base + 4);
        ctx.lineTo(T.x - T.w * 0.62, T.base + 4);
        ctx.closePath();
        ctx.clip('evenodd');
    }

    JellyfinFrames.add({
        id: 'snowed-in',
        name: 'Snowed In',
        icon: '☃️',
        videoFilter: 'saturate(1.04)',
        layout,
        paint,
        transition(kind, env) { dim.start(kind, env); },
        tick(ctx, t, L, env) {
            const { w, h } = env.viewport, cfg = env.config || {}, s = L.screen, n = env.motion ? Math.floor(t / X.STEP) : 0;
            const dt = env.motion ? Math.min(0.1, Math.max(0, (t - lastT) / 1000)) : 0;
            lastT = t;
            // Outside: the snow.
            ctx.save();
            clipToGlass(ctx, L, w, h);
            X.weather(ctx, flakes, L.glass, dt, cfg, env);
            ctx.restore();
            // Inside: the fire and its light on the walls, then every bulb.
            if (cfg.xmasFire !== false) {
                const flick = X.flicker(n), R = Math.max(w, h) * 0.5;
                ctx.save();
                ctx.beginPath();
                ctx.rect(0, 0, w, h);
                ctx.rect(s.x, s.y, s.w, s.h);
                ctx.clip('evenodd');
                ctx.globalAlpha = 0.05 + flick * 0.1;
                ctx.drawImage(X.glow('255, 150, 70'), L.fire.x - R, L.fire.y - R * 0.9, R * 2, R * 1.8);
                ctx.restore();
                ctx.save();
                ctx.beginPath(); ctx.rect(L.opening.x, L.opening.y, L.opening.w, L.opening.h); ctx.clip();
                X.fire(ctx, L.fire, n);
                ctx.restore();
            }
            X.shine(ctx, L.bulbs, cfg, t, env.motion, false, 4.6);
            dim.draw(ctx, t, env, s);
            if (dim.busy(t)) return 33;
            return env.motion ? X.STEP - (t % X.STEP) + 1 : Infinity;
        },
        idle(ctx, L, env, kind) { X.idle(ctx, L.screen, kind, 'den'); },
        cue(ctx, text, L) {
            JellyfinFrames.drawCue(ctx, text, L.screen, { font: '600 {size}px system-ui, sans-serif', color: '#fff', box: 'rgba(0, 0, 0, 0.6)', bottom: 0.07 });
        },
    });
})();
