// Unit tests for web/core/wp.js and the catalog, run in a Node vm: the same
// classic scripts the browser loads, without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';
import { URL_ALLOW } from './audit.mjs';

const WEB = resolve(import.meta.dirname, '../web');
const context = vm.createContext({ URLSearchParams });
const load = path => vm.runInContext(readFileSync(join(WEB, path), 'utf8'), context, { filename: path });
load('core/wp.js');
load('wallpapers/catalog.js');
const WP = context.WP;
// JSON round trip: vm objects have their own prototypes, which deepEqual minds.
const plain = value => JSON.parse(JSON.stringify(value));

test('seasons: the agreed wallpaper for every month', () => {
    const expected = ['snow', 'snow', 'snow', 'snow', 'fishtank', 'fireflies', 'fireflies', 'fireflies', 'leaves', 'halloween', 'fishtank', 'advent'];
    expected.forEach((id, month) => assert.equal(WP.seasonalFor(new Date(2026, month, 15)), id, `month ${month + 1}`));
});

test('seasons: New Year rolls advent over to snow', () => {
    assert.equal(WP.seasonalFor(new Date(2026, 11, 31, 23, 59, 59)), 'advent');
    assert.equal(WP.seasonalFor(new Date(2027, 0, 1, 0, 0, 0)), 'snow');
});

test('seasons: every seasonal wallpaper exists and can be shown', () => {
    const showable = WP.showable().map(entry => entry.id);
    for (const id of new Set(WP.SEASONS)) assert.ok(showable.includes(id), id);
});

test('URL parameters: only known keys, values as given', () => {
    assert.deepEqual(plain(WP.parseParams('?w=fishtank&panel=open&tier=low&evil=1')), { w: 'fishtank', panel: 'open', tier: 'low' });
    assert.deepEqual(plain(WP.parseParams('')), {});
    assert.equal(WP.parseParams('?date=2026-12-25').date, '2026-12-25');
});

const defaults = { configVersion: 2, count: 10, colours: ['red', 'blue'], on: true };

test('settings: stored overrides merge over defaults', () => {
    const merged = WP.mergeSettings(defaults, { configVersion: 2, count: 20 });
    assert.deepEqual(plain(merged), { configVersion: 2, count: 20, colours: ['red', 'blue'], on: true });
    merged.colours.push('green');
    assert.deepEqual(defaults.colours, ['red', 'blue'], 'defaults are never mutated');
});

test('settings: another configVersion or stale keys are dropped', () => {
    assert.equal(WP.mergeSettings(defaults, { configVersion: 1, count: 99 }).count, 10);
    assert.ok(!('gone' in WP.mergeSettings(defaults, { configVersion: 2, gone: 1 })));
    assert.equal(WP.mergeSettings({ a: 1 }, { a: 2 }).a, 2, 'no version on either side counts as equal');
});

test('settings: only what differs is saved, and nothing when nothing does', () => {
    assert.equal(WP.diffSettings(defaults, plain(defaults)), null);
    assert.deepEqual(plain(WP.diffSettings(defaults, { ...plain(defaults), count: 5, colours: ['red'] })), { configVersion: 2, count: 5, colours: ['red'] });
    assert.equal(WP.diffSettings(defaults, { ...plain(defaults), runtimeOnly: 1 }), null, 'keys the defaults lack are not saved');
});

test('settings: diff then merge round-trips', () => {
    const config = { ...plain(defaults), count: 3, on: false };
    assert.deepEqual(plain(WP.mergeSettings(defaults, WP.diffSettings(defaults, config))), config);
});

test('tiers: URL override, then saved mode, then the host default', () => {
    assert.equal(WP.resolveTier({ override: 'low', mode: 'high', host: 'standalone' }).tier, 'low');
    assert.equal(WP.resolveTier({ mode: 'medium', host: 'standalone' }).tier, 'medium');
    assert.equal(WP.resolveTier({ mode: 'auto', host: 'standalone' }).tier, 'high');
    assert.equal(WP.resolveTier({ mode: 'auto', host: 'android' }).tier, 'medium');
    assert.equal(WP.resolveTier({ override: 'turbo', host: 'standalone' }).tier, 'high', 'unknown values are ignored');
});

test('frame pacing: caps hold on a 60 Hz display', () => {
    const framesInOneSecond = fps => {
        let last = -Infinity, frames = 0;
        for (let tick = 0; tick < 60; tick++) {
            const now = tick * (1000 / 60) + (Math.random() - 0.5);   // vsync with jitter
            if (WP.frameDue(now, last, fps)) { last = now; frames++; }
        }
        return frames;
    };
    assert.equal(framesInOneSecond(0), 60);
    assert.ok(Math.abs(framesInOneSecond(30) - 30) <= 1, `30 fps cap gave ${framesInOneSecond(30)}`);
    assert.ok(Math.abs(framesInOneSecond(20) - 20) <= 1, `20 fps cap gave ${framesInOneSecond(20)}`);
});

test('catalog: unique ids, and every script and defaults file exists', () => {
    const ids = WP.catalog.map(entry => entry.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const entry of WP.catalog.filter(e => !e.pseudo && e.scripts.length)) {
        for (const script of entry.scripts) assert.ok(existsSync(join(WEB, 'wallpapers', script)), script);
        assert.ok(existsSync(join(WEB, 'wallpapers', entry.id, 'defaults.js')), `${entry.id}/defaults.js`);
    }
});

test('defaults: each file registers its own id with plain JSON values', () => {
    for (const entry of WP.catalog.filter(e => !e.pseudo && e.scripts.length)) {
        const registered = [];
        const sandbox = vm.createContext({ WP: { defaults: (id, values) => registered.push([id, values]) } });
        vm.runInContext(readFileSync(join(WEB, 'wallpapers', entry.id, 'defaults.js'), 'utf8'), sandbox);
        assert.equal(registered.length, 1, entry.id);
        const [id, values] = registered[0];
        assert.equal(id, entry.id);
        assert.deepEqual(plain(values), JSON.parse(JSON.stringify(values)), `${entry.id} defaults must survive JSON`);
        assert.ok(!('statusBarHeight' in values), `${entry.id}: insets replaced statusBarHeight`);
    }
});

test('network: every online wallpaper\'s hosts are on the audit allowlist', () => {
    for (const entry of WP.catalog.filter(e => e.network)) {
        const allowed = URL_ALLOW[`web/wallpapers/${entry.id}/`] || [];
        for (const host of entry.network) assert.ok(allowed.includes(host), `${entry.id}: ${host} missing from URL_ALLOW`);
    }
});

// Every wallpaper with settings: its schema and defaults.js must agree.
function schemaFor(id) {
    const sandbox = vm.createContext({ URLSearchParams, Date });
    vm.runInContext(readFileSync(join(WEB, 'core/wp.js'), 'utf8'), sandbox);
    vm.runInContext(readFileSync(join(WEB, 'wallpapers', id, 'defaults.js'), 'utf8'), sandbox);
    vm.runInContext(readFileSync(join(WEB, 'wallpapers', id, 'settings.js'), 'utf8'), sandbox);
    return { schema: sandbox.WP.schemaOf(id), defaults: sandbox.WP.defaultsOf(id) };
}
const withSettings = WP.catalog.filter(e => !e.pseudo && existsSync(join(WEB, 'wallpapers', e.id, 'settings.js')));

test('schema: every wallpaper with code has settings.js', () => {
    for (const entry of WP.catalog.filter(e => !e.pseudo && e.scripts.length)) {
        assert.ok(existsSync(join(WEB, 'wallpapers', entry.id, 'settings.js')), `${entry.id}/settings.js`);
    }
});

test('schema: every control has a default, and every default a control', () => {
    for (const { id } of withSettings) {
        const { schema, defaults } = schemaFor(id);
        const keys = new Set(schema.filter(c => c.key).map(c => c.key));
        for (const key of keys) assert.ok(key in defaults, `${id}: control ${key} has no default`);
        for (const key of Object.keys(defaults)) {
            if (key !== 'configVersion') assert.ok(keys.has(key), `${id}: default ${key} has no control`);
        }
    }
});

test('schema: every default fits its control (range, step grid, options)', () => {
    for (const { id } of withSettings) {
        const { schema, defaults } = schemaFor(id);
        for (const c of schema.filter(c => c.key)) {
            const value = c.get ? c.get(defaults) : defaults[c.key];
            const where = `${id}.${c.key}`;
            if (c.type === 'range') {
                assert.ok(value >= c.min && value <= c.max, `${where}: ${value} outside ${c.min}..${c.max}`);
                const steps = (value - c.min) / c.step;
                assert.ok(Math.abs(steps - Math.round(steps)) < 1e-6, `${where}: ${value} is off the ${c.step} step grid, so the slider would round it`);
            } else if (c.type === 'select') {
                const options = typeof c.options === 'function' ? c.options(defaults) : c.options;
                assert.ok(options.some(([v]) => JSON.stringify(v) === JSON.stringify(value)), `${where}: ${JSON.stringify(value)} isn't an option`);
            } else if (c.type === 'toggle') {
                assert.equal(typeof value, 'boolean', where);
            } else if (c.type === 'multi') {
                assert.ok(Array.isArray(value) && value.every(v => c.options.some(([o]) => o === v)), where);
            } else if (c.type === 'colors') {
                assert.ok(Array.isArray(value) && value.every(v => /^#[0-9a-f]{6}$/i.test(v)), where);
            } else {
                assert.ok(['number', 'text', 'color'].includes(c.type), `${where}: unknown type ${c.type}`);
            }
            assert.equal(typeof c.label === 'function' ? typeof c.label() : typeof c.label, 'string', `${where}: label`);
        }
    }
});

test('thumbnails: every offline wallpaper has a small one', () => {
    for (const entry of WP.catalog.filter(e => !e.pseudo && !e.disabled && !e.network && e.id !== 'blank')) {
        const path = join(WEB, 'wallpapers', entry.id, 'thumb.webp');
        assert.ok(existsSync(path), `${entry.id}: run make thumbnails`);
        const bytes = readFileSync(path);
        assert.equal(bytes.toString('latin1', 8, 12), 'WEBP', `${entry.id}: not a WebP`);
        assert.ok(bytes.length < 40 * 1024, `${entry.id}: thumbnail over 40 KB`);
    }
});
