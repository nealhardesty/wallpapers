// Old TV: a 1970s wood-grain console against a papered wall, with rabbit
// ears, a channel dial that clicks round on every change, a volume dial, a
// speaker grille, and a rounded CRT under scanlines and glare. Between items,
// a burst of snow; on pause, the picture collapses to a bright dot. Upright
// phones get the same set on a stand, its dials and speaker under the screen.

(() => {
    'use strict';

    const WOOD = ['#5a3a22', '#6e4728', '#4b2f1b'];
    const PLASTIC = '#1c1a18';
    const SNOW_MS = 700, OFF_MS = 900, ON_MS = 420;

    // A tiny seeded random, so the grain is the same on every repaint.
    const seeded = seed => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

    function layout(w, h, aspect, env) {
        const floor = h - env.insets.bottom - Math.max(12, h * 0.05);
        const portrait = h > w * 1.1;
        if (portrait) {
            const cw = Math.min(w * 0.9, (floor - h * 0.12) * 0.62);
            const pad = cw * 0.07;
            const sw = cw - pad * 2, sh = Math.min(sw / aspect, (floor - h * 0.2) * 0.62);
            const screenW = Math.min(sw, sh * aspect), screenH = screenW / aspect;
            const strip = Math.max(70, cw * 0.32);
            const ch = pad + screenH + pad * 0.8 + strip + pad * 0.6;
            const legs = Math.max(18, ch * 0.07);
            const cabinet = { x: (w - cw) / 2, y: floor - legs - ch, w: cw, h: ch };
            const screen = { x: cabinet.x + (cw - screenW) / 2, y: cabinet.y + pad, w: screenW, h: screenH, radius: Math.min(screenW, screenH) * 0.07 };
            const panel = { x: cabinet.x + pad, y: screen.y + screenH + pad * 0.8, w: cw - pad * 2, h: strip };
            const dialR = Math.min(panel.h * 0.32, panel.w * 0.11);
            return { portrait, floor, cabinet, screen, legs, panel,
                dials: [{ x: panel.x + dialR * 1.4, y: panel.y + panel.h / 2, r: dialR }, { x: panel.x + dialR * 4, y: panel.y + panel.h / 2, r: dialR * 0.8 }],
                grille: { x: panel.x + dialR * 5.6, y: panel.y + panel.h * 0.14, w: panel.w - dialR * 5.6, h: panel.h * 0.72 } };
        }
        // The cabinet's width for a height ch: padding, the screen, the panel.
        const across = 0.243 + 0.82 * aspect + Math.max(0.36, 0.2296 * aspect);
        const ch = Math.min((floor - h * 0.16) * 0.8, (w * 0.92) / across);
        const legs = Math.max(16, ch * 0.1);
        const pad = ch * 0.09;
        const screenW = (ch - pad * 2) * aspect;
        const realH = screenW / aspect;
        const panelW = Math.max(ch * 0.36, screenW * 0.28);
        const cw = pad + screenW + pad * 0.9 + panelW + pad * 0.8;
        const cabinet = { x: (w - cw) / 2, y: floor - legs - ch, w: cw, h: ch };
        const screen = { x: cabinet.x + pad, y: cabinet.y + (ch - realH) / 2, w: screenW, h: realH, radius: Math.min(screenW, realH) * 0.07 };
        const panel = { x: screen.x + screenW + pad * 0.9, y: cabinet.y + pad, w: panelW, h: ch - pad * 2 };
        const dialR = Math.min(panel.w * 0.3, panel.h * 0.14);
        return { portrait, floor, cabinet, screen, legs, panel,
            dials: [{ x: panel.x + panel.w / 2, y: panel.y + dialR * 1.3, r: dialR }, { x: panel.x + panel.w / 2, y: panel.y + dialR * 3.9, r: dialR * 0.8 }],
            grille: { x: panel.x + panel.w * 0.1, y: panel.y + dialR * 5.4, w: panel.w * 0.8, h: panel.h - dialR * 5.4 } };
    }

    function wall(ctx, w, h, floor) {
        const paper = ctx.createLinearGradient(0, 0, 0, floor);
        paper.addColorStop(0, '#2b2219');
        paper.addColorStop(1, '#3a2c1f');
        ctx.fillStyle = paper;
        ctx.fillRect(0, 0, w, floor);
        // Seventies wallpaper: soft vertical stripes with a row of dots.
        ctx.fillStyle = 'rgba(255, 214, 160, 0.035)';
        for (let x = 0; x < w; x += 46) ctx.fillRect(x, 0, 18, floor);
        ctx.fillStyle = 'rgba(255, 200, 140, 0.05)';
        for (let x = 32; x < w; x += 46) for (let y = 20; y < floor; y += 40) { ctx.beginPath(); ctx.arc(x, y, 2.2, 0, 7); ctx.fill(); }
        // Lamp light from the left, and the room's dark corners.
        const lamp = ctx.createRadialGradient(w * 0.12, floor * 0.35, 0, w * 0.12, floor * 0.35, Math.max(w, h) * 0.75);
        lamp.addColorStop(0, 'rgba(255, 190, 110, 0.16)');
        lamp.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
        ctx.fillStyle = lamp;
        ctx.fillRect(0, 0, w, floor);
        const carpet = ctx.createLinearGradient(0, floor, 0, h);
        carpet.addColorStop(0, '#4a2f1d');
        carpet.addColorStop(1, '#22150d');
        ctx.fillStyle = carpet;
        ctx.fillRect(0, floor, w, h - floor);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fillRect(0, floor, w, 3);
    }

    function wood(ctx, rect, radius, random) {
        const base = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
        base.addColorStop(0, WOOD[1]);
        base.addColorStop(0.5, WOOD[0]);
        base.addColorStop(1, WOOD[2]);
        ctx.save();
        JellyfinFrames.roundRect(ctx, rect.x, rect.y, rect.w, rect.h, radius);
        ctx.fillStyle = base;
        ctx.fill();
        ctx.clip();
        // Grain: long wavy lines, a few knots.
        for (let i = 0; i < rect.h / 3; i++) {
            const y = rect.y + random() * rect.h, amp = 1 + random() * 4, freq = 0.004 + random() * 0.01, phase = random() * 9;
            ctx.strokeStyle = `rgba(${random() < 0.5 ? '30, 16, 6' : '150, 100, 60'}, ${0.08 + random() * 0.14})`;
            ctx.lineWidth = 0.6 + random() * 1.4;
            ctx.beginPath();
            for (let x = rect.x; x <= rect.x + rect.w; x += 8) ctx[x === rect.x ? 'moveTo' : 'lineTo'](x, y + Math.sin(x * freq + phase) * amp);
            ctx.stroke();
        }
        for (let k = 0; k < 3; k++) {
            const x = rect.x + random() * rect.w, y = rect.y + random() * rect.h, r = 4 + random() * 7;
            ctx.strokeStyle = 'rgba(30, 16, 6, 0.25)';
            for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.ellipse(x, y, r * i, r * i * 0.45, 0, 0, 7); ctx.stroke(); }
        }
        // Varnish: a highlight along the top, shade along the bottom.
        const sheen = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
        sheen.addColorStop(0, 'rgba(255, 220, 170, 0.18)');
        sheen.addColorStop(0.08, 'rgba(255, 220, 170, 0)');
        sheen.addColorStop(0.9, 'rgba(0, 0, 0, 0)');
        sheen.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
        ctx.fillStyle = sheen;
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        ctx.restore();
    }

    function dial(ctx, { x, y, r }, angle, numbers) {
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.beginPath();
        ctx.arc(x + r * 0.08, y + r * 0.12, r * 1.04, 0, 7);
        ctx.fill();
        const metal = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
        metal.addColorStop(0, '#f4efe4');
        metal.addColorStop(0.55, '#b7ab97');
        metal.addColorStop(1, '#5e5446');
        ctx.fillStyle = metal;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 7);
        ctx.fill();
        ctx.strokeStyle = 'rgba(40, 30, 20, 0.5)';
        ctx.lineWidth = Math.max(1, r * 0.03);
        for (let i = 0; i < 36; i++) {                       // knurling
            const a = (i / 36) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(x + Math.cos(a) * r * 0.86, y + Math.sin(a) * r * 0.86);
            ctx.lineTo(x + Math.cos(a) * r * 0.98, y + Math.sin(a) * r * 0.98);
            ctx.stroke();
        }
        if (numbers) {
            ctx.fillStyle = 'rgba(40, 28, 18, 0.85)';
            ctx.font = `700 ${Math.max(6, r * 0.2)}px ui-rounded, system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            for (let n = 0; n < 12; n++) {
                const a = -Math.PI / 2 + (n / 12) * Math.PI * 2;
                ctx.fillText(String(n + 2), x + Math.cos(a) * r * 0.66, y + Math.sin(a) * r * 0.66);
            }
        }
        ctx.strokeStyle = '#2a1d12';
        ctx.lineWidth = Math.max(2, r * 0.1);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(angle) * r * 0.45, y + Math.sin(angle) * r * 0.45);
        ctx.stroke();
        ctx.restore();
    }

    const channelAngle = channel => -Math.PI / 2 + ((channel % 12) / 12) * Math.PI * 2;

    function paint(ctx, L, env) {
        const { w, h } = env.viewport;
        const random = seeded(L.seed || 1977);
        wall(ctx, w, h, L.floor);
        const { cabinet: c, screen: s } = L;
        // Shadow on the wall and floor.
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath();
        ctx.ellipse(c.x + c.w / 2, L.floor + 4, c.w * 0.55, Math.max(8, L.legs * 0.5), 0, 0, 7);
        ctx.fill();
        // Legs, tapered.
        ctx.fillStyle = '#2e1c10';
        for (const fx of [0.1, 0.9]) {
            const lx = c.x + c.w * fx, top = c.y + c.h, lw = Math.max(6, c.w * 0.03);
            ctx.beginPath();
            ctx.moveTo(lx - lw / 2, top);
            ctx.lineTo(lx + lw / 2, top);
            ctx.lineTo(lx + lw * 0.25 + (fx < 0.5 ? -lw * 0.6 : lw * 0.6), L.floor);
            ctx.lineTo(lx - lw * 0.25 + (fx < 0.5 ? -lw * 0.6 : lw * 0.6), L.floor);
            ctx.fill();
        }
        // Rabbit ears, from a little dome on top.
        const base = { x: L.portrait ? c.x + c.w / 2 : s.x + s.w * 0.62, y: c.y };
        const ear = Math.min(c.h * 0.95, c.w * 0.62, c.y - 10);
        ctx.lineCap = 'round';
        for (const [angle, length] of [[-2.05, 1], [-0.95, 0.88]]) {
            const tip = { x: base.x + Math.cos(angle) * ear * length, y: base.y + Math.sin(angle) * ear * length };
            ctx.strokeStyle = '#d9d6cf';
            ctx.lineWidth = Math.max(1.5, c.w * 0.0045);
            ctx.beginPath();
            ctx.moveTo(base.x, base.y - 6);
            ctx.lineTo(tip.x, tip.y);
            ctx.stroke();
            ctx.fillStyle = '#e8e4da';
            ctx.beginPath();
            ctx.arc(tip.x, tip.y, Math.max(2, c.w * 0.006), 0, 7);
            ctx.fill();
        }
        ctx.fillStyle = '#1b1917';
        ctx.beginPath();
        ctx.ellipse(base.x, base.y, c.w * 0.05, c.w * 0.025, 0, Math.PI, 0);
        ctx.fill();
        // The cabinet.
        wood(ctx, c, c.h * 0.05, random);
        // The bezel around the tube, and the control panel's fascia.
        const b = Math.max(6, s.w * 0.035);
        ctx.save();
        JellyfinFrames.roundRect(ctx, s.x - b, s.y - b, s.w + b * 2, s.h + b * 2, s.radius + b);
        const plastic = ctx.createLinearGradient(s.x, s.y - b, s.x, s.y + s.h + b);
        plastic.addColorStop(0, '#3a3633');
        plastic.addColorStop(0.5, PLASTIC);
        plastic.addColorStop(1, '#0d0c0b');
        ctx.fillStyle = plastic;
        ctx.fill();
        ctx.restore();
        const p = L.panel;
        ctx.save();
        JellyfinFrames.roundRect(ctx, p.x, p.y, p.w, p.h, Math.min(p.w, p.h) * 0.06);
        ctx.fillStyle = 'rgba(20, 14, 10, 0.55)';
        ctx.fill();
        ctx.restore();
        // Speaker grille: woven fabric behind slats.
        const g = L.grille;
        ctx.save();
        JellyfinFrames.roundRect(ctx, g.x, g.y, g.w, g.h, 4);
        ctx.fillStyle = '#2a2420';
        ctx.fill();
        ctx.clip();
        ctx.fillStyle = 'rgba(200, 170, 120, 0.06)';
        for (let y = g.y; y < g.y + g.h; y += 3) ctx.fillRect(g.x, y, g.w, 1);
        for (let x = g.x; x < g.x + g.w; x += 3) ctx.fillRect(x, g.y, 1, g.h);
        ctx.fillStyle = '#4a3220';
        const slat = Math.max(4, g.h / 9);
        for (let y = g.y + slat * 0.5; y < g.y + g.h; y += slat * 1.6) ctx.fillRect(g.x, y, g.w, slat * 0.6);
        ctx.restore();
        // The dials, and a maker's badge.
        dial(ctx, L.dials[0], channelAngle(env.channel || 0), true);
        dial(ctx, L.dials[1], -Math.PI * 0.75 + (env.volume ?? 0.6) * Math.PI * 1.5, false);
        ctx.fillStyle = '#d8b46a';
        ctx.font = `italic 700 ${Math.max(8, c.h * 0.035)}px Georgia, serif`;
        ctx.textAlign = 'center';
        ctx.fillText('Roadwaffle', L.portrait ? c.x + c.w / 2 : p.x + p.w / 2, c.y + c.h - Math.max(6, c.h * 0.03));
        // The tube: clear, so the video shows, then glass over it.
        JellyfinFrames.cutScreen(ctx, s);
        glass(ctx, s);
    }

    // Scanlines, a vignette at the corners and a glare, translucent over the picture.
    function glass(ctx, s) {
        ctx.save();
        JellyfinFrames.roundRect(ctx, s.x, s.y, s.w, s.h, s.radius);
        ctx.clip();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.13)';
        for (let y = s.y; y < s.y + s.h; y += 3) ctx.fillRect(s.x, y, s.w, 1);
        const vignette = ctx.createRadialGradient(s.x + s.w / 2, s.y + s.h / 2, Math.min(s.w, s.h) * 0.35, s.x + s.w / 2, s.y + s.h / 2, Math.hypot(s.w, s.h) * 0.58);
        vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
        vignette.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
        ctx.fillStyle = vignette;
        ctx.fillRect(s.x, s.y, s.w, s.h);
        const glare = ctx.createLinearGradient(s.x, s.y, s.x + s.w * 0.6, s.y + s.h * 0.7);
        glare.addColorStop(0, 'rgba(255, 255, 255, 0.10)');
        glare.addColorStop(0.45, 'rgba(255, 255, 255, 0.03)');
        glare.addColorStop(0.46, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = glare;
        ctx.fillRect(s.x, s.y, s.w, s.h);
        ctx.restore();
    }

    let transition = null;   // { kind, at }

    JellyfinFrames.add({
        id: 'old-tv',
        name: 'Old TV',
        icon: '📺',
        videoFilter: 'saturate(0.85) contrast(1.08) sepia(0.12)',
        layout,
        paint,

        transition(kind, env) {
            transition = { kind, at: performance.now(), from: env.channel - 1 };
            env.busy(kind === 'change' ? SNOW_MS : kind === 'pause' ? OFF_MS : ON_MS);
        },

        tick(ctx, t, L, env) {
            const s = L.screen;
            const age = transition ? t - transition.at : Infinity;
            if (transition?.kind === 'change' && age < SNOW_MS) {
                JellyfinFrames.drawSnow(ctx, s, 0.92);
                const turn = Math.min(1, age / 250);
                const from = channelAngle(transition.from), to = channelAngle(env.channel);
                dial(ctx, L.dials[0], from + (((to - from + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * turn, true);
                glass(ctx, s);
                return 66;
            }
            if (transition?.kind === 'pause' || env.paused) {
                // The tube going off: a white line, then a dot that fades.
                const k = transition?.kind === 'pause' ? Math.min(1, age / OFF_MS) : 1;
                ctx.save();
                JellyfinFrames.roundRect(ctx, s.x, s.y, s.w, s.h, s.radius);
                ctx.fillStyle = '#050505';
                ctx.fill();
                const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
                if (k < 0.3) {
                    const q = k / 0.3;
                    ctx.fillStyle = `rgba(235, 240, 255, ${1 - q * 0.2})`;
                    ctx.fillRect(cx - (s.w / 2) * (1 - q * 0.98), cy - Math.max(1, (s.h / 2) * (1 - q) ** 4), s.w * (1 - q * 0.98), Math.max(2, s.h * (1 - q) ** 4));
                } else {
                    const q = (k - 0.3) / 0.7;
                    const dot = ctx.createRadialGradient(cx, cy, 0, cx, cy, s.w * 0.03);
                    dot.addColorStop(0, `rgba(255, 255, 255, ${0.95 * (1 - q) + 0.08})`);
                    dot.addColorStop(1, 'rgba(255, 255, 255, 0)');
                    ctx.fillStyle = dot;
                    ctx.fillRect(cx - s.w * 0.03, cy - s.w * 0.03, s.w * 0.06, s.w * 0.06);
                }
                ctx.restore();
                glass(ctx, s);
                return k < 1 ? 33 : Infinity;
            }
            if (transition?.kind === 'play' && age < ON_MS) {
                const q = age / ON_MS;
                ctx.save();
                JellyfinFrames.roundRect(ctx, s.x, s.y, s.w, s.h, s.radius);
                ctx.clip();
                ctx.fillStyle = `rgba(5, 5, 5, ${1 - q})`;
                ctx.fillRect(s.x, s.y, s.w, s.h);
                const open = s.h * q ** 0.5;
                ctx.fillStyle = `rgba(240, 245, 255, ${0.5 * (1 - q)})`;
                ctx.fillRect(s.x, s.y + (s.h - open) / 2, s.w, open);
                ctx.restore();
                return 33;
            }
            transition = null;
            if (!env.motion || !env.playing) return Infinity;
            // A faint bar rolling down the tube, now and then.
            const period = 9000, phase = (t % period) / period;
            if (phase < 0.35) {
                const y = s.y + (phase / 0.35) * (s.h + 60) - 30;
                ctx.save();
                JellyfinFrames.roundRect(ctx, s.x, s.y, s.w, s.h, s.radius);
                ctx.clip();
                const bar = ctx.createLinearGradient(0, y - 30, 0, y + 30);
                bar.addColorStop(0, 'rgba(255, 255, 255, 0)');
                bar.addColorStop(0.5, 'rgba(255, 255, 255, 0.045)');
                bar.addColorStop(1, 'rgba(255, 255, 255, 0)');
                ctx.fillStyle = bar;
                ctx.fillRect(s.x, y - 30, s.w, 60);
                ctx.restore();
                return 66;
            }
            return period - (t % period);
        },

        idle(ctx, L, env, kind) {
            const [title, detail] = JellyfinFrames.IDLE[kind] || JellyfinFrames.IDLE.setup;
            JellyfinFrames.testCard(ctx, L.screen, { title, detail });
            glass(ctx, L.screen);
        },

        // Teletext: chunky yellow on black boxes.
        cue(ctx, text, L) {
            JellyfinFrames.drawCue(ctx, text, L.screen, { font: '700 {size}px ui-monospace, Menlo, Consolas, monospace', color: '#fff27a', box: '#000', bottom: 0.08 });
        },
    });
})();
