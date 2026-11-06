// The Cat vs. the Ornament: the cats, drawn in code. One rig for all of
// them: a skeleton in "cat units" (about 100 from nose to tail root),
// facing right with y down and the feet at the origin, blended between a
// handful of poses (sit, stand, crouch, loaf, curl, belly-up, rearing).
// The body is a chest, a haunch and the hull between them, outlined by a
// wider stroke of every part under the fill, so the union reads as one
// shape; coats are markings clipped to it. The face is drawn front-on (as
// a picture-book cat is), with eyes, lids and a mouth each cat wears its
// own way: Moofy's grin, Butters' love, Ras's scheme.

const CatArt = (() => {
    'use strict';

    const TAU = Math.PI * 2;
    const lerp = (a, b, t) => a + (b - a) * t;

    // ---- Coats ----------------------------------------------------------------------

    // base fur, shade (the far legs), outline, and what's on top: a belly,
    // white parts, tabby stripes, patches, a fluffy edge.
    const COATS = {
        'black-fluffy': { base: '#211e26', shade: '#16141a', outline: '#08070a', nose: '#4a3438', earIn: '#4c3438', whisker: 'rgba(235,235,245,0.55)',
            fluffy: true, ruff: true, tufts: true, sheen: 'rgba(120,120,160,0.16)' },
        'buff-tabby': { base: '#e2b57c', shade: '#c99a62', outline: '#80562f', belly: '#f4dfba', stripe: 'rgba(176,118,64,0.55)', tabby: 'soft',
            nose: '#e3958a', earIn: '#f0b4a4', whisker: 'rgba(255,250,240,0.8)', muzzle: '#f6e6c8' },
        holstein: { base: '#f6f3ee', shade: '#dcd8d2', outline: '#7c7a80', patches: ['#1f1d24'], patchShape: 'cow', nose: '#f0a2aa', earIn: '#f4b8c0',
            whisker: 'rgba(120,120,130,0.6)', headPatch: true },
        tuxedo: { base: '#202027', shade: '#15151a', outline: '#08080b', white: '#f6f4f0', bib: true, socks: true, muzzle: '#f6f4f0', blaze: true,
            nose: '#d88c96', earIn: '#4a3a40', whisker: 'rgba(240,240,248,0.75)', sheen: 'rgba(130,130,170,0.14)' },
        'grey-tabby': { base: '#9195a0', shade: '#787b86', outline: '#474a52', belly: '#ccd0d7', stripe: 'rgba(78,82,92,0.7)', tabby: 'mackerel', forehead: true,
            nose: '#d9949c', earIn: '#e8b0b6', whisker: 'rgba(250,250,255,0.75)', muzzle: '#d6d9df' },
        tortie: { base: '#231c1a', shade: '#171210', outline: '#0a0807', patches: ['#6e3c1e', '#8e5426', '#4a2a18'], patchShape: 'mottle', splitFace: '#7a4420',
            nose: '#3c2a26', earIn: '#4a3028', whisker: 'rgba(230,220,210,0.55)' },
        'grey-mottled': { base: '#85888f', shade: '#6c6f76', outline: '#3c3e44', belly: '#b9bbc0', patches: ['#5c5f66', '#9a9da3'], patchShape: 'mottle',
            stripe: 'rgba(80,82,90,0.55)', tabby: 'blotched', forehead: true, nose: '#cf8c92', earIn: '#d9a4aa', whisker: 'rgba(250,250,255,0.7)', muzzle: '#c3c5ca' },
        'orange-white': { base: '#e5893b', shade: '#c8702a', outline: '#874619', white: '#f8f1e6', bib: true, socks: true, muzzle: '#f8f1e6', belly: '#f8f1e6',
            stripe: 'rgba(176,92,34,0.7)', tabby: 'mackerel', forehead: true, nose: '#f0a090', earIn: '#f4b8a4', whisker: 'rgba(255,255,255,0.85)' },
        'blue-persian': { base: '#8c95aa', shade: '#737c90', outline: '#535b6c', belly: '#a6aec0', fluffy: true, ruff: true, flat: true,
            nose: '#6a7184', earIn: '#b2a0aa', whisker: 'rgba(230,234,244,0.6)', sheen: 'rgba(220,228,255,0.16)' },
    };

    // ---- Poses ------------------------------------------------------------------------

    // S shoulder, H hip, rc and rh the chest's and haunch's radii, N the
    // head; fp/hp the near and far front and hind paws; tail [angle, curl]
    // (the angle in canvas radians, the curl added per segment);
    // tailFront draws the tail over the body (wrapped round the feet);
    // haunch shows the sitting thigh; legs 0 tucks them away.
    const POSES = {
        stand:  { S: [22, -34], H: [-22, -34], rc: 15, rh: 14, N: [36, -50], hr: 0, legs: 1, haunch: 0,
                  fpn: [24, 0], fpf: [17, 0], hpn: [-18, 0], hpf: [-25, 0], tail: [-2.2, 0.55], tb: [-0.85, -0.15], tailFront: 0 },
        sit:    { S: [8, -40], H: [-11, -15], rc: 14.5, rh: 17, N: [12, -60], hr: 0, legs: 1, haunch: 1,
                  fpn: [13, 0], fpf: [5, 0], hpn: [6, 0], hpf: [-2, 0], tail: [-0.05, -0.16], tb: [-0.55, 0.82], tailFront: 1 },
        crouch: { S: [21, -16], H: [-20, -19], rc: 14, rh: 14.5, N: [36, -24], hr: 0, legs: 1, haunch: 0.4,
                  fpn: [33, 0], fpf: [27, 0], hpn: [-10, 0], hpf: [-16, 0], tail: [3.0, 0.12], tb: [-0.85, -0.1], tailFront: 0 },
        loaf:   { S: [15, -16], H: [-15, -16], rc: 16, rh: 16.5, N: [30, -30], hr: 0, legs: 0, haunch: 0,
                  fpn: [24, -1], fpf: [20, -1], hpn: [-12, 0], hpf: [-16, 0], tail: [0.05, -0.12], tb: [-0.5, 0.78], tailFront: 1 },
        curl:   { S: [9, -12], H: [-11, -13], rc: 13, rh: 14.5, N: [21, -11], hr: 0.55, legs: 0, haunch: 0,
                  fpn: [22, -1], fpf: [18, -1], hpn: [-8, 0], hpf: [-12, 0], tail: [0.1, -0.2], tb: [-0.5, 0.75], tailFront: 1 },
        belly:  { S: [21, -14], H: [-21, -14], rc: 15, rh: 15, N: [40, -13], hr: Math.PI, legs: 1, haunch: 0,
                  fpn: [27, -38], fpf: [19, -35], hpn: [-24, -36], hpf: [-16, -33], tail: [-3.1, -0.15], tb: [-0.9, 0], tailFront: 0 },
        rear:   { S: [3, -60], H: [-8, -21], rc: 13, rh: 15.5, N: [7, -78], hr: 0, legs: 1, haunch: 0.7,
                  fpn: [25, -94], fpf: [18, -90], hpn: [2, 0], hpf: [-7, 0], tail: [2.6, 0.35], tb: [-0.7, 0.45], tailFront: 0 },
    };
    const KEYS = ['S', 'H', 'N', 'fpn', 'fpf', 'hpn', 'hpf', 'tail', 'tb'];

    function copy(p) {
        const o = { ...p };
        for (const k of KEYS) o[k] = [...p[k]];
        return o;
    }

    // Ease `cur` toward the named pose by `t` (0–1), in place.
    function toward(cur, name, t) {
        const p = POSES[name] || POSES.sit;
        for (const k of KEYS) { cur[k][0] = lerp(cur[k][0], p[k][0], t); cur[k][1] = lerp(cur[k][1], p[k][1], t); }
        for (const k of ['rc', 'rh', 'hr', 'legs', 'haunch', 'tailFront']) cur[k] = lerp(cur[k], p[k], t);
        return cur;
    }

    // ---- Markings ----------------------------------------------------------------------

    // Each cat's own patches, placed once (seeded), along the body: t from
    // the hip (0) to the shoulder (1), v across (−1 the back, +1 the belly).
    function marks(cat, random) {
        const coat = COATS[cat.coat], out = [];
        if (coat.patches) {
            const n = coat.patchShape === 'cow' ? 5 : 14;
            for (let i = 0; i < n; i++) {
                out.push({ t: random() * 1.3 - 0.15, v: random() * 1.6 - 1, r: coat.patchShape === 'cow' ? 7 + random() * 8 : 3.5 + random() * 6,
                    sq: 0.6 + random() * 0.6, rot: random() * TAU, colour: coat.patches[Math.floor(random() * coat.patches.length)],
                    lobes: Array.from({ length: 5 }, () => 0.7 + random() * 0.5) });
            }
        }
        return out;
    }

    function make(cat, random) {
        return { cat, coat: COATS[cat.coat], marks: marks(cat, random), cow: random() < 0.5 ? -1 : 1, tailLen: cat.fluff > 0.8 ? 44 : 40 };
    }

    // ---- Drawing -------------------------------------------------------------------------

    const perp = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; };

    // The body's parts, as Path2Ds: chest, haunch, the hull between.
    function bodyParts(p, chunk) {
        const rc = p.rc * chunk, rh = p.rh * chunk, [nx, ny] = perp(p.H, p.S);
        const chest = new Path2D(); chest.ellipse(p.S[0], p.S[1], rc * 1.04, rc, 0, 0, TAU);
        const haunch = new Path2D(); haunch.ellipse(p.H[0], p.H[1], rh * (1 + p.haunch * 0.2), rh * (1 + p.haunch * 0.08), 0, 0, TAU);
        const hull = new Path2D();
        hull.moveTo(p.H[0] + nx * rh * 0.94, p.H[1] + ny * rh * 0.94);
        hull.lineTo(p.S[0] + nx * rc * 0.94, p.S[1] + ny * rc * 0.94);
        hull.lineTo(p.S[0] - nx * rc * 0.94, p.S[1] - ny * rc * 0.94);
        hull.lineTo(p.H[0] - nx * rh * 0.94, p.H[1] - ny * rh * 0.94);
        hull.closePath();
        const all = new Path2D(); all.addPath(chest); all.addPath(haunch); all.addPath(hull);
        return { chest, haunch, hull, all, rc, rh, n: [nx, ny] };
    }

    // The tail: a tapered polygon along a curve from its root, its tip
    // swinging by `swish`.
    function tailPath(p, rig, base, swish, puff, chunk) {
        const [a0, curl] = p.tail, L = rig.tailLen;
        const pts = [base];
        let a = a0, x = base[0], y = base[1];
        for (let i = 1; i <= 8; i++) {
            const s = i / 8;
            a += (curl + swish * s * 0.9) / 8 * 3;
            x += Math.cos(a) * L / 8; y += Math.sin(a) * L / 8;
            pts.push([x, y]);
        }
        const fluff = 1 + rig.cat.fluff * 0.55 + puff * 0.9;
        const w = s => (3.6 - 1.6 * s) * fluff * Math.min(1.25, chunk);
        const left = [], right = [];
        pts.forEach((q, i) => {
            const nb = pts[Math.min(pts.length - 1, i + 1)], pv = pts[Math.max(0, i - 1)];
            const dx = nb[0] - pv[0], dy = nb[1] - pv[1], l = Math.hypot(dx, dy) || 1, ww = w(i / 8);
            left.push([q[0] - dy / l * ww, q[1] + dx / l * ww]);
            right.push([q[0] + dy / l * ww, q[1] - dx / l * ww]);
        });
        const path = new Path2D();
        path.moveTo(left[0][0], left[0][1]);
        for (const q of left) path.lineTo(q[0], q[1]);
        const tip = pts[pts.length - 1], end = w(1);
        path.arc(tip[0], tip[1], end, Math.atan2(left[8][1] - tip[1], left[8][0] - tip[0]), Math.atan2(right[8][1] - tip[1], right[8][0] - tip[0]), true);
        for (let i = right.length - 1; i >= 0; i--) path.lineTo(right[i][0], right[i][1]);
        path.closePath();
        return { path, tip };
    }

    function leg(g, from, to, width, fur, outline, paw, bend) {
        const mx = (from[0] + to[0]) / 2 + bend, my = (from[1] + to[1]) / 2;
        const path = new Path2D();
        path.moveTo(from[0], from[1]);
        path.quadraticCurveTo(mx, my, to[0], to[1] - width * 0.35);
        g.lineCap = 'round';
        g.strokeStyle = outline; g.lineWidth = width + 2.2; g.stroke(path);
        g.strokeStyle = fur; g.lineWidth = width; g.stroke(path);
        // The paw.
        g.fillStyle = outline;
        g.beginPath(); g.ellipse(to[0] + width * 0.18, to[1] - width * 0.36, width * 0.72 + 1.1, width * 0.48 + 1.1, 0, 0, TAU); g.fill();
        g.fillStyle = paw || fur;
        g.beginPath(); g.ellipse(to[0] + width * 0.18, to[1] - width * 0.36, width * 0.72, width * 0.48, 0, 0, TAU); g.fill();
    }

    // A white sock: the lower half of the leg repainted.
    function sock(g, from, to, width, white) {
        const k = 0.55, sx = lerp(from[0], to[0], k), sy = lerp(from[1], to[1], k);
        g.strokeStyle = white; g.lineWidth = width; g.lineCap = 'round';
        g.beginPath(); g.moveTo(sx, sy); g.lineTo(to[0], to[1] - width * 0.35); g.stroke();
        g.fillStyle = white;
        g.beginPath(); g.ellipse(to[0] + width * 0.18, to[1] - width * 0.36, width * 0.72, width * 0.48, 0, 0, TAU); g.fill();
    }

    // Draw a cat. `s`: { x, y, u (px per unit), dir, pose, face, gait,
    // moving, swish, puff, breath, shade (0 lit … 1 deep under the tree),
    // t }; the face: { open, look:[x,y], lids, mouth, ears, blink, glow }.
    function draw(g, rig, s) {
        const cat = rig.cat, coat = rig.coat, p = s.pose, chunk = cat.chunk;
        const k = s.u * cat.size;
        g.save();
        g.translate(s.x, s.y);
        g.scale(s.dir * k, k);
        // The gait: paws swing and lift, the body bobs.
        const step = s.moving ? Math.sin(s.gait) : 0, lift = s.moving ? Math.max(0, Math.cos(s.gait)) : 0;
        const bob = s.moving ? Math.abs(Math.sin(s.gait)) * (s.run ? 2.6 : 1.2) : 0;
        const run = s.run ? 1.6 : 1;
        const paw = (q, phase) => [q[0] + phase * 7 * run * (s.moving ? 1 : 0), q[1] - (phase > 0 ? lift : Math.max(0, -Math.cos(s.gait))) * 4 * run * (s.moving ? 1 : 0)];
        const fpn = paw(p.fpn, step), fpf = paw(p.fpf, -step), hpn = paw(p.hpn, -step), hpf = paw(p.hpf, step);
        // A raised paw (a swat) replaces the near front paw.
        let reach = null;
        if (s.paw > 0.01) {
            const a = s.pawAim || [p.S[0] + 26, p.S[1] - 26];
            reach = [lerp(fpn[0], a[0], s.paw), lerp(fpn[1], a[1], s.paw)];
        }
        const breath = 1 + Math.sin(s.breath || 0) * 0.018;
        const pose = { ...p, S: [p.S[0], p.S[1] - bob], H: [p.H[0], p.H[1] - bob * 0.6], rc: p.rc * breath, rh: p.rh * breath };
        const body = bodyParts(pose, chunk);
        const legW = 7.4 * Math.sqrt(chunk);
        const shoulder = [pose.S[0] + 1, pose.S[1] + body.rc * 0.35], hip = [pose.H[0] + 1, pose.H[1] + body.rh * 0.3];
        const legsOn = p.legs > 0.5;
        // The tail's root: low at the back of the haunch.
        const base = [pose.H[0] + body.rh * p.tb[0], pose.H[1] + body.rh * p.tb[1]];
        const tail = tailPath(p, rig, base, s.swish || 0, s.puff || 0, chunk);
        const fill = (path, colour) => { g.fillStyle = colour; g.fill(path); };
        const outline = (path, w) => { g.lineWidth = w; g.lineJoin = 'round'; g.strokeStyle = coat.outline; g.stroke(path); };
        const ow = 2.2;
        if (!s.eyesOnly) {
            // Far legs, in shade.
            if (legsOn) {
                leg(g, [shoulder[0] - 4, shoulder[1]], fpf, legW * 0.92, coat.shade, coat.outline, coat.socks ? shadeOf(coat.white) : null, 2);
                leg(g, [hip[0] - 3, hip[1]], hpf, legW * 0.98, coat.shade, coat.outline, coat.socks ? shadeOf(coat.white) : null, p.haunch > 0.5 ? 6 : -3);
            }
            // The tail behind, unless it's wrapped round the front.
            if (p.tailFront < 0.5) { outline(tail.path, ow); fill(tail.path, coat.base); tailMarks(g, coat, tail.path, tail.tip); }
            // The body: every part's outline, then every part's fill.
            if (coat.fluffy) fluffEdge(g, body.all, coat, (s.puff || 0) + cat.fluff);
            for (const part of [body.chest, body.haunch, body.hull]) outline(part, ow * 2);
            for (const part of [body.chest, body.haunch, body.hull]) fill(part, coat.base);
            // Markings, clipped to the body.
            g.save();
            g.clip(body.all);
            bodyMarks(g, rig, pose, body);
            g.restore();
            // Near legs; a sitting cat's thigh over its hind foot.
            if (legsOn) {
                if (p.haunch > 0.3) {
                    g.save();
                    g.globalAlpha = Math.min(1, p.haunch * 1.4);
                    const th = new Path2D(); th.ellipse(pose.H[0] + 3, pose.H[1] + 2, body.rh * 0.78, body.rh * 0.9, -0.35, 0, TAU);
                    outline(th, ow); fill(th, coat.base);
                    if (coat.stripe) { g.save(); g.clip(th); g.strokeStyle = coat.stripe; g.lineWidth = 2.2; for (let i = -1; i <= 2; i++) { g.beginPath(); g.arc(pose.H[0] + 3, pose.H[1] + 2, body.rh * (0.35 + i * 0.22), -2.6, -0.6); g.stroke(); } g.restore(); }
                    g.restore();
                }
                leg(g, [hpn[0] < hip[0] ? hip[0] : hip[0] + 2, hip[1] + 2], hpn, legW, coat.base, coat.outline, coat.socks ? coat.white : null, p.haunch > 0.5 ? 5 : -4);
                if (coat.socks) sock(g, hip, hpn, legW, coat.white);
                if (!reach) {
                    leg(g, shoulder, fpn, legW, coat.base, coat.outline, coat.socks ? coat.white : null, 1.5);
                    if (coat.socks) sock(g, shoulder, fpn, legW, coat.white);
                }
            } else if (p.legs < 0.5) {
                // Tucked: the front paws peek out under the chest.
                for (const q of [fpf, fpn]) {
                    g.fillStyle = coat.outline;
                    g.beginPath(); g.ellipse(q[0], q[1] - 2.6, 5.2, 3.2, 0, 0, TAU); g.fill();
                    g.fillStyle = coat.socks ? coat.white : coat.base;
                    g.beginPath(); g.ellipse(q[0], q[1] - 2.6, 4.2, 2.3, 0, 0, TAU); g.fill();
                }
            }
            // Wrapped tail, in front.
            if (p.tailFront >= 0.5) { outline(tail.path, ow); fill(tail.path, coat.base); tailMarks(g, coat, tail.path, tail.tip); }
            // The swatting paw, in front of everything but the head.
            if (reach) {
                leg(g, shoulder, reach, legW, coat.base, coat.outline, coat.socks ? coat.white : null, -4);
                if (coat.socks) sock(g, shoulder, reach, legW, coat.white);
                if (s.claws) {
                    g.strokeStyle = '#f4f0e8'; g.lineWidth = 0.9; g.lineCap = 'round';
                    for (const d of [-2, 0, 2]) { g.beginPath(); g.moveTo(reach[0] + 3, reach[1] - 2 + d); g.lineTo(reach[0] + 6, reach[1] - 3 + d * 1.3); g.stroke(); }
                }
            }
        }
        // The head.
        g.save();
        g.translate(pose.N[0], pose.N[1] - bob * 1.1);
        g.rotate(p.hr + (s.tilt || 0));
        const hs = (cat.coat === 'blue-persian' ? 1.08 : 1) * (cat.id === 'moofy' ? 1.06 : 1) * Math.pow(chunk, 0.25);
        g.scale(hs, hs);
        head(g, rig, s.face || {}, s);
        g.restore();
        // Shade under the tree: darken the whole cat, then let the eyes shine through.
        g.restore();
    }

    const shadeOf = hex => {
        const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
        return `rgb(${Math.round(r * 0.84)},${Math.round(gg * 0.84)},${Math.round(b * 0.86)})`;
    };

    // A soft, scalloped edge for the fluffy ones: the outline dotted with fat beads of fur.
    function fluffEdge(g, path, coat, amount) {
        g.save();
        g.lineCap = 'round';
        g.setLineDash([0.1, 4.4]);
        g.strokeStyle = coat.outline;
        g.lineWidth = 7 + amount * 3;
        g.stroke(path);
        g.strokeStyle = coat.base;
        g.lineWidth = 5 + amount * 3;
        g.stroke(path);
        g.restore();
    }

    function tailMarks(g, coat, path, tip) {
        if (!coat.stripe && !coat.white && !coat.splitFace) return;
        g.save();
        g.clip(path);
        if (coat.stripe) {
            g.strokeStyle = coat.stripe; g.lineWidth = 2.6;
            for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(tip[0], tip[1], 5 + i * 7, 0, TAU); g.stroke(); }
        }
        if (coat.white && coat.socks && coat.tabby) { g.fillStyle = coat.white; g.beginPath(); g.arc(tip[0], tip[1], 4.5, 0, TAU); g.fill(); }
        g.restore();
    }

    function bodyMarks(g, rig, p, body) {
        const coat = rig.coat, [nx, ny] = body.n;
        const along = (t, v) => {
            const x = lerp(p.H[0], p.S[0], t), y = lerp(p.H[1], p.S[1], t), r = lerp(body.rh, body.rc, t);
            return [x + nx * r * v, y + ny * r * v];
        };
        // Belly, lighter underneath.
        if (coat.belly) {
            g.fillStyle = coat.belly;
            const a = along(0.35, 0.9), b = along(0.9, 0.85);
            g.beginPath(); g.ellipse((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.75 + 6, body.rc * 0.55, Math.atan2(b[1] - a[1], b[0] - a[0]), 0, TAU); g.fill();
        }
        // Patches: cow blobs, or tortie and mottled flecks.
        for (const m of rig.marks) {
            const [x, y] = along(m.t, m.v);
            g.fillStyle = m.colour;
            g.beginPath();
            for (let i = 0; i <= 10; i++) {
                const a = m.rot + i / 10 * TAU, r = m.r * m.lobes[i % 5];
                const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * m.sq;
                i ? g.lineTo(px, py) : g.moveTo(px, py);
            }
            g.closePath(); g.fill();
        }
        // Tabby stripes: bands over the back, down the sides.
        if (coat.tabby) {
            g.strokeStyle = coat.stripe;
            g.lineCap = 'round';
            const n = coat.tabby === 'soft' ? 6 : coat.tabby === 'blotched' ? 5 : 8;
            for (let i = 0; i < n; i++) {
                const t = 0.05 + i / (n - 1) * 0.92, top = along(t, -1.05), mid = along(t + (coat.tabby === 'blotched' ? 0.06 : 0.03), -0.2), low = along(t - 0.02, 0.45);
                g.lineWidth = coat.tabby === 'soft' ? 3.2 : coat.tabby === 'blotched' ? 4.8 : 2.6;
                g.beginPath(); g.moveTo(top[0], top[1]); g.quadraticCurveTo(mid[0], mid[1], low[0], low[1]); g.stroke();
            }
            // A dark line down the spine.
            const a = along(-0.1, -0.92), b = along(1.05, -0.92);
            g.lineWidth = 3; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
        }
        // A tuxedo's (and Harry's) white front.
        if (coat.bib) {
            g.fillStyle = coat.white;
            const c = along(1.05, 0.45);
            g.beginPath(); g.ellipse(c[0] + 3, c[1], body.rc * 0.62, body.rc * 0.95, 0.25, 0, TAU); g.fill();
            if (coat.belly === coat.white) { const b = along(0.55, 1.0); g.beginPath(); g.ellipse(b[0], b[1], body.rc * 0.9, body.rc * 0.5, 0, 0, TAU); g.fill(); }
        }
        if (coat.sheen) {
            g.fillStyle = coat.sheen;
            const a = along(0.5, -0.75);
            g.beginPath(); g.ellipse(a[0], a[1], body.rh * 1.3, body.rh * 0.35, Math.atan2(p.S[1] - p.H[1], p.S[0] - p.H[0]), 0, TAU); g.fill();
        }
    }

    // ---- The head --------------------------------------------------------------------

    // Face-on, radius R, centred on the origin. face: open (0 shut … 1),
    // look [x, y] (−1…1), lids ('scheme', 'judge', 'happy', 'sleep'),
    // mouth ('w', 'smile', 'grin', 'smirk', 'open', 'frown', 'yawn'),
    // ears (0 up … 1 flat; − forward), pupil (0 slit … 1 round), glow (eyeshine, 0–1).
    function head(g, rig, f, s) {
        const coat = rig.coat, cat = rig.cat, R = 15;
        const flat = !!coat.flat;
        const ears = f.ears || 0;
        const only = !!s.eyesOnly;     // the eyes (and a grin) alone, over the dark
        g.lineJoin = 'round';
        // Ears first, behind the head.
        for (const side of only ? [] : [-1, 1]) {
            g.save();
            g.translate(side * R * 0.55, -R * 0.55);
            g.rotate(side * (0.18 + ears * 0.9) + (f.earTwitch && side === 1 ? f.earTwitch : 0));
            const h = flat ? R * 0.62 : R * 0.95, w = flat ? R * 0.55 : R * 0.6;
            const ear = new Path2D();
            ear.moveTo(-w, R * 0.25); ear.quadraticCurveTo(-w * 0.55, -h * 0.6, 0, -h); ear.quadraticCurveTo(w * 0.55, -h * 0.6, w, R * 0.25); ear.closePath();
            g.lineWidth = 2.2; g.strokeStyle = coat.outline; g.stroke(ear);
            g.fillStyle = coat.base; g.fill(ear);
            g.fillStyle = coat.earIn;
            g.beginPath(); g.moveTo(-w * 0.55, R * 0.12); g.quadraticCurveTo(-w * 0.3, -h * 0.45, 0, -h * 0.78); g.quadraticCurveTo(w * 0.3, -h * 0.45, w * 0.55, R * 0.12); g.closePath(); g.fill();
            if (coat.tufts) { g.strokeStyle = coat.base; g.lineWidth = 1.6; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, -h); g.lineTo(side * 1.5, -h - 5); g.stroke(); }
            g.restore();
        }
        // The head: a wide round face with cheek fluff, and a ruff for the long-haired.
        const face = new Path2D();
        face.ellipse(0, 0, R * 1.1, R * 0.95, 0, 0, TAU);
        face.ellipse(-R * 0.6, R * 0.38, R * 0.55, R * 0.48, 0, 0, TAU);
        face.ellipse(R * 0.6, R * 0.38, R * 0.55, R * 0.48, 0, 0, TAU);
        if (only) { /* nothing of the face but its eyes */ }
        else if (coat.ruff) {
            g.save();
            g.lineCap = 'round'; g.setLineDash([0.1, 4.2]);
            g.strokeStyle = coat.outline; g.lineWidth = 8; g.stroke(face);
            g.strokeStyle = coat.base; g.lineWidth = 6; g.stroke(face);
            g.restore();
        } else {
            g.lineWidth = 2.4; g.strokeStyle = coat.outline; g.stroke(face);
        }
        if (!only) { g.fillStyle = coat.base; g.fill(face); }
        // Head markings.
        g.save();
        g.clip(face);
        if (!only && coat.splitFace) { g.fillStyle = coat.splitFace; g.beginPath(); g.moveTo(1, -R * 1.2); g.lineTo(R * 1.4, -R * 1.2); g.lineTo(R * 1.4, R * 1.2); g.lineTo(-1, R * 1.2); g.quadraticCurveTo(3, 0, 1, -R * 1.2); g.fill(); }
        if (!only && coat.headPatch) { g.fillStyle = coat.patches[0]; g.beginPath(); g.ellipse(rig.cow * R * 0.45, -R * 0.25, R * 0.5, R * 0.42, rig.cow * 0.4, 0, TAU); g.fill(); g.beginPath(); g.ellipse(-rig.cow * R * 0.55, -R * 0.95, R * 0.45, R * 0.3, 0, 0, TAU); g.fill(); }
        if (!only && coat.forehead) {
            g.strokeStyle = coat.stripe; g.lineWidth = 1.6; g.lineCap = 'round';
            for (const x of [-4, 0, 4]) { g.beginPath(); g.moveTo(x, -R * 0.92); g.lineTo(x * 0.8, -R * 0.42); g.stroke(); }
            for (const side of [-1, 1]) { g.beginPath(); g.moveTo(side * R * 1.05, R * 0.05); g.lineTo(side * R * 0.7, R * 0.12); g.stroke(); g.beginPath(); g.moveTo(side * R * 1.0, R * 0.32); g.lineTo(side * R * 0.68, R * 0.32); g.stroke(); }
        }
        if (!only && coat.blaze) { g.fillStyle = coat.white; g.beginPath(); g.moveTo(-2, -R * 0.2); g.lineTo(2, -R * 0.2); g.lineTo(R * 0.5, R * 1.1); g.lineTo(-R * 0.5, R * 1.1); g.fill(); }
        if (!only && coat.muzzle) {
            g.fillStyle = coat.muzzle;
            g.beginPath(); g.ellipse(-R * 0.2, R * 0.47, R * 0.3, R * 0.25, 0, 0, TAU); g.ellipse(R * 0.2, R * 0.47, R * 0.3, R * 0.25, 0, 0, TAU); g.ellipse(0, R * 0.7, R * 0.28, R * 0.22, 0, 0, TAU); g.fill();
        }
        if (coat.sheen && !only) { g.fillStyle = coat.sheen; g.beginPath(); g.ellipse(-R * 0.3, -R * 0.55, R * 0.6, R * 0.25, -0.3, 0, TAU); g.fill(); }
        g.restore();
        // Eyes.
        const ey = flat ? -R * 0.02 : -R * 0.08, ex = R * 0.43, ew = R * (flat ? 0.34 : 0.32);
        const open = Math.max(0, Math.min(1, (f.open ?? 1) * (1 - (f.blink || 0))));
        const look = f.look || [0, 0];
        const lids = f.lids;
        for (const side of [-1, 1]) {
            const cx = side * ex, cy = ey;
            if (open < 0.16 || lids === 'happy') {
                // Shut: content (a gentle curve) or happy (^).
                g.strokeStyle = coat.outline === '#08070a' || coat.outline === '#08080b' || coat.outline === '#0a0807' ? '#050405' : coat.outline;
                g.lineWidth = 1.7; g.lineCap = 'round';
                g.beginPath();
                if (lids === 'happy') { g.moveTo(cx - ew, cy + 1.5); g.quadraticCurveTo(cx, cy - ew * 1.1, cx + ew, cy + 1.5); }
                else { g.moveTo(cx - ew, cy); g.quadraticCurveTo(cx, cy + ew * 0.75, cx + ew, cy); }
                g.stroke();
                continue;
            }
            const eh = ew * 0.95 * open * (f.wide ? 1.15 : 1);
            const eye = new Path2D();
            eye.moveTo(cx - ew, cy);
            eye.bezierCurveTo(cx - ew * 0.5, cy - eh * 1.25, cx + ew * 0.5, cy - eh * 1.25, cx + ew, cy - side * 0.6);
            eye.bezierCurveTo(cx + ew * 0.5, cy + eh * 1.15, cx - ew * 0.5, cy + eh * 1.15, cx - ew, cy);
            eye.closePath();
            g.fillStyle = '#0c0a08'; g.save(); g.lineWidth = 1.8; g.strokeStyle = '#0c0a08'; g.stroke(eye); g.restore();
            g.fillStyle = cat.eyes; g.fill(eye);
            g.save(); g.clip(eye);
            // Iris shading, the pupil, a catchlight.
            g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.ellipse(cx, cy - eh * 0.7, ew * 1.2, eh * 0.6, 0, 0, TAU); g.fill();
            const pr = f.pupil ?? 0.4, px = cx + look[0] * ew * 0.35, py = cy + look[1] * eh * 0.3;
            g.fillStyle = '#0a0806';
            g.beginPath(); g.ellipse(px, py, ew * (0.16 + pr * 0.52), eh * (0.85 + pr * 0.1), 0, 0, TAU); g.fill();
            g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(px - ew * 0.25, py - eh * 0.4, Math.max(0.8, ew * 0.18), 0, TAU); g.fill();
            // Lids: Ras's scheme slants in, the Persian's hang heavy.
            if (lids === 'scheme' || lids === 'judge' || lids === 'sleepy') {
                g.fillStyle = coat.base;
                g.beginPath();
                if (lids === 'scheme') { g.moveTo(cx - ew * 1.4, cy - eh * 1.6); g.lineTo(cx + ew * 1.4, cy - eh * 1.6); g.lineTo(cx - side * ew * 1.3, cy - eh * (side > 0 ? 0.05 : 0.05)); g.lineTo(cx + side * ew * 1.3, cy - eh * 0.6); }
                else { const d = lids === 'judge' ? 0.15 : 0.35; g.rect(cx - ew * 1.4, cy - eh * 1.6, ew * 2.8, eh * (1.6 - d)); }
                g.closePath(); g.fill();
            }
            g.restore();
            // The lid line.
            if (lids === 'scheme' || lids === 'judge' || lids === 'sleepy') {
                g.strokeStyle = '#0c0a08'; g.lineWidth = 1.5; g.lineCap = 'round';
                g.beginPath();
                if (lids === 'scheme') { g.moveTo(cx - side * ew * 1.15, cy - eh * 0.05); g.lineTo(cx + side * ew * 1.05, cy - eh * 0.6); }
                else { const d = lids === 'judge' ? 0.15 : 0.35; g.moveTo(cx - ew * 1.05, cy - eh * d); g.lineTo(cx + ew * 1.05, cy - eh * d); }
                g.stroke();
            }
            // Eyeshine in the dark.
            if (f.glow > 0.02) {
                g.save();
                g.globalAlpha = f.glow * 0.3;
                g.globalCompositeOperation = 'lighter';
                g.fillStyle = cat.eyes;
                g.save(); g.clip(eye); g.fillRect(cx - ew * 1.2, cy - eh * 1.4, ew * 2.4, eh * 2.8); g.restore();
                g.globalAlpha = f.glow * 0.12;
                g.beginPath(); g.ellipse(cx, cy, ew * 1.35, eh * 1.25 + 1, 0, 0, TAU); g.fill();
                g.restore();
            }
        }
        // Nose and mouth.
        const ny = flat ? R * 0.18 : R * 0.3;
        if (only) { if (f.mouth === 'grin') mouth(g, 'grin', R, ny + R * 0.2, coat, f); return; }
        g.fillStyle = coat.nose;
        g.beginPath(); g.moveTo(-R * 0.16, ny); g.lineTo(R * 0.16, ny); g.quadraticCurveTo(R * 0.05, ny + R * 0.2, 0, ny + R * 0.2); g.quadraticCurveTo(-R * 0.05, ny + R * 0.2, -R * 0.16, ny); g.fill();
        mouth(g, f.mouth || 'w', R, ny + R * 0.2, coat, f);
        // Whiskers.
        g.strokeStyle = coat.whisker; g.lineWidth = 0.7; g.lineCap = 'round';
        for (const side of [-1, 1]) for (const [dy, spread] of [[-1.4, -0.18], [0.4, 0], [2.2, 0.18]]) {
            g.beginPath();
            g.moveTo(side * R * 0.32, ny + R * 0.3 + dy * 0.5);
            g.quadraticCurveTo(side * R * 0.95, ny + R * 0.2 + dy, side * R * 1.55, ny + R * 0.25 + dy + spread * R);
            g.stroke();
        }
        // Blush, for the loving.
        if (f.blush > 0.01) { g.fillStyle = `rgba(240,120,130,${0.35 * f.blush})`; for (const side of [-1, 1]) { g.beginPath(); g.ellipse(side * R * 0.68, R * 0.3, R * 0.22, R * 0.13, 0, 0, TAU); g.fill(); } }
    }

    function mouth(g, kind, R, y, coat, f) {
        const ink = '#2a1c1c';
        g.strokeStyle = ink; g.lineWidth = 1.3; g.lineCap = 'round'; g.lineJoin = 'round';
        const w = (l, r, up = 0) => {
            g.beginPath(); g.moveTo(0, y - 0.5); g.lineTo(0, y + 1.6);
            g.moveTo(0, y + 1.6); g.quadraticCurveTo(-l * 0.5, y + 3.4 - up, -l, y + 1.2 - up * 1.6);
            g.moveTo(0, y + 1.6); g.quadraticCurveTo(r * 0.5, y + 3.4 - up, r, y + 1.2 - up * 1.6);
            g.stroke();
        };
        if (kind === 'w') w(R * 0.26, R * 0.26);
        else if (kind === 'smile') w(R * 0.32, R * 0.32, 0.9);
        else if (kind === 'smirk') { w(R * 0.22, R * 0.34, 0); g.beginPath(); g.moveTo(R * 0.34, y + 1.2); g.quadraticCurveTo(R * 0.42, y - 0.2, R * 0.48, y - 1.2); g.stroke(); }
        else if (kind === 'frown') { g.beginPath(); g.moveTo(0, y - 0.5); g.lineTo(0, y + 1.4); g.moveTo(-R * 0.26, y + 3.2); g.quadraticCurveTo(0, y + 1.2, R * 0.26, y + 3.2); g.stroke(); }
        else if (kind === 'open' || kind === 'yawn') {
            const h = kind === 'yawn' ? R * 0.5 : R * 0.26, wd = kind === 'yawn' ? R * 0.3 : R * 0.24;
            g.fillStyle = '#5a2228';
            g.beginPath(); g.moveTo(-wd, y + 1); g.quadraticCurveTo(0, y + 1 + h * 2, wd, y + 1); g.quadraticCurveTo(0, y + 2.5, -wd, y + 1); g.fill(); g.stroke();
            g.fillStyle = '#e88a94'; g.beginPath(); g.ellipse(0, y + 1 + h * 1.1, wd * 0.55, h * 0.45, 0, 0, TAU); g.fill();
            if (kind === 'yawn') { g.fillStyle = '#fbf6ea'; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * wd * 0.75, y + 1.2); g.lineTo(s * wd * 0.55, y + 4); g.lineTo(s * wd * 0.4, y + 1.6); g.fill(); } }
        } else if (kind === 'grin') {
            // Moofy's: a wide crescent of a grin, a row of small teeth, shining a little in the dark.
            const gw = R * 0.82;
            const grin = new Path2D();
            grin.moveTo(-gw, y - 2.8);
            grin.quadraticCurveTo(0, y + R * 0.95, gw, y - 2.8);
            grin.quadraticCurveTo(0, y + R * 0.38, -gw, y - 2.8);
            grin.closePath();
            g.fillStyle = '#f6eedc'; g.fill(grin);
            g.lineWidth = 1.1; g.strokeStyle = '#050405'; g.stroke(grin);
            g.save(); g.clip(grin);
            g.strokeStyle = 'rgba(40,30,30,0.5)'; g.lineWidth = 0.6;
            for (let i = -4; i <= 4; i++) { const x = i * gw / 5; g.beginPath(); g.moveTo(x, y - 4); g.lineTo(x, y + R * 0.9); g.stroke(); }
            g.restore();
            if (f.glow > 0.02) {
                g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = f.glow * 0.4; g.fillStyle = '#fff4d8';
                g.beginPath(); g.ellipse(0, y + R * 0.28, gw * 1.1, R * 0.4, 0, 0, TAU); g.fill(); g.restore();
            }
        }
    }

    // A soft shadow under a cat: an ellipse, baked once (per scale) by the caller.
    function shadowSprite(size) {
        const c = document.createElement('canvas');
        c.width = c.height = Math.max(4, Math.round(size));
        const g = c.getContext('2d'), r = c.width / 2;
        const gr = g.createRadialGradient(r, r, 0, r, r, r);
        gr.addColorStop(0, 'rgba(10,4,2,0.42)'); gr.addColorStop(0.6, 'rgba(10,4,2,0.18)'); gr.addColorStop(1, 'rgba(10,4,2,0)');
        g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
        return c;
    }

    return { COATS, POSES, copy, toward, make, draw, shadowSprite };
})();
