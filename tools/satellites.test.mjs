// Unit tests for Satellites' sky maths and data rules (web/wallpapers/
// satellites/sgp4.js and data.js), loaded into a Node vm as the browser
// loads them.
//
// The propagator is checked against the published SGP4 verification
// vectors: Vallado, Crawford, Hujsak & Kelso, "Revisiting Spacetrack Report
// #3", AIAA 2006-6753 (SGP4-VER.TLE and tcppver.out). Three near-Earth
// cases, their elements written as CelesTrak's JSON, positions in km (TEME)
// at minutes from epoch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

const WEB = resolve(import.meta.dirname, '../web');
const context = vm.createContext({});
for (const file of ['core/wp.js', 'wallpapers/satellites/sgp4.js', 'wallpapers/satellites/data.js']) {
    vm.runInContext(readFileSync(join(WEB, file), 'utf8'), context, { filename: file });
}
const [SatMath, SatData] = vm.runInContext('[SatMath, SatData]', context);
const HOUR = 3600000;

const CASES = [
    {   // 06251: a low orbit with strong drag (perigee about 375 km)
        omm: { OBJECT_NAME: '06251', NORAD_CAT_ID: 6251, EPOCH: '2006-06-25T19:46:43.980', MEAN_MOTION: 15.56387291, ECCENTRICITY: 0.0030035,
            INCLINATION: 58.0579, RA_OF_ASC_NODE: 54.0425, ARG_OF_PERICENTER: 139.1568, MEAN_ANOMALY: 221.1854, BSTAR: 0.00012808 },
        vectors: [[0, 3988.31022699, 5498.96657235, 0.90055879], [360, 4993.62642836, 2890.549699, -3600.40145627],
            [720, 3692.60030028, -976.24265255, -5623.36447493], [1080, 642.27769977, -4332.89821901, -5183.3152391],
            [1440, -2777.14682335, -5663.16031708, -2462.54889123], [1800, -4966.20137963, -4379.59155037, 1349.33347502],
            [2160, -4856.6678007, -1107.03450192, 4557.21258241], [2520, -2451.38045953, 2610.60463261, 5729.79022069],
            [2880, 1159.27802897, 5056.60175495, 4353.49418579]],
    },
    {   // 28057: sun-synchronous, near circular, about 800 km
        omm: { OBJECT_NAME: '28057', NORAD_CAT_ID: 28057, EPOCH: '2006-06-26T18:52:04.079', MEAN_MOTION: 14.3547808, ECCENTRICITY: 0.0000884,
            INCLINATION: 98.4283, RA_OF_ASC_NODE: 247.6961, ARG_OF_PERICENTER: 88.1964, MEAN_ANOMALY: 271.9322, BSTAR: 0.00003594 },
        vectors: [[0, -2715.28237486, -6619.26436889, -0.01341443], [480, 411.09332812, -1728.99769152, -6935.4554881],
            [960, 2811.140623, 5950.65707171, -2813.23705389], [1440, 688.16056594, 4124.87618964, 5794.55994449],
            [1920, -2475.70722288, -4331.90569958, 5117.31234924], [2400, -1619.73468334, -5871.14051991, -3760.56587071],
            [2880, 1788.4233458, 1990.50530957, -6640.59337725]],
    },
    {   // 00005: eccentric (e 0.19), period 133 min, three days
        omm: { OBJECT_NAME: '00005', NORAD_CAT_ID: 5, EPOCH: '2000-06-27T18:50:19.733', MEAN_MOTION: 10.82419157, ECCENTRICITY: 0.1859667,
            INCLINATION: 34.2682, RA_OF_ASC_NODE: 348.7242, ARG_OF_PERICENTER: 331.7664, MEAN_ANOMALY: 19.3264, BSTAR: 0.000028098 },
        vectors: [[0, 7022.46529266, -1400.08296755, 0.03995155], [720, -7134.59340119, 6531.68641334, 3260.27186483],
            [1440, -938.55923943, -6268.18748831, -4294.02924751], [2160, 190.19796988, 7746.96653614, 5110.00675412],
            [2880, -8650.73082219, -1914.93811525, -3007.03603443], [3600, 6759.04583722, 2001.5819822, 2783.55192533],
            [4320, -9060.47373569, 4658.70952502, 813.68673153]],
    },
];

// A test observer: a round-number point in mid-ocean.
const OBSERVER = SatMath.observer({ lat: 30, lon: -40 });
const angle = (a, b) => Math.acos(Math.min(1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (Math.hypot(...a) * Math.hypot(...b)))) * 180 / Math.PI;

test('sgp4: within 1° of the published vectors, seen from a test observer, up to 3 days', () => {
    let checked = 0;
    for (const { omm, vectors } of CASES) {
        const sat = SatMath.init(omm);
        for (const [minutes, x, y, z] of vectors) {
            const ms = sat.epoch + minutes * 60000;
            const { r } = SatMath.propagate(sat, ms);
            const o = SatMath.observerAt(OBSERVER, ms);
            const seen = angle([r[0] - o[0], r[1] - o[1], r[2] - o[2]], [x - o[0], y - o[1], z - o[2]]);
            assert.ok(seen < 1, `${omm.OBJECT_NAME} at ${minutes} min: ${seen.toFixed(4)}° off`);
            // It's the full model, so in fact it agrees to well under a metre.
            assert.ok(Math.hypot(r[0] - x, r[1] - y, r[2] - z) < 0.001, `${omm.OBJECT_NAME} at ${minutes} min: position`);
            checked++;
        }
    }
    assert.equal(checked, 23);
});

test('sgp4: deep-space orbits are refused; decayed ones end quietly', () => {
    assert.throws(() => SatMath.init({ ...CASES[1].omm, MEAN_MOTION: 1.0027 }), /deep-space/);
    const sat = SatMath.init({ ...CASES[0].omm, BSTAR: 0.05 });
    assert.equal(SatMath.propagate(sat, sat.epoch + 400 * 86400000), null);
});

test('sidereal time: Vallado example 3-5 (1992-08-20 12:14 UT1)', () => {
    const gmst = SatMath.gmst(Date.UTC(1992, 7, 20, 12, 14)) * 180 / Math.PI;
    assert.ok(Math.abs(gmst - 152.578787886) < 0.001, `${gmst}`);
});

test('sun: on the equator at the equinox, at 23.44° N at the solstice', () => {
    const dec = ms => Math.asin(SatMath.sun(ms)[2]) * 180 / Math.PI;
    assert.ok(Math.abs(dec(Date.UTC(2026, 2, 20, 14, 46))) < 0.05);
    assert.ok(Math.abs(dec(Date.UTC(2026, 5, 21, 8, 24)) - 23.44) < 0.05);
    // Midday sun due south at 45° N, at about 90 - 45 + declination.
    const noon = SatMath.sunLook(SatMath.observer({ lat: 45, lon: 0 }), Date.UTC(2026, 5, 21, 12, 2));
    assert.ok(Math.abs(noon.el - 68.4) < 0.5 && Math.abs(noon.az - 180) < 3, JSON.stringify(noon));
});

test('shadow: a low orbit spends roughly a third of each turn in Earth\'s shadow, with soft edges', () => {
    const sat = SatMath.init(SatData.sample()[0]);
    const turn = 1440 / 15.5 * 60000, values = [];
    for (let t = 0; t < turn; t += 10000) values.push(SatMath.look(OBSERVER, sat, Date.UTC(2026, 9, 1) + t).lit);
    const dark = values.filter(v => v === 0).length / values.length;
    assert.ok(dark > 0.2 && dark < 0.45, `${dark}`);
    assert.ok(values.some(v => v > 0 && v < 1), 'no fade at the edge');
});

test('passes: a found pass is up, sunlit and against a dark sky', () => {
    const sat = SatMath.init(SatData.sample()[0]);
    const o = SatMath.observer({ lat: 45, lon: -105 });
    const pass = SatMath.nextPass(o, sat, Date.UTC(2026, 9, 14, 0), { hours: 24 });
    assert.ok(pass && pass.maxEl >= 10 && pass.end >= pass.start);
    const mid = (pass.start + pass.end) / 2;
    assert.ok(SatMath.sunLook(o, mid).el < -6);
    assert.ok(SatMath.look(o, sat, mid).lit > 0.5);
});

test('cache: a group is fetched at most once every 12 hours, and failures wait an hour', () => {
    const now = Date.UTC(2026, 9, 22, 12);
    assert.equal(SatData.due(null, now), true, 'nothing cached');
    assert.equal(SatData.due({ fetched: now - HOUR, tried: now - HOUR }, now), false);
    assert.equal(SatData.due({ fetched: now - 12 * HOUR + 1000, tried: now - 12 * HOUR + 1000 }, now), false);
    assert.equal(SatData.due({ fetched: now - 12 * HOUR, tried: now - 12 * HOUR }, now), true);
    assert.equal(SatData.due({ fetched: now - 20 * HOUR, tried: now - 30 * 60000 }, now), false, 'a failure half an hour ago');
    assert.equal(SatData.due({ fetched: now - 20 * HOUR, tried: now - 61 * 60000 }, now), true);
    assert.equal(SatData.due({ tried: now - 10 * 60000 }, now), false, 'never fetched, tried just now');
    assert.equal(SatData.due({ fetched: now + 3 * 24 * HOUR, tried: now + 3 * 24 * HOUR }, now), true, 'a clock that went back');

    // Two days of new tabs every five minutes, as the stage does it: mark
    // the try, then record the success.
    let record = null, fetches = 0;
    for (let t = now; t < now + 48 * HOUR; t += 5 * 60000) {
        if (!SatData.due(record, t)) continue;
        fetches++;
        record = { fetched: t, tried: t, elements: [] };
    }
    assert.equal(fetches, 4);
    // Offline the whole time: one try an hour.
    record = null;
    let tries = 0;
    for (let t = now; t < now + 24 * HOUR; t += 5 * 60000) {
        if (!SatData.due(record, t)) continue;
        tries++;
        record = { ...record, tried: t };
    }
    assert.equal(tries, 24);
});

test('data: stale after three days from the sky\'s time; nonsense dropped; groups merged', () => {
    const elements = [CASES[1].omm];
    const epoch = SatMath.init(CASES[1].omm).epoch;
    assert.ok(SatData.age(elements, epoch + 2 * 24 * HOUR) < SatData.STALE_MS);
    assert.ok(SatData.age(elements, epoch + 4 * 24 * HOUR) > SatData.STALE_MS);
    assert.ok(SatData.age(elements, epoch - 4 * 24 * HOUR) > SatData.STALE_MS, 'time travel backwards too');
    const kept = SatData.compact([CASES[0].omm, { OBJECT_NAME: 'X' }, { ...CASES[1].omm, MEAN_MOTION: 'fast' }, null]);
    assert.equal(kept.length, 1);
    assert.throws(() => SatData.compact({ error: 'no' }));
    const merged = SatData.merge([{ elements: [CASES[0].omm, CASES[1].omm] }, { elements: [CASES[1].omm, CASES[2].omm] }, null]);
    assert.equal(merged.length, 3);
    assert.equal(SatData.kind({ OBJECT_NAME: 'ISS (ZARYA)', NORAD_CAT_ID: 25544 }).label, 'ISS');
    assert.equal(SatData.kind({ OBJECT_NAME: 'SL-16 R/B', NORAD_CAT_ID: 1 }).type, 'rocket');
});

test('sample: the same made-up orbits every time, all near Earth and usable', () => {
    const a = SatData.sample(), b = SatData.sample();
    assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
    assert.ok(a.length >= 30 && a.every(omm => omm.OBJECT_NAME.startsWith('SAMPLE')));
    for (const omm of a) assert.ok(SatMath.propagate(SatMath.init(omm), Date.UTC(2027, 0, 1)), omm.OBJECT_NAME);
});
