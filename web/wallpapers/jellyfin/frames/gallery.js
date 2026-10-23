// Gallery: the video hangs as an old master on a museum wall. A carved gilt
// frame with corner cartouches, a twisted-rope torus and a row of beads,
// around a linen liner; a brass picture light above, its warm wash baked
// into the damask; a brass plaque beneath: "*Title* (Year). Moving pictures
// on canvas." A velvet rope keeps visitors back (a bench, on an upright
// phone). Dust drifts in the light. Between items the picture is rehung,
// fading through a primed canvas; on pause the lights go down.

(() => {
    'use strict';

    const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';
    const WALL = ['#1b3a33', '#16302a', '#0f221d'];
    // The gilt moulding's profile, outer edge to inner: torus, cove, ridge, bead band, sight edge.
    const PROFILE = [[0, '#2a1c06'], [0.04, '#8c6420'], [0.1, '#f2d98c'], [0.17, '#b58630'], [0.27, '#5a3c11'], [0.38, '#a57a2a'],
        [0.46, '#ecd07c'], [0.53, '#8a6220'], [0.6, '#5e4113'], [0.67, '#7d5a1d'], [0.75, '#cfa246'], [0.82, '#f7e7a6'],
        [0.89, '#a07428'], [0.95, '#4a3210'], [1, '#22170a']];
    const CHANGE_MS = 1500, DIM_MS = 800, LIFT_MS = 600;
    const MOTE_MS = 100;

    const seeded = seed => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const sprite = (w, h, draw) => {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.ceil(w));
        canvas.height = Math.max(1, Math.ceil(h));
        draw(canvas.getContext('2d'));
        return canvas;
    };

    function layout(w, h, aspect, env) {
        const floor = h - env.insets.bottom - Math.max(10, h * 0.035);
        const portrait = h > w * 1.1;
        const dado = floor - (portrait ? h * 0.17 : h * 0.15);
        const top = Math.max(12, h * 0.03);
        // The stack, in screen widths: the lamp above, the frame (moulding 0.072
        // and liner 0.028 each side), the plaque below and the gaps.
        const kM = 0.072, kL = 0.028, lamp = 0.12, below = 0.16;
        const tall = 1 / aspect + 2 * (kM + kL) + lamp + below;
        const sw = Math.min(w * (portrait ? 0.72 : 0.64), (dado - top - 8) / tall);
        const sh = sw / aspect;
        const m = sw * kM, l = sw * kL;
        const free = dado - top - sw * tall;
        const y0 = top + Math.max(0, free) * (portrait ? 0.55 : 0.45) + sw * lamp;
        const screen = { x: (w - sw) / 2, y: y0 + m + l, w: sw, h: sh, radius: 0 };
        const liner = { x: screen.x - l, y: screen.y - l, w: sw + l * 2, h: sh + l * 2 };
        const frame = { x: liner.x - m, y: liner.y - m, w: liner.w + m * 2, h: liner.h + m * 2 };
        const hoodW = frame.w * 0.4, hoodH = Math.max(7, m * 0.42);
        const hood = { x: (w - hoodW) / 2, y: frame.y - sw * lamp * 0.62, w: hoodW, h: hoodH };
        const plaque = { cx: w / 2, y: frame.y + frame.h + sw * 0.035, h: Math.max(34, sw * 0.088), max: Math.min(frame.w * 0.62, w - 24) };
        const L = { portrait, floor, dado, screen, liner, frame, m, l, hood, plaque };
        if (portrait) {
            const bw = Math.min(w * 0.82, frame.w * 1.05), seat = (floor - dado) * 0.52;
            L.bench = { x: (w - bw) / 2, y: floor - seat, w: bw, h: seat };
        } else {
            const top = dado - (floor - dado) * 0.12;
            L.posts = [w * 0.07, w * 0.93].map(x => ({ x, top }));
        }
        return L;
    }

    // ---- The room ---------------------------------------------------------------------

    // A damask tile, drawn once at 2× and patterned at half scale so it stays crisp.
    let damaskTile = null;
    function damask(ctx) {
        damaskTile ??= sprite(160, 240, c => {
            c.scale(2, 2);
            const motif = (x, y, s) => {
                c.save();
                c.translate(x, y);
                c.scale(s, s);
                for (const side of [1, -1]) {
                    c.save();
                    c.scale(side, 1);
                    c.beginPath();
                    c.moveTo(0, -30);
                    c.bezierCurveTo(5, -21, 15, -19, 13, -8);
                    c.bezierCurveTo(11, 0, 4, 1, 6, 8);
                    c.bezierCurveTo(9, 15, 17, 14, 15, 23);
                    c.bezierCurveTo(12, 28, 5, 25, 0, 32);
                    c.closePath();
                    c.fill();
                    c.beginPath();
                    c.ellipse(19, -16, 6, 2.4, -0.7, 0, 7);
                    c.ellipse(21, 8, 5, 2, 0.6, 0, 7);
                    c.fill();
                    c.beginPath();
                    c.arc(24, -4, 1.4, 0, 7);
                    c.fill();
                    c.restore();
                }
                c.restore();
            };
            c.fillStyle = 'rgba(214, 236, 214, 0.04)';
            motif(40, 60, 1);
            for (const [x, y] of [[0, 0], [80, 0], [0, 120], [80, 120]]) motif(x, y, 0.8);
        });
        const pattern = ctx.createPattern(damaskTile, 'repeat');
        pattern.setTransform(new DOMMatrix().scale(0.4));
        return pattern;
    }

    function room(ctx, L, w, h) {
        const { floor, dado, frame, hood } = L;
        const paint = ctx.createLinearGradient(0, 0, 0, dado);
        paint.addColorStop(0, WALL[2]);
        paint.addColorStop(0.45, WALL[0]);
        paint.addColorStop(1, WALL[1]);
        ctx.fillStyle = paint;
        ctx.fillRect(0, 0, w, dado);
        ctx.fillStyle = damask(ctx);
        ctx.fillRect(0, 0, w, dado);
        // The picture light's wash: hot just under the hood, broad over the
        // frame, falling away down the wall.
        const cx = w / 2, reach = frame.h * 1.25 + (frame.y - hood.y);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.translate(cx, frame.y);
        ctx.scale(1.3, 1);
        const wash = ctx.createRadialGradient(0, 0, 0, 0, 0, reach);
        wash.addColorStop(0, 'rgba(255, 214, 150, 0.26)');
        wash.addColorStop(0.35, 'rgba(255, 196, 120, 0.11)');
        wash.addColorStop(1, 'rgba(255, 180, 100, 0)');
        ctx.fillStyle = wash;
        ctx.fillRect(-reach, -reach, reach * 2, reach * 2);
        ctx.restore();
        // The room falls into shadow away from the picture.
        const dark = ctx.createRadialGradient(cx, frame.y + frame.h * 0.4, Math.min(w, h) * 0.3, cx, frame.y + frame.h * 0.4, Math.hypot(w, h) * 0.62);
        dark.addColorStop(0, 'rgba(0, 0, 0, 0)');
        dark.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
        ctx.fillStyle = dark;
        ctx.fillRect(0, 0, w, h);
        wainscot(ctx, L, w);
        // A polished oak floor, its boards running away to the far wall, the
        // light caught in its varnish.
        const oak = ctx.createLinearGradient(0, floor, 0, h);
        oak.addColorStop(0, '#2e1d10');
        oak.addColorStop(1, '#120a05');
        ctx.fillStyle = oak;
        ctx.fillRect(0, floor, w, h - floor);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.lineWidth = 1;
        const span = h - floor;
        for (let i = -24; i <= 24; i++) {
            ctx.beginPath();
            ctx.moveTo(cx + i * 26, floor);
            ctx.lineTo(cx + i * 26 * (1 + span / 40), h);
            ctx.stroke();
        }
        const shine = ctx.createRadialGradient(cx, floor, 0, cx, floor, frame.w * 0.6);
        shine.addColorStop(0, 'rgba(255, 200, 130, 0.16)');
        shine.addColorStop(1, 'rgba(255, 200, 130, 0)');
        ctx.save();
        ctx.translate(0, floor);
        ctx.scale(1, Math.max(0.2, span / (frame.w * 0.6)));
        ctx.translate(0, -floor);
        ctx.fillStyle = shine;
        ctx.fillRect(cx - frame.w * 0.6, floor, frame.w * 1.2, frame.w * 0.6);
        ctx.restore();
    }

    // Painted panelling under a dado rail, and a skirting board.
    function wainscot(ctx, { dado, floor }, w) {
        const zone = floor - dado;
        ctx.fillStyle = '#0e1d19';
        ctx.fillRect(0, dado, w, zone);
        const rail = Math.max(5, zone * 0.09), skirt = Math.max(5, zone * 0.13);
        const panelH = zone - rail - skirt - zone * 0.2, py = dado + rail + zone * 0.1;
        const count = Math.max(2, Math.round(w / Math.max(140, zone * 1.6)));
        const gap = zone * 0.12, pw = (w - gap * (count + 1)) / count;
        for (let i = 0; i < count; i++) {
            const x = gap + i * (pw + gap);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
            ctx.fillRect(x, py, pw, panelH);
            ctx.fillStyle = 'rgba(255, 240, 210, 0.09)';
            ctx.fillRect(x, py + panelH - 1.5, pw, 1.5);
            ctx.fillRect(x + pw - 1.5, py, 1.5, panelH);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
            ctx.fillRect(x, py, pw, 2);
            ctx.fillRect(x, py, 2, panelH);
        }
        const wood = ctx.createLinearGradient(0, dado, 0, dado + rail);
        wood.addColorStop(0, '#6a4a2a');
        wood.addColorStop(0.35, '#a37a4a');
        wood.addColorStop(1, '#2b1a0d');
        ctx.fillStyle = wood;
        ctx.fillRect(0, dado, w, rail);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(0, dado + rail, w, 2);
        const base = ctx.createLinearGradient(0, floor - skirt, 0, floor);
        base.addColorStop(0, '#3b2a1a');
        base.addColorStop(0.15, '#24170c');
        base.addColorStop(1, '#130b05');
        ctx.fillStyle = base;
        ctx.fillRect(0, floor - skirt, w, skirt);
    }

    // ---- The frame ---------------------------------------------------------------------

    // One mitred side of the moulding: the profile across it, the light by side.
    function side(ctx, quad, from, to, light) {
        ctx.save();
        ctx.beginPath();
        quad.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x, y));
        ctx.closePath();
        ctx.clip();
        const g = ctx.createLinearGradient(from[0], from[1], to[0], to[1]);
        for (const [at, color] of PROFILE) g.addColorStop(at, color);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.fillStyle = light > 0 ? `rgba(255, 236, 180, ${light})` : `rgba(20, 10, 0, ${-light})`;
        ctx.fill();
        ctx.restore();
    }

    // A gold bead, baked, and the carved shell for the corners and the middles.
    let beadSprite = null, shellSprite = null, spriteFor = 0;
    function sprites(m) {
        if (spriteFor === m) return;
        spriteFor = m;
        const r = Math.max(1.5, m * 0.05), scale = 2;
        beadSprite = sprite(r * 2 * scale, r * 2 * scale, c => {
            c.scale(scale, scale);
            const g = c.createRadialGradient(r * 0.7, r * 0.6, r * 0.1, r, r, r);
            g.addColorStop(0, '#fff2c0');
            g.addColorStop(0.45, '#d4a64a');
            g.addColorStop(1, '#4a3010');
            c.fillStyle = g;
            c.beginPath();
            c.arc(r, r, r, 0, 7);
            c.fill();
        });
        const S = m * 1.15;
        shellSprite = sprite(S * 2.4 * scale, S * 1.6 * scale, c => {
            c.scale(scale, scale);
            c.translate(S * 1.2, S * 1.15);   // the shell's hinge; lobes fan out upwards
            const gold = c.createLinearGradient(-S, -S, S * 0.6, S * 0.4);
            gold.addColorStop(0, '#fff0b8');
            gold.addColorStop(0.4, '#d9ab4c');
            gold.addColorStop(1, '#6b4914');
            // C-scrolls either side, curling out.
            c.lineCap = 'round';
            for (const s of [-1, 1]) {
                c.save();
                c.scale(s, 1);
                c.beginPath();
                c.arc(S * 0.5, S * 0.06, S * 0.22, Math.PI * 1.05, Math.PI * 2.55);
                c.strokeStyle = '#3a2708';
                c.lineWidth = S * 0.16;
                c.stroke();
                c.strokeStyle = gold;
                c.lineWidth = S * 0.1;
                c.stroke();
                c.fillStyle = gold;                      // the volute's eye
                c.beginPath();
                c.arc(S * 0.5 - S * 0.02, S * 0.18, S * 0.07, 0, 7);
                c.fill();
                c.restore();
            }
            for (let i = -3; i <= 3; i++) {
                const a = -Math.PI / 2 + i * 0.36, len = S * (0.98 - Math.abs(i) * 0.07);
                c.save();
                c.rotate(a + Math.PI / 2);
                c.beginPath();
                c.ellipse(0, -len * 0.5, S * 0.15, len * 0.52, 0, 0, 7);
                c.fillStyle = gold;
                c.fill();
                c.strokeStyle = 'rgba(58, 36, 6, 0.75)';
                c.lineWidth = Math.max(0.6, S * 0.03);
                c.stroke();
                c.beginPath();                      // the flute down each lobe
                c.moveTo(0, -len * 0.12);
                c.lineTo(0, -len * 0.86);
                c.strokeStyle = 'rgba(58, 36, 6, 0.5)';
                c.stroke();
                c.restore();
            }
            const boss = c.createRadialGradient(-S * 0.06, -S * 0.06, 0, 0, 0, S * 0.22);
            boss.addColorStop(0, '#fff4c8');
            boss.addColorStop(0.5, '#c8963a');
            boss.addColorStop(1, '#4a3010');
            c.fillStyle = boss;
            c.beginPath();
            c.arc(0, 0, S * 0.22, 0, 7);
            c.fill();
        });
        shellSprite.S = S;
    }

    // The shell at a point, its lobes fanning out at angle `a` (0: up).
    function shell(ctx, x, y, a, k = 1) {
        const S = shellSprite.S * k;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a);
        ctx.drawImage(shellSprite, -S * 1.2, -S * 1.15, S * 2.4, S * 1.6);
        ctx.restore();
    }

    function gilt(ctx, L) {
        const { frame: f, liner: n, m, screen: s } = L;
        sprites(m);
        // The frame's shadow on the wall, thrown down by the light above (once per paint).
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
        ctx.shadowBlur = m * 1.1;
        ctx.shadowOffsetY = m * 0.55;
        ctx.fillStyle = '#2a1c06';
        ctx.fillRect(f.x, f.y, f.w, f.h);
        ctx.restore();
        const o = [[f.x, f.y], [f.x + f.w, f.y], [f.x + f.w, f.y + f.h], [f.x, f.y + f.h]];
        const i = [[n.x, n.y], [n.x + n.w, n.y], [n.x + n.w, n.y + n.h], [n.x, n.y + n.h]];
        side(ctx, [o[0], o[1], i[1], i[0]], [0, f.y], [0, n.y], -0.06);
        side(ctx, [o[1], o[2], i[2], i[1]], [f.x + f.w, 0], [n.x + n.w, 0], -0.16);
        side(ctx, [o[2], o[3], i[3], i[2]], [0, f.y + f.h], [0, n.y + n.h], 0.07);
        side(ctx, [o[3], o[0], i[0], i[3]], [f.x, 0], [n.x, 0], 0.02);
        // Mitre joints.
        ctx.strokeStyle = 'rgba(40, 24, 4, 0.5)';
        ctx.lineWidth = 1;
        for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(...o[k]); ctx.lineTo(...i[k]); ctx.stroke(); }
        // A twisted rope along the outer torus, and a row of beads in the band.
        const edges = [[o[0], o[1], 0, 1], [o[1], o[2], -1, 0], [o[3], o[2], 0, -1], [o[0], o[3], 1, 0]];
        ctx.strokeStyle = 'rgba(70, 44, 8, 0.45)';
        ctx.lineWidth = Math.max(0.8, m * 0.025);
        const step = Math.max(3, m * 0.11);
        for (const [[ax, ay], [bx, by], nx, ny] of edges) {
            const len = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / len, uy = (by - ay) / len;
            const at = d => [ax + nx * d, ay + ny * d];
            for (let t = m * 0.25; t < len - m * 0.25; t += step) {
                const [px, py] = at(m * 0.06);
                ctx.beginPath();
                ctx.moveTo(px + ux * t, py + uy * t);
                ctx.lineTo(px + ux * (t + step * 0.6) + nx * m * 0.09, py + uy * (t + step * 0.6) + ny * m * 0.09);
                ctx.stroke();
            }
            const r = beadSprite.width / 4, gap = r * 2.5;
            const [bx0, by0] = at(m * 0.635);
            for (let t = m * 0.66; t < len - m * 0.66; t += gap) ctx.drawImage(beadSprite, bx0 + ux * t - r, by0 + uy * t - r, r * 2, r * 2);
        }
        // Carved shells: at the corners, fanning out over the mitres, and
        // smaller ones at the middle of each side.
        shell(ctx, f.x + m * 0.62, f.y + m * 0.62, -Math.PI / 4);
        shell(ctx, f.x + f.w - m * 0.62, f.y + m * 0.62, Math.PI / 4);
        shell(ctx, f.x + f.w - m * 0.62, f.y + f.h - m * 0.62, Math.PI * 0.75);
        shell(ctx, f.x + m * 0.62, f.y + f.h - m * 0.62, -Math.PI * 0.75);
        shell(ctx, f.x + f.w / 2, f.y + m * 0.7, 0, 0.8);
        shell(ctx, f.x + f.w / 2, f.y + f.h - m * 0.7, Math.PI, 0.8);
        if (f.h > m * 7) {
            shell(ctx, f.x + m * 0.7, f.y + f.h / 2, -Math.PI / 2, 0.7);
            shell(ctx, f.x + f.w - m * 0.7, f.y + f.h / 2, Math.PI / 2, 0.7);
        }
        // The linen liner, shaded under the gilt, and a gold slip at the sight edge.
        ctx.fillStyle = '#cfc2a3';
        ctx.fillRect(n.x, n.y, n.w, n.h);
        ctx.fillStyle = linen(ctx);
        ctx.fillRect(n.x, n.y, n.w, n.h);
        const lw = s.x - n.x;
        ctx.fillStyle = 'rgba(30, 20, 5, 0.35)';
        ctx.fillRect(n.x, n.y, n.w, lw * 0.35);
        ctx.fillRect(n.x, n.y, lw * 0.25, n.h);
        const slip = Math.max(1.5, lw * 0.16);
        ctx.strokeStyle = '#e5c56e';
        ctx.lineWidth = slip;
        ctx.strokeRect(s.x - slip / 2, s.y - slip / 2, s.w + slip, s.h + slip);
        ctx.strokeStyle = 'rgba(60, 38, 6, 0.6)';
        ctx.lineWidth = 1;
        ctx.strokeRect(s.x - slip - 0.5, s.y - slip - 0.5, s.w + slip * 2 + 1, s.h + slip * 2 + 1);
    }

    // Linen: a fine weave, as a pattern (made once).
    let linenTile = null;
    function linen(ctx) {
        linenTile ??= sprite(8, 8, c => {
            c.fillStyle = 'rgba(90, 70, 40, 0.16)';
            for (let i = 0; i < 8; i += 2) { c.fillRect(0, i, 8, 1); c.fillRect(i, 0, 1, 8); }
            c.fillStyle = 'rgba(255, 255, 255, 0.12)';
            for (let i = 1; i < 8; i += 4) c.fillRect(i, i, 2, 1);
        });
        return ctx.createPattern(linenTile, 'repeat');
    }

    // The picture light: a brass hood on a swan-neck arm from behind the frame.
    function lamp(ctx, L) {
        const { hood: d, frame: f, m } = L;
        const cx = d.x + d.w / 2;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#4a3410';
        ctx.lineWidth = Math.max(2.5, m * 0.13);
        ctx.beginPath();
        ctx.moveTo(cx, f.y + m * 0.3);
        ctx.bezierCurveTo(cx, f.y - m * 0.6, cx, d.y + d.h * 2, cx, d.y + d.h * 0.5);
        ctx.stroke();
        ctx.strokeStyle = '#c9a050';
        ctx.lineWidth = Math.max(1, m * 0.05);
        ctx.stroke();
        // Light spilling from the slot under the hood: a few widening layers, for a soft edge.
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const spill = ctx.createLinearGradient(0, d.y + d.h, 0, f.y + m * 1.5);
        spill.addColorStop(0, 'rgba(255, 220, 160, 0.07)');
        spill.addColorStop(1, 'rgba(255, 220, 160, 0)');
        ctx.fillStyle = spill;
        for (const k of [0, 0.06, 0.12]) {
            ctx.beginPath();
            ctx.moveTo(d.x + d.h - k * d.w, d.y + d.h);
            ctx.lineTo(d.x + d.w - d.h + k * d.w, d.y + d.h);
            ctx.lineTo(f.x + f.w * (0.92 + k), f.y + m * 1.5);
            ctx.lineTo(f.x + f.w * (0.08 - k), f.y + m * 1.5);
            ctx.fill();
        }
        ctx.restore();
        const brass = ctx.createLinearGradient(0, d.y, 0, d.y + d.h);
        brass.addColorStop(0, '#5a3f12');
        brass.addColorStop(0.3, '#f3dc96');
        brass.addColorStop(0.55, '#b98d3c');
        brass.addColorStop(1, '#3d2a0a');
        ctx.fillStyle = brass;
        JellyfinFrames.roundRect(ctx, d.x, d.y, d.w, d.h, d.h / 2);
        ctx.fill();
        for (const x of [d.x, d.x + d.w]) {
            ctx.fillStyle = '#7a5a20';
            ctx.beginPath();
            ctx.ellipse(x, d.y + d.h / 2, d.h * 0.3, d.h * 0.55, 0, 0, 7);
            ctx.fill();
        }
        ctx.fillStyle = '#fff3d4';
        ctx.fillRect(d.x + d.h, d.y + d.h - 1.5, d.w - d.h * 2, 1.5);
    }

    // The brass plaque: "*Title* (Year)." over "Moving pictures on canvas."
    function plaque(ctx, L, env) {
        const p = L.plaque;
        const match = /^(.*) \((\d{4})\)$/.exec(env.title || '');
        const name = match ? match[1] : env.title || 'Untitled';
        const year = match ? ` (${match[2]}).` : '.';
        const second = 'Moving pictures on canvas.';
        let big = p.h * 0.3, small = Math.max(9, p.h * 0.21), w1, w2;
        const measure = () => {
            ctx.font = `italic 600 ${big}px ${SERIF}`;
            w1 = ctx.measureText(name).width;
            ctx.font = `500 ${big}px ${SERIF}`;
            w1 += ctx.measureText(year).width;
            ctx.font = `500 ${small}px ${SERIF}`;
            w2 = ctx.measureText(second).width;
        };
        measure();
        const pad = p.h * 0.75, room = p.max - pad * 2;
        if (w1 > room) { big *= room / w1; measure(); }
        const pw = Math.max(Math.max(w1, w2) + pad * 2, p.h * 4.2), x = p.cx - pw / 2;
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.fillRect(x + 1, p.y + 2, pw, p.h);
        const brass = ctx.createLinearGradient(x, p.y, x + pw * 0.4, p.y + p.h * 2.2);
        brass.addColorStop(0, '#8a6a2a');
        brass.addColorStop(0.35, '#ecd18a');
        brass.addColorStop(0.65, '#b48c3c');
        brass.addColorStop(1, '#6a4c18');
        ctx.fillStyle = brass;
        ctx.fillRect(x, p.y, pw, p.h);
        ctx.strokeStyle = 'rgba(255, 244, 200, 0.55)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 2.5, p.y + 2.5, pw - 5, p.h - 5);
        ctx.strokeStyle = 'rgba(60, 40, 10, 0.5)';
        ctx.strokeRect(x + 0.5, p.y + 0.5, pw - 1, p.h - 1);
        for (const sx of [x + p.h * 0.32, x + pw - p.h * 0.32]) {   // screws
            const r = Math.max(1.6, p.h * 0.07);
            ctx.fillStyle = '#6a4c18';
            ctx.beginPath();
            ctx.arc(sx, p.y + p.h / 2, r, 0, 7);
            ctx.fill();
            ctx.strokeStyle = '#2a1a06';
            ctx.beginPath();
            ctx.moveTo(sx - r * 0.7, p.y + p.h / 2 + r * 0.3);
            ctx.lineTo(sx + r * 0.7, p.y + p.h / 2 - r * 0.3);
            ctx.stroke();
        }
        // Engraved: dark letters with a bright lip under them.
        const engrave = (text, tx, ty, font, align) => {
            ctx.font = font;
            ctx.textAlign = align;
            ctx.fillStyle = 'rgba(255, 246, 210, 0.45)';
            ctx.fillText(text, tx, ty + 1);
            ctx.fillStyle = '#2b1c06';
            ctx.fillText(text, tx, ty);
        };
        ctx.textBaseline = 'alphabetic';
        const y1 = p.y + p.h * 0.47, y2 = p.y + p.h * 0.8;
        const left = p.cx - w1 / 2;
        engrave(name, left, y1, `italic 600 ${big}px ${SERIF}`, 'left');
        ctx.font = `italic 600 ${big}px ${SERIF}`;
        engrave(year, left + ctx.measureText(name).width, y1, `500 ${big}px ${SERIF}`, 'left');
        engrave(second, p.cx, y2, `500 ${small}px ${SERIF}`, 'center');
        ctx.restore();
    }

    // Brass stanchions and a sagging red velvet rope.
    function rope(ctx, L, w) {
        const posts = L.posts, r = Math.max(3, (L.floor - L.dado) * 0.05);
        const hang = (a, b, sag) => {
            const mid = [(a[0] + b[0]) / 2, Math.max(a[1], b[1]) + sag];
            for (const [color, width, dy] of [['#3d0710', r * 1.25, 0], ['#8e1424', r, 0], ['rgba(255, 140, 150, 0.35)', r * 0.3, -r * 0.25]]) {
                ctx.strokeStyle = color;
                ctx.lineWidth = width;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(a[0], a[1] + dy);
                ctx.quadraticCurveTo(mid[0], mid[1] * 2 - (a[1] + b[1]) / 2 + dy, b[0], b[1] + dy);
                ctx.stroke();
            }
        };
        const sag = (L.floor - L.dado) * 0.42;
        const tops = posts.map(p => [p.x, p.top + r]);
        hang([-w * 0.2, tops[0][1] + sag * 0.3], tops[0], sag * 0.5);
        hang(tops[1], [w * 1.2, tops[1][1] + sag * 0.3], sag * 0.5);
        hang(tops[0], tops[1], sag);
        for (const p of posts) {
            const pw = r * 0.9, brass = ctx.createLinearGradient(p.x - pw, 0, p.x + pw, 0);
            brass.addColorStop(0, '#5a3f12');
            brass.addColorStop(0.35, '#f3dc96');
            brass.addColorStop(1, '#4a3210');
            ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
            ctx.beginPath();
            ctx.ellipse(p.x, L.floor, r * 3.4, r * 0.8, 0, 0, 7);
            ctx.fill();
            ctx.fillStyle = brass;
            ctx.fillRect(p.x - pw / 2, p.top, pw, L.floor - p.top);
            ctx.beginPath();
            ctx.ellipse(p.x, L.floor - r * 0.4, r * 2.6, r * 0.7, 0, 0, 7);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(p.x, p.top, r * 0.95, 0, 7);
            ctx.fill();
        }
    }

    // A buttoned leather gallery bench, for the upright layout.
    function bench(ctx, b) {
        const top = b.h * 0.34, legW = Math.max(4, b.w * 0.025);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.beginPath();
        ctx.ellipse(b.x + b.w / 2, b.y + b.h, b.w * 0.55, b.h * 0.08, 0, 0, 7);
        ctx.fill();
        ctx.fillStyle = '#1a0f08';
        for (const fx of [0.06, 0.94]) ctx.fillRect(b.x + b.w * fx - legW / 2, b.y + top * 0.8, legW, b.h - top * 0.8);
        ctx.fillRect(b.x + b.w * 0.06, b.y + b.h * 0.72, b.w * 0.88, Math.max(2, legW * 0.5));
        const leather = ctx.createLinearGradient(0, b.y, 0, b.y + top);
        leather.addColorStop(0, '#6a1f22');
        leather.addColorStop(0.4, '#4a1215');
        leather.addColorStop(1, '#230708');
        ctx.fillStyle = leather;
        JellyfinFrames.roundRect(ctx, b.x, b.y, b.w, top, top * 0.4);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 200, 170, 0.12)';
        JellyfinFrames.roundRect(ctx, b.x + top * 0.3, b.y + 1.5, b.w - top * 0.6, top * 0.18, top * 0.09);
        ctx.fill();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        const n = Math.max(4, Math.round(b.w / 40));
        for (let i = 1; i < n; i++) { ctx.beginPath(); ctx.arc(b.x + (b.w * i) / n, b.y + top * 0.5, Math.max(1.2, top * 0.06), 0, 7); ctx.fill(); }
    }

    // The canvas under glass: the frame's shadow on its top edge, the light
    // falling off downwards, and the faintest weave.
    function varnish(ctx, s) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(s.x, s.y, s.w, s.h);
        ctx.clip();
        const fall = ctx.createLinearGradient(0, s.y, 0, s.y + s.h);
        fall.addColorStop(0, 'rgba(0, 0, 0, 0.42)');
        fall.addColorStop(Math.min(0.12, 14 / s.h), 'rgba(0, 0, 0, 0)');
        fall.addColorStop(0.7, 'rgba(0, 0, 0, 0)');
        fall.addColorStop(1, 'rgba(0, 0, 0, 0.16)');
        ctx.fillStyle = fall;
        ctx.fillRect(s.x, s.y, s.w, s.h);
        const edge = ctx.createLinearGradient(s.x, 0, s.x + Math.min(10, s.w * 0.02), 0);
        edge.addColorStop(0, 'rgba(0, 0, 0, 0.3)');
        edge.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = edge;
        ctx.fillRect(s.x, s.y, s.w * 0.03, s.h);
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = linen(ctx);
        ctx.fillRect(s.x, s.y, s.w, s.h);
        ctx.restore();
    }

    function paint(ctx, L, env) {
        const { w, h } = env.viewport;
        room(ctx, L, w, h);
        gilt(ctx, L);
        lamp(ctx, L);
        plaque(ctx, L, env);
        if (L.posts) rope(ctx, L, w);
        if (L.bench) bench(ctx, L.bench);
        JellyfinFrames.cutScreen(ctx, L.screen);
        varnish(ctx, L.screen);
    }

    // ---- The overlay ---------------------------------------------------------------------

    // Dust in the beam: each mote's path is a function of time, so there's no state to step.
    let moteSprite = null;
    function motes(ctx, t, L, env) {
        moteSprite ??= sprite(12, 12, c => {
            const g = c.createRadialGradient(6, 6, 0, 6, 6, 6);
            g.addColorStop(0, 'rgba(255, 236, 196, 1)');
            g.addColorStop(0.35, 'rgba(255, 226, 170, 0.5)');
            g.addColorStop(1, 'rgba(255, 220, 160, 0)');
            c.fillStyle = g;
            c.fillRect(0, 0, 12, 12);
        });
        const { hood: d, frame: f } = L;
        const count = Math.round(16 * (env.quality?.density ?? 1));
        const random = seeded(4242);
        const top = d.y + d.h, height = f.y + f.h * 0.55 - top, s = t / 1000;
        for (let i = 0; i < count; i++) {
            const x0 = random(), y0 = random(), speed = 0.004 + random() * 0.008, sway = 6 + random() * 14, phase = random() * 7, size = 3 + random() * 4;
            const v = (y0 + s * speed) % 1;                      // drifting slowly down through the beam
            const spread = 0.25 + v * 0.75;                      // the beam widens as it falls
            const x = f.x + f.w / 2 + (x0 - 0.5) * f.w * spread + Math.sin(s * 0.3 + phase) * sway;
            const y = top + v * height + Math.sin(s * 0.21 + phase * 2) * 5;
            ctx.globalAlpha = (0.25 + 0.35 * (0.5 + 0.5 * Math.sin(s * 0.8 + phase))) * Math.min(1, v * 6) * (1 - v);
            ctx.drawImage(moteSprite, x - size / 2, y - size / 2, size, size);
        }
        ctx.globalAlpha = 1;
    }

    // A primed canvas: gesso, weave, and a pencilled grid with the painter's
    // first charcoal lines of a landscape, never finished.
    function primed(ctx, s, alpha = 1) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.rect(s.x, s.y, s.w, s.h);
        ctx.clip();
        const gesso = ctx.createLinearGradient(0, s.y, 0, s.y + s.h);
        gesso.addColorStop(0, '#efe6d2');
        gesso.addColorStop(1, '#d9ccb0');
        ctx.fillStyle = gesso;
        ctx.fillRect(s.x, s.y, s.w, s.h);
        ctx.fillStyle = linen(ctx);
        ctx.fillRect(s.x, s.y, s.w, s.h);
        ctx.strokeStyle = 'rgba(80, 70, 60, 0.12)';
        ctx.lineWidth = 1;
        for (let i = 1; i < 8; i++) { ctx.beginPath(); ctx.moveTo(s.x + (s.w * i) / 8, s.y); ctx.lineTo(s.x + (s.w * i) / 8, s.y + s.h); ctx.stroke(); }
        for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(s.x, s.y + (s.h * i) / 5); ctx.lineTo(s.x + s.w, s.y + (s.h * i) / 5); ctx.stroke(); }
        ctx.strokeStyle = 'rgba(40, 32, 26, 0.32)';
        ctx.lineWidth = Math.max(1, s.w * 0.0025);
        ctx.lineCap = 'round';
        const random = seeded(1888);
        for (let pass = 0; pass < 2; pass++) {
            ctx.beginPath();
            ctx.moveTo(s.x + s.w * 0.04, s.y + s.h * (0.66 + pass * 0.01));
            ctx.bezierCurveTo(s.x + s.w * 0.25, s.y + s.h * 0.5, s.x + s.w * 0.35, s.y + s.h * 0.58, s.x + s.w * 0.5, s.y + s.h * 0.62);
            ctx.bezierCurveTo(s.x + s.w * 0.68, s.y + s.h * (0.5 + random() * 0.04), s.x + s.w * 0.8, s.y + s.h * 0.56, s.x + s.w * 0.96, s.y + s.h * 0.6);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(s.x + s.w * 0.72, s.y + s.h * 0.3, s.h * (0.09 + pass * 0.006), 0.2, Math.PI * 2.1);
            ctx.stroke();
        }
        ctx.restore();
    }

    // The notices on the empty canvas, by state.
    const NOTICES = {
        setup: 'Acquisition pending', connecting: 'On loan, in transit', offline: 'Gallery closed for rehanging',
        signedout: 'Members’ preview: please sign in', empty: 'This wall awaits its picture', loading: 'Now hanging',
        away: 'On loan to another room', demo: 'Acquisition pending',
    };

    function notice(ctx, s, kind) {
        const [title, detail] = JellyfinFrames.IDLE[kind] || JellyfinFrames.IDLE.setup;
        const body = detail || title.charAt(0) + title.slice(1).toLowerCase();
        const cw = Math.min(s.w * 0.6, 380), px = Math.max(11, cw * 0.06);
        ctx.save();
        ctx.font = `400 ${px * 0.78}px ${SERIF}`;
        const lines = JellyfinFrames.wrap(ctx, body, cw * 0.84).slice(0, 3);
        const ch = px * 3.3 + lines.length * px * 1.1;
        const x = s.x + (s.w - cw) / 2, y = s.y + s.h * 0.62 - ch / 2;
        ctx.fillStyle = 'rgba(40, 30, 20, 0.25)';
        ctx.fillRect(x + 2, y + 3, cw, ch);
        ctx.fillStyle = '#fbf8f1';
        ctx.fillRect(x, y, cw, ch);
        ctx.fillStyle = '#8a7a64';
        ctx.textAlign = 'left';
        ctx.font = `600 ${px * 0.55}px ${SERIF}`;
        ctx.fillText('GALLERY NOTICE', x + cw * 0.08, y + px * 1.05);
        ctx.fillStyle = '#2a2018';
        ctx.font = `italic 500 ${px}px ${SERIF}`;
        ctx.fillText(NOTICES[kind] || NOTICES.setup, x + cw * 0.08, y + px * 2.2, cw * 0.84);
        ctx.fillStyle = '#5a4c3c';
        ctx.font = `400 ${px * 0.78}px ${SERIF}`;
        lines.forEach((line, i) => ctx.fillText(line, x + cw * 0.08, y + px * 3.25 + i * px * 1.1));
        ctx.restore();
    }

    let transition = null;   // { kind, at }

    JellyfinFrames.add({
        id: 'gallery',
        name: 'Gallery',
        icon: '🖼️',
        titled: true,
        layout,
        paint,

        transition(kind, env) {
            const was = transition;
            transition = { kind, at: performance.now() };
            // A pause cut short starts the lights back up from where they'd got to.
            if (kind === 'play' && was?.kind === 'pause') transition.from = Math.min(1, (transition.at - was.at) / DIM_MS);
            env.busy(kind === 'change' ? CHANGE_MS : kind === 'pause' ? DIM_MS : LIFT_MS);
        },

        tick(ctx, t, L, env) {
            const age = transition ? t - transition.at : Infinity;
            let wait = Infinity;
            if (env.motion) { motes(ctx, t, L, env); wait = MOTE_MS; }
            if (transition?.kind === 'change' && age < CHANGE_MS) {
                // Rehanging: the picture gives way to a bare canvas and back.
                const q = age / CHANGE_MS;
                primed(ctx, L.screen, Math.min(1, Math.sin(Math.PI * q) * 1.6));
                return 33;
            }
            // The lights going down on pause, and up again on play.
            let dim = 0;
            if (env.paused) dim = transition?.kind === 'pause' ? Math.min(1, age / DIM_MS) : 1;
            else if (transition?.kind === 'play' && age < LIFT_MS) dim = (transition.from ?? 1) * (1 - age / LIFT_MS);
            if (dim > 0) {
                const { w, h } = env.viewport, s = L.screen;
                ctx.fillStyle = `rgba(6, 5, 4, ${0.5 * dim})`;
                ctx.fillRect(0, 0, w, h);
                if (env.paused) {
                    ctx.globalAlpha = dim;
                    cueBand(ctx, 'Intermission', { ...s, y: s.y + s.h * 0.3, h: s.h * 0.4 }, { italic: true, px: Math.max(15, Math.min(34, s.h * 0.075)) });
                    ctx.globalAlpha = 1;
                }
                if (dim < 1 && (env.paused || age < LIFT_MS)) wait = Math.min(wait, 33);
            } else if (transition && age > CHANGE_MS) transition = null;
            return wait;
        },

        // The bare canvas, waiting for its picture, and a notice pinned to it.
        idle(ctx, L, env, kind) {
            primed(ctx, L.screen);
            notice(ctx, L.screen, kind);
        },

        cue(ctx, text, L) {
            cueBand(ctx, text, L.screen);
        },
    });

    // A subtitle in a book face, on a soft dark band across the bottom of the picture.
    function cueBand(ctx, text, s, { italic = false, px = Math.max(13, Math.min(30, s.h * 0.058)) } = {}) {
        ctx.save();
        ctx.font = `${italic ? 'italic ' : ''}500 ${px}px ${SERIF}`;
        ctx.textAlign = 'center';
        const lines = JellyfinFrames.wrap(ctx, text, s.w * 0.84);
        const lead = px * 1.3, bandH = lines.length * lead + px * 1.4;
        const bottom = s.y + s.h - s.h * 0.05, top = bottom - bandH;
        const band = ctx.createLinearGradient(0, top, 0, bottom);
        band.addColorStop(0, 'rgba(10, 8, 6, 0)');
        band.addColorStop(0.3, 'rgba(10, 8, 6, 0.55)');
        band.addColorStop(0.7, 'rgba(10, 8, 6, 0.55)');
        band.addColorStop(1, 'rgba(10, 8, 6, 0)');
        ctx.fillStyle = band;
        ctx.fillRect(s.x, top, s.w, bandH);
        ctx.fillStyle = '#f5ecd8';
        lines.forEach((line, i) => ctx.fillText(line, s.x + s.w / 2, top + px * 0.7 + px + i * lead - px * 0.15));
        ctx.restore();
    }
})();
