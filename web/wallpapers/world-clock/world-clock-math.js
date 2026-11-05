// World Clock's maths, with no DOM, so the unit tests run it in a Node vm
// (tools/world-clock.test.mjs):
//
//   - the sun: the subsolar point from NOAA's low-precision formulas (after
//     Meeus, Astronomical Algorithms): declination and the equation of time,
//     good to about 0.01° in declination and a few seconds of time;
//   - the night (and the civil, nautical and astronomical twilight) as
//     polygons on an equirectangular map;
//   - the time in a zone, from core/clockface.js's zone helpers
//     (WP.clockface), which the catalog loads before this file;
//   - WORLD_LAND decoded.
//
// Dates are Date objects; angles are degrees; longitudes east-positive.

const WorldClockMath = (() => {
    'use strict';

    const DEG = Math.PI / 180;
    const DAY = 86400000;
    const wrap = lon => ((lon + 180) % 360 + 360) % 360 - 180;      // [−180, 180)
    const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

    // ---- The sun ------------------------------------------------------------

    // Where the sun is overhead: { lat, lon }.
    function subsolar(date) {
        const ms = date.getTime();
        const T = (ms / DAY + 2440587.5 - 2451545) / 36525;           // Julian centuries from J2000
        const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;
        const g = 357.52911 + T * (35999.05029 - 0.0001537 * T);
        const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
        const center = Math.sin(g * DEG) * (1.914602 - T * (0.004817 + 0.000014 * T))
            + Math.sin(2 * g * DEG) * (0.019993 - 0.000101 * T) + Math.sin(3 * g * DEG) * 0.000289;
        const omega = 125.04 - 1934.136 * T;
        const lambda = L0 + center - 0.00569 - 0.00478 * Math.sin(omega * DEG);
        const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
        const eps = eps0 + 0.00256 * Math.cos(omega * DEG);
        const lat = Math.asin(Math.sin(eps * DEG) * Math.sin(lambda * DEG)) / DEG;
        const y = Math.tan(eps * DEG / 2) ** 2;
        const eqTime = 4 / DEG * (y * Math.sin(2 * L0 * DEG) - 2 * e * Math.sin(g * DEG)
            + 4 * e * y * Math.sin(g * DEG) * Math.cos(2 * L0 * DEG)
            - 0.5 * y * y * Math.sin(4 * L0 * DEG) - 1.25 * e * e * Math.sin(2 * g * DEG));   // minutes
        const utcMinutes = ((ms % DAY) + DAY) % DAY / 60000;
        return { lat, lon: wrap(-(utcMinutes + eqTime - 720) / 4) };
    }

    // The sun's height above the horizon at a place, in degrees (geometric:
    // no refraction, the centre of the disc).
    function sunAltitude(lat, lon, date, sun = subsolar(date)) {
        const s = Math.sin(lat * DEG) * Math.sin(sun.lat * DEG) + Math.cos(lat * DEG) * Math.cos(sun.lat * DEG) * Math.cos((lon - sun.lon) * DEG);
        return Math.asin(clamp(s, -1, 1)) / DEG;
    }

    const isNight = (lat, lon, date) => sunAltitude(lat, lon, date) < 0;

    // ---- The night ----------------------------------------------------------

    // Where the sun is below `depth` degrees is a cap around the antisolar
    // point. On one meridian, the sun's height is a single hump in latitude,
    // so the cap cuts it in at most one interval: [lo, hi], or null.
    // That holds through the poles too: a cap over a pole gives every
    // meridian an interval ending at ±90, and the polygon runs along the
    // map's edge there.
    function interval(sun, lon, k) {
        const a = Math.sin(sun.lat * DEG);
        const b = Math.cos(sun.lat * DEG) * Math.cos((lon - sun.lon) * DEG);
        // sin(altitude) = a sin φ + b cos φ = R cos(φ − φ0); night where it's below k.
        const R = Math.hypot(a, b);
        if (R < 1e-12) return k > 0 ? [-90, 90] : null;
        if (-k / R >= 1) return null;
        const w = -k / R <= -1 ? 180 : Math.acos(-k / R) / DEG;      // half-width around the coldest latitude
        const cold = Math.atan2(-a, -b) / DEG;                         // where R cos(φ − φ0) is least
        const lo = Math.max(-90, cold - w), hi = Math.min(90, cold + w);
        return lo <= hi ? [lo, hi] : null;
    }

    // The rings where the sun is below `depth`, sampled at `steps` meridians.
    // Each run of meridians with night makes one ring: the northern edge west
    // to east, then the southern edge back. Where a run ends inside the map,
    // its true end (where the interval closes to a point) is found by halving.
    function night(date, depth, steps) {
        const sun = subsolar(date);
        const k = Math.sin(depth * DEG);
        const n = Math.max(4, Math.round(steps) || 180);
        const at = lon => interval(sun, lon, k);
        const edge = (dark, light) => {
            for (let i = 0; i < 24; i++) {
                const mid = (dark + light) / 2;
                if (at(mid)) dark = mid; else light = mid;
            }
            return dark;
        };
        const rings = [];
        let run = null;
        const close = () => {
            if (run && run.length) {
                const ring = [...run.map(([lon, iv]) => [lon, iv[1]]), ...run.reverse().map(([lon, iv]) => [lon, iv[0]])];
                if (ring.length >= 3) rings.push(ring);
            }
            run = null;
        };
        let last = null;
        for (let i = 0; i <= n; i++) {
            const lon = -180 + 360 * i / n;
            const iv = at(lon);
            if (iv && !run) {
                run = [];
                if (i > 0) { const start = edge(lon, last); run.push([start, at(start)]); }
            }
            if (!iv && run) { const end = edge(last, lon); run.push([end, at(end)]); close(); }
            if (iv) run.push([lon, iv]);
            last = lon;
        }
        close();
        return rings;
    }

    // The night (the sun below the horizon) as [lon, lat] rings.
    const terminator = (date, steps = 180) => night(date, 0, steps);
    // The sun below `depth` degrees: −6 civil, −12 nautical, −18 astronomical.
    const twilight = (date, depth, steps = 180) => night(date, -Math.abs(depth), steps);

    // ---- Zones --------------------------------------------------------------

    const C = () => globalThis.WP.clockface;
    const formats = new Map();
    const format = (locale, options) => {
        const key = `${locale}|${JSON.stringify(options)}`;
        if (!formats.has(key)) {
            let f;
            try { f = new Intl.DateTimeFormat(locale, options); } catch { f = new Intl.DateTimeFormat('en-US', options); }
            formats.set(key, f);
        }
        return formats.get(key);
    };
    const dayNumber = p => Date.UTC(p.year, p.month - 1, p.day) / DAY;

    // The time in `zone` ('local' for the device's own). hour12: true, false,
    // or undefined for the locale's habit. dayDelta is that zone's date
    // against `local`'s (the device's, unless a zone is given): −1, 0 or +1.
    // A zone Intl doesn't know reads as UTC, with valid: false.
    function zoneTime(date, zone, locale, { hour12, seconds = false, local = 'local' } = {}) {
        const clock = C();
        const valid = clock.validZone(zone);
        const id = valid ? zone : 'UTC';
        const p = clock.parts(date, id);
        const options = { timeZone: id === 'local' ? undefined : id, hour: 'numeric', minute: '2-digit' };
        if (seconds) options.second = '2-digit';
        if (hour12 !== undefined) options.hourCycle = hour12 ? 'h12' : 'h23';
        const text = format(locale, options).format(date);
        const dayDelta = clamp(Math.round(dayNumber(p) - dayNumber(clock.parts(date, local))), -1, 1);
        return { text, hours: p.hour, minutes: p.minute, seconds: p.second, offsetMinutes: clock.offsetMinutes(date, id),
            abbreviation: clock.abbreviation(date, id), dayDelta, valid };
    }

    // UTC+5:30, UTC−3:30 (a true minus sign), UTC.
    const offsetLabel = minutes => C().offsetLabel(minutes);

    // ---- Land ---------------------------------------------------------------

    let land = null;
    // WORLD_LAND as rings of [lon, lat] in degrees, decoded once.
    function decodeLand() {
        if (land) return land;
        const source = typeof WORLD_LAND === 'undefined' ? [] : WORLD_LAND;
        land = source.map(flat => {
            const ring = [];
            let x = 0, y = 0;
            for (let i = 0; i + 1 < flat.length; i += 2) {
                x += flat[i]; y += flat[i + 1];
                ring.push([x / 10, y / 10]);
            }
            return ring;
        });
        return land;
    }

    return { subsolar, sunAltitude, isNight, terminator, twilight, zoneTime, offsetLabel, land: decodeLand };
})();
