#!/usr/bin/env node
// Smoke test: boot every wallpaper in web/dev/harness.html in headless Chrome
// and check that it starts, draws, opens its settings and logs no errors.
//
//   node tools/smoke.mjs [id ...]
//
// Talks to Chrome over the DevTools protocol with Node's built-in WebSocket.
// All network is intercepted: local files load, Bing gets fixtures, anything
// else is blocked and reported. Screenshots land in dist/smoke/<id>.png.
// CHROME_PATH picks the browser.

import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');
const HARNESS = pathToFileURL(join(ROOT, 'web/dev/harness.html')).href;
const SHOTS = join(ROOT, 'dist/smoke');
const RUN_MS = 2500;
const READY_MS = 10000;

// A 1x1 PNG standing in for Bing's photo.
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const BING_JSON = { images: [{ url: '/th?id=smoke-fixture.jpg', copyright: 'Smoke fixture (Test)', copyrightlink: 'https://www.bing.com/', startdate: '20261022' }] };

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

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function evaluate(cdp, expression) {
    const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
    return result.value;
}

// In the page: how much is drawn, as distinct colours across every canvas
// sampled at 48x48 (a blank or single-colour canvas scores 0 or 1).
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
        for (let i = 0; i < data.length; i += 4) if (data[i + 3]) colours.add((data[i] >> 3) << 10 | (data[i + 1] >> 3) << 5 | data[i + 2] >> 3);
        best = Math.max(best, colours.size);
    }
    return best;
})()`;

const OPEN_DIALOG = `(() => {
    const before = new Set(document.querySelectorAll('body > *'));
    if (!harness.openConfig()) return 'none';
    const added = [...document.querySelectorAll('body > *')].filter(el => !before.has(el) && el.id !== 'chip');
    const dialog = added.find(el => getComputedStyle(el).position === 'fixed' && el.querySelector('input, select, button'));
    added.forEach(el => el.remove());
    return dialog ? 'ok' : 'missing';
})()`;

// The wallpaper under test; the request handler below consults it.
let current = { entry: {}, record: () => {} };

function interceptNetwork(cdp) {
    cdp.on('Fetch.requestPaused', ({ requestId, request }) => {
        const url = request.url;
        const { entry, record } = current;
        if (url.startsWith('file:') || url.startsWith('data:') || url.startsWith('blob:') || url === 'about:blank') {
            return cdp.send('Fetch.continueRequest', { requestId });
        }
        const fulfil = (body, type) => cdp.send('Fetch.fulfillRequest', {
            requestId, responseCode: 200, body: body.toString('base64'),
            responseHeaders: [{ name: 'Content-Type', value: type }, { name: 'Access-Control-Allow-Origin', value: '*' }],
        });
        if (entry.network && url.startsWith('https://www.bing.com/HPImageArchive')) return fulfil(Buffer.from(JSON.stringify(BING_JSON)), 'application/json');
        if (entry.network && url.startsWith('https://www.bing.com/th')) return fulfil(PIXEL, 'image/png');
        record(`network blocked: ${url}`);
        return cdp.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' });
    });
}

async function smoke(cdp, id, entry) {
    const problems = [];
    const record = text => problems.push(text.split('\n')[0].slice(0, 160));
    cdp.on('Runtime.exceptionThrown', ({ exceptionDetails: d }) => record(`exception: ${d.exception?.description || d.text}`));
    cdp.on('Runtime.consoleAPICalled', ({ type, args }) => type === 'error' && record(`console.error: ${args.map(a => a.value ?? a.description).join(' ')}`));
    cdp.on('Log.entryAdded', ({ entry: e }) => e.level === 'error' && record(`log: ${e.text} ${e.url || ''}`));
    current = { entry, record };

    const started = Date.now();
    await cdp.send('Page.navigate', { url: `${HARNESS}?w=${id}` });
    let ready = false;
    while (Date.now() - started < READY_MS) {
        await sleep(100);
        const state = await evaluate(cdp, 'window.harness && { ready: harness.ready, error: harness.error }').catch(() => null);
        if (state?.error) { record(`boot: ${state.error}`); break; }
        if (state?.ready) { ready = true; break; }
    }
    const readyMs = Date.now() - started;
    if (!ready && !problems.length) record(`not ready after ${READY_MS} ms`);
    await sleep(RUN_MS);

    const drawn = entry.network
        ? (await evaluate(cdp, 'getComputedStyle(document.body).backgroundImage.includes("smoke-fixture") ? 99 : 0'))
        : await evaluate(cdp, DRAWN);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(SHOTS, `${id}.png`), Buffer.from(data, 'base64'));
    const dialog = ready ? await evaluate(cdp, OPEN_DIALOG).catch(e => (record(`settings: ${e.message}`), 'error')) : 'skipped';

    if (drawn < 2) record(entry.network ? 'background photo not shown' : 'nothing drawn');
    if (dialog === 'missing') record('settings dialog did not appear');
    return { id, readyMs, drawn, dialog, problems };
}

async function main(only) {
    mkdirSync(SHOTS, { recursive: true });
    const { chrome, profile, cdp } = await launch();
    try {
        for (const domain of ['Page', 'Runtime', 'Log']) await cdp.send(`${domain}.enable`);
        interceptNetwork(cdp);
        await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
        await cdp.send('Page.navigate', { url: HARNESS });
        await sleep(500);
        const catalog = await evaluate(cdp, 'Object.fromEntries(Object.entries(harness.catalog).map(([id, e]) => [id, { disabled: e.disabled || null, network: !!e.network }]))');
        const ids = only.length ? only : Object.keys(catalog);

        let failed = 0;
        console.log('wallpaper          ready   drawn  settings  result');
        for (const id of ids) {
            const entry = catalog[id];
            if (!entry) throw new Error(`unknown wallpaper ${id}`);
            const r = await smoke(cdp, id, entry);
            const expected = entry.disabled && r.problems.length;
            const verdict = !r.problems.length ? '✓' : expected ? `– disabled: ${entry.disabled}` : '✗';
            if (verdict === '✗') failed++;
            console.log(`${id.padEnd(18)} ${String(r.readyMs).padStart(5)}ms ${String(r.drawn).padStart(6)}  ${r.dialog.padEnd(8)}  ${verdict}`);
            if (verdict === '✗') for (const p of [...new Set(r.problems)]) console.log(`    ${p}`);
        }
        // ?panel=open opens the settings on load.
        current = { entry: {}, record: () => {} };
        await cdp.send('Page.navigate', { url: `${HARNESS}?w=rain&panel=open` });
        await sleep(1500);
        const panelOpen = await evaluate(cdp, `[...document.querySelectorAll('body > *')].some(el => getComputedStyle(el).position === 'fixed' && el.querySelector('input'))`);
        console.log(`${'?panel=open'.padEnd(18)} ${panelOpen ? '✓' : '✗ settings not open on load'}`);
        if (!panelOpen) failed++;

        console.log(failed ? `smoke ✗ ${failed} of ${ids.length} failed` : `smoke ✓ ${ids.length} wallpapers · screenshots in dist/smoke/`);
        return failed ? 1 : 0;
    } finally {
        cdp.close();
        chrome.kill();
        await sleep(200);
        rmSync(profile, { recursive: true, force: true });
    }
}

process.exitCode = await main(process.argv.slice(2));
