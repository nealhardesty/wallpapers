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
    // A refusal without CORS headers (celestrak.org turning a busy runner away) is logged against the page, not the
    // request, so the service's URL is read from the message.
    const outage = e => (e.source === 'network' && declared(e.url || '')) || declared(/Access to fetch at '([^']+)'/.exec(e.text || '')?.[1] || '');
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

const CANVASES = `(() => {
    const lost = c => { try { const g = c.getContext('2d'); return g && g.isContextLost && g.isContextLost() ? ' lost' : ''; } catch { return ''; } };
    const list = [...document.querySelectorAll('canvas')].map(c => (c.id || 'canvas') + ' ' + c.width + 'x' + c.height + lost(c));
    return (list.join(', ') || 'no canvas') + '; ' + (WP.host?.frames?.count ?? '?') + ' frames';
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

    let notes = [];
    if (drawn < 2 && id !== 'blank' && !photo) {
        // What was there: each canvas's size and whether its context was lost, and how many frames had run.
        const seen = await evaluate(CANVASES);
        if (LIVE) {
            // The live run shares a busy runner with real network: look once more before calling it blank.
            await sleep(RUN_MS);
            const again = await evaluate(DRAWN);
            if (again >= 2) notes.push(`blank at first, drawn ${RUN_MS} ms later (${seen})`);
            else record(`nothing drawn (${seen})`);
        } else record(`nothing drawn (${seen})`);
    } else if (drawn < 2 && id !== 'blank') record('background photo not shown');
    if (storage?.diff?.length) record(`fresh run would save: ${storage.diff.join(', ')} (defaults.js out of step)`);
    if (storage?.foreign?.length) record(`wrote storage outside its namespace: ${storage.foreign.join(', ')}`);
    return { readyMs, drawn, problems: current.problems, notes };
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

// The true mean colour over every pixel, for scenes of thin strokes (code
// rain), where AVERAGE's 16x16 shrink samples too few pixels to be steady.
const MEAN = `(() => {
    const src = document.querySelector('canvas'), probe = document.createElement('canvas');
    probe.width = src.width; probe.height = src.height;
    const g = probe.getContext('2d', { willReadFrequently: true });
    g.drawImage(src, 0, 0);
    const d = g.getImageData(0, 0, probe.width, probe.height).data, sum = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) sum[c] += d[i + c];
    return sum.map(v => Math.round(v / (d.length / 4)));
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
        const avg = await evaluate(MEAN);
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
        const amber = await evaluate(MEAN);
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
    // Snow Globe: snow coming down on frame one, the brushwork arriving over
    // the underpainting; a drag shakes it (snow up off the ground, the globe
    // rocks); it all settles, and then the stage is asked for few frames; a
    // tap on the base winds the music box (it turns, notes play); a tap on
    // the cat is a stroke; B, the cat swipes it; Christmas Eve plays a carol
    // round the tree, and the cat wears a hat; N through all eleven scenes,
    // half a turn puts what was in front behind; the room's lights twinkle
    // at rest; on black, the globe alone.
    'snow-globe': [['snow on frame one, painted as it goes, a drag shakes it, it settles and rests, the music box, the cat, Christmas Eve, every scene, the lights, on black', async () => {
        const st = () => evaluate('JSON.parse(JSON.stringify(WP.stage.manager.debugState()))');
        const at = () => evaluate('WP.stage.manager.centres()');
        if (!await stageWith('snow-globe', { configVersion: 1, cat: 'harry', mischief: 0, autoShake: 'off', candle: false, snowOutside: 0, scene: 'cottage', deskTree: 'off' }, '&seed=7&date=2026-12-10T20:00')) return record('no boot');
        let s = await st();
        if (!(s.loose > 100) || s.scene !== 'cottage' || s.cat !== 'harry' || s.festive) record(`frame one: ${JSON.stringify(s)}`);
        if (!await waitFor(async () => (await st()).painted >= 1, 20000)) record(`the brushwork never finished: ${(await st()).painted}`);
        s = await st();
        if (!(s.stats.strokes > 20000)) record(`only ${s.stats.strokes} strokes`);
        await shoot('snow-globe-painted');
        // Let it settle quickly, then shake it with a drag across the glass.
        await evaluate('WP.stage.manager.sim.settleSeconds = 3');
        if (!await waitFor(async () => (await st()).loose === 0, 15000)) return record(`it never settled: ${JSON.stringify(await st())}`);
        const settled = await st(), c = await at();
        await drag([[c.globe.x - c.globe.r * 0.6, c.globe.y], [c.globe.x + c.globe.r * 0.5, c.globe.y - 10], [c.globe.x - c.globe.r * 0.5, c.globe.y + 10], [c.globe.x + c.globe.r * 0.6, c.globe.y]], 30);
        s = await st();
        if (!(s.loose > 150) || !(s.ground < settled.ground * 0.8) || s.stats.shakes <= settled.stats.shakes) record(`a drag didn't shake it: ${JSON.stringify({ loose: s.loose, ground: [settled.ground, s.ground], shakes: s.stats.shakes })}`);
        if (s.wobble === 0 && s.stir < 0.05) record('the globe didn’t move and the water didn’t stir');
        await sleep(400);
        await shoot('snow-globe-shaken');
        // It settles, the water stills, and the stage rests: with no cat, no candle and no snow outside, almost no frames.
        if (!await waitFor(async () => (s = await st()).loose === 0 && s.calm, 20000)) return record(`it never came to rest: ${JSON.stringify(s)}`);
        if (!(s.ground > 0.5) || !(s.roofs > 0)) record(`settled, but the snow isn't lying: ground ${s.ground}, ${s.roofs} roofs`);
        const calmFrames = await framesIn(2000);
        if (calmFrames > 34) record(`${calmFrames} frames in 2 s at rest with a cat (want 14 a second at most)`);
        if (calmFrames < 7) record(`${calmFrames} frames in 2 s at rest with a cat awake or asleep (want 4 to 14 a second)`);
        // As if the page had been open twenty minutes: a rest is still a short wait, not as long as the page has been open.
        await evaluate('(n => { performance.now = () => n() + 20 * 60 * 1000; })(performance.now.bind(performance))');
        await sleep(400);
        const later = await framesIn(2000);
        if (later < 7) record(`${later} frames in 2 s at rest twenty minutes on (it froze until the mouse moved)`);
        // A tap on the base winds the music box: it turns and plays.
        const theta = s.music.theta;
        await mouse('mousePressed', c.base.x, c.base.y); await mouse('mouseReleased', c.base.x, c.base.y);
        if (!await waitFor(async () => (s = await st()).music.played >= 3, 5000)) record(`the music box didn't play: ${JSON.stringify(s.music)}`);
        if (!(s.music.wind > 0.8) || !(s.music.omega > 0.1) || !(s.music.theta > theta)) record(`wound, but it isn't turning: ${JSON.stringify(s.music)}`);
        if (!(s.notes > 0)) record('no notes rising from it');
        await shoot('snow-globe-music');
        // A tap on the cat: it purrs.
        await mouse('mousePressed', c.cat.x, c.cat.y); await mouse('mouseReleased', c.cat.x, c.cat.y);
        await sleep(300);
        if ((await st()).catState !== 'purr') record(`a stroke, and the cat is ${(await st()).catState}`);
        // B: the cat swipes it, and the snow goes up.
        await evaluate('WP.stage.manager.sim.settleSeconds = 3');
        if (!await waitFor(async () => (await st()).loose === 0, 15000)) record('it never settled before the swipe');
        await press('b');
        if (!await waitFor(async () => (s = await st()).stats.catShakes >= 1 && s.loose > 50, 4000)) record(`B: no swipe: ${JSON.stringify({ cat: s.catState, shakes: s.stats.catShakes, loose: s.loose })}`);
        // No cat, no candle, no snow outside: at rest, the stage sleeps.
        if (!await stageWith('snow-globe', { configVersion: 1, cat: 'none', autoShake: 'off', candle: false, snowOutside: 0, deskTree: 'off', scene: 'pond' }, '&seed=7&date=2026-12-10T20:00')) return record('no boot without a cat');
        await evaluate('WP.stage.manager.sim.settleSeconds = 2');
        if (!await waitFor(async () => (s = await st()).loose === 0 && s.calm && s.painted >= 1, 25000)) return record(`no cat: never at rest: ${JSON.stringify(s)}`);
        await sleep(500);
        const asleep = await framesIn(3000);
        if (asleep > 4) record(`${asleep} frames in 3 s with nothing moving (want almost none)`);
        // Christmas Eve: the tree, a carol already playing, and the cat in a hat.
        if (!await stageWith('snow-globe', { configVersion: 1, cat: 'butters' }, '&seed=7&date=2026-12-24T20:00')) return record('no boot on Christmas Eve');
        s = await st();
        if (!s.festive || s.scene !== 'tree' || !(s.music.wind > 0.5)) record(`Christmas Eve: ${JSON.stringify({ festive: s.festive, scene: s.scene, music: s.music })}`);
        await sleep(1500);
        await shoot('snow-globe-eve');
        // N: every scene in turn, each built as solids, drawn as it turns.
        const seen = new Set();
        for (let i = 0; i < 11; i++) {
            await press('n'); await sleep(350);
            s = await st(); seen.add(s.scene);
            if (!(s.models >= 5)) record(`${s.scene}: only ${s.models} things built`);
        }
        if (seen.size !== 11) record(`N went through ${seen.size} scenes: ${[...seen]}`);
        await evaluate('WP.stage.manager.config.scene = "lighthouse"; WP.stage.manager.pickScene(); WP.stage.manager.resize()');
        await sleep(1500);
        await shoot('snow-globe-lighthouse');
        // The turntable turns them as solids: a house's place and its depth change, and half a turn puts what was in front behind.
        const turn = await evaluate(`(m => { const at = th => SnowGlobeLogic.placed('cottage', th, 0)[0]; const a = at(0), b = at(Math.PI); return { a: a.depth, b: b.depth, fa: a.face, fb: b.face }; })(WP.stage.manager)`);
        if (!(Math.sign(turn.a) !== Math.sign(turn.b) && Math.abs(turn.fb - turn.fa - Math.PI) < 1e-6)) record(`half a turn: ${JSON.stringify(turn)}`);
        // The room's lights: a string round the window and a little tree, twinkling, so the stage keeps a few frames coming.
        if (!await stageWith('snow-globe', { configVersion: 1, cat: 'harry', mischief: 0, autoShake: 'off', candle: false, snowOutside: 0, scene: 'cabin', room: 'desk', windowLights: 'multi', deskTree: 'on', deskTreeTopper: 'cat' }, '&seed=7&date=2026-11-10T20:00')) return record('no boot with the lights');
        await evaluate('WP.stage.manager.sim.settleSeconds = 2');
        if (!await waitFor(async () => (s = await st()).painted >= 1 && s.loose === 0, 25000)) record('lights: never painted and settled');
        if (!(s.bulbs > 20) || !(s.treeBulbs > 10)) record(`lights: ${s.bulbs} on the window, ${s.treeBulbs} on the tree`);
        await shoot('snow-globe-lights');
        const twinkling = await framesIn(2000);
        if (twinkling < 14) record(`${twinkling} frames in 2 s with the lights twinkling at rest`);
        // Just the globe, on black: no cat, no candle, no room; its reflection.
        if (!await stageWith('snow-globe', { configVersion: 1, background: 'black', scene: 'carousel' }, '&seed=7&date=2026-11-10T20:00')) return record('no boot on black');
        await sleep(1500);
        s = await st();
        if (!s.black || s.cat || s.bulbs || s.treeBulbs) record(`black: ${JSON.stringify({ black: s.black, cat: s.cat, bulbs: s.bulbs, tree: s.treeBulbs })}`);
        const corner = await evaluate(`(() => { const c = document.querySelectorAll('canvas')[2], g = document.createElement('canvas').getContext('2d'); g.drawImage(c, 0, 0, 1, 1, 0, 0, 1, 1); return Array.from(g.getImageData(0, 0, 1, 1).data.slice(0, 3)); })()`);
        if (corner.some(v => v > 4)) record(`black: the corner is ${corner}`);
        await shoot('snow-globe-black');
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
        // Timed by the page's clock: a slow runner's round trips stretch our two seconds, not its frame rate.
        const before = await evaluate('[WP.host.frames.count, performance.now()]');
        await sleep(2000);
        const after = await evaluate('[WP.host.frames.count, performance.now()]');
        const fps = (after[0] - before[0]) / ((after[1] - before[1]) / 1000);
        if (fps > 15 || fps < 6) record(`${fps.toFixed(1)} frames a second (want about 12)`);
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
    // Pocket Hockey (§10.36): mid-game on frame one; a goal scored, called and
    // saved, and a new tab carrying on; a period's end, the resurfacer and the
    // out-of-town scores; the final, the cup and the summer; the goalie who
    // scores; a phone, and a tap.
    'pocket-hockey': [
        ['mid-game on the first frame, in a few hundred pixels; a goal is scored, called and saved; a new tab carries on from there', async () => {
            if (!await stageWith('pocket-hockey', null, '&seed=7')) return record('not ready');
            const first = await counts(`({ show: m.show, phase: m.game.phase, tick: m.game.tick, on: m.game.P.filter(p => p.on).length, owner: m.game.puck.owner, teams: m.world.teams.length,
                canvas: [m.canvas.width, innerWidth, getComputedStyle(m.canvas).imageRendering], league: !!localStorage.getItem('wp:pocket-hockey:league'), game: !!localStorage.getItem('wp:pocket-hockey:game') })`);
            if (first.show !== 'game' || first.phase !== 'play' || first.tick < 1500 || first.on !== 8 || first.owner < 0 || first.teams !== 8) record(`the first frame: ${JSON.stringify(first)}`);
            if (first.canvas[0] > first.canvas[1] / 2 || first.canvas[2] !== 'pixelated') record(`the canvas: ${first.canvas}`);
            if (!first.league || !first.game) record('a new league was not saved at once');
            await sleep(1000);
            const ran = await counts('m.game.tick') - first.tick;
            if (ran < 25 || ran > 95) record(`${ran} steps of the game in a second`);
            // Play on, in the wallpaper, until somebody scores.
            const goal = await counts(`(() => { const L = HockeyLogic, g = m.game, had = g.goals.length; let n = 0; while (g.goals.length === had && !g.done && n++ < 40000) { L.step(g); m.afterStep(g, false); }
                const gl = g.goals.at(-1); return gl && { by: g.P[gl.by].name.toUpperCase(), score: g.score, said: m.caption?.text, banner: m.banner?.text, sub: m.banner?.sub, lamp: m.lamp[gl.team], cheer: m.cheer[gl.team], tick: g.tick, done: g.done,
                    credited: g.P[gl.by].st.g, saved: JSON.parse(localStorage.getItem('wp:pocket-hockey:game')) }; })()`);
            if (!goal) return record('nobody scored');
            if (!goal.said?.includes(goal.by) || !/GOAL!/.test(goal.banner || '') || !goal.sub?.includes(goal.by) || !(goal.lamp > 0) || goal.cheer !== 1 || goal.credited < 1) record(`the goal: ${JSON.stringify({ ...goal, saved: undefined })}`);
            if (!goal.done && (goal.saved?.tick !== goal.tick || goal.saved.score.join() !== goal.score.join())) record('the goal was not saved');
            await sleep(700);
            await shoot('pocket-hockey-goal');
            // A new tab: the same league, the same game, a little further on.
            await cdp.send('Page.navigate', { url: `${WEB}/stage.html?w=pocket-hockey` });
            if (!await waitFor(() => evaluate('WP.stage?.ready'))) return record('not ready on reload');
            const again = await counts('({ show: m.show, tick: m.game.tick, total: m.game.score[0] + m.game.score[1], goals: m.game.goals.length, seed: m.world.seed, league: m.game.league })');
            if (again.show !== 'game' || again.tick < goal.tick || again.tick > goal.tick + 1500 || again.total < goal.score[0] + goal.score[1] || again.goals !== again.total || again.seed !== again.league) record(`after a reload (the goal at ${goal.tick}): ${JSON.stringify(again)}`);
            return true;
        }],
        ['N to the end of the period: the card, the resurfacer and its clean stripe, a score from elsewhere; G to the horn: three stars, the table, the next game', async () => {
            if (!await stageWith('pocket-hockey', null, '&seed=7')) return record('not ready');
            await counts('m.skip()');
            const rest = await counts('({ phase: m.game.phase, period: m.game.period })');
            if (rest.phase !== 'break' || rest.period !== 1) record(`after N: ${JSON.stringify(rest)}`);
            if (!await waitFor(() => counts('m.world.out.length >= 1 && !m.bg'), 30000)) record('no score came in from the other games');
            if (!await waitFor(() => counts('m.game.P.every(p => !p.on)'), 8000)) record('the players did not leave the ice');
            await counts('m.game.phaseT = Math.max(m.game.phaseT, 330)');
            await sleep(700);
            await shoot('pocket-hockey-break');
            await counts('m.game.phaseT = 830');
            await sleep(700);
            const ice = await counts(`(() => { const at = m.machineAt(), v = m.view; if (!at) return null; const x = Math.round(v.X(at.x, at.y)), y = Math.round(v.Y(at.x, at.y));
                const d = m.iceCtx.getImageData(x + 3, y + 3, 1, 1).data, b = m.arena.base.getContext('2d').getImageData(x + 3, y + 3, 1, 1).data;
                return { wet: Math.abs(d[0] - b[0]) + Math.abs(d[1] - b[1]) + Math.abs(d[2] - b[2]), on: m.game.P.filter(p => p.on).length, inside: HockeyLogic.inside(at.x, at.y, 2) }; })()`);
            if (!ice || !(ice.wet > 8) || ice.on !== 0 || !ice.inside) record(`the resurfacer: ${JSON.stringify(ice)}`);
            await shoot('pocket-hockey-resurfacer');
            await counts('m.toFinal()');
            const end = await counts(`({ show: m.show, done: m.game.done, score: m.game.score, won: m.world.teams[m.game.T[m.game.winner].ti].w, saved: JSON.parse(localStorage.getItem('wp:pocket-hockey:league')).teams[m.game.T[m.game.winner].ti].w,
                game: localStorage.getItem('wp:pocket-hockey:game'), stars: m.stars(m.game).length })`);
            if (end.show !== 'postgame' || !end.done || end.score[0] === end.score[1] || end.won !== 1 || end.saved !== 1 || (end.game !== null && end.game !== 'null') || end.stars !== 3) record(`the final horn: ${JSON.stringify(end)}`);
            if (!await waitFor(() => counts('m.round !== m.roundKey()'), 40000)) return record('the round’s other games never finished');
            await counts('m.showT = 3');
            await sleep(500);
            await shoot('pocket-hockey-final');
            await counts('m.showT = 99');
            if (!await waitFor(() => counts("m.show === 'standings'"), 3000)) return record('no table after the game');
            const table = await counts('({ round: m.world.round, wins: m.world.teams.reduce((n, t) => n + t.w, 0), out: m.world.out.length })');
            if (table.round !== 1 || table.wins !== 4 || table.out !== 4) record(`the table: ${JSON.stringify(table)}`);
            await sleep(300);
            await shoot('pocket-hockey-table');
            await counts('m.showT = 99');
            if (!await waitFor(() => counts("m.show === 'pregame'"), 3000)) return record('no next game');
            const next = await counts('({ key: m.game.key, wait: m.game.wait, tick: m.game.tick, saved: JSON.parse(localStorage.getItem("wp:pocket-hockey:league")).round })');
            if (!next.key.startsWith('1:regular:1:') || !next.wait || next.tick > 600 || next.saved !== 1) record(`the next game: ${JSON.stringify(next)}`);
            await sleep(600);
            await shoot('pocket-hockey-pregame');
            await counts('m.skip()');
            await counts('(m.showBoard(), m.showBoard())');
            await sleep(600);
            if (await counts('m.show + m.board + m.game.wait') !== 'game2false') record('N did not start the game, or B did not show the scorers');
            await shoot('pocket-hockey-scorers');
            return true;
        }],
        ['the final: the champions skate the tin round, the summer brings rookies, and season two begins', async () => {
            if (!await stageWith('pocket-hockey', null, '&seed=7')) return record('not ready');
            // The season and the semi-finals in the logic, with short periods; then watch the final.
            const start = await counts(`(() => { const L = HockeyLogic, w = m.world; let n = 0; m.queue = []; m.bg = null; while (w.stage !== 'final' && n++ < 40) L.playRound(w, 900); m.begin(false);
                return { stage: w.stage, show: m.show, beard: m.game.beard, playoff: m.game.playoff, played: w.teams.map(t => t.w + t.l + t.otl).join() }; })()`);
            if (start.stage !== 'final' || start.show !== 'pregame' || !(start.beard >= 3) || !start.playoff || start.played !== '14,14,14,14,14,14,14,14') record(`the final: ${JSON.stringify(start)}`);
            let show = '';
            for (let n = 0; n < 16 && show !== 'ceremony'; n++) {
                show = await counts("(() => { if (m.show === 'pregame' || m.show === 'game') m.toFinal(); else if (m.show !== 'ceremony') m.showT = 99; return m.show; })()");
                await sleep(300);
            }
            if (show !== 'ceremony') return record(`no ceremony: ${show}`);
            await sleep(3200);
            const cup = await counts(`({ stage: m.world.stage, nick: HockeyLogic.TEAMS[m.world.champion].nick.toUpperCase(), said: m.caption?.text, winner: m.game.T[m.game.winner].ti === m.world.champion,
                out: m.game.P.filter(p => p.on && p.team === m.game.winner).length, losers: m.game.P.filter(p => p.on && p.team !== m.game.winner).length, paper: m.particles.filter(p => p.life > 0).length })`);
            if (cup.stage !== 'champion' || !cup.said?.includes(cup.nick) || !cup.said.includes('BIG BISCUIT TIN') || !cup.winner || cup.out !== 7 || cup.paper < 40) record(`the ceremony: ${JSON.stringify(cup)}`);
            await shoot('pocket-hockey-cup');
            await counts('m.showT = 99');
            if (!await waitFor(() => counts("m.show === 'offseason'"), 3000)) return record('no summer');
            const summer = await counts(`({ season: m.world.season, stage: m.world.stage, news: m.news.map(n => n.type), banners: m.world.champions.length, saved: JSON.parse(localStorage.getItem('wp:pocket-hockey:league')).season })`);
            const count = type => summer.news.filter(t => t === type).length;
            if (summer.season !== 2 || summer.stage !== 'regular' || summer.news[0] !== 'champion' || count('rookie') !== count('retired') || !summer.news.includes('mvp') || summer.banners !== 1 || summer.saved !== 2) record(`the summer: ${JSON.stringify(summer)}`);
            await sleep(400);
            await shoot('pocket-hockey-summer');
            await counts('m.showT = 99');
            if (!await waitFor(() => counts("m.show === 'pregame' && m.game.key.startsWith('2:regular:0:')"), 3000)) record('season two did not begin');
            return true;
        }],
        ['a goalie with the puck and an empty net at the far end: the improbable goal, and the hats', async () => {
            if (!await stageWith('pocket-hockey', null, '&seed=7')) return record('not ready');
            // The visitors have pulled their goalie and lost the puck to the home one; everyone else is sent off, so nobody is in the way.
            const heave = await counts(`(() => { const L = HockeyLogic, g = m.game, k = g.P[g.T[0].goalie], had = g.goals.length; let tries = 0;
                Object.assign(g, { phase: 'play', period: 3, clock: 4000, score: [2, 1] }); for (const p of g.P) p.on = p === k; g.T[1].pulled = true;
                while (g.goals.length === had && tries++ < 8) { Object.assign(g.puck, { x: k.x + 2, y: k.y, vx: 0, vy: 0, owner: -1 }); L.gain(g, k); for (let n = 0; n < 300 && g.goals.length === had; n++) { L.step(g); m.afterStep(g, false); } }
                const gl = g.goals.at(-1); return { scored: g.goals.length > had, tries, keeper: gl?.keeper, by: gl && g.P[gl.by].name === k.name, banner: m.banner?.text, said: m.caption?.text, hats: m.thrown.length, lamp: m.lamp[0] }; })()`);
            if (!heave.scored || !heave.keeper || !heave.by || heave.banner !== 'GOALIE GOAL!' || !heave.said?.includes('THE GOALIE HAS SCORED') || heave.hats < 20 || !(heave.lamp > 4)) record(`the goalie's goal: ${JSON.stringify(heave)}`);
            await sleep(1500);
            await shoot('pocket-hockey-goalie-goal');
            return true;
        }],
        ['a phone held upright: the rink stands on end above the gesture bar; a tap on the ice throws something, a tap in the seats starts a wave', async () => {
            const viewport = { width: 412, height: 915, deviceScaleFactor: 2.625 };
            try {
                if (!await bootStage('w=pocket-hockey&host=android&seed=7', viewport)) return record('not ready on a phone');
                const v = await counts(`(() => { const L = HockeyLogic, v = m.view; return { upright: v.upright, px: v.px, bw: v.bw, low: v.low, inset: WP.host.insets.bottom, left: v.X(0, -L.HW), right: v.X(0, L.HW), top: v.Y(L.HL, 0), bottom: v.Y(-L.HL, 0),
                    from: v.top, to: v.bottom, k: v.k, spot: [v.X(10, 12) * v.px, v.Y(10, 12) * v.px], seats: [v.bw * v.px / 2, (v.bottom + 12) * v.px] }; })()`);
                if (!v.upright || v.left < 10 || v.right > v.bw - 2 || v.top < v.from || v.bottom > v.to || v.low * v.px < v.inset || v.inset !== 48 || v.k < 1.5) record(`the layout: ${JSON.stringify(v)}`);
                const tap = async ([x, y]) => {
                    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(x), y: Math.round(y) }] });
                    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
                    await sleep(150);
                };
                await tap(v.spot);
                const thrown = await counts('({ air: m.thrown.length, thrown: m.stats.thrown, waves: m.stats.waves })');
                if (thrown.air !== 1 || thrown.thrown !== 1 || thrown.waves !== 0) record(`a tap on the ice: ${JSON.stringify(thrown)}`);
                await sleep(900);
                const landed = await counts("({ air: m.thrown.length, down: m.game.items.length + m.hats.length + m.game.events.filter(e => e.type === 'slip').length })");
                if (landed.air !== 0 || landed.down < 1) record(`it never landed: ${JSON.stringify(landed)}`);
                await tap(v.seats);
                const wave = await counts('({ wave: !!m.wave, waves: m.stats.waves, thrown: m.stats.thrown })');
                if (!wave.wave || wave.waves !== 1 || wave.thrown !== 1) record(`a tap in the seats: ${JSON.stringify(wave)}`);
                await shoot('pocket-hockey-phone');
                await counts('m.applySettings({ ...m.config, touch: false })');
                await tap(v.spot);
                if (await counts('m.stats.taps') !== 2) record('a tap counted with touch switched off');
            } finally {
                await cdp.send('Emulation.clearDeviceMetricsOverride');
            }
            return true;
        }],
    ],
    // Ice Patrol (§10.34): in the air on frame one with the instruments
    // reading the world; the same flight without WebGL; night, weather, the
    // views and a phone. Headless Chrome draws its WebGL in software, far too
    // slowly to time, so the speed is measured on the 2D fallback.
    sumo: [
        ['in the ring on the first frame; a bout is decided, written down and saved; N goes to the finish', async () => {
            if (!await stageWith('sumo', null, '&seed=7')) return record('not ready');
            const first = await counts('({ phase: m.phase, east: m.east?.w.name, west: m.west?.w.name, day: m.world.day, size: m.world.roster.length, squat: m.east?.pose.squat })');
            if (first.phase !== 'crouch' || !first.east || !first.west || first.day !== 1 || first.size !== 16 || !(first.squat > 0.3)) record(`the first frame: ${JSON.stringify(first)}`);
            if (await evaluate("localStorage.getItem('wp:sumo:world')") !== null) record('the league was saved before anything happened');
            if (!await waitFor(() => counts("m.phase === 'fight' && m.bout.t > 0.5"), 6000)) return record('no bout began');
            const mid = await counts('({ gap: Math.abs(m.east.x - m.west.x), east: m.east.x, west: m.west.x })');
            if (!(mid.gap > 0.4 && mid.gap < 0.9) || Math.abs(mid.east) > 1.2 || Math.abs(mid.west) > 1.2) record(`mid-bout: ${JSON.stringify(mid)}`);
            await shoot('sumo-bout');
            await counts('m.skip()');
            if (!await waitFor(() => counts("m.phase === 'result'"), 3000)) return record('N did not finish the bout');
            const done = await counts(`({ kanji: m.kanji, winner: m.bout.winner.name, loser: m.bout.loser.name, romaji: m.bout.winner.romaji, kimarite: m.bout.kimarite, written: SumoLogic.KIMARITE[m.bout.kimarite][0], said: m.said.map(line => line[0]).join(' / '), bout: m.world.bout, marks: [m.world.marks[m.bout.winner.id], m.world.marks[m.bout.loser.id]], point: m.point,
                saved: JSON.parse(localStorage.getItem('wp:sumo:world')) })`);
            if (done.bout !== 1 || done.marks[0] !== 'W' || done.marks[1] !== 'L' || !done.point) record(`the result: ${JSON.stringify({ ...done, saved: undefined })}`);
            // In Japanese where the machine has the letters (CI's has not), with the English under it by default.
            if (!done.said.includes(done.romaji) || !done.said.includes(done.kimarite) || (done.kanji && !(done.said.includes(done.winner) && done.said.includes(done.written)))) record(`the caption: ${JSON.stringify(done.said)} for ${done.winner}`);
            if (done.saved?.bout !== 1 || done.saved.roster.length !== 16) record('the league was not saved after the bout');
            await sleep(900);
            await shoot('sumo-result');
            // A new tab carries on with the second bout of the same day.
            await cdp.send('Page.navigate', { url: `${WEB}/stage.html?w=sumo` });
            if (!await waitFor(() => evaluate('WP.stage?.ready'))) return record('not ready on reload');
            const again = await counts('({ bout: m.world.bout, day: m.world.day, east: m.east.w.name, names: m.world.roster.map(w => w.name).join() })');
            if (again.bout !== 1 || again.day !== 1 || again.names !== done.saved.roster.map(w => w.name).join() || [done.winner, done.loser].includes(again.east)) record(`after a reload: ${JSON.stringify(again)}`);
            return true;
        }],
        ['the last day: the standings, the cup, the new ranking sheet, and the next tournament', async () => {
            if (!await stageWith('sumo', null, '&seed=7')) return record('not ready');
            // Play fourteen days and seven bouts in the logic, then watch the last one.
            await counts(`(() => { const L = SumoLogic, w = m.world; let card; while ((card = L.nextBout(w)) && !(w.day === 15 && w.bout === 7)) { const b = L.boutRun(card.east, card.west, Math.random); L.result(w, b.winner, b.loser); } m.card = null; m.stage('crouch'); })()`);
            await counts('m.showSheet()');
            await sleep(400);
            await shoot('sumo-sheet');
            await counts('m.showSheet()');
            // Hurry every phase along until the cup is given (through a playoff, if the lead is shared).
            const hurry = phase => counts(`(() => { let n = 0; while (m.phase !== '${phase}' && n++ < 4000) { if (m.phase === 'fight') m.skip(); else m.phaseTime = 1e9; m.update(0.016); } return m.phase; })()`);
            if (await hurry('ceremony') !== 'ceremony') return record('no cup was given');
            const cup = await counts('({ champion: m.east.w.romaji, arms: m.east.pose.arms, said: m.said.map(line => line[0]).join(" / "), most: SumoLogic.standings(m.world)[0].wins, his: SumoLogic.record(m.world, m.east.w.id).w })');
            if (cup.arms !== 'cup' || !cup.said.includes(cup.champion) || cup.his !== cup.most) record(`the ceremony: ${JSON.stringify(cup)}`);
            await sleep(600);
            await shoot('sumo-cup');
            if (await hurry('news') !== 'news') return record('no new ranking sheet');
            const next = await counts("({ basho: m.world.basho, day: m.world.day, size: m.world.roster.length, news: m.news.map(n => n.type), saved: JSON.parse(localStorage.getItem('wp:sumo:world')).basho })");
            if (next.basho !== 1 || next.day !== 1 || next.size !== 16 || next.news[0] !== 'champion' || next.news.filter(t => t === 'rookie').length !== 2 || next.saved !== 1) record(`the next tournament: ${JSON.stringify(next)}`);
            await sleep(400);
            await shoot('sumo-news');
            if (await hurry('enter') !== 'enter') record('the next tournament did not begin');
            return true;
        }],
        ['a phone held upright: the ring and the nameplates fit, above the gesture bar; a tap throws a cushion', async () => {
            const viewport = { width: 412, height: 915, deviceScaleFactor: 2.625 };
            try {
                if (!await bootStage('w=sumo&host=android&seed=7', viewport)) return record('not ready on a phone');
                const g = await counts('({ ...m.G, inset: WP.host.insets.bottom })');
                if (g.safe !== 915 - 48) record(`the safe height is ${g.safe}`);
                if (g.cx - g.platform.rx * 1.1 < 0 || g.cy + g.platform.drop + g.platform.ry * 1.5 > g.safe - g.font * 4) record(`the ring: ${JSON.stringify(g)}`);
                if (g.roof.y < 0) record(`the roof starts at ${g.roof.y}`);
                await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 100, y: 300 }] });
                await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
                await sleep(150);
                if (await counts('m.cushions.length') !== 1) record(`a tap threw ${await counts('m.cushions.length')} cushions`);
                await shoot('sumo-phone');
            } finally {
                await cdp.send('Emulation.clearDeviceMetricsOverride');
            }
            return true;
        }],
    ],
    // The Never-Ending Baseball Season (SPEC §10.37): in the middle of a game
    // on the first frame; a pitch, a ball in play and a turn at bat written
    // down and saved; a game's end, a season's end, the trophy and the
    // winter; a phone; the keys and a tap.
    baseball: [
        ['mid-game on the first frame; a pitch is thrown; a turn at bat is written down and saved; a new tab carries on', async () => {
            if (!await stageWith('baseball', null, '&seed=7&date=2026-06-20T14:00')) return record('not ready');
            const first = await counts(`({ phase: m.phase, inning: m.game.inning, day: m.world.day, played: m.world.teams.map(t => t.w + t.l), nine: m.fielders.length, pitches: m.game.pitches, light: m.light, line: m.line,
                batter: !!m.man(m.view.batter), others: m.world.others.length, buffer: [m.canvas.width, m.canvas.height], px: m.px })`);
            if (first.phase !== 'set' || first.inning < 2 || first.day < 4 || first.nine !== 9 || first.pitches < 30 || !first.batter || first.others !== 3 || first.light !== 'day' || !/OF THE/.test(first.line)) record(`the first frame: ${JSON.stringify(first)}`);
            if (first.played.some(n => n !== first.day)) record(`a league founded with ${first.played} games played on day ${first.day}`);
            if (first.px < 2 || first.buffer[0] * first.px < 1280 || first.buffer[0] > 700) record(`the picture is ${first.buffer} at ${first.px} to the pixel`);
            if (await evaluate("localStorage.getItem('wp:baseball:world')") !== null) record('the league was saved before anything happened');
            // A real pitch, in real time: the ball leaves the mound and comes to the plate.
            if (!await waitFor(() => counts("m.phase === 'pitch' && m.pt > 0.1"), 8000)) return record('no pitch was thrown');
            const ball = await counts('m.ballNow()');
            if (!ball || !(ball.y > -2 && ball.y < 60) || !(ball.z > 0)) record(`the pitch: ${JSON.stringify(ball)}`);
            // On to a ball in play, and through it.
            const drive = until => counts(`(() => { let n = 0; while (!(${until}) && n++ < 300000) m.update(0.016); return n; })()`);
            await drive("m.phase === 'play' && m.play.field && m.tl > m.play.field.t * 0.6");
            const chase = await counts(`(() => { m.place(); const f = m.fielders[m.play.field.who], b = m.ballNow(); return { who: m.play.field.who, moved: Math.hypot(f.x - f.hx, f.y - f.hy), pose: f.pose, ball: b, code: m.play.result.code }; })()`);
            if (!chase.ball || !(chase.moved > 0.5 || chase.who < 2) || !['run', 'catch', 'ready', 'dive'].includes(chase.pose)) record(`a ball in play: ${JSON.stringify(chase)}`);
            await shoot('baseball-play');
            await drive("m.phase === 'result' && m.play.result && m.said");
            const turn = await counts(`({ code: m.play.result.code, line: m.line, pop: m.pop?.text, box: m.game.box[m.play.batter], pitches: m.game.pitches })`);
            const came = (turn.box?.ab || 0) + (turn.box?.bb || 0) + (turn.box?.hbp || 0) + (turn.box?.sf || 0);
            if (!turn.code || came < 1 || !(turn.line.length > 8) || !turn.pop) record(`a turn at bat: ${JSON.stringify(turn)}`);
            await drive("m.phase === 'set'");
            const saved = await evaluate("JSON.parse(localStorage.getItem('wp:baseball:world'))");
            const now = await counts('({ pitches: m.game.pitches, spot: m.game.spot, R: m.game.R, names: m.world.teams.map(t => t.name).join() })');
            if (!saved?.game || saved.game.pitches !== now.pitches || saved.teams.length !== 8) record(`saved after the turn: ${saved?.game?.pitches} pitches of ${now.pitches}`);
            // A new tab is at the same pitch of the same game.
            await cdp.send('Page.navigate', { url: `${WEB}/stage.html?w=baseball` });
            if (!await waitFor(() => evaluate('WP.stage?.ready'))) return record('not ready on reload');
            const again = await counts('({ pitches: m.game.pitches, spot: m.game.spot, R: m.game.R, names: m.world.teams.map(t => t.name).join(), phase: m.phase })');
            if (again.pitches !== now.pitches || again.names !== now.names || String(again.R) !== String(now.R) || String(again.spot) !== String(now.spot) || again.phase !== 'set') record(`after a reload: ${JSON.stringify(again)} for ${JSON.stringify(now)}`);
            return true;
        }],
        ['the last out, the standings and the next game; the end of a season, the series, the trophy and the winter', async () => {
            if (!await stageWith('baseball', null, '&seed=7&date=2026-06-20T21:30')) return record('not ready');
            const hurry = (...phases) => counts(`(() => { let n = 0; while (!${JSON.stringify(phases)}.includes(m.phase) && n++ < 600000) m.update(0.05); return m.phase; })()`);
            const day = await counts('m.world.day');
            // Shift+N plays the game out; the box score on the board adds up.
            const said = await counts('m.skip(true)');
            const end = await counts(`({ phase: m.phase, over: m.game.over, R: m.game.R, line: m.game.line.map(l => l.reduce((a, b) => a + b, 0)), view: m.view.R, inning: m.game.inning, wp: !!m.man(m.game.wp), lp: !!m.man(m.game.lp), light: m.light, lit: m.lit })`);
            if (end.phase !== 'final' || !end.over || end.R[0] === end.R[1] || String(end.line) !== String(end.R) || String(end.view) !== String(end.R) || end.inning < 9 || !end.wp || !end.lp || !/final/.test(said)) record(`the final: ${JSON.stringify(end)} "${said}"`);
            if (end.light !== 'night' || !(end.lit > 0)) record(`a night game: ${end.light}, lamps ${end.lit}`);
            await sleep(1600);
            await shoot('baseball-final');
            if (await hurry('table') !== 'table') return record('no standings after the game');
            const table = await counts("({ day: m.world.day, played: m.world.teams.map(t => t.w + t.l), game: m.world.game, saved: JSON.parse(localStorage.getItem('wp:baseball:world')).day })");
            if (table.day !== day + 1 || table.played.some(n => n !== day + 1) || table.game || table.saved !== day + 1) record(`after the game: ${JSON.stringify(table)}`);
            await sleep(300);
            await shoot('baseball-standings');
            if (await hurry('pregame') !== 'pregame') return record('no next game');
            const next = await counts('({ pitches: m.game.pitches, others: m.world.others.length, running: m.fielders.filter(f => f.from).length })');
            if (next.pitches !== 0 || next.others !== 3 || next.running !== 9) record(`the next game: ${JSON.stringify(next)}`);
            // Play the rest of the season and all but the end of the series in the rules alone, then watch the last game.
            await counts(`(() => { const G = BaseballLeague, w = m.world; while (w.stage !== 'series' || Math.max(...w.series.wins) < G.SERIES - 1) { while (G.pitch(w, Math.random)); if (G.closeGame(w) === 'champion') break; G.openDay(w, Math.random, {}); } m.enter(); m.go('pregame'); })()`);
            const series = await counts('({ stage: m.world.stage, kind: m.game.kind, top: BaseballLeague.standings(m.world).slice(0, 2).map(t => t.id).sort(), pair: [m.world.series.a, m.world.series.b].sort(), wins: m.world.series.wins })');
            if (series.stage !== 'series' || series.kind !== 'series' || String(series.top) !== String(series.pair)) record(`the series: ${JSON.stringify(series)}`);
            await sleep(300);
            await shoot('baseball-series');
            // The series may need another game or two; each ends in a final and a sheet.
            for (let i = 0; i < 4 && await counts("m.world.stage === 'series'"); i++) { await counts('m.skip(true)'); if (await hurry('table', 'trophy') === 'table') await hurry('pregame'); }
            const cup = await counts("({ phase: m.phase, champion: m.world.champion, wins: m.world.series.wins, winner: m.sides[m.winner]?.id, line: m.line, rockets: m.rockets })");
            if (cup.phase !== 'trophy' || cup.champion == null || Math.max(...cup.wins) !== 3 || cup.winner !== cup.champion || !/CHAMPIONS/.test(cup.line)) record(`the trophy: ${JSON.stringify(cup)}`);
            await counts('(() => { for (let i = 0; i < 80; i++) m.update(0.05); })()');
            await sleep(300);
            if (!(await counts('m.sparks.length') > 20)) record('no confetti or fireworks for the champions');
            await shoot('baseball-trophy');
            if (await hurry('news') !== 'news') return record('no winter');
            const winter = await counts("({ season: m.world.season, day: m.world.day, stage: m.world.stage, news: m.news.map(n => n.type), saved: JSON.parse(localStorage.getItem('wp:baseball:world')).season, played: m.world.teams.reduce((n, t) => n + t.w + t.l, 0) })");
            if (winter.season !== 2 || winter.day !== 0 || winter.stage !== 'season' || winter.news[0] !== 'champion' || winter.saved !== 2 || winter.played !== 0) record(`the winter: ${JSON.stringify(winter)}`);
            await sleep(300);
            await shoot('baseball-winter');
            if (await hurry('pregame') !== 'pregame') record('the next season did not begin');
            return true;
        }],
        ['a phone held upright: everything fits above the gesture bar; the picture follows the ball; a tap starts a wave and a hot dog', async () => {
            const viewport = { width: 412, height: 915, deviceScaleFactor: 2.625 };
            try {
                if (!await bootStage('w=baseball&host=android&seed=7&date=2026-06-20T19:00', viewport)) return record('not ready on a phone');
                const g = await counts('({ ...m.G, px: m.px, inset: WP.host.insets.bottom, light: m.light })');
                if (!g.portrait || g.inset !== 48 || (g.tickerY + g.ticker) * g.px > 915 - 48 + g.px) record(`the captions end at ${(g.tickerY + g.ticker) * g.px} of ${915 - 48}`);
                if (!(g.pan > 20) || g.top < 80 || g.homeY > g.cardsY - 8 || g.s < 0.6) record(`the layout: ${JSON.stringify(g)}`);
                if (g.light !== 'dusk') record(`at seven in the evening the light is ${g.light}`);
                // The scoreboard is a fixed panel here: it, the corner captions, the two cards and the announcer are
                // all wholly on screen above the gesture bar, and none lies over another, in every park.
                const boxes = () => counts('({ rects: m.rects, bw: m.G.bw, floor: m.G.bh - m.G.inset, fixed: !!m.G.board.fixed, park: m.sides[1].park.cf })');
                const laid = b => {
                    if (!b.fixed || !['board', 'ticker', 'batter', 'pitcher', 'league', 'around'].every(name => b.rects.some(r => r[0] === name))) record(`the panels on a phone: ${b.rects.map(r => r[0])}, fixed ${b.fixed}`);
                    for (const [name, x, y, w, h] of b.rects) if (x < 0 || y < 0 || x + w > b.bw || y + h > b.floor) record(`${name} is off the screen: ${[x, y, w, h]} in ${b.bw} x ${b.floor} (centre field ${b.park})`);
                    b.rects.forEach((p, i) => b.rects.slice(i + 1).forEach(q => { if (p[1] < q[1] + q[3] && q[1] < p[1] + p[3] && p[2] < q[2] + q[4] && q[2] < p[2] + p[4]) record(`${p[0]} lies over ${q[0]} (centre field ${b.park})`); }));
                };
                laid(await boxes());
                const parks = await counts(`(() => { const home = m.sides[1], own = home.park, out = [];
                    for (const team of m.world.teams) { home.park = team.park; m.resize(); m.dirty = true; m.draw(); out.push({ rects: m.rects, bw: m.G.bw, floor: m.G.bh - m.G.inset, fixed: !!m.G.board.fixed, park: team.park.cf }); }
                    home.park = own; m.resize(); m.dirty = true; m.draw(); return out; })()`);
                if (parks.length !== 8) record('could not lay out every park');
                parks.forEach(laid);
                // The whole line score is in the picture: the board's own canvas is drawn unpanned at its place.
                const board = await counts('({ x: m.G.board.x, y: m.G.board.y, w: m.board.width, h: m.board.height, bw: m.G.bw })');
                if (board.x < 2 || board.x + board.w > board.bw - 2 || board.y < 2) record(`the scoreboard: ${JSON.stringify(board)}`);
                // A ball hit to the corner: the picture pans after it, and comes back.
                await counts(`(() => { let n = 0; while (!(m.phase === 'play' && m.play.field && Math.abs(m.play.field.at[0]) > 110 && m.tl > m.play.field.t - 0.2) && n++ < 900000) m.update(0.016); })()`);
                const pan = await counts('({ cam: m.cam, x: m.play.field.at[0], pan: m.G.pan })');
                if (!(Math.abs(pan.cam) > 12) || Math.sign(pan.cam) !== Math.sign(pan.x) || Math.abs(pan.cam) > pan.pan + 0.01) record(`the picture did not follow the ball: ${JSON.stringify(pan)}`);
                await sleep(200);
                await shoot('baseball-phone');
                const tap = async (x, y) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(150); };
                await tap(100, 300);
                const wave = await counts('({ balls: m.balls.length, wave: !!m.wave, dogs: m.dogs.length })');
                if (wave.balls !== 1 || !wave.wave || wave.dogs) record(`a tap: ${JSON.stringify(wave)}`);
                const [vx, vy] = await counts('[(m.vendor.x - m.G.pan - m.cam) * m.px, (m.baked.rim - 4) * m.px]');
                if (vx > 4 && vx < 408) { await tap(Math.round(vx), Math.round(vy)); const dogs = await counts('m.dogs.length'); if (dogs !== 1) record(`a tap on the hot-dog seller threw ${dogs}`); }
            } finally {
                await cdp.send('Emulation.clearDeviceMetricsOverride');
            }
            return true;
        }],
        ['S holds the game for the standings; N goes to the next half; rain brings the tarp; settings apply live; a new league', async () => {
            if (!await stageWith('baseball', null, '&seed=7&date=2026-06-20T14:00')) return record('not ready');
            const before = await counts('({ pitches: m.game.pitches, inning: m.game.inning, half: m.game.half, name: m.world.name, towns: m.world.teams.map(t => t.town).join() })');
            if (await counts('m.sheet()') !== 'The standings') record('S did not hold up the standings');
            await sleep(1500);
            if (await counts('m.game.pitches') !== before.pitches) record('the game went on behind the standings');
            await shoot('baseball-sheet');
            await counts('(() => { m.sheet(); m.sheet(); m.sheet(); })()');
            if (await counts('m.peek') !== 0) record('S did not put the sheets away');
            const said = await counts('m.skip(false)');
            const half = await counts('({ phase: m.phase, inning: m.game.inning, half: m.game.half, outs: m.game.outs, nine: m.fielders.map(f => f.side), game: m.game.half })');
            if (half.phase !== 'half' || (half.inning === before.inning && half.half === before.half) || half.outs !== 0 || half.nine.some(s => s !== 1 - half.game) || !/On to the/.test(said)) record(`N: ${JSON.stringify(half)} "${said}"`);
            // Left to itself, a sheet comes up between the halves (the words are redrawn when one is due, not every frame).
            await sleep(1900);
            const sheet = await counts(`(() => { const G = m.G, d = m.hud.getContext('2d', { willReadFrequently: true }).getImageData(Math.round(G.bw / 2), Math.round((G.top + G.homeY) / 2) - 6, 1, 1).data; return { alpha: d[3], pt: m.pt, phase: m.phase }; })()`);
            if (sheet.phase === 'half' && sheet.pt > 1.2 && sheet.pt < 4.5 && !sheet.alpha) record(`no sheet between the halves: ${JSON.stringify(sheet)}`);
            // Rain: drops, a tarp, nobody on the field; then it stops and they come back.
            await counts("(() => { m.go('rain'); for (let i = 0; i < 100; i++) m.update(0.05); m.place(); })()");
            const rain = await counts('({ drops: m.drops.length, raining: m.raining, hidden: m.fielders.filter(f => f.hidden).length, line: m.line })');
            if (!(rain.drops > 10) || !rain.raining || rain.hidden !== 9 || !/RAIN|TARP/.test(rain.line)) record(`a rain delay: ${JSON.stringify(rain)}`);
            await sleep(300);
            await shoot('baseball-rain');
            await counts("(() => { let n = 0; while (m.phase !== 'set' && n++ < 4000) m.update(0.05); for (let i = 0; i < 40; i++) m.update(0.05); m.place(); })()");
            const dry = await counts('({ drops: m.drops.length, raining: !!m.raining, hidden: m.fielders.filter(f => f.hidden).length })');
            if (dry.drops || dry.raining || dry.hidden) record(`after the rain: ${JSON.stringify(dry)}`);
            // Captions off leaves the park and its scoreboard; the light can be pinned.
            await counts("m.applySettings({ ...m.config, captions: false, time: 'night' })");
            await sleep(300);
            const plain = await counts(`(() => { const d = m.hud.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, m.hud.width, m.hud.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return { n, light: m.light }; })()`);
            if (plain.n !== 0 || plain.light !== 'night') record(`captions off, at night: ${JSON.stringify(plain)}`);
            await shoot('baseball-plain');
            // The panel's button founds another league, and that one is saved.
            await counts("m.onAction('reset')");
            const league = await counts("({ towns: m.world.teams.map(t => t.town).join(), phase: m.phase, inning: m.game.inning, saved: JSON.parse(localStorage.getItem('wp:baseball:world')).teams.map(t => t.town).join() })");
            if (league.towns === before.towns || league.saved !== league.towns || league.phase !== 'set' || league.inning < 2) record(`a new league: ${JSON.stringify(league)}`);
            return true;
        }],
    ],
    'ice-patrol': [
        ['in the air on the first frame: wingmen, lights, the terrain scan whole and under the craft, live gauges', async () => {
            if (!await stageWith('ice-patrol', null, '&seed=7')) return record('not ready');
            await sleep(2500);
            const paint = "c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) n += d[i] > 40; return n / (d.length / 4); }";
            const s = await evaluate(`(m => ({ flat: m.flat, agl: m.flight.agl, wingmen: m.wingmen.length, craft: m.scene.craft.length, lights: m.scene.lights.length,
                radar: (${paint})(m.cockpit.radar), gauges: (${paint})(m.cockpit.gauges), frame: (${paint})(m.cockpit.frame), grips: (${paint})(m.cockpit.grips),
                off: (sc => Math.max(Math.abs(m.flight.x / sc.cell - sc.i - m.cockpit.radar.width / 2), Math.abs(m.flight.z / sc.cell - sc.j - m.cockpit.radar.width / 2)))(m.cockpit.scan),
                switches: m.cockpit.life.switches.length, drawn: Object.keys(m.cockpit.sigs).length,
                shown: m.cockpit.wrap.style.display !== 'none' }))(WP.stage.manager)`);
            if (!(s.agl >= 4)) record(`it is ${s.agl} m above the snow`);
            if (s.wingmen !== 2 || s.craft !== 2 || s.lights < 4) record(`the formation: ${JSON.stringify(s)}`);
            // The scan is a whole picture from the first frame (no sweep to wait for), and its map stays centred on the craft to within a cell.
            if (s.radar < 0.99) record(`the scan has painted ${(s.radar * 100).toFixed(1)}% of its map`);
            if (!(s.off <= 1)) record(`the scan's map is ${s.off} cells off the craft`);
            if (s.gauges < 0.03 || s.frame < 0.2 || s.grips < 0.02 || !s.shown) record(`the cockpit: ${JSON.stringify(s)}`);
            if (s.switches !== 17 || s.drawn < 10) record(`the panel's small life: ${s.switches} switches, ${s.drawn} instruments drawn`);
            if (await evaluate(DRAWN) < 30) record('barely drawn');
            await shoot('ice-patrol-cockpit');
            return s.agl >= 4;
        }],
        ['without WebGL it flies on as ridgelines, as far each second on Low as on High; and by hand, until let go', async () => {
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
                // By hand, on the quick 2D view: D turns it right, a press the player forwards counts too, and five seconds hands-off give it back.
                if (!await stageWith('ice-patrol', { configVersion: 1, panelSize: 'tiny' }, '&seed=7')) return record('by hand: not ready');
                const hand = () => evaluate('(m => ({ active: m.pilot.active, hold: m.pilot.hold, turn: m.flight.turn, roll: m.flight.roll, lift: m.pilot.lift, throttle: m.pilot.throttle, agl: m.flight.agl, ph: m.cockpit.g.ph, h: innerHeight }))(WP.stage.manager)');
                const before = await hand();
                if (before.active || before.hold !== 0) record(`flown by hand before a key: ${JSON.stringify(before)}`);
                if (before.ph > before.h * 0.34 * 0.5) record(`the extra small panel is ${before.ph} px of ${before.h}`);
                const key = (type, name) => evaluate(`document.dispatchEvent(new KeyboardEvent('${type}', { key: '${name}', bubbles: true }))`);
                await key('keydown', 'd');
                await key('keydown', 'ArrowUp');
                await key('keydown', 'e');
                await sleep(2000);
                const flown = await hand();
                if (!flown.active || flown.turn < 0.3 || flown.roll < 0.5 || flown.lift < 40 || flown.throttle < 1.5) record(`D, Up and E held for 2 s: ${JSON.stringify(flown)}`);
                for (const name of ['d', 'ArrowUp', 'e']) await key('keyup', name);
                await sleep(2500);
                const let_ = await hand();
                if (!let_.active || Math.abs(let_.turn) > 0.1 || let_.lift < 40) record(`2.5 s after letting go: ${JSON.stringify(let_)}`);
                await sleep(3500);
                const back = await hand();
                if (back.active) record('the autopilot did not take it back after 5 s');
                await evaluate("WP.entry('ice-patrol').keys.find(k => k.keys.includes('a')).run(WP.stage.manager, { key: 'A' })");
                await sleep(300);
                const tapped = await hand();
                if (!tapped.active || tapped.turn >= 0) record(`a forwarded A: ${JSON.stringify(tapped)}`);
                if (await evaluate("localStorage.getItem('wp:ice-patrol')") !== JSON.stringify({ configVersion: 1, panelSize: 'tiny' })) record('flying by hand saved something');
            } finally {
                await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
            }
            return true;
        }],
        ['night lights the lamps and the stars; a blizzard closes in and buffets, unless Turbulence is 0; the keys step and save', async () => {
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
            // The air: in a blizzard the view and the airframe are buffeted; with Turbulence at 0 (taken live) the flight is dead level.
            const air = "(m => { let most = 0; for (let i = 0; i < 40; i++) { m.seconds += 0.11; m.draw(); most = Math.max(most, Math.abs(m.scene.cam.pitch - (m.flight.pitch * 0.6 - 0.045)), Math.abs(m.scene.cam.roll - m.flight.roll * m.config.bank)); } return { most, bob: { ...m.bob }, at: m.cockpit.wrap.style.transform }; })(WP.stage.manager)";
            await evaluate('(m => { m.update = () => {}; m.renderer.render = () => {}; })(WP.stage.manager)');    // (software WebGL: seconds a frame)
            const rough = await evaluate(air);
            if (!(rough.most > 0.004)) record(`a blizzard moves the view ${rough.most} rad at most`);
            await evaluate('(m => m.applySettings({ ...m.config, turbulence: 0 }))(WP.stage.manager)');
            const level = await evaluate(air);
            if (level.most !== 0 || level.bob.x !== 0 || level.bob.y !== 0 || level.bob.pitch !== 0 || level.bob.roll !== 0) record(`Turbulence 0 still moves: ${JSON.stringify(level)}`);
            if (!await stageWith('ice-patrol', { configVersion: 1, time: 'day', weather: 'blizzard', lamps: false }, '&seed=7')) return record('blizzard again: not ready');
            // X, T, V and R, as the catalog binds them.
            const keys = await evaluate(`(m => { const run = key => WP.entry('ice-patrol').keys.find(k => k.keys.includes(key)).run(m, {}); return { w: run('x'), t: run('t'), v: [run('v'), run('v')], r: run('r'), config: m.config, saved: JSON.parse(localStorage.getItem('wp:ice-patrol')) }; })(WP.stage.manager)`);
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
    // Wayfarer (§10.38): on the road on frame one with the world built about
    // it and the traveller on the ground; the three cameras; day and night;
    // rain; the keys; the same walk without WebGL; a phone. Headless Chrome
    // draws its WebGL in software, so the pace is timed on the 2D fallback.
    wayfarer: [
        ['on the road on the first frame: the land built, the traveller and a companion on it, and it walks', async () => {
            if (!await stageWith('wayfarer', null, '&seed=7')) return record('not ready');
            const state = () => evaluate('JSON.parse(JSON.stringify(WP.stage.manager.debugState()))');
            const first = await state();
            if (first.flat) record('no WebGL in the smoke browser');
            if (first.near < 25 || first.far < 25 || first.queue) record(`the world on frame one: ${JSON.stringify({ near: first.near, far: first.far, queue: first.queue })}`);
            if (Math.abs(first.y - first.ground) > 0.01 || first.mode !== 'walk' || Math.abs(first.d) > 0.6) record(`the traveller: ${JSON.stringify({ y: first.y, ground: first.ground, mode: first.mode, d: first.d })}`);
            if (first.moving < 1500 || !first.companion) record(`only ${first.moving} vertices of traveller and companion`);
            if (!(first.clear > 0.4) || !first.feet || !first.head) record(`the camera: ${first.clear} m up, feet ${first.feet}`);
            await sleep(3000);
            const s = await state();
            if (!(s.distance > first.distance)) record(`it has not walked: ${first.distance} then ${s.distance}`);
            if (s.drawn.squares < 20 || s.drawn.triangles < 20000) record(`drawn: ${JSON.stringify(s.drawn)}`);
            if (await evaluate(DRAWN) < 30) record('barely drawn');
            if (await evaluate("Object.keys(localStorage).filter(k => k.startsWith('wp:wayfarer')).length")) record('it saved something by itself');
            await shoot('wayfarer-road');
            return true;
        }],
        ['the four cameras, a drag to look round, and the keys: V steps and saves, T and X too, N goes on down the road', async () => {
            if (!await stageWith('wayfarer', { configVersion: 2, time: 'day', weather: 'clear' }, '&seed=7')) return record('not ready');
            const where = () => evaluate('(m => ({ ...JSON.parse(JSON.stringify(m.debugState())), x: m.standing.x, z2: m.standing.z }))(WP.stage.manager)');
            const run = key => evaluate(`WP.entry('wayfarer').keys.find(k => k.keys.includes('${key}')).run(WP.stage.manager, {})`);
            const away = s => Math.hypot(s.cam.x - s.x, s.cam.z - s.z2);
            const a = await where();
            if (a.camera !== 'follow' || away(a) < 3.5 || away(a) > 9 || !a.feet || a.feet[1] < 400 || a.feet[1] > 800) record(`behind the traveller: ${away(a).toFixed(1)} m, feet at ${a.feet}`);
            // A drag turns the view; nothing is saved by looking.
            await drag([[900, 400], [760, 400], [620, 410], [480, 410]], 60);
            const turned = await evaluate('WP.stage.manager.glance.yaw');
            if (!(turned < -0.5)) record(`a drag across the screen turned the view ${turned} rad`);
            if (await evaluate("localStorage.getItem('wp:wayfarer')") !== JSON.stringify({ configVersion: 2, time: 'day', weather: 'clear' })) record('looking round saved something');
            const said = [await run('v')];
            await sleep(1500);
            const o = await where();
            if (o.camera !== 'orbit' || !o.orbit.open || !(o.clear > 0.4) || !o.feet || Math.abs(away(o) - 8 * Math.cos(18 * Math.PI / 180)) > 1.5) record(`orbit: ${JSON.stringify({ camera: o.camera, orbit: o.orbit, away: away(o) })}`);
            said.push(await run('v'));
            await sleep(1500);
            const b = await where();
            if (b.camera !== 'first' || away(b) > 0.6 || b.moving > a.moving - 300) record(`through their eyes: ${away(b).toFixed(2)} m away, ${b.moving} vertices moving (${a.moving} with the traveller drawn)`);
            said.push(await run('v'));
            await sleep(1500);
            const c = await where();
            if (c.camera !== 'drift' || !(c.clear > 0.4)) record(`cinematic: ${JSON.stringify({ camera: c.camera, clear: c.clear })}`);
            // The next shot: the veil dips and the camera is somewhere else.
            await evaluate('WP.stage.manager.shot.t = 999');
            if (!await waitFor(() => evaluate('WP.stage.manager.shot.index === 1'), 15000)) record('the cinematic camera never cut');
            await sleep(1500);
            const d = await where();
            if (Math.hypot(d.cam.x - c.cam.x, d.cam.y - c.cam.y, d.cam.z - c.cam.z) < 3 || !(d.clear > 0.4)) record(`the cut left the camera where it was: ${JSON.stringify(d.cam)}`);
            if (!/Orbit/.test(said[0]) || !/eyes/.test(said[1]) || !/Cinematic/.test(said[2])) record(`V said ${JSON.stringify(said)}`);
            const t = await run('t'), x = await run('x'), n = await run('n');
            // The new land is built a few milliseconds a frame and swapped in whole: wait until the land in use is the
            // land about the traveller, however slow the frames are. (The queue itself proves nothing: a change of
            // quality or the next square along fills it again, with the old land drawn meanwhile.)
            const whole = "(() => { const m = WP.stage.manager, me = WayLogic.standing(m.journey, m.world), h = m.active.hole; return !!h && me.x >= h[0] && me.z >= h[1] && me.x < h[2] && me.z < h[3]; })()";
            if (!await waitFor(() => evaluate(whole), 30000)) record('N: the land about the traveller was never whole');
            const after = await where(), saved = await evaluate("JSON.parse(localStorage.getItem('wp:wayfarer'))");
            if (saved.camera !== 'drift' || saved.time !== 'dusk' || saved.weather !== 'fair') record(`the keys saved ${JSON.stringify(saved)}`);
            if (!/dusk/.test(t) || !/fair/.test(x) || !/^On to /.test(n)) record(`the keys said ${JSON.stringify([t, x, n])}`);
            if (!(after.z > d.z + 60) || after.near < 25 || Math.abs(after.y - after.ground) > 0.01) record(`N: from ${d.z.toFixed(0)} to ${after.z.toFixed(0)}, ${after.near} squares`);
            await shoot('wayfarer-cinematic');
            return true;
        }],
        ['night lights the lanterns and the stars, and is darker than noon; rain falls, and snow where it is cold', async () => {
            // Into the nearest town, where the windows are.
            const toTown = "(m => { let l = m.world.leg(Math.floor(m.journey.z / 360)); while (l.place !== 'village') l = m.world.leg(l.i + 1); m.journey.z = l.zc - 30; m.party.forEach(p => { p.x = null; }); m.stream(true); m.snap = true; })(WP.stage.manager)";
            const state = () => evaluate('(m => ({ ...JSON.parse(JSON.stringify(m.debugState())), tint: m.scene.fallTint, size: m.scene.dropSize, cold: m.cold, wetGround: m.scene.wet }))(WP.stage.manager)');
            if (!await stageWith('wayfarer', { configVersion: 2, time: 'day', weather: 'clear', towns: 1.6 }, '&seed=7')) return record('midday: not ready');
            await evaluate(toTown);
            await sleep(2500);
            const day = await evaluate(AVERAGE), noon = await state();
            if (noon.lit !== 0 || noon.stars !== 0 || noon.fall > 0.1) record(`midday: ${JSON.stringify({ lit: noon.lit, stars: noon.stars, fall: noon.fall })}`);
            if (!await stageWith('wayfarer', { configVersion: 2, time: 'night', weather: 'clear', towns: 1.6 }, '&seed=7')) return record('night: not ready');
            await evaluate(toTown);
            await sleep(2500);
            const night = await evaluate(AVERAGE), n = await state();
            if (n.lit < 0.95 || n.stars < 0.9 || n.glows < 12 || n.lamps < 2) record(`night: ${JSON.stringify({ lit: n.lit, stars: n.stars, glows: n.glows, lamps: n.lamps })}`);
            if (night.reduce((a, b) => a + b) > day.reduce((a, b) => a + b) * 0.75) record(`night ${night} is hardly darker than midday ${day}`);
            await shoot('wayfarer-night');
            if (!await stageWith('wayfarer', { configVersion: 2, time: 'day', weather: 'rain', season: 'summer' }, '&seed=7')) return record('rain: not ready');
            await sleep(1500);
            const r = await state();
            if (r.wet < 0.7 || r.cloud < 0.95 || r.fall < 0.5) record(`rain: ${JSON.stringify({ wet: r.wet, cloud: r.cloud, fall: r.fall })}`);
            if (r.cold < 0.5 ? (r.size > 0.03 || r.wetGround < 0.5) : (r.size < 0.03 || r.wetGround > 0.5)) record(`what falls where it is ${r.cold < 0.5 ? 'warm' : 'cold'}: ${JSON.stringify({ size: r.size, wet: r.wetGround })}`);
            await shoot('wayfarer-rain');
            if (!await stageWith('wayfarer', { configVersion: 2, time: 'day', weather: 'rain', season: 'winter' }, '&seed=7')) return record('snow: not ready');
            await sleep(1500);
            const w = await state();
            if (w.cold !== 1 || w.size < 0.03 || w.wetGround > 0.01 || w.fall < 0.4) record(`winter rain is not snow: ${JSON.stringify({ cold: w.cold, size: w.size, wet: w.wetGround, fall: w.fall })}`);
            return true;
        }],
        ['orbit: a drag turns the camera about the traveller and it stays and is saved; the wheel moves it in and out; overhead and in the grass; in clear air in a town', async () => {
            if (!await stageWith('wayfarer', { configVersion: 2, time: 'day', weather: 'clear', camera: 'orbit', rests: false }, '&seed=7')) return record('not ready');
            const state = () => evaluate('(m => ({ ...JSON.parse(JSON.stringify(m.debugState())), x: m.standing.x, z2: m.standing.z, h: m.world.heading(m.journey.z), held: m.orbit.held }))(WP.stage.manager)');
            const saved = () => evaluate("JSON.parse(localStorage.getItem('wp:wayfarer'))");
            const a = await state();
            if (a.camera !== 'orbit' || Math.abs(a.orbit.az - 35 * Math.PI / 180) > 1e-6 || Math.abs(a.orbit.el - 18 * Math.PI / 180) > 1e-6 || a.orbit.dist !== 8 || !a.orbit.open) record(`it starts at ${JSON.stringify(a.orbit)}`);
            // Behind and to their right: the camera's side of the traveller is the right hand.
            const side = s => (s.cam.x - s.x) * Math.cos(s.h) - (s.cam.z - s.z2) * Math.sin(s.h);
            if (!(side(a) > 2) || !a.feet || !a.head || a.head[1] > a.feet[1]) record(`at 35°: ${side(a).toFixed(1)} m to the right, feet ${a.feet}, head ${a.head}`);
            // Drag left and down: round to the front, and up.
            await drag([[900, 300], [760, 340], [620, 380], [480, 420], [340, 460]], 60);
            await sleep(600);
            const size = await evaluate('[innerWidth, innerHeight]');
            const b = await state(), want = { az: 35 * Math.PI / 180 + 560 / size[0] * Math.PI * 2 * 0.6, el: 18 * Math.PI / 180 + 160 / size[1] * Math.PI * 0.62 };
            if (Math.abs(b.orbit.az - want.az) > 0.02 || Math.abs(b.orbit.el - want.el) > 0.02 || b.held) record(`the drag left it at ${JSON.stringify(b.orbit)}, not ${JSON.stringify(want)}`);
            await sleep(5000);
            const c = await state(), kept = await saved();
            if (c.orbit.az !== b.orbit.az || c.orbit.el !== b.orbit.el) record(`it did not stay: ${JSON.stringify(c.orbit)}`);
            if (!kept || kept.orbitAzimuth !== Math.round(b.orbit.az * 180 / Math.PI) || kept.orbitElevation !== Math.round(b.orbit.el * 180 / Math.PI) || kept.camera !== 'orbit') record(`the drag saved ${JSON.stringify(kept)}`);
            // The wheel: out, and it is saved on the slider's half-metre steps.
            await evaluate("document.dispatchEvent(new WheelEvent('wheel', { deltaY: 240 })); document.dispatchEvent(new WheelEvent('wheel', { deltaY: 240 }))");
            await sleep(2500);
            const d = await state(), far = await saved();
            if (!(d.orbit.dist > 12) || far.orbitDistance !== Math.round(d.orbit.dist * 2) / 2) record(`the wheel: ${d.orbit.dist} m, saved ${far.orbitDistance}`);
            // From the panel: straight overhead, then down in the grass in front; turning, it turns.
            const apply = more => evaluate(`(m => m.applySettings({ ...m.config, ...${JSON.stringify(more)} }))(WP.stage.manager)`);
            await apply({ orbitElevation: 90, orbitDistance: 30, orbitAzimuth: 0 });
            await sleep(1500);
            const top = await state();
            if (Math.abs(top.cam.pitch + Math.PI / 2) > 0.02 || !(top.cam.y - top.y > 4 && top.cam.y - top.y < 31.6) || !top.feet || Math.abs(top.feet[0] - size[0] / 2) > 60 || Math.abs(top.feet[1] - size[1] / 2) > 80) record(`overhead: ${JSON.stringify({ pitch: top.cam.pitch, up: top.cam.y - top.y, feet: top.feet })}`);
            await shoot('wayfarer-orbit-overhead');
            await apply({ orbitElevation: 2, orbitDistance: 6, orbitAzimuth: 180 });
            await sleep(1500);
            const low = await state();
            if (!(low.clear > 0.4) || !low.orbit.open || !(low.cam.y - low.y < 2.2) || !low.head) record(`in the grass: ${JSON.stringify({ clear: low.clear, up: low.cam.y - low.y, open: low.orbit.open })}`);
            await shoot('wayfarer-orbit-front');
            await apply({ orbitMode: 'turning' });
            await evaluate('WP.stage.manager.orbit.idle = 99');
            await sleep(2500);
            const spun = await state();
            if (!(Math.abs(spun.orbit.az - low.orbit.az) > 0.01)) record(`turning, it stood still at ${spun.orbit.az}`);
            // In a town, at every bearing: never inside a house.
            await apply({ orbitMode: 'fixed', orbitElevation: 12, orbitDistance: 25 });
            await evaluate("(m => { let l = m.world.leg(Math.floor(m.journey.z / 360)); while (l.place !== 'village') l = m.world.leg(l.i + 1); m.journey.z = l.zc - 20; m.party.forEach(p => { p.x = null; }); m.stream(true); m.snap = true; })(WP.stage.manager)");
            for (const az of [0, 90, 180, -90]) {
                await apply({ orbitAzimuth: az });
                await sleep(1200);
                const t = await state();
                if (!t.orbit.open || !(t.clear > 0.4) || t.orbit.reach > 25.01) record(`in the village at ${az}°: ${JSON.stringify({ open: t.orbit.open, clear: t.clear, reach: t.orbit.reach })}`);
                if (az === 90) await shoot('wayfarer-orbit-village');
            }
            return true;
        }],
        ['a company of six, each in its place; nobody; the barbarian with her brand after dark; the druid changes shape and back; the rogue goes unseen and returns', async () => {
            const six = ['moofy', 'hound', 'pony', 'raven', 'ibbie', 'lantern'];
            // (No wildlife: its animals are drawn with the traveller and company, and would swamp the counts below.)
            if (!await stageWith('wayfarer', { configVersion: 2, time: 'day', weather: 'clear', companionPick: 'choose', companionChoice: six, rests: false, craft: 'never', wildlife: 'none' }, '&seed=7')) return record('not ready');
            const state = () => evaluate('JSON.parse(JSON.stringify(WP.stage.manager.debugState()))');
            const apply = more => evaluate(`(m => m.applySettings({ ...m.config, ...${JSON.stringify(more)} }))(WP.stage.manager)`);
            const run = () => evaluate("WP.entry('wayfarer').keys.find(k => k.keys.includes('g')).run(WP.stage.manager, {})");
            const first = await state();
            if (first.party.map(p => p.id).join() !== six.join() || !first.companion) record(`the company on frame one: ${JSON.stringify(first.party.map(p => p.id))}`);
            await sleep(4000);
            const a = await state(), walkers = a.party.filter(p => p.alt < 0.5 && p.riding < 0.5);
            let closest = 9;
            for (const p of walkers) for (const q of walkers) if (p !== q) closest = Math.min(closest, Math.hypot(p.x - q.x, p.z - q.z));
            if (walkers.length < 3 || closest < 0.3) record(`${walkers.length} on foot, two of them ${closest.toFixed(2)} m apart`);
            if (!(a.party[3].alt > 1.5) || !(a.party[4].riding > 0.9) || !(a.party[5].alt > 1)) record(`the raven at ${a.party[3].alt} m, Ibbie riding ${a.party[4].riding}, the lantern at ${a.party[5].alt} m`);
            if (a.moving < 8000) record(`only ${a.moving} vertices of traveller and company`);
            await shoot('wayfarer-company');
            await apply({ companionPick: 'surprise', companions: 0 });
            await sleep(800);
            // (They turn back down the road; once they are well behind, they are gone.)
            const home = await evaluate('WP.stage.manager.leavers.length');
            if (!(home >= 4)) record(`${home} of the six are on their way home`);
            if (!await waitFor(() => evaluate('WP.stage.manager.leavers.length === 0'), 40000)) record('those sent home are still here');
            const alone = await state();
            if (alone.party.length || alone.moving > a.moving - 5000) record(`alone: ${alone.party.length} companions, ${alone.moving} vertices`);
            // Left to chance again: three, one of the named cats at their head.
            await apply({ companions: 3, companionPick: 'surprise' });
            const led = await state();
            if (led.party.length !== 3 || !['moofy', 'butters', 'waffles', 'ras', 'ibbie', 'maus', 'turkey', 'harry', 'kittytoes'].includes(led.party[0].id)) record(`surprise: ${JSON.stringify(led.party.map(p => p.id))}`);
            // (Alone again for what follows: the traveller's own figure is what is counted.)
            await apply({ companions: 0 });
            if (!await waitFor(() => evaluate('WP.stage.manager.leavers.length === 0'), 40000)) record('those sent home are still here');
            // The barbarian: no cloak and no staff, and a brand in her hand after dark.
            await apply({ traveller: 'barbarian', time: 'night' });
            if (!await waitFor(() => evaluate('WP.stage.manager.light.lit > 0.9'), 30000)) record('night never fell');
            await sleep(1500);
            const barb = await state();
            if (barb.traveller !== 'barbarian' || barb.lamps < 1 || barb.moving < 8000 || await evaluate('!!WayActors.LOOKS.barbarian.cloak || WayActors.LOOKS.barbarian.hand === "crook"')) record(`the barbarian: ${JSON.stringify({ lamps: barb.lamps, moving: barb.moving })}`);
            await shoot('wayfarer-barbarian-night');
            // The druid: another shape at the key, and her own again at the next.
            await apply({ traveller: 'druid', time: 'day' });
            const said = [await run()];
            if (!await waitFor(() => evaluate("WP.stage.manager.shift.form !== 'self'"), 40000)) record('the druid never changed shape');
            const beast = await state();
            if (!['bear', 'owlbeast', 'panther'].includes(beast.form) || beast.change !== 1 || beast.moving < 2000) record(`changed: ${JSON.stringify({ form: beast.form, change: beast.change, moving: beast.moving })}`);
            await shoot('wayfarer-druid-changed');
            said.push(await run());
            if (!await waitFor(() => evaluate("WP.stage.manager.shift.form === 'self' && WP.stage.manager.shift.change === 1"), 40000)) record('the druid never changed back');
            if (!/another shape/.test(said[0]) || !/own shape/.test(said[1])) record(`G said ${JSON.stringify(said)}`);
            // The rogue: a shimmer at the key (drawn apart, see-through), and back.
            await apply({ traveller: 'rogue' });
            said.push(await run());
            if (!await waitFor(() => evaluate('WP.stage.manager.stealth.hidden === 1'), 30000)) record('the rogue never went unseen');
            await sleep(500);
            const unseen = await state();
            if (!(unseen.ghost[0] > 6000) || unseen.moving > 3000) record(`unseen: ${JSON.stringify({ ghost: unseen.ghost, moving: unseen.moving })}`);
            await shoot('wayfarer-rogue-unseen');
            said.push(await run());
            if (!await waitFor(() => evaluate('WP.stage.manager.stealth.hidden === 0'), 30000)) record('the rogue never came back');
            const back = await state();
            if (back.ghost[0] || back.moving < 6000) record(`back: ${JSON.stringify({ ghost: back.ghost, moving: back.moving })}`);
            if (!/Into the shadows/.test(said[2]) || !/Out of the shadows/.test(said[3])) record(`G said ${JSON.stringify(said)}`);
            if (await evaluate("JSON.stringify(Object.keys(localStorage).filter(k => k.startsWith('wp:wayfarer') && k !== 'wp:wayfarer' && k !== 'wp:wayfarer:gpu'))") !== '[]') record('it stored something of its own');
            return true;
        }],
        ['a grand city: built whole about the gate and the square, the camera in clear air at every bearing, its lights carried a long way down the road at night', async () => {
            if (!await stageWith('wayfarer', { configVersion: 2, time: 'day', weather: 'clear', camera: 'orbit', orbitElevation: 14, orbitDistance: 30, rests: false, towns: 1.6 }, '&seed=7')) return record('not ready');
            const state = () => evaluate('(m => ({ ...JSON.parse(JSON.stringify(m.debugState())), dz: m.world.at(m.journey.z).dz, beacons: m.active.far.reduce((n, sq) => n + sq.beacons.length, 0), side: m.world.at(m.journey.z).near.side }))(WP.stage.manager)');
            const apply = more => evaluate(`(m => m.applySettings({ ...m.config, ...${JSON.stringify(more)} }))(WP.stage.manager)`);
            const go = dz => evaluate(`(m => { let l = m.world.leg(Math.floor(m.journey.z / 360)); while (!l.grand) l = m.world.leg(l.i + 1); m.journey.z = l.zc + ${dz}; m.journey.mode = 'walk'; m.party.forEach(p => { p.x = null; }); m.traffic.length = 0; m.stream(true); m.snap = true; })(WP.stage.manager)`);
            await go(-142 - 34);
            await sleep(2500);
            const gate = await state();
            if (!gate.grand || gate.place !== 'city' || gate.near < 25 || gate.far < 25 || Math.abs(gate.y - gate.ground) > 0.01) record(`before the gate: ${JSON.stringify({ grand: gate.grand, place: gate.place, near: gate.near, queue: gate.queue })}`);
            if (gate.drawn.triangles < 30000 || gate.drawn.triangles > 600000) record(`drawn before the gate: ${JSON.stringify(gate.drawn)}`);
            await shoot('wayfarer-grand-gate');
            await go(4);
            for (const az of [0, 90, 180, -90, 35]) {
                await apply({ orbitAzimuth: az });
                await sleep(1500);
                const t = await state();
                if (!t.grand || !t.orbit.open || !(t.clear > 0.4)) record(`in the market square at ${az}°: ${JSON.stringify({ open: t.orbit.open, clear: t.clear, reach: t.orbit.reach })}`);
                if (t.actors < 8) record(`only ${t.actors} people in the square`);
                if (az === 35) await shoot('wayfarer-grand-square');
            }
            // On the drawbridge: feet on its deck, over the water.
            await go(-142 - 11);
            await sleep(1200);
            const bridge = await evaluate('(m => ({ y: m.standing.y, water: m.world.water(m.standing.x, m.standing.z), ground: m.world.ground(m.standing.x, m.standing.z) }))(WP.stage.manager)');
            if (!(bridge.y > bridge.water + 2) || !(bridge.ground < bridge.water - 0.8)) record(`on the drawbridge: ${JSON.stringify(bridge)}`);
            // From down the road after dark: the far squares keep its lights.
            await apply({ time: 'night', camera: 'follow' });
            await go(-142 - 420);
            if (!await waitFor(() => evaluate('WP.stage.manager.light.lit > 0.9'), 30000)) record('night never fell');
            await sleep(2000);
            const dark = await state();
            if (dark.beacons < 4 || dark.glows < 6) record(`from down the road at night: ${dark.beacons} lights kept, ${dark.glows} glows drawn`);
            await shoot('wayfarer-grand-night');
            return true;
        }],
        ['the country: only the deep forest when it alone is ticked, leaves falling in its autumn; another choice changes the land where she stands and the walk goes on; the air never steps', async () => {
            if (!await stageWith('wayfarer', { configVersion: 2, time: 'day', weather: 'clear', season: 'autumn', biomePick: 'choose', biomeChoice: ['deepwood'], rests: false }, '&seed=7')) return record('not ready');
            const state = () => evaluate('(m => ({ ...JSON.parse(JSON.stringify(m.debugState())), legs: [0, 1, 2, 3, 4, 5].map(k => m.world.leg(Math.floor(m.journey.z / 360) + k).biome), air: m.world.air(m.journey.z) }))(WP.stage.manager)');
            await sleep(2500);
            const a = await state();
            if (a.countries.join() !== 'deepwood' || a.legs.some(b => b !== 'deepwood') || a.biome !== 'deepwood') record(`the deep forest alone: ${JSON.stringify({ countries: a.countries, legs: a.legs })}`);
            if (!(a.fall > 0.05) || !(a.leafy > 1.5) || !(a.tint[0] > a.tint[2] * 2) || a.wet > 0.05) record(`autumn in the deep forest: ${JSON.stringify({ fall: a.fall, leafy: a.leafy, tint: a.tint })}`);
            if (a.drawn.triangles < 30000) record(`drawn: ${JSON.stringify(a.drawn)}`);
            await shoot('wayfarer-deep-forest-autumn');
            // Its boughs meet over the road; a camera above sees the traveller through them, and the one behind needs no such thing.
            const roof = await evaluate("(m => { const w = m.world, z = m.journey.z, cz = Math.floor(z / 64), cx = Math.floor(w.roadX(z) / 64); let n = 0; for (const dz of [-1, 0, 1]) for (const dx of [-1, 0, 1]) n += w.scatter(cx + dx, cz + dz).filter(it => it.k === 'bough').length; const follow = m.scene.cut[3]; m.config.camera = 'orbit'; m.orbit = WayLogic.orbitStart(0.3, 1.4, 24); return new Promise(done => setTimeout(() => { const s = m.debugState(); done({ n, follow, orbit: m.scene.cut[3], above: m.view.y - m.standing.y, drawn: s.drawn.triangles }); m.config.camera = 'follow'; }, 1200)); })(WP.stage.manager)");
            if (!(roof.n >= 20) || roof.follow !== 0 || roof.orbit !== 5 || !(roof.above > 2.5) || roof.drawn < 30000) record(`the roof over the road: ${JSON.stringify(roof)}`);
            await sleep(600);
            // Summer: nothing falls but what the wind takes.
            await evaluate("(m => m.applySettings({ ...m.config, season: 'summer' }))(WP.stage.manager)");
            await sleep(1500);
            const green = await state();
            if (green.fall > 0.01) record(`leaves fall in summer: ${green.fall}`);
            // Another country, live: the same place on the road, the walk unbroken.
            await evaluate("(m => m.applySettings({ ...m.config, biomePick: 'open' }))(WP.stage.manager)");
            await sleep(1500);
            const b = await state();
            if (b.countries.join() !== 'meadow,farm,moor' || b.legs.some(x => !b.countries.includes(x)) || !(b.distance >= a.distance) || Math.abs(b.z - a.z) > 40 || b.near < 25 || Math.abs(b.y - b.ground) > 0.01) record(`open country: ${JSON.stringify({ countries: b.countries, legs: b.legs, z: [a.z, b.z], near: b.near })}`);
            // None ticked is the whole world.
            await evaluate("(m => m.applySettings({ ...m.config, biomePick: 'choose', biomeChoice: [] }))(WP.stage.manager)");
            const all = await state();
            if (all.countries.length !== 9) record(`none ticked: ${all.countries}`);
            // Across a border between two countries the air's weights change by little from one frame's worth of road to the next.
            const steps = await evaluate("(m => { const w = m.world; let z = m.journey.z; while (w.at(z).a.biome === w.at(z).b.biome || w.at(z).g < 0.2) z += 10; let worst = 0, before = w.air(z); for (let k = 0; k < 400; k++) { z += 0.5; const now = w.air(z); for (const key of ['mist', 'leafy', 'grove', 'cover']) worst = Math.max(worst, Math.abs(now[key] - before[key])); before = now; } return worst; })(WP.stage.manager)");
            if (!(steps < 0.02)) record(`the air steps by ${steps} in half a metre at a border`);
            return true;
        }],
        ['in the player, dragging the orbit (turning or fixed) and pressing its keys change the camera and nothing else: the same world, place, company and hour, and the stage is not rebuilt', async () => {
            for (const orbitMode of ['turning', 'fixed']) {
                await fresh(`${WEB}/index.html?w=wayfarer&tier=low`, { 'wp:wayfarer': { configVersion: 2, camera: 'orbit', orbitMode, rests: false } });
                if (!await waitFor(() => inStage('WP.stage?.ready'), 20000)) return record('never ready');
                await sleep(500);
                // (A mark on the stage's own window: a stage that was rebuilt has lost it.)
                const state = () => waitFor(() => inStage("(m => { if (!m || !m.journey || !WP.stage.ready) return null; window.wayMark = window.wayMark || 1 + Math.random(); const j = m.journey, w = m.world, cz = Math.floor(j.z / 64); return { mark: window.wayMark, seed: w.seed, z: j.z, distance: j.distance, biome: w.leg(Math.floor(j.z / 360)).biome, countries: w.biomes.join(), squares: [...m.near.keys()].sort().slice(0, 6).join(';'), row: [0, 1, 2].map(k => Math.floor(w.roadX((cz + k) * 64) / 64)).join(), party: m.party.map(p => p.kind.id).join(), day: m.day, weather: m.config.weather, az: m.orbit.az, saved: localStorage.getItem('wp:wayfarer') }; })(WP.stage?.manager)"), 20000);
                const a = await state();
                if (!a || !a.seed) return record(`no state: ${JSON.stringify(a)}`);
                let before = a, turned = 0, saves = 0;
                const same = (now, what) => {
                    if (now.mark !== a.mark) return record(`${orbitMode}, ${what}: the stage was rebuilt`);
                    if (now.seed !== a.seed || now.countries !== a.countries || now.party !== a.party || now.weather !== a.weather) record(`${orbitMode}, ${what}: ${JSON.stringify({ seed: [a.seed, now.seed], party: [a.party, now.party] })}`);
                    if (!(now.z >= before.z) || now.z - before.z > 30 || !(now.distance >= before.distance) || Math.abs(now.day - before.day) > 0.01) record(`${orbitMode}, ${what}: the walk went from ${before.z.toFixed(1)} to ${now.z.toFixed(1)}, the day from ${before.day} to ${now.day}`);
                };
                for (let k = 0; k < 5; k++) {
                    const y = 300 + 30 * k, from = k % 2 ? 300 : 900, by = (k % 2 ? 1 : -1) * (130 + 70 * k);
                    await drag([[from, y], [from + by * 0.25, y + 5], [from + by * 0.5, y + 10], [from + by * 0.75, y + 15], [from + by, y + 20]], 40);
                    // Long enough for the orbit to be saved (0.6 s after the hand is off it) and for a rebuild, were one to follow (0.4 s more).
                    await sleep(2200);
                    const now = await state();
                    if (!now || !now.seed) return record(`${orbitMode}, drag ${k + 1}: no state (${JSON.stringify(now)})`);
                    same(now, `drag ${k + 1}`);
                    if (Math.abs(now.az - before.az) > 0.2) turned++;
                    if (now.saved !== before.saved) saves++;
                    before = now;
                }
                if (turned < 4 || saves < 3) record(`${orbitMode}: ${turned} of 5 drags turned the camera, ${saves} were saved`);
                // The keys that save a setting from the stage: the hour and the weather change, and nothing else.
                await press('t');
                await sleep(1500);
                const keyed = await state();
                if (!keyed || keyed.mark !== a.mark || keyed.seed !== a.seed || keyed.party !== a.party || !(keyed.z >= before.z) || keyed.z - before.z > 30) record(`${orbitMode}, T: ${JSON.stringify(keyed && { mark: [a.mark, keyed.mark], seed: [a.seed, keyed.seed], z: [before.z, keyed.z] })}`);
                if (keyed && keyed.saved === before.saved) record(`${orbitMode}: T saved nothing`);
            }
            // Settings changed from another page still reach it: that is a rebuild, and is meant to be.
            const mark = await inStage('window.wayMark');
            await evaluate(`window.dispatchEvent(new StorageEvent('storage', { key: 'wp:wayfarer', newValue: '{"configVersion":1,"camera":"follow"}', storageArea: localStorage }))`);
            await sleep(2500);
            if (!await waitFor(() => inStage('WP.stage?.ready'), 20000)) return record('never ready after a change from elsewhere');
            if (await inStage('window.wayMark') === mark) record('a change from another page did not rebuild the stage');
            return true;
        }],
        ['in the panel the company is one choice: surprise me (and how many, 0 to 12) or chips for everybody, where whoever is ticked walks, in the order ticked, the first twelve; each change shows on the road at once and the walk goes on', async () => {
            await fresh(`${WEB}/index.html?w=wayfarer&tier=low&panel=open`, { 'wp:wayfarer': { configVersion: 2, rests: false, campfire: false } });
            if (!await waitFor(() => inStage('WP.stage?.ready'), 20000)) return record('never ready');
            if (!await waitFor(() => evaluate(`!!document.querySelector('#panel [data-key=companions] input')`), 5000)) return record('no panel');
            const walking = () => inStage("(m => { window.wayMark = window.wayMark || 1 + Math.random(); return { mark: window.wayMark, seed: m.world.seed, z: m.journey.z, ids: m.party.map(p => p.id), groups: m.party.map(p => p.kind.group), leaving: m.leavers.map(p => p.id), behind: m.party.map(p => p.x === null ? null : Math.round((m.journey.z - p.z) * 10) / 10) }; })(WP.stage.manager)");
            const select = (key, value) => evaluate(`(s => { s.selectedIndex = s.options_.findIndex(o => o[0] === ${JSON.stringify(value)}); s.dispatchEvent(new Event('change', { bubbles: true })); })(document.querySelector('#panel [data-key=${key}] select'))`);
            const range = (key, value) => evaluate(`(i => { i.value = ${value}; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); })(document.querySelector('#panel [data-key=${key}] input'))`);
            // (The chips are in five rows, one for each kind: the chip is found by what it says.)
            const chip = id => evaluate(`(() => { const label = WP.schemaOf('wayfarer').filter(c => c.key === 'companionChoice').flatMap(c => c.options).find(o => o[0] === ${JSON.stringify(id)})[1]; [...document.querySelectorAll('#panel [data-key=companionChoice] .chip')].find(c => c.textContent === label).click(); })()`);
            const shown = selector => evaluate(`(row => !!row && !row.hidden && row.offsetParent !== null)(document.querySelector('#panel ${selector}'))`);
            const status = () => evaluate(`(document.querySelector('#panel .setting-status[data-name=company]') || {}).textContent`);
            const first = await walking();
            let before = first;
            const after = async (what, check) => {
                await sleep(700);
                const now = await walking();
                if (!now || now.mark !== first.mark || now.seed !== first.seed) return record(`${what}: the stage or the world was rebuilt`), now;
                if (!(now.z >= before.z) || now.z - before.z > 30) record(`${what}: the walk went from ${before.z.toFixed(1)} to ${now.z.toFixed(1)}`);
                const wrong = check(now);
                if (wrong) record(`${what}: ${wrong} (${now.ids.join()})`);
                before = now;
                return now;
            };
            const controls = await evaluate(`[...document.querySelectorAll('#panel [data-key^=companion]')].map(row => row.dataset.key + (row.hidden ? ' hidden' : '')).join()`);
            if (controls !== 'companionPick,companions,companionChoice hidden,companionChoice hidden,companionChoice hidden,companionChoice hidden,companionChoice hidden') record(`the company's controls: ${controls}`);
            if (first.ids.length !== 3 || first.groups[0] !== 'cats') record(`it sets off with ${first.ids.join()}`);
            // Surprise me, and how many: those already walking stay, the rest come from behind or turn back.
            await range('companions', 6);
            const six = await after('six', n => n.ids.length !== 6 && 'not six');
            if (six && (six.ids.slice(0, 3).join() !== first.ids.join() || !(six.behind[5] > 2.5))) record(`six: the first three stay and the rest come from behind: ${six.ids.join()} at ${six.behind.join()}`);
            await range('companions', 12);
            await after('twelve', n => (n.ids.length !== 12 || new Set(n.ids).size !== 12) && 'not twelve different ones');
            await range('companions', 0);
            await after('none', n => (n.ids.length !== 0 && 'somebody still walks') || (n.leaving.length < 6 && `only ${n.leaving.length} are on their way home`));
            await range('companions', 4);
            const lucky = await after('four', n => n.ids.length !== 4 && 'not four');
            // I will choose: the three ticked from the start, whatever the count says; the count is put away and the chips come out.
            await select('companionPick', 'choose');
            await after('chosen', n => n.ids.join() !== 'moofy,hound,raven' && 'not the three ticked');
            if (await shown('[data-key=companions]') || !await shown('[data-key=companionChoice]')) record('choosing by hand should show the chips and put the count away');
            if (!/^3 walk with you/.test(await status())) record(`the panel says "${await status()}" of three`);
            for (const id of ['butters', 'fox', 'ras', 'snail']) await chip(id);
            await after('seven ticked', n => n.ids.join() !== 'moofy,hound,raven,butters,fox,ras,snail' && 'not the seven ticked, in the order ticked');
            await chip('hound');
            await after('one unticked', n => (n.ids.join() !== 'moofy,raven,butters,fox,ras,snail' && 'not the six left') || (!n.leaving.includes('hound') && 'the hound is not on its way home'));
            for (const id of ['maus', 'turkey', 'harry', 'kittytoes', 'cat', 'dog', 'hound', 'sheepdog']) await chip(id);
            await after('fourteen ticked', n => n.ids.join() !== 'moofy,raven,butters,fox,ras,snail,maus,turkey,harry,kittytoes,cat,dog' && 'not the first twelve ticked');
            if (!/^14 ticked: the first 12 walk/.test(await status())) record(`the panel says "${await status()}" of fourteen`);
            for (const id of ['moofy', 'raven', 'butters', 'fox', 'ras', 'snail', 'maus', 'turkey', 'harry', 'kittytoes', 'cat', 'dog', 'hound', 'sheepdog']) await chip(id);
            await after('none ticked', n => n.ids.length !== 0 && 'somebody still walks');
            if (!/walking alone/.test(await status())) record(`the panel says "${await status()}" of nobody`);
            await chip('snail');
            await after('a snail', n => n.ids.join() !== 'snail' && 'no snail');
            // Surprise again is the world's own company again: the same four.
            await select('companionPick', 'surprise');
            await after('surprise again', n => n.ids.join() !== lucky.ids.join() && `it was ${lucky.ids.join()}`);
            if (await shown('[data-key=companionChoice]') || !await shown('[data-key=companions]')) record('surprise should put the chips away and show the count');
            // Nobody who came is left behind, and nobody stays who was sent home.
            await sleep(9000);
            const settled = await walking();
            if (settled.behind.some(b => !(Math.abs(b) < 20))) record(`left behind: ${settled.behind.join()}`);
            if (settled.leaving.length) record(`still here: ${settled.leaving.join()}`);
            return true;
        }],
        ['wildlife: abundant by default, fewer at some, more at plenty and teeming, nobody at none (the herds too), each country its own, all of them off the road; the setting changes who is about and nothing else', async () => {
            if (!await stageWith('wayfarer', { configVersion: 2, time: 'day', weather: 'clear', rests: false, biomePick: 'choose', biomeChoice: ['forest', 'meadow'] }, '&seed=7')) return record('not ready');
            await sleep(1200);
            const fresh = await evaluate('WP.stage.manager.debugState().wild');
            if (fresh.level !== 'abundant') record(`the default is ${fresh.level}`);
            await evaluate(`(m => m.applySettings({ ...m.config, wildlife: 'some' }))(WP.stage.manager)`);
            const state = () => evaluate("(m => { const w = m.world, s = m.debugState(), ground = m.wildParties.flat().filter(a => !a.K.swarm && (a.K.where || 'land') === 'land' && a.alt < 0.3); return { seed: w.seed, z: m.journey.z, distance: m.journey.distance, party: m.party.map(p => p.id).join(), wild: s.wild, herds: s.herds, nearest: ground.length ? Math.min(...ground.map(a => Math.abs(w.lateral(a.x, a.z)))) : null, moving: m.moving.n, triangles: s.drawn.triangles }; })(WP.stage.manager)");
            const set = level => evaluate(`(m => m.applySettings({ ...m.config, wildlife: '${level}' }))(WP.stage.manager)`);
            await sleep(1500);
            const some = await state();
            if (some.wild.level !== 'some' || !(some.wild.animals >= 8) || !(some.wild.parties >= 5)) record(`some: ${JSON.stringify(some.wild)}`);
            if (some.nearest !== null && some.nearest < 5) record(`an animal ${some.nearest.toFixed(1)} m from the middle of the road`);
            await set('plenty');
            await sleep(1200);
            const plenty = await state();
            if (!(plenty.wild.parties > some.wild.parties * 1.3) || !(plenty.wild.animals > some.wild.animals)) record(`plenty: ${plenty.wild.parties} parties and ${plenty.wild.animals} animals, against ${some.wild.parties} and ${some.wild.animals} at some`);
            if (plenty.nearest !== null && plenty.nearest < 5) record(`plenty: an animal ${plenty.nearest.toFixed(1)} m from the middle of the road`);
            await set('teeming');
            await sleep(1200);
            const teeming = await state();
            if (!(teeming.wild.parties > plenty.wild.parties * 1.5) || !(fresh.parties > plenty.wild.parties)) record(`teeming: ${teeming.wild.parties} parties, abundant ${fresh.parties}, plenty ${plenty.wild.parties}`);
            if (teeming.nearest !== null && teeming.nearest < 5) record(`teeming: an animal ${teeming.nearest.toFixed(1)} m from the middle of the road`);
            await set('plenty');
            await sleep(600);
            await shoot('wayfarer-wildlife');
            await set('few');
            await sleep(600);
            const few = await state();
            if (!(few.wild.parties < some.wild.parties) || !(few.wild.parties > 0)) record(`few: ${few.wild.parties} parties, against ${some.wild.parties} at some`);
            await set('none');
            await sleep(1200);
            const none = await state();
            if (none.wild.animals !== 0 || none.wild.parties !== 0 || none.herds !== 0 || none.wild.drawn !== 0) record(`none: ${JSON.stringify({ wild: none.wild, herds: none.herds })}`);
            if (!(none.moving < plenty.moving)) record(`none draws ${none.moving} vertices of what moves, plenty ${plenty.moving}`);
            // The walk went on through all of it: the same world, the same company, further down the same road.
            for (const [name, now, before] of [['plenty', plenty, some], ['few', few, plenty], ['none', none, few]]) if (now.seed !== some.seed || now.party !== some.party || !(now.z >= before.z) || now.z - before.z > 30 || !(now.distance >= before.distance)) record(`${name}: the walk was disturbed (${JSON.stringify({ seed: [some.seed, now.seed], z: [before.z, now.z] })})`);
            await set('some');
            await sleep(800);
            const back = await state();
            if (back.wild.parties !== some.wild.parties && Math.abs(back.z - some.z) < 1) record(`back at some: ${back.wild.parties} parties, ${some.wild.parties} before`);
            // Each country has its own, and enough kinds of them.
            const lands = await evaluate("(() => { const L = WayLogic, out = {}; for (const biome of L.BIOMES) { const w = L.world(7, { biomes: [biome] }), kinds = new Set(); let strangers = 0; for (let cz = 1700; cz < 1760; cz++) for (const g of w.wildlife(cz)) { kinds.add(g.kind); if (!L.WILDLIFE[biome].includes(g.kind) && !L.WILD_SHOW[biome].includes(g.kind) && !L.WILD_SMALL[biome].includes(g.kind) && !g.town) strangers++; } out[biome] = [kinds.size, strangers]; } return out; })()");
            for (const [biome, [kinds, strangers]] of Object.entries(lands)) if (kinds < 4 || strangers) record(`${biome}: ${kinds} kinds, ${strangers} that do not belong`);
            return true;
        }],
        ['without WebGL it walks on, painted flat: as far each second on Low as on High', async () => {
            const noGl = "(() => { const real = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (kind, ...rest) { return /^webgl/.test(kind) ? null : real.call(this, kind, ...rest); }; })()";
            const { identifier } = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: noGl });
            try {
                for (const tier of ['low', 'high']) {
                    if (!await stageWith('wayfarer', { configVersion: 2, rests: false, campfire: false, time: 'day', towns: 0, life: 0 }, `&seed=7&tier=${tier}`)) return record(`${tier}: not ready without WebGL`);
                    await sleep(500);
                    const at = () => evaluate('(m => ({ flat: m.flat, d: m.journey.distance, t: performance.now(), n: WP.host.frames.count, y: m.standing.y, ground: m.world.surface(m.standing.x, m.standing.z) }))(WP.stage.manager)');
                    const a = await at();
                    await sleep(2500);
                    const b = await at();
                    const speed = (b.d - a.d) / ((b.t - a.t) / 1000), fps = (b.n - a.n) / ((b.t - a.t) / 1000);
                    if (!b.flat) record(`${tier}: still on WebGL`);
                    if (Math.abs(speed / 1.75 - 1) > 0.08) record(`${tier}: ${speed.toFixed(2)} m/s at ${fps.toFixed(0)} fps; expected 1.75`);
                    if (Math.abs(b.y - b.ground) > 0.01) record(`${tier}: the traveller is ${b.y - b.ground} m off the ground`);
                    if (await evaluate(DRAWN) < 20) record(`${tier}: barely drawn without WebGL`);
                }
                await shoot('wayfarer-flat');
            } finally {
                await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
            }
            return true;
        }],
        ['a phone held upright: a wide enough view, with the traveller in it above the gesture bar', async () => {
            const viewport = { width: 412, height: 915, deviceScaleFactor: 2.625 };
            try {
                if (!await bootStage('w=wayfarer&host=android&seed=7', viewport)) return record('not ready on a phone');
                await sleep(1500);
                const g = await evaluate('(m => ({ ...JSON.parse(JSON.stringify(m.debugState())), inset: WP.host.insets.bottom }))(WP.stage.manager)');
                if (g.inset !== 48) record(`the inset is ${g.inset}`);
                if (!g.feet || !g.head || g.feet[0] < 40 || g.feet[0] > 372 || g.feet[1] > 915 - 48 - 20 || g.head[1] < 200) record(`the traveller on the screen: head ${g.head}, feet ${g.feet}`);
                if (g.tanY < Math.tan(40 * Math.PI / 180)) record(`a narrow view: tan ${g.tanY}`);
                await shoot('wayfarer-phone');
            } finally {
                await cdp.send('Emulation.clearDeviceMetricsOverride');
            }
            return true;
        }],
    ],
    'christmas-village': [
        ['alive on frame one: snow in the air, the town lit, the cast out; a tap makes a skater jump, wakes a cat, darkens a house', async () => {
            if (!await stageWith('christmas-village', null, '&seed=7&date=2026-12-20T19:30')) return record('not ready');
            const first = await evaluate(`(m => ({ frames: WP.host.frames.count, flakes: m.flakes.length, onScreen: m.flakes.filter(f => f.y > m.H * 0.5).length, skaters: m.skaters.length, cats: m.cats.length,
                walkers: m.walkers.length, puffs: m.puffs.length, sledders: m.sledders.length, deer: m.deer.length, train: !!m.train, grand: !!m.scene.grand, houses: m.scene.houses.length,
                lit: m.scene.windows.filter(w => m.isLit(w)).length, windows: m.scene.windows.length, bulbs: +(m.bulbA + m.bulbB).toFixed(2), tracks: (g => { const d = g.getImageData(0, 0, m.ice.width, m.ice.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; })(m.ice.getContext('2d', { willReadFrequently: true })),
                farm: m.scene.farmRow.trees.length, church: !!m.scene.church, cabin: !!m.scene.cabin, store: m.scene.houses.some(h => h.style === 'store') }))(WP.stage.manager)`);
            if (first.frames > 10) record(`the first frame came at ${first.frames}`);
            if (first.flakes < 200 || first.onScreen < 60 || first.puffs < 10 || first.walkers < 1 || first.tracks < 500) record(`not alive on frame one: ${JSON.stringify(first)}`);
            if (first.skaters !== 8 || first.cats !== 6 || first.sledders !== 3 || first.deer !== 3 || !first.train || !first.grand || first.houses < 5 || first.farm < 4 || !first.church || !first.cabin || !first.store) record(`the cast is missing: ${JSON.stringify(first)}`);
            if (first.lit < first.windows * 0.4 || first.bulbs < 1) record(`a dark town at half past seven: ${JSON.stringify(first)}`);
            const tap = async (x, y) => { await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y); await sleep(120); };
            // A skater: hold the frame's clock still for a moment by asking for the place and tapping at once.
            let jumped = false;
            for (let i = 0; i < 6 && !jumped; i++) {
                const at = await evaluate(`(m => { const s = m.skaters.find(s => s.kind === 'lap' && s.state === 'skate'); s.smoke = true; return { x: s.x, y: s.y - 9 * m.L.s }; })(WP.stage.manager)`);
                await tap(at.x, at.y);
                jumped = await evaluate(`WP.stage.manager.skaters.some(s => s.state === 'jump' || s.hop > 0 || (s.kind === 'beginner' && s.state === 'down'))`);
            }
            if (!jumped) record('a tap moved no skater');
            const cat = await evaluate(`(m => { const c = m.cats.find(c => c.state === 'sleep') || m.cats[0]; c.state = 'sleep'; c.smoke = true; return { x: c.x, y: c.y - 4 * c.k() }; })(WP.stage.manager)`);
            await tap(cat.x, cat.y);
            const woke = await evaluate(`(m => ({ state: m.cats.find(c => c.smoke).state, heart: m.notes.some(n => n.ch === '♥') }))(WP.stage.manager)`);
            if (woke.state !== 'sit' || !woke.heart) record(`the cat slept through a tap: ${JSON.stringify(woke)}`);
            // A lit house, tapped where no cat, tree or skater is: its windows go dark, and the glow is repainted.
            const house = await evaluate(`(m => { const h = m.scene.houses.find(h => h.row === 'front' && h.style !== 'store' && m.scene.windows.some(w => w.owner === h && m.isLit(w))); h.smoke = true; return { x: h.x - h.w * 0.2, y: h.y - 8 * h.k, key: m.glowKey }; })(WP.stage.manager)`);
            await tap(house.x, house.y);
            await sleep(300);
            const dark = await evaluate(`(m => { const h = m.scene.houses.find(h => h.smoke); return { forced: h.forced, lit: m.scene.windows.filter(w => w.owner === h && m.isLit(w)).length, repainted: m.glowKey !== ${JSON.stringify(house.key)} }; })(WP.stage.manager)`);
            if (dark.forced !== false || dark.lit || !dark.repainted) record(`the house stayed lit: ${JSON.stringify(dark)}`);
            console.log(`    christmas-village: ${first.flakes} flakes, ${first.lit} of ${first.windows} windows lit, ${first.houses} houses, ${first.walkers} out walking, ${first.tracks} px of skate marks on frame ${first.frames}`);
            await shoot('christmas-village-evening');
            return true;
        }],
        ['the windows keep their hours: dark by day, lit of an evening, mostly asleep at three, everybody up on Christmas Eve; advent decorates a little more each day', async () => {
            const town = async (date, settings = null) => {
                if (!await stageWith('christmas-village', settings, `&seed=7&date=${date}`)) return null;
                return evaluate(`(m => ({ lit: m.scene.windows.filter(w => !w.cabin && m.isLit(w)).length, windows: m.scene.windows.filter(w => !w.cabin).length, dark: +m.light.dark.toFixed(2), bulbs: +(m.bulbA + m.bulbB).toFixed(2),
                    decorated: m.scene.houses.filter(h => h.deco).length, houses: m.scene.houses.length, litTrees: [...m.scene.trees, ...m.scene.smallTrees].filter(t => t.lit).length, eve: m.season.eve, share: m.config.decorate === 'advent' ? m.season.advent : 1 }))(WP.stage.manager)`);
            };
            const noon = await town('2026-12-20T12:30'), evening = await town('2026-12-20T19:30'), small = await town('2026-12-20T03:00'), late = await town('2026-12-20T23:50'), eve = await town('2026-12-24T23:50');
            if (!noon || !evening || !small || !late || !eve) return record('no boot');
            if (noon.lit || noon.dark > 0.05) record(`windows lit at noon: ${JSON.stringify(noon)}`);
            if (!(noon.bulbs > 0.2 && noon.bulbs < 0.6)) record(`the strings by day should glow a little: ${noon.bulbs}`);
            if (evening.lit < evening.windows * 0.5) record(`a dark evening: ${JSON.stringify(evening)}`);
            if (!(small.lit < evening.lit * 0.45) || small.bulbs < 1.1) record(`three in the morning: ${small.lit} lit (${evening.lit} of an evening), bulbs ${small.bulbs}`);
            if (!eve.eve || !(eve.lit > late.lit * 1.25)) record(`Christmas Eve at ten to midnight has ${eve.lit} lit; the 20th has ${late.lit}`);
            const first = await town('2026-12-01T19:30', { configVersion: 1, decorate: 'advent' }), mid = await town('2026-12-12T19:30', { configVersion: 1, decorate: 'advent' }), last = await town('2026-12-24T19:30', { configVersion: 1, decorate: 'advent' });
            if (!(first.decorated < mid.decorated && mid.decorated <= last.decorated) || last.decorated !== last.houses || first.decorated > first.houses * 0.5) record(`advent: ${first.decorated}, ${mid.decorated}, ${last.decorated} of ${last.houses} houses decorated on the 1st, 12th and 24th`);
            if (!(first.litTrees < last.litTrees)) record(`advent: ${first.litTrees} lit trees on the 1st, ${last.litTrees} on the 24th`);
            if (evening.decorated !== evening.houses) record(`with everything up, ${evening.decorated} of ${evening.houses} houses are decorated`);
            console.log(`    christmas-village: lit windows ${noon.lit} at noon, ${evening.lit} at 19:30, ${late.lit} at 23:50, ${small.lit} at 03:00, ${eve.lit} on Christmas Eve at 23:50 (of ${evening.windows}); advent ${first.decorated}/${mid.decorated}/${last.decorated} houses`);
            return true;
        }],
        ['carollers light the house they sing to; a family saws a tree, drags it off, and a new one grows; the sleigh crosses the moon; lost canvases are baked again', async () => {
            if (!await stageWith('christmas-village', { configVersion: 1, sky: 'night', moonPhase: 'full', carollers: 0, farmVisits: 0, sleigh: 0, villagers: 0, dogs: 0 }, '&seed=7&date=2026-12-20T19:30')) return record('not ready');
            // Time is run forward by hand in each of these: the stage's own frames carry on underneath.
            const carol = await evaluate(`(m => { const said = m.callCarollers(), n = m.walkers.filter(w => w.offset).length; let steps = 0; while (!m.singing.length && steps++ < 3000) m.update(0.1, true);
                const h = m.scene.houses.find(h => h.sung > m.time), mine = h ? m.scene.windows.filter(w => w.owner === h) : [];
                return { said, n, steps, sung: !!h, lit: mine.filter(w => m.isLit(w)).length, of: mine.length, poses: m.walkers.filter(w => w.offset && w.pose === 'sing').length }; })(WP.stage.manager)`);
            if (!carol.said || carol.n < 4 || !carol.sung || carol.lit !== carol.of || carol.of < 4 || carol.poses < 3) record(`the carollers: ${JSON.stringify(carol)}`);
            const farm = await evaluate(`(m => { const said = m.callFamily(), tree = m.scene.farmRow.trees.find(t => t.taken), n = m.party ? m.party.length : 0; let sawn = false, dragged = false, steps = 0, stump = 1;
                while (m.party && steps++ < 6000) { m.update(0.1, true); if (tree.shake > 0) sawn = true; if (m.party && m.party[0].drag === tree) dragged = true; stump = Math.min(stump, tree.grown); }
                for (let i = 0; i < 6000; i++) m.update(0.1, true);
                return { said, n, sawn, dragged, steps, stump: +stump.toFixed(2), regrown: +tree.grown.toFixed(2), gone: !m.walkers.length }; })(WP.stage.manager)`);
            if (!farm.said || farm.n !== 2 || !farm.sawn || !farm.dragged || farm.stump > 0.02 || !(farm.regrown > 0.9) || !farm.gone) record(`the tree farm: ${JSON.stringify(farm)}`);
            const sleigh = await evaluate(`(m => { m.updateSky(); const said = m.callSleigh(), s = m.sleigh, moon = m.moonAt(), mid = s.at(0.5); let steps = 0; while (m.sleigh && steps++ < 400) m.update(0.1, true);
                return { said, up: +m.moon.alt.toFixed(0), miss: +Math.hypot(mid.x - moon.x, mid.y - moon.y).toFixed(1), steps, again: m.callSleigh() }; })(WP.stage.manager)`);
            if (!/Sleigh bells/.test(sleigh.said) || sleigh.up < 8 || sleigh.miss > 2 || sleigh.steps < 100 || sleigh.steps > 200) record(`the sleigh: ${JSON.stringify(sleigh)}`);
            const noon = await evaluate(`(m => { const was = m.config.sky; m.config.sky = 'day'; m.pinKey = null; m.updateSky(); const said = m.callSleigh(); m.config.sky = was; m.pinKey = null; m.updateSky(); return said; })(WP.stage.manager)`);
            if (!/Not before dark/.test(noon)) record(`a sleigh at noon: ${noon}`);
            // The drill (SPEC §10.22): wipe the land, as a lost GPU process does.
            const probe = `(m => m.scene.land.getContext('2d', { willReadFrequently: true }).getImageData(Math.floor(m.scene.land.width / 2), m.scene.land.height - 1, 1, 1).data[3])(WP.stage.manager)`;
            if (await evaluate(probe) === 0) record('the land is transparent at the bottom (the loss probe would never fire)');
            await evaluate(`(m => { m.scene.land.getContext('2d').clearRect(0, 0, m.scene.land.width, m.scene.land.height); m.lastBakeCheck = m.time - 10; })(WP.stage.manager)`);
            if (!await waitFor(() => evaluate('WP.stage.manager.recoveries === 1'), 3000)) return record('a blank land was not noticed');
            if (await evaluate(probe) === 0) record('baked again, but the land is still blank');
            console.log(`    christmas-village: ${carol.n} carollers lit ${carol.lit} windows; the tree went to a stump (${farm.stump}) and grew back to ${farm.regrown}; the sleigh missed the moon's middle by ${sleigh.miss} px`);
            return true;
        }],
        ['a phone held upright: the town fits above the gesture bar, with a front street; everything switched off is still a snowy valley', async () => {
            if (!await bootStage('w=christmas-village&host=android&seed=7&date=2026-12-20T19:30', { width: 412, height: 915, deviceScaleFactor: 2 })) return record('not ready on a phone');
            const phone = await evaluate(`(m => { const L = m.L, p = L.pond; return { inset: WP.host.insets.bottom, Hu: L.Hu, H: m.H, portrait: L.portrait, pond: +(p.cy + p.ry * 1.12).toFixed(0), front: m.scene.houses.filter(h => h.row === 'front').length,
                lowest: Math.round(Math.max(...m.scene.trees.map(t => t.y), ...m.skaters.map(s => s.y), ...m.cats.map(c => c.y))), skatersOn: m.skaters.every(s => VillageLogic.pondR(p, s.x, s.y) < 1.02), grand: !!m.scene.grand, bridge: !!m.scene.bridge }; })(WP.stage.manager)`);
            if (phone.inset !== 48 || phone.Hu !== phone.H - 48 || !phone.portrait) record(`the phone's layout: ${JSON.stringify(phone)}`);
            if (phone.pond >= phone.Hu || phone.lowest > phone.Hu || !phone.skatersOn) record(`under the gesture bar: ${JSON.stringify(phone)}`);
            if (phone.front < 2 || !phone.grand || phone.bridge) record(`the phone's town: ${JSON.stringify(phone)}`);
            await shoot('christmas-village-phone');
            await cdp.send('Emulation.clearDeviceMetricsOverride');
            const off = { configVersion: 1, moon: false, stars: false, clouds: 0, aurora: 'never', sleigh: 0, snowfall: 0, village: false, smoke: false, windows: false, candles: false, lamps: false, snowman: false, lights: false, townTree: false, litTrees: 0,
                train: false, pond: false, farm: false, cabin: false, villagers: 0, carollers: 0, sledders: 0, cats: 0, dogs: 0, callouts: false, touch: false };
            if (!await stageWith('christmas-village', off, '&seed=7&date=2026-12-20T19:30')) return record('no boot with everything left out');
            await sleep(600);
            const bare = await evaluate(`(m => ({ frames: WP.host.frames.count, cast: m.skaters.length + m.walkers.length + m.cats.length + m.sledders.length + m.deer.length + m.flakes.length + m.puffs.length, houses: m.scene.houses.length,
                windows: m.scene.windows.length, land: m.scene.land.getContext('2d', { willReadFrequently: true }).getImageData(10, m.scene.land.height - 10, 1, 1).data[3] }))(WP.stage.manager)`);
            if (bare.frames < 5 || bare.cast || bare.houses || bare.windows || bare.land !== 255) record(`the bare valley: ${JSON.stringify(bare)}`);
            return true;
        }],
    ],
    'painted-village': [
        ['a picture on frame one that paints itself, broad strokes first; a lamp put out darkens its own pool of snow and nothing is painted again; a tap darkens a house', async () => {
            if (!await stageWith('painted-village', { configVersion: 1, sky: 'dusk' }, '&seed=7&date=2026-12-20T16:55')) return record('not ready');
            const first = await evaluate(`(m => { const T = m.scene, g = T.lit.getContext('2d', { willReadFrequently: true }), d = g.getImageData(T.pw >> 1, T.ph - 20, 4, 4).data;
                return { frames: WP.host.frames.count, progress: +T.progress.toFixed(2), done: T.done, lit: d[0] + d[1] + d[2], alpha: d[3], flakes: m.flakes.length, puffs: m.puffs.length, skaters: m.cast.skaters.length, walkers: m.cast.walkers.length, sledders: m.cast.sledders.length,
                    groups: T.groups.length, on: T.groups.filter(g => g.level > 0.5).length, kind: m.cam.kind, things: m.L.things.map(t => t.kind) }; })(WP.stage.manager)`);
            if (first.frames > 12 || !(first.lit > 60) || first.alpha !== 255) record(`no picture on the first frames: ${JSON.stringify({ ...first, things: 0 })}`);
            if (first.flakes < 150 || first.puffs < 10 || first.skaters < 3 || first.walkers < 2 || first.sledders < 1) record(`not alive on frame one: ${JSON.stringify({ ...first, things: 0 })}`);
            for (const kind of ['store', 'house', 'shop', 'inn', 'church', 'school', 'mill', 'bridge', 'grandTree', 'bandstand', 'townSign', 'snowman', 'bonfire', 'cocoaHut', 'treeFarm', 'barn', 'sledHill', 'cabin', 'fir', 'frostTree']) if (!first.things.includes(kind)) record(`no ${kind} in the town`);
            if (first.things.filter(kind => kind === 'house').length < 30 || first.things.filter(kind => kind === 'shop').length !== 4) record(`a town of ${first.things.filter(kind => kind === 'house').length} houses and ${first.things.filter(kind => kind === 'shop').length} shops`);
            if (first.kind !== 'wide' || first.groups < 100 || first.on < first.groups * 0.6) record(`a dark town at dusk: ${first.on} of ${first.groups} groups of lights on`);
            if (!await waitFor(() => evaluate('WP.stage.manager.scene.done'), 30000)) return record('the painting never finished');
            const painted = await evaluate(`(m => ({ strokes: m.scene.strokes, pass: m.scene.pass, ms: Math.round(m.scene.ms), bakes: m.bakes, next: !!m.next, pw: m.scene.pw, ph: m.scene.ph, patches: m.scene.groups.filter(g => g.patch).length, glows: m.scene.groups.filter(g => g.glow).length,
                bulbs: m.scene.bulbs.length, masks: m.scene.masks.filter(Boolean).length, reflects: m.scene.reflects.length, sky: m.scene.openSky.length }))(WP.stage.manager)`);
            if (painted.strokes < 120000 || painted.pass < 5 || painted.bakes !== 1 || painted.next) record(`the painting: ${JSON.stringify(painted)}`);
            if (painted.patches < 40 || painted.glows < 40 || painted.bulbs < 600 || painted.masks < 5 || painted.reflects < 3 || painted.sky < 40) record(`the light's plates: ${JSON.stringify(painted)}`);
            // The snow a step from a lamp, with the lamp lit and with it out. Its light is a plate of its own: nothing is repainted.
            const pool = `(m => { const T = m.scene, lamp = T.groups.find(g => g.kind === 'lamp' && !g.bridge), x = Math.round(m.cam.sx(lamp.x + 1.6, lamp.z - m.cam.dz(1.5)) * T.ps), y = Math.round(m.cam.sy(lamp.z - m.cam.dz(1.5)) * T.ps);
                const d = T.lit.getContext('2d', { willReadFrequently: true }).getImageData(x - 30, y - 10, 60, 20).data; let r = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; b += d[i + 2]; }
                return { r: Math.round(r / 1200), b: Math.round(b / 1200), level: +lamp.level.toFixed(2), steps: m.steps, bakes: m.bakes }; })(WP.stage.manager)`;
            // Every light out, then that one lamp alone.
            await evaluate(`(m => { for (const g of m.scene.groups) { g.forced = false; g.lit = false; } })(WP.stage.manager)`);
            await sleep(2600);
            const out = await evaluate(pool);
            await evaluate(`(m => { const lamp = m.scene.groups.find(g => g.kind === 'lamp' && !g.bridge); lamp.forced = true; lamp.lit = true; })(WP.stage.manager)`);
            await sleep(2600);
            const lit = await evaluate(pool);
            if (lit.level !== 1 || out.level !== 0 || !(lit.r > out.r * 1.15) || !(lit.r - out.r > (lit.b - out.b) * 1.3) || lit.r > 252 || lit.bakes !== 1 || lit.steps <= out.steps) record(`a lamp's pool: out ${JSON.stringify(out)}, lit ${JSON.stringify(lit)}`);
            await evaluate(`(m => { for (const g of m.scene.groups) { g.forced = null; if (g.kind === 'lamp') g.lit = true; } })(WP.stage.manager)`);
            await sleep(1200);
            // A lit house, tapped on its roof: every floor goes dark. (One with nothing nearer over that spot, and nobody walking past it.)
            const house = await evaluate(`(m => { const T = m.scene, cam = m.cam, at = h => [(h.x0 + h.x1) / 2, h.y0 + (h.y1 - h.y0) * 0.3], over = (h, [x, y]) => x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1;
                const busy = ([x, y]) => [...m.cast.walkers, ...m.cast.animals.filter(a => !a.far)].some(a => Math.hypot(cam.sx(a.x, a.z) - x, cam.sy(a.z) - y) < 60);
                const h = T.hits.find((h, i) => h.kind === 'house' && h.name !== 'store' && h.groups.some(g => g.level > 0.5) && !T.hits.slice(i + 1).some(o => over(o, at(h))) && !busy(at(h))); return h && { x: at(h)[0], y: at(h)[1], name: h.name }; })(WP.stage.manager)`);
            if (!house) return record('no lit house to tap');
            await mouse('mousePressed', house.x, house.y); await mouse('mouseReleased', house.x, house.y);
            await sleep(400);
            const dark = await evaluate(`(m => m.scene.hits.find(h => h.name === ${JSON.stringify(house.name)}).groups.map(g => g.want))(WP.stage.manager)`);
            if (dark.some(Boolean)) record(`the tapped house stayed lit: ${JSON.stringify(dark)}`);
            console.log(`    painted-village: ${painted.strokes} strokes in ${painted.ms} ms at ${painted.pw}×${painted.ph}, ${painted.patches} patches of light, ${painted.bulbs} bulbs; the snow by a lamp ${lit.r}/${lit.b} lit, ${out.r}/${out.b} out; frame one at ${first.frames}`);
            await shoot('painted-village-dusk');
            return true;
        }],
        ['one painting for every hour: noon, dusk and night are the same strokes under another light; the windows keep their hours', async () => {
            if (!await stageWith('painted-village', { configVersion: 1, sky: 'day' }, '&seed=7&date=2026-12-20T12:30')) return record('not ready');
            if (!await waitFor(() => evaluate('WP.stage.manager.scene.done'), 30000)) return record('the painting never finished');
            const at = mode => evaluate(`(m => { m.config = { ...m.config, sky: ${JSON.stringify(mode)}, moonPhase: 'full' }; m.pinKey = null; m.updateSky(); for (const g of m.scene.groups) { if (g.kind === 'lamp') g.lit = m.light.dark > 0.36; g.level = g.want = m.wantOf(g); }
                m.dirty = 'all'; m.stepLight(performance.now(), true);
                const c = document.createElement('canvas'); c.width = 16; c.height = 9; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(m.scene.lit, 0, 0, 16, 9); const d = g.getImageData(0, 0, 16, 9).data;
                const mean = rows => { let r = 0, gr = 0, b = 0, n = 0; for (const y of rows) for (let x = 0; x < 16; x++) { const i = (y * 16 + x) * 4; r += d[i]; gr += d[i + 1]; b += d[i + 2]; n++; } return [Math.round(r / n), Math.round(gr / n), Math.round(b / n)]; };
                return { sky: mean([0, 1]), snow: mean([7, 8]), on: m.scene.groups.filter(g => g.level > 0.5).length, bakes: m.bakes, strokes: m.scene.strokes, sun: +m.sun.alt.toFixed(1) }; })(WP.stage.manager)`);
            const day = await at('day'), dusk = await at('dusk'), night = await at('night');
            await shoot('painted-village-night');
            const lum = c => c[0] + c[1] + c[2];
            if (night.bakes !== 1 || night.strokes !== day.strokes) record(`the hour repainted the picture: ${JSON.stringify(night)}`);
            if (!(lum(day.snow) > lum(dusk.snow) && lum(dusk.snow) > lum(night.snow) * 1.2)) record(`the snow by hour: day ${day.snow}, dusk ${dusk.snow}, night ${night.snow}`);
            if (!(day.sky[2] > day.sky[0] * 1.1) || !(night.snow[2] > night.snow[0] * 1.3) || !(lum(night.sky) < lum(day.sky) * 0.45)) record(`the colour by hour: day sky ${day.sky}, night sky ${night.sky}, night snow ${night.snow}`);
            if (day.on || dusk.on < 10 || night.on < 10 || !(dusk.sun < 0 && dusk.sun > -8)) record(`lights by hour: ${day.on} at noon, ${dusk.on} at dusk (sun ${dusk.sun}°), ${night.on} at night`);
            const town = async (date, settings = null) => {
                if (!await stageWith('painted-village', settings, `&seed=7&date=${date}`)) return null;
                return evaluate(`(m => { const w = m.scene.groups.filter(g => g.kind === 'window' && !g.shop && !g.church && !g.small); return { lit: w.filter(g => g.want).length, of: w.length, lamps: m.scene.groups.filter(g => g.kind === 'lamp' && g.want).length, shop: m.scene.groups.find(g => g.shop).want, eve: m.season.eve, skaters: m.cast.skaters.length, walkers: m.cast.walkers.length, fire: m.fireOn() }; })(WP.stage.manager)`);
            };
            const noon = await town('2026-12-20T12:30'), evening = await town('2026-12-20T19:30'), small = await town('2026-12-20T03:00'), late = await town('2026-12-20T23:50'), eve = await town('2026-12-24T23:50');
            const asleep = await town('2026-12-20T03:00', { configVersion: 1, nightLife: 'sleeps' }), awake = await town('2026-12-20T03:00', { configVersion: 1, nightLife: 'always' });
            if (!noon || !evening || !small || !late || !eve || !asleep || !awake) return record('no boot');
            if (noon.lit || noon.lamps || noon.shop) record(`lights at noon: ${JSON.stringify(noon)}`);
            if (evening.lit < evening.of * 0.5 || evening.lamps < 3 || !evening.shop || evening.skaters < 3) record(`a dark evening: ${JSON.stringify(evening)}`);
            if (!(small.lit < evening.lit * 0.5) || small.shop || small.lamps < 3) record(`three in the morning: ${JSON.stringify(small)}`);
            // Who is out at three: a few night owls by default (and their fire), nobody in a town that sleeps, everybody in one that never does.
            if (small.skaters < 2 || small.skaters >= evening.skaters || !small.fire || asleep.skaters || asleep.walkers > 1 || asleep.fire || awake.skaters < evening.skaters) record(`the small hours: ${small.skaters} skaters with night owls (fire ${small.fire}), ${asleep.skaters} and ${asleep.walkers} walkers asleep, ${awake.skaters} always, ${evening.skaters} at 19:30`);
            if (!eve.eve || !(eve.lit > late.lit)) record(`Christmas Eve at ten to midnight has ${eve.lit} floors lit; the 20th has ${late.lit}`);
            console.log(`    painted-village: snow ${day.snow} by day, ${dusk.snow} at dusk, ${night.snow} at night, one bake; floors lit ${noon.lit} at noon, ${evening.lit} at 19:30, ${late.lit} at 23:50, ${small.lit} at 03:00, ${eve.lit} on Christmas Eve (of ${evening.of})`);
            return true;
        }],
        ['the lamplighter lights the lamps in turn; carollers light the house they sing to; a horse and sleigh go through the bridge; sledders climb the hill, ride down it and glide; the snowman is caught looking; a certain sleigh waits for dark', async () => {
            if (!await stageWith('painted-village', { configVersion: 1, sky: 'night', moonPhase: 'full', carollers: 0, horse: 0, sleigh: 0, villagers: 0, skaters: 0, dogs: 0 }, '&seed=7&date=2026-12-20T19:30')) return record('not ready');
            // Time is run forward by hand: the stage's own frames carry on underneath.
            const lamps = await evaluate(`(m => { const said = m.callLamplighter(), all = m.scene.groups.filter(g => g.kind === 'lamp' && !g.bridge), order = []; let steps = 0, pole = false, dark = all.every(g => !g.lit);
                while (m.cast.lighter && steps++ < 4000) { m.cast.update(0.1); if (m.cast.lighter && m.cast.lighter.pole > 0) pole = true; for (const g of all) if (g.lit && !order.includes(g)) order.push(g); }
                return { said, n: all.length, dark, steps, pole, lit: order.length, inTurn: order.every((g, i) => !i || g.x >= order[i - 1].x) }; })(WP.stage.manager)`);
            if (!/lamplighter/.test(lamps.said) || lamps.n < 3 || !lamps.dark || lamps.lit !== lamps.n || !lamps.inTurn || !lamps.pole || lamps.steps > 3900) record(`the lamplighter: ${JSON.stringify(lamps)}`);
            const carol = await evaluate(`(m => { const said = m.callCarollers(), c = m.cast.carol, n = c ? c.singers.length : 0, lantern = c ? c.singers.filter(w => w.lantern).length : 0; let steps = 0;
                while (m.cast.carol && m.cast.carol.state !== 'sing' && steps++ < 4000) m.cast.update(0.1);
                const house = m.cast.carol && m.cast.carol.house, forced = house ? Object.values(house.groups).every(g => g.forced === true && m.wantOf(g) === 1) : false, notes0 = m.cast.notes.length;
                let notes = 0; while (m.cast.carol && steps++ < 8000) { m.cast.update(0.1); notes = Math.max(notes, m.cast.notes.length); }
                return { said, n, lantern, steps, sang: !!house, forced, notes, after: house ? Object.values(house.groups).every(g => g.forced == null) : false, left: m.cast.walkers.every(w => w.kind === 'walker') }; })(WP.stage.manager)`);
            if (!carol.said || carol.n < 3 || carol.lantern !== 1 || !carol.sang || !carol.forced || carol.notes < 2 || !carol.after || !carol.left) record(`the carollers: ${JSON.stringify(carol)}`);
            const horse = await evaluate(`(m => { const said = m.callHorse(), h = m.cast.horse, road = m.L.road, x0 = h.x, bridge = m.scene.spots.bridge; let steps = 0, through = false;
                while (m.cast.horse && steps++ < 3000) { m.cast.update(0.1); if (m.cast.horse && m.cast.horse.x > bridge.x0 && m.cast.horse.x < bridge.x1) through = true; }
                return { said, steps, through, far: +Math.abs(road.x1 - road.x0).toFixed(0), from: +x0.toFixed(0), band: PaintedLogic.bandOf(road.z), behind: bridge.z < PaintedLogic.BANDS[PaintedLogic.bandOf(road.z)], mask: !!m.scene.masks[PaintedLogic.bandOf(road.z)], again: m.callHorse() != null }; })(WP.stage.manager)`);
            if (!/bells/.test(horse.said) || !horse.through || !horse.behind || !horse.mask || horse.steps < 60 || horse.steps > 2900) record(`the horse and sleigh: ${JSON.stringify(horse)}`);
            // A sledder, run forward: up on foot, down faster, a long glide over the flat, and always on the hill's own surface. The hill hides the street behind it.
            const sled = await evaluate(`(m => { const c = m.cast, S = m.scene.spots.sled, K = PaintedLogic; c.sledders = []; const s = c.addSledder(false); let up = 0, down = 0, rides = 0, was = s.state, high = 0, off = 0, fast = 0, glide = 0;
                for (let i = 0; i < 6000 && rides < 2; i++) { c.updateSledders(0.1); const R = K.knollRim(S, s.a); if (s.state === 'climb' && rides < 2) up++; else if (s.state === 'ride') { down++; fast = Math.max(fast, s.v); glide = Math.max(glide, s.s - R); }
                    high = Math.max(high, s.y); if (s.y > S.h + 0.01 || s.y < 0 || Math.abs(s.y - K.knollAt(S, m.cam.zm, s.x, s.z)) > 1e-6 || s.a < S.a0 - 0.01 || s.a > S.a1 + 0.01) off++; if (was === 'rest' && s.state === 'climb') rides++; was = s.state; }
                return { hill: !!S, rides, up, down, high: +high.toFixed(1), h: S && S.h, off, fast: +fast.toFixed(1), glide: +glide.toFixed(1), hides: c.hidden(S.x, 2.5), clear: c.hidden(0, 2.5) || c.hidden(S.x, S.z - 0.5) }; })(WP.stage.manager)`);
            if (!sled.hill || sled.rides !== 2 || !(sled.down / 2 < sled.up * 0.6) || !(sled.high > sled.h * 0.7) || sled.off || sled.fast < 4.5 || sled.glide < 9 || !sled.hides || sled.clear) record(`the sledders: ${JSON.stringify(sled)}`);
            const more = await evaluate(`(m => { m.updateSky(); m.dirty = 'all'; m.stepLight(performance.now(), true); const said = m.callSleigh(), f = m.cast.flight, moon = m.moonXY; let steps = 0; while (m.cast.flight && steps++ < 400) m.cast.update(0.1);
                m.cast.look = 0.8; m.cast.caught(); const look = m.cast.look, hold = m.cast.lookHold;
                const tree = m.scene.hits.find(h => h.kind === 'tree'); m.tapAt((tree.x0 + tree.x1) / 2, (tree.y0 + tree.y1) / 2);
                const was = m.config.sky; m.config = { ...m.config, sky: 'day' }; m.pinKey = null; m.updateSky(); const noon = m.callSleigh(); m.config = { ...m.config, sky: was }; m.pinKey = null; m.updateSky();
                return { said, moon: !!moon, y: f && moon ? +Math.abs(f.y - moon.y).toFixed(1) : -1, steps, look, hold, sparks: m.cast.sparks.filter(s => s.snow).length, noon }; })(WP.stage.manager)`);
            if (!more.said || !more.moon || more.y > 1 || more.steps < 60 || more.steps > 120 || more.look !== 0 || !(more.hold > 3) || more.sparks < 10 || !/Not before dark/.test(more.noon)) record(`the sleigh, the snowman, the tree: ${JSON.stringify(more)}`);
            console.log(`    painted-village: ${lamps.lit} lamps lit in turn in ${lamps.steps} steps; ${carol.n} carollers sang to a house; the horse crossed ${horse.far} m in ${horse.steps} steps; a sledder climbed to ${sled.high} m, reached ${sled.fast} m/s and glided ${sled.glide} m over the flat`);
            return true;
        }],
        ['a train of five keeps to its track; cats go from place to place; squirrels keep to the fence and the firs; deer and bears in their glades; somebody climbs the trail and lights the cabin; and nothing is said', async () => {
            if (!await stageWith('painted-village', { configVersion: 1, sky: 'night', moonPhase: 'full', carollers: 0, horse: 0, sleigh: 0, villagers: 0, skaters: 0, dogs: 0, sledders: 0, bears: 1 }, '&seed=7&date=2026-12-20T19:30')) return record('not ready');
            // Whatever the wallpaper says by itself would come through here.
            await evaluate(`(m => { window.__said = []; m.host.toast = text => window.__said.push(text); })(WP.stage.manager)`);
            const train = await evaluate(`(m => { const c = m.cast, S = m.scene.spots.tree, zm = m.cam.zm, a0 = c.train.a; let off = 0, gaps = 0, puffs = 0;
                for (let i = 0; i < 120; i++) { c.updateTrain(0.1); puffs = Math.max(puffs, c.steam.length); const cars = c.cars();
                    for (const car of cars) if (Math.abs(Math.hypot(car.x - S.x, (car.z - S.z) * zm) - S.r) > 1e-6) off++;
                    for (let k = 1; k < cars.length; k++) { const arc = (cars[k - 1].a - cars[k].a) * S.r, want = (cars[k - 1].car.len + cars[k].car.len) / 2 + 0.3; if (Math.abs(arc - want) > 1e-6) gaps++; } }
                const cars = c.cars(), length = (cars[0].a - cars[4].a) * S.r, round = 6.2832 * S.r, turned = c.train.a - a0;
                m.config = { ...m.config, trainSpeed: 0 }; c.steam = []; const at = c.train.a; for (let i = 0; i < 40; i++) c.updateTrain(0.1); const still = c.train.a === at && !c.steam.length; m.config = { ...m.config, trainSpeed: 1 };
                c.draw(m.ctx);
                return { kinds: cars.map(car => car.car.kind).join(), off, gaps, puffs, length: +length.toFixed(1), round: +round.toFixed(1), turned: +turned.toFixed(2), still, r: +S.r.toFixed(1) }; })(WP.stage.manager)`);
            if (train.kinds !== 'engine,tender,box,gifts,caboose' || train.off || train.gaps || train.puffs < 2 || train.puffs > 9 || !(train.length < train.round * 0.5) || !(train.turned > 3.5 && train.turned < 4.6) || !train.still) record(`the train: ${JSON.stringify(train)}`);
            const cats = await evaluate(`(m => { const c = m.cast, L = m.L, cats = c.animals.filter(a => a.kind === 'cat'), roam = cats.filter(a => a.roam), cat = roam[0], from = [cat.x, cat.z], home = cat.at; let steps = 0, walked = 0, tries = 0, far = 0;
                while (cat.state !== 'walk' && tries++ < 400) { cat.state = 'sit'; cat.t = 0; c.updateAnimals(0.01); }
                const to = cat.path[cat.path.length - 1];
                while (cat.state === 'walk' && steps++ < 6000) { const x = cat.x, z = cat.z; c.updateAnimals(0.1); walked += Math.hypot(cat.x - x, (cat.z - z) * m.cam.zm); far = Math.max(far, Math.min(...Object.values(L.nodes).map(n => Math.hypot(cat.x - n.x, (cat.z - n.z) * m.cam.zm)))); }
                const n = L.nodes[to], seat = n ? Math.hypot(cat.x - n.x, (cat.z - n.z) * m.cam.zm) : -1;
                m.config = { ...m.config, cats: 7 }; c.build(); const more = c.animals.filter(a => a.kind === 'cat').length; m.config = { ...m.config, cats: 0, cat: false }; c.build(); const none = c.animals.filter(a => a.kind === 'cat').length; m.config = { ...m.config, cats: 3, cat: true }; c.build();
                return { n: cats.length, roam: roam.length, store: cats.filter(a => !a.roam).length, coats: new Set(cats.map(a => a.coat)).size, tries, home, to, at: cat.at, state: cat.state, walked: +walked.toFixed(1), seat: +seat.toFixed(2), far: +far.toFixed(1), steps, more, none, big: cat.k }; })(WP.stage.manager)`);
            if (cats.n !== 4 || cats.roam !== 3 || cats.store !== 1 || cats.coats !== 4 || !cats.to || cats.to === cats.home || cats.at !== cats.to || cats.state !== 'sit' || cats.walked < 4 || !(cats.seat > 0.5 && cats.seat < 2) || cats.far > 12 || cats.more !== 8 || cats.none !== 0 || !(cats.big > 1.5)) record(`the cats: ${JSON.stringify(cats)}`);
            const small = await evaluate(`(m => { const c = m.cast, S = m.scene.spots, zm = m.cam.zm, sq = c.animals.filter(a => a.kind === 'squirrel'), places = [...S.fence.map(p => [p[0], p[1]]), ...S.firs.map(f => [f.x, f.z])]; let off = 0, low = 0, high = 0, moved = 0, climbed = 0;
                const start = sq.map(a => [a.x, a.z]);
                for (let i = 0; i < 3000; i++) { c.updateAnimals(0.1); for (const a of sq) { if (a.y < -1e-9) low++; high = Math.max(high, a.y); if (a.fir) climbed++; } }
                // At rest each is on a post or a fir; in between, never far from the fence and the trees it runs between.
                const span = places.reduce((b, p) => [Math.min(b[0], p[0]), Math.max(b[1], p[0]), Math.min(b[2], p[1]), Math.max(b[3], p[1])], [1e9, -1e9, 1e9, -1e9]);
                for (const a of sq) if (a.x < span[0] - 1 || a.x > span[1] + 1 || a.z < span[2] - 0.05 || a.z > span[3] + 0.05) off++;
                sq.forEach((a, i) => { if (Math.hypot(a.x - start[i][0], (a.z - start[i][1]) * zm) > 0.5 || a.fir) moved++; });
                const deer = c.animals.filter(a => a.kind === 'deer' && a.far), G = deer[0] && deer[0].G, inGlade = deer.every(a => Math.abs(a.gx) < 0.9 && Math.abs(a.px - G.x) < G.rx && Math.abs(a.py - G.y) < G.ry);
                m.tapAt(deer[0].px, deer[0].py - 8); const fled = deer.every(a => a.state === 'flee'); let steps = 0, hid = false;
                while (!deer.every(a => a.state === 'watch' || a.state === 'graze') && steps++ < 2000) { c.updateAnimals(0.1); if (deer.every(a => a.fade === 0)) hid = true; }
                return { squirrels: sq.length, posts: S.fence.length, firs: S.firs.length, off, low, high: +high.toFixed(1), moved, climbed, deer: deer.length, inGlade, fled, hid, steps, back: deer.every(a => Math.abs(a.gx - a.home) < 1e-6 && a.fade === 1) }; })(WP.stage.manager)`);
            if (small.squirrels !== 3 || small.posts < 3 || small.firs < 2 || small.off || small.low || small.high > 6 || small.moved < 2 || !small.climbed) record(`the squirrels: ${JSON.stringify(small)}`);
            if (small.deer !== 4 || !small.inGlade || !small.fled || !small.hid || !small.back || small.steps > 1900) record(`the deer in the glade: ${JSON.stringify(small)}`);
            const bears = await evaluate(`(m => { const c = m.cast, said = m.callBears(), all = c.animals.filter(a => a.kind === 'bear'), mum = all.find(a => !a.cub), cubs = all.filter(a => a.cub), from = mum.gx, again = m.callBears(); let steps = 0, stops = 0, lag = 0, shown = 0, was = mum.state, stood = 0;
                const first = mum.fade;
                while (c.animals.some(a => a.kind === 'bear') && steps++ < 4000) { c.updateAnimals(0.1); if (mum.state !== 'walk' && was === 'walk') stops++; was = mum.state; stood = Math.max(stood, mum.up); shown = Math.max(shown, mum.fade); for (const cub of cubs) lag = Math.max(lag, Math.abs(cub.gx - mum.gx)); }
                const G = mum.G;
                return { said, again, n: all.length, cubs: cubs.length, from: +from.toFixed(2), to: +mum.gx.toFixed(2), steps, stops, lag: +lag.toFixed(2), first, shown, glade: G.kind, small: cubs.every(cub => cub.k < 0.7), left: c.animals.filter(a => a.kind === 'bear').length }; })(WP.stage.manager)`);
            if (!/Bears/.test(bears.said) || !/already/.test(bears.again) || bears.cubs < 1 || bears.cubs > 2 || bears.n !== bears.cubs + 1 || !(bears.from * bears.to < 0) || Math.abs(bears.to) < 1.1 || bears.stops !== 2 || bears.lag > 0.6 || bears.first !== 0 || bears.shown !== 1 || bears.glade !== 'bears' || !bears.small || bears.left || bears.steps > 3900) record(`the bears: ${JSON.stringify(bears)}`);
            const trail = await evaluate(`(m => { const c = m.cast, S = m.scene.spots, pts = S.trail, g = S.cabin.group; g.forced = false; c.hiker = null; const h = c.sendHiker(true), twice = c.sendHiker(true); let steps = 0, off = 0, top = 1e9, big = 0, small = 1e9;
                while (c.hiker && steps++ < 2000) { c.updateHiker(0.1); if (!c.hiker) break; top = Math.min(top, h.py); big = Math.max(big, h.s); small = Math.min(small, h.s); if (Math.min(...pts.map(p => Math.hypot(p[0] - h.px, p[1] - h.py))) > 12 * m.cam.u) off++; }
                const lit = g.forced, mill = S.mill, down = c.sendHiker(false); let back = 0; g.forced = null; while (c.hiker && back++ < 2000) c.updateHiker(0.1);
                return { pts: pts.length, foot: pts[0].map(Math.round), door: pts[pts.length - 1].map(Math.round), cabin: [Math.round(S.cabin.x), Math.round(S.cabin.y)], steps, off, top: Math.round(top), lit, twice: !!twice, back, after: g.forced, grew: big > small * 1.5,
                    lamps: m.scene.groups.find(g => g.name === 'trail').glass.length, mill: mill && { r: mill.r, band: PaintedLogic.bandOf(mill.z), x: Math.round(m.cam.sx(mill.x, mill.z)) }, said: window.__said }; })(WP.stage.manager)`);
            if (trail.pts < 30 || !(trail.foot[1] > trail.door[1] + 100) || Math.abs(trail.door[0] - trail.cabin[0]) > 4 || trail.off || trail.steps < 700 || trail.steps > 900 || trail.lit !== true || trail.twice || trail.back < 700 || trail.after !== null || !trail.grew || trail.lamps < 4) record(`the trail: ${JSON.stringify(trail)}`);
            if (!trail.mill || trail.mill.band < 3 || trail.mill.x < 0 || trail.mill.x > 1400) record(`the mill wheel: ${JSON.stringify(trail.mill)}`);
            // The snowman tapped, the hour run on: still nothing said by the wallpaper itself.
            const quiet = await evaluate(`(m => { const s = m.scene.hits.find(h => h.kind === 'snowman'); m.cast.look = 0.8; m.tapAt((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2); for (let i = 0; i < 600; i++) m.cast.update(0.1); return { said: window.__said, look: m.cast.look === 0 || Math.abs(m.cast.look) < 0.8, callouts: 'callouts' in m.config }; })(WP.stage.manager)`);
            if (quiet.said.length || quiet.callouts) record(`the wallpaper spoke: ${JSON.stringify(quiet)}`);
            console.log(`    painted-village: a train ${train.length} m long on a ${train.round} m track; a cat walked ${cats.walked} m from ${cats.home} to ${cats.to}; ${small.squirrels} squirrels up to ${small.high} m; ${bears.n} bears crossed in ${bears.steps} steps; the trail climbed in ${trail.steps} steps and lit the cabin`);
            return true;
        }],
        ['a phone held upright has its own arrangement above the gesture bar; everything switched off is still a painted valley; a lost painting is painted again', async () => {
            if (!await bootStage('w=painted-village&host=android&seed=7&date=2026-12-20T19:30', { width: 412, height: 915, deviceScaleFactor: 2 })) return record('not ready on a phone');
            const phone = await evaluate(`(m => { const cam = m.cam, r = m.L.pond.rink; return { inset: WP.host.insets.bottom, Hu: cam.Hu, H: m.H, kind: cam.kind, bottom: +cam.sy(1).toFixed(1), rink: +cam.sy(r.z0).toFixed(0), things: m.L.things.map(t => t.kind),
                lowest: Math.round(Math.max(0, ...m.cast.skaters.map(s => cam.sy(s.d / cam.zm)), ...m.cast.walkers.filter(w => w.fade > 0.5).map(w => cam.sy(w.z)))), tree: +cam.sx(m.L.tree.x, m.L.tree.z).toFixed(0), pw: m.scene.pw, ph: m.scene.ph }; })(WP.stage.manager)`);
            if (phone.inset !== 48 || phone.Hu !== phone.H - 48 || phone.kind !== 'upright' || Math.abs(phone.bottom - phone.Hu) > 1) record(`the phone's camera: ${JSON.stringify({ ...phone, things: 0 })}`);
            if (phone.rink > phone.Hu || phone.lowest > phone.Hu + 2 || phone.tree < 60 || phone.tree > 352) record(`the phone's picture: ${JSON.stringify({ ...phone, things: 0 })}`);
            if (phone.things.includes('bridge') || ['store', 'shop', 'church', 'school', 'grandTree', 'cocoaHut', 'treeFarm', 'barn', 'cabin'].some(kind => !phone.things.includes(kind)) || phone.things.filter(k => k === 'house').length < 10) record(`the phone's town: ${phone.things}`);
            if (!await waitFor(() => evaluate('WP.stage.manager.scene.done'), 30000)) record('the phone\'s painting never finished');
            await shoot('painted-village-phone');
            await cdp.send('Emulation.clearDeviceMetricsOverride');
            const off = { configVersion: 1, moon: false, stars: false, clouds: 0, aurora: 'never', sleigh: 0, snowfall: 0, village: false, smoke: false, windows: false, candles: false, lamps: false, snowman: false, lights: false, townTree: false,
                train: false, pond: false, bonfire: false, cabin: false, treeFarm: false, bandstand: false, cocoa: false, sledders: 0, villagers: 0, carollers: 0, horse: 0, dogs: 0, cat: false, cats: 0, squirrels: 0, fox: false, deer: false, bears: 0, rabbits: false, cardinal: false, mice: false, touch: false };
            if (!await stageWith('painted-village', off, '&seed=7&date=2026-12-20T19:30')) return record('no boot with everything left out');
            if (!await waitFor(() => evaluate('WP.stage.manager.scene.done'), 30000)) return record('the bare valley never finished');
            const probe = `(m => { const c = document.createElement('canvas'); c.width = c.height = 1; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(m.scene.paint, m.scene.pw >> 1, m.scene.ph - 2, 1, 1, 0, 0, 1, 1); return g.getImageData(0, 0, 1, 1).data[3]; })(WP.stage.manager)`;
            const bare = await evaluate(`(m => ({ frames: WP.host.frames.count, cast: m.cast.skaters.length + m.cast.walkers.length + m.cast.sledders.length + m.cast.animals.length + m.flakes.length + m.puffs.length, groups: m.scene.groups.length, lights: m.scene.lights.length, bulbs: m.scene.bulbs.length,
                strokes: m.scene.strokes, trees: m.L.things.filter(t => t.kind === 'fir' || t.kind === 'frostTree').length }))(WP.stage.manager)`);
            if (bare.frames < 5 || bare.cast || bare.groups || bare.lights || bare.bulbs || bare.strokes < 80000 || bare.trees < 8 || await evaluate(probe) !== 255) record(`the bare valley: ${JSON.stringify(bare)}`);
            // The drill (SPEC §10.22): wipe the painting, as a lost GPU process does.
            await evaluate(`(m => { m.scene.paint.getContext('2d').clearRect(0, 0, m.scene.pw, m.scene.ph); m.lostCheck = 10; })(WP.stage.manager)`);
            if (!await waitFor(() => evaluate('WP.stage.manager.recoveries === 1'), 4000)) return record('a blank painting was not noticed');
            if (await evaluate(probe) !== 255 || !await evaluate('WP.stage.manager.bakes === 2')) record('noticed, but not painted again');
            console.log(`    painted-village: upright at ${phone.pw}×${phone.ph} above a ${phone.inset} px bar; the bare valley is ${bare.strokes} strokes and ${bare.trees} trees`);
            return true;
        }],
    ],
    torchlight: [
        ['at dusk, a picture on frame one and torches already on the mountain; every torch lights the snow it passes; the painting finishes once and is never painted again for the light', async () => {
            if (!await stageWith('torchlight', { configVersion: 1, sky: 'dusk' }, '&seed=7&date=2026-12-20T17:00')) return record('not ready');
            const first = await evaluate(`(m => { const T = m.scene, d = T.lit.getContext('2d', { willReadFrequently: true }).getImageData(T.pw >> 1, T.ph - 20, 4, 4).data, p = m.cast.proc;
                return { frames: WP.host.frames.count, lit: d[0] + d[1] + d[2], alpha: d[3], flakes: m.flakes.length, puffs: m.puffs.length, phase: p && p.phase, skiing: p ? p.sk.filter(k => k.state === 'ski').length : 0, cats: m.cast.cats.length, dog: !!m.cast.dog, groups: T.groups.length, on: T.groups.filter(g => g.level > 0.5).length, kind: m.cam.kind }; })(WP.stage.manager)`);
            if (first.frames > 12 || !(first.lit > 60) || first.alpha !== 255) record(`no picture on the first frames: ${JSON.stringify(first)}`);
            if (first.phase !== 'down' || first.skiing < 8 || first.flakes < 100 || first.puffs < 10 || first.cats < 3 || !first.dog) record(`not alive on frame one: ${JSON.stringify(first)}`);
            if (first.kind !== 'wide' || first.groups < 20 || first.on < first.groups * 0.8) record(`a dark valley at dusk: ${first.on} of ${first.groups} groups lit`);
            if (!await waitFor(() => evaluate('WP.stage.manager.scene.done'), 30000)) return record('the painting never finished');
            const painted = await evaluate(`(m => ({ strokes: m.scene.strokes, pass: m.scene.pass, bakes: m.bakes, patches: m.scene.groups.filter(g => g.patch).length, masks: m.scene.masks.filter(Boolean).length, sky: m.scene.openSky.length, half: !!m.scene.paintHalf, len: Math.round(m.scene.track.length) }))(WP.stage.manager)`);
            if (painted.strokes < 150000 || painted.pass < 5 || painted.bakes !== 1 || painted.patches < 15 || painted.masks < 4 || painted.sky < 40 || !painted.half) record(`the painting: ${JSON.stringify(painted)}`);
            // The snow about the leader's torch, on screen, with the torches' light and without it (the moving-lights effect).
            const around = `(m => { const p = m.cast.proc, k = p.sk.filter(q => q.state === 'ski').sort((a, b) => b.s - a.s)[0], at = TorchLogic.at(m.scene.track, k.s, m.cam), r = Math.max(6, 6 * at.sc);
                const c = document.createElement('canvas'); c.width = 24; c.height = 12; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(m.canvas, (at.x - r * 2) * m.dpr, (at.y - r) * m.dpr, r * 4 * m.dpr, r * 2 * m.dpr, 0, 0, 24, 12);
                const d = g.getImageData(0, 0, 24, 12).data; let R = 0, B = 0; for (let i = 0; i < d.length; i += 4) { R += d[i]; B += d[i + 2]; } return { r: Math.round(R / 288), b: Math.round(B / 288) }; })(WP.stage.manager)`;
            await evaluate(`(m => { m.cast.proc.hold = { t: 30 }; m.fx.glints = m.fxTarget.glints = 1; })(WP.stage.manager)`);
            await sleep(500);
            const lit = await evaluate(around);
            await evaluate(`(m => { m.fx.glints = m.fxTarget.glints = 0; })(WP.stage.manager)`);
            await sleep(500);
            const dark = await evaluate(around);
            await evaluate(`(m => { m.fx.glints = m.fxTarget.glints = 1; m.cast.proc.hold = null; })(WP.stage.manager)`);
            if (!(lit.r > dark.r * 1.12) || !(lit.r - dark.r > (lit.b - dark.b) * 1.2)) record(`a torch's pool: lit ${JSON.stringify(lit)}, without ${JSON.stringify(dark)}`);
            if (await evaluate('WP.stage.manager.bakes') !== 1) record('painted again for the light');
            console.log(`    torchlight: ${painted.strokes} strokes, a run of ${painted.len} m, ${painted.patches} patches of light; the snow by a torch ${lit.r}/${lit.b} lit, ${dark.r}/${dark.b} without`);
            await shoot('torchlight-dusk');
            return true;
        }],
        ['a whole descent: lit at the hut, down in order, the torches planted in a heart, a cat to the warm, everyone in at the inn; a tap on the hut sends the next; taps on a cat and the dog; nothing saved', async () => {
            if (!await stageWith('torchlight', { configVersion: 1, sky: 'night', descents: 'tap', tumbles: 1, finale: 'heart', torches: 16 }, '&seed=7&date=2026-12-20T20:00')) return record('not ready');
            await sleep(400);
            if (await evaluate('!!WP.stage.manager.cast.proc')) record('a descent with descents set to only when asked');
            // A tap on the hut sends them.
            const hut = await evaluate(`(m => { const h = m.scene.hits.find(h => h.kind === 'hut'); return h && { x: (h.x0 + h.x1) / 2, y: (h.y0 + h.y1) / 2 }; })(WP.stage.manager)`);
            if (!hut) return record('no hut');
            await mouse('mousePressed', hut.x, hut.y); await mouse('mouseReleased', hut.x, hut.y);
            await sleep(300);
            const sent = await evaluate(`(m => m.cast.proc && { n: m.cast.proc.n, phase: m.cast.proc.phase })(WP.stage.manager)`);
            if (!sent || sent.phase !== 'gather') return record(`a tap on the hut sent nobody: ${JSON.stringify(sent)}`);
            // Fast forward, a tenth of a second at a time, watching.
            const run = await evaluate(`(m => { const c = m.cast, p = c.proc, seen = { phases: [], falls: 0, guideCat: false, maxPlanted: 0, warmCat: false };
                for (let i = 0; i < 12000 && !p.done; i++) {
                    c.update(0.1);
                    if (seen.phases[seen.phases.length - 1] !== p.phase) seen.phases.push(p.phase);
                    seen.falls = Math.max(seen.falls, p.sk.filter(k => k.fall > 0).length);
                    seen.maxPlanted = Math.max(seen.maxPlanted, c.planted.length);
                    if (c.cats.some(k => k.kind === 'roam' && k.at === 'finish')) seen.warmCat = true;
                }
                return { ...seen, done: p.done, planted: c.planted.length, inPlace: p.sk.every(k => k.planted && Math.abs(k.planted.x - c.spots[k.i].x) < 1e-9), n: p.n };
            })(WP.stage.manager)`);
            if (!run.done || run.phases.join() !== 'gather,down,planted,leave' || run.maxPlanted !== run.n || !run.inPlace) record(`the descent: ${JSON.stringify(run)}`);
            if (run.falls < 1) record('with tumbles at 1, nobody sat down in the snow');
            // A cat by the planted torches (they are warm), a heart for a tap on one, the dog on his feet for a tap.
            const pet = await evaluate(`(m => { const c = m.cast.cats.find(k => k.kind === 'roam'), d = m.cast.dog; return { cat: c && { x: m.cam.sx(c.x, c.z), y: m.cam.sy(c.z) - 0.4 * m.cam.sc(c.z) * c.k }, dog: d && { x: m.cam.sx(d.x, d.z), y: m.cam.sy(d.z) - 0.5 * m.cam.sc(d.z) * 1.5 } }; })(WP.stage.manager)`);
            if (pet.cat) { await mouse('mousePressed', pet.cat.x, pet.cat.y); await mouse('mouseReleased', pet.cat.x, pet.cat.y); }
            if (pet.dog) { await mouse('mousePressed', pet.dog.x, pet.dog.y); await mouse('mouseReleased', pet.dog.x, pet.dog.y); }
            await sleep(200);
            const after = await evaluate(`(m => ({ hearts: m.cast.hearts.length, wag: m.cast.dog.wag, saved: localStorage.getItem('wp:torchlight') }))(WP.stage.manager)`);
            if (!(after.hearts > 0) || !(after.wag > 0)) record(`a tap on a cat or the dog: ${JSON.stringify(after)}`);
            if (!/"descents":"tap"/.test(after.saved || '') || /innName|torches":28/.test(after.saved)) record(`storage changed: ${after.saved}`);
            return true;
        }],
        ['New Year’s Eve: the grand descent spells the year on the mountain at midnight and the fireworks go up; by day there are skiers, and no torches', async () => {
            if (!await stageWith('torchlight', { configVersion: 1, sky: 'live' }, '&seed=7&date=2026-12-31T23:59:56')) return record('not ready');
            await sleep(600);
            const spell = await evaluate(`(m => { const p = m.cast.proc; return p && { grand: p.grand, spelling: p.spelling, n: p.n, figure: m.cast.figure ? m.cast.figure.length : 0, onFigure: p.sk.filter(k => k.fig > 0.95).length, year: m.cal.year }; })(WP.stage.manager)`);
            if (!spell || !spell.grand || !spell.spelling || spell.n < 40 || spell.figure !== spell.n || spell.onFigure < spell.n * 0.6 || spell.year !== 2027) record(`the year on the mountain: ${JSON.stringify(spell)}`);
            if (!await waitFor(() => evaluate('WP.stage.manager.cast.sparks.length > 30'), 15000)) record('no fireworks at midnight');
            await shoot('torchlight-new-year');
            if (!await stageWith('torchlight', { configVersion: 1, sky: 'day' }, '&seed=7&date=2026-12-20T12:00')) return record('not ready by day');
            await sleep(800);
            const day = await evaluate(`(m => ({ proc: !!m.cast.proc, skiers: m.cast.day.length, on: m.scene.groups.filter(g => g.level > 0.5).length, dark: m.light.dark }))(WP.stage.manager)`);
            if (day.proc || day.skiers < 2 || day.on > 0 || day.dark > 0.05) record(`by day: ${JSON.stringify(day)}`);
            return true;
        }],
        ['a phone held upright: the mountain, the inn and the finish above the gesture bar; everything left out still paints a valley', async () => {
            await cdp.send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2, mobile: true });
            try {
                if (!await stageWith('torchlight', { configVersion: 1, sky: 'dusk' }, '&seed=7&date=2026-12-20T17:00&host=android')) return record('not ready on a phone');
                const phone = await evaluate(`(m => ({ kind: m.cam.kind, inset: m.bottom, finish: m.cam.sy(m.L.finish.z), H: m.H, inn: !!m.L.inn, skiing: m.cast.proc ? m.cast.proc.sk.filter(k => k.state === 'ski').length : 0 }))(WP.stage.manager)`);
                if (phone.kind !== 'upright' || !(phone.inset > 0) || phone.finish > phone.H - phone.inset || !phone.inn || phone.skiing < 5) record(`upright: ${JSON.stringify(phone)}`);
                await shoot('torchlight-phone');
            } finally { await cdp.send('Emulation.clearDeviceMetricsOverride'); }
            const off = { configVersion: 1, sky: 'night', inn: false, chapel: false, chalets: 0, lamps: false, tree: 'never', candles: 'never', snowcat: false, lift: false, dog: false, cats: 0, windowCat: false, backpackCat: false, daySkiers: false, descents: 'tap', snowfall: 0, smoke: false, clouds: 0 };
            if (!await stageWith('torchlight', off, '&seed=7&date=2026-12-20T20:00')) return record('no boot with everything left out');
            if (!await waitFor(() => evaluate('WP.stage.manager.scene.done'), 30000)) return record('the bare valley never finished painting');
            const bare = await evaluate(`(m => ({ strokes: m.scene.strokes, cats: m.cast.cats.length, dog: !!m.cast.dog, proc: !!m.cast.proc, flakes: m.flakes.length, alpha: m.scene.lit.getContext('2d', { willReadFrequently: true }).getImageData(10, m.scene.ph - 10, 1, 1).data[3] }))(WP.stage.manager)`);
            if (bare.strokes < 50000 || bare.cats || bare.dog || bare.proc || bare.flakes || bare.alpha !== 255) record(`the bare valley: ${JSON.stringify(bare)}`);
            return true;
        }],
    ],
    'reading-room': [
        ['a winter morning on frame one: the hall painted as it comes, the sun\'s panes on the floor (and gone when sunbeams are off), a cat asleep in them, readers at the tables; a tap lights a table\'s lamps and nothing is painted again', async () => {
            if (!await stageWith('reading-room', { configVersion: 1 }, '&seed=7&date=2026-12-10T10:30')) return record('not ready');
            const first = await evaluate(`(m => { const T = m.scene, d = T.lit.getContext('2d', { willReadFrequently: true }).getImageData(T.pw >> 1, T.ph - 20, 4, 4).data;
                return { frames: WP.host.frames.count, lit: d[0] + d[1] + d[2], alpha: d[3], cats: m.cast.cats.length, students: m.cast.students.length, librarian: !!m.cast.librarian, owl: !!m.cast.owl, beams: m.beams.length, spots: m.spots.length, kind: m.cam.kind, tables: m.L.tables.length }; })(WP.stage.manager)`);
            if (first.frames > 12 || !(first.lit > 60) || first.alpha !== 255) record(`no picture on the first frames: ${JSON.stringify(first)}`);
            if (first.cats !== 6 || first.students < 8 || !first.librarian || !first.owl || first.tables !== 16 || first.kind !== 'wide') record(`not alive on frame one: ${JSON.stringify(first)}`);
            if (first.beams < 10 || first.spots < 4) record(`no sun in at the windows on a winter morning: ${JSON.stringify(first)}`);
            if (!await waitFor(() => evaluate('WP.stage.manager.scene.done && !WP.stage.manager.next'), 40000)) return record('the painting never finished');
            const painted = await evaluate(`(m => ({ strokes: m.scene.strokes, pass: m.scene.pass, bakes: m.bakes, patches: m.scene.groups.filter(g => g.patch).length, glows: m.scene.groups.filter(g => g.glow).length, masks: m.scene.masks.filter(Boolean).length, windows: m.scene.windows.length, shelves: m.scene.shelves.length, motes: m.motes.length, shafts: m.shafts.length }))(WP.stage.manager)`);
            if (painted.strokes < 150000 || painted.pass < 5 || painted.bakes !== 1 || painted.patches < 18 || painted.glows < 16 || painted.masks < 6 || painted.windows < 40 || painted.shelves < 30 || painted.motes < 20 || painted.shafts < 4) record(`the painting: ${JSON.stringify(painted)}`);
            // The floor in a patch of sun, with the sunbeams on and off: the sun is a light of its own; nothing is painted again.
            const spot = await evaluate(`(m => { const s = m.spots.slice().sort((a, b) => a.z - b.z).find(s => s.z > 8 && s.z < 30) || m.spots[0]; return { x: s.x, z: s.z }; })(WP.stage.manager)`);
            const floor = `(m => { const T = m.scene, cam = m.cam, s = ${JSON.stringify(spot)}, [x, y] = cam.p(s.x, 0, s.z);
                const d = T.lit.getContext('2d', { willReadFrequently: true }).getImageData(Math.round(x * T.ps) - 6, Math.round(y * T.ps) - 3, 12, 6).data; let v = 0; for (let i = 0; i < d.length; i += 4) v += d[i] + d[i + 1] + d[i + 2];
                return { v: Math.round(v / 72), x: Math.round(x), y: Math.round(y), sun: ReadingLogic.sunAt(m.beams, s.x, s.z), bakes: m.bakes, steps: m.steps }; })(WP.stage.manager)`;
            const sunny = await evaluate(floor);
            await evaluate(`(m => m.applySettings({ ...m.config, sunbeams: false }))(WP.stage.manager)`);
            await sleep(900);
            const shade = await evaluate(floor);
            if (sunny.sun !== 0 || !(sunny.v > shade.v * 1.25) || shade.bakes !== 1 || shade.steps <= sunny.steps) record(`the sun on the floor: on ${JSON.stringify(sunny)}, off ${JSON.stringify(shade)}`);
            await evaluate(`(m => m.applySettings({ ...m.config, sunbeams: true }))(WP.stage.manager)`);
            await sleep(900);
            const cats = await evaluate(`(m => m.cast.cats.map(c => ({ role: c.role, inSun: c.inSun, y: +(c.y || 0).toFixed(2), x: +c.x.toFixed(1), z: +c.z.toFixed(1) })))(WP.stage.manager)`);
            if (!cats.some(c => c.role === 'sunbeam' && c.inSun)) record(`no cat asleep in the sun: ${JSON.stringify(cats)}`);
            // A table tapped on its top: its three lamps come on (it is morning, so they were out), and only the light is stepped.
            const table = await evaluate(`(m => { const T = m.scene, h = T.hits.filter(h => h.kind === 'table').sort((a, b) => (b.x1 - b.x0) - (a.x1 - a.x0)).find(h => h.x0 > 20 && h.x1 < m.W - 20 && h.y1 < m.H - 20) || T.hits.find(h => h.kind === 'table'); return { x: (h.x0 + h.x1) / 2, y: h.y0 + (h.y1 - h.y0) * 0.55, id: h.table, before: h.group.level }; })(WP.stage.manager)`);
            await mouse('mousePressed', table.x, table.y); await mouse('mouseReleased', table.x, table.y);
            await sleep(1600);
            const lamps = await evaluate(`(m => { const g = m.scene.groups.find(g => g.kind === 'table' && g.table === ${table.id}); return { level: g.level, forced: g.forced, bakes: m.bakes }; })(WP.stage.manager)`);
            if (table.before !== 0 || !(lamps.level > 0.95) || !lamps.forced || lamps.bakes !== 1) record(`a tapped table: ${JSON.stringify({ table, lamps })}`);
            console.log(`    reading-room: ${painted.strokes} strokes, ${painted.patches} patches of light, ${painted.windows} panes, ${painted.shafts} shafts and ${painted.motes} motes; the floor in the sun ${sunny.v}, without it ${shade.v}; ${cats.filter(c => c.inSun).length} cats in the sun`);
            await shoot('reading-room-morning');
            return true;
        }],
        ['at dusk the librarian goes down the hall and the lamps come on a table at a time; the rail cat\'s book falls and comes back to her; the clock strikes; the night is lamplit', async () => {
            if (!await stageWith('reading-room', { configVersion: 1, students: 0, planes: 0 }, '&seed=7&date=2026-12-10T16:40')) return record('not ready');
            await waitFor(() => evaluate('WP.stage.manager.scene.done && !WP.stage.manager.next'), 40000);
            // Send her round from the start: put every table out, and watch.
            await evaluate(`(m => { for (const g of m.scene.groups) if (g.kind === 'table') { g.lit = null; g.level = 0; g.forced = null; } const l = m.cast.librarian; l.x = 7.5; l.z = 9.2; l.state = 'desk'; l.t = 999; })(WP.stage.manager)`);
            const counts = [];
            for (let i = 0; i < 18; i++) { await sleep(1500); counts.push(await evaluate(`WP.stage.manager.scene.groups.filter(g => g.kind === 'table' && g.lit).length`)); }
            const where = await evaluate(`(m => ({ state: m.cast.librarian.state, z: +m.cast.librarian.z.toFixed(1) }))(WP.stage.manager)`);
            const rising = counts.every((n, i) => !i || n >= counts[i - 1]);
            if (!rising || counts[0] > 4 || counts[counts.length - 1] < 8 || new Set(counts).size < 4) record(`the lamps at dusk, lit in turn: ${counts.join(' ')} (${JSON.stringify(where)})`);
            await shoot('reading-room-dusk');
            // The book: pushed off the rail, it lands on the floor, and floats back up to her.
            const book = await evaluate(`(m => { const c = m.cast.cats.find(c => c.role === 'shelf'); if (!c) return null; c.book.state = 'rail'; c.book.t = 0.2; return c.book.state; })(WP.stage.manager)`);
            if (!book) return record('no cat on the gallery rail');
            const seen = new Set();
            for (let i = 0; i < 80 && !seen.has('rise'); i++) { await sleep(150); const s = await evaluate(`(m => { const b = m.cast.cats.find(c => c.role === 'shelf').book; if (b.state === 'floor') b.t = Math.min(b.t, 0.3); return b.state; })(WP.stage.manager)`); seen.add(s); }
            const back = await evaluate(`(m => { const c = m.cast.cats.find(c => c.role === 'shelf'); return { state: c.book.state, d: +Math.hypot(c.book.x - c.x, c.book.y - c.y).toFixed(2) }; })(WP.stage.manager)`);
            if (!['fall', 'floor', 'rise'].every(s => seen.has(s))) record(`the book: ${[...seen].join(', ')}`);
            // The clock, tapped.
            // (Its top: in December the tree stands in front of the bottom of it, and takes a tap there.)
            const clock = await evaluate(`(m => m.scene.spots.clock)(WP.stage.manager)`);
            await mouse('mousePressed', clock.x, clock.y - clock.r * 0.75); await mouse('mouseReleased', clock.x, clock.y - clock.r * 0.75);
            await sleep(200);
            if (!(await evaluate('WP.stage.manager.cast.chime') > 0)) record('the clock did not strike when tapped');
            // Night: the tables lit, the hall dark between them.
            await evaluate(`(m => m.applySettings({ ...m.config, time: 'night' }))(WP.stage.manager)`);
            await sleep(3500);
            const night = await evaluate(`(m => ({ lit: m.scene.groups.filter(g => g.kind === 'table' && g.level > 0.5).length, of: m.scene.groups.filter(g => g.kind === 'table').length, chandeliers: m.scene.groups.filter(g => g.kind === 'chandelier' && g.level > 0.5).length, dark: +m.light.dark.toFixed(2), bakes: m.bakes }))(WP.stage.manager)`);
            if (night.lit < night.of || night.chandeliers < 3 || night.dark < 0.9 || night.bakes !== 1) record(`the night: ${JSON.stringify(night)}`);
            await shoot('reading-room-night');
            console.log(`    reading-room: lamps lit in turn ${counts.join(' ')}; the book went ${[...seen].join(' → ')}; at night ${night.lit} of ${night.of} tables and ${night.chandeliers} chandeliers`);
            return true;
        }],
        ['the spine down the middle and three galleries; readers up on them; a busy hall where people walk in and out on planted feet, round the furniture, and never through each other', async () => {
            if (!await stageWith('reading-room', { configVersion: 1, students: 30, cats: 4 }, '&seed=7&date=2026-10-10T11:00')) return record('not ready');
            const hall = await evaluate(`(m => ({ spine: m.L.spine.length, cases: m.scene.groups.filter(g => g.kind === 'case').length, galleries: ReadingLogic.ROOM.gal.length, browsers: m.cast.browsers.map(b => b.y), walking: m.cast.students.filter(s => s.state !== 'seat').length, curios: m.L.things.filter(t => t.centre).map(t => t.kind).join() }))(WP.stage.manager)`);
            if (hall.spine !== 16 || hall.cases < 12 || hall.galleries !== 3 || hall.browsers.length < 3 || !hall.browsers.every(y => [6, 11.5, 17].includes(y)) || !hall.walking || !/lectern/.test(hall.curios)) record(`the hall: ${JSON.stringify(hall)}`);
            // Traffic: a few up and out, a few in, the librarian round; watch them for a while.
            await evaluate(`(m => { const c = m.cast; for (const s of c.students.filter(s => s.state === 'seat').slice(0, 6)) c.leave(s); for (let i = 0; i < 6; i++) c.addStudent(false); c.round(c.librarian, 'round'); })(WP.stage.manager)`);
            let worst = Infinity, slip = 0, frames = 0, moved = 0;
            for (let i = 0; i < 60; i++) {
                await sleep(120);
                const r = await evaluate(`(m => { const b = m.cast.bodies().filter(a => a.kind !== 'cat'), walk = b.filter(a => a.g && !a.g.rest); let worst = Infinity; for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) worst = Math.min(worst, Math.hypot(b[i].x - b[j].x, b[i].z - b[j].z) - b[i].r - b[j].r);
                    let slip = 0; for (const a of walk) { const f = a.g.feet[1 - a.g.sw], k = a.g.sw + ':' + a.g.p.toFixed(3); if (a._st && a._st.sw === a.g.sw && a.g.p > a._st.p) slip = Math.max(slip, Math.hypot(f.x - a._st.x, f.z - a._st.z)); a._st = { sw: a.g.sw, p: a.g.p, x: f.x, z: f.z }; }
                    return { worst, slip, walking: walk.length }; })(WP.stage.manager)`);
                worst = Math.min(worst, r.worst); slip = Math.max(slip, r.slip); frames++; moved = Math.max(moved, r.walking);
            }
            if (worst < -1e-6 || slip > 1e-9 || moved < 4) record(`people in the hall: closest ${worst.toFixed(3)} m apart (less than 0 is through each other), a planted foot slid ${slip.toFixed(4)} m, ${moved} walking at once`);
            console.log(`    reading-room: ${hall.spine} cases down the middle, ${hall.browsers.length} readers on the galleries; ${moved} walking at once, the closest ${worst.toFixed(2)} m apart, planted feet slid ${slip} m`);
            await shoot('reading-room-busy');
            return true;
        }],
        ['a phone held upright stands its own way above the gesture bar; with nothing in the hall it is still a painted hall; a lost painting is painted again', async () => {
            if (!await bootStage('w=reading-room&host=android&seed=7&date=2026-12-10T15:00', { width: 412, height: 915, deviceScaleFactor: 2 })) return record('not ready on a phone');
            const phone = await evaluate(`(m => ({ inset: WP.host.insets.bottom, Hu: m.cam.Hu, H: m.H, kind: m.cam.kind, bottom: +m.cam.foot(m.cam.D(1)).toFixed(1) }))(WP.stage.manager)`);
            if (phone.inset !== 48 || phone.Hu !== phone.H - 48 || phone.kind !== 'upright' || Math.abs(phone.bottom - phone.Hu) > 1) record(`the phone: ${JSON.stringify(phone)}`);
            await waitFor(() => evaluate('WP.stage.manager.scene.done'), 30000);
            await shoot('reading-room-phone');
            await cdp.send('Emulation.clearDeviceMetricsOverride');
            const off = { configVersion: 1, cats: 0, students: 0, librarian: false, owl: false, planes: 0, magic: false, chandeliers: false, fireplace: false, desk: false, decorations: 'never', sunbeams: false, moonbeams: false, weather: 'clear', clouds: 0, touch: false };
            if (!await stageWith('reading-room', off, '&seed=7&date=2026-12-10T15:00')) return record('no boot with everything left out');
            await waitFor(() => evaluate('WP.stage.manager.scene.done'), 30000);
            const bare = await evaluate(`(m => ({ cast: m.cast.cats.length + m.cast.students.length + (m.cast.librarian ? 1 : 0) + (m.cast.owl ? 1 : 0), beams: m.beams.length, motes: m.motes.length, groups: m.scene.groups.map(g => g.kind).join(), strokes: m.scene.strokes }))(WP.stage.manager)`);
            if (bare.cast || bare.motes || bare.strokes < 100000 || /fire|desk|chandelier|tree/.test(bare.groups)) record(`the bare hall: ${JSON.stringify(bare)}`);
            const probe = `(m => { const c = document.createElement('canvas'); c.width = c.height = 1; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(m.scene.paint, m.scene.pw >> 1, m.scene.ph - 2, 1, 1, 0, 0, 1, 1); return g.getImageData(0, 0, 1, 1).data[3]; })(WP.stage.manager)`;
            await evaluate(`(m => { m.scene.paint.getContext('2d').clearRect(0, 0, m.scene.pw, m.scene.ph); m.lostCheck = 10; })(WP.stage.manager)`);
            if (!await waitFor(() => evaluate('WP.stage.manager.recoveries === 1'), 4000)) return record('a blank painting was not noticed');
            if (await evaluate(probe) !== 255 || !await evaluate('WP.stage.manager.bakes === 2')) record('noticed, but not painted again');
            return true;
        }],
    ],
    'ski-run': [
        ['on the mountain on the first frame: the lead and two friends on the snow, tracks behind them, the land about them', async () => {
            if (!await stageWith('ski-run', null, '&seed=7')) return record('not ready');
            await sleep(2500);
            const s = await evaluate(`(m => { const W = m.world, C = W.course; return { flat: m.flat, riders: W.riders.length, kinds: W.riders.map(r => r.kind).join(),
                off: Math.max(...W.riders.map(r => r.air ? 0 : Math.abs(r.y - C.height(r.x, r.z)))), speed: W.riders[0].v, tracks: m.trails.get(W.riders[0].id).pts.length,
                chunks: m.chunks.size, meshes: [...m.chunks.values()].filter(c => c.mesh).length, trees: [...m.chunks.values()].reduce((n, c) => n + (c.trees ? c.trees.n : 0), 0),
                drawn: m.renderer.drawn, moving: m.moving.n / 3, batches: m.scene.batches.reduce((n, b) => n + b.n, 0), shot: m.cam.shot, type: C.find(W.riders[0].z).type }; })(WP.stage.manager)`);
            if (s.riders !== 3 || s.kinds !== 'ski,board,ski') record(`who is skiing: ${JSON.stringify(s)}`);
            if (!(s.off < 0.01) || !(s.speed > 8)) record(`the riders are ${s.off} m off the snow at ${s.speed} m/s`);
            if (s.tracks < 100) record(`the lead has ${s.tracks} points of track behind`);
            if (s.chunks !== 61 || s.trees < 3000) record(`the land: ${s.chunks} chunks, ${s.trees} trees`);
            if (s.shot !== 'follow' || s.type !== 'groomer') record(`it starts ${s.shot} on a ${s.type}`);
            // With WebGL: a mesh for every chunk, trees by the batch, the riders as triangles.
            if (!s.flat && (s.meshes < s.chunks - 1 || s.drawn.triangles < 60000 || s.drawn.calls > 160 || s.moving < 600 || s.batches < 400)) record(`the view: ${JSON.stringify(s)}`);
            if (await evaluate(DRAWN) < 30) record('barely drawn');
            await shoot('ski-run');
            return s.riders === 3;
        }],
        ['without WebGL the run goes on, flat: in real time on Low as on High; carved by hand and given back; a jump sent and one botched; friends; cameras', async () => {
            const noGl = "(() => { const real = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (kind, ...rest) { return /^webgl/.test(kind) ? null : real.call(this, kind, ...rest); }; })()";
            const { identifier } = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: noGl });
            try {
                for (const tier of ['low', 'high']) {
                    if (!await stageWith('ski-run', null, `&seed=7&tier=${tier}`)) return record(`${tier}: not ready without WebGL`);
                    await sleep(500);
                    const at = () => evaluate('(m => ({ flat: m.flat, time: m.world.time, z: m.world.riders[0].z, t: performance.now(), n: WP.host.frames.count }))(WP.stage.manager)');
                    const a = await at();
                    await sleep(2500);
                    const b = await at();
                    const rate = (b.time - a.time) / ((b.t - a.t) / 1000), fps = (b.n - a.n) / ((b.t - a.t) / 1000);
                    if (!b.flat) record(`${tier}: still on WebGL`);
                    if (Math.abs(rate - 1) > 0.08) record(`${tier}: the mountain runs at ${rate.toFixed(2)}× real time at ${fps.toFixed(0)} fps`);
                    if (!(b.z - a.z > 15)) record(`${tier}: the lead came ${(b.z - a.z).toFixed(1)} m in 2.5 s`);
                    if (await evaluate(DRAWN) < 20) record(`${tier}: barely drawn without WebGL`);
                }
                await shoot('ski-run-flat');
                // The rest on open pistes with nobody else about, so a jump can be sent wherever the lead has got to.
                const open = { configVersion: 1, sections: ['groomer', 'powder'], others: 0 };
                if (!await stageWith('ski-run', open, '&seed=7')) return record('open pistes: not ready');
                await sleep(500);
                const lead = () => evaluate('(m => { const r = m.world.riders[0]; return { active: m.world.hand.active, manual: r.manual, air: r.air, lift: r.lift, trick: r.trick && (r.trick.name || r.trick.manual && "by hand"), fall: r.fall && r.fall.phase, v: r.v, riders: m.world.riders.length, shot: m.cam.shot }; })(WP.stage.manager)');
                const run = (key, shift = false) => evaluate(`WP.entry('ski-run').keys.find(k => k.keys.includes('${key}')).run(WP.stage.manager, { key: '${key}', shift: ${shift} })`);
                const press = (type, name) => evaluate(`document.dispatchEvent(new KeyboardEvent('${type}', { key: '${name}', bubbles: true }))`);
                // By hand: D held carries the lead across; let go, and four seconds later the line is their own again. A press the player forwards counts too.
                const before = await lead();
                if (before.active || Math.abs(before.manual) > 0.01) record(`carved by hand before a key: ${JSON.stringify(before)}`);
                await press('keydown', 'd');
                await sleep(1500);
                const held = await lead();
                if (!held.active || held.manual < 4) record(`D held for 1.5 s: ${JSON.stringify(held)}`);
                await press('keyup', 'd');
                await sleep(5500);
                const back = await lead();
                if (back.active || Math.abs(back.manual) > held.manual * 0.6) record(`5.5 s after letting go: ${JSON.stringify(back)}`);
                await run('a');
                await sleep(300);
                const tapped = await lead();
                if (!tapped.active || tapped.manual >= back.manual) record(`a forwarded A: ${JSON.stringify(tapped)}`);
                // (A hand was on the lead a moment ago, so the air is the hand's: a trick by hand counts.)
                // Sent: off the snow, a trick, and landed. Sent badly: a tumble, sitting up, shaking it off, and away again.
                await waitFor(async () => { const s = await lead(); return !s.air && !s.fall && s.v > 6; }, 8000);
                const said = await run('j');
                if (said !== 'Sending it') record(`J said ${said}`);
                const up = await waitFor(async () => { const s = await lead(); return s.air && s.lift > 0.5 && s.trick ? s : null; }, 3000);
                if (!up) record('J: no trick in the air'); else await shoot('ski-run-trick');
                if (!await waitFor(async () => { const s = await lead(); return !s.air && !s.fall && s.v > 6; }, 8000)) record('the sent jump was not landed');
                await run('j', true);
                const phases = new Set();
                const through = await waitFor(async () => { const s = await lead(); if (s.fall) phases.add(s.fall); return phases.size >= 3 && !s.fall && s.v > 4; }, 20000);
                if (!through || !phases.has('tumble') || !phases.has('shake')) record(`a botched jump went through ${[...phases]}`);
                // The rest of the hand: S held is a stop, and let go they are away; J held is a bigger jump; an arrow in the air spins,
                // and let go in time it comes round and is called out, clean.
                const hint = await evaluate('WP.stage.manager.hinted');
                if (!hint) record('no word on what the hand can do');
                await press('keydown', 's');
                const stopped = await waitFor(async () => (await lead()).v < 0.5, 9000);
                await press('keyup', 's');
                if (!stopped) record(`S held: still going at ${(await lead()).v.toFixed(1)} m/s`);
                if (!await waitFor(async () => (await lead()).v > 5, 9000)) record('let go of S, they did not set off');
                await waitFor(async () => { const s = await lead(); return !s.air && !s.fall && s.v > 6; }, 8000);
                await evaluate('WP.stage.manager.stomped = null');
                await press('keydown', 'j');
                await sleep(900);
                await press('keyup', 'j');
                const flying = await waitFor(async () => { const s = await evaluate('(m => { const r = m.world.riders[0]; return r.air && r.airT > 0.05 ? { T: r.T, manual: !!(r.trick && r.trick.manual) } : null; })(WP.stage.manager)'); return s; }, 3000);
                if (!flying || flying.T < 1 || !flying.manual) record(`J held: ${JSON.stringify(flying)}`);
                await press('keydown', 'ArrowRight');
                await sleep(130);
                await press('keyup', 'ArrowRight');
                const called = await waitFor(() => evaluate('WP.stage.manager.stomped'), 4000);
                // (Whether it comes round in time here depends on how quickly the page answers a key, so only that it was called;
                // the unit tests hold a spin let go in time to a clean landing.)
                if (!called || !/^\d+$/.test(called.name)) record(`a spin by hand: ${JSON.stringify(called)}`);
                if (await evaluate("localStorage.getItem('wp:ski-run')") !== JSON.stringify(open)) record('carving and jumping saved something');
                // Friends come and go with the setting, live.
                for (const friends of [3, 1]) {
                    await evaluate(`(m => m.applySettings({ ...m.config, friends: ${friends} }))(WP.stage.manager)`);
                    const s = await lead();
                    if (s.riders !== friends + 1) record(`${friends} friends: ${s.riders} riders`);
                }
                // V steps through the cameras, and saves.
                const seen = [];
                for (let i = 0; i < 4; i++) { const name = await run('v'); await sleep(250); seen.push([await evaluate('WP.stage.manager.config.camera'), (await lead()).shot, name]); }
                if (seen.map(s => s[0]).join() !== 'front,diorama,auto,follow') record(`V went through ${seen.map(s => s[0])}`);
                if (seen[0][1] !== 'front' || seen[1][1] !== 'diorama' || seen[3][1] !== 'follow' || !['follow', 'front', 'diorama', 'side'].includes(seen[2][1])) record(`the cameras showed ${seen.map(s => s[1])}`);
                if (seen.some(s => !s[2])) record(`V said ${seen.map(s => s[2])}`);
                await run('v');
                if (await evaluate("JSON.parse(localStorage.getItem('wp:ski-run')).camera") !== 'front') record('V did not save the camera');
                if (await run('g') !== 'On a board' || await evaluate('WP.stage.manager.world.riders[0].kind') !== 'board') record('G did not put the lead on a board');
            } finally {
                await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
            }
            return true;
        }],
        ['at the grand lodge they pull in, leave their skis in the snow, walk up to a table on the terrace and sit over a drink; the director shows the lodge; then they are away again', async () => {
            if (!await stageWith('ski-run', { configVersion: 1, sections: ['groomer', 'lodge'], others: 0, time: 'day', weather: 'clear', camera: 'auto' }, '&seed=7')) return record('not ready');
            await sleep(500);
            // On down the mountain to the first lodge, until all three are at the table; then the land about them afresh.
            const at = await evaluate(`(m => { const W = m.world; let i = 0; for (; i < 30000 && !W.riders.every(r => r.afoot && r.afoot.seated); i++) { SkiLogic.worldStep(W, 1 / 60, null); W.events.length = 0; }
                m.trails.clear(); m.cam = SkiLogic.camera(); m.kc = null; const s = W.course.find(W.riders[0].z), l = W.course.lodge(s);
                return { steps: i, type: s.type, phase: W.group.phase, seated: W.riders.filter(r => r.afoot && r.afoot.seated).length, gear: W.riders.filter(r => r.afoot && r.afoot.gear).length,
                    deck: Math.max(...W.riders.map(r => Math.abs(r.y - l.y - SkiLogic.LODGE.deck))), pad: Math.abs(W.course.height(l.x, l.z) - l.y) }; })(WP.stage.manager)`);
            if (at.type !== 'lodge' || at.phase !== 'apres' || at.seated !== 3 || at.gear !== 3 || at.deck > 0.01 || at.pad > 0.01) record(`at the lodge: ${JSON.stringify(at)}`);
            await sleep(3000);
            const view = await evaluate('(m => ({ flat: m.flat, shot: m.cam.shot, lodges: m.lodges.length, moving: m.moving.n / 3, tracks: m.trails.get(m.world.riders[0].id)?.pts.length || 0 }))(WP.stage.manager)');
            if (view.shot !== 'lodge' || view.lodges < 1 || view.tracks > 2) record(`the view of the lodge: ${JSON.stringify(view)}`);
            // With WebGL: the three at their table and thirteen more about the terrace, as triangles.
            if (!view.flat && view.moving < 3000) record(`the terrace: ${JSON.stringify(view)}`);
            if (!await waitFor(async () => await evaluate(DRAWN) >= 30, 8000)) record('barely drawn');
            await shoot('ski-run-lodge');
            await evaluate("WP.stage.manager.config.camera = 'follow'");
            await sleep(2500);
            const behind = await evaluate('(m => ({ shot: m.cam.shot, seated: m.world.riders.filter(r => r.afoot && r.afoot.seated).length }))(WP.stage.manager)');
            if (behind.shot !== 'follow' || behind.seated !== 3) record(`from behind the lead at the table: ${JSON.stringify(behind)}`);
            // (On a slow renderer the wallpaper's own watch on the GPU resizes the canvas, which is blank until its next frame.)
            if (!await waitFor(async () => await evaluate(DRAWN) >= 30, 8000)) record('from behind the lead at the table: barely drawn');
            await shoot('ski-run-lodge-follow');
            // And away: back down the steps, into their skis, and off down the hill.
            const away = await evaluate(`(m => { const W = m.world; let i = 0; for (; i < 6000 && !(W.group.phase === 'ride' && W.riders.every(r => !r.afoot && r.v > 5)); i++) { SkiLogic.worldStep(W, 1 / 60, null); W.events.length = 0; }
                return { steps: i, afoot: W.riders.filter(r => r.afoot).length, v: W.riders[0].v, ghosts: W.ghosts }; })(WP.stage.manager)`);
            if (away.steps >= 6000 || away.afoot || away.ghosts) record(`away from the lodge: ${JSON.stringify(away)}`);
            return at.seated === 3;
        }],
        ['night lights the floodlights and the stars; snow closes in; fog rolls through; T and X step and save', async () => {
            if (!await stageWith('ski-run', { configVersion: 1, time: 'day', weather: 'clear' }, '&seed=7')) return record('midday: not ready');
            await sleep(1500);
            const day = await evaluate(AVERAGE);
            if (!await stageWith('ski-run', { configVersion: 1, time: 'night', weather: 'clear' }, '&seed=7')) return record('night: not ready');
            await sleep(1500);
            const night = await evaluate(AVERAGE);
            const n = await evaluate('(m => ({ flat: m.flat, lit: m.lit, stars: m.scene.stars, lamps: m.scene.lamps.length, glows: m.glows.n, masts: m.masts.length, sun: m.scene.lightCol[0], day: m.day }))(WP.stage.manager)');
            if (n.lit < 0.9 || n.stars < 0.9 || n.masts < 4) record(`night: ${JSON.stringify(n)}`);
            if (!n.flat && (n.lamps < 2 || n.glows < 4)) record(`the floodlights: ${JSON.stringify(n)}`);
            // A floodlit piste is bright; the night about it is not.
            if (night.reduce((a, b) => a + b) > day.reduce((a, b) => a + b) * 0.8) record(`night ${night} is hardly darker than midday ${day}`);
            await shoot('ski-run-night');
            if (!await stageWith('ski-run', { configVersion: 1, time: 'day', weather: 'snow' }, '&seed=7')) return record('snow: not ready');
            await sleep(1500);
            const w = await evaluate('(m => ({ level: m.weather.level, see: m.air.visibility, flakes: m.scene.flakes, sun: m.scene.lightCol[0], shadow: m.scene.shadow }))(WP.stage.manager)');
            if (w.level < 0.69 || w.see > 800 || w.flakes < 0.8 || w.sun > 0.6) record(`snow: ${JSON.stringify(w)}`);
            await shoot('ski-run-snow');
            // X and T, as the catalog binds them: on to fog, and on through dusk to night.
            const keys = await evaluate(`(m => { const run = key => WP.entry('ski-run').keys.find(k => k.keys.includes(key)).run(m, {}); return { x: run('x'), t: [run('t'), run('t')], config: m.config, saved: JSON.parse(localStorage.getItem('wp:ski-run')) }; })(WP.stage.manager)`);
            if (keys.config.weather !== 'fog' || keys.config.time !== 'night') record(`the keys left ${JSON.stringify({ weather: keys.config.weather, time: keys.config.time })}`);
            if (keys.saved.weather !== 'fog' || keys.saved.time !== 'night') record(`the keys saved ${JSON.stringify(keys.saved)}`);
            if (!/fog/.test(keys.x) || !/dusk/.test(keys.t[0]) || !/night/.test(keys.t[1])) record(`the keys said ${JSON.stringify([keys.x, keys.t])}`);
            if (!await waitFor(() => evaluate('WP.stage.manager.weather.mist > 0.6'), 45000)) record('X did not bring the fog in');
            return true;
        }],
        ['a phone held upright: the picture is lifted clear of the gesture bar, and wide enough to hold the piste', async () => {
            const viewport = { width: 412, height: 915, deviceScaleFactor: 2.625 };
            try {
                if (!await bootStage('w=ski-run&host=android&seed=7', viewport)) return record('not ready on a phone');
                await sleep(1500);
                const g = await evaluate(`(m => { const r = m.world.riders[0], c = m.scene.cam, dx = r.x - c.x, dy = r.y + 0.9 - c.y, dz = r.z - c.z;
                    const depth = dx * Math.sin(c.heading) * Math.cos(c.pitch) + dy * Math.sin(c.pitch) + dz * Math.cos(c.heading) * Math.cos(c.pitch);
                    const up = -dx * Math.sin(c.heading) * Math.sin(c.pitch) + dy * Math.cos(c.pitch) - dz * Math.cos(c.heading) * Math.sin(c.pitch);
                    return { lift: m.scene.lift, tanY: m.scene.tanY, tan: m.cam.tan, inset: WP.host.insets.bottom, w: m.width, h: m.height, y: (0.5 - up / depth / m.scene.tanY / 2 - m.scene.lift / 2) * m.height, depth, tier: WP.host.quality.tier }; })(WP.stage.manager)`);
                if (g.inset !== 48 || Math.abs(g.lift - 48 / 915) > 1e-6) record(`lifted ${g.lift} for a ${g.inset} px inset`);
                if (g.tanY < g.tan * 1.5 || g.tanY > 1.2) record(`the lens on a phone: tan ${g.tanY} against ${g.tan}`);
                if (!(g.depth > 3) || !(g.y > 915 * 0.25 && g.y < 915 - 48 - 80)) record(`the lead is at ${g.y} px down, ${g.depth} m off`);
                if (await evaluate(DRAWN) < 30) record('barely drawn on a phone');
                await shoot('ski-run-phone');
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
        ['a paused stage never claims (Android: hidden but not document.hidden); a tap on "another tab" takes it back; a tap anywhere switches the sound', async () => {
            const mock = jellyfinServer();
            await fresh(`${WEB}/stage.html?w=jellyfin`, jellyfinSignedIn(mock, { order: 'inOrder', subtitles: 'off' }));
            if (!await waitFor(() => counts(`m.state === 'playing' && m.video.currentTime > 0.2`), 10000)) return record('never played');
            const key = 'wp:jellyfin:claim', other = JSON.stringify({ tab: 'elsewhere', at: Date.now() });
            // Another WebView takes over while this one is paused, then this one plays something (a settings change).
            await evaluate(`localStorage.setItem('${key}', '${other}'); WP.stage.manager.claimed({ key: '${key}', newValue: '${other}' }); WP.stage.pause(); WP.stage.manager.claim()`);
            if (await evaluate(`localStorage.getItem('${key}')`) !== other) record('a paused stage claimed playback');
            await evaluate('WP.stage.resume()');
            if (!await waitFor(() => counts(`m.state === 'playing' && JSON.parse(localStorage.getItem('${key}')).tab === m.tab`), 6000)) record(`resuming didn't take playback back: ${JSON.stringify(await counts(`({ state: m.state, t: m.video?.currentTime, paused: WP.stage.paused, claim: localStorage.getItem('${key}'), tab: m.tab })`))}`);
            // Away again, and a real tap takes it back.
            await evaluate(`WP.stage.manager.claimed({ key: '${key}', newValue: '${other}' })`);
            if (await counts('m.state') !== 'away') return record('didn\'t go away');
            await mouse('mousePressed', 400, 300); await mouse('mouseReleased', 400, 300); await sleep(150);
            if (!await waitFor(() => counts(`m.state === 'playing' && m.video.currentTime > 0.2`), 6000)) return record(`a tap on "another tab" left it ${await counts('m.state')}`);
            // A tap anywhere: sound on, then off.
            if (!await counts('m.video.muted')) record('didn\'t start muted');
            await mouse('mousePressed', 300, 500); await mouse('mouseReleased', 300, 500); await sleep(150);
            if (await counts('m.video.muted || m.video.paused')) record('a tap didn\'t turn the sound on');
            await sleep(400);
            await mouse('mousePressed', 300, 500); await mouse('mouseReleased', 300, 500); await sleep(150);
            if (!await counts('m.video.muted')) record('a second tap didn\'t turn it off');
            // Start muted, switched off in the panel, applies now.
            await counts(`m.applySettings({ ...m.config, startMuted: false })`);
            if (await counts('m.video.muted')) record('Start muted off left it muted');
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
        ['Christmas frames: about 12 fps and still on Low; an option repaints once; the TV ornament in three sizes', async () => {
            const mock = jellyfinServer();
            for (const frame of ['christmas-lights', 'snowed-in', 'christmas-tree']) {
                for (const [tier, low, high] of [['medium', 10, 30], ['low', 0, 1]]) {
                    await fresh(`${WEB}/stage.html?w=jellyfin&tier=${tier}&date=2026-12-24T20:00:00`, jellyfinSignedIn(mock, { order: 'inOrder', subtitles: 'off', showTitle: false, frame }));
                    if (!await waitFor(() => counts(`m.state === 'playing' && m.video.currentTime > 0.2`), 10000)) return record(`${frame} ${tier}: never played`);
                    await sleep(4600);   // past the 🔇 badge's fade
                    const drawn = await framesIn(2000);
                    if (drawn < low || drawn > high) record(`${frame} ${tier}: ${drawn} frames in 2 s`);
                    if (tier === 'medium') await shoot(`jellyfin-${frame}-lit`);
                }
            }
            // Still on the tree: each option is one repaint, and the ornament's screen grows with its setting.
            const widths = [];
            for (const size of ['small', 'medium', 'large']) {
                const before = await counts('m.paints');
                await counts(`m.applySettings({ ...m.config, xmasTv: '${size}' })`);
                const after = await counts('({ paints: m.paints, w: m.layout.screen.w, ratio: m.layout.screen.w / m.layout.screen.h })');
                if (after.paints - before !== 1) record(`xmasTv ${size}: ${after.paints - before} repaints`);
                if (Math.abs(after.ratio - 16 / 9) > 0.01) record(`xmasTv ${size}: the screen is ${after.ratio.toFixed(3)}`);
                widths.push(after.w);
            }
            if (!(widths[0] < widths[1] && widths[1] < widths[2])) record(`the ornament's sizes: ${widths.map(v => v.toFixed(0)).join(', ')}`);
            const steady = await counts('m.paints');
            await counts(`m.applySettings({ ...m.config, volume: 0.5 })`);
            if (await counts('m.paints') !== steady) record('the volume repainted the room');
            return true;
        }],
        ['Big Old TV: mostly screen in every wood and style, tiny controls, an option repaints once, the volume doesn\'t', async () => {
            jellyfinServer();
            const woods = ['oak', 'mahogany', 'maple', 'ebony', 'avocado', 'tangerine', 'turquoise', 'cream', 'walnut'];
            for (const [name, width, height, mobile, least] of [['landscape', 1280, 800, false, 0.85], ['portrait', 412, 915, true, 0.88]]) {
                await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
                await stageAt(`${WEB}/stage.html?w=jellyfin&thumb=1&host=${mobile ? 'android' : 'standalone'}`, { 'wp:jellyfin': { configVersion: 1, frame: 'big-tv' } });
                await sleep(300);
                let n = 0;
                // Every step changes something, so every step is one repaint.
                for (const [style, controls] of [['fifties', 'side'], ['fifties', 'below'], ['seventies', 'below'], ['seventies', 'side']]) {
                    for (const ornament of ['cat', 'none', 'plant']) {
                        const wood = woods[n++ % woods.length], where = `${name} ${style} ${controls} ${wood}`;
                        const before = await counts('m.paints');
                        await counts(`m.applySettings({ ...m.config, bigTvStyle: '${style}', bigTvControls: '${controls}', bigTvWood: '${wood}', bigTvOrnament: '${ornament}' })`);
                        const L = await counts(`(({ screen, cabinet, panel, dials, pilot, below }) => ({ screen, cabinet, panel, dials, pilot, below, paints: m.paints, vw: innerWidth, bottom: innerHeight - WP.host.insets.bottom }))(m.layout)`);
                        const { screen: s, cabinet: c, panel: p } = L;
                        if (L.paints - before !== 1) record(`${where}: ${L.paints - before} repaints`);
                        if (s.w / L.vw < least) record(`${where}: the screen is ${(100 * s.w / L.vw).toFixed(1)}% of the width`);
                        if (Math.abs(s.w / s.h - 16 / 9) > 0.01) record(`${where}: the screen is ${(s.w / s.h).toFixed(3)}`);
                        if (c.x < 0 || c.y < 0 || c.x + c.w > L.vw || c.y + c.h > L.bottom) record(`${where}: the cabinet leaves the view`);
                        if (s.x < c.x || s.y < c.y || s.x + s.w > c.x + c.w || s.y + s.h > c.y + c.h) record(`${where}: the screen leaves the cabinet`);
                        if (L.below !== (mobile || controls === 'below')) record(`${where}: the controls are ${L.below ? 'below' : 'at the side'}`);
                        if (L.below ? p.y < s.y + s.h : p.x < s.x + s.w) record(`${where}: the controls overlap the screen`);
                        for (const d of [...L.dials, L.pilot]) {
                            if (d.x - d.r < p.x || d.x + d.r > p.x + p.w || d.y - d.r < p.y || d.y + d.r > p.y + p.h) record(`${where}: a control is off its strip`);
                            if (d.r > s.w * 0.03) record(`${where}: a knob ${d.r.toFixed(0)} px across a ${s.w.toFixed(0)} px screen isn't small`);
                        }
                        if (await evaluate(DRAWN) < 12) record(`${where}: barely drawn`);
                    }
                }
                const steady = await counts('m.paints');
                await counts(`m.applySettings({ ...m.config, volume: 0.5 })`);
                if (await counts('m.paints') !== steady) record(`${name}: the volume repainted the set`);
                await counts(`m.applySettings({ ...m.config, bigTvStyle: 'fifties', bigTvWood: 'turquoise', bigTvOrnament: 'cat' })`);
                await sleep(200);
                await shoot(`jellyfin-big-tv-fifties-${name}`);
            }
            await cdp.send('Emulation.clearDeviceMetricsOverride');
            return true;
        }],
        ['Big Old TV: the knob follows the channel, snow between items, a dot on pause, and still on Low', async () => {
            const mock = jellyfinServer();
            await fresh(`${WEB}/stage.html?w=jellyfin&tier=low`, jellyfinSignedIn(mock, { order: 'inOrder', subtitles: 'off', showTitle: false, frame: 'big-tv' }));
            if (!await waitFor(() => counts(`m.state === 'playing' && m.video.currentTime > 0.2`), 10000)) return record('never played');
            // The overlay's pixel in the middle of the screen: opaque while snow or the dark tube covers the video.
            const covered = () => counts(`(s => m.ctx.getImageData(Math.round((s.x + s.w / 2) * devicePixelRatio), Math.round((s.y + s.h * 0.3) * devicePixelRatio), 1, 1).data[3] > 200)(m.layout.screen)`);
            // Note the channel each overlay frame draws its knob at.
            await counts(`(f => { const tick = f.tick; window.knobs = []; f.tick = (ctx, t, L, env) => { window.knobs.push(env.channel); return tick(ctx, t, L, env); }; })(m.frameDef)`);
            if (await covered()) record('the screen is covered while playing');
            const paints = await counts('m.paints'), channel = await counts('m.channel');
            await counts('m.skip(1)');
            if (!await waitFor(covered, 3000)) record('no snow between items');
            if (!await waitFor(async () => !await covered() && await counts(`m.state === 'playing' && m.video.currentTime > 0.2`), 8000)) record('the snow never cleared');
            if (await counts('m.channel') !== channel + 1 || (await evaluate('window.knobs')).at(-1) !== channel + 1) record('the knob didn\'t follow the channel');
            if (await counts('m.paints') !== paints) record('a new item repainted the set');
            await sleep(4600);   // past the 🔇 badge's fade
            const drawn = await framesIn(2000);
            if (drawn > 1) record(`${drawn} overlay frames in 2 s on Low`);
            await counts('m.togglePause()');
            await sleep(1300);
            if (!await covered()) record('pause left the picture up');
            await shoot('jellyfin-big-tv-off');
            await counts('m.togglePause()');
            if (!await waitFor(async () => !await covered(), 3000)) record('play didn\'t bring the picture back');
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

    await check('the gallery: the header opens it, typing searches, chips filter, arrows move, Enter picks and Esc steps back', async () => {
        await fresh(`${WEB}/index.html?w=rain&panel=open`, { 'wp:hinted': true });
        await playerReady();
        if (!await waitFor(() => evaluate(PANEL_OPEN), 3000)) return record('panel not open');
        const state = () => evaluate(`({ browsing: WP.panel.browsing, query: document.querySelector('#panel .gallery-search').value,
            focus: document.activeElement.dataset.id || null, shown: [...document.querySelectorAll('#panel .picker .tile:not([hidden])')].map(t => t.dataset.id),
            choice: WP.player.choice, open: ${PANEL_OPEN} })`);
        await evaluate(`document.querySelector('#panel .switcher').click()`);
        await sleep(200);
        let s = await state();
        if (!s.browsing || s.focus !== 'rain') record(`the header didn't open the gallery on Rain: ${JSON.stringify({ browsing: s.browsing, focus: s.focus })}`);
        if (s.shown.length !== catalog.filter(e => !e.pseudo && !e.disabled).length + 1) record(`${s.shown.length} tiles in the gallery`);
        await press('ArrowRight');
        if ((await state()).focus !== s.shown[s.shown.indexOf('rain') + 1]) record('→ did not move to the next tile');
        for (const c of 'koi') await press(c);
        s = await state();
        if (s.query !== 'koi' || s.shown.join() !== 'koi-pond') record(`typing "koi" left ${JSON.stringify(s)}`);
        await press('Escape');
        s = await state();
        if (!s.browsing || s.query) record('Esc in a search should clear it first');
        await evaluate(`document.querySelector('#panel [data-filter=live]').click()`);
        s = await state();
        if (!s.shown.length || s.shown.some(id => !catalog.find(e => e.id === id)?.network)) record(`Live data shows ${s.shown}`);
        await evaluate(`document.querySelector('#panel [data-filter=all]').click()`);
        for (const c of 'fireplace') await press(c);
        await press('Enter');
        s = await state();
        if (s.choice !== 'fireplace' || s.browsing || !s.open) record(`Enter in the search: ${JSON.stringify({ choice: s.choice, browsing: s.browsing, open: s.open })}`);
        await evaluate(`document.querySelector('#panel .switcher').click()`);
        await press('Escape');
        s = await state();
        if (s.browsing || !s.open) record('Esc in the gallery should go back to the settings, not close');
        await press('Escape');
        if (await evaluate(PANEL_OPEN)) record('a second Esc should close the panel');
        return true;
    });

    await check('Android behind the launcher: a corner hold opens nothing (the settings screen still has its panel)', async () => {
        const hold = corner => inStage(`(() => { const x = ${corner === 'tr' ? 'innerWidth - 10' : '10'}, y = 10;
            window.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', clientX: x, clientY: y, bubbles: true })); })()`);
        await fresh(`${WEB}/index.html?w=rain&host=android`);
        await playerReady();
        await hold('tr');
        await hold('tl');
        await sleep(900);
        if (await evaluate(PANEL_OPEN)) record('a hold in the top right opened the panel on the live wallpaper');
        if (await evaluate(`!!document.fullscreenElement`)) record('a hold in the top left went fullscreen on the live wallpaper');
        if (await evaluate(`document.getElementById('toast').classList.contains('show')`)) record('the live wallpaper showed the first-run hint');
        await fresh(`${WEB}/index.html?w=rain`, { 'wp:hinted': true });
        await playerReady();
        await hold('tr');
        if (!await waitFor(() => evaluate(PANEL_OPEN), 2000)) record('a hold in the top right no longer opens the panel in a browser');
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
            for (const n of r.notes) console.log(`    note: ${n}`);
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
