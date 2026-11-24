#!/usr/bin/env node
// Wayfarer (SPEC §10.38, the eighth pass): how the four-legged things walk, on
// one sheet. Each row is one animal at one speed through one turn of its gait,
// seen from the side, drawn from the very triangles the wallpaper draws (the
// rig is posed here, in Node, and filled by a small z-buffer: no browser, no
// GPU, the same sheet every time). A foot on the ground is marked under it, so
// a foot that slides shows as a smear of marks and a planted one as a dot.
// The last rows are the traveller walking with a cat on the shoulder, from
// the side and from in front.
//
//   node tools/wayfarer-gait.mjs                         the usual cast
//   node tools/wayfarer-gait.mjs --kinds=deer,horse,cat  just these
//   node tools/wayfarer-gait.mjs --froude=0.1,0.6,3      at these speeds (Froude numbers: walk, trot, gallop)
//   make wayfarer-gait ARGS="--kinds=stag --frames=12"
//
//   --kinds=a,b      WayCompanions kinds (default: a deer, a horse, a cow, a stag, a bear, a fox, a dog, a cat)
//   --froude=a,b     speeds, as v² / (g × height at the shoulder)
//   --frames=8       frames to a row       --cell=200x150   pixels a frame
//   --far=1          the plain far rigs (WayActors.beast) instead of the near ones
//   --rider=0        leave out the traveller and the cat on the shoulder
// Writes dist/wayfarer-gait.png.

import { frame, sheet, way } from './wayfarer-raster.mjs';

const { L, A, P, K, Soup, Stack } = way;
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = /^--([a-z]+)(?:=(.*))?$/.exec(a); if (!m) fail(`not an option: ${a}`); return [m[1], m[2] ?? '1']; }));
function fail(message) { console.error(`wayfarer-gait: ${message}`); process.exit(1); }
const kinds = (args.kinds ?? 'deer,horse,cow,stag,grizzly,fox,dog,cat').split(',');
for (const k of kinds) if (!K.KINDS[k]) fail(`--kinds: no kind "${k}" (one of ${Object.keys(K.KINDS).join(', ')})`);
const froudes = (args.froude ?? '0.12,0.7,3').split(',').map(Number);
const frames = Math.max(2, Number(args.frames ?? 8)), [cw, ch] = (args.cell ?? '200x150').split('x').map(Number), far = args.far === '1', rider = args.rider !== '0';

// ---- The rows -----------------------------------------------------------------------------
const rows = [], soup = new Soup(1 << 16), st = new Stack();
for (const id of kinds) for (const fr of froudes) {
    const q = K.KINDS[id], size = q.size || 1, speed = Math.sqrt(fr * 9.8 * q.tall * size), stride = q.stride;
    // One turn of whichever gait carries the most weight at this speed (its length is the rig's own: see legsOf).
    const mix = L.gaitMix(q.gait, q.cat ? 'bound' : 'gallop', speed, q.tall * size).map(m => [...m]).sort((a, b) => b[1] - a[1]);
    K.quad(soup.clear(), st, id, 0, 0, 0, { yaw: 0, gait: 0, speed, moving: 1 });
    const cycle = q.bones.cycle[mix[0][0]] * size, cells = [], marks = [];
    for (let f = 0; f < frames; f++) {
        const z = cycle * f / frames, feet = [];
        if (far) {
            const beast = A.BEASTS[id] ? id : Object.values(L.WILD).find(k => k.rig === id && A.BEASTS[k.far])?.far || 'deer';          // (as WayLogic.WILD has it stand in)
            A.beast(soup.clear(), st, beast, 0, 0, z, { yaw: 0, gait: z / stride, stride, base: q.gait, speed, moving: 1, t: f * 0.1 });
            K.quad(new Soup(), st, id, 0, 0, z, { yaw: 0, gait: z / stride, speed, moving: 1, feet });
        } else K.quad(soup.clear(), st, id, 0, 0, z, { yaw: 0, gait: z / stride, speed, moving: 1, t: f * 0.1, feet });
        feet.forEach((ft, i) => { if (ft.toe[1] < 0.004) marks.push([ft.toe[0], 0, ft.toe[2], i % 2 === 0]); });
        const len = q.len * size, tall = q.tall * size;
        cells.push(frame(soup, cw, ch, 0, { w: len * 2.4, h: tall * 1.9, cz: z, y0: -0.05 * tall }, marks));
        // (The camera rides along with the animal; the marks stay where the feet were put down.)
    }
    rows.push({ label: `${id} ${mix[0][0]} ${speed.toFixed(1)} m/s`, cells });
}
if (rider) {
    // The traveller, walking, with a cat on the right shoulder: as wayfarer.js places her.
    const look = A.LOOKS.ranger, perchPack = [0.29, 0, 1.47];
    for (const [view, box] of [[0, { w: 1.2, h: 2.2, cz: 0, y0: 0.2 }], [Math.PI / 2, { w: 1.2, h: 2.2, cz: 0, y0: 0.2 }], [0.7, { w: 0.9, h: 0.75, cz: 0, y0: 1.15 }], [2.4, { w: 0.9, h: 0.75, cz: 0, y0: 1.15 }]]) {
        const cells = [];
        for (let f = 0; f < frames; f++) {
            const stride = f / frames, t = f * 0.25;
            soup.clear();
            P.person(soup, st, 0, 0, 0, look, { yaw: 0, stride, moving: 1, t, size: look.size || 1 });
            const up = perchPack[2] + 0.028 * Math.cos(stride * 12.566);
            K.pose('ibbie', soup, st, perchPack[0], up, perchPack[1], { yaw: 0, gait: 0, moving: 0, rest: 1, t, ride: 1, pitch: -0.12, sway: stride * 6.2832, swayK: 1 }, 0);
            cells.push(frame(soup, cw, ch, view, box, []));
        }
        rows.push({ label: `traveller with Ibbie, view ${view.toFixed(2)}`, cells });
    }
}

const file = sheet('wayfarer-gait.png', rows, cw, ch);
console.log(`wayfarer-gait: ${rows.length} rows of ${frames} (${rows.map(r => r.label).join('; ')}) → ${file}`);
