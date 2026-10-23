// Girih geometry: Hankin's "polygons in contact" over the Archimedean
// tilings, as pure functions with no DOM, so the unit tests can run it in a
// Node vm (tools/girih.test.mjs) and Stained Glass can borrow it for its
// geometric windows (the catalog loads this file for both).
//
// Method. Every base tiling here is made of regular polygons with unit edges.
// From the midpoint M of every edge two rays go into each polygon, each at
// the contact angle θ to the edge, one leaning towards each end. The ray
// leaning towards vertex V meets its partner from the next edge on V's
// bisector, at P, a distance |MP| = ½ sin(α/2) / sin(θ + α/2) along it (α is
// the interior angle). Joining M₀ P₁ M₁ P₂ … gives a star in every polygon,
// and around every vertex V of the tiling the kites (M, V, M', P) of its
// polygons close up into a second kind of cell. Star and kites tile the
// polygon exactly, so the cells cover the plane with no gaps.
//
// The strapwork crosses itself only at the contact points: a ray continues
// straight through M into the neighbouring polygon. Calling the ray that
// leans towards the polygon's next vertex (counter-clockwise) "ray 1", ray 1
// in one polygon and ray 1 in its neighbour are the same straight line, so
// "ray 1 goes over" is one consistent rule, and along every strand the
// crossings alternate over, under, over: a true interlace.

(function (root) {
    'use strict';

    const S3 = Math.sqrt(3);
    const A8 = (1 + Math.SQRT2) / 2;      // octagon apothem
    const A12 = 1 + S3 / 2;               // dodecagon apothem
    const D46 = 2 * A12 + 1;              // 4.6.12: dodecagon to dodecagon

    // Each tiling: lattice vectors a and b, and the tiles of one lattice cell
    // ({ n sides, centre x y, phase: the first vertex's angle in degrees }).
    // `size` is the edge length per unit of the panel's Pattern Size, so every
    // family repeats at a similar scale on screen. `tone(i, j, k)` colours
    // equivalent stars in a regular repeat (a checkerboard, a 3-colouring).
    const TILINGS = {
        '4.4.4.4': {
            name: 'Squares', a: [1, 0], b: [0, 1], size: 0.46,
            tiles: [{ n: 4, x: 0.5, y: 0.5, phase: 45 }],
            tone: (i, j) => (i & 1) + 2 * (j & 1),
        },
        '6.6.6': {
            name: 'Hexagons', a: [S3, 0], b: [S3 / 2, 1.5], size: 0.4,
            tiles: [{ n: 6, x: 0, y: 0, phase: 30 }],
            tone: (i, j) => ((i - j) % 3 + 3) % 3,
        },
        '4.8.8': {
            name: 'Octagons and squares', a: [2 * A8, 0], b: [0, 2 * A8], size: 0.3,
            tiles: [{ n: 8, x: 0, y: 0, phase: 22.5 }, { n: 4, x: A8, y: A8, phase: 0 }],
            tone: (i, j, k) => k ? 0 : (i + j) & 1,
        },
        '3.12.12': {
            name: 'Dodecagons and triangles', a: [2 * A12, 0], b: [A12, A12 * S3], size: 0.22,
            tiles: [{ n: 12, x: 0, y: 0, phase: 15 }, { n: 3, x: A12, y: A12 / S3, phase: 30 }, { n: 3, x: 2 * A12, y: 2 * A12 / S3, phase: 90 }],
            tone: (i, j, k) => k ? k - 1 : ((i - j) % 3 + 3) % 3,
        },
        '4.6.12': {
            name: 'Dodecagons, hexagons and squares', a: [D46, 0], b: [D46 / 2, D46 * S3 / 2], size: 0.19,
            tiles: [
                { n: 12, x: 0, y: 0, phase: 15 },
                { n: 4, x: D46 / 2, y: 0, phase: 45 },
                { n: 4, x: D46 / 4, y: D46 * S3 / 4, phase: 15 },
                { n: 4, x: -D46 / 4, y: D46 * S3 / 4, phase: 75 },
                { n: 6, x: D46 / 2, y: D46 / (2 * S3), phase: 0 },
                { n: 6, x: D46, y: D46 / S3, phase: 0 },
            ],
            tone: (i, j, k) => k === 0 ? ((i - j) % 3 + 3) % 3 : k >= 4 ? k - 4 : 0,
        },
    };
    const IDS = Object.keys(TILINGS);

    // One regular polygon of the tiling, vertices counter-clockwise.
    function polygon(n, cx, cy, phaseDeg) {
        const R = 1 / (2 * Math.sin(Math.PI / n));
        const vertices = [];
        for (let k = 0; k < n; k++) {
            const t = (phaseDeg + k * 360 / n) * Math.PI / 180;
            vertices.push([cx + R * Math.cos(t), cy + R * Math.sin(t)]);
        }
        return { n, cx, cy, R, vertices };
    }

    // Every polygon of the tiling whose circumcircle touches the rectangle
    // [x0, x1] × [y0, y1] (in edge units).
    function patch(id, { x0, y0, x1, y1 }) {
        const t = TILINGS[id];
        const [ax, ay] = t.a, [bx, by] = t.b;
        const det = ax * by - ay * bx;
        // Lattice coordinates of the corners give the range of cells to try.
        const corners = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => [(x * by - y * bx) / det, (y * ax - x * ay) / det]);
        const span = Math.max(...t.tiles.map(tile => Math.hypot(tile.x, tile.y) + 1 / (2 * Math.sin(Math.PI / tile.n))));
        const pad = 1 + Math.ceil(span / Math.min(Math.hypot(ax, ay), Math.hypot(bx, by)));
        const iMin = Math.floor(Math.min(...corners.map(c => c[0]))) - pad, iMax = Math.ceil(Math.max(...corners.map(c => c[0]))) + pad;
        const jMin = Math.floor(Math.min(...corners.map(c => c[1]))) - pad, jMax = Math.ceil(Math.max(...corners.map(c => c[1]))) + pad;
        const polys = [];
        for (let j = jMin; j <= jMax; j++) {
            for (let i = iMin; i <= iMax; i++) {
                t.tiles.forEach((tile, k) => {
                    const cx = i * ax + j * bx + tile.x, cy = i * ay + j * by + tile.y;
                    const R = 1 / (2 * Math.sin(Math.PI / tile.n));
                    if (cx + R < x0 || cx - R > x1 || cy + R < y0 || cy - R > y1) return;
                    const p = polygon(tile.n, cx, cy, tile.phase);
                    p.kind = k;
                    p.tone = t.tone(i, j, k);
                    polys.push(p);
                });
            }
        }
        return polys;
    }

    // Hankin's construction in one polygon at contact angle θ (radians).
    //   mids[i]   midpoint of edge i (vertex i to vertex i+1)
    //   points[i] P for vertex i+1, where the rays from edges i and i+1 meet
    //   star      M₀ P₀ M₁ P₁ …, a simple polygon around the centre
    //   kites[i]  M_i, V_{i+1}, M_{i+1}, P_i: the corner the star leaves
    //   rays[i]   unit directions of ray 1 (over) and ray 2 (under) at M_i
    function hankin(poly, theta) {
        const { n, vertices: V } = poly;
        const alpha = Math.PI - 2 * Math.PI / n;
        const mids = [], dirs = [], rays = [];
        for (let i = 0; i < n; i++) {
            const [x0, y0] = V[i], [x1, y1] = V[(i + 1) % n];
            const len = Math.hypot(x1 - x0, y1 - y0);
            const dx = (x1 - x0) / len, dy = (y1 - y0) / len;
            const nx = -dy, ny = dx;   // inward, for counter-clockwise vertices
            mids.push([(x0 + x1) / 2, (y0 + y1) / 2]);
            dirs.push(len);
            const c = Math.cos(theta), s = Math.sin(theta);
            rays.push({ over: [c * dx + s * nx, c * dy + s * ny], under: [-c * dx + s * nx, -c * dy + s * ny] });
        }
        const points = [], reach = [];
        for (let i = 0; i < n; i++) {
            const mp = (dirs[i] / 2) * Math.sin(alpha / 2) / Math.sin(theta + alpha / 2);
            reach.push(mp);
            const [mx, my] = mids[i], [rx, ry] = rays[i].over;
            points.push([mx + rx * mp, my + ry * mp]);
        }
        const star = [];
        const kites = [];
        for (let i = 0; i < n; i++) {
            star.push(mids[i], points[i]);
            kites.push([mids[i], V[(i + 1) % n], mids[(i + 1) % n], points[i]]);
        }
        return { mids, points, star, kites, rays, reach };
    }

    // The whole pattern over a rectangle: each polygon with its Hankin
    // figure, plus the crossings (every contact point once, with the
    // over-strand's direction and how far it runs straight either side).
    function build(id, theta, rect) {
        const polys = patch(id, rect);
        const crossings = new Map();
        for (const poly of polys) {
            poly.hankin = hankin(poly, theta);
            poly.hankin.mids.forEach(([x, y], i) => {
                const key = `${Math.round(x * 1e4)},${Math.round(y * 1e4)}`;
                const seen = crossings.get(key);
                const reach = poly.hankin.reach[i];
                if (seen) seen.reach = Math.min(seen.reach, reach), seen.count++;
                else crossings.set(key, { x, y, dir: poly.hankin.rays[i].over, reach, count: 1 });
            });
        }
        return { id, theta, polys, crossings: [...crossings.values()] };
    }

    // ---- Small geometry helpers, shared with the tests and Stained Glass ----

    function area(points) {
        let sum = 0;
        for (let i = 0; i < points.length; i++) {
            const [x0, y0] = points[i], [x1, y1] = points[(i + 1) % points.length];
            sum += x0 * y1 - x1 * y0;
        }
        return sum / 2;
    }

    // Do segments ab and cd cross at a point inside both (not at an end)?
    function segmentsCross(a, b, c, d) {
        const cross = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
        const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
        const eps = 1e-12;
        return ((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) && ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps));
    }

    function isSimple(points) {
        const n = points.length;
        for (let i = 0; i < n; i++) {
            for (let j = i + 2; j < n; j++) {
                if (i === 0 && j === n - 1) continue;
                if (segmentsCross(points[i], points[(i + 1) % n], points[j], points[(j + 1) % n])) return false;
            }
        }
        return true;
    }

    root.Girih = { TILINGS, IDS, polygon, patch, hankin, build, area, isSimple, segmentsCross };
})(globalThis);
