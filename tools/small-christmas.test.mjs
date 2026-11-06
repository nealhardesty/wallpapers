// Unit tests for A Very Small Christmas's pure logic
// (web/wallpapers/small-christmas/small-christmas-logic.js), loaded into a
// Node vm as the stage loads it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

const WEB = resolve(import.meta.dirname, '../web');
const FILE = 'wallpapers/small-christmas/small-christmas-logic.js';
const context = vm.createContext({});
vm.runInContext(readFileSync(join(WEB, FILE), 'utf8'), context, { filename: FILE });
const X = vm.runInContext('SmallXmasLogic', context);
const seeded = seed => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

test('palettes: the night in full colour, the screens in exactly four shades', () => {
    const night = X.palette('night', 'warm');
    assert.equal(night.sky, X.NIGHT.sky);
    assert.equal(JSON.stringify(night.bulbs), JSON.stringify(X.LIGHTS.warm));
    for (const name of Object.keys(X.RAMPS)) {
        const p = X.palette(name), ramp = X.RAMPS[name];
        const used = new Set(Object.values(p).flat());
        for (const c of used) assert.ok(ramp.includes(c), `${name}: ${c} is off the ramp`);
        assert.equal(p.sky, ramp[0], `${name}: the sky is darkest`);
        assert.equal(p.snow, ramp[3], `${name}: snow is lightest`);
        assert.notEqual(p.bulbs[0], p.bulbOff, `${name}: lights still blink`);
    }
});

test('blink patterns: steady is on, together is all or none, chase and twinkle mix', () => {
    const n = 12, times = Array.from({ length: 40 }, (_, i) => i * 0.13);
    for (const t of times) {
        assert.ok(Array.from({ length: n }, (_, i) => X.lit('steady', i, n, t)).every(Boolean));
        const all = Array.from({ length: n }, (_, i) => X.lit('together', i, n, t));
        assert.ok(all.every(Boolean) || all.every(v => !v));
    }
    for (const p of ['chase', 'alternate', 'twinkle']) {
        const on = times.flatMap(t => Array.from({ length: n }, (_, i) => X.lit(p, i, n, t)));
        const share = on.filter(Boolean).length / on.length;
        assert.ok(share > 0.35 && share < 0.85, `${p}: ${share} of the time on`);
    }
    // Twinkle is the same at the same moment (it's drawn, not rolled).
    assert.equal(X.lit('twinkle', 3, n, 4.2), X.lit('twinkle', 3, n, 4.2));
});

test('the oval: starts behind the tree, its length, and the way round', () => {
    const o = X.oval(20, 7);
    const back = X.along(o, 0);
    assert.ok(Math.abs(back.x) < 1e-9 && Math.abs(back.y + 7) < 1e-9, 'distance 0 is the middle of the back');
    const ramanujan = Math.PI * (3 * 27 - Math.sqrt((3 * 20 + 7) * (20 + 3 * 7)));
    assert.ok(Math.abs(o.length - ramanujan) < 0.5, `length ${o.length}`);
    assert.equal(X.along(o, 1).dir, 1, 'heading right across the back');
    const front = X.along(o, o.length / 2);
    assert.ok(front.y > 6.9 && front.dir === -1, 'and left across the front');
    const wrap = X.along(o, o.length + 3), plain = X.along(o, 3);
    assert.ok(Math.abs(wrap.x - plain.x) < 1e-9 && Math.abs(wrap.y - plain.y) < 1e-9, 'it wraps');
});

test('moving house: hops land on the spot, and the spot is somewhere new', () => {
    assert.deepEqual([...X.hops(10, 40, 7)], [18, 25, 33, 40]);
    assert.deepEqual([...X.hops(40, 38, 7)], [38]);
    assert.equal(X.hop(0).y, 0);
    assert.ok(X.hop(0.5, 4).y === -4);
    assert.equal(X.hop(0.9).squash, 1);
    const rand = seeded(5);
    for (let i = 0; i < 100; i++) {
        const now = 40 + Math.floor(rand() * 200), x = X.newSpot(280, 30, now, rand);
        assert.ok(x >= 30 && x <= 250, `in bounds: ${x}`);
        assert.ok(Math.abs(x - now) > 20, `far enough from ${now}: ${x}`);
    }
});

test('special days', () => {
    assert.equal(X.sleighNight(new Date('2026-12-24T18:00')), true);
    assert.equal(X.sleighNight(new Date('2026-12-24T12:00')), false);
    assert.equal(X.sleighNight(new Date('2026-12-25T03:00')), true);
    assert.equal(X.sleighNight(new Date('2026-12-25T09:00')), false);
    assert.equal(X.christmasDay(new Date('2026-12-25T09:00')), true);
    assert.equal(X.christmasDay(new Date('2026-12-24T23:00')), false);
});
