// ============================================================================
// Pixel Quest art kit
//
// Everything the quest wallpaper draws is authored here as little character
// maps -- one letter per pixel, '.' for transparent -- and baked into canvases
// on demand. Maps leave the outline out: PixelGrid.outline() traces a dark
// border around whatever was filled, which keeps the maps short and lets one
// map serve every palette.
//
// Also here: the hero roster (with palettes and personalities), hats,
// companions, the bestiary, biomes, dungeon themes, the bitmap font, and the
// name, sign and quip tables that give the world its voice.
// ============================================================================

const QuestArt = (() => {
    'use strict';

    // -----------------------------------------------------------------------
    // Small utilities
    // -----------------------------------------------------------------------
    function hexToRgb(hex) {
        const h = hex.replace('#', '');
        const v = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
        return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
    }

    function rgbToHex(r, g, b) {
        const c = (x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0');
        return '#' + c(r) + c(g) + c(b);
    }

    // amt < 0 darkens toward black, > 0 lightens toward white
    function shade(hex, amt) {
        const [r, g, b] = hexToRgb(hex);
        if (amt < 0) return rgbToHex(r * (1 + amt), g * (1 + amt), b * (1 + amt));
        return rgbToHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
    }

    function mix(a, b, t) {
        const A = hexToRgb(a), B = hexToRgb(b);
        return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
    }

    function mulberry32(seed) {
        let a = seed >>> 0;
        return function () {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function hash2(x, y, s = 0) {
        let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    }

    // Mirror an 8-wide half map into a symmetric 16-wide one
    function half(rows) {
        return rows.map(r => r + r.split('').reverse().join(''));
    }

    function flipRows(rows) {
        return rows.map(r => r.split('').reverse().join(''));
    }

    // -----------------------------------------------------------------------
    // PixelGrid: a tiny raster of colour strings with an auto-outline pass
    // -----------------------------------------------------------------------
    class PixelGrid {
        constructor(w, h) {
            this.w = w;
            this.h = h;
            this.px = new Array(w * h).fill(null);
        }

        get(x, y) {
            if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
            return this.px[y * this.w + x];
        }

        set(x, y, c) {
            x = Math.round(x); y = Math.round(y);
            if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
            this.px[y * this.w + x] = c;
        }

        // Paint a character map. Letters missing from the palette are skipped,
        // so one map can carry optional details a palette leaves out.
        stamp(rows, pal, ox = 0, oy = 0, flip = false) {
            for (let y = 0; y < rows.length; y++) {
                const row = rows[y];
                for (let x = 0; x < row.length; x++) {
                    const ch = row[flip ? row.length - 1 - x : x];
                    if (ch === '.' || ch === ' ') continue;
                    const c = pal[ch];
                    if (c) this.set(ox + x, oy + y, c);
                }
            }
            return this;
        }

        rect(x, y, w, h, c) {
            for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
            return this;
        }

        ellipse(cx, cy, rx, ry, c) {
            for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
                for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
                    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
                    if (dx * dx + dy * dy <= 1) this.set(x, y, c);
                }
            }
            return this;
        }

        line(x0, y0, x1, y1, c) {
            const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
            for (let i = 0; i <= n; i++) this.set(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c);
            return this;
        }

        // Trace a 1px border around everything filled. Diagonal neighbours
        // are left out so corners stay soft, the way NES sprites round off.
        outline(c, diagonal = false) {
            const add = [];
            for (let y = 0; y < this.h; y++) {
                for (let x = 0; x < this.w; x++) {
                    if (this.get(x, y)) continue;
                    let hit = this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1);
                    if (!hit && diagonal) hit = this.get(x - 1, y - 1) || this.get(x + 1, y - 1) || this.get(x - 1, y + 1) || this.get(x + 1, y + 1);
                    if (hit) add.push(y * this.w + x);
                }
            }
            for (const i of add) this.px[i] = c;
            return this;
        }

        // Darken the lower-right rim of each filled region: cheap form shading
        shadeEdges(amount = -0.25) {
            const out = this.px.slice();
            for (let y = 0; y < this.h; y++) {
                for (let x = 0; x < this.w; x++) {
                    const c = this.get(x, y);
                    if (!c) continue;
                    if (!this.get(x + 1, y) || !this.get(x, y + 1)) out[y * this.w + x] = shade(c, amount);
                }
            }
            this.px = out;
            return this;
        }

        toCanvas() {
            const cv = document.createElement('canvas');
            cv.width = this.w;
            cv.height = this.h;
            const ctx = cv.getContext('2d');
            const img = ctx.createImageData(this.w, this.h);
            const cache = {};
            for (let i = 0; i < this.px.length; i++) {
                const c = this.px[i];
                if (!c) continue;
                const rgb = cache[c] || (cache[c] = hexToRgb(c));
                img.data[i * 4] = rgb[0];
                img.data[i * 4 + 1] = rgb[1];
                img.data[i * 4 + 2] = rgb[2];
                img.data[i * 4 + 3] = 255;
            }
            ctx.putImageData(img, 0, 0);
            return cv;
        }
    }

    function flipCanvas(src) {
        const cv = document.createElement('canvas');
        cv.width = src.width;
        cv.height = src.height;
        const ctx = cv.getContext('2d');
        ctx.translate(src.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(src, 0, 0);
        return cv;
    }

    // A solid-colour copy of a sprite, for the hit flash
    function silhouette(src, color) {
        const cv = document.createElement('canvas');
        cv.width = src.width;
        cv.height = src.height;
        const ctx = cv.getContext('2d');
        ctx.drawImage(src, 0, 0);
        ctx.globalCompositeOperation = 'source-in';
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, cv.width, cv.height);
        return cv;
    }

    const OUTLINE = '#140c1c';

    // -----------------------------------------------------------------------
    // Bitmap font: 3x5 glyphs on a 4px advance
    // -----------------------------------------------------------------------
    // Each glyph is five 3-cell rows; "@" is a little heart
    const FONT = {
        'A': '.#.#.#####.##.#', 'B': '##.#.###.#.###.', 'C': '.###..#..#...##', 'D': '##.#.##.##.###.', 'E': '####..##.#..###', 'F': '####..##.#..#..',
        'G': '.###..#.##.#.##', 'H': '#.##.#####.##.#', 'I': '###.#..#..#.###', 'J': '..#..#..##.#.#.', 'K': '#.##.###.#.##.#', 'L': '#..#..#..#..###',
        'M': '#.########.##.#', 'N': '##.#.##.##.##.#', 'O': '.#.#.##.##.#.#.', 'P': '##.#.###.#..#..', 'Q': '.#.#.##.###..##', 'R': '##.#.###.#.##.#',
        'S': '.###...#...###.', 'T': '###.#..#..#..#.', 'U': '#.##.##.##.#.##', 'V': '#.##.##.#.#..#.', 'W': '#.##.########.#', 'X': '#.##.#.#.#.##.#',
        'Y': '#.##.#.#..#..#.', 'Z': '###..#.#.#..###', '0': '####.##.##.####', '1': '.#.##..#..#.###', '2': '##...#.#.#..###', '3': '##...#.#...###.',
        '4': '#.##.####..#..#', '5': '####..##...###.', '6': '.###..####.####', '7': '###..#.#..#..#.', '8': '####.#####.####', '9': '####.####..###.',
        '!': '.#..#..#.....#.', '?': '##...#.#.....#.', '.': '.............#.', ',': '..........#.#..', '\'': '.#..#..........', '"': '#.##.#.........',
        '-': '......###......', '+': '....#.###.#....', ':': '....#.....#....', '/': '..#..#.#.#..#..', '(': '.#.#..#..#...#.', ')': '.#...#..#..#.#.',
        '=': '...###...###...', '%': '#.#..#.#.#..#.#', '&': '.#.#.#.#.#.#.##', '#': '#.#####.#####.#', '$': '.####..#..####.', '*': '...#.#.#.#.#...',
        '@': '#.#######.#....', '<': '..#.#.#...#...#', '>': '#...#...#.#.#..', '_': '............###', '~': '....####.......', ' ': '...............',
        '^': '.#.#.#.........', ';': '....#.....#.#..'
    };

    // -----------------------------------------------------------------------
    // Icons and pickups (8x8)
    // -----------------------------------------------------------------------
    const ICONS = {
        heart: { pal: { r: '#e83030', R: '#a81020', w: '#fcfcfc' }, rows: [
            '........',
            '.rr..rr.',
            'rwrrrrrR',
            'rrrrrrrR',
            'rrrrrrRR',
            '.rrrrRR.',
            '..rrRR..',
            '...RR...'] },
        heartHalf: { pal: { r: '#e83030', R: '#a81020', w: '#fcfcfc', k: '#3c1c2c' }, rows: [
            '........',
            '.rr..kk.',
            'rwrrkkkk',
            'rrrrkkkk',
            'rrrrkkkk',
            '.rrrkkk.',
            '..rrkk..',
            '...rk...'] },
        heartEmpty: { pal: { k: '#3c1c2c', K: '#5c2c3c' }, rows: [
            '........',
            '.kk..kk.',
            'kKkkkkkk',
            'kkkkkkkk',
            'kkkkkkkk',
            '.kkkkkk.',
            '..kkkk..',
            '...kk...'] },
        gem: { pal: { g: '#38d838', G: '#088808', w: '#d8fcd8' }, rows: [
            '...gg...',
            '..gwgG..',
            '.gwggGG.',
            '.gwggGG.',
            '.gwggGG.',
            '.ggggGG.',
            '..ggGG..',
            '...GG...'] },
        gemBlue: { pal: { g: '#3cbcfc', G: '#0058f8', w: '#e0f8fc' }, rows: null },
        gemRed: { pal: { g: '#f85858', G: '#a80020', w: '#fcd8d8' }, rows: null },
        fish: { pal: { b: '#7cb8e8', B: '#3c6ca8', e: '#140c1c', w: '#e8f4fc' }, rows: [
            '........',
            '........',
            '.bbbb..b',
            'bwbebbBB',
            'bbbbbbBB',
            '.BBBB..B',
            '........',
            '........'] },
        star: { pal: { y: '#fcd800', Y: '#d88000', w: '#fcfcb0' }, rows: [
            '...y....',
            '...yy...',
            'yyywyyy.',
            '.yyyyY..',
            '..yyyY..',
            '.yY.yY..',
            '.Y...Y..',
            '........'] },
        coin: { pal: { y: '#fcc800', Y: '#c07000', w: '#fcfcb0' }, rows: [
            '..yyyy..',
            '.ywyyyY.',
            'ywyYYyyY',
            'yyyYyyyY',
            'yyyYyyyY',
            'yyyYYyyY',
            '.yyyyyY.',
            '..YYYY..'] },
        bug: { pal: { k: '#384848', w: '#c8f0fc', e: '#e83030' }, rows: [
            '........',
            '.ww.ww..',
            'wwwwwww.',
            '.wkkkw..',
            '..kkkke.',
            '..kkkk..',
            '..k..k..',
            '........'] },
        bolt: { pal: { s: '#bcbcbc', S: '#686868', w: '#fcfcfc' }, rows: [
            '..sss...',
            '.swssS..',
            '.ssSsS..',
            '..sSS...',
            '...sS...',
            '...sS...',
            '...sS...',
            '...SS...'] },
        bread: { pal: { b: '#e8a048', B: '#a85c18', w: '#fce0a8' }, rows: [
            '........',
            '..bbbb..',
            '.bwbwbb.',
            'bbbbbbbB',
            'bwwwwwbB',
            'bwwwwwbB',
            '.BBBBBB.',
            '........'] },
        acorn: { pal: { c: '#8c5c2c', C: '#5c3418', n: '#d89850', N: '#a86828' }, rows: [
            '...C....',
            '.cccccc.',
            'cCcCcCcC',
            '.CCCCCC.',
            '.nnnnnN.',
            '.nnnnnN.',
            '..nnNN..',
            '...NN...'] },
        bone: { pal: { w: '#fcf8e8', W: '#c8bca0' }, rows: [
            '........',
            'ww....ww',
            'wwwwwwwW',
            '.wwwwwW.',
            '.wwwwwW.',
            'wwwwwwwW',
            'WW....WW',
            '........'] },
        candy: { pal: { r: '#f83878', w: '#fcfcfc', p: '#f8a8d0' }, rows: [
            '........',
            'p......p',
            'pp.rr.pp',
            'pprwrrpp',
            'pprrwrpp',
            'pp.rr.pp',
            'p......p',
            '........'] },
        milk: { pal: { w: '#fcfcfc', W: '#c8c8d8', c: '#3c78d8', b: '#58b8f8' }, rows: [
            '...cc...',
            '...ww...',
            '..wwww..',
            '.wwwwwW.',
            '.wbbbwW.',
            '.wbbbwW.',
            '.wwwwwW.',
            '..WWWW..'] },
        cowbell: { pal: { y: '#fcc800', Y: '#c08000', w: '#fcfcb0', k: '#5c3418' }, rows: [
            '...yy...',
            '..y..y..',
            '..yyyy..',
            '.yywyyy.',
            '.yywyyY.',
            'yyyyyyYY',
            'YYYYYYYY',
            '...kk...'] },
        key: { pal: { y: '#fcc800', Y: '#a86000' }, rows: [
            '..yyy...',
            '.y...y..',
            '.y...Y..',
            '..yYY...',
            '...y....',
            '...yY...',
            '...y....',
            '...yY...'] },
        bossKey: { pal: { y: '#f878f8', Y: '#9838a8' }, rows: null },
        bomb: { pal: { k: '#3858a8', K: '#18284c', w: '#a8c8fc', f: '#fca044', y: '#fce800' }, rows: [
            '......y.',
            '.....f..',
            '...kkf..',
            '..kkkkk.',
            '.kwkkkkK',
            '.kkkkkkK',
            '.kkkkkKK',
            '..KKKKK.'] },
        shard: { pal: { y: '#fce800', Y: '#d88000', w: '#fcfcfc' }, rows: [
            '...yy...',
            '...wy...',
            '..ywyy..',
            '..yyyY..',
            '.ywyyyY.',
            '.yyyyYY.',
            'yyyyyyYY',
            'YYYYYYYY'] },
        shardEmpty: { pal: { o: '#5c4c30' }, rows: [
            '...oo...',
            '...oo...',
            '..o..o..',
            '..o..o..',
            '.o....o.',
            '.o....o.',
            'o......o',
            'oooooooo'] },
        potion: { pal: { g: '#bcbcbc', r: '#f83858', R: '#a81020', w: '#fcfcfc', c: '#ac7c00' }, rows: [
            '...cc...',
            '...gg...',
            '..g..g..',
            '.grrrrg.',
            '.rwrrrR.',
            '.rrrrRR.',
            '.rrrRRR.',
            '..RRRR..'] },
        boomerang: { pal: { b: '#e8a048', B: '#a85c18', r: '#f83800' }, rows: [
            '.bbbbb..',
            'bbBBBBr.',
            'bB......',
            'bB......',
            'bB......',
            'bB......',
            '.r......',
            '........'] },
        candle: { pal: { c: '#fcfcfc', C: '#bcbcbc', f: '#fca044', y: '#fce800', b: '#ac7c00' }, rows: [
            '...y....',
            '..yfy...',
            '...f....',
            '..cCc...',
            '..cCc...',
            '..cCc...',
            '.bbbbb..',
            '........'] },
        boots: { pal: { b: '#a85c18', B: '#5c3418', w: '#fce0a8', y: '#fcc800' }, rows: [
            '..bbb...',
            '..bbB...',
            '..bbB...',
            '..byB...',
            '..bbbbb.',
            '.bbbbbbB',
            '.BBBBBBB',
            '........'] },
        shield: { pal: { s: '#3c78d8', S: '#1c3c88', y: '#fcc800', w: '#a8d0fc' }, rows: [
            '.yyyyyy.',
            'yswssSSy',
            'yswyySSy',
            'ysyyyySy',
            'yssyySSy',
            '.ysssSy.',
            '..ysSy..',
            '...yy...'] },
        glove: { pal: { r: '#f83800', R: '#a81000', w: '#fcb8a8' }, rows: [
            '..r.r.r.',
            '.rrrrrrr',
            '.rwrrrrR',
            'rrrrrrrR',
            'rrrrrrRR',
            '.rrrrRR.',
            '..rrrR..',
            '..RRRR..'] },
        heartPiece: { pal: { r: '#f83858', w: '#fcfcfc', k: '#f8a8c0' }, rows: [
            '.rr..kk.',
            'rwrrk..k',
            'rrrrk..k',
            'rrrrk..k',
            '.kkkk.k.',
            '..k..k..',
            '...kk...',
            '........'] },
        heartContainer: { pal: { r: '#f83858', R: '#a81020', w: '#fcfcfc', y: '#fce800' }, rows: [
            'y.rr.rr.',
            '.rwrrrrR',
            'rwrrrrrR',
            'rrrrrrRR',
            '.rrrrRR.',
            '..rrRR.y',
            '...RR...',
            'y.......'] },
        fairy: { pal: { p: '#f878f8', w: '#fcfcfc', b: '#a8e4fc', s: '#fcc89c' }, rows: [
            'bb...bb.',
            'bwb.bwb.',
            '.bbsbb..',
            '...p....',
            '..ppp...',
            '...p....',
            '..p.p...',
            '........'] },
        fairy2: { pal: { p: '#f878f8', w: '#fcfcfc', b: '#a8e4fc', s: '#fcc89c' }, rows: [
            '........',
            '...s....',
            'bbbpbbb.',
            'bwbpbwb.',
            '.bpppb..',
            '...p....',
            '..p.p...',
            '........'] },
        // Trinkets: whimsical junk the hero collects and proudly lists in the credits
        sock: { pal: { r: '#e83030', w: '#fcfcfc', R: '#a81020' }, rows: [
            '..rrrr..',
            '..wwww..',
            '..rrrr..',
            '..wwww..',
            '..rrrrr.',
            '.rrrrrrR',
            '.rrrrRR.',
            '........'] },
        spoon: { pal: { s: '#d8d8e8', S: '#888898', w: '#fcfcfc' }, rows: [
            '.....ss.',
            '....swsS',
            '....sssS',
            '...s.SS.',
            '..s.....',
            '.s......',
            's.......',
            '........'] },
        rock: { pal: { g: '#a8a8a8', G: '#686868', w: '#e8e8e8' }, rows: [
            '........',
            '........',
            '...ggg..',
            '..gwgggG',
            '.ggggggG',
            '.gggggGG',
            '..GGGGG.',
            '........'] },
        duckToy: { pal: { y: '#fce800', Y: '#d8a000', o: '#fc7400', e: '#140c1c' }, rows: [
            '..yyy...',
            '.yyeyoo.',
            '.yyyy...',
            'y..yyyy.',
            'yyyyyyyY',
            'yyyyyyYY',
            '.YYYYYY.',
            '........'] },
        teacup: { pal: { w: '#fcfcfc', W: '#bcbcbc', p: '#f878b8' }, rows: [
            '........',
            '........',
            'wwwwww..',
            'wppppwww',
            'wwwwww.w',
            '.wwwww..',
            'WWWWWWW.',
            '........'] },
        button: { pal: { b: '#3c78d8', B: '#1c3c88', k: '#140c1c' }, rows: [
            '..bbbb..',
            '.bbbbbB.',
            'bbkbbkbB',
            'bbbbbbbB',
            'bbkbbkbB',
            'bbbbbbBB',
            '.bBBBBB.',
            '..BBBB..'] },
        feather: { pal: { w: '#fcfcfc', b: '#a8d0fc', s: '#8c5c2c' }, rows: [
            '......wb',
            '.....wwb',
            '....wwb.',
            '...wwb..',
            '..wwb...',
            '.wbb....',
            '.s......',
            's.......'] },
        banana: { pal: { y: '#fce800', Y: '#c8a000', b: '#5c3418' }, rows: [
            '......b.',
            '......y.',
            '.....yY.',
            '....yyY.',
            '..yyyY..',
            'yyyyY...',
            '.YYY....',
            '........'] },
        mushroomItem: { pal: { r: '#e83030', w: '#fcfcfc', s: '#fce0a8', k: '#140c1c' }, rows: [
            '..rrrr..',
            '.rwwrrr.',
            'rrwwrrwr',
            'rrrrrrrr',
            '..skks..',
            '..ssss..',
            '..ssss..',
            '........'] }
    };
    ICONS.gemBlue.rows = ICONS.gem.rows;
    ICONS.gemRed.rows = ICONS.gem.rows;
    ICONS.bossKey.rows = ICONS.key.rows;
    
    // -----------------------------------------------------------------------
    // Hero parts. Humanoids are composed from a body, a head and optional
    // headgear on a 16x20 canvas; the head sits at row 4 so hats and tall
    // ears have room above it.
    // -----------------------------------------------------------------------
    const BODIES = {
        tunic: {
            y: 12,
            down: [
                '....cccccccc....',
                '...cccccccccc...',
                '...cCccccccCc...',
                '...kaaaaaaaak...',
                '....cccccccc....',
                '.....bb..bb.....',
                '.....bb.........'],
            side: [[
                '.....cccccc.....',
                '....cccccccc....',
                '....cccCckcc....',
                '....aaaaaaaa....',
                '.....cccccc.....',
                '....bb...bb.....',
                '...bb.....bb....'], [
                '.....cccccc.....',
                '....cccccccc....',
                '....cccCckcc....',
                '....aaaaaaaa....',
                '.....cccccc.....',
                '.....bbbb.......',
                '.....bbbbb......']]
        },
        robe: {
            y: 12,
            down: [
                '....cccccccc....',
                '...cccccccccc...',
                '..ccccCccCcccc..',
                '..kcccaaaaccck..',
                '...cccCccCccc...',
                '...ccCccccCcc...',
                '...ccccccccc....'],
            side: [[
                '.....cccccc.....',
                '....ccccccccc...',
                '....cccCckccc...',
                '....caaaaaaac...',
                '....ccccccccc...',
                '...cccccccccc...',
                '...CccccccccC...'], [
                '.....cccccc.....',
                '....ccccccccc...',
                '....cccCckccc...',
                '....caaaaaaac...',
                '....ccccccccc...',
                '....cccccccccc..',
                '....CccccccccC..']]
        }
    };

    const HEADS = {
        kid: {
            y: 4,
            down: [
                '.....hhhhhh.....',
                '....hhhhhhhh....',
                '...hhhhhhhhhh...',
                '...hkkkkkkkkh...',
                '...kkekkkkekk...',
                '...kkekkkkekk...',
                '...kpkkkkkkpk...',
                '....kkkkkkkk....'],
            up: [
                '.....hhhhhh.....',
                '....hhhhhhhh....',
                '...hhhhhhhhhh...',
                '...hhhhhhhhhh...',
                '...hhhhhhhhhh...',
                '...hHhhhhhhHh...',
                '...kHhhhhhhHk...',
                '....kkkkkkkk....'],
            side: [
                '....hhhhhh......',
                '...hhhhhhhh.....',
                '...hhhhhhhhh....',
                '...hhhhkkkkkk...',
                '...hhhkkkkkek...',
                '...hhkkkkkkek...',
                '...hhkkkkkpkkk..',
                '....kkkkkkkk....']
        },
        longhair: {
            y: 4,
            down: [
                '.....hhhhhh.....',
                '....hhhhhhhh....',
                '...hhhhhhhhhh...',
                '..hhkkkkkkkkhh..',
                '..hkkekkkkekkh..',
                '..hkkekkkkekkh..',
                '..hkpkkkkkkpkh..',
                '..hhkkkkkkkkhh..',
                '..hh........hh..',
                '..hh........hh..'],
            up: [
                '.....hhhhhh.....',
                '....hhhhhhhh....',
                '...hhhhhhhhhh...',
                '..hhhhhhhhhhhh..',
                '..hhhhhhhhhhhh..',
                '..hhhhhhhhhhhh..',
                '..hHhhhhhhhhHh..',
                '..hHhhhhhhhhHh..',
                '...hHhhhhhhHh...',
                '....hhhhhhhh....'],
            side: [
                '....hhhhhh......',
                '...hhhhhhhh.....',
                '..hhhhhhhhhh....',
                '..hhhhhkkkkkk...',
                '..hhhhkkkkkek...',
                '..hhhhkkkkkek...',
                '..hhhkkkkkpkkk..',
                '..hhhhkkkkkk....',
                '..hhhh..........',
                '...hh...........']
        },
        beard: {
            y: 4,
            down: [
                '.....hhhhhh.....',
                '....hhhhhhhh....',
                '...hhhhhhhhhh...',
                '...hkkkkkkkkh...',
                '...kkekkkkekk...',
                '...kwwwwwwwwk...',
                '...wwwwwwwwww...',
                '....wwwwwwww....',
                '.....wwwwww.....',
                '......wwww......'],
            up: [
                '.....hhhhhh.....',
                '....hhhhhhhh....',
                '...hhhhhhhhhh...',
                '...hhhhhhhhhh...',
                '...hhhhhhhhhh...',
                '...hHhhhhhhHh...',
                '...kHhhhhhhHk...',
                '....kkkkkkkk....'],
            side: [
                '....hhhhhh......',
                '...hhhhhhhh.....',
                '...hhhhhhhhh....',
                '...hhhhkkkkkk...',
                '...hhhkkkkkek...',
                '...hhkkkwwwwkk..',
                '...hhkwwwwwwww..',
                '....kwwwwwwww...',
                '......wwwwww....',
                '.......wwww.....']
        },
        frog: {
            y: 3,
            down: [
                '...ww......ww...',
                '..wwww....wwww..',
                '..weew....weew..',
                '..kwwkkkkkkwwk..',
                '..kkkkkkkkkkkk..',
                '..kKkkkkkkkkKk..',
                '..kmmmmmmmmmmk..',
                '...kkppkkppkk...',
                '....kkkkkkkk....'],
            up: [
                '...kk......kk...',
                '..kkkk....kkkk..',
                '..kkkk....kkkk..',
                '..kkkkkkkkkkkk..',
                '..kKkkKkkKkkKk..',
                '..kkkkkkkkkkkk..',
                '..kkKkkkkkKkkk..',
                '...kkkkkkkkkk...',
                '....kkkkkkkk....'],
            side: [
                '........ww......',
                '.......wwww.....',
                '.......wwew.....',
                '...kkkkwwwwkk...',
                '...kkkkkkkkkkk..',
                '...kKkkkkkkkkk..',
                '...kkkkmmmmmmm..',
                '...kkkkkkpkkk...',
                '....kkkkkkkk....']
        },
        robot: {
            y: 4,
            down: [
                '...hhhhhhhhhh...',
                '..hhhhhhhhhhhh..',
                '..hssssssssssh..',
                '..hseesssseesh..',
                '..hssssssssssh..',
                '..hsssseessssh..',
                '..HhhhhhhhhhhH..',
                '......HHHH......'],
            up: [
                '...hhhhhhhhhh...',
                '..hhhhhhhhhhhh..',
                '..hHhhhhhhhhHh..',
                '..hhhhhhhhhhhh..',
                '..hhhxxhhxxhhh..',
                '..hhhhhhhhhhhh..',
                '..HhhhhhhhhhhH..',
                '......HHHH......'],
            side: [
                '....hhhhhhhhh...',
                '...hhhhhhhhhhh..',
                '...hhhhhhssssh..',
                '...hhxhhhseesh..',
                '...hhxhhhssssh..',
                '...hhhhhhssssh..',
                '...HhhhhhhhhhH..',
                '......HHHH......']
        },
        skull: {
            y: 4,
            down: [
                '.....kkkkkk.....',
                '....kkkkkkkk....',
                '...kkkkkkkkkk...',
                '...kEEkkkkEEk...',
                '...kEEkkkkEEk...',
                '...kkkkEEkkkk...',
                '....kKkKKkKk....',
                '.....kkkkkk.....'],
            up: [
                '.....kkkkkk.....',
                '....kkkkkkkk....',
                '...kkkkkkkkkk...',
                '...kkkkkkkkkk...',
                '...kKkkkkkkKk...',
                '...kkkkkkkkkk...',
                '....kKkkkkKk....',
                '.....kkkkkk.....'],
            side: [
                '....kkkkkk......',
                '...kkkkkkkk.....',
                '...kkkkkkkkk....',
                '...kkkkkkEEkk...',
                '...kkkkkkEEkk...',
                '...kkkkkkkkEk...',
                '....kkkkKkKk....',
                '.....kkkkkk.....']
        },
        animal: {
            y: 4,
            down: [
                '.....kkkkkk.....',
                '....kkkkkkkk....',
                '...kkkkkkkkkk...',
                '...kkkkkkkkkk...',
                '...kkekkkkekk...',
                '...kkekwwkekk...',
                '...kpkwppwkpk...',
                '....kkwwwwkk....'],
            up: [
                '.....kkkkkk.....',
                '....kkkkkkkk....',
                '...kkkkkkkkkk...',
                '...kkkkkkkkkk...',
                '...kkkkkkkkkk...',
                '...kKkkkkkkKk...',
                '...kKkkkkkkKk...',
                '....kkkkkkkk....'],
            side: [
                '....kkkkkk......',
                '...kkkkkkkk.....',
                '...kkkkkkkkk....',
                '...kkkkkkkkkk...',
                '...kkkkkkkekk...',
                '...kkkkkkkekww..',
                '...kkkkkkkkwwp..',
                '....kkkkkkkww...']
        },
        rodent: {
            y: 4,
            down: [
                '.....kkkkkk.....',
                '....kkkkkkkk....',
                '...kkkkkkkkkk...',
                '...kkkkkkkkkk...',
                '...kkekkkkekk...',
                '...kkekwwkekk...',
                '...kkkwppwkkk...',
                '....kkwttwkk....'],
            up: [
                '.....kkkkkk.....',
                '....kkkkkkkk....',
                '...kkkkkkkkkk...',
                '...kkkkkkkkkk...',
                '...kkkkkkkkkk...',
                '...kKkkkkkkKk...',
                '...kKkkkkkkKk...',
                '....kkkkkkkk....'],
            side: [
                '....kkkkkk......',
                '...kkkkkkkk.....',
                '...kkkkkkkkk....',
                '...kkkkkkkkkk...',
                '...kkkkkkkekk...',
                '...kkkkkkkekww..',
                '...kkkkkkkkwwp..',
                '....kkkkkkkwt...']
        },
        helmet: {
            y: 4,
            down: [
                '.....hhhhhh.....',
                '....hggggggh....',
                '...hgkkkkkklh...',
                '...hkkekkekkh...',
                '...hkkekkekkh...',
                '...hgkkkkkkgh...',
                '....hggggggh....',
                '.....hhhhhh.....'],
            up: [
                '.....hhhhhh.....',
                '....hhhhhhhh....',
                '...hhhhhhhhhh...',
                '...hhhhhhhhhh...',
                '...hhhHHhhhhh...',
                '...hhhhhhhhhh...',
                '....hhhhhhhh....',
                '.....hhhhhh.....'],
            side: [
                '.....hhhhhh.....',
                '....hhhhgggh....',
                '...hhhhgkkklh...',
                '...hhhhkkkekh...',
                '...hhhhkkkekh...',
                '...hhhhgkkkgh...',
                '....hhhhgggh....',
                '.....hhhhhh.....']
        },
        pumpkin: {
            y: 4,
            down: [
                '.......tt.......',
                '...kkkkKKkkkk...',
                '..kkKkkKKkkKkk..',
                '..kKeekKKkeeKk..',
                '..kKekkKKkkeKk..',
                '..kKkkkKKkkkKk..',
                '..kKeeeeeeeeKk..',
                '...kkKkKKkKkk...'],
            up: [
                '.......tt.......',
                '...kkkkKKkkkk...',
                '..kkKkkKKkkKkk..',
                '..kKkkkKKkkkKk..',
                '..kKkkkKKkkkKk..',
                '..kKkkkKKkkkKk..',
                '..kKkkkKKkkkKk..',
                '...kkKkKKkKkk...'],
            side: [
                '.......tt.......',
                '...kkkkKKkkkk...',
                '..kkKkkKKkkKkk..',
                '..kKkkkKKkkeek..',
                '..kKkkkKKkkkek..',
                '..kKkkkKKkkkKk..',
                '..kKkkkKKkeeek..',
                '...kkKkKKkKkk...']
        }
    };

    // Headgear that belongs to a hero (the knight's cap, the wizard's hat).
    // A hat picked in the settings replaces it.
    const GEARS = {
        elfcap: {
            y: 2,
            down: [
                '......cccc......',
                '.....cccccc.....',
                '....cccccccc....',
                '...cccccccccc...',
                '...CccccccccC...'],
            up: [
                '......cccc......',
                '.....cccccc.....',
                '....cccccccc....',
                '...cccccccccc...',
                '...cccccccccc...',
                '....CccccccC....',
                '.....CccccC.....',
                '......CCCC......'],
            side: [
                '.....ccccc......',
                '....cccccccc....',
                '...cccccccccc...',
                '..ccccCcccccc...',
                '.cccCC..........',
                '.cC.............']
        },
        wizardhat: {
            y: 0,
            down: [
                '.......xx.......',
                '......xxxX......',
                '.....xxyxxX.....',
                '.....xxxxxX.....',
                '....xxxxxxxX....',
                '..xxxxxxxxxxxx..',
                '...XXXXXXXXXX...'],
            side: [
                '.....xx.........',
                '.....xxxx.......',
                '......xxxxX.....',
                '.....xxxyxX.....',
                '....xxxxxxxX....',
                '..xxxxxxxxxxxx..',
                '...XXXXXXXXXX...']
        },
        tiara: {
            y: 2,
            down: [
                '......y..y......',
                '.....yyrryy.....'],
            side: [
                '.......y..y.....',
                '......yyrryy....']
        },
        antenna: {
            y: 0,
            down: [
                '.......rr.......',
                '.......rr.......',
                '.......hh.......',
                '.......hh.......'],
            side: [
                '......rr........',
                '......rr........',
                '.......h........',
                '.......hh.......']
        },
        bunnyears: {
            y: 0,
            down: [
                '....kk....kk....',
                '...kpk....kpk...',
                '...kpk....kpk...',
                '...kpk....kpk...',
                '....kk....kk....'],
            side: [
                '...kk..kk.......',
                '...kpk.kpk......',
                '....kpk.kpk.....',
                '....kpk.kpk.....',
                '.....kk..kk.....']
        },
        foxears: {
            y: 2,
            down: [
                '...k........k...',
                '...kk......kk...',
                '...kpk....kpk...',
                '...xxxxxxxxxx...'],
            up: [
                '...k........k...',
                '...kk......kk...',
                '...kkk....kkk...',
                '..xxxxxxxxxxxx..',
                '.x..............',
                'x...............'],
            side: [
                '.......k..k.....',
                '.......kk.kk....',
                '......kpk.kpk...',
                '..xxxxxxxxxx....',
                '.x..............',
                'x...............']
        },
        roundears: {
            y: 3,
            down: [
                '...kk......kk...',
                '..kppk....kppk..',
                '..kkkk....kkkk..'],
            side: [
                '.......kk.......',
                '......kppk......',
                '......kkkk......']
        },
        pointyears: {
            y: 3,
            down: [
                '..k..........k..',
                '..kk........kk..'],
            side: [
                '.....k..........',
                '.....kk.........']
        },
        tinyears: {
            y: 4,
            down: [
                '....k......k....'],
            side: [
                '....k...........']
        },
        antlers: {
            y: 0,
            down: [
                'nn.n........n.nn',
                'nnnnn......nnnnn',
                '.nnnnnn..nnnnnn.',
                '....nn....nn....'],
            side: [
                '..n.n.nn........',
                '..nnnnnn........',
                '...nnnnn........',
                '.....nn.........']
        },
        mushroomcap: {
            y: 0,
            down: [
                '.....rrrrrr.....',
                '...rrwwrrrrrr...',
                '..rrwwwrrrwwrr..',
                '.rrrrwrrrrwwwrr.',
                '.rrrrrrrwrrrrrr.',
                '.RRRRRRRRRRRRRR.'],
            side: [
                '.....rrrrrr.....',
                '...rrrrrwwrrr...',
                '..rrwwrrwwwrrr..',
                '.rrwwwrrrwrrrrr.',
                '.rrrwrrrrrrrrwr.',
                '.RRRRRRRRRRRRRR.']
        }
    };

    // Quadrupeds and birds are whole-body templates (16x20). The cat
    // template carries letters for every coat pattern; a breed palette that
    // leaves a letter at the base fur colour simply hides that pattern.
    // The cats' o marks cow-cat splotches and falls back to the base fur.
    const TEMPLATES = {
        cat: {
            down: [
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '...dd......dd...',
                '...dpd....dpd...',
                '...ooofffffff...',
                '..oooosffsfsff..',
                '..ffeeffffeeff..',
                '..ffeeffffeeff..',
                '..fwwwwnnwwwwf..',
                '...fwwwwwwwwfd..',
                '....qfwwwwood...',
                '...fffwwwwoood..',
                '...ffswwwwoof...',
                '....dd....dd....',
                '................'],
            up: [
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '...dd......dd...',
                '...ddd....ddd...',
                '...foofffffff...',
                '..ffoooffsffff..',
                '..ffooffffsfff..',
                '..ffffffffffff..',
                '....ffffffff..s.',
                '...fsfffooosf.f.',
                '...ffsffoooff.s.',
                '...ffffffooffff.',
                '...ffqffffffff..',
                '....dd....dd....',
                '................'],
            side: [[
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '.d.......d...d..',
                '.d.......dd.dd..',
                '.f.......fooff..',
                '.f......ffoofef.',
                '..f.....ffffwwn.',
                '..fffoooffffwww.',
                '...foooofsqfffw.',
                '...ffoofsfffffw.',
                '...ffffffffffw..',
                '...ff......ff...',
                '..dd........dd..',
                '................'], [
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '..d......d...d..',
                '..d......dd.dd..',
                '..f......fooff..',
                '..f.....ffoofef.',
                '..f.....ffffwwn.',
                '..fffoooffffwww.',
                '...foooofsqfffw.',
                '...ffoofsfffffw.',
                '...ffffffffffw..',
                '....ff....ff....',
                '....dd....dd....',
                '................']],
            hat: { down: [8, 10], up: [8, 10], side: [11, 11] }
        },
        chonker: {
            down: [
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '....dd....dd....',
                '....dpd..dpd....',
                '...ooofffffff...',
                '..oooosffsfsff..',
                '..ffeeffffeeff..',
                '..fwwwwnnwwwwf..',
                '.ffffwwwwwwfoof.',
                'fffsfwwwwwwoooof',
                'ffsqfwwwwwwoooof',
                'fffffwwwwwwfooof',
                '.ffsffwwwwffsfd.',
                '..ffffffffffffd.',
                '...dd......dd...'],
            up: [
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '....dd....dd....',
                '....ddd..ddd....',
                '...foooffffff...',
                '..fooooffsffff..',
                '..fffsffffsfff..',
                '..ffffffffffff..',
                '.ffffffffffffff.',
                'ffsfsfffoooofsff',
                'fffsffsooooosfff',
                'ffffffffooofffff',
                '.ffqffffffffffs.',
                '..ffffffffffffs.',
                '...dd......dd...'],
            side: [[
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '.........d...d..',
                '.........dd.dd..',
                '.........fooof..',
                '........ffoofef.',
                '.d.fffffffffwwn.',
                '.dffooooffffwww.',
                'ffsoooooqfffffw.',
                'ffffooosffoofww.',
                'fsffsffffooooww.',
                '.fffffffffffff..',
                '..dd.......dd...',
                '................'], [
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '.........d...d..',
                '.........dd.dd..',
                '.........fooof..',
                '........ffoofef.',
                'd..fffffffffwwn.',
                '.dffooooffffwww.',
                'ffsoooooqfffffw.',
                'ffffooosffoofww.',
                'fsffsffffooooww.',
                '.fffffffffffff..',
                '...dd.....dd....',
                '................']],
            hat: { down: [8, 10], up: [8, 10], side: [11, 11] }
        },
        coon: {
            down: [
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '...w........w...',
                '...dd......dd...',
                '...dpd....dpd...',
                '...ooofffffff...',
                '..oooosffsfsff..',
                '..ffeeffffeeff..',
                '.fffeeffffeefff.',
                '.ffwwwwnnwwwwff.',
                '.FfwwwwwwwwwwfF.',
                '..FwwwwwwwwwwF..',
                '...fffwwwwooosf.',
                '...ffswwwwoofff.',
                '....dd....dd.ff.',
                '................'],
            up: [
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '...w........w...',
                '...dd......dd...',
                '...ddd....ddd...',
                '...foofffffff...',
                '..ffoooffsffff..',
                '..ffooffffsfffs.',
                '..ffffffffffffs.',
                '....ffffffff.ss.',
                '...fsfffooosffs.',
                '...ffsffooofffs.',
                '...ffffffooffff.',
                '...ffqffffffff..',
                '....dd....dd....',
                '................'],
            side: [[
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '.........w...w..',
                'ss.......d...d..',
                'ss.......dd.dd..',
                'ff.......fooff..',
                'ff......ffoofef.',
                '.ff.....ffffwwn.',
                '.ffffoooffffwww.',
                '..ffoooosqfffww.',
                '...ffoofsffffww.',
                '...fffffffffffw.',
                '...ff......ff...',
                '..dd........dd..',
                '................'], [
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '.........w...w..',
                '.ss......d...d..',
                '.ss......dd.dd..',
                '.ff......fooff..',
                'ff......ffoofef.',
                '.ff.....ffffwwn.',
                '.ffffoooffffwww.',
                '..ffoooosqfffww.',
                '...ffoofsffffww.',
                '...fffffffffffw.',
                '...fffffffffffw.',
                '....ff....ff....',
                '....dd....dd....']],
            hat: { down: [8, 10], up: [8, 10], side: [11, 11] }
        },
        cow: {
            down: [
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '...h........h...',
                '....hffffffh....',
                '.qq.ffqqffff.qq.',
                '.qpqfqqqffffqpq.',
                '...qfeffffefq...',
                '....ffffffff....',
                '...mmmmmmmmmm...',
                '...mmnmmmmnmm...',
                '....mmmmmmmm....',
                '..fffffyyfffff..',
                '..qqffffffffqf..',
                '..qqffffffqqff..',
                '...dd......dd...',
                '................'],
            up: [
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '...h........h...',
                '....hffffffh....',
                '.qq.ffffqqff.qq.',
                '.qqqffffqqffqqq.',
                '...qffffffffq...',
                '....ffffffff....',
                '...ffffffffff...',
                '..fffqqfffffff..',
                '..ffqqqffffqff..',
                '..ffqqffffqqff..',
                '..fffffffqqfff..',
                '..ffffffffffff..',
                '...dd..tt..dd...',
                '................'],
            side: [[
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '...........h....',
                '.........qqfh...',
                '..........ffff..',
                '.t........ffeff.',
                '.t.fffqqfffffmm.',
                '.tffffqqqffffmn.',
                '..fqqffqffffff..',
                '..fqqfffffqqf...',
                '..fffffffffff...',
                '..ffffffffyff...',
                '...ff.....ff....',
                '..dd.......dd...',
                '................'], [
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '...........h....',
                '.........qqfh...',
                '..........ffff..',
                '..t.......ffeff.',
                '..tfffqqfffffmm.',
                '.tffffqqqffffmn.',
                '..fqqffqffffff..',
                '..fqqfffffqqf...',
                '..fffffffffff...',
                '..ffffffffyff...',
                '....ff...ff.....',
                '....dd...dd.....',
                '................']],
            hat: { down: [8, 7], up: [8, 7], side: [12, 8] }
        },
        dog: {
            down: [
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '....ffffffff....',
                '..dfffffffffffd.',
                '.ddfsfffffffsdd.',
                '.ddffeeffeeffdd.',
                '.ddffeeffeeffdd.',
                '..dfwwwnnwwwfd..',
                '....wwwwwwww....',
                '....ffwppwff....',
                '...ffffwwffff...',
                '...ffsffffsff...',
                '....dd....dd....',
                '................'],
            up: [
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '.....ffffff.....',
                '...dffffffffd...',
                '..ddffffffffdd..',
                '..ddffffffffdd..',
                '..ddffffffffdd.f',
                '...dffffffffd..f',
                '....ffffffff.ff.',
                '...fffffffffff..',
                '...ffsffffsff...',
                '...ffffffffff...',
                '....dd....dd....',
                '................'],
            side: [[
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '.........ffff...',
                '.f......ffffff..',
                '..f.....fddfeff.',
                '..f.....fddffwwn',
                '..f.....fddffww.',
                '..ffffffffdffff.',
                '...fffsffsffff..',
                '...ffsffsfffff..',
                '...ffffffffff...',
                '...ff......ff...',
                '..dd........dd..',
                '................'], [
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '.........ffff...',
                '........ffffff..',
                '.ff.....fddfeff.',
                '...f....fddffwwn',
                '...f....fddffww.',
                '..ffffffffdffff.',
                '...fffsffsffff..',
                '...ffsffsfffff..',
                '...ffffffffff...',
                '....ff....ff....',
                '....dd....dd....',
                '................']],
            hat: { down: [8, 9], up: [8, 9], side: [11, 9] }
        },
        bird: {
            down: [
                '................',
                '................',
                '................',
                '................',
                '................',
                '......ffff......',
                '.....ffffff.....',
                '....ffffffff....',
                '....ffeffeff....',
                '....ffbbbbff....',
                '.....fbbbbf.....',
                '....ffwwwwff....',
                '...fffwwwwfff...',
                '..ffFwwwwwwFff..',
                '..fFFwwwwwwFFf..',
                '...fFwwwwwwFf...',
                '....ffwwwwff....',
                '.....l....l.....',
                '....ll...ll.....',
                '................'],
            up: [
                '................',
                '................',
                '................',
                '................',
                '................',
                '......ffff......',
                '.....ffffff.....',
                '....ffffffff....',
                '....ffffffff....',
                '....ffffffff....',
                '.....ffffff.....',
                '....ffffffff....',
                '...ffFffffFff...',
                '..ffFFffffFFff..',
                '..fFFffffffFFf..',
                '...fFffffffFf...',
                '....fffFFfff....',
                '.....l....l.....',
                '....ll...ll.....',
                '................'],
            side: [[
                '................',
                '................',
                '................',
                '................',
                '................',
                '.......ffff.....',
                '......ffffff....',
                '......fffffff...',
                '......ffffeff...',
                '......fffffbbb..',
                '.......fffbbb...',
                '..f...fffff.....',
                '..ff.ffwwwwf....',
                '..fffffwwwwwf...',
                '..fFFfFwwwwwf...',
                '...fFFFwwwwf....',
                '....ffffwwf.....',
                '.....l...l......',
                '....ll...ll.....',
                '................'], [
                '................',
                '................',
                '................',
                '................',
                '................',
                '.......ffff.....',
                '......ffffff....',
                '......fffffff...',
                '......ffffeff...',
                '......fffffbbb..',
                '.......fffbbb...',
                '..f...fffff.....',
                '..ff.ffwwwwf....',
                '..fffffwwwwwf...',
                '..fFFfFwwwwwf...',
                '...fFFFwwwwf....',
                '....ffffwwf.....',
                '......l.l.......',
                '......lll.......',
                '................']],
            hat: { down: [8, 6], up: [8, 6], side: [9, 6] }
        },
        blob: {
            down: [
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '......gggg......',
                '....gggggggg....',
                '...gllggggggg...',
                '..gllggggggggg..',
                '..gggweggweggg..',
                '..gggweggweggg..',
                '..gggggggggggg..',
                '.gGggggppgggggG.',
                '.gGGggggggggGGg.',
                '..GGGGGGGGGGGG..',
                '................'],
            up: [
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '......gggg......',
                '....gggggggg....',
                '...gllggggggg...',
                '..gllggggggggg..',
                '..gggggggggggg..',
                '..gggggggggggg..',
                '..gggggggggggg..',
                '.gGgggggggggggG.',
                '.gGGggggggggGGg.',
                '..GGGGGGGGGGGG..',
                '................'],
            side: [[
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '......gggg......',
                '....gggggggg....',
                '...gllggggggg...',
                '..gllggggggggg..',
                '..gggggggwegwe..',
                '..gggggggwegwe..',
                '..gggggggggggg..',
                '.gGgggggggggpgg.',
                '.gGGggggggggggg.',
                '..GGGGGGGGGGGG..',
                '................'], [
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '................',
                '.....gggggg.....',
                '...gllgggggggg..',
                '..gllgggggggggg.',
                '.ggggggggwegwe..',
                '.ggggggggwegwe..',
                '.gggggggggggggg.',
                '.gGgggggggggpgg.',
                '.gGGgggggggggGg.',
                '..GGGGGGGGGGGG..',
                '................']],
            hat: { down: [8, 10], up: [8, 10], side: [9, 10] }
        }
    };

    // -----------------------------------------------------------------------
    // The hero roster. Every hero picks a body plan, a weapon behaviour, a
    // currency and a personality; variants are palettes.
    //   hp: starting hearts   speed: walking pace multiplier
    //   swim: can paddle across water tiles
    // -----------------------------------------------------------------------
    const SKIN = { k: '#fcc89c', K: '#e0a070', p: '#f89888', e: '#140c1c', w: '#fcfcfc' };
    const SKIN2 = { k: '#c88050', K: '#a05c30', p: '#e07060', e: '#140c1c', w: '#fcfcfc' };
    const SKIN3 = { k: '#8c5434', K: '#683c20', p: '#c05848', e: '#140c1c', w: '#fcfcfc' };

    // Coats shared by every cat-shaped hero
    const CAT_COATS = [
        { name: 'Orange Tabby', pal: { f: '#f89838', F: '#c86818', s: '#c05810', q: '#f89838', w: '#fce8c8', p: '#f878a8', e: '#38c838', n: '#f85878', d: '#f89838' } },
        { name: 'Tuxedo', pal: { f: '#2c2838', F: '#18141c', s: '#2c2838', q: '#2c2838', w: '#fcfcfc', p: '#f878a8', e: '#fcd800', n: '#f878a8', d: '#2c2838' } },
        { name: 'Calico', pal: { f: '#fcf4e8', F: '#d8ccb8', s: '#f89838', q: '#2c2838', w: '#fcfcfc', p: '#f878a8', e: '#d8a000', n: '#f878a8', d: '#f89838' } },
        { name: 'Void', pal: { f: '#28203c', F: '#140c1c', s: '#28203c', q: '#28203c', w: '#28203c', p: '#5c3c6c', e: '#fce800', n: '#5c3c6c', d: '#28203c' } },
        { name: 'Siamese', pal: { f: '#fcecd0', F: '#d8c098', s: '#fcecd0', q: '#fcecd0', w: '#fcf8f0', p: '#c89888', e: '#3cbcfc', n: '#5c3c2c', d: '#5c3c2c' } },
        { name: 'Silver Tabby', pal: { f: '#bcbcc8', F: '#888898', s: '#585868', q: '#bcbcc8', w: '#f0f0f8', p: '#f8a8b8', e: '#58d854', n: '#f8a8b8', d: '#bcbcc8' } },
        { name: 'Tortoiseshell', pal: { f: '#5c3418', F: '#3c2010', s: '#e88830', q: '#2c1c14', w: '#5c3418', p: '#c87878', e: '#fcb800', n: '#2c1c14', d: '#e88830' } },
        { name: 'Cream Puff', pal: { f: '#fce0b8', F: '#e8bc88', s: '#f0c890', q: '#fce0b8', w: '#fcfcfc', p: '#f8a8b8', e: '#7c4c1c', n: '#f8a8b8', d: '#fce0b8' } },
        { name: 'Russian Blue', pal: { f: '#7888a8', F: '#4c5c7c', s: '#7888a8', q: '#7888a8', w: '#98a8c8', p: '#a8a8c8', e: '#58d854', n: '#3c4c6c', d: '#7888a8' } },
        { name: 'Buff Tabby', pal: { f: '#e8b878', F: '#c89050', s: '#c08440', q: '#e8b878', w: '#fcf0d8', p: '#f8a8a8', e: '#d89800', n: '#e88888', d: '#e8b878' } },
        { name: 'Cow Cat', pal: { f: '#fcfcfc', F: '#d8d8e4', s: '#fcfcfc', o: '#2c2838', q: '#2c2838', w: '#fcfcfc', p: '#f8a8b8', e: '#58b838', n: '#f8a8b8', d: '#2c2838' } }
    ];

    const HEROES = {
        knight: {
            name: 'Knight', icon: '🗡️', kind: 'humanoid', head: 'kid', body: 'tunic', gear: 'elfcap',
            weapon: 'sword', beam: true, currency: 'gem', hp: 3, speed: 1.0,
            names: ['Lonk', 'Zink', 'Pip', 'Tunic', 'Sir Hop', 'Linc', 'Elfie', 'Brave Bean'],
            variants: [
                { name: 'Forest Green', pal: { ...SKIN, c: '#38b838', C: '#187818', h: '#f8b800', H: '#c07800', a: '#ac7c00', b: '#7c4c1c', x: '#fce800' } },
                { name: 'Ocean Blue', pal: { ...SKIN2, c: '#3c78f8', C: '#1c3ca8', h: '#503000', H: '#2c1800', a: '#d8d8d8', b: '#5c3418', x: '#fce800' } },
                { name: 'Crimson', pal: { ...SKIN, c: '#e83838', C: '#a01818', h: '#fca044', H: '#c06018', a: '#fcc800', b: '#5c3418', x: '#fce800' } },
                { name: 'Shadow', pal: { ...SKIN3, c: '#5c4c7c', C: '#3c2c54', h: '#e8e8f8', H: '#a8a8c8', a: '#a838a8', b: '#2c2040', x: '#fce800' } },
                { name: 'Royal Purple', pal: { ...SKIN2, c: '#9858f8', C: '#5c28b8', h: '#140c1c', H: '#000000', a: '#fcc800', b: '#3c2c54', x: '#fce800' } }
            ],
            quips: ['Hyah!', 'Onward!', 'For the realm!', 'Neat!', 'Hmm...', 'Adventure!', 'A secret?', 'Nice sword.']
        },
        cat: {
            name: 'Cat', icon: '🐱', kind: 'cat', weapon: 'claw', currency: 'fish', hp: 3, speed: 1.15,
            names: ['Mittens', 'Biscuit', 'Sir Whiskers', 'Noodle', 'Captain Fluff', 'Pickles', 'Mochi', 'Beans', 'Toast', 'Meatball'],
            lives: true,
            variants: CAT_COATS,
            quips: ['Mrrp?', 'Mew!', 'Hiss!', '*purr*', 'Nap time?', 'A box!!', 'Is that fish?', 'Mrow.', '*knocks it over*', 'Butterfly!']
        },
        chonker: {
            name: 'Chonker', icon: '🐈', kind: 'chonker', weapon: 'flop', currency: 'fish', hp: 5, speed: 0.85,
            names: ['Chonkers', 'Lasagna', 'Meatloaf', 'Butterball', 'Sir Purrs-a-Lot', 'Dumpling', 'Big Mac', 'Tubby', 'Absolute Unit'],
            lives: true,
            variants: CAT_COATS,
            quips: ['*FLOMP*', 'Feed me.', 'Not fat. Fluffy.', 'Is it dinner yet?', '*rumbly purr*', 'Too much effort.', 'Lasagna?', '*sits on it*', 'Oh lawd he comin\'.']
        },
        coon: {
            name: 'Maine Coon', icon: '🦁', kind: 'coon', weapon: 'claw', currency: 'fish', hp: 4, speed: 1.05,
            names: ['Moose', 'Sir Floofington', 'Big Tom', 'Bear', 'Tater', 'Chonk', 'Lord Fluffbottom', 'Waffles', 'Duchess'],
            lives: true,
            variants: [
                { name: 'Brown Tabby', pal: { f: '#a87040', F: '#7c4c20', s: '#4c2c10', q: '#a87040', w: '#f0dcc0', p: '#e88898', e: '#d8b000', n: '#d87888', d: '#7c4c20' } },
                { name: 'Red Tabby', pal: { f: '#e88838', F: '#b85818', s: '#a04408', q: '#e88838', w: '#fce8c8', p: '#f878a8', e: '#58b838', n: '#e86878', d: '#c06018' } },
                { name: 'Silver Tabby', pal: { f: '#c8c8d4', F: '#8c8c9c', s: '#4c4c5c', q: '#c8c8d4', w: '#fcfcfc', p: '#f8a8b8', e: '#58d854', n: '#c87888', d: '#8c8c9c' } },
                { name: 'Black Smoke', pal: { f: '#38343c', F: '#58545c', s: '#24202c', q: '#38343c', w: '#a8a4b0', p: '#7c4c6c', e: '#fcc800', n: '#5c3c4c', d: '#24202c' } },
                { name: 'Blue Cream', pal: { f: '#8c94ac', F: '#646c84', s: '#d8b890', q: '#d8b890', w: '#e8e8f0', p: '#d898a8', e: '#d8a000', n: '#a87888', d: '#646c84' } },
                { name: 'Snow White', pal: { f: '#fcfcfc', F: '#d8d8e4', s: '#ececf4', q: '#fcfcfc', w: '#fcfcfc', p: '#f8a8b8', e: '#3cbcfc', n: '#f8a8b8', d: '#d8d8e4' } },
                { name: 'Tortoiseshell', pal: { f: '#5c3418', F: '#3c2010', s: '#e88830', q: '#2c1c14', w: '#e8c8a0', p: '#c87878', e: '#fcb800', n: '#2c1c14', d: '#e88830' } },
                { name: 'Solid Black', pal: { f: '#2a2630', F: '#403a48', s: '#2a2630', q: '#2a2630', w: '#38333f', p: '#4c3c50', e: '#fcc800', n: '#4c3c50', d: '#2a2630' } },
                { name: 'Tuxedo', pal: { f: '#2c2838', F: '#403a48', s: '#2c2838', q: '#2c2838', w: '#fcfcfc', p: '#f878a8', e: '#fcd800', n: '#f878a8', d: '#2c2838' } },
                { name: 'Cow Cat', pal: { f: '#fcfcfc', F: '#d8d8e4', s: '#fcfcfc', o: '#2c2838', q: '#2c2838', w: '#fcfcfc', p: '#f8a8b8', e: '#58b838', n: '#f8a8b8', d: '#2c2838' } }
            ],
            quips: ['Mrrrrp!', '*chirp*', '*trill*', 'I am large.', 'Floof!', '*majestic stare*', 'Snack?', 'Behold my ruff.', '*sheds dramatically*']
        },
        cow: {
            name: 'Holstein Cow', icon: '🐄', kind: 'cow', weapon: 'moo', currency: 'milk', hp: 5, speed: 0.9,
            names: ['Bessie', 'Daisy', 'Moobert', 'Clarabelle', 'Sir Loin', 'Buttercup', 'Moo-riel', 'Milkshake', 'Cowabunga'],
            variants: [
                { name: 'Holstein', pal: { f: '#fcfcfc', F: '#d8d8e4', m: '#f8a8b8', n: '#a85868', e: '#140c1c', h: '#f0e0c0', d: '#3c3434', y: '#fcc800', p: '#f8a8b8', q: '#2c2838', t: '#2c2838' } },
                { name: 'Red Holstein', pal: { f: '#fcfcfc', F: '#d8d8e4', m: '#f8a8b8', n: '#a85868', e: '#140c1c', h: '#f0e0c0', d: '#3c3434', y: '#fcc800', p: '#f8a8b8', q: '#a83c28', t: '#a83c28' } },
                { name: 'Jersey', pal: { f: '#c88850', F: '#a86838', q: '#b07440', m: '#5c4c48', n: '#2c1c1c', e: '#140c1c', h: '#f0e0c0', d: '#3c3434', y: '#fcc800', p: '#e8a8a0', t: '#5c3418' } },
                { name: 'Highland', pal: { f: '#d87830', F: '#b05818', q: '#c86820', m: '#c89878', n: '#7c4c3c', e: '#140c1c', h: '#f8f0d8', d: '#3c3434', y: '#fcc800', p: '#e8a890', t: '#a84c10' } },
                { name: 'Strawberry Milk', pal: { f: '#fcfcfc', F: '#d8d8e4', m: '#f8a8b8', n: '#a85868', e: '#140c1c', h: '#f0e0c0', d: '#3c3434', y: '#fcc800', p: '#f8a8b8', f: '#f8b8c8', F: '#e090a8', q: '#fcfcfc', m: '#f87898', t: '#fcfcfc' } },
                { name: 'Chocolate Milk', pal: { f: '#fcfcfc', F: '#d8d8e4', m: '#f8a8b8', n: '#a85868', e: '#140c1c', h: '#f0e0c0', d: '#3c3434', y: '#fcc800', p: '#f8a8b8', f: '#7c4c2c', F: '#5c3418', q: '#fcf0e0', m: '#e8a8a0', t: '#fcf0e0' } },
                { name: 'Lavender Alpine', pal: { f: '#fcfcfc', F: '#d8d8e4', m: '#f8a8b8', n: '#a85868', e: '#140c1c', h: '#f0e0c0', d: '#3c3434', y: '#fcc800', p: '#f8a8b8', q: '#a878d8', t: '#a878d8' } }
            ],
            quips: ['Moo.', 'MOOO!', '*chews cud*', 'Grass!', 'Udderly fantastic.', 'Holy cow!', 'Moo-velous!', '*bell clonks*']
        },
        dog: {
            name: 'Dog', icon: '🐶', kind: 'dog', weapon: 'bark', currency: 'bone', hp: 4, speed: 1.1,
            names: ['Biscuit', 'Waffles', 'Sir Barksalot', 'Pupper', 'Rex', 'Muffin', 'Scout', 'Bean'],
            variants: [
                { name: 'Golden', pal: { f: '#f8c058', F: '#d0903c', s: '#f8c058', w: '#fce8c0', p: '#f87888', e: '#3c2010', n: '#140c1c', d: '#c8781c' } },
                { name: 'Dalmatian', pal: { f: '#fcfcfc', F: '#d8d8d8', s: '#2c2838', w: '#fcfcfc', p: '#f87888', e: '#2c2838', n: '#140c1c', d: '#2c2838' } },
                { name: 'Chocolate', pal: { f: '#7c4c2c', F: '#5c3418', s: '#7c4c2c', w: '#a87c58', p: '#f87888', e: '#fcc800', n: '#140c1c', d: '#5c3418' } },
                { name: 'Husky', pal: { f: '#888898', F: '#585868', s: '#888898', w: '#fcfcfc', p: '#f87888', e: '#3cbcfc', n: '#140c1c', d: '#3c3c4c' } },
                { name: 'Corgi', pal: { f: '#f89838', F: '#c86818', s: '#f89838', w: '#fcfcfc', p: '#f87888', e: '#3c2010', n: '#140c1c', d: '#f89838' } }
            ],
            quips: ['Woof!', 'Bork!', '*wag wag*', 'Squirrel!', 'Good boy?', 'Arf!', 'Ball??', '*sniff sniff*']
        },
        wizard: {
            name: 'Wizard', icon: '🧙', kind: 'humanoid', head: 'beard', body: 'robe', gear: 'wizardhat',
            weapon: 'starbolt', currency: 'star', hp: 3, speed: 0.92,
            names: ['Merlop', 'Gandolf', 'Bumbledore', 'Wizzle', 'Old Flim', 'Sparkbeard', 'Mumbles'],
            variants: [
                { name: 'Starry Blue', pal: { ...SKIN, c: '#3c58d8', C: '#1c2c88', a: '#fcc800', h: '#e8e8e8', H: '#a8a8b8', x: '#3c58d8', X: '#1c2c88', y: '#fce800', b: '#1c2c88' } },
                { name: 'Emerald', pal: { ...SKIN, c: '#18a058', C: '#0c6034', a: '#fcc800', h: '#e8e8e8', H: '#a8a8b8', x: '#18a058', X: '#0c6034', y: '#fce800', b: '#0c6034' } },
                { name: 'Plum', pal: { ...SKIN2, c: '#8838b8', C: '#541c78', a: '#fcc800', h: '#e8e8e8', H: '#a8a8b8', x: '#8838b8', X: '#541c78', y: '#fce800', b: '#541c78' } },
                { name: 'Ember', pal: { ...SKIN, c: '#c83818', C: '#7c1c08', a: '#fcc800', h: '#e8e8e8', H: '#a8a8b8', x: '#c83818', X: '#7c1c08', y: '#fce800', b: '#7c1c08' } },
                { name: 'Gray Sage', pal: { ...SKIN3, c: '#7c7c8c', C: '#4c4c5c', a: '#3cbcfc', h: '#fcfcfc', H: '#c8c8d8', x: '#7c7c8c', X: '#4c4c5c', y: '#3cbcfc', b: '#4c4c5c' } }
            ],
            quips: ['Abracadabra!', 'By my beard!', 'Kazam!', 'Where are my glasses?', 'Fascinating...', 'Hocus pocus!', 'Back in my day...']
        },
        princess: {
            name: 'Princess', icon: '👑', kind: 'humanoid', head: 'longhair', body: 'robe', gear: 'tiara',
            weapon: 'pan', currency: 'coin', hp: 4, speed: 1.0,
            names: ['Zelderp', 'Peaches', 'Daisy', 'Rosalind', 'Princess Pan', 'Marigold', 'Clementine'],
            variants: [
                { name: 'Rose', pal: { ...SKIN, c: '#f878b8', C: '#c03878', a: '#fcfcfc', h: '#fcd848', H: '#d8a020', y: '#fcc800', r: '#3cbcfc', b: '#c03878' } },
                { name: 'Sky', pal: { ...SKIN2, c: '#78b8f8', C: '#3878c8', a: '#fcfcfc', h: '#503000', H: '#2c1800', y: '#fcc800', r: '#f83878', b: '#3878c8' } },
                { name: 'Mint', pal: { ...SKIN, c: '#58d8a8', C: '#18986c', a: '#fcfcfc', h: '#e85c10', H: '#a83800', y: '#fcc800', r: '#f83878', b: '#18986c' } },
                { name: 'Midnight', pal: { ...SKIN3, c: '#3c2c78', C: '#1c1448', a: '#fcc800', h: '#140c1c', H: '#000000', y: '#fcfcfc', r: '#a838f8', b: '#1c1448' } },
                { name: 'Sunflower', pal: { ...SKIN, c: '#fcc800', C: '#c88800', a: '#fcfcfc', h: '#7c3c10', H: '#501c00', y: '#fcfcfc', r: '#e83030', b: '#c88800' } }
            ],
            quips: ['Hmph!', 'Rescue myself? Fine.', '*BONK*', 'How rude!', 'Tea time?', 'Lovely!', 'Who needs a knight?']
        },
        frog: {
            name: 'Frog Knight', icon: '🐸', kind: 'humanoid', head: 'frog', body: 'tunic',
            weapon: 'tongue', currency: 'bug', hp: 3, speed: 1.0, swim: true,
            names: ['Sir Ribbit', 'Hopscotch', 'Croaky', 'Lily', 'Toadsworth', 'Jumpy'],
            variants: [
                { name: 'Pond Green', pal: { k: '#68c838', K: '#389018', w: '#fcfcfc', e: '#140c1c', m: '#1c4c10', p: '#f89888', c: '#a8a8b8', C: '#686878', a: '#ac7c00', b: '#389018' } },
                { name: 'Poison Blue', pal: { k: '#38a8f8', K: '#1868b8', w: '#fcfcfc', e: '#140c1c', m: '#0c2c58', p: '#fce800', c: '#2c2838', C: '#18141c', a: '#fce800', b: '#1868b8' } },
                { name: 'Tomato', pal: { k: '#f85838', K: '#b82c18', w: '#fcfcfc', e: '#140c1c', m: '#581008', p: '#fce800', c: '#38b838', C: '#187818', a: '#fcc800', b: '#b82c18' } },
                { name: 'Golden Toad', pal: { k: '#f8b818', K: '#c07800', w: '#fcfcfc', e: '#140c1c', m: '#583000', p: '#f87878', c: '#7c4c1c', C: '#503010', a: '#fcfcfc', b: '#c07800' } }
            ],
            quips: ['Ribbit!', 'Croak.', '*slurp*', 'Flies!', 'Hop hop!', 'Lily pads, ahoy!']
        },
        robot: {
            name: 'Robot', icon: '🤖', kind: 'humanoid', head: 'robot', body: 'tunic', gear: 'antenna',
            weapon: 'laser', currency: 'bolt', hp: 4, speed: 0.95,
            names: ['B33P', 'Clank', 'R0-B0', 'Unit 7', 'Sprocket', 'Bolt', 'GIZMO'],
            variants: [
                { name: 'Chrome', pal: { h: '#c8c8d8', H: '#787888', s: '#18282c', e: '#3cfcfc', x: '#585868', k: '#a8a8b8', c: '#a8a8b8', C: '#686878', a: '#fcc800', b: '#585868', r: '#f83838' } },
                { name: 'Retro Red', pal: { h: '#e85838', H: '#a02c18', s: '#18282c', e: '#fce800', x: '#701808', k: '#c8c8c8', c: '#e85838', C: '#a02c18', a: '#c8c8c8', b: '#585868', r: '#3cfcfc' } },
                { name: 'Mint Bot', pal: { h: '#78e8c8', H: '#38a888', s: '#18282c', e: '#f878f8', x: '#287868', k: '#fcfcfc', c: '#78e8c8', C: '#38a888', a: '#fcfcfc', b: '#287868', r: '#f878f8' } },
                { name: 'Brass', pal: { h: '#d8a838', H: '#986c18', s: '#2c1c0c', e: '#fc7800', x: '#684810', k: '#d8a838', c: '#a87830', C: '#684810', a: '#fce800', b: '#503410', r: '#fc7800' } }
            ],
            quips: ['BEEP.', 'BOOP!', 'COMPUTING...', 'HELLO, FRIEND.', 'ERROR: TOO CUTE', 'DOES NOT COMPUTE', '01101000 01101001']
        },
        skeleton: {
            name: 'Skeleton', icon: '💀', kind: 'humanoid', head: 'skull', body: 'tunic',
            weapon: 'bone', currency: 'coin', hp: 3, speed: 1.0,
            names: ['Bonejangles', 'Sir Rattles', 'Skelly', 'Mr. Bones', 'Femur', 'Calcium Carl'],
            variants: [
                { name: 'Classic', pal: { k: '#f0ecd8', K: '#b0a888', E: '#2c2034', e: '#fc4848', c: '#f0ecd8', C: '#b0a888', a: '#2c2034', b: '#f0ecd8' } },
                { name: 'Pirate', pal: { k: '#f0ecd8', K: '#b0a888', E: '#2c2034', e: '#fc4848', c: '#e83030', C: '#a01818', a: '#fcc800', b: '#2c2034' } },
                { name: 'Spooky Purple', pal: { k: '#e0d8f8', K: '#9888c0', E: '#3c1c58', e: '#58fc58', c: '#6c38a8', C: '#3c1c68', a: '#58fc58', b: '#3c1c68' } },
                { name: 'Golden', pal: { k: '#fcd858', K: '#c8a020', E: '#4c2c00', e: '#fcfcfc', c: '#fcd858', C: '#c8a020', a: '#4c2c00', b: '#c8a020' } }
            ],
            quips: ['Rattle rattle!', 'I have a bone to pick.', 'Spooky!', 'Nothing gets under my skin.', 'Calcium!', '*clack clack*']
        },
        bunny: {
            name: 'Bunny', icon: '🐰', kind: 'humanoid', head: 'animal', body: 'tunic', gear: 'bunnyears',
            weapon: 'carrot', currency: 'acorn', hp: 3, speed: 1.2,
            names: ['Clover', 'Thumper', 'Hopsy', 'Buttons', 'Cinnabun', 'Sir Floppington'],
            variants: [
                { name: 'Snowball', pal: { k: '#fcfcfc', K: '#d0d0dc', w: '#fcfcfc', p: '#f898b8', e: '#e83060', c: '#58b8f8', C: '#2878c8', a: '#fcc800', b: '#2878c8' } },
                { name: 'Cocoa', pal: { k: '#a87850', K: '#7c5030', w: '#fce8d0', p: '#f898b8', e: '#140c1c', c: '#38b838', C: '#187818', a: '#fcc800', b: '#7c5030' } },
                { name: 'Lop Gray', pal: { k: '#a8a8b8', K: '#787888', w: '#fcfcfc', p: '#f898b8', e: '#140c1c', c: '#f8a038', C: '#c06818', a: '#fcfcfc', b: '#585868' } },
                { name: 'Pastel', pal: { k: '#f8d8f0', K: '#d8a8d0', w: '#fcfcfc', p: '#f878b8', e: '#5838a8', c: '#a8e8b8', C: '#68b880', a: '#f878b8', b: '#68b880' } }
            ],
            quips: ['Boing!', 'Carrots!', '*nose wiggle*', 'Hop to it!', 'What\'s up?', 'Speedy!']
        },
        ninja: {
            name: 'Fox Ninja', icon: '🦊', kind: 'humanoid', head: 'animal', body: 'tunic', gear: 'foxears',
            weapon: 'shuriken', currency: 'coin', hp: 3, speed: 1.15,
            names: ['Kitsune', 'Shadowtail', 'Ember', 'Swift', 'Mr. Sneaky', 'Rusty'],
            variants: [
                { name: 'Red Fox', pal: { k: '#f87828', K: '#c04c10', w: '#fcfcfc', p: '#140c1c', e: '#140c1c', x: '#e83030', c: '#2c2838', C: '#18141c', a: '#e83030', b: '#18141c' } },
                { name: 'Arctic', pal: { k: '#f0f0fc', K: '#c0c0d8', w: '#fcfcfc', p: '#140c1c', e: '#3c78f8', x: '#3c78f8', c: '#e8e8f8', C: '#a8a8c8', a: '#3c78f8', b: '#a8a8c8' } },
                { name: 'Shadow', pal: { k: '#3c3448', K: '#28202c', w: '#a8a0b8', p: '#140c1c', e: '#fce800', x: '#a838f8', c: '#18141c', C: '#0c080c', a: '#a838f8', b: '#0c080c' } },
                { name: 'Desert Fennec', pal: { k: '#f8d8a0', K: '#d0a868', w: '#fcfcfc', p: '#140c1c', e: '#140c1c', x: '#38b838', c: '#c08848', C: '#885c28', a: '#38b838', b: '#885c28' } }
            ],
            quips: ['*vanishes*', 'Swift as the wind.', 'Hi-yah!', 'You saw nothing.', 'Ninja vanish!', '*backflip*']
        },
        bear: {
            name: 'Bear', icon: '🐻', kind: 'humanoid', head: 'animal', body: 'tunic', gear: 'roundears',
            weapon: 'pan', currency: 'acorn', hp: 5, speed: 0.85,
            names: ['Honeybun', 'Barnaby', 'Sir Snuggles', 'Bruno', 'Teddy', 'Grizzwald'],
            variants: [
                { name: 'Honey Brown', pal: { k: '#a86c38', K: '#7c4c20', w: '#e8c898', p: '#3c2010', e: '#140c1c', c: '#e83030', C: '#a01818', a: '#fcc800', b: '#5c3418' } },
                { name: 'Panda', pal: { k: '#fcfcfc', K: '#d0d0d8', w: '#fcfcfc', p: '#140c1c', e: '#140c1c', c: '#2c2838', C: '#18141c', a: '#38b838', b: '#2c2838' } },
                { name: 'Polar', pal: { k: '#f4f4f8', K: '#c8c8dc', w: '#fcfcfc', p: '#140c1c', e: '#140c1c', c: '#3c78f8', C: '#1c3ca8', a: '#fcfcfc', b: '#1c3ca8' } },
                { name: 'Teddy Pink', pal: { k: '#f8b8c8', K: '#d08098', w: '#fce8f0', p: '#a03858', e: '#140c1c', c: '#78c8f8', C: '#3888c8', a: '#fcfcfc', b: '#3888c8' } }
            ],
            quips: ['Honey?', '*big yawn*', 'Bear hug!', 'Grr... ish.', 'Snack break.', 'Rawr!']
        },
        wombat: {
            name: 'Wombat', icon: '🐾', kind: 'humanoid', head: 'animal', body: 'tunic', gear: 'pointyears',
            weapon: 'bump', currency: 'gem', hp: 5, speed: 0.9,
            names: ['Bumble', 'Sir Digsalot', 'Cubert', 'Wombles', 'Tank', 'Biscuit Bottom', 'Nugget'],
            variants: [
                { name: 'Common', pal: { k: '#8c6c50', K: '#64482c', w: '#b09070', p: '#2c2018', e: '#140c1c', c: '#c8a060', C: '#8c6c30', a: '#5c3418', b: '#5c3418' } },
                { name: 'Hairy-Nosed', pal: { k: '#a89888', K: '#786858', w: '#d8c8b8', p: '#5c4c48', e: '#140c1c', c: '#38b838', C: '#187818', a: '#fcc800', b: '#585868' } },
                { name: 'Golden', pal: { k: '#d8a860', K: '#a87838', w: '#f0d8a8', p: '#3c2010', e: '#140c1c', c: '#e83030', C: '#a01818', a: '#fcc800', b: '#5c3418' } },
                { name: 'Midnight Dig', pal: { k: '#4c4048', K: '#302830', w: '#7c6c70', p: '#140c1c', e: '#fcc800', c: '#3c78f8', C: '#1c3ca8', a: '#fcfcfc', b: '#1c3ca8' } }
            ],
            quips: ['*thud*', 'Dig dig dig.', 'I am a tank.', 'Cubes. Don\'t ask.', '*grumble*', 'Burrow time!', 'Butt of steel!']
        },
        otter: {
            name: 'Otter', icon: '🦦', kind: 'humanoid', head: 'animal', body: 'tunic', gear: 'tinyears',
            weapon: 'pebble', currency: 'fish', hp: 3, speed: 1.1, swim: true,
            names: ['Pebbles', 'Splash', 'Sir Floats-a-Lot', 'Ripple', 'Clamshell', 'Wiggles', 'Otto'],
            variants: [
                { name: 'River Otter', pal: { k: '#7c5030', K: '#583418', w: '#e8d0a8', p: '#2c1c14', e: '#140c1c', c: '#3c78f8', C: '#1c3ca8', a: '#fcc800', b: '#583418' } },
                { name: 'Sea Otter', pal: { k: '#5c4030', K: '#3c2818', w: '#f0e4d0', p: '#2c1c14', e: '#140c1c', c: '#38b8a8', C: '#187868', a: '#fcfcfc', b: '#3c2818' } },
                { name: 'Giant Otter', pal: { k: '#4c3424', K: '#302010', w: '#f0e0b8', p: '#140c1c', e: '#140c1c', c: '#f8a038', C: '#c06818', a: '#fcfcfc', b: '#302010' } }
            ],
            quips: ['*holds hands*', 'Splish!', 'Nice rock.', 'Clam time!', '*floats*', 'Wheee!', 'This is my rock.']
        },
        moose: {
            name: 'Moose', icon: '🫎', kind: 'humanoid', head: 'animal', body: 'tunic', gear: 'antlers',
            weapon: 'bellow', currency: 'acorn', hp: 5, speed: 0.95, swim: true,
            names: ['Bullwinkle', 'Sir Antlerson', 'Maplewood', 'Big Hank', 'Mousse', 'Lady Velvet', 'Gord'],
            variants: [
                { name: 'Bull Moose', pal: { k: '#6c4428', K: '#4c2c18', w: '#8c6040', p: '#2c1810', e: '#140c1c', n: '#e0c890', c: '#c83030', C: '#7c1818', a: '#2c2838', b: '#2c2838' } },
                { name: 'Northern', pal: { k: '#3c2c24', K: '#281c14', w: '#5c4434', p: '#140c1c', e: '#140c1c', n: '#c8b088', c: '#38b838', C: '#187818', a: '#fcc800', b: '#281c14' } },
                { name: 'Spirit Moose', pal: { k: '#f0ece0', K: '#c8c0a8', w: '#fcf8f0', p: '#a89888', e: '#140c1c', n: '#d8c8a0', c: '#3c78f8', C: '#1c3ca8', a: '#fcfcfc', b: '#1c3ca8' } }
            ],
            quips: ['HRRMPH.', 'Sorry, eh?', '*antler clonk*', 'Pond snack!', 'Mind the rack.', 'I am very tall.', 'Moose on the loose!']
        },
        marmot: {
            name: 'Marmot', icon: '🐿️', kind: 'humanoid', head: 'rodent', body: 'tunic', gear: 'tinyears',
            weapon: 'whistle', currency: 'acorn', hp: 3, speed: 1.1,
            names: ['Whistler', 'Chubbs', 'Sir Sunbathe', 'Rocky', 'Pip', 'Marmalade', 'Groundhog Greg'],
            variants: [
                { name: 'Yellow-Bellied', pal: { k: '#a87848', K: '#7c5430', w: '#e8c8a0', p: '#3c2010', e: '#140c1c', t: '#fcfcfc', c: '#fcc800', C: '#c88800', a: '#5c3418', b: '#7c5430' } },
                { name: 'Hoary', pal: { k: '#a8a098', K: '#787068', w: '#fcfcfc', p: '#2c2838', e: '#140c1c', t: '#fcfcfc', c: '#e83030', C: '#a01818', a: '#fcfcfc', b: '#585058' } },
                { name: 'Olympic', pal: { k: '#8c6440', K: '#644428', w: '#d8b890', p: '#2c1810', e: '#140c1c', t: '#fcfcfc', c: '#38b838', C: '#187818', a: '#fcc800', b: '#644428' } }
            ],
            quips: ['EEEEEP!', '*whistles*', 'Sunbathing.', 'Rock nap!', '*chonky stretch*', 'Lookout duty!', 'Who goes there?']
        },
        mushroom: {
            name: 'Mushroom Kid', icon: '🍄', kind: 'humanoid', head: 'kid', body: 'tunic', gear: 'mushroomcap',
            weapon: 'spores', currency: 'acorn', hp: 3, speed: 1.0,
            names: ['Morel', 'Shiitake', 'Button', 'Spore-ty', 'Truffle', 'Chanterelle'],
            variants: [
                { name: 'Toadstool', pal: { ...SKIN, h: '#fce0a8', H: '#d8b078', r: '#e83030', R: '#a01818', c: '#3c78f8', C: '#1c3ca8', a: '#fcfcfc', b: '#5c3418' } },
                { name: 'Blue Cap', pal: { ...SKIN2, h: '#fce0a8', H: '#d8b078', r: '#3cbcfc', R: '#1878c8', c: '#f8a038', C: '#c06818', a: '#fcfcfc', b: '#5c3418', w: '#fcfcfc' } },
                { name: 'Glow Shroom', pal: { ...SKIN, h: '#fce0a8', H: '#d8b078', r: '#a838f8', R: '#6c18b8', w: '#58fcc8', c: '#2c2838', C: '#18141c', a: '#58fcc8', b: '#18141c' } },
                { name: 'Golden Chanterelle', pal: { ...SKIN3, h: '#fce0a8', H: '#d8b078', r: '#fcb818', R: '#c07800', c: '#38b838', C: '#187818', a: '#fcfcfc', b: '#5c3418' } }
            ],
            quips: ['Fungus among us!', 'Spore-tacular!', '*poof*', 'I\'m a fun guy!', 'Grow up? Never.', 'Mushy!']
        },
        astronaut: {
            name: 'Astronaut', icon: '🧑‍🚀', kind: 'humanoid', head: 'helmet', body: 'tunic',
            weapon: 'laser', currency: 'star', hp: 4, speed: 0.95,
            names: ['Cosmo', 'Major Tim', 'Starla', 'Rocket', 'Nova', 'Buzzy'],
            variants: [
                { name: 'NASA White', pal: { ...SKIN, h: '#f0f0f8', H: '#a8a8c0', g: '#78b8f8', l: '#e0f4fc', c: '#f0f0f8', C: '#a8a8c0', a: '#f85838', b: '#a8a8c0', x: '#585868' } },
                { name: 'Sunset Orange', pal: { ...SKIN2, h: '#f88838', H: '#b85818', g: '#78b8f8', l: '#e0f4fc', c: '#f88838', C: '#b85818', a: '#fcfcfc', b: '#585868', x: '#585868' } },
                { name: 'Galaxy', pal: { ...SKIN3, h: '#5838a8', H: '#2c1c68', g: '#f878f8', l: '#fce0fc', c: '#5838a8', C: '#2c1c68', a: '#fce800', b: '#2c1c68', x: '#2c1c68' } }
            ],
            quips: ['One small step...', 'Houston?', 'Zero G!', 'Space is big.', 'To infinity!', 'Moon cheese!']
        },
        pumpkin: {
            name: 'Pumpkin Knight', icon: '🎃', kind: 'humanoid', head: 'pumpkin', body: 'tunic',
            weapon: 'sword', currency: 'candy', hp: 3, speed: 1.0,
            names: ['Jack', 'Gourdon', 'Sir Squash', 'Patch', 'Lantern Larry', 'Spice'],
            variants: [
                { name: 'Jack-o\'-Lantern', pal: { k: '#f88818', K: '#b85808', e: '#fce800', t: '#38a838', c: '#5c3c7c', C: '#3c2454', a: '#38a838', b: '#2c2040' } },
                { name: 'Ghost White', pal: { k: '#f0ece0', K: '#b8b098', e: '#58fc58', t: '#5c3418', c: '#2c2838', C: '#18141c', a: '#58fc58', b: '#18141c' } },
                { name: 'Moonlit Blue', pal: { k: '#5878c8', K: '#344c98', e: '#fcfcfc', t: '#2c5c2c', c: '#2c2838', C: '#18141c', a: '#fce800', b: '#18141c' } }
            ],
            quips: ['Trick or treat!', 'Gourd luck!', 'Boo!', 'Seedy business.', 'Spooky season!', 'Candy!']
        },
        duck: {
            name: 'Duck', icon: '🦆', kind: 'bird', weapon: 'quack', currency: 'bread', hp: 3, speed: 1.0, swim: true,
            names: ['Quackers', 'Sir Waddles', 'Puddles', 'Bill', 'Dabble', 'Captain Quack'],
            variants: [
                { name: 'Duckling', pal: { f: '#fce048', F: '#d8b018', w: '#fcf0a0', b: '#f88818', e: '#140c1c', l: '#f88818' } },
                { name: 'White Duck', pal: { f: '#fcfcfc', F: '#c8c8d8', w: '#fcfcfc', b: '#fca018', e: '#140c1c', l: '#fca018' } },
                { name: 'Mallard', pal: { f: '#2c8848', F: '#185c2c', w: '#a87c58', b: '#fcc800', e: '#140c1c', l: '#f88818' } },
                { name: 'Rubber Ducky', pal: { f: '#fce800', F: '#e0a800', w: '#fce800', b: '#f85818', e: '#3c78f8', l: '#fce800' } }
            ],
            quips: ['Quack!', 'QUACK!', 'Bread?', '*waddle waddle*', 'Splish splash!', 'Honk? No. Quack.']
        },
        penguin: {
            name: 'Penguin', icon: '🐧', kind: 'bird', weapon: 'snowball', currency: 'fish', hp: 3, speed: 0.9, swim: true,
            names: ['Pingu', 'Waddles', 'Tux', 'Sir Slides', 'Flipper', 'Iceberg'],
            variants: [
                { name: 'Emperor', pal: { f: '#2c3448', F: '#18202c', w: '#fcfcfc', b: '#fca018', e: '#140c1c', l: '#fca018' } },
                { name: 'Rockhopper', pal: { f: '#383848', F: '#202028', w: '#fcfcfc', b: '#e83030', e: '#e83030', l: '#f87878' } },
                { name: 'Little Blue', pal: { f: '#3c78c8', F: '#1c4c88', w: '#fcfcfc', b: '#383848', e: '#140c1c', l: '#f87878' } }
            ],
            quips: ['Noot noot!', '*slides*', 'Brrr-illiant!', 'Fish!', 'Chill.', 'Ice to meet you!']
        },
        slime: {
            name: 'Slime', icon: '🟢', kind: 'blob', weapon: 'splat', currency: 'gem', hp: 3, speed: 0.95,
            names: ['Gloop', 'Jellybean', 'Wobbles', 'Sir Squish', 'Blorp', 'Goo-ey'],
            variants: [
                { name: 'Lime', pal: { g: '#68d838', G: '#289818', l: '#d0fca8', w: '#fcfcfc', e: '#140c1c', p: '#f87888' } },
                { name: 'Berry', pal: { g: '#f858a8', G: '#b81868', l: '#fcc8e8', w: '#fcfcfc', e: '#140c1c', p: '#fce800' } },
                { name: 'Ocean', pal: { g: '#3ca8f8', G: '#1868b8', l: '#c8ecfc', w: '#fcfcfc', e: '#140c1c', p: '#f87888' } },
                { name: 'Metal', pal: { g: '#b8b8c8', G: '#686878', l: '#fcfcfc', w: '#fcfcfc', e: '#140c1c', p: '#f87888' } },
                { name: 'Lava', pal: { g: '#f86818', G: '#b82808', l: '#fcd848', w: '#fcfcfc', e: '#140c1c', p: '#fce800' } }
            ],
            quips: ['Blorp!', '*wobble*', 'Squish!', 'Gloop gloop.', 'I\'m a friendly slime!', 'Bounce!']
        }
    };

    // -----------------------------------------------------------------------
    // Hats you can put on any hero. Rows are 10 wide and centred over the
    // template's hat anchor (bottom of the hat sits on the anchor row).
    // -----------------------------------------------------------------------
    const HATS = {
        none: { name: 'None' },
        party: { name: 'Party Hat', pal: { r: '#f83878', b: '#3cbcfc', y: '#fce800' }, rows: [
            '....yy....',
            '....rr....',
            '...rbbr...',
            '...rrrr...',
            '..bbbbbb..',
            '..rrrrrr..'] },
        crown: { name: 'Crown', pal: { y: '#fcc800', Y: '#c08000', r: '#e83030', b: '#3c78f8' }, rows: [
            '.y..yy..y.',
            '.yy.yy.yy.',
            '.yyyyyyyy.',
            '.yryybyry.',
            '.YYYYYYYY.'] },
        tophat: { name: 'Top Hat', pal: { k: '#2c2838', K: '#18141c', r: '#e83030' }, rows: [
            '..kkkkkk..',
            '..kkkkkK..',
            '..kkkkkK..',
            '..rrrrrr..',
            'kkkkkkkkkK'] },
        flower: { name: 'Flower', pal: { p: '#f878b8', y: '#fce800', g: '#38b838' }, rows: [
            '.......pp.',
            '......pyyp',
            '.......pp.',
            '......g...'] },
        propeller: { name: 'Propeller Cap', pal: { y: '#fce800', k: '#2c2838', r: '#e83030', b: '#3c78f8', g: '#38b838' }, rows: [
            '.yyyyyyyy.',
            '....kk....',
            '..rrbbgg..',
            '.rrrbbggg.',
            '.rrrbbggg.'] },
        bow: { name: 'Bow', pal: { p: '#f858a8', P: '#b81868' }, rows: [
            '.pp....pp.',
            '.pppPPppp.',
            '.ppPPPPpp.',
            '..p.PP.p..'] },
        viking: { name: 'Viking Helm', pal: { w: '#f0ecd8', s: '#a8a8b8', S: '#686878', y: '#fcc800' }, rows: [
            'w........w',
            'ww.ssss.ww',
            '.wssssssw.',
            '..ssssSS..',
            '..yyyyyy..'] },
        chef: { name: 'Chef Hat', pal: { w: '#fcfcfc', W: '#c8c8d8' }, rows: [
            '..ww.ww...',
            '.wwwwwwww.',
            '.wwwwwwwW.',
            '..wwwwwW..',
            '..WWWWWW..'] },
        witch: { name: 'Witch Hat', pal: { k: '#3c2c54', K: '#28203c', p: '#a838f8', y: '#fce800' }, rows: [
            '.......kk.',
            '......kkk.',
            '.....kkk..',
            '....kkkk..',
            '...kpppk..',
            'kkkkkkkkkK'] },
        halo: { name: 'Halo', pal: { y: '#fce800', w: '#fcfcd0' }, float: true, rows: [
            '..yywwyy..',
            '.y......y.',
            '..yyyyyy..',
            '..........',
            '..........'] },
        antlers: { name: 'Antlers', pal: { b: '#a86c38', B: '#7c4c20' }, rows: [
            'b.b....b.b',
            'bbb....bbb',
            '.bb....bb.',
            '..B....B..'] },
        santa: { name: 'Santa Hat', pal: { r: '#e83030', R: '#a01818', w: '#fcfcfc' }, rows: [
            '......rrww',
            '.....rrr.w',
            '....rrrR..',
            '...rrrrR..',
            '.wwwwwwww.'] },
        cowboy: { name: 'Cowboy Hat', pal: { b: '#a86c38', B: '#7c4c20', k: '#3c2010' }, rows: [
            '...bbbb...',
            '..bbbbbb..',
            '..kkkkkk..',
            'bbbbbbbbbB',
            '.BB....BB.'] },
        beanie: { name: 'Beanie', pal: { r: '#38b8a8', R: '#18786c', w: '#fcfcfc' }, rows: [
            '....ww....',
            '..rrrrrr..',
            '.rrrrrrrr.',
            '.rRrRrRrR.',
            '.wwwwwwww.'] },
        grad: { name: 'Graduation Cap', pal: { k: '#2c2838', K: '#18141c', y: '#fcc800' }, rows: [
            '..kkkkkk..',
            'kkkkkkkkkk',
            '..KkkkkKy.',
            '..KKKKKKy.',
            '........y.'] },
        pumpkinhat: { name: 'Tiny Pumpkin', pal: { o: '#f88818', O: '#b85808', g: '#38a838' }, rows: [
            '.....g....',
            '...ooooo..',
            '..ooOooOo.',
            '..ooOooOo.',
            '...ooooo..'] },
        frog: { name: 'Frog Friend', pal: { g: '#68c838', G: '#389018', w: '#fcfcfc', e: '#140c1c' }, rows: [
            '..ww..ww..',
            '..we..ew..',
            '..gggggg..',
            '.gggggggg.',
            '.GGGGGGGG.'] }
    };

    // -----------------------------------------------------------------------
    // Companions: 8x8 two-frame sprites that trail the hero
    // -----------------------------------------------------------------------
    const COMPANIONS = {
        none: { name: 'None' },
        fairy: { name: 'Fairy', fly: true, glow: '#f8a8f8', pal: { p: '#f878f8', w: '#fcfcfc', b: '#a8e4fc' }, frames: [[
            'bb..bb..',
            'bwbbwb..',
            '.bppb...',
            '..pp....',
            '..p.....',
            '........',
            '........',
            '........'], [
            '........',
            'bbbbbb..',
            '.bppb...',
            '..pp....',
            '..p.....',
            '........',
            '........',
            '........']] },
        ghost: { name: 'Ghostie', fly: true, pal: { w: '#f0f0fc', W: '#b8b8d8', e: '#140c1c', p: '#f8a8c8' }, frames: [[
            '..www...',
            '.wwwww..',
            'wweweww.',
            'wwwpwww.',
            'wwwwwww.',
            'wwwwwwW.',
            'w.ww.wW.',
            '........'], [
            '..www...',
            '.wwwww..',
            'wweweww.',
            'wwwpwww.',
            'wwwwwww.',
            'wwwwwwW.',
            '.ww.ww..',
            '........']] },
        babyslime: { name: 'Baby Slime', hop: true, pal: { g: '#58d8f8', G: '#1898c8', w: '#fcfcfc', e: '#140c1c' }, frames: [[
            '........',
            '........',
            '...gg...',
            '..gwgg..',
            '.ggegeg.',
            '.gggggg.',
            '..GGGG..',
            '........'], [
            '........',
            '........',
            '........',
            '..gggg..',
            '.gwggggg',
            'gggegegg',
            '.GGGGGG.',
            '........']] },
        bird: { name: 'Songbird', fly: true, pal: { b: '#3c78f8', B: '#1c3ca8', y: '#fcc800', w: '#fcfcfc', e: '#140c1c' }, frames: [[
            '........',
            '..bb....',
            '.bebbyy.',
            'BBbbbb..',
            '..bwwb..',
            '...BB...',
            '........',
            '........'], [
            '........',
            '..bb....',
            '.bebbyy.',
            '.bbbbb..',
            'BBbwwb..',
            '...BB...',
            '........',
            '........']] },
        chick: { name: 'Chick', hop: true, pal: { y: '#fce048', Y: '#d8b018', o: '#f88818', e: '#140c1c' }, frames: [[
            '........',
            '........',
            '...yy...',
            '..yeyo..',
            '..yyyy..',
            '.yyyyyY.',
            '..yyYY..',
            '..o..o..'], [
            '........',
            '........',
            '...yy...',
            '..yeyo..',
            '.yyyyy..',
            'yyyyyyY.',
            '..yyYY..',
            '...oo...']] },
        drone: { name: 'Drone Bot', fly: true, glow: '#58fcfc', pal: { s: '#c8c8d8', S: '#787888', e: '#3cfcfc', k: '#2c2838' }, frames: [[
            'kkk..kkk',
            '...ss...',
            '..ssss..',
            '.sseess.',
            '.ssssss.',
            '..SSSS..',
            '...e....',
            '........'], [
            '.kkkkkk.',
            '...ss...',
            '..ssss..',
            '.sseess.',
            '.ssssss.',
            '..SSSS..',
            '....e...',
            '........']] },
        firefly: { name: 'Firefly', fly: true, glow: '#d8fc58', pal: { k: '#384838', y: '#e8fc58', w: '#c8f0fc' }, frames: [[
            '........',
            '..w.w...',
            '.wwkww..',
            '...k....',
            '...y....',
            '..yyy...',
            '...y....',
            '........'], [
            '........',
            '........',
            '..wkw...',
            '...k....',
            '...y....',
            '..yyy...',
            '...y....',
            '........']] },
        yarn: { name: 'Ball of Yarn', hop: true, pal: { r: '#f85878', R: '#b82848', w: '#fca8c0' }, frames: [[
            '........',
            '..rrrr..',
            '.rwrRrr.',
            '.rRwrRr.',
            '.rrRwrR.',
            '.rrrrRR.',
            '..RRRR.r',
            '.......r'], [
            '........',
            '..rrrr..',
            '.rrRwrr.',
            '.rwrRrR.',
            '.rRwrrR.',
            '.rrrrRR.',
            '..RRRRr.',
            '......r.']] },
        bat: { name: 'Pet Bat', fly: true, pal: { k: '#583878', K: '#38204c', e: '#fce800', p: '#f878a8' }, frames: [[
            'k......k',
            'kk.kk.kk',
            'kkkkkkkk',
            '.kkeekk.',
            '..kppk..',
            '........',
            '........',
            '........'], [
            '........',
            '...kk...',
            '.kkkkkk.',
            'kkkeekkk',
            'k.kppk.k',
            '........',
            '........',
            '........']] },
        star: { name: 'Wishing Star', fly: true, glow: '#fcf878', pal: { y: '#fce800', Y: '#d89800', e: '#140c1c' }, frames: [[
            '...y....',
            '...y....',
            'yyyyyyy.',
            '.yeyey..',
            '..yyy...',
            '.yY.Yy..',
            '.Y...Y..',
            '........'], [
            '........',
            '...y....',
            '.yyyyy..',
            'yyeyeyy.',
            '..yyy...',
            '.yY.Yy..',
            '........',
            '........']] },
        mouse: { name: 'Mouse Pal', hop: true, pal: { g: '#a8a8b8', G: '#787888', p: '#f898b8', e: '#140c1c' }, frames: [[
            '........',
            '........',
            '.pp.....',
            '.gpgg...',
            'egggggg.',
            '.gggggGp',
            '..g..g.p',
            '........'], [
            '........',
            '........',
            '.pp.....',
            '.gpgg...',
            'egggggg.',
            '.gggggG.',
            '..gg.g.p',
            '.......p']] },
        snail: { name: 'Snail', hop: false, slow: true, pal: { s: '#c87838', S: '#884c18', b: '#e8d8a8', e: '#140c1c' }, frames: [[
            '........',
            '........',
            'b.b.....',
            'b.bsss..',
            'bbsSsSs.',
            'bbsssSs.',
            'bbbbbbbb',
            '........'], [
            '........',
            '........',
            '.bb.....',
            '.bbsss..',
            'bbsSsSs.',
            'bbsssSs.',
            'bbbbbbbb',
            '........']] }
    };

    // More friends. Kittens share one map and differ only in coat.
    const KITTEN_FRAMES = [[
        '....d..d',
        '....dffd',
        'd...fefe',
        'f...ffpf',
        '.fffffw.',
        '.sfsffw.',
        '.ffffff.',
        '.f.f..f.'], [
        '....d..d',
        '....dffd',
        '.d..fefe',
        'f...ffpf',
        '.fffffw.',
        '.sfsffw.',
        '.ffffff.',
        '..f.f.f.']];
    const KITTENS = {
        kittenOrange: ['Ginger Kitten', { f: '#f89838', s: '#c05810', w: '#fce8c8', e: '#140c1c', p: '#f878a8', d: '#f89838' }],
        kittenGray: ['Gray Tabby Kitten', { f: '#a8a8b8', s: '#686878', w: '#f0f0f8', e: '#140c1c', p: '#f8a8b8', d: '#a8a8b8' }],
        kittenBlack: ['Black Kitten', { f: '#2c2838', s: '#2c2838', w: '#2c2838', e: '#fce800', p: '#7c4c8c', d: '#2c2838' }],
        kittenCalico: ['Calico Kitten', { f: '#fcf4e8', s: '#f89838', w: '#fcfcfc', e: '#140c1c', p: '#f878a8', d: '#2c2838' }],
        kittenWhite: ['Snowball Kitten', { f: '#fcfcfc', s: '#e0e0ec', w: '#fcfcfc', e: '#3cbcfc', p: '#f8a8b8', d: '#fcfcfc' }],
        kittenSiamese: ['Siamese Kitten', { f: '#fcecd0', s: '#fcecd0', w: '#fcf8f0', e: '#3cbcfc', p: '#5c3c2c', d: '#5c3c2c' }],
        kittenTux: ['Tuxedo Kitten', { f: '#2c2838', s: '#2c2838', w: '#fcfcfc', e: '#fce800', p: '#f878a8', d: '#2c2838' }],
        kittenBuff: ['Buff Tabby Kitten', { f: '#e8b878', s: '#c08440', w: '#fcf0d8', e: '#140c1c', p: '#f8a8a8', d: '#e8b878' }],
        kittenCow: ['Cow Kitten', { f: '#fcfcfc', s: '#2c2838', w: '#fcfcfc', e: '#140c1c', p: '#f8a8b8', d: '#2c2838' }],
        kittenTortie: ['Tortie Kitten', { f: '#5c3418', s: '#e88830', w: '#5c3418', e: '#fcb800', p: '#c87878', d: '#e88830' }]
    };
    for (const [key, [name, pal]] of Object.entries(KITTENS)) COMPANIONS[key] = { name, pal, frames: KITTEN_FRAMES };

    const COON_FRAMES = [[
        '....w..w',
        '....dffd',
        'ss..fefe',
        'sf..ffpf',
        '.ffffwww',
        '.sfsffw.',
        '.ffffff.',
        '.f.f..f.'], [
        '....w..w',
        '....dffd',
        '.s..fefe',
        'ss..ffpf',
        '.ffffwww',
        '.sfsffw.',
        '.ffffff.',
        '..f.f.f.']];
    const COONS = {
        coonKitten: ['Maine Coon Kitten', { f: '#a87040', s: '#4c2c10', w: '#f0dcc0', e: '#140c1c', p: '#e88898', d: '#7c4c20' }],
        coonSilver: ['Silver Coon Kitten', { f: '#c8c8d4', s: '#4c4c5c', w: '#fcfcfc', e: '#140c1c', p: '#f8a8b8', d: '#8c8c9c' }],
        coonRed: ['Red Coon Kitten', { f: '#e88838', s: '#a04408', w: '#fce8c8', e: '#140c1c', p: '#f878a8', d: '#c06018' }],
        coonSmoke: ['Smoke Coon Kitten', { f: '#38343c', s: '#24202c', w: '#a8a4b0', e: '#fcc800', p: '#7c4c6c', d: '#24202c' }],
        coonTux: ['Tuxedo Coon Kitten', { f: '#2c2838', s: '#2c2838', w: '#fcfcfc', e: '#fcd800', p: '#f878a8', d: '#2c2838' }],
        coonCow: ['Cow Coon Kitten', { f: '#fcfcfc', s: '#2c2838', w: '#fcfcfc', e: '#140c1c', p: '#f8a8b8', d: '#2c2838' }],
        coonBlack: ['Black Coon Kitten', { f: '#2a2630', s: '#2a2630', w: '#38333f', e: '#fcc800', p: '#4c3c50', d: '#2a2630' }]
    };
    for (const [key, [name, pal]] of Object.entries(COONS)) COMPANIONS[key] = { name, pal, frames: COON_FRAMES };

    const CALF_FRAMES = [[
        '........',
        '....q...',
        '....qfff',
        't...ffef',
        '.t.fffmm',
        '.fqqffmn',
        '.fqqfff.',
        '.d.d..d.'], [
        '........',
        '....q...',
        '....qfff',
        '.t..ffef',
        '..tfffmm',
        '.fqqffmn',
        '.fqqfff.',
        '..d.d.d.']];
    const CALVES = {
        calf: ['Holstein Calf', { f: '#fcfcfc', q: '#2c2838', e: '#140c1c', m: '#f8a8b8', n: '#a85868', d: '#3c3434', t: '#2c2838' }],
        calfJersey: ['Jersey Calf', { f: '#c88850', q: '#b07440', e: '#140c1c', m: '#5c4c48', n: '#2c1c1c', d: '#3c3434', t: '#5c3418' }],
        calfStrawberry: ['Strawberry Calf', { f: '#f8b8c8', q: '#fcfcfc', e: '#140c1c', m: '#f87898', n: '#a85868', d: '#3c3434', t: '#fcfcfc' }]
    };
    for (const [key, [name, pal]] of Object.entries(CALVES)) COMPANIONS[key] = { name, pal, frames: CALF_FRAMES };

    Object.assign(COMPANIONS, {
        speedy: { name: 'Speedy the Turtle', slow: true, zoom: true, pal: { s: '#58a838', S: '#2c6c18', k: '#a8d878', e: '#140c1c' }, frames: [[
            '........',
            '........',
            '..sss...',
            '.sSsSs..',
            'sSssSske',
            'sssssskk',
            'kk..kk..',
            '........'], [
            '........',
            '........',
            '..sss...',
            '.sSsSs..',
            'sSssSske',
            'sssssskk',
            '.kk..kk.',
            '........']] },
        puppy: { name: 'Puppy', pal: { f: '#f8c058', d: '#c8781c', e: '#140c1c', n: '#140c1c', w: '#fce8c0' }, frames: [[
            '........',
            '....fff.',
            '....dfef',
            'f...dffn',
            '.fffffw.',
            '.ffffff.',
            '.ffffff.',
            '.f.f..f.'], [
            '........',
            '....fff.',
            'f...dfef',
            '....dffn',
            '.fffffw.',
            '.ffffff.',
            '.ffffff.',
            '..f.f.f.']] },
        bunny: { name: 'Bunny', hop: true, pal: { f: '#fcfcfc', e: '#e83060', p: '#f898b8', w: '#e0e0ec' }, frames: [[
            '....f.f.',
            '....f.f.',
            '....fff.',
            '....ffep',
            '.ffffff.',
            'wffffff.',
            '.ffffff.',
            '..f..f..'], [
            '....f.f.',
            '....f.f.',
            '....fff.',
            '....ffep',
            '.ffffff.',
            'wffffff.',
            '.ffffff.',
            '.f..f...']] },
        hedgehog: { name: 'Hedgehog', pal: { b: '#8c5c3c', B: '#5c3418', f: '#e8c898', e: '#140c1c', n: '#140c1c' }, frames: [[
            '........',
            '..b.b...',
            '.bbbbb..',
            'bbBbBbff',
            'bBbbbfef',
            'bbbbfffn',
            '.ffffff.',
            '..f..f..'], [
            '........',
            '...b.b..',
            '.bbbbb..',
            'bbBbBbff',
            'bBbbbfef',
            'bbbbfffn',
            '.ffffff.',
            '.f..f...']] },
        froggy: { name: 'Froggy', hop: true, pal: { g: '#68c838', G: '#389018', w: '#fcfcfc', e: '#140c1c' }, frames: [[
            '........',
            '........',
            '.ww..ww.',
            '.we..ew.',
            '.gggggg.',
            'gGGGGGGg',
            '.gggggg.',
            'gg....gg'], [
            '........',
            '........',
            '.ww..ww.',
            '.we..ew.',
            '.gggggg.',
            'gGGGGGGg',
            '.gggggg.',
            '.gg..gg.']] },
        bee: { name: 'Bumblebee', fly: true, pal: { y: '#fcd800', k: '#2c2838', w: '#d8f4fc', e: '#140c1c' }, frames: [[
            '........',
            '..ww....',
            '.wwww...',
            '.ykyky..',
            'ykykyye.',
            '.ykyky..',
            '........',
            '........'], [
            '........',
            '........',
            '.wwww...',
            '.ykyky..',
            'ykykyye.',
            '.ykyky..',
            '.ww.....',
            '........']] },
        owl: { name: 'Owlet', fly: true, pal: { b: '#a87848', w: '#fcfcfc', e: '#140c1c', y: '#fcc800', c: '#f0d8a8' }, frames: [[
            '.b....b.',
            '.bbbbbb.',
            'bwwbbwwb',
            'bwebbewb',
            'bbbyybbb',
            '.bccccb.',
            '.bccccb.',
            '..y..y..'], [
            '.b....b.',
            '.bbbbbb.',
            'bwwbbwwb',
            'bwwbbwwb',
            'bbbyybbb',
            'bbccccbb',
            '.bccccb.',
            '..y..y..']] },
        axolotl: { name: 'Axolotl', pal: { p: '#f8a8c8', P: '#d878a0', r: '#e83878', e: '#140c1c' }, frames: [[
            '........',
            '...r..r.',
            '..rppppr',
            '...pepep',
            'pppppppp',
            '.pPppPp.',
            '..p..p..',
            '........'], [
            '........',
            '...r..r.',
            '..rppppr',
            '...pepep',
            '.ppppppp',
            'ppPppPp.',
            '.p..p...',
            '........']] },
        dragon: { name: 'Baby Dragon', fly: true, glow: '#fca048', pal: { g: '#58c858', G: '#f8d878', w: '#a8e8a8', e: '#140c1c', y: '#fc7818' }, frames: [[
            '........',
            'w....gg.',
            'ww..gegg',
            'wwgggggy',
            '.gggGgg.',
            'g.gGGg..',
            'g.g..g..',
            '........'], [
            '........',
            '.....gg.',
            'w...gegg',
            'wwgggggy',
            'wgggGgg.',
            'g.gGGg..',
            'g.g..g..',
            '........']] },
        crab: { name: 'Crabby', pal: { r: '#f85838', R: '#b82818', e: '#140c1c' }, frames: [[
            '........',
            'rr....rr',
            'r.e..e.r',
            '.rrrrrr.',
            'rrrrrrrr',
            '.rRRRRr.',
            'r.r..r.r',
            '........'], [
            '........',
            '.r....r.',
            'rre..err',
            '.rrrrrr.',
            'rrrrrrrr',
            '.rRRRRr.',
            '.r.rr.r.',
            '........']] },
        piglet: { name: 'Piglet', pal: { p: '#f8a8b8', P: '#d87888', e: '#140c1c' }, frames: [[
            '........',
            '....p.p.',
            '...pppp.',
            'p..ppePP',
            '.pppppp.',
            '.pppppp.',
            '.pPppPp.',
            '.p.p.p.p'], [
            '........',
            '....p.p.',
            '...pppp.',
            '.p.ppePP',
            '.pppppp.',
            '.pppppp.',
            '.pPppPp.',
            '..p.p.p.']] },
        ladybug: { name: 'Ladybug', fly: true, pal: { r: '#e83030', k: '#140c1c', w: '#d8f4fc' }, frames: [[
            '........',
            '...kk...',
            '..rkkr..',
            '.rrkrkr.',
            '.rkrrrr.',
            '.rrrkrr.',
            '..rkrr..',
            '........'], [
            '........',
            '...kk...',
            'w.rkkr.w',
            'wrrkrkrw',
            '.rkrrrr.',
            '.rrrkrr.',
            '..rkrr..',
            '........']] },
        jelly: { name: 'Jellyfish', fly: true, glow: '#c8a8fc', pal: { b: '#a878f8', w: '#e8d8fc' }, frames: [[
            '..bbbb..',
            '.bbwbbb.',
            'bbwbbbbb',
            'bbbbbbbb',
            'b.b.b.b.',
            '.b.b.b.b',
            'b.b.b.b.',
            '........'], [
            '..bbbb..',
            '.bbwbbb.',
            'bbwbbbbb',
            'bbbbbbbb',
            '.b.b.b.b',
            'b.b.b.b.',
            '.b.b.b.b',
            '........']] },
        wombat: { name: 'Wombat', pal: { f: '#8c6c50', F: '#64482c', e: '#140c1c', n: '#2c2018' }, frames: [[
            '........',
            '........',
            '....f.f.',
            '.ffffffF',
            'ffffffef',
            'ffffffnn',
            '.FFFFFF.',
            '.f.f..f.'], [
            '........',
            '........',
            '....f.f.',
            '.ffffffF',
            'ffffffef',
            'ffffffnn',
            '.FFFFFF.',
            '..f.f.f.']] },
        otter: { name: 'Otter', pal: { f: '#7c5030', w: '#e8d0a8', e: '#140c1c', n: '#2c1c14' }, frames: [[
            '........',
            '........',
            '.....fff',
            '.....fef',
            'f...fwwn',
            '.fffffw.',
            '..fffff.',
            '..f..f..'], [
            '........',
            '........',
            '.....fff',
            '.....fef',
            '....fwwn',
            'ffffffw.',
            '..fffff.',
            '.f..f...']] },
        moose: { name: 'Moose', pal: { f: '#6c4428', a: '#e0c890', e: '#140c1c', n: '#2c1810' }, frames: [[
            '..a.a.a.',
            '..aaaaa.',
            '....fff.',
            '.f..ffef',
            '.ffffffn',
            '.ffffff.',
            '.f.f.f..',
            '.f.f.f..'], [
            '..a.a.a.',
            '..aaaaa.',
            '....fff.',
            '.f..ffef',
            '.ffffffn',
            '.ffffff.',
            '..f.f.f.',
            '.f...f..']] },
        marmot: { name: 'Marmot', hop: true, pal: { f: '#a87848', b: '#e8c8a0', e: '#140c1c', n: '#3c2010' }, frames: [[
            '........',
            '....ff..',
            '...ffef.',
            '...fffn.',
            '..fbbf..',
            '.ffbbff.',
            '.ffbbf..',
            '.ff.ff..'], [
            '........',
            '........',
            '....ff..',
            '...ffef.',
            '...fffnb',
            '..fbbf..',
            '.ffbbff.',
            '.ff.ff..']] },
        // Parades: several friends at once, single file
        coonFamily: { name: 'Maine Coon Family', party: ['coonKitten', 'coonSilver', 'coonRed', 'coonSmoke', 'coonBlack'] },
        herd: { name: 'A Small Herd', party: ['calf', 'calfJersey', 'calf', 'calfStrawberry'] },
        litter: { name: 'Litter of Kittens', party: ['kittenOrange', 'kittenGray', 'kittenCalico', 'kittenBlack'] },
        bigLitter: { name: 'Absolutely Too Many Kittens', party: ['kittenTux', 'kittenWhite', 'kittenSiamese', 'kittenTortie', 'kittenOrange', 'kittenGray', 'kittenBlack'] },
        chickParade: { name: 'Chick Parade', party: ['chick', 'chick', 'chick', 'chick'] },
        speedyCrew: { name: 'Speedy and the Kittens', party: ['kittenOrange', 'kittenWhite', 'speedy'] },
        critterCrew: { name: 'Wombat, Otter, Moose & Marmot', party: ['wombat', 'otter', 'moose', 'marmot'] },
        menagerie: { name:'The Whole Menagerie', party: ['puppy', 'kittenTux', 'bunny', 'piglet', 'hedgehog', 'speedy'] }
    });

    // -----------------------------------------------------------------------
    // Bestiary. 16x16 maps, two frames. `half` maps are mirrored. Behaviours
    // live in the engine; here an enemy is art plus numbers.
    //   ai: wander | shooter | flyer | charger | hopper | chaser | teleporter | sideways
    // -----------------------------------------------------------------------
    const ENEMIES = {
        slime: {
            name: 'Slime', ai: 'hopper', hp: 1, dmg: 1, speed: 26,
            pal: { g: '#58d838', G: '#289818', l: '#d0fca8', e: '#140c1c' },
            half: [[
                '........', '........', '........', '........', '........', '........', '........',
                '......gg', '....gggg', '...glggg', '..glggeg', '..ggggeg', '.ggggggg', '.gGggggg', '..GGGGGG', '........'], [
                '........', '........', '........', '........', '........',
                '......gg', '.....ggg', '....gggg', '...glggg', '...lggge', '...gggge', '..gggggg', '..gGgggg', '..gGgggg', '...GGGGG', '........']]
        },
        redslime: {
            name: 'Grumpy Jelly', ai: 'hopper', hp: 2, dmg: 1, speed: 34,
            pal: { g: '#f85878', G: '#b82848', l: '#fcc8d8', e: '#140c1c' },
            ref: 'slime'
        },
        bat: {
            name: 'Bat', ai: 'flyer', hp: 1, dmg: 1, speed: 48, flying: true,
            pal: { k: '#6c4c9c', K: '#3c2c68', e: '#fce800', w: '#fcfcfc' },
            half: [[
                '........', '........', '........', '........', 'k.......', 'kk......', 'kkk.....', 'kkkk..k.',
                '.kkkk.kk', '..kKkkek', '...KKkkk', '......kw', '........', '........', '........', '........'], [
                '........', '........', '........', '........', '........', '........', '........', '......k.',
                '.....kkk', '...kkkek', '.kkKkkkk', 'kkKK..kw', 'kK......', 'k.......', '........', '........']]
        },
        octo: {
            name: 'Octopop', ai: 'shooter', hp: 1, dmg: 1, speed: 30, shot: 'rock',
            pal: { r: '#f86858', R: '#b82c28', w: '#fcfcfc', e: '#140c1c', y: '#fcd8a8' },
            half: [[
                '........', '........', '.....rrr', '...rrrrr', '..rrwwrr', '..rwwerr', '..rwwerr', '..rrrrrr',
                '..rrrrrr', '..rrrrry', '...rrryy', '..r.rr.y', '.rr.rr..', '.r..r...', '........', '........'], [
                '........', '........', '.....rrr', '...rrrrr', '..rrwwrr', '..rwwerr', '..rwwerr', '..rrrrrr',
                '..rrrrrr', '..rrrrry', '...rrryy', '...r.r.y', '..rr.rr.', '..r..r..', '........', '........']]
        },
        blueocto: {
            name: 'Moody Octopop', ai: 'shooter', hp: 2, dmg: 1, speed: 38, shot: 'rock',
            pal: { r: '#5888f8', R: '#2848b8', w: '#fcfcfc', e: '#140c1c', y: '#c8e0fc' },
            ref: 'octo'
        },
        skeleton: {
            name: 'Skeleton', ai: 'wander', hp: 2, dmg: 1, speed: 34, dodge: true,
            pal: { w: '#f0ecd8', W: '#b0a888', k: '#2c2034', e: '#fc4848' },
            frames: [[
                '................',
                '.....wwwwww.....',
                '....wwwwwwww....',
                '....wkkwwkkw....',
                '....wkewwekw....',
                '.....wwkkww.....',
                '......wWWw......',
                '.......ww.......',
                '...wwwwwwwwww...',
                '..w..wWwwWw..w..',
                '..w..wwwwww..w..',
                '.....wWwwWw.....',
                '......wwww......',
                '.....ww..ww.....',
                '.....w....ww....',
                '................']],
            flipB: true
        },
        ghost: {
            name: 'Boo-ghost', ai: 'chaser', hp: 2, dmg: 1, speed: 20, flying: true, phasing: true,
            pal: { w: '#f0f0fc', W: '#b8b8d8', e: '#140c1c', p: '#f898b8' },
            half: [[
                '........', '.....www', '...wwwww', '..wwwwww', '..wwwwww', '.wwwweew', '.wwwweew', '.wwwwwww',
                '.wwpwwwk', '.wwwwwkk', '.wwwwwww', '.wwwwwww', '.wwwwwww', '.Wwwwwww', '.W.WWw.W', '........'], [
                '........', '.....www', '...wwwww', '..wwwwww', '..wwwwww', '.wwwweew', '.wwwweew', '.wwwwwww',
                '.wwpwwwk', '.wwwwwkk', '.wwwwwww', '.wwwwwww', '.wwwwwww', '.wwwwwww', '..WW.WWw', '........']]
        },
        shroom: {
            name: 'Shroomp', ai: 'wander', hp: 2, dmg: 1, speed: 24,
            pal: { r: '#c83cc8', R: '#882088', w: '#fcfcfc', s: '#fce0b8', S: '#d8b088', e: '#140c1c' },
            frames: [[
                '................',
                '.....rrrrrr.....',
                '...rrwwrrrrrr...',
                '..rrwwrrrrwwrr..',
                '.rrrrrrrrrwwrrr.',
                '.rrwwrrrrrrrrrr.',
                '.RRRRRRRRRRRRRR.',
                '....ssssssss....',
                '....sesssses....',
                '....sesssses....',
                '....ssssssss....',
                '....sSssssSs....',
                '.....SSSSSS.....',
                '....ss....SS....',
                '...sss.....SS...',
                '................']],
            flipB: true
        },
        bee: {
            name: 'Buzzbee', ai: 'flyer', hp: 1, dmg: 1, speed: 56, flying: true,
            pal: { y: '#fcd800', k: '#2c2838', w: '#d8f4fc', e: '#140c1c' },
            frames: [[
                '................',
                '................',
                '.....ww..ww.....',
                '....wwww.wwww...',
                '....wwww.wwww...',
                '.....ww..ww.....',
                '....yyyyyyy.....',
                '...yeyykkyykk...',
                '..yyyyykkyykkk..',
                '..yyyyykkyykkk..',
                '...yyyykkyykk.k.',
                '....yyyyyyy.....',
                '................',
                '................',
                '................',
                '................'], [
                '................',
                '................',
                '................',
                '................',
                '...wwww..wwww...',
                '....wwww.wwww...',
                '....yyyyyyy.....',
                '...yeyykkyykk...',
                '..yyyyykkyykkk..',
                '..yyyyykkyykkk..',
                '...yyyykkyykk.k.',
                '....yyyyyyy.....',
                '................',
                '................',
                '................',
                '................']]
        },
        cactus: {
            name: 'Cactoon', ai: 'hopper', hp: 2, dmg: 1, speed: 30,
            pal: { g: '#58b838', G: '#287818', e: '#140c1c', p: '#f878b8', y: '#fce800' },
            frames: [[
                '................',
                '......p.........',
                '.....ggg........',
                '....ggggg.......',
                '....gegeg.......',
                '.g..ggggg..g....',
                '.gg.gGggg.gg....',
                '.gggggggggg.....',
                '..ggggggGg......',
                '....gggGg.......',
                '....ggggg.......',
                '....gGggg.......',
                '....ggggg.......',
                '...gGgggGg......',
                '...GGGGGGG......',
                '................'].map(r => '..' + r.slice(0, 14))],
            flipB: true
        },
        snowman: {
            name: 'Frosty', ai: 'shooter', hp: 2, dmg: 1, speed: 20, shot: 'snowball',
            pal: { w: '#fcfcfc', W: '#b8d0e8', k: '#2c2838', o: '#f88818', r: '#e83030' },
            half: [[
                '........', '.....kkk', '.....kkk', '....kkkk', '...rrrrr', '.....www', '....wkww', '....wwwo',
                '.....www', '...rrrrr', '...wwwwk', '..wwwwww', '..wwwwwk', '..Wwwwww', '...WWWWW', '........'], [
                '........', '........', '.....kkk', '.....kkk', '....kkkk', '...rrrrr', '.....www', '....wkww',
                '....wwwo', '...rrrrr', '...wwwwk', '..wwwwww', '..wwwwwk', '..Wwwwww', '...WWWWW', '........']]
        },
        gingerbread: {
            name: 'Gingerbread', ai: 'charger', hp: 2, dmg: 1, speed: 36,
            pal: { b: '#c87838', B: '#8c4c18', w: '#fcfcfc', e: '#140c1c', r: '#e83030', g: '#38b838' },
            frames: [[
                '................',
                '......bbbb......',
                '.....bbbbbb.....',
                '.....bebbeb.....',
                '.....bbwwbb.....',
                '......bbbb......',
                '...bbbbbbbbbb...',
                '..bwbbbrbbbbwb..',
                '..bb..bbbb..bb..',
                '......bgbb......',
                '......bbbb......',
                '.....bbbbbb.....',
                '....bbb..bbb....',
                '....bwb...bwb...',
                '....BB.....BB...',
                '................']],
            flipB: true
        },
        crab: {
            name: 'Snippy Crab', ai: 'sideways', hp: 2, dmg: 1, speed: 40,
            pal: { r: '#f85838', R: '#b82818', w: '#fcfcfc', e: '#140c1c' },
            half: [[
                '........', '........', '........', '.rr.....', 'r.rr....', 'rrrr....', '.rr..w..', '..r..e..',
                '..rrrrrr', '.rrrrrrr', 'rrrrrrrr', '.rRRRRRR', '..r..r..', '.r..r...', '........', '........'], [
                '........', '........', '.rr.....', 'r..r....', 'rrrr....', '.rr.....', '..r..w..', '..r..e..',
                '..rrrrrr', '.rrrrrrr', 'rrrrrrrr', '.rRRRRRR', '...r..r.', '..r..r..', '........', '........']]
        },
        boar: {
            name: 'Boarblin', ai: 'shooter', hp: 2, dmg: 1, speed: 28, shot: 'spear',
            pal: { p: '#e88870', P: '#b05840', k: '#5c3418', w: '#fcfcfc', e: '#140c1c', c: '#38a838', C: '#187818' },
            frames: [[
                '................',
                '...pp....pp.....',
                '...ppppppppp....',
                '...pppppppppp...',
                '...pepppppep....',
                '...ppPPPPpp.....',
                '..wpPkPPkPpw....',
                '...ppPPPPpp.....',
                '..cccccccccc....',
                '.pcCccccccCcp...',
                '.p.cccccccc.p...',
                '...kkkkkkkk.....',
                '...cccccccc.....',
                '...pp....pp.....',
                '..kkk....kkk....',
                '................'].map(r => ' ' + r.slice(0, 15)).map(r => r.replace(' ', '.'))],
            flipB: true
        },
        tumbleweed: {
            name: 'Tumbleweed', ai: 'charger', hp: 1, dmg: 1, speed: 44,
            pal: { b: '#c8a058', B: '#8c6c30', k: '#5c4418' },
            frames: [[
                '................',
                '.....bbbbb......',
                '...bb.B.b.bb....',
                '..b.bBkb.B.b....',
                '..bB.b.bBb.bb...',
                '.b.bk.Bb.k.b.b..',
                '.bB.b.k.bB.bkb..',
                '.b.Bb.bBk.b.bB..',
                '.bk.bB.b.bB.b.b.',
                '..b.k.bB.k.Bb.b.',
                '..bb.b.k.b.b.b..',
                '...b.Bb.bB.bb...',
                '....bb.b.bbb....',
                '......bbbb......',
                '................',
                '................']],
            flipB: true
        },
        mage: {
            name: 'Hat Mage', ai: 'teleporter', hp: 2, dmg: 1, speed: 0, shot: 'magic',
            pal: { p: '#8838c8', P: '#541c88', y: '#fce800', e: '#fce800', k: '#140c1c', s: '#fcc89c' },
            half: [[
                '.......p', '......pp', '.....ppp', '....ppyp', '...ppppp', '.ppppppp', '...kkkkk', '...kekke',
                '...kkkkk', '..pppppp', '.ppppppp', '.spppPpp', '..pppPpp', '..ppPPpp', '..PPPPPP', '........'], [
                '.......p', '......pp', '.....ppp', '....ppyp', '...ppppp', '.ppppppp', '...kkkkk', '...kkkkk',
                '...kekke', '..pppppp', '.ppppppp', 'spppppPp', '..pppPpp', '..ppPPpp', '..PPPPPP', '........']]
        },
        dustbunny: {
            name: 'Dust Bunny', ai: 'chaser', hp: 1, dmg: 1, speed: 26,
            pal: { g: '#8c8c9c', G: '#5c5c6c', w: '#fcfcfc', e: '#140c1c' },
            half: [[
                '........', '........', '........', '....g.g.', '...g.ggg', '..gggggg', '.g.ggggg', '..ggwwgg',
                '.gggweeg', '..ggwwgg', '.ggggggg', '..g.gGgG', '...g.G.G', '........', '........', '........'], [
                '........', '........', '........', '...g.g..', '..g.gggg', '.ggggggg', '..g.gggg', '.gggwwgg',
                '..ggweeg', '.gggwwgg', '..gggggg', '.g.gGgGg', '..g.G.G.', '........', '........', '........']]
        },
        sock: {
            name: 'Lost Sock', ai: 'hopper', hp: 1, dmg: 1, speed: 32,
            pal: { r: '#e83030', w: '#fcfcfc', e: '#140c1c', R: '#a01818' },
            frames: [[
                '................',
                '.....wwwww......',
                '.....rrrrr......',
                '.....wwwww......',
                '.....rrrrr......',
                '.....rerer......',
                '.....rrrrr......',
                '.....wwwww......',
                '.....rrrrr......',
                '.....rrrrrr.....',
                '.....rrrrrrrr...',
                '.....rrrrrrrrr..',
                '......rrrrrrrr..',
                '.......RRRRRR...',
                '................',
                '................']],
            flipB: true
        },
        wisp: {
            name: 'Will-o-Wisp', ai: 'flyer', hp: 1, dmg: 1, speed: 40, flying: true, glow: '#58c8fc',
            pal: { b: '#58c8fc', B: '#2878c8', w: '#e8fcfc', e: '#140c1c' },
            half: [[
                '........', '.......b', '......bb', '......bb', '.....bbb', '....bbbw', '...bbwww', '...bwwww',
                '..bbwwew', '..bbwwew', '..bbwwww', '...bbwww', '....bbbb', '.....bbb', '........', '........'], [
                '........', '........', '.......b', '......bb', '.....bbw', '....bbww', '...bbwww', '...bwwww',
                '..bbwwew', '..bbwwew', '..bbwwww', '...bbwww', '....bbbb', '.....bbb', '........', '........']]
        },
        gummy: {
            name: 'Gummy Bear', ai: 'wander', hp: 2, dmg: 1, speed: 28,
            pal: { g: '#f85878', G: '#b82848', l: '#fcb8c8', e: '#140c1c' },
            half: [[
                '........', '...gg...', '..gggg..', '..gggggg', '...ggggg', '...glegg', '...ggggg', '....gggG',
                '..gggggg', '.gglgggg', '.ggggggg', '..gggggg', '...ggggg', '..gggg.G', '..GGG...', '........'], [
                '........', '...gg...', '..gggg..', '..gggggg', '...ggggg', '...glegg', '...ggggg', '....gggG',
                '...ggggg', '.gglgggg', 'gggggggg', '..gggggg', '...ggggg', '...ggg.G', '...GG...', '........']]
        },
        cupcake: {
            name: 'Cupcake Mimic', ai: 'hopper', hp: 2, dmg: 1, speed: 28,
            pal: { p: '#f8a8d0', P: '#d06898', w: '#fcfcfc', r: '#e83030', b: '#c87838', B: '#8c4c18', e: '#140c1c', y: '#fce800', g: '#58d838' },
            half: [[
                '........', '.......r', '......rr', '.....ppp', '....pypp', '...ppppg', '..pppppp', '..pwpppp',
                '..PPPPPP', '..bbbbbb', '..bBbeBb', '...bBbbB', '...bbkkb', '...bBbbB', '....BBBB', '........'], [
                '........', '........', '.......r', '......rr', '.....ppp', '....pypp', '...ppppg', '..pppppp',
                '..pwpppp', '..PPPPPP', '..bbbbbb', '..bBbeBb', '...bBbbB', '...bBbbB', '....BBBB', '........']]
        },
        pumpkinhead: {
            name: 'Pumpkinhead', ai: 'charger', hp: 2, dmg: 1, speed: 30,
            pal: { o: '#f88818', O: '#b85808', y: '#fce800', g: '#38a838', k: '#3c2c54' },
            half: [[
                '........', '.......g', '......gg', '...ooooo', '..ooOooo', '.oOyyooO', '.oOyyooO', '.oOooooO',
                '.oOyoyoO', '..ooyyyy', '...ooooo', '....kkkk', '...kkkkk', '...kk..k', '..kkk...', '........'], [
                '........', '.......g', '......gg', '...ooooo', '..ooOooo', '.oOyyooO', '.oOyyooO', '.oOooooO',
                '.oOyoyoO', '..ooyyyy', '...ooooo', '....kkkk', '...kkkkk', '....kk.k', '...kkk..', '........']]
        },
        bovine: {
            name: 'Bovine', ai: 'charger', hp: 2, dmg: 1, speed: 30,
            pal: { w: '#fcfcfc', k: '#2c2838', p: '#f8a8b8', n: '#a85868', h: '#f0e0c0', e: '#e83030', y: '#fcc800', d: '#3c3434' },
            half: [[
                '........', '...h....', '...hwwww', '.kkwwwkk', '..kwekkk', '...wwwww', '...ppppp', '...pnppp',
                '....pppp', '..kkwwww', '.wkkwwww', '.wwwwkkw', '.wwwwkkk', '..wwwwwy', '..kw..kw', '..dd..dd'], [
                '........', '...h....', '...hwwww', '.kkwwwkk', '..kwekkk', '...wwwww', '...ppppp', '...pnppp',
                '....pppp', '..kkwwww', '.wkkwwww', '.wwwwkkw', '.wwwwkkk', '..wwwwwy', '...kw.kw', '...dd.dd']]
        },
        rubberduck: {
            name: 'Rubber Duck', ai: 'wander', hp: 1, dmg: 1, speed: 30, swims: true,
            pal: { y: '#fce800', Y: '#d8a000', o: '#fc7400', e: '#140c1c', w: '#fcfcfc' },
            frames: [[
                '................',
                '................',
                '......yyyy......',
                '.....yyyyyy.....',
                '.....yywyeyoo...',
                '.....yyyyyyooo..',
                '......yyyy......',
                '..y...yyyy......',
                '..yyyyyyyyyyy...',
                '..yyyyyyyyyyyy..',
                '..yyyyyyyyyyyy..',
                '..YyyyyyyyyyyY..',
                '...YYYYYYYYYY...',
                '................',
                '................',
                '................']],
            flipB: true
        },
        penguin: {
            name: 'Grumpy Penguin', ai: 'charger', hp: 2, dmg: 1, speed: 34,
            pal: { k: '#2c3448', w: '#fcfcfc', o: '#fca018', e: '#140c1c', r: '#e83030' },
            half: [[
                '........', '.....kkk', '....kkkk', '...kkkkk', '...kkewk', '...kkkoo', '...kkwww', '..kkwwww',
                '.kkkwwww', '.k.kwwww', '...kwwww', '...kwwww', '....kwww', '....oo..', '...ooo..', '........'], [
                '........', '.....kkk', '....kkkk', '...kkkkk', '...kkewk', '...kkkoo', '...kkwww', '..kkwwww',
                '..kkwwww', '.kkkwwww', '.k.kwwww', '...kwwww', '....kwww', '.....oo.', '....ooo.', '........']]
        },
        acorn: {
            name: 'Acorn Knight', ai: 'wander', hp: 2, dmg: 1, speed: 26, shield: true,
            pal: { a: '#e8bc78', A: '#a06828', c: '#6c3c14', C: '#3c2008', l: '#58a828', e: '#140c1c' },
            frames: [[
                '................', '.....cccccc.....', '....cccccccc....', '....cCcccCcc....',
                '.....cccccc.....', '....aaaaaaa.l...', '...aaaaaaaaall..', '...aaeaaeaa.lll.',
                '...aaaaaaaa.llll', '...aaaaaaaa.llll', '...aAaaaaAa.lll.', '...aaaaaaaa.ll..',
                '....aaaaaa..l...', '.....a..a.......', '.....a..a.......', '................'], [
                '................', '.....cccccc.....', '....cccccccc....', '....cCcccCcc....',
                '.....cccccc.....', '....aaaaaaa.l...', '...aaaaaaaaall..', '...aaeaaeaa.lll.',
                '...aaaaaaaa.llll', '...aaaaaaaa.llll', '...aAaaaaAa.lll.', '...aaaaaaaa.ll..',
                '....aaaaaa..l...', '....a....a......', '....a....a......', '................']]
        },
        sporepuff: {
            name: 'Spore Puff', ai: 'hopper', hp: 2, dmg: 1, speed: 24, splits: 'sporelet',
            pal: { p: '#e8d8f8', P: '#b8a8d8', s: '#a868d8', e: '#140c1c' },
            half: [[
                '........', '........', '.....ppp', '...ppppp', '..pppppp', '..pspppp', '.ppppppp', '.peppppp',
                '.ppppppp', '.ppspppp', '.ppppppp', '..pppppp', '..PPPPPP', '...PPPP.', '....p...', '........'], [
                '........', '........', '........', '.....ppp', '...ppppp', '..pppppp', '..pspppp', '.ppppppp',
                '.peppppp', '.ppppppp', '.ppspppp', '..pppppp', '..PPPPPP', '...PPPP.', '...p.p..', '........']]
        },
        sporelet: {
            name: 'Sporelet', ai: 'chaser', hp: 1, dmg: 1, speed: 30,
            pal: { p: '#e8d8f8', P: '#b8a8d8', s: '#a868d8', e: '#140c1c' },
            half: [[
                '........', '........', '........', '........', '........', '........', '......pp', '....pppp',
                '...ppppp', '...peppp', '...ppppp', '...ppPpp', '....PPPP', '.....p..', '........', '........'], [
                '........', '........', '........', '........', '........', '........', '........', '......pp',
                '....pppp', '...ppppp', '...peppp', '...ppppp', '...ppPpp', '....PPPP', '....p.p.', '........']]
        },
        goose: {
            name: 'Angry Goose', ai: 'stalker', hp: 2, dmg: 1, speed: 38,
            pal: { w: '#fcfcfc', W: '#d0d0d8', o: '#f88818', e: '#140c1c' },
            frames: [[
                '................', '..........www...', '.........wwwww..', '.........wwewwoo',
                '.........wwwwwoo', '..........wwww..', '..........ww....', '.......wwwww....',
                '....wwwwwwwww...', '...wwwwwwwwwww..', '..Wwwwwwwwwwww..', '..WWwwwwwwwwW...',
                '...WWWWWWWW.....', '.....o..o.......', '.....o..o.......', '................'], [
                '................', '................', '..........www...', '.........wwwww..',
                '.........wwewwoo', '.........wwwwwoo', '..........wwww..', '.......wwwww....',
                '....wwwwwwwww...', '...wwwwwwwwwww..', '..Wwwwwwwwwwww..', '..WWwwwwwwwwW...',
                '...WWWWWWWW.....', '....o.....o.....', '....o.....o.....', '................']]
        },
        prickle: {
            name: 'Pricklepuff', ai: 'rebound', hp: 2, dmg: 1, speed: 46,
            pal: { k: '#5c5c6c', K: '#36363f', s: '#e8e8f8', e: '#140c1c' },
            half: [[
                '........', '......ss', '......ss', '...skkkk', '..sskkkk', '....kkkk', 'sskkkkkk', 'sskkkkkk',
                '.kkkkkkk', '....kkkk', '..ssKKKK', '...sKKKK', '.....KKK', '......ss', '......ss', '........'], [
                '........', '.....ss.', '.....ss.', '..sskkkk', '...skkkk', '....kkkk', 'sskkkkkk', 'sskkkkkk',
                '.kkkkkkk', '....kkkk', '...sKKKK', '..ssKKKK', '.....KKK', '.....ss.', '.....ss.', '........']]
        },
        mender: {
            name: 'Mender Shroom', ai: 'mender', hp: 3, dmg: 1, speed: 22,
            pal: { c: '#f85878', C: '#b82848', m: '#f8f0e0', M: '#c8c0b0', w: '#fcfcfc', e: '#140c1c' },
            half: [[
                '........', '........', '.....ccc', '...ccccc', '..cccccc', '..cccccw', '.ccccwww', '.ccccccw',
                '.CCCCCCC', '...mmmmm', '...mmemm', '...mmmmm', '...mmmmm', '...MMMMM', '........', '........'], [
                '........', '.....ccc', '...ccccc', '..cccccc', '..cccccw', '.ccccwww', '.ccccccw', '.CCCCCCC',
                '...mmmmm', '...mmemm', '...mmmmm', '...mmmmm', '...MMMMM', '........', '........', '........']]
        },
        sandshark: {
            name: 'Sand Shark', ai: 'burrower', hp: 3, dmg: 1, speed: 44,
            pal: { b: '#88a8c8', B: '#50708c', w: '#fcfcfc', e: '#140c1c' },
            frames: [[
                '................', '................', '................', '........b.......',
                '.......bbb......', '.b.....bbbb.....', '.bb...bbbbbbb...', '.bbb.bbbbbbbbbb.',
                'bbbbbbbbbbbbbbbb', 'bbbbbbbbebbbbwbw', '.bbbbbbbbbbbwbwb', '.bbb.BBBBBBBBBB.',
                '.bb...BBBBBBB...', '.b.....BBB......', '................', '................'], [
                '................', '................', '................', '........b.......',
                '.......bbb......', '.......bbbb.....', '.b....bbbbbbb...', '.bb..bbbbbbbbbb.',
                'bbbbbbbbbbbbbbbb', 'bbbbbbbbebbbbwbw', '.bbbbbbbbbbbwbwb', '.bb..BBBBBBBBBB.',
                '.b....BBBBBBB...', '.......BBB......', '................', '................']]
        },
        eyeball: {
            name: 'Peeper', ai: 'shooter', hp: 2, dmg: 1, speed: 22, shot: 'tear', flying: true,
            pal: { w: '#fcfcfc', W: '#c8c8d8', r: '#e83030', b: '#3c78f8', k: '#140c1c', p: '#a838a8' },
            half: [[
                '........', '........', '....pppp', '...pwwww', '..pwwwww', '.pwwwwbb', '.pwwwbbk', '.pwwwbkk',
                '.pwwwbkk', '.pwrwwbb', '..pwwrww', '...pwwww', '....pppp', '...p.p..', '..p...p.', '........'], [
                '........', '........', '....pppp', '...pwwww', '..pwwwww', '.pwwwwbb', '.pwwwbbk', '.pwwwbkk',
                '.pwwwbkk', '.pwrwwbb', '..pwwrww', '...pwwww', '....pppp', '....p.p.', '...p...p', '........']]
        }
    };

    // -----------------------------------------------------------------------
    // Bosses: 32x32, painted with shape primitives rather than maps
    // -----------------------------------------------------------------------
    // Boss stats are tuned against the autopilot playing each fight cold, with
    // a sword, a shield and full hearts, and no earlier death to have worn the
    // boss down. The aim is a first attempt won somewhere between one in four
    // and one in two; a charger covers ground at three times the speed below,
    // against a hero who walks at 62.
    const BOSSES = {
        kingslime: { name: 'King Slime', hp: 9, speed: 30, ai: 'bouncer', minion: 'slime', title: 'Lord of the Goo' },
        dragon: { name: 'Sir Snoots', hp: 10, speed: 22, ai: 'dragon', title: 'A Dragon of Moderate Size' },
        gazer: { name: 'The Gazer', hp: 9, speed: 26, ai: 'gazer', title: 'It Sees You' },
        mechamouse: { name: 'Mecha-Mouse', hp: 9, speed: 44, ai: 'charger', title: 'Squeak of Doom' },
        grandghost: { name: 'Grand Ghost', hp: 8, speed: 22, ai: 'phantom', minion: 'bat', title: 'Boo, But Bigger' },
        pumpkinking: { name: 'Pumpkin King', hp: 10, speed: 26, ai: 'bouncer', minion: 'pumpkinhead', title: 'Gourd of the Underworld' },
        cowking: { name: 'The Cow King', hp: 11, speed: 32, ai: 'charger', minion: 'bovine', shot: 'milk', title: 'There Is No Cow King' },
        sockgoblin: { name: 'Sock Goblin', hp: 9, speed: 34, ai: 'charger', minion: 'sock', shot: 'sock', title: 'Thief of Single Socks' },
        // Tucks in and ricochets about, untouchable, then has to come up for
        // air: the whole fight is waiting for the head to come out
        tortoise: { name: 'Tortuga', hp: 8, speed: 26, ai: 'shell', title: 'Hard To Get Through To' },
        // `ambush` holds back the usual name card, so it is a chest until it
        // very much is not
        lootbox: { name: 'Lord Lootbox', hp: 7, speed: 30, ai: 'mimic', minion: 'sock', ambush: true, title: 'Not What It Seems' },
        treant: { name: 'The Thornwood', hp: 13, speed: 0, ai: 'treant', minion: 'acorn', title: 'Older Than Your Quest' }
    };

    function paintBoss(kind, frame) {
        const g = new PixelGrid(32, 32);
        const f = frame;
        switch (kind) {
            case 'tortoise': {
                const tuck = f === 1;
                g.ellipse(16, 18, 13, 11, '#2c5c2c');                      // shell rim
                g.ellipse(16, 18, 11, 9, '#58a84c');                       // dome
                for (const [px, py] of [[16, 11], [10, 16], [22, 16], [16, 20], [11, 24], [21, 24]])
                    g.ellipse(px, py, 3, 2, '#2c5c2c');                    // plates
                g.ellipse(16, 15, 3, 2, '#a8d878');                        // highlight
                g.ellipse(16, 26, 13, 3, '#1c3c1c');
                if (tuck) {
                    // Pulled in and spinning: speed lines where the legs were
                    for (let i = 0; i < 3; i++) {
                        g.line(0, 12 + i * 5, 5, 12 + i * 5, '#d8d8e8');
                        g.line(27, 14 + i * 5, 32, 14 + i * 5, '#d8d8e8');
                    }
                } else {
                    g.ellipse(26, 18, 6, 5, '#88d864');                    // head, right out
                    g.rect(29, 16, 3, 5, '#88d864');
                    g.rect(27, 15, 3, 3, '#fcfcfc');
                    g.rect(28, 16, 2, 2, '#140c1c');                       // eye
                    g.rect(30, 20, 2, 1, '#48883c');                       // beak line
                    g.rect(3, 23, 7, 6, '#88d864');                        // feet
                    g.rect(22, 23, 7, 6, '#88d864');
                    g.rect(3, 27, 7, 2, '#48883c');
                    g.rect(22, 27, 7, 2, '#48883c');
                    g.rect(0, 16, 6, 4, '#88d864');                        // tail
                }
                break;
            }
            case 'lootbox': {
                const open = f === 1;
                g.rect(4, 15, 24, 14, '#6c4420');                          // body
                g.rect(6, 17, 20, 10, '#b07c3c');
                g.rect(4, 26, 24, 3, '#5c3818');
                g.rect(9, 15, 3, 14, '#d8b038');                           // bands
                g.rect(20, 15, 3, 14, '#d8b038');
                if (open) {
                    g.rect(4, 2, 24, 7, '#6c4420');                        // lid, flung back
                    g.rect(6, 3, 20, 5, '#b07c3c');
                    g.rect(9, 2, 3, 7, '#d8b038'); g.rect(20, 2, 3, 7, '#d8b038');
                    g.rect(5, 9, 22, 6, '#140c1c');                        // the dark inside
                    g.rect(9, 10, 3, 2, '#fce800'); g.rect(20, 10, 3, 2, '#fce800');   // eyes
                    for (let i = 0; i < 6; i++) {                          // teeth
                        g.rect(5 + i * 4, 9, 2, 3, '#fcfcfc');
                        g.rect(7 + i * 4, 13, 2, 3, '#fcfcfc');
                    }
                    g.rect(13, 15, 6, 3, '#e05068');                       // tongue
                } else {
                    g.rect(4, 9, 24, 7, '#6c4420');
                    g.rect(6, 10, 20, 5, '#b07c3c');
                    g.rect(9, 9, 3, 7, '#d8b038'); g.rect(20, 9, 3, 7, '#d8b038');
                    g.rect(14, 16, 5, 6, '#d8b038');                       // lock plate
                    g.rect(16, 18, 2, 3, '#140c1c');
                }
                break;
            }
            case 'treant': {
                const sway = f ? 1 : 0;
                g.ellipse(16, 8, 14, 7, '#2c7818');                        // canopy
                g.ellipse(16, 7, 11, 5, '#48a028');
                g.ellipse(8 - sway, 10, 5, 3, '#2c7818');
                g.ellipse(24 + sway, 10, 5, 3, '#2c7818');
                g.ellipse(13, 5, 3, 2, '#78c848');
                g.line(11, 16, 3 - sway, 12 + sway, '#6c4420');            // arms
                g.line(11, 17, 4 - sway, 14 + sway, '#6c4420');
                g.line(20, 16, 28 + sway, 12 + sway, '#6c4420');
                g.line(20, 17, 27 + sway, 14 + sway, '#6c4420');
                g.rect(11, 12, 10, 17, '#6c4420');                         // trunk
                g.rect(13, 13, 6, 15, '#8c5c2c');
                g.rect(12, 17, 3, 3, '#140c1c');                           // knothole eyes
                g.rect(17, 17, 3, 3, '#140c1c');
                g.set(13, 18, '#fce800'); g.set(18, 18, '#fce800');
                g.rect(13, 22, 6, 2, '#140c1c');                           // mouth
                g.set(14, 24, '#140c1c'); g.set(17, 24, '#140c1c');
                g.line(11, 28, 5, 31, '#6c4420');                          // roots
                g.line(20, 28, 26, 31, '#6c4420');
                g.rect(7, 29, 18, 3, '#5c3818');
                break;
            }
            case 'kingslime': {
                const sq = f ? 1 : 0;
                g.ellipse(16, 21 + sq, 14 + sq, 10 - sq, '#58d838');
                g.ellipse(16, 24 + sq, 13 + sq, 6 - sq, '#40b828');
                g.ellipse(10, 16 + sq, 3, 2, '#d0fca8');
                g.rect(10, 18 + sq, 3, 4, '#140c1c'); g.rect(19, 18 + sq, 3, 4, '#140c1c');
                g.set(10, 18 + sq, '#fcfcfc'); g.set(19, 18 + sq, '#fcfcfc');
                g.rect(13, 25 + sq, 6, 1, '#1c5c10');
                // crown
                const cy = 6 + sq * 2;
                g.rect(9, cy + 4, 14, 4, '#fcc800');
                for (const x of [9, 14, 19]) g.rect(x, cy, 4, 4, '#fcc800');
                g.rect(10, cy + 5, 2, 2, '#e83030'); g.rect(15, cy + 5, 2, 2, '#3c78f8'); g.rect(20, cy + 5, 2, 2, '#e83030');
                break;
            }
            case 'dragon': {
                const b = f ? 1 : 0;
                g.ellipse(14, 20, 10, 8, '#38a858');                     // body
                g.ellipse(14, 23, 7, 4, '#f8d878');                      // belly
                for (let i = 0; i < 4; i++) g.rect(6 + i * 4, 11 - (i % 2), 2, 3, '#f8d878'); // spikes
                g.ellipse(25, 12 - b, 6, 5, '#38a858');                  // head
                g.rect(27, 14 - b, 5, 3, '#38a858');                      // snout
                g.set(30, 14 - b, '#140c1c');                             // nostril
                g.rect(24, 10 - b, 2, 2, '#fcfcfc'); g.set(25, 11 - b, '#140c1c');
                g.rect(22, 5 - b, 2, 3, '#f8d878'); g.rect(26, 5 - b, 2, 3, '#f8d878'); // horns
                // wing
                const wy = f ? 2 : 0;
                g.line(10, 13, 2, 4 + wy, '#287838'); g.line(10, 13, 8, 2 + wy, '#287838');
                g.line(2, 4 + wy, 8, 2 + wy, '#287838');
                for (let y = 4; y < 12; y++) g.line(10, 13, 3 + (y - 4) * 0.6, y + wy, '#58c878');
                // legs and tail
                g.rect(7, 26, 4, 4, '#287838'); g.rect(17, 26, 4, 4, '#287838');
                g.line(4, 22, 0, 26 + b, '#38a858'); g.line(4, 23, 1, 27 + b, '#38a858');
                break;
            }
            case 'gazer': {
                g.ellipse(16, 15, 12, 12, '#a838a8');
                g.ellipse(16, 15, 9, 9, '#fcfcfc');
                const px = f ? 1 : -1;
                g.ellipse(16 + px * 2, 15, 5, 5, '#e83030');
                g.ellipse(16 + px * 2, 15, 2.5, 2.5, '#140c1c');
                g.set(14 + px * 2, 13, '#fcfcfc');
                for (let i = 0; i < 5; i++) {
                    const x = 6 + i * 5;
                    const off = ((i + f) % 2) * 2;
                    g.line(x, 25, x - 1 + off, 30, '#7c1c7c'); g.line(x + 1, 25, x + off, 30, '#a838a8');
                }
                break;
            }
            case 'mechamouse': {
                g.ellipse(15, 20, 12, 8, '#a8a8b8');
                g.ellipse(15, 22, 10, 5, '#888898');
                g.ellipse(7, 9, 5, 5, '#a8a8b8'); g.ellipse(7, 9, 3, 3, '#f898b8');
                g.ellipse(21, 9, 5, 5, '#a8a8b8'); g.ellipse(21, 9, 3, 3, '#f898b8');
                g.ellipse(15, 15, 8, 6, '#c8c8d8');
                g.rect(11, 13, 2, 2, '#e83030'); g.rect(18, 13, 2, 2, '#e83030');
                g.rect(14, 18, 3, 2, '#140c1c');
                g.line(3, 17, 9, 18, '#585868'); g.line(21, 18, 28, 17, '#585868');
                // wind-up key
                g.rect(27, 18, 4, 2, '#fcc800'); g.rect(29, 15 + f, 2, 8 - f * 2, '#fcc800');
                // wheels
                for (const x of [7, 22]) { g.ellipse(x, 28, 3, 3, '#2c2838'); g.set(x, 28 - (f ? 1 : -1), '#888898'); }
                break;
            }
            case 'grandghost': {
                g.ellipse(16, 14, 13, 12, '#f0f0fc');
                g.rect(3, 14, 26, 12, '#f0f0fc');
                for (let i = 0; i < 6; i++) {
                    const x = 3 + i * 5 - (f ? 2 : 0);
                    g.ellipse(x + 2, 27, 2.5, 3, (i % 2) ? '#f0f0fc' : '#d8d8f0');
                }
                g.ellipse(11, 12, 3, 4, '#140c1c'); g.ellipse(21, 12, 3, 4, '#140c1c');
                g.set(10, 10, '#fcfcfc'); g.set(20, 10, '#fcfcfc');
                g.ellipse(16, 20, 4, f ? 3 : 2, '#140c1c');
                g.ellipse(7, 17, 2, 1, '#f8a8c8'); g.ellipse(25, 17, 2, 1, '#f8a8c8');
                break;
            }
            case 'pumpkinking': {
                const sq = f ? 1 : 0;
                g.ellipse(16, 20 + sq, 14, 10 - sq, '#f88818');
                for (const x of [8, 16, 24]) g.rect(x, 11 + sq, 1, 18 - sq * 2, '#c86008');
                g.rect(15, 6 + sq, 3, 5, '#38a838');
                // crown
                g.rect(9, 4 + sq, 14, 3, '#fcc800');
                for (const x of [9, 15, 21]) g.rect(x, 1 + sq, 2, 3, '#fcc800');
                // face
                for (let i = 0; i < 3; i++) { g.rect(9 + i, 16 - i + sq, 4 - i, 1, '#fce800'); g.rect(20 + i, 16 - i + sq, 4 - i, 1, '#fce800'); }
                g.rect(8, 23 + sq, 16, 3, '#fce800');
                for (const x of [10, 14, 18, 22]) g.rect(x, 23 + sq, 1, 1, '#f88818');
                break;
            }
            case 'cowking': {
                const b = f ? 1 : 0;
                g.line(3, 19, 0, 25, '#fcfcfc'); g.rect(0, 25, 2, 2, '#2c2838');
                g.ellipse(13, 21, 12, 8, '#fcfcfc');
                g.ellipse(8, 18, 4, 3, '#2c2838'); g.ellipse(17, 25, 3.5, 2, '#2c2838'); g.ellipse(4, 23, 2, 2, '#2c2838');
                for (const x of [5, 11, 16, 21]) g.rect(x, 27, 3, 4, (x === 11 || x === 21) && f ? '#5c5454' : '#3c3434');
                g.ellipse(23, 13 - b, 7, 6, '#fcfcfc');
                g.ellipse(21, 10 - b, 3, 2.5, '#2c2838');
                g.line(17, 9 - b, 15, 5 - b, '#f0e0c0'); g.line(29, 9 - b, 31, 5 - b, '#f0e0c0');
                g.rect(16, 11 - b, 3, 2, '#2c2838'); g.rect(28, 11 - b, 3, 2, '#2c2838');
                g.rect(20, 12 - b, 2, 2, '#e83030'); g.rect(25, 12 - b, 2, 2, '#e83030');
                g.ellipse(24, 17 - b, 5.5, 3.5, '#f8a8b8');
                g.set(22, 17 - b, '#a85868'); g.set(26, 17 - b, '#a85868');
                g.rect(19, 4 - b, 9, 3, '#fcc800');
                for (const x of [19, 23, 27]) g.rect(x, 2 - b, 1, 2, '#fcc800');
                g.set(23, 5 - b, '#e83030');
                g.rect(17, 22 - b, 4, 3, '#fcc800'); g.set(18, 25 - b, '#5c3418');
                break;
            }
            case 'sockgoblin': {
                const b = f ? 1 : 0;
                g.ellipse(16, 20, 10, 9, '#68a838');
                g.ellipse(16, 11 - b, 9, 7, '#68a838');
                g.line(6, 8 - b, 1, 3 - b, '#68a838'); g.line(6, 9 - b, 2, 5 - b, '#68a838');
                g.line(26, 8 - b, 31, 3 - b, '#68a838'); g.line(26, 9 - b, 30, 5 - b, '#68a838');
                g.rect(11, 9 - b, 3, 3, '#fce800'); g.rect(19, 9 - b, 3, 3, '#fce800');
                g.set(12, 10 - b, '#140c1c'); g.set(20, 10 - b, '#140c1c');
                g.rect(12, 14 - b, 8, 2, '#140c1c'); g.set(13, 14 - b, '#fcfcfc'); g.set(18, 14 - b, '#fcfcfc');
                // sack of socks
                g.ellipse(27, 21 + b, 5, 6, '#a87c48');
                g.rect(24, 15 + b, 2, 3, '#e83030'); g.rect(28, 14 + b, 2, 4, '#3c78f8'); g.rect(26, 13 + b, 1, 3, '#fcfcfc');
                g.rect(10, 27, 4, 4, '#3c5c18'); g.rect(18, 27, 4, 4, '#3c5c18');
                break;
            }
        }
        g.outline(OUTLINE);
        return g.toCanvas();
    }

    // -----------------------------------------------------------------------
    // Tile objects (16x16 maps, outlined). Biome palettes override letters.
    // -----------------------------------------------------------------------
    const OBJECTS = {
        tree: { rows: [
            '................',
            '.....gglgg......',
            '...gglllgggg....',
            '..glllllggggg...',
            '.gllllgggggggG..',
            '.glllggggggGgG..',
            '.gllgggggggGGG..',
            '.ggggggggGgGGG..',
            '.gggggGgGGGGGG..',
            '..gGgGGGGGGGG...',
            '...GGGGGGGGG....',
            '.....GGtTGG.....',
            '.......tT.......',
            '......ttT.......',
            '.....ttTTT......',
            '................'].map(r => '.' + r.slice(0, 15)) },
        pine: { rows: [
            '.......g........',
            '......glg.......',
            '.....glggg......',
            '.....lgggG......',
            '....glgggGG.....',
            '...gllgggGGG....',
            '....lgggGGG.....',
            '...glgggggGG....',
            '..gllggggGGGG...',
            '.gllgggggGGGGG..',
            '...gggggGGGG....',
            '..ggggGGGGGGG...',
            '.gggggGGGGGGGG..',
            '.......tT.......',
            '.......tT.......',
            '................'] },
        deadtree: { rows: [
            '................',
            '..t.......t.....',
            '...t..t..t..t...',
            '...tt.t.t..t....',
            '....tttTt.t.....',
            '..t..tttTt......',
            '...tt.tTT.......',
            '.....ttTT..t....',
            '......tTTtt.....',
            '......tTT.......',
            '......tTT.......',
            '......tTT.......',
            '.....ttTTT......',
            '....ttTTTTT.....',
            '................',
            '................'] },
        palm: { rows: [
            '................',
            '...ggg...ggg....',
            '..gllgg.gglgg...',
            '.gl...gggg..lg..',
            '.g...gglgGg..g..',
            '....gg.tT.gg....',
            '...g...tT...g...',
            '.......ytT......',
            '........tT......',
            '........tT......',
            '.......tTT......',
            '.......tT.......',
            '.......tT.......',
            '......ttTT......',
            '.....tttTTT.....',
            '................'] },
        bush: { rows: [
            '................',
            '................',
            '................',
            '.....gglgg......',
            '...gglllgggg....',
            '..gllgggggggg...',
            '..glggggggGgG...',
            '..gggggggGgGG...',
            '..ggggGgGGGGG...',
            '...gGgGGGGGG....',
            '....GGGGGGG.....',
            '................',
            '................',
            '................',
            '................',
            '................'].map(r => '.' + r.slice(0, 15)) },
        rock: { rows: [
            '................',
            '................',
            '................',
            '......rrrr......',
            '....rrlllrrr....',
            '...rlllrrrrrR...',
            '..rlllrrrrrrRR..',
            '..rllrrrrrrRRR..',
            '..rrrrrrrrRRRR..',
            '..rrrrrrRrRRRR..',
            '...rrrRRRRRRR...',
            '....RRRRRRRR....',
            '................',
            '................',
            '................',
            '................'] },
        boulder: { rows: [
            '................',
            '.....rrrrrr.....',
            '...rrlllrrrrr...',
            '..rlllrrrrrrrR..',
            '.rlllrrrrrrrrRR.',
            '.rllrrrrrrrrRRR.',
            '.rlrrrrrrrrRrRR.',
            '.rrrrrrrrrRrRRR.',
            '.rrrrrrrrrrRRRR.',
            '.rrrrrrRrRRRRRR.',
            '.rrrrrRrRRRRRRR.',
            '..rrrRRRRRRRRR..',
            '...RRRRRRRRRR...',
            '.....RRRRRR.....',
            '................',
            '................'] },
        tomb: { rows: [
            '................',
            '................',
            '.....ssssss.....',
            '....sllssssS....',
            '...slsssssssS...',
            '...slsSSSSssS...',
            '...slssSSsssS...',
            '...sssSSSSssS...',
            '...ssssSSsssS...',
            '...ssssSSsssS...',
            '...sssssssssS...',
            '...ssssssssSS...',
            '..ggSSSSSSSSgg..',
            '.gggggggggggggg.',
            '................',
            '................'] },
        cactus: { rows: [
            '................',
            '.......gg.......',
            '......glgg......',
            '......glgG......',
            '..gg..glgG......',
            '..lg..glgG..gg..',
            '..lg..glgG..gG..',
            '..lggggggG..gG..',
            '...ggggggGgggG..',
            '......glgGgGG...',
            '......glgG......',
            '......glgG......',
            '......glgG......',
            '.....gggggG.....',
            '................',
            '................'] },
        mushroom: { rows: [
            '................',
            '.....rrrrrr.....',
            '...rrwwrrrrrr...',
            '..rrwwwrrrwwrr..',
            '.rrrwwrrrrwwwrr.',
            '.rrrrrrrwrrrrrr.',
            '.rwwrrrrrrrrRRr.',
            '.RRRRRRRRRRRRRR.',
            '......ssss......',
            '......sssS......',
            '......sssS......',
            '......sssS......',
            '.....sssssS.....',
            '....ssssssSS....',
            '................',
            '................'] },
        lollipop: { rows: [
            '................',
            '.....pppppp.....',
            '...ppwwppppp....',
            '..pwwppwwwpPp...',
            '..pwppwpppwpP...',
            '..ppwpwpwpwpP...',
            '..ppwpppwwppP...',
            '..pppwwwppPPP...',
            '...pppppPPPP....',
            '.....PPPPP......',
            '.......ww.......',
            '.......wW.......',
            '.......wW.......',
            '.......wW.......',
            '......wwWW......',
            '................'] },
        candycane: { rows: [
            '................',
            '.....wwrrw......',
            '....rww..rr.....',
            '...rr.....ww....',
            '...ww.....rr....',
            '..........ww....',
            '..........rr....',
            '..........ww....',
            '..........rr....',
            '..........ww....',
            '..........rr....',
            '..........ww....',
            '..........rr....',
            '.........wwrr...',
            '................',
            '................'] },
        gumdrop: { rows: [
            '................',
            '................',
            '................',
            '................',
            '......pppp......',
            '.....pwwppp.....',
            '....pwpppppp....',
            '....pwpppppP....',
            '...ppppppppPP...',
            '...pppppppPPP...',
            '...ppppppPPPP...',
            '...PPPPPPPPPP...',
            '................',
            '................',
            '................',
            '................'] },
        snowpile: { rows: [
            '................',
            '................',
            '................',
            '.......ww.......',
            '.....wwwwww.....',
            '....wwwwwwwW....',
            '...wwwwwwwwwW...',
            '..wwwwwwwwwwWW..',
            '..wwwwwwwwwWWW..',
            '.wwwwwwwwwwWWWW.',
            '.WWWWWWWWWWWWWW.',
            '................',
            '................',
            '................',
            '................',
            '................'] },
        stump: { rows: [
            '................',
            '................',
            '................',
            '................',
            '................',
            '.....tttttt.....',
            '....tllllllt....',
            '....tlTTTTlT....',
            '....ttllllTT....',
            '....tTtttTtT....',
            '....tTtTtTtT....',
            '....tTtTtTTT....',
            '...ttTTTTTTTT...',
            '................',
            '................',
            '................'] },
        statue: { rows: [
            '................',
            '....ss....ss....',
            '....sss..sss....',
            '....ssssssss....',
            '...sskssssksS...',
            '...ssssssssssS..',
            '...sssslsssssS..',
            '....ssssssssS...',
            '...sssssssssSS..',
            '..sssssssssssS..',
            '..ssssssssssSS..',
            '...sssssssssS...',
            '...sssssssssS...',
            '..SSSSSSSSSSSS..',
            '..SSSSSSSSSSSS..',
            '................'] },
        sign: { rows: [
            '................',
            '................',
            '................',
            '...bbbbbbbbbb...',
            '...bwwwwwwwwB...',
            '...bbBBbBBbbB...',
            '...bwwwBwwwwB...',
            '...bbbbbbbbbB...',
            '...BBBBBBBBBB...',
            '.......bB.......',
            '.......bB.......',
            '.......bB.......',
            '......bbBB......',
            '................',
            '................',
            '................'] },
        crystal: { rows: [
            '................',
            '.......c........',
            '......clc.......',
            '......clcC......',
            '...c..clcC......',
            '..clc.clcC..c...',
            '..clcCclcC.clC..',
            '..clcCclcCcclC..',
            '..clcCclcCclcC..',
            '..clcCclcCclcC..',
            '..ccCCccCCccCC..',
            '.ssssssssssssss.',
            '................',
            '................',
            '................',
            '................'] },
        fence: { rows: [
            '................',
            '................',
            '................',
            '..b....b....b...',
            '.bbb..bbb..bbb..',
            '.bbB..bbB..bbB..',
            'bbbbbbbbbbbbbbbb',
            'BBBBBBBBBBBBBBBB',
            '.bbB..bbB..bbB..',
            '.bbB..bbB..bbB..',
            'bbbbbbbbbbbbbbbb',
            'BBBBBBBBBBBBBBBB',
            '.bbB..bbB..bbB..',
            '.BBB..BBB..BBB..',
            '................',
            '................'] },
        block: { rows: [
            'llllllllllllllld',
            'lsssssssssssssdd',
            'lsllllllllllldsd',
            'lslssssssssssdsd',
            'lslssssssssssdsd',
            'lslssssssssssdsd',
            'lslssssssssssdsd',
            'lslssssssssssdsd',
            'lslssssssssssdsd',
            'lslssssssssssdsd',
            'lslssssssssssdsd',
            'lslssssssssssdsd',
            'lslssssssssssdsd',
            'lsddddddddddddsd',
            'ldssssssssssssss',
            'dddddddddddddddd'], noOutline: true },
        torch: { rows: [
            '................',
            '................',
            '................',
            '................',
            '................',
            '.....ssssss.....',
            '....slllllss....',
            '....sddddddS....',
            '.....sssssS.....',
            '......sssS......',
            '......sssS......',
            '......sssS......',
            '.....sssssS.....',
            '....SSSSSSSS....',
            '................',
            '................'] },
        pedestal: { rows: [
            '................',
            '................',
            '................',
            '................',
            '...wwwwwwwwww...',
            '..wllllllllllW..',
            '..wwwwwwwwwwWW..',
            '...ssssssssss...',
            '....sllsssss....',
            '....slssssss....',
            '....slssssss....',
            '....slssssss....',
            '...ssssssssss...',
            '..wwwwwwwwwwWW..',
            '..WWWWWWWWWWWW..',
            '................'] },
        skull: { rows: [
            '................',
            '................',
            '................',
            '................',
            '................',
            '................',
            '................',
            '......wwww......',
            '.....wwwwww.....',
            '.....wkwwkw.....',
            '.....wwwwww.....',
            '......wWWw......',
            '................',
            '................',
            '................',
            '................'], decor: true },
        pot: { rows: [
            '................',
            '................',
            '................',
            '.....bbbbbb.....',
            '....bBBBBBBb....',
            '.....bbbbbb.....',
            '....bbbbbbbB....',
            '...bllbbbbbBB...',
            '...blbbbbbbBB...',
            '...bbbbbbbBBB...',
            '...bbbbbbbBBB...',
            '....bbbbbBBB....',
            '.....BBBBBB.....',
            '................',
            '................',
            '................'] },
        bed: { rows: [
            '................',
            '.bbbbbbbbbbbbbb.',
            '.bwwwwwwbbbbbbb.',
            '.bwwwwwwwbbbbbb.',
            '.bbbbbbbbbbbbbb.',
            '.rrrrrrrrrrrrrr.',
            '.rRrrRrrRrrRrrr.',
            '.rrrrrrrrrrrrrr.',
            '.rrRrrRrrRrrRrr.',
            '.rrrrrrrrrrrrrr.',
            '.rRrrRrrRrrRrrr.',
            '.rrrrrrrrrrrrrr.',
            '.RRRRRRRRRRRRRR.',
            '.b............b.',
            '................',
            '................'] },
        box: { rows: [
            '................',
            '................',
            '..b..........b..',
            '..bb........bb..',
            '..bbbbbbbbbbbb..',
            '..bBBBBBBBBBBb..',
            '..bbbbbbbbbbbB..',
            '..bbbbbbbbbbbB..',
            '..bbbbwwbbbbbB..',
            '..bbbbbbbbbbbB..',
            '..bbbbbbbbbbbB..',
            '..bbbbbbbbbbbB..',
            '..BBBBBBBBBBBB..',
            '................',
            '................',
            '................'] },
        table: { rows: [
            '................',
            '................',
            '................',
            '................',
            '.bbbbbbbbbbbbbb.',
            '.bllllllllllllb.',
            '.bbbbbbbbbbbbbB.',
            '.BBBBBBBBBBBBBB.',
            '..bB........bB..',
            '..bB........bB..',
            '..bB........bB..',
            '..bB........bB..',
            '..BB........BB..',
            '................',
            '................',
            '................'] },
        leafpile: { rows: [
            '................',
            '................',
            '................',
            '................',
            '................',
            '.......oy.......',
            '.....oyoorr.....',
            '....royoroyo....',
            '...oroyrooyor...',
            '..yorroyoroory..',
            '..oryoorryoyro..',
            '...RRRRRRRRRR...',
            '................',
            '................',
            '................',
            '................'] },
        lilypad: { rows: [
            '................',
            '................',
            '................',
            '................',
            '................',
            '.....gggg.......',
            '....gglggg.p....',
            '...gglgg..ppp...',
            '...gggg.g..p....',
            '....gggggg......',
            '.....GGGG.......',
            '................',
            '................',
            '................',
            '................',
            '................'], decor: true },
        shroomlet: { rows: [
            '................',
            '................',
            '................',
            '................',
            '................',
            '.......rrrr.....',
            '......rwwrrr....',
            '.....rrwrrwrr...',
            '.....RRRRRRRR...',
            '..rrr..ssss.....',
            '.rwrrr.sssS.....',
            '.RRRRR.sssS.....',
            '...ss..sssS.....',
            '...sS.ssssSS....',
            '................',
            '................'] },
        pumpkin: { rows: [
            '................',
            '................',
            '................',
            '................',
            '.......gg.......',
            '........g.......',
            '....oooooooo....',
            '...ooOooOooOo...',
            '..ooOooooOooOo..',
            '..oOoooooOoooOo.',
            '..oOoooooOoooOo.',
            '..ooOooooOooOOo.',
            '...ooOooOooOOo..',
            '....OOOOOOOOO...',
            '................',
            '................'] },
        haybale: { rows: [
            '................',
            '................',
            '................',
            '...yyyyyyyyyy...',
            '..yyYyyyYyyyYy..',
            '..yyyyyyyyyyyy..',
            '..bbbbbbbbbbbb..',
            '..yyYyyyyyYyyy..',
            '..yyyyyYyyyyyy..',
            '..yYyyyyyyyyYy..',
            '..bbbbbbbbbbbb..',
            '..yyyyYyyyyyyy..',
            '..YYYYYYYYYYYY..',
            '................',
            '................',
            '................'] },
        house: { w: 32, h: 32 }
    };

    // -----------------------------------------------------------------------
    // Biomes. Each one: ground colours, what lines the borders, what dots
    // the interior, the local wildlife, its weather and its naming words.
    // -----------------------------------------------------------------------
    const BIOMES = {
        meadow: {
            name: 'Meadow',
            ground: '#80d010', ground2: '#68b800', ground3: '#a8e840', path: '#d8b868',
            wall: 'tree', obstacles: ['bush', 'bush', 'rock', 'tree'], decor: 'flowers', cuttable: 'bush',
            pal: { g: '#00a800', G: '#005800', l: '#58d854', t: '#ac7c00', T: '#6c4c00', r: '#c88050', R: '#885028', w: '#fcfcfc', s: '#bcbcbc', S: '#7c7c7c' },
            water: '#3c8cf8', enemies: ['slime', 'octo', 'bee', 'sock', 'goose'], critters: ['butterfly', 'butterfly', 'bird'],
            weather: 'petals', layouts: ['mirror', 'scatter', 'clusters', 'pond', 'open', 'ring'],
            adj: ['Breezy', 'Buttercup', 'Sunny', 'Dandelion', 'Clover', 'Picnic', 'Hummingbird', 'Lazy'],
            noun: ['Meadow', 'Fields', 'Green', 'Downs', 'Pasture', 'Lea']
        },
        forest: {
            name: 'Forest',
            ground: '#58a828', ground2: '#408c18', ground3: '#78c040', path: '#a88848',
            wall: 'tree', obstacles: ['tree', 'tree', 'stump', 'bush', 'shroomlet'], decor: 'tufts', cuttable: 'bush',
            pal: { g: '#187818', G: '#0c4808', l: '#38a838', t: '#7c4c1c', T: '#4c2c08', r: '#a88868', R: '#685038', w: '#fcfcfc', s: '#e83030', S: '#a81818' },
            water: '#2c78c8', enemies: ['boar', 'shroom', 'bee', 'acorn', 'sporepuff'], critters: ['squirrel', 'butterfly'],
            weather: 'leaves', layouts: ['grove', 'grove', 'mirror', 'clusters', 'maze'],
            adj: ['Whispering', 'Mossy', 'Wobbly', 'Snoozy', 'Tangled', 'Owlbear', 'Grumbling', 'Acorn'],
            noun: ['Woods', 'Forest', 'Thicket', 'Grove', 'Hollow', 'Wildwood']
        },
        desert: {
            name: 'Desert',
            ground: '#fcd8a8', ground2: '#e8bc80', ground3: '#fce8c8', path: '#d8a868',
            wall: 'boulder', obstacles: ['cactus', 'cactus', 'rock', 'boulder'], decor: 'pebbles', cuttable: null,
            pal: { g: '#58b838', G: '#287818', l: '#98e868', r: '#d07838', R: '#904818', t: '#ac7c00', T: '#6c4c00', w: '#fcfcfc', s: '#c8a888', S: '#887058', p: '#f878b8' },
            water: '#38a8d8', enemies: ['cactus', 'tumbleweed', 'sandshark', 'octo'], critters: ['lizard'],
            weather: 'dust', layouts: ['scatter', 'mirror', 'clusters', 'oasis', 'open'],
            adj: ['Scorching', 'Crumbly', 'Toasty', 'Biscuit', 'Dusty', 'Sandy', 'Mirage', 'Snoring'],
            noun: ['Dunes', 'Desert', 'Wastes', 'Flats', 'Mesa', 'Sands']
        },
        snow: {
            name: 'Tundra',
            ground: '#e8f4fc', ground2: '#c8e0f4', ground3: '#fcfcfc', path: '#b0c8e0',
            wall: 'pine', obstacles: ['pine', 'snowpile', 'rock', 'crystal'], decor: 'sparkle', cuttable: null,
            pal: { g: '#2c7860', G: '#184838', l: '#e8f8fc', t: '#7c4c1c', T: '#4c2c08', r: '#98a8c0', R: '#687890', w: '#fcfcfc', W: '#b8d0e8', c: '#a8e8fc', C: '#58a8d8', s: '#a8b8c8' },
            water: '#78c8f0', enemies: ['snowman', 'penguin', 'bat', 'blueocto'], critters: ['bird'],
            weather: 'snow', layouts: ['scatter', 'mirror', 'grove', 'pond', 'ring'],
            adj: ['Frosty', 'Shivering', 'Mitten', 'Cocoa', 'Snowglobe', 'Chilly', 'Polar', 'Sniffly'],
            noun: ['Tundra', 'Peaks', 'Drifts', 'Glacier', 'Icefields', 'Slopes']
        },
        graveyard: {
            name: 'Graveyard',
            ground: '#58705c', ground2: '#485c4c', ground3: '#6c8470', path: '#7c7468',
            wall: 'deadtree', obstacles: ['tomb', 'tomb', 'tomb', 'deadtree', 'statue'], decor: 'skulls', cuttable: null,
            pal: { s: '#a8a8b8', S: '#686878', l: '#d8d8e8', g: '#3c5c40', t: '#5c4c48', T: '#3c3030', w: '#e8e8d8', W: '#a8a898', k: '#140c1c', r: '#787888', R: '#4c4c5c' },
            water: '#384c68', enemies: ['ghost', 'skeleton', 'bat', 'pumpkinhead'], critters: ['crow'],
            weather: 'fog', layouts: ['rows', 'rows', 'mirror', 'scatter'], dim: 0.25,
            adj: ['Gloomy', 'Creaky', 'Spooky', 'Moaning', 'Hollow', 'Midnight', 'Rattling', 'Ghostly'],
            noun: ['Graveyard', 'Crypts', 'Barrows', 'Cemetery', 'Boneyard']
        },
        mushroom: {
            name: 'Mushroom Grove',
            ground: '#6c5c98', ground2: '#584880', ground3: '#8878b8', path: '#a898c8',
            wall: 'mushroom', obstacles: ['mushroom', 'shroomlet', 'shroomlet', 'crystal'], decor: 'spots', cuttable: null,
            pal: { r: '#c83cc8', R: '#882088', w: '#f8e8fc', s: '#fce0b8', S: '#d8b088', c: '#58fcc8', C: '#18b888', l: '#f8b8f8', g: '#5848a0' },
            water: '#5838c8', enemies: ['shroom', 'dustbunny', 'sporepuff', 'mender'], critters: ['firefly'],
            weather: 'spores', layouts: ['grove', 'scatter', 'mirror', 'ring'], dim: 0.12,
            adj: ['Glimmering', 'Spore-filled', 'Giggling', 'Dreamy', 'Twinkly', 'Puffball', 'Sleepy', 'Bouncy'],
            noun: ['Grove', 'Hollow', 'Caps', 'Glade', 'Patch', 'Ring']
        },
        candy: {
            name: 'Candy Kingdom',
            ground: '#fcc4e0', ground2: '#f8a8d0', ground3: '#fce4f0', path: '#fce8a8',
            wall: 'candycane', obstacles: ['lollipop', 'gumdrop', 'gumdrop', 'candycane'], decor: 'sprinkles', cuttable: 'gumdrop',
            pal: { p: '#f85898', P: '#b81860', w: '#fcfcfc', W: '#d8d8d8', r: '#e83030', g: '#58d838', G: '#289818', l: '#fcb8d8' },
            water: '#8c4c28', waterName: 'chocolate', enemies: ['gingerbread', 'gummy', 'cupcake', 'redslime'], critters: ['butterfly'],
            weather: 'sprinkles', layouts: ['scatter', 'mirror', 'pond', 'clusters', 'ring'],
            adj: ['Gumdrop', 'Lollipop', 'Sugarplum', 'Taffy', 'Bonbon', 'Marshmallow', 'Fudge', 'Sprinkle'],
            noun: ['Glade', 'Kingdom', 'Hills', 'Meadow', 'Lane', 'Boulevard']
        },
        lake: {
            name: 'Lakeside',
            ground: '#80d010', ground2: '#68b800', ground3: '#a8e840', path: '#fcd8a8',
            wall: 'tree', obstacles: ['bush', 'rock', 'tree'], decor: 'flowers', cuttable: 'bush',
            pal: { g: '#00a800', G: '#005800', l: '#58d854', t: '#ac7c00', T: '#6c4c00', r: '#a8a8b8', R: '#686878', w: '#fcfcfc', p: '#f878b8' },
            water: '#3c8cf8', enemies: ['octo', 'rubberduck', 'crab', 'slime'], critters: ['fish', 'bird'],
            weather: null, layouts: ['lake', 'lake', 'pond', 'river'],
            adj: ['Sparkling', 'Lily', 'Drizzly', 'Croaking', 'Paddle', 'Moonlit', 'Splashy', 'Duckweed'],
            noun: ['Lake', 'Shore', 'Pond', 'Lagoon', 'Waters', 'Marsh']
        },
        beach: {
            name: 'Beach',
            ground: '#fce0a8', ground2: '#f0c888', ground3: '#fcf0d0', path: '#e8c890',
            wall: 'palm', obstacles: ['palm', 'rock', 'rock'], decor: 'shells', cuttable: null,
            pal: { g: '#38b838', G: '#187818', l: '#78e858', t: '#a86c38', T: '#7c4c20', y: '#d8a038', r: '#c8a888', R: '#887058', w: '#fcfcfc' },
            water: '#28a8e8', enemies: ['crab', 'octo', 'blueocto', 'sandshark'], critters: ['bird'],
            weather: null, layouts: ['beach', 'beach', 'scatter'],
            adj: ['Salty', 'Seashell', 'Breezy', 'Coconut', 'Tidepool', 'Sunburnt', 'Sandcastle', 'Barnacle'],
            noun: ['Beach', 'Coast', 'Shore', 'Cove', 'Bay', 'Strand']
        },
        mountain: {
            name: 'Mountains',
            ground: '#c8a070', ground2: '#b08858', ground3: '#d8b888', path: '#e0c8a0',
            wall: 'boulder', obstacles: ['boulder', 'rock', 'rock', 'boulder'], decor: 'pebbles', cuttable: null,
            pal: { r: '#c84c0c', R: '#802c00', l: '#f08848', w: '#fcfcfc', s: '#a8a8a8', S: '#686868', g: '#58a828', G: '#287818', t: '#7c4c1c', T: '#4c2c08' },
            water: '#3c8cf8', enemies: ['octo', 'bat', 'boar', 'prickle'], critters: ['bird'],
            weather: null, layouts: ['mirror', 'clusters', 'maze', 'scatter'],
            adj: ['Rumbling', 'Craggy', 'Thunder', 'Grumpy', 'Windy', 'Echoing', 'Lofty', 'Boulder'],
            noun: ['Peaks', 'Mountain', 'Crags', 'Ridge', 'Cliffs', 'Pass']
        },
        autumn: {
            name: 'Autumn Woods',
            ground: '#c8a048', ground2: '#b08838', ground3: '#d8b868', path: '#a87c40',
            wall: 'tree', obstacles: ['tree', 'leafpile', 'leafpile', 'stump', 'pumpkin'], decor: 'fallen', cuttable: 'leafpile',
            pal: { g: '#e86818', G: '#a83c08', l: '#fcb848', t: '#7c4c1c', T: '#4c2c08', o: '#f88818', y: '#fcd848', r: '#e83818', R: '#8c3818', w: '#fcfcfc' },
            water: '#3878b8', enemies: ['pumpkinhead', 'acorn', 'shroom', 'sock'], critters: ['squirrel'],
            weather: 'leaves', layouts: ['grove', 'scatter', 'mirror', 'clusters'],
            adj: ['Pumpkin', 'Cozy', 'Crunchy', 'Cider', 'Maple', 'Harvest', 'Sweater', 'Russet'],
            noun: ['Woods', 'Orchard', 'Hollow', 'Grove', 'Vale', 'Patch']
        },
        pasture: {
            name: 'Cow Level',
            ground: '#78c838', ground2: '#60b028', ground3: '#98e050', path: '#d8b868',
            wall: 'fence', obstacles: ['haybale', 'haybale', 'bush', 'tree'], decor: 'flowers', cuttable: 'bush',
            pal: { g: '#00a800', G: '#005800', l: '#58d854', t: '#ac7c00', T: '#6c4c00', w: '#fcfcfc' },
            water: '#3c8cf8', enemies: ['bovine'], noCousins: true, critters: ['butterfly', 'butterfly', 'bird'],
            weather: 'petals', layouts: ['scatter', 'clusters', 'pond', 'open'],
            adj: ['Udder', 'Moo', 'Bovine', 'Cud', 'Clover'], noun: ['Pasture', 'Field', 'Paddock']
        },
        village: {
            name: 'Village',
            ground: '#80d010', ground2: '#68b800', ground3: '#a8e840', path: '#d8b868',
            wall: 'tree', obstacles: ['bush', 'fence'], decor: 'flowers', cuttable: 'bush',
            pal: { g: '#00a800', G: '#005800', l: '#58d854', t: '#ac7c00', T: '#6c4c00', b: '#a87038', B: '#6c4418', w: '#fcfcfc', r: '#c88050', R: '#885028' },
            water: '#3c8cf8', enemies: ['goose'], critters: ['chicken', 'chicken', 'chicken', 'butterfly'],
            weather: 'petals', layouts: ['village'],
            adj: ['Little', 'Sleepy', 'Muffin', 'Teacup', 'Cheery', 'Hearth', 'Bramble', 'Kettle'],
            noun: ['Village', 'Hamlet', 'Town', 'Crossing', 'Corners', 'Burrow']
        }
    };

    // Theme presets weight which biomes a world is built from
    const WORLD_THEMES = {
        mixed: { name: 'A Bit of Everything', weights: { meadow: 3, forest: 3, desert: 2, snow: 2, graveyard: 1, mushroom: 1, candy: 1, lake: 2, beach: 1, mountain: 2, autumn: 2 } },
        classic: { name: 'Classic Overworld', weights: { meadow: 4, forest: 3, mountain: 3, lake: 2, desert: 1, graveyard: 1 } },
        whimsy: { name: 'Pure Whimsy', weights: { candy: 3, mushroom: 3, meadow: 2, autumn: 1, lake: 1 } },
        spooky: { name: 'Spooky Season', weights: { graveyard: 4, autumn: 4, mushroom: 2, forest: 2 } },
        frosty: { name: 'Winter Wonderland', weights: { snow: 6, mountain: 2, lake: 1, forest: 1 } },
        sweets: { name: 'Candy Kingdom', weights: { candy: 7, meadow: 1, lake: 1 } },
        desert: { name: 'Sun-Baked Desert', weights: { desert: 6, mountain: 2, beach: 2 } },
        islands: { name: 'Island Hopping', weights: { beach: 4, lake: 4, meadow: 2 } },
        woodland: { name: 'Deep Woods', weights: { forest: 5, autumn: 3, mushroom: 2 } }
    };

    const DUNGEON_THEMES = [
        { name: 'Azure', wall: '#2858c8', wallHi: '#5888f8', wallLo: '#14286c', floor: '#2c3c78', floor2: '#24306c', block: '#4870d8' },
        { name: 'Verdant', wall: '#208838', wallHi: '#48c060', wallLo: '#0c4818', floor: '#2c5c34', floor2: '#244c2c', block: '#38a050' },
        { name: 'Amethyst', wall: '#7838b8', wallHi: '#a868e8', wallLo: '#3c1868', floor: '#4c2c6c', floor2: '#40245c', block: '#9050d0' },
        { name: 'Ember', wall: '#b83818', wallHi: '#e86838', wallLo: '#601808', floor: '#5c2c20', floor2: '#4c2418', block: '#d05028' },
        { name: 'Sandstone', wall: '#c08838', wallHi: '#e8b868', wallLo: '#6c4818', floor: '#7c6038', floor2: '#6c5030', block: '#d8a050' },
        { name: 'Frost', wall: '#58a8d8', wallHi: '#a8e0fc', wallLo: '#285c88', floor: '#38607c', floor2: '#30546c', block: '#78c0e8' },
        { name: 'Bubblegum', wall: '#d85898', wallHi: '#f898c8', wallLo: '#802858', floor: '#7c3c64', floor2: '#6c3458', block: '#e878b0' },
        { name: 'Obsidian', wall: '#484058', wallHi: '#787088', wallLo: '#201c2c', floor: '#2c2838', floor2: '#24202c', block: '#5c5470' }
    ];

    // -----------------------------------------------------------------------
    // Words: names, signs, story, sages, thoughts
    // -----------------------------------------------------------------------
    const WORDS = {
        dungeonAdj: ['Wobbly', 'Forgotten', 'Mildly Perilous', 'Soggy', 'Sneezing', 'Upside-Down', 'Glittering', 'Grumpy', 'Ticklish', 'Squeaky', 'Dusty', 'Overdue'],
        dungeonPlace: ['Labyrinth', 'Temple', 'Catacombs', 'Keep', 'Palace', 'Crypt', 'Caverns', 'Tower', 'Vault', 'Burrow', 'Pyramid', 'Sanctum'],
        dungeonOf: ['Socks', 'Pudding', 'Mild Inconvenience', 'the Lost Spoon', 'Yarn', 'Pickles', 'Teacups', 'Biscuits', 'Echoes', 'Naps', 'Rubber Ducks', 'Crumbs', 'Wobbles'],
        villains: ['the Sock Goblin', 'Baron von Wobble', 'a Very Rude Wizard', 'the Dust Bunny King', 'Lord Grumbleton', 'the Moth Who Ate the Moon', 'Count Crumbsworth', 'a Suspicious Raccoon'],
        artifacts: {
            gem: 'Shards of the Moon Pie', fish: 'Scraps of the Golden Yarn', bone: 'Bits of the Legendary Stick',
            star: 'Pieces of the Wishing Wand', coin: 'Fragments of the Royal Teapot', bug: 'Lily Gems of Old',
            bolt: 'Power Cells of Destiny', milk: 'Drops of the Eternal Milkshake', acorn: 'Seeds of the World Tree', bread: 'Crumbs of the Eternal Loaf',
            candy: 'Pieces of the Great Gumdrop'
        },
        sages: [
            { name: 'Old Man', pal: { h: '#fcfcfc', c: '#c84c0c', k: '#fcc89c' } },
            { name: 'Old Cat', cat: true },
            { name: 'Wise Owl', owl: true },
            { name: 'Frog in a Bathrobe', frog: true }
        ],
        giftLines: [
            "IT'S DANGEROUS TO GO ALONE! TAKE THIS.",
            "IT'S DANGEROUS TO GO ALONE! TAKE THIS SANDWICH.",
            "OH! A VISITOR! HERE, HAVE THIS. I FOUND IT IN A SOCK.",
            "TAKE THIS. NO, I DON'T WANT IT BACK.",
            "I'VE BEEN WAITING SO LONG. ALSO I LIVE HERE.",
            "YOU LOOK LIKE YOU COULD USE A HEART. HERE.",
            "SHH. IT'S A SECRET TO EVERYBODY."
        ],
        fountainLines: ['WELCOME, WEARY ONE. REST HERE.', 'THE FAIRIES SAY HI.', 'SPLASH! ALL BETTER.'],
        napLines: ['A COZY BED! A QUICK NAP WON\'T HURT...', 'ZZZ... JUST FIVE MORE MINUTES...'],
        boxLines: ['A BOX!! MUST. SIT. IN. BOX.', 'IF I FITS, I SITS.'],
        shopLines: ['BUY SOMETHIN\' WILL YA!', 'WELCOME! NO REFUNDS.', 'EVERYTHING MUST GO! EXCEPT ME.'],
        houseLines: [
            'OH, HELLO DEAR. HAVE A COOKIE. IT\'S A HEART-SHAPED COOKIE.',
            'MY 9 CATS AND I SAY HELLO.',
            'HAVE YOU SEEN MY SPOON? NO? WELL, TAKE THIS ANYWAY.',
            'I USED TO BE AN ADVENTURER. THEN I TOOK A NAP.',
            'KEEP IT DOWN, THE BABY SLIME IS SLEEPING.'
        ],
        signs: [
            'BEWARE OF THE BEE.', 'THIS IS A SIGN.', 'NO SWIMMING (UNLESS YOU ARE A DUCK).',
            'LOST: ONE SOCK. REWARD: GRATITUDE.', 'TOURIST TIP: BUSHES CONTAIN MONEY.',
            'YOU ARE HERE. PROBABLY.', 'PLEASE DO NOT FEED THE SLIMES.', 'DANGER: MILD PERIL AHEAD.',
            'IF YOU CAN READ THIS, HI!', 'TODAY\'S FORECAST: ADVENTURE.', 'THE DUNGEON IS THATAWAY ->.',
            'SLOW: CHICKEN CROSSING.', 'NAPPING ZONE. KEEP QUIET.', 'GRANDMA WAS HERE.',
            'TRESPASSERS WILL BE HUGGED.', 'NO CATS ALLOWED (WE KNOW YOU WON\'T LISTEN).'
        ],
        trinkets: [
            { icon: 'sock', name: 'A SOCK', quip: "IT'S... JUST A SOCK." },
            { icon: 'spoon', name: 'A SPOON', quip: 'A PERFECTLY GOOD SPOON!' },
            { icon: 'rock', name: 'A VERY NICE ROCK', quip: 'SO SMOOTH. SO ROCK.' },
            { icon: 'duckToy', name: 'A RUBBER DUCK', quip: 'SQUEAK!' },
            { icon: 'teacup', name: 'A TEACUP', quip: 'STILL WARM. SUSPICIOUS.' },
            { icon: 'button', name: 'A BUTTON', quip: 'BELONGS TO SOMEONE\'S COAT.' },
            { icon: 'feather', name: 'A FEATHER', quip: 'TICKLISH!' },
            { icon: 'banana', name: 'A BANANA', quip: 'FOR SCALE.' },
            { icon: 'mushroomItem', name: 'A SUSPICIOUS MUSHROOM', quip: 'BEST NOT.' }
        ],
        // Thoughts the hero has about the world, keyed by situation
        thoughts: {
            hurt: ['Ouch!', 'Oof!', 'Hey!', 'Rude!', 'Ow ow ow'],
            lowhp: ['I need a snack...', 'Must... find... hearts', 'Feeling woozy', 'Owie.'],
            newBiome: {
                meadow: ['What a nice day!', 'Flowers!'], forest: ['Spooky trees...', 'So many trees!'],
                desert: ['Hot hot hot!', 'Sand. Everywhere.'], snow: ['Brrr!', 'Snow!!'],
                graveyard: ['I don\'t like this...', 'G-ghosts?'], mushroom: ['Everything is purple!', 'Whoa...'],
                candy: ['Is that... candy?!', 'Sweet!'], lake: ['Ooh, water!', 'Pretty lake!'],
                beach: ['Beach day!', 'Seashells!'], mountain: ['Big rocks!', 'What a view!'],
                autumn: ['Crunchy leaves!', 'Cozy!'], village: ['People!', 'A village!'], pasture: ['Moo?', 'So... many... cows...']
            },
            dungeon: ['Here goes nothing!', 'It\'s dark in here...', 'A dungeon!'],
            treasure: ['Treasure!', 'Ooh, shiny!', 'Yoink!'],
            victory: ['Too easy!', 'Hah!', 'Got \'em!', 'Victory!'],
            sign: ['What does it say?', 'A sign!'],
            tunnel: ['Wheee!', 'Down the hole!', 'Where does this go?'],
            idle: ['Hmm...', 'La la la~', '*whistles*', 'Which way?', 'I wonder...']
        },
        deathLines: ['YOU TOOK A LITTLE NAP.', 'OOF. THAT WAS EMBARRASSING.', 'YOU FAINTED (DRAMATICALLY).', 'TRY AGAIN, BRAVE ONE!', 'THE MONSTERS ARE VERY SORRY.'],
        endings: ['THE WORLD IS SAVED!', 'HOORAY! EVERYONE GETS A NAP!', 'PEACE RETURNS. THE SOCKS ARE SAFE.', 'YOU DID IT! (WITH MINIMAL PERIL)']
    };

    return {
        PixelGrid, flipCanvas, silhouette, half, flipRows, shade, mix, hexToRgb, rgbToHex, mulberry32, hash2,
        OUTLINE, FONT, ICONS, BODIES, HEADS, GEARS, TEMPLATES, HEROES, HATS, COMPANIONS, ENEMIES, BOSSES,
        paintBoss, OBJECTS, BIOMES, WORLD_THEMES, DUNGEON_THEMES, WORDS
    };
})();

if (typeof module !== 'undefined') module.exports = QuestArt;
