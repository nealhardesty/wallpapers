// Unit tests for the Jellyfin wallpaper's decisions
// (web/wallpapers/jellyfin/jellyfin-logic.js), in a Node vm like the browser
// loads it: subtitle picking, the shuffle bag, the device profile, the
// resolution cap and poster mode, resume and clips. Streams here are made up
// in Jellyfin's shape (spike 9.0, §10.21).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

const WEB = resolve(import.meta.dirname, '../web');
const context = vm.createContext({ URL });
vm.runInContext(readFileSync(join(WEB, 'wallpapers/jellyfin/jellyfin-logic.js'), 'utf8'), context);
const { JellyfinLogic: J } = context;
const plain = value => JSON.parse(JSON.stringify(value));

const sub = (Index, Language, extra = {}) => ({ Index, Type: 'Subtitle', Language, IsTextSubtitleStream: true, IsForced: false, IsDefault: false, IsHearingImpaired: false, ...extra });
const audio = (Index, Language) => ({ Index, Type: 'Audio', Language });
const image = (Index, Language, extra = {}) => sub(Index, Language, { IsTextSubtitleStream: false, Codec: 'PGSSUB', DeliveryMethod: 'Encode', ...extra });

test('server: a bare host gets http and 8096; paths and https stay; junk is refused', () => {
    assert.equal(J.normalizeServer('jellyfin.invalid'), 'http://jellyfin.invalid:8096');
    assert.equal(J.normalizeServer('jellyfin.invalid:9000/'), 'http://jellyfin.invalid:9000');
    assert.equal(J.normalizeServer(' https://media.example.org/jellyfin/ '), 'https://media.example.org/jellyfin');
    assert.equal(J.normalizeServer('HTTP://Example.org:8096'), 'http://example.org:8096');
    assert.equal(J.normalizeServer(''), null);
    assert.equal(J.normalizeServer('ftp://example.org'), null);
    assert.equal(J.normalizeServer('http://user:secret@example.org'), null, 'no credentials in the address');   // audit-allow: a made-up address, as a test case
});

test('server: an https page can reach an http server by IP or localhost, not by name (spike 9.0)', () => {
    assert.equal(J.blockedBecause('http://jellyfin.invalid:8096', 'https:', 'standalone'), 'mixed');
    assert.equal(J.blockedBecause('http://10.20.30.40:8096', 'https:', 'standalone'), null);   // audit-allow: a made-up private address, as a test case
    assert.equal(J.blockedBecause('http://localhost:8096', 'https:', 'standalone'), null);
    assert.equal(J.blockedBecause('http://jellyfin.invalid:8096', 'file:', 'standalone'), null);
    assert.equal(J.blockedBecause('http://jellyfin.invalid:8096', 'https:', 'android'), null, 'the app carries it');
    assert.equal(J.blockedBecause('https://jellyfin.invalid', 'https:', 'standalone'), null);
});

test('the authorization header names the client, device and token, without stray quotes', () => {
    const header = J.authHeader({ device: 'Chrome "x"', deviceId: 'abc', version: '0.7.0', token: 'tok' });
    assert.equal(header, 'MediaBrowser Client="Wallpapers", Device="Chrome x", DeviceId="abc", Version="0.7.0", Token="tok"');
    assert.ok(!J.authHeader({ device: 'd', deviceId: 'i', version: '1' }).includes('Token'));
});

test('media URLs: direct, except Android with an http server, which goes through the app', () => {
    assert.equal(J.mediaUrl('http://jellyfin.invalid:8096', '/Videos/1/stream'), 'http://jellyfin.invalid:8096/Videos/1/stream');
    assert.equal(J.mediaUrl('http://jellyfin.invalid:8096', '/Videos/1/stream', { android: true, origin: 'https://app.example' }),
        'https://app.example/jellyfin-media/http/jellyfin.invalid:8096/Videos/1/stream');
    assert.equal(J.mediaUrl('https://jellyfin.invalid', '/Videos/1/stream', { android: true, origin: 'https://app.example' }), 'https://jellyfin.invalid/Videos/1/stream');
});

test('subtitles: a full English track beats a forced one, which beats a default', () => {
    const streams = [audio(1, 'eng'), sub(2, 'eng', { IsForced: true }), sub(3, 'spa', { IsDefault: true }), sub(4, 'eng')];
    assert.deepEqual(plain(J.pickSubtitle(streams, { language: 'eng' })), { index: 4, burn: false });
    assert.deepEqual(plain(J.pickSubtitle(streams.filter(s => s.Index !== 4), { language: 'eng' })), { index: 2, burn: false });
    assert.deepEqual(plain(J.pickSubtitle([audio(1, 'eng'), sub(3, 'spa', { IsDefault: true })], { language: 'eng' })), { index: 3, burn: false });
    assert.equal(J.pickSubtitle([audio(1, 'eng'), sub(3, 'spa')], { language: 'eng' }), null);
});

test('subtitles: SDH comes last, and text beats image within a step', () => {
    const streams = [audio(1, 'eng'), sub(2, 'eng', { IsHearingImpaired: true }), image(3, 'eng'), sub(4, 'eng')];
    assert.equal(J.pickSubtitle(streams, {}).index, 4);
    assert.equal(J.pickSubtitle([audio(1, 'eng'), sub(2, 'eng', { IsHearingImpaired: true }), image(3, 'eng')], {}).index, 2);
});

test('subtitles: en, eng and "English" in the title all match', () => {
    assert.equal(J.pickSubtitle([audio(1, 'eng'), sub(2, 'en')], {}).index, 2);
    assert.equal(J.pickSubtitle([audio(1, 'eng'), sub(2, null, { DisplayTitle: 'English (Signs)' })], {}).index, 2);
    assert.equal(J.pickSubtitle([audio(1, 'fre'), sub(2, 'fra')], { language: 'fre' }).index, 2);
});

test('subtitles: forced only shows forced tracks, unless the audio is foreign', () => {
    const streams = [audio(1, 'eng'), sub(2, 'eng'), sub(3, 'eng', { IsForced: true })];
    assert.equal(J.pickSubtitle(streams, { mode: 'forced' }).index, 3);
    assert.equal(J.pickSubtitle([audio(1, 'eng'), sub(2, 'eng')], { mode: 'forced' }), null);
    assert.equal(J.pickSubtitle([audio(1, 'spa'), sub(2, 'eng')], { mode: 'forced' }).index, 2, 'Spanish audio: forced acts as always');
    assert.equal(J.pickSubtitle(streams, { mode: 'off' }), null);
});

test('subtitles: image tracks are burned in, or skipped when burning in is off', () => {
    const streams = [audio(1, 'eng'), image(2, 'eng')];
    assert.deepEqual(plain(J.pickSubtitle(streams, {})), { index: 2, burn: true });
    assert.equal(J.pickSubtitle(streams, { burnInImage: false }), null);
});

test('cue text loses its markup', () => {
    assert.equal(J.cueText('<i>Hello</i> {\\an8}there\\Nfriend'), 'Hello there\nfriend');
});

test('shuffle bag: everything once per round, no repeat across the seam, carried in state', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    let state = null, random = (seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647)(7);
    const seen = [];
    for (let i = 0; i < 50; i++) {
        const step = J.next(state, ids, { random });
        seen.push(step.id);
        state = plain(step.state);   // as if stored and read back
    }
    for (let round = 0; round < 10; round++) assert.deepEqual([...seen.slice(round * 5, round * 5 + 5)].sort(), ids, `round ${round}`);
    for (let i = 1; i < seen.length; i++) assert.notEqual(seen[i], seen[i - 1], `repeat at ${i}`);
    assert.ok(seen.slice(0, 5).join() !== seen.slice(5, 10).join() || seen.slice(5, 10).join() !== seen.slice(10, 15).join(), 'reshuffled each round');
});

test('shuffle bag: in order is the list order; a changed list starts a new round; p steps back', () => {
    let state = null;
    const order = [];
    for (let i = 0; i < 4; i++) ({ id: order[i], state } = J.next(state, ['x', 'y', 'z'], { shuffle: false }));
    assert.deepEqual(order, ['x', 'y', 'z', 'x']);
    const changed = J.next(state, ['x', 'y', 'z', 'w'], { shuffle: false });
    assert.equal(changed.id, 'x');
    assert.equal(J.previous({ order: ['x', 'y', 'z'], at: 2 }).id, 'y');
    assert.equal(J.previous({ order: ['x', 'y'], at: 0 }).id, 'x');
    assert.equal(J.next(null, []).id, null);
});

test('resolution: by tier, a setting overrides it, and battery caps at 720p (task 9.7)', () => {
    assert.equal(J.maxHeight({ tier: 'low' }), 480);
    assert.equal(J.maxHeight({ tier: 'medium' }), 720);
    assert.equal(J.maxHeight({ tier: 'high' }), 1080);
    assert.equal(J.maxHeight({ tier: 'low', setting: '1080' }), 1080);
    assert.equal(J.maxHeight({ tier: 'high', reasons: ['on battery'] }), 720);
    assert.equal(J.maxHeight({ tier: 'high', setting: '2160', reasons: ['battery low'] }), 720);
});

test('poster mode: battery saver or a low battery; on Android, any battery; or forced', () => {
    assert.equal(J.posterWanted({ reasons: [] }), false);
    assert.equal(J.posterWanted({ reasons: ['battery saver'] }), true);
    assert.equal(J.posterWanted({ reasons: ['battery low'] }), true);
    assert.equal(J.posterWanted({ reasons: ['on battery'] }), false);
    assert.equal(J.posterWanted({ reasons: ['on battery'], android: true }), true);
    assert.equal(J.posterWanted({ setting: 'always' }), true);
    assert.equal(J.posterWanted({ setting: 'never', reasons: ['battery saver'] }), false);
});

test('segments: auto is whole on a computer, clips on a phone', () => {
    assert.equal(J.segmentFor('auto', false), 'whole');
    assert.equal(J.segmentFor('auto', true), 'clips');
    assert.equal(J.segmentFor('surf', true), 'surf');
});

test('resume: where it was left, except under 2 minutes or nearly finished', () => {
    assert.deepEqual(plain(J.span({ duration: 7200, segment: 'whole', saved: 1800 })), { start: 1800, end: null });
    assert.deepEqual(plain(J.span({ duration: 100, segment: 'whole', saved: 50 })), { start: 0, end: null });
    assert.deepEqual(plain(J.span({ duration: 7200, segment: 'whole', saved: 7000 })), { start: 0, end: null });
});

test('clips skip the first and last 5%, and fit inside', () => {
    for (const r of [0, 0.5, 0.999]) {
        const { start, end } = J.span({ duration: 6000, segment: 'clips', minutes: 10, random: () => r });
        assert.ok(start >= 300 && end <= 5700 && Math.abs(end - start - 600) < 1e-6, `${start}–${end}`);
    }
    const short = J.span({ duration: 100, segment: 'clips', minutes: 3, random: () => 0.5 });
    assert.deepEqual(plain(short), { start: 5, end: 95 });
    const surf = J.span({ duration: 6000, segment: 'surf', random: () => 0.5 });
    assert.ok(surf.end - surf.start >= 20 && surf.end - surf.start <= 40);
});

test('saved positions keep the newest 200', () => {
    let positions = {};
    for (let i = 0; i < 250; i++) positions = J.remember(positions, `item${i}`, i);
    assert.equal(Object.keys(positions).length, 200);
    assert.ok(!('item0' in positions) && positions.item249 === 249);
    assert.equal(Object.keys(J.remember({ a: 1, b: 2 }, 'a', 5)).join(), 'b,a', 'an update moves to the end');
});

test('device profile: only what the browser plays goes direct; taller than the cap transcodes; image subtitles burn', () => {
    const plays = new Set(['video/mp4; codecs="avc1.640028"', 'video/mp4; codecs="mp4a.40.2"', 'video/webm; codecs="vp09.00.40.08"', 'video/webm; codecs="opus"', 'application/vnd.apple.mpegurl']);
    const profile = J.deviceProfile({ canPlay: mime => plays.has(mime), height: 720 });
    assert.deepEqual(plain(profile.DirectPlayProfiles), [
        { Container: 'mp4,m4v', Type: 'Video', VideoCodec: 'h264', AudioCodec: 'aac' },
        { Container: 'webm', Type: 'Video', VideoCodec: 'vp9', AudioCodec: 'opus' },
    ]);
    assert.equal(profile.TranscodingProfiles[0].Protocol, 'hls');
    assert.deepEqual(plain(profile.CodecProfiles[0].Conditions.map(c => [c.Property, c.Value])), [['Height', '720'], ['Width', '1280']], 'width is what the server scales by');
    assert.equal(profile.MaxStreamingBitrate, 8e6);
    assert.equal(J.deviceProfile({ canPlay: () => false, height: 480 }).CodecProfiles[0].Conditions[1].Value, '854');
    assert.ok(!profile.SubtitleProfiles.some(p => /pgs|dvd|vobsub/i.test(p.Format)));
    const noHls = J.deviceProfile({ canPlay: mime => plays.has(mime) && !mime.includes('mpegurl'), height: 480 });
    assert.equal(noHls.TranscodingProfiles[0].Protocol, 'http');
});

test('stream path: direct with the token as api_key, else the server\'s transcode', () => {
    const item = { Id: 'item1' };
    assert.equal(J.streamPath(item, { Id: 'src1', SupportsDirectPlay: true }, { token: 'tok', session: 's1' }),
        '/Videos/item1/stream?static=true&MediaSourceId=src1&PlaySessionId=s1&api_key=tok');
    assert.equal(J.streamPath(item, { Id: 'src1', SupportsDirectPlay: true, TranscodingUrl: '/videos/item1/master.m3u8?x' }, { token: 'tok', burn: true }), '/videos/item1/master.m3u8?x');
    assert.equal(J.streamPath(item, { Id: 'src1', SupportsDirectPlay: false }, { token: 'tok' }), null);
});

test('titles and backoff', () => {
    assert.equal(J.titleOf({ Name: 'Test Pattern', ProductionYear: 2026 }), 'Test Pattern (2026)');
    assert.equal(J.titleOf({ Name: 'Game of Life (2026)', ProductionYear: 2026 }), 'Game of Life (2026)', 'a name that already has its year');
    assert.equal(J.titleOf({ Name: 'Pilot', SeriesName: 'Fixture Show', Type: 'Episode' }), 'Fixture Show: Pilot');
    assert.deepEqual([1, 2, 3, 10].map(J.backoff), [5000, 10000, 20000, 300000]);
});
