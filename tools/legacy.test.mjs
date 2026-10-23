// Unit tests for web/core/legacy.js: importing the old homepage's settings,
// against every wallpaper's real defaults.js and settings.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

const WEB = resolve(import.meta.dirname, '../web');
const context = vm.createContext({ URLSearchParams });
const load = path => vm.runInContext(readFileSync(join(WEB, path), 'utf8'), context, { filename: path });
load('core/wp.js');
load('wallpapers/catalog.js');
load('core/legacy.js');
const WP = context.WP;
for (const entry of WP.catalog) {
    for (const file of ['defaults.js', 'settings.js']) {
        if (existsSync(join(WEB, 'wallpapers', entry.id, file))) load(`wallpapers/${entry.id}/${file}`);
    }
}
const plain = value => JSON.parse(JSON.stringify(value));
const tools = { defaultsOf: WP.defaultsOf, schemaOf: WP.schemaOf, usable: id => !!WP.entry(id) && !WP.entry(id).disabled };
const run = storage => plain(WP.importLegacy(Object.fromEntries(Object.entries(storage).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])), tools));

// A homepage config as the old dialog saved it: all of its defaults, plus changes.
const LEGACY = {
    fishtankConfig: { configVersion: 1, population: 'community', fishCount: 26, waterTheme: 'planted', hardscape: 'both', snail: true, quality: 'auto', statusBarHeight: 36 },
};

test('legacy: only what someone changed comes over, laid on today\'s defaults', () => {
    const { entries, report } = run({ fishtankConfig: { ...LEGACY.fishtankConfig, fishCount: 40 } });
    assert.deepEqual(entries['wp:fishtank'], { configVersion: WP.defaultsOf('fishtank').configVersion, fishCount: 40 });
    assert.deepEqual(report.wallpapers, ['fishtank']);
    assert.equal(report.settings, 1);
});

test('legacy: untouched homepage values never override today\'s defaults', () => {
    // Snow's homepage defaults (100 flakes) differ from today's; untouched, they stay behind.
    const { entries } = run({ snowConfig: { treeCount: 10, maxSnowflakes: 100, spawnRate: 0.1, statusBarHeight: 36 } });
    assert.equal(entries['wp:snow'], undefined);
});

test('legacy: values are fitted to today\'s controls, or skipped', () => {
    const { entries, report } = run({
        fishtankConfig: { ...LEGACY.fishtankConfig, fishCount: 9999, population: 'krakens', quality: 'performance' },
    });
    const fishCount = WP.schemaOf('fishtank').find(c => c.key === 'fishCount');
    assert.equal(entries['wp:fishtank'].fishCount, fishCount.max, 'clamped to the slider');
    assert.ok(report.skipped.includes('fishtank.population'), 'an option that no longer exists');
    assert.ok(report.skipped.includes('fishtank.quality'), 'a setting the governor replaced');
});

test('legacy: another configVersion was ignored by the homepage, and is here', () => {
    const { entries } = run({ fishtankConfig: { ...LEGACY.fishtankConfig, configVersion: 99, fishCount: 40 } });
    assert.equal(entries['wp:fishtank'], undefined);
});

test('legacy: neko\'s sprite themes become coats', () => {
    const neko = { theme: 'neko', size: 32, speed: 3, idleTimeout: 5000, sleepTimeout: 15000, animationSpeed: 8, enableSounds: false };
    assert.equal(run({ nekoConfig: { ...neko, theme: 'marmalade' } }).entries['wp:neko'].coat, 'orange');
    assert.equal(run({ nekoConfig: { ...neko, theme: 'socks' } }).entries['wp:neko'].coat, 'tuxedo');
    assert.equal(run({ nekoConfig: { ...neko, theme: 'tie-fighter' } }).entries['wp:neko'], undefined, 'no coat for it: stays classic');
});

test('legacy: the chosen wallpaper and advent\'s memory come over; links stay behind', () => {
    const { entries, report } = run({
        wallpaperPreference: 'fishtank', adventLastSeen: '2025-12-14', adventCelebrated: '2025-12-14',
        customLinks: '[{"name":"x"}]', hidePageElements: 'true',
    });
    assert.equal(entries['wp:current'], 'fishtank');
    assert.equal(entries['wp:advent:adventLastSeen'], '2025-12-14');
    assert.equal(report.current, 'fishtank');
    assert.deepEqual(report.leftBehind.sort(), ['hide mode', 'links']);
    assert.ok(!Object.keys(entries).some(key => /link/i.test(key)), 'links are never imported');
    assert.equal(run({ wallpaperPreference: 'weather' }).entries['wp:current'], undefined, 'unknown ids are ignored');
});

test('legacy: the homepage\'s quest wins over the standalone page\'s', () => {
    const { entries } = run({
        questConfig: { configVersion: 1, palette: 'gameboy' },
        questStandaloneConfig: { configVersion: 1, palette: 'cga' },
    });
    assert.equal(entries['wp:quest'].palette, 'gameboy');
    assert.equal(run({ questStandaloneConfig: { configVersion: 1, palette: 'cga' } }).entries['wp:quest'].palette, 'cga');
});

test('legacy: dumps are recognised, and our own exports are not mistaken for one', () => {
    assert.ok(WP.isLegacyDump({ app: 'homepage', localStorage: { fishtankConfig: '{}' } }));
    assert.ok(WP.isLegacyDump({ wallpaperPreference: 'snow' }));
    assert.ok(!WP.isLegacyDump({ app: 'wallpapers', version: 1, settings: { 'wp:current': 'snow' } }));
    assert.ok(!WP.isLegacyDump({ hello: 1 }));
});

test('legacy: every homepage setting is still a setting, or gone for a recorded reason', () => {
    for (const [key, legacy] of Object.entries(WP.LEGACY.DEFAULTS)) {
        const ours = WP.defaultsOf(WP.LEGACY.ID[key]);
        for (const name of Object.keys(legacy)) {
            assert.ok(name === 'configVersion' || name in ours || name in WP.LEGACY.GONE, `${key}.${name} is neither here nor explained`);
        }
    }
});
