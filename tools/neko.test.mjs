// Unit tests for Neko's pure parts: the holiday calendar and hat picks,
// that every hat is well-formed art, that every frame has a place for a
// hat, and that the panel offers exactly the coats and hats there are.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

const WEB = resolve(import.meta.dirname, '../web');
const context = vm.createContext({ URLSearchParams });
const load = path => vm.runInContext(readFileSync(join(WEB, path), 'utf8'), context, { filename: path });
load('core/wp.js');
for (const file of ['sprites.js', 'hats.js', 'defaults.js', 'settings.js']) load(`wallpapers/neko/${file}`);
// neko.js draws with the DOM; only its coat table is needed here.
load('wallpapers/neko/neko.js');
const { NekoHats, NekoBitmaps, NekoSprites, WP } = vm.runInContext('({ NekoHats, NekoBitmaps, NekoSprites, WP })', context);

// Values from the vm come with its own Array: copied, so deepEqual compares contents.
const plain = value => JSON.parse(JSON.stringify(value));
const day = text => new Date(`${text}T12:00:00`);
const hats = text => plain(NekoHats.holiday(day(text)));

test('neko: holidays fall on their days', () => {
    assert.deepEqual(hats('2026-10-29'), ['witch']);
    assert.deepEqual(hats('2026-10-23'), null);
    assert.deepEqual(hats('2026-12-25'), ['santa', 'antlers']);
    assert.deepEqual(hats('2026-12-31'), ['newyear']);
    assert.deepEqual(hats('2027-01-01'), ['newyear']);
    assert.deepEqual(hats('2027-02-14'), ['hearts']);
    assert.deepEqual(hats('2027-03-17'), ['leprechaun']);
    assert.deepEqual(hats('2026-07-04'), ['unclesam']);
    assert.deepEqual(hats('2026-06-01'), null);
});

test('neko: Easter and Thanksgiving move, and the hats move with them', () => {
    const iso = date => [date.getFullYear(), date.getMonth() + 1, date.getDate()].join('-');
    assert.equal(iso(NekoHats.easter(2026)), '2026-4-5');
    assert.equal(iso(NekoHats.easter(2027)), '2027-3-28');
    assert.equal(iso(NekoHats.easter(2038)), '2038-4-25');
    assert.deepEqual(hats('2027-03-26'), ['bunny']);    // Good Friday
    assert.deepEqual(hats('2027-03-29'), ['bunny']);    // Easter Monday
    assert.deepEqual(hats('2027-03-30'), null);
    assert.equal(NekoHats.thanksgiving(2026), 26);
    assert.equal(NekoHats.thanksgiving(2027), 25);
    assert.deepEqual(hats('2026-11-27'), ['pilgrim']);
    assert.deepEqual(hats('2026-11-25'), null);
});

test('neko: picks follow the setting, the holiday and the day', () => {
    const plain = day('2026-06-01'), christmas = day('2026-12-24');
    assert.equal(NekoHats.pick('holiday', 0, plain), null);
    assert.equal(NekoHats.pick('holiday', 1, christmas), 'antlers');
    assert.equal(NekoHats.pick('assorted', 3, christmas), 'antlers');
    assert.equal(NekoHats.pick('off', 0, christmas), null);
    assert.equal(NekoHats.pick('cap', 0, christmas), 'cap', 'a chosen hat beats the holiday');
    const mix = Array.from({ length: 14 }, (_, i) => NekoHats.pick('assorted', i, plain));
    assert.equal(new Set(mix).size, 14, 'assorted: every everyday hat before any repeats');
    assert.notEqual(NekoHats.pick('assorted', 0, day('2026-06-02')), mix[0], 'a different mix tomorrow');
});

test('neko: every hat is rectangular art in its own colours', () => {
    for (const name of Object.keys(NekoHats.art)) {
        const colours = NekoHats.art[name].colours;
        for (const rows of NekoHats.frames(name)) {
            for (const row of rows) {
                assert.equal(row.length, rows[0].length, `${name}: "${row}" is ${row.length} wide, not ${rows[0].length}`);
                for (const letter of row) if (letter !== '.') assert.ok(colours[letter], `${name}: no colour for "${letter}"`);
            }
        }
    }
});

test('neko: every frame has a head for a hat, inside the frame', () => {
    assert.deepEqual(Object.keys(NekoHats.anchors).sort(), Object.keys(NekoBitmaps).sort());
    for (const [name, [x, y, facing]] of Object.entries(NekoHats.anchors)) {
        assert.ok(x >= 0 && x < 32 && y >= 0 && y < 32, `${name}: (${x}, ${y})`);
        assert.ok([-1, 0, 1].includes(facing), name);
    }
});

test('neko: the panel offers exactly the coats and hats there are', () => {
    const options = key => plain(WP.schemaOf('neko').find(s => s.key === key).options.map(([value]) => value));
    assert.deepEqual(options('coat').filter(c => c !== 'assorted').sort(), Object.keys(NekoSprites.coats).sort());
    assert.deepEqual(options('hat').filter(h => !['holiday', 'assorted', 'off'].includes(h)).sort(), Object.keys(NekoHats.art).sort());
    assert.deepEqual(plain(NekoSprites.ASSORTED).sort(), Object.keys(NekoSprites.coats).sort());
});
