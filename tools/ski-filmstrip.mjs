#!/usr/bin/env node
// Fresh Tracks (SPEC §10.39) on one sheet: a turn, a stop or a jump as a row
// of frames, with the numbers that drive the pose plotted underneath, so the
// motion can be checked against physics without watching it (headless Chrome
// draws about a frame a second here).
//
//   node tools/ski-filmstrip.mjs                       two linked turns from behind
//   node tools/ski-filmstrip.mjs --scene=jump --view=side
//   make ski-filmstrip ARGS="--scene=turn --view=above"
//
//   --scene=turn|stop|jump|pipe|powder|lodge   what to catch (see SCENES below)
//   --view=behind|front|side|above             where the camera stands, from the rider
//   --who=lead|friend1|friend2|friend3         whose ride
//   --gear=ski|board                           what they are on (default: their setting)
//   --frames=12 --every=<steps> --cols=6 --cell=360x330 --seed=7 --time=day
//   --plot=lean,tilt,v                         what to plot (name:deg for radians shown in degrees)
//   --aim=course|travel                        the camera squares up to the piste (default) or to the rider's own velocity
//   --zoom=1                                   × the lens
//   --spray=0                                  no spray off the edges, when it hides the rider
//   --swing=3                                  turn, powder: the least half-width of turn (r.a, metres) that counts
//   --limit=1200                               seconds of riding to look through for the scene before giving up
//
// The page's own clock is stopped and the world stepped from here at 1/60 s,
// from a world seeded by --seed, so the same options give the same sheet.
// The page runs in thumb mode (?thumb=1): that is what keeps the wallpaper's
// GPU watch from shrinking the picture mid-run. Writes dist/ski-filmstrip-<scene>-<view>.png.

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch, sleep } from './chrome.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = pathToFileURL(join(ROOT, 'web')).href;

// What each scene rides on, the least swing that counts, and the steps kept
// before its start and after its end. The start and end themselves are in
// `film()` below (MARKS), since they run in the page.
const SCENES = {
    turn: { sections: ['groomer'], swing: 3, pre: 0, post: 0 },
    powder: { sections: ['powder'], swing: 2.5, pre: 0, post: 0 },
    stop: { sections: ['groomer', 'hut'], pre: 330, post: 45 },
    jump: { sections: ['groomer', 'park'], pre: 60, post: 60 },
    pipe: { sections: ['groomer', 'pipe'], pre: 20, post: 20 },
    lodge: { sections: ['groomer', 'lodge'], pre: 30, post: 90 },
};
const VIEWS = ['behind', 'front', 'side', 'above'];
const WHO = ['lead', 'friend1', 'friend2', 'friend3'];
// Rider fields, and three worked out here: travel (the way it is going),
// attack (heading less travel: the skis' angle to their own path) and speed
// over the ground. A field the rider does not have is skipped. (sink: how far the skis are down in the snow; lamNow: the
// length its turns have now, a left and a right; reach, a, turn, lenK and ampK can be asked for with --plot.)
const PLOT = ['lean', 'tilt', 'press', 'skid:deg', 'scrub', 'heading', 'face:deg', 'gaze:deg', 'plant', 'travel', 'attack', 'v', 'load', 'absorb', 'lift', 'sink', 'lamNow'];

const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = /^--([a-z]+)(?:=(.*))?$/.exec(a); if (!m) fail(`not an option: ${a} (options are --key=value)`); return [m[1], m[2] ?? '1']; }));
function fail(message) { console.error(`ski-filmstrip: ${message}`); process.exit(1); }
const pick = (key, list, fallback) => { const v = args[key] ?? fallback; if (!list.includes(v)) fail(`--${key}=${v}: one of ${list.join(', ')}`); return v; };
const count = (key, fallback, least = 1) => { const v = Number(args[key] ?? fallback); if (!(v >= least)) fail(`--${key}=${args[key]}: a number, ${least} or more`); return v; };

const scene = pick('scene', Object.keys(SCENES), 'turn'), view = pick('view', VIEWS, 'behind'), who = pick('who', WHO, 'lead');
const gear = args.gear === undefined ? null : pick('gear', ['ski', 'board']);
const cell = /^(\d+)x(\d+)$/.exec(args.cell ?? '360x330') || fail(`--cell=${args.cell}: like 360x330`);
const options = {
    scene, view, gear, who: WHO.indexOf(who), whoName: who, ...SCENES[scene],
    aim: pick('aim', ['course', 'travel'], 'course'),
    frames: Math.round(count('frames', 12, 2)), every: args.every === undefined ? 0 : Math.round(count('every', 1)), cols: Math.round(count('cols', 6)),
    cellW: Number(cell[1]), cellH: Number(cell[2]), seed: Math.round(count('seed', 7, 0)), zoom: count('zoom', 1, 0.1),
    swing: count('swing', SCENES[scene].swing ?? 0, 0), limit: Math.round(count('limit', 1200) * 60),
    spray: (args.spray ?? '1') !== '0',
    plot: (args.plot ?? PLOT.join(',')).split(',').filter(Boolean),
};
const settings = {
    configVersion: 1, sections: options.sections, time: args.time ?? 'day', weather: 'clear', camera: 'follow',
    friends: Math.max(2, options.who), others: 0, wildlife: false, wipeouts: false, zoom: 1,
    ...(gear ? { [`${who}Gear`]: gear } : {}),
};

// ---- In the page ------------------------------------------------------------------------------
// Everything below runs in the wallpaper's page (it is sent as text), so it can
// use nothing from this file but its argument.
function film(o) {
    const m = WP.stage.manager, L = SkiLogic, DT = 1 / 60, TAU = Math.PI * 2, DEG = 180 / Math.PI;
    if (m.flat) throw new Error('no WebGL in this Chrome: the filmstrip needs the 3D view');
    // The wallpaper's own clock, stopped: nothing moves but what is stepped here.
    cancelAnimationFrame(m.animationId);
    m.frame = m.update = m.watchGpu = () => {};

    // The same world every time, from the seed.
    const fresh = () => {
        for (const chunk of m.chunks.values()) m.renderer.release(chunk);
        m.chunks.clear();
        m.trails.clear();
        m.world = L.world(o.seed, m.worldConfig(), { steep: m.config.steep, sections: m.config.sections });
        m.cam = L.camera();
        m.dress();
        m.pool.n = 0;
        m.kc = null;
        return m.world;
    };
    const rider = W => W.riders[o.who] || (() => { throw new Error(`no ${o.whoName} on the hill`); })();

    // Where each scene starts and ends: begin(r, was, W) on the step it starts,
    // end(r, was, W, since) on the step it ends, spoil(...) if it went wrong in
    // between and the search goes on. `was` is the rider a step ago; `since`
    // is what begin left (steps so far in since.n).
    const riding = r => !r.air && !r.fall && !r.afoot && !r.pipe && !r.rail;
    const near = (W, r, type) => W.course.find(r.z).type === type || W.course.find(r.z + 70).type === type;
    const MARKS = {
        // Two whole turns, from an edge change (lean through zero) with a good swing.
        turn: {
            begin: (r, was) => riding(r) && r.a > o.swing && r.v > 6 && !(r.stop > 0.2) && was.lean !== 0 && was.lean * r.lean <= 0 && { phase: r.phase },
            end: (r, was, W, since) => r.phase - since.phase >= 2 * TAU,
            spoil: (r, was) => !riding(r) || r.stop > 0.2 || r.phase < was.phase || r.a < o.swing * 0.7,
        },
        // Braking to a halt at a hut: the span ends as the rider stops, and starts `pre` steps before.
        stop: {
            begin: (r, was, W) => was.v >= 0.3 && r.v < 0.3 && riding(r) && near(W, r, 'hut') && {},
            end: () => true,
            spoil: () => false,
        },
        // Off a kicker in the park (not a rail), half a second or more in the air, landed on its feet.
        jump: {
            begin: (r, was, W) => r.air && !was.air && !r.fall && !r.pipe && W.course.find(r.z).type === 'park' && {},
            end: (r, was, W, since) => !r.air && since.n >= 30,
            spoil: (r, was, W, since) => !!r.fall || !r.air && since.n < 30,
        },
        // From one lip of the half-pipe to the other and back.
        pipe: {
            begin: (r, was) => r.pipe && was.pipe && r.pipe !== was.pipe && { flips: 0 },
            end: (r, was, W, since) => (since.flips += r.pipe !== was.pipe ? 1 : 0) >= 2,
            spoil: r => !r.pipe || !!r.fall,
        },
        // Stepping out of the skis at the lodge, to sitting down.
        lodge: {
            begin: (r, was) => r.afoot && !was.afoot && {},
            end: r => !!(r.afoot && r.afoot.seated),
            spoil: r => !r.afoot,
        },
    };
    MARKS.powder = MARKS.turn;

    // A dry run to find the scene: nothing drawn, no tracks.
    const found = (() => {
        const W = fresh(), r = rider(W), mark = MARKS[o.scene], was = {};
        let since = null, from = 0, most = 0;
        for (let i = 1; i <= o.limit; i++) {
            Object.assign(was, { lean: r.lean, v: r.v, air: r.air, pipe: r.pipe, afoot: !!r.afoot, phase: r.phase });
            L.worldStep(W, DT, null);
            W.events.length = 0;
            W.course.trim(W.riders[0].z);
            if (riding(r)) most = Math.max(most, r.a);
            if (since) {
                since.n = i - from;
                if (mark.spoil(r, was, W, since)) since = null;
                else if (mark.end(r, was, W, since)) return { from, to: i };
            }
            if (!since && (since = mark.begin(r, was, W) || null)) {
                from = i;
                since.n = 0;
                if (mark.end === MARKS.stop.end) return { from, to: i };
            }
        }
        throw new Error(`no '${o.scene}' for ${o.whoName} in ${Math.round(o.limit / 60)} s of riding (seed ${o.seed})`
            + (o.swing ? `; the widest swing seen was r.a = ${most.toFixed(2)} m against --swing=${o.swing}` : '') + '. Try another --seed, or a longer --limit.');
    })();
    const first = Math.max(0, found.from - o.pre), span = found.to + o.post - first;
    const every = o.every || Math.max(1, Math.ceil(span / (o.frames - 1))), steps = Math.max(span, (o.frames - 1) * every);

    // ---- The camera, placed from the rider.
    const TAN = { behind: 0.34, front: 0.34, side: 0.3, above: 0.3 };
    const place = (W, r) => {
        const C = W.course, cam = m.cam, s = C.find(r.z), moving = Math.hypot(r.vx, r.vz) > 1;
        const dir = o.aim === 'travel' && moving ? Math.atan2(r.vx, r.vz) : Math.atan(C.slope(r.z)), sh = Math.sin(dir), ch = Math.cos(dir);
        const hips = r.y + 0.95;
        // Side on from the rider's right; at a hut or a lodge, from the piste.
        const side = s.T.stop && s.side ? -s.side : 1;
        const at = { behind: [-5 * sh, 1.6, -5 * ch], front: [5.5 * sh, 1.1, 5.5 * ch], side: [side * 6 * ch, 1, -side * 6 * sh], above: [0, 9, 0] }[o.view];
        cam.x = r.x + at[0];
        cam.z = r.z + at[2];
        cam.y = Math.max(r.y + at[1], C.height(cam.x, cam.z) + 0.5);
        if (o.view === 'above') {
            // Straight down, downhill to the top of the picture, a little of the track behind kept in.
            cam.x -= 0.6 * sh;
            cam.z -= 0.6 * ch;
            cam.heading = dir;
            cam.pitch = -Math.PI / 2 + 1e-3;
        } else {
            const dx = r.x - cam.x, dy = hips - cam.y, dz = r.z - cam.z;
            cam.heading = Math.atan2(dx, dz);
            cam.pitch = Math.atan2(dy, Math.hypot(dx, dz));
        }
        cam.roll = 0;
        cam.tan = TAN[o.view] / o.zoom;
        cam.cut = true;          // the trees are sorted afresh for every picture
    };

    // ---- What is written down every step.
    const turns = a => a - TAU * Math.round(a / TAU);
    const DERIVED = {
        travel: r => Math.hypot(r.vx, r.vz) > 0.5 ? Math.atan2(r.vx, r.vz) : null,
        attack: r => Math.hypot(r.vx, r.vz) > 0.5 && !r.afoot ? turns(r.heading - Math.atan2(r.vx, r.vz)) : null,
        speed: r => Math.hypot(r.vx, r.vy || 0, r.vz),
    };
    const ANGLES = ['heading', 'travel', 'attack', 'tilt', 'pitch', 'bank', 'twist', 'psi'];
    const fields = o.plot.map(spec => {
        const [name, unit] = spec.split(':');
        return { name, deg: unit ? unit === 'deg' : ANGLES.includes(name), get: DERIVED[name] || (r => r[name]), data: [], min: Infinity, max: -Infinity, some: false };
    });
    const air = [];
    const sample = r => {
        for (const f of fields) {
            let v = f.get(r);
            v = typeof v === 'number' && Number.isFinite(v) ? (f.deg ? v * DEG : v) : null;
            f.data.push(v);
            if (v !== null) { f.some = true; f.min = Math.min(f.min, v); f.max = Math.max(f.max, v); }
        }
        air.push(r.air ? 1 : 0);
    };

    // ---- The real run: up to the scene's start as the wallpaper would, tracks laid, spray thrown.
    const W = fresh(), r = rider(W);
    const step = () => {
        L.worldStep(W, DT, null);
        m.seconds += DT;
        m.trace();
        W.course.trim(W.riders[0].z);
        m.answer();
        place(W, r);
        if (o.spray) m.spray(DT);
    };
    for (let i = 0; i < first; i++) step();
    place(W, r);
    sample(r);

    // ---- The sheet.
    const PAD = 16, HEAD = 46, LINE = 17, COL = 116, FONT = '13px sans-serif', BOLD = 'bold 13px sans-serif';
    const perLine = Math.max(1, Math.floor((o.cellW - 8) / COL));
    const plotted = () => fields.filter(f => f.some);
    const sheet = document.createElement('canvas'), g = sheet.getContext('2d');
    const rows = Math.ceil(o.frames / o.cols);
    let textH = 0, plotTop = 0;
    const PLOT_H = 74, PLOT_GAP = 12, LEFT = 150;
    const shots = [];
    const number = (f, v) => v === null ? '–' : f.deg ? `${v.toFixed(Math.abs(v) < 10 ? 1 : 0)}°` : v.toFixed(Math.abs(v) < 100 ? 2 : 0);

    return {
        info: { ...found, first, span, every, steps },
        // One frame: on `every` steps (but for the first), then the picture, copied into its cell before this task ends.
        shoot(n) {
            if (n > 0) for (let i = 0; i < every; i++) { step(); sample(r); }
            if (n === 0) {
                // The sheet is sized once the first sample says which fields there are.
                textH = (1 + Math.ceil(plotted().length / perLine)) * LINE + 10;
                plotTop = HEAD + rows * (o.cellH + textH) + 14;
                sheet.width = PAD * 2 + o.cols * o.cellW;
                sheet.height = plotTop + plotted().length * (PLOT_H + PLOT_GAP) + 34;
                g.fillStyle = '#fff';
                g.fillRect(0, 0, sheet.width, sheet.height);
            }
            place(W, r);
            m.kc = null;             // every chunk about the camera, now
            m.land();
            m.draw();
            const x = PAD + (n % o.cols) * o.cellW, y = HEAD + Math.floor(n / o.cols) * (o.cellH + textH), c = m.canvas;
            g.imageSmoothingQuality = 'high';
            g.drawImage(c, 0, 0, c.width, c.height, x, y, o.cellW - 2, o.cellH);
            const at = (fields[0].data.length - 1);
            shots.push(at);
            g.textBaseline = 'top';
            g.fillStyle = '#111';
            g.font = BOLD;
            const state = r.fall ? `fall: ${r.fall.phase}` : r.afoot ? (r.afoot.seated ? 'seated' : 'on foot') : r.air ? 'in the air' : r.pipe ? 'in the pipe' : r.stop > 0.5 ? 'stopped' : '';
            g.fillText(`${n + 1}   t = ${(at * DT).toFixed(2)} s   ${state}`, x + 2, y + o.cellH + 5);
            g.font = FONT;
            plotted().forEach((f, i) => {
                g.fillStyle = '#555';
                const tx = x + 2 + (i % perLine) * COL, ty = y + o.cellH + 5 + LINE * (1 + Math.floor(i / perLine));
                g.fillText(f.name, tx, ty);
                g.fillStyle = '#111';
                g.fillText(number(f, f.data[at]), tx + 56, ty);
            });
            return { size: [c.width, c.height], lost: !!m.renderer.lost, moving: m.moving.n / 3 };
        },
        // The plots under the strip, and the whole sheet as a PNG.
        finish() {
            const list = plotted(), n = fields[0].data.length, x0 = PAD + LEFT, x1 = sheet.width - PAD - 8, X = i => x0 + (x1 - x0) * i / Math.max(1, n - 1);
            g.textBaseline = 'top';
            g.fillStyle = '#111';
            g.font = 'bold 16px sans-serif';
            g.fillText(`Fresh Tracks · ${o.scene} · from ${o.view} · ${o.whoName} on ${r.kind === 'board' ? 'a board' : 'skis'} · seed ${o.seed}`, PAD, 8);
            g.font = FONT;
            g.fillStyle = '#555';
            g.fillText(`${o.frames} frames, ${every} steps (${(every * DT).toFixed(3)} s) apart, from ${(first * DT).toFixed(1)} s into the run · plots: one point a step (1/60 s), ticks at the frames, grey where airborne · ${C_NOTE}`, PAD, 28);
            list.forEach((f, k) => {
                const top = plotTop + k * (PLOT_H + PLOT_GAP), flat = f.max - f.min < 1e-9, pad = flat ? 1 : (f.max - f.min) * 0.08, lo = f.min - pad, hi = f.max + pad;
                const Y = v => top + PLOT_H * (1 - (v - lo) / (hi - lo));
                g.fillStyle = '#f5f6f8';
                g.fillRect(x0, top, x1 - x0, PLOT_H);
                // Airborne spans.
                g.fillStyle = '#dfe3ea';
                for (let i = 0; i < n; i++) if (air[i]) g.fillRect(X(i - 0.5), top, X(1) - X(0) + 0.5, PLOT_H);
                // The frames.
                g.strokeStyle = '#b9bfca';
                g.lineWidth = 1;
                g.fillStyle = '#777';
                g.font = '11px sans-serif';
                shots.forEach((at, j) => {
                    const x = Math.round(X(at)) + 0.5;
                    g.beginPath(); g.moveTo(x, top); g.lineTo(x, top + PLOT_H); g.stroke();
                    if (k === 0) { g.textAlign = 'center'; g.fillText(String(j + 1), x, top - 13); g.textAlign = 'left'; }
                });
                if (lo < 0 && hi > 0) { g.strokeStyle = '#444'; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(x0, Math.round(Y(0)) + 0.5); g.lineTo(x1, Math.round(Y(0)) + 0.5); g.stroke(); g.setLineDash([]); }
                g.strokeStyle = '#1f5fbf';
                g.lineWidth = 2;
                g.lineJoin = 'round';
                g.beginPath();
                let pen = false;
                for (let i = 0; i < n; i++) {
                    const v = f.data[i];
                    if (v === null) { pen = false; continue; }
                    pen ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v));
                    pen = true;
                }
                g.stroke();
                g.fillStyle = '#111';
                g.font = 'bold 14px sans-serif';
                g.fillText(f.name + (f.deg ? ' (°)' : ''), PAD, top + PLOT_H / 2 - 9);
                g.font = '12px sans-serif';
                g.fillStyle = '#555';
                g.textAlign = 'right';
                g.fillText(number(f, f.max), x0 - 6, top);
                g.fillText(number(f, f.min), x0 - 6, top + PLOT_H - 13);
                g.textAlign = 'left';
            });
            // Seconds along the bottom.
            const base = plotTop + list.length * (PLOT_H + PLOT_GAP) - PLOT_GAP + 4, secs = (n - 1) * DT, tick = secs > 12 ? 2 : secs > 5 ? 1 : 0.5;
            g.fillStyle = '#555';
            g.font = '12px sans-serif';
            g.textAlign = 'center';
            for (let t = 0; t <= secs + 1e-6; t += tick) g.fillText(`${t} s`, X(t / DT), base);
            g.textAlign = 'left';
            return {
                png: sheet.toDataURL('image/png'), size: [sheet.width, sheet.height],
                fields: list.map(f => ({ name: f.name, deg: f.deg, min: f.min, max: f.max })),
                missing: fields.filter(f => !f.some).map(f => f.name),
            };
        },
    };
}

// ---- Here ---------------------------------------------------------------------------------------
mkdirSync(tmpdir(), { recursive: true });
const { chrome, profile, cdp } = await launch({ width: options.cellW * 2, height: options.cellH * 2 });
let failed = null;
try {
    const errors = [];
    cdp.on('Runtime.exceptionThrown', p => errors.push(p.exceptionDetails.exception?.description || p.exceptionDetails.text));
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    // Each picture is drawn at twice its cell and scaled down into it.
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: options.cellW * 2, height: options.cellH * 2, deviceScaleFactor: 1, mobile: false });
    const evaluate = async expression => {
        const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description || r.exceptionDetails.text).split('\n')[0].replace(/^Error: /, ''));
        return r.result.value;
    };
    const ready = async () => {
        for (let i = 0; i < 600; i++) {
            if (await evaluate('!!(window.WP && WP.stage && WP.stage.ready)').catch(() => false)) return;
            await sleep(100);
        }
        throw new Error(`the stage never came ready${errors.length ? ': ' + errors[0] : ''}`);
    };
    await cdp.send('Page.navigate', { url: `${WEB}/stage.html?w=blank` });
    await ready();
    await evaluate(`localStorage.setItem('wp:ski-run', ${JSON.stringify(JSON.stringify(settings))})`);
    await cdp.send('Page.navigate', { url: `${WEB}/stage.html?w=ski-run&seed=${options.seed}&thumb=1` });
    await ready();
    const note = 'the camera squares up to ' + (options.aim === 'travel' ? "the rider's velocity" : 'the piste');
    const info = await evaluate(`(() => { const C_NOTE = ${JSON.stringify(note)}; window.__film = (${film})(${JSON.stringify(options)}); return window.__film.info; })()`);
    console.log(`${scene}: found at step ${info.from} to ${info.to} (${(info.from / 60).toFixed(1)} s to ${(info.to / 60).toFixed(1)} s); ${options.frames} frames every ${info.every} steps from step ${info.first}`);
    for (let n = 0; n < options.frames; n++) {
        const shot = await evaluate(`window.__film.shoot(${n})`);
        if (shot.lost) throw new Error('the WebGL context was lost');
        process.stdout.write(`\rframe ${n + 1}/${options.frames} (${shot.size.join('x')})  `);
    }
    process.stdout.write('\n');
    const done = await evaluate('window.__film.finish()');
    const out = join(ROOT, 'dist', `ski-filmstrip-${scene}-${view}.png`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, Buffer.from(done.png.split(',')[1], 'base64'));
    const show = (f, v) => f.deg ? `${v.toFixed(1)}°` : String(Number(v.toFixed(3)));
    console.log(`${out} (${done.size.join('x')})`);
    console.log(done.fields.map(f => `${f.name} ${show(f, f.min)}..${show(f, f.max)}`).join(', ') + (done.missing.length ? ` (not on the rider: ${done.missing.join(', ')})` : ''));
    if (errors.length) console.log(`page errors: ${errors.slice(0, 3).join(' | ')}`);
} catch (e) {
    failed = e;
} finally {
    cdp.close();
    chrome.kill();
    await sleep(300);
    rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
}
if (failed) fail(failed.message);
