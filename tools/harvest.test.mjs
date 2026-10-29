// Harvest Valley's sky (web/wallpapers/harvest/harvest-sky.js): the moon's
// phase and name, the sun's day, the holiday, and the light.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const WEB = resolve(import.meta.dirname, '../web');
const Sky = new Function(`${readFileSync(join(WEB, 'wallpapers/harvest/harvest-sky.js'), 'utf8')}; return HarvestSky;`)();

test('moon: the phase follows known new and full moons to within a day', () => {
    const near = (date, want) => {
        const age = Sky.moonAge(date), gap = Math.min(Math.abs(age - want), Sky.SYNODIC - Math.abs(age - want));
        assert.ok(gap < 1, `${date.toISOString()}: age ${age.toFixed(2)}, wanted ${want}`);
    };
    near(new Date(Date.UTC(2024, 3, 8, 18, 21)), 0);                  // the eclipse new moon
    near(new Date(Date.UTC(2023, 10, 27, 9, 16)), Sky.SYNODIC / 2);   // a November full moon
    near(new Date(Date.UTC(2025, 8, 7, 18, 8)), Sky.SYNODIC / 2);     // the Corn Moon, with an eclipse
    assert.ok(Sky.illumination(0) < 0.001);
    assert.ok(Sky.illumination(Sky.SYNODIC / 2) > 0.999);
    assert.ok(Math.abs(Sky.illumination(Sky.SYNODIC / 4) - 0.5) < 0.001);
});

test('moon: the full moon has its season’s name', () => {
    const half = Sky.SYNODIC / 2;
    assert.equal(Sky.moonTitle(new Date(2026, 10, 24, 12), half), 'Beaver Moon');
    assert.equal(Sky.moonTitle(new Date(2026, 11, 24, 12), half), 'Cold Moon');
    assert.equal(Sky.moonTitle(new Date(2026, 8, 26, 12), half), 'Harvest Moon');   // nearest the equinox
    assert.equal(Sky.moonTitle(new Date(2026, 9, 26, 12), half), 'Hunter’s Moon');
    assert.equal(Sky.moonTitle(new Date(2026, 10, 10, 12), 1.5), 'Waxing crescent');
    assert.equal(Sky.moonTitle(new Date(2026, 10, 10, 12), 0.2), 'New Moon');
    assert.equal(Sky.moonTitle(new Date(2026, 10, 10, 12), 22), 'Last quarter');
});

test('sun: a short November day, rising left and setting right, noon at its highest', () => {
    const day = new Date(2026, 10, 20);
    const { rise, set } = Sky.sunTimes(day);
    assert.ok(set - rise > 9 && set - rise < 10.6, `${(set - rise).toFixed(2)} h of daylight`);
    const summer = Sky.sunTimes(new Date(2026, 5, 20));
    assert.ok(summer.set - summer.rise > 14.5, 'June days are long');
    const at = h => Sky.bodies(new Date(2026, 10, 20, Math.floor(h), Math.round((h % 1) * 60)), 5).sun;
    assert.ok(at(8).x < 0.4 && at(16).x > 0.6, 'east in the morning, west in the afternoon');
    assert.ok(at(12.25).alt > at(9).alt && at(12.25).alt > at(15.5).alt);
    assert.ok(at(12.25).alt > 25 && at(12.25).alt < 35, `noon sun ${at(12.25).alt.toFixed(1)}°`);
    assert.ok(at(rise - 0.2).alt < 0 && at(rise + 0.2).alt > 0 && at(set + 0.2).alt < 0);
});

test('moon: a full moon is up at midnight, a new one at noon, and it rides higher in winter', () => {
    const at = (h, age, date = new Date(2026, 10, 20)) => Sky.bodies(new Date(date.getFullYear(), date.getMonth(), date.getDate(), h), age).moon;
    assert.ok(at(0, Sky.SYNODIC / 2).alt > 30, 'full moon at midnight');
    assert.ok(at(18, Sky.SYNODIC / 2).alt < 15, 'rising at dusk');
    assert.ok(at(12, 0.3).alt > 0, 'new moon in the day sky');
    const winter = Math.max(...[22, 23, 0, 1, 2].map(h => at(h, Sky.SYNODIC / 2).alt));
    const summer = Math.max(...[22, 23, 0, 1, 2].map(h => at(h, Sky.SYNODIC / 2, new Date(2026, 5, 20)).alt));
    assert.ok(winter > summer + 20, `winter ${winter.toFixed(0)}° against summer ${summer.toFixed(0)}°`);
    // the moon crosses the sky left to right
    assert.ok(at(21, Sky.SYNODIC / 2).x < at(3, Sky.SYNODIC / 2).x);
});

test('pinned skies: a clear morning, the last light, and a night with the moon in it', () => {
    const date = new Date(2026, 10, 20, 15, 0);
    const day = Sky.bodies(Sky.pinned('day', date, undefined)).sun;
    assert.ok(day.alt > 15);
    const golden = Sky.bodies(Sky.pinned('golden', date, undefined)).sun;
    assert.ok(golden.alt > 0 && golden.alt < 8, `golden hour sun ${golden.alt.toFixed(1)}°`);
    for (const age of [3.5, 7.4, 11, Sky.SYNODIC / 2]) {
        const t = Sky.pinned('night', date, age), b = Sky.bodies(t, age);
        assert.ok(b.sun.alt < -9, `age ${age}: the sun is at ${b.sun.alt.toFixed(0)}°`);
    }
    const t = Sky.pinned('night', date, Sky.SYNODIC / 2);
    assert.ok(Sky.bodies(t, Sky.SYNODIC / 2).moon.alt > 40, 'a full moon is high at its best moment');
});

test('Thanksgiving: the fourth Thursday of November', () => {
    for (const [year, day] of [[2024, 28], [2025, 27], [2026, 26], [2027, 25], [2028, 23]]) {
        const date = Sky.thanksgiving(year);
        assert.equal(date.getMonth(), 10);
        assert.equal(date.getDate(), day, String(year));
        assert.equal(date.getDay(), 4);
    }
    assert.equal(Sky.holiday(new Date(2026, 10, 26, 9)), 'day');
    assert.equal(Sky.holiday(new Date(2026, 10, 23, 23)), 'week');
    assert.equal(Sky.holiday(new Date(2026, 10, 30)), 'week');
    assert.equal(Sky.holiday(new Date(2026, 11, 2)), null);
    assert.equal(Sky.holiday(new Date(2026, 10, 12)), null);
});

test('light: bright by day, dark at night, moonlight helps, and the sky is warm at the horizon', () => {
    const noon = Sky.light(35), night = Sky.light(-30), moonlit = Sky.light(-30, 1), dusk = Sky.light(-1);
    const luma = c => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
    assert.ok(luma(noon.top) > 100 && luma(night.top) < 20);
    assert.ok(luma(moonlit.top) > luma(night.top) + 10, 'a moonlit sky is lighter');
    assert.ok(moonlit.wash[3] < night.wash[3], 'and the land is less washed');
    assert.ok(noon.wash[3] < 0.05 && night.wash[3] > 0.6);
    assert.ok(dusk.horizon[0] > dusk.horizon[2] + 80, 'a red horizon at sunset');
    assert.ok(noon.stars === 0 && night.stars === 1 && noon.dark === 0 && night.dark === 1);
    assert.ok(dusk.twilight > 0.7 && noon.twilight === 0 && night.twilight === 0);
    // continuous: no jump anywhere along the sun's path
    let last = Sky.light(-40);
    for (let a = -39.5; a <= 60; a += 0.5) {
        const now = Sky.light(a);
        for (const k of ['top', 'mid', 'horizon', 'wash']) now[k].forEach((v, i) => assert.ok(Math.abs(v - last[k][i]) < 25, `${k}[${i}] jumps at ${a}°`));
        last = now;
    }
});
