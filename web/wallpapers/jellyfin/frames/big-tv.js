// Big Old TV: the Old TV's bigger sibling, nearly all screen. A slim cabinet
// round a rounded CRT, in the same room, with the controls shrunk into a thin
// strip (two little knobs, three sliders, a pilot light, a speaker grille and
// a badge with no name on it), stubby legs, and small rabbit ears that only
// just fit under the ceiling. Upright phones get the set on a matching stand
// with a shelf of records, and a sunburst clock on the wall that tells the
// time (so does any screen with that much wall over the set).
//
// Options (env.config): bigTvWood (five woods, each with its own grain, and
// four enamels), bigTvStyle (squared 1970s or rounded 1950s), bigTvControls
// (a strip at the side or along the bottom; upright it's always the bottom)
// and bigTvOrnament (a plant or a china cat on a doily, or nothing).
//
// The tube behaves as Old TV's does (JellyfinFrames.crt, from old-tv.js):
// snow between items while the channel knob clicks round, the collapse to a
// dot on pause. Cheap: the art is painted once; the overlay is a knob, the
// pilot light and the clock's hands, redrawn only when something changes.

(() => {
    'use strict';
    const { wall, glass, tube, channelAngle } = JellyfinFrames.crt;
    const R = JellyfinFrames.roundRect;
    const seeded = seed => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    // tones: across the grain, light to dark. dark and light: the grain's two
    // inks. figure: what makes it that wood. paint: an enamel, no grain at all.
    const WOODS = {
        walnut: { tones: ['#77492a', '#5c3820', '#412614'], dark: '26, 13, 5', light: '176, 120, 72', figure: 'cathedral', amp: 3.4, lines: 1 },
        oak: { tones: ['#cda05e', '#b98a4a', '#987038'], dark: '96, 62, 24', light: '244, 214, 156', figure: 'flake', amp: 1.1, lines: 1.25 },
        mahogany: { tones: ['#93402a', '#792c1c', '#561b12'], dark: '38, 6, 3', light: '214, 110, 74', figure: 'ribbon', amp: 0.8, lines: 0.8 },
        maple: { tones: ['#edd6a8', '#e0c592', '#c9ab76'], dark: '156, 116, 62', light: '255, 247, 222', figure: 'birdseye', amp: 1.8, lines: 0.4 },
        ebony: { tones: ['#332c28', '#211d1a', '#12100f'], dark: '0, 0, 0', light: '132, 110, 92', figure: 'streak', amp: 1.2, lines: 0.55 },
        avocado: { tones: ['#96a653', '#74843a', '#55622a'], paint: true },
        tangerine: { tones: ['#ee8a3c', '#d9682a', '#a8481a'], paint: true },
        turquoise: { tones: ['#6fc7c0', '#3fa39c', '#27756f'], paint: true },
        cream: { tones: ['#f6ecd0', '#e6d9b6', '#c6b78e'], paint: true },
    };
    const BRASS = ['#f6e2a0', '#c2933f', '#6f4e1d'], STEEL = ['#f1f0ec', '#a5a39d', '#56534e'];
    const metal = (ctx, x0, y0, x1, y1, [a, b, c]) => {
        const g = ctx.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, a); g.addColorStop(0.5, b); g.addColorStop(1, c);
        return g;
    };

    function layout(w, h, aspect, env) {
        const cfg = env.config || {};
        const fifties = cfg.bigTvStyle === 'fifties';
        const portrait = h > w * 1.1;
        const below = portrait || cfg.bigTvControls === 'below';
        const u = Math.min(w, h) / 100;
        const floor = h - env.insets.bottom - Math.max(10, u * 2.6);
        // The cabinet's wood, the bezel inside it, and the strip of controls.
        const rim = Math.max(7, u * 1.9), bezel = Math.max(4, u), edge = rim + bezel, gap = bezel * 0.6;
        const strip = clamp(u * 5.2, 32, 64), extra = strip + gap;
        const sky = Math.max(14, u * 3.2);                      // the least room over the set, for the rabbit ears
        let legs = Math.max(8, u * 1.8);
        const fit = JellyfinFrames.fit({ x: 0, y: 0,
            w: Math.min(w * 0.975 - edge * 2 - (below ? 0 : extra), w * (portrait ? 0.93 : 0.88)),
            h: Math.max(40, floor - legs - sky - edge * 2 - (below ? extra : 0)) }, aspect);
        const sw = fit.w, sh = fit.h;
        const cw = sw + edge * 2 + (below ? 0 : extra), ch = sh + edge * 2 + (below ? extra : 0);
        // Room to spare goes to a stand under it (upright) or to longer legs.
        const spare = floor - legs - sky - ch;
        let stand = null;
        if (portrait && spare > 150) {
            const tall = Math.min(spare * 0.5, cw * 0.72), wide = cw * 0.94;
            stand = { x: (w - wide) / 2, y: floor - tall, w: wide, h: tall, legs: clamp(tall * 0.24, 14, 70) };
            legs = Math.max(4, rim * 0.5);                      // little feet on the stand's top
        } else legs += Math.max(0, Math.min(spare * 0.35, ch * 0.12));
        const cabinet = { x: (w - cw) / 2, y: floor - (stand ? stand.h : 0) - legs - ch, w: cw, h: ch };
        const screen = { x: cabinet.x + edge, y: cabinet.y + edge, w: sw, h: sh, radius: Math.min(sw, sh) * (fifties ? 0.1 : 0.05) };
        const radius = fifties ? screen.radius * 0.75 + edge : Math.max(3, u * 0.9);
        // The strip stops short of the 1950s set's round corners.
        const short = fifties ? radius * 0.4 : 0;
        const panel = below ? { x: cabinet.x + rim + short, y: screen.y + sh + bezel + gap, w: cw - (rim + short) * 2, h: strip }
            : { x: screen.x + sw + bezel + gap, y: cabinet.y + rim + short, w: strip, h: ch - (rim + short) * 2 };

        // Along the strip: the knobs from one end, the speaker from the other.
        const inset = strip * (fifties ? 0.3 : 0.16), length = (below ? panel.w : panel.h) - inset * 2;
        const at = (t, far) => below ? { x: far ? panel.x + inset + t : panel.x + panel.w - inset - t, y: panel.y + strip / 2 }
            : { x: panel.x + strip / 2, y: far ? panel.y + panel.h - inset - t : panel.y + inset + t };
        const r = strip * 0.3;
        const dials = [{ ...at(r * 1.5), r }, { ...at(r * 4.2), r: r * 0.8 }];
        const pilot = { ...at(r * 6.1), r: Math.max(1.6, r * 0.24) };
        const sliders = length > strip * 6 ? [0, 1, 2].map(i => at(r * (7.6 + i * 1.05))) : [];
        const start = below ? 0 : strip * 0.95, long = clamp(below ? length / 2 - strip * 0.7 : length - strip * 4.4 - start, 0, strip * 5.5);
        const a = at(start, true), b = at(start + long, true), thick = strip * 0.56;
        const grille = long < strip * 0.8 ? null : below ? { x: a.x, y: a.y - thick / 2, w: long, h: thick } : { x: a.x - thick / 2, y: b.y, w: thick, h: long };
        const badge = below ? { x: panel.x + panel.w / 2, y: panel.y + strip / 2 } : at(strip * 0.42, true);

        // Rabbit ears: small, and where the ceiling is low the taller one leaves the picture.
        const room = cabinet.y;
        const ear = Math.min(clamp(cw * 0.075, 48, 96), room * 1.9);
        const antenna = { x: cabinet.x + cw * 0.7, y: cabinet.y, ear };
        const tall = Math.min(room - 5, cw * 0.1, 66);
        const ornament = tall >= 16 ? { x: cabinet.x + cw * 0.22, y: cabinet.y, h: tall } : null;
        const above = room - ear * 0.8;
        const clock = above > 130 ? { x: w / 2, y: above * 0.5, r: Math.min(w * 0.21, above * 0.4, h * 0.1) } : null;
        return { portrait, below, fifties, floor, cabinet, screen, legs, stand, panel, dials, pilot, sliders, grille, badge, antenna, ornament, clock,
            rim, bezel, strip, radius, u };
    }

    // Wood, in its own coordinates: the grain runs along x for `len`, and the
    // board is `across` deep. The caller clips, and turns it for an upright.
    function grain(ctx, len, across, wood, random) {
        const base = ctx.createLinearGradient(0, 0, 0, across);
        wood.tones.forEach((tone, i) => base.addColorStop(i / 2, tone));
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, len, across);
        if (wood.paint) return;
        const ink = (dark, alpha) => `rgba(${dark ? wood.dark : wood.light}, ${alpha.toFixed(3)})`;
        if (wood.figure === 'ribbon') {
            // Mahogany's ribbon stripe: soft bands that catch the light in turn.
            for (let y = 0; y < across;) {
                const band = 3 + random() * 9;
                ctx.fillStyle = ink(random() < 0.5, 0.05 + random() * 0.11);
                ctx.fillRect(0, y, len, band);
                y += band;
            }
        }
        for (let i = 0; i < (across / 3) * wood.lines + 2; i++) {
            const y = random() * across, amp = (0.4 + random()) * wood.amp, freq = 0.004 + random() * 0.01, phase = random() * 9;
            ctx.strokeStyle = ink(random() < 0.55, 0.08 + random() * 0.16);
            ctx.lineWidth = 0.6 + random() * 1.3;
            ctx.beginPath();
            for (let x = 0; x <= len + 8; x += 8) ctx[x ? 'lineTo' : 'moveTo'](x, y + Math.sin(x * freq + phase) * amp);
            ctx.stroke();
        }
        const count = per => Math.ceil((len * across) / per);
        if (wood.figure === 'cathedral') {
            // Walnut, flat sawn: long nested arches, and the odd knot.
            for (let k = 0; k < Math.max(1, len / 260); k++) {
                const x = random() * len, y = random() * across, long = 40 + random() * 70, deep = 2 + random() * 3;
                ctx.lineWidth = 1;
                for (let i = 1; i <= 5; i++) {
                    ctx.strokeStyle = ink(true, 0.3 - i * 0.04);
                    ctx.beginPath(); ctx.ellipse(x, y, long * i * 0.5, deep * i, 0, 0, 7); ctx.stroke();
                }
            }
        } else if (wood.figure === 'flake') {
            // Oak: open pores as short dark dashes, and pale ray flecks across them.
            for (let i = count(46); i > 0; i--) {
                const x = random() * len, y = random() * across;
                ctx.fillStyle = ink(true, 0.2 + random() * 0.25);
                ctx.fillRect(x, y, 3 + random() * 9, 0.8);
            }
            ctx.lineWidth = 1.3;
            for (let i = count(330); i > 0; i--) {
                const x = random() * len, y = random() * across, l = 3 + random() * 7;
                ctx.strokeStyle = ink(false, 0.3 + random() * 0.3);
                ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + l, y + (random() - 0.5) * 3); ctx.stroke();
            }
        } else if (wood.figure === 'birdseye') {
            // Maple: a faint curl across the grain, and a scatter of little eyes.
            for (let x = random() * 30; x < len; x += 14 + random() * 30) {
                ctx.fillStyle = ink(false, 0.1 + random() * 0.1);
                ctx.fillRect(x, 0, 4 + random() * 8, across);
            }
            for (let i = count(1100); i > 0; i--) {
                const x = random() * len, y = random() * across, e = 0.7 + random() * 1.1;
                ctx.strokeStyle = ink(true, 0.32);
                ctx.lineWidth = 0.8;
                ctx.beginPath(); ctx.ellipse(x, y, e * 1.5, e, 0, 0, 7); ctx.stroke();
            }
        } else if (wood.figure === 'streak') {
            // Ebony: black, with a few long brown streaks.
            for (let i = Math.max(2, across / 12); i > 0; i--) {
                const y = random() * across, x = random() * len * 0.7;
                ctx.fillStyle = ink(false, 0.1 + random() * 0.16);
                ctx.fillRect(x, y, len * (0.2 + random() * 0.5), 0.8 + random() * 1.8);
            }
        } else if (wood.figure === 'ribbon') {
            for (let i = count(70); i > 0; i--) {
                ctx.fillStyle = ink(true, 0.25 + random() * 0.2);
                ctx.fillRect(random() * len, random() * across, 2 + random() * 6, 0.8);
            }
        }
    }

    // A board: a rounded rect of that wood, the grain along its longer side
    // unless told, varnished (or, for enamel, glossed).
    function board(ctx, rect, radius, wood, random, upright = false) {
        ctx.save();
        R(ctx, rect.x, rect.y, rect.w, rect.h, radius);
        ctx.clip();
        ctx.save();
        if (upright) { ctx.translate(rect.x + rect.w, rect.y); ctx.rotate(Math.PI / 2); grain(ctx, rect.h, rect.w, wood, random); } else { ctx.translate(rect.x, rect.y); grain(ctx, rect.w, rect.h, wood, random); }
        ctx.restore();
        const sheen = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
        const lip = Math.min(0.2, 5 / rect.h);
        sheen.addColorStop(0, `rgba(255, 236, 200, ${wood.paint ? 0.5 : 0.3})`);
        sheen.addColorStop(lip, 'rgba(255, 236, 200, 0)');
        sheen.addColorStop(1 - lip * 1.6, 'rgba(0, 0, 0, 0)');
        sheen.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
        ctx.fillStyle = sheen;
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        ctx.restore();
    }

    function leg(ctx, x, top, bottom, width, lean, fifties, colour) {
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.moveTo(x - width / 2, top);
        ctx.lineTo(x + width / 2, top);
        ctx.lineTo(x + lean + width * 0.3, bottom);
        ctx.lineTo(x + lean - width * 0.3, bottom);
        ctx.fill();
        if (!fifties) return;
        // A brass ferrule on the foot.
        const cap = Math.min((bottom - top) * 0.3, width * 1.2), k = 1 - cap / (bottom - top), half = width * (0.5 - 0.2 * k);
        ctx.fillStyle = metal(ctx, x - width, 0, x + width, 0, BRASS);
        ctx.beginPath();
        ctx.moveTo(x + lean * k - half, bottom - cap);
        ctx.lineTo(x + lean * k + half, bottom - cap);
        ctx.lineTo(x + lean + width * 0.3, bottom);
        ctx.lineTo(x + lean - width * 0.3, bottom);
        ctx.fill();
    }

    // A knob: knurled metal on the 1970s set, cream bakelite with a brass cap on the 1950s one.
    function knob(ctx, { x, y, r }, angle, fifties) {
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.beginPath(); ctx.arc(x + r * 0.1, y + r * 0.16, r * 1.05, 0, 7); ctx.fill();
        const body = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
        (fifties ? ['#fffaf0', '#e9dcc0', '#9a8a68'] : ['#f6f2e8', '#b4aa98', '#57504a']).forEach((c, i) => body.addColorStop([0, 0.55, 1][i], c));
        ctx.fillStyle = body;
        ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
        if (fifties) {
            ctx.fillStyle = metal(ctx, x - r * 0.4, y - r * 0.4, x + r * 0.4, y + r * 0.4, BRASS);
            ctx.beginPath(); ctx.arc(x, y, r * 0.42, 0, 7); ctx.fill();
        } else {
            ctx.strokeStyle = 'rgba(40, 30, 20, 0.5)';
            ctx.lineWidth = Math.max(0.7, r * 0.06);
            for (let i = 0; i < 20; i++) {
                const a = (i / 20) * Math.PI * 2;
                ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8); ctx.lineTo(x + Math.cos(a) * r * 0.98, y + Math.sin(a) * r * 0.98); ctx.stroke();
            }
        }
        ctx.strokeStyle = fifties ? '#3a2416' : '#221812';
        ctx.lineWidth = Math.max(1.4, r * 0.16);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(angle) * r * (fifties ? 0.5 : 0.12), y + Math.sin(angle) * r * (fifties ? 0.5 : 0.12));
        ctx.lineTo(x + Math.cos(angle) * r * 0.86, y + Math.sin(angle) * r * 0.86);
        ctx.stroke();
        ctx.restore();
    }

    // The pilot light: a little red jewel, glowing while the set is on.
    function jewel(ctx, { x, y, r }, lit) {
        if (lit) {
            const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
            glow.addColorStop(0, 'rgba(255, 96, 60, 0.55)');
            glow.addColorStop(1, 'rgba(255, 96, 60, 0)');
            ctx.fillStyle = glow;
            ctx.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
        }
        ctx.fillStyle = '#0c0a09';
        ctx.beginPath(); ctx.arc(x, y, r * 1.35, 0, 7); ctx.fill();
        ctx.fillStyle = lit ? '#ff5a3a' : '#5a1810';
        ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
        ctx.fillStyle = lit ? 'rgba(255, 236, 214, 0.9)' : 'rgba(255, 220, 200, 0.3)';
        ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, 7); ctx.fill();
    }

    // The strip of controls: a fascia, the knobs' marks, sliders, the grille and a badge.
    function controls(ctx, L, env) {
        const p = L.panel, f = L.fifties, s = L.strip;
        ctx.save();
        R(ctx, p.x, p.y, p.w, p.h, f ? s / 2 : s * 0.1);
        ctx.fillStyle = f ? 'rgba(20, 10, 4, 0.34)' : 'rgba(16, 12, 10, 0.72)';
        ctx.fill();
        ctx.strokeStyle = f ? metal(ctx, p.x, p.y, p.x + p.w, p.y + p.h, BRASS) : 'rgba(210, 206, 196, 0.35)';
        ctx.lineWidth = f ? Math.max(1, s * 0.035) : 1;
        ctx.stroke();
        ctx.restore();
        // Twelve stops round the channel knob, and a wedge of loudness round the other.
        const [channel, volume] = L.dials;
        ctx.fillStyle = f ? 'rgba(246, 226, 160, 0.8)' : 'rgba(236, 232, 222, 0.7)';
        for (let n = 0; n < 12; n++) {
            const a = channelAngle(n), size = Math.max(0.7, channel.r * (n % 3 ? 0.06 : 0.1));
            ctx.beginPath(); ctx.arc(channel.x + Math.cos(a) * channel.r * 1.32, channel.y + Math.sin(a) * channel.r * 1.32, size, 0, 7); ctx.fill();
        }
        for (let n = 0; n <= 6; n++) {
            const a = -Math.PI * 0.75 + (n / 6) * Math.PI * 1.5;
            ctx.beginPath(); ctx.arc(volume.x + Math.cos(a) * volume.r * 1.4, volume.y + Math.sin(a) * volume.r * 1.4, Math.max(0.6, volume.r * (0.05 + n * 0.012)), 0, 7); ctx.fill();
        }
        knob(ctx, channel, channelAngle(env.channel || 0), f);
        knob(ctx, volume, -Math.PI * 0.75 + (env.volume ?? 0.6) * Math.PI * 1.5, f);
        jewel(ctx, L.pilot, false);
        // Sliders: a slot across the strip, a nub somewhere along it.
        L.sliders.forEach(({ x, y }, i) => {
            const half = s * 0.27, where = [0.3, -0.45, 0.1][i] * half, nub = Math.max(1.5, s * 0.055);
            ctx.save();
            ctx.translate(x, y);
            if (L.below) ctx.rotate(Math.PI / 2);
            ctx.fillStyle = '#080706';
            ctx.fillRect(-half, -1, half * 2, 2);
            ctx.fillStyle = metal(ctx, 0, -nub, 0, nub, f ? BRASS : STEEL);
            ctx.fillRect(where - nub * 0.8, -nub * 1.3, nub * 1.6, nub * 2.6);
            ctx.restore();
        });
        const g = L.grille;
        if (g) {
            ctx.save();
            R(ctx, g.x, g.y, g.w, g.h, f ? Math.min(g.w, g.h) / 2 : 2);
            ctx.fillStyle = f ? '#8a6f3c' : '#2a2420';
            ctx.fill();
            ctx.clip();
            if (f) {
                // Gold cloth: a close weave.
                ctx.fillStyle = 'rgba(255, 232, 160, 0.35)';
                for (let y = g.y; y < g.y + g.h; y += 3) ctx.fillRect(g.x, y, g.w, 1);
                ctx.fillStyle = 'rgba(60, 36, 10, 0.4)';
                for (let x = g.x; x < g.x + g.w; x += 3) ctx.fillRect(x, g.y, 1, g.h);
            } else {
                // Fabric behind slats, as on the Old TV.
                ctx.fillStyle = 'rgba(200, 170, 120, 0.08)';
                for (let y = g.y; y < g.y + g.h; y += 3) ctx.fillRect(g.x, y, g.w, 1);
                for (let x = g.x; x < g.x + g.w; x += 3) ctx.fillRect(x, g.y, 1, g.h);
                ctx.fillStyle = '#5b4028';
                const slat = Math.max(3, s * 0.11);
                if (L.below) for (let x = g.x + slat * 0.6; x < g.x + g.w; x += slat * 1.7) ctx.fillRect(x, g.y, slat * 0.7, g.h);
                else for (let y = g.y + slat * 0.6; y < g.y + g.h; y += slat * 1.7) ctx.fillRect(g.x, y, g.w, slat * 0.7);
            }
            ctx.restore();
            if (f) {
                ctx.strokeStyle = metal(ctx, g.x, g.y, g.x + g.w, g.y + g.h, BRASS);
                ctx.lineWidth = Math.max(1, s * 0.035);
                R(ctx, g.x, g.y, g.w, g.h, Math.min(g.w, g.h) / 2);
                ctx.stroke();
            }
        }
        // The badge: a brass plate with a little star, and nobody's name.
        const b = L.badge, bw = s * 0.62, bh = s * 0.3;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        R(ctx, b.x - bw / 2 + 0.6, b.y - bh / 2 + 1, bw, bh, bh * 0.3);
        ctx.fill();
        ctx.fillStyle = metal(ctx, b.x, b.y - bh / 2, b.x, b.y + bh / 2, BRASS);
        R(ctx, b.x - bw / 2, b.y - bh / 2, bw, bh, bh * 0.3);
        ctx.fill();
        ctx.fillStyle = '#4a3210';
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 - Math.PI / 2, q = (i % 2 ? 0.12 : i % 4 ? 0.3 : 0.38) * bh * (i % 4 === 2 ? 2.2 : 1);
            ctx.lineTo(b.x + Math.cos(a) * q, b.y + Math.sin(a) * q);
        }
        ctx.fill();
    }

    function rabbitEars(ctx, { x, y, ear }) {
        ctx.save();
        ctx.lineCap = 'round';
        const wide = Math.max(1.3, ear * 0.028);
        for (const [angle, length] of [[-2.75, 1], [-0.9, 0.92]]) {
            const tip = { x: x + Math.cos(angle) * ear * length, y: y - ear * 0.1 + Math.sin(angle) * ear * length };
            ctx.strokeStyle = '#d9d6cf';
            ctx.lineWidth = wide;
            ctx.beginPath(); ctx.moveTo(x, y - ear * 0.1); ctx.lineTo(tip.x, tip.y); ctx.stroke();
            ctx.fillStyle = '#efebe1';
            ctx.beginPath(); ctx.arc(tip.x, tip.y, wide * 1.5, 0, 7); ctx.fill();
        }
        ctx.fillStyle = '#1b1917';
        ctx.beginPath(); ctx.ellipse(x, y, Math.max(11, ear * 0.2), Math.max(6, ear * 0.13), 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
        ctx.beginPath(); ctx.ellipse(x - ear * 0.05, y - ear * 0.06, ear * 0.08, ear * 0.03, -0.3, 0, 7); ctx.fill();
        ctx.restore();
    }

    // Something on top, on a lace doily that hangs a little over the front.
    function ornament(ctx, { x, y, h }, kind, rim) {
        const wide = h * 1.5, scallop = clamp(rim * 0.28, 2, 5);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.fillRect(x - wide / 2, y + 1, wide, scallop + 1.5);
        ctx.fillStyle = '#f6f1e3';
        ctx.fillRect(x - wide / 2, y - 1.5, wide, 2.5);
        const n = Math.round(wide / (scallop * 2));
        for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(x - wide / 2 + ((i + 0.5) * wide) / n, y + 0.5, wide / n / 2, 0, Math.PI); ctx.fill(); }
        ctx.fillStyle = 'rgba(120, 100, 70, 0.5)';
        for (let i = 0; i < n; i++) ctx.fillRect(x - wide / 2 + ((i + 0.5) * wide) / n - 0.5, y + scallop * 0.35, 1, 1);
        const base = y - 1.5;
        if (kind === 'cat') {
            // A china cat, sitting, with a gold collar.
            const glaze = ctx.createLinearGradient(x - h * 0.25, 0, x + h * 0.3, 0);
            glaze.addColorStop(0, '#ffffff'); glaze.addColorStop(0.6, '#ece8dc'); glaze.addColorStop(1, '#b9b3a2');
            ctx.fillStyle = glaze;
            ctx.strokeStyle = glaze;
            ctx.lineWidth = h * 0.09;
            ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(x + h * 0.14, base - h * 0.06); ctx.quadraticCurveTo(x + h * 0.42, base - h * 0.04, x + h * 0.36, base - h * 0.3); ctx.stroke();   // tail
            ctx.beginPath(); ctx.ellipse(x, base - h * 0.27, h * 0.2, h * 0.28, 0, 0, 7); ctx.fill();
            ctx.beginPath(); ctx.arc(x - h * 0.02, base - h * 0.68, h * 0.17, 0, 7); ctx.fill();
            for (const side of [-1, 1]) {
                ctx.beginPath();
                ctx.moveTo(x - h * 0.02 + side * h * 0.16, base - h * 0.72);
                ctx.lineTo(x - h * 0.02 + side * h * 0.13, base - h * 0.96);
                ctx.lineTo(x - h * 0.02 + side * h * 0.02, base - h * 0.82);
                ctx.fill();
            }
            ctx.fillStyle = '#c2933f';
            ctx.fillRect(x - h * 0.13, base - h * 0.53, h * 0.24, Math.max(1.2, h * 0.045));
            ctx.fillStyle = '#2a2420';
            for (const side of [-1, 1]) ctx.fillRect(x - h * 0.02 + side * h * 0.07 - h * 0.025, base - h * 0.71, h * 0.05, Math.max(1, h * 0.03));
        } else {
            // A snake plant in a terracotta pot.
            const pot = h * 0.36, top = base - pot;
            for (const [lean, tall, shade] of [[-0.5, 0.72, '#2f6a3a'], [0.46, 0.8, '#2f6a3a'], [-0.22, 0.95, '#3f8048'], [0.2, 1, '#377541'], [0, 0.86, '#4a8f52']]) {
                const tx = x + Math.sin(lean) * h * 0.5, ty = base - h * tall, half = h * 0.07;
                ctx.fillStyle = shade;
                ctx.beginPath();
                ctx.moveTo(x - half, top + 1);
                ctx.quadraticCurveTo(x - half * 1.5 + (tx - x) * 0.5, (top + ty) / 2, tx, ty);
                ctx.quadraticCurveTo(x + half * 1.5 + (tx - x) * 0.5, (top + ty) / 2, x + half, top + 1);
                ctx.fill();
                ctx.strokeStyle = 'rgba(214, 226, 140, 0.55)';
                ctx.lineWidth = Math.max(0.6, h * 0.014);
                ctx.beginPath(); ctx.moveTo(x, top); ctx.quadraticCurveTo(x + (tx - x) * 0.5, (top + ty) / 2, tx, ty); ctx.stroke();
            }
            ctx.fillStyle = metal(ctx, x - h * 0.2, 0, x + h * 0.2, 0, ['#d98a5c', '#b4603a', '#7a3c22']);
            ctx.beginPath();
            ctx.moveTo(x - h * 0.2, top); ctx.lineTo(x + h * 0.2, top); ctx.lineTo(x + h * 0.15, base); ctx.lineTo(x - h * 0.15, base);
            ctx.fill();
            ctx.fillRect(x - h * 0.23, top - h * 0.02, h * 0.46, h * 0.09);
        }
    }

    // A sunburst clock for the wall. Its hands go on the overlay (hands()).
    function sunburst(ctx, { x, y, r }) {
        ctx.save();
        ctx.lineCap = 'round';
        for (const shadow of [true, false]) {
            const ox = shadow ? r * 0.05 : 0, oy = shadow ? r * 0.08 : 0;
            for (let i = 0; i < 24; i++) {
                const a = (i / 24) * Math.PI * 2, long = i % 2 ? 0.7 : 1, c = Math.cos(a), s = Math.sin(a);
                ctx.strokeStyle = shadow ? 'rgba(0, 0, 0, 0.28)' : i % 2 ? '#7a4f2c' : metal(ctx, x - r, y - r, x + r, y + r, BRASS);
                ctx.lineWidth = Math.max(1.2, r * (i % 2 ? 0.05 : 0.03));
                ctx.beginPath(); ctx.moveTo(x + ox + c * r * 0.3, y + oy + s * r * 0.3); ctx.lineTo(x + ox + c * r * long, y + oy + s * r * long); ctx.stroke();
                if (i % 2) continue;
                ctx.fillStyle = shadow ? 'rgba(0, 0, 0, 0.28)' : '#e6c672';
                ctx.beginPath(); ctx.arc(x + ox + c * r, y + oy + s * r, Math.max(1.6, r * 0.045), 0, 7); ctx.fill();
            }
            ctx.fillStyle = shadow ? 'rgba(0, 0, 0, 0.28)' : metal(ctx, x - r * 0.3, y - r * 0.3, x + r * 0.3, y + r * 0.3, BRASS);
            ctx.beginPath(); ctx.arc(x + ox, y + oy, r * 0.36, 0, 7); ctx.fill();
        }
        const face = ctx.createRadialGradient(x - r * 0.1, y - r * 0.12, 0, x, y, r * 0.32);
        face.addColorStop(0, '#3b2f26');
        face.addColorStop(1, '#1d1612');
        ctx.fillStyle = face;
        ctx.beginPath(); ctx.arc(x, y, r * 0.32, 0, 7); ctx.fill();
        ctx.fillStyle = '#e6c672';
        for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 0.26, y + Math.sin(a) * r * 0.26, Math.max(0.8, r * (i % 3 ? 0.012 : 0.022)), 0, 7); ctx.fill();
        }
        ctx.restore();
    }

    function hands(ctx, { x, y, r }, now) {
        const minutes = now.getMinutes(), hours = (now.getHours() % 12) + minutes / 60;
        ctx.save();
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#f2dc9a';
        for (const [turn, length, wide] of [[hours / 12, 0.15, 0.03], [minutes / 60, 0.23, 0.02]]) {
            const a = turn * Math.PI * 2 - Math.PI / 2;
            ctx.lineWidth = Math.max(1.4, r * wide);
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r * length, y + Math.sin(a) * r * length); ctx.stroke();
        }
        ctx.fillStyle = '#f2dc9a';
        ctx.beginPath(); ctx.arc(x, y, Math.max(1.6, r * 0.03), 0, 7); ctx.fill();
        ctx.restore();
    }

    // The stand an upright set sits on: a shelf of records over two sliding doors.
    function standArt(ctx, L, wood, random, dark) {
        const t = L.stand, f = L.fifties, legW = Math.max(7, t.w * 0.03), body = { x: t.x, y: t.y, w: t.w, h: t.h - t.legs };
        for (const side of [-1, 1]) leg(ctx, t.x + t.w / 2 + side * t.w * 0.4, body.y + body.h - 2, L.floor, legW, f ? side * t.legs * 0.3 : 0, f, dark);
        board(ctx, body, f ? L.radius * 0.5 : L.radius, wood, random);
        const m = Math.max(6, t.w * 0.03), shelf = { x: body.x + m, y: body.y + m, w: body.w - m * 2, h: (body.h - m * 3) * 0.44 };
        const doors = { x: shelf.x, y: shelf.y + shelf.h + m, w: shelf.w, h: body.h - m * 3 - shelf.h };
        // The shelf: dark inside, records leaning along it, a few magazines lying flat.
        ctx.save();
        R(ctx, shelf.x, shelf.y, shelf.w, shelf.h, f ? m * 0.8 : 2);
        ctx.fillStyle = '#17100b';
        ctx.fill();
        ctx.clip();
        const SLEEVES = ['#b8412f', '#d9a441', '#3f6f8a', '#e8dcc0', '#4d7a52', '#8a4a7a', '#d9682a', '#2b2b33', '#6fb0a8'];
        let x = shelf.x + 3;
        const end = shelf.x + shelf.w * 0.68;
        while (x < end) {
            const wide = 2 + random() * 3.5, tall = shelf.h * (0.8 + random() * 0.12);
            ctx.fillStyle = SLEEVES[(random() * SLEEVES.length) | 0];
            ctx.fillRect(x, shelf.y + shelf.h - tall, wide, tall);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.fillRect(x + wide - 0.8, shelf.y + shelf.h - tall, 0.8, tall);
            x += wide + 0.6;
        }
        for (let i = 0; i < 4; i++) {
            const wide = shelf.w * (0.2 + random() * 0.05), tall = Math.max(2.5, shelf.h * 0.07);
            ctx.fillStyle = SLEEVES[(i * 2 + 3) % SLEEVES.length];
            ctx.fillRect(shelf.x + shelf.w * 0.72 + random() * 4, shelf.y + shelf.h - (i + 1) * tall, wide, tall - 0.8);
        }
        const dim = ctx.createLinearGradient(0, shelf.y, 0, shelf.y + shelf.h);
        dim.addColorStop(0, 'rgba(0, 0, 0, 0.6)');
        dim.addColorStop(0.5, 'rgba(0, 0, 0, 0.08)');
        ctx.fillStyle = dim;
        ctx.fillRect(shelf.x, shelf.y, shelf.w, shelf.h);
        ctx.restore();
        // Two doors, each with a finger pull.
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(doors.x - 1, doors.y - 1, doors.w + 2, doors.h + 2);
        for (const side of [0, 1]) {
            const d = { x: doors.x + side * (doors.w / 2 + 0.75), y: doors.y, w: doors.w / 2 - 0.75, h: doors.h };
            board(ctx, d, f ? m * 0.5 : 1, wood, random);
            const px = d.x + (side ? d.w * 0.14 : d.w * 0.86), py = d.y + d.h / 2, pr = Math.max(3, Math.min(d.h * 0.13, d.w * 0.07));
            ctx.fillStyle = f ? metal(ctx, px - pr, py - pr, px + pr, py + pr, BRASS) : 'rgba(0, 0, 0, 0.55)';
            ctx.beginPath(); ctx.arc(px, py, pr, 0, 7); ctx.fill();
            ctx.fillStyle = 'rgba(255, 230, 190, 0.18)';
            ctx.beginPath(); ctx.arc(px, py + pr * 0.25, pr * 0.72, 0, Math.PI); ctx.fill();
        }
    }

    function paint(ctx, L, env) {
        const { w, h } = env.viewport, cfg = env.config || {};
        const wood = WOODS[cfg.bigTvWood] || WOODS.walnut;
        const random = seeded(1957 + Object.keys(WOODS).indexOf(cfg.bigTvWood) * 31);
        const { cabinet: c, screen: s, fifties: f, rim, bezel } = L;
        const dark = wood.paint ? '#1c1a18' : wood.tones[2];
        wall(ctx, w, h, L.floor);
        if (L.clock) sunburst(ctx, L.clock);

        // Its shadow on the carpet, then whatever holds it up.
        const under = L.stand || c;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.36)';
        ctx.beginPath(); ctx.ellipse(under.x + under.w / 2, L.floor + 3, under.w * 0.52, Math.max(5, L.u * 1.3), 0, 0, 7); ctx.fill();
        if (L.stand) standArt(ctx, L, wood.paint ? WOODS.walnut : wood, random, wood.paint ? WOODS.walnut.tones[2] : dark);
        const legW = Math.max(6, c.w * 0.014), foot = c.y + c.h + L.legs;
        for (const side of [-1, 1]) leg(ctx, c.x + c.w / 2 + side * c.w * (L.stand ? 0.4 : 0.44), c.y + c.h - 2, foot, legW, f && !L.stand ? side * L.legs * 0.35 : 0, f, dark);

        rabbitEars(ctx, L.antenna);

        // The cabinet. The 1970s one is framed: rails along the top and bottom,
        // uprights mitred into them. The 1950s one is a single bent shell.
        board(ctx, c, L.radius, wood, random);
        if (!f && !wood.paint) {
            for (const side of [0, 1]) {
                const x0 = side ? c.x + c.w : c.x, x1 = side ? c.x + c.w - rim : c.x + rim;
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(x0, c.y); ctx.lineTo(x1, c.y + rim); ctx.lineTo(x1, c.y + c.h - rim); ctx.lineTo(x0, c.y + c.h);
                ctx.clip();
                board(ctx, { x: Math.min(x0, x1), y: c.y, w: rim, h: c.h }, 0, wood, random, true);
                const light = ctx.createLinearGradient(x0, 0, x1, 0);
                light.addColorStop(0, side ? 'rgba(0, 0, 0, 0.28)' : 'rgba(255, 236, 200, 0.2)');
                light.addColorStop(1, 'rgba(0, 0, 0, 0.12)');
                ctx.fillStyle = light;
                ctx.fillRect(Math.min(x0, x1), c.y, rim, c.h);
                ctx.restore();
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
                ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(x0, c.y); ctx.lineTo(x1, c.y + rim); ctx.moveTo(x0, c.y + c.h); ctx.lineTo(x1, c.y + c.h - rim); ctx.stroke();
            }
        }
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.lineWidth = 1;
        R(ctx, c.x + 0.5, c.y + 0.5, c.w - 1, c.h - 1, L.radius);
        ctx.stroke();
        if (wood.paint || f) {
            // A trim line round the edge: chrome on enamel, brass on the 1950s woods.
            ctx.strokeStyle = metal(ctx, c.x, c.y, c.x, c.y + c.h, wood.paint && !f ? STEEL : BRASS);
            ctx.lineWidth = Math.max(1, rim * 0.1);
            R(ctx, c.x + rim * 0.3, c.y + rim * 0.3, c.w - rim * 0.6, c.h - rim * 0.6, Math.max(1, L.radius - rim * 0.3));
            ctx.stroke();
        }

        controls(ctx, L, env);

        // The bezel round the tube: dark plastic in a bright trim.
        const outer = { x: s.x - bezel, y: s.y - bezel, w: s.w + bezel * 2, h: s.h + bezel * 2, r: s.radius + bezel };
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        R(ctx, outer.x - 1.5, outer.y - 1, outer.w + 3, outer.h + 3.5, outer.r + 1.5);
        ctx.fill();
        ctx.fillStyle = metal(ctx, outer.x, outer.y, outer.x + outer.w * 0.3, outer.y + outer.h, f ? BRASS : STEEL);
        R(ctx, outer.x, outer.y, outer.w, outer.h, outer.r);
        ctx.fill();
        const trim = bezel * (f ? 0.34 : 0.16);
        const plastic = ctx.createLinearGradient(0, outer.y, 0, outer.y + outer.h);
        plastic.addColorStop(0, '#3a3633');
        plastic.addColorStop(0.5, '#1c1a18');
        plastic.addColorStop(1, '#0d0c0b');
        ctx.fillStyle = plastic;
        R(ctx, outer.x + trim, outer.y + trim, outer.w - trim * 2, outer.h - trim * 2, outer.r - trim);
        ctx.fill();
        JellyfinFrames.cutScreen(ctx, s);
        glass(ctx, s);

        if (L.ornament && cfg.bigTvOrnament !== 'none') ornament(ctx, L.ornament, cfg.bigTvOrnament, rim);
    }

    const crt = tube((ctx, L, angle) => knob(ctx, L.dials[0], angle, L.fifties));

    JellyfinFrames.add({
        id: 'big-tv',
        name: 'Big Old TV',
        icon: '🪵',
        videoFilter: 'saturate(0.85) contrast(1.08) sepia(0.12)',
        layout,
        paint,
        transition: crt.transition,

        tick(ctx, t, L, env) {
            // The art's knob is where it was when painted: this one is where it is now.
            knob(ctx, L.dials[0], channelAngle(env.channel || 0), L.fifties);
            jewel(ctx, L.pilot, !env.paused);
            const wait = crt.tick(ctx, t, L, env);
            if (!L.clock) return wait;
            hands(ctx, L.clock, env.now);
            return Math.min(wait, 60050 - env.now.getSeconds() * 1000 - env.now.getMilliseconds());
        },

        idle(ctx, L, env, kind) {
            const [title, detail] = JellyfinFrames.IDLE[kind] || JellyfinFrames.IDLE.setup;
            JellyfinFrames.testCard(ctx, L.screen, { title, detail });
            glass(ctx, L.screen);
        },

        // Teletext, as on the Old TV: chunky yellow on black boxes.
        cue(ctx, text, L) {
            JellyfinFrames.drawCue(ctx, text, L.screen, { font: '700 {size}px ui-monospace, Menlo, Consolas, monospace', color: '#fff27a', box: '#000', bottom: 0.08 });
        },
    });
})();
