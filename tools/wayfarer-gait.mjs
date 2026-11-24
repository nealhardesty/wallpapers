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

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

const ROOT = resolve(import.meta.dirname, '..'), DIR = join(ROOT, 'web/wallpapers/wayfarer');
const FILES = ['way-logic.js', 'way-models.js', 'way-detail.js', 'way-actors.js', 'way-people.js', 'way-companions.js'];
const { L, A, P, K, Soup, Stack } = new Function(`${FILES.map(f => readFileSync(join(DIR, f), 'utf8')).join('\n')}\nreturn { L: WayLogic, A: WayActors, P: WayPeople, K: WayCompanions, Soup: WaySoup, Stack: WayStack };`)();

const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = /^--([a-z]+)(?:=(.*))?$/.exec(a); if (!m) fail(`not an option: ${a}`); return [m[1], m[2] ?? '1']; }));
function fail(message) { console.error(`wayfarer-gait: ${message}`); process.exit(1); }
const kinds = (args.kinds ?? 'deer,horse,cow,stag,grizzly,fox,dog,cat').split(',');
for (const k of kinds) if (!K.KINDS[k]) fail(`--kinds: no kind "${k}" (one of ${Object.keys(K.KINDS).join(', ')})`);
const froudes = (args.froude ?? '0.12,0.7,3').split(',').map(Number);
const frames = Math.max(2, Number(args.frames ?? 8)), [cw, ch] = (args.cell ?? '200x150').split('x').map(Number), far = args.far === '1', rider = args.rider !== '0';

// ---- A small rasteriser ---------------------------------------------------------------------
// Orthographic, from `view` (a yaw: 0 is the subject's right side, π/2 in front of it), lit from above and in front.
function frame(soup, view, box, marks) {
    const W = cw, H = ch, rgb = new Uint8Array(W * H * 3), depth = new Float32Array(W * H).fill(Infinity);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const k = (y * W + x) * 3, s = y / H; rgb[k] = 196 + 30 * s; rgb[k + 1] = 214 + 20 * s; rgb[k + 2] = 236; }
    const c = Math.cos(view), s = Math.sin(view), scale = Math.min(W / (box.w), H / (box.h));
    const px = (x, y, z) => [W / 2 + (z * c - x * s - box.cz) * scale, H - 14 - (y - box.y0) * scale, -(x * c + z * s)];
    const ground = H - 14 - (0 - box.y0) * scale;
    for (let y = Math.max(0, Math.ceil(ground)); y < H; y++) for (let x = 0; x < W; x++) { const k = (y * W + x) * 3; rgb[k] = 128; rgb[k + 1] = 150; rgb[k + 2] = 96; }
    const F = soup.F, N = new Int8Array(soup.buf), B = soup.B, light = [0.35, 0.8, 0.48];
    for (let t = 0; t < soup.n; t += 3) {
        const v = [0, 1, 2].map(i => px(F[(t + i) * 6], F[(t + i) * 6 + 1], F[(t + i) * 6 + 2]));
        const area = (v[1][0] - v[0][0]) * (v[2][1] - v[0][1]) - (v[2][0] - v[0][0]) * (v[1][1] - v[0][1]);
        if (Math.abs(area) < 1e-9) continue;
        const b = t * 24, nx = N[b + 12] / 127, ny = N[b + 13] / 127, nz = N[b + 14] / 127;
        const lx = nx * c + nz * s, lz = nz * c - nx * s, lam = 0.45 + 0.55 * Math.abs(lx * light[0] + ny * light[1] + -lz * light[2]);
        const col = [B[b + 16] * lam, B[b + 17] * lam, B[b + 18] * lam].map(q => Math.min(255, q));
        const x0 = Math.max(0, Math.floor(Math.min(v[0][0], v[1][0], v[2][0]))), x1 = Math.min(W - 1, Math.ceil(Math.max(v[0][0], v[1][0], v[2][0])));
        const y0 = Math.max(0, Math.floor(Math.min(v[0][1], v[1][1], v[2][1]))), y1 = Math.min(H - 1, Math.ceil(Math.max(v[0][1], v[1][1], v[2][1])));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            const w0 = ((v[1][0] - x) * (v[2][1] - y) - (v[2][0] - x) * (v[1][1] - y)) / area, w1 = ((v[2][0] - x) * (v[0][1] - y) - (v[0][0] - x) * (v[2][1] - y)) / area, w2 = 1 - w0 - w1;
            if (w0 < 0 || w1 < 0 || w2 < 0) continue;
            const d = w0 * v[0][2] + w1 * v[1][2] + w2 * v[2][2], k = y * W + x;
            if (d >= depth[k]) continue;
            depth[k] = d; rgb[k * 3] = col[0]; rgb[k * 3 + 1] = col[1]; rgb[k * 3 + 2] = col[2];
        }
    }
    // Where each foot touched the ground in this turn so far: red on the near side, orange on the far.
    for (const m of marks) {
        const [x, y] = px(m[0], 0, m[2]);
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const X = Math.round(x + dx), Y = Math.round(ground + 4 + (m[3] ? 5 : 0) + dy); if (X >= 0 && X < W && Y >= 0 && Y < H) { const k = (Y * W + X) * 3; rgb[k] = 220; rgb[k + 1] = m[3] ? 140 : 40; rgb[k + 2] = 30; } }
    }
    return rgb;
}

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
            const beast = A.BEASTS[id] ? id : 'deer';
            A.beast(soup.clear(), st, beast, 0, 0, z, { yaw: 0, gait: z / stride, stride, base: q.gait, speed, moving: 1, t: f * 0.1 });
            K.quad(new Soup(), st, id, 0, 0, z, { yaw: 0, gait: z / stride, speed, moving: 1, feet });
        } else K.quad(soup.clear(), st, id, 0, 0, z, { yaw: 0, gait: z / stride, speed, moving: 1, t: f * 0.1, feet });
        feet.forEach((ft, i) => { if (ft.toe[1] < 0.004) marks.push([ft.toe[0], 0, ft.toe[2], i % 2 === 0]); });
        const len = q.len * size, tall = q.tall * size;
        cells.push(frame(soup, 0, { w: len * 2.4, h: tall * 1.9, cz: z, y0: -0.05 * tall }, marks));
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
            cells.push(frame(soup, view, box, []));
        }
        rows.push({ label: `traveller with Ibbie, view ${view.toFixed(2)}`, cells });
    }
}

// ---- The sheet, as a PNG --------------------------------------------------------------------
const W = cw * frames, H = ch * rows.length, img = Buffer.alloc((W * 3 + 1) * H);
rows.forEach((row, r) => row.cells.forEach((cell, f) => {
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const o = (r * ch + y) * (W * 3 + 1) + 1 + (f * cw + x) * 3, k = (y * cw + x) * 3; img[o] = cell[k]; img[o + 1] = cell[k + 1]; img[o + 2] = cell[k + 2]; }
    for (let y = 0; y < ch; y++) { const o = (r * ch + y) * (W * 3 + 1) + 1 + f * cw * 3; img[o] = img[o + 1] = img[o + 2] = 90; }
}));
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4), body = Buffer.concat([Buffer.from(type), data]), sum = Buffer.alloc(4); len.writeUInt32BE(data.length); sum.writeUInt32BE(crc(body)); return Buffer.concat([len, body, sum]); };
const head = Buffer.alloc(13); head.writeUInt32BE(W, 0); head.writeUInt32BE(H, 4); head[8] = 8; head[9] = 2;
mkdirSync(join(ROOT, 'dist'), { recursive: true });
const file = join(ROOT, 'dist/wayfarer-gait.png');
writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(img)), chunk('IEND', Buffer.alloc(0))]));
console.log(`wayfarer-gait: ${rows.length} rows of ${frames} (${rows.map(r => r.label).join('; ')}) → ${file}`);
