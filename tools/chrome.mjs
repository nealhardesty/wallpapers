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

// extension: a folder to load as an unpacked extension; its id comes back.
export async function launch({ width = 1280, height = 800, extension = null } = {}) {
    const profile = mkdtempSync(join(tmpdir(), 'wallpapers-smoke-'));
    const args = ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
        '--no-first-run', '--no-default-browser-check', `--window-size=${width},${height}`, '--hide-scrollbars',
        '--mute-audio', 'about:blank'];
    // Ubuntu 24.04 runners block the sandbox's user namespaces.
    if (process.env.CI) args.unshift('--no-sandbox');
    if (extension) args.unshift('--remote-debugging-pipe', '--enable-unsafe-extension-debugging');
    const chrome = spawn(findChrome(), args, { stdio: extension ? ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] : 'ignore' });
    const portFile = join(profile, 'DevToolsActivePort');
    for (let i = 0; i < 300 && !existsSync(portFile); i++) await sleep(100);   // CI runners can take 10 s+
    const port = readFileSync(portFile, 'utf8').split('\n')[0];
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = pages.find(p => p.type === 'page');
    const extensionId = extension ? await loadExtension(chrome, extension) : null;
    return { chrome, profile, extensionId, cdp: await connect(page.webSocketDebuggerUrl) };
}

// Chrome 137+ ignores --load-extension, and Extensions.loadUnpacked answers
// only on the pipe transport: NUL-terminated JSON on fds 3 (in) and 4 (out).
function loadExtension(chrome, path) {
    const [, , , input, output] = chrome.stdio;
    return new Promise((ok, fail) => {
        let buffer = '';
        output.on('data', chunk => {
            buffer += chunk;
            const end = buffer.indexOf('\0');
            if (end < 0) return;
            const message = JSON.parse(buffer.slice(0, end));
            output.removeAllListeners('data');
            message.error ? fail(new Error(`Extensions.loadUnpacked: ${message.error.message}`)) : ok(message.result.id);
        });
        input.write(JSON.stringify({ id: 1, method: 'Extensions.loadUnpacked', params: { path } }) + '\0');
    });
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
