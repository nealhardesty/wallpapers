// Harvest Valley's sky: where the sun and moon are, which phase the moon is
// in, and what colour the air is. Pure functions with no DOM, so
// tools/harvest.test.mjs can run them in Node.
//
// The astronomy is the simple, honest kind: the sun's declination from the
// day of the year, hour angles from the clock, and the moon from the mean
// synodic month (good to about a day, which is more than a wallpaper needs).
// It looks south from a middling northern latitude, so the sun rises on the
// left and sets on the right, the November sun sits low, and the winter
// full moon rides high: all as in a real autumn.

const HarvestSky = (() => {
    const RAD = Math.PI / 180;
    const LATITUDE = 40 * RAD;          // a middling latitude, not a place
    const SYNODIC = 29.530588853;       // days from new moon to new moon
    const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);   // a known new moon
    const NOON = 12.25;                 // solar noon, in local clock hours
    const LAG = 24.84 / SYNODIC;        // hours later the moon transits, for each day of its age
    const SPAN = 0.46;                  // half the screen the sun or moon crosses, horizon to horizon

    const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
    const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

    // Interpolate keyframes [key, ...values] at x (keys ascending).
    const ramp = (frames, x) => {
        if (x <= frames[0][0]) return frames[0].slice(1);
        for (let i = 1; i < frames.length; i++) {
            if (x <= frames[i][0]) {
                const [k0, ...a] = frames[i - 1], [k1, ...b] = frames[i];
                return mix(a, b, (x - k0) / (k1 - k0));
            }
        }
        return frames[frames.length - 1].slice(1);
    };

    const hourOf = date => date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600 + date.getMilliseconds() / 3.6e6;
    const dayOfYear = date => Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 0)) / 864e5);
    const declination = date => -23.44 * RAD * Math.cos(2 * Math.PI * (dayOfYear(date) + 10) / 365);
    const wrap = a => { a %= 2 * Math.PI; return a > Math.PI ? a - 2 * Math.PI : a < -Math.PI ? a + 2 * Math.PI : a; };

    // A body at hour angle H on a circle of declination d: its altitude
    // (radians), and where it is across the sky, 0 to 1, rising at 0.04 and
    // setting at 0.96 wherever that is on the horizon.
    function position(H, d) {
        const alt = Math.asin(Math.sin(LATITUDE) * Math.sin(d) + Math.cos(LATITUDE) * Math.cos(d) * Math.cos(H));
        const half = Math.acos(clamp(-Math.tan(LATITUDE) * Math.tan(d), -1, 1));
        return { alt: alt / RAD, x: 0.5 + SPAN * H / half };
    }

    const moonAge = date => (((date.getTime() - NEW_MOON) / 864e5) % SYNODIC + SYNODIC) % SYNODIC;
    const illumination = age => (1 - Math.cos(2 * Math.PI * age / SYNODIC)) / 2;

    // Where the sun and moon are at `date`; `age` pins the moon's phase.
    function bodies(date, age = moonAge(date)) {
        const hour = hourOf(date), d = declination(date);
        const sun = position((hour - NOON) * 15 * RAD, d);
        const transit = NOON + age * LAG;
        const moon = position(wrap((hour - transit) * 15 * RAD), d * Math.cos(2 * Math.PI * age / SYNODIC));
        moon.age = age;
        moon.phase = age / SYNODIC;
        moon.illum = illumination(age);
        // How much light the moon actually gives: lit, and up.
        moon.light = moon.illum * smooth(-2, 18, moon.alt);
        return { sun, moon };
    }

    // The sun's rise and set, in local clock hours, for the day of `date`.
    function sunTimes(date) {
        const half = Math.acos(clamp(-Math.tan(LATITUDE) * Math.tan(declination(date)), -1, 1)) / RAD / 15;
        return { rise: NOON - half, set: NOON + half, noon: NOON };
    }

    // A moment on `date`'s day for the sky modes that stand still: a clear
    // morning, the last of the light, or a night with the moon where it is
    // highest (so "just the moon" really has a moon, whenever it can).
    function pinned(mode, date, age) {
        const { rise, set } = sunTimes(date);
        const at = hours => {
            const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
            d.setMinutes(Math.round(((hours % 24) + 24) % 24 * 60));
            return d;
        };
        if (mode === 'day') return at(NOON - 1.4);
        if (mode === 'golden') return at(set - 0.45);
        // night: scan the dark hours for the moon's best moment
        let best = null;
        for (let h = set + 1; h <= rise + 24 - 1; h += 0.25) {
            const t = at(h), b = bodies(t, age);
            if (b.sun.alt > -9) continue;
            if (!best || b.moon.alt > best.alt) best = { alt: b.moon.alt, t, h };
        }
        // `at` stays inside one day; past midnight is the next morning's small hours
        return best ? (best.h >= 24 ? new Date(at(best.h).getTime() + 864e5) : best.t) : at(NOON + 12);
    }

    // The full moon's folk name, or the phase's plain one.
    const FULL_MOONS = ['Wolf', 'Snow', 'Worm', 'Pink', 'Flower', 'Strawberry', 'Buck', 'Sturgeon', 'Corn', 'Hunter’s', 'Beaver', 'Cold'];
    function moonTitle(date, age) {
        if (Math.abs(age - SYNODIC / 2) < 1) {
            // The Harvest Moon is the full moon nearest the autumn equinox.
            const equinox = new Date(date.getFullYear(), 8, 22);
            if (Math.abs(date - equinox) / 864e5 <= SYNODIC / 2) return 'Harvest Moon';
            return `${FULL_MOONS[date.getMonth()]} Moon`;
        }
        if (age < 1 || age > SYNODIC - 1) return 'New Moon';
        if (age < 6.4) return 'Waxing crescent';
        if (age < 8.4) return 'First quarter';
        if (age < SYNODIC / 2 - 1) return 'Waxing gibbous';
        if (age < SYNODIC / 2 + 1) return 'Full Moon';
        if (age < 21) return 'Waning gibbous';
        if (age < 23) return 'Last quarter';
        return 'Waning crescent';
    }

    // The fourth Thursday of November, and how near `date` is to it: 'day'
    // on it, 'week' for the four days either side, else null.
    function thanksgiving(year) {
        const first = new Date(year, 10, 1).getDay();
        return new Date(year, 10, 1 + (4 - first + 7) % 7 + 21);
    }
    function holiday(date) {
        const days = Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate()) - thanksgiving(date.getFullYear())) / 864e5);
        return days === 0 ? 'day' : Math.abs(days) <= 4 ? 'week' : null;
    }

    // ---- Colour ---------------------------------------------------------------

    // Sky by the sun's altitude in degrees: zenith, middle, horizon. Warm
    // all the way through: even noon is an autumn haze, never a summer blue.
    const SKY = [
        [-18, [7, 11, 28], [12, 19, 46], [20, 27, 58]],
        [-9, [14, 21, 52], [38, 31, 72], [78, 48, 86]],
        [-4, [30, 34, 80], [102, 60, 100], [214, 112, 94]],
        [0, [52, 66, 118], [196, 100, 106], [255, 170, 96]],
        [6, [84, 118, 176], [214, 168, 146], [255, 206, 138]],
        [16, [104, 152, 206], [178, 196, 208], [244, 220, 176]],
        [45, [108, 160, 220], [160, 198, 226], [236, 224, 194]],
    ];
    // What the sun's light does to the land: a colour washed over it, [r, g, b, alpha].
    const WASH = [
        [-18, 14, 22, 56, 0.68],
        [-10, 22, 28, 70, 0.63],
        [-5, 70, 50, 110, 0.47],
        [-1, 150, 84, 110, 0.31],
        [2, 255, 138, 70, 0.2],
        [7, 255, 170, 88, 0.13],
        [14, 255, 190, 110, 0.07],
        [30, 255, 224, 170, 0.02],
        [60, 255, 230, 185, 0],
    ];
    // Clouds: the lit top and the shaded belly.
    const CLOUD = [
        [-18, [38, 46, 82], [20, 26, 52]],
        [-8, [96, 78, 120], [44, 40, 78]],
        [-2, [255, 150, 120], [120, 70, 100]],
        [4, [255, 196, 140], [200, 140, 130]],
        [12, [255, 224, 180], [220, 190, 170]],
        [30, [255, 246, 236], [214, 214, 222]],
    ];

    // Everything that depends on how high the sun is, and how much moon
    // there is to see by.
    function light(sunAlt, moonLight = 0) {
        const lift = smooth(-6, -14, sunAlt) * moonLight;     // moonlit night, not just dark
        const sky = ramp(SKY.map(([k, a, b, c]) => [k, ...a, ...b, ...c]), sunAlt);
        const top = sky.slice(0, 3), mid = sky.slice(3, 6), horizon = sky.slice(6, 9);
        const moonLift = [16, 24, 44];
        const wash = ramp(WASH, sunAlt);
        const cloud = ramp(CLOUD.map(([k, a, b]) => [k, ...a, ...b]), sunAlt);
        const bright = [60, 66, 74];
        return {
            top: top.map((v, i) => v + moonLift[i] * lift * 0.7),
            mid: mid.map((v, i) => v + moonLift[i] * lift),
            horizon: horizon.map((v, i) => v + moonLift[i] * lift * 1.2),
            wash: [wash[0], wash[1], wash[2], wash[3] * (1 - 0.24 * lift)],
            cloudLit: cloud.slice(0, 3).map((v, i) => v + bright[i] * lift),
            cloudShade: cloud.slice(3, 6).map((v, i) => v + bright[i] * lift * 0.5),
            stars: smooth(-4, -12, sunAlt),
            dark: smooth(7, -7, sunAlt),                          // 0 by day, 1 at night: windows, lamps, fire
            twilight: Math.max(0, 1 - Math.abs(sunAlt - 1) / 9),  // the long gold and rose hours
            low: smooth(26, 2, sunAlt) * smooth(-6, 1, sunAlt),   // the sun is low and warm, but up
        };
    }

    return { SYNODIC, bodies, sunTimes, pinned, moonAge, illumination, moonTitle, thanksgiving, holiday, light, clamp, smooth, mix };
})();
