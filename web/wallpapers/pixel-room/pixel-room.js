// Pixel Room (SPEC §10.9): a cozy room in pixel art. A cat asleep on the
// bed, a mug steaming on the desk, a record turning, a plant, a lamp, and a
// window onto the real time of day.
//
// Drawing: everything happens on a buffer of about 320×180 art pixels
// (180×320 in portrait), which is the canvas itself. CSS shows it at a
// whole number of device pixels per art pixel, with image-rendering:
// pixelated, so nothing is ever blurred or uneven: the buffer is sized to
// cover the screen at that scale, and the room's edges (more wall, more
// floor) absorb any difference in shape.
//
// Light is palette work, as in old games: the room is drawn once at day
// light, then every pixel is remapped to a darker, dimmer or lamp-warm
// palette colour from a light map (lamp, window, time of day), dithered
// with a Bayer matrix where levels meet. That lit layer is rebuilt only
// when the light changes; sprites carry all four light levels.
//
// Ticks: pixel animation reads best at 8–12 fps, so it ticks at 10 on
// every tier and the stage idles in between (host.idleUntil).

const PIXEL_ROOM_TICK_MS = 100;
// Light levels: 0 night, 1 dim (dawn, dusk, overcast), 2 day, 3 lamp-lit.
const PIXEL_ROOM_LEVELS = 4;
const PIXEL_ROOM_BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);

// Where everything stands, in art pixels from the safe area's top left.
const PIXEL_ROOM_LAYOUTS = {
    landscape: {
        size: [320, 180], floor: 128, wainscot: 98,
        window: { x: 118, y: 22, w: 68, h: 64 },
        cabinet: { x: 114, y: 104, w: 76 },
        turntable: { x: 120, y: 93 },
        plant: { x: 196, y: 128 },
        bed: { x: 222, y: 104, w: 96, head: 'right' },
        desk: { x: 6, y: 96, w: 96 },
        chair: { x: 42, y: 101 },
        lamp: { x: 10, y: 79 },
        mug: { x: 76, y: 88 },
        books: { x: 50, y: 96 },
        shelf: { x: 12, y: 52, w: 46 },
        pothos: { x: 44, y: 41 },
        clock: { x: 64, y: 22 },
        calendar: { x: 86, y: 44 },
        picture: { x: 250, y: 42 },
        lights: { x0: 222, x1: 318, y: 22, sag: 8 },
        rug: { x: 104, y: 142, w: 128, h: 26 },
        cat: { bed: [258, 106], floorY: 152, bedEdge: 236, sill: [172, 104], sillEdge: 178 },
    },
    portrait: {
        size: [180, 320], floor: 196, wainscot: 160,
        window: { x: 46, y: 30, w: 88, h: 96 },
        cabinet: { x: 42, y: 174, w: 96 },
        turntable: { x: 50, y: 163 },
        plant: { x: 156, y: 196 },
        bed: { x: 2, y: 270, w: 106, head: 'left' },
        desk: { x: 112, y: 248, w: 66 },
        chair: null,
        lamp: { x: 114, y: 231 },
        mug: { x: 164, y: 240 },
        books: { x: 136, y: 248 },
        shelf: { x: 4, y: 96, w: 32 },
        pothos: { x: 22, y: 85 },
        clock: { x: 158, y: 38 },
        calendar: { x: 12, y: 42 },
        picture: { x: 152, y: 62 },
        lights: { x0: 18, x1: 162, y: 10, sag: 6 },
        rug: { x: 30, y: 206, w: 118, h: 22 },
        cat: { bed: [62, 272], floorY: 238, bedEdge: 64, sill: [122, 174], sillEdge: 112 },
    },
};

class PixelRoomAnimationManager {
    constructor(host) {
        this.host = host;
        this.config = WP.settings.load();
        this.canvas = null;
        this.ctx = null;
        this.running = false;
        this.frameId = null;
        this.nextTick = 0;
        this.ticks = 0;
        this.lampManual = null;     // { on, auto } after a tap, until the automatic state changes
        this.palette = this.buildPalette();
    }

    // ---- Lifecycle -------------------------------------------------------------

    start() {
        if (this.running) return;
        this.running = true;
        const canvas = this.canvas = document.createElement('canvas');
        canvas.style.cssText = 'position:fixed;z-index:-1;pointer-events:none;image-rendering:pixelated;';
        document.body.appendChild(canvas);
        this.ctx = canvas.getContext('2d');
        this.onResize = () => { this.resize(); this.draw(); };
        window.addEventListener('resize', this.onResize);
        this.stopGestures = this.host.gestures({ tap: (x, y) => this.tap(x, y) });
        this.resize();
        this.seed();
        this.draw();
        this.frameId = requestAnimationFrame(t => this.frame(t));
    }

    stop() {
        this.running = false;
        cancelAnimationFrame(this.frameId);
        window.removeEventListener('resize', this.onResize);
        this.stopGestures?.();
        this.canvas?.remove();
        this.canvas = this.ctx = null;
    }

    applySettings(config) {
        const before = this.config;
        this.config = { ...config };
        if (['layout', 'cat', 'room', 'view'].some(key => before[key] !== config[key])) {
            const layout = this.layout;
            this.resize();
            if (this.layout !== layout) this.seed();
        }
        this.lightKey = null;
        this.skyKey = null;
        this.draw();
    }

    // ---- Size: whole device pixels per art pixel --------------------------------

    // The stage lowers devicePixelRatio for its tiers, but this canvas is
    // already tiny; to land on whole device pixels it needs the real ratio,
    // which CSS resolution queries still report.
    static nativeRatio() {
        let lo = 0.25, hi = 8;
        if (!matchMedia(`(min-resolution: ${lo}dppx)`).matches) return 1;
        for (let i = 0; i < 26; i++) {
            const mid = (lo + hi) / 2;
            if (matchMedia(`(min-resolution: ${mid}dppx)`).matches) lo = mid; else hi = mid;
        }
        return Math.round(lo * 1000) / 1000;
    }

    // The largest whole scale at which the buffer keeps at least 90% of
    // the room's safe area each way, and the buffer that covers the screen
    // at that scale.
    static fit(deviceW, deviceH, [baseW, baseH]) {
        let scale = Math.max(1, Math.floor(Math.min(deviceW / baseW, deviceH / baseH)) + 1);
        while (scale > 1 && (deviceW / scale < baseW * 0.9 || deviceH / scale < baseH * 0.9)) scale--;
        return { scale, w: Math.ceil(deviceW / scale), h: Math.ceil(deviceH / scale) };
    }

    resize() {
        if (!this.canvas) return;
        const ratio = this.ratio = PixelRoomAnimationManager.nativeRatio();
        const W = Math.round(innerWidth * ratio), H = Math.round(innerHeight * ratio);
        const want = this.config.layout === 'auto' ? (W >= H ? 'landscape' : 'portrait') : this.config.layout;
        this.layout = want;
        const L = this.L = PIXEL_ROOM_LAYOUTS[want];
        const { scale, w, h } = PixelRoomAnimationManager.fit(W, H, L.size);
        this.canvas.width = w;
        this.canvas.height = h;
        // Device pixels → CSS: centred, on whole device pixels.
        const left = Math.floor((W - w * scale) / 2), top = Math.floor((H - h * scale) / 2);
        Object.assign(this.canvas.style, {
            left: `${left / ratio}px`, top: `${top / ratio}px`,
            width: `${w * scale / ratio}px`, height: `${h * scale / ratio}px`,
        });
        this.view = { layout: want, scale, ratio, w, h, left, top, deviceW: W, deviceH: H };
        // The safe area's origin in the buffer: centred across; the extra
        // height is shared, a little more of it floor.
        this.ox = Math.floor((w - L.size[0]) / 2);
        this.oy = Math.floor((h - L.size[1]) * 0.4);
        this.ctx.imageSmoothingEnabled = false;
        this.buildSprites();
        this.buildRoom();
        this.lightKey = null;
        this.skyKey = null;
    }

    // ---- Palette and sprites -------------------------------------------------------

    buildPalette() {
        const keys = Object.keys(PIXEL_ROOM_PALETTE);
        const rgb = {};
        for (const key of keys) {
            const hex = PIXEL_ROOM_PALETTE[key];
            rgb[key] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
        }
        const nearest = ([r, g, b], not) => {
            let best = null, bestD = Infinity;
            for (const key of keys) {
                if (key === not) continue;
                const [R, G, B] = rgb[key];
                const d = 2 * (R - r) ** 2 + 4 * (G - g) ** 2 + 3 * (B - b) ** 2;
                if (d < bestD) { bestD = d; best = key; }
            }
            return best;
        };
        // Each light level is a remap from palette to palette, so a lit
        // room never leaves the 32 colours.
        const shift = {
            0: ([r, g, b]) => [r * 0.3 + 4, g * 0.34 + 6, b * 0.52 + 16],     // night: moonlit blue
            1: ([r, g, b]) => [r * 0.62 + 4, g * 0.52 + 2, b * 0.66 + 16],    // dusk: dim and violet
            2: c => c,
            3: ([r, g, b]) => [r * 1.12 + 44, g * 0.98 + 20, b * 0.66],        // lamp: warm
        };
        const remap = [];
        for (let level = 0; level < PIXEL_ROOM_LEVELS; level++) {
            remap[level] = {};
            for (const key of keys) remap[level][key] = level === 2 ? key : nearest(shift[level](rgb[key]));
        }
        // Lamp light on something already bright shouldn't wash it out.
        for (const key of ['W', 'z', 'T']) remap[3][key] = key;
        const lookup = new Map(keys.map(key => [(rgb[key][0] << 16) | (rgb[key][1] << 8) | rgb[key][2], key]));
        return { rgb, remap, lookup, css: key => PIXEL_ROOM_PALETTE[key] };
    }

    // A palette key for the coat and room slots.
    keyFor(ch) {
        const coat = PIXEL_ROOM_COATS[this.config.cat] || PIXEL_ROOM_COATS.ginger;
        const theme = PIXEL_ROOM_THEMES[this.config.room] || PIXEL_ROOM_THEMES.warm;
        return coat[ch] || theme[ch] || ch;
    }

    // Every sprite, frame and light level as a small canvas; the cat's also
    // mirrored, to face left. sprites[name][frame][level] (+ .flip).
    buildSprites() {
        const make = (rows, level, flip) => {
            const w = Math.max(...rows.map(r => r.length)), h = rows.length;
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            const g = c.getContext('2d');
            rows.forEach((row, y) => [...row].forEach((ch, x) => {
                if (ch === '.') return;
                g.fillStyle = this.palette.css(this.palette.remap[level][this.keyFor(ch)]);
                g.fillRect(flip ? w - 1 - x : x, y, 1, 1);
            }));
            return c;
        };
        this.sprites = {};
        for (const [name, frames] of Object.entries(PIXEL_ROOM_SPRITES)) {
            const flips = name.startsWith('cat');
            this.sprites[name] = frames.map(rows => {
                const levels = [];
                for (let level = 0; level < PIXEL_ROOM_LEVELS; level++) {
                    levels[level] = make(rows, level, false);
                    if (flips) (levels.flip = levels.flip || [])[level] = make(rows, level, true);
                }
                return levels;
            });
        }
    }

    // ---- Time, weather, light --------------------------------------------------------

    // Everything the clock decides, from host.now(): the hour, sunrise and
    // sunset (longer days in summer, for a generic mid-latitude), the phase,
    // the room's light and the lamp.
    timeState() {
        const now = this.host.now();
        const hour = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
        const start = new Date(now.getFullYear(), 0, 1);
        const day = Math.floor((now - start) / 86400000);
        const summer = Math.cos(2 * Math.PI * (day - 172) / 365);
        const rise = 6.4 - 1.1 * summer, set = 18.4 + 1.4 * summer;
        let phase;
        if (hour < rise - 0.9 || hour >= set + 1.1) phase = 'night';
        else if (hour < rise + 0.8) phase = 'dawn';
        else if (hour < set - 0.6) phase = 'day';
        else phase = 'dusk';
        const rain = this.raining(now);
        const ambient = { night: 0, dawn: 1, dusk: 1, day: rain ? 1.55 : 2 }[phase];
        // The lamp: on from just before sunset until late at night.
        const auto = hour >= set - 0.5 && hour < 23.5;
        if (this.lampManual && this.lampManual.auto !== auto) this.lampManual = null;
        const lamp = this.lampManual ? this.lampManual.on : auto;
        // The record plays through the day and evening, not in the small hours.
        const music = hour >= 8 && hour < 23.5;
        return { now, hour, rise, set, phase, rain, ambient, lamp, autoLamp: auto, music, day: now.getDate() };
    }

    // Weather: 'sometimes' rains through some three-hour spells, the same
    // spells on every reload of the same day.
    raining(now) {
        if (this.config.weather === 'clear') return false;
        if (this.config.weather === 'rain') return true;
        const spell = now.getFullYear() * 1000 + Math.floor((now - new Date(now.getFullYear(), 0, 1)) / 86400000) * 8 + Math.floor(now.getHours() / 3);
        const x = Math.sin(spell * 12.9898) * 43758.5453;
        return x - Math.floor(x) < 0.3;
    }

    // The clock's reading, as the hands show it.
    clockReading() {
        const now = this.host.now();
        return { hour: now.getHours(), minute: now.getMinutes(), second: now.getSeconds() };
    }

    // ---- The room, at day light ------------------------------------------------------

    px(g, key, x, y, w = 1, h = 1) {
        g.fillStyle = this.palette.css(this.keyFor(key));
        g.fillRect(this.ox + x, this.oy + y, w, h);
    }

    put(g, name, frame, x, y) {
        g.drawImage(this.sprites[name][frame][2], this.ox + x, this.oy + y);
    }

    buildRoom() {
        const { w, h } = this.view, L = this.L;
        const c = this.roomBase = document.createElement('canvas');
        c.width = w; c.height = h;
        const g = c.getContext('2d');
        const theme = PIXEL_ROOM_THEMES[this.config.room] || PIXEL_ROOM_THEMES.warm;
        const ox = this.ox, oy = this.oy;
        const floorY = L.floor;
        const top = -oy, bottom = h - oy, left = -ox, right = w - ox;

        // Wall: wallpaper with a small diamond pattern, and a panelled
        // wainscot below a rail.
        this.px(g, '%', left, top, right - left, floorY - top);
        for (let y = top - (top % 8) - 8; y < L.wainscot; y += 8) {
            for (let x = left - (left % 8) - 8; x < right; x += 8) {
                const sx = x + ((y / 8) % 2 ? 4 : 0);
                this.px(g, '&', sx, y + 2, 1, 1);
                this.px(g, '&', sx - 1, y + 3, 3, 1);
                this.px(g, '&', sx, y + 4, 1, 1);
            }
        }
        this.px(g, '&', left, L.wainscot, right - left, floorY - L.wainscot);
        this.px(g, 'Y', left, L.wainscot - 2, right - left, 1);
        this.px(g, 'O', left, L.wainscot - 1, right - left, 2);
        for (let x = left - (left % 24); x < right; x += 24) {
            this.px(g, 'O', x + 3, L.wainscot + 5, 18, 1);
            this.px(g, 'O', x + 3, L.wainscot + 5, 1, floorY - L.wainscot - 10);
            this.px(g, '%', x + 4, floorY - 5, 17, 1);
            this.px(g, '%', x + 20, L.wainscot + 6, 1, floorY - L.wainscot - 11);
        }
        // Skirting.
        this.px(g, 'H', left, floorY - 3, right - left, 3);
        this.px(g, 'o', left, floorY - 3, right - left, 1);

        // Floor: planks with staggered seams and a little grain.
        const [plank, grain, seam] = theme.floor;
        this.px(g, plank, left, floorY, right - left, bottom - floorY);
        let row = 0;
        for (let y = floorY; y < bottom; y += 6, row++) {
            this.px(g, seam, left, y, right - left, 1);
            const offset = (row * 37) % 48;
            for (let x = left - 48 + offset; x < right; x += 48) this.px(g, seam, x, y, 1, 6);
            for (let x = left + ((row * 13) % 11); x < right; x += 11 + (row % 3)) this.px(g, grain, x, y + 2 + (x % 3), 3, 1);
        }

        this.drawRug(g, L.rug, theme);
        this.drawWindow(g, L.window);
        this.drawCabinet(g, L.cabinet);
        this.put(g, 'turntable', 0, L.turntable.x, L.turntable.y);
        this.drawDesk(g, L.desk);
        if (L.chair) this.drawChair(g, L.chair);
        this.drawBooks(g, L.books);
        this.put(g, 'mug', 0, L.mug.x, L.mug.y);
        this.drawShelf(g, L.shelf);
        this.put(g, 'clock', 0, L.clock.x, L.clock.y);
        this.put(g, 'picture', 0, L.picture.x, L.picture.y);
        this.put(g, 'calendar', 0, L.calendar.x, L.calendar.y);
        this.drawLightsWire(g, L.lights);
        this.drawBed(g, L.bed, theme);
    }

    drawRug(g, r, theme) {
        const [base, mid, edge] = theme.rug;
        // Rounded corners: rows inset at the ends.
        for (let y = 0; y < r.h; y++) {
            const inset = y === 0 || y === r.h - 1 ? 3 : y === 1 || y === r.h - 2 ? 1 : 0;
            this.px(g, base, r.x + inset, r.y + y, r.w - inset * 2, 1);
        }
        this.px(g, mid, r.x + 4, r.y + 3, r.w - 8, 1);
        this.px(g, mid, r.x + 4, r.y + r.h - 4, r.w - 8, 1);
        this.px(g, edge, r.x + 8, r.y + 6, r.w - 16, 1);
        this.px(g, edge, r.x + 8, r.y + r.h - 7, r.w - 16, 1);
        for (let x = r.x + 12; x < r.x + r.w - 12; x += 8) {
            this.px(g, mid, x, r.y + r.h / 2 - 2, 3, 1);
            this.px(g, edge, x + 1, r.y + r.h / 2 - 1, 1, 2);
            this.px(g, mid, x, r.y + r.h / 2 + 1, 3, 1);
        }
        // Tassels.
        for (let y = r.y + 4; y < r.y + r.h - 4; y += 2) { this.px(g, edge, r.x - 2, y, 2, 1); this.px(g, edge, r.x + r.w, y, 2, 1); }
    }

    // The window: frame, glass left clear (the sky shows through), sill,
    // rod and curtains.
    drawWindow(g, win) {
        const { x, y, w, h } = win;
        // Glass is cut out after everything else; the frame first.
        this.px(g, 'W', x - 4, y - 4, w + 8, h + 8);
        this.px(g, 'w', x - 4, y + h + 2, w + 8, 2);
        this.px(g, 'Q', x - 1, y - 1, w + 2, h + 2);
        // The sill.
        this.px(g, 'W', x - 7, y + h + 4, w + 14, 3);
        this.px(g, 'w', x - 7, y + h + 6, w + 14, 1);
        this.px(g, 'Q', x - 6, y + h + 7, w + 12, 1);
        // Clear the glass, then put the glazing bars back.
        g.clearRect(this.ox + x, this.oy + y, w, h);
        const mx = x + Math.floor(w / 2) - 1, my = y + Math.floor(h * 0.42);
        this.px(g, 'W', mx, y, 2, h);
        this.px(g, 'W', x, my, w, 2);
        this.px(g, 'w', mx + 1, y, 1, h);
        this.px(g, 'w', x, my + 1, w, 1);
        // Rod and curtains, gathered at the sides.
        this.px(g, 'H', x - 18, y - 10, w + 36, 2);
        this.px(g, 'Y', x - 20, y - 11, 3, 4);
        this.px(g, 'Y', x + w + 17, y - 11, 3, 4);
        const drop = h + 18;
        for (const side of [-1, 1]) {
            const cx = side < 0 ? x - 16 : x + w + 4;
            for (let i = 0; i < 12; i++) {
                const fold = i % 4 === 0 ? '&' : i % 4 === 2 ? '^' : '^';
                const dark = i % 4 === 0 || i === 11;
                this.px(g, dark ? 'r' : fold === '&' ? 'r' : '^', cx + i, y - 8, 1, drop - (side < 0 ? (i > 8 ? (i - 8) * 3 : 0) : (i < 3 ? (3 - i) * 3 : 0)));
            }
            // A tie-back.
            this.px(g, 'Y', cx + 1, y + Math.floor(h * 0.62), 10, 2);
        }
    }

    // The record cabinet under the window: a top, and cubbies of sleeves.
    drawCabinet(g, c) {
        const floor = this.L.floor;
        this.px(g, 'H', c.x, c.y, c.w, floor - c.y);
        this.px(g, 'O', c.x - 1, c.y, c.w + 2, 3);
        this.px(g, 'y', c.x - 1, c.y, c.w + 2, 1);
        this.px(g, 'h', c.x + 2, c.y + 4, c.w - 4, floor - c.y - 7);
        const sleeves = ['R', 'T', 'm', 'Y', 'v', 'l', 'W', 'p', 'S', 't', 'x', 'J'];
        const cell = Math.floor((c.w - 4) / 3);
        for (let i = 0; i < 3; i++) {
            const x0 = c.x + 2 + i * cell;
            this.px(g, 'O', x0 + cell - 1, c.y + 4, 1, floor - c.y - 7);
            for (let s = 0; s < cell - 3; s += 2) {
                const k = sleeves[(i * 7 + s * 3) % sleeves.length];
                const lean = (s * 5 + i) % 7 === 0 ? 1 : 0;
                this.px(g, k, x0 + 1 + s, c.y + 6 + lean, 2, floor - c.y - 10 - lean);
            }
        }
        this.px(g, 'H', c.x, floor - 3, c.w, 3);
        this.px(g, 'h', c.x + 1, floor - 1, 3, 1);
        this.px(g, 'h', c.x + c.w - 4, floor - 1, 3, 1);
    }

    drawDesk(g, d) {
        const floor = Math.max(this.L.floor, d.y + 30);
        // Top, legs and a drawer unit.
        this.px(g, 'y', d.x, d.y, d.w, 1);
        this.px(g, 'O', d.x, d.y + 1, d.w, 3);
        this.px(g, 'o', d.x, d.y + 4, d.w, 1);
        this.px(g, 'o', d.x + 3, d.y + 5, 3, floor - d.y - 5);
        this.px(g, 'H', d.x + 5, d.y + 5, 1, floor - d.y - 5);
        const dw = Math.min(30, Math.floor(d.w * 0.34)), dx = d.x + d.w - dw - 2;
        this.px(g, 'O', dx, d.y + 5, dw, floor - d.y - 5);
        this.px(g, 'o', dx, d.y + 5, 1, floor - d.y - 5);
        const drawers = 3, dh = Math.floor((floor - d.y - 7) / drawers);
        for (let i = 0; i < drawers; i++) {
            const y = d.y + 6 + i * dh;
            this.px(g, 'o', dx + 1, y + dh - 1, dw - 1, 1);
            this.px(g, 'Y', dx + Math.floor(dw / 2) - 2, y + Math.floor(dh / 2) - 1, 4, 1);
        }
    }

    drawChair(g, c) {
        const floor = this.L.floor;
        // From behind: a slatted back, the seat, legs.
        this.px(g, 'H', c.x, c.y - 14, 22, 2);
        this.px(g, 'o', c.x + 1, c.y - 14, 20, 1);
        for (let i = 0; i < 4; i++) this.px(g, 'o', c.x + 2 + i * 6, c.y - 12, 2, 12);
        this.px(g, 'H', c.x - 1, c.y, 24, 3);
        this.px(g, 'O', c.x - 1, c.y, 24, 1);
        this.px(g, 'H', c.x, c.y + 3, 2, floor - c.y - 2);
        this.px(g, 'H', c.x + 20, c.y + 3, 2, floor - c.y - 2);
        this.px(g, 'h', c.x + 5, c.y + 3, 1, floor - c.y - 6);
        this.px(g, 'h', c.x + 16, c.y + 3, 1, floor - c.y - 6);
    }

    // A stack of books and a little pile of paper on the desk.
    drawBooks(g, b) {
        const books = [['m', 18, 'x'], ['R', 16, 'p'], ['l', 17, 'L']];
        books.forEach(([k, w, light], i) => {
            const y = b.y - 3 * (i + 1);
            const x = b.x + (i === 1 ? 1 : 0);
            this.px(g, k, x, y, w, 3);
            this.px(g, light, x, y, w, 1);
            this.px(g, 'W', x + w - 2, y + 1, 2, 1);
        });
        this.px(g, 'W', b.x + 22, b.y - 1, 12, 1);
        this.px(g, 'w', b.x + 23, b.y - 2, 10, 1);
    }

    // A shelf of books, the pothos trailing from its end.
    drawShelf(g, s) {
        this.px(g, 'O', s.x, s.y, s.w, 2);
        this.px(g, 'y', s.x, s.y, s.w, 1);
        this.px(g, 'H', s.x + 2, s.y + 2, 2, 3);
        this.px(g, 'H', s.x + s.w - 4, s.y + 2, 2, 3);
        const spines = ['R', 'S', 'T', 'l', 'v', 'Y', 'm', 'p', 'J', 'u'];
        let x = s.x + 1;
        for (let i = 0; x < s.x + s.w - 16; i++) {
            const tall = 8 + ((i * 7) % 4), w = 2 + (i % 3 === 0 ? 1 : 0);
            this.px(g, spines[i % spines.length], x, s.y - tall, w, tall);
            this.px(g, 'W', x, s.y - tall + 2, w, 1);
            x += w + (i % 5 === 4 ? 2 : 0);
        }
        // A bookend leaning.
        this.px(g, 'q', x + 1, s.y - 6, 2, 6);
    }

    // The string of fairy lights: its wire is part of the room; the bulbs
    // are drawn live.
    drawLightsWire(g, l) {
        this.bulbs = [];
        for (let x = l.x0; x <= l.x1; x++) {
            const t = (x - l.x0) / (l.x1 - l.x0);
            const y = Math.round(l.y + Math.sin(Math.PI * t) * l.sag);
            this.px(g, 'k', x, y, 1, 1);
            if ((x - l.x0) % 7 === 3) this.bulbs.push([x, y + 1]);
        }
    }

    drawBed(g, b, theme) {
        const [blanket, shade, light] = theme.blanket;
        const right = b.head === 'right';
        const floor = right ? this.L.floor : b.y + 34;
        const headX = right ? b.x + b.w - 10 : b.x;
        // Headboard.
        this.px(g, 'H', headX, b.y - 24, 10, floor - (b.y - 24));
        this.px(g, 'O', headX + 1, b.y - 23, 8, 18);
        this.px(g, 'y', headX + 1, b.y - 23, 8, 1);
        this.px(g, 'o', headX + 3, b.y - 20, 4, 12);
        // Frame and legs.
        const fx = right ? b.x : b.x + 10, fw = b.w - 10;
        this.px(g, 'H', fx, b.y + 12, fw, 6);
        this.px(g, 'O', fx, b.y + 12, fw, 1);
        this.px(g, 'H', right ? fx + 1 : fx + fw - 4, b.y + 18, 3, floor - b.y - 18);
        // Mattress and sheet.
        this.px(g, 'W', fx, b.y + 2, fw, 10);
        this.px(g, 'w', fx, b.y + 10, fw, 2);
        // Pillow at the head.
        const px = right ? headX - 18 : headX + 11;
        this.px(g, 'W', px, b.y - 4, 17, 7);
        this.px(g, 'w', px + 1, b.y + 2, 15, 1);
        this.px(g, 'w', right ? px : px + 16, b.y - 3, 1, 5);
        // The blanket, folded back near the pillow, falling over the side.
        const bx = right ? fx : px + 18, bw = right ? fw - 20 : fx + fw - (px + 18);
        this.px(g, blanket, bx, b.y, bw, 14);
        this.px(g, light, right ? bx + bw - 3 : bx, b.y, 3, 14);
        this.px(g, shade, bx, b.y + 11, bw, 3);
        for (let x = bx + 4; x < bx + bw - 4; x += 9) this.px(g, shade, x, b.y + 3, 1, 8);
        // Quilt squares.
        for (let x = bx + 2; x < bx + bw - 6; x += 9) for (let y = b.y + 2; y < b.y + 10; y += 5) this.px(g, light, x + 2, y + 1, 2, 1);
    }

    // ---- Light ----------------------------------------------------------------------

    // The level at each pixel, 0..3, dithered: ambient, the window's patch
    // on the floor, and the lamp.
    lightMap(state) {
        const { w, h } = this.view, L = this.L, ox = this.ox, oy = this.oy;
        const levels = new Uint8Array(w * h);
        const lamp = state.lamp ? { x: ox + L.lamp.x + 9, y: oy + L.lamp.y + 6 } : null;
        const win = L.window;
        // The window's light on the floor: day sun, low warm sun at dawn and
        // dusk, moonlight at night (if the moon is up and it isn't raining).
        let patch = 0;
        if (!state.rain) patch = state.phase === 'day' ? 1.1 : state.phase === 'night' ? (this.moonUp(state) ? 0.75 : 0) : 0.7;
        const skew = state.hour < 12 ? 0.5 : -0.5;
        const floorTop = oy + L.floor + 2, depth = Math.round(win.h * 0.55);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                let v = state.ambient;
                if (patch && y >= floorTop && y < floorTop + depth) {
                    const t = y - floorTop;
                    const px = x - (ox + win.x + skew * t * 1.6), py = t;
                    // Four panes with the glazing bars' shadows between.
                    const inX = px >= 0 && px < win.w && Math.abs(px - win.w / 2) > 1.5;
                    const inY = Math.abs(py - depth * 0.42) > 1;
                    if (inX && inY) v += patch * (1 - t / depth * 0.5);
                }
                if (lamp) {
                    const dx = (x - lamp.x) / 62, dy = (y - lamp.y) / (y > lamp.y ? 80 : 34);
                    const d = Math.sqrt(dx * dx + dy * dy);
                    if (d < 1) v = Math.max(v, Math.min(3, state.ambient + (3.2 - state.ambient) * (1 - d) ** 0.9));
                }
                levels[y * w + x] = Math.max(0, Math.min(3, Math.floor(v + PIXEL_ROOM_BAYER[(y & 3) * 4 + (x & 3)] - 0.5 + 0.5)));
            }
        }
        return levels;
    }

    // The lit room: every pixel of the day-lit room, remapped to its level.
    // Built only when the light changes.
    buildLit(state) {
        const { w, h } = this.view;
        this.levels = this.lightMap(state);
        // The room, plus what changes with the light and the day: the lamp
        // (its bulb lit when on) and the calendar's page.
        const work = this.roomWork = this.roomWork && this.roomWork.width === w && this.roomWork.height === h ? this.roomWork : document.createElement('canvas');
        work.width = w; work.height = h;
        const g0 = work.getContext('2d', { willReadFrequently: true });
        g0.drawImage(this.roomBase, 0, 0);
        g0.drawImage(this.sprites.lamp[state.lamp ? 1 : 0][2], this.ox + this.L.lamp.x, this.oy + this.L.lamp.y);
        this.drawCalendarDay(g0, state.day);
        const src = g0.getImageData(0, 0, w, h);
        const data = src.data, { lookup, remap, rgb } = this.palette;
        for (let i = 0, p = 0; i < data.length; i += 4, p++) {
            if (!data[i + 3]) continue;
            const key = lookup.get((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
            if (!key) continue;
            const [r, g, b] = rgb[remap[this.levels[p]][key]];
            data[i] = r; data[i + 1] = g; data[i + 2] = b;
        }
        if (!this.lit || this.lit.width !== w || this.lit.height !== h) {
            this.lit = document.createElement('canvas');
            this.lit.width = w; this.lit.height = h;
        }
        this.lit.getContext('2d').putImageData(src, 0, 0);
    }

    drawCalendarDay(g, day) {
        const c = this.L.calendar, digits = String(day).split('').map(Number);
        const width = digits.length * 4 - 1, x0 = c.x + Math.floor((12 - width) / 2);
        this.px(g, 'W', c.x + 1, c.y + 5, 10, 6);
        digits.forEach((d, i) => PIXEL_ROOM_DIGITS[d].forEach((row, y) => [...row].forEach((ch, x) => {
            if (ch !== '.') this.px(g, 'k', x0 + i * 4 + x, c.y + 5 + y, 1, 1);
        })));
    }

    levelAt(x, y) {
        const { w, h } = this.view;
        const bx = Math.max(0, Math.min(w - 1, Math.round(this.ox + x))), by = Math.max(0, Math.min(h - 1, Math.round(this.oy + y)));
        return this.levels ? this.levels[by * w + bx] : 2;
    }

    colour(key, level) {
        return this.palette.css(this.palette.remap[level][key]);
    }

    // ---- The sky through the window ------------------------------------------------

    moonUp(state) {
        return state.hour >= state.set + 0.5 || state.hour < state.rise - 0.3;
    }

    // 0 new … 4 full … 7 waning crescent, from a known new moon.
    moonPhase(now) {
        const days = (now.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 86400000;
        const age = ((days % 29.530588) + 29.530588) % 29.530588;
        return Math.round(age / 29.530588 * 8) % 8;
    }

    // Sky colours through the day: [top, middle, horizon], dithered between
    // the hours on either side.
    skyStops(state) {
        if (state.rain) {
            return [[0, ['K', 'n', 'N']], [state.rise, ['n', 'N', 'q']], [state.rise + 1.5, ['q', 'Q', 'Q']],
                [state.set - 1, ['q', 'Q', 'Q']], [state.set + 0.5, ['N', 'q', 'q']], [state.set + 1.5, ['K', 'n', 'N']], [24, ['K', 'n', 'N']]];
        }
        const r = state.rise, s = state.set;
        return [[0, ['k', 's', 's']], [r - 1.2, ['k', 's', 'S']], [r - 0.5, ['s', 'u', 'v']], [r, ['S', 'v', 'p']],
            [r + 0.7, ['m', 'M', 'T']], [r + 1.6, ['m', 'M', 'x']], [s - 1.4, ['m', 'M', 'x']], [s - 0.5, ['m', 'V', 'T']],
            [s, ['S', 'v', 't']], [s + 0.6, ['s', 'u', 'p']], [s + 1.2, ['k', 's', 'u']], [s + 2, ['k', 's', 's']], [24, ['k', 's', 's']]];
    }

    buildSky(state) {
        const win = this.L.window, { w, h } = win;
        const back = this.skyBack = this.skyBack || document.createElement('canvas');
        back.width = w; back.height = h;
        const g = back.getContext('2d');
        const stops = this.skyStops(state);
        let i = 0;
        while (i < stops.length - 2 && stops[i + 1][0] <= state.hour) i++;
        const [h0, a] = stops[i], [h1, b] = stops[i + 1];
        // Mostly the earlier colours, crossing over (dithered) late in the span.
        const t = Math.max(0, Math.min(1, ((state.hour - h0) / ((h1 - h0) || 1) - 0.6) / 0.4));
        // Solid bands, dithered only where one gives way to the next.
        const edge = v => Math.max(0, Math.min(1, (v - 0.55) / 0.45));
        for (let y = 0; y < h; y++) {
            const v = y / (h - 1) * 2;          // 0 top … 1 middle … 2 horizon
            for (let x = 0; x < w; x++) {
                const d = PIXEL_ROOM_BAYER[(y & 3) * 4 + (x & 3)];
                const stops2 = d < t ? b : a;
                const band = v < 1 ? (d < edge(v) ? 1 : 0) : (d < edge(v - 1) ? 2 : 1);
                g.fillStyle = this.palette.css(stops2[band]);
                g.fillRect(x, y, 1, 1);
            }
        }
        this.buildOutside(state);
    }

    // The view: city, forest or sea, at the sky's light. Lit windows and
    // lights come on at night.
    buildOutside(state) {
        const win = this.L.window, { w, h } = win;
        const front = this.skyFront = this.skyFront || document.createElement('canvas');
        front.width = w; front.height = h;
        const g = front.getContext('2d');
        g.clearRect(0, 0, w, h);
        const level = state.phase === 'night' ? 0 : state.phase === 'day' ? (state.rain ? 1 : 2) : 1;
        const put = (key, x, y, ww = 1, hh = 1) => { g.fillStyle = this.colour(key, level); g.fillRect(x, y, ww, hh); };
        const random = WP.seededRandom(this.view.w * 7 + this.view.h);
        const night = state.phase === 'night' || state.phase === 'dusk' && state.hour > state.set;
        this.horizon = Math.round(h * 0.7);
        if (this.config.view === 'forest') {
            for (let x = 0; x < w; x++) {
                const far = Math.round(h * 0.62 + Math.sin(x / 9) * 3 + Math.sin(x / 4.3) * 1.5);
                const near = Math.round(h * 0.76 + Math.sin(x / 13 + 2) * 4);
                put('J', x, far, 1, h - far);
                put('j', x, near, 1, h - near);
            }
            for (let i = 0; i < Math.round(w / 6); i++) {
                const x = Math.floor(random() * w), base = Math.round(h * 0.78 + Math.sin(x / 13 + 2) * 4), tall = 6 + Math.floor(random() * 9);
                for (let y = 0; y < tall; y++) {
                    const half = Math.floor((y * 0.45) + (y % 3 === 0 ? 1 : 0));
                    put(y < tall * 0.3 ? 'J' : 'j', x - half, base - tall + y, half * 2 + 1, 1);
                }
                put('h', x, base, 1, 2);
            }
            this.fireflies = night ? Array.from({ length: 6 }, () => [Math.floor(random() * w), Math.round(h * 0.72 + random() * h * 0.22)]) : [];
        } else if (this.config.view === 'sea') {
            const sea = Math.round(h * 0.66);
            this.horizon = sea;
            put('S', 0, sea, w, h - sea);
            put('m', 0, sea, w, 1);
            for (let y = sea + 2; y < h; y += 3) for (let x = (y * 5) % 7; x < w; x += 7 + (y % 4)) put('m', x, y, 3, 1);
            // A headland and a little lighthouse.
            for (let x = 0; x < w * 0.3; x++) {
                const top = Math.round(sea - 6 + (x / (w * 0.3)) ** 2 * 6 + Math.sin(x / 3) * 0.8);
                put('J', x, top, 1, sea - top);
            }
            put('W', 6, sea - 15, 3, 9);
            put('R', 6, sea - 12, 3, 2);
            put('k', 6, sea - 16, 3, 1);
            this.beacon = [7, sea - 16];
        } else {
            // City: blocks of towers with windows.
            this.windows = [];
            let x = -2;
            while (x < w) {
                const bw = 6 + Math.floor(random() * 9), tall = Math.round(h * (0.18 + random() * 0.32));
                const top = h - tall, key = random() < 0.5 ? 'N' : 'q';
                put(key, x, top, bw, tall);
                put(key === 'N' ? 'q' : 'Q', x, top, 1, tall);
                if (random() < 0.3) put('N', x + Math.floor(bw / 2), top - 3, 1, 3);
                for (let wy = top + 3; wy < h - 2; wy += 3) {
                    for (let wx = x + 2; wx < x + bw - 1; wx += 2) {
                        const on = random() < 0.38;
                        this.windows.push([wx, wy, on]);
                        put(key === 'N' ? 'n' : 'N', wx, wy);
                    }
                }
                x += bw + (random() < 0.3 ? 2 : 0);
            }
            const tallest = h - Math.round(h * 0.5);
            this.beacon = [Math.floor(w * 0.6), tallest];
        }
        this.outsideNight = night;
    }

    // Stars, clouds and raindrops for this layout's window.
    seed() {
        const win = this.L.window;
        const random = WP.seededRandom(Math.floor(Math.random() * 1e9));
        this.stars = Array.from({ length: Math.round(win.w * win.h / 70) }, () => [Math.floor(random() * win.w), Math.floor(random() * win.h * 0.62), random() < 0.25]);
        this.clouds = Array.from({ length: 3 }, (_, i) => ({ x: random() * win.w * 1.4 - 10, y: 4 + i * Math.floor(win.h * 0.14) + Math.floor(random() * 4), kind: i % 2, speed: 0.04 + random() * 0.05 }));
        this.drops = Array.from({ length: Math.round(win.w * win.h / 90) }, () => ({ x: random() * win.w, y: random() * win.h, v: 2 + random() * 2 }));
        this.beads = Array.from({ length: 7 }, () => ({ x: Math.floor(random() * win.w), y: random() * win.h, v: 0.02 + random() * 0.06 }));
        this.steam = [];
        this.notes = [];
        this.zeds = [];
        this.shooting = null;
        this.cat = this.newCat();
    }

    // ---- The cat -------------------------------------------------------------------

    // A slow state machine: sleep → wake (blink, yawn, stretch) → wash →
    // to the window → watch → back to bed → sleep. Durations in ticks.
    newCat() {
        const [x, y] = this.L.cat.bed;
        return { state: 'sleep', x, y, face: 1, t: 0, until: 300 + Math.floor(Math.random() * 600), path: [], heart: 0, frame: 0, where: 'bed' };
    }

    setCat(state, until) {
        Object.assign(this.cat, { state, t: 0, until });
    }

    // Moves are queued: walk to x, or leap to (x, y).
    go(steps) {
        this.cat.path = steps;
        this.setCat('move', Infinity);
        this.nextStep();
    }

    nextStep() {
        const cat = this.cat, step = cat.path.shift();
        if (!step) return this.arrive();
        cat.step = { ...step, fromX: cat.x, fromY: cat.y, t: 0, len: step.leap ? 9 : Math.abs(step.x - cat.x) };
        if (step.x !== cat.x) cat.face = step.x > cat.x ? 1 : -1;
    }

    arrive() {
        const cat = this.cat;
        if (cat.where === 'sill') this.setCat('watch', 400 + Math.floor(Math.random() * 900));
        else this.setCat('settle', 30);
    }

    updateCat(state) {
        const cat = this.cat, C = this.L.cat;
        cat.t++;
        if (cat.heart > 0) cat.heart--;
        const roll = () => Math.random();
        switch (cat.state) {
            case 'sleep':
                if (cat.t % 34 === 0 && this.zeds.length < 3) this.zeds.push({ x: cat.x + 7 * cat.face, y: cat.y - 10, t: 0 });
                if (cat.t >= cat.until) this.setCat('wake', 40);
                break;
            case 'wake': if (cat.t >= cat.until) this.setCat('yawn', 14); break;
            case 'yawn': if (cat.t >= cat.until) this.setCat('stretch', 22); break;
            case 'stretch': if (cat.t >= cat.until) this.setCat('groom', 40 + Math.floor(roll() * 60)); break;
            case 'groom':
                if (cat.t >= cat.until) {
                    // Off to the window, unless it's the middle of the night.
                    if (cat.where === 'bed' && (state.phase !== 'night' || roll() < 0.3)) {
                        this.go([{ x: C.bedEdge, y: C.floorY, leap: true }, { x: C.sillEdge, y: C.floorY }, { x: C.sill[0], y: C.sill[1], leap: true, where: 'sill' }]);
                    } else this.setCat('sit', 60 + Math.floor(roll() * 80));
                }
                break;
            case 'sit':
                if (cat.t >= cat.until) {
                    if (cat.where === 'bed') this.setCat('curl', 8);
                    else this.setCat('groom', 30);
                }
                break;
            case 'curl': if (cat.t >= cat.until) this.setCat('sleep', (state.phase === 'night' ? 1800 : 600) + Math.floor(roll() * 1200)); break;
            case 'watch':
                if (cat.t >= cat.until) {
                    cat.face = -1;
                    this.go([{ x: C.sillEdge + 4, y: C.floorY, leap: true }, { x: C.bedEdge, y: C.floorY }, { x: C.bed[0], y: C.bed[1], leap: true, where: 'bed' }]);
                }
                break;
            case 'settle':
                if (cat.t >= cat.until) this.setCat(cat.where === 'bed' ? 'groom' : 'sit', 30 + Math.floor(roll() * 30));
                break;
            case 'move': {
                const s = cat.step;
                if (!s) { this.arrive(); break; }
                s.t++;
                if (s.leap) {
                    const p = Math.min(1, s.t / s.len);
                    cat.x = Math.round(s.fromX + (s.x - s.fromX) * p);
                    cat.y = Math.round(s.fromY + (s.y - s.fromY) * p - Math.sin(Math.PI * p) * (10 + Math.abs(s.y - s.fromY) * 0.35));
                    if (p >= 1) { cat.x = s.x; cat.y = s.y; if (s.where) cat.where = s.where; else cat.where = 'floor'; this.nextStep(); }
                } else {
                    if (s.t % 1 === 0) cat.x += Math.sign(s.x - cat.x);
                    cat.frame = Math.floor(s.t / 2) % 4;
                    if (cat.x === s.x) this.nextStep();
                }
                break;
            }
        }
    }

    // Which sprite and frame shows the cat now.
    catSprite() {
        const cat = this.cat;
        const blink = cat.t % 47 < 2;
        switch (cat.state) {
            case 'sleep': return ['catSleep', Math.floor(cat.t / 12) % 2, true];
            case 'curl': return ['catSleep', 0, true];
            case 'wake': case 'sit': case 'settle': return ['catSit', blink ? 1 : 0, false];
            case 'yawn': return ['catYawn', 0, false];
            case 'stretch': return ['catStretch', 0, true];
            case 'groom': return ['catGroom', Math.floor(cat.t / 4) % 2, false];
            case 'watch': return ['catBack', [0, 1, 2, 1][Math.floor(cat.t / 4) % 4] * (cat.t % 90 < 50 ? 1 : 0), false];
            case 'move': return cat.step?.leap ? ['catLeap', 0, true] : ['catWalk', cat.frame, true];
        }
        return ['catSit', 0, false];
    }

    catBox() {
        const [name, frame] = this.catSprite();
        const sprite = this.sprites[name][frame][2];
        return { x: this.cat.x - Math.floor(sprite.width / 2), y: this.cat.y - sprite.height, w: sprite.width, h: sprite.height };
    }

    // ---- Taps --------------------------------------------------------------------

    tap(x, y) {
        if (!this.config.touch || !this.view) return;
        const bx = Math.floor((x * this.view.ratio - this.view.left) / this.view.scale) - this.ox;
        const by = Math.floor((y * this.view.ratio - this.view.top) / this.view.scale) - this.oy;
        const inside = (r, pad = 3) => bx >= r.x - pad && bx < r.x + r.w + pad && by >= r.y - pad && by < r.y + r.h + pad;
        if (inside(this.catBox())) this.pet();
        else if (inside({ x: this.L.lamp.x, y: this.L.lamp.y, w: 17, h: 17 })) this.toggleLamp();
    }

    // Wakes it if it's asleep; otherwise a heart, and a moment to enjoy it.
    pet() {
        const cat = this.cat;
        cat.heart = 18;
        if (cat.state === 'sleep' || cat.state === 'curl') this.setCat('wake', 14);
        else if (cat.state === 'sit' || cat.state === 'groom' || cat.state === 'settle') this.setCat('sit', 40);
        this.draw();
        return cat.state === 'wake' ? 'The cat wakes up' : 'Purr';
    }

    toggleLamp() {
        const state = this.timeState();
        this.lampManual = { on: !state.lamp, auto: state.autoLamp };
        this.lightKey = null;
        this.draw();
        return this.lampManual.on ? 'Lamp on' : 'Lamp off';
    }

    // ---- Ticks ---------------------------------------------------------------------

    frame() {
        if (!this.running) return;
        const now = performance.now();
        if (now >= this.nextTick - 8) {
            // Ten ticks a second; if frames came late, catch the logic up.
            const behind = this.nextTick ? Math.min(10, Math.max(1, Math.round((now - this.nextTick) / PIXEL_ROOM_TICK_MS) + 1)) : 1;
            for (let i = 0; i < behind; i++) this.update();
            this.draw();
            this.nextTick = Math.max(this.nextTick + PIXEL_ROOM_TICK_MS, now + PIXEL_ROOM_TICK_MS * 0.6);
        }
        // Idle until the next tick; the stage wakes us then.
        this.host.idleUntil(Math.max(0, this.nextTick - performance.now() - 2));
        this.frameId = requestAnimationFrame(t => this.frame(t));
    }

    update() {
        this.ticks++;
        const state = this.state = this.timeState();
        this.updateCat(state);
        const L = this.L, win = L.window;
        // Steam from the mug: a puff every so often, rising and curling.
        if (this.ticks % 4 === 0 && this.steam.length < 10) this.steam.push({ x: L.mug.x + 2 + Math.floor(Math.random() * 4), y: L.mug.y - 1, t: 0, ph: Math.random() * 6 });
        for (const s of this.steam) {
            s.t++;
            if (s.t % 2 === 0) s.y--;
            s.dx = Math.round(Math.sin(s.t * 0.25 + s.ph) * 1.2);
        }
        this.steam = this.steam.filter(s => s.t < 30);
        // Notes from the record, while it plays.
        if (state.music && this.ticks % 36 === 0 && Math.random() < 0.6) this.notes.push({ x: L.turntable.x + 8 + Math.floor(Math.random() * 6), y: L.turntable.y - 2, t: 0, drift: Math.random() < 0.5 ? -1 : 1 });
        for (const n of this.notes) { n.t++; if (n.t % 3 === 0) n.y--; if (n.t % 9 === 0) n.x += n.drift; }
        this.notes = this.notes.filter(n => n.t < 54);
        for (const z of this.zeds) { z.t++; if (z.t % 4 === 0) { z.y--; z.x += this.cat.face; } }
        this.zeds = this.zeds.filter(z => z.t < 40 && this.cat.state === 'sleep');
        // Clouds drift; rain falls; beads slide down the glass.
        for (const c of this.clouds) { c.x += c.speed; if (c.x > win.w + 2) c.x = -16; }
        if (state.rain) {
            for (const d of this.drops) { d.y += d.v; d.x -= d.v * 0.35; if (d.y > win.h) { d.y -= win.h + 4; d.x = Math.random() * (win.w + 10); } }
            for (const b of this.beads) { b.y += b.v * (Math.random() < 0.1 ? 8 : 1); if (b.y > win.h) { b.y = -2; b.x = Math.floor(Math.random() * win.w); } }
        }
        // Now and then, at night, a shooting star.
        if (!this.shooting && state.phase === 'night' && !state.rain && Math.random() < 0.0015) this.shooting = { x: Math.random() * win.w * 0.6 + win.w * 0.3, y: Math.random() * win.h * 0.25, t: 0 };
        if (this.shooting && ++this.shooting.t > 7) this.shooting = null;
        // City windows switch on and off.
        if (this.windows && this.outsideNight && this.ticks % 25 === 0) {
            const w = this.windows[Math.floor(Math.random() * this.windows.length)];
            if (w) w[2] = !w[2];
        }
    }

    draw() {
        if (!this.ctx) return;
        const state = this.state || (this.state = this.timeState());
        const g = this.ctx, L = this.L, win = L.window, ox = this.ox, oy = this.oy;
        // Light and sky: rebuilt when they change.
        const lightKey = `${state.ambient}|${state.lamp}|${state.phase}|${state.rain}|${state.day}|${state.phase === 'night' && this.moonUp(state)}|${state.hour < 12}`;
        if (lightKey !== this.lightKey) { this.buildLit(state); this.lightKey = lightKey; }
        const skyKey = `${Math.floor(state.hour * 12)}|${state.rain}|${this.config.view}`;
        if (skyKey !== this.skyKey) {
            this.buildSky(state);
            this.skyKey = skyKey;
        }

        // The window first: sky, sun or moon, clouds, the view, rain.
        const wx = ox + win.x, wy = oy + win.y;
        g.drawImage(this.skyBack, wx, wy);
        this.drawSkyLife(g, state, wx, wy);
        g.drawImage(this.skyFront, wx, wy);
        this.drawViewLife(g, state, wx, wy);
        if (state.rain) this.drawRain(g, wx, wy, win);

        // The room, then everything that moves in it.
        g.drawImage(this.lit, 0, 0);
        this.drawClockHands(g, state);
        this.drawBulbs(g, state);
        const sway = [0, 1, 0, 2][Math.floor(this.ticks / 9) % 4];
        this.sprite(g, 'plant', sway, L.plant.x, L.plant.y - 23);
        this.sprite(g, 'pothos', Math.floor(this.ticks / 13) % 2, L.pothos.x, L.pothos.y);
        this.sprite(g, 'turntable', state.music ? Math.floor(this.ticks / 2) % 4 : 0, L.turntable.x, L.turntable.y);
        for (const n of this.notes) this.sprite(g, 'note', 0, n.x, n.y - 6, n.t > 40 ? 1 : null);
        for (const s of this.steam) {
            const key = s.t < 10 ? 'W' : s.t < 20 ? 'w' : 'Q';
            g.fillStyle = this.colour(key, this.levelAt(s.x, s.y));
            g.fillRect(ox + s.x + (s.dx || 0), oy + s.y, 1, 1);
        }
        // The cat.
        const [name, frame, flips] = this.catSprite();
        const cat = this.cat, box = this.catBox();
        const level = this.levelAt(cat.x, cat.y - 4);
        const set = this.sprites[name][frame];
        g.drawImage(flips && cat.face < 0 ? set.flip[level] : set[level], ox + box.x, oy + box.y);
        for (const z of this.zeds) this.sprite(g, 'zed', 0, z.x, z.y);
        if (cat.heart > 0) this.sprite(g, 'heart', 0, cat.x - 2, box.y - 7 - Math.floor((18 - cat.heart) / 4));
    }

    // A sprite at the light where it stands (or a given level).
    sprite(g, name, frame, x, y, level = null) {
        const s = this.sprites[name][frame];
        const lv = level ?? this.levelAt(x + s[2].width / 2, y + s[2].height - 1);
        g.drawImage(s[lv], this.ox + x, this.oy + y);
    }

    drawSkyLife(g, state, wx, wy) {
        const win = this.L.window;
        const clip = (x, y) => x >= 0 && y >= 0 && x < win.w && y < (this.horizon || win.h);
        // Stars, twinkling, when it's dark and clear.
        const dark = state.phase === 'night' || (state.phase === 'dusk' && state.hour > state.set + 0.6) || (state.phase === 'dawn' && state.hour < state.rise - 0.4);
        if (dark && !state.rain) {
            for (const [x, y, bright] of this.stars) {
                if (!clip(x, y)) continue;
                const tw = (x * 7 + y * 3 + this.ticks) % 23 === 0;
                g.fillStyle = this.palette.css(tw ? 'q' : bright ? 'W' : 'Q');
                g.fillRect(wx + x, wy + y, 1, 1);
            }
            if (this.shooting) {
                const s = this.shooting;
                for (let i = 0; i < 4; i++) {
                    const x = Math.round(s.x - s.t * 3 + i * 2), y = Math.round(s.y + s.t * 1.5 - i);
                    if (clip(x, y)) { g.fillStyle = this.palette.css(i ? 'Q' : 'W'); g.fillRect(wx + x, wy + y, 1, 1); }
                }
            }
        }
        if (!state.rain) {
            // The sun low in the sky at either end of the day; the moon at night.
            const arc = (from, to, h) => {
                let span = to - from, t = h - from;
                if (span < 0) span += 24;
                if (t < 0) t += 24;
                const p = t / span;
                return p >= 0 && p <= 1 ? [Math.round(win.w * (0.1 + 0.8 * p)), Math.round((this.horizon || win.h) - Math.sin(Math.PI * p) * win.h * 1.5)] : null;
            };
            const sun = arc(state.rise - 0.2, state.set + 0.2, state.hour);
            if (sun) g.drawImage(this.sprites.sun[0][2], wx + sun[0] - 3, wy + sun[1] - 3);
            const moon = arc(state.set + 0.5, state.rise - 0.3, state.hour);
            if (moon) g.drawImage(this.sprites.moon[this.moonPhase(state.now)][2], wx + moon[0] - 3, wy + moon[1] - 3);
            // Clouds, at the sky's light.
            const level = state.phase === 'night' ? 0 : state.phase === 'day' ? 2 : 1;
            for (const c of this.clouds) {
                const s = this.sprites.cloud[c.kind][level];
                g.drawImage(s, wx + Math.round(c.x), wy + c.y);
            }
        }
    }

    drawViewLife(g, state, wx, wy) {
        const win = this.L.window;
        if (this.outsideNight) {
            if (this.windows) {
                for (const [x, y, on] of this.windows) {
                    if (!on) continue;
                    g.fillStyle = this.palette.css((x + y) % 5 ? 'T' : 'z');
                    g.fillRect(wx + x, wy + y, 1, 1);
                }
            }
            if (this.fireflies) {
                for (const [x, y] of this.fireflies) {
                    if ((x * 3 + this.ticks) % 17 < 6) { g.fillStyle = this.palette.css('L'); g.fillRect(wx + x + Math.round(Math.sin((this.ticks + x) / 9) * 2), wy + y, 1, 1); }
                }
            }
            if (this.beacon && this.ticks % 20 < 10) { g.fillStyle = this.palette.css(this.config.view === 'sea' ? 'T' : 'R'); g.fillRect(wx + this.beacon[0], wy + this.beacon[1] - 1, 1, 1); }
        }
        if (this.config.view === 'sea') {
            // Glints on the water, and the moon's path at night.
            const sea = this.horizon;
            for (let i = 0; i < 6; i++) {
                const x = (i * 13 + Math.floor(this.ticks / 3) * (i % 2 ? 1 : -1) * 1) % win.w, y = sea + 2 + ((i * 5) % (win.h - sea - 3));
                g.fillStyle = this.palette.css(state.phase === 'night' ? 'S' : 'x');
                g.fillRect(wx + ((x + win.w) % win.w), wy + y, 2, 1);
            }
        }
    }

    drawRain(g, wx, wy, win) {
        g.fillStyle = this.palette.css('M');
        for (const d of this.drops) {
            const x = Math.round(d.x), y = Math.round(d.y);
            for (let i = 0; i < 3; i++) {
                const px = x + Math.round(i * 0.35), py = y - i;
                if (px >= 0 && py >= 0 && px < win.w && py < win.h) g.fillRect(wx + px, wy + py, 1, 1);
            }
        }
        for (const b of this.beads) {
            const y = Math.round(b.y);
            if (y < 0 || y >= win.h - 1) continue;
            g.fillStyle = this.palette.css('x');
            g.fillRect(wx + b.x, wy + y, 1, 2);
            g.fillStyle = this.palette.css('W');
            g.fillRect(wx + b.x, wy + y, 1, 1);
        }
    }

    // Hour, minute and a ticking second hand, in pixels.
    drawClockHands(g, state) {
        const c = this.L.clock, cx = this.ox + c.x + 6, cy = this.oy + c.y + 6;
        const { hour, minute, second } = this.clockReading();
        const level = this.levelAt(c.x + 6, c.y + 6);
        const hand = (angle, length, key) => {
            g.fillStyle = this.colour(key, level);
            for (let i = 0; i <= length; i++) g.fillRect(Math.round(cx + Math.sin(angle) * i), Math.round(cy - Math.cos(angle) * i), 1, 1);
        };
        hand(Math.PI * 2 * second / 60, 5, 'R');
        hand(Math.PI * 2 * (minute + second / 60) / 60, 5, 'k');
        hand(Math.PI * 2 * ((hour % 12) + minute / 60) / 12, 3, 'k');
    }

    // Fairy lights glow in the evening and at night, and twinkle.
    drawBulbs(g, state) {
        const on = state.phase !== 'day' || state.rain;
        const colours = ['T', 'p', 'L', 'M', 'V'];
        this.bulbs.forEach(([x, y], i) => {
            let key = colours[i % colours.length];
            const level = on ? (((i * 5 + Math.floor(this.ticks / 6)) % 11) === 0 ? 1 : 3) : this.levelAt(x, y);
            g.fillStyle = this.colour(key, on ? (level === 3 ? 2 : 1) : Math.min(1, level));
            g.fillRect(this.ox + x, this.oy + y, 1, 1);
            if (on && level === 3) { g.fillStyle = this.colour(key, 1); g.fillRect(this.ox + x, this.oy + y + 1, 1, 1); }
        });
    }
}
