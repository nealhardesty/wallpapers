#!/usr/bin/env node
// A throwaway Jellyfin in Docker, on the made-up media from
// tools/jellyfin-media.mjs, for building and trying the Jellyfin wallpaper
// (SPEC §10.21, task 9.1). Nothing real: its own user, its own folder.
//
//   node tools/jellyfin-dev.mjs up      start it at http://localhost:8096 and set it up
//   node tools/jellyfin-dev.mjs down    stop and remove the container (.jellyfin/ stays)
//
// The first start runs the setup wizard over the API: a user, Movies and
// Shows libraries with internet metadata off (the titles are made up, and
// shouldn't be looked up), a "Wallpaper Mix" playlist, and one favourite.
// It listens on localhost only; JELLYFIN_HOST=0.0.0.0 puts it on your
// network, for a phone (README, "Trying it on a phone").

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const DIR = join(ROOT, '.jellyfin');
const NAME = 'wallpapers-jellyfin';
const PORT = process.env.JELLYFIN_PORT || '8096';
const BIND = process.env.JELLYFIN_HOST || '127.0.0.1';
const SERVER = `http://localhost:${PORT}`;
// The dev server's own account. It only exists inside .jellyfin/.
export const DEV_USER = { name: 'wallpapers', password: 'wallpapers' };
const AUTH = 'MediaBrowser Client="Wallpapers dev", Device="make jellyfin-dev", DeviceId="jellyfin-dev", Version="1"';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8' }).trim();

async function api(path, { method = 'GET', body, token } = {}) {
    const response = await fetch(`${SERVER}${path}`, {
        method,
        headers: { Authorization: token ? `${AUTH}, Token="${token}"` : AUTH, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
    return response.headers.get('content-type')?.includes('json') ? response.json() : null;
}

async function up() {
    if (!existsSync(join(DIR, 'media'))) throw new Error('no .jellyfin/media/: run `make jellyfin-media` first');
    for (const dir of ['config', 'cache']) mkdirSync(join(DIR, dir), { recursive: true });
    const running = docker('ps', '-a', '--filter', `name=^${NAME}$`, '--format', '{{.State}}');
    if (running === 'exited' || running === 'created') docker('start', NAME);
    else if (!running) {
        docker('run', '-d', '--name', NAME, '-p', `${BIND}:${PORT}:8096`,
            '-v', `${join(DIR, 'config')}:/config`, '-v', `${join(DIR, 'cache')}:/cache`, '-v', `${join(DIR, 'media')}:/media:ro`,
            'jellyfin/jellyfin:latest');
    }
    let info = null;
    // A first start runs migrations for a while, answering with a holding page.
    const healthy = () => fetch(`${SERVER}/health`).then(r => r.text(), () => '').then(text => text === 'Healthy');
    for (let i = 0; i < 180 && !info; i++) {
        info = await healthy() && await api('/System/Info/Public').catch(() => null);
        if (!info) await sleep(1000);
    }
    if (!info) throw new Error(`no answer from ${SERVER}; try docker logs ${NAME}`);
    if (!info.StartupWizardCompleted) await setUp();
    const { AccessToken: token, User: user } = await api('/Users/AuthenticateByName', { method: 'POST', body: { Username: DEV_USER.name, Pw: DEV_USER.password } });   // audit-allow: Jellyfin API path
    const items = await api(`/Items?userId=${user.Id}&Recursive=true&IncludeItemTypes=Movie,Episode`, { token });
    const playlists = await api(`/Items?userId=${user.Id}&Recursive=true&IncludeItemTypes=Playlist`, { token });
    const quick = await api('/QuickConnect/Enabled');
    await api('/Sessions/Logout', { method: 'POST', token });
    console.log(`jellyfin ✓ ${info.ProductName} ${info.Version} at ${SERVER}`);
    console.log(`  sign in as ${DEV_USER.name} / ${DEV_USER.password}, or with Quick Connect (${quick ? 'on' : 'off'}) from ${SERVER}/web/`);
    console.log(`  ${items.TotalRecordCount} videos, playlists: ${playlists.Items.map(p => p.Name).join(', ') || 'none'}`);
}

// The startup wizard, then the libraries, a playlist and a favourite.
async function setUp() {
    console.log('jellyfin: first start, setting it up…');
    await api('/Startup/Configuration', { method: 'POST', body: { ServerName: 'Wallpapers dev', UICulture: 'en-US', MetadataCountryCode: 'US', PreferredMetadataLanguage: 'en' } });
    await api('/Startup/User');
    await api('/Startup/User', { method: 'POST', body: { Name: DEV_USER.name, Password: DEV_USER.password } });
    await api('/Startup/RemoteAccess', { method: 'POST', body: { EnableRemoteAccess: true, EnableAutomaticPortMapping: false } });
    await api('/Startup/Complete', { method: 'POST' });
    const { AccessToken: token, User: user } = await api('/Users/AuthenticateByName', { method: 'POST', body: { Username: DEV_USER.name, Pw: DEV_USER.password } });   // audit-allow: Jellyfin API path

    // Local metadata only: nothing goes to the internet about these titles.
    // Pictures come from the videos themselves (a frame grab), so poster mode
    // has something to show.
    const offline = type => ({ Type: type, MetadataFetchers: [], MetadataFetcherOrder: [], ImageFetchers: ['Screen Grabber', 'Embedded Image Extractor'], ImageFetcherOrder: ['Screen Grabber', 'Embedded Image Extractor'] });
    const options = { EnableRealtimeMonitor: false, EnableInternetProviders: false, SaveLocalMetadata: false, DownloadImagesInAdvance: false,
        EnableChapterImageExtraction: false, EnableTrickplayImageExtraction: false, SkipSubtitlesIfEmbeddedSubtitlesPresent: false,
        TypeOptions: ['Movie', 'Series', 'Season', 'Episode'].map(offline) };
    for (const [name, type] of [['Movies', 'movies'], ['Shows', 'tvshows']]) {
        await api(`/Library/VirtualFolders?name=${name}&collectionType=${type}&paths=${encodeURIComponent(`/media/${name}`)}&refreshLibrary=true`,
            { method: 'POST', token, body: { LibraryOptions: options } });
    }
    let items = [];
    for (let i = 0; i < 120 && items.length < 7; i++) {
        await sleep(1000);
        items = (await api(`/Items?userId=${user.Id}&Recursive=true&IncludeItemTypes=Movie,Episode&SortBy=SortName`, { token })).Items;
    }
    if (items.length < 7) throw new Error(`the library scan found ${items.length} of 7 videos`);
    const pick = name => items.find(item => item.Name.startsWith(name)).Id;
    await api('/Playlists', { method: 'POST', token, body: {
        Name: 'Wallpaper Mix', UserId: user.Id, MediaType: 'Video',
        Ids: ['Test Pattern', 'Colour Bars', 'The Mandelbrot Hour', 'Game of Life', 'Fixture Show S01E02'].map(pick),
    } });
    await api(`/UserFavoriteItems/${pick('Colour Bars')}?userId=${user.Id}`, { method: 'POST', token });
    await api('/Sessions/Logout', { method: 'POST', token });
}

function down() {
    try { docker('rm', '-f', NAME); console.log('jellyfin: stopped (.jellyfin/ kept; delete it to start over)'); }
    catch { console.log('jellyfin: not running'); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const command = process.argv[2];
    if (command === 'up') await up();
    else if (command === 'down') down();
    else console.log('usage: node tools/jellyfin-dev.mjs up|down');
}
