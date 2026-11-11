// Matrix's pure logic (SPEC §10.32): the glyphs of the film's code as stroke
// paths, the three looks (the 1999 film's operator screens, the sequels'
// titles, Resurrections), the colour ramps, and the rain itself: fixed cells
// that light up as a wave passes down the column, the way the film's code
// works (nothing ever falls; symbols stay put and the light moves). No DOM in
// here, so tools/matrix.test.mjs runs it in Node.

const MatrixLogic = (() => {
    // ---- Random ------------------------------------------------------------------------------

    // mulberry32: the same seed gives the same rain (the smoke test counts on it).
    function rng(seed) {
        let a = (seed >>> 0) || 1;
        const next = () => {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        next.range = (lo, hi) => lo + next() * (hi - lo);
        next.int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
        next.pick = list => list[Math.floor(next() * list.length)];
        return next;
    }

    // A small integer hash, for per-cell traits that must not change frame to frame.
    function hash(a, b, c = 0) {
        let h = (a * 374761393 + b * 668265263 + c * 2246822519) >>> 0;
        h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
        return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    }

    // ---- The glyphs --------------------------------------------------------------------------

    // Simon Whiteley's code was half-width katakana scanned from Japanese
    // cookbooks, mirrored on purpose, with a few numerals (some flipped), one
    // Z, one 日 and some punctuation. These are the shapes from a frame study
    // of the 1999 title sequence, drawn as strokes on a 10 × 14 grid (origin
    // top left), unmirrored; `flip` says how the film shows each one. Every
    // path is SVG syntax, so a Path2D takes it as is.
    const KANA = {
        'ﾊ': 'M4 3 Q3 8 1 11.5 M6 3 Q7 8 9 11.5',
        'ﾋ': 'M2 2 L2 11 L9 11 M3 6.5 L8 4.5',
        'ｼ': 'M2 3 L4 4.5 M2 6.5 L4 8 M2 12 Q6.5 10.5 9 3',
        'ﾂ': 'M2 3 L3 5.5 M5 2.5 L6 5 M9 2 Q9 9 2 12',
        'ｳ': 'M5 1 L5 4 M2 5 L8 5 L8 8 Q8 10.5 4 12',
        'ｰ': 'M1 7 L9 7',
        'ﾅ': 'M1 5 L9 5 M5.5 2 L5.5 8 Q5.5 10.5 3 12',
        'ﾐ': 'M2 3 L8 4 M2 6.5 L8 7.5 M2 10 L8 11',
        'ﾓ': 'M2 4 L8 4 M1 7 L9 7 M4 2 L4 10 Q4 11.5 8 11',
        'ﾆ': 'M3 4 L7 4 M1 10 L9 10',
        'ｻ': 'M1 5 L9 5 M3 2.5 L3 8 M7 2.5 L7 9 Q7 11 4 12',
        'ﾜ': 'M2 7 L2 3 L8 3 L8 9 Q8 11 4 12',
        'ｵ': 'M1 5 L9 5 M6 2 L6 12 M5.5 6 Q4 9 1 10.5',
        'ﾘ': 'M3 3 L3 9 M7 2 L7 10 Q7 11.5 4 12',
        'ﾎ': 'M2 4 L8 4 M5 2 L5 12 M3 7 L2 10 M7 7 L8 10',
        'ﾏ': 'M1 3 L8 3 L3 9 M5 7 L7 10',
        'ｴ': 'M2 3 L8 3 M5 3 L5 11 M1 11 L9 11',
        'ｷ': 'M2 4.5 L8 3.5 M1.5 8 L8.5 7 M4.5 2 L5.5 12',
        'ﾑ': 'M4 2 Q3 7 1 10.5 L8 10.5 M7 8 L8.5 10',
        'ﾃ': 'M3 3 L7 3 M1 6 L9 6 M5.5 6 L5.5 9 Q5.5 11 3 12',
        'ｹ': 'M3.5 2 Q2.5 5 1 7 M3 5 L9 5 M6.5 5 L6.5 8 Q6.5 10.5 3 12',
        'ﾒ': 'M8 2 Q6 8 2 12 M3 5.5 L8 10',
        'ｶ': 'M1 5 L8 5 L8 9 Q8 11 5 12 M4 2 Q4 8 1.5 12',
        'ﾕ': 'M2 4 L7 4 L7 10 M1 10 L9 10',
        'ﾗ': 'M3 3 L7 3 M1 6 L9 6 Q9 10 3 12',
        'ｾ': 'M1 5 L8 5 Q8 7 6 8 M3 2 L3 10 Q3 11 5 11 L9 11',
        'ﾈ': 'M4 2 L6 2.5 M2 4.5 L8 4.5 L2 10 M5 6 L5 12 M6 8 L8.5 10',
        'ｽ': 'M1 4 L9 4 Q7 9 2 12 M5 8 L8.5 11.5',
        'ﾀ': 'M4 2 Q3 5 1 7.5 M3 4.5 L9 4.5 Q7 9 2 12 M4 7.5 L6.5 9.5',
        'ﾇ': 'M1 4 L9 4 Q7 9 2 12 M3 6.5 L8.5 11',
    };
    // The rest of the half-width set, for Resurrections' bigger alphabet.
    const MORE_KANA = {
        'ｱ': 'M2 3 L8 3 L8 6 Q7 8 5 9 M5.5 5 L5.5 8 Q5.5 10.5 3 12',
        'ｲ': 'M8 2 Q5 6 1.5 8.5 M5 5.5 L5 12',
        'ｸ': 'M4 2 Q3 5 1 7 M4 4 L8 4 Q8 9 2 12',
        'ｺ': 'M2 3 L8 3 L8 11 L2 11',
        'ｿ': 'M2 3 L3 7 M8 2 Q8 9 2 12',
        'ﾁ': 'M7 2 Q5 3.5 3 3.5 M1 6 L9 6 M5.5 3.5 L5.5 9 Q5.5 11 3 12',
        'ﾄ': 'M4 1 L4 13 M4 6 L8 9',
        'ﾉ': 'M8 2 Q6 8 1.5 12',
        'ﾌ': 'M2 3 L8 3 Q8 9 2 12',
        'ﾍ': 'M1 7 L4 4 L9 10',
        'ﾔ': 'M2 4 Q4 3 8 5 Q7 8 6 9 M5 2 Q5.5 8 5 12',
        'ﾖ': 'M2 3 L8 3 L8 11 L2 11 M3 7 L8 7',
        'ﾙ': 'M3 2 L3 7 Q3 10 1.5 12 M7 2 L7 9 L9 7',
        'ﾚ': 'M3 2 L3 11 L9 6',
        'ﾛ': 'M2 3 L8 3 L8 11 L2 11 Z',
        'ﾝ': 'M2 3 L4 5 M2 12 Q6 10 9 4',
    };
    const DIGITS = {
        '0': 'M5 2 Q8.5 2 8.5 7 Q8.5 12 5 12 Q1.5 12 1.5 7 Q1.5 2 5 2 Z',
        '1': 'M3 4 L5 2 L5 12 M3 12 L7 12',
        '2': 'M2 4 Q2 2 5 2 Q8 2 8 4.5 Q8 6.5 2 12 L8 12',
        '3': 'M2 3 Q5 1 7.5 3.5 Q8 6 5 7 Q8.5 8 8 10 Q6 13 2 11',
        '4': 'M7 12 L7 2 L1.5 9 L9 9',
        '5': 'M8 2 L2.5 2 L2 7 Q5 5.5 7.5 7.5 Q9 10.5 5.5 12 Q3 12 2 10.5',
        '6': 'M7.5 3 Q5 1 3 4 Q1.5 7 2 9.5 Q3 12 5.5 12 Q8.5 11.5 8 8.5 Q7 6 4.5 6.5 Q2.5 7.5 2 9.5',
        '7': 'M2 2 L8.5 2 L4 12',
        '8': 'M5 7 Q2 6 2.5 4 Q3 2 5 2 Q7 2 7.5 4 Q8 6 5 7 Q1.5 8 2 10.5 Q3 12.5 5 12 Q7 12.5 8 10.5 Q8.5 8 5 7',
        '9': 'M8 5.5 Q7.5 7.5 5 7.5 Q2 7 2.5 4 Q3 2 5 2 Q8 2 8 5.5 Q8 9 6.5 11 Q5.5 12 3 12',
    };
    const OTHER = {
        '日': 'M2 2 L8 2 L8 12 L2 12 Z M2 7 L8 7',
        'Z': 'M2 2 L8 2 L2 12 L8 12',
        '*': 'M5 3 L5 11 M1.5 5 L8.5 9 M8.5 5 L1.5 9',
        '+': 'M5 3 L5 11 M1.5 7 L8.5 7',
        ':': 'M5 4 L5 5 M5 9 L5 10',
        '=': 'M2 5.5 L8 5.5 M2 8.5 L8 8.5',
        '.': 'M5 10.5 L5 11.5',
        '<': 'M8 3 L2 7 L8 11',
        '>': 'M2 3 L8 7 L2 11',
        '"': 'M3.5 2 L3.5 5 M6.5 2 L6.5 5',
        '|': 'M5 1 L5 13',
        '¦': 'M5 1 L5 5.5 M5 8.5 L5 13',
        '_': 'M1 12.5 L9 12.5',
    };
    // How the film shows each: kana mirrored, digits 2 5 9 mirrored, 3 and 6
    // upside down, the rest as they are.
    const FLIP = { '2': 'x', '5': 'x', '9': 'x', '3': 'y', '6': 'y' };
    function flipOf(ch) {
        if (KANA[ch] || MORE_KANA[ch]) return 'x';
        return FLIP[ch] || '';
    }

    // The alphabets, as glyph lists: { ch, path, flip }. Kana are listed
    // twice, so the code reads as kana with numerals and marks between.
    function glyphList(...tables) {
        const list = [];
        for (const table of tables) for (const ch of Object.keys(table)) list.push({ ch, path: table[ch], flip: flipOf(ch) });
        return list;
    }
    const FILM = glyphList(KANA, KANA, DIGITS, OTHER);
    const EXPANDED = glyphList(KANA, MORE_KANA, KANA, MORE_KANA, DIGITS, OTHER);

    // ---- The looks ---------------------------------------------------------------------------

    // ramp: a cell's brightness (0..1) from its place behind the head (1 at the
    // head, 0 at the tail). aspect: cell height over width. cycle: how often
    // a lit symbol changes, changes per second per cell (×the setting).
    // flicker: the share of cells that change every tick regardless. head:
    // how far past the ramp's top the bright head goes (2 is pushed to white).
    const LOOKS = {
        operator: {
            name: 'The Matrix (1999)', glyphs: FILM, hue: 140, aspect: 1.35, cycle: 0.6, flicker: 0.08, head: 3,
            ramp: x => 0.42, trail: 1.5, tick: 8,
        },
        classic: {
            name: 'Reloaded / Revolutions', glyphs: FILM, hue: 112, aspect: 1.15, cycle: 1.8, flicker: 0, head: 2,
            ramp: x => x, trail: 0.75, tick: 12,
        },
        resurrections: {
            name: 'Resurrections (2021)', glyphs: EXPANDED, hue: 135, aspect: 1.3, cycle: 1.2, flicker: 0.04, head: 2,
            ramp: x => x > 0.9 ? 1 : 0.2 + 0.1 * x, trail: 1, tick: 10,
        },
    };
    const LOOK_ORDER = ['operator', 'classic', 'resurrections'];

    // Colours: the look's own green, or another phosphor. hue null takes the
    // look's; sat 0 is the white ghost; rainbow hues per column.
    const COLOURS = {
        green: { name: 'Phosphor green', hue: null, sat: 0.9 },
        amber: { name: 'Amber', hue: 38, sat: 1 },
        blue: { name: 'Blue', hue: 205, sat: 1 },
        red: { name: 'Red alert', hue: 350, sat: 1 },
        purple: { name: 'Purple', hue: 280, sat: 1 },
        cyan: { name: 'Cyan ice', hue: 180, sat: 1 },
        white: { name: 'White ghost', hue: 0, sat: 0 },
        rainbow: { name: 'Rainbow', hue: 'column', sat: 1 },
    };
    const COLOUR_ORDER = ['green', 'amber', 'blue', 'red', 'purple', 'cyan', 'white', 'rainbow'];

    // The trail's colour at a brightness: lightness climbs to 0.8 (the film's
    // code never reaches white; only the head does), hsl as [h, s, l].
    function shade(hue, sat, b) {
        const l = b <= 0 ? 0 : b < 0.2 ? b : b < 0.7 ? 0.2 + (b - 0.2) * 1 : 0.7 + (b - 0.7) * (0.1 / 0.3);
        return [hue, sat, Math.min(0.8, l)];
    }
    // The head: pale, a little yellower than the trail, almost white.
    function headShade(hue, sat, head) {
        return [hue - 18 * (sat > 0 ? 1 : 0), sat, Math.min(0.92, 0.6 + 0.1 * head)];
    }
    const hsl = ([h, s, l]) => `hsl(${((h % 360) + 360) % 360}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
    const columnHue = c => (c * 137.508) % 360;

    // ---- The rain ----------------------------------------------------------------------------

    // A grid of fixed cells. Each column carries drops: a head row that moves
    // down at its own pace, lighting the cell it passes, with a trail of
    // `len` rows behind it that goes dark again as the head moves on (the
    // film ends its strings by erasing from the top, which is the same
    // thing). Some drops have a bright head; some start in mid screen; some
    // stall for a moment. Columns ranked past the density stay dark.
    function makeColumn(c, cols, random) {
        return {
            c, drops: [], wait: random.range(0, 2.5), phase: random() * 6.283, stall: 0,
            rank: (c * 0.618034) % 1,
            // The intro: the middle first, the three-quarter column next, the rest
            // over a few seconds, the edges last.
            start: 0,
        };
    }

    function introDelay(c, cols, random) {
        const mid = (cols - 1) / 2, edge = Math.abs(c - mid) / Math.max(1, mid);
        if (Math.abs(c - mid) < 0.6) return 0;
        if (Math.abs(c - cols * 0.75) < 0.6) return 0.8;
        return 2 + edge * 4.5 + random() * 2;
    }

    // Spawn a drop at the top (or, sometimes, in mid screen). It never runs
    // faster than the string ahead of it, so strings in a column keep their order.
    function spawn(col, rows, p, random, headRow = null, maxK = 1) {
        const mid = headRow !== null;
        col.drops.push({
            head: mid ? headRow : -1,
            k: random.range(0.5, Math.max(0.5, maxK)),
            len: Math.max(3, Math.round(p.trailRows * random.range(0.55, 1.25))),
            bright: random() < p.brightShare,
            born: 0,
        });
        col.wait = random.range(0.4, 3.2) / Math.max(0.1, p.rate);
    }

    // Advance one column by dt seconds. p: { rows, speed (rows/s), trailRows,
    // brightShare, rate, density, stutter, time }.
    function stepColumn(col, dt, p, random) {
        const wobble = 1 + 0.25 * Math.sin(1.41421 * p.time + col.phase) + 0.15 * Math.sin(2.23607 * p.time + col.phase * 0.7);
        if (col.stall > 0) col.stall -= dt;
        else if (p.stutter && random() < dt * 0.06) col.stall = random.range(0.15, 0.7);
        const moving = col.stall <= 0;
        for (const d of col.drops) {
            if (moving) d.head += p.speed * d.k * Math.max(0.2, wobble) * dt;
            d.born += dt;
        }
        // Gone once the tail is below the bottom.
        col.drops = col.drops.filter(d => d.head - d.len <= p.rows);
        if (col.rank >= p.density || p.time < col.start) return;
        col.wait -= dt;
        if (col.wait > 0) return;
        const last = col.drops[col.drops.length - 1];
        // Room for another string once the last one's tail has moved on a little.
        if (last && last.head - last.len < 3) return;
        const midStart = !last && random() < 0.15 ? Math.floor(random() * p.rows * 0.6) : null;
        spawn(col, p.rows, p, random, midStart, last ? last.k : 1);
    }

    // The brightness a drop gives row r, or -1 when r is outside it. Steps
    // with the head's row, not its fraction, so a cell's light changes only
    // when the head moves on a cell (the film's code is stepped the same way).
    function cover(d, r, ramp) {
        const headRow = Math.floor(d.head);
        if (r > headRow || r <= headRow - d.len) return -1;
        const x = 1 - (headRow - r) / d.len;
        return Math.max(0, Math.min(1, ramp(x)));
    }

    return { rng, hash, KANA, MORE_KANA, DIGITS, OTHER, FILM, EXPANDED, flipOf, LOOKS, LOOK_ORDER, COLOURS, COLOUR_ORDER, shade, headShade, hsl, columnHue, makeColumn, introDelay, spawn, stepColumn, cover };
})();
