// World Clock (SPEC §10.3): your cities' times, three ways. The world as it
// is right now, day and night, with the real terminator and twilight, the
// sun and the moon overhead and the cities as labelled dots (the map,
// world-clock-map.js); a grid of analog faces, each dial that city's sky
// (world-clock-faces.js); or a split-flap departures board
// (world-clock-board.js). The maths, the land and the cities are
// world-clock-math.js, world-land.js and world-cities.js.
//
// Cost: every view draws from cached layers (land per resize and look, the
// night once a minute, the dials when their sky changes, the board's
// tiles per resize), once a second, idle in between. Only a recentring map,
// flipping flaps or a crossfade ask for more frames, and only until they
// settle. The slow rebuilds (the map's layers and its night) run outside
// the frames (prepare(), the minute timer), so Auto's governor never sees
// them. Everything that depends on the time reads host.now().

const WORLD_CLOCK_VIEWS = { map: '🗺️ The world, day and night', faces: '🕰️ Clock faces', board: '🚉 Departures board' };
const WORLD_CLOCK_LOOK_NAMES = { 'night-lights': '🌃 Night lights', atlas: '🧭 Atlas', blueprint: '📐 Blueprint', paper: '📜 Old paper' };
const WORLD_CLOCK_GREENWICH = { lat: 51.48, lon: 0 };
const WORLD_CLOCK_PACIFIC = 150;

class WorldClockAnimationManager {
    constructor(host) {
        this.host = host;
        this.config = WP.settings.load();
        this.quality = host.quality;
        this.locale = (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
        this.localZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        this.home = null;           // a tapped city: home for this session (null: Here)
        this.places = [];
        this.infos = [];
        this.bad = [];
        this.scroll = 0.5;          // Android's home-screen position
        this.layout = { view: this.config.view, bottom: 0 };
        this.formats = new Map();
        this.second = this.minute = -1;
        this.fade = null;
        this.running = false;
        this.views = { map: new WorldClockMap(this), faces: new WorldClockFaces(this), board: new WorldClockBoard(this) };
        this.resolve();
    }

    get view() { return this.views[this.config.view] || this.views.map; }
    fx(name) { return !!this.quality?.effects?.includes(name); }
    get density() { return this.quality?.density ?? 1; }

    // ---- Places --------------------------------------------------------------------

    // Where a zone is on the map: a listed city in it, else one named after
    // it, else its offset's longitude on the equator (located: false).
    locate(zone, date = this.host.now()) {
        const id = zone === 'local' ? this.localZone : zone;
        const city = WORLD_CITIES.find(c => c.zone === id)
            || WORLD_CITIES.find(c => c.name.replace(/ /g, '_') === id.split('/').pop());
        if (city) return { lat: city.lat, lon: city.lon, located: true };
        if (/^(UTC|Etc\/(UTC|UCT|GMT|Zulu)|GMT)$/i.test(id)) return { ...WORLD_CLOCK_GREENWICH, located: true };
        const offset = WP.clockface.offsetMinutes(date, id);
        return { lat: 0, lon: ((offset / 4 + 180) % 360 + 360) % 360 - 180, located: false };
    }

    // The settings' cities and custom zones, in the chosen order.
    resolve() {
        const now = this.host.now();
        const places = [];
        for (const id of this.config.cities) {
            if (id === 'local') places.push({ id, name: 'Here', zone: 'local', ...this.locate('local', now) });
            else if (id === 'utc') places.push({ id, name: 'UTC', zone: 'UTC', ...WORLD_CLOCK_GREENWICH, located: true });
            else {
                const city = WORLD_CITIES.find(c => c.id === id);
                if (city) places.push({ id, name: city.name, zone: city.zone, lat: city.lat, lon: city.lon, located: true });
            }
        }
        const { zones, bad } = WorldClockMath.parseCustom(this.config.custom);
        zones.forEach(({ label, zone }, i) => places.push({ id: `custom-${i}`, name: label, zone, custom: true, ...this.locate(zone, now) }));
        this.bad = bad;
        for (const p of places) p.offsetMinutes = WP.clockface.offsetMinutes(now, p.zone);
        this.places = WorldClockMath.order(places, this.config.sort);
        if (this.home && !this.places.some(p => p.id === this.home)) this.home = null;
    }

    homeId() {
        const id = this.home || 'local';
        return this.places.some(p => p.id === id) ? id : null;
    }

    homePlace() { return this.places.find(p => p.id === this.homeId()) || null; }

    // The map's centre longitude: a tapped home, else the setting.
    centerLon() {
        if (this.home) return this.homePlace()?.lon ?? 0;
        const c = this.config.center;
        if (c === 'greenwich') return 0;
        if (c === 'pacific') return WORLD_CLOCK_PACIFIC;
        if (c === 'local' || !c) return this.locate('local').lon;   // a listed city in the zone, else its offset's longitude
        return WORLD_CITIES.find(city => city.id === c)?.lon ?? 0;
    }

    centers() {
        return ['local', 'greenwich', 'pacific', ...this.config.cities.filter(id => id !== 'local' && id !== 'utc' && WORLD_CITIES.some(c => c.id === id))];
    }

    format(options) {
        const key = JSON.stringify(options);
        if (!this.formats.has(key)) {
            let f;
            try { f = new Intl.DateTimeFormat(this.locale, options); } catch { f = new Intl.DateTimeFormat('en-US', options); }
            this.formats.set(key, f);
        }
        return this.formats.get(key);
    }

    // Each place's time, sky and words, once a second.
    tick(now) {
        const hour12 = this.config.hour12 === '12' ? true : this.config.hour12 === '24' ? false : undefined;
        const home = this.homePlace();
        const local = home ? home.zone : 'local';
        const sun = this.sun || WorldClockMath.subsolar(now);
        return this.places.map(place => {
            const t = WorldClockMath.zoneTime(now, place.zone, this.locale, { hour12, seconds: this.config.seconds, local });
            const timeZone = place.zone === 'local' ? undefined : t.valid ? place.zone : 'UTC';
            const alt = WorldClockMath.sunAltitude(place.lat, place.lon, now, sun);
            const dayDelta = t.dayDelta;
            return {
                id: place.id, name: place.name, place, time: t, text: t.text, split: WorldClockArt.splitTime(t.text),
                alt, phase: WorldClockArt.phase(alt), dayDelta,
                weekday: this.format({ weekday: 'short', timeZone }).format(now),
                date: this.format({ weekday: 'short', day: 'numeric', month: 'short', timeZone }).format(now),
                dayWord: dayDelta > 0 ? 'Tomorrow' : dayDelta < 0 ? 'Yesterday' : 'Today',
                offset: WorldClockMath.offsetLabel(t.offsetMinutes),
                home: place.id === (home && home.id),
            };
        });
    }

    // ---- Lifecycle ---------------------------------------------------------------------

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
        this.say();
        this.last = performance.now();
        this.frameId = requestAnimationFrame(t => this.frame(t));
        this.everyMinute();
    }

    stop() {
        this.running = false;
        cancelAnimationFrame(this.frameId);
        clearTimeout(this.minuteTimer);
        window.removeEventListener('resize', this.onResize);
        this.stopGestures?.();
        this.stopGestures = null;
        this.canvas?.remove();
        this.canvas = this.ctx = null;
    }

    listen() {
        this.stopGestures?.();
        this.stopGestures = this.config.touch && !this.host.params.thumb
            ? this.host.gestures({ tap: (x, y) => this.tap(x, y) }) : null;
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
        this.safe = { top: ins.top, left: ins.left, right: this.W - ins.right, bottom: this.H - ins.bottom };
        // Text and markers scale with the screen, and the Size setting.
        this.k = WorldClockArt.clamp(Math.min(this.W, this.H) / 800, 0.78, 2.2) * this.config.scale;
        this.fade = this.fadeCanvas = null;
        for (const view of Object.values(this.views)) view.resize();
        this.prepare();
        this.dirty = true;
    }

    // The slow work (the map's layers, its night) done here, outside the
    // frames: a frame a second that took 100 ms once a minute would read to
    // Auto's governor as a wallpaper too heavy for its tier.
    prepare(date = this.host.now()) {
        if (!this.running || !this.canvas) return;
        if (Math.floor(date.getTime() / 60000) !== this.minute) this.newMinute(date);
        this.view.prepare?.(date);
    }

    // The minute's work (the sun, the moon, the order, the night) on a timer
    // just past the minute; the frame that follows only draws.
    everyMinute() {
        clearTimeout(this.minuteTimer);
        if (!this.running) return;
        this.minuteTimer = setTimeout(() => {
            this.prepare();
            this.wake();
            this.everyMinute();
        }, 60000 - (this.host.now().getTime() % 60000) + 5);
    }

    newMinute(date) {
        this.minute = Math.floor(date.getTime() / 60000);
        this.sun = WorldClockMath.subsolar(date);
        this.moon = WorldClockMath.sublunar(date);
        this.resolve();   // a DST change moves an offset, and the order by offset with it
        for (const view of Object.values(this.views)) view.minute?.(date);
        this.dirty = true;
    }

    applySettings(config) {
        const old = this.config;
        this.config = config;
        const changed = key => JSON.stringify(old[key]) !== JSON.stringify(config[key]);
        if (changed('touch')) this.listen();
        if (changed('center')) this.home = null;   // the map eases over to the new centre
        if (changed('cities') || changed('custom') || changed('sort')) { this.resolve(); this.say(); }
        if (changed('view') || changed('mapStyle') || changed('faceStyle')) this.crossfade();
        if (changed('view') && this.views[old.view] !== this.view) this.views[old.view]?.release?.();   // its picture is in the crossfade now
        if (changed('scale')) { this.resize(); return this.wake(); }
        for (const view of Object.values(this.views)) view.configure?.(old, config);
        this.prepare();
        this.wake();
    }

    onQuality(quality) {
        const before = this.quality;
        this.quality = quality;
        const effects = q => (q?.effects || []).join();
        if (effects(before) !== effects(quality) || before?.density !== quality.density) {
            this.crossfade(1.5);
            for (const view of Object.values(this.views)) view.onQuality?.();
            this.prepare();
            this.wake();
        }
    }

    onScroll(x) {
        this.scroll = WorldClockArt.clamp(x, 0, 1);
        this.wake();
    }

    // Hidden: no minute timer either (the first frame back catches up).
    onPause() { clearTimeout(this.minuteTimer); }

    onResume() { this.everyMinute(); this.wake(); }

    wake() {
        this.dirty = true;
        if (this.running) this.host.idleUntil(0);
    }

    // The panel's line under the custom zones.
    say() {
        const custom = this.places.filter(p => p.custom);
        let text = '';
        if (this.bad.length) text = `⚠️ Not understood: ${this.bad.map(b => `“${b.text}” (${b.why})`).join('; ')}`;
        else if (custom.length) text = `✓ ${custom.map(p => `${p.name}, ${WorldClockMath.offsetLabel(p.offsetMinutes)}`).join(' · ')}`;
        this.status = text;
        this.host.panel({ status: { custom: text } });
    }

    // ---- Input and keys ---------------------------------------------------------------

    tap(x, y) {
        const id = this.view.hit?.(x, y);
        if (!id) return;
        // Tapping the home again goes back to Here and the map's own centre.
        this.home = id === this.homeId() && this.home ? null : id === 'local' ? null : id;
        this.dirty = true;
        this.wake();
    }

    change(values) {
        const next = { ...this.config, ...values };
        WP.settings.save(next);
        this.applySettings(next);
    }

    nextView() {
        const views = Object.keys(WORLD_CLOCK_VIEWS);
        const view = views[(views.indexOf(this.config.view) + 1) % views.length];
        this.change({ view });
        return WORLD_CLOCK_VIEWS[view];
    }

    nextCenter() {
        const list = this.centers();
        const center = list[(list.indexOf(this.config.center) + 1) % list.length];
        this.home = null;
        if (this.config.view !== 'map') this.change({ center, view: 'map' });
        else this.change({ center });
        const name = center === 'local' ? 'Here' : center === 'greenwich' ? 'Greenwich' : center === 'pacific' ? 'the Pacific' : WORLD_CITIES.find(c => c.id === center)?.name;
        return `Centred on ${name}`;
    }

    nextStyle() {
        const looks = Object.keys(WORLD_CLOCK_LOOK_NAMES);
        const mapStyle = looks[(looks.indexOf(this.config.mapStyle) + 1) % looks.length];
        if (this.config.view !== 'map') this.change({ mapStyle, view: 'map' });
        else this.change({ mapStyle });
        return WORLD_CLOCK_LOOK_NAMES[mapStyle];
    }

    // ---- Frames -------------------------------------------------------------------------

    // The picture on screen now fades out over `seconds` as the new one
    // draws under it: a view or look switch, or effects coming and going.
    crossfade(seconds = 0.7) {
        if (!this.canvas || this.host.reducedMotion || this.host.params.thumb) return;
        if (!this.fadeCanvas || this.fadeCanvas.width !== this.canvas.width || this.fadeCanvas.height !== this.canvas.height) {
            this.fadeCanvas = WorldClockArt.canvas(this.canvas.width, this.canvas.height);
        }
        const g = this.fadeCanvas.getContext('2d');
        g.clearRect(0, 0, this.fadeCanvas.width, this.fadeCanvas.height);
        g.drawImage(this.canvas, 0, 0);
        this.fade = { t: 0, seconds };
    }

    frame(now) {
        if (!this.running) return;
        const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
        this.last = now;
        const date = this.host.now(), ms = date.getTime();
        const minute = Math.floor(ms / 60000), second = Math.floor(ms / 1000);
        // The minute timer does the minute's work; a frame only steps in
        // when it's well overdue (a frame just past the minute draws the
        // last minute's night, a second at most).
        if (minute !== this.minute && (this.minute < 0 || ms - minute * 60000 > 2000)) this.newMinute(date);
        if (second !== this.second || this.dirty) {
            this.second = second;
            this.infos = this.tick(date);
            this.dirty = true;
        }
        const busy = this.view.update?.(dt, date) || false;
        if (this.fade) this.fade.t += dt / this.fade.seconds;
        if (this.dirty || busy || this.fade) this.draw(date);
        this.dirty = false;
        if (this.fade && this.fade.t >= 1) this.fade = this.fadeCanvas = null;
        // Calm: nothing moving, so no frames until the next second.
        if (!busy && !this.fade) this.host.idleUntil(1000 - (this.host.now().getTime() % 1000) + 8);
        this.frameId = requestAnimationFrame(t => this.frame(t));
    }

    draw(date) {
        const g = this.ctx, d = this.dpr;
        g.setTransform(d, 0, 0, d, 0, 0);
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
        this.layout = { view: this.config.view, bottom: 0, ...this.view.draw(g, date) };
        if (this.fade) {
            g.setTransform(1, 0, 0, 1, 0, 0);
            const t = WorldClockArt.smooth(0, 1, this.fade.t);
            g.globalAlpha = 1 - t;
            g.drawImage(this.fadeCanvas, 0, 0);
            g.globalAlpha = 1;
        }
    }
}
