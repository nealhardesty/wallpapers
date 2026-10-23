#!/usr/bin/env node
// Package web/ for its hosts (SPEC §5). Only files git knows about (tracked,
// or new and not ignored) go out, so nothing local ships, such as a
// developer's bing.json, and everything that ships is what `make audit` saw.
//
//   node tools/build.mjs extension   dist/extension/ (load unpacked) and
//                                    dist/wallpapers-extension-<version>.zip
//   node tools/build.mjs site        dist/site/ for GitHub Pages, with a
//                                    fresh bing.json if Bing answers
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const target = process.argv[2];
if (!['extension', 'site'].includes(target)) throw new Error('usage: build.mjs extension|site');

const out = join(DIST, target);
rmSync(out, { recursive: true, force: true });
const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', 'web'], { cwd: ROOT })
    .toString().split('\0').filter(file => file && existsSync(join(ROOT, file)));
for (const file of files) {
    mkdirSync(dirname(join(out, file.slice(4))), { recursive: true });
    cpSync(join(ROOT, file), join(out, file.slice(4)));
}

if (target === 'extension') {
    const { version, icons, chrome_url_overrides } = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));
    for (const path of [...Object.values(icons), chrome_url_overrides.newtab]) {
        if (!existsSync(join(out, path))) throw new Error(`manifest.json names ${path}, which isn't there`);
    }
    const zip = join(DIST, `wallpapers-extension-${version}.zip`);
    rmSync(zip, { force: true });
    const run = spawnSync('zip', ['-qrX', zip, '.'], { cwd: out, stdio: 'inherit' });
    if (run.status !== 0) throw new Error('zip failed (is it installed?)');
    console.log(`extension ${version}: ${files.length} files in dist/extension/ and ${zip.slice(ROOT.length + 1)}`);
} else {
    const bing = spawnSync(process.execPath, [join(ROOT, 'tools/bing.mjs'), join(out, 'bing.json')], { stdio: 'inherit' });
    // Bing being down shouldn't stop a deploy; the wallpaper says what's missing.
    if (bing.status !== 0) console.warn('site: no bing.json this time; the Bing wallpaper will show its note');
    console.log(`site: ${files.length} files in dist/site/`);
}
