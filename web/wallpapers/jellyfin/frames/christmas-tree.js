// Christmas Tree: a big tree, floor to ceiling, strung with lights and
// hung with baubles and candy canes, and among them one ornament in the
// shape of a little red television, where the video plays. Presents are
// heaped underneath with a teddy bear among them; milk and biscuits are
// left out on a side table; and through the window it is snowing.
//
// Options (env.config): xmasTv (the ornament: small, medium, large),
// xmasTopper (star, bow, none), xmasPresents, xmasSnow, xmasColors and
// xmasPattern. Cheap: the room is painted once; the overlay is a baked
// glow per bulb and the flakes as small rects, twelve times a second, and
// one still on Low.

(() => {
    'use strict';
    const X = JellyfinXmas;
    const dim = X.dimmer();
    const SIZES = { small: 0.3, medium: 0.42, large: 0.58 };   // the ornament's screen, as a share of the tree's width
    let flakes = [], lastT = 0;

    function layout(w, h, aspect, env) {
        const cfg = env.config || {}, portrait = h > w * 1.1, safe = h - env.insets.bottom;
        const floor = safe - Math.max(34, h * (portrait ? 0.08 : 0.1));
        const base = floor - h * 0.035, top = h * (cfg.xmasTopper === 'none' ? 0.05 : 0.1);
        const th = base - top, tw = Math.min(w * (portrait ? 0.98 : 0.6), th * (portrait ? 0.74 : 0.84));
        const T = { x: w / 2, base, w: tw, h: th };
        const half = y => (tw / 2) * Math.pow(X.clamp01((y - top) / th), 0.92);
        // The ornament: a screen, a body round it, hung where the tree is wide enough to carry it.
        const W = tw * (SIZES[cfg.xmasTv] || SIZES.medium), S = W / aspect, pad = Math.max(4, S * 0.13);
        const body = { w: W + pad * 2, h: S + pad * 2 + S * 0.2 };
        let cy = base - th * 0.36;
        while (half(cy - body.h / 2) < body.w * 0.42 && cy < base - body.h * 0.7) cy += th * 0.02;
        body.x = T.x - body.w / 2;
        body.y = cy - body.h / 2;
        const screen = { x: T.x - W / 2, y: body.y + pad, w: W, h: S, radius: Math.max(3, S * 0.07) };
        const L = { portrait, floor, safe, tree: T, top, half, screen, body, pad };

        // Strands of lights, zigzagging down the tree; none behind the ornament.
        const r = Math.max(1.8, tw * 0.0052), clear = p => p.x < body.x - r * 3 || p.x > body.x + body.w + r * 3 || p.y < body.y - body.h * 0.2 || p.y > body.y + body.h + r * 3;
        const sweeps = Math.max(6, Math.round(th / 46));
        L.bulbs = [];
        L.wires = [];
        for (let k = 0; k < sweeps; k++) {
            const y0 = base - th * (0.05 + (0.84 * k) / sweeps), y1 = y0 - th * 0.06, side = k % 2 ? 1 : -1;
            const s = X.strand([[T.x - side * half(y0) * 0.94, y0], [T.x + side * half(y1) * 0.94, y1]], r * 7, 0.09, r, L.bulbs.length);
            L.wires.push(s.path);
            for (const b of s.bulbs) if (clear(b)) L.bulbs.push({ ...b, i: L.bulbs.length });
        }
        L.clear = clear;
        // The room's sides, where there is room: a window on the left, a table on the right.
        const side = T.x - tw / 2;
        if (!portrait && side > 150) {
            const ww = Math.min(side * 0.74, h * 0.34), wy = h * 0.13;
            L.window = { x: Math.max(w * 0.03, side * 0.42 - ww / 2), y: wy, w: ww, h: Math.min(h * 0.4, ww * 1.25) };
            L.sash = X.sash(L.window);
            L.table = { x: w - side * 0.5, w: Math.min(side * 0.5, h * 0.24), h: Math.min(floor * 0.3, h * 0.24) };
        }
        return L;
    }

    // ---- The room ------------------------------------------------------------------

    function room(ctx, L, w, h) {
        const wall = ctx.createLinearGradient(0, 0, 0, L.floor);
        wall.addColorStop(0, '#121a26');
        wall.addColorStop(1, '#232b38');
        ctx.fillStyle = wall;
        ctx.fillRect(0, 0, w, L.floor);
        // Wainscot under a rail.
        const rail = L.floor - Math.max(60, h * 0.24);
        ctx.fillStyle = '#1b222d';
        ctx.fillRect(0, rail, w, L.floor - rail);
        const pw = Math.max(70, (L.floor - rail) * 0.8), inset = Math.max(6, (L.floor - rail) * 0.12);
        for (let x = (w / 2) % pw - pw; x < w; x += pw) {
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
            ctx.lineWidth = 2;
            ctx.strokeRect(x + inset, rail + inset, pw - inset * 2, L.floor - rail - inset * 2.2);
            ctx.strokeStyle = 'rgba(190, 210, 240, 0.05)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x + inset + 2, rail + inset + 2, pw - inset * 2, L.floor - rail - inset * 2.2);
        }
        ctx.fillStyle = '#2d3644';
        ctx.fillRect(0, rail - 3, w, 6);
        const boards = ctx.createLinearGradient(0, L.floor, 0, h);
        boards.addColorStop(0, '#4a3020');
        boards.addColorStop(1, '#1a100a');
        ctx.fillStyle = boards;
        ctx.fillRect(0, L.floor, w, h - L.floor);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.lineWidth = 1;
        for (let y = L.floor + 5, i = 0; y < h; y += 5 + i * 2.5, i++) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
        // The tree's own light on the wall behind it.
        const T = L.tree, warm = ctx.createRadialGradient(T.x, T.base - T.h * 0.4, 0, T.x, T.base - T.h * 0.4, T.h * 0.9);
        warm.addColorStop(0, 'rgba(255, 200, 120, 0.22)');
        warm.addColorStop(1, 'rgba(255, 200, 120, 0)');
        ctx.fillStyle = warm;
        ctx.fillRect(0, 0, w, h);
    }

    // Milk and biscuits, left out on a little round table.
    function table(ctx, t, floor) {
        const top = floor - t.h, tw = t.w;
        ctx.fillStyle = '#3a2414';
        ctx.fillRect(t.x - tw * 0.04, top, tw * 0.08, t.h);
        ctx.beginPath(); ctx.ellipse(t.x, floor, tw * 0.28, Math.max(3, tw * 0.05), 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#5a3a20';
        ctx.beginPath(); ctx.ellipse(t.x, top, tw * 0.5, Math.max(4, tw * 0.09), 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#b8202c';
        ctx.beginPath(); ctx.ellipse(t.x, top - 1, tw * 0.4, Math.max(3, tw * 0.065), 0, 0, 7); ctx.fill();
        // A plate of biscuits.
        const px = t.x - tw * 0.12, s = tw * 0.1;
        ctx.fillStyle = '#eee8dc';
        ctx.beginPath(); ctx.ellipse(px, top - s * 0.15, s * 1.7, s * 0.42, 0, 0, 7); ctx.fill();
        for (const [dx, dy] of [[-0.8, -0.35], [0.5, -0.35], [-0.15, -0.6]]) {
            ctx.fillStyle = '#c08a4a';
            ctx.beginPath(); ctx.ellipse(px + dx * s, top + dy * s, s * 0.62, s * 0.26, 0, 0, 7); ctx.fill();
            ctx.fillStyle = '#4a2a14';
            for (const q of [-0.3, 0.05, 0.32]) { ctx.beginPath(); ctx.arc(px + (dx + q) * s, top + (dy - 0.04 + q * 0.2) * s, Math.max(0.8, s * 0.07), 0, 7); ctx.fill(); }
        }
        // A glass of milk.
        const gx = t.x + tw * 0.2, gh = s * 1.9;
        ctx.fillStyle = 'rgba(220, 235, 250, 0.25)';
        ctx.fillRect(gx - s * 0.5, top - gh, s, gh);
        ctx.fillStyle = '#f4f2ea';
        ctx.fillRect(gx - s * 0.44, top - gh * 0.78, s * 0.88, gh * 0.76);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.fillRect(gx - s * 0.36, top - gh * 0.95, s * 0.12, gh * 0.85);
    }

    // A teddy bear, sitting, with a red bow.
    function teddy(ctx, x, y, s) {
        const fur = '#9a6a3a', dark = '#7a5028', pale = '#d8b88a';
        ctx.fillStyle = dark;
        for (const side of [-1, 1]) {
            ctx.beginPath(); ctx.ellipse(x + side * s * 0.62, y - s * 0.18, s * 0.34, s * 0.22, side * 0.3, 0, 7); ctx.fill();
            ctx.beginPath(); ctx.ellipse(x + side * s * 0.58, y - s * 0.85, s * 0.2, s * 0.36, side * -0.5, 0, 7); ctx.fill();
            ctx.beginPath(); ctx.arc(x + side * s * 0.42, y - s * 1.82, s * 0.2, 0, 7); ctx.fill();
        }
        ctx.fillStyle = fur;
        ctx.beginPath(); ctx.ellipse(x, y - s * 0.62, s * 0.56, s * 0.64, 0, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(x, y - s * 1.5, s * 0.48, 0, 7); ctx.fill();
        ctx.fillStyle = pale;
        ctx.beginPath(); ctx.ellipse(x, y - s * 0.55, s * 0.32, s * 0.4, 0, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x, y - s * 1.38, s * 0.24, s * 0.19, 0, 0, 7); ctx.fill();
        for (const side of [-1, 1]) {
            ctx.beginPath(); ctx.ellipse(x + side * s * 0.72, y - s * 0.16, s * 0.14, s * 0.16, 0, 0, 7); ctx.fill();
            ctx.beginPath(); ctx.arc(x + side * s * 0.42, y - s * 1.82, s * 0.1, 0, 7); ctx.fill();
        }
        ctx.fillStyle = '#1a100a';
        for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(x + side * s * 0.18, y - s * 1.6, s * 0.05, 0, 7); ctx.fill(); }
        ctx.beginPath(); ctx.ellipse(x, y - s * 1.43, s * 0.07, s * 0.05, 0, 0, 7); ctx.fill();
        X.bow(ctx, x, y - s * 1.08, s * 0.24);
    }

    // A candy cane hooked over a bough at (x, y).
    function cane(ctx, x, y, s, flip) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(flip ? -1 : 1, 1);
        ctx.lineCap = 'round';
        const path = () => { ctx.beginPath(); ctx.moveTo(0, s * 2.4); ctx.lineTo(0, s * 0.6); ctx.arc(s * 0.6, s * 0.6, s * 0.6, Math.PI, 0); ctx.lineTo(s * 1.2, s * 0.9); };
        ctx.lineWidth = s * 0.42;
        ctx.strokeStyle = '#f4f0e6';
        path(); ctx.stroke();
        ctx.strokeStyle = '#d0202c';
        ctx.setLineDash([s * 0.36, s * 0.42]);
        path(); ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineCap = 'butt';
        ctx.restore();
    }

    // The ornament: a little red television on a ribbon, with rabbit ears, two knobs and stubby feet.
    function ornament(ctx, L) {
        const b = L.body, s = L.screen, p = L.pad, cx = b.x + b.w / 2, r = Math.max(5, b.h * 0.12);
        // The ribbon up to its bough, and the gold cap it hangs by.
        ctx.strokeStyle = '#d8b24a';
        ctx.lineWidth = Math.max(1.2, p * 0.16);
        ctx.beginPath(); ctx.moveTo(cx, b.y - p * 0.5); ctx.lineTo(cx, b.y - b.h * 0.2); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, b.y - p * 0.75, p * 0.3, 0, 7); ctx.stroke();
        // Rabbit ears.
        ctx.strokeStyle = '#b9bcc4';
        ctx.lineWidth = Math.max(1, p * 0.13);
        for (const side of [-1, 1]) {
            ctx.beginPath(); ctx.moveTo(cx + side * p * 0.5, b.y); ctx.lineTo(cx + side * b.w * 0.3, b.y - b.h * 0.26); ctx.stroke();
            ctx.fillStyle = '#e8c765';
            ctx.beginPath(); ctx.arc(cx + side * b.w * 0.3, b.y - b.h * 0.26, Math.max(1.5, p * 0.2), 0, 7); ctx.fill();
        }
        ctx.fillStyle = '#c9a548';
        ctx.beginPath(); ctx.roundRect(cx - p * 0.9, b.y - p * 0.45, p * 1.8, p * 0.6, p * 0.2); ctx.fill();
        // Feet, a shadow on the boughs, then the body.
        ctx.fillStyle = '#7c121c';
        for (const side of [-1, 1]) { ctx.beginPath(); ctx.roundRect(cx + side * b.w * 0.3 - p * 0.5, b.y + b.h - p * 0.2, p, p * 0.7, p * 0.2); ctx.fill(); }
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath(); ctx.roundRect(b.x - 2, b.y + 3, b.w + 4, b.h + 3, r); ctx.fill();
        const shell = ctx.createLinearGradient(b.x, b.y, b.x + b.w * 0.3, b.y + b.h);
        shell.addColorStop(0, '#e2404a');
        shell.addColorStop(0.5, '#c0202c');
        shell.addColorStop(1, '#84121c');
        ctx.fillStyle = shell;
        ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, r); ctx.fill();
        // A cream bezel round the glass, and the controls under it.
        ctx.fillStyle = '#efe6d0';
        ctx.beginPath(); ctx.roundRect(s.x - p * 0.34, s.y - p * 0.34, s.w + p * 0.68, s.h + p * 0.68, s.radius + p * 0.34); ctx.fill();
        ctx.fillStyle = '#0a0a0a';
        ctx.beginPath(); ctx.roundRect(s.x - 1, s.y - 1, s.w + 2, s.h + 2, s.radius + 1); ctx.fill();
        JellyfinFrames.cutScreen(ctx, s);
        const ky = s.y + s.h + (b.y + b.h - s.y - s.h) * 0.55, kr = Math.max(2, s.h * 0.055);
        for (const [dx, color] of [[-0.36, '#e8c765'], [-0.22, '#e8c765']]) {
            ctx.fillStyle = color;
            ctx.beginPath(); ctx.arc(cx + dx * b.w, ky, kr, 0, 7); ctx.fill();
            ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
            ctx.fillRect(cx + dx * b.w - kr * 0.12, ky - kr, kr * 0.24, kr);
        }
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        for (let i = 0; i < 6; i++) ctx.fillRect(cx + b.w * (0.08 + i * 0.055), ky - kr * 0.8, Math.max(1, b.w * 0.018), kr * 1.6);
        // The shell's shine.
        ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.beginPath(); ctx.roundRect(b.x + r * 0.5, b.y + p * 0.2, b.w - r, Math.max(1.5, p * 0.2), p * 0.1); ctx.fill();
    }

    function paint(ctx, L, env) {
        const { w, h } = env.viewport, cfg = env.config || {}, random = X.seeded(1225), T = L.tree, half = L.half;
        room(ctx, L, w, h);
        if (L.window) {
            X.outside(ctx, L.window, L.sash, random, 0.2);
            const win = L.window;
            X.wreath(ctx, win.x + win.w / 2, win.y + win.h * 0.5, Math.min(win.w, win.h) * 0.2, random);
        }
        if (L.table) table(ctx, L.table, L.floor);
        // A garland along the ceiling.
        const n = Math.max(2, Math.round(w / 260));
        X.garland(ctx, X.strand(Array.from({ length: n + 1 }, (_, i) => [(w * i) / n, -2]), 1e9, 0.1, 0).path, Math.max(9, h * 0.022), random);
        // The skirt, the trunk, then the tree.
        ctx.fillStyle = '#8a1620';
        ctx.beginPath(); ctx.ellipse(T.x, L.floor + (L.safe - L.floor) * 0.2, T.w * 0.4, Math.max(8, (L.safe - L.floor) * 0.42), 0, 0, 7); ctx.fill();
        ctx.strokeStyle = '#f1ece0';
        ctx.lineWidth = Math.max(2, T.w * 0.012);
        ctx.stroke();
        ctx.fillStyle = '#3a2312';
        ctx.fillRect(T.x - T.w * 0.03, T.base - T.h * 0.06, T.w * 0.06, L.floor - T.base + T.h * 0.06 + 4);
        X.tree(ctx, T, random);
        for (const path of L.wires) X.wire(ctx, path, 0.9);
        // Baubles and candy canes, wherever the ornament isn't.
        const count = Math.round((T.w * T.h) / 2600), br = Math.max(4, T.w * 0.021);
        const body = L.body, off = (x, y, m) => x < body.x - m || x > body.x + body.w + m || y < body.y - body.h * 0.28 || y > body.y + body.h + m;
        for (let i = 0; i < count; i++) {
            const y = L.top + T.h * (0.1 + 0.87 * Math.sqrt(random())), x = T.x + (random() * 2 - 1) * half(y) * 0.84, r = br * (0.75 + random() * 0.65);
            if (!off(x, y, r * 1.6)) continue;
            if (i % 7 === 3) cane(ctx, x, y - r, r * 0.9, random() < 0.5);
            else X.bauble(ctx, x, y, r, i, i % 3);
        }
        X.bulbs(ctx, L.bulbs, cfg);
        ornament(ctx, L);
        if (cfg.xmasTopper === 'bow') X.bow(ctx, T.x, L.top + T.w * 0.01, Math.max(9, T.w * 0.07), '#d8b24a', '#9a7a22');
        else if (cfg.xmasTopper !== 'none') X.star(ctx, T.x, L.top - T.w * 0.012, Math.max(10, T.w * 0.075));
        // Presents, heaped: a back row, then a front row, and the bear.
        if (cfg.xmasPresents !== false) {
            const unit = Math.min(T.w * 0.2, (L.safe - L.floor) * 2.4, h * 0.14), reach = Math.min(w * 0.48, T.w * 0.72);
            let pick = 0;
            for (const [row, ground, scale] of [[0, L.floor + 2, 1], [1, L.floor + (L.safe - L.floor) * 0.42, 0.74]]) {
                let x = T.x - reach + row * unit * 0.4;
                while (x < T.x + reach - unit * 0.5) {
                    const bw = unit * scale * (0.7 + random() * 0.7), bh = unit * scale * (0.5 + random() * 0.75);
                    if (row === 1 && Math.abs(x + bw / 2 - T.x) < unit * 0.5) { x += unit * 0.7; continue; }   // leave the bear his seat
                    X.present(ctx, x, ground, bw, bh, pick++, random);
                    if (row === 0 && random() < 0.4) X.present(ctx, x + bw * 0.15, ground - bh, bw * 0.62, bh * 0.5, pick++, random);
                    x += bw * (0.9 + random() * 0.35);
                }
            }
            teddy(ctx, T.x, L.floor + (L.safe - L.floor) * 0.5, unit * 0.36);
        }
        // The room's dark corners (not over the screen).
        const corners = ctx.createRadialGradient(w / 2, h * 0.5, Math.min(w, h) * 0.4, w / 2, h * 0.5, Math.hypot(w, h) * 0.62);
        corners.addColorStop(0, 'rgba(0, 0, 0, 0)');
        corners.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, w, h);
        ctx.roundRect(L.screen.x, L.screen.y, L.screen.w, L.screen.h, L.screen.radius);
        ctx.clip('evenodd');
        ctx.fillStyle = corners;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
    }

    JellyfinFrames.add({
        id: 'christmas-tree',
        name: 'Christmas Tree',
        icon: '🎄',
        layout,
        paint,
        transition(kind, env) { dim.start(kind, env); },
        tick(ctx, t, L, env) {
            const cfg = env.config || {}, T = L.tree, n = env.motion ? Math.floor(t / X.STEP) : 0;
            const dt = env.motion ? Math.min(0.1, Math.max(0, (t - lastT) / 1000)) : 0;
            lastT = t;
            if (L.window) {
                // The snow, behind the wreath that hangs in the window.
                const win = L.window, wr = Math.min(win.w, win.h) * 0.2;
                ctx.save();
                ctx.beginPath();
                for (const p of L.sash.panes) ctx.rect(p.x, p.y, p.w, p.h);
                ctx.clip();
                ctx.beginPath();
                ctx.rect(0, 0, env.viewport.w, env.viewport.h);
                ctx.arc(win.x + win.w / 2, win.y + win.h * 0.52, wr * 1.25, 0, 7);
                ctx.clip('evenodd');
                X.weather(ctx, flakes, L.sash.glass, dt, cfg, env);
                ctx.restore();
            }
            X.shine(ctx, L.bulbs, cfg, t, env.motion, false, 4.4);
            if (cfg.xmasTopper !== 'none' && cfg.xmasTopper !== 'bow') {
                // The star breathes.
                const R = T.w * 0.2 * (0.9 + 0.1 * X.flicker(Math.floor(n / 3)));
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = 0.5 + 0.25 * X.flicker(Math.floor(n / 3));
                ctx.drawImage(X.glow('255, 224, 140'), T.x - R, L.top - T.w * 0.012 - R, R * 2, R * 2);
                ctx.restore();
            }
            dim.draw(ctx, t, env, L.screen);
            if (dim.busy(t)) return 33;
            return env.motion ? X.STEP - (t % X.STEP) + 1 : Infinity;
        },
        idle(ctx, L, env, kind) { X.idle(ctx, L.screen, kind, 'tree'); },
        cue(ctx, text, L) {
            JellyfinFrames.drawCue(ctx, text, L.screen, { font: '600 {size}px system-ui, sans-serif', size: Math.max(9, Math.min(22, L.screen.h * 0.075)), color: '#fff', box: 'rgba(0, 0, 0, 0.6)', bottom: 0.07 });
        },
    });
})();
