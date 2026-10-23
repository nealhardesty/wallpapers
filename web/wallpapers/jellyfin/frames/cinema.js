// Cinema: a picture palace from the stalls. Red velvet curtains part at the
// start of each item and sweep closed between items (and on pause, under a
// lit INTERMISSION sign), beneath a swagged valance with gold fringe. A gilt
// proscenium, rows of seat silhouettes with a few heads, the exit signs'
// green glow on the side walls, and the projector's beam overhead with dust
// drifting through it. Upright phones get a tall proscenium with a sunburst
// crest and more rows.
//
// Cheap: the house is painted once per resize, the open curtains with it.
// Moving curtains are one baked velvet sprite stretched to each panel's
// width (so the folds spread as they close), never re-rendered; the valance
// and the sign are baked once per size and only drawn. The dust is a small
// pool at 10 fps, and only while the film runs with frame motion on.

(() => {
    'use strict';

    const CHANGE_MS = 1200, CLOSE_MS = 800, OPEN_MS = 900, OPENING_MS = 1100;
    const CHASE_MS = 350, DUST_MS = 100;
    const TYPE = '"American Typewriter", "Courier Prime", "Courier New", Courier, monospace';

    const seeded = seed => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const ease = q => (q < 0.5 ? 4 * q * q * q : 1 - (-2 * q + 2) ** 3 / 2);
    const clamp01 = q => Math.max(0, Math.min(1, q));

    function bake(w, h, dpr, draw) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.ceil(w * dpr));
        canvas.height = Math.max(1, Math.ceil(h * dpr));
        const c = canvas.getContext('2d');
        c.scale(dpr, dpr);
        draw(c);
        return canvas;
    }

    const glows = new Map();
    function glow(rgb) {
        if (!glows.has(rgb)) glows.set(rgb, bake(64, 64, 1, c => {
            const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
            g.addColorStop(0, `rgba(${rgb}, 1)`);
            g.addColorStop(0.3, `rgba(${rgb}, 0.4)`);
            g.addColorStop(1, `rgba(${rgb}, 0)`);
            c.fillStyle = g;
            c.fillRect(0, 0, 64, 64);
        }));
        return glows.get(rgb);
    }

    // One panel of velvet: deep folds from a couple of sines, a narrow
    // pink sheen on each crest, shadow under the valance and at the hem.
    let velvet = null;
    function velvetSprite() {
        return velvet ||= bake(400, 256, 1, c => {
            const lerp = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
            const shadow = [30, 2, 6], base = [122, 12, 26], sheen = [206, 62, 78];
            for (let x = 0; x < 400; x++) {
                const u = x / 400;
                const v = clamp01(0.5 + 0.34 * Math.sin(u * Math.PI * 14 + Math.sin(u * 9) * 0.9) + 0.16 * Math.sin(u * Math.PI * 30 + 1.3));
                const [r, g, b] = v < 0.55 ? lerp(shadow, base, v / 0.55) : lerp(base, sheen, ((v - 0.55) / 0.45) ** 1.8);
                c.fillStyle = `rgb(${r}, ${g}, ${b})`;
                c.fillRect(x, 0, 1.5, 256);
            }
            const fall = c.createLinearGradient(0, 0, 0, 256);
            fall.addColorStop(0, 'rgba(10, 0, 2, 0.75)');
            fall.addColorStop(0.16, 'rgba(10, 0, 2, 0.1)');
            fall.addColorStop(0.55, 'rgba(10, 0, 2, 0)');
            fall.addColorStop(0.9, 'rgba(10, 0, 2, 0.15)');
            fall.addColorStop(1, 'rgba(10, 0, 2, 0.7)');
            c.fillStyle = fall;
            c.fillRect(0, 0, 400, 256);
        });
    }

    // ---- Layout ------------------------------------------------------------------

    function layout(w, h, aspect, env) {
        const portrait = h > w * 1.1;
        const floor = h - env.insets.bottom;
        const top = h * 0.035;
        const k = portrait ? { valance: 0.3, stage: 0.07, seats: 0.7, side: 0.035, wide: 0.97 } : { valance: 0.15, stage: 0.07, seats: 0.3, side: 0.065, wide: 0.84 };
        const S = Math.min((w * k.wide) / (1 + 2 * k.side) / aspect, (floor - top) / (1 + k.valance + k.stage + k.seats));
        const W = S * aspect, cx = w / 2;
        const slack = floor - top - S * (1 + k.valance + k.stage + k.seats);
        const valanceY = top + slack * (portrait ? 0.62 : 0.3);
        const screen = { x: cx - W / 2, y: valanceY + S * k.valance, w: W, h: S, radius: 0 };
        const stageY = screen.y + S * 1.025;
        const side = W * k.side;
        const opening = { x: screen.x - side, y: valanceY + S * k.valance * 0.4, w: W + side * 2, h: stageY - valanceY - S * k.valance * 0.4 };
        const valance = { x: opening.x - side * 0.4, y: valanceY, w: opening.w + side * 0.8, h: S * k.valance - Math.max(2, S * 0.01) };
        const apron = { y: stageY + S * 0.015, h: S * (k.stage - 0.04) };
        const L = { portrait, floor, top, screen, opening, valance, stageY, apron, gilt: Math.max(5, S * 0.028), open: Math.max(10, side * 0.85),
            seats: { y: apron.y + apron.h, h: floor - apron.y - apron.h } };
        // Exit signs on the side walls, or low in the corners when there are none.
        const sign = Math.max(30, Math.min(64, S * 0.1));
        const wall = opening.x - L.gilt * 2;
        L.exits = wall > sign * 1.6
            ? [{ x: wall / 2, y: screen.y + S * 0.38, w: sign, door: true }, { x: w - wall / 2, y: screen.y + S * 0.38, w: sign, door: true }]
            : [{ x: sign * 0.9, y: Math.max(top + sign, valanceY - L.gilt * 2 - sign), w: sign }, { x: w - sign * 0.9, y: Math.max(top + sign, valanceY - L.gilt * 2 - sign), w: sign }];
        if (portrait && valanceY - top > 70) L.crest = { x: cx, y: valanceY - L.gilt * 2, r: Math.min(W * 0.32, (valanceY - top) * 0.75) };
        return L;
    }

    // The curtains at closedness k (0 open, 1 closed): two panels, each the
    // velvet sprite stretched to its width, with a soft shadow on the screen.
    function curtains(ctx, L, k) {
        const o = L.opening, sprite = velvetSprite();
        const pw = L.open + (o.w / 2 + 2 - L.open) * k;
        const shade = Math.min(30, o.w * 0.04) * (k > 0 && k < 1 ? 1 : 0.6);
        ctx.save();
        if (k > 0) {
            for (const [x, dir] of [[o.x + pw, 1], [o.x + o.w - pw, -1]]) {
                const g = ctx.createLinearGradient(x, 0, x + shade * dir, 0);
                g.addColorStop(0, 'rgba(0, 0, 0, 0.5)');
                g.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = g;
                ctx.fillRect(dir > 0 ? x : x - shade, o.y, shade, o.h);
            }
        }
        ctx.drawImage(sprite, o.x, o.y, pw, o.h);
        ctx.translate(o.x + o.w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(sprite, 0, o.y, pw, o.h);
        ctx.restore();
        // Where they meet, a deep fold.
        if (k > 0.9) {
            const seam = ctx.createLinearGradient(o.x + o.w / 2 - 8, 0, o.x + o.w / 2 + 8, 0);
            seam.addColorStop(0, 'rgba(20, 0, 4, 0)');
            seam.addColorStop(0.5, `rgba(20, 0, 4, ${(k - 0.9) * 6})`);
            seam.addColorStop(1, 'rgba(20, 0, 4, 0)');
            ctx.fillStyle = seam;
            ctx.fillRect(o.x + o.w / 2 - 8, o.y, 16, o.h);
        }
    }

    // The valance: a velvet band with swags, a gold braid, fringe and tassels.
    function valance(ctx, L) {
        const v = L.valance, sprite = velvetSprite();
        const swags = Math.max(3, Math.round(v.w / (L.portrait ? 120 : 190)));
        const sw = v.w / swags, dip = v.h * 0.22, fringe = Math.max(4, v.h * 0.1), edge = v.y + v.h - dip - fringe;
        ctx.save();
        // Shadow cast on the curtains below.
        const drop = ctx.createLinearGradient(0, edge, 0, edge + dip + fringe * 3);
        drop.addColorStop(0, 'rgba(0, 0, 0, 0.45)');
        drop.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = drop;
        ctx.fillRect(v.x, edge, v.w, dip + fringe * 3);
        const outline = c => {
            c.beginPath();
            c.moveTo(v.x, v.y);
            c.lineTo(v.x + v.w, v.y);
            c.lineTo(v.x + v.w, edge);
            for (let i = swags - 1; i >= 0; i--) c.quadraticCurveTo(v.x + sw * (i + 0.5), edge + dip * 2, v.x + sw * i, edge);
            c.closePath();
        };
        outline(ctx);
        ctx.clip();
        ctx.drawImage(sprite, v.x, v.y, v.w * 0.5, v.h);
        ctx.drawImage(sprite, v.x + v.w * 0.5, v.y, v.w * 0.5, v.h);
        // Each swag's folds: curved shadows and sheens.
        for (let i = 0; i < swags; i++) {
            const x0 = v.x + sw * i;
            for (let f = 0; f < 4; f++) {
                const y = v.y + v.h * (0.25 + f * 0.13);
                ctx.strokeStyle = f % 2 ? 'rgba(230, 90, 100, 0.22)' : 'rgba(20, 0, 4, 0.45)';
                ctx.lineWidth = Math.max(1.5, v.h * 0.04);
                ctx.beginPath();
                ctx.moveTo(x0 + sw * 0.04, y - v.h * 0.06);
                ctx.quadraticCurveTo(x0 + sw * 0.5, y + (edge + dip - y) * 0.75, x0 + sw * 0.96, y - v.h * 0.06);
                ctx.stroke();
            }
        }
        const top = ctx.createLinearGradient(0, v.y, 0, v.y + v.h);
        top.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
        top.addColorStop(0.3, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = top;
        ctx.fillRect(v.x, v.y, v.w, v.h);
        ctx.restore();
        // Gold braid along the swags, fringe beneath it, a tassel at each join.
        ctx.strokeStyle = '#c9a24a';
        ctx.lineWidth = Math.max(2, v.h * 0.045);
        ctx.beginPath();
        ctx.moveTo(v.x, edge);
        for (let i = 0; i < swags; i++) ctx.quadraticCurveTo(v.x + sw * (i + 0.5), edge + dip * 2, v.x + sw * (i + 1), edge);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(214, 170, 80, 0.75)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < swags; i++) {
            for (let q = 0.02; q < 1; q += 0.035) {
                const x = v.x + sw * (i + q), y = edge + dip * 2 * q * (1 - q) * 2 * 0.98;
                ctx.moveTo(x, y);
                ctx.lineTo(x, y + fringe);
            }
        }
        ctx.stroke();
        for (let i = 0; i <= swags; i++) {
            const x = v.x + sw * i, t = fringe * 2.2;
            ctx.fillStyle = '#b8902f';
            ctx.beginPath(); ctx.arc(x, edge + 2, Math.max(2, t * 0.22), 0, 7); ctx.fill();
            ctx.beginPath(); ctx.moveTo(x - t * 0.15, edge + t * 0.3); ctx.lineTo(x + t * 0.15, edge + t * 0.3); ctx.lineTo(x + t * 0.3, edge + t * 1.3); ctx.lineTo(x - t * 0.3, edge + t * 1.3); ctx.fill();
            ctx.fillStyle = 'rgba(255, 230, 160, 0.4)';
            ctx.fillRect(x - t * 0.06, edge + t * 0.35, Math.max(1, t * 0.08), t * 0.9);
        }
    }

    // ---- The still house -------------------------------------------------------------

    function walls(ctx, L, w, h) {
        const wall = ctx.createLinearGradient(0, 0, 0, L.floor);
        wall.addColorStop(0, '#12050a');
        wall.addColorStop(0.5, '#25090f');
        wall.addColorStop(1, '#14050a');
        ctx.fillStyle = wall;
        ctx.fillRect(0, 0, w, h);
        // Art deco fluting: pairs of thin gilt lines up the walls.
        const step = Math.max(40, L.screen.h * 0.16);
        for (let x = step / 2; x < w; x += step) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
            ctx.fillRect(x - step * 0.25, 0, step * 0.5, L.floor);
            ctx.fillStyle = 'rgba(212, 170, 90, 0.06)';
            ctx.fillRect(x - step * 0.25, 0, 1, L.floor);
            ctx.fillRect(x + step * 0.25, 0, 1, L.floor);
        }
        // The screen's light, spilling on the front wall, and a cornice.
        const s = L.screen;
        const spill = ctx.createRadialGradient(s.x + s.w / 2, s.y + s.h / 2, s.h * 0.3, s.x + s.w / 2, s.y + s.h / 2, Math.max(w, h) * 0.75);
        spill.addColorStop(0, 'rgba(150, 160, 200, 0.12)');
        spill.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
        ctx.fillStyle = spill;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(212, 170, 90, 0.18)';
        ctx.fillRect(0, L.top * 0.6, w, 1.5);
    }

    // The gilt proscenium round the opening; the crest above it on phones.
    function proscenium(ctx, L) {
        const o = L.opening, v = L.valance, g = L.gilt;
        const x = v.x - g, y = v.y - g, pw = v.w + g * 2, ph = L.stageY - y;
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(x - g, y - g, pw + g * 2, ph + g);
        const gold = ctx.createLinearGradient(x, y, x + pw, y + ph);
        gold.addColorStop(0, '#e2c06a');
        gold.addColorStop(0.35, '#8c6420');
        gold.addColorStop(0.65, '#c99e48');
        gold.addColorStop(1, '#6e4c18');
        ctx.strokeStyle = gold;
        ctx.lineWidth = g;
        ctx.strokeRect(x + g / 2, y + g / 2, pw - g, ph);
        ctx.strokeStyle = 'rgba(255, 236, 180, 0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + g * 0.25, y + g * 0.25, pw - g * 0.5, ph);
        ctx.strokeStyle = 'rgba(40, 20, 0, 0.6)';
        ctx.strokeRect(x + g * 0.95, y + g * 0.95, pw - g * 1.9, ph);
        // Beads along the gilt.
        ctx.fillStyle = 'rgba(255, 230, 160, 0.35)';
        for (let bx = x + g; bx < x + pw - g; bx += g * 1.4) { ctx.beginPath(); ctx.arc(bx, y + g / 2, g * 0.18, 0, 7); ctx.fill(); }
        // Backstage: black behind everything in the opening.
        ctx.fillStyle = '#050304';
        ctx.fillRect(o.x, o.y, o.w, L.stageY - o.y);
        ctx.restore();
        if (L.crest) {
            const { x: cx, y: cy, r } = L.crest;
            ctx.save();
            for (let i = 0; i <= 12; i++) {
                const a = Math.PI + (i / 12) * Math.PI;
                ctx.strokeStyle = i % 2 ? 'rgba(212, 170, 90, 0.35)' : 'rgba(212, 170, 90, 0.18)';
                ctx.lineWidth = i % 2 ? 2 : 6;
                ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r * 0.25, cy + Math.sin(a) * r * 0.25); ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.stroke();
            }
            ctx.fillStyle = '#b8902f';
            ctx.beginPath(); ctx.arc(cx, cy, r * 0.22, Math.PI, 0); ctx.fill();
            ctx.fillStyle = '#2a0a0e';
            ctx.beginPath(); ctx.arc(cx, cy, r * 0.15, Math.PI, 0); ctx.fill();
            ctx.strokeStyle = '#c9a24a';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 0); ctx.stroke();
            ctx.restore();
        }
    }

    // The stage floor, its apron and a row of little footlights.
    function stage(ctx, L, w) {
        const o = L.opening, a = L.apron;
        const boards = ctx.createLinearGradient(0, L.stageY, 0, a.y);
        boards.addColorStop(0, '#2a1a10');
        boards.addColorStop(1, '#4a3020');
        ctx.fillStyle = boards;
        ctx.fillRect(o.x - L.gilt * 2, L.stageY, o.w + L.gilt * 4, a.y - L.stageY);
        const front = ctx.createLinearGradient(0, a.y, 0, a.y + a.h);
        front.addColorStop(0, '#1c0c0a');
        front.addColorStop(1, '#0a0405');
        ctx.fillStyle = front;
        ctx.fillRect(Math.max(0, o.x - L.gilt * 6), a.y, Math.min(w, o.w + L.gilt * 12), a.h);
        ctx.fillStyle = 'rgba(212, 170, 90, 0.35)';
        ctx.fillRect(Math.max(0, o.x - L.gilt * 6), a.y, Math.min(w, o.w + L.gilt * 12), 1.5);
        const lights = Math.max(6, Math.round(o.w / 60)), r = Math.max(3, a.h * 0.5);
        for (let i = 0; i < lights; i++) {
            const x = o.x + (o.w * (i + 0.5)) / lights;
            ctx.globalAlpha = 0.35;
            ctx.drawImage(glow('255, 200, 120'), x - r * 2, a.y - r * 1.4, r * 4, r * 2.4);
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#ffdca0';
            ctx.fillRect(x - r * 0.4, a.y + 1, r * 0.8, Math.max(1.5, r * 0.25));
        }
    }

    // Rows of seat backs from behind, nearest last, a few heads among them.
    function seats(ctx, L, w, random) {
        const { y, h } = L.seats;
        const rows = L.portrait ? Math.max(2, Math.min(3, Math.round(h / 80))) : 2;
        const near = Math.min(h * (rows > 2 ? 0.4 : 0.62), L.portrait ? 110 : 120);
        // The rake: dark carpet between the rows.
        const carpet = ctx.createLinearGradient(0, y, 0, L.floor);
        carpet.addColorStop(0, '#0d0407');
        carpet.addColorStop(1, '#040102');
        ctx.fillStyle = carpet;
        ctx.fillRect(0, y, w, L.floor - y + 60);
        for (let r = 0; r < rows; r++) {
            const k = rows === 1 ? 1 : r / (rows - 1);
            const sh = near * (0.55 + 0.45 * k), sw = sh * 0.82;
            // The farthest row starts low enough that its heads stay under the curtains' hem.
            const start = y + near * 0.25, top = start + (L.floor - sh - start) * (k ** 1.3);
            const offset = (r % 2) * sw * 0.5 - sw * 0.25;
            const dark = 10 - r * 2;
            for (let x = (w / 2) % sw - sw + offset; x < w + sw; x += sw) {
                // A head in a few of the farther seats, sometimes two leaning in.
                if (r < rows - 1 && random() < 0.16) {
                    const hr = sw * 0.27, hx = x + sw / 2 + (random() - 0.5) * sw * 0.2;
                    ctx.fillStyle = '#060204';
                    ctx.beginPath(); ctx.ellipse(hx, top - hr * 0.9, hr, hr * 1.12, 0, 0, 7); ctx.fill();
                    ctx.beginPath(); ctx.ellipse(hx, top + hr * 0.3, hr * 1.9, hr * 0.8, 0, Math.PI, 0); ctx.fill();
                    ctx.strokeStyle = 'rgba(170, 180, 230, 0.18)';
                    ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.ellipse(hx, top - hr * 0.9, hr, hr * 1.12, 0, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
                }
                const back = ctx.createLinearGradient(0, top, 0, top + sh);
                back.addColorStop(0, `rgb(${46 - r * 6}, ${8}, ${14})`);
                back.addColorStop(0.25, `rgb(${24 - dark}, 3, 7)`);
                back.addColorStop(1, '#050103');
                ctx.fillStyle = back;
                JellyfinFrames.roundRect(ctx, x + sw * 0.06, top, sw * 0.88, sh * 1.4, sw * 0.28);
                ctx.fill();
                // The screen's light catching the top of each seat back.
                ctx.strokeStyle = 'rgba(190, 170, 200, 0.16)';
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.moveTo(x + sw * 0.16, top + 1);
                ctx.lineTo(x + sw * 0.84, top + 1);
                ctx.stroke();
                // Armrests between seats.
                ctx.fillStyle = '#040102';
                ctx.fillRect(x - sw * 0.04, top + sh * 0.45, sw * 0.08, sh);
            }
        }
    }

    // A glowing green EXIT, over a door when it's on a wall.
    function exitSign(ctx, e, L) {
        const w = e.w, h = w * 0.42;
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.drawImage(glow('60, 255, 120'), e.x - w * 2, e.y - w * 1.6, w * 4, w * 3.2);
        ctx.globalAlpha = 1;
        if (e.door) {
            const dw = w * 1.2, dh = Math.min(w * 2.6, L.floor - e.y - h);
            ctx.fillStyle = '#0a0306';
            ctx.fillRect(e.x - dw / 2, e.y + h, dw, dh);
            ctx.strokeStyle = 'rgba(80, 220, 130, 0.2)';
            ctx.lineWidth = 2;
            ctx.strokeRect(e.x - dw / 2, e.y + h, dw, dh);
            ctx.fillStyle = 'rgba(80, 220, 130, 0.18)';
            ctx.fillRect(e.x - dw * 0.4, e.y + h + dh * 0.5, dw * 0.8, 2);
        }
        ctx.fillStyle = '#0d2a16';
        ctx.fillRect(e.x - w / 2, e.y - h / 2, w, h);
        ctx.strokeStyle = '#3a5a44';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(e.x - w / 2, e.y - h / 2, w, h);
        ctx.fillStyle = '#7dffaa';
        ctx.font = `700 ${h * 0.62}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('EXIT', e.x, e.y + 1);
        ctx.restore();
    }

    function paint(ctx, L, env) {
        const { w, h } = env.viewport;
        const random = seeded(1927);
        walls(ctx, L, w, h);
        proscenium(ctx, L);
        curtains(ctx, L, 0);
        valance(ctx, L);
        stage(ctx, L, w);
        for (const e of L.exits) exitSign(ctx, e, L);
        seats(ctx, L, w, random);
        // Last, so no shading laid over the house darkens the picture.
        JellyfinFrames.cutScreen(ctx, L.screen);
    }

    // ---- What moves --------------------------------------------------------------

    // Per-size sprites for the overlay: the valance (curtains draw under it),
    // the projector's beam, and the sign.
    let cache = { key: '' };
    function sprites(L, dpr, w) {
        const key = `${L.valance.x},${L.valance.w},${L.screen.y},${dpr},${w}`;
        if (cache.key === key) return cache;
        const v = L.valance, s = L.screen;
        const below = v.h * 0.6;
        cache = { key, valance: bake(v.w, v.h + below, dpr, c => { c.translate(-v.x, -v.y); valance(c, L); }), below };
        // The beam: from above and behind, widening onto the screen's top edge.
        const top = s.w * 0.14, bh = s.y;
        cache.beam = bake(w, bh, 0.5, c => {
            const g = c.createLinearGradient(0, 0, 0, bh);
            g.addColorStop(0, 'rgba(210, 220, 255, 0.11)');
            g.addColorStop(1, 'rgba(210, 220, 255, 0.025)');
            c.fillStyle = g;
            c.beginPath();
            c.moveTo(w / 2 - top, 0); c.lineTo(w / 2 + top, 0); c.lineTo(s.x + s.w, bh); c.lineTo(s.x, bh);
            c.fill();
            c.strokeStyle = 'rgba(220, 230, 255, 0.05)';
            c.lineWidth = 6;
            for (const k of [0.2, 0.45, 0.7, 0.85]) {
                c.beginPath(); c.moveTo(w / 2 - top + top * 2 * k, 0); c.lineTo(s.x + s.w * k, bh); c.stroke();
            }
        });
        return cache;
    }

    // The sign over closed curtains: words baked, bulbs drawn as they chase.
    const SIGNS = {
        setup: ['COMING SOON', null], connecting: ['PLEASE BE SEATED', null], offline: ['TECHNICAL DIFFICULTIES', null],
        signedout: ['TICKETS, PLEASE', null], empty: ['NO SHOWINGS TODAY', null], loading: ['FEATURE PRESENTATION', 'The show is about to begin'],
        away: ['NOW SHOWING NEXT DOOR', null], demo: ['COMING SOON', null], paused: ['INTERMISSION', 'Press Space to resume'],
    };
    let board = { key: '' };
    function sign(ctx, L, kind, t, chase) {
        const [title, own] = SIGNS[kind] || SIGNS.setup;
        const detail = own ?? (JellyfinFrames.IDLE[kind] || JellyfinFrames.IDLE.setup)[1];
        const o = L.opening, s = L.screen;
        const sw = Math.min(o.w * 0.66, 480), sh = sw * (detail ? 0.34 : 0.24);
        const x = o.x + (o.w - sw) / 2, y = s.y + s.h * 0.42 - sh / 2;
        const dpr = ctx.getTransform().a, key = `${kind},${sw},${dpr}`;
        if (board.key !== key) {
            board = { key, canvas: bake(sw, sh, dpr, c => {
                c.fillStyle = 'rgba(0, 0, 0, 0.5)';
                c.fillRect(4, 6, sw - 4, sh - 6);
                const panel = c.createLinearGradient(0, 0, 0, sh);
                panel.addColorStop(0, '#1c120c');
                panel.addColorStop(1, '#0c0705');
                c.fillStyle = panel;
                JellyfinFrames.roundRect(c, 0, 0, sw - 4, sh - 4, 6);
                c.fill();
                c.strokeStyle = '#c9a24a';
                c.lineWidth = 2;
                JellyfinFrames.roundRect(c, sw * 0.045, sw * 0.045, sw - 4 - sw * 0.09, sh - 4 - sw * 0.09, 4);
                c.stroke();
                c.textAlign = 'center';
                c.textBaseline = 'middle';
                let size = Math.min(sh * (detail ? 0.24 : 0.34), sw * 0.075);
                c.font = `700 ${size}px ${TYPE}`;
                while (c.measureText(title).width > sw * 0.8 && size > 8) c.font = `700 ${(size *= 0.92)}px ${TYPE}`;
                c.fillStyle = '#f8e8c0';
                c.fillText(title, (sw - 4) / 2, detail ? sh * 0.4 : (sh - 4) / 2);
                if (detail) {
                    const small = Math.max(9, size * 0.42);
                    c.font = `400 ${small}px ${TYPE}`;
                    c.fillStyle = 'rgba(240, 220, 180, 0.75)';
                    c.fillText(JellyfinFrames.wrap(c, detail, sw * 0.8)[0] || '', (sw - 4) / 2, sh * 0.66);
                }
            }) };
        }
        ctx.drawImage(board.canvas, x, y, sw, sh);
        // Bulbs round the edge, every third one dark and the dark ones chasing.
        const r = Math.max(1.6, sw * 0.007), gap = Math.max(10, sw * 0.04), inset = sw * 0.022;
        const bw = sw - 4 - inset * 2, bh = sh - 4 - inset * 2;
        const per = [Math.round(bw / gap), Math.round(bh / gap)];
        const phase = chase ? Math.floor(t / CHASE_MS) : -1;
        let i = 0;
        const bulb = (bx, by) => {
            const lit = phase < 0 || (i + phase) % 3 !== 0;
            i++;
            if (lit) {
                ctx.globalAlpha = 0.5;
                ctx.drawImage(glow('255, 210, 130'), bx - r * 4, by - r * 4, r * 8, r * 8);
                ctx.globalAlpha = 1;
            }
            ctx.fillStyle = lit ? '#fff2c8' : '#4a3418';
            ctx.beginPath(); ctx.arc(bx, by, r, 0, 7); ctx.fill();
        };
        for (let k = 0; k < per[0]; k++) bulb(x + inset + (bw * k) / per[0], y + inset);
        for (let k = 0; k < per[1]; k++) bulb(x + inset + bw, y + inset + (bh * k) / per[1]);
        for (let k = per[0]; k > 0; k--) bulb(x + inset + (bw * k) / per[0], y + inset + bh);
        for (let k = per[1]; k > 0; k--) bulb(x + inset, y + inset + (bh * k) / per[1]);
    }

    // Curtains closed, the valance over them, and a sign.
    function closed(ctx, L, env, kind, t) {
        const c = sprites(L, ctx.getTransform().a, env.viewport.w);
        curtains(ctx, L, 1);
        ctx.drawImage(c.valance, L.valance.x, L.valance.y, L.valance.w, L.valance.h + c.below);
        sign(ctx, L, kind, t, env.motion);
    }

    // Dust in the beam: a small pool, positions across (u) and down (v) it.
    let dust = [];
    function drawDust(ctx, L, env, t, w) {
        const want = Math.round(26 * (env.quality?.density ?? 1)), s = L.screen;
        while (dust.length < want) dust.push({ u: Math.random(), v: Math.random(), du: (Math.random() - 0.5) * 0.01, dv: (Math.random() - 0.3) * 0.012, p: Math.random() * 6, r: 0.8 + Math.random() * 1.6 });
        dust.length = want;
        const dt = Math.min(0.1, Math.max(0, (t - lastDust) / 1000));
        lastDust = t;
        const top = s.w * 0.14, sprite = glow('235, 238, 255');
        for (const d of dust) {
            d.u += d.du * dt; d.v += d.dv * dt; d.p += dt * 0.8;
            if (d.u < 0 || d.u > 1) d.du = -d.du;
            if (d.v > 1) d.v -= 1; else if (d.v < 0) d.v += 1;
            const y = d.v * s.y, half = top + (s.w / 2 - top) * d.v;
            const x = w / 2 + (d.u * 2 - 1) * half;
            ctx.globalAlpha = 0.15 + 0.55 * Math.max(0, Math.sin(d.p));
            ctx.drawImage(sprite, x - d.r * 2, y - d.r * 2, d.r * 4, d.r * 4);
        }
        ctx.globalAlpha = 1;
    }
    let lastDust = 0;

    // How closed the curtains are now: a move from `from`, or a change's
    // close-hold-open; when no move runs, closed only while paused.
    let move = { from: 0, to: 0, at: -1e9, ms: 1, change: false };
    let idling = false, wasIdle = false, closedNow = 0;
    function closedness(t, env) {
        const q = clamp01((t - move.at) / move.ms);
        if (q >= 1) return env.paused ? 1 : 0;
        if (move.change) {
            if (q < 0.38) return move.from + (1 - move.from) * ease(q / 0.38);
            if (q < 0.55) return 1;
            return 1 - ease((q - 0.55) / 0.45);
        }
        return move.from + (move.to - move.from) * ease(q);
    }

    JellyfinFrames.add({
        id: 'cinema',
        name: 'Cinema',
        icon: '🎭',
        layout,
        paint,

        transition(kind, env) {
            const now = performance.now(), from = closedness(now, env);
            move = kind === 'change' ? { from, at: now, ms: CHANGE_MS, change: true }
                : { from, to: kind === 'pause' ? 1 : 0, at: now, ms: kind === 'pause' ? CLOSE_MS : OPEN_MS, change: false };
            env.busy(move.ms);
        },

        tick(ctx, t, L, env) {
            const idle = idling;
            idling = false;
            if (idle) {
                wasIdle = true;
                closedNow = 1;
                return env.motion ? CHASE_MS - (t % CHASE_MS) + 1 : Infinity;
            }
            // The show starts: part the curtains that the idle screen had closed.
            if (wasIdle) {
                wasIdle = false;
                move = { from: 1, to: 0, at: t, ms: OPENING_MS, change: false };
            }
            const k = closedness(t, env);
            closedNow = k;
            const { w } = env.viewport, c = sprites(L, ctx.getTransform().a, w);
            let wait = Infinity;
            if (k < 1 && !env.paused || t - move.at < move.ms) {
                ctx.globalAlpha = 1 - k;
                ctx.drawImage(c.beam, 0, 0, w, L.screen.y);
                ctx.globalAlpha = 1;
                if (env.motion && env.playing && k < 1) {
                    drawDust(ctx, L, env, t, w);
                    wait = DUST_MS;
                }
            }
            if (k > 0) {
                curtains(ctx, L, k);
                ctx.drawImage(c.valance, L.valance.x, L.valance.y, L.valance.w, L.valance.h + c.below);
            }
            if (k >= 1 && env.paused) {
                sign(ctx, L, 'paused', t, env.motion);
                if (env.motion) wait = Math.min(wait, CHASE_MS - (t % CHASE_MS) + 1);
            }
            if (t - move.at < move.ms) return 33;
            return wait;
        },

        idle(ctx, L, env, kind) {
            idling = true;
            closed(ctx, L, env, kind, performance.now());
        },

        // A typewriter face, cream on a black outline; none behind closed curtains.
        cue(ctx, text, L) {
            if (closedNow > 0.3) return;
            JellyfinFrames.drawCue(ctx, text, L.screen, { font: `700 {size}px ${TYPE}`, color: '#fff4d6', box: null, outline: 'rgba(0, 0, 0, 0.9)', bottom: 0.07 });
        },
    });
})();
