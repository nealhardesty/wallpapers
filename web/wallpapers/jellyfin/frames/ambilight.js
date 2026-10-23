// Ambilight: a slim panel floating on a dark slatted wall above a low
// walnut console, and the picture's colours spilling onto the wall around
// it. A few times a second the video is drawn into a 16×9 canvas (never read
// back: no getImageData and no ctx.filter, §4.8), eased towards, and scaled
// up as the glow; smooth scaling blurs it for free, and a falloff mask baked
// once per resize shapes it. On Low, or with nothing playing, the wall keeps
// a still, soft neutral glow. Upright phones get the panel over a shorter
// console, the glow spilling up and down instead.

(() => {
    'use strict';

    const SAMPLE_MS = 250;            // 4 samples a second
    const FRAME_MS = 125;             // the glow redraws at 8 fps; it drifts, it never jumps
    const EASE_MS = 420;              // how fast the glow follows the picture
    const FADE_MS = 900;              // the live glow fading in and out
    const CUT_MS = 650, OSD_MS = 1300;
    const SHRINK = 6;                 // the glow is built at 1/6 of the view, then scaled up
    const FONT = '"Helvetica Neue", "Segoe UI", system-ui, sans-serif';

    const seeded = seed => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const canvas = (w, h) => {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        return c;
    };
    const grow = (r, e) => ({ x: r.x - e, y: r.y - e, w: r.w + e * 2, h: r.h + e * 2 });

    function layout(w, h, aspect, env) {
        const portrait = h > w * 1.1;
        const floor = h - env.insets.bottom - Math.max(10, h * (portrait ? 0.035 : 0.05));
        let sw, sy, consoleH, cw;
        if (portrait) {
            consoleH = Math.max(40, Math.min(w * 0.2, h * 0.08));
            const top = floor - consoleH * 1.3;
            sw = Math.min(w * 0.88, (top - h * 0.16) * aspect);
            sy = Math.max(h * 0.08, Math.min(top * 0.42 - sw / aspect / 2, top - sw / aspect - Math.max(40, h * 0.12)));
            cw = w * 0.86;
        } else {
            consoleH = Math.max(34, Math.min(h * 0.1, 90));
            const top = h * 0.09, bottom = floor - consoleH * 1.32 - Math.max(24, h * 0.08);
            sw = Math.min(w * 0.6, (bottom - top) * aspect);
            sy = top + (bottom - top - sw / aspect) * 0.45;
            cw = Math.min(w * 0.92, sw * 1.25);
        }
        const sh = sw / aspect;
        const screen = { x: (w - sw) / 2, y: sy, w: sw, h: sh, radius: 1 };
        const bezel = Math.max(3, sw * 0.007);
        const panel = { ...grow(screen, bezel), radius: bezel * 0.9 };
        const legs = consoleH * 0.32;
        const cabinet = { x: (w - cw) / 2, y: floor - legs - consoleH, w: cw, h: consoleH };
        return { portrait, floor, screen, panel, bezel, cabinet, legs,
            slats: portrait ? w * 0.74 : sw * 1.55,
            spread: portrait ? sw * 0.75 : Math.max(sw, sh) * 0.42 };
    }

    // ---- The still art ------------------------------------------------------------

    function wall(ctx, L, w, h, random) {
        const paint = ctx.createLinearGradient(0, 0, 0, L.floor);
        paint.addColorStop(0, '#121317');
        paint.addColorStop(1, '#1a1b20');
        ctx.fillStyle = paint;
        ctx.fillRect(0, 0, w, L.floor);
        // A slatted oak panel behind the screen, floor to ceiling, for the
        // light to catch on.
        const pitch = Math.max(7, Math.round(Math.min(w, h) * 0.014));
        const x0 = w / 2 - L.slats / 2;
        ctx.fillStyle = '#08070a';
        ctx.fillRect(x0, 0, L.slats, L.floor);
        for (let x = x0; x < x0 + L.slats - pitch * 0.5; x += pitch) {
            const tone = 30 + random() * 10;
            ctx.fillStyle = `rgb(${tone + 12}, ${tone}, ${tone - 8})`;
            ctx.fillRect(x + pitch * 0.12, 0, pitch * 0.76, L.floor);
            ctx.fillStyle = 'rgba(255, 230, 200, 0.05)';
            ctx.fillRect(x + pitch * 0.12, 0, 1, L.floor);
        }
        const shade = ctx.createLinearGradient(0, 0, 0, L.floor);
        shade.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
        shade.addColorStop(0.5, 'rgba(0, 0, 0, 0.1)');
        shade.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
        ctx.fillStyle = shade;
        ctx.fillRect(x0, 0, L.slats, L.floor);
        for (const [edge, dir] of [[x0, 1], [x0 + L.slats, -1]]) {
            const side = ctx.createLinearGradient(edge, 0, edge + dir * 30, 0);
            side.addColorStop(0, 'rgba(0, 0, 0, 0.5)');
            side.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = side;
            ctx.fillRect(Math.min(edge, edge + dir * 30), 0, 30, L.floor);
        }
        // Skirting, then a dark oak floor.
        const floor = ctx.createLinearGradient(0, L.floor, 0, h);
        floor.addColorStop(0, '#17120f');
        floor.addColorStop(1, '#0b0908');
        ctx.fillStyle = floor;
        ctx.fillRect(0, L.floor, w, h - L.floor);
        ctx.fillStyle = '#1d1e22';
        ctx.fillRect(0, L.floor - 6, w, 6);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.fillRect(0, L.floor - 6, w, 1);
    }

    // The still glow: a soft, cool halo, as if the panel's own light lit the wall.
    function neutralGlow(ctx, L) {
        const { panel: p } = L;
        ctx.save();
        ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
        ctx.scale(1, L.portrait ? 1.5 : (p.h / p.w) * 1.5);
        const r = p.w / 2 + L.spread;
        const halo = ctx.createRadialGradient(0, 0, p.w * 0.25, 0, 0, r);
        halo.addColorStop(0, 'rgba(150, 168, 200, 0.26)');
        halo.addColorStop(0.5, 'rgba(120, 136, 170, 0.1)');
        halo.addColorStop(1, 'rgba(120, 136, 170, 0)');
        ctx.fillStyle = halo;
        ctx.fillRect(-r, -r, r * 2, r * 2);
        ctx.restore();
    }

    function cabinet(ctx, L, random) {
        const c = L.cabinet;
        // Its shadow on the floor, and two slim brass legs.
        const shadow = ctx.createRadialGradient(c.x + c.w / 2, L.floor, 0, c.x + c.w / 2, L.floor, c.w * 0.6);
        shadow.addColorStop(0, 'rgba(0, 0, 0, 0.6)');
        shadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.save();
        ctx.translate(0, L.floor);
        ctx.scale(1, 0.08);
        ctx.translate(0, -L.floor);
        ctx.fillStyle = shadow;
        ctx.fillRect(c.x - c.w * 0.1, L.floor - c.w * 0.6, c.w * 1.2, c.w * 1.2);
        ctx.restore();
        const lw = Math.max(3, c.h * 0.06);
        for (const fx of [0.07, 0.93]) {
            const x = c.x + c.w * fx;
            const brass = ctx.createLinearGradient(x - lw, 0, x + lw, 0);
            brass.addColorStop(0, '#5e4a2c');
            brass.addColorStop(0.5, '#c9a66b');
            brass.addColorStop(1, '#5e4a2c');
            ctx.fillStyle = brass;
            ctx.beginPath();
            ctx.moveTo(x - lw / 2, c.y + c.h);
            ctx.lineTo(x + lw / 2, c.y + c.h);
            ctx.lineTo(x + lw * 0.25, L.floor);
            ctx.lineTo(x - lw * 0.25, L.floor);
            ctx.fill();
        }
        // Matte black body, fluted doors, a walnut top.
        const body = ctx.createLinearGradient(0, c.y, 0, c.y + c.h);
        body.addColorStop(0, '#1b1b1e');
        body.addColorStop(1, '#0e0e10');
        ctx.fillStyle = body;
        JellyfinFrames.roundRect(ctx, c.x, c.y, c.w, c.h, 3);
        ctx.fill();
        const top = Math.max(4, c.h * 0.13), doors = L.portrait ? 3 : 4;
        for (let i = 1; i < doors; i++) {
            const x = c.x + (c.w * i) / doors;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.fillRect(x - 1, c.y + top, 1.5, c.h - top);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.fillRect(x + 0.5, c.y + top, 1, c.h - top);
        }
        const flute = Math.max(4, c.h * 0.07);
        for (let i = 1; i < doors - 1; i++) {
            const x0 = c.x + (c.w * i) / doors, x1 = c.x + (c.w * (i + 1)) / doors;
            for (let x = x0 + flute; x < x1 - flute * 0.5; x += flute) {
                const rib = ctx.createLinearGradient(x - flute / 2, 0, x + flute / 2, 0);
                rib.addColorStop(0, 'rgba(255, 255, 255, 0)');
                rib.addColorStop(0.5, 'rgba(255, 255, 255, 0.045)');
                rib.addColorStop(1, 'rgba(0, 0, 0, 0.25)');
                ctx.fillStyle = rib;
                ctx.fillRect(x - flute / 2, c.y + top + 3, flute, c.h - top - 6);
            }
        }
        const walnut = ctx.createLinearGradient(0, c.y, 0, c.y + top);
        walnut.addColorStop(0, '#7a5638');
        walnut.addColorStop(1, '#4a301d');
        ctx.fillStyle = walnut;
        JellyfinFrames.roundRect(ctx, c.x - 2, c.y - 1, c.w + 4, top, 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(40, 22, 10, 0.4)';
        ctx.lineWidth = 0.7;
        for (let i = 0; i < 5; i++) {
            const y = c.y + random() * top * 0.8;
            ctx.beginPath();
            ctx.moveTo(c.x, y);
            for (let x = c.x; x < c.x + c.w; x += 12) ctx.lineTo(x, y + Math.sin(x * 0.02 + i) * 0.8);
            ctx.stroke();
        }
    }

    // A few things on the console: a soundbar under the screen, books and a
    // ball on the left, a vase of dried stems on the right.
    function things(ctx, L, random) {
        const c = L.cabinet, s = L.screen;
        const surface = c.y - 1;
        const bar = { w: Math.min(s.w * 0.5, c.w * 0.4), h: Math.max(6, c.h * 0.17) };
        const bx = c.x + (c.w - bar.w) / 2;
        ctx.fillStyle = '#121214';
        JellyfinFrames.roundRect(ctx, bx, surface - bar.h, bar.w, bar.h, bar.h / 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        for (let x = bx + bar.h; x < bx + bar.w - bar.h; x += 4) for (let y = surface - bar.h * 0.72; y < surface - bar.h * 0.25; y += 4) ctx.fillRect(x, y, 1.2, 1.2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.fillRect(bx + bar.w / 2 - 1, surface - bar.h * 0.2, 2, 1);
        const unit = c.h;
        if (!L.portrait) {
            // Books, flat, and a little brass ball on them.
            let y = surface;
            for (const [color, bw, bh] of [['#3c4a3f', 0.95, 0.13], ['#8b6b4a', 0.82, 0.11], ['#2d3442', 0.88, 0.1]]) {
                const width = unit * bw, height = unit * bh, x = c.x + c.w * 0.1 + (unit - width) / 2;
                y -= height;
                ctx.fillStyle = color;
                ctx.fillRect(x, y, width, height);
                ctx.fillStyle = 'rgba(240, 230, 210, 0.5)';
                ctx.fillRect(x + width - 3, y + 1.5, 2, height - 3);
            }
            const r = unit * 0.14, bxl = c.x + c.w * 0.1 + unit / 2;
            const ball = ctx.createRadialGradient(bxl - r * 0.35, y - r * 1.35, r * 0.1, bxl, y - r, r);
            ball.addColorStop(0, '#f2d79c');
            ball.addColorStop(0.5, '#a8803f');
            ball.addColorStop(1, '#3e2c12');
            ctx.fillStyle = ball;
            ctx.beginPath();
            ctx.arc(bxl, y - r, r, 0, 7);
            ctx.fill();
        }
        // The vase: a pale stoneware bottle with three dried stems.
        const vx = c.x + c.w * (L.portrait ? 0.84 : 0.88), vh = unit * 0.85, vw = unit * 0.42;
        const stone = ctx.createLinearGradient(vx - vw / 2, 0, vx + vw / 2, 0);
        stone.addColorStop(0, '#6d655c');
        stone.addColorStop(0.35, '#b9afa2');
        stone.addColorStop(1, '#4a443e');
        ctx.strokeStyle = '#8a6a48';
        ctx.lineWidth = Math.max(1, unit * 0.018);
        ctx.lineCap = 'round';
        for (let i = 0; i < 3; i++) {
            const room = surface - vh - L.panel.y - L.panel.h - 10;
            const lean = (i - 1) * 0.35 + (random() - 0.5) * 0.2, len = Math.min(unit * (1.3 + random() * 0.9), L.portrait ? Infinity : room);
            const tx = vx + Math.sin(lean) * len, ty = surface - vh - Math.cos(lean) * len;
            ctx.beginPath();
            ctx.moveTo(vx, surface - vh * 0.8);
            ctx.quadraticCurveTo(vx + Math.sin(lean) * len * 0.3, surface - vh - len * 0.5, tx, ty);
            ctx.stroke();
            ctx.fillStyle = '#a07b52';
            for (let k = 0; k < 5; k++) {
                const q = 0.45 + k * 0.12;
                const lx = vx + (tx - vx) * q + (k % 2 ? 1 : -1) * unit * 0.05, ly = surface - vh * 0.8 + (ty - surface + vh * 0.8) * q;
                ctx.beginPath();
                ctx.ellipse(lx, ly, unit * 0.045, unit * 0.022, (k % 2 ? 0.6 : -0.6) + lean, 0, 7);
                ctx.fill();
            }
        }
        ctx.fillStyle = stone;
        ctx.beginPath();
        ctx.moveTo(vx - vw * 0.12, surface - vh);
        ctx.lineTo(vx + vw * 0.12, surface - vh);
        ctx.bezierCurveTo(vx + vw * 0.12, surface - vh * 0.6, vx + vw * 0.55, surface - vh * 0.55, vx + vw * 0.5, surface - vh * 0.25);
        ctx.quadraticCurveTo(vx + vw * 0.45, surface, vx + vw * 0.3, surface);
        ctx.lineTo(vx - vw * 0.3, surface);
        ctx.quadraticCurveTo(vx - vw * 0.45, surface, vx - vw * 0.5, surface - vh * 0.25);
        ctx.bezierCurveTo(vx - vw * 0.55, surface - vh * 0.55, vx - vw * 0.12, surface - vh * 0.6, vx - vw * 0.12, surface - vh);
        ctx.fill();
    }

    function screenPanel(ctx, L) {
        const { panel: p, screen: s } = L;
        // A soft shadow on the slats: the panel floats a hand's width off the wall.
        for (let i = 6; i >= 1; i--) {
            ctx.fillStyle = `rgba(0, 0, 0, ${0.07})`;
            JellyfinFrames.roundRect(ctx, p.x - i * 2, p.y - i + i * 2.5, p.w + i * 4, p.h + i * 2, p.radius + i * 2);
            ctx.fill();
        }
        ctx.fillStyle = '#050506';
        JellyfinFrames.roundRect(ctx, p.x, p.y, p.w, p.h, p.radius);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.09)';
        ctx.lineWidth = 1;
        JellyfinFrames.roundRect(ctx, p.x + 0.5, p.y + 0.5, p.w - 1, p.h - 1, p.radius);
        ctx.stroke();
        JellyfinFrames.cutScreen(ctx, s);
        // A faint sheen across the glass.
        ctx.save();
        JellyfinFrames.roundRect(ctx, s.x, s.y, s.w, s.h, s.radius);
        ctx.clip();
        const sheen = ctx.createLinearGradient(s.x, s.y, s.x + s.w * 0.7, s.y + s.h);
        sheen.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
        sheen.addColorStop(0.4, 'rgba(255, 255, 255, 0.015)');
        sheen.addColorStop(0.41, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = sheen;
        ctx.fillRect(s.x, s.y, s.w, s.h);
        ctx.restore();
    }

    function paint(ctx, L, env) {
        const { w, h } = env.viewport;
        const random = seeded(2026);
        wall(ctx, L, w, h, random);
        neutralGlow(ctx, L);
        cabinet(ctx, L, random);
        things(ctx, L, random);
        screenPanel(ctx, L);
    }

    // ---- The live glow ------------------------------------------------------------

    // The video, small: drawn to 48×27 with good smoothing, then down to
    // 16×9, so a single bright pixel can't flicker the whole wall. `mix` is
    // what the wall shows, eased towards the latest sample.
    const big = canvas(48, 27), small = canvas(16, 9), mix = canvas(16, 9), near = canvas(20, 13), soft = canvas(10, 8);
    const bigCtx = big.getContext('2d'), smallCtx = small.getContext('2d'), mixCtx = mix.getContext('2d');
    const nearCtx = near.getContext('2d'), softCtx = soft.getContext('2d');
    bigCtx.imageSmoothingQuality = smallCtx.imageSmoothingQuality = 'high';
    const stats = { samples: 0 };
    let glow = null;                 // { canvas, ctx, mask, key }: built once per resize
    let live = 0, lastT = 0, triedAt = -Infinity, sampledAt = -Infinity, has = false;
    let shown = null;                // { kind, at }: a cut or an OSD pill

    function sample(video) {
        if (!video || video.readyState < 2 || !video.videoWidth) return false;
        try {
            bigCtx.drawImage(video, 0, 0, 48, 27);
            smallCtx.clearRect(0, 0, 16, 9);
            smallCtx.drawImage(big, 0, 0, 16, 9);
        } catch { return false; }
        stats.samples++;
        return true;
    }

    // The falloff: rounded rings, brightest against the panel, fading out
    // over `spread`, a little dimmer where it falls on the console.
    function buildGlow(L, w, h) {
        const key = `${w}x${h}:${L.panel.x},${L.panel.y},${L.panel.w}`;
        if (glow?.key === key) return glow;
        const gw = Math.ceil(w / SHRINK), gh = Math.ceil(h / SHRINK);
        const mask = canvas(gw, gh), m = mask.getContext('2d');
        m.scale(1 / SHRINK, 1 / SHRINK);
        m.globalCompositeOperation = 'lighter';
        const rings = 36, curve = 2.3;
        for (let i = 0; i < rings; i++) {
            const e = L.spread * (1 - i / rings);
            const r = grow(L.panel, e);
            m.fillStyle = `rgba(255, 255, 255, ${((i + 1) / rings) ** curve - (i / rings) ** curve})`;
            JellyfinFrames.roundRect(m, r.x, r.y, r.w, r.h, e * 0.9 + L.panel.radius);
            m.fill();
        }
        m.globalCompositeOperation = 'destination-out';
        m.fillStyle = 'rgba(0, 0, 0, 0.55)';
        m.fillRect(L.cabinet.x, L.cabinet.y, L.cabinet.w, L.floor - L.cabinet.y);
        const c = canvas(gw, gh);
        return (glow = { canvas: c, ctx: c.getContext('2d'), mask, key });
    }

    function drawGlow(ctx, L, env, alpha) {
        const { w, h } = env.viewport;
        const g = buildGlow(L, w, h), gc = g.ctx, s = L.screen;
        gc.setTransform(1 / SHRINK, 0, 0, 1 / SHRINK, 0, 0);
        gc.globalCompositeOperation = 'source-over';
        gc.clearRect(0, 0, w, h);
        const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
        // Two layers of the picture blown up behind the panel: a very soft
        // wide one carries the colours out, and a near one keeps them true
        // along the panel's sides. Each sits in a clear border, so smoothing
        // feathers its edges rather than leaving a hard rectangle on the wall.
        nearCtx.clearRect(0, 0, 20, 13);
        nearCtx.drawImage(mix, 2, 2);
        softCtx.clearRect(0, 0, 10, 8);
        softCtx.drawImage(mix, 2, 2, 6, 4);
        for (const [source, inner, scale, a] of [[soft, [6, 4], 3, 1], [near, [16, 9], 1.2, 0.85]]) {
            const gw = s.w * (L.portrait ? 1 + (scale - 1) * 0.5 : scale), gh = s.h * (L.portrait ? 1 + (scale - 1) * 2.6 : scale);
            const kx = gw / inner[0], ky = gh / inner[1];
            gc.globalAlpha = a;
            gc.drawImage(source, cx - gw / 2 - kx * 2, cy - gh / 2 - ky * 2, source.width * kx, source.height * ky);
        }
        gc.globalAlpha = 1;
        gc.setTransform(1, 0, 0, 1, 0, 0);
        gc.globalCompositeOperation = 'destination-in';
        gc.drawImage(g.mask, 0, 0);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, w, h);
        ctx.roundRect(L.panel.x, L.panel.y, L.panel.w, L.panel.h, L.panel.radius);
        ctx.clip('evenodd');
        ctx.globalAlpha = alpha;
        ctx.drawImage(g.canvas, 0, 0, g.canvas.width * SHRINK, g.canvas.height * SHRINK);
        ctx.restore();
    }

    // Returns ms until the glow next needs drawing.
    function tickGlow(ctx, t, L, env) {
        if (!env.effects.has('ambilight')) { live = 0; has = false; return Infinity; }
        const dt = Math.min(500, Math.max(0, t - lastT));
        lastT = t;
        let fresh = false;
        if (env.playing && t - triedAt >= SAMPLE_MS - 8) {
            triedAt = t;
            fresh = sample(env.video);
            if (fresh) sampledAt = t;
        }
        if (fresh && !has) {
            mixCtx.globalAlpha = 1;
            mixCtx.drawImage(small, 0, 0);
            has = true;
        } else if (has && t - sampledAt < EASE_MS * 5) {
            mixCtx.globalAlpha = 1 - Math.exp(-dt / EASE_MS);
            mixCtx.drawImage(small, 0, 0);
        }
        const want = (env.playing || env.paused) && has ? 1 : 0;
        live = want > live ? Math.min(1, live + dt / FADE_MS) : Math.max(0, live - dt / FADE_MS);
        if (live > 0) drawGlow(ctx, L, env, live * 0.9);
        else if (!want) has = false;
        if (env.playing) return Math.max(16, Math.min(FRAME_MS, SAMPLE_MS - (t - triedAt)));
        return live !== want || (has && t - sampledAt < EASE_MS * 5) ? FRAME_MS : Infinity;
    }

    // ---- Transitions: a soft dip to black between items, a pill for pause and play

    function tickShown(ctx, t, L) {
        if (!shown) return Infinity;
        const s = L.screen, age = t - shown.at;
        if (shown.kind === 'change') {
            if (age >= CUT_MS) { shown = null; return Infinity; }
            ctx.fillStyle = `rgba(0, 0, 0, ${0.9 * Math.sin(Math.PI * Math.min(1, age / CUT_MS))})`;
            ctx.fillRect(s.x, s.y, s.w, s.h);
            return 33;
        }
        if (age >= OSD_MS) { shown = null; return Infinity; }
        const size = Math.max(30, Math.min(64, s.h * 0.12));
        const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
        ctx.save();
        ctx.globalAlpha = Math.min(1, age / 120, (OSD_MS - age) / 400);
        ctx.fillStyle = 'rgba(20, 20, 24, 0.6)';
        ctx.beginPath();
        ctx.arc(cx, cy, size, 0, 7);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
        if (shown.kind === 'pause') {
            ctx.fillRect(cx - size * 0.3, cy - size * 0.36, size * 0.2, size * 0.72);
            ctx.fillRect(cx + size * 0.1, cy - size * 0.36, size * 0.2, size * 0.72);
        } else {
            ctx.beginPath();
            ctx.moveTo(cx - size * 0.24, cy - size * 0.4);
            ctx.lineTo(cx + size * 0.42, cy);
            ctx.lineTo(cx - size * 0.24, cy + size * 0.4);
            ctx.fill();
        }
        ctx.restore();
        return 33;
    }

    // ---- Idle: the panel dimmed, a small icon, the words in a quiet face ------------

    function icon(ctx, kind, x, y, u) {
        ctx.save();
        ctx.strokeStyle = ctx.fillStyle = 'rgba(220, 226, 240, 0.7)';
        ctx.lineWidth = Math.max(1.2, u * 0.08);
        ctx.lineCap = ctx.lineJoin = 'round';
        ctx.beginPath();
        if (kind === 'connecting' || kind === 'loading') {
            for (let i = -1; i <= 1; i++) { ctx.moveTo(x + i * u * 0.6 + u * 0.12, y); ctx.arc(x + i * u * 0.6, y, u * 0.12, 0, 7); }
            ctx.fill();
        } else if (kind === 'offline') {
            for (const r of [0.3, 0.6, 0.9]) ctx.arc(x, y + u * 0.45, u * r, -Math.PI * 0.75, -Math.PI * 0.25);
            ctx.moveTo(x - u * 0.7, y - u * 0.55);
            ctx.lineTo(x + u * 0.7, y + u * 0.55);
            ctx.stroke();
        } else if (kind === 'empty') {
            ctx.setLineDash([u * 0.18, u * 0.14]);
            ctx.roundRect(x - u * 0.8, y - u * 0.5, u * 1.6, u, u * 0.15);
            ctx.stroke();
        } else if (kind === 'away') {
            ctx.roundRect(x - u * 0.8, y - u * 0.35, u * 1.1, u * 0.75, u * 0.1);
            ctx.moveTo(x - u * 0.4, y - u * 0.55);
            ctx.lineTo(x + u * 0.7, y - u * 0.55);
            ctx.lineTo(x + u * 0.7, y + u * 0.15);
            ctx.stroke();
        } else {
            // An input: a screen with an arrow going in.
            ctx.roundRect(x - u * 0.55, y - u * 0.5, u * 1.3, u, u * 0.12);
            ctx.moveTo(x - u * 0.95, y);
            ctx.lineTo(x + u * 0.15, y);
            ctx.moveTo(x - u * 0.15, y - u * 0.28);
            ctx.lineTo(x + u * 0.15, y);
            ctx.lineTo(x - u * 0.15, y + u * 0.28);
            ctx.stroke();
        }
        ctx.restore();
    }

    function idle(ctx, L, env, kind) {
        const [title, detail] = JellyfinFrames.IDLE[kind] || JellyfinFrames.IDLE.setup;
        const s = L.screen;
        const dim = ctx.createRadialGradient(s.x + s.w * 0.5, s.y + s.h * 0.45, 0, s.x + s.w * 0.5, s.y + s.h * 0.45, Math.hypot(s.w, s.h) * 0.55);
        dim.addColorStop(0, '#16181e');
        dim.addColorStop(1, '#08090b');
        ctx.fillStyle = dim;
        ctx.fillRect(s.x, s.y, s.w, s.h);
        const px = Math.max(13, Math.min(30, s.w / 26));
        const cx = s.x + s.w / 2, cy = s.y + s.h * 0.47;
        icon(ctx, kind, cx, cy - px * 2, px * 0.9);
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.letterSpacing = `${(px * 0.28).toFixed(1)}px`;
        ctx.font = `300 ${px}px ${FONT}`;
        ctx.fillStyle = 'rgba(236, 240, 248, 0.88)';
        ctx.fillText(title.replace('…', ''), cx + px * 0.14, cy);
        ctx.letterSpacing = '0px';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.fillRect(cx - px * 1.2, cy + px * 0.95, px * 2.4, 1);
        if (detail) {
            ctx.font = `400 ${Math.max(11, px * 0.5)}px ${FONT}`;
            ctx.fillStyle = 'rgba(200, 206, 220, 0.6)';
            JellyfinFrames.wrap(ctx, detail, s.w * 0.8).slice(0, 2).forEach((line, i) => ctx.fillText(line, cx, cy + px * 1.75 + i * px * 0.75));
        }
        ctx.restore();
        // The standby light, under the screen.
        const red = kind === 'offline' || kind === 'signedout';
        ctx.fillStyle = red ? 'rgba(255, 70, 50, 0.9)' : 'rgba(255, 255, 255, 0.55)';
        ctx.beginPath();
        ctx.arc(s.x + s.w / 2, L.panel.y + L.panel.h - L.bezel / 2, Math.max(1, L.bezel * 0.22), 0, 7);
        ctx.fill();
    }

    JellyfinFrames.add({
        id: 'ambilight',
        name: 'Ambilight',
        icon: '🌈',
        stats,
        layout,
        paint,
        idle,

        transition(kind, env) {
            shown = { kind, at: performance.now() };
            env.busy(kind === 'change' ? CUT_MS : OSD_MS);
        },

        tick(ctx, t, L, env) {
            return Math.min(tickGlow(ctx, t, L, env), tickShown(ctx, t, L));
        },

        // Clean white type on a soft dark band rising from the bottom of the screen.
        cue(ctx, text, L) {
            const s = L.screen;
            const band = ctx.createLinearGradient(0, s.y + s.h * 0.62, 0, s.y + s.h);
            band.addColorStop(0, 'rgba(0, 0, 0, 0)');
            band.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
            ctx.fillStyle = band;
            ctx.fillRect(s.x, s.y + s.h * 0.62, s.w, s.h * 0.38);
            JellyfinFrames.drawCue(ctx, text, s, { font: `500 {size}px ${FONT}`, color: '#f6f6f8', box: null, outline: 'rgba(0, 0, 0, 0.35)', bottom: 0.07 });
        },
    });
})();
