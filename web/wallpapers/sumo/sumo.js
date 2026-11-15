// Sumo Championship (SPEC §10.35): a tournament that never ends, as a
// woodblock print that moves. Sixteen wrestlers with invented ring names
// meet over fifteen days; each bout is short and decided by its own small
// physics (sumo-logic.js); the cup is given, the ranking sheet rewritten,
// and the next tournament begins. The league lives in host.storage, and
// only moves on while the wallpaper is on screen.
//
//   sumo-logic.js   wrestlers, bouts, the tournament (pure, unit-tested)
//   sumo-art.js     the hall, the figures, the lettering
//   sumo.js         this: the manager that stages it
//
// Cheap: the hall is one cached canvas; each frame draws it, three figures
// and a few marks.

const SUMO_PACE = { relaxed: 1.35, normal: 1, brisk: 0.62 };
// How long each part of a bout takes at the normal pace, seconds.
const SUMO_TIMES = { card: 2.6, enter: 1.5, salt: 1.4, stomp: 2.6, crouch: 1.6, result: 3.0, leave: 1.1, board: 6.5, ceremony: 8, news: 9 };
// What comes with the cup: as announced, and in English.
const SUMO_PRIZES = [['梅干し一年分', 'a year of pickled plums'], ['醤油一樽', 'a barrel of soy sauce'], ['牛一頭（目録のみ）', 'a cow, on paper'], ['煎餅四百枚', 'four hundred rice crackers'],
    ['特大の柄杓', 'a ladle of ceremonial size'], ['巨大椎茸', 'a very large mushroom'], ['蕎麦一年分', 'a year of noodles'], ['柿一箱', 'a crate of persimmons'],
    ['子供ほどの急須', 'a teapot the size of a child'], ['米俵一俵', 'a bale of rice as big as he is']];

class SumoAnimationManager {
    constructor(host) {
        this.host = host;
        this.config = WP.settings.load();
        this.isRunning = false;
        this.animationId = null;
        this.lastTime = 0;
        this.clock = 0;              // seconds since the start, for small motions
        this.acc = 0;                // time owed to the bout's fixed steps
        this.shake = 0;
        this.puffs = [];
        this.cushions = [];
        this.peek = 0;               // seconds the ranking sheet is held up for (B)
        this.onResize = () => this.resize();
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        const canvas = this.canvas = document.createElement('canvas');
        Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: '-1', pointerEvents: 'none' });
        document.body.appendChild(canvas);
        this.ctx = canvas.getContext('2d');
        // Written in Japanese wherever the device has the letters for it; in Roman letters where it hasn't.
        this.kanji = SumoArt.hasKanji();
        window.addEventListener('resize', this.onResize);
        const saved = this.host.params.thumb ? null : this.host.storage.get('world');
        this.world = saved && saved.v === 1 && saved.roster?.length === SumoLogic.SIZE ? saved : SumoLogic.newWorld(Math.random);
        this.resize();
        // Already in the ring on the first frame: crouched at the lines, about to go.
        this.stage('crouch');
        this.phaseTime = SUMO_TIMES.crouch * 0.55 * this.pace;
        if (!this.host.params.thumb) this.stopGestures = this.host.gestures({ tap: (x, y) => { if (this.config.touch) this.throwCushion(x, y); } });
        this.update(0);
        this.draw();
        this.animationId = requestAnimationFrame(t => this.frame(t));
    }

    stop() {
        this.isRunning = false;
        cancelAnimationFrame(this.animationId);
        window.removeEventListener('resize', this.onResize);
        this.stopGestures?.();
        this.canvas?.remove();
        this.canvas = null;
    }

    get pace() { return SUMO_PACE[this.config.pace] || 1; }
    get evening() {
        if (this.config.look !== 'auto') return this.config.look === 'evening';
        const hour = this.host.now().getHours();
        return hour >= 18 || hour < 6;
    }

    save() { if (!this.host.params.thumb) this.host.storage.set('world', this.world); }

    applySettings(config) {
        this.config = config;
        this.backdrop = null;
    }

    onQuality() { this.backdrop = null; }

    onAction(name) {
        if (name !== 'reset') return;
        this.world = SumoLogic.newWorld(Math.random);
        this.save();
        this.stage('card');
        this.host.toast('A new league is founded');
    }

    resize() {
        if (!this.canvas) return;
        const dpr = window.devicePixelRatio || 1, w = this.width = window.innerWidth, h = this.height = window.innerHeight;
        this.canvas.width = Math.round(w * dpr);
        this.canvas.height = Math.round(h * dpr);
        this.dpr = dpr;
        const safe = h - (this.host.insets?.bottom || 0), portrait = h > w * 1.1;
        const R = Math.min(w * (portrait ? 0.33 : 0.3), safe * 0.3), cy = safe * (portrait ? 0.7 : 0.66), s = R * (portrait ? 0.86 : 0.72);
        const roofH = R * 0.4;
        this.G = {
            w, h, safe, portrait, cx: w / 2, cy, R, ry: R * 0.2, s,
            platform: { rx: R * 1.32, ry: R * 0.27, drop: R * 0.22 },
            roof: { w: R * 2.5, h: roofH, y: Math.max(h * 0.012, cy - s * 1.22 - roofH * 1.9) },
            font: Math.max(11, Math.min(20, Math.min(w, h) * 0.024)),
        };
        this.backdrop = null;
    }

    // ---- Staging ------------------------------------------------------------------

    // Begin a phase. With no bout on the card yet, find the next one.
    stage(phase) {
        this.phase = phase;
        this.phaseTime = 0;
        if (phase === 'card' || phase === 'enter' || (phase === 'crouch' && !this.card)) {
            if (!this.card) {
                this.card = SumoLogic.nextBout(this.world);
                if (!this.card) return this.stage('ceremony');
                const actor = (w, home) => ({ w, home, x: home * 1.8, y: 0, face: -home, pose: { arms: 'down' }, jolt: 0, hop: 0 });
                this.east = actor(this.card.east, -1);
                this.west = actor(this.card.west, 1);
                this.bout = null;
                this.said = null;
                this.point = 0;
                this.robe = (this.world.day + (this.card.index || 0)) % 5;
            }
        }
        if (phase === 'ceremony') {
            const champ = SumoLogic.byId(this.world, this.world.champion), rec = SumoLogic.record(this.world, champ.id);
            this.east = { w: champ, home: 0, x: 0, y: 0, face: 1, pose: { arms: 'cup', glad: true }, jolt: 0, hop: 0 };
            this.west = null;
            this.point = 0;
            const prize = SUMO_PRIZES[(this.world.basho * 7 + champ.id) % SUMO_PRIZES.length], english = `${champ.romaji} takes the cup, ${rec.w} wins to ${rec.l}, and with it ${prize[1]}`;
            this.said = this.kanji ? [[`優勝　${champ.name}`, 1.2], [`${rec.w}勝${rec.l}敗　副賞　${prize[0]}`, 0.85, 400], ...(this.config.gloss ? [[english, 0.62, 400]] : [])]
                : [[`${champ.romaji} takes the cup, ${rec.w} wins to ${rec.l}`, 1], [`and with it ${prize[1]}`, 0.78, 400]];
            this.season = SumoLogic.season(this.world);
        }
    }

    duration(phase) {
        const ritual = this.config.ritual || (this.card?.last && phase !== 'stomp');
        if ((phase === 'salt' || phase === 'stomp') && !ritual) return 0;
        return SUMO_TIMES[phase] * (phase === 'board' || phase === 'news' || phase === 'ceremony' ? 1 : this.pace);
    }

    // What follows a phase that has run its time.
    after(phase) {
        const world = this.world;
        if (phase === 'card') return 'enter';
        if (phase === 'enter') return 'salt';
        if (phase === 'salt') return 'stomp';
        if (phase === 'stomp') return 'crouch';
        if (phase === 'crouch') return 'fight';
        if (phase === 'result') return 'leave';
        if (phase === 'leave') {
            this.card = null;
            if (world.champion != null) return 'ceremony';
            if (world.bout === 0 && !world.playoff) return 'board';         // a day is done
            if (world.playoff && !this.playoffShown) { this.playoffShown = true; return 'board'; }
            return 'enter';
        }
        if (phase === 'board') return 'card';
        if (phase === 'ceremony') {
            this.news = SumoLogic.nextBasho(world, Math.random);
            this.playoffShown = false;
            this.save();
            return 'news';
        }
        return 'card';
    }

    // ---- Keys and taps (declared in the catalog) ---------------------------------------
    skip() {
        if (this.phase === 'fight') { while (!this.bout.done && this.bout.t < 120) SumoLogic.boutStep(this.bout); return 'To the finish'; }
        this.phaseTime = Infinity;
        return 'On with it';
    }
    showSheet() { this.peek = this.peek > 0 ? 0 : 7; }

    throwCushion(x, y) {
        if (this.host.reducedMotion) return;
        const G = this.G;
        this.cushions.push({ x, y, vx: (G.cx - x) * (0.7 + Math.random() * 0.5), vy: -G.R * (1.2 + Math.random()), turn: Math.random() * 6, spin: 4 + Math.random() * 5, life: 0, color: (Math.random() * 5) | 0, s: G.s * 0.13 });
        if (this.cushions.length > 60) this.cushions.shift();
    }

    // ---- A frame ---------------------------------------------------------------------
    frame(now) {
        if (!this.isRunning) return;
        const dt = Math.min(Math.max(now - (this.lastTime || now), 0), 100) / 1000;
        this.lastTime = now;
        this.update(dt);
        this.draw();
        this.animationId = requestAnimationFrame(t => this.frame(t));
    }

    update(dt) {
        this.clock += dt;
        this.shake = Math.max(0, this.shake - dt * 3);
        for (const p of this.puffs) p.age += dt / p.life;
        this.puffs = this.puffs.filter(p => p.age < 1);
        const G = this.G;
        for (const c of this.cushions) {
            c.life += dt;
            c.vy += G.R * 2.6 * dt;
            c.x += c.vx * dt;
            c.y += c.vy * dt;
            c.turn += c.spin * dt;
        }
        this.cushions = this.cushions.filter(c => c.y < G.h + 40 && c.life < 4);
        if (this.peek > 0) { this.peek -= dt; return; }   // the sheet is up: the hall waits

        this.phaseTime += dt;
        if (this.phase === 'fight') this.fight(dt);
        else {
            const long = this.duration(this.phase);
            if (this.phaseTime >= long) {
                const next = this.after(this.phase);
                this.stage(next);
                if (next === 'fight') this.bout = SumoLogic.boutStart(this.east.w, this.west.w, Math.random), this.events = 0, this.acc = 0;
            } else this.pose(this.phase, long ? this.phaseTime / long : 1);
        }
    }

    ease(q) { return q < 0.5 ? 2 * q * q : 1 - (-2 * q + 2) ** 2 / 2; }

    dust(x, y = 0, r = 0.16, color = '#c9ab7a') {
        this.puffs.push({ x, y, r, age: 0, life: 0.7, color });
    }

    // The ritual before, and the bows after: each actor's pose from how far the phase has got.
    pose(phase, q) {
        const e = this.ease(q);
        for (const a of [this.east, this.west]) {
            if (!a) continue;
            const p = a.pose, first = a.home < 0;
            if (phase === 'card') { a.x = a.home * 1.8; } else if (phase === 'enter') {
                a.x = a.home * (1.8 - e * 1.0);
                a.face = -a.home;
                Object.assign(p, { arms: 'down', squat: 0, stride: this.clock * 9, lean: 0.04, lift: 0, glad: false, fierce: false, spin: 0 });
            } else if (phase === 'salt') {
                const mine = Math.max(0, Math.min(1, first ? q * 1.6 : q * 1.6 - 0.6));
                Object.assign(p, { arms: 'salt', reach: Math.sin(Math.PI * mine), stride: 0 });
                if (mine > 0.5 && !a.salted) { a.salted = true; this.dust(a.x - a.home * 0.42, -0.62, 0.3, '#fbf7ec'); }
            } else if (phase === 'stomp') {
                // East, then west: the far leg up and out, held, and down hard.
                const mine = Math.max(0, Math.min(1, first ? q * 2 : q * 2 - 1)), up = Math.sin(Math.PI * Math.min(1, mine * 1.15)) ** 0.7;
                Object.assign(p, { arms: 'fists', lift: mine < 0.87 ? up : 0, squat: 0.25 + 0.2 * up, reach: 0 });
                if (mine >= 0.87 && !a.stomped) { a.stomped = true; this.dust(a.x + a.home * 0.2, 0, 0.22); this.shake = 1; }
            } else if (phase === 'crouch') {
                a.x = a.home * (0.8 - this.ease(Math.min(1, q * 1.7)) * (0.8 - 0.42));
                Object.assign(p, { arms: q > 0.55 ? 'fists' : 'down', squat: this.ease(Math.min(1, q * 1.4)) * 0.9, stride: q < 0.6 ? this.clock * 8 : 0, lift: 0, fierce: true, lean: 0.05, blink: q > 0.7 && (this.clock * 3 + a.home) % 2 < 0.12 });
                a.salted = a.stomped = false;
            } else if (phase === 'result') this.aftermath(a, q);
            else if (phase === 'leave') {
                if (a.w === this.bout?.loser) continue;
                a.from ??= a.x;
                a.x = a.from + (a.home || 1) * 1.1 * e;
                a.face = a.home || 1;
                Object.assign(p, { arms: 'down', squat: 0, stride: this.clock * 9, lean: 0.04, spin: 0 });
            } else if (phase === 'ceremony') Object.assign(p, { arms: 'cup', glad: true, squat: 0.05 + 0.04 * Math.sin(this.clock * 2.4) });
        }
    }

    // The bout itself: the logic's fixed steps, and what they look like.
    fight(dt) {
        const b = this.bout;
        this.acc += dt;
        while (this.acc >= SumoLogic.STEP && !b.done) { SumoLogic.boutStep(b); this.acc -= SumoLogic.STEP; }
        for (; this.events < b.events.length; this.events++) {
            const ev = b.events[this.events], who = ev.who === this.east.w.id ? this.east : this.west;
            if (ev.type === 'clash') { this.shake = 1; this.dust(b.c, -0.45, 0.2, '#fbf7ec'); } else if (ev.type === 'hit' || ev.type === 'slapped') who.jolt = 0.16;
            else if (ev.type === 'swapped' || ev.type === 'henka' || ev.type === 'dodged') who.hop = 0.4;
        }
        for (const [a, s] of [[this.east, b.a], [this.west, b.b]]) {
            a.x = s.x + s.dir * 0.09;        // drawn a little apart, so two big men read as two
            a.face = s.turned > 0 ? s.dir : -s.dir;
            a.jolt = Math.max(0, a.jolt - dt);
            a.hop = Math.max(0, a.hop - dt);
            a.y = -Math.sin(Math.PI * a.hop / 0.4) * 0.12;
            const gripped = b.grip !== 0, moving = Math.abs(b.v) > 0.03;
            const arms = b.phase === 'charge' ? 'push' : s.move === 'thrust' ? 'thrust' : s.move === 'throw' || s.move === 'grip' || gripped ? 'grip' : s.move === 'pull' ? 'up' : 'push';
            Object.assign(a.pose, {
                arms, reach: 0.5 + 0.5 * Math.sin(b.t * 22 + (a.home > 0 ? 2 : 0)), fierce: true, blink: false, lift: 0, spin: 0,
                squat: b.phase === 'charge' ? 0.6 : 0.32 + (s.move === 'brace' ? 0.22 : 0) + (1 - s.poise) * 0.12,
                lean: (b.phase === 'charge' ? 0.22 : 0.06 + 0.08 * s.effort) - (a.jolt > 0 ? 0.3 : 0) - (s.move === 'pull' ? 0.28 : 0) - (1 - s.poise) * (b.v * s.dir > 0 ? 0.25 : 0),
                stride: moving ? b.t * 14 : 0,
            });
        }
        if (b.done) {
            const world = this.world, winner = b.winner, loser = b.loser;
            const wi = SumoLogic.indexOf(world, winner.id), li = SumoLogic.indexOf(world, loser.id);
            const upset = loser.yokozuna || wi - li >= 7;
            const notes = SumoLogic.result(world, winner, loser);
            this.save();
            this.point = winner === this.east.w ? -1 : 1;
            const kim = SumoLogic.KIMARITE[b.kimarite], note = notes[0], jp = this.kanji, gloss = this.config.gloss || !jp, lines = [];
            const decided = world.champion != null;
            if (jp) {
                lines.push([`${winner.name}の勝ち`, 1.15], [`決まり手　${kim[0]}${b.henka ? '（立合い変化）' : ''}`, 0.9, 400]);
                if (note?.type === 'star') lines.push([`金星！　${note.who.name}、横綱を破る`, 0.9]);
                else if (note?.type === 'streak') lines.push([`${note.who.name}　${SumoLogic.numeral(note.n)}連勝`, 0.9]);
                else if (note?.type === 'winning') lines.push([`${note.who.name}　勝ち越し`, 0.9]);
                else if (note?.type === 'losing') lines.push([`${note.who.name}　負け越し`, 0.9]);
                else if (decided) lines.push([this.card.playoff ? '優勝決定戦、決着' : '優勝決定', 0.9]);
            }
            if (gloss) {
                const k = jp ? 0.62 : 1;
                lines.push([`${winner.romaji} wins by ${b.kimarite} (${kim[1]}${b.henka ? ', after a sidestep at the charge' : ''})`, k, jp ? 400 : 600]);
                const small = jp ? 0.62 : 0.78;
                if (note?.type === 'star') lines.push([`A gold star for ${note.who.romaji}: he has beaten a grand champion`, small, 400]);
                else if (note?.type === 'streak') lines.push([`That is ${note.n} wins running for ${note.who.romaji}`, small, 400]);
                else if (note?.type === 'winning') lines.push([`Eight wins: ${note.who.romaji} has his winning record`, small, 400]);
                else if (note?.type === 'losing') lines.push([`Eight losses: ${note.who.romaji} will fall down the sheet`, small, 400]);
                else if (decided) lines.push([this.card.playoff ? 'The playoff is settled' : 'And that decides the tournament', small, 400]);
            }
            this.said = lines;
            this.dust(b.loser === this.east.w ? this.east.x : this.west.x, 0, 0.3);
            this.shake = 0.8;
            if (upset && this.config.cushions && !this.host.reducedMotion) {
                const n = Math.round(26 * (this.host.quality?.density ?? 1));
                for (let i = 0; i < n; i++) this.throwCushion(Math.random() * this.G.w, this.G.cy - this.G.R * (0.9 + Math.random() * 0.6));
            }
            this.stage('result');
        }
    }

    // After the fan has pointed: the loser goes down or out, the winner straightens up.
    aftermath(a, q) {
        const b = this.bout, p = a.pose;
        if (a.w === b.winner) {
            Object.assign(p, { arms: q > 0.45 ? 'down' : 'push', squat: 0.3 * (1 - this.ease(Math.min(1, q * 2))), lean: 0.05, glad: true, stride: 0, reach: 0 });
            return;
        }
        const s = b.a.w === a.w ? b.a : b.b, k = this.ease(Math.min(1, q * 3.2));
        if (b.how === 'out') {
            // Over the straw, off the edge of the platform, and sitting down hard at the bottom.
            a.x = s.x + s.dir * (0.09 + 0.5 * k);
            a.y = Math.max(0, k - 0.45) * 0.42;
            Object.assign(p, { arms: 'up', squat: 0.2 + 0.5 * k, lean: -0.5 * k, stride: (1 - k) * this.clock * 18, spin: 0 });
        } else {
            const forward = s.cause === 'pull' || s.cause === 'step' || s.cause === 'over' || s.cause === 'under';
            a.y = -Math.sin(Math.PI * Math.min(1, q * 3.2)) * (s.cause === 'over' || s.cause === 'under' || s.cause === 'pivot' ? 0.28 : 0.05);
            Object.assign(p, { arms: 'up', squat: 0.3, lean: 0, spin: (forward ? 1 : -1) * 1.5 * k, stride: 0 });
        }
    }

    // ---- Drawing -----------------------------------------------------------------------
    draw() {
        const ctx = this.ctx, G = this.G, { w, h } = G, evening = this.evening;
        if (!this.backdrop || this.backdropEvening !== evening) {
            this.backdrop = SumoArt.backdrop(w, h, G, evening, this.host.quality?.density ?? 1);
            this.backdropEvening = evening;
        }
        const still = this.host.reducedMotion, sx = still ? 0 : Math.sin(this.clock * 61) * this.shake * 2.5, sy = still ? 0 : Math.cos(this.clock * 47) * this.shake * 2;
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.drawImage(this.backdrop, 0, 0, w, h);
        ctx.translate(sx, sy);
        const X = x => G.cx + x * G.R, Y = y => G.cy + y * G.R;
        const boutOn = this.phase !== 'board' && this.phase !== 'news' && this.phase !== 'card';
        // The referee, upstage, shuffling along with the pair.
        if (boutOn) SumoArt.gyoji(ctx, X((this.bout ? this.bout.c : 0) * 0.45 + (this.phase === 'ceremony' ? 0.8 : 0)), G.cy - G.ry * 0.82, G.s * 0.74, this.phase === 'result' ? this.point : 0, this.robe || 0);
        if (boutOn) {
            for (const a of [this.east, this.west].filter(Boolean).sort((p, q) => p.y - q.y)) SumoArt.rikishi(ctx, X(a.x), Y(a.y) + G.ry * 0.12, G.s, a.face, a.pose, a.w);
        }
        for (const p of this.puffs) SumoArt.puff(ctx, X(p.x), Y(p.y), p.r * G.R, p.age, p.color);
        for (const c of this.cushions) SumoArt.cushion(ctx, c.x, c.y, c.s, c.turn, c.color);
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        if (this.config.captions) this.captions(ctx);
        if (this.phase === 'board' || this.peek > 0) this.sheet(ctx, this.world.playoff ? { ja: '優勝決定戦', en: 'A playoff for the cup' } : this.world.day > SumoLogic.DAYS ? { ja: '千秋楽', en: 'The final standings' }
            : this.phase === 'board' ? { ja: `${SumoLogic.dayName(this.world.day - 1).ja}を終えて`, en: `After day ${this.world.day - 1}` } : { ja: '', en: 'The standings' });
        else if (this.phase === 'news') this.bulletin(ctx);
    }

    captions(ctx) {
        const G = this.G, world = this.world, f = G.font, m = Math.max(10, G.w * 0.014), jp = this.kanji, gloss = this.config.gloss || !jp;
        const season = this.phase === 'ceremony' ? this.season : SumoLogic.season(world), named = SumoLogic.dayName(Math.min(world.day, SumoLogic.DAYS));
        const day = this.phase === 'ceremony' ? { ja: '表彰式', en: 'The cup is given' } : world.playoff ? { ja: '優勝決定戦', en: 'A playoff for the cup' } : named;
        // The title, as a print's is: written downwards, right to left.
        if (jp) {
            const box = SumoArt.tate(ctx, m, m, [[season.ja, 1.25], [day.ja, 0.95]], f, { color: '#a3262a' });
            if (gloss) SumoArt.cartouche(ctx, m, box.y + box.h + f * 0.35, [[season.en, 0.66], [day.en, 0.6, 400]], f, { color: '#a3262a' });
        } else SumoArt.cartouche(ctx, m, m, [[season.en, 1], [day.en, 0.78, 400]], f, { color: '#a3262a' });
        if (this.phase === 'card') {
            const leader = SumoLogic.standings(world)[0], w = leader.wrestler, lines = [];
            if (jp) lines.push([day.ja, 1.7], [world.day > 1 ? `首位　${w.name}　${leader.wins}勝${leader.losses}敗` : `幕内十六力士、賜杯は一つ`, 0.9, 400]);
            if (gloss) lines.push([jp ? day.en : day.en, jp ? 0.7 : 1.5, jp ? 400 : 600], [world.day > 1 ? `${w.romaji} leads, ${leader.wins} and ${leader.losses}` : `${SumoLogic.SIZE} wrestlers, one cup`, jp ? 0.62 : 0.85, 400]);
            SumoArt.cartouche(ctx, G.cx, G.cy - G.s * 0.95, lines, f, { color: '#1f3a5f', align: 'center' });
            return;
        }
        if (this.phase === 'board' || this.phase === 'news') return;
        // Nameplates under each man's side of the ring, and what was just decided between them.
        const tall = f * ((jp ? 4.0 : 2.6) + (jp && gloss ? 0.85 : 0) + 1.6);
        const top = Math.min(G.safe - tall - f * 0.5, G.cy + G.platform.drop + G.platform.ry * 1.25 + (G.portrait ? f * 4.4 : f * 0.4));
        const plate = (a, align, x) => {
            if (!a) return;
            const w = a.w, index = SumoLogic.indexOf(world, w.id), t = index < 0 ? null : SumoLogic.title(world, index), marks = world.marks[w.id] || '', lines = [];
            if (jp) {
                lines.push([`${a.home ? (a.home < 0 ? '東　' : '西　') : ''}${t ? t.rank : ''}`, 0.78, 400], [w.kana, 0.56, 400], [w.name, 1.45]);
                if (gloss) lines.push([`${w.romaji} · ${w.gloss}`, 0.6, 400]);
            } else lines.push([t ? `${a.home ? (a.home < 0 ? 'East · ' : 'West · ') : ''}${t.romaji}` : 'Champion', 0.72, 400], [w.romaji, 1], [w.gloss, 0.62, 400]);
            lines.push([' ', 0.62]);
            const box = SumoArt.cartouche(ctx, x, top, lines, f, { color: SumoArt.BELTS[w.belt % SumoArt.BELTS.length], align });
            const r = Math.min(f * 0.2, (box.w - f * 1.1) / 38);
            SumoArt.marks(ctx, box.x + f * 0.55, box.y + box.h - f * 0.62, marks, r);
        };
        if (this.phase === 'ceremony') plate(this.east, 'center', G.cx);
        else { plate(this.east, 'left', m); plate(this.west, 'right', G.w - m); }
        if (this.said && (this.phase === 'result' || this.phase === 'leave' || this.phase === 'ceremony')) {
            const high = this.said.reduce((sum, [, k = 1]) => sum + f * k * 1.3, 0) + f * 0.7;
            const y = this.phase === 'ceremony' ? G.roof.y + G.roof.h * 1.05 : G.portrait ? top - high - f * 0.5 : top;
            const wide = G.portrait || this.phase === 'ceremony' ? G.w * 0.94 : G.w * 0.42;
            let longest = 1;
            for (const [text, k = 1, weight = 600] of this.said) { ctx.font = `${weight} ${f * k}px ${SumoArt.FONT}`; longest = Math.max(longest, ctx.measureText(text).width); }
            SumoArt.cartouche(ctx, G.cx, y, this.said, f * Math.min(1, (wide - f * 1.2) / longest), { color: '#2a211c', align: 'center' });
        }
    }

    // A sheet of paper over the hall, for the standings and the news.
    paper(ctx, title, sub, rows, tall) {
        const G = this.G, f = G.font, pw = Math.min(G.w * 0.94, f * (G.portrait ? 24 : 48)), ph = tall + f * (sub ? 4.5 : 3.6);
        const x = G.cx - pw / 2, y = Math.max(f, (G.safe - ph) / 2);
        ctx.fillStyle = 'rgba(42, 33, 28, 0.35)';
        ctx.fillRect(x + 5, y + 6, pw, ph);
        ctx.fillStyle = '#f0e4c8';
        ctx.strokeStyle = SumoArt.INK;
        ctx.lineWidth = 2;
        ctx.fillRect(x, y, pw, ph);
        ctx.strokeRect(x, y, pw, ph);
        ctx.strokeRect(x + 5, y + 5, pw - 10, ph - 10);
        ctx.fillStyle = '#a3262a';
        ctx.font = `600 ${f * 1.3}px ${SumoArt.FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(title, G.cx, y + f * 1.6);
        if (sub) { ctx.font = `400 ${f * 0.7}px ${SumoArt.FONT}`; ctx.fillStyle = SumoArt.INK; ctx.fillText(sub, G.cx, y + f * 2.75); }
        rows(x + f, y + f * (sub ? 4.0 : 3.1), pw - f * 2);
    }

    sheet(ctx, when) {
        const G = this.G, f = G.font, jp = this.kanji, gloss = this.config.gloss || !jp, table = SumoLogic.standings(this.world), cols = G.portrait ? 1 : 2, per = Math.ceil(table.length / cols), row = f * 1.48;
        const season = SumoLogic.season(this.world);
        this.paper(ctx, jp ? `${season.ja}　星取表　${when.ja}` : `${season.en} · ${when.en}`, jp && gloss ? `${season.en} · ${when.en}` : '', (x, y, wide) => {
            const cw = wide / cols;
            table.forEach((e, i) => {
                const cx = x + Math.floor(i / per) * cw, cy = y + (i % per) * row + row / 2, w = e.wrestler;
                ctx.textAlign = 'left';
                ctx.fillStyle = w.yokozuna ? '#a3262a' : SumoArt.INK;
                ctx.font = `600 ${f * 0.74}px ${SumoArt.FONT}`;
                ctx.fillText(jp ? e.title.short : e.title.romaji.replace('Maegashira ', 'M').replace(/^([YOSK])[a-z]+$/, '$1'), cx, cy);
                ctx.font = `${i === 0 ? 700 : 400} ${f * 0.95}px ${SumoArt.FONT}`;
                ctx.fillText(jp ? w.name : w.romaji, cx + f * 2.7, cy, cw * (jp ? 0.22 : 0.36));
                if (jp && gloss) { ctx.font = `400 ${f * 0.6}px ${SumoArt.FONT}`; ctx.fillText(w.romaji, cx + f * 2.7 + cw * 0.23, cy + f * 0.08, cw * 0.2); }
                ctx.textAlign = 'right';
                ctx.font = `${i === 0 ? 700 : 400} ${f * 0.85}px ${SumoArt.FONT}`;
                ctx.fillText(jp ? `${e.wins}勝${e.losses}敗` : `${e.wins}–${e.losses}`, cx + cw - f * 0.8, cy);
                const marks = this.world.marks[w.id] || '', r = Math.min(f * 0.16, (cw * 0.24) / 38);
                SumoArt.marks(ctx, cx + cw * 0.56, cy, marks, r);
            });
        }, per * row);
    }

    bulletin(ctx) {
        const f = this.G.font, jp = this.kanji, gloss = this.config.gloss || !jp, order = ['champion', 'yokozuna', 'promoted', 'dropped', 'retired', 'demoted', 'rookie'];
        const nth = n => `${n}${['th', 'st', 'nd', 'rd'][n % 10 < 4 && (n % 100 < 11 || n % 100 > 13) ? n % 10 : 0]}`;
        const lines = [...(this.news || [])].sort((p, q) => order.indexOf(p.type) - order.indexOf(q.type)).slice(0, gloss && jp ? 8 : 11).map(n => ({
            champion: ['◎', `優勝　${n.name}　${n.wins}勝${n.yusho > 1 ? `（${n.yusho}回目）` : ''}`, `${n.romaji} won the cup with ${n.wins} wins${n.yusho > 1 ? `, his ${nth(n.yusho)}` : ''}`],
            yokozuna: ['★', `${n.name}　横綱昇進`, `${n.romaji} is made Yokozuna, grand champion`],
            promoted: ['▲', `${n.name}　${n.to}に昇進`, `${n.romaji} rises to ${n.toRomaji}`],
            dropped: ['▼', `${n.name}　${n.to}に陥落`, `${n.romaji} slips to ${n.toRomaji}`],
            retired: ['–', `${n.name}　引退（通算${n.wins}勝、優勝${n.yusho}回）`, `${n.romaji} retires: ${n.wins} wins, ${n.yusho} ${n.yusho === 1 ? 'cup' : 'cups'}, and his topknot is cut`],
            demoted: ['×', `${n.name}　十両陥落`, `${n.romaji} goes down to the second division`],
            rookie: ['+', `${n.name}　新入幕（${n.stable?.[0]}部屋）`, `${n.romaji} comes up, of the ${n.stable?.[1]} stable`],
        }[n.type]));
        const row = f * (jp && gloss ? 2.3 : 1.5);
        this.paper(ctx, jp ? '新番付' : 'The new ranking sheet', jp && gloss ? 'The new ranking sheet' : '', (x, y, wide) => {
            lines.forEach(([mark, ja, en], i) => {
                const cy = y + i * row + f * 0.75;
                ctx.textAlign = 'left';
                ctx.fillStyle = '#a3262a';
                ctx.font = `600 ${f * 0.95}px ${SumoArt.FONT}`;
                ctx.fillText(mark, x, cy);
                ctx.fillStyle = SumoArt.INK;
                ctx.font = `400 ${f * 0.95}px ${SumoArt.FONT}`;
                ctx.fillText(jp ? ja : en, x + f * 1.6, cy, wide - f * 1.6);
                if (jp && gloss) { ctx.font = `400 ${f * 0.62}px ${SumoArt.FONT}`; ctx.fillText(en, x + f * 1.6, cy + f * 0.95, wide - f * 1.6); }
            });
        }, lines.length * row);
    }
}
