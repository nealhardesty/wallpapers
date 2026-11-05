#!/usr/bin/env node
// Render web/icons/icon.svg to the PNG sizes the extension (16, 32, 48, 128),
// the installable web app (192, 512) and the Android launcher (48 to 192, by
// screen density) need, with transparent corners, and the Windows app's
// app.ico (16 to 256, PNG-compressed). They're committed: neither the
// extension, Android nor Windows can use an SVG as its icon.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch, sleep } from './chrome.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const ICONS = join(ROOT, 'web', 'icons');
const RES = join(ROOT, 'android/app/src/main/res');
const ICO = join(ROOT, 'windows/Wallpapers/app.ico');
const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 256];

// An ICO of PNGs: a 6-byte header, a 16-byte entry per image, then the PNGs.
// Width and height 0 mean 256.
function ico(images) {
    const header = Buffer.alloc(6 + 16 * images.length);
    header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
    let offset = header.length;
    images.forEach(({ size, png }, i) => {
        const at = 6 + 16 * i;
        header.writeUInt8(size >= 256 ? 0 : size, at); header.writeUInt8(size >= 256 ? 0 : size, at + 1);
        header.writeUInt16LE(1, at + 4); header.writeUInt16LE(32, at + 6);
        header.writeUInt32LE(png.length, at + 8); header.writeUInt32LE(offset, at + 12);
        offset += png.length;
    });
    return Buffer.concat([header, ...images.map(image => image.png)]);
}

function report(out, image) {
    let before = null;
    try { before = readFileSync(out); } catch {}
    writeFileSync(out, image);
    console.log(`${relative(ROOT, out).padEnd(58)} ${(image.length / 1024).toFixed(1).padStart(5)} KB  ${!before ? 'new' : before.equals(image) ? 'unchanged' : 'changed'}`);
}
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
    // The SVG fills the viewport, so drawing it at each size is a resize.
    const render = async size => {
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: size, height: size, deviceScaleFactor: 1, mobile: false });
        await sleep(150);
        const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
        return Buffer.from(data, 'base64');
    };
    for (const { size, out } of OUTPUTS) {
        const image = await render(size);
        mkdirSync(dirname(out), { recursive: true });
        report(out, image);
    }
    const images = [];
    for (const size of ICO_SIZES) images.push({ size, png: await render(size) });
    report(ICO, ico(images));
} finally {
    cdp.close();
    chrome.kill();
    await sleep(200);
    rmSync(profile, { recursive: true, force: true });
}
