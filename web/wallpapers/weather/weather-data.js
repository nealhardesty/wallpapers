// Weather's data rules, with no DOM and no network, so the unit tests run it
// in a Node vm (tools/weather.test.mjs): the Open-Meteo request, validation
// of what comes back, WMO codes, the sky's phase and a made-up forecast.
//
// Times: Open-Meteo (timezone=auto) gives the place's wall clock as ISO
// strings with no offset ("2026-11-05T06:41"). Those are read as UTC, so
// "now" for sky() is the place's wall clock as epoch ms: placeNow().

const WeatherData = (() => {
    'use strict';

    const HOST = 'https://api.open-meteo.com/v1/forecast';
    const CURRENT = 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m,wind_direction_10m,precipitation';
    const HOURLY = 'temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,is_day,wind_speed_10m';
    const DAILY = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,snowfall_sum,sunrise,sunset,uv_index_max,wind_speed_10m_max';
    const MIN = 60000, HOUR = 3600000, DAY = 86400000;
    const TWILIGHT = 40 * MIN;

    const round1 = x => (Math.round(x * 10) / 10).toFixed(1);

    function request({ lat, lon, days, units }) {
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        const n = Math.max(2, Math.min(16, Math.round(days) || 0));
        let u = '&wind_speed_unit=kmh';
        if (units === 'imperial') u = '&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch';
        return `${HOST}?latitude=${round1(lat)}&longitude=${round1(lon)}&timezone=auto&forecast_days=${n}` +
            `&current=${CURRENT}&hourly=${HOURLY}&daily=${DAILY}${u}`;
    }

    function unitsFor(locale) {
        const m = /^([a-z]{2,3})(?:[-_][A-Za-z]{4})?(?:[-_]([A-Za-z]{2}|\d{3}))?/i.exec(String(locale || ''));
        if (!m) return 'metric';
        const region = m[2] ? m[2].toUpperCase() : '';
        return region === 'US' || region === 'LR' || region === 'MM' ? 'imperial' : 'metric';
    }

    const num = x => typeof x === 'number' && Number.isFinite(x);
    const str = x => typeof x === 'string' && x.length > 0;

    // Columns of equal length out of an Open-Meteo block, or null.
    function table(block, numeric, strings, nullable) {
        if (!block || !Array.isArray(block.time)) return null;
        const n = block.time.length;
        if (!n || !block.time.every(str)) return null;
        for (const k of [...numeric, ...strings]) {
            if (!Array.isArray(block[k]) || block[k].length !== n) return null;
        }
        for (const k of numeric) {
            if (!block[k].every(v => num(v) || (nullable.includes(k) && v === null))) return null;
        }
        for (const k of strings) if (!block[k].every(v => str(v) || (nullable.includes(k) && (v === null || v === '')))) return null;
        return n;
    }

    // A forecast in plain numbers, or null for anything that isn't one.
    function normalize(json, fetchedAt) {
        try {
            if (!json || typeof json !== 'object') return null;
            const c = json.current, h = json.hourly, d = json.daily;
            if (!c || typeof c !== 'object' || !str(c.time)) return null;
            for (const k of ['temperature_2m', 'apparent_temperature', 'relative_humidity_2m', 'weather_code', 'is_day', 'wind_speed_10m', 'wind_direction_10m', 'precipitation']) {
                if (!num(c[k])) return null;
            }
            const hn = table(h, ['temperature_2m', 'apparent_temperature', 'precipitation_probability', 'precipitation', 'weather_code', 'is_day', 'wind_speed_10m'], [], ['precipitation_probability']);
            const dn = table(d, ['weather_code', 'temperature_2m_max', 'temperature_2m_min', 'precipitation_probability_max', 'precipitation_sum', 'uv_index_max', 'wind_speed_10m_max'], ['sunrise', 'sunset'], ['precipitation_probability_max', 'sunrise', 'sunset', 'uv_index_max']);
            if (!hn || !dn) return null;
            return {
                fetchedAt: num(fetchedAt) ? fetchedAt : 0,
                utcOffsetSeconds: num(json.utc_offset_seconds) ? json.utc_offset_seconds : 0,
                timezone: str(json.timezone) ? json.timezone : '',
                current: {
                    time: c.time, temp: c.temperature_2m, feels: c.apparent_temperature,
                    humidity: c.relative_humidity_2m, code: c.weather_code, isDay: c.is_day ? 1 : 0,
                    wind: c.wind_speed_10m, windDir: c.wind_direction_10m, precip: c.precipitation,
                },
                hours: h.time.map((time, i) => ({
                    time, temp: h.temperature_2m[i], feels: h.apparent_temperature[i],
                    pop: h.precipitation_probability[i] || 0, precip: h.precipitation[i],
                    code: h.weather_code[i], isDay: h.is_day[i] ? 1 : 0, wind: h.wind_speed_10m[i],
                })),
                days: d.time.map((date, i) => ({
                    date, code: d.weather_code[i], hi: d.temperature_2m_max[i], lo: d.temperature_2m_min[i],
                    pop: d.precipitation_probability_max[i] || 0, precip: d.precipitation_sum[i],
                    // Fresh snow in cm (precip is its water); optional, so older caches still read.
                    snow: Array.isArray(d.snowfall_sum) && num(d.snowfall_sum[i]) ? d.snowfall_sum[i] : null,
                    sunrise: d.sunrise[i] || null, sunset: d.sunset[i] || null, uv: d.uv_index_max[i] || 0,
                    windMax: d.wind_speed_10m_max[i],
                })),
            };
        } catch (e) {
            return null;
        }
    }

    const KINDS = {
        0: 'clear', 1: 'mostly-clear', 2: 'partly-cloudy', 3: 'cloudy', 45: 'fog', 48: 'fog',
        51: 'drizzle', 53: 'drizzle', 55: 'drizzle', 56: 'freezing-rain', 57: 'freezing-rain',
        66: 'freezing-rain', 67: 'freezing-rain', 61: 'rain', 63: 'rain', 65: 'heavy-rain',
        71: 'snow', 73: 'snow', 75: 'heavy-snow', 77: 'heavy-snow', 80: 'showers', 81: 'showers',
        82: 'heavy-rain', 85: 'snow-showers', 86: 'snow-showers', 95: 'thunder', 96: 'hail', 99: 'hail',
    };
    const LABELS = {
        'clear': 'Clear', 'mostly-clear': 'Mostly clear', 'partly-cloudy': 'Partly cloudy', 'cloudy': 'Cloudy',
        'fog': 'Fog', 'drizzle': 'Drizzle', 'rain': 'Rain', 'heavy-rain': 'Heavy rain',
        'freezing-rain': 'Freezing rain', 'snow': 'Snow', 'heavy-snow': 'Heavy snow', 'showers': 'Showers',
        'snow-showers': 'Snow showers', 'thunder': 'Thunderstorm', 'hail': 'Thunder and hail',
    };

    // isDay is accepted for callers that pick a night variant; the kind is the same.
    function kind(code, isDay) {
        return Object.prototype.hasOwnProperty.call(KINDS, code) ? KINDS[code] : 'cloudy';
    }

    const label = k => LABELS[k] || LABELS.cloudy;

    // The place's wall clock as epoch ms, for sky().
    const placeNow = (utcMs, utcOffsetSeconds) => utcMs + (utcOffsetSeconds || 0) * 1000;

    // now: place wall-clock ms. day: a normalized day (sunrise, sunset) plus
    // isDay (0/1) for when the sun never rises or sets.
    function sky(now, day) {
        const rise = day && str(day.sunrise) ? Date.parse(day.sunrise + 'Z') : NaN;
        const set = day && str(day.sunset) ? Date.parse(day.sunset + 'Z') : NaN;
        if (!Number.isFinite(rise) || !Number.isFinite(set)) {
            return { phase: day && day.isDay ? 'day' : 'night', t: 0.5 };
        }
        const frac = (a, b) => Math.max(0, Math.min(1, (now - a) / (b - a)));
        if (now < rise - TWILIGHT) return { phase: 'night', t: 0 };
        if (now < rise + TWILIGHT) return { phase: 'dawn', t: frac(rise - TWILIGHT, rise + TWILIGHT) };
        if (now <= set - TWILIGHT) return { phase: 'day', t: frac(rise + TWILIGHT, set - TWILIGHT) };
        if (now <= set + TWILIGHT) return { phase: 'dusk', t: frac(set - TWILIGHT, set + TWILIGHT) };
        return { phase: 'night', t: 1 };
    }

    function age(fetchedAt, now) {
        const m = Math.floor((now - fetchedAt) / MIN);
        if (!(m >= 10)) return '';   // fresh, or no time at all (NaN)
        if (m < 60) return `updated ${m} min ago`;
        const h = Math.floor(m / 60);
        if (h < 48) return `updated ${h} h ago`;
        return `updated ${Math.floor(h / 24)} days ago`;
    }

    function dayLabel(isoDate, todayIso, locale) {
        if (isoDate === todayIso) return 'Today';
        const a = Date.parse(isoDate + 'T00:00:00Z'), t = Date.parse(todayIso + 'T00:00:00Z');
        if (a - t === DAY) return 'Tomorrow';
        if (!Number.isFinite(a)) return String(isoDate);
        const fmt = loc => new Intl.DateTimeFormat(loc, { weekday: 'short', timeZone: 'UTC' }).format(new Date(a));
        try { return fmt(locale || 'en'); } catch (e) { return fmt('en'); }
    }

    // A made-up 16-day forecast from the date of `now` (UTC ms), the same
    // every time, with every kind in it.
    function sample(now) {
        // The opening days mixed, so the first screen isn't five fair days.
        const CODES = [0, 61, 71, 95, 2, 3, 45, 51, 65, 56, 75, 80, 85, 96, 82, 1];
        const start = Math.floor(now / DAY) * DAY;
        const iso = ms => new Date(ms).toISOString().slice(0, 16);
        const h = { time: [], temperature_2m: [], apparent_temperature: [], precipitation_probability: [], precipitation: [], weather_code: [], is_day: [], wind_speed_10m: [] };
        const d = { time: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [], precipitation_probability_max: [], precipitation_sum: [], snowfall_sum: [], sunrise: [], sunset: [], uv_index_max: [], wind_speed_10m_max: [] };
        for (let i = 0; i < 16; i++) {
            const t0 = start + i * DAY, code = CODES[i];
            // Snow and freezing rain on cold days, the rest mild.
            const cold = ['snow', 'heavy-snow', 'snow-showers', 'freezing-rain'].includes(kind(code));
            const hi = cold ? 1 + i % 3 : 14 + Math.round(8 * Math.sin(i * 0.7)), lo = hi - 8;
            d.time.push(iso(t0).slice(0, 10)); d.weather_code.push(code);
            d.temperature_2m_max.push(hi); d.temperature_2m_min.push(lo);
            d.precipitation_probability_max.push(code >= 51 ? 40 + (i * 7) % 50 : 5);
            d.precipitation_sum.push(code >= 51 ? 2 + i % 5 : 0);
            d.snowfall_sum.push(kind(code) === 'snow' || kind(code) === 'heavy-snow' || kind(code) === 'snow-showers' ? (2 + i % 5) * 0.7 : 0);
            d.sunrise.push(iso(t0 + 6.5 * HOUR)); d.sunset.push(iso(t0 + 18 * HOUR));
            d.uv_index_max.push(code < 3 ? 6 : 2); d.wind_speed_10m_max.push(10 + (i * 3) % 20);
            for (let hr = 0; hr < 24; hr++) {
                const warm = hi - (hi - lo) * Math.abs(hr - 15) / 15;
                h.time.push(iso(t0 + hr * HOUR)); h.temperature_2m.push(Math.round(warm));
                h.apparent_temperature.push(Math.round(warm - 1));
                h.precipitation_probability.push(code >= 51 ? 50 : 5);
                h.precipitation.push(code >= 51 ? 0.4 : 0); h.weather_code.push(code);
                h.is_day.push(hr >= 7 && hr < 18 ? 1 : 0); h.wind_speed_10m.push(8 + i % 12);
            }
        }
        const noon = start + 12 * HOUR;
        const out = normalize({
            utc_offset_seconds: 0, timezone: 'Sample/Place',
            current: { time: iso(noon), temperature_2m: 17, apparent_temperature: 16, relative_humidity_2m: 55, weather_code: 2, is_day: 1, wind_speed_10m: 11, wind_direction_10m: 240, precipitation: 0 },
            hourly: h, daily: d,
        }, now);
        out.sample = true;
        return out;
    }

    return { request, unitsFor, normalize, kind, label, placeNow, sky, age, dayLabel, sample };
})();
