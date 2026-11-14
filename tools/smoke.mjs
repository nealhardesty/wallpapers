#!/usr/bin/env node
// Smoke test, in headless Chrome over the DevTools protocol (Node's built-in
// WebSocket, no deps), against the real pages on file://.
//
//   node tools/smoke.mjs                 everything
//   node tools/smoke.mjs fishtank quest  just these stages (skips the player suite)
//   node tools/smoke.mjs clock            just the clock overlay's checks (SPEC §4.9)
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
import { createMock, ITEMS, MOCK_ORIGIN, MOCK_USER, QUICK_CODE } from './jellyfin-mock.mjs';

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

// Weather's forecast, made up, in Open-Meteo's shape: ten days from today
// (UTC) at a made-up place, every kind of weather across the days and
// hours, rain right now. `bad` is an answer that isn't a forecast.
const WEATHER_PLACE = { lat: 1.5, lon: 2.5, label: 'Fixtureville', source: 'typed' };
function weatherJson(bad) {
    if (bad) return { error: true, reason: 'Fixture: not a forecast' };
    const DAY = 86400000, HOUR = 3600000, at = Date.now(), start = Math.floor(at / DAY) * DAY;
    const iso = ms => new Date(ms).toISOString().slice(0, 16);
    const DAYS = [61, 95, 71, 0, 45, 2, 3, 51, 66, 96];
    const HOURS = [0, 1, 2, 3, 45, 51, 56, 61, 65, 71, 75, 80, 85, 95, 96];
    const hourly = { time: [], temperature_2m: [], apparent_temperature: [], precipitation_probability: [], precipitation: [], weather_code: [], is_day: [], wind_speed_10m: [] };
    const daily = { time: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [], precipitation_probability_max: [], precipitation_sum: [], snowfall_sum: [], sunrise: [], sunset: [], uv_index_max: [], wind_speed_10m_max: [] };
    for (let d = 0; d < 10; d++) {
        const t0 = start + d * DAY, hi = 12 + (d * 5) % 9, lo = hi - 7, wet = DAYS[d] >= 51;
        daily.time.push(iso(t0).slice(0, 10)); daily.weather_code.push(DAYS[d]);
        daily.temperature_2m_max.push(hi); daily.temperature_2m_min.push(lo);
        daily.precipitation_probability_max.push(wet ? 55 + d * 4 : 10); daily.precipitation_sum.push(wet ? 4.2 : 0);
        daily.snowfall_sum.push(DAYS[d] === 71 ? 3.1 : 0);
        daily.sunrise.push(iso(t0 + 6.75 * HOUR)); daily.sunset.push(iso(t0 + 17.5 * HOUR));
        daily.uv_index_max.push(3 + d % 5); daily.wind_speed_10m_max.push(14 + d * 2);
        for (let h = 0; h < 24; h++) {
            const temp = lo + (hi - lo) * Math.max(0, Math.sin((h - 6) / 24 * 2 * Math.PI));
            hourly.time.push(iso(t0 + h * HOUR)); hourly.temperature_2m.push(Math.round(temp * 10) / 10);
            hourly.apparent_temperature.push(Math.round((temp - 2) * 10) / 10);
            hourly.precipitation_probability.push(wet ? (h * 13) % 90 : (h * 7) % 20); hourly.precipitation.push(wet ? 0.3 : 0);
            hourly.weather_code.push(HOURS[(d + Math.floor(h / 3)) % HOURS.length]);
            hourly.is_day.push(h >= 7 && h < 18 ? 1 : 0); hourly.wind_speed_10m.push(10 + h % 7);
        }
    }
    const hour = new Date(at).getUTCHours();
    return {
        latitude: 1.5, longitude: 2.5, timezone: 'GMT', utc_offset_seconds: 0,
        current: { time: iso(Math.floor(at / HOUR) * HOUR), temperature_2m: 9.4, apparent_temperature: 6.8, relative_humidity_2m: 82, weather_code: 63,
            is_day: hour >= 7 && hour < 18 ? 1 : 0, wind_speed_10m: 18, wind_direction_10m: 225, precipitation: 0.6 },
        hourly, daily,
    };
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
// `marine` picks Lighthouse's fixture; `forecast: 'bad'` makes Weather's not a
// forecast; `hold` keeps Wiki Pond's stream open;
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
    // So are a fixture server's deliberate 503s.
    // A declared service failing (offline, a fixture 503, or on the live run the real service having a bad
    // moment, as celestrak.org does) is the wallpaper's offline case, which its checks cover; not a failure.
    const outage = e => e.source === 'network' && declared(e.url || '');
    cdp.on('Log.entryAdded', ({ entry: e }) => e.level === 'error' && !((current.offline || current.forecast === '503') && (e.source === 'network' || declared(e.url || ''))) && !(LIVE && outage(e)) && record(`log: ${e.text} ${e.url || ''}`));
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
        // Open-Meteo down (503), or slow (an answer held back: the first fetch stays on its way).
        if (current.network && current.forecast === '503' && url.startsWith('https://api.open-meteo.com/v1/forecast?')) return reply('Fetch.fulfillRequest', { requestId, responseCode: 503, body: '', responseHeaders: [{ name: 'Access-Control-Allow-Origin', value: '*' }] });
        if (current.network && current.forecast === 'hold' && url.startsWith('https://api.open-meteo.com/v1/forecast?')) return;
        if (current.network && url.startsWith('https://api.open-meteo.com/v1/forecast?')) return fulfil(Buffer.from(JSON.stringify(weatherJson(current.forecast === 'bad'))), 'application/json');
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
                responseHeaders: [...Object.entries(answer.headers || {}).map(([name, value]) => ({ name, value })), { name: 'Content-Type', value: answer.type }, { name: 'Access-Control-Allow-Origin', value: '*' },
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
    // Cherry Blossoms: a tree with blossom and petals in the air on frame
    // one; petals land on the grass (the pile grows) and float on water; a
    // gust comes when called and shakes petals loose; a tap on the bough
    // shakes it; S changes the sky and N the tree.
    'cherry-blossoms': [['a bough on frame one, petals in the air and landing, a gust, a tap, the sky and a new tree', async () => {
        const st = () => evaluate('JSON.parse(JSON.stringify(WP.stage.manager.debugState()))');
        if (!await stageWith('cherry-blossoms', { configVersion: 2, gusts: 0 }, '&seed=7')) return record('no boot');
        let s = await st();
        if (!s.tree || s.tree.limbs < 8 || s.tree.clusters < 20 || s.petals < 100 || s.states.falling < 100) record(`frame one: ${JSON.stringify(s)}`);
        const avg = await evaluate(AVERAGE);
        if (!(avg[0] > 120 && avg[2] > 120)) record(`not a pale spring sky on frame one: ${avg}`);
        await sleep(4000);
        s = await st();
        if (s.stats.settled < 5) record(`only ${s.stats.settled} petals landed in four seconds`);
        if (s.wind.phase !== 'calm' || s.stats.gusts) record(`gusts with none asked for: ${JSON.stringify(s.wind)}`);
        await shoot('cherry-blossoms-day');
        // G: a gust, which shakes petals loose (more in the air than the setting).
        const before = s.petals;
        await press('g');
        if (!await waitFor(async () => (s = await st()).wind.phase !== 'calm', 1000)) record(`G: ${JSON.stringify(s.wind)}`);
        await sleep(1500);
        s = await st();
        if (s.wind.strength < 2) record(`the gust is feeble: ${JSON.stringify(s.wind)}`);
        // A tap on the bough: a flurry (more petals than the target for a while).
        const cl = await evaluate('(m => m.tree.clusters[Math.floor(m.tree.clusters.length / 2)])(WP.stage.manager)');
        await mouse('mousePressed', cl.x, cl.y);
        await mouse('mouseReleased', cl.x, cl.y);
        await sleep(300);
        s = await st();
        if (s.stats.flurries < 1 || s.petals <= s.target) record(`a tap on the bough shook nothing loose: ${JSON.stringify({ flurries: s.stats.flurries, petals: s.petals, target: s.target, before })}`);
        // S: the sky moves on to dusk; N: a new tree.
        await press('s');
        s = await st();
        if (s.sky !== 'dusk' || !(s.light < 1)) record(`S: ${JSON.stringify({ sky: s.sky, light: s.light })}`);
        const seed = s.seed;
        await press('n');
        s = await st();
        if (s.seed === seed || !s.tree || s.tree.clusters < 20) record(`N grew no new tree: ${JSON.stringify({ seed, now: s.seed, tree: s.tree })}`);
        await shoot('cherry-blossoms-dusk');
        // Water: petals float, with ripples where they land.
        if (!await stageWith('cherry-blossoms', { configVersion: 2, gusts: 0, ground: 'water', sky: 'night' }, '&seed=7')) return record('no boot on water');
        await sleep(4000);
        s = await st();
        if (!(s.states.afloat > 0)) record(`nothing afloat after four seconds on water: ${JSON.stringify(s.states)}`);
        const night = await evaluate(AVERAGE);
        if (!(night[0] + night[1] + night[2] < 330)) record(`not dark at night: ${night}`);
        await shoot('cherry-blossoms-night-water');
        return true;
    }]],
    // Matrix: the film's code. Frame one is full of it (intro off); the
    // symbols sit in fixed cells and only the light moves (a lit cell's
    // glyph index stays until the symbol clock changes it); it paces itself
    // at the fps setting; L changes the look, C the colour; a tap splashes
    // bright-headed strings round it; Low runs one layer.
    matrix: [['code on frame one in fixed cells, paced at 30 fps, L and H, a tap splashes, one layer on Low', async () => {
        const st = () => evaluate('JSON.parse(JSON.stringify(WP.stage.manager.debugState()))');
        if (!await stageWith('matrix', { configVersion: 2, intro: false, cycle: 0, stutter: false }, '&seed=7')) return record('no boot');
        let s = await st();
        if (s.look !== 'operator' || s.layers !== 2 || s.drops < 30 || s.bright < 3 || s.cols < 40) record(`frame one: ${JSON.stringify(s)}`);
        const avg = await evaluate(AVERAGE);
        if (!(avg[1] > avg[0] + 10 && avg[1] > avg[2] + 10) || avg[1] < 8) record(`not green code on frame one: ${avg}`);
        // The symbols stay put: with the symbol clock off, a cell's glyph is the same a second later.
        const cellsBefore = await evaluate('(m => Array.from(m.layers[1].glyphs.slice(0, 400)))(WP.stage.manager)');
        const before = await evaluate('WP.host.frames.count');
        await sleep(2000);
        const frames = await evaluate('WP.host.frames.count') - before;
        if (frames < 45 || frames > 75) record(`${frames} frames in two seconds (want about 60 at 30 fps)`);
        const cellsAfter = await evaluate('(m => Array.from(m.layers[1].glyphs.slice(0, 400)))(WP.stage.manager)');
        if (cellsBefore.join() !== cellsAfter.join()) record('symbols changed in place with the symbol clock off');
        s = await st();
        if (!(s.time > 13)) record(`the rain hasn't been running: ${JSON.stringify(s)}`);
        await shoot('matrix-operator');
        // L: the next look; C: the next colour.
        await press('l');
        if ((await st()).look !== 'classic') record(`L: ${JSON.stringify(await st())}`);
        await press('h');
        if ((await st()).colour !== 'amber') record(`H: ${JSON.stringify(await st())}`);
        await sleep(300);
        const amber = await evaluate(AVERAGE);
        if (!(amber[0] > amber[2] + 8)) record(`amber isn't warm: ${amber}`);
        await shoot('matrix-classic-amber');
        // A tap: bright-headed strings from that row in the seven columns
        // round it (counted as they start: strings leaving the bottom
        // meanwhile would make a net count flaky on a slow runner).
        await mouse('mousePressed', 400, 300);
        await mouse('mouseReleased', 400, 300);
        await sleep(200);
        s = await st();
        if (s.splashed !== 7) record(`a tap started ${s.splashed} bright strings (want seven)`);
        // Low: one layer, no bloom.
        if (!await stageWith('matrix', { configVersion: 2, intro: false }, '&seed=7&tier=low')) return record('no boot on Low');
        s = await st();
        if (s.layers !== 1) record(`Low runs ${s.layers} layers`);
        return true;
    }]],
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
    // Neko: the cats are the original 32 px art; with no pointer at all
    // (a phone) they set off on their own once Wander After has passed; a
    // crowd never stacks up; a tapped ball of yarn is chased, batted and
    // finally knocked off the screen, and the cats go back to idling; the
    // date brings the holiday's hats.
    neko: [
        ['the original art; no pointer, and the cat goes exploring', async () => {
            if (!await stageWith('neko', { configVersion: 2, wanderAfter: 5000 })) return record('never ready');
            const cat = `(m => ({ x: m.cats[0].x, y: m.cats[0].y, state: m.cats[0].state, art: m.cats[0].look.frames[0].mati2.width, frames: Object.keys(m.cats[0].look.frames[0]).length }))(WP.stage.manager)`;
            const start = await evaluate(cat);
            if (start.art !== 32 || start.frames !== 32) record(`sprites: ${start.frames} frames of ${start.art} px, not 32 of 32`);
            let ran = false;
            await waitFor(async () => (ran ||= (await evaluate(cat)).state === 3), 9000);
            await sleep(1500);
            const end = await evaluate(cat);
            const moved = Math.hypot(end.x - start.x, end.y - start.y);
            if (!ran || moved < 50) record(`with no pointer the cat stayed put: ran ${ran}, moved ${Math.round(moved)} px`);
            console.log(`    neko: wandered ${Math.round(moved)} px with no pointer`);
            return true;
        }],
        ['42 cats chase the pointer without piling up', async () => {
            if (!await stageWith('neko', { configVersion: 2, cats: 42, coat: 'assorted', hat: 'assorted', size: 32 })) return record('never ready');
            for (let i = 0; i <= 30; i++) {
                await mouse('mouseMoved', 300 + i * 20, 250 + i * 6);
                await sleep(80);
            }
            await sleep(2500);
            const look = () => evaluate(`(m => ({ n: m.cats.length, coats: new Set(m.cats.map(c => c.look.coat.name)).size, hats: m.cats.filter(c => c.hat).length,
                closest: Math.min(...m.cats.flatMap((a, i) => m.cats.slice(i + 1).map(b => Math.hypot(a.x - b.x, a.y - b.y)))),
                near: m.cats.filter(c => Math.hypot(c.x - 900, c.y - 430) < 32 * 5).length }))(WP.stage.manager)`);
            // A pile-up lasts; two of 861 pairs brushing past each other for a frame
            // (common on a slow CI runner) doesn't. So: closest over five looks a
            // fifth of a second apart, and only "always too close" fails.
            const looks = [];
            for (let i = 0; i < 5; i++) { looks.push(await look()); await sleep(200); }
            const crowd = { ...looks.at(-1), closest: Math.max(...looks.map(l => l.closest)) };
            if (crowd.n !== 42 || crowd.coats !== 13 || crowd.hats !== 42) record(`${crowd.n} cats, ${crowd.coats} coats, ${crowd.hats} hats`);
            if (crowd.closest < 32 * 0.45) record(`two cats ${crowd.closest.toFixed(1)} px apart in every look: piled up`);
            if (crowd.near < 30) record(`only ${crowd.near} of 42 cats made it to the pointer`);
            console.log(`    neko: ${crowd.near} of 42 round the pointer, the closest two ${crowd.closest.toFixed(1)} px apart`);
            return true;
        }],
        ['a tapped ball of yarn is batted about, knocked off the screen, and the cats idle', async () => {
            if (!await stageWith('neko', { configVersion: 2, cats: 3 })) return record('never ready');
            await mouse('mousePressed', 640, 400);
            await mouse('mouseReleased', 640, 400);
            if (!await waitFor(() => evaluate('WP.stage.manager.yarns.length === 1'), 2000)) return record('a tap tossed no yarn');
            // A short-lived ball, so the test doesn't wait on a long game.
            await evaluate('WP.stage.manager.yarns[0].last = 3');
            let most = 0;
            const gone = await waitFor(async () => {
                const state = await evaluate('(m => ({ yarns: m.yarns.length, hits: m.yarns[0]?.hits ?? -1 }))(WP.stage.manager)');
                most = Math.max(most, state.hits);
                return state.yarns === 0;
            }, 20000);
            if (!gone) record(`the yarn never left: ${most} hits`);
            if (most < 2) record(`only ${most} hits before it went`);
            await sleep(1500);
            const after = await evaluate(`(m => ({ goals: m.cats.filter(c => c.goal).length, threads: m.threads.length }))(WP.stage.manager)`);
            if (after.goals) record(`${after.goals} cats still chasing after the yarn left`);
            if (!after.threads) record('no thread left on the floor');
            console.log(`    neko: yarn batted ${most} times, then gone; the cats idle; its thread fading`);
            return true;
        }],
        ['the date brings the holiday hats', async () => {
            const hats = async date => {
                await stageWith('neko', { configVersion: 2, cats: 2 }, `&date=${date}`);
                return evaluate(`WP.stage.manager.cats.map(c => Object.keys(WP.stage.manager.hats).find(k => WP.stage.manager.hats[k] === c.hat) ?? null).join()`);
            };
            const halloween = await hats('2026-10-31T12:00'), christmas = await hats('2026-12-24T12:00'), june = await hats('2026-06-10T12:00');
            if (halloween !== 'witch,witch') record(`Halloween: ${halloween}`);
            if (christmas !== 'santa,antlers') record(`Christmas Eve: ${christmas}`);
            if (june !== ',') record(`an ordinary day: ${june}`);
            return true;
        }],
    ],
    // Fireplace: the wood is baked before the first frame, with char that
    // glows in zones, a coal bed and the grate; a pop flashes the zone it
    // bursts from and then lets it go; and the glow breathes on its own.
    fireplace: [['the stacks and the pieces; L drops a log and lands a fresh one that steams; W lays the wood again', async () => {
        if (!await stageWith('fireplace', { configVersion: 2, stack: 'cabin', pieces: ['rounds', 'splits', 'sticks', 'snapped', 'punky'], logCount: 6, burn: 'cycle', burnMinutes: 5 }, '&seed=7')) return record('no boot with a cabin');
        let s = await evaluate('(m => ({ logs: m.logs.length, endOn: m.logs.filter(l => l.endOn).length, sticks: m.logs.filter(l => l.kind === "stick" || l.kind === "twig").length, level: m.level }))(WP.stage.manager)');
        if (s.logs < 10 || !s.endOn || !s.sticks || !(s.level > 0.95)) record(`the cabin: ${JSON.stringify(s)}`);
        await shoot('fireplace-cabin');
        await press('l');
        await sleep(900);
        s = await evaluate('(m => ({ logs: m.logs.length, stats: m.stats, fresh: !!m.fresh, dropping: m.logs.filter(l => l.drop).length, steam: m.smoke.filter(p => p.steam).length, phase: m.burn.phase }))(WP.stage.manager)');
        if (s.stats.freshLogs !== 1 || s.stats.collapses !== 1 || !s.fresh || s.phase !== 'catching' || s.steam < 1) record(`L: ${JSON.stringify(s)}`);
        await press('w');
        s = await evaluate('(m => ({ stack: m.config.stack, logs: m.logs.length }))(WP.stage.manager)');
        if (s.stack !== 'teepee') record(`W: ${JSON.stringify(s)}`);
        return true;
    }], ['wood, coals and iron baked by frame one; a pop flashes its zone; the glow breathes', async () => {
        await cdp.send('Page.navigate', { url: `${WEB}/stage.html?w=fireplace&seed=7` });
        await waitFor(() => evaluate('WP.stage?.ready === true'));
        const first = await evaluate(`(m => ({ frames: WP.host.frames.count, logs: m.logs.length,
            baked: m.logs.filter(l => l.art && l.art.zones.length >= 2).length,
            hot: m.logs.filter(l => l.hotPoints.length > 0).length,
            species: [...new Set(m.logs.map(l => l.species))], cuts: [...new Set(m.logs.map(l => l.cut))],
            tiles: m.bedArt ? m.bedArt.tiles.length : 0, chunks: m.bed ? m.bed.chunks.length : 0, iron: !!m.iron }))(WP.stage.manager)`);
        if (first.frames > 10) record(`the first frame came at ${first.frames}`);
        if (first.baked !== first.logs || first.logs < 4) record(`not every log baked: ${JSON.stringify(first)}`);
        if (first.hot < first.logs / 2) record(`hardly any log glows: ${first.hot} of ${first.logs}`);
        if (first.tiles < 6 || first.chunks < 100 || !first.iron) record(`no coal bed or grate: ${JSON.stringify(first)}`);
        const popped = await evaluate(`(m => { m.triggerPop(); const b = m.popBursts[m.popBursts.length - 1]; return b ? b.zone.index : -1; })(WP.stage.manager)`);
        await sleep(120);
        const flash = await evaluate('Math.max(...WP.stage.manager.logs.flatMap(l => l.zones.map(z => z.pop)))');
        await sleep(900);
        const after = await evaluate('Math.max(...WP.stage.manager.logs.flatMap(l => l.zones.map(z => z.pop)))');
        if (popped < 0 || flash < 0.2) record(`a pop didn't flash its zone: zone ${popped}, pop ${flash}`);
        if (after !== 0) record(`a pop's flash never settled: ${after}`);
        // The glow breathes: a zone's warmth over two seconds isn't constant
        const pulse = 'WP.stage.manager.sampleNoise(1.1 - WP.stage.manager.elapsed * 0.12, WP.stage.manager.elapsed * 0.35 + WP.stage.manager.logs[0].zones[1].seed)';
        const samples = [];
        for (let i = 0; i < 8; i++) {
            samples.push(await evaluate(pulse));
            await sleep(250);
        }
        if (Math.max(...samples) - Math.min(...samples) < 0.02) record(`the glow didn't breathe: ${samples.map(s => s.toFixed(2))}`);
        console.log(`    fireplace: ${first.logs} logs (${first.species.join(', ')}; ${first.cuts.join(', ')}), ${first.chunks} coals in ${first.tiles} tiles; a pop flashed zone ${popped} to ${flash.toFixed(2)}`);
        return true;
    }]],
    // Harvest Valley: alive on the first frame; a tap shakes a tree and
    // apples fall; a squirrel carries one to its door; the Great Pumpkin
    // rises only at night; and every part can be left out.
    harvest: [['lost canvases are baked again; a window with no size yet waits for one', async () => {
        await cdp.send('Page.navigate', { url: `${WEB}/stage.html?w=harvest&seed=7&date=2026-11-24T15:00` });
        await waitFor(() => evaluate('WP.stage?.ready === true'));
        const probe = `(m => { const g = m.land.getContext('2d', { willReadFrequently: true }); return g.getImageData(Math.floor(m.land.width / 2), m.land.height - 1, 1, 1).data[3]; })(WP.stage.manager)`;
        if (await evaluate(probe) === 0) record('the land is transparent at the bottom (the loss probe would never fire)');
        // The drill: wipe every baked layer and sprite, as a lost GPU process does.
        await evaluate(`(m => { for (const c of [m.land, m.starLayer, ...m.sprites.trees, ...m.sprites.apples, ...m.sprites.leaves, m.sprites.mist, m.sprites.smoke]) if (c && c.getContext) c.getContext('2d').clearRect(0, 0, c.width, c.height); m.lastBakeCheck = m.time - 10; })(WP.stage.manager)`);
        if (!await waitFor(() => evaluate('WP.stage.manager.recoveries === 1'), 3000)) return record('blank layers were not noticed');
        if (await evaluate(probe) === 0) record('baked again, but the land is still blank');
        const cast = await evaluate(`(m => [...m.squirrels, ...m.turkeys, ...m.cats].every(o => Number.isFinite(o.x) && Number.isFinite(o.y)))(WP.stage.manager)`);
        if (!cast) record('the cast lost its places in the recovery');
        await shoot('harvest-recovered');
        // A window reporting no size: no layout, no frame, no error; the real size later lays it out and seeds it.
        await cdp.send('Page.navigate', { url: `${WEB}/stage.html?w=blank` });
        await waitFor(() => evaluate('WP.stage?.ready === true'));
        const sizeless0 = `Object.defineProperty(window, 'innerWidth', { value: 0, configurable: true }); Object.defineProperty(window, 'innerHeight', { value: 0, configurable: true }); 0`;
        const { identifier } = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: sizeless0 });
        await cdp.send('Page.navigate', { url: `${WEB}/stage.html?w=harvest&seed=7&date=2026-11-24T15:00` });
        await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
        await sleep(1500);
        const sizeless = await evaluate(`(m => m ? { L: !!m.L, seeded: m.seeded, running: m.running } : null)(WP.stage.manager)`);
        if (!sizeless || sizeless.L || sizeless.seeded) record(`laid out a window with no size: ${JSON.stringify(sizeless)}`);
        // (Deleting the stub leaves no getter at all: the real size goes back the same way.)
        await evaluate(`Object.defineProperty(window, 'innerWidth', { value: document.documentElement.clientWidth, configurable: true }); Object.defineProperty(window, 'innerHeight', { value: document.documentElement.clientHeight, configurable: true }); window.dispatchEvent(new Event('resize')); 0`);
        await sleep(800);
        const sized = await evaluate(`(m => ({ L: !!m.L, seeded: m.seeded, finite: [...m.squirrels, ...m.turkeys, ...m.cats, ...m.apples].every(o => Number.isFinite(o.x) && Number.isFinite(o.y)), W: m.W }))(WP.stage.manager)`);
        if (!sized.L || !sized.seeded || !sized.finite || sized.W < 100) record(`the size came and it didn't lay out: ${JSON.stringify(sized)}`);
        // Clean up for the stages after this one.
        await cdp.send('Page.navigate', { url: `${WEB}/stage.html?w=blank` });
        await waitFor(() => evaluate('WP.stage?.ready === true'));
        return true;
    }], ['the cast is there on frame one, and a tap shakes a tree loose', async () => {
        await cdp.send('Page.navigate', { url: `${WEB}/stage.html?w=harvest&seed=7&date=2026-11-24T15:00` });
        await waitFor(() => evaluate('WP.stage?.ready === true'));
        const first = await evaluate(`(m => ({ frames: WP.host.frames.count, leaves: m.leafPool.length, resting: m.apples.filter(a => a.state === 'rest').length,
            flocks: m.flocks.flocks.length, squirrels: m.squirrels.length, turkeys: m.turkeys.length, cats: m.cats.length, trees: m.trees.length, houses: m.L.houses.length }))(WP.stage.manager)`);
        if (first.frames > 10) record(`the first frame came at ${first.frames}`);
        if (first.leaves < 20 || first.resting < 3 || first.flocks < 1) record(`not alive on frame one: ${JSON.stringify(first)}`);
        if (first.squirrels < 1 || first.turkeys < 1 || first.cats !== 2 || first.trees < 6 || first.houses < 3) record(`the cast is missing: ${JSON.stringify(first)}`);
        // The apples already about are marked, so the count is of new ones (others are
        // collected and fade meanwhile), and the tree tapped is one with ripe apples
        // left (the breeze may have taken them all from any given tree).
        const before = await evaluate('(m => { for (const a of m.apples) a.smokeOld = true; return m.apples.length; })(WP.stage.manager)');
        const at = await evaluate(`(m => { const t = [...m.trees].sort((a, b) => b.hang.filter(h => h.ripe >= 0.55).length - a.hang.filter(h => h.ripe >= 0.55).length)[0],
            c = m.sprites.trees[t.variant].canopy; return { x: t.x + c.cx * t.s, y: t.y + c.cy * t.s }; })(WP.stage.manager)`);
        await mouse('mousePressed', at.x, at.y);
        await mouse('mouseReleased', at.x, at.y);
        await sleep(350);
        if (!await evaluate('WP.stage.manager.trees.some(t => t.shake > 0.3)')) record('the tap shook no tree');
        // The drops are timed in the wallpaper's own seconds, which a slow runner's
        // clamped frames stretch: wait for them in real time, up to 5 s.
        const newApples = () => evaluate('WP.stage.manager.apples.filter(a => !a.smokeOld && a.type === "apple").length');
        await waitFor(async () => await newApples() > 0, 5000);
        const after = before + await newApples();
        if (after <= before) record(`no apples fell: ${before} before, none new after 5 s`);
        console.log(`    harvest: ${first.leaves} leaves, ${first.resting} apples down, ${first.flocks} flock, ${first.squirrels} squirrels, ${first.turkeys} turkeys, ${first.cats} cats on frame ${first.frames}; a tap: ${before} → ${after} apples`);
        return true;
    }], ['several flocks can cross at once, with a few stragglers behind', async () => {
        await cdp.send('Page.navigate', { url: `${WEB}/stage.html?w=harvest&seed=9&date=2026-11-24T14:00` });
        await waitFor(() => evaluate('WP.stage?.ready === true'));
        const r = await evaluate(`(f => {
            const a = f.spawn(0.3, { n: 24 }), b = f.spawn(0.1, { n: 18 }), tail = f.straggle(a);
            return { flocks: f.flocks.length, cap: f.cap(), n: tail.n, dir: a.dir, behind: a.dir * (a.x - tail.x), sameWay: tail.dir === a.dir, big: a.n, other: b.n };
        })(WP.stage.manager.flocks)`);
        if (r.flocks < 3) record(`only ${r.flocks} flocks at once`);
        if (r.n < 1 || r.n > 3 || !r.sameWay) record(`stragglers: ${JSON.stringify(r)}`);
        if (r.behind <= 0) record(`the stragglers aren't behind their flock (${Math.round(r.behind)} px)`);
        // A minute and a half of flying, many flocks of every size and shape, as
        // wild as they come (gusts, dodges, whiffles): none dips behind the hills.
        const low = await evaluate(`(m => {
            const f = m.flocks, ridge = m.L.hz - m.L.Hu * 0.157;
            m.config.irregularity = 2;
            for (let i = 0; i < 36; i++) f.spawn(Math.random(), { n: [3, 8, 15, 30, 60, 100][i % 6], type: ['v', 'line', 'ragged'][i % 3] });
            let lowest = -1e9, worst = null;
            for (let step = 0; step < 900; step++) {
                if (step % 60 === 0) m.gust = 2;
                for (const fl of f.flocks) if (step % 25 === 0 && fl.n >= 3) f.whiffle(fl, fl.bySlot[fl.n - 1], true);
                f.update(0.1);
                m.gust = Math.max(0, m.gust - 0.035);
                for (const fl of f.flocks) for (const b of fl.birds) {
                    const y = f.pos(fl, b).y + fl.len * 0.5;     // where it's drawn, its lowest wingtip
                    if (y > lowest) { lowest = y; worst = { n: fl.n, type: fl.type }; }
                }
            }
            return { lowest, ridge, worst };
        })(WP.stage.manager)`);
        if (low.lowest > low.ridge) record(`a goose flew down to ${Math.round(low.lowest)}, behind the hills (the ridge is at ${Math.round(low.ridge)}): ${JSON.stringify(low.worst)}`);
        return true;
    }], ['geese are each their own bird: wingbeats drift and lock, they dodge and whiffle, and 0 is a drilled V', async () => {
        await cdp.send('Page.navigate', { url: `${WEB}/stage.html?w=harvest&seed=11&date=2026-11-24T14:00` });
        await waitFor(() => evaluate('WP.stage?.ready === true'));
        const r = await evaluate(`(m => {
            const F = m.flocks, wrap = d => d - Math.round(d);
            m.config.irregularity = 1;
            F.flocks = [];
            const f = F.spawn(0.2, { n: 15, type: 'v' });
            f.nextGlide = 1e9;
            // How far each goose is from a beat behind the one ahead: tracked over a minute.
            let maxSlip = 0, sumSlip = 0, samples = 0, maxStray = 0, rolled = 0, flipped = false;
            for (let i = 0; i < 600; i++) {
                if (i === 300) F.whiffle(f, f.bySlot[3], false);
                F.update(0.1);
                for (const b of f.birds) {
                    if (b.roll >= 0) rolled++;
                    if (b.slot === 0 || b.gliding) continue;
                    const a = f.bySlot[f.ahead[b.slot]];
                    if (a.gliding) continue;
                    const slip = Math.abs(wrap(a.phase - (f.ranks[b.slot] - f.ranks[a.slot]) * 0.07 - b.phase));
                    maxSlip = Math.max(maxSlip, slip); sumSlip += slip; samples++;
                    maxStray = Math.max(maxStray, Math.hypot(b.px - b.ox * f.bx, b.py - b.oy * f.by) / f.len);
                }
            }
            const rates = f.birds.map(b => b.dev);
            // A drilled V: no wander, no dodges, every goose on its slot and in step.
            m.config.irregularity = 0;
            F.flocks = [];
            const g = F.spawn(0.2, { n: 15, type: 'v' });
            g.nextGlide = 1e9; g.turn = 1e9;
            let tidyStray = 0, tidySlip = 0;
            for (let i = 0; i < 600; i++) {
                F.update(0.1);
                if (i < 100) continue;
                for (const b of g.birds) {
                    tidyStray = Math.max(tidyStray, Math.hypot(b.px - b.ox, b.py - b.oy) / g.len);
                    if (!b.slot) continue;
                    const a = g.bySlot[g.ahead[b.slot]];
                    tidySlip = Math.max(tidySlip, Math.abs(wrap(a.phase - (g.ranks[b.slot] - g.ranks[a.slot]) * 0.07 - b.phase)));
                }
            }
            m.config.irregularity = 1;
            return { spread: Math.max(...rates) - Math.min(...rates), maxSlip, meanSlip: sumSlip / samples, maxStray, rolled, tidyStray, tidySlip };
        })(WP.stage.manager)`);
        if (r.spread < 0.04) record(`the geese share one wingbeat rate (spread ${r.spread.toFixed(3)})`);
        if (r.maxSlip < 0.15) record(`the wingbeats never drift out of step (max slip ${r.maxSlip.toFixed(3)} of a beat)`);
        if (r.meanSlip > 0.2) record(`the wingbeats never lock back in (mean slip ${r.meanSlip.toFixed(3)} of a beat)`);
        if (r.maxStray < 0.2) record(`the geese sit rigidly in their places (max stray ${r.maxStray.toFixed(2)} body-lengths)`);
        if (r.rolled < 5) record('a goose was told to whiffle and never rolled over');
        if (r.tidyStray > 0.15 || r.tidySlip > 0.02) record(`at irregularity 0 the V isn't drilled: stray ${r.tidyStray.toFixed(2)}, slip ${r.tidySlip.toFixed(3)}`);
        console.log(`    harvest geese: rates spread ${(r.spread * 100).toFixed(1)}%, slip ${r.meanSlip.toFixed(2)} mean / ${r.maxSlip.toFixed(2)} max of a beat, stray up to ${r.maxStray.toFixed(2)} lengths; at 0: ${r.tidyStray.toFixed(3)}, ${r.tidySlip.toFixed(3)}`);
        return true;
    }], ['a squirrel carries an apple off the edge of the screen, and never jumps', async () => {
        // No apples or acorns of their own falling meanwhile, so the squirrel has only the one.
        if (!await stageWith('harvest', { configVersion: 1, apples: 0, acorns: 0 }, '&seed=8&date=2026-11-24T15:00')) return record('no boot');
        await evaluate(`(m => {
            const s = m.squirrels[0], y = (m.meadowMin + m.meadowMax) / 2;
            window.__apple = { x: m.W - 110, y, h: 0, vh: 0, vx: 0, type: 'apple', kind: 0, state: 'rest', age: 0, bounces: 3, claimed: false, carried: null, spin: 0, fade: 1 };
            m.apples = [window.__apple];
            m.squirrels.forEach((q, i) => { q.state = 'sit'; q.apple = null; q.wait = i ? 1e6 : 0; });
            s.x = m.W - 150; s.y = y;
            window.__eaten = s.eaten;     // the warm-up may already have had it carry something
        })(WP.stage.manager)`);
        const seen = new Set();
        let last = null, jump = 0;
        const done = await waitFor(async () => {
            const now = await evaluate(`(m => ({ x: m.squirrels[0].x, y: m.squirrels[0].y, state: m.squirrels[0].state, apple: window.__apple.state, w: m.W }))(WP.stage.manager)`);
            seen.add(now.state); seen.add(now.apple);
            // Continuous on screen: it never leaps while it can be seen.
            if (last && last.x > 0 && last.x < now.w && now.x > 0 && now.x < now.w) jump = Math.max(jump, Math.hypot(now.x - last.x, now.y - last.y));
            last = now;
            return now.apple === 'gone';
        }, 45000);     // one in seven times a squirrel wanders off first (to the far side of the meadow and back)
        if (!done) return record(`the apple never left (states: ${[...seen]})`);
        if (!seen.has('carried') || !seen.has('carry')) record(`it wasn't carried (states: ${[...seen]})`);
        if (jump > 90) record(`the squirrel jumped ${Math.round(jump)} px on screen`);
        if (await evaluate('WP.stage.manager.squirrels[0].eaten - window.__eaten') !== 1) record('the squirrel kept no count');
        // A resize doesn't replace the animals.
        const before = await evaluate('WP.stage.manager.squirrels[0] === (window.__s = WP.stage.manager.squirrels[0]) && WP.stage.manager.cats.length + WP.stage.manager.turkeys.length');
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 650, deviceScaleFactor: 1, mobile: false });
        await sleep(500);
        if (!await evaluate('WP.stage.manager.squirrels[0] === window.__s')) record('a resize replaced the squirrels');
        if (await evaluate('WP.stage.manager.cats.length + WP.stage.manager.turkeys.length') !== before) record('a resize changed the cats and turkeys');
        await cdp.send('Emulation.clearDeviceMetricsOverride');
        await sleep(300);
        // It comes back in from an edge, not out of thin air.
        // (Judged by where it came in, not where it is by the time a slow runner looks.)
        let returned = false, edgeEntry = false, prev = null;
        await waitFor(async () => {
            const q = await evaluate(`(m => ({ entry: m.squirrels[0].entryX, entryW: m.squirrels[0].entryW, state: m.squirrels[0].state }))(WP.stage.manager)`);
            if (prev && prev.state === 'away' && q.state !== 'away') { returned = true; edgeEntry = q.entry < 0 || q.entry > q.entryW; }
            prev = q;
            return returned;
        }, 40000);
        if (!returned) record('it never came back');
        else if (!edgeEntry) record('it came back from somewhere other than offscreen');
        return true;
    }], ['a cat chases a squirrel off the screen, comes back, and naps', async () => {
        if (!await stageWith('harvest', { configVersion: 1, apples: 0, acorns: 0, cats: 1 }, '&seed=8&date=2026-11-24T15:00')) return record('no boot');
        // One squirrel sitting in the meadow, the rest away; the cat on the ground.
        await evaluate(`(m => {
            const y = (m.meadowMin + m.meadowMax) / 2, c = m.cats[0];
            m.squirrels.forEach((q, i) => { q.drop(); q.state = i ? 'away' : 'sit'; q.wait = 1e6; });
            Object.assign(m.squirrels[0], { x: m.W * 0.55, y });
            c.spot = { x: m.W * 0.35, y }; c.fixedSpot = false; c.x = c.spot.x; c.y = y; c.state = 'sleep'; c.wait = 1e6;
            m.chaseIn = 1e9;
        })(WP.stage.manager)`);
        const said = await evaluate('WP.stage.manager.chaseSquirrel()');
        if (!/Squirrel!/.test(said)) return record(`C said ${JSON.stringify(said)}`);
        const seen = [];
        let last = null, jump = 0, shot = false;
        const done = await waitFor(async () => {
            const now = await evaluate(`(m => { const c = m.cats[0];
                if (c.state === 'out' && c.wait > 0.5) c.wait = 0.5;           // don't wait out its errand
                if (c.state === 'walk' && c.napAfter) { const d = c.target.x - c.x; if (Math.abs(d) > 30) c.x += d * 0.5; }   // nor its stroll home
                return { x: c.x, y: c.y, state: c.state, squirrel: m.squirrels[0].state, w: m.W, naps: c.naps || 0, chasing: c.chasing }; })(WP.stage.manager)`);
            if (seen[seen.length - 1] !== now.state) seen.push(now.state);
            if (now.state === 'chase' && !shot) { shot = true; await shoot('harvest-chase'); }
            if (last && last.state === now.state && now.state === 'chase' && last.x > 0 && last.x < now.w && now.x > 0 && now.x < now.w) jump = Math.max(jump, Math.hypot(now.x - last.x, now.y - last.y));
            last = now;
            return now.naps > 0;
        }, 40000);
        if (!done) return record(`no nap after the chase (states: ${seen.join(' → ')})`);
        const order = ['stalk', 'chase', 'out', 'walk', 'sleep'].filter(st => seen.includes(st)).join();
        if (order !== 'stalk,chase,out,walk,sleep') record(`the chase went ${seen.join(' → ')}`);
        if (jump > 120) record(`the cat jumped ${Math.round(jump)} px mid-chase`);
        const after = await evaluate('(m => ({ squirrel: m.squirrels[0].state, cat: m.cats[0].state, wait: m.cats[0].wait, x: m.cats[0].x, w: m.W }))(WP.stage.manager)');
        if (after.squirrel !== 'away') record(`the squirrel wasn't chased off (it's ${after.squirrel})`);
        if (after.cat !== 'sleep' || after.wait < 100 || after.x < 0 || after.x > after.w) record(`after the chase: ${JSON.stringify(after)}`);
        await shoot('harvest-nap');
        return true;
    }], ['the Great Pumpkin rises at night, and never by day', async () => {
        await cdp.send('Page.navigate', { url: `${WEB}/stage.html?w=harvest&seed=7&date=2026-11-24T14:00` });
        await waitFor(() => evaluate('WP.stage?.ready === true'));
        const day = await evaluate('WP.stage.manager.waitForGreatPumpkin()');
        if (!/bright/.test(day) || await evaluate('WP.stage.manager.great.state') !== 'sleep') record(`it stirred by day: ${day}`);
        await cdp.send('Page.navigate', { url: `${WEB}/stage.html?w=harvest&seed=7&date=2026-11-24T22:30` });
        await waitFor(() => evaluate('WP.stage?.ready === true'));
        const night = await evaluate('WP.stage.manager.waitForGreatPumpkin()');
        if (!/Waiting/.test(night)) return record(`it wouldn't wake at night: ${night}`);
        if (!await waitFor(() => evaluate("WP.stage.manager.great.state === 'rise'"), 30000)) return record(`never rose (${await evaluate('WP.stage.manager.great.state')})`);
        if (!await waitFor(() => evaluate('WP.stage.manager.great.y < WP.stage.manager.L.sincere.y - 8'), 15000)) {
            const { y, home } = await evaluate('({ y: WP.stage.manager.great.y, home: WP.stage.manager.L.sincere.y })');
            record(`it hasn't left the vine (${Math.round(y)} against ${Math.round(home)})`);
        }
        // And a resize while it climbs doesn't put it back to sleep.
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 700, deviceScaleFactor: 1, mobile: false });
        await sleep(600);
        if (await evaluate('WP.stage.manager.great.state') !== 'rise') record(`a resize reset the Great Pumpkin to ${await evaluate('WP.stage.manager.great.state')}`);
        await cdp.send('Emulation.clearDeviceMetricsOverride');
        return true;
    }], ['every part can be left out, and a pinned night still has its moon', async () => {
        const off = { configVersion: 1, village: false, fields: false, pumpkinPatch: false, orchard: false, cats: 0, turkeys: 0, geese: 0, clouds: 0, leaves: 0, sky: 'night', moonPhase: 'full', mist: 0, beams: false };
        if (!await stageWith('harvest', off, '&seed=7&date=2026-11-24T10:00')) return record('no boot with everything left out');
        await sleep(800);
        const state = await evaluate(`(m => ({ trees: m.trees.length, cats: m.cats.length, squirrels: m.squirrels.length, dark: m.light.dark, moon: m.moon.alt, windows: m.L.windows.length }))(WP.stage.manager)`);
        if (state.trees || state.cats || state.squirrels || state.windows) record(`left-out parts still there: ${JSON.stringify(state)}`);
        if (state.dark < 0.95 || state.moon < 30) record(`a pinned full-moon night is dark ${state.dark.toFixed(2)} with the moon at ${state.moon.toFixed(0)}°`);
        const avg = await evaluate(AVERAGE);
        if (Math.max(...avg) < 6) record(`nothing was drawn: ${avg}`);
        return true;
    }]],
    // The Cat vs. the Ornament: alive on frame one, the tree grand; B swings the ornament; T
    // sends a cat up and the tree comes down, the lights go out, ornaments
    // everywhere, then the fade and it's up again for the next cat; with
    // Topple off it stays up; a tap shines a dot that a cat chases.
    // The Christmas trees, every way (2026-11-11): a Charlie Brown tree in
    // the cat room (one ball, hooks at its branch tips, and it still falls),
    // a big wide fir with three times the lights; the pixel tree huge and
    // as a Charlie Brown tree; the frosted window's tree as a sapling.
    'cat-ornament': [['a Charlie Brown tree that falls, a big full fir, the pixel tree huge and spindly, the window\'s sapling', async () => {
        const at = '&seed=7&date=2026-12-10T20:00';
        if (!await stageWith('cat-ornament', { configVersion: 2, cats: ['ras', 'turkey'], tree: 'charlie', presents: 2 }, at)) return record('no boot with the Charlie Brown tree');
        let s = await evaluate('(m => ({ charlie: !!m.treeArt.charlie, ornaments: m.treeArt.ornaments.length, lights: m.treeArt.lights.length, hooks: m.treeArt.hooks.length, presents: m.presents.boxes.length, star: m.treeArt.topper }))(WP.stage.manager)');
        if (!s.charlie || s.ornaments !== 1 || s.lights > 3 || s.hooks !== 2 || s.presents !== 2 || s.star !== 'none') record(`the Charlie Brown tree: ${JSON.stringify(s)}`);
        await press('t');
        if (!await waitFor(() => evaluate("WP.stage.manager.tree.state !== 'still'"), 12000)) record('T sent no cat up the Charlie Brown tree');
        else if (!await waitFor(() => evaluate("WP.stage.manager.tree.state === 'down' || WP.stage.manager.tree.state === 'reset' || Math.abs(WP.stage.manager.tree.phi) > 1"), 15000)) record('the Charlie Brown tree never came down');
        await shoot('christmas-trees-charlie');
        if (!await stageWith('cat-ornament', { configVersion: 2, cats: ['ibbie'], tree: 'majestic', treeHeight: 1.3, treeWidth: 1.5, lightCount: 3, ornamentCount: 3, garland: 'tinsel', topper: 'bow', flocked: true, presents: 12 }, at)) return record('no boot with the big tree');
        s = await evaluate('(m => ({ lights: m.treeArt.lights.length, ornaments: m.treeArt.ornaments.length, presents: m.presents.boxes.length, w: m.treeArt.w, h: m.treeArt.h, W: m.W, star: m.treeArt.topper }))(WP.stage.manager)');
        if (s.lights < 300 || s.ornaments < 60 || s.presents !== 12 || s.w > s.W * 0.75 || s.star !== 'bow') record(`the big tree: ${JSON.stringify(s)}`);
        await shoot('christmas-trees-big');
        if (!await stageWith('small-christmas', { configVersion: 2, treeSize: 'huge', treeWidth: 1.4, lightCount: 2, moveMinutes: 0 }, at)) return record('no boot with the huge pixel tree');
        s = await evaluate('(m => ({ h: m.tree.h, lights: m.tree.lights.length, star: !!m.tree.star }))(WP.stage.manager)');
        if (s.h < 80 || s.lights < 60 || !s.star) record(`the huge pixel tree: ${JSON.stringify(s)}`);
        if (!await stageWith('small-christmas', { configVersion: 2, treeStyle: 'charlie', moveMinutes: 0 }, at)) return record('no boot with the pixel Charlie Brown tree');
        s = await evaluate('(m => ({ charlie: !!m.tree.charlie, lights: m.tree.lights.length, star: !!m.tree.star }))(WP.stage.manager)');
        if (!s.charlie || s.lights > 3 || s.star) record(`the pixel Charlie Brown tree: ${JSON.stringify(s)}`);
        await sleep(1200);
        await shoot('christmas-trees-pixel-charlie');
        if (!await stageWith('frost', { configVersion: 2, snow: 0, doodles: false, treeStyle: 'charlie' }, at)) return record('no boot with the window\'s sapling');
        s = await evaluate('(m => ({ style: m.room.tree.style, discs: m.room.discs.length }))(WP.stage.manager)');
        if (s.style !== 'charlie' || s.discs > 12) record(`the window's sapling: ${JSON.stringify(s)}`);
        if (!await stageWith('frost', { configVersion: 2, snow: 0, doodles: false, lightCount: 200, treeSize: 1.4 }, at)) return record('no boot with the big window tree');
        s = await evaluate('(m => ({ discs: m.room.discs.length }))(WP.stage.manager)');
        if (s.discs < 150) record(`the big window tree has ${s.discs} discs`);
        // A change from the panel takes effect live, without a reload.
        s = await evaluate('(m => { m.applySettings({ ...m.config, treeStyle: "charlie" }); return { style: m.room.tree.style, discs: m.room.discs.length }; })(WP.stage.manager)');
        if (s.style !== 'charlie' || s.discs > 12) record(`the panel's Charlie Brown tree didn't take live: ${JSON.stringify(s)}`);
        return true;
    }], ['the ornament swings, the tree falls and is put back, a cat chases the dot', async () => {
        const at = '&seed=7&date=2026-12-10T20:00';
        if (!await stageWith('cat-ornament', { configVersion: 2, cats: ['ras', 'butters', 'ibbie'], mischief: 0 }, at)) return record('no boot');
        const st = () => evaluate('JSON.parse(JSON.stringify(WP.stage.manager.debugState()))');
        let s = await st();
        if (s.cats.length !== 3) record(`${s.cats.length} cats in the room, not 3`);
        if (!['stare', 'lurk'].includes(s.cats.find(c => c.lead)?.task)) record(`the lead isn't at the ornament on frame one: ${JSON.stringify(s.cats)}`);
        if (s.tree.state !== 'still' || !s.pendulum.hung) record(`the tree on frame one: ${JSON.stringify(s.tree)}`);
        if (!s.cats.some(c => c.name === 'Ras The Destroyer')) record(`names: ${s.cats.map(c => c.name)}`);
        // The default tree is the grand one: as wide as it's tall, and full of lights.
        const tree = await evaluate('(a => ({ w: a.w, h: a.h, lights: a.lights.length, ornaments: a.ornaments.length }))(WP.stage.manager.treeArt)');
        if (tree.w < tree.h * 0.9 || tree.lights < 100 || tree.ornaments < 20) record(`the tree is anemic: ${JSON.stringify(tree)}`);
        // B: a swat.
        await evaluate('WP.stage.manager.pendulum.omega = 0; WP.stage.manager.pendulum.theta = 0');
        await press('b');
        const swung = await waitFor(async () => Math.abs((await st()).pendulum.theta) > 0.05, 4000);
        if (!swung) record(`B didn't swing the ornament: ${JSON.stringify((await st()).pendulum)}`);
        await shoot('cat-ornament-bap');
        // T: up the tree, and down it comes.
        await press('t');
        if (!await waitFor(async () => (await st()).tree.state === 'fall', 9000)) return record(`the tree never fell: ${JSON.stringify(await st())}`);
        if (!await waitFor(async () => (await st()).tree.state === 'down', 5000)) return record('the tree never landed');
        await sleep(800);
        s = await st();
        if (s.loose < 6) record(`only ${s.loose} things came off the tree`);
        if (s.tree.lights !== 0) record('the lights stayed on');
        if (s.cats.find(c => c.lead)?.task !== 'innocent') record(`after the fall the culprit is ${s.cats.find(c => c.lead)?.task}, not innocent`);
        await shoot('cat-ornament-fallen');
        const lead = s.lead;
        if (!await waitFor(async () => (await st()).tree.state === 'still' && !(await st()).fade, 20000)) return record(`never put back: ${JSON.stringify((await st()).tree)}`);
        s = await st();
        if (s.loose || !s.pendulum.hung) record(`after the reset: ${s.loose} loose, hung ${s.pendulum.hung}`);
        if (s.lead === lead) record('the same cat kept the ornament after the reset');
        // Topple off: a climb, and the tree stays up.
        if (!await stageWith('cat-ornament', { configVersion: 2, cats: ['turkey', 'ibbie'], topple: false }, at)) return record('no boot with topple off');
        await press('t');
        await sleep(8000);
        s = await st();
        if (s.tree.state === 'fall' || s.tree.state === 'down') record('the tree fell with Topple off');
        // A tap: the dot, and a cat after it.
        await mouse('mousePressed', 300, 700);
        await mouse('mouseReleased', 300, 700);
        if (!await waitFor(async () => (await st()).cats.some(c => c.task === 'chase'), 2000)) record(`nobody chased the dot: ${JSON.stringify((await st()).cats)}`);
        return true;
    }]],
    // The Last Bulb on the Strand: lit on frame one with the last bulb dark;
    // still, it sends no frames at all; L makes it try (two flicks, then
    // light), redrawing only its corner; O puts the whole strand out and the
    // twist brings it back with the last bulb on; on Christmas Eve it lights
    // first time; a tap on it jiggles it.
    'last-bulb': [['idle when still, flick-flick-light in its corner, the strand out and back, Christmas Eve', async () => {
        const st = () => evaluate('JSON.parse(JSON.stringify(WP.stage.manager.debugState()))');
        if (!await stageWith('last-bulb', { configVersion: 1, stubborn: 0, outages: 'off', draft: 0 }, '&seed=7&date=2026-12-10T20:00')) return record('no boot');
        let s = await st();
        if (s.strand !== 'on' || s.strandLight !== 1 || s.last !== 'dark' || s.bulbs < 6) record(`frame one: ${JSON.stringify(s)}`);
        await sleep(600);
        const before = await evaluate('WP.host.frames.count');
        await sleep(1500);
        const idle = await evaluate('WP.host.frames.count') - before;
        if (idle > 1) record(`${idle} frames while nothing moved (want none)`);
        const corners = (await st()).stats.corner, fulls = (await st()).stats.full;
        // L: it tries, and (Stubbornness 0) it lights after two flicks.
        await evaluate(`window.__lb = []; (function rec() { const m = WP.stage.manager; if (m) window.__lb.push(m.last.power); if (window.__lb.length < 200) requestAnimationFrame(rec); })()`);
        await press('l');
        if (!await waitFor(async () => (await st()).last === 'lit', 4000)) return record(`L never lit it: ${JSON.stringify(await st())}`);
        const powers = await evaluate('window.__lb');
        let contacts = 0;
        for (let i = 1; i < powers.length; i++) if (powers[i] > 0 && !(powers[i - 1] > 0)) contacts++;
        if (contacts !== 3) record(`${contacts} contacts before it held (want two flicks, then on)`);
        if (!await waitFor(async () => (await st()).lastLight >= 0.99, 1500)) record(`lit, but its light is ${(await st()).lastLight}`);
        s = await st();
        if (s.stats.corner - corners < 10 || s.stats.full !== fulls) record(`the flicker redrew ${s.stats.corner - corners} corners and ${s.stats.full - fulls} whole screens (want corners only)`);
        if (!(s.next.last > 60)) record(`it isn't due to work loose for a while: ${JSON.stringify(s.next)}`);
        await shoot('last-bulb-lit');
        // O: the strand goes out; the twist brings it back, the last bulb on.
        await press('o');
        if (!await waitFor(async () => (await st()).strand === 'out', 2000)) return record(`O: ${JSON.stringify(await st())}`);
        if (!await waitFor(async () => (s = await st()).strandLight < 0.01 && s.lastLight < 0.01, 1500)) record(`out, but lit: ${JSON.stringify(s)}`);
        await shoot('last-bulb-out');
        if (!await waitFor(async () => (await st()).strand === 'on' && (await st()).last === 'lit', 12000)) return record(`never came back: ${JSON.stringify(await st())}`);
        // A tap on the last bulb jiggles it.
        const p = await evaluate('(m => m.lastCentre())(WP.stage.manager)');
        await mouse('mousePressed', p.x, p.y);
        await mouse('mouseReleased', p.x, p.y);
        if (!await waitFor(async () => (await st()).moving || (await st()).last === 'busy', 1500)) record('a tap on the last bulb did nothing');
        // Christmas Eve: very stubborn, and it lights first time and stays.
        if (!await stageWith('last-bulb', { configVersion: 1, stubborn: 0.9, outages: 'off', draft: 0 }, '&seed=7&date=2026-12-24T19:00')) return record('no boot on Christmas Eve');
        if (!(await st()).eve) record('not Christmas Eve on the 24th at seven');
        if (!await waitFor(async () => (await st()).last === 'lit', 7000)) return record(`on Christmas Eve it didn't light: ${JSON.stringify(await st())}`);
        if ((await st()).next.last !== undefined) record('on Christmas Eve it means to go out again');
        // Round the border, with twinkle bulbs: bulbs by every edge, and a twinkler blinks on its own (only its corner redrawn).
        if (!await stageWith('last-bulb', { configVersion: 2, route: 'border', twinklers: 2, garland: 'pine', shape: 'globe', outages: 'off', draft: 0, stubborn: 0.9 }, '&seed=7&date=2026-12-10T20:00')) return record('no boot round the border');
        s = await st();
        const W = await evaluate('innerWidth'), H = await evaluate('innerHeight');
        if (s.route !== 'border' || !s.spread || s.spread.x0 > 60 || s.spread.x1 < W - 60 || s.spread.y0 > 60 || s.spread.y1 < H - 120) record(`the border doesn't go round: ${JSON.stringify(s.spread)}`);
        if (s.twinklers.length !== 2) record(`${s.twinklers.length} twinklers (want two)`);
        const fulls2 = s.stats.full, state0 = s.twinklers.map(t => t.on).join();
        if (!await waitFor(async () => (await st()).twinklers.map(t => t.on).join() !== state0, 5000)) record('no twinkle bulb blinked in five seconds');
        await sleep(400);
        s = await st();
        if (s.stats.full !== fulls2) record(`a twinkle redrew the whole screen ${s.stats.full - fulls2} times`);
        if (!(s.stats.corner > 0)) record('a twinkle redrew nothing');
        await shoot('last-bulb-border');
        return true;
    }]],
    // Frost on the Glass: frost on frame one, and it keeps creeping in;
    // with no snow it paces itself at ten frames a second at most; D draws in
    // it (the glass under the line is clear afterwards); B breathes on it; a
    // drag clears a line that later grows back; T thaws it, and it starts
    // again from the corners.
    frost: [['frost grows, someone draws in it, breath, a finger, the thaw', async () => {
        const st = () => evaluate('JSON.parse(JSON.stringify(WP.stage.manager.debugState()))');
        const alphaAt = (x, y) => evaluate(`(m => m.mask.getContext('2d').getImageData(Math.round(${x} * m.dpr), Math.round(${y} * m.dpr), 1, 1).data[3])(WP.stage.manager)`);
        if (!await stageWith('frost', { configVersion: 2, snow: 0, doodles: false }, '&seed=7&date=2026-12-10T20:00')) return record('no boot');
        let s = await st();
        if (s.phase !== 'grow' || s.stats.segments < 2000 || s.spots < 50) record(`frame one: ${JSON.stringify(s)}`);
        const seg = s.stats.segments;
        await sleep(600);
        const before = await evaluate('WP.host.frames.count');
        await sleep(2000);
        const frames = await evaluate('WP.host.frames.count') - before;
        if (frames > 26) record(`${frames} frames in 2 s with no snow (want ten a second at most)`);
        if ((await st()).stats.segments <= seg) record('the frost stopped growing');
        // D: a heart drawn in it; the glass under its line is clear after.
        await press('d');
        const path = await evaluate('(m => m.doodling && m.doodling.path.filter(p => !p.lift).map(p => ({ x: p.x, y: p.y })))(WP.stage.manager)');
        if (!path?.length) return record(`D drew nothing: ${JSON.stringify(await st())}`);
        if (!await waitFor(async () => !(await st()).doodling, 15000)) return record('the doodle never finished');
        const mid = path[Math.floor(path.length / 2)];
        const left = await alphaAt(mid.x, mid.y);
        if (left > 40) record(`the doodle's line still has frost on it (alpha ${left})`);
        await shoot('frost-doodle');
        // B: breath fogs the glass for a moment.
        await press('b');
        if (!(await evaluate('WP.stage.manager.fogs.length'))) record('B: no breath on the glass');
        // A drag: a cleared line, and new crystals queued to grow back into it.
        const tips = (await st()).tips;
        const p = await evaluate('(m => { const q = m.L.panes[0]; return { x: q.x + 30, y: q.y + 30 }; })(WP.stage.manager)');
        await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 1 });
        for (let i = 1; i <= 12; i++) await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x + i * 12, y: p.y + i * 6, button: 'left', buttons: 1 });
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x + 144, y: p.y + 72, button: 'left', buttons: 0, clickCount: 1 });
        await sleep(300);
        if ((await st()).tips <= tips) record('a drag left nothing to grow back');
        if (await alphaAt(p.x + 72, p.y + 36) > 40) record('a drag left the frost under it');
        // T: the thaw, and frost from the corners again.
        await press('t');
        if ((await st()).phase !== 'thaw') return record(`T: ${JSON.stringify(await st())}`);
        await evaluate('WP.stage.manager.phaseT = 39.5');
        if (!await waitFor(async () => (await st()).phase === 'grow', 3000)) return record(`the thaw never ended: ${JSON.stringify(await st())}`);
        s = await st();
        if (s.stats.thaws !== 1 || s.phaseT > 5) record(`after the thaw: ${JSON.stringify(s)}`);
        return true;
    }]],
    // A Very Small Christmas: a small canvas scaled up pixelated, at its
    // retro frame rate; T sends the train round and it parks again; M moves
    // house (the track packs away, everyone hops, the track lays itself
    // down); a tap on the floor moves the tree there; S sends the sleigh;
    // on Christmas Day there are more presents.
    'small-christmas': [['pixelated, twelve frames a second, the train goes round, moving house, the sleigh', async () => {
        const st = () => evaluate('JSON.parse(JSON.stringify(WP.stage.manager.debugState()))');
        const settings = { configVersion: 2, laps: 1, trainSpeed: 2.5, moveMinutes: 0, train: false, sleigh: 'never' };
        if (!await stageWith('small-christmas', settings, '&seed=7&date=2026-12-10T20:00')) return record('no boot');
        let s = await st();
        const canvas = await evaluate('(m => ({ w: m.canvas.width, h: m.canvas.height, css: m.canvas.style.width, look: m.canvas.style.imageRendering }))(WP.stage.manager)');
        if (canvas.w !== s.bw || canvas.w > 700 || canvas.look !== 'pixelated') record(`the canvas: ${JSON.stringify(canvas)}`);
        if (s.lights < 6 || s.presents !== 3 || s.track !== 1) record(`frame one: ${JSON.stringify(s)}`);
        await sleep(500);
        const before = await evaluate('WP.host.frames.count');
        await sleep(2000);
        const frames = await evaluate('WP.host.frames.count') - before;
        if (frames > 30 || frames < 12) record(`${frames} frames in 2 s (want about 24)`);
        // T: once round, and parked where it started.
        const parked = s.trainS;
        await press('t');
        if (!(await st()).train) return record('T: the train stayed put');
        if (!await waitFor(async () => !(s = await st()).train, 12000)) return record(`the train never stopped: ${JSON.stringify(s)}`);
        if (s.stats.laps !== 1 || Math.abs(s.trainS - parked) > 0.01) record(`after its lap: ${s.stats.laps} laps, parked at ${s.trainS} (was ${parked})`);
        // M: moving house.
        const x0 = s.setX;
        await press('m');
        if (!await waitFor(async () => (await st()).moving === 'hop', 3000)) return record(`M: ${JSON.stringify(await st())}`);
        if ((await st()).track !== 0) record('the track wasn’t packed away for the move');
        await shoot('small-christmas-hop');
        if (!await waitFor(async () => !(s = await st()).moving, 20000)) return record(`never settled in: ${JSON.stringify(s)}`);
        if (s.setX === x0 || s.track !== 1) record(`moved from ${x0} to ${s.setX}, track ${s.track}`);
        // A tap on the floor: the tree moves there.
        const px = s.px, target = Math.max(s.setX < s.bw / 2 ? s.bw * 0.8 : s.bw * 0.2, 40);
        await mouse('mousePressed', target * px, (s.bh - 6) * px);
        await mouse('mouseReleased', target * px, (s.bh - 6) * px);
        if (!await waitFor(async () => (await st()).moving !== null, 2000)) record('a tap on the floor didn’t move the tree');
        else if (!await waitFor(async () => !(s = await st()).moving, 20000) || Math.abs(s.setX - Math.round(target)) > 1) record(`the tap moved it to ${s.setX}, not ${Math.round(target)}`);
        // S: the sleigh, even with it set to never.
        await press('s');
        if (!(await st()).sleigh) record('S: no sleigh');
        // Christmas Day: three more presents.
        if (!await stageWith('small-christmas', { ...settings, sleigh: 'sometimes' }, '&seed=7&date=2026-12-25T09:00')) return record('no boot on Christmas Day');
        if ((await st()).presents !== 6) record(`Christmas Day: ${(await st()).presents} presents (want 6)`);
        return true;
    }]],
    // Sky Island: a pixel canvas with the whole cast on frame one; the same
    // seed is the same island and P pins it; a tap calls a cat; V brings a
    // visitor and everyone waves; the date dresses the island (pumpkins,
    // lights, eggs, a party of the owner's own); night lights the windows;
    // Low bakes the trees and keeps fewer folk.
    'sky-island': [['the cast on frame one; three tiers and three falls; a seed is an island; P pins it; a tap calls a cat', async () => {
        const st = () => evaluate('JSON.parse(JSON.stringify(WP.stage.manager.debugState()))');
        if (!await stageWith('sky-island', { configVersion: 2, seed: 4242, weather: 'fair' }, '&date=2026-06-20T11:00')) return record('no boot');
        let s = await st();
        const canvas = await evaluate('(m => ({ w: m.canvas.width, css: m.canvas.style.width, look: m.canvas.style.imageRendering, px: m.px }))(WP.stage.manager)');
        if (canvas.w !== s.bw || canvas.look !== 'pixelated' || canvas.px < 1) record(`the canvas: ${JSON.stringify(canvas)}`);
        if (s.seed !== 4242 || !s.kept || !/^[A-Z][a-z]+ (Isle|Island|Rock|Aerie|Perch)$/.test(s.name)) record(`the seed: ${s.seed} ${s.kept} ${s.name}`);
        if (s.island.houses < 3 || s.island.trees < 10 || s.island.lamps < 2 || s.island.tiers !== 3 || s.island.falls !== 3 || s.island.fields < 1) record(`a thin island: ${JSON.stringify(s.island)}`);
        if (s.people !== 20 || s.outdoors < 8 || s.cats.length !== 12 || s.dogs !== 2 || s.wildlife.length < 8) record(`the cast: ${s.people} people (${s.outdoors} out), ${s.cats.length} cats, ${s.dogs} dogs, ${s.wildlife.length} animals`);
        if (s.season !== 'summer' || s.holiday !== null || s.dark > 0.05 || s.weather.state !== 'fair') record(`a June morning: ${JSON.stringify({ season: s.season, holiday: s.holiday, dark: s.dark, weather: s.weather })}`);
        // Folk stand on all three tiers; the terrain, the sea of cloud and the ground are baked.
        const spread = await evaluate('(m => ({ tiers: [...new Set(m.folk.people.filter(p => !p.inside).map(p => SkyIslandLogic.tierAt(m.I, p.x, p.y)).filter(t => t >= 0))].sort(), terrain: !!m.terrain && m.terrain.c.width > m.I.w, sea: !!m.sea && m.sea.front.width === m.bw * 2, ground: !!m.groundArt, falls: m.falls.map(f => f.length), bands: m.bands.filter(Boolean).length }))(WP.stage.manager)');
        if (spread.tiers.length < 2 || !spread.terrain || !spread.sea || !spread.ground || spread.falls.join() !== '4,4,4' || spread.bands < 3) record(`the bakes: ${JSON.stringify(spread)}`);
        const name = s.name, houses = await evaluate('JSON.stringify(WP.stage.manager.I.houses.map(h => [h.x, h.w, h.kind, h.tier]))');
        await sleep(500);
        const before = await evaluate('WP.host.frames.count');
        await sleep(2000);
        const frames = await evaluate('WP.host.frames.count') - before;
        if (frames < 24 || frames > 50) record(`${frames} frames in 2 s (want about 40)`);
        // The same seed again: the same island, by name and by every house.
        if (!await stageWith('sky-island', { configVersion: 2, seed: 4242, weather: 'fair' }, '&date=2026-06-20T11:00')) return record('no second boot');
        s = await st();
        if (s.name !== name || await evaluate('JSON.stringify(WP.stage.manager.I.houses.map(h => [h.x, h.w, h.kind, h.tier]))') !== houses) record(`seed 4242 drew a different island: ${s.name}`);
        // A fresh island (seed 0): some other island; P pins it, and P again lets it go.
        if (!await stageWith('sky-island', null, '&seed=9&date=2026-06-20T11:00')) return record('no fresh boot');
        s = await st();
        if (s.kept || s.seed === 4242) record(`a fresh island came kept: ${JSON.stringify({ seed: s.seed, kept: s.kept })}`);
        await press('p');
        const kept = await evaluate("JSON.parse(localStorage.getItem('wp:sky-island') || '{}').seed");
        if (kept !== s.seed || !(await st()).kept) record(`P didn't pin seed ${s.seed}: stored ${kept}`);
        await press('p');
        if ((await st()).kept || (await evaluate("JSON.parse(localStorage.getItem('wp:sky-island') || '{}').seed") || 0) !== 0) record('P again didn’t let the island go');
        await evaluate("localStorage.removeItem('wp:sky-island')");
        // A tap on the top, by the tower's bench, calls the nearest cat over (up the stairs), with a word.
        const spot = await evaluate('(m => { const s = m.I.spots.lookout; return { x: (m.ix + s.x) * m.px, y: (m.iy + s.y + m.bob) * m.px, sx: s.x, sy: s.y }; })(WP.stage.manager)');
        await mouse('mousePressed', spot.x, spot.y);
        await mouse('mouseReleased', spot.x, spot.y);
        await sleep(200);
        const called = await evaluate('(m => { const c = m.cats.cats.find(c => c.bubbleT > 0); return c && { id: c.spec.id, state: c.state, bubble: c.bubble, taps: m.cats.stats.taps }; })(WP.stage.manager)');
        if (!called || called.taps !== 1 || !['meow', 'heart'].includes(called.bubble)) return record(`the tap called no cat: ${JSON.stringify(called)}`);
        const near = await waitFor(() => evaluate(`(m => { const c = m.cats.cats.find(c => c.spec.id === '${called.id}'); return !c.moving && Math.hypot(c.x - ${spot.sx}, c.y - ${spot.sy}) < 3 && SkyIslandLogic.tierAt(m.I, c.x, c.y) === 0; })(WP.stage.manager)`), 60000);
        if (!near) record(`${called.id} never came up to the tap`);
        console.log(`    sky-island: ${name}, ${s.island.houses} houses, ${s.island.trees} trees, ${s.outdoors} of ${s.people} out on tiers ${spread.tiers.join('/')}, ${s.cats.length} cats; ${frames} frames in 2 s; ${called.id} came when tapped`);
        return true;
    }], ['V brings a whole island and everyone waves; O brings one to orbit; the date dresses the island; night lights the windows; Low bakes the trees', async () => {
        const st = () => evaluate('JSON.parse(JSON.stringify(WP.stage.manager.debugState()))');
        if (!await stageWith('sky-island', { configVersion: 2, seed: 77, visitMinutes: 0, orbiters: false, weather: 'fair' }, '&date=2026-10-31T15:00')) return record('no boot');
        let s = await st();
        if (s.holiday !== 'halloween' || s.season !== 'autumn' || s.decor < s.island.houses) record(`Halloween: ${JSON.stringify({ holiday: s.holiday, season: s.season, decor: s.decor })}`);
        if (s.visitors.length || s.orbiter) record('a visitor with visits off');
        await press('v');
        s = await st();
        if (s.visitors.length !== 1) return record(`V brought ${s.visitors.length} visitors`);
        // A whole island of its own: tiers, houses, falls; alongside, its folk wave and ours wave back.
        const theirs = await evaluate('(m => { const v = m.visitors.islands[0]; return { tiers: v.art.I.tiers.length, houses: v.art.I.houses.length, falls: v.art.falls.length, residents: v.residents.length, w: v.art.w }; })(WP.stage.manager)');
        if (theirs.tiers !== 3 || theirs.houses < 1 || theirs.falls !== 3 || theirs.residents < 1) record(`a thin visitor: ${JSON.stringify(theirs)}`);
        await evaluate('(m => { const v = m.visitors.islands[0]; v.x = m.bw / 2 + 20; v.vx = 1; })(WP.stage.manager)');
        await sleep(400);
        const waving = await evaluate('(m => ({ theirs: m.visitors.islands[0].waving, ours: m.folk.people.filter(p => !p.inside && p.wave > 0).length, greeted: m.visitors.islands[0].greeted }))(WP.stage.manager)');
        if (!waving.theirs || !waving.greeted || waving.ours < 2) record(`nobody waved: ${JSON.stringify(waving)}`);
        await shoot('sky-island-visitor');
        // O: a small island comes to go round ours, behind and then in front.
        await press('o');
        await sleep(300);
        const orb = await evaluate('(m => { const o = m.visitors.orbiter; return o && { name: o.name, houses: o.art.I.houses.length, phase: o.phase, w: o.art.I.w }; })(WP.stage.manager)');
        if (!orb || orb.houses < 1) record(`O brought no islet: ${JSON.stringify(orb)}`);
        // Christmas Eve: lights on every eave, the tree in the square; Easter: eggs; a party of the owner's own.
        if (!await stageWith('sky-island', { configVersion: 2, seed: 77, visitMinutes: 0, orbiters: false, weather: 'fair' }, '&date=2026-12-24T20:00')) return record('no boot on Christmas Eve');
        s = await st();
        if (s.holiday !== 'christmas' || s.season !== 'winter' || s.lights < 10 || !(await evaluate('!!WP.stage.manager.squareTree')) || s.dark < 0.9) record(`Christmas Eve: ${JSON.stringify({ holiday: s.holiday, season: s.season, lights: s.lights, dark: s.dark })}`);
        const lit = await evaluate('(m => ({ houses: m.I.houses.filter(h => m.windowsLit(h)).length, layer: !!m.glowLayer && m.glowKey !== null, inside: m.folk.people.filter(p => p.inside).length, seaDark: (c => { const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let lit = 0, n = 0; for (let i = 0; i < d.length; i += 16) if (d[i + 3]) { n++; if (d[i] + d[i + 1] + d[i + 2] > 450) lit++; } return n && lit / n; })(m.sea.front) }))(WP.stage.manager)');
        if (lit.houses < 1 || !lit.layer) record(`no windows lit at night: ${JSON.stringify(lit)}`);
        if (lit.seaDark > 0.1) record(`the sea of cloud is lit at night: ${JSON.stringify(lit)}`);
        if (!await stageWith('sky-island', { configVersion: 2, seed: 77, visitMinutes: 0, orbiters: false }, '&date=2026-04-05T11:00')) return record('no boot at Easter');
        s = await st();
        if (s.holiday !== 'easter' || s.eggs < 5 || s.season !== 'spring') record(`Easter: ${JSON.stringify({ holiday: s.holiday, eggs: s.eggs, season: s.season })}`);
        if (!await stageWith('sky-island', { configVersion: 2, seed: 77, visitMinutes: 0, orbiters: false, specialDates: '06-10 The cats’ birthday' }, '&date=2026-06-10T18:30')) return record('no boot for the party');
        s = await st();
        const party = await evaluate('(m => ({ name: m.holiday && m.holiday.name, inSquare: m.folk.people.filter(p => !p.inside && p.plan && p.plan.spot === "square").length }))(WP.stage.manager)');
        if (s.holiday !== 'party' || party.name !== 'The cats’ birthday' || party.inSquare < 5 || s.decor < 1) record(`the party: ${JSON.stringify({ ...party, decor: s.decor })}`);
        // Low: the trees are baked into the bands, and fewer folk are about.
        if (!await stageWith('sky-island', { configVersion: 2, seed: 77, visitMinutes: 0, orbiters: false }, '&date=2026-06-20T11:00&tier=low')) return record('no boot on Low');
        const low = await evaluate('(m => ({ sway: m.sway, bands: m.bands.filter(Boolean).length, people: m.folk.people.length, tier: WP.host.quality.tier }))(WP.stage.manager)');
        if (low.sway || low.bands < 2 || low.people >= 20 || low.tier !== 'low') record(`Low: ${JSON.stringify(low)}`);
        console.log(`    sky-island: ${theirs.houses}-house visitor ${theirs.w} px wide, waved at by ${waving.ours}; ${orb && orb.name} came round; ${lit.houses} houses lit on Christmas Eve; ${s.decor} trimmings for the party; ${low.people} folk on Low`);
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
        // Tap behind a koi, so it has to turn right round to come. They
        // swim, so if none is clear of the edges and the others yet, wait.
        const { x, y, nearest } = await waitFor(() => evaluate(`(() => {
            const m = WP.stage.manager, fish = m.koi.filter(k => !k.leaving);
            for (const k of fish) {
                const x = Math.round(k.x - Math.cos(k.heading) * k.len * 1.4), y = Math.round(k.y - Math.sin(k.heading) * k.len * 1.4);
                if (x < 40 || y < 40 || x > innerWidth - 80 || y > innerHeight - 40) continue;
                const near = [...fish].sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
                if (near === k) return { x, y, nearest: k.id };
            }
            return null;
        })()`), 5000) || { nearest: null };
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
    // Ice Patrol (§10.34): in the air on frame one with the instruments
    // reading the world; the same flight without WebGL; night, weather, the
    // views and a phone. Headless Chrome draws its WebGL in software, far too
    // slowly to time, so the speed is measured on the 2D fallback.
    'ice-patrol': [
        ['in the air on the first frame: wingmen, lights, a radar picture, live gauges', async () => {
            if (!await stageWith('ice-patrol', null, '&seed=7')) return record('not ready');
            await sleep(2500);
            const paint = "c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) n += d[i] > 40; return n / (d.length / 4); }";
            const s = await evaluate(`(m => ({ flat: m.flat, agl: m.flight.agl, wingmen: m.wingmen.length, craft: m.scene.craft.length, lights: m.scene.lights.length,
                radar: (${paint})(m.cockpit.radar), gauges: (${paint})(m.cockpit.gauges), frame: (${paint})(m.cockpit.frame),
                shown: m.cockpit.wrap.style.display !== 'none' }))(WP.stage.manager)`);
            if (!(s.agl >= 4)) record(`it is ${s.agl} m above the snow`);
            if (s.wingmen !== 2 || s.craft !== 2 || s.lights < 4) record(`the formation: ${JSON.stringify(s)}`);
            if (s.radar < 0.01) record(`the radar has painted ${(s.radar * 100).toFixed(1)}% of its tube`);
            if (s.gauges < 0.03 || s.frame < 0.2 || !s.shown) record(`the cockpit: ${JSON.stringify(s)}`);
            if (await evaluate(DRAWN) < 30) record('barely drawn');
            await shoot('ice-patrol-cockpit');
            return s.agl >= 4;
        }],
        ['without WebGL it flies on as ridgelines, as far each second on Low as on High', async () => {
            const noGl = "(() => { const real = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (kind, ...rest) { return /^webgl/.test(kind) ? null : real.call(this, kind, ...rest); }; })()";
            const { identifier } = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: noGl });
            try {
                for (const tier of ['low', 'high']) {
                    if (!await stageWith('ice-patrol', null, `&seed=7&tier=${tier}`)) return record(`${tier}: not ready without WebGL`);
                    await sleep(500);
                    const at = () => evaluate('(m => ({ flat: m.flat, d: m.flight.distance, t: performance.now(), n: WP.host.frames.count, speed: m.speed, agl: m.flight.agl }))(WP.stage.manager)');
                    const a = await at();
                    await sleep(2500);
                    const b = await at();
                    const speed = (b.d - a.d) / ((b.t - a.t) / 1000), fps = (b.n - a.n) / ((b.t - a.t) / 1000);
                    if (!b.flat) record(`${tier}: still on WebGL`);
                    if (Math.abs(speed / b.speed - 1) > 0.08) record(`${tier}: ${speed.toFixed(1)} m/s at ${fps.toFixed(0)} fps; expected ${b.speed}`);
                    if (!(b.agl >= 4)) record(`${tier}: ${b.agl} m above the snow`);
                    if (await evaluate(DRAWN) < 20) record(`${tier}: barely drawn without WebGL`);
                }
                await shoot('ice-patrol-flat');
            } finally {
                await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
            }
            return true;
        }],
        ['night lights the lamps and the stars; a blizzard closes in; the keys step and save', async () => {
            if (!await stageWith('ice-patrol', { configVersion: 1, time: 'day', weather: 'clear' }, '&seed=7')) return record('midday: not ready');
            await sleep(1500);
            const day = await evaluate(AVERAGE);
            if (!await stageWith('ice-patrol', { configVersion: 1, time: 'night', weather: 'clear' }, '&seed=7')) return record('night: not ready');
            await sleep(1500);
            const night = await evaluate(AVERAGE);
            const n = await evaluate('(m => ({ lamps: m.lamps, stars: m.scene.stars, lamp: m.scene.lamp[0], aurora: m.scene.aurora, day: m.day }))(WP.stage.manager)');
            if (n.lamps < 0.9 || n.stars < 0.9 || n.lamp < 1 || !(n.aurora > 0)) record(`night: ${JSON.stringify(n)}`);
            if (night.reduce((a, b) => a + b) > day.reduce((a, b) => a + b) * 0.6) record(`night ${night} is hardly darker than midday ${day}`);
            await shoot('ice-patrol-night');
            if (!await stageWith('ice-patrol', { configVersion: 1, time: 'day', weather: 'blizzard', lamps: false }, '&seed=7')) return record('blizzard: not ready');
            await sleep(1500);
            const b = await evaluate('(m => ({ level: m.weather.level, see: m.air.visibility, flakes: m.scene.flakes, lamps: m.lamps, sun: m.scene.lightCol[0] }))(WP.stage.manager)');
            if (b.level < 0.99 || b.see > 600 || b.flakes < 0.95 || b.lamps !== 0 || b.sun > 0.4) record(`blizzard: ${JSON.stringify(b)}`);
            await shoot('ice-patrol-blizzard');
            // W, T, V and R, as the catalog binds them.
            const keys = await evaluate(`(m => { const run = key => WP.entry('ice-patrol').keys.find(k => k.keys.includes(key)).run(m, {}); return { w: run('w'), t: run('t'), v: [run('v'), run('v')], r: run('r'), config: m.config, saved: JSON.parse(localStorage.getItem('wp:ice-patrol')) }; })(WP.stage.manager)`);
            if (keys.config.weather !== 'auto' || keys.config.time !== 'dusk' || keys.config.cockpit !== 'none' || keys.config.radarRange !== 8000) record(`the keys left ${JSON.stringify(keys.config)}`);
            if ('weather' in keys.saved || keys.saved.time !== 'dusk' || keys.saved.cockpit !== 'none' || keys.saved.radarRange !== 8000) record(`the keys saved ${JSON.stringify(keys.saved)}`);
            if (!/comes and goes/.test(keys.w) || !/dusk/.test(keys.t) || !/8 km/.test(keys.r)) record(`the keys said ${JSON.stringify([keys.w, keys.t, keys.v, keys.r])}`);
            if (!await waitFor(() => evaluate("WP.stage.manager.cockpit.wrap.style.display === 'none'"), 8000)) record('V did not take the cockpit away');
            return true;
        }],
        ['a phone held upright: the panel fits, above the gesture bar', async () => {
            const viewport = { width: 412, height: 915, deviceScaleFactor: 2.625 };
            try {
                if (!await bootStage('w=ice-patrol&host=android&seed=7', viewport)) return record('not ready on a phone');
                await sleep(1500);
                const g = await evaluate('(m => ({ ...m.cockpit.g, coam: undefined, tanY: m.scene.tanY, inset: WP.host.insets.bottom }))(WP.stage.manager)');
                if (g.bottom !== 915 - g.inset || g.inset !== 48) record(`the panel ends at ${g.bottom} with a ${g.inset} px inset`);
                if (g.adi.x - g.adi.r < 0 || g.scope.x + g.scope.w / 2 > 412 || g.wide) record(`the instruments overflow: ${JSON.stringify({ adi: g.adi, scope: g.scope, wide: g.wide })}`);
                if (g.top < 915 * 0.6) record(`the panel takes ${(100 - g.top / 9.15).toFixed(0)}% of the screen`);
                if (g.tanY < Math.tan(31 * Math.PI / 180)) record(`a narrow view: tan ${g.tanY}`);
                await shoot('ice-patrol-phone');
            } finally {
                await cdp.send('Emulation.clearDeviceMetricsOverride');
            }
            return true;
        }],
    ],
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
    // §10.2: every state draws a real sky and says what it is; the views,
    // a phone, the night, a tap for a day's hours.
    weather: [
        ['the fixture forecast: live, cached, every kind, no "updated" line', async () => {
            current.network = true;
            await fresh(`${WEB}/stage.html?w=weather`, { 'wp:location': WEATHER_PLACE });
            if (!await waitFor(() => evaluate("WP.stage.ready && WP.stage.manager.state === 'live'"))) return record(`never went live (${await evaluate('WP.stage.manager?.state')})`);
            const s = await counts("({ banner: m.banner, kinds: new Set(m.forecast.hours.map(h => WeatherData.kind(h.code))).size, cached: !!localStorage.getItem('wp:weather:forecast'), status: m.status })");
            if (s.banner) record(`a fresh forecast shows "${s.banner}"`);
            if (s.kinds !== 15) record(`${s.kinds} kinds in the fixture's hours, want all 15`);
            if (!s.cached) record('the forecast was not cached');
            // A snowy day's amount is its fresh snow (3.1 cm in the fixture), not its water.
            const snow = await counts(`(d => [m.fall(d, 'snow'), m.units()])(m.forecast.days.find(d => WeatherData.kind(d.code) === 'snow'))`);
            if (snow[0] !== (snow[1] === 'imperial' ? '1.2 in' : '3.1 cm')) record(`snow day: ${snow[0]} (${snow[1]})`);
            if (!s.status.startsWith('✓ The forecast for Fixtureville')) record(`panel status: ${s.status}`);
            if (await evaluate(DRAWN) < 2) record('nothing drawn');
            const asked = current.requests.filter(url => url.startsWith('https://api.open-meteo.com/'));
            if (asked.length !== 1 || !asked[0].includes('latitude=1.5&longitude=2.5')) record(`asked Open-Meteo ${asked.length}× (${asked[0]})`);
            return true;
        }],
        ['no place: the sample, labelled, and nothing asked', async () => {
            await fresh(`${WEB}/stage.html?w=weather`);
            await waitFor(() => evaluate('WP.stage.ready'));
            await sleep(600);
            const s = await counts('({ state: m.state, banner: m.banner, sample: !!m.forecast.sample, status: m.status })');
            if (s.state !== 'sample' || !s.sample || !s.banner.startsWith('Sample forecast · set a place')) record(`no place: ${JSON.stringify(s)}`);
            if (!s.status.includes('📍 Location')) record(`panel status: ${s.status}`);
            if (current.requests.some(url => url.startsWith('https://'))) record('asked the network without a place');
            if (await evaluate(DRAWN) < 2) record('nothing drawn');
            return true;
        }],
        ['offline, or a bad answer, with nothing cached: the sample, "Couldn\'t reach"', async () => {
            for (const how of ['offline', 'bad', '503']) {
                current = { ...current, network: how !== 'offline', offline: how === 'offline', forecast: how };
                await fresh(`${WEB}/stage.html?w=weather`, { 'wp:location': WEATHER_PLACE });
                if (!await waitFor(() => evaluate("WP.stage.ready && WP.stage.manager.state === 'error'"))) record(`${how}: state ${await evaluate('WP.stage.manager?.state')}`);
                const s = await counts('({ banner: m.banner, sample: !!m.forecast.sample })');
                if (!s.sample || !s.banner.startsWith('Couldn\'t reach Open-Meteo')) record(`${how}: ${JSON.stringify(s)}`);
                if (await evaluate(DRAWN) < 2) record(`${how}: nothing drawn`);
            }
            current.forecast = null;
            return true;
        }],
        ['an answer held back: the sample, dimmed, "Getting the forecast…"', async () => {
            current = { ...current, network: true, offline: false, forecast: 'hold' };
            await fresh(`${WEB}/stage.html?w=weather`, { 'wp:location': WEATHER_PLACE });
            await waitFor(() => evaluate('WP.stage.ready'));
            await sleep(800);
            const s = await counts('({ state: m.state, banner: m.banner, sample: !!m.forecast.sample, fetching: !!m.fetching, status: m.status })');
            if (s.state !== 'loading' || !s.sample || s.banner !== 'Getting the forecast…' || !s.fetching) record(`held back: ${JSON.stringify(s)}`);
            if (await evaluate(DRAWN) < 2) record('loading: nothing drawn');
            await shoot('weather-loading');
            current.forecast = null;
            return true;
        }],
        ['one good load, then offline: the cache, "updated 3 h ago · offline"', async () => {
            current.network = true;
            await fresh(`${WEB}/stage.html?w=weather`, { 'wp:location': WEATHER_PLACE });
            if (!await waitFor(() => evaluate("WP.stage.ready && WP.stage.manager.state === 'live'"))) return record('never went live');
            await evaluate(`(k => { const v = JSON.parse(localStorage.getItem(k)); v.forecast.fetchedAt -= 3 * 3600000; localStorage.setItem(k, JSON.stringify(v)); })('wp:weather:forecast')`);
            current.offline = true;
            await cdp.send('Page.navigate', { url: `${WEB}/stage.html?w=weather` });
            if (!await waitFor(() => evaluate("WP.stage.ready && WP.stage.manager.state === 'offline'"))) return record(`state ${await evaluate('WP.stage.manager?.state')}`);
            const s = await counts('({ banner: m.banner, sample: !!m.forecast.sample })');
            if (s.sample || s.banner !== 'updated 3 h ago · offline') record(`offline: ${JSON.stringify(s)}`);
            // A cache for somewhere else isn't shown.
            await evaluate(`localStorage.setItem('wp:location', JSON.stringify({ lat: -40.5, lon: 100.5, label: 'Elsewhere', source: 'typed' }))`);
            await cdp.send('Page.navigate', { url: `${WEB}/stage.html?w=weather` });
            await waitFor(() => evaluate('WP.stage.ready'));
            await sleep(400);
            if (!await evaluate('WP.stage.manager.forecast.sample')) record('showed another place\'s cached forecast');
            return true;
        }],
        ['V cycles days, hours and now, each drawn', async () => {
            await bootStage('w=weather');
            const seen = [await evaluate('WP.stage.manager.layout.view')];
            for (let i = 0; i < 3; i++) {
                await press('v');
                await sleep(300);
                seen.push(await evaluate('WP.stage.manager.layout.view'));
                if (await evaluate(DRAWN) < 2) record(`${seen.at(-1)}: nothing drawn`);
                if (!await evaluate('WP.stage.manager.scenes.length')) record(`${seen.at(-1)}: no scenes`);
            }
            if (seen.join() !== 'days,hours,now,days') record(`views went ${seen.join(' → ')}`);
            // A quality change that lands after stop() finds no canvas, and says nothing.
            const late = await evaluate(`(() => { const m = WP.stage.manager; m.stop(); try { m.onQuality(WP.host.quality); return 'ok'; } catch (e) { return String(e); } })()`);
            if (late !== 'ok') record(`onQuality after stop: ${late}`);
            return true;
        }],
        ['a phone with a gesture bar: cards wrap, nothing under the inset', async () => {
            await cdp.send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2.625, mobile: true });
            for (const view of ['days', 'hours', 'now']) {
                await stageWith('weather', { configVersion: 1, view }, '&insets=0,0,48,0');
                await sleep(300);
                const l = await counts('({ rows: m.layout.rows, bottom: m.layout.bottom, box: m.layout.box, H: innerHeight, W: innerWidth })');
                if (view === 'days' && l.rows < 2) record(`5 cards in ${l.rows} row on a phone`);
                if (l.bottom > l.H - 48) record(`${view}: drawn down to ${l.bottom.toFixed(0)}, under the 48 px inset (${l.H})`);
                if (l.box.x < 0 || l.box.x + l.box.w > l.W) record(`${view}: wider than the screen`);
            }
            const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
            writeFileSync(join(SHOTS, 'weather-phone.png'), Buffer.from(data, 'base64'));
            await cdp.send('Emulation.clearDeviceMetricsOverride');
            return true;
        }],
        ['?date= at night gives the night sky, at noon the day', async () => {
            const sky = {};
            for (const [name, time] of [['night', '23:30'], ['noon', '12:00']]) {
                await bootStage(`w=weather&date=2026-11-05T${time}`);
                await sleep(400);
                sky[name] = { phase: await evaluate('WP.stage.manager.skyState.phase'), colour: await evaluate(AVERAGE) };
            }
            const light = c => c[0] + c[1] + c[2];
            if (sky.night.phase !== 'night' || sky.noon.phase !== 'day') record(`phases: ${sky.night.phase} at night, ${sky.noon.phase} at noon`);
            if (!(light(sky.noon.colour) > light(sky.night.colour) * 2)) record(`noon ${sky.noon.colour} is not brighter than night ${sky.night.colour}`);
            return true;
        }],
        ['a tap on a day shows its hours; a tap outside goes back', async () => {
            await bootStage('w=weather');
            const card = await evaluate('WP.stage.manager.layout.hits[1]');
            await mouse('mousePressed', card.x + card.w / 2, card.y + card.h / 2);
            await mouse('mouseReleased', card.x + card.w / 2, card.y + card.h / 2);
            await sleep(200);
            const open = await counts('({ view: m.layout.view, date: m.selected?.date, hours: m.scenes.length })');
            if (open.view !== 'hours' || open.date !== card.date || !open.hours) record(`after a tap: ${JSON.stringify(open)}`);
            await mouse('mousePressed', 4, 4);
            await mouse('mouseReleased', 4, 4);
            await sleep(200);
            if (await evaluate('WP.stage.manager.layout.view') !== 'days') record('a tap outside did not go back');
            return true;
        }],
    ],
    'world-clock': [
        ['V cycles the map, the faces and the board, each drawn', async () => {
            await bootStage('w=world-clock&date=2026-11-05T17:50');
            const seen = [await evaluate('WP.stage.manager.layout.view')];
            for (let i = 0; i < 3; i++) {
                await press('v');
                await sleep(1800);   // past the crossfade, and the board's flaps
                const view = await evaluate('WP.stage.manager.layout.view');
                seen.push(view);
                if (await evaluate(DRAWN) < 2) record(`${view}: nothing drawn`);
                if (i < 2) await shoot(`world-clock-${view}`);
            }
            if (seen.join() !== 'map,faces,board,map') record(`views went ${seen.join(' → ')}`);
            return true;
        }],
        ['stretched, zoomed on home, the sun or the moon; borders, provinces and city names', async () => {
            const at = '&date=2026-11-05T17:50';
            const view = () => evaluate(`(m => ({ ...m.layout, W: innerWidth, H: innerHeight, sun: m.sun, moon: m.moon, atlas: !!m.views.map.atlas }))(WP.stage.manager)`);
            await stageWith('world-clock', { configVersion: 1, mapFit: 'stretch' }, at);
            await sleep(400);
            let v = await view();
            if (Math.abs(v.top) > 0.5 || Math.abs(v.mapHeight - v.H) > 0.5) record(`stretched: the map is ${v.mapHeight} tall from ${v.top}, on a ${v.H} screen`);
            if (await evaluate(DRAWN) < 2) record('stretched: nothing drawn');
            await shoot('world-clock-stretched');
            for (const zoomOn of ['home', 'sun', 'moon']) {
                await stageWith('world-clock', { configVersion: 1, zoom: 3, zoomOn, mapStyle: 'atlas', borders: true, provinces: true, placeLabels: 'major' }, at);
                await sleep(500);
                v = await view();
                if (v.mapWidth !== v.W * 3) record(`${zoomOn}: zoom 3 gives a map ${v.mapWidth} wide`);
                if (v.top > 0.5 || v.top + v.mapHeight < v.H - 0.5) record(`${zoomOn}: zoomed, the map ${v.top}–${v.top + v.mapHeight} doesn't cover the screen`);
                const want = zoomOn === 'home' ? await evaluate('WP.stage.manager.centerLon()') : v[zoomOn].lon;
                if (Math.abs(((v.centre - want) % 360 + 540) % 360 - 180) > 0.01) record(`${zoomOn}: centred on ${v.centre}, not ${want}`);
                if (!v.atlas) record(`${zoomOn}: borders on, but none drawn`);
                if (!v.places.length) record(`${zoomOn}: no city names`);
                if (await evaluate(DRAWN) < 2) record(`${zoomOn}: nothing drawn`);
                await shoot(`world-clock-zoom-${zoomOn}`);
            }
            const names = async placeLabels => {
                await stageWith('world-clock', { configVersion: 1, placeLabels }, at);
                await sleep(300);
                return (await view()).places;
            };
            const off = await names('off'), largest = await names('largest'), major = await names('major');
            if (off.length || largest.length < 15 || major.length <= largest.length) record(`city names: ${off.length} off, ${largest.length} largest, ${major.length} major`);
            return true;
        }],
        ['every map look draws; L steps through them', async () => {
            for (const look of ['atlas', 'blueprint', 'paper']) {
                await stageWith('world-clock', { configVersion: 1, mapStyle: look }, '&date=2026-11-05T17:50');
                await sleep(400);
                if (await evaluate(DRAWN) < 2) record(`${look}: nothing drawn`);
                await shoot(`world-clock-${look}`);
            }
            await bootStage('w=world-clock');
            const looks = [];
            for (let i = 0; i < 4; i++) { await press('l'); looks.push(await evaluate('WP.stage.manager.config.mapStyle')); }
            if (looks.join() !== 'atlas,blueprint,paper,night-lights') record(`L went ${looks.join(' → ')}`);
            // Low: no twilight bands and no city lights, still a whole night.
            await bootStage('w=world-clock&tier=low&date=2026-11-05T17:50');
            await sleep(400);
            if (await counts(`m.fx('twilight') || m.fx('cityLights')`)) record('Low kept its effects');
            if (await evaluate(DRAWN) < 2) record('Low: nothing drawn');
            await shoot('world-clock-low');
            return true;
        }],
        ['the June solstice: the far north in daylight, the far south in night', async () => {
            // Without the city lights, the night layer is the darkness alone.
            await stageWith('world-clock', { configVersion: 1, cityLights: false }, '&date=2026-06-21T12:00:00Z');
            await sleep(300);
            // The darkness's alpha along the top and bottom rows of the map.
            const rows = await evaluate(`(() => {
                const c = WP.stage.manager.views.map.night, p = document.createElement('canvas');
                p.width = c.width; p.height = c.height;
                const g = p.getContext('2d', { willReadFrequently: true });
                g.drawImage(c, 0, 0);
                const row = y => { const d = g.getImageData(0, y, c.width, 1).data; let s = 0; for (let i = 3; i < d.length; i += 4) s += d[i]; return s / c.width; };
                return { north: row(2), south: row(c.height - 3) };
            })()`);
            if (!(rows.north < 8)) record(`the far north is dark (alpha ${rows.north.toFixed(1)})`);
            if (!(rows.south > 120)) record(`the far south isn't dark (alpha ${rows.south.toFixed(1)})`);
            // And on screen: the top of the map brighter than its bottom.
            const lit = await evaluate(`(() => {
                const m = WP.stage.manager.views.map, c = document.querySelector('canvas'), d = WP.stage.manager.dpr;
                const p = document.createElement('canvas'); p.width = c.width; p.height = c.height;
                const g = p.getContext('2d', { willReadFrequently: true }); g.drawImage(c, 0, 0);
                const at = y => { const px = g.getImageData(0, Math.round(y * d), c.width, 1).data; let s = 0; for (let i = 0; i < px.length; i += 4) s += px[i] + px[i + 1] + px[i + 2]; return s / c.width; };
                return { north: at(m.top + 2), south: at(m.top + m.mh - 3) };
            })()`);
            if (!(lit.north > lit.south * 1.5)) record(`on screen the north (${lit.north.toFixed(0)}) isn't lit against the south (${lit.south.toFixed(0)})`);
            return true;
        }],
        ['city lights only on the night side, each by its own sun', async () => {
            await stageWith('world-clock', { configVersion: 1 }, '&date=2026-11-05T22:50:00Z');
            await sleep(400);
            const lights = await counts(`(() => {
                const map = m.views.map, c = map.night, ms = map.ms, date = WP.host.now(), sun = WorldClockMath.subsolar(date);
                const p = document.createElement('canvas'); p.width = c.width; p.height = c.height;
                const g = p.getContext('2d', { willReadFrequently: true }); g.drawImage(c, 0, 0);
                const data = g.getImageData(0, 0, c.width, c.height).data;
                const [r0] = map.look.night;
                const at = s => { const x = Math.floor((s.x + s.r / 2) * ms), y = Math.floor((s.y + s.r / 2) * ms); return x < 0 || y < 0 || x >= c.width || y >= c.height ? null : (y * c.width + x) * 4; };
                let day = 0, dayLit = 0, night = 0, nightLit = 0;
                // The cities' own bright specks (the large ones), well inside the day or the night.
                for (const s of map.specks || []) {
                    if (s.a < 0.9) continue;
                    const alt = WorldClockMath.sunAltitude(s.lat, s.lon, date, sun), o = at(s);
                    if (o === null) continue;
                    if (alt > 5) { day++; if (data[o + 3] > 0) dayLit++; }
                    if (alt < -20) { night++; if (data[o] > r0 + 60) nightLit++; }
                }
                return { day, dayLit, night, nightLit, specks: (map.specks || []).length };
            })()`);
            if (!lights.specks) record('no city lights at all');
            if (lights.day < 5 || lights.night < 5) record(`too few cities to judge: ${JSON.stringify(lights)}`);
            if (lights.dayLit) record(`${lights.dayLit} of ${lights.day} cities in daylight are lit`);
            if (lights.nightLit < lights.night * 0.8) record(`only ${lights.nightLit} of ${lights.night} cities deep in the night are lit`);
            return true;
        }],
        ['the March equinox: the night\'s edges are near-vertical', async () => {
            for (const twilight of ['sharp', 'soft']) {
                await stageWith('world-clock', { configVersion: 1, twilight, cityLights: false }, '&date=2026-03-20T14:46:00Z');
                await sleep(300);
                const edges = await evaluate(`(() => {
                    const c = WP.stage.manager.views.map.night, p = document.createElement('canvas');
                    p.width = c.width; p.height = c.height;
                    const g = p.getContext('2d', { willReadFrequently: true });
                    g.drawImage(c, 0, 0);
                    let top = 0;
                    const d = g.getImageData(0, Math.round(c.height / 2), c.width, 1).data;
                    for (let i = 3; i < d.length; i += 4) top = Math.max(top, d[i]);
                    // Where each row crosses into the night (west) and out of it (east).
                    return [60, 30, 0, -30, -60].map(lat => {
                        const y = Math.round((90 - lat) / 180 * c.height), row = g.getImageData(0, y, c.width, 1).data, cut = top * ${twilight === 'sharp' ? 0.2 : 0.5};
                        const cross = [];
                        for (let x = 1; x < c.width; x++) if ((row[x * 4 + 3] > cut) !== (row[x * 4 - 1] > cut)) cross.push(x / c.width);
                        return cross;
                    });
                })()`);
                if (edges.some(e => e.length !== 2)) { record(`${twilight}: edges per row ${edges.map(e => e.length).join()}`); continue; }
                for (const side of [0, 1]) {
                    const xs = edges.map(e => e[side]), spread = Math.max(...xs) - Math.min(...xs);
                    if (spread > (twilight === 'sharp' ? 0.006 : 0.03)) record(`${twilight}: the ${side ? 'eastern' : 'western'} edge leans (${(spread * 100).toFixed(1)}% of the width)`);
                }
                const width = edges[2][1] - edges[2][0];
                if (Math.abs(width - 0.5) > (twilight === 'sharp' ? 0.01 : 0.06)) record(`${twilight}: the night is ${(width * 100).toFixed(0)}% of the world`);
            }
            return true;
        }],
        ['a custom Fixture=Asia/Kathmandu shows UTC+5:45; a bad zone is in the panel\'s status', async () => {
            await stageWith('world-clock', { configVersion: 1, custom: 'Fixture=Asia/Kathmandu' });
            await sleep(300);
            const card = await counts(`m.layout.cards.find(c => c.text.startsWith('Fixture'))?.text`);
            if (!card || !card.includes('UTC+5:45')) record(`the Fixture card says ${card}`);
            for (const view of ['faces', 'board']) {
                await stageWith('world-clock', { configVersion: 1, view, custom: 'Fixture=Asia/Kathmandu' });
                await sleep(2500);
                const text = await counts(view === 'faces' ? `m.layout.faces.find(f => f.text.startsWith('Fixture'))?.text` : `m.layout.shown.find(r => r.startsWith('FIXTURE'))`);
                if (!text || !text.includes('5:45')) record(`${view}: the Fixture row says ${JSON.stringify(text)}`);
            }
            await fresh(`${WEB}/index.html?w=world-clock&panel=open`, { 'wp:world-clock': { configVersion: 1, custom: 'Fixture=Asia/Kathmandu, Nowhere=Mars/Olympus' } });
            const status = await waitFor(() => evaluate(`document.querySelector('#panel .setting-status[data-name=custom]:not([hidden])')?.textContent`), 6000);
            if (!status || !status.includes('Mars/Olympus')) record(`panel status: ${JSON.stringify(status)}`);
            return true;
        }],
        ['a phone with a gesture bar, a taskbar: everything above the inset', async () => {
            const phone = { width: 412, height: 915, deviceScaleFactor: 2.625, mobile: true };
            for (const [size, viewport] of [['phone', phone], ['desktop', null]]) {
                for (const view of ['map', 'faces', 'board']) {
                    if (viewport) await cdp.send('Emulation.setDeviceMetricsOverride', viewport);
                    else await cdp.send('Emulation.clearDeviceMetricsOverride');
                    await stageWith('world-clock', { configVersion: 1, view, cities: ['local', 'utc', 'new-york', 'london', 'tokyo', 'sydney', 'kolkata', 'sao-paulo'] }, '&insets=0,0,48,0&date=2026-11-05T17:50');
                    await sleep(view === 'board' ? 2500 : 400);
                    const l = await counts('({ bottom: m.layout.bottom, H: innerHeight, W: innerWidth, cards: m.layout.cards, board: m.layout.board })');
                    if (!(l.bottom > 0)) record(`${size} ${view}: nothing laid out`);
                    if (l.bottom > l.H - 48) record(`${size} ${view}: drawn down to ${l.bottom.toFixed(0)}, under the 48 px inset (${l.H})`);
                    for (const c of l.cards || []) if (c.x < 0 || c.x + c.w > l.W + 0.5 || c.y < 0) record(`${size}: ${c.id}'s label is off screen`);
                    if (l.board && (l.board.x < 0 || l.board.x + l.board.w > l.W)) record(`${size}: the board is wider than the screen`);
                    if (size === 'phone') await shoot(`world-clock-phone-${view}`);
                }
            }
            await cdp.send('Emulation.clearDeviceMetricsOverride');
            return true;
        }],
        ['still, it idles: about a frame a second on every view', async () => {
            for (const view of ['map', 'faces', 'board']) {
                await stageWith('world-clock', { configVersion: 1, view, seconds: view === 'faces' });
                await sleep(view === 'board' ? 3000 : 1200);
                const fps = await stageFps(4000);
                if (fps > 1.6 || fps < 0.5) record(`${view}: ${fps.toFixed(2)} fps while still`);
            }
            return true;
        }],
        ['the board gains its DAY column when a city rolls over to tomorrow', async () => {
            // Seen from New York at 09:55, Tokyo is at 23:55 the same day: no DAY column.
            await cdp.send('Emulation.setTimezoneOverride', { timezoneId: 'America/New_York' });
            try {
                await stageWith('world-clock', { configVersion: 1, view: 'board' }, '&date=2026-11-05T14:55:00Z');
                await sleep(2500);
                const before = await counts('m.views.board.plan.columns.map(c => c.key).join()');
                if (before.includes('day')) record(`before midnight in Tokyo the board has ${before}`);
                // Ten minutes on: Tokyo is in tomorrow.
                await evaluate('(now => { WP.host.now = () => new Date(now().getTime() + 600000); })(WP.host.now); WP.stage.manager.wake()');
                if (!await waitFor(() => counts(`m.views.board.plan.columns.some(c => c.key === 'day') && m.layout.rows.some(r => r.startsWith('TOKYO') && r.includes('FRI'))`), 4000)) {
                    record(`after Tokyo's midnight: ${JSON.stringify(await counts('({ columns: m.views.board.plan.columns.map(c => c.key), rows: m.layout.rows })'))}`);
                }
            } finally {
                await cdp.send('Emulation.setTimezoneOverride', { timezoneId: '' });
            }
            return true;
        }],
        ['a tap on a city makes it home, and the map recentres there; M steps the centre', async () => {
            await bootStage('w=world-clock&date=2026-11-05T17:50');
            await sleep(300);
            const card = await counts(`m.layout.cards.find(c => c.id === 'tokyo')`);
            if (!card) return record('no Tokyo card');
            await mouse('mousePressed', card.x + card.w / 2, card.y + card.h / 2);
            await mouse('mouseReleased', card.x + card.w / 2, card.y + card.h / 2);
            await waitFor(() => counts('Math.abs(m.views.map.centre - 139.69) < 0.1'), 4000);
            const after = await counts('({ home: m.home, centre: m.views.map.centre, highlighted: m.infos.find(i => i.home)?.id })');
            if (after.home !== 'tokyo' || after.highlighted !== 'tokyo' || Math.abs(after.centre - 139.69) > 0.1) record(`after a tap: ${JSON.stringify(after)}`);
            await shoot('world-clock-tokyo');
            await press('m');
            if (!await waitFor(() => counts(`m.config.center === 'greenwich' && !m.home && Math.abs(m.views.map.centre) < 0.1`), 4000)) record(`M: ${JSON.stringify(await counts('({ center: m.config.center, centre: m.views.map.centre })'))}`);
            return true;
        }],
    ],
    // The Orrery (SPEC §10.26): the real sky in three looks, time-lapse,
    // cards, and a still picture that costs nothing.
    orrery: [
        ['each look draws, tilted too; L steps through them', async () => {
            for (const [name, settings] of [['space', {}], ['brass', { look: 'brass' }], ['chart', { look: 'chart' }], ['chart-night', { look: 'chart', chartPalette: 'night' }],
                ['tilted', { view: 'tilted' }], ['brass-tilted', { look: 'brass', view: 'tilted' }], ['inner', { scale: 'inner' }], ['true', { scale: 'true', showPluto: true }]]) {
                await stageWith('orrery', { configVersion: 1, ...settings }, '&date=2026-11-05T21:00');
                await sleep(500);
                if (await evaluate(DRAWN) < 2) record(`${name}: nothing drawn`);
                const bad = await counts(`Object.entries(m.debugPositions().bodies).filter(([, p]) => ![p.x, p.y, p.r].every(Number.isFinite)).map(([id]) => id)`);
                if (bad.length) record(`${name}: not finite: ${bad.join()}`);
                await shoot(`orrery-${name}`);
            }
            await bootStage('w=orrery');
            const looks = [];
            for (let i = 0; i < 3; i++) { await press('l'); looks.push(await counts('m.config.look')); }
            if (looks.join() !== 'brass,chart,space') record(`L went ${looks.join(' → ')}`);
            const scales = [];
            for (let i = 0; i < 3; i++) { await press('s'); scales.push(await counts('m.config.scale')); }
            if (scales.join() !== 'true,inner,compressed') record(`S went ${scales.join(' → ')}`);
            return true;
        }],
        ['Mars at opposition (2025-01-16): on the Earth\'s ray from the Sun, at every scale', async () => {
            for (const settings of [{}, { scale: 'true' }, { scale: 'inner' }, { look: 'brass' }, { view: 'tilted', drift: false }]) {
                await stageWith('orrery', { configVersion: 1, ...settings }, '&date=2025-01-16T12:00:00Z');
                await sleep(300);
                const p = await counts('m.debugPositions()');
                const angle = id => Math.atan2(p.bodies[id].y - p.sun.y, p.bodies[id].x - p.sun.x) * 180 / Math.PI;
                const off = Math.abs(((angle('mars') - angle('earth')) % 360 + 540) % 360 - 180);
                const farther = Math.hypot(p.bodies.mars.x - p.sun.x, p.bodies.mars.y - p.sun.y) > Math.hypot(p.bodies.earth.x - p.sun.x, p.bodies.earth.y - p.sun.y);
                if (off > 2 || !farther) record(`${JSON.stringify(settings)}: Mars is ${off.toFixed(2)}° off the Earth's ray${farther ? '' : ', and nearer the Sun'}`);
                if (!settings.scale && !settings.look && !settings.view) {
                    const retro = await counts(`m.scene.bodies.find(b => b.id === 'mars').retro`);
                    if (!retro) record('Mars at opposition is not retrograde');
                }
            }
            return true;
        }],
        ['= speeds up with a toast and the date runs; - slows; 0 is now again', async () => {
            await fresh(`${WEB}/index.html?w=orrery`);
            await waitFor(() => evaluate('WP.player?.stage?.ready'));
            await sleep(400);
            await press('=');
            const toast = await waitFor(() => evaluate(`document.getElementById('toast').classList.contains('show') && document.getElementById('toast').textContent`), 2000);
            if (!toast || !toast.includes('1 h/s')) record(`no speed toast (got ${JSON.stringify(toast)})`);
            await bootStage('w=orrery');
            await sleep(300);
            const start = await counts('m.sim');
            await press('=');
            await press('+');
            const said = await counts('({ speed: m.config.speed, said: m.said })');
            if (said.speed !== 'day' || !said.said?.includes('1 day/s')) record(`= = gave ${JSON.stringify(said)}`);
            await sleep(1500);
            const run = await counts('({ sim: m.sim, line: m.debugPositions().readout[0] })');
            const days = (run.sim - start) / 86400000;
            if (days < 0.8 || days > 3) record(`1.5 s at 1 day/s moved ${days.toFixed(2)} days`);
            if (!/^1 day\/s · .+ · (March|June|September|December) (equinox|solstice)/.test(run.line)) record(`readout: ${run.line}`);
            await sleep(1200);
            if (await counts('m.debugPositions().readout[0]') === run.line && await counts('m.sim') === run.sim) record('the date readout stood still');
            await press('-');
            if (await counts('m.config.speed') !== 'hour') record('- did not slow to 1 h/s');
            await press('0');
            const back = await counts('({ speed: m.config.speed, gap: Math.abs(m.sim - WP.host.now().getTime()), said: m.said })');
            if (back.speed !== 'live' || back.gap > 5000 || !back.said.includes('now')) record(`0 gave ${JSON.stringify(back)}`);
            return true;
        }],
        ['far dates: clamped to 1000–3000, flagged approximate, never NaN', async () => {
            await bootStage('w=orrery&date=1650-06-01T00:00:00Z');
            await sleep(300);
            const early = await counts('({ line: m.debugPositions().readout[0], finite: Object.values(m.debugPositions().bodies).every(p => Number.isFinite(p.x + p.y)) })');
            if (!early.line.includes('approximate') || !early.finite) record(`1650: ${JSON.stringify(early)}`);
            // A clock in the first century (the long table's clamp starts at 1000).
            await evaluate('WP.host.now = () => new Date(-61e12); WP.stage.manager.wake()');
            await sleep(300);
            if (await counts('new Date(m.sim).getUTCFullYear()') !== 1000) record(`a first-century clock gave ${await counts('new Date(m.sim).toISOString()')}`);
            await stageWith('orrery', { configVersion: 1, speed: 'year' });
            await evaluate('WP.stage.manager.sim = Date.UTC(2999, 11, 1)');
            await sleep(1500);
            const end = await counts('({ year: new Date(m.sim).getUTCFullYear(), finite: Object.values(m.debugPositions().bodies).every(p => Number.isFinite(p.x + p.y)), line: m.debugPositions().readout[0] })');
            if (end.year !== 2999 || !end.finite || !end.line.includes('approximate')) record(`at the end of the tables: ${JSON.stringify(end)}`);
            return true;
        }],
        ['a tap on a planet shows its card; on empty space it goes', async () => {
            await bootStage('w=orrery&date=2026-11-05T21:00');
            await sleep(300);
            for (const id of ['mars', 'jupiter', 'earth']) {
                const p = await counts(`m.debugPositions().bodies.${id}`);
                await mouse('mousePressed', p.x, p.y);
                await mouse('mouseReleased', p.x, p.y);
                await sleep(200);
                const card = await counts('m.debugPositions().card');
                if (!card || !card.title.includes(id[0].toUpperCase() + id.slice(1))) { record(`${id}: card ${JSON.stringify(card)}`); continue; }
                const text = card.lines.join(' | ');
                if (!/AU from the Sun · [\d.]+ light-minutes/.test(text)) record(`${id}: no distance from the Sun: ${text}`);
                if (id !== 'earth' && !/AU from the Earth/.test(text)) record(`${id}: no distance from the Earth: ${text}`);
                if (id !== 'earth' && !/In our sky: [A-Z]/.test(text)) record(`${id}: no constellation: ${text}`);
                if (id !== 'earth' && !/Retrograde|Moving east/.test(text)) record(`${id}: no motion: ${text}`);
                if (card.x < 0 || card.y < 0 || card.x + card.w > 1280 || card.y + card.h > 800) record(`${id}: the card is off screen`);
                if (id === 'mars') await shoot('orrery-card');
            }
            // Jupiter's moons, close by Jupiter: the moon's card, not Jupiter's.
            for (const id of ['callisto', 'io']) {
                const p = await counts(`m.debugPositions().bodies.${id}`);
                if (!p) { record(`${id}: not drawn`); continue; }
                await mouse('mousePressed', p.x, p.y);
                await mouse('mouseReleased', p.x, p.y);
                await sleep(200);
                const card = await counts('m.debugPositions().card');
                if (!card || !card.title.includes('a moon of Jupiter') || !card.title.toLowerCase().startsWith(id)) record(`${id}: card ${JSON.stringify(card?.title)}`);
                else if (!/Round Jupiter every [\d.]+ days/.test(card.lines.join(' | '))) record(`${id}: ${card.lines.join(' | ')}`);
            }
            await mouse('mousePressed', 30, 760);
            await mouse('mouseReleased', 30, 760);
            await sleep(200);
            if (await counts('m.selected')) record('a tap on empty space kept the card');
            return true;
        }],
        ['a drag turns the tilted camera; from above it asks for no frames', async () => {
            await stageWith('orrery', { configVersion: 1 });
            await sleep(300);
            await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 700, y: 500, button: 'left', clickCount: 1 });
            await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 760, y: 480, button: 'left', buttons: 1 });
            await sleep(100);
            if (await counts('!!m.drag')) record('a drag from above holds a drag (and full frame rate)');
            await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 760, y: 480, button: 'left', clickCount: 1 });
            await stageWith('orrery', { configVersion: 1, view: 'tilted', drift: false });
            await sleep(300);
            const before = await counts('({ az: m.camera.az, el: m.camera.el })');
            await drag([[700, 500], [760, 480], [820, 460], [880, 440]]);
            const after = await counts('({ az: m.camera.az, el: m.camera.el })');
            if (Math.abs(after.az - before.az) < 20) record(`the camera turned ${(after.az - before.az).toFixed(1)}°`);
            return true;
        }],
        ['a phone and a taskbar: the ring fits the short side, above the inset', async () => {
            const phone = { width: 412, height: 915, deviceScaleFactor: 2.625, mobile: true };
            try {
                for (const [size, viewport] of [['phone', phone], ['wide', { width: 1600, height: 600, deviceScaleFactor: 1, mobile: false }]]) {
                    await cdp.send('Emulation.setDeviceMetricsOverride', viewport);
                    for (const settings of [{}, { look: 'brass' }, { view: 'tilted' }, { look: 'chart' }]) {
                        await stageWith('orrery', { configVersion: 1, ...settings }, '&insets=0,0,48,0&date=2026-11-05T21:00');
                        await sleep(400);
                        const p = await counts('({ ...m.debugPositions(), W: innerWidth, H: innerHeight, plinth: m.base * 1.1 })');
                        const r = p.ring, name = `${size} ${JSON.stringify(settings)}`;
                        if (settings.look === 'brass' && r.y1 > p.H - 48 - p.plinth) record(`${name}: the ring reaches ${r.y1.toFixed(0)}, into the plinth at ${(p.H - 48 - p.plinth).toFixed(0)}`);
                        if (r.x0 < 0 || r.x1 > p.W || r.y0 < 0 || r.y1 > p.H - 48) record(`${name}: the ring ${r.x0.toFixed(0)}–${r.x1.toFixed(0)} × ${r.y0.toFixed(0)}–${r.y1.toFixed(0)} leaves ${p.W}×${p.H - 48}`);
                        const short = Math.min(p.W, p.H - 48), across = Math.max(r.x1 - r.x0, r.y1 - r.y0);
                        if (!settings.view && across < short * 0.85) record(`${name}: the ring spans ${across.toFixed(0)} of ${short}`);
                        if (size === 'phone' && !settings.look) await shoot(`orrery-phone${settings.view ? '-tilted' : ''}`);
                    }
                }
            } finally { await cdp.send('Emulation.clearDeviceMetricsOverride'); }
            return true;
        }],
        ['on battery the corona\'s shimmer stops: a frame a minute', async () => {
            await fresh(`${WEB}/index.html?w=orrery&tier=medium`);
            if (!await waitFor(() => inStage('WP.stage?.ready'))) return record('never ready');
            const fps = async () => { const a = await inStage('WP.host.frames.count'); await sleep(3000); return (await inStage('WP.host.frames.count') - a) / 3; };
            await sleep(1200);
            const plugged = await fps();
            if (plugged < 2) record(`plugged in, the shimmer ran at ${plugged.toFixed(1)} fps`);
            await evaluate(`WP.power({ battery: { charging: false, level: 0.6 } })`);
            await sleep(800);
            const battery = await fps();
            const reasons = await inStage('WP.host.power.reasons.join()');
            if (!reasons.includes('battery')) record(`the stage's power reasons: ${reasons}`);
            if (battery > 0.7) record(`on battery: ${battery.toFixed(1)} fps (want the once-a-minute idle)`);
            await evaluate(`WP.power({ battery: { charging: true, level: 0.6 } })`);
            return true;
        }],
        ['the galactic compass points at Sagittarius A*, in any corner; the Milky Way can go', async () => {
            await stageWith('orrery', { configVersion: 1 }, '&date=2026-11-05T21:00');
            await sleep(300);
            const top = await counts('({ c: m.debugPositions().compass, lon: m.galaxyLon })');
            if (!top.c) return record('no compass by default');
            if (Math.abs(top.lon - 266.84) > 0.2) record(`the galactic centre is at ecliptic longitude ${top.lon.toFixed(2)}° (want 266.84°)`);
            // From above, longitude λ is at screen angle −λ (y runs down).
            const off = Math.abs(((top.c.dir + top.lon) % 360 + 540) % 360 - 180);
            if (off > 1) record(`from above the needle is ${off.toFixed(1)}° off the galactic centre`);
            // Every corner on screen, in every look; clear of the readout, the plinth and the legend.
            for (const look of ['space', 'brass', 'chart']) {
                for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
                    await stageWith('orrery', { configVersion: 1, look, galaxyCompass: corner }, '&date=2026-11-05T21:00');
                    await sleep(250);
                    const p = await counts('({ c: m.debugPositions().compass, W: innerWidth, H: innerHeight, legend: m.legendBox, plinth: m.base ? innerHeight - m.base * 1.1 : null, readout: 16 * m.k + 12.5 * m.k * 4.4 })');
                    const c = p.c, name = `${look} ${corner}`;
                    if (!c) { record(`${name}: no compass`); continue; }
                    if (c.x - c.r < 0 || c.x + c.r > p.W || c.y - c.r < 0 || c.y + c.r > p.H) record(`${name}: off screen at ${Math.round(c.x)},${Math.round(c.y)}`);
                    if (corner === 'top-left' && c.y - c.r < p.readout) record(`${name}: over the readout`);
                    if (p.plinth && corner.startsWith('bottom') && Math.abs(c.y + c.r * 1.5 - p.plinth) > 2) record(`${name}: not standing on the plinth`);
                    const L = p.legend;
                    if (L && c.x + c.r > L.x0 && c.x - c.r < L.x1 && c.y + c.r > L.y0 && c.y - c.r < L.y1) record(`${name}: over the legend`);
                    if (look === 'brass' && corner === 'bottom-left') await shoot('orrery-compass-brass');
                }
            }
            // Tilted, it turns with the camera.
            await stageWith('orrery', { configVersion: 1, view: 'tilted', drift: false });
            await sleep(300);
            const a = await counts('m.debugPositions().compass.dir');
            await drag([[700, 500], [800, 500], [900, 500]]);
            const b = await counts('m.debugPositions().compass.dir');
            if (Math.abs(((a - b) % 360 + 540) % 360 - 180) < 5) record(`turning the camera moved the needle ${(b - a).toFixed(1)}°`);
            // A tap on it tells what it points at.
            await stageWith('orrery', { configVersion: 1 }, '&date=2026-11-05T21:00');
            await sleep(300);
            const c = await counts('m.debugPositions().compass');
            await mouse('mousePressed', c.x, c.y);
            await mouse('mouseReleased', c.x, c.y);
            await sleep(200);
            const card = await counts('m.debugPositions().card');
            if (!card?.title.includes('Galactic Core') || !/In our sky: Sagittarius/.test(card.lines.join(' | '))) record(`the compass's card: ${JSON.stringify(card)}`);
            else await shoot('orrery-compass-card');
            await stageWith('orrery', { configVersion: 1, galaxyCompass: 'off' });
            await sleep(250);
            if (await counts('m.debugPositions().compass')) record('the compass stayed when off');
            // Without the Milky Way the sky is darker (and the stars still there).
            const glow = await evaluate(AVERAGE);
            await stageWith('orrery', { configVersion: 1, galaxyCompass: 'off', milkyWay: false });
            await sleep(250);
            const plain = await evaluate(AVERAGE);
            const sum = v => v[0] + v[1] + v[2];
            if (sum(plain) >= sum(glow)) record(`no Milky Way is no darker: ${plain} against ${glow}`);
            if (await evaluate(DRAWN) < 2) record('no Milky Way: nothing drawn');
            await shoot('orrery-no-milky-way');
            return true;
        }],
        ['still and live it idles; time-lapse and drift run', async () => {
            const cases = [
                ['live, on Low', '&tier=low', {}, 0, 0.6],
                ['live, brass', '', { look: 'brass' }, 0, 0.6],
                ['live, the corona\'s shimmer', '&tier=medium', {}, 2, 9],
                ['a day a second', '&tier=medium', { speed: 'day' }, 10, 40],
                ['tilted, drifting', '&tier=medium', { view: 'tilted' }, 10, 40],
            ];
            for (const [name, query, settings, low, high] of cases) {
                await stageWith('orrery', { configVersion: 1, ...settings }, query);
                await sleep(1200);
                const fps = await stageFps(3000);
                if (fps < low || fps > high) record(`${name}: ${fps.toFixed(1)} fps (want ${low}–${high})`);
            }
            await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
            try {
                await stageWith('orrery', { configVersion: 1 }, '&tier=medium');
                await sleep(1200);
                const fps = await stageFps(3000);
                if (fps > 0.6) record(`reduced motion: ${fps.toFixed(1)} fps`);
            } finally { await cdp.send('Emulation.setEmulatedMedia', { features: [] }); }
            // Low sheds the corona's glow and the belt's rocks, and still draws.
            await bootStage('w=orrery&tier=low');
            await sleep(400);
            if (await counts(`m.wants('glow') || m.wants('belt')`)) record('Low kept its effects');
            if (await evaluate(DRAWN) < 2) record('Low: nothing drawn');
            await shoot('orrery-low');
            return true;
        }],
    ],
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
        // The Ambilight frame's promises: a few samples a second, the wall
        // takes the picture's colours, and Low never touches the video.
        ['Ambilight: at most 5 samples a second, the wall takes the video\'s colours, none at Low', async () => {
            const mock = jellyfinServer();
            const settings = { order: 'inOrder', frame: 'ambilight', subtitles: 'off', showTitle: false };
            // The wall to the left of the panel, from a real screenshot, as
            // its mean chroma (max - min channel): grey is near 0.
            const wall = async () => {
                const clip = await counts(`(L => ({ x: L.panel.x - L.spread * 0.45, y: L.panel.y + L.panel.h * 0.2, width: L.spread * 0.4, height: L.panel.h * 0.6, scale: 1 }))(m.layout)`);
                const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', clip });
                return evaluate(`new Promise(done => { const i = new Image(); i.onload = () => {
                    const c = document.createElement('canvas'); c.width = c.height = 8;
                    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(i, 0, 0, 8, 8);
                    const d = g.getImageData(0, 0, 8, 8).data; let sum = 0;
                    for (let k = 0; k < d.length; k += 4) sum += Math.max(d[k], d[k + 1], d[k + 2]) - Math.min(d[k], d[k + 1], d[k + 2]);
                    done(sum / 64); }; i.src = 'data:image/png;base64,${data}'; })`);
            };
            const samples = () => evaluate(`JellyfinFrames.get('ambilight').stats.samples`);
            const result = {};
            for (const tier of ['medium', 'low']) {
                await fresh(`${WEB}/stage.html?w=jellyfin&tier=${tier}`, jellyfinSignedIn(mock, settings));
                if (!await waitFor(() => counts(`m.state === 'playing' && m.video.currentTime > 0.5`), 10000)) return record(`${tier}: never played`);
                await sleep(1500);
                const before = await samples();
                await sleep(3000);
                result[tier] = { samples: await samples() - before, total: await samples(), chroma: await wall() };
                if (tier === 'medium') await shoot('jellyfin-ambilight-glow');
            }
            const { medium, low } = result;
            if (medium.samples > 16) record(`${medium.samples} samples in 3 s at Medium`);
            if (medium.samples < 6) record(`only ${medium.samples} samples in 3 s at Medium`);
            if (low.total) record(`${low.total} samples at Low`);
            if (!(medium.chroma > low.chroma + 10)) record(`the wall isn't coloured: chroma ${medium.chroma.toFixed(1)} at Medium, ${low.chroma.toFixed(1)} at Low`);
            console.log(`    ambilight: ${medium.samples} samples in 3 s; wall chroma ${medium.chroma.toFixed(1)} at Medium, ${low.chroma.toFixed(1)} at Low`);
            return true;
        }],
        ['titled frames show the playing title, repainted once per item, not every frame', async () => {
            const mock = jellyfinServer();
            await fresh(`${WEB}/stage.html?w=jellyfin&thumb=1`);
            await stageReady();
            // The frames that write the title as text; the drive-in hangs its
            // letters one by one (the next check covers every titled frame).
            const titled = ['gallery', 'arcade'];
            const squash = text => text.toLowerCase().replace(/[^a-z0-9]/g, '');
            for (const frame of titled) {
                await fresh(`${WEB}/stage.html?w=jellyfin&tier=high`, jellyfinSignedIn(mock, { order: 'inOrder', subtitles: 'off', frame }));   // a fixed tier: Auto's changes repaint too
                if (!await waitFor(() => counts(`m.state === 'playing' && m.video.currentTime > 0.2`), 10000)) { record(`${frame}: never played`); continue; }
                // From here on, note every word the art canvas draws.
                await counts(`(c => { window.artText = []; for (const k of ['fillText', 'strokeText']) { const real = c[k]; c[k] = function (text, ...rest) { window.artText.push(String(text)); return real.call(this, text, ...rest); }; } })(m.artCtx)`);
                const before = await counts('({ paints: m.paints, name: m.item.Name })');
                await counts('m.skip(1)');
                if (!await waitFor(() => counts(`m.state === 'playing' && m.item.Name !== ${JSON.stringify(before.name)} && m.video.currentTime > 0.2`), 8000)) { record(`${frame}: never moved on`); continue; }
                const after = await counts('({ paints: m.paints, name: m.item.Name })');
                if (!squash((await evaluate('window.artText')).join('')).includes(squash(after.name))) record(`${frame}: the art doesn't show "${after.name}"`);
                if (after.paints - before.paints !== 1) record(`${frame}: painted ${after.paints - before.paints} times for one new item`);
                await sleep(1500);
                if (await counts('m.paints') !== after.paints) record(`${frame}: repainted while the item played`);
                await shoot(`jellyfin-${frame}-titled`);
            }
            return titled.length > 0 || record('no titled frames');
        }],
        ['resume: a new tab carries on where the last left off, and keeps saving its place', async () => {
            const mock = jellyfinServer();
            const ids = ITEMS.map(item => item.Id), long = ITEMS.find(item => item.seconds >= 120).Id;
            // As a tab before this one left things: the bag one step before
            // the long film, and its place saved 15 s in.
            const stored = { ...jellyfinSignedIn(mock, { order: 'inOrder', subtitles: 'off', segment: 'whole' }),
                'wp:jellyfin:bag': { key: `o:${[...ids].sort().join(',')}`, order: ids, at: ids.indexOf(long) - 1 },
                'wp:jellyfin:positions': { [long]: 15 } };
            await fresh(`${WEB}/stage.html?w=jellyfin`, stored);
            if (!await waitFor(() => counts(`m.state === 'playing' && m.item.Id === ${JSON.stringify(long)} && m.video.currentTime > 14`), 10000)) {
                return record(`started at ${await counts('m.video?.currentTime')} on ${await counts('m.item?.Name')}`);
            }
            await sleep(11000);   // past one save
            const saved = await evaluate(`JSON.parse(localStorage.getItem('wp:jellyfin:positions'))[${JSON.stringify(long)}]`);
            if (!(saved >= 24)) record(`saved position ${saved}, not past 24 s`);
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
        ['cinema: the curtains part for the show, close on pause and between items', async () => {
            const mock = jellyfinServer();
            await fresh(`${WEB}/stage.html?w=jellyfin`, jellyfinSignedIn(mock, { order: 'inOrder', subtitles: 'off', showTitle: false, frame: 'cinema' }));
            if (!await waitFor(() => counts(`m.state === 'playing' && m.video.currentTime > 0.2`), 10000)) return record('never played');
            // The overlay's alpha just inside the left of the screen: velvet there means closed.
            const shut = () => counts(`(s => m.ctx.getImageData(Math.round((s.x + s.w * 0.12) * devicePixelRatio), Math.round((s.y + s.h * 0.6) * devicePixelRatio), 1, 1).data[3] > 230)(m.layout.screen)`);
            if (!await waitFor(async () => !await shut(), 3000)) record('curtains still closed once playing');
            await counts('m.togglePause()');
            if (!await waitFor(shut, 2000)) record('pause didn\'t close the curtains');
            await counts('m.togglePause()');
            // The curtains move in the wallpaper's own time, which a loaded machine
            // stretches; the wait ends as soon as they're open.
            if (!await waitFor(async () => !await shut(), 4000)) record('play didn\'t open them');
            await counts('m.skip(1)');
            if (!await waitFor(shut, 1500)) record('a change didn\'t close them');
            await shoot('jellyfin-cinema-closing');
            if (!await waitFor(async () => !await shut(), 3000)) record('they didn\'t reopen after the change');
            return true;
        }],
        ['mantel: the fire flickers at about 12 fps, and holds still on Low', async () => {
            const mock = jellyfinServer();
            for (const [tier, low, high] of [['medium', 10, 30], ['low', 0, 1]]) {
                await fresh(`${WEB}/stage.html?w=jellyfin&tier=${tier}`, jellyfinSignedIn(mock, { order: 'inOrder', subtitles: 'off', showTitle: false, frame: 'mantel' }));
                if (!await waitFor(() => counts(`m.state === 'playing' && m.video.currentTime > 0.2`), 10000)) return record(`${tier}: never played`);
                await sleep(4600);   // past the 🔇 badge's fade
                const drawn = await framesIn(2000);
                if (drawn < low || drawn > high) record(`${tier}: ${drawn} frames in 2 s`);
            }
            return true;
        }],
    ],
};

// Checks that only make sense against fixtures run only locally: Jellyfin's
// fixture server is plain http, which an https page (the live site) may not
// reach, and Weather's checks assert a made-up forecast and simulated outages,
// while the live run sends Open-Meteo's requests to the real service. The live
// run still boots each of them, with real network.
const LOCAL_ONLY = new Set(['jellyfin', 'weather']);

async function stageChecks(id) {
    const { check, failed } = checker();
    if (LIVE && LOCAL_ONLY.has(id)) return 0;
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

    await check('?insets= reaches the stage; host=windows is a kind', async () => {
        await fresh(`${WEB}/index.html?w=harvest&host=windows&insets=0,0,48,0`);
        if (await playerReady() !== 'harvest') return record('harvest not shown');
        const got = await inStage('JSON.stringify({ kind: WP.host.kind, insets: WP.host.insets })');
        const { kind, insets } = JSON.parse(got);
        if (kind !== 'windows' || insets.bottom !== 48 || insets.top || insets.left || insets.right) return record(`stage got ${got}`);
        await fresh(`${WEB}/index.html?w=harvest`);
        await playerReady();
        const plain = JSON.parse(await inStage('JSON.stringify(WP.host.insets)'));
        return plain.bottom === 0 || record(`no ?insets=, yet bottom ${plain.bottom}`);
    });

    await check('?display= keeps two monitors\' choices apart', async () => {
        // Only the first load clears storage; the rest navigate straight on,
        // so what the second and third read was written by show().
        const open = async display => {
            await cdp.send('Page.navigate', { url: `${WEB}/index.html?display=${display}&host=windows` });
            return playerReady();
        };
        await fresh(`${WEB}/index.html?display=m-aaaaaa&host=windows`);
        await playerReady();
        await evaluate("WP.player.show('snow', { persist: true })");
        await open('m-bbbbbb');
        await evaluate("WP.player.show('rain', { persist: true })");
        await open('m-aaaaaa');
        const again = await waitFor(async () => await evaluate('WP.player.choice') === 'snow' && 'snow');
        const got = await evaluate("JSON.stringify([localStorage.getItem('wp:current@m-aaaaaa'), localStorage.getItem('wp:current@m-bbbbbb'), localStorage.getItem('wp:current')])");
        if (again !== 'snow' || got !== JSON.stringify(['"snow"', '"rain"', null])) return record(`reopened ${again}, storage ${got}`);
        await evaluate("localStorage.setItem('wp:current', JSON.stringify('leaves'))");
        await open('m-cccccc');
        const inherited = await evaluate('WP.player.choice');
        return inherited === 'leaves' || record(`a new display showed ${inherited}, not the shared leaves`);
    });

    await check('] switches, persists and drops ?w= from the URL', async () => {
        // Its own start, not whatever page the checks before it left.
        await fresh(`${WEB}/index.html?w=rain`);
        if (await playerReady() !== 'rain') return record('rain not shown');
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
            await waitFor(() => evaluate(`document.querySelectorAll('#panel .settings .setting').length`), 4000);
            const rendered = await evaluate(`document.querySelectorAll('#panel .settings .setting').length`);
            const expected = await evaluate(`WP.schemaOf('${entry.id}').filter(c => c.key).length`);
            if (rendered !== expected) record(`${rendered} controls rendered; the schema has ${expected}`);
            // Change the first slider (or select) the way a person would.
            const changed = await evaluate(`(() => {
                const row = document.querySelector('#panel .settings .setting-range') || document.querySelector('#panel .settings .setting-select');
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
        await waitFor(() => evaluate(`!!document.querySelector('#panel .settings input[type=range]')`), 4000);
        await evaluate(`(() => { const i = document.querySelector('#panel .settings input[type=range]'); i.value = i.min; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
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


    await clockChecks(check, playerReady);

    return failed();
}

// ---- The clock overlay (SPEC §4.9) ------------------------------------------------
const clockText = () => evaluate(`document.querySelector('#clock .clock-face')?.innerText.replace(/\\s*\\n\\s*/g, ' | ') ?? null`);
const clockBox = () => evaluate(`WP.clockface?.view?.box ?? null`);
const clockOn = (url, stored = {}) => fresh(`${WEB}/${url}`, { 'wp:hinted': true, 'wp:clock': { configVersion: 1, enabled: true, ...stored } });

async function clockChecks(check, playerReady) {
    const visibleRows = () => evaluate(`document.querySelectorAll('#panel .clock-section .setting:not([hidden])').length`);
    const clockStage = (url, stored) => clockOn(url, stored).then(() => playerReady()).then(() => waitFor(() => evaluate(`!!document.querySelector('#clock .clock-face')`), 4000));

    await check('clock: off by default: nothing drawn, nothing loaded, nothing stored', async () => {
        await fresh(`${WEB}/index.html?w=rain`, { 'wp:hinted': true });
        await playerReady();
        await sleep(600);
        const state = await evaluate(`({ element: !!document.getElementById('clock'), code: typeof WP.clockface, stored: localStorage.getItem('wp:clock'), scripts: [...document.scripts].some(s => /clockface/.test(s.src)) })`);
        if (state.element) record('a #clock is in the page');
        if (state.code !== 'undefined' || state.scripts) record('the clock\'s code was loaded while it\'s off');
        if (state.stored !== null) record(`wrote wp:clock: ${state.stored}`);
        return !state.element && state.code === 'undefined';
    });

    await check('clock: ?clock=off beats a stored "on", and ?clock=on needs no setting', async () => {
        await clockOn('index.html?w=rain&clock=off');
        await playerReady();
        await sleep(500);
        if (await evaluate(`!!document.getElementById('clock')`)) record('?clock=off still showed it');
        await fresh(`${WEB}/index.html?w=rain&clock=on`, { 'wp:hinted': true });
        await playerReady();
        if (!await waitFor(() => evaluate(`!!document.querySelector('#clock .clock-face')`), 4000)) record('?clock=on showed nothing');
        if (await evaluate(`localStorage.getItem('wp:clock')`) !== null) record('?clock=on was persisted');
        return true;
    });

    await check('clock: a ?date= clock shows the right time and rolls over at midnight', async () => {
        await clockOn('index.html?w=rain&date=2026-12-31T23:59:50', { seconds: true, hour12: '12', date: 'medium', zone: 'local' });
        await playerReady();
        const before = await waitFor(async () => /^11:59:5\d PM \| Thu, Dec 31$/.test(await clockText()) && await clockText(), 4000);
        if (!before) return record(`before midnight it said ${JSON.stringify(await clockText())}`);
        const after = await waitFor(async () => /^12:00:0\d AM \| Fri, Jan 1$/.test(await clockText()) && await clockText(), 14000);
        if (!after) record(`after midnight it said ${JSON.stringify(await clockText())}`);
        return !!after;
    });

    await check('clock: a second zone, "tomorrow" and all', async () => {
        await clockOn('index.html?w=rain&date=2026-10-28T22:42:07', { zone: 'Pacific/Pago_Pago', secondOn: true, secondZone: 'Pacific/Auckland', date: 'none' });
        await playerReady();
        const text = await waitFor(async () => /AUCKLAND/i.test(await clockText()) && await clockText(), 4000);
        if (!text) return record(`it said ${JSON.stringify(await clockText())}`);
        // The label is set in capitals, and each part is a line of its own.
        const ok = /^\d+:42 [AP]M \| AUCKLAND \| \d+:42 [AP]M \| TOMORROW$/i.test(text);
        if (!ok) record(`it said ${JSON.stringify(text)}`);
        return ok;
    });

    await check('clock: K turns it on and off, with a toast, and it survives a wallpaper switch', async () => {
        await fresh(`${WEB}/index.html?w=rain`, { 'wp:hinted': true });
        await playerReady();
        await press('k');
        if (!await waitFor(() => evaluate(`!!document.querySelector('#clock .clock-face')`), 4000)) return record('K showed nothing');
        if (!/Clock on/.test(await evaluate(`document.getElementById('toast').textContent`))) record('no toast');
        if (await evaluate(`JSON.parse(localStorage.getItem('wp:clock')).enabled`) !== true) record('not stored');
        await evaluate(`window.__clock = document.getElementById('clock')`);
        await press(']');
        await waitFor(async () => await evaluate('WP.player.stage.ready && WP.player.stage.id') !== 'rain');
        await sleep(900);
        if (!await evaluate(`window.__clock === document.getElementById('clock') && __clock.isConnected`)) record('the clock was rebuilt when the wallpaper changed');
        if (await evaluate(`document.querySelectorAll('iframe').length`) !== 1) record('stages left behind');
        await press('k');
        await sleep(300);
        if (await evaluate(`!!document.getElementById('clock')`)) record('K again left it up');
        if (await evaluate(`localStorage.getItem('wp:clock')`) !== null) record('off should store nothing but the default');
        return true;
    });

    await check('clock: the panel\'s section is one row when off, seven more when on, every control renders', async () => {
        await fresh(`${WEB}/index.html?w=rain&panel=open`, { 'wp:hinted': true });
        await playerReady();
        if (!await waitFor(() => evaluate(`!!document.querySelector('#panel .clock-section')`), 4000)) return record('no Clock section in the panel');
        // What shows once the section is open: the main block's rows, and the sub-sections that aren't hidden.
        const shownRows = `[...document.querySelectorAll('#panel .clock-section > .settings-form > .setting')].filter(r => !r.hidden).length`;
        const off = await evaluate(`({ rows: ${shownRows}, groups: document.querySelectorAll('#panel .clock-section .settings-group:not([hidden])').length, hint: document.querySelector('#panel .clock-section > summary').textContent })`);
        if (off.rows !== 1) record(`${off.rows} rows while it's off`);
        if (off.groups !== 0) record(`${off.groups} sub-sections showing while it's off`);
        if (!/off/.test(off.hint)) record(`the title says ${JSON.stringify(off.hint)}`);
        const rendered = await evaluate(`document.querySelectorAll('#panel .clock-section .setting').length`);
        const expected = await evaluate(`WP.schemaOf('clock').filter(c => c.key).length`);
        if (rendered !== expected) record(`${rendered} controls rendered; the schema has ${expected}`);
        // Tick it on, the way a person does.
        await evaluate(`document.querySelector('#panel .clock-section .setting-toggle .switch').click()`);
        if (!await waitFor(() => evaluate(`!!document.querySelector('#clock .clock-face')`), 3000)) return record('ticking "Show a clock" showed nothing');
        const on = await evaluate(`({ rows: ${shownRows},
            groups: [...document.querySelectorAll('#panel .clock-section .settings-group:not([hidden])')].map(g => g.open) })`);
        if (on.rows !== 8) record(`${on.rows} rows once it's on, not the switch and seven`);
        if (on.groups.length !== 5 || on.groups.some(Boolean)) record(`sub-sections: ${JSON.stringify(on.groups)} (five, all collapsed)`);
        // A change reaches the clock: the size, then the style.
        const size = await evaluate(`getComputedStyle(document.querySelector('.clock-face')).fontSize`);
        await evaluate(`(() => { const input = document.querySelector('#panel .clock-section [data-key="size"] input'); input.value = 20; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
        if (!await waitFor(async () => await evaluate(`getComputedStyle(document.querySelector('.clock-face')).fontSize`) !== size, 2000)) record('the size slider did nothing');
        await evaluate(`(() => { const select = document.querySelector('#panel .clock-section [data-key="style"] select'); select.selectedIndex = [...select.options].findIndex(o => /Roman/.test(o.textContent)); select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
        if (!await waitFor(async () => /^[IVXLCDMN:]+ \|/.test(await clockText()), 2000)) record(`the style select did nothing: ${JSON.stringify(await clockText())}`);
        if (await evaluate(`JSON.parse(localStorage.getItem('wp:clock')).style`) !== 'roman') record('the style was not stored');
        // Looks set the style together, and flip to Custom when edited.
        await evaluate(`(() => { const select = document.querySelector('#panel .clock-section [data-key="preset"] select'); select.selectedIndex = [...select.options].findIndex(o => /Neon/.test(o.textContent)); select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
        const neon = await evaluate(`({ effect: JSON.parse(localStorage.getItem('wp:clock')).effect, color: JSON.parse(localStorage.getItem('wp:clock')).color })`);
        if (neon.effect !== 'neon') record(`the Neon look stored ${JSON.stringify(neon)}`);
        await evaluate(`(() => { const input = document.querySelector('#panel .clock-section [data-key="weight"] input'); input.value = 700; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
        if (await evaluate(`document.querySelector('#panel .clock-section [data-key="preset"] select').selectedOptions[0].textContent`) !== 'Custom') record('editing a style setting should show Custom');
        await shoot('clock-panel');
        // Reset takes two clicks.
        await evaluate(`document.querySelector('#panel .clock-reset').click()`);
        if (await evaluate(`localStorage.getItem('wp:clock')`) === null) record('one click reset it');
        await evaluate(`document.querySelector('#panel .clock-reset').click()`);
        if (await evaluate(`localStorage.getItem('wp:clock')`) !== null) record('two clicks left settings behind');
        await sleep(300);
        if (await evaluate(`!!document.getElementById('clock')`)) record('reset left the clock up');
        return true;
    });

    await check('clock: the screenshots, over a few wallpapers', async () => {
        const looks = [
            ['clock-default', 'rainy-window', { anchor: 'bottom-left' }],
            ['clock-two-zones', 'northern-lights', { anchor: 'center', size: 10, secondOn: true, secondZone: 'Asia/Tokyo', extras: ['week', 'zone'], date: 'long' }],
            ['clock-neon', 'synthwave', { anchor: 'center', size: 10, font: 'rounded', weight: 500, spacing: 0.04, opacity: 1, color: '#ff5fd7', effect: 'neon', effectSize: 4 }],
            ['clock-binary', 'matrix', { anchor: 'center', size: 12, style: 'binary', seconds: true, font: 'mono', weight: 400, color: '#4dff7a', effect: 'glow', plate: 'tint', plateColor: '#00150a', plateOpacity: 0.6 }],
        ];
        for (const [name, wallpaper, stored] of looks) {
            await clockStage(`index.html?w=${wallpaper}&date=2026-10-28T22:42:07`, stored);
            await sleep(1500);
            await shoot(name);
        }
        return true;
    });

    await check('clock: bounce moves and never leaves the screen, drift and follow move too', async () => {
        await clockStage('index.html?w=rain&clock=bounce', { speed: 3, size: 12 });
        const first = await clockBox();
        let off = 0, moved = 0, last = first;
        for (let i = 0; i < 60; i++) {
            await sleep(100);
            const b = await clockBox();
            if (b.x < -0.5 || b.y < -0.5 || b.x + b.bw > await evaluate('innerWidth') + 0.5 || b.y + b.bh > await evaluate('innerHeight') + 0.5) off++;
            moved += Math.hypot(b.x - last.x, b.y - last.y);
            last = b;
        }
        if (off) record(`${off} samples off-screen`);
        if (moved < 300) record(`it only moved ${Math.round(moved)} px in 6 s`);
        await clockStage('index.html?w=rain&clock=drift', { speed: 3 });
        const a = await clockBox();
        await sleep(1500);
        const b = await clockBox();
        if (Math.hypot(b.x - a.x, b.y - a.y) < 5) record('drift stood still');
        return true;
    });

    await check('clock: follow trails the pointer and parks when it leaves', async () => {
        await clockStage('index.html?w=rain&clock=follow', { size: 6 });
        await sleep(800);
        const parked = await clockBox();
        for (const [x, y] of [[300, 200], [400, 260], [620, 300], [640, 310]]) { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await sleep(120); }
        await sleep(1500);
        const near = await clockBox();
        if (Math.abs(near.x - 668) > 40 || Math.abs(near.y - 338) > 40) record(`it settled at ${Math.round(near.x)},${Math.round(near.y)}, not by the pointer (668,338)`);
        if (Math.hypot(near.x - parked.x, near.y - parked.y) < 50) record('it never left its anchor');
        return true;
    });

    await check('clock: teleport jumps to somewhere else, inside the screen', async () => {
        await clockStage('index.html?w=rain&clock=teleport', { teleportEvery: '10', teleportFade: 'instant', size: 6 });
        const a = await clockBox();
        const moved = await waitFor(async () => { const b = await clockBox(); return (Math.abs(b.x - a.x) > 20 || Math.abs(b.y - a.y) > 20) && b; }, 13000);
        if (!moved) return record('it never jumped');
        const inside = moved.x >= 0 && moved.y >= 0 && moved.x + moved.bw <= await evaluate('innerWidth') && moved.y + moved.bh <= await evaluate('innerHeight');
        if (!inside) record('it landed off-screen');
        return inside;
    });

    await check('clock: reduced motion keeps it still, and pausing stops it', async () => {
        await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
        try {
            await clockStage('index.html?w=rain&clock=bounce', { speed: 3 });
            const a = await clockBox();
            await sleep(900);
            const b = await clockBox();
            if (Math.hypot(b.x - a.x, b.y - a.y) > 1) record('it moved with reduced motion on');
        } finally { await cdp.send('Emulation.setEmulatedMedia', { features: [] }); }
        await clockStage('index.html?w=rain&clock=bounce', { speed: 3 });
        await sleep(500);
        await evaluate('WP.power({ hidden: true })');
        await sleep(200);
        const c = await clockBox();
        await sleep(700);
        const d = await clockBox();
        if (Math.hypot(d.x - c.x, d.y - c.y) > 0.5) record('it kept moving while paused');
        await evaluate('WP.power({ hidden: false })');
        await sleep(600);
        const e = await clockBox();
        if (Math.hypot(e.x - d.x, e.y - d.y) < 3) record('it did not start again');
        return true;
    });

    await check('clock: on Low frosted glass is a plain tint, on High it is glass', async () => {
        await clockStage('index.html?w=rain&tier=low', { plate: 'glass', plateOpacity: 0.12 });
        if (!await waitFor(() => evaluate(`document.querySelector('.clock-face').dataset.plate === 'tint'`), 4000)) record('Low kept the frosted glass');
        // Headless Chrome reports reduced transparency, which is also a reason for a tint.
        await clockStage('index.html?w=rain&tier=high', { plate: 'glass', plateOpacity: 0.12 });
        await sleep(1500);
        const reduced = await evaluate(`matchMedia('(prefers-reduced-transparency: reduce)').matches`);
        if (reduced && await evaluate(`document.querySelector('.clock-face').dataset.plate`) !== 'tint') record('reduced transparency kept the glass');
        await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'no-preference' }] });
        try {
            await clockStage('index.html?w=rain&tier=high', { plate: 'glass', plateOpacity: 0.12 });
            await sleep(1500);
            if (await evaluate(`document.querySelector('.clock-face').dataset.plate`) !== 'glass') record('High lost the frosted glass');
        } finally { await cdp.send('Emulation.setEmulatedMedia', { features: [] }); }
        return true;
    });

    await check('clock: battery saver drops the seconds and stills the motion', async () => {
        await clockStage('index.html?w=rain&date=2026-10-28T10:20:30', { seconds: true, motion: 'bounce', speed: 3 });
        if (!/:30|:31|:32/.test(await clockText())) record(`before: ${JSON.stringify(await clockText())}`);
        await evaluate('WP.power({ saver: true })');
        await sleep(500);
        if (/\d:\d\d:\d\d/.test(await clockText())) record('seconds were still showing');
        const a = await clockBox();
        await sleep(600);
        const b = await clockBox();
        if (Math.hypot(b.x - a.x, b.y - a.y) > 1) record('it kept bouncing');
        await evaluate('WP.power({ saver: false })');
        await sleep(500);
        if (!/\d:\d\d:\d\d/.test(await clockText())) record('the seconds did not come back');
        return true;
    });

    await check('clock: adaptive colour reads the wallpaper, flips once, and keeps its colour with no reading', async () => {
        await clockStage('index.html?w=rain', { colorMode: 'adaptive' });
        await evaluate(`window.__lumas = []; const view = WP.clockface.view, original = view.onLuma; view.onLuma = value => { __lumas.push(value); return original(value); }`);
        const heard = await waitFor(() => evaluate('__lumas.length > 0 && __lumas[0]'), 6000);
        if (heard === null || heard === false || typeof heard !== 'number' || heard < 0 || heard > 1) record(`the stage answered ${JSON.stringify(heard)}`);
        const colour = () => evaluate(`document.querySelector('.clock-face').style.color`);
        const feed = async value => { await evaluate(`WP.clockface.view.onLuma(${JSON.stringify(value)})`); return colour(); };
        const light = await feed(0.2), stay = await feed(0.55), dark = await feed(0.9), hold = await feed(0.5), back = await feed(0.4), none = await feed(null);
        if (light !== 'rgb(255, 255, 255)') record(`over a dark scene: ${light}`);
        if (stay !== light) record(`0.55 flipped it to ${stay}`);
        if (dark !== 'rgb(17, 17, 17)') record(`over a light scene: ${dark}`);
        if (hold !== dark) record(`0.5 flipped it back: ${hold}`);
        if (back !== light) record(`0.4 didn't flip it back: ${back}`);
        if (none !== back) record(`no reading changed it to ${none}`);
        // The stage's own read is 64 pixels, cheap, and never throws on a tainted canvas.
        const cost = await inStage(`(() => { const t = performance.now(); window.dispatchEvent(new MessageEvent('message', { source: window.parent, data: { wp: 'sample', x: 0.4, y: 0.4, w: 0.2, h: 0.1 } })); return performance.now() - t; })()`);
        if (cost > 8) record(`a sample took ${cost.toFixed(1)} ms`);
        return true;
    });

    await check('clock: night mode hides or dims it, and hideOn keeps it off chosen wallpapers', async () => {
        await clockStage('index.html?w=rain&date=2026-10-28T12:00:00', { nightMode: 'hide', nightFrom: '00:00', nightTo: '23:59' });
        await sleep(300);
        if (!await evaluate(`document.getElementById('clock')?.hidden === true`)) record('night mode "hide" left it showing at noon in a window that covers noon');
        await clockStage('index.html?w=rain&date=2026-10-28T12:00:00', { nightMode: 'dim', nightFrom: '00:00', nightTo: '23:59' });
        if (await evaluate(`document.querySelector('.clock-face').style.getPropertyValue('--clock-night')`) !== '0.3') record('"dim" did not dim it');
        await clockOn('index.html?w=rain', { hideOn: ['rain'] });
        await playerReady();
        await sleep(600);
        if (!await evaluate(`document.getElementById('clock')?.hidden === true`)) record('hideOn did not hide it over rain');
        await evaluate(`WP.player.show('snow', { persist: true })`);
        await waitFor(() => evaluate(`WP.player.stage.id === 'snow' && WP.player.stage.ready`));
        await sleep(600);
        if (await evaluate(`document.getElementById('clock')?.hidden`) !== false) record('it stayed hidden over snow');
        return true;
    });

    await check('clock: on Android it keeps clear of the gesture bar', async () => {
        await clockStage('index.html?w=rain&host=android', { anchor: 'bottom-left', margin: 0 });
        const b = await clockBox();
        const room = await evaluate('innerHeight');
        if (b.y + b.bh > room - 48 + 0.5) record(`its bottom edge is at ${Math.round(b.y + b.bh)} of ${room}, inside the 48 px bar`);
        return true;
    });

    await check('clock: with the panel open it can be dragged to a new place', async () => {
        await clockStage('index.html?w=rain&panel=open', { anchor: 'bottom-left', size: 8 });
        await sleep(400);
        const rect = await evaluate(`(() => { const r = document.querySelector('.clock-face').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
        await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
        for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x + 40 * i, y: rect.y - 30 * i, button: 'left' }); await sleep(30); }
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x + 320, y: rect.y - 240, button: 'left', clickCount: 1 });
        await sleep(300);
        const stored = await evaluate(`JSON.parse(localStorage.getItem('wp:clock'))`);
        if (stored.anchor !== 'custom') record(`anchor is ${stored.anchor}`);
        const moved = await clockBox();
        if (moved.x < 250 || moved.y > 500) record(`it ended at ${Math.round(moved.x)},${Math.round(moved.y)}`);
        const row = await evaluate(`!!document.querySelector('#panel .clock-section [data-key="x"]:not([hidden])')`);
        if (!row) record('the Across and Down sliders did not appear');
        // Closed, it takes no pointer: a click goes to the wallpaper.
        await press('Escape');
        await sleep(300);
        return await evaluate(`getComputedStyle(document.querySelector('.clock-face')).pointerEvents`) === 'none';
    });
}

// Just the clock's checks: node tools/smoke.mjs clock
async function clockSuite() {
    const { check, failed } = checker();
    await clockChecks(check, () => waitFor(() => evaluate('WP.player?.stage?.ready && WP.player.stage.id')));
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

    await check('the clock overlay runs under the extension\'s CSP', async () => {
        await cdp.send('Page.navigate', { url: `${page}?w=rain&clock=on` });
        await waitFor(() => evaluate('WP.player?.stage?.ready'));
        if (!await waitFor(() => evaluate(`!!document.querySelector('#clock .clock-face') && document.querySelector('.clock-face').innerText.length > 3`), 4000)) return record('no clock');
        await evaluate(`document.getElementById('gear').click()`);
        return !!await waitFor(() => evaluate(`!!document.querySelector('#panel .clock-section .setting')`), 4000);
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
        if (only.length === 1 && only[0] === 'clock') {
            console.log('clock');
            const failed = await clockSuite();
            console.log(failed ? `smoke ✗ ${failed} failed` : 'smoke ✓ clock · screenshots in dist/smoke/');
            return failed ? 1 : 0;
        }
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
