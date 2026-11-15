// The Never-Ending Baseball Season's pictures (SPEC §10.37): the lettering,
// the ballpark, the little men and the things around them. Everything is
// drawn in whole pixels on a small canvas that CSS scales up, pixelated.
//
// The park is one bake per game (and per change of light): each pixel of
// the picture is asked where on the field it is (in feet, by the same
// `edgeAt` the game uses for its fences), and coloured accordingly. So the
// fence the ball clears is the fence that is drawn. The view is from high
// behind home plate: x across, y up the screen squashed by KY, height
// lifting a thing by KZ.

const BaseballArt = (() => {
    'use strict';
    const L = BaseballLogic;
    const KY = 0.6, KZ = 0.78;
    const RAD = Math.PI / 180;

    // ---- Lettering: a 5×7 face and a 3×5 one, capitals only --------------------------
    // Each glyph is its rows, top to bottom, as bits (leftmost is the high bit).
    const BIG = {
        A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14], D: [28, 18, 17, 17, 17, 18, 28], E: [31, 16, 16, 30, 16, 16, 31],
        F: [31, 16, 16, 30, 16, 16, 16], G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17], I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 2, 18, 12],
        K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31], M: [17, 27, 21, 21, 17, 17, 17], N: [17, 25, 21, 19, 17, 17, 17], O: [14, 17, 17, 17, 17, 17, 14],
        P: [30, 17, 17, 30, 16, 16, 16], Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17], S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
        U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17], Y: [17, 17, 17, 10, 4, 4, 4],
        Z: [31, 1, 2, 4, 8, 16, 31], 0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 2, 4, 8, 31], 3: [31, 2, 4, 2, 1, 17, 14], 4: [2, 6, 10, 18, 31, 2, 2],
        5: [31, 16, 30, 1, 1, 17, 14], 6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8], 8: [14, 17, 17, 14, 17, 17, 14], 9: [14, 17, 17, 15, 1, 2, 12],
        '.': [0, 0, 0, 0, 0, 12, 12], ',': [0, 0, 0, 0, 12, 4, 8], '!': [4, 4, 4, 4, 4, 0, 4], '?': [14, 17, 1, 2, 4, 0, 4], '-': [0, 0, 0, 31, 0, 0, 0], '\'': [4, 4, 8, 0, 0, 0, 0],
        '"': [10, 10, 10, 0, 0, 0, 0], ':': [0, 12, 12, 0, 12, 12, 0], '/': [0, 1, 2, 4, 8, 16, 0], '(': [2, 4, 8, 8, 8, 4, 2], ')': [8, 4, 2, 2, 2, 4, 8], '+': [0, 4, 4, 31, 4, 4, 0],
        '%': [24, 25, 2, 4, 8, 19, 3], '&': [12, 18, 20, 8, 21, 18, 13], '#': [10, 10, 31, 10, 31, 10, 10], '*': [0, 4, 21, 14, 21, 4, 0], '=': [0, 0, 31, 0, 31, 0, 0],
        '>': [8, 4, 2, 1, 2, 4, 8], '<': [2, 4, 8, 16, 8, 4, 2], '^': [0, 4, 14, 31, 0, 0, 0], '~': [0, 0, 31, 14, 4, 0, 0],
    };
    const SMALL = {
        A: [2, 5, 7, 5, 5], B: [6, 5, 6, 5, 6], C: [3, 4, 4, 4, 3], D: [6, 5, 5, 5, 6], E: [7, 4, 6, 4, 7], F: [7, 4, 6, 4, 4], G: [3, 4, 5, 5, 3], H: [5, 5, 7, 5, 5], I: [7, 2, 2, 2, 7],
        J: [1, 1, 1, 5, 2], K: [5, 5, 6, 5, 5], L: [4, 4, 4, 4, 7], M: [5, 7, 7, 5, 5], N: [6, 5, 5, 5, 5], O: [2, 5, 5, 5, 2], P: [6, 5, 6, 4, 4], Q: [2, 5, 5, 7, 3], R: [6, 5, 6, 5, 5],
        S: [3, 4, 2, 1, 6], T: [7, 2, 2, 2, 2], U: [5, 5, 5, 5, 7], V: [5, 5, 5, 5, 2], W: [5, 5, 7, 7, 5], X: [5, 5, 2, 5, 5], Y: [5, 5, 2, 2, 2], Z: [7, 1, 2, 4, 7],
        0: [7, 5, 5, 5, 7], 1: [2, 6, 2, 2, 7], 2: [6, 1, 2, 4, 7], 3: [6, 1, 2, 1, 6], 4: [5, 5, 7, 1, 1], 5: [7, 4, 6, 1, 6], 6: [3, 4, 7, 5, 7], 7: [7, 1, 2, 2, 2], 8: [7, 5, 7, 5, 7],
        9: [7, 5, 7, 1, 6], '.': [0, 0, 0, 0, 2], ',': [0, 0, 0, 2, 4], '-': [0, 0, 7, 0, 0], '\'': [2, 2, 0, 0, 0], '!': [2, 2, 2, 0, 2], '?': [6, 1, 2, 0, 2], ':': [0, 2, 0, 2, 0],
        '/': [1, 1, 2, 4, 4], '(': [1, 2, 2, 2, 1], ')': [4, 2, 2, 2, 4], '+': [0, 2, 7, 2, 0], '%': [5, 1, 2, 4, 5], '"': [5, 5, 0, 0, 0], '&': [2, 5, 2, 5, 3], '=': [0, 7, 0, 7, 0],
        '>': [4, 2, 1, 2, 4], '<': [1, 2, 4, 2, 1], '*': [5, 2, 5, 0, 0], '#': [5, 7, 5, 7, 5], '^': [0, 2, 7, 0, 0], '~': [0, 7, 2, 0, 0],
    };
    const width = (string, small, scale = 1) => (String(string).length * (small ? 4 : 6) - 1) * scale;
    // Write `string` with its top-left at (x, y). opts: small, scale, align ('left', 'center', 'right'), shadow (a colour).
    function text(c, string, x, y, colour, opts = {}) {
        const { small = false, scale = 1, align = 'left', shadow = null } = opts, face = small ? SMALL : BIG, wide = small ? 3 : 5, step = (wide + 1) * scale;
        string = String(string).toUpperCase();
        x = Math.round(align === 'center' ? x - width(string, small, scale) / 2 : align === 'right' ? x - width(string, small, scale) : x);
        y = Math.round(y);
        for (const pass of shadow ? [shadow, colour] : [colour]) {
            c.fillStyle = pass;
            const o = pass === colour ? 0 : scale;
            for (let i = 0; i < string.length; i++) {
                const rows = face[string[i]];
                if (!rows) continue;
                for (let r = 0; r < rows.length; r++) {
                    for (let b = 0, bits = rows[r]; b < wide; b++) if (bits & (1 << (wide - 1 - b))) c.fillRect(x + i * step + b * scale + o, y + r * scale + o, scale, scale);
                }
            }
        }
    }
    // Cut a sentence into lines no wider than `wide` pixels.
    function wrap(string, wide, small) {
        const most = Math.max(4, Math.floor((wide + 1) / (small ? 4 : 6))), lines = [];
        let line = '';
        for (const word of String(string).split(' ')) {
            if (line && line.length + 1 + word.length > most) { lines.push(line); line = word; } else line = line ? `${line} ${word}` : word;
        }
        if (line) lines.push(line);
        return lines;
    }

    // ---- Colour ----------------------------------------------------------------------
    const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    const hex = ([r, g, b]) => `#${[r, g, b].map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
    const mix = (a, b, k) => hex(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * k));
    const noise = (x, y) => (((x * 73856093) ^ (y * 19349663) ^ ((x + y) * 83492791)) >>> 0) % 1000 / 1000;

    // What the hour does to things: the turf stays bright under the lamps, the seats and the sky go dark.
    const LIGHTS = {
        day: { field: ['#000000', 0], stand: ['#000000', 0], sky: ['#5aa9ee', '#8cc8f6', '#bfe3fa'] },
        dusk: { field: ['#40204a', 0.14], stand: ['#2a1c44', 0.34], sky: ['#3a3470', '#b0597a', '#f2a65a'] },
        night: { field: ['#0c1440', 0.2], stand: ['#080c26', 0.55], sky: ['#070a1c', '#0e1430', '#1a2148'] },
    };
    const WALLS = ['#1f5a3a', '#243a6b', '#7a3b2a', '#2f4a4a', '#3a3a4a', '#5a2f4a', '#2a5a5a', '#4a3a22'];

    // ---- The layout: where the field sits in the picture -----------------------------
    // bw × bh is the picture; `inset` the rows at the bottom to keep clear.
    function layout(bw, bh, inset, park) {
        const portrait = bh > bw * 1.15, cards = portrait ? 84 : 0, ticker = portrait ? 20 : 13;
        const homeY = bh - inset - cards - ticker - 16, depth = (park.cf + 36) * KY;
        const s = Math.min(1.1, Math.max(0.4, Math.min((homeY - 46) / depth, bw / 2 / 132)));
        const top = Math.round(homeY - depth * s), fw = portrait ? Math.max(bw, Math.ceil(600 * s)) : bw;
        return {
            bw, bh, inset, portrait, s, homeY, top, fw, cards, ticker, pan: (fw - bw) / 2,
            // The scoreboard stands behind centre field; where the picture is too narrow for it and the
            // corner captions side by side (an upright phone, which also pans), it is a panel fixed at the top.
            board: bw < 400 ? { w: 132, h: 31, x: Math.round(bw / 2) - 66, y: 4, fixed: true } : { w: 132, h: 31, x: Math.round(fw / 2) - 66, y: top - 40 },
            tickerY: bh - inset - ticker, cardsY: bh - inset - ticker - cards,
        };
    }
    // Feet to pixels of the baked park (subtract `pan` and the camera for the screen).
    const px = (G, x) => G.fw / 2 + x * G.s;
    const py = (G, y, z = 0) => G.homeY - y * G.s * KY - z * G.s * KZ;

    function canvas(w, h) {
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(w));
        cv.height = Math.max(1, Math.round(h));
        return cv;
    }

    // ---- The sky and what is beyond the fence -----------------------------------------
    function sky(c, G, light, park, random) {
        const bands = LIGHTS[light].sky, H = G.top, W = G.fw;
        for (let y = 0; y <= H; y++) {
            const q = y / Math.max(1, H) * 2, i = Math.min(1, Math.floor(q)), k = q - i;
            // Three flat bands, each stippled into the next.
            for (let x = 0; x < W; x += 2) {
                c.fillStyle = (k > 0.55 && ((x >> 1) + y) % 2 === 0 && k > 0.55 + 0.45 * noise(x, y)) || k > 0.97 ? bands[i + 1] : bands[i];
                c.fillRect(x, y, 2, 1);
            }
        }
        if (light === 'night') {
            for (let i = 0; i < W * H / 90; i++) { c.fillStyle = random() < 0.2 ? '#fff6c8' : '#9fb0e8'; c.fillRect(Math.floor(random() * W), Math.floor(random() * H * 0.9), 1, 1); }
            const mx = Math.round(W * 0.8), my = Math.round(Math.max(8, H * 0.22));
            c.fillStyle = '#f4f0d0'; c.fillRect(mx - 3, my - 4, 6, 8); c.fillRect(mx - 4, my - 3, 8, 6);
            c.fillStyle = bands[0]; c.fillRect(mx - 1, my - 4, 4, 6); c.fillRect(mx, my - 5, 4, 7);
        } else {
            const sx = Math.round(W * (light === 'dusk' ? 0.16 : 0.78)), sy = Math.round(light === 'dusk' ? H - 9 : Math.max(8, H * 0.2));
            c.fillStyle = light === 'dusk' ? '#ffd27a' : '#fff4b8'; c.fillRect(sx - 3, sy - 5, 6, 10); c.fillRect(sx - 5, sy - 3, 10, 6); c.fillRect(sx - 4, sy - 4, 8, 8);
            for (let i = 0; i < Math.max(3, W / 70); i++) {
                const x = Math.floor(random() * W), y = 3 + Math.floor(random() * Math.max(4, H * 0.55)), w = 10 + Math.floor(random() * 14);
                c.fillStyle = light === 'dusk' ? '#f6b7a0' : '#ffffff';
                c.fillRect(x, y, w, 3); c.fillRect(x + 3, y - 2, w - 7, 2); c.fillRect(x + 2, y + 3, w - 5, 1);
                c.fillStyle = light === 'dusk' ? '#d98a8a' : '#d8ecfa';
                c.fillRect(x + 1, y + 3, w - 3, 1);
            }
        }
        // The country round about, along the horizon.
        const dim = (colour) => mix(colour, LIGHTS[light].stand[0], LIGHTS[light].stand[1] * 0.9), kind = park.beyond;
        const ridge = (colour, base, tall, wave, jag = 0) => {
            c.fillStyle = dim(colour);
            for (let x = 0; x < W; x++) {
                const h = Math.round(base + tall * (0.5 + 0.5 * Math.sin(x / wave + base)) + jag * noise(x, base));
                c.fillRect(x, H - h, 1, h);
            }
        };
        if (kind === 'sea' || kind === 'marsh') {
            c.fillStyle = dim(kind === 'sea' ? '#2f6fb0' : '#4f7f8a'); c.fillRect(0, H - 9, W, 9);
            for (let i = 0; i < W / 9; i++) { c.fillStyle = dim('#bfe3fa'); c.fillRect(Math.floor(random() * W), H - 1 - Math.floor(random() * 8), 2, 1); }
            for (let i = 0; i < 3; i++) {
                const x = Math.floor(W * (0.12 + 0.76 * random()));
                if (kind === 'sea') { c.fillStyle = dim('#f4f1e6'); c.fillRect(x, H - 13, 1, 6); c.fillRect(x + 1, H - 11, 2, 4); c.fillRect(x + 3, H - 9, 1, 2); c.fillStyle = dim('#7a3b2a'); c.fillRect(x - 2, H - 7, 7, 2); }
                else for (let r = 0; r < 9; r++) { c.fillStyle = dim('#6f8f3a'); c.fillRect(x + r * 2, H - 10 - (r % 3), 1, 6 + (r % 3)); }
            }
        } else if (kind === 'hills' || kind === 'farm') {
            ridge('#5f9a54', 5, 9, 37);
            ridge('#3f8048', 2, 7, 23);
            if (kind === 'farm') for (let i = 0; i < 4; i++) {
                const x = Math.floor(W * (0.08 + 0.84 * random()));
                c.fillStyle = dim('#b0402f'); c.fillRect(x, H - 8, 7, 5); c.fillStyle = dim('#f4f1e6'); c.fillRect(x + 3, H - 6, 1, 3); c.fillStyle = dim('#c8c8d0'); c.fillRect(x + 8, H - 11, 3, 8);
            }
        } else if (kind === 'woods') {
            ridge('#2f6a40', 6, 3, 50, 6);
            ridge('#1f5030', 2, 2, 31, 5);
        } else if (kind === 'peaks') {
            for (let i = 0; i < W / 26 + 1; i++) {
                const x = Math.floor(i * 26 + random() * 14), h = 10 + Math.floor(random() * 12);
                for (let r = 0; r < h; r++) { c.fillStyle = dim(r < h * 0.3 ? '#f1f4f8' : '#6a7390'); c.fillRect(x - r, H - h + r, r * 2 + 1, 1); }
            }
        } else {
            // A town, or the works: boxes with windows, and a few chimneys.
            for (let x = 0; x < W;) {
                const w = 5 + Math.floor(random() * 8), h = 4 + Math.floor(random() * (kind === 'works' ? 9 : 7));
                c.fillStyle = dim(kind === 'works' ? pick(['#6a5a56', '#7a6a60', '#59504e'], random) : pick(['#b98a6a', '#a0705a', '#c8a888', '#8a6a7a'], random));
                c.fillRect(x, H - h, w, h);
                c.fillStyle = light === 'day' ? dim('#3a4a6a') : '#ffd27a';
                for (let wy = H - h + 1; wy < H - 1; wy += 3) for (let wx = x + 1; wx < x + w - 1; wx += 2) if (random() < 0.6) c.fillRect(wx, wy, 1, 1);
                if (kind === 'works' && random() < 0.35) { c.fillStyle = dim('#59504e'); c.fillRect(x + 1, H - h - 7, 2, 7); c.fillStyle = dim('#d8d8e0'); c.fillRect(x, H - h - 10, 3, 2); c.fillRect(x + 2, H - h - 13, 4, 2); }
                x += w + Math.floor(random() * 3);
            }
        }
    }
    const pick = (list, random) => list[Math.floor(random() * list.length)];

    // ---- The park ----------------------------------------------------------------------
    // Returns { field, cheer, lamps, rim, dugouts }: the bake, the crowd on
    // its feet (drawn over it when they are), where the lamps are, the row
    // the hot-dog seller walks, and where each club sits.
    function park(G, home, away, light, density, random) {
        const p = home.park, field = canvas(G.fw, G.bh), c = field.getContext('2d'), cheer = canvas(G.fw, G.bh), cc = cheer.getContext('2d');
        const W = G.fw, H = G.bh, s = G.s, cx = W / 2, tone = LIGHTS[light];
        sky(c, G, light, p, random);
        const shade = (colour, zone) => mix(colour, tone[zone][0], tone[zone][1]);
        const P = {
            g1: shade('#44a04c', 'field'), g2: shade('#3a9244', 'field'), g3: shade('#4fae56', 'field'), dirt: shade('#c9935b', 'field'), dirt2: shade('#b98250', 'field'), track: shade('#b58a5c', 'field'),
            line: shade('#f4f1e6', 'field'), seat1: shade(mix(home.colours[0], '#4a5060', 0.62), 'stand'), seat2: shade('#565c6c', 'stand'), aisle: shade('#8d929e', 'stand'), walk: shade('#a3a7b0', 'stand'),
            roof: shade('#2c3040', 'stand'), dug: shade('#1c1f28', 'stand'), rail: shade('#d8d8de', 'stand'),
        };
        const seats = new Uint8Array(W * H);          // 1 where a fan could sit
        const zoneOf = (x, y) => {
            const r = Math.hypot(x, y), bearing = L.bearingOf(x, y), out = r - L.edgeAt(p, bearing), fair = Math.abs(bearing) <= 45;
            if (out > 0) {
                // The dugouts, let into the stands beside each baseline.
                const along = (Math.abs(x) + y) * 0.7071, off = (Math.abs(x) - y) * 0.7071;
                if (along > 22 && along < 74 && off > p.foul && off < p.foul + 11) return off < p.foul + 2.5 ? (x > 0 ? 'homeDug' : 'awayDug') : 'dug';
                if (out < 3 && !fair) return 'rail';
                if (out > 150) return 'roof';
                if (out > 44 && out < 51) return 'walk';
                const row = Math.floor(out / 4.2), wedge = Math.floor((bearing + 180) / 11);
                if (Math.abs((bearing + 180) % 22 - 11) < 0.9 && out > 6) return 'aisle';
                return (wedge + (out > 51 ? 1 : 0)) % 2 ? (row % 2 ? 'seatA' : 'seatA2') : (row % 2 ? 'seatB' : 'seatB2');
            }
            if (Math.hypot(x, y - 60.5) < 9) return 'mound';
            if (r < 13) return 'dirt';
            if (fair && out > -15) return 'track';
            if (!fair && out > -5) return 'track';
            if (Math.hypot(Math.abs(x) - 42, y - 2) < 6) return 'dirt';
            const skin = Math.hypot(x, y - 60.5) < 95 && y > Math.abs(x) - 4;
            if (skin && Math.abs(x) + Math.abs(y - 63.64) > 56) return 'dirt';
            if (!fair) return 'foul';
            // The mower's pattern.
            const band = p.mow === 'rings' ? Math.floor(r / 26) : p.mow === 'fan' ? Math.floor((bearing + 90) / 7.5) : p.mow === 'checks' ? Math.floor((x + y) / 30) + Math.floor((y - x + 900) / 30) : Math.floor((x + 600) / 24);
            return band % 2 ? 'g1' : 'g2';
        };
        const colourOf = (zone, x, y) => {
            const n = noise(x, y);
            switch (zone) {
                case 'g1': return n < 0.05 ? P.g3 : P.g1;
                case 'g2': return n < 0.05 ? P.g1 : P.g2;
                case 'foul': return n < 0.04 ? P.g1 : P.g2;
                case 'dirt': case 'mound': return n < 0.08 ? P.dirt2 : P.dirt;
                case 'track': return n < 0.1 ? P.dirt2 : P.track;
                case 'seatA': return P.seat1;
                case 'seatA2': return mix(P.seat1, '#000000', 0.14);
                case 'seatB': return P.seat2;
                case 'seatB2': return mix(P.seat2, '#000000', 0.14);
                case 'aisle': return P.aisle;
                case 'walk': return P.walk;
                case 'rail': return P.rail;
                case 'homeDug': return shade(home.colours[0], 'stand');
                case 'awayDug': return shade(away.colours[0], 'stand');
                case 'dug': return P.dug;
                default: return P.roof;
            }
        };
        const cache = {};
        for (let y = G.top; y < H; y++) {
            let run = null, start = 0;
            for (let x = 0; x <= W; x++) {
                let colour = null;
                if (x < W) {
                    const wx = (x + 0.5 - cx) / s, wy = (G.homeY - y - 0.5) / (s * KY);
                    let zone = zoneOf(wx, wy);
                    if (y <= G.top + 3 && zone !== 'roof') zone = y === G.top ? 'rail' : 'walk';      // the rim, where the hot dogs are sold
                    else if (zone.startsWith('seat')) seats[y * W + x] = 1;
                    colour = zone.startsWith('seat') || zone === 'aisle' || zone === 'walk' || zone === 'rail' || zone === 'roof' || zone === 'dug' || zone.endsWith('Dug') ? (cache[zone] ||= colourOf(zone, x, y)) : colourOf(zone, x, y);
                }
                if (colour !== run) {
                    if (run) { c.fillStyle = run; c.fillRect(start, y, x - start, 1); }
                    run = colour;
                    start = x;
                }
            }
        }
        // The foul lines, the bases, the rubber.
        c.fillStyle = P.line;
        for (const sign of [-1, 1]) {
            const far = (sign < 0 ? p.lf : p.rf) - 1;
            for (let d = 13; d < far; d += 0.6) c.fillRect(Math.round(px(G, sign * d * 0.7071)), Math.round(py(G, d * 0.7071)), 1, 1);
        }
        for (const [bx, by] of L.BASES.slice(0, 4)) c.fillRect(Math.round(px(G, bx)) - 1, Math.round(py(G, by)) - 1, 2, 2);
        c.fillRect(Math.round(px(G, 0)) - 1, Math.round(py(G, 60.5)), 2, 1);
        // The fence, standing up: each column of it from its foot to its height.
        const wall = shade(WALLS[home.id % WALLS.length], 'field'), cap = shade('#f2d24a', 'field');
        for (let bearing = -45; bearing <= 45; bearing += 0.2) {
            const edge = L.edgeAt(p, bearing), x = Math.round(px(G, edge * Math.sin(bearing * RAD))), y = Math.round(py(G, edge * Math.cos(bearing * RAD)));
            const h = Math.max(2, Math.round(L.wallHeight(p, bearing) * s * KZ));
            c.fillStyle = wall; c.fillRect(x, y - h, 1, h);
            c.fillStyle = cap; c.fillRect(x, y - h, 1, 1);
        }
        for (const sign of [-1, 1]) {
            const edge = sign < 0 ? p.lf : p.rf, x = Math.round(px(G, sign * edge * 0.7071)), y = Math.round(py(G, edge * 0.7071));
            c.fillStyle = cap; c.fillRect(x, y - Math.round(40 * s * KZ), 1, Math.round(40 * s * KZ));
        }
        // The crowd: a head and a shirt each; on their feet in the second bake.
        const shirts = [home.colours[0], home.colours[0], home.colours[1], away.colours[0], '#e8e4d4', '#d8a04a', '#6aa0d8', '#c85a5a', '#7ac87a', '#e8e4d4'].map(k => shade(k, 'stand'));
        const skins = ['#f0c8a0', '#d8a878', '#a87850', '#7a5236'].map(k => shade(k, 'stand')), full = Math.min(0.96, (0.55 + 0.4 * random()) * (0.5 + 0.5 * density));
        for (let y = G.top + 5; y < H - 2; y += 3) {
            for (let x = 1 + (Math.floor(y / 3) % 2); x < W - 1; x += 3) {
                if (!seats[y * W + x] || !seats[(y + 1) * W + x] || noise(x * 7, y * 13) > full) continue;
                const skin = skins[Math.floor(noise(y, x) * 4)], shirt = shirts[Math.floor(noise(x + 9, y + 3) * shirts.length)];
                c.fillStyle = skin; c.fillRect(x, y, 1, 1);
                c.fillStyle = shirt; c.fillRect(x, y + 1, 1, 1);
                cc.fillStyle = skin; cc.fillRect(x, y - 1, 1, 1); cc.fillRect(x - 1, y - 2, 1, 1); cc.fillRect(x + 1, y - 2, 1, 1);
                cc.fillStyle = shirt; cc.fillRect(x, y, 1, 2);
            }
        }
        // The scoreboard on its legs behind centre field, and the light towers.
        const b = G.board;
        if (!b.fixed) {
            c.fillStyle = shade('#3a3f4c', 'stand'); c.fillRect(b.x + 8, b.y + b.h, 3, G.top - b.y - b.h + 2); c.fillRect(b.x + b.w - 11, b.y + b.h, 3, G.top - b.y - b.h + 2);
            c.fillStyle = shade('#20242e', 'stand'); c.fillRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
            c.fillStyle = '#0c2a1c'; c.fillRect(b.x, b.y, b.w, b.h);
            c.fillStyle = shade(home.colours[0], 'stand'); c.fillRect(b.x - 2, b.y - 5, b.w + 4, 3);
        }
        const lamps = [];
        // Two towers beside the scoreboard and two out at the corners (lower, to stand clear of the captions).
        for (const k of [-2, -1, 1, 2]) {
            const x = Math.round(cx + (Math.abs(k) === 1 ? Math.sign(k) * (b.w / 2 + 16) : Math.sign(k) * (G.bw / 2 - 9))), y = Math.abs(k) === 1 ? Math.max(3, G.top - 44) : G.top - 13;
            c.fillStyle = shade('#6a7080', 'stand'); c.fillRect(x, y + 5, 1, G.top - y - 3); c.fillRect(x - 5, y, 11, 6);
            lamps.push({ x: x - 4, y: y + 1 });
        }
        const bench = sign => Array.from({ length: 5 }, (_, i) => { const along = 30 + i * 9, off = p.foul + 6; return [sign * (along + off) * 0.7071, (along - off) * 0.7071]; });
        return { field, cheer, lamps, rim: G.top + 2, dugouts: [bench(-1), bench(1)] };
    }

    // ---- The little men ----------------------------------------------------------------
    const GLOVE = '#8a5a2c', WOOD = '#e0bc74', SHOE = '#22222a';
    const SKINS = ['#f0c8a0', '#d8a878', '#a87850', '#7a5236'];
    // A club's two strips: the home side in white, the visitors in their colour.
    const kit = (team, home) => (home ? { shirt: '#f6f3e8', pants: '#e6e1d0', cap: team.colours[0], sock: team.colours[0], trim: team.colours[0] }
        : { shirt: team.colours[0], pants: '#b4b8c0', cap: team.colours[0], sock: team.colours[1], trim: team.colours[1] });
    const UMPIRE = { shirt: '#1d2233', pants: '#3a3f50', cap: '#1d2233', sock: '#1d2233', trim: '#1d2233' };

    // One man, his feet at (x, y). o: { kit, skin, pose, t (seconds, for his
    // stride), face (-1 left, 1 right), back (seen from behind), bat }.
    function man(c, x, y, o) {
        const { kit: k, pose = 'stand', t = 0, face = 1, back = false } = o, skin = SKINS[o.skin || 0];
        x = Math.round(x); y = Math.round(y);
        const r = (colour, dx, dy, w = 1, h = 1) => { c.fillStyle = colour; c.fillRect(x + dx, y + dy, w, h); };
        if (pose === 'dive' || pose === 'slide') {
            // Laid out along the ground, head first for a dive and feet first for a slide.
            const f = pose === 'dive' ? face : -face, u = (colour, from, to, dy, h) => r(colour, f > 0 ? from : -to, dy, to - from + 1, h);
            u(SHOE, -6, -5, -2, 2); u(k.pants, -4, -2, -3, 3); u(k.shirt, -1, 2, -3, 3); u(skin, 3, 4, -3, 2); u(k.cap, 4, 5, -4, 2);
            if (pose === 'dive') { u(skin, 5, 6, -2, 1); u(GLOVE, 7, 8, -3, 2); } else u(skin, 3, 3, -5, 2);
            return;
        }
        const step = Math.floor(t * 9) % 2, running = pose === 'run', low = pose === 'ready' || pose === 'squat' ? 1 : 0;
        const hop = pose === 'cheer' ? -Math.round(Math.abs(Math.sin(t * 9)) * 2) : running && step ? -1 : 0;
        if (pose === 'sit') { r(k.shirt, -1, -5, 3, 3); r(skin, -1, -7, 3, 2); r(k.cap, -1, -9, 3, 2); return; }
        // Legs.
        if (pose === 'squat') { r(k.pants, -2, -3, 5, 2); r(SHOE, -2, -1); r(SHOE, 2, -1); } else {
            const a = running ? (step ? -2 : -1) : low ? -2 : -1, b = running ? (step ? 1 : 2) : low ? 2 : 1;
            r(k.pants, -1, -4 + hop, 3, 2);
            r(k.sock, a, -2 + hop); r(k.sock, b, -2 + hop);
            r(SHOE, a, -1 + hop); r(SHOE, b, -1 + hop);
            if (pose === 'windup' && t < 0.55) { r(k.pants, face, -4, 2, 1); r(k.pants, b === 1 ? 1 : b, -3 + hop, 1, 1); }
        }
        const top = hop + low - (pose === 'squat' ? -2 : 0);
        // Body, head, cap.
        r(k.shirt, -1, -8 + top, 3, 4);
        if (back) r(k.trim, 0, -7 + top); else r(k.trim, -1, -6 + top, 3, 1);
        r(back ? k.cap : skin, -1, -10 + top, 3, 1);
        r(skin, -1, -9 + top, 3, 1);
        r(k.cap, -1, -12 + top, 3, 2);
        if (!back) r(k.cap, face * 2, -11 + top);
        // Arms, and what is in them.
        const arm = (dx, dy, colour = skin) => r(colour, dx, dy + top);
        if (pose === 'cheer') { arm(-2, -10); arm(-2, -9, k.shirt); arm(2, -10); arm(2, -9, k.shirt); } else if (pose === 'catch') {
            arm(-2 * face, -9, k.shirt); arm(-2 * face, -10); r(GLOVE, -2 * face - (face > 0 ? 1 : 0), -12 + top, 2, 2);
            arm(2 * face, -7, k.shirt); arm(2 * face, -6);
        } else if (pose === 'throw') {
            arm(2 * face, -9, k.shirt); arm(3 * face, -10); arm(-2 * face, -7, k.shirt); r(GLOVE, -2 * face, -6 + top);
        } else if (pose === 'windup') {
            if (t < 0.55) { arm(-1, -9); arm(1, -9); r(GLOVE, 0, -10 + top); } else { arm(-2 * face, -8, k.shirt); arm(-3 * face, -9); arm(2 * face, -7, k.shirt); r(GLOVE, 2 * face, -6 + top); }
        } else if (pose === 'ready') {
            arm(-2, -7, k.shirt); arm(2, -7, k.shirt); arm(3 * face, -6); r(GLOVE, -3 * face, -6 + top);
        } else if (pose === 'squat') {
            arm(-2, -7, k.shirt); arm(2, -7, k.shirt); r(GLOVE, 0, -8 + top, 2, 2);
        } else if (pose === 'punch') {
            arm(2, -8, k.shirt); arm(3, -8); arm(4, -9); arm(-2, -7, k.shirt);
        } else if (pose === 'bat' || pose === 'swing') {
            arm(-2, -7, k.shirt); arm(2, -7, k.shirt);
            const q = pose === 'swing' ? Math.min(1, t) : -1;
            c.fillStyle = WOOD;
            if (q < 0) for (let i = 0; i < 5; i++) c.fillRect(x - face * (2 + (i >> 1)), y - 9 - i + top, 1, 1);                 // on the shoulder
            else if (q < 0.4) c.fillRect(x + (face > 0 ? -7 : 2), y - 7 + top, 6, 1);                                              // back
            else if (q < 0.7) for (let i = 0; i < 6; i++) c.fillRect(x + face * (2 + i), y - 8 - (i >> 1) + top, 1, 1);          // through the ball
            else for (let i = 0; i < 5; i++) c.fillRect(x + face * (2 + (i >> 1)), y - 9 - i + top, 1, 1);                       // round
        } else {
            const swing = running && step ? 1 : 0;
            arm(-2, -8 + swing, k.shirt); arm(-2, -7 + swing, k.shirt); arm(-2, -6 + swing);
            arm(2, -8 + 1 - swing, k.shirt); arm(2, -7 + 1 - swing, k.shirt); arm(2, -6 + 1 - swing);
            if (o.glove) r(GLOVE, -2 * face, -5 + top);
            if (o.tray) { r('#f4f1e6', face * 2, -7 + top, 4, 2); r('#d8442f', face * 2, -8 + top, 4, 1); }
        }
    }

    // The mascot: round, furry and in the home colours, with too much enthusiasm.
    function mascot(c, x, y, team, t, glad) {
        x = Math.round(x); y = Math.round(y) - (glad ? Math.round(Math.abs(Math.sin(t * 8)) * 3) : Math.floor(t * 6) % 2);
        const r = (colour, dx, dy, w = 1, h = 1) => { c.fillStyle = colour; c.fillRect(x + dx, y + dy, w, h); }, [body, trim] = team.colours;
        r(body, -3, -12, 7, 1); r(body, -4, -11, 9, 8); r(body, -3, -3, 7, 1);
        r(trim, -2, -7, 5, 4);
        r('#ffffff', -3, -10, 2, 2); r('#ffffff', 1, -10, 2, 2); r('#16161c', -2, -9); r('#16161c', 2, -9);
        r('#16161c', -1, -6, 3, 1);
        r(SHOE, -3, -2, 2, 2); r(SHOE, 1, -2, 2, 2);
        const up = glad || Math.floor(t * 4) % 2;
        r(body, -6, up ? -12 : -8, 2, 2); r(body, 5, up && !glad ? -8 : -12 + (glad ? 0 : 4) - (up ? 4 : 0), 2, 2);
        r(body, -3, -14, 2, 2); r(body, 2, -14, 2, 2);                 // ears, of some kind
    }

    // The Golden Gravy Boat, `k` pixels to the pixel.
    function trophy(c, x, y, k = 1) {
        const r = (colour, dx, dy, w, h) => { c.fillStyle = colour; c.fillRect(Math.round(x + dx * k), Math.round(y + dy * k), w * k, h * k); };
        const gold = '#f2c744', deep = '#b8860b', shine = '#fff2b0';
        r(deep, -5, -2, 10, 2); r(gold, -4, -4, 8, 2); r(deep, -1, -6, 2, 2);                  // the foot
        r(gold, -7, -12, 13, 6); r(gold, -6, -6, 11, 1); r(gold, -9, -13, 3, 2); r(gold, -11, -14, 3, 2);    // the boat and its spout
        r(deep, -7, -7, 13, 1); r(deep, -6, -13, 12, 1);
        r(shine, -6, -11, 2, 3); r(shine, -10, -13, 1, 1);
        r(gold, 6, -12, 3, 1); r(gold, 8, -11, 1, 3); r(gold, 6, -8, 3, 1);                    // the handle
        r('#7a4a22', -5, -13, 10, 1);                                                          // the gravy
    }

    // A box for words: dark glass with a light edge, and a coloured bar if it has a title.
    function box(c, x, y, w, h, title, accent = '#c8343a') {
        c.fillStyle = 'rgba(8, 12, 28, 0.86)'; c.fillRect(x, y, w, h);
        c.fillStyle = '#e8e4d0'; c.fillRect(x, y, w, 1); c.fillRect(x, y + h - 1, w, 1); c.fillRect(x, y, 1, h); c.fillRect(x + w - 1, y, 1, h);
        if (title) { c.fillStyle = accent; c.fillRect(x + 1, y + 1, w - 2, 9); text(c, title, x + 4, y + 2, '#ffffff'); }
    }

    return { KY, KZ, SKINS, UMPIRE, width, text, wrap, mix, layout, px, py, canvas, park, kit, man, mascot, trophy, box, noise };
})();
