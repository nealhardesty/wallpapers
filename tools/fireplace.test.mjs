// Fireplace's wood (web/wallpapers/fireplace/fireplace-wood.js): the shape
// of the logs, the char laid over them, where they touch, the glow zones
// and the coal bed. All geometry, so no canvas is needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const WEB = resolve(import.meta.dirname, '../web');
const Wood = new Function(`${readFileSync(join(WEB, 'wallpapers/fireplace/fireplace-wood.js'), 'utf8')}; return FireplaceWood;`)();

// Signed area of a flat [x, y, ...] polygon: its sign is its winding
const area = pts => {
    let sum = 0;
    for (let i = 0; i < pts.length; i += 2) {
        const j = (i + 2) % pts.length;
        sum += pts[i] * pts[j + 1] - pts[j] * pts[i + 1];
    }
    return sum / 2;
};

const log = (over = {}, seed = 7, palette = 'hardwood') => Wood.makeLog(
    { cx: 800, cy: 700, length: 500, radius: 70, angle: 0, row: 1, ...over },
    Wood.random(seed),
    { palette, centre: 800 }
);

// A log with a given cut, whatever the dice say
const cutLog = (cut, seed = 7) => {
    for (let s = seed; s < seed + 400; s++) {
        const l = log({}, s);
        if (l.cut === cut) return l;
    }
    throw new Error(`no ${cut} log`);
};

test('logs: the same seed builds the same log', () => {
    const a = log();
    const b = log();
    assert.deepEqual([...a.top], [...b.top]);
    assert.deepEqual([...a.bot], [...b.bot]);
    assert.equal(a.species, b.species);
    assert.equal(a.cut, b.cut);
    assert.notDeepEqual([...log({}, 8).top], [...a.top]);
});

test('logs: never a straight pipe, but never inside out', () => {
    for (let seed = 1; seed <= 40; seed++) {
        const l = log({}, seed);
        const heights = [];
        for (let i = 0; i < l.us.length; i++) {
            const h = l.bot[i] - l.top[i];
            assert.ok(h > l.radius * 1.2 && h < l.radius * 3, `seed ${seed}: height ${h.toFixed(1)} at ${i}`);
            heights.push(h);
        }
        const spread = Math.max(...heights) - Math.min(...heights);
        assert.ok(spread > l.radius * 0.02, `seed ${seed}: a perfect cylinder`);
    }
});

test('logs: the end that shows is the one turned toward the viewer', () => {
    for (let seed = 1; seed <= 20; seed++) {
        assert.equal(log({ cx: 0 }, seed).endSide, 1, `seed ${seed}: a log far left shows its right end`);
        assert.equal(log({ cx: 1600 }, seed).endSide, -1, `seed ${seed}: a log far right shows its left end`);
    }
});

test('logs: body and both ends wind the same way, so they union into one outline', () => {
    for (const cut of ['round', 'half', 'quarter']) {
        const l = cutLog(cut);
        for (const poly of Wood.silhouettePolys(l)) assert.ok(area(poly) > 0, `${cut}: a polygon wound backwards`);
    }
});

test('logs: end grain stays inside the end', () => {
    for (const cut of ['round', 'half', 'quarter']) {
        const l = cutLog(cut);
        for (let rho = 0; rho <= 1; rho += 0.1) {
            for (let a = 0; a <= 1; a += 0.05) {
                const [x, y] = Wood.facePoint(l, rho, a);
                assert.ok(Math.abs(x) <= 1.001 && Math.abs(y) <= 1.001, `${cut}: (${x.toFixed(3)}, ${y.toFixed(3)}) at rho ${rho}, a ${a}`);
            }
        }
    }
});

test('woods: each flame palette burns its own wood', () => {
    const seen = palette => new Set(Array.from({ length: 60 }, (_, i) => log({}, i + 1, palette).species));
    assert.deepEqual([...seen('driftwood')], ['drift']);
    assert.deepEqual([...seen('softwood')], ['pine']);
    const hard = seen('hardwood');
    assert.ok(hard.has('oak') && hard.has('birch') && !hard.has('pine'));
});

test('char: blocks tile the whole visible side, in bands, without gaps', () => {
    for (const cut of ['round', 'quarter']) {
        const l = cutLog(cut);
        Wood.findContacts([l], null);
        Wood.dress(l, 0.6);
        let covered = 0;
        let from = Infinity;
        let to = -Infinity;
        for (const cell of l.cells) {
            assert.equal(cell.pts.length, 20);
            covered += Math.abs(area(cell.pts));
            for (let i = 0; i < cell.pts.length; i += 2) {
                from = Math.min(from, cell.pts[i]);
                to = Math.max(to, cell.pts[i]);
            }
        }
        // The outer columns run past the box; measure the side they span
        let side = 0;
        for (let u = from; u < to; u += 1) {
            const [top, bot] = Wood.edges(l, u);
            side += bot - top;
        }
        assert.ok(Math.abs(covered / side - 1) < 0.04, `${cut}: cells cover ${(covered / side * 100).toFixed(1)}% of the side`);
    }
});

test('char: no crack across the grain runs the whole way round', () => {
    const l = cutLog('round');
    Wood.dress(l, 0.6);
    const top = new Set(l.cells.filter(c => c.s < 0.1).map(c => c.pts[4].toFixed(3)));
    const bottom = l.cells.filter(c => c.s > 0.9).map(c => c.pts[10].toFixed(3));
    assert.ok(bottom.every(x => !top.has(x)), 'a column boundary is shared by the top and bottom bands');
});

test('char: a longer burn chars more, and only char glows', () => {
    const l = log();
    Wood.findContacts([l], null);
    for (let u = -200; u <= 200; u += 40) {
        for (let v = -1; v <= 1; v += 0.25) {
            assert.ok(Wood.charAt(l, u, v, 0.9) >= Wood.charAt(l, u, v, 0.3));
            if (Wood.charAt(l, u, v, 0.3) < 0.45) assert.equal(Wood.heatAt(l, u, v, Wood.charAt(l, u, v, 0.3)), 0);
        }
    }
    // The underside faces the coals: on average it is the more burned
    let under = 0;
    let over = 0;
    for (let u = -200; u <= 200; u += 10) {
        under += Wood.charAt(l, u, 0.9, 0.5);
        over += Wood.charAt(l, u, -0.9, 0.5);
    }
    assert.ok(under > over);
});

test('contacts: a log resting on another touches it, a log on its own touches nothing', () => {
    const lower = log({ cx: 800, cy: 700, row: 0 }, 3);
    const upper = log({ cx: 820, cy: 700 - 70 * 1.9, row: 1 }, 4);
    const apart = log({ cx: 800, cy: 100 }, 5);
    Wood.findContacts([lower, upper, apart], null);
    assert.ok(upper.contacts.some(c => c.v === 1), 'the upper log touches nothing below it');
    assert.ok(lower.contacts.some(c => c.v === -1), 'the lower log feels nothing on top');
    assert.equal(apart.contacts.length, 0);
    // Where they touch, both burn hotter
    const at = upper.contacts.find(c => c.v === 1).u;
    assert.ok(Wood.contactAt(upper, at, 1) > 0.5);
    // And a log that sinks into the bed touches it all along
    const sunk = log({ cx: 800, cy: 700, row: 0 }, 6);
    Wood.findContacts([sunk], () => 700);
    assert.ok(sunk.contacts.filter(c => c.v === 1).length > 10);
});

test('zones: their weights sum to one everywhere, so breathing never shows a seam', () => {
    for (let seed = 1; seed <= 10; seed++) {
        const l = log({}, seed);
        const zones = Wood.zones(l);
        const box = Wood.box(l);
        assert.ok(zones.length >= 2);
        for (let u = box.x0; u <= box.x1; u += 0.5) {
            const sum = zones.reduce((s, z) => s + Wood.zoneWeight(z, u), 0);
            assert.ok(Math.abs(sum - 1) < 1e-9, `seed ${seed}: weights sum to ${sum} at u ${u}`);
        }
    }
});

test('bed: a lumpy heap on the hearth, deeper with depth, and none at zero', () => {
    const bed = depth => Wood.makeBed(Wood.random(11), { width: 1200, ground: 800, scale: 1, depth });
    const one = bed(1);
    const two = bed(2);
    const none = bed(0);
    const mean = b => b.heights.reduce((s, h) => s + h, 0) / b.heights.length;
    assert.ok(mean(one) > 20 && mean(one) < 60, `mean depth ${mean(one)}`);
    assert.ok(mean(two) > mean(one) * 1.8);
    assert.equal(none.chunks.length, 0);
    assert.ok(none.heights.every(h => h === 0));
    assert.ok(Math.max(...one.heights) - Math.min(...one.heights) > 8, 'a flat bed');
    for (const chunk of one.chunks) {
        assert.ok(chunk.x > -40 && chunk.x < 1240);
        assert.ok(chunk.y < 800 + chunk.size, 'a chunk below the hearth');
        assert.ok(['live', 'ash', 'char'].includes(chunk.kind));
    }
    assert.ok(one.chunks.filter(c => c.kind === 'live').length > 10, 'no live coals');
    assert.ok(Math.abs(Wood.bedHeight(one, 3) - (one.heights[0] + one.heights[1]) / 2) < 1e-4);
    assert.ok(one.top < 800 - Math.max(...one.heights));
});
