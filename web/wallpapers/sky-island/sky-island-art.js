// Sky Island's pixel art: every sprite drawn a pixel at a time into a small
// canvas. The stage's canvas is the picture at its own resolution (a pixel
// here is a couple of CSS pixels), scaled up pixelated, so a frame is a
// few hundred drawImage calls of tiny sprites.
//
// Sprites face LEFT as drawn; `flip` turns them right. Each is { c, w, h,
// ax }: the canvas, its size, and its anchor column (the feet stand on the
// bottom row, at ax).

const SkyIslandArt = (() => {
    function canvas(w, h) {
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
        return c;
    }
    const dot = (g, x, y, c) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); };

    // A sprite from rows of characters, each mapped to a colour ('.' is clear).
    function rows(lines, map, flip = false, ax) {
        const w = Math.max(...lines.map(l => l.length)), h = lines.length;
        const c = canvas(w, h), g = c.getContext('2d');
        lines.forEach((line, y) => [...line].forEach((ch, x) => { const col = map[ch]; if (col) dot(g, flip ? w - 1 - x : x, y, col); }));
        const a = ax ?? Math.floor(w / 2);
        return { c, w, h, ax: flip ? w - 1 - a : a };
    }
    const both = (lines, map, ax) => ({ l: rows(lines, map, false, ax), r: rows(lines, map, true, ax) });
    const flipped = s => { const c = canvas(s.w, s.h), g = c.getContext('2d'); g.translate(s.w, 0); g.scale(-1, 1); g.drawImage(s.c, 0, 0); return { c, w: s.w, h: s.h, ax: s.w - 1 - s.ax }; };

    // Shade a hex colour: k < 0 darker, k > 0 lighter.
    function shade(hex, k) {
        const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
        const f = v => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
        return `#${((f(r) << 16) | (f(g) << 8) | f(b)).toString(16).padStart(6, '0')}`;
    }
    const mixHex = (a, b, t) => {
        const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
        const ch = s => Math.round(((A >> s) & 255) + (((B >> s) & 255) - ((A >> s) & 255)) * t);
        return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
    };

    // ---- Palette ----------------------------------------------------------------------------------

    const SKIN = ['#f3c9a2', '#e2a97e', '#c58a5c', '#9c6a44', '#6f4a2e', '#f6d8bb'];
    const HAIR = ['#2a1d14', '#5a3a1e', '#a86a2c', '#e0b24a', '#9c9c9c', '#c43d2a', '#1c1c24', '#e8e0d0'];
    const CLOTH = ['#d9453a', '#3a6fd9', '#3aa86a', '#e0a63a', '#8a4ad0', '#e07aa8', '#3ab6c0', '#f0f0f0', '#5a4a3a', '#c0c0c0', '#2a3a5a'];
    const PANTS = ['#2a3a5a', '#5a4a3a', '#3a3a3a', '#7a5a3a', '#4a6a8a'];
    const WALLS = ['#f3e4c4', '#f0c9a8', '#cfe0b8', '#bcd8ec', '#ddd0ec', '#e9e2d4'];
    const ROOFS = ['#c94e3b', '#6d7f93', '#8a5a3a', '#4c9a8a', '#b8863b'];
    const GROUND = {
        spring: { grass: '#7fcf6a', grass2: '#64b853', dark: '#4e9a42', path: '#c9b58a', path2: '#b9a278' },
        summer: { grass: '#6cc05a', grass2: '#55a548', dark: '#3f8a39', path: '#c9b58a', path2: '#b9a278' },
        autumn: { grass: '#b7b04e', grass2: '#9a9a3e', dark: '#7a7d2c', path: '#c4ab80', path2: '#b09670' },
        winter: { grass: '#eef3f8', grass2: '#dbe5f0', dark: '#c3d0e0', path: '#d8dde6', path2: '#c3c9d4' },
    };
    const FOLIAGE = {
        spring: { round: ['#86d46c', '#5fb54c'], tall: ['#8ad470', '#62b350'], birch: ['#a8e08a', '#7cc45e'], apple: ['#f2c6d8', '#86d46c'], pine: ['#3f8f55', '#2e6f42'] },
        summer: { round: ['#5fbf4e', '#3f9a3a'], tall: ['#63b852', '#3f9240'], birch: ['#8dd070', '#5fa84c'], apple: ['#5fbf4e', '#3f9a3a'], pine: ['#3a8a4e', '#2a673c'] },
        autumn: { round: ['#e0902e', '#b85c22'], tall: ['#e8c23a', '#b8902a'], birch: ['#f0d040', '#c8a030'], apple: ['#d9a83a', '#a67a26'], pine: ['#3f8a50', '#2d6a3d'] },
        winter: { round: ['#8a7a6a', '#6a5a4a'], tall: ['#8a7a6a', '#6a5a4a'], birch: ['#c9c4bc', '#9a9088'], apple: ['#8a7a6a', '#6a5a4a'], pine: ['#3a7a4a', '#2a5a38'] },
    };
    const WATER = { base: '#4fa0d8', deep: '#3a7fbf', light: '#8fd0f0', foam: '#eaf6ff', ice: '#cfe6f6', ice2: '#b8d6ea' };
    const ROCK = { light: '#9a9aa6', mid: '#7a7a88', dark: '#5a5a68', soil: '#8a6a4a', soil2: '#6e5238', root: '#5a3e2a' };
    const P = { black: '#1a1a20', white: '#f8f8f8', wood: '#8a5a3a', wood2: '#6a4229', stone: '#a0a0a8', stone2: '#7c7c86', gold: '#f0c040', red: '#d9453a',
        glass: '#9ad0e8', glassLit: '#ffd77a', lamp: '#ffe9a0', smoke: '#c8c8d0', smokeDim: '#9a9aa6', snow: '#f4f8fc', snow2: '#d6e2ee', pink: '#f08ab0', orange: '#f08a2a' };

    // ---- People -----------------------------------------------------------------------------------

    // A person: 5 wide, 8 tall, in a few frames. Letters: H hair, S skin, E eye,
    // T top, P pants, B boots. Hats go on afterwards.
    const PERSON = {
        stand: ['.HHH.', '.HHH.', '.SES.', '.TTT.', 'STTTS', '.TTT.', '.PPP.', '.B.B.'],
        walk0: ['.HHH.', '.HHH.', '.SES.', '.TTT.', 'STTTS', '.TTT.', '.PPP.', 'B...B'],
        walk1: ['.HHH.', '.HHH.', '.SES.', '.TTT.', '.TTT.', 'S.T.S', '.P.P.', '.B.B.'],
        wave0: ['.HHH.', '.HHHS', '.SES.', '.TTTT', 'STTT.', '.TTT.', '.PPP.', '.B.B.'],
        wave1: ['.HHH.', '.HHH.', '.SES.', '.TTTS', 'STTTT', '.TTT.', '.PPP.', '.B.B.'],
        sit: ['.HHH.', '.HHH.', '.SES.', '.TTT.', 'STTTS', 'PPPP.', 'B....', '.....'],
        work0: ['.HHH.', '.HHH.', '.SES.', 'STTT.', '.TTT.', '.TTT.', '.PPP.', '.B.B.'],
        work1: ['.HHH.', '.HHH.', '.SES.', '.TTT.', 'STTT.', '.TTT.', '.PPP.', '.B.B.'],
        jump: ['.HHH.', '.HHH.', '.SES.', 'STTTS', '.TTT.', '.TTT.', 'PP.PP', '.....'],
    };
    function person(spec) {
        const map = { H: spec.hair, S: spec.skin, E: '#1a1a20', T: spec.top, P: spec.pants, B: '#3a2a1a' };
        const out = {};
        for (const [name, lines] of Object.entries(PERSON)) out[name] = both(lines, map, 2);
        return out;
    }
    const HATS = {
        cap: ['.CCC.', 'CCCCC'],
        straw: ['.YYY.', 'YYYYY'],
        beanie: ['.RRR.', 'RRRRR'],
        witch: ['..K..', '.KKK.', 'KKKKK'],
        santa: ['..W..', '.RRR.', 'WWWWW'],
        party: ['..Y..', '.YPY.', 'YPYPY'],
        crown: ['Y.Y.Y', 'YYYYY'],
        chef: ['WWWWW', 'WWWWW'],
    };
    const HAT_MAP = { C: '#3a6fd9', Y: '#e8c04a', R: '#d9453a', K: '#2a1a3a', W: '#f8f8f8', P: '#f08ab0' };
    const hat = (name, flip) => HATS[name] ? rows(HATS[name], HAT_MAP, flip, 2) : null;

    // Things carried: a rod, a hoe, a hammer, a watering can, a lantern, a
    // satchel, an umbrella, a fiddle. Drawn beside the hand, facing left.
    const TOOLS = {
        rod: both(['W...', '.W..', '..W.', '...W', '...W'], { W: '#6a4a2a' }, 3),
        hoe: both(['..W', '..W', '..W', 'GG.'], { W: '#6a4a2a', G: '#9a9aa6' }, 2),
        hammer: both(['GG.', '.W.', '.W.'], { W: '#6a4a2a', G: '#7a7a88' }, 1),
        can: both(['.GG.', 'GGGG', '.GG.'], { G: '#6a9a3a' }, 1),
        lantern: both(['.W.', 'LLL', 'LLL', '.W.'], { W: '#4a3a2a', L: '#ffd77a' }, 1),
        satchel: both(['BB', 'BB'], { B: '#8a5a3a' }, 0),
        umbrella: both(['.RRRRR.', 'RRRRRRR', '...W...', '...W...', '...W...'], { R: '#d9453a', W: '#4a3a2a' }, 3),
        fiddle: both(['.WW', 'WWW', '.W.'], { W: '#a86a2c' }, 1),
        basket: both(['.W.', 'BBB', 'BBB'], { W: '#6a4a2a', B: '#c9a85a' }, 1),
        broom: both(['W..', 'W..', 'YY.', 'YYY'], { W: '#6a4a2a', Y: '#c9a85a' }, 0),
        ball: both(['RW', 'WR'], { R: '#d9453a', W: '#f8f8f8' }, 0),
        kite: both(['..R..', '.RRR.', 'RRRRR', '.RRR.', '..R..'], { R: '#3aa86a' }, 2),
        skates: both(['GG', 'GG'], { G: '#9ad0e8' }, 0),
    };

    // ---- Cats --------------------------------------------------------------------------------------

    // The owner's cats, as pixels. Letters: B body, S the pattern's marks
    // (stripes, splotches), C chest and paws, E eye, N nose, T tail, F fluff,
    // G grin. `big` cats get the wider sheet; `fluffy` ones a soft edge.
    const ROSTER = SkyIslandLogic.ROSTER;
    const STRAY_COATS = [
        { base: '#e8893a', marks: '#c86a24', chest: '#f8f0e0', pattern: 'tabby' }, { base: '#f4f1ea', marks: '#f4f1ea', chest: '#f4f1ea', pattern: 'solid' },
        { base: '#2a2a30', marks: '#2a2a30', chest: '#2a2a30', pattern: 'solid' }, { base: '#b8b0a0', marks: '#8a8070', chest: '#e0d8c8', pattern: 'tabby' },
        { base: '#e8d0a0', marks: '#3a2a20', chest: '#e8d0a0', pattern: 'splotch' }, { base: '#6a5040', marks: '#e8893a', chest: '#6a5040', pattern: 'tortie' },
        { base: '#d8c8b8', marks: '#5a4a3a', chest: '#f4f1ea', pattern: 'splotch' }, { base: '#3a3a44', marks: '#3a3a44', chest: '#f4f1ea', pattern: 'tuxedo' },
    ];
    const CAT = {
        sit: ['B.B....', 'BBB....', 'EBE...T', 'BSBB..T', 'CSSSB.T', 'CBBBBBT', 'C.C.B..'],
        sleep: ['.BBBBB.', 'BBSSSBT', 'BESBBBT', '.BBBBB.'],
        walk0: ['B.B.....', 'BBB.....', 'EBESSSBT', 'BBBSSSBT', 'C.C.B.B.'],
        walk1: ['B.B.....', 'BBB.....', 'EBESSSBT', 'BBBSSSBT', '.CC..BB.'],
        run0: ['B.B......', 'BBBSSSBB.', 'EBESSSBBT', 'CC....BB.'],
        run1: ['B.B......', 'BBBSSSBBT', 'EBESSSBB.', '.C.C.B.B.'],
        loaf: ['.B.B...', '.BBB...', '.EBE..T', 'BBSSSBT', 'BBBBBBB'],
        stretch: ['......B.B', '......BBB', 'T.....EBE', 'TBSSSBBB.', '.CC...C.C'],
        pounce: ['....B.B', '....BBB', '..SSEBE', 'TSSSBB.', 'T.C...C'],
    };
    const CAT_BIG = {
        sit: ['B.B.....', 'BBBB....', 'EBEB...T', 'BSSBB..T', 'CSSSSB.T', 'CSSSBBBT', 'CBBBBBB.', 'C.C..B..'],
        sleep: ['.BBBBBB.', 'BBSSSSBT', 'BESBBBBT', '.BBBBBB.'],
        walk0: ['B.B......', 'BBBB.....', 'EBEBSSSBT', 'BBBBSSSBT', 'BBBBBBBB.', 'C.C..B.B.'],
        walk1: ['B.B......', 'BBBB.....', 'EBEBSSSBT', 'BBBBSSSBT', 'BBBBBBBB.', '.CC...BB.'],
        run0: ['B.B.......', 'BBBBSSSBB.', 'EBEBSSSBBT', 'CC.....BB.'],
        run1: ['B.B.......', 'BBBBSSSBBT', 'EBEBSSSBB.', '.C.C..B.B.'],
        loaf: ['.B.B....', '.BBBB...', '.EBEB..T', 'BBSSSSBT', 'BBBBBBBB'],
        stretch: ['.......B.B', '.......BBB', 'T......EBE', 'TBSSSSBBB.', '.CC....C.C'],
        pounce: ['.....B.B', '.....BBBB', '..SSSEBE', 'TSSSSBB.', 'T.C....C'],
    };
    function catColours(spec) {
        const { base, marks, chest, pattern } = spec;
        const S = pattern === 'solid' ? base : marks;
        const C = pattern === 'tuxedo' || pattern === 'tabby' ? chest : pattern === 'splotch' ? base : base;
        return { B: base, S, C, E: spec.eyes || '#6ab04a', T: pattern === 'splotch' ? marks : base, N: '#f08ab0', F: shade(base, 0.25), G: '#f8f8f8' };
    }
    // Every frame of a cat, both ways, with a hat slot above the head.
    function cat(spec) {
        const map = catColours(spec);
        const sheet = spec.big || spec.fluffy ? CAT_BIG : CAT;
        const out = {};
        for (const [name, lines] of Object.entries(sheet)) {
            let art = lines;
            if (spec.fluffy) art = fluff(lines);
            if (spec.grin && name !== 'sleep') art = grin(art);
            out[name] = both(art, map, 2);
        }
        out.head = { x: 1, y: 0 };
        return out;
    }
    // Fluff: a lighter pixel wherever the body meets the air, below the ears.
    function fluff(lines) {
        const h = lines.length, w = Math.max(...lines.map(l => l.length));
        const at = (x, y) => (lines[y] || '')[x] || '.';
        return lines.map((line, y) => {
            let out = '';
            for (let x = 0; x < w; x++) {
                const ch = at(x, y);
                if (ch === '.' && y >= 2 && y < h - 1 && 'BS'.includes(at(x - 1, y)) && 'BS'.includes(at(x, y - 1)) && (x + y) % 2 === 0) out += 'F';
                else out += ch;
            }
            return out;
        });
    }
    // Moofy's grin: two white pixels under the eyes.
    function grin(lines) {
        return lines.map((line, y, all) => {
            const above = all[y - 1] || '';
            const i = above.indexOf('EBE');
            if (i < 0) return line;
            const chars = [...line];
            if (chars[i] && chars[i] !== '.') chars[i] = 'G';
            if (chars[i + 2] && chars[i + 2] !== '.') chars[i + 2] = 'G';
            return chars.join('');
        });
    }
    const CAT_HATS = { witch: both(['..K..', '.KKK.', 'KKKKK'], { K: '#2a1a3a' }, 1), santa: both(['..W..', '.RRR.', 'WWWWW'], { W: '#f8f8f8', R: '#d9453a' }, 1),
        party: both(['..Y..', '.YPY.', 'YPYPY'], { Y: '#e8c04a', P: '#f08ab0' }, 1), bunny: both(['W.W', 'W.W', 'WWW'], { W: '#f8f8f8' }, 1), crown: both(['Y.Y.Y', 'YYYYY'], { Y: '#f0c040' }, 1) };

    // ---- Other animals -------------------------------------------------------------------------------

    const DOG_COATS = [{ B: '#b8864a', S: '#8a5a2a', C: '#f0e0c0' }, { B: '#f0e8d8', S: '#3a3a3a', C: '#f0e8d8' }, { B: '#2a2a2a', S: '#2a2a2a', C: '#d8b070' }, { B: '#c8c0b0', S: '#8a8070', C: '#f4f1ea' }];
    const DOG = {
        sit: ['BB.....', 'EBB....', 'BBBB..T', 'CBSSBBT', 'CBBBBB.', 'C..C.B.'],
        walk0: ['BB......', 'EBB.....', 'BBBSSBBT', 'CBBBBBB.', 'C.C..B.B'],
        walk1: ['BB......', 'EBB.....', 'BBBSSBBT', 'CBBBBBB.', '.CC..BB.'],
        run0: ['BB.......', 'EBBSSBBBT', 'CC.....BB'],
        run1: ['BB......T', 'EBBSSBBB.', '.CC..B.B.'],
        lie: ['BB......', 'EBBSSBBT', 'CCBBBBB.'],
    };
    const dog = coat => { const map = { ...coat, E: '#1a1a20', T: coat.B }; const out = {}; for (const [k, v] of Object.entries(DOG)) out[k] = both(v, map, 2); return out; };

    const BIRD_COATS = [{ B: '#8a6a4a', W: '#5a4a3a', C: '#d8c8a8' }, { B: '#3a7fd9', W: '#2a5aa8', C: '#f0f0f0' }, { B: '#d9453a', W: '#a83020', C: '#d9453a' }, { B: '#f0f0f0', W: '#c8c8c8', C: '#f0f0f0' }, { B: '#f0c040', W: '#c89a20', C: '#f8e8a0' }];
    const BIRD = { perch: ['.BB', 'YBC', '.W.'], fly0: ['W...W', '.BBB.', '..C..'], fly1: ['.....', 'WBBBW', '..C..'], peck: ['...', 'YBC', '.W.'] };
    const bird = coat => { const map = { ...coat, Y: '#e0a030' }; const out = {}; for (const [k, v] of Object.entries(BIRD)) out[k] = both(v, map, 1); return out; };
    const GOOSE = { fly0: ['K......K', '.WWBBWW.', '...KK...'], fly1: ['........', 'KWWBBWWK', '...KK...'] };
    const goose = () => { const map = { K: '#2a2a2a', W: '#b8a890', B: '#8a7a68' }; const out = {}; for (const [k, v] of Object.entries(GOOSE)) out[k] = both(v, map, 3); return out; };
    const BUTTERFLY = [{ A: '#f0c040', B: '#e08a20' }, { A: '#f08ab0', B: '#c04a80' }, { A: '#9ad0e8', B: '#3a7fd9' }, { A: '#f8f8f8', B: '#c8c8c8' }];
    const butterfly = coat => ({ open: both(['A.A', 'BKB', 'A.A'], { ...coat, K: '#2a2a2a' }, 1), shut: both(['.A.', '.K.', '.A.'], { ...coat, K: '#2a2a2a' }, 1) });
    const RABBIT = { sit: ['B.B.', 'BBB.', 'EBBB', 'BBBB', 'B.BW'], hop: ['B.B..', 'BBB..', 'EBBBB', '.BBBW', 'B...B'] };
    const rabbit = winter => { const map = winter ? { B: '#f0eee8', E: '#1a1a20', W: '#d8d6d0' } : { B: '#a88a6a', E: '#1a1a20', W: '#f0e8d8' }; const out = {}; for (const [k, v] of Object.entries(RABBIT)) out[k] = both(v, map, 2); return out; };
    const DEER = {
        stand: ['.A.A......', '.AA.......', 'EBB.......', '.BB.......', '.BBBBBBBB.', '.BBWWWBBB.', '.B.B...B.B', '.B.B...B.B'],
        walk0: ['.A.A......', '.AA.......', 'EBB.......', '.BB.......', '.BBBBBBBB.', '.BBWWWBBB.', 'B..B..B..B', 'B..B..B..B'],
        walk1: ['.A.A......', '.AA.......', 'EBB.......', '.BB.......', '.BBBBBBBB.', '.BBWWWBBB.', '.B.B...B.B', '..BB...BB.'],
        graze: ['..........', '..........', '..........', '.BBBBBBBB.', 'BBBWWWBBB.', 'EB.B...B.B', 'BB.B...B.B', '..........'],
    };
    const deer = antlers => { const map = { B: '#a8784a', W: '#e8d8b8', E: '#1a1a20', A: antlers ? '#6a4a2a' : null }; const out = {}; for (const [k, v] of Object.entries(DEER)) out[k] = both(v, map, 3); return out; };
    const FOX = { walk0: ['.B.B.....', 'EBBB.....', 'WBBBBBBTT', '.KK..KK.W'], walk1: ['.B.B.....', 'EBBB.....', 'WBBBBBBTT', 'K.K..K.KW'], sit: ['.B.B...', 'EBBB...', 'WBBBB.T', 'WBBBBTT', '.KK.K.W'] };
    const fox = () => { const map = { B: '#e07a2a', W: '#f8f0e0', K: '#2a2a2a', E: '#1a1a20', T: '#c0581a' }; const out = {}; for (const [k, v] of Object.entries(FOX)) out[k] = both(v, map, 2); return out; };
    const GOAT = { stand: ['H.H....', 'EBB....', 'WBBBBBB', '.BBBBBB', '.K.K.K.', '.K.K.K.'], walk: ['H.H....', 'EBB....', 'WBBBBBB', '.BBBBBB', 'K.K.K.K', 'K.K...K'], graze: ['.......', '.......', 'H.BBBBB', 'EBBBBBB', 'WK.K.K.', '.K.K.K.'] };
    const goat = () => { const map = { B: '#e8e4dc', W: '#c8c4bc', K: '#4a4a4a', H: '#8a7a6a', E: '#1a1a20' }; const out = {}; for (const [k, v] of Object.entries(GOAT)) out[k] = both(v, map, 2); return out; };
    const DUCK = { a: ['.BB..', 'YBE..', '.BBBB', '.BBB.'], b: ['.BB..', 'YBE..', '.BBBW', '.BBB.'] };
    const duck = mallard => { const map = mallard ? { B: '#3a6a3a', Y: '#e0a030', E: '#1a1a20', W: '#8a6a4a' } : { B: '#f8f8f0', Y: '#e0a030', E: '#1a1a20', W: '#d8d8d0' }; const out = {}; for (const [k, v] of Object.entries(DUCK)) out[k] = both(v, map, 1); return out; };
    const fish = () => both(['.BBB', 'BBBW', '.BBB'], { B: '#8fd0f0', W: '#4fa0d8' }, 2);
    const owl = () => ({ open: both(['B.B', 'EBE', 'BYB', 'BBB', 'B.B'], { B: '#6a5a4a', E: '#f0c040', Y: '#e0a030' }, 1), shut: both(['B.B', 'BBB', 'BYB', 'BBB', 'B.B'], { B: '#6a5a4a', Y: '#e0a030' }, 1) });
    const ghost = () => ({ a: both(['.WWWW.', 'WWWWWW', 'WKWWKW', 'WWWWWW', 'WWWWWW', 'W.WW.W'], { W: '#e8f0ff', K: '#2a2a4a' }, 2), b: both(['.WWWW.', 'WWWWWW', 'WKWWKW', 'WWWWWW', 'WWWWWW', '.W.W.W'], { W: '#e8f0ff', K: '#2a2a4a' }, 2) });
    const bat = () => ({ a: both(['K...K', 'KKKKK', '..K..'], { K: '#2a2030' }, 2), b: both(['.....', 'KKKKK', 'K.K.K'], { K: '#2a2030' }, 2) });
    const DRAGON = { peek: ['...GGG....', '..GGEGG...', '.GGGGGGGG.', 'GGGGGGGGGG', '.NGGGGGGG.', '...GGGGGG.'], roar: ['...GGG....', '..GGEGG...', '.GGGGGGGG.', 'GGGGGGGGGG', 'YNGGGGGGG.', '...GGGGGG.'], asleep: ['...GGG....', '..GGGGG...', '.GGGGGGGG.', 'GGGGGGGGGG', '.NGGGGGGG.', '...GGGGGG.'] };
    const dragon = () => { const map = { G: '#5a9a5a', E: '#f0c040', N: '#f0f0f0', Y: '#ff8a2a' }; const out = {}; for (const [k, v] of Object.entries(DRAGON)) out[k] = both(v, map, 4); return out; };

    // ---- Props --------------------------------------------------------------------------------------

    const pumpkin = () => ({ dark: rows(['..G..', '.OOO.', 'OOOOO', 'OKOKO', '.OOO.'], { G: '#4a7a3a', O: '#e07a2a', K: '#3a2010' }, false, 2),
        lit: rows(['..G..', '.OOO.', 'OOOOO', 'OYOYO', '.OYO.'], { G: '#4a7a3a', O: '#f0882a', Y: '#ffe070' }, false, 2) });
    const snowman = () => rows(['.KKK.', '.WWW.', 'WEWEW', '.WOW.', 'RRRRR', '.WWW.', 'WWWWW', 'WWKWW', 'WWWWW'], { K: '#2a2a30', W: '#f8f8f8', E: '#2a2a30', O: '#f08a2a', R: '#d9453a' }, false, 2);
    const present = colour => rows(['.Y.Y.', 'CCYCC', 'YYYYY', 'CCYCC', 'CCYCC'], { Y: '#f0c040', C: colour }, false, 2);
    const egg = colour => rows(['.C.', 'CDC', 'CCC'], { C: colour, D: shade(colour, -0.3) }, false, 1);
    const heart = () => rows(['P.P', 'PPP', '.P.'], { P: '#f05a8a' }, false, 1);
    const balloon = colour => rows(['.CC.', 'CCCC', 'CCCC', '.CC.', '..K.'], { C: colour, K: '#4a4a4a' }, false, 1);
    const cake = () => rows(['..Y..', 'PPYPP', 'PPPPP', 'WWWWW', 'BBBBB', 'WWWWW', 'BBBBB'], { Y: '#ffe070', P: '#f08ab0', W: '#f8f8f8', B: '#c08a5a' }, false, 2);
    const wreath = () => rows(['.GG.', 'GRGG', 'GGRG', '.GG.'], { G: '#3a8a4a', R: '#d9453a' }, false, 1);
    const shamrock = () => rows(['G.G', 'GGG', '.G.'], { G: '#3aa86a' }, false, 1);
    const potOfGold = () => rows(['.YYY.', 'KKKKK', 'KKKKK', '.KKK.'], { Y: '#f0c040', K: '#2a2a2a' }, false, 2);
    const lamp = () => ({ off: rows(['.W.', 'WGW', 'WGW', '.K.', '.K.', '.K.', '.K.', '.K.', 'KKK'], { W: '#4a4a4a', G: '#9ad0e8', K: '#3a3a3a' }, false, 1),
        on: rows(['.W.', 'WLW', 'WLW', '.K.', '.K.', '.K.', '.K.', '.K.', 'KKK'], { W: '#4a4a4a', L: '#ffe9a0', K: '#3a3a3a' }, false, 1) });
    const bench = () => rows(['WWWWWWW', 'W.....W', 'WWWWWWW', 'W.....W'], { W: '#8a5a3a' }, false, 3);
    const well = () => rows(['.RRRRR.', 'RRRRRRR', 'W.....W', 'W.....W', 'SSSSSSS', 'SBBBBBS', 'SSSSSSS'], { R: '#8a5a3a', W: '#6a4229', S: '#a0a0a8', B: '#4fa0d8' }, false, 3);
    const stall = () => rows(['RWRWRWRWR', 'RWRWRWRWR', 'W.......W', 'W.OOGGPPW', 'WWWWWWWWW', 'W.......W'], { R: '#d9453a', W: '#8a5a3a', O: '#f08a2a', G: '#5fbf4e', P: '#f08ab0' }, false, 4);
    const ladder = h => { const lines = []; for (let y = 0; y < h; y++) lines.push(y % 2 ? 'WWW' : 'W.W'); return rows(lines, { W: '#8a5a3a' }, false, 1); };
    const signpost = () => rows(['WWWWW', 'WWWWW', '..K..', '..K..', '..K..'], { W: '#c9a85a', K: '#6a4229' }, false, 2);
    const flowerpot = () => rows(['PGP', '.G.', 'OOO', '.O.'], { P: '#f08ab0', G: '#5fbf4e', O: '#c0703a' }, false, 1);
    const sleigh = () => ({ a: both(['...RR......A.A..A.A', '...WW.......AA...AA', 'R.RRRR...RGBBBBBBBB', 'RRRRRRRRRGBBBBBBBB.', '.RRRRRRR..B.B..B.B.', 'G.......G.B.B..B.B.'], { R: '#d9453a', W: '#f8f8f8', G: '#f0c040', A: '#8a6a4a', B: '#8a5a3a' }, 4),
        b: both(['...RR......A.A..A.A', '...WW.......AA...AA', 'R.RRRR...RGBBBBBBBB', 'RRRRRRRRRGBBBBBBBB.', '.RRRRRRR...B.B..B.B', 'G.......G..BB...BB.'], { R: '#d9453a', W: '#f8f8f8', G: '#f0c040', A: '#8a6a4a', B: '#8a5a3a' }, 4) });

    // The sky-boat: a hot-air balloon with a basket, striped in two colours.
    function airBalloon(a, b) {
        const c = canvas(13, 20), g = c.getContext('2d');
        for (let y = 0; y < 13; y++) {
            const u = (y - 6) / 6.5, hw = Math.round(6 * Math.sqrt(Math.max(0, 1 - u * u)) * (y > 9 ? 0.8 : 1));
            for (let x = 6 - hw; x <= 6 + hw; x++) dot(g, x, y, Math.floor((x + 1) / 3) % 2 ? a : b);
            if (hw > 1) { dot(g, 6 - hw, y, shade(Math.floor((6 - hw + 1) / 3) % 2 ? a : b, -0.25)); dot(g, 6 + hw, y, shade(Math.floor((6 + hw + 1) / 3) % 2 ? a : b, -0.25)); }
        }
        for (let y = 13; y < 16; y++) { dot(g, 4, y, '#6a4229'); dot(g, 8, y, '#6a4229'); }
        for (let y = 16; y < 20; y++) for (let x = 3; x <= 9; x++) dot(g, x, y, (x + y) % 2 ? '#c9a85a' : '#a8884a');
        return { c, w: 13, h: 20, ax: 6, basket: { x: 4, y: 15 } };
    }

    // ---- Trees -------------------------------------------------------------------------------------

    // A tree of a kind and size, for a season: a trunk and a canopy as two
    // sprites, so the canopy can sway. Autumn broadleaves pick their own
    // colour; winter ones are bare, with snow; apples fruit in late summer.
    function tree(kind, size, season, k, o = {}) {
        const sizes = [[5, 4], [7, 6], [9, 8]];
        const [cw, ch] = sizes[size];
        const th = size + 2 + (kind === 'tall' ? 3 : 0);
        const trunkC = kind === 'birch' ? '#e8e4dc' : '#6a4229', trunkD = kind === 'birch' ? '#9a9088' : '#4a2e1a';
        const H = (kind === 'tall' ? ch + 4 : ch) + th, W = cw;
        const c = canvas(W, H), g = c.getContext('2d');
        const canopy = canvas(W, H), cg = canopy.getContext('2d');
        const cx = Math.floor(W / 2);
        for (let y = H - th; y < H; y++) { dot(g, cx, y, trunkC); if (size > 0) dot(g, cx + 1, y, trunkD); if (kind === 'birch' && y % 3 === 1) dot(g, cx, y, trunkD); }
        let [light, dark] = FOLIAGE[season][kind] || FOLIAGE[season].round;
        if (season === 'autumn' && kind !== 'pine') {
            const picks = [['#e0902e', '#b85c22'], ['#d9453a', '#a83020'], ['#e8c23a', '#b8902a'], ['#c87a30', '#9a5a20'], ['#b8b04e', '#8a8a3a']];
            [light, dark] = picks[Math.floor(k * picks.length) % picks.length];
        }
        const bare = season === 'winter' && kind !== 'pine';
        if (kind === 'pine') {
            // Tiers of a fir.
            const tiers = size + 2, top = 0, bottom = H - th + 1;
            for (let y = top; y <= bottom; y++) {
                const t = (y - top) / Math.max(1, bottom - top);
                const tier = Math.floor(t * tiers), within = t * tiers - tier;
                const hw = Math.round((0.2 + within * 0.8) * (0.4 + 0.6 * (tier + 1) / tiers) * (cw / 2));
                for (let x = cx - hw; x <= cx + hw; x++) dot(cg, x, y, x < cx ? light : dark);
                if (season === 'winter' && within < 0.3) for (let x = cx - hw; x <= cx + hw; x++) dot(cg, x, y, (x + y) % 2 ? P.snow : P.snow2);
            }
        } else if (bare) {
            // Bare branches, a dusting of snow on them.
            const top = kind === 'tall' ? 0 : 1;
            for (let y = top; y < H - th + 1; y++) {
                const t = (y - top) / Math.max(1, H - th - top);
                const hw = Math.max(0, Math.round((cw / 2) * (kind === 'tall' ? 0.35 : Math.sin(t * Math.PI) * 0.9)));
                for (let x = cx - hw; x <= cx + hw; x++) if ((x * 7 + y * 3) % 4 < 2 || y === H - th) dot(cg, x, y, (x + y) % 3 ? light : dark);
                for (let x = cx - hw; x <= cx + hw; x++) if ((x * 5 + y * 11) % 7 < 2) dot(cg, x, y - 1 >= 0 ? y - 1 : y, P.snow);
            }
            for (let y = 0; y < th; y++) dot(cg, cx, H - th + y, trunkC);
        } else {
            // A round canopy (tall: a narrow oval), lit from the upper left.
            const rx = cw / 2, ry = kind === 'tall' ? (ch + 4) / 2 : ch / 2, cy = ry;
            for (let y = 0; y < ry * 2; y++) for (let x = 0; x < W; x++) {
                const dx = (x - cx) / rx, dy = (y - cy) / ry;
                if (dx * dx + dy * dy > 1) continue;
                const lit = dx * 0.6 + dy < -0.2 && (x + y) % 3 !== 0;
                dot(cg, x, y, lit ? light : dark);
            }
            if (kind === 'apple' && (season === 'summer' || season === 'autumn') && size > 0) for (let i = 0; i < size * 2 + 1; i++) dot(cg, cx - size + Math.floor(((i * 7) % (cw - 1))), 1 + Math.floor((i * 5) % Math.max(1, ch - 2)), '#d9453a');
            if (kind === 'apple' && season === 'spring') for (let i = 0; i < size * 3 + 2; i++) dot(cg, Math.floor((i * 7 + 3) % W), Math.floor((i * 5 + 1) % Math.max(1, ch - 1)), '#f8d8e8');
            if (season === 'winter') for (let x = 1; x < W - 1; x++) dot(cg, x, Math.max(0, Math.round(cy - ry * Math.sqrt(Math.max(0, 1 - ((x - cx) / rx) ** 2)) + 0.5)), P.snow);
        }
        return { trunk: { c, w: W, h: H, ax: cx }, canopy: { c: canopy, w: W, h: H, ax: cx } };
    }

    // ---- Buildings ---------------------------------------------------------------------------------

    // A house from its layout record: walls and a roof of a style, a door,
    // windows (returned, for lighting at night), a chimney (for smoke), a
    // window box in the warm months, a sign for a shop. Snow caps the roof
    // in winter. The sprite's bottom row is the doorstep.
    function house(hs, season, o = {}) {
        const wall = WALLS[hs.wall % WALLS.length], wallD = shade(wall, -0.18);
        const roof = hs.kind === 'barn' ? '#b8402e' : hs.roofStyle === 'thatch' ? '#c9a85a' : ROOFS[hs.roof % ROOFS.length];
        const roofD = shade(roof, -0.3), roofL = shade(roof, 0.15);
        const w = hs.w, bodyH = hs.h;
        const roofH = hs.kind === 'tower' || hs.kind === 'chapel' ? Math.round(w * 0.9) : hs.roofStyle === 'flat' ? 2 : hs.roofStyle === 'hip' ? Math.round(w * 0.3) : Math.round(w * 0.42);
        const steeple = hs.kind === 'chapel' ? 8 : 0;
        const H = bodyH + roofH + steeple + 1, top = roofH + steeple;
        const c = canvas(w, H), g = c.getContext('2d');
        const bodyWall = hs.kind === 'barn' ? '#c84a36' : wall, bodyWallD = hs.kind === 'barn' ? '#9a3628' : wallD;
        // Walls, the shaded side on the right (or the left, flipped).
        for (let y = top; y < H; y++) for (let x = 0; x < w; x++) dot(g, x, y, (hs.flip ? x < 2 : x >= w - 2) ? bodyWallD : bodyWall);
        if (hs.kind === 'barn') for (let x = 0; x < w; x++) if (x % 3 === 0) for (let y = top; y < H; y++) dot(g, x, y, bodyWallD);
        // Timber on a cottage.
        if (hs.kind === 'cottage' && hs.wall % 2) { for (let x = 0; x < w; x += 4) for (let y = top; y < H; y++) dot(g, x, y, '#8a6a4a'); for (let x = 0; x < w; x++) dot(g, x, top, '#8a6a4a'); }
        // The roof.
        const snow = season === 'winter';
        if (hs.roofStyle === 'flat' && hs.kind !== 'tower' && hs.kind !== 'chapel') {
            for (let x = 0; x < w; x++) { dot(g, x, top - 1, roofD); dot(g, x, top - 2, x % 2 ? roof : roofL); }
            if (snow) for (let x = 0; x < w; x++) dot(g, x, top - 2, P.snow);
        } else if (hs.kind === 'tower' || hs.kind === 'chapel') {
            // A pointed roof, and a steeple with a bell on the chapel.
            const cx = (w - 1) / 2;
            for (let y = 0; y < roofH; y++) {
                const hw = (y + 0.5) / roofH * (w / 2);
                for (let x = 0; x < w; x++) if (Math.abs(x - cx) <= hw) dot(g, x, steeple + y, x < cx ? roof : roofD);
                if (snow && y < roofH * 0.5) for (let x = 0; x < w; x++) if (Math.abs(x - cx) <= hw && Math.abs(x - cx) >= hw - 1) dot(g, x, steeple + y, P.snow);
            }
            if (steeple) {
                for (let y = 0; y < steeple; y++) { dot(g, Math.floor(cx), y, y < 3 ? P.gold : roofD); dot(g, Math.ceil(cx), y, y < 3 ? P.gold : roofD); }
                dot(g, Math.floor(cx), 4, '#c0902a'); dot(g, Math.ceil(cx), 4, '#c0902a');
            }
        } else if (hs.roofStyle === 'hip') {
            for (let y = 0; y < roofH; y++) {
                const inset = Math.round((roofH - 1 - y) / roofH * (w * 0.3));
                for (let x = inset; x < w - inset; x++) dot(g, x, steeple + y, x < w * 0.5 ? roof : roofD);
            }
            if (snow) for (let y = 0; y < 2; y++) { const inset = Math.round((roofH - 1 - y) / roofH * (w * 0.3)); for (let x = inset; x < w - inset; x++) dot(g, x, steeple + y, P.snow); }
        } else {
            // Gable (or thatch, rounder): widening to the eaves.
            const cx = (w - 1) / 2;
            for (let y = 0; y < roofH; y++) {
                const t = (y + 0.5) / roofH;
                const hw = (hs.roofStyle === 'thatch' ? Math.sqrt(t) : t) * (w / 2 + 0.5);
                for (let x = 0; x < w; x++) if (Math.abs(x - cx) <= hw) dot(g, x, steeple + y, x < cx ? (hs.roofStyle === 'thatch' && (x + y) % 3 === 0 ? roofD : roof) : roofD);
                if (snow) for (let x = 0; x < w; x++) if (Math.abs(x - cx) <= hw && Math.abs(x - cx) > hw - 1.2) dot(g, x, steeple + y, P.snow);
            }
            for (let x = 0; x < w; x++) dot(g, x, top - 1, roofD);
        }
        // Door and windows.
        const windows = [];
        const doorX = hs.door === 0 ? 2 : hs.door === 1 ? Math.floor(w / 2) - 1 : w - 4;
        const doorH = Math.min(5, bodyH - 2);
        for (let y = H - doorH; y < H; y++) for (let x = doorX; x < doorX + 3; x++) dot(g, x, y, '#6a4229');
        dot(g, doorX + 2, H - 3, P.gold);
        if (hs.kind === 'barn') { for (let y = H - doorH; y < H; y++) for (let x = doorX - 1; x < doorX + 4; x++) dot(g, x, y, (Math.abs(x - doorX - 1) === Math.abs(y - (H - doorH) - 2) ? '#f0e0c0' : '#6a4229')); }
        const rowsOfWindows = bodyH >= 14 ? 2 : 1;
        for (let r = 0; r < rowsOfWindows; r++) {
            const wy = top + 2 + r * 6;
            if (wy + 3 > H - doorH - 1 && r > 0) break;
            for (let x = 1; x + 3 <= w - 1; x += 5) {
                if (x < doorX + 4 && x + 3 > doorX - 1 && wy + 3 >= H - doorH) continue;
                if (hs.kind === 'barn' && r === 0) continue;
                const win = { x, y: wy, w: 3, h: 3 };
                for (let yy = win.y; yy < win.y + win.h; yy++) for (let xx = win.x; xx < win.x + win.w; xx++) dot(g, xx, yy, P.glass);
                dot(g, win.x + 1, win.y + 1, '#6a4229');
                windows.push(win);
                // A window box of flowers, spring and summer.
                if ((season === 'spring' || season === 'summer') && r === rowsOfWindows - 1 && hs.kind !== 'barn' && hs.kind !== 'tower') for (let xx = win.x; xx < win.x + 3; xx++) dot(g, xx, win.y + 3, xx % 2 ? '#5fbf4e' : ['#f08ab0', '#d9453a', '#f0c040'][(hs.id + xx) % 3]);
            }
        }
        if (hs.kind === 'chapel') { const cx = Math.floor(w / 2); for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) if (Math.abs(x) + Math.abs(y) < 2) dot(g, cx + x, top + 3 + y, '#8ab0e8'); }
        // The chimney, up through the roof on the shaded side.
        let chimney = null;
        if (hs.kind !== 'tower' && hs.kind !== 'chapel' && hs.kind !== 'barn') {
            const cxm = hs.flip ? 2 : w - 4;
            const cy = steeple + Math.max(0, Math.round(roofH * 0.35) - 1);
            for (let y = cy; y < cy + 4; y++) { dot(g, cxm, y, '#8a6a5a'); dot(g, cxm + 1, y, '#6a4a3a'); }
            chimney = { x: cxm + 1, y: cy - 1 };
        }
        // A shop sign by the door.
        if (hs.shop) {
            const sx = doorX + 4 < w - 2 ? doorX + 4 : doorX - 3, sy = H - doorH - 1;
            const col = hs.shop === 'bakery' ? '#f0c040' : hs.shop === 'inn' ? '#d9453a' : '#3aa86a';
            dot(g, sx, sy, col); dot(g, sx + 1, sy, col); dot(g, sx, sy + 1, col); dot(g, sx + 1, sy + 1, col);
        }
        return { c, w, h: H, ax: Math.floor(w / 2), windows, chimney, door: { x: doorX + 1, y: H - 1 }, roofTop: steeple + 1, eaves: top - 1, sills: windows.map(win => ({ x: win.x + 1, y: win.y + 3 })) };
    }

    // The windmill: a tower and four sails in four turns.
    function windmill(season) {
        const tower = canvas(9, 18), g = tower.getContext('2d');
        for (let y = 2; y < 18; y++) { const hw = 2 + Math.round((y - 2) / 16 * 2); for (let x = 4 - hw; x <= 4 + hw; x++) dot(g, x, y, x > 4 + hw - 2 ? '#8a7a6a' : '#c8b8a0'); }
        for (let x = 1; x <= 7; x++) dot(g, x, 1, '#6a4229'); for (let x = 2; x <= 6; x++) dot(g, x, 0, '#8a5a3a');
        if (season === 'winter') for (let x = 2; x <= 6; x++) dot(g, x, 0, P.snow);
        for (let y = 14; y < 18; y++) for (let x = 3; x <= 5; x++) dot(g, x, y, '#4a2e1a');
        const sails = [];
        for (let f = 0; f < 4; f++) {
            const c = canvas(17, 17), sg = c.getContext('2d');
            const a0 = f * Math.PI / 8;
            for (let k = 0; k < 4; k++) {
                const a = a0 + k * Math.PI / 2;
                for (let r = 1; r <= 8; r++) {
                    const x = Math.round(8 + Math.cos(a) * r), y = Math.round(8 + Math.sin(a) * r);
                    dot(sg, x, y, '#6a4229');
                    if (r >= 3) dot(sg, Math.round(8 + Math.cos(a) * r - Math.sin(a) * 1.2), Math.round(8 + Math.sin(a) * r + Math.cos(a) * 1.2), '#f0e8d8');
                }
            }
            dot(sg, 8, 8, '#4a2e1a');
            sails.push({ c, w: 17, h: 17, ax: 8 });
        }
        return { tower: { c: tower, w: 9, h: 18, ax: 4 }, sails, hub: { x: 4, y: 4 } };
    }

    function lighthouse() {
        const c = canvas(7, 22), g = c.getContext('2d');
        for (let y = 5; y < 22; y++) { const hw = 1 + Math.round((y - 5) / 17 * 2); for (let x = 3 - hw; x <= 3 + hw; x++) dot(g, x, y, Math.floor(y / 3) % 2 ? '#d9453a' : '#f4f1ea'); }
        for (let x = 1; x <= 5; x++) { dot(g, x, 4, '#3a3a3a'); dot(g, x, 1, '#3a3a3a'); }
        for (let y = 2; y < 4; y++) for (let x = 2; x <= 4; x++) dot(g, x, y, '#ffe9a0');
        dot(g, 3, 0, '#3a3a3a');
        return { c, w: 7, h: 22, ax: 3, lamp: { x: 3, y: 2 } };
    }

    // The square's Christmas tree, lights' positions returned to blink.
    function squareTree(h) {
        const w = Math.round(h * 0.7) | 1, c = canvas(w, h + 2), g = c.getContext('2d'), cx = Math.floor(w / 2);
        const lights = [];
        for (let y = 1; y < h; y++) {
            const hw = Math.round((y / h) * (w / 2) * (0.6 + 0.4 * ((y * 3) % 4) / 3));
            for (let x = cx - hw; x <= cx + hw; x++) { dot(g, x, y, x < cx ? '#3a8a4a' : '#2a6a38'); if ((x * 3 + y * 5) % 7 === 0) lights.push({ x, y }); }
        }
        for (let y = h; y < h + 2; y++) dot(g, cx, y, '#6a4229');
        dot(g, cx, 0, P.gold); dot(g, cx - 1, 1, P.gold); dot(g, cx + 1, 1, P.gold);
        return { c, w, h: h + 2, ax: cx, lights };
    }

    // ---- Sky things ---------------------------------------------------------------------------------

    // A cloud: fluffy lumps, lit on top, shaded underneath, in the given colours.
    function cloud(w, h, rand, lit, shadeC) {
        const c = canvas(w, h), g = c.getContext('2d');
        const lumps = [];
        const n = 2 + Math.floor(w / 12);
        for (let i = 0; i < n; i++) lumps.push({ x: w * (0.15 + 0.7 * (i + 0.5) / n) + (rand() - 0.5) * w * 0.15, y: h * (0.55 + (rand() - 0.5) * 0.3), r: h * (0.35 + rand() * 0.3) });
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            let inside = false, depth = 0;
            for (const l of lumps) { const d = Math.hypot((x - l.x) / 1.6, y - l.y); if (d <= l.r) { inside = true; depth = Math.max(depth, (l.y - y) / l.r); } }
            if (!inside) continue;
            if (y >= h - 1 || (y > h * 0.75 && (x + y) % 2)) dot(g, x, y, shadeC);
            else dot(g, x, y, depth > -0.3 ? lit : shadeC);
        }
        return { c, w, h, ax: Math.floor(w / 2) };
    }
    const sun = () => rows(['.YYY.', 'YWWWY', 'YWWWY', 'YWWWY', '.YYY.'], { Y: '#ffd860', W: '#fff4c0' }, false, 2);
    function moon(phase) {
        // phase 0..1 round the month: the lit limb toward the sun.
        const r = 4, c = canvas(9, 9), g = c.getContext('2d');
        const k = Math.cos(phase * 2 * Math.PI);        // -1 full, +1 new
        for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
            if (x * x + y * y > r * r + 1) continue;
            const edge = Math.sqrt(Math.max(0, r * r - y * y));
            const terminator = k * edge;
            const lit = phase < 0.5 ? x >= terminator - 0.5 : x <= -terminator + 0.5;
            dot(g, x + r, y + r, lit ? ((x + y) % 3 ? '#f4f0d8' : '#e0dcc0') : '#2a2e48');
        }
        return { c, w: 9, h: 9, ax: 4 };
    }
    const rainbow = (r, alpha) => {
        const colours = ['#ff4a4a', '#ffa040', '#ffe040', '#60d060', '#40a0ff', '#8060e0'];
        const c = canvas(r * 2 + 2, r + 1), g = c.getContext('2d');
        g.globalAlpha = alpha;
        for (let x = 0; x <= r * 2 + 1; x++) for (let y = 0; y <= r; y++) {
            const d = Math.hypot(x - r, y - r);
            const band = Math.floor(r - d);
            if (band >= 0 && band < colours.length) dot(g, x, y, colours[band]);
        }
        return { c, w: r * 2 + 2, h: r + 1, ax: r };
    };

    return { canvas, dot, rows, both, flipped, shade, mixHex, SKIN, HAIR, CLOTH, PANTS, WALLS, ROOFS, GROUND, FOLIAGE, WATER, ROCK, P,
        person, hat, HATS, TOOLS, ROSTER, STRAY_COATS, cat, CAT_HATS, DOG_COATS, dog, BIRD_COATS, bird, goose, BUTTERFLY, butterfly, rabbit, deer, fox, goat, duck, fish, owl, ghost, bat, dragon,
        pumpkin, snowman, present, egg, heart, balloon, cake, wreath, shamrock, potOfGold, lamp, bench, well, stall, ladder, signpost, flowerpot, sleigh, airBalloon,
        tree, house, windmill, lighthouse, squareTree, cloud, sun, moon, rainbow };
})();
