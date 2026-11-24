#!/usr/bin/env node
// Wayfarer (SPEC §10.38, the eighth pass): the scenery's models side by side at each level of detail, with what each
// costs. A row of trees is one kind as the far squares draw it, as the near squares do, as High draws it near the
// traveller (`rich`: leaves on the clumps, fronds on a fir) and as the fine model by the road; a row of houses is one
// plot lite (far off), plain, rich (High, near the traveller) and fine (High, by the road). Drawn in Node from the wallpaper's own triangles (tools/wayfarer-raster.mjs).
//
//   node tools/wayfarer-models.mjs                    every tree kind and four houses
//   node tools/wayfarer-models.mjs --trees=oak,fir    just these trees (--houses=0 for none)
//   make wayfarer-models ARGS="--cell=320x320"
// Writes dist/wayfarer-models.png, and prints each model's triangles.

import { frame, sheet, way } from './wayfarer-raster.mjs';

const { M, D, Soup } = way;
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = /^--([a-z]+)(?:=(.*))?$/.exec(a); if (!m) { console.error(`wayfarer-models: not an option: ${a}`); process.exit(1); } return [m[1], m[2] ?? '1']; }));
const TREES = ['oak', 'apple', 'poplar', 'fir', 'pine', 'birch', 'willow', 'glade', 'shroom'];
const trees = args.trees === '0' ? [] : (args.trees ?? TREES.join(',')).split(',');
const [cw, ch] = (args.cell ?? '240x240').split('x').map(Number), rows = [], report = [];
const tris = soup => Math.round(soup.n / 3);
// A tree model as the squares stamp it, tinted with its summer leaf (slot 1), plain trunk and blossom.
const tinted = (model, kind) => { const out = new Soup(model.n + 3); out.stamp(model, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0], [null, M.leafTint(kind, { index: 0, next: 1, t: 0, snow: 0 }, 0.4), null, [250, 196, 214]]); return out; };
for (const kind of trees) {
    const plain = tinted(M.tree(kind, 0, 0), kind), rich = tinted(M.tree(kind, 0, 1), kind), fine = tinted(D.tree(kind, 0), kind);
    const cells = [plain, rich, fine].map(s => frame(s, cw, ch, 0.6, { w: 9.5, h: 11, cz: 0, y0: -0.3 }, [], 0.12));
    rows.push({ cells });
    report.push(`${kind}: plain ${tris(plain)}, rich ${tris(rich)}, fine ${tris(fine)}`);
}
if (args.houses !== '0') for (const plot of [
    { w: 8, dp: 6.5, floors: 2, roof: 1, v: 0.37, jetty: true, crooked: true, stoneBase: true, shop: true },
    { w: 7, dp: 6, floors: 1, roof: 2, v: 0.71 },
    { w: 7.5, dp: 6, floors: 2, roof: 0, v: 0.12, stone: true },
    { w: 6, dp: 8.5, floors: 3, roof: 3, v: 0.55, endOn: true, inn: true },
]) {
    const cells = [], counts = [];
    for (const how of [{ lite: true }, {}, { rich: true }, { fine: true }]) {
        // (Tinted as a street paints them: 1 plaster, 2 timber, 3 door and shutters, 5 the roof.)
        const s = new Soup(), tints = [null, M.PLASTER[0], [92, 64, 44], [112, 70, 56], null, M.C.tile];
        M.house(s, { ...plot, ...how });
        const out = new Soup(s.n + 3); out.stamp(s, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0], tints);
        cells.push(frame(out, cw, ch, 0.75, { w: 13, h: 12, cz: 0, y0: -0.5 }, [], 0.1));
        counts.push(tris(out));
    }
    rows.push({ cells });
    report.push(`house ${plot.w}×${plot.dp}, ${plot.floors} floors: lite ${counts[0]}, plain ${counts[1]}, rich ${counts[2]}, fine ${counts[3]}`);
}
const file = sheet('wayfarer-models.png', rows, cw, ch);
console.log(`${report.join('\n')}\nwayfarer-models: ${rows.length} rows → ${file}`);
