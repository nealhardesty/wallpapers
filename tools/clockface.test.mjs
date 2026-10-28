// Unit tests for the clock overlay's logic (web/core/clockface.js, SPEC §4.9)
// and its settings (clockface-settings.js), run in a Node vm: formats, zones
// and daylight saving, motion, colour, and what happens to bad settings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

const WEB = resolve(import.meta.dirname, '../web');
const context = vm.createContext({ URLSearchParams, Intl, Date });
const load = path => vm.runInContext(readFileSync(join(WEB, path), 'utf8'), context, { filename: path });
for (const path of ['core/wp.js', 'core/perf.js', 'wallpapers/catalog.js', 'core/clockface.js', 'core/clockface-settings.js']) load(path);
const { WP } = context;
const C = WP.clockface;
const plain = value => JSON.parse(JSON.stringify(value));
const defaults = () => WP.mergeSettings(WP.defaultsOf('clock'), null);
const config = (changes = {}) => ({ ...defaults(), zone: 'UTC', ...changes });
const at = text => new Date(text);
const say = (date, changes) => C.format(date, config(changes), { locale: 'en-US' });
const NOON = at('2026-10-28T12:00:00Z');
const EVENING = at('2026-10-28T22:42:07Z');

// ---- The time ---------------------------------------------------------------
test('digital: 12 and 24 hour, seconds, the AM/PM styles, midnight and noon', () => {
    assert.equal(say(EVENING).time, '10:42 PM');
    assert.equal(say(EVENING, { hour12: '24' }).time, '22:42');
    assert.equal(say(EVENING, { seconds: true }).time, '10:42:07 PM');
    assert.equal(say(EVENING, { meridiem: 'lower' }).time, '10:42 pm');
    assert.equal(say(EVENING, { meridiem: 'short' }).time, '10:42P');
    assert.equal(say(EVENING, { meridiem: 'none' }).time, '10:42');
    assert.equal(say(at('2026-10-28T00:05:00Z')).time, '12:05 AM');
    assert.equal(say(NOON).time, '12:00 PM');
    assert.equal(say(at('2026-10-28T07:05:00Z')).time, '7:05 AM');
    assert.equal(say(at('2026-10-28T07:05:00Z'), { pad: true }).time, '07:05 AM');
    assert.equal(say(at('2026-10-28T07:05:00Z'), { hour12: '24' }).time, '07:05');
    assert.equal(say(at('2026-10-28T00:00:00Z'), { hour12: '24' }).time, '00:00');
});

test('digital: "auto" follows the locale', () => {
    assert.equal(C.format(EVENING, config(), { locale: 'en-US' }).time, '10:42 PM');
    assert.equal(C.format(EVENING, config(), { locale: 'en-GB' }).time, '22:42');
});

test('zones: daylight saving gaps and repeats come out right on the real transitions', () => {
    const newYork = (text, changes) => say(at(text), { zone: 'America/New_York', ...changes });
    assert.equal(newYork('2026-03-08T06:59:00Z').time, '1:59 AM');
    assert.equal(newYork('2026-03-08T07:00:00Z').time, '3:00 AM', 'the hour that doesn\'t exist is skipped');
    assert.equal(newYork('2026-11-01T05:30:00Z').time, '1:30 AM');
    assert.equal(newYork('2026-11-01T06:30:00Z').time, '1:30 AM', 'and the repeated one is shown twice');
    assert.equal(newYork('2026-11-01T05:30:00Z', { extras: ['zone', 'offset'] }).sub, 'Sun, Nov 1 · EDT · UTC−4');
    assert.equal(newYork('2026-11-01T06:30:00Z', { extras: ['zone', 'offset'] }).sub, 'Sun, Nov 1 · EST · UTC−5');
    assert.equal(C.offsetLabel(C.offsetMinutes(at('2026-10-28T00:00:00Z'), 'Asia/Kolkata')), 'UTC+5:30');
    assert.equal(C.offsetLabel(0), 'UTC');
});

test('zones: a zone that Intl doesn\'t know falls back to the device\'s, and nothing throws', () => {
    assert.equal(C.validZone('Not/AZone'), false);
    assert.equal(C.validZone('local'), true);
    assert.equal(C.validZone('UTC'), true);
    assert.doesNotThrow(() => C.parts(NOON, 'Not/AZone'));
    assert.deepEqual(plain(C.parts(NOON, 'Not/AZone')), plain(C.parts(NOON, 'local')));
    assert.ok(C.zones().includes('UTC'));
});

test('second clock: the day it says, at both ends of the world', () => {
    const second = (text, zone, changes) => say(at(text), { secondOn: true, secondZone: zone, ...changes }).second;
    assert.deepEqual(plain(second('2026-10-28T22:42:00Z', 'Pacific/Kiritimati')), { label: 'Kiritimati', time: '12:42 PM', day: 'tomorrow' });
    assert.deepEqual(plain(second('2026-10-28T05:00:00Z', 'Pacific/Pago_Pago')), { label: 'Pago Pago', time: '6:00 PM', day: 'yesterday' });
    assert.deepEqual(plain(second('2026-10-28T12:00:00Z', 'UTC')), { label: 'UTC', time: '12:00 PM', day: '' });
    // 25 hours apart, the dates can be two days apart.
    assert.equal(second('2026-10-29T10:30:00Z', 'Pacific/Kiritimati', { zone: 'Pacific/Pago_Pago' }).day, '+2 days');
    assert.equal(second('2026-10-29T10:30:00Z', 'Pacific/Pago_Pago', { zone: 'Pacific/Kiritimati' }).day, '−2 days');
    assert.equal(second('2026-10-28T22:42:00Z', 'Pacific/Kiritimati', { secondDay: false }).day, '');
    assert.equal(second('2026-10-28T12:00:00Z', 'Asia/Tokyo', { secondLabel: 'offset' }).label, 'UTC+9');
    assert.equal(second('2026-10-28T12:00:00Z', 'Asia/Tokyo', { secondLabel: 'none' }).label, '');
    assert.equal(say(NOON).second, null);
    assert.equal(C.city('Etc/UTC'), 'UTC');
    assert.equal(C.city('America/Argentina/Buenos_Aires'), 'Buenos Aires');
});

test('second clock: stays digital and without seconds, whatever the main style', () => {
    const out = say(EVENING, { style: 'roman', seconds: true, secondOn: true, secondZone: 'Asia/Tokyo' });
    assert.equal(out.second.time, '7:42 AM');
});

// ---- The time styles ----------------------------------------------------------
test('words: to the nearest five minutes, noon and midnight', () => {
    const words = (hour, minute) => C.words({ hour, minute });
    assert.equal(words(10, 42), 'twenty to eleven');
    assert.equal(words(10, 43), 'quarter to eleven');
    assert.equal(words(10, 0), 'ten o’clock');
    assert.equal(words(13, 15), 'quarter past one');
    assert.equal(words(12, 0), 'noon');
    assert.equal(words(0, 0), 'midnight');
    assert.equal(words(23, 58), 'midnight', 'rounding up across the hour');
    assert.equal(words(11, 58), 'noon');
    assert.equal(words(12, 32), 'half past noon');
    assert.equal(words(12, 33), 'twenty-five to one');
    assert.equal(words(3, 7), 'five past three');
    assert.equal(say(EVENING, { style: 'words' }).time, 'twenty to eleven');
});

test('roman: zero is N, and it follows 12 or 24 hours', () => {
    assert.deepEqual(['I', 'IV', 'IX', 'XII', 'XLII', 'LIX', 'N'].map((_, i) => C.roman([1, 4, 9, 12, 42, 59, 0][i])), ['I', 'IV', 'IX', 'XII', 'XLII', 'LIX', 'N']);
    assert.equal(say(EVENING, { style: 'roman', hour12: '24' }).time, 'XXII:XLII');
    assert.equal(say(EVENING, { style: 'roman', hour12: '12' }).time, 'X:XLII');
    assert.equal(say(at('2026-10-28T00:00:00Z'), { style: 'roman', hour12: '24' }).time, 'N:N');
    assert.equal(say(at('2026-10-28T00:00:00Z'), { style: 'roman', hour12: '12' }).time, 'XII:N');
    assert.equal(say(EVENING, { style: 'roman', hour12: '24', seconds: true }).time, 'XXII:XLII:VII');
});

test('binary: lamps for each digit, with none where a digit can\'t go', () => {
    const p = { hour: 23, minute: 59, second: 58 };
    assert.deepEqual(plain(C.binary(p, true, true)), [
        [null, null, 1, 0], [0, 0, 1, 1], [null, 1, 0, 1], [1, 0, 0, 1], [null, 1, 0, 1], [1, 0, 0, 0],
    ]);
    assert.equal(C.binaryText(C.binary(p, true, true)).split('\n')[0], ' ○ ● ●');
    assert.equal(C.binary(p, true, false).length, 4);
    const out = say(at('2026-10-28T23:59:58Z'), { style: 'binary', hour12: '24', seconds: true });
    assert.equal(out.grid.length, 6);
    assert.equal(out.time.split('\n').length, 4);
});

test('hex: the day as a 16-bit number', () => {
    const hex = text => say(at(text), { style: 'hex' }).time;
    assert.equal(hex('2026-10-28T12:00:00Z'), '8000');
    assert.equal(hex('2026-10-28T00:00:00Z'), '0000');
    assert.equal(hex('2026-10-28T06:00:00Z'), '4000');
    assert.equal(hex('2026-10-28T23:59:59.999Z'), 'FFFF');
});

test('beats: 1000 a day from UTC+1, with centibeats on request, and no zone', () => {
    assert.equal(say(at('2026-10-28T00:00:00Z'), { style: 'beats' }).time, '@041');
    assert.equal(say(at('2026-10-28T23:00:00Z'), { style: 'beats' }).time, '@000');
    assert.equal(say(NOON, { style: 'beats', seconds: true }).time, '@541.66');
    assert.equal(say(NOON, { style: 'beats', zone: 'Asia/Tokyo' }).time, say(NOON, { style: 'beats' }).time);
});

test('what changes, and when: the next redraw', () => {
    const next = (text, changes) => C.nextChange(at(text), config(changes));
    assert.equal(next('2026-10-28T12:00:07.250Z'), 52750, 'to the next minute');
    assert.equal(next('2026-10-28T12:00:07.250Z', { seconds: true }), 750, 'to the next second');
    assert.equal(next('2026-10-28T12:00:07.250Z', { extras: ['epoch'] }), 750);
    assert.equal(next('2026-10-28T12:00:07.250Z', { style: 'words', seconds: true }), 52750, 'words has no seconds');
    const tick = next('2026-10-28T12:00:07.250Z', { style: 'hex' });
    assert.ok(tick > 0 && tick <= C.HEX_TICK, `hex ticks every ${C.HEX_TICK} ms`);
    assert.equal(next('2026-10-28T12:00:00Z', { style: 'beats' }), 86400 - (13 * 3600000) % 86400);
});

// ---- The date line ------------------------------------------------------------
test('date: every form, and the case', () => {
    const date = changes => say(EVENING, changes).sub;
    assert.equal(date({ date: 'none' }), '');
    assert.equal(date({ date: 'weekday' }), 'Wednesday');
    assert.equal(date({ date: 'short' }), 'Oct 28');
    assert.equal(date({ date: 'medium' }), 'Wed, Oct 28');
    assert.equal(date({ date: 'long' }), 'Wednesday, October 28');
    assert.equal(date({ date: 'numeric' }), '10/28/2026');
    assert.equal(date({ date: 'iso' }), '2026-10-28');
    assert.equal(date({ dateCase: 'upper' }), 'WED, OCT 28');
    assert.equal(date({ dateCase: 'lower', date: 'long' }), 'wednesday, october 28');
});

test('extras: each one, in a fixed order, joined with a dot', () => {
    const extras = list => say(EVENING, { date: 'none', extras: list }).sub;
    assert.equal(extras(['zone']), 'UTC');
    assert.equal(extras(['offset']), 'UTC');
    assert.equal(extras(['week']), 'W44');
    assert.equal(extras(['dayOfYear']), 'Day 301');
    assert.equal(extras(['quarter']), 'Q4');
    assert.equal(extras(['daysLeft']), '64 days left');
    assert.equal(extras(['epoch']), String(Math.floor(EVENING.getTime() / 1000)));
    assert.equal(extras(['quarter', 'week', 'zone']), 'UTC · W44 · Q4', 'in the list\'s order, not the click order');
    assert.equal(extras([]), '');
    assert.equal(say(EVENING, { extras: ['week'] }).sub, 'Wed, Oct 28 · W44');
});

test('extras: ISO weeks, days left and the moon at the edges', () => {
    const p = text => C.parts(at(text), 'UTC');
    assert.equal(C.isoWeek(p('2026-01-01T12:00:00Z')), 1);
    assert.equal(C.isoWeek(p('2027-01-01T12:00:00Z')), 53, '2026 has 53 weeks');
    assert.equal(C.isoWeek(p('2024-12-30T12:00:00Z')), 1, 'belongs to 2025');
    const left = text => say(at(text), { date: 'none', extras: ['daysLeft'] }).sub;
    assert.equal(left('2026-12-31T12:00:00Z'), 'last day');
    assert.equal(left('2026-12-30T12:00:00Z'), '1 day left');
    assert.equal(left('2028-02-29T12:00:00Z'), '306 days left', 'a leap year has 366');
    assert.equal(C.moon(new Date(Date.UTC(2000, 0, 6, 18, 14))), '🌑');
    assert.equal(C.moon(new Date(Date.UTC(2000, 0, 6, 18, 14) + 14.765 * 86400000)), '🌕');
    assert.equal(C.moon(new Date(Date.UTC(2000, 0, 6, 18, 14) + 7.38 * 86400000)), '🌓');
});

// ---- Fonts --------------------------------------------------------------------
test('fonts: a typed name is a name and nothing else', () => {
    for (const evil of ['Evil";} body{display:none}', 'a</style><script>x()</script>', 'x\\22; y', 'x'.repeat(200), 'a\nb\tc', `a'b`, 'url(http://x)']) {
        const clean = C.cleanFontName(evil);
        assert.ok(!/["';{}:<>()\\\n\t/]/.test(clean), `${JSON.stringify(evil)} → ${JSON.stringify(clean)}`);
        assert.ok(clean.length <= 60);
    }
    assert.equal(C.cleanFontName('  Hiragino   Sans  游ゴシック '), 'Hiragino Sans 游ゴシック');
    assert.equal(C.cleanFontName(null), '');
    assert.match(C.fontFamily({ font: 'custom', fontCustom: 'Menlo' }), /^"Menlo", /);
    assert.doesNotMatch(C.fontFamily({ font: 'custom', fontCustom: '"; } *{' }), /;|}|\*/);
    assert.equal(C.fontFamily({ font: 'custom', fontCustom: '' }), C.fontFamily({ font: 'system' }));
    assert.equal(C.fontFamily({ font: 'nonsense' }), C.fontFamily({ font: 'system' }));
});

test('fonts: every stack ends in a generic family, so something always draws', () => {
    for (const [id, [, stack]] of Object.entries(C.FONTS)) assert.match(stack, /(sans-serif|serif|monospace|cursive)$/, id);
});

// ---- Looks ------------------------------------------------------------------------
test('looks: each names only style settings, matches back to itself, and differs from the others', () => {
    const ids = Object.keys(C.PRESETS);
    assert.ok(ids.length >= 8);
    for (const id of ids) {
        assert.deepEqual(Object.keys(C.PRESETS[id].patch).sort(), [...C.STYLE_KEYS].sort(), id);
        assert.equal(C.presetOf({ ...defaults(), ...C.PRESETS[id].patch }), id);
    }
    assert.equal(new Set(ids.map(id => JSON.stringify(C.PRESETS[id].patch))).size, ids.length, 'no two looks are the same');
    assert.equal(C.presetOf(defaults()), 'minimal', 'the defaults are the Minimal look');
    assert.equal(C.presetOf({ ...defaults(), weight: 400 }), 'custom');
    const schema = WP.schemaOf('clock').find(c => c.key === 'preset');
    assert.equal(schema.get({ ...defaults(), ...C.PRESETS.neon.patch }), 'neon');
    assert.deepEqual(plain(schema.set(defaults(), 'terminal')), plain(C.PRESETS.terminal.patch));
    assert.deepEqual(plain(schema.set(defaults(), 'custom')), {});
});

// ---- Colour -------------------------------------------------------------------------
test('colour: mixing, opacity, daylight and the drifting hue', () => {
    assert.equal(C.mix('#000000', '#ffffff', 0.5), '#808080');
    assert.equal(C.mix('#102030', '#102030', 0.7), '#102030');
    assert.equal(C.alpha('#ff0000', 0.5), 'rgba(255, 0, 0, 0.5)');
    assert.equal(C.alpha('hsl(10deg 85% 72%)', 0.5), 'hsl(10deg 85% 72% / 0.5)');
    assert.equal(C.daylight(12), '#ffffff');
    assert.equal(C.daylight(0), C.daylight(24));
    for (let h = 0; h <= 24; h += 0.25) assert.match(C.daylight(h), /^#[0-9a-f]{6}$/, `hour ${h}`);
    assert.match(C.driftColor(new Date(0)), /^hsl\(\d+(\.\d)?deg 85% 72%\)$/);
    assert.notEqual(C.driftColor(new Date(0)), C.driftColor(new Date(300000)));
    assert.equal(C.driftColor(new Date(0)), C.driftColor(new Date(600000)), 'one turn in ten minutes');
});

test('adaptive: hysteresis around the middle, and no reading keeps the last colour', () => {
    assert.equal(C.pick(null, 0.55), 'dark');
    assert.equal(C.pick(null, 0.5), 'light');
    assert.equal(C.pick('light', 0.55), 'light');
    assert.equal(C.pick('light', 0.62), 'light');
    assert.equal(C.pick('light', 0.63), 'dark');
    assert.equal(C.pick('dark', 0.5), 'dark');
    assert.equal(C.pick('dark', 0.45), 'dark');
    assert.equal(C.pick('dark', 0.44), 'light');
    assert.equal(C.pick('dark', null), 'dark');
    assert.equal(C.pick(null, null), 'light');
    assert.equal(C.pick('light', undefined), 'light');
    assert.equal(C.pick('dark', NaN), 'dark');
    // A scene hovering at 0.5 never flips it.
    let state = 'light';
    for (let i = 0; i < 100; i++) { const next = C.pick(state, 0.5 + 0.04 * Math.sin(i)); assert.equal(next, state); state = next; }
});

test('effects: layers scale with size, and the CSS is well formed', () => {
    const fx = (effect, effectSize = 3) => C.effectLayers({ effect, effectSize, effectColor: '#000000' }, '#ff00ff');
    assert.deepEqual(plain(fx('none')), []);
    assert.equal(fx('soft').length, 2);
    assert.equal(fx('hard').length, 1);
    assert.equal(fx('long').length, 23);
    assert.equal(fx('long', 10).length, 58);
    assert.equal(fx('neon').length, 4);
    assert.ok(fx('glow').every(l => l.x === 0 && l.y === 0), 'a glow has no offset');
    assert.ok(fx('hard', 10)[0].x > fx('hard', 2)[0].x);
    assert.equal(C.shadowCss([]), 'none');
    assert.equal(C.dropShadowCss([]), 'none');
    assert.match(C.shadowCss(fx('soft')), /^0em 0\.036em 0\.108em rgba\(0, 0, 0, 0\.65\), /);
    assert.ok(C.dropShadowCss(fx('long')).match(/drop-shadow/g).length <= 6, 'a long tail is thinned for gradient text');
    assert.match(C.shadowCss(C.effectLayers({ effect: 'glow', effectSize: 3, effectColor: '#000000' }, 'hsl(10deg 85% 72%)')), /hsl\(10deg 85% 72% \/ 0\.9\)/);
});

// ---- Where it goes ---------------------------------------------------------------------
const room = { x0: 20, y0: 20, x1: 780, y1: 480 };
const lcg = seed => { let a = seed; return () => (a = (a * 1664525 + 1013904223) % 4294967296) / 4294967296; };

test('places: bounds minus insets and margin, the nine anchors, a drag, and a box too big for the room', () => {
    assert.deepEqual(plain(C.bounds({ w: 800, h: 500 }, { bw: 100, bh: 40 }, { bottom: 48 }, 10)), { x0: 10, y0: 10, x1: 690, y1: 402 });
    assert.deepEqual(plain(C.bounds({ w: 300, h: 500 }, { bw: 900, bh: 40 }, {}, 10)), { x0: 10, y0: 10, x1: 10, y1: 450 }, 'pinned to the start');
    const spots = Object.fromEntries(C.ANCHORS.map(a => [a, C.anchorPoint(a, room)]));
    assert.deepEqual(plain(spots['top-left']), { x: 20, y: 20 });
    assert.deepEqual(plain(spots.center), { x: 400, y: 250 });
    assert.deepEqual(plain(spots['bottom-right']), { x: 780, y: 480 });
    assert.deepEqual(plain(spots.left), { x: 20, y: 250 });
    assert.deepEqual(plain(spots.top), { x: 400, y: 20 });
    assert.equal(new Set(Object.values(spots).map(p => `${p.x},${p.y}`)).size, 9);
    assert.deepEqual(plain(C.customPoint(0.5, 0.5, room, { w: 800, h: 500 }, { bw: 100, bh: 40 })), { x: 350, y: 230 });
    assert.deepEqual(plain(C.customPoint(0, 1, room, { w: 800, h: 500 }, { bw: 100, bh: 40 })), { x: 20, y: 480 }, 'clamped');
    const centre = C.centreOf({ x: 350, y: 230 }, { w: 800, h: 500 }, { bw: 100, bh: 40 });
    assert.deepEqual(plain(centre), { x: 0.5, y: 0.5 });
    assert.equal(C.textAlign({ align: 'auto', anchor: 'bottom-left' }, 'static'), 'left');
    assert.equal(C.textAlign({ align: 'auto', anchor: 'right' }, 'static'), 'right');
    assert.equal(C.textAlign({ align: 'auto', anchor: 'top' }, 'static'), 'center');
    assert.equal(C.textAlign({ align: 'auto', anchor: 'left' }, 'bounce'), 'center');
    assert.equal(C.textAlign({ align: 'right', anchor: 'left' }, 'static'), 'right');
});

test('bounce: starts at a good angle', () => {
    for (let seed = 1; seed < 200; seed++) {
        const s = C.bounceStart(room, lcg(seed), 60);
        const angle = Math.atan2(Math.abs(s.vy), Math.abs(s.vx)) * 180 / Math.PI;
        assert.ok(angle >= 14.999 && angle <= 75.001, `seed ${seed}: ${angle}°`);
        assert.ok(Math.hypot(s.vx, s.vy) > 59.99 && Math.hypot(s.vx, s.vy) < 60.01);
        const p = C.bounceAt(s, 0, room);
        assert.ok(p.x >= room.x0 && p.x <= room.x1 && p.y >= room.y0 && p.y <= room.y1);
    }
});

test('bounce: ten minutes of legs never leave the box, and every leg ends on a wall', () => {
    for (const seed of [1, 7, 42]) {
        let s = C.bounceStart(room, lcg(seed), 90), t = 0, legs = 0, walls = 0;
        const ask = lcg(seed + 1);
        while (t < 600) {
            const leg = C.bounceLeg(s, room);
            assert.ok(leg.dt > 0, `seed ${seed}: a leg of ${leg.dt} s`);
            // The run is a straight line: a point partway is on the chord.
            const mid = C.bounceAt(s, leg.dt * 0.5, room);
            assert.ok(Math.abs(mid.x - (leg.from.x + leg.to.x) / 2) < 1e-6 && Math.abs(mid.y - (leg.from.y + leg.to.y) / 2) < 1e-6, 'a leg is straight');
            for (const p of [leg.from, leg.to, C.bounceAt(s, leg.dt * ask(), room)]) {
                assert.ok(p.x >= room.x0 - 1e-9 && p.x <= room.x1 + 1e-9 && p.y >= room.y0 - 1e-9 && p.y <= room.y1 + 1e-9, `seed ${seed}: left the box at ${t.toFixed(1)} s`);
            }
            const onWall = (p, lo, hi) => Math.abs(p - lo) < 1e-6 || Math.abs(p - hi) < 1e-6;
            assert.ok(leg.hit.x ? onWall(leg.to.x, room.x0, room.x1) : true);
            assert.ok(leg.hit.y ? onWall(leg.to.y, room.y0, room.y1) : true);
            assert.ok(leg.hit.x || leg.hit.y, 'a leg ends at a wall');
            walls += 1;
            s = leg.next;
            t += leg.dt;
            legs++;
        }
        assert.ok(legs > 20 && walls === legs, `seed ${seed}: ${legs} legs`);
    }
});

test('bounce: the path is the same however it is played', () => {
    // Played as legs, or sampled at any rate from the start, it's one line.
    const start = C.bounceStart(room, lcg(5), 90);
    const at = (state, t) => C.bounceAt(state, t, room);
    let s = start, t = 0;
    while (t < 100) {
        const leg = C.bounceLeg(s, room);
        const inside = Math.min(leg.dt * 0.5, 100 - t);
        const a = at(s, inside), b = at(start, t + inside);
        assert.ok(Math.abs(a.x - b.x) < 1e-3 && Math.abs(a.y - b.y) < 1e-3, `at ${(t + inside).toFixed(2)} s: ${a.x} against ${b.x}`);
        t += leg.dt + 1e-6;   // the hair past each wall
        s = leg.next;
    }
});

test('bounce: walls and corners are noticed', () => {
    const box = { x0: 0, y0: 0, x1: 100, y1: 100 };
    const corner = C.bounceLeg({ u: 90, v: 90, vx: 10, vy: 10 }, box);
    assert.deepEqual(plain(corner.hit), { x: true, y: true, corner: true });
    assert.ok(Math.abs(corner.dt - 1) < 1e-9);
    assert.deepEqual(plain(corner.to), { x: 100, y: 100 });
    const near = C.bounceLeg({ u: 90, v: 50, vx: 10, vy: 1 }, box);
    assert.deepEqual(plain(near.hit), { x: true, y: false, corner: false }, 'the other wall is far off');
    const close = C.bounceLeg({ u: 90, v: 85, vx: 10, vy: 1 }, box);
    assert.equal(close.hit.corner, true, 'within 24 px of the other wall');
    const heading = C.bounceLeg({ u: 50, v: 50, vx: -10, vy: 5 }, box);
    assert.equal(heading.hit.x, true);
    assert.deepEqual(plain(heading.to), { x: 0, y: 75 });
    const after = C.bounceAt(heading.next, 1, box);
    assert.ok(after.x > 0 && after.x < 11, 'bounced back off the wall');
    const squeezed = C.bounceLeg({ u: 5, v: 5, vx: 10, vy: 10 }, { x0: 7, y0: 7, x1: 7, y1: 7 });
    assert.deepEqual([squeezed.dt, squeezed.hit.x, squeezed.hit.y, squeezed.to.x], [30, false, false, 7], 'a box with no room just sits');
    assert.equal(C.fold(-30, 0, 100), 30);
    assert.equal(C.fold(230, 0, 100), 30);
    assert.equal(C.fold(150, 0, 100), 50);
});

test('drift: every path stays inside the unit square and moves', () => {
    for (const path of C.DRIFT_PATHS) {
        let moved = 0, last = C.driftPoint(path, 0);
        for (let t = 0; t < 3000; t += 0.7) {
            const { u, v } = C.driftPoint(path, t);
            assert.ok(u >= 0 && u <= 1 && v >= 0 && v <= 1, `${path} at ${t}`);
            moved += Math.hypot(u - last.u, v - last.v);
            last = { u, v };
        }
        assert.ok(moved > 10, `${path} went nowhere`);
    }
    const frames = C.driftFrames('wander', 100, 1.5, 20);
    assert.equal(frames.length, 21);
    assert.deepEqual(plain(frames[0]), plain(C.driftPoint('wander', 100)));
    assert.deepEqual(plain(frames[20]), plain(C.driftPoint('wander', 130)));
    // Chords of the curve, a second and a half apart, stay close to it.
    for (let k = 0; k < 20; k++) {
        const mid = C.driftPoint('wander', 100 + (k + 0.5) * 1.5);
        assert.ok(Math.hypot(mid.u - (frames[k].u + frames[k + 1].u) / 2, mid.v - (frames[k].v + frames[k + 1].v) / 2) < 0.002, `chord ${k}`);
    }
    // Wander never repeats: the first minute isn't the second.
    assert.notDeepEqual(plain(C.driftPoint('wander', 10)), plain(C.driftPoint('wander', 130)));
});

test('follow: arrives, the same way at any frame rate', () => {
    const target = { x: 100, y: 50 };
    const run = (fps, seconds) => {
        let s = { x: 0, y: 0 };
        for (let i = 0; i < fps * seconds; i++) s = C.stepFollow(s, 1 / fps, target, 1);
        return s;
    };
    const slow = run(10, 1), fast = run(144, 1);
    assert.ok(Math.abs(slow.x - fast.x) < 1e-6 && Math.abs(slow.y - fast.y) < 1e-6);
    const arrived = run(60, 3);
    assert.ok(Math.hypot(arrived.x - 100, arrived.y - 50) < 0.01);
    assert.ok(run(60, 1).x < run(60, 1.5).x, 'moving closer all the time');
});

test('teleport: never the same cell twice running, always inside the box, and cells map back', () => {
    const rand = lcg(3);
    let cell = -1;
    const seen = new Set();
    for (let i = 0; i < 2000; i++) {
        const next = C.pickCell(cell, rand);
        assert.notEqual(next, cell);
        assert.ok(next >= 0 && next <= 8);
        const p = C.cellPoint(next, room, rand);
        assert.ok(p.x >= room.x0 && p.x <= room.x1 && p.y >= room.y0 && p.y <= room.y1);
        assert.equal(C.cellOf(p, room), next);
        seen.add(next);
        cell = next;
    }
    assert.equal(seen.size, 9, 'every cell gets its turn');
    assert.equal(C.teleportDelay('60', NOON), 60000);
    assert.equal(C.teleportDelay('10', NOON), 10000);
    assert.equal(C.teleportDelay('minute', at('2026-10-28T12:00:20.000Z')), 40030);
});

test('night: a window that may wrap past midnight', () => {
    assert.equal(C.parseHM('22:00', 0), 1320);
    assert.equal(C.parseHM('7:05', 0), 425);
    assert.equal(C.parseHM('25:00', 99), 99);
    assert.equal(C.parseHM('noon', 99), 99);
    assert.equal(C.parseHM('12:60', 99), 99);
    const night = minute => C.inNight(minute, 22 * 60, 6 * 60);
    assert.deepEqual([23 * 60, 0, 3 * 60, 5 * 60 + 59].map(night), [true, true, true, true]);
    assert.deepEqual([6 * 60, 12 * 60, 21 * 60 + 59].map(night), [false, false, false]);
    assert.equal(C.inNight(100, 60, 60), false, 'an empty window');
    assert.equal(C.inNight(100, 60, 200), true, 'one that doesn\'t wrap');
});

// ---- Settings that can't be trusted ----------------------------------------------------
test('sanitize: tampered storage can\'t put anything outside the schema', () => {
    const { defaults: d, schema } = { defaults: WP.defaultsOf('clock'), schema: WP.schemaOf('clock') };
    const out = C.sanitize({
        enabled: 'yes', size: 9999, spacing: 'abc', weight: 450, color: 'red', color2: '#ABCDEF', style: 'evil', extras: ['week', 'bogus', 'zone'],
        zone: 'Not/AZone', secondZone: 'Asia/Tokyo', opacity: -5, nightFrom: 'x'.repeat(100), hideOn: 'all', fontCustom: 7, margin: null,
    }, d, schema);
    assert.equal(out.enabled, false);
    assert.equal(out.size, 30);
    assert.equal(out.spacing, d.spacing);
    assert.equal(out.weight, 500, 'snapped to the grid');
    assert.equal(out.color, d.color);
    assert.equal(out.color2, '#abcdef');
    assert.equal(out.style, 'digital');
    assert.deepEqual(plain(out.extras), ['zone', 'week'], 'only the known ones, in order');
    assert.equal(out.zone, 'local');
    assert.equal(out.secondZone, 'Asia/Tokyo');
    assert.equal(out.opacity, 0.2);
    assert.equal(out.nightFrom.length, 5);
    assert.deepEqual(plain(out.hideOn), []);
    assert.equal(out.fontCustom, d.fontCustom);
    assert.equal(out.margin, d.margin);
    assert.deepEqual(plain(C.sanitize(null, d, schema)), plain(d), 'no config at all is the defaults');
    assert.deepEqual(plain(C.sanitize(d, d, schema)), plain(d), 'and the defaults survive it');
});

// ---- The schema ----------------------------------------------------------------------------
test('settings: off by default, and the schema agrees with the defaults', () => {
    const d = defaults(), schema = WP.schemaOf('clock');
    assert.equal(d.enabled, false);
    assert.equal(d.configVersion, 1);
    const own = schema.filter(c => c.key && !c.derived);
    const keys = new Set(own.map(c => c.key));
    for (const key of keys) assert.ok(key in d, `control ${key} has no default`);
    for (const key of Object.keys(d)) if (key !== 'configVersion') assert.ok(keys.has(key), `default ${key} has no control`);
    assert.equal(keys.size, own.length, 'no key twice');
    assert.deepEqual(plain(d), JSON.parse(JSON.stringify(d)), 'plain JSON values');
});

test('settings: every default fits its control (range, step grid, options)', () => {
    const d = defaults();
    for (const c of WP.schemaOf('clock').filter(c => c.key)) {
        const value = c.get ? c.get(d) : d[c.key];
        const where = `clock.${c.key}`;
        if (c.type === 'range') {
            assert.ok(value >= c.min && value <= c.max, `${where}: ${value} outside ${c.min}..${c.max}`);
            const steps = (value - c.min) / c.step;
            assert.ok(Math.abs(steps - Math.round(steps)) < 1e-6, `${where}: ${value} is off the ${c.step} step grid`);
        } else if (c.type === 'select') {
            const options = typeof c.options === 'function' ? c.options(d) : c.options;
            assert.ok(options.some(([v]) => v === value), `${where}: ${JSON.stringify(value)} isn't an option`);
            assert.equal(new Set(options.map(([v]) => v)).size, options.length, `${where}: a repeated option`);
        } else if (c.type === 'toggle') assert.equal(typeof value, 'boolean', where);
        else if (c.type === 'multi') assert.ok(Array.isArray(value) && value.every(v => c.options.some(([o]) => o === v)), where);
        else if (c.type === 'color') assert.match(value, /^#[0-9a-f]{6}$/i, where);
        else assert.ok(['number', 'text'].includes(c.type), `${where}: unknown type ${c.type}`);
        assert.equal(typeof c.label, 'string', `${where}: label`);
    }
});

test('settings: when() and summary() run on any config without throwing', () => {
    const d = defaults();
    const variants = [d, { ...d, enabled: true }, { ...d, enabled: true, secondOn: true, motion: 'bounce', colorMode: 'gradient', plate: 'glass', effect: 'neon', outline: 2, nightMode: 'dim', font: 'custom', style: 'binary', anchor: 'custom' }];
    for (const c of WP.schemaOf('clock')) for (const v of variants) {
        assert.doesNotThrow(() => c.when?.(v), c.key || c.group);
        assert.doesNotThrow(() => c.summary?.(v), c.group);
    }
    assert.equal(C.summaryOf(d), 'off');
    assert.equal(C.summaryOf({ ...d, enabled: true, motion: 'drift', secondOn: true }), 'Digital · Drift · + 2nd zone');
});

test('settings: off means one row, and a moving clock shows the controls that matter', () => {
    const schema = WP.schemaOf('clock');
    // A control shows when its own when() and its group's both say so.
    const shown = c => {
        let group = null;
        const keys = [];
        for (const control of schema) {
            if (control.group) { group = control; continue; }
            if (control.key && (!group || !group.when || group.when(c)) && (!control.when || control.when(c))) keys.push(control.key);
        }
        return keys;
    };
    assert.deepEqual(shown(defaults()), ['enabled'], 'nothing but the switch while it\'s off');
    const on = { ...defaults(), enabled: true };
    assert.deepEqual(shown(on).slice(0, 8), ['enabled', 'preset', 'style', 'date', 'motion', 'size', 'colorMode', 'color'], 'seven rows after the switch');
    assert.ok(shown({ ...on, motion: 'bounce' }).includes('bounceHue'));
    assert.ok(!shown({ ...on, motion: 'static' }).includes('bounceHue'));
    assert.ok(shown({ ...on, motion: 'teleport' }).includes('teleportEvery'));
    assert.ok(!shown(on).includes('secondZone') && shown({ ...on, secondOn: true }).includes('secondZone'));
    assert.ok(!shown(on).includes('color2') && shown({ ...on, colorMode: 'gradient' }).includes('color2'));
    assert.ok(shown({ ...on, anchor: 'custom' }).includes('x'));
    assert.ok(!shown(on).includes('x'));
    for (const group of schema.filter(c => c.group)) assert.ok(group.collapsed || group.advanced, `${group.group} starts collapsed`);
});

// ---- The rest of the wiring --------------------------------------------------------------------------
test('?clock=: on, off, or a motion; nothing else', () => {
    assert.deepEqual(plain(WP.clockParam('on')), { enabled: true });
    assert.deepEqual(plain(WP.clockParam('off')), { enabled: false });
    for (const motion of ['static', 'drift', 'bounce', 'teleport', 'follow']) assert.deepEqual(plain(WP.clockParam(motion)), { enabled: true, motion });
    assert.equal(WP.clockParam('spin'), null);
    assert.equal(WP.clockParam(undefined), null);
    assert.equal(plain(WP.parseParams('?clock=bounce')).clock, 'bounce');
});

test('keys: no wallpaper declares K, which the player owns, and the stage forwards it', () => {
    for (const entry of WP.catalog) for (const binding of entry.keys || []) {
        assert.ok(!binding.keys.some(key => key.toLowerCase() === 'k'), `${entry.id} declares k`);
        assert.ok(!binding.keys.some(key => key.toLowerCase() === 'c'), `${entry.id} declares c`);
    }
    assert.match(readFileSync(join(WEB, 'core/stage.js'), 'utf8'), /PLAYER_KEYS = new Set\(.*'k', 'K'/);
});

test('files: the clock\'s code, styles and settings are on the page, and nothing in it goes online', () => {
    const page = readFileSync(join(WEB, 'index.html'), 'utf8');
    assert.match(page, /href="core\/clockface\.css"/);
    for (const file of ['clockface.js', 'clockface-settings.js', 'clockface-view.js']) {
        const source = readFileSync(join(WEB, 'core', file), 'utf8');
        assert.doesNotMatch(source, /https?:\/\//, `${file} names a URL`);
        assert.doesNotMatch(source, /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/, `${file} touches the network`);
        assert.doesNotMatch(source, /localStorage|sessionStorage/, `${file} should use WP.store`);
        assert.doesNotMatch(source, /new Date\(\)/, `${file} should read the time from the player`);
        assert.doesNotMatch(source, /getImageData|ctx\.filter|shadowBlur/, `${file}: nothing per-frame (SPEC §4.8)`);
    }
});
