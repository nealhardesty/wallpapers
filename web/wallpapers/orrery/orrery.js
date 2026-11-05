// The Orrery (SPEC §10.26): the solar system as it is right now, from
// host.now(), or in time-lapse, in three looks (orrery-looks.js): deep
// space, an antique brass machine, or an ink star chart. The sky's
// mechanics are orrery-math.js (Standish's elements, Kepler's equation, the
// Moon, Jupiter's four, the zodiac, the seasons); the art is orrery-art.js.
//
// Positions are J2000 heliocentric AU, mapped to the screen by a radial
// scale that keeps every direction true (so an opposition is a straight
// line through the Sun at any scale), then by a top or tilted camera.
//
// Cost: in live time with the camera still nothing moves for a minute, so
// the picture is drawn once a minute from cached layers (the background
// per resize and look, the plane of orbits and the zodiac per camera); in
// deep space the corona and the belt shimmer at a few frames a second
// unless motion is reduced. Time-lapse and a drifting camera run at the
// stage's slow-motion rate.

const ORRERY_SPEEDS = [
    ['live', 'Live', 0], ['hour', '1 h/s', 3600e3], ['day', '1 day/s', 86400e3], ['week', '1 week/s', 7 * 86400e3],
    ['month', '1 month/s', 30.436875 * 86400e3], ['year', '1 year/s', 365.25 * 86400e3],
];
const ORRERY_LOOK_NAMES = { space: '🌌 Deep space', brass: '⚙️ A brass orrery', chart: '📜 An ink star chart' };
const ORRERY_SCALE_NAMES = { compressed: '📏 Compressed: all eight fit', true: '📐 True to scale', inner: '🔭 The inner planets and the belt' };
const ORRERY_PLANETS = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
const ORRERY_GLYPHS = { sun: '☉', mercury: '☿', venus: '♀', earth: '♁', mars: '♂', jupiter: '♃', saturn: '♄', uranus: '⛢', neptune: '♆', pluto: '♇', moon: '☾' };
// Time-lapse stays where the tables hold: Standish's long table runs
// 3000 BC–3000 AD; 1000–2999 keeps to four-digit years in the readout.
const ORRERY_FROM = Date.UTC(1000, 0, 1), ORRERY_UNTIL = Date.UTC(2999, 11, 31, 12);
const ORRERY_DAY = 86400000;
const ORRERY_LIGHT_MINUTES = 499.004784 / 60;   // per AU
// Named by month, not season: spring in the north is autumn in the south.
const ORRERY_SEASONS = [['march', 'March equinox'], ['june', 'June solstice'], ['september', 'September equinox'], ['december', 'December solstice']];
// Ring poles (IAU, RA and Dec, degrees), for Saturn's and Uranus's rings.
const ORRERY_POLES = { saturn: [40.589, 83.537], uranus: [257.311, -15.175] };

class OrreryAnimationManager {
    constructor(host) {
        this.host = host;
        this.config = WP.settings.load();
        this.quality = host.quality;
        this.locale = (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
        this.sim = this.clampTime(host.now().getTime());
        this.camera = { az: -20, el: 25 };
        this.scroll = 0.5;
        this.selected = null;
        this.positions = null;
        this.seasonCache = new Map();
        this.formats = new Map();
        this.fx = { glow: this.wants('glow') ? 1 : 0, belt: this.wants('belt') ? 1 : 0 };
        this.poles = {};
        for (const [id, [ra, dec]] of Object.entries(ORRERY_POLES)) this.poles[id] = this.pole(ra, dec);
        this.makeBelt();
        this.beltShown = this.beltTarget();
        this.minute = -1;
        this.running = false;
    }

    get look() { return OrreryLooks[this.config.look] || OrreryLooks.space; }
    get rate() { return (ORRERY_SPEEDS.find(s => s[0] === this.config.speed) || ORRERY_SPEEDS[0])[2]; }
    get speedLabel() { return (ORRERY_SPEEDS.find(s => s[0] === this.config.speed) || ORRERY_SPEEDS[0])[1]; }
    get density() { return this.quality?.density ?? 1; }
    wants(name) { return !!this.quality?.effects?.includes(name); }
    get tilted() { return this.config.view === 'tilted'; }
    clampTime(ms) { return Math.min(ORRERY_UNTIL, Math.max(ORRERY_FROM, ms)); }
    date() { return new Date(this.sim); }

    // A ring's pole, from equatorial RA and Dec to a J2000 ecliptic unit vector.
    pole(ra, dec) {
        const r = Math.PI / 180, e = 23.4392911 * r;
        const x = Math.cos(dec * r) * Math.cos(ra * r), y = Math.cos(dec * r) * Math.sin(ra * r), z = Math.sin(dec * r);
        return { x, y: y * Math.cos(e) + z * Math.sin(e), z: -y * Math.sin(e) + z * Math.cos(e) };
    }

    // ---- Lifecycle -----------------------------------------------------------------

    start() {
        if (this.running) return;
        this.running = true;
        this.canvas = document.createElement('canvas');
        Object.assign(this.canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: '-1', pointerEvents: 'none' });
        document.body.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
        this.onResize = () => this.resize();
        window.addEventListener('resize', this.onResize);
        this.listen();
        this.resize();
        this.last = performance.now();
        this.frameId = requestAnimationFrame(t => this.frame(t));
    }

    stop() {
        this.running = false;
        cancelAnimationFrame(this.frameId);
        window.removeEventListener('resize', this.onResize);
        this.stopGestures?.();
        this.stopGestures = null;
        this.canvas?.remove();
        this.canvas = this.ctx = null;
    }

    listen() {
        this.stopGestures?.();
        this.stopGestures = this.config.touch && !this.host.params.thumb ? this.host.gestures({
            tap: (x, y) => this.tap(x, y),
            start: (x, y) => { if (this.tilted) this.drag = { x, y }; },   // from above, a drag turns nothing
            move: (x, y) => this.dragTo(x, y),
            end: () => { this.drag = null; this.wake(); },
        }) : null;
    }

    resize() {
        if (!this.canvas) return;
        const dpr = window.devicePixelRatio || 1;
        this.W = innerWidth;
        this.H = innerHeight;
        this.canvas.width = Math.round(this.W * dpr);
        this.canvas.height = Math.round(this.H * dpr);
        this.dpr = this.canvas.width / this.W;
        const ins = this.host.insets;
        this.safe = { left: ins.left, top: ins.top, right: this.W - ins.right, bottom: this.H - ins.bottom };
        this.k = OrreryArt.clamp(Math.min(this.W, this.H) / 820, 0.8, 2.4);
        // A tall screen looks down more steeply, to fill its height, until a drag sets it.
        if (!this.turned) this.camera.el = this.H > this.W * 1.2 ? 50 : 25;
        this.layers = {};
        this.sprites = new Map();
        this.fade = null;
        this.fit();
        this.dirty = true;
    }

    // Where the system sits and how big: the plane's outermost ring fits the
    // safe area's short side, above the brass look's plinth (base × 1.1 tall).
    fit() {
        const s = this.safe, m = 12 * this.k;
        this.base = this.config.look === 'brass' ? OrreryArt.clamp((s.bottom - s.top) * 0.075, 26, 90) : 0;
        const aw = s.right - s.left - 2 * m, ah = s.bottom - s.top - 2 * m - (this.base ? this.base * 1.1 + 4 : 0);
        this.ringIn = 1.035;
        this.ringOut = this.config.showZodiac ? 1.12 : 1.04;
        if (!this.tilted) {
            this.R = Math.max(40, Math.min(aw, ah) / 2 / this.ringOut);
            this.cx = (s.left + s.right) / 2;
            this.cy = s.top + m + ah / 2;
            this.box = null;
            return;
        }
        // Tilted: the bounding box of the outer ring at unit size, then scaled.
        this.R = 1; this.cx = this.cy = 0;
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        const p = {};
        for (let i = 0; i < 64; i++) {
            const a = i / 64 * OrreryArt.TAU;
            this.project(Math.cos(a) * this.ringOut, Math.sin(a) * this.ringOut, 0, p);
            x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
        }
        // The brass pillar reaches down to the plinth.
        if (this.config.look === 'brass') { this.project(0, 0, -0.32, p); y1 = Math.max(y1, p.y); }
        this.R = Math.max(40, Math.min(aw / (x1 - x0), ah / (y1 - y0)));
        this.cx = (s.left + s.right) / 2 - (x0 + x1) / 2 * this.R;
        this.cy = s.top + m + ah / 2 - (y0 + y1) / 2 * this.R;
    }

    applySettings(config) {
        const old = this.config;
        this.config = config;
        const changed = key => JSON.stringify(old[key]) !== JSON.stringify(config[key]);
        if (changed('touch')) this.listen();
        if (changed('speed')) {
            if (config.speed === 'live') this.sim = this.clampTime(this.host.now().getTime());
        }
        if (['look', 'scale', 'view', 'showPluto', 'chartPalette', 'zodiac', 'showZodiac'].some(changed)) this.crossfade();
        if (['look', 'view', 'showZodiac'].some(changed)) { this.layers = {}; this.fit(); }
        if (changed('look') || changed('chartPalette')) this.layers = {};
        if (changed('planetSize') || changed('scale')) this.sprites = new Map();
        this.orbits = null;
        this.wake();
    }

    onQuality(quality) {
        const before = this.quality;
        this.quality = quality;
        if (before?.density !== quality.density) { this.layers = {}; this.crossfade(1.5); }
        this.wake();
    }

    // Android's home screens: the tilted camera turns a little either way.
    onScroll(x) {
        this.scroll = OrreryArt.clamp(x, 0, 1);
        if (this.tilted) this.wake();
    }

    onResume() { this.last = performance.now(); this.wake(); }

    wake() {
        this.dirty = true;
        if (this.running) this.host.idleUntil(0);
    }

    change(values) {
        const next = { ...this.config, ...values };
        WP.settings.save(next);
        this.applySettings(next);
    }

    // ---- Time and keys ---------------------------------------------------------------

    formatDate(ms, withTime = false) {
        const options = withTime ? { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric' };
        const key = JSON.stringify(options);
        if (!this.formats.has(key)) {
            let f;
            try { f = new Intl.DateTimeFormat(this.locale, options); } catch { f = new Intl.DateTimeFormat('en-GB', options); }
            this.formats.set(key, f);
        }
        return this.formats.get(key).format(new Date(ms));
    }

    setSpeed(speed) {
        if (this.config.speed === 'live' && speed !== 'live') this.sim = this.clampTime(this.host.now().getTime());
        this.change({ speed });
        this.said = speed === 'live' ? `🕰️ Live · ${this.formatDate(this.sim)}` : `⏩ ${this.speedLabel} · from ${this.formatDate(this.sim)}`;
        return this.said;
    }

    faster() {
        const i = ORRERY_SPEEDS.findIndex(s => s[0] === this.config.speed);
        return this.setSpeed(ORRERY_SPEEDS[Math.min(ORRERY_SPEEDS.length - 1, i + 1)][0]);
    }

    slower() {
        const i = ORRERY_SPEEDS.findIndex(s => s[0] === this.config.speed);
        return this.setSpeed(ORRERY_SPEEDS[Math.max(0, i - 1)][0]);
    }

    backToNow() {
        this.sim = this.clampTime(this.host.now().getTime());
        if (this.config.speed !== 'live') this.change({ speed: 'live' });
        else this.wake();
        this.said = `🕰️ Back to now · ${this.formatDate(this.sim)}`;
        return this.said;
    }

    cycle(key, names) {
        const list = Object.keys(names);
        const value = list[(list.indexOf(this.config[key]) + 1) % list.length];
        this.change({ [key]: value });
        return names[value];
    }

    nextLook() { return this.cycle('look', ORRERY_LOOK_NAMES); }
    nextScale() { return this.cycle('scale', ORRERY_SCALE_NAMES); }
    nextView() { return this.cycle('view', { top: '⬇️ From above', tilted: '📐 Tilted' }); }

    // The next equinox or solstice after `ms`: "March equinox in 8 days".
    season(ms) {
        const year = new Date(ms).getUTCFullYear();
        for (const y of [year, year + 1]) {
            if (!this.seasonCache.has(y)) {
                if (this.seasonCache.size > 12) this.seasonCache.clear();
                this.seasonCache.set(y, OrreryMath.seasons(y));
            }
            const s = this.seasonCache.get(y);
            for (const [key, name] of ORRERY_SEASONS) {
                const at = s[key].getTime();
                if (at < ms - ORRERY_DAY / 2) continue;
                const days = (at - ms) / ORRERY_DAY;
                return days < 0.5 ? `${name} today` : days < 1.5 ? `${name} tomorrow` : `${name} in ${Math.round(days)} days`;
            }
        }
        return '';
    }

    // ---- The scene ---------------------------------------------------------------------

    ids() {
        const ids = this.config.scale === 'inner' ? ORRERY_PLANETS.slice(0, 4) : ORRERY_PLANETS.slice(0, 8);
        if (this.config.showPluto && this.config.scale !== 'inner') ids.push('pluto');
        return ids;
    }

    // The radial scale, AU → plane units (1 is the outermost orbit's edge).
    // Directions are untouched.
    get scaleSpec() {
        const pluto = this.config.showPluto;
        const hub = this.config.look === 'brass' ? 0.17 : 0;
        if (this.config.scale === 'inner') return { max: 3.35, power: 0.6, hub };
        return { max: pluto ? 49.4 : 30.4, power: this.config.scale === 'true' ? 1 : 0.45, hub };
    }

    radial(r) {
        const s = this.spec;
        return s.hub + (1 - s.hub) * Math.pow(Math.min(r, s.max * 1.5) / s.max, s.power);
    }

    toPlane(v, out = {}) {
        const r = Math.hypot(v.x, v.y, v.z) || 1e-9, f = this.radial(r) / r;
        out.x = v.x * f; out.y = v.y * f; out.z = v.z * f;
        return out;
    }

    // A planet's drawn radius in CSS px: far larger than life, but in order.
    planetPx(id) {
        const p = OrreryMath.PLANETS[id];
        const scale = this.config.scale === 'inner' ? 1.5 : this.config.scale === 'true' ? 0.85 : 1;
        return 4.6 * this.k * this.config.planetSize * scale * Math.pow(p.radius / 2440, 0.38) * (this.config.look === 'chart' ? 0.8 : 1);
    }

    sunPx() {
        const s = this.config.scale === 'true' ? 7 : this.config.scale === 'inner' ? 13 : 11;
        return s * this.k * Math.sqrt(this.config.planetSize) * (this.config.look === 'brass' ? 1.3 : 1);
    }

    compute(date) {
        this.spec = this.scaleSpec;
        const ms = date.getTime(), T = OrreryMath.centuries(date);
        const bodies = [];
        const earth = OrreryMath.heliocentric('earth', date);
        for (const id of this.ids()) {
            const p = OrreryMath.PLANETS[id];
            const helio = id === 'earth' ? earth : OrreryMath.heliocentric(id, date);
            const b = { id, name: p.name, colour: p.colour, helio, plane: this.toPlane(helio), px: this.planetPx(id), scr: {} };
            b.dist = Math.hypot(helio.x, helio.y, helio.z);
            b.lon = Math.atan2(helio.y, helio.x) * 180 / Math.PI;
            if (id !== 'earth') {
                b.geo = OrreryMath.geocentric(id, date);
                b.retro = OrreryMath.isRetrograde(id, date);
            }
            if (this.config.showTrails) b.trail = this.trail(id, ms);
            bodies.push(b);
        }
        const moon = OrreryMath.moon(date);
        const scene = { date, ms, T, bodies, earth, moon, jovians: OrreryMath.galilean(date), approximate: !OrreryMath.inRange(date) };
        scene.sunLon = (Math.atan2(-earth.y, -earth.x) * 180 / Math.PI + 360) % 360;
        this.scene = scene;
        if (!this.orbits || Math.abs(ms - this.orbits.ms) > 365.25 * ORRERY_DAY || this.orbits.key !== this.orbitKey()) this.makeOrbits(date);
        return scene;
    }

    orbitKey() { return `${this.ids().join()}|${this.config.scale}|${this.config.look}`; }

    makeOrbits(date) {
        const paths = {};
        for (const id of this.ids()) {
            const n = id === 'mercury' || id === 'pluto' ? 180 : 140;
            paths[id] = OrreryMath.orbitPath(id, date, n).map(p => this.toPlane(p));
        }
        this.orbits = { ms: date.getTime(), key: this.orbitKey(), paths };
        this.planeKey = null;
    }

    // The planet's path over the last trailLength of its orbit, newest first.
    trail(id, ms) {
        const n = 36, span = OrreryMath.PLANETS[id].period * this.config.trailLength * ORRERY_DAY;
        const points = [];
        for (let i = 0; i <= n; i++) points.push(this.toPlane(OrreryMath.heliocentric(id, new Date(ms - span * i / n))));
        return points;
    }

    // ---- The belt ---------------------------------------------------------------------

    // A seeded pool: main-belt rocks between 2.1 and 3.3 AU, with the
    // Kirkwood gaps empty, each at Kepler's rate; and Jupiter's Trojans,
    // librating round the points 60° ahead of and behind it.
    makeBelt() {
        const rand = OrreryArt.random(1801), n = 1500, trojans = 340;
        const gaps = [[2.5, 0.035], [2.82, 0.025], [2.958, 0.02], [3.27, 0.03]];
        this.belt = { n: n + trojans, main: n, a: new Float32Array(n + trojans), e: new Float32Array(n + trojans), peri: new Float32Array(n + trojans),
            phase: new Float32Array(n + trojans), inc: new Float32Array(n + trojans), node: new Float32Array(n + trojans), b: new Float32Array(n + trojans) };
        const B = this.belt;
        for (let i = 0; i < B.n; i++) {
            let a;
            if (i < n) {
                do { a = 2.1 + 1.2 * (rand() * 0.6 + rand() * 0.4) ** 1.1; } while (gaps.some(([g, w]) => Math.abs(a - g) < w));
            } else a = 5.2 + (rand() - 0.5) * 0.25;
            B.a[i] = a;
            B.e[i] = rand() * 0.14;
            B.peri[i] = rand() * Math.PI * 2;
            B.phase[i] = i < n ? rand() * Math.PI * 2 : (rand() < 0.55 ? 1 : -1) * Math.PI / 3;   // the Trojans' side
            B.inc[i] = (rand() - 0.5) * 0.3;
            B.node[i] = rand() * Math.PI * 2;
            B.b[i] = 0.3 + rand() * 0.7;
        }
        // Libration: amplitude (radians) and phase, for the Trojans.
        B.lib = Float32Array.from({ length: trojans }, () => 0.05 + rand() * 0.35);
        B.libPhase = Float32Array.from({ length: trojans }, () => rand() * Math.PI * 2);
        this.beltXYZ = new Float32Array(B.n * 3);
    }

    beltTarget() { return this.config.showBelt ? Math.round(this.belt.n * this.density) : 0; }

    // Belt positions in the plane at a date, for the first `count` rocks.
    beltAt(ms, count) {
        const B = this.belt, out = this.beltXYZ, days = (ms - Date.UTC(2000, 0, 1, 12)) / ORRERY_DAY;
        const jupiter = this.scene.bodies.find(b => b.id === 'jupiter');
        const jLon = jupiter ? Math.atan2(jupiter.helio.y, jupiter.helio.x) : (34.4 + 0.0831 * days) * Math.PI / 180;
        const visible = this.config.scale !== 'inner';
        for (let i = 0; i < count; i++) {
            let theta;
            const a = B.a[i];
            if (i < B.main) theta = B.phase[i] + days * 2 * Math.PI / (365.25 * a ** 1.5);
            else {
                if (!visible) { out[i * 3] = NaN; continue; }
                const j = i - B.main;
                theta = jLon + B.phase[i] + B.lib[j] * Math.sin(days * 2 * Math.PI / (150 * 365.25) + B.libPhase[j]) + (B.b[i] - 0.65) * 0.5;
            }
            const r = a * (1 - B.e[i] * Math.cos(theta - B.peri[i]));
            const z = r * B.inc[i] * Math.sin(theta - B.node[i]);
            const f = this.radial(r) / r;
            out[i * 3] = r * Math.cos(theta) * f;
            out[i * 3 + 1] = r * Math.sin(theta) * f;
            out[i * 3 + 2] = z * f;
        }
        return out;
    }

    // ---- The camera ---------------------------------------------------------------------

    get azimuth() { return this.camera.az + (this.scroll - 0.5) * 30; }

    // Plane units → CSS px: out.x, out.y, out.d (depth, larger is farther),
    // out.k (perspective scale).
    project(x, y, z, out) {
        if (!this.tilted) {
            out.x = this.cx + x * this.R;
            out.y = this.cy - y * this.R;
            out.d = -z;
            out.k = 1;
            return out;
        }
        const a = this.azimuth * Math.PI / 180, e = this.camera.el * Math.PI / 180, D = 3.6;
        const ca = Math.cos(a), sa = Math.sin(a), ce = Math.cos(e), se = Math.sin(e);
        const x1 = x * ca - y * sa, y1 = x * sa + y * ca;
        const zc = D + y1 * ce - z * se;
        const k = D / Math.max(0.2, zc);
        out.x = this.cx + this.R * x1 * k;
        out.y = this.cy - this.R * (y1 * se + z * ce) * k;
        out.d = zc;
        out.k = k;
        return out;
    }

    // A small flat thing lying in the plane at (x, y, z): the local affine map
    // from plane units to screen px there, as [a, b, c, d, e, f] for
    // setTransform (before the device ratio).
    planeAffine(x, y, z) {
        const o = this.project(x, y, z, {}), u = this.project(x + 0.01, y, z, {}), v = this.project(x, y + 0.01, z, {});
        return [(u.x - o.x) / 0.01, (u.y - o.y) / 0.01, (v.x - o.x) / 0.01, (v.y - o.y) / 0.01, o.x, o.y];
    }

    cameraKey() {
        return this.tilted ? `t|${this.azimuth.toFixed(3)}|${this.camera.el.toFixed(3)}|${this.R.toFixed(2)}` : `top|${this.R.toFixed(2)}`;
    }

    dragTo(x, y) {
        if (!this.drag) return;
        const dx = x - this.drag.x, dy = y - this.drag.y;
        this.drag = { x, y };
        if (!this.tilted) return;
        this.turned = true;
        this.camera.az -= dx * 0.35;
        this.camera.el = OrreryArt.clamp(this.camera.el + dy * 0.25, 8, 90);
        this.fit();
        this.wake();
    }

    projectScene(scene) {
        const sun = this.project(0, 0, 0, {});
        sun.px = this.sunPx() * sun.k;
        scene.sun = sun;
        const showMoons = this.config.showMoons;
        scene.extras = [];
        for (const b of scene.bodies) {
            const s = this.project(b.plane.x, b.plane.y, b.plane.z, b.scr);
            b.r = b.px * s.k;
            b.light = Math.atan2(sun.y - s.y, sun.x - s.x);
            if (!showMoons) continue;
            if (b.id === 'earth') {
                const m = scene.moon, r = Math.PI / 180;
                const off = (b.px * 2.3 + 5 * this.k) / this.R;
                const dir = { x: Math.cos(m.lat * r) * Math.cos(m.lon * r), y: Math.cos(m.lat * r) * Math.sin(m.lon * r), z: Math.sin(m.lat * r) };
                const p = this.project(b.plane.x + dir.x * off, b.plane.y + dir.y * off, b.plane.z + dir.z * off, {});
                scene.extras.push({ id: 'moon', name: 'The Moon', parent: b, scr: p, r: Math.max(1.4, b.px * 0.36 * p.k), colour: '#cfcac0', orbit: off, light: Math.atan2(sun.y - p.y, sun.x - p.x) });
            } else if (b.id === 'jupiter') {
                for (const j of scene.jovians) {
                    const off = b.px * (1.25 + 0.115 * j.distance) / this.R, a = j.angle * Math.PI / 180;
                    const p = this.project(b.plane.x + Math.cos(a) * off, b.plane.y + Math.sin(a) * off, b.plane.z, {});
                    scene.extras.push({ id: j.name.toLowerCase(), name: j.name, parent: b, scr: p, r: Math.max(1, 1.1 * this.k * p.k * this.config.planetSize ** 0.5), colour: '#e8dcc4', orbit: off, small: true });
                }
            }
        }
        this.positions = {
            sun: { x: sun.x, y: sun.y, r: sun.px },
            bodies: Object.fromEntries([...scene.bodies, ...scene.extras].map(b => [b.id, { x: b.scr.x, y: b.scr.y, r: b.r, d: b.scr.d }])),
        };
    }

    // The last frame's projected positions, in CSS px, for tests.
    debugPositions() {
        return { ...this.positions, ring: this.ringBox(), date: this.sim, readout: this.readoutLines, card: this.cardBox };
    }

    // The outer ring's bounding box on screen, in CSS px.
    ringBox() {
        const ring = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
        const p = {};
        for (let i = 0; i < 72; i++) {
            const a = i / 72 * Math.PI * 2;
            this.project(Math.cos(a) * this.ringOut, Math.sin(a) * this.ringOut, 0, p);
            ring.x0 = Math.min(ring.x0, p.x); ring.x1 = Math.max(ring.x1, p.x); ring.y0 = Math.min(ring.y0, p.y); ring.y1 = Math.max(ring.y1, p.y);
        }
        return ring;
    }

    // ---- Words ---------------------------------------------------------------------------

    static phaseName(phase) {
        const names = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
        return names[Math.round(phase * 8) % 8];
    }

    // Where a geocentric longitude is among the stars, and in the chosen
    // ring's terms: "Gemini", or "Gemini (sign: Cancer)".
    sky(lon, T) {
        const star = OrreryMath.zodiacAt(lon, 'constellations').name;
        if (this.config.zodiac !== 'signs') return star;
        const sign = OrreryMath.zodiacAt(lon + 1.396971 * T, 'signs').name;
        return sign === star ? `${star} (the sign too)` : `${star} (sign: ${sign})`;
    }

    readout(scene) {
        const lines = [];
        const date = this.config.speed === 'live' ? this.formatDate(scene.ms, true) : this.formatDate(scene.ms);
        const parts = [this.speedLabel, date, this.season(scene.ms)];
        if (scene.approximate) parts.push('approximate');
        lines.push(parts.filter(Boolean).join(' · '));
        const moon = scene.moon;
        lines.push({ moon: moon.phase, text: `${OrreryAnimationManager.phaseName(moon.phase)}, ${Math.round(moon.illum * 100)}% lit, in ${OrreryMath.zodiacAt(moon.lon, 'constellations').name}` });
        const retro = scene.bodies.filter(b => b.retro).map(b => b.name);
        lines.push(retro.length ? `Retrograde: ${retro.join(', ')}` : 'No planet retrograde');
        this.readoutLines = lines.map(l => typeof l === 'string' ? l : l.text);
        return lines;
    }

    // The card for a tapped body.
    card(id, scene) {
        const lm = au => `${(au * ORRERY_LIGHT_MINUTES).toFixed(au < 3 ? 1 : 0)} light-minutes`;
        const au = d => `${d.toFixed(d < 10 ? 2 : 1)} AU`;
        const lines = [];
        let title;
        if (id === 'sun') {
            const d = Math.hypot(scene.earth.x, scene.earth.y, scene.earth.z);
            title = '☉ The Sun';
            lines.push(`${au(d)} from the Earth · ${lm(d)}`);
            lines.push(`In our sky: ${this.sky(scene.sunLon, scene.T)}`);
        } else if (id === 'moon') {
            const m = scene.moon;
            title = '☾ The Moon';
            lines.push(`${OrreryAnimationManager.phaseName(m.phase)} · ${Math.round(m.illum * 100)}% lit`);
            lines.push(`${Math.round(m.dist).toLocaleString('en-US')} km from the Earth · ${(m.dist / 299792.458).toFixed(2)} light-seconds`);
            lines.push(`In our sky: ${this.sky(m.lon, scene.T)}`);
        } else {
            const b = scene.bodies.find(x => x.id === id) || scene.extras.find(x => x.id === id);
            if (!b) return null;
            if (b.parent) {
                const j = scene.jovians.find(x => x.name === b.name);
                title = `${b.name}, a moon of Jupiter`;
                lines.push(`Round Jupiter every ${j.period.toFixed(2)} days`);
                lines.push(`${Math.round(j.distance * 71492).toLocaleString('en-US')} km out`);
            } else {
                const p = OrreryMath.PLANETS[id];
                title = `${ORRERY_GLYPHS[id]} ${b.name}${p.dwarf ? ' (a dwarf planet)' : ''}`;
                lines.push(`${au(b.dist)} from the Sun · ${lm(b.dist)}`);
                if (id === 'earth') {
                    lines.push('You are here');
                    lines.push(`The Sun is in ${this.sky(scene.sunLon, scene.T)}`);
                } else {
                    lines.push(`${au(b.geo.dist)} from the Earth · ${lm(b.geo.dist)}`);
                    const e = b.geo.elongation, side = Math.abs(e) < 15 ? 'too near the Sun to see' : e > 0 ? 'in the evening sky' : 'in the morning sky';
                    lines.push(`In our sky: ${this.sky(b.geo.lon, scene.T)}`);
                    lines.push(`${Math.abs(e).toFixed(0)}° ${e >= 0 ? 'east' : 'west'} of the Sun, ${side}`);
                    lines.push(b.retro ? 'Retrograde: drifting west against the stars' : 'Moving east against the stars');
                }
                const years = p.period / 365.25;
                lines.push(`A year of ${years < 2 ? `${Math.round(p.period)} days` : `${years.toFixed(years < 20 ? 1 : 0)} years`}`);
            }
        }
        if (scene.approximate) lines.push('Approximate: outside 1800–2050');
        return { title, lines };
    }

    // ---- Input ----------------------------------------------------------------------------

    tap(x, y) {
        const scene = this.scene;
        if (!scene?.sun) return;
        let best = null, bestD = Infinity;
        const consider = (id, p, r) => {
            const d = Math.hypot(p.x - x, p.y - y);
            if (d <= Math.max(r + 6, 16 * this.k) && d < bestD) { best = id; bestD = d; }
        };
        // Jupiter's moons first, on a tight radius, since Jupiter's own
        // reaches over them; then the planets, the Moon and the Sun.
        for (const b of scene.extras) if (b.small) { const d = Math.hypot(b.scr.x - x, b.scr.y - y); if (d <= b.r + 3 && d < bestD) { best = b.id; bestD = d; } }
        if (!best) {
            for (const b of scene.bodies) consider(b.id, b.scr, b.r);
            for (const b of scene.extras) if (b.id === 'moon') consider(b.id, b.scr, b.r + 2);
        }
        if (!best) consider('sun', scene.sun, scene.sun.px);
        this.selected = best === this.selected ? null : best;
        this.wake();
    }

    // ---- Frames ----------------------------------------------------------------------------

    crossfade(seconds = 0.7) {
        if (!this.canvas || this.host.reducedMotion || this.host.params.thumb) return;
        if (!this.fadeCanvas || this.fadeCanvas.width !== this.canvas.width || this.fadeCanvas.height !== this.canvas.height) {
            this.fadeCanvas = OrreryArt.canvas(this.canvas.width, this.canvas.height);
        }
        const g = this.fadeCanvas.getContext('2d');
        g.clearRect(0, 0, this.fadeCanvas.width, this.fadeCanvas.height);
        g.drawImage(this.canvas, 0, 0);
        this.fade = { t: 0, seconds };
    }

    // A cached layer by name, rebuilt when its key changes.
    layer(name, key, paint) {
        const have = this.layers[name];
        if (have && have.key === key) return have.canvas;
        const canvas = have?.canvas && have.canvas.width === this.canvas.width && have.canvas.height === this.canvas.height
            ? have.canvas : OrreryArt.canvas(this.canvas.width, this.canvas.height);
        const g = canvas.getContext('2d');
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, canvas.width, canvas.height);
        paint(g);
        this.layers[name] = { key, canvas };
        return canvas;
    }

    // A baked sprite by key (device px), made once.
    sprite(key, make) {
        let s = this.sprites.get(key);
        if (!s) {
            if (this.sprites.size > 160) this.sprites.clear();
            s = make();
            this.sprites.set(key, s);
        }
        return s;
    }

    frame(now) {
        if (!this.running) return;
        const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
        this.last = now;
        const rate = this.rate;
        let moving = false;
        if (rate) {
            const next = this.clampTime(this.sim + rate * dt);
            if (next !== this.sim) moving = true;
            else if (!this.atEnd) this.host.toast(`The tables end here: ${this.formatDate(this.sim)}`);
            this.atEnd = next === this.sim;
            this.sim = next;
        } else {
            this.atEnd = false;
            this.sim = this.clampTime(this.host.now().getTime());
        }
        const minute = Math.floor(this.sim / 60000);
        const drifting = this.tilted && this.config.drift && !this.drag && !this.host.reducedMotion && !this.host.params.thumb;
        if (drifting) this.camera.az += dt * 1.2;
        // Effects and the belt fade in and out with the tier.
        let easing = false;
        for (const name of ['glow', 'belt']) {
            const target = this.wants(name) ? 1 : 0;
            if (this.fx[name] !== target) {
                this.fx[name] = target > this.fx[name] ? Math.min(1, this.fx[name] + dt / 1.5) : Math.max(0, this.fx[name] - dt / 1.5);
                easing = true;
            }
        }
        const beltTarget = this.beltTarget();
        if (this.beltShown !== beltTarget) {
            const step = this.belt.n * dt / 2;
            this.beltShown = beltTarget > this.beltShown ? Math.min(beltTarget, this.beltShown + step) : Math.max(beltTarget, this.beltShown - step);
            easing = true;
        }
        if (this.fade) this.fade.t += dt / this.fade.seconds;
        if (moving || this.dirty || minute !== this.minute || !this.scene) {
            this.minute = minute;
            this.compute(this.date());
        }
        this.draw(now / 1000);
        this.dirty = false;
        if (this.fade && this.fade.t >= 1) this.fade = null;
        const busy = moving || drifting || !!this.drag || !!this.fade || easing;
        if (!busy) {
            // Live and still: the shimmer at about four frames a second (not
            // on battery), or nothing until the next minute.
            const battery = (this.host.power?.reasons || []).some(r => r.includes('battery'));
            const shimmer = this.config.look === 'space' && !this.host.reducedMotion && !this.host.params.thumb && !battery && (this.fx.glow > 0 || (this.fx.belt > 0 && this.beltShown > 0));
            const toMinute = 60000 - (this.host.now().getTime() % 60000) + 20;
            this.host.idleUntil(shimmer ? 250 : toMinute);
        }
        this.frameId = requestAnimationFrame(t => this.frame(t));
    }

    draw(t) {
        const g = this.ctx, d = this.dpr, scene = this.scene, look = this.look;
        this.projectScene(scene);
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
        g.drawImage(this.layer('background', `${this.config.look}|${this.config.chartPalette}|${this.density}|${this.base}`, lg => look.background(this, lg)), 0, 0);
        // The plane: orbits, the zodiac ring, a quiet belt; cached while the
        // camera is still.
        const camera = this.cameraKey();
        const still = !this.drag && !(this.tilted && this.config.drift && !this.host.reducedMotion);
        const planeKey = `${camera}|${this.orbits.ms}|${this.orbitKey()}|${this.config.showOrbits}|${this.config.showZodiac}|${this.config.zodiac}|${this.config.chartPalette}|${Math.floor(scene.T * 20)}|${this.fx.belt > 0}|${this.config.showBelt}|${this.selected}`;
        if (still) g.drawImage(this.layer('plane', planeKey, lg => { lg.setTransform(d, 0, 0, d, 0, 0); look.plane(this, lg, scene); }), 0, 0);
        else { g.setTransform(d, 0, 0, d, 0, 0); look.plane(this, g, scene); }
        g.setTransform(d, 0, 0, d, 0, 0);
        if (this.config.showBelt && this.fx.belt > 0 && this.beltShown >= 1) {
            const count = Math.floor(this.beltShown);
            look.belt(this, g, this.beltAt(scene.ms, count), count, t);
        }
        if (this.config.showTrails) look.trails?.(this, g, scene);
        look.bodies(this, g, scene, t);
        look.overlay?.(this, g, scene);
        if (this.selected) this.drawCard(g, scene);
        else this.cardBox = null;
        if (this.config.showInfo) this.drawReadout(g, scene);
        else this.readout(scene);
        if (this.fade) {
            g.setTransform(1, 0, 0, 1, 0, 0);
            g.globalAlpha = 1 - OrreryArt.smooth(0, 1, this.fade.t);
            g.drawImage(this.fadeCanvas, 0, 0);
            g.globalAlpha = 1;
        }
    }

    // ---- Readout and card -----------------------------------------------------------------

    // A small drawn Moon in its phase (lit fraction from `phase`).
    moonIcon(g, x, y, r, phase, lit, dark) {
        g.save();
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fillStyle = dark;
        g.fill();
        g.clip();
        const waxing = phase < 0.5, c = Math.cos(phase * Math.PI * 2);
        g.beginPath();
        g.arc(x, y, r, -Math.PI / 2, Math.PI / 2, !waxing);   // the lit half: right while waxing
        g.ellipse(x, y, Math.abs(c) * r, r, 0, Math.PI / 2, -Math.PI / 2, (c > 0) === waxing);
        g.fillStyle = lit;
        g.fill();
        g.restore();
    }

    drawReadout(g, scene) {
        const th = this.look.theme(this), k = this.k, lines = this.readout(scene);
        const x = this.safe.left + 16 * k, size = 12.5 * k;
        let y = this.safe.top + 16 * k + size;
        g.textAlign = 'left';
        g.textBaseline = 'alphabetic';
        lines.forEach((line, i) => {
            g.font = `${i === 0 ? 600 : 400} ${i === 0 ? size * 1.08 : size}px ${th.font}`;
            g.fillStyle = i === 0 ? th.ink : th.dim;
            if (th.halo) { g.lineWidth = 3 * k; g.strokeStyle = th.halo; g.lineJoin = 'round'; }
            if (typeof line === 'string') {
                if (th.halo) g.strokeText(line, x, y);
                g.fillText(line, x, y);
            } else {
                this.moonIcon(g, x + size * 0.45, y - size * 0.34, size * 0.45, line.moon, th.moonLit, th.moonDark);
                if (th.halo) g.strokeText(line.text, x + size * 1.3, y);
                g.fillStyle = th.dim;
                g.fillText(line.text, x + size * 1.3, y);
            }
            y += size * (i === 0 ? 1.65 : 1.45);
        });
    }

    drawCard(g, scene) {
        const info = this.card(this.selected, scene);
        const at = this.selected === 'sun' ? { x: scene.sun.x, y: scene.sun.y, r: scene.sun.px } : this.positions.bodies[this.selected];
        if (!info || !at) { this.selected = null; this.cardBox = null; return; }
        const th = this.look.theme(this), k = this.k, size = 12 * k, pad = 11 * k;
        g.font = `600 ${size * 1.25}px ${th.font}`;
        let w = g.measureText(info.title).width;
        g.font = `400 ${size}px ${th.font}`;
        for (const line of info.lines) w = Math.max(w, g.measureText(line).width);
        w += 2 * pad;
        const h = pad * 2 + size * 1.6 + info.lines.length * size * 1.42;
        const gap = at.r + 14 * k, s = this.safe;
        let x = at.x + gap, y = at.y - h / 2;
        if (x + w > s.right - 8) x = at.x - gap - w;
        x = OrreryArt.clamp(x, s.left + 8, s.right - 8 - w);
        y = OrreryArt.clamp(y, s.top + 8, s.bottom - 8 - h);
        // The selection ring.
        g.beginPath();
        g.arc(at.x, at.y, at.r + 5 * k, 0, Math.PI * 2);
        g.strokeStyle = th.accent;
        g.lineWidth = 1.4 * k;
        g.stroke();
        g.fillStyle = th.card;
        g.strokeStyle = th.cardEdge;
        g.lineWidth = 1;
        g.beginPath();
        g.roundRect(x, y, w, h, th.radius * k);
        g.fill();
        g.stroke();
        g.textAlign = 'left';
        g.textBaseline = 'alphabetic';
        g.font = `600 ${size * 1.25}px ${th.font}`;
        g.fillStyle = th.cardInk;
        g.fillText(info.title, x + pad, y + pad + size * 1.1);
        g.font = `400 ${size}px ${th.font}`;
        g.fillStyle = th.cardDim;
        info.lines.forEach((line, i) => g.fillText(line, x + pad, y + pad + size * 1.6 + (i + 0.95) * size * 1.42));
        this.cardBox = { x, y, w, h, title: info.title, lines: info.lines };
    }
}
