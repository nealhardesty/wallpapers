// Neko: cats that chase the pointer (or a finger), then wash, yawn, scratch
// and nap; that bat a tossed ball of yarn about until it's gone; and that,
// with nobody about, roam, stalk each other and play tag. Behaviour and art
// after the classic Neko and oneko (SPEC §7.3, §10.24, THIRD_PARTY.md).
// The cat: the original public-domain Neko bitmaps (sprites.js), coloured
// per coat when the wallpaper starts. The bitmaps are 1-bit, ink and shape,
// so a coat is an ink colour, a fur colour and an optional pattern: tabby
// stripes, patches, or points on the parts furthest from the body (ears,
// paws, tail). Fur just above an outline is shaded, for a little roundness.
const NekoSprites = {
    SIZE: 32,
    PHASES: 8,      // rainbow fur flows through this many baked hues

    coats: {
        classic: { name: "Classic white", ink: "#141419", fur: "#fbfaf5" },
        black: { name: "Black", ink: "#9aa0ba", fur: "#363642" },
        orange: { name: "Orange tabby", ink: "#43220e", fur: "#f4a64e", stripe: "#d07a2c" },
        gray: { name: "Grey tabby", ink: "#202228", fur: "#a6acb4", stripe: "#7a808a" },
        calico: { name: "Calico", ink: "#28221e", fur: "#faf7ee", patch1: "#e8913a", patch2: "#5a5560" },
        tuxedo: { name: "Tuxedo", ink: "#8a90a6", fur: "#25252d", point: "#f4f4f0", pointBelow: true },
        siamese: { name: "Siamese", ink: "#3a281f", fur: "#f3e6d3", point: "#6e4c3a" },
        cow: { name: "Cow cat", ink: "#1c1c20", fur: "#fcfcfa", patch2: "#26262c" },
        // See-through, shadowless, and floating a little.
        ghost: { name: "Ghost", ink: "#c8dcff", fur: "#e6f0ff", inkAlpha: 0.85, furAlpha: 0.4, flat: true, ghost: true },
        // A glowing outline, baked once and pulsed (with the odd buzz).
        neon: { name: "Neon", ink: "#ff4fd8", fur: "#1a1226", glow: "#ff4fd8" },
        rainbow: { name: "Rainbow", ink: "#2a1d3a", fur: "#ffffff", rainbow: true, flat: true },
        galaxy: { name: "Galaxy", ink: "#a8b4ff", fur: "#2a2366", nebula: "#5a3aa0", deep: "#151240", stars: "#fff6c8" },
        gold: { name: "Lucky gold", ink: "#6a4410", fur: "#e9b93c", sheen: "#fff1a8" },
    },

    // Assorted hands these out in turn, starting somewhere new each day.
    ASSORTED: ['orange', 'classic', 'black', 'neon', 'calico', 'galaxy', 'gray', 'ghost', 'siamese', 'rainbow', 'tuxedo', 'gold', 'cow'],

    coatFor(choice, i, date) {
        if (choice !== 'assorted') return this.coats[choice] ? choice : 'classic';
        const day = Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate()) / 864e5);
        return this.ASSORTED[(i + day) % this.ASSORTED.length];
    },

    // One frame's bits as a 32x32 grid: 2 ink, 1 fur, 0 clear.
    decode([ink, shape]) {
        const a = Uint8Array.from(atob(ink), c => c.charCodeAt(0));
        const b = Uint8Array.from(atob(shape), c => c.charCodeAt(0));
        const grid = new Uint8Array(this.SIZE * this.SIZE);
        for (let i = 0; i < grid.length; i++) {
            const bit = 1 << (i & 7), byte = i >> 3;
            grid[i] = a[byte] & bit ? 2 : b[byte] & bit ? 1 : 0;
        }
        return grid;
    },

    hash: (i, j) => ((i * 73856093) ^ (j * 19349663)) >>> 0,

    // Smooth blotches for patched coats: value noise on an 8 px lattice.
    blotch(x, y) {
        const at = (i, j) => this.hash(i, j) % 1000 / 1000;
        const i = x >> 3, j = y >> 3, u = (x & 7) / 8, v = (y & 7) / 8;
        const top = at(i, j) * (1 - u) + at(i + 1, j) * u;
        const bottom = at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u;
        return top * (1 - v) + bottom * v;
    },

    rgb(hex) {
        const n = parseInt(hex.slice(1), 16);
        return [n >> 16, (n >> 8) & 255, n & 255];
    },

    hsl(h, s, l) {
        const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
        return [0, 8, 4].map(n => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))));
    },

    furColour(coat, x, y, far) {
        const blotch = this.blotch(x, y);
        if (coat.point && far) return coat.point;
        if (coat.stripe && (y + ((x >> 2) & 1)) % 4 === 0) return coat.stripe;
        if (coat.patch1 && blotch > 0.58) return coat.patch1;
        if (coat.patch2 && blotch < 0.28) return coat.patch2;
        if (coat.stars) return this.hash(x + 7, y + 3) % 31 === 0 ? coat.stars : blotch > 0.62 ? coat.nebula : blotch < 0.3 ? coat.deep : coat.fur;
        if (coat.sheen && (x - y + 64) % 11 < 2) return coat.sheen;
        return coat.fur;
    },

    paint(grid, coat, phase) {
        const S = this.SIZE;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = S;
        const ctx = canvas.getContext('2d');
        const image = ctx.createImageData(S, S);
        // The body's middle and reach, for points.
        let cx = 0, cy = 0, n = 0, reach = 0;
        grid.forEach((p, i) => { if (p) { cx += i % S; cy += (i / S) | 0; n++; } });
        cx /= n; cy /= n;
        grid.forEach((p, i) => { if (p) reach = Math.max(reach, Math.hypot(i % S - cx, ((i / S) | 0) - cy)); });
        const ink = this.rgb(coat.ink);
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
            const i = y * S + x, p = grid[i];
            if (!p) continue;
            let colour = ink, alpha = coat.inkAlpha ?? 1;
            if (p === 1) {
                alpha = coat.furAlpha ?? 1;
                const far = Math.hypot(x - cx, y - cy) > reach * 0.62 && (!coat.pointBelow || y > cy);
                colour = coat.rainbow ? this.hsl(((x + y) * 9 + phase * 360 / this.PHASES) % 360, 0.85, 0.64) : this.rgb(this.furColour(coat, x, y, far));
                if (!coat.flat && y + 1 < S && grid[i + S] !== 1) colour = colour.map(v => v * 0.86);
            }
            image.data.set([colour[0], colour[1], colour[2], alpha * 255], i * 4);
        }
        ctx.putImageData(image, 0, 0);
        return canvas;
    },

    // A neon outline's glow: the ink, blurred, at 3x with 4 px to spare.
    glow(grid, colour) {
        const S = this.SIZE, Z = 3, pad = 4;
        const ink = document.createElement('canvas');
        ink.width = ink.height = S * Z;
        const g = ink.getContext('2d');
        g.fillStyle = colour;
        grid.forEach((p, i) => { if (p === 2) g.fillRect((i % S) * Z, ((i / S) | 0) * Z, Z, Z); });
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = (S + 2 * pad) * Z;
        const ctx = canvas.getContext('2d');
        ctx.shadowColor = colour;
        ctx.shadowBlur = 5 * Z;
        ctx.drawImage(ink, pad * Z, pad * Z);
        ctx.drawImage(ink, pad * Z, pad * Z);
        return canvas;
    },

    // Every frame, by its oneko name, in the coat: { coat, frames: one set
    // per rainbow phase, glow }.
    build(coatName) {
        const coat = this.coats[coatName] || this.coats.classic;
        const grids = Object.fromEntries(Object.entries(NekoBitmaps).map(([name, bits]) => [name, this.decode(bits)]));
        const phases = coat.rainbow ? this.PHASES : 1;
        const frames = Array.from({ length: phases }, (_, phase) =>
            Object.fromEntries(Object.entries(grids).map(([name, grid]) => [name, this.paint(grid, coat, phase)])));
        const glow = coat.glow ? Object.fromEntries(Object.entries(grids).map(([name, grid]) => [name, this.glow(grid, coat.glow)])) : null;
        return { coat, frames, glow };
    },

    // A soft shadow for the cat to sit on, baked once.
    shadow() {
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 16;
        const ctx = canvas.getContext('2d');
        const glow = ctx.createRadialGradient(32, 8, 0, 32, 8, 32);
        glow.addColorStop(0, 'rgba(0,0,0,0.38)');
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.setTransform(1, 0, 0, 0.25, 0, 6);
        ctx.fillStyle = glow;
        ctx.fillRect(0, -24, 64, 64);
        return canvas;
    },

    // A 12 px ball of yarn in four turns: wound strands that move as it
    // rolls, light from the top left.
    ball(colour) {
        const base = this.rgb(colour), light = base.map(v => v + (255 - v) * 0.4), dark = base.map(v => v * 0.7);
        return [0, 1, 2, 3].map(turn => {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 12;
            const ctx = canvas.getContext('2d');
            const image = ctx.createImageData(12, 12);
            for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
                const dx = x - 5.5, dy = y - 5.5, d = Math.hypot(dx, dy);
                if (d > 5.8) continue;
                let c = d > 4.8 ? [20, 20, 25] : (x + y + turn) % 4 === 0 ? light : (x - y + 40 - turn) % 5 === 0 ? dark : base;
                if (d <= 4.8 && dx + dy > 3.5) c = c.map(v => v * 0.82);
                image.data.set([c[0], c[1], c[2], 255], (y * 12 + x) * 4);
            }
            ctx.putImageData(image, 0, 0);
            return canvas;
        });
    },
};

const NEKO = { STOP: 0, WASH: 1, SCRATCH: 2, MOVE: 3, CLAW: 4, YAWN: 5, SLEEP: 6, AWAKE: 7 };
// Directions run clockwise from up; claws go to the nearest wall.
const NEKO_DIRS = ['up', 'upright', 'right', 'dwright', 'down', 'dwleft', 'left', 'upleft'];
const NEKO_WALLS = ['u', 'r', 'r', 'r', 'd', 'l', 'l', 'l'];
const NEKO_YARN = ['#e04a5a', '#3a8ee0', '#f2b230', '#4cc06a', '#c060e0', '#ff7fb0'];
const NEKO_THREAD_MS = 12000;   // a thread on the floor fades over this long

class NekoAnimationManager {
    constructor(host) {
        this.host = host;
        this.canvas = null;
        this.ctx = null;
        this.isEnabled = false;
        this.animationId = null;
        this.lastTime = 0;
        this.time = 0;          // ms the wallpaper has run; every timer counts in it
        this.idling = false;
        this.pointer = { x: 0, y: 0, at: -Infinity, fresh: false };
        this.cats = [];
        this.yarns = [];
        this.threads = [];
        this.tossed = 0;
        this.looks = {};
        this.hats = {};
        this.balls = {};

        // Configuration
        this.config = WP.settings.load();
    }

    saveConfig() {
        WP.settings.save(this.config);
    }

    async init() {
        this.createCanvas();
        this.shadow = NekoSprites.shadow();
        this.listen();
        this.spawn();
        console.log('Neko animation manager initialized');
    }

    createCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'neko-canvas';
        this.canvas.style.position = 'fixed';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.pointerEvents = 'none';
        this.canvas.style.zIndex = '1000'; // Higher than background animations
        this.canvas.style.display = 'none';

        this.ctx = this.canvas.getContext('2d');
        // Disable smoothing for pixel-perfect sprites
        this.ctx.imageSmoothingEnabled = false;

        document.body.appendChild(this.canvas);

        this.resizeCanvas();
        this.onResize = () => this.resizeCanvas();
        window.addEventListener('resize', this.onResize);
    }

    resizeCanvas() {
        if (!this.canvas) return;
        // By devicePixelRatio, so the 32 px art scales in whole device
        // pixels more often (48 px on a 2x screen is exactly 3x).
        this.dpr = window.devicePixelRatio || 1;
        this.canvas.width = Math.round(window.innerWidth * this.dpr);
        this.canvas.height = Math.round(window.innerHeight * this.dpr);
        // Resizing resets the context, smoothing included: keep pixels crisp.
        this.ctx.imageSmoothingEnabled = false;
    }

    // Painted once per coat, hat and yarn colour, however many cats share it.
    look(coat) { return this.looks[coat] ||= NekoSprites.build(coat); }
    hatArt(name) { return this.hats[name] ||= NekoHats.build(name); }
    ballArt(colour) { return this.balls[colour] ||= NekoSprites.ball(colour); }

    listen() {
        // Pointer events, so a finger works as well as a mouse. Stamped on
        // the next frame: asleep, the clock only catches up then.
        const follow = (e) => { this.pointer = { x: e.clientX, y: e.clientY, at: this.time, fresh: true }; };
        this.listeners = [['pointermove', follow], ['pointerdown', follow]];
        for (const [type, fn] of this.listeners) document.addEventListener(type, fn);
        this.stopGestures = this.host.gestures({ tap: (x, y) => this.config.yarn && this.toss(x, y) });
    }

    // The family, gathered round the middle of the screen, each with its
    // coat, hat and pace, and not all on the same idle clock.
    spawn() {
        const size = this.config.size, today = this.host.now();
        const w = window.innerWidth, h = window.innerHeight - this.host.insets.bottom;
        this.cats = Array.from({ length: this.config.cats }, (_, i) => {
            const angle = i * 2.39996, reach = size * 0.9 * Math.sqrt(i);
            const hat = NekoHats.pick(this.config.hat, i, today);
            return this.clamp({
                id: i,
                look: this.look(NekoSprites.coatFor(this.config.coat, i, today)),
                hat: hat && this.hatArt(hat),
                x: w / 2 + Math.cos(angle) * reach,
                y: h / 2 + Math.sin(angle) * reach,
                state: NEKO.STOP,
                direction: 4,
                lastDirection: 4,
                animationFrame: i,
                animationTimer: 0,
                stateTimer: 0,
                goal: null,
                restSince: -Math.random() * this.config.idleTimeout,
                wanderAfter: this.wanderAfter(),
                pace: 0.9 + Math.random() * 0.2,
                phase: i,
                buzz: 0,
                swatting: false,
            });
        });
        this.yarns = [];
        this.threads = [];
    }

    wanderAfter() {
        return this.config.wanderAfter * (0.75 + Math.random() * 0.5);
    }

    start() {
        if (this.isEnabled) return;

        this.isEnabled = true;
        this.canvas.style.display = 'block';
        this.spawn();
        this.lastTime = 0;
        this.animate(0);
        console.log('Neko animation started');
    }

    stop() {
        if (!this.isEnabled) return;

        this.isEnabled = false;
        this.canvas.style.display = 'none';

        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        console.log('Neko animation stopped');
    }

    // dt: elapsed ms. Speeds and Animation Speed count in 60 fps frames,
    // the unit they were tuned in.
    update(dt) {
        this.time += dt;
        if (this.pointer.fresh) {
            this.pointer.at = this.time;
            this.pointer.fresh = false;
        }
        const frames = dt / 1000 * 60;
        this.updateYarns(dt / 1000);
        const recent = this.time - this.pointer.at < 1000;
        const chasing = this.chasers();
        this.cats.forEach((cat, i) => {
            this.think(cat, i, recent, chasing.get(cat));
            this.act(cat, frames);
        });
        this.separate();
        for (const cat of this.cats) this.animateCat(cat, frames, dt);
    }

    // What a cat is after: yarn above all, then the pointer, then its own
    // plans.
    think(cat, i, recent, yarn) {
        if (yarn) {
            if (cat.goal?.yarn !== yarn) cat.goal = { kind: 'yarn', yarn };
            return;
        }
        // The yarn's gone (or others are nearer it): back to idling, and the
        // one that sent it flying looks startled (did I do that?).
        if (cat.goal?.kind === 'yarn') return this.settle(cat, cat.goal.yarn.finalBy === cat ? NEKO.AWAKE : NEKO.STOP);
        if (recent) {
            cat.goal = { kind: 'pointer', slot: i };
            return;
        }
        // A hunter that tires washes, as if it had meant to all along.
        if (cat.goal?.kind === 'hunt' && this.time > cat.goal.until) return this.settle(cat, NEKO.WASH);
        if (!cat.goal && this.config.wander && this.time - cat.restSince > cat.wanderAfter) this.adventure(cat);
    }

    // Nobody about (the pointer has rested a while, or a phone has none):
    // off somewhere, or after another cat.
    adventure(cat) {
        const others = this.cats.filter(c => c !== cat);
        if (others.length && Math.random() < 0.6) {
            const prey = others[Math.floor(Math.random() * others.length)];
            cat.goal = { kind: 'hunt', prey, until: this.time + 3000 + Math.random() * 4000 };
        } else {
            cat.goal = { kind: 'roam', ...this.spot(cat) };
        }
    }

    // A spot of the cat's own, a good run away when there's room for one.
    spot(cat) {
        const size = this.config.size;
        const w = window.innerWidth, h = window.innerHeight - this.host.insets.bottom;
        let x = w / 2, y = h / 2;
        for (let i = 0; i < 6; i++) {
            x = size + Math.random() * Math.max(0, w - 2 * size);
            y = size + Math.random() * Math.max(0, h - 2 * size);
            if (Math.hypot(x - cat.x, y - cat.y) > Math.min(w, h) / 3) break;
        }
        return { x, y };
    }

    settle(cat, state = NEKO.STOP) {
        cat.goal = null;
        cat.state = state;
        cat.stateTimer = 0;
        cat.swatting = false;
        cat.restSince = this.time;
        cat.wanderAfter = this.wanderAfter();
    }

    become(cat, state) {
        if (cat.state === state) return;
        cat.state = state;
        cat.stateTimer = 0;
    }

    // Places round the pointer, ring by ring, so a crowd doesn't pile up.
    slot(i) {
        if (i === 0) return { x: 0, y: 0 };
        let ring = 1, first = 1;
        while (i >= first + ring * 6) {
            first += ring * 6;
            ring++;
        }
        const angle = (i - first) / (ring * 6) * Math.PI * 2 + ring * 0.5;
        const r = this.config.size * 0.75 * ring;
        return { x: Math.cos(angle) * r, y: Math.sin(angle) * r * 0.8 };
    }

    // Where the goal is, and how close counts as there.
    target(cat) {
        const goal = cat.goal, size = this.config.size;
        switch (goal.kind) {
            case 'yarn': return { x: goal.yarn.x, y: goal.yarn.y - size * 0.3, reach: size * 0.3 };
            case 'pointer': {
                const slot = this.slot(goal.slot);
                return { x: this.pointer.x + slot.x, y: this.pointer.y + slot.y, reach: size * 0.2 };
            }
            case 'hunt': return { x: goal.prey.x, y: goal.prey.y, reach: size * 0.8 };
            default: return { x: goal.x, y: goal.y, reach: size * 0.15 };
        }
    }

    act(cat, frames) {
        cat.stateTimer += frames;
        if (!cat.goal) return this.idleChain(cat);
        const t = this.target(cat);
        const dx = t.x - cat.x, dy = t.y - cat.y, distance = Math.hypot(dx, dy);
        // Once there, it takes more than a nudge to set the cat off again.
        const reach = cat.state === NEKO.MOVE || cat.goal.kind === 'hunt' ? t.reach : t.reach * 2.5;
        if (distance > reach) this.run(cat, dx, dy, distance, frames);
        else this.arrive(cat);
    }

    run(cat, dx, dy, distance, frames) {
        // Startled awake first, as in oneko; a swat finishes before the
        // chase goes on.
        if (cat.state === NEKO.SLEEP) return this.become(cat, NEKO.AWAKE);
        if (cat.state === NEKO.AWAKE && cat.stateTimer < 30) return;
        if (cat.swatting && cat.stateTimer < 20) return;
        cat.swatting = false;

        const size = this.config.size, kind = cat.goal.kind;
        let speed = this.config.speed * cat.pace;
        if (kind === 'hunt') speed *= distance > size * 3 ? 0.55 : 1.3;   // stalk, then pounce
        if (kind === 'flee') speed *= 1.2;
        const step = Math.min(speed * frames, distance);
        const x = cat.x + dx / distance * step, y = cat.y + dy / distance * step;
        cat.direction = this.calculateDirection(dx, dy);
        cat.lastDirection = cat.direction;
        const wall = this.wall(x, y);
        cat.x = x;
        cat.y = y;
        this.clamp(cat);
        // Against the edge of the screen with what it wants beyond: claw at
        // the wall, as oneko does.
        if (wall >= 0) {
            cat.lastDirection = wall;
            return this.become(cat, NEKO.CLAW);
        }
        this.become(cat, NEKO.MOVE);
    }

    arrive(cat) {
        const goal = cat.goal;
        switch (goal.kind) {
            case 'yarn': return this.bat(cat, goal.yarn);
            case 'pointer': {
                // At the pointer: claw at it or scratch, while it's about.
                if (this.time - this.pointer.at > this.config.idleTimeout) return this.settle(cat);
                if ((cat.state === NEKO.CLAW || cat.state === NEKO.SCRATCH) && cat.stateTimer < 60) return;
                const dx = this.pointer.x - cat.x, dy = this.pointer.y - cat.y;
                if (Math.hypot(dx, dy) > 4) cat.lastDirection = this.calculateDirection(dx, dy);
                cat.state = Math.random() < 0.5 ? NEKO.CLAW : NEKO.SCRATCH;
                cat.stateTimer = 0;
                return;
            }
            case 'hunt': return this.tag(cat, goal.prey);
            default: return this.settle(cat);   // roamed, or got away
        }
    }

    // Tag: the prey bolts (startled awake, if it was napping), the hunter
    // swipes, and keeps after it until it tires.
    tag(hunter, prey) {
        if (prey.goal?.kind === 'flee' && prey.goal.from === hunter) return;
        const away = Math.atan2(prey.y - hunter.y, prey.x - hunter.x) + (Math.random() - 0.5) * 1.2;
        const run = Math.min(window.innerWidth, window.innerHeight) * (0.3 + Math.random() * 0.2);
        prey.goal = { kind: 'flee', from: hunter, ...this.inside(prey.x + Math.cos(away) * run, prey.y + Math.sin(away) * run) };
        if (prey.state !== NEKO.MOVE) this.become(prey, NEKO.AWAKE);
        hunter.lastDirection = this.calculateDirection(prey.x - hunter.x, prey.y - hunter.y);
        hunter.state = NEKO.CLAW;
        hunter.stateTimer = 0;
        hunter.swatting = true;
    }

    calculateDirection(dx, dy) {
        // Eight directions, clockwise from up, each 45° wide.
        const angle = (Math.atan2(dy, dx) * 180 / Math.PI + 450) % 360;
        return Math.round(angle / 45) % 8;
    }

    // Which screen edge (x, y) is past, as a direction, or -1.
    wall(x, y) {
        const half = this.config.size / 2;
        if (x < half) return 6;
        if (x > window.innerWidth - half) return 2;
        if (y < half) return 0;
        if (y > window.innerHeight - this.host.insets.bottom - half) return 4;
        return -1;
    }

    // On screen, above any navigation bar.
    clamp(cat) {
        Object.assign(cat, this.inside(cat.x, cat.y, this.config.size / 2));
        return cat;
    }

    inside(x, y, margin = this.config.size) {
        const w = window.innerWidth, h = window.innerHeight - this.host.insets.bottom;
        return { x: Math.max(margin, Math.min(w - margin, x)), y: Math.max(margin, Math.min(h - margin, y)) };
    }

    // With nothing to chase: sit; wash, yawn or scratch now and then once
    // the pointer has rested a while; then sleep.
    idleChain(cat) {
        const rest = this.time - cat.restSince;
        const ends = { [NEKO.MOVE]: 0, [NEKO.AWAKE]: 30, [NEKO.CLAW]: 60, [NEKO.SCRATCH]: 60, [NEKO.YAWN]: 90, [NEKO.WASH]: 120 };
        if (cat.state in ends) {
            if (cat.stateTimer > ends[cat.state]) this.become(cat, NEKO.STOP);
            return;
        }
        if (rest > this.config.sleepTimeout) return this.become(cat, NEKO.SLEEP);
        if (rest > this.config.idleTimeout && cat.state === NEKO.STOP && cat.stateTimer > 120) {
            cat.state = [NEKO.STOP, NEKO.WASH, NEKO.YAWN, NEKO.SCRATCH][Math.floor(Math.random() * 4)];
            cat.stateTimer = 0;
        }
    }

    // Nobody stands on anybody: overlapping cats ease apart, a runner more
    // than a sitter, so a crowd flows round a sleeping cat.
    separate() {
        const cats = this.cats, min = this.config.size * 0.6;
        for (let i = 0; i < cats.length; i++) {
            for (let j = i + 1; j < cats.length; j++) {
                const a = cats[i], b = cats[j];
                let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
                if (d >= min) continue;
                if (d < 0.01) {
                    dx = Math.random() - 0.5;
                    dy = Math.random() - 0.5;
                    d = Math.hypot(dx, dy);
                }
                const wa = a.state === NEKO.MOVE ? 1 : 0.2, wb = b.state === NEKO.MOVE ? 1 : 0.2;
                const push = (min - d) / d / (wa + wb) * 0.5;
                a.x -= dx * push * wa;
                a.y -= dy * push * wa;
                b.x += dx * push * wb;
                b.y += dy * push * wb;
            }
        }
        for (const cat of cats) this.clamp(cat);
    }

    animateCat(cat, frames, dt) {
        cat.animationTimer += frames;
        // Asleep, slow breaths, like the classic Neko: a quarter of the pace
        const every = this.config.animationSpeed * (cat.state === NEKO.SLEEP ? 4 : 1);
        if (cat.animationTimer >= every) {
            cat.animationFrame++;
            cat.animationTimer = 0;
        }
        if (cat.state === NEKO.SLEEP) return;
        cat.phase += dt / 140;
        if (cat.look.glow && Math.random() < dt * 0.0003) cat.buzz = this.time + 60 + Math.random() * 120;
    }

    // Yarn: a tap tosses a ball; every cat goes for the nearest. A swat
    // sends it rolling (and bouncing off the edges), unravelling a thread
    // behind it, until one swat too many sends it off the screen for good.
    toss(x, y) {
        if (this.yarns.length >= 3) this.yarns.shift().gone = true;
        const colour = NEKO_YARN[this.tossed++ % NEKO_YARN.length];
        const angle = Math.random() * Math.PI * 2, speed = this.config.size * (0.5 + Math.random());
        const yarn = {
            x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, roll: 0,
            art: this.ballArt(colour), hits: 0, last: 3 + Math.floor(Math.random() * 5),
            cool: 0, escaping: false, gone: false, finalBy: null,
        };
        yarn.thread = { colour, yarn, points: [{ x, y, at: this.time }] };
        this.yarns.push(yarn);
        this.threads.push(yarn.thread);
    }

    // Who goes for each ball: the four nearest, a cat already after it
    // counting as three lengths nearer so the pack doesn't flicker. The
    // rest watch (or sleep on), so a crowd doesn't bury the ball.
    chasers() {
        const chasing = new Map();
        for (const yarn of this.yarns) {
            const keen = cat => Math.hypot(yarn.x - cat.x, yarn.y - cat.y) - (cat.goal?.yarn === yarn ? this.config.size * 3 : 0);
            const ranked = this.cats.map(cat => [cat, keen(cat)]).sort((a, b) => a[1] - b[1]);
            for (const [cat] of ranked.slice(0, 4)) if (!chasing.has(cat)) chasing.set(cat, yarn);
        }
        return chasing;
    }

    bat(cat, yarn) {
        if (cat.swatting && cat.stateTimer < 20) return;
        // Flying, or just hit: watch it.
        if (yarn.escaping || yarn.cool > 0) return this.become(cat, NEKO.STOP);
        const size = this.config.size, dx = yarn.x - cat.x, dy = yarn.y - (cat.y + size * 0.3);
        let angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.6;
        let speed = size * (3 + Math.random() * 4);
        yarn.hits++;
        yarn.cool = 0.3;
        if (yarn.hits >= yarn.last) {
            // The big one: off toward the nearest edge, too fast to come back.
            const w = window.innerWidth, h = window.innerHeight - this.host.insets.bottom;
            const edges = [[yarn.x, Math.PI], [w - yarn.x, 0], [yarn.y, -Math.PI / 2], [h - yarn.y, Math.PI / 2]].sort((a, b) => a[0] - b[0]);
            angle = edges[0][1] + (Math.random() - 0.5) * 0.8;
            speed = Math.max(w, h) * 1.4;
            yarn.escaping = true;
            yarn.finalBy = cat;
        }
        yarn.vx = Math.cos(angle) * speed;
        yarn.vy = Math.sin(angle) * speed;
        cat.lastDirection = this.calculateDirection(dx, dy);
        cat.state = NEKO.CLAW;
        cat.stateTimer = 0;
        cat.swatting = true;
    }

    // s: elapsed seconds.
    updateYarns(s) {
        const half = this.config.size * 6 / 32, margin = half * 4;
        const w = window.innerWidth, h = window.innerHeight - this.host.insets.bottom;
        for (const yarn of this.yarns) {
            yarn.cool -= s;
            yarn.x += yarn.vx * s;
            yarn.y += yarn.vy * s;
            const drag = Math.exp(-(yarn.escaping ? 0.2 : 1.5) * s);
            yarn.vx *= drag;
            yarn.vy *= drag;
            yarn.roll += Math.hypot(yarn.vx, yarn.vy) * s;
            if (yarn.escaping) {
                if (yarn.x < -margin || yarn.x > w + margin || yarn.y < -margin || yarn.y > window.innerHeight + margin) yarn.gone = true;
            } else {
                // Off the edges, losing some pace.
                if (yarn.x < half) { yarn.x = half; yarn.vx = Math.abs(yarn.vx) * 0.6; }
                if (yarn.x > w - half) { yarn.x = w - half; yarn.vx = -Math.abs(yarn.vx) * 0.6; }
                if (yarn.y < half) { yarn.y = half; yarn.vy = Math.abs(yarn.vy) * 0.6; }
                if (yarn.y > h - half) { yarn.y = h - half; yarn.vy = -Math.abs(yarn.vy) * 0.6; }
            }
            // It unravels as it goes, a little wobbly, like thread.
            const points = yarn.thread.points, last = points[points.length - 1];
            if (!last || Math.hypot(yarn.x - last.x, yarn.y - last.y) > 6) {
                points.push({ x: yarn.x + (Math.random() - 0.5) * 3, y: yarn.y + (Math.random() - 0.5) * 3, at: this.time });
                if (points.length > 240) points.shift();
            }
        }
        this.yarns = this.yarns.filter(yarn => !yarn.gone);
        for (const thread of this.threads) {
            while (thread.points.length && this.time - thread.points[0].at > NEKO_THREAD_MS) thread.points.shift();
        }
        this.threads = this.threads.filter(thread => !thread.yarn.gone || thread.points.length > 1);
    }

    // The frame for what the cat is doing, by oneko's names (sprites.js).
    frameName(cat) {
        const frame = cat.animationFrame % 2;
        const pick = (a, b) => frame === 0 ? a : b;
        switch (cat.state) {
            case NEKO.MOVE: {
                const dir = NEKO_DIRS[cat.direction];
                return pick(`${dir}1`, `${dir}2`);
            }
            case NEKO.CLAW: {
                const wall = NEKO_WALLS[cat.lastDirection];
                return pick(`${wall}togi1`, `${wall}togi2`);
            }
            case NEKO.SCRATCH: return pick('kaki1', 'kaki2');
            case NEKO.WASH: return pick('jare2', 'mati2');
            case NEKO.YAWN: return pick('mati2', 'mati3');
            case NEKO.SLEEP: return pick('sleep1', 'sleep2');
            case NEKO.AWAKE: return 'awake';
            default: return 'mati2';
        }
    }

    draw() {
        const ctx = this.ctx, d = this.dpr;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // In device pixels, snapped, so every art pixel is the same size.
        const size = Math.round(this.config.size * d), px = size / 32;
        this.drawThreads(d, px);

        // Nearer the bottom is nearer the viewer: drawn later.
        const feet = thing => thing.look ? thing.y + this.config.size * 0.4 : thing.y + this.config.size * 0.15;
        const things = [...this.cats, ...this.yarns].sort((a, b) => feet(a) - feet(b));
        ctx.imageSmoothingEnabled = true;   // the shadows are soft; the art isn't
        for (const thing of things) {
            if (thing.look?.coat.ghost) continue;   // ghosts cast none
            const w = thing.look ? size * 0.76 : px * 11, x = thing.x * d, y = thing.look ? thing.y * d + size * 0.33 : thing.y * d + px * 4;
            ctx.drawImage(this.shadow, x - w / 2, y, w, w / 4);
        }
        ctx.imageSmoothingEnabled = false;
        for (const thing of things) {
            if (thing.look) this.drawCat(thing, d, size, px);
            else this.drawYarn(thing, d, px);
        }
    }

    drawCat(cat, d, size, px) {
        const ctx = this.ctx, name = this.frameName(cat), look = cat.look;
        const sprite = look.frames[Math.floor(cat.phase) % look.frames.length][name];
        const float = look.coat.ghost ? -px * (2 + (cat.state === NEKO.SLEEP ? 0 : 1.5 * Math.sin(this.time / 450 + cat.id))) : 0;
        const left = Math.round(cat.x * d - size / 2), top = Math.round(cat.y * d - size / 2 + float);
        if (look.glow) {
            const glow = size * 40 / 32;
            ctx.imageSmoothingEnabled = true;
            ctx.globalAlpha = cat.state === NEKO.SLEEP ? 0.6 : this.time < cat.buzz ? 0.15 : 0.75 + 0.25 * Math.sin(this.time / 260 + cat.id * 1.7);
            ctx.drawImage(look.glow[name], left - (glow - size) / 2, top - (glow - size) / 2, glow, glow);
            ctx.globalAlpha = 1;
            ctx.imageSmoothingEnabled = false;
        }
        ctx.drawImage(sprite, left, top, size, size);
        if (cat.hat) this.drawHat(cat, name, left, top, px);
    }

    // On the head, wherever the frame has it, mirrored facing left; a
    // propeller spins while its cat runs.
    drawHat(cat, name, left, top, px) {
        const [hx, hy, facing] = NekoHats.anchors[name], hat = cat.hat, mirror = facing < 0;
        const frames = mirror ? hat.left : hat.right;
        const art = frames[cat.state === NEKO.MOVE ? cat.animationFrame % frames.length : 0];
        const x = Math.round(hx - (mirror ? hat.width - 1 - hat.ax : hat.ax)), y = hy - hat.height + hat.sink;
        this.ctx.drawImage(art, left + Math.round(x * px), top + Math.round(y * px), Math.round(hat.width * px), Math.round(hat.height * px));
    }

    drawYarn(yarn, d, px) {
        const size = Math.round(px * 12), turn = Math.floor(yarn.roll / (this.config.size * 0.12)) % 4;
        this.ctx.drawImage(yarn.art[turn], Math.round(yarn.x * d - size / 2), Math.round(yarn.y * d - size / 2), size, size);
    }

    // Threads on the floor, fading from their far ends, still tied to
    // their balls.
    drawThreads(d, px) {
        const ctx = this.ctx, drop = px * 3;
        ctx.lineWidth = Math.max(1, px);
        ctx.lineCap = ctx.lineJoin = 'round';
        for (const thread of this.threads) {
            const points = thread.points;
            if (!thread.yarn.gone) points.push({ x: thread.yarn.x, y: thread.yarn.y, at: this.time });
            ctx.strokeStyle = thread.colour;
            for (let i = 0; i < points.length - 1; i += 8) {
                const run = points.slice(i, i + 9);
                ctx.globalAlpha = Math.max(0, 1 - (this.time - run[0].at) / NEKO_THREAD_MS) * 0.9;
                ctx.beginPath();
                run.forEach((p, k) => k ? ctx.lineTo(p.x * d, p.y * d + drop) : ctx.moveTo(p.x * d, p.y * d + drop));
                ctx.stroke();
            }
            if (!thread.yarn.gone) points.pop();
        }
        ctx.globalAlpha = 1;
    }

    // Everyone asleep, nothing rolling: how long nothing will change, the
    // next breath or the next cat off on an adventure.
    restingFor() {
        if (this.yarns.length || this.threads.length || this.cats.some(cat => cat.state !== NEKO.SLEEP)) return 0;
        const every = this.config.animationSpeed * 4;
        let ms = Infinity;
        for (const cat of this.cats) {
            ms = Math.min(ms, (every - cat.animationTimer) / 60 * 1000);
            if (this.config.wander) ms = Math.min(ms, cat.restSince + cat.wanderAfter - this.time);
        }
        return Math.max(0, ms);
    }

    animate(now) {
        if (!this.isEnabled) return;

        // By elapsed time, so every frame rate runs at the same pace;
        // clamped, so a long pause doesn't jump. Except after a nap the
        // stage was asked to skip: that gap is time that really passed.
        const elapsed = this.lastTime ? now - this.lastTime : 0;
        this.lastTime = now;
        this.update(this.idling ? Math.min(elapsed, 60000) : Math.min(elapsed, 100));
        this.draw();

        // A pointer wakes the stage early, and the cats with it.
        const resting = this.restingFor();
        this.idling = resting > 20;
        if (this.idling) this.host.idleUntil(resting);

        this.animationId = requestAnimationFrame(time => this.animate(time));
    }

    destroy() {
        this.stop();
        for (const [type, fn] of this.listeners || []) document.removeEventListener(type, fn);
        this.stopGestures?.();
        window.removeEventListener('resize', this.onResize);
        if (this.canvas) {
            document.body.removeChild(this.canvas);
        }
    }
}
