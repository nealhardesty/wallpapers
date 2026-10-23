#!/usr/bin/env node
// make android-bench (SPEC §4.8, "Measuring it"): every wallpaper at every
// tier on a real device (or an emulator, for a dry run), as the live
// wallpaper on the home screen. It drives the wallpaper's own WebView over
// the DevTools protocol (debug builds allow it; see Web.kt), so nothing in
// the app needs a test mode.
//
// Before: install a debug build (make android-install), set it as the
// wallpaper, unlock the phone. For battery numbers, unplug USB charging or
// use wireless adb: this script also tells batterystats the battery is
// unplugged, and resets that at the end.
//
//   node tools/android-bench.mjs                 everything, 60 s each
//   node tools/android-bench.mjs fishtank snow   just these
//   ANDROID_BENCH_SECONDS=600 ...                SPEC's 10 minutes, for real mAh
//
// Per run: frames per second and frame cost from the page, CPU share of the
// app plus its WebView renderer (from /proc), and batterystats' estimate of
// the app's drain in mAh per hour. Writes bench/android.json.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { connect, sleep } from './chrome.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, 'bench/android.json');
const ADB = process.env.ADB || 'adb';
const APP = 'com.roadwaffle.wallpapers';
const SECONDS = Number(process.env.ANDROID_BENCH_SECONDS) || 60;
const PORT = 9339;
const TIERS = ['low', 'medium', 'high'];

const adb = (...args) => execFileSync(ADB, args, { encoding: 'utf8' }).trim();
const shell = command => adb('shell', command);

// CPU ticks (1/100 s) used so far by the app and any WebView renderer.
function ticks(pids) {
    let total = 0;
    for (const pid of pids) {
        const stat = shell(`cat /proc/${pid}/stat 2>/dev/null || true`);
        const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
        if (fields.length > 13) total += Number(fields[11]) + Number(fields[12]);
    }
    return total;
}

function pids() {
    const app = shell(`pidof ${APP} || true`).split(/\s+/).filter(Boolean);
    const renderers = shell('ps -A -o PID,NAME | grep -E "sandboxed_process|webview" || true')
        .split('\n').map(line => line.trim().split(/\s+/)[0]).filter(pid => /^\d+$/.test(pid));
    return [...app, ...renderers];
}

// batterystats' estimate for our uid, in mAh, since the last reset.
function drained() {
    const uid = shell(`dumpsys package ${APP} | grep -m1 userId= || true`).match(/userId=(\d+)/)?.[1];
    if (!uid) return null;
    const app = `u0a${Number(uid) - 10000}`;
    const line = shell(`dumpsys batterystats --charged ${APP} | grep -m1 "UID ${app}:\\|Uid ${app}:" || true`);
    const mAh = line.match(/:\s*([\d.]+)/)?.[1];
    return mAh ? Number(mAh) : null;
}

async function wallpaperPage() {
    const pid = shell(`pidof ${APP} || true`).split(/\s+/)[0];
    if (!pid) throw new Error(`${APP} isn't running: install it (make android-install) and set it as the wallpaper`);
    adb('forward', `tcp:${PORT}`, `localabstract:webview_devtools_remote_${pid}`);
    const pages = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    // The live wallpaper's page, not the settings screen's (panel=open).
    const page = pages.find(p => p.type === 'page' && p.url.includes('host=android') && !p.url.includes('panel=open'));
    if (!page) throw new Error('the live wallpaper page isn\'t running: set Wallpapers as the wallpaper, then go to the home screen');
    return connect(page.webSocketDebuggerUrl);
}

const cdp = await wallpaperPage();
const evaluate = async expression => (await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;
const results = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')).wallpapers : {};
const device = {
    model: shell('getprop ro.product.model'),
    android: shell('getprop ro.build.version.release'),
    emulator: shell('getprop ro.kernel.qemu') === '1',
    seconds: SECONDS,
};
const before = await evaluate('JSON.stringify({ current: localStorage.getItem("wp:current"), performance: localStorage.getItem("wp:performance") })');

try {
    shell('input keyevent KEYCODE_HOME');
    shell('dumpsys battery unplug');
    const ids = (await evaluate('WP.catalog.filter(e => !e.pseudo && !e.disabled && e.id !== "blank").map(e => e.id)'))
        .filter(id => !process.argv.slice(2).length || process.argv.slice(2).includes(id));
    console.log(`android-bench: ${device.model}, Android ${device.android}${device.emulator ? ' (emulator: battery numbers are meaningless)' : ''}, ${SECONDS} s each\n`);
    console.log('wallpaper          tier     fps    ms   cpu %   mAh/h');
    for (const id of ids) {
        results[id] = {};
        for (const tier of TIERS) {
            await evaluate(`WP.player.setMode('${tier}'); WP.player.show('${id}', { persist: true })`);
            await sleep(4000);
            shell('dumpsys batterystats --reset');
            const watched = pids();
            const start = { ticks: ticks(watched), at: Date.now() };
            const samples = [];
            for (let s = 0; s < SECONDS; s++) {
                await sleep(1000);
                const stats = await evaluate('WP.player.stats');
                if (stats) samples.push(stats);
            }
            const wall = (Date.now() - start.at) / 1000;
            const mean = key => samples.reduce((sum, s) => sum + s[key], 0) / (samples.length || 1);
            const mAh = drained();
            const run = {
                fps: Math.round(mean('fps') * 10) / 10,
                ms: Math.round(mean('ms') * 10) / 10,
                cpu: Math.round((ticks(watched) - start.ticks) / wall * 10) / 10,
                mAhPerHour: mAh === null ? null : Math.round(mAh * 3600 / wall * 10) / 10,
            };
            results[id][tier] = run;
            console.log(`${id.padEnd(18)} ${tier.padEnd(7)} ${String(run.fps).padStart(5)} ${run.ms.toFixed(1).padStart(5)} ${run.cpu.toFixed(1).padStart(7)} ${run.mAhPerHour === null ? '      –' : run.mAhPerHour.toFixed(1).padStart(7)}`);
        }
    }
} finally {
    shell('dumpsys battery reset');
    // Put the wallpaper back the way it was.
    await evaluate(`(() => { const b = ${before}; for (const [k, key] of [['current', 'wp:current'], ['performance', 'wp:performance']]) b[k] === null ? localStorage.removeItem(key) : localStorage.setItem(key, b[k]); location.reload(); })()`).catch(() => {});
    cdp.close();
    adb('forward', '--remove', `tcp:${PORT}`);
}

writeFileSync(OUT, JSON.stringify({ device, wallpapers: Object.fromEntries(Object.keys(results).sort().map(id => [id, results[id]])) }, null, 2) + '\n');
console.log('\nandroid-bench: bench/android.json');
