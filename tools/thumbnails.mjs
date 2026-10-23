#!/usr/bin/env node
// Make the panel's thumbnails (SPEC §4.7): each wallpaper rendered in
// headless Chrome at 1280x800 with a fixed seed, left to settle, and saved as
// a 320x200 WebP at web/wallpapers/<id>/thumb.webp. They're committed, so
// they work offline, from disk and on Android. Regenerating is deliberate:
//
//   node tools/thumbnails.mjs            every wallpaper
//   node tools/thumbnails.mjs snow rain  just these
//
// Reports which images changed, so a commit only carries real changes.

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch, sleep } from './chrome.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const WEB = pathToFileURL(join(ROOT, 'web')).href;
const SEED = 7;

// How long each wallpaper needs to look like itself, and settings that make
// a better picture (they apply to this render only: thumb mode never saves).
const SETTLE_MS = { 'wiki-pond': 5000, lighthouse: 4500, snow: 7000, leaves: 3000, rain: 4000, fireplace: 4000, halloween: 4000, advent: 4000, quest: 5000, fishtank: 4000 };
const OVERRIDES = {
    quest: { configVersion: 1, story: false },
    neko: { configVersion: 2, size: 128, coat: 'orange' },
    fireflies: { configVersion: 2, glowSize: 12, brightness: 1.2 },
    snow: { configVersion: 1, treeCount: 14, accumulationRate: 0.4 },
    satellites: { configVersion: 1, facing: 'east' },
    girih: { configVersion: 1, baseTiling: '3.12.12', scale: 340 },
    'stained-glass': { configVersion: 1, light: 'afternoon' },
};
// URL parameters for a better picture: satellites as its sample station
// passes overhead before dawn (thumb mode never fetches, so it's the sample).
const PARAMS = { satellites: '&date=2026-10-14T04:47:15', 'pixel-room': '&date=2026-10-22T18:20', 'rainy-window': '&date=2026-10-22T21:00' };
SETTLE_MS.fireworks = 2600;

const { chrome, profile, cdp } = await launch({ width: 1280, height: 800 });
try {
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    const evaluate = async expression => (await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value;
    await cdp.send('Page.navigate', { url: `${WEB}/stage.html?w=blank` });
    await sleep(500);
    const catalog = await evaluate('WP.catalog.filter(e => !e.pseudo && !e.disabled && (!e.network || e.offline) && e.id !== "blank").map(e => e.id)');
    const ids = process.argv.slice(2).length ? process.argv.slice(2) : catalog;

    for (const id of ids) {
        await cdp.send('Page.navigate', { url: `${WEB}/stage.html?w=blank` });
        await sleep(300);
        await evaluate(`localStorage.clear(); ${OVERRIDES[id] ? `localStorage.setItem('wp:${id}', ${JSON.stringify(JSON.stringify(OVERRIDES[id]))})` : ''}`);
        await cdp.send('Page.navigate', { url: `${WEB}/stage.html?w=${id}&seed=${SEED}&thumb=1${PARAMS[id] || ''}` });
        await sleep(SETTLE_MS[id] ?? 3000);
        const { data } = await cdp.send('Page.captureScreenshot', {
            format: 'webp', quality: 82, clip: { x: 0, y: 0, width: 1280, height: 800, scale: 0.25 },
        });
        const out = join(ROOT, 'web/wallpapers', id, 'thumb.webp');
        const image = Buffer.from(data, 'base64');
        const before = existsSync(out) ? readFileSync(out) : null;
        writeFileSync(out, image);
        console.log(`${id.padEnd(16)} ${(image.length / 1024).toFixed(1).padStart(5)} KB  ${!before ? 'new' : before.equals(image) ? 'unchanged' : 'changed'}`);
    }
} finally {
    cdp.close();
    chrome.kill();
    await sleep(200);
    rmSync(profile, { recursive: true, force: true });
}
