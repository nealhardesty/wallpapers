// Koi Pond art: every sprite and cached layer, drawn in code once (per
// resize, or per fish when it's born). Nothing here runs per frame.
//
// A koi sprite is the fish laid out straight, tail end (the caudal
// peduncle) at x = 0 and nose at x = length, its pattern clipped to the
// body's silhouette. The manager bends it along a swimming spine by drawing
// it in slices.

const KoiArt = (() => {
    'use strict';

    const canvas = (w, h) => {
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.ceil(w));
        c.height = Math.max(1, Math.ceil(h));
        return c;
    };

    // An irregular rounded blob around (cx, cy).
    function blob(ctx, cx, cy, rx, ry, random, angle = 0) {
        const n = 11, pts = [];
        for (let k = 0; k < n; k++) {
            const a = k / n * Math.PI * 2, j = 0.72 + random() * 0.5;
            const x = Math.cos(a) * rx * j, y = Math.sin(a) * ry * j;
            pts.push([cx + x * Math.cos(angle) - y * Math.sin(angle), cy + x * Math.sin(angle) + y * Math.cos(angle)]);
        }
        const mid = k => [(pts[k % n][0] + pts[(k + 1) % n][0]) / 2, (pts[k % n][1] + pts[(k + 1) % n][1]) / 2];
        ctx.beginPath();
        ctx.moveTo(...mid(0));
        for (let k = 1; k <= n; k++) ctx.quadraticCurveTo(...pts[k % n], ...mid(k));
        ctx.closePath();
        ctx.fill();
    }

    // Half the body's width at u (0 = peduncle, 1 = nose), as a share of
    // the widest point: a slim wrist, a full chest, a blunt rounded head.
    function profile(u) {
        if (u < 0.68) return 0.2 + 0.8 * Math.pow(Math.sin(u / 0.68 * Math.PI / 2), 1.15);
        const t = (u - 0.68) / 0.32;
        return Math.pow(Math.max(0, 1 - t * t), 0.55);
    }

    function silhouette(length, width) {
        const path = new Path2D(), n = 48;
        for (let k = 0; k <= n; k++) {
            const u = k / n;
            const x = u * length, y = width / 2 - profile(u) * width / 2;
            k ? path.lineTo(x, y) : path.moveTo(x, y);
        }
        for (let k = n; k >= 0; k--) {
            const u = k / n;
            path.lineTo(u * length, width / 2 + profile(u) * width / 2);
        }
        path.closePath();
        return path;
    }

    const RED = ['#d8361e', '#cf2f1c', '#e2481f', '#c9341f'];
    const WHITE = '#f5f0e6';
    const SUMI = '#1b191c';

    // Each variety paints its pattern over the whole sprite; the silhouette
    // clips it. L is the body length, W its width, cy the midline.
    const VARIETIES = {
        kohaku: {
            fin: [250, 244, 236],
            paint(ctx, L, W, random) {
                ctx.fillStyle = WHITE;
                ctx.fillRect(0, 0, L, W);
                ctx.fillStyle = RED[Math.floor(random() * RED.length)];
                if (random() < 0.15) {   // tancho: one red crown on the head
                    blob(ctx, L * 0.86, W / 2, W * 0.2, W * 0.2, random);
                    return;
                }
                blob(ctx, L * (0.8 + random() * 0.04), W / 2 + (random() - 0.5) * W * 0.15, L * 0.08, W * 0.36, random);
                let u = 0.66 - random() * 0.06;
                while (u > 0.18) {
                    const size = 0.07 + random() * 0.08;
                    blob(ctx, L * u, W / 2 + (random() - 0.5) * W * 0.45, L * size, W * (0.28 + random() * 0.26), random, (random() - 0.5) * 0.9);
                    if (random() < 0.5) blob(ctx, L * (u - size), W / 2 + (random() - 0.5) * W * 0.5, L * size * 0.7, W * 0.25, random);
                    u -= size * 2 + 0.05 + random() * 0.08;
                }
            },
        },
        sanke: {
            fin: [248, 242, 234],
            paint(ctx, L, W, random) {
                VARIETIES.kohaku.paint(ctx, L, W, random);
                ctx.fillStyle = SUMI;
                const n = 3 + Math.floor(random() * 4);
                for (let k = 0; k < n; k++) blob(ctx, L * (0.2 + random() * 0.5), W / 2 + (random() - 0.5) * W * 0.7, L * (0.025 + random() * 0.04), W * (0.1 + random() * 0.14), random);
            },
        },
        showa: {
            fin: [235, 230, 222],
            paint(ctx, L, W, random) {
                ctx.fillStyle = SUMI;
                ctx.fillRect(0, 0, L, W);
                ctx.fillStyle = RED[Math.floor(random() * RED.length)];
                for (let u = 0.86; u > 0.2; u -= 0.16 + random() * 0.1) blob(ctx, L * u, W / 2 + (random() - 0.5) * W * 0.4, L * (0.07 + random() * 0.06), W * (0.35 + random() * 0.3), random, (random() - 0.5) * 0.8);
                ctx.fillStyle = WHITE;
                for (let k = 0; k < 3; k++) blob(ctx, L * (0.15 + random() * 0.6), W / 2 + (random() - 0.5) * W * 0.8, L * (0.04 + random() * 0.05), W * (0.15 + random() * 0.2), random);
                // The black that wraps the head in a showa.
                ctx.fillStyle = SUMI;
                blob(ctx, L * 0.93, W / 2 + (random() - 0.5) * W * 0.3, L * 0.05, W * 0.18, random, 0.6);
            },
        },
        ogon: {
            fin: [255, 226, 150],
            paint(ctx, L, W, random) {
                const platinum = random() < 0.35;
                const sheen = ctx.createLinearGradient(0, 0, 0, W);
                const [edge, mid, top] = platinum ? ['#a9aaa2', '#dcdcd4', '#ffffff'] : ['#b47515', '#e9ad35', '#ffe7a0'];
                sheen.addColorStop(0, edge); sheen.addColorStop(0.35, mid); sheen.addColorStop(0.5, top); sheen.addColorStop(0.65, mid); sheen.addColorStop(1, edge);
                ctx.fillStyle = sheen;
                ctx.fillRect(0, 0, L, W);
                scales(ctx, L, W, platinum ? 'rgba(120, 120, 110, 0.2)' : 'rgba(150, 90, 10, 0.22)', 'rgba(255, 255, 240, 0.12)');
            },
        },
        utsuri: {
            fin: [230, 224, 214],
            paint(ctx, L, W, random) {
                ctx.fillStyle = SUMI;
                ctx.fillRect(0, 0, L, W);
                const colour = random() < 0.55 ? WHITE : random() < 0.5 ? '#d8441f' : '#ebc03a';
                ctx.fillStyle = colour;
                for (let u = 0.88; u > 0.12; u -= 0.12 + random() * 0.08) {
                    const side = random() < 0.5 ? -1 : 1;
                    blob(ctx, L * u, W / 2 + side * W * (0.1 + random() * 0.3), L * (0.06 + random() * 0.06), W * (0.3 + random() * 0.25), random, (random() - 0.5) * 1.2);
                }
            },
        },
        asagi: {
            fin: [240, 150, 110],
            paint(ctx, L, W, random) {
                const back = ctx.createLinearGradient(0, 0, 0, W);
                back.addColorStop(0, '#d7562c'); back.addColorStop(0.16, '#8a8f98'); back.addColorStop(0.3, '#5f84a1');
                back.addColorStop(0.7, '#5f84a1'); back.addColorStop(0.84, '#8a8f98'); back.addColorStop(1, '#d7562c');
                ctx.fillStyle = back;
                ctx.fillRect(0, 0, L, W);
                scales(ctx, L, W, 'rgba(25, 45, 70, 0.45)', 'rgba(200, 225, 240, 0.18)');
                // A pale head with red cheeks.
                const head = ctx.createLinearGradient(L * 0.75, 0, L, 0);
                head.addColorStop(0, 'rgba(214, 226, 232, 0)');
                head.addColorStop(0.35, 'rgba(214, 226, 232, 0.95)');
                ctx.fillStyle = head;
                ctx.fillRect(L * 0.75, 0, L * 0.25, W);
                ctx.fillStyle = 'rgba(220, 80, 40, 0.6)';
                blob(ctx, L * 0.84, W * 0.08, L * 0.06, W * 0.12, random);
                blob(ctx, L * 0.84, W * 0.92, L * 0.06, W * 0.12, random);
            },
        },
    };

    // Rows of scale edges, reticulated: each scale a dark crescent with a
    // light centre, half a scale offset per row.
    function scales(ctx, L, W, edge, light, glints = true) {
        const s = W * 0.13;
        ctx.lineWidth = Math.max(0.6, s * 0.16);
        for (let row = 0, y = s * 0.3; y < W; y += s * 0.82, row++) {
            for (let x = (row % 2) * s / 2; x < L * 0.82; x += s) {
                ctx.strokeStyle = edge;
                ctx.beginPath();
                ctx.arc(x, y, s * 0.55, -Math.PI / 2, Math.PI / 2);
                ctx.stroke();
                if (!glints) continue;
                ctx.fillStyle = light;
                ctx.beginPath();
                ctx.arc(x + s * 0.15, y, s * 0.14, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    // A whole koi: the bent body's sprite, plus its fin colour.
    function koi(variety, length, width, dpr, random) {
        const kind = VARIETIES[variety] || VARIETIES.kohaku;
        const c = canvas(length * dpr, width * dpr), ctx = c.getContext('2d');
        ctx.scale(dpr, dpr);
        const body = silhouette(length, width);
        ctx.save();
        ctx.clip(body);
        kind.paint(ctx, length, width, random);
        if (variety !== 'ogon' && variety !== 'asagi') scales(ctx, length, width, 'rgba(0, 0, 0, 0.05)', null, false);
        // Round the body: shaded flanks, a gleam along the spine.
        const round = ctx.createLinearGradient(0, 0, 0, width);
        round.addColorStop(0, 'rgba(10, 20, 25, 0.5)');
        round.addColorStop(0.22, 'rgba(10, 20, 25, 0.06)');
        round.addColorStop(0.44, 'rgba(255, 255, 255, 0.16)');
        round.addColorStop(0.56, 'rgba(255, 255, 255, 0.16)');
        round.addColorStop(0.78, 'rgba(10, 20, 25, 0.06)');
        round.addColorStop(1, 'rgba(10, 20, 25, 0.5)');
        ctx.fillStyle = round;
        ctx.fillRect(0, 0, length, width);
        const tail = ctx.createLinearGradient(0, 0, length * 0.35, 0);
        tail.addColorStop(0, 'rgba(10, 30, 35, 0.25)');
        tail.addColorStop(1, 'rgba(10, 30, 35, 0)');
        ctx.fillStyle = tail;
        ctx.fillRect(0, 0, length * 0.35, width);
        // Gill covers, eyes and nostrils.
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.16)';
        ctx.lineWidth = 0.8;
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.ellipse(length * 0.8, width / 2, width * 0.07, width * 0.42, 0, side < 0 ? Math.PI * 1.15 : Math.PI * 0.35, side < 0 ? Math.PI * 1.65 : Math.PI * 0.85);
            ctx.stroke();
            ctx.fillStyle = '#121014';
            ctx.beginPath();
            ctx.arc(length * 0.9, width / 2 + side * width * 0.3, width * 0.055, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.beginPath();
            ctx.arc(length * 0.905, width / 2 + side * width * 0.3 - width * 0.015, width * 0.018, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
            ctx.beginPath();
            ctx.arc(length * 0.965, width / 2 + side * width * 0.1, width * 0.02, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
        ctx.lineWidth = 0.7;
        ctx.stroke(body);
        return { sprite: c, fin: kind.fin };
    }

    // ---- The pond ------------------------------------------------------------------

    // The floor: a deep green-brown bed of pebbles, lit from above through
    // the water, darkening with depth towards the edges.
    function floor(w, h, dpr, random, winter) {
        const c = canvas(w * dpr, h * dpr), ctx = c.getContext('2d');
        ctx.scale(dpr, dpr);
        const bed = ctx.createRadialGradient(w * 0.42, h * 0.4, 0, w * 0.5, h * 0.5, Math.hypot(w, h) * 0.6);
        bed.addColorStop(0, winter ? '#3b5a5c' : '#4a6a4c');
        bed.addColorStop(1, winter ? '#1c2f33' : '#24362a');
        ctx.fillStyle = bed;
        ctx.fillRect(0, 0, w, h);
        // Silt and algae: big soft patches.
        for (let k = 0; k < 26; k++) {
            const x = random() * w, y = random() * h, r = 40 + random() * 140;
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            const tone = random() < 0.5 ? '120, 130, 80' : '40, 70, 40';
            g.addColorStop(0, `rgba(${tone}, ${0.12 + random() * 0.12})`);
            g.addColorStop(1, `rgba(${tone}, 0)`);
            ctx.fillStyle = g;
            ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }
        // Pebbles, each with a contact shadow and a lit top.
        const tones = [[132, 120, 100], [110, 108, 100], [150, 138, 112], [92, 86, 76], [125, 112, 95], [160, 150, 130]];
        const count = Math.round(w * h / 2600);
        for (let k = 0; k < count; k++) {
            const x = random() * w, y = random() * h;
            const r = 1.5 + Math.pow(random(), 2.6) * 10;
            const a = random() * Math.PI, sq = 0.6 + random() * 0.4;
            const [cr, cg, cb] = tones[Math.floor(random() * tones.length)];
            ctx.fillStyle = 'rgba(8, 18, 12, 0.22)';
            ctx.beginPath();
            ctx.ellipse(x + r * 0.25, y + r * 0.3, r * 1.05, r * sq * 1.05, a, 0, Math.PI * 2);
            ctx.fill();
            const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r * 1.1);
            g.addColorStop(0, `rgb(${cr + 14}, ${cg + 14}, ${cb + 10})`);
            g.addColorStop(1, `rgb(${cr - 34}, ${cg - 30}, ${cb - 30})`);
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.ellipse(x, y, r, r * sq, a, 0, Math.PI * 2);
            ctx.fill();
        }
        // The water over it all: green-teal, deeper at the edges.
        ctx.fillStyle = winter ? 'rgba(20, 52, 64, 0.7)' : 'rgba(12, 58, 56, 0.68)';
        ctx.fillRect(0, 0, w, h);
        const depth = ctx.createRadialGradient(w * 0.45, h * 0.42, Math.min(w, h) * 0.2, w * 0.5, h * 0.5, Math.hypot(w, h) * 0.62);
        depth.addColorStop(0, 'rgba(60, 140, 120, 0.12)');
        depth.addColorStop(1, 'rgba(0, 12, 16, 0.6)');
        ctx.fillStyle = depth;
        ctx.fillRect(0, 0, w, h);
        return c;
    }

    // Light on the surface: a sky sheen from the upper left.
    function surface(w, h, dpr) {
        const c = canvas(w * dpr, h * dpr), ctx = c.getContext('2d');
        ctx.scale(dpr, dpr);
        const sheen = ctx.createLinearGradient(0, 0, w * 0.7, h * 0.9);
        sheen.addColorStop(0, 'rgba(210, 240, 235, 0.13)');
        sheen.addColorStop(0.5, 'rgba(210, 240, 235, 0.02)');
        sheen.addColorStop(1, 'rgba(0, 0, 0, 0.08)');
        ctx.fillStyle = sheen;
        ctx.fillRect(0, 0, w, h);
        return c;
    }

    // Thin ice creeping in from the edges, with a few cracks.
    function ice(w, h, dpr, random) {
        const c = canvas(w * dpr, h * dpr), ctx = c.getContext('2d');
        ctx.scale(dpr, dpr);
        const edge = Math.min(w, h) * 0.1;
        for (let k = 0; k < (w + h) * 0.9; k++) {
            const side = Math.floor(random() * 4), t = random();
            const d = Math.pow(random(), 2.2) * edge;
            const x = side === 0 ? d : side === 1 ? w - d : t * w;
            const y = side === 2 ? d : side === 3 ? h - d : t * h;
            const r = (edge - d) * (0.1 + random() * 0.25) + 3;
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, 'rgba(225, 240, 248, 0.07)');
            g.addColorStop(1, 'rgba(225, 240, 248, 0)');
            ctx.fillStyle = g;
            ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }
        ctx.strokeStyle = 'rgba(240, 250, 255, 0.22)';
        ctx.lineWidth = 0.6;
        for (let k = 0; k < 14; k++) {
            const side = Math.floor(random() * 4), t = random();
            let x = side === 0 ? 0 : side === 1 ? w : t * w, y = side === 2 ? 0 : side === 3 ? h : t * h;
            const inward = [[1, 0], [-1, 0], [0, 1], [0, -1]][side];
            ctx.beginPath();
            ctx.moveTo(x, y);
            for (let s = 0; s < 6; s++) {
                x += inward[0] * edge * 0.1 + (random() - 0.5) * edge * 0.08;
                y += inward[1] * edge * 0.1 + (random() - 0.5) * edge * 0.08;
                ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
        return c;
    }

    // A lily pad of radius R, with its notch at angle 0.
    function pad(R, dpr, random, autumn) {
        const size = R * 2 + 6, c = canvas(size * dpr, size * dpr), ctx = c.getContext('2d');
        ctx.scale(dpr, dpr);
        ctx.translate(size / 2, size / 2);
        const notch = 0.2 + random() * 0.1;
        const path = new Path2D();
        path.moveTo(0, 0);
        path.arc(0, 0, R, notch, Math.PI * 2 - notch);
        path.closePath();
        const tint = autumn && random() < 0.5 ? ['#8a8a3a', '#6b6a2a'] : random() < 0.25 ? ['#6f9a3c', '#3e6b28'] : ['#5f8f3a', '#335f24'];
        const fill = ctx.createRadialGradient(-R * 0.3, -R * 0.3, R * 0.1, 0, 0, R);
        fill.addColorStop(0, tint[0]);
        fill.addColorStop(1, tint[1]);
        // The red underside shows at the rim.
        ctx.fillStyle = '#6e3a2c';
        ctx.save();
        ctx.translate(0.8, 1);
        ctx.fill(path);
        ctx.restore();
        ctx.fillStyle = fill;
        ctx.fill(path);
        ctx.save();
        ctx.clip(path);
        // Veins from the centre, and some yellowing.
        ctx.strokeStyle = 'rgba(190, 220, 130, 0.28)';
        ctx.lineWidth = Math.max(0.6, R * 0.025);
        for (let k = 0; k < 18; k++) {
            const a = notch + (k + 0.5) / 18 * (Math.PI * 2 - notch * 2);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(Math.cos(a + 0.08) * R * 0.5, Math.sin(a + 0.08) * R * 0.5, Math.cos(a) * R, Math.sin(a) * R);
            ctx.stroke();
        }
        ctx.fillStyle = autumn ? 'rgba(200, 160, 60, 0.35)' : 'rgba(200, 190, 90, 0.22)';
        for (let k = 0; k < 3; k++) {
            const a = random() * 6.3;
            blob(ctx, Math.cos(a) * R * 0.85, Math.sin(a) * R * 0.85, R * 0.25, R * 0.18, random, a);
        }
        const gloss = ctx.createRadialGradient(-R * 0.4, -R * 0.45, 0, -R * 0.4, -R * 0.45, R * 0.9);
        gloss.addColorStop(0, 'rgba(255, 255, 240, 0.22)');
        gloss.addColorStop(1, 'rgba(255, 255, 240, 0)');
        ctx.fillStyle = gloss;
        ctx.fillRect(-R, -R, R * 2, R * 2);
        ctx.restore();
        ctx.strokeStyle = 'rgba(20, 45, 20, 0.45)';
        ctx.lineWidth = 1;
        ctx.stroke(path);
        // A bead of water or two.
        for (let k = 0; k < Math.floor(random() * 3); k++) {
            const a = random() * 6.3, d = random() * R * 0.6, r = 1.2 + random() * 1.8;
            const x = Math.cos(a) * d, y = Math.sin(a) * d;
            ctx.fillStyle = 'rgba(20, 50, 20, 0.35)';
            ctx.beginPath(); ctx.arc(x + r * 0.3, y + r * 0.3, r, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(210, 240, 220, 0.5)';
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.35, 0, Math.PI * 2); ctx.fill();
        }
        return c;
    }

    // A water lily seen from above: two rings of pointed petals round a gold heart.
    function flower(R, dpr, random) {
        const size = R * 2 + 4, c = canvas(size * dpr, size * dpr), ctx = c.getContext('2d');
        ctx.scale(dpr, dpr);
        ctx.translate(size / 2, size / 2);
        const white = random() < 0.35;
        const petalPath = (len, wid) => {
            const p = new Path2D();
            p.moveTo(0, 0);
            p.quadraticCurveTo(wid, -len * 0.5, 0, -len);
            p.quadraticCurveTo(-wid, -len * 0.5, 0, 0);
            return p;
        };
        const rings = [[R, R * 0.32, 10, 0], [R * 0.72, R * 0.28, 9, 0.3]];
        for (const [len, wid, n, turn] of rings) {
            const p = petalPath(len, wid);
            for (let k = 0; k < n; k++) {
                ctx.save();
                ctx.rotate(turn + k / n * Math.PI * 2 + (random() - 0.5) * 0.15);
                const g = ctx.createLinearGradient(0, 0, 0, -len);
                g.addColorStop(0, white ? '#f1ece0' : '#f6c2d6');
                g.addColorStop(1, white ? '#ffffff' : '#e97fa7');
                ctx.fillStyle = g;
                ctx.fill(p);
                ctx.strokeStyle = white ? 'rgba(150, 140, 120, 0.35)' : 'rgba(150, 60, 90, 0.35)';
                ctx.lineWidth = 0.5;
                ctx.stroke(p);
                ctx.restore();
            }
        }
        ctx.fillStyle = '#e8b830';
        ctx.beginPath(); ctx.arc(0, 0, R * 0.22, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffe48a';
        for (let k = 0; k < 12; k++) {
            const a = k / 12 * 6.28;
            ctx.beginPath(); ctx.arc(Math.cos(a) * R * 0.15, Math.sin(a) * R * 0.15, R * 0.04, 0, Math.PI * 2); ctx.fill();
        }
        return c;
    }

    // ---- Small things on the water ------------------------------------------------

    function sprite(size, dpr, draw) {
        const c = canvas(size * dpr, size * dpr), ctx = c.getContext('2d');
        ctx.scale(dpr, dpr);
        ctx.translate(size / 2, size / 2);
        draw(ctx);
        return c;
    }

    function petal(dpr, [edge, centre]) {
        return sprite(16, dpr, ctx => {
            ctx.scale(1.3, 1.3);
            const p = new Path2D();
            p.moveTo(0, 5);
            p.bezierCurveTo(4.5, 3, 4, -4, 1.2, -5);
            p.lineTo(0, -3.6);
            p.lineTo(-1.2, -5);
            p.bezierCurveTo(-4, -4, -4.5, 3, 0, 5);
            const g = ctx.createRadialGradient(0, 2, 0, 0, 0, 6);
            g.addColorStop(0, centre);
            g.addColorStop(1, edge);
            ctx.fillStyle = g;
            ctx.fill(p);
        });
    }

    function maple(dpr, [deep, bright]) {
        const R = 13;
        return sprite(R * 2.4, dpr, ctx => {
            const path = new Path2D();
            for (let k = 0; k <= 180; k++) {
                const u = k / 180, phi = -Math.PI * 0.8 + u * Math.PI * 1.6;
                const tri = 1 - Math.abs((5 * u) % 1 - 0.5) * 2;
                const r = R * (0.42 + 0.58 * Math.pow(tri, 0.9) * (1 - 0.25 * Math.abs(phi) / Math.PI)) * (1 + 0.05 * tri * Math.sin(k * 2.3));
                k ? path.lineTo(Math.sin(phi) * r, -Math.cos(phi) * r) : path.moveTo(Math.sin(phi) * r, -Math.cos(phi) * r);
            }
            path.closePath();
            const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
            g.addColorStop(0, bright);
            g.addColorStop(1, deep);
            ctx.fillStyle = g;
            ctx.fill(path);
            ctx.strokeStyle = 'rgba(60, 10, 0, 0.35)';
            ctx.lineWidth = 0.6;
            for (let k = 0; k < 5; k++) {
                const phi = -Math.PI * 0.8 + (k + 0.5) / 5 * Math.PI * 1.6;
                ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.sin(phi) * R * 0.8, -Math.cos(phi) * R * 0.8); ctx.stroke();
            }
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0.5, R * 0.9);
            ctx.strokeStyle = deep; ctx.lineWidth = 1; ctx.stroke();
        });
    }

    function ginkgo(dpr) {
        const R = 11;
        return sprite(R * 2.6, dpr, ctx => {
            const p = new Path2D();
            p.moveTo(0, R * 0.2);
            p.lineTo(-R * 0.95, -R * 0.55);
            p.quadraticCurveTo(-R * 0.5, -R * 1.15, -R * 0.08, -R * 0.82);
            p.lineTo(0, -R * 0.62);
            p.lineTo(R * 0.08, -R * 0.82);
            p.quadraticCurveTo(R * 0.5, -R * 1.15, R * 0.95, -R * 0.55);
            p.closePath();
            const g = ctx.createRadialGradient(0, R * 0.2, 0, 0, -R * 0.4, R);
            g.addColorStop(0, '#d9a520');
            g.addColorStop(1, '#f4d24a');
            ctx.fillStyle = g;
            ctx.fill(p);
            ctx.strokeStyle = 'rgba(140, 100, 10, 0.35)';
            ctx.lineWidth = 0.5;
            for (let k = -4; k <= 4; k++) { ctx.beginPath(); ctx.moveTo(0, R * 0.2); ctx.lineTo(k * R * 0.2, -R * 0.75); ctx.stroke(); }
            ctx.beginPath(); ctx.moveTo(0, R * 0.2); ctx.lineTo(0, R * 1.1);
            ctx.strokeStyle = '#b8891a'; ctx.lineWidth = 1; ctx.stroke();
        });
    }

    function pellet(dpr) {
        return sprite(8, dpr, ctx => {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.beginPath(); ctx.arc(0.6, 0.8, 2.4, 0, Math.PI * 2); ctx.fill();
            const g = ctx.createRadialGradient(-0.7, -0.7, 0, 0, 0, 2.4);
            g.addColorStop(0, '#c99a5a');
            g.addColorStop(1, '#7a4f22');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(0, 0, 2.3, 0, Math.PI * 2); ctx.fill();
        });
    }

    // A glint of sun on the surface: a soft dot with four rays.
    function glint(dpr) {
        return sprite(18, dpr, ctx => {
            const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 5);
            g.addColorStop(0, 'rgba(255, 255, 240, 0.9)');
            g.addColorStop(1, 'rgba(255, 255, 240, 0)');
            ctx.fillStyle = g;
            ctx.fillRect(-9, -9, 18, 18);
            ctx.strokeStyle = 'rgba(255, 255, 245, 0.55)';
            ctx.lineWidth = 0.8;
            ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.moveTo(0, -6); ctx.lineTo(0, 6); ctx.stroke();
        });
    }

    return { koi, floor, surface, ice, pad, flower, petal, maple, ginkgo, pellet, glint, profile, VARIETIES: Object.keys(VARIETIES) };
})();
