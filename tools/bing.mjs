#!/usr/bin/env node
// Write web/bing.json: Bing's last eight images of the day, so the Bing
// wallpaper works on any http(s) host without a CORS proxy (SPEC §4.6).
// Keeps only what the wallpaper uses: image path, credit, credit link, date.
// GitHub Pages runs this daily; locally, `make bing-json` before `make serve`.
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const OUT = join(resolve(import.meta.dirname, '..'), 'web', 'bing.json');
const response = await fetch('https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=8&mkt=en-US');
if (!response.ok) throw new Error(`Bing answered ${response.status}`);
const { images } = await response.json();
if (!Array.isArray(images) || !images.length) throw new Error('Bing sent no images');

const kept = images.map(({ url, copyright, copyrightlink, startdate }) => ({ url, copyright, copyrightlink, startdate }));
for (const image of kept) {
    if (!/^\/th\?id=/.test(image.url) || !/^\d{8}$/.test(image.startdate)) throw new Error(`unexpected image entry: ${JSON.stringify(image)}`);
}
writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString(), images: kept }, null, 2) + '\n');
console.log(`bing.json: ${kept.length} images, ${kept.at(-1).startdate}–${kept[0].startdate}`);
