#!/usr/bin/env node
// Render web/icons/icon.svg to the PNG sizes the extension (16, 32, 48, 128)
// and the installable web app (192, 512) need, with transparent corners.
// The PNGs are committed: the extension can't use an SVG as its icon.
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch, sleep } from './chrome.mjs';

const ICONS = join(resolve(import.meta.dirname, '..'), 'web', 'icons');
const SIZES = [16, 32, 48, 128, 192, 512];

const { chrome, profile, cdp } = await launch({ width: 600, height: 600 });
try {
    await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    await cdp.send('Page.navigate', { url: pathToFileURL(join(ICONS, 'icon.svg')).href });
    await sleep(500);
    for (const size of SIZES) {
        // The SVG fills the viewport, so drawing it at each size is a resize.
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: size, height: size, deviceScaleFactor: 1, mobile: false });
        await sleep(150);
        const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
        const out = join(ICONS, `icon-${size}.png`);
        const image = Buffer.from(data, 'base64');
        let before = null;
        try { before = readFileSync(out); } catch {}
        writeFileSync(out, image);
        console.log(`icon-${size}.png ${(image.length / 1024).toFixed(1).padStart(5)} KB  ${!before ? 'new' : before.equals(image) ? 'unchanged' : 'changed'}`);
    }
} finally {
    cdp.close();
    chrome.kill();
    await sleep(200);
    rmSync(profile, { recursive: true, force: true });
}
