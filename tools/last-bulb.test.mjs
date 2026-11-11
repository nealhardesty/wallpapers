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
        for (let i = 1; i < L.hooks.length; i++) assert.ok(Math.abs(L.hooks[i].x - L.hooks[i - 1].x - 2 * L.s) < 0.5 * L.s, 'a hook about every two bulbs');
        for (const b of L.bulbs) {
            assert.ok(b.x > -L.s && b.x < L.lastHook, 'bulbs before the last hook');
            assert.ok(b.y >= L.railY && b.y <= L.railY + L.sag + 1e-6, 'within the swag');
            assert.ok(b.u >= 0 && b.u <= 1);
        }
        assert.ok(L.railY > 24, 'below the inset');
        assert.equal(L.hookY, L.railY);
        const T = B.tail(L, L.rest);
        assert.ok(T.P.y > L.hookY + L.tail * 0.8 && T.P.x > L.lastHook && T.P.x < W, 'the tail hangs below the last hook, on screen');
        assert.ok(T.Q.x < W + L.w, 'the plug about on screen');
    }
    const R = B.layout(1280, 800, {}), Lf = B.layout(1280, 800, { end: 'left' });
    assert.equal(B.mx(R, 100), 100);
    assert.equal(B.mx(Lf, 100), 1180);
    // Sag 0 is a straight wire.
    const flat = B.layout(1280, 800, { sag: 0 });
    assert.ok(flat.bulbs.every(b => Math.abs(b.y - flat.railY) < 1e-9 && Math.abs(b.rest) < 1e-9));
    // A point on a swag: at the hooks, and drooping most in the middle.
    const sw = R.swags[1];
    assert.equal(JSON.stringify(B.swagPoint(sw, 0)), JSON.stringify({ x: sw.A.x, y: sw.A.y }));
    assert.ok(B.swagPoint(sw, 0.5).y > sw.A.y && Math.abs(B.swagPoint(sw, 0.5).y - sw.A.y - sw.d) < 1e-9);
    assert.ok(B.swagSlope(sw, 0.1) > 0 && B.swagSlope(sw, 0.9) < 0);
});

test('layout: rows snake down the wall; the border goes round; the arch goes up, across and down; hooks as asked', () => {
    const W = 1280, H = 800;
    const rows = B.layout(W, H, { rows: 3 });
    const ys = [...new Set(rows.bulbs.map(b => Math.round(b.y / 10)))];
    assert.equal(rows.corners.length, 6, 'three runs, each with a start and an end');
    assert.ok(rows.bulbs.some(b => b.y > H * 0.4), 'bulbs well down the wall');
    assert.ok(rows.lastHook > W / 2 && rows.hookY > rows.railY, 'the end on the right, on the last row');
    assert.ok(rows.bulbs.some(b => Math.abs(b.x - (W - rows.w * 1.1)) < 1 && b.y > rows.railY + 5), 'bulbs down the side drop');
    const border = B.layout(W, H, { route: 'border', bottom: 48 });
    const near = (v, t) => Math.abs(v - t) < border.w * 1.2;
    assert.ok(border.bulbs.some(b => near(b.x, border.w * 1.1) && b.y > H * 0.3), 'up the left side');
    assert.ok(border.bulbs.some(b => near(b.y, border.railY) && b.x > W * 0.3 && b.x < W * 0.7), 'along the top');
    assert.ok(border.bulbs.some(b => near(b.x, W - border.w * 1.1) && b.y > H * 0.3), 'down the right side');
    assert.ok(border.bulbs.some(b => b.y > H - 48 - border.w * 3.5 && b.x > W * 0.3 && b.x < W * 0.7), 'along the bottom, above the inset');
    assert.ok(border.bulbs.filter(b => b.x > W * 0.3).every(b => b.y + 3 * border.w < H - 48 + 1e-6), 'the bottom run\'s glass hangs above the inset line');
    assert.ok(border.lastHook < W / 2 && border.hookY > H * 0.8, 'the end near the bottom left');
    const arch = B.layout(W, H, { route: 'arch' });
    assert.ok(!arch.bulbs.some(b => b.y > H * 0.9 && b.x > W * 0.3 && b.x < W * 0.7), 'no bottom run');
    assert.ok(arch.hookY > H * 0.6 && arch.lastHook > W * 0.9, 'the end down the right side');
    for (const route of ['rail', 'border', 'arch']) {
        const L = B.layout(W, H, { route, hookEvery: 4 });
        for (let i = 1; i < L.hooks.length; i++) {
            const d = Math.hypot(L.hooks[i].x - L.hooks[i - 1].x, L.hooks[i].y - L.hooks[i - 1].y);
            assert.ok(d <= 4 * L.s + 1e-6, `${route}: a hook within four bulbs`);
        }
        // Bulbs a spacing apart along the wire, none within half a spacing of the end hook.
        const end = { x: L.lastHook, y: L.hookY };
        for (const b of L.bulbs) assert.ok(Math.hypot(b.x - end.x, b.y - end.y) >= 0.45 * L.s - 1e-6);
    }
    assert.ok(B.layout(W, H, { glow: 2 }).reach > B.layout(W, H, {}).reach);
});

test('twinkle bulbs: spread along the strand, never the first; a blink then on', () => {
    assert.equal(JSON.stringify(B.twinklers(20, 0)), '[]');
    assert.equal(JSON.stringify(B.twinklers(1, 3)), '[]');
    const t = B.twinklers(20, 3);
    assert.equal(t.length, 3);
    assert.ok(t.every(i => i >= 1 && i < 20) && t[0] < t[1] && t[1] < t[2]);
    assert.ok(B.twinklers(4, 6).length <= 3);
    const steps = B.twinkle(() => 0.5);
    assert.equal(steps.length, 2);
    assert.equal(steps[0][0], 0); assert.equal(steps[1][0], 1);
    assert.ok(steps[0][1] < steps[1][1]);
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
