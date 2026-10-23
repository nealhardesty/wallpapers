// Unit tests for web/core/wp.js and the catalog, run in a Node vm: the same
// classic scripts the browser loads, without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';
import { URL_ALLOW } from './audit.mjs';

const WEB = resolve(import.meta.dirname, '../web');
const context = vm.createContext({ URLSearchParams });
const load = path => vm.runInContext(readFileSync(join(WEB, path), 'utf8'), context, { filename: path });
load('core/wp.js');
load('core/perf.js');
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

test('location: rounded to 0.1° and checked on the way out of storage', () => {
    assert.deepEqual(plain(WP.roundLocation(12.3456, -56.789)), { lat: 12.3, lon: -56.8 });
    assert.deepEqual(plain(WP.roundLocation(95, 190)), { lat: 90, lon: -170 }, 'clamped and wrapped');
    assert.deepEqual(plain(WP.roundLocation(-0.04, 0.04)), { lat: 0, lon: 0 }, 'no negative zero');
    assert.deepEqual(plain(WP.readLocation({ lat: 12.34, lon: -56.78, label: 'Testville', source: 'typed' })),
        { lat: 12.3, lon: -56.8, label: 'Testville', source: 'typed' });
    assert.equal(WP.readLocation(null), null);
    assert.equal(WP.readLocation({ lat: 'here', lon: 1 }), null);
    assert.equal(WP.readLocation({ lat: 1, lon: 2, source: 'gps' }).source, 'typed', 'an unknown source');
    assert.equal(WP.readLocation({ lat: 1, lon: 2, label: 7 }).label, '');
});

test('location: wallpapers that need it say so, and are network wallpapers with an offline scene', () => {
    for (const entry of WP.catalog.filter(e => e.needs)) {
        assert.ok(entry.needs.every(need => ['location'].includes(need)), entry.id);
        if (entry.needs.includes('location')) assert.ok(entry.network?.includes('geocoding-api.open-meteo.com'), `${entry.id}: the panel's geocoder`);
    }
    assert.deepEqual(URL_ALLOW['web/core/location.js'], ['geocoding-api.open-meteo.com']);
});

const defaults = { configVersion: 2, count: 10, colours: ['red', 'blue'], on: true };

test('clock: with no ?date=, the real time', () => {
    let t = Date.UTC(2026, 9, 22, 12);
    const now = WP.clock(undefined, () => t);
    assert.equal(now().getTime(), t);
    t += 5000;
    assert.equal(now().getTime(), t, 'and it ticks');
    assert.equal(WP.clock('next tuesday', () => t)().getTime(), t, 'nonsense is ignored');
    assert.equal(WP.clock('2026-02-31', () => t)().getTime(), t, 'so are days that don\'t exist');
});

test('clock: a date travels there, keeping the time of day, and ticks on', () => {
    let t = new Date(2026, 9, 22, 15, 4, 5).getTime();
    const now = WP.clock('2026-12-24', () => t);
    const at = now();
    assert.deepEqual([at.getFullYear(), at.getMonth(), at.getDate(), at.getHours(), at.getMinutes()], [2026, 11, 24, 15, 4]);
    t += 60000;
    assert.equal(now().getMinutes(), 5);
});

test('clock: a date and time start at that moment, and tick past midnight', () => {
    let t = new Date(2026, 9, 22, 9, 0).getTime();
    const now = WP.clock('2026-12-31T23:59:50', () => t);
    assert.deepEqual([now().getMonth(), now().getDate(), now().getHours(), now().getMinutes(), now().getSeconds()], [11, 31, 23, 59, 50]);
    t += 10000;
    assert.deepEqual([now().getFullYear(), now().getMonth(), now().getDate(), now().getHours()], [2027, 0, 1, 0]);
    assert.equal(WP.clock('2026-12-31T22:00', () => t)().getHours(), 22, 'seconds are optional');
    assert.equal(WP.parseDate('2026-12-31T24:00'), null);
});

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

test('tiers: URL override, then saved mode, then Auto', () => {
    assert.equal(WP.modeOf({ override: 'low', saved: { mode: 'high' } }), 'low');
    assert.equal(WP.modeOf({ saved: { mode: 'medium' } }), 'medium');
    assert.equal(WP.modeOf({ saved: null }), 'auto');
    assert.equal(WP.modeOf({ override: 'turbo', saved: null }), 'auto', 'unknown values are ignored');
});

const FISH = { effects: [['depthBlur', 'high'], ['caustics', 'medium'], ['glass', 'low']] };
const policy = (signals = {}) => WP.powerPolicy({ host: 'standalone', ...signals });

test('quality: a tier keeps the effects declared for it, and slow motion its own fps', () => {
    assert.deepEqual(plain(WP.qualityFor('high', FISH).effects), ['depthBlur', 'caustics', 'glass']);
    assert.deepEqual(plain(WP.qualityFor('medium', FISH).effects), ['caustics', 'glass']);
    assert.deepEqual(plain(WP.qualityFor('low', FISH).effects), ['glass']);
    assert.equal(WP.qualityFor('low', { motion: 'slow' }).fps, 10);
    assert.equal(WP.qualityFor('high', {}, 30).fps, 30, 'a power cap applies to the display rate too');
});

test('ladder: from the ceiling down, every rung cheaper than the last', () => {
    const rungs = WP.ladder(FISH);
    assert.equal(rungs[0].label, 'High');
    assert.ok(rungs.some(r => r.label === 'Medium') && rungs.some(r => r.label === 'Low'));
    assert.equal(rungs.at(-1).fps, 10);
    const cost = q => (q.fps || 60) * q.renderScale ** 2 * q.dpr ** 2 * (0.5 + q.density) * (1 + q.effects.length);
    for (let i = 1; i < rungs.length; i++) assert.ok(cost(rungs[i]) < cost(rungs[i - 1]), `${rungs[i].label} costs more than ${rungs[i - 1].label}`);
    assert.equal(WP.ladder(FISH, { ceiling: 'medium' })[0].label, 'Medium');
    assert.deepEqual(plain(WP.ladder({}, { ceiling: 'low' }).map(r => r.label)), ['Low', 'Low, 15 fps', 'Low, 10 fps']);
});

// A fake clock: frames at the rung's rate, each taking `ms(now)` of work.
function run(governor, ms, from, to) {
    const changes = [];
    for (let now = from; now < to; now += 1000 / (governor.quality.fps || 60)) {
        if (governor.sample(ms(now), now)) changes.push({ at: Math.round(now), rung: governor.rung });
    }
    return changes;
}

test('governor: slow frames step down within 3 s, and keep stepping', () => {
    const governor = new WP.Governor({ rungs: WP.ladder(FISH) });
    const changes = run(governor, () => 15, 0, 10000);
    assert.ok(changes.length >= 2, 'stepped more than once');
    assert.ok(changes[0].at <= 3000, `first step at ${changes[0].at} ms`);
});

test('governor: a calm device stays put, then climbs back after 20 s', () => {
    const governor = new WP.Governor({ rungs: WP.ladder(FISH), start: 4 });
    assert.deepEqual(run(governor, () => 1, 0, 19000), []);
    const changes = run(governor, () => 1, 19000, 45000);
    assert.equal(changes[0].rung, 3);
    assert.ok(changes[0].at >= 20000);
});

test('governor: a step up that fails is locked out, so it never flaps', () => {
    const rungs = WP.ladder(FISH);
    const governor = new WP.Governor({ rungs, start: 3 });
    // Cheap on rung 3, too slow on rung 2: up at 20 s, back down by 22 s,
    // then no more tries for 5 minutes.
    const ms = () => governor.rung <= 2 ? 20 : 1;
    const changes = run(governor, ms, 0, 200000);
    assert.deepEqual(changes.map(c => c.rung).slice(0, 2), [2, 3]);
    assert.equal(changes.length, 2, `flapped: ${JSON.stringify(changes)}`);
});

test('power: battery, saver, heat and reduced motion lower the ceiling; the strictest wins', () => {
    assert.equal(policy().ceiling, 'high');
    assert.equal(WP.powerPolicy({ host: 'android' }).ceiling, 'medium');
    assert.equal(WP.powerPolicy({ host: 'android' }).fpsCap, 30);
    assert.equal(policy({ battery: { charging: true, level: 0.1 } }).ceiling, 'high');
    assert.equal(policy({ battery: { charging: false, level: 0.5 } }).ceiling, 'medium');
    assert.equal(policy({ battery: { charging: false, level: 0.1 } }).ceiling, 'low');
    assert.equal(policy({ batteryAware: false, battery: { charging: false, level: 0.1 } }).ceiling, 'high');
    assert.equal(policy({ saver: true }).fpsCap, 15);
    assert.equal(policy({ thermal: 'moderate' }).ceiling, 'medium');
    assert.equal(WP.powerPolicy({ host: 'android', thermal: 'moderate' }).ceiling, 'low');
    assert.deepEqual(plain(policy({ thermal: 'critical' })), { ceiling: 'low', fpsCap: 10, pause: true, reasons: ['hot'] });
    assert.equal(policy({ reducedMotion: true }).fpsCap, 20);
    assert.equal(WP.powerPolicy({ host: 'android', hidden: true }).pause, true, 'hidden pauses');
    assert.equal(WP.powerPolicy({ host: 'android', saver: true, preview: true }).ceiling, 'high', 'the picker preview gets the best');
});

test('plan: a pinned tier never beats the power ceiling; Auto starts where it settled', () => {
    const onBattery = policy({ battery: { charging: false, level: 0.5 } });
    assert.equal(WP.planQuality({ entry: FISH, mode: 'high', policy: onBattery }).quality.tier, 'medium');
    assert.equal(WP.planQuality({ entry: FISH, mode: 'low', policy: policy() }).quality.tier, 'low');
    const plan = WP.planQuality({ entry: FISH, policy: policy(), memory: 'Medium' });
    assert.equal(plan.quality.label, 'Medium');
    assert.equal(WP.planQuality({ entry: FISH, policy: policy(), memory: 'gone' }).start, 0);
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
    for (const entry of WP.catalog.filter(e => !e.pseudo && !e.disabled && (!e.network || e.offline) && e.id !== 'blank')) {
        const path = join(WEB, 'wallpapers', entry.id, 'thumb.webp');
        assert.ok(existsSync(path), `${entry.id}: run make thumbnails`);
        const bytes = readFileSync(path);
        assert.equal(bytes.toString('latin1', 8, 12), 'WEBP', `${entry.id}: not a WebP`);
        assert.ok(bytes.length < 40 * 1024, `${entry.id}: thumbnail over 40 KB`);
    }
});

test('extension: host_permissions are exactly the catalog\'s network hosts', () => {
    const manifest = JSON.parse(readFileSync(join(WEB, 'manifest.json'), 'utf8'));
    const hosts = [...new Set(WP.catalog.flatMap(e => e.network || []))].sort();
    assert.deepEqual(manifest.host_permissions.map(p => p.match(/^https:\/\/([^/]+)\/\*$/)?.[1]).sort(), hosts);
    assert.equal(manifest.manifest_version, 3);
    assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
    assert.deepEqual(manifest.permissions ?? [], [], 'no permissions beyond the hosts: settings live in localStorage');
});

test('icons: every one the manifests name exists', () => {
    const manifest = JSON.parse(readFileSync(join(WEB, 'manifest.json'), 'utf8'));
    const app = JSON.parse(readFileSync(join(WEB, 'app.webmanifest'), 'utf8'));
    for (const path of [...Object.values(manifest.icons), ...app.icons.map(i => i.src)]) assert.ok(existsSync(join(WEB, path)), path);
});

test('CSP: pages carry the extension\'s policy and have no inline script', () => {
    for (const page of ['index.html', 'stage.html']) {
        const html = readFileSync(join(WEB, page), 'utf8');
        assert.match(html, /http-equiv="Content-Security-Policy" content="script-src 'self'/, page);
        assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/, `${page}: inline <script>`);
        assert.doesNotMatch(html, /\son[a-z]+=/i, `${page}: inline event handler`);
    }
});

// The ID Chrome derives from the manifest's public key: the first 32 hex
// digits of its SHA-256, written with a–p. Pinned so the extension keeps
// its ID, and with it its settings, wherever it's unpacked (SPEC §5).
export const EXTENSION_ID = 'hajnldgffgkdnbimdihipffnimjckgcp';

test('extension: the manifest key pins the documented ID', () => {
    const { key } = JSON.parse(readFileSync(join(WEB, 'manifest.json'), 'utf8'));
    const hex = createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32);
    assert.equal([...hex].map(c => String.fromCharCode(97 + parseInt(c, 16))).join(''), EXTENSION_ID);
});
