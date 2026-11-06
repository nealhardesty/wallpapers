// Unit tests for The Last Bulb on the Strand's pure logic
// (web/wallpapers/last-bulb/last-bulb-logic.js), loaded into a Node vm as
// the stage loads it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

const WEB = resolve(import.meta.dirname, '../web');
const FILE = 'wallpapers/last-bulb/last-bulb-logic.js';
const context = vm.createContext({});
vm.runInContext(readFileSync(join(WEB, FILE), 'utf8'), context, { filename: FILE });
const B = vm.runInContext('LastBulbLogic', context);
const plain = value => JSON.parse(JSON.stringify(value));
const seeded = seed => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

test('colours: the palettes, my own (when valid), and the last bulb’s', () => {
    assert.deepEqual(plain(B.colours({ palette: 'red-green' })), ['#e0262c', '#1f9e4c']);
    assert.deepEqual(plain(B.colours({ palette: 'nonsense' })), plain(B.PALETTES.vintage));
    assert.deepEqual(plain(B.colours({ palette: 'custom', myColors: ['#123456', 'red', '#abcdef'] })), ['#123456', '#abcdef']);
    assert.deepEqual(plain(B.colours({ palette: 'custom', myColors: [] })), plain(B.PALETTES.vintage));
    const list = B.PALETTES.vintage;
    assert.equal(B.lastColour({ lastColour: 'match' }, list, 7), list[2]);
    assert.equal(B.lastColour({ lastColour: 'pink' }, list, 7), B.NAMED.pink);
});

test('an attempt flickers exactly twice, then lights or stays dark', () => {
    const rand = seeded(42);
    for (let i = 0; i < 200; i++) {
        const lights = i % 2 === 0;
        const steps = B.attempt(rand, lights);
        const last = steps[steps.length - 1];
        assert.equal(last[1], Infinity);
        assert.equal(last[0], lights ? 1 : 0);
        // The first two contacts are real flicks: short, and apart.
        const flicks = steps.slice(0, 4);
        assert.ok(flicks[0][0] > 0 && flicks[2][0] > 0 && flicks[1][0] === 0 && flicks[3][0] === 0);
        assert.ok(flicks[0][1] < 0.11 && flicks[2][1] < 0.11, 'a flick is brief');
        assert.ok(flicks[1][1] > 0.15 && flicks[3][1] > 0.25, 'with a beat between');
        if (lights) assert.equal(steps.length, 5);
    }
});

test('play: the power a script asks for over time', () => {
    const steps = [[1, 0.05], [0, 0.3], [0.6, 0.05], [0, 0.5], [1, Infinity]];
    assert.deepEqual(plain(B.play(steps, 0)), { power: 1, done: false });
    assert.deepEqual(plain(B.play(steps, 0.1)), { power: 0, done: false });
    assert.deepEqual(plain(B.play(steps, 0.37)), { power: 0.6, done: false });
    assert.deepEqual(plain(B.play(steps, 2)), { power: 1, done: true });
    assert.equal(B.play(B.quit(seeded(3)), 5).power, 0);
    assert.equal(B.play(B.dip(seeded(3)), 5).power, 1);
    assert.equal(B.play(B.outage(seeded(3)), 5).power, 0);
});

test('the filament heats faster than it cools, at any frame rate', () => {
    let a = 0, b = 0;
    a = B.filament(a, 1, 0.1);
    for (let i = 0; i < 6; i++) b = B.filament(b, 1, 0.1 / 6);
    assert.ok(Math.abs(a - b) < 1e-9, 'one big step equals six small ones');
    const heated = B.filament(0, 1, 0.05), cooled = 1 - B.filament(1, 0, 0.05);
    assert.ok(heated > cooled, `heats ${heated} vs cools ${cooled}`);
    // A 70 ms flick is a soft blink: well short of full light.
    const flick = B.light(B.filament(0, 1, 0.07));
    assert.ok(flick > 0.3 && flick < 0.9, `flick ${flick}`);
    // Dim is orange; full and off aren't.
    assert.equal(B.ember(0), 0);
    assert.ok(B.ember(1) < 0.01);
    assert.ok(B.ember(0.5) > 0.5);
});

test('layout: swags between hooks, the last bulb on a tail, mirrored', () => {
    for (const [W, H] of [[1280, 800], [412, 915], [3840, 2160]]) {
        const L = B.layout(W, H, { top: 24, size: 1, spacing: 3.6, sag: 0.5 });
        assert.ok(L.bulbs.length >= 4, `${W}x${H}: ${L.bulbs.length} bulbs`);
        for (let i = 1; i < L.hooks.length; i++) assert.ok(Math.abs(L.hooks[i] - L.hooks[i - 1] - 2 * L.s) < 1e-6);
        for (const b of L.bulbs) {
            assert.ok(b.x > -L.s && b.x < L.lastHook, 'bulbs before the last hook');
            assert.ok(b.y >= L.hookY && b.y <= L.hookY + L.sag + 1e-6, 'within the swag');
        }
        assert.ok(L.hookY > 24, 'below the inset');
        const T = B.tail(L, L.rest);
        assert.ok(T.P.y > L.hookY + L.tail * 0.8 && T.P.x > L.lastHook && T.P.x < W, 'the tail hangs below the last hook, on screen');
        assert.ok(T.Q.x < W + L.w, 'the plug about on screen');
    }
    const R = B.layout(1280, 800, {}), Lf = B.layout(1280, 800, { end: 'left' });
    assert.equal(B.mx(R, 100), 100);
    assert.equal(B.mx(Lf, 100), 1180);
    // Sag 0 is a straight wire.
    const flat = B.layout(1280, 800, { sag: 0 });
    assert.ok(flat.bulbs.every(b => Math.abs(b.y - flat.hookY) < 1e-9 && Math.abs(b.rest) < 1e-9));
});

test('Christmas Eve from five, and Christmas Day', () => {
    const at = s => new Date(s);
    assert.equal(B.christmasEve(at('2026-12-24T16:59')), false);
    assert.equal(B.christmasEve(at('2026-12-24T17:00')), true);
    assert.equal(B.christmasEve(at('2026-12-25T23:59')), true);
    assert.equal(B.christmasEve(at('2026-12-26T00:00')), false);
    assert.equal(B.christmasEve(at('2026-11-24T18:00')), false);
});

test('drafts and outages: how often', () => {
    assert.equal(B.draftEvery(0), Infinity);
    assert.ok(B.draftEvery(1) < B.draftEvery(0.3));
    assert.equal(B.OUTAGES.off, Infinity);
    assert.ok(B.OUTAGES.sometimes < B.OUTAGES.rare);
});
