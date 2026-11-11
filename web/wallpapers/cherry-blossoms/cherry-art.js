// Cherry Blossoms' art (SPEC §10.33): the sky of the hour with its sun or
// moon and stars, far hills in mist, the tree (bark, branches, twigs and
// clusters of five-petalled blossom and buds), the petal sprites in every
// colour and shape, and the ground: grass, a path, or water. Everything is
// baked at the device's pixel ratio; the frame only copies.
const CherryArt = (() => {
    const { rgb, mix, hexToRgb, lerp, clamp } = CherryLogic;

    function canvas(w, h, dpr = 1) {
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * dpr));
        c.height = Math.max(1, Math.round(h * dpr));
        const g = c.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        return { c, g };
    }

    // ---- The sky -----------------------------------------------------------------------------

    // sky: a CherryLogic.SKIES entry (or a blend). hills: far ridges in mist.
    function sky(W, H, dpr, sky, { hills = true, sun = true, random, groundY }) {
        const { c, g } = canvas(W, H, dpr);
        const grad = g.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, rgb(sky.top));
        grad.addColorStop(0.5, rgb(sky.mid));
        grad.addColorStop(1, rgb(sky.horizon));
        g.fillStyle = grad;
        g.fillRect(0, 0, W, H);
        const s = Math.min(W, H) / 800;
        // Stars, at night.
        if (sky.stars > 0.01) {
            g.fillStyle = '#fff';
            for (let i = 0; i < 160 * sky.stars; i++) {
                const x = random() * W, y = random() * H * 0.7, r = random() * 1.2 * s + 0.3;
                g.globalAlpha = sky.stars * (0.4 + random() * 0.6);
                g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
            }
            g.globalAlpha = 1;
        }
        // The sun (a soft glow high on the side away from the tree) or the moon.
        if (sun) {
            const sx = W * 0.72, sy = H * 0.2, sr = 150 * s;
            if (sky.moon > 0.5) {
                const mr = 26 * s;
                const halo = g.createRadialGradient(sx, sy, mr, sx, sy, mr * 6);
                halo.addColorStop(0, `rgba(220,225,255,${0.25 * sky.moon})`);
                halo.addColorStop(1, 'rgba(220,225,255,0)');
                g.fillStyle = halo; g.fillRect(sx - mr * 6, sy - mr * 6, mr * 12, mr * 12);
                g.fillStyle = '#f4f1e2';
                g.beginPath(); g.arc(sx, sy, mr, 0, Math.PI * 2); g.fill();
                g.fillStyle = 'rgba(190,190,175,0.5)';
                for (const [dx, dy, r] of [[-0.3, -0.2, 0.22], [0.25, 0.1, 0.16], [-0.1, 0.35, 0.12]]) { g.beginPath(); g.arc(sx + dx * mr, sy + dy * mr, r * mr, 0, Math.PI * 2); g.fill(); }
            } else {
                const glow = g.createRadialGradient(sx, sy, 0, sx, sy, sr * 2.2);
                glow.addColorStop(0, rgb(sky.sun, 0.9 * sky.light));
                glow.addColorStop(0.18, rgb(sky.sun, 0.45 * sky.light));
                glow.addColorStop(1, rgb(sky.sun, 0));
                g.fillStyle = glow;
                g.fillRect(sx - sr * 2.2, sy - sr * 2.2, sr * 4.4, sr * 4.4);
            }
        }
        // Far hills in mist: three ridges, the furthest palest and highest,
        // each a sum of slow waves with a little noise, down to the ground line.
        if (hills) {
            const base = groundY ?? H * 0.86;
            const ridges = [[0.62, 0.22, 110], [0.7, 0.42, 70], [0.78, 0.62, 45]];
            ridges.forEach(([yf, k, amp], i) => {
                const tint = mix([130, 110, 160], [60, 110, 90], i / 2);
                const col = mix(mix(sky.horizon, tint, 0.25 + 0.3 * k), [15, 15, 40], (1 - sky.light) * 0.7);
                g.fillStyle = rgb(col, 0.95);
                g.beginPath();
                g.moveTo(-10, H);
                const y0 = Math.min(base - 10 * s, H * yf + (base - H * 0.86));
                for (let x = -10; x <= W + 10; x += 6) {
                    const u = x / s;
                    const y = y0 - amp * s * (0.45 + 0.3 * Math.sin(u / (260 - 50 * i) + i * 1.7) + 0.18 * Math.sin(u / (97 + 23 * i) + i) + 0.07 * CherryLogic.noise1(u / 40 + i * 9));
                    g.lineTo(x, y);
                }
                g.lineTo(W + 10, H);
                g.closePath();
                g.fill();
                // Mist along its foot.
                const mist = g.createLinearGradient(0, y0 - 24 * s, 0, y0 + 46 * s);
                mist.addColorStop(0, rgb(sky.horizon, 0));
                mist.addColorStop(0.5, rgb(sky.horizon, 0.7));
                mist.addColorStop(1, rgb(sky.horizon, 0));
                g.fillStyle = mist;
                g.fillRect(0, y0 - 24 * s, W, 70 * s);
            });
        }
        return c;
    }

    // ---- The tree ----------------------------------------------------------------------------

    // The bark: a dark brown limb with a lit edge on the sun's side and a
    // few lengthwise strokes; clusters of blossom at its joints and tips.
    function tree(T, W, H, dpr, { light = 1, colours, blossomTone = 1, random }) {
        const { c, g } = canvas(W, H, dpr);
        const s = T.s;
        const barkDark = mix([58, 36, 30], [20, 18, 34], 1 - light), barkMid = mix([96, 62, 48], [40, 36, 56], 1 - light), barkLit = mix([150, 108, 80], [70, 70, 95], 1 - light);
        g.lineCap = 'round';
        g.lineJoin = 'round';
        // A limb's outline: the centre line offset by half its width each side.
        const outline = (pts, top, bottom) => {
            const n = pts.length, normal = i => {
                const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
                const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
                return [-dy / len, dx / len];
            };
            g.beginPath();
            for (let i = 0; i < n; i++) { const [nx, ny] = normal(i), p = pts[i], k = top(p.w); g.lineTo(p.x - nx * k, p.y - ny * k); }
            for (let i = n - 1; i >= 0; i--) { const [nx, ny] = normal(i), p = pts[i], k = bottom(p.w); g.lineTo(p.x + nx * k, p.y + ny * k); }
            g.closePath();
        };
        for (const limb of T.limbs) {
            const pts = limb.pts;
            // The body, its shaded underside, and a line of light along the top.
            outline(pts, w => w / 2, w => w / 2);
            g.fillStyle = rgb(barkMid);
            g.fill();
            outline(pts, w => -w * 0.05, w => w / 2);
            g.fillStyle = rgb(barkDark, 0.85);
            g.fill();
            outline(pts, w => w / 2, w => -w * 0.28);
            g.fillStyle = rgb(barkLit, 0.45);
            g.fill();
            // The tip rounded off.
            const tip = pts[pts.length - 1];
            g.fillStyle = rgb(barkMid);
            g.beginPath(); g.arc(tip.x, tip.y, Math.max(0.5, tip.w / 2), 0, Math.PI * 2); g.fill();
            // Lenticels (a cherry's bark has short horizontal ones) on the thick limbs, here and there.
            if (limb.width > 14 * s) {
                for (let i = 1; i < pts.length - 1; i++) {
                    if (random() < 0.75) continue;
                    const p = pts[i], y = p.y + random.range(-0.3, 0.3) * p.w;
                    g.strokeStyle = rgb(mix(barkLit, [255, 230, 200], 0.3), 0.35);
                    g.lineWidth = 1 * s;
                    g.beginPath(); g.moveTo(p.x - p.w * 0.12, y); g.lineTo(p.x + p.w * 0.12, y); g.stroke();
                }
            }
        }
        // Blossom: clusters of flowers, each five rounded petals round yellow
        // stamens, in the palette's tones; buds at the edges.
        const tones = colours.map(hexToRgb);
        const flower = (x, y, r, tone, open) => {
            const col = mix(mix(tone, [255, 255, 255], 0.1), [50, 45, 90], (1 - light) * 0.75), dark = mix(mix(tone, [160, 60, 110], 0.35), [30, 25, 60], (1 - light) * 0.75);
            if (open < 0.35) {
                // A bud: a small teardrop of the deeper tone with a green calyx.
                g.fillStyle = rgb(mix(dark, [80, 120, 70], 0.3 * (1 - light)));
                g.beginPath(); g.ellipse(x, y, r * 0.35, r * 0.5, 0.4, 0, Math.PI * 2); g.fill();
                g.fillStyle = rgb(mix([90, 140, 80], [40, 60, 60], 1 - light));
                g.beginPath(); g.arc(x, y + r * 0.35, r * 0.22, 0, Math.PI * 2); g.fill();
                return;
            }
            for (let k = 0; k < 5; k++) {
                const a = k / 5 * Math.PI * 2 + open;
                const px = x + Math.cos(a) * r * 0.5, py = y + Math.sin(a) * r * 0.5;
                const pg = g.createRadialGradient(px, py, 0, px, py, r * 0.55);
                pg.addColorStop(0, rgb(mix(col, [255, 255, 255], 0.35 * light)));
                pg.addColorStop(1, rgb(mix(col, dark, 0.45)));
                g.fillStyle = pg;
                g.beginPath(); g.ellipse(px, py, r * 0.52, r * 0.42, a, 0, Math.PI * 2); g.fill();
            }
            g.fillStyle = rgb(mix([250, 220, 110], [120, 110, 80], 1 - light));
            for (let k = 0; k < 6; k++) { const a = k * 1.047 + open; g.beginPath(); g.arc(x + Math.cos(a) * r * 0.16, y + Math.sin(a) * r * 0.16, r * 0.07, 0, Math.PI * 2); g.fill(); }
            g.fillStyle = rgb(mix(dark, [200, 60, 90], 0.3));
            g.beginPath(); g.arc(x, y, r * 0.07, 0, Math.PI * 2); g.fill();
        };
        const sorted = T.clusters.slice().sort((a, b) => a.depth - b.depth);
        for (const cl of sorted) {
            // A breath of shadow under the cluster, then its flowers.
            const sh = g.createRadialGradient(cl.x, cl.y + cl.r * 0.25, 0, cl.x, cl.y + cl.r * 0.25, cl.r * 0.8);
            sh.addColorStop(0, rgb(mix([120, 50, 90], [20, 20, 40], 1 - light), 0.07));
            sh.addColorStop(1, rgb(mix([120, 50, 90], [20, 20, 40], 1 - light), 0));
            g.fillStyle = sh;
            g.fillRect(cl.x - cl.r, cl.y - cl.r * 0.6, cl.r * 2, cl.r * 2);
            const n = Math.max(1, cl.n);
            for (let i = 0; i < n; i++) {
                const a = random() * Math.PI * 2, d = Math.sqrt(random()) * cl.r * 0.75;
                const r = (8 + random() * 7) * s * (0.8 + blossomTone * 0.2) * (i === n - 1 ? 1.15 : 1);
                const tone = tones[Math.floor(random() * tones.length)];
                flower(cl.x + Math.cos(a) * d, cl.y + Math.sin(a) * d * 0.7, r, tone, random() < 0.2 ? 0.2 : random() * Math.PI);
            }
        }
        return c;
    }

    // ---- Petals ------------------------------------------------------------------------------

    // A petal of each shape in each colour, lit from above: the notched
    // heart of a cherry petal, a rounder one, and a long one. Each is baked
    // at every one of ANGLES turns and WIDTHS flutter widths (its squeeze
    // along its own axis), so a petal in flight is an axis-aligned blit
    // from the atlas, never a rotated one (which costs ten times as much).
    // Returns atlas[colour][shape] = { c, box } with the slot size (px at
    // dpr 1); `size` is the petal's length. Baked at a modest pixel ratio:
    // a petal is small and soft.
    const ANGLES = 12, WIDTHS = [1, 0.62, 0.3], SHAPES = 3;
    function petals(colours, dpr, size, light) {
        const L = Math.round(size), box = L * 2, bake = Math.min(dpr, 1.5), out = [];
        for (const hex of colours) {
            const tone = hexToRgb(hex), row = [];
            const lit = mix(mix(tone, [255, 255, 255], 0.3), [60, 60, 100], (1 - light) * 0.6);
            const deep = mix(mix(tone, [200, 80, 130], 0.3), [30, 30, 70], (1 - light) * 0.6);
            for (let shape = 0; shape < SHAPES; shape++) {
                const { c, g } = canvas(box * ANGLES, box * WIDTHS.length, bake);
                const w = L * 0.68, h = L * 0.95;
                for (let wi = 0; wi < WIDTHS.length; wi++) {
                    for (let ai = 0; ai < ANGLES; ai++) {
                        g.save();
                        g.translate(ai * box + L, wi * box + L);
                        g.rotate(ai / ANGLES * Math.PI * 2);
                        g.scale(WIDTHS[wi], 1);
                        const grad = g.createLinearGradient(0, -h / 2, 0, h / 2);
                        grad.addColorStop(0, rgb(lit));
                        grad.addColorStop(1, rgb(deep));
                        g.fillStyle = grad;
                        g.beginPath();
                        if (shape === 0) {
                            g.moveTo(0, -h * 0.42);
                            g.bezierCurveTo(-w * 0.15, -h * 0.55, -w * 0.62, -h * 0.4, -w * 0.5, -h * 0.05);
                            g.bezierCurveTo(-w * 0.42, h * 0.25, -w * 0.15, h * 0.45, 0, h * 0.5);
                            g.bezierCurveTo(w * 0.15, h * 0.45, w * 0.42, h * 0.25, w * 0.5, -h * 0.05);
                            g.bezierCurveTo(w * 0.62, -h * 0.4, w * 0.15, -h * 0.55, 0, -h * 0.42);
                        } else if (shape === 1) {
                            g.ellipse(0, 0, w * 0.48, h * 0.46, 0, 0, Math.PI * 2);
                        } else {
                            g.moveTo(0, -h * 0.5);
                            g.bezierCurveTo(-w * 0.45, -h * 0.3, -w * 0.45, h * 0.3, 0, h * 0.5);
                            g.bezierCurveTo(w * 0.45, h * 0.3, w * 0.45, -h * 0.3, 0, -h * 0.5);
                        }
                        g.closePath();
                        g.fill();
                        // A faint vein and a rim of light.
                        g.strokeStyle = rgb(mix(deep, [255, 255, 255], 0.2), 0.35);
                        g.lineWidth = Math.max(0.6, L * 0.04);
                        g.beginPath(); g.moveTo(0, -h * 0.35); g.lineTo(0, h * 0.4); g.stroke();
                        g.strokeStyle = rgb(mix(lit, [255, 255, 255], 0.5), 0.5);
                        g.lineWidth = Math.max(0.5, L * 0.03);
                        g.stroke();
                        g.restore();
                    }
                }
                row.push({ c, box, bake });
            }
            out.push(row);
        }
        out.size = L;
        out.angles = ANGLES;
        out.widths = WIDTHS;
        out.shapes = SHAPES;
        return out;
    }

    // ---- The ground --------------------------------------------------------------------------

    // Below the ground line: grass (a green bank, lighter at the lip), a
    // path (packed earth with stones), or water (a still pond, the sky's
    // colour deepened, with a brighter lip where it meets the bank). 'none'
    // gives nothing. Returns a strip from groundY to H, or null.
    function ground(kind, W, H, dpr, groundY, sky, random) {
        if (kind === 'none' || groundY >= H) return null;
        const h = H - groundY, s = Math.min(W, H) / 800;
        const { c, g } = canvas(W, h, dpr);
        const light = sky.light;
        if (kind === 'grass') {
            const top = mix([120, 176, 92], [25, 40, 55], 1 - light), bottom = mix([70, 120, 60], [15, 25, 40], 1 - light);
            const grad = g.createLinearGradient(0, 0, 0, h);
            grad.addColorStop(0, rgb(top)); grad.addColorStop(1, rgb(bottom));
            g.fillStyle = grad; g.fillRect(0, 0, W, h);
            g.strokeStyle = rgb(mix(top, [255, 255, 220], 0.25 * light), 0.5);
            g.lineWidth = 1.2 * s;
            for (let i = 0; i < W / (3 * s); i++) {
                const x = random() * W, y0 = random() * h * 0.5, len = (4 + random() * 8) * s;
                g.beginPath(); g.moveTo(x, y0 + len); g.lineTo(x + random.range(-2, 2) * s, y0); g.stroke();
            }
        } else if (kind === 'path') {
            const top = mix([196, 172, 140], [50, 45, 60], 1 - light), bottom = mix([160, 136, 104], [35, 30, 45], 1 - light);
            const grad = g.createLinearGradient(0, 0, 0, h);
            grad.addColorStop(0, rgb(top)); grad.addColorStop(1, rgb(bottom));
            g.fillStyle = grad; g.fillRect(0, 0, W, h);
            for (let i = 0; i < W / (6 * s); i++) {
                const x = random() * W, y = random() * h, r = (1 + random() * 3) * s;
                g.fillStyle = rgb(mix(random() < 0.5 ? top : bottom, [255, 255, 255], random() * 0.25), 0.7);
                g.beginPath(); g.ellipse(x, y, r * 1.4, r, random() * 3, 0, Math.PI * 2); g.fill();
            }
            // A grassy verge at the lip.
            g.fillStyle = rgb(mix([110, 160, 85], [25, 40, 55], 1 - light));
            g.fillRect(0, 0, W, 4 * s);
        } else if (kind === 'water') {
            const deep = mix(mix(sky.top, [20, 40, 70], 0.5), [5, 8, 25], 1 - light), near = mix(sky.horizon, [40, 60, 100], 0.55);
            const grad = g.createLinearGradient(0, 0, 0, h);
            grad.addColorStop(0, rgb(near)); grad.addColorStop(0.5, rgb(mix(near, deep, 0.6))); grad.addColorStop(1, rgb(deep));
            g.fillStyle = grad; g.fillRect(0, 0, W, h);
            // Still-water streaks of sky light.
            for (let i = 0; i < 40; i++) {
                const y = random() * h, x = random() * W, len = (30 + random() * 120) * s;
                g.strokeStyle = rgb(mix(sky.horizon, [255, 255, 255], 0.3), 0.08 + random() * 0.12);
                g.lineWidth = (0.8 + random() * 1.5) * s;
                g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y); g.stroke();
            }
            g.fillStyle = rgb(mix(sky.horizon, [255, 255, 255], 0.4), 0.5);
            g.fillRect(0, 0, W, 1.5 * s);
        }
        return c;
    }

    return { canvas, sky, tree, petals, ground };
})();
