// Wiki Pond (SPEC §10.19): every edit to Wikipedia, live, as a ripple on a
// dark pond. The ring's size is the size of the change (rings grow outwards
// for additions and draw inwards for removals); its colour says who made it;
// a new article opens as a lotus. Inspired by Hatnote's Listen to Wikipedia.
//
// The stream is Wikimedia's EventStreams (server-sent events, keyless). It
// stays open while the wallpaper shows, so it closes on stop() and while the
// stage is paused (onPause/onResume), and on Android it listens in bursts.
// Offline, the pond stays quiet: rain ripples and a small note, reconnecting
// with backoff.

class WikiPondAnimationManager {
    static PALETTES = {
        moonlit: { user: '#e6efff', anon: '#8fe3b0', temp: '#f0d38a', bot: '#b49cff', petal: [255, 214, 228] },
        koi: { user: '#ffe2c2', anon: '#ff9a6b', temp: '#ffd166', bot: '#7cc8ff', petal: [255, 196, 170] },
        lotus: { user: '#ffd1e0', anon: '#c9f2c7', temp: '#ffe6a8', bot: '#c7b6ff', petal: [255, 206, 226] },
        mono: { user: '#dfe6ef', anon: '#c4ccd6', temp: '#c4ccd6', bot: '#98a3b2', petal: [236, 240, 246] },
    };
    static RAIN = '#7d97a8';
    static BURST_ON = 30000;     // ms listening in a burst
    static BURST_OFF = 90000;    // ms resting between bursts
    static MAX_RATE = 8;         // ripples a second at most, at full density

    constructor(host) {
        this.host = host;
        this.config = WP.settings.load();
        this.running = false;
        this.frame = this.frame.bind(this);
        this.onResize = () => this.resize();
        this.ripples = [];
        this.free = [];
        this.lotuses = [];
        this.titles = [];
        this.queue = [];
        this.source = null;
        this.status = 'idle';      // connecting, live, offline, resting, paused, demo
        this.failures = 0;
        this.retry = null;
        this.stats = { events: 0, shown: 0, connects: 0 };
        this.nextRain = 0;
        this.budget = 0;
    }

    // ---- Lifecycle ------------------------------------------------------------

    start() {
        if (this.running) return;
        this.running = true;
        const canvas = this.canvas = document.createElement('canvas');
        canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none';
        document.body.appendChild(canvas);
        this.ctx = canvas.getContext('2d');
        this.note = document.createElement('div');
        this.note.style.cssText = `position:fixed;left:18px;bottom:${this.host.insets.bottom + 16}px;pointer-events:none;
            font:12px/1.5 ui-rounded,system-ui,sans-serif;color:rgba(170,200,205,.6);letter-spacing:.03em;
            transition:opacity 1.2s;opacity:0`;
        document.body.appendChild(this.note);
        window.addEventListener('resize', this.onResize);
        this.unlock = () => this.audio?.resume?.();
        window.addEventListener('pointerdown', this.unlock);
        window.addEventListener('keydown', this.unlock);
        this.resize();
        this.seed();
        this.last = null;
        this.raf = requestAnimationFrame(this.frame);
        if (this.config.sound) this.startAudio();
        if (this.host.params.thumb) this.status = 'demo';
        else if (!WP.stage?.paused) this.listen();
        this.showNote();
    }

    stop() {
        this.running = false;
        cancelAnimationFrame(this.raf);
        this.close();
        clearTimeout(this.retry);
        window.removeEventListener('resize', this.onResize);
        window.removeEventListener('pointerdown', this.unlock);
        window.removeEventListener('keydown', this.unlock);
        this.audio?.close?.();
        this.audio = null;
        this.canvas?.remove();
        this.note?.remove();
        this.canvas = this.ctx = this.note = null;
    }

    // The stage paused (hidden, or the power policy): close the stream; the
    // radio sleeps until we're back.
    onPause() {
        this.close();
        clearTimeout(this.retry);
        if (this.status !== 'demo') this.status = 'paused';
    }

    onResume() {
        if (this.running && this.status !== 'demo') this.listen();
    }

    applySettings(config) {
        const before = this.config;
        this.config = config;
        if (config.palette !== before.palette) this.lotusSprite = null;
        if (JSON.stringify(config.wikis) !== JSON.stringify(before.wikis)) {
            this.layoutClusters();
            this.queue.length = 0;
        }
        if (config.sound && !this.audio) this.startAudio();
        if (!config.sound && this.audio) { this.audio.close?.(); this.audio = null; }
        if (config.listen !== before.listen && this.status !== 'demo' && !WP.stage?.paused) {
            this.close();
            this.listen();
        }
        this.showNote();
    }

    onQuality() {}   // density is read as ripples are made; nothing to rebuild

    // ---- The stream ---------------------------------------------------------------

    bursts() {
        return this.config.listen === 'bursts' || (this.config.listen === 'auto' && this.host.kind === 'android');
    }

    // Open the stream (or note when the next burst begins).
    listen() {
        clearTimeout(this.retry);
        if (!this.running || this.source || WP.stage?.paused) return;
        const now = performance.now();
        if (this.bursts()) {
            if (this.restUntil && now < this.restUntil) { this.status = 'resting'; return; }
            this.burstEnd = now + WikiPondAnimationManager.BURST_ON;
            this.restUntil = 0;
        }
        this.status = this.stats.events ? 'connecting' : this.status === 'offline' ? 'offline' : 'connecting';
        let source;
        try { source = new EventSource(WikiPondEvents.STREAM); } catch { return this.failed(false); }
        this.source = source;
        this.stats.connects++;
        let opened = false;
        source.onopen = () => {
            opened = true;
            this.failures = 0;
            this.status = 'live';
            this.heard = performance.now();
            this.showNote();
        };
        source.onmessage = message => this.receive(message.data);
        source.onerror = () => {
            if (this.source !== source) return;
            this.close();
            this.failed(opened);
        };
    }

    close() {
        if (!this.source) return;
        this.source.onopen = this.source.onmessage = this.source.onerror = null;
        this.source.close();
        this.source = null;
    }

    // The stream ended or never came: try again, soon after a working one
    // ends, backing off while it keeps failing.
    failed(worked) {
        this.failures = worked ? 0 : this.failures + 1;
        if (!worked) this.status = 'offline';
        const delay = WikiPondEvents.backoff(this.failures) * (0.8 + Math.random() * 0.4);
        this.retry = setTimeout(() => this.listen(), delay);
        this.showNote();
    }

    receive(data) {
        this.heard = performance.now();
        const event = WikiPondEvents.read(WikiPondEvents.parse(data), { wikis: this.wikis(), bots: this.config.bots });
        if (!event) return;
        this.stats.events++;
        if (this.status !== 'live') { this.status = 'live'; this.showNote(); }
        // Arrivals come in clumps; spread them a little. A queue that
        // overflows (every wiki at once) drops its oldest plain edits.
        event.at = performance.now() + Math.random() * 450;
        this.queue.push(event);
        if (this.queue.length > 400) {
            const i = this.queue.findIndex(e => e.kind === 'edit');
            this.queue.splice(i < 0 ? 0 : i, 1);
        }
    }

    wikis() {
        return this.config.wikis?.length ? this.config.wikis : ['enwiki'];
    }

    // Each frame: bursts open and close, a silent stream is reopened, and
    // queued edits are let out onto the pond at a steady pace.
    pump(now, dt) {
        const K = WikiPondAnimationManager;
        if (this.bursts() && this.status !== 'demo' && !WP.stage?.paused) {
            if (this.source && this.burstEnd && now > this.burstEnd) {
                this.close();
                this.restUntil = now + K.BURST_OFF;
                this.status = 'resting';
                this.showNote();
            } else if (!this.source && this.status === 'resting' && now >= this.restUntil) {
                this.listen();
            }
        }
        // A stream that has gone quiet for 45 s is reopened.
        if (this.source && this.status === 'live' && now - this.heard > 45000) {
            this.close();
            this.failed(true);
        }
        if (this.status === 'demo') this.demo(now, dt);

        const cap = K.MAX_RATE * (0.4 + 0.6 * this.host.quality.density);
        this.budget = Math.min(cap, this.budget + dt * cap);
        if (this.bursts() && this.queue.length) {
            // Spread what a burst heard over the time until the next one ends.
            const left = Math.max(5000, (this.restUntil || this.burstEnd + K.BURST_OFF) - now + K.BURST_ON);
            this.spread = (this.spread || 0) + dt * this.queue.length * 1000 / left;
            while (this.spread >= 1 && this.queue.length && this.budget >= 1) {
                this.spread--;
                this.budget--;
                this.show(this.queue.shift());
            }
        } else {
            while (this.queue.length && this.queue[0].at <= now) {
                const event = this.queue.shift();
                if (this.budget >= 1 || event.kind !== 'edit') {
                    this.budget--;
                    this.show(event);
                }
            }
        }
    }

    // Thumbnails and the panel's previews never touch the network: they
    // play made-up edits, so the tile shows what the pond looks like.
    demo(now, dt) {
        this.nextDemo = (this.nextDemo ?? 0) - dt;
        if (this.nextDemo > 0) return;
        this.nextDemo = 0.12 + Math.random() * 0.5;
        const roll = Math.random();
        const kind = roll < 0.03 ? 'new' : roll < 0.05 ? 'account' : 'edit';
        const delta = Math.round((Math.random() < 0.7 ? 1 : -1) * Math.exp(Math.random() * 8));
        const who = ['user', 'user', 'user', 'anon', 'temp', 'bot'][Math.floor(Math.random() * 6)];
        this.show({ kind, wiki: 'enwiki', who, delta, size: Math.min(1, Math.log2(1 + Math.abs(delta)) / 15.6), title: '' });
    }

    // ---- The pond ---------------------------------------------------------------------

    resize() {
        if (!this.canvas) return;
        const dpr = this.dpr = Math.min(window.devicePixelRatio || 1, 3);
        const W = this.W = innerWidth, H = this.H = innerHeight;
        this.canvas.width = Math.round(W * dpr);
        this.canvas.height = Math.round(H * dpr);
        this.unit = Math.min(W, H) / 800;
        this.layoutClusters();
        this.buildPond();
        this.lotusSprite = null;
    }

    // Where each wiki's edits land: one spread over the pond, or several
    // gathered in clusters around it.
    layoutClusters() {
        const wikis = this.wikis().filter(w => w !== '*');
        this.clusters = {};
        if (wikis.length < 2 || this.wikis().includes('*')) return;
        const { W, H } = this;
        wikis.forEach((wiki, i) => {
            const a = -Math.PI / 2 + i * Math.PI * 2 / wikis.length;
            this.clusters[wiki] = { x: W / 2 + Math.cos(a) * W * 0.28, y: H * 0.52 + Math.sin(a) * H * 0.26 };
        });
    }

    // Perspective: the pond is seen at a slant, so things lower on the
    // screen are nearer and larger.
    near(y) {
        return 0.65 + 0.6 * Math.max(0, Math.min(1, y / this.H));
    }

    buildPond() {
        const { W, H, dpr } = this;
        const c = this.pond = document.createElement('canvas');
        c.width = Math.round(W * dpr);
        c.height = Math.round(H * dpr);
        const g = c.getContext('2d');
        g.scale(dpr, dpr);
        // Deep water, lighter where the sky reflects towards the far bank.
        const water = g.createLinearGradient(0, 0, 0, H);
        water.addColorStop(0, '#0d2328');
        water.addColorStop(0.45, '#071518');
        water.addColorStop(1, '#03090b');
        g.fillStyle = water;
        g.fillRect(0, 0, W, H);
        const sheen = g.createRadialGradient(W * 0.62, H * 0.12, 0, W * 0.62, H * 0.12, Math.max(W, H) * 0.7);
        sheen.addColorStop(0, 'rgba(70,110,120,0.22)');
        sheen.addColorStop(1, 'rgba(70,110,120,0)');
        g.fillStyle = sheen;
        g.fillRect(0, 0, W, H);
        // Stars reflected in the still water: sparse, faint, flattened.
        for (let i = 0; i < W * H / 9000; i++) {
            const x = Math.random() * W, y = Math.random() * H;
            g.fillStyle = `rgba(190,215,225,${(0.08 + Math.random() * 0.25) * (1 - y / H * 0.6)})`;
            g.fillRect(x, y, 1.4, 0.8);
        }
        // Lily pads, mostly towards the banks.
        const u = this.unit;
        this.pads = [];
        const count = Math.round(9 + W * H / 90000);
        for (let i = 0; i < count; i++) {
            const edge = Math.random() < 0.75;
            const x = edge ? (Math.random() < 0.5 ? Math.random() * W * 0.22 : W - Math.random() * W * 0.22) : Math.random() * W;
            const y = Math.random() * H;
            const r = (16 + Math.random() * 30) * u * this.near(y);
            this.pads.push({ x, y, r });
            this.paintPad(g, x, y, r, Math.random() * Math.PI * 2);
            // Little ones clustered beside it.
            if (Math.random() < 0.6) this.paintPad(g, x + (Math.random() - 0.5) * r * 3, y + (Math.random() - 0.5) * r * 1.4, r * (0.35 + Math.random() * 0.3), Math.random() * 6);
        }
        // The banks: dark reeds at the bottom corners, a shadowed far edge.
        const shade = g.createLinearGradient(0, 0, 0, H * 0.12);
        shade.addColorStop(0, 'rgba(0,0,0,0.55)');
        shade.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = shade;
        g.fillRect(0, 0, W, H * 0.12);
        g.strokeStyle = '#020506';
        g.lineCap = 'round';
        for (const side of [0, 1]) {
            for (let i = 0; i < 26; i++) {
                const x0 = side ? W - Math.random() * W * 0.16 : Math.random() * W * 0.16;
                const h = (60 + Math.random() * 160) * u;
                const lean = (side ? -1 : 1) * (10 + Math.random() * 40) * u;
                g.lineWidth = (2 + Math.random() * 3) * u;
                g.beginPath();
                g.moveTo(x0, H + 4);
                g.quadraticCurveTo(x0 + lean * 0.2, H - h * 0.6, x0 + lean, H - h);
                g.stroke();
            }
        }
        const vignette = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.6);
        vignette.addColorStop(0, 'rgba(0,0,0,0)');
        vignette.addColorStop(1, 'rgba(0,0,0,0.5)');
        g.fillStyle = vignette;
        g.fillRect(0, 0, W, H);
    }

    paintPad(g, x, y, r, turn) {
        g.save();
        g.translate(x, y);
        g.scale(1, 0.55);
        g.rotate(turn);
        const leaf = g.createRadialGradient(-r * 0.2, -r * 0.2, r * 0.1, 0, 0, r);
        leaf.addColorStop(0, '#1d4433');
        leaf.addColorStop(1, '#0c2219');
        g.fillStyle = leaf;
        g.beginPath();
        g.moveTo(0, 0);
        g.arc(0, 0, r, 0.22, Math.PI * 2 - 0.05);
        g.closePath();
        g.fill();
        g.strokeStyle = 'rgba(120,170,140,0.18)';
        g.lineWidth = 1;
        g.beginPath();
        g.arc(0, 0, r - 0.5, 0.22, Math.PI * 2 - 0.05);
        g.stroke();
        g.strokeStyle = 'rgba(0,0,0,0.25)';
        for (let i = 1; i < 8; i++) {
            const a = 0.22 + i * (Math.PI * 2 - 0.27) / 8;
            g.beginPath();
            g.moveTo(0, 0);
            g.lineTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9);
            g.stroke();
        }
        g.restore();
    }

    glowSprite(colour) {
        this.glows = this.glows || {};
        if (this.glows[colour]) return this.glows[colour];
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        const g = c.getContext('2d');
        const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, colour);
        grad.addColorStop(0.2, colour + 'aa');
        grad.addColorStop(1, colour + '00');
        g.fillStyle = grad;
        g.fillRect(0, 0, 64, 64);
        return this.glows[colour] = c;
    }

    // A quiet pond on the first frame: a few rings already spreading.
    seed() {
        for (let i = 0; i < 7; i++) this.rain(Math.random() * 2.5);
        if (this.host.params.thumb) {
            for (let i = 0; i < 14; i++) {
                this.demo(0, 1);
                this.ripples[this.ripples.length - 1].age = Math.random() * 4;
            }
            this.show({ kind: 'new', wiki: 'enwiki', who: 'user', delta: 4000, size: 0.6, title: '' });
            this.lotuses[0].age = 6;
            this.lotuses[0].x = this.W * 0.66;
            this.lotuses[0].y = this.H * 0.62;
        }
    }

    // ---- Things on the water ---------------------------------------------------------------

    place(event) {
        const cluster = this.clusters[event.wiki];
        if (cluster) {
            const spread = Math.min(this.W, this.H) * 0.11;
            const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.4;
            return { x: cluster.x + gauss() * spread * 1.4, y: cluster.y + gauss() * spread * 0.8 };
        }
        return { x: this.W * (0.06 + Math.random() * 0.88), y: this.H * (0.08 + Math.random() * 0.86) };
    }

    ripple(x, y, props) {
        const r = this.free.pop() || {};
        Object.assign(r, { x, y, age: 0, inward: false, label: '', ...props });
        this.ripples.push(r);
        // The pool never grows past its cap: the oldest give way.
        const cap = Math.round(60 + 140 * this.host.quality.density);
        while (this.ripples.length > cap) this.free.push(this.ripples.shift());
        return r;
    }

    rain(age = 0) {
        const x = Math.random() * this.W, y = Math.random() * this.H;
        this.ripple(x, y, { colour: WikiPondAnimationManager.RAIN, radius: (10 + Math.random() * 18) * this.unit * this.near(y), life: 3.4, rings: Math.random() < 0.4 ? 2 : 1, strength: 0.5, age });
    }

    show(event) {
        const palette = WikiPondAnimationManager.PALETTES[this.config.palette] || WikiPondAnimationManager.PALETTES.moonlit;
        const { x, y } = this.place(event);
        const near = this.near(y), u = this.unit;
        this.stats.shown++;
        this.lastEdit = performance.now();
        const colour = palette[event.who] || palette.user;
        if (event.kind === 'new') {
            if (this.lotuses.length >= 10) this.lotuses.shift();
            this.lotuses.push({ x, y, age: 0, life: 120, size: (32 + 18 * event.size) * u * near, turn: Math.random() * Math.PI, title: event.title, bob: Math.random() * 6 });
            this.ripple(x, y, { colour, radius: 90 * u * near, life: 6, rings: 3, strength: 0.8 });
        } else if (event.kind === 'account') {
            this.ripple(x, y, { colour: palette.temp, radius: 40 * u * near, life: 4, rings: 2, strength: 0.6, bell: true });
        } else {
            const radius = (14 + 150 * event.size) * u * near;
            this.ripple(x, y, {
                colour, radius, life: 3.2 + 4.5 * event.size, rings: event.size > 0.55 ? 3 : event.size > 0.25 ? 2 : 1,
                strength: 0.55 + 0.4 * event.size, inward: event.delta < 0,
            });
        }
        if (this.config.titles && event.title) {
            if (this.titles.length >= 5) this.titles.shift();
            this.titles.push({ x: x + 14 * u, y, text: event.title, colour, age: 0 });
        }
        if (this.audio) this.play(event);
    }

    // ---- Each frame -------------------------------------------------------------------------

    frame(now) {
        if (!this.running) return;
        this.raf = requestAnimationFrame(this.frame);
        if (this.last === null) this.last = now;
        const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
        this.last = now;
        this.pump(performance.now(), dt);
        // With no edits for a while (offline, resting, or a quiet wiki), rain.
        this.nextRain -= dt;
        const quiet = !this.lastEdit || performance.now() - this.lastEdit > 6000;
        if (quiet && this.nextRain <= 0) {
            this.rain();
            this.nextRain = (0.35 + Math.random() * 1.2) / (0.5 + 0.5 * this.host.quality.density);
        }
        this.draw(dt);
    }

    draw(dt) {
        const ctx = this.ctx, dpr = this.dpr;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.drawImage(this.pond, 0, 0);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.drawLotuses(ctx, dt);
        this.drawRipples(ctx, dt);
        this.drawTitles(ctx, dt);
        ctx.globalAlpha = 1;
    }

    drawRipples(ctx, dt) {
        const ripples = this.ripples;
        ctx.lineCap = 'round';
        for (let i = ripples.length - 1; i >= 0; i--) {
            const r = ripples[i];
            r.age += dt;
            if (r.age > r.life + r.rings * 0.35) {
                this.free.push(r);
                ripples.splice(i, 1);
                continue;
            }
            ctx.strokeStyle = r.colour;
            for (let j = 0; j < r.rings; j++) {
                const x = Math.min(1, Math.max(0, (r.age - j * 0.35) / r.life));
                if (x <= 0 || x >= 1) continue;
                const eased = 1 - (1 - x) * (1 - x);
                const radius = r.inward ? r.radius * (1 - eased) + 2 : r.radius * eased + 1;
                ctx.globalAlpha = r.strength * Math.pow(1 - x, 1.5) * (1 - j * 0.25);
                ctx.lineWidth = Math.max(0.6, (1.6 - j * 0.35) * this.near(r.y) * (r.inward ? 0.8 + x : 1.4 - x * 0.8));
                ctx.beginPath();
                ctx.ellipse(r.x, r.y, radius, radius * 0.5, 0, 0, Math.PI * 2);
                ctx.stroke();
            }
            // The drop itself: a brief glow where the edit landed.
            if (r.age < 0.7 && r.colour !== WikiPondAnimationManager.RAIN) {
                const s = (10 + r.radius * 0.25) * (1 - r.age / 0.7 * 0.5);
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = (1 - r.age / 0.7) * 0.8;
                ctx.drawImage(this.glowSprite(r.colour), r.x - s, r.y - s * 0.6, s * 2, s * 1.2);
                ctx.globalCompositeOperation = 'source-over';
            }
        }
    }

    // ---- Lotuses ---------------------------------------------------------------------------------

    // A lotus at `open` (0 bud to 1 open), centred on 0,0, `size` across.
    paintLotus(g, size, open, palette) {
        const [r, gr, b] = palette.petal;
        // Its pad.
        g.save();
        g.scale(1, 0.5);
        g.fillStyle = '#123425';
        g.beginPath();
        g.moveTo(0, 0);
        g.arc(0, 0, size * 1.25, 0.3, Math.PI * 2 - 0.1);
        g.closePath();
        g.fill();
        g.restore();
        // Petals in three rings, outer ones opening widest; drawn back to front.
        const rings = [[9, 1, 0.2], [7, 0.8, 0.5], [5, 0.55, 0.85]];
        for (const [count, length, inner] of rings) {
            for (let k = 0; k < count; k++) {
                const a = k * Math.PI * 2 / count + inner;
                const spread = (0.15 + 0.85 * open) * (1 - inner * 0.45);
                const L = size * length;
                const tipX = Math.cos(a) * L * spread, tipY = Math.sin(a) * L * spread * 0.5 - L * (1 - spread) * 0.9;
                const w = L * 0.32;
                const nx = -Math.sin(a) * w, ny = Math.cos(a) * w * 0.5;
                const shade = 0.7 + 0.3 * Math.sin(a) * open + inner * 0.25;
                g.fillStyle = `rgba(${Math.min(255, r * shade) | 0},${Math.min(255, gr * shade) | 0},${Math.min(255, b * shade) | 0},0.92)`;
                g.beginPath();
                g.moveTo(0, -size * 0.05);
                g.quadraticCurveTo(tipX * 0.5 + nx, tipY * 0.5 + ny, tipX, tipY);
                g.quadraticCurveTo(tipX * 0.5 - nx, tipY * 0.5 - ny, 0, -size * 0.05);
                g.fill();
            }
        }
        // The golden heart.
        g.fillStyle = `rgba(255,214,120,${0.4 + 0.6 * open})`;
        g.beginPath();
        g.ellipse(0, -size * 0.12, size * 0.14 * open + 1, size * 0.08 * open + 0.5, 0, 0, Math.PI * 2);
        g.fill();
    }

    drawLotuses(ctx, dt) {
        const palette = WikiPondAnimationManager.PALETTES[this.config.palette] || WikiPondAnimationManager.PALETTES.moonlit;
        // An open lotus is drawn from one baked sprite; only opening ones
        // are painted petal by petal.
        if (!this.lotusSprite) {
            const S = 128, c = document.createElement('canvas');
            c.width = c.height = S * 2;
            const g = c.getContext('2d');
            g.translate(S, S * 1.1);
            this.paintLotus(g, S * 0.62, 1, palette);
            this.lotusSprite = c;
        }
        for (let i = this.lotuses.length - 1; i >= 0; i--) {
            const lotus = this.lotuses[i];
            lotus.age += dt;
            const fade = Math.min(1, (lotus.life - lotus.age) / 6);
            if (fade <= 0) { this.lotuses.splice(i, 1); continue; }
            const open = Math.min(1, lotus.age / 4);
            const bob = Math.sin(lotus.age * 0.8 + lotus.bob) * 1.2;
            ctx.globalAlpha = fade * Math.min(1, lotus.age * 2);
            // A soft glow on the water beneath it.
            ctx.globalCompositeOperation = 'lighter';
            const glow = lotus.size * 2.4;
            ctx.globalAlpha *= 0.35;
            ctx.drawImage(this.glowSprite('#ffcfe0'), lotus.x - glow, lotus.y - glow * 0.45, glow * 2, glow * 0.9);
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = fade * Math.min(1, lotus.age * 2);
            if (open < 1) {
                ctx.save();
                ctx.translate(lotus.x, lotus.y + bob);
                this.paintLotus(ctx, lotus.size, 1 - Math.pow(1 - open, 3), palette);
                ctx.restore();
            } else {
                const s = lotus.size / (128 * 0.62) * 128;
                ctx.drawImage(this.lotusSprite, lotus.x - s, lotus.y + bob - s * 1.1, s * 2, s * 2);
            }
        }
        ctx.globalAlpha = 1;
    }

    drawTitles(ctx, dt) {
        if (!this.titles.length) return;
        ctx.font = `500 ${Math.round(12 + 2 * this.unit)}px ui-rounded, system-ui, sans-serif`;
        ctx.textBaseline = 'middle';
        for (let i = this.titles.length - 1; i >= 0; i--) {
            const t = this.titles[i];
            t.age += dt;
            if (t.age > 5) { this.titles.splice(i, 1); continue; }
            ctx.globalAlpha = Math.min(1, t.age * 2, (5 - t.age) / 1.5) * 0.75;
            ctx.fillStyle = t.colour;
            ctx.fillText(t.text, t.x, t.y - t.age * 3);   // fillText: plain text, never markup
        }
    }

    // ---- The note in the corner -------------------------------------------------------------------

    showNote() {
        if (!this.note) return;
        let text = '';
        if (this.status === 'offline') text = 'Waiting for edits… the pond will wake when the connection is back.';
        else if (this.status === 'connecting' && !this.stats.events) text = 'Waiting for edits…';
        this.note.textContent = text;
        this.note.style.opacity = text ? '1' : '0';
    }

    // ---- Sound (off by default) -----------------------------------------------------------------------

    startAudio() {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (!Context || this.host.params.thumb) return;
        this.audio = new Context();
        this.master = this.audio.createGain();
        this.master.gain.value = 0.07;
        this.master.connect(this.audio.destination);
        this.notes = 0;
        this.noteWindow = 0;
    }

    // A soft plucked note: higher for small edits, lower for big ones, a
    // darker tone for removals, a bell for a new account. At most a few a
    // second, so a busy wiki doesn't chatter.
    play(event) {
        const audio = this.audio;
        if (!audio || audio.state !== 'running') return;
        const now = audio.currentTime;
        if (now - this.noteWindow > 1) { this.noteWindow = now; this.notes = 0; }
        if (++this.notes > 4) return;
        const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];   // pentatonic steps
        const step = scale[Math.max(0, Math.min(scale.length - 1, Math.round((1 - event.size) * (scale.length - 1))))];
        const base = event.kind === 'account' ? 880 : event.delta < 0 ? 196 : 262;
        const freq = base * 2 ** (step / 12);
        const partials = event.kind === 'account' ? [[1, 0.6], [2.76, 0.25], [5.4, 0.1]] : event.kind === 'new' ? [[1, 0.6], [1.5, 0.35], [2, 0.2]] : [[1, 0.7], [2, 0.18]];
        const decay = event.kind === 'account' ? 2.4 : 1.2 + event.size;
        for (const [ratio, level] of partials) {
            const osc = audio.createOscillator(), gain = audio.createGain();
            osc.type = event.delta < 0 && event.kind === 'edit' ? 'triangle' : 'sine';
            osc.frequency.value = freq * ratio;
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(level, now + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);
            osc.connect(gain).connect(this.master);
            osc.start(now);
            osc.stop(now + decay + 0.05);
        }
    }
}
