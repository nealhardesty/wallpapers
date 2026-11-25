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
    neko: { configVersion: 2, cats: 5, coat: 'assorted', hat: 'assorted', size: 128 },
    fireflies: { configVersion: 2, glowSize: 12, brightness: 1.2 },
    snow: { configVersion: 1, treeCount: 14, accumulationRate: 0.4 },
    satellites: { configVersion: 1, facing: 'east' },
    girih: { configVersion: 1, baseTiling: '3.12.12', scale: 340 },
    'stained-glass': { configVersion: 1, light: 'afternoon' },
    orrery: { configVersion: 1, view: 'tilted', drift: false, showInfo: false, showLabels: false, planetSize: 1.4 },
    // Moofy's grin under the tree, Ras at the ornament, Butters belly-up.
    'cat-ornament': { configVersion: 2, cats: ['moofy', 'ras', 'butters'], inRoom: 3, catSize: 1.2 },
    // Big bulbs to read at thumbnail size; the last one still dark.
    'last-bulb': { configVersion: 2, size: 1.6, sag: 0.7, roomLight: 0.25 },
    matrix: { configVersion: 2, intro: false },
    'cherry-blossoms': { configVersion: 2, petalCount: 240, gusts: 0 },
    // One big pane, well frosted, the tree glowing through.
    frost: { configVersion: 1, window: 'single', coverage: 0.8, frameColour: 'red' },
    // A bit bigger, so the tree, the presents and the train read in a tile.
    'small-christmas': { configVersion: 2, treeSize: 'medium', pixelSize: 1.5 },
    // A summer morning on a fair day, a little bigger so the town reads in a tile.
    'sky-island': { configVersion: 2, weather: 'fair', islandSize: 1.2 },
    // A clear dawn, the long shadows out, a little higher for the view.
    'ice-patrol': { configVersion: 1, time: 'dawn', weather: 'clear', clearance: 40 },
    // An autumn evening, the village's chimneys smoking ahead.
    wayfarer: { configVersion: 2, time: 'dusk', weather: 'fair', season: 'autumn' },
    // A clear morning, a little closer in, so the rider and the trees read in a tile.
    'ski-run': { configVersion: 1, time: 'day', weather: 'clear', zoom: 1.2 },
    // An evening under a full moon, a little bigger, so the lit town reads in a tile.
    'christmas-village': { configVersion: 1, sky: 'night', moonPhase: 'full', scale: 1.3, horizon: 0.36 },
    // The paintings' hour, with the town out.
    'painted-village': { configVersion: 1, sky: 'dusk', snowfall: 0.6 },
    // Dusk, the line of torches halfway down, a few more of them so the ribbon reads in a tile.
    torchlight: { configVersion: 1, sky: 'dusk', torches: 36, spacing: 7, snowfall: 0.4 },
    // A winter morning, the great window's panes laid across the floor in sun; the lamps not yet out.
    'reading-room': { configVersion: 1, time: 'live', lamps: 'always' },
};
// URL parameters for a better picture: satellites as its sample station
// passes overhead before dawn, weather's sample at a golden dusk (thumb mode never fetches, so it's the sample),
// World Clock near the June solstice, Europe in its long evening; the Orrery tilted, on a fixed night.
const PARAMS = { baseball: '&date=2026-06-20T18:40&seed=7', sumo: '&date=2026-06-20T14:00&seed=7', 'sky-island': '&date=2026-06-20T11:00', satellites: '&date=2026-10-14T04:47:15', 'pixel-room': '&date=2026-10-22T18:20', 'rainy-window': '&date=2026-10-22T21:00', harvest: '&date=2026-11-20T15:50', neko: '&date=2026-06-10T12:00', weather: '&date=2026-11-05T17:50', 'world-clock': '&date=2026-06-21T19:30:00Z', orrery: '&date=2026-11-05T21:00', 'christmas-village': '&date=2026-12-20T19:30&seed=7', 'painted-village': '&date=2026-12-20T17:00&seed=7', torchlight: '&date=2026-12-20T17:00&seed=7' };
SETTLE_MS.fireworks = 2600;
SETTLE_MS.harvest = 4000;
SETTLE_MS['sky-island'] = 3000;
SETTLE_MS['painted-village'] = 9000;   // it paints itself: wait for the last stroke
SETTLE_MS.torchlight = 9000;           // the same
SETTLE_MS['reading-room'] = 12000;     // the same, and a few more strokes
PARAMS['reading-room'] = '&date=2026-12-10T10:30&seed=7';
SETTLE_MS.sumo = 2600;            // out of the crouch and into the bout
SETTLE_MS['ice-patrol'] = 9000;    // headless Chrome draws its WebGL in software: a frame takes a second or two
SETTLE_MS.wayfarer = 9000;         // the same: a few frames, so the smoke is up and the camera has settled
SETTLE_MS['ski-run'] = 12000;      // the same, with a few hundred thousand triangles of trees
SETTLE_MS['snow-globe'] = 6000;    // it paints itself, and the snow is still coming down
OVERRIDES['snow-globe'] = { configVersion: 1, cat: 'harry', scene: 'cottage' };     // the same cat and scene whatever the date

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
