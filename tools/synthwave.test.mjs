// Synthwave (SPEC §10.10, task 8.5): the grid moves by elapsed time, the
// same distance at any frame rate; the sun's gaps widen towards the
// horizon; no shadowBlur; every palette is complete. Runs the wallpaper's
// own classic script in a Node vm, without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

const DIR = resolve(import.meta.dirname, '../web/wallpapers/synthwave');
const source = readFileSync(join(DIR, 'synthwave.js'), 'utf8');
const context = vm.createContext({});
vm.runInContext(readFileSync(resolve(DIR, '../../core/wp.js'), 'utf8'), context);
vm.runInContext(readFileSync(join(DIR, 'defaults.js'), 'utf8'), context);
vm.runInContext(readFileSync(join(DIR, 'settings.js'), 'utf8'), context);
vm.runInContext(source, context);
const Grid = vm.runInContext('SynthwaveGrid', context);
const PALETTES = vm.runInContext('SYNTHWAVE_PALETTES', context);

// Drive the grid as the wallpaper does: one advance per frame, from the
// rAF timestamps of a display at `fps`.
function drive(fps, seconds, speed = 1) {
    let distance = 0, last = 0;
    for (let frame = 1; frame <= Math.round(seconds * fps); frame++) {
        const now = frame * 1000 / fps;
        distance = Grid.advance(distance, now - last, speed);
        last = now;
    }
    return distance;
}

test('grid: the same distance at 30 and 60 fps (and 10 and 120)', () => {
    for (const speed of [0.25, 1, 3]) {
        const at60 = drive(60, 12, speed);
        assert.ok(Math.abs(drive(30, 12, speed) - at60) < 1e-9, `speed ${speed}: 30 fps went ${drive(30, 12, speed)}, 60 fps ${at60}`);
        assert.ok(Math.abs(drive(10, 12, speed) - at60) < 1e-9);
        assert.ok(Math.abs(drive(120, 12, speed) - at60) < 1e-9);
        assert.ok(Math.abs(at60 - 12 * Grid.SPEED * speed) < 1e-9, 'distance is speed × time');
    }
});

test('grid: the lines on screen depend only on distance, so frame rate changes nothing', () => {
    const spacing = Grid.SPACING;
    const fixed = rows => rows.map(z => z.toFixed(9));   // sums of different steps differ by ~1e-14
    assert.deepEqual(fixed(Grid.rows(drive(30, 7.3), spacing)), fixed(Grid.rows(drive(60, 7.3), spacing)));
    // A frame's lines: far to near, evenly spaced, all in view
    const rows = Grid.rows(5.13, spacing);
    assert.ok(rows.length >= 30);
    rows.forEach((z, i) => {
        assert.ok(z >= Grid.NEAR && z <= Grid.FAR);
        if (i) assert.ok(Math.abs(rows[i - 1] - z - spacing) < 1e-9);
    });
    // Driving one spacing further brings the same pattern back
    assert.deepEqual(fixed(Grid.rows(5.13 + spacing, spacing)), fixed(rows));
});

test('grid: a long hitch is clamped to 100 ms, not a lurch', () => {
    assert.equal(Grid.advance(0, 5000, 1), Grid.advance(0, 100, 1));
    assert.equal(Grid.advance(2, -16, 1), 2);
});

test('sun: gaps are born thin and widen as they drift down to the horizon', () => {
    for (const t of [0, 3.7, 41]) {
        const gaps = Grid.stripes(t);
        assert.equal(gaps.length, 7);
        gaps.forEach(([top, bottom], i) => {
            assert.ok(top >= 0.29 && bottom <= 1.05 && bottom > top);
            if (i) assert.ok(bottom - top > gaps[i - 1][1] - gaps[i - 1][0], 'lower gaps are wider');
        });
    }
    // and they move: the first gap is lower a second later
    assert.ok(Grid.stripes(1)[0][0] !== Grid.stripes(0)[0][0]);
});

test('no shadowBlur, ctx.filter or per-frame pixel reads', () => {
    assert.ok(!/\.shadowBlur|\.filter\s*=|getImageData|putImageData/.test(source));
});

test('palettes: every option in the panel has a complete palette of colours', () => {
    const options = context.WP.schemaOf('synthwave').find(c => c.key === 'palette').options.map(([id]) => id);
    const keys = Object.keys(PALETTES.outrun).sort();
    assert.deepEqual(Object.keys(PALETTES).sort(), [...options].sort());
    for (const id of options) {
        assert.deepEqual(Object.keys(PALETTES[id]).sort(), keys, id);
        for (const value of Object.values(PALETTES[id]).flat()) assert.match(value, /^#[0-9a-f]{6}$/, `${id}: ${value}`);
    }
});
