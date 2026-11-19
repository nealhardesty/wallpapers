// Christmas Village's scenery, painted once per layout at full daylight
// colour (the manager washes it with the light of the hour): the two
// mountain ranges and their woods, the snowfields, firs and bare maples,
// the pond and the things that stand about it. The buildings are in
// village-buildings.js. Everything here draws in CSS pixels on a context
// already scaled for the device.

const VillageArt = (() => {
    const { clamp, lerp } = VillageLogic;
    const TAU = Math.PI * 2;
    const SNOW = '#f6f9fd', SNOW_SHADE = '#c5d3e8', SNOW_DEEP = '#a3b7d6';

    const canvas = (w, h, dpr) => {
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.ceil(w * dpr));
        c.height = Math.max(1, Math.ceil(h * dpr));
        const g = c.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        return [c, g];
    };
    const poly = (g, pts, fill) => {
        g.beginPath();
        g.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
        g.closePath();
        if (fill) { g.fillStyle = fill; g.fill(); }
    };
    const blob = (g, x, y, rx, ry, fill, rot = 0) => { g.beginPath(); g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU); g.fillStyle = fill; g.fill(); };
    const hex = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
    const mix = (a, b, t) => { const p = hex(a), q = hex(b); return `rgb(${p.map((v, i) => Math.round(v + (q[i] - v) * t)).join(',')})`; };
    const rgba = (c, a) => { const p = hex(c); return `rgba(${p[0]},${p[1]},${p[2]},${a})`; };

    // ---- Mountains ------------------------------------------------------------

    // Woods on a slope: rows of small firs from the treeline down, thicker
    // lower, each with snow on its weather side.
    function woods(g, L, ridge, baseY, o, random) {
        const { W } = L, size = o.size;
        for (let t = o.from; t <= 1.02; t += size * 0.5 / Math.max(20, baseY - L.hz + L.Hu * 0.2)) {
            const fill = clamp((t - o.from) / (1 - o.from) * 1.7 + 0.12, 0, 1);
            for (let x = -size + random() * size; x < W + size; x += size * (0.5 + random() * 0.6)) {
                if (random() > fill) continue;
                if (o.skip && o.skip(x, lerp(ridge(x), baseY, t))) continue;
                const y = lerp(ridge(x), baseY, t) + (random() - 0.5) * size * 0.6, h = size * (0.8 + random() * 0.9), w = h * 0.42;
                g.fillStyle = mix(o.color, o.haze, random() * 0.35 + (1 - t) * 0.3);
                g.beginPath(); g.moveTo(x, y - h); g.lineTo(x + w / 2, y); g.lineTo(x - w / 2, y); g.closePath(); g.fill();
                g.fillStyle = rgba('#ffffff', 0.5 + random() * 0.3);
                g.beginPath(); g.moveTo(x, y - h); g.lineTo(x - w * 0.06, y - h * 0.3); g.lineTo(x - w * 0.42, y - h * 0.12); g.closePath(); g.fill();
            }
        }
    }

    function range(g, L, ridge, baseY, o, random) {
        const { W, s } = L;
        let top = baseY;
        g.beginPath();
        g.moveTo(-10, baseY + 2);
        for (let x = -10; x <= W + 10; x += 3) { const y = ridge(x); top = Math.min(top, y); g.lineTo(x, y); }
        g.lineTo(W + 10, baseY + 2);
        g.closePath();
        const body = g.createLinearGradient(0, top, 0, baseY);
        body.addColorStop(0, o.snow);
        body.addColorStop(0.5, o.mid);
        body.addColorStop(1, o.base);
        g.fillStyle = body;
        g.fill();
        g.save();
        g.clip();
        // Spurs running down from the ridge: the flank away from the light in
        // shade, and the crest itself catching it.
        for (let x = random() * 30 * s; x < W + 40 * s; x += (22 + random() * 60) * s * o.grain) {
            const y0 = ridge(x), len = (baseY - y0) * (0.4 + random() * 0.55), n = 7, spur = [[x, y0]];
            let px = x;
            for (let i = 1; i <= n; i++) { px += len / n * (0.2 + random() * 0.55); spur.push([px + (random() - 0.5) * 3 * s, y0 + len * i / n]); }
            const width = len * (0.45 + random() * 0.6);
            g.beginPath();
            g.moveTo(x, y0);
            for (const p of spur) g.lineTo(p[0], p[1]);
            g.lineTo(px + width * 0.5, y0 + len * 0.8);
            for (let rx = x + width; rx >= x; rx -= 4) g.lineTo(rx, ridge(rx));
            g.closePath();
            const shade = g.createLinearGradient(0, y0, 0, y0 + len);
            shade.addColorStop(0, rgba(o.shade, 0.55));
            shade.addColorStop(1, rgba(o.shade, 0));
            g.fillStyle = shade;
            g.fill();
            g.beginPath();
            g.moveTo(x, y0);
            for (const p of spur.slice(0, 5)) g.lineTo(p[0] - 1.2 * s, p[1]);
            g.strokeStyle = 'rgba(255,255,255,0.4)';
            g.lineWidth = 1.1 * s * o.grain;
            g.stroke();
        }
        // Bare rock showing through where it's steep.
        for (let i = 0; i < 0; i++) {
            const x = random() * W, y0 = ridge(x), y = y0 + (baseY - y0) * (0.08 + random() * 0.3), w = (6 + random() * 16) * s * o.grain;
            g.fillStyle = rgba(o.shade, 0.18 + random() * 0.2);
            g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y + w * 0.7); g.lineTo(x + w * 0.3, y + w * 1.1); g.closePath(); g.fill();
        }
        woods(g, L, ridge, baseY, o.woods, random);
        const haze = g.createLinearGradient(0, lerp(top, baseY, 0.55), 0, baseY);
        haze.addColorStop(0, 'rgba(226,234,246,0)');
        haze.addColorStop(1, `rgba(226,234,246,${o.hazeAt})`);
        g.fillStyle = haze;
        g.fillRect(0, top, W, baseY - top + 2);
        g.restore();
    }

    function mountains(g, L, random) {
        const { hz, s } = L;
        range(g, L, L.farRidge, hz + 2, {
            snow: '#e4ecf6', mid: '#b9c8de', base: '#a2b4cf', shade: '#7c92b8', grain: 1.25, rock: 0.5, hazeAt: 0.5,
            woods: { from: 0.5, size: 4.5 * s, color: '#7388a6', haze: '#a9b9d0' },
        }, random);
        const c = L.cabin, clear = c ? (x, y) => Math.hypot((x - c.x) / (64 * c.k), (y - c.y) / (22 * c.k)) < 1 || (Math.abs(x - c.x) < 30 * c.k && y < c.y && y > c.y - 44 * c.k) : null;
        range(g, L, L.nearRidge, hz + 3, {
            snow: '#f4f7fc', mid: '#c9d6e8', base: '#9db0c8', shade: '#6e86ae', grain: 1, rock: 1, hazeAt: 0.2,
            woods: { from: 0.3, size: 8 * s, color: '#3d5c58', haze: '#7f97a8', skip: clear },
        }, random);
    }

    // ---- Snowfields -----------------------------------------------------------

    function ground(g, L, random) {
        const { W, H, Hu, hz, s } = L;
        const base = g.createLinearGradient(0, hz, 0, H);
        base.addColorStop(0, '#dbe5f2');
        base.addColorStop(0.3, '#eaf0f8');
        base.addColorStop(1, '#fbfcfe');
        g.fillStyle = base;
        g.fillRect(0, hz - 1, W, H - hz + 1);
        // Swells: each one's crest catches the light, and shades the foot of the one behind.
        const swell = noiseLine(random);
        for (let i = 0; i < 6; i++) {
            const y0 = hz + Hu * (0.02 + 0.105 * i), amp = (10 + i * 5) * s, f = 1 / ((150 + i * 60) * s), ph = random() * 100;
            const line = x => y0 + (swell(x * f + ph) - 0.5) * 2 * amp;
            g.beginPath();
            g.moveTo(-5, H);
            for (let x = -5; x <= W + 5; x += 6) g.lineTo(x, line(x));
            g.lineTo(W + 5, H);
            g.closePath();
            const fill = g.createLinearGradient(0, y0 - amp, 0, y0 + amp + Hu * 0.1);
            fill.addColorStop(0, i < 2 ? '#edf2f9' : '#fbfcff');
            fill.addColorStop(0.5, i < 2 ? '#e3eaf5' : '#eef3fa');
            fill.addColorStop(1, 'rgba(232,239,248,0)');
            g.fillStyle = fill;
            g.fill();
            g.beginPath();
            for (let x = -5; x <= W + 5; x += 6) g.lineTo(x, line(x) - 1.5 * s);
            g.strokeStyle = `rgba(150,172,206,${0.3 - i * 0.03})`;
            g.lineWidth = 2.2 * s;
            g.stroke();
        }
        // Drifts and hollows, and the sparkle of new snow.
        for (let i = 0; i < W * (H - hz) / (5200 * s * s); i++) {
            const y = hz + (H - hz) * random() ** 0.8, k = L.depth(y) / s;
            blob(g, random() * W, y, (18 + random() * 50) * s * k, (2 + random() * 5) * s * k, `rgba(170,190,220,${0.1 + random() * 0.14})`);
        }
        g.fillStyle = '#ffffff';
        for (let i = 0; i < W * (H - hz) / 900; i++) {
            g.globalAlpha = 0.5 + random() * 0.5;
            const y = hz + (H - hz) * random();
            g.fillRect(random() * W, y, 1, 1);
        }
        g.globalAlpha = 1;
    }
    const noiseLine = random => {
        const t = Array.from({ length: 65 }, () => random());
        return x => { const i = Math.floor(x), f = x - i, a = t[((i % 64) + 64) % 64], b = t[(((i + 1) % 64) + 64) % 64]; return a + (b - a) * f * f * (3 - 2 * f); };
    };

    // ---- Trees ----------------------------------------------------------------

    const FIRS = [
        { dark: '#14382b', mid: '#1f523c', lite: '#2e6c4e' },
        { dark: '#18402f', mid: '#255c42', lite: '#377858' },
        { dark: '#16363a', mid: '#21524f', lite: '#2f6c66' },    // a blue spruce
        { dark: '#1d3b25', mid: '#2b5a35', lite: '#3d7446' },
    ];

    // A fir, its base at (x, y), h tall: tiers of drooping boughs, lit from
    // the left, snow lying along each. `snow` 0..1 is how laden it is.
    function fir(g, x, y, h, random, o = {}) {
        const c = FIRS[(o.v ?? Math.floor(random() * FIRS.length)) % FIRS.length], snow = o.snow ?? 0.8;
        const w = h * (o.wide || 0.5), tiers = clamp(Math.round(h / (o.tier || 11)), 3, 24);
        g.fillStyle = '#3f2e24';
        g.fillRect(x - h * 0.02, y - h * 0.1, h * 0.04, h * 0.1);
        const rise = h * 0.92 / tiers;
        for (let i = 0; i < tiers; i++) {
            const t = i / tiers, yb = y - h * 0.06 - rise * i, th = rise * 2.1;
            const tw = w * (1 - t) ** 0.82 * (0.9 + random() * 0.2) + h * 0.03, yt = Math.max(y - h, yb - th);
            const lean = (random() - 0.5) * tw * 0.06, n = Math.max(3, Math.round(tw / Math.max(3, h * 0.045)));
            const edge = [];
            for (let j = 0; j <= n; j++) {
                const u = j / n, px = x + lean + tw / 2 - tw * u;
                edge.push([px, yb - (j % 2 ? th * 0.16 : 0) + Math.sin(u * Math.PI) * th * 0.06 + (random() - 0.5) * th * 0.06]);
            }
            g.beginPath();
            g.moveTo(x, yt);
            for (const p of edge) g.lineTo(p[0], p[1]);
            g.closePath();
            const fill = g.createLinearGradient(x - tw / 2, 0, x + tw / 2, 0);
            fill.addColorStop(0, c.lite);
            fill.addColorStop(0.45, c.mid);
            fill.addColorStop(1, c.dark);
            g.fillStyle = fill;
            g.fill();
            // The shadow of the tier above, then the snow on this one.
            g.fillStyle = 'rgba(8,24,20,0.28)';
            g.beginPath(); g.moveTo(x, yt); g.lineTo(x + tw * 0.3, yt + th * 0.45); g.lineTo(x - tw * 0.3, yt + th * 0.45); g.closePath(); g.fill();
            if (snow > 0) {
                // Snow lying along the bough from its lit end: a drift that
                // follows the edge, thick in the middle, broken here and there.
                const from = n, to = Math.max(1, Math.round(n * (1 - (0.4 + snow * 0.55)))), thick = Math.min(th * 0.3, 2 + h * 0.016) * (0.5 + snow * 0.6);
                let run = [];
                const lay = () => {
                    if (run.length < 2) { run = []; return; }
                    for (const [dy, fill] of [[thick * 0.3, SNOW_SHADE], [0, SNOW]]) {
                        g.beginPath();
                        g.moveTo(run[0][0], run[0][1] + dy);
                        for (const p of run) g.lineTo(p[0], p[1] + dy);
                        for (let i = run.length - 1; i >= 0; i--) {
                            const u = i / (run.length - 1), lift = thick * (0.35 + Math.sin(u * Math.PI) * 0.9) * (0.8 + ((i * 7) % 5) * 0.08);
                            g.lineTo(run[i][0] + (u - 0.5) * tw * 0.03, run[i][1] - lift + dy);
                        }
                        g.closePath();
                        g.fillStyle = fill;
                        g.fill();
                    }
                    run = [];
                };
                for (let j = from; j >= to; j--) {
                    if (random() > snow + 0.25) { lay(); continue; }
                    run.push(edge[j]);
                }
                lay();
            }
        }
        if (snow > 0.3) blob(g, x - h * 0.004, y - h * 0.985, h * 0.022, h * 0.026, SNOW);
    }

    // Where the lights hang on a fir h tall whose base is at (0, 0):
    // garlands slung across it, sagging, each a little askew.
    function firLights(h, random, o = {}) {
        const w = h * (o.wide || 0.5), bulbs = [], rows = clamp(Math.round(h / 12), 3, 16);
        for (let r = 0; r < rows; r++) {
            const t = (r + 0.6) / (rows + 0.6), half = (w / 2) * (1 - t) ** 0.82 * 0.86, y = -h * 0.08 - h * 0.88 * t;
            const n = Math.max(1, Math.round(half * 2 / Math.max(4.5, h * 0.05))), tilt = (r % 2 ? 1 : -1) * h * 0.022;
            for (let j = 0; j <= n; j++) {
                const u = n ? j / n : 0.5;
                bulbs.push({ x: -half + half * 2 * u + (random() - 0.5) * 1.5, y: y + Math.sin(u * Math.PI) * h * 0.028 + (u - 0.5) * tilt + (random() - 0.5) * 1.2, i: bulbs.length });
            }
        }
        return bulbs;
    }

    // A bare maple: the trunk forks and forks again, snow along the top of every bough.
    function maple(g, x, y, h, random) {
        const limb = (x0, y0, angle, len, width, depth) => {
            const bend = (random() - 0.5) * 0.3, x1 = x0 + Math.cos(angle + bend) * len, y1 = y0 + Math.sin(angle + bend) * len;
            g.strokeStyle = depth < 2 ? '#43362f' : '#54463e';
            g.lineWidth = width;
            g.lineCap = 'round';
            g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
            if (Math.abs(Math.cos(angle)) > 0.25 && width > 0.5) {
                g.strokeStyle = 'rgba(250,252,255,0.9)';
                g.lineWidth = Math.max(0.6, width * 0.5);
                g.beginPath(); g.moveTo(x0, y0 - width * 0.45); g.lineTo(x1, y1 - width * 0.45); g.stroke();
            }
            if (depth >= 5 || len < 2.5) return;
            const kids = depth < 1 ? 3 : 2 + (random() < 0.35 ? 1 : 0);
            for (let i = 0; i < kids; i++) {
                const spread = (i - (kids - 1) / 2) * (0.5 + random() * 0.35);
                limb(x1, y1, angle + spread + (random() - 0.5) * 0.25, len * (0.66 + random() * 0.14), width * 0.62, depth + 1);
            }
        };
        limb(x, y, -Math.PI / 2 + (random() - 0.5) * 0.12, h * 0.3, Math.max(1.2, h * 0.045), 0);
        g.lineCap = 'butt';
    }

    // A tree as a sprite: { c, ax, ay } with (ax, ay) its base, in CSS pixels.
    function firSprite(h, dpr, random, o = {}) {
        const w = h * (o.wide || 0.5) + h * 0.2, pad = 6;
        const [c, g] = canvas(w + pad * 2, h + pad * 2 + h * 0.06, dpr);
        // Its shadow on the snow, then the tree.
        blob(g, w / 2 + pad + h * 0.05, h + pad + h * 0.01, w * 0.42, h * 0.035, 'rgba(120,146,190,0.4)');
        fir(g, w / 2 + pad, h + pad, h, random, o);
        return { c, w: w + pad * 2, h: h + pad * 2 + h * 0.06, ax: w / 2 + pad, ay: h + pad, tall: h };
    }

    // ---- The pond ---------------------------------------------------------------

    // The shore: not quite an ellipse. `grow` scales it about its middle.
    function pondPath(g, pond, grow = 1) {
        g.beginPath();
        for (let i = 0; i <= 72; i++) {
            const a = i / 72 * TAU, r = grow * (1 + 0.03 * Math.sin(a * 3 + pond.wob) + 0.022 * Math.sin(a * 5 + pond.wob * 2.3));
            const x = pond.cx + Math.cos(a) * pond.rx * r, y = pond.cy + Math.sin(a) * pond.ry * r;
            if (i) g.lineTo(x, y); else g.moveTo(x, y);
        }
        g.closePath();
    }

    function pond(g, L, random) {
        const p = L.pond, { s } = L;
        p.wob = random() * 10;
        // The bank: snow shovelled back from the ice, and the shadow under its lip.
        pondPath(g, p, 1.1);
        g.fillStyle = '#ffffff';
        g.fill();
        pondPath(g, p, 1.045);
        g.fillStyle = SNOW_SHADE;
        g.fill();
        pondPath(g, p, 1);
        const ice = g.createLinearGradient(0, p.cy - p.ry, 0, p.cy + p.ry);
        ice.addColorStop(0, '#93b1cc');
        ice.addColorStop(0.5, '#b4cde0');
        ice.addColorStop(1, '#d3e3ee');
        g.fillStyle = ice;
        g.fill();
        g.save();
        g.clip();
        // Milky ice, old cracks, and a dusting blown in from the banks.
        for (let i = 0; i < 26; i++) blob(g, p.cx + (random() - 0.5) * p.rx * 1.9, p.cy + (random() - 0.5) * p.ry * 1.8, p.rx * (0.08 + random() * 0.22), p.ry * (0.03 + random() * 0.08), `rgba(255,255,255,${0.05 + random() * 0.1})`);
        g.strokeStyle = 'rgba(255,255,255,0.3)';
        g.lineWidth = 0.7 * s;
        for (let i = 0; i < 7; i++) {
            let x = p.cx + (random() - 0.5) * p.rx * 1.6, y = p.cy + (random() - 0.5) * p.ry * 1.5;
            g.beginPath(); g.moveTo(x, y);
            for (let j = 0; j < 5; j++) { x += (random() - 0.5) * p.rx * 0.3; y += (random() - 0.5) * p.ry * 0.24; g.lineTo(x, y); }
            g.stroke();
        }
        for (let k = 0; k < 4; k++) {
            pondPath(g, p, 1.005);
            g.strokeStyle = `rgba(255,255,255,${0.2 - k * 0.04})`;
            g.lineWidth = (4 + k * 7) * s;
            g.stroke();
        }
        // The far bank throws a shadow onto the ice.
        const lip = g.createLinearGradient(0, p.cy - p.ry * 1.05, 0, p.cy - p.ry * 0.55);
        lip.addColorStop(0, 'rgba(70,100,150,0.4)');
        lip.addColorStop(1, 'rgba(70,100,150,0)');
        g.fillStyle = lip;
        g.fillRect(p.cx - p.rx * 1.1, p.cy - p.ry * 1.1, p.rx * 2.2, p.ry * 0.6);
        g.restore();
        // The near bank's lip stands in front of the ice.
        g.save();
        g.beginPath();
        g.rect(p.cx - p.rx * 1.2, p.cy + p.ry * 0.25, p.rx * 2.4, p.ry * 1.2);
        g.clip();
        pondPath(g, p, 1.035);
        g.strokeStyle = '#ffffff';
        g.lineWidth = 6 * s;
        g.stroke();
        g.restore();
        // Heaps of shovelled snow round the edge.
        for (let i = 0; i < 22; i++) {
            const a = random() * TAU, r = 1.07 + random() * 0.06, x = p.cx + Math.cos(a) * p.rx * r, y = p.cy + Math.sin(a) * p.ry * r, k = L.depth(y) / s;
            const w = (9 + random() * 13) * s * k;
            blob(g, x + w * 0.12, y + w * 0.08, w, w * 0.34, SNOW_SHADE);
            blob(g, x, y - w * 0.06, w, w * 0.36, '#ffffff');
        }
    }

    // ---- Things standing about --------------------------------------------------

    function snowman(g, x, y, k) {
        blob(g, x + 5 * k, y, 13 * k, 3 * k, 'rgba(120,146,190,0.4)');
        const ball = (cy, r) => {
            const fill = g.createRadialGradient(x - r * 0.35, cy - r * 0.35, r * 0.1, x, cy, r);
            fill.addColorStop(0, '#ffffff');
            fill.addColorStop(1, '#c9d7ea');
            g.fillStyle = fill;
            g.beginPath(); g.arc(x, cy, r, 0, TAU); g.fill();
        };
        ball(y - 8 * k, 9 * k); ball(y - 20.5 * k, 6.6 * k); ball(y - 30 * k, 4.6 * k);
        g.strokeStyle = '#4a3a2e'; g.lineWidth = 1 * k; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x - 6 * k, y - 21 * k); g.lineTo(x - 15 * k, y - 27 * k); g.moveTo(x + 6 * k, y - 21 * k); g.lineTo(x + 15 * k, y - 25 * k); g.moveTo(x + 12.5 * k, y - 24.3 * k); g.lineTo(x + 14 * k, y - 28 * k); g.stroke();
        g.lineCap = 'butt';
        g.fillStyle = '#c0392b';
        g.fillRect(x - 4.6 * k, y - 26.6 * k, 9.2 * k, 2.2 * k);
        g.fillRect(x + 1.6 * k, y - 26 * k, 2.2 * k, 7 * k);
        g.fillStyle = '#20222a';
        for (const [dx, dy] of [[-1.7, -31], [1.7, -31], [0, -22.5], [0, -19], [0, -11]]) { g.beginPath(); g.arc(x + dx * k, y + dy * k, 0.75 * k, 0, TAU); g.fill(); }
        g.fillRect(x - 4.4 * k, y - 34.8 * k, 8.8 * k, 1.3 * k);
        g.fillRect(x - 3 * k, y - 40 * k, 6 * k, 5.4 * k);
        g.fillStyle = '#e67e22';
        g.beginPath(); g.moveTo(x, y - 29.6 * k); g.lineTo(x + 5 * k, y - 28.8 * k); g.lineTo(x, y - 28.2 * k); g.closePath(); g.fill();
    }

    // A drystone wall from (x0, y) to (x1, y), snow lying along the top.
    function wall(g, x0, x1, y, k, random) {
        for (let x = x0; x < x1;) {
            const w = (6 + random() * 7) * k, h = (5 + random() * 3) * k;
            const tone = 96 + Math.floor(random() * 50);
            g.fillStyle = `rgb(${tone},${tone + 4},${tone + 12})`;
            g.beginPath(); g.ellipse(x + w / 2, y - h / 2, w / 2 + 0.6 * k, h / 2, 0, 0, TAU); g.fill();
            g.fillStyle = `rgb(${tone - 34},${tone - 30},${tone - 20})`;
            g.beginPath(); g.ellipse(x + w / 2, y - h * 0.2, w / 2, h * 0.2, 0, 0, Math.PI); g.fill();
            x += w;
        }
        g.strokeStyle = '#ffffff'; g.lineWidth = 3.4 * k; g.lineCap = 'round';
        g.beginPath();
        for (let x = x0; x <= x1; x += 6 * k) g.lineTo(x, y - 7.6 * k + Math.sin(x * 0.11) * 0.8 * k);
        g.stroke();
        g.lineCap = 'butt';
    }

    // A split-rail fence from (x0, y0) to (x1, y1).
    function fence(g, x0, y0, x1, y1, k) {
        const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / (20 * k)));
        g.strokeStyle = '#6b5544'; g.lineWidth = 1.3 * k;
        for (const dy of [-4, -8]) { g.beginPath(); g.moveTo(x0, y0 + dy * k); g.lineTo(x1, y1 + dy * k); g.stroke(); }
        g.strokeStyle = '#ffffff'; g.lineWidth = 0.9 * k;
        g.beginPath(); g.moveTo(x0, y0 - 9 * k); g.lineTo(x1, y1 - 9 * k); g.stroke();
        for (let i = 0; i <= n; i++) {
            const x = lerp(x0, x1, i / n), y = lerp(y0, y1, i / n);
            g.fillStyle = '#5a4638';
            g.fillRect(x - 0.9 * k, y - 10.5 * k, 1.8 * k, 10.5 * k);
            blob(g, x, y - 10.8 * k, 1.7 * k, 1 * k, '#ffffff');
        }
    }

    // A street lamp: its head is at (x, y - 30k), where the manager puts the glow.
    function lamp(g, x, y, k, bow) {
        g.fillStyle = '#1e222b';
        g.fillRect(x - 0.8 * k, y - 27 * k, 1.6 * k, 27 * k);
        g.fillRect(x - 1.8 * k, y - 2.4 * k, 3.6 * k, 2.4 * k);
        poly(g, [[x - 2.6 * k, y - 27 * k], [x + 2.6 * k, y - 27 * k], [x + 3.4 * k, y - 33 * k], [x - 3.4 * k, y - 33 * k]], '#2a2f3a');
        g.fillStyle = '#d9dde6';
        g.fillRect(x - 2.3 * k, y - 32.4 * k, 4.6 * k, 4.8 * k);
        poly(g, [[x - 4.2 * k, y - 33 * k], [x + 4.2 * k, y - 33 * k], [x, y - 36.5 * k]], '#1e222b');
        blob(g, x, y - 35 * k, 4.2 * k, 1.5 * k, '#ffffff');
        if (bow) {
            g.strokeStyle = '#1f5a3a'; g.lineWidth = 1.5 * k;
            g.beginPath(); g.arc(x, y - 21 * k, 3 * k, 0, TAU); g.stroke();
            g.fillStyle = '#c0392b';
            g.fillRect(x - 1.5 * k, y - 19.4 * k, 3 * k, 1.6 * k);
        }
        return { x, y: y - 30 * k, k };
    }

    function bench(g, x, y, k) {
        g.fillStyle = '#5a4638';
        g.fillRect(x - 9 * k, y - 5 * k, 18 * k, 1.6 * k);
        g.fillRect(x - 9 * k, y - 10 * k, 18 * k, 1.4 * k);
        g.fillRect(x - 8 * k, y - 5 * k, 1.4 * k, 5 * k);
        g.fillRect(x + 6.6 * k, y - 5 * k, 1.4 * k, 5 * k);
        g.fillStyle = '#ffffff';
        g.fillRect(x - 9 * k, y - 11 * k, 18 * k, 1.2 * k);
    }

    // The town's sign, by the road in.
    function sign(g, x, y, k, lines) {
        g.fillStyle = '#4c3a2d';
        g.fillRect(x - 17 * k, y - 16 * k, 1.8 * k, 16 * k);
        g.fillRect(x + 15.2 * k, y - 16 * k, 1.8 * k, 16 * k);
        g.fillStyle = '#f3ead6';
        g.fillRect(x - 19 * k, y - 26 * k, 38 * k, 13 * k);
        g.strokeStyle = '#27452f'; g.lineWidth = 0.9 * k;
        g.strokeRect(x - 18 * k, y - 25 * k, 36 * k, 11 * k);
        g.fillStyle = '#27452f';
        g.textAlign = 'center';
        g.font = `${4.3 * k}px Georgia, 'Times New Roman', serif`;
        g.fillText(lines[0], x, y - 20.2 * k, 33 * k);
        g.font = `italic ${2.9 * k}px Georgia, 'Times New Roman', serif`;
        g.fillText(lines[1], x, y - 16.2 * k, 33 * k);
        g.strokeStyle = '#ffffff'; g.lineWidth = 2.2 * k; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x - 19 * k, y - 26.6 * k); g.lineTo(x + 19 * k, y - 26.6 * k); g.stroke();
        g.lineCap = 'butt';
    }

    // A soft round glow, as a sprite to draw with 'lighter'.
    function glow(size, dpr, inner, outer, mid = 0.25, end = 'rgba(0,0,0,0)') {
        const [c, g] = canvas(size, size, dpr);
        const fill = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        fill.addColorStop(0, inner);
        fill.addColorStop(mid, outer);
        fill.addColorStop(1, end);
        g.fillStyle = fill;
        g.fillRect(0, 0, size, size);
        return c;
    }

    return { SNOW, SNOW_SHADE, SNOW_DEEP, TAU, canvas, poly, blob, hex, mix, rgba, mountains, ground, woods, fir, firLights, firSprite, maple, pondPath, pond, snowman, wall, fence, lamp, bench, sign, glow };
})();
