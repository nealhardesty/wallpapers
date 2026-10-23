// Unit tests for the Lighthouse wallpaper's light characteristics
// (web/wallpapers/lighthouse/lighthouse-light.js), in a Node vm like the
// browser loads it. Task 8.13: the beam keeps its flash character at any fps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

const WEB = resolve(import.meta.dirname, '../web');
const context = vm.createContext({ URLSearchParams });
for (const path of ['core/wp.js', 'wallpapers/lighthouse/defaults.js', 'wallpapers/lighthouse/settings.js', 'wallpapers/lighthouse/lighthouse-light.js']) {
    vm.runInContext(readFileSync(join(WEB, path), 'utf8'), context, { filename: path });
}
const { LighthouseLight: Light, WP } = context;

// Run the light the way the wallpaper does, one frame at a time at `fps`
// with ±30% jitter in the frame interval, and record each flash the viewer
// sees: when it starts and how long it lasts (crossing half brightness).
function watch(text, fps, seconds, seed = 1) {
    const light = Light.parse(text);
    let random = seed;
    const jitter = () => ((random = (random * 16807) % 2147483647) / 2147483647 - 0.5) * 0.6;
    const flashes = [];
    let t = 0, lit = false;
    while (t < seconds) {
        const on = Light.intensity(light, t) >= 0.5;
        if (on && !lit) flashes.push({ start: t, length: 0 });
        if (on) flashes[flashes.length - 1].length = t - flashes[flashes.length - 1].start;
        lit = on;
        t += (1 + jitter()) / fps;
    }
    return { light, flashes };
}

const FRAME_RATES = [10, 15, 20, 24, 30, 60, 90, 120, 144];

test('Fl(2) 10s: two flashes every ten seconds, at every frame rate', () => {
    for (const fps of FRAME_RATES) {
        const { flashes } = watch('Fl(2) 10s', fps, 120);
        const frame = 1.3 / fps;   // the longest jittered frame
        assert.equal(flashes.length, 24, `${fps} fps: ${flashes.length} flashes in 2 minutes`);
        flashes.forEach((flash, i) => {
            // Group of two: 2 s apart, then 8 s to the next group.
            const expected = Math.floor(i / 2) * 10 + (i % 2) * 2;
            assert.ok(Math.abs(flash.start - expected) <= frame, `${fps} fps: flash ${i} at ${flash.start.toFixed(3)} s, expected ${expected}`);
            assert.ok(Math.abs(flash.length - 0.6) <= 2 * frame, `${fps} fps: flash ${i} lasts ${flash.length.toFixed(3)} s`);
        });
    }
});

test('every characteristic offered in the settings keeps its rhythm at 10 and 120 fps', () => {
    const control = WP.schemaOf('lighthouse').find(c => c.key === 'characteristic');
    assert.equal(JSON.stringify(control.options.map(([text]) => text)), JSON.stringify(Light.CHARTED), 'the L key cycles what the panel offers');
    for (const [text] of control.options) {
        const light = Light.parse(text);
        assert.equal(light.text, text, `${text} parses as itself`);
        const slow = watch(text, 10, light.period * 6, 3).flashes;
        const fast = watch(text, 120, light.period * 6, 5).flashes;
        assert.equal(slow.length, fast.length, `${text}: ${slow.length} flashes at 10 fps, ${fast.length} at 120`);
        slow.forEach((flash, i) => assert.ok(Math.abs(flash.start - fast[i].start) <= 0.15, `${text}: flash ${i} drifts between frame rates`));
    }
});

test('the light is a pure function of elapsed time', () => {
    const light = Light.parse('Fl(3) 15s');
    const times = Array.from({ length: 500 }, (_, i) => i * 0.137);
    const forwards = times.map(t => Light.intensity(light, t));
    const shuffled = [...times].reverse().map(t => Light.intensity(light, t)).reverse();
    assert.deepEqual(forwards, shuffled);
    // A whole number of periods later, the same light.
    for (const t of times) assert.ok(Math.abs(Light.intensity(light, t) - Light.intensity(light, t + 15 * 7)) < 1e-9);
});

test('a beam points at the viewer exactly when its flash peaks', () => {
    for (const text of ['Fl(2) 10s', 'Fl 5s', 'LFl 10s', 'Q', 'Q(9) 15s']) {
        const light = Light.parse(text);
        for (const beam of light.beams) {
            const facing = Light.beamAngles(light, beam.centre).filter(b => Math.abs(Math.atan2(Math.sin(b.angle), Math.cos(b.angle))) < 1e-9);
            assert.equal(facing.length, 1, `${text}: one beam faces the viewer at ${beam.centre}`);
            assert.ok(Light.intensity(light, beam.centre) > 0.99, `${text}: full brightness at the peak`);
        }
    }
});

test('quick lights turn no faster than once in six seconds, with more panels', () => {
    const q = Light.parse('Q');
    assert.equal(q.period, 1);
    assert.ok(q.turn >= 6);
    assert.equal(q.beams.length, q.turn / q.period);
    assert.equal(Light.parse('Fl(2) 10s').beams.length, 2);
    assert.equal(Light.parse('Fl(2) 10s').turn, 10);
});

test('occulting and isophase lights are mostly or half lit, and fixed', () => {
    const lit = (text, step = 0.01) => {
        const light = Light.parse(text);
        let on = 0, n = 0;
        for (let t = 0; t < light.period * 4; t += step, n++) on += Light.intensity(light, t) >= 0.5;
        return { share: on / n, light };
    };
    const oc = lit('Oc 6s');
    assert.ok(Math.abs(oc.share - 5 / 6) < 0.02, `Oc 6s lit ${oc.share}`);
    assert.equal(oc.light.rotating, false);
    assert.ok(Math.abs(lit('Iso 4s').share - 0.5) < 0.02);
    assert.ok(Math.abs(lit('Oc(2) 10s').share - 0.8) < 0.02);
    assert.equal(lit('F').share, 1, 'a fixed light never blinks, not even at the cycle seam');
    assert.equal(watch('Oc 6s', 60, 60).flashes.length, 10, 'one stretch of light per cycle, no flicker at the seam');
});

test('nonsense falls back to the default characteristic', () => {
    assert.equal(Light.parse('Disco 3s').text, 'Fl(2) 10s');
    assert.equal(Light.parse('').text, 'Fl(2) 10s');
});

test('the marine forecast: trimmed, the nearest hour picked, stale or broken data refused', () => {
    vm.runInContext(readFileSync(join(WEB, 'wallpapers/lighthouse/lighthouse-sea.js'), 'utf8'), context);
    const Sea = context.LighthouseSea;
    const json = { hourly: { time: ['2026-10-22T00:00', '2026-10-22T01:00', '2026-10-22T02:00'], wave_height: [1.2, null, 3.456], wave_period: [8, 9, 11.04], wave_direction: [270, 280, 290] } };
    const hours = Sea.trim(json);
    assert.equal(hours.length, 2, 'the hour with no height is dropped');
    const at = Date.UTC(2026, 9, 22, 1, 50);
    assert.deepEqual(JSON.parse(JSON.stringify(Sea.pick(hours, at))), { at: Date.UTC(2026, 9, 22, 2), height: 3.46, period: 11, direction: 290 });
    assert.equal(Sea.pick(hours, Date.UTC(2026, 9, 23)), null, 'a day-old forecast is too stale');
    assert.equal(Sea.trim({ error: true }), null);
    assert.equal(Sea.trim(null), null);
    assert.match(Sea.url('southern-ocean'), /^https:\/\/marine-api\.open-meteo\.com\/v1\/marine\?latitude=-52&longitude=60&hourly=wave_height,wave_period,wave_direction/);
    assert.ok(Sea.storm(Sea.STATES.calm.height) < 0.05 && Sea.storm(Sea.STATES.gale.height) === 1);
    for (const [key] of WP.schemaOf('lighthouse').find(c => c.key === 'oceanPoint').options) assert.ok(Sea.POINTS[key], key);
});

test('descriptions read like a chart key', () => {
    assert.equal(Light.describe(Light.parse('Fl(2) 10s')), 'two flashes every 10 s');
    assert.equal(Light.describe(Light.parse('Oc 6s')), 'steady, dark once every 6 s');
    assert.equal(Light.describe(Light.parse('Q')), 'quick flashing');
});
