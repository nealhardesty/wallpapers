// Unit tests for Stained Glass's pure helpers (web/wallpapers/stained-glass/
// stained-glass.js), run in a Node vm: the Voronoi window and the sun.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

const WEB = resolve(import.meta.dirname, '../web');
const context = vm.createContext({});
vm.runInContext(readFileSync(join(WEB, 'wallpapers/stained-glass/stained-glass.js'), 'utf8'), context, { filename: 'stained-glass.js' });
const { StainedGlass } = context;

const random = (seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647)(42);

test('voronoi: the pieces fill a lancet exactly, no gaps or overlaps', () => {
    const lancet = [[0, 300], [100, 300], [100, 90], [90, 40], [50, 0], [10, 40], [0, 90]];
    const sites = [];
    while (sites.length < 150) {
        const p = [random() * 100, random() * 300];
        if (p[1] > 90 || Math.abs(p[0] - 50) < (p[1] / 90) * 50) sites.push(p);
    }
    const cells = StainedGlass.voronoi(sites, lancet);
    assert.equal(cells.length, sites.length, 'a piece per site');
    const total = cells.reduce((sum, c) => sum + Math.abs(StainedGlass.area(c.points)), 0);
    assert.ok(Math.abs(total - Math.abs(StainedGlass.area(lancet))) < 1e-6, `pieces cover ${total}`);
    // Each piece is the region nearest its own site: its centroid is closer
    // to that site than to any other.
    for (const cell of cells) {
        const [cx, cy] = StainedGlass.centroid(cell.points);
        const own = Math.hypot(cx - cell.site[0], cy - cell.site[1]);
        for (const s of sites) assert.ok(Math.hypot(cx - s[0], cy - s[1]) >= own - 1e-9);
    }
});

test('sun: noon is bright and high, midnight dark; morning east, evening west', () => {
    const noon = StainedGlass.sunAt(new Date(2026, 5, 21, 12, 30));
    const midnight = StainedGlass.sunAt(new Date(2026, 5, 21, 0, 0));
    assert.ok(noon.day > 0.99 && noon.elevation > 50, `noon: ${JSON.stringify(noon)}`);
    assert.ok(midnight.day === 0 && midnight.night > 0.99, 'midnight is night');
    assert.ok(StainedGlass.sunAt(new Date(2026, 5, 21, 8)).azimuth < 0);
    assert.ok(StainedGlass.sunAt(new Date(2026, 5, 21, 17)).azimuth > 0);
    assert.ok(StainedGlass.sunAt(new Date(2026, 11, 21, 12, 30)).elevation < noon.elevation - 20, 'winter sun is lower');
    assert.ok(StainedGlass.sunAt(new Date(2026, 11, 21, 18, 0)).day === 0, 'a winter evening is dark by six');
});

test('sun: the light changes smoothly through a day', () => {
    let previous = StainedGlass.sunAt(new Date(2026, 3, 1, 0, 0));
    for (let minute = 5; minute < 24 * 60; minute += 5) {
        const sun = StainedGlass.sunAt(new Date(2026, 3, 1, 0, minute));
        assert.ok(Math.abs(sun.day - previous.day) < 0.15, `light jumps at ${minute} min`);
        previous = sun;
    }
});

test('sun: every pinned time of day lands where it says', () => {
    const date = new Date(2026, 8, 10);
    const at = name => { const h = StainedGlass.pinnedHour(name, date); const d = new Date(date); d.setHours(Math.floor(h), Math.round((h % 1) * 60)); return StainedGlass.sunAt(d); };
    assert.ok(at('noon').day > 0.99 && at('night').day === 0);
    assert.ok(at('morning').azimuth < 0 && at('afternoon').azimuth > 0);
    assert.ok(at('dawn').warmth > 0.8 && at('dusk').warmth > 0.8 && at('dawn').day > 0);
});
