// Arcade: the video plays in an upright cabinet at the back of an arcade.
// A backlit marquee with the title in chrome letters over a synthwave sun,
// a CRT behind a printed bezel, a joystick and six buttons, a coin door with
// glowing 25¢ inserts, bold side art, and a cosmic carpet underfoot. In a
// landscape view its neighbours stand either side in the gloom. Every few
// seconds the marquee glints and the coin lights swell; between items the
// screen asks you to INSERT COIN; idle, it runs its attract mode, starring a
// pixel jellyfish. Upright phones get the cabinet head-on under a neon sign.

(() => {
    'use strict';

    const CHROME = '900 {size}px Impact, "Haettenschweiler", "Arial Black", "Helvetica Neue", system-ui, sans-serif';
    const NEON = { pink: '#ff3fa4', cyan: '#2ee6ff', yellow: '#ffd23f', violet: '#8a5cff', orange: '#ff8a2a', green: '#5dff8a' };
    const COIN_MS = 1900, READY_MS = 1000, BLINK_MS = 530;
    const ATTRACT_EVERY = 7000, ATTRACT_FOR = 2600, STEP_MS = 83, SPARKLE_MS = 700;
    // The cabinet, in screen heights (rail: in screen widths).
    const K = { cap: 0.05, marquee: 0.34, bezel: 0.1, rail: 0.05, deck: 0.2, face: 0.13, kick: 0.07 };

    const seeded = seed => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const sprite = (w, h, draw) => {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.ceil(w));
        canvas.height = Math.max(1, Math.ceil(h));
        draw(canvas.getContext('2d'));
        return canvas;
    };

    // ---- A 5×7 pixel font ----------------------------------------------------------------
    // Each glyph is seven rows of five bits, one base-32 digit per row.
    const GLYPH_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ .,!?\'"-:;()/&+%#*=<>';
    const GLYPH_ROWS = 'ehjlphe4c4444eeh1248vv2421he26aiv22vgu11he68guhhev124888ehhehheehhf12cehhvhhhuhhuhhuehgggheuhhhhhuvgguggvvggugggehgnhhfhhhvhhh'
        + 'e44444e72222ichikokihggggggvhrllhhhhhpljhhehhhhheuhhugggehhhliduhhukihfgge11uv444444hhhhhhehhhhha4hhhlllahha4ahhhhha444v1248gv'
        + '000000000000cc0000c484444404eh124044480000aaa0000000v0000cc0cc00cc0c482488842842224801248g0cik8lid044v440op248j3aavavaa04lel40'
        + '00v0v00248g8428421248';
    const GLYPHS = new Map([...GLYPH_CHARS].map((c, i) => [c, [...GLYPH_ROWS.slice(i * 7, i * 7 + 7)].map(r => parseInt(r, 32))]));

    // The text as the font can spell it (capitals, plain quotes, no accents), or null.
    function pixelable(text) {
        const plain = String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’]/g, '\'').replace(/[“”]/g, '"')
            .replace(/…/g, '...').replace(/[–—]/g, '-').toUpperCase();
        return [...plain].every(c => GLYPHS.has(c) || c === '\n') ? plain : null;
    }

    // A line of pixel text at one canvas pixel per dot, cached.
    const lineCache = new Map();
    function pixelLine(text, color) {
        const key = `${color}|${text}`;
        let line = lineCache.get(key);
        if (line) return line;
        if (lineCache.size > 96) lineCache.clear();
        line = sprite(Math.max(1, text.length * 6 - 1), 7, c => {
            c.fillStyle = color;
            [...text].forEach((ch, i) => (GLYPHS.get(ch) || []).forEach((row, y) => {
                for (let x = 0; x < 5; x++) if (row & (16 >> x)) c.fillRect(i * 6 + x, y, 1, 1);
            }));
        });
        lineCache.set(key, line);
        return line;
    }

    // Pixel text, centred on cx with its top at y, `dot` px per dot, with a
    // soft CRT bloom (the same line drawn larger, smoothed).
    function pixelText(ctx, text, cx, y, dot, color, glow = true) {
        const line = pixelLine(text, color);
        const w = line.width * dot, h = 7 * dot, x = cx - w / 2;
        if (glow) {
            ctx.save();
            ctx.globalAlpha *= 0.3;
            ctx.drawImage(line, x - dot, y - dot, w + dot * 2, h + dot * 2);
            ctx.restore();
        }
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(line, x, y, w, h);
        ctx.imageSmoothingEnabled = true;
        return w;
    }

    // The biggest dot (up to `most`) at which text fits a width.
    const dotFor = (text, width, most) => Math.max(1, Math.min(most, Math.floor(width / (text.length * 6))));

    function wrapChars(text, max) {
        const lines = [];
        for (const paragraph of text.split('\n')) {
            let line = '';
            for (let word of paragraph.split(/\s+/).filter(Boolean)) {
                while (word.length > max) { if (line) { lines.push(line); line = ''; } lines.push(word.slice(0, max)); word = word.slice(max); }
                const next = line ? `${line} ${word}` : word;
                if (next.length > max && line) { lines.push(line); line = word; } else line = next;
            }
            if (line) lines.push(line);
        }
        return lines;
    }

    // The attract mode's star: a pixel jellyfish, in two frames.
    const JELLY = ['...XXXXX...', '.XXXXXXXXX.', 'XXXXXXXXXXX', 'XX..XXX..XX', 'XXXXXXXXXXX'];
    const LEGS = [['.X.X.X.X.X.', 'X.X.X.X.X.X', '.X.X.X.X.X.', 'X...X.X...X'], ['.X.X.X.X.X.', '.X.X.X.X.X.', 'X.X.X.X.X.X', '.X.X...X.X.']];
    function jelly(frame, color) {
        return pixelSprite(`jelly${frame}${color}`, [...JELLY, ...LEGS[frame]], color);
    }
    function pixelSprite(key, rows, color) {
        let s = lineCache.get(key);
        if (!s) {
            s = sprite(rows[0].length, rows.length, c => {
                c.fillStyle = color;
                rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === 'X') c.fillRect(x, y, 1, 1); }));
            });
            lineCache.set(key, s);
        }
        return s;
    }
    function drawPixels(ctx, image, x, y, dot) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(image, x, y, image.width * dot, image.height * dot);
        ctx.imageSmoothingEnabled = true;
    }

    // ---- Layout ------------------------------------------------------------------------

    // A cabinet's parts, from its screen and the floor it stands on.
    function geometry(s, floor, sideK) {
        const b = s.h * K.bezel, rail = s.w * K.rail;
        const fx = s.x - b - rail, fw = s.w + (b + rail) * 2, sideW = fw * sideK;
        const top = s.y - b - s.h * (K.marquee + K.cap);
        const marquee = { x: fx + rail * 0.35, y: top + s.h * K.cap, w: fw - rail * 0.7, h: s.h * K.marquee };
        const deckY = s.y + s.h + b, jut = sideW * 0.3, ovh = fw * 0.035;
        const deck = { y: deckY, deep: s.h * K.deck, face: s.h * K.face, back: [fx - ovh * 0.2, fx + fw + ovh * 0.2], front: [fx - ovh + jut, fx + fw + ovh + jut] };
        const kick = s.h * K.kick, bodyTop = deckY + deck.deep + deck.face, bodyH = floor - kick - bodyTop;
        const dw = Math.min(fw * 0.4, bodyH * 0.95), dh = Math.min(bodyH * 0.8, dw * 1.15);
        const door = { x: fx + (fw - dw) / 2, y: bodyTop + (bodyH - dh) * 0.45, w: dw, h: dh };
        const coins = [0.16, 0.62].map(k => {
            const c = { x: door.x + door.w * k, y: door.y + door.h * 0.1, w: door.w * 0.22, h: door.h * 0.44 };
            c.window = { x: c.x + c.w * 0.14, y: c.y + c.h * 0.08, w: c.w * 0.72, h: c.h * 0.34 };
            return c;
        });
        return { s, b, rail, fx, fw, sideW, top, marquee, deck, kick, bodyTop, bodyH, door, coins, floor };
    }

    function layout(w, h, aspect, env) {
        const portrait = h > w * 1.1;
        const floor = h - env.insets.bottom - Math.max(10, h * 0.03);
        const sideK = portrait ? 0.05 : 0.16;
        const body = portrait ? 0.95 : 0.5;                    // the lower cabinet, in screen heights
        const tall = K.cap + K.marquee + K.bezel * 2 + 1 + K.deck + K.face + body + K.kick;
        const across = (1 + K.rail * 2 + (K.bezel * 2) / aspect) * (1 + sideK) + (portrait ? 0.07 : 0.12);
        const room = portrait ? h * 0.22 : Math.max(10, h * 0.02);
        const sw = Math.min(((floor - room) / tall) * aspect, (w * (portrait ? 0.97 : 0.94)) / across), sh = sw / aspect;
        const fw = sw * (1 + K.rail * 2) + sh * K.bezel * 2, sideW = fw * sideK;
        const fx = (w - fw - sideW) / 2 + sideW;
        const top = floor - tall * sh;                          // it stands on the floor
        const screen = { x: fx + sw * K.rail + sh * K.bezel, y: top + sh * (K.cap + K.marquee + K.bezel), w: sw, h: sh, radius: sh * 0.035 };
        const L = { portrait, floor, horizon: floor - (portrait ? h * 0.09 : h * 0.07), screen, cab: geometry(screen, floor, sideK) };
        if (portrait) L.sign = { cx: w / 2, cy: top * 0.5, w: Math.min(w * 0.8, top * 2.2), h: Math.min(top * 0.55, w * 0.3) };
        else {
            const pitch = fw + sideW + fw * 0.1;
            L.neighbours = [-1, 1].map(k => geometry({ ...screen, x: screen.x + k * pitch }, floor, sideK));
        }
        return L;
    }

    // ---- The room ------------------------------------------------------------------------

    // Arcade carpet: neon squiggles, ringed planets and stars on near-black, a seamless tile.
    let carpetTile = null;
    function carpet(ctx) {
        carpetTile ??= sprite(180, 180, c => {
            const T = 180, random = seeded(1981), colors = [NEON.cyan, NEON.pink, NEON.yellow, NEON.violet, NEON.green];
            c.fillStyle = '#0b0719';
            c.fillRect(0, 0, T, T);
            const each = draw => { for (const dx of [-T, 0, T]) for (const dy of [-T, 0, T]) { c.save(); c.translate(dx, dy); draw(); c.restore(); } };
            c.lineCap = c.lineJoin = 'round';
            for (let i = 0; i < 7; i++) {                       // squiggles
                const x = random() * T, y = random() * T, a = random() * 7, color = colors[i % colors.length];
                each(() => {
                    c.strokeStyle = color;
                    c.globalAlpha = 0.75;
                    c.lineWidth = 3;
                    c.beginPath();
                    for (let k = 0; k <= 6; k++) {
                        const px = x + Math.cos(a) * k * 7 + Math.cos(a + Math.PI / 2) * (k % 2 ? 6 : -6), py = y + Math.sin(a) * k * 7 + Math.sin(a + Math.PI / 2) * (k % 2 ? 6 : -6);
                        c[k ? 'lineTo' : 'moveTo'](px, py);
                    }
                    c.stroke();
                });
            }
            for (let i = 0; i < 3; i++) {                       // planets
                const x = random() * T, y = random() * T, r = 6 + random() * 7, color = colors[(i + 2) % colors.length];
                each(() => {
                    c.globalAlpha = 0.8;
                    c.fillStyle = color;
                    c.beginPath();
                    c.arc(x, y, r, 0, 7);
                    c.fill();
                    c.strokeStyle = colors[(i + 4) % colors.length];
                    c.lineWidth = 2;
                    c.beginPath();
                    c.ellipse(x, y, r * 1.9, r * 0.55, -0.4, 0, 7);
                    c.stroke();
                });
            }
            for (let i = 0; i < 16; i++) {                      // stars and dots
                const x = random() * T, y = random() * T, r = 1 + random() * 3, color = colors[i % colors.length];
                each(() => {
                    c.globalAlpha = 0.85;
                    c.fillStyle = color;
                    c.beginPath();
                    if (i % 3) c.arc(x, y, r * 0.7, 0, 7);
                    else for (let k = 0; k < 8; k++) c.lineTo(x + Math.cos((k * Math.PI) / 4) * (k % 2 ? r * 0.6 : r * 2.4), y + Math.sin((k * Math.PI) / 4) * (k % 2 ? r * 0.6 : r * 2.4));
                    c.fill();
                });
            }
        });
        return ctx.createPattern(carpetTile, 'repeat');
    }

    function roomArt(ctx, L, w, h) {
        const { horizon } = L;
        const wall = ctx.createLinearGradient(0, 0, 0, horizon);
        wall.addColorStop(0, '#0a0614');
        wall.addColorStop(1, '#1b1030');
        ctx.fillStyle = wall;
        ctx.fillRect(0, 0, w, horizon);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';             // wall panels
        for (let x = 0; x < w; x += 90) ctx.fillRect(x, 0, 2, horizon);
        // Carpet, foreshortened, darker towards the wall.
        ctx.save();
        ctx.translate(0, horizon);
        ctx.scale(1, 0.5);
        ctx.fillStyle = carpet(ctx);
        ctx.fillRect(0, 0, w, (h - horizon) * 2);
        ctx.restore();
        const fade = ctx.createLinearGradient(0, horizon, 0, h);
        fade.addColorStop(0, 'rgba(4, 2, 10, 0.75)');
        fade.addColorStop(1, 'rgba(4, 2, 10, 0.15)');
        ctx.fillStyle = fade;
        ctx.fillRect(0, horizon, w, h - horizon);
        ctx.fillStyle = '#050309';
        ctx.fillRect(0, horizon - 4, w, 4);
        // Each marquee's light on the wall above it, and the main screen's on the carpet.
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const [C, color, k] of [...(L.neighbours || []).map((C, i) => [C, i ? NEON.orange : NEON.green, 0.18]), [L.cab, NEON.pink, 0.32]]) {
            const m = C.marquee, cx = m.x + m.w / 2, r = C.fw * 0.8;
            glow(ctx, cx, m.y + m.h / 2, r, color, k);
        }
        const s = L.screen;
        ctx.translate(s.x + s.w / 2, L.floor);
        ctx.scale(1, 0.22);
        glow(ctx, 0, 0, s.w * 0.9, NEON.cyan, 0.16);
        ctx.restore();
        if (L.sign) sign(ctx, L.sign);
    }

    function glow(ctx, x, y, r, color, alpha) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, color);
        g.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.globalAlpha = alpha;
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
        ctx.globalAlpha = 1;
    }

    // A neon sign for the empty wall above an upright phone's cabinet.
    function sign(ctx, g) {
        const px = Math.min(g.h * 0.42, g.w / 4.2);
        ctx.save();
        ctx.font = `italic 900 ${px}px "Avenir Next", Futura, "Trebuchet MS", system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = ctx.lineCap = 'round';
        const tube = (draw, color, width) => {
            ctx.shadowColor = color;
            for (const [blur, w, stroke] of [[px * 0.5, width * 2.2, color], [px * 0.2, width, color], [0, width * 0.4, '#fff']]) {
                ctx.shadowBlur = blur;
                ctx.lineWidth = w;
                ctx.strokeStyle = stroke;
                draw();
            }
        };
        const bw = g.w, bh = px * 2;
        tube(() => { JellyfinFrames.roundRect(ctx, g.cx - bw / 2, g.cy - bh / 2, bw, bh, bh * 0.3); ctx.stroke(); }, NEON.cyan, Math.max(2, px * 0.05));
        tube(() => ctx.strokeText('GAME ON', g.cx, g.cy), NEON.pink, Math.max(2, px * 0.07));
        ctx.restore();
    }

    // ---- The cabinet ------------------------------------------------------------------------

    const MAIN = { hue: NEON.pink, trim: NEON.cyan, sun: [NEON.yellow, NEON.pink] };
    const NEIGHBOURS = [
        { hue: NEON.green, trim: NEON.violet, sun: [NEON.green, NEON.cyan], title: 'STAR JELLIES', attract: 'jellies', dim: 0.55 },
        { hue: NEON.orange, trim: NEON.yellow, sun: [NEON.yellow, NEON.orange], title: 'NEON RALLY', attract: 'rally', dim: 0.55 },
    ];

    // The side panel's outline: depth (0 the front, 1 the back) against height.
    function sideOutline(C) {
        const { s, top, deck, kick, bodyTop, floor } = C;
        return [[0, top], [0, s.y - C.b], [0.08, s.y - C.b], [0.03, deck.y], [-0.3, deck.y + deck.deep], [-0.3, deck.y + deck.deep + deck.face],
            [0, bodyTop + s.h * 0.05], [0, floor - kick], [0.05, floor - kick], [0.05, floor], [1, floor], [1, top + s.h * 0.3], [0.78, top]]
            .map(([d, y]) => [C.fx - d * C.sideW, y]);
    }

    function trace(ctx, points, close = true) {
        ctx.beginPath();
        points.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x, y));
        if (close) ctx.closePath();
    }

    function sideArt(ctx, C, o, outline) {
        const x0 = C.fx - C.sideW, x1 = C.fx + C.sideW * 0.3, W = x1 - x0, H = C.floor - C.top, top = C.top;
        trace(ctx, outline);
        ctx.fillStyle = '#130c22';
        ctx.fill();
        ctx.save();
        ctx.clip();
        // A striped sun high on the panel.
        const r = Math.min(W * 0.42, H * 0.12), sx = x0 + W * 0.5, sy = top + H * 0.26;
        const sun = ctx.createLinearGradient(0, sy - r, 0, sy + r);
        sun.addColorStop(0, o.sun[0]);
        sun.addColorStop(1, o.sun[1]);
        ctx.fillStyle = sun;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, 7);
        ctx.fill();
        ctx.fillStyle = '#130c22';
        for (let i = 0; i < 5; i++) ctx.fillRect(sx - r, sy + r * (0.05 + i * 0.2), r * 2, r * (0.04 + i * 0.03));
        // Three bold stripes sweeping down from the back, and chevrons below.
        [o.hue, o.trim, NEON.yellow].forEach((color, k) => {
            const y0 = top + H * (0.5 + k * 0.065), y1 = top + H * (0.36 + k * 0.065), t = H * 0.04;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.lineTo(x1, y1 + t);
            ctx.lineTo(x0, y0 + t);
            ctx.fill();
        });
        ctx.fillStyle = o.hue;
        for (let k = 0; k < 3; k++) {
            const cy = top + H * (0.72 + k * 0.07), half = W * 0.28;
            ctx.globalAlpha = 0.9 - k * 0.25;
            ctx.beginPath();
            ctx.moveTo(sx - half, cy);
            ctx.lineTo(sx, cy + H * 0.035);
            ctx.lineTo(sx + half, cy);
            ctx.lineTo(sx + half, cy + H * 0.02);
            ctx.lineTo(sx, cy + H * 0.055);
            ctx.lineTo(sx - half, cy + H * 0.02);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        // Turned away from the light: darker towards the back.
        const shade = ctx.createLinearGradient(C.fx, 0, x0, 0);
        shade.addColorStop(0, 'rgba(0, 0, 0, 0.1)');
        shade.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
        ctx.fillStyle = shade;
        ctx.fillRect(x0, top, W, H);
        ctx.restore();
    }

    // The marquee: a backlit synthwave sky, and the title in chrome.
    function marquee(ctx, m, o, title) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(m.x, m.y, m.w, m.h);
        ctx.clip();
        const horizon = m.y + m.h * 0.66;
        const sky = ctx.createLinearGradient(0, m.y, 0, horizon);
        sky.addColorStop(0, '#16052e');
        sky.addColorStop(0.6, '#5a1477');
        sky.addColorStop(1, o.hue);
        ctx.fillStyle = sky;
        ctx.fillRect(m.x, m.y, m.w, horizon - m.y);
        const random = seeded(Math.round(m.x + m.w) || 7);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        for (let i = 0; i < 40; i++) ctx.fillRect(m.x + random() * m.w, m.y + random() * m.h * 0.45, 1.2, 1.2);
        const r = m.h * 0.5, cx = m.x + m.w / 2;
        const sun = ctx.createLinearGradient(0, horizon - r, 0, horizon);
        sun.addColorStop(0, o.sun[0]);
        sun.addColorStop(1, o.sun[1]);
        ctx.fillStyle = sun;
        ctx.beginPath();
        ctx.arc(cx, horizon, r, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = '#5a1477';
        for (let i = 0; i < 4; i++) ctx.fillRect(cx - r, horizon - r * (0.12 + i * 0.16), r * 2, r * (0.035 + i * 0.012));
        ctx.fillStyle = '#12032a';
        ctx.fillRect(m.x, horizon, m.w, m.y + m.h - horizon);
        ctx.strokeStyle = o.hue;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.8;
        for (let i = -12; i <= 12; i++) { ctx.beginPath(); ctx.moveTo(cx + i * m.w * 0.02, horizon); ctx.lineTo(cx + i * m.w * 0.12, m.y + m.h); ctx.stroke(); }
        for (let k = 1; k < 6; k++) { const y = horizon + (m.y + m.h - horizon) * (k / 6) ** 1.7; ctx.beginPath(); ctx.moveTo(m.x, y); ctx.lineTo(m.x + m.w, y); ctx.stroke(); }
        ctx.globalAlpha = 1;
        chrome(ctx, title, m);
        // Backlit plastic: brighter in the middle.
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, cx, m.y + m.h / 2, m.w * 0.6, 'rgba(255, 220, 255, 0.5)', 0.18);
        ctx.restore();
        // Metal retainers top and bottom.
        for (const y of [m.y - m.h * 0.04, m.y + m.h - m.h * 0.02]) {
            const bar = ctx.createLinearGradient(0, y, 0, y + m.h * 0.06);
            bar.addColorStop(0, '#d8dbe4');
            bar.addColorStop(1, '#4a4c58');
            ctx.fillStyle = bar;
            ctx.fillRect(m.x - 2, y, m.w + 4, m.h * 0.06);
        }
    }

    // A title in chunky chrome capitals: extruded, outlined, sunset-filled; two lines if it must.
    function chrome(ctx, title, m) {
        const text = (title || 'NOW SHOWING').toUpperCase();
        const room = m.w * 0.88;
        let px = m.h * 0.5, lines = [text];
        const font = () => { ctx.font = CHROME.replace('{size}', px.toFixed(1)); };
        font();
        if (ctx.measureText(text).width > room) {
            px = m.h * 0.3;
            font();
            lines = JellyfinFrames.wrap(ctx, text, room);
            if (lines.length > 2) lines = [lines[0], `${lines.slice(1).join(' ')}`];
        }
        while (px > 6 && lines.some(line => ctx.measureText(line).width > room)) { px *= 0.92; font(); }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        const lead = px * 0.98, cx = m.x + m.w / 2, y0 = m.y + m.h * 0.47 - ((lines.length - 1) * lead) / 2;
        lines.forEach((line, i) => {
            const y = y0 + i * lead, depth = Math.max(2, px * 0.09);
            ctx.fillStyle = '#2a0640';
            for (let d = depth; d > 0; d--) ctx.fillText(line, cx + d * 0.5, y + d);
            ctx.lineWidth = Math.max(2, px * 0.14);
            ctx.strokeStyle = '#14021f';
            ctx.strokeText(line, cx, y);
            const fill = ctx.createLinearGradient(0, y - px * 0.45, 0, y + px * 0.45);
            fill.addColorStop(0, '#fffbe0');
            fill.addColorStop(0.42, '#ffd23f');
            fill.addColorStop(0.55, '#ff7a1a');
            fill.addColorStop(1, '#ff2f7a');
            ctx.fillStyle = fill;
            ctx.fillText(line, cx, y);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
            ctx.lineWidth = Math.max(0.6, px * 0.02);
            ctx.strokeText(line, cx, y);
        });
    }

    function deck(ctx, C, o) {
        const d = C.deck, at = (u, v) => [d.back[0] + (d.back[1] - d.back[0]) * u + (d.front[0] - d.back[0] + ((d.front[1] - d.back[1]) - (d.front[0] - d.back[0])) * u) * v, d.y + d.deep * v];
        const quad = [[d.back[0], d.y], [d.back[1], d.y], [d.front[1], d.y + d.deep], [d.front[0], d.y + d.deep]];
        const surface = ctx.createLinearGradient(0, d.y, 0, d.y + d.deep);
        surface.addColorStop(0, '#150f26');
        surface.addColorStop(1, '#2d2150');
        trace(ctx, quad);
        ctx.fillStyle = surface;
        ctx.fill();
        ctx.save();
        ctx.clip();
        ctx.globalAlpha = 0.55;
        [o.hue, o.trim].forEach((color, k) => {
            ctx.fillStyle = color;
            const [ax, ay] = at(0.62 + k * 0.08, 0), [bx, by] = at(0.42 + k * 0.08, 1);
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(ax + C.fw * 0.035, ay);
            ctx.lineTo(bx + C.fw * 0.035, by);
            ctx.lineTo(bx, by);
            ctx.fill();
        });
        ctx.restore();
        // Its front face, with a trim line.
        const fx = d.front[0], fw = d.front[1] - d.front[0];
        ctx.fillStyle = '#0d0916';
        ctx.fillRect(fx, d.y + d.deep, fw, d.face);
        ctx.fillStyle = o.hue;
        ctx.fillRect(fx, d.y + d.deep + d.face * 0.55, fw, Math.max(1.5, d.face * 0.08));
        ctx.fillStyle = o.trim;
        ctx.fillRect(fx, d.y + d.deep - 1, fw, Math.max(2, d.face * 0.08));
        // The joystick: a washer, a shaft, a red ball.
        const [jx, jy] = at(0.24, 0.6), r = d.deep * 0.26;
        ctx.fillStyle = '#05040a';
        ctx.beginPath();
        ctx.ellipse(jx, jy, r * 1.3, r * 0.55, 0, 0, 7);
        ctx.fill();
        ctx.strokeStyle = '#b9bcc8';
        ctx.lineWidth = Math.max(2, r * 0.3);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(jx, jy);
        ctx.lineTo(jx + r * 0.15, jy - d.deep * 0.95);
        ctx.stroke();
        const ball = ctx.createRadialGradient(jx - r * 0.3, jy - d.deep * 0.95 - r * 0.35, r * 0.1, jx + r * 0.15, jy - d.deep * 0.95, r * 1.05);
        ball.addColorStop(0, '#ffb0b8');
        ball.addColorStop(0.4, '#e8173a');
        ball.addColorStop(1, '#4a0010');
        ctx.fillStyle = ball;
        ctx.beginPath();
        ctx.arc(jx + r * 0.15, jy - d.deep * 0.95, r, 0, 7);
        ctx.fill();
        // Six buttons in two rows, and the two start buttons.
        const colors = ['#ff3b5c', '#ffd23f', '#3be37a', '#2ea8ff', '#ff7ae0', '#f2f2f2'];
        colors.forEach((color, i) => button(ctx, ...at(0.52 + (i % 3) * 0.12 + (i < 3 ? 0 : -0.02), i < 3 ? 0.38 : 0.74), d.deep * 0.15, color));
        for (const u of [0.4, 0.46]) button(ctx, ...at(u, 0.2), d.deep * 0.08, '#f2f2f2');
    }

    function button(ctx, x, y, r, color) {
        ctx.fillStyle = '#05040a';
        ctx.beginPath();
        ctx.ellipse(x, y + r * 0.2, r * 1.25, r * 0.62, 0, 0, 7);
        ctx.fill();
        const dome = ctx.createRadialGradient(x - r * 0.35, y - r * 0.3, r * 0.05, x, y, r);
        dome.addColorStop(0, '#ffffff');
        dome.addColorStop(0.35, color);
        dome.addColorStop(1, 'rgba(0, 0, 0, 0.6)');
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(x, y - r * 0.15, r, r * 0.52, 0, 0, 7);
        ctx.fill();
        ctx.fillStyle = dome;
        ctx.fill();
    }

    // The coin door: brushed steel, two lit 25¢ inserts with their slots and
    // return buttons, a return pocket and a lock.
    function door(ctx, C) {
        const d = C.door;
        const steel = ctx.createLinearGradient(d.x, d.y, d.x + d.w, d.y + d.h);
        steel.addColorStop(0, '#9aa0aa');
        steel.addColorStop(0.45, '#d9dde4');
        steel.addColorStop(1, '#5d626c');
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        JellyfinFrames.roundRect(ctx, d.x - 2, d.y - 1, d.w + 4, d.h + 4, d.w * 0.05);
        ctx.fill();
        ctx.fillStyle = steel;
        JellyfinFrames.roundRect(ctx, d.x, d.y, d.w, d.h, d.w * 0.04);
        ctx.fill();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
        for (let x = d.x; x < d.x + d.w; x += 2) ctx.fillRect(x, d.y + 2, 1, d.h - 4);
        ctx.strokeStyle = 'rgba(40, 42, 50, 0.6)';
        ctx.lineWidth = 1;
        JellyfinFrames.roundRect(ctx, d.x + d.w * 0.05, d.y + d.w * 0.05, d.w * 0.9, d.h - d.w * 0.1, d.w * 0.03);
        ctx.stroke();
        for (const c of C.coins) {
            ctx.fillStyle = '#3a3e46';
            JellyfinFrames.roundRect(ctx, c.x, c.y, c.w, c.h, c.w * 0.1);
            ctx.fill();
            const win = c.window;
            const lit = ctx.createLinearGradient(0, win.y, 0, win.y + win.h);
            lit.addColorStop(0, '#ffb46a');
            lit.addColorStop(1, '#ff3a1a');
            ctx.fillStyle = lit;
            ctx.fillRect(win.x, win.y, win.w, win.h);
            ctx.fillStyle = '#4a0a00';
            ctx.font = `800 ${Math.max(6, win.h * 0.55)}px system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('25¢', win.x + win.w / 2, win.y + win.h * 0.55, win.w * 0.9);
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            glow(ctx, win.x + win.w / 2, win.y + win.h / 2, win.w * 1.1, '#ff6a2a', 0.45);
            ctx.restore();
            ctx.fillStyle = '#0a0a0c';                           // the slot, in its chrome lip
            const sw = Math.max(1.5, c.w * 0.1), sh = c.h * 0.3, sx = c.x + c.w / 2 - sw / 2, sy = c.y + c.h * 0.55;
            ctx.fillRect(sx - 1.5, sy - 1.5, sw + 3, sh + 3);
            ctx.fillStyle = '#e8eaf0';
            ctx.fillRect(sx - 1.5, sy - 1.5, sw + 3, 1.5);
            ctx.fillStyle = '#050506';
            ctx.fillRect(sx, sy, sw, sh);
            ctx.fillStyle = '#2b2e35';                           // coin return button
            ctx.fillRect(c.x + c.w * 0.25, c.y + c.h + d.h * 0.04, c.w * 0.5, c.w * 0.35);
        }
        ctx.fillStyle = '#121317';
        ctx.fillRect(d.x + d.w * 0.36, d.y + d.h * 0.8, d.w * 0.28, d.h * 0.12);
        ctx.fillStyle = '#c4c8d0';
        ctx.fillRect(d.x + d.w * 0.36, d.y + d.h * 0.8, d.w * 0.28, Math.max(1.5, d.h * 0.015));
        ctx.fillStyle = '#3a3d45';
        ctx.beginPath();
        ctx.arc(d.x + d.w / 2, d.y + d.h * 0.68, Math.max(2, d.w * 0.045), 0, 7);
        ctx.fill();
    }

    // The bezel's print: a neon frame and the player counts.
    function bezel(ctx, C, o) {
        const { s, b } = C;
        ctx.fillStyle = '#07060b';
        JellyfinFrames.roundRect(ctx, s.x - b, s.y - b, s.w + b * 2, s.h + b * 2, b * 0.3);
        ctx.fill();
        ctx.strokeStyle = o.trim;
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = Math.max(1.5, b * 0.06);
        JellyfinFrames.roundRect(ctx, s.x - b * 0.5, s.y - b * 0.5, s.w + b, s.h + b, b * 0.3);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = o.hue;
        const t = b * 0.42;
        for (const [x, y, dx, dy] of [[s.x - b * 0.5, s.y - b * 0.5, 1, 1], [s.x + s.w + b * 0.5, s.y - b * 0.5, -1, 1], [s.x - b * 0.5, s.y + s.h + b * 0.5, 1, -1], [s.x + s.w + b * 0.5, s.y + s.h + b * 0.5, -1, -1]]) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + dx * t * 2, y);
            ctx.lineTo(x, y + dy * t * 2);
            ctx.fill();
        }
        const dot = Math.max(1, Math.floor(b * 0.09));
        if (b > 20) pixelText(ctx, '1 OR 2 PLAYERS', s.x + s.w / 2, s.y + s.h + b * 0.5 - dot * 3.5, dot, o.trim, false);
    }

    function cabinet(ctx, C, o, title) {
        const { s, fx, fw, top, floor, kick, bodyTop } = C;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.beginPath();
        ctx.ellipse(fx + fw / 2 - C.sideW / 2, floor, (fw + C.sideW) * 0.62, Math.max(6, s.h * 0.06), 0, 0, 7);
        ctx.fill();
        const outline = sideOutline(C);
        sideArt(ctx, C, o, outline);
        // The screen's recess, the inside of the side wall.
        ctx.fillStyle = '#05030a';
        ctx.fillRect(fx - C.sideW * 0.08, s.y - C.b, C.sideW * 0.08 + 1, C.deck.y - s.y + C.b);
        // The front.
        const face = ctx.createLinearGradient(fx, 0, fx + fw, 0);
        face.addColorStop(0, '#191324');
        face.addColorStop(0.5, '#241b31');
        face.addColorStop(1, '#110d18');
        ctx.fillStyle = face;
        ctx.fillRect(fx, top, fw, floor - kick - top);
        ctx.fillStyle = '#0b0810';
        ctx.fillRect(fx, top, fw, s.h * K.cap);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.fillRect(fx, top, fw, 1.5);
        marquee(ctx, C.marquee, o, title);
        bezel(ctx, C, o);
        // A band of stripes across the lower cabinet.
        for (let k = 0; k < 3; k++) {
            ctx.fillStyle = [o.hue, o.trim, NEON.yellow][k];
            ctx.globalAlpha = 0.85;
            ctx.fillRect(fx, bodyTop + C.bodyH * 0.06 + k * Math.max(3, s.h * 0.022), fw, Math.max(1.5, s.h * 0.011));
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#060409';
        ctx.fillRect(fx + C.sideW * 0.05, floor - kick, fw - C.sideW * 0.05, kick);
        door(ctx, C);
        deck(ctx, C, o);
        // T-moulding along the side panel's front edge, and the right-hand edge.
        ctx.strokeStyle = o.trim;
        ctx.lineWidth = Math.max(2, fw * 0.01);
        ctx.lineJoin = 'round';
        trace(ctx, [outline[12], ...outline.slice(0, 8)], false);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(fx + fw, top);
        ctx.lineTo(fx + fw, C.deck.y);
        ctx.moveTo(fx + fw, C.deck.y + C.deck.deep + C.deck.face);
        ctx.lineTo(fx + fw, floor - kick);
        ctx.stroke();
        if (o.attract) {
            attractArt(ctx, s, o);
            glass(ctx, s);
        }
        if (o.dim) {
            // Out of the light: one fill over the whole cabinet (every part wound the same way).
            ctx.beginPath();
            outline.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x, y));
            ctx.closePath();
            ctx.rect(fx, top - 3, fw + 2, floor - top + 3);
            const d = C.deck;
            ctx.moveTo(d.back[0], d.y);
            ctx.lineTo(d.back[1], d.y);
            ctx.lineTo(d.front[1], d.y + d.deep + d.face);
            ctx.lineTo(d.front[0], d.y + d.deep + d.face);
            ctx.closePath();
            ctx.fillStyle = `rgba(6, 3, 14, ${o.dim})`;
            ctx.fill();
        }
    }

    // A neighbour's screen, frozen mid-attract.
    function attractArt(ctx, s, o) {
        ctx.save();
        JellyfinFrames.roundRect(ctx, s.x, s.y, s.w, s.h, s.radius);
        ctx.clip();
        ctx.fillStyle = '#04030a';
        ctx.fillRect(s.x, s.y, s.w, s.h);
        const dot = Math.max(1, Math.round(s.h / 90));
        if (o.attract === 'jellies') {
            const colors = [NEON.pink, NEON.cyan, NEON.green], jd = Math.max(1, Math.round(s.w / 150));
            for (let row = 0; row < 3; row++) for (let i = 0; i < 6; i++) drawPixels(ctx, jelly((row + i) % 2, colors[row]), s.x + s.w * (0.12 + i * 0.13), s.y + s.h * (0.18 + row * 0.16), jd);
            ctx.fillStyle = NEON.green;
            ctx.beginPath();
            ctx.moveTo(s.x + s.w * 0.45, s.y + s.h * 0.92);
            ctx.lineTo(s.x + s.w * 0.5, s.y + s.h * 0.8);
            ctx.lineTo(s.x + s.w * 0.55, s.y + s.h * 0.92);
            ctx.fill();
        } else {
            const hz = s.y + s.h * 0.45;
            ctx.fillStyle = NEON.orange;
            ctx.beginPath();
            ctx.arc(s.x + s.w / 2, hz, s.h * 0.2, Math.PI, 0);
            ctx.fill();
            ctx.fillStyle = '#2a2440';
            ctx.beginPath();
            ctx.moveTo(s.x + s.w * 0.48, hz);
            ctx.lineTo(s.x + s.w * 0.52, hz);
            ctx.lineTo(s.x + s.w * 0.95, s.y + s.h);
            ctx.lineTo(s.x + s.w * 0.05, s.y + s.h);
            ctx.fill();
            ctx.fillStyle = NEON.yellow;
            for (let k = 0; k < 4; k++) { const t = (k + 0.5) / 4, y = hz + (s.h * 0.55) * t * t; ctx.fillRect(s.x + s.w / 2 - t * 3, y, t * 6, Math.max(2, t * 10)); }
        }
        pixelText(ctx, 'PRESS START', s.x + s.w / 2, s.y + s.h * 0.05, dot, NEON.yellow, false);
        ctx.restore();
    }

    // The tube: scanlines, a vignette and a glare, translucent over the picture.
    function glass(ctx, s) {
        ctx.save();
        JellyfinFrames.roundRect(ctx, s.x, s.y, s.w, s.h, s.radius);
        ctx.clip();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
        for (let y = s.y; y < s.y + s.h; y += 3) ctx.fillRect(s.x, y, s.w, 1);
        const vignette = ctx.createRadialGradient(s.x + s.w / 2, s.y + s.h / 2, Math.min(s.w, s.h) * 0.4, s.x + s.w / 2, s.y + s.h / 2, Math.hypot(s.w, s.h) * 0.56);
        vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
        vignette.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
        ctx.fillStyle = vignette;
        ctx.fillRect(s.x, s.y, s.w, s.h);
        const glare = ctx.createLinearGradient(s.x, s.y, s.x + s.w * 0.5, s.y + s.h * 0.8);
        glare.addColorStop(0, 'rgba(255, 255, 255, 0.09)');
        glare.addColorStop(0.5, 'rgba(255, 255, 255, 0.02)');
        glare.addColorStop(0.51, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = glare;
        ctx.fillRect(s.x, s.y, s.w, s.h);
        ctx.restore();
    }

    function paint(ctx, L, env) {
        const { w, h } = env.viewport;
        roomArt(ctx, L, w, h);
        (L.neighbours || []).forEach((C, i) => cabinet(ctx, C, NEIGHBOURS[i], NEIGHBOURS[i].title));
        cabinet(ctx, L.cab, MAIN, env.title);
        JellyfinFrames.cutScreen(ctx, L.screen);
        glass(ctx, L.screen);
    }

    // ---- The overlay ---------------------------------------------------------------------

    let sparkSprite = null;
    function spark() {
        return sparkSprite ??= sprite(64, 64, c => {
            const g = c.createRadialGradient(32, 32, 0, 32, 32, 14);
            g.addColorStop(0, 'rgba(255, 255, 255, 1)');
            g.addColorStop(1, 'rgba(255, 200, 255, 0)');
            c.fillStyle = g;
            c.fillRect(0, 0, 64, 64);
            for (const [w, h] of [[64, 3], [3, 64]]) {
                const ray = w > h ? c.createLinearGradient(0, 0, 64, 0) : c.createLinearGradient(0, 0, 0, 64);
                ray.addColorStop(0, 'rgba(255, 255, 255, 0)');
                ray.addColorStop(0.5, 'rgba(255, 255, 255, 1)');
                ray.addColorStop(1, 'rgba(255, 255, 255, 0)');
                c.fillStyle = ray;
                c.fillRect(32 - w / 2, 32 - h / 2, w, h);
            }
        });
    }

    // The attract burst: glints across the marquee, the coin lights swelling once.
    function attract(ctx, L, env, t, phase) {
        const C = L.cab, m = C.marquee;
        const random = seeded(Math.floor(t / ATTRACT_EVERY) * 7919 + 13);
        const count = Math.max(2, Math.round(6 * (env.quality?.density ?? 1)));
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < count; i++) {
            const x = m.x + m.w * (0.06 + random() * 0.88), y = m.y + m.h * (0.12 + random() * 0.7);
            const start = random() * (ATTRACT_FOR - SPARKLE_MS), size = m.h * (0.35 + random() * 0.3);
            const q = (phase - start) / SPARKLE_MS;
            if (q <= 0 || q >= 1) continue;
            const k = Math.sin(Math.PI * q);
            ctx.globalAlpha = k;
            ctx.drawImage(spark(), x - (size * k) / 2, y - (size * k) / 2, size * k, size * k);
        }
        coinLights(ctx, C, Math.sin((Math.PI * phase) / ATTRACT_FOR) * 0.7);
        ctx.restore();
    }

    function coinLights(ctx, C, k) {
        ctx.globalCompositeOperation = 'lighter';
        for (const { window: win } of C.coins) {
            ctx.globalAlpha = 1;
            glow(ctx, win.x + win.w / 2, win.y + win.h / 2, win.w * 1.4, `rgba(255, 120, 50, ${Math.max(0, Math.min(1, k))})`, 1);
        }
        ctx.globalCompositeOperation = 'source-over';
    }

    function blackScreen(ctx, s, alpha = 1) {
        ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
        JellyfinFrames.roundRect(ctx, s.x, s.y, s.w, s.h, s.radius);
        ctx.fill();
    }

    function scanlines(ctx, s) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
        for (let y = s.y; y < s.y + s.h; y += 3) ctx.fillRect(s.x, y, s.w, 1);
    }

    // Between items: INSERT COIN, blinking, then the coin drops and it's one credit.
    function insertCoin(ctx, L, age) {
        const s = L.screen, cx = s.x + s.w / 2;
        blackScreen(ctx, s);
        const big = dotFor('INSERT COIN', s.w * 0.8, Math.max(2, Math.round(s.h / 30))), small = Math.max(1, Math.round(big / 2));
        if (age < COIN_MS - 520) {
            if (Math.floor(age / 260) % 2 === 0) pixelText(ctx, 'INSERT COIN', cx, s.y + s.h * 0.42 - big * 3.5, big, NEON.pink);
            pixelText(ctx, 'CREDIT 0', cx, s.y + s.h * 0.8, small, NEON.cyan);
        } else {
            pixelText(ctx, 'PLAYER 1', cx, s.y + s.h * 0.42 - big * 3.5, big, NEON.yellow);
            pixelText(ctx, 'CREDIT 1', cx, s.y + s.h * 0.8, small, NEON.cyan);
            coinLights(ctx, L.cab, 1 - (age - (COIN_MS - 520)) / 520);
        }
        scanlines(ctx, s);
    }

    // The words for each idle state, as the attract mode says them.
    const HEADLINES = {
        setup: 'NO GAME LOADED', connecting: 'SEARCHING...', offline: 'GAME OVER', signedout: 'PLAYER 1 SIGNED OUT',
        empty: 'NO CARTRIDGE', loading: 'GET READY', away: 'PLAYER 2 HAS THE CONTROLS', demo: 'PRESS START',
    };

    let transition = null;   // { kind, at }
    let idled = false;       // idle() drew this frame, so tick keeps the blink going

    JellyfinFrames.add({
        id: 'arcade',
        name: 'Arcade',
        icon: '🕹️',
        titled: true,
        videoFilter: 'saturate(1.15) contrast(1.06)',
        layout,
        paint,

        transition(kind, env) {
            transition = { kind, at: performance.now() };
            env.busy(kind === 'change' ? COIN_MS : kind === 'play' ? READY_MS : 0);
        },

        tick(ctx, t, L, env) {
            const idling = idled;
            idled = false;
            const age = transition ? t - transition.at : Infinity;
            const s = L.screen, cx = s.x + s.w / 2;
            let wait = Infinity;
            if (transition?.kind === 'change' && age < COIN_MS) {
                insertCoin(ctx, L, age);
                return 40;
            }
            if (env.paused) {
                blackScreen(ctx, s, 0.6);
                const dot = dotFor('PAUSED', s.w * 0.5, Math.max(2, Math.round(s.h / 26)));
                pixelText(ctx, 'PAUSED', cx, s.y + s.h / 2 - dot * 3.5, dot, NEON.yellow);
            } else if (transition?.kind === 'play' && age < READY_MS) {
                const dot = dotFor('READY!', s.w * 0.4, Math.max(2, Math.round(s.h / 30)));
                pixelText(ctx, 'READY!', cx, s.y + s.h * 0.55, dot, NEON.yellow);
                wait = READY_MS - age;
            } else transition = null;
            if (!env.motion) return wait;
            if (idling) wait = Math.min(wait, BLINK_MS - (t % BLINK_MS));
            const phase = t % ATTRACT_EVERY;
            if (phase < ATTRACT_FOR) {
                attract(ctx, L, env, t, phase);
                return Math.min(wait, STEP_MS);
            }
            return Math.min(wait, ATTRACT_EVERY - phase);
        },

        // Attract mode: a starfield, the jellyfish, what's wrong, and INSERT COIN
        // blinking (still, when frame motion is off).
        idle(ctx, L, env, kind) {
            idled = true;
            const s = L.screen, cx = s.x + s.w / 2;
            const on = !env.motion || Math.floor(performance.now() / BLINK_MS) % 2 === 0;
            ctx.save();
            JellyfinFrames.roundRect(ctx, s.x, s.y, s.w, s.h, s.radius);
            ctx.clip();
            ctx.fillStyle = '#03020a';
            ctx.fillRect(s.x, s.y, s.w, s.h);
            const random = seeded(2600);
            for (let i = 0; i < 60; i++) {
                ctx.fillStyle = i % 3 ? 'rgba(160, 200, 255, 0.5)' : 'rgba(255, 255, 255, 0.85)';
                ctx.fillRect(s.x + random() * s.w, s.y + random() * s.h, i % 5 ? 1 : 2, i % 5 ? 1 : 2);
            }
            const unit = Math.max(1, Math.round(s.h / 130));
            pixelText(ctx, 'HI-SCORE 999990', cx, s.y + s.h * 0.06, unit, NEON.pink);
            const fish = jelly(on ? 0 : 1, NEON.pink), fd = unit * 3;
            drawPixels(ctx, fish, cx - (fish.width * fd) / 2, s.y + s.h * 0.18, fd);
            const [title, detail] = JellyfinFrames.IDLE[kind] || JellyfinFrames.IDLE.setup;
            const head = HEADLINES[kind] || pixelable(title) || 'INSERT COIN';
            const hd = dotFor(head, s.w * 0.9, unit * 2);
            pixelText(ctx, head, cx, s.y + s.h * 0.5, hd, NEON.yellow);
            const body = pixelable(detail || title) || '';
            const sd = unit;
            wrapChars(body, Math.floor((s.w * 0.88) / (6 * sd))).slice(0, 2)
                .forEach((line, i) => pixelText(ctx, line, cx, s.y + s.h * 0.5 + hd * 7 + sd * 6 + i * sd * 10, sd, '#e8f4ff'));
            const cd = dotFor('INSERT COIN', s.w * 0.8, unit * 2);
            if (on) pixelText(ctx, 'INSERT COIN', cx, s.y + s.h * 0.8, cd, NEON.cyan);
            pixelText(ctx, 'CREDIT 0', s.x + s.w * 0.84, s.y + s.h * 0.92, sd, '#e8f4ff');
            scanlines(ctx, s);
            ctx.restore();
        },

        // Subtitles in the pixel font, white on black boxes; anything it can't
        // spell (other alphabets) falls back to a monospace face.
        cue(ctx, text, L) {
            const s = L.screen, spelled = pixelable(text);
            if (!spelled) return JellyfinFrames.drawCue(ctx, text, s, { font: '700 {size}px ui-monospace, Menlo, Consolas, monospace', color: '#fff', box: '#000', bottom: 0.07 });
            const dot = s.h < 260 ? 1.5 : Math.round(s.h / 130);
            const lines = wrapChars(spelled, Math.floor((s.w * 0.9) / (6 * dot)));
            const lead = dot * 10, cx = s.x + s.w / 2;
            let y = s.y + s.h * 0.93 - lines.length * lead;
            ctx.fillStyle = '#000';
            for (const line of lines) {
                const w = (line.length * 6 - 1) * dot;
                ctx.fillRect(cx - w / 2 - dot * 2, y - dot * 2, w + dot * 4, dot * 11);
                pixelText(ctx, line, cx, y, dot, '#fff', false);
                y += lead;
            }
        },
    });
})();
