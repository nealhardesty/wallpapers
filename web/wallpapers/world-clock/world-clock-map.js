// World Clock's map: the world in equirectangular projection, filling the
// width, letterboxed into the sky above and below on tall screens.
//
// Layers, each cached, built when the map is first drawn:
//   - the land and sea, with the graticule, for the whole world from 180°W,
//     per resize and look; drawn twice, wrapped, so any centre is a shift;
//   - the night, once a minute: the darkness (a smooth fade from a small
//     altitude grid, or the civil, nautical and astronomical bands as
//     polygons), the look's hatching, and the city lights where it's dark
//     enough (a seeded speckle round the cities and over the land, kept
//     as a list per resize, look and density);
//   - the base: the background (space and stars, or the look's own), per
//     resize, look and density, with the map band over it composed for
//     the current centre, rebuilt only when the night or the centre changes.
// Each second draws the base and the labels over it.
//
// The three layers are kept at a capped scale (ms, at most the screen's
// pixel ratio): soft fills and hairlines don't show it, and at full
// resolution a 2560×1440 screen at 2× held half a gigabyte of canvases.
// The labels draw on the screen's own canvas, at full resolution.

const WORLD_CLOCK_LOOKS = {
    'night-lights': {
        space: '#040a14', stars: true, sea: ['#14365f', '#0c2547'], seaGlow: 'rgba(80,135,205,0.18)',
        land: '#303845', inner: 'rgba(255,255,255,0.04)', coast: 'rgba(150,178,215,0.42)',
        grid: 'rgba(130,170,230,0.10)', tropic: 'rgba(255,212,121,0.18)', night: [2, 5, 14], dark: 0.7,
        lights: '#ffcf86', lightsAlpha: 1, sunGlow: 0.10,
        ink: '#f2f6ff', dim: 'rgba(214,226,246,0.72)', card: 'rgba(7,14,27,0.80)', edge: 'rgba(160,190,235,0.20)',
        accent: '#ffd479', dot: '#ffe2a0', leader: 'rgba(205,220,245,0.38)', font: 'sans',
    },
    atlas: {
        space: '#0b1a2c', stars: true, sea: ['#b2d8ee', '#93c4e2'], seaGlow: 'rgba(255,255,255,0.45)',
        land: 'latitude', inner: 'rgba(255,255,255,0.22)', coast: 'rgba(84,96,64,0.55)',
        grid: 'rgba(40,86,130,0.17)', tropic: 'rgba(176,82,40,0.38)', night: [12, 24, 64], dark: 0.52,
        lights: '#ffe7a6', lightsAlpha: 0.9, sunGlow: 0,
        ink: '#18222e', dim: 'rgba(30,44,60,0.74)', card: 'rgba(255,255,255,0.88)', edge: 'rgba(30,60,90,0.20)',
        accent: '#d9701f', dot: '#c0392b', leader: 'rgba(30,50,70,0.45)', font: 'sans', labels: true,
    },
    blueprint: {
        space: '#071d36', stars: false, paper: 'rgba(150,205,255,0.07)', sea: ['#114e86', '#0d4578'], seaGlow: null,
        land: 'rgba(170,225,255,0.10)', inner: null, coast: '#a6e3ff',
        grid: 'rgba(170,222,255,0.22)', fine: 'rgba(170,222,255,0.08)', tropic: 'rgba(255,255,255,0.42)', night: [3, 14, 42], dark: 0.5,
        lights: '#dcf7ff', lightsAlpha: 0.85, line: 'rgba(200,240,255,0.85)', sunGlow: 0,
        ink: '#ecf9ff', dim: 'rgba(200,236,255,0.78)', card: 'rgba(9,50,94,0.86)', edge: 'rgba(166,227,255,0.6)',
        accent: '#ffd479', dot: '#ffffff', leader: 'rgba(200,240,255,0.55)', font: 'sans', labels: true,
    },
    paper: {
        space: '#251c13', stars: false, sheet: true, sea: ['#ecdfc0', '#e4d4ae'], seaGlow: 'rgba(120,92,52,0.10)',
        land: '#d9c393', inner: 'rgba(120,88,40,0.10)', coast: '#4b3a26', grain: 'rgba(90,64,30,0.10)',
        grid: 'rgba(80,60,38,0.24)', tropic: 'rgba(150,46,30,0.45)', night: [58, 40, 22], dark: 0.30, hatch: 'rgba(52,36,20,0.42)',
        lights: '#8c3a1a', lightsAlpha: 0.55, sunGlow: 0,
        ink: '#2c2015', dim: 'rgba(52,38,24,0.75)', card: 'rgba(247,239,219,0.93)', edge: 'rgba(80,60,38,0.5)',
        accent: '#9c2f1f', dot: '#9c2f1f', leader: 'rgba(60,44,28,0.55)', font: 'serif', labels: true,
    },
};

// Atlas land by latitude: ice, tundra, forest, steppe and desert, the tropics.
// Pixels across the base, the land and the night together (about 88 MB).
const WORLD_CLOCK_LAYER_PIXELS = 22e6;

const WORLD_CLOCK_BIOMES = [[90, '#f4f6f6'], [72, '#e9ede6'], [62, '#c4d2ad'], [48, '#a9c78d'], [36, '#c9cf98'], [27, '#e5cf9c'],
    [16, '#c9cf8e'], [6, '#93c27c'], [-6, '#8dbf78'], [-18, '#bccb8a'], [-28, '#e2cd9a'], [-40, '#b3c98f'], [-56, '#cbd4b4'], [-64, '#eef1f1'], [-90, '#f6f8f8']];

class WorldClockMap {
    constructor(app) {
        this.app = app;
        this.centre = null;         // the longitude in the middle of the screen now
        this.placed = new Map();    // id → the candidate its card took last time, so labels stay put
        this.cards = [];
        this.nightAt = -1;
    }

    get look() { return WORLD_CLOCK_LOOKS[this.app.config.mapStyle] || WORLD_CLOCK_LOOKS['night-lights']; }
    get font() { return this.look.font === 'serif' ? WorldClockArt.SERIF : WorldClockArt.SANS; }

    // ---- Geometry ----------------------------------------------------------------

    resize() {
        const { W, safe } = this.app;
        this.mw = W;
        this.mh = W / 2;
        const room = safe.bottom - safe.top;
        if (this.mh <= room) this.top = safe.top + (room - this.mh) / 2;
        else {
            // Too wide to fit: crop, keeping about 12°N in the middle.
            const middle = (90 - 12) / 180 * this.mh;
            this.top = WorldClockArt.clamp(safe.top + room / 2 - middle, safe.bottom - this.mh, safe.top);
        }
        this.paths();
        this.base = null;   // built on the next draw
    }

    x(lon) { return (lon + 180) / 360 * this.mw; }
    y(lat) { return (90 - lat) / 180 * this.mh; }

    // Where a place is on screen, for the current centre.
    screen(lon, lat) {
        const d = ((lon - this.centre) % 360 + 540) % 360 - 180;
        return { x: this.app.W / 2 + d / 360 * this.mw, y: this.top + this.y(lat) };
    }

    // The land as one path for filling, and the coasts alone for stroking:
    // no lines along the antimeridian's cuts or Antarctica's edge of the map.
    paths() {
        this.landPath = new Path2D();
        this.coastPath = new Path2D();
        for (const ring of WorldClockMath.land()) {
            ring.forEach(([lon, lat], i) => i ? this.landPath.lineTo(this.x(lon), this.y(lat)) : this.landPath.moveTo(this.x(lon), this.y(lat)));
            this.landPath.closePath();
            let pen = false;
            for (let i = 0; i < ring.length; i++) {
                const [a0, b0] = ring[i], [a1, b1] = ring[(i + 1) % ring.length];
                const seam = (Math.abs(a0) >= 179.9 && Math.abs(a1) >= 179.9) || (b0 <= -89.5 && b1 <= -89.5);
                if (seam) { pen = false; continue; }
                if (!pen) this.coastPath.moveTo(this.x(a0), this.y(b0));
                this.coastPath.lineTo(this.x(a1), this.y(b1));
                pen = true;
            }
        }
    }

    // ---- Cached layers ------------------------------------------------------------

    layers() {
        const { W, H, dpr } = this.app, mw = this.mw, mh = this.mh;
        const ms = this.ms = Math.min(dpr, 4096 / mw, Math.sqrt(WORLD_CLOCK_LAYER_PIXELS / (W * H + 2 * mw * mh)));
        const size = (c, w, h) => { if (!c || c.width !== Math.round(w) || c.height !== Math.round(h)) return WorldClockArt.canvas(w, h); c.getContext('2d').clearRect(0, 0, c.width, c.height); return c; };
        this.landLayer = size(this.landLayer, mw * ms, mh * ms);
        this.night = size(this.night, mw * ms, mh * ms);
        this.base = size(this.base, W * ms, H * ms);
        this.specks = this.hatchTile = null;
        this.drawBackground();
        this.drawLand();
        this.sprites();
        this.nightAt = -1;
        this.stale = true;
    }

    // Another view is showing: let the layers go (built again when drawn).
    release() {
        this.base = this.landLayer = this.night = this.specks = null;
    }

    configure(old, config) {
        const changed = key => old[key] !== config[key];
        if (changed('mapStyle') || changed('showGrid')) this.base = null;
        else if (changed('twilight') || changed('cityLights')) this.nightAt = -1;
        this.stale = true;
    }

    onQuality() {
        this.specks = null;
        if (this.base) this.drawBackground();
        this.nightAt = -1;
        this.stale = true;
    }

    minute() {
        this.nightAt = -1;
        this.stale = true;
    }

    // The background, into the base: the map band goes over it at each compose.
    drawBackground() {
        const { W, H } = this.app, look = this.look, ms = this.ms;
        const g = this.base.getContext('2d');
        g.setTransform(ms, 0, 0, ms, 0, 0);
        g.fillStyle = look.space;
        g.fillRect(0, 0, W, H);
        const rand = WorldClockArt.random(7);
        if (look.stars) {
            const glow = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
            glow.addColorStop(0, 'rgba(40,70,120,0.16)');
            glow.addColorStop(1, 'rgba(0,0,0,0)');
            g.fillStyle = glow;
            g.fillRect(0, 0, W, H);
            const n = Math.round(WorldClockArt.clamp(W * H / 1800, 80, 1400) * this.app.density);
            for (let i = 0; i < n; i++) {
                const x = rand() * W, y = rand() * H, r = rand() ** 4 * 1.3 + 0.35, a = 0.25 + rand() * 0.65;
                const tint = rand();
                g.fillStyle = tint < 0.12 ? `rgba(255,214,170,${a})` : tint < 0.25 ? `rgba(180,205,255,${a})` : `rgba(240,244,255,${a})`;
                g.beginPath();
                g.arc(x, y, r, 0, Math.PI * 2);
                g.fill();
            }
        }
        if (look.paper) {
            // Graph paper in the margins.
            g.strokeStyle = look.paper;
            g.lineWidth = 1;
            const step = 24;
            g.beginPath();
            for (let x = (W / 2) % step; x < W; x += step) { g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); }
            for (let y = 0; y < H; y += step) { g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); }
            g.stroke();
        }
        if (look.sheet) {
            // A sheet on a dark desk: its shadow, and the desk's vignette.
            const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.75);
            v.addColorStop(0, 'rgba(70,52,34,0.6)');
            v.addColorStop(1, 'rgba(0,0,0,0)');
            g.fillStyle = v;
            g.fillRect(0, 0, W, H);
            for (let i = 6; i > 0; i--) {
                g.fillStyle = `rgba(0,0,0,${0.05})`;
                g.fillRect(-i * 2, this.top - i * 1.5 + 4, W + i * 4, this.mh + i * 3);
            }
        }
    }

    drawLand() {
        const { k, config } = this.app, look = this.look, mw = this.mw, mh = this.mh, ms = this.ms;
        const g = this.landLayer.getContext('2d');
        g.setTransform(ms, 0, 0, ms, 0, 0);
        const sea = g.createLinearGradient(0, 0, 0, mh);
        sea.addColorStop(0, look.sea[0]);
        sea.addColorStop(1, look.sea[1]);
        g.fillStyle = sea;
        g.fillRect(0, 0, mw + 1, mh + 1);   // past the canvas's rounding: the layer is opaque to its edge
        g.lineJoin = g.lineCap = 'round';
        const hair = Math.max(0.6, mw / 2000);
        if (look.seaGlow) {
            // Shallows: the coast drawn wide and faint, twice.
            g.strokeStyle = look.seaGlow;
            for (const w of [mw / 180, mw / 420]) { g.lineWidth = w; g.stroke(this.coastPath); }
        }
        if (look.land === 'latitude') {
            const land = g.createLinearGradient(0, 0, 0, mh);
            for (const [lat, colour] of WORLD_CLOCK_BIOMES) land.addColorStop(this.y(lat) / mh, colour);
            g.fillStyle = land;
        } else g.fillStyle = look.land;
        g.fill(this.landPath, 'evenodd');
        if (look.inner) {
            g.save();
            g.clip(this.landPath, 'evenodd');
            g.strokeStyle = look.inner;
            for (const w of [mw / 260, mw / 600]) { g.lineWidth = w; g.stroke(this.coastPath); }
            g.restore();
        }
        if (look.grain) {
            g.save();
            g.clip(this.landPath, 'evenodd');
            const rand = WorldClockArt.random(11);
            g.fillStyle = look.grain;
            for (let i = 0, n = Math.round(mw * mh / 120); i < n; i++) g.fillRect(rand() * mw, rand() * mh, 1, 1);
            g.restore();
        }
        g.strokeStyle = look.coast;
        g.lineWidth = hair * (look.font === 'serif' ? 1.3 : 1);
        g.stroke(this.coastPath);
        if (config.showGrid) this.drawGrid(g, k, hair);
    }

    drawGrid(g, k, hair) {
        const look = this.look, mw = this.mw, mh = this.mh;
        const lines = (step, colour, width) => {
            g.strokeStyle = colour;
            g.lineWidth = width;
            g.beginPath();
            for (let lon = -180 + step; lon < 180; lon += step) { g.moveTo(this.x(lon), 0); g.lineTo(this.x(lon), mh); }
            for (let lat = -90 + step; lat < 90; lat += step) { g.moveTo(0, this.y(lat)); g.lineTo(mw, this.y(lat)); }
            g.stroke();
        };
        if (look.fine) lines(5, look.fine, hair * 0.8);
        lines(look.fine ? 15 : 30, look.grid, hair);
        // The equator a little stronger; the tropics and polar circles dashed.
        g.beginPath();
        g.moveTo(0, this.y(0));
        g.lineTo(mw, this.y(0));
        g.lineWidth = hair * 1.6;
        g.stroke();
        const tilt = 23.44;
        g.strokeStyle = look.tropic;
        g.lineWidth = hair * 1.2;
        g.setLineDash([mw / 300, mw / 400]);
        g.beginPath();
        for (const lat of [tilt, -tilt, 90 - tilt, tilt - 90]) { g.moveTo(0, this.y(lat)); g.lineTo(mw, this.y(lat)); }
        g.stroke();
        g.setLineDash([]);
        if (look.labels && mw >= 900) {
            g.font = `italic ${Math.round(9 * Math.min(k, 1.4))}px ${this.font}`;
            g.fillStyle = look.tropic;
            g.textBaseline = 'bottom';
            const at = this.x(-158);
            for (const [lat, name] of [[tilt, 'Tropic of Cancer'], [-tilt, 'Tropic of Capricorn'], [90 - tilt, 'Arctic Circle'], [tilt - 90, 'Antarctic Circle'], [0, 'Equator']]) {
                g.fillText(name, at, this.y(lat) - 2);
            }
        }
    }

    // Small sprites: the sun's glow and its wide daylight wash (both drawn
    // into the base), the home's halo (on screen).
    sprites() {
        const { k, dpr } = this.app;
        const s = Math.round(72 * k * this.ms);
        this.sunSprite = WorldClockArt.glow(s, [[0, 'rgba(255,252,236,1)'], [0.1, 'rgba(255,240,196,0.95)'], [0.18, 'rgba(255,214,121,0.55)'], [0.45, 'rgba(255,190,90,0.14)'], [1, 'rgba(255,170,60,0)']]);
        this.homeSprite = WorldClockArt.glow(Math.round(36 * k * dpr), [[0, 'rgba(255,212,121,0.7)'], [0.35, 'rgba(255,212,121,0.25)'], [1, 'rgba(255,212,121,0)']]);
        const wash = this.look.sunGlow;
        this.washSprite = wash ? WorldClockArt.glow(256, [[0, `rgba(255,214,150,${wash})`], [0.5, `rgba(255,200,130,${wash * 0.4})`], [1, 'rgba(255,190,120,0)']]) : null;
    }

    // The city lights: clusters round every listed city and a thin sprinkle
    // over the rest of the land, as specks, in tenths of the screen.
    scatter() {
        const look = this.look, mw = this.mw;
        const rand = WorldClockArt.random(1234);
        const gauss = () => (rand() + rand() + rand() - 1.5) * 1.15;
        const density = this.app.density, dot = Math.max(0.7, mw / 1600);
        const specks = [];
        const speck = (lon, lat, a, r = dot) => specks.push({ lon, lat, x: this.x(lon) - r / 2, y: this.y(lat) - r / 2, r, a: a * look.lightsAlpha });
        for (const city of WORLD_CITIES) {
            const n = Math.round(26 * density);
            for (let i = 0; i < n; i++) speck(city.lon + gauss() * 2.2, city.lat + gauss() * 1.6, 0.25 + rand() * 0.6);
            speck(city.lon, city.lat, 0.95, dot * 2.2);
        }
        const probe = this.night.getContext('2d');
        probe.setTransform(1, 0, 0, 1, 0, 0);
        for (let i = 0, n = Math.round(5200 * density); i < n; i++) {
            const lon = rand() * 360 - 180, lat = Math.asin(rand() * 2 - 1) / Math.PI * 180;
            if (Math.abs(lat) > 62 && rand() < 0.9) continue;
            if (!probe.isPointInPath(this.landPath, this.x(lon), this.y(lat), 'evenodd')) continue;
            speck(lon, lat, 0.12 + rand() * 0.4);
        }
        return specks;
    }

    // The night for `date`, into this.night, in one canvas: the darkness;
    // the hatching (the pattern kept where it's dark, then the darkness
    // again under it); the lights, clipped to the land, each as bright as
    // its own sun is deep (soft) or on past the twilight's depth (sharp);
    // the terminator line.
    drawNight(date) {
        const app = this.app, look = this.look, ms = this.ms, mw = this.mw;
        const sun = WorldClockMath.subsolar(date);
        const bands = app.fx('twilight');
        const soft = bands && app.config.twilight === 'soft';
        const lights = app.config.cityLights && app.fx('cityLights') && look.lights;
        const [r, gr, b] = look.night;
        const S = WorldClockArt.smooth;
        const g = this.night.getContext('2d'), w = this.night.width, h = this.night.height;
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 1;
        g.clearRect(0, 0, w, h);
        let shapes = null;
        if (soft) {
            // A smooth fade: the sun's altitude on a 1° grid, the darkness a
            // curve through the twilights, scaled up smoothly.
            const RW = 360, RH = 180;
            this.grid = this.grid || WorldClockArt.canvas(RW, RH);
            const gg = this.grid.getContext('2d');
            const shade = gg.createImageData(RW, RH);
            const sd = Math.sin(sun.lat * Math.PI / 180), cd = Math.cos(sun.lat * Math.PI / 180);
            const cosLon = new Float64Array(RW);
            for (let i = 0; i < RW; i++) cosLon[i] = Math.cos(((-180 + i + 0.5) - sun.lon) * Math.PI / 180);
            for (let j = 0; j < RH; j++) {
                const lat = (90 - j - 0.5) * Math.PI / 180, sl = Math.sin(lat) * sd, cl = Math.cos(lat) * cd;
                for (let i = 0; i < RW; i++) {
                    const alt = Math.asin(Math.max(-1, Math.min(1, sl + cl * cosLon[i]))) * 180 / Math.PI;
                    const d = 0.52 * S(0.6, -6, alt) + 0.27 * S(-6, -12, alt) + 0.21 * S(-12, -18, alt);
                    const o = (j * RW + i) * 4;
                    shade.data[o] = r; shade.data[o + 1] = gr; shade.data[o + 2] = b;
                    shade.data[o + 3] = Math.round(d * look.dark * 255);
                }
            }
            gg.putImageData(shade, 0, 0);
        } else {
            // Polygons: the night, and with the bands each twilight deeper.
            // Four layers that stack to about the whole darkness; all one
            // colour, so they stack the same in any order.
            const A = look.dark;
            const share = [0.58, 0.3, 0.24, 0.2], total = 1 - share.reduce((p, s) => p * (1 - s), 1);
            shapes = bands
                ? [0, 6, 12, 18].map((depth, i) => [depth ? WorldClockMath.twilight(date, depth, 240) : WorldClockMath.terminator(date, 240), share[i] * A / total])
                : [[WorldClockMath.terminator(date, 240), A]];
        }
        const darkness = () => {
            if (soft) {
                g.setTransform(1, 0, 0, 1, 0, 0);
                g.imageSmoothingEnabled = true;
                g.imageSmoothingQuality = 'high';
                g.drawImage(this.grid, 0, 0, w, h);
                return;
            }
            g.setTransform(ms, 0, 0, ms, 0, 0);
            for (const [rings, a] of shapes) {
                g.fillStyle = `rgba(${r},${gr},${b},${a})`;
                g.beginPath();
                for (const ring of rings) ring.forEach(([lon, lat], i) => i ? g.lineTo(this.x(lon), this.y(lat)) : g.moveTo(this.x(lon), this.y(lat)));
                g.fill();
            }
        };
        darkness();
        if (look.hatch) {
            // Engraved night: diagonal hatching where it's dark.
            if (!this.hatchTile) {
                const s = Math.max(4, Math.round(5 * ms)), t = WorldClockArt.canvas(s, s), tg = t.getContext('2d');
                tg.strokeStyle = look.hatch;
                tg.lineWidth = Math.max(1, ms * 0.8);
                tg.beginPath();
                tg.moveTo(0, s); tg.lineTo(s, 0);
                tg.moveTo(-1, 1); tg.lineTo(1, -1);
                tg.moveTo(s - 1, s + 1); tg.lineTo(s + 1, s - 1);
                tg.stroke();
                this.hatchTile = t;
            }
            g.setTransform(1, 0, 0, 1, 0, 0);
            g.globalCompositeOperation = 'source-in';
            g.fillStyle = g.createPattern(this.hatchTile, 'repeat');
            g.fillRect(0, 0, w, h);
            g.globalCompositeOperation = 'destination-over';
            darkness();
            g.globalCompositeOperation = 'source-over';
        }
        if (lights) {
            if (!this.specks) this.specks = this.scatter();
            const deep = bands ? 4 : 0.5;
            g.save();
            g.setTransform(ms, 0, 0, ms, 0, 0);
            g.clip(this.landPath, 'evenodd');
            g.fillStyle = look.lights;
            for (const p of this.specks) {
                const alt = WorldClockMath.sunAltitude(p.lat, p.lon, date, sun);
                const on = soft ? S(-2.5, -10, alt) : alt < -deep ? 1 : 0;
                if (!on) continue;
                g.globalAlpha = p.a * on;
                g.fillRect(p.x, p.y, p.r, p.r);
            }
            g.restore();
        }
        if (look.line) {
            // The terminator itself, dashed, without the map's edges.
            g.setTransform(ms, 0, 0, ms, 0, 0);
            g.strokeStyle = look.line;
            g.lineWidth = Math.max(0.8, mw / 1600);
            g.setLineDash([mw / 260, mw / 360]);
            g.beginPath();
            for (const ring of WorldClockMath.terminator(date, 240)) {
                for (let i = 0; i < ring.length; i++) {
                    const [a0, b0] = ring[i], [a1, b1] = ring[(i + 1) % ring.length];
                    if ((Math.abs(b0) >= 89.99 && Math.abs(b1) >= 89.99) || (a0 === a1 && Math.abs(a0) >= 179.99)) continue;
                    g.moveTo(this.x(a0), this.y(b0));
                    g.lineTo(this.x(a1), this.y(b1));
                }
            }
            g.stroke();
            g.setLineDash([]);
        }
        this.nightAt = Math.floor(date.getTime() / 60000);
    }

    // ---- Motion -------------------------------------------------------------------

    // The centre eases to where it should be: a tapped home, the setting,
    // or (on Android) a little either way as the home screens swipe.
    update(dt) {
        const app = this.app;
        if (app.config.view !== 'map') return false;
        const target = app.centerLon() + (app.scroll - 0.5) * 60;
        if (this.centre === null || app.host.reducedMotion) { if (this.centre !== target) this.stale = true; this.centre = target; return false; }
        const d = ((target - this.centre) % 360 + 540) % 360 - 180;
        if (Math.abs(d) < 0.05) { if (d) { this.centre = target; this.stale = true; } return false; }
        this.centre += d * Math.min(1, dt * 4.5);
        this.stale = true;
        return true;
    }

    // ---- Drawing ------------------------------------------------------------------

    // The map band over the background already in the base: the land
    // (opaque, so it covers the last compose), the night, the sun and moon,
    // all clipped to whole pixels so nothing builds up at the band's edges.
    composeBase(date) {
        const app = this.app, { W } = app, look = this.look, ms = this.ms;
        if (this.nightAt !== Math.floor(date.getTime() / 60000)) this.drawNight(date);
        const g = this.base.getContext('2d');
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalAlpha = 1;
        const shift = W / 2 - this.x(this.centre);
        const x0 = Math.round((((shift % this.mw) + this.mw) % this.mw) * ms), y0 = Math.round(this.top * ms), w = this.landLayer.width;
        g.save();
        g.beginPath();
        g.rect(0, y0, this.base.width, this.landLayer.height);
        g.clip();
        for (const layer of [this.landLayer, this.night]) {
            g.drawImage(layer, x0, y0);
            g.drawImage(layer, x0 - w, y0);
        }
        g.setTransform(ms, 0, 0, ms, 0, 0);
        // The sun overhead, with a wide wash of daylight round it; the moon.
        const wraps = (x, r, draw) => { for (const dx of [-W, 0, W]) if (x + dx > -r && x + dx < W + r) draw(x + dx); };
        const sun = app.sun || WorldClockMath.subsolar(date);
        const at = this.screen(sun.lon, sun.lat);
        if (this.washSprite) {
            const r = this.mw * 0.3;
            wraps(at.x, r, x => g.drawImage(this.washSprite, x - r, at.y - r, 2 * r, 2 * r));
        }
        if (app.config.showMoon) {
            const moon = app.moon || WorldClockMath.sublunar(date), m = this.screen(moon.lon, moon.lat), r = 5.5 * app.k;
            wraps(m.x, r * 3, x => {
                g.fillStyle = look.stars ? 'rgba(220,230,255,0.10)' : 'rgba(255,255,255,0.12)';
                g.beginPath();
                g.arc(x, m.y, r * 2.1, 0, Math.PI * 2);
                g.fill();
                WorldClockArt.moon(g, x, m.y, r, moon.age, look.font === 'serif' ? '#fbf4e2' : '#eef1f8', look.font === 'serif' ? 'rgba(60,44,28,0.75)' : 'rgba(40,50,72,0.85)');
            });
        }
        if (app.config.showSun) {
            const r = 36 * app.k;
            wraps(at.x, r, x => g.drawImage(this.sunSprite, x - r, at.y - r, 2 * r, 2 * r));
        }
        g.restore();
        this.stale = false;
    }

    // The label for a place, measured: a card with the name, the time (big)
    // and a line of details, or a compact one-line card when space runs out.
    measure(g, info, compact) {
        const { k, config } = this.app, font = this.font, pad = 7 * k;
        const details = [];
        if (config.showDate) details.push(info.date);
        else if (info.dayDelta) details.push(info.weekday);
        if (config.showOffset) details.push(info.offset);
        const detail = details.join(' · ');
        g.font = `600 ${11 * k}px ${font}`;
        const nameW = g.measureText(info.name).width + 16 * k;
        if (compact) {
            g.font = `600 ${13 * k}px ${font}`;
            const timeW = g.measureText(info.split.main.replace(/\d/g, '8')).width + (info.split.rest ? g.measureText(` ${info.split.rest}`).width * 0.75 : 0);
            return { w: pad * 2 + nameW + 6 * k + timeW, h: pad * 1.2 + 15 * k, detail: '', compact };
        }
        g.font = `600 ${21 * k}px ${font}`;
        let timeW = g.measureText(info.split.main.replace(/\d/g, '8')).width;
        if (info.split.rest) { g.font = `500 ${11 * k}px ${font}`; timeW += g.measureText(info.split.rest).width + 4 * k; }
        g.font = `${10.5 * k}px ${font}`;
        const detailW = detail ? g.measureText(detail).width : 0;
        return { w: pad * 2 + Math.max(nameW, timeW, detailW), h: pad * 2 + 11 * k + 4 * k + 21 * k + (detail ? 4 * k + 10.5 * k : 0), detail, compact };
    }

    // Greedy label placement: the home first, then each place in turn takes
    // the first spot round its dot (near, then further out, then the sky
    // above and below the map) that doesn't cover a card or a dot, keeping
    // last time's spot when it's still free.
    place(g, dots) {
        const app = this.app, { W, safe, k } = app, m = 6 * k;
        const lo = { x: safe.left + m, y: safe.top + m }, hi = { x: safe.right - m, y: safe.bottom - m };
        const placed = [...(this.hero ? [this.hero] : [])];
        const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
        const dotBox = d => ({ x: d.x - 5 * k, y: d.y - 5 * k, w: 10 * k, h: 10 * k });
        const order = [...dots].sort((a, b) => (b.info.home ? 1 : 0) - (a.info.home ? 1 : 0));
        const cards = [];
        for (const dot of order) {
            let best = null;
            for (const compact of [false, true]) {
                const size = this.measure(g, dot.info, compact), { w, h } = size;
                const spots = [];
                for (const r of [8 * k, 34 * k, 70 * k, 120 * k, 190 * k]) {
                    const q = r * 0.72;
                    spots.push([r, -h / 2], [-r - w, -h / 2], [q, -q - h], [q, q], [-q - w, -q - h], [-q - w, q], [-w / 2, -r - h], [-w / 2, r]);
                }
                const near = spots.map(([dx, dy]) => ({ x: dot.x + dx, y: dot.y + dy }));
                // The sky above and below the map: on a tall screen (a phone)
                // the labels go there first, on leader lines, and leave the
                // map clear; the nearer band first.
                const sky = [];
                const north = dot.y < this.top + this.mh / 2;
                for (let row = 0; row < 6; row++) {
                    for (const dx of [0, -0.6, 0.6, -1.2, 1.2]) {
                        const above = { x: dot.x - w / 2 + dx * w, y: this.top - (8 * k + h) * (row + 1) };
                        const below = { x: dot.x - w / 2 + dx * w, y: this.top + this.mh + 8 * k + (8 * k + h) * row };
                        sky.push(...(north ? [above, below] : [below, above]));
                    }
                }
                const tall = Math.min(this.top - safe.top, safe.bottom - this.top - this.mh) > 3 * h;
                const list = tall ? [...sky, ...near] : [...near, ...sky];
                list.forEach((spot, i) => { spot.index = i; });
                const remembered = this.placed.get(dot.info.id);
                if (remembered && remembered.compact === compact && list[remembered.index]) list.unshift(list[remembered.index]);
                for (const spot of list) {
                    const box = { x: WorldClockArt.clamp(spot.x, lo.x, Math.max(lo.x, hi.x - w)), y: WorldClockArt.clamp(spot.y, lo.y, Math.max(lo.y, hi.y - h)), w, h };
                    let cost = 0;
                    for (const other of placed) cost += overlap(box, other);
                    for (const d of dots) if (d !== dot) cost += overlap(box, dotBox(d)) * 0.6;
                    // Clamped into the screen far from where it wanted to be: a little worse.
                    cost += (Math.abs(box.x - spot.x) + Math.abs(box.y - spot.y)) * 0.5;
                    if (!best || cost < best.cost - 0.01) best = { ...box, ...size, cost, index: spot.index, compact };
                    if (cost === 0) break;
                }
                if (best.cost === 0) break;
            }
            this.placed.set(dot.info.id, { index: best.index, compact: best.compact });
            const card = { ...best, info: dot.info, dot };
            placed.push(card);
            cards.push(card);
        }
        return cards;
    }

    draw(g, date) {
        const app = this.app, { k, dpr } = app, look = this.look, font = this.font;
        if (this.centre === null) this.centre = app.centerLon() + (app.scroll - 0.5) * 60;
        if (!this.base) this.layers();
        if (this.stale || this.nightAt !== Math.floor(date.getTime() / 60000)) this.composeBase(date);
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.drawImage(this.base, 0, 0, g.canvas.width, g.canvas.height);
        g.setTransform(dpr, 0, 0, dpr, 0, 0);

        this.hero = this.drawHero(g, date);
        const dots = app.infos.map(info => ({ info, ...this.screen(info.place.lon, info.place.lat) }));
        const cards = this.cards = this.place(g, dots);

        // Leader lines, then dots, then cards.
        g.strokeStyle = look.leader;
        g.lineWidth = Math.max(0.8, k * 0.9);
        g.beginPath();
        for (const c of cards) {
            const px = WorldClockArt.clamp(c.dot.x, c.x, c.x + c.w), py = WorldClockArt.clamp(c.dot.y, c.y, c.y + c.h);
            if (Math.hypot(px - c.dot.x, py - c.dot.y) > 9 * k) { g.moveTo(c.dot.x, c.dot.y); g.lineTo(px, py); }
        }
        g.stroke();
        for (const d of dots) {
            if (d.info.home) g.drawImage(this.homeSprite, d.x - 18 * k, d.y - 18 * k, 36 * k, 36 * k);
            g.beginPath();
            g.arc(d.x, d.y, (d.info.home ? 4.2 : 3.2) * k, 0, Math.PI * 2);
            g.fillStyle = d.info.home ? look.accent : look.dot;
            g.fill();
            g.lineWidth = 1.4 * k;
            g.strokeStyle = look.card;
            g.stroke();
            if (!d.info.place.located) {
                // Placed by its offset alone: a ring, not a dot.
                g.beginPath();
                g.arc(d.x, d.y, 6 * k, 0, Math.PI * 2);
                g.strokeStyle = look.leader;
                g.stroke();
            }
        }
        let bottom = this.hero ? this.hero.y + this.hero.h : 0;
        for (const c of cards) {
            this.card(g, c, font);
            bottom = Math.max(bottom, c.y + c.h);
        }
        return { bottom, cards: cards.map(c => ({ id: c.info.id, x: c.x, y: c.y, w: c.w, h: c.h, text: [c.info.name, c.info.text, c.detail].join(' | ') })), centre: this.centre, top: this.top, mapHeight: this.mh };
    }

    card(g, c, font) {
        const { k } = this.app, look = this.look, info = c.info, pad = 7 * k;
        WorldClockArt.rounded(g, c.x, c.y, c.w, c.h, 7 * k);
        g.fillStyle = look.card;
        g.fill();
        g.lineWidth = info.home ? 1.6 * k : 1;
        g.strokeStyle = info.home ? look.accent : look.edge;
        g.stroke();
        const glyphColour = info.phase === 'day' ? (look.font === 'serif' ? '#b5651d' : look.ink === '#18222e' ? '#e08a1e' : '#ffd479') : look.dim;
        g.textBaseline = 'alphabetic';
        g.textAlign = 'left';
        if (c.compact) {
            const y = c.y + c.h / 2 + 4.5 * k;
            g.font = `600 ${11 * k}px ${font}`;
            g.fillStyle = info.home ? look.accent : look.dim;
            g.fillText(info.name, c.x + pad, y);
            g.font = `600 ${13 * k}px ${font}`;
            g.fillStyle = look.ink;
            g.textAlign = 'right';
            g.fillText(info.text, c.x + c.w - pad, y);
            g.textAlign = 'left';
            return;
        }
        let y = c.y + pad + 10 * k;
        g.font = `600 ${11 * k}px ${font}`;
        g.fillStyle = info.home ? look.accent : look.dim;
        g.fillText(info.name, c.x + pad, y);
        const s = 12 * k;
        g.drawImage(WorldClockArt.glyph(info.phase, s * this.app.dpr, glyphColour), c.x + c.w - pad - s, y - s * 0.85, s, s);
        y += 4 * k + 19 * k;
        const { main, rest, before } = info.split;
        g.fillStyle = look.ink;
        let x = c.x + pad;
        const small = () => { g.font = `500 ${11 * k}px ${font}`; g.fillStyle = look.dim; g.fillText(rest, x, y); x += g.measureText(rest).width + 4 * k; };
        if (rest && before) small();
        g.font = `600 ${21 * k}px ${font}`;
        g.fillStyle = info.home ? look.accent : look.ink;
        g.fillText(main, x, y);
        x += g.measureText(main).width + 4 * k;
        if (rest && !before) small();
        if (c.detail) {
            y += 4 * k + 11 * k;
            g.font = `${10.5 * k}px ${font}`;
            g.fillStyle = look.dim;
            g.fillText(c.detail, c.x + pad, y);
        }
    }

    // On a tall screen (a phone), the home's time large in the sky above.
    drawHero(g, date) {
        const app = this.app, { W, safe, k } = app, look = this.look;
        const band = this.top - safe.top;
        const home = app.infos.find(i => i.home);
        if (!home || band < app.H * 0.2) return null;
        const size = Math.min(W * 0.17, band * 0.3), cx = W / 2;
        const top = safe.top + band * 0.18;
        g.textAlign = 'center';
        g.textBaseline = 'alphabetic';
        g.font = `600 ${size * 0.2}px ${this.font}`;
        g.fillStyle = look.stars || look.sheet || look.paper ? 'rgba(214,226,246,0.72)' : look.dim;
        g.fillText(home.place.id === 'local' ? 'Here' : home.name, cx, top + size * 0.2);
        g.font = `300 ${size}px ${this.font}`;
        g.fillStyle = look.sheet ? '#f3e7cc' : '#f4f7ff';
        const { main, rest } = home.split;
        g.fillText(main, cx, top + size * 1.2);
        const mainW = g.measureText(main).width;
        if (rest) {
            g.font = `500 ${size * 0.26}px ${this.font}`;
            g.textAlign = 'left';
            g.fillText(rest, cx + mainW / 2 + size * 0.06, top + size * 1.2);
            g.textAlign = 'center';
        }
        g.font = `500 ${size * 0.2}px ${this.font}`;
        g.fillStyle = look.sheet ? 'rgba(243,231,204,0.7)' : 'rgba(214,226,246,0.72)';
        g.fillText(app.format({ weekday: 'long', day: 'numeric', month: 'long', timeZone: home.place.zone === 'local' ? undefined : home.place.zone }).format(date), cx, top + size * 1.62);
        g.textAlign = 'left';
        const w = Math.max(mainW, size * 3);
        return { x: cx - w / 2, y: top - size * 0.05, w, h: size * 1.75 };
    }

    hit(x, y) {
        const k = this.app.k;
        for (const c of [...this.cards].reverse()) if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) return c.info.id;
        for (const c of this.cards) if (Math.hypot(x - c.dot.x, y - c.dot.y) < 16 * k) return c.info.id;
        return null;
    }
}
