// Night Train's journey (SPEC §10.16): a seeded route of segments, and the
// train's motion along it. Pure, with no DOM and no clock, so the unit tests
// can run a ten-minute journey in milliseconds (tools/night-train.test.mjs).
//
// Positions are in units along the line: a unit is 1/800 of the window's
// height on the near layer, so time on the journey doesn't depend on the
// screen. The middle of the window is the train's position, x.

const NightTrainRoute = {
    CRUISE: 640,       // units a second at Speed 1: near things cross a wide window in about two seconds
    ACCEL: 60,         // pulling away, units/s²
    BRAKE: 45,         // coming into a station: a long gentle stop
    PLATFORM: 2600,    // a platform's length
    SCENERY: [         // kind, chance, shortest and longest stretch in seconds at cruise
        ['countryside', 0.38, 25, 60],
        ['coast', 0.22, 22, 45],
        ['town', 0.22, 12, 24],
        ['bridge', 0.18, 4, 7],
    ],

    // A route that grows as the train needs it. `options`: tunnels and
    // stations, both on unless false.
    create(seed, options = {}) {
        const random = WP.seededRandom(seed);
        const route = {
            segments: [],
            options: { tunnels: options.tunnels !== false, stations: options.stations !== false },
            clock: 0,             // seconds at cruise from the start: what the gaps are timed by
            lastTunnel: -40,
            nextStation: 60 + random() * 80,
            end: 0,
        };
        const push = (kind, seconds, extra) => {
            const start = route.end;
            route.end = start + seconds * NightTrainRoute.CRUISE;
            route.clock += seconds;
            route.segments.push({ kind, start, end: route.end, ...extra });
        };
        // The journey starts out in the country, far enough along that the
        // whole window is countryside.
        route.segments.push({ kind: 'countryside', start: -1e5, end: 0 });
        push('countryside', 15 + random() * 20);
        let previous = 'countryside';

        route.grow = () => {
            const o = route.options;
            if (o.stations && route.clock >= route.nextStation) {
                push('town', 7 + random() * 5);
                const stop = route.end + NightTrainRoute.PLATFORM / 2;
                push('station', NightTrainRoute.PLATFORM / NightTrainRoute.CRUISE, { stop, dwell: 16 + random() * 14 });
                push('town', 5 + random() * 5);
                route.nextStation = route.clock + 150 + random() * 110;
                previous = 'town';
            } else if (o.tunnels && (route.clock - route.lastTunnel >= 200 || (route.clock - route.lastTunnel >= 70 && random() < 0.35))) {
                push('tunnel', 6 + random() * 14);
                route.lastTunnel = route.clock;
                previous = 'tunnel';
            } else {
                const choices = NightTrainRoute.SCENERY.filter(([kind]) => kind !== previous);
                let roll = random() * choices.reduce((sum, [, chance]) => sum + chance, 0);
                const [kind, , shortest, longest] = choices.find(([, chance]) => (roll -= chance) <= 0) || choices[0];
                push(kind, shortest + random() * (longest - shortest));
                previous = kind;
            }
        };
        route.ensure = x => { while (route.end < x) route.grow(); };
        route.at = x => NightTrainRoute.segmentAt(route, x);
        // New options from here on: what's ahead of `x` is planned again.
        route.replan = (x, options) => {
            route.options = { tunnels: options.tunnels !== false, stations: options.stations !== false };
            const keep = route.segments.findIndex(s => s.end > x);
            if (keep >= 0) {
                route.segments.length = keep + 1;
                route.end = route.segments[keep].end;
            }
        };
        return route;
    },

    segmentAt(route, x) {
        return route.segments[NightTrainRoute.indexAt(route, x)];
    },

    indexAt(route, x) {
        route.ensure(x + 1);
        const list = route.segments;
        let lo = 0, hi = list.length - 1;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (list[mid].end <= x) lo = mid + 1;
            else hi = mid;
        }
        return lo;
    },

    // Every segment overlapping [from, to].
    between(route, from, to) {
        route.ensure(to + 1);
        const out = [];
        for (let i = NightTrainRoute.indexAt(route, from); i < route.segments.length && route.segments[i].start < to; i++) out.push(route.segments[i]);
        return out;
    },

    // The tunnel interiors in view, as [from, to] in units relative to x:
    // where the window is dark, and the only places the carriage's
    // reflection shows.
    darkSpans(route, x, left, right) {
        return NightTrainRoute.between(route, x + left, x + right)
            .filter(s => s.kind === 'tunnel')
            .map(s => [Math.max(left, s.start - x), Math.min(right, s.end - x)]);
    },

    // The train: { x, v, dwell, served }. One step of `dt` seconds (clamped
    // by the caller); `wall` is the real time that passed, which a dwell at
    // a platform counts even across idle frames. Cruises, brakes on a curve
    // that stops dead at the next platform's middle, waits, pulls away.
    step(state, dt, wall, route, cruise) {
        if (state.dwell > 0) {
            state.v = 0;
            state.dwell -= wall;
            return state;
        }
        const station = NightTrainRoute.nextStation(route, state.x, state.served);
        let target = cruise;
        if (station) {
            const left = station.stop - state.x;
            target = Math.min(cruise, Math.max(12, Math.sqrt(2 * NightTrainRoute.BRAKE * Math.max(0, left))));
            if (left <= state.v * dt || left < 1) {
                state.x = station.stop;
                state.v = 0;
                state.dwell = station.dwell;
                state.served = station.stop;
                return state;
            }
        }
        state.v = state.v < target ? Math.min(target, state.v + NightTrainRoute.ACCEL * dt) : target;
        state.x += state.v * dt;
        return state;
    },

    // The first platform still to stop at, if it's within braking reach.
    nextStation(route, x, served) {
        const reach = NightTrainRoute.CRUISE * 3 * NightTrainRoute.CRUISE / NightTrainRoute.BRAKE;
        return NightTrainRoute.between(route, x, x + reach).find(s => s.kind === 'station' && s.stop > served && s.stop >= x) || null;
    },
};
