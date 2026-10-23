// Satellites (SPEC §10.20): the sky over you as it darkens, with real
// satellites crossing it. Each is propagated with SGP4 (sgp4.js) from
// CelesTrak's elements (data.js) and drawn when you could see it: above the
// horizon, in sunlight, against a twilight or night sky. In Earth's shadow
// it fades out mid-sky, as the real ones do.
//
// The view is a stereographic projection centred on the horizon in the
// facing direction: the horizon is a straight line, the zenith is at the
// top of a landscape screen (a little behind you on a portrait one), and
// passes curve across like they do in a wide-angle photo.
//
// Cost: one cached layer (sky colour from the sun's real position, a seeded
// starfield turning with sidereal time, the Milky Way and the horizon)
// rebuilt every 30 s; satellites recomputed once a second and interpolated
// between; idle between those when nothing on screen moves.

const SAT_DEG = Math.PI / 180;
const satClamp = (x, a, b) => Math.min(b, Math.max(a, x));
const satMix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const satCompass = az => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(az / 45) % 8];

// The sky by the sun's elevation: zenith, horizon towards the sun, horizon
// away from it. Interpolated between rows.
const SAT_SKY = [
    [-18, [4, 6, 15], [22, 26, 46], [17, 21, 40]],
    [-12, [7, 11, 28], [40, 36, 62], [21, 25, 47]],
    [-9, [10, 16, 40], [74, 52, 74], [22, 26, 52]],
    [-6, [18, 28, 66], [152, 84, 78], [44, 48, 86]],
    [-3, [30, 48, 102], [228, 120, 74], [84, 86, 136]],
    [0, [44, 72, 135], [250, 154, 94], [118, 124, 170]],
    [6, [58, 100, 175], [236, 204, 160], [152, 176, 214]],
    [20, [52, 108, 200], [172, 206, 240], [150, 190, 235]],
];

// Star colours, hot to cool, with how common they look.
const SAT_TINTS = [[190, 205, 255, 0.12], [235, 240, 255, 0.38], [255, 244, 228, 0.32], [255, 214, 170, 0.18]];

// Galactic to equatorial (J2000): the transpose of the IAU rotation.
const SAT_GALACTIC = [
    [-0.0548755604, 0.4941094279, -0.8676661490],
    [-0.8734370902, -0.4448296300, -0.1980763734],
    [-0.4838350155, 0.7469822445, 0.4559837762],
];

class SatellitesAnimationManager {
    constructor(host) {
        this.host = host;
        this.config = WP.settings.load();
        this.density = host.quality.density;
        this.canvas = null;
        this.ctx = null;
        this.view = null;
        this.layer = null;          // sky, stars, sun and ground
        this.layerAt = -Infinity;   // performance.now() of its last build
        this.layerDirty = true;
        this.sats = [];
        this.hits = [];             // what's on screen, for taps
        this.source = 'sample';     // 'live', 'cache' or 'sample'
        this.records = [];
        this.place = null;
        this.observer = null;
        this.t0 = 0;                // sky times (ms) of the two computed positions
        this.t1 = 0;
        this.sun = null;
        this.twilight = 0;
        this.counts = { up: 0, lit: 0 };
        this.pan = 0;
        this.panTarget = 0;
        this.info = null;           // a tapped satellite: { s, until }
        this.pass = null;           // the station's next visible pass
        this.passFor = null;
        this.status = { text: '', canvas: null };
        this.frameId = null;
        this.last = 0;
        this.running = false;
        this.timers = [];
    }

    async init() {
        this.place = await this.host.location();
        this.observer = SatMath.observer(this.place || this.genericPlace());
        this.loadElements();
    }

    // No location yet: a mid-northern latitude, at the longitude the time
    // zone suggests, so dusk comes about when it does outside.
    genericPlace() {
        return { lat: 45, lon: WP.roundLocation(0, -this.host.now().getTimezoneOffset() / 4).lon };
    }

    // ---- Elements -------------------------------------------------------------

    groups() {
        return SatData.GROUPS[this.config.group] || SatData.GROUPS.visual;
    }

    // Cached elements now; a fetch in the background if a group is due.
    loadElements() {
        const groups = this.groups();
        this.records = groups.map(group => this.host.storage.get(`gp-${group}`));
        this.useElements(this.records.some(r => r?.elements) ? 'cache' : 'sample');
        if (this.host.params.thumb) return;
        const due = groups.filter((group, i) => SatData.due(this.records[i], Date.now()));
        if (due.length) this.refresh(due);
    }

    async refresh(due) {
        const token = this.token = {};
        let fetched = false;
        for (const group of due) {
            const key = `gp-${group}`;
            this.host.storage.set(key, { ...this.host.storage.get(key), tried: Date.now() });
            try {
                const elements = await SatData.fetchGroup(group);
                this.host.storage.set(key, { fetched: Date.now(), tried: Date.now(), elements });
                fetched = true;
            } catch (error) {
                console.warn(`satellites: no ${group} elements from CelesTrak (${error.message}); trying again in an hour`);
            }
        }
        if (token !== this.token || !fetched) return;
        this.records = this.groups().map(group => this.host.storage.get(`gp-${group}`));
        this.useElements('live');
    }

    useElements(source) {
        const elements = SatData.merge(this.records);
        this.source = elements.length ? source : 'sample';
        this.elements = elements.length ? elements : SatData.sample();
        this.sats = [];
        for (const omm of this.elements) {
            try {
                this.sats.push({ rec: SatMath.init(omm), name: omm.OBJECT_NAME, ...SatData.kind(omm), a: null, b: null, docked: false });
            } catch {}   // deep-space orbits and broken elements
        }
        // Stations last, so they're drawn on top.
        this.sats.sort((x, y) => (x.type === 'station') - (y.type === 'station'));
        this.station = this.sats.find(s => s.rec.id === 25544) || this.sats.find(s => s.type === 'station') || null;
        this.t1 = 0;
        this.pass = null;
        this.passFor = null;
        if (this.running) this.schedulePass(50);
    }

    // ---- Lifecycle ------------------------------------------------------------

    start() {
        if (this.running) return;
        this.running = true;
        const canvas = this.canvas = document.createElement('canvas');
        Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: '-1', pointerEvents: 'none' });
        document.body.appendChild(canvas);
        this.ctx = canvas.getContext('2d');
        this.onResize = () => this.resize();
        window.addEventListener('resize', this.onResize);
        this.resize();
        this.listen();
        this.schedulePass(400);
        this.frameId = requestAnimationFrame(t => this.frame(t));
    }

    stop() {
        this.running = false;
        this.token = null;
        cancelAnimationFrame(this.frameId);
        window.removeEventListener('resize', this.onResize);
        this.stopGestures?.();
        this.stopGestures = null;
        for (const timer of this.timers) clearTimeout(timer);
        this.canvas?.remove();
        this.canvas = this.ctx = this.layer = null;
    }

    // Taps show a satellite's details, unless touch is to be ignored.
    listen() {
        this.stopGestures?.();
        this.stopGestures = this.config.tapInfo && !this.host.params.thumb
            ? this.host.gestures({ tap: (x, y) => this.tap(x, y) }) : null;
    }

    applySettings(config) {
        const old = this.config;
        this.config = config;
        if (config.group !== old.group) this.loadElements();
        if (config.tapInfo !== old.tapInfo) this.listen();
        if (['facing', 'horizon', 'stars', 'milkyWay'].some(key => config[key] !== old[key])) this.resize();
    }

    onQuality(quality) {
        if (quality.density === this.density) return;
        this.density = quality.density;
        this.makeStars();
        this.layerDirty = true;
    }

    // Android home screens: the view slides a little either way.
    onScroll(x) {
        this.panTarget = satClamp(x, 0, 1) - 0.5;
    }

    resize() {
        if (!this.canvas) return;
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = Math.round(innerWidth * dpr);
        this.canvas.height = Math.round(innerHeight * dpr);
        this.dpr = this.canvas.width / innerWidth;
        this.buildView();
        this.makeSprites();
        this.makeTerrain();
        this.makeStars();
        this.layerDirty = true;
        this.status.text = '';
        this.t1 = 0;   // positions again, for the new view
    }

    // ---- The view --------------------------------------------------------------

    facing() {
        const named = { north: 0, east: 90, south: 180, west: 270 }[this.config.facing];
        return named ?? (this.observer.lat >= 0 ? 180 : 0);   // towards the equator
    }

    // The layer is wider than the screen, so a home-screen swipe can pan it.
    buildView() {
        const W = this.canvas.width, H = this.canvas.height;
        const pad = Math.round(W * 0.12);
        const ground = Math.max(H * 0.14, (this.host.insets.bottom + 34) * this.dpr + H * 0.04);
        const horizon = Math.round(H - ground);
        // Landscape: horizon to zenith. Portrait: a little past it.
        const tall = satClamp((1 - W / H) / 0.55, 0, 1);
        const span = (90 + 25 * tall) * SAT_DEG;
        const az = this.facing() * SAT_DEG;
        this.view = {
            W, H, pad, LW: W + 2 * pad, cx: W / 2 + pad, cy: horizon,
            f: horizon / (2 * Math.tan(span / 2)),
            fwd: [Math.sin(az), Math.cos(az)], right: [Math.cos(az), -Math.sin(az)],
        };
    }

    // East/north/up → layer pixels, or null well behind the viewer.
    project(d) {
        const v = this.view;
        const c = d[0] * v.fwd[0] + d[1] * v.fwd[1];
        if (c < -0.6) return null;
        const k = 2 * v.f / (1 + c);
        return [v.cx + k * (d[0] * v.right[0] + d[1] * v.right[1]), v.cy - k * d[2]];
    }

    direction(az, el) {
        const a = az * SAT_DEG, e = el * SAT_DEG;
        return [Math.sin(a) * Math.cos(e), Math.cos(a) * Math.cos(e), Math.sin(e)];
    }

    // ---- Sprites, terrain, stars ------------------------------------------------

    sprite(size, stops) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const g = canvas.getContext('2d');
        const gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        for (const [at, colour] of stops) gradient.addColorStop(at, colour);
        g.fillStyle = gradient;
        g.fillRect(0, 0, size, size);
        return canvas;
    }

    makeSprites() {
        this.sprites = {
            glow: this.sprite(64, [[0, 'rgba(255,255,255,1)'], [0.08, 'rgba(235,242,255,0.9)'], [0.22, 'rgba(190,210,255,0.28)'], [1, 'rgba(160,190,255,0)']]),
            warm: this.sprite(64, [[0, 'rgba(255,255,250,1)'], [0.08, 'rgba(255,246,225,0.95)'], [0.24, 'rgba(255,215,160,0.32)'], [1, 'rgba(255,190,130,0)']]),
            star: this.sprite(16, [[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,0.5)'], [1, 'rgba(255,255,255,0)']]),
            cloud: this.sprite(64, [[0, 'rgba(200,212,255,1)'], [0.25, 'rgba(190,204,248,0.6)'], [0.5, 'rgba(180,195,240,0.24)'], [0.75, 'rgba(175,190,238,0.06)'], [1, 'rgba(170,185,235,0)']]),
            sun: this.sprite(128, [[0, 'rgba(255,250,235,1)'], [0.06, 'rgba(255,240,200,0.95)'], [0.2, 'rgba(255,200,130,0.35)'], [1, 'rgba(255,170,100,0)']]),
        };
        const ring = this.sprites.ring = document.createElement('canvas');
        ring.width = ring.height = 16;
        const g = ring.getContext('2d');
        g.strokeStyle = 'rgba(200,215,240,1)';
        g.lineWidth = 1.4;
        g.beginPath();
        g.arc(8, 8, 4.5, 0, Math.PI * 2);
        g.stroke();
    }

    // The skyline, in degrees above the horizon by azimuth: a far ridge, a
    // near one, and conifers on it. Seeded, so it's the same every day.
    makeTerrain() {
        const style = this.config.horizon;
        const random = WP.seededRandom(style === 'forest' ? 11 : 5);
        const waves = (n, amp) => Array.from({ length: n }, (_, k) => ({ k: k + 1, a: amp * (0.4 + random()) / (k + 1) ** 0.7, p: random() * Math.PI * 2 }));
        const sum = (list, az) => list.reduce((acc, w) => acc + w.a * Math.sin(w.k * az * SAT_DEG + w.p), 0);
        const flat = style === 'flat';
        const far = waves(7, flat ? 0 : 1.7), near = waves(9, flat ? 0 : style === 'forest' ? 0.9 : 1.5);
        this.ridge = {
            far: az => flat ? 0.15 : 4.2 + sum(far, az),
            near: az => flat ? 0 : Math.max(0.5, (style === 'forest' ? 2.2 : 1.8) + sum(near, az)),
        };
        this.trees = [];
        if (flat) return;
        const every = style === 'forest' ? 0.55 : 1.1;
        for (let az = 0; az < 360; az += every * (0.5 + random())) {
            // In clumps: hills have woods and clearings; the forest is mostly trees.
            const wood = Math.sin(az * SAT_DEG * 3 + 1.3) + Math.sin(az * SAT_DEG * 7 + 4.1) * 0.6;
            if (wood < (style === 'forest' ? -0.9 : -0.15)) continue;
            this.trees.push({ az, h: (style === 'forest' ? 3.2 : 2.4) + random() * 3.4, w: 0.7 + random() * 0.4 });
        }
    }

    // A seeded starfield on the celestial sphere, thicker along the Milky
    // Way, with naked-eye magnitudes: many faint, a few bright.
    makeStars() {
        const random = WP.seededRandom(42);
        const n = Math.round(1500 * this.density * this.config.stars);
        const stars = this.stars = new Float32Array(n * 5);
        const gauss = () => Math.sqrt(-2 * Math.log(random() + 1e-9)) * Math.cos(2 * Math.PI * random());
        const galactic = (l, b) => {
            const g = [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)];
            return SAT_GALACTIC.map(row => row[0] * g[0] + row[1] * g[1] + row[2] * g[2]);
        };
        for (let i = 0; i < n; i++) {
            let v;
            if (random() < 0.4) v = galactic(random() * Math.PI * 2, gauss() * 0.1);
            else {
                const z = random() * 2 - 1, phi = random() * Math.PI * 2, r = Math.sqrt(1 - z * z);
                v = [r * Math.cos(phi), r * Math.sin(phi), z];
            }
            let roll = random(), tint = 0;
            while (tint < SAT_TINTS.length - 1 && (roll -= SAT_TINTS[tint][3]) > 0) tint++;
            stars.set([v[0], v[1], v[2], Math.max(-1.2, 6.6 + 2 * Math.log10(random() + 1e-6)), tint], i * 5);
        }
        // Star clouds along the galactic plane, brightest towards its centre.
        this.clouds = [];
        if (!this.config.milkyWay) return;
        for (let i = 0; i < 700; i++) {
            const l = random() * Math.PI * 2, wrapped = l > Math.PI ? l - Math.PI * 2 : l;
            const wide = i < 120;   // a broad, faint wash first, then the clumps in it
            this.clouds.push({ v: galactic(l, gauss() * (wide ? 0.08 : 0.05)), size: wide ? 14 + random() * 8 : 2.5 + random() * 4.5,
                w: (wide ? 0.3 : 0.45) * (0.35 + 0.65 * Math.exp(-((wrapped / 1.1) ** 2))) });
        }
    }

    // ---- The layer: sky, stars, sun, ground ---------------------------------------

    skyRow(sunEl) {
        const e = satClamp(sunEl, SAT_SKY[0][0], SAT_SKY[SAT_SKY.length - 1][0]);
        let i = 0;
        while (i < SAT_SKY.length - 2 && SAT_SKY[i + 1][0] < e) i++;
        const [e0, z0, s0, a0] = SAT_SKY[i], [e1, z1, s1, a1] = SAT_SKY[i + 1];
        const t = (e - e0) / (e1 - e0);
        return { zenith: satMix(z0, z1, t), toward: satMix(s0, s1, t), away: satMix(a0, a1, t) };
    }

    buildLayer(sky) {
        const v = this.view;
        if (!this.layer) this.layer = document.createElement('canvas');
        const layer = this.layer;
        if (layer.width !== v.LW || layer.height !== v.H) { layer.width = v.LW; layer.height = v.H; }
        const g = layer.getContext('2d');
        const sun = SatMath.sunLook(this.observer, sky);
        const row = this.skyRow(sun.el);
        this.paintSky(g, sun, row);

        // Stars and the Milky Way, as dark as the sky allows.
        const dark = satClamp((-sun.el - 2) / 12, 0, 1);
        const limit = -1 + 7 * dark;   // faintest magnitude that shows
        const theta = SatMath.gmst(sky) + this.observer.lambda;
        if (dark > 0.5 && this.clouds.length) {
            for (const cloud of this.clouds) {
                const d = SatMath.enu(this.observer, theta, ...cloud.v);
                if (d[2] < 0.02) continue;
                const p = this.project(d);
                if (!p) continue;
                const size = cloud.size * SAT_DEG * 2 * v.f;
                g.globalAlpha = cloud.w * 0.09 * (dark - 0.5) / 0.5 * Math.min(1, d[2] * 5);
                g.drawImage(this.sprites.cloud, p[0] - size / 2, p[1] - size / 2, size, size);
            }
        }
        if (dark > 0) {
            const s = this.stars, unit = this.dpr;
            for (let tint = 0; tint < SAT_TINTS.length; tint++) {
                const [r, gg, b] = SAT_TINTS[tint];
                g.fillStyle = `rgb(${r},${gg},${b})`;
                for (let i = 0; i < s.length; i += 5) {
                    if (s[i + 4] !== tint || s[i + 3] > limit) continue;
                    const d = SatMath.enu(this.observer, theta, s[i], s[i + 1], s[i + 2]);
                    if (d[2] < 0.005) continue;
                    const p = this.project(d);
                    if (!p || p[0] < 0 || p[0] > v.LW || p[1] < 0 || p[1] > v.cy) continue;
                    const alpha = satClamp((limit - s[i + 3]) / 1.8, 0, 1) * Math.min(1, d[2] * 6 + 0.25);
                    const radius = (0.55 + Math.max(0, 3.2 - s[i + 3]) * 0.42) * unit;
                    g.globalAlpha = alpha;
                    if (radius < 1.1 * unit) g.fillRect(p[0] - radius, p[1] - radius, radius * 2, radius * 2);
                    else {
                        g.drawImage(this.sprites.star, p[0] - radius * 2.2, p[1] - radius * 2.2, radius * 4.4, radius * 4.4);
                        g.globalAlpha = Math.min(1, alpha * 1.3);
                        g.fillRect(p[0] - radius * 0.45, p[1] - radius * 0.45, radius * 0.9, radius * 0.9);
                    }
                }
            }
        }
        g.globalAlpha = 1;

        // The sun, while it's up or just under.
        if (sun.el > -1.5) {
            const p = this.project(sun.dir);
            if (p) {
                const size = 150 * this.dpr;
                g.globalAlpha = satClamp((sun.el + 1.5) / 3, 0, 1);
                g.drawImage(this.sprites.sun, p[0] - size / 2, p[1] - size / 2, size, size);
                g.globalAlpha = 1;
            }
        }
        this.paintGround(g, sun, row);
        this.layerAt = performance.now();
        this.layerDirty = false;
    }

    // The sky's colour, per pixel of a small image that's then stretched
    // over the layer: a gradient from horizon to zenith that warms towards
    // the sun, a glow around it, and at dusk the pink band over Earth's
    // shadow opposite. Once per layer, never per frame.
    paintSky(g, sun, row) {
        const v = this.view;
        const sw = 128, sh = Math.max(16, Math.round(sw * v.cy / v.LW) + 2);
        if (!this.skyCanvas) this.skyCanvas = document.createElement('canvas');
        const small = this.skyCanvas;
        if (small.width !== sw || small.height !== sh) { small.width = sw; small.height = sh; }
        const sg = small.getContext('2d');
        const image = sg.createImageData(sw, sh);
        const px = image.data;
        const sd = sun.dir, sunH = Math.hypot(sd[0], sd[1]) || 1;
        const glow = satClamp(1 - Math.abs(sun.el + 1) / 11, 0, 1) * 0.85 + (sun.el > 0 ? 0.25 : 0);
        const belt = satClamp(1 - Math.abs(sun.el + 3) / 4, 0, 1);
        for (let y = 0; y < sh; y++) {
            for (let x = 0; x < sw; x++) {
                // Inverse stereographic: this pixel's direction.
                const lx = (x + 0.5) / sw * v.LW, ly = (y + 0.5) / (sh - 2) * v.cy;
                const qx = (lx - v.cx) / (2 * v.f), qy = (v.cy - ly) / (2 * v.f);
                const q2 = qx * qx + qy * qy, n = 1 / (1 + q2);
                const dx = (2 * qx * v.right[0] + (1 - q2) * v.fwd[0]) * n;
                const dy = (2 * qx * v.right[1] + (1 - q2) * v.fwd[1]) * n;
                const dz = Math.max(0, 2 * qy * n);
                const h = Math.hypot(dx, dy) || 1;
                const cosAz = (dx * sd[0] + dy * sd[1]) / (h * sunH);
                const toward = ((1 + cosAz) / 2) ** 2, away = ((1 - cosAz) / 2) ** 3;
                const horizon = satMix(row.away, row.toward, toward);
                let c = satMix(horizon, row.zenith, Math.pow(dz, 0.45));
                const gamma = Math.acos(satClamp(dx * sd[0] + dy * sd[1] + dz * sd[2], -1, 1));
                const halo = glow * (Math.exp(-gamma / 0.2) * 0.7 + Math.exp(-gamma / 0.7) * 0.25) * (1 - dz * 0.5);
                const elDeg = Math.asin(dz) / SAT_DEG;
                const pink = belt * away * Math.exp(-(((elDeg - 9) / 6) ** 2)) * 0.45;
                const shade = 1 - belt * away * 0.3 * satClamp(1 - elDeg / 6, 0, 1);
                const i = (y * sw + x) * 4;
                px[i] = Math.min(255, (c[0] + 255 * halo + 190 * pink) * shade);
                px[i + 1] = Math.min(255, (c[1] + 205 * halo + 128 * pink) * shade);
                px[i + 2] = Math.min(255, (c[2] + 150 * halo + 150 * pink) * shade);
                px[i + 3] = 255;
            }
        }
        sg.putImageData(image, 0, 0);
        g.imageSmoothingEnabled = true;
        g.imageSmoothingQuality = 'high';
        g.drawImage(small, 0, 0, sw, sh - 2, 0, 0, v.LW, v.cy);
        g.drawImage(small, 0, sh - 3, sw, 1, 0, v.cy - 1, v.LW, v.H - v.cy + 1);
    }

    // The ground: a hazy far ridge, a dark near one with its trees, and the
    // compass points. Lit a little by day, black by night.
    paintGround(g, sun, row) {
        const v = this.view, facing = this.facing();
        const day = satClamp((sun.el + 6) / 22, 0, 1);
        const ground = satMix([2, 3, 7], [38, 50, 46], day);
        const haze = satMix(ground, row.away, 0.32 + 0.15 * day);
        const rgb = c => `rgb(${c.map(Math.round).join(',')})`;
        const ridge = (fn, colour) => {
            g.beginPath();
            g.moveTo(-10, v.H + 10);
            for (let a = -112; a <= 112; a += 0.75) {
                const p = this.project(this.direction(facing + a, fn(facing + a)));
                if (p) g.lineTo(satClamp(p[0], -v.LW, 2 * v.LW), p[1]);
            }
            g.lineTo(v.LW + 10, v.H + 10);
            g.closePath();
            g.fillStyle = rgb(colour);
            g.fill();
        };
        ridge(this.ridge.far, haze);
        ridge(this.ridge.near, ground);

        // Conifers: tiers of boughs, drawn in degrees and scaled to the view.
        g.fillStyle = rgb(ground);
        for (const tree of this.trees) {
            let da = ((tree.az - facing + 540) % 360) - 180;
            if (Math.abs(da) > 100) continue;
            const base = this.ridge.near(tree.az) - 0.25;
            const p = this.project(this.direction(tree.az, base));
            if (!p) continue;
            const scale = 2 * v.f / (1 + Math.cos(da * SAT_DEG)) * SAT_DEG;
            const h = tree.h * scale, w = tree.w * scale;
            g.beginPath();
            g.moveTo(p[0], p[1] - h);
            for (let t = 1; t <= 4; t++) {
                const y = p[1] - h + h * t / 4.4, half = w * (0.22 + 0.2 * t);
                g.lineTo(p[0] + half, y);
                g.lineTo(p[0] + half * 0.35, y - h * 0.05);
            }
            g.lineTo(p[0] + w * 0.08, p[1] + 1);
            g.lineTo(p[0] - w * 0.08, p[1] + 1);
            for (let t = 4; t >= 1; t--) {
                const y = p[1] - h + h * t / 4.4, half = w * (0.22 + 0.2 * t);
                g.lineTo(p[0] - half * 0.35, y - h * 0.05);
                g.lineTo(p[0] - half, y);
            }
            g.closePath();
            g.fill();
        }

        // A cabin on the near ridge, its window lit once the sun is down.
        if (this.config.horizon !== 'flat') {
            const az = facing + 21;
            const p = this.project(this.direction(az, this.ridge.near(az) - 0.4));
            if (p) {
                const s = 2 * v.f / (1 + Math.cos(21 * SAT_DEG)) * SAT_DEG;
                const w = 3.2 * s, h = 1.7 * s;
                g.fillStyle = rgb(ground);
                g.beginPath();
                g.moveTo(p[0] - w / 2, p[1]);
                g.lineTo(p[0] - w / 2, p[1] - h);
                g.lineTo(p[0] - w * 0.62, p[1] - h);
                g.lineTo(p[0], p[1] - h - 1.3 * s);
                g.lineTo(p[0] + w * 0.62, p[1] - h);
                g.lineTo(p[0] + w / 2, p[1] - h);
                g.lineTo(p[0] + w / 2, p[1]);
                g.closePath();
                g.fill();
                g.fillRect(p[0] + w * 0.22, p[1] - h - 1.2 * s, 0.35 * s, 0.8 * s);   // chimney
                const lamp = satClamp((-sun.el - 1) / 4, 0, 1);
                if (lamp > 0) {
                    const glow = 7 * s;
                    g.globalAlpha = 0.35 * lamp;
                    g.drawImage(this.sprites.warm, p[0] - w * 0.18 - glow / 2, p[1] - h * 0.55 - glow / 2, glow, glow);
                    g.globalAlpha = lamp;
                    g.fillStyle = 'rgb(255, 196, 110)';
                    g.fillRect(p[0] - w * 0.3, p[1] - h * 0.72, w * 0.22, h * 0.36);
                    g.globalAlpha = 1;
                }
            }
        }

        // Compass points, just under the skyline.
        g.font = `600 ${11 * this.dpr}px system-ui, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'top';
        g.fillStyle = `rgba(200, 212, 235, ${0.42 - 0.12 * day})`;
        for (let az = 0; az < 360; az += 45) {
            const da = ((az - facing + 540) % 360) - 180;
            if (Math.abs(da) > 100) continue;
            const p = this.project(this.direction(az, 0));
            if (p) g.fillText(satCompass(az), p[0], v.cy + 8 * this.dpr);
        }
    }

    // ---- Satellites -----------------------------------------------------------------

    // Where one is at `ms`, and where that is on the layer.
    lookAt(s, ms, sunDir) {
        const at = SatMath.look(this.observer, s.rec, ms, sunDir);
        if (!at) return null;
        at.ground = this.groundAt(at.az);
        at.mag = SatMath.magnitude(s.standard, at.range, at.phase);
        this.place2d(at);
        return at;
    }

    groundAt(az) {
        return this.ridge ? this.ridge.near(az) : 0;
    }

    place2d(at) {
        const p = at.el > -2 && this.view ? this.project(at.dir) : null;
        at.x = p ? p[0] : null;
        at.y = p ? p[1] : null;
    }

    // Positions for t0 and t0 + 1 s, so frames in between interpolate. A
    // step on reuses the later one; a jump (start, new elements, a long
    // pause) computes both.
    recompute(sky) {
        const fresh = !this.t1 || sky < this.t0 || sky - this.t1 > 1000;
        const t0 = fresh ? sky : this.t1;
        const sunA = SatMath.sun(t0), sunB = SatMath.sun(t0 + 1000);
        for (const s of this.sats) {
            s.a = fresh ? this.lookAt(s, t0, sunA) : s.b;
            s.b = this.lookAt(s, t0 + 1000, sunB);
        }
        this.t0 = t0;
        this.t1 = t0 + 1000;
        this.sun = SatMath.sunLook(this.observer, t0, sunA);
        this.twilight = satClamp((-4 - this.sun.el) / 3, 0, 1);
        // Visiting craft docked at a station share its dot; hide them.
        const stations = this.sats.filter(s => s.type === 'station' && s.b);
        let up = 0, lit = 0;
        for (const s of this.sats) {
            const b = s.b;
            s.docked = false;
            if (!b) continue;
            if (s.type !== 'station') {
                for (const st of stations) {
                    const chord = Math.hypot(b.dir[0] - st.b.dir[0], b.dir[1] - st.b.dir[1], b.dir[2] - st.b.dir[2]) * b.range;
                    if (chord < 15 && Math.abs(b.range - st.b.range) < 15) s.docked = true;
                }
            }
            if (s.docked || b.el < b.ground) continue;
            up++;
            if (b.lit * this.twilight > 0.5) lit++;
        }
        this.counts = { up, lit };
        if (this.pass && sky > this.pass.end + 60000) this.schedulePass(0);
        this.updateStatus(sky);
    }

    // The station's next visible pass, worked out between frames: up to
    // 36 h of half-minute steps, a few milliseconds.
    schedulePass(ms) {
        if (this.host.params.thumb || !this.station) return;
        this.timers.push(setTimeout(() => {
            if (!this.running || !this.station) return;
            const from = this.host.now().getTime();
            this.pass = SatMath.nextPass(this.observer, this.station.rec, from) || { none: true, end: from + 6 * 3600000 };
            this.passFor = this.station;
            this.status.text = '';
        }, ms));
    }

    // ---- Frames ---------------------------------------------------------------------

    frame(timestamp) {
        if (!this.running) return;
        const dt = Math.min(0.1, Math.max(0, (timestamp - (this.last || timestamp)) / 1000));
        this.last = timestamp;
        const sky = this.host.now().getTime();
        if (!this.t1 || sky >= this.t1 || sky < this.t0) this.recompute(sky);
        if (this.layerDirty || performance.now() - this.layerAt > 30000) this.buildLayer(sky);
        this.pan += (this.panTarget - this.pan) * Math.min(1, dt * 6);
        const easing = Math.abs(this.panTarget - this.pan) > 0.0005;
        if (!easing) this.pan = this.panTarget;
        const lit = this.draw(sky);
        this.frameId = requestAnimationFrame(t => this.frame(t));
        // Nothing lit on screen: ghosts and the sky barely move, so a few
        // frames a second will do; with nothing at all, wait for the next
        // second's positions.
        if (!easing && !this.info) {
            if (!this.hits.length) this.host.idleUntil(Math.max(30, this.t1 - sky));
            else if (!lit) this.host.idleUntil(200);
        }
    }

    draw(sky) {
        const { ctx, view: v } = this;
        const offset = v.pad * (1 + 2 * this.pan);
        ctx.globalAlpha = 1;
        ctx.drawImage(this.layer, -offset, 0);
        const f = satClamp((sky - this.t0) / 1000, 0, 1.5);
        const size = this.config.satelliteSize * this.dpr;
        const labels = this.config.labels;
        ctx.font = `500 ${11.5 * this.dpr}px system-ui, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        this.hits.length = 0;
        let litCount = 0;
        for (const s of this.sats) {
            const a = s.a, b = s.b;
            if (!a || !b || s.docked || a.x === null || b.x === null) continue;
            const el = a.el + (b.el - a.el) * f;
            if (el < a.ground + (b.ground - a.ground) * f) continue;
            const x = a.x + (b.x - a.x) * f - offset, y = a.y + (b.y - a.y) * f;
            if (x < -30 || x > v.W + 30 || y < -30 || y > v.cy + 4) continue;
            const station = s.type === 'station';
            const seen = (a.lit + (b.lit - a.lit) * f) * this.twilight * satClamp(el / 12, 0.3, 1);
            const brightness = satClamp((6.5 - b.mag) / 7, 0.22, 1);
            const ghost = this.config.ghosts ? (1 - seen) * (station ? 0.55 : 0.3) : 0;
            if (seen < 0.02 && ghost < 0.02) continue;
            this.hits.push({ s, x, y });
            if (ghost > 0.02) {
                const r = (station ? 7 : 5) * size;
                ctx.globalAlpha = ghost;
                ctx.drawImage(this.sprites.ring, x - r, y - r, r * 2, r * 2);
            }
            if (seen >= 0.02) {
                litCount++;
                const alpha = seen * brightness;
                if (this.config.trails) {
                    const dx = (b.x - a.x) * 2.2, dy = (b.y - a.y) * 2.2;
                    ctx.lineWidth = (station ? 1.8 : 1.1) * size;
                    ctx.strokeStyle = station ? 'rgb(255,236,205)' : 'rgb(205,220,255)';
                    for (let k = 0; k < 5; k++) {
                        ctx.globalAlpha = alpha * 0.32 * (1 - k / 5);
                        ctx.beginPath();
                        ctx.moveTo(x - dx * k, y - dy * k);
                        ctx.lineTo(x - dx * (k + 1), y - dy * (k + 1));
                        ctx.stroke();
                    }
                }
                const glow = (station ? 38 : 15 + 20 * brightness) * size;
                ctx.globalAlpha = Math.min(1, alpha * (station ? 1 : 1.15));
                ctx.drawImage(station ? this.sprites.warm : this.sprites.glow, x - glow / 2, y - glow / 2, glow, glow);
            }
            const named = labels === 'all' ? station || seen > 0.3 : labels === 'stations' && station;
            if (named) {
                ctx.globalAlpha = Math.max(seen, ghost * 1.4) * (station ? 0.9 : 0.6);
                const tx = x + (station ? 13 : 9) * size, label = station ? s.label : s.label.slice(0, 22);
                ctx.fillStyle = 'rgba(0,0,0,0.8)';
                ctx.fillText(label, tx + this.dpr, y + this.dpr);
                ctx.fillStyle = station ? '#fff3dc' : '#dbe6ff';
                ctx.fillText(label, tx, y);
            }
        }
        ctx.globalAlpha = 1;
        this.drawInfo(f, offset);
        this.drawStatus();
        return litCount;
    }

    // ---- Taps and words ----------------------------------------------------------------

    tap(x, y) {
        const scale = this.canvas.width / innerWidth;
        let best = null, bestD = 30 * scale;
        for (const hit of this.hits) {
            const d = Math.hypot(hit.x - x * scale, hit.y - y * scale);
            if (d < bestD) { best = hit; bestD = d; }
        }
        this.info = best ? { s: best.s, until: performance.now() + 9000 } : null;
    }

    drawInfo(f, offset) {
        const info = this.info;
        if (!info) return;
        const { s } = info, a = s.a, b = s.b;
        if (performance.now() > info.until || !a || !b || a.x === null || b.x === null || !this.sats.includes(s)) { this.info = null; return; }
        const { ctx, view: v } = this, u = this.dpr;
        const x = a.x + (b.x - a.x) * f - offset, y = a.y + (b.y - a.y) * f;
        const el = a.el + (b.el - a.el) * f;
        const state = this.sun.el > -4 ? 'Lost in daylight' : b.lit > 0.5 ? 'In sunlight' : 'In Earth’s shadow';
        const lines = [
            s.label === s.name ? s.name : `${s.label} · ${s.name}`,
            `${Math.round(b.height).toLocaleString()} km up · ${b.speed.toFixed(2)} km/s`,
            `${state} · ${Math.round(el)}° ${satCompass(b.az)}`,
        ];
        ctx.font = `600 ${12.5 * u}px system-ui, sans-serif`;
        const w = Math.max(...lines.map((line, i) => { ctx.font = `${i ? 400 : 600} ${12.5 * u}px system-ui, sans-serif`; return ctx.measureText(line).width; })) + 22 * u;
        const h = 64 * u;
        const left = satClamp(x + 16 * u, 8 * u, v.W - w - 8 * u), top = satClamp(y - h - 12 * u, 8 * u, v.H - h - 8 * u);
        ctx.globalAlpha = 0.82;
        ctx.fillStyle = 'rgb(12,16,30)';
        ctx.beginPath();
        ctx.roundRect(left, top, w, h, 10 * u);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(127,212,255,0.45)';
        ctx.lineWidth = u;
        ctx.stroke();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        lines.forEach((line, i) => {
            ctx.font = `${i ? 400 : 600} ${12.5 * u}px system-ui, sans-serif`;
            ctx.fillStyle = i ? '#b9c6dd' : '#eef3ff';
            ctx.fillText(line, left + 11 * u, top + (9 + i * 17) * u);
        });
    }

    // Times as the clock on the wall shows them.
    clock(ms) {
        return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    }

    statusLines(sky) {
        const lines = [];
        const where = this.place;
        lines.push(where
            ? `📍 ${where.label || `${Math.abs(where.lat).toFixed(1)}°${where.lat < 0 ? 'S' : 'N'} ${Math.abs(where.lon).toFixed(1)}°${where.lon < 0 ? 'W' : 'E'}`}`
            : '📍 A generic sky at 45°N: set your location in settings');
        const { up, lit } = this.counts;
        lines.push(this.sun.el > 0 ? '☀️ Daylight: satellites show after sunset'
            : `${this.sun.el > -6 ? '🌇 Twilight' : '🌌 Night'} · ${lit} of ${up} satellites up are sunlit`);
        const pass = this.passText(sky);
        if (pass) lines.push(pass);
        if (this.source === 'sample') lines.push('Sample orbits, offline: not the real sky');
        else {
            const age = SatData.age(this.elements, sky);
            const fetched = Math.min(...this.records.map(r => r?.fetched || Infinity));
            const hours = Math.round((Date.now() - fetched) / 3600000);
            lines.push(age > SatData.STALE_MS
                ? `⚠️ Elements ${Math.round(age / 86400000)} days from now: positions drift`
                : `Elements from CelesTrak, ${hours < 1 ? 'just now' : `${hours} h ago`}`);
        }
        return lines;
    }

    // The station: up now, or when it passes next.
    passText(sky = this.host.now().getTime()) {
        const s = this.station;
        if (!s) return '';
        const b = s.b;
        if (b && b.el > b.ground && b.lit > 0.5 && this.twilight > 0.5) return `✨ ${s.label} is up now, ${Math.round(b.el)}° ${satCompass(b.az)}`;
        const pass = this.passFor === s ? this.pass : null;
        if (!pass) return '';
        if (pass.none) return `${s.label}: no visible pass for 36 h`;
        const minutes = Math.round((pass.start - sky) / 60000);
        const until = minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
        return `${s.label} next: ${this.clock(pass.start)} (in ${until}), ${Math.round(pass.maxEl)}° high, ${satCompass(pass.fromAz)} → ${satCompass(pass.toAz)}`;
    }

    // What's going on, in the corner of the ground: worked out once a
    // second, and drawn into a little canvas only when the words change.
    updateStatus(sky) {
        const lines = this.statusLines(sky);
        const text = lines.join('\n');
        const u = this.dpr;
        if (text !== this.status.text) {
            this.status.text = text;
            const canvas = this.status.canvas ||= document.createElement('canvas');
            const g = canvas.getContext('2d');
            // Smaller on a narrow screen, so every line fits.
            const font = `${11.5 * u * Math.min(1, this.view.W / (440 * u))}px system-ui, sans-serif`;
            g.font = font;
            canvas.width = Math.ceil(Math.max(...lines.map(line => g.measureText(line).width)) + 4 * u);
            canvas.height = Math.ceil(lines.length * 16 * u + 4 * u);
            g.font = font;
            g.textBaseline = 'top';
            g.fillStyle = 'rgba(214, 224, 245, 0.62)';
            lines.forEach((line, i) => g.fillText(line, 2 * u, 2 * u + i * 16 * u));
        }
    }

    drawStatus() {
        const canvas = this.status.canvas, u = this.dpr, v = this.view;
        if (!canvas) return;
        const bottom = v.H - (this.host.insets.bottom + 10) * u;
        const top = Math.max(v.cy + 24 * u, bottom - canvas.height);
        this.ctx.drawImage(canvas, 14 * u, top);
    }
}
