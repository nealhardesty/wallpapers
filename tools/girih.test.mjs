// Unit tests for Girih's strapwork generator (web/wallpapers/girih/
// girih-geometry.js), run in a Node vm: the same classic script the browser
// loads. SPEC §9 task 8.2: every base tiling, at every contact angle the
// wallpaper sweeps, gives closed cells with no gaps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

const WEB = resolve(import.meta.dirname, '../web');
const context = vm.createContext({});
vm.runInContext(readFileSync(join(WEB, 'wallpapers/girih/girih-geometry.js'), 'utf8'), context, { filename: 'girih-geometry.js' });
const { Girih } = context;

const RECT = { x0: -12, y0: -12, x1: 12, y1: 12 };
// The wallpaper sweeps about 20°–80°; sample past both ends.
const ANGLES = [];
for (let deg = 15; deg <= 85; deg += 2.5) ANGLES.push(deg);
const rad = deg => deg * Math.PI / 180;
const key = ([x, y]) => `${Math.round(x * 1e6)},${Math.round(y * 1e6)}`;
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const inside = (rect, [x, y], margin) => x > rect.x0 + margin && x < rect.x1 - margin && y > rect.y0 + margin && y < rect.y1 - margin;

test('girih: five base tilings, as planned', () => {
    assert.deepEqual([...Girih.IDS], ['4.4.4.4', '6.6.6', '4.8.8', '3.12.12', '4.6.12']);
});

for (const id of Girih.IDS) {
    const tiling = Girih.TILINGS[id];

    test(`girih ${id}: the base tiling has no gaps or overlaps`, () => {
        // The cell's tiles fill exactly one lattice cell…
        const cell = Math.abs(tiling.a[0] * tiling.b[1] - tiling.a[1] * tiling.b[0]);
        const tiles = tiling.tiles.reduce((sum, t) => sum + Girih.area(Girih.polygon(t.n, 0, 0, t.phase).vertices), 0);
        assert.ok(near(cell, tiles, 1e-9), `tiles cover ${tiles}, the cell is ${cell}`);
        // …and every edge away from the patch's rim is shared by exactly two
        // polygons, in opposite directions, with unit length.
        const polys = Girih.patch(id, RECT);
        const edges = new Map();
        for (const p of polys) {
            assert.ok(Girih.area(p.vertices) > 0, 'counter-clockwise');
            p.vertices.forEach((v, i) => {
                const w = p.vertices[(i + 1) % p.n];
                assert.ok(near(Math.hypot(w[0] - v[0], w[1] - v[1]), 1, 1e-9), 'unit edges');
                edges.set(`${key(v)}>${key(w)}`, (edges.get(`${key(v)}>${key(w)}`) || 0) + 1);
            });
        }
        let checked = 0;
        for (const p of polys) {
            p.vertices.forEach((v, i) => {
                const w = p.vertices[(i + 1) % p.n];
                if (!inside(RECT, v, 4) || !inside(RECT, w, 4)) return;
                checked++;
                assert.equal(edges.get(`${key(v)}>${key(w)}`), 1, 'one polygon per side');
                assert.equal(edges.get(`${key(w)}>${key(v)}`), 1, `edge ${key(v)}–${key(w)} has no neighbour: a gap`);
            });
        }
        assert.ok(checked > 50, `only ${checked} interior edges checked`);
    });

    test(`girih ${id}: every contact angle gives closed cells with no gaps`, () => {
        for (const deg of ANGLES) {
            const at = `${id} at ${deg}°`;
            const { polys, crossings } = Girih.build(id, rad(deg), RECT);
            for (const p of polys) {
                const h = p.hankin;
                // The star is one simple closed polygon around the centre…
                assert.ok(Girih.isSimple(h.star), `${at}: star crosses itself`);
                assert.ok(Girih.area(h.star) > 0, `${at}: star turned inside out`);
                // …each kite is a proper cell, with P inside the polygon…
                for (const kite of h.kites) assert.ok(Girih.area(kite) > 1e-9, `${at}: degenerate kite`);
                for (const point of h.points) {
                    assert.ok(Math.hypot(point[0] - p.cx, point[1] - p.cy) < p.R - 1e-9, `${at}: P outside its polygon`);
                }
                // …the two rays meeting at each P really are the rays from
                // their midpoints: ray 1 of edge i and ray 2 of edge i+1 both
                // run straight to it, so the strapwork never kinks or gaps.
                h.points.forEach((point, i) => {
                    const along = (m, ray) => {
                        const dx = point[0] - m[0], dy = point[1] - m[1], len = Math.hypot(dx, dy);
                        return near(dx / len, ray[0], 1e-9) && near(dy / len, ray[1], 1e-9);
                    };
                    assert.ok(along(h.mids[i], h.rays[i].over), `${at}: ray 1 misses its P`);
                    assert.ok(along(h.mids[(i + 1) % p.n], h.rays[(i + 1) % p.n].under), `${at}: ray 2 misses its partner's P`);
                });
                // …and star plus kites tile the polygon exactly: no gap, no overlap.
                const cells = Girih.area(h.star) + h.kites.reduce((sum, k) => sum + Girih.area(k), 0);
                assert.ok(near(cells, Girih.area(p.vertices), 1e-9), `${at}: cells cover ${cells} of ${Girih.area(p.vertices)}`);
            }

            // Around every interior vertex, the kites close up into one cell:
            // each midpoint on its rim is shared by exactly two of its kites,
            // and their corners at the vertex add up to a full turn.
            const byVertex = new Map();
            for (const p of polys) {
                p.hankin.kites.forEach(kite => {
                    if (!inside(RECT, kite[1], 4)) return;
                    const k = key(kite[1]);
                    if (!byVertex.has(k)) byVertex.set(k, []);
                    byVertex.get(k).push(kite);
                });
            }
            assert.ok(byVertex.size > 20, `${at}: only ${byVertex.size} vertices checked`);
            for (const kites of byVertex.values()) {
                const rim = new Map();
                let turn = 0;
                for (const [m0, v, m1] of kites) {
                    rim.set(key(m0), (rim.get(key(m0)) || 0) + 1);
                    rim.set(key(m1), (rim.get(key(m1)) || 0) + 1);
                    const a0 = Math.atan2(m0[1] - v[1], m0[0] - v[0]), a1 = Math.atan2(m1[1] - v[1], m1[0] - v[0]);
                    turn += ((a0 - a1) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
                }
                for (const count of rim.values()) assert.equal(count, 2, `${at}: a vertex cell is open`);
                assert.ok(near(turn, 2 * Math.PI, 1e-9), `${at}: a vertex cell turns ${turn}`);
            }

            // The strapwork has no loose ends: every interior contact point is
            // a crossing of two straight strands, with ray 1 continuing ray 1.
            const rays = new Map();
            for (const p of polys) {
                p.hankin.mids.forEach((m, i) => {
                    if (!inside(RECT, m, 4)) return;
                    if (!rays.has(key(m))) rays.set(key(m), []);
                    rays.get(key(m)).push(p.hankin.rays[i]);
                });
            }
            for (const pair of rays.values()) {
                assert.equal(pair.length, 2, `${at}: a contact point with ${pair.length} polygons`);
                const [a, b] = pair;
                assert.ok(near(a.over[0], -b.over[0], 1e-9) && near(a.over[1], -b.over[1], 1e-9), `${at}: the over strand bends at its crossing`);
                assert.ok(near(a.under[0], -b.under[0], 1e-9) && near(a.under[1], -b.under[1], 1e-9), `${at}: the under strand bends at its crossing`);
            }
            for (const c of crossings) {
                if (inside(RECT, [c.x, c.y], 4)) assert.equal(c.count, 2, `${at}: crossing shared by ${c.count}`);
                assert.ok(c.reach > 0.05, `${at}: a strand runs only ${c.reach} straight`);
            }
        }
    });
}

test('girih: the morph is continuous: a small change in angle moves P a little', () => {
    for (const id of Girih.IDS) {
        const a = Girih.build(id, rad(50), RECT), b = Girih.build(id, rad(50.5), RECT);
        a.polys.forEach((p, i) => p.hankin.points.forEach((pt, k) => {
            const q = b.polys[i].hankin.points[k];
            assert.ok(Math.hypot(pt[0] - q[0], pt[1] - q[1]) < 0.05, `${id}: P jumped`);
        }));
    }
});
