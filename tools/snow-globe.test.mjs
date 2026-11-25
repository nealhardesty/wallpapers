// Unit tests for Snow Globe's pure logic
// (web/wallpapers/snow-globe/globe-logic.js), loaded into a Node vm as the
// stage loads it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

const WEB = resolve(import.meta.dirname, '../web');
const FILE = 'wallpapers/snow-globe/globe-logic.js';
const context = vm.createContext({});
vm.runInContext(readFileSync(join(WEB, FILE), 'utf8'), context, { filename: FILE });
const G = vm.runInContext('SnowGlobeLogic', context);
const seeded = seed => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

// Every flake is somewhere, and the books balance.
function balanced(sim) {
    let loose = 0, ground = 0, on = 0;
    for (const f of sim.flakes) { if (f.state === 0) loose++; else if (f.on < 0) ground++; else on++; }
    assert.equal(ground, sim.ground, 'the ground’s count');
    assert.equal(on, sim.onThings.reduce((a, b) => a + (b || 0), 0), 'the roofs’ count');
    assert.equal(loose + ground + on, sim.flakes.length);
    return { loose, ground, on };
}
const run = (sim, secs, fps, things = []) => { for (let i = 0; i < secs * fps; i++) G.step(sim, 1 / fps, things); };

test('layout: the globe, its base, the cat and the candle all on the screen and above the inset, apart', () => {
    for (const [W, H, ins] of [[1280, 800, {}], [1920, 1080, {}], [412, 915, { bottom: 48 }], [800, 1280, {}], [1024, 600, { bottom: 40 }]]) {
        for (const side of ['left', 'right']) {
            for (const size of [0.7, 1, 1.3]) {
                const L = G.layout(W, H, { insets: ins, size, catSide: side, cat: true }), bottom = H - (ins.bottom || 0);
                const tag = `${W}×${H} ${side} ${size}`;
                assert.ok(L.cy - L.R >= 0 && L.cx - L.R >= 0 && L.cx + L.R <= W, `${tag}: the glass is on screen`);
                assert.ok(L.foot <= bottom - 4, `${tag}: the base stands above the inset`);
                assert.ok(Math.abs(L.base.top - (L.cy + L.R * 0.8)) < 1e-6, `${tag}: the globe sits in its collar`);
                const catHalf = L.cat.h * 0.31, dir = side === 'left' ? -1 : 1;
                assert.ok(L.cat.x - catHalf >= -2 && L.cat.x + catHalf <= W + 2, `${tag}: the cat is on screen (${L.cat.x.toFixed(0)} ± ${catHalf.toFixed(0)})`);
                assert.equal(Math.sign(L.cat.x - L.cx), dir, `${tag}: the cat is on its side`);
                if (!L.portrait) assert.ok(Math.abs(L.cat.x - L.cx) - catHalf > L.R * 0.9, `${tag}: the cat sits beside the globe, not in front of it`);
                assert.ok(L.candle.x > 0 && L.candle.x < W && L.candle.y < L.foot + 1, `${tag}: the candle is on the sill`);
                if (!L.portrait) assert.equal(Math.sign(L.candle.x - L.cx), -dir, `${tag}: the candle is across from the cat`);
                assert.ok(L.win.y >= 0 && L.win.y + L.win.h <= L.back, `${tag}: the window is in the wall`);
            }
        }
    }
});

test('the water: a shake lifts the snow, the water carries it, it settles again, and none is ever lost', () => {
    const rand = seeded(5), sim = G.makeSim(500, { rand, settleSeconds: 30 });
    assert.equal(balanced(sim).loose, 0, 'it begins settled');
    assert.equal(G.shake(sim, 1, 0, 0, rand), 0, 'no shake, nothing lifted');
    const soft = G.shake(sim, 1, 0, 0.2, rand);
    const b1 = balanced(sim);
    assert.ok(soft > 30 && soft < 200, `a gentle shake lifts some (${soft})`);
    G.shake(sim, -1, -1, 1.5, rand);
    const b2 = balanced(sim);
    assert.ok(b2.loose > b1.loose * 2 && b2.loose > 400, `a hard one lifts most (${b2.loose})`);
    assert.ok(G.stir(sim) > 0.5, 'the water is stirred');
    for (let i = 0; i < 60 * 30; i++) {
        G.step(sim, 1 / 30);
        if (i % 90 === 0) {
            balanced(sim);
            for (const f of sim.flakes) {
                assert.ok(Math.hypot(f.x, f.y, f.z) <= G.WALL + 1e-6, 'inside the glass');
                assert.ok(f.y >= G.FLOOR - 1e-6, 'above the floor');
            }
        }
    }
    assert.equal(balanced(sim).loose, 0, 'all down after twice the settling time');
    run(sim, 2, 30);
    assert.ok(sim.calmFor > 1, 'and the water calm');
});

test('settling takes about the time it is set to, at any frame rate', () => {
    const until = (settle, fps) => {
        const rand = seeded(11), sim = G.makeSim(300, { rand, settleSeconds: settle });
        G.shake(sim, 0, -1, 1.4, rand);
        let half = null;
        for (let i = 1; i < settle * 3 * fps; i++) {
            const left = G.step(sim, 1 / fps);
            if (half === null && left < 150) half = i / fps;
            if (left === 0) return { all: i / fps, half };
        }
        return { all: Infinity, half };
    };
    for (const settle of [20, 60]) {
        const at = [10, 30, 120].map(fps => until(settle, fps));
        for (const r of at) {
            assert.ok(r.all < settle * 2.3, `settle ${settle}: the last is down by ${r.all.toFixed(1)} s`);
            assert.ok(r.half > settle * 0.12 && r.half < settle * 0.9, `settle ${settle}: half down at ${r.half.toFixed(1)} s`);
        }
        const spread = Math.max(...at.map(r => r.half)) / Math.min(...at.map(r => r.half));
        assert.ok(spread < 1.3, `settle ${settle}: 10, 30 and 120 fps agree (${at.map(r => r.half.toFixed(1)).join(', ')})`);
    }
});

test('snow lies on the roofs too, turns with the turntable, and comes off them first in a shake', () => {
    const rand = seeded(3);
    for (const scene of G.SCENE_ORDER) {
        const sim = G.makeSim(800, { rand, settleSeconds: 20 }), things = G.placed(scene, 0.4, 0);
        assert.ok(things.length >= 6, `${scene}: ${things.length} things`);
        for (const t of things) assert.ok(Math.hypot(t.x, t.z) + t.r * 0.6 < G.FLOOR_R && t.top < G.WALL, `${scene}: the ${t.kind} fits in the glass`);
        G.shake(sim, 0, -1, 2, rand);
        run(sim, 50, 30, things);
        const { on } = balanced(sim), c = G.cover(sim, things);
        assert.ok(on > 4, `${scene}: ${on} flakes on the roofs`);
        assert.ok(c.ground > 0.5 && c.on.some(v => v > 0.05), `${scene}: lying snow ${c.ground.toFixed(2)} and on ${c.on.filter(v => v > 0.05).length} things`);
        G.shake(sim, 1, 0, 0.6, rand);
        const after = balanced(sim);
        assert.ok(after.on / on < after.ground / (sim.flakes.length - on), `${scene}: roofs shed more than the ground`);
    }
    const a = G.placed('cottage', 0, 0), b = G.placed('cottage', Math.PI / 2, 0);
    assert.ok(Math.abs(Math.hypot(a[1].x, a[1].z) - Math.hypot(b[1].x, b[1].z)) < 1e-9 && Math.abs(a[1].x - b[1].x) > 0.1, 'a quarter turn moves them round, the same distance out');
});

test('more or fewer flakes: added settled, taken settled first, the books still balance', () => {
    const rand = seeded(8), sim = G.makeSim(400, { rand });
    G.shake(sim, 1, 0, 0.3, rand);
    const loose = balanced(sim).loose;
    G.resize(sim, 250, rand);
    assert.equal(sim.flakes.length, 250);
    assert.equal(balanced(sim).loose, loose, 'those in the water stay');
    G.resize(sim, 600, rand);
    assert.equal(balanced(sim).loose, loose);
    assert.equal(sim.flakes.length, 600);
    for (const kind of ['snow', 'mixed', 'glitter', 'rainbow']) {
        const s = G.makeSim(400, { rand, kind }), glitter = s.flakes.filter(f => f.glitter).length;
        assert.ok(kind === 'snow' ? glitter === 0 : kind === 'mixed' ? glitter > 40 && glitter < 160 : glitter > 300, `${kind}: ${glitter} glitter`);
    }
});

test('the music box: a winding plays its time and runs down; the turntable turns as set; the tune keeps time at any frame rate', () => {
    for (const turning of ['music', 'always', 'never']) {
        const m = G.wind(G.musicBox());
        let at = 0;
        for (let i = 0; i < 30 * 40; i++) { G.musicStep(m, 1 / 30, { seconds: 30, turning }); if (m.wind > 0) at = i / 30; }
        assert.ok(Math.abs(at - 30) < 0.1, `${turning}: played ${at.toFixed(1)} s`);
        if (turning === 'music') assert.equal(m.omega, 0, 'it stops when the music does');
        if (turning === 'always') assert.ok(m.omega > 0.05, 'always: still turning slowly');
        if (turning === 'never') assert.equal(m.theta, 0, 'never: it never turned');
    }
    // It slows as it runs down.
    const m = G.wind(G.musicBox()), tempos = [];
    for (let i = 0; i < 40 * 30; i++) { G.musicStep(m, 1 / 30, { seconds: 40 }); if (i % 300 === 150) tempos.push(m.tempo); }
    assert.ok(tempos.every((t, i) => i === 0 || t < tempos[i - 1]), `slowing: ${tempos.map(t => t.toFixed(2)).join(', ')}`);
    // The notes: in order, and as many at 10 fps as at 120.
    for (const tune of G.TUNE_ORDER) {
        const T = G.TUNES[tune];
        assert.ok(T.name && T.notes.length > 20, tune);
        for (const [midi, beats] of T.notes) assert.ok((midi === 0 || (midi >= 55 && midi <= 84)) && beats > 0, `${tune}: ${midi} ${beats}`);
        const play = fps => { const box = G.wind(G.musicBox()), heard = []; for (let i = 0; i < 20 * fps; i++) { G.musicStep(box, 1 / fps, { seconds: 120 }); for (const n of G.notesDue(box, 1 / fps, tune)) heard.push(n.midi); } return heard; };
        const slow = play(10), fast = play(120);
        assert.ok(slow.length > 12, `${tune}: ${slow.length} notes in 20 s`);
        assert.ok(Math.abs(slow.length - fast.length) <= 2, `${tune}: ${slow.length} notes at 10 fps, ${fast.length} at 120`);
        const tunes = Array.from(T.notes.filter(n => n[0]), n => n[0]);
        assert.deepEqual(fast.slice(0, 12), tunes.slice(0, 12), `${tune}: in order`);
    }
    assert.ok(Math.abs(G.hz(69) - 440) < 1e-9 && Math.abs(G.hz(81) - 880) < 1e-9);
});

test('the cat: watches moving snow, taps the glass, shakes it itself when it has all been still a while, and is stroked', () => {
    const states = new Set(), events = { tap: 0, bat: 0 };
    let c = G.makeCat(), rand = seeded(21);
    for (let i = 0; i < 600 * 30; i++) {
        const swirl = (i / 30) % 60 < 15 ? 0.8 : 0;
        for (const e of G.catStep(c, 1 / 30, { rand, swirl, calmFor: 0, mischief: 0.6 })) events[e]++;
        states.add(c.state);
        assert.ok(G.CAT_STATES.includes(c.state), c.state);
        assert.ok(c.paw >= 0 && c.paw <= 1 && c.eyes >= 0 && c.eyes <= 1.3, `paw ${c.paw}, eyes ${c.eyes}`);
    }
    for (const s of ['sit', 'watch', 'groom', 'blink', 'sleep', 'tap']) assert.ok(states.has(s), `it was never ${s}: ${[...states]}`);
    assert.ok(events.tap > 3, `${events.tap} taps in ten minutes`);
    // Still a long while, and it is the cat's job: a swipe within the minute.
    c = G.makeCat(); rand = seeded(4);
    let swiped = -1;
    for (let i = 0; i < 90 * 30 && swiped < 0; i++) if (G.catStep(c, 1 / 30, { rand, swirl: 0, calmFor: 500, mischief: 0.5, byCat: true, every: 180 }).includes('bat')) swiped = i / 30;
    assert.ok(swiped >= 0 && swiped < 60, `a swipe after ${swiped} s`);
    for (let i = 0; i < 60; i++) G.catStep(c, 1 / 30, { rand, swirl: 0, calmFor: 0 });
    assert.equal(c.paw, 0, 'the paw comes down again');
    // Not its job: no swipes.
    c = G.makeCat(); rand = seeded(4);
    let bats = 0;
    for (let i = 0; i < 300 * 30; i++) bats += G.catStep(c, 1 / 30, { rand, swirl: 0, calmFor: 500, mischief: 0, byCat: false }).filter(e => e === 'bat').length;
    assert.equal(bats, 0, 'no mischief and not its job: it leaves the globe alone');
    // A stroke: eyes shut, purring, then back to sitting.
    G.pet(c);
    for (let i = 0; i < 30; i++) G.catStep(c, 1 / 30, { rand, swirl: 0 });
    assert.ok(c.state === 'purr' && c.eyes < 0.1 && c.purr > 0.5, `stroked: ${c.state}, eyes ${c.eyes.toFixed(2)}`);
    for (let i = 0; i < 5 * 30; i++) G.catStep(c, 1 / 30, { rand, swirl: 0 });
    assert.notEqual(c.state, 'purr');
});

test('at rest: frames keep coming for as long as anything should move, at the pace it needs, however long it rests', () => {
    // A fake clock: each frame asks restWait how long until the next; thirty simulated minutes of a calm globe.
    for (const [catOn, ambient] of [[true, true], [true, false], [false, true], [false, false]]) {
        const c = G.makeCat(), rand = seeded(9);
        let t = 0, frames = 0, longest = 0, asleep = 0;
        while (t < 30 * 60 * 1000) {
            const cat = !catOn ? 'none' : c.state === 'sleep' ? 'asleep' : 'awake';
            const wait = G.restWait({ busy: false, cat, ambient });
            assert.ok(Number.isFinite(wait) && wait > 0 && wait <= 1500, `a wait, not a deadline: ${wait} at ${(t / 1000).toFixed(0)} s`);
            const dt = Math.min(0.1, wait / 1000);
            if (catOn) G.catStep(c, dt, { rand, swirl: 0, calmFor: t / 1000, mischief: 0, byCat: false });
            if (cat === 'asleep') asleep++;
            longest = Math.max(longest, wait);
            t += wait; frames++;
        }
        const tag = `cat ${catOn}, ambient ${ambient}`;
        if (ambient) assert.ok(longest < 80 && frames > 30 * 60 * 13, `${tag}: 14 a second all along (${frames} frames, longest wait ${longest.toFixed(0)} ms)`);
        else if (catOn) assert.ok(longest <= 250 && asleep > 0, `${tag}: at least 4 a second while it sleeps (longest wait ${longest} ms)`);
        else assert.equal(longest, 1500, `${tag}: almost none with nothing to move`);
    }
    assert.equal(G.restWait({ busy: true, cat: 'awake', ambient: true }), 0, 'busy: every frame');
});

test('by the date: the scene and the cat', () => {
    const d = s => new Date(s);
    assert.equal(G.sceneFor('auto', d('2026-12-24T20:00')), 'tree');
    assert.equal(G.sceneFor('auto', d('2026-12-26T09:00')), 'tree');
    assert.equal(G.sceneFor('auto', d('2026-12-10T20:00')), 'village');
    assert.equal(G.sceneFor('pond', d('2026-12-24T20:00')), 'pond', 'a chosen scene stays chosen');
    const year = new Set(); for (let day = 1; day <= 6; day++) year.add(G.sceneFor('auto', d(`2026-03-0${day}T12:00`)));
    assert.equal(year.size, 3, 'the rest of the year, a different one each day');
    assert.ok(G.festive(d('2026-12-24T20:00')) && G.festive(d('2026-12-25T08:00')) && !G.festive(d('2026-12-26T08:00')));
    assert.equal(G.catFor('none', d('2026-12-01')), null);
    assert.equal(G.catFor('turkey', d('2026-12-01')), 'turkey');
    const cats = new Set(); for (let day = 1; day <= 9; day++) cats.add(G.catFor('random', d(`2026-11-${String(day).padStart(2, '0')}T12:00`)));
    assert.equal(cats.size, 9, `nine days, nine cats: ${[...cats]}`);
    assert.equal(G.catFor('random', d('2026-11-03T01:00')), G.catFor('random', d('2026-11-03T23:00')), 'the same cat all day');
});

test('brushwork: a stroke runs until the colour changes or the shape ends', () => {
    const W = 40, H = 10, data = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; data[i] = x < 20 ? 200 : 40; data[i + 1] = data[i + 2] = 100; data[i + 3] = x < 30 ? 255 : 0; }
    assert.equal(G.run(data, W, H, 5, 5, 1, 0, 100, 1), 14, 'stops at the change of colour');
    assert.equal(G.run(data, W, H, 22, 5, 1, 0, 100, 1), 7, 'stops where the shape ends');
    assert.equal(G.run(data, W, H, 5, 5, 1, 0, 6, 1), 6, 'or at its length');
    assert.equal(G.run(data, W, H, 5, 5, -1, 0, 100, 1), 5, 'and at the edge');
});
