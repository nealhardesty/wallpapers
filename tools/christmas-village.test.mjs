// Christmas Village's pure logic (web/wallpapers/christmas-village/village-logic.js):
// the winter light, the calendar, the windows' hours, the layout, and the
// skaters' steering.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const WEB = resolve(import.meta.dirname, '../web');
const read = file => readFileSync(join(WEB, 'wallpapers/christmas-village', file), 'utf8');
const Logic = new Function(`${read('village-logic.js')}; return VillageLogic;`)();
let defaults = null;
new Function('WP', read('defaults.js'))({ defaults: (id, values) => { defaults = values; } });

const seeded = seed => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const SCREENS = [[1400, 860, 0], [1920, 1080, 0], [2560, 1080, 0], [412, 915, 48], [820, 1180, 0], [1280, 600, 0], [360, 640, 48]];
const layout = (W, H, bottom, config = {}) => Logic.layout(W, H, bottom, { ...defaults, ...config }, seeded(W * 3 + H * 17));

test('light: no jumps from midnight to noon, and the night is blue', () => {
    let last = Logic.light(-30, 0);
    for (let alt = -30; alt <= 60; alt += 0.25) {
        const now = Logic.light(alt, 0);
        for (const key of ['top', 'mid', 'horizon', 'wash', 'cloudLit', 'cloudShade']) {
            now[key].forEach((v, i) => assert.ok(Math.abs(v - last[key][i]) < (key === 'wash' && i === 3 ? 0.03 : 12), `${key}[${i}] jumps at ${alt}°`));
        }
        assert.ok(Math.abs(now.dark - last.dark) < 0.06 && Math.abs(now.stars - last.stars) < 0.06, `dark or stars jump at ${alt}°`);
        last = now;
    }
    const night = Logic.light(-30, 0), day = Logic.light(30, 0);
    assert.equal(night.dark, 1);
    assert.equal(day.dark, 0);
    assert.ok(night.wash[2] > night.wash[0] * 2, 'snow at night takes the sky’s blue');
    assert.ok(day.wash[3] < 0.01, 'noon is unwashed');
    assert.ok(Logic.light(-30, 1).wash[3] < night.wash[3], 'a full moon lifts the night');
});

test('season: the days to Christmas, and how far the decorating has got', () => {
    const on = (m, d, y = 2026) => Logic.season(new Date(y, m, d, 12));
    assert.equal(on(11, 1).daysTo, 24);
    assert.equal(on(11, 24).daysTo, 1);
    assert.equal(on(11, 25).daysTo, 0);
    assert.equal(on(0, 3, 2027).daysTo, -9, 'early January still counts from the Christmas just gone');
    assert.ok(on(11, 24).eve && !on(11, 24).day);
    assert.ok(on(11, 25).day && !on(11, 25).eve);
    assert.ok(on(11, 31).newYear && on(0, 1).newYear && !on(0, 2).newYear);
    assert.equal(on(11, 1).advent, 0.25);
    assert.equal(on(11, 24).advent, 1);
    assert.equal(on(11, 28).advent, 1);
    assert.equal(on(6, 4).advent, 1, 'out of season, everything is up');
    for (let d = 2; d <= 24; d++) assert.ok(on(11, d).advent > on(11, d - 1).advent, `a little more on the ${d}th`);
});

test('windows: on after dusk, off at bedtime, on again before dawn; everybody up on Christmas Eve', () => {
    const early = { dusk: 0.3, bed: 22, rise: 30 };
    assert.equal(Logic.windowLit(early, 15, 0.2, false), false, 'not dark enough yet');
    assert.equal(Logic.windowLit(early, 18, 0.9, false), true);
    assert.equal(Logic.windowLit(early, 21.9, 1, false), true);
    assert.equal(Logic.windowLit(early, 22.1, 1, false), false, 'gone to bed');
    assert.equal(Logic.windowLit(early, 2, 1, false), false, 'the small hours');
    assert.equal(Logic.windowLit(early, 6.2, 1, false), true, 'up before the sun');
    assert.equal(Logic.windowLit(early, 23.5, 1, true), true, 'Christmas Eve');
    assert.equal(Logic.windowLit(early, 12, 0, false), false, 'never by day');
    const random = seeded(5);
    let owls = 0;
    for (let i = 0; i < 400; i++) {
        const w = Logic.windowHabits(random);
        assert.ok(w.dusk > 0.1 && w.dusk < 0.75 && w.rise > 29 && w.rise < 31.5 && w.bed > 21.5);
        if (Logic.windowLit(w, 3, 1, false)) owls++;
    }
    assert.ok(owls > 15 && owls < 100, `${owls} of 400 windows are still lit at three in the morning`);
});

test('layout: everything on the screen, above the host’s inset, on every shape of screen', () => {
    for (const [W, H, bottom] of SCREENS) {
        const L = layout(W, H, bottom), name = `${W}×${H}`;
        assert.equal(L.Hu, H - bottom);
        assert.ok(L.hz > H * 0.25 && L.hz < H * 0.55, `${name}: horizon at ${L.hz}`);
        const p = L.pond;
        assert.ok(p.cx - p.rx * 1.1 >= -2 && p.cx + p.rx * 1.1 <= W + 2, `${name}: the pond runs off the side`);
        assert.ok(p.cy + p.ry * 1.12 < L.Hu, `${name}: the pond is under the inset`);
        assert.ok(p.cy - p.ry > L.streetY + 20 * L.s, `${name}: the pond is in the street`);
        for (const h of L.houses) {
            assert.ok(h.x - h.w / 2 > -4 && h.x + h.w / 2 < W + 4, `${name}: a ${h.style} runs off the side`);
            assert.ok(h.y < L.Hu && h.y > L.hz, `${name}: a ${h.style} is off the ground`);
        }
        assert.ok(L.houses.length <= defaults.houses, `${name}: ${L.houses.length} houses`);
        assert.ok(L.houses.filter(h => h.row === 'front').length >= 2, `${name}: a front street of ${L.houses.filter(h => h.row === 'front').length}`);
        assert.ok(L.houses.some(h => h.style === 'store'), `${name}: no general store`);
        for (const thing of [L.cabin, L.church, L.townTree, L.hut, L.fire]) assert.ok(thing.x > 0 && thing.x < W && thing.y > 0 && thing.y < L.Hu, `${name}: something is off the screen`);
        assert.ok(L.cabin.y < L.hz && L.cabin.y > L.nearRidge(L.cabin.x), `${name}: the cabin is on the mountain, below its ridge`);
        assert.ok(L.farm.rows.length === defaults.farmRows && L.farm.rows.every(r => r.trees.length >= 2), `${name}: the farm's rows`);
        for (let i = 1; i < L.farm.rows.length; i++) assert.ok(L.farm.rows[i].y > L.farm.rows[i - 1].y && L.farm.rows[i].k > L.farm.rows[i - 1].k, `${name}: nearer rows are lower and bigger`);
        assert.ok(L.sled.y1 > L.sled.y0 && L.sled.y1 < L.Hu, `${name}: the sledding hill`);
        assert.ok(L.depth(L.Hu) > L.depth(L.backY), `${name}: nearer is bigger`);
    }
});

test('layout: houses in a row never overlap, and stand clear of the green', () => {
    for (const [W, H, bottom] of SCREENS) {
        const L = layout(W, H, bottom);
        for (const row of ['front', 'back']) {
            const list = L.houses.filter(h => h.row === row).sort((a, b) => a.x - b.x);
            for (let i = 1; i < list.length; i++) assert.ok(list[i].x - list[i].w / 2 >= list[i - 1].x + list[i - 1].w / 2, `${W}×${H}: ${row} houses ${i - 1} and ${i} overlap`);
        }
        for (const h of L.houses.filter(h => h.row === 'front')) assert.ok(Math.abs(h.x - L.green.x) >= L.green.w + h.w / 2 - 1, `${W}×${H}: a house stands on the green`);
    }
});

test('layout: every part can be left out, and Houses is a limit', () => {
    const bare = layout(1400, 860, 0, { village: false, pond: false, farm: false, cabin: false, sledders: 0 });
    assert.deepEqual([bare.houses.length, bare.church, bare.gazebo, bare.townTree, bare.bridge, bare.pond, bare.hut, bare.fire, bare.farm, bare.cabin, bare.sled], [0, null, null, null, null, null, null, null, null, null, null]);
    assert.equal(layout(1400, 860, 0, { church: false }).church, null);
    assert.equal(layout(1400, 860, 0, { hut: false }).hut, null);
    assert.equal(layout(412, 915, 48).bridge, null, 'no room for the bridge on a phone');
    for (const n of [2, 3, 5, 8]) {
        const L = layout(1920, 1080, 0, { houses: n });
        assert.ok(L.houses.length <= n, `asked for ${n}, got ${L.houses.length}`);
        assert.ok(L.houses.some(h => h.style === 'store'), `the store survives a limit of ${n}`);
    }
    assert.ok(layout(1400, 860, 0, { scale: 1.4 }).s > layout(1400, 860, 0, { scale: 0.7 }).s * 1.9);
});

test('skating: nobody leaves the ice, whichever way they lap, and they do go round', () => {
    const pond = { cx: 700, cy: 600, rx: 320, ry: 80 }, random = seeded(11);
    for (let n = 0; n < 40; n++) {
        const turn = n % 2 ? 1 : -1, angle = random() * 6.2832, r = random() * 0.85;
        let x = pond.cx + Math.cos(angle) * pond.rx * r, y = pond.cy + Math.sin(angle) * pond.ry * r, a = random() * 6.2832, swept = 0, was = Math.atan2((y - pond.cy) / pond.ry, (x - pond.cx) / pond.rx);
        const want = 0.15 + random() * 0.7, speed = 0.08 + random() * 0.26;
        for (let i = 0; i < 3000; i++) {
            const dt = i % 7 ? 1 / 60 : 0.1;        // a slow tier's frame now and then
            a = Logic.skate(pond, x, y, a, want, turn, dt);
            x += Math.cos(a) * speed * pond.rx * dt;
            y += Math.sin(a) * speed * pond.ry * dt;
            assert.ok(Logic.pondR(pond, x, y) < 1, `skater ${n} left the ice at step ${i} (r ${Logic.pondR(pond, x, y).toFixed(3)})`);
            const at = Math.atan2((y - pond.cy) / pond.ry, (x - pond.cx) / pond.rx);
            swept += Math.atan2(Math.sin(at - was), Math.cos(at - was));
            was = at;
        }
        assert.ok(swept * turn > 6.2832, `skater ${n} never got round (swept ${swept.toFixed(1)})`);
        assert.ok(Math.abs(Logic.pondR(pond, x, y) - want) < 0.3, `skater ${n} wanted ${want.toFixed(2)} and is at ${Logic.pondR(pond, x, y).toFixed(2)}`);
    }
});
