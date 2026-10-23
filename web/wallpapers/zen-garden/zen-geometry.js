// Zen Garden geometry: where the stones sit, how a rake's tines follow a
// smoothed path and bend around them, and the gardener's pattern. Pure
// functions, no DOM, so the unit tests (tools/zen-garden.test.mjs) run them
// in a Node vm. Units are CSS px.

const ZenGeometry = (() => {
    'use strict';

    // A point and unit tangent on the Catmull-Rom spline through p1..p2
    // (p0 and p3 shape it), at t in 0..1.
    function catmullRom(p0, p1, p2, p3, t) {
        const t2 = t * t, t3 = t2 * t;
        const x = 0.5 * (2 * p1.x + (p2.x - p0.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (3 * p1.x - p0.x - 3 * p2.x + p3.x) * t3);
        const y = 0.5 * (2 * p1.y + (p2.y - p0.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (3 * p1.y - p0.y - 3 * p2.y + p3.y) * t3);
        let tx = 0.5 * ((p2.x - p0.x) + 2 * (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t + 3 * (3 * p1.x - p0.x - 3 * p2.x + p3.x) * t2);
        let ty = 0.5 * ((p2.y - p0.y) + 2 * (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t + 3 * (3 * p1.y - p0.y - 3 * p2.y + p3.y) * t2);
        const length = Math.hypot(tx, ty) || 1;
        return { x, y, tx: tx / length, ty: ty / length };
    }

    // Samples about `step` apart along the spline segment from points[i] to
    // points[i + 1], ends clamped. Excludes the segment's last point, which
    // the next segment starts with.
    function splineSegment(points, i, step) {
        const at = k => points[Math.max(0, Math.min(points.length - 1, k))];
        const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
        const n = Math.max(1, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) / step));
        const out = [];
        for (let k = 0; k < n; k++) out.push(catmullRom(p0, p1, p2, p3, k / n));
        return out;
    }

    // Bend a tine's point around the stones: inside a stone's reach
    // (keep + band) a point is pushed straight out from the stone's centre,
    // distances 0..reach squeezed into keep..reach, in order. So tines flow
    // around the stone, never enter its keep-out circle and never cross,
    // and the bend doesn't depend on which way the rake is turning. Each
    // stone is { x, y, keep }.
    function deflect(x, y, stones, band) {
        for (const stone of stones) {
            const dx = x - stone.x, dy = y - stone.y;
            const reach = stone.keep + band, d = Math.hypot(dx, dy);
            if (d >= reach) continue;
            const scale = d > 1e-6 ? (stone.keep + d / reach * band) / d : 0;
            x = stone.x + (d > 1e-6 ? dx * scale : stone.keep);
            y = stone.y + dy * scale;
        }
        return { x, y };
    }

    // Three to seven stones, biggest first, each with room for its rings.
    // `rand` is a seeded generator; `unit` is sqrt(width × height); `rake`
    // is the width of one pass of the rake. Keeps clear of the bottom inset.
    function layoutStones(rand, { width, height, count, unit, rake, groove, bottom = 0 }) {
        const stones = [];
        const sizes = [];
        for (let i = 0; i < count; i++) sizes.push(unit * (i === 0 ? 0.075 + rand() * 0.015 : 0.035 + rand() * 0.035));
        sizes.sort((a, b) => b - a);
        for (let r of sizes) {
            for (let shrink = 0; shrink < 4; shrink++, r *= 0.85) {
                const keep = r * 1.12 + groove * 0.6;
                const rings = r > unit * 0.055 ? 3 : r > unit * 0.04 ? 2 : 1;
                const zone = keep + rings * rake;
                let placed = null;
                for (let attempt = 0; attempt < 160 && !placed; attempt++) {
                    const x = r * 1.6 + rand() * (width - r * 3.2);
                    const y = r * 1.6 + rand() * (height - bottom - r * 3.2);
                    // Stones prefer the thirds, away from the dead centre.
                    if (Math.abs(x - width / 2) < width * 0.08 && Math.abs(y - height / 2) < height * 0.08) continue;
                    if (stones.every(s => Math.hypot(s.x - x, s.y - y) > s.zone + zone + groove)) placed = { x, y };
                }
                if (placed) {
                    stones.push({ x: placed.x, y: placed.y, r, keep, rings, zone, angle: rand() * Math.PI, stretch: 1 + rand() * 0.3, seed: Math.floor(rand() * 1e9) });
                    break;
                }
            }
        }
        return stones;
    }

    // Straight-line samples from a to b, `step` apart, with their tangent.
    function line(ax, ay, bx, by, step) {
        const length = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(length / step));
        const tx = (bx - ax) / length, ty = (by - ay) / length;
        const out = [];
        for (let k = 0; k <= n; k++) out.push({ x: ax + (bx - ax) * k / n, y: ay + (by - ay) * k / n, tx, ty });
        return out;
    }

    // A full circle of radius r around (cx, cy), from angle `from`, running
    // a little past the start so the seam is raked over.
    function circle(cx, cy, r, from, step) {
        const n = Math.max(12, Math.ceil(2 * Math.PI * r / step));
        const out = [];
        for (let k = 0; k <= n + Math.ceil(n * 0.03); k++) {
            const a = from + 2 * Math.PI * k / n;
            out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, tx: -Math.sin(a), ty: Math.cos(a) });
        }
        return out;
    }

    // The classic pattern: straight rows across the garden, back and forth,
    // then concentric rings around each stone. Rows are clipped out of the
    // stones' ring zones when drawn; each ring keeps clear of other stones.
    function gardenPlan({ width, height, stones, rake, step }) {
        const strokes = [];
        const rows = Math.ceil(height / rake);
        const top = (height - rows * rake) / 2;
        for (let j = 0; j < rows; j++) {
            const y = top + rake * (j + 0.5);
            const pad = rake;
            strokes.push({ kind: 'row', samples: j % 2 ? line(width + pad, y, -pad, y, step) : line(-pad, y, width + pad, y, step) });
        }
        stones.forEach((stone, i) => {
            for (let ring = stone.rings - 1; ring >= 0; ring--) {
                strokes.push({ kind: 'ring', stone: i, samples: circle(stone.x, stone.y, stone.keep + rake * (ring + 0.5), (stone.seed % 628) / 100, step) });
            }
        });
        return strokes;
    }

    // Wind: every `interval` seconds the clean sand is laid over the garden at
    // this alpha, so a groove keeps 5% of its contrast after `minutes`.
    function windAlpha(minutes, interval) {
        return 1 - Math.pow(0.05, interval / (minutes * 60));
    }

    // How often the wind blows: often enough to feel continuous, rarely
    // enough that each pass is strong enough for 8-bit colour to register.
    function windInterval(minutes) {
        return Math.max(3, Math.min(30, minutes * 60 / 48));
    }

    return { catmullRom, splineSegment, deflect, layoutStones, line, circle, gardenPlan, windAlpha, windInterval };
})();

if (typeof module !== 'undefined') module.exports = ZenGeometry;
