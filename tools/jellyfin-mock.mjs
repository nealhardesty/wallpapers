#!/usr/bin/env node
// A fixture Jellyfin (SPEC §10.21, task 9.1): just enough of the API for the
// wallpaper, with made-up titles and one tiny generated clip
// (tools/fixtures/jellyfin/, from `make jellyfin-fixtures`). The smoke run
// answers requests to http://jellyfin.invalid:8096 with it; on its own it
// serves the same thing, for working on the wallpaper without Docker:
//
//   node tools/jellyfin-mock.mjs        http://localhost:8097  (PORT= to change)
//
// Sign in as fixture / fixture-pass, or with Quick Connect: the code is
// approved on the second poll, as if someone tapped Approve on a phone.
// It answers like Jellyfin 12.3 (spike 9.0), CORS and all.

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const FIXTURES = join(resolve(import.meta.dirname), 'fixtures', 'jellyfin');
export const MOCK_ORIGIN = 'http://jellyfin.invalid:8096';
export const MOCK_USER = { name: 'fixture', password: 'fixture-pw', id: 'f1x7u5e0000000000000000000000001' };
export const QUICK_CODE = '424242';
const TICKS = 10_000_000;

const id = n => `f1x7u5e0${String(n).padStart(24, '0')}`;
const stream = (index, type, extra = {}) => ({ Index: index, Type: type, IsExternal: false, IsForced: false, IsDefault: false, IsHearingImpaired: false, IsTextSubtitleStream: false, ...extra });
const text = (index, language, extra = {}) => stream(index, 'Subtitle', { Codec: 'subrip', Language: language, IsTextSubtitleStream: true, DeliveryMethod: 'External',
    DisplayTitle: `${{ eng: 'English', spa: 'Spanish' }[language]}${extra.IsForced ? ' - Forced' : ''}${extra.IsHearingImpaired ? ' - Hearing Impaired' : ''} - SUBRIP`, ...extra });
const video = stream(0, 'Video', { Codec: 'vp9', Width: 160, Height: 90 });

// The library: made-up titles, each with the subtitle case it exercises.
export const ITEMS = [
    { Id: id(11), Name: 'Test Pattern No. 3', Type: 'Movie', ProductionYear: 2026, seconds: 95,
      streams: [video, stream(1, 'Audio', { Codec: 'opus', Language: 'eng' }), text(2, 'eng', { IsHearingImpaired: true, IsExternal: true }), text(3, 'eng', { IsExternal: true }), text(4, 'spa', { IsExternal: true })] },
    { Id: id(12), Name: 'Colour Bars at Dusk', Type: 'Movie', ProductionYear: 2025, seconds: 60,
      streams: [video, stream(1, 'Audio', { Codec: 'opus', Language: 'spa' }), text(2, 'eng', { IsForced: true })] },
    { Id: id(13), Name: 'The Long Test Card', Type: 'Movie', ProductionYear: 2024, seconds: 600,
      streams: [video, stream(1, 'Audio', { Codec: 'opus', Language: 'eng' }), stream(2, 'Subtitle', { Codec: 'PGSSUB', Language: 'eng', DeliveryMethod: 'Encode', DisplayTitle: 'English - PGSSUB' })] },
    { Id: id(14), Name: 'Fixture Show S01E01', Type: 'Episode', SeriesName: 'Fixture Show', seconds: 45, streams: [video] },
];
const PLAYLIST = { Id: id(21), Name: 'Fixture Mix', Type: 'Playlist', MediaType: 'Video' };
const VIEWS = [{ Id: id(31), Name: 'Fixture Films', CollectionType: 'movies', Type: 'CollectionFolder' },
    { Id: id(32), Name: 'Playlists', CollectionType: 'playlists', Type: 'CollectionFolder' }];

const dto = item => ({ Id: item.Id, Name: item.Name, Type: item.Type, ProductionYear: item.ProductionYear, SeriesName: item.SeriesName,
    RunTimeTicks: item.seconds * TICKS, MediaType: 'Video', ImageTags: { Primary: 'fixture' }, BackdropImageTags: ['fixture'],
    UserData: { IsFavorite: item.Id === id(12), Played: false } });

// Made-up cue text, two seconds apart, for the length of the clip.
function vtt(item, index) {
    const language = item.streams.find(s => s.Index === index)?.Language;
    const lines = language === 'spa' ? ['Esto es una prueba.', 'Nada real aquí.'] : ['This is a fixture.', 'Nothing real here.', 'Please stand by.'];
    const at = s => new Date(s * 1000).toISOString().slice(11, 23);
    let body = 'WEBVTT\n\n';
    for (let s = 0, n = 0; s < item.seconds; s += 2, n++) body += `${at(s)} --> ${at(s + 1.8)}\n${lines[n % lines.length]}\n\n`;
    return body;
}

export function createMock() {
    const clip = readFileSync(join(FIXTURES, 'clip.webm'));
    const backdrop = readFileSync(join(FIXTURES, 'backdrop.jpg'));
    const state = { tokens: new Map(), quick: new Map(), log: [], reported: [], polls: 0 };
    let next = 1;

    const json = (body, status = 200) => ({ status, type: 'application/json; charset=utf-8', body: Buffer.from(JSON.stringify(body)) });
    const empty = (status = 204) => ({ status, type: 'text/plain', body: Buffer.alloc(0) });
    const tokenOf = (headers, query) => {
        const header = Object.entries(headers).find(([k]) => k.toLowerCase() === 'authorization')?.[1] || '';
        return header.match(/Token="([^"]+)"/)?.[1] || query.get('api_key') || query.get('ApiKey') || null;
    };
    const signIn = headers => {
        const token = `mocktoken${String(next++).padStart(4, '0')}`;
        const device = (Object.entries(headers).find(([k]) => k.toLowerCase() === 'authorization')?.[1] || '').match(/DeviceId="([^"]+)"/)?.[1];
        // One token per device (spike 9.0): a new sign-in revokes the old.
        for (const [old, holder] of state.tokens) if (holder.device === device) state.tokens.delete(old);
        state.tokens.set(token, { device });
        return json({ AccessToken: token, User: { Id: MOCK_USER.id, Name: MOCK_USER.name }, ServerId: 'fixture-server' });
    };

    // { method, url, headers, body } → { status, type, body: Buffer, headers? }
    function handle({ method, url, headers = {}, body = '' }) {
        const { pathname: path, searchParams: query } = new URL(url, MOCK_ORIGIN);
        state.log.push({ method, path, auth: Object.keys(headers).some(k => k.toLowerCase() === 'authorization'), body: body || '' });
        if (method === 'OPTIONS') return empty();
        const authed = state.tokens.has(tokenOf(headers, query));
        const lower = path.toLowerCase();

        if (path === '/System/Info/Public') return json({ ServerName: 'Fixture Server', Version: '12.3.0', ProductName: 'Jellyfin Server', Id: 'fixture-server', StartupWizardCompleted: true, LocalAddress: MOCK_ORIGIN });
        if (path === '/QuickConnect/Enabled') return json(true);
        if (path === '/QuickConnect/Initiate' && method === 'POST') {
            const secret = `secret${next++}`;
            state.quick.set(secret, 0);
            return json({ Authenticated: false, Secret: secret, Code: QUICK_CODE, DeviceId: 'fixture', DeviceName: 'Wallpapers', AppName: 'Wallpapers', AppVersion: '0', DateAdded: new Date().toISOString() });
        }
        if (path === '/QuickConnect/Connect') {
            const secret = query.get('secret');
            if (!state.quick.has(secret)) return empty(404);
            state.polls++;
            state.quick.set(secret, state.quick.get(secret) + 1);
            return json({ Authenticated: state.quick.get(secret) >= 2, Secret: secret, Code: QUICK_CODE });
        }
        if (path === '/Users/AuthenticateWithQuickConnect' && method === 'POST') {   // audit-allow: Jellyfin API path
            const { Secret } = JSON.parse(body || '{}');
            return (state.quick.get(Secret) ?? 0) >= 2 ? signIn(headers) : empty(401);
        }
        if (path === '/Users/AuthenticateByName' && method === 'POST') { // audit-allow: Jellyfin API path
            const { Username, Pw } = JSON.parse(body || '{}');
            return Username === MOCK_USER.name && Pw === MOCK_USER.password ? signIn(headers) : empty(401);
        }

        // Media and subtitles: tokens ride in the query, or not at all (as on a real server).
        const item = ITEMS.find(i => lower.includes(i.Id));
        if (/^\/videos\/[^/]+\/stream/.test(lower) && item) {
            // Ranges, as a real server does, so the video can seek (resume).
            const range = /bytes=(\d+)-(\d*)/.exec(Object.entries(headers).find(([k]) => k.toLowerCase() === 'range')?.[1] || '');
            if (!range) return { status: 200, type: 'video/webm', body: clip, headers: { 'Accept-Ranges': 'bytes' } };
            const from = Number(range[1]), to = Math.min(clip.length - 1, range[2] ? Number(range[2]) : clip.length - 1);
            return { status: 206, type: 'video/webm', body: clip.subarray(from, to + 1), headers: { 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${from}-${to}/${clip.length}` } };
        }
        if (/\/subtitles\/\d+\/(\d+\/)?stream\.vtt$/.test(lower) && item) return { status: 200, type: 'text/vtt; charset=utf-8', body: Buffer.from(vtt(item, Number(lower.match(/subtitles\/(\d+)/)[1]))) };
        if (/^\/items\/[^/]+\/images\//.test(lower)) return { status: 200, type: 'image/jpeg', body: backdrop };

        if (!authed) return empty(401);
        if (path === '/Users/Me') return json({ Id: MOCK_USER.id, Name: MOCK_USER.name });   // audit-allow: Jellyfin API path
        if (path === '/Sessions/Logout' && method === 'POST') { state.tokens.delete(tokenOf(headers, query)); return empty(); }
        if (path.startsWith('/Sessions/Playing')) { state.reported.push(path); return empty(); }
        if (path === '/UserViews') return json({ Items: VIEWS, TotalRecordCount: VIEWS.length });
        if (path === `/Playlists/${PLAYLIST.Id}/Items`) return json({ Items: ITEMS.map(dto), TotalRecordCount: ITEMS.length });
        if (path === '/Items') {
            const types = query.get('IncludeItemTypes') || '';
            if (types === 'Playlist') return json({ Items: [PLAYLIST], TotalRecordCount: 1 });
            let found = ITEMS;
            if (query.get('Filters')?.includes('IsFavorite')) found = found.filter(i => i.Id === id(12));
            if (query.get('ParentId') === VIEWS[0].Id) found = found.filter(i => i.Type === 'Movie');
            return json({ Items: found.map(dto), TotalRecordCount: found.length });
        }
        if (/^\/Items\/[^/]+\/PlaybackInfo$/.test(path) && item) {
            const request = JSON.parse(body || '{}');
            const burn = item.streams.find(s => s.Index === request.SubtitleStreamIndex)?.DeliveryMethod === 'Encode';
            const cap = request.DeviceProfile?.CodecProfiles?.flatMap(p => p.Conditions || []).find(c => c.Property === 'Height')?.Value;
            const source = { Id: item.Id, Container: 'webm', Protocol: 'File', RunTimeTicks: item.seconds * TICKS, SupportsDirectPlay: !burn, SupportsDirectStream: !burn,
                SupportsTranscoding: true, MediaStreams: item.streams, DefaultAudioStreamIndex: 1,
                ...(burn ? { TranscodingUrl: `/videos/${item.Id}/stream.webm?MediaSourceId=${item.Id}&SubtitleStreamIndex=${request.SubtitleStreamIndex}&SubtitleMethod=Encode&MaxHeight=${cap || ''}&ApiKey=${tokenOf(headers, query)}`,
                    TranscodingSubProtocol: 'http', TranscodingContainer: 'webm' } : {}) };
            return json({ MediaSources: [source], PlaySessionId: `play${next++}` });
        }
        return empty(404);
    }
    return { handle, state, approve: secret => state.quick.set(secret, 2) };
}

// On its own: a real server, for working on the wallpaper by hand.
if (import.meta.url === `file://${process.argv[1]}`) {
    const mock = createMock();
    const port = Number(process.env.PORT || 8097);
    createServer((request, response) => {
        const chunks = [];
        request.on('data', chunk => chunks.push(chunk));
        request.on('end', () => {
            const answer = mock.handle({ method: request.method, url: request.url, headers: request.headers, body: Buffer.concat(chunks).toString() });
            response.writeHead(answer.status, { ...answer.headers, 'Content-Type': answer.type, 'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'GET, POST, DELETE' });
            response.end(answer.body);
        });
    }).listen(port, '127.0.0.1', () => console.log(`jellyfin-mock: http://localhost:${port} (sign in as ${MOCK_USER.name} / ${MOCK_USER.password}, or Quick Connect ${QUICK_CODE})`));
}
