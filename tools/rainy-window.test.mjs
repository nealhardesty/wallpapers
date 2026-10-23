// Unit tests for Rainy Window's pure parts (SPEC §10.15, task 8.10), run in
// a Node vm like the browser loads them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

const WEB = resolve(import.meta.dirname, '../web');
const context = vm.createContext({});
for (const path of ['core/wp.js', 'wallpapers/rainy-window/rainy-window-city.js']) {
    vm.runInContext(readFileSync(join(WEB, path), 'utf8'), context, { filename: path });
}
const RainyCity = vm.runInContext('RainyCity', context);

test('rainy-window: far more windows lit at 22:00 than at 03:00', () => {
    assert.ok(RainyCity.litShare(22) > 3 * RainyCity.litShare(3));
});

test('rainy-window: the evening is the brightest time, the small hours the darkest', () => {
    const shares = Array.from({ length: 24 }, (_, h) => RainyCity.litShare(h));
    const peak = shares.indexOf(Math.max(...shares)), low = shares.indexOf(Math.min(...shares));
    assert.ok(peak >= 18 && peak <= 22, `peak at ${peak}:00`);
    assert.ok(low >= 2 && low <= 5, `lowest at ${low}:00`);
});

test('rainy-window: the share moves smoothly through the hour and wraps at midnight', () => {
    for (let h = 0; h < 24; h += 0.25) {
        const a = RainyCity.litShare(h), b = RainyCity.litShare(h + 0.25);
        assert.ok(a > 0 && a < 1);
        assert.ok(Math.abs(a - b) < 0.05, `jump at ${h}`);
    }
    assert.equal(RainyCity.litShare(24), RainyCity.litShare(0));
});

test('rainy-window: the same seed lays out the same city, and windows follow the hour', () => {
    const make = hour => vm.runInContext(`new RainyCity({ kind: 'downtown', palette: 'sodium', seed: 5, w: 1280, h: 800, bottom: 0, hour: ${hour} })`, context);
    const late = make(22), small = make(3);
    assert.equal(late.windows.length, small.windows.length);
    assert.ok(late.windows.length > 500);
    const lit = city => city.windows.filter(w => w.lit).length;
    assert.ok(lit(late) > 3 * lit(small), `${lit(late)} vs ${lit(small)}`);
});
