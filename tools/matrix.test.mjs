// Unit tests for Matrix's pure logic (web/wallpapers/matrix/matrix-logic.js),
// loaded into a Node vm as the stage loads it: the glyphs, the looks, the
// colour ramps, and the rain (fixed cells lit by a passing wave).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';

const WEB = resolve(import.meta.dirname, '../web');
const FILE = 'wallpapers/matrix/matrix-logic.js';
const context = vm.createContext({});
vm.runInContext(readFileSync(join(WEB, FILE), 'utf8'), context, { filename: FILE });
const M = vm.runInContext('MatrixLogic', context);
// Objects from the vm have their own prototypes, so compare by value.
const same = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b));

// A path on the 10 × 14 grid: SVG commands M, L, Q and Z only, every number in the box.
function checkPath(ch, path) {
    const tokens = path.match(/[MLQZ]|-?\d*\.?\d+/g) || [];
    let i = 0, pen = false;
    while (i < tokens.length) {
        const t = tokens[i++];
        if (t === 'Z') continue;
        const n = t === 'M' || t === 'L' ? 2 : t === 'Q' ? 4 : -1;
        assert.ok(n > 0, `${ch}: unknown command ${t}`);
        if (t === 'M') pen = true; else assert.ok(pen, `${ch}: ${t} before any M`);
        for (let k = 0; k < n; k++) {
            const v = Number(tokens[i++]);
            assert.ok(Number.isFinite(v), `${ch}: bad number in ${path}`);
            const limit = k % 2 === 0 ? 10 : 14;
            assert.ok(v >= 0 && v <= limit, `${ch}: ${v} is off the grid in ${path}`);
        }
    }
}

test('the glyphs are the film\'s: thirty kana, a few numerals, Z, 日 and some marks, all on the grid', () => {
    assert.equal(Object.keys(M.KANA).length, 30);
    for (const ch of 'ﾊﾋｼﾂｳｰﾅﾐﾓﾆｻﾜｵﾘﾎﾏｴｷﾑﾃｹﾒｶﾕﾗｾﾈｽﾀﾇ') assert.ok(M.KANA[ch], `${ch} is missing`);
    for (const table of [M.KANA, M.MORE_KANA, M.DIGITS, M.OTHER]) for (const [ch, path] of Object.entries(table)) checkPath(ch, path);
    assert.equal(Object.keys(M.DIGITS).length, 10);
    assert.ok(M.OTHER['日'] && M.OTHER.Z && M.OTHER['*']);
});

test('the film mirrors every kana and three digits, turns 3 and 6 over, and leaves the rest alone', () => {
    for (const ch of Object.keys(M.KANA)) assert.equal(M.flipOf(ch), 'x');
    for (const ch of Object.keys(M.MORE_KANA)) assert.equal(M.flipOf(ch), 'x');
    for (const ch of '259') assert.equal(M.flipOf(ch), 'x');
    for (const ch of '36') assert.equal(M.flipOf(ch), 'y');
    for (const ch of '01478Z*+:') assert.equal(M.flipOf(ch), '');
    assert.equal(M.flipOf('日'), '');
});

test('the alphabets: the 1999 set, and Resurrections\' bigger one; kana outnumber the marks', () => {
    const chars = list => new Set(list.map(g => g.ch));
    assert.equal(chars(M.FILM).size, 30 + 10 + 13);
    assert.equal(chars(M.EXPANDED).size, 30 + 16 + 10 + 13);
    const kana = M.FILM.filter(g => M.KANA[g.ch]).length, marks = M.FILM.filter(g => M.OTHER[g.ch]).length;
    assert.ok(kana > marks * 3);
    for (const g of M.EXPANDED) { assert.equal(typeof g.path, 'string'); assert.ok(['', 'x', 'y'].includes(g.flip)); }
});

test('the looks: the 1999 film is flat with a bright head; the sequels fade; Resurrections is dim or blazing', () => {
    same(M.LOOK_ORDER, ['operator', 'classic', 'resurrections']);
    for (const k of M.LOOK_ORDER) {
        const L = M.LOOKS[k];
        assert.ok(L.name && L.glyphs.length > 40 && L.aspect > 1 && L.tick > 0 && L.head >= 2 && L.cycle > 0, k);
        for (const x of [0, 0.3, 0.6, 0.95, 1]) { const b = L.ramp(x); assert.ok(b >= 0 && b <= 1, `${k} ramp(${x}) = ${b}`); }
    }
    const op = M.LOOKS.operator, cl = M.LOOKS.classic, re = M.LOOKS.resurrections;
    assert.equal(op.ramp(0.1), op.ramp(0.9));                       // flat
    assert.ok(cl.ramp(0.2) < cl.ramp(0.5) && cl.ramp(0.5) < cl.ramp(0.9));  // a gradient
    assert.ok(re.ramp(0.5) < 0.35 && re.ramp(0.95) === 1);          // binary
    assert.ok(re.glyphs.length > op.glyphs.length);
    assert.ok(op.aspect > cl.aspect);                               // the 1999 code is taller and more crowded
});

test('colours: a ramp that never reaches white, a paler head, and the rainbow by column', () => {
    same(M.COLOUR_ORDER, ['green', 'amber', 'blue', 'red', 'purple', 'cyan', 'white', 'rainbow']);
    for (const k of M.COLOUR_ORDER) assert.ok(M.COLOURS[k].name);
    assert.equal(M.COLOURS.green.hue, null);
    assert.equal(M.COLOURS.white.sat, 0);
    assert.equal(M.COLOURS.rainbow.hue, 'column');
    let last = -1;
    for (let b = 0; b <= 1.0001; b += 0.05) {
        const [h, s, l] = M.shade(120, 0.9, b);
        assert.equal(h, 120); assert.equal(s, 0.9);
        assert.ok(l >= last - 1e-9 && l <= 0.8, `lightness ${l} at ${b}`);
        last = l;
    }
    assert.equal(M.shade(120, 0.9, 0)[2], 0);
    assert.ok(M.headShade(120, 0.9, 3)[2] > M.shade(120, 0.9, 1)[2]);
    assert.equal(M.hsl([120, 0.9, 0.5]), 'hsl(120, 90%, 50%)');
    assert.equal(M.hsl([-10, 1, 0.5]), 'hsl(350, 100%, 50%)');
    const hues = new Set(Array.from({ length: 12 }, (_, c) => Math.round(M.columnHue(c))));
    assert.ok(hues.size >= 11);
});

test('the seeded random repeats itself and differs by seed', () => {
    const a = M.rng(5), b = M.rng(5), c = M.rng(6);
    const sa = Array.from({ length: 10 }, () => a()), sb = Array.from({ length: 10 }, () => b()), sc = Array.from({ length: 10 }, () => c());
    same(sa, sb);
    assert.notEqual(JSON.stringify(sa), JSON.stringify(sc));
    for (const v of sa) assert.ok(v >= 0 && v < 1);
    assert.ok(M.hash(3, 4) === M.hash(3, 4) && M.hash(3, 4) !== M.hash(4, 3));
});

test('the intro: the middle column first, the three-quarter column next, the edges last', () => {
    const r = M.rng(1), cols = 81;
    const delays = Array.from({ length: cols }, (_, c) => M.introDelay(c, cols, r));
    assert.equal(delays[40], 0);
    assert.equal(delays[Math.round(cols * 0.75)], 0.8);
    assert.ok(delays[0] > delays[20] && delays[80] > delays[60]);
    assert.ok(Math.max(...delays) <= 8.5);
});

// A column stepped for `seconds` at 60 Hz.
function run(col, seconds, p, r, dt = 1 / 60) {
    for (let t = 0; t < seconds; t += dt) M.stepColumn(col, dt, { ...p, time: t }, r);
}

test('the rain: strings start at the top, move at the speed set, light a trail behind the head, and leave below', () => {
    const r = M.rng(9), cols = 10, rows = 40;
    const col = M.makeColumn(3, cols, r);
    const p = { rows, speed: 20, trailRows: 12, brightShare: 1, rate: 1, density: 1, stutter: false };
    M.spawn(col, rows, p, r);
    assert.equal(col.drops.length, 1);
    const d = col.drops[0];
    assert.ok(d.head < 0 && d.len >= 3 && d.bright && col.wait > 0);
    run(col, 1, p, r);
    // Speed is 20 rows/s × the drop's own pace (0.5..1) × a wobble: between 8 and 30 rows in a second.
    assert.ok(d.head > 8 && d.head < 30, `head at ${d.head}`);
    // The cells behind the head are lit, the head cell brightest in a gradient; cells outside are not.
    const head = Math.floor(d.head), ramp = x => x;
    assert.equal(M.cover(d, head, ramp), 1);
    assert.ok(M.cover(d, head - 3, ramp) < 1 && M.cover(d, head - 3, ramp) > 0);
    assert.equal(M.cover(d, head + 1, ramp), -1);
    assert.equal(M.cover(d, head - d.len, ramp), -1);
    run(col, 8, p, r);
    assert.ok(col.drops.every(x => x.head - x.len <= rows), 'every drop still here has part of it on screen');
});

test('the rain: a dark column past the density never starts; strings are spaced; some start mid-screen', () => {
    const rows = 40;
    const p = { rows, speed: 20, trailRows: 12, brightShare: 0.3, rate: 1, density: 0.5, stutter: true };
    const r = M.rng(2);
    const dark = M.makeColumn(1, 10, r);     // rank 0.618
    run(dark, 10, p, r);
    assert.equal(dark.drops.length, 0);
    const lit = M.makeColumn(5, 10, r);      // rank 0.09
    let spawned = 0, mid = 0, maxAtOnce = 0;
    for (let t = 0; t < 30; t += 1 / 60) {
        const before = lit.drops.length;
        M.stepColumn(lit, 1 / 60, { ...p, time: t }, r);
        if (lit.drops.length > before) { spawned++; if (lit.drops[lit.drops.length - 1].head > 0) mid++; }
        maxAtOnce = Math.max(maxAtOnce, lit.drops.length);
        for (let i = 1; i < lit.drops.length; i++) assert.ok(lit.drops[i - 1].head > lit.drops[i].head, 'the earlier string stays ahead');
    }
    assert.ok(spawned >= 5, `${spawned} strings in 30 s`);
    assert.ok(mid >= 0 && mid < spawned);
    assert.ok(maxAtOnce >= 1);
    // Not before the intro's time for the column.
    const late = M.makeColumn(5, 10, r);
    late.start = 5;
    run(late, 4, p, r);
    assert.equal(late.drops.length, 0);
});

test('a bright head and a flat trail: the 1999 look keeps the trail one shade and the head alone bright', () => {
    const d = { head: 20.4, len: 10, bright: true };
    const ramp = M.LOOKS.operator.ramp;
    const trail = new Set();
    for (let r = 11; r <= 20; r++) trail.add(M.cover(d, r, ramp));
    assert.equal(trail.size, 1);
    assert.equal(M.cover(d, 10, ramp), -1);
});
