// Drive-in: a summer night at the Starlite. A big screen on its tower under
// the Milky Way and a full moon, two rows of parked cars seen from behind
// (heads in the rear windows, lit by the picture, a few tail lights on),
// speaker posts between them, the snack bar with the projector's beam
// fanning up over the lot, and the roadside sign: neon on top, the item's
// name below in changeable black letters, ringed with chasing bulbs.
//
// What moves, only while frame motion is on: dust motes drifting in the
// beam, the bulbs chasing, a few stars twinkling, a rare shooting star, and
// every few minutes a car pulling slowly up the aisle into the empty space
// in the back row, braking, then dimming its lights; much later it backs out.
// Between items the screen runs the countdown leader; a pause is a film
// burn, then intermission. Upright phones get the screen high on its tower
// and the sign below it.

(() => {
    'use strict';

    const LEADER_MS = 900, BURN_MS = 900, LAMP_MS = 450;
    const FRAME_MS = 66;                          // motes, bulbs, the car: ~15 fps is plenty
    const ARRIVE_MS = 11000, LEAVE_MS = 8000;
    const TONES = ['#0f0e17', '#140f19', '#0d1317', '#15110f', '#10140f'];
    const LETTERS = size => `700 ${size.toFixed(1)}px Impact, Haettenschweiler, "Arial Narrow", "Helvetica Neue", sans-serif`;

    // A tiny seeded random, so the lot is the same on every repaint.
    const seeded = seed => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const hash = text => { let h = 2166136261; for (const c of String(text)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return ((h >>> 0) % 2147483646) + 1; };
    const ease = q => 1 - (1 - q) ** 2;

    // The idle words: the marquee's two rows, and the screen's card.
    const WORDS = {
        setup: ['COMING SOON', 'INTERMISSION', 'Intermission'],
        demo: ['COMING SOON', 'INTERMISSION', 'Intermission'],
        signedout: ['COMING SOON', 'INTERMISSION', 'Intermission'],
        connecting: ['PLEASE WAIT', 'WARMING UP THE PROJECTOR', 'Warming up'],
        offline: ['SORRY FOLKS', 'REEL TROUBLE', 'Reel trouble'],
        empty: ['NOW SHOWING', 'NOTHING TONIGHT', 'Nothing tonight'],
        loading: ['NOW SHOWING', 'FEATURE PRESENTATION', 'Feature presentation'],
        away: ['NOW SHOWING', 'ON ANOTHER SCREEN', 'On another screen'],
    };

    // ---- Sprites, baked once -------------------------------------------------------

    const sprites = {};
    function glow(name, rgb, size = 64) {
        if (sprites[name]) return sprites[name];
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const g = c.getContext('2d');
        const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        grad.addColorStop(0, `rgba(${rgb}, 1)`);
        grad.addColorStop(0.22, `rgba(${rgb}, 0.45)`);
        grad.addColorStop(1, `rgba(${rgb}, 0)`);
        g.fillStyle = grad;
        g.fillRect(0, 0, size, size);
        return (sprites[name] = c);
    }
    const RED = () => glow('red', '255, 50, 40');
    const WARM = () => glow('warm', '255, 214, 150');
    const WHITE = () => glow('white', '235, 240, 255');
    const DUST = () => glow('dust', '255, 246, 220', 24);

    // A sprite centred on (x, y), r its radius, added as light.
    function light(ctx, sprite, x, y, r, alpha, ry = r) {
        if (alpha <= 0.01) return;
        ctx.globalAlpha = Math.min(1, alpha);
        ctx.drawImage(sprite, x - r, y - ry, r * 2, ry * 2);
    }

    // A small canvas of a rect, drawn once and blitted after: idle cards and
    // the marquee, which the overlay redraws every frame the motes move.
    let cache = null;
    function cached(ctx, key, rect, draw) {
        cache ??= new Map();
        let c = cache.get(key);
        if (!c) {
            if (cache.size > 12) cache.clear();
            const dpr = window.devicePixelRatio || 1;
            c = document.createElement('canvas');
            c.width = Math.max(1, Math.ceil(rect.w * dpr));
            c.height = Math.max(1, Math.ceil(rect.h * dpr));
            const g = c.getContext('2d');
            g.setTransform(dpr, 0, 0, dpr, -rect.x * dpr, -rect.y * dpr);
            draw(g);
            cache.set(key, c);
        }
        ctx.drawImage(c, rect.x, rect.y, rect.w, rect.h);
    }

    // ---- Layout -----------------------------------------------------------------------

    function layout(w, h, aspect, env) {
        const portrait = h > w * 1.1;
        const floor = h - env.insets.bottom - Math.max(6, h * 0.015);   // the lot's near edge
        const horizon = floor - h * (portrait ? 0.22 : 0.27);
        const depth = floor - horizon;
        // The roadside sign, then the screen in the space it leaves.
        let board, box;
        if (portrait) {
            const mw = Math.min(w * 0.56, 260);
            board = { x: w * 0.06, w: mw, h: mw * 0.6 };
            board.y = horizon + depth * 0.2 - board.h;
            const top = board.y - mw * 0.38 - h * 0.035;
            box = { x: w * 0.04, y: h * 0.08, w: w * 0.92, h: Math.max(40, top - h * 0.08) };
        } else {
            const mw = Math.max(150, Math.min(w * 0.2, 300));
            board = { x: w * 0.03, w: mw, h: mw * 0.6 };
            board.y = horizon - board.h * 0.5;
            const left = board.x + mw + w * 0.04;
            box = { x: left, y: h * 0.06, w: w - left - w * 0.035, h: Math.max(40, horizon - h * 0.13) };
        }
        const f = JellyfinFrames.fit(box, aspect);
        const pad = f.w * 0.03;
        const sw = f.w - pad * 2, sh = sw / aspect;
        const screen = { x: f.x + pad, y: f.y + f.h - pad - sh, w: sw, h: sh, radius: 0 };
        const face = { x: screen.x - pad, y: screen.y - pad, w: sw + pad * 2, h: sh + pad * 2 };
        const crown = { x: board.x + board.w * 0.04, w: board.w * 0.92, h: board.w * 0.34 };
        crown.y = board.y - crown.h - board.w * 0.04;
        const frame = board.w * 0.05;
        const inner = { x: board.x + frame, y: board.y + frame, w: board.w - frame * 2, h: board.h - frame * 2 };
        const bulbs = [];
        const around = 2 * (board.w + board.h - frame * 2), n = Math.max(16, Math.round(around / (frame * 1.7)));
        for (let i = 0; i < n; i++) {
            let d = (i / n) * around;
            const rx = board.w - frame, ry = board.h - frame;
            const x0 = board.x + frame / 2, y0 = board.y + frame / 2;
            if (d < rx) bulbs.push({ x: x0 + d, y: y0 });
            else if ((d -= rx) < ry) bulbs.push({ x: x0 + rx, y: y0 + d });
            else if ((d -= ry) < rx) bulbs.push({ x: x0 + rx - d, y: y0 + ry });
            else bulbs.push({ x: x0, y: y0 + ry - (d - rx) });
        }

        // The lot, in perspective: a car's width scales with its distance
        // below the horizon, so sc = 1 at the front row, sb at the back.
        const frontW = portrait ? Math.min(w * 0.27, 130) : Math.min(w * 0.13, 200, depth * 0.9);
        const sb = 0.42, sbooth = 0.66;
        const vpx = screen.x + sw / 2;
        const aisleBack = portrait ? w * 0.77 : screen.x + sw * 0.86;
        const aisle = { back: aisleBack, front: Math.min(w - frontW * 0.75, aisleBack + (aisleBack - vpx) * 0.7) };
        const random = seeded(1957);
        const kinds = ['fins', 'wagon', 'bug', 'fins', 'pickup', 'convertible', 'wagon', 'fins', 'bug'];
        const row = (sc, centre) => {
            const cw = frontW * sc, step = cw * 1.45, cars = [];
            for (let i = -Math.ceil((centre + cw) / step); centre + i * step < w + cw; i++) {
                const k = random();
                if (i === 0) continue;   // the aisle, or the empty space
                cars.push({ x: centre + i * step + (random() - 0.5) * cw * 0.12, cw: cw * (0.93 + random() * 0.12), kind: kinds[(k * kinds.length) | 0],
                    tone: TONES[(random() * TONES.length) | 0], people: (random() * 3) | 0, lean: random() < 0.35, lit: random() < 0.4, step });
            }
            return cars;
        };
        const back = row(sb, aisle.back), front = row(1, aisle.front);
        const booth = { x: vpx, y: horizon + depth * sbooth, w: frontW * sbooth * 1.7, h: frontW * sbooth * 0.72 };
        const beam = { x: vpx, y: booth.y - booth.h * 1.02 };
        // Where the arriving car starts: just below the view.
        const start = Math.min(4, Math.max(1.6, (h - horizon) / Math.max(1, depth - 0.8 * frontW) + 0.15));

        // Stars, and a handful bright enough to twinkle.
        const sky = seeded(4242);
        const stars = [];
        const count = Math.round((w * horizon) / 2200);
        for (let i = 0; i < count; i++) {
            const y = sky() ** 1.4 * horizon;
            stars.push({ x: sky() * w, y, r: 0.35 + sky() ** 3 * 1.4, a: 0.25 + sky() * 0.75 * (1 - y / horizon * 0.6), warm: sky() < 0.2 });
        }
        const twinkle = stars.filter(s => s.r > 1.05 && !inside(s, face)).slice(0, 12);
        const moon = portrait ? { x: w * 0.8, y: h * 0.065, r: Math.min(w, h) * 0.045 } : { x: board.x + board.w * 0.55, y: h * 0.13, r: Math.min(w, h) * 0.04 };

        return { portrait, floor, horizon, depth, screen, face, board, crown, inner, frame, bulbs, frontW, sb, sbooth, vpx, aisle, back, front, booth, beam, start, stars, twinkle, moon };
    }

    const inside = (p, r) => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;

    // ---- The scene ----------------------------------------------------------------------

    function skyAndGround(ctx, L, w, h) {
        const { horizon } = L;
        const sky = ctx.createLinearGradient(0, 0, 0, horizon);
        sky.addColorStop(0, '#04061a');
        sky.addColorStop(0.55, '#0d1236');
        sky.addColorStop(0.85, '#2a1f4a');
        sky.addColorStop(1, '#4a2b4e');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, horizon + 2);
        // The Milky Way: soft clouds along a diagonal, then the stars.
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const band = seeded(77);
        for (let i = 0; i < 14; i++) {
            const q = i / 13;
            const x = w * (0.05 + q * 0.95), y = horizon * (0.95 - q * 0.9) + (band() - 0.5) * horizon * 0.08;
            const r = Math.max(w, h) * (0.07 + band() * 0.08);
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, `rgba(${band() < 0.5 ? '170, 160, 230' : '220, 180, 210'}, 0.07)`);
            g.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = g;
            ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }
        for (const s of L.stars) {
            ctx.fillStyle = s.warm ? `rgba(255, 226, 190, ${s.a})` : `rgba(225, 232, 255, ${s.a})`;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, 7);
            ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
        // A full moon with its halo and seas.
        const m = L.moon;
        const halo = ctx.createRadialGradient(m.x, m.y, m.r, m.x, m.y, m.r * 6);
        halo.addColorStop(0, 'rgba(255, 245, 220, 0.18)');
        halo.addColorStop(1, 'rgba(255, 245, 220, 0)');
        ctx.fillStyle = halo;
        ctx.fillRect(m.x - m.r * 6, m.y - m.r * 6, m.r * 12, m.r * 12);
        const disc = ctx.createRadialGradient(m.x - m.r * 0.3, m.y - m.r * 0.3, 0, m.x, m.y, m.r);
        disc.addColorStop(0, '#fffbea');
        disc.addColorStop(1, '#e9dcb8');
        ctx.fillStyle = disc;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, 7);
        ctx.fill();
        ctx.fillStyle = 'rgba(150, 140, 120, 0.22)';
        for (const [dx, dy, r] of [[-0.3, -0.2, 0.28], [0.25, 0.1, 0.22], [-0.05, 0.38, 0.18], [0.35, -0.35, 0.12]]) {
            ctx.beginPath();
            ctx.arc(m.x + dx * m.r, m.y + dy * m.r, r * m.r, 0, 7);
            ctx.fill();
        }
        ctx.restore();
        // The treeline: rounded crowns with the odd pine, darker than the sky.
        const trees = seeded(1001);
        ctx.fillStyle = '#0a0b1c';
        ctx.beginPath();
        ctx.moveTo(0, horizon + 2);
        for (let x = 0; x <= w + 20;) {
            const tall = h * (0.02 + trees() * 0.035);
            if (trees() < 0.25) {
                const pw = tall * 0.5;
                ctx.lineTo(x, horizon - tall * 0.3);
                ctx.lineTo(x + pw / 2, horizon - tall * 1.5);
                ctx.lineTo(x + pw, horizon - tall * 0.3);
                x += pw;
            } else {
                const r = tall * (0.5 + trees() * 0.4);
                ctx.arc(x + r, horizon - tall + r * 0.4, r, Math.PI, 0);
                x += r * 1.6;
            }
        }
        ctx.lineTo(w + 20, horizon + 2);
        ctx.fill();
        // The lot: dark gravel, with the humps of the parking ramps.
        const lot = ctx.createLinearGradient(0, horizon, 0, h);
        lot.addColorStop(0, '#15122a');
        lot.addColorStop(1, '#07060e');
        ctx.fillStyle = lot;
        ctx.fillRect(0, horizon, w, h - horizon);
        ctx.strokeStyle = 'rgba(160, 150, 210, 0.07)';
        for (const sc of [L.sb * 0.72, L.sb, 0.72, 1]) {
            const y = horizon + L.depth * sc;
            ctx.lineWidth = Math.max(1, sc * 2);
            ctx.beginPath();
            ctx.moveTo(0, y - L.frontW * sc * 0.03);
            ctx.lineTo(w, y - L.frontW * sc * 0.03);
            ctx.stroke();
        }
    }

    // The screen on its tower: a grey face on posts and cross-bracing.
    function tower(ctx, L) {
        const { face: f, horizon } = L;
        ctx.save();
        ctx.strokeStyle = '#11121f';
        ctx.fillStyle = '#11121f';
        const legW = Math.max(4, f.w * 0.018);
        const legs = [0.12, 0.38, 0.62, 0.88].map(q => f.x + f.w * q);
        for (const x of legs) ctx.fillRect(x - legW / 2, f.y + f.h * 0.5, legW, horizon - f.y - f.h * 0.5 + 4);
        ctx.lineWidth = Math.max(1.5, legW * 0.35);
        const bottom = f.y + f.h, span = horizon - bottom;
        for (let i = 0; i < legs.length - 1; i++) {
            for (const [a, b] of [[0, 0.5], [0.5, 1]]) {
                ctx.beginPath();
                ctx.moveTo(legs[i], bottom + span * a);
                ctx.lineTo(legs[i + 1], bottom + span * b);
                ctx.moveTo(legs[i + 1], bottom + span * a);
                ctx.lineTo(legs[i], bottom + span * b);
                ctx.stroke();
            }
        }
        // The face: weathered panels, lit a little by the picture's spill.
        const g = ctx.createLinearGradient(0, f.y, 0, f.y + f.h);
        g.addColorStop(0, '#3e4256');
        g.addColorStop(1, '#2f3245');
        ctx.fillStyle = g;
        ctx.fillRect(f.x, f.y, f.w, f.h);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.lineWidth = 1;
        for (let x = f.x + f.w / 12; x < f.x + f.w - 2; x += f.w / 12) { ctx.beginPath(); ctx.moveTo(x, f.y); ctx.lineTo(x, f.y + f.h); ctx.stroke(); }
        const s = L.screen;
        const spill = ctx.createRadialGradient(s.x + s.w / 2, s.y + s.h / 2, Math.min(s.w, s.h) * 0.5, s.x + s.w / 2, s.y + s.h / 2, Math.hypot(f.w, f.h) * 0.56);
        spill.addColorStop(0, 'rgba(210, 220, 255, 0.22)');
        spill.addColorStop(1, 'rgba(210, 220, 255, 0)');
        ctx.fillStyle = spill;
        ctx.fillRect(f.x, f.y, f.w, f.h);
        ctx.strokeStyle = '#0b0c16';
        ctx.lineWidth = Math.max(2, f.w * 0.005);
        ctx.strokeRect(f.x, f.y, f.w, f.h);
        ctx.restore();
    }

    // ---- Cars, from behind --------------------------------------------------------------
    // In units of the car's width, from the middle of its back axle on the
    // ground: x right, y up (negative). cabin: [half-width at the bottom, at
    // the top, bottom y, top y, corner radius].

    const CARS = {
        fins: { body: [-0.5, -0.13, 1, 0.29], fins: true, cabin: [0.37, 0.28, -0.42, -0.66, 0.06], tails: [[-0.42, -0.35], [0.42, -0.35]], tail: 'round' },
        convertible: { body: [-0.5, -0.13, 1, 0.28], fins: true, cabin: null, tails: [[-0.42, -0.34], [0.42, -0.34]], tail: 'round' },
        bug: { body: [-0.42, -0.11, 0.84, 0.29], cabin: [0.33, 0.2, -0.38, -0.72, 0.17], tails: [[-0.33, -0.3], [0.33, -0.3]], tail: 'tall', round: true },
        wagon: { body: [-0.5, -0.13, 1, 0.31], cabin: [0.44, 0.41, -0.44, -0.76, 0.05], tails: [[-0.45, -0.31], [0.45, -0.31]], tail: 'tall' },
        pickup: { body: [-0.49, -0.13, 0.98, 0.27], cabin: [0.31, 0.27, -0.4, -0.73, 0.05], tails: [[-0.45, -0.29], [0.45, -0.29]], tail: 'tall' },
    };

    function cabinPath(ctx, [b, t, by, ty, r]) {
        ctx.beginPath();
        ctx.moveTo(-b, by);
        ctx.arcTo(-t, ty, 0, ty, r);
        ctx.arcTo(t, ty, b, by, r);
        ctx.lineTo(b, by);
        ctx.closePath();
    }

    // One car, its back to us, at (x, y) on the ground, cw wide. Its lights
    // are separate (lights()), so a moving car can light them by the frame.
    function car(ctx, c, x, y, cw) {
        const k = CARS[c.kind];
        const px = 1 / cw;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(cw, cw);
        ctx.fillStyle = '#060609';
        ctx.fillRect(-0.45, -0.16, 0.15, 0.16);
        ctx.fillRect(0.3, -0.16, 0.15, 0.16);
        const [bx, by, bw, bh] = k.body;
        const top = by - bh;
        if (k.cabin) {
            cabinPath(ctx, k.cabin);
            ctx.fillStyle = c.tone;
            ctx.fill();
            ctx.strokeStyle = 'rgba(185, 200, 255, 0.28)';
            ctx.lineWidth = 1.3 * px;
            ctx.stroke();
            // The rear window, glowing with the picture, and whoever's watching.
            const [b, t, cby, cty, r] = k.cabin;
            const win = [b * 0.84, t * 0.8, cby - 0.025, cty + (cby - cty) * 0.17, r * 0.7];
            ctx.save();
            cabinPath(ctx, win);
            const glass = ctx.createLinearGradient(0, win[3], 0, win[2]);
            glass.addColorStop(0, 'rgba(150, 170, 235, 0.34)');
            glass.addColorStop(1, 'rgba(110, 120, 190, 0.14)');
            ctx.fillStyle = glass;
            ctx.fill();
            ctx.clip();
            ctx.fillStyle = c.tone;
            heads(ctx, c, win[2], win[0]);
            ctx.restore();
        } else {
            // A convertible: heads above the seats, rimmed by the screen's light.
            ctx.save();
            ctx.fillStyle = c.tone;
            ctx.strokeStyle = 'rgba(185, 200, 255, 0.35)';
            ctx.lineWidth = 1.3 * px;
            heads(ctx, { ...c, people: Math.max(1, c.people) }, top + 0.02, 0.4, true);
            ctx.restore();
        }
        ctx.fillStyle = c.tone;
        JellyfinFrames.roundRect(ctx, bx, top, bw, bh, k.round ? 0.12 : 0.04);
        ctx.fill();
        if (k.fins) {
            for (const side of [-1, 1]) {
                ctx.beginPath();
                ctx.moveTo(side * 0.5, top + 0.03);
                ctx.lineTo(side * 0.47, top - 0.08);
                ctx.lineTo(side * 0.34, top + 0.005);
                ctx.fill();
            }
        }
        // Rim light along the top, a chrome bumper and a plate.
        ctx.strokeStyle = 'rgba(185, 200, 255, 0.25)';
        ctx.lineWidth = 1.2 * px;
        ctx.beginPath();
        ctx.moveTo(bx + 0.04, top);
        ctx.lineTo(bx + bw - 0.04, top);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(200, 205, 225, 0.22)';
        ctx.lineWidth = 2 * px;
        ctx.beginPath();
        ctx.moveTo(bx + 0.02, by - 0.035);
        ctx.lineTo(bx + bw - 0.02, by - 0.035);
        ctx.stroke();
        ctx.fillStyle = 'rgba(210, 205, 170, 0.22)';
        ctx.fillRect(-0.07, by - 0.13, 0.14, 0.07);
        ctx.fillStyle = '#3a0c10';
        for (const [tx, ty] of k.tails) tailShape(ctx, k, tx, ty);
        ctx.restore();
    }

    function tailShape(ctx, k, x, y) {
        ctx.beginPath();
        if (k.tail === 'round') ctx.arc(x, y, 0.035, 0, 7);
        else ctx.rect(x - 0.025, y - 0.045, 0.05, 0.09);
        ctx.fill();
    }

    // Heads and shoulders in a window (or above the seats), seeded per car.
    function heads(ctx, c, base, half, stroke = false) {
        const n = c.people;
        for (let i = 0; i < n; i++) {
            const x = n === 1 ? (c.lean ? -0.12 : 0.1) : (i ? 0.15 : -0.15) + (c.lean ? (i ? -0.06 : 0.04) : 0);
            const r = 0.075 * (c.kind === 'bug' ? 0.9 : 1);
            const tilt = c.lean && n === 2 ? (i ? -0.25 : 0.25) : 0;
            ctx.beginPath();
            ctx.ellipse(x, base - 0.01, r * 1.7, r * 1.1, 0, Math.PI, 0);
            ctx.ellipse(x + tilt * 0.12, base - r * 2.1, r, r * 1.12, tilt, 0, Math.PI * 2);
            ctx.fill();
            if (stroke) ctx.stroke();
        }
        if (c.people === 2 && c.kind === 'wagon' && !stroke) {   // and a small one in the back
            ctx.beginPath();
            ctx.arc(half * 0.55, base - 0.075, 0.05, 0, 7);
            ctx.fill();
        }
    }

    // Tail lights as light: brightness 0 (off) to 1 (braking).
    function lights(ctx, c, x, y, cw, level, reverse = 0) {
        const k = CARS[c.kind];
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const [tx, ty] of k.tails) {
            const lx = x + tx * cw, ly = y + ty * cw;
            light(ctx, RED(), lx, ly, cw * (0.1 + level * 0.18), 0.25 + level * 0.75);
            ctx.globalAlpha = 1;
            ctx.fillStyle = `rgba(255, ${70 + level * 90}, ${60 + level * 60}, ${0.5 + level * 0.5})`;
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(cw, cw);
            tailShape(ctx, k, tx, ty);
            ctx.restore();
            if (reverse > 0) light(ctx, WHITE(), lx - Math.sign(tx) * cw * 0.06, ly + cw * 0.05, cw * 0.12, reverse * 0.9);
        }
        ctx.restore();
    }

    // A speaker post: a pole with a speaker hung either side.
    function post(ctx, x, y, cw) {
        const h = cw * 0.55, pw = Math.max(1.5, cw * 0.022);
        ctx.fillStyle = '#0c0c15';
        ctx.fillRect(x - pw / 2, y - h, pw, h);
        ctx.fillRect(x - cw * 0.09, y - h, cw * 0.18, pw * 0.8);
        for (const side of [-1, 1]) {
            JellyfinFrames.roundRect(ctx, x + side * cw * 0.09 - cw * 0.04, y - h + pw, cw * 0.08, cw * 0.075, cw * 0.012);
            ctx.fillStyle = '#121220';
            ctx.fill();
            ctx.fillStyle = 'rgba(185, 200, 255, 0.16)';
            ctx.fillRect(x + side * cw * 0.09 - cw * 0.04, y - h + pw, cw * 0.08, Math.max(1, cw * 0.008));
            ctx.fillStyle = '#0c0c15';
        }
    }

    function row(ctx, L, cars, sc) {
        const y = L.horizon + L.depth * sc;
        for (const c of cars) post(ctx, c.x + c.step / 2, y - L.frontW * sc * 0.03, L.frontW * sc);
        for (const c of cars) {
            car(ctx, c, c.x, y, c.cw);
            if (c.lit) lights(ctx, c, c.x, y, c.cw, 0.12);
        }
    }

    // The snack bar, which is also the projection booth.
    function booth(ctx, L) {
        const b = L.booth;
        const x = b.x - b.w / 2, y = b.y - b.h;
        ctx.fillStyle = '#1a1626';
        ctx.fillRect(x, y, b.w, b.h);
        ctx.fillStyle = '#0f0d18';
        ctx.fillRect(x - b.w * 0.06, y - b.h * 0.1, b.w * 1.12, b.h * 0.12);
        // Lit windows, and a striped awning.
        const win = ctx.createLinearGradient(0, y + b.h * 0.3, 0, y + b.h * 0.75);
        win.addColorStop(0, '#ffd889');
        win.addColorStop(1, '#e79a4a');
        ctx.fillStyle = win;
        for (const q of [0.1, 0.58]) ctx.fillRect(x + b.w * q, y + b.h * 0.32, b.w * 0.32, b.h * 0.4);
        const stripes = 8;
        for (let i = 0; i < stripes; i++) {
            ctx.fillStyle = i % 2 ? '#e8e0d0' : '#b8323c';
            ctx.beginPath();
            ctx.moveTo(x + (b.w * i) / stripes, y + b.h * 0.2);
            ctx.lineTo(x + (b.w * (i + 1)) / stripes, y + b.h * 0.2);
            ctx.lineTo(x + (b.w * (i + 1.12)) / stripes, y + b.h * 0.32);
            ctx.lineTo(x + (b.w * (i + 0.12)) / stripes, y + b.h * 0.32);
            ctx.fill();
        }
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        light(ctx, WARM(), b.x, y + b.h * 0.55, b.w * 0.9, 0.3, b.h * 0.7);
        ctx.restore();
        // A little SNACKS sign on the roof.
        const size = Math.max(6, b.h * 0.24);
        ctx.font = LETTERS(size);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        neon(ctx, 'SNACKS', b.x, y - b.h * 0.16, '255, 90, 110', size * 0.12);
    }

    // Neon: wide faint strokes under a thin bright one, baked (no shadowBlur).
    function neon(ctx, text, x, y, rgb, width) {
        ctx.save();
        ctx.lineJoin = 'round';
        for (const [k, a] of [[6, 0.06], [3.5, 0.1], [2, 0.22]]) {
            ctx.strokeStyle = `rgba(${rgb}, ${a})`;
            ctx.lineWidth = width * k;
            ctx.strokeText(text, x, y);
        }
        ctx.strokeStyle = `rgba(${rgb}, 0.95)`;
        ctx.lineWidth = width;
        ctx.strokeText(text, x, y);
        ctx.fillStyle = 'rgba(255, 245, 250, 0.9)';
        ctx.fillText(text, x, y);
        ctx.restore();
    }

    // The projector's beam: from the booth's roof to the bottom of the
    // picture, brightest at the lens. Light, so it's added.
    function beam(ctx, L) {
        const { beam: o, screen: s } = L;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const [spread, a] of [[1, 0.1], [0.55, 0.08], [0.2, 0.08]]) {
            const l = s.x + s.w / 2 - (s.w / 2) * spread, r = s.x + s.w / 2 + (s.w / 2) * spread;
            const g = ctx.createLinearGradient(o.x, o.y, o.x, s.y + s.h);
            g.addColorStop(0, `rgba(255, 244, 214, ${a * 2})`);
            g.addColorStop(0.5, `rgba(220, 225, 255, ${a})`);
            g.addColorStop(1, `rgba(200, 210, 255, ${a * 0.3})`);
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(o.x - 1, o.y);
            ctx.lineTo(l, s.y + s.h);
            ctx.lineTo(r, s.y + s.h);
            ctx.lineTo(o.x + 1, o.y);
            ctx.fill();
        }
        light(ctx, WARM(), o.x, o.y, L.booth.w * 0.35, 0.6);
        ctx.restore();
    }

    // ---- The sign ---------------------------------------------------------------------

    function sign(ctx, L, env) {
        const { board: b, crown: c, frame } = L;
        // Posts down to the ground.
        const ground = L.horizon + L.depth * 0.78;
        ctx.fillStyle = '#0d0d17';
        for (const q of [0.22, 0.78]) ctx.fillRect(b.x + b.w * q - frame * 0.4, b.y + b.h, frame * 0.8, ground - b.y - b.h);
        ctx.fillRect(b.x + b.w * 0.5 - frame * 0.3, c.y + c.h, frame * 0.6, b.y - c.y - c.h);
        // The crown: an arrow pointing to the screen, neon on enamel.
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(c.x, c.y + c.h * 0.08);
        ctx.lineTo(c.x + c.w * 0.86, c.y);
        ctx.lineTo(c.x + c.w, c.y + c.h * 0.5);
        ctx.lineTo(c.x + c.w * 0.86, c.y + c.h);
        ctx.lineTo(c.x, c.y + c.h * 0.92);
        ctx.closePath();
        const enamel = ctx.createLinearGradient(0, c.y, 0, c.y + c.h);
        enamel.addColorStop(0, '#174a55');
        enamel.addColorStop(1, '#0c2a33');
        ctx.fillStyle = enamel;
        ctx.fill();
        ctx.strokeStyle = '#e9c46a';
        ctx.lineWidth = Math.max(1.5, frame * 0.3);
        ctx.stroke();
        const script = c.h * 0.48;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.font = `italic 700 ${script}px "Brush Script MT", "Segoe Script", "Snell Roundhand", Georgia, cursive`;
        neon(ctx, 'Starlite', c.x + c.w * 0.47, c.y + c.h * 0.52, '255, 105, 180', Math.max(1, script * 0.05));
        ctx.font = LETTERS(c.h * 0.26);
        if ('letterSpacing' in ctx) ctx.letterSpacing = `${(c.h * 0.05).toFixed(1)}px`;
        neon(ctx, 'DRIVE-IN', c.x + c.w * 0.47, c.y + c.h * 0.86, '90, 230, 255', Math.max(0.8, c.h * 0.012));
        if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
        // A neon star at the tail of the arrow.
        star(ctx, c.x + c.h * 0.32, c.y + c.h * 0.38, c.h * 0.2);
        ctx.restore();
        // The board: painted steel, the bulbs, and the backlit letters.
        JellyfinFrames.roundRect(ctx, b.x, b.y, b.w, b.h, frame * 0.6);
        ctx.fillStyle = '#5a1a2a';
        ctx.fill();
        ctx.strokeStyle = '#2b0b14';
        ctx.lineWidth = 2;
        ctx.stroke();
        for (const p of L.bulbs) {
            ctx.fillStyle = '#ffe2a6';
            ctx.beginPath();
            ctx.arc(p.x, p.y, Math.max(1.2, frame * 0.2), 0, 7);
            ctx.fill();
        }
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const p of L.bulbs) light(ctx, WARM(), p.x, p.y, frame * 0.75, 0.35);
        ctx.restore();
        board(ctx, L, 'NOW SHOWING', (env.title || 'INTERMISSION').toUpperCase());
    }

    function star(ctx, x, y, r) {
        ctx.save();
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
            const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
            ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.lineJoin = 'round';
        for (const [k, a] of [[5, 0.08], [2.5, 0.18]]) {
            ctx.strokeStyle = `rgba(255, 220, 90, ${a})`;
            ctx.lineWidth = r * 0.12 * k;
            ctx.stroke();
        }
        ctx.strokeStyle = '#ffe680';
        ctx.lineWidth = r * 0.12;
        ctx.stroke();
        ctx.restore();
    }

    // The letter board: a backlit panel, rails, and one plastic letter per
    // character, each hung a little crooked, as someone on a ladder would.
    function board(ctx, L, header, text) {
        const p = L.inner;
        const panel = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
        panel.addColorStop(0, '#fffaf0');
        panel.addColorStop(1, '#efdcb6');
        ctx.fillStyle = panel;
        ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';                // the tubes behind the plastic
        for (let i = 1; i < 4; i++) ctx.fillRect(p.x, p.y + (p.h * i) / 4 - p.h * 0.03, p.w, p.h * 0.06);
        const random = seeded(hash(text));
        const head = p.h * 0.14;
        rail(ctx, p, p.y + p.h * 0.24);
        letters(ctx, header, p.x + p.w / 2, p.y + p.h * 0.2, head, '#c3202b', random);
        // The largest size that fits in three rows.
        const availW = p.w * 0.9, availH = p.h * 0.7, top = p.y + p.h * 0.27;
        let size = Math.min(p.h * 0.3, p.w * 0.16), lines = [];
        for (; size > 5; size *= 0.93) {
            ctx.font = LETTERS(size);
            lines = JellyfinFrames.wrap(ctx, text, availW);
            if (lines.length <= 3 && lines.length * size * 1.15 <= availH && lines.every(l => ctx.measureText(l).width <= availW)) break;
        }
        if (lines.length > 3) lines = [...lines.slice(0, 2), `${lines[2].replace(/\s*\S*$/, '')}…`];
        const lead = size * 1.15;
        let y = top + (availH - lines.length * lead) / 2 + size * 0.95;
        for (const line of lines) {
            rail(ctx, p, y + size * 0.12);
            letters(ctx, line, p.x + p.w / 2, y, size, '#16121a', random);
            y += lead;
        }
    }

    function rail(ctx, p, y) {
        ctx.fillStyle = 'rgba(120, 100, 80, 0.35)';
        ctx.fillRect(p.x + p.w * 0.02, y, p.w * 0.96, Math.max(1, p.h * 0.012));
    }

    function letters(ctx, line, cx, y, size, color, random) {
        ctx.save();
        ctx.font = LETTERS(size);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        const gap = size * 0.06;
        const chars = [...line];
        const widths = chars.map(ch => ctx.measureText(ch).width);
        let x = cx - (widths.reduce((a, b) => a + b, 0) + gap * (chars.length - 1)) / 2;
        chars.forEach((ch, i) => {
            const tilt = (random() - 0.5) * 0.08, drop = (random() - 0.5) * size * 0.07;
            if (ch !== ' ') {
                ctx.save();
                ctx.translate(x + widths[i] / 2, y + drop);
                ctx.rotate(tilt);
                ctx.fillStyle = 'rgba(60, 40, 20, 0.15)';
                ctx.fillText(ch, -widths[i] / 2 + size * 0.03, size * 0.04);
                ctx.fillStyle = color;
                ctx.fillText(ch, -widths[i] / 2, 0);
                ctx.restore();
            }
            x += widths[i] + gap;
        });
        ctx.restore();
    }

    // ---- paint -------------------------------------------------------------------------

    function paint(ctx, L, env) {
        const { w, h } = env.viewport;
        skyAndGround(ctx, L, w, h);
        tower(ctx, L);
        // A pool of the picture's light on the ground under the screen.
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        light(ctx, WHITE(), L.vpx, L.horizon + L.depth * 0.08, L.face.w * 0.6, 0.08, L.depth * 0.25);
        ctx.restore();
        beam(ctx, L);
        row(ctx, L, L.back, L.sb);
        booth(ctx, L);
        sign(ctx, L, env);
        row(ctx, L, L.front, 1);
        JellyfinFrames.cutScreen(ctx, L.screen);
        glass(ctx, L.screen);
    }

    // A projector's hotspot: the corners of the picture a touch darker.
    function glass(ctx, s) {
        const g = ctx.createRadialGradient(s.x + s.w / 2, s.y + s.h / 2, Math.min(s.w, s.h) * 0.4, s.x + s.w / 2, s.y + s.h / 2, Math.hypot(s.w, s.h) * 0.55);
        g.addColorStop(0, 'rgba(0, 0, 0, 0)');
        g.addColorStop(1, 'rgba(0, 0, 0, 0.28)');
        ctx.fillStyle = g;
        ctx.fillRect(s.x, s.y, s.w, s.h);
    }

    // ---- The screen's own pictures: leader, intermission, burn ------------------------

    // The countdown leader: grey, a sweeping hand, a big number, scratches.
    function leader(ctx, s, n, sweep) {
        const cx = s.x + s.w / 2, cy = s.y + s.h / 2, r = s.h * 0.4;
        ctx.save();
        ctx.beginPath();
        ctx.rect(s.x, s.y, s.w, s.h);
        ctx.clip();
        ctx.fillStyle = '#9d988c';
        ctx.fillRect(s.x, s.y, s.w, s.h);
        ctx.fillStyle = 'rgba(40, 36, 30, 0.45)';
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, Math.hypot(s.w, s.h), -Math.PI / 2, -Math.PI / 2 + sweep * Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#f4f1e8';
        ctx.lineWidth = Math.max(1.5, s.h * 0.012);
        for (const k of [1, 0.82]) { ctx.beginPath(); ctx.arc(cx, cy, r * k, 0, 7); ctx.stroke(); }
        ctx.strokeStyle = '#1c1a17';
        ctx.lineWidth = Math.max(1, s.h * 0.006);
        ctx.beginPath();
        ctx.moveTo(s.x, cy); ctx.lineTo(s.x + s.w, cy);
        ctx.moveTo(cx, s.y); ctx.lineTo(cx, s.y + s.h);
        ctx.stroke();
        ctx.fillStyle = '#141210';
        ctx.font = `700 ${s.h * 0.5}px "Helvetica Neue", Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(n), cx, cy + s.h * 0.02);
        const random = seeded(n * 31 + 7);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        for (let i = 0; i < 4; i++) ctx.fillRect(s.x + random() * s.w, s.y, 1, s.h);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(s.x + random() * s.w, s.y + random() * s.h, 0.6 + random() * 2, 0, 7); ctx.fill(); }
        glass(ctx, s);
        ctx.restore();
    }

    // Intermission: an atomic-age card, with popcorn and a soda.
    function intermission(ctx, s, title, detail) {
        const cx = s.x + s.w / 2, cy = s.y + s.h * 0.44;
        ctx.save();
        ctx.beginPath();
        ctx.rect(s.x, s.y, s.w, s.h);
        ctx.clip();
        const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(s.w, s.h) * 0.6);
        bg.addColorStop(0, '#2f6a74');
        bg.addColorStop(1, '#0f2530');
        ctx.fillStyle = bg;
        ctx.fillRect(s.x, s.y, s.w, s.h);
        ctx.fillStyle = 'rgba(255, 240, 200, 0.05)';
        for (let i = 0; i < 24; i += 2) {
            const a = (i / 24) * Math.PI * 2, b = ((i + 1) / 24) * Math.PI * 2, R = s.w;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
            ctx.lineTo(cx + Math.cos(b) * R, cy + Math.sin(b) * R);
            ctx.fill();
        }
        // Little four-point sparkles.
        const random = seeded(hash(title));
        ctx.fillStyle = 'rgba(255, 236, 170, 0.75)';
        for (let i = 0; i < 9; i++) {
            const x = s.x + s.w * (0.08 + random() * 0.84), y = s.y + s.h * (0.08 + random() * 0.3), r = s.h * (0.012 + random() * 0.018);
            ctx.beginPath();
            ctx.moveTo(x, y - r * 2); ctx.quadraticCurveTo(x, y, x + r * 2, y); ctx.quadraticCurveTo(x, y, x, y + r * 2); ctx.quadraticCurveTo(x, y, x - r * 2, y); ctx.quadraticCurveTo(x, y, x, y - r * 2);
            ctx.fill();
        }
        const size = Math.min(s.h * 0.17, (s.w * 0.62) / Math.max(6, title.length * 0.5));
        ctx.font = `italic 800 ${size}px Georgia, "Times New Roman", serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#c8323f';
        ctx.fillText(title, cx + size * 0.05, cy + size * 0.07);
        ctx.fillStyle = '#fff1c9';
        ctx.fillText(title, cx, cy);
        if (detail) {
            const small = Math.max(10, size * 0.28);
            ctx.font = `600 ${small}px "Helvetica Neue", Arial, sans-serif`;
            ctx.fillStyle = 'rgba(255, 236, 200, 0.85)';
            JellyfinFrames.wrap(ctx, detail, s.w * 0.5).slice(0, 2).forEach((line, i) => ctx.fillText(line, cx, cy + size * 0.7 + i * small * 1.35));
        }
        popcorn(ctx, s.x + s.w * 0.13, s.y + s.h * 0.93, s.h * 0.34);
        soda(ctx, s.x + s.w * 0.87, s.y + s.h * 0.93, s.h * 0.34);
        ctx.restore();
    }

    function popcorn(ctx, x, y, h) {
        const w = h * 0.62;
        ctx.save();
        ctx.fillStyle = '#fff4d6';
        const random = seeded(17);
        for (let i = 0; i < 14; i++) { ctx.beginPath(); ctx.arc(x + (random() - 0.5) * w * 1.05, y - h * 0.86 - random() * h * 0.2, w * (0.1 + random() * 0.06), 0, 7); ctx.fill(); }
        ctx.beginPath();
        ctx.moveTo(x - w / 2, y - h * 0.86);
        ctx.lineTo(x + w / 2, y - h * 0.86);
        ctx.lineTo(x + w * 0.38, y);
        ctx.lineTo(x - w * 0.38, y);
        ctx.closePath();
        ctx.fillStyle = '#f7f0e2';
        ctx.fill();
        ctx.clip();
        ctx.fillStyle = '#d1303c';
        for (let i = -3; i < 3; i += 2) ctx.fillRect(x + (i * w) / 6, y - h, w / 6, h);
        ctx.restore();
    }

    function soda(ctx, x, y, h) {
        const w = h * 0.5;
        ctx.save();
        ctx.strokeStyle = '#f2eee4';
        ctx.lineWidth = w * 0.09;
        ctx.beginPath();
        ctx.moveTo(x + w * 0.05, y - h * 0.82);
        ctx.lineTo(x + w * 0.32, y - h * 1.08);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - w / 2, y - h * 0.82);
        ctx.lineTo(x + w / 2, y - h * 0.82);
        ctx.lineTo(x + w * 0.38, y);
        ctx.lineTo(x - w * 0.38, y);
        ctx.closePath();
        ctx.fillStyle = '#d1303c';
        ctx.fill();
        ctx.fillStyle = '#f7f0e2';
        ctx.fillRect(x - w * 0.46, y - h * 0.55, w * 0.92, h * 0.16);
        ctx.fillStyle = '#e8e2d4';
        ctx.fillRect(x - w * 0.55, y - h * 0.88, w * 1.1, h * 0.07);
        ctx.restore();
    }

    // A film burn: a bright hole bubbling outward with a scorched rim.
    function burn(ctx, s, q) {
        const cx = s.x + s.w * 0.58, cy = s.y + s.h * 0.42, R = Math.hypot(s.w, s.h) * q ** 1.6;
        ctx.save();
        ctx.beginPath();
        ctx.rect(s.x, s.y, s.w, s.h);
        ctx.clip();
        const random = seeded(99);
        for (const [k, color] of [[1.12, 'rgba(70, 30, 8, 0.85)'], [1.05, 'rgba(255, 130, 40, 0.95)'], [1, 'rgba(255, 246, 220, 1)']]) {
            ctx.fillStyle = color;
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2, off = R * 0.25 * random();
                ctx.beginPath();
                ctx.arc(cx + Math.cos(a) * off, cy + Math.sin(a) * off, Math.max(0, R * k * (0.6 + random() * 0.3)), 0, 7);
                ctx.fill();
            }
        }
        ctx.restore();
    }

    // Paused: the frozen picture dimmed, with intermission over it.
    function paused(ctx, s) {
        cached(ctx, `paused:${s.w}x${s.h}`, s, g => {
            g.fillStyle = 'rgba(10, 6, 14, 0.66)';
            g.fillRect(s.x, s.y, s.w, s.h);
            const size = s.h * 0.12;
            g.font = `italic 800 ${size}px Georgia, "Times New Roman", serif`;
            g.textAlign = 'center';
            g.fillStyle = '#c8323f';
            g.fillText('Intermission', s.x + s.w / 2 + size * 0.05, s.y + s.h / 2 + size * 0.42);
            g.fillStyle = '#fff1c9';
            g.fillText('Intermission', s.x + s.w / 2, s.y + s.h / 2 + size * 0.35);
        });
    }

    // ---- Motion: the car, motes, bulbs, stars -------------------------------------------

    let transition = null;      // { kind, at }
    let idleKind = null, idleDrawn = false;
    let last = 0;
    let motes = null;
    const arrival = { phase: 'empty', at: 0, next: 0, kind: 'fins', car: null };
    let shooting = null, nextShoot = 0;

    // Where the arriving car is, and how big, for depth d (1 at the front row).
    function along(L, sc) {
        const q = (sc - L.sb) / (1 - L.sb);
        return { x: L.aisle.back + (L.aisle.front - L.aisle.back) * q, y: L.horizon + L.depth * sc, cw: L.frontW * sc };
    }

    // The arriving car's state: empty → in → parked → out → empty. Returns
    // ms until it next needs a frame.
    function drive(ctx, t, L, env) {
        const a = arrival;
        if (!env.motion) {
            if (a.phase === 'in') a.phase = 'parked';
            if (a.phase === 'out') a.phase = 'empty';
            a.next = 0;
        } else {
            if (!a.next) a.next = t + (a.phase === 'parked' ? 180000 : 30000 + Math.random() * 60000);
            if (t >= a.next) {
                a.at = t;
                if (a.phase === 'empty') {
                    a.phase = 'in';
                    a.car = { kind: ['fins', 'wagon', 'convertible', 'bug', 'pickup'][(Math.random() * 5) | 0], tone: TONES[(Math.random() * TONES.length) | 0], people: 1 + ((Math.random() * 2) | 0), lean: Math.random() < 0.5 };
                    a.next = t + ARRIVE_MS + 2500;
                } else if (a.phase === 'in') { a.phase = 'parked'; a.next = t + 150000 + Math.random() * 240000; }
                else if (a.phase === 'parked') { a.phase = 'out'; a.next = t + LEAVE_MS; }
                else { a.phase = 'empty'; a.next = t + 90000 + Math.random() * 180000; }
            }
        }
        if (a.phase === 'empty' || !a.car) return Infinity;
        const age = t - a.at;
        const near = 1 / L.start, far = 1 / L.sb;   // in distance, 1 / scale
        let sc = L.sb, brake = 0.12, head = 0, reverse = 0;
        if (a.phase === 'in') {
            const q = Math.min(1, age / ARRIVE_MS);
            sc = 1 / (near + (far - near) * ease(q));
            head = q < 1 ? 1 : Math.max(0, 1 - (age - ARRIVE_MS) / 1500);
            brake = q > 0.7 ? (q < 1 ? 1 : Math.max(0.12, 1 - (age - ARRIVE_MS) / 1500)) : 0.3;
        } else if (a.phase === 'out') {
            const q = Math.min(1, age / LEAVE_MS);
            sc = 1 / (far + (near - far) * q * q);
            reverse = 1;
            brake = 0.3;
            head = 0.8;
        }
        const p = along(L, sc);
        ctx.save();
        if (head > 0) {
            ctx.globalCompositeOperation = 'lighter';
            light(ctx, WARM(), p.x, p.y - p.cw * 0.4, p.cw * 1.4, head * 0.5, p.cw * 0.34);
            ctx.globalCompositeOperation = 'source-over';
        }
        ctx.globalAlpha = 1;
        car(ctx, a.car, p.x, p.y, p.cw);
        lights(ctx, a.car, p.x, p.y, p.cw, brake, reverse);
        ctx.restore();
        return a.phase === 'parked' ? Infinity : FRAME_MS;
    }

    function dust(ctx, t, dt, L, env) {
        const s = L.screen, o = L.beam;
        const want = Math.round(34 * (env.quality?.density ?? 1));
        if (!motes || motes.length !== want) motes = Array.from({ length: want }, () => spawn({}));
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const m of motes) {
            m.u += m.du * dt;
            m.v += Math.sin(t * 0.0004 + m.phase) * 0.00002 * dt;
            if (m.u > 0.9 || m.u < 0.06 || m.v < 0 || m.v > 1) spawn(m);
            const tx = s.x + s.w * m.v, ty = s.y + s.h * (0.55 + m.dy);
            const x = o.x + (tx - o.x) * m.u, y = o.y + (ty - o.y) * m.u;
            if (inside({ x, y }, s)) continue;
            const fade = Math.min(1, (m.u - 0.06) * 8, (0.9 - m.u) * 8);
            light(ctx, DUST(), x, y, m.r, fade * (0.25 + 0.75 * Math.abs(Math.sin(t * 0.0011 + m.phase))));
        }
        ctx.restore();
    }

    function spawn(m) {
        m.u = 0.08 + Math.random() * 0.8;
        m.v = Math.random();
        m.dy = (Math.random() - 0.5) * 0.9;
        m.du = (Math.random() - 0.5) * 0.00003;
        m.phase = Math.random() * 7;
        m.r = 1.6 + Math.random() * 2.8;
        return m;
    }

    function sky(ctx, t, L) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        L.twinkle.forEach((s, i) => {
            const a = Math.max(0, Math.sin(t * 0.0009 * (1 + (i % 4) * 0.3) + i * 1.7)) ** 3;
            light(ctx, WHITE(), s.x, s.y, s.r * 4.5, a * 0.55);
        });
        // The bulbs chase: every third one brighter, stepping round.
        const step = Math.floor(t / 380) % 3;
        L.bulbs.forEach((p, i) => { if ((i + step) % 3 === 0) light(ctx, WARM(), p.x, p.y, L.frame * 1.1, 0.75); });
        // A rare shooting star.
        if (!nextShoot) nextShoot = t + 40000 + Math.random() * 80000;
        if (!shooting && t >= nextShoot) {
            shooting = { at: t, x: L.screen.x * Math.random() + L.screen.w * 0.3, y: L.horizon * (0.05 + Math.random() * 0.25), dx: 0.9 + Math.random() * 0.4, dy: 0.35 };
            nextShoot = t + 70000 + Math.random() * 150000;
        }
        if (shooting) {
            const q = (t - shooting.at) / 900;
            if (q >= 1) shooting = null;
            else {
                const len = L.depth * 1.2, x = shooting.x + shooting.dx * len * q, y = shooting.y + shooting.dy * len * q;
                const g = ctx.createLinearGradient(x, y, x - shooting.dx * len * 0.35, y - shooting.dy * len * 0.35);
                g.addColorStop(0, `rgba(255, 255, 255, ${0.9 * Math.sin(q * Math.PI)})`);
                g.addColorStop(1, 'rgba(255, 255, 255, 0)');
                ctx.globalAlpha = 1;
                ctx.strokeStyle = g;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x - shooting.dx * len * 0.35, y - shooting.dy * len * 0.35);
                ctx.stroke();
            }
        }
        ctx.restore();
    }

    JellyfinFrames.add({
        id: 'drive-in',
        name: 'Drive-in',
        icon: '🚗',
        titled: true,
        videoFilter: 'saturate(1.05) sepia(0.08)',
        layout,
        paint,

        transition(kind, env) {
            transition = { kind, at: performance.now() };
            env.busy(kind === 'change' ? LEADER_MS : kind === 'pause' ? BURN_MS : LAMP_MS);
        },

        tick(ctx, t, L, env) {
            const dt = Math.min(100, last ? t - last : 0);
            last = t;
            const s = L.screen;
            const idle = idleDrawn;
            idleDrawn = false;
            let wait = Infinity;
            const age = transition ? t - transition.at : Infinity;
            if (transition?.kind === 'change' && age < LEADER_MS) {
                const third = LEADER_MS / 3;
                leader(ctx, s, 3 - Math.floor(age / third), (age % third) / third);
                wait = 33;
            } else if (transition?.kind === 'pause' && age < BURN_MS) {
                const q = age / BURN_MS;
                if (q > 0.7) paused(ctx, s);
                burn(ctx, s, Math.min(1, q / 0.7));
                if (q > 0.7) { ctx.fillStyle = `rgba(255, 246, 220, ${1 - (q - 0.7) / 0.3})`; ctx.fillRect(s.x, s.y, s.w, s.h); }
                wait = 33;
            } else if (env.paused) {
                paused(ctx, s);
            } else if (transition?.kind === 'play' && age < LAMP_MS) {
                const q = age / LAMP_MS;
                ctx.fillStyle = `rgba(255, 248, 230, ${(1 - q) * 0.55 * (0.6 + 0.4 * Math.sin(age * 0.09))})`;
                ctx.fillRect(s.x, s.y, s.w, s.h);
                wait = 33;
            } else if (transition && !env.paused) transition = null;
            wait = Math.min(wait, drive(ctx, t, L, env));
            if (env.motion) {
                dust(ctx, t, dt, L, env);
                sky(ctx, t, L);
                wait = Math.min(wait, FRAME_MS);
                if (idle && idleKind === 'loading') wait = Math.min(wait, 100);
            }
            return wait;
        },

        idle(ctx, L, env, kind) {
            const [header, words, title] = WORDS[kind] || WORDS.setup;
            const detail = (JellyfinFrames.IDLE[kind] || JellyfinFrames.IDLE.setup)[1];
            idleKind = kind;
            idleDrawn = true;
            const s = L.screen;
            if (kind === 'loading') {
                const t = performance.now();
                leader(ctx, s, 8 - (Math.floor(t / 1000) % 6), env.motion ? (t % 1000) / 1000 : 0);
            } else {
                cached(ctx, `card:${kind}:${s.w}x${s.h}`, s, g => { intermission(g, s, title, detail); glass(g, s); });
            }
            const p = L.inner;
            cached(ctx, `board:${kind}:${p.x},${p.y},${p.w}x${p.h}`, p, g => board(g, L, header, words));
        },

        // White with a black edge, as subtitles burned into a print would be.
        cue(ctx, text, L) {
            JellyfinFrames.drawCue(ctx, text, L.screen, { font: '600 {size}px "Helvetica Neue", Arial, sans-serif', color: '#fffdf4', box: null, outline: 'rgba(0, 0, 0, 0.92)', bottom: 0.07 });
        },
    });
})();
