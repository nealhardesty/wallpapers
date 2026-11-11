// Sky Island's pixel art: every sprite drawn a pixel at a time into a small
// canvas, in the manner of a 16-bit role-playing game: outlines in a dark
// tint of the thing, four or five shades to a material, the light from the
// upper left. The stage's canvas is the picture at its own resolution (a
// pixel here is a couple of CSS pixels), scaled up pixelated.
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
    const rect = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };

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
    // A longer animal: the column at `col` doubled in every row.
    const widen = (lines, col, n = 1) => lines.map(l => l.slice(0, col + 1) + l[col].repeat(n) + l.slice(col + 1));

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
    // A dark outline round everything drawn so far, in the given colour.
    function outline(c, colour) {
        const w = c.width, h = c.height, g = c.getContext('2d');
        const d = g.getImageData(0, 0, w, h).data;
        const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0;
        const out = [];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) out.push([x, y]);
        for (const [x, y] of out) dot(g, x, y, colour);
    }
    const hash = (x, y) => { let h = (x * 73856093) ^ (y * 19349663); h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

    // ---- Palette ----------------------------------------------------------------------------------

    const SKIN = ['#f3c9a2', '#e2a97e', '#c58a5c', '#9c6a44', '#6f4a2e', '#f6d8bb'];
    const HAIR = ['#2a1d14', '#5a3a1e', '#a86a2c', '#e0b24a', '#9c9c9c', '#c43d2a', '#1c1c24', '#e8e0d0'];
    const CLOTH = ['#d9453a', '#3a6fd9', '#3aa86a', '#e0a63a', '#8a4ad0', '#e07aa8', '#3ab6c0', '#f0f0f0', '#5a4a3a', '#c0c0c0', '#2a3a5a'];
    const PANTS = ['#2a3a5a', '#5a4a3a', '#3a3a3a', '#7a5a3a', '#4a6a8a'];
    const WALLS = ['#f6e8c8', '#f2d2b0', '#d8e6c0', '#c4dcec', '#e4d6ee', '#ece4d4'];
    const ROOFS = ['#c94e3b', '#5f7290', '#8a5a3a', '#4c9a8a', '#b8863b'];
    const GROUND = {
        spring: { grass: '#7ed66a', grass2: '#62bf52', grass3: '#4ea844', dark: '#3f8a39', light: '#9ae07c', path: '#d2b98a', path2: '#bda278', stone: '#b4ac9c' },
        summer: { grass: '#62c654', grass2: '#4bad44', grass3: '#3d9a3a', dark: '#2f7f31', light: '#86d66a', path: '#d2b98a', path2: '#bda278', stone: '#b4ac9c' },
        autumn: { grass: '#bcb650', grass2: '#9fa040', dark: '#7a7d2c', grass3: '#8a8a36', light: '#d2c866', path: '#c8ae82', path2: '#b29672', stone: '#b0a898' },
        winter: { grass: '#eef3f8', grass2: '#dbe5f0', grass3: '#cfdbe8', dark: '#b8c8da', light: '#f8fbff', path: '#dadfe8', path2: '#c3c9d4', stone: '#c0c6d0' },
    };
    const FOLIAGE = {
        spring: { round: ['#4e9a3c', '#6cc050', '#92dc6c', '#c0f090'], tall: ['#4e9a3c', '#6cc050', '#92dc6c', '#c0f090'], birch: ['#5fa44a', '#86cc62', '#aee284', '#d0f0a8'], apple: ['#4e9a3c', '#6cc050', '#92dc6c', '#f6d2e2'], cherry: ['#d07aa0', '#ee9ec0', '#f8c4d8', '#fde8f0'], pine: ['#2e6f42', '#3f8f55', '#5aa868', '#7cc080'] },
        summer: { round: ['#2f7f31', '#43a23c', '#62c654', '#9ae07c'], tall: ['#2f7f31', '#43a23c', '#62c654', '#9ae07c'], birch: ['#3e9240', '#5fb84c', '#86d66a', '#b4ec94'], apple: ['#2f7f31', '#43a23c', '#62c654', '#9ae07c'], cherry: ['#2f7f31', '#45a03c', '#66c858', '#9ae07c'], pine: ['#245c38', '#33804a', '#4a9a5c', '#68b472'] },
        autumn: { round: ['#a04a1e', '#d0702a', '#e8923c', '#f6c060'], tall: ['#9a6a1a', '#c89a2a', '#e8c23a', '#f6e080'], birch: ['#a88020', '#d0a830', '#f0d040', '#f8ec90'], apple: ['#8a5a1a', '#b88a2a', '#d9a83a', '#f0d070'], cherry: ['#a83028', '#d9453a', '#f07050', '#f8a070'], pine: ['#2d6a3d', '#3f8a50', '#56a062', '#74b878'] },
        winter: { round: ['#5a4a3a', '#7a6a5a', '#9a8a7a', '#f4f8fc'], tall: ['#5a4a3a', '#7a6a5a', '#9a8a7a', '#f4f8fc'], birch: ['#8a8078', '#aaa098', '#c9c4bc', '#f4f8fc'], apple: ['#5a4a3a', '#7a6a5a', '#9a8a7a', '#f4f8fc'], cherry: ['#6a4a4a', '#8a6a6a', '#aa8a8a', '#f4f8fc'], pine: ['#2a5a38', '#3a7a4a', '#4e9058', '#f4f8fc'] },
    };
    const WATER = { deep: '#2a6cc0', base: '#3f93dc', light: '#6fc0ec', pale: '#a4e0f4', foam: '#eaf8ff', ice: '#cfe6f6', ice2: '#b8d6ea', ice3: '#e8f4fc' };
    const ROCK = { light: '#a8a4ae', mid: '#86828e', dark: '#625e6c', deep: '#46424e', soil: '#9a6e46', soil2: '#7a5434', root: '#5a3e2a', root2: '#7a5a3a', terracotta: '#c4683a', rust: '#a85230', ochre: '#c8963e', sand: '#d2b47c', moss: '#6a8a3a', moss2: '#4e6e2a', charcoal: '#4a4650', slate: '#6a6a78' };
    const P = { black: '#1a1a20', white: '#f8f8f8', wood: '#8a5a3a', wood2: '#6a4229', wood3: '#a87a4a', stone: '#aaa6a0', stone2: '#8c8882', stone3: '#c6c2bc', gold: '#f0c040', red: '#d9453a',
        glass: '#9ad8f0', glass2: '#6ab8e0', glassLit: '#ffd77a', lamp: '#ffe9a0', smoke: '#d8d8e0', smokeDim: '#aaaab4', snow: '#f4f8fc', snow2: '#d6e2ee', pink: '#f08ab0', orange: '#f08a2a', cyan: '#5af0ff', cyan2: '#20c0e8', flag: '#3aa86a', flag2: '#f0c040' };

    // ---- People -----------------------------------------------------------------------------------

    // A person: 7 wide, 12 tall, in a few frames. Letters: H hair, h hair
    // shade, S skin, E eye, T top, t top shade, P pants, B boots, M mouth.
    const PERSON = {
        stand: ['..HHH..', '.HHHHH.', '.HSSShh', '.SESES.', '..SMS..', '.TTTTt.', 'STTTTtS', '.TTTTt.', '..TTt..', '..PPP..', '..P.P..', '..B.B..'],
        walk0: ['..HHH..', '.HHHHH.', '.HSSShh', '.SESES.', '..SMS..', '.TTTTt.', 'STTTTtS', '.TTTTt.', '..TTt..', '..PPP..', '.P...P.', '.B...B.'],
        walk1: ['.......', '..HHH..', '.HHHHH.', '.HSSShh', '.SESES.', '..SMS..', '.TTTTt.', '.TTTTt.', 'STTTTtS', '..PPP..', '..P.P..', '..B.B..'],
        wave0: ['..HHH..', '.HHHHHS', '.HSSShT', '.SESEST', '..SMS.T', '.TTTTtt', 'STTTTt.', '.TTTTt.', '..TTt..', '..PPP..', '..P.P..', '..B.B..'],
        wave1: ['..HHH..', '.HHHHH.', '.HSSShh', '.SESESS', '..SMS.T', '.TTTTtT', 'STTTTt.', '.TTTTt.', '..TTt..', '..PPP..', '..P.P..', '..B.B..'],
        sit: ['..HHH..', '.HHHHH.', '.HSSShh', '.SESES.', '..SMS..', '.TTTTt.', 'STTTTtS', '.TTTTt.', '.PPPPP.', 'B.PP...', '.......', '.......'],
        work0: ['..HHH..', '.HHHHH.', '.HSSShh', '.SESES.', '..SMS..', 'STTTTt.', 'T.TTTtS', '.TTTTt.', '..TTt..', '..PPP..', '..P.P..', '..B.B..'],
        work1: ['..HHH..', '.HHHHH.', '.HSSShh', '.SESES.', '..SMS..', '.TTTTt.', 'STTTTtS', 'T.TTTt.', '..TTt..', '..PPP..', '..P.P..', '..B.B..'],
        jump: ['..HHH..', '.HHHHHS', 'SHSSShT', 'TSESEST', '.TSMS..', '.TTTTt.', '.TTTTt.', '.TTTTt.', '..TTt..', '.PPPPP.', '.P...P.', '.B...B.'],
    };
    function person(spec) {
        const map = { H: spec.hair, h: shade(spec.hair, -0.3), S: spec.skin, E: '#1a1a20', M: shade(spec.skin, -0.3), T: spec.top, t: shade(spec.top, -0.28), P: spec.pants, B: '#3a2a1a' };
        const out = {};
        for (const [name, lines] of Object.entries(PERSON)) out[name] = both(lines, map, 3);
        return out;
    }
    const HATS = {
        cap: ['..CCC..', '.CCCCC.', 'CCCCCCC'],
        straw: ['..YYY..', '.YYYYY.', 'YYYYYYY'],
        beanie: ['..RRR..', '.RRRRR.', '.RRRRR.'],
        witch: ['...K...', '..KKK..', '..KKK..', '.KKKKK.', 'KKKKKKK'],
        santa: ['...W...', '..RRR..', '.RRRRR.', 'WWWWWWW'],
        party: ['...Y...', '..YPY..', '.YPYPY.', 'YPYPYPY'],
        crown: ['.Y.Y.Y.', '.YYYYY.', '.YYYYY.'],
        chef: ['.WWWWW.', '.WWWWW.', '.WWWWW.'],
    };
    const HAT_MAP = { C: '#3a6fd9', Y: '#e8c04a', R: '#d9453a', K: '#2a1a3a', W: '#f8f8f8', P: '#f08ab0' };
    const hat = (name, flip) => HATS[name] ? rows(HATS[name], HAT_MAP, flip, 3) : null;

    // Things carried, drawn beside the hand, facing left.
    const TOOLS = {
        rod: both(['W.....', '.W....', '..W...', '...W..', '....W.', '....W.', '....W.'], { W: '#6a4a2a' }, 5),
        hoe: both(['...W', '...W', '...W', '...W', 'GGG.'], { W: '#6a4a2a', G: '#9a9aa6' }, 3),
        hammer: both(['GGG.', '.W..', '.W..', '.W..'], { W: '#6a4a2a', G: '#7a7a88' }, 1),
        can: both(['.GGG.', 'GGGGG', '.GGG.', '..G..'], { G: '#6a9a3a' }, 2),
        lantern: both(['.W.', 'LLL', 'LLL', 'LLL', '.W.'], { W: '#4a3a2a', L: '#ffd77a' }, 1),
        satchel: both(['BBB', 'BBB', 'bbb'], { B: '#8a5a3a', b: '#6a4229' }, 1),
        umbrella: both(['...RRR...', '.RRRRRRR.', 'RRRRRRRRR', '....W....', '....W....', '....W....', '....W....'], { R: '#d9453a', W: '#4a3a2a' }, 4),
        fiddle: both(['.WW', 'WWW', 'WWW', '.W.'], { W: '#a86a2c' }, 1),
        basket: both(['.W.', 'BBB', 'BBB', 'bbb'], { W: '#6a4a2a', B: '#c9a85a', b: '#a8884a' }, 1),
        broom: both(['W...', 'W...', 'W...', 'YY..', 'YYY.'], { W: '#6a4a2a', Y: '#c9a85a' }, 0),
        ball: both(['.RW.', 'RWWR', 'RRWR', '.RR.'], { R: '#d9453a', W: '#f8f8f8' }, 1),
        kite: both(['...R...', '..RRR..', '.RRRRR.', 'RRRRRRR', '.RRRRR.', '..RRR..', '...R...'], { R: '#3aa86a' }, 3),
        skates: both(['GG', 'GG'], { G: '#9ad0e8' }, 0),
    };

    // ---- Cats --------------------------------------------------------------------------------------

    // The owner's cats, as pixels. Letters: B body, b body shade, S the
    // pattern's marks, C chest and paws, E eye, N nose, T tail, F fluff, G
    // grin. `big` cats get a longer body; `fluffy` ones a soft edge.
    const ROSTER = SkyIslandLogic.ROSTER;
    const STRAY_COATS = [
        { base: '#e8893a', marks: '#c86a24', chest: '#f8f0e0', pattern: 'tabby' }, { base: '#f4f1ea', marks: '#f4f1ea', chest: '#f4f1ea', pattern: 'solid' },
        { base: '#2a2a30', marks: '#2a2a30', chest: '#2a2a30', pattern: 'solid' }, { base: '#b8b0a0', marks: '#8a8070', chest: '#e0d8c8', pattern: 'tabby' },
        { base: '#e8d0a0', marks: '#3a2a20', chest: '#e8d0a0', pattern: 'splotch' }, { base: '#6a5040', marks: '#e8893a', chest: '#6a5040', pattern: 'tortie' },
        { base: '#d8c8b8', marks: '#5a4a3a', chest: '#f4f1ea', pattern: 'splotch' }, { base: '#3a3a44', marks: '#3a3a44', chest: '#f4f1ea', pattern: 'tuxedo' },
    ];
    const CAT = {
        sit: ['B.B.......', 'BBBB......', 'EBEB.....T', 'BNBB....TT', '.BBBBB..T.', '.CSSSbb.T.', '.CSSSbbT..', '.CBBBbb...', '.C.C.bb...'],
        sleep: ['..BBBBBB..', '.BBSSSSBbT', 'BBESBBBBbT', '.BBBBBBbb.', '..CC.CC...'],
        walk0: ['B.B.......', 'BBBB......', 'EBEBSSSSBT', 'BNBBSSSSbT', '.BBBBBBbb.', '.C.C..b.b.'],
        walk1: ['B.B.......', 'BBBB......', 'EBEBSSSSBT', 'BNBBSSSSb.', '.BBBBBBbbT', '..CC...bb.'],
        run0: ['B.B.........', 'BBBB........', 'EBEBSSSSBB.T', 'BNBBBBBBbbTT', 'CC......bb..'],
        run1: ['B.B.........', 'BBBB.......T', 'EBEBSSSSBBTT', 'BNBBBBBBbb..', '.C.C...b.b..'],
        loaf: ['.B.B......', '.BBBB.....', '.EBEB...T.', 'BBNBSSSBbT', 'BBBBBBBbbT', '.CC...bb..'],
        stretch: ['........B.B', '........BBBB', 'T.......EBEB', 'TBBSSSSBBNBB', '.BBB....BB..', '.CC.....C.C.'],
        pounce: ['......B.B.', '......BBBB', '...SSSEBEB', 'TBBSSSBNBB', 'T.BB...BB.', '..CC...C.C'],
    };
    function catColours(spec) {
        const { base, marks, chest, pattern } = spec;
        const S = pattern === 'solid' ? base : marks;
        const C = pattern === 'tuxedo' || pattern === 'tabby' ? chest : base;
        return { B: base, b: shade(base, -0.22), S, C, E: spec.eyes || '#6ab04a', T: pattern === 'splotch' ? marks : base, N: '#f08ab0', F: shade(base, 0.25), G: '#f8f8f8' };
    }
    // Every frame of a cat, both ways, with a hat slot above the head.
    function cat(spec) {
        const map = catColours(spec);
        const out = {};
        for (const [name, lines] of Object.entries(CAT)) {
            let art = lines;
            if (spec.big) art = widen(art, name === 'stretch' || name === 'pounce' ? 4 : 5);
            if (spec.fluffy) art = fluff(art);
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
                if (ch === '.' && y >= 2 && y < h - 1 && 'BSb'.includes(at(x - 1, y)) && 'BSb'.includes(at(x, y - 1)) && (x + y) % 2 === 0) out += 'F';
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
        sit: ['.BB.......', 'EBBB......', 'BBBBB....T', '.BBBBB..TT', '.CBSSBB.T.', '.CBBBBbb..', '.C..C.bb..'],
        walk0: ['.BB........', 'EBBB.......', 'BBBBBSSBBbT', '.CBBBBBBbb.', '.C.C...b.b.'],
        walk1: ['.BB........', 'EBBB......T', 'BBBBBSSBBbT', '.CBBBBBBbb.', '..CC...bb..'],
        run0: ['.BB..........', 'EBBBSSBBBBb.T', 'CC.......bbTT'],
        run1: ['.BB.........T', 'EBBBSSBBBBbTT', '.CC....b.b...'],
        lie: ['.BB........', 'EBBBSSBBBbT', 'CCBBBBBBbb.'],
    };
    const dog = coat => { const map = { ...coat, b: shade(coat.B, -0.22), E: '#1a1a20', T: coat.B }; const out = {}; for (const [k, v] of Object.entries(DOG)) out[k] = both(v, map, 2); return out; };

    const BIRD_COATS = [{ B: '#8a6a4a', W: '#5a4a3a', C: '#d8c8a8' }, { B: '#3a7fd9', W: '#2a5aa8', C: '#f0f0f0' }, { B: '#d9453a', W: '#a83020', C: '#d9453a' }, { B: '#f0f0f0', W: '#c8c8c8', C: '#f0f0f0' }, { B: '#f0c040', W: '#c89a20', C: '#f8e8a0' }];
    const BIRD = { perch: ['.BB.', 'YBCW', '.BWW', '.K..'], fly0: ['W.....W', '.WWBWW.', '...C...'], fly1: ['.......', 'WWWBWWW', '...C...'], peck: ['....', 'YBCW', '.BWW', '.K..'] };
    const bird = coat => { const map = { ...coat, Y: '#e0a030', K: '#e0a030' }; const out = {}; for (const [k, v] of Object.entries(BIRD)) out[k] = both(v, map, 1); return out; };
    const GOOSE = { fly0: ['K.........K', '.WW.....WW.', '..WWWBBWW..', '.....KK....'], fly1: ['...........', 'KWWWWBBWWWWK', '.....KK....', '...........'] };
    const goose = () => { const map = { K: '#2a2a2a', W: '#b8a890', B: '#8a7a68' }; const out = {}; for (const [k, v] of Object.entries(GOOSE)) out[k] = both(v, map, 5); return out; };
    const BUTTERFLY = [{ A: '#f0c040', B: '#e08a20' }, { A: '#f08ab0', B: '#c04a80' }, { A: '#9ad0e8', B: '#3a7fd9' }, { A: '#f8f8f8', B: '#c8c8c8' }];
    const butterfly = coat => ({ open: both(['AA.AA', 'ABKBA', '.AKA.'], { ...coat, K: '#2a2a2a' }, 2), shut: both(['.A.A.', '.AKA.', '..K..'], { ...coat, K: '#2a2a2a' }, 2) });
    const RABBIT = { sit: ['B.B..', 'BBB..', 'EBBB.', 'BBBBB', 'BBBBW', '.C.C.'], hop: ['B.B...', 'BBB...', 'EBBBB.', '.BBBBW', 'C...C.'] };
    const rabbit = winter => { const map = winter ? { B: '#f0eee8', C: '#d8d6d0', E: '#1a1a20', W: '#d8d6d0' } : { B: '#a88a6a', C: '#8a6a4a', E: '#1a1a20', W: '#f0e8d8' }; const out = {}; for (const [k, v] of Object.entries(RABBIT)) out[k] = both(v, map, 2); return out; };
    const DEER = {
        stand: ['.A.A..........', '.AAA..........', 'EBBB..........', '.BBB..........', '.BBBBBBBBBBB..', '.BBWWWWBBBBbb.', '.BB.B....B.Bb.', '.B..B....B..B.', '.B..B....B..B.'],
        walk0: ['.A.A..........', '.AAA..........', 'EBBB..........', '.BBB..........', '.BBBBBBBBBBB..', '.BBWWWWBBBBbb.', '.BB.B....B.Bb.', 'B...B...B...B.', 'B...B...B...B.'],
        walk1: ['.A.A..........', '.AAA..........', 'EBBB..........', '.BBB..........', '.BBBBBBBBBBB..', '.BBWWWWBBBBbb.', '.BB.B....B.Bb.', '.B..B....B..B.', '..BB......BB..'],
        graze: ['..............', '..............', '..............', '..............', '..BBBBBBBBBB..', 'BBBBWWWWBBBbb.', 'EBB.B....B.Bb.', 'BB..B....B..B.', '....B....B..B.'],
    };
    const deer = antlers => { const map = { B: '#a8784a', b: '#86603a', W: '#e8d8b8', E: '#1a1a20', A: antlers ? '#6a4a2a' : null }; const out = {}; for (const [k, v] of Object.entries(DEER)) out[k] = both(v, map, 3); return out; };
    const FOX = { walk0: ['.B.B.......', 'EBBB.......', 'WBBBBBBBBTT', '.KK..KK.WWW', '...........'], walk1: ['.B.B.......', 'EBBB.......', 'WBBBBBBBBTT', 'K.K..K.KWWW', '...........'], sit: ['.B.B.....', 'EBBB.....', 'WBBBB..TT', 'WBBBBBBTW', '.KK.K.WW.'] };
    const fox = () => { const map = { B: '#e07a2a', W: '#f8f0e0', K: '#2a2a2a', E: '#1a1a20', T: '#c0581a' }; const out = {}; for (const [k, v] of Object.entries(FOX)) out[k] = both(v, map, 2); return out; };
    const GOAT = { stand: ['H.H......', 'EBB......', 'WBBBBBBB.', '.BBBBBBBb', '.K.K..K.K', '.K.K..K.K'], walk: ['H.H......', 'EBB......', 'WBBBBBBB.', '.BBBBBBBb', 'K.K..K..K', 'K.K....K.'], graze: ['.........', '.........', 'H.BBBBBB.', 'EBBBBBBBb', 'WK.K..K.K', '.K.K..K.K'] };
    const goat = () => { const map = { B: '#e8e4dc', b: '#c8c4bc', W: '#c8c4bc', K: '#4a4a4a', H: '#8a7a6a', E: '#1a1a20' }; const out = {}; for (const [k, v] of Object.entries(GOAT)) out[k] = both(v, map, 2); return out; };
    const DUCK = { a: ['.BB...', 'YBE...', '.BBBBB', '.BBBBW', '..bbb.'], b: ['.BB...', 'YBE...', '.BBBBW', '.BBBB.', '..bbb.'] };
    const duck = mallard => { const map = mallard ? { B: '#3a6a3a', b: '#8a6a4a', Y: '#e0a030', E: '#1a1a20', W: '#8a6a4a' } : { B: '#f8f8f0', b: '#d8d8d0', Y: '#e0a030', E: '#1a1a20', W: '#d8d8d0' }; const out = {}; for (const [k, v] of Object.entries(DUCK)) out[k] = both(v, map, 1); return out; };
    const fish = () => both(['.BBB.', 'BBBBW', '.BBBW', '..B..'], { B: '#8fd0f0', W: '#4fa0d8' }, 2);
    const owl = () => ({ open: both(['B.B', 'EBE', 'BYB', 'BBB', 'BBB', 'B.B'], { B: '#6a5a4a', E: '#f0c040', Y: '#e0a030' }, 1), shut: both(['B.B', 'BBB', 'BYB', 'BBB', 'BBB', 'B.B'], { B: '#6a5a4a', Y: '#e0a030' }, 1) });
    const ghost = () => ({ a: both(['..WWWW..', '.WWWWWW.', 'WWKWWKWW', 'WWWWWWWW', 'WWWWWWWW', 'WWWWWWWW', 'W.WW.WW.'], { W: '#e8f0ff', K: '#2a2a4a' }, 3), b: both(['..WWWW..', '.WWWWWW.', 'WWKWWKWW', 'WWWWWWWW', 'WWWWWWWW', 'WWWWWWWW', '.W.WW.WW'], { W: '#e8f0ff', K: '#2a2a4a' }, 3) });
    const bat = () => ({ a: both(['K.....K', 'KK.K.KK', 'KKKKKKK', '..K.K..'], { K: '#2a2030' }, 3), b: both(['.......', 'K..K..K', 'KKKKKKK', 'KK.K.KK'], { K: '#2a2030' }, 3) });
    const DRAGON = {
        peek: ['....GGGG......', '...GGEGGG.....', '..GGGGGGGGG...', '.GGGGGGGGGGGG.', 'GGGGGGGGGGGGGG', '.NGGGGGGGGGGG.', '...GGGGGGGGGG.', '....GG..GG....'],
        roar: ['....GGGG......', '...GGEGGG.....', '..GGGGGGGGG...', '.GGGGGGGGGGGG.', 'YGGGGGGGGGGGGG', 'YNGGGGGGGGGGG.', '...GGGGGGGGGG.', '....GG..GG....'],
        asleep: ['..............', '....GGGG......', '...GGGGGG.....', '..GGGGGGGGG...', '.GGGGGGGGGGGG.', 'GGGGGGGGGGGGGG', '.NGGGGGGGGGGG.', '...GGGGGGGGGG.'],
    };
    const dragon = () => { const map = { G: '#5a9a5a', E: '#f0c040', N: '#f0f0f0', Y: '#ff8a2a' }; const out = {}; for (const [k, v] of Object.entries(DRAGON)) out[k] = both(v, map, 6); return out; };

    // ---- Props --------------------------------------------------------------------------------------

    const pumpkin = () => ({ dark: rows(['...G...', '.OOOOO.', 'OOOOOOo', 'OKOOKOo', 'OOOOOOo', '.OOOOo.'], { G: '#4a7a3a', O: '#e07a2a', o: '#b85a1a', K: '#3a2010' }, false, 3),
        lit: rows(['...G...', '.OOOOO.', 'OOOOOOo', 'OYOOYOo', 'OOYYOOo', '.OOOOo.'], { G: '#4a7a3a', O: '#f0882a', o: '#c86a1a', Y: '#ffe070' }, false, 3) });
    const snowman = () => rows(['..KKK..', '.KKKKK.', '.WWWWW.', 'WEWWEWW', '.WWOWW.', 'RRRRRRR', '.WWWWW.', 'WWWWWWW', 'WWKWWWW', 'WWWWWWW', 'WWKWWWW', '.WWWWW.'], { K: '#2a2a30', W: '#f8f8f8', E: '#2a2a30', O: '#f08a2a', R: '#d9453a' }, false, 3);
    const present = colour => rows(['.Y.Y.Y.', 'CCCYCCC', 'YYYYYYY', 'CCCYCCC', 'CCCYCCC', 'cccYccc'], { Y: '#f0c040', C: colour, c: shade(colour, -0.3) }, false, 3);
    const egg = colour => rows(['.CC.', 'CDCC', 'CCDC', 'CCCC', '.cc.'], { C: colour, D: shade(colour, -0.3), c: shade(colour, -0.2) }, false, 1);
    const heart = () => rows(['.P.P.', 'PPPPP', 'PPPPP', '.PPP.', '..P..'], { P: '#f05a8a' }, false, 2);
    const balloon = colour => rows(['.CCC.', 'CLCCC', 'CCCCc', 'CCCCc', '.CCc.', '..K..', '..K..'], { C: colour, c: shade(colour, -0.3), L: shade(colour, 0.4), K: '#4a4a4a' }, false, 2);
    const cake = () => rows(['...Y...', '.P.Y.P.', 'PPPPPPP', 'PPPPPPP', 'WWWWWWW', 'BBBBBBB', 'WWWWWWW', 'BBBBBBB', 'bbbbbbb'], { Y: '#ffe070', P: '#f08ab0', W: '#f8f8f8', B: '#c08a5a', b: '#9a6a3a' }, false, 3);
    const wreath = () => rows(['.GGGG.', 'GRGGGG', 'GG..GR', 'GR..GG', 'GGGGRG', '.GGGG.'], { G: '#3a8a4a', R: '#d9453a' }, false, 2);
    const shamrock = () => rows(['G.G', 'GGG', '.G.'], { G: '#3aa86a' }, false, 1);
    const potOfGold = () => rows(['.YYYY.', 'KKKKKK', 'KKKKKk', '.KKKk.'], { Y: '#f0c040', K: '#2a2a2a', k: '#141414' }, false, 2);
    const lamp = () => {
        const mk = L => rows(['.WWW.', 'WLLLW', 'WLLLW', 'WLLLW', '.WWW.', '..K..', '..K..', '..K..', '..K..', '..K..', '..K..', '..K..', '.KKK.', 'KKKKK'], { W: '#3a3a44', L, K: '#2e2e36' }, false, 2);
        return { off: mk('#9ad0e8'), on: mk('#ffe9a0') };
    };
    const bench = () => rows(['WWWWWWWWWWWW', 'W..........W', 'WWWWWWWWWWWW', 'wwwwwwwwwwww', 'W..........W', 'W..........W'], { W: '#8a5a3a', w: '#6a4229' }, false, 6);
    const well = () => rows(['....RRRRR....', '..RRRRRRRRR..', '.RRRrrrrrRRR.', 'W...........W', 'W....K......W', 'W....Y......W', 'SSSSSSSSSSSSS', 'SsBBBBBBBBBsS', 'SsBBBBBBBBBsS', 'SSsSSsSSsSSsS', '.SSSSSSSSSSS.'], { R: '#8a5a3a', r: '#6a4229', W: '#6a4229', K: '#4a3a2a', Y: '#8a7a5a', S: '#aaa6a0', s: '#8c8882', B: '#3f93dc' }, false, 6);
    const stall = () => rows(['RWRWRWRWRWRWRWR', 'rwrwrwrwrwrwrwr', 'W.............W', 'W.............W', 'W.OOOGGGPPPYY.W', 'WWWWWWWWWWWWWWW', 'wwwwwwwwwwwwwww', 'W.............W', 'W.............W'], { R: '#d9453a', r: '#a83020', W: '#8a5a3a', w: '#6a4229', O: '#f08a2a', G: '#5fbf4e', P: '#f08ab0', Y: '#f0c040' }, false, 7);
    const ladder = h => { const lines = []; for (let y = 0; y < h; y++) lines.push(y % 2 ? 'WWWW' : 'W..W'); return rows(lines, { W: '#8a5a3a' }, false, 1); };
    const signpost = () => rows(['WWWWWWW', 'WwwwwwW', 'WWWWWWW', '..KK...', '..KK...', '..KK...', '..KK...', '..KK...'], { W: '#c9a85a', w: '#a8884a', K: '#6a4229' }, false, 3);
    const flowerpot = () => rows(['PGP.', 'GGGP', '.G..', 'OOOO', '.oo.'], { P: '#f08ab0', G: '#5fbf4e', O: '#c0703a', o: '#9a5a2a' }, false, 1);
    const flowerbed = () => rows(['P.Y.P.R.', 'GGGGGGGG', 'oooooooo'], { P: '#f08ab0', Y: '#f0c040', R: '#d9453a', G: '#5fbf4e', o: '#7a5434' }, false, 4);
    const hay = () => rows(['.YYYYY.', 'YyYYyYY', 'YYyYYyY', 'YyYYyYy', '.yyyyy.'], { Y: '#e0b84a', y: '#b8902a' }, false, 3);
    const barrel = () => rows(['.WWWW.', 'KWWWWK', 'WwWWwW', 'KWWWWK', 'WwWWwW', '.KKKK.'], { W: '#8a5a3a', w: '#a87a4a', K: '#3a3a3a' }, false, 3);
    const crate = () => rows(['WWWWWW', 'WwwwwW', 'WwWWwW', 'WwwwwW', 'WWWWWW'], { W: '#a87a4a', w: '#8a5a3a' }, false, 3);
    const sleigh = () => ({ a: both(['...RR........A.A..A.A', '...WW.........AA...AA', 'R.RRRR.....RGBBBBBBBBB', 'RRRRRRRRRRRGBBBBBBBBB.', '.RRRRRRRRR..B.B...B.B.', 'G.........G.B.B...B.B.'], { R: '#d9453a', W: '#f8f8f8', G: '#f0c040', A: '#8a6a4a', B: '#8a5a3a' }, 5),
        b: both(['...RR........A.A..A.A', '...WW.........AA...AA', 'R.RRRR.....RGBBBBBBBBB', 'RRRRRRRRRRRGBBBBBBBBB.', '.RRRRRRRRR...B.B...B.B', 'G.........G..BB...BB..'], { R: '#d9453a', W: '#f8f8f8', G: '#f0c040', A: '#8a6a4a', B: '#8a5a3a' }, 5) });

    // The sky-boat: a hot-air balloon with a basket, striped in two colours.
    function airBalloon(a, b) {
        const W = 19, H = 30, c = canvas(W, H), g = c.getContext('2d'), r = 9;
        for (let y = 0; y < 19; y++) {
            const u = (y - 9) / 9.5, hw = Math.round(r * Math.sqrt(Math.max(0, 1 - u * u)) * (y > 14 ? 0.75 : 1));
            for (let x = 9 - hw; x <= 9 + hw; x++) { const col = Math.floor((x + 1) / 4) % 2 ? a : b; dot(g, x, y, x > 9 + hw - 3 ? shade(col, -0.25) : x < 9 - hw + 2 ? shade(col, 0.2) : col); }
        }
        outline(c, '#4a3040');
        for (let y = 19; y < 24; y++) { dot(g, 6, y, '#6a4229'); dot(g, 12, y, '#6a4229'); }
        for (let y = 24; y < 30; y++) for (let x = 5; x <= 13; x++) dot(g, x, y, (x + y) % 2 ? '#c9a85a' : '#a8884a');
        for (let x = 5; x <= 13; x++) dot(g, x, 24, '#6a4229');
        return { c, w: W, h: H, ax: 9, basket: { x: 6, y: 23 } };
    }

    // ---- Trees -------------------------------------------------------------------------------------

    // A tree of a kind and size, for a season: a trunk and a canopy as two
    // sprites, so the canopy can sway. The canopy is clumps of foliage in
    // four tones with an outline, lit from the upper left.
    function tree(kind, size, season, k, o = {}) {
        const sizes = [[12, 10], [16, 13], [22, 17]];
        const [cw, ch] = sizes[size];
        const th = 4 + size * 2 + (kind === 'tall' ? 4 : 0);
        const trunkC = kind === 'birch' ? '#e8e4dc' : '#7a5234', trunkD = kind === 'birch' ? '#8a8078' : '#4e3220';
        const H = (kind === 'tall' ? ch + 5 : ch) + th + 1, W = cw + 2;
        const c = canvas(W, H), g = c.getContext('2d');
        const canopy = canvas(W, H), cg = canopy.getContext('2d');
        const cx = Math.floor(W / 2);
        const tw = size === 0 ? 2 : 3;
        for (let y = H - th - 1; y < H; y++) { for (let x = 0; x < tw; x++) dot(g, cx - 1 + x, y, x === tw - 1 ? trunkD : trunkC); if (kind === 'birch' && y % 3 === 1) dot(g, cx - 1 + (y % 2), y, trunkD); }
        dot(g, cx - 2, H - 1, trunkD); dot(g, cx + tw - 1, H - 1, trunkD);
        let tones = FOLIAGE[season][kind] || FOLIAGE[season].round;
        if (season === 'autumn' && kind !== 'pine' && kind !== 'cherry') {
            const picks = [['#a04a1e', '#d0702a', '#e8923c', '#f6c060'], ['#9a2a20', '#c8402e', '#e06a4a', '#f0a070'], ['#9a7a1a', '#c8a02a', '#e8c23a', '#f6e080'], ['#8a5a1a', '#b87a2a', '#d89a3a', '#f0c870'], ['#7a7a2a', '#a0a040', '#c0c060', '#e0e090']];
            tones = picks[Math.floor(k * picks.length) % picks.length];
        }
        const [dark, mid, light, hi] = tones;
        const bare = season === 'winter' && kind !== 'pine';
        const snow = season === 'winter';
        if (kind === 'pine') {
            // Tiers of a fir, jagged at the edges, the right side in shade.
            const tiers = size + 3, top = 0, bottom = H - th;
            for (let y = top; y <= bottom; y++) {
                const t = (y - top) / Math.max(1, bottom - top);
                const tier = Math.floor(t * tiers), within = t * tiers - tier;
                const hw = Math.round((0.25 + within * 0.75) * (0.35 + 0.65 * (tier + 1) / tiers) * (cw / 2)) - (y % 2 && within > 0.5 ? 1 : 0);
                for (let x = cx - hw; x <= cx + hw; x++) dot(cg, x, y, x > cx + hw * 0.35 ? dark : x < cx - hw * 0.4 ? light : mid);
                if (snow && within < 0.35) for (let x = cx - hw; x <= cx + hw; x++) dot(cg, x, y, (x + y) % 3 ? P.snow : P.snow2);
            }
            dot(cg, cx, 0, light);
        } else if (bare) {
            // Bare branches, a dusting of snow.
            const top = kind === 'tall' ? 0 : 2;
            for (let y = top; y < H - th; y++) {
                const t = (y - top) / Math.max(1, H - th - top);
                const hw = Math.max(0, Math.round((cw / 2) * (kind === 'tall' ? 0.4 : Math.sin(t * Math.PI) * 0.9)));
                for (let x = cx - hw; x <= cx + hw; x++) if ((x * 7 + y * 3) % 5 < 2 || Math.abs(x - cx) < 1) dot(cg, x, y, (x + y) % 3 ? mid : dark);
                for (let x = cx - hw; x <= cx + hw; x++) if ((x * 5 + y * 11) % 7 < 2) dot(cg, x, Math.max(0, y - 1), P.snow);
            }
            for (let y = 0; y < th + 1; y++) dot(cg, cx, H - th - 1 + y, trunkC);
        } else {
            // Clumps of foliage: a few overlapping discs, each lit from the upper left.
            const rx = cw / 2, ry = kind === 'tall' ? (ch + 5) / 2 : ch / 2, cy = ry + 1;
            const n = 3 + size;
            const clumps = [];
            for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + k * 6; clumps.push({ x: cx + Math.cos(a) * rx * 0.42, y: cy + Math.sin(a) * ry * 0.42, r: Math.min(rx, ry) * 0.62 }); }
            clumps.push({ x: cx, y: cy - ry * 0.1, r: Math.min(rx, ry) * 0.75 });
            const inside = (x, y) => clumps.some(cl => ((x - cl.x) / (cl.r * (rx / Math.min(rx, ry)))) ** 2 + ((y - cl.y) / (cl.r * (ry / Math.min(rx, ry)))) ** 2 <= 1);
            for (let y = 0; y < Math.ceil(ry * 2 + 2); y++) for (let x = 0; x < W; x++) {
                if (!inside(x, y)) continue;
                // Each clump's own light: toward its upper left, light; its lower right, dark.
                let best = null;
                for (const cl of clumps) { const d = Math.hypot((x - cl.x) / rx, (y - cl.y) / ry) / (cl.r / Math.min(rx, ry)); if (d <= 1 && (!best || cl.y + cl.x * 0.2 > best.y + best.x * 0.2)) best = cl; }
                const lx = (x - best.x) / (best.r * rx / Math.min(rx, ry)), ly = (y - best.y) / (best.r * ry / Math.min(rx, ry));
                const l = -(lx * 0.7 + ly);
                const edge = !inside(x + 1, y + 1) || !inside(x + 1, y);
                dot(cg, x, y, edge && l < 0.3 ? dark : l > 0.55 && (x + y) % 2 ? hi : l > 0.1 ? light : l > -0.4 ? mid : dark);
            }
            if (kind === 'apple' && (season === 'summer' || season === 'autumn')) for (let i = 0; i < size * 3 + 3; i++) dot(cg, 2 + Math.floor(hash(i, 7) * (W - 4)), 2 + Math.floor(hash(i, 9) * (ry * 2 - 4)), '#d9453a');
            if (kind === 'apple' && season === 'spring') for (let i = 0; i < size * 4 + 4; i++) dot(cg, 2 + Math.floor(hash(i, 3) * (W - 4)), 1 + Math.floor(hash(i, 5) * (ry * 2 - 3)), '#fbe4ee');
            if (kind === 'cherry' && season === 'spring') for (let i = 0; i < size * 4 + 6; i++) dot(cg, 2 + Math.floor(hash(i, 11) * (W - 4)), 1 + Math.floor(hash(i, 13) * (ry * 2 - 3)), '#ffffff');
            if (snow) for (let x = 1; x < W - 1; x++) { let y = 0; while (y < H && !inside(x, y)) y++; if (y < H) { dot(cg, x, y, P.snow); if ((x * 3) % 4 === 0) dot(cg, x, y + 1, P.snow2); } }
            outline(canopy, shade(dark, -0.35));
        }
        return { trunk: { c, w: W, h: H, ax: cx }, canopy: { c: canopy, w: W, h: H, ax: cx } };
    }

    // A bush: a low clump, with berries sometimes.
    function bush(size, season, k, berry) {
        const w = 7 + size * 3, h = 4 + size * 2, c = canvas(w + 2, h + 2), g = c.getContext('2d');
        const [dark, mid, light] = FOLIAGE[season].round;
        const cx = (w + 1) / 2, cy = h * 0.6 + 1;
        for (let y = 0; y <= h + 1; y++) for (let x = 0; x <= w + 1; x++) {
            const dx = (x - cx) / (w / 2), dy = (y - cy) / (h * 0.65);
            if (dx * dx + dy * dy > 1 - (hash(x + k * 99, y) * 0.15)) continue;
            dot(g, x, y, dx * 0.6 + dy < -0.3 ? light : dx * 0.5 + dy < 0.3 ? mid : dark);
        }
        if (season === 'winter') { for (let x = 1; x <= w; x++) { let y = 0; while (y < h + 2 && !g.getImageData(x, y, 1, 1).data[3]) y++; if (y < h + 2) dot(g, x, y, P.snow); } }
        else if (berry) for (let i = 0; i < 3 + size; i++) dot(g, 2 + Math.floor(hash(i, k * 100 | 0) * (w - 3)), 2 + Math.floor(hash(i + 7, k * 100 | 0) * (h - 3)), season === 'autumn' ? '#d9453a' : '#f08ab0');
        outline(c, shade(dark, -0.35));
        return { c, w: w + 2, h: h + 2, ax: Math.floor((w + 2) / 2) };
    }

    // ---- Buildings ---------------------------------------------------------------------------------

    // A house from its layout record, seen from above and in front: the
    // front wall, the roof's front slope with its rows of tiles (or a gable
    // facing us), a door with a step, windows (returned, for lighting at
    // night), a chimney (for smoke), window boxes in the warm months, a
    // sign for a shop, snow on the roof in winter. The bottom row is the
    // doorstep.
    function house(hs, season, o = {}) {
        const wall = hs.kind === 'stone' ? '#b0aaa0' : WALLS[hs.wall % WALLS.length], wallD = shade(wall, -0.2), wallL = shade(wall, 0.3);
        const roof = hs.kind === 'barn' ? '#b8402e' : hs.roofStyle === 'thatch' ? '#c9a85a' : ROOFS[hs.roof % ROOFS.length];
        const roofD = shade(roof, -0.3), roofL = shade(roof, 0.18), roofDD = shade(roof, -0.5);
        const w = hs.w, bodyH = hs.h;
        const side = hs.roofStyle === 'hip' || hs.roofStyle === 'side' || hs.roofStyle === 'thatch';     // the ridge runs across; we see the front slope
        const roofH = hs.kind === 'tower' ? Math.round(w * 0.8) : hs.kind === 'chapel' ? Math.round(w * 0.55) : hs.kind === 'barn' ? Math.round(w * 0.42) : side ? Math.round(w * 0.3) : Math.round(w * 0.45);
        const steeple = hs.kind === 'chapel' ? 14 : 0;
        const H = bodyH + roofH + steeple + 1, top = roofH + steeple;
        const c = canvas(w + 2, H + 1), g = c.getContext('2d');
        g.translate(1, 0);
        const snow = season === 'winter';
        const timber = hs.kind === 'cottage' && hs.wall % 2 === 1, stone = hs.kind === 'stone' || hs.kind === 'tower';
        const barn = hs.kind === 'barn';
        const bodyWall = barn ? '#c84a36' : wall, bodyWallD = barn ? '#9a3628' : wallD;
        // Walls, the shaded side on the right (or the left, flipped), a stone footing.
        for (let y = top; y < H; y++) for (let x = 0; x < w; x++) dot(g, x, y, (hs.flip ? x < 3 : x >= w - 3) ? bodyWallD : bodyWall);
        for (let x = 0; x < w; x++) { dot(g, x, H - 1, hs.flip && x < 3 || !hs.flip && x >= w - 3 ? '#6e6a66' : (x % 3 ? '#8c8882' : '#aaa6a0')); }
        if (stone) for (let y = top; y < H - 1; y++) for (let x = 0; x < w; x++) { const bx = Math.floor((x + (Math.floor((y - top) / 3) % 2) * 2) / 4), by = Math.floor((y - top) / 3); if ((x + (by % 2) * 2) % 4 === 0 || (y - top) % 3 === 0) dot(g, x, y, shade(wall, -0.3)); else if (hash(bx, by + hs.id) > 0.7) dot(g, x, y, shade(wall, 0.12)); }
        if (barn) { for (let x = 0; x < w; x++) if (x % 4 === 0) for (let y = top; y < H - 1; y++) dot(g, x, y, bodyWallD); for (let x = 0; x < w; x++) { dot(g, x, top, '#f0e0c0'); } for (let y = top; y < H; y++) { dot(g, 0, y, '#f0e0c0'); dot(g, w - 1, y, '#f0e0c0'); } }
        if (timber) {
            for (let x = 0; x < w; x += 6) for (let y = top; y < H - 1; y++) dot(g, x, y, '#7a5234');
            for (let x = 0; x < w; x++) { dot(g, x, top, '#7a5234'); if (bodyH > 14) dot(g, x, top + Math.floor(bodyH / 2), '#7a5234'); }
            for (let i = 0; i < 5 && i < bodyH / 2; i++) { dot(g, 1 + i, top + 1 + i, '#7a5234'); dot(g, w - 2 - i, top + 1 + i, '#7a5234'); }
        }
        // The roof.
        const cx = (w - 1) / 2;
        if (hs.kind === 'tower') {
            // A round tower: a cone, with a dark seam.
            for (let y = 0; y < roofH; y++) { const hw = (y + 0.5) / roofH * (w / 2 + 1); for (let x = -1; x <= w; x++) if (Math.abs(x - cx) <= hw) dot(g, x, y, x < cx - hw * 0.4 ? roofL : x > cx + hw * 0.3 ? roofD : roof); }
            if (snow) for (let y = 0; y < roofH * 0.5; y++) { const hw = (y + 0.5) / roofH * (w / 2 + 1); for (let x = -1; x <= w; x++) if (Math.abs(x - cx) <= hw && Math.abs(x - cx) >= hw - 1.5) dot(g, x, y, P.snow); }
            dot(g, Math.round(cx), 0, roofDD);
        } else if (side) {
            // The front slope: rows of tiles (or straw), eaves overhanging the wall, the ridge dark on top.
            for (let y = 0; y < roofH; y++) {
                const row = Math.floor((y - steeple) / 3);
                for (let x = -1; x <= w; x++) {
                    let col = roof;
                    if (hs.roofStyle === 'thatch') col = (x + y * 2) % 5 === 0 ? roofD : (x * 3 + y) % 7 === 0 ? roofL : roof;
                    else { if (y % 3 === 2) col = roofD; else if ((x + row * 2) % 4 === 0) col = roofD; else if (y % 3 === 0 && (x + row * 2) % 4 === 2) col = roofL; }
                    if (x >= w - 3 && !hs.flip || x < 2 && hs.flip) col = shade(col, -0.2);
                    dot(g, x, y, col);
                }
            }
            for (let x = -1; x <= w; x++) { dot(g, x, 0, roofDD); dot(g, x, roofH - 1, roofDD); }
            if (snow) for (let y = 0; y < 3; y++) for (let x = -1; x <= w; x++) if ((x + y) % 2 || y < 2) dot(g, x, y, y === 2 ? P.snow2 : P.snow);
        } else {
            // A gable (the barn's is a gambrel) facing us, the roof's slopes seen edge-on.
            for (let y = 0; y < roofH; y++) {
                const t = (y + 0.5) / roofH;
                const hw = (barn ? (t < 0.5 ? t * 0.6 : 0.3 + (t - 0.5) * 1.4) : t) * (w / 2 + 1);
                for (let x = -1; x <= w; x++) {
                    if (Math.abs(x - cx) > hw) continue;
                    const edge = Math.abs(x - cx) > hw - 1.5;
                    dot(g, x, steeple + y, edge ? roofDD : x < cx ? ((x + y) % 3 === 0 ? roofL : roof) : roofD);
                }
                if (snow) for (let x = -1; x <= w; x++) if (Math.abs(x - cx) <= hw && Math.abs(x - cx) > hw - 2) dot(g, x, steeple + y, P.snow);
            }
            for (let x = -1; x <= w; x++) dot(g, x, top - 1, roofDD);
            if (barn) { for (let y = steeple + 3; y < top - 3; y++) for (let x = Math.round(cx) - 2; x <= Math.round(cx) + 2; x++) dot(g, x, y, y === steeple + 3 || y === top - 4 ? '#f0e0c0' : '#4a2e1a'); }
            else if (!hs.kind.includes('chapel') && roofH > 8) { const ay = steeple + Math.round(roofH * 0.55); for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) if (Math.abs(xx) + Math.abs(yy) < 2) dot(g, Math.round(cx) + xx, ay + yy, P.glass2); }
        }
        if (steeple) {
            // The chapel's steeple with a bell and a cross.
            const sx = Math.round(cx);
            for (let y = 4; y < steeple; y++) { const hw = y < 9 ? 2 : 3; for (let x = sx - hw; x <= sx + hw; x++) dot(g, x, y, y < 9 ? (x === sx ? '#2a2a30' : roofD) : x < sx ? roofL : roof); }
            dot(g, sx, 7, P.gold); dot(g, sx, 8, '#c0902a');
            for (let y = 0; y < 4; y++) dot(g, sx, y, P.gold); dot(g, sx - 1, 1, P.gold); dot(g, sx + 1, 1, P.gold);
            for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) if (Math.abs(xx) + Math.abs(yy) < 2) dot(g, sx + xx, top + 4 + yy, P.glass2);
            dot(g, sx, top + 4, P.glass);
        }
        // The door, with a step and a knob, arched.
        const windows = [];
        const doorW = barn ? 9 : 5, doorH = Math.min(barn ? 11 : 8, bodyH - 3);
        const doorX = hs.door === 0 ? 3 : hs.door === 1 ? Math.floor(w / 2) - Math.floor(doorW / 2) : w - doorW - 3;
        for (let y = H - 1 - doorH; y < H - 1; y++) for (let x = doorX; x < doorX + doorW; x++) dot(g, x, y, (y === H - 1 - doorH && (x === doorX || x === doorX + doorW - 1)) ? bodyWall : x === doorX + doorW - 1 ? '#4a2e1a' : (x - doorX) % 2 ? '#6a4229' : '#7a5234');
        if (!barn) dot(g, doorX + doorW - 2, H - 4, P.gold);
        else { for (let y = H - 1 - doorH; y < H - 1; y++) dot(g, doorX + Math.floor(doorW / 2), y, '#f0e0c0'); for (let i = 0; i < doorH; i++) { dot(g, doorX + Math.floor(i * (doorW / 2) / doorH), H - 2 - i, '#f0e0c0'); dot(g, doorX + doorW - 1 - Math.floor(i * (doorW / 2) / doorH), H - 2 - i, '#f0e0c0'); } }
        for (let x = doorX - 1; x <= doorX + doorW; x++) dot(g, x, H - 1, '#c6c2bc');
        // Windows: a frame, four panes, a sill; two rows on a tall house.
        const winRows = bodyH >= 22 ? 2 : 1;
        for (let r = 0; r < winRows; r++) {
            const wy = top + 3 + r * 9;
            if (wy + 6 > H - 2) break;
            for (let x = 2; x + 5 <= w - 2; x += 8) {
                if (x < doorX + doorW + 1 && x + 5 > doorX - 1 && wy + 6 >= H - 1 - doorH) continue;
                if (barn && r === 0) continue;
                const win = { x, y: wy, w: 5, h: 5 };
                for (let yy = 0; yy < 5; yy++) for (let xx = 0; xx < 5; xx++) dot(g, x + xx, wy + yy, yy === 0 || xx === 0 || yy === 4 || xx === 4 ? '#5a4030' : (xx === 2 || yy === 2) ? '#4a3a2a' : (xx < 2 && yy < 2) ? P.glass : P.glass2);
                for (let xx = -1; xx <= 5; xx++) dot(g, x + xx, wy + 5, '#c6c2bc');
                windows.push(win);
                if ((season === 'spring' || season === 'summer') && r === winRows - 1 && !barn && hs.kind !== 'tower') for (let xx = 0; xx < 5; xx++) dot(g, x + xx, wy + 6, xx % 2 ? '#5fbf4e' : ['#f08ab0', '#d9453a', '#f0c040'][(hs.id + xx) % 3]);
            }
        }
        if (hs.kind === 'tower') { const sx = Math.round(cx); for (let y = top + 3; y < top + 7; y++) dot(g, sx, y, '#2a2a30'); }
        // The chimney, up through the roof on the shaded side.
        let chimney = null;
        if (hs.kind !== 'tower' && hs.kind !== 'chapel' && !barn) {
            const cxm = hs.flip ? 3 : w - 6;
            const cy = steeple + Math.max(0, Math.round(roofH * 0.3) - 2);
            for (let y = cy; y < cy + 6; y++) for (let x = cxm; x < cxm + 3; x++) dot(g, x, y, y === cy ? '#5a4a44' : x === cxm + 2 ? '#6a5a54' : '#8a7a74');
            chimney = { x: cxm + 1, y: cy - 1 };
        }
        // A shop sign hanging by the door.
        if (hs.shop) {
            const sx = doorX + doorW + 2 < w - 4 ? doorX + doorW + 2 : doorX - 5, sy = H - 2 - doorH;
            const col = hs.shop === 'bakery' ? '#f0c040' : hs.shop === 'inn' ? '#d9453a' : '#3aa86a';
            for (let x = 0; x < 4; x++) for (let y = 0; y < 3; y++) dot(g, sx + x, sy + 1 + y, y === 1 && x > 0 && x < 3 ? shade(col, -0.3) : col);
            dot(g, sx + 1, sy, '#4a3a2a'); dot(g, sx + 2, sy, '#4a3a2a');
        }
        g.translate(-1, 0);
        outline(c, hs.kind === 'tower' || stone ? '#3a363c' : barn ? '#4a1e14' : '#4a3426');
        return { c, w: w + 2, h: H + 1, ax: Math.floor(w / 2) + 1, windows: windows.map(win => ({ ...win, x: win.x + 1 })), chimney: chimney && { x: chimney.x + 1, y: chimney.y }, door: { x: doorX + 1 + Math.floor(doorW / 2), y: H },
            roofTop: steeple + 1, eaves: top - 1, sills: windows.map(win => ({ x: win.x + 3, y: win.y + 5 })), top };
    }

    // The castle tower on the crag: a round keep of stone with a crenellated
    // platform, a steep slate roof, and a flag that flies in three frames.
    function tower(season) {
        const W = 24, bodyH = 34, roofH = 20, platH = 4, H = bodyH + roofH + platH + 8;
        const c = canvas(W + 6, H), g = c.getContext('2d');
        const cx = 12 + 3, left = 3, right = 3 + W;
        const top = H - bodyH;
        // The keep: a cylinder of stone blocks, light on the left, dark on the right.
        for (let y = top; y < H; y++) for (let x = left; x < right; x++) {
            const u = (x - left) / (W - 1);
            const row = Math.floor((y - top) / 3), seam = (y - top) % 3 === 0, joint = (x + row * 2) % 5 === 0;
            let col = u < 0.2 ? '#c8c4cc' : u < 0.55 ? '#aaa6ae' : u < 0.8 ? '#8c8892' : '#6a6672';
            if (seam || joint) col = shade(col, -0.3);
            else if (hash(x, y) > 0.8) col = shade(col, 0.1);
            dot(g, x, y, col);
        }
        // Slit windows and the door.
        for (const wy of [top + 6, top + 18]) for (let y = wy; y < wy + 5; y++) { dot(g, cx - 4, y, '#2a2a30'); dot(g, cx - 3, y, '#1a1a20'); dot(g, cx + 3, y, '#2a2a30'); dot(g, cx + 4, y, '#1a1a20'); }
        for (let y = H - 8; y < H - 1; y++) for (let x = cx - 2; x <= cx + 2; x++) dot(g, x, y, (y === H - 8 && (x === cx - 2 || x === cx + 2)) ? '#8c8892' : (x - cx) % 2 ? '#5a3a24' : '#6a4229');
        dot(g, cx + 1, H - 4, P.gold);
        for (let x = left - 1; x <= right; x++) dot(g, x, H - 1, '#6e6a66');
        // The platform: a ring wider than the keep, with merlons.
        const py = top - platH;
        for (let y = py; y < top; y++) for (let x = left - 2; x < right + 2; x++) dot(g, x, y, y === py ? '#c8c4cc' : x > right - 4 ? '#6a6672' : '#9a96a2');
        for (let x = left - 2; x < right + 2; x += 4) for (let y = py - 3; y < py; y++) { dot(g, x, y, '#9a96a2'); dot(g, x + 1, y, x > right - 5 ? '#6a6672' : '#aaa6ae'); }
        // The roof: a steep cone of slate.
        const ry = py - 3 - roofH;
        for (let y = 0; y < roofH; y++) { const hw = (y + 1) / roofH * (W / 2 + 1.5); for (let x = left - 2; x < right + 2; x++) if (Math.abs(x - cx + 0.5) <= hw) dot(g, x, ry + y, Math.abs(x - cx + 0.5) > hw - 1.2 ? '#38384a' : x < cx - hw * 0.4 ? '#7a8aa6' : x > cx + hw * 0.25 ? '#4c5670' : (y % 3 === 2 ? '#515c78' : '#5f6b8a')); }
        if (season === 'winter') for (let y = 0; y < roofH * 0.6; y++) { const hw = (y + 1) / roofH * (W / 2 + 1.5); for (let x = left - 2; x < right + 2; x++) if (Math.abs(x - cx + 0.5) <= hw && Math.abs(x - cx + 0.5) > hw - 1.5) dot(g, x, ry + y, P.snow); }
        // The pole.
        for (let y = 0; y < ry + 2; y++) dot(g, cx, y, '#4a3a2a');
        dot(g, cx, 0, P.gold);
        outline(c, '#2e2a34');
        const flags = [0, 1, 2].map(f => {
            const fc = canvas(10, 6), fg = fc.getContext('2d');
            for (let x = 0; x < 9; x++) { const wave = Math.round(Math.sin((x + f * 2) * 0.9) * 0.9); for (let y = 0; y < 5; y++) { const yy = y + wave; if (yy < 0 || yy > 5) continue; dot(fg, x + 1, yy, y < 2 ? P.flag : y === 2 ? P.flag2 : shade(P.flag, -0.2)); } }
            for (let y = 0; y < 6; y++) dot(fg, 0, y, '#4a3a2a');
            return { c: fc, w: 10, h: 6, ax: 0 };
        });
        return { c, w: W + 6, h: H, ax: cx, flags, pole: { x: cx, y: 1 }, windows: [{ x: cx - 4, y: top + 6, w: 2, h: 5 }, { x: cx + 3, y: top + 6, w: 2, h: 5 }, { x: cx - 4, y: top + 18, w: 2, h: 5 }, { x: cx + 3, y: top + 18, w: 2, h: 5 }] };
    }

    // The windmill: a tapered cream tower with a reddish cap, and four
    // lattice sails in eight turns.
    function windmill(season) {
        const W = 22, bodyH = 30, capH = 8, H = bodyH + capH;
        const c = canvas(W, H), g = c.getContext('2d'), cx = 11;
        for (let y = capH; y < H; y++) {
            const t = (y - capH) / bodyH, hw = 5 + Math.round(t * 4);
            for (let x = cx - hw; x <= cx + hw; x++) { const u = (x - cx + hw) / (hw * 2); dot(g, x, y, u < 0.18 ? '#f4ead2' : u < 0.7 ? '#e8dcc0' : u < 0.88 ? '#c8b89c' : '#a89880'); }
            if (y % 4 === 1) for (let x = cx - hw; x <= cx + hw; x += 3) dot(g, x + (Math.floor(y / 4) % 2), y, '#d0c0a4');
        }
        for (let y = 0; y < capH; y++) { const hw = 2 + Math.round(y / capH * 5); for (let x = cx - hw; x <= cx + hw; x++) dot(g, x, y, x < cx - hw * 0.4 ? '#c87a4a' : x > cx + hw * 0.3 ? '#8a4a2a' : '#a85e38'); }
        if (season === 'winter') for (let y = 0; y < capH * 0.5; y++) { const hw = 2 + Math.round(y / capH * 5); dot(g, cx - hw, y, P.snow); dot(g, cx + hw, y, P.snow); if (y === 0) dot(g, cx, y, P.snow); }
        for (let y = H - 8; y < H - 1; y++) for (let x = cx - 2; x <= cx + 2; x++) dot(g, x, y, (x - cx) % 2 ? '#5a3a24' : '#6a4229');
        for (let x = cx - 7; x <= cx + 7; x++) dot(g, x, H - 1, '#6e6a66');
        for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 4; xx++) dot(g, cx - 2 + xx, capH + 6 + yy, yy === 0 || xx === 0 || yy === 3 || xx === 3 ? '#5a4030' : P.glass);
        outline(c, '#4a3426');
        const sails = [];
        const R = 16, S = R * 2 + 3;
        for (let f = 0; f < 8; f++) {
            const sc = canvas(S, S), sg = sc.getContext('2d');
            const a0 = f * Math.PI / 16, m = Math.floor(S / 2);
            for (let k = 0; k < 4; k++) {
                const a = a0 + k * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
                for (let r = 1; r <= R; r++) {
                    dot(sg, Math.round(m + ca * r), Math.round(m + sa * r), '#5a3a24');
                    if (r >= 4) for (let s = 1; s <= 3; s++) { const x = Math.round(m + ca * r - sa * s), y = Math.round(m + sa * r + ca * s); dot(sg, x, y, (r + s) % 3 === 0 ? '#c8b89c' : '#f0e8d8'); }
                    if (r >= 4 && r % 4 === 0) for (let s = 1; s <= 3; s++) dot(sg, Math.round(m + ca * r - sa * s), Math.round(m + sa * r + ca * s), '#8a6a4a');
                }
            }
            for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) dot(sg, m + xx, m + yy, '#3a2416');
            sails.push({ c: sc, w: S, h: S, ax: m });
        }
        return { tower: { c, w: W, h: H, ax: cx }, sails, hub: { x: cx, y: capH + 2 }, windows: [{ x: cx - 1, y: capH + 7, w: 2, h: 2 }] };
    }

    function lighthouse() {
        const W = 11, H = 32, c = canvas(W, H), g = c.getContext('2d'), cx = 5;
        for (let y = 8; y < H; y++) { const hw = 2 + Math.round((y - 8) / 24 * 2); for (let x = cx - hw; x <= cx + hw; x++) dot(g, x, y, x > cx + hw - 2 ? (Math.floor(y / 4) % 2 ? '#a83020' : '#c8c4bc') : Math.floor(y / 4) % 2 ? '#d9453a' : '#f4f1ea'); }
        for (let x = 1; x <= 9; x++) { dot(g, x, 7, '#3a3a44'); dot(g, x, 2, '#3a3a44'); }
        for (let y = 3; y < 7; y++) for (let x = 2; x <= 8; x++) dot(g, x, y, x === 2 || x === 8 ? '#3a3a44' : '#ffe9a0');
        for (let y = 0; y < 2; y++) dot(g, cx, y, '#3a3a44');
        for (let x = 2; x <= 8; x++) dot(g, x, H - 1, '#6e6a66');
        outline(c, '#2e2a34');
        return { c, w: W, h: H, ax: cx, lamp: { x: cx, y: 4 } };
    }

    // The square's Christmas tree, lights' positions returned to blink.
    function squareTree(h) {
        const w = Math.round(h * 0.7) | 1, c = canvas(w + 2, h + 3), g = c.getContext('2d'), cx = Math.floor((w + 2) / 2);
        const lights = [];
        for (let y = 1; y < h; y++) {
            const hw = Math.round((y / h) * (w / 2) * (0.6 + 0.4 * ((y * 3) % 4) / 3));
            for (let x = cx - hw; x <= cx + hw; x++) { dot(g, x, y, x < cx - hw * 0.3 ? '#4a9a5a' : x > cx + hw * 0.3 ? '#2a6a38' : '#3a8a4a'); if ((x * 3 + y * 5) % 7 === 0) lights.push({ x, y }); }
        }
        for (let y = h; y < h + 3; y++) { dot(g, cx, y, '#6a4229'); dot(g, cx - 1, y, '#6a4229'); }
        dot(g, cx, 0, P.gold); dot(g, cx - 1, 1, P.gold); dot(g, cx + 1, 1, P.gold); dot(g, cx, 1, P.gold);
        outline(c, '#1e4a2a');
        return { c, w: w + 2, h: h + 3, ax: cx, lights };
    }

    // ---- Things on the land ------------------------------------------------------------------------

    // Stairs cut into a cliff face, `h` tall, 7 wide.
    function stairs(h) {
        const W = 7, c = canvas(W, h + 2), g = c.getContext('2d');
        for (let y = 0; y < h + 2; y++) for (let x = 0; x < W; x++) dot(g, x, y, y % 3 === 0 ? '#c6c2bc' : y % 3 === 1 ? '#aaa6a0' : '#7a766f');
        for (let y = 0; y < h + 2; y++) { dot(g, 0, y, '#5a564f'); dot(g, W - 1, y, '#5a564f'); }
        return { c, w: W, h: h + 2, ax: 3 };
    }
    // A footbridge over the pond: planks and rails.
    function bridge(w) {
        const c = canvas(w, 7), g = c.getContext('2d');
        for (let x = 0; x < w; x++) { for (let y = 2; y < 6; y++) dot(g, x, y, x % 4 === 3 ? '#6a4229' : y === 5 ? '#7a5234' : '#a87a4a'); dot(g, x, 1, '#8a5a3a'); dot(g, x, 6, '#5a3a24'); if (x % 5 === 0) { dot(g, x, 0, '#6a4229'); dot(g, x, 1, '#6a4229'); } }
        return { c, w, h: 7, ax: Math.floor(w / 2) };
    }
    // The little sailboat.
    function boat() {
        const c = canvas(13, 14), g = c.getContext('2d');
        for (let y = 10; y < 13; y++) for (let x = 1 + (y - 10); x < 12 - (y - 10); x++) dot(g, x, y, y === 10 ? '#a87a4a' : '#7a5234');
        for (let x = 0; x < 13; x++) if (x > 0 && x < 12) dot(g, x, 9, '#c9a85a');
        for (let y = 0; y < 10; y++) dot(g, 5, y, '#5a3a24');
        for (let y = 1; y < 9; y++) for (let x = 6; x < 6 + Math.round((y) * 0.7); x++) dot(g, x, y, x === 6 + Math.round(y * 0.7) - 1 ? '#d8d0bc' : '#f4ecd8');
        dot(g, 5, 0, '#d9453a'); dot(g, 4, 0, '#d9453a');
        return { c, w: 13, h: 14, ax: 6 };
    }
    // A chunk of rock, floating: strata and an outline, grass on top sometimes.
    function fragment(size, k, grass, season) {
        const w = size + 2, h = Math.round(size * 0.8) + 2, c = canvas(w, h), g = c.getContext('2d');
        const G = GROUND[season] || GROUND.summer;
        for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
            const dx = (x - w / 2 + 0.5) / (w / 2 - 1), dy = (y - 1) / (h - 2);
            const hw = 1 - dy * dy * 0.9 + (hash(x + Math.round(k * 50), y) - 0.5) * 0.25;
            if (Math.abs(dx) > hw) continue;
            let col = dy < 0.3 ? ROCK.terracotta : dy < 0.55 ? ROCK.ochre : dy < 0.8 ? ROCK.rust : ROCK.charcoal;
            if (dx > 0.4) col = shade(col, -0.25);
            if (grass && y === 1) col = G.grass2;
            dot(g, x, y, col);
        }
        if (grass) for (let x = 2; x < w - 2; x++) if (hash(x, 3 + Math.round(k * 9)) > 0.4) dot(g, x, 1, G.grass);
        outline(c, '#3a2a2a');
        return { c, w, h, ax: Math.floor(w / 2) };
    }

    // ---- Sky things ---------------------------------------------------------------------------------

    // A cloud: billowing lumps in three tones, each lit on top and shaded
    // underneath, the whole flat along the bottom.
    function cloud(w, h, rand, lit, shadeC, deepC) {
        const c = canvas(w, h), g = c.getContext('2d');
        const lumps = [];
        const n = 3 + Math.floor(w / 14);
        for (let i = 0; i < n; i++) { const big = i % 3 === 1; lumps.push({ x: w * (0.1 + 0.8 * (i + 0.5) / n) + (rand() - 0.5) * w * 0.1, y: h * (big ? 0.5 : 0.62) + (rand() - 0.5) * h * 0.2, r: h * (big ? 0.42 : 0.3) * (0.85 + rand() * 0.3) }); }
        const deep = deepC || shadeC;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            let best = null, bestD = 9;
            for (const l of lumps) { const d = Math.hypot((x - l.x) / 1.5, y - l.y) / l.r; if (d <= 1 && d < bestD) { bestD = d; best = l; } }
            if (!best) continue;
            // Light from the upper left of each lump, the lowest band deep.
            const lx = (x - best.x) / (best.r * 1.5), ly = (y - best.y) / best.r;
            const light = -(ly + lx * 0.3);
            let col = light > 0.1 ? lit : light > -0.45 ? shadeC : deep;
            if (y >= h - 2) col = deep;
            if (col === lit && lumps.some(l => l !== best && l.y < best.y && Math.hypot((x - l.x) / 1.5, y - l.y) / l.r < 1.15 && y > l.y)) col = shadeC;      // under a lump above
            dot(g, x, y, col);
        }
        return { c, w, h, ax: Math.floor(w / 2) };
    }
    const sun = () => rows(['....Y....', '.Y..Y..Y.', '..YYYYY..', '.YYWWWYY.', 'YYWWWWWYY', '.YYWWWYY.', '..YYYYY..', '.Y..Y..Y.', '....Y....'], { Y: '#ffd860', W: '#fff4c0' }, false, 4);
    function moon(phase) {
        // phase 0..1 round the month: the lit limb toward the sun.
        const r = 6, c = canvas(13, 13), g = c.getContext('2d');
        const k = Math.cos(phase * 2 * Math.PI);        // -1 full, +1 new
        for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
            if (x * x + y * y > r * r + 1) continue;
            const edge = Math.sqrt(Math.max(0, r * r - y * y));
            const terminator = k * edge;
            const lit = phase < 0.5 ? x >= terminator - 0.5 : x <= -terminator + 0.5;
            dot(g, x + r, y + r, lit ? (hash(x + 9, y + 9) > 0.8 ? '#dcd8c0' : '#f4f0d8') : '#2a2e48');
        }
        return { c, w: 13, h: 13, ax: 6 };
    }
    const rainbow = (r, alpha) => {
        const colours = ['#ff4a4a', '#ffa040', '#ffe040', '#60d060', '#40a0ff', '#8060e0'];
        const c = canvas(r * 2 + 2, r + 1), g = c.getContext('2d');
        g.globalAlpha = alpha;
        for (let x = 0; x <= r * 2 + 1; x++) for (let y = 0; y <= r; y++) {
            const d = Math.hypot(x - r, y - r);
            const band = Math.floor((r - d) / 2);
            if (band >= 0 && band < colours.length) dot(g, x, y, colours[band]);
        }
        return { c, w: r * 2 + 2, h: r + 1, ax: r };
    };

    return { canvas, dot, rect, rows, both, flipped, widen, shade, mixHex, outline, hash, SKIN, HAIR, CLOTH, PANTS, WALLS, ROOFS, GROUND, FOLIAGE, WATER, ROCK, P,
        person, hat, HATS, TOOLS, ROSTER, STRAY_COATS, cat, CAT_HATS, DOG_COATS, dog, BIRD_COATS, bird, goose, BUTTERFLY, butterfly, rabbit, deer, fox, goat, duck, fish, owl, ghost, bat, dragon,
        pumpkin, snowman, present, egg, heart, balloon, cake, wreath, shamrock, potOfGold, lamp, bench, well, stall, ladder, signpost, flowerpot, flowerbed, hay, barrel, crate, sleigh, airBalloon,
        tree, bush, house, tower, windmill, lighthouse, squareTree, stairs, bridge, boat, fragment, cloud, sun, moon, rainbow };
})();
