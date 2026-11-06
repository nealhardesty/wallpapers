// Frost on the Glass (SPEC §10.29): the pure parts. The window's panes, how
// fern frost nucleates at the cold edges and grows (stems that branch at
// ice's sixty degrees, and stop where another crystal already is), and the
// doodles someone draws in it from inside. No DOM in here: the unit tests
// run this file in a Node vm.

const FrostLogic = (() => {
    const SIXTY = Math.PI / 3;

    // The window: an outer frame, a deeper sill at the bottom (above the
    // inset), and the panes between the muntins. CSS px.
    const KINDS = { single: [1, 1], two: [2, 1], four: [2, 2], six: [3, 2] };
    function layout(W, H, o = {}) {
        const insets = o.insets || {};
        const u = Math.max(0.5, Math.min(W, H) / 800);
        const fw = Math.round(24 * u), mw = Math.round(o.kind === 'single' ? 0 : 13 * u), sill = Math.round(44 * u);
        let [cols, rows] = KINDS[o.kind] || KINDS.four;
        if (H > W * 1.2) [cols, rows] = [rows, cols];          // portrait: the grid turns
        const x0 = fw + (insets.left || 0), y0 = fw + (insets.top || 0);
        const x1 = W - fw - (insets.right || 0), y1 = H - (insets.bottom || 0) - sill;
        const pw = (x1 - x0 - mw * (cols - 1)) / cols, ph = (y1 - y0 - mw * (rows - 1)) / rows;
        const panes = [];
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) panes.push({ x: x0 + c * (pw + mw), y: y0 + r * (ph + mw), w: pw, h: ph });
        return { W, H, u, fw, mw, sill, cols, rows, inner: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, panes };
    }

    // ---- Growth --------------------------------------------------------------------------------

    // Where frost starts: along every edge of a pane (deeper toward the
    // corners, where the glass is coldest) and in fans from each corner.
    // A tip: { x, y, a, gen, len, max, delay, stem, since }; a seed's delay
    // is a share of the growing time (corners first, mid-edges last).
    function seeds(pane, rand, o = {}) {
        const u = o.u || 1, coverage = o.coverage ?? 0.55;
        const depth = coverage * Math.min(pane.w, pane.h) * 0.8;
        const tips = [];
        let stem = o.stem || 0;
        const corners = [[pane.x, pane.y, Math.PI / 4], [pane.x + pane.w, pane.y, 3 * Math.PI / 4], [pane.x + pane.w, pane.y + pane.h, -3 * Math.PI / 4], [pane.x, pane.y + pane.h, -Math.PI / 4]];
        for (const [cx, cy, a] of corners) {
            const n = 2 + Math.floor(rand() * 2);
            for (let i = 0; i < n; i++) tips.push(tip(cx + Math.cos(a) * 2, cy + Math.sin(a) * 2, a + (rand() - 0.5) * 0.9, depth * (0.9 + rand() * 0.6), rand() * 0.03, stem++));
        }
        const edges = [
            [pane.x, pane.y, 1, 0, Math.PI / 2, pane.w], [pane.x, pane.y + pane.h, 1, 0, -Math.PI / 2, pane.w],
            [pane.x, pane.y, 0, 1, 0, pane.h], [pane.x + pane.w, pane.y, 0, 1, Math.PI, pane.h],
        ];
        for (const [ex, ey, dx, dy, normal, len] of edges) {
            for (let t = (18 + rand() * 30) * u; t < len - 8 * u; t += (26 + rand() * 44) * u) {
                // 0 at a corner, 1 mid-edge: the middle stays clearer.
                const mid = 1 - Math.abs(t / len - 0.5) * 2;
                const max = depth * (0.2 + 0.8 * Math.pow(rand(), 1.4)) * (1 - 0.6 * mid);
                if (max < 6 * u) continue;
                tips.push(tip(ex + dx * t + Math.cos(normal) * 1.5, ey + dy * t + Math.sin(normal) * 1.5, normal + (rand() - 0.5) * 1.2, max, 0.01 + rand() * 0.5 * (0.3 + 0.7 * mid), stem++));
            }
        }
        return { tips, stem };
    }
    const tip = (x, y, a, max, delay, stem, gen = 0) => ({ x, y, a, gen, len: 0, max, delay, stem, since: 0, curl: 0 });

    // The occupancy grid: which stem has frost in each small cell, how
    // much, and its finest generation there. A tip stops where another
    // stem's ice is as coarse as its own or coarser (a stem runs on through
    // a neighbour's twigs; a twig stops at anything).
    function grid(W, H, cell = 5) {
        const cols = Math.ceil(W / cell) + 1, rows = Math.ceil(H / cell) + 1;
        return { cell, cols, rows, owner: new Int32Array(cols * rows).fill(-1), count: new Uint8Array(cols * rows), gen: new Uint8Array(cols * rows).fill(255) };
    }
    function claim(G, x, y, stem, gen = 0) {
        const cx = Math.floor(x / G.cell), cy = Math.floor(y / G.cell);
        if (cx < 0 || cy < 0 || cx >= G.cols || cy >= G.rows) return false;
        const i = cy * G.cols + cx;
        if (G.owner[i] === -1) { G.owner[i] = stem; G.count[i] = 1; G.gen[i] = gen; return true; }
        if (G.owner[i] !== stem) {
            if (G.gen[i] <= gen + 1) return false;
            G.owner[i] = stem; G.gen[i] = gen; G.count[i] = 1;      // a stem over another's twigs
            return true;
        }
        if (G.count[i] >= 8 && gen > 0) return false;
        if (G.count[i] < 255) G.count[i]++;
        if (gen < G.gen[i]) G.gen[i] = gen;
        return true;
    }
    // Clear the grid in a circle (a finger or a breath took the frost).
    function unclaim(G, x, y, r) {
        for (let cy = Math.floor((y - r) / G.cell); cy <= Math.floor((y + r) / G.cell); cy++) {
            for (let cx = Math.floor((x - r) / G.cell); cx <= Math.floor((x + r) / G.cell); cx++) {
                if (cx < 0 || cy < 0 || cx >= G.cols || cy >= G.rows) continue;
                const px = (cx + 0.5) * G.cell - x, py = (cy + 0.5) * G.cell - y;
                if (px * px + py * py <= r * r) { const i = cy * G.cols + cx; G.owner[i] = -1; G.count[i] = 0; G.gen[i] = 255; }
            }
        }
    }

    const BRANCH = [7, 4.5, 3];            // px between side branches, by generation (× u)
    const SHARE = [0.5, 0.42, 0.34];       // a branch's length, as a share of what its parent has left
    const SPEED = [1, 0.85, 0.7, 0.6];     // by generation

    // Grow a tip by `dist` px (base speed already applied): short steps,
    // a little wander, side branches at sixty degrees (both sides, like a
    // fern), and a stop at the pane's edge, at another crystal, or at its
    // length. Calls segment(x0, y0, x1, y1, gen) for each piece of ice.
    // Returns the new branches; sets tip.dead.
    function grow(t, dist, pane, G, rand, segment, u = 1) {
        const born = [];
        dist *= SPEED[t.gen];
        const pad = 1;
        while (dist > 0 && !t.dead) {
            const ds = Math.min(dist, 1.6 * u);
            dist -= ds;
            t.curl += (rand() - 0.5) * 0.02;
            t.curl *= 0.96;
            t.a += t.curl + (rand() - 0.5) * (t.gen ? 0.12 : 0.05);
            const nx = t.x + Math.cos(t.a) * ds, ny = t.y + Math.sin(t.a) * ds;
            if (nx < pane.x + pad || ny < pane.y + pad || nx > pane.x + pane.w - pad || ny > pane.y + pane.h - pad || !claim(G, nx, ny, t.stem, t.gen)) { t.dead = true; break; }
            // Ice is laid down a pixel or so at a time: a slow tip mustn't
            // stack a dab on the same spot every frame.
            if (t.lx === undefined) { t.lx = t.x; t.ly = t.y; }
            t.x = nx; t.y = ny;
            if ((nx - t.lx) ** 2 + (ny - t.ly) ** 2 >= (1.2 * u) ** 2) { segment(t.lx, t.ly, nx, ny, t.gen); t.lx = nx; t.ly = ny; }
            t.len += ds;
            t.since += ds;
            if (t.len >= t.max) { t.dead = true; break; }
            if (t.gen < 3 && t.since >= BRANCH[t.gen] * u * (0.7 + rand() * 0.6)) {
                t.since = 0;
                const left = t.max - t.len;
                for (const side of [-1, 1]) {
                    if (rand() < 0.15) continue;
                    const max = left * SHARE[t.gen] * (0.55 + rand() * 0.45);
                    if (max < 2.5 * u) continue;
                    born.push(tip(t.x, t.y, t.a + side * (SIXTY + (rand() - 0.5) * 0.25), max, 0, t.stem, t.gen + 1));
                }
            }
        }
        return born;
    }

    // ---- Doodles --------------------------------------------------------------------------------

    // Things drawn in the frost with a fingertip from inside: strokes
    // (polylines) and dabs (a pressed fingertip, or a paw's toe bean), in
    // -1…1. Drawn from inside, they read mirrored from out here: NOEL comes
    // out backwards.
    const circle = (cx, cy, r, n = 20, a0 = 0, a1 = Math.PI * 2) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
    const SHAPES = {
        heart: [{ stroke: Array.from({ length: 41 }, (_, i) => { const t = Math.PI * 2 * i / 40; return [Math.pow(Math.sin(t), 3) * 0.9, -(0.8 * Math.cos(t) - 0.3 * Math.cos(2 * t) - 0.12 * Math.cos(3 * t) - 0.04 * Math.cos(4 * t)) * 0.95 + 0.05]; }) }],
        star: [{ stroke: Array.from({ length: 6 }, (_, i) => { const a = -Math.PI / 2 + i * 4 * Math.PI / 5; return [Math.cos(a) * 0.9, Math.sin(a) * 0.9 + 0.05]; }) }],
        smile: [{ stroke: circle(0, 0, 0.9, 28) }, { dab: [-0.32, -0.25, 0.1] }, { dab: [0.32, -0.25, 0.1] }, { stroke: circle(0, 0.05, 0.5, 12, 0.5, Math.PI - 0.5) }],
        paw: [{ dab: [0, 0.28, 0.36] }, { dab: [-0.58, -0.18, 0.17] }, { dab: [-0.22, -0.52, 0.17] }, { dab: [0.22, -0.52, 0.17] }, { dab: [0.58, -0.18, 0.17] }],
        tree: [{ stroke: [[0, -0.95], [-0.45, -0.3], [-0.2, -0.3], [-0.7, 0.45], [0.7, 0.45], [0.2, -0.3], [0.45, -0.3], [0, -0.95]] }, { stroke: [[0, 0.45], [0, 0.85]] }],
        // N O E L, written left to right from inside, so mirrored here.
        noel: [
            { stroke: [[-0.95, 0.4], [-0.95, -0.4], [-0.65, 0.4], [-0.65, -0.4]] },
            { stroke: circle(-0.28, 0, 0.27, 16).map(([x, y]) => [x, y * 1.45]) },
            { stroke: [[0.38, -0.4], [0.12, -0.4], [0.12, 0.4], [0.38, 0.4]] }, { stroke: [[0.12, 0], [0.32, 0]] },
            { stroke: [[0.62, -0.4], [0.62, 0.4], [0.9, 0.4]] },
        ].map(p => p.stroke ? { stroke: p.stroke.map(([x, y]) => [-x, y]) } : p),
    };

    // A shape laid out for a fingertip: the points it passes, in order,
    // `step` apart (in shape units), each flagged where a stroke starts.
    function trace(shape, step = 0.05) {
        const out = [];
        for (const part of shape) {
            if (part.dab) {
                const [x, y, r] = part.dab;
                // A pressed fingertip: a small spiral that fills the dab.
                for (let k = 0; k <= 10; k++) { const a = k * 1.9, rr = r * Math.sqrt(k / 10); out.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr, lift: k === 0, dab: true }); }
                continue;
            }
            const s = part.stroke;
            out.push({ x: s[0][0], y: s[0][1], lift: true });
            for (let i = 1; i < s.length; i++) {
                const [ax, ay] = s[i - 1], [bx, by] = s[i];
                const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
                for (let k = 1; k <= n; k++) out.push({ x: ax + (bx - ax) * k / n, y: ay + (by - ay) * k / n });
            }
        }
        return out;
    }

    // Christmas Eve and Day: the doodles are all trees, stars and hearts.
    const festive = d => d.getMonth() === 11 && (d.getDate() === 24 || d.getDate() === 25);

    return { KINDS, layout, seeds, grid, claim, unclaim, grow, SHAPES, trace, festive, SIXTY };
})();
