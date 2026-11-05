// Weather (SPEC §10.2): the forecast for your place from Open-Meteo, over a
// sky that is the weather outside. Three views: day cards, a 24-hour
// ribbon, and right now, large. Every day and hour has a little looping
// scene (weather-scenes.js); the data rules are weather-data.js.
//
// States, never blank: no place → a made-up sample, labelled; the first
// fetch → the sample, dimmed, "Getting the forecast…"; offline with a
// cache → the cache, "updated 3 h ago · offline"; offline with none → the
// sample, "Couldn't reach Open-Meteo".
//
// Cost: the sky is a small cached gradient, scaled up, crossfading when it
// changes. The forecast (cards, text, curves) is one cached layer, rebuilt
// once a minute or when something changes; per frame only the scenes and
// the ambient weather move, at up to 20 fps (12 with only clouds drifting
// outside, 10 when only the scenes move; host.idleUntil between), and a
// still picture once a minute under reduced motion.
//
// Clocks: the sky, the hour and the place's day read host.now() (so ?date=
// tests them); when to fetch, the "updated 3 h ago" line and the minute
// tick that moves it read Date.now(), since they're about real network
// time and fetchedAt is real time. The forecast is
// always fetched in metric and converted for display, so switching units
// needs no new request; it's cached in host.storage with its place.

const WEATHER_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const WEATHER_INK = '#f4f8ff';
const WEATHER_DIM = 'rgba(226,236,252,0.72)';
const WEATHER_MIN = 60000, WEATHER_HOUR = 3600000;
const WEATHER_VIEWS = { days: '🗓️ Days', hours: '🕒 Next 24 hours', now: '🌡️ Right now' };
const WEATHER_FORECAST_DAYS = 10;   // the Days slider's maximum: one request covers every setting

class WeatherAnimationManager {
    constructor(host) {
        this.host = host;
        this.config = WP.settings.load();
        this.density = host.quality.density;
        this.place = null;
        this.forecast = null;
        this.hourTimes = [];
        this.state = 'sample';      // 'sample', 'loading', 'cache', 'live', 'offline', 'error'
        this.error = '';
        this.fetching = null;       // the AbortController of a request in flight
        this.retryAt = 0;
        this.manualAt = -Infinity;
        this.selected = null;       // a tapped day, shown hour by hour: { date }
        this.ambient = new WeatherScenes.Ambient();
        this.layout = { hits: [], box: null };
        this.scenes = [];
        this.banner = '';
        this.status = '';
        this.sky = null;
        this.skyPrev = null;
        this.skyFade = 1;
        this.still = null;        // nothing moving in the sky: it's painted with the sky's layer
        this.skyState = { phase: 'day', t: 0.5 };
        this.minute = -1;
        this.t = 0;
        this.last = 0;
        this.running = false;
    }

    async init() {
        this.place = await this.host.location();
        const saved = this.host.storage.get('forecast');
        const mine = saved && this.place && saved.lat === this.place.lat && saved.lon === this.place.lon && saved.units === 'metric';
        if (mine && this.valid(saved.forecast) && this.current(saved.forecast)) {
            this.use(saved.forecast);
            this.state = 'cache';
        } else {
            this.use(this.sample());
            this.state = this.place ? 'loading' : 'sample';
        }
    }

    // ---- The forecast ---------------------------------------------------------------

    // A forecast from storage is only trusted in the shape normalize() makes.
    valid(f) {
        return !!f && Array.isArray(f.days) && f.days.length > 0 && Array.isArray(f.hours) && f.hours.length > 0 &&
            !!f.current && Number.isFinite(f.fetchedAt) && typeof f.days[0].date === 'string';
    }

    // Does it still cover today?
    current(f) {
        const today = this.isoDay(this.placeMs(f));
        return f.days.some(day => day.date >= today);
    }

    // The made-up forecast, on this device's clock.
    sample() {
        const now = this.host.now(), offset = -now.getTimezoneOffset() * 60;
        const f = WeatherData.sample(now.getTime() + offset * 1000);
        f.utcOffsetSeconds = offset;
        return f;
    }

    use(forecast) {
        this.forecast = forecast;
        this.hourTimes = forecast.hours.map(h => Date.parse(h.time + 'Z'));
    }

    // The place's wall clock, as epoch ms (WeatherData's convention).
    placeMs(f = this.forecast) {
        return WeatherData.placeNow(this.host.now().getTime(), f.utcOffsetSeconds);
    }

    isoDay(ms) {
        return new Date(ms).toISOString().slice(0, 10);
    }

    hourIndex(ms) {
        const times = this.hourTimes;
        for (let i = 0; i < times.length; i++) if (ms >= times[i] && ms < times[i] + WEATHER_HOUR) return i;
        return ms < times[0] ? 0 : -1;
    }

    // Conditions now: Open-Meteo's "current" while it's fresh, else the
    // forecast for this hour (an old cache, or the sample).
    conditions(ms) {
        const f = this.forecast, c = f.current, i = this.hourIndex(ms), h = i >= 0 ? f.hours[i] : null;
        if (!h || (!f.sample && Math.abs(ms - Date.parse(c.time + 'Z')) <= 90 * WEATHER_MIN)) return c;
        return { temp: h.temp, feels: h.feels, humidity: f.sample ? c.humidity : null, code: h.code, isDay: h.isDay, wind: h.wind, windDir: c.windDir, precip: h.precip };
    }

    due() {
        if (!this.place || this.fetching || this.host.params.thumb) return false;
        const now = Date.now();
        if (now < this.retryAt) return false;
        const fetched = this.forecast.sample ? 0 : this.forecast.fetchedAt;
        return now - fetched >= this.config.refreshMinutes * WEATHER_MIN || fetched > now + 86400000;
    }

    async refresh() {
        if (!this.place || this.fetching || this.host.params.thumb) return;
        const { lat, lon } = this.place;
        const url = WeatherData.request({ lat, lon, days: WEATHER_FORECAST_DAYS, units: 'metric' });
        if (!url) return;
        const request = this.fetching = new AbortController();
        const timer = setTimeout(() => request.abort(), 20000);
        try {
            const response = await fetch(url, { signal: request.signal });
            if (!response.ok) throw new Error(`Open-Meteo said ${response.status}`);
            const forecast = WeatherData.normalize(await response.json(), Date.now());
            if (!forecast) throw new Error('the answer wasn’t a forecast');
            if (request !== this.fetching) return;
            this.use(forecast);
            this.state = 'live';
            this.error = '';
            this.retryAt = 0;
            this.host.storage.set('forecast', { lat, lon, units: 'metric', forecast });
        } catch (error) {
            if (request !== this.fetching) return;   // stopped or paused
            this.error = error.name === 'AbortError' ? 'no answer in 20 s' : error.message;
            console.warn(`weather: no forecast from Open-Meteo (${this.error}); trying again in 5 minutes`);
            this.retryAt = Date.now() + 5 * WEATHER_MIN;
            if (!this.forecast.sample && this.current(this.forecast)) this.state = 'offline';
            else {
                this.use(this.sample());
                this.state = 'error';
            }
        } finally {
            clearTimeout(timer);
            if (request === this.fetching) this.fetching = null;
        }
        this.changed();
    }

    // ---- Keys ---------------------------------------------------------------------------

    nextView() {
        const views = Object.keys(WEATHER_VIEWS);
        const view = views[(views.indexOf(this.config.view) + 1) % views.length];
        this.change({ view });
        return WEATHER_VIEWS[view];
    }

    switchUnits() {
        const units = this.units() === 'imperial' ? 'metric' : 'imperial';
        this.change({ units });
        return units === 'imperial' ? 'Units: °F, mph, inches' : 'Units: °C, km/h, mm';
    }

    refreshNow() {
        if (!this.place) return 'Set a place first: ⚙︎ settings, 📍 Location';
        if (Date.now() - this.manualAt < WEATHER_MIN) return 'Just asked: try again in a minute';
        this.manualAt = Date.now();
        this.retryAt = 0;
        this.refresh();
        return 'Refreshing…';
    }

    change(values) {
        const next = { ...this.config, ...values };
        WP.settings.save(next);
        this.applySettings(next);
    }

    // ---- Lifecycle ------------------------------------------------------------------------

    start() {
        if (this.running) return;
        this.running = true;
        // Two layers: the sky, painted only when it changes, and over it
        // everything that moves.
        const layer = () => {
            const c = document.createElement('canvas');
            Object.assign(c.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: '-1', pointerEvents: 'none' });
            document.body.appendChild(c);
            return c;
        };
        this.skyCanvas = layer();
        this.canvas = layer();
        this.ctx = this.canvas.getContext('2d');
        this.board = document.createElement('canvas');
        this.onResize = () => this.resize();
        window.addEventListener('resize', this.onResize);
        this.listen();
        this.resize();
        this.say();
        this.last = performance.now();
        this.frameId = requestAnimationFrame(t => this.frame(t));
    }

    stop() {
        this.running = false;
        cancelAnimationFrame(this.frameId);
        this.fetching?.abort();
        this.fetching = null;
        window.removeEventListener('resize', this.onResize);
        this.stopGestures?.();
        this.stopGestures = null;
        this.canvas?.remove();
        this.skyCanvas?.remove();
        this.canvas = this.ctx = this.board = this.skyCanvas = null;
    }

    // A pause drops a request in flight; the first frame back asks again if due.
    onPause() {
        this.fetching?.abort();
        this.fetching = null;
    }

    onResume() {
        this.host.idleUntil(0);
    }

    listen() {
        this.stopGestures?.();
        this.stopGestures = this.config.touch && !this.host.params.thumb
            ? this.host.gestures({ tap: (x, y) => this.tap(x, y) }) : null;
    }

    applySettings(config) {
        const old = this.config;
        this.config = config;
        if (config.touch !== old.touch) this.listen();
        if (config.view !== old.view) this.selected = null;
        if (this.canvas) this.changed();
    }

    onQuality(quality) {
        this.density = quality.density;
        this.updateSky();
    }

    resize() {
        if (!this.canvas) return;
        const dpr = window.devicePixelRatio || 1;
        this.W = innerWidth;
        this.H = innerHeight;
        for (const c of [this.skyCanvas, this.canvas, this.board]) {
            c.width = Math.round(this.W * dpr);
            c.height = Math.round(this.H * dpr);
        }
        this.dpr = this.canvas.width / this.W;
        WeatherScenes.setScale(this.dpr);
        this.sky = this.skyPrev = this.still = null;
        this.updateSky();
        this.ambient.resize(this.W, this.H);
        this.build();
    }

    // Something changed: the sky, the layer, the panel's line, and a frame now.
    changed() {
        this.updateSky();
        this.build();
        this.say();
        this.host.idleUntil(0);
    }

    // ---- Taps -------------------------------------------------------------------------------

    tap(x, y) {
        const inside = r => r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
        if (this.selected) {
            if (!inside(this.layout.ribbon)) this.selected = null;
        } else {
            const hit = this.layout.hits.find(inside);
            if (!hit) return;
            this.selected = { date: hit.date };
        }
        this.build();
        this.host.idleUntil(0);
    }

    // ---- Words and numbers ------------------------------------------------------------------

    units() {
        return this.config.units === 'auto' ? WeatherData.unitsFor(navigator.language) : this.config.units;
    }

    hour12() {
        if (this.config.hour12 !== 'auto') return this.config.hour12 === '12';
        try { return !!new Intl.DateTimeFormat(navigator.language, { hour: 'numeric' }).resolvedOptions().hour12; } catch { return false; }
    }

    temp(c) {
        return `${Math.round(this.units() === 'imperial' ? c * 1.8 + 32 : c)}°`;
    }

    wind(kmh) {
        return this.units() === 'imperial' ? `${Math.round(kmh / 1.609344)} mph` : `${Math.round(kmh)} km/h`;
    }

    amount(mm) {
        if (this.units() === 'imperial') return `${(mm / 25.4).toFixed(2)} in`;
        return `${mm < 10 ? mm.toFixed(1) : Math.round(mm)} mm`;
    }

    // A day's rain, or on a snowy day its fresh snow (cm, from snowfall_sum),
    // else its water ("as water", from an older cache without snowfall).
    fall(day, kind) {
        if (!this.snowy(kind)) return this.amount(day.precip);
        if (typeof day.snow !== 'number') return `${this.amount(day.precip)} as water`;
        const cm = day.snow;
        return this.units() === 'imperial' ? `${(cm / 2.54).toFixed(1)} in` : `${cm < 10 ? cm.toFixed(1) : Math.round(cm)} cm`;
    }

    // "06:41" or "6:41 AM", from a wall-clock ISO time; short drops the AM.
    clock(iso, short = false) {
        const h = +iso.slice(11, 13), m = iso.slice(14, 16);
        if (!this.hour12()) return `${iso.slice(11, 13)}:${m}`;
        return short ? `${h % 12 || 12}:${m}` : `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
    }

    hourLabel(h) {
        return this.hour12() ? `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}` : `${String(h).padStart(2, '0')}:00`;
    }

    compass(deg) {
        return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((deg % 360) + 360) % 360 / 45) % 8];
    }

    // Sunrise and sunset, or what happens instead near the poles.
    sunText(day, short = false) {
        if (day.sunrise && day.sunset) return `↑ ${this.clock(day.sunrise, short)}   ↓ ${this.clock(day.sunset, short)}`;
        const up = this.forecast.hours.some(h => h.time.startsWith(day.date) && h.isDay);
        return up ? 'Sun up all day' : 'Sun down all day';
    }

    snowy(kind) {
        return kind === 'snow' || kind === 'heavy-snow' || kind === 'snow-showers';
    }

    // The line under the place: the forecast's state, if it needs saying.
    bannerText() {
        const age = this.forecast.sample ? '' : WeatherData.age(this.forecast.fetchedAt, Date.now());
        switch (this.state) {
            case 'sample': return 'Sample forecast · set a place in ⚙︎ settings';
            case 'loading': return 'Getting the forecast…';
            case 'offline': return `${age || 'updated just now'} · offline`;
            case 'error': return 'Couldn\'t reach Open-Meteo · sample forecast';
            default: return this.config.showUpdated ? age : '';
        }
    }

    // The panel's status line.
    say() {
        const where = this.place?.label || 'your place';
        const age = this.forecast.sample ? '' : WeatherData.age(this.forecast.fetchedAt, Date.now());
        const text = {
            sample: 'No place yet, so this is a made-up sample forecast. Set one under 📍 Location.',
            loading: `Getting the forecast for ${where} from Open-Meteo…`,
            cache: `✓ The forecast for ${where}, ${age || 'updated just now'}.`,
            live: `✓ The forecast for ${where}, ${age || 'updated just now'}.`,
            offline: `Offline: the forecast for ${where} from before (${age || 'updated just now'}). Trying again every few minutes.`,
            error: `Couldn't reach Open-Meteo (${this.error}). Showing a sample until it answers.`,
        }[this.state];
        if (text === this.status) return;
        this.status = text;
        this.host.panel({ status: { forecast: text } });
    }

    // ---- The sky -------------------------------------------------------------------------

    updateSky() {
        if (!this.forecast) return;
        const ms = this.placeMs(), now = this.conditions(ms);
        const today = this.forecast.days.find(d => d.date === this.isoDay(ms));
        this.skyState = WeatherData.sky(ms, { ...(today || {}), isDay: now.isDay });
        const kind = WeatherData.kind(now.code);
        this.kindNow = kind;
        if (this.W) {
            const key = `${this.skyState.phase}:${Math.round(this.skyState.t * 20)}:${WeatherScenes.groupOf(kind)}`;
            if (key !== this.sky?.key) {
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(8, Math.ceil(this.W / 4));
                canvas.height = Math.max(8, Math.ceil(this.H / 4));
                WeatherScenes.paintSky(canvas, this.skyState, kind);
                this.skyPrev = this.sky;
                this.sky = { key, canvas };
                this.skyFade = this.skyPrev && !this.host.reducedMotion ? 0 : 1;
                this.paintSky();
            } else if (this.still) {
                this.paintSky();   // the moon and stars it carries move on
            }
        }
        const days = (this.host.now().getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 86400000;
        this.ambient.set({
            kind, night: WeatherScenes.daylight(this.skyState) < 0.4, level: this.config.ambient,
            density: this.density, wind: now.wind, moonPhase: ((days / 29.530588853) % 1 + 1) % 1,
        });
    }

    // ---- The forecast layer ------------------------------------------------------------------
    // Laid out in CSS px at a scale k, shrunk until it fits the screen
    // inside the insets; painted once into this.board.

    build() {
        if (!this.board) return;
        const g = this.board.getContext('2d');
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, this.board.width, this.board.height);
        g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        const ins = this.host.insets, W = this.W, H = this.H;
        const foot = H - ins.bottom - 10;            // the attribution's baseline
        const safe = { x: ins.left + 14, y: ins.top + 14, w: W - ins.left - ins.right - 28, h: foot - 22 - ins.top - 14 };
        this.banner = this.bannerText();
        // Darker glass over a bright sky, so white text always reads.
        const mid = WeatherScenes.skyColours(this.skyState, this.kindNow || 'clear')[1];
        this.glassTint = (0.26 + 0.26 * (0.2126 * mid[0] + 0.7152 * mid[1] + 0.0722 * mid[2]) / 255).toFixed(3);
        const ms = this.placeMs(), now = this.conditions(ms);
        const view = this.selected ? 'hours' : this.config.view;
        const ctx = { ms, now, today: this.isoDay(ms), view };

        // Fit: measure at the chosen size, then shrink to the screen.
        let k = this.config.scale, plan = null;
        for (let i = 0; i < 3; i++) {
            plan = this.plan(view, k, safe, ctx);
            const fit = Math.min(1, safe.w / plan.w, safe.h / plan.h);
            if (fit > 0.985) break;
            k *= fit * 0.99;
        }
        const x = safe.x + (safe.w - plan.w) / 2;
        const y = this.config.position === 'top' ? safe.y + Math.min(safe.h - plan.h, safe.h * 0.04)
            : this.config.position === 'bottom' ? safe.y + safe.h - plan.h : safe.y + (safe.h - plan.h) / 2;
        this.scenes = [];
        this.layout = { view, k, hits: [], ribbon: null, rows: plan.rows || 1, box: { x, y: Math.max(safe.y, y), w: plan.w, h: plan.h } };
        plan.paint(g, x, Math.max(safe.y, y));
        // The credit Open-Meteo's licence asks for, small, always.
        const credit = 'Weather data by Open-Meteo.com', cw = this.measure(g, credit, 11, 600);
        g.globalAlpha = 0.35;
        g.drawImage(WeatherScenes.shade(), W - ins.right - 12 - cw * 1.15, foot - 18, cw * 1.3, 26);
        g.globalAlpha = 1;
        this.text(g, credit, W - ins.right - 12, foot, 11, { weight: 600, colour: 'rgba(244,248,255,0.85)', align: 'right' });
        this.layout.foot = foot;
        // Only these parts of the layer are copied each frame.
        const clip = r => { const x = Math.max(0, Math.floor(r.x)), y = Math.max(0, Math.floor(r.y)); return { x, y, w: Math.min(W, Math.ceil(r.x + r.w)) - x, h: Math.min(H, Math.ceil(r.y + r.h)) - y }; };
        const box = this.layout.box;
        this.layout.blits = [clip({ x: box.x - 24, y: box.y - 24, w: box.w + 48, h: box.h + 48 }), clip({ x: W - ins.right - cw * 1.2 - 16, y: foot - 20, w: cw * 1.2 + 16 + ins.right, h: 30 })];
        this.layout.bottom = Math.max(this.layout.box.y + this.layout.box.h, foot + 2);
        this.minute = Math.floor(Date.now() / WEATHER_MIN);
        this.repaint = true;
    }

    // Header (place and state) over the view's own block.
    plan(view, k, safe, ctx) {
        const body = view === 'hours' ? this.hoursPlan(k, safe, ctx) : view === 'now' ? this.nowPlan(k, safe, ctx) : this.daysPlan(k, safe, ctx);
        const place = this.config.showPlace && this.place?.label ? this.place.label : '';
        const summary = view !== 'now' ? `${this.temp(ctx.now.temp)} · ${WeatherData.label(WeatherData.kind(ctx.now.code))}` : '';
        const lines = (place || summary ? 26 * k : 0) + (this.banner ? 30 * k : 0);
        const head = lines ? lines + 8 * k : 0;
        return {
            w: body.w, h: head + body.h, rows: body.rows,
            paint: (g, x, y) => {
                let cy = y;
                if (place || summary) {
                    const size = Math.max(12, 17 * k), sep = place && summary ? '   ' : '';
                    const a = this.measure(g, place + sep, size, 650), b = this.measure(g, summary, size * 0.92, 500);
                    let lx = x + body.w / 2 - (a + b) / 2;
                    // A soft shade under the line, as under the credit: it reads on a bright sky.
                    g.globalAlpha = 0.35;
                    g.drawImage(WeatherScenes.shade(), lx - (a + b) * 0.12, cy + 19 * k - size * 1.35, (a + b) * 1.24, size * 2.1);
                    g.globalAlpha = 1;
                    this.text(g, place + sep, lx, cy + 19 * k, size, { weight: 650, align: 'left' });
                    this.text(g, summary, lx + a, cy + 19 * k, size * 0.92, { colour: this.glassTint > 0.38 ? WEATHER_INK : WEATHER_DIM, align: 'left' });
                    cy += 26 * k;
                }
                if (this.banner) {
                    const size = Math.max(10.5, 12.5 * k), w = this.measure(g, this.banner, size, 550) + 34 * k, h = 24 * k;
                    const bx = x + body.w / 2 - w / 2;
                    this.panel(g, bx, cy + 2 * k, w, h, h / 2);
                    const dot = { sample: '#ffc65c', loading: '#8fc8ff', offline: '#c2c8d4', error: '#ff8f7a' }[this.state] || '#9fe0a8';
                    g.fillStyle = dot;
                    g.beginPath();
                    g.arc(bx + 13 * k, cy + 2 * k + h / 2, 3.6 * k, 0, Math.PI * 2);
                    g.fill();
                    this.text(g, this.banner, bx + 22 * k, cy + 2 * k + h / 2 + size * 0.36, size, { weight: 550, align: 'left' });
                    cy += 30 * k;
                }
                body.paint(g, x, y + head);
            },
        };
    }

    // ---- Days: a row of cards ----------------------------------------------------------------------

    daysPlan(k, safe, ctx) {
        const days = this.forecast.days.filter(d => d.date >= ctx.today).slice(0, this.config.days);
        const extras = [this.config.showWind, this.config.showUv, this.config.showSun, this.config.showPrecipAmount].filter(Boolean).length;
        const cw = 142 * k, gap = 14 * k, s = 86 * k;
        const ch = (38 + 86 + 18 + 34 + 22 + extras * 18 + 12) * k;
        const n = days.length;
        // As many in a row as fit, in up to three rows.
        let cols = n;
        for (const rows of [1, 2, 3]) {
            cols = Math.ceil(n / rows);
            if (cols * cw + (cols - 1) * gap <= safe.w) break;
        }
        const rows = Math.ceil(n / cols);
        const w = cols * cw + (cols - 1) * gap, h = rows * ch + (rows - 1) * gap;
        return {
            w, h, rows,
            paint: (g, x, y) => days.forEach((day, i) => {
                const row = Math.floor(i / cols), inRow = row === rows - 1 ? n - row * cols : cols;
                const cx = x + (w - (inRow * cw + (inRow - 1) * gap)) / 2 + (i - row * cols) * (cw + gap), cy = y + row * (ch + gap);
                this.dayCard(g, day, cx, cy, cw, ch, s, k, ctx, extras);
                this.layout.hits.push({ x: cx, y: cy, w: cw, h: ch, date: day.date });
            }),
        };
    }

    dayCard(g, day, x, y, w, h, s, k, ctx, extras) {
        const today = day.date === ctx.today, kind = WeatherData.kind(day.code), mid = x + w / 2;
        this.panel(g, x, y, w, h, 18 * k, today);
        this.text(g, WeatherData.dayLabel(day.date, ctx.today, navigator.language), mid, y + 26 * k, 15.5 * k, { weight: 650 });
        this.scenes.push({ kind, x: mid - s / 2, y: y + 36 * k, s, night: false, phase: this.scenes.length * 1.37 });
        let cy = y + 36 * k + s;
        this.text(g, WeatherData.label(kind), mid, cy + 13 * k, 12 * k, { colour: WEATHER_DIM });
        cy += 18 * k;
        const hi = this.temp(day.hi), lo = this.temp(day.lo);
        const a = this.measure(g, hi, 24 * k, 700), b = this.measure(g, lo, 17 * k, 500), sp = 8 * k;
        const lx = mid - (a + sp + b) / 2;
        this.text(g, hi, lx, cy + 27 * k, 24 * k, { weight: 700, align: 'left' });
        this.text(g, lo, lx + a + sp, cy + 27 * k, 17 * k, { colour: WEATHER_DIM, align: 'left' });
        cy += 34 * k;
        this.popBar(g, x + 13 * k, cy + 7 * k, w - 26 * k, k, day.pop);
        cy += 22 * k;
        const lines = [];
        if (this.config.showWind) lines.push(`Wind ${this.wind(day.windMax)}`);
        if (this.config.showUv) lines.push(`UV ${Math.round(day.uv)}`);
        if (this.config.showSun) lines.push(this.sunText(day, true));
        if (this.config.showPrecipAmount) lines.push(`${this.snowy(kind) ? 'Snow' : 'Rain'} ${this.fall(day, kind)}`);
        lines.slice(0, extras).forEach((line, i) => this.text(g, line, mid, cy + (13 + i * 18) * k, 11.5 * k, { colour: WEATHER_DIM }));
    }

    // A drop, a bar and the chance, e.g. 💧▬▬▬── 40%.
    popBar(g, x, y, w, k, pop) {
        const label = `${Math.round(pop)}%`, lw = 30 * k, bw = w - lw - 12 * k, bx = x + 11 * k;
        g.fillStyle = '#7cc0ff';
        g.beginPath();
        g.moveTo(x + 4 * k, y - 5 * k);
        g.quadraticCurveTo(x + 8 * k, y + 0.5 * k, x + 4 * k, y + 3.5 * k);
        g.quadraticCurveTo(x, y + 0.5 * k, x + 4 * k, y - 5 * k);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.16)';
        g.beginPath();
        g.roundRect(bx, y - 2 * k, bw, 4 * k, 2 * k);
        g.fill();
        if (pop > 0) {
            g.fillStyle = '#7cc0ff';
            g.beginPath();
            g.roundRect(bx, y - 2 * k, Math.max(4 * k, bw * pop / 100), 4 * k, 2 * k);
            g.fill();
        }
        this.text(g, label, x + w, y + 4 * k, 11.5 * k, { weight: 600, align: 'right', colour: pop >= 30 ? WEATHER_INK : WEATHER_DIM });
    }

    // ---- Hours: a 24-hour ribbon ---------------------------------------------------------------------

    hoursPlan(k, safe, ctx) {
        const f = this.forecast;
        let hours, title, from;
        if (this.selected) {
            from = this.forecast.hours.findIndex(h => h.time.startsWith(this.selected.date));
            hours = from < 0 ? [] : f.hours.slice(from, from + 24).filter(h => h.time.startsWith(this.selected.date));
            title = `${WeatherData.dayLabel(this.selected.date, ctx.today, navigator.language)}, hour by hour`;
        } else {
            from = Math.max(0, this.hourIndex(ctx.ms));
            hours = f.hours.slice(from, from + 24);
            title = 'The next 24 hours';
        }
        const pad = 18 * k, w = Math.min(safe.w, 1000 * k), slot = (w - 2 * pad) / Math.max(1, hours.length);
        const every = slot * 3 < 34 ? 6 : 3;
        const s = Math.min(slot * every * 0.8, 56 * k);
        const top = 34 * k, curveTop = top + s + 20 * k, curveH = 88 * k, popTop = curveTop + curveH + 14 * k, popH = 26 * k;
        const h = popTop + popH + 34 * k;
        return {
            w, h,
            paint: (g, x, y) => {
                this.layout.ribbon = { x, y, w, h };
                this.panel(g, x, y, w, h, 18 * k);
                this.text(g, title, x + pad, y + 23 * k, 14 * k, { weight: 650, align: 'left' });
                this.text(g, this.selected ? 'Tap outside to go back' : 'Chance of rain below', x + w - pad, y + 23 * k, 11.5 * k, { colour: WEATHER_DIM, align: 'right' });
                if (!hours.length) return;
                const X = i => x + pad + slot * (i + 0.5);
                const t0 = Date.parse(hours[0].time + 'Z');
                // Night behind the hours the sun is down.
                for (let i = 0; i < hours.length;) {
                    let j = i;
                    while (j < hours.length && hours[j].isDay === hours[i].isDay) j++;
                    g.fillStyle = hours[i].isDay ? 'rgba(255,226,160,0.05)' : 'rgba(6,12,36,0.32)';
                    g.fillRect(x + pad + slot * i, y + top, slot * (j - i), popTop + popH - top);
                    i = j;
                }
                // Sunrise and sunset.
                for (const day of f.days) for (const [iso, up] of [[day.sunrise, true], [day.sunset, false]]) {
                    if (!iso) continue;
                    const at = (Date.parse(iso + 'Z') - t0) / WEATHER_HOUR;
                    if (!(at >= -0.5 && at <= hours.length - 0.5)) continue;
                    const mx = x + pad + slot * (at + 0.5);
                    g.strokeStyle = 'rgba(255,214,130,0.7)';
                    g.lineWidth = 1;
                    g.setLineDash([3 * k, 3 * k]);
                    g.beginPath();
                    g.moveTo(mx, y + curveTop - 2 * k);
                    g.lineTo(mx, y + popTop + popH);
                    g.stroke();
                    g.setLineDash([]);
                    this.text(g, `${up ? '↑' : '↓'} ${this.clock(iso)}`, mx, y + popTop + popH + 28 * k, 10 * k, { colour: '#ffd98f', weight: 600 });
                }
                // The temperature curve, smooth, filled below.
                const temps = hours.map(hr => hr.temp), lo = Math.min(...temps), hi = Math.max(...temps), span = Math.max(1, hi - lo);
                const Y = c => y + curveTop + curveH * (0.86 - 0.62 * (c - lo) / span);
                const curve = () => {
                    g.moveTo(X(0), Y(temps[0]));
                    for (let i = 1; i < temps.length; i++) {
                        const mx = (X(i - 1) + X(i)) / 2, my = (Y(temps[i - 1]) + Y(temps[i])) / 2;
                        g.quadraticCurveTo(X(i - 1), Y(temps[i - 1]), mx, my);
                    }
                    g.lineTo(X(temps.length - 1), Y(temps.at(-1)));
                };
                const fill = g.createLinearGradient(0, y + curveTop, 0, y + curveTop + curveH);
                fill.addColorStop(0, 'rgba(255,206,120,0.32)');
                fill.addColorStop(1, 'rgba(255,206,120,0)');
                g.beginPath();
                curve();
                g.lineTo(X(temps.length - 1), y + curveTop + curveH);
                g.lineTo(X(0), y + curveTop + curveH);
                g.closePath();
                g.fillStyle = fill;
                g.fill();
                g.beginPath();
                curve();
                g.strokeStyle = '#ffd27e';
                g.lineWidth = Math.max(1.5, 2.4 * k);
                g.lineJoin = 'round';
                g.stroke();
                // Every few hours: a dot, the temperature, a scene and the time.
                hours.forEach((hr, i) => {
                    const px = X(i), bar = popH * hr.pop / 100;
                    g.fillStyle = hr.pop >= 30 ? 'rgba(124,192,255,0.9)' : 'rgba(124,192,255,0.55)';
                    if (bar > 0.5) {
                        g.beginPath();
                        g.roundRect(px - slot * 0.32, y + popTop + popH - bar, slot * 0.64, bar, Math.min(2 * k, slot * 0.2));
                        g.fill();
                    }
                    if (i % every) return;
                    g.fillStyle = WEATHER_INK;
                    g.beginPath();
                    g.arc(px, Y(hr.temp), 3.4 * k, 0, Math.PI * 2);
                    g.fill();
                    this.text(g, this.temp(hr.temp), px, Y(hr.temp) - 9 * k, 13 * k, { weight: 650 });
                    if (hr.pop >= 10) this.text(g, `${Math.round(hr.pop)}%`, px, y + popTop - 3 * k, 9.5 * k, { colour: '#a8d4ff' });
                    const now = !this.selected && i === 0;
                    this.text(g, now ? 'Now' : this.hourLabel(+hr.time.slice(11, 13)), px, y + popTop + popH + 15 * k, 11 * k, { weight: now ? 700 : 500, colour: now ? WEATHER_INK : WEATHER_DIM });
                    this.scenes.push({ kind: WeatherData.kind(hr.code), x: px - s / 2, y: y + top, s, night: !hr.isDay, phase: i * 0.71 });
                });
            },
        };
    }

    // ---- Now: the current conditions, large -------------------------------------------------------------

    nowPlan(k, safe, ctx) {
        const c = ctx.now, kind = WeatherData.kind(c.code), cfg = this.config;
        const day = this.forecast.days.find(d => d.date === ctx.today);
        // A small table: what, and how much.
        const rows = [];
        if (cfg.showWind) rows.push({ label: 'Wind', value: `${this.wind(c.wind)} ${this.compass(c.windDir)}`, wind: c.windDir });
        if (cfg.showHumidity && Number.isFinite(c.humidity)) rows.push({ label: 'Humidity', value: `${Math.round(c.humidity)}%` });
        if (day && cfg.showUv) rows.push({ label: 'UV index', value: `${Math.round(day.uv)}` });
        if (day && cfg.showSun) {
            if (day.sunrise && day.sunset) rows.push({ label: 'Sunrise', value: this.clock(day.sunrise) }, { label: 'Sunset', value: this.clock(day.sunset) });
            else rows.push({ label: 'Sun', value: this.sunText(day) });
        }
        if (day && cfg.showPrecipAmount) rows.push({ label: this.snowy(kind) ? 'Snow today' : 'Rain today', value: this.fall(day, kind) });
        if (day) rows.push({ label: 'High · low', value: `${this.temp(day.hi)} · ${this.temp(day.lo)}` });
        const narrow = safe.w < 640 * k;
        const w = narrow ? 360 * k : 700 * k, S = narrow ? 120 * k : 176 * k, big = narrow ? 64 * k : 92 * k;
        const pad = 22 * k, textX = pad + S + 18 * k, rowH = 25 * k, tableW = narrow ? w - 2 * pad : 210 * k;
        const headH = Math.max(S, big + (cfg.showFeels ? 56 : 32) * k);
        const tableH = rows.length * rowH;
        const topH = narrow ? pad + headH + (rows.length ? 10 * k + tableH : 0) + pad * 0.7 : pad * 2 + Math.max(headH, tableH);
        const next = this.forecast.days.filter(d => d.date > ctx.today).slice(0, Math.min(cfg.days, narrow ? 4 : 7));
        const stripH = next.length ? 104 * k : 0, gap = 12 * k;
        return {
            w, h: topH + (stripH ? gap + stripH : 0),
            paint: (g, x, y) => {
                this.panel(g, x, y, w, topH, 22 * k);
                this.scenes.push({ kind, x: x + pad * 0.8, y: y + pad * (narrow ? 0.8 : 1) + (headH - S) / 2, s: S, night: !c.isDay, phase: 0 });
                const tx = x + textX, ty = y + pad + (narrow ? 0 : (Math.max(headH, tableH) - headH) / 2);
                this.text(g, this.temp(c.temp), tx, ty + big * 0.86, big, { weight: 300, align: 'left' });
                this.text(g, WeatherData.label(kind), tx + 4 * k, ty + big + 18 * k, 19 * k, { weight: 600, align: 'left' });
                if (cfg.showFeels) this.text(g, `Feels like ${this.temp(c.feels)}`, tx + 4 * k, ty + big + 41 * k, 14.5 * k, { colour: WEATHER_DIM, align: 'left' });
                const rx = narrow ? x + pad : x + w - pad - tableW;
                const ry = narrow ? y + pad + headH + 10 * k : y + pad + (Math.max(headH, tableH) - tableH) / 2;
                rows.forEach((row, i) => {
                    const yy = ry + i * rowH + rowH * 0.68;
                    if (i) {
                        g.fillStyle = 'rgba(255,255,255,0.09)';
                        g.fillRect(rx, ry + i * rowH, tableW, 1);
                    }
                    this.text(g, row.label, rx, yy, 13.5 * k, { colour: WEATHER_DIM, align: 'left' });
                    let vx = rx + tableW;
                    this.text(g, row.value, vx, yy, 14.5 * k, { weight: 600, align: 'right' });
                    if (row.wind !== undefined) this.arrow(g, vx - this.measure(g, row.value, 14.5 * k, 600) - 12 * k, yy - 5 * k, 6.5 * k, row.wind);
                });
                if (!stripH) return;
                const sy = y + topH + gap, cell = w / next.length;
                this.panel(g, x, sy, w, stripH, 18 * k);
                next.forEach((d, i) => {
                    const cx = x + cell * (i + 0.5), s = 40 * k;
                    this.text(g, WeatherData.dayLabel(d.date, ctx.today, navigator.language), cx, sy + 20 * k, 12 * k, { weight: 650 });
                    this.scenes.push({ kind: WeatherData.kind(d.code), x: cx - s / 2, y: sy + 26 * k, s, night: false, phase: 3 + i * 1.1 });
                    const hi = this.temp(d.hi), lo = this.temp(d.lo), a = this.measure(g, hi, 13.5 * k, 650), b = this.measure(g, lo, 12.5 * k);
                    const lx = cx - (a + 6 * k + b) / 2;
                    this.text(g, hi, lx, sy + 26 * k + s + 22 * k, 13.5 * k, { weight: 650, align: 'left' });
                    this.text(g, lo, lx + a + 6 * k, sy + 26 * k + s + 22 * k, 12.5 * k, { colour: WEATHER_DIM, align: 'left' });
                    this.layout.hits.push({ x: cx - cell / 2, y: sy, w: cell, h: stripH, date: d.date });
                });
            },
        };
    }

    // Where the wind is blowing to (it comes from `deg`).
    arrow(g, x, y, r, deg) {
        g.save();
        g.translate(x, y);
        g.rotate((deg + 180) * Math.PI / 180);
        g.beginPath();
        g.moveTo(0, -r);
        g.lineTo(r * 0.62, r * 0.75);
        g.lineTo(0, r * 0.38);
        g.lineTo(-r * 0.62, r * 0.75);
        g.closePath();
        g.fillStyle = WEATHER_INK;
        g.fill();
        g.restore();
    }

    // ---- Drawing helpers --------------------------------------------------------------------------------

    // A card: frosted glass (translucent, a 1 px highlight, no blur),
    // solid, or minimal (a soft baked shade for the text to sit on).
    panel(g, x, y, w, h, r, lit = false) {
        const style = this.config.card;
        if (style === 'minimal') {
            g.globalAlpha = lit ? 0.6 : 0.45;
            g.drawImage(WeatherScenes.shade(), x - w * 0.08, y - h * 0.08, w * 1.16, h * 1.16);
            g.globalAlpha = 1;
            return;
        }
        g.beginPath();
        g.roundRect(x, y, w, h, r);
        if (style === 'solid') {
            g.fillStyle = lit ? 'rgba(20,36,62,0.92)' : 'rgba(12,22,40,0.88)';
            g.fill();
            g.strokeStyle = lit ? 'rgba(143,200,255,0.45)' : 'rgba(255,255,255,0.08)';
            g.lineWidth = 1;
            g.stroke();
            return;
        }
        g.fillStyle = `rgba(10,22,42,${this.glassTint})`;
        g.fill();
        const sheen = g.createLinearGradient(0, y, 0, y + h);
        sheen.addColorStop(0, `rgba(255,255,255,${lit ? 0.16 : 0.1})`);
        sheen.addColorStop(1, 'rgba(255,255,255,0.02)');
        g.fillStyle = sheen;
        g.fill();
        g.strokeStyle = lit ? 'rgba(190,225,255,0.5)' : 'rgba(255,255,255,0.14)';
        g.lineWidth = 1;
        g.stroke();
        g.beginPath();
        g.moveTo(x + r, y + 0.75);
        g.lineTo(x + w - r, y + 0.75);
        g.strokeStyle = 'rgba(255,255,255,0.42)';
        g.stroke();
    }

    measure(g, text, size, weight = 500) {
        g.font = `${weight} ${Math.max(9, size)}px ${WEATHER_FONT}`;
        return g.measureText(text).width;
    }

    // Text with a soft drop shadow (baked: the layer is painted once).
    text(g, text, x, y, size, { weight = 500, colour = WEATHER_INK, align = 'center' } = {}) {
        size = Math.max(9, size);
        g.font = `${weight} ${size}px ${WEATHER_FONT}`;
        g.textAlign = align;
        g.textBaseline = 'alphabetic';
        g.fillStyle = 'rgba(0,8,22,0.4)';
        g.fillText(text, x, y + Math.min(2, Math.max(1, size * 0.05)));
        g.fillStyle = colour;
        g.fillText(text, x, y);
    }

    // ---- Frames -----------------------------------------------------------------------------------------

    frame(now) {
        if (!this.running) return;
        const started = performance.now();
        const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
        this.last = now;
        const still = this.host.reducedMotion;
        if (!still) this.t += dt;
        // Once a minute: the hour may have turned, the age line moved on.
        if (Math.floor(Date.now() / WEATHER_MIN) !== this.minute) {
            this.updateSky();
            this.build();
            this.say();
        }
        if (this.due()) this.refresh();
        if (!still) this.ambient.update(dt, this.t);
        this.skyFade = still ? 1 : Math.min(1, this.skyFade + dt / 2.5);
        this.draw();
        // At most 20 fps with rain, snow or lightning outside, 12 with only
        // drifting clouds, 10 with nothing moving but the scenes; a still
        // picture once a minute under reduced motion.
        const step = this.still ? 100 : this.ambient.calm() ? 83 : 50;
        this.host.idleUntil(still ? WEATHER_MIN - Date.now() % WEATHER_MIN + 50 : Math.max(0, step - (performance.now() - started) - 2));
        this.frameId = requestAnimationFrame(t => this.frame(t));
    }

    // The sky layer: the small gradient scaled up, crossfading from the
    // last one for a couple of seconds after it changes.
    paintSky() {
        if (!this.skyCanvas) return;   // stopped: onQuality can still arrive
        const g = this.skyCanvas.getContext('2d');
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.imageSmoothingEnabled = true;
        const w = this.skyCanvas.width, h = this.skyCanvas.height;
        if (this.skyPrev && this.skyFade < 1) g.drawImage(this.skyPrev.canvas, 0, 0, w, h);
        g.globalAlpha = this.skyPrev ? this.skyFade : 1;
        g.drawImage(this.sky.canvas, 0, 0, w, h);
        g.globalAlpha = 1;
        if (this.skyFade >= 1) this.skyPrev = null;
        if (this.still) {
            g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
            this.ambient.draw(g, this.t, WeatherScenes.daylight(this.skyState), false);
        }
    }

    draw() {
        const g = this.ctx, W = this.W, H = this.H, d = this.dpr;
        g.setTransform(d, 0, 0, d, 0, 0);
        g.imageSmoothingEnabled = true;
        const dim = this.state === 'loading' ? 0.55 : 1;   // the first forecast is on its way
        const copy = r => g.drawImage(this.board, r.x * d, r.y * d, r.w * d, r.h * d, r.x, r.y, r.w, r.h);
        // Nothing in the sky moving: its weather goes into the sky's layer,
        // the forecast is copied once, and each frame repaints only the
        // scenes' squares.
        const day = WeatherScenes.daylight(this.skyState), still = this.host.reducedMotion || this.ambient.still(day);
        if (still !== this.still) {
            this.still = still;
            this.paintSky();
            this.repaint = true;
        } else if (this.skyPrev) this.paintSky();
        g.globalAlpha = dim;
        if (!still || this.repaint) {
            g.clearRect(0, 0, W, H);
            if (!still) {
                g.globalAlpha = 1;
                this.ambient.draw(g, this.t, day, true);
                g.globalAlpha = dim;
            }
            for (const r of this.layout.blits) copy(r);
            this.repaint = false;
        } else {
            for (const sc of this.scenes) {
                const p = sc.s * 0.12, r = { x: Math.floor(sc.x - p), y: Math.floor(sc.y - p), w: Math.ceil(sc.s + 2 * p) + 1, h: Math.ceil(sc.s + 2 * p) + 1 };
                g.clearRect(r.x, r.y, r.w, r.h);
                copy(r);
            }
        }
        for (const sc of this.scenes) WeatherScenes.draw(g, sc.kind, sc.x, sc.y, sc.s, this.t + sc.phase, sc.night, dim);
        g.globalAlpha = 1;
    }
}
