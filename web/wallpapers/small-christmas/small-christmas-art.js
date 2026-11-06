// A Very Small Christmas: the pixel art, drawn a pixel at a time into
// small canvases in the palette's colours (every sprite is rebuilt when the
// palette changes). One pixel here is several on the screen: the stage's
// canvas is the size of the picture in pixels, and CSS scales it up,
// pixelated.

const SmallXmasArt = (() => {
    function canvas(w, h) {
        const c = document.createElement('canvas');
        c.width = Math.max(1, w); c.height = Math.max(1, h);
        return c;
    }
    const dot = (g, x, y, c) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); };

    // A sprite from rows of characters, each mapped to a colour ('.' is clear).
    function rows(lines, map, flip) {
        const w = Math.max(...lines.map(l => l.length)), h = lines.length;
        const c = canvas(w, h), g = c.getContext('2d');
        lines.forEach((line, y) => [...line].forEach((ch, x) => { if (map[ch]) dot(g, flip ? w - 1 - x : x, y, map[ch]); }));
        return { c, w, h };
    }

    // ---- The tree ----------------------------------------------------------------------------

    const SIZES = { tiny: [20, 3], small: [30, 4], medium: [42, 5] };

    // A little pixel fir: tiers that widen downward, lit from the left (a
    // checkered shade on the right), a dark edge under each tier, snow on
    // its shoulders, a gold garland, a few ornaments; the star, the trunk and
    // a red pot. Returns where its bulbs go for the blinking.
    function tree(size, P, rand, o = {}) {
        const [H, T] = SIZES[size] || SIZES.small;
        const potH = 3, trunkH = 1, top = 3;
        const F = H - top - trunkH - potH;
        const half = Math.round(F * 0.37);
        const W = half * 2 + 3, cx = Math.floor(W / 2);
        const c = canvas(W, H), g = c.getContext('2d');
        const widths = [];
        const bottoms = new Set();
        for (let k = 0; k < T; k++) {
            const r0 = Math.round(k * F / T * 0.92), r1 = k === T - 1 ? F - 1 : Math.round(r0 + F / T * 1.3);
            bottoms.add(r1);
            const max = half * (0.42 + 0.58 * (k + 1) / T);
            for (let r = r0; r <= r1; r++) widths[r] = Math.max(widths[r] || 0, Math.round(1 + (max - 1) * (r - r0) / Math.max(1, r1 - r0)));
        }
        const inside = [];
        for (let r = 0; r < F; r++) {
            const hw = widths[r] || 0, y = top + r;
            for (let x = cx - hw; x <= cx + hw; x++) {
                const rel = (x - cx) / Math.max(1, hw);
                const edge = Math.abs(x - cx) === hw || bottoms.has(r);
                let col = P.tree;
                if (edge) col = P.treeDark;
                else if (rel < -0.4) col = (x + r) % 2 ? P.tree : P.treeLight;
                else if (rel > 0.3) col = (x + r) % 2 ? P.treeDark : P.tree;
                else if (LittleHash(x, r) > 0.86) col = P.treeLight;
                dot(g, x, y, col);
                if (!edge && Math.abs(rel) < 0.85) inside.push({ x, y });
            }
            // Snow on each tier's shoulders.
            if (o.snow && bottoms.has(r) && hw > 2) {
                for (const x of [cx - hw, cx + hw]) dot(g, x, y, P.snow);
                for (const x of [cx - hw + 1, cx + hw - 1]) dot(g, x, y - 1, P.snow);
                dot(g, cx + hw - 2, y - 1, P.snowShade);
            }
        }
        if (o.snow) dot(g, cx, top, P.snow);
        // The garland: a gold line swagged across each tier.
        const garland = [];
        if (o.garland) {
            for (let k = 0; k < T; k++) {
                const r = Math.round((k + 0.55) * F / T * 0.95);
                const hw = widths[r] || 0;
                for (let x = cx - hw + 1; x <= cx + hw - 1; x++) {
                    const yy = top + r + Math.round(Math.sin((x - cx + hw) / (2 * hw) * Math.PI) * 1.6);
                    if (yy - top < F && Math.abs(x - cx) < (widths[yy - top] || 0)) { dot(g, x, yy, x > cx + hw * 0.4 ? P.goldDark : P.gold); garland.push({ x, y: yy }); }
                }
            }
        }
        // Ornaments, a pixel each.
        if (o.ornaments) for (let i = 0; i < Math.round(F / 4); i++) { const p = inside[Math.floor(rand() * inside.length)]; if (p) dot(g, p.x, p.y, P.presents[i % P.presents.length]); }
        // The bulbs: spread over the boughs, not on the edge.
        const lights = [];
        const want = Math.round(F * 0.6);
        for (let tries = 0; lights.length < want && tries < 400; tries++) {
            const p = inside[Math.floor(rand() * inside.length)];
            if (p && lights.every(q => Math.abs(q.x - p.x) + Math.abs(q.y - p.y) > 2)) lights.push({ ...p, i: lights.length });
        }
        lights.sort((a, b) => a.y - b.y || a.x - b.x).forEach((l, i) => { l.i = i; });
        // The star.
        const star = rows(['..Y..', '.YYY.', 'YYWYY', '.YYY.', '.Y.Y.'], { Y: P.starGold, W: P.white });
        g.drawImage(star.c, cx - 2, 0);
        // Trunk and pot.
        const ty = top + F;
        for (let x = cx - 1; x <= cx + 1; x++) dot(g, x, ty, P.trunk);
        const pw = size === 'tiny' ? 2 : 3;
        for (let x = cx - pw; x <= cx + pw; x++) { dot(g, x, ty + 1, P.potLight); dot(g, x, ty + 2, P.pot); }
        for (let x = cx - pw + 1; x <= cx + pw - 1; x++) dot(g, x, ty + 3, P.redDark);
        return { c, w: W, h: H + 1, cx, lights, star: { x: cx, y: 2 } };
    }
    const LittleHash = (x, y) => { let h = (x * 73856093) ^ (y * 19349663); h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

    // A present: a box, its ribbon both ways, and a bow.
    function present(w, h, colour, P, ribbon) {
        const c = canvas(w, h + 1), g = c.getContext('2d');
        for (let y = 1; y <= h; y++) for (let x = 0; x < w; x++) dot(g, x, y, colour);
        const rb = ribbon || P.gold, mx = Math.floor(w / 2), my = 1 + Math.floor(h / 2);
        for (let y = 1; y <= h; y++) dot(g, mx, y, rb);
        for (let x = 0; x < w; x++) dot(g, x, my, rb);
        dot(g, mx - 1, 0, rb); dot(g, mx + 1, 0, rb);
        return { c, w, h: h + 1 };
    }

    // ---- The train --------------------------------------------------------------------------------

    function train(P) {
        const map = { C: P.redDark, R: P.red, K: P.black, G: P.gold, Y: P.starGold, g: P.grey, B: P.blue, P: P.presents[0], W: P.white };
        const make = lines => ({ right: rows(lines, map, false), left: rows(lines, map, true) });
        const engineA = ['CCC....KK..', 'C.C.....K..', 'CCCRRRRRRRY', 'CCCRRGRRRRR', 'KKKKKKKKKKG', '.K.K..K.K..'];
        const engineB = engineA.slice(0, 5).concat(['.g.g..g.g..']);
        return {
            engine: [make(engineA), make(engineB)],
            tender: make(['..KKK..', '.RRRRR.', '.RGGGR.', 'KKKKKKK', '.K...K.']),
            gift: make(['..PWP..', '..PPP..', '.BBBBB.', 'KKKKKKK', '.K...K.']),
            caboose: make(['.RRRRR.', 'RRRRRRR', 'RYRRRYR', 'KKKKKKK', '.K...K.']),
            stack: 7,       // the smokestack's column, facing right
        };
    }

    // The sleigh and its two reindeer, facing right, in two frames of legs.
    function sleigh(P) {
        const map = { R: P.red, W: P.white, G: P.gold, T: P.trunk, A: P.goldDark, N: P.potLight, K: P.black };
        const deer = (legs, nose) => ['....A.A', '.....AA', 'TTTTTT' + (nose ? 'N' : 'T'), 'TTTTT..', legs];
        const frame = legs => {
            const sl = ['...RR.....', '...WW.....', 'R.RRRR...R', 'RRRRRRRRRR', '.RRRRRRRR.', 'G........G', '.GGGGGGGG.'];
            const a = deer(legs, false), b = deer(legs, true);
            const lines = [];
            for (let y = 0; y < 7; y++) {
                const d = y >= 1 && y <= 5 ? y - 1 : -1;
                const da = d >= 0 ? a[d] : '.......', db = d >= 0 ? b[d] : '.......';
                const harness = y === 3 ? 'GG' : '..';
                lines.push(sl[y] + harness + da + '.' + db);
            }
            return { right: rows(lines, map, false), left: rows(lines, map, true) };
        };
        return [frame('T.T.T..'), frame('.T.T.T.')];
    }

    // ---- The night -------------------------------------------------------------------------------

    const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];

    // The sky (dithered toward the horizon), a crescent moon, and the snow
    // on the floor, its edge a little uneven, shaded deeper toward you.
    function night(bw, bh, P, o) {
        const c = canvas(bw, bh), g = c.getContext('2d');
        g.fillStyle = P.sky; g.fillRect(0, 0, bw, bh);
        for (let y = 0; y < o.groundTop; y++) {
            const k = y / Math.max(1, o.groundTop);
            for (let x = 0; x < bw; x++) if (BAYER[y % 4][x % 4] / 16 < k * k * 0.7) dot(g, x, y, P.sky2);
        }
        if (o.moon) {
            const mx = o.moonX, my = o.moonY, r = 4;
            for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
                if (x * x + y * y > r * r + 1) continue;
                if ((x + 2) * (x + 2) + (y - 1) * (y - 1) <= r * r - 1) continue;      // the crescent
                dot(g, mx + x, my + y, x > 0 || y > 1 ? P.moonDark : P.moon);
            }
        }
        const edge = [];
        for (let x = 0; x < bw; x++) {
            const top = o.groundTop + (LittleHash(Math.floor(x / 5), 3) > 0.6 ? -1 : 0) + (LittleHash(Math.floor(x / 11), 9) > 0.7 ? -1 : 0);
            edge.push(top);
            for (let y = top; y < bh; y++) {
                const k = (y - o.groundTop) / Math.max(1, bh - o.groundTop);
                const t = BAYER[y % 4][x % 4] / 16;
                dot(g, x, y, y === top ? P.white : k > 0.75 && t < (k - 0.75) * 3 ? P.snowDeep : k > 0.2 && t < (k - 0.2) * 0.9 ? P.snowShade : P.snow);
            }
        }
        return { c, edge };
    }

    return { SIZES, tree, present, train, sleigh, night, rows, dot, BAYER };
})();
