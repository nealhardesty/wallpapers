// Unit tests for Wiki Pond's reading of the recent-changes stream
// (web/wallpapers/wiki-pond/wiki-pond-events.js), in a Node vm like the
// browser loads it. Events here are made up, never recorded.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

const WEB = resolve(import.meta.dirname, '../web');
const context = vm.createContext({});
vm.runInContext(readFileSync(join(WEB, 'wallpapers/wiki-pond/wiki-pond-events.js'), 'utf8'), context);
const { WikiPondEvents: Events } = context;

const edit = (extra = {}) => ({ type: 'edit', wiki: 'enwiki', user: 'Example Person', bot: false, title: 'Example page', length: { old: 1000, new: 1200 }, meta: { domain: 'example.org' }, ...extra });

test('an edit becomes a ripple sized by the log of the bytes changed', () => {
    const small = Events.read(edit({ length: { old: 1000, new: 1010 } }));
    const big = Events.read(edit({ length: { old: 1000, new: 21000 } }));
    assert.equal(small.kind, 'edit');
    assert.equal(small.delta, 10);
    assert.ok(small.size > 0 && small.size < big.size && big.size <= 1);
    assert.equal(Events.read(edit({ length: { old: 0, new: 5e6 } })).size, 1, 'capped');
});

test('removals are negative, so their rings draw inwards', () => {
    assert.equal(Events.read(edit({ length: { old: 900, new: 400 } })).delta, -500);
});

test('who made it: bot, temporary account, anonymous, registered', () => {
    assert.equal(Events.read(edit({ bot: true })).who, 'bot');
    assert.equal(Events.read(edit({ user: '~2026-00000-01' })).who, 'temp');
    assert.equal(Events.read(edit({ user: '192.0.2.44' })).who, 'anon');      // documentation range
    assert.equal(Events.read(edit({ user: '2001:db8::7' })).who, 'anon');     // documentation range
    assert.equal(Events.read(edit()).who, 'user');
});

test('new pages are lotuses, new accounts bells; other events are skipped', () => {
    assert.equal(Events.read(edit({ type: 'new', length: { new: 3000 } })).kind, 'new');
    assert.equal(Events.read(edit({ type: 'log', log_type: 'newusers' })).kind, 'account');
    assert.equal(Events.read(edit({ type: 'log', log_type: 'block' })), null);
    assert.equal(Events.read(edit({ type: 'categorize' })), null);
});

test('filters: wikis, bots, and Wikimedia\'s canary events', () => {
    assert.equal(Events.read(edit({ wiki: 'dewiki' })), null);
    assert.equal(Events.read(edit({ wiki: 'dewiki' }), { wikis: ['enwiki', 'dewiki'] }).wiki, 'dewiki');
    assert.ok(Events.read(edit({ wiki: 'xxwiki' }), { wikis: ['*'] }));
    assert.equal(Events.read(edit({ bot: true }), { bots: 'hide' }), null);
    assert.equal(Events.read(edit({ meta: { domain: 'canary' } })), null);
    assert.equal(Events.read(null), null);
    assert.equal(Events.parse('not json'), null);
});

test('titles are plain, short and free of control characters', () => {
    assert.equal(Events.cleanTitle('A\u0007b‮c'), 'Abc');
    assert.equal(Events.cleanTitle('x'.repeat(100)).length, 60);
    assert.equal(Events.read(edit({ title: '<b>Bold</b>' })).title, '<b>Bold</b>', 'kept as text; the canvas draws it with fillText, never as markup');
});

test('reconnects: quick after a working stream, backing off to a minute', () => {
    assert.equal(Events.backoff(0), 1000);
    assert.equal(Events.backoff(1), 2000);
    assert.equal(Events.backoff(3), 8000);
    assert.equal(Events.backoff(20), 60000);
});
