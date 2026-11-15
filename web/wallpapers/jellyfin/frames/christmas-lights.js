// Christmas Lights: the video nearly fills the screen, and a string of
// lights hangs round it, twinkling. A fir garland lies along the top with
// its tails down the sides, a bow at each corner and holly between. Where
// the screen leaves room (an upright phone), baubles hang from the top and
// presents wait along the bottom.
//
// Options (env.config): xmasBulbs (big or mini), xmasGarland, xmasBows,
// xmasColors and xmasPattern. Cheap: the art is painted once; the overlay
// is one baked glow per bulb, twelve times a second, and still on Low.

(() => {
    'use strict';
    const X = JellyfinXmas;
    const dim = X.dimmer();

    function layout(w, h, aspect, env) {
        const cfg = env.config || {}, big = cfg.xmasBulbs !== 'mini', bottom = h - env.insets.bottom;
        const m = Math.max(20, Math.min(56, Math.min(w, h) * 0.06)) * (big ? 1.15 : 0.9);
        const up = m * (cfg.xmasGarland ? 1.55 : 1);
        const screen = { ...JellyfinFrames.fit({ x: m, y: up, w: w - m * 2, h: bottom - up - m }, aspect), radius: 5 };
        const b = Math.max(3, Math.min(w, h) * 0.007), r = big ? Math.max(3, m * 0.085) : Math.max(1.8, m * 0.06);
        const frame = { x: screen.x - b, y: screen.y - b, w: screen.w + b * 2, h: screen.h + b * 2, b };
        // The strand, clockwise from the top left: each side in equal spans.
        const gap = big ? r * 4.4 : r * 2.4, off = m * 0.36;
        const x0 = frame.x - off * 0.5, x1 = frame.x + frame.w + off * 0.5, y0 = frame.y - off, y1 = frame.y + frame.h + off * 0.3;
        const side = (ax, ay, bx, by) => {
            const n = Math.max(2, Math.round(Math.hypot(bx - ax, by - ay) / (m * 2.6)));
            return Array.from({ length: n + 1 }, (_, i) => [ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n]);
        };
        const spacing = big ? r * 5.2 : r * 4.6, bulbs = [], wires = [];
        for (const [hooks, dir, sag] of [[side(x0, y0, x1, y0), [0, 1], 0.09], [side(x1, y0, x1, y1), [1, 0], 0.05], [side(x1, y1, x0, y1), [0, 1], 0.07], [side(x0, y1, x0, y0), [-1, 0], 0.05]]) {
            const s = X.strand(hooks, spacing, sag, r, bulbs.length, dir);
            wires.push(s.path);
            bulbs.push(...s.bulbs);
        }
        return { screen, frame, m, r, big, gap, bulbs, wires, bottom, top: up, x0, x1, y0, y1, portrait: h > w * 1.1 };
    }

    function paint(ctx, L, env) {
        const { w, h } = env.viewport, cfg = env.config || {}, random = X.seeded(1224), s = L.screen, f = L.frame;
        // A dark green wall, a little lighter round the screen, with a faint print of stars.
        const wall = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) * 0.6);
        wall.addColorStop(0, '#16261d');
        wall.addColorStop(1, '#070d0a');
        ctx.fillStyle = wall;
        ctx.fillRect(0, 0, w, h);
        const tile = X.bake(56, 56, 1, c => {
            c.strokeStyle = 'rgba(200, 220, 190, 0.05)';
            c.lineWidth = 1;
            for (const [x, y, r] of [[14, 14, 6], [42, 42, 6], [42, 12, 2.5], [12, 42, 2.5]]) {
                for (let i = 0; i < 3; i++) { const a = (i * Math.PI) / 3; c.beginPath(); c.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r); c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); c.stroke(); }
            }
        });
        ctx.fillStyle = ctx.createPattern(tile, 'repeat');
        ctx.fillRect(0, 0, w, h);

        // Room to spare above: baubles and stars on threads. Below: presents.
        const above = f.y - L.m * 1.6, below = L.bottom - (f.y + f.h) - L.m * 0.9;
        if (above > 60) {
            const n = Math.max(3, Math.round(w / 74));
            for (let i = 0; i < n; i++) {
                const x = ((i + 0.5 + (random() - 0.5) * 0.5) / n) * w, r = Math.min(22, Math.max(8, above * 0.09)) * (0.7 + random() * 0.6);
                const y = Math.max(r * 2.4, above * (0.2 + random() * 0.62));
                ctx.strokeStyle = 'rgba(210, 200, 160, 0.4)';
                ctx.lineWidth = 0.8;
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, y - r * 1.4); ctx.stroke();
                if (i % 4 === 2) X.star(ctx, x, y, r * 1.1);
                else X.bauble(ctx, x, y, r, i + ((random() * 2) | 0), (random() * 3) | 0);
            }
        }
        if (below > 70) {
            const floor = L.bottom - Math.max(6, below * 0.06);
            ctx.fillStyle = '#0a0f0c';
            ctx.fillRect(0, floor, w, h - floor);
            ctx.fillStyle = 'rgba(214, 196, 150, 0.12)';
            ctx.fillRect(0, floor, w, 1.5);
            let x = w * 0.04, i = 0;
            while (x < w * 0.94) {
                const bw = Math.min(w * 0.3, w * 0.96 - x, below * (0.34 + random() * 0.4)), bh = Math.min(below * 0.78, bw * (0.55 + random() * 0.7));
                if (bw < 34) break;
                X.present(ctx, x, floor, bw, bh, i++ + ((random() * 3) | 0), random);
                x += bw * (0.86 + random() * 0.3);
            }
        }

        // The set itself: a thin dark bezel with a soft shadow behind it.
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.beginPath(); ctx.roundRect(f.x - 3, f.y - 1, f.w + 6, f.h + 8, s.radius + f.b + 3); ctx.fill();
        const bezel = ctx.createLinearGradient(0, f.y, 0, f.y + f.h);
        bezel.addColorStop(0, '#2a2c2e');
        bezel.addColorStop(1, '#0e0f10');
        ctx.fillStyle = bezel;
        ctx.beginPath(); ctx.roundRect(f.x, f.y, f.w, f.h, s.radius + f.b); ctx.fill();
        JellyfinFrames.cutScreen(ctx, s);

        // The garland: scallops along the top, a tail down each side.
        if (cfg.xmasGarland) {
            const thick = L.m * 0.52, y = L.y0 - L.m * 0.42, n = Math.max(2, Math.round((L.x1 - L.x0) / (L.m * 7)));
            const hooks = Array.from({ length: n + 1 }, (_, i) => [L.x0 + ((L.x1 - L.x0) * i) / n, y]);
            const top = X.strand(hooks, 1e9, 0.045, 0).path;
            const tail = Math.min(f.h * 0.42, L.m * 7);
            X.garland(ctx, [[L.x0 - thick * 0.2, y + tail], [L.x0 - thick * 0.5, y + tail * 0.5], ...top, [L.x1 + thick * 0.5, y + tail * 0.5], [L.x1 + thick * 0.2, y + tail]], thick, random);
            if (cfg.xmasBows) {
                for (let i = 1; i < n; i++) X.holly(ctx, hooks[i][0], y + thick * 0.2, thick * 0.9, (random() - 0.5) * 0.6);
                for (let i = 0; i < n * 5; i++) {
                    const [bx, by] = top[(random() * top.length) | 0];
                    ctx.fillStyle = '#c8202a';
                    ctx.beginPath(); ctx.arc(bx + (random() - 0.5) * thick, by + (random() - 0.5) * thick * 0.8, Math.max(1.4, thick * 0.11), 0, 7); ctx.fill();
                }
            }
        }
        for (const path of L.wires) X.wire(ctx, path, Math.max(1, L.r * 0.3));
        X.bulbs(ctx, L.bulbs, cfg, L.big);
        if (cfg.xmasBows) {
            const size = L.m * (cfg.xmasGarland ? 0.62 : 0.5), y = cfg.xmasGarland ? L.y0 - L.m * 0.42 : L.y0;
            X.bow(ctx, L.x0, y, size);
            X.bow(ctx, L.x1, y, size);
            if (!cfg.xmasGarland) { X.holly(ctx, L.x0, L.y1, size * 0.9, -2.2); X.holly(ctx, L.x1, L.y1, size * 0.9, 2.2); }
        }
    }

    JellyfinFrames.add({
        id: 'christmas-lights',
        name: 'Christmas Lights',
        icon: '✨',
        layout,
        paint,
        transition(kind, env) { dim.start(kind, env); },
        tick(ctx, t, L, env) {
            X.shine(ctx, L.bulbs, env.config, t, env.motion, L.big, L.big ? 3.6 : 4.4);
            dim.draw(ctx, t, env, L.screen);
            if (dim.busy(t)) return 33;
            if (!env.motion || (env.config?.xmasPattern || 'twinkle') === 'steady') return Infinity;
            return X.STEP - (t % X.STEP) + 1;
        },
        idle(ctx, L, env, kind) { X.idle(ctx, L.screen, kind, 'lights'); },
        cue(ctx, text, L) {
            JellyfinFrames.drawCue(ctx, text, L.screen, { font: '600 {size}px Georgia, "Iowan Old Style", serif', color: '#fff6e0', box: 'rgba(8, 16, 11, 0.62)', bottom: 0.07 });
        },
    });
})();
