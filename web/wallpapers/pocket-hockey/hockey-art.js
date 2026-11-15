// Pocket Hockey's pictures (SPEC §10.36): everything is pixel art drawn
// here in code, at the picture's own small resolution. A 5×7 bitmap font;
// the rink, its boards, benches and crowd, baked once a game; skaters and
// tiny goalies seen from above, rasterised by direction and pose into
// little sprites and kept; mascots, the trophy and the things people
// throw. No image files, and nothing here reads a pixel back.

const HockeyArt = (() => {
    'use strict';
    const L = HockeyLogic;
    const INK = '#141a2c';

    const sheet = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; };

    // ---- The lettering: 5×7, capitals only (the announcer shouts) ---------------------
    const GLYPHS = {
        A: '.###./#...#/#...#/#####/#...#/#...#/#...#', B: '####./#...#/#...#/####./#...#/#...#/####.', C: '.###./#...#/#..../#..../#..../#...#/.###.',
        D: '####./#...#/#...#/#...#/#...#/#...#/####.', E: '#####/#..../#..../####./#..../#..../#####', F: '#####/#..../#..../####./#..../#..../#....',
        G: '.###./#...#/#..../#.###/#...#/#...#/.###.', H: '#...#/#...#/#...#/#####/#...#/#...#/#...#', I: '###/.#./.#./.#./.#./.#./###',
        J: '..###/...#./...#./...#./...#./#..#./.##..', K: '#...#/#..#./#.#../##.../#.#../#..#./#...#', L: '#..../#..../#..../#..../#..../#..../#####',
        M: '#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#', N: '#...#/##..#/#.#.#/#..##/#...#/#...#/#...#', O: '.###./#...#/#...#/#...#/#...#/#...#/.###.',
        P: '####./#...#/#...#/####./#..../#..../#....', Q: '.###./#...#/#...#/#...#/#.#.#/#..#./.##.#', R: '####./#...#/#...#/####./#.#../#..#./#...#',
        S: '.####/#..../#..../.###./....#/....#/####.', T: '#####/..#../..#../..#../..#../..#../..#..', U: '#...#/#...#/#...#/#...#/#...#/#...#/.###.',
        V: '#...#/#...#/#...#/#...#/#...#/.#.#./..#..', W: '#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#', X: '#...#/#...#/.#.#./..#../.#.#./#...#/#...#',
        Y: '#...#/#...#/.#.#./..#../..#../..#../..#..', Z: '#####/....#/...#./..#../.#.../#..../#####',
        0: '.###./#...#/#...#/#...#/#...#/#...#/.###.', 1: '.#./##./.#./.#./.#./.#./###', 2: '.###./#...#/....#/...#./..#../.#.../#####',
        3: '####./....#/....#/.###./....#/....#/####.', 4: '...#./..##./.#.#./#..#./#####/...#./...#.', 5: '#####/#..../####./....#/....#/#...#/.###.',
        6: '.###./#..../#..../####./#...#/#...#/.###.', 7: '#####/....#/...#./..#../..#../..#../..#..', 8: '.###./#...#/#...#/.###./#...#/#...#/.###.',
        9: '.###./#...#/#...#/.####/....#/....#/.###.',
        ' ': '../../../../../../..', '.': '././././././#', ',': '../../../../../.#/#.', '!': '#/#/#/#/#/./#', '?': '.###./#...#/....#/...#./..#../...../..#..',
        ':': './#/./././#/.', '-': '.../.../.../###/.../.../...', "'": '#/#/././././.', '(': '.#/#./#./#./#./#./.#', ')': '#./.#/.#/.#/.#/.#/#.',
        '/': '..#/..#/.#./.#./.#./#../#..', '+': '.../.../.#./###/.#./.../...', '%': '##..#/##.#./...#./..#../.#.../.#.##/#..##', '*': '...../..#../#.#.#/.###./#.#.#/..#../.....',
        '>': '.../#../.#./..#/.#./#../...', '·': './././#/././.',
    };
    const FONT = (() => {
        const font = {};
        let x = 0;
        for (const [ch, text] of Object.entries(GLYPHS)) {
            const rows = text.split('/').slice(0, 7);
            while (rows.length < 7) rows.push('');
            const w = Math.max(...rows.map(r => r.length));
            font[ch] = { rows, w, x };
            x += w + 1;
        }
        font.width = x;
        return font;
    })();
    const atlases = new Map();
    function atlas(colour) {
        let a = atlases.get(colour);
        if (a) return a;
        a = sheet(FONT.width, 7);
        const c = a.getContext('2d');
        c.fillStyle = colour;
        for (const g of Object.values(FONT)) if (g.rows) g.rows.forEach((row, y) => { for (let n = 0; n < row.length; n++) if (row[n] === '#') c.fillRect(g.x + n, y, 1, 1); });
        atlases.set(colour, a);
        return a;
    }
    const glyph = ch => FONT[ch] || FONT['?'];
    const lines = new Map();
    function measure(text, scale = 1) {
        let w = 0;
        for (const ch of text) w += glyph(ch).w + 1;
        return Math.max(0, w - 1) * scale;
    }
    // Write `text` with its top-left (or centre, or right) at x, y. A dark copy underneath keeps it readable on ice.
    function write(ctx, text, x, y, colour = '#ffffff', options = {}) {
        const scale = options.scale || 1, align = options.align || 'left', w = measure(text, scale), dark = options.shadow === false ? '' : options.shadow || INK;
        if (!w) return 0;
        // A line is set once and kept: the next frame is one drawImage.
        const key = `${colour}|${dark}|${scale}|${text}`;
        let line = lines.get(key);
        if (!line) {
            line = sheet(w + scale, 8 * scale);
            const c = line.getContext('2d'), pass = (img, off) => {
                let px = off;
                for (const ch of text) { const g = glyph(ch); c.drawImage(img, g.x, 0, g.w, 7, px, off, g.w * scale, 7 * scale); px += (g.w + 1) * scale; }
            };
            c.imageSmoothingEnabled = false;
            if (dark) pass(atlas(dark), scale);
            pass(atlas(colour), 0);
            if (lines.size > 220) lines.delete(lines.keys().next().value);
            lines.set(key, line);
        }
        ctx.drawImage(line, Math.round(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x), Math.round(y));
        return w;
    }
    // Break a line at spaces so it fits a width.
    function wrap(text, width, scale = 1) {
        const lines = [];
        let line = '';
        for (const word of text.split(' ')) {
            const next = line ? `${line} ${word}` : word;
            if (line && measure(next, scale) > width) { lines.push(line); line = word; } else line = next;
        }
        if (line) lines.push(line);
        return lines;
    }

    // ---- Small sprites from character maps ---------------------------------------------
    const FIXED = { K: INK, W: '#f6f4ee', k: '#10121c', Y: '#ffd23f', O: '#f08a24', R: '#d8343a', B: '#7a4a25', T: '#e2b07e', G: '#9fb1c2', N: '#ff9fb5', C: '#a8dcf5', g: '#5f6f80', b: '#3f73c8', n: '#3fa55b' };
    function stamp(rows, palette = {}) {
        const c = sheet(Math.max(...rows.map(r => r.length)), rows.length), ctx = c.getContext('2d');
        rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const colour = palette[row[x]] || FIXED[row[x]]; if (colour) { ctx.fillStyle = colour; ctx.fillRect(x, y, 1, 1); } } });
        return c;
    }
    const HEADS = {
        yeti: ['..KK....KK..', '.KWWK..KWWK.', 'KWWWWKKWWWWK', 'KWWWWWWWWWWK', 'KWWCCCCCCWWK', 'KWCkCCCCkCWK', 'KWCCCCCCCCWK', 'KWCCkkkkCCWK', 'KWWCkWWkCWWK', '.KWWCCCCWWK.', '..KWWWWWWK..', '...KKKKKK...'],
        walrus: ['...KKKKKK...', '..KBBBBBBK..', '.KBBBBBBBBK.', 'KBBkBBBBkBBK', 'KBBBBBBBBBBK', 'KBTTTkkTTTBK', 'KTTTTTTTTTTK', 'KTkTTTTTTkTK', '.KTWKTTKWTK.', '..KWK..KWK..', '..KWK..KWK..', '...K....K...'],
        boat: ['............', '............', '............', 'KK.KKKKKK...', 'KBKBBBBBBKK.', '.KBBBBBBBK.K', '.KPPPPPPPK.K', '.KPkPPPkPKK.', '..KPPPPPK...', '..KPPkkPK...', '...KKPKK....', '..KKKKKKK...'],
        narwhal: ['.........YK.', '........YK..', '.......YK...', '...KKKKYK...', '..KPPPPPPK..', '.KPPPPPPPPK.', 'KPPkPPPPkPPK', 'KPPPPPPPPPPK', 'KPNPPkkPPNPK', 'KPPPPPPPPPPK', '.KWWWWWWWWK.', '..KKKKKKKK..'],
        mallow: ['............', '..KKKKKKKK..', '.KWWWWWWWWK.', 'KWWWWWWWWWWK', 'KWWWWWWWWWWK', 'KWWkWWWWkWWK', 'KWWWWWWWWWWK', 'KWNWkWWkWNWK', 'KWWWWkkWWWWK', 'KWWWWWWWWWWK', '.KWWWWWWWWK.', '..KKKKKKKK..'],
        jack: ['....KKKK....', '..KKRRRRKK..', '.KRRkRRkRRK.', '.KRkRRkRRkK.', 'KKKKKKKKKKKK', 'KTTTTTTTTTTK', 'KTTkTTTTkTTK', 'KTTTTTTTTTTK', 'KBBBTTTTBBBK', 'KBBBBkkBBBBK', '.KBBBBBBBBK.', '..KKBBBBKK..'],
        goose: ['...KKKKK....', '..KWWWWWK...', '.KWWWWWWWK..', '.KWkWWWkWK..', '.KWWWWWWWKKK', '.KWWWOOOOOOK', '.KWWWOOOOKK.', '..KWWWWKK...', '..KWWWWK....', '..KWWWWK....', '..KWWWWK....', '..KKKKKK....'],
        kettle: ['...C..C.....', '....C..C....', '.....KK.....', '...KKKKKK...', '..KGGGGGGK..', 'KKGGGGGGGGK.', 'KOKGkGGkGGKK', '.KKGGGGGGGgK', '..KGGkkGGGgK', '..KGGGGGGGK.', '..KGGGGGGGK.', '...KKKKKKK..'],
    };
    const BODY = ['..KPPPPPPK..', '.KPPSSSSPPK.', '.KPPPPPPPPK.', '..KPPPPPPK..', '..KDDKKDDK..', '..KKK..KKK..'];
    const BODY_UP = ['KPK......KPK', 'KPPKPPPPKPPK', '.KPPSSSSPPK.', '..KPPPPPPK..', '..KDDKKDDK..', '..KKK..KKK..'];
    const THINGS = {
        hat: ['..KKK..', '.KRRRK.', '.KRRRK.', 'KKKKKKK'], teddy: ['KK..KK', 'KBKKBK', 'KBBBBK', 'KBkkBK', '.KBBK.', 'KBBBBK', 'KK..KK'], duck: ['.KKK..', 'KYYkK.', 'KYYOOK', 'KYYYK.', '.KKK..'],
        fish: ['.KKK..K', 'KGGGKKG', 'KkGGGGK', '.KKK..K'], sock: ['KKK.', 'KWK.', 'KRK.', 'KWKK', 'KWWK', '.KK.'], donut: ['.KKK.', 'KNNNK', 'KN.NK', 'KNNNK', '.KKK.'],
        tin: ['..KKKKKK..', '.KYYYYYYK.', 'KYYWYYYYYK', 'KKKKKKKKKK', 'KOYYYYYYOK', 'KOYBBBBYOK', 'KOYYYYYYOK', 'KOYYYYYYOK', '.KKKKKKKK.'],
    };
    const cache = new Map();
    const keep = (key, make) => { let v = cache.get(key); if (!v) { v = make(); cache.set(key, v); } return v; };
    const palette = team => { const kit = L.TEAMS[team].kit; return { P: kit[0], S: kit[1], D: kit[2] }; };
    const head = team => keep(`head${team}`, () => stamp(HEADS[L.TEAMS[team].mascot], palette(team)));
    const mascot = (team, up) => keep(`mascot${team}${up ? 'u' : ''}`, () => {
        const c = sheet(12, 18), ctx = c.getContext('2d');
        ctx.drawImage(stamp(up ? BODY_UP : BODY, palette(team)), 0, 12);
        ctx.drawImage(head(team), 0, up ? 0 : 1);
        return c;
    });
    const thing = kind => keep(`thing${kind}`, () => stamp(THINGS[kind] || THINGS.hat));
    // A hat in any colour, for the hat trick.
    const hat = colour => keep(`hat${colour}`, () => stamp(THINGS.hat, { R: colour }));

    // ---- Figures seen from above ----------------------------------------------------------
    // Drawn into a small grid in the figure's own frame (u ahead of him, v to his right), given a dark
    // edge, and kept as a sprite for each kit, direction and pose.
    const SIZE = 33, MID = 16, Z = 1.35;          // every figure is drawn a third bigger than life: it is pocket hockey
    function figure(colours, dir, paint) {
        const cells = new Array(SIZE * SIZE).fill(''), fx = Math.cos(dir), fy = Math.sin(dir);
        const G = {
            at: (u, v) => [MID + (u * fx - v * fy) * Z, MID + (u * fy + v * fx) * Z],
            blob(u, v, a, b, colour, alt, edge) {
                a *= Z; b *= Z; edge *= Z;
                const [cx, cy] = G.at(u, v), reach = Math.ceil(Math.max(a, b)) + 1;
                for (let y = Math.floor(cy - reach); y <= cy + reach; y++) for (let x = Math.floor(cx - reach); x <= cx + reach; x++) {
                    if (x < 1 || y < 1 || x >= SIZE - 1 || y >= SIZE - 1) continue;
                    const dx = x - cx, dy = y - cy, lu = dx * fx + dy * fy, lv = -dx * fy + dy * fx;
                    if ((lu / a) ** 2 + (lv / b) ** 2 <= 1) cells[y * SIZE + x] = alt && Math.abs(lv) > edge ? alt : colour;
                }
            },
            dot(u, v, colour) { const [x, y] = G.at(u, v), px = Math.round(x), py = Math.round(y); if (px > 0 && py > 0 && px < SIZE - 1 && py < SIZE - 1) cells[py * SIZE + px] = colour; },
            line(u0, v0, u1, v1, colour) { const n = Math.ceil(Math.hypot(u1 - u0, v1 - v0) * 2.2); for (let i = 0; i <= n; i++) G.dot(u0 + (u1 - u0) * i / n, v0 + (v1 - v0) * i / n, colour); },
        };
        paint(G, colours);
        const c = sheet(SIZE, SIZE), ctx = c.getContext('2d');
        for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
            let colour = cells[y * SIZE + x];
            if (!colour && (cells[y * SIZE + x - 1] || cells[y * SIZE + x + 1] || cells[(y - 1) * SIZE + x] || cells[(y + 1) * SIZE + x])) colour = INK;
            if (colour) { ctx.fillStyle = colour; ctx.fillRect(x, y, 1, 1); }
        }
        return c;
    }
    const WOOD = '#c9a26b', BLADE = '#2b2622', SKATE = '#2a2d3a', PAD = '#f3efe2';
    function skater(G, c, pose, frame, beard) {
        if (pose === 'down') {
            G.line(-1, 5, 4, 6.2, WOOD);
            G.blob(-5, -1.6, 1.4, 0.8, SKATE); G.blob(-5, 1.6, 1.4, 0.8, SKATE);
            G.blob(-2.4, 0, 2.4, 2, c.dark);
            G.dot(2, -3.9, c.jersey); G.dot(3, -4.4, c.dark); G.dot(2, 3.9, c.jersey); G.dot(3, 4.4, c.dark);
            G.blob(1, 0, 2.5, 3, c.jersey, c.trim, 2.2);
            G.blob(3.7, 0.3, 1.9, 1.9, c.helmet);
            return;
        }
        const stride = [1.5, 0, -1.5, 0][frame], cheer = pose === 'cheer', up = cheer && frame % 2;
        G.blob(stride - 0.8, -1.7, 1.6, 0.75, SKATE);
        G.blob(-stride - 0.8, 1.7, 1.6, 0.75, SKATE);
        G.blob(-1.1, 0, 1.6, 2.3, c.dark);
        // The stick, and two arms to hold it.
        let hands;
        if (pose === 'windup') { G.line(1, 1.6, -4.6, 5, WOOD); G.dot(-5.2, 4.4, BLADE); G.dot(-5.6, 3.7, BLADE); hands = [[1.6, -0.6], [-0.4, 3.4]]; } else if (pose === 'shoot') { G.line(1.4, 2.4, 6, -1.6, WOOD); G.dot(6.3, -2.4, BLADE); G.dot(6.3, -3.2, BLADE); hands = [[2.2, 1.7], [3.4, 0.6]]; } else if (cheer) { G.line(0.6, 4, up ? 5.4 : 4.6, up ? 5.4 : 6.4, WOOD); hands = [[1.4 + up, -4.4], [1.4 + up, 4.4]]; } else { G.line(1.2, -1.6, 5.4, 2.7, WOOD); G.dot(6, 2.1, BLADE); G.dot(6.3, 1.3, BLADE); hands = [[1.8, -1.2], [2.9, 1.5]]; }
        G.blob(0, 0, 1.9, 4, c.jersey, c.trim, 3);
        G.line(0.7, -3.2, hands[0][0], hands[0][1], c.jersey); G.line(0.7, 3.2, hands[1][0], hands[1][1], c.jersey);
        G.dot(hands[0][0], hands[0][1], c.dark); G.dot(hands[1][0], hands[1][1], c.dark);
        G.blob(0.2, 0, 1.5, 1.5, c.helmet);
        G.dot(-0.2, -0.5, c.shine);
        if (beard > 0) G.dot(1.9, 0, '#8a5a2b');
        if (beard > 2) { G.dot(1.8, -0.8, '#8a5a2b'); G.dot(1.8, 0.8, '#8a5a2b'); }
        if (beard > 4) G.dot(2.6, 0, '#8a5a2b');
    }
    function goalie(G, c, pose) {
        const save = pose === 'save', sad = pose === 'down';
        G.line(0.8, 2.8, 3.8, 1.4, WOOD); G.dot(4.4, 0.6, BLADE); G.dot(4.4, -0.3, BLADE); G.dot(3.8, 0.4, BLADE);
        if (save) { G.blob(0.7, -3.3, 1.4, 2.1, PAD); G.blob(0.7, 3.3, 1.4, 2.1, PAD); G.dot(0.7, -4.6, c.jersey); G.dot(0.7, 4.6, c.jersey); } else { G.blob(1.2, -1.5, 2, 1.25, PAD); G.blob(1.2, 1.5, 2, 1.25, PAD); G.dot(2.4, -1.5, c.jersey); G.dot(2.4, 1.5, c.jersey); }
        G.blob(-0.3, 0, 1.6, save ? 3 : 2.7, c.jersey, c.trim, 1.9);
        G.dot(1, save ? -5.3 : -3.3, '#b98b52'); G.dot(0.2, save ? -5.3 : -3.3, '#b98b52');
        G.dot(1, 3.4, c.trim); G.dot(0.2, 3.4, c.trim);
        G.blob(sad ? 0.8 : 0, 0, 1.6, 1.6, c.helmet);
        G.dot(1.2, 0, '#f6f4ee');
    }
    // What a side wears: the home side its colours, the visitors white with the colour as trim.
    function kit(team, away) {
        const k = L.TEAMS[team].kit;
        return away ? { key: `a${team}`, jersey: '#f1f3f8', trim: k[0], dark: k[2], helmet: k[0], shine: '#ffffff' } : { key: `h${team}`, jersey: k[0], trim: k[1], dark: k[2], helmet: k[2], shine: k[1] };
    }
    const DIRS = 16;
    function player(colours, keeper, dir, pose, frame, beard) {
        const d = ((Math.round(dir / (2 * Math.PI) * DIRS) % DIRS) + DIRS) % DIRS;
        return keep(`p${colours.key}${keeper ? 'g' : 's'}${d}${pose}${frame}${beard}`, () => figure(colours, d / DIRS * 2 * Math.PI, (G, c) => (keeper ? goalie(G, c, pose) : skater(G, c, pose, frame, beard))));
    }
    // The ice resurfacer, from above: hood, a driver in a red cap, the conditioner dragging behind.
    function machine(dir) {
        const d = ((Math.round(dir / (2 * Math.PI) * DIRS) % DIRS) + DIRS) % DIRS;
        return keep(`machine${d}`, () => figure(null, d / DIRS * 2 * Math.PI, G => {
            for (const [u, v] of [[4.5, -4], [4.5, 4], [-3.5, -4], [-3.5, 4]]) G.blob(u, v, 1.5, 1, '#20232c');
            G.blob(-6.3, 0, 1.6, 4.4, '#56606e');
            for (let u = -5; u <= 7; u += 0.5) for (let v = -3.6; v <= 3.6; v += 0.5) G.dot(u, v, u > 4 ? '#7fc4ee' : u < -2.5 ? '#aeb8c4' : Math.abs(v) > 2.6 ? '#3f73c8' : '#f4f6fa');
            G.blob(0.6, 0, 1.7, 1.7, '#e2b07e');
            G.blob(0.2, 0, 1.1, 1.5, '#2f9a5c');
            G.dot(6.6, -2.4, '#ffe680'); G.dot(6.6, 2.4, '#ffe680');
        }));
    }
    const shadow = () => keep('shadow', () => { const c = sheet(11, 6), ctx = c.getContext('2d'); ctx.fillStyle = 'rgba(40, 60, 110, 0.22)'; ctx.fillRect(2, 0, 7, 6); ctx.fillRect(0, 1, 11, 4); ctx.fillRect(1, 0, 9, 6); return c; });
    // A lamp's glow, baked once and drawn with whatever alpha the moment wants.
    const glow = () => keep('glow', () => {
        const c = sheet(25, 25), ctx = c.getContext('2d');
        for (let r = 12; r > 0; r -= 2) { ctx.fillStyle = `rgba(255, 60, 50, ${0.1 + (12 - r) * 0.03})`; ctx.beginPath(); ctx.arc(12.5, 12.5, r, 0, 7); ctx.fill(); }
        return c;
    });

    // ---- The view: where the rink sits in the picture ---------------------------------------
    // The picture is `bw` × `bh` pixels, each `px` CSS px. A wide screen lays the rink on its side;
    // an upright phone stands it on end, with the benches down the left.
    function layout(width, height, inset) {
        const upright = height > width * 1.15, needW = upright ? 222 : 424, needH = upright ? 494 : 269;
        const fit = Math.min(width / needW, (height - inset) / needH);
        const px = Math.max(1, fit < 3 ? Math.round(fit * 2) / 2 : Math.round(fit));
        const bw = Math.ceil(width / px), bh = Math.ceil(height / px), low = Math.ceil(inset / px);
        const top = upright ? 34 : 23, bottom = bh - low - (upright ? 26 : 15), bench = 12;
        const k = upright ? Math.min((bw - 8 - bench) / (2 * L.HW), (bottom - top - 8) / (2 * L.HL)) : Math.min((bw - 20) / (2 * L.HL), (bottom - top - bench - 8) / (2 * L.HW));
        const cx = upright ? Math.round((bench + bw) / 2) : Math.round(bw / 2), cy = upright ? Math.round((top + bottom) / 2) : Math.round((top + bench + bottom) / 2);
        return {
            px, bw, bh, low, top, bottom, upright, k, cx, cy, turn: upright ? -Math.PI / 2 : 0,
            X: upright ? (x, y) => cx + y * k : x => cx + x * k,
            Y: upright ? x => cy - x * k : (x, y) => cy + y * k,
            back: upright ? (sx, sy) => [(cy - sy) / k, (sx - cx) / k] : (sx, sy) => [(sx - cx) / k, (sy - cy) / k],
        };
    }

    // ---- The arena, baked once a game ---------------------------------------------------------
    const noise = (x, y) => { let h = Math.imul(x * 374761393 + y * 668265263, 1274126177); h ^= h >>> 13; h = Math.imul(h, 1103515245); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    const ADS = ['#d8343a', '#3f73c8', '#f6f4ee', '#3fa55b', '#f6f4ee', '#f08a24', '#f6f4ee', '#8d5fd3'];
    const CROWD = ['#8892a6', '#a9b4c4', '#6d7a91', '#c9b79c', '#9a8f7c', '#b7c4d8', '#7e6a8f', '#5f8f8a'];
    const SKIN = ['#f0c9a0', '#d9a878', '#a8744a', '#7a5233'];

    function arena(view, home, away, fullness, champions) {
        const { bw, bh, k } = view, base = sheet(bw, bh), ctx = base.getContext('2d');
        const HL = L.HL, HW = L.HW, R = L.CORNER, GX = L.GOAL_X, thin = 0.6 / k, thick = 1 / k;
        const colourAt = (sx, sy) => {
            const [x, y] = view.back(sx + 0.5, sy + 0.5), ax = Math.abs(x), ay = Math.abs(y);
            const qx = ax - (HL - R), qy = ay - (HW - R), sd = (Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - R) * k;
            if (sd > 0) {
                if (sd <= 1) return '#f2c94c';
                if (sd <= 3.2) return ax < HL - R - 2 && Math.floor((x + HL) / 14) % 2 ? ADS[Math.floor((x + HL) / 14 + (y > 0 ? 3 : 0)) % ADS.length] : '#f6f4ee';
                if (sd <= 4.2) return '#3a475e';
                // The benches, along the far boards.
                if (y < 0 && ax > 4 && ax < 44 && ay > HW && sd <= 13) return sd > 12 ? '#3a475e' : sd > 8 && sd <= 10 ? '#9a7447' : '#5a6578';
                return sd <= 8 ? '#262c3a' : '#1a1f2b';
            }
            // Nets.
            if (ax >= GX && ax <= GX + L.NET_DEPTH && ay <= L.NET_HALF) {
                if (ax > GX + L.NET_DEPTH - thick || ay > L.NET_HALF - thick) return '#d43d43';
                return (sx + sy) % 2 ? '#eef2f6' : '#c5cfdb';
            }
            const r = Math.hypot(x, y);
            if (r < 1.4) return '#4f7fd0';
            if (ax < thick) return '#e0565b';
            if (Math.abs(r - 15) < thin) return '#6f9be0';
            if (Math.abs(ax - 28) < thick) return '#6f9be0';
            const front = GX - ax, cr = Math.hypot(front, y);
            if (front > 0 && Math.abs(cr - L.CREASE) < thin) return '#e0565b';
            if (front > 0 && cr < L.CREASE) return '#bcdcf5';
            if (Math.abs(front) < thin) return '#eb9aa0';
            const zr = Math.hypot(ax - 56, ay - 26);
            if (zr < 1.3 || Math.abs(zr - 12) < thin) return '#e0565b';
            if (Math.hypot(ax - 18, ay - 26) < 1.2) return '#e0565b';
            if (sd > -3) return '#d7e6f3';
            return (sx * 3 + sy * 5) % 53 < 2 ? '#f7fbff' : noise(sx >> 2, sy >> 1) < 0.08 ? '#dfecf7' : '#e8f2fa';
        };
        for (let y = 0; y < bh; y++) {
            let start = 0, colour = colourAt(0, y);
            for (let x = 1; x <= bw; x++) {
                const next = x < bw ? colourAt(x, y) : null;
                if (next !== colour) { ctx.fillStyle = colour; ctx.fillRect(start, y, x - start, 1); start = x; colour = next; }
            }
        }
        // The home club's badge under the ice at centre.
        ctx.globalAlpha = 0.2;
        ctx.imageSmoothingEnabled = false;
        const badge = head(home), size = Math.round(12 * Math.max(2, Math.round(k * 1.3)));
        ctx.drawImage(badge, Math.round(view.cx - size / 2), Math.round(view.cy - size / 2), size, size);
        ctx.globalAlpha = 1;
        // The crowd, seat by seat. Two more sheets hold the same people on their feet: the home end and the visitors.
        const up = [sheet(bw, bh), sheet(bw, bh)], ups = up.map(c => c.getContext('2d'));
        const hk = L.TEAMS[home].kit, ak = L.TEAMS[away].kit;
        for (let cj = 0; cj * 5 < bh; cj++) for (let ci = -1; ci * 4 < bw; ci++) {
            const sx = ci * 4 + (cj % 2) * 2, sy = cj * 5 + 1;
            if (colourAt(sx + 1, sy + 2) !== '#1a1f2b' || colourAt(sx + 1, sy - 1) !== '#1a1f2b' || colourAt(sx + 1, sy + 4) !== '#1a1f2b') continue;
            if ((ci + 400) % 11 === 5) { ctx.fillStyle = '#232938'; ctx.fillRect(sx, sy, 3, 5); continue; }
            const roll = noise(ci + 31, cj + 17), who = noise(ci + 7, cj + 91);
            if (roll > fullness) { ctx.fillStyle = '#2a3142'; ctx.fillRect(sx, sy + 3, 3, 1); continue; }
            const side = who < 0.5 ? 0 : who < 0.62 ? 1 : -1;
            const shirt = side === 0 ? (who < 0.4 ? hk[0] : hk[1]) : side === 1 ? (who < 0.58 ? ak[0] : '#f1f3f8') : CROWD[Math.floor(who * 97) % CROWD.length];
            const skin = SKIN[Math.floor(noise(ci + 3, cj + 5) * SKIN.length)];
            ctx.fillStyle = skin; ctx.fillRect(sx + 1, sy, 2, 2);
            ctx.fillStyle = shirt; ctx.fillRect(sx, sy + 2, 3, 2);
            const u = ups[side === 1 ? 1 : 0];
            if (side === -1 && noise(ci, cj) < 0.5) continue;                 // half the neutrals keep their seats
            u.fillStyle = '#1a1f2b'; u.fillRect(sx, sy, 3, 4);
            u.fillStyle = skin; u.fillRect(sx + 1, sy - 1, 2, 2);
            u.fillStyle = shirt; u.fillRect(sx + 1, sy + 1, 2, 2); u.fillRect(sx, sy - 1, 1, 2); u.fillRect(sx + 3, sy - 1, 1, 2);
        }
        // Banners for the champions of seasons past.
        if (!view.upright) (champions || []).slice(-10).forEach((c, n) => {
            const kc = L.TEAMS[c.team].kit, x = 3 + n * 7, y = 2;
            ctx.fillStyle = INK; ctx.fillRect(x - 1, y - 1, 7, 9);
            ctx.fillStyle = kc[0]; ctx.fillRect(x, y, 5, 6); ctx.fillRect(x + 1, y + 6, 3, 1);
            ctx.fillStyle = kc[1]; ctx.fillRect(x, y + 2, 5, 1);
        });
        return { base, up };
    }

    return { INK, sheet, measure, write, wrap, stamp, head, mascot, thing, hat, kit, player, machine, shadow, glow, layout, arena, noise };
})();
