// Christmas Village's scene: everything that stands still, painted once per
// layout onto the land (back to front), and the lights that go on it.
//
//   land      the daylight painting; the manager washes it with the hour
//   glow      what shines steadily: lit windows and what's in them, street
//             lamps, the light they spill on the snow. Repainted only when
//             a window goes on or off
//   twinkle   two layers of coloured bulbs (strings on the eaves, the small
//             trees by the doors), faded against each other: every bulb
//             twinkles for the price of two blits
//   trees     the trees people walk in front of and behind, as sprites the
//             manager sorts in with them, each with its own two bulb layers
//
// The light layers start at `top`, the highest thing that shines, so they
// don't cover the sky.

const VillageScene = (() => {
    const A = VillageArt, B = VillageBuildings;
    const { clamp, lerp } = VillageLogic;
    const { blob, poly, TAU } = A;

    const PALETTES = {
        classic: ['#ff3d2e', '#2fd05a', '#3f8cff', '#ffd23f', '#ff8a1e'],
        warm: ['#ffd9a0', '#ffe6bf', '#ffcd86'],
        ice: ['#bfe6ff', '#eef8ff', '#8fd0ff'],
        candy: ['#ff3b3b', '#ffffff'],
        jewel: ['#c63cff', '#19c6c6', '#ff3d7f', '#ffc21a', '#3f6cff'],
    };
    const palette = config => config.lightColors === 'custom'
        ? (config.lightPalette.length ? config.lightPalette : PALETTES.classic)
        : PALETTES[config.lightColors] || PALETTES.classic;

    // Bulbs hung along a line from a to b, sagging a little between the ends.
    function string(a, b, gap, random) {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(len / gap)), out = [];
        const sag = Math.abs(b[1] - a[1]) < len * 0.3 ? len * 0.035 : 0;
        for (let i = 0; i <= n; i++) {
            const u = i / n;
            out.push({ x: lerp(a[0], b[0], u) + (random() - 0.5) * 0.6, y: lerp(a[1], b[1], u) + Math.sin(u * Math.PI) * sag });
        }
        return out;
    }

    function build(L, config, dpr, random, deco) {
        const { W, H, Hu, hz, s } = L;
        const [land, g] = A.canvas(W, H, dpr);
        const scene = { land, L, dpr, windows: [], strings: [], smallTrees: [], chimneys: [], lamps: [], spots: [], doors: [], houses: [], trees: [], farmRow: null, colors: palette(config) };
        const take = (meta, extra = {}) => {
            for (const w of meta.windows) {
                const r = random();
                scene.windows.push(Object.assign(w, VillageLogic.windowHabits(random), { owner: extra.owner, show: !(extra.owner && extra.owner.style) ? null : r < 0.13 ? 'tree' : r < 0.2 && config.cats > 0 ? 'cat' : null, tone: random() < 0.5 }, extra.window));
            }
            if (extra.strings !== false) for (const e of meta.eaves) scene.strings.push({ a: e[0], b: e[1], owner: extra.owner });
            for (const c of meta.chimneys) scene.chimneys.push({ x: c.p[0], y: c.p[1], k: extra.k || s, owner: extra.owner });
            for (const sp of meta.spots) scene.spots.push({ x: sp.p[0], y: sp.p[1], kind: sp.kind, k: extra.k || s });
            for (const d of meta.doors) scene.doors.push({ x: d.p[0], y: d.p[1], owner: extra.owner, k: extra.k || s });
            return meta;
        };
        // How decorated: owners are ranked once, and the share of the season lights that many of them.
        let rank = 0;
        const decorated = () => { const r = (rank++ * 0.618034) % 1; return r < deco.share; };

        A.mountains(g, L, random);
        A.ground(g, L, random);

        // The woods along the foot of the mountains.
        for (let row = 0; row < 3; row++) {
            for (let x = -10 + random() * 12 * s; x < W + 10; x += (7 + random() * 9) * s) {
                const y = hz - 3 * s + row * Hu * 0.013 + random() * 5 * s, h = (15 + random() * 16 + row * 4) * s;
                if (L.farm && x > L.farm.x0 - 10 && x < L.farm.x1 - 30 * s && row > 0) continue;
                A.fir(g, x, y, h, random, { snow: 0.7, tier: 7, wide: 0.44 });
            }
        }

        // The cabin, in its clearing up the mountain.
        if (L.cabin) {
            const c = L.cabin;
            for (const [dx, h] of [[-52, 44], [-40, 30], [46, 40], [60, 52]]) A.fir(g, c.x + dx * c.k, c.y - 3 * c.k + random() * 4 * c.k, h * c.k * (0.9 + random() * 0.3), random, { snow: 0.8, tier: 6 });
            scene.cabin = take(B.cabin(g, { x: c.x, y: c.y, k: c.k }, random), { owner: 'cabin', k: c.k, window: { cabin: true }, strings: false });
            scene.cabin.k = c.k;
            scene.cabin.x = c.x; scene.cabin.y = c.y;
            const [tx, ty] = scene.cabin.tree, th = 20 * c.k;
            A.fir(g, tx, ty, th, random, { snow: 0.5, tier: 5 });
            scene.smallTrees.push({ x: tx, y: ty, h: th, owner: 'cabin', lit: decorated(), star: true });
        }

        // The tree farm: the hillside, the far rows (painted), the barn. The
        // front row is sprites, so a tree can be cut and carried off.
        if (L.farm) {
            const f = L.farm;
            g.beginPath();
            g.moveTo(f.x0 - 40 * s, f.y1 + 8 * s);
            g.bezierCurveTo(f.x0 + (f.x1 - f.x0) * 0.2, f.y0 - 16 * s, f.x0 + (f.x1 - f.x0) * 0.7, f.y0 - 12 * s, f.x1 + 46 * s, f.y1 + 8 * s);
            g.closePath();
            const hill = g.createLinearGradient(0, f.y0 - 12 * s, 0, f.y1 + 8 * s);
            hill.addColorStop(0, '#f1f5fb'); hill.addColorStop(1, '#fbfcfe');
            g.fillStyle = hill;
            g.fill();
            f.rows.forEach((row, i) => {
                if (i === f.rows.length - 1) return;
                blob(g, (f.x0 + f.x1) / 2, row.y + 1.5 * row.k, (f.x1 - f.x0) * 0.52, 2.4 * row.k, 'rgba(160,182,216,0.3)');
                for (const t of row.trees) A.fir(g, t.x, row.y, 40 * row.k * t.size, random, { v: t.v, snow: 0.55, tier: 5 + row.k / s * 5 });
            });
            scene.barn = take(B.barn(g, { x: f.barn.x, y: f.barn.y, k: f.barn.k }, random), { owner: 'barn', k: f.barn.k, window: { barn: true } });
            scene.barn.lit = decorated();
            A.fence(g, f.x0 - 5, f.y1 + 9 * s, f.barn.x - 44 * f.barn.k, f.y1 + 9 * s, L.kFront * s);
            const front = f.rows[f.rows.length - 1];
            scene.farmRow = { y: front.y, k: front.k, trees: front.trees.map(t => ({ x: t.x, y: front.y + (random() - 0.5) * 2 * s, h: 42 * front.k * t.size, v: t.v, grown: 1 })) };
        }

        // The sledding hill: a shoulder of snow, and the runs worn into it.
        if (L.sled) {
            const sl = L.sled, dx = sl.x1 - sl.x0, dy = sl.y1 - sl.y0;
            g.beginPath();
            g.moveTo(sl.x0 - dx * 0.5, sl.y1 + dy * 0.5);
            g.bezierCurveTo(sl.x0 - dx * 0.2, sl.y0 - dy * 0.5, sl.x0 + dx * 0.3, sl.y0 - dy * 0.35, sl.x1 + dx * 0.5, sl.y1 + dy * 0.4);
            g.closePath();
            const hump = g.createLinearGradient(sl.x0, sl.y0 - dy * 0.3, sl.x1, sl.y1 + dy * 0.4);
            hump.addColorStop(0, '#ffffff'); hump.addColorStop(0.6, '#eef3fa'); hump.addColorStop(1, 'rgba(238,243,250,0)');
            g.fillStyle = hump;
            g.fill();
            g.strokeStyle = 'rgba(150,172,206,0.4)'; g.lineWidth = 1.6 * s;
            g.beginPath(); g.moveTo(sl.x0 - dx * 0.5, sl.y1 + dy * 0.5); g.bezierCurveTo(sl.x0 - dx * 0.2, sl.y0 - dy * 0.5, sl.x0 + dx * 0.3, sl.y0 - dy * 0.35, sl.x1 + dx * 0.5, sl.y1 + dy * 0.4); g.stroke();
            g.strokeStyle = 'rgba(160,180,212,0.5)'; g.lineWidth = 1 * s;
            for (const lane of [-0.5, 0, 0.5]) for (const off of [-2, 2]) {
                g.beginPath();
                for (let t = 0; t <= 1.08; t += 0.06) g.lineTo(lerp(sl.x0, sl.x1, t) + lane * 16 * L.depth(sl.y1) * (1 - t * 0.4), lerp(sl.y0, sl.y1, t * t * 0.4 + t * 0.6) + lane * 4 * L.depth(sl.y1) + off * s);
                g.stroke();
            }
        }

        // The village. Back street first; its houses are behind everything else.
        const paintHouse = h => {
            const lit = decorated();
            const meta = take(B.house(g, h, random), { owner: h, k: h.k, window: {} });
            h.deco = lit; h.candles = random() < 0.4; h.meta = meta;
            scene.houses.push(h);
            // A small tree by the door of some, and a maple in the yard of others.
            if (h.row === 'front' && h.style !== 'store' && random() < 0.75) {
                const side = random() < 0.5 ? -1 : 1, tx = h.x + side * h.w * (0.5 + random() * 0.06), ty = h.y + 2 * h.k, th = (24 + random() * 14) * h.k;
                A.fir(g, tx, ty, th, random, { snow: 0.45, tier: 6 });
                scene.smallTrees.push({ x: tx, y: ty, h: th, owner: h, lit: lit && random() < 0.8, star: true });
            }
        };
        const yardTrees = (row, k) => {
            const list = L.houses.filter(h => h.row === row).sort((p, q) => p.x - q.x);
            for (let i = 0; i < list.length - 1; i++) {
                const gap = list[i + 1].x - list[i + 1].w / 2 - (list[i].x + list[i].w / 2);
                if (gap < 9 * s * k || random() < 0.2) continue;
                const x = list[i].x + list[i].w / 2 + gap / 2, y = list[i].y - 3 * s * k;
                if (random() < 0.55) A.maple(g, x, y, (70 + random() * 30) * s * k, random); else A.fir(g, x, y, (46 + random() * 26) * s * k, random, { snow: 0.7 });
            }
        };
        if (config.village) {
            yardTrees('back', L.kBack);
            // The back street: a ribbon of packed snow.
            g.strokeStyle = 'rgba(176,194,222,0.5)'; g.lineWidth = 5 * s; g.beginPath(); g.moveTo(L.vx0 - 30 * s, L.backY + 5 * s); g.lineTo(W + 10, L.backY + 5 * s); g.stroke();
            for (const h of L.houses.filter(h => h.row === 'back').sort((p, q) => p.y - q.y)) paintHouse(h);
            if (L.church) {
                scene.church = take(B.church(g, { x: L.church.x, y: L.church.y, k: L.church.k }, random), { owner: 'church', k: L.church.k, window: { church: true } });
                scene.church.lit = decorated();
            }
            yardTrees('front', L.kFront);
            for (const h of L.houses.filter(h => h.row === 'front').sort((p, q) => p.y - q.y)) paintHouse(h);
            // The street: packed snow, runner tracks, and the lamps along it.
            const road = g.createLinearGradient(0, L.walkY - 9 * s, 0, L.walkY + 9 * s);
            road.addColorStop(0, 'rgba(188,203,228,0)'); road.addColorStop(0.5, 'rgba(188,203,228,0.62)'); road.addColorStop(1, 'rgba(188,203,228,0)');
            g.fillStyle = road;
            g.fillRect(L.farm ? L.farm.x1 - 30 * s : -5, L.walkY - 9 * s, W, 18 * s);
            g.strokeStyle = 'rgba(150,170,205,0.42)'; g.lineWidth = 0.8 * s;
            for (const dy of [-2.4, 2.6]) { g.beginPath(); for (let x = L.vx0 - 40 * s; x <= W + 5; x += 12) g.lineTo(x, L.walkY + dy * s + Math.sin(x * 0.013 + dy) * 1.2 * s); g.stroke(); }
            const lampGap = clamp(W / 7, 120 * s, 240 * s);
            for (let x = L.vx0 + lampGap * 0.3; x < W - 20 * s; x += lampGap) {
                if (Math.abs(x - L.green.x) < 18 * s) continue;
                scene.lamps.push(A.lamp(g, x, L.walkY + 11 * s, 1.7 * s, true));
            }
            if (L.gazebo) scene.gazebo = take(B.gazebo(g, { x: L.gazebo.x, y: L.gazebo.y, k: L.gazebo.k }), { owner: 'gazebo', k: L.gazebo.k });
            if (scene.gazebo) scene.gazebo.lit = decorated();
        }

        // The brook and its bridge; then the pond the brook feeds.
        if (L.bridge && L.pond) {
            const br = L.bridge, p = L.pond;
            g.strokeStyle = '#a9c4da'; g.lineWidth = 7 * s; g.lineCap = 'round';
            g.beginPath(); g.moveTo(W + 20, br.y - 30 * s); g.quadraticCurveTo(br.x, br.y - 4 * s, br.x - 30 * s, br.y + 20 * s);
            g.quadraticCurveTo(p.cx + p.rx * 1.25, p.cy - p.ry * 0.9, p.cx + p.rx * 0.9, p.cy - p.ry * 0.2); g.stroke();
            g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 2 * s;
            g.beginPath(); g.moveTo(W + 20, br.y - 34 * s); g.quadraticCurveTo(br.x, br.y - 8 * s, br.x - 32 * s, br.y + 16 * s); g.stroke();
            g.lineCap = 'butt';
        }
        if (L.bridge) { scene.bridge = take(B.bridge(g, { x: L.bridge.x, y: L.bridge.y, k: L.bridge.k }), { owner: 'bridge', k: L.bridge.k, window: { dim: true } }); scene.bridge.lit = decorated(); }
        if (L.pond) A.pond(g, L, random);
        if (L.fire) { B.hearth(g, L.fire.x, L.fire.y, L.fire.k); A.bench(g, L.fire.x - 30 * L.fire.k, L.fire.y + 3 * L.fire.k, L.fire.k * 1.1); scene.spots.push({ x: L.fire.x + 17 * L.fire.k, y: L.fire.y + 4 * L.fire.k, kind: 'fire', k: L.fire.k }); }
        if (L.hut) { scene.hut = take(B.hut(g, { x: L.hut.x, y: L.hut.y, k: L.hut.k }, random), { owner: 'hut', k: L.hut.k, window: { hatch: true } }); A.bench(g, L.hut.x - 40 * L.hut.k, L.hut.y + 6 * L.hut.k, L.hut.k); }

        // Round about: the town's sign and a wall by the road in, a snowman by the pond.
        const bank = L.pond || { cx: W * 0.56, cy: Hu * 0.8, rx: W * 0.2, ry: Hu * 0.06 };
        if (config.village && !L.portrait) {
            const wx = L.vx0 - 6 * s, wy = L.walkY + 34 * s;
            A.wall(g, wx - 150 * s, wx - 44 * s, wy, 1.6 * s, random);
            A.sign(g, wx, wy + 3 * s, 1.75 * s, ['EVERGREEN HOLLOW', 'a good place in the snow']);
            scene.spots.push({ x: wx - 100 * s, y: wy - 9.6 * 1.6 * s, kind: 'wall', k: 1.6 * s });
        }
        if (config.snowman) A.snowman(g, bank.cx - bank.rx * (L.portrait ? -0.12 : 0.5), bank.cy - bank.ry * (L.portrait ? 1.16 : 1.28) - 4 * s, 1.35 * s);

        // The trees that stand among the people: the grand tree on the green,
        // firs on the bank and in the near corners.
        const sprite = (x, y, h, o = {}) => {
            const r = WP.seededRandom(Math.round(x * 13 + y * 7 + h * 3));
            const t = { x, y, h, lit: o.lit, grand: o.grand, sprite: A.firSprite(h, dpr, r, { snow: o.snow ?? 0.75, wide: o.wide, v: o.v }), bulbs: A.firLights(h, r, { wide: o.wide }) };
            scene.trees.push(t);
            return t;
        };
        if (L.townTree && config.townTree) {
            const t = L.townTree;
            scene.grand = sprite(t.x, t.y, clamp(config.townTreeSize * 200 * s, 40, hz + 100), { lit: true, grand: true, snow: 0.3, wide: 0.5, v: 1 });
        }
        const bankTrees = L.portrait ? [[-1.02, -0.9, 80], [1.04, 0.45, 96]] : [[-1.34, 0.3, 120], [1.3, 0.42, 110], [1.52, -0.2, 90]];
        for (const [u, v, h] of bankTrees) {
            const x = bank.cx + bank.rx * u, y = bank.cy + bank.ry * v;
            if (x < 10 * s || x > W - 10 * s) continue;
            if (L.hut && Math.abs(x - L.hut.x) < 44 * s && Math.abs(y - L.hut.y) < 30 * s) continue;
            sprite(x, y, h * s * (0.9 + random() * 0.25), { lit: decorated() });
        }
        const corners = L.portrait ? [[0.07, 0.985, 170], [0.95, 0.97, 140]] : [[0.035, 0.985, 250], [0.118, 0.955, 170], [0.972, 0.99, 236], [0.9, 0.95, 150]];
        for (const [u, v, h] of corners) sprite(W * u, Hu * v, h * s, { lit: decorated(), snow: 0.9 });

        // Only so many trees are lit: the grand one first, then the rest in turn.
        const want = Math.round(config.litTrees * deco.share);
        const lit = [...scene.trees.filter(t => !t.grand), ...scene.smallTrees].filter(t => t.lit);
        for (let i = lit.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [lit[i], lit[j]] = [lit[j], lit[i]]; }
        lit.forEach((t, i) => { t.lit = i < want - (scene.grand ? 1 : 0); });
        if (scene.farmRow) scene.farmRow.trees.forEach((t, i) => { t.lit = config.lights && i % 3 === 1 && deco.share > 0.5; });

        lights(scene, config, random);
        return scene;
    }

    // ---- Lights -----------------------------------------------------------------

    const bulbSprites = {};
    function bulbSprite(color, dpr) {
        const key = `${color}|${dpr}`;
        return bulbSprites[key] ??= A.glow(24, dpr, color, color);
    }
    function bulb(g, x, y, r, color, dpr) {
        g.globalAlpha = 0.36;
        g.drawImage(bulbSprite(color, dpr), x - r * 3, y - r * 3, r * 6, r * 6);
        g.globalAlpha = 1;
        g.fillStyle = color;
        g.beginPath(); g.arc(x, y, r * 0.62, 0, TAU); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.75)';
        g.beginPath(); g.arc(x, y, r * 0.28, 0, TAU); g.fill();
    }

    // The two twinkle layers, and each sprite tree's own.
    function lights(scene, config, random) {
        const { L, dpr, colors } = scene, { W, H, s } = L;
        let top = H;
        const owners = o => o === 'cabin' ? true : o === 'church' ? scene.church.lit : o === 'barn' ? scene.barn.lit : o === 'gazebo' ? scene.gazebo.lit : o === 'bridge' ? scene.bridge.lit : o === 'hut' ? true : o && o.deco;
        const runs = [];
        if (config.lights) {
            for (const st of scene.strings) {
                if (!owners(st.owner)) continue;
                const k = st.owner && st.owner.k ? st.owner.k : s * 0.8;
                runs.push({ bulbs: string(st.a, st.b, Math.max(3.6, 4.4 * k), random), r: clamp(0.8 * k, 0.6, 1.5), offset: Math.floor(random() * 5) });
            }
            for (const t of scene.smallTrees) {
                if (!t.lit) continue;
                const b = A.firLights(t.h, random).map(p => ({ x: t.x + p.x, y: t.y + p.y }));
                runs.push({ bulbs: b, r: clamp(t.h * 0.02, 0.5, 1.2), offset: Math.floor(random() * 5), star: t.star ? { x: t.x, y: t.y - t.h } : null, h: t.h });
            }
        }
        for (const run of runs) for (const b of run.bulbs) top = Math.min(top, b.y);
        for (const w of scene.windows) for (const p of w.q) top = Math.min(top, p[1]);
        scene.top = Math.max(0, Math.floor(top - 40 * s));
        const make = () => { const [c, g] = A.canvas(W, H - scene.top, dpr); g.translate(0, -scene.top); g.globalCompositeOperation = 'lighter'; return [c, g]; };
        const [a, ga] = make(), [b, gb] = make();
        for (const run of runs) {
            run.bulbs.forEach((p, i) => bulb(i % 2 ? gb : ga, p.x, p.y, run.r, colors[(i + run.offset) % colors.length], dpr));
            if (run.star) for (const g of [ga, gb]) star(g, run.star.x, run.star.y, Math.max(1.6, run.h * 0.05), dpr);
        }
        scene.twinkle = [a, b];
        // The trees that are sprites carry their own.
        for (const t of scene.trees) treeLights(t, config, colors, dpr);
        scene.glow = A.canvas(W, H - scene.top, dpr)[0];
    }

    function star(g, x, y, r, dpr) {
        g.globalAlpha = 0.4;
        g.drawImage(bulbSprite('#ffd86a', dpr), x - r * 2, y - r * 2, r * 4, r * 4);
        g.globalAlpha = 1;
        g.fillStyle = '#fff3c4';
        g.beginPath();
        for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.42 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
        g.closePath();
        g.fill();
    }

    function treeLights(t, config, colors, dpr) {
        t.layers = null;
        if (!t.lit || !config.lights) return;
        const sp = t.sprite, r = clamp(t.h * 0.0125, 0.7, 2.6), pad = Math.ceil(r * 5 + t.h * 0.1);
        const make = () => { const [c, g] = A.canvas(sp.w + pad * 2, sp.h + pad * 2, dpr); g.globalCompositeOperation = 'lighter'; return [c, g]; };
        const [a, ga] = make(), [b, gb] = make();
        t.bulbs.forEach((p, i) => bulb(i % 2 ? gb : ga, pad + sp.ax + p.x, pad + sp.ay + p.y, r, colors[i % colors.length], dpr));
        for (const g of [ga, gb]) star(g, pad + sp.ax, pad + sp.ay - t.h * 0.99, Math.max(2.4, t.h * (t.grand ? 0.042 : 0.036)), dpr);
        t.layers = [a, b];
        t.pad = pad;
    }

    // The steady glow: every window that's lit just now, and what shows in it.
    function paintGlow(scene, config, isLit, dark) {
        const { L, dpr } = scene, { s } = L;
        const g = scene.glow.getContext('2d');
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, scene.glow.width, scene.glow.height);
        g.setTransform(dpr, 0, 0, dpr, 0, -scene.top * dpr);
        const halo = bulbSprite('#ffb44a', dpr), spill = new Set();
        for (const w of scene.windows) {
            if (w.cabin || !isLit(w)) continue;
            const q = w.q, cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, cy = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
            const ww = Math.abs(q[1][0] - q[0][0]), wh = Math.abs(q[3][1] - q[0][1]);
            g.globalCompositeOperation = 'lighter';
            g.globalAlpha = w.dim ? 0.14 : 0.26;
            const hr = Math.max(ww, wh) * (w.shop || w.hatch ? 1.2 : 1.7);
            g.drawImage(halo, cx - hr, cy - hr, hr * 2, hr * 2);
            g.globalCompositeOperation = 'source-over';
            g.globalAlpha = w.dim ? 0.75 : 1;
            const fill = g.createLinearGradient(0, q[0][1], 0, q[3][1]);
            if (w.church) { fill.addColorStop(0, '#ffe9a8'); fill.addColorStop(0.35, '#ff9d5c'); fill.addColorStop(0.7, '#d9577a'); fill.addColorStop(1, '#5c7fd6'); }
            else { fill.addColorStop(0, w.tone ? '#ffe7b0' : '#ffdf9a'); fill.addColorStop(1, w.tone ? '#ffc470' : '#ffb054'); }
            poly(g, q, fill);
            g.globalAlpha = 1;
            // What's inside: curtains, a tree, a cat on the sill, the cocoa seller.
            const flipX = q[1][0] < q[0][0] ? -1 : 1;
            if (w.show === 'tree' && w.front) {
                poly(g, [[cx, cy - wh * 0.42], [cx + ww * 0.34, cy + wh * 0.5], [cx - ww * 0.34, cy + wh * 0.5]], '#1d5a37');
                for (let i = 0; i < 5; i++) blob(g, cx + ((i * 37) % 9 - 4) / 9 * ww * 0.36, cy - wh * 0.2 + i * wh * 0.14, Math.max(0.5, ww * 0.06), Math.max(0.5, ww * 0.06), scene.colors[i % scene.colors.length]);
            } else if (w.show === 'cat' && w.front) {
                const u = Math.max(0.8, ww * 0.16), bx = cx + ww * 0.12 * flipX, by = q[3][1];
                g.fillStyle = '#2a1c14';
                g.beginPath(); g.ellipse(bx, by - u * 1.3, u * 1.25, u * 1.5, 0, 0, TAU); g.fill();
                g.beginPath(); g.arc(bx - u * 0.3 * flipX, by - u * 3.1, u * 0.95, 0, TAU); g.fill();
                poly(g, [[bx - u * 1.1 * flipX, by - u * 3.6], [bx - u * 0.9 * flipX, by - u * 4.6], [bx - u * 0.3 * flipX, by - u * 3.9]], '#2a1c14');
                poly(g, [[bx + u * 0.5 * flipX, by - u * 3.6], [bx + u * 0.3 * flipX, by - u * 4.6], [bx - u * 0.3 * flipX, by - u * 3.9]], '#2a1c14');
            } else if (w.hatch) {
                g.fillStyle = '#5a3320';
                g.beginPath(); g.arc(cx + ww * 0.2, cy - wh * 0.08, wh * 0.2, 0, TAU); g.fill();
                g.fillRect(cx + ww * 0.2 - wh * 0.28, cy + wh * 0.1, wh * 0.56, wh * 0.4);
                g.fillStyle = '#b63a30'; g.fillRect(cx + ww * 0.2 - wh * 0.2, cy - wh * 0.32, wh * 0.4, wh * 0.12);
                for (const dx of [-0.34, -0.2, -0.06]) { g.fillStyle = '#f3f0e8'; g.fillRect(cx + ww * dx, cy + wh * 0.26, wh * 0.14, wh * 0.2); }
            } else if (w.shop) {
                for (let i = 0; i < 4; i++) { g.fillStyle = ['#b63a30', '#27452f', '#d8b24a', '#3f556b'][i]; g.fillRect(lerp(q[0][0], q[1][0], 0.12 + i * 0.22), q[3][1] - wh * (0.24 + (i % 2) * 0.14), ww * 0.14, wh * (0.24 + (i % 2) * 0.14)); }
            } else if (!w.church && !w.dim) {
                g.fillStyle = 'rgba(150,70,40,0.4)';
                poly(g, [q[0], [lerp(q[0][0], q[1][0], 0.3), q[0][1]], [lerp(q[3][0], q[2][0], 0.12), q[3][1]], q[3]]);
                g.fill();
                poly(g, [q[1], [lerp(q[1][0], q[0][0], 0.3), q[1][1]], [lerp(q[2][0], q[3][0], 0.12), q[2][1]], q[2]]);
                g.fill();
            }
            // The glazing bars, dark against the light.
            if (!w.hatch && !w.dim) {
                g.strokeStyle = 'rgba(60,34,20,0.75)'; g.lineWidth = Math.max(0.5, ww * 0.07);
                g.beginPath();
                g.moveTo((q[0][0] + q[1][0]) / 2, (q[0][1] + q[1][1]) / 2); g.lineTo((q[3][0] + q[2][0]) / 2, (q[3][1] + q[2][1]) / 2);
                if (!w.shop) { g.moveTo((q[0][0] + q[3][0]) / 2, (q[0][1] + q[3][1]) / 2); g.lineTo((q[1][0] + q[2][0]) / 2, (q[1][1] + q[2][1]) / 2); }
                g.stroke();
            }
            if (w.owner && w.front) spill.add(w.owner);
        }
        // A candle in every window of the houses that keep them, lit all night.
        if (config.candles && dark > 0.25) {
            g.globalCompositeOperation = 'lighter';
            for (const w of scene.windows) {
                if (!w.owner || !w.owner.candles || !w.front || w.shop) continue;
                const x = (w.q[3][0] + w.q[2][0]) / 2, y = w.q[3][1] - 1.2 * w.owner.k, r = Math.max(1.6, 2.2 * w.owner.k);
                g.globalAlpha = 0.9;
                g.drawImage(bulbSprite('#ffc45a', dpr), x - r * 2, y - r * 2, r * 4, r * 4);
            }
        }
        // Light on the snow: under the lamps, and before every house with a light on.
        g.globalCompositeOperation = 'lighter';
        if (config.lamps) for (const l of scene.lamps) {
            g.globalAlpha = 0.9;
            g.drawImage(halo, l.x - 13 * l.k, l.y - 13 * l.k, 26 * l.k, 26 * l.k);
            g.globalAlpha = 0.32;
            g.drawImage(halo, l.x - 34 * l.k, l.y + 30 * l.k - 9 * l.k, 68 * l.k, 18 * l.k);
            g.globalAlpha = 1;
            g.fillStyle = '#fff4d6';
            g.fillRect(l.x - 1.7 * l.k, l.y - 2 * l.k, 3.4 * l.k, 4 * l.k);
        }
        for (const h of spill) {
            if (!h.w) continue;
            g.globalAlpha = 0.2;
            g.drawImage(halo, h.x - h.w * 0.62, h.y - 2 * h.k, h.w * 1.24, 20 * h.k);
        }
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
    }

    return { PALETTES, palette, build, paintGlow, treeLights, bulbSprite, star };
})();
