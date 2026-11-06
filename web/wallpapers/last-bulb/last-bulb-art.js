// The Last Bulb on the Strand: the art, all baked when the screen is sized.
// The wall (plaster, pine boards, brick or old wallpaper) is painted at full
// light, then multiplied by a light map: the room's dim ambient plus a pool
// of each bulb's colour, so a red bulb reddens cream plaster and barely
// shows on green wallpaper. The bulbs, sockets, the tag and the plug are
// sprites; the wire is drawn into the wall layers (it never moves).

const LastBulbArt = (() => {
    const rgb = hex => { const n = parseInt(String(hex).slice(1), 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
    const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
    const css = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
    const WHITE = [255, 255, 255], BLACK = [0, 0, 0], EMBER = [255, 104, 28];
    function canvas(w, h) {
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.ceil(w));
        c.height = Math.max(1, Math.ceil(h));
        return c;
    }

    // ---- The wall --------------------------------------------------------------------------

    // The picture rail's wood for each wall.
    const WALLS = { plaster: { rail: '#4d3422' }, pine: { rail: '#5b3b22' }, brick: { rail: '#e9e2d4' }, wallpaper: { rail: '#3b2618' } };

    function grain(g, W, H, random, alpha) {
        const tile = canvas(96, 96), tg = tile.getContext('2d');
        const img = tg.createImageData(96, 96);
        for (let i = 0; i < img.data.length; i += 4) {
            const v = random() < 0.5 ? 0 : 255;
            img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
            img.data[i + 3] = Math.round(random() * 255 * alpha);
        }
        tg.putImageData(img, 0, 0);
        g.fillStyle = g.createPattern(tile, 'repeat');
        g.fillRect(0, 0, W, H);
    }

    function plaster(g, L, random) {
        g.fillStyle = '#d9c9ad';
        g.fillRect(0, 0, L.W, L.H);
        for (let i = 0; i < 160; i++) {
            const x = random() * L.W, y = random() * L.H, r = 20 + random() * 140;
            const grad = g.createRadialGradient(x, y, 0, x, y, r);
            const tone = random() < 0.5 ? '120,100,70' : '255,250,235';
            grad.addColorStop(0, `rgba(${tone},${0.03 + random() * 0.05})`);
            grad.addColorStop(1, `rgba(${tone},0)`);
            g.fillStyle = grad;
            g.fillRect(x - r, y - r, 2 * r, 2 * r);
        }
    }

    function pine(g, L, random) {
        const bw = L.w * 2.7;
        for (let x = -random() * bw, k = 0; x < L.W; x += bw, k++) {
            const tone = mix(rgb('#b9804a'), random() < 0.5 ? rgb('#8d5a2e') : rgb('#cf9a5f'), random() * 0.5);
            g.fillStyle = css(tone);
            g.fillRect(x, 0, bw, L.H);
            g.save();
            g.beginPath(); g.rect(x, 0, bw, L.H); g.clip();
            // Grain: long wavy lines, and a knot or two the lines bend round.
            const knots = [];
            for (let y = random() * L.H * 0.6; y < L.H; y += L.H * (0.35 + random() * 0.6)) knots.push({ x: x + bw * (0.25 + random() * 0.5), y, r: L.w * (0.18 + random() * 0.22) });
            for (let i = 0; i < 14; i++) {
                const gx = x + bw * (i + random() * 0.6) / 14;
                g.beginPath();
                for (let y = -10; y <= L.H + 10; y += 12) {
                    let dx = Math.sin(y * 0.011 + i) * 2.2;
                    for (const kn of knots) { const dy = (y - kn.y) / (kn.r * 3); dx += Math.exp(-dy * dy) * kn.r * 1.4 * Math.sign(gx - kn.x || 1) * Math.exp(-Math.abs(gx - kn.x) / (kn.r * 3)); }
                    y < 0 ? g.moveTo(gx + dx, y) : g.lineTo(gx + dx, y);
                }
                g.strokeStyle = `rgba(80,42,14,${0.08 + random() * 0.12})`;
                g.lineWidth = 0.6 + random() * 1.2;
                g.stroke();
            }
            for (const kn of knots) {
                g.fillStyle = 'rgba(70,36,12,0.55)';
                g.beginPath(); g.ellipse(kn.x, kn.y, kn.r * 0.55, kn.r * 0.8, 0, 0, Math.PI * 2); g.fill();
                g.strokeStyle = 'rgba(70,36,12,0.25)'; g.lineWidth = 1;
                for (let ring = 1; ring < 4; ring++) { g.beginPath(); g.ellipse(kn.x, kn.y, kn.r * (0.55 + ring * 0.3), kn.r * (0.8 + ring * 0.45), 0, 0, Math.PI * 2); g.stroke(); }
            }
            g.restore();
            // The gap between boards, and the board edge that catches light.
            g.fillStyle = 'rgba(38,20,8,0.85)'; g.fillRect(x - 1, 0, 2, L.H);
            g.fillStyle = 'rgba(255,220,170,0.18)'; g.fillRect(x + 1, 0, 1.2, L.H);
        }
    }

    function brick(g, L, random) {
        const bh = L.w * 1.15, bl = L.w * 3.6, m = Math.max(1.5, L.w * 0.15);
        g.fillStyle = '#a89a86';
        g.fillRect(0, 0, L.W, L.H);
        const tones = ['#8e3b2a', '#9c4630', '#7d3424', '#a5533a', '#874030', '#93432f'];
        for (let row = 0, y = L.top + L.rail; y < L.H; row++, y += bh) {
            for (let x = (row % 2 ? -bl / 2 : 0) - random() * 2; x < L.W; x += bl) {
                const tone = mix(rgb(tones[Math.floor(random() * tones.length)]), random() < 0.5 ? BLACK : WHITE, random() * 0.12);
                g.fillStyle = css(tone);
                g.fillRect(x + m / 2, y + m / 2, bl - m, bh - m);
                g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + m / 2, y + bh - m / 2 - m * 0.6, bl - m, m * 0.6);
                g.fillStyle = 'rgba(255,230,210,0.10)'; g.fillRect(x + m / 2, y + m / 2, bl - m, m * 0.5);
                for (let i = 0; i < 10; i++) {
                    g.fillStyle = random() < 0.5 ? 'rgba(40,10,5,0.25)' : 'rgba(255,220,190,0.15)';
                    g.fillRect(x + m + random() * (bl - 2 * m), y + m + random() * (bh - 2 * m), 1.4, 1.4);
                }
            }
        }
    }

    function wallpaper(g, L, random) {
        const sw = L.w * 1.5;
        for (let x = 0, k = 0; x < L.W; x += sw, k++) {
            g.fillStyle = k % 2 ? '#2c4637' : '#34503f';
            g.fillRect(x, 0, sw, L.H);
            g.fillStyle = 'rgba(214,184,110,0.30)';
            g.fillRect(x, 0, Math.max(1, L.w * 0.05), L.H);
            if (k % 2) continue;
            // A small sprig in old gold, half-dropped down the stripe.
            for (let y = (k % 4 ? L.w : 0) + L.w * 1.2; y < L.H; y += L.w * 2.4) {
                const cx = x + sw / 2;
                g.fillStyle = 'rgba(214,184,110,0.28)';
                for (const [dx, dy, a] of [[-0.18, 0.05, -0.7], [0.18, 0.05, 0.7], [0, -0.16, 0]]) {
                    g.beginPath(); g.ellipse(cx + dx * L.w, y + dy * L.w, L.w * 0.07, L.w * 0.17, a, 0, Math.PI * 2); g.fill();
                }
                g.fillStyle = 'rgba(160,52,40,0.45)';
                g.beginPath(); g.arc(cx, y + L.w * 0.09, L.w * 0.06, 0, Math.PI * 2); g.fill();
            }
        }
    }

    // The wall at full light: the chosen wall, a picture rail along the top
    // (the hooks screw into it) with its shadow, and the ceiling above it.
    function albedo(L, dpr, kind, random) {
        const c = canvas(L.W * dpr, L.H * dpr), g = c.getContext('2d');
        g.scale(dpr, dpr);
        ({ plaster, pine, brick, wallpaper }[kind] || plaster)(g, L, random);
        grain(g, L.W, L.H, random, kind === 'plaster' ? 0.07 : 0.05);
        const look = WALLS[kind] || WALLS.plaster;
        if (L.top > 0) { g.fillStyle = '#c9bea9'; g.fillRect(0, 0, L.W, L.top); }
        const y0 = L.top, y1 = L.top + L.rail;
        const shade = g.createLinearGradient(0, y1, 0, y1 + L.w * 1.2);
        shade.addColorStop(0, 'rgba(0,0,0,0.38)'); shade.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = shade; g.fillRect(0, y1, L.W, L.w * 1.2);
        const rail = rgb(look.rail);
        const wood = g.createLinearGradient(0, y0, 0, y1);
        wood.addColorStop(0, css(mix(rail, BLACK, 0.25)));
        wood.addColorStop(0.35, css(mix(rail, WHITE, 0.12)));
        wood.addColorStop(0.7, css(rail));
        wood.addColorStop(1, css(mix(rail, BLACK, 0.45)));
        g.fillStyle = wood; g.fillRect(0, y0, L.W, y1 - y0);
        g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, y0 + (y1 - y0) * 0.3, L.W, 1);
        return c;
    }

    // ---- Light ------------------------------------------------------------------------------

    // The wall lit by these bulbs ({x, y, colour}) over the room's ambient,
    // cut to `rect` (CSS px): albedo × light, then a little bloom near each
    // bulb where the light is strongest.
    function lit(wall, L, dpr, rect, ambient, lights) {
        const cw = Math.round(rect.w * dpr), ch = Math.round(rect.h * dpr);
        const c = canvas(cw, ch), g = c.getContext('2d');
        g.drawImage(wall, Math.round(rect.x * dpr), Math.round(rect.y * dpr), cw, ch, 0, 0, cw, ch);
        const map = canvas(cw, ch), m = map.getContext('2d');
        const a = ambient;
        m.fillStyle = css([Math.round(255 * a), Math.round(236 * a), Math.round(206 * a)]);
        m.fillRect(0, 0, cw, ch);
        m.globalCompositeOperation = 'lighter';
        m.scale(dpr, dpr);
        m.translate(-rect.x, -rect.y);
        const R = L.reach;
        for (const l of lights) {
            const col = mix(rgb(l.colour), WHITE, 0.3);
            const grad = m.createRadialGradient(l.x, l.y, 0, l.x, l.y, R);
            grad.addColorStop(0, css(col, 1));
            grad.addColorStop(0.12, css(col, 0.8));
            grad.addColorStop(0.3, css(col, 0.42));
            grad.addColorStop(0.55, css(col, 0.17));
            grad.addColorStop(0.8, css(col, 0.05));
            grad.addColorStop(1, css(col, 0));
            m.fillStyle = grad;
            m.fillRect(l.x - R, l.y - R, 2 * R, 2 * R);
        }
        g.globalCompositeOperation = 'multiply';
        g.drawImage(map, 0, 0);
        g.globalCompositeOperation = 'lighter';
        g.scale(dpr, dpr);
        g.translate(-rect.x, -rect.y);
        for (const l of lights) {
            const col = rgb(l.colour), r = L.w * 1.8;
            const grad = g.createRadialGradient(l.x, l.y, 0, l.x, l.y, r);
            grad.addColorStop(0, css(col, 0.22));
            grad.addColorStop(1, css(col, 0));
            g.fillStyle = grad;
            g.fillRect(l.x - r, l.y - r, 2 * r, 2 * r);
        }
        g.globalCompositeOperation = 'source-over';
        return c;
    }

    // ---- The wire and the hooks ----------------------------------------------------------------

    // The strand from off the edge to the last hook (the tail is drawn live).
    function strandPath(g, L) {
        const X = x => LastBulbLogic.mx(L, x);
        const h = L.hooks;
        g.beginPath();
        g.moveTo(X(h[0] - 2 * L.s), L.hookY);
        for (let i = 0; i < h.length; i++) {
            const x0 = i ? h[i - 1] : h[0] - 2 * L.s;
            g.quadraticCurveTo(X((x0 + h[i]) / 2), L.hookY + 2 * L.sag, X(h[i]), L.hookY);
        }
    }

    // A twisted pair: dark green, with the twist picked out in short dashes.
    function wire(g, L, path, shadow) {
        const t = Math.max(1.6, L.w * 0.13);
        g.save();
        g.lineCap = 'round'; g.lineJoin = 'round';
        if (shadow) {
            g.shadowColor = 'rgba(0,0,0,0.45)';
            g.shadowBlur = t * 2.5;
            g.shadowOffsetY = t * 1.6;
        }
        path(g);
        g.strokeStyle = '#0b1c10'; g.lineWidth = t; g.stroke();
        g.shadowColor = 'transparent';
        g.setLineDash([t * 0.8, t * 0.8]);
        g.strokeStyle = 'rgba(70,120,80,0.55)'; g.lineWidth = t * 0.45; g.stroke();
        g.restore();
    }

    function hooks(g, L) {
        const r = L.w * 0.14;
        g.save();
        g.lineCap = 'round';
        g.strokeStyle = '#b8913e'; g.lineWidth = Math.max(1.2, L.w * 0.07);
        for (const hx of L.hooks) {
            const x = LastBulbLogic.mx(L, hx);
            if (x < -L.s || x > L.W + L.s) continue;
            g.beginPath();
            g.moveTo(x, L.top + L.rail);
            g.lineTo(x, L.hookY - r);
            g.arc(x, L.hookY, r, -Math.PI / 2, Math.PI * 0.8, true);
            g.stroke();
            g.fillStyle = '#d8b765';
            g.fillRect(x - L.w * 0.09, L.top + L.rail - 1, L.w * 0.18, Math.max(1.5, L.w * 0.06));
        }
        g.restore();
    }

    // ---- The bulbs -----------------------------------------------------------------------------

    // A C9's glass: a narrow neck at the screw base, round shoulders, and a
    // long taper to a soft point. Drawn hanging down from y = 0.
    function glassPath(g, w) {
        g.beginPath();
        g.moveTo(-0.24 * w, 0);
        g.bezierCurveTo(-0.27 * w, 0.3 * w, -0.5 * w, 0.4 * w, -0.5 * w, 0.78 * w);
        g.bezierCurveTo(-0.5 * w, 1.26 * w, -0.16 * w, 1.68 * w, 0, 1.94 * w);
        g.bezierCurveTo(0.16 * w, 1.68 * w, 0.5 * w, 1.26 * w, 0.5 * w, 0.78 * w);
        g.bezierCurveTo(0.5 * w, 0.4 * w, 0.27 * w, 0.3 * w, 0.24 * w, 0);
        g.closePath();
    }
    const SOCKET = 1.08;      // the glass starts this many widths below the wire
    const CENTRE = SOCKET + 0.82;

    // The socket clipped to the wire, and the brass screw base below it.
    function socket(g, w) {
        const sw = 0.74 * w;
        const body = g.createLinearGradient(-sw / 2, 0, sw / 2, 0);
        body.addColorStop(0, '#0b1a10'); body.addColorStop(0.32, '#2f5c3b'); body.addColorStop(0.55, '#1a3a24'); body.addColorStop(1, '#08140b');
        g.fillStyle = body;
        g.beginPath();
        g.roundRect(-0.27 * w, -0.1 * w, 0.54 * w, 0.26 * w, 0.06 * w);
        g.fill();
        g.beginPath();
        g.roundRect(-sw / 2, 0.1 * w, sw, 0.86 * w, [0.12 * w, 0.12 * w, 0.06 * w, 0.06 * w]);
        g.fill();
        g.fillStyle = 'rgba(0,0,0,0.35)';
        for (const y of [0.38, 0.62]) g.fillRect(-sw / 2, y * w, sw, Math.max(0.8, 0.04 * w));
        g.fillStyle = 'rgba(160,220,170,0.16)';
        g.fillRect(-sw * 0.28, 0.16 * w, sw * 0.1, 0.74 * w);
        const brass = g.createLinearGradient(-0.25 * w, 0, 0.25 * w, 0);
        brass.addColorStop(0, '#5e4114'); brass.addColorStop(0.35, '#e6c46a'); brass.addColorStop(0.7, '#a07a2c'); brass.addColorStop(1, '#4a320e');
        g.fillStyle = brass;
        g.fillRect(-0.25 * w, 0.94 * w, 0.5 * w, (SOCKET - 0.9) * w + 0.04 * w);
        g.strokeStyle = 'rgba(60,36,8,0.7)'; g.lineWidth = Math.max(0.6, 0.03 * w);
        for (let i = 0; i < 2; i++) { const y = (0.99 + i * 0.07) * w; g.beginPath(); g.moveTo(-0.25 * w, y); g.lineTo(0.25 * w, y + 0.04 * w); g.stroke(); }
    }

    // One bulb sprite: socket, base and glass, hanging from the wire at its
    // anchor. `mode` is 'dark', 'lit' (with the bloom round the glass baked
    // in) or 'ember' (the glass alone, glowing filament-orange: drawn over
    // a dark bulb while the filament is warming or cooling).
    function bulb(colour, w, dpr, mode, glass) {
        const R = w * 2.5;
        const ax = R, ay = Math.max(0.3 * w, R - CENTRE * w + 0.1 * w);
        const cw = 2 * R, chH = ay + CENTRE * w + R;
        const c = canvas(cw * dpr, chH * dpr), g = c.getContext('2d');
        g.scale(dpr, dpr);
        g.translate(ax, ay);
        const col = rgb(colour);
        const cy = CENTRE * w;
        if (mode === 'lit') {
            const halo = g.createRadialGradient(0, cy, 0, 0, cy, R);
            const hot = mix(col, WHITE, 0.45);
            halo.addColorStop(0, css(hot, 0.55)); halo.addColorStop(0.22, css(col, 0.3)); halo.addColorStop(0.55, css(col, 0.08)); halo.addColorStop(1, css(col, 0));
            g.fillStyle = halo;
            g.fillRect(-R, cy - R, 2 * R, 2 * R);
        }
        if (mode !== 'ember') socket(g, w);
        g.save();
        g.translate(0, SOCKET * w);
        glassPath(g, w);
        const fy = 0.62 * w;                           // the filament
        if (mode === 'ember') {
            g.clip();
            const e = g.createRadialGradient(0, fy, 0, 0, fy, 1.1 * w);
            e.addColorStop(0, css(mix(EMBER, WHITE, 0.25), 0.95));
            e.addColorStop(0.35, css(mix(EMBER, col, 0.35), 0.7));
            e.addColorStop(1, css(mix(EMBER, col, 0.6), 0.15));
            g.fillStyle = e;
            g.fillRect(-w, -0.1 * w, 2 * w, 2.2 * w);
        } else if (glass === 'clear') {
            const on = mode === 'lit';
            const fill = g.createLinearGradient(-0.5 * w, 0, 0.5 * w, 0);
            fill.addColorStop(0, css(mix(col, BLACK, on ? 0.1 : 0.55), on ? 0.9 : 0.6));
            fill.addColorStop(0.4, css(mix(col, WHITE, on ? 0.35 : 0), on ? 0.75 : 0.35));
            fill.addColorStop(1, css(mix(col, BLACK, on ? 0.2 : 0.65), on ? 0.9 : 0.65));
            g.fillStyle = fill;
            g.fill();
            g.save();
            g.clip();
            if (on) {
                const core = g.createRadialGradient(0, fy, 0, 0, fy, 0.7 * w);
                core.addColorStop(0, 'rgba(255,255,250,1)'); core.addColorStop(0.3, css(mix(col, WHITE, 0.7), 0.85)); core.addColorStop(1, css(col, 0));
                g.fillStyle = core;
                g.fillRect(-w, -0.1 * w, 2 * w, 2.2 * w);
            }
            // The ribs moulded into the glass.
            g.strokeStyle = on ? css(mix(col, WHITE, 0.6), 0.35) : 'rgba(255,255,255,0.13)';
            g.lineWidth = Math.max(0.6, 0.035 * w);
            for (const k of [-0.32, -0.14, 0.04, 0.22, 0.38]) {
                g.beginPath(); g.moveTo(k * 0.5 * w, 0.05 * w); g.quadraticCurveTo(k * 1.1 * w, 0.85 * w, 0, 1.92 * w); g.stroke();
            }
            g.restore();
            // The filament on its two lead wires.
            g.strokeStyle = on ? 'rgba(255,250,230,0.95)' : 'rgba(40,36,30,0.75)';
            g.lineWidth = Math.max(0.5, 0.025 * w);
            g.beginPath(); g.moveTo(-0.07 * w, 0); g.lineTo(-0.1 * w, fy); g.moveTo(0.07 * w, 0); g.lineTo(0.1 * w, fy); g.stroke();
            g.lineWidth = Math.max(0.8, 0.05 * w);
            g.beginPath(); g.moveTo(-0.1 * w, fy); g.quadraticCurveTo(0, fy + 0.08 * w, 0.1 * w, fy); g.stroke();
        } else if (mode === 'lit') {
            const fill = g.createRadialGradient(0, fy + 0.1 * w, 0, 0, fy + 0.1 * w, 1.35 * w);
            fill.addColorStop(0, css(mix(col, WHITE, 0.85)));
            fill.addColorStop(0.32, css(mix(col, WHITE, 0.38)));
            fill.addColorStop(0.78, css(col));
            fill.addColorStop(1, css(mix(col, BLACK, 0.18)));
            g.fillStyle = fill;
            g.fill();
        } else {
            const fill = g.createLinearGradient(-0.5 * w, 0, 0.5 * w, 0);
            fill.addColorStop(0, css(mix(col, BLACK, 0.74)));
            fill.addColorStop(0.32, css(mix(col, BLACK, 0.46)));
            fill.addColorStop(1, css(mix(col, BLACK, 0.82)));
            g.fillStyle = fill;
            g.fill();
        }
        if (mode !== 'ember') {
            // The glaze's highlight, and its rim.
            g.fillStyle = mode === 'lit' ? 'rgba(255,255,255,0.35)' : 'rgba(255,245,225,0.3)';
            g.beginPath(); g.ellipse(-0.24 * w, 0.62 * w, 0.06 * w, 0.3 * w, 0.18, 0, Math.PI * 2); g.fill();
            glassPath(g, w);
            g.strokeStyle = css(mix(col, BLACK, mode === 'lit' ? 0.25 : 0.85), 0.55);
            g.lineWidth = Math.max(0.6, 0.035 * w);
            g.stroke();
        }
        g.restore();
        return { c, ax, ay, w: cw, h: chH, cy };
    }

    // A sprite at (x, y), turned by `a` about its anchor.
    function put(g, s, x, y, a, alpha = 1) {
        if (alpha <= 0.003) return;
        g.save();
        g.globalAlpha = alpha;
        g.translate(x, y);
        if (a) g.rotate(a);
        g.drawImage(s.c, -s.ax, -s.ay, s.w, s.h);
        g.restore();
    }
    // Where a hanging bulb's glass centre is: below its anchor, turned by a.
    const centre = (x, y, a, w) => ({ x: x - Math.sin(a) * CENTRE * w, y: y + Math.cos(a) * CENTRE * w });

    // The strand's end plug: a female connector, hanging from its wire.
    function plug(w, dpr) {
        const pw = 0.5 * w, ph = 0.95 * w;
        const c = canvas((pw + 4) * dpr, (ph + 4) * dpr), g = c.getContext('2d');
        g.scale(dpr, dpr); g.translate(pw / 2 + 2, 2);
        const body = g.createLinearGradient(-pw / 2, 0, pw / 2, 0);
        body.addColorStop(0, '#0a170d'); body.addColorStop(0.35, '#2b5536'); body.addColorStop(1, '#07120a');
        g.fillStyle = body;
        g.beginPath(); g.roundRect(-pw / 2, 0, pw, ph, [0.08 * w, 0.08 * w, 0.14 * w, 0.14 * w]); g.fill();
        g.fillStyle = '#020503';
        for (const dx of [-0.11, 0.11]) g.fillRect(dx * w - 0.03 * w, ph * 0.72, 0.06 * w, 0.16 * w);
        g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(-pw * 0.28, ph * 0.08, pw * 0.1, ph * 0.6);
        return { c, ax: pw / 2 + 2, ay: 2, w: pw + 4, h: ph + 4 };
    }

    // A little kraft-paper tag on a thread, in someone's handwriting. `shade`
    // is the same shape in black, to dim it with the room.
    function tag(w, dpr, text) {
        const tw = 1.6 * w, th = 0.85 * w, thread = 1.3 * w;
        const make = dark => {
            const c = canvas((tw + 4) * dpr, (thread + th + 4) * dpr), g = c.getContext('2d');
            g.scale(dpr, dpr); g.translate(tw / 2 + 2, 0);
            g.strokeStyle = dark ? '#000' : '#e8dcc4'; g.lineWidth = Math.max(0.7, 0.04 * w);
            g.beginPath(); g.moveTo(0, 0); g.lineTo(0, thread + 0.18 * w); g.stroke();
            const n = 0.28 * w;
            g.beginPath();
            g.moveTo(-tw / 2 + n, thread); g.lineTo(tw / 2 - n, thread); g.lineTo(tw / 2, thread + n);
            g.lineTo(tw / 2, thread + th); g.lineTo(-tw / 2, thread + th); g.lineTo(-tw / 2, thread + n); g.closePath();
            if (dark) { g.fillStyle = '#000'; g.fill(); return c; }
            g.fillStyle = '#c8a36a'; g.fill();
            g.strokeStyle = 'rgba(90,60,30,0.5)'; g.lineWidth = Math.max(0.6, 0.03 * w); g.stroke();
            g.fillStyle = '#efe6d3';
            g.beginPath(); g.arc(0, thread + 0.18 * w, 0.08 * w, 0, Math.PI * 2); g.fill();
            g.fillStyle = '#4a2c14';
            g.font = `italic ${Math.round(0.42 * w)}px "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive`;
            g.textAlign = 'center'; g.textBaseline = 'middle';
            g.save(); g.translate(0, thread + th * 0.6); g.rotate(-0.06);
            g.fillText(text, 0, 0);
            g.restore();
            return c;
        };
        const s = { ax: tw / 2 + 2, ay: 0, w: tw + 4, h: thread + th + 4 };
        return { lit: { ...s, c: make(false) }, shade: { ...s, c: make(true) } };
    }

    return { WALLS, albedo, lit, strandPath, wire, hooks, bulb, put, centre, plug, tag, CENTRE, rgb, mix, css };
})();
