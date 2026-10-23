// Jellyfin (SPEC §10.21): your own server's videos playing behind
// everything, inside a frame drawn in code. A playlist, shuffled by default,
// random picks from a library, or your favourites.
//
// The video is a real <video> element, never drawn into a canvas per frame,
// so decoding stays in hardware and the browser can use an overlay plane.
// Around it, two canvases: the frame's still art (painted once per resize,
// with a clear hole for the screen) and an overlay for the few moving bits,
// subtitles and badges, redrawn only when something changes. The stage
// idles in between (§4.8).
//
// One tab plays at a time: the newest visible one claims playback, and the
// others pause, keep their last frame and release the decoder. Positions,
// the shuffle bag and subtitle picks live in host.storage, so a new tab
// carries on where the last one left off. The sign-in token is
// wp:jellyfin:auth, a catalog secret: never exported, never logged.

class JellyfinAnimationManager {
    static VERSION = '0.7.0';             // the Version Jellyfin sees; tests keep it equal to manifest.json's
    static SAVE_EVERY = 10000;            // ms between saved positions
    static POSTER_MS = 180000;            // poster mode moves on every 3 minutes
    static QUICK_POLL = 3000;
    static QUICK_FOR = 5 * 60000;

    constructor(host) {
        this.host = host;
        this.config = WP.settings.load();
        this.state = host.params.thumb ? 'demo' : 'setup';
        this.tab = Math.random().toString(36).slice(2, 10);
        this.feed = { status: {}, options: {} };
        this.items = [];
        this.bag = host.storage.get('bag');
        this.item = null;
        this.channel = 1;
        this.muted = true;
        this.cue = '';
        this.paints = 0;
        this.frame = this.frame.bind(this);
        this.onResize = () => this.resize();
        this.onStorage = event => this.claimed(event);
        this.timers = new Set();
        this.badgeUntil = 0;
        this.titleUntil = 0;
        this.infoUntil = 0;
        this.busyUntil = 0;
        this.wakeAt = 0;
    }

    // ---- Lifecycle ------------------------------------------------------------------

    start() {
        if (this.running) return;
        this.running = true;
        const layer = (tag, z) => {
            const element = document.createElement(tag);
            element.style.cssText = `position:fixed;left:0;top:0;width:100%;height:100%;z-index:${z};pointer-events:none`;
            document.body.appendChild(element);
            return element;
        };
        this.box = layer('div', -4);
        this.box.style.overflow = 'hidden';
        this.poster = document.createElement('img');
        this.poster.alt = '';
        this.poster.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity 1.2s,transform 60s linear;transform-origin:50% 50%';
        this.still = document.createElement('canvas');
        this.still.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:none';
        this.box.append(this.poster, this.still);
        this.art = layer('canvas', -3);
        this.overlay = layer('canvas', -2);
        this.artCtx = this.art.getContext('2d');
        this.ctx = this.overlay.getContext('2d');
        window.addEventListener('resize', this.onResize);
        window.addEventListener('storage', this.onStorage);
        this.stopGestures = this.host.gestures({ tap: (x, y) => this.tap(x, y) });
        this.pickFrame();
        this.resize();
        this.raf = requestAnimationFrame(this.frame);
        if (this.state !== 'demo') this.boot();
        else this.say();
    }

    stop() {
        this.running = false;
        cancelAnimationFrame(this.raf);
        this.savePosition();
        this.report('stopped');
        this.release();
        for (const timer of this.timers) clearTimeout(timer);
        this.timers.clear();
        this.quick = null;
        window.removeEventListener('resize', this.onResize);
        window.removeEventListener('storage', this.onStorage);
        this.stopGestures?.();
        for (const element of [this.box, this.art, this.overlay]) element?.remove();
        this.box = this.art = this.overlay = this.video = null;
    }

    later(fn, ms) {
        const timer = setTimeout(() => { this.timers.delete(timer); if (this.running) fn(); }, ms);
        this.timers.add(timer);
        return timer;
    }

    // The stage paused (hidden, or the power policy): the video pauses too,
    // and its place is saved. Back again, this tab claims playback.
    onPause() {
        this.savePosition();
        this.video?.pause();
        this.report('progress', true);
    }

    onResume() {
        if (!this.running || this.state === 'demo') return;
        if (this.state === 'away' || this.state === 'playing' || this.state === 'poster') this.claim();
        if (this.state === 'away') this.replay();
        else if (this.state === 'playing' && !this.userPaused) this.video?.play().catch(() => {});
    }

    applySettings(config) {
        const before = this.config;
        this.config = config;
        if (this.video) this.video.volume = config.volume;
        const changed = keys => keys.some(key => JSON.stringify(before[key]) !== JSON.stringify(config[key]));
        if (changed(['frame', 'fit'])) { this.pickFrame(); this.resize(); }
        else if (changed(['showTitle'])) this.dirty();
        if (changed(['server'])) {
            this.feed = { status: {}, options: {} };
            this.release();
            this.api = null;
            this.boot();
            return;
        }
        if (changed(['source', 'playlistId', 'libraryId', 'libraryFilter', 'order']) && this.signedIn()) {
            this.items = [];
            this.advance();
        } else if (changed(['subtitles', 'subtitleLanguage', 'burnInImageSubs', 'maxResolution']) && this.item) {
            this.replay();
        } else if (changed(['posterMode'])) {
            this.onPower(this.host.power);
        }
    }

    onQuality() {
        this.pickFrame();
        this.resize();
    }

    // Battery saver (or battery, on Android) swaps the video for posters;
    // the resolution cap applies from the next item.
    onPower() {
        if (!this.signedIn() || !this.item) return;
        const poster = this.posterWanted();
        if (poster !== (this.state === 'poster')) this.replay();
    }

    // ---- The frame and drawing ----------------------------------------------------

    pickFrame() {
        const id = this.config.frame === 'seasonal' ? JellyfinFrames.seasonal(this.host.now()) : this.config.frame;
        this.frameDef = JellyfinFrames.get(id);
        if (this.video) this.applyVideoStyle();
    }

    effects() {
        return new Set(this.host.quality?.effects || []);
    }

    env() {
        const effects = this.effects();
        return {
            now: this.host.now(), title: this.item ? JellyfinLogic.titleOf(this.item) : '', quality: this.host.quality,
            motion: effects.has('frameMotion') && !this.host.reducedMotion, effects, insets: this.host.insets, reducedMotion: this.host.reducedMotion,
            viewport: { w: innerWidth, h: innerHeight }, channel: this.channel, volume: this.config.volume, video: this.video,
            playing: this.state === 'playing' && !this.userPaused, paused: this.state === 'playing' && this.userPaused,
            random: WP.seededRandom(this.channel * 7919), busy: ms => { this.busyUntil = Math.max(this.busyUntil, performance.now() + ms); this.dirty(); },
        };
    }

    aspect() {
        const v = this.video;
        return v?.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 16 / 9;
    }

    resize() {
        if (!this.running) return;
        const dpr = window.devicePixelRatio || 1;
        const w = innerWidth, h = innerHeight;
        for (const canvas of [this.art, this.overlay]) {
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
        }
        this.artCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const env = this.env();
        this.layout = this.frameDef.layout(w, h, this.aspect(), env);
        const s = this.layout.screen;
        Object.assign(this.box.style, { left: `${s.x}px`, top: `${s.y}px`, width: `${s.w}px`, height: `${s.h}px`, borderRadius: `${s.radius || 0}px` });
        this.paint(env);
    }

    // The still art: once per resize, frame or title (for frames that show it).
    paint(env = this.env()) {
        this.artCtx.clearRect(0, 0, innerWidth, innerHeight);
        this.frameDef.paint(this.artCtx, this.layout, env);
        this.paints++;
        this.dirty();
    }

    applyVideoStyle() {
        const none = this.frameDef.id === 'none';
        this.video.style.objectFit = none ? this.config.fit : 'contain';
        this.video.style.filter = this.frameDef.videoFilter && this.effects().has('videoFilter') ? this.frameDef.videoFilter : '';
    }

    dirty() {
        this.wakeAt = 0;
        this.host.idleUntil(0);
    }

    showing() {
        return this.state === 'playing' || this.state === 'poster';
    }

    frame(now) {
        if (!this.running) return;
        if (now >= this.wakeAt) {
            const ctx = this.ctx, env = this.env(), L = this.layout;
            ctx.clearRect(0, 0, innerWidth, innerHeight);
            let wait = Infinity;
            if (!this.showing() && this.state !== 'away') this.frameDef.idle(ctx, L, env, this.state);
            if (this.frameDef.tick) wait = Math.min(wait, this.frameDef.tick(ctx, now, L, env));
            if (this.cue && this.state === 'playing') this.frameDef.cue(ctx, this.cue, L, env);
            wait = Math.min(wait, this.chrome(ctx, now, L));
            if (now < this.busyUntil) wait = Math.min(wait, 33);
            this.wakeAt = now + wait;
        }
        const wait = this.wakeAt - performance.now();
        if (wait > 0) this.host.idleUntil(wait);
        this.raf = requestAnimationFrame(this.frame);
    }

    // The manager's own marks over the frame: 🔇, the title card, the info
    // card. Returns ms until one of them next changes.
    chrome(ctx, now, { screen: s }) {
        let wait = Infinity;
        const fade = (until, span = 600) => Math.max(0, Math.min(1, (until - now) / span));
        const bottom = Math.min(s.y + s.h, innerHeight - this.host.insets.bottom);
        if (this.video && this.state === 'playing' && this.muted && now < this.badgeUntil) {
            const size = Math.max(28, Math.min(44, s.w * 0.05));
            // Frames with their own on-screen display (osd: REC, PLAY ▶) keep its
            // corners; the badge goes top centre.
            this.badge = { x: this.frameDef.osd ? s.x + (s.w - size) / 2 : s.x + s.w - size - 12, y: s.y + 12, size };
            ctx.save();
            ctx.globalAlpha = fade(this.badgeUntil);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
            ctx.beginPath();
            ctx.arc(this.badge.x + size / 2, this.badge.y + size / 2, size / 2, 0, 7);
            ctx.fill();
            ctx.font = `${size * 0.52}px system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🔇', this.badge.x + size / 2, this.badge.y + size / 2 + 1);
            ctx.restore();
            wait = Math.min(wait, this.badgeUntil - now < 600 ? 50 : this.badgeUntil - 600 - now);
        }
        if (this.item && this.config.showTitle && !this.frameDef.titled && !this.frameDef.osd && now < this.titleUntil && this.showing()) {
            const px = Math.max(13, Math.min(24, s.w * 0.028));
            ctx.save();
            ctx.globalAlpha = fade(this.titleUntil, 1200);
            ctx.font = `600 ${px}px system-ui, sans-serif`;
            ctx.fillStyle = '#fff';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
            ctx.shadowBlur = 6;
            ctx.fillText(JellyfinLogic.titleOf(this.item), s.x + px, Math.min(s.y + px * 2.2, bottom - px));
            ctx.restore();
            wait = Math.min(wait, this.titleUntil - now < 1200 ? 50 : this.titleUntil - 1200 - now);
        }
        if (this.state === 'away') {
            const text = 'Playing in another tab', px = 13;
            ctx.save();
            ctx.font = `500 ${px}px system-ui, sans-serif`;
            const w = ctx.measureText(text).width + 24;
            ctx.fillStyle = 'rgba(10, 10, 16, 0.7)';
            JellyfinFrames.roundRect(ctx, s.x + (s.w - w) / 2, s.y + s.h / 2 - 15, w, 30, 15);
            ctx.fill();
            ctx.fillStyle = '#e8e6f0';
            ctx.textAlign = 'center';
            ctx.fillText(text, s.x + s.w / 2, s.y + s.h / 2 + 4.5);
            ctx.restore();
        }
        if (this.item && now < this.infoUntil) {
            const lines = this.describe();
            const px = 13, pad = 12, w = Math.min(s.w - 24, 360), h = lines.length * px * 1.5 + pad * 2;
            const x = s.x + 12, y = Math.max(s.y + 12, bottom - h - 12);
            ctx.save();
            ctx.globalAlpha = fade(this.infoUntil);
            ctx.fillStyle = 'rgba(10, 10, 16, 0.78)';
            JellyfinFrames.roundRect(ctx, x, y, w, h, 10);
            ctx.fill();
            ctx.fillStyle = '#e8e6f0';
            ctx.font = `500 ${px}px system-ui, sans-serif`;
            lines.forEach((line, i) => ctx.fillText(line, x + pad, y + pad + px + i * px * 1.5, w - pad * 2));
            ctx.restore();
            wait = Math.min(wait, 1000);
        }
        return wait;
    }

    // ---- The server and signing in --------------------------------------------------

    signedIn() {
        return !!this.api?.token;
    }

    deviceId() {
        let id = this.host.storage.get('device');
        if (!id) this.host.storage.set('device', id = `wp-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`);
        return id;
    }

    makeApi(server, auth = null) {
        const device = this.host.kind === 'android' ? 'Android' : this.host.kind === 'extension' ? 'Chrome extension' : 'Browser';
        return new JellyfinApi({ server, deviceId: this.deviceId(), device: `Wallpapers (${device})`, version: JellyfinAnimationManager.VERSION,
            token: auth?.token || null, userId: auth?.userId || null });
    }

    // At start, or when the address changes: carry on signed in if we were.
    boot() {
        this.server = JellyfinLogic.normalizeServer(this.config.server);
        const auth = this.host.storage.get('auth');
        if (!this.server) {
            this.set('setup');
            return this.say({ server: this.config.server ? 'That doesn’t look like a server address.' : 'Type your server’s address, then Connect.' });
        }
        if (auth?.server === this.server && auth.token) {
            this.api = this.makeApi(this.server, auth);
            this.feed.connected = true;
            this.feed.signedIn = true;
            this.say({ account: `Signed in as ${auth.user}.` });
            this.connect({ quiet: true });
            this.advance();
        } else {
            this.set('setup');
            this.say({ server: 'Connect to check the server, then sign in.' });
        }
    }

    async onAction(name, inputs) {
        if (this.state === 'demo') return;
        if (name === 'connect') return this.connect();
        if (name === 'quick') return this.startQuickConnect();
        if (name === 'cancel') { this.quick = null; this.feed.waiting = false; return this.say({ account: 'Cancelled.' }); }
        if (name === 'password') return this.signIn(() => this.api.signInPassword(inputs.username || '', inputs.password || ''));
        if (name === 'signout') return this.signOut();
    }

    // What went wrong, in words the panel can show.
    explain(error) {
        const blocked = JellyfinLogic.blockedBecause(this.server, location.protocol, this.host.kind);
        if (error.kind === 'auth') return 'The server said no: sign in again.';
        if (error.kind === 'notJellyfin') return 'Something answered, but it isn’t Jellyfin.';
        if (error.kind === 'http') return `The server answered with an error (${error.status}).`;
        if (blocked === 'mixed') return 'This page is https, and Chrome blocks an http server named like that. Use its IP address, an https address, or the extension.';
        if (location.protocol === 'https:' && this.server.startsWith('http')) return 'No answer. If Chrome asked about devices on your local network, allow it, then Connect again. Otherwise check the address.';
        if (this.host.kind === 'android') return 'No answer. Check the address, and that Wallpapers may use devices on your local network (Android settings → Apps → Wallpapers → Permissions).';
        return 'No answer from that address. Is the server on, and the address right?';
    }

    async connect({ quiet = false } = {}) {
        this.server = JellyfinLogic.normalizeServer(this.config.server);
        if (!this.server) return this.say({ server: 'Type your server’s address first.' });
        const auth = this.host.storage.get('auth');
        this.api ??= this.makeApi(this.server, auth?.server === this.server ? auth : null);
        if (!quiet) { this.set(this.signedIn() ? this.state : 'connecting'); this.say({ server: 'Connecting…' }); }
        try {
            const info = await this.api.info();
            this.feed.connected = true;
            this.feed.quick = await this.api.quickConnectEnabled();
            this.say({ server: `✓ ${info.name}, Jellyfin ${info.version}.`, account: this.signedIn() ? this.feed.status.account : this.feed.quick ? 'Sign in with Quick Connect (no password here), or with your password.' : 'Sign in with your username and password.' });
            if (this.signedIn()) this.loadOptions();
            else this.set('setup');
        } catch (error) {
            this.feed.connected = false;
            this.say({ server: this.explain(error) });
            if (!this.signedIn()) this.set('setup');
        }
    }

    async startQuickConnect() {
        try {
            const { code, secret } = await this.api.quickConnect();
            const quick = this.quick = { secret, until: performance.now() + JellyfinAnimationManager.QUICK_FOR };
            this.feed.waiting = true;
            this.say({ account: { text: 'In any Jellyfin app you’re signed in to, open Quick Connect and enter this code:', code } });
            const poll = async () => {
                if (this.quick !== quick) return;
                if (performance.now() > quick.until) { this.quick = null; this.feed.waiting = false; return this.say({ account: 'The code expired. Try again.' }); }
                try {
                    if (await this.api.approved(secret)) { this.quick = null; return this.signIn(() => this.api.signInQuick(secret)); }
                } catch (error) {
                    if (error.kind !== 'unreachable') { this.quick = null; this.feed.waiting = false; return this.say({ account: this.explain(error) }); }
                }
                this.later(poll, JellyfinAnimationManager.QUICK_POLL);
            };
            this.later(poll, JellyfinAnimationManager.QUICK_POLL);
        } catch (error) {
            this.say({ account: error.kind === 'http' ? 'Quick Connect is turned off on this server: use your password.' : this.explain(error) });
        }
    }

    async signIn(attempt) {
        this.feed.waiting = false;
        this.say({ account: 'Signing in…' });
        try {
            const auth = await attempt();
            this.host.storage.set('auth', { server: this.server, ...auth });
            this.feed.signedIn = true;
            this.say({ account: `Signed in as ${auth.user}.` });
            await this.loadOptions();
            this.advance();
        } catch (error) {
            this.say({ account: error.kind === 'auth' ? 'Wrong username or password.' : this.explain(error) });
        }
    }

    async signOut() {
        this.savePosition();
        this.release();
        await this.api?.signOut();
        this.host.storage.set('auth', null);
        this.api = null;
        this.item = null;
        this.items = [];
        this.feed = { status: {}, options: {}, connected: this.feed.connected, quick: this.feed.quick };
        this.set('setup');
        this.say({ account: 'Signed out. The server forgot this device’s sign-in.' });
    }

    // The playlists and libraries for the panel's pickers.
    async loadOptions() {
        try {
            const [playlists, libraries] = await Promise.all([this.api.playlists(), this.api.libraries()]);
            this.feed.options = { playlists, libraries };
            this.say();
        } catch {}
    }

    // Tell the panel: a status patch, plus the feed's flags and options.
    say(status = {}) {
        this.feed.status = { ...this.feed.status, ...status };
        this.feed.state = this.state;
        this.host.panel(this.feed);
    }

    set(state) {
        if (this.state === state) return;
        this.state = state;
        this.feed.state = state;
        this.host.panel(this.feed);
        this.dirty();
    }

    // The server said 401: the token is gone.
    lostAuth() {
        this.release();
        this.host.storage.set('auth', null);
        if (this.api) this.api.token = null;
        this.feed.signedIn = false;
        this.set('signedout');
        this.say({ account: 'The server signed this device out. Sign in again.' });
    }

    // ---- What plays -------------------------------------------------------------------

    posterWanted() {
        return JellyfinLogic.posterWanted({ setting: this.config.posterMode, reasons: this.host.power?.reasons || [], android: this.host.kind === 'android' });
    }

    source() {
        const { source, playlistId, libraryId, libraryFilter } = this.config;
        if (source === 'playlist') return { source, id: playlistId || this.feed.options?.playlists?.[0]?.[0] || null };
        return { source, id: source === 'library' ? libraryId : null, filter: libraryFilter };
    }

    // The next item (step 1) or the one before (-1), and play it.
    async advance(step = 1) {
        if (!this.signedIn() || !this.running) return;
        const generation = this.generation = (this.generation || 0) + 1;
        try {
            const spec = this.source();
            if (spec.source === 'playlist' && !spec.id) {
                if (!this.feed.options?.playlists) await this.loadOptions();
                spec.id = this.feed.options?.playlists?.[0]?.[0];
                if (!spec.id) return this.set('empty');
            }
            const key = JSON.stringify(spec);
            if (key !== this.itemsKey || !this.items.length) {
                if (!this.item) this.set('loading');
                this.items = await this.api.items(spec);
                this.itemsKey = key;
                this.failures = 0;
            }
            if (generation !== this.generation) return;
            if (!this.items.length) return this.set('empty');
            const shuffle = spec.source !== 'playlist' || this.config.order === 'shuffle';
            const ids = this.items.map(item => item.Id);
            const step1 = step < 0 ? JellyfinLogic.previous(this.bag) : JellyfinLogic.next(this.bag, ids, { shuffle });
            // A random batch from a library runs out: fetch another next time.
            if (spec.source !== 'playlist' && step > 0 && step1.state?.at === 0 && this.bag?.at > 0) this.items = [];
            this.bag = step1.state;
            this.host.storage.set('bag', this.bag);
            const item = this.items.find(i => i.Id === step1.id) || this.items[0];
            await this.play(item, generation);
        } catch (error) {
            this.failed(error);
        }
    }

    replay() {
        if (this.item) this.play(this.item, this.generation = (this.generation || 0) + 1).catch(error => this.failed(error));
        else this.advance();
    }

    failed(error) {
        if (!this.running) return;
        if (error?.kind === 'auth') return this.lostAuth();
        this.failures = (this.failures || 0) + 1;
        if (this.failures >= 3 || error?.kind === 'unreachable') {
            this.release();
            this.set('offline');
            this.later(() => { this.items = []; this.advance(); }, JellyfinLogic.backoff(this.failures));
        } else {
            this.later(() => this.advance(), 1500);
        }
    }

    // ---- Playing ------------------------------------------------------------------------

    ensureVideo() {
        if (this.video) return this.video;
        const video = this.video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.disablePictureInPicture = true;
        video.disableRemotePlayback = true;
        video.preload = 'auto';
        video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;background:#000';
        video.volume = this.config.volume;
        this.box.prepend(video);
        this.applyVideoStyle();
        video.addEventListener('loadedmetadata', () => this.loaded());
        video.addEventListener('timeupdate', () => this.progress());
        video.addEventListener('ended', () => this.advance());
        video.addEventListener('error', () => { if (video.getAttribute('src')) this.failed({ kind: 'media' }); });
        video.addEventListener('playing', () => { this.still.style.display = 'none'; this.failures = 0; });
        return video;
    }

    async play(item, generation) {
        this.savePosition();
        const first = !this.item;
        const changed = this.item?.Id !== item.Id;
        this.item = item;
        this.cue = '';
        this.channel += changed ? 1 : 0;
        if (changed && this.frameDef.titled && this.layout) this.paint();   // the marquee or plaque shows the new title
        this.claim();
        if (this.posterWanted()) return this.showPoster(item, first);
        this.poster.style.opacity = '0';
        if (!first) this.frameDef.transition?.('change', this.env());
        if (first && !this.showing()) this.set('loading');

        const duration = (item.RunTimeTicks || 0) / 1e7;
        const segment = JellyfinLogic.segmentFor(this.config.segment, this.host.kind === 'android');
        const positions = this.host.storage.get('positions') || {};
        const span = JellyfinLogic.span({ duration, segment, minutes: Number(this.config.clipMinutes), saved: positions[item.Id] || 0 });
        const video = this.ensureVideo();
        const canPlay = mime => video.canPlayType(mime) !== '';
        const height = JellyfinLogic.maxHeight({ tier: this.host.quality?.tier, setting: this.config.maxResolution, reasons: this.host.power?.reasons || [] });
        const profile = JellyfinLogic.deviceProfile({ canPlay, height });
        let { source, session } = await this.api.playbackInfo(item, { profile });
        if (generation !== this.generation) return;

        // Subtitles: the remembered pick for this item, else the automatic one.
        const streams = source.MediaStreams || [];
        const picks = this.host.storage.get('subs') || {};
        const audioIndex = source.DefaultAudioStreamIndex ?? null;
        const chosen = item.Id in picks
            ? JellyfinLogic.subtitleChoices(streams).find(c => (c?.index ?? -1) === picks[item.Id]) ?? null
            : JellyfinLogic.pickSubtitle(streams, { language: this.config.subtitleLanguage, mode: this.config.subtitles, burnInImage: this.config.burnInImageSubs, audioIndex });
        this.subtitle = chosen;
        const transcoded = !source.SupportsDirectPlay || chosen?.burn;
        if (transcoded) {
            // Ask again with the start time, and the image track to burn in.
            ({ source, session } = await this.api.playbackInfo(item, { profile, subtitleIndex: chosen?.burn ? chosen.index : null, startSeconds: span.start }));
            if (generation !== this.generation) return;
        }
        const path = JellyfinLogic.streamPath(item, source, { token: this.api.token, session, burn: chosen?.burn });
        if (!path) throw { kind: 'media' };
        this.release({ keepStill: !first });
        this.playing = { item, source, session, offset: transcoded ? span.start : 0, start: span.start, end: span.end, segment, transcoded, savedAt: performance.now() };
        this.ensureVideo();
        this.video.src = JellyfinLogic.mediaUrl(this.server, path, { android: this.host.kind === 'android', origin: location.origin });
        if (chosen && !chosen.burn) this.loadSubtitles(item, source, chosen.index, generation);
        this.startPlayback(first);
        this.titleUntil = performance.now() + 6000;
        this.report('start');
    }

    // Muted unless asked otherwise; if the browser refuses sound, muted
    // after all, with a hint.
    startPlayback(first) {
        const video = this.video;
        // The first item follows the setting; after that, whatever M last chose.
        video.muted = this.muted = first ? this.config.startMuted || this.soundAllowed === false : this.muted;
        if (this.muted) this.badgeUntil = performance.now() + 4000;
        this.set('playing');
        if (this.userPaused || WP.stage?.paused) return;
        video.play().catch(error => {
            if (error?.name !== 'NotAllowedError' || video.muted) return;
            this.soundAllowed = false;
            video.muted = this.muted = true;
            this.badgeUntil = performance.now() + 6000;
            this.host.toast('🔇 Tap or press M for sound', 4000);
            video.play().catch(() => {});
        });
    }

    loaded() {
        const p = this.playing;
        if (!p) return;
        if (this.layoutAspect !== this.aspect()) {
            this.layoutAspect = this.aspect();
            this.resize();
        }
        if (!p.transcoded && p.start > 1) this.video.currentTime = p.start;
    }

    position() {
        return this.playing ? this.playing.offset + (this.video?.currentTime || 0) : 0;
    }

    progress() {
        const p = this.playing;
        if (!p || this.state !== 'playing') return;
        const now = performance.now();
        if (p.end !== null && this.position() >= p.end) return this.advance();
        if (now - p.savedAt > JellyfinAnimationManager.SAVE_EVERY) {
            p.savedAt = now;
            this.savePosition();
            this.report('progress');
        }
    }

    // Only whole items keep their place; a clip's place means nothing.
    savePosition() {
        const p = this.playing;
        if (!p || p.segment !== 'whole' || !this.video || this.state !== 'playing') return;
        const seconds = this.position();
        if (seconds > 1) this.host.storage.set('positions', JellyfinLogic.remember(this.host.storage.get('positions'), p.item.Id, seconds));
    }

    async loadSubtitles(item, source, index, generation) {
        try {
            const text = await this.api.subtitles(item, source, index);
            if (generation !== this.generation || !this.video) return;
            const track = document.createElement('track');
            track.kind = 'subtitles';
            track.src = this.trackUrl = URL.createObjectURL(new Blob([text], { type: 'text/vtt' }));
            this.video.append(track);
            track.track.mode = 'hidden';
            // Cues redraw only when they change (§10.21): nothing in between.
            track.track.addEventListener('cuechange', () => {
                const cues = [...(track.track.activeCues || [])].map(cue => JellyfinLogic.cueText(cue.text)).filter(Boolean);
                this.cue = cues.join('\n');
                this.dirty();
            });
            // A transcode starts at its offset; the cues keep the film's times.
            track.addEventListener('load', () => {
                if (!this.playing?.transcoded || !this.playing.offset) return;
                for (const cue of track.track.cues) { cue.startTime -= this.playing.offset; cue.endTime -= this.playing.offset; }
            }, { once: true });
        } catch {}
    }

    // Stop decoding: no src, load(), so the decoder is freed (§10.21 Energy).
    // keepStill leaves the last picture showing, as a frame's backdrop.
    release({ keepStill = false } = {}) {
        const video = this.video;
        if (!video) return;
        if (keepStill && video.videoWidth) {
            this.still.width = video.videoWidth;
            this.still.height = video.videoHeight;
            try { this.still.getContext('2d').drawImage(video, 0, 0); this.still.style.display = 'block'; } catch {}
        }
        video.pause();
        for (const track of video.querySelectorAll('track')) track.remove();
        if (this.trackUrl) URL.revokeObjectURL(this.trackUrl);
        this.trackUrl = null;
        video.removeAttribute('src');
        video.load();
        this.playing = null;
        this.cue = '';
    }

    // Poster mode: the item's picture, drifting slowly, then the next.
    showPoster(item, first) {
        this.release();
        this.video?.remove();
        this.video = null;
        this.set('poster');
        const poster = this.poster;
        poster.style.opacity = '0';
        poster.onerror = () => {
            if (!poster.src.includes('/Primary')) poster.src = JellyfinLogic.mediaUrl(this.server, this.api.image(item, 'Primary'), { android: this.host.kind === 'android', origin: location.origin });
        };
        poster.onload = () => {
            poster.style.transition = 'none';
            poster.style.transform = `scale(1.04) translate(${(Math.random() - 0.5) * 2}%, ${(Math.random() - 0.5) * 2}%)`;
            void poster.offsetWidth;
            poster.style.transition = 'opacity 1.2s, transform 170s linear';
            poster.style.opacity = '1';
            poster.style.transform = `scale(1.14) translate(${(Math.random() - 0.5) * 5}%, ${(Math.random() - 0.5) * 5}%)`;
        };
        poster.src = JellyfinLogic.mediaUrl(this.server, this.api.image(item, 'Backdrop'), { android: this.host.kind === 'android', origin: location.origin });
        this.titleUntil = performance.now() + 8000;
        if (!first) this.frameDef.transition?.('change', this.env());
        clearTimeout(this.posterTimer);
        this.posterTimer = this.later(() => this.advance(), JellyfinAnimationManager.POSTER_MS);
    }

    report(kind, paused = false) {
        if (!this.config.reportPlayback || !this.playing || !this.api) return;
        this.api.report(kind, { ...this.playing, seconds: this.position(), paused });
    }

    // ---- One tab at a time ---------------------------------------------------------

    claim() {
        if (document.hidden || this.state === 'demo') return;
        this.host.storage.set('claim', { tab: this.tab, at: Date.now() });
        if (this.state === 'away') this.set('loading');
    }

    // Another tab took playback: pause, keep the last frame, free the decoder.
    claimed(event) {
        if (event.key !== `wp:${this.host.id}:claim` || !event.newValue) return;
        let claim;
        try { claim = JSON.parse(event.newValue); } catch { return; }
        if (claim.tab === this.tab || !this.showing()) return;
        this.savePosition();
        this.release({ keepStill: true });
        clearTimeout(this.posterTimer);
        this.set('away');
    }

    // ---- Keys and taps --------------------------------------------------------------

    tap(x, y) {
        const b = this.badge;
        if (this.video && (this.muted && b && performance.now() < this.badgeUntil && Math.hypot(x - b.x - b.size / 2, y - b.y - b.size / 2) < b.size)) return this.toggleMute();
        if (this.video && this.soundAllowed === false && this.muted) return this.toggleMute();
    }

    togglePause() {
        if (this.state !== 'playing' || !this.video) return this.state === 'poster' ? 'Posters don’t pause' : null;
        this.userPaused = !this.userPaused;
        this.frameDef.transition?.(this.userPaused ? 'pause' : 'play', this.env());
        if (this.userPaused) { this.video.pause(); this.savePosition(); }
        else this.video.play().catch(() => {});
        this.report('progress', this.userPaused);
        this.dirty();
        return this.userPaused ? '⏸ Paused' : '▶ Playing';
    }

    toggleMute() {
        if (!this.video) return null;
        this.muted = !this.muted;
        this.video.muted = this.muted;
        if (!this.muted) {
            this.soundAllowed = true;
            this.video.volume = this.config.volume;
            if (this.video.paused && !this.userPaused) this.video.play().catch(() => {});
        }
        this.badgeUntil = this.muted ? performance.now() + 4000 : 0;
        this.dirty();
        return this.muted ? '🔇 Muted' : `🔊 Sound on (${Math.round(this.config.volume * 100)}%)`;
    }

    skip(step) {
        if (!this.signedIn()) return null;
        this.userPaused = false;
        this.advance(step);
        return step > 0 ? '⏭ Next' : '⏮ Previous';
    }

    seek(seconds) {
        if (!this.video || !this.playing || this.playing.transcoded) return this.playing?.transcoded ? 'Can’t seek a transcode here' : null;
        this.video.currentTime = Math.max(0, Math.min(this.video.duration || Infinity, this.video.currentTime + seconds));
        return `${seconds > 0 ? '⏩' : '⏪'} ${this.clock(this.position())}`;
    }

    cycleSubtitles() {
        if (!this.playing) return null;
        const choices = JellyfinLogic.subtitleChoices(this.playing.source.MediaStreams || []);
        const at = choices.findIndex(c => (c?.index ?? -1) === (this.subtitle?.index ?? -1));
        const next = choices[(at + 1) % choices.length];
        this.host.storage.set('subs', { ...(this.host.storage.get('subs') || {}), [this.item.Id]: next?.index ?? -1 });
        this.replay();
        return next ? `💬 ${next.title}` : '💬 Subtitles off';
    }

    showInfo() {
        if (!this.item) return null;
        this.infoUntil = performance.now() + 6000;
        this.dirty();
    }

    cycleFrame() {
        const ids = JellyfinFrames.list().map(frame => frame.id);
        const next = ids[(ids.indexOf(this.frameDef.id) + 1) % ids.length];
        this.config = { ...this.config, frame: next };
        WP.settings.save(this.config);
        this.pickFrame();
        this.resize();
        return `${this.frameDef.icon} ${this.frameDef.name}`;
    }

    clock(seconds) {
        const s = Math.max(0, Math.round(seconds));
        const hms = [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60];
        return (hms[0] ? `${hms[0]}:${String(hms[1]).padStart(2, '0')}` : `${hms[1]}`) + `:${String(hms[2]).padStart(2, '0')}`;
    }

    // The 'i' card: what's playing, and how.
    describe() {
        const p = this.playing, item = this.item;
        const lines = [JellyfinLogic.titleOf(item)];
        if (this.state === 'poster') return [...lines, 'Poster mode: no video while saving power'];
        if (!p) return lines;
        const total = (item.RunTimeTicks || 0) / 1e7;
        lines.push(`${this.clock(this.position())} of ${this.clock(total)}${p.end !== null ? ` · clip to ${this.clock(p.end)}` : ''}`);
        const v = this.video;
        lines.push(`${p.transcoded ? 'Transcoded by the server' : 'Direct play'}${v?.videoHeight ? ` · ${v.videoWidth}×${v.videoHeight}` : ''}`);
        lines.push(this.subtitle ? `Subtitles: ${JellyfinLogic.subtitleChoices(p.source.MediaStreams || []).find(c => c?.index === this.subtitle.index)?.title || 'on'}${this.subtitle.burn ? ' (burned in)' : ''}` : 'Subtitles: off');
        return lines;
    }
}
