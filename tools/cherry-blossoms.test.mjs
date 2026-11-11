// Unit tests for Cherry Blossoms' pure logic
// (web/wallpapers/cherry-blossoms/cherry-logic.js), loaded into a Node vm
// as the stage loads it: the tree from a seed, the wind and its gusts, a
// petal's flight and landing, and the sky by the hour.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

const WEB = resolve(import.meta.dirname, '../web');
const FILE = 'wallpapers/cherry-blossoms/cherry-logic.js';
const context = vm.createContext({});
vm.runInContext(readFileSync(join(WEB, FILE), 'utf8'), context, { filename: FILE });
const C = vm.runInContext('CherryLogic', context);

test('noise is smooth, bounded and repeatable', () => {
    for (let t = 0; t < 50; t += 0.37) {
        const a = C.noise1(t), b = C.noise1(t + 0.01);
        assert.ok(a >= -1 && a <= 1);
        assert.ok(Math.abs(a - b) < 0.1, `a jump of ${Math.abs(a - b)} at ${t}`);
        assert.equal(C.noise1(t), a);
        const n = C.noise2(t, t * 0.7);
        assert.ok(n >= -1 && n <= 1);
    }
    assert.equal(JSON.stringify(C.hexToRgb('#ff8fb1')), '[255,143,177]');
    assert.equal(JSON.stringify(C.hexToRgb('nonsense')), '[255,183,197]');
    assert.equal(C.rgb([1, 2, 3]), 'rgb(1,2,3)');
    assert.equal(C.rgb([1, 2, 3], 0.5), 'rgba(1,2,3,0.5)');
});

test('the tree: a bough from the chosen corner, branches off it, twigs off those, and blossom on every twig', () => {
    for (const seed of [1, 2, 3, 44, 555]) {
        for (const side of ['left', 'right']) {
            const T = C.tree(seed, 1280, 800, { style: 'bough', side, branches: 5 });
            const boughs = T.limbs.filter(l => l.gen === 0);
            assert.equal(boughs.length, 1);
            const root = boughs[0].pts[0];
            if (side === 'left') assert.ok(root.x < 0 && boughs[0].pts[boughs[0].pts.length - 1].x > root.x); else assert.ok(root.x > 1280 && boughs[0].pts[boughs[0].pts.length - 1].x < root.x);
            assert.ok(root.y > 0 && root.y < 800 * 0.25);
            assert.ok(T.limbs.filter(l => l.gen === 1).length >= 3, 'branches off the bough');
            assert.ok(T.limbs.some(l => l.gen === 2), 'twigs off the branches');
            assert.ok(T.clusters.length >= T.limbs.filter(l => l.gen >= 1).length, 'blossom at every twig tip at least');
            for (const l of T.limbs) { assert.ok(l.pts.length >= 4); for (let i = 1; i < l.pts.length; i++) assert.ok(l.pts[i].w <= l.pts[i - 1].w + 1e-9, 'tapers'); }
            // Nearer (deeper) limbs come later, so they draw over the ones behind.
            for (let i = 1; i < T.limbs.length; i++) assert.ok(T.limbs[i].depth >= T.limbs[i - 1].depth);
            // The same seed gives the same tree.
            assert.equal(JSON.stringify(C.tree(seed, 1280, 800, { style: 'bough', side, branches: 5 })), JSON.stringify(T));
        }
    }
    const canopy = C.tree(7, 1280, 800, { style: 'canopy' });
    assert.equal(canopy.limbs.filter(l => l.gen === 0).length, 2);
    const hanging = C.tree(7, 1280, 800, { style: 'branches', branches: 6 });
    assert.equal(hanging.limbs.filter(l => l.gen === 1 && l.pts[0].y < 0).length, 6);
    assert.ok(C.tree(7, 1280, 800, { style: 'bough', blossoms: 2 }).clusters.length > C.tree(7, 1280, 800, { style: 'bough', blossoms: 0.4 }).clusters.length);
});

// The wind stepped at 60 Hz for `seconds`.
function blow(w, seconds, cfg, random, from = 0) {
    const log = [];
    for (let t = from; t < from + seconds; t += 1 / 60) { C.stepWind(w, 1 / 60, cfg, random, t); log.push({ t, phase: w.phase, strength: w.strength }); }
    return log;
}

test('the wind: a breeze that gusts about as often as asked, rising, blowing and dying away, sometimes turning', () => {
    const random = C.rng(3);
    const w = C.makeWind(random);
    assert.ok(w.dir === 1 || w.dir === -1);
    const log = blow(w, 240, { strength: 3, gustsPerMinute: 3, gustLength: 6 }, random);
    let gusts = 0, max = 0;
    for (let i = 1; i < log.length; i++) { if (log[i].phase === 'rising' && log[i - 1].phase === 'calm') gusts++; max = Math.max(max, log[i].strength); }
    assert.ok(gusts >= 6 && gusts <= 20, `${gusts} gusts in four minutes at three a minute`);
    assert.ok(max > 2.5 && max < 4.5, `peak ${max}`);
    for (const e of log) assert.ok(e.strength >= 0 && e.strength <= 4.5);
    // Calm between gusts is still a breeze, never nothing.
    const calm = log.filter(e => e.phase === 'calm');
    assert.ok(calm.every(e => e.strength > 0.2 && e.strength < 1.5));
    // No gusts at all when asked for none.
    const still = C.makeWind(random);
    assert.ok(blow(still, 120, { strength: 3, gustsPerMinute: 0, gustLength: 6 }, random).every(e => e.phase === 'calm'));
    // The wind at a point carries sideways with the wind's direction, with eddies.
    w.dir = 1; w.strength = 3; w.gust = 0;
    const at = C.windAt(w, 100, 100, 5, 1);
    assert.ok(at.x > 0);
    assert.ok(Math.abs(C.windAt(w, 100, 100, 5, 1).x - C.windAt(w, 900, 500, 5, 1).x) > 0, 'eddies differ by place');
});

test('a petal falls at its terminal speed, sways, tumbles and flutters, and lands on the ground', () => {
    const random = C.rng(11);
    const wind = C.makeWind(random, 1);
    wind.strength = 1; wind.gust = 0;
    const env = { wind, time: 0, W: 1280, H: 800, groundY: 688, ground: 'grass', s: 1, fade: false };
    const p = C.makePetal(random, 1280, 800, { fallSpeed: 1, size: 1, spin: 1, sway: 2, flutter: 0.7, colours: 5, shapes: 3, depth: 0.8 });
    p.x = 640; p.y = 100;
    assert.equal(p.state, 'falling');
    assert.ok(p.colour >= 0 && p.colour < 5 && p.shape >= 0 && p.shape < 3);
    const angle0 = p.angle, flip0 = p.flip;
    let t = 0, state = 'falling', ys = [];
    while (state === 'falling' && t < 60) { env.time = t; state = C.stepPetal(p, 1 / 60, env); ys.push(p.y); t += 1 / 60; }
    assert.equal(state, 'settled');
    assert.ok(t > 5 && t < 40, `landed after ${t.toFixed(1)} s`);
    assert.ok(Math.abs(p.y - 688) < 10, 'lies at the ground line');
    assert.notEqual(p.angle, angle0);
    assert.notEqual(p.flip, flip0);
    assert.ok(Math.abs(Math.cos(p.flip)) > 0.99, 'lies flat');
    // Settled, it never moves again; gone off an edge it says so.
    const x = p.x;
    C.stepPetal(p, 1, env);
    assert.equal(p.x, x);
    const q = C.makePetal(random, 1280, 800, {});
    q.x = -100; q.y = 100;
    assert.equal(C.stepPetal(q, 1 / 60, env), 'gone');
    // The flutter's drawn width is cos of the flip, never edge-on.
    for (let f = 0; f < 7; f += 0.3) { const w = C.flutterWidth({ flip: f }); assert.ok(Math.abs(w) >= 0.18 && Math.abs(w) <= 1); }
});

test('on water a petal floats off with the wind; with no ground it falls out of the bottom; fading fades', () => {
    const random = C.rng(5);
    const wind = C.makeWind(random, 1);
    wind.strength = 3; wind.gust = 0;
    const water = { wind, time: 0, W: 1280, H: 800, groundY: 640, ground: 'water', s: 1, fade: false };
    const p = C.makePetal(random, 1280, 800, { depth: 0.5 });
    p.x = 640; p.y = 630; p.vy = 40;
    let state = 'falling';
    for (let t = 0; t < 3 && state === 'falling'; t += 1 / 60) state = C.stepPetal(p, 1 / 60, water);
    assert.equal(state, 'afloat');
    const x0 = p.x;
    for (let t = 0; t < 60 && state === 'afloat'; t += 1 / 60) { water.time = t; state = C.stepPetal(p, 1 / 60, water); }
    assert.ok(p.x > x0, 'carried along');
    assert.equal(state, 'gone');
    const open = { ...water, ground: 'none', groundY: 800, fade: true };
    const q = C.makePetal(random, 1280, 800, { depth: 0.5 });
    q.x = 640; q.y = 500;
    state = 'falling';
    let faded = false;
    for (let t = 0; t < 30 && state === 'falling'; t += 1 / 60) { state = C.stepPetal(q, 1 / 60, open); if (q.alpha < 0.5) faded = true; }
    assert.equal(state, 'gone');
    assert.ok(faded, 'faded on the way down');
});

test('the sky by the hour: night, dawn, day, dusk, night, blending smoothly', () => {
    assert.equal(C.skyAt(2), C.SKIES.night);
    assert.equal(C.skyAt(12), C.SKIES.day);
    assert.equal(C.skyAt(23), C.SKIES.night);
    const dawn = C.skyAt(6);
    assert.ok(dawn.light > C.SKIES.night.light && dawn.light < C.SKIES.day.light);
    let last = C.skyAt(0).light;
    for (let h = 0.1; h < 24; h += 0.1) {
        const l = C.skyAt(h).light;
        assert.ok(Math.abs(l - last) < 0.05, `a jump at ${h.toFixed(1)}`);
        last = l;
    }
    assert.ok(C.SKIES.night.stars === 1 && C.SKIES.day.stars === 0 && C.SKIES.night.moon === 1);
});
