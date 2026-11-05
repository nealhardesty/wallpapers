// The Orrery's three looks. Each draws the same scene (OrreryAnimationManager
// computes it and projects it) in its own style:
//
//   space  deep space: stars, a corona, shaded planets with their night
//          sides, Saturn's rings, comet-like trails and the belt;
//   brass  an antique mechanical orrery: a brass Sun on its pillar, ivory
//          balls on brass arms, gear wheels turning with the arms, an
//          engraved zodiac ring and a walnut plinth;
//   chart  an ink star chart on parchment or night paper: orbits, glyphs,
//          the constellations round the edge and the lines of sight from
//          the Earth, retrograde planets marked R.
//
// background(app, g) paints a cached layer in device px; plane(app, g,
// scene) the orbits and the ring (cached while the camera is still); the
// rest draw every frame in CSS px.

const OrreryLooks = (() => {
    'use strict';

    const A = OrreryArt, TAU = A.TAU, DEG = Math.PI / 180;
    const TEXT = '︎';   // text presentation, not emoji
    const SIGN_SYMBOLS = Object.fromEntries(OrreryMath.zodiac.signs.map(s => [s.name, s.symbol + TEXT]));

    // ---- Shared geometry -----------------------------------------------------------

    const tmp = {};
    function pathOf(app, g, points, close = true) {
        g.beginPath();
        points.forEach((p, i) => {
            app.project(p.x, p.y, p.z, tmp);
            if (i) g.lineTo(tmp.x, tmp.y); else g.moveTo(tmp.x, tmp.y);
        });
        if (close) g.closePath();
    }

    // The belt's rocks are brighter at the inner scale, where they're spread
    // over the screen instead of packed in a band.
    const beltAlpha = app => app.fx.belt * (app.config.scale === 'inner' ? 1.5 : 1);

    // A circle of radius r (plane units) round the Sun, in the plane.
    function circle(app, g, r, n = 96, start = true) {
        if (start) g.beginPath();
        for (let i = 0; i <= n; i++) {
            const a = i / n * TAU;
            app.project(Math.cos(a) * r, Math.sin(a) * r, 0, tmp);
            if (i) g.lineTo(tmp.x, tmp.y); else g.moveTo(tmp.x, tmp.y);
        }
        g.closePath();
    }

    // Draw in a frame lying on the plane at (x, y): local x along (ux, uy),
    // local y along (vx, vy) (plane directions), s plane units per local px.
    function onPlane(app, g, x, y, ux, uy, vx, vy, s, affine = app.planeAffine(x, y, 0)) {
        const [a, b, c, d, e, f] = affine, k = app.dpr;
        g.setTransform(k * (a * ux + c * uy) * s, k * (b * ux + d * uy) * s, k * (a * vx + c * vy) * s, k * (b * vx + d * vy) * s, k * e, k * f);
    }

    // Text set along the ring at longitude lon (degrees), lying on the
    // plane, turned so it reads upright on screen.
    function ringText(app, g, text, lon, r, s) {
        const a = lon * DEG, ca = Math.cos(a), sa = Math.sin(a);
        const affine = app.planeAffine(ca * r, sa * r, 0);
        // The text's down, inwards: does it point down the screen?
        const flip = affine[1] * -ca + affine[3] * -sa < 0;
        if (flip) onPlane(app, g, ca * r, sa * r, -sa, ca, ca, sa, s, affine);
        else onPlane(app, g, ca * r, sa * r, sa, -ca, -ca, -sa, s, affine);
        g.fillText(text, 0, 0);
    }

    // The first of the candidates that fits a segment's arc (it shrinks on a
    // phone), or nothing.
    function fitted(app, g, candidates, span, r) {
        const room = span * DEG * r * app.R * 0.9;
        return candidates.find(text => g.measureText(text).width <= room) || '';
    }

    // The ring's segments in the J2000 frame: the IAU constellations, or the
    // tropical signs, whose start drifts back 1.397° a century.
    function zodiac(app, T) {
        if (app.config.zodiac === 'signs') {
            return OrreryMath.zodiac.signs.map(s => ({ name: s.name, symbol: s.symbol + TEXT, start: s.start - 1.396971 * T, end: s.end - 1.396971 * T }));
        }
        return OrreryMath.zodiac.constellations.map(c => ({ name: c.name, symbol: SIGN_SYMBOLS[c.name] || '', start: c.start, end: c.end < c.start ? c.end + 360 : c.end }));
    }

    // The bodies drawn in depth order, farthest first.
    function sorted(scene) {
        const items = [{ id: 'sun', scr: scene.sun, r: scene.sun.px }, ...scene.bodies, ...scene.extras];
        return items.sort((a, b) => b.scr.d - a.scr.d);
    }

    // A planet's rings, back half (behind the ball) or front half: the
    // ring's real orientation in space, projected.
    function rings(app, g, body, front, draw) {
        const n = app.poles[body.id];
        if (!n) return;
        let u = { x: -n.y, y: n.x, z: 0 };
        const ul = Math.hypot(u.x, u.y) || 1;
        u = { x: u.x / ul, y: u.y / ul, z: 0 };
        const v = { x: n.y * u.z - n.z * u.y, y: n.z * u.x - n.x * u.z, z: n.x * u.y - n.y * u.x };
        const c = body.plane, scale = body.px / app.R;
        const depth = p => app.project(c.x + p.x * 0.01, c.y + p.y * 0.01, c.z + p.z * 0.01, tmp).d - body.scr.d;
        const phi = Math.atan2(depth(v), depth(u));
        // Behind: depth > 0, round phi ± 90°.
        const from = front ? phi + Math.PI / 2 : phi - Math.PI / 2;
        const edge = (radius, a0, a1, steps) => {
            const out = [];
            for (let i = 0; i <= steps; i++) {
                const a = a0 + (a1 - a0) * i / steps, ca = Math.cos(a), sa = Math.sin(a);
                out.push(app.project(c.x + (u.x * ca + v.x * sa) * radius * scale, c.y + (u.y * ca + v.y * sa) * radius * scale, c.z + (u.z * ca + v.z * sa) * radius * scale, {}));
            }
            return out;
        };
        draw(edge, from, from + Math.PI);
    }

    function saturnRings(app, g, body, front, fill, line, cassini) {
        rings(app, g, body, front, (edge, a0, a1) => {
            const outer = edge(body.id === 'saturn' ? 2.27 : 2.0, a0, a1, 24), inner = edge(body.id === 'saturn' ? 1.24 : 1.75, a1, a0, 24);
            g.beginPath();
            outer.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y));
            inner.forEach(p => g.lineTo(p.x, p.y));
            g.closePath();
            if (fill) { g.fillStyle = fill; g.fill(); }
            if (line) { g.strokeStyle = line; g.lineWidth = Math.max(0.6, app.k * 0.7); g.stroke(); }
            if (cassini && body.id === 'saturn') {
                const gap = edge(1.98, a0, a1, 24);
                g.beginPath();
                gap.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y));
                g.strokeStyle = cassini;
                g.lineWidth = Math.max(0.5, body.r * 0.08);
                g.stroke();
            }
        });
    }

    // The belt's place when its rocks aren't drawn (Low): a faint band.
    function beltBand(app, g, fill) {
        if (!app.config.showBelt || app.fx.belt > 0) return;
        g.beginPath();
        circle(app, g, app.radial(2.15), 96, false);
        circle(app, g, app.radial(3.3), 96, false);
        g.fillStyle = fill;
        g.fill('evenodd');
    }

    function orbits(app, g, scene, style) {
        if (!app.config.showOrbits) return;
        for (const id of app.ids()) {
            const pts = app.orbits.paths[id];
            if (!pts) continue;
            const chosen = app.selected === id;
            style(id, chosen);
            g.setLineDash(id === 'pluto' ? [4 * app.k, 4 * app.k] : []);
            pathOf(app, g, pts);
            g.stroke();
        }
        g.setLineDash([]);
    }

    // The planet's recent path, fading back: strokes of falling alpha and
    // width, butted end to end.
    function trails(app, g, scene, colour, width = 1) {
        const k = app.k;
        for (const b of scene.bodies) {
            if (!b.trail) continue;
            const pts = b.trail.map(p => app.project(p.x, p.y, p.z, {}));
            const chunks = 12, per = (pts.length - 1) / chunks;
            for (let c = 0; c < chunks; c++) {
                const t = c / chunks, from = Math.round(c * per), to = Math.round((c + 1) * per);
                g.beginPath();
                g.moveTo(pts[from].x, pts[from].y);
                for (let i = from + 1; i <= to; i++) g.lineTo(pts[i].x, pts[i].y);
                g.strokeStyle = colour(b, (1 - t) ** 1.5);
                g.lineWidth = Math.max(0.5 * k, Math.min(b.r * width, 3.4 * k) * (1 - t * 0.8));
                g.stroke();
            }
        }
    }

    // Names beside the planets, placed where they don't cover another name
    // or ball, with a little air round each: right, left, above or below,
    // then the same twice as far out, else left out (a phone's crowded
    // middle drops a name rather than overprint it).
    function labels(app, g, scene, theme, extra) {
        if (!app.config.showLabels) return;
        const k = app.k, size = 10.5 * k, sun = scene.sun;
        g.font = `${theme.labelWeight || 500} ${size}px ${theme.font}`;
        g.textAlign = 'left';
        g.textBaseline = 'middle';
        g.lineJoin = 'round';
        const balls = [{ x0: sun.x - sun.px, x1: sun.x + sun.px, y0: sun.y - sun.px, y1: sun.y + sun.px },
            ...scene.bodies.map(b => ({ id: b.id, x0: b.scr.x - b.r - 1, x1: b.scr.x + b.r + 1, y0: b.scr.y - b.r - 1, y1: b.scr.y + b.r + 1 }))];
        const placed = [];
        const hits = (box, list, id) => list.some(o => o.id !== id && box.x0 < o.x1 && box.x1 > o.x0 && box.y0 < o.y1 && box.y1 > o.y0);
        // Nearest the Sun first: the crowded middle gets first pick.
        for (const b of [...scene.bodies].sort((p, q) => p.dist - q.dist)) {
            if (Math.hypot(b.scr.x - sun.x, b.scr.y - sun.y) < sun.px * 1.5) continue;   // in the Sun's glare at true scale
            const text = extra ? extra(b) : b.name, w = g.measureText(text).width, h = size * 1.3, pad = 1.5 * k;
            const spots = [];
            for (const gap of [b.r + 4 * k, 2 * (b.r + 4 * k)]) {
                spots.push([gap, b.r * 0.4 + 3 * k], [gap, -b.r * 0.4 - 3 * k], [-gap - w, b.r * 0.4 + 3 * k], [-gap - w, -b.r * 0.4 - 3 * k], [-w / 2, gap + h / 2], [-w / 2, -gap - h / 2]);
            }
            for (const [dx, dy] of spots) {
                const x = b.scr.x + dx, y = b.scr.y + dy, box = { x0: x - pad, x1: x + w + pad, y0: y - h / 2 - pad, y1: y + h / 2 + pad };
                if (box.x0 < app.safe.left + 2 || box.x1 > app.safe.right - 2 || box.y0 < app.safe.top || box.y1 > app.safe.bottom) continue;
                if (hits(box, placed) || hits(box, balls, b.id)) continue;
                placed.push(box);
                if (theme.halo) { g.strokeStyle = theme.halo; g.lineWidth = 3 * k; g.strokeText(text, x, y); }
                g.fillStyle = theme.label || theme.dim;
                g.fillText(text, x, y);
                break;
            }
        }
    }

    // Lines of sight: from the Earth through each planet (or just the chosen
    // one) on to where it sits among the stars, on the ring.
    function sightLines(app, g, scene, colour, all) {
        if (!app.config.skyLines) return [];
        const earth = scene.bodies.find(b => b.id === 'earth');
        if (!earth) return [];
        const k = app.k, ends = [];
        const r = app.config.showZodiac ? app.ringIn : app.ringOut;
        const targets = scene.bodies.filter(b => b.geo && (all || b.id === app.selected));
        if (all || app.selected === 'sun') targets.push({ id: 'sun', geo: { lon: scene.sunLon }, scr: scene.sun });
        for (const b of targets) {
            const a = b.geo.lon * DEG, end = app.project(Math.cos(a) * r, Math.sin(a) * r, 0, {});
            g.strokeStyle = colour(b, 0.55);
            g.lineWidth = 0.9 * k;
            g.setLineDash([]);
            g.beginPath();
            g.moveTo(earth.scr.x, earth.scr.y);
            g.lineTo(b.scr.x, b.scr.y);
            g.stroke();
            g.setLineDash([2 * k, 3 * k]);
            g.strokeStyle = colour(b, 0.35);
            g.beginPath();
            g.moveTo(b.scr.x, b.scr.y);
            g.lineTo(end.x, end.y);
            g.stroke();
            ends.push({ b, end, lon: b.geo.lon });
        }
        g.setLineDash([]);
        return ends;
    }

    // ---- Deep space ----------------------------------------------------------------

    const space = {
        theme: () => ({
            font: A.SANS, ink: '#eef2ff', dim: 'rgba(205,215,240,0.74)', label: 'rgba(214,222,244,0.78)', halo: 'rgba(2,4,10,0.55)',
            card: 'rgba(9,13,26,0.84)', cardEdge: 'rgba(160,182,232,0.35)', cardInk: '#ffffff', cardDim: 'rgba(214,224,246,0.86)',
            accent: '#e8c17a', radius: 8, moonLit: '#f1ede2', moonDark: '#262b38',
        }),

        background(app, g) {
            const { width: W, height: H } = g.canvas;
            const count = Math.round(W * H / app.dpr ** 2 / 900 * app.density);
            g.drawImage(A.starfield(W, H, count, app.dpr), 0, 0);
        },

        plane(app, g, scene) {
            const k = app.k;
            beltBand(app, g, 'rgba(190,172,140,0.06)');
            orbits(app, g, scene, (id, chosen) => {
                g.strokeStyle = A.css(A.mix(A.rgb(OrreryMath.PLANETS[id].colour), [200, 210, 240], 0.4), chosen ? 0.75 : 0.26);
                g.lineWidth = (chosen ? 1.5 : 1) * k * 0.9;
            });
            if (!app.config.showZodiac) return;
            g.strokeStyle = 'rgba(190,205,240,0.16)';
            g.lineWidth = 0.8 * k;
            circle(app, g, app.ringIn); g.stroke();
            circle(app, g, app.ringOut); g.stroke();
            const band = (app.ringOut - app.ringIn), mid = app.ringIn + band * 0.5;
            const size = Math.max(8, band * app.R * 0.34);
            for (const z of zodiac(app, scene.T)) {
                const a = z.start * DEG, p0 = app.project(Math.cos(a) * app.ringIn, Math.sin(a) * app.ringIn, 0, {}), p1 = app.project(Math.cos(a) * app.ringOut, Math.sin(a) * app.ringOut, 0, {});
                g.beginPath(); g.moveTo(p0.x, p0.y); g.lineTo(p1.x, p1.y); g.stroke();
                g.font = `500 ${size}px ${A.SANS}`;
                g.textAlign = 'center';
                g.textBaseline = 'middle';
                g.fillStyle = 'rgba(200,214,245,0.42)';
                const spaced = t => t.toUpperCase().split('').join('\u200A');
                ringText(app, g, fitted(app, g, [spaced(z.name), spaced(z.name.slice(0, 3))], z.end - z.start, mid), (z.start + z.end) / 2, mid, 1 / app.R);
                g.setTransform(app.dpr, 0, 0, app.dpr, 0, 0);
            }
        },

        belt(app, g, xyz, count, t) {
            const p = {}, k = app.k, twinkle = app.host.reducedMotion ? 0 : 1, B = app.belt;
            const s = Math.max(0.7, 0.95 * k);
            for (let bucket = 0; bucket < 3; bucket++) {
                g.beginPath();
                for (let i = bucket; i < count; i += 3) {
                    if (Number.isNaN(xyz[i * 3])) continue;
                    app.project(xyz[i * 3], xyz[i * 3 + 1], xyz[i * 3 + 2], p);
                    const size = s * (0.6 + B.b[i] * 0.7) * p.k;
                    g.rect(p.x - size / 2, p.y - size / 2, size, size);
                }
                g.fillStyle = `rgba(206,186,150,${(0.3 + 0.13 * bucket + 0.12 * twinkle * Math.sin(t * 0.9 + bucket * 2.1)) * beltAlpha(app)})`;
                g.fill();
            }
        },

        trails(app, g, scene) {
            trails(app, g, scene, (b, a) => A.css(A.mix(A.rgb(b.colour), [255, 255, 255], 0.25), 0.55 * a), 0.9);
        },

        bodies(app, g, scene, t) {
            const d = app.dpr, k = app.k;
            for (const item of sorted(scene)) {
                g.setTransform(d, 0, 0, d, 0, 0);
                if (item.id === 'sun') { space.sun(app, g, scene.sun, t); continue; }
                const { x, y } = item.scr, r = item.r;
                if (item.small) {
                    g.fillStyle = 'rgba(240,232,214,0.9)';
                    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
                    continue;
                }
                if (app.fx.glow > 0 && item.id !== 'moon') {
                    const halo = app.sprite(`halo|${item.id}`, () => A.glow(64, [[0, A.css(A.rgb(item.colour), 0.5)], [0.4, A.css(A.rgb(item.colour), 0.12)], [1, A.css(A.rgb(item.colour), 0)]]));
                    g.globalCompositeOperation = 'lighter';
                    g.globalAlpha = 0.5 * app.fx.glow;
                    g.drawImage(halo, x - r * 3.2, y - r * 3.2, r * 6.4, r * 6.4);
                    g.globalAlpha = 1;
                    g.globalCompositeOperation = 'source-over';
                }
                if (item.id === 'saturn' || item.id === 'uranus') space.rings(app, g, item, false);
                const px = Math.max(2, Math.round(r * d * 2) / 2);
                const bucket = Math.round(Math.log(px) / Math.log(1.08));
                const sprite = app.sprite(`sphere|${item.id}|${bucket}`, () => A.sphere(item.id, item.colour, Math.pow(1.08, bucket), 'space'));
                const size = sprite.width / d * (r * d / Math.pow(1.08, bucket));
                g.translate(x, y);
                g.rotate(item.light);
                g.drawImage(sprite, -size / 2, -size / 2, size, size);
                g.setTransform(d, 0, 0, d, 0, 0);
                if (item.id === 'saturn' || item.id === 'uranus') space.rings(app, g, item, true);
                if (item.id === 'moon' && item.parent) {
                    g.strokeStyle = 'rgba(200,210,235,0.12)';
                    g.lineWidth = 0.7 * k;
                    g.beginPath();
                    g.arc(item.parent.scr.x, item.parent.scr.y, item.orbit * app.R * item.parent.scr.k, 0, TAU);
                    g.stroke();
                }
            }
            g.setTransform(d, 0, 0, d, 0, 0);
        },

        rings(app, g, body, front) {
            const saturn = body.id === 'saturn';
            saturnRings(app, g, body, front, saturn ? 'rgba(222,204,160,0.62)' : null, saturn ? 'rgba(255,240,205,0.25)' : 'rgba(190,230,240,0.45)', saturn ? 'rgba(10,10,16,0.55)' : null);
        },

        sun(app, g, sun, t) {
            const r = sun.px, d = app.dpr;
            const glow = app.fx.glow;
            const still = app.host.reducedMotion;
            g.globalCompositeOperation = 'lighter';
            const core = app.sprite('corona', () => A.corona(256));
            const big = r * (6 + 4 * glow) * 2;
            g.globalAlpha = 0.65 + 0.35 * glow;
            g.drawImage(core, sun.x - big / 2, sun.y - big / 2, big, big);
            if (glow > 0) {
                const breathe = still ? 0 : Math.sin(t * 0.7) * 0.12;
                for (const [seed, speed] of [[3, 0.012], [8, -0.008]]) {
                    const rays = app.sprite(`rays|${seed}`, () => A.rays(256, seed));
                    const size = r * 14;
                    g.globalAlpha = glow * (0.5 + breathe);
                    g.translate(sun.x, sun.y);
                    g.rotate(still ? seed : t * speed + seed);
                    g.drawImage(rays, -size / 2, -size / 2, size, size);
                    g.setTransform(d, 0, 0, d, 0, 0);
                }
            }
            g.globalAlpha = 1;
            g.globalCompositeOperation = 'source-over';
            const disc = app.sprite(`sun|${Math.round(r * d)}`, () => A.sunDisc(Math.round(r * d)));
            g.drawImage(disc, sun.x - disc.width / d / 2, sun.y - disc.height / d / 2, disc.width / d, disc.height / d);
        },

        overlay(app, g, scene) {
            const theme = space.theme(app);
            sightLines(app, g, scene, (b, a) => `rgba(232,193,122,${a})`, false);
            labels(app, g, scene, theme, b => b.retro ? `${b.name} ℞` : b.name);
        },
    };

    // ---- Brass ----------------------------------------------------------------------

    const brassGradient = (g, x0, y0, x1, y1) => {
        const gr = g.createLinearGradient(x0, y0, x1, y1);
        gr.addColorStop(0, '#fff0b5');
        gr.addColorStop(0.25, '#e2b65e');
        gr.addColorStop(0.55, '#a8742a');
        gr.addColorStop(0.8, '#d8a94e');
        gr.addColorStop(1, '#6e4714');
        return gr;
    };

    // Wheels at the hub, one per inner planet (each turning with its arm),
    // and three pinions round them in the train.
    const WHEELS = [['mars', 0.14, 84, 'bronze'], ['earth', 0.118, 70, 'brass'], ['venus', 0.096, 56, 'steel'], ['mercury', 0.074, 42, 'brass']];
    const PINIONS = [[205, 18], [325, 24], [85, 15]];

    const brass = {
        theme: () => ({
            font: A.SERIF, ink: '#f6dfa4', dim: 'rgba(238,216,164,0.78)', label: '#efd497', halo: 'rgba(12,7,2,0.75)', labelWeight: 600,
            card: 'rgba(30,19,9,0.92)', cardEdge: '#b98a3c', cardInk: '#ffe6a6', cardDim: '#ead6a4',
            accent: '#ffd36e', radius: 3, moonLit: '#f6ecd2', moonDark: '#3a2814',
        }),

        background(app, g) {
            const { width: W, height: H } = g.canvas, d = app.dpr;
            g.drawImage(A.study(W, H), 0, 0);
            const h = Math.round(app.base * d * 1.1), top = Math.round(app.safe.bottom * d - h);
            // The machine's shadow on the plinth, then the plinth.
            g.drawImage(A.walnut(W, h, d), 0, top);
            g.fillStyle = 'rgba(0,0,0,0.6)';
            g.fillRect(0, top + h, W, H - top - h);
        },

        plane(app, g, scene) {
            const k = app.k, d = app.dpr;
            beltBand(app, g, 'rgba(214,170,90,0.07)');
            orbits(app, g, scene, (id, chosen) => {
                g.strokeStyle = chosen ? 'rgba(255,214,120,0.7)' : 'rgba(200,150,70,0.22)';
                g.lineWidth = (chosen ? 1.4 : 0.8) * k;
            });
            if (!app.config.showZodiac) return;
            // The engraved brass ring.
            const bb = app.ringBox();
            g.beginPath();
            circle(app, g, app.ringOut, 128, false);
            circle(app, g, app.ringIn, 128, false);
            g.fillStyle = brassGradient(g, bb.x0, bb.y0, bb.x1, bb.y1);
            g.fill('evenodd');
            g.strokeStyle = 'rgba(50,30,8,0.85)';
            g.lineWidth = 1.2 * k;
            circle(app, g, app.ringOut, 128); g.stroke();
            circle(app, g, app.ringIn, 128); g.stroke();
            const band = app.ringOut - app.ringIn, inner2 = app.ringIn + band * 0.22;
            g.lineWidth = 0.7 * k;
            circle(app, g, inner2, 128); g.stroke();
            // Degree ticks every 5°, longer at 10°.
            const p0 = {}, p1 = {};
            g.beginPath();
            for (let deg = 0; deg < 360; deg += 5) {
                const a = deg * DEG, len = deg % 10 ? 0.45 : 1;
                app.project(Math.cos(a) * app.ringIn, Math.sin(a) * app.ringIn, 0, p0);
                app.project(Math.cos(a) * (app.ringIn + (inner2 - app.ringIn) * len), Math.sin(a) * (app.ringIn + (inner2 - app.ringIn) * len), 0, p1);
                g.moveTo(p0.x, p0.y); g.lineTo(p1.x, p1.y);
            }
            g.strokeStyle = 'rgba(50,30,8,0.75)';
            g.stroke();
            const size = Math.max(8, band * app.R * 0.42), mid = inner2 + (app.ringOut - inner2) * 0.5;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            for (const z of zodiac(app, scene.T)) {
                const a = z.start * DEG;
                app.project(Math.cos(a) * app.ringIn, Math.sin(a) * app.ringIn, 0, p0);
                app.project(Math.cos(a) * app.ringOut, Math.sin(a) * app.ringOut, 0, p1);
                g.strokeStyle = 'rgba(50,30,8,0.85)';
                g.lineWidth = 1 * k;
                g.beginPath(); g.moveTo(p0.x, p0.y); g.lineTo(p1.x, p1.y); g.stroke();
                const span = z.end - z.start, at = z.start + span / 2;
                const word = z.symbol ? `${z.symbol}  ${z.name.toUpperCase()}` : z.name.toUpperCase();
                g.font = `600 ${size * (span < 15 ? 0.62 : 0.72)}px ${A.SERIF}, ${A.SYMBOLS}`;
                const text = fitted(app, g, [word, z.name.toUpperCase(), z.name.slice(0, 3).toUpperCase(), z.symbol], span, mid);
                // Engraved: a light lower edge under dark ink.
                g.fillStyle = 'rgba(255,240,190,0.45)';
                ringText(app, g, text, at, mid - 0.0012, 1 / app.R);
                g.fillStyle = 'rgba(52,30,8,0.92)';
                ringText(app, g, text, at, mid, 1 / app.R);
                g.setTransform(d, 0, 0, d, 0, 0);
            }
        },

        belt(app, g, xyz, count) {
            const p = {}, s = Math.max(0.8, 1.05 * app.k);
            g.beginPath();
            for (let i = 0; i < count; i++) {
                if (Number.isNaN(xyz[i * 3])) continue;
                app.project(xyz[i * 3], xyz[i * 3 + 1], xyz[i * 3 + 2], p);
                g.rect(p.x - s / 2, p.y - s / 2, s * p.k, s * p.k);
            }
            g.fillStyle = `rgba(226,186,104,${Math.min(1, 0.55 * beltAlpha(app))})`;
            g.fill();
        },

        trails(app, g, scene) {
            trails(app, g, scene, (b, a) => `rgba(236,196,112,${0.32 * a})`, 0.55);
        },

        // The machine: the pillar, the wheels, the arms, then the balls.
        bodies(app, g, scene) {
            const d = app.dpr, k = app.k, sun = scene.sun;
            g.setTransform(d, 0, 0, d, 0, 0);
            if (app.tilted) {
                const foot = app.project(0, 0, -0.32, {}), w = sun.px * 0.42;
                g.fillStyle = brassGradient(g, sun.x - w, 0, sun.x + w, 0);
                g.beginPath();
                g.moveTo(sun.x - w * 0.6, sun.y);
                g.lineTo(sun.x + w * 0.6, sun.y);
                g.lineTo(foot.x + w, foot.y);
                g.lineTo(foot.x - w, foot.y);
                g.closePath();
                g.fill();
                g.fillStyle = brassGradient(g, foot.x - w * 2.4, 0, foot.x + w * 2.4, 0);
                g.beginPath();
                g.ellipse(foot.x, foot.y, w * 2.4, w * 2.4 * Math.sin(app.camera.el * DEG), 0, 0, TAU);
                g.fill();
            }
            brass.wheels(app, g, scene);
            g.setTransform(d, 0, 0, d, 0, 0);
            // Arms, from the hub out to each ball, lowest first.
            const order = scene.bodies.map((b, i) => [b, i]);
            for (const [b, i] of order) {
                const z = -0.018 - i * 0.01;
                const hub = app.project(0, 0, z, {}), foot = app.project(b.plane.x, b.plane.y, z, {});
                for (const [width, colour] of [[3.4, 'rgba(40,24,6,0.85)'], [2.1, '#d7a84f'], [0.7, 'rgba(255,238,180,0.8)']]) {
                    g.strokeStyle = colour;
                    g.lineWidth = width * k * Math.min(1.2, foot.k);
                    g.beginPath();
                    g.moveTo(hub.x, hub.y);
                    g.lineTo(foot.x, foot.y);
                    if (app.tilted) g.lineTo(b.scr.x, b.scr.y);
                    g.stroke();
                }
                // A counterweight across the hub.
                const back = app.project(-b.plane.x / Math.hypot(b.plane.x, b.plane.y) * 0.035, -b.plane.y / Math.hypot(b.plane.x, b.plane.y) * 0.035, z, {});
                g.fillStyle = '#b8862f';
                g.beginPath(); g.arc(back.x, back.y, 2.2 * k * back.k, 0, TAU); g.fill();
            }
            for (const item of sorted(scene)) {
                g.setTransform(d, 0, 0, d, 0, 0);
                const { x, y } = item.scr, r = item.r;
                if (item.id === 'sun') {
                    const ball = app.sprite(`brass-sun|${Math.round(r * d)}`, () => A.sphere('sun', '#e8c17a', Math.round(r * d), 'brass'));
                    g.drawImage(ball, x - ball.width / d / 2, y - ball.height / d / 2, ball.width / d, ball.height / d);
                    continue;
                }
                if (item.parent && item.id === 'moon') {
                    // The Moon on its little arm.
                    g.strokeStyle = '#c79a46';
                    g.lineWidth = 0.8 * k;
                    g.beginPath(); g.moveTo(item.parent.scr.x, item.parent.scr.y); g.lineTo(x, y); g.stroke();
                }
                if (item.id === 'saturn' || item.id === 'uranus') saturnRings(app, g, item, false, null, '#d9aa52', null);
                const px = Math.max(2, Math.round(r * d * 2) / 2);
                const bucket = Math.round(Math.log(px) / Math.log(1.08));
                const ball = app.sprite(`ivory|${item.id}|${bucket}`, () => A.sphere(item.id, item.colour || '#e8dcc4', Math.pow(1.08, bucket), 'ivory'));
                const size = ball.width / d * (r * d / Math.pow(1.08, bucket));
                g.drawImage(ball, x - size / 2, y - size / 2, size, size);
                if (item.id === 'saturn' || item.id === 'uranus') {
                    saturnRings(app, g, item, true, null, 'rgba(40,24,6,0.8)', null);
                    saturnRings(app, g, item, true, null, '#e9bd62', null);
                }
            }
            g.setTransform(d, 0, 0, d, 0, 0);
        },

        wheels(app, g, scene) {
            const d = app.dpr, lon = id => {
                const b = scene.bodies.find(x => x.id === id);
                return b ? b.lon * DEG : 0;
            };
            const draw = (x, y, rU, teeth, angle, tone) => {
                const dev = Math.max(6, rU * app.R * d);
                const bucket = Math.round(Math.log(dev) / Math.log(1.1));
                const px = Math.pow(1.1, bucket);
                const sprite = app.sprite(`gear|${teeth}|${bucket}|${tone}`, () => A.gear(teeth, px, 5, tone));
                const ca = Math.cos(angle), sa = Math.sin(angle);
                onPlane(app, g, x, y, ca, sa, sa, -ca, rU / px);
                g.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
            };
            // The pinions mesh with the largest wheel, turning the other way.
            const [, big, bigTeeth] = WHEELS[0];
            for (const [at, teeth] of PINIONS) {
                const rU = big * teeth / bigTeeth, a = at * DEG, dist = big + rU - big * 0.1;
                draw(Math.cos(a) * dist, Math.sin(a) * dist, rU, teeth, -lon('mars') * bigTeeth / teeth + at, 'brass');
            }
            for (const [id, rU, teeth, tone] of WHEELS) draw(0, 0, rU, teeth, lon(id), tone);
            g.setTransform(d, 0, 0, d, 0, 0);
        },

        overlay(app, g, scene) {
            const theme = brass.theme(app);
            sightLines(app, g, scene, (b, a) => `rgba(255,214,120,${a})`, false);
            labels(app, g, scene, theme, b => b.retro ? `${b.name} ℞` : b.name);
        },
    };

    // ---- The ink chart ------------------------------------------------------------------

    const inks = {
        parchment: { ink: '#2a1d10', faint: 'rgba(42,29,16,', red: '#9c2f1f', paper: '#f3e8cd' },
        night: { ink: '#dfe7f3', faint: 'rgba(214,226,242,', red: '#ffcf6e', paper: '#0f1b2d' },
    };
    const inkOf = app => inks[app.config.chartPalette] || inks.parchment;

    const chart = {
        theme: app => {
            const night = app.config.chartPalette === 'night';
            return night ? {
                font: A.SERIF, ink: '#e6edf8', dim: 'rgba(206,220,240,0.8)', label: 'rgba(214,226,242,0.85)', halo: 'rgba(12,22,38,0.8)',
                card: 'rgba(14,24,42,0.95)', cardEdge: '#8fa6c8', cardInk: '#eef3fb', cardDim: '#c8d6ea', accent: '#ffcf6e', radius: 2,
                moonLit: '#eef3fb', moonDark: '#24344e',
            } : {
                font: A.SERIF, ink: '#22170c', dim: 'rgba(52,36,20,0.82)', label: 'rgba(42,29,16,0.85)', halo: 'rgba(246,236,214,0.75)',
                card: 'rgba(248,240,220,0.96)', cardEdge: '#5a4026', cardInk: '#22170c', cardDim: '#4a3520', accent: '#9c2f1f', radius: 2,
                moonLit: '#fbf6e8', moonDark: '#5a4630',
            };
        },

        background(app, g) {
            const { width: W, height: H } = g.canvas, d = app.dpr, ink = inkOf(app), k = app.k;
            g.drawImage(A.paper(W, H, d, app.config.chartPalette), 0, 0);
            // A ruled double border.
            const s = app.safe, m = 7 * k * d;
            g.strokeStyle = `${ink.faint}0.55)`;
            g.lineWidth = 1.4 * d;
            g.strokeRect(s.left * d + m, s.top * d + m, (s.right - s.left) * d - 2 * m, (s.bottom - s.top) * d - 2 * m);
            g.lineWidth = 0.6 * d;
            g.strokeRect(s.left * d + m + 4 * d, s.top * d + m + 4 * d, (s.right - s.left) * d - 2 * m - 8 * d, (s.bottom - s.top) * d - 2 * m - 8 * d);
        },

        // The legend, where there's room beside or below the ring: drawn
        // each frame with the overlay (a few words), so it follows the ring
        // as the camera moves, and says "from above" only from above.
        legend(app, g) {
            const ink = inkOf(app), k = app.k, s = app.safe;
            const ringR = app.R * app.ringOut;
            const side = s.right - (app.cx + ringR), below = s.bottom - (app.cy + ringR);
            const ids = app.ids();
            const size = 11.5 * k;
            g.textBaseline = 'middle';
            if (side > 150 * k || below > 90 * k) {
                const rows = side > 150 * k ? ids.map(id => [id]) : [ids.slice(0, Math.ceil(ids.length / 2)), ids.slice(Math.ceil(ids.length / 2))];
                const colW = 92 * k, lineH = size * 1.6;
                const x0 = side > 150 * k ? s.right - 24 * k - colW : (s.left + s.right) / 2 - rows[0].length * colW / 2;
                const y0 = s.bottom - 24 * k - rows.length * lineH;
                g.fillStyle = `${ink.faint}0.85)`;
                g.textAlign = 'left';
                rows.forEach((row, ri) => row.forEach((id, ci) => {
                    const x = x0 + ci * colW, y = y0 + ri * lineH;
                    g.font = `${size * 1.15}px ${A.SYMBOLS}`;
                    g.fillText(ORRERY_GLYPHS[id], x, y);
                    g.font = `italic ${size}px ${A.SERIF}`;
                    g.fillText(OrreryMath.PLANETS[id].name, x + size * 1.5, y);
                }));
                if (!app.tilted) {
                    g.font = `italic ${size * 0.92}px ${A.SERIF}`;
                    g.fillStyle = `${ink.faint}0.6)`;
                    g.fillText('From above the ecliptic', x0, y0 - lineH * 1.1);
                }
            }
        },

        plane(app, g, scene) {
            const ink = inkOf(app), k = app.k, d = app.dpr;
            // The belt as stipple when its rocks aren't drawn.
            if (app.config.showBelt && app.fx.belt === 0) {
                const rand = A.random(9), p = {};
                g.fillStyle = `${ink.faint}0.4)`;
                g.beginPath();
                for (let i = 0; i < 500; i++) {
                    const a = rand() * TAU, r = app.radial(2.15 + rand() * 1.15);
                    app.project(Math.cos(a) * r, Math.sin(a) * r, 0, p);
                    g.rect(p.x, p.y, 0.9 * k, 0.9 * k);
                }
                g.fill();
            }
            orbits(app, g, scene, (id, chosen) => {
                g.strokeStyle = chosen ? ink.red : `${ink.faint}0.7)`;
                g.lineWidth = (chosen ? 1.4 : 0.8) * k;
            });
            if (!app.config.showZodiac) return;
            const band = app.ringOut - app.ringIn, ticks = app.ringIn + band * 0.28;
            g.strokeStyle = ink.ink;
            g.lineWidth = 1.1 * k;
            circle(app, g, app.ringOut, 160); g.stroke();
            g.lineWidth = 0.7 * k;
            circle(app, g, app.ringIn, 160); g.stroke();
            circle(app, g, ticks, 160); g.stroke();
            const p0 = {}, p1 = {};
            g.beginPath();
            for (let deg = 0; deg < 360; deg += 1) {
                const a = deg * DEG, len = deg % 10 === 0 ? 1 : deg % 5 === 0 ? 0.6 : 0.3;
                app.project(Math.cos(a) * app.ringIn, Math.sin(a) * app.ringIn, 0, p0);
                const r1 = app.ringIn + (ticks - app.ringIn) * len;
                app.project(Math.cos(a) * r1, Math.sin(a) * r1, 0, p1);
                g.moveTo(p0.x, p0.y); g.lineTo(p1.x, p1.y);
            }
            g.lineWidth = 0.5 * k;
            g.stroke();
            const size = Math.max(8, band * app.R * 0.36), mid = ticks + (app.ringOut - ticks) * 0.5;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillStyle = ink.ink;
            for (const z of zodiac(app, scene.T)) {
                const a = z.start * DEG;
                app.project(Math.cos(a) * ticks, Math.sin(a) * ticks, 0, p0);
                app.project(Math.cos(a) * app.ringOut, Math.sin(a) * app.ringOut, 0, p1);
                g.strokeStyle = ink.ink;
                g.lineWidth = 0.8 * k;
                g.beginPath(); g.moveTo(p0.x, p0.y); g.lineTo(p1.x, p1.y); g.stroke();
                const span = z.end - z.start;
                g.font = `italic ${size * (span < 15 ? 0.78 : 0.9)}px ${A.SERIF}`;
                ringText(app, g, fitted(app, g, [z.name, z.name.slice(0, 3) + '.'], span, mid), z.start + span / 2, mid, 1 / app.R);
                g.setTransform(d, 0, 0, d, 0, 0);
            }
            // The equinox: ♈︎ at 0°, the J2000 frame's origin.
            g.font = `${size * 1.1}px ${A.SYMBOLS}`;
            g.fillStyle = ink.red;
            ringText(app, g, `♈${TEXT}`, 0, app.ringOut + band * 0.32, 1 / app.R);
            g.setTransform(d, 0, 0, d, 0, 0);
        },

        belt(app, g, xyz, count) {
            const p = {}, s = Math.max(0.7, 0.9 * app.k);
            g.beginPath();
            for (let i = 0; i < count; i += 2) {
                if (Number.isNaN(xyz[i * 3])) continue;
                app.project(xyz[i * 3], xyz[i * 3 + 1], xyz[i * 3 + 2], p);
                g.rect(p.x, p.y, s, s);
            }
            g.fillStyle = `${inkOf(app).faint}${0.45 * beltAlpha(app)})`;
            g.fill();
        },

        trails(app, g, scene) {
            const ink = inkOf(app);
            g.setLineDash([1.2 * app.k, 2.6 * app.k]);
            trails(app, g, scene, (b, a) => `${ink.faint}${0.75 * a})`, 0.35);
            g.setLineDash([]);
        },

        bodies(app, g, scene) {
            const d = app.dpr, k = app.k, ink = inkOf(app), th = chart.theme(app);
            g.setTransform(d, 0, 0, d, 0, 0);
            // The Sun: ☉, with rays.
            const sun = scene.sun, r = Math.max(5 * k, sun.px * 0.75);
            g.strokeStyle = ink.ink;
            g.fillStyle = ink.paper;
            g.lineWidth = 1.2 * k;
            g.beginPath(); g.arc(sun.x, sun.y, r, 0, TAU); g.fill(); g.stroke();
            g.fillStyle = ink.ink;
            g.beginPath(); g.arc(sun.x, sun.y, r * 0.18, 0, TAU); g.fill();
            g.beginPath();
            for (let i = 0; i < 16; i++) {
                const a = i * TAU / 16, l = i % 2 ? 1.45 : 1.8;
                g.moveTo(sun.x + Math.cos(a) * r * 1.2, sun.y + Math.sin(a) * r * 1.2);
                g.lineTo(sun.x + Math.cos(a) * r * l, sun.y + Math.sin(a) * r * l);
            }
            g.lineWidth = 0.8 * k;
            g.stroke();
            for (const b of scene.bodies) {
                const { x, y } = b.scr, rr = Math.max(2.4 * k, b.r * 0.75);
                if (b.id === 'saturn' || b.id === 'uranus') saturnRings(app, g, { ...b, px: rr / b.scr.k }, false, null, ink.ink, null);
                g.fillStyle = ink.paper;
                g.strokeStyle = ink.ink;
                g.lineWidth = 1 * k;
                g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill(); g.stroke();
                // Half shaded away from the Sun, in hatching.
                g.save();
                g.beginPath(); g.arc(x, y, rr, b.light + Math.PI / 2, b.light + Math.PI * 1.5); g.closePath(); g.clip();
                g.fillStyle = `${ink.faint}0.55)`;
                g.fillRect(x - rr, y - rr, 2 * rr, 2 * rr);
                g.restore();
                if (b.id === 'saturn' || b.id === 'uranus') saturnRings(app, g, { ...b, px: rr / b.scr.k }, true, null, ink.ink, null);
                // The glyph, and R when it's retrograde.
                const gs = 13 * k;
                g.font = `${gs}px ${A.SYMBOLS}`;
                g.textAlign = 'center';
                g.textBaseline = 'middle';
                g.lineJoin = 'round';
                g.strokeStyle = th.halo; g.lineWidth = 3 * k;
                const gx = x - rr - gs * 0.55, gy = y - rr - gs * 0.35;
                g.strokeText(ORRERY_GLYPHS[b.id], gx, gy);
                g.fillStyle = ink.ink;
                g.fillText(ORRERY_GLYPHS[b.id], gx, gy);
                if (b.retro) {
                    g.font = `italic 700 ${gs * 0.8}px ${A.SERIF}`;
                    g.fillStyle = ink.red;
                    g.fillText('R', gx + gs * 0.75, gy - gs * 0.3);
                }
            }
            for (const e of scene.extras) {
                if (e.id === 'moon') app.moonIcon(g, e.scr.x, e.scr.y, Math.max(2.4 * k, e.r * 1.3), scene.moon.phase, ink.paper, ink.ink);
                else { g.fillStyle = ink.ink; g.beginPath(); g.arc(e.scr.x, e.scr.y, Math.max(0.8, e.r * 0.8), 0, TAU); g.fill(); }
            }
        },

        overlay(app, g, scene) {
            const ink = inkOf(app), k = app.k, th = chart.theme(app);
            const ends = sightLines(app, g, scene, (b, a) => b.id === 'sun' ? `${ink.faint}${a})` : app.config.chartPalette === 'night' ? `rgba(255,207,110,${a})` : `rgba(156,47,31,${a})`, true);
            // A dot on the ring for each, where it is among the stars.
            for (const { b, end } of ends) {
                g.fillStyle = b.id === 'sun' ? ink.ink : ink.red;
                g.beginPath(); g.arc(end.x, end.y, 1.6 * k, 0, TAU); g.fill();
            }
            chart.legend(app, g);
            labels(app, g, scene, { ...th, labelWeight: 'italic 400' });
        },
    };

    return { space, brass, chart };
})();
