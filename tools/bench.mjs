#!/usr/bin/env node
// make bench (SPEC §4.8, "Measuring it"): every wallpaper at every pinned
// tier, in the real player, at a phone's size and pixel density, with the
// CPU slowed 4×, as a stand-in for a mid-range phone.
//
//   node tools/bench.mjs                 everything (about 8 minutes)
//   node tools/bench.mjs fishtank quest  just these; the rest of the results stay
//   BENCH_SECONDS=10 node tools/bench.mjs
//
// For each run: frames per second, the p50 and p95 time of a frame's
// callbacks, and the main thread's busy share (Performance.getMetrics
// TaskDuration: everything, not just our callbacks). Budgets: under 25%
// busy on Low and 50% on Medium. Writes bench/results.json, and
// web/wallpapers/costs.js for the panel's ⚡ badges. Exits 1 on a miss.
// Not in CI: shared runners are too noisy to hold anyone to a number.

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch, sleep } from './chrome.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const WEB = pathToFileURL(join(ROOT, 'web')).href;
const RESULTS = join(ROOT, 'bench/results.json');
const COSTS = join(ROOT, 'web/wallpapers/costs.js');
const SECONDS = Number(process.env.BENCH_SECONDS) || 6;
const THROTTLE = 4;
const PHONE = { width: 412, height: 915, deviceScaleFactor: 2.625, mobile: true };
const BUDGET = { low: 25, medium: 50 };
const TIERS = ['low', 'medium', 'high'];
// ⚡ to ⚡⚡⚡, from the busy share at High: what a wallpaper asks of a phone
// at full quality, before Auto or a pinned tier holds it back.
const costOf = busy => busy < 10 ? 1 : busy < 30 ? 2 : 3;

const { chrome, profile, cdp } = await launch();
const contexts = new Map();
cdp.on('Runtime.executionContextCreated', ({ context }) => {
    if (context.auxData?.isDefault) contexts.set(context.auxData.frameId, context.id);
});
const evaluate = async (expression, contextId) => {
    const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, ...(contextId ? { contextId } : {}) });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
    return result.value;
};
async function inStage(expression) {
    const { frameTree } = await cdp.send('Page.getFrameTree');
    const frame = (frameTree.childFrames || []).map(child => child.frame).reverse().find(f => contexts.has(f.id));
    return evaluate(expression, frame && contexts.get(frame.id));
}
const taskSeconds = async () => (await cdp.send('Performance.getMetrics')).metrics.find(m => m.name === 'TaskDuration').value;
const percentile = (values, p) => { const s = [...values].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0; };

let results = existsSync(RESULTS) ? JSON.parse(readFileSync(RESULTS, 'utf8')).wallpapers : {};
let missed = 0;
try {
    for (const domain of ['Page', 'Runtime', 'Performance']) await cdp.send(`${domain}.enable`);
    await cdp.send('Emulation.setDeviceMetricsOverride', PHONE);
    await cdp.send('Page.navigate', { url: `${WEB}/stage.html?w=blank` });
    await sleep(500);
    const catalog = await evaluate('WP.catalog.filter(e => !e.pseudo && !e.disabled && e.id !== "blank").map(e => ({ id: e.id, network: !!e.network }))');
    const wanted = process.argv.slice(2);
    const ids = catalog.filter(e => !wanted.length || wanted.includes(e.id));
    if (!wanted.length) results = {};

    console.log(`bench: ${PHONE.width}×${PHONE.height} @${PHONE.deviceScaleFactor}x, CPU ${THROTTLE}× slower, ${SECONDS} s each\n`);
    console.log('wallpaper          tier     fps   p50 ms  p95 ms   busy');
    for (const { id, network } of ids) {
        results[id] = {};
        for (const tier of TIERS) {
            // Fresh settings, and no Auto memory: a pinned tier, measured as shipped.
            await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
            await cdp.send('Page.navigate', { url: `${WEB}/stage.html?w=blank` });
            await sleep(300);
            await evaluate("localStorage.clear(); localStorage.setItem('wp:hinted', 'true')");
            contexts.clear();
            await cdp.send('Page.navigate', { url: `${WEB}/index.html?w=${id}&tier=${tier}&seed=7` });
            for (let i = 0; i < 100 && !(await evaluate('WP.player?.stage?.ready').catch(() => false)); i++) await sleep(100);
            await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
            await sleep(1500);   // settle: the first frames build caches
            const start = { frames: await inStage('WP.host.frames.count'), task: await taskSeconds(), at: Date.now() };
            await sleep(SECONDS * 1000);
            const end = { frames: await inStage('WP.host.frames.count'), task: await taskSeconds(), at: Date.now() };
            const recent = (await inStage('WP.host.frames.recent')).filter(v => v !== null);
            const wall = (end.at - start.at) / 1000;
            const run = {
                fps: Math.round((end.frames - start.frames) / wall * 10) / 10,
                p50: Math.round(percentile(recent, 0.5) * 10) / 10,
                p95: Math.round(percentile(recent, 0.95) * 10) / 10,
                busy: Math.round((end.task - start.task) / wall * 1000) / 10,
            };
            results[id][tier] = run;
            const over = BUDGET[tier] !== undefined && run.busy > BUDGET[tier];
            if (over) missed++;
            console.log(`${(network ? `${id}*` : id).padEnd(18)} ${tier.padEnd(7)} ${String(run.fps).padStart(5)} ${run.p50.toFixed(1).padStart(8)} ${run.p95.toFixed(1).padStart(7)} ${`${run.busy.toFixed(1)}%`.padStart(7)}${over ? `  ✗ over ${BUDGET[tier]}%` : ''}`);
        }
    }
} finally {
    cdp.close();
    chrome.kill();
    await sleep(200);
    rmSync(profile, { recursive: true, force: true });
}

const sorted = Object.fromEntries(Object.keys(results).sort().map(id => [id, results[id]]));
writeFileSync(RESULTS, JSON.stringify({
    device: { ...PHONE, cpuThrottle: THROTTLE, seconds: SECONDS, browser: 'headless Chrome' },
    budgets: BUDGET, wallpapers: sorted,
}, null, 2) + '\n');
const costs = Object.fromEntries(Object.entries(sorted).filter(([, r]) => r.high).map(([id, r]) => [id, costOf(r.high.busy)]));
writeFileSync(COSTS, `// Generated by \`make bench\` (tools/bench.mjs); don't edit. How costly each
// wallpaper is on a phone at High, 1 to 3, shown as ⚡ badges in the panel.
WP.costs = ${JSON.stringify(costs, null, 4).replace(/"([a-z-]+)":/g, "'$1':")};
`);
console.log(`\n${missed ? `bench ✗ ${missed} over budget` : 'bench ✓ every wallpaper within budget'} · bench/results.json`);
process.exitCode = missed ? 1 : 0;
