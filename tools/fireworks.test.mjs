// Unit tests for the Fireworks running order (SPEC §10.17, task 8.12):
// web/wallpapers/fireworks/fireworks-show.js in a Node vm, seeded.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

const WEB = resolve(import.meta.dirname, '../web');
const context = vm.createContext({});
for (const path of ['core/wp.js', 'wallpapers/fireworks/fireworks-show.js']) {
    vm.runInContext(readFileSync(join(WEB, path), 'utf8'), context, { filename: path });
}
const { WP } = context;
const FireworksShow = vm.runInContext('FireworksShow', context);

// Run a mode for `seconds` at a frame interval, as the wallpaper does.
function launches({ mode = 'auto', seconds, dt, seed = 1, start = 0, ...options }) {
    const show = new FireworksShow({ rng: WP.seededRandom(seed), ...options });
    const at = [];
    for (let clock = start; clock < start + seconds; clock += dt) for (const e of show.run(mode, clock)) at.push(e.at);
    return at.sort((a, b) => a - b);
}

test('fireworks: auto never leaves the sky empty longer than its lull', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
        for (const intensity of [0.3, 1, 2]) {
            for (const showMinutes of [1, 5, 20]) {
                const at = launches({ seconds: 2 * 3600, dt: 1 / 30, seed, intensity, showMinutes });
                let worst = at[0];
                for (let i = 1; i < at.length; i++) worst = Math.max(worst, at[i] - at[i - 1]);
                assert.ok(worst <= FireworksShow.LULL, `seed ${seed}, ×${intensity}, ${showMinutes} min: a ${worst.toFixed(1)} s gap`);
            }
        }
    }
});

test('fireworks: the same seed gives the same show at 10 fps and at 120 fps', () => {
    const slow = launches({ seconds: 600, dt: 0.1 }), fast = launches({ seconds: 600, dt: 1 / 120 });
    assert.ok(slow.length > 200);
    assert.deepEqual(slow.map(t => t.toFixed(6)), fast.map(t => t.toFixed(6)));
});

test('fireworks: a show builds, ends in a finale, pauses, and starts again', () => {
    const minutes = 5, cycle = minutes * 60 + FireworksShow.PAUSE;
    const at = launches({ seconds: cycle * 3, dt: 1 / 30, showMinutes: minutes });
    const count = (a, b) => at.filter(t => t >= a && t < b).length;
    for (let k = 0; k < 3; k++) {
        const c = k * cycle, finaleStart = c + minutes * 60 - FireworksShow.FINALE;
        const opening = count(c, c + 60) / 60, finale = count(finaleStart, c + minutes * 60) / FireworksShow.FINALE;
        assert.ok(finale > 3 * opening, `cycle ${k}: finale ${finale.toFixed(2)}/s vs opening ${opening.toFixed(2)}/s`);
        assert.equal(count(c + minutes * 60 + 0.5, c + cycle), 0, `cycle ${k}: the pause is quiet`);
    }
});

test('fireworks: tap mode launches nothing on its own', () => {
    assert.equal(launches({ mode: 'tap', seconds: 3600, dt: 1 / 20 }).length, 0);
});

test('fireworks: New Year counts down from 23:59:50 and celebrates from midnight', () => {
    const at = (...a) => FireworksShow.newYear(new Date(...a));
    assert.deepEqual({ ...at(2026, 11, 31, 23, 59, 50) }, { phase: 'countdown', count: 10, s: -10, year: 2027 });
    assert.equal(at(2026, 11, 31, 23, 59, 59, 500).count, 1);
    const midnight = at(2027, 0, 1, 0, 0, 0);
    assert.equal(midnight.phase, 'celebrate');
    assert.equal(midnight.year, 2027);
    assert.equal(at(2027, 0, 1, 0, 4, 59).phase, 'celebrate');
    assert.equal(at(2027, 0, 1, 0, 5, 0).phase, 'quiet');
    assert.equal(at(2026, 11, 31, 23, 59, 49).phase, 'quiet');
    assert.equal(at(2026, 11, 31, 23, 59, 40).untilCountdown, 10);
    assert.equal(Math.round(at(2027, 0, 1, 0, 10).untilCountdown / 86400), 365, 'the next countdown is next December');
});

test('fireworks: the New Year show holds for the year, then a finale, then ends', () => {
    const at = launches({ mode: 'celebrate', seconds: FireworksShow.CELEBRATE + 60, dt: 1 / 30 });
    assert.ok(at[0] >= FireworksShow.YEAR_HOLD, `first launch at ${at[0]}`);
    assert.ok(at.filter(t => t < FireworksShow.NEW_YEAR_FINALE).length > 60, 'a finale at midnight');
    assert.equal(at.filter(t => t >= FireworksShow.CELEBRATE).length, 0, 'and quiet after');
});
