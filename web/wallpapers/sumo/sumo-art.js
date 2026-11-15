// Sumo Championship's pictures (SPEC §10.35), in the manner of a woodblock
// print: flat colours inside one dark line, a graded wash of indigo at the
// top of the sheet, and paper showing through.
//
//   backdrop()   everything that stands still, painted once per size: the
//                paper, the hall's banners, the crowd on its cushions, the
//                hanging roof with its four tassels, the clay platform and
//                its ring of straw bales
//   rikishi()    a wrestler, from a pose: where his hips are, how far he
//                squats and leans, what his arms and legs are doing
//   gyoji()      the referee, with his fan
//   and the small things: salt, dust, a cushion, the cup, the cartouches
//
// Everything is drawn in CSS px, from the geometry the manager works out.

const SumoArt = (() => {
    'use strict';

    const INK = '#2a211c';
    const SKIN = ['#e9c49c', '#dcae82', '#c8956a', '#f0d3b0'];
    const BELTS = ['#1f3a5f', '#a3262a', '#2f6b4a', '#6a3d7a', '#c2892a', '#1c1c22', '#2c7d86', '#b3562c', '#7a8a2c', '#8a2c52'];
    const CLOTH = ['#1f3a5f', '#a3262a', '#2f6b4a', '#c2892a', '#5a4a7a', '#7b6a55', '#35556e', '#8c3b2e', '#d8cdb0'];
    const PAPER = { day: '#eadcbd', evening: '#cfc3ae' };

    const seeded = seed => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

    // ---- The hall, once per size ---------------------------------------------------

    function backdrop(w, h, G, evening, density) {
        const canvas = document.createElement('canvas'), dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        const ctx = canvas.getContext('2d'), random = seeded(160);
        ctx.scale(dpr, dpr);
        ctx.fillStyle = evening ? PAPER.evening : PAPER.day;
        ctx.fillRect(0, 0, w, h);
        // The graded wash at the top of the sheet.
        const wash = ctx.createLinearGradient(0, 0, 0, h * 0.5);
        wash.addColorStop(0, evening ? 'rgba(14, 24, 48, 0.96)' : 'rgba(31, 58, 95, 0.9)');
        wash.addColorStop(0.55, evening ? 'rgba(20, 32, 60, 0.6)' : 'rgba(31, 58, 95, 0.22)');
        wash.addColorStop(1, 'rgba(31, 58, 95, 0)');
        ctx.fillStyle = wash;
        ctx.fillRect(0, 0, w, h * 0.5);
        ctx.lineJoin = ctx.lineCap = 'round';

        // Banners down both sides, each with a crest that means nothing.
        const bw = Math.max(18, Math.min(w * 0.04, G.R * 0.2)), count = Math.max(1, Math.floor((G.cx - G.R * 1.5) / (bw * 1.9)));
        // With no room at the sides (an upright phone) they hang in a row across the top, behind the roof.
        const across = G.cx - G.R * 1.5 < bw * 1.9 ? Math.floor((w - bw) / (bw * 2.2) / 2) : 0;
        for (let i = 0; i < Math.max(count, across); i++) {
            for (const side of [-1, 1]) {
                const top = h * (0.04 + 0.03 * ((i + (side > 0 ? 1 : 0)) % 2));
                const x = across ? G.cx + side * (i + 0.5) * bw * 2.2 - bw / 2 : G.cx + side * (G.R * 1.55 + i * bw * 1.9) - bw / 2, tall = (across ? G.roof.y + G.roof.h * 0.7 : G.cy - G.ry * 3) - top;
                ctx.fillStyle = CLOTH[(i * 2 + (side > 0 ? 1 : 0)) % 8];
                ctx.strokeStyle = INK;
                ctx.lineWidth = 1.4;
                ctx.fillRect(x, top, bw, tall);
                ctx.strokeRect(x, top, bw, tall);
                ctx.fillStyle = '#eadcbd';
                for (let k = 0; k < 4; k++) {
                    const y = top + tall * (0.14 + k * 0.22), r = bw * 0.28, kind = (i + k + (side > 0 ? 2 : 0)) % 4;
                    ctx.beginPath();
                    if (kind === 0) ctx.arc(x + bw / 2, y, r, 0, 7);
                    else if (kind === 1) ctx.rect(x + bw / 2 - r, y - r * 0.3, r * 2, r * 0.6);
                    else if (kind === 2) { ctx.moveTo(x + bw / 2, y - r); ctx.lineTo(x + bw / 2 + r, y + r * 0.8); ctx.lineTo(x + bw / 2 - r, y + r * 0.8); } else { ctx.arc(x + bw / 2, y, r, Math.PI, 0); ctx.arc(x + bw / 2, y + r * 0.2, r * 0.55, 0, Math.PI, true); }
                    ctx.fill();
                }
            }
        }

        // The crowd, row on row, the far rows smaller: a robe, a head, a cap of hair.
        const rows = Math.max(4, Math.round(7 * Math.min(1, 0.5 + density * 0.5))), floor = G.cy - G.ry * 1.5, far = Math.max(h * 0.2, G.roof.y + G.roof.h * 0.6);
        for (let row = rows - 1; row >= 0; row--) {
            const q = row / (rows - 1), y = floor + (far - floor) * q, size = G.s * (0.2 - 0.07 * q), step = size * 1.5;
            for (let x = ((row % 2) * step) / 2 - step; x < w + step; x += step) {
                const jx = x + (random() - 0.5) * step * 0.3, jy = y + (random() - 0.5) * size * 0.25;
                ctx.fillStyle = CLOTH[(random() * CLOTH.length) | 0];
                ctx.strokeStyle = INK;
                ctx.lineWidth = Math.max(0.8, size * 0.07);
                ctx.beginPath();
                ctx.roundRect(jx - size * 0.62, jy - size * 0.1, size * 1.24, size * 1.2, size * 0.4);
                ctx.fill(); ctx.stroke();
                ctx.fillStyle = SKIN[(random() * 4) | 0];
                ctx.beginPath(); ctx.arc(jx, jy - size * 0.42, size * 0.4, 0, 7); ctx.fill(); ctx.stroke();
                ctx.fillStyle = random() < 0.12 ? '#b9b2a6' : INK;
                ctx.beginPath(); ctx.arc(jx, jy - size * 0.5, size * 0.4, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
            }
            // Haze between the rows, so the far ones sink into the wash.
            ctx.fillStyle = evening ? `rgba(16, 26, 52, ${0.1 + q * 0.12})` : `rgba(234, 220, 189, ${0.05 + q * 0.07})`;
            ctx.fillRect(0, 0, w, y + size);
        }

        // The hanging roof: a shrine's gable, a purple curtain, a tassel at each corner.
        const roof = G.roof, rx = G.cx - roof.w / 2;
        ctx.strokeStyle = INK;
        ctx.lineWidth = Math.max(1.5, G.s * 0.025);
        ctx.fillStyle = '#3a2d26';
        ctx.beginPath();
        ctx.moveTo(rx - roof.w * 0.06, roof.y + roof.h * 0.62);
        ctx.quadraticCurveTo(G.cx - roof.w * 0.25, roof.y + roof.h * 0.5, G.cx, roof.y);
        ctx.quadraticCurveTo(G.cx + roof.w * 0.25, roof.y + roof.h * 0.5, rx + roof.w * 1.06, roof.y + roof.h * 0.62);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(234, 220, 189, 0.22)';
        ctx.lineWidth = 1;
        for (let i = 1; i < 16; i++) { const q = i / 16; ctx.beginPath(); ctx.moveTo(G.cx + (q - 0.5) * roof.w * 0.2, roof.y + roof.h * 0.08); ctx.lineTo(rx + q * roof.w, roof.y + roof.h * 0.6); ctx.stroke(); }
        ctx.strokeStyle = INK;
        ctx.lineWidth = Math.max(1.5, G.s * 0.025);
        ctx.fillStyle = '#c2892a';
        ctx.fillRect(rx, roof.y + roof.h * 0.6, roof.w, roof.h * 0.1);
        ctx.strokeRect(rx, roof.y + roof.h * 0.6, roof.w, roof.h * 0.1);
        ctx.fillStyle = '#5a2f6e';
        ctx.fillRect(rx + roof.w * 0.01, roof.y + roof.h * 0.7, roof.w * 0.98, roof.h * 0.3);
        ctx.strokeRect(rx + roof.w * 0.01, roof.y + roof.h * 0.7, roof.w * 0.98, roof.h * 0.3);
        ctx.fillStyle = '#eadcbd';
        for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.arc(rx + roof.w * (0.08 + i * 0.14), roof.y + roof.h * 0.85, roof.h * 0.085, 0, 7); ctx.fill(); }
        // Green for spring and the east, red for summer, white for autumn, black for winter.
        for (const [q, color] of [[0.02, '#2f6b4a'], [0.3, '#1c1c22'], [0.7, '#d8cdb0'], [0.98, '#a3262a']]) {
            const tx = rx + roof.w * q, ty = roof.y + roof.h, long = roof.h * (q > 0.1 && q < 0.9 ? 0.5 : 0.75);
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(tx - roof.h * 0.07, ty); ctx.lineTo(tx + roof.h * 0.07, ty); ctx.lineTo(tx + roof.h * 0.11, ty + long); ctx.lineTo(tx - roof.h * 0.11, ty + long);
            ctx.closePath();
            ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#c2892a';
            ctx.beginPath(); ctx.arc(tx, ty, roof.h * 0.08, 0, 7); ctx.fill(); ctx.stroke();
        }

        // The platform: packed clay, bales let into its face, and the ring on top.
        const P = G.platform;
        ctx.fillStyle = '#b98a4e';
        ctx.beginPath();
        ctx.moveTo(G.cx - P.rx, G.cy);
        ctx.lineTo(G.cx - P.rx * 1.1, G.cy + P.drop);
        ctx.quadraticCurveTo(G.cx, G.cy + P.drop + P.ry * 1.5, G.cx + P.rx * 1.1, G.cy + P.drop);
        ctx.lineTo(G.cx + P.rx, G.cy);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(42, 33, 28, 0.35)';
        ctx.lineWidth = 1;
        for (let i = 1; i < 14; i++) { const q = i / 14 - 0.5; ctx.beginPath(); ctx.moveTo(G.cx + q * P.rx * 1.9, G.cy + P.ry * (1 - q * q * 4) * 0.98); ctx.lineTo(G.cx + q * P.rx * 2.1, G.cy + P.drop + P.ry * 0.7 * (1 - q * q * 4)); ctx.stroke(); }
        ctx.strokeStyle = INK;
        ctx.lineWidth = Math.max(1.5, G.s * 0.025);
        ctx.fillStyle = '#d9b274';
        ctx.beginPath(); ctx.ellipse(G.cx, G.cy, P.rx, P.ry, 0, 0, 7); ctx.fill(); ctx.stroke();
        // The bales: a rope of straw, knotted.
        ctx.strokeStyle = INK;
        ctx.lineWidth = G.R * 0.06;
        ctx.beginPath(); ctx.ellipse(G.cx, G.cy, G.R * 1.03, G.ry, 0, 0, 7); ctx.stroke();
        ctx.strokeStyle = '#ead9a8';
        ctx.lineWidth = G.R * 0.04;
        ctx.setLineDash([G.R * 0.11, G.R * 0.02]);
        ctx.beginPath(); ctx.ellipse(G.cx, G.cy, G.R * 1.03, G.ry, 0, 0, 7); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#f4ecd8';
        for (const side of [-1, 1]) ctx.fillRect(G.cx + side * G.R * 0.2 - G.R * 0.012, G.cy - G.ry * 0.3, G.R * 0.024, G.ry * 0.6);

        // Paper: flecks and fibres over everything, and a darker edge to the sheet.
        ctx.globalAlpha = 0.05;
        for (let i = 0; i < 1400; i++) {
            ctx.fillStyle = random() < 0.5 ? '#000' : '#fff';
            ctx.fillRect(random() * w, random() * h, 1 + random() * 2.5, 1);
        }
        ctx.globalAlpha = 1;
        const edge = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.hypot(w, h) * 0.62);
        edge.addColorStop(0, 'rgba(60, 40, 20, 0)');
        edge.addColorStop(1, evening ? 'rgba(10, 14, 30, 0.5)' : 'rgba(60, 40, 20, 0.22)');
        ctx.fillStyle = edge;
        ctx.fillRect(0, 0, w, h);
        return canvas;
    }

    // ---- A wrestler ----------------------------------------------------------------

    // A limb: a thick line inside a thicker dark one.
    function limb(ctx, points, width, color) {
        const path = () => { ctx.beginPath(); points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); };
        ctx.lineCap = ctx.lineJoin = 'round';
        ctx.strokeStyle = INK;
        ctx.lineWidth = width + 0.045;
        path(); ctx.stroke();
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        path(); ctx.stroke();
    }

    // Draw one at (x, y) = where he stands, s px tall, facing `face` (1 right).
    // pose: { squat 0..1, lean (radians, forward), arms: 'down' | 'push' | 'thrust' | 'grip' | 'up' | 'fists' | 'salt' | 'cup',
    //         reach 0..1, lift 0..1 (the far leg raised for a stomp), stride (radians), spin (radians: falling over), blink }
    function rikishi(ctx, x, y, s, face, pose, w) {
        const skin = SKIN[w.skin % 4], belt = BELTS[w.belt % BELTS.length], bulk = 0.85 + 0.3 * w.weight;
        const squat = pose.squat || 0, hip = -0.36 + squat * 0.13, lean = (pose.lean || 0) + squat * 0.28;
        ctx.save();
        ctx.translate(x, y);
        if (pose.spin) ctx.rotate(pose.spin * face);
        ctx.scale(s * face, s);
        ctx.lineJoin = 'round';
        const walk = Math.sin(pose.stride || 0) * 0.07, spread = 0.13 + squat * 0.1;
        // Legs: hip, knee, foot. The far one first; `lift` swings it up and out for the stomp.
        const lift = pose.lift || 0;
        const leg = (side, raised) => {
            const fx = side * spread + (side > 0 ? walk : -walk) + (raised ? -0.3 * raised : 0), fy = raised ? -0.5 * raised : 0;
            const kx = side * (spread * 0.9 + squat * 0.1) + (raised ? -0.2 * raised : 0) + 0.04, ky = hip * 0.52 + fy * 0.8;
            limb(ctx, [[side * 0.05, hip], [kx, ky], [fx, fy - 0.03]], 0.15 * bulk, skin);
            limb(ctx, [[fx - 0.02, fy - 0.025], [fx + 0.1, fy - 0.02]], 0.07, skin);
        };
        leg(-1, lift);
        // The far arm.
        ctx.save();
        ctx.translate(0, hip);
        ctx.rotate(lean);
        ctx.translate(0, -hip);
        const sh = [0.06, hip - 0.4], reach = pose.reach || 0;
        const arm = (far) => {
            const k = far ? -1 : 1, a = pose.arms || 'down';
            let elbow, hand;
            if (a === 'push' || a === 'grip') { elbow = [sh[0] + 0.16, sh[1] + 0.12 + (a === 'grip' ? 0.08 : 0)]; hand = [sh[0] + 0.34, sh[1] + 0.06 + (a === 'grip' ? 0.2 : 0) + k * 0.03]; } else if (a === 'thrust') {
                const out = far ? 1 - reach : reach;
                elbow = [sh[0] + 0.1 + out * 0.1, sh[1] + 0.1 - out * 0.06]; hand = [sh[0] + 0.16 + out * 0.26, sh[1] - 0.02 - out * 0.06];
            } else if (a === 'up' || a === 'cup') { elbow = [sh[0] + 0.14 * k, sh[1] - 0.14]; hand = [sh[0] + 0.1 * k + (a === 'cup' ? 0.1 : 0), sh[1] - 0.34]; } else if (a === 'salt') { elbow = [sh[0] + 0.16, sh[1] - 0.02 - reach * 0.1]; hand = [sh[0] + 0.3, sh[1] - 0.06 - reach * 0.26]; } else if (a === 'fists') { elbow = [sh[0] + 0.12, sh[1] + 0.2]; hand = [sh[0] + 0.2 + k * 0.04, sh[1] + 0.42]; } else { elbow = [sh[0] - 0.02 + k * 0.03, sh[1] + 0.2]; hand = [sh[0] + 0.05 + k * 0.04, sh[1] + 0.38]; }
            limb(ctx, [sh, elbow, hand], 0.105 * bulk, skin);
            return hand;
        };
        arm(true);
        // The body: a great egg, and a belly ahead of it.
        ctx.fillStyle = skin;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 0.022;
        ctx.beginPath(); ctx.ellipse(0.02, hip - 0.2, 0.2 * bulk, 0.27, 0, 0, 7); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(0.1, hip - 0.13, 0.17 * bulk, 0.19, 0, -1.9, 1.9); ctx.fill(); ctx.stroke();
        ctx.fillStyle = skin;
        ctx.beginPath(); ctx.ellipse(0.04, hip - 0.18, 0.17 * bulk, 0.2, 0, 0, 7); ctx.fill();
        // The belt, its knot behind and its cords in front.
        ctx.fillStyle = belt;
        ctx.beginPath();
        ctx.ellipse(0.045, hip - 0.02, 0.215 * bulk, 0.085, 0, 0, 7);
        ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(-0.2 * bulk, hip - 0.05, 0.05, 0.06, 0, 0, 7); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = belt;
        ctx.lineWidth = 0.018;
        for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(0.1 + i * 0.035, hip + 0.05); ctx.lineTo(0.11 + i * 0.04, hip + 0.17); ctx.stroke(); }
        ctx.strokeStyle = INK;
        ctx.lineWidth = 0.022;
        // The head: jowl, brow, one eye, the topknot.
        const hx = 0.1, hy = hip - 0.56;
        ctx.fillStyle = skin;
        ctx.beginPath(); ctx.ellipse(hx, hy, 0.115, 0.125, 0, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = INK;
        ctx.beginPath(); ctx.ellipse(hx - 0.03, hy - 0.06, 0.115, 0.09, -0.25, Math.PI * 0.95, Math.PI * 1.95); ctx.fill();
        ctx.beginPath(); ctx.ellipse(hx - 0.06, hy - 0.15, 0.06, 0.028, -0.5, 0, 7); ctx.fill();
        ctx.lineWidth = 0.02;
        ctx.beginPath(); ctx.moveTo(hx + 0.03, hy - 0.03); ctx.lineTo(hx + 0.1, hy - 0.01 + (pose.fierce ? 0.02 : 0)); ctx.stroke();
        if (!pose.blink) { ctx.beginPath(); ctx.arc(hx + 0.065, hy + 0.012, 0.011, 0, 7); ctx.fill(); }
        ctx.beginPath(); ctx.moveTo(hx + 0.05, hy + 0.065); ctx.lineTo(hx + 0.1, hy + (pose.glad ? 0.05 : 0.07)); ctx.stroke();
        ctx.lineWidth = 0.022;
        const hand = arm(false);
        if (pose.arms === 'cup') cup(ctx, hand[0], hand[1] - 0.16, 0.2);
        ctx.restore();
        leg(1, 0);
        ctx.restore();
    }

    // ---- The referee, and small things -----------------------------------------------

    // The referee at (x, y), s px tall. point: -1 east, 1 west, 0 fan held level.
    function gyoji(ctx, x, y, s, point, robe) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(s, s);
        ctx.lineJoin = ctx.lineCap = 'round';
        ctx.strokeStyle = INK;
        ctx.lineWidth = 0.025;
        ctx.fillStyle = CLOTH[robe % 5];
        ctx.beginPath(); ctx.moveTo(-0.16, -0.72); ctx.lineTo(0.16, -0.72); ctx.lineTo(0.27, 0); ctx.lineTo(-0.27, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#eadcbd';
        for (const [dx, dy] of [[-0.1, -0.5], [0.08, -0.38], [-0.04, -0.2], [0.14, -0.14], [-0.16, -0.08]]) { ctx.beginPath(); ctx.arc(dx, dy, 0.03, 0, 7); ctx.fill(); }
        ctx.fillStyle = '#c2892a';
        ctx.fillRect(-0.19, -0.44, 0.38, 0.06);
        ctx.strokeRect(-0.19, -0.44, 0.38, 0.06);
        ctx.fillStyle = SKIN[0];
        ctx.beginPath(); ctx.arc(0, -0.84, 0.1, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = INK;
        ctx.beginPath(); ctx.moveTo(-0.1, -0.9); ctx.lineTo(0, -1.12); ctx.lineTo(0.1, -0.9); ctx.closePath(); ctx.fill();
        // The fan: a paddle of lacquer on a short handle.
        const a = point ? point * 0.95 : 0.15, ax = Math.sin(a) * 0.36, ay = -0.62 - Math.cos(a) * 0.2;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 0.09;
        ctx.beginPath(); ctx.moveTo(point * 0.12, -0.62); ctx.lineTo(ax, ay); ctx.stroke();
        ctx.strokeStyle = CLOTH[robe % 5];
        ctx.lineWidth = 0.05;
        ctx.beginPath(); ctx.moveTo(point * 0.12, -0.62); ctx.lineTo(ax, ay); ctx.stroke();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 0.025;
        ctx.fillStyle = '#a3262a';
        ctx.save();
        ctx.translate(ax + Math.sin(a) * 0.12, ay - Math.cos(a) * 0.12);
        ctx.rotate(a);
        ctx.beginPath(); ctx.ellipse(0, 0, 0.09, 0.13, 0, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#c2892a';
        ctx.beginPath(); ctx.arc(0, 0, 0.035, 0, 7); ctx.fill();
        ctx.restore();
        ctx.restore();
    }

    // The cup: more cup than anyone could want.
    function cup(ctx, x, y, s) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(s, s);
        ctx.fillStyle = '#d9a93a';
        ctx.strokeStyle = INK;
        ctx.lineWidth = 0.07;
        ctx.beginPath(); ctx.moveTo(-0.5, -0.6); ctx.quadraticCurveTo(-0.45, 0.25, 0, 0.3); ctx.quadraticCurveTo(0.45, 0.25, 0.5, -0.6); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillRect(-0.09, 0.3, 0.18, 0.3);
        ctx.strokeRect(-0.09, 0.3, 0.18, 0.3);
        ctx.fillRect(-0.34, 0.6, 0.68, 0.16);
        ctx.strokeRect(-0.34, 0.6, 0.68, 0.16);
        for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(side * 0.56, -0.25, 0.2, side > 0 ? -1.4 : Math.PI - 1.4 + 2.8 - Math.PI, side > 0 ? 1.4 : Math.PI + 1.4, false); ctx.stroke(); }
        ctx.fillStyle = 'rgba(255, 250, 220, 0.55)';
        ctx.fillRect(-0.3, -0.5, 0.1, 0.5);
        ctx.restore();
    }

    // A crowd's cushion in flight, turning.
    function cushion(ctx, x, y, s, turn, color) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(turn);
        ctx.fillStyle = CLOTH[color % 5];
        ctx.strokeStyle = INK;
        ctx.lineWidth = Math.max(1, s * 0.09);
        ctx.beginPath(); ctx.roundRect(-s / 2, -s * 0.32 * Math.abs(Math.cos(turn * 1.7)) - s * 0.08, s, s * 0.64 * Math.abs(Math.cos(turn * 1.7)) + s * 0.16, s * 0.12); ctx.fill(); ctx.stroke();
        ctx.restore();
    }

    // A puff of dust or a burst of salt: dots, in the print's way.
    function puff(ctx, x, y, r, age, color) {
        ctx.fillStyle = color;
        ctx.globalAlpha = Math.max(0, 1 - age);
        for (let i = 0; i < 7; i++) {
            const a = i * 0.9 + 0.4, d = r * (0.3 + age) * (0.6 + (i % 3) * 0.3);
            ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y - Math.abs(Math.sin(a)) * d * 0.7, r * 0.2 * (1 - age * 0.5), 0, 7); ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    // ---- Lettering -------------------------------------------------------------------

    const FONT = 'Georgia, "Iowan Old Style", "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif CJK JP", "Noto Serif JP", "MS Mincho", serif';

    // Can this device write Japanese? Asked once: two different characters,
    // drawn small, must come out as two different pictures (a font without
    // them draws the same empty box for both).
    function hasKanji() {
        const draw = ch => {
            const c = document.createElement('canvas');
            c.width = c.height = 24;
            const x = c.getContext('2d', { willReadFrequently: true });
            x.font = `20px ${FONT}`;
            x.textBaseline = 'top';
            x.fillText(ch, 2, 2);
            return x.getImageData(0, 0, 24, 24).data;
        };
        const a = draw('山'), b = draw('龍');
        let ink = 0, differ = 0;
        for (let i = 3; i < a.length; i += 4) { ink += a[i] > 0; differ += a[i] !== b[i]; }
        return ink > 10 && differ > 10;
    }

    // A cartouche written downwards: columns of [text, scale], the first on the right.
    function tate(ctx, x, y, columns, size, { color = '#a3262a' } = {}) {
        const pad = size * 0.5, gap = size * 0.35;
        const wide = columns.reduce((sum, [, k = 1]) => sum + size * k, 0) + gap * (columns.length - 1) + pad * 2;
        const tall = Math.max(...columns.map(([text, k = 1]) => [...text].length * size * k * 1.08)) + pad * 2;
        ctx.save();
        ctx.fillStyle = color;
        ctx.strokeStyle = INK;
        ctx.lineWidth = Math.max(1.2, size * 0.09);
        ctx.fillRect(x, y, wide, tall);
        ctx.strokeRect(x, y, wide, tall);
        ctx.strokeStyle = 'rgba(234, 220, 189, 0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 3, y + 3, wide - 6, tall - 6);
        ctx.fillStyle = '#f2e8cf';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        let cx = x + wide - pad;
        for (const [text, k = 1] of columns) {
            ctx.font = `600 ${size * k}px ${FONT}`;
            cx -= size * k / 2;
            [...text].forEach((ch, i) => ctx.fillText(ch, cx, y + pad + (i + 0.5) * size * k * 1.08));
            cx -= size * k / 2 + gap;
        }
        ctx.restore();
        return { x, y, w: wide, h: tall };
    }


    // A cartouche: a box of colour with cream letters, as a print's title is.
    function cartouche(ctx, x, y, lines, size, { color = '#a3262a', align = 'left', alpha = 1 } = {}) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.textBaseline = 'middle';
        let wide = 0;
        for (const [text, k = 1, weight = 600] of lines) { ctx.font = `${weight} ${size * k}px ${FONT}`; wide = Math.max(wide, ctx.measureText(text).width); }
        const pad = size * 0.55, tall = lines.reduce((sum, [, k = 1]) => sum + size * k * 1.3, 0) + pad * 1.2, bw = wide + pad * 2;
        const bx = align === 'right' ? x - bw : align === 'center' ? x - bw / 2 : x;
        ctx.fillStyle = color;
        ctx.strokeStyle = INK;
        ctx.lineWidth = Math.max(1.2, size * 0.09);
        ctx.fillRect(bx, y, bw, tall);
        ctx.strokeRect(bx, y, bw, tall);
        ctx.strokeStyle = 'rgba(234, 220, 189, 0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx + 3, y + 3, bw - 6, tall - 6);
        ctx.fillStyle = '#f2e8cf';
        ctx.textAlign = align === 'center' ? 'center' : 'left';
        let ty = y + pad * 0.6;
        for (const [text, k = 1, weight = 600] of lines) {
            ctx.font = `${weight} ${size * k}px ${FONT}`;
            ctx.fillText(text, align === 'center' ? x : bx + pad, ty + size * k * 0.65);
            ty += size * k * 1.3;
        }
        ctx.restore();
        return { x: bx, y, w: bw, h: tall };
    }

    // A record as it is kept: a white disc for a win, a black one for a loss.
    function marks(ctx, x, y, text, r, max = 15) {
        ctx.lineWidth = Math.max(0.8, r * 0.3);
        ctx.strokeStyle = INK;
        for (let i = 0; i < Math.min(text.length, max); i++) {
            ctx.fillStyle = text[i] === 'W' ? '#f6efdc' : INK;
            ctx.beginPath(); ctx.arc(x + i * r * 2.5 + r, y, r, 0, 7); ctx.fill(); ctx.stroke();
        }
    }

    return { INK, SKIN, BELTS, CLOTH, FONT, hasKanji, tate, backdrop, rikishi, gyoji, cup, cushion, puff, cartouche, marks };
})();
