#!/usr/bin/env node
// Wayfarer (SPEC §10.38): triangles a frame, shadow pass included, in the places the budget table measures, on each
// tier, from behind the traveller and from a 40 m orbit. It runs the real wallpaper in headless Chrome (which renders
// in software, so it counts triangles; it does not time frames), puts the walk in each place, waits for the land about
// the traveller to be whole, and takes the most drawn over a second and a half.
//
//   node tools/wayfarer-budget.mjs                       every tier, both cameras, every place
//   node tools/wayfarer-budget.mjs --tiers=high --places=village,grand-square
//   make wayfarer-budget ARGS="--cameras=follow"
//   --shots=1      also save what each looked like, as dist/wayfarer-budget/<tier>-<camera>-<place>.png
//
// Targets (the eighth pass, SPEC §10.38): High 800k, Medium 220k, Low 100k; a place over its tier's is marked OVER.
// (It reports; it does not fail: some of these spots were a little over on Medium and Low before the eighth pass.)

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch, sleep } from './chrome.mjs';

const ROOT = resolve(import.meta.dirname, '..'), WEB = pathToFileURL(join(ROOT, 'web')).href;
const TARGET = { high: 800000, medium: 220000, low: 100000 };
// Where each place is, as an expression on the manager's world: the z to stand at, from a leg that has it.
const PLACES = {
    'forest-road': "(() => { let l = w.leg(Math.floor(z / 360) + 1); while (l.biome !== 'forest' || l.radius) l = w.leg(l.i + 1); return l.zc + 70; })()",
    'deep-forest': "(() => { let l = w.leg(Math.floor(z / 360) + 1); while (l.biome !== 'deepwood' || l.radius) l = w.leg(l.i + 1); return l.zc + 70; })()",
    village: "(() => { let l = w.leg(Math.floor(z / 360) + 1); while (l.place !== 'village') l = w.leg(l.i + 1); return l.zc; })()",
    'grand-gate': "(() => { let l = w.leg(Math.floor(z / 360) + 1); while (!l.grand) l = w.leg(l.i + 1); return l.zc - WayLogic.GRAND.A - 34; })()",
    'grand-square': "(() => { let l = w.leg(Math.floor(z / 360) + 1); while (!l.grand) l = w.leg(l.i + 1); return l.zc; })()",
};
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = /^--([a-z]+)(?:=(.*))?$/.exec(a); if (!m) { console.error(`wayfarer-budget: not an option: ${a}`); process.exit(1); } return [m[1], m[2] ?? '1']; }));
const tiers = (args.tiers ?? 'high,medium,low').split(','), cameras = (args.cameras ?? 'follow,orbit').split(','), places = (args.places ?? Object.keys(PLACES).join(',')).split(',');
for (const p of places) if (!PLACES[p]) { console.error(`wayfarer-budget: no place "${p}" (${Object.keys(PLACES).join(', ')})`); process.exit(1); }

const { chrome, profile, cdp } = await launch({ width: 1280, height: 720 });
const rows = [];
let over = 0;
try {
    const errors = [];
    cdp.on('Runtime.exceptionThrown', p => errors.push(p.exceptionDetails.exception?.description || p.exceptionDetails.text));
    cdp.on('Runtime.consoleAPICalled', p => { if (p.type === 'error') errors.push(p.args.map(a => a.value ?? a.description).join(' ')); });
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    const evaluate = async expression => { const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
    const ready = async () => { for (let i = 0; i < 900; i++) { if (await evaluate('!!(window.WP && WP.stage && WP.stage.ready)').catch(() => false)) return; await sleep(100); } throw new Error(`the stage never came ready${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`); };
    for (const tier of tiers) for (const camera of cameras) {
        const settings = { configVersion: 2, time: 'day', weather: 'clear', camera, orbitMode: 'fixed', orbitAzimuth: 150, orbitElevation: 32, orbitDistance: 40 };
        await cdp.send('Page.navigate', { url: `${WEB}/stage.html?w=blank` });
        await ready();
        await evaluate(`localStorage.setItem('wp:wayfarer', ${JSON.stringify(JSON.stringify(settings))})`);
        await cdp.send('Page.navigate', { url: `${WEB}/stage.html?w=wayfarer&seed=7&tier=${tier}&thumb=1` });
        await ready();
        const row = { tier, camera };
        for (const place of places) {
            await evaluate(`(m => { const w = m.world, z = m.journey.z; m.journey.z = ${PLACES[place]}; m.journey.mode = 'walk'; m.party.forEach(p => { p.x = null; }); m.stream(true); m.snap = true; })(WP.stage.manager)`);
            const whole = "(() => { const m = WP.stage.manager, me = WayLogic.standing(m.journey, m.world), h = m.active.hole; return !!h && me.x >= h[0] && me.z >= h[1] && me.x < h[2] && me.z < h[3] && !m.queue?.length; })()";
            for (let i = 0; i < 600 && !await evaluate(whole); i++) await sleep(100);
            let most = 0;
            for (let i = 0; i < 6; i++) { await sleep(250); most = Math.max(most, await evaluate('WP.stage.manager.renderer.drawn.triangles')); }
            row[place] = most;
            if (args.shots) { const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }); mkdirSync(join(ROOT, 'dist/wayfarer-budget'), { recursive: true }); writeFileSync(join(ROOT, `dist/wayfarer-budget/${tier}-${camera}-${place}.png`), Buffer.from(data, 'base64')); }
            if (most > TARGET[tier]) over++;
            process.stdout.write(`\r${tier} ${camera} ${place}: ${(most / 1000).toFixed(0)}k          `);
        }
        rows.push(row);
    }
    process.stdout.write('\n');
} finally {
    cdp.close();
    chrome.kill();
    await sleep(300);
    rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
}
console.log(`| | ${places.join(' | ')} |\n|---|${places.map(() => '---').join('|')}|`);
for (const r of rows) console.log(`| ${r.tier} ${r.camera} (target ${TARGET[r.tier] / 1000}k) | ${places.map(p => `${(r[p] / 1000).toFixed(0)}k${r[p] > TARGET[r.tier] ? ' OVER' : ''}`).join(' | ')} |`);
if (over) console.log(`${over} over target`);
