// Frost on the Glass: the art, baked when the screen is sized. We're
// outside on a cold night, looking in. The room behind the glass is out of
// focus: warm walls, a lamp, the fire's glow, and a Christmas tree that's
// only a dark cone and the soft discs of its lights. The frost is lit from
// behind, so its colour is a cold white plus that room, blurred: it glows
// amber in front of the tree and stays blue-white in the dark corners.

const FrostArt = (() => {
    const rgb = hex => { const n = parseInt(String(hex).slice(1), 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
    const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
    const css = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
    const WHITE = [255, 255, 255];
    function canvas(w, h) {
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.ceil(w));
        c.height = Math.max(1, Math.ceil(h));
        return c;
    }

    const LIGHTS = {
        warm: ['#ffc46b', '#ffb04a', '#ffd38a', '#ff9f3d'],
        multi: ['#ff4b3e', '#3ddc6a', '#4b8bff', '#ffb02e', '#ff6bd2', '#ffd84a'],
        blue: ['#7fb8ff', '#a8d4ff', '#5c8dff', '#e6f2ff'],
        candle: ['#ffb35c', '#ff9440', '#ffcf7a'],
    };
    const FRAMES = { white: '#e4e1da', wood: '#6a4529', green: '#2e5641', red: '#8a2c24' };

    // A bokeh disc: an out-of-focus light is a disc, a little brighter at
    // its rim, softly edged.
    function disc(colour, r, dpr) {
        const s = Math.ceil(r * 2 + 4);
        const c = canvas(s * dpr, s * dpr), g = c.getContext('2d');
        g.scale(dpr, dpr);
        const col = rgb(colour), hot = mix(col, WHITE, 0.35);
        const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, r);
        grad.addColorStop(0, css(hot, 0.42));
        grad.addColorStop(0.7, css(col, 0.5));
        grad.addColorStop(0.88, css(mix(col, WHITE, 0.2), 0.62));
        grad.addColorStop(0.97, css(col, 0.2));
        grad.addColorStop(1, css(col, 0));
        g.fillStyle = grad;
        g.fillRect(0, 0, s, s);
        return { c, s };
    }

    // The room, its tree and the tree's lights (as discs to twinkle, drawn
    // live), and the frost's backlit colour.
    function room(L, dpr, o, random) {
        const { W, H, u } = L;
        const palette = LIGHTS[o.lights] || LIGHTS.warm;
        const blur = o.blur ?? 1;
        const side = o.treeSide === 'left' ? 0.3 : o.treeSide === 'right' ? 0.7 : 0.5;
        const style = o.treeStyle || 'fir', size = o.treeSize ?? 1, width = o.treeWidth ?? 1;
        const bottom = H * 1.02, top0 = H * (H > W ? 0.3 : 0.14);
        const tree = { x: W * side, top: bottom - (bottom - top0) * size * (style === 'charlie' ? 0.78 : 1), bottom, style };
        tree.w = Math.min(W * (H > W ? 0.8 : 0.42) * Math.max(1, width), (tree.bottom - tree.top) * 0.78 * width);
        // The room, painted sharp at a quarter of the size, then blurred up.
        const q = 0.25, sw = Math.ceil(W * q), sh = Math.ceil(H * q);
        const sharp = canvas(sw, sh), s = sharp.getContext('2d');
        s.scale(q, q);
        const wall = s.createLinearGradient(0, 0, 0, H);
        wall.addColorStop(0, '#1d120c'); wall.addColorStop(0.6, '#2b190f'); wall.addColorStop(1, '#170d08');
        s.fillStyle = wall; s.fillRect(0, 0, W, H);
        const glow = (x, y, r, colour, a) => {
            const grd = s.createRadialGradient(x, y, 0, x, y, r);
            grd.addColorStop(0, css(rgb(colour), a)); grd.addColorStop(1, css(rgb(colour), 0));
            s.fillStyle = grd; s.fillRect(x - r, y - r, 2 * r, 2 * r);
        };
        const lampX = side < 0.5 ? W * 0.85 : W * 0.14;
        glow(lampX, H * 0.4, Math.max(W, H) * 0.55, '#ffa257', 0.3);       // a lamp across the room
        glow(lampX, H * 0.36, Math.max(W, H) * 0.12, '#ffe0a8', 0.45);
        glow(side < 0.5 ? W * 0.98 : W * 0.02, H * 0.95, Math.max(W, H) * 0.4, '#ff6a2a', 0.22);   // the fire, off to one side
        // A picture rail and a sofa's back, just shapes.
        s.fillStyle = 'rgba(0,0,0,0.25)'; s.fillRect(0, H * 0.22, W, H * 0.012);
        s.fillStyle = 'rgba(40,16,10,0.85)';
        s.beginPath(); s.roundRect(lampX - W * 0.25, H * 0.72, W * 0.5, H * 0.4, H * 0.05); s.fill();
        if (style !== 'none') glow(tree.x, tree.top + (tree.bottom - tree.top) * 0.55, tree.w * 1.1, '#ffae55', 0.28);
        // The tree: tiers of dark boughs; or a Charlie Brown sapling, a bent
        // stick with a few drooping branches, bowed under one red ball.
        s.fillStyle = '#0c2414';
        const charlieLights = [];
        if (style === 'fir') {
            const tiers = 5, th = (tree.bottom - tree.top) / tiers;
            for (let i = 0; i < tiers; i++) {
                const y0 = tree.top + i * th * 0.92, y1 = y0 + th * 1.35, w = tree.w * (0.25 + 0.75 * (i + 1) / tiers);
                s.beginPath(); s.moveTo(tree.x, y0); s.lineTo(tree.x + w / 2, y1); s.lineTo(tree.x - w / 2, y1); s.closePath(); s.fill();
            }
        } else if (style === 'charlie') {
            const th = tree.bottom - tree.top, lean = 0.08;
            const trunk = t => ({ x: tree.x + lean * th * t * t, y: tree.bottom - th * t });
            s.strokeStyle = '#5a3a1e'; s.lineCap = 'round';
            for (let i = 0; i < 16; i++) { const a = trunk(i / 16), b = trunk((i + 1) / 16); s.lineWidth = (22 - 13 * i / 16) * u; s.beginPath(); s.moveTo(a.x, a.y); s.lineTo(b.x, b.y); s.stroke(); }
            for (let i = 0; i < 5; i++) {
                const t = 0.25 + i * 0.16, r = trunk(t), sideOf = i % 2 ? 1 : -1, len = tree.w * (0.6 - t * 0.3), droop = len * 0.5;
                s.strokeStyle = '#5a3a1e'; s.lineWidth = 9 * u;
                s.beginPath(); s.moveTo(r.x, r.y); s.quadraticCurveTo(r.x + sideOf * len * 0.55, r.y - droop * 0.25, r.x + sideOf * len, r.y + droop); s.stroke();
                s.fillStyle = '#2a6a36';
                for (let k = 0; k < 3; k++) { const q = 0.35 + k * 0.3, px = r.x + sideOf * len * q, py = r.y + droop * q * q; s.beginPath(); s.ellipse(px, py + 6 * u, 16 * u, 9 * u, sideOf * 0.4, 0, Math.PI * 2); s.fill(); }
                if (i < 3) charlieLights.push({ x: r.x + sideOf * len * 0.6, y: r.y + droop * 0.36 });
            }
            // A blanket round the foot.
            s.fillStyle = '#3f74c0';
            s.beginPath(); s.ellipse(tree.x, tree.bottom - 10 * u, tree.w * 0.32, 20 * u, 0, 0, Math.PI * 2); s.fill();
            tree.crown = trunk(1);
        }
        const base = canvas(W * dpr, H * dpr), b = base.getContext('2d');
        b.filter = `blur(${Math.round(10 * u * dpr * blur)}px)`;
        b.drawImage(sharp, -20 * dpr, -20 * dpr, (W + 40) * dpr, (H + 40) * dpr);
        b.filter = 'none';
        // The lights: wound round the tree in a loose spiral, nearer ones bigger.
        const n = style !== 'fir' ? 0 : Math.round((o.lightCount ?? o.count ?? 46) * Math.max(0.6, Math.min(1.4, Math.sqrt(W * H) / 1000)));
        const discs = [];
        for (let i = 0; i < n; i++) {
            const h = 0.06 + 0.92 * Math.pow((i + random()) / n, 0.8);
            const wAt = tree.w * (0.15 + 0.85 * h);
            const turn = h * 7.5 + random() * 0.6;
            const depth = Math.cos(turn * Math.PI * 2);              // front of the tree: +1
            const x = tree.x + Math.sin(turn * Math.PI * 2) * wAt * 0.45 + (random() - 0.5) * wAt * 0.1;
            const y = tree.top + h * (tree.bottom - tree.top) * 0.95;
            const r = blur * u * (11 + 9 * random()) * (0.8 + 0.25 * depth);
            discs.push({ x, y, r, colour: palette[i % palette.length], a: 0.45 + 0.4 * (depth + 1) / 2, phase: random() * 7, speed: 0.4 + random() * 1.1 });
        }
        if (style === 'fir') discs.push({ x: tree.x, y: tree.top + 6 * u, r: blur * u * 30, colour: '#ffe4a0', a: 0.9, phase: 0, speed: 0.25 });     // the star
        if (style === 'charlie') {
            // The one red ball, and three bulbs, the lot of it.
            discs.push({ x: tree.crown.x + 14 * u, y: tree.crown.y + 30 * u, r: blur * u * 30, colour: '#ff3030', a: 0.95, phase: 0, speed: 0.2 });
            for (const l of charlieLights) discs.push({ x: l.x, y: l.y, r: blur * u * 14, colour: palette[discs.length % palette.length], a: 0.75, phase: random() * 7, speed: 0.5 + random() * 0.8 });
        }
        for (let i = 0; i < 5; i++) discs.push({ x: random() * W, y: H * (0.1 + random() * 0.5), r: blur * u * (24 + random() * 24), colour: random() < 0.5 ? '#ffcf8a' : '#ff9d5c', a: 0.16, phase: random() * 7, speed: 0.1 });
        const sprites = {};
        for (const d of discs) {
            const key = d.colour + ':' + Math.round(d.r);
            d.sprite = sprites[key] = sprites[key] || disc(d.colour, Math.round(d.r), dpr);
        }
        // The frost's colour: cold white, plus the room shining through it.
        const tint = canvas(W * dpr, H * dpr), t = tint.getContext('2d');
        t.fillStyle = '#b9c8d8'; t.fillRect(0, 0, tint.width, tint.height);
        const lit = canvas(W * dpr, H * dpr), lg = lit.getContext('2d');
        lg.drawImage(base, 0, 0);
        lg.globalCompositeOperation = 'lighter';
        lg.scale(dpr, dpr);
        for (const d of discs) lg.drawImage(d.sprite.c, d.x - d.sprite.s / 2, d.y - d.sprite.s / 2, d.sprite.s, d.sprite.s);
        t.globalCompositeOperation = 'lighter';
        t.filter = `blur(${Math.round(16 * u * dpr)}px)`;
        t.globalAlpha = 0.95;
        t.drawImage(lit, 0, 0);
        t.filter = 'none';
        t.globalAlpha = 1;
        return { base, discs, tint, tree };
    }

    // ---- The window frame, outside, at night --------------------------------------------------

    function frame(L, dpr, o, random) {
        const { W, H, u } = L;
        const c = canvas(W * dpr, H * dpr), g = c.getContext('2d');
        g.scale(dpr, dpr);
        const paint = mix(rgb(FRAMES[o.colour] || FRAMES.white), [44, 58, 88], 0.42);     // moonlit
        // Everything but the glass.
        g.fillStyle = css(paint);
        g.beginPath();
        g.rect(0, 0, W, H);
        for (const p of L.panes) g.rect(p.x + p.w, p.y, -p.w, p.h);
        g.fill('evenodd');
        // Grain or brush marks, faint.
        g.save();
        g.beginPath(); g.rect(0, 0, W, H); for (const p of L.panes) g.rect(p.x + p.w, p.y, -p.w, p.h); g.clip('evenodd');
        for (let i = 0; i < 260; i++) {
            const x = random() * W, y = random() * H, horiz = random() < 0.5;
            g.fillStyle = random() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.04)';
            horiz ? g.fillRect(x, y, 30 + random() * 90, 1) : g.fillRect(x, y, 1, 30 + random() * 90);
        }
        g.restore();
        // Each opening: a bevel, shadowed above, catching the room's warm light below,
        // and the glazing putty against the glass.
        for (const p of L.panes) {
            const b = Math.max(2, 4 * u);
            g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(p.x - b, p.y - b, p.w + 2 * b, b);
            g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(p.x - b, p.y, b, p.h);
            g.fillStyle = 'rgba(255,170,100,0.22)'; g.fillRect(p.x - b, p.y + p.h, p.w + 2 * b, b);
            g.fillStyle = 'rgba(255,170,100,0.14)'; g.fillRect(p.x + p.w, p.y, b, p.h);
            g.strokeStyle = 'rgba(20,24,32,0.6)'; g.lineWidth = Math.max(1, 1.5 * u);
            g.strokeRect(p.x + 0.5, p.y + 0.5, p.w - 1, p.h - 1);
            // The glass: a faint cold sheen across it.
            const sheen = g.createLinearGradient(p.x, p.y, p.x + p.w, p.y + p.h);
            sheen.addColorStop(0, 'rgba(170,200,240,0.07)'); sheen.addColorStop(0.35, 'rgba(170,200,240,0.015)');
            sheen.addColorStop(0.55, 'rgba(200,220,255,0.05)'); sheen.addColorStop(1, 'rgba(170,200,240,0)');
            g.fillStyle = sheen; g.fillRect(p.x, p.y, p.w, p.h);
        }
        // The sill: its top catches a little light; below it, the house.
        const sy = L.inner.y + L.inner.h;
        const sill = g.createLinearGradient(0, sy, 0, sy + L.sill);
        sill.addColorStop(0, css(mix(paint, WHITE, 0.12))); sill.addColorStop(0.35, css(paint)); sill.addColorStop(1, css(mix(paint, [0, 0, 0], 0.4)));
        g.fillStyle = sill; g.fillRect(0, sy + L.fw * 0.3, W, L.sill - L.fw * 0.3);
        if (H > sy + L.sill) {
            g.fillStyle = '#141b28'; g.fillRect(0, sy + L.sill, W, H - sy - L.sill);
            g.fillStyle = 'rgba(255,255,255,0.05)';
            for (let y = sy + L.sill + 10 * u; y < H; y += 14 * u) g.fillRect(0, y, W, 1);
        }
        // Snow: drifted along the sill, a ridge on each glazing bar.
        const ridge = (x0, x1, y, h, bumps) => {
            g.beginPath();
            g.moveTo(x0, y + 1);
            for (let x = x0; x <= x1 + 4; x += 6 * u) {
                const k = (x - x0) / Math.max(1, x1 - x0);
                const edge = Math.min(1, k * 8, (1 - k) * 8);
                g.lineTo(x, y - h * edge * (0.75 + 0.25 * Math.sin(x * 0.05 + bumps) + 0.12 * Math.sin(x * 0.21 + bumps * 3)));
            }
            g.lineTo(x1, y + 1);
            g.closePath();
            const snow = g.createLinearGradient(0, y - h, 0, y);
            snow.addColorStop(0, '#f1f6ff'); snow.addColorStop(0.6, '#c9d6ea'); snow.addColorStop(1, '#9fb2cf');
            g.fillStyle = snow;
            g.fill();
        };
        ridge(0, W, sy + L.fw * 0.35, L.sill * 0.5, random() * 9);
        for (let r = 1; r < L.rows; r++) {
            const y = L.panes[r * L.cols].y - L.mw * 0.15;
            for (let col = 0; col < L.cols; col++) { const p = L.panes[col]; ridge(p.x - L.mw / 2, p.x + p.w + L.mw / 2, y, L.mw * 0.55, random() * 9); }
        }
        // Glitter in the snow.
        g.fillStyle = 'rgba(255,255,255,0.7)';
        for (let i = 0; i < 80; i++) g.fillRect(random() * W, sy - L.sill * 0.3 + random() * L.sill * 0.6, 1, 1);
        return c;
    }

    // ---- Small sprites ----------------------------------------------------------------------------

    // A soft round spot (white), for haze, fog and the fingertip that clears frost.
    function soft(r, dpr, hard = 0) {
        const s = Math.ceil(r * 2);
        const c = canvas(s * dpr, s * dpr), g = c.getContext('2d');
        const R = s * dpr / 2;
        const grad = g.createRadialGradient(R, R, 0, R, R, R);
        grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(hard, 'rgba(255,255,255,1)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grad; g.fillRect(0, 0, c.width, c.height);
        return { c, s };
    }

    // A glint: light catching a facet of the frost.
    function glint(r, dpr) {
        const s = Math.ceil(r * 2 + 2);
        const c = canvas(s * dpr, s * dpr), g = c.getContext('2d');
        g.scale(dpr, dpr); g.translate(s / 2, s / 2);
        const halo = g.createRadialGradient(0, 0, 0, 0, 0, r * 0.3);
        halo.addColorStop(0, 'rgba(255,255,255,0.8)'); halo.addColorStop(1, 'rgba(220,235,255,0)');
        g.fillStyle = halo; g.fillRect(-r, -r, 2 * r, 2 * r);
        g.strokeStyle = 'rgba(240,248,255,0.85)'; g.lineCap = 'round';
        for (const [a, len, w] of [[0, 1, 0.7], [Math.PI / 2, 1, 0.7], [Math.PI / 4, 0.4, 0.5], [-Math.PI / 4, 0.4, 0.5]]) {
            g.lineWidth = w;
            g.beginPath(); g.moveTo(-Math.cos(a) * r * len, -Math.sin(a) * r * len); g.lineTo(Math.cos(a) * r * len, Math.sin(a) * r * len); g.stroke();
        }
        return { c, s };
    }

    // A snowflake that has landed on the glass: six arms, each with a pair of twigs.
    function crystal(r, dpr) {
        const s = Math.ceil(r * 2 + 2);
        const c = canvas(s * dpr, s * dpr), g = c.getContext('2d');
        g.scale(dpr, dpr); g.translate(s / 2, s / 2);
        g.strokeStyle = 'rgba(235,244,255,0.9)'; g.lineWidth = Math.max(0.6, r * 0.12); g.lineCap = 'round';
        for (let i = 0; i < 6; i++) {
            g.save(); g.rotate(i * Math.PI / 3);
            g.beginPath(); g.moveTo(0, 0); g.lineTo(r, 0);
            g.moveTo(r * 0.55, 0); g.lineTo(r * 0.8, -r * 0.22); g.moveTo(r * 0.55, 0); g.lineTo(r * 0.8, r * 0.22);
            g.stroke(); g.restore();
        }
        return { c, s };
    }

    return { LIGHTS, FRAMES, room, frame, disc, soft, glint, crystal, rgb, mix, css };
})();
