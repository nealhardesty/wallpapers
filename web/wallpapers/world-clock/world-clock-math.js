// World Clock's maths, with no DOM, so the unit tests run it in a Node vm
// (tools/world-clock.test.mjs):
//
//   - the sun: the subsolar point from NOAA's low-precision formulas (after
//     Meeus, Astronomical Algorithms): declination and the equation of time,
//     good to about 0.01° in declination and a few seconds of time;
//   - the night (and the civil, nautical and astronomical twilight) as
//     polygons on an equirectangular map;
//   - the moon's sub-lunar point and phase, low precision;
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

    // ---- The moon -----------------------------------------------------------

    // Where the moon is overhead, and its phase: { lat, lon, age, illum }.
    // age is 0 at new moon, 0.5 at full; illum the lit share of the disc.
    // The low-precision series (the largest terms of Meeus ch. 47, as in the
    // Astronomical Almanac's own short form): about 0.3° on the sky, plus up
    // to a degree of parallax, since this is the geocentric point.
    function sublunar(date) {
        const d = date.getTime() / DAY + 2440587.5 - 2451545;          // days from J2000
        const r = x => x * DEG;
        const Lp = 218.316 + 13.176396 * d, Mp = 134.963 + 13.064993 * d, Ms = 357.529 + 0.98560028 * d;
        const D = 297.850 + 12.190749 * d, F = 93.272 + 13.229350 * d;
        const lambda = Lp + 6.289 * Math.sin(r(Mp)) + 1.274 * Math.sin(r(2 * D - Mp)) + 0.658 * Math.sin(r(2 * D))
            + 0.214 * Math.sin(r(2 * Mp)) - 0.186 * Math.sin(r(Ms)) - 0.114 * Math.sin(r(2 * F));
        const beta = 5.128 * Math.sin(r(F)) + 0.281 * Math.sin(r(Mp + F)) + 0.278 * Math.sin(r(Mp - F)) + 0.173 * Math.sin(r(2 * D - F));
        const eps = r(23.439 - 0.0000004 * d);
        const l = r(lambda), b = r(beta);
        const ra = Math.atan2(Math.sin(l) * Math.cos(eps) - Math.tan(b) * Math.sin(eps), Math.cos(l)) / DEG;
        const dec = Math.asin(clamp(Math.sin(b) * Math.cos(eps) + Math.cos(b) * Math.sin(eps) * Math.sin(l), -1, 1)) / DEG;
        const gmst = 280.46061837 + 360.98564736629 * d;
        // The sun's ecliptic longitude, for the phase.
        const g = r(357.528 + 0.9856003 * d);
        const sun = 280.460 + 0.9856474 * d + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g);
        const elongation = ((lambda - sun) % 360 + 360) % 360;
        return { lat: dec, lon: wrap(ra - gmst), age: elongation / 360, illum: (1 - Math.cos(r(elongation))) / 2 };
    }

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

    // The custom zones setting: "Label=Area/City" pairs, separated by commas
    // (or new lines, or semicolons). { zones: [{ label, zone }], bad: [{ text,
    // why }] }; a label is cut to 24 characters, and a zone Intl doesn't know
    // is bad, not UTC.
    function parseCustom(text) {
        const zones = [], bad = [];
        for (const raw of String(text || '').split(/[,;\n]/)) {
            const item = raw.trim();
            if (!item) continue;
            const m = /^([^=]+)=\s*(.+)$/.exec(item);
            const label = m?.[1].trim().slice(0, 24), zone = m?.[2].trim();
            if (!m || !label) bad.push({ text: item, why: 'write it as Label=Area/City' });
            else if (zone === 'local' || !C().validZone(zone)) bad.push({ text: item, why: `${zone} isn’t a time zone` });
            else zones.push({ label, zone });
        }
        return { zones, bad };
    }

    // Places ({ lon, offsetMinutes }) in the order the sort setting asks:
    // 'list' as given, 'east-west' from the west, 'offset' from the
    // earliest. Stable, so equal ones keep their order.
    function order(places, sort) {
        const by = sort === 'east-west' ? p => p.lon : sort === 'offset' ? p => p.offsetMinutes : null;
        return by ? places.map((p, i) => [p, i]).sort((a, b) => by(a[0]) - by(b[0]) || a[1] - b[1]).map(([p]) => p) : [...places];
    }

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

    return { subsolar, sunAltitude, isNight, sublunar, terminator, twilight, zoneTime, offsetLabel, parseCustom, order, land: decodeLand };
})();
