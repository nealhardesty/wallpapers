#!/usr/bin/env node
// Open web/index.html (or a given page) in the default browser, unless it's
// already open in one: then that tab is brought to the front instead.
//
//   node tools/open.mjs                    web/index.html
//   node tools/open.mjs '?w=harvest'       with a query (a leading ? or #, or a page name)
//
// Finding an open tab is macOS-only (Chrome and Safari, through AppleScript,
// and only if the browser is already running, so it never launches one just
// to look). Elsewhere it simply opens the page.

import { execFileSync, spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const WEB = resolve(import.meta.dirname, '../web');
const arg = process.argv[2] || '';
const page = /^[?#]/.test(arg) || !arg ? `index.html${arg}` : arg;
const url = pathToFileURL(resolve(WEB, page.replace(/[?#].*/, ''))).href + (page.match(/[?#].*/) || [''])[0];
const base = url.replace(/[?#].*/, '');

const running = name => { try { execFileSync('pgrep', ['-x', name], { stdio: 'ignore' }); return true; } catch { return false; } };

// Focus an existing tab on this page; true if there was one.
function focusExisting() {
    if (process.platform !== 'darwin') return false;
    const scripts = {
        'Google Chrome': `tell application "Google Chrome"
            repeat with w in windows
                set i to 0
                repeat with t in tabs of w
                    set i to i + 1
                    if (URL of t) starts with "${base}" then
                        set active tab index of w to i
                        set index of w to 1
                        activate
                        return "yes"
                    end if
                end repeat
            end repeat
        end tell
        return "no"`,
        Safari: `tell application "Safari"
            repeat with w in windows
                repeat with t in tabs of w
                    if (URL of t) starts with "${base}" then
                        set current tab of w to t
                        set index of w to 1
                        activate
                        return "yes"
                    end if
                end repeat
            end repeat
        end tell
        return "no"`,
    };
    for (const [app, script] of Object.entries(scripts)) {
        if (!running(app)) continue;
        try {
            if (execFileSync('osascript', ['-e', script], { encoding: 'utf8', timeout: 5000 }).trim() === 'yes') {
                console.log(`open: already open in ${app}; brought to the front`);
                return true;
            }
        } catch { /* automation not allowed, or no windows: open it normally */ }
    }
    return false;
}

if (!focusExisting()) {
    const [cmd, args] = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
    console.log(`open: ${url}`);
}
