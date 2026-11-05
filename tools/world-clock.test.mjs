// Unit tests for World Clock's data and maths (web/wallpapers/world-clock/:
// world-land.js, world-cities.js, world-clock-math.js), loaded into a Node vm
// as the stage loads them, after core/clockface.js for the zone helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

const WEB = resolve(import.meta.dirname, '../web');
const DIR = 'wallpapers/world-clock';
const context = vm.createContext({ Intl });
for (const file of ['core/clockface.js', `${DIR}/world-land.js`, `${DIR}/world-cities.js`, `${DIR}/world-clock-math.js`]) {
    vm.runInContext(readFileSync(join(WEB, file), 'utf8'), context, { filename: file });
}
const [M, CITIES, LAND] = vm.runInContext('[WorldClockMath, WORLD_CITIES, WORLD_LAND]', context);

const at = iso => new Date(iso);
const EQUINOX = at('2026-03-20T14:46:00Z');
const JUNE = at('2026-06-21T08:24:00Z');
const DECEMBER = at('2026-12-21T20:50:00Z');
const near = (actual, expected, within, what) =>
    assert.ok(Math.abs(actual - expected) <= within, `${what}: ${actual} is not within ${within} of ${expected}`);

// Even-odd point in polygon, on the flat map.
function inside(rings, lon, lat) {
    let hit = false;
    for (const ring of rings) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const [xi, yi] = ring[i], [xj, yj] = ring[j];
            if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) hit = !hit;
        }
    }
    return hit;
}

// ---- The sun ----------------------------------------------------------------

test('subsolar: the equinox is on the equator, the solstices on the tropics', () => {
    near(M.subsolar(EQUINOX).lat, 0, 0.5, 'March equinox');
    near(M.subsolar(JUNE).lat, 23.44, 0.3, 'June solstice');
    near(M.subsolar(DECEMBER).lat, -23.44, 0.3, 'December solstice');
});

test('subsolar: the equation of time puts noon at 4° west in early November', () => {
    near(M.subsolar(at('2026-11-05T12:00:00Z')).lon, -4, 1, 'longitude at 12:00 UTC');
    for (const iso of ['2026-01-01T00:00:00Z', '2026-06-01T23:59:00Z', '2030-09-09T06:00:00Z']) {
        const { lon, lat } = M.subsolar(at(iso));
        assert.ok(lon >= -180 && lon < 180 && Math.abs(lat) < 23.5, `${iso}: ${lon}, ${lat}`);
    }
});

test('sunAltitude: overhead at the subsolar point, below at its antipode', () => {
    for (const date of [EQUINOX, JUNE, DECEMBER, at('2026-11-05T12:00:00Z')]) {
        const { lat, lon } = M.subsolar(date);
        near(M.sunAltitude(lat, lon, date), 90, 0.01, 'subsolar point');
        near(M.sunAltitude(-lat, lon + 180, date), -90, 0.01, 'antipode');
    }
});

test('isNight: midnight sun in the June north, polar night in the south', () => {
    assert.equal(M.isNight(89.9, 0, JUNE), false);
    assert.equal(M.isNight(-89.9, 0, JUNE), true);
    assert.equal(M.isNight(90, 0, DECEMBER), true);
    assert.equal(M.isNight(-90, 0, DECEMBER), false);
    const { lat, lon } = M.subsolar(JUNE);
    assert.equal(M.isNight(lat, lon, JUNE), false);
    assert.equal(M.isNight(-lat, lon + 180, JUNE), true);
});

// ---- The terminator ---------------------------------------------------------

const finite = rings => rings.every(ring => ring.length >= 3 && ring.every(p => p.length === 2 && p.every(Number.isFinite)));

test('terminator: finite rings on the map, at the equinox, the solstices and the poles', () => {
    for (const date of [EQUINOX, JUNE, DECEMBER, at('2026-11-05T12:00:00Z'), at('2026-09-23T00:05:00Z')]) {
        for (const rings of [M.terminator(date, 180), M.terminator(date, 24), M.twilight(date, -6), M.twilight(date, -12), M.twilight(date, -18)]) {
            assert.ok(rings.length >= 1, `${date.toISOString()}: no night`);
            assert.ok(finite(rings), `${date.toISOString()}: a ring has a non-finite point`);
            for (const ring of rings) for (const [lon, lat] of ring) assert.ok(Math.abs(lon) <= 180 && Math.abs(lat) <= 90, `${lon}, ${lat}`);
        }
    }
});

test('terminator: the equinox puts both poles on the line, the night a near-vertical band', () => {
    near(M.sunAltitude(90, 0, EQUINOX), 0, 1, 'north pole');
    near(M.sunAltitude(-90, 0, EQUINOX), 0, 1, 'south pole');
    const night = M.terminator(EQUINOX, 180);
    const lons = night.flat().map(p => p[0]);
    const width = Math.max(...lons) - Math.min(...lons);
    // One band (or the band split at the date line): about half the map wide,
    // and every point on it within a degree or so of two meridians 180° apart.
    const { lon: noon } = M.subsolar(EQUINOX);
    for (const [lon, lat] of night.flat()) {
        if (Math.abs(lat) > 89 || Math.abs(lon) === 180) continue;
        const fromDawn = Math.min(...[noon - 90, noon + 90].map(edge => Math.abs(((lon - edge + 540) % 360) - 180)));
        assert.ok(fromDawn < 1.5, `equinox terminator point ${lon}, ${lat} is ${fromDawn}° off the dawn/dusk meridian`);
    }
    assert.ok(width >= 170, `band is ${width}° wide`);
});

test('terminator: inside the rings is night and outside is day (no gaps, nothing inverted)', () => {
    for (const date of [EQUINOX, JUNE, DECEMBER, at('2026-11-05T12:00:00Z'), at('2026-02-10T03:17:00Z')]) {
        for (const depth of [0, -6, -12, -18]) {
            const rings = depth ? M.twilight(date, depth) : M.terminator(date, 180);
            for (let lat = -89; lat <= 89; lat += 4) {
                for (let lon = -179; lon <= 179; lon += 6) {
                    const alt = M.sunAltitude(lat, lon, date);
                    if (Math.abs(alt - depth) < 1.5) continue;   // the line itself, at 2° sampling
                    assert.equal(inside(rings, lon, lat), alt < depth, `${date.toISOString()} depth ${depth} at ${lat}, ${lon} (altitude ${alt.toFixed(2)})`);
                }
            }
        }
    }
});

test('terminator: the June polar day leaves the north pole lit and covers the south pole', () => {
    const night = M.terminator(JUNE, 180);
    assert.equal(inside(night, 0, 89.9), false);
    assert.equal(inside(night, 0, -89.9), true);
    const lats = night.flat().map(p => p[1]);
    assert.equal(Math.min(...lats), -90, 'the night reaches the south edge of the map');
});

// ---- Zones ------------------------------------------------------------------

test('zoneTime: offsets that are not whole hours, and Lord Howe\'s half-hour DST', () => {
    const summer = at('2026-11-05T20:00:00Z'), winter = at('2026-07-15T12:00:00Z');
    assert.equal(M.zoneTime(summer, 'Asia/Kolkata', 'en-US').offsetMinutes, 330);
    assert.equal(M.zoneTime(summer, 'Asia/Kathmandu', 'en-US').offsetMinutes, 345);
    assert.equal(M.zoneTime(winter, 'Pacific/Chatham', 'en-US').offsetMinutes, 765);
    assert.equal(M.zoneTime(summer, 'Pacific/Chatham', 'en-US').offsetMinutes, 825);
    assert.equal(M.zoneTime(winter, 'Australia/Lord_Howe', 'en-US').offsetMinutes, 630);
    assert.equal(M.zoneTime(summer, 'Australia/Lord_Howe', 'en-US').offsetMinutes, 660);
    const kathmandu = M.zoneTime(summer, 'Asia/Kathmandu', 'en-US', { hour12: false, seconds: true });
    assert.deepEqual([kathmandu.hours, kathmandu.minutes, kathmandu.seconds], [1, 45, 0]);
    assert.match(kathmandu.text, /^0?1:45:00$/);
});

test('zoneTime: dayDelta against the local zone, across the date line', () => {
    const date = at('2026-11-05T20:00:00Z');
    const kiritimati = M.zoneTime(date, 'Pacific/Kiritimati', 'en-US', { local: 'America/Los_Angeles' });
    assert.equal(kiritimati.dayDelta, 1);
    assert.deepEqual([kiritimati.hours, kiritimati.minutes], [10, 0]);
    assert.equal(kiritimati.offsetMinutes, 840);
    assert.equal(M.zoneTime(date, 'America/Los_Angeles', 'en-US', { local: 'America/Los_Angeles' }).dayDelta, 0);
    assert.equal(M.zoneTime(at('2026-11-05T05:00:00Z'), 'Pacific/Pago_Pago', 'en-US', { local: 'Asia/Tokyo' }).dayDelta, -1);
    assert.equal(M.zoneTime(date, 'UTC', 'en-US', { local: 'UTC' }).abbreviation, 'UTC');
});

test('zoneTime: the text follows hour12 and the locale; a bad zone falls back to UTC', () => {
    const date = at('2026-11-05T20:07:09Z');
    assert.match(M.zoneTime(date, 'UTC', 'en-US', { hour12: true }).text, /^8:07\s?PM$/);
    assert.equal(M.zoneTime(date, 'UTC', 'en-GB', { hour12: false }).text, '20:07');
    assert.equal(M.zoneTime(date, 'UTC', 'en-GB', { hour12: false, seconds: true }).text, '20:07:09');
    const bad = M.zoneTime(date, 'Not/A_Zone', 'en-US', { hour12: false });
    assert.equal(bad.valid, false);
    assert.equal(bad.offsetMinutes, 0);
    assert.equal(bad.text, '20:07');
    assert.equal(M.zoneTime(date, 'Asia/Tokyo', 'en-US').valid, true);
});

test('offsetLabel: a true minus sign, minutes only when there are some', () => {
    assert.equal(M.offsetLabel(-210), 'UTC−3:30');
    assert.equal(M.offsetLabel(330), 'UTC+5:30');
    assert.equal(M.offsetLabel(345), 'UTC+5:45');
    assert.equal(M.offsetLabel(-600), 'UTC−10');
    assert.equal(M.offsetLabel(0), 'UTC');
});

// ---- Cities -----------------------------------------------------------------

test('cities: about 120, unique ids, valid zones and coordinates', () => {
    assert.ok(CITIES.length >= 110 && CITIES.length <= 140, `${CITIES.length} cities`);
    const ids = CITIES.map(c => c.id);
    assert.equal(new Set(ids).size, ids.length, 'ids are unique');
    for (const city of CITIES) {
        assert.match(city.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, city.id);
        assert.ok(city.name && city.country, city.id);
        assert.doesNotThrow(() => new Intl.DateTimeFormat('en-US', { timeZone: city.zone }), `${city.id}: ${city.zone}`);
        assert.ok(Math.abs(city.lat) <= 90 && Math.abs(city.lon) <= 180, `${city.id}: ${city.lat}, ${city.lon}`);
    }
});

test('cities: every inhabited UTC offset has one', () => {
    const offsets = new Set();
    for (const date of [at('2026-01-15T12:00:00Z'), at('2026-07-15T12:00:00Z')]) {
        for (const city of CITIES) offsets.add(M.zoneTime(date, city.zone, 'en-US').offsetMinutes);
    }
    const wanted = [];
    for (let h = -11; h <= 14; h++) wanted.push(h * 60);
    wanted.push(-570, -210, 210, 270, 330, 345, 390, 525, 570, 630, 765);
    for (const minutes of wanted) assert.ok(offsets.has(minutes), `no city at ${M.offsetLabel(minutes)}`);
});

// ---- Land -------------------------------------------------------------------

test('land: at least 100 finite rings on the map, from a file of 50 KB or less', () => {
    const size = statSync(join(WEB, DIR, 'world-land.js')).size;
    assert.ok(size <= 50 * 1024, `world-land.js is ${size} bytes`);
    const rings = M.land();
    assert.ok(rings.length >= 100, `${rings.length} rings`);
    assert.equal(M.land(), rings, 'decoded once');
    assert.ok(Array.isArray(LAND));
    for (const ring of rings) {
        assert.ok(ring.length >= 3);
        for (const [lon, lat] of ring) assert.ok(Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 90, `${lon}, ${lat}`);
    }
    // Some well-known places are on land, and the middle of the oceans isn't.
    const on = (lon, lat) => inside(rings, lon, lat);
    assert.ok(on(2.35, 48.86) && on(-100, 40) && on(135, -25) && on(20, 0) && on(0, -85), 'land where land is');
    assert.ok(!on(-30, 0) && !on(-150, 0) && !on(80, -20), 'sea where sea is');
});
