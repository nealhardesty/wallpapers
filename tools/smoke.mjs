#!/usr/bin/env node
// Smoke test, in headless Chrome over the DevTools protocol (Node's built-in
// WebSocket, no deps), against the real pages on file://.
//
//   node tools/smoke.mjs                 everything
//   node tools/smoke.mjs fishtank quest  just these stages (skips the player suite)
//
// Stage suite, every wallpaper on stage.html?w=<id> with fresh storage: it
// boots, draws, logs no errors, makes no unexpected network request, saves
// nothing on a fresh run (defaults.js is exact) and writes no storage
// outside its own namespace.
//
// Player suite, index.html: Seasonal on first run, ?w= without persisting,
// keys switch and persist, a full cycle leaks nothing, ?tier=low really
// scales and caps, pause really stops frames, and the panel: it opens and
// closes, every wallpaper's settings render and round-trip into the running
// wallpaper, Reset, key help, declared wallpaper keys, and the corner gear.
//
// Extension suite, the built dist/extension/ (`make extension`) loaded
// unpacked: it takes over the new tab, runs under the extension's CSP, and
// Bing works straight from bing.com through host_permissions alone.
//
// All network is intercepted: local files load, Bing gets fixtures, anything
// else fails the run. Screenshots land in dist/smoke/. CHROME_PATH picks the
// browser.
//
// SMOKE_URL=https://… runs the stage and player suites against a deployed
// copy instead (make smoke-live: GitHub Pages after each deploy), with real
// network: the site's own files and Bing pass, anything else still fails.

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch, sleep } from './chrome.mjs';
import { createMock, MOCK_ORIGIN, MOCK_USER, QUICK_CODE } from './jellyfin-mock.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const LIVE = process.env.SMOKE_URL?.replace(/\/$/, '') || null;
const WEB = LIVE || pathToFileURL(join(ROOT, 'web')).href;
// The Bing photo the stage should end up showing.
const BING_PHOTO = LIVE ? 'bing.com/th' : 'smoke-fixture';
const SHOTS = join(ROOT, 'dist/smoke');
const EXTENSION = join(ROOT, 'dist/extension');
const RUN_MS = 2500;
const READY_MS = 10000;

// A 1x1 PNG standing in for Bing's photo.
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const BING_JSON = { images: [{ url: '/th?id=smoke-fixture.jpg', copyright: 'Smoke fixture (Test)', copyrightlink: 'https://www.bing.com/', startdate: '20261022' }] };
// Satellites: made-up but valid elements in CelesTrak's JSON shape, from two
// hours ago (so never stale), and a fictional place for the geocoder.
const SATELLITE_JSON = () => {
    const epoch = new Date(Date.now() - 2 * 3600000).toISOString().replace('Z', '');
    const orbit = (name, id, n, e, i, node, argp, m) => ({ OBJECT_NAME: name, OBJECT_ID: 'FIXTURE', NORAD_CAT_ID: id, EPOCH: epoch, MEAN_MOTION: n,
        ECCENTRICITY: e, INCLINATION: i, RA_OF_ASC_NODE: node, ARG_OF_PERICENTER: argp, MEAN_ANOMALY: m, BSTAR: 0.0001, MEAN_MOTION_DOT: 0.00001, MEAN_MOTION_DDOT: 0 });
    return [orbit('FIXTURE STATION', 99001, 15.5, 0.0004, 51.6, 10, 80, 0),
        ...Array.from({ length: 11 }, (_, k) => orbit(`FIXTURE SAT ${k + 1}`, 99002 + k, 14 + k / 10, 0.001 * (k + 1), 50 + k * 4, k * 33, k * 20, k * 31))];
};
const GEOCODE_JSON = { results: [{ name: 'Testville', latitude: 12.34, longitude: -56.78, admin1: 'Fixture County', country: 'Exampleland' }] };

// Lighthouse's marine forecast, made up: two days of hours around now, in
// Open-Meteo's shape. `calm` is a glassy sea, `swell` a big one.
function marineJson(sea) {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const hours = Array.from({ length: 48 }, (_, i) => new Date(start.getTime() + i * 3600000).toISOString().slice(0, 16));
    const [height, period] = sea === 'swell' ? [7.5, 14] : [0.3, 6];
    return { latitude: 0, longitude: 0, timezone: 'GMT', hourly_units: { wave_height: 'm', wave_period: 's', wave_direction: '°' },
        hourly: { time: hours, wave_height: hours.map(() => height), wave_period: hours.map(() => period), wave_direction: hours.map(() => 290) } };
}

// Wiki Pond's recent-changes stream, made up: invented titles and users,
// never a recording of the live stream. Some events are for other wikis, a
// bot, a canary, a new page and a new account, so the filters get a workout.
function wikiStream() {
    const words = ['Velvet', 'Harbour', 'Lantern', 'Orchard', 'Quartz', 'Meadow', 'Cobalt', 'Thistle', 'Ember', 'Willow'];
    const events = [];
    for (let i = 0; i < 40; i++) {
        const type = i % 13 === 5 ? 'new' : i % 17 === 9 ? 'log' : 'edit';
        const before = 1000 + i * 37, change = (i % 3 === 0 ? -1 : 1) * Math.round(Math.exp((i % 9) + 1));
        events.push({
            $schema: '/mediawiki/recentchange/1.0.0', meta: { domain: i === 7 ? 'canary' : 'fixture.example', id: `fixture-${i}` },
            type, ...(type === 'log' ? { log_type: 'newusers' } : {}), namespace: 0,
            title: `Fixture ${words[i % words.length]} ${words[(i * 3) % words.length]}`,
            user: i % 5 === 0 ? `FixtureBot${i}` : i % 4 === 0 ? `~fixture-${i}` : `Fixture User ${i}`,
            bot: i % 5 === 0, wiki: i % 6 === 3 ? 'xxwiki' : 'enwiki',
            length: { old: type === 'new' ? null : before, new: before + change },
        });
    }
    return events.map((event, i) => `event: message\nid: fixture-${i}\ndata: ${JSON.stringify(event)}\n\n`).join('');
}

// ---- Page plumbing ----------------------------------------------------------

let cdp;
// Problems for the test in progress, whether it may use Bing's fixtures, and
// whether they come with CORS headers (the extension mustn't need them).
// `offline` fails the wallpapers' own hosts quietly (an offline device);
// `marine` picks Lighthouse's fixture; `hold` keeps Wiki Pond's stream open;
// `jellyfin` is a fixture server (tools/jellyfin-mock.mjs) at jellyfin.invalid.
let current = { network: false, cors: true, problems: [], requests: [] };
// Every wallpaper's declared hosts, from the catalog once it's loaded.
let NETWORK_HOSTS = ['www.bing.com'];
const declared = url => NETWORK_HOSTS.some(host => url.startsWith(`https://${host}/`));
const record = text => current.problems.push(text.split('\n')[0].slice(0, 160));
// Default execution context of each frame, so the player suite can reach into
// the stage iframe, which file:// makes cross-origin to the page.
const contexts = new Map();

function listen() {
    cdp.on('Runtime.exceptionThrown', ({ exceptionDetails: d }) => record(`exception: ${d.exception?.description || d.text}`));
    cdp.on('Runtime.consoleAPICalled', ({ type, args }) => type === 'error' && record(`console.error: ${args.map(a => a.value ?? a.description).join(' ')}`));
    // An offline device's failed requests are expected, not errors.
    cdp.on('Log.entryAdded', ({ entry: e }) => e.level === 'error' && !(current.offline && (e.source === 'network' || declared(e.url || ''))) && record(`log: ${e.text} ${e.url || ''}`));
    cdp.on('Runtime.executionContextCreated', ({ context }) => {
        if (context.auxData?.isDefault) contexts.set(context.auxData.frameId, context.id);
    });
    cdp.on('Fetch.requestPaused', ({ requestId, request }) => {
        // A request can be gone before it's answered (the page moved on); that's fine.
        const reply = (method, params) => cdp.send(method, params).catch(() => {});
        const url = request.url;
        current.requests?.push(url);
        if (/^(file|data|blob|chrome-extension):/.test(url) || url === 'about:blank') return reply('Fetch.continueRequest', { requestId });
        if (LIVE && (url.startsWith(`${LIVE}/`) || declared(url))) return reply('Fetch.continueRequest', { requestId });
        if (current.offline && declared(url)) return reply('Fetch.failRequest', { requestId, errorReason: 'InternetDisconnected' });
        // The browser asks the host's root for a favicon on its own.
        if (LIVE && new URL(url).pathname === '/favicon.ico') return reply('Fetch.fulfillRequest', { requestId, responseCode: 204 });
        const fulfil = (body, type) => reply('Fetch.fulfillRequest', {
            requestId, responseCode: 200, body: body.toString('base64'),
            responseHeaders: [{ name: 'Content-Type', value: type },
                ...(current.cors ? [{ name: 'Access-Control-Allow-Origin', value: '*' }] : [])],
        });
        if (current.network && url.startsWith('https://www.bing.com/HPImageArchive')) return fulfil(Buffer.from(JSON.stringify(BING_JSON)), 'application/json');
        if (current.network && url.startsWith('https://www.bing.com/th')) return fulfil(PIXEL, 'image/png');
        if (current.network && url.startsWith('https://marine-api.open-meteo.com/v1/marine?')) return fulfil(Buffer.from(JSON.stringify(marineJson(current.marine))), 'application/json');
        // `hold` leaves the stream hanging open, as a quiet live one would be.
        if (current.network && current.hold && url === 'https://stream.wikimedia.org/v2/stream/recentchange') return;
        if (current.network && url === 'https://stream.wikimedia.org/v2/stream/recentchange') return fulfil(Buffer.from(wikiStream()), 'text/event-stream; charset=utf-8');
        // The fixture's photo can arrive after its test has ended; only the
        // fixture names it, so it's never a wallpaper going online.
        if (url.startsWith('https://www.bing.com/th?id=smoke-fixture')) return fulfil(PIXEL, 'image/png');
        if (current.network && url.startsWith('https://celestrak.org/NORAD/elements/gp.php?')) return fulfil(Buffer.from(JSON.stringify(SATELLITE_JSON())), 'application/json');
        if (current.network && url.startsWith('https://geocoding-api.open-meteo.com/v1/search?')) return fulfil(Buffer.from(JSON.stringify(GEOCODE_JSON)), 'application/json');
        if (current.jellyfin && url.startsWith(`${MOCK_ORIGIN}/`)) {
            const answer = current.jellyfin.handle({ method: request.method, url, headers: request.headers, body: request.postData || '' });
            return reply('Fetch.fulfillRequest', {
                requestId, responseCode: answer.status, body: answer.body.toString('base64'),
                responseHeaders: [{ name: 'Content-Type', value: answer.type }, { name: 'Access-Control-Allow-Origin', value: '*' },
                    { name: 'Access-Control-Allow-Headers', value: 'authorization, content-type' }, { name: 'Access-Control-Allow-Methods', value: 'GET, POST, DELETE' }],
            });
        }
        // A deliberately offline check: requests fail, quietly.
        if (current.offline) return reply('Fetch.failRequest', { requestId, errorReason: 'InternetDisconnected' });
        record(`network blocked: ${url}`);
        return reply('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' });
    });
}

async function evaluate(expression, contextId) {
    const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, ...(contextId ? { contextId } : {}) });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
    return result.value;
}

async function stageContext() {
    const { frameTree } = await cdp.send('Page.getFrameTree');
    const frames = (frameTree.childFrames || []).map(child => child.frame);
    // The newest stage is the last iframe in the document.
    for (const frame of frames.reverse()) if (contexts.has(frame.id)) return contexts.get(frame.id);
    return null;
}

const inStage = async expression => evaluate(expression, await stageContext());

async function waitFor(check, ms = READY_MS) {
    const started = Date.now();
    while (Date.now() - started < ms) {
        const value = await check().catch(() => null);
        if (value) return value;
        await sleep(100);
    }
    return null;
}

// Navigate with empty storage: clear it from a blank stage first. `stored`
// is any storage to start with instead, as { key: value }.
async function fresh(url, stored = {}) {
    await cdp.send('Page.navigate', { url: `${WEB}/stage.html?w=blank` });
    await waitFor(() => evaluate('WP.stage?.ready'));
    await evaluate(`localStorage.clear(); for (const [k, v] of Object.entries(${JSON.stringify(stored)})) localStorage.setItem(k, JSON.stringify(v))`);
    await cdp.send('Page.navigate', { url });
}

// ---- In-page probes -----------------------------------------------------------

// How much is drawn, across every canvas sampled at 96x96: distinct
// colour-and-alpha buckets, plus partial coverage, since a few white flakes
// on a transparent canvas are drawn even if they're all one colour. Fails
// only a fully clear canvas, or one painted a single flat colour.
const DRAWN = `(() => {
    const size = 96;
    const probe = document.createElement('canvas');
    probe.width = probe.height = size;
    const ctx = probe.getContext('2d', { willReadFrequently: true });
    let best = 0;
    for (const canvas of document.querySelectorAll('canvas')) {
        if (!canvas.width || !canvas.height || !canvas.isConnected) continue;
        ctx.clearRect(0, 0, size, size);
        try { ctx.drawImage(canvas, 0, 0, size, size); } catch { continue; }
        const data = ctx.getImageData(0, 0, size, size).data, colours = new Set();
        let covered = 0;
        for (let i = 0; i < data.length; i += 4) {
            if (!data[i + 3]) continue;
            covered++;
            colours.add((data[i] >> 4) << 12 | (data[i + 1] >> 4) << 8 | (data[i + 2] >> 4) << 4 | data[i + 3] >> 4);
        }
        const partial = covered > 0 && covered < size * size;
        best = Math.max(best, colours.size >= 2 ? colours.size : partial ? 2 : colours.size);
    }
    return best;
})()`;

const PANEL_OPEN = `(() => { const p = document.getElementById('panel'); return !!p && !p.hidden; })()`;

// Defaults are exact if a fresh run's config saves as nothing, and the only
// storage written is the wallpaper's own namespaced state.
const STORAGE = `(() => {
    const id = WP.host.id;
    const diff = WP.diffSettings(WP.settings.defaults(), WP.stage.manager.config || {});
    // The stage's own record of where Auto settled is allowed too.
    const foreign = Object.keys(localStorage).filter(key => !key.startsWith('wp:' + id + ':') && key !== 'wp:perf:' + id);
    return { diff: diff && Object.keys(diff).filter(k => k !== 'configVersion'), foreign };
})()`;

// ---- Suites ---------------------------------------------------------------------

async function stage(id, entry) {
    current = { network: !!entry.network, cors: true, problems: [], requests: [] };
    const started = Date.now();
    await fresh(`${WEB}/stage.html?w=${id}`);
    const state = await waitFor(() => evaluate('WP.stage && (WP.stage.ready || WP.stage.error) && { ready: !!WP.stage.ready, error: WP.stage.error || null }'));
    const readyMs = Date.now() - started;
    if (!state) record(`not ready after ${READY_MS} ms`);
    else if (state.error) record(`boot: ${state.error}`);
    await sleep(RUN_MS);

    const ready = state?.ready;
    const photo = entry.network && !entry.offline;
    const drawn = photo
        ? (await evaluate(`getComputedStyle(document.body).backgroundImage.includes("${BING_PHOTO}") ? 99 : 0`))
        : await evaluate(DRAWN);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(SHOTS, `${id}.png`), Buffer.from(data, 'base64'));
    const storage = ready ? await evaluate(STORAGE) : null;

    if (drawn < 2 && id !== 'blank') record(photo ? 'background photo not shown' : 'nothing drawn');
    if (storage?.diff?.length) record(`fresh run would save: ${storage.diff.join(', ')} (defaults.js out of step)`);
    if (storage?.foreign?.length) record(`wrote storage outside its namespace: ${storage.foreign.join(', ')}`);
    return { readyMs, drawn, problems: current.problems };
}

// Murmuration's and Lanterns': a plain mouse event.
const mouse = (type, x, y) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...(type === 'mouseMoved' ? { button: 'none' } : {}) });

// Girih's and Stained Glass's: a stage URL booted with these keys stored first.
async function stageAt(url, settings) {
    await fresh(`${WEB}/stage.html?w=blank`);
    await waitFor(() => evaluate('WP.stage?.ready'));
    for (const [key, value] of Object.entries(settings)) await evaluate(`localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(JSON.stringify(value))})`);
    await cdp.send('Page.navigate', { url });
    await waitFor(() => evaluate('WP.stage?.ready'));
}
const counts = expression => evaluate(`(m => (${expression}))(WP.stage.manager)`);

// Rainy Window's and Fireworks' helpers: a stage URL booted with storage; a quick drag.
const bootWith = async (url, storage = {}) => {
    await cdp.send('Page.navigate', { url: `${WEB}/stage.html?w=blank` });
    await waitFor(() => evaluate('WP.stage?.ready'));
    await evaluate(`localStorage.clear(); for (const [k, v] of Object.entries(${JSON.stringify(storage)})) localStorage.setItem(k, JSON.stringify(v))`);
    await cdp.send('Page.navigate', { url });
    if (!await waitFor(() => evaluate('WP.stage?.ready'))) throw new Error(`${url} never got ready`);
};
const dragLine = async points => {
    const [first, ...rest] = points;
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: first[0], y: first[1], button: 'left', buttons: 1, clickCount: 1 });
    for (const [x, y] of rest) await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 });
    const last = rest.at(-1) || first;
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: last[0], y: last[1], button: 'left', buttons: 0, clickCount: 1 });
};
const framesIn = async ms => {
    const before = await evaluate('WP.host.frames.count');
    await sleep(ms);
    return await evaluate('WP.host.frames.count') - before;
};

// A drag with the mouse, as a finger would: press, move along points, lift.
async function drag(points, stepMs = 16) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: points[0][0], y: points[0][1], button: 'left', clickCount: 1 });
    for (const [x, y] of points) {
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 });
        await sleep(stepMs);
    }
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: points.at(-1)[0], y: points.at(-1)[1], button: 'left', clickCount: 1 });
}

// Boot a stage with fresh storage, at a viewport if given, and wait for it.
async function bootStage(query, viewport = null) {
    if (viewport) await cdp.send('Emulation.setDeviceMetricsOverride', { mobile: viewport.width < 600, ...viewport });
    else await cdp.send('Emulation.clearDeviceMetricsOverride');
    await fresh(`${WEB}/stage.html?${query}`);
    return waitFor(() => evaluate('WP.stage?.ready'));
}

// Frames per second the stage really ran, over `ms`.
async function stageFps(ms = 3000) {
    const before = await evaluate('WP.host.frames.count');
    await sleep(ms);
    return (await evaluate('WP.host.frames.count') - before) / (ms / 1000);
}

// ---- Wallpapers' own checks (their SPEC §9 "→" checks) ------------------------

// Jellyfin's: a fresh fixture server for this check, storage already signed
// in to it, and a panel button pressed.
const jellyfinServer = () => (current.jellyfin = createMock());
function jellyfinSignedIn(mock, settings = {}) {
    const answer = mock.handle({ method: 'POST', url: `${MOCK_ORIGIN}/Users/AuthenticateByName`, body: JSON.stringify({ Username: MOCK_USER.name, Pw: MOCK_USER.password }),   // audit-allow: Jellyfin API path
        headers: { Authorization: 'MediaBrowser Client="smoke", Device="smoke", DeviceId="smoke-setup", Version="1"' } });
    const { AccessToken, User } = JSON.parse(answer.body);
    mock.state.log.length = 0;
    return { 'wp:jellyfin': { configVersion: 1, server: MOCK_ORIGIN, ...settings }, 'wp:jellyfin:auth': { server: MOCK_ORIGIN, token: AccessToken, userId: User.Id, user: User.Name } };
}
const panelAction = name => evaluate(`(b => b ? (b.click(), true) : false)(document.querySelector('#panel .setting-action[data-name="${name}"]:not([hidden]) button'))`);

// A stage with these settings stored, booted; true once it's ready.
async function stageWith(id, settings, query = '') {
    await fresh(`${WEB}/stage.html?w=blank`);
    await waitFor(() => evaluate('WP.stage?.ready'));
    if (settings) await evaluate(`localStorage.setItem('wp:${id}', ${JSON.stringify(JSON.stringify(settings))})`);
    await cdp.send('Page.navigate', { url: `${WEB}/stage.html?w=${id}${query}` });
    return waitFor(() => evaluate('WP.stage?.ready'));
}

// The average colour of the screen, as a 0-255 triple: tells palettes apart.
const AVERAGE = `(() => {
    const probe = document.createElement('canvas');
    probe.width = probe.height = 16;
    const g = probe.getContext('2d', { willReadFrequently: true });
    g.drawImage(document.querySelector('canvas'), 0, 0, 16, 16);
    const d = g.getImageData(0, 0, 16, 16).data, sum = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) sum[c] += d[i + c];
    return sum.map(v => Math.round(v / 256));
})()`;

const STAGE_CHECKS = {
    // Murmuration (task 8.8): the pointer is the falcon. Sweep it through
    // the middle of the flock: the flock splits into separate clouds and a
    // wave of alarm runs through it.
    murmuration: [['a pointer falcon splits the flock', async () => {
        await cdp.send('Page.navigate', { url: `${WEB}/stage.html?w=murmuration&seed=7` });
        await waitFor(() => evaluate('WP.stage?.ready === true'));
        await sleep(1500);
        const stats = 'WP.stage.manager.evening.flock.stats(null, WP.stage.manager.evening.unit * 2.5)';
        const before = await evaluate(stats);
        let largest = 1, clouds = 0, alarmed = 0;
        // Across and back, through the middle of the flock.
        for (let i = 0; i < 96; i++) {
            const t = i <= 40 ? i / 40 : i <= 80 ? 1 - (i - 40) / 40 : 0;
            // Aimed at where the flock is now: it doesn't wait.
            const c = i <= 80 ? await evaluate('WP.stage.manager.evening.flock.stats()') : null;
            if (c) await mouse('mouseMoved', c.x - 320 + 640 * t, c.y - 120 + 240 * t + (i > 40 ? 30 : 0));
            await sleep(30);
            if (i % 4) continue;
            const now = await evaluate(stats);
            largest = Math.min(largest, now.largest);
            clouds = Math.max(clouds, now.clouds);
            alarmed = Math.max(alarmed, now.alarmed);
        }
        if (before.clouds !== 1 || before.largest < 0.9) record(`flock already apart before the falcon: ${before.clouds} clouds, largest ${before.largest.toFixed(2)}`);
        if (clouds < 2 || largest > 0.9) record(`the falcon didn't split the flock: ${clouds} clouds, largest ${largest.toFixed(2)}`);
        if (alarmed < 200) record(`only ${alarmed} birds alarmed`);
        console.log(`    falcon: ${before.clouds} cloud → ${clouds}, largest ${before.largest.toFixed(2)} → ${largest.toFixed(2)}, ${alarmed} of ${before.flying} birds alarmed`);
        return true;
    }]],

    // Lantern Festival (task 8.9): the first frame already has lanterns in
    // the sky; a tap releases one from the shore under the pointer; and
    // however many taps come, the pool never grows past its cap.
    lanterns: [['a full sky at once; a tap releases one under it; the pool keeps its cap', async () => {
        await cdp.send('Page.navigate', { url: `${WEB}/stage.html?w=lanterns&seed=7` });
        await waitFor(() => evaluate('WP.stage?.ready === true'));
        const first = await evaluate(`(m => ({ frames: WP.host.frames.count, sky: m.pool.filter(l => l.alive && l.age > 0 && m.place(l).y < m.horizon).length }))(WP.stage.manager)`);
        // Seeded before the first frame: automatic releases take seconds.
        if (first.frames > 5 || first.sky < 15) record(`first frame (${first.frames}): only ${first.sky} lanterns in the sky`);
        const shore = await evaluate('WP.stage.manager.shore');
        const ages = await evaluate('WP.stage.manager.pool.map(l => l.alive ? l.age : -1)');
        await mouse('mousePressed', 333, shore + 12);
        await mouse('mouseReleased', 333, shore + 12);
        await sleep(300);
        const tapped = await evaluate(`(m => m.pool.filter(l => l.alive && l.age < 0.6).map(l => m.place(l)))(WP.stage.manager)`);
        if (!tapped.some(p => Math.abs(p.x - 333) < 12 && p.water >= shore - 2)) record(`no lantern from the shore under the tap: ${JSON.stringify(tapped.map(p => [Math.round(p.x), Math.round(p.water)]))}, ${ages.length} in the pool`);
        const cap = await evaluate('WP.stage.manager.pool.length');
        let most = 0;
        for (let i = 0; i < 200; i++) {
            const x = 40 + (i * 37) % 1200;
            await mouse('mousePressed', x, shore + 20);
            await mouse('mouseReleased', x, shore + 20);
            if (i % 10 === 0) {
                const { size, alive } = await evaluate('({ size: WP.stage.manager.pool.length, alive: WP.stage.manager.alive() })');
                most = Math.max(most, size);
                if (alive > size) record(`${alive} lanterns alive in a pool of ${size}`);
            }
        }
        if (most !== cap) record(`the pool grew from ${cap} to ${most} under 200 taps`);
        if (await evaluate('WP.stage.manager.alive()') !== cap) record('200 taps didn\'t fill the pool');
        console.log(`    lanterns: ${first.sky} in the sky on frame ${first.frames}; pool ${cap}, at most ${most} after 200 taps`);
        return true;
    }]],
    // 8.2: one full repaint per morph step, none while a pattern holds. On
    // Low there's no sheen, so a hold sends no frames at all.
    girih: [['one repaint per morph step, none while holding', async () => {
        await stageAt(`${WEB}/stage.html?w=girih&tier=low&seed=7`, { 'wp:girih': { configVersion: 1, holdSeconds: 3, morphSeconds: 2 } });
        await sleep(1000);
        const a = await counts('({ ...m.stats, state: m.state.name })');
        await sleep(1000);
        const b = await counts('({ ...m.stats, state: m.state.name })');
        if (b.frames !== a.frames || b.redraws !== 1) record(`holding: ${b.frames - a.frames} frames, ${b.redraws} repaints (want 0 frames, 1 repaint)`);
        await sleep(3400);   // the morph runs from 3 s to 5 s
        const c = await counts('({ ...m.stats, state: m.state.name })');
        const frames = c.frames - b.frames, redraws = c.redraws - b.redraws;
        if (redraws < 10 || Math.abs(frames - redraws) > 2) record(`morph: ${redraws} repaints in ${frames} frames (want one each)`);
        await sleep(1000);
        const d = await counts('m.stats');
        if (c.state !== 'hold' || d.frames !== c.frames) record(`after the morph: ${c.state}, ${d.frames - c.frames} frames while holding`);
        return true;
    }]],

    // 8.3: the glass is built once per resize, however many frames run; and
    // ?date= noon and midnight light the window differently.
    'stained-glass': [['glass built once per resize; noon and midnight light differ', async () => {
        await stageAt(`${WEB}/stage.html?w=stained-glass&date=2026-06-21T15:00`, {});
        await sleep(2500);
        const before = await counts('m.stats');
        if (before.glassBuilds !== 1 || before.frames < 10) record(`glass built ${before.glassBuilds}× in ${before.frames} frames (want once)`);
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 900, height: 700, deviceScaleFactor: 1, mobile: false });
        await sleep(1000);
        const after = await counts('m.stats');
        await cdp.send('Emulation.clearDeviceMetricsOverride');
        if (after.glassBuilds !== 2 || after.frames <= before.frames) record(`after a resize: built ${after.glassBuilds}× (want 2)`);

        // Mean luminance of what's on screen: the base, with the light
        // screened over it as the compositor does.
        const LUMINANCE = `(() => {
            const m = WP.stage.manager, size = 64, probe = document.createElement('canvas');
            probe.width = probe.height = size;
            const g = probe.getContext('2d', { willReadFrequently: true });
            g.drawImage(m.base, 0, 0, size, size);
            g.globalCompositeOperation = 'screen';
            g.globalAlpha = +m.lightCanvas.style.opacity || 1;
            g.drawImage(m.lightCanvas, 0, 0, size, size);
            const d = g.getImageData(0, 0, size, size).data;
            let sum = 0;
            for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
            return { luminance: sum / (size * size), day: m.light.day, hour: WP.host.now().getHours(), shafts: m.shafts?.length || 0 };
        })()`;
        const light = {};
        for (const [name, time] of [['noon', '12:00'], ['midnight', '00:00']]) {
            await stageAt(`${WEB}/stage.html?w=stained-glass&date=2026-06-21T${time}`, {});
            await sleep(1200);
            light[name] = await evaluate(LUMINANCE);
            const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
            writeFileSync(join(SHOTS, `stained-glass-${name}.png`), Buffer.from(data, 'base64'));
        }
        const { noon, midnight } = light;
        if (noon.hour !== 12 || midnight.hour !== 0) record(`clock: noon run at ${noon.hour}h, midnight at ${midnight.hour}h`);
        if (!(noon.day > 0.9 && midnight.day < 0.05)) record(`daylight: noon ${noon.day}, midnight ${midnight.day}`);
        if (!(noon.luminance > midnight.luminance * 1.4 + 6)) record(`noon (${noon.luminance.toFixed(1)}) is not visibly brighter than midnight (${midnight.luminance.toFixed(1)})`);
        console.log(`    stained-glass: glass built ${before.glassBuilds}× in ${before.frames} frames, ${after.glassBuilds}× after a resize; luminance noon ${noon.luminance.toFixed(1)} vs midnight ${midnight.luminance.toFixed(1)}`);
        return true;
    }]],
    // 8.10: the layers are built once per resize; a finger's line fogs over
    // within a minute; lit windows follow the hour.
    'rainy-window': [['layers built once; a finger\'s line fogs over in a minute; lights follow the hour', async () => {
        await bootWith(`${WEB}/stage.html?w=rainy-window`);
        const pane = 'WP.stage.manager';
        await evaluate(`${pane}.patchWindow(${pane}.city.windows[0])`);
        const frames = await evaluate('WP.host.frames.count');
        await sleep(1200);
        const [builds, later, patches] = await evaluate(`[${pane}.builds, WP.host.frames.count, ${pane}.patches]`);
        if (builds !== 1 || later <= frames || !patches) record(`${builds} layer builds over ${later - frames} frames and ${patches} window repaints (want 1, some, some)`);
        const line = Array.from({ length: 25 }, (_, i) => [200 + i * 30, 380 + Math.round(10 * Math.sin(i / 3))]);
        await dragLine(line);
        await sleep(100);
        const along = `(${JSON.stringify(line)}).reduce((a, [x, y]) => a + ${pane}.clearness(x, y), 0) / ${line.length}`;
        const drawnClear = await evaluate(along);
        const fogged = await evaluate(`(${pane}.advanceFog(60), ${along})`);
        if (drawnClear < 0.6) record(`a dragged line only cleared the fog to ${drawnClear.toFixed(2)}`);
        if (fogged > 0.06) record(`a minute later the line is still ${fogged.toFixed(2)} clear`);
        const lit = {};
        for (const hour of ['22', '03']) {
            await bootWith(`${WEB}/stage.html?w=rainy-window&seed=3&date=2026-10-22T${hour}:00`);
            lit[hour] = await evaluate(`${pane}.litCount()`);
        }
        if (!(lit['22'] > lit['03'] * 3)) record(`lit windows at 22:00 ${lit['22']}, at 03:00 ${lit['03']}`);
        return true;
    }]],
    // 8.12: New Year counts down from 23:59:50 and fires the finale at
    // midnight; tap mode is silent until tapped. (Auto's lull is a unit test.)
    fireworks: [['New Year counts down and fires at midnight; tap mode waits for a tap', async () => {
        const show = 'WP.stage.manager';
        await bootWith(`${WEB}/stage.html?w=fireworks&date=2026-12-31T23:59:50`, { 'wp:fireworks': { configVersion: 1, mode: 'newyear' } });
        await sleep(2500);
        const before = await evaluate(`({ count: ${show}.countdown, launched: ${show}.launched, parts: ${show}.parts.length })`);
        if (before.count < 6 || before.count > 9) record(`countdown shows ${before.count} at 23:59:52`);
        if (before.launched || before.parts) record(`${before.launched} shells and ${before.parts} stars before midnight`);
        const finale = await waitFor(() => evaluate(`${show}.launched >= 10 && ${show}.parts.length > 300 && { launched: ${show}.launched, year: ${show}.yearFired }`), 14000);
        if (!finale) record('no finale after midnight');
        else if (finale.year !== 2027) record(`the year in stars was ${finale.year}`);
        await bootWith(`${WEB}/stage.html?w=fireworks`, { 'wp:fireworks': { configVersion: 1, mode: 'tap' } });
        await sleep(2000);
        const frames = await evaluate('WP.host.frames.count');
        await sleep(600);
        const quiet = await evaluate(`({ launched: ${show}.launched, parts: ${show}.parts.length, shells: ${show}.shells.length, frames: WP.host.frames.count })`);
        if (quiet.launched || quiet.parts || quiet.shells) record(`tap mode launched ${quiet.launched} shells by itself`);
        if (quiet.frames !== frames) record(`tap mode drew ${quiet.frames - frames} frames with nothing in the sky`);
        await dragLine([[640, 300]]);
        const tapped = await waitFor(() => evaluate(`${show}.tapped && ${show}.parts.length > 20`), 4000);
        if (!tapped) record('a tap launched nothing');
        return true;
    }]],
    // 8.6: the first frame is a raked garden; a drag leaves grooves; with no
    // input it idles, between the gardener's strokes too.
    'zen-garden': [['raked from the first frame; a drag leaves grooves; idle between strokes', async () => {
        if (!await stageWith('zen-garden')) return record('not ready');
        // Raked from the start: the garden differs from clean sand over most of it.
        const raked = await evaluate(`(() => {
            const m = WP.stage.manager, size = 128, probe = document.createElement('canvas');
            probe.width = probe.height = size;
            const ctx = probe.getContext('2d', { willReadFrequently: true });
            const read = c => { ctx.clearRect(0, 0, size, size); ctx.drawImage(c, 0, 0, size, size); return ctx.getImageData(0, 0, size, size).data; };
            const sand = read(m.sand), base = read(m.base);
            let differ = 0;
            for (let i = 0; i < sand.length; i += 4) if (Math.abs(sand[i] - base[i]) > 6) differ++;
            return differ / (size * size);
        })()`);
        if (!(raked > 0.25)) record(`first frame isn't raked: ${(raked * 100).toFixed(0)}% of the sand differs from clean sand`);

        // Visitors off, so only the rake and the gardener make frames.
        await evaluate(`WP.stage.manager.applySettings({ ...WP.stage.manager.config, season: 'off' })`);
        const { w, h } = await evaluate('({ w: innerWidth, h: innerHeight })');
        const path = [];
        for (let i = 0; i <= 40; i++) path.push([w * (0.1 + 0.8 * i / 40), h * (0.5 + 0.25 * Math.sin(i / 40 * Math.PI * 2))]);
        const SAMPLE = `(points => {
            const c = WP.stage.manager.canvas, ctx = c.getContext('2d'), k = WP.stage.manager.dpr;
            return points.map(([x, y]) => { const d = ctx.getImageData(Math.round(x * k) - 4, Math.round(y * k) - 4, 9, 9).data; const r = []; for (let i = 0; i < d.length; i += 4) r.push(d[i]); return r; });
        })`;
        const before = await evaluate(`${SAMPLE}(${JSON.stringify(path)})`);
        const strokes = await evaluate('WP.stage.manager.strokes');
        await drag(path);
        await sleep(300);
        const after = await evaluate(`${SAMPLE}(${JSON.stringify(path)})`);
        // A patch changed if its pixels moved by 8 levels on average.
        const changed = before.filter((patch, i) => patch.reduce((sum, v, j) => sum + Math.abs(v - after[i][j]), 0) / patch.length > 8).length / path.length;
        if (changed < 0.5) record(`a drag changed only ${(changed * 100).toFixed(0)}% of the points along its path`);
        if (await evaluate('WP.stage.manager.strokes') !== strokes + 1) record('the drag didn\'t finish one rake stroke');

        // Nothing to do: no frames at all.
        await sleep(300);
        const idle = await framesIn(1200);
        if (idle > 1) record(`${idle} frames in 1.2 s with nothing to do; expected none`);

        // The gardener: soon after its delay it rakes, with frames; when its
        // stroke ends it rests between strokes, with none.
        await evaluate(`WP.stage.manager.applySettings({ ...WP.stage.manager.config, season: 'off', gardenerDelay: 5 })`);
        await evaluate(`WP.stage.manager.nextGardenerAt = performance.now() + 300`);
        const started = await waitFor(() => evaluate('!!WP.stage.manager.gardenerStroke'), 3000);
        if (!started) return record('the gardener never came');
        const raking = await framesIn(600);
        if (raking < 8) record(`only ${raking} frames in 0.6 s while the gardener rakes`);
        await evaluate('WP.stage.manager.gardenerStroke.travel = 1e9');   // finish this stroke now
        await waitFor(() => evaluate('!WP.stage.manager.gardenerStroke'), 2000);
        await sleep(200);
        const resting = await framesIn(1500);
        if (resting > 1) record(`${resting} frames while the gardener rests between strokes`);
        return true;
    }]],

    // 8.7: a tap makes a ripple and the nearest koi turn towards it within
    // 2 s; the number of koi follows the tier's density.
    'koi-pond': [['a tap calls the nearest koi within 2 s; koi follow density', async () => {
        if (!await stageWith('koi-pond')) return record('not ready');
        // Tap behind a koi, so it has to turn right round to come.
        const { x, y, nearest } = await evaluate(`(() => {
            const m = WP.stage.manager, fish = m.koi.filter(k => !k.leaving);
            for (const k of fish) {
                const x = Math.round(k.x - Math.cos(k.heading) * k.len * 1.4), y = Math.round(k.y - Math.sin(k.heading) * k.len * 1.4);
                if (x < 40 || y < 40 || x > innerWidth - 80 || y > innerHeight - 40) continue;
                const near = [...fish].sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
                if (near === k) return { x, y, nearest: k.id };
            }
            return { x: 200, y: 300, nearest: null };
        })()`);
        if (nearest === null) return record('no koi to tap behind');
        const ripples = await evaluate('WP.stage.manager.ripples.length');
        await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
        const tapped = Date.now();
        if (!(await evaluate('WP.stage.manager.ripples.length') > ripples)) record('a tap made no ripple');
        if (!(await evaluate('WP.stage.manager.attracted')).includes(nearest)) record('the nearest koi wasn\'t called');
        const turned = await waitFor(() => evaluate(`(() => {
            const k = WP.stage.manager.koi.find(k => k.id === ${nearest});
            const want = Math.atan2(${y} - k.y, ${x} - k.x), off = Math.abs(Math.atan2(Math.sin(want - k.heading), Math.cos(want - k.heading)));
            return off < 0.5 || Math.hypot(k.x - ${x}, k.y - ${y}) < k.len * 0.5;
        })()`), 2000);
        if (!turned) record('the nearest koi didn\'t turn towards the tap within 2 s');
        else console.log(`    koi-pond: nearest koi faced the tap after ${Date.now() - tapped} ms`);

        // Density: live changes thin and refill the pond, without a reset.
        const counts = [];
        for (const density of [0.35, 1]) {
            await evaluate(`WP.stage.manager.onQuality({ ...WP.host.quality, density: ${density} })`);
            const want = await evaluate('WP.stage.manager.fishTarget()');
            const settled = await waitFor(() => evaluate(`WP.stage.manager.koi.length === ${want} && WP.stage.manager.koi.every(k => !k.leaving)`), 8000);
            counts.push(`${density}→${want}`);
            if (!settled) record(`density ${density}: ${await evaluate('WP.stage.manager.koi.length')} koi, expected ${want}`);
        }
        // And a pinned Low tier starts with Low's share.
        await cdp.send('Page.navigate', { url: `${WEB}/stage.html?w=koi-pond&tier=low` });
        await waitFor(() => evaluate('WP.stage?.ready'));
        const low = await evaluate('({ n: WP.stage.manager.koi.length, want: Math.round(WP.stage.manager.config.fishCount * WP.host.quality.density), effects: WP.host.quality.effects })');
        if (low.n !== low.want) record(`?tier=low started with ${low.n} koi, expected ${low.want}`);
        if (low.effects.includes('shadows') || low.effects.includes('sparkles')) record('Low kept shadows or sparkles');
        console.log(`    koi-pond: density ${counts.join(', ')}; Low starts with ${low.n}`);
        return true;
    }]],
    // 8.1: idle between strokes on Low, and a new drawing on N.
    harmonograph: [['idles between strokes on Low, and N starts a new drawing', async () => {
        await bootStage('w=harmonograph&tier=low');
        const at = await evaluate('WP.stage.manager.drawn');
        const low = await stageFps();
        if (low > 8) record(`Low ran at ${low} fps; it should idle between strokes (about 4)`);
        if (await evaluate('WP.stage.manager.drawn') <= at) record('the pen did not move on Low');
        await bootStage('w=harmonograph&tier=high');
        if (await stageFps(1500) < 20) record('High didn\'t draw at the slow-motion rate');
        await evaluate('WP.stage.manager.newDrawing()');
        const fresh = await waitFor(() => evaluate("WP.stage.manager.phase === 'draw' && WP.stage.manager.pile.length === 1"), 8000);
        if (!fresh) record('N did not pile the sheet and start a new one');
        return true;
    }]],
    // 8.4: both layouts fill the screen at a whole scale with crisp pixels;
    // the wall clock shows the stage's time; ≤ 12 fps on every tier.
    'pixel-room': [['whole-pixel layouts, the stage\'s clock, taps, ≤ 12 fps on every tier', async () => {
        const screens = [
            { width: 1280, height: 800, deviceScaleFactor: 1, layout: 'landscape' },
            { width: 1920, height: 1080, deviceScaleFactor: 1.25, layout: 'landscape' },
            { width: 412, height: 915, deviceScaleFactor: 2.625, layout: 'portrait' },
            { width: 800, height: 1280, deviceScaleFactor: 2, layout: 'portrait' },
        ];
        for (const { layout, ...viewport } of screens) {
            await bootStage('w=pixel-room', viewport);
            const v = await evaluate(`(() => {
                const m = WP.stage.manager, c = m.canvas, r = c.getBoundingClientRect(), s = getComputedStyle(c);
                return { ...m.view, cw: c.width, ch: c.height, left: r.left, top: r.top, right: r.right, bottom: r.bottom,
                    iw: innerWidth, ih: innerHeight, rendering: s.imageRendering, perPixel: r.width * m.view.ratio / c.width };
            })()`);
            const where = `${viewport.width}×${viewport.height}@${viewport.deviceScaleFactor}`;
            if (v.layout !== layout) record(`${where}: ${v.layout} layout`);
            if (Math.abs(v.ratio - viewport.deviceScaleFactor) > 0.01) record(`${where}: read the pixel ratio as ${v.ratio}`);
            if (!Number.isInteger(v.scale) || Math.abs(v.perPixel - v.scale) > 0.01) record(`${where}: ${v.perPixel} device px per art px`);
            if (v.left > 0.01 || v.top > 0.01 || v.right < v.iw - 0.01 || v.bottom < v.ih - 0.01) record(`${where}: canvas doesn't cover the screen`);
            if (v.cw * v.scale < v.deviceW || v.ch * v.scale < v.deviceH) record(`${where}: buffer too small`);
            if (v.rendering !== 'pixelated') record(`${where}: image-rendering ${v.rendering}`);
        }
        await cdp.send('Emulation.clearDeviceMetricsOverride');
        for (const [date, hour, minute, phase, lamp] of [['2026-03-14T09:41', 9, 41, 'day', false], ['2026-03-14T22:30', 22, 30, 'night', true]]) {
            await bootStage(`w=pixel-room&date=${date}`);
            const seen = await evaluate('(m => ({ ...m.clockReading(), phase: m.state.phase, lamp: m.state.lamp }))(WP.stage.manager)');
            if (seen.hour !== hour || seen.minute !== minute) record(`?date=${date}: the clock reads ${seen.hour}:${seen.minute}`);
            if (seen.phase !== phase || seen.lamp !== lamp) record(`?date=${date}: ${seen.phase}, lamp ${seen.lamp ? 'on' : 'off'}`);
        }
        // A tap on the lamp switches it; a tap on the sleeping cat wakes it.
        await bootStage('w=pixel-room&date=2026-03-14T09:41');
        const tapAt = async art => {
            const [x, y] = await evaluate(`(m => [(m.ox + ${art[0]}) * m.view.scale + m.view.left, (m.oy + ${art[1]}) * m.view.scale + m.view.top].map(v => v / m.view.ratio))(WP.stage.manager)`);
            for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
            await sleep(200);
        };
        await tapAt(await evaluate('(l => [l.x + 8, l.y + 3])(WP.stage.manager.L.lamp)'));
        if (!await evaluate('WP.stage.manager.timeState().lamp')) record('a tap on the lamp left it off');
        await tapAt(await evaluate('(b => [b.x + b.w / 2, b.y + b.h / 2])(WP.stage.manager.catBox())'));
        if (await evaluate('WP.stage.manager.cat.state') !== 'wake') record('a tap on the cat didn\'t wake it');
        for (const tier of ['low', 'medium', 'high']) {
            await bootStage(`w=pixel-room&tier=${tier}`);
            await sleep(500);
            const fps = await stageFps();
            if (fps > 12 || fps < 7) record(`${tier}: ${fps} fps; expected 8–12`);
        }
        return true;
    }]],
    synthwave: [
        ['every palette renders, each its own colours', async () => {
            // The panel's options; the unit tests hold them to the palettes
            const palettes = await evaluate('Object.keys(SYNTHWAVE_PALETTES)');
            const seen = new Map();
            for (const palette of palettes) {
                if (!await stageWith('synthwave', { configVersion: 1, palette }, '&seed=7')) return record(`${palette}: not ready`);
                await sleep(600);
                if (await evaluate(DRAWN) < 30) record(`${palette}: barely drawn`);
                const average = JSON.stringify(await evaluate(AVERAGE));
                if (seen.has(average)) record(`${palette} looks just like ${seen.get(average)}`);
                seen.set(average, palette);
                const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
                writeFileSync(join(SHOTS, `synthwave-${palette}.png`), Buffer.from(data, 'base64'));
            }
            return seen.size === palettes.length;
        }],
        ['the grid covers the same ground per second at 20 fps as at full rate', async () => {
            const rates = {};
            for (const tier of ['low', 'high']) {
                await stageWith('synthwave', null, `&tier=${tier}`);
                await sleep(400);
                const at = () => evaluate('({ d: WP.stage.manager.distance, t: performance.now(), n: WP.host.frames.count })');
                const a = await at();
                await sleep(2500);
                const b = await at();
                rates[tier] = { speed: (b.d - a.d) / ((b.t - a.t) / 1000), fps: (b.n - a.n) / ((b.t - a.t) / 1000) };
            }
            const expected = await evaluate('SynthwaveGrid.SPEED');
            for (const [tier, { speed, fps }] of Object.entries(rates)) {
                if (Math.abs(speed / expected - 1) > 0.08) record(`${tier}: ${speed.toFixed(2)} units/s at ${fps.toFixed(0)} fps; expected ${expected}`);
            }
            if (rates.low.fps > 24) record(`Low ran at ${rates.low.fps.toFixed(0)} fps, so the comparison proves nothing`);
            console.log(`      ${Object.entries(rates).map(([t, r]) => `${t}: ${r.speed.toFixed(3)} units/s at ${r.fps.toFixed(0)} fps`).join(', ')}`);
            return true;
        }],
    ],
    'night-train': [
        ['the carriage\'s reflection shows in tunnels and nowhere else', async () => {
            await stageWith('night-train', null, '&seed=7');
            await sleep(500);
            const shown = {};
            for (const kind of ['countryside', 'town', 'coast', 'bridge', 'station', 'tunnel']) {
                shown[kind] = await evaluate(`(async () => {
                    const m = WP.stage.manager;
                    m.route.ensure(4e6);
                    const s = m.route.segments.find(s => s.kind === '${kind}' && s.start > 0 && s.end - s.start > 2 * m.halfWidth() + 400);
                    Object.assign(m.train, { x: (s.start + s.end) / 2, served: s.stop ?? -Infinity, dwell: 0 });
                    await new Promise(r => setTimeout(r, 400));
                    return m.reflectionShown / m.view.w;
                })()`);
                if (kind === 'tunnel') {
                    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
                    writeFileSync(join(SHOTS, 'night-train-tunnel.png'), Buffer.from(data, 'base64'));
                }
            }
            for (const [kind, share] of Object.entries(shown)) {
                if (kind === 'tunnel' ? share < 0.99 : share !== 0) record(`${kind}: reflection over ${(share * 100).toFixed(0)}% of the window`);
            }
            return true;
        }],
        ['Low drops the glass effects: no reflection, no soft streaks', async () => {
            await stageWith('night-train', null, '&seed=7&tier=low');
            await sleep(400);
            const state = await evaluate(`(async () => {
                const m = WP.stage.manager;
                m.route.ensure(4e6);
                const s = m.route.segments.find(s => s.kind === 'tunnel' && s.start > 0);
                m.train.x = (s.start + s.end) / 2;
                await new Promise(r => setTimeout(r, 400));
                return { reflection: m.fade.reflection, soft: m.fade.soft, shown: m.reflectionShown };
            })()`);
            const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
            writeFileSync(join(SHOTS, 'night-train-low-tunnel.png'), Buffer.from(data, 'base64'));
            if (state.reflection || state.soft || state.shown) record(`on Low: ${JSON.stringify(state)}`);
            return true;
        }],
        ['waiting at a dry platform, it idles (about a frame a second)', async () => {
            await stageWith('night-train', { configVersion: 1, rain: 0 }, '&seed=7');
            await sleep(300);
            await evaluate(`(() => {
                const m = WP.stage.manager;
                m.route.ensure(4e6);
                const s = m.route.segments.find(s => s.kind === 'station');
                Object.assign(m.train, { x: s.stop, v: 0, dwell: 30, served: s.stop });
            })()`);
            await sleep(400);
            const before = await evaluate('WP.host.frames.count');
            await sleep(3000);
            const frames = await evaluate('WP.host.frames.count') - before;
            const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
            writeFileSync(join(SHOTS, 'night-train-station.png'), Buffer.from(data, 'base64'));
            if (frames > 6) record(`${frames} frames in 3 s at the platform`);
            return true;
        }],
        ['every palette renders, each its own colours', async () => {
            const seen = new Map();
            for (const palette of await evaluate('Object.keys(NIGHT_TRAIN_PALETTES)')) {
                if (!await stageWith('night-train', { configVersion: 1, palette }, '&seed=7')) return record(`${palette}: not ready`);
                await sleep(600);
                if (await evaluate(DRAWN) < 12) record(`${palette}: barely drawn`);
                const average = JSON.stringify(await evaluate(AVERAGE));
                if (seen.has(average)) record(`${palette} looks just like ${seen.get(average)}`);
                seen.set(average, palette);
                const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
                writeFileSync(join(SHOTS, `night-train-${palette}.png`), Buffer.from(data, 'base64'));
            }
            return true;
        }],
    ],
    // SPEC §9 Phase 9, against the fixture server (tools/jellyfin-mock.mjs).
    jellyfin: [
        ['fresh: the idle test card, and nothing asked of any server', async () => {
            jellyfinServer();
            await fresh(`${WEB}/stage.html?w=jellyfin`);
            await stageReady();
            await sleep(500);
            const state = await counts('({ state: m.state, paints: m.paints })');
            if (state.state !== 'setup') record(`state ${state.state}`);
            if (state.paints !== 1) record(`art painted ${state.paints} times`);
            if (current.jellyfin.state.log.length) record(`${current.jellyfin.state.log.length} requests before any server was given`);
            if (await evaluate(DRAWN) < 12) record('test card barely drawn');
            return true;
        }],
        ['Quick Connect in the panel: sign in, list, pick, play with English subtitles', async () => {
            const mock = jellyfinServer();
            await fresh(`${WEB}/index.html?w=jellyfin&panel=open`, { 'wp:jellyfin': { configVersion: 1, order: 'inOrder' } });
            await waitFor(() => evaluate('WP.player?.stage?.ready'));
            if (!await waitFor(() => evaluate(`!!document.querySelector('#panel [data-key=server] input')`), 4000)) return record('no server field');
            await evaluate(`(i => { i.value = 'jellyfin.invalid:8096'; i.dispatchEvent(new Event('change', { bubbles: true })); })(document.querySelector('#panel [data-key=server] input'))`);
            if (!await panelAction('connect')) return record('no Connect button');
            if (!await waitFor(() => evaluate(`document.querySelector('#panel .setting-status[data-name=server]').textContent.includes('Fixture Server')`), 5000)) return record('never connected');
            if (!await panelAction('quick')) return record('no Quick Connect button');
            const code = await waitFor(() => evaluate(`document.querySelector('#panel .setting-code:not([hidden])')?.textContent`), 5000);
            if (code !== QUICK_CODE) record(`code shown: ${code}`);
            const playing = await waitFor(() => inStage(`WP.stage.manager.state === 'playing' && WP.stage.manager.video.currentTime > 0.3`), 15000);
            if (!playing) return record(`never played (state ${await inStage('WP.stage.manager.state')})`);
            const now = await inStage(`(m => ({ title: m.item.Name, src: m.video.src, sub: m.subtitle, muted: m.video.muted }))(WP.stage.manager)`);
            if (now.title !== 'Test Pattern No. 3') record(`in order, but first is ${now.title}`);
            if (!now.src.startsWith(`${MOCK_ORIGIN}/Videos/`) || !now.src.includes('api_key=')) record('not a direct-play URL with its token');
            if (now.sub?.index !== 3 || now.sub.burn) record(`subtitle track ${JSON.stringify(now.sub)}, not the full English one (3)`);
            if (!now.muted) record('started with sound');
            const cue = await waitFor(() => inStage('WP.stage.manager.cue'), 5000);
            if (!/fixture|Nothing real|stand by/i.test(cue || '')) record(`no English cue on screen (${JSON.stringify(cue)})`);
            const options = await evaluate(`[...document.querySelectorAll('#panel [data-key=playlistId] option')].map(o => o.textContent)`);
            if (!options.some(o => o.includes('Fixture Mix'))) record(`playlists offered: ${options.join(' | ')}`);
            if (!await evaluate(`!!localStorage.getItem('wp:jellyfin:auth')`)) record('no token kept');
            await evaluate(`window.exported = null; URL.createObjectURL = (real => blob => { blob.text().then(t => { window.exported = t; }); return real.call(URL, blob); })(URL.createObjectURL);
                [...document.querySelectorAll('#panel .action')].find(b => b.textContent === 'Export').click()`);
            const exported = await waitFor(() => evaluate('window.exported'), 3000);
            if (!exported) record('nothing exported');
            else if (exported.includes('wp:jellyfin:auth') || exported.includes('mocktoken')) record('the token went into the export');
            await shoot('jellyfin-playing');
            return true;
        }],
        ['password sign-in: sent once, never stored, the field cleared', async () => {
            const mock = jellyfinServer();
            await fresh(`${WEB}/index.html?w=jellyfin&panel=open`, { 'wp:jellyfin': { configVersion: 1, server: MOCK_ORIGIN } });
            await waitFor(() => evaluate('WP.player?.stage?.ready'));
            await waitFor(() => evaluate(`!!document.querySelector('#panel .setting-action[data-name=connect]')`), 4000);
            await panelAction('connect');
            if (!await waitFor(() => evaluate(`!document.querySelector('#panel .setting-input[data-name=password]').hidden`), 5000)) return record('no password field');
            await evaluate(`for (const [name, value] of [['username', ${JSON.stringify(MOCK_USER.name)}], ['password', ${JSON.stringify(MOCK_USER.password)}]])
                document.querySelector('#panel .setting-input[data-name=' + name + '] input').value = value`);
            await panelAction('password');
            if (!await waitFor(() => inStage(`WP.stage.manager.state === 'playing'`), 10000)) return record(`never played (${await evaluate(`document.querySelector('#panel .setting-status[data-name=account]').textContent`)})`);
            const stored = await evaluate('JSON.stringify(Object.entries(localStorage))');
            if (stored.includes(MOCK_USER.password)) record('the password is in storage');
            if (await evaluate(`document.querySelector('#panel .setting-input[data-name=password] input').value`)) record('the password field kept its text');
            const sent = mock.state.log.filter(r => r.body.includes(MOCK_USER.password)).length;
            if (sent !== 1) record(`the password was sent ${sent} times`);
            if (!await waitFor(() => evaluate(`!document.querySelector('#panel .setting-action[data-name=signout]').hidden`), 3000)) record('no Sign out');
            await panelAction('signout');
            if (!await waitFor(() => evaluate(`!localStorage.getItem('wp:jellyfin:auth')`), 3000)) record('token kept after signing out');
            if (!mock.state.log.some(r => r.path === '/Sessions/Logout')) record('the server wasn\'t told');
            if (await inStage('WP.stage.manager.state') !== 'setup') record('still playing after signing out');
            return true;
        }],
        ['pausing the stage pauses the video within 100 ms; stop() frees the decoder', async () => {
            const mock = jellyfinServer();
            await fresh(`${WEB}/stage.html?w=jellyfin`, jellyfinSignedIn(mock, { order: 'inOrder' }));
            if (!await waitFor(() => counts(`m.state === 'playing' && m.video.currentTime > 0.2`), 10000)) return record('never played');
            const ms = await evaluate(`(async () => { const t = performance.now(); WP.stage.pause(); while (!WP.stage.manager.video.paused) await new Promise(r => setTimeout(r, 2)); return performance.now() - t; })()`);
            if (!(ms < 100)) record(`paused after ${ms.toFixed(0)} ms`);
            await evaluate('WP.stage.resume()');
            if (!await waitFor(() => counts('!m.video.paused'), 3000)) record('didn\'t resume');
            const freed = await evaluate(`(v => { WP.stage.manager.stop(); return { src: v.getAttribute('src'), network: v.networkState, attached: v.isConnected }; })(WP.stage.manager.video)`);
            // No source: NETWORK_EMPTY or NETWORK_NO_SOURCE, never idle or loading.
            if (freed.src || ![0, 3].includes(freed.network) || freed.attached) record(`after stop(): ${JSON.stringify(freed)}`);
            return true;
        }],
        ['a second stage takes over; the first goes quiet, keeping its picture', async () => {
            const mock = jellyfinServer();
            await fresh(`${WEB}/index.html?w=jellyfin`, jellyfinSignedIn(mock, { order: 'inOrder', subtitles: 'off' }));
            if (!await waitFor(() => inStage(`WP.stage.manager.state === 'playing' && WP.stage.manager.video.currentTime > 0.2`), 10000)) return record('first never played');
            const first = await stageContext();
            await evaluate(`document.body.append(Object.assign(document.createElement('iframe'), { src: 'stage.html?w=jellyfin', style: 'position:fixed;right:0;bottom:0;width:320px;height:200px;border:0' }))`);
            await sleep(500);
            if (!await waitFor(() => inStage(`WP.stage.manager?.state === 'playing' && WP.stage.manager.video.currentTime > 0.2`), 10000)) return record('second never played');
            const quiet = await waitFor(() => evaluate(`(m => m.state === 'away' && { src: m.video?.getAttribute('src'), still: m.still.style.display })(WP.stage.manager)`, first), 3000);
            if (!quiet) return record(`first stage is ${await evaluate('WP.stage.manager.state', first)}`);
            if (quiet.src) record('first stage still has its video source');
            if (quiet.still !== 'block') record('first stage dropped its last picture');
            await shoot('jellyfin-two-tabs');
            return true;
        }],
        ['every frame: landscape and portrait, the video\'s shape kept, art built once per resize', async () => {
            jellyfinServer();
            const frames = [];
            for (const [name, width, height, mobile] of [['landscape', 1280, 800, false], ['portrait', 412, 915, true]]) {
                await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
                if (!frames.length) {
                    await fresh(`${WEB}/stage.html?w=jellyfin&thumb=1`);
                    await stageReady();
                    frames.push(...await evaluate('JellyfinFrames.list().map(f => f.id)'));
                }
                for (const frame of frames) {
                    await stageAt(`${WEB}/stage.html?w=jellyfin&thumb=1&host=${mobile ? 'android' : 'standalone'}`, { 'wp:jellyfin': { configVersion: 1, frame } });
                    await sleep(300);
                    const before = await counts('m.paints');
                    await evaluate(`dispatchEvent(new Event('resize'))`);
                    await sleep(200);
                    const L = await counts(`({ ...m.layout.screen, paints: m.paints, bottom: innerHeight - WP.host.insets.bottom, vw: innerWidth })`);
                    const where = `${frame} ${name}`;
                    if (before !== 1 || L.paints !== 2) record(`${where}: painted ${before}, then ${L.paints} after one resize`);
                    if (L.x < -0.5 || L.y < -0.5 || L.x + L.w > L.vw + 0.5 || (frame !== 'none' && L.y + L.h > L.bottom)) record(`${where}: screen outside the view`);
                    if (frame !== 'none' && Math.abs(L.w / L.h - 16 / 9) > 0.01) record(`${where}: screen is ${(L.w / L.h).toFixed(3)}, not 16:9`);
                    if (await evaluate(DRAWN) < 12) record(`${where}: barely drawn`);
                    await shoot(`jellyfin-${frame}-${name}`);
                }
            }
            await cdp.send('Emulation.clearDeviceMetricsOverride');
            return frames.length >= 2 || record(`only ${frames.length} frames`);
        }],
        ['every frame plays: the video in its screen, subtitles in its style', async () => {
            const mock = jellyfinServer();
            await fresh(`${WEB}/stage.html?w=jellyfin&thumb=1`);
            await stageReady();
            for (const frame of await evaluate('JellyfinFrames.list().map(f => f.id)')) {
                await fresh(`${WEB}/stage.html?w=jellyfin`, jellyfinSignedIn(mock, { order: 'inOrder', frame }));
                if (!await waitFor(() => counts(`m.state === 'playing' && m.video.currentTime > 0.5 && !!m.cue`), 10000)) { record(`${frame}: never played with a cue`); continue; }
                const fit = await counts(`(r => { const s = m.layout.screen; return Math.max(Math.abs(r.x - s.x), Math.abs(r.y - s.y), Math.abs(r.width - s.w), Math.abs(r.height - s.h)); })(m.box.getBoundingClientRect())`);
                if (fit > 1) record(`${frame}: the video is ${fit.toFixed(1)} px off its screen`);
                await sleep(400);
                await shoot(`jellyfin-${frame}-playing`);
            }
            return true;
        }],
        ['on Low only the video moves', async () => {
            const mock = jellyfinServer();
            await fresh(`${WEB}/stage.html?w=jellyfin&tier=low`, jellyfinSignedIn(mock, { order: 'inOrder', subtitles: 'off', showTitle: false }));
            if (!await waitFor(() => counts(`m.state === 'playing' && m.video.currentTime > 0.2`), 10000)) return record('never played');
            if (await evaluate(`WP.host.quality.effects.includes('frameMotion')`)) record('frame motion on at Low');
            await sleep(4600);   // past the 🔇 badge's fade
            const before = await evaluate('WP.host.frames.count');
            const time = await counts('m.video.currentTime');
            await sleep(3000);
            const drawn = await evaluate('WP.host.frames.count') - before;
            if (drawn > 1) record(`${drawn} overlay frames in 3 s`);
            if (!(await counts('m.video.currentTime') > time + 1)) record('the video stood still');
            return true;
        }],
        ['titled frames: the marquee and plaque repaint with each title, and hold still on Low', async () => {
            const mock = jellyfinServer();
            for (const frame of ['drive-in', 'porthole']) {
                await fresh(`${WEB}/stage.html?w=jellyfin&tier=low`, jellyfinSignedIn(mock, { order: 'inOrder', subtitles: 'off', frame }));
                if (!await waitFor(() => counts(`m.state === 'playing' && m.video.currentTime > 0.2`), 10000)) { record(`${frame}: never played`); continue; }
                await counts(`(f => { const paint = f.paint; f.paint = (ctx, L, env) => { window.painted = env.title; return paint(ctx, L, env); }; })(m.frameDef)`);
                await counts('m.skip(1)');
                const title = await waitFor(() => counts(`m.state === 'playing' && m.video.currentTime > 0.2 && m.item.Name !== 'Test Pattern No. 3' && JellyfinLogic.titleOf(m.item)`), 8000);
                const painted = await evaluate('window.painted');
                if (!title || painted !== title) record(`${frame}: the art shows ${JSON.stringify(painted)}, not ${JSON.stringify(title)}`);
                await sleep(4600);   // past the 🔇 badge's fade
                const before = await evaluate('WP.host.frames.count');
                await sleep(2000);
                const drawn = await evaluate('WP.host.frames.count') - before;
                if (drawn > 1) record(`${frame}: ${drawn} overlay frames in 2 s on Low`);
            }
            return true;
        }],
        ['power: on battery at most 720p; battery saver shows posters, with no video at all', async () => {
            const mock = jellyfinServer();
            await fresh(`${WEB}/index.html?w=jellyfin&tier=high`, jellyfinSignedIn(mock, { order: 'inOrder', subtitles: 'off' }));
            if (!await waitFor(() => inStage(`WP.stage.manager.state === 'playing'`), 10000)) return record('never played');
            const height = () => {
                const asked = mock.state.log.filter(r => r.path.endsWith('/PlaybackInfo')).at(-1);
                return Number(JSON.parse(asked.body).DeviceProfile.CodecProfiles[0].Conditions.find(c => c.Property === 'Height').Value);
            };
            if (height() !== 1080) record(`plugged in at High it asked for ${height()}p`);
            await evaluate(`WP.power({ battery: { charging: false, level: 0.6 } })`);
            await sleep(300);
            await inStage('WP.stage.manager.skip(1)');
            await waitFor(() => inStage(`WP.stage.manager.item.Name !== 'Test Pattern No. 3' && WP.stage.manager.state === 'playing'`), 8000);
            if (height() > 720) record(`on battery it asked for ${height()}p`);
            await evaluate(`WP.power({ battery: { charging: false, level: 0.6 }, saver: true })`);
            const poster = await waitFor(() => inStage(`WP.stage.manager.state === 'poster' && !document.querySelector('video') && (p => p.complete && p.naturalWidth > 0 && p.src)(WP.stage.manager.poster)`), 6000);
            if (!poster) record(`state ${await inStage('WP.stage.manager.state')}, video ${await inStage('!!document.querySelector("video")')}`);
            else if (!poster.includes('/Images/Backdrop')) record('poster isn\'t the backdrop');
            await sleep(1300);
            await shoot('jellyfin-poster');
            return true;
        }],
        ['keys: M for sound, S steps through subtitles and remembers, N moves on', async () => {
            const mock = jellyfinServer();
            await fresh(`${WEB}/stage.html?w=jellyfin`, jellyfinSignedIn(mock, { order: 'inOrder' }));
            if (!await waitFor(() => counts(`m.state === 'playing' && m.video.currentTime > 0.2`), 10000)) return record('never played');
            await press('m');   // a real key press: sound needs a user gesture
            if (await counts('m.video.muted')) record('M left it muted');
            const subs = await counts('m.cycleSubtitles()');
            if (!await waitFor(() => counts(`m.state === 'playing' && m.subtitle?.index === 4`), 6000)) record(`S said ${subs}, track ${JSON.stringify(await counts('m.subtitle'))}`);
            if (JSON.stringify(await evaluate(`JSON.parse(localStorage.getItem('wp:jellyfin:subs'))`)) !== JSON.stringify({ [await counts('m.item.Id')]: 4 })) record('pick not remembered');
            const before = await counts('m.item.Name');
            await counts('m.skip(1)');
            if (!await waitFor(() => counts(`m.state === 'playing' && m.item.Name !== ${JSON.stringify(before)}`), 6000)) record('N didn\'t move on');
            if (await counts('m.video.muted')) record('sound didn\'t carry over to the next item');
            return true;
        }],
    ],
};

async function stageChecks(id) {
    const { check, failed } = checker();
    for (const [name, fn] of STAGE_CHECKS[id] || []) await check(`${id}: ${name}`, fn);
    // Leave while the last check's fixtures still answer, so a request
    // already in flight (a video's next range) isn't blamed on the next stage.
    if (STAGE_CHECKS[id]) {
        await cdp.send('Page.navigate', { url: 'about:blank' });
        await sleep(300);
    }
    return failed();
}

async function press(key) {
    const text = key.length === 1 ? key : undefined;
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, text, ...(key.startsWith('Arrow') ? { code: key, windowsVirtualKeyCode: { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40 }[key] } : {}), ...(key === 'Escape' ? { windowsVirtualKeyCode: 27, code: 'Escape' } : {}) });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key });
    await sleep(150);
}

// A named check: passes if fn returns truthy and nothing was recorded.
function checker() {
    let failed = 0;
    const check = async (name, fn) => {
        current = { network: false, cors: true, problems: [], requests: [] };
        let ok = false;
        try { ok = await fn(); } catch (error) { record(error.message); }
        if (!ok && !current.problems.length) record('check failed');
        if (current.problems.length) failed++;
        console.log(`  ${name.padEnd(52)} ${current.problems.length ? '✗' : '✓'}`);
        for (const problem of current.problems) console.log(`      ${problem}`);
    };
    return { check, failed: () => failed };
}

async function playerSuite(catalog) {
    const { check, failed } = checker();
    const playerReady = () => waitFor(() => evaluate('WP.player?.stage?.ready && WP.player.stage.id'));

    await check('first run shows the Seasonal wallpaper', async () => {
        await fresh(`${WEB}/index.html`);
        const shown = await playerReady();
        const expected = await evaluate('WP.seasonalFor(new Date())');
        return shown === expected && await evaluate('WP.player.choice') === 'seasonal';
    });

    await check('?w=rain shows rain and persists nothing', async () => {
        await fresh(`${WEB}/index.html?w=rain`);
        return await playerReady() === 'rain' && await evaluate("localStorage.getItem('wp:current')") === null;
    });

    await check('] switches, persists and drops ?w= from the URL', async () => {
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ']', text: ']' });
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ']' });
        const shown = await waitFor(async () => { const id = await evaluate('WP.player.stage.ready && WP.player.stage.id'); return id && id !== 'rain' && id; });
        const saved = await evaluate("JSON.parse(localStorage.getItem('wp:current'))");
        return shown && saved === shown && !(await evaluate('location.search')).includes('w=');
    });

    await check('a full cycle leaves one stage and nothing leaked', async () => {
        current.network = true;   // the cycle passes through Bing
        await fresh(`${WEB}/index.html?w=blank`);
        await playerReady();
        const count = catalog.filter(e => !e.pseudo && !e.disabled).length + 1;
        for (let i = 0; i < count; i++) {
            await evaluate('WP.player.cycle(1)');
            await waitFor(() => evaluate('WP.player.stage.ready'), 6000);
        }
        await sleep(900);
        const frames = await evaluate("document.querySelectorAll('iframe').length");
        const canvases = await evaluate("document.querySelectorAll('canvas').length");
        if (frames !== 1) record(`${frames} stage iframes after the fades`);
        if (canvases) record(`${canvases} canvases in the player page`);
        return frames === 1 && !canvases;
    });

    await check('?panel=open opens the panel; Esc closes it; , and c open it', async () => {
        await fresh(`${WEB}/index.html?w=rain&panel=open`);
        await playerReady();
        if (!await waitFor(() => evaluate(PANEL_OPEN), 3000)) return record('panel not open on load');
        await press('Escape');
        if (await evaluate(PANEL_OPEN)) record('Esc did not close the panel');
        await press(',');
        if (!await evaluate(PANEL_OPEN)) record(', did not reopen the panel');
        await press('Escape');
        await press('c');
        if (!await evaluate(PANEL_OPEN)) record('c did not open the panel');
        return true;
    });

    // Every wallpaper, through the real panel: its controls render, and a
    // change reaches storage and then the running wallpaper.
    for (const entry of catalog.filter(e => !e.pseudo && !e.disabled && e.id !== 'blank')) {
        await check(`panel round-trip: ${entry.id}`, async () => {
            current.network = !!entry.network;
            await fresh(`${WEB}/index.html?w=${entry.id}&panel=open`);
            await playerReady();
            await waitFor(() => evaluate(`document.querySelectorAll('#panel .setting').length`), 4000);
            const rendered = await evaluate(`document.querySelectorAll('#panel .setting').length`);
            const expected = await evaluate(`WP.schemaOf('${entry.id}').filter(c => c.key).length`);
            if (rendered !== expected) record(`${rendered} controls rendered; the schema has ${expected}`);
            // Change the first slider (or select) the way a person would.
            const changed = await evaluate(`(() => {
                const row = document.querySelector('#panel .setting-range') || document.querySelector('#panel .setting-select');
                const input = row.querySelector('input, select');
                if (input.type === 'range') {
                    const min = +input.min, max = +input.max, step = +input.step;
                    let v = Math.round((min + (max - min) * 0.37) / step) * step + min % step;
                    v = +(Math.min(max, Math.max(min, v))).toFixed(6);
                    if (+input.value === v) v = +(Math.min(max, v + step)).toFixed(6);
                    input.value = v;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                } else {
                    input.selectedIndex = (input.selectedIndex + 1) % input.options.length;
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                }
                const key = row.dataset.key;
                return { key, stored: (JSON.parse(localStorage.getItem('wp:${entry.id}')) || {})[key] };
            })()`);
            if (changed.stored === undefined) return record(`${changed.key} wasn't saved`);
            const live = await waitFor(async () => {
                const value = await inStage(`WP.stage.ready && JSON.stringify(WP.stage.manager.config['${changed.key}'])`).catch(() => null);
                return value === JSON.stringify(changed.stored) && value;
            }, 5000);
            if (!live) record(`${changed.key} never reached the running wallpaper`);
            return true;
        });
    }

    await check('Reset takes two clicks and clears the overrides', async () => {
        await fresh(`${WEB}/index.html?w=rain&panel=open`);
        await playerReady();
        await waitFor(() => evaluate(PANEL_OPEN), 3000);
        await waitFor(() => evaluate(`!!document.querySelector('#panel input[type=range]')`), 4000);
        await evaluate(`(() => { const i = document.querySelector('#panel input[type=range]'); i.value = i.min; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
        if (!await evaluate(`!!localStorage.getItem('wp:rain')`)) return record('no override to reset');
        const reset = `[...document.querySelectorAll('#panel .action')].find(b => b.textContent.startsWith('Reset')).click()`;
        await evaluate(reset);
        if (!await evaluate(`!!localStorage.getItem('wp:rain')`)) record('one click reset without confirming');
        await evaluate(reset);
        if (await evaluate(`!!localStorage.getItem('wp:rain')`)) record('overrides still stored after confirming');
        return true;
    });

    await check('? lists the wallpaper’s own keys; Quest’s N reaches Quest', async () => {
        await fresh(`${WEB}/index.html?w=quest`);
        await playerReady();
        await press('?');
        const help = await evaluate(`(() => { const h = document.querySelector('.help'); return h && !h.hidden && h.textContent; })()`);
        if (!help || !help.includes('New quest')) record('key help missing or without Quest’s keys');
        await press('Escape');
        const before = await inStage('WP.stage.manager.questNumber');
        await press('n');
        const toast = await waitFor(() => evaluate(`document.getElementById('toast').classList.contains('show') && document.getElementById('toast').textContent`), 2000);
        const after = await inStage('WP.stage.manager.questNumber');
        if (!toast?.includes('new quest')) record(`no toast for N (got ${JSON.stringify(toast)})`);
        if (!(after > before)) record('N did not start a new quest');
        return true;
    });

    await check('advent’s arrow keys time-travel, with the date as a toast', async () => {
        await fresh(`${WEB}/index.html?w=advent`);
        await playerReady();
        const before = await inStage('WP.stage.manager.dayOffset');
        await press('ArrowRight');
        const toast = await waitFor(() => evaluate(`document.getElementById('toast').classList.contains('show') && document.getElementById('toast').textContent`), 2000);
        if (await inStage('WP.stage.manager.dayOffset') !== before + 1) record('→ did not move a day forward');
        if (!toast || !/\d/.test(toast)) record(`no date toast (got ${JSON.stringify(toast)})`);
        return true;
    });

    await check('?date= reaches the stage\'s clock, and advent opens that day without keeping score', async () => {
        await fresh(`${WEB}/index.html?w=advent&date=2026-12-24T18:30`);
        await playerReady();
        const now = await inStage('(d => [d.getMonth(), d.getDate(), d.getHours()])(WP.host.now())');
        if (JSON.stringify(now) !== '[11,24,18]') record(`host.now() is ${JSON.stringify(now)}, not 24 Dec 18:xx`);
        if (await inStage('WP.stage.manager.now().getDate()') !== 24) record('advent isn\'t on the 24th');
        if (await evaluate(`localStorage.getItem('wp:advent:adventLastSeen')`)) record('time travel saved adventLastSeen');
        return true;
    });

    // Fixtures only: live, CelesTrak and the geocoder are real (and CelesTrak
    // shouldn't be asked on every run).
    if (!LIVE) {
        await check('satellites: elements fetched once, then cached for 12 h', async () => {
            current.network = true;
            await fresh(`${WEB}/stage.html?w=satellites`);
            const live = await waitFor(() => evaluate("WP.stage.ready && WP.stage.manager.source === 'live'"));
            if (!live) record(`never used the fixture's elements (source: ${await evaluate('WP.stage.manager?.source')})`);
            if (!await evaluate("WP.stage.manager.sats.some(s => s.label === 'FIXTURE STATION')")) record('fixture station missing');
            await cdp.send('Page.navigate', { url: `${WEB}/stage.html?w=satellites` });
            await waitFor(() => evaluate('WP.stage.ready'));
            await sleep(800);
            const source = await evaluate('WP.stage.manager.source');
            const asked = current.requests.filter(url => url.startsWith('https://celestrak.org/')).length;
            if (asked !== 1) record(`asked CelesTrak ${asked} times; once is the limit`);
            if (source !== 'cache') record(`second start used ${source}, not the cache`);
            return true;
        });

        await check('satellites: offline and with nothing cached, sample orbits, labelled', async () => {
            current.offline = true;
            await fresh(`${WEB}/stage.html?w=satellites`);
            await waitFor(() => evaluate('WP.stage.ready'));
            await sleep(1500);
            const state = await evaluate('({ source: WP.stage.manager.source, status: WP.stage.manager.status.text, sats: WP.stage.manager.sats.length })');
            if (state.source !== 'sample' || !state.sats) record(`offline it shows ${state.sats} from ${state.source}`);
            if (!state.status.includes('Sample orbits')) record(`not labelled as a sample: ${state.status}`);
            if (await evaluate(DRAWN) < 2) record('nothing drawn offline');
            return true;
        });

        await check('location: a typed place, geocoded once and rounded, reaches the stage', async () => {
            current.network = true;
            await fresh(`${WEB}/index.html?w=satellites&panel=open`);
            await playerReady();
            if (await evaluate("document.querySelector('iframe').allow") !== 'geolocation') record('the stage iframe may not ask for geolocation');
            if (!await waitFor(() => evaluate("!!document.querySelector('#panel .location-input')"), 4000)) return record('no location controls');
            await evaluate(`(() => {
                document.querySelector('#panel .location-input').value = 'Testville';
                document.querySelector('#panel .location-find').requestSubmit();
            })()`);
            const chip = await waitFor(() => evaluate("document.querySelector('#panel .location-results .chip')?.textContent"), 4000);
            if (chip !== 'Testville, Fixture County, Exampleland') return record(`results: ${chip}`);
            await evaluate("document.querySelector('#panel .location-results .chip').click()");
            const saved = await evaluate("JSON.parse(localStorage.getItem('wp:location'))");
            if (JSON.stringify(saved) !== JSON.stringify({ lat: 12.3, lon: -56.8, label: 'Testville, Exampleland', source: 'typed' })) record(`saved ${JSON.stringify(saved)}`);
            const label = await waitFor(() => inStage("WP.stage.ready && WP.stage.manager.place?.label"), 6000);
            if (label !== 'Testville, Exampleland') record(`the stage has ${label}`);
            if (await inStage('WP.stage.manager.observer.lat') !== 12.3) record('the sky isn\'t over the place');
            const asked = current.requests.filter(url => url.startsWith('https://geocoding-api.open-meteo.com/')).length;
            if (asked !== 1) record(`asked the geocoder ${asked} times`);
            await fresh(`${WEB}/index.html?w=rain`);
            await playerReady();
            if (await evaluate("document.querySelector('iframe').allow")) record('rain was allowed geolocation');
            return true;
        });

    }
    await check('the corner gear appears when the pointer comes near', async () => {
        await fresh(`${WEB}/index.html?w=rain`);
        await playerReady();
        const width = await evaluate('innerWidth');
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 200, y: 300 });
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: width - 20, y: 20 });
        const shown = await waitFor(() => evaluate(`document.getElementById('gear').classList.contains('show')`), 2000);
        if (!shown) record('gear did not appear');
        return true;
    });

    await check('?tier=low halves the pixel ratio, not the layout, and caps the frame rate', async () => {
        await fresh(`${WEB}/index.html?w=starfield&tier=low`);
        await playerReady();
        const cover = await evaluate("document.querySelector('iframe').getBoundingClientRect().width / innerWidth");
        const layout = await inStage('innerWidth') / await evaluate('innerWidth');
        const ratio = await inStage('devicePixelRatio') / Math.min(1, await evaluate('devicePixelRatio'));
        // starfield is motion: 'slow', so Low caps it at 10 fps.
        const before = await inStage('WP.host.frames.count');
        await sleep(2000);
        const fps = (await inStage('WP.host.frames.count') - before) / 2;
        if (Math.abs(cover - 1) > 0.01) record(`stage covers ${cover.toFixed(2)} of the width`);
        if (Math.abs(layout - 1) > 0.01) record(`stage laid out at ${layout.toFixed(2)} of the width; expected all of it`);
        if (Math.abs(ratio - 0.5) > 0.01) record(`stage pixel ratio is ${ratio.toFixed(2)} of Low's cap; expected 0.5`);
        if (fps > 13 || fps < 5) record(`ran at ${fps} fps; expected about 10 (slow motion on Low)`);
        return true;
    });

    await check('pause stops frames; resume restarts them', async () => {
        await fresh(`${WEB}/index.html?w=rain`);
        await playerReady();
        await sleep(300);
        await inStage('WP.stage.pause()');
        const paused = await inStage('WP.host.frames.count');
        await sleep(600);
        const still = await inStage('WP.host.frames.count');
        await inStage('WP.stage.resume()');
        await sleep(600);
        const resumed = await inStage('WP.host.frames.count');
        if (still !== paused) record(`${still - paused} frames while paused`);
        if (resumed <= still) record('no frames after resume');
        return true;
    });

    await check('Import takes the old homepage\'s settings: changes only, links left behind', async () => {
        // As the README's console snippet saves it: raw localStorage strings.
        const dump = join(SHOTS, 'homepage-wallpapers.json');
        writeFileSync(dump, JSON.stringify({ app: 'homepage', localStorage: {
            wallpaperPreference: 'fishtank',
            fishtankConfig: JSON.stringify({ configVersion: 1, population: 'community', fishCount: 40, quality: 'auto', statusBarHeight: 36 }),
            snowConfig: JSON.stringify({ maxSnowflakes: 100, treeCount: 10 }),
            customLinks: '[]',
        } }));
        await fresh(`${WEB}/index.html?w=rain&panel=open`);
        await playerReady();
        await waitFor(() => evaluate(PANEL_OPEN));
        const { root } = await cdp.send('DOM.getDocument');
        const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '.panel input[type=file]' });
        await cdp.send('DOM.setFileInputFiles', { nodeId, files: [dump] });
        // The import reloads the page, which then shows fishtank and says what came over.
        const said = await waitFor(() => evaluate("document.getElementById('toast').textContent.includes('old homepage') && document.getElementById('toast').textContent"));
        const saved = await evaluate("({ current: JSON.parse(localStorage.getItem('wp:current')), fishtank: JSON.parse(localStorage.getItem('wp:fishtank')), snow: localStorage.getItem('wp:snow'), keys: Object.keys(localStorage) })");
        if (!said) record('no import summary');
        else if (!/1 changed setting, for Fish Tank\. Your wallpaper, Fish Tank, is back\..*links stayed behind/.test(said)) record(`summary: ${said}`);
        if (saved.current !== 'fishtank') record(`wallpaper is ${saved.current}`);
        if (saved.fishtank?.fishCount !== 40) record(`fishtank saved ${JSON.stringify(saved.fishtank)}`);
        if (saved.snow !== null) record('untouched homepage defaults were imported');
        if (saved.keys.some(key => !key.startsWith('wp:'))) record(`stray keys: ${saved.keys}`);
        return true;
    });

    await check('Auto steps down from slow frames, and renders fewer pixels', async () => {
        await fresh(`${WEB}/index.html?w=rain&hud=1`);
        await playerReady();
        // 20 ms of work every frame: over half of any frame interval.
        await inStage('requestAnimationFrame(function spin() { const t = performance.now(); while (performance.now() - t < 20); requestAnimationFrame(spin); })');
        const stepped = await waitFor(() => inStage("WP.host.quality.label !== 'High' && WP.host.quality.label"), 4000);
        if (!stepped) return record('still on High after 4 s of slow frames');
        const deeper = await waitFor(() => inStage("WP.host.quality.renderScale < 1 && WP.host.quality.renderScale"), 12000);
        await sleep(300);
        const ratio = await inStage(`devicePixelRatio / Math.min(${await evaluate('devicePixelRatio')}, WP.host.quality.dpr)`);
        if (!deeper) record('never reached a smaller render scale');
        else if (Math.abs(ratio - deeper) > 0.03) record(`stage pixel ratio is ${ratio.toFixed(2)} of its cap; its quality says ${deeper}`);
        if (!await inStage("localStorage.getItem('wp:perf:rain')")) record('settled rung not remembered');
        const hud = await waitFor(() => evaluate("document.querySelector('.hud')?.textContent"));
        if (!/fps · .* ms · rung \d+\/\d+/.test(hud || '')) record(`hud says: ${hud}`);
        return true;
    });

    await check('idleUntil stops frames until input wakes them', async () => {
        await fresh(`${WEB}/index.html?w=rain`);
        await playerReady();
        await inStage('WP.host.idleUntil()');
        await sleep(200);
        const idle = await inStage('WP.host.frames.count');
        await sleep(600);
        const still = await inStage('WP.host.frames.count');
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 300, y: 300 });
        await sleep(400);
        const woken = await inStage('WP.host.frames.count');
        if (still !== idle) record(`${still - idle} frames while idle`);
        if (woken <= still) record('input did not wake it');
        return true;
    });

    return failed();
}

async function extensionSuite(extensionId) {
    const { check, failed } = checker();
    const page = `chrome-extension://${extensionId}/index.html`;

    await check('Chrome gives it the ID its manifest key pins', async () => extensionId === 'hajnldgffgkdnbimdihipffnimjckgcp'
        || record(`loaded as ${extensionId}`));

    await check('the new tab is the player', async () => {
        await cdp.send('Page.navigate', { url: 'chrome://newtab/' });
        await waitFor(() => evaluate('WP.player?.stage?.ready'));
        const tab = await evaluate('({ href: location.href, host: WP.player.host })');
        const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
        writeFileSync(join(SHOTS, 'extension-newtab.png'), Buffer.from(data, 'base64'));
        return tab.href === page && tab.host === 'extension';
    });

    await check('Bing comes straight from bing.com, without CORS help', async () => {
        Object.assign(current, { network: true, cors: false });
        await cdp.send('Page.navigate', { url: `${page}?w=bing` });
        await waitFor(() => evaluate('WP.player?.stage?.ready'));
        const shown = await waitFor(() => inStage('getComputedStyle(document.body).backgroundImage.includes("smoke-fixture")'));
        const asked = current.requests.filter(url => !url.startsWith('chrome-extension:'));
        if (asked.some(url => !url.startsWith('https://www.bing.com/'))) record(`asked someone else: ${asked.join(' ')}`);
        if (current.requests.some(url => url.endsWith('/bing.json'))) record('looked for bing.json, which only served pages have');
        return shown;
    });

    return failed();
}

// ---- Wallpapers' own checks ----------------------------------------------------
// Run right after that wallpaper's stage, against fixtures (not under SMOKE_URL).

const shoot = async name => {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(data, 'base64'));
};
const stageReady = () => waitFor(() => evaluate('WP.stage?.ready'));

const EXTRA = {
    lighthouse: {
        'no network while live swell is off': async () => {
            current.network = true;
            await fresh(`${WEB}/stage.html?w=lighthouse`);
            await stageReady();
            await sleep(1500);
            const asked = current.requests.filter(url => !/^(file|data|blob):/.test(url));
            if (asked.length) record(`asked: ${asked.join(' ')}`);
            return true;
        },
        'offline with live swell on: a sea all the same, and a note': async () => {
            current.offline = true;
            await fresh(`${WEB}/stage.html?w=lighthouse`, { 'wp:lighthouse': { configVersion: 1, liveSwell: true } });
            await stageReady();
            if (!await waitFor(() => evaluate(`WP.stage.manager.swellStatus === 'offline'`), 5000)) record('never gave up on the forecast');
            if (await evaluate(DRAWN) < 2) record('nothing drawn offline');
            const note = await evaluate('WP.stage.manager.note.textContent');
            if (!/unavailable/.test(note)) record(`note says: ${note}`);
            await shoot('lighthouse-offline');
            return true;
        },
        'a high-swell forecast visibly raises the waves': async () => {
            const sea = {};
            for (const fixture of ['calm', 'swell']) {
                Object.assign(current, { network: true, marine: fixture });
                await fresh(`${WEB}/stage.html?w=lighthouse&seed=7`, { 'wp:lighthouse': { configVersion: 1, liveSwell: true } });
                await stageReady();
                if (!await waitFor(() => evaluate(`WP.stage.manager.swellStatus === 'live'`), 5000)) return record(`${fixture}: forecast never arrived`);
                await sleep(800);
                sea[fixture] = await evaluate('({ px: WP.stage.manager.seaPixels(), saved: !!localStorage.getItem("wp:lighthouse:swell") })');
                if (!sea[fixture].saved) record(`${fixture}: forecast not cached in host.storage`);
                if (await evaluate(DRAWN) < 2) record(`${fixture}: nothing drawn`);
                await shoot(`lighthouse-${fixture}`);
            }
            if (!(sea.swell.px > 4 * sea.calm.px && sea.swell.px > 40)) record(`waves ${sea.calm.px.toFixed(1)} px calm, ${sea.swell.px.toFixed(1)} px in the swell`);
            return true;
        },
    },
    'wiki-pond': {
        'the fixture stream drives ripples (titles stay off)': async () => {
            current.network = true;
            await fresh(`${WEB}/stage.html?w=wiki-pond`);
            await stageReady();
            const shown = await waitFor(() => evaluate('WP.stage.manager.stats.shown >= 12 && WP.stage.manager.stats.shown'), 8000);
            if (!shown) record(`only ${await evaluate('WP.stage.manager.stats.shown')} edits shown`);
            const state = await evaluate(`(m => ({ lotuses: m.lotuses.length, titles: m.titles.length, ripples: m.ripples.filter(r => r.colour !== WikiPondAnimationManager.RAIN).length }))(WP.stage.manager)`);
            if (!state.ripples) record('no edit ripples on the pond');
            if (!state.lotuses) record('no lotus for the new article');
            if (state.titles) record('titles shown while off');
            if (await evaluate(DRAWN) < 2) record('nothing drawn');
            await shoot('wiki-pond-live');
            return true;
        },
        'network blocked: the quiet offline pond, not a blank screen': async () => {
            current.offline = true;
            await fresh(`${WEB}/stage.html?w=wiki-pond`);
            await stageReady();
            if (!await waitFor(() => evaluate(`WP.stage.manager.status === 'offline'`), 5000)) record('never went offline');
            await sleep(1500);
            const state = await evaluate(`(m => ({ note: m.note.textContent, opacity: m.note.style.opacity, rain: m.ripples.length }))(WP.stage.manager)`);
            if (!/Waiting for edits/.test(state.note) || state.opacity !== '1') record(`note: ${JSON.stringify(state)}`);
            if (!state.rain) record('no rain on the offline pond');
            if (await evaluate(DRAWN) < 2) record('nothing drawn offline');
            await shoot('wiki-pond-offline');
            return true;
        },
        'the stream closes on pause and on stop, and reopens on resume': async () => {
            Object.assign(current, { network: true, hold: true });
            await fresh(`${WEB}/stage.html?w=wiki-pond`);
            await stageReady();
            const held = `!!(window.held = WP.stage.manager.source)`;
            if (!await waitFor(() => evaluate(held), 5000)) return record('no stream to begin with');
            await evaluate('WP.stage.pause()');
            if (await evaluate('window.held.readyState !== 2 || WP.stage.manager.source !== null')) record('stream still open while paused');
            const connects = await evaluate('WP.stage.manager.stats.connects');
            await sleep(2500);
            if (await evaluate(`WP.stage.manager.source !== null || WP.stage.manager.stats.connects !== ${connects}`)) record('reconnected while paused');
            await evaluate('WP.stage.resume()');
            if (!await waitFor(() => evaluate(`WP.stage.manager.stats.connects > ${connects}`), 3000)) record('no stream after resume');
            if (!await waitFor(() => evaluate(held), 5000)) return record('no stream to stop');
            await evaluate('WP.stage.manager.stop()');
            await sleep(2500);
            if (await evaluate('window.held.readyState !== 2 || WP.stage.manager.source !== null')) record('stream still open after stop()');
            return true;
        },
    },
};

async function main(only) {
    mkdirSync(SHOTS, { recursive: true });
    const withExtension = !only.length && !LIVE;
    if (withExtension && !existsSync(EXTENSION)) throw new Error('no dist/extension/: run `make extension` first (make smoke does)');
    const launched = await launch({ extension: withExtension ? EXTENSION : null });
    cdp = launched.cdp;
    try {
        listen();
        for (const domain of ['Page', 'Runtime', 'Log']) await cdp.send(`${domain}.enable`);
        await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
        await cdp.send('Page.navigate', { url: `${WEB}/stage.html?w=blank` });
        await waitFor(() => evaluate('WP.stage?.ready'));
        const catalog = await evaluate('WP.catalog.map(e => ({ id: e.id, pseudo: !!e.pseudo, disabled: e.disabled || null, network: !!e.network, offline: !!e.offline }))');
        NETWORK_HOSTS = await evaluate('[...new Set(WP.catalog.flatMap(e => Array.isArray(e.network) ? e.network : []))]');
        const ids = only.length ? only : catalog.filter(e => !e.pseudo).map(e => e.id);

        let failed = 0;
        console.log('stage              ready   drawn  result');
        for (const id of ids) {
            const entry = catalog.find(e => e.id === id);
            if (!entry) throw new Error(`unknown wallpaper ${id}`);
            const r = await stage(id, entry);
            const verdict = !r.problems.length ? '✓' : entry.disabled ? `– disabled: ${entry.disabled}` : '✗';
            if (verdict === '✗') failed++;
            console.log(`${id.padEnd(18)} ${String(r.readyMs).padStart(5)}ms ${String(r.drawn).padStart(6)}  ${verdict}`);
            if (verdict === '✗') for (const p of [...new Set(r.problems)]) console.log(`    ${p}`);
            failed += await stageChecks(id);
            if (EXTRA[id] && !LIVE) {
                const { check, failed: extra } = checker();
                for (const [name, fn] of Object.entries(EXTRA[id])) await check(`${id}: ${name}`, fn);
                failed += extra();
            }
        }
        if (!only.length) {
            console.log('player');
            failed += await playerSuite(catalog);
            if (withExtension) {
                console.log('extension');
                failed += await extensionSuite(launched.extensionId);
            }
        }
        const suites = only.length ? '' : withExtension ? ' + player + extension' : ' + player';
        console.log(failed ? `smoke ✗ ${failed} failed` : `smoke ✓ ${ids.length} stages${suites}${LIVE ? ` on ${LIVE}` : ''} · screenshots in dist/smoke/`);
        return failed ? 1 : 0;
    } finally {
        cdp.close();
        launched.chrome.kill();
        await sleep(200);
        rmSync(launched.profile, { recursive: true, force: true });
    }
}

process.exitCode = await main(process.argv.slice(2));
