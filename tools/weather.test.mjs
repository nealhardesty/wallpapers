// Unit tests for Weather's data rules (web/wallpapers/weather/weather-data.js),
// loaded into a Node vm as the browser loads them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

const WEB = resolve(import.meta.dirname, '../web');
const context = vm.createContext({});
vm.runInContext(readFileSync(join(WEB, 'wallpapers/weather/weather-data.js'), 'utf8'), context, { filename: 'weather-data.js' });
const W = vm.runInContext('WeatherData', context);

const CURRENT = 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m,wind_direction_10m,precipitation';
const HOURLY = 'temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,is_day,wind_speed_10m';
const DAILY = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,snowfall_sum,sunrise,sunset,uv_index_max,wind_speed_10m_max';

test('request: exact URL, rounded coordinates, imperial units', () => {
    assert.equal(W.request({ lat: 12.345, lon: -0.051, days: 5, units: 'imperial' }),
        'https://api.open-meteo.com/v1/forecast?latitude=12.3&longitude=-0.1&timezone=auto&forecast_days=5' +
        `&current=${CURRENT}&hourly=${HOURLY}&daily=${DAILY}` +
        '&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch');
});

test('request: metric adds only the wind unit; days clamp to 2..16', () => {
    const u = W.request({ lat: 3, lon: 4, days: 1, units: 'metric' });
    assert.match(u, /latitude=3\.0&longitude=4\.0/);
    assert.match(u, /forecast_days=2&/);
    assert.ok(u.endsWith(`&daily=${DAILY}&wind_speed_unit=kmh`));
    assert.doesNotMatch(u, /temperature_unit|precipitation_unit/);
    assert.match(W.request({ lat: 0, lon: 0, days: 40, units: 'metric' }), /forecast_days=16&/);
});

test('unitsFor', () => {
    for (const [l, u] of [['en-US', 'imperial'], ['en', 'metric'], ['es-US', 'imperial'], ['my-MM', 'imperial'],
        ['en-LR', 'imperial'], ['en-GB', 'metric'], ['de-DE', 'metric'], ['fr-CA', 'metric']]) {
        assert.equal(W.unitsFor(l), u, l);
    }
});

function fixture() {
    const time = [], zeros = [];
    for (let d = 0; d < 2; d++) for (let h = 0; h < 24; h++) {
        time.push(`2026-03-0${d + 1}T${String(h).padStart(2, '0')}:00`); zeros.push(h);
    }
    return {
        utc_offset_seconds: 3600, timezone: 'Test/Nowhere',
        current: { time: '2026-03-01T10:15', temperature_2m: 7.5, apparent_temperature: 5, relative_humidity_2m: 80, weather_code: 61, is_day: 1, wind_speed_10m: 12, wind_direction_10m: 200, precipitation: 0.2 },
        hourly: {
            time, temperature_2m: zeros, apparent_temperature: zeros.map(x => x - 1),
            precipitation_probability: zeros.map((x, i) => i === 3 ? null : x), precipitation: zeros,
            weather_code: zeros.map(() => 3), is_day: zeros.map(x => x > 6 && x < 18 ? 1 : 0), wind_speed_10m: zeros,
        },
        daily: {
            time: ['2026-03-01', '2026-03-02'], weather_code: [61, 0], temperature_2m_max: [9, 11], temperature_2m_min: [2, 3],
            precipitation_probability_max: [70, 10], precipitation_sum: [3.5, 0], sunrise: ['2026-03-01T06:40', '2026-03-02T06:38'],
            sunset: ['2026-03-01T17:50', '2026-03-02T17:52'], uv_index_max: [2, 3], wind_speed_10m_max: [20, 15],
        },
    };
}

test('normalize: round-trips the fields', () => {
    const n = W.normalize(fixture(), 1234);
    assert.equal(n.fetchedAt, 1234);
    assert.equal(n.utcOffsetSeconds, 3600);
    assert.equal(n.timezone, 'Test/Nowhere');
    assert.deepEqual(JSON.parse(JSON.stringify(n.current)), {
        time: '2026-03-01T10:15', temp: 7.5, feels: 5, humidity: 80, code: 61, isDay: 1, wind: 12, windDir: 200, precip: 0.2,
    });
    assert.equal(n.hours.length, 48);
    assert.equal(n.hours[5].temp, 5);
    assert.equal(n.hours[5].feels, 4);
    assert.equal(n.hours[3].pop, 0);
    assert.equal(n.hours[24].time, '2026-03-02T00:00');
    assert.equal(n.days.length, 2);
    assert.deepEqual(JSON.parse(JSON.stringify(n.days[0])), {
        date: '2026-03-01', code: 61, hi: 9, lo: 2, pop: 70, precip: 3.5, snow: null,
        sunrise: '2026-03-01T06:40', sunset: '2026-03-01T17:50', uv: 2, windMax: 20,
    });
});

test('normalize: snowfall_sum, when there, is the day\'s snow in cm', () => {
    const f = fixture();
    f.daily.snowfall_sum = [2.8, 0];
    const n = W.normalize(f, 0);
    assert.equal(n.days[0].snow, 2.8);
    assert.equal(n.days[1].snow, 0);
    f.daily.snowfall_sum = [null, 'x'];
    assert.equal(W.normalize(f, 0).days[0].snow, null);
});

test('normalize: not a forecast gives null, never throws', () => {
    assert.equal(W.normalize(null, 0), null);
    assert.equal(W.normalize({}, 0), null);
    assert.equal(W.normalize({ hourly: { time: [1] } }, 0), null);
    const a = fixture(); a.hourly.temperature_2m.pop();
    assert.equal(W.normalize(a, 0), null);
    const b = fixture(); b.current.temperature_2m = '7.5';
    assert.equal(W.normalize(b, 0), null);
    const c = fixture(); c.daily.temperature_2m_max[0] = '9';
    assert.equal(W.normalize(c, 0), null);
    assert.equal(W.normalize('nope', 0), null);
});

test('kind: the WMO table', () => {
    const table = {
        clear: [0], 'mostly-clear': [1], 'partly-cloudy': [2], cloudy: [3, 42], fog: [45, 48], drizzle: [51, 53, 55],
        'freezing-rain': [56, 57, 66, 67], rain: [61, 63], 'heavy-rain': [65, 82], snow: [71, 73], 'heavy-snow': [75, 77],
        showers: [80, 81], 'snow-showers': [85, 86], thunder: [95], hail: [96, 99],
    };
    for (const [k, codes] of Object.entries(table)) for (const c of codes) assert.equal(W.kind(c, 1), k, String(c));
    assert.equal(W.label('partly-cloudy'), 'Partly cloudy');
});

test('sky', () => {
    const day = { sunrise: '2026-03-01T06:40', sunset: '2026-03-01T17:50' };
    const at = s => Date.parse(s + 'Z');
    assert.equal(W.sky(at('2026-03-01T12:00'), day).phase, 'day');
    assert.equal(W.sky(at('2026-03-01T06:20'), day).phase, 'dawn');
    assert.equal(W.sky(at('2026-03-01T17:55'), day).phase, 'dusk');
    assert.equal(W.sky(at('2026-03-01T02:00'), day).phase, 'night');
    assert.equal(W.sky(at('2026-03-01T23:00'), day).phase, 'night');
    assert.equal(W.sky(at('2026-03-01T12:00'), { isDay: 1 }).phase, 'day');
    assert.equal(W.sky(at('2026-03-01T12:00'), { sunrise: null, sunset: null, isDay: 0 }).phase, 'night');
});

test('age', () => {
    const m = 60000;
    assert.equal(W.age(0, 5 * m), '');
    assert.equal(W.age(0, 25 * m), 'updated 25 min ago');
    assert.equal(W.age(0, 180 * m), 'updated 3 h ago');
    assert.equal(W.age(0, 50 * 60 * m), 'updated 2 days ago');
    assert.equal(W.age(NaN, 50 * m), '');
    assert.equal(W.age(0, NaN), '');
    assert.equal(W.age(undefined, 50 * m), '');
});

test('dayLabel', () => {
    assert.equal(W.dayLabel('2026-03-01', '2026-03-01', 'en-US'), 'Today');
    assert.equal(W.dayLabel('2026-03-02', '2026-03-01', 'en-US'), 'Tomorrow');
    assert.equal(W.dayLabel('2026-03-04', '2026-03-01', 'en-US'), 'Wed');
    assert.equal(W.dayLabel('2026-03-04', '2026-03-01', 'de-DE'), 'Mi');
});

test('sample: valid, deterministic, every kind', () => {
    const now = Date.parse('2026-03-01T09:30:00Z');
    const s = W.sample(now);
    assert.equal(s.sample, true);
    assert.equal(s.days.length, 16);
    assert.equal(s.hours.length, 16 * 24);
    const kinds = new Set(s.days.map(d => W.kind(d.code, 1)));
    for (const k of ['clear', 'mostly-clear', 'partly-cloudy', 'cloudy', 'fog', 'drizzle', 'rain', 'heavy-rain', 'freezing-rain', 'snow', 'heavy-snow', 'showers', 'snow-showers', 'thunder', 'hail']) {
        assert.ok(kinds.has(k), k);
    }
    // Deterministic: any time in the same UTC day gives the same forecast
    // (only fetchedAt differs), and the opening days are pinned.
    const later = W.sample(now + 10 * 3600000);
    assert.equal(later.fetchedAt, now + 10 * 3600000);
    assert.deepEqual(JSON.parse(JSON.stringify({ ...later, fetchedAt: 0 })), JSON.parse(JSON.stringify({ ...s, fetchedAt: 0 })));
    assert.deepEqual([...s.days.slice(0, 5).map(d => W.kind(d.code, 1))], ['clear', 'rain', 'snow', 'thunder', 'partly-cloudy']);
    assert.equal(s.days[0].date, '2026-03-01');
    assert.equal(s.current.time, '2026-03-01T12:00');
    // Snow days carry a depth; others none.
    for (const d of s.days) assert.equal(d.snow > 0, ['snow', 'heavy-snow', 'snow-showers'].includes(W.kind(d.code, 1)), d.date);
    // The next day is a different forecast's first day.
    assert.equal(W.sample(now + 86400000).days[0].date, '2026-03-02');
});

test('normalize: polar day and night (no sunrise or sunset) still give a forecast', () => {
    const f = fixture();
    f.daily.sunrise = [null, ''];
    f.daily.sunset = ['', null];
    const n = W.normalize(f, 0);
    assert.ok(n);
    assert.equal(n.days[0].sunrise, null);
    assert.equal(n.days[1].sunset, null);
    assert.equal(W.sky(Date.parse('2026-06-01T02:00:00Z'), { ...n.days[0], isDay: 1 }).phase, 'day');
    assert.equal(W.sky(Date.parse('2026-12-01T12:00:00Z'), { ...n.days[1], isDay: 0 }).phase, 'night');
});

test('request refuses non-finite coordinates', () => {
    assert.equal(W.request({ lat: NaN, lon: 1, days: 3, units: 'metric' }), null);
    assert.equal(W.request({ lat: 1, lon: undefined, days: 3, units: 'metric' }), null);
});

test('dayLabel falls back instead of throwing', () => {
    assert.equal(W.dayLabel('garbage', '2026-03-01', 'en'), 'garbage');
    assert.equal(W.dayLabel('2026-03-04', '2026-03-01', 'not a locale!'), 'Wed');
});

test('placeNow shifts UTC to the place wall clock', () => {
    assert.equal(W.placeNow(1000, 3600), 1000 + 3600000);
    assert.equal(W.placeNow(1000), 1000);
    assert.equal(W.placeNow(Date.parse('2026-03-01T12:00:00Z'), -5 * 3600), Date.parse('2026-03-01T07:00:00Z'));
});
