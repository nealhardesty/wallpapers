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
// `marine` picks Lighthouse's fixture; `hold` keeps Wiki Pond's stream open.
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
    cdp.on('Log.entryAdded', ({ entry: e }) => e.level === 'error' && !(current.offline && declared(e.url || '')) && record(`log: ${e.text} ${e.url || ''}`));
    cdp.on('Runtime.executionContextCreated', ({ context }) => {
        if (context.auxData?.isDefault) contexts.set(context.auxData.frameId, context.id);
    });
    cdp.on('Fetch.requestPaused', ({ requestId, request }) => {
        const url = request.url;
        current.requests?.push(url);
        if (/^(file|data|blob|chrome-extension):/.test(url) || url === 'about:blank') return cdp.send('Fetch.continueRequest', { requestId });
        if (LIVE && (url.startsWith(`${LIVE}/`) || declared(url))) return cdp.send('Fetch.continueRequest', { requestId });
        if (current.offline && declared(url)) return cdp.send('Fetch.failRequest', { requestId, errorReason: 'InternetDisconnected' });
        // The browser asks the host's root for a favicon on its own.
        if (LIVE && new URL(url).pathname === '/favicon.ico') return cdp.send('Fetch.fulfillRequest', { requestId, responseCode: 204 });
        const fulfil = (body, type) => cdp.send('Fetch.fulfillRequest', {
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
        record(`network blocked: ${url}`);
        return cdp.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' });
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
    const photo = id === 'bing';
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
        const catalog = await evaluate('WP.catalog.map(e => ({ id: e.id, pseudo: !!e.pseudo, disabled: e.disabled || null, network: !!e.network }))');
        NETWORK_HOSTS = await evaluate('[...new Set(WP.catalog.flatMap(e => e.network || []))]');
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
