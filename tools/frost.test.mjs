// Unit tests for Frost on the Glass's pure logic
// (web/wallpapers/frost/frost-logic.js), loaded into a Node vm as the
// stage loads it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

const WEB = resolve(import.meta.dirname, '../web');
const FILE = 'wallpapers/frost/frost-logic.js';
const context = vm.createContext({});
vm.runInContext(readFileSync(join(WEB, FILE), 'utf8'), context, { filename: FILE });
const F = vm.runInContext('FrostLogic', context);
const seeded = seed => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const inside = (p, x, y) => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h;

test('the window: panes by kind, turned for portrait, above the inset', () => {
    for (const [kind, n] of [['single', 1], ['two', 2], ['four', 4], ['six', 6]]) {
        const L = F.layout(1280, 800, { kind, insets: { top: 0, right: 0, bottom: 48, left: 0 } });
        assert.equal(L.panes.length, n, kind);
        for (const p of L.panes) {
            assert.ok(p.w > 100 && p.h > 100, `${kind}: a pane ${p.w}×${p.h}`);
            assert.ok(p.y + p.h <= 800 - 48 - L.sill + 1e-6, 'the glass ends at the sill, above the inset');
        }
    }
    const wide = F.layout(1280, 800, { kind: 'six' }), tall = F.layout(412, 915, { kind: 'six' });
    assert.equal(wide.cols, 3); assert.equal(tall.cols, 2);
});

test('seeds: at the edges and corners of their pane, corners first', () => {
    const pane = { x: 20, y: 20, w: 600, h: 360 };
    const { tips, stem } = F.seeds(pane, seeded(9), { u: 1, coverage: 0.55 });
    assert.ok(tips.length > 20, `${tips.length} seeds`);
    assert.equal(stem, tips.length, 'one stem each');
    for (const t of tips) {
        assert.ok(inside(pane, t.x, t.y), 'inside the pane');
        assert.ok(t.delay >= 0 && t.delay <= 0.51, 'starts within the first half of the growing');
        assert.ok(t.max > 0);
    }
    const corner = tips.filter(t => Math.min(Math.abs(t.x - pane.x), Math.abs(t.x - pane.x - pane.w)) < 3 && Math.min(Math.abs(t.y - pane.y), Math.abs(t.y - pane.y - pane.h)) < 3);
    assert.ok(corner.length >= 8, `${corner.length} corner stems`);
    assert.ok(corner.every(t => t.delay <= 0.03), 'corners start at once');
    assert.ok(Math.max(...corner.map(t => t.max)) > Math.max(...tips.filter(t => !corner.includes(t)).map(t => t.max)) * 0.9, 'corners reach furthest');
});

test('the grid: a stem runs through a neighbour’s twigs, a twig stops at anything', () => {
    const G = F.grid(100, 100, 5);
    assert.equal(F.claim(G, 10, 10, 1, 0), true);
    assert.equal(F.claim(G, 11, 11, 1, 1), true, 'its own branch');
    assert.equal(F.claim(G, 12, 12, 2, 0), false, 'another stem’s stem blocks a stem');
    assert.equal(F.claim(G, 50, 50, 3, 3), true);
    assert.equal(F.claim(G, 51, 51, 4, 0), true, 'a stem over another’s twig');
    assert.equal(F.claim(G, 52, 52, 3, 3), false, 'and the twig is stopped there now');
    F.unclaim(G, 10, 10, 6);
    assert.equal(F.claim(G, 12, 12, 2, 0), true, 'cleared by a finger');
    assert.equal(F.claim(G, -50, 10, 1, 0), false, 'off the glass');
});

test('growth: inside the pane, side branches at sixty degrees, done at full length', () => {
    const pane = { x: 0, y: 0, w: 400, h: 300 };
    const G = F.grid(400, 300, 4), rand = seeded(3);
    let tips = [{ x: 2, y: 150, a: 0, gen: 0, len: 0, max: 200, delay: 0, stem: 0, since: 0, curl: 0 }];
    const segs = [], angles = [];
    for (let step = 0; step < 400 && tips.length; step++) {
        const born = [];
        for (const t of tips) for (const k of F.grow(t, 2, pane, G, rand, (x0, y0, x1, y1, gen) => segs.push({ x0, y0, x1, y1, gen }), 1)) { angles.push(Math.abs(k.a - t.a)); born.push(k); }
        tips = tips.filter(t => !t.dead).concat(born);
    }
    assert.equal(tips.length, 0, 'it all stops');
    assert.ok(segs.length > 100, `${segs.length} pieces of ice`);
    assert.ok(segs.every(s => inside(pane, s.x1, s.y1)), 'all on the glass');
    assert.ok(segs.some(s => s.gen === 3), 'down to the fourth generation');
    const off = angles.map(a => Math.abs(a - F.SIXTY));
    assert.ok(off.filter(d => d < 0.3).length / off.length > 0.9, 'branches leave at about sixty degrees');
    assert.ok(segs.every(s => Math.hypot(s.x1 - s.x0, s.y1 - s.y0) >= 1.2 - 1e-9), 'no dabs stacked on one spot');
});

test('doodles: every shape traces, NOEL reads backwards from outside', () => {
    for (const [name, shape] of Object.entries(F.SHAPES)) {
        const pts = F.trace(shape, 0.05);
        assert.ok(pts.length > 10, name);
        assert.ok(pts[0].lift, `${name} starts with a touch`);
        assert.ok(pts.every(p => Math.abs(p.x) <= 1.05 && Math.abs(p.y) <= 1.05), `${name} within its box`);
    }
    const noel = F.trace(F.SHAPES.noel);
    assert.ok(noel[0].x > 0.5, 'the N, written first, is on the right from out here');
    assert.ok(F.trace(F.SHAPES.paw).filter(p => p.lift).length === 5, 'a pad and four toe beans');
});

test('festive on Christmas Eve and Day only', () => {
    assert.equal(F.festive(new Date('2026-12-24T09:00')), true);
    assert.equal(F.festive(new Date('2026-12-25T23:00')), true);
    assert.equal(F.festive(new Date('2026-12-23T23:00')), false);
    assert.equal(F.festive(new Date('2026-11-24T12:00')), false);
});
