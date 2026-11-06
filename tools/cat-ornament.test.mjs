// Unit tests for The Cat vs. the Ornament's pure logic
// (web/wallpapers/cat-ornament/cat-ornament-logic.js), loaded into a Node vm
// as the stage loads it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

const WEB = resolve(import.meta.dirname, '../web');
const FILE = 'wallpapers/cat-ornament/cat-ornament-logic.js';
const context = vm.createContext({});
vm.runInContext(readFileSync(join(WEB, FILE), 'utf8'), context, { filename: FILE });
const C = vm.runInContext('CatOrnamentLogic', context);
// JSON round trip: vm objects have their own prototypes, which deepEqual minds.
const plain = value => JSON.parse(JSON.stringify(value));

// A small seeded generator, so the odds are tested on many rolls.
const seeded = seed => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

test('roster: the nine cats, each named and complete', () => {
    const ids = plain(C.ROSTER.map(c => c.id));
    assert.deepEqual(ids, ['moofy', 'butters', 'waffles', 'ras', 'ibbie', 'maus', 'turkey', 'harry', 'persian']);
    const names = plain(Object.fromEntries(C.ROSTER.map(c => [c.id, c.names])));
    assert.deepEqual(names.moofy, ['Moofy']);
    assert.deepEqual(names.ras, ['Ras The Destroyer']);
    assert.deepEqual(names.maus, ['Die Fleder Maus', 'Maus']);
    assert.deepEqual(names.harry, ['Harry', 'Indiana Jones', 'Friskies']);
    assert.deepEqual(names.persian, ['Kitty Toes', 'Cat Baloo', 'Poke Paws']);
    for (const c of C.ROSTER) {
        for (const t of ['lurk', 'stare', 'trouble', 'sleep', 'lounge', 'love', 'zoom', 'play']) assert.ok(c.traits[t] >= 0 && c.traits[t] <= 1, `${c.id}.${t}`);
        assert.match(c.eyes, /^#[0-9a-f]{6}$/);
    }
    assert.ok(C.byId('turkey').heavy, 'Turkey always brings the tree down');
    assert.equal(C.byId('ibbie').traits.sleep, 1, 'Ibbie sleeps the most');
    assert.equal(C.byId('maus').traits.zoom, 1, 'Maus runs around the most');
});

test('names: Harry mostly, Die Fleder Maus mostly, the Persian evenly; a custom list replaces them', () => {
    const count = (cat, n = 6000, custom = '') => { const r = seeded(11), out = {}; for (let i = 0; i < n; i++) { const name = C.pickName(cat, custom, r); out[name] = (out[name] || 0) + 1; } return out; };
    const harry = count(C.byId('harry'));
    assert.ok(harry.Harry / 6000 > 0.62 && harry.Harry / 6000 < 0.78, `Harry ${harry.Harry}`);
    assert.ok(harry['Indiana Jones'] > 600 && harry.Friskies > 600, JSON.stringify(harry));
    const maus = count(C.byId('maus'));
    assert.ok(maus['Die Fleder Maus'] > maus.Maus * 1.6 && maus.Maus > 1000, JSON.stringify(maus));
    const persian = count(C.byId('persian'));
    for (const name of ['Kitty Toes', 'Cat Baloo', 'Poke Paws']) assert.ok(persian[name] > 1700 && persian[name] < 2300, `${name} ${persian[name]}`);
    assert.equal(C.pickName(C.byId('moofy'), '', seeded(2)), 'Moofy');
    assert.equal(C.pickName(C.byId('moofy'), ' Sir Moofington ', seeded(2)), 'Sir Moofington');
    const custom = count(C.byId('butters'), 600, 'A, B');
    assert.deepEqual(Object.keys(custom).sort(), ['A', 'B']);
});

test('cast: as many as asked, each once, only from the enabled', () => {
    const r = seeded(5);
    for (let i = 0; i < 50; i++) {
        const cast = C.cast(['moofy', 'ras', 'ibbie', 'nobody'], 3, r);
        assert.equal(cast.length, 3);
        assert.equal(new Set(cast.map(c => c.id)).size, 3);
        for (const c of cast) assert.ok(['moofy', 'ras', 'ibbie'].includes(c.id));
    }
    assert.equal(C.cast(['moofy'], 4, r).length, 1);
});

test('pendulum: a swat swings it, and the swing dies away', () => {
    const p = { theta: 0, omega: 0, length: 40 };
    C.swat(p, 1, 1);
    let peak = 0;
    for (let i = 0; i < 60; i++) { C.pendulumStep(p, 1 / 60); peak = Math.max(peak, p.theta); }
    assert.ok(peak > 0.15, `a full swat swings it ${peak.toFixed(2)} rad`);
    for (let i = 0; i < 60 * 20; i++) C.pendulumStep(p, 1 / 60);
    assert.ok(Math.abs(p.theta) < 0.01 && Math.abs(p.omega) < 0.05, `still swinging after 20 s: ${p.theta}`);
    // The tree's sway drives it.
    const q = { theta: 0, omega: 0, length: 40 };
    for (let i = 0; i < 30; i++) C.pendulumStep(q, 1 / 60, 3000);
    assert.ok(q.theta < -0.02, `the hook moving right leaves the ornament behind: ${q.theta}`);
});

test('tree: a wobble settles; past the tip it falls, lands and stays down', () => {
    const t = { phi: 0, omega: 0.6, state: 'wobble' };
    for (let i = 0; i < 60 * 6; i++) C.treeStep(t, 1 / 60, 500);
    assert.equal(t.state, 'still');
    const f = { phi: -(C.TREE.tip + 0.02), omega: -0.3, state: 'wobble' };
    let fell = false;
    for (let i = 0; i < 60 * 6 && f.state !== 'down'; i++) { C.treeStep(f, 1 / 60, 500); if (f.state === 'fall') fell = true; }
    assert.ok(fell, 'it fell');
    assert.equal(f.state, 'down');
    assert.equal(f.phi, -C.TREE.rest, 'lying on the floor on the side it went');
});

test('the director: more mischief, more escalation; no climbing when the tree can’t fall', () => {
    const rate = (cat, m, canTopple = true) => { const r = seeded(9), out = { climb: 0, knock: 0, bat: 0, settle: 0 }; for (let i = 0; i < 4000; i++) out[C.escalate(cat, m, r, canTopple)]++; return out; };
    const ras = C.byId('ras'), persian = C.byId('persian');
    const calm = rate(ras, 0), chaos = rate(ras, 1);
    assert.ok(chaos.climb > calm.climb * 2 && chaos.knock > calm.knock, `${JSON.stringify(calm)} → ${JSON.stringify(chaos)}`);
    assert.ok(rate(ras, 0.5).climb > rate(persian, 0.5).climb * 2, 'Ras climbs far more than the Persian');
    assert.equal(rate(ras, 1, false).climb, 0);
    const r = seeded(3);
    let downs = 0;
    for (let i = 0; i < 400; i++) downs += C.climbTopples(C.byId('butters'), r) ? 1 : 0;
    assert.ok(downs > 80 && downs < 320, `Butters sometimes brings it down: ${downs}/400`);
    for (let i = 0; i < 50; i++) assert.ok(C.climbTopples(C.byId('turkey'), r));
});

test('idling: by temperament', () => {
    const tally = (cat, opts) => { const r = seeded(4), out = {}; for (let i = 0; i < 3000; i++) { const k = C.idle(cat, r, opts); out[k] = (out[k] || 0) + 1; } return out; };
    const ibbie = tally(C.byId('ibbie'), { box: true }), maus = tally(C.byId('maus'), {}), turkey = tally(C.byId('turkey'), {});
    assert.ok(ibbie.sleep + (ibbie.box || 0) > maus.sleep * 4, 'Ibbie sleeps far more than Maus');
    assert.ok(maus.zoom > 500, `Maus zooms: ${maus.zoom}`);
    assert.ok(turkey.lounge > maus.lounge * 5, 'Turkey lounges');
    assert.ok(!tally(C.byId('maus'), { zoom: false }).zoom, 'no zoomies when asked not to');
    assert.ok(!tally(C.byId('ibbie'), {}).box, 'no box when it is taken');
});

test('holidays: Christmas Eve and Day', () => {
    assert.equal(C.holiday(new Date(2026, 11, 24, 20)), 'eve');
    assert.equal(C.holiday(new Date(2026, 11, 25, 8)), 'day');
    assert.equal(C.holiday(new Date(2026, 11, 26)), null);
    assert.equal(C.holiday(new Date(2026, 10, 25)), null);
});
