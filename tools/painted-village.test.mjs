// Painted Village's pure logic (web/wallpapers/painted-village/painted-logic.js):
// the camera, the hour's light, where everything is put for a screen of a
// given shape, and the arithmetic the brushwork leans on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const WEB = resolve(import.meta.dirname, '../web');
const read = file => readFileSync(join(WEB, 'wallpapers/painted-village', file), 'utf8');
const Logic = new Function(`${read('painted-logic.js')}; return PaintedLogic;`)();
let defaults = null;
new Function('WP', read('defaults.js'))({ defaults: (id, values) => { defaults = values; } });

const seeded = seed => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const SCREENS = [[1400, 860, 0], [1920, 1080, 0], [2560, 1080, 0], [412, 915, 48], [820, 1180, 0], [1280, 600, 0], [360, 640, 48]];
const scene = (W, H, bottom, config = {}) => { const cam = Logic.camera(W, H, bottom, defaults.horizon); return { cam, L: Logic.layout(cam, { ...defaults, ...config }, seeded(W * 3 + H * 17)) }; };

test('camera: metres to pixels and back, the ground meeting the bottom of the picture above the inset', () => {
    for (const [W, H, bottom] of SCREENS) {
        const cam = Logic.camera(W, H, bottom, 0.39);
        assert.ok(Math.abs(cam.sy(1) - (H - bottom)) < 1e-6, `depth 1 is the bottom of the usable picture at ${W}×${H}`);
        assert.ok(cam.sy(400) - cam.hor < 3, 'far ground is at the horizon');
        for (const z of [1, 2.5, 4.4, 11]) {
            assert.ok(Math.abs(cam.zAt(cam.sy(z)) - z) < 1e-6, 'zAt undoes sy');
            assert.ok(Math.abs(cam.xAt(cam.sx(3.3, z), z) - 3.3) < 1e-9, 'xAt undoes sx');
            assert.ok(Math.abs(cam.at(0.5 + 3.3 * cam.sc(z) / W, z) - 3.3) < 1e-9, 'at() is sx as a share of the width');
        }
        const [x, y] = cam.pt(2, 3, 2.5);
        assert.ok(Math.abs(x - cam.sx(2, 2.5)) < 1e-9 && Math.abs(y - (cam.sy(2.5) - 3 * cam.sc(2.5))) < 1e-9, 'pt is sx, and sy less the height');
        assert.ok(Math.abs(cam.dz(cam.zm) - 1) < 1e-9, 'dz is metres of depth, as depth');
        assert.ok(cam.eye > 20 && cam.sy(2.75) < cam.hor + 0.5 * cam.f, 'we stand on the hill, and the town is in the upper half of the ground');
        assert.equal(cam.kind, W / (H - bottom) < 0.9 ? 'upright' : W / (H - bottom) > 2.15 ? 'panorama' : 'wide');
    }
    // A narrower screen stands higher, so the same town fits.
    const wide = Logic.camera(1600, 900), square = Logic.camera(1000, 900);
    assert.ok(Math.abs(wide.half(3) - square.half(3)) < wide.half(3) * 0.1, 'a 10:9 screen sees about as far to each side as a 16:9 one');
    assert.ok(square.eye > wide.eye);
});

test('light: no jumps from midnight to noon; warm against cool at dusk; a lamp counts for more at night', () => {
    const fields = ['sky0', 'sky2', 'sky4', 'amb', 'keyA', 'keyB', 'haze0', 'haze1', 'glow', 'cloudLow1', 'ice', 'smoke1', 'vignette'];
    let last = Logic.light(-30, 0);
    for (let alt = -30; alt <= 60; alt += 0.25) {
        const now = Logic.light(alt, 0);
        for (const key of fields) now[key].forEach((v, i) => assert.ok(Math.abs(v - last[key][i]) < 0.06, `${key}[${i}] jumps at ${alt}°`));
        for (const key of ['warm', 'glowA', 'veil', 'dark', 'stars']) assert.ok(Math.abs(now[key] - last[key]) < 0.06, `${key} jumps at ${alt}°`);
        last = now;
    }
    const night = Logic.light(-30, 0), dusk = Logic.light(-3.5, 0), day = Logic.light(30, 0);
    assert.equal(night.dark, 1);
    assert.equal(day.dark, 0);
    assert.ok(dusk.keyA[0] > dusk.keyA[2] * 1.6 && dusk.amb[2] > dusk.amb[0] * 1.4, 'at dusk the low light is warm and the sky’s light is cool');
    assert.ok(dusk.sky4[0] > dusk.sky0[0] * 2, 'the dusk sky is alight at the horizon');
    assert.ok(night.warm > dusk.warm && dusk.warm > day.warm * 5, 'lamps count for most at night and hardly at all at noon');
    assert.ok(day.keyB[0] > 0.8 && day.keyA[0] === 0 && dusk.keyB[0] === 0, 'the day has its own key light, and dusk has none of it');
    const moonlit = Logic.light(-30, 1);
    assert.ok(moonlit.keyA[2] > night.keyA[2] * 4 && moonlit.amb[2] > night.amb[2], 'a full moon lifts the night, in blue');
    assert.equal(Logic.light(10, 1).moon, 0, 'and does nothing by day');
    // Twice the light's key is twice the repaints saved: the key moves only when a colour moves.
    assert.equal(Logic.lightKey(Logic.light(-3.5, 0)), Logic.lightKey(Logic.light(-3.5005, 0)));
    assert.notEqual(Logic.lightKey(Logic.light(-3.5, 0)), Logic.lightKey(Logic.light(-5, 0)));
    // No light passes what its plate can hold (it is kept at half strength: 2 is the cap).
    for (let alt = -30; alt <= 60; alt += 1) for (const moon of [0, 1]) { const l = Logic.light(alt, moon); for (const k of ['amb', 'keyA', 'keyB']) l[k].forEach(v => assert.ok(v >= 0 && v <= 2, `${k} is ${v} at ${alt}°`)); }
});

test('layout: three arrangements by the screen’s shape, the whole town in view, lanes that join up', () => {
    for (const [W, H, bottom] of SCREENS) {
        const { cam, L } = scene(W, H, bottom), kinds = L.things.map(t => t.kind), wide = L.kind !== 'upright';
        assert.equal(L.kind, cam.kind);
        // The original scene: the town, its green, the rink, the tree farm, the house up the mountain.
        for (const kind of ['store', 'church', 'grandTree', 'snowman', 'bonfire', 'cocoaHut', 'treeFarm', 'barn', 'cabin']) assert.ok(kinds.includes(kind), `${kind} at ${W}×${H}`);
        for (const kind of ['bridge', 'bandstand', 'townSign', 'sledHill']) assert.equal(kinds.includes(kind), wide, `${kind} needs a wide screen (${W}×${H})`);
        assert.ok(kinds.filter(k => k === 'house').length >= (wide ? 12 : 8), `a town’s worth of houses at ${W}×${H}`);
        // What the eye goes to is on the screen, with its foot above the inset.
        for (const t of L.things.filter(t => ['grandTree', 'snowman', 'bonfire', 'store', 'church', 'cocoaHut', 'barn', 'bandstand', 'townSign'].includes(t.kind))) { const x = cam.sx(t.x, t.z), y = cam.sy(t.z); assert.ok(x > 0 && x < W && y > cam.hor && y <= H - bottom, `${t.kind} is in view at ${W}×${H}: ${Math.round(x)}, ${Math.round(y)}`); }
        // The glow is in the sky, over the mountain.
        assert.ok(L.glow.x > 0 && L.glow.x < 1 && L.glow.y < cam.hor - 40 * cam.u && L.glow.y > 0);
        // Far to near, for painting.
        for (let i = 1; i < L.things.length; i++) assert.ok(L.things[i - 1].z >= L.things[i].z);
        // Every lane's ends are places, every exit is off the picture, and every door can be walked to from every exit.
        const links = {};
        for (const [a, b] of L.edges) { assert.ok(L.nodes[a] && L.nodes[b], `lane ${a}-${b}`); (links[a] ||= []).push(b); (links[b] ||= []).push(a); }
        const exits = Object.values(L.nodes).filter(n => n.exit), doors = Object.values(L.nodes).filter(n => n.door);
        assert.ok(exits.length >= (wide ? 3 : 2) && doors.length >= 3);
        for (const n of exits) { const x = cam.sx(n.x, n.z), y = cam.sy(n.z); assert.ok(x < 0 || x > W || y >= H - bottom - 1, `exit ${n.name} is out of the picture at ${W}×${H}`); }
        for (const n of doors) { const x = cam.sx(n.x, n.z); assert.ok(x > 0 && x < W && n.at && L.things.includes(n.at), `door ${n.name} is a building’s, in view at ${W}×${H}`); }
        const seen = new Set([exits[0].name]), queue = [exits[0].name];
        while (queue.length) for (const next of links[queue.shift()] || []) if (!seen.has(next)) { seen.add(next); queue.push(next); }
        for (const n of Object.values(L.nodes)) assert.ok(seen.has(n.name), `${n.name} is joined to the lanes at ${W}×${H}`);
        // The rink is on the pond, and in view.
        const r = L.pond.rink, at = z => { const line = L.pond.line; for (let i = 1; i < line.length; i++) if (z <= line[i - 1][0] && z >= line[i][0]) { const t = (z - line[i - 1][0]) / (line[i][0] - line[i - 1][0]); return [line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t, line[i - 1][2] + (line[i][2] - line[i - 1][2]) * t]; } };
        for (const z of [r.z0, r.z, r.z1]) { const [x, hw] = at(z), k = z === r.z ? 1 : 0.2; assert.ok(Math.abs(r.x - x) + r.rx * k < hw + 0.6, `the rink is on the ice at depth ${z} at ${W}×${H}`); }
        assert.ok(cam.sx(r.x - r.rx, r.z) > 0 && cam.sx(r.x + r.rx, r.z) < W, `the whole rink is on the screen at ${W}×${H}`);
        assert.ok(r.z0 > 1.05, 'nobody skates under the gesture bar');
        assert.ok(Math.abs(r.ellipse.ry - (r.z1 - r.z0) / 2 * cam.zm) < 1e-9);
        // We look down on it: the far bank of the pond is well below the feet of the front row.
        const row = L.things.find(t => t.kind === 'store');
        assert.ok(cam.sy(r.z1) - cam.sy(row.z) > 0.12 * cam.Hu, `the green lies open between the pond and the store at ${W}×${H}`);
        // The farm is rows of trees up the hill, left of the town.
        const farm = L.things.find(t => t.kind === 'treeFarm');
        assert.ok(farm.z1 - farm.z0 > cam.dz(60) && farm.x1 < row.x && farm.x0 < farm.x1);
    }
});

test('layout: every part has its switch, and what stands still stands just nearer than a band', () => {
    const { L: bare } = scene(1600, 900, 0, { village: false, pond: false, snowman: false, cabin: false, mice: false, cardinal: false, rabbits: false, treeFarm: false, sledders: 0 });
    const left = new Set(bare.things.map(t => t.kind));
    for (const kind of ['store', 'house', 'church', 'bridge', 'grandTree', 'snowman', 'bonfire', 'cabin', 'picketFence', 'bandstand', 'townSign', 'cocoaHut', 'bench', 'barn', 'treeFarm', 'sledHill']) assert.ok(!left.has(kind), `${kind} is left out`);
    assert.equal(bare.pond, null);
    assert.equal(bare.brook, undefined);
    assert.equal(bare.lamps.length, 0);
    assert.ok(!Object.values(bare.nodes).some(n => n.door), 'nobody lives in an empty valley');
    assert.ok(left.has('fir') && left.has('frostTree'), 'the valley keeps its trees');
    for (const [key, kind] of [['church', 'church'], ['townTree', 'grandTree'], ['bridge', 'bridge'], ['bandstand', 'bandstand'], ['cocoa', 'cocoaHut'], ['treeFarm', 'barn'], ['treeFarm', 'treeFarm'], ['bonfire', 'bonfire']]) assert.ok(!scene(1600, 900, 0, { [key]: false }).L.things.some(t => t.kind === kind), `${key} off leaves no ${kind}`);
    assert.ok(!scene(1600, 900, 0, { sledders: 0 }).L.things.some(t => t.kind === 'sledHill'), 'no sledders, no hill');
    assert.equal(scene(1600, 900, 0, { lamps: false }).L.lamps.length, 0);
    const few = scene(2560, 1080, 0, { houses: 2 }).L;
    assert.equal(few.things.filter(t => t.kind === 'house').length, 2, 'no more houses than asked for');
    assert.ok(few.things.filter(t => t.kind === 'house').every(t => t.z < 2.9), 'and the ones on the green are the last to go');
    assert.ok(Object.values(few.nodes).filter(n => n.door).every(n => few.things.includes(n.at)), 'a house that is not there has no door');
    assert.ok(scene(2560, 1080, 0).L.things.filter(t => t.kind === 'house').length > scene(1600, 900, 0).L.things.filter(t => t.kind === 'house').length, 'a wider screen has more of the street');
    // Lamps and the big things by the lanes stand just nearer than a band, so walkers behind them are hidden.
    for (const [W, H, bottom] of SCREENS) {
        const { cam, L } = scene(W, H, bottom), B = Logic.BANDS, thing = kind => L.things.find(t => t.kind === kind);
        for (const lamp of L.lamps) assert.ok(B.some(b => b - lamp.z > 0 && b - lamp.z < 0.07), `a lamp at depth ${lamp.z}`);
        assert.equal(Logic.bandOf(L.road.z), 3, 'the street is behind the bridge’s band');
        assert.ok(thing('grandTree').z < B[2] && thing('store').z > B[3] && thing('store').z < B[4] && thing('church').z > B[5]);
        for (const n of Object.values(L.nodes)) if (n.door && n.at.z < 3) assert.equal(Logic.bandOf(n.z), 3, `whoever is at ${n.name}’s door is behind the lamps`);
        const bridge = thing('bridge');
        if (bridge) assert.ok(bridge.z < B[3] && L.road.z > bridge.z && L.road.z < bridge.z + cam.dz(5), 'the sleigh goes through the bridge, not past it');
        const r = L.pond.rink;
        assert.ok(r.z0 > B[0] && r.z1 < B[1], 'the skaters are behind the firs in the corners and in front of everything else');
    }
    assert.equal(Logic.bandOf(1.0), -1);
    assert.equal(Logic.bandOf(1.5), 0);
    assert.equal(Logic.bandOf(99), Logic.BANDS.length - 1);
});

test('plates: what a byte keeps comes back, and a blended edge is never a ninth kind of surface', () => {
    const cam = Logic.camera(1600, 900);
    for (const foot of [cam.hor + 2, cam.hor + 20, cam.hor + 150, 900]) {
        const back = Logic.footOf(Logic.footByte(foot, cam), cam);
        assert.ok(Math.abs(cam.zAt(back) - cam.zAt(foot)) / cam.zAt(foot) < 0.2, `a foot at row ${Math.round(foot)} comes back at depth ${cam.zAt(back).toFixed(2)}, not ${cam.zAt(foot).toFixed(2)}`);
    }
    assert.ok(Math.abs(Logic.footOf(Logic.footByte(900, cam), cam) - 900) < 3, 'near feet are kept to a few pixels');
    for (const ang of [0, 0.3, 1.2, Math.PI / 2, 3]) assert.ok(Math.abs(Logic.angOf(Logic.angByte(ang)) - ang) < 0.013);
    assert.equal(Logic.angOf(Logic.angByte(null)), null);
    assert.ok(Math.abs(Logic.angOf(Logic.angByte(-0.4)) - (Math.PI - 0.4)) < 0.013, 'a direction is the same turned half round');
    const codes = Object.values(Logic.CLS);
    assert.equal(new Set(codes).size, 8);
    for (const c of codes) assert.equal(Logic.clsOf(c), c);
    for (let b = 0; b < 256; b++) assert.ok(codes.includes(Logic.clsOf(b)));
    // Halfway between two kinds is seldom a third (so a blended edge can be told from a surface).
    let clashes = 0;
    for (const a of codes) for (const b of codes) if (a < b && codes.includes(Math.round((a + b) / 2))) clashes++;
    assert.ok(clashes <= 1, `${clashes} midpoints are themselves kinds`);
});

test('a stroke runs until the colour under it changes or the surface is another kind, and no further', () => {
    const w = 40, h = 8, A = new Uint8ClampedArray(w * h * 4), G = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4, v = x < 20 ? 200 : x < 30 ? 205 : 90;         // a soft change at 20, a hard one at 30
        A[i] = A[i + 1] = A[i + 2] = v; G[i + 1] = x < 12 ? Logic.CLS.GROUND : Logic.CLS.UP;   // and the ground ends at 12
    }
    assert.equal(Logic.run(A, G, w, h, 4, 4, 1, 0, 100, 1), 7, 'stops at the wall, though the colour is the same');
    assert.equal(Logic.run(A, G, w, h, 15, 4, 1, 0, 100, 1), 14, 'runs through a soft change and stops at a hard one');
    assert.equal(Logic.run(A, G, w, h, 15, 4, 1, 0, 6, 1), 6, 'no longer than asked');
    assert.equal(Logic.run(A, G, w, h, 15, 4, -1, 0, 100, 1), 3, 'and back to the wall the other way');
    assert.equal(Logic.run(A, G, w, h, 35, 4, 1, 0, 100, 1), 4, 'stops at the edge of the picture');
    assert.equal(Logic.run(A, G, w, h, 15, 4, 0, 1, 100, 1), 3);
});
