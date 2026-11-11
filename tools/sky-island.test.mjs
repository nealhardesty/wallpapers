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

// Every tier is a slab whose front is below its back and whose cliff foot
// is where the next tier starts; the water runs from the spring at the top
// to the cascade off the bottom at one x; every house stands on its street
// inside its tier and clear of every other house, the pond and the lake;
// the stairs join the tiers; the trees and fields keep off the houses;
// every spot is reachable from the square by straight legs; and the same
// seed gives the same island.
test('layouts fit together, for many seeds, landscape and portrait', () => {
    const rectOf = h => ({ x: h.x, y: h.y, w: h.w, h: h.h });
    for (let seed = 1; seed <= 120; seed++) {
        for (const portrait of [false, true]) {
            const w = portrait ? 300 + (seed % 5) * 30 : 420 + (seed % 7) * 40;
            const I = L.layout(seed, { w, portrait, houses: 4 + (seed % 9), forest: (seed % 3), fields: true });
            assert.equal(I.tiers.length, 3);
            for (const t of I.tiers) {
                const up = I.tiers[t.k - 1];
                for (let x = t.x0; x <= t.x1; x++) {
                    assert.ok(t.front[x] > t.back[x], `seed ${seed}: tier ${t.k} front above back at ${x}`);
                    assert.ok(t.foot[x] >= t.front[x], `seed ${seed}: tier ${t.k} foot above its front at ${x}`);
                    if (up && x >= up.x0 && x <= up.x1) assert.ok(t.back[x] > up.foot[x], `seed ${seed}: tier ${t.k} under tier ${up.k}'s cliff at ${x}`);
                }
            }
            for (let x = 0; x <= I.w; x++) assert.ok(I.bottom[x] >= I.tiers[2].front[x] && !Number.isNaN(I.bottom[x]), `seed ${seed}: the underside above the ground at ${x}`);
            // The water: the spring spills into the first fall, the pond into the second, the lake off the edge, all at fallX.
            assert.equal(I.falls.length, 3);
            for (const f of I.falls) { assert.equal(f.x, I.fallX); assert.ok(f.bottom > f.top, `seed ${seed}: a fall that goes up`); }
            assert.equal(I.spring.y + I.spring.ry, I.tiers[0].front[I.fallX]);
            assert.equal(I.pond.y - I.pond.ry, I.tiers[0].foot[I.fallX] + 1);
            assert.equal(I.lake.y - I.lake.ry, I.tiers[1].foot[I.fallX] + 1);
            assert.ok(I.lake.x - I.lake.rx > 0 && I.lake.x + I.lake.rx < I.w, `seed ${seed}: the lake off the island`);
            assert.ok(I.houses.length >= 3, `seed ${seed}: only ${I.houses.length} houses`);
            const streetYs = I.streets.map(s => s.y);
            for (const h of I.houses) {
                assert.ok(streetYs.includes(h.base + 1), `seed ${seed}: house ${h.id} not on a street`);
                const t = I.tiers[h.tier];
                assert.ok(h.x >= t.x0 && h.x + h.w <= t.x1, `seed ${seed}: house ${h.id} off its tier`);
                const mid = Math.round(h.x + h.w / 2);
                assert.ok(h.base < t.front[mid] && h.base - 6 > t.back[mid], `seed ${seed}: house ${h.id} over an edge`);
                for (const o of I.houses) if (o !== h && o.row === h.row) assert.ok(!L.overlap(rectOf(h), rectOf(o), 0), `seed ${seed}: houses ${h.id} and ${o.id} overlap`);
                if (h.tier === 1) assert.ok(!(h.x + h.w > I.pond.x - I.pond.rx && h.x < I.pond.x + I.pond.rx), `seed ${seed}: house ${h.id} in the pond`);
                if (h.tier === 2) assert.ok(!(h.x + h.w > I.lake.x - I.lake.rx && h.x < I.lake.x + I.lake.rx), `seed ${seed}: house ${h.id} in the lake`);
            }
            assert.ok(I.houses.some(h => h.kind === 'chapel'), `seed ${seed}: no chapel`);
            assert.ok(I.houses.some(h => h.kind === 'barn') && I.fields.length >= 1, `seed ${seed}: no farm`);
            // The stairs: each from a tier's front edge to its foot, where the streets below and above can be reached.
            for (const st of I.stairs) { const t = I.tiers[st.tier]; assert.equal(st.top, t.front[st.x]); assert.equal(st.bottom, t.foot[st.x]); assert.ok(Math.abs(st.x - I.fallX) > 6, `seed ${seed}: stairs in the water`); }
            same(I.gaps[1], [I.stairs[0].x]); same(I.gaps[3], [I.stairs[1].x]);
            assert.ok(I.gaps[2].length >= 1);
            for (const f of I.fields) {
                assert.ok(!I.houses.some(h => L.overlap(f, rectOf(h), 2)), `seed ${seed}: a field on a house`);
                assert.ok(!I.streets.some(s => s.tier === 2 && s.y >= f.y - 1 && s.y <= f.y + f.h + 1), `seed ${seed}: a field across the street`);
            }
            for (const t of I.trees) {
                assert.ok(!I.houses.some(h => L.overlap({ x: t.x - 4, y: t.y - 2, w: 8, h: 3 }, rectOf(h), 1)), `seed ${seed}: a tree in a house`);
                const tier = I.tiers[t.tier];
                assert.ok(t.y > tier.back[t.x] && t.y < tier.front[t.x], `seed ${seed}: a tree off its tier`);
            }
            assert.ok(I.trees.length >= 8, `seed ${seed}: only ${I.trees.length} trees`);
            for (const [name, s] of Object.entries(I.spots)) {
                assert.ok(s.x >= 0 && s.x <= I.w && s.tier >= 0 && s.tier <= 2, `seed ${seed}: spot ${name} off the island (${s.x}, ${s.y})`);
                const r = L.route(I.spots.square, s, I);
                let last = I.spots.square;
                for (const p of r) { assert.ok(p.x === last.x || p.y === last.y, `seed ${seed}: a diagonal leg to ${name}`); last = p; }
                assert.ok(r.length >= 1 && r.at(-1).x === s.x && r.at(-1).y === s.y, `seed ${seed}: no route to ${name}`);
                // Between tiers, the way is the stairs.
                if (s.tier !== 1) assert.ok(r.some(p => p.x === I.stairs[s.tier === 0 ? 0 : 1].x), `seed ${seed}: the way to ${name} skips the stairs`);
                // Along the village's front street, never through the pond but over the bridge.
                for (const p of r) if (p.y === I.streets[1].y) assert.ok(Math.abs(p.x - I.pond.x) > I.pond.rx + 2, `seed ${seed}: the way to ${name} wades the pond on the back street`);
            }
            assert.ok(L.tierAt(I, I.spots.square.x, I.spots.square.y) === 1 && L.tierAt(I, I.tower.x, I.tower.base) === 0 && L.tierAt(I, I.spots.field.x, I.spots.field.y) === 2);
            assert.equal(L.tierAt(I, I.fallX, I.tiers[0].foot[I.fallX] - 2), 0);
            assert.ok(I.lamps.length >= 2, `seed ${seed}: ${I.lamps.length} lamps`);
            assert.ok(I.cracks.length >= 3 && I.roots.length >= 3 && I.fragments.length >= 4);
            const again = L.layout(seed, { w, portrait, houses: 4 + (seed % 9), forest: (seed % 3), fields: true });
            assert.equal(JSON.stringify(again), JSON.stringify(I), `seed ${seed}: not reproducible`);
        }
    }
    const a = L.layout(1, { w: 500, houses: 8 }), b = L.layout(2, { w: 500, houses: 8 });
    assert.notEqual(a.name, b.name);
    assert.notEqual(JSON.stringify(a.houses), JSON.stringify(b.houses));
});

test('routes go by the streets of a tier, cross between them through gaps, and between tiers by the stairs', () => {
    const I = { streets: [{ tier: 0, y: 10, l: 0, r: 100 }, { tier: 1, y: 40, l: 0, r: 100 }, { tier: 1, y: 60, l: 0, r: 100 }, { tier: 2, y: 90, l: 0, r: 100 }], gaps: [[], [80], [-3, 30, 70, 103], [20]], tiers: [] };
    // Along the village's streets, through the gap nearest the target.
    same(L.route({ x: 5, y: 40, tier: 1 }, { x: 60, y: 66, tier: 1 }, I), [{ x: 70, y: 40 }, { x: 70, y: 60 }, { x: 60, y: 60 }, { x: 60, y: 66 }]);
    same(L.route({ x: 5, y: 42, tier: 1 }, { x: 40, y: 38, tier: 1 }, I), [{ x: 5, y: 40 }, { x: 40, y: 40 }, { x: 40, y: 38 }]);
    // Down from the top: the first stairs, the back street, a gap, the front street, the second stairs, the lower street.
    same(L.route({ x: 50, y: 8, tier: 0 }, { x: 60, y: 95, tier: 2 }, I), [{ x: 50, y: 10 }, { x: 80, y: 10 }, { x: 80, y: 40 }, { x: 70, y: 40 }, { x: 70, y: 60 }, { x: 20, y: 60 }, { x: 20, y: 90 }, { x: 60, y: 90 }, { x: 60, y: 95 }]);
    // And back up.
    same(L.route({ x: 60, y: 95, tier: 2 }, { x: 50, y: 8, tier: 0 }, I), [{ x: 60, y: 90 }, { x: 20, y: 90 }, { x: 20, y: 60 }, { x: 30, y: 60 }, { x: 30, y: 40 }, { x: 80, y: 40 }, { x: 80, y: 10 }, { x: 50, y: 10 }, { x: 50, y: 8 }]);
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
