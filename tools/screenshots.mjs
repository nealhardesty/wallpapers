#!/usr/bin/env node
// The README's screenshots, in headless Chrome from the real pages: the
// panel on a desktop, and as a bottom sheet on a phone. Saved as WebP in
// docs/. Like thumbnails, re-renders differ slightly, so commit them on
// purpose.
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch, sleep } from './chrome.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const WEB = pathToFileURL(join(ROOT, 'web')).href;
const SHOTS = [
    { name: 'panel', url: 'index.html?w=fireplace&panel=open', width: 1280, height: 800, scale: 1, mobile: false },
    { name: 'phone', url: 'index.html?w=fishtank&panel=open&host=android', width: 390, height: 844, scale: 2, mobile: true },
    { name: 'quest', url: 'index.html?w=quest', width: 1280, height: 800, scale: 1, mobile: false, settle: 8000,
        settings: { configVersion: 1, story: false } },
];

const { chrome, profile, cdp } = await launch();
try {
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    for (const shot of SHOTS) {
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: shot.width, height: shot.height, deviceScaleFactor: shot.scale, mobile: shot.mobile });
        // Fresh settings (plus the shot's own), and no first-run hint.
        const id = new URLSearchParams(shot.url.split('?')[1]).get('w');
        await cdp.send('Page.navigate', { url: `${WEB}/stage.html?w=blank` });
        await sleep(300);
        await cdp.send('Runtime.evaluate', { expression: `localStorage.clear(); localStorage.setItem('wp:hinted', 'true');${shot.settings ? `localStorage.setItem('wp:${id}', ${JSON.stringify(JSON.stringify(shot.settings))})` : ''}` });
        await cdp.send('Page.navigate', { url: `${WEB}/${shot.url}` });
        await sleep(shot.settle ?? 5000);
        const { data } = await cdp.send('Page.captureScreenshot', { format: 'webp', quality: 80 });
        const out = join(ROOT, 'docs', `${shot.name}.webp`);
        const image = Buffer.from(data, 'base64');
        let before = null;
        try { before = readFileSync(out); } catch {}
        writeFileSync(out, image);
        console.log(`${shot.name.padEnd(8)} ${(image.length / 1024).toFixed(0).padStart(4)} KB  ${!before ? 'new' : before.equals(image) ? 'unchanged' : 'changed'}`);
    }
} finally {
    cdp.close();
    chrome.kill();
    await sleep(200);
    rmSync(profile, { recursive: true, force: true });
}
