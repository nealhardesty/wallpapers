// Wayfarer's sheets (tools/wayfarer-gait.mjs, tools/wayfarer-models.mjs): the wallpaper's own code loaded in Node,
// a small z-buffer that fills its triangles (orthographic, Lambert-lit: enough to judge shapes and motion, not the
// shaders' look), and a PNG writer, so a sheet needs no browser and comes out the same every time.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

export const ROOT = resolve(import.meta.dirname, '..');
const DIR = join(ROOT, 'web/wallpapers/wayfarer'), FILES = ['way-logic.js', 'way-models.js', 'way-detail.js', 'way-actors.js', 'way-people.js', 'way-companions.js'];
export const way = new Function(`${FILES.map(f => readFileSync(join(DIR, f), 'utf8')).join('\n')}\nreturn { L: WayLogic, M: WayModels, D: WayDetail, A: WayActors, P: WayPeople, K: WayCompanions, Soup: WaySoup, Stack: WayStack };`)();

// A cell of cw × ch pixels of `soup`, from `view` (a yaw: 0 is the subject's right side, π/2 in front of it), framing
// box { w, h (metres), cz (the middle, along z), y0 (the foot) }, with ground below 0 and `marks` ([x, 0, z, far side?])
// on it; `pitch` looks down from above.
export function frame(soup, cw, ch, view, box, marks = [], pitch = 0) {
    const W = cw, H = ch, rgb = new Uint8Array(W * H * 3), depth = new Float32Array(W * H).fill(Infinity);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const k = (y * W + x) * 3, s = y / H; rgb[k] = 196 + 30 * s; rgb[k + 1] = 214 + 20 * s; rgb[k + 2] = 236; }
    const c = Math.cos(view), s = Math.sin(view), cp = Math.cos(pitch), sp = Math.sin(pitch), scale = Math.min(W / box.w, H / box.h);
    const px = (x, y, z) => { const sx = z * c - x * s - box.cz, d = -(x * c + z * s), yy = (y - box.y0) * cp + d * sp; return [W / 2 + sx * scale, H - 14 - yy * scale, d * cp - (y - box.y0) * sp]; };
    const ground = H - 14 - (0 - box.y0) * scale;
    if (!pitch) for (let y = Math.max(0, Math.ceil(ground)); y < H; y++) for (let x = 0; x < W; x++) { const k = (y * W + x) * 3; rgb[k] = 128; rgb[k + 1] = 150; rgb[k + 2] = 96; }
    const F = soup.F, N = new Int8Array(soup.buf), B = soup.B, light = [0.35, 0.8, 0.48];
    for (let t = 0; t < soup.n; t += 3) {
        const v = [0, 1, 2].map(i => px(F[(t + i) * 6], F[(t + i) * 6 + 1], F[(t + i) * 6 + 2]));
        const area = (v[1][0] - v[0][0]) * (v[2][1] - v[0][1]) - (v[2][0] - v[0][0]) * (v[1][1] - v[0][1]);
        if (Math.abs(area) < 1e-9) continue;
        // Lit at each corner and the light carried across between them, as the shaders' normals are.
        const lamOf = q => { const b = q * 24, nx = N[b + 12] / 127, ny = N[b + 13] / 127, nz = N[b + 14] / 127, ao = Math.abs(N[b + 15] / 127), lx = nx * c + nz * s, lz = nz * c - nx * s; return (0.4 + 0.6 * Math.max(0, lx * light[0] + ny * light[1] - lz * light[2])) * (0.55 + 0.45 * ao); };
        const lam = [lamOf(t), lamOf(t + 1), lamOf(t + 2)], col = [0, 1, 2].map(i => [B[(t + i) * 24 + 16], B[(t + i) * 24 + 17], B[(t + i) * 24 + 18]]);
        const x0 = Math.max(0, Math.floor(Math.min(v[0][0], v[1][0], v[2][0]))), x1 = Math.min(W - 1, Math.ceil(Math.max(v[0][0], v[1][0], v[2][0])));
        const y0 = Math.max(0, Math.floor(Math.min(v[0][1], v[1][1], v[2][1]))), y1 = Math.min(H - 1, Math.ceil(Math.max(v[0][1], v[1][1], v[2][1])));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            const w0 = ((v[1][0] - x) * (v[2][1] - y) - (v[2][0] - x) * (v[1][1] - y)) / area, w1 = ((v[2][0] - x) * (v[0][1] - y) - (v[0][0] - x) * (v[2][1] - y)) / area, w2 = 1 - w0 - w1;
            if (w0 < 0 || w1 < 0 || w2 < 0) continue;
            const d = w0 * v[0][2] + w1 * v[1][2] + w2 * v[2][2], k = y * W + x;
            if (d >= depth[k]) continue;
            const l = [w0 * lam[0], w1 * lam[1], w2 * lam[2]];
            depth[k] = d;
            for (let ch = 0; ch < 3; ch++) rgb[k * 3 + ch] = Math.min(255, l[0] * col[0][ch] + l[1] * col[1][ch] + l[2] * col[2][ch]);
        }
    }
    for (const m of marks) {
        const [x] = px(m[0], 0, m[2]);
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const X = Math.round(x + dx), Y = Math.round(ground + 4 + (m[3] ? 5 : 0) + dy); if (X >= 0 && X < W && Y >= 0 && Y < H) { const k = (Y * W + X) * 3; rgb[k] = 220; rgb[k + 1] = m[3] ? 140 : 40; rgb[k + 2] = 30; } }
    }
    return rgb;
}

// Rows of cells (each { cells: [rgb...] }, cw × ch) onto one sheet, written as a PNG to dist/<name>.
export function sheet(name, rows, cw, ch) {
    const cols = Math.max(...rows.map(r => r.cells.length)), W = cw * cols, H = ch * rows.length, img = Buffer.alloc((W * 3 + 1) * H, 255);
    for (let y = 0; y < H; y++) img[y * (W * 3 + 1)] = 0;
    rows.forEach((row, r) => row.cells.forEach((cell, f) => {
        for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const o = (r * ch + y) * (W * 3 + 1) + 1 + (f * cw + x) * 3, k = (y * cw + x) * 3; img[o] = cell[k]; img[o + 1] = cell[k + 1]; img[o + 2] = cell[k + 2]; }
        for (let y = 0; y < ch; y++) { const o = (r * ch + y) * (W * 3 + 1) + 1 + f * cw * 3; img[o] = img[o + 1] = img[o + 2] = 90; }
    }));
    const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
    const crc = buf => { let c = 0xffffffff; for (const b of buf) c = table[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
    const chunk = (type, data) => { const len = Buffer.alloc(4), body = Buffer.concat([Buffer.from(type), data]), sum = Buffer.alloc(4); len.writeUInt32BE(data.length); sum.writeUInt32BE(crc(body)); return Buffer.concat([len, body, sum]); };
    const head = Buffer.alloc(13); head.writeUInt32BE(W, 0); head.writeUInt32BE(H, 4); head[8] = 8; head[9] = 2;
    mkdirSync(join(ROOT, 'dist'), { recursive: true });
    const file = join(ROOT, 'dist', name);
    writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(img)), chunk('IEND', Buffer.alloc(0))]));
    return file;
}
