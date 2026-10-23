// Lighthouse (SPEC §10.18): a lighthouse on a headland at night. Its beam
// sweeps over a heaving sea, keeping a real light's rhythm (lighthouse-light.js);
// ships' lights pass on the horizon; a gale brings rain, scud and lightning.
// The sea can follow a real ocean's swell (lighthouse-sea.js).
//
// The scene is one simple camera: eye CAM_H metres above the sea, looking
// level, with the lighthouse Z0 metres out. The sea is a stack of bands at
// set distances, far to near, each a line of summed sine waves in
// perspective; the headland stands between the far and near bands.
// Static parts (sky, moon, headland, tower) are painted once per resize.

class LighthouseAnimationManager {
    static CAM_H = 6;         // m, the eye above the sea
    static Z0 = 300;          // m, out to the lighthouse
    static GROUND = 18;       // m, the headland's top
    static LANTERN = 47;      // m, the lantern's centre
    static FAR = 2600;        // m, the farthest band
    static BANDS = 22;

    constructor(host) {
        this.host = host;
        this.config = WP.settings.load();
        this.light = LighthouseLight.parse(this.config.characteristic);
        this.running = false;
        this.raf = null;
        this.frame = this.frame.bind(this);
        this.onResize = () => this.resize();

        // The sea now, easing towards the target over a few seconds.
        this.swell = null;       // live data: { height, period, direction, at, fetched, cached }
        this.swellStatus = 'off';
        this.sea = this.targetSea();
        this.phases = this.sea.waves.map(() => Math.random() * Math.PI * 2);

        this.fx = { spray: this.wants('spray'), glints: this.wants('glints') };
        this.pan = 0;
        this.panTarget = 0;
        this.ships = [];
        this.drops = [];
        this.spray = [];
        this.sprayFree = [];
        this.clouds = [];
        this.bolt = null;
        this.nextBolt = 8 + Math.random() * 20;
        this.sites = [];
        this.checkedSwell = 0;
    }

    // ---- Lifecycle ---------------------------------------------------------

    start() {
        if (this.running) return;
        this.running = true;
        this.started = performance.now();
        const canvas = this.canvas = document.createElement('canvas');
        canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none';
        document.body.appendChild(canvas);
        this.ctx = canvas.getContext('2d');
        this.note = document.createElement('div');
        this.note.style.cssText = `position:fixed;left:16px;bottom:${this.host.insets.bottom + 14}px;
            font:12px/1.4 ui-rounded,system-ui,sans-serif;color:rgba(190,205,225,.55);pointer-events:none;
            letter-spacing:.02em;transition:opacity 1s;opacity:0`;
        document.body.appendChild(this.note);
        window.addEventListener('resize', this.onResize);
        this.resize();
        this.seed();
        this.t0 = null;
        this.last = null;
        if (this.config.liveSwell) this.loadSwell();
        this.raf = requestAnimationFrame(this.frame);
    }

    stop() {
        this.running = false;
        cancelAnimationFrame(this.raf);
        this.abort?.abort();
        window.removeEventListener('resize', this.onResize);
        this.canvas?.remove();
        this.note?.remove();
        this.canvas = this.ctx = this.note = null;
    }

    applySettings(config) {
        const before = this.config;
        this.config = config;
        if (config.characteristic !== before.characteristic) this.light = LighthouseLight.parse(config.characteristic);
        if (config.side !== before.side || config.moon !== before.moon) this.resize();
        if (config.liveSwell && (!before.liveSwell || config.oceanPoint !== before.oceanPoint)) {
            this.swell = null;
            this.loadSwell();
        }
        if (!config.liveSwell) {
            this.abort?.abort();
            this.swell = null;
            this.swellStatus = 'off';
        }
        this.showNote();
    }

    // Declared keys (catalog): the next sea state or light, with a toast.
    cycle(key) {
        const values = key === 'sea' ? Object.keys(LighthouseSea.STATES) : LighthouseLight.CHARTED;
        const next = { ...this.config, [key]: values[(values.indexOf(this.config[key]) + 1) % values.length] };
        WP.settings.save(next);
        this.applySettings(next);
        if (key === 'characteristic') return `${next.characteristic} · ${LighthouseLight.describe(this.light)}`;
        return `${{ calm: '🪞 Calm', moderate: '🌊 Moderate', rough: '💨 Rough', gale: '⛈️ Gale' }[next.sea]} sea`
            + (this.swellStatus === 'live' ? ' (the live swell rules while it’s on)' : '');
    }

    // ---- Quality (SPEC §4.8) ---------------------------------------------------
    // Low drops the spray and the light caught by rain and water; density
    // scales the rain, ships and spray. Effects fade over about 1.5 s.

    wants(effect) {
        return this.host.quality.effects.includes(effect) ? 1 : 0;
    }

    onQuality() {
        this.syncShips();
    }

    onScroll(x) {
        this.panTarget = x - 0.5;
    }

    // ---- The sea's state ---------------------------------------------------------

    // Height, period and storminess from the live swell or the setting,
    // turned into three wave trains: swell, wind sea and chop.
    targetSea() {
        const preset = LighthouseSea.STATES[this.config.sea] || LighthouseSea.STATES.moderate;
        const live = this.config.liveSwell && this.swell;
        const { height, period, direction } = live ? this.swell : preset;
        const storm = LighthouseSea.storm(height);
        const slant = (((direction % 90) + 90) % 90 - 45) / 45 * 0.45;
        return {
            height, period, storm,
            waves: [
                { amp: 0.5 * height * 0.72, period, angle: slant },
                { amp: 0.5 * height * 0.42 + 0.05, period: period * 0.55, angle: slant + 0.5 },
                { amp: 0.06 + 0.2 * storm, period: 2.4, angle: -0.6 },
                { amp: 0.03 + 0.08 * storm, period: 1.5, angle: 0.25 },
            ],
        };
    }

    rainAmount() {
        const rain = this.config.rain;
        if (rain === 'off') return 0;
        if (rain === 'light') return 0.35;
        if (rain === 'heavy') return 1;
        return Math.min(1, Math.max(0, (this.sea.storm - 0.4) / 0.5));
    }

    // ---- Live swell -----------------------------------------------------------------
    // Cached in host.storage with the whole two-day forecast, so a later
    // hour can come from the cache, offline. Asked again once an hour while
    // running; the setting rules when there's nothing fresh.

    async loadSwell() {
        if (this.host.params.thumb) return;
        const point = this.config.oceanPoint;
        const cached = this.host.storage.get('swell');
        const now = this.host.now().getTime();
        const fromCache = cached?.point === point ? LighthouseSea.pick(cached.hours, now) : null;
        if (fromCache) this.useSwell(fromCache, 'cached', cached.fetched);
        this.checkedSwell = performance.now();
        if (cached?.point === point && now - cached.fetched < LighthouseSea.REFRESH_MS && fromCache) return;

        this.abort?.abort();
        const abort = this.abort = new AbortController();
        this.swellStatus = fromCache ? 'cached' : 'loading';
        try {
            const response = await fetch(LighthouseSea.url(point), { signal: abort.signal, cache: 'no-store' });
            if (!response.ok) throw new Error(`marine forecast: HTTP ${response.status}`);
            const hours = LighthouseSea.trim(await response.json());
            const picked = LighthouseSea.pick(hours, this.host.now().getTime());
            if (!picked) throw new Error('marine forecast: no usable hour');
            if (abort.signal.aborted || !this.config.liveSwell || this.config.oceanPoint !== point) return;
            const fetched = this.host.now().getTime();
            this.host.storage.set('swell', { point, fetched, hours });
            this.useSwell(picked, 'live', fetched);
        } catch (error) {
            if (abort.signal.aborted) return;
            console.warn('Lighthouse: live swell unavailable;', error.message);
            if (!fromCache) this.swellStatus = 'offline';
        }
        this.showNote();
    }

    useSwell(swell, status, fetched) {
        this.swell = { ...swell, fetched };
        this.swellStatus = status;
        // Data that arrives as the wallpaper starts sets the sea at once,
        // rather than easing up from the preset for the first ten seconds.
        if (performance.now() - this.started < 5000) this.sea = this.targetSea();
        this.showNote();
    }

    // A quiet line in the corner while live swell is on, saying what the
    // sea is following.
    showNote() {
        if (!this.note) return;
        const point = LighthouseSea.POINTS[this.config.oceanPoint]?.name || '';
        let text = '';
        if (this.config.liveSwell) {
            const s = this.swell;
            if (s && this.swellStatus === 'live') text = `Swell ${s.height.toFixed(1)} m · ${Math.round(s.period)} s, ${point}`;
            else if (s) text = `Swell ${s.height.toFixed(1)} m · ${Math.round(s.period)} s, ${point} (saved ${this.ago(s.fetched)})`;
            else if (this.swellStatus === 'offline') text = `Live swell unavailable; showing a ${this.config.sea} sea`;
        }
        this.note.textContent = text;
        this.note.style.opacity = text ? '1' : '0';
    }

    ago(ms) {
        const minutes = Math.max(0, Math.round((this.host.now().getTime() - ms) / 60000));
        return minutes < 90 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
    }

    // ---- Layout -------------------------------------------------------------------------

    resize() {
        if (!this.canvas) return;
        const L = LighthouseAnimationManager;
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        const W = this.W = innerWidth, H = this.H = innerHeight;
        this.dpr = dpr;
        this.canvas.width = Math.round(W * dpr);
        this.canvas.height = Math.round(H * dpr);
        const portrait = H > W;
        this.horizon = Math.round(H * (portrait ? 0.53 : 0.56));
        // The lantern sits about a fifth of the way down; that sets the lens.
        const lanternY = H * (portrait ? 0.25 : 0.2);
        this.f = (this.horizon - lanternY) * L.Z0 / (L.LANTERN - L.CAM_H);
        this.cx = W / 2;
        this.flip = this.config.side === 'left' ? -1 : 1;
        this.towerX = this.cx + this.flip * W * (portrait ? 0.2 : 0.22);
        this.X0 = (this.towerX - this.cx) * L.Z0 / this.f;
        this.unit = this.f / L.Z0;          // px per metre at the lighthouse
        this.lantern = { x: this.towerX, y: this.project(0, L.LANTERN, L.Z0).y };
        // Bands from the horizon to just past the bottom of the screen.
        const near = this.f * L.CAM_H / (H - this.horizon) * 0.8;
        this.bands = [];
        for (let i = 0; i < L.BANDS; i++) {
            const z = L.FAR * Math.pow(near / L.FAR, Math.pow(i / (L.BANDS - 1), 0.85));
            this.bands.push({ z, base: this.horizon + this.f * L.CAM_H / z });
        }
        this.firstNear = this.bands.findIndex(b => b.z < L.Z0);
        // Spray sites along the headland's foot.
        this.sites = [-40, -34, -26, -16].map(dx => ({ X: this.X0 + this.flip * dx, last: 0 }));
        this.moon = this.moonState();
        this.buildSprites();
        this.buildSky();
        this.buildHeadland();
        this.buildClouds();
        this.ys = new Float32Array(Math.ceil(W / 6) + 3);
    }

    // World (X right, Y up from the sea, Z out) to screen, with the pan.
    project(X, Y, Z) {
        const camX = this.pan * 0.08 * this.W * LighthouseAnimationManager.Z0 / this.f;
        return { x: this.cx + this.f * (X - camX) / Z, y: this.horizon - this.f * (Y - LighthouseAnimationManager.CAM_H) / Z };
    }

    // Tonight's moon from host.now(): phase 0 new, 0.5 full.
    moonState() {
        const mode = this.config.moon;
        if (mode === 'none') return null;
        const days = (this.host.now().getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 86400000;
        const phase = mode === 'full' ? 0.5 : ((days / 29.530588853) % 1 + 1) % 1;
        const W = this.W, H = this.H;
        return {
            phase, light: (1 - Math.cos(phase * Math.PI * 2)) / 2,
            x: this.cx - this.flip * W * (H > W ? 0.22 : 0.26), y: H * (H > W ? 0.14 : 0.17),
            r: Math.max(14, Math.min(W, H) * 0.035),
        };
    }

    // ---- Baked sprites -------------------------------------------------------------------

    canvasOf(w, h) {
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.ceil(w));
        c.height = Math.max(1, Math.ceil(h));
        return c;
    }

    glow(size, stops) {
        const c = this.canvasOf(size, size), g = c.getContext('2d');
        const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        for (const [at, colour] of stops) grad.addColorStop(at, colour);
        g.fillStyle = grad;
        g.fillRect(0, 0, size, size);
        return c;
    }

    buildSprites() {
        const dot = rgb => this.glow(32, [[0, `rgba(${rgb},1)`], [0.12, `rgba(${rgb},0.9)`], [0.3, `rgba(${rgb},0.25)`], [1, `rgba(${rgb},0)`]]);
        this.sprites = {
            white: dot('255,250,235'), red: dot('255,70,60'), green: dot('90,255,150'), amber: dot('255,200,120'),
            flare: this.glow(256, [[0, 'rgba(255,252,240,1)'], [0.08, 'rgba(255,246,220,0.85)'], [0.25, 'rgba(255,230,190,0.28)'], [0.6, 'rgba(255,220,180,0.06)'], [1, 'rgba(255,220,180,0)']]),
            glint: this.glow(32, [[0, 'rgba(225,235,255,0.9)'], [0.35, 'rgba(200,215,245,0.3)'], [1, 'rgba(200,215,245,0)']]),
            foam: this.glow(16, [[0, 'rgba(235,242,250,0.9)'], [0.5, 'rgba(225,235,245,0.35)'], [1, 'rgba(225,235,245,0)']]),
            warm: this.glow(64, [[0, 'rgba(255,214,150,0.7)'], [0.4, 'rgba(255,190,120,0.15)'], [1, 'rgba(255,190,120,0)']]),
        };
        // A horizontal streak for the flare as the beam faces the viewer.
        const streak = this.sprites.streak = this.canvasOf(512, 24), sg = streak.getContext('2d');
        const along = sg.createLinearGradient(0, 0, 512, 0);
        along.addColorStop(0, 'rgba(255,240,215,0)');
        along.addColorStop(0.5, 'rgba(255,248,235,0.9)');
        along.addColorStop(1, 'rgba(255,240,215,0)');
        sg.fillStyle = along;
        sg.fillRect(0, 9, 512, 6);
        sg.globalAlpha = 0.35;
        sg.fillRect(0, 4, 512, 16);
        // The beam: apex at the left middle, opening to the right edge,
        // brightest near the lamp, and soft across its width at every
        // distance (so its sides never show a hard edge, however wide it
        // is drawn). Built pixel by pixel, once.
        const B = 128, beam = this.sprites.beam = this.canvasOf(B, B), bg = beam.getContext('2d');
        const image = bg.createImageData(B, B);
        for (let y = 0; y < B; y++) {
            for (let x = 1; x < B; x++) {
                const u = x / B, across = Math.abs(y + 0.5 - B / 2) / (u * B / 2);
                if (across >= 1) continue;
                const along = u < 0.05 ? 1 - u * 3 : 0.85 * Math.pow(1 - (u - 0.05) / 0.95, 1.2);
                const side = Math.exp(-across * across * 3) * (1 - across * across);
                const at = (y * B + x) * 4;
                image.data.set([250, 246, 234, Math.round(255 * along * side)], at);
            }
        }
        bg.putImageData(image, 0, 0);
        // A reflection of the moon: a soft column, drawn under it on the water.
        const column = this.sprites.column = this.canvasOf(64, 256), cg = column.getContext('2d');
        const down = cg.createLinearGradient(0, 0, 0, 256);
        down.addColorStop(0, 'rgba(200,210,230,0.5)');
        down.addColorStop(1, 'rgba(200,210,230,0)');
        const sides = cg.createLinearGradient(0, 0, 64, 0);
        sides.addColorStop(0, 'rgba(0,0,0,0)');
        sides.addColorStop(0.5, 'rgba(0,0,0,1)');
        sides.addColorStop(1, 'rgba(0,0,0,0)');
        cg.fillStyle = down;
        cg.fillRect(0, 0, 64, 256);
        cg.globalCompositeOperation = 'destination-in';
        cg.fillStyle = sides;
        cg.fillRect(0, 0, 64, 256);
    }

    // ---- The sky: gradient, stars, moon (once per resize) ---------------------------------

    buildSky() {
        const { W, H, dpr } = this;
        const c = this.sky = this.canvasOf(W * dpr, this.horizon * dpr + 2), g = c.getContext('2d');
        g.scale(dpr, dpr);
        const grad = g.createLinearGradient(0, 0, 0, this.horizon);
        grad.addColorStop(0, '#03050b');
        grad.addColorStop(0.55, '#0a1222');
        grad.addColorStop(0.9, '#18233a');
        grad.addColorStop(1, '#25314a');
        g.fillStyle = grad;
        g.fillRect(0, 0, W, this.horizon + 2);
        const moon = this.moon;
        // Moonlight in the sky around it.
        if (moon) {
            const halo = g.createRadialGradient(moon.x, moon.y, 0, moon.x, moon.y, Math.max(W, H) * 0.55);
            halo.addColorStop(0, `rgba(120,140,180,${0.22 * (0.3 + moon.light)})`);
            halo.addColorStop(0.25, `rgba(70,90,130,${0.12 * (0.3 + moon.light)})`);
            halo.addColorStop(1, 'rgba(40,60,100,0)');
            g.fillStyle = halo;
            g.fillRect(0, 0, W, this.horizon + 2);
        }
        // Stars, thinning towards the hazy horizon and in the moon's glare.
        const count = Math.round(W * this.horizon / 2600);
        for (let i = 0; i < count; i++) {
            const x = Math.random() * W, y = Math.pow(Math.random(), 1.4) * this.horizon * 0.92;
            const glare = moon ? Math.min(1, Math.hypot(x - moon.x, y - moon.y) / (moon.r * 9)) : 1;
            const a = (0.25 + Math.random() * 0.6) * (1 - y / this.horizon) * glare;
            if (a < 0.05) continue;
            g.fillStyle = `rgba(${215 + Math.random() * 40 | 0},${220 + Math.random() * 35 | 0},255,${a.toFixed(2)})`;
            const s = Math.random() < 0.08 ? 1.6 : 1;
            g.fillRect(x, y, s, s);
        }
        if (moon) this.paintMoon(g, moon);
        // Haze along the horizon.
        const haze = g.createLinearGradient(0, this.horizon - H * 0.08, 0, this.horizon);
        haze.addColorStop(0, 'rgba(60,75,100,0)');
        haze.addColorStop(1, 'rgba(60,75,100,0.35)');
        g.fillStyle = haze;
        g.fillRect(0, this.horizon - H * 0.08, W, H * 0.08 + 2);
    }

    paintMoon(g, moon) {
        const { x, y, r, phase } = moon;
        const halo = g.createRadialGradient(x, y, r * 0.8, x, y, r * 5);
        halo.addColorStop(0, `rgba(220,225,235,${0.25 * moon.light + 0.04})`);
        halo.addColorStop(1, 'rgba(220,225,235,0)');
        g.fillStyle = halo;
        g.fillRect(x - r * 5, y - r * 5, r * 10, r * 10);
        // Earthshine on the dark part, then the lit part: the limb on the
        // lit side and the terminator, an ellipse as wide as |cos(phase)|.
        g.fillStyle = '#151b29';
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
        g.save();
        g.translate(x, y);
        if (phase > 0.5) g.scale(-1, 1);                // waning: lit on the left
        const k = Math.cos(phase * Math.PI * 2);
        g.beginPath();
        g.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
        g.ellipse(0, 0, Math.abs(k) * r, r, 0, Math.PI / 2, -Math.PI / 2, k > 0);
        g.fillStyle = '#e9e6d8';
        g.fill();
        // A few maria, faint, only where it's lit.
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = 'rgba(150,150,140,0.28)';
        for (const [mx, my, mr] of [[-0.3, -0.25, 0.28], [0.2, -0.35, 0.2], [0.05, 0.1, 0.25], [-0.15, 0.4, 0.16]]) {
            g.beginPath();
            g.arc(mx * r * (phase > 0.5 ? -1 : 1), my * r, mr * r, 0, Math.PI * 2);
            g.fill();
        }
        g.restore();
    }

    // ---- The headland, tower and cottage (once per resize) ------------------------------------

    buildHeadland() {
        const L = LighthouseAnimationManager;
        const { W, dpr, unit: u, flip } = this;
        const top = this.horizon - (L.GROUND - L.CAM_H) * u;               // the headland's top at the tower
        const foot = this.horizon + L.CAM_H * u + 6;                         // its waterline, at Z0
        const tower = { base: top + 2, gallery: this.horizon - (L.LANTERN - 3.5 - L.CAM_H) * u };
        // The layer spans the headland's width (plus room to pan) and its height.
        const left = flip > 0 ? this.towerX - 46 * u : -W * 0.06;
        const right = flip > 0 ? W * 1.06 : this.towerX + 46 * u;
        const y0 = this.lantern.y - 9 * u;
        const c = this.headland = this.canvasOf((right - left) * dpr, (foot + 30 - y0) * dpr), g = c.getContext('2d');
        this.headlandAt = { x: left, y: y0 };
        g.scale(dpr, dpr);
        g.translate(-left, -y0);
        const X = dx => this.towerX + flip * dx * u;    // metres from the tower, seaward is negative
        const edge = flip > 0 ? right + 4 : left - 4;

        // The rock: rising from the sea on the seaward side, a shelf for the
        // tower, then higher ground running off the edge.
        const rock = [[X(-44), foot], [X(-38), foot - 3 * u], [X(-33), top + 9 * u], [X(-27), top + 7 * u], [X(-21), top + 3.5 * u],
            [X(-14), top + 1.5 * u], [X(-7), top], [X(10), top - 0.3 * u], [X(20), top - 1.2 * u], [X(27), top - 4 * u],
            [X(33), top - 5 * u], [X(40), top - 8 * u]];
        g.beginPath();
        g.moveTo(rock[0][0], rock[0][1]);
        for (const [x, y] of rock) g.lineTo(x, y);
        g.lineTo(edge, top - 9 * u);
        g.lineTo(edge, foot + 30);
        g.lineTo(X(-44), foot + 30);
        g.closePath();
        const stone = g.createLinearGradient(0, top - 9 * u, 0, foot);
        stone.addColorStop(0, '#1a2130');
        stone.addColorStop(1, '#07090e');
        g.fillStyle = stone;
        g.fill();
        // Moonlit rims on the rock's upper edges, and a few fissures.
        g.strokeStyle = 'rgba(140,160,190,0.22)';
        g.lineWidth = 1;
        g.beginPath();
        rock.forEach(([x, y], i) => i ? g.lineTo(x, y + 0.5) : g.moveTo(x, y + 0.5));
        g.stroke();
        g.strokeStyle = 'rgba(0,0,0,0.35)';
        for (let i = 0; i < 9; i++) {
            const x = X(-36 + i * 9 + Math.random() * 4), y = top + (2 + Math.random() * 4) * u;
            g.beginPath();
            g.moveTo(x, y);
            g.lineTo(x + flip * (Math.random() - 0.3) * 3 * u, Math.min(foot, y + (4 + Math.random() * 6) * u));
            g.stroke();
        }

        // The keeper's cottage, landward of the tower, one window lit.
        const cw = 9 * u, ch = 4.5 * u, cx0 = X(9) - (flip > 0 ? 0 : cw), cy = top - 0.2 * u;
        g.fillStyle = '#121722';
        g.fillRect(cx0, cy - ch, cw, ch);
        g.beginPath();
        g.moveTo(cx0 - 0.6 * u, cy - ch);
        g.lineTo(cx0 + cw / 2, cy - ch - 3.2 * u);
        g.lineTo(cx0 + cw + 0.6 * u, cy - ch);
        g.closePath();
        g.fillStyle = '#0b0e15';
        g.fill();
        g.fillStyle = '#0b0e15';
        g.fillRect(cx0 + cw * 0.72, cy - ch - 3.4 * u, 0.9 * u, 2.2 * u);   // chimney
        g.drawImage(this.sprites.warm, cx0 + cw * 0.2 - 2.5 * u, cy - ch * 0.62 - 2.5 * u, 6 * u, 6 * u);
        g.fillStyle = '#ffcf8a';
        g.fillRect(cx0 + cw * 0.2, cy - ch * 0.62, 1.1 * u, 1.3 * u);
        g.fillStyle = 'rgba(255,190,110,0.5)';
        g.fillRect(cx0 + cw * 0.55, cy - ch * 0.62, 1.1 * u, 1.3 * u);

        // The tower: tapered, white in moonlight, shaded away from the moon,
        // with one dark band near the top.
        const bw = 4.2 * u, tw = 2.9 * u, tx = this.towerX;
        const shade = g.createLinearGradient(tx - bw, 0, tx + bw, 0);
        const lit = ['#c3ccd9', '#8f9aab', '#4a5262', '#1f242f'];
        (flip > 0 ? lit : [...lit].reverse()).forEach((colour, i) => shade.addColorStop(i / 3, colour));
        g.fillStyle = shade;
        g.beginPath();
        g.moveTo(tx - bw, tower.base);
        g.lineTo(tx - tw, tower.gallery);
        g.lineTo(tx + tw, tower.gallery);
        g.lineTo(tx + bw, tower.base);
        g.closePath();
        g.fill();
        const bandAt = (frac, h) => {
            const y = tower.gallery + (tower.base - tower.gallery) * frac;
            const w = tw + (bw - tw) * frac;
            g.fillRect(tx - w, y, w * 2, h);
        };
        g.fillStyle = 'rgba(120,20,26,0.55)';
        bandAt(0.12, 2.6 * u);
        g.fillStyle = 'rgba(0,0,0,0.22)';
        bandAt(0.12, 2.6 * u);
        // Small windows up the tower, one warm.
        for (const [frac, warm] of [[0.35, false], [0.58, true], [0.8, false]]) {
            const y = tower.gallery + (tower.base - tower.gallery) * frac;
            g.fillStyle = warm ? '#ffcf8a' : 'rgba(10,12,18,0.8)';
            g.fillRect(tx - 0.35 * u, y, 0.7 * u, 1.3 * u);
        }
        // Gallery, lantern room and dome.
        const gy = tower.gallery;
        g.fillStyle = '#151a24';
        g.fillRect(tx - tw - 0.9 * u, gy - 0.6 * u, (tw + 0.9 * u) * 2, 0.8 * u);
        g.strokeStyle = 'rgba(30,36,48,0.95)';
        g.lineWidth = Math.max(1, 0.18 * u);
        g.beginPath();
        g.moveTo(tx - tw - 0.8 * u, gy - 2.1 * u);
        g.lineTo(tx + tw + 0.8 * u, gy - 2.1 * u);
        for (let i = 0; i <= 8; i++) {
            const x = tx - tw - 0.8 * u + i * (tw + 0.8 * u) * 2 / 8;
            g.moveTo(x, gy - 2.1 * u);
            g.lineTo(x, gy - 0.6 * u);
        }
        g.stroke();
        const lw = 1.9 * u, lTop = gy - 5.4 * u;
        this.lanternRoom = { x: tx - lw, y: lTop, w: lw * 2, h: gy - 0.6 * u - lTop };
        g.fillStyle = '#121620';
        g.beginPath();
        g.moveTo(tx - lw - 0.4 * u, lTop);
        g.quadraticCurveTo(tx, lTop - 3.6 * u, tx + lw + 0.4 * u, lTop);
        g.closePath();
        g.fill();
        g.fillRect(tx - 0.12 * u, lTop - 4.6 * u, 0.24 * u, 2 * u);
        g.beginPath();
        g.arc(tx, lTop - 2.6 * u, 0.4 * u, 0, Math.PI * 2);
        g.fill();
        this.lantern.y = lTop + (gy - 0.6 * u - lTop) * 0.5;
    }

    // ---- Clouds: a few soft sprites, drifting ---------------------------------------------------

    buildClouds() {
        this.cloudSprites = [];
        const { W, H } = this;
        for (let i = 0; i < 4; i++) {
            const w = W * (0.35 + Math.random() * 0.3), h = H * (0.07 + Math.random() * 0.05);
            const c = this.canvasOf(w, h), g = c.getContext('2d');
            for (let j = 0; j < 26; j++) {
                const x = w * (0.12 + Math.random() * 0.76), y = h * (0.35 + Math.random() * 0.4), r = h * (0.18 + Math.random() * 0.3);
                const grad = g.createRadialGradient(x, y, 0, x, y, r);
                grad.addColorStop(0, 'rgba(30,37,52,0.8)');
                grad.addColorStop(1, 'rgba(30,37,52,0)');
                g.fillStyle = grad;
                g.fillRect(x - r, y - r, r * 2, r * 2);
            }
            // Moonlit upper edges.
            g.globalCompositeOperation = 'source-atop';
            const rim = g.createLinearGradient(0, 0, 0, h);
            rim.addColorStop(0, 'rgba(150,165,195,0.5)');
            rim.addColorStop(0.45, 'rgba(60,70,95,0.1)');
            rim.addColorStop(1, 'rgba(10,12,18,0.4)');
            g.fillStyle = rim;
            g.fillRect(0, 0, w, h);
            this.cloudSprites.push(c);
        }
    }

    // ---- The scene's moving parts ---------------------------------------------------------------

    seed() {
        this.clouds = [];
        for (let i = 0; i < 9; i++) this.clouds.push(this.makeCloud(true));
        this.ships = [];
        this.syncShips(true);
        this.drops = [];
    }

    makeCloud(anywhere) {
        const sprite = this.cloudSprites[Math.floor(Math.random() * this.cloudSprites.length)];
        return {
            sprite, x: anywhere ? Math.random() * this.W * 1.4 - this.W * 0.2 : -sprite.width,
            y: this.H * (0.02 + Math.random() * 0.3), speed: 0.4 + Math.random() * 0.8, depth: Math.random(),
        };
    }

    // How many ships the setting and density want; extras sail on and leave.
    syncShips(anywhere = false) {
        const want = Math.round(this.config.ships * (0.5 + 0.5 * this.host.quality.density));
        this.ships.forEach((ship, i) => { ship.leaving = i >= want; });
        while (this.ships.filter(s => !s.leaving).length < want) this.ships.push(this.makeShip(anywhere));
    }

    makeShip(anywhere) {
        const z = 700 + Math.random() * 1700;
        const span = this.W / 2 * z / this.f + 80;
        const dir = Math.random() < 0.5 ? -1 : 1;
        const ferry = Math.random() < 0.25;
        return {
            z, dir, ferry, span,
            X: anywhere ? (Math.random() * 2 - 1) * span * 0.85 : -dir * span,
            speed: (ferry ? 7 : 4) + Math.random() * 4,
            length: ferry ? 110 + Math.random() * 60 : 60 + Math.random() * 140,
            mast: ferry ? 22 : 18 + Math.random() * 14,
            windows: ferry ? 8 + Math.floor(Math.random() * 8) : 0,
        };
    }

    // ---- The waves --------------------------------------------------------------------------------

    // Wave height (m) at world X, Z: the sum of the wave trains, each
    // travelling towards the viewer at deep-water speed for its period.
    heightAt(X, Z) {
        let h = 0;
        this.sea.waves.forEach((w, i) => {
            const k = (2 * Math.PI / w.period) ** 2 / 9.81;
            const v = 1 + Math.sin(k * (X * Math.sin(w.angle) + Z * Math.cos(w.angle)) + this.phases[i]);
            h += w.amp * (v * v * 0.5 - 1);
        });
        return h;
    }

    // ---- Each frame ----------------------------------------------------------------------------------

    frame(now) {
        if (!this.running) return;
        this.raf = requestAnimationFrame(this.frame);
        if (this.t0 === null) this.t0 = this.last = now;
        const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
        this.last = now;
        // The light runs on elapsed time alone, so its rhythm survives any frame rate.
        const t = (now - this.t0) / 1000;
        this.update(dt);
        this.draw(t, dt);
        if (this.config.liveSwell && performance.now() - this.checkedSwell > 60000) this.loadSwell();
    }

    update(dt) {
        // Ease the sea towards its target: amplitudes and periods glide, and
        // each train's phase advances by its own frequency, so nothing jumps.
        const target = this.targetSea();
        const ease = 1 - Math.exp(-dt / 3);
        const sea = this.sea;
        sea.storm += (target.storm - sea.storm) * ease;
        sea.height += (target.height - sea.height) * ease;
        sea.waves.forEach((w, i) => {
            const goal = target.waves[i];
            w.amp += (goal.amp - w.amp) * ease;
            w.period += (goal.period - w.period) * ease;
            w.angle += (goal.angle - w.angle) * ease;
            this.phases[i] = (this.phases[i] + dt * 2 * Math.PI / w.period) % (Math.PI * 2 * 1000);
        });
        this.pan += (this.panTarget - this.pan) * (1 - Math.exp(-dt * 4));
        for (const key of ['spray', 'glints']) {
            const goal = this.wants(key);
            this.fx[key] += Math.sign(goal - this.fx[key]) * Math.min(Math.abs(goal - this.fx[key]), dt / 1.5);
        }
        if (this.config.ships !== this.shipsFor) {
            this.shipsFor = this.config.ships;
            this.syncShips();
        }
    }

    draw(t, dt) {
        const ctx = this.ctx, { W, H, dpr } = this;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.drawImage(this.sky, 0, 0);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const storm = this.sea.storm;
        const intensity = LighthouseLight.intensity(this.light, t);
        const beams = this.beamsAt(t);

        this.drawClouds(ctx, dt, storm);
        this.drawLightning(ctx, dt, storm);

        // The sea, far bands first, then the headland, then the near bands.
        ctx.fillStyle = '#1b2638';
        ctx.fillRect(0, this.horizon - 1, W, H - this.horizon + 1);
        for (let i = 0; i < this.firstNear; i++) this.drawBand(ctx, i);
        this.drawShips(ctx, dt);
        const at = this.project(this.X0, 0, LighthouseAnimationManager.Z0).x - this.towerX;
        ctx.drawImage(this.headland, this.headlandAt.x + at, this.headlandAt.y, this.headland.width / dpr, this.headland.height / dpr);
        this.lanternX = this.towerX + at;
        for (let i = this.firstNear; i < this.bands.length; i++) this.drawBand(ctx, i);

        ctx.globalCompositeOperation = 'lighter';
        if (this.moon) {
            const m = this.moon, w = m.r * 7;
            ctx.globalAlpha = 0.18 * m.light * (1 - 0.7 * storm);
            ctx.drawImage(this.sprites.column, m.x - w / 2, this.horizon, w, (H - this.horizon) * 0.9);
        }
        if (this.fx.glints > 0.01) this.drawBeamOnWater(ctx, beams, intensity);
        this.drawSpray(ctx, dt, beams);
        this.drawBeams(ctx, beams, intensity);
        this.drawLantern(ctx, intensity);
        ctx.globalCompositeOperation = 'source-over';
        this.drawRain(ctx, dt, beams);
        ctx.globalAlpha = 1;
    }

    // ---- Sea bands ----------------------------------------------------------------------------------

    drawBand(ctx, i) {
        const L = LighthouseAnimationManager;
        const band = this.bands[i], next = this.bands[i + 1];
        const { W, f } = this;
        const z = band.z, scale = f / z, exaggerate = 1 + 1.2 * i / (this.bands.length - 1);
        const camX = this.pan * 0.08 * W * L.Z0 / f;
        const step = 6, n = Math.ceil(W / step) + 2, ys = this.ys;
        const waves = this.sea.waves;
        let total = 0;
        // Per train: its phase at the left edge and its change per pixel,
        // faded where its crests would be too close together to draw.
        const trains = waves.map((w, j) => {
            const k = (2 * Math.PI / w.period) ** 2 / 9.81;
            const kx = k * Math.sin(w.angle) * z / f;                   // radians per px along the band
            const crowd = Math.abs(kx) * step;
            const amp = w.amp * scale * exaggerate * (crowd > 0.9 ? 0 : crowd > 0.45 ? (0.9 - crowd) / 0.45 : 1);
            total += amp;
            return { amp, kx, phase: k * ((-this.cx * z / f + camX) * Math.sin(w.angle) + z * Math.cos(w.angle)) + this.phases[j] };
        });
        const crestAt = total * 0.62 + 0.0001;
        const foamFrom = 1.3 - this.sea.storm * 0.75;
        let top = Infinity;
        for (let p = 0; p < n; p++) {
            const x = p * step - step;
            let h = 0;
            // Peaked crests and flat troughs, like real waves: (1 + sin)² / 2 - 1.
            for (const tr of trains) {
                const v = 1 + Math.sin(tr.phase + tr.kx * x);
                h += tr.amp * (v * v * 0.5 - 1);
            }
            const y = band.base - h;
            ys[p] = y;
            if (y < top) top = y;
        }
        // Fill down to where the next band is sure to cover it: each band's
        // face is lighter at its crests and darkens into its troughs, which is
        // what lets one ridge stand out against the next.
        const depth = i / (this.bands.length - 1);
        const bottom = next ? next.base + total * 1.2 + 2 + (next.base - band.base) : this.H;
        ctx.beginPath();
        ctx.moveTo(-step, bottom);
        for (let p = 0; p < n; p++) ctx.lineTo(p * step - step, ys[p]);
        ctx.lineTo(n * step, bottom);
        ctx.closePath();
        const face = ctx.createLinearGradient(0, top, 0, Math.max(top + 4, band.base + total + (next ? next.base - band.base : 0)));
        face.addColorStop(0, this.seaColour(depth, 1));
        face.addColorStop(1, this.seaColour(depth, 0));
        ctx.fillStyle = face;
        ctx.fill();
        // Moonlit crest line.
        const moon = this.moon ? 0.35 + 0.65 * this.moon.light : 0.25;
        ctx.strokeStyle = `rgba(150,172,205,${(0.05 + 0.2 * depth) * moon})`;
        ctx.lineWidth = 0.6 + depth * 1.1;
        ctx.stroke();
        // Whitecaps where the crests run highest, in irregular patches that
        // ride along with the waves.
        if (foamFrom < 1.6 && total > 0.8 && depth > 0.55) {
            ctx.beginPath();
            const [swell, wind] = trains;
            for (let p = 1; p < n; p++) {
                const lift = (band.base - ys[p]) / crestAt;
                const x = p * step - step;
                if (lift <= foamFrom) continue;
                const patch = Math.sin(swell.phase * 3.1 + swell.kx * x * 7.3 + i * 1.7) + Math.sin(wind.phase * 2.3 + wind.kx * x * 5.1 + i);
                if (patch < 0.9) continue;
                ctx.moveTo(x - step, ys[p - 1] + 0.8);
                ctx.lineTo(x, ys[p] + 0.8);
            }
            const strength = Math.min(1, (1.6 - foamFrom) * 2) * (0.3 + 0.5 * depth);
            const d = 6 + 22 * depth;
            ctx.setLineDash([d, d * 0.6, d * 0.4, d * 1.3, d * 1.6, d * 0.8]);
            ctx.lineDashOffset = -swell.phase * d * 2;
            ctx.lineCap = 'butt';
            ctx.strokeStyle = `rgba(215,228,240,${0.3 * strength})`;
            ctx.lineWidth = Math.min(7, 1.4 + total * 0.1) * (0.4 + 0.6 * depth);
            ctx.stroke();
            ctx.strokeStyle = `rgba(235,242,250,${0.7 * strength})`;
            ctx.lineWidth = Math.min(3, 0.6 + total * 0.04) * (0.5 + 0.5 * depth);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        // The moon's path: glints on the crests below it.
        if (this.moon) {
            const mx = this.moon.x, spread = 18 + (band.base - this.horizon) * 0.55;
            const s = 3 + 14 * depth, a = 0.7 * this.moon.light + 0.1;
            ctx.globalCompositeOperation = 'lighter';
            for (let p = 1; p < n - 1; p++) {
                const x = p * step - step, off = Math.abs(x - mx);
                if (off > spread || ys[p] > ys[p - 1] || ys[p] > ys[p + 1]) continue;
                ctx.globalAlpha = a * (1 - off / spread);
                ctx.drawImage(this.sprites.glint, x - s * 1.6, ys[p] - s * 0.3, s * 3.2, s * 0.9);
            }
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
        }
    }

    // The sea's colour at a depth (0 far, 1 near), on a wave's face (lit 1)
    // or in its trough (0). Far water catches the sky's haze.
    seaColour(depth, lit) {
        const k = Math.pow(depth, 0.6);
        const face = [[40, 52, 74], [22, 34, 52]], trough = [[30, 41, 60], [3, 8, 15]];
        const at = (pair, i) => pair[0][i] + (pair[1][i] - pair[0][i]) * k;
        const rgb = [0, 1, 2].map(i => Math.round(at(trough, i) + (at(face, i) - at(trough, i)) * lit));
        return `rgb(${rgb.join(',')})`;
    }

    // ---- The light -----------------------------------------------------------------------------------

    // Each beam as a screen-space wedge: apex at the lantern, far edge
    // where the beam has spread out over the sea (or nearly reached us).
    beamsAt(t) {
        if (!this.light.rotating) return [];
        const L = LighthouseAnimationManager;
        // Straight at the viewer, in the sea's plane.
        const tx = -this.X0, tz = -L.Z0, tl = Math.hypot(tx, tz);
        return LighthouseLight.beamAngles(this.light, t).map(({ angle, width }) => {
            const c = Math.cos(angle), s = Math.sin(angle);
            const dx = (tx * c - tz * s) / tl, dz = (tx * s + tz * c) / tl;
            const half = Math.min(0.11, Math.max(0.06, width * 0.25));
            const reach = dz < 0 ? Math.min(2400, (L.Z0 - 12) / -dz) : 2400;
            // The beam is a cone: its far end, seen from here, is a disc, so
            // the wedge opens across the screen whichever way it points.
            const far = this.project(this.X0 + dx * reach, L.LANTERN, L.Z0 + dz * reach);
            const radius = this.f * (2 + reach * Math.tan(half)) / (L.Z0 + dz * reach);
            const lx = this.project(this.X0, L.LANTERN, L.Z0);
            const ux = far.x - lx.x, uy = far.y - lx.y, ul = Math.hypot(ux, uy) || 1;
            const a = { x: far.x - uy / ul * radius, y: far.y + ux / ul * radius };
            const b = { x: far.x + uy / ul * radius, y: far.y - ux / ul * radius };
            const facing = Math.max(0, Math.cos(angle));
            return { dx, dz, a, b, reach, facing, angle };
        });
    }

    drawBeams(ctx, beams, intensity) {
        const air = this.config.beam * (0.26 + 0.3 * this.rainAmount() + 0.1 * this.sea.storm);
        const B = this.sprites.beam.width;
        const lx = this.lanternX, ly = this.lantern.y;
        for (const beam of beams) {
            const { a, b } = beam;
            const mx = (a.x + b.x) / 2 - lx, my = (a.y + b.y) / 2 - ly;
            // Affine map of the sprite's triangle onto (lantern, a, b).
            ctx.setTransform(this.dpr * mx / B, this.dpr * my / B, this.dpr * (b.x - a.x) / B, this.dpr * (b.y - a.y) / B,
                this.dpr * (lx - (b.x - a.x) / 2), this.dpr * (ly - (b.y - a.y) / 2));
            ctx.globalAlpha = Math.min(1, air * (0.55 + 0.45 * beam.facing));
            ctx.drawImage(this.sprites.beam, 0, 0);
        }
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        // As a beam sweeps over the viewer, the whole night brightens.
        if (intensity > 0.02 && this.light.rotating) {
            ctx.globalAlpha = 0.12 * intensity * intensity * Math.min(1.5, this.config.beam);
            ctx.fillStyle = '#c8d4ee';
            ctx.fillRect(0, 0, this.W, this.H);
        }
        ctx.globalAlpha = 1;
    }

    drawLantern(ctx, intensity) {
        const lx = this.lanternX, ly = this.lantern.y, u = this.unit;
        const steady = this.light.rotating ? 0.35 : 0;
        const level = Math.max(steady, intensity);
        // The lamp through the glass.
        ctx.globalAlpha = 0.5 + 0.5 * level;
        const room = this.lanternRoom;
        ctx.drawImage(this.sprites.warm, lx - room.w * 1.6, ly - room.h * 1.3, room.w * 3.2, room.h * 2.6);
        ctx.globalAlpha = 1;
        // Glass panes and their bars, lit from within.
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = `rgba(255,${200 + 40 * level | 0},${130 + 80 * level | 0},${0.55 + 0.45 * level})`;
        ctx.fillRect(lx - room.w / 2, room.y, room.w, room.h);
        ctx.fillStyle = 'rgba(20,24,32,0.85)';
        for (let i = 0; i <= 3; i++) ctx.fillRect(lx - room.w / 2 + i * room.w / 3 - 0.5, room.y, Math.max(1, 0.15 * u), room.h);
        ctx.fillRect(lx - room.w / 2, room.y + room.h * 0.5, room.w, Math.max(1, 0.12 * u));
        ctx.globalCompositeOperation = 'lighter';
        // The flare: a glow that swells as a beam faces the viewer, with a streak.
        const r = (room.w * 2.2 + Math.min(this.W, this.H) * 0.32 * intensity) * (this.light.rotating ? 1 : 0.6 + 0.4 * intensity);
        ctx.globalAlpha = Math.min(1, 0.35 + 0.65 * level);
        ctx.drawImage(this.sprites.flare, lx - r, ly - r, r * 2, r * 2);
        if (intensity > 0.3) {
            const sw = this.W * (0.25 + 0.6 * intensity);
            ctx.globalAlpha = (intensity - 0.3) / 0.7 * 0.8;
            ctx.drawImage(this.sprites.streak, lx - sw / 2, ly - 6 - intensity * 6, sw, 12 + intensity * 12);
        }
        // Its reflection on the water below.
        ctx.globalAlpha = 0.25 * level;
        const top = this.horizon + LighthouseAnimationManager.CAM_H * u + 4;
        for (let i = 0; i < 6; i++) {
            const y = top + i * i * 5 + 4, s = 4 + i * 3;
            ctx.drawImage(this.sprites.glint, lx - s * 2 + Math.sin(this.phases[0] * 3 + i) * s * 0.6, y, s * 4, s * 0.7);
        }
        ctx.globalAlpha = 1;
    }

    // Where each beam crosses the water, the crests glitter.
    drawBeamOnWater(ctx, beams, intensity) {
        const L = LighthouseAnimationManager;
        for (const beam of beams) {
            const along = 0.5 + 0.5 * beam.facing;
            for (let i = 1; i <= 9; i++) {
                const s = beam.reach * (i / 10) ** 1.4;
                const Z = L.Z0 + beam.dz * s;
                if (Z < 20) break;
                const p = this.project(this.X0 + beam.dx * s, 0, Z);
                if (p.y > this.H) continue;
                const size = Math.min(140, 3600 / Z) * (1 + 1.5 * beam.facing);
                ctx.globalAlpha = this.fx.glints * this.config.beam * 0.4 * along * (1 - i / 11);
                ctx.drawImage(this.sprites.glint, p.x - size, p.y - size * 0.15, size * 2, size * 0.32);
            }
        }
        ctx.globalAlpha = 1;
    }

    // Is screen point (x, y) inside any beam's wedge? A cross-product test.
    inBeam(beams, x, y) {
        const lx = this.lanternX, ly = this.lantern.y;
        for (const beam of beams) {
            const ax = beam.a.x - lx, ay = beam.a.y - ly, bx = beam.b.x - lx, by = beam.b.y - ly, px = x - lx, py = y - ly;
            const side = ax * by - ay * bx;
            if ((ax * py - ay * px) * side >= 0 && (px * by - py * bx) * side >= 0 && px * (ax + bx) + py * (ay + by) > 0) return true;
        }
        return false;
    }

    // ---- Sky: clouds and lightning ------------------------------------------------------------------

    drawClouds(ctx, dt, storm) {
        const want = Math.round((1 + storm * 8) * (0.6 + 0.4 * this.host.quality.density));
        const alpha = 0.45 + storm * 0.55;
        const wind = 4 + storm * 40;
        // A gale's overcast dims the sky as a whole.
        if (storm > 0.4) {
            ctx.globalAlpha = (storm - 0.4) * 1.1;
            ctx.fillStyle = '#05070c';
            ctx.fillRect(0, 0, this.W, this.horizon);
        }
        let shown = 0;
        for (const cloud of this.clouds) {
            cloud.x += cloud.speed * wind * dt;
            if (cloud.x > this.W + 20) Object.assign(cloud, this.makeCloud(false));
            if (shown++ >= want) continue;
            ctx.globalAlpha = alpha * (0.6 + 0.4 * cloud.depth);
            ctx.drawImage(cloud.sprite, cloud.x, cloud.y);
        }
        ctx.globalAlpha = 1;
    }

    drawLightning(ctx, dt, storm) {
        if (storm > 0.8 && this.rainAmount() > 0.3) {
            this.nextBolt -= dt;
            if (this.nextBolt <= 0) {
                this.nextBolt = 12 + Math.random() * 40;
                const x0 = this.cx - this.flip * this.W * (0.1 + Math.random() * 0.35);
                const points = [[x0, this.H * 0.05]];
                let x = x0, y = this.H * 0.05;
                while (y < this.horizon) {
                    y += 8 + Math.random() * 22;
                    x += (Math.random() - 0.5) * 26;
                    points.push([x, Math.min(y, this.horizon)]);
                }
                this.bolt = { points, age: 0 };
            }
        }
        const bolt = this.bolt;
        if (!bolt) return;
        bolt.age += dt;
        // Two quick flickers and a fade.
        const a = bolt.age < 0.08 ? 1 : bolt.age < 0.14 ? 0.2 : bolt.age < 0.24 ? 0.85 : Math.max(0, 1 - (bolt.age - 0.24) / 0.5);
        if (a <= 0) { this.bolt = null; return; }
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a * 0.3;
        ctx.fillStyle = '#9fb0d8';
        ctx.fillRect(0, 0, this.W, this.horizon);
        ctx.beginPath();
        bolt.points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
        ctx.strokeStyle = '#c9d6ff';
        ctx.globalAlpha = a * 0.35;
        ctx.lineWidth = 6;
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.globalAlpha = a;
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
    }

    // ---- Ships ---------------------------------------------------------------------------------------

    drawShips(ctx, dt) {
        const L = LighthouseAnimationManager;
        ctx.globalCompositeOperation = 'lighter';
        const sprites = this.sprites;
        for (let i = this.ships.length - 1; i >= 0; i--) {
            const ship = this.ships[i];
            ship.X += ship.dir * ship.speed * dt;
            if (Math.abs(ship.X) > ship.span + ship.length) {
                if (ship.leaving) this.ships.splice(i, 1);
                else Object.assign(ship, this.makeShip(false));
                continue;
            }
            const bob = this.heightAt(ship.X, ship.z) * 0.4;
            const deck = this.project(ship.X, 3 + bob, ship.z);
            const scale = this.f / ship.z;
            const s = Math.max(5, Math.min(14, scale * 9));
            const light = (sprite, x, y, size, a = 1) => {
                ctx.globalAlpha = a;
                ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
            };
            const bow = ship.dir * ship.length * 0.35 * scale;
            // Masthead lights: forward and (higher) aft; the side light
            // shows the side towards us: green moving right, red moving left.
            light(sprites.white, deck.x + bow, deck.y - ship.mast * scale, s);
            light(sprites.white, deck.x - bow * 0.6, deck.y - ship.mast * 1.25 * scale, s);
            light(ship.dir > 0 ? sprites.green : sprites.red, deck.x + bow * 0.7, deck.y - 2 * scale, s * 0.9);
            if (ship.ferry) {
                for (let w = 0; w < ship.windows; w++) {
                    const x = deck.x - ship.length * 0.4 * scale + w * ship.length * 0.8 * scale / ship.windows;
                    light(sprites.amber, x, deck.y - 5 * scale, s * 0.7, 0.8);
                    light(sprites.amber, x, deck.y - 8.5 * scale, s * 0.6, w % 3 ? 0.65 : 0.25);
                }
                // A faint glow on the water beneath it.
                ctx.globalAlpha = 0.15;
                ctx.drawImage(sprites.warm, deck.x - ship.length * 0.6 * scale, deck.y - 2 * scale, ship.length * 1.2 * scale, 8 * scale + 4);
            }
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
    }

    // ---- Spray on the rocks ----------------------------------------------------------------------------

    drawSpray(ctx, dt, beams) {
        const L = LighthouseAnimationManager;
        const strength = this.fx.spray * Math.max(0, this.sea.storm - 0.08);
        if (strength > 0.01) {
            for (const site of this.sites) {
                const h = this.heightAt(site.X, L.Z0 * 0.96);
                const peak = this.sea.height * 0.42;
                // A wave arriving: spray as it crosses the threshold, rising.
                if (h > peak && site.last <= peak) this.burst(site, strength);
                site.last = h;
            }
        }
        if (!this.spray.length) return;
        const g = 9.81 * this.unit;
        const lit = [];
        for (let i = this.spray.length - 1; i >= 0; i--) {
            const p = this.spray[i];
            p.age += dt;
            if (p.age > p.life) {
                this.sprayFree.push(this.spray[i]);
                this.spray[i] = this.spray[this.spray.length - 1];
                this.spray.pop();
                continue;
            }
            p.vy += g * dt;
            p.vx *= 1 - dt * 0.6;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            const a = (1 - p.age / p.life) * 0.55 * this.fx.spray;
            if (this.fx.glints > 0.01 && beams.length && this.inBeam(beams, p.x, p.y)) lit.push(p);
            ctx.globalAlpha = a;
            ctx.drawImage(this.sprites.foam, p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
        }
        // Spray caught in a beam lights up.
        for (const p of lit) {
            ctx.globalAlpha = (1 - p.age / p.life) * this.fx.glints;
            ctx.drawImage(this.sprites.amber, p.x - p.size * 1.5, p.y - p.size * 1.5, p.size * 3, p.size * 3);
        }
        ctx.globalAlpha = 1;
    }

    burst(site, strength) {
        const L = LighthouseAnimationManager;
        const base = this.project(site.X, 0, L.Z0 * 0.98);
        const count = Math.round((10 + 40 * strength) * this.host.quality.density);
        const u = this.unit;
        for (let i = 0; i < count && this.spray.length < 260; i++) {
            const p = this.sprayFree.pop() || {};
            const up = (5 + Math.random() * 7 * (0.4 + strength)) * u;
            Object.assign(p, {
                x: base.x + (Math.random() - 0.5) * 6 * u, y: base.y - Math.random() * 3 * u,
                vx: (Math.random() - 0.5) * 7 * u + this.flip * -2 * u, vy: -up,
                age: 0, life: 0.8 + Math.random() * 1.1, size: (0.25 + Math.random() * 0.5) * u,
            });
            this.spray.push(p);
        }
    }

    // ---- Rain -------------------------------------------------------------------------------------------

    drawRain(ctx, dt, beams) {
        const amount = this.rainAmount();
        const want = Math.round(amount * 520 * this.host.quality.density);
        const drops = this.drops, W = this.W, H = this.H;
        const wind = 0.12 + this.sea.storm * 0.3;
        while (drops.length < want) drops.push({ x: Math.random() * W * 1.2 - W * 0.1, y: Math.random() * H, v: 0, len: 0, fresh: true });
        if (!drops.length) return;
        const lit = [];
        ctx.beginPath();
        for (let i = drops.length - 1; i >= 0; i--) {
            const d = drops[i];
            if (d.fresh || d.y > H) {
                if (!d.fresh && i >= want) { drops[i] = drops[drops.length - 1]; drops.pop(); continue; }
                const depth = Math.random();
                d.v = 700 + depth * 700;
                d.len = 8 + depth * 16;
                if (!d.fresh) { d.x = Math.random() * W * 1.2 - W * 0.1; d.y = -d.len - Math.random() * 40; }
                d.fresh = false;
            }
            d.y += d.v * dt;
            d.x += d.v * wind * dt;
            if (d.x > W + 20) d.x -= W * 1.2;
            if (this.fx.glints > 0.01 && beams.length && this.inBeam(beams, d.x, d.y)) { lit.push(d); continue; }
            ctx.moveTo(d.x, d.y);
            ctx.lineTo(d.x - d.len * wind, d.y - d.len);
        }
        ctx.strokeStyle = 'rgba(160,180,210,0.28)';
        ctx.lineWidth = 1;
        ctx.stroke();
        if (lit.length) {
            ctx.beginPath();
            for (const d of lit) {
                ctx.moveTo(d.x, d.y);
                ctx.lineTo(d.x - d.len * wind, d.y - d.len);
            }
            ctx.strokeStyle = `rgba(255,248,230,${0.75 * this.fx.glints})`;
            ctx.lineWidth = 1.3;
            ctx.stroke();
        }
    }

    // For the smoke test: how far the waves rise and fall on screen (px)
    // in the band nearest the bottom fifth of the screen.
    seaPixels() {
        const band = this.bands.reduce((best, b) => Math.abs(b.base - this.H * 0.85) < Math.abs(best.base - this.H * 0.85) ? b : best);
        return this.sea.waves.reduce((sum, w) => sum + w.amp, 0) * this.f / band.z * (1 + 1.2 * this.bands.indexOf(band) / (this.bands.length - 1));
    }
}
