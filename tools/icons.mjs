#!/usr/bin/env node
// Render web/icons/icon.svg to the PNG sizes the extension (16, 32, 48, 128),
// the installable web app (192, 512) and the Android launcher (48 to 192, by
// screen density) need, with transparent corners. The PNGs are committed:
// neither the extension nor Android can use an SVG as its icon.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch, sleep } from './chrome.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const ICONS = join(ROOT, 'web', 'icons');
const RES = join(ROOT, 'android/app/src/main/res');
const OUTPUTS = [
    ...[16, 32, 48, 128, 192, 512].map(size => ({ size, out: join(ICONS, `icon-${size}.png`) })),
    ...Object.entries({ mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 })
        .map(([density, size]) => ({ size, out: join(RES, `mipmap-${density}`, 'ic_launcher.png') })),
];

const { chrome, profile, cdp } = await launch({ width: 600, height: 600 });
try {
    await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    await cdp.send('Page.navigate', { url: pathToFileURL(join(ICONS, 'icon.svg')).href });
    await sleep(500);
    for (const { size, out } of OUTPUTS) {
        // The SVG fills the viewport, so drawing it at each size is a resize.
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: size, height: size, deviceScaleFactor: 1, mobile: false });
        await sleep(150);
        const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
        mkdirSync(dirname(out), { recursive: true });
        const image = Buffer.from(data, 'base64');
        let before = null;
        try { before = readFileSync(out); } catch {}
        writeFileSync(out, image);
        console.log(`${relative(ROOT, out).padEnd(58)} ${(image.length / 1024).toFixed(1).padStart(5)} KB  ${!before ? 'new' : before.equals(image) ? 'unchanged' : 'changed'}`);
    }
} finally {
    cdp.close();
    chrome.kill();
    await sleep(200);
    rmSync(profile, { recursive: true, force: true });
}
