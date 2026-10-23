// Night Train (SPEC §10.16, task 8.11): the seeded journey has a tunnel and
// a station within ten minutes; the carriage's reflection shows only in
// tunnels; trains stop at platforms and pull away again. Runs the route
// generator, the wallpaper's own classic script, in a Node vm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

const DIR = resolve(import.meta.dirname, '../web/wallpapers/night-train');
const context = vm.createContext({});
vm.runInContext(readFileSync(resolve(DIR, '../../core/wp.js'), 'utf8'), context);
for (const file of ['defaults.js', 'settings.js', 'route.js']) vm.runInContext(readFileSync(join(DIR, file), 'utf8'), context);
const Route = vm.runInContext('NightTrainRoute', context);
// JSON round trip: vm objects have their own prototypes, which deepEqual minds.
const plain = value => JSON.parse(JSON.stringify(value));

// A journey as the wallpaper drives it: 30 fps for `seconds`, noting what
// is at the middle of the window and every stop at a platform.
function journey(seed, seconds = 600, options = {}, fps = 30) {
    const route = Route.create(seed, options);
    const train = { x: 0, v: Route.CRUISE, dwell: 0, served: -Infinity };
    const firstSeen = {}, stops = [];
    for (let frame = 0; frame < seconds * fps; frame++) {
        const t = frame / fps;
        const wasStopped = train.dwell > 0;
        Route.step(train, 1 / fps, 1 / fps, route, Route.CRUISE);
        const kind = route.at(train.x).kind;
        if (!(kind in firstSeen)) firstSeen[kind] = t;
        if (train.dwell > 0 && !wasStopped) stops.push({ t, x: train.x, station: route.at(train.x) });
    }
    return { route, train, firstSeen, stops };
}

test('route: the same seed plans the same journey', () => {
    const a = Route.create(42), b = Route.create(42), c = Route.create(43);
    a.ensure(5e5); b.ensure(5e5); c.ensure(5e5);
    assert.deepEqual(plain(a.segments), plain(b.segments));
    assert.notDeepEqual(plain(a.segments), plain(c.segments));
});

test('route: every seed passes a tunnel and stops at a station within 10 minutes', () => {
    for (let seed = 1; seed <= 300; seed++) {
        const { firstSeen, stops } = journey(seed);
        assert.ok(firstSeen.tunnel < 600, `seed ${seed}: no tunnel in 10 minutes`);
        assert.ok(stops.length >= 1 && stops[0].t < 600, `seed ${seed}: no station stop in 10 minutes`);
    }
});

test('route: segments tile the line with no gaps, and every kind turns up', () => {
    const route = Route.create(7);
    route.ensure(2e6);
    const kinds = new Set();
    route.segments.forEach((s, i) => {
        kinds.add(s.kind);
        assert.ok(s.end > s.start);
        if (i) assert.equal(s.start, route.segments[i - 1].end);
    });
    assert.deepEqual([...kinds].sort(), ['bridge', 'coast', 'countryside', 'station', 'town', 'tunnel']);
});

test('route: tunnels and stations can be turned off', () => {
    const route = Route.create(9, { tunnels: false, stations: false });
    route.ensure(3e6);
    assert.ok(!route.segments.some(s => s.kind === 'tunnel' || s.kind === 'station'));
    const { stops } = journey(9, 600, { stations: false });
    assert.equal(stops.length, 0);
});

test('stations: the train stops with the platform\'s middle at the window, waits, and pulls away', () => {
    const { stops, train } = journey(11, 900);
    assert.ok(stops.length >= 2);
    for (const stop of stops) {
        assert.equal(stop.station.kind, 'station');
        assert.equal(stop.x, stop.station.stop);
    }
    assert.ok(train.x > stops.at(-1).x, 'moving again after the last stop');
});

test('stations: braking is gentle, and the same at 20 fps as at 60', () => {
    const at = fps => journey(5, 400, {}, fps).stops.map(s => s.x);
    assert.deepEqual(at(20), at(60));
    // No sudden stops: speed falls by at most BRAKE-ish per second
    const route = Route.create(5);
    const train = { x: 0, v: Route.CRUISE, dwell: 0, served: -Infinity };
    let last = train.v, worst = 0;
    for (let i = 0; i < 400 * 30; i++) {
        Route.step(train, 1 / 30, 1 / 30, route, Route.CRUISE);
        if (train.dwell <= 0 || train.v) worst = Math.max(worst, (last - train.v) * 30);
        last = train.v;
    }
    assert.ok(worst < Route.BRAKE * 4, `decelerated at ${worst.toFixed(0)} units/s²`);
});

test('a station\'s dwell counts real time, so idle frames don\'t stretch it', () => {
    const route = Route.create(3);
    const train = { x: 0, v: Route.CRUISE, dwell: 0, served: -Infinity };
    while (!(train.dwell > 0)) Route.step(train, 1 / 30, 1 / 30, route, Route.CRUISE);
    const dwell = train.dwell;
    // One frame after a long idle: the clamped step is tiny, the wall time isn't
    Route.step(train, 0.1, dwell + 1, route, Route.CRUISE);
    assert.ok(train.dwell <= 0);
});

test('reflection: dark spans are only ever tunnel interiors', () => {
    const route = Route.create(21);
    route.ensure(3e6);
    for (const s of route.segments.slice(1, 120)) {
        const mid = (s.start + s.end) / 2;
        const spans = Route.darkSpans(route, mid, -900, 900);
        if (s.kind === 'tunnel' && s.end - s.start > 1800) assert.deepEqual(plain(spans), [[-900, 900]], 'a long tunnel fills the window');
        for (const [a, b] of spans) {
            assert.ok(b > a);
            assert.equal(route.at(mid + (a + b) / 2).kind, 'tunnel');
        }
        // Away from any tunnel, nothing is dark
        const near = Route.between(route, mid - 900, mid + 900);
        if (!near.some(n => n.kind === 'tunnel')) assert.deepEqual(plain(spans), []);
    }
});

test('settings: replanning keeps the road already in view', () => {
    const route = Route.create(4);
    route.ensure(4e5);
    const here = route.at(1e5);
    route.replan(1e5, { tunnels: false, stations: true });
    assert.equal(route.at(1e5), here);
    route.ensure(3e6);
    assert.ok(!route.segments.filter(s => s.start > here.end).some(s => s.kind === 'tunnel'));
});
