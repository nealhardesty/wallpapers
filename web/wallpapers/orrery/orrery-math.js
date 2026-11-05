// The Orrery's sky, with no DOM, so the unit tests run it in a Node vm
// (tools/orrery.test.mjs):
//
//   - the planets from E. M. Standish's "Keplerian Elements for Approximate
//     Positions of the Major Planets" (JPL): Table 1 (1800–2050) inside that
//     range, Tables 2a and 2b (3000 BC–3000 AD) outside it. Table 1 is good
//     to a few arcminutes for the inner planets; outside 1800–2050 the
//     positions are still computed, but inRange() says they're approximate;
//   - Kepler's equation by Newton's method;
//   - the Moon's position and phase from the largest terms of Meeus,
//     Astronomical Algorithms ch. 47 (about 0.3°), the same short series as
//     World Clock's sub-lunar point (world-clock-math.js), plus distance;
//   - the Galilean moons on circular orbits, from the mean longitudes of
//     Meeus ch. 44;
//   - the zodiac: equal signs and the IAU constellations along the ecliptic;
//   - the equinoxes and solstices, by bisection on the Sun's longitude.
//
// Dates are Date objects; angles are degrees; positions are in AU in the
// J2000 ecliptic frame (x towards the J2000 equinox, z to ecliptic north).
// Standish's time is TDB; the minute or so between it and UTC is ignored.

const OrreryMath = (() => {
    'use strict';

    const DEG = Math.PI / 180;
    const DAY = 86400000;
    const J2000 = 2451545.0;
    const norm = a => (a % 360 + 360) % 360;                         // [0, 360)
    const signed = a => (a % 360 + 540) % 360 - 180;                 // [−180, 180)

    // ---- Time ---------------------------------------------------------------

    const julian = date => date.getTime() / DAY + 2440587.5;
    const centuries = date => (julian(date) - J2000) / 36525;
    const FROM = Date.UTC(1800, 0, 1), UNTIL = Date.UTC(2051, 0, 1);
    const inRange = date => date.getTime() >= FROM && date.getTime() < UNTIL;

    // ---- The planets --------------------------------------------------------

    // Each element is [value at J2000, rate per Julian century]: a in AU, e,
    // and I, L (mean longitude), peri (longitude of perihelion) and node
    // (longitude of the ascending node) in degrees. `elements` is Table 1,
    // `long` Tables 2a and 2b (b, c, s, f add b T² + c cos fT + s sin fT to
    // the mean anomaly). The current JPL page drops Pluto; its rows are from
    // the earlier edition of the same document. Earth is the Earth–Moon
    // barycentre, a few thousand km from the Earth itself.
    const row = (a, e, I, L, peri, node) => ({ a, e, I, L, peri, node });
    const PLANETS = {
        mercury: {
            name: 'Mercury', radius: 2439.7, colour: '#9c9890', rings: false, period: 87.969,
            elements: row([0.38709927, 0.00000037], [0.20563593, 0.00001906], [7.00497902, -0.00594749],
                [252.25032350, 149472.67411175], [77.45779628, 0.16047689], [48.33076593, -0.12534081]),
            long: row([0.38709843, 0], [0.20563661, 0.00002123], [7.00559432, -0.00590158],
                [252.25166724, 149472.67486623], [77.45771895, 0.15940013], [48.33961819, -0.12214182]),
        },
        venus: {
            name: 'Venus', radius: 6051.8, colour: '#e8cf9a', rings: false, period: 224.701,
            elements: row([0.72333566, 0.00000390], [0.00677672, -0.00004107], [3.39467605, -0.00078890],
                [181.97909950, 58517.81538729], [131.60246718, 0.00268329], [76.67984255, -0.27769418]),
            long: row([0.72332102, -0.00000026], [0.00676399, -0.00005107], [3.39777545, 0.00043494],
                [181.97970850, 58517.81560260], [131.76755713, 0.05679648], [76.67261496, -0.27274174]),
        },
        earth: {
            name: 'Earth', radius: 6371.0, colour: '#4f8fd8', rings: false, period: 365.256,
            elements: row([1.00000261, 0.00000562], [0.01671123, -0.00004392], [-0.00001531, -0.01294668],
                [100.46457166, 35999.37244981], [102.93768193, 0.32327364], [0, 0]),
            long: row([1.00000018, -0.00000003], [0.01673163, -0.00003661], [-0.00054346, -0.01337178],
                [100.46691572, 35999.37306329], [102.93005885, 0.31795260], [-5.11260389, -0.24123856]),
        },
        mars: {
            name: 'Mars', radius: 3389.5, colour: '#c8643c', rings: false, period: 686.980,
            elements: row([1.52371034, 0.00001847], [0.09339410, 0.00007882], [1.84969142, -0.00813131],
                [-4.55343205, 19140.30268499], [-23.94362959, 0.44441088], [49.55953891, -0.29257343]),
            long: row([1.52371243, 0.00000097], [0.09336511, 0.00009149], [1.85181869, -0.00724757],
                [-4.56813164, 19140.29934243], [-23.91744784, 0.45223625], [49.71320984, -0.26852431]),
        },
        jupiter: {
            name: 'Jupiter', radius: 69911, colour: '#d8b48a', rings: false, period: 4332.59,
            elements: row([5.20288700, -0.00011607], [0.04838624, -0.00013253], [1.30439695, -0.00183714],
                [34.39644051, 3034.74612775], [14.72847983, 0.21252668], [100.47390909, 0.20469106]),
            long: row([5.20248019, -0.00002864], [0.04853590, 0.00018026], [1.29861416, -0.00322699],
                [34.33479152, 3034.90371757], [14.27495244, 0.18199196], [100.29282654, 0.13024619]),
            extra: { b: -0.00012452, c: 0.06064060, s: -0.35635438, f: 38.35125000 },
        },
        saturn: {
            name: 'Saturn', radius: 58232, colour: '#e3cf98', rings: true, period: 10759.22,
            elements: row([9.53667594, -0.00125060], [0.05386179, -0.00050991], [2.48599187, 0.00193609],
                [49.95424423, 1222.49362201], [92.59887831, -0.41897216], [113.66242448, -0.28867794]),
            long: row([9.54149883, -0.00003065], [0.05550825, -0.00032044], [2.49424102, 0.00451969],
                [50.07571329, 1222.11494724], [92.86136063, 0.54179478], [113.63998702, -0.25015002]),
            extra: { b: 0.00025899, c: -0.13434469, s: 0.87320147, f: 38.35125000 },
        },
        uranus: {
            name: 'Uranus', radius: 25362, colour: '#9fd8de', rings: true, period: 30685.4,
            elements: row([19.18916464, -0.00196176], [0.04725744, -0.00004397], [0.77263783, -0.00242939],
                [313.23810451, 428.48202785], [170.95427630, 0.40805281], [74.01692503, 0.04240589]),
            long: row([19.18797948, -0.00020455], [0.04685740, -0.00001550], [0.77298127, -0.00180155],
                [314.20276625, 428.49512595], [172.43404441, 0.09266985], [73.96250215, 0.05739699]),
            extra: { b: 0.00058331, c: -0.97731848, s: 0.17689245, f: 7.67025000 },
        },
        neptune: {
            name: 'Neptune', radius: 24622, colour: '#4a6fd8', rings: false, period: 60189,
            elements: row([30.06992276, 0.00026291], [0.00859048, 0.00005105], [1.77004347, 0.00035372],
                [-55.12002969, 218.45945325], [44.96476227, -0.32241464], [131.78422574, -0.00508664]),
            long: row([30.06952752, 0.00006447], [0.00895439, 0.00000818], [1.77005520, 0.00022400],
                [304.22289287, 218.46515314], [46.68158724, 0.01009938], [131.78635853, -0.00606302]),
            extra: { b: -0.00041348, c: 0.68346318, s: -0.10162547, f: 7.67025000 },
        },
        pluto: {
            name: 'Pluto', radius: 1188.3, colour: '#c9b39a', rings: false, period: 90560, dwarf: true,
            elements: row([39.48211675, -0.00031596], [0.24882730, 0.00005170], [17.14001206, 0.00004818],
                [238.92903833, 145.20780515], [224.06891629, -0.04062942], [110.30393684, -0.01183482]),
            long: row([39.48686035, 0.00449751], [0.24885238, 0.00006016], [17.14104260, 0.00000501],
                [238.96535011, 145.18042903], [224.09702598, -0.00968827], [110.30167986, -0.00809981]),
            extra: { b: -0.01262724, c: 0, s: 0, f: 0 },
        },
    };

    // E − e sin E = M, in radians, by Newton from E₀ = M + e sin M. Converges
    // in a handful of steps for every eccentricity here (Pluto's is 0.249).
    function kepler(m, e) {
        let E = m + e * Math.sin(m);
        for (let i = 0; i < 30; i++) {
            const dE = (m - (E - e * Math.sin(E))) / (1 - e * Math.cos(E));
            E += dE;
            if (Math.abs(dE) < 1e-8) break;
        }
        return E;
    }

    // The osculating-ish elements at a date: { a, e, I, node, w, M } (angles
    // in degrees; M in [−180, 180)).
    function elementsAt(id, date) {
        const p = PLANETS[id];
        const T = centuries(date);
        const short = inRange(date);
        const t = short ? p.elements : p.long;
        const at = ([v, rate]) => v + rate * T;
        const L = at(t.L), peri = at(t.peri), node = at(t.node);
        let M = L - peri;
        if (!short && p.extra) {
            const { b, c, s, f } = p.extra;
            M += b * T * T + c * Math.cos(f * T * DEG) + s * Math.sin(f * T * DEG);
        }
        return { a: at(t.a), e: at(t.e), I: at(t.I), node, w: peri - node, M: signed(M) };
    }

    // A point on the orbit at eccentric anomaly E (radians), rotated into the
    // ecliptic.
    function place(el, E) {
        const xp = el.a * (Math.cos(E) - el.e), yp = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
        const w = el.w * DEG, O = el.node * DEG, I = el.I * DEG;
        const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), cI = Math.cos(I), sI = Math.sin(I);
        return {
            x: (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
            y: (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
            z: (sw * sI) * xp + (cw * sI) * yp,
        };
    }

    function heliocentric(id, date) {
        const el = elementsAt(id, date);
        return place(el, kepler(el.M * DEG, el.e));
    }

    // The ellipse at a date, as `points` points (not repeating the first).
    function orbitPath(id, date, points = 128) {
        const el = elementsAt(id, date);
        const n = Math.max(3, Math.round(points));
        return Array.from({ length: n }, (_, i) => place(el, 2 * Math.PI * i / n));
    }

    const lonLat = v => ({
        lon: norm(Math.atan2(v.y, v.x) / DEG),
        lat: Math.atan2(v.z, Math.hypot(v.x, v.y)) / DEG,
        dist: Math.hypot(v.x, v.y, v.z),
    });

    // Seen from the Earth: { lon, lat, dist (AU), elongation }. Elongation is
    // the angle from the Sun, positive east of it (an evening star), negative
    // west.
    function geocentric(id, date) {
        const earth = heliocentric('earth', date);
        const p = id === 'earth' ? earth : heliocentric(id, date);
        const v = { x: p.x - earth.x, y: p.y - earth.y, z: p.z - earth.z };
        const out = lonLat(v);
        if (id === 'earth') return { lon: 0, lat: 0, dist: 0, elongation: 0 };
        const sun = { x: -earth.x, y: -earth.y, z: -earth.z };
        const cos = (v.x * sun.x + v.y * sun.y + v.z * sun.z) / (out.dist * Math.hypot(sun.x, sun.y, sun.z));
        const angle = Math.acos(Math.min(1, Math.max(-1, cos))) / DEG;
        const sunLon = norm(Math.atan2(sun.y, sun.x) / DEG);
        out.elongation = signed(out.lon - sunLon) >= 0 ? angle : -angle;
        return out;
    }

    const elongation = (id, date) => geocentric(id, date).elongation;

    // Retrograde: the geocentric longitude falling across the day around `date`.
    function isRetrograde(id, date) {
        if (id === 'earth') return false;
        const t = date.getTime();
        return signed(geocentric(id, new Date(t + DAY / 2)).lon - geocentric(id, new Date(t - DAY / 2)).lon) < 0;
    }

    // ---- The Sun and the seasons --------------------------------------------

    // The Sun's apparent longitude of date: the Earth's J2000 heliocentric
    // longitude turned round, precessed to the date, with aberration and
    // the main nutation term.
    function sunLongitude(date) {
        const T = centuries(date);
        const earth = heliocentric('earth', date);
        const omega = (125.04 - 1934.136 * T) * DEG;
        return norm(Math.atan2(earth.y, earth.x) / DEG + 180 + 1.396971 * T - 0.00569 - 0.00478 * Math.sin(omega));
    }

    // The year's equinoxes and solstices: { march, june, september, december }.
    function seasons(year) {
        const find = (month, day, target) => {
            let lo = Date.UTC(year, month, day - 6), hi = Date.UTC(year, month, day + 6);
            for (let i = 0; i < 50; i++) {
                const mid = (lo + hi) / 2;
                if (signed(sunLongitude(new Date(mid)) - target) < 0) lo = mid; else hi = mid;
            }
            return new Date(Math.round((lo + hi) / 2));
        };
        return { march: find(2, 20, 0), june: find(5, 21, 90), september: find(8, 22, 180), december: find(11, 21, 270) };
    }

    // ---- The Moon -----------------------------------------------------------

    // Geocentric { lon, lat (J2000 ecliptic, degrees), dist (km), phase,
    // illum }. phase is 0 at new moon, 0.25 first quarter, 0.5 full; illum
    // is the lit share of the disc.
    function moon(date) {
        const d = julian(date) - J2000;
        const r = x => x * DEG;
        const Lp = 218.316 + 13.176396 * d, Mp = 134.963 + 13.064993 * d, Ms = 357.529 + 0.98560028 * d;
        const D = 297.850 + 12.190749 * d, F = 93.272 + 13.229350 * d;
        const ofDate = Lp + 6.289 * Math.sin(r(Mp)) + 1.274 * Math.sin(r(2 * D - Mp)) + 0.658 * Math.sin(r(2 * D))
            + 0.214 * Math.sin(r(2 * Mp)) - 0.186 * Math.sin(r(Ms)) - 0.114 * Math.sin(r(2 * F));
        const lat = 5.128 * Math.sin(r(F)) + 0.281 * Math.sin(r(Mp + F)) + 0.278 * Math.sin(r(Mp - F)) + 0.173 * Math.sin(r(2 * D - F));
        const dist = 385001 - 20905 * Math.cos(r(Mp)) - 3699 * Math.cos(r(2 * D - Mp)) - 2956 * Math.cos(r(2 * D)) - 570 * Math.cos(r(2 * Mp));
        const lon = norm(ofDate - 1.396971 * centuries(date));          // back to J2000, like the planets
        const earth = heliocentric('earth', date);
        const elong = norm(lon - (Math.atan2(earth.y, earth.x) / DEG + 180));
        return { lon, lat, dist, phase: elong / 360, illum: (1 - Math.cos(r(elong))) / 2 };
    }

    // ---- The Galilean moons -------------------------------------------------

    // Circular orbits from the mean longitudes of Meeus ch. 44 (epoch JD
    // 2443000.5, degrees and degrees per day); distance in Jupiter radii.
    const GALILEAN = [
        { name: 'Io', l0: 106.07719, rate: 203.488955790, distance: 5.905 },
        { name: 'Europa', l0: 175.73161, rate: 101.374724735, distance: 9.397 },
        { name: 'Ganymede', l0: 120.55883, rate: 50.317609207, distance: 14.99 },
        { name: 'Callisto', l0: 84.44459, rate: 21.571071177, distance: 26.37 },
    ];

    // [{ name, angle (jovicentric longitude, degrees), distance, period (days) }]
    function galilean(date) {
        const t = julian(date) - 2443000.5;
        return GALILEAN.map(m => ({ name: m.name, angle: norm(m.l0 + m.rate * t), distance: m.distance, period: 360 / m.rate }));
    }

    // ---- The zodiac ---------------------------------------------------------

    const NAMES = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpius', 'Sagittarius', 'Capricornus', 'Aquarius', 'Pisces'];
    const SYMBOLS = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];
    // Where the ecliptic crosses the IAU constellation boundaries (J2000,
    // approximate). The ecliptic also runs through Ophiuchus, so there are
    // thirteen; Pisces wraps past 0°.
    const BORDERS = [['Pisces', 351.57], ['Aries', 28.69], ['Taurus', 53.42], ['Gemini', 90.14], ['Cancer', 117.99],
        ['Leo', 138.17], ['Virgo', 173.85], ['Libra', 217.81], ['Scorpius', 241.04], ['Ophiuchus', 247.68],
        ['Sagittarius', 266.28], ['Capricornus', 299.69], ['Aquarius', 327.87]];
    const zodiac = {
        signs: NAMES.map((name, i) => ({ name, symbol: SYMBOLS[i], start: 30 * i, end: 30 * i + 30 })),
        constellations: BORDERS.map(([name, start], i) => ({ name, start, end: BORDERS[(i + 1) % BORDERS.length][1] })),
    };

    // The sign or constellation (`which`: 'signs' | 'constellations') at an
    // ecliptic longitude.
    function zodiacAt(lon, which = 'signs') {
        const l = norm(lon);
        return zodiac[which].find(z => norm(l - z.start) < norm(z.end - z.start));
    }

    return {
        PLANETS, julian, centuries, inRange, kepler, elementsAt, heliocentric, orbitPath,
        geocentric, elongation, isRetrograde, sunLongitude, seasons, moon, galilean, zodiac, zodiacAt,
    };
})();
