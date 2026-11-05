// World Clock's departures board: a split-flap board, a row per city with
// its name, local time, weekday, UTC offset and a sun or moon. A flap
// flips when its character changes, stepping through the digits between
// (a minute ticks over as one flip, 9 to 0 as one), a word through a
// couple of letters; a new board flips in from blank, left to right.
//
// Cost: the board and its empty tiles are baked per resize; each character
// is a baked tile, so a still board is a copy and a drawImage per tile,
// once a second. Only flaps in motion ask for frames.

const WORLD_CLOCK_FLIP = 0.11;     // seconds per flip
const WORLD_CLOCK_GLYPHS = { day: '', twilight: '', night: '' };
const WORLD_CLOCK_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

class WorldClockBoard {
    constructor(app) {
        this.app = app;
        this.flaps = [];       // [row][cell] → { shown, to, t, queue, delay }
        this.tiles = new Map();
        this.plan = null;
    }

    resize() { this.plan = null; }

    // Another view is showing: let the board and its tiles go (a new board
    // flips in when it's back).
    release() {
        this.plan = this.bg = null;
        this.tiles.clear();
    }

    // What the board's layout depends on: the rows, and the columns they
    // need now (a city rolling over to tomorrow brings the DAY column, a
    // DST change can widen UTC). Checked every second, so it never goes
    // stale; settings that change neither leave the flaps alone.
    key(infos, narrow) {
        return `${infos.map(i => i.id).join()}|${this.columns(infos, narrow).map(c => `${c.key}:${c.len}`).join()}`;
    }

    // ---- What each row says ---------------------------------------------------------

    rowText(info, columns) {
        const config = this.app.config;
        const pad = (s, n, right = false) => right ? s.slice(-n).padStart(n) : s.slice(0, n).padEnd(n);
        const plain = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
        const t = info.time, two = n => String(n).padStart(2, '0');
        const is24 = WP.clockface.uses24({ hour12: config.hour12 }, this.app.locale);
        let time = is24 ? `${two(t.hours)}:${two(t.minutes)}` : `${String(t.hours % 12 || 12).padStart(2)}:${two(t.minutes)}`;
        if (config.seconds) time += `:${two(t.seconds)}`;
        if (!is24) time += t.hours < 12 ? ' AM' : ' PM';
        const out = {};
        for (const col of columns) {
            if (col.key === 'city') out.city = pad(plain(info.name), col.len);
            if (col.key === 'time') out.time = pad(time, col.len, true);
            if (col.key === 'day') out.day = pad(plain(info.weekday).replace(/\./g, ''), col.len);
            if (col.key === 'utc') out.utc = pad(info.offset === 'UTC' ? '±0' : info.offset.slice(3), col.len);
            if (col.key === 'sky') out.sky = WORLD_CLOCK_GLYPHS[info.phase];
        }
        return columns.map(col => out[col.key]).join('');
    }

    // ---- Layout ----------------------------------------------------------------------

    columns(infos, narrow) {
        const config = this.app.config, is24 = WP.clockface.uses24({ hour12: config.hour12 }, this.app.locale);
        const longest = Math.max(6, ...infos.map(i => i.name.length));
        const cols = [
            { key: 'city', label: 'CITY', len: Math.min(narrow > 1 ? 10 : 14, longest) },
            { key: 'time', label: 'LOCAL TIME', len: (is24 ? 5 : 8) + (config.seconds ? 3 : 0) },
            { key: 'day', label: 'DAY', len: 3 },
            { key: 'utc', label: 'UTC', len: Math.max(2, ...infos.map(i => i.offset === 'UTC' ? 2 : i.offset.length - 3)) },
            { key: 'sky', label: '', len: 1 },
        ];
        return cols.filter(c => !(c.key === 'day' && (narrow > 0 || !config.showDate && !infos.some(i => i.dayDelta)))
            && !(c.key === 'utc' && (narrow > 1 || !config.showOffset)));
    }

    layout(infos) {
        const app = this.app, { safe, k, dpr } = app;
        const aw = (safe.right - safe.left) * 0.94, ah = (safe.bottom - safe.top) * 0.9, rows = Math.max(1, infos.length);
        let columns, tw, narrow;
        for (narrow = 0; narrow < 3; narrow++) {
            columns = this.columns(infos, narrow);
            const units = 1.8 + columns.reduce((s, c) => s + c.len + (c.len - 1) * 0.1, 0) + 0.7 * (columns.length - 1);
            const tall = 1.8 + 1.7 + 1.1 + rows * 1.45 + (rows - 1) * 1.45 * 0.28;
            tw = Math.min(aw / units, ah / tall, 46 * k);
            if (tw >= 14 * Math.min(1, k)) break;
        }
        narrow = Math.min(narrow, 2);
        const th = tw * 1.45, gap = tw * 0.1, cg = tw * 0.7, rg = th * 0.28, pad = tw * 0.9;
        const width = pad * 2 + columns.reduce((s, c) => s + c.len * tw + (c.len - 1) * gap, 0) + cg * (columns.length - 1);
        const height = pad * 2 + tw * 1.7 + tw * 1.1 + rows * th + (rows - 1) * rg;
        const x0 = safe.left + (safe.right - safe.left - width) / 2, y0 = safe.top + (safe.bottom - safe.top - height) / 2;
        // Every tile's place, row by row.
        const cells = [];
        const colX = [];
        let x = x0 + pad;
        for (const c of columns) { colX.push(x); x += c.len * tw + (c.len - 1) * gap + cg; }
        const firstRow = y0 + pad + tw * 1.7 + tw * 1.1;
        for (let r = 0; r < rows; r++) {
            const row = [];
            columns.forEach((c, ci) => { for (let i = 0; i < c.len; i++) row.push({ x: colX[ci] + i * (tw + gap), y: firstRow + r * (th + rg) }); });
            cells.push(row);
        }
        this.plan = { columns, tw, th, gap, cg, rg, pad, x0, y0, width, height, cells, colX, rows: infos.length, narrow };
        this.plan.key = this.key(infos, narrow);
        this.tiles.clear();
        this.drawBoard();
        // A new board flips in from blank.
        const instant = app.host.reducedMotion || app.host.params.thumb;
        this.flaps = cells.map(row => row.map(() => ({ shown: ' ', to: null, t: 0, queue: [], delay: 0 })));
        this.flaps.forEach((row, r) => row.forEach((f, i) => { f.delay = instant ? 0 : 0.15 + i * 0.022 + r * 0.06; }));
    }

    // The board itself: its panel, the title, the column heads, and every
    // tile empty.
    drawBoard() {
        const app = this.app, { W, H, dpr, k } = app, p = this.plan;
        this.bg = WorldClockArt.canvas(W * dpr, H * dpr);
        const g = this.bg.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        const wall = g.createLinearGradient(0, 0, 0, H);
        wall.addColorStop(0, '#0b1626');
        wall.addColorStop(1, '#04080f');
        g.fillStyle = wall;
        g.fillRect(0, 0, W, H);
        // The board's housing.
        g.fillStyle = 'rgba(0,0,0,0.45)';
        WorldClockArt.rounded(g, p.x0 + 2, p.y0 + 6, p.width, p.height, p.tw * 0.5);
        g.fill();
        const body = g.createLinearGradient(0, p.y0, 0, p.y0 + p.height);
        body.addColorStop(0, '#16191e');
        body.addColorStop(1, '#0c0e11');
        g.fillStyle = body;
        WorldClockArt.rounded(g, p.x0, p.y0, p.width, p.height, p.tw * 0.5);
        g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.07)';
        g.lineWidth = 1;
        g.stroke();
        // Title and column heads, in the board's yellow.
        g.fillStyle = '#ffd479';
        g.textBaseline = 'middle';
        g.font = `700 ${p.tw * 0.62}px ${WorldClockArt.SANS}`;
        g.letterSpacing = `${p.tw * 0.12}px`;
        const titleY = p.y0 + p.pad + p.tw * 0.55;
        g.fillText('WORLD CLOCK', p.x0 + p.pad, titleY);
        g.font = `600 ${p.tw * 0.42}px ${WorldClockArt.SANS}`;
        g.fillStyle = 'rgba(255,212,121,0.75)';
        const headY = p.y0 + p.pad + p.tw * 1.7 + p.tw * 0.4;
        p.columns.forEach((c, i) => { if (c.label) g.fillText(c.label, p.colX[i], headY); });
        g.letterSpacing = '0px';
        g.fillStyle = 'rgba(255,212,121,0.25)';
        g.fillRect(p.x0 + p.pad, p.y0 + p.pad + p.tw * 1.25, p.width - 2 * p.pad, Math.max(1, p.tw * 0.04));
        this.titleY = titleY;
        // Empty tiles.
        const blank = this.tile(' ');
        for (const row of p.cells) for (const c of row) g.drawImage(blank, c.x, c.y, p.tw, p.th);
    }

    // One character's tile, baked: two halves, the split, the character.
    tile(ch) {
        if (this.tiles.has(ch)) return this.tiles.get(ch);
        const { dpr } = this.app, p = this.plan;
        const w = p.tw * dpr, h = p.th * dpr, c = WorldClockArt.canvas(w, h), g = c.getContext('2d');
        const r = w * 0.12;
        g.fillStyle = '#25282e';
        WorldClockArt.rounded(g, 0, 0, w, h / 2, r);
        g.fill();
        g.fillRect(0, h / 4, w, h / 4);
        g.fillStyle = '#1e2126';
        WorldClockArt.rounded(g, 0, h / 2, w, h / 2, r);
        g.fill();
        g.fillRect(0, h / 2, w, h / 4);
        const glyph = Object.entries(WORLD_CLOCK_GLYPHS).find(([, v]) => v === ch)?.[0];
        if (glyph) {
            const s = w * 0.86, colour = glyph === 'day' ? '#ffd479' : glyph === 'twilight' ? '#f2a46e' : '#c9d4ea';
            g.drawImage(WorldClockArt.glyph(glyph, s, colour), (w - s) / 2, (h - s) / 2, s, s);
        } else if (ch !== ' ') {
            g.fillStyle = '#f3efe2';
            g.font = `600 ${h * 0.66}px ${WorldClockArt.SANS}`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText(ch, w / 2, h * 0.53);
        }
        // The split, and a little light on the top edge.
        g.fillStyle = '#08090b';
        g.fillRect(0, h / 2 - Math.max(1, dpr * 0.6), w, Math.max(1, dpr * 1.2));
        g.fillStyle = 'rgba(255,255,255,0.06)';
        g.fillRect(r, 0, w - 2 * r, Math.max(1, dpr));
        this.tiles.set(ch, c);
        return c;
    }

    // ---- Flaps -------------------------------------------------------------------------

    // The flips from what a flap shows to `ch`: through the digits between,
    // or a couple of letters for anything else.
    steps(from, ch) {
        if (/\d/.test(from) && /\d/.test(ch)) {
            const out = [];
            for (let d = (+from + 1) % 10; out.length < 9; d = (d + 1) % 10) { out.push(String(d)); if (String(d) === ch) break; }
            return out.slice(-3);
        }
        if (from === ' ' || ch === ' ') return [ch];
        const rand = () => WORLD_CLOCK_LETTERS[Math.floor(Math.random() * 26)];
        return /[A-Z]/.test(ch) ? [rand(), ch] : [ch];
    }

    target(flap, ch) {
        const last = flap.queue.length ? flap.queue[flap.queue.length - 1] : flap.to ?? flap.shown;
        if (last === ch) return;
        if (this.app.host.reducedMotion || this.app.host.params.thumb) { flap.shown = ch; flap.to = null; flap.queue = []; return; }
        flap.queue.push(...this.steps(last, ch));
    }

    update(dt) {
        if (this.app.config.view !== 'board' || !this.plan) return false;
        let busy = false;
        for (const row of this.flaps) {
            for (const f of row) {
                if (f.to === null && !f.queue.length) continue;
                busy = true;
                if (f.delay > 0) { f.delay -= dt; continue; }
                if (f.to === null) { f.to = f.queue.shift(); f.t = 0; }
                f.t += dt / WORLD_CLOCK_FLIP;
                while (f.t >= 1) {
                    f.shown = f.to;
                    f.t -= 1;
                    f.to = f.queue.length ? f.queue.shift() : null;
                    if (f.to === null) { f.t = 0; break; }
                }
            }
        }
        return busy;
    }

    // ---- Drawing -----------------------------------------------------------------------

    draw(g, date) {
        const app = this.app, { dpr } = app, infos = app.infos;
        if (!this.plan || this.plan.key !== this.key(infos, this.plan.narrow)) this.layout(infos);
        const p = this.plan;
        // What every flap should say now.
        infos.forEach((info, r) => {
            const text = [...this.rowText(info, p.columns)];
            this.flaps[r].forEach((f, i) => this.target(f, text[i] ?? ' '));
        });
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.drawImage(this.bg, 0, 0);
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        // The home's date in the title bar, and its row marked.
        const home = infos.find(i => i.home) || infos[0];
        if (home) {
            g.font = `600 ${p.tw * 0.5}px ${WorldClockArt.SANS}`;
            g.fillStyle = 'rgba(255,212,121,0.85)';
            g.textAlign = 'right';
            g.textBaseline = 'middle';
            g.fillText(home.date.toUpperCase(), p.x0 + p.width - p.pad, this.titleY);
            g.textAlign = 'left';
        }
        infos.forEach((info, r) => {
            if (!info.home) return;
            const c = p.cells[r][0];
            g.fillStyle = '#ffd479';
            WorldClockArt.rounded(g, p.x0 + p.pad * 0.3, c.y + p.th * 0.15, p.pad * 0.28, p.th * 0.7, p.pad * 0.14);
            g.fill();
        });
        const { tw, th } = p, half = th / 2, sh = this.plan.th * dpr / 2;
        for (let r = 0; r < p.cells.length; r++) {
            for (let i = 0; i < p.cells[r].length; i++) {
                const f = this.flaps[r][i], c = p.cells[r][i];
                if (f.to === null || f.delay > 0) {
                    if (f.shown !== ' ') g.drawImage(this.tile(f.shown), c.x, c.y, tw, th);
                    continue;
                }
                const old = this.tile(f.shown), next = this.tile(f.to), w = old.width;
                // Behind: the new top, the old bottom. In front: the flap,
                // the old top falling, then the new bottom landing.
                g.drawImage(next, 0, 0, w, sh, c.x, c.y, tw, half);
                g.drawImage(old, 0, sh, w, sh, c.x, c.y + half, tw, half);
                const fold = Math.cos(Math.PI * Math.min(1, f.t));
                if (fold > 0) {
                    const hh = half * fold;
                    g.drawImage(old, 0, 0, w, sh, c.x, c.y + half - hh, tw, hh);
                    g.fillStyle = `rgba(0,0,0,${0.35 * (1 - fold)})`;
                    g.fillRect(c.x, c.y + half - hh, tw, hh);
                } else {
                    const hh = half * -fold;
                    g.drawImage(next, 0, sh, w, sh, c.x, c.y + half, tw, hh);
                    g.fillStyle = `rgba(0,0,0,${0.3 * (1 + fold)})`;
                    g.fillRect(c.x, c.y + half, tw, hh);
                }
            }
        }
        return {
            bottom: p.y0 + p.height, board: { x: p.x0, y: p.y0, w: p.width, h: p.height, tile: tw, columns: p.columns.map(c => c.key) },
            rows: infos.map((info, r) => this.flaps[r].map(f => f.to ?? f.shown).join('')),
            shown: infos.map((info, r) => this.flaps[r].map(f => f.shown).join('')),
        };
    }

    hit(x, y) {
        const p = this.plan;
        if (!p) return null;
        for (let r = 0; r < p.cells.length; r++) {
            const top = p.cells[r][0].y;
            if (y >= top - p.rg / 2 && y <= top + p.th + p.rg / 2 && x >= p.x0 && x <= p.x0 + p.width) return this.app.infos[r]?.id || null;
        }
        return null;
    }
}
