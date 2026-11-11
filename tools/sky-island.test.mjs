// Unit tests for Sky Island's pure logic
// (web/wallpapers/sky-island/sky-island-logic.js), loaded into a Node vm as
// the stage loads it: the calendar, the names, and the island layouts from
// many seeds, which must always fit together.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

const WEB = resolve(import.meta.dirname, '../web');
const FILE = 'wallpapers/sky-island/sky-island-logic.js';
const context = vm.createContext({});
vm.runInContext(readFileSync(join(WEB, FILE), 'utf8'), context, { filename: FILE });
const L = vm.runInContext('SkyIslandLogic', context);
// Objects from the vm have their own prototypes, so compare by value.
const same = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b));

test('the seeded random repeats itself, and differs by seed', () => {
    const a = L.rng(42), b = L.rng(42), c = L.rng(43);
    const sa = Array.from({ length: 20 }, () => a()), sb = Array.from({ length: 20 }, () => b()), sc = Array.from({ length: 20 }, () => c());
    same(sa, sb);
    assert.notDeepEqual(sa, sc);
    for (const v of sa) assert.ok(v >= 0 && v < 1);
    const r = L.rng(7);
    for (let i = 0; i < 200; i++) { const n = r.int(2, 5); assert.ok(n >= 2 && n <= 5 && Number.isInteger(n)); }
});

test('seasons by month; Easter and Thanksgiving land on their Sundays and Thursdays', () => {
    assert.equal(L.seasonOf(new Date(2026, 0, 15)), 'winter');
    assert.equal(L.seasonOf(new Date(2026, 3, 15)), 'spring');
    assert.equal(L.seasonOf(new Date(2026, 6, 15)), 'summer');
    assert.equal(L.seasonOf(new Date(2026, 9, 15)), 'autumn');
    assert.equal(L.seasonOf(new Date(2026, 11, 15)), 'winter');
    assert.equal(L.easter(2026).toDateString(), new Date(2026, 3, 5).toDateString());
    assert.equal(L.easter(2027).toDateString(), new Date(2027, 2, 28).toDateString());
    assert.equal(L.easter(2024).toDateString(), new Date(2024, 2, 31).toDateString());
    assert.equal(L.thanksgiving(2026).toDateString(), new Date(2026, 10, 26).toDateString());
    assert.equal(L.thanksgiving(2025).toDateString(), new Date(2025, 10, 27).toDateString());
});

test('holidays: the run-up and the day, eves, and the owner’s own dates win', () => {
    const at = (y, m, d, special) => L.holidayOf(new Date(y, m - 1, d, 12), special);
    assert.equal(at(2026, 6, 10), null);
    assert.equal(at(2026, 10, 23), null);
    assert.equal(at(2026, 10, 24).id, 'halloween');
    same([at(2026, 10, 31).id, at(2026, 10, 31).day], ['halloween', true]);
    same([at(2026, 11, 20).id, at(2026, 11, 20).day], ['thanksgiving', false]);
    same([at(2026, 11, 26).id, at(2026, 11, 26).day], ['thanksgiving', true]);
    assert.equal(at(2026, 11, 27), null);
    same([at(2026, 12, 1).id, at(2026, 12, 1).day, at(2026, 12, 1).eve], ['christmas', false, false]);
    same([at(2026, 12, 24).eve, at(2026, 12, 25).day], [true, true]);
    assert.equal(at(2026, 12, 28), null);
    same([at(2026, 12, 31).id, at(2026, 12, 31).eve, at(2027, 1, 1).day], ['newyear', true, true]);
    same([at(2026, 2, 12).id, at(2026, 2, 14).day], ['valentines', true]);
    same([at(2026, 3, 17).id, at(2026, 3, 17).day], ['stpatricks', true]);
    same([at(2026, 3, 29).id, at(2026, 4, 5).day, at(2026, 4, 6)], ['easter', true, null]);
    same([at(2026, 7, 2).id, at(2026, 7, 4).day, at(2026, 7, 5)], ['july4', true, null]);
    const special = L.parseSpecialDates('06-10 Moofy’s birthday\n12/25 Not a party name used\n13-40 nonsense\n 7-4 ');
    assert.equal(special.length, 3);
    same(special[0], { month: 6, day: 10, name: 'Moofy’s birthday' });
    same(special[2], { month: 7, day: 4, name: 'A party' });
    same([at(2026, 6, 10, special).id, at(2026, 6, 10, special).name], ['party', 'Moofy’s birthday']);
    assert.equal(at(2026, 12, 25, special).id, 'party');
    assert.equal(at(2026, 7, 4, special).name, 'A party');
});

test('names read as places, and differ by seed', () => {
    const names = new Set();
    for (let s = 1; s <= 40; s++) names.add(L.islandName(L.rng(s)));
    assert.ok(names.size > 30);
    for (const n of names) assert.match(n, /^[A-Z][a-z]+ (Isle|Island|Rock|Aerie|Perch)$/);
    assert.match(L.visitorName(L.rng(3)), /^[A-Z][a-z]+ [A-Z][a-z]+$/);
});

// Every house stands on its street inside the plateau and clear of every
// other house, the lake and the mountain; the lake reaches the front lip,
// where the waterfall is; the trees and fields keep off the houses; the
// spots are reachable; and the same seed gives the same island.
test('layouts fit together, for many seeds, landscape and portrait', () => {
    const rectOf = h => ({ x: h.x, y: h.y, w: h.w, h: h.h });
    for (let seed = 1; seed <= 120; seed++) {
        for (const portrait of [false, true]) {
            const w = portrait ? 180 + (seed % 5) * 20 : 300 + (seed % 7) * 50;
            const I = L.layout(seed, { w, portrait, houses: 4 + (seed % 9), forest: (seed % 3), fields: true });
            assert.equal(I.back.length, I.w + 1);
            for (let x = 0; x <= I.w; x++) {
                assert.ok(I.front[x] > I.back[x], `seed ${seed}: front above back at ${x}`);
                assert.ok(I.bottom[x] >= I.front[x], `seed ${seed}: cliff above the front at ${x}`);
                assert.ok(I.front[x] <= I.depth + 2 && I.back[x] >= -2, `seed ${seed}: edge out of the plateau at ${x}`);
            }
            assert.ok(I.houses.length >= 3, `seed ${seed}: only ${I.houses.length} houses`);
            for (const h of I.houses) {
                assert.ok(I.streets.includes(h.base + 1), `seed ${seed}: house ${h.id} not on a street`);
                assert.ok(h.x >= 0 && h.x + h.w <= I.w, `seed ${seed}: house ${h.id} off the island`);
                const mid = Math.round(h.x + h.w / 2);
                assert.ok(h.base < I.front[mid], `seed ${seed}: house ${h.id} over the front lip`);
                // Rows stack (a phone's three rows overlap on purpose); along a row, never.
                for (const o of I.houses) if (o !== h && o.row === h.row) assert.ok(!L.overlap(rectOf(h), rectOf(o), 0), `seed ${seed}: houses ${h.id} and ${o.id} overlap`);
                assert.ok(!(h.x + h.w > I.lake.x - I.lake.rx && h.x < I.lake.x + I.lake.rx && h.base >= I.lake.y - I.lake.ry), `seed ${seed}: house ${h.id} in the lake`);
            }
            assert.ok(I.houses.some(h => h.kind === 'chapel'), `seed ${seed}: no chapel`);
            // The lake touches the front edge, and the waterfall falls from it to the cliff's foot.
            assert.equal(I.lake.y + I.lake.ry - 1, I.front[I.lake.x]);
            assert.equal(I.fall.x, I.lake.x);
            assert.ok(I.fall.bottom > I.fall.top);
            assert.ok(I.lake.x - I.lake.rx > 0 && I.lake.x + I.lake.rx < I.w);
            // The mountain's feet are at the back; the town is between the lake and the mountain.
            assert.ok(I.mountain.y < I.depth * 0.35);
            for (const f of I.fields) {
                assert.ok(!I.houses.some(h => L.overlap(f, rectOf(h), 2)), `seed ${seed}: a field on a house`);
                assert.ok(!I.streets.some(s => s >= f.y - 1 && s <= f.y + f.h + 1), `seed ${seed}: a field across a street`);
            }
            for (const t of I.trees) {
                assert.ok(!I.houses.some(h => L.overlap({ x: t.x - 2, y: t.y - 1, w: 5, h: 2 }, rectOf(h), 1)), `seed ${seed}: a tree in a house`);
                assert.ok(t.y > I.back[t.x] && t.y < I.front[t.x], `seed ${seed}: a tree off the plateau`);
            }
            assert.ok(I.trees.length >= 10, `seed ${seed}: only ${I.trees.length} trees`);
            for (const [name, s] of Object.entries(I.spots)) {
                assert.ok(s.x >= 0 && s.x <= I.w && s.y >= -1 && s.y <= I.depth + 1, `seed ${seed}: spot ${name} off the island (${s.x}, ${s.y})`);
                const r = L.route(I.spots.square, s, I);
                // Every leg is straight, and no leg between two streets passes through a house.
                let last = I.spots.square;
                for (const p of r) {
                    assert.ok(p.x === last.x || p.y === last.y, `seed ${seed}: a diagonal leg to ${name}`);
                    if (p.x === last.x && !I.streets.includes(p.y) === false && I.streets.includes(last.y)) {
                        const lo = Math.min(p.y, last.y), hi = Math.max(p.y, last.y);
                        for (const h of I.houses) assert.ok(!(p.x >= h.x && p.x <= h.x + h.w && h.base > lo && h.base <= hi && h.y < hi), `seed ${seed}: the way to ${name} goes through house ${h.id}`);
                    }
                    if (p.y === last.y && I.streets.includes(p.y)) {
                        // Along a street: never across the lake.
                        const lo = Math.min(p.x, last.x), hi = Math.max(p.x, last.x);
                        assert.ok(!(hi >= I.lake.x - I.lake.rx && lo <= I.lake.x + I.lake.rx && p.y >= I.lake.y - I.lake.ry), `seed ${seed}: the way to ${name} wades the lake`);
                    }
                    last = p;
                }
                assert.ok(r.length >= 1 && r.at(-1).x === s.x && r.at(-1).y === s.y, `seed ${seed}: no route to ${name}`);
            }
            assert.ok(I.lamps.length >= 2, `seed ${seed}: ${I.lamps.length} lamps`);
            assert.ok(I.crystals.length >= 2 && I.roots.length >= 3);
            const again = L.layout(seed, { w, portrait, houses: 4 + (seed % 9), forest: (seed % 3), fields: true });
            assert.equal(JSON.stringify(again), JSON.stringify(I), `seed ${seed}: not reproducible`);
        }
    }
    const a = L.layout(1, { w: 500, houses: 8 }), b = L.layout(2, { w: 500, houses: 8 });
    assert.notEqual(a.name, b.name);
    assert.notEqual(JSON.stringify(a.houses), JSON.stringify(b.houses));
});

test('routes go by the streets, cross between them through gaps, and reach the outskirts by the back street', () => {
    const I = { streets: [10, 24], gaps: [[], [-3, 30, 70, 103]], town: { l: 0, r: 100 } };
    same(L.route({ x: 5, y: 10 }, { x: 60, y: 30 }, I), [{ x: 70, y: 10 }, { x: 70, y: 24 }, { x: 60, y: 24 }, { x: 60, y: 30 }]);
    same(L.route({ x: 5, y: 12 }, { x: 40, y: 9 }, I), [{ x: 5, y: 10 }, { x: 40, y: 10 }, { x: 40, y: 9 }]);
    same(L.route({ x: 50, y: 28 }, { x: 130, y: 20 }, I), [{ x: 50, y: 24 }, { x: 103, y: 24 }, { x: 103, y: 10 }, { x: 130, y: 10 }, { x: 130, y: 20 }]);
    same(L.route({ x: 130, y: 20 }, { x: 50, y: 28 }, I), [{ x: 130, y: 10 }, { x: 30, y: 10 }, { x: 30, y: 24 }, { x: 50, y: 24 }, { x: 50, y: 28 }]);
});

test('the day’s plan: everyone sleeps at night but the watch; lunch in the square; a party in the evening', () => {
    for (const role of L.ROLES) {
        assert.equal(L.planFor(role, 2).what, role === 'watch' ? 'patrol' : 'sleep');
        if (role !== 'watch') assert.equal(L.planFor(role, 12.5).spot, 'square');
        assert.equal(L.planFor(role, 18, { id: 'party' }).spot, 'square');
    }
    assert.equal(L.planFor('fisher', 10).what, 'fish');
    assert.equal(L.planFor('baker', 5).spot, 'bakery');
    assert.equal(L.planFor('farmer', 10).spot, 'field');
    assert.equal(L.planFor('roofer', 11).what, 'roof');
});
