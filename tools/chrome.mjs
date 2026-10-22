// Headless Chrome over the DevTools protocol, with Node's built-in WebSocket
// and no dependencies. Shared by the smoke test and the thumbnail maker.
// CHROME_PATH picks the browser.

import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const sleep = ms => new Promise(r => setTimeout(r, ms));

export function findChrome() {
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

export async function launch({ width = 1280, height = 800 } = {}) {
    const profile = mkdtempSync(join(tmpdir(), 'wallpapers-smoke-'));
    const args = ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
        '--no-first-run', '--no-default-browser-check', `--window-size=${width},${height}`, '--hide-scrollbars',
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

export function connect(url) {
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
