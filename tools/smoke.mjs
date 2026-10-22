#!/usr/bin/env node
// Smoke test, in headless Chrome over the DevTools protocol (Node's built-in
// WebSocket, no deps), against the real pages on file://.
//
//   node tools/smoke.mjs                 everything
//   node tools/smoke.mjs fishtank quest  just these stages (skips the player suite)
//
// Stage suite, every wallpaper on stage.html?w=<id> with fresh storage: it
// boots, draws, opens its settings, logs no errors, makes no unexpected
// network request, saves nothing on a fresh run (defaults.js is exact) and
// writes no storage outside its own namespace.
//
// Player suite, index.html: Seasonal on first run, ?w= without persisting,
// keys switch and persist, a full cycle leaks nothing, ?panel=open, ?tier=low
// really scales and caps, and pause really stops frames.
//
// All network is intercepted: local files load, Bing gets fixtures, anything
// else fails the run. Screenshots land in dist/smoke/. CHROME_PATH picks the
// browser.

import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');
const WEB = pathToFileURL(join(ROOT, 'web')).href;
const SHOTS = join(ROOT, 'dist/smoke');
const RUN_MS = 2500;
const READY_MS = 10000;

// A 1x1 PNG standing in for Bing's photo.
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const BING_JSON = { images: [{ url: '/th?id=smoke-fixture.jpg', copyright: 'Smoke fixture (Test)', copyrightlink: 'https://www.bing.com/', startdate: '20261022' }] };

const sleep = ms => new Promise(r => setTimeout(r, ms));

function findChrome() {
    const candidates = [
        process.env.CHROME_PATH,
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];
    for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
        try { candidates.push(execFileSync('which', [name]).toString().trim()); } catch {}
    }
    const found = candidates.find(path => path && existsSync(path));
    if (!found) throw new Error('No Chrome found; set CHROME_PATH');
    return found;
}

async function launch() {
    const profile = mkdtempSync(join(tmpdir(), 'wallpapers-smoke-'));
    const args = ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
        '--no-first-run', '--no-default-browser-check', '--window-size=1280,800', '--hide-scrollbars',
        '--mute-audio', 'about:blank'];
    // Ubuntu 24.04 runners block the sandbox's user namespaces.
    if (process.env.CI) args.unshift('--no-sandbox');
    const chrome = spawn(findChrome(), args, { stdio: 'ignore' });
    const portFile = join(profile, 'DevToolsActivePort');
    for (let i = 0; i < 100 && !existsSync(portFile); i++) await sleep(100);
    const port = readFileSync(portFile, 'utf8').split('\n')[0];
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = pages.find(p => p.type === 'page');
    return { chrome, profile, cdp: await connect(page.webSocketDebuggerUrl) };
}

function connect(url) {
    return new Promise((resolveConnect, reject) => {
        const socket = new WebSocket(url);
        const pending = new Map();
        const listeners = new Map();
        let nextId = 1;
        const cdp = {
            send(method, params = {}) {
                const id = nextId++;
                socket.send(JSON.stringify({ id, method, params }));
                return new Promise((ok, fail) => pending.set(id, { ok, fail, method }));
            },
            on(method, fn) { listeners.set(method, fn); },
            close() { socket.close(); },
        };
        socket.onopen = () => resolveConnect(cdp);
        socket.onerror = reject;
        socket.onmessage = ({ data }) => {
            const message = JSON.parse(data);
            if (message.id && pending.has(message.id)) {
                const { ok, fail, method } = pending.get(message.id);
                pending.delete(message.id);
                message.error ? fail(new Error(`${method}: ${message.error.message}`)) : ok(message.result);
            } else if (listeners.has(message.method)) {
                listeners.get(message.method)(message.params);
            }
        };
    });
}

// ---- Page plumbing ----------------------------------------------------------

let cdp;
// Problems for the test in progress, and whether it may use Bing's fixtures.
let current = { network: false, problems: [] };
const record = text => current.problems.push(text.split('\n')[0].slice(0, 160));
// Default execution context of each frame, so the player suite can reach into
// the stage iframe, which file:// makes cross-origin to the page.
const contexts = new Map();

function listen() {
    cdp.on('Runtime.exceptionThrown', ({ exceptionDetails: d }) => record(`exception: ${d.exception?.description || d.text}`));
    cdp.on('Runtime.consoleAPICalled', ({ type, args }) => type === 'error' && record(`console.error: ${args.map(a => a.value ?? a.description).join(' ')}`));
    cdp.on('Log.entryAdded', ({ entry: e }) => e.level === 'error' && record(`log: ${e.text} ${e.url || ''}`));
    cdp.on('Runtime.executionContextCreated', ({ context }) => {
        if (context.auxData?.isDefault) contexts.set(context.auxData.frameId, context.id);
    });
    cdp.on('Fetch.requestPaused', ({ requestId, request }) => {
        const url = request.url;
        if (/^(file|data|blob):/.test(url) || url === 'about:blank') return cdp.send('Fetch.continueRequest', { requestId });
        const fulfil = (body, type) => cdp.send('Fetch.fulfillRequest', {
            requestId, responseCode: 200, body: body.toString('base64'),
            responseHeaders: [{ name: 'Content-Type', value: type }, { name: 'Access-Control-Allow-Origin', value: '*' }],
        });
        if (current.network && url.startsWith('https://www.bing.com/HPImageArchive')) return fulfil(Buffer.from(JSON.stringify(BING_JSON)), 'application/json');
        if (current.network && url.startsWith('https://www.bing.com/th')) return fulfil(PIXEL, 'image/png');
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

// Navigate with empty storage: clear it from a blank stage first.
async function fresh(url) {
    await cdp.send('Page.navigate', { url: `${WEB}/stage.html?w=blank` });
    await waitFor(() => evaluate('WP.stage?.ready'));
    await evaluate('localStorage.clear()');
    await cdp.send('Page.navigate', { url });
}

// ---- In-page probes -----------------------------------------------------------

// How much is drawn: distinct colour-and-alpha buckets across every canvas,
// sampled at 48x48. Alpha counts, so white snow on a transparent canvas
// registers by how much of it there is.
const DRAWN = `(() => {
    const probe = document.createElement('canvas');
    probe.width = probe.height = 48;
    const ctx = probe.getContext('2d', { willReadFrequently: true });
    let best = 0;
    for (const canvas of document.querySelectorAll('canvas')) {
        if (!canvas.width || !canvas.height || !canvas.isConnected) continue;
        ctx.clearRect(0, 0, 48, 48);
        try { ctx.drawImage(canvas, 0, 0, 48, 48); } catch { continue; }
        const data = ctx.getImageData(0, 0, 48, 48).data, colours = new Set();
        for (let i = 0; i < data.length; i += 4) if (data[i + 3]) colours.add((data[i] >> 4) << 12 | (data[i + 1] >> 4) << 8 | (data[i + 2] >> 4) << 4 | data[i + 3] >> 4);
        best = Math.max(best, colours.size);
    }
    return best;
})()`;

// A settings dialog: a fixed overlay with controls in it.
const DIALOG_OPEN = `[...document.querySelectorAll('body > *')].some(el => getComputedStyle(el).position === 'fixed' && el.querySelector('input, select, button'))`;

const OPEN_DIALOG = `(() => {
    const manager = WP.stage.manager;
    if (!manager.showConfigDialog) return 'none';
    const before = new Set(document.querySelectorAll('body > *'));
    manager.showConfigDialog();
    const added = [...document.querySelectorAll('body > *')].filter(el => !before.has(el));
    const dialog = added.find(el => getComputedStyle(el).position === 'fixed' && el.querySelector('input, select, button'));
    added.forEach(el => el.remove());
    return dialog ? 'ok' : 'missing';
})()`;

// Defaults are exact if a fresh run's config saves as nothing, and the only
// storage written is the wallpaper's own namespaced state.
const STORAGE = `(() => {
    const id = WP.host.id;
    const diff = WP.diffSettings(WP.settings.defaults(), WP.stage.manager.config || {});
    const foreign = Object.keys(localStorage).filter(key => !key.startsWith('wp:' + id + ':'));
    return { diff: diff && Object.keys(diff).filter(k => k !== 'configVersion'), foreign };
})()`;

// ---- Suites ---------------------------------------------------------------------

async function stage(id, entry) {
    current = { network: !!entry.network, problems: [] };
    const started = Date.now();
    await fresh(`${WEB}/stage.html?w=${id}`);
    const state = await waitFor(() => evaluate('WP.stage && (WP.stage.ready || WP.stage.error) && { ready: !!WP.stage.ready, error: WP.stage.error || null }'));
    const readyMs = Date.now() - started;
    if (!state) record(`not ready after ${READY_MS} ms`);
    else if (state.error) record(`boot: ${state.error}`);
    await sleep(RUN_MS);

    const ready = state?.ready;
    const drawn = entry.network
        ? (await evaluate('getComputedStyle(document.body).backgroundImage.includes("smoke-fixture") ? 99 : 0'))
        : await evaluate(DRAWN);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(SHOTS, `${id}.png`), Buffer.from(data, 'base64'));
    const storage = ready ? await evaluate(STORAGE) : null;
    const dialog = ready ? await evaluate(OPEN_DIALOG).catch(e => (record(`settings: ${e.message}`), 'error')) : 'skipped';

    if (drawn < 2 && id !== 'blank') record(entry.network ? 'background photo not shown' : 'nothing drawn');
    if (dialog === 'missing') record('settings dialog did not appear');
    if (storage?.diff?.length) record(`fresh run would save: ${storage.diff.join(', ')} (defaults.js out of step)`);
    if (storage?.foreign?.length) record(`wrote storage outside its namespace: ${storage.foreign.join(', ')}`);
    return { readyMs, drawn, dialog, problems: current.problems };
}

async function playerSuite(catalog) {
    let failed = 0;
    const check = async (name, fn) => {
        current = { network: false, problems: [] };
        let ok = false;
        try { ok = await fn(); } catch (error) { record(error.message); }
        if (!ok && !current.problems.length) record('check failed');
        if (current.problems.length) failed++;
        console.log(`  ${name.padEnd(52)} ${current.problems.length ? '✗' : '✓'}`);
        for (const problem of current.problems) console.log(`      ${problem}`);
    };
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

    await check('?panel=open opens settings inside the stage', async () => {
        await fresh(`${WEB}/index.html?w=rain&panel=open`);
        await playerReady();
        return !!await waitFor(() => inStage(DIALOG_OPEN), 3000);
    });

    await check('?tier=low lays out at half size and caps the frame rate', async () => {
        await fresh(`${WEB}/index.html?w=starfield&tier=low`);
        await playerReady();
        const cover = await evaluate("document.querySelector('iframe').getBoundingClientRect().width / innerWidth");
        const layout = await inStage('innerWidth') / await evaluate('innerWidth');
        // starfield is motion: 'slow', so Low caps it at 10 fps.
        const before = await inStage('WP.host.frames.count');
        await sleep(2000);
        const fps = (await inStage('WP.host.frames.count') - before) / 2;
        if (Math.abs(cover - 1) > 0.01) record(`stage covers ${cover.toFixed(2)} of the width`);
        if (Math.abs(layout - 0.5) > 0.02) record(`stage laid out at ${layout.toFixed(2)} of the width; expected 0.5`);
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

    return failed;
}

async function main(only) {
    mkdirSync(SHOTS, { recursive: true });
    const launched = await launch();
    cdp = launched.cdp;
    try {
        listen();
        for (const domain of ['Page', 'Runtime', 'Log']) await cdp.send(`${domain}.enable`);
        await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
        await cdp.send('Page.navigate', { url: `${WEB}/stage.html?w=blank` });
        await waitFor(() => evaluate('WP.stage?.ready'));
        const catalog = await evaluate('WP.catalog.map(e => ({ id: e.id, pseudo: !!e.pseudo, disabled: e.disabled || null, network: !!e.network }))');
        const ids = only.length ? only : catalog.filter(e => !e.pseudo).map(e => e.id);

        let failed = 0;
        console.log('stage              ready   drawn  settings  result');
        for (const id of ids) {
            const entry = catalog.find(e => e.id === id);
            if (!entry) throw new Error(`unknown wallpaper ${id}`);
            const r = await stage(id, entry);
            const verdict = !r.problems.length ? '✓' : entry.disabled ? `– disabled: ${entry.disabled}` : '✗';
            if (verdict === '✗') failed++;
            console.log(`${id.padEnd(18)} ${String(r.readyMs).padStart(5)}ms ${String(r.drawn).padStart(6)}  ${r.dialog.padEnd(8)}  ${verdict}`);
            if (verdict === '✗') for (const p of [...new Set(r.problems)]) console.log(`    ${p}`);
        }
        if (!only.length) {
            console.log('player');
            failed += await playerSuite(catalog);
        }
        console.log(failed ? `smoke ✗ ${failed} failed` : `smoke ✓ ${ids.length} stages${only.length ? '' : ' + player'} · screenshots in dist/smoke/`);
        return failed ? 1 : 0;
    } finally {
        cdp.close();
        launched.chrome.kill();
        await sleep(200);
        rmSync(launched.profile, { recursive: true, force: true });
    }
}

process.exitCode = await main(process.argv.slice(2));
