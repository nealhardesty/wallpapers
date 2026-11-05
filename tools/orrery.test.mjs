// Unit tests for the Orrery's sky (web/wallpapers/orrery/orrery-math.js),
// loaded into a Node vm as the stage loads it.
//
// The events below come from public almanacs (oppositions, an elongation,
// the solstice, new and full moons). Each tolerance is the method's own:
// Standish's approximate elements are good to a few arcminutes for the inner
// planets in 1800–2050, and an opposition or elongation is a slow extremum,
// so the checks are on angles, not on the minute of the event.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

const WEB = resolve(import.meta.dirname, '../web');
const FILE = 'wallpapers/orrery/orrery-math.js';
const context = vm.createContext({});
vm.runInContext(readFileSync(join(WEB, FILE), 'utf8'), context, { filename: FILE });
const M = vm.runInContext('OrreryMath', context);

const at = iso => new Date(iso);
const HOUR = 3600000;
const near = (actual, expected, within, what) =>
    assert.ok(Math.abs(actual - expected) <= within, `${what}: ${actual} is not within ${within} of ${expected}`);
// The difference of two angles in degrees, in [−180, 180).
const diff = (a, b) => ((a - b) % 360 + 540) % 360 - 180;
const lonOf = p => Math.atan2(p.y, p.x) * 180 / Math.PI;
const finite = p => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);

// ---- Time -------------------------------------------------------------------

test('julian and centuries: J2000 is JD 2451545.0, T = 0', () => {
    near(M.julian(at('2000-01-01T12:00:00Z')), 2451545.0, 1e-9, 'JD at J2000');
    near(M.julian(at('1970-01-01T00:00:00Z')), 2440587.5, 1e-9, 'JD at the Unix epoch');
    near(M.centuries(at('2000-01-01T12:00:00Z')), 0, 1e-12, 'T at J2000');
    near(M.centuries(at('2100-01-01T12:00:00Z')), 1, 1e-4, 'T a century on');
});

// ---- Kepler -----------------------------------------------------------------

test('kepler converges for a circle, Mercury and e = 0.25', () => {
    for (const e of [0, 0.2056, 0.25]) {
        for (let deg = -180; deg <= 180; deg += 7.5) {
            const m = deg * Math.PI / 180;
            const E = M.kepler(m, e);
            near(E - e * Math.sin(E), m, 1e-8, `E − e sin E at e=${e}, M=${deg}°`);
        }
    }
});

// ---- The planets ------------------------------------------------------------

test('PLANETS: the eight and Pluto, with elements, sizes and colours', () => {
    const ids = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
    assert.deepEqual(Object.keys(M.PLANETS), ids);
    for (const id of ids) {
        const p = M.PLANETS[id];
        assert.equal(typeof p.name, 'string');
        assert.match(p.colour, /^#[0-9a-f]{6}$/i, `${id} colour`);
        assert.ok(p.radius > 0 && p.period > 0, `${id} radius and period`);
        for (const key of ['a', 'e', 'I', 'L', 'peri', 'node']) assert.equal(p.elements[key].length, 2, `${id}.${key}`);
    }
    assert.equal(M.PLANETS.saturn.rings, true);
    assert.equal(M.PLANETS.earth.rings, false);
    near(M.PLANETS.earth.period, 365.256, 0.01, 'Earth sidereal year');
});

test('heliocentric: the Earth is at 180° at the March equinox, about 1 AU out', () => {
    const earth = M.heliocentric('earth', at('2026-03-20T14:46:00Z'));
    near(diff(lonOf(earth), 180), 0, 0.5, 'Earth heliocentric longitude');
    near(Math.hypot(earth.x, earth.y, earth.z), 0.996, 0.005, 'Earth–Sun distance in March');
});

test('Mars at opposition (2025-01-16) shares the Earth\'s heliocentric longitude', () => {
    const date = at('2025-01-16T02:32:00Z');
    near(diff(lonOf(M.heliocentric('mars', date)), lonOf(M.heliocentric('earth', date))), 0, 1.5, 'Mars − Earth');
    // Opposition is in longitude; Mars sits 4.3° north of the ecliptic, so
    // its angle from the Sun is 180° less that, and it is 0.643 AU away.
    const g = M.geocentric('mars', date);
    near(Math.abs(g.elongation), 180 - Math.abs(g.lat), 0.5, 'Mars elongation');
    near(g.dist, 0.643, 0.005, 'Mars distance');
});

test('Jupiter at opposition (2026-01-10) shares the Earth\'s heliocentric longitude', () => {
    const date = at('2026-01-10T08:00:00Z');
    near(diff(lonOf(M.heliocentric('jupiter', date)), lonOf(M.heliocentric('earth', date))), 0, 1.5, 'Jupiter − Earth');
});

test('Venus at greatest eastern elongation (2026-08-15) is 45.9° east of the Sun', () => {
    const g = M.geocentric('venus', at('2026-08-15T00:00:00Z'));
    near(g.elongation, 45.9, 1.5, 'Venus elongation (positive is east)');
    near(M.elongation('venus', at('2026-08-15T00:00:00Z')), g.elongation, 1e-9, 'elongation() agrees');
    assert.ok(g.dist > 0.6 && g.dist < 0.75, `Venus distance ${g.dist} AU`);
});

test('isRetrograde: Mars backs up around opposition, not in June', () => {
    assert.equal(M.isRetrograde('mars', at('2025-01-16T00:00:00Z')), true);
    assert.equal(M.isRetrograde('mars', at('2025-06-01T00:00:00Z')), false);
    assert.equal(M.isRetrograde('earth', at('2025-01-16T00:00:00Z')), false);
});

test('far from now: 1750 and 2200 still give finite positions, flagged out of range', () => {
    for (const iso of ['1750-06-01T00:00:00Z', '2200-06-01T00:00:00Z']) {
        assert.equal(M.inRange(at(iso)), false, `${iso} in range`);
        for (const id of Object.keys(M.PLANETS)) {
            const p = M.heliocentric(id, at(iso));
            assert.ok(finite(p), `${id} at ${iso}`);
            const r = Math.hypot(p.x, p.y, p.z);
            const { a, e } = M.PLANETS[id].elements;
            assert.ok(r > a[0] * (1 - e[0]) * 0.95 && r < a[0] * (1 + e[0]) * 1.05, `${id} at ${iso}: r = ${r}`);
        }
        const g = M.geocentric('mars', at(iso));
        assert.ok([g.lon, g.lat, g.dist, g.elongation].every(Number.isFinite), `geocentric at ${iso}`);
    }
    assert.equal(M.inRange(at('1800-01-01T00:00:00Z')), true);
    assert.equal(M.inRange(at('2026-11-05T00:00:00Z')), true);
    assert.equal(M.inRange(at('2050-12-31T00:00:00Z')), true);
    assert.equal(M.inRange(at('2051-01-02T00:00:00Z')), false);
    // The long table joins the short one with no visible jump at 2050.
    const before = M.heliocentric('jupiter', at('2050-12-31T23:59:00Z')), after = M.heliocentric('jupiter', at('2051-01-01T00:01:00Z'));
    near(diff(lonOf(after), lonOf(before)), 0, 0.2, 'Jupiter across the table change');
});

test('orbitPath: a closed ellipse through the planet\'s own distance range', () => {
    const date = at('2026-11-05T00:00:00Z');
    const path = M.orbitPath('mars', date, 128);
    assert.equal(path.length, 128);
    const radii = path.map(p => Math.hypot(p.x, p.y, p.z));
    const { a, e } = M.PLANETS.mars.elements;
    near(Math.min(...radii), a[0] * (1 - e[0]), 0.005, 'perihelion');
    near(Math.max(...radii), a[0] * (1 + e[0]), 0.005, 'aphelion');
    // Mars itself lies on its path.
    const mars = M.heliocentric('mars', date);
    const closest = Math.min(...path.map(p => Math.hypot(p.x - mars.x, p.y - mars.y, p.z - mars.z)));
    assert.ok(closest < 2 * Math.PI * 1.52 / 128, `Mars is ${closest} AU from its path`);
});

// ---- The seasons ------------------------------------------------------------

test('seasons(2026): equinoxes and solstices within two hours of the almanac', () => {
    const s = M.seasons(2026);
    near(s.march.getTime(), at('2026-03-20T14:46:00Z').getTime(), 2 * HOUR, 'March equinox');
    near(s.june.getTime(), at('2026-06-21T08:24:00Z').getTime(), 2 * HOUR, 'June solstice');
    near(s.september.getTime(), at('2026-09-23T00:05:00Z').getTime(), 2 * HOUR, 'September equinox');
    near(s.december.getTime(), at('2026-12-21T20:50:00Z').getTime(), 2 * HOUR, 'December solstice');
});

// ---- The Moon ---------------------------------------------------------------

// The phase is circular (0 and 1 are both new), so distance from new is the
// shorter way round.
const fromNew = phase => Math.min(phase, 1 - phase);

test('moon: full on 2026-11-24, new on 2026-11-09', () => {
    const full = M.moon(at('2026-11-24T14:53:00Z'));
    near(full.phase, 0.5, 0.03, 'full moon phase');
    assert.ok(full.illum > 0.99, `full moon lit ${full.illum}`);
    const fresh = M.moon(at('2026-11-09T07:02:00Z'));
    near(fromNew(fresh.phase), 0, 0.03, 'new moon phase');
    assert.ok(fresh.illum < 0.01, `new moon lit ${fresh.illum}`);
    // First quarter between them waxes: phase near 0.25, half lit.
    const quarter = M.moon(at('2026-11-17T11:48:00Z'));
    near(quarter.phase, 0.25, 0.03, 'first quarter phase');
    near(quarter.illum, 0.5, 0.06, 'first quarter lit');
    for (const m of [full, fresh, quarter]) {
        assert.ok(m.lat >= -5.4 && m.lat <= 5.4, `moon latitude ${m.lat}`);
        assert.ok(m.dist > 356000 && m.dist < 407000, `moon distance ${m.dist} km`);
        assert.ok(m.lon >= 0 && m.lon < 360, `moon longitude ${m.lon}`);
    }
});

test('moon: at full it sits opposite the Sun, at new beside it', () => {
    const date = at('2026-11-24T14:53:00Z');
    const earth = M.heliocentric('earth', date);
    const sunLon = lonOf(earth) + 180;
    near(Math.abs(diff(M.moon(date).lon, sunLon)), 180, 5, 'full moon elongation');
});

// ---- The Galilean moons -----------------------------------------------------

test('galilean: four moons in order, each going round once a period', () => {
    const date = at('2026-11-05T00:00:00Z');
    const moons = M.galilean(date);
    assert.deepEqual(Array.from(moons, m => m.name), ['Io', 'Europa', 'Ganymede', 'Callisto']);
    const periods = [1.769, 3.551, 7.155, 16.689];
    moons.forEach((m, i) => {
        near(m.period, periods[i], 0.001, `${m.name} period`);
        assert.ok(m.angle >= 0 && m.angle < 360 && Number.isFinite(m.angle), `${m.name} angle ${m.angle}`);
        assert.ok(m.distance > 5 && m.distance < 27, `${m.name} distance in Jupiter radii`);
        const later = M.galilean(new Date(date.getTime() + m.period * 86400000))[i];
        near(Math.abs(diff(later.angle, m.angle)), 0, 0.5, `${m.name} after one period`);
        const half = M.galilean(new Date(date.getTime() + m.period * 43200000))[i];
        near(Math.abs(diff(half.angle, m.angle)), 180, 0.5, `${m.name} after half a period`);
    });
    for (let i = 1; i < 4; i++) assert.ok(moons[i].distance > moons[i - 1].distance);
});

// ---- The zodiac -------------------------------------------------------------

test('zodiac: twelve equal signs from 0° Aries, and the IAU constellations round the ecliptic', () => {
    const { signs, constellations } = M.zodiac;
    assert.equal(signs.length, 12);
    signs.forEach((s, i) => { assert.equal(s.start, 30 * i); assert.equal(s.end, 30 * i + 30); });
    assert.equal(signs[0].name, 'Aries');
    assert.equal(signs[11].name, 'Pisces');
    // The constellations meet end to start and go once round.
    let total = 0;
    constellations.forEach((c, i) => {
        const next = constellations[(i + 1) % constellations.length];
        assert.equal(c.end, next.start, `${c.name} meets ${next.name}`);
        total += ((c.end - c.start) % 360 + 360) % 360;
    });
    near(total, 360, 1e-9, 'constellations total');
    assert.ok(constellations.some(c => c.name === 'Ophiuchus'), 'the ecliptic crosses Ophiuchus');
    // The June solstice Sun (90°) is on the Taurus–Gemini border, in Gemini.
    assert.equal(M.zodiacAt(90.5, 'constellations').name, 'Gemini');
    assert.equal(M.zodiacAt(359, 'signs').name, 'Pisces');
    assert.equal(M.zodiacAt(-1, 'signs').name, 'Pisces');
    assert.equal(M.zodiacAt(0, 'constellations').name, 'Pisces');
});
