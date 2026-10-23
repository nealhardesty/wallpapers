// The sea's state for Lighthouse: the four presets, and the live swell from
// Open-Meteo's marine forecast (keyless, CORS-enabled). Pure functions, no
// DOM; the unit tests load this file in a Node vm (tools/lighthouse.test.mjs).

const LighthouseSea = (() => {
    'use strict';

    // Points far out at sea, a few hundred miles from any coast, so the
    // swell is the ocean's own. Whole degrees on purpose: no one lives there.
    const POINTS = {
        'north-atlantic': { lat: 45, lon: -35, name: 'mid North Atlantic' },
        'north-pacific': { lat: 38, lon: -160, name: 'mid North Pacific' },
        'southern-ocean': { lat: -52, lon: 60, name: 'the Southern Ocean' },
        'trade-winds': { lat: 15, lon: -40, name: 'the tropical Atlantic' },
        'indian-ocean': { lat: -25, lon: 80, name: 'mid Indian Ocean' },
    };

    // Significant wave height (m) and peak period (s) for each preset.
    const STATES = {
        calm: { height: 0.4, period: 6, direction: 280 },
        moderate: { height: 1.6, period: 8, direction: 290 },
        rough: { height: 3.4, period: 10, direction: 300 },
        gale: { height: 7, period: 12, direction: 310 },
    };

    const HOUR = 3600 * 1000;
    const REFRESH_MS = HOUR;       // ask again once an hour
    const STALE_MS = 3 * HOUR;     // a forecast hour this far from now is too old to show

    const url = key => {
        const point = POINTS[key] || POINTS['north-atlantic'];
        return `https://marine-api.open-meteo.com/v1/marine?latitude=${point.lat}&longitude=${point.lon}`
            + '&hourly=wave_height,wave_period,wave_direction&forecast_days=2&timezone=GMT';
    };

    // Keep only what we use: a forecast, hour by hour, in UTC milliseconds.
    // Anything malformed is null, so a bad answer never reaches the waves.
    function trim(json) {
        const hourly = json?.hourly;
        if (!hourly || !Array.isArray(hourly.time)) return null;
        const hours = [];
        hourly.time.forEach((time, i) => {
            const at = Date.parse(/Z$|[+-]\d\d:?\d\d$/.test(time) ? time : `${time}Z`);
            const height = Number(hourly.wave_height?.[i]), period = Number(hourly.wave_period?.[i]);
            const direction = Number(hourly.wave_direction?.[i]);
            if (!Number.isFinite(at) || !Number.isFinite(height) || !Number.isFinite(period) || hourly.wave_height[i] === null) return;
            hours.push([at, +height.toFixed(2), +period.toFixed(1), Number.isFinite(direction) ? Math.round(direction) : 270]);
        });
        return hours.length ? hours : null;
    }

    // The forecast hour nearest `now` (ms), if it's close enough to trust.
    function pick(hours, now) {
        let best = null;
        for (const hour of hours || []) if (!best || Math.abs(hour[0] - now) < Math.abs(best[0] - now)) best = hour;
        if (!best || Math.abs(best[0] - now) > STALE_MS) return null;
        return { at: best[0], height: Math.min(15, Math.max(0, best[1])), period: Math.min(25, Math.max(3, best[2])), direction: best[3] };
    }

    // How stormy, 0 (glassy) to 1 (gale), from the wave height.
    const storm = height => Math.min(1, Math.max(0, (height - 0.4) / 6));

    return { POINTS, STATES, REFRESH_MS, url, trim, pick, storm };
})();

globalThis.LighthouseSea = LighthouseSea;   // for the unit tests, which load this in a vm
