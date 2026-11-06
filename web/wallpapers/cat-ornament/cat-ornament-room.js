// The Cat vs. the Ornament: the room, baked (SPEC §4.8). A warm living
// room after dark: papered walls, a window onto the snow, a portrait of a
// cat, a plank floor, a braided rug and the tree skirt (one static layer per
// resize and time of day); the tree (its boughs as one sprite, the lowest
// tier again as a second sprite in front, so a cat can lurk between them),
// its lights and ornaments as small sprites drawn where the tree is now
// (it can wobble and fall); the presents, with one open box for whoever
// wants to sleep in it.

const CatRoom = (() => {
    'use strict';

    const TAU = Math.PI * 2;
    const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
    const radial = (g, x, y, r, stops) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); for (const [a, c] of stops) gr.addColorStop(a, c); return gr; };
    const hex = (h, a = 1) => { const n = parseInt(h.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };

    const PALETTES = {
        classic: ['#d8282e', '#e8b230', '#2e8c4a', '#2c62c8', '#e87a1c', '#c8327a'],
        warm: ['#ffd27a', '#ffc860', '#ffe0a0', '#ffcf70'],
        blue: ['#6ab0ff', '#9ad0ff', '#4c8cf0', '#cfe6ff'],
        candy: ['#ff5a7a', '#ffffff', '#ff9ab4', '#e8243c'],
    };
    const ORNAMENTS = {
        classic: ['#c8202a', '#e0b030', '#1e7a44', '#2a58b8', '#c8c8d4', '#8a2a8a'],
        'silver-gold': ['#d8d8e0', '#e8c060', '#b8b8c4', '#f0d890', '#a0a0b0'],
        jewel: ['#7a1a3a', '#1a5a6a', '#2a7a3a', '#5a2a8a', '#b8862a'],
        pastel: ['#f0a0b4', '#a0d0f0', '#b8e0a8', '#f0d8a0', '#d0b0f0'],
    };

    // Where everything goes, in CSS px. A tall screen puts the tree in the
    // middle and the window above to the left.
    function layout(W, H, insets) {
        const bottom = H - (insets.bottom || 0);
        const tall = H > W * 1.15;
        const floorY = tall ? bottom * 0.7 : bottom * 0.66;
        const baseY = floorY + (bottom - floorY) * (tall ? 0.3 : 0.34);
        const treeX = tall ? W * 0.54 : W * 0.6;
        const treeH = Math.min(baseY - H * 0.05 - (insets.top || 0), tall ? W * 1.28 : H * 0.7);
        const treeW = treeH * 0.6;
        const u = Math.min(H, W * 1.6) / 800 * (tall ? 1.15 : 1.3);
        const win = tall ? { x: W * 0.07, y: H * 0.08 + (insets.top || 0), w: W * 0.34, h: H * 0.2 }
            : { x: W * 0.06, y: H * 0.1, w: Math.min(W * 0.24, (treeX - treeW * 0.6) - W * 0.1), h: H * 0.42 };
        const picture = tall ? { x: W * 0.62, y: H * 0.09 + (insets.top || 0), w: W * 0.24, h: W * 0.3 } : { x: W * 0.82, y: H * 0.16, w: W * 0.1, h: W * 0.125 };
        return {
            W, H, bottom, tall, floorY, baseY, treeX, treeH, treeW, u, win, picture,
            floor: { y0: Math.max(floorY + (bottom - floorY) * 0.42, baseY + 6 * u), y1: bottom - 10 * u },
            rug: { x: treeX, y: baseY + (bottom - floorY) * 0.16, rx: Math.max(treeW * 0.95, W * 0.26), ry: (bottom - floorY) * 0.36 },
        };
    }

    // ---- The room ------------------------------------------------------------------------

    // `day`: 0 evening … 1 day.
    // `baked`: { fire, glow } sprites to paint in for good (on Low, where they don't flicker).
    function background(L, dpr, day, random, baked) {
        const { W, H, floorY, bottom } = L;
        const c = canvas(W * dpr, H * dpr), g = c.getContext('2d');
        g.scale(dpr, dpr);
        const mix = (a, b) => a.map((v, i) => Math.round(v + (b[i] - v) * day));
        const rgb = a => `rgb(${a[0]},${a[1]},${a[2]})`;
        // The wall: deep red paper with a faint damask, darker toward the corners.
        const wall = g.createLinearGradient(0, 0, 0, floorY);
        wall.addColorStop(0, rgb(mix([46, 20, 22], [150, 92, 84])));
        wall.addColorStop(1, rgb(mix([74, 32, 30], [176, 112, 98])));
        g.fillStyle = wall;
        g.fillRect(0, 0, W, floorY);
        g.fillStyle = `rgba(255,220,180,${0.035 + day * 0.03})`;
        const step = 46 * L.u;
        for (let y = step * 0.5; y < floorY; y += step) {
            for (let x = ((y / step) % 2) * step * 0.5; x < W + step; x += step) {
                g.beginPath(); g.ellipse(x, y, step * 0.13, step * 0.22, 0, 0, TAU); g.fill();
                g.beginPath(); g.arc(x, y - step * 0.3, step * 0.04, 0, TAU); g.arc(x, y + step * 0.3, step * 0.04, 0, TAU); g.fill();
            }
        }
        // Stripes.
        g.fillStyle = 'rgba(0,0,0,0.05)';
        for (let x = 0; x < W; x += step) g.fillRect(x, 0, step * 0.08, floorY);
        // Wainscot and chair rail.
        const rail = floorY - (floorY * 0.2);
        g.fillStyle = rgb(mix([52, 30, 22], [128, 86, 60]));
        g.fillRect(0, rail, W, floorY - rail);
        g.fillStyle = 'rgba(0,0,0,0.18)';
        for (let x = step * 0.6; x < W; x += step * 2.2) { g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 2; g.strokeRect(x, rail + 10 * L.u, step * 1.6, floorY - rail - 22 * L.u); g.strokeStyle = 'rgba(255,220,180,0.06)'; g.strokeRect(x + 2, rail + 10 * L.u + 2, step * 1.6, floorY - rail - 22 * L.u); }
        g.fillStyle = rgb(mix([80, 48, 30], [170, 120, 80])); g.fillRect(0, rail - 6 * L.u, W, 7 * L.u);
        g.fillStyle = 'rgba(255,230,190,0.12)'; g.fillRect(0, rail - 6 * L.u, W, 1.5 * L.u);
        // The skirting board.
        g.fillStyle = rgb(mix([40, 22, 16], [110, 72, 48])); g.fillRect(0, floorY - 9 * L.u, W, 9 * L.u);
        // The floor: warm planks, lighter toward the tree.
        const floor = g.createLinearGradient(0, floorY, 0, H);
        floor.addColorStop(0, rgb(mix([66, 38, 22], [150, 100, 62])));
        floor.addColorStop(1, rgb(mix([40, 22, 12], [120, 78, 46])));
        g.fillStyle = floor;
        g.fillRect(0, floorY, W, H - floorY);
        g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1;
        for (let i = 1, y = floorY; y < H; i++) {
            y = floorY + (H - floorY) * (i * i) / 40;
            g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
            const seam = (random() * W) | 0;
            g.beginPath(); g.moveTo(seam, y); g.lineTo(seam, floorY + (H - floorY) * ((i + 1) * (i + 1)) / 40); g.stroke();
        }
        windowFrame(g, L, day, random);
        portrait(g, L, day);
        // The braided rug.
        const r = L.rug;
        for (let i = 7; i >= 0; i--) {
            g.fillStyle = ['#7a2a24', '#2e5a3a', '#a8823e', '#6a2420', '#3a5e46', '#b08a46', '#7c2c26', '#c8a058'][i];
            g.beginPath(); g.ellipse(r.x, r.y, r.rx * (0.4 + i * 0.085), r.ry * (0.4 + i * 0.085), 0, 0, TAU); g.fill();
        }
        g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1.2;
        for (let i = 0; i < 8; i++) { g.beginPath(); g.ellipse(r.x, r.y, r.rx * (0.4 + i * 0.085), r.ry * (0.4 + i * 0.085), 0, 0, TAU); g.stroke(); }
        g.fillStyle = `rgba(0,0,0,${0.35 - day * 0.15})`;
        g.beginPath(); g.ellipse(r.x, r.y, r.rx, r.ry, 0, 0, TAU); g.fill();
        // The tree skirt: red velvet with a white trim.
        const sx = L.treeX, sy = L.baseY + 4 * L.u, srx = L.treeW * 0.62, sry = srx * 0.22;
        g.fillStyle = '#f2ece2'; g.beginPath(); g.ellipse(sx, sy, srx + 5 * L.u, sry + 2.5 * L.u, 0, 0, TAU); g.fill();
        g.fillStyle = radial(g, sx, sy - sry * 0.3, srx, [[0, '#b0222a'], [1, '#6a1016']]); g.beginPath(); g.ellipse(sx, sy, srx, sry, 0, 0, TAU); g.fill();
        if (baked) {
            if (baked.glow) { const r = L.treeH * 0.75; g.globalAlpha = 0.9 - day * 0.5; g.drawImage(baked.glow, L.treeX - r, L.baseY - L.treeH * 0.5 - r, r * 2, r * 2); }
            if (baked.fire) { const fr = Math.max(W, H) * 0.5; g.globalAlpha = 0.8 * (1 - day * 0.7); g.drawImage(baked.fire, baked.fireX - fr, H * 0.7 - fr, fr * 2, fr * 2); }
            g.globalAlpha = 1;
        }
        // The room's dark corners.
        g.fillStyle = radial(g, W * 0.55, H * 0.55, Math.hypot(W, H) * 0.62, [[0, 'rgba(0,0,0,0)'], [0.6, `rgba(8,2,4,${0.25 - day * 0.15})`], [1, `rgba(6,2,4,${0.7 - day * 0.4})`]]);
        g.fillRect(0, 0, W, H);
        return c;
    }

    function windowFrame(g, L, day, random) {
        const { x, y, w, h } = L.win, u = L.u, t = 9 * u;
        g.save();
        g.beginPath(); g.rect(x, y, w, h); g.clip();
        // Outside: night with distant houses' lights, or a white winter day.
        const sky = g.createLinearGradient(0, y, 0, y + h);
        if (day > 0.5) { sky.addColorStop(0, '#b8cce0'); sky.addColorStop(1, '#e8eef4'); }
        else { sky.addColorStop(0, '#0a1630'); sky.addColorStop(0.7, '#1c2a4a'); sky.addColorStop(1, '#3a4660'); }
        g.fillStyle = sky; g.fillRect(x, y, w, h);
        if (day <= 0.5) {
            g.fillStyle = 'rgba(255,255,255,0.8)';
            for (let i = 0; i < 26; i++) g.fillRect(x + random() * w, y + random() * h * 0.55, 1, 1);
            g.fillStyle = radial(g, x + w * 0.74, y + h * 0.2, w * 0.3, [[0, 'rgba(230,236,255,0.9)'], [0.08, 'rgba(230,236,255,0.85)'], [0.12, 'rgba(200,214,255,0.25)'], [1, 'rgba(200,214,255,0)']]);
            g.fillRect(x, y, w, h);
        }
        // Snowy rooftops far off, some with a lit window.
        g.fillStyle = day > 0.5 ? '#9aa8b8' : '#141a2a';
        let hx = x - 10;
        const roofs = [];
        while (hx < x + w) { const hw = (30 + random() * 40) * u, hh = (20 + random() * 30) * u; roofs.push([hx, hw, hh]); hx += hw * 0.9; }
        for (const [rx, rw, rh] of roofs) {
            const top = y + h - rh - 18 * u;
            g.fillStyle = day > 0.5 ? '#8494a8' : '#121828';
            g.beginPath(); g.moveTo(rx, y + h); g.lineTo(rx, top + rh * 0.4); g.lineTo(rx + rw / 2, top); g.lineTo(rx + rw, top + rh * 0.4); g.lineTo(rx + rw, y + h); g.fill();
            g.fillStyle = '#eef2f8'; g.beginPath(); g.moveTo(rx - 1, top + rh * 0.4); g.lineTo(rx + rw / 2, top - 1); g.lineTo(rx + rw + 1, top + rh * 0.4); g.lineTo(rx + rw / 2, top + 4 * u); g.fill();
            if (day <= 0.5 && random() < 0.7) { g.fillStyle = 'rgba(255,200,110,0.9)'; g.fillRect(rx + rw * (0.3 + random() * 0.3), top + rh * 0.6, 5 * u, 6 * u); }
        }
        g.fillStyle = day > 0.5 ? '#f4f6fa' : '#c8d0e0';
        g.fillRect(x, y + h - 14 * u, w, 14 * u);
        // Frost in the corners of the glass.
        for (const [cx, cy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
            g.fillStyle = radial(g, cx, cy, w * 0.28, [[0, 'rgba(235,242,255,0.55)'], [1, 'rgba(235,242,255,0)']]);
            g.fillRect(x, y, w, h);
        }
        g.restore();
        // The frame, the cross bars, the sill.
        g.fillStyle = '#e8e0d2';
        g.fillRect(x - t, y - t, w + 2 * t, t); g.fillRect(x - t, y + h, w + 2 * t, t * 0.6);
        g.fillRect(x - t, y, t, h); g.fillRect(x + w, y, t, h);
        g.fillRect(x + w / 2 - t * 0.35, y, t * 0.7, h); g.fillRect(x, y + h * 0.45 - t * 0.35, w, t * 0.7);
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x - t, y + h + t * 0.6, w + 2 * t, 3 * u);
        g.fillStyle = '#d8cfbe'; g.fillRect(x - t * 1.6, y + h + t * 0.6, w + t * 3.2, t * 0.9);
        // Curtains, tied back.
        for (const side of [-1, 1]) {
            const cx = side < 0 ? x - t * 1.4 : x + w + t * 1.4;
            g.fillStyle = '#6a1a20';
            g.beginPath();
            g.moveTo(cx - side * 0, y - t * 1.6);
            g.lineTo(cx + side * w * 0.22, y - t * 1.6);
            g.quadraticCurveTo(cx + side * w * 0.05, y + h * 0.5, cx + side * w * 0.14, y + h + t * 2.5);
            g.lineTo(cx - side * t * 0.6, y + h + t * 2.5);
            g.closePath(); g.fill();
            g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1.5;
            for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(cx + side * w * 0.05 * i, y - t); g.quadraticCurveTo(cx + side * w * 0.02 * i, y + h * 0.5, cx + side * w * 0.035 * i, y + h + t * 2); g.stroke(); }
            g.fillStyle = '#d0a040'; g.fillRect(cx - 3 * u + side * w * 0.04, y + h * 0.55, 8 * u + w * 0.05, 4 * u);
        }
        g.fillStyle = '#3a2416'; g.fillRect(x - t * 2.4, y - t * 2, w + t * 4.8, 4 * u);
    }

    // A small portrait of a distinguished cat, in a gilt frame.
    function portrait(g, L, day) {
        const { x, y, w, h } = L.picture, u = L.u, f = 6 * u;
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x - f + 4, y - f + 5, w + 2 * f, h + 2 * f);
        const gold = g.createLinearGradient(x, y, x + w, y + h);
        gold.addColorStop(0, '#f0d080'); gold.addColorStop(0.5, '#a07428'); gold.addColorStop(1, '#e0b860');
        g.fillStyle = gold; g.fillRect(x - f, y - f, w + 2 * f, h + 2 * f);
        g.fillStyle = radial(g, x + w / 2, y + h * 0.4, h * 0.8, [[0, '#4a5a48'], [1, '#1c241c']]);
        g.fillRect(x, y, w, h);
        // The sitter: a dignified silhouette with a ruff.
        const cx = x + w / 2, by = y + h;
        g.fillStyle = '#0e0c0a';
        g.beginPath(); g.ellipse(cx, by - h * 0.18, w * 0.32, h * 0.3, 0, Math.PI, 0); g.fill();
        g.beginPath(); g.arc(cx, by - h * 0.56, w * 0.2, 0, TAU); g.fill();
        g.beginPath(); g.moveTo(cx - w * 0.19, by - h * 0.62); g.lineTo(cx - w * 0.15, by - h * 0.86); g.lineTo(cx - w * 0.04, by - h * 0.72); g.fill();
        g.beginPath(); g.moveTo(cx + w * 0.19, by - h * 0.62); g.lineTo(cx + w * 0.15, by - h * 0.86); g.lineTo(cx + w * 0.04, by - h * 0.72); g.fill();
        g.fillStyle = '#f2ead6';
        g.beginPath(); for (let i = 0; i < 9; i++) { const a = Math.PI + i / 8 * Math.PI; g.lineTo(cx + Math.cos(a) * w * 0.26, by - h * 0.38 - Math.sin(a) * h * 0.06 + (i % 2) * 3 * u); } g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,240,200,0.12)'; g.fillRect(x, y, w, h * 0.12);
    }

    // ---- The tree ------------------------------------------------------------------------

    // The fir, `h` tall (CSS px), as a sprite with its origin at the trunk's
    // foot; the front tier separately; and where its lights, ornaments,
    // the low hook and the star go (local px, y up is negative).
    function tree(L, dpr, random, palette) {
        const h = L.treeH, w = L.treeW, pad = 14 * L.u;
        const cw = w + pad * 2, chh = h + pad * 2, ox = cw / 2, oy = h + pad;
        const make = () => { const c = canvas(cw * dpr, chh * dpr), g = c.getContext('2d'); g.scale(dpr, dpr); g.translate(ox, oy); return [c, g]; };
        const [main, g] = make(), [front, fg] = make();
        const tiers = 7, trunkH = h * 0.075;
        // The trunk and its stand.
        g.fillStyle = '#4a2e1a'; g.fillRect(-w * 0.04, -trunkH - h * 0.05, w * 0.08, trunkH + h * 0.05);
        const stand = new Path2D(); stand.moveTo(-w * 0.13, 0); stand.lineTo(-w * 0.1, -trunkH * 0.75); stand.lineTo(w * 0.1, -trunkH * 0.75); stand.lineTo(w * 0.13, 0); stand.closePath();
        g.fillStyle = '#7a1c1a'; g.fill(stand); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(-w * 0.1, -trunkH * 0.72, w * 0.2, 2);
        const spots = [], lights = [], ornaments = [];
        for (let i = 0; i < tiers; i++) {
            const t0 = i / tiers, t1 = (i + 1.35) / tiers;
            const yTop = -h + h * 0.9 * t0 - h * 0.02, yBot = -trunkH - h * 0.9 * (1 - Math.min(1, t1)) - h * 0.015;
            const half = w * 0.5 * (0.16 + 0.84 * Math.min(1, (i + 1) / tiers));
            const target = i === tiers - 1 ? fg : g;
            bough(target, yTop, yBot, half, random, i);
            if (i === tiers - 1) bough(g, yTop, yBot, half, random, i);   // under the front tier too, so a fallen tree is whole
            spots.push({ yBot, half, yTop });
        }
        // Garlands: gold beads in swags across the tiers.
        for (let i = 1; i < tiers - 1; i += 2) {
            const s = spots[i], y0 = s.yBot - (s.yBot - s.yTop) * 0.3, x0 = -s.half * 0.8, x1 = s.half * 0.85, dip = (s.yBot - s.yTop) * 0.35;
            for (let k = 0; k <= 30; k++) {
                const t = k / 30, x = x0 + (x1 - x0) * t, y = y0 + (x1 - x0) * 0.12 * (t - 0.5) + Math.sin(t * Math.PI) * dip;
                g.fillStyle = k % 2 ? '#e8c060' : '#fff0b0'; g.beginPath(); g.arc(x, y, 1.6 * L.u, 0, TAU); g.fill();
            }
        }
        // Lights and ornaments, scattered over the tree's face.
        const inside = (x, y) => { for (const s of spots) if (y > s.yTop && y < s.yBot && Math.abs(x) < s.half * 0.86 * (y - s.yTop) / (s.yBot - s.yTop)) return true; return false; };
        for (let tries = 0; lights.length < 70 && tries < 4000; tries++) {
            const y = -h * (0.08 + random() * 0.86), x = (random() - 0.5) * w;
            if (inside(x, y)) lights.push({ x, y, colour: Math.floor(random() * 6), phase: random() * TAU, rate: 0.4 + random() * 1.6 });
        }
        for (let tries = 0; ornaments.length < 16 && tries < 4000; tries++) {
            const s = spots[1 + Math.floor(random() * (tiers - 2))];
            const y = s.yBot - (s.yBot - s.yTop) * (0.05 + random() * 0.4), x = (random() - 0.5) * 2 * s.half * 0.85;
            if (!inside(x, y - 3) || ornaments.some(o => Math.hypot(o.x - x, o.y - y) < w * 0.11)) continue;
            ornaments.push({ x, y, colour: Math.floor(random() * 5), kind: random() < 0.75 ? 'ball' : random() < 0.5 ? 'drop' : 'bell', size: (0.8 + random() * 0.5) * L.u, detach: 0.35 + random() * 1 });
        }
        // The low hook: a tip of the bottom tier, on each side.
        const low = spots[tiers - 1];
        const hooks = [-1, 1].map(side => ({ x: side * low.half * 0.82, y: low.yBot - (low.yBot - low.yTop) * 0.18 }));
        // The lit tree: the same, with each light's soft halo painted on the boughs (the bulbs twinkle over it).
        const [lit, lg] = make();
        lg.drawImage(main, -ox, -oy, cw, chh);
        const halos = palette.map(c => glow(30 * L.u, c, 0.3, dpr));
        for (const b of lights) { const r = 30 * L.u; lg.drawImage(halos[b.colour % halos.length], b.x - r, b.y - r, r * 2, r * 2); }
        return { main, lit, front, ox, oy, h, w, lights, ornaments, hooks, star: { x: 0, y: -h - 2 * L.u } };
    }

    // One tier: a drooping skirt of boughs, scalloped along the bottom,
    // shaded, then needled.
    function bough(g, yTop, yBot, half, random, i) {
        const path = new Path2D(), lobes = 5 + i;
        path.moveTo(0, yTop);
        path.quadraticCurveTo(half * 0.4, yTop + (yBot - yTop) * 0.45, half, yBot);
        for (let k = lobes; k > 0; k--) {
            const xa = -half + (2 * half) * (k / lobes), xb = -half + (2 * half) * ((k - 1) / lobes);
            path.quadraticCurveTo((xa + xb) / 2, yBot - (yBot - yTop) * (0.08 + random() * 0.06), xb, yBot + (random() - 0.4) * (yBot - yTop) * 0.06);
        }
        path.quadraticCurveTo(-half * 0.4, yTop + (yBot - yTop) * 0.45, 0, yTop);
        const grad = g.createLinearGradient(-half, yTop, half, yBot);
        grad.addColorStop(0, '#2a5c38'); grad.addColorStop(0.5, '#1d4a2c'); grad.addColorStop(1, '#10301c');
        g.fillStyle = '#0a2214'; g.save(); g.translate(0, 3); g.fill(path); g.restore();
        g.fillStyle = grad; g.fill(path);
        // Needles: short strokes fanning down and out.
        g.save(); g.clip(path);
        g.lineCap = 'round';
        const n = Math.round(half * (yBot - yTop) / 40);
        for (let k = 0; k < n; k++) {
            const y = yTop + (yBot - yTop) * Math.sqrt(random()), x = (random() - 0.5) * 2 * half * (y - yTop) / (yBot - yTop);
            const a = Math.PI / 2 + Math.sign(x) * (0.5 + random() * 0.6) * -1 + (random() - 0.5) * 0.4;
            const l = 5 + random() * 9;
            g.strokeStyle = random() < 0.45 ? 'rgba(90,150,96,0.55)' : random() < 0.5 ? 'rgba(20,60,34,0.7)' : 'rgba(60,118,72,0.5)';
            g.lineWidth = 1.2;
            g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l * Math.sign(x || 1) * 0.6, y + Math.sin(a) * l * 0.6); g.stroke();
        }
        // Shadow under the next tier.
        g.fillStyle = 'rgba(4,18,10,0.35)';
        g.beginPath(); g.ellipse(0, yTop + (yBot - yTop) * 0.05, half * 0.3, (yBot - yTop) * 0.12, 0, 0, TAU); g.fill();
        g.restore();
    }

    // ---- Small sprites -------------------------------------------------------------------

    // A glass ornament, `r` CSS px in radius: a ball, a drop or a bell, with
    // its cap and a window's reflection.
    function ornament(colour, r, kind, dpr) {
        const s = Math.ceil(r * 2.8), c = canvas(s * dpr, s * 1.4 * dpr), g = c.getContext('2d');
        g.scale(dpr, dpr);
        const cx = s / 2, cy = s * 0.4 + r * 0.95;
        const body = new Path2D();
        if (kind === 'drop') { body.moveTo(cx, cy - r * 1.1); body.bezierCurveTo(cx + r * 1.2, cy - r * 0.2, cx + r * 0.9, cy + r * 0.9, cx, cy + r * 1.6); body.bezierCurveTo(cx - r * 0.9, cy + r * 0.9, cx - r * 1.2, cy - r * 0.2, cx, cy - r * 1.1); }
        else if (kind === 'bell') { body.moveTo(cx - r * 0.45, cy - r * 0.9); body.quadraticCurveTo(cx - r * 0.6, cy + r * 0.2, cx - r * 1.1, cy + r * 0.85); body.lineTo(cx + r * 1.1, cy + r * 0.85); body.quadraticCurveTo(cx + r * 0.6, cy + r * 0.2, cx + r * 0.45, cy - r * 0.9); body.closePath(); }
        else body.arc(cx, cy, r, 0, TAU);
        g.fillStyle = radial(g, cx - r * 0.35, cy - r * 0.35, r * 1.6, [[0, hex(colour, 1)], [0.55, hex(colour, 1)], [1, 'rgba(10,6,8,1)']]);
        g.fill(body);
        g.save(); g.clip(body);
        g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.ellipse(cx - r * 0.38, cy - r * 0.42, r * 0.28, r * 0.18, -0.6, 0, TAU); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.arc(cx - r * 0.42, cy - r * 0.45, r * 0.08, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = r * 0.12; g.beginPath(); g.ellipse(cx, cy + r * 0.1, r * 1.05, r * 0.25, 0, 0, Math.PI); g.stroke();
        g.restore();
        if (kind === 'bell') { g.fillStyle = '#e8c060'; g.beginPath(); g.arc(cx, cy + r * 0.95, r * 0.22, 0, TAU); g.fill(); }
        // The cap and its loop.
        g.fillStyle = '#d8b450'; g.fillRect(cx - r * 0.28, cy - r * (kind === 'ball' ? 1.18 : 1.25), r * 0.56, r * 0.3);
        g.strokeStyle = '#c8a040'; g.lineWidth = Math.max(0.8, r * 0.09);
        g.beginPath(); g.arc(cx, cy - r * 1.32, r * 0.14, 0, TAU); g.stroke();
        return { canvas: c, w: s, h: s * 1.4, ax: cx, ay: cy - r * 1.42, cx, cy, r };
    }

    // A bulb's glow: a bright core and a soft halo, `r` in CSS px.
    function bulb(colour, r, dpr) {
        const s = Math.ceil(r * 2), c = canvas(s * dpr, s * dpr), g = c.getContext('2d');
        g.scale(dpr, dpr);
        g.fillStyle = radial(g, s / 2, s / 2, s / 2, [[0, 'rgba(255,255,245,1)'], [0.16, hex(colour, 1)], [0.26, hex(colour, 0.85)], [0.45, hex(colour, 0.35)], [1, hex(colour, 0)]]);
        g.fillRect(0, 0, s, s);
        return c;
    }

    // The star on top.
    function star(r, dpr) {
        const s = Math.ceil(r * 2.6), c = canvas(s * dpr, s * dpr), g = c.getContext('2d');
        g.scale(dpr, dpr);
        g.fillStyle = radial(g, s / 2, s / 2, s / 2, [[0, 'rgba(255,240,170,0.9)'], [0.4, 'rgba(255,220,120,0.25)'], [1, 'rgba(255,220,120,0)']]);
        g.fillRect(0, 0, s, s);
        g.fillStyle = '#ffd860'; g.strokeStyle = '#b88a20'; g.lineWidth = r * 0.08;
        g.beginPath();
        for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.42 : r; g.lineTo(s / 2 + Math.cos(a) * rr, s / 2 + Math.sin(a) * rr); }
        g.closePath(); g.fill(); g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.arc(s / 2 - r * 0.15, s / 2 - r * 0.2, r * 0.14, 0, TAU); g.fill();
        return c;
    }

    // The presents: wrapped boxes in front of the skirt (one sprite), and
    // the open box, back and front, for a cat to sit in.
    function presents(L, dpr, random) {
        const u = L.u;
        // Only the strip they sit in, not the whole screen.
        const x0 = L.treeX - L.treeW * 0.62 - 40 * u, x1 = L.treeX + L.treeW * 0.62 + 40 * u, y0 = L.baseY - 70 * u, y1 = L.baseY + 24 * u;
        const c = canvas((x1 - x0) * dpr, (y1 - y0) * dpr), g = c.getContext('2d');
        g.scale(dpr, dpr);
        g.translate(-x0, -y0);
        const wraps = [['#c8202a', '#f0d070'], ['#1e6a3c', '#e8e0d0'], ['#2a4aa0', '#e8c060'], ['#e8e0d0', '#c8202a'], ['#8a2a6a', '#f0d0e0']];
        const boxes = [];
        const base = L.baseY + 10 * u;
        const spec = [[-0.55, 46, 34], [-0.25, 34, 26], [0.3, 40, 44], [0.6, 30, 22]];
        for (const [fx, bw, bh] of spec) {
            const x = L.treeX + fx * L.treeW, w = bw * u, h = bh * u, [paper, ribbon] = wraps[Math.floor(random() * wraps.length)];
            boxes.push({ x, y: base, w, h, paper, ribbon });
        }
        for (const b of boxes) box(g, b, u, random);
        // Ibbie's box: open, off to one side, empty.
        const side = L.tall ? -1 : -1;
        const ox = L.treeX + side * L.treeW * 0.95, oy = L.floor.y0 + (L.floor.y1 - L.floor.y0) * 0.25;
        const open = { x: ox, y: oy, w: 64 * u, h: 34 * u };
        return { canvas: c, x: x0, y: y0, w: x1 - x0, h: y1 - y0, boxes, open, back: openBox(open, u, dpr, 'back'), front: openBox(open, u, dpr, 'front') };
    }

    function box(g, b, u, random) {
        const { x, y, w, h } = b, d = h * 0.3;
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(x, y + 2, w * 0.7, d * 0.5, 0, 0, TAU); g.fill();
        g.fillStyle = b.paper; g.fillRect(x - w / 2, y - h, w, h);
        g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.moveTo(x - w / 2, y - h); g.lineTo(x - w / 2 + d, y - h - d * 0.6); g.lineTo(x + w / 2 + d, y - h - d * 0.6); g.lineTo(x + w / 2, y - h); g.fill();
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.moveTo(x + w / 2, y); g.lineTo(x + w / 2 + d, y - d * 0.6); g.lineTo(x + w / 2 + d, y - h - d * 0.6); g.lineTo(x + w / 2, y - h); g.fill();
        g.fillStyle = b.paper; g.globalAlpha = 0.85; g.beginPath(); g.moveTo(x - w / 2, y - h); g.lineTo(x - w / 2 + d, y - h - d * 0.6); g.lineTo(x + w / 2 + d, y - h - d * 0.6); g.lineTo(x + w / 2, y - h); g.fill(); g.globalAlpha = 1;
        // Polka dots or stripes.
        g.fillStyle = 'rgba(255,255,255,0.18)';
        if (random() < 0.5) for (let i = 0; i < 8; i++) { g.beginPath(); g.arc(x - w / 2 + random() * w, y - h + random() * h, 2 * u, 0, TAU); g.fill(); }
        // Ribbon and bow.
        g.fillStyle = b.ribbon;
        g.fillRect(x - 3 * u, y - h, 6 * u, h);
        g.beginPath(); g.ellipse(x - 6 * u, y - h - 4 * u, 7 * u, 4 * u, -0.5, 0, TAU); g.ellipse(x + 6 * u, y - h - 4 * u, 7 * u, 4 * u, 0.5, 0, TAU); g.fill();
        g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.arc(x, y - h - 3 * u, 3 * u, 0, TAU); g.fill();
    }

    // The open cardboard box, in two halves.
    function openBox(o, u, dpr, part) {
        const c = canvas((o.w + 40 * u) * dpr, (o.h + 40 * u) * dpr), g = c.getContext('2d');
        g.scale(dpr, dpr);
        const x = 20 * u, y = 20 * u + 10 * u, w = o.w, h = o.h;
        if (part === 'back') {
            g.fillStyle = '#8a6438'; g.fillRect(x, y - 8 * u, w, h * 0.5);
            g.fillStyle = '#a07848'; g.beginPath(); g.moveTo(x, y - 8 * u); g.lineTo(x - 10 * u, y - 22 * u); g.lineTo(x + w * 0.3, y - 20 * u); g.lineTo(x + w * 0.4, y - 8 * u); g.fill();
            g.beginPath(); g.moveTo(x + w, y - 8 * u); g.lineTo(x + w + 12 * u, y - 24 * u); g.lineTo(x + w * 0.65, y - 20 * u); g.lineTo(x + w * 0.6, y - 8 * u); g.fill();
        } else {
            g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(x + w / 2, y + h - 4 * u, w * 0.62, 6 * u, 0, 0, TAU); g.fill();
            g.fillStyle = '#b88a52'; g.fillRect(x, y, w, h - 6 * u);
            g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x, y, w, 3 * u);
            g.strokeStyle = 'rgba(80,50,20,0.5)'; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 7 * u);
            g.fillStyle = '#d8c8a0'; g.fillRect(x + w * 0.35, y, w * 0.3, 4 * u);
            g.fillStyle = 'rgba(60,40,20,0.55)'; g.font = `${8 * u}px sans-serif`; g.textAlign = 'center'; g.fillText('THIS SIDE UP ↑', x + w / 2, y + h * 0.6);
        }
        return { canvas: c, x: o.x - w / 2 - 20 * u, y: o.y - h - 30 * u + 6 * u, w: o.w + 40 * u, h: o.h + 40 * u };
    }

    // A warm glow sprite (the tree's light on the wall and floor; the fire).
    function glow(r, colour, a, dpr) {
        const s = Math.ceil(r * 2), c = canvas(s * Math.min(dpr, 1), s * Math.min(dpr, 1)), g = c.getContext('2d');
        g.scale(Math.min(dpr, 1), Math.min(dpr, 1));
        g.fillStyle = radial(g, s / 2, s / 2, s / 2, [[0, hex(colour, a)], [0.5, hex(colour, a * 0.35)], [1, hex(colour, 0)]]);
        g.fillRect(0, 0, s, s);
        return c;
    }

    return { PALETTES, ORNAMENTS, layout, background, tree, ornament, bulb, star, presents, glow, hex };
})();
