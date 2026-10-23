// Porthole: outside a submarine, deep in green-blue water, looking in
// through its big brass viewing port. The hull is riveted steel plates with
// a rain-brow over the port, two small round portholes lit warm from inside,
// a deck rail along the top and barnacles low down; light falls in shafts
// from the surface, and kelp, rocks and a starfish sit on the sand below.
//
// The port is an oblong porthole (a rounded rectangle), so the picture keeps
// its shape: a round one would crop away half of a wide film.
//
// What moves, only while frame motion is on: bubbles rising from the hull's
// vents and the sea floor, past the glass, and now and then a school of
// fish, a lone big fish, or (rarely) a jellyfish pulsing slowly up. Between
// items a rush of bubbles sweeps the glass; a pause is ALL STOP, the cabin
// lights dimmed. When nothing plays the port shows the sonar screen.

(() => {
    'use strict';

    const RUSH_MS = 1100, STOP_MS = 600, GO_MS = 450;
    const FRAME_MS = 66;                          // bubbles and fish: ~15 fps is plenty
    const GREEN = '125, 255, 180';

    // A tiny seeded random, so the hull is the same on every repaint.
    const seeded = seed => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

    const WORDS = {
        setup: 'NO CONTACT', demo: 'NO CONTACT', signedout: 'NO CONTACT',
        connecting: 'PINGING…', offline: 'CONTACT LOST', empty: 'NOTHING ON SONAR',
        loading: 'DIVING…', away: 'ON ANOTHER DECK',
    };

    // ---- Sprites, baked once -------------------------------------------------------

    let bubbleSprite = null;
    function bubble() {
        if (bubbleSprite) return bubbleSprite;
        const size = 48, c = document.createElement('canvas');
        c.width = c.height = size;
        const g = c.getContext('2d');
        const r = size / 2 - 2;
        const body = g.createRadialGradient(size * 0.42, size * 0.38, r * 0.1, size / 2, size / 2, r);
        body.addColorStop(0, 'rgba(210, 245, 255, 0.05)');
        body.addColorStop(0.8, 'rgba(190, 240, 255, 0.14)');
        body.addColorStop(1, 'rgba(225, 250, 255, 0.55)');
        g.fillStyle = body;
        g.beginPath();
        g.arc(size / 2, size / 2, r, 0, 7);
        g.fill();
        g.strokeStyle = 'rgba(235, 252, 255, 0.7)';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(size / 2, size / 2, r * 0.68, Math.PI * 1.1, Math.PI * 1.45);
        g.stroke();
        g.fillStyle = 'rgba(255, 255, 255, 0.9)';
        g.beginPath();
        g.arc(size * 0.36, size * 0.33, r * 0.12, 0, 7);
        g.fill();
        return (bubbleSprite = c);
    }

    let glowSprite = null;
    function glow() {
        if (glowSprite) return glowSprite;
        const size = 64, c = document.createElement('canvas');
        c.width = c.height = size;
        const g = c.getContext('2d');
        const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        grad.addColorStop(0, 'rgba(190, 120, 255, 0.9)');
        grad.addColorStop(0.4, 'rgba(120, 150, 255, 0.3)');
        grad.addColorStop(1, 'rgba(0, 164, 220, 0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, size, size);
        return (glowSprite = c);
    }

    // The sonar's still parts, per kind and size (the overlay redraws every
    // frame the bubbles move).
    let sonarCache = null;

    // ---- Layout -----------------------------------------------------------------------

    function layout(w, h, aspect, env) {
        const portrait = h > w * 1.1;
        const seabed = h - env.insets.bottom - Math.max(8, h * 0.02);
        const sw = portrait ? w * 0.76 : Math.min(w * 0.5, h * 0.43 * aspect);
        const sh = sw / aspect;
        const cy = portrait ? Math.min(h * 0.42, seabed - h * 0.3) : Math.min(h * 0.49, seabed - sh * 0.5 - h * 0.19);
        const screen = { x: (w - sw) / 2, y: cy - sh / 2, w: sw, h: sh, radius: sh * 0.34 };
        const ring = Math.max(14, sh * 0.15);
        const outer = { x: screen.x - ring, y: screen.y - ring, w: sw + ring * 2, h: sh + ring * 2, radius: screen.radius + ring };
        const hull = { top: outer.y - Math.max(ring * 1.2, h * (portrait ? 0.1 : 0.05)), bottom: outer.y + outer.h + Math.max(ring * 1.5, h * (portrait ? 0.12 : 0.07)) };
        // The sail (conning tower) rising off the hull, if there's water above.
        const sail = hull.top > h * 0.08 ? { x: portrait ? w * 0.52 : w * 0.66, w: portrait ? w * 0.36 : w * 0.2, top: Math.max(-h * 0.1, hull.top - h * 0.3) } : null;
        // A brass plate under the port, for the title.
        const plate = { y: outer.y + outer.h + ring * 0.3, h: Math.max(16, ring * 0.62), maxW: outer.w * 0.6 };
        // Two small round portholes, either side if there's room, else above.
        const smalls = [];
        const r = Math.min(outer.x * 0.26, sh * 0.15);
        if (r > 14) for (const x of [outer.x / 2, w - outer.x / 2]) smalls.push({ x, y: cy - sh * 0.05, r });
        else {
            const rr = Math.min(w * 0.06, (outer.y - hull.top) * 0.32);
            if (rr > 8) for (const x of [w * 0.3, w * 0.7]) smalls.push({ x, y: (outer.y + hull.top) / 2, r: rr });
        }
        if (smalls.length) smalls[smalls.length - 1].cat = true;
        const vents = [0.14, 0.62, 0.86].map(q => ({ x: w * q, y: hull.bottom }));
        return { portrait, seabed, screen, outer, ring, hull, sail, plate, smalls, vents, w, h };
    }

    // Points along a rounded rect's centre line, evenly spaced.
    function around(rect, inset, n) {
        const x = rect.x + inset, y = rect.y + inset, w = rect.w - inset * 2, h = rect.h - inset * 2;
        const r = Math.max(0, Math.min(rect.radius - inset, w / 2, h / 2));
        const sx = w - r * 2, sy = h - r * 2, arc = (Math.PI / 2) * r;
        const total = 2 * (sx + sy) + 4 * arc;
        const points = [];
        for (let i = 0; i < n; i++) {
            let d = (i / n) * total;
            const corner = (cx, cy, a0) => { const a = a0 + (d / arc) * (Math.PI / 2); return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }; };
            if (d < sx) { points.push({ x: x + r + d, y }); continue; } d -= sx;
            if (d < arc) { points.push(corner(x + w - r, y + r, -Math.PI / 2)); continue; } d -= arc;
            if (d < sy) { points.push({ x: x + w, y: y + r + d }); continue; } d -= sy;
            if (d < arc) { points.push(corner(x + w - r, y + h - r, 0)); continue; } d -= arc;
            if (d < sx) { points.push({ x: x + w - r - d, y: y + h }); continue; } d -= sx;
            if (d < arc) { points.push(corner(x + r, y + h - r, Math.PI / 2)); continue; } d -= arc;
            if (d < sy) { points.push({ x, y: y + h - r - d }); continue; } d -= sy;
            points.push(corner(x + r, y + r, Math.PI));
        }
        return points;
    }

    // ---- The sea -----------------------------------------------------------------------

    function sea(ctx, L) {
        const { w, h, seabed } = L;
        const water = ctx.createLinearGradient(0, 0, 0, h);
        water.addColorStop(0, '#1b6f86');
        water.addColorStop(0.45, '#0b3f55');
        water.addColorStop(1, '#03141f');
        ctx.fillStyle = water;
        ctx.fillRect(0, 0, w, h);
        // Shafts of light from the surface, fanning down from the upper left.
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const random = seeded(2008);
        for (let i = 0; i < 7; i++) {
            const x = w * (-0.1 + random() * 0.9), width = w * (0.03 + random() * 0.07), lean = w * 0.18;
            const g = ctx.createLinearGradient(0, 0, 0, h * 0.85);
            g.addColorStop(0, `rgba(170, 240, 255, ${0.06 + random() * 0.06})`);
            g.addColorStop(1, 'rgba(170, 240, 255, 0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x + width, 0);
            ctx.lineTo(x + width * 2.2 + lean, h * 0.85);
            ctx.lineTo(x + lean, h * 0.85);
            ctx.fill();
        }
        // Marine snow: specks hanging in the water.
        ctx.fillStyle = 'rgba(200, 240, 255, 0.25)';
        for (let i = 0; i < (w * h) / 5000; i++) ctx.fillRect(random() * w, random() * h, 1 + random(), 1 + random());
        ctx.restore();
        // The sea floor: two layers of dunes, rocks, kelp and a starfish.
        const dune = (y0, amp, color, seed) => {
            const r = seeded(seed);
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(0, h);
            for (let x = 0; x <= w + 20; x += 20) ctx.lineTo(x, y0 - amp * (0.5 + 0.5 * Math.sin(x * 0.006 + r() * 0.3 + seed)));
            ctx.lineTo(w, h);
            ctx.fill();
        };
        dune(seabed - h * 0.03, h * 0.03, '#0d2629', 3);
        const kelp = seeded(55);
        for (let i = 0; i < Math.max(4, w / 120); i++) {
            const x = kelp() * w, tall = h * (0.12 + kelp() * 0.2), sway = (kelp() - 0.5) * w * 0.05;
            ctx.strokeStyle = kelp() < 0.5 ? '#123a2a' : '#0f2f26';
            ctx.lineWidth = Math.max(3, w * 0.004);
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(x, seabed);
            ctx.bezierCurveTo(x + sway, seabed - tall * 0.4, x - sway, seabed - tall * 0.7, x + sway * 0.6, seabed - tall);
            ctx.stroke();
            ctx.fillStyle = ctx.strokeStyle;
            for (let k = 0.25; k < 1; k += 0.18) {
                const ly = seabed - tall * k, lx = x + sway * Math.sin(k * 4) * 0.5;
                ctx.beginPath();
                ctx.ellipse(lx + (k * 10 % 2 < 1 ? 6 : -6), ly, Math.max(4, tall * 0.07), Math.max(2, tall * 0.022), k * 10 % 2 < 1 ? -0.5 : 0.5, 0, 7);
                ctx.fill();
            }
        }
        dune(seabed, h * 0.018, '#1a3434', 8);
        const sand = ctx.createLinearGradient(0, seabed - h * 0.02, 0, h);
        sand.addColorStop(0, 'rgba(120, 150, 130, 0.12)');
        sand.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = sand;
        ctx.fillRect(0, seabed - h * 0.03, w, h);
        const rocks = seeded(31);
        ctx.fillStyle = '#0b1c1f';
        for (let i = 0; i < Math.max(3, w / 220); i++) {
            const x = rocks() * w, r = h * (0.012 + rocks() * 0.025);
            ctx.beginPath();
            ctx.ellipse(x, seabed + r * 0.2, r * 1.5, r, 0, Math.PI, 0);
            ctx.fill();
        }
        starfish(ctx, w * (L.portrait ? 0.78 : 0.9), seabed + h * 0.004, Math.max(7, h * 0.016));
    }

    function starfish(ctx, x, y, r) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(0.3);
        ctx.scale(1, 0.55);
        ctx.fillStyle = '#c66a44';
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
            const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.42 : r;
            ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 220, 180, 0.4)';
        for (let i = 0; i < 5; i++) {
            const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
            ctx.beginPath();
            ctx.arc(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, r * 0.08, 0, 7);
            ctx.fill();
        }
        ctx.restore();
    }

    // ---- The hull ----------------------------------------------------------------------

    function hull(ctx, L) {
        const { w, hull: H, ring } = L;
        const top = H.top, bottom = H.bottom, height = bottom - top;
        // A cylinder's shading: lit from above, falling into shadow below.
        const steel = ctx.createLinearGradient(0, top, 0, bottom);
        steel.addColorStop(0, '#1d3a42');
        steel.addColorStop(0.08, '#4d7a80');
        steel.addColorStop(0.25, '#36606a');
        steel.addColorStop(0.7, '#1f3c45');
        steel.addColorStop(1, '#0a161b');
        ctx.fillStyle = steel;
        ctx.fillRect(0, top, w, height);
        // Plates: seams across and down, rivets along each, a few streaks.
        const random = seeded(1870);
        const plateW = Math.max(90, ring * 3.4);
        const rows = [top + height * 0.34, top + height * 0.68];
        const rivet = (x, y) => {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
            ctx.beginPath();
            ctx.arc(x + 0.6, y + 0.8, 2.1, 0, 7);
            ctx.fill();
            ctx.fillStyle = 'rgba(170, 210, 210, 0.45)';
            ctx.beginPath();
            ctx.arc(x - 0.4, y - 0.5, 1.5, 0, 7);
            ctx.fill();
        };
        const gap = Math.max(11, ring * 0.32);
        ctx.lineWidth = 1.5;
        for (const y of rows) {
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
            ctx.strokeStyle = 'rgba(160, 210, 210, 0.12)';
            ctx.beginPath(); ctx.moveTo(0, y + 1.5); ctx.lineTo(w, y + 1.5); ctx.stroke();
            for (let x = gap / 2; x < w; x += gap) { rivet(x, y - 5); rivet(x, y + 6); }
        }
        const bands = [top, ...rows, bottom];
        for (let b = 0; b < 3; b++) {
            const offset = (b % 2) * plateW * 0.5 + random() * plateW * 0.2;
            for (let x = offset; x < w; x += plateW) {
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
                ctx.beginPath(); ctx.moveTo(x, bands[b] + 3); ctx.lineTo(x, bands[b + 1] - 3); ctx.stroke();
                for (let y = bands[b] + gap; y < bands[b + 1] - gap * 0.5; y += gap) rivet(x + 5, y);
                // Rust and weed, weeping from the seam.
                if (random() < 0.5) {
                    const sx = x + 5 + random() * plateW * 0.6, sy = bands[b] + random() * (bands[b + 1] - bands[b]) * 0.5, len = height * (0.08 + random() * 0.2);
                    const g = ctx.createLinearGradient(0, sy, 0, sy + len);
                    g.addColorStop(0, random() < 0.6 ? 'rgba(150, 80, 40, 0.22)' : 'rgba(60, 120, 70, 0.22)');
                    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
                    ctx.fillStyle = g;
                    ctx.fillRect(sx, sy, 2 + random() * 5, len);
                }
            }
        }
        // Barnacles, in a few clusters low on the hull.
        for (let c = 0; c < w / 260; c++) {
            const cx = random() * w, cy = bottom - height * (0.02 + random() * 0.08);
            for (let i = 0; i < 4 + random() * 5; i++) {
                const x = cx + (random() - 0.5) * 26, y = cy + (random() - 0.5) * 10, r = 1.5 + random() * 2.5;
                ctx.fillStyle = 'rgba(170, 175, 150, 0.4)';
                ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.8, 0, 0, 7); ctx.fill();
                ctx.fillStyle = 'rgba(20, 30, 30, 0.6)';
                ctx.beginPath(); ctx.arc(x, y - r * 0.15, r * 0.35, 0, 7); ctx.fill();
            }
        }
        // The deck rail along the top, and the edges' shadows.
        ctx.strokeStyle = '#0c1d22';
        ctx.lineWidth = Math.max(2, ring * 0.06);
        const railH = Math.max(12, ring * 0.5);
        ctx.beginPath();
        ctx.moveTo(0, top - railH);
        ctx.lineTo(w, top - railH);
        for (let x = 12; x < w; x += Math.max(40, ring * 1.6)) { ctx.moveTo(x, top - railH); ctx.lineTo(x, top); }
        ctx.stroke();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fillRect(0, bottom, w, 3);
        // Vents low on the hull, where the bubbles come from.
        for (const v of L.vents) {
            JellyfinFrames.roundRect(ctx, v.x - ring * 0.5, v.y - ring * 0.35, ring, ring * 0.22, ring * 0.1);
            ctx.fillStyle = '#050b0e';
            ctx.fill();
        }
    }

    // A hex bolt head.
    function bolt(ctx, x, y, r, angle) {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) ctx.lineTo(x + Math.cos(angle + (i * Math.PI) / 3) * r, y + Math.sin(angle + (i * Math.PI) / 3) * r);
        ctx.closePath();
        const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
        g.addColorStop(0, '#fff0b8');
        g.addColorStop(0.5, '#c49a46');
        g.addColorStop(1, '#5f4216');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = 'rgba(40, 25, 5, 0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = 'rgba(80, 55, 20, 0.6)';
        ctx.beginPath();
        ctx.arc(x, y, r * 0.42, 0, 7);
        ctx.fill();
    }

    // Brass, bevelled: the outer flange, a raised lip, the slope down to the glass.
    function brass(ctx, outer, inner, ring, bolts) {
        const metal = (x0, y0, x1, y1, flip) => {
            const g = ctx.createLinearGradient(x0, y0, x1, y1);
            const stops = [[0, '#ffe7a0'], [0.3, '#d6a647'], [0.62, '#9a6c26'], [1, '#4e3410']];
            for (const [at, c] of flip ? stops.map(([a, c]) => [1 - a, c]) : stops) g.addColorStop(at, c);
            return g;
        };
        ctx.save();
        // Shadow cast on the hull.
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        JellyfinFrames.roundRect(ctx, outer.x + ring * 0.12, outer.y + ring * 0.2, outer.w, outer.h, outer.radius);
        ctx.fill();
        JellyfinFrames.roundRect(ctx, outer.x, outer.y, outer.w, outer.h, outer.radius);
        ctx.fillStyle = metal(outer.x, outer.y, outer.x + outer.w * 0.4, outer.y + outer.h, false);
        ctx.fill();
        // Brushed rings.
        ctx.strokeStyle = 'rgba(255, 240, 200, 0.08)';
        ctx.lineWidth = 1;
        for (let k = 0.15; k < 0.9; k += 0.12) {
            const i = ring * k;
            JellyfinFrames.roundRect(ctx, outer.x + i, outer.y + i, outer.w - i * 2, outer.h - i * 2, outer.radius - i);
            ctx.stroke();
        }
        // The lip, and the bevel down to the glass, lit the other way.
        const lip = ring * 0.62;
        JellyfinFrames.roundRect(ctx, outer.x + lip, outer.y + lip, outer.w - lip * 2, outer.h - lip * 2, outer.radius - lip);
        ctx.strokeStyle = 'rgba(60, 40, 10, 0.55)';
        ctx.lineWidth = Math.max(1, ring * 0.05);
        ctx.stroke();
        const slope = ring * 0.3;
        JellyfinFrames.roundRect(ctx, inner.x - slope, inner.y - slope, inner.w + slope * 2, inner.h + slope * 2, inner.radius + slope);
        ctx.fillStyle = metal(inner.x, inner.y, inner.x + inner.w * 0.3, inner.y + inner.h, true);
        ctx.fill();
        // The rubber gasket.
        JellyfinFrames.roundRect(ctx, inner.x - 3, inner.y - 3, inner.w + 6, inner.h + 6, inner.radius + 3);
        ctx.fillStyle = '#0a0b0c';
        ctx.fill();
        // Bolts round the flange.
        if (bolts) for (const p of around(outer, ring * 0.32, bolts)) bolt(ctx, p.x, p.y, Math.max(2.5, ring * 0.12), 0.3);
        ctx.restore();
    }

    // A small round porthole, warm with the cabin's light.
    function small(ctx, p) {
        const ring = p.r * 0.4;
        const outer = { x: p.x - p.r - ring, y: p.y - p.r - ring, w: (p.r + ring) * 2, h: (p.r + ring) * 2, radius: p.r + ring };
        const inner = { x: p.x - p.r, y: p.y - p.r, w: p.r * 2, h: p.r * 2, radius: p.r };
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const spill = ctx.createRadialGradient(p.x, p.y, p.r, p.x, p.y, p.r * 3.2);
        spill.addColorStop(0, 'rgba(255, 190, 110, 0.16)');
        spill.addColorStop(1, 'rgba(255, 190, 110, 0)');
        ctx.fillStyle = spill;
        ctx.fillRect(p.x - p.r * 3.2, p.y - p.r * 3.2, p.r * 6.4, p.r * 6.4);
        ctx.restore();
        brass(ctx, outer, inner, ring, 8);
        const lamp = ctx.createRadialGradient(p.x - p.r * 0.2, p.y - p.r * 0.3, 0, p.x, p.y, p.r);
        lamp.addColorStop(0, '#ffe2a6');
        lamp.addColorStop(0.7, '#e09348');
        lamp.addColorStop(1, '#8a4a1c');
        ctx.fillStyle = lamp;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 7);
        ctx.fill();
        if (p.cat) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, 7);
            ctx.clip();
            cat(ctx, p.x, p.y, p.r);
            ctx.restore();
        }
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = Math.max(1, p.r * 0.08);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 0.72, Math.PI * 1.1, Math.PI * 1.4);
        ctx.stroke();
    }

    // The conning tower, rising off the hull into the light.
    function sail(ctx, L) {
        const { sail: S, hull: H, ring } = L;
        const g = ctx.createLinearGradient(S.x, 0, S.x + S.w, 0);
        g.addColorStop(0, '#2c5059');
        g.addColorStop(0.35, '#4a767c');
        g.addColorStop(1, '#16303a');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(S.x, H.top);
        ctx.lineTo(S.x + S.w * 0.1, S.top);
        ctx.lineTo(S.x + S.w * 0.92, S.top);
        ctx.lineTo(S.x + S.w, H.top);
        ctx.fill();
        // A periscope and a mast, and rungs up the side.
        ctx.fillStyle = '#16303a';
        const pw = Math.max(4, S.w * 0.04);
        ctx.fillRect(S.x + S.w * 0.3, S.top - L.h * 0.12, pw, L.h * 0.12);
        ctx.fillRect(S.x + S.w * 0.3, S.top - L.h * 0.12, pw * 2.6, pw);
        ctx.fillRect(S.x + S.w * 0.62, S.top - L.h * 0.07, Math.max(2, S.w * 0.015), L.h * 0.07);
        ctx.strokeStyle = 'rgba(10, 25, 30, 0.8)';
        ctx.lineWidth = 2;
        for (let y = H.top - ring * 0.6; y > S.top + ring * 0.3; y -= ring * 0.45) {
            ctx.beginPath();
            ctx.moveTo(S.x + S.w * 0.8, y);
            ctx.lineTo(S.x + S.w * 0.88, y);
            ctx.stroke();
        }
        ctx.fillStyle = 'rgba(170, 210, 210, 0.35)';
        for (let y = H.top - 8; y > S.top + 6; y -= Math.max(11, ring * 0.32)) {
            ctx.beginPath();
            ctx.arc(S.x + S.w * 0.06 + ((H.top - y) / (H.top - S.top)) * S.w * 0.04, y, 1.4, 0, 7);
            ctx.fill();
        }
    }

    // The title, engraved on a brass plate screwed on under the port.
    function plate(ctx, L, title) {
        const p = L.plate, room = p.maxW - p.h * 1.4;
        const font = px => `700 ${px.toFixed(1)}px Copperplate, "Copperplate Gothic Light", Georgia, serif`;
        let shown = (title || 'Observation Port').toUpperCase(), size = p.h * 0.46;
        ctx.save();
        ctx.font = font(size);
        if ('letterSpacing' in ctx) ctx.letterSpacing = `${(size * 0.1).toFixed(1)}px`;
        let tw = ctx.measureText(shown).width;
        if (tw > room) {
            size = Math.max(8, (size * room) / tw);
            ctx.font = font(size);
            while (shown.length > 4 && ctx.measureText(shown).width > room) shown = `${shown.slice(0, -2).trimEnd()}…`;
            tw = ctx.measureText(shown).width;
        }
        const w = tw + p.h * 1.4, x = L.w / 2 - w / 2;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        JellyfinFrames.roundRect(ctx, x + 2, p.y + 3, w, p.h, p.h * 0.18);
        ctx.fill();
        const g = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
        g.addColorStop(0, '#f6dc8e');
        g.addColorStop(0.5, '#c99a3f');
        g.addColorStop(1, '#8a6224');
        ctx.fillStyle = g;
        JellyfinFrames.roundRect(ctx, x, p.y, w, p.h, p.h * 0.18);
        ctx.fill();
        ctx.strokeStyle = 'rgba(60, 40, 10, 0.6)';
        ctx.lineWidth = 1;
        JellyfinFrames.roundRect(ctx, x + p.h * 0.12, p.y + p.h * 0.12, w - p.h * 0.24, p.h * 0.76, p.h * 0.12);
        ctx.stroke();
        for (const sx of [x + p.h * 0.34, x + w - p.h * 0.34]) bolt(ctx, sx, p.y + p.h / 2, p.h * 0.13, 0.6);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(255, 240, 200, 0.5)';
        ctx.fillText(shown, L.w / 2 + 0.8, p.y + p.h * 0.54 + 0.8);
        ctx.fillStyle = '#3a2508';
        ctx.fillText(shown, L.w / 2, p.y + p.h * 0.54);
        ctx.restore();
    }

    // The ship's cat, sitting in a small porthole's window.
    function cat(ctx, x, y, r) {
        ctx.fillStyle = 'rgba(40, 20, 8, 0.85)';
        ctx.beginPath();
        ctx.ellipse(x, y + r * 0.75, r * 0.42, r * 0.5, 0, Math.PI, 0);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y + r * 0.08, r * 0.24, 0, 7);
        ctx.fill();
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(x + side * r * 0.22, y - r * 0.02);
            ctx.lineTo(x + side * r * 0.2, y - r * 0.3);
            ctx.lineTo(x + side * r * 0.06, y - r * 0.12);
            ctx.fill();
        }
        ctx.strokeStyle = 'rgba(40, 20, 8, 0.85)';
        ctx.lineWidth = r * 0.08;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x + r * 0.38, y + r * 0.7);
        ctx.quadraticCurveTo(x + r * 0.7, y + r * 0.6, x + r * 0.6, y + r * 0.3);
        ctx.stroke();
    }

    function paint(ctx, L, env) {
        const { screen: s, outer, ring } = L;
        sea(ctx, L);
        if (L.sail) sail(ctx, L);
        hull(ctx, L);
        // The picture's cool light on the hull around the port.
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
        const spill = ctx.createRadialGradient(cx, cy, Math.min(outer.w, outer.h) * 0.45, cx, cy, Math.max(outer.w, outer.h) * 0.75);
        spill.addColorStop(0, 'rgba(150, 210, 255, 0.14)');
        spill.addColorStop(1, 'rgba(150, 210, 255, 0)');
        ctx.fillStyle = spill;
        ctx.fillRect(0, L.hull.top, L.w, L.hull.bottom - L.hull.top);
        ctx.restore();
        for (const p of L.smalls) small(ctx, p);
        // The brow over the port, to shed what falls on it: the ring's top
        // edge, a little way out.
        ctx.save();
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#6f4e1c';
        ctx.lineWidth = Math.max(4, ring * 0.3);
        const R = outer.radius + ring * 0.38;
        ctx.beginPath();
        ctx.arc(outer.x + outer.radius, outer.y + outer.radius, R, Math.PI * 1.22, Math.PI * 1.5);
        ctx.arc(outer.x + outer.w - outer.radius, outer.y + outer.radius, R, Math.PI * 1.5, Math.PI * 1.78);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255, 228, 160, 0.55)';
        ctx.lineWidth = Math.max(1, ring * 0.07);
        ctx.stroke();
        ctx.restore();
        brass(ctx, outer, s, ring, Math.max(16, Math.round((outer.w + outer.h) / (ring * 1.3))));
        plate(ctx, L, env.title);
        JellyfinFrames.cutScreen(ctx, s);
        glass(ctx, s);
    }

    // Thick glass: darker at its edges, a broad soft reflection, a bright arc.
    function glass(ctx, s) {
        ctx.save();
        JellyfinFrames.roundRect(ctx, s.x, s.y, s.w, s.h, s.radius);
        ctx.clip();
        const edge = ctx.createRadialGradient(s.x + s.w / 2, s.y + s.h / 2, Math.min(s.w, s.h) * 0.42, s.x + s.w / 2, s.y + s.h / 2, Math.hypot(s.w, s.h) * 0.52);
        edge.addColorStop(0, 'rgba(0, 30, 40, 0)');
        edge.addColorStop(1, 'rgba(0, 30, 40, 0.45)');
        ctx.fillStyle = edge;
        ctx.fillRect(s.x, s.y, s.w, s.h);
        const sheen = ctx.createLinearGradient(s.x, s.y, s.x + s.w * 0.5, s.y + s.h * 0.6);
        sheen.addColorStop(0, 'rgba(220, 245, 255, 0.11)');
        sheen.addColorStop(0.5, 'rgba(220, 245, 255, 0.03)');
        sheen.addColorStop(0.51, 'rgba(220, 245, 255, 0)');
        ctx.fillStyle = sheen;
        ctx.fillRect(s.x, s.y, s.w, s.h);
        ctx.strokeStyle = 'rgba(235, 250, 255, 0.28)';
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(1.5, s.h * 0.008);
        ctx.beginPath();
        ctx.arc(s.x + s.radius, s.y + s.radius, s.radius * 0.8, Math.PI * 1.05, Math.PI * 1.45);
        ctx.stroke();
        ctx.restore();
    }

    // ---- The sonar screen -------------------------------------------------------------

    function sonarBase(g, s, kind) {
        const [, detail] = JellyfinFrames.IDLE[kind] || JellyfinFrames.IDLE.setup;
        const title = WORDS[kind] || WORDS.setup;
        const { cx, cy, R } = sonarAt(s);
        const bg = g.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(s.w, s.h) * 0.7);
        bg.addColorStop(0, '#06301f');
        bg.addColorStop(1, '#010a07');
        g.fillStyle = bg;
        g.fillRect(s.x, s.y, s.w, s.h);
        g.strokeStyle = `rgba(${GREEN}, 0.28)`;
        g.lineWidth = 1;
        for (const k of [0.25, 0.5, 0.75, 1]) { g.beginPath(); g.arc(cx, cy, R * k, 0, 7); g.stroke(); }
        g.beginPath();
        g.moveTo(cx - R, cy); g.lineTo(cx + R, cy);
        g.moveTo(cx, cy - R); g.lineTo(cx, cy + R);
        g.stroke();
        for (let i = 0; i < 72; i++) {
            const a = (i / 72) * Math.PI * 2, k = i % 6 ? 0.96 : 0.92;
            g.beginPath();
            g.moveTo(cx + Math.cos(a) * R * k, cy + Math.sin(a) * R * k);
            g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
            g.stroke();
        }
        // The words, on the right.
        const left = s.x + s.w * 0.56, width = s.w * 0.36;
        const size = Math.min(s.h * 0.085, width / Math.max(6, title.length * 0.62));
        g.textAlign = 'left';
        g.textBaseline = 'alphabetic';
        g.font = `700 ${size}px ui-monospace, Menlo, Consolas, monospace`;
        g.fillStyle = `rgb(${GREEN})`;
        g.fillText(title, left, s.y + s.h * 0.42);
        g.font = `500 ${Math.max(9, size * 0.42)}px ui-monospace, Menlo, Consolas, monospace`;
        g.fillStyle = `rgba(${GREEN}, 0.6)`;
        JellyfinFrames.wrap(g, detail || 'Standing by', width).slice(0, 3).forEach((line, i) => g.fillText(line, left, s.y + s.h * 0.42 + size * 0.9 + i * size * 0.62));
        g.fillStyle = `rgba(${GREEN}, 0.06)`;
        for (let y = s.y; y < s.y + s.h; y += 3) g.fillRect(s.x, y, s.w, 1);
    }

    const sonarAt = s => ({ cx: s.x + s.w * 0.3, cy: s.y + s.h / 2, R: s.h * 0.4 });
    const BLIPS = [[0.7, 0.5], [2.4, 0.78], [4.1, 0.33]];   // angle, distance

    function sonar(ctx, s, kind, angle) {
        const dpr = window.devicePixelRatio || 1, key = `${kind}:${s.w}x${s.h}:${dpr}`;
        if (sonarCache?.key !== key) {
            const c = document.createElement('canvas');
            c.width = Math.ceil(s.w * dpr);
            c.height = Math.ceil(s.h * dpr);
            const g = c.getContext('2d');
            g.setTransform(dpr, 0, 0, dpr, -s.x * dpr, -s.y * dpr);
            sonarBase(g, s, kind);
            sonarCache = { key, canvas: c };
        }
        ctx.save();
        JellyfinFrames.roundRect(ctx, s.x, s.y, s.w, s.h, s.radius);
        ctx.clip();
        ctx.drawImage(sonarCache.canvas, s.x, s.y, s.w, s.h);
        const { cx, cy, R } = sonarAt(s);
        const sweep = ctx.createConicGradient(angle - Math.PI * 0.5, cx, cy);
        sweep.addColorStop(0, `rgba(${GREEN}, 0)`);
        sweep.addColorStop(0.24, `rgba(${GREEN}, 0)`);
        sweep.addColorStop(0.2499, `rgba(${GREEN}, 0.35)`);
        sweep.addColorStop(0.25, `rgba(${GREEN}, 0)`);
        ctx.fillStyle = sweep;
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, 7);
        ctx.fill();
        // Blips glow as the sweep passes, then fade.
        for (const [a, d] of BLIPS) {
            const since = (((angle - a) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
            const bright = Math.exp(-since * 0.9);
            ctx.fillStyle = `rgba(${GREEN}, ${0.15 + bright * 0.85})`;
            ctx.beginPath();
            ctx.arc(cx + Math.cos(a) * R * d, cy + Math.sin(a) * R * d, Math.max(2, R * 0.025), 0, 7);
            ctx.fill();
        }
        ctx.strokeStyle = `rgba(${GREEN}, 0.9)`;
        ctx.lineWidth = Math.max(1, R * 0.01);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(angle) * R, cy + Math.sin(angle) * R);
        ctx.stroke();
        ctx.restore();
        glass(ctx, s);
    }

    // ---- Motion: bubbles and passers-by --------------------------------------------------

    let transition = null;      // { kind, at }
    let last = 0;
    let bubbles = null, rush = null;
    let visitor = null, nextVisitor = 0;

    function source(b, L, fresh) {
        const from = Math.random();
        if (from < 0.55) {
            const v = L.vents[(Math.random() * L.vents.length) | 0];
            b.x0 = v.x + (Math.random() - 0.5) * L.ring;
            b.y = v.y - L.ring * 0.3;
        } else {
            b.x0 = Math.random() * L.w;
            b.y = L.seabed;
        }
        if (fresh) b.y = Math.random() * L.h;   // seed the whole column at once
        b.r = 1.5 + Math.random() ** 2 * 6;
        b.speed = 22 + b.r * 7 + Math.random() * 10;
        b.phase = Math.random() * 7;
        b.wobble = 2 + Math.random() * 6;
        return b;
    }

    function rise(ctx, t, dt, L, env) {
        const want = Math.round(28 * (env.quality?.density ?? 1));
        if (!bubbles || bubbles.length !== want || bubbles.L !== L) {
            bubbles = Array.from({ length: want }, () => source({}, L, true));
            bubbles.L = L;
        }
        const sprite = bubble();
        for (const b of bubbles) {
            b.y -= (b.speed * dt) / 1000;
            if (b.y < -b.r * 2) source(b, L, false);
            const x = b.x0 + Math.sin(b.phase + b.y * 0.03) * b.wobble;
            ctx.drawImage(sprite, x - b.r, b.y - b.r, b.r * 2, b.r * 2);
        }
    }

    // A fish, facing +x, length len, its tail flicking with phase.
    function fish(ctx, x, y, len, dir, phase, color) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(dir, 1);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(0, 0, len * 0.42, len * 0.17, 0, 0, Math.PI * 2);
        ctx.fill();
        const flick = Math.sin(phase) * len * 0.07;
        ctx.beginPath();
        ctx.moveTo(-len * 0.36, 0);
        ctx.lineTo(-len * 0.56, -len * 0.16 + flick);
        ctx.lineTo(-len * 0.5, flick * 0.5);
        ctx.lineTo(-len * 0.56, len * 0.16 + flick);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-len * 0.05, -len * 0.15);
        ctx.lineTo(len * 0.08, -len * 0.27);
        ctx.lineTo(len * 0.16, -len * 0.13);
        ctx.fill();
        ctx.restore();
    }

    // A jellyfish: a pulsing bell and trailing tentacles, glowing faintly.
    function jelly(ctx, x, y, size, t) {
        const pulse = Math.sin(t * 0.0025);
        const bw = size * (1 + pulse * 0.08), bh = size * (0.62 - pulse * 0.06);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.55;
        ctx.drawImage(glow(), x - size * 1.6, y - size * 1.4, size * 3.2, size * 3.2);
        ctx.restore();
        ctx.save();
        ctx.strokeStyle = 'rgba(190, 160, 255, 0.4)';
        ctx.lineWidth = Math.max(1, size * 0.04);
        for (let i = 0; i < 5; i++) {
            const tx = x - bw * 0.6 + (i / 4) * bw * 1.2;
            ctx.beginPath();
            ctx.moveTo(tx, y);
            for (let k = 1; k <= 6; k++) ctx.lineTo(tx + Math.sin(t * 0.002 + i + k * 0.9) * size * 0.12, y + k * size * 0.28);
            ctx.stroke();
        }
        const bell = ctx.createLinearGradient(x, y - bh, x, y);
        bell.addColorStop(0, 'rgba(200, 120, 230, 0.6)');
        bell.addColorStop(1, 'rgba(60, 170, 230, 0.35)');
        ctx.fillStyle = bell;
        ctx.beginPath();
        ctx.ellipse(x, y, bw, bh, 0, Math.PI, 0);
        ctx.quadraticCurveTo(x, y + bh * 0.25, x - bw, y);
        ctx.fill();
        ctx.strokeStyle = 'rgba(235, 210, 255, 0.55)';
        ctx.lineWidth = Math.max(1, size * 0.03);
        ctx.stroke();
        ctx.restore();
    }

    // Now and then: a school, a big fish, or a jellyfish. Returns false once gone.
    function visit(ctx, t, L) {
        const v = visitor, age = (t - v.at) / 1000;
        if (v.type === 'jelly') {
            const y = v.y - age * v.speed, x = v.x + Math.sin(age * 0.25) * L.w * 0.03;
            if (y < -v.size * 3) return false;
            jelly(ctx, x, y, v.size, t);
            return true;
        }
        const x = v.dir > 0 ? -v.size * 3 + age * v.speed : L.w + v.size * 3 - age * v.speed;
        if (x < -v.size * 8 || x > L.w + v.size * 8) return false;
        for (const m of v.members) fish(ctx, x + m.dx * v.dir * -1, v.y + m.dy + Math.sin(age * 1.3 + m.phase) * v.size * 0.15, v.size * m.k, v.dir, t * 0.012 + m.phase, v.color);
        return true;
    }

    function arrive(t, L) {
        const roll = Math.random(), dir = Math.random() < 0.5 ? 1 : -1;
        if (roll < 0.15) {
            visitor = { type: 'jelly', at: t, x: L.w * (0.1 + Math.random() * 0.8), y: L.h + L.h * 0.05, size: Math.max(16, L.h * 0.05), speed: 14 };
        } else if (roll < 0.4) {
            const size = Math.max(40, L.h * 0.11);
            visitor = { type: 'fish', at: t, dir, y: L.h * (0.12 + Math.random() * 0.7), size, speed: 28, color: 'rgba(3, 18, 26, 0.72)', members: [{ dx: 0, dy: 0, k: 1, phase: 0 }] };
        } else {
            const size = Math.max(14, L.h * 0.026), n = 5 + ((Math.random() * 5) | 0);
            visitor = { type: 'fish', at: t, dir, y: L.h * (0.08 + Math.random() * 0.75), size, speed: 50 + Math.random() * 20, color: 'rgba(8, 30, 40, 0.7)',
                members: Array.from({ length: n }, (_, i) => ({ dx: i * size * 1.1 + Math.random() * size, dy: (Math.random() - 0.5) * size * 3, k: 0.8 + Math.random() * 0.4, phase: Math.random() * 7 })) };
        }
    }

    JellyfinFrames.add({
        id: 'porthole',
        name: 'Porthole',
        icon: '⚓',
        titled: true,
        layout,
        paint,

        transition(kind, env) {
            transition = { kind, at: performance.now() };
            if (kind === 'change') {
                const n = Math.round(46 * (env.quality?.density ?? 1));
                rush = Array.from({ length: n }, () => ({ u: Math.random(), y: 1 + Math.random() * 0.6, r: 2 + Math.random() ** 2 * 12, speed: 0.9 + Math.random() * 1.1, phase: Math.random() * 7 }));
            }
            env.busy(kind === 'change' ? RUSH_MS : kind === 'pause' ? STOP_MS : GO_MS);
        },

        tick(ctx, t, L, env) {
            const dt = Math.min(100, last ? t - last : 0);
            last = t;
            const s = L.screen;
            let wait = Infinity;
            const age = transition ? t - transition.at : Infinity;
            if (transition?.kind === 'change' && age < RUSH_MS && rush) {
                // A rush of bubbles up the glass, as if the sub just blew its tanks.
                const q = age / RUSH_MS;
                ctx.save();
                JellyfinFrames.roundRect(ctx, s.x, s.y, s.w, s.h, s.radius);
                ctx.clip();
                ctx.fillStyle = `rgba(160, 225, 255, ${0.22 * Math.sin(q * Math.PI)})`;
                ctx.fillRect(s.x, s.y, s.w, s.h);
                const sprite = bubble();
                for (const b of rush) {
                    const y = s.y + s.h * (b.y - q * b.speed * 1.6), x = s.x + s.w * b.u + Math.sin(b.phase + y * 0.04) * 6;
                    ctx.drawImage(sprite, x - b.r, y - b.r, b.r * 2, b.r * 2);
                }
                ctx.restore();
                wait = 33;
            } else if (transition?.kind === 'pause' || env.paused) {
                // ALL STOP: the cabin lights dim behind the glass.
                const k = transition?.kind === 'pause' ? Math.min(1, age / STOP_MS) : 1;
                ctx.save();
                JellyfinFrames.roundRect(ctx, s.x, s.y, s.w, s.h, s.radius);
                ctx.clip();
                ctx.fillStyle = `rgba(2, 16, 26, ${0.72 * k})`;
                ctx.fillRect(s.x, s.y, s.w, s.h);
                ctx.globalAlpha = k;
                ctx.font = `700 ${s.h * 0.09}px ui-monospace, Menlo, Consolas, monospace`;
                ctx.textAlign = 'center';
                ctx.fillStyle = `rgb(${GREEN})`;
                ctx.fillText('❚❚ ALL STOP', s.x + s.w / 2, s.y + s.h / 2 + s.h * 0.03);
                ctx.restore();
                if (k < 1) wait = 33;
            } else if (transition?.kind === 'play' && age < GO_MS) {
                const q = age / GO_MS;
                ctx.save();
                JellyfinFrames.roundRect(ctx, s.x, s.y, s.w, s.h, s.radius);
                ctx.fillStyle = `rgba(2, 16, 26, ${0.72 * (1 - q) ** 2})`;
                ctx.fill();
                ctx.restore();
                wait = 33;
            } else transition = null;
            if (!env.motion) return wait;
            rise(ctx, t, dt, L, env);
            if (!nextVisitor) nextVisitor = t + 12000 + Math.random() * 30000;
            if (!visitor && t >= nextVisitor) arrive(t, L);
            if (visitor && !visit(ctx, t, L)) { visitor = null; nextVisitor = t + 30000 + Math.random() * 70000; }
            return Math.min(wait, FRAME_MS);
        },

        idle(ctx, L, env, kind) {
            const angle = env.motion ? (performance.now() * 0.0016) % (Math.PI * 2) : 0.4;
            sonar(ctx, L.screen, kind, angle);
        },

        // Sonar green on a dark, rounded readout.
        cue(ctx, text, L) {
            JellyfinFrames.drawCue(ctx, text, L.screen, { font: '600 {size}px ui-monospace, Menlo, Consolas, monospace', color: `rgb(${GREEN})`, box: 'rgba(0, 22, 16, 0.72)', bottom: 0.1 });
        },
    });
})();
