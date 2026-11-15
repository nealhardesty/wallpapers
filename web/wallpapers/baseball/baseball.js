// The Never-Ending Baseball Season (SPEC §10.37): a league of eight clubs
// that do not exist, playing each other for ever in 16-bit pixel art, seen
// from high behind home plate. Every pitch is thrown (baseball-logic.js),
// every ball in play is chased down by somebody, every statistic is kept,
// and the nicknames are earned (baseball-league.js). The league lives in
// host.storage and only moves on while the wallpaper is on screen.
//
//   baseball-logic.js    a pitch, a ball in play, the box score (pure, unit-tested)
//   baseball-league.js   the clubs, the season, the series, the winter, nicknames
//   baseball-talk.js     the announcer
//   baseball-art.js      the lettering, the park, the little men
//   baseball.js          this: the manager that stages it
//
// Cheap: the picture is a few hundred pixels across, scaled up by CSS. The
// park is one bake per game, the words another, redrawn only when they
// change; a frame draws those, thirty-odd little men and the ball.

const BB_PACE = { relaxed: 1.3, normal: 1, brisk: 0.68 };
// How long each part takes at the normal pace, seconds.
const BB_TIMES = { set: 0.3, windup: 0.4, call: 0.35, result: 1.25, change: 3.4, half: 6, stretch: 9, rain: 15, pregame: 7, final: 9, table: 7.5, trophy: 13, news: 11 };

class BaseballAnimationManager {
    constructor(host) {
        this.host = host;
        this.config = WP.settings.load();
        this.isRunning = false;
        this.animationId = null;
        this.lastTime = 0;
        this.clock = 0;              // seconds since the start, for small motions
        this.cam = 0;                // how far the picture has panned to follow the ball (a phone held upright)
        this.cheer = 0;              // how excited the crowd is, 0 to 1
        this.wave = null;            // a wave going round: { x, v }
        this.sparks = [];            // fireworks and confetti
        this.puffs = [];
        this.balls = [];             // beach balls
        this.dogs = [];              // hot dogs in flight
        this.drops = [];
        this.peek = 0;               // which sheet is held up (S): 0 none, 1 standings, 2 bats, 3 arms
        this.breaks = 0;
        this.line = '';              // what the announcer is saying
        this.rev = 0;                // counts every change to what is written on screen
        this.onResize = () => this.resize();
    }
    // `this.dirty = true` says the words have changed.
    set dirty(yes) { if (yes) this.rev++; }

    // ---- Lifecycle --------------------------------------------------------------------

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        const canvas = this.canvas = document.createElement('canvas');
        Object.assign(canvas.style, { position: 'fixed', left: '0', top: '0', zIndex: '-1', pointerEvents: 'none', imageRendering: 'pixelated' });
        document.body.appendChild(canvas);
        this.ctx = canvas.getContext('2d');
        window.addEventListener('resize', this.onResize);
        const saved = this.host.params.thumb ? null : this.host.storage.get('world');
        const whole = saved && saved.v === 1 && saved.teams?.length === BaseballLeague.TEAMS;
        this.world = whole ? saved : BaseballLeague.found(Math.random);
        this.vendor = { x: 40, dir: 1, wait: 0, cry: 0 };
        this.boot(!whole);
        if (!this.host.params.thumb) this.stopGestures = this.host.gestures({ tap: (x, y) => { if (this.config.touch) this.tap(x, y); } });
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

    // Pick up wherever the league is: in a game, between games, or at the trophy.
    boot(fresh) {
        const world = this.world, L = BaseballLeague;
        this.host.panel({ teams: world.teams.map(t => `${t.town} ${t.name}`) });
        // Closed in the middle of the prize-giving: the winter has passed.
        if (world.stage === 'champion') BaseballLeague.newSeason(world, Math.random);
        const resumed = !!world.game;
        if (!resumed) this.open();
        if (fresh) {
            // A league is first seen in the middle of a game, as if we had just tuned in.
            const until = Math.min(world.game.innings - 1, 3 + Math.floor(Math.random() * 3));
            for (let play = null; !(play?.result && !play.endHalf && world.game.inning >= until) && !world.game.over;) play = L.pitch(world, Math.random);
        }
        this.enter();
        if (fresh || resumed) { this.go('set'); this.pt = this.dur * 0.4; this.say(this.score()); } else this.go('pregame');
    }

    open() {
        const follow = this.config.follow === 'any' ? -1 : Number(this.config.follow);
        BaseballLeague.openDay(this.world, Math.random, { follow, innings: this.config.innings });
    }

    // A game is on the field: its two clubs, its park, the men in it.
    enter() {
        this.game = this.world.game;
        this.sides = BaseballLeague.sides(this.world, this.game);
        this.kits = [BaseballArt.kit(this.sides[0], false), BaseballArt.kit(this.sides[1], true)];
        this.play = null;
        this.resize();
        this.fielders = this.nine();
        this.leaving = null;
        this.snap();
    }

    save() { if (!this.host.params.thumb) this.host.storage.set('world', this.world); }
    get pace() { return BB_PACE[this.config.pace] || 1; }
    get still() { return this.host.reducedMotion; }
    get density() { return this.host.quality?.density ?? 1; }
    get lightNow() {
        if (this.config.time !== 'auto') return this.config.time;
        const now = this.host.now(), hour = now.getHours() + now.getMinutes() / 60;
        return hour >= 7 && hour < 17.5 ? 'day' : (hour >= 5.5 && hour < 7) || (hour >= 17.5 && hour < 19.5) ? 'dusk' : 'night';
    }

    applySettings(config) {
        const old = this.config;
        this.config = config;
        if (config.pixelSize !== old.pixelSize) this.resize();
        else if (config.time !== old.time) this.bake();
        this.dirty = true;
    }

    onQuality() {
        this.bake();
        this.sparks.length = Math.min(this.sparks.length, Math.round(260 * this.density));
    }

    onAction(name) {
        if (name !== 'reset') return;
        this.world = BaseballLeague.found(Math.random);
        this.boot(true);
        this.save();
        this.host.toast(`${this.world.name.replace(/\b(\w)(\w*)/g, (_, a, b) => a + b.toLowerCase())} is founded`);
    }

    resize() {
        if (!this.canvas) return;
        const W = window.innerWidth, H = window.innerHeight;
        const px = this.px = Math.max(1, Math.round(Math.max(1.4, Math.min(W, H) / 262) * this.config.pixelSize));
        const bw = Math.ceil(W / px), bh = Math.ceil(H / px);
        this.canvas.width = bw;
        this.canvas.height = bh;
        this.canvas.style.width = `${bw * px}px`;
        this.canvas.style.height = `${bh * px}px`;
        const park = (this.sides || BaseballLeague.sides(this.world, this.world.game || this.world.last))[1].park;
        this.G = BaseballArt.layout(bw, bh, Math.ceil((this.host.insets?.bottom || 0) / px), park);
        this.hud = BaseballArt.canvas(bw, bh);
        this.board = BaseballArt.canvas(this.G.board.w, this.G.board.h);
        this.bake();
    }

    // Paint the park again: a new game, a new size, or the light has changed.
    bake() {
        if (!this.G || !this.sides) return;
        this.light = this.lightNow;
        this.baked = BaseballArt.park(this.G, this.sides[1], this.sides[0], this.light, this.density, WP.seededRandom(1000 + this.sides[1].id * 7 + this.world.season));
        this.lit ??= this.light === 'day' ? 0 : 9;
        this.dirty = true;
    }

    // ---- The men on the field ---------------------------------------------------------------

    // The nine in the field just now, each at his spot.
    nine() {
        return BaseballLogic.defence(this.game, this.sides).map(f => ({ idx: f.idx, p: f.p, hx: f.x, hy: f.y, x: f.x, y: f.y, pose: 'stand', side: 1 - this.game.half }));
    }
    // Where a club sits: the visitors by third, the home side by first.
    bench(side, i = 2) { return this.baked.dugouts[side][i % 5]; }
    // A runner's place, `q` of the way from base `from` to base `to` (4 is home again).
    onPath(from, to, q) {
        const B = BaseballLogic.BASES, at = from + (to - from) * Math.min(1, Math.max(0, q)), i = Math.min(3, Math.floor(at)), k = at - i;
        return [B[i][0] + (B[i + 1][0] - B[i][0]) * k, B[i][1] + (B[i + 1][1] - B[i][1]) * k];
    }
    man(id) { return BaseballLogic.find(this.sides[0], id) || BaseballLogic.find(this.sides[1], id); }
    name(id) { return BaseballLeague.called(this.man(id)); }

    // ---- The scoreboard's copy of the game -------------------------------------------------

    snap() {
        const g = this.game;
        this.view = { inning: g.inning, half: g.half, outs: g.outs, balls: g.balls, strikes: g.strikes, line: g.line.map(l => l.slice()), R: g.R.slice(), H: g.H.slice(), E: g.E.slice(), over: g.over,
            batter: g.order[g.half][g.spot[g.half]], pitcher: g.pit[1 - g.half], deck: g.order[g.half][(g.spot[g.half] + 1) % 9] };
        this.dirty = true;
    }
    score() {
        const v = this.view, [a, h] = this.sides;
        return `${v.over ? 'FINAL' : `${v.half ? 'BOTTOM' : 'TOP'} OF THE ${BaseballTalk.ordinal(v.inning)}`}. ${a.name} ${v.R[0]}, ${h.name} ${v.R[1]}.`;
    }
    say(line) { if (line) { this.line = line; this.dirty = true; } }
    shout(text, big = false) { this.pop = { text, t: 0, big }; }

    // ---- Phases ------------------------------------------------------------------------------

    go(phase, dur = BB_TIMES[phase] || 1) {
        this.phase = phase;
        this.pt = 0;
        this.dur = dur * (['pitch', 'play', 'half', 'stretch', 'rain', 'pregame', 'final', 'table', 'trophy', 'news'].includes(phase) ? 1 : this.pace);
        const world = this.world, T = BaseballTalk;
        if (phase === 'pregame') {
            const [a, h] = this.sides;
            this.say(world.stage === 'series' ? `THE ${BaseballLeague.TROPHY} SERIES: ${a.name} AT ${h.name}.` : `${a.town} ${a.name} AT ${h.town} ${h.name}. WELCOME TO ${h.park.name}.`);
            this.runOut(null, this.fielders);
        } else if (phase === 'final') {
            const g = this.game, win = g.R[1] > g.R[0] ? 1 : 0;
            this.snap();
            this.winner = win;
            this.cheer = win ? 1 : 0.4;
            this.say(`THAT IS THE BALL GAME! ${this.sides[win].name} ${g.R[win]}, ${this.sides[1 - win].name} ${g.R[1 - win]}.`);
            this.rockets = this.light !== 'day' && win === 1 ? 7 : 0;
        } else if (phase === 'table') {
            this.next = BaseballLeague.closeGame(world);
            this.save();
            if (this.next === 'champion') return this.go('trophy');
            if (this.next === 'series') this.say(`THE SEASON IS OVER. THE ${world.teams[world.series.a].name} AND THE ${world.teams[world.series.b].name} WILL PLAY FOR ${BaseballLeague.TROPHY}.`);
        } else if (phase === 'trophy') {
            const champ = world.teams[world.champion];
            this.winner = this.sides.indexOf(champ);
            this.cheer = 1;
            this.rockets = 12;
            this.say(`THE ${champ.town} ${champ.name} ARE THE CHAMPIONS! ${BaseballLeague.TROPHY} IS THEIRS!`);
        } else if (phase === 'news') {
            this.news = BaseballLeague.newSeason(world, Math.random);
            this.save();
            this.say(`A LONG WINTER PASSES. SEASON ${world.season} IS HERE.`);
        } else if (phase === 'half' || phase === 'stretch' || phase === 'rain') {
            const before = this.fielders;
            this.play = null;
            this.fielders = this.nine();
            this.runOut(before, this.fielders);
            this.breaks++;
            if (phase === 'stretch') { this.say(T.say('stretch', {}, this.breaks)); this.cheer = 0.5; } else if (phase === 'rain') { this.say(T.say('rain', {}, this.breaks)); this.raining = true; } else this.say(this.score());
        }
    }

    // One side trots off to its dugout and the other trots out.
    runOut(off, on) {
        this.leaving = off ? off.map((f, i) => ({ ...f, to: this.bench(f.side, i) })) : null;
        on.forEach((f, i) => { f.from = this.bench(f.side, i); });
    }

    // Ask the game for its next pitch and begin to act it out.
    deliver() {
        const world = this.world;
        if (this.game.over) return this.go('final');
        this.snap();
        const play = BaseballLeague.pitch(world, Math.random);
        if (!play) return this.go('final');
        this.play = play;
        this.tl = 0;
        this.said = false;
        this.n = (this.n || 0) + 1;
        if (play.kind === 'change') {
            const team = this.sides[play.side];
            this.say(BaseballTalk.call(play, { B: this.name(play.out), P: this.name(play.in), D: team.name }, this.n));
            this.swap = { out: this.fielders[0], to: this.bench(play.side, 4) };
            return this.go('change');
        }
        const kind = BaseballLogic.PITCHES[play.pitch.type], pitcher = this.man(play.pitcher);
        this.thrown = `${play.pitch.type === pitcher.mix.at(-1) && pitcher.sig ? pitcher.sig : kind.name} ${play.pitch.mph} MPH`;
        this.flight = Math.min(1.5, Math.max(0.5, 60.5 / (play.pitch.mph * 1.467) * 1.3));
        this.go('windup');
    }

    // The words for the play just finished, and who they are about.
    describe(play) {
        const r = play.result || {}, g = this.game, b = play.half, team = this.sides[b], other = this.sides[1 - b];
        const fielder = r.by != null ? (this.fielders[r.by]?.p || this.man(play.pitcher)) : null;
        const out = play.runs.find(m => m.out && m.from), lead = g.R[b] - g.R[1 - b], runs = play.scored?.length || 0;
        const info = { B: this.name(play.batter), P: this.name(play.pitcher), F: BaseballTalk.WHERE[r.by ?? 7], G: fielder ? BaseballLeague.called(fielder) : '', R: this.name(play.steal?.id || out?.id || play.batter),
            T: team.name, D: other.name, N: r.feet || 0, lead: runs > 0 && lead > 0 && lead <= runs, tie: runs > 0 && lead === 0 };
        const lines = [BaseballTalk.call(play, info, this.n)];
        for (const note of play.notes) {
            const p = note.id ? this.man(note.id) : null;
            lines.push(BaseballTalk.note(note, { K: note.nick, L: p?.last, N: note.n, T: team.name }, this.n));
        }
        return lines.filter(Boolean).join(' ');
    }

    // The play has been seen: let the scoreboard catch up, and say so.
    reveal() {
        const play = this.play, r = play.result;
        if (this.said) return;
        this.said = true;
        const old = this.view;
        this.snap();
        if (play.endHalf || play.gameOver) Object.assign(this.view, { inning: old.inning, half: old.half, outs: play.gameOver && !play.endHalf ? this.game.outs : 3, batter: old.batter, pitcher: old.pitcher, deck: old.deck });
        const line = this.describe(play);
        if (line) this.say(line);
        this.shout(BaseballTalk.shout(play), !!r);
        if (!r) return;
        const home = play.half === 1, good = r.hit || r.code === 'BB' || r.code === 'E';
        this.cheer = Math.max(this.cheer, r.code === 'HR' ? 1 : (good ? home : !home) ? 0.55 : 0.15, play.walkoff ? 1 : 0);
        if (r.code === 'HR') {
            this.flash = 4;
            if (this.light !== 'day' && this.config.fireworks) this.rockets = home ? 6 : 2;
        }
    }

    // What follows the result of a pitch.
    after() {
        const play = this.play;
        if (play.result || play.endHalf || play.gameOver) this.save();
        if (play.gameOver) return this.go('final');
        if (play.endHalf) {
            const middle = play.half === 0 && play.inning === 7 && this.game.innings >= 7;
            const rain = !middle && this.config.rain && !this.host.params.thumb && !this.still && Math.random() < 0.012;
            return this.go(middle ? 'stretch' : rain ? 'rain' : 'half');
        }
        this.play = null;
        this.snap();
        this.go('set');
    }

    // ---- Keys and taps (declared in the catalog) ------------------------------------------

    // N: to the end of this half-inning; with Shift, to the end of the game.
    skip(all) {
        if (['final', 'table', 'pregame', 'trophy', 'news', 'half', 'stretch', 'rain'].includes(this.phase)) { this.pt = this.dur; this.raining = false; return 'On with it'; }
        const game = this.game;
        let last = this.play;
        while (!(last?.endHalf && !all) && !game.over) last = BaseballLeague.pitch(this.world, Math.random);
        this.save();
        this.play = null;
        if (game.over) { this.go('final'); return 'To the final out'; }
        this.snap();
        this.go('half');
        return `On to the ${game.half ? 'bottom' : 'top'} of the ${BaseballTalk.ordinal(game.inning).toLowerCase()}`;
    }
    // S: the standings, the leading bats, the leading arms, and away again.
    sheet() {
        this.peek = (this.peek + 1) % 4;
        this.dirty = true;
        return ['', 'The standings', 'The leading bats', 'The leading arms'][this.peek];
    }

    // A tap: the hot-dog seller throws one if he is near; anywhere else starts a wave and a beach ball.
    tap(cssX, cssY) {
        const x = cssX / this.px, y = cssY / this.px, G = this.G, vx = this.vendor.x - G.pan - this.cam;
        if (Math.abs(x - vx) < 16 && Math.abs(y - this.baked.rim) < 18) {
            this.dogs.push({ x: vx, y: this.baked.rim - 8, vx: (Math.random() - 0.5) * 50, vy: -50, life: 0 });
            this.vendor.cry = 2.4;
            this.say(BaseballTalk.say('hotdog', {}, this.dogs.length + this.breaks));
            return;
        }
        if (!this.still) this.wave = { x: x + G.pan + this.cam, v: (x < G.bw / 2 ? 1 : -1) * 70, t: 0 };
        this.balls.push({ x, y: Math.max(8, y - 10), vx: (Math.random() - 0.5) * 60, vy: -70, floor: Math.max(14, y), bounces: 0 });
        if (this.balls.length > 12) this.balls.shift();
    }

    // ---- A frame -----------------------------------------------------------------------------

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
        this.extras(dt);
        if (this.peek) return;                       // a sheet is held up: the game waits
        const play = this.play, phase = this.phase, quick = 1.15 / Math.sqrt(this.pace);
        this.pt += dt;
        const done = this.pt >= this.dur;
        if (phase === 'set') { if (done) this.deliver(); } else if (phase === 'windup') {
            this.tl += dt * quick;
            if (done) this.go('pitch', this.flight * Math.sqrt(this.pace));
        } else if (phase === 'pitch') {
            this.tl += dt * quick;
            if (done) {
                if (play.call === 'inplay') { this.tl = 0; this.go('play', 99); } else {
                    // A steal or a wild pitch has to be seen through before the next one.
                    const busy = Math.max(0, ...play.runs.map(m => m.t), ...play.throws.map(t => t.t)), walk = play.result && ['BB', 'HBP'].includes(play.result.code);
                    const more = busy && !walk ? Math.max(0, busy - this.tl + 0.5) : 0;
                    this.foulT = 0;
                    this.reveal();
                    if (walk) this.tl = 0;
                    if (play.result) this.go('result', Math.max(BB_TIMES.result, more)); else this.go('call', Math.max(BB_TIMES.call, more));
                }
            }
        } else if (phase === 'call') {
            this.tl += dt * quick;
            this.foulT += dt;
            if (done) this.after();
        } else if (phase === 'play') {
            const f = play.fl, homer = play.result.code === 'HR' && !play.result.inside;
            this.tl += dt * quick * (homer && this.tl > f.T ? 1.7 : 1);
            if (!this.said && this.tl >= (homer ? f.T * 0.55 : play.dur)) this.reveal();
            if (this.tl >= play.dur + 0.5) this.go('result');
        } else if (phase === 'result') {
            this.tl += play.result && ['BB', 'HBP'].includes(play.result.code) ? dt * 5 / (this.dur * 0.8) : dt * quick;
            if (done) this.after();
        } else if (phase === 'change') {
            if (done) { this.fielders = this.nine(); this.swap = null; this.play = null; this.snap(); this.go('set'); }
        } else if (phase === 'half' || phase === 'stretch' || phase === 'rain') {
            if (phase === 'rain' && this.pt > this.dur - 3 && this.raining) { this.raining = false; this.say(BaseballTalk.say('dry', {}, this.breaks)); }
            if (phase === 'stretch') this.cheer = Math.max(this.cheer, 0.45);
            if (done) { this.leaving = null; this.snap(); this.go('set'); }
        } else if (phase === 'pregame') {
            if (done) { this.say(BaseballTalk.say('playball', {}, this.world.day)); this.go('set'); }
        } else if (phase === 'final') {
            if (done) this.go('table');
        } else if (phase === 'table') {
            if (done) { this.open(); this.enter(); this.go('pregame'); }
        } else if (phase === 'trophy') {
            this.cheer = 1;
            if (done) this.go('news');
        } else if (phase === 'news') {
            if (done) { this.open(); this.enter(); this.go('pregame'); }
        }
    }

    // Everything that carries on whatever the game is doing: the crowd, the
    // lights, fireworks, rain, the hot-dog seller, beach balls, the camera.
    extras(dt) {
        const G = this.G, still = this.still;
        this.cheer = Math.max(0, this.cheer - dt * 0.22);
        if (this.pop) { this.pop.t += dt; if (this.pop.t > 1.5) this.pop = null; }
        if (this.flash > 0) { this.flash -= dt; this.boardKey = -1; }
        if (this.wave) { this.wave.x += this.wave.v * dt; this.wave.t += dt; if (this.wave.t > 7 || this.wave.x < -30 || this.wave.x > G.fw + 30) this.wave = null; }
        // The light: checked now and then; the lamps come on one after another.
        if ((this.lightCheck = (this.lightCheck || 0) + dt) > 4) {
            this.lightCheck = 0;
            const light = this.lightNow;
            if (light !== this.light) { const was = this.light; this.bake(); if (was === 'day') { this.lit = 0; this.say(BaseballTalk.say('lights', {}, this.breaks)); } }
        }
        if (this.light !== 'day' && this.lit < 9) { this.lit += dt * 1.6; } else if (this.light === 'day') this.lit = 0;
        // Fireworks: a rocket now and then while any are owed.
        if (this.rockets > 0 && !still && (this.rocketIn = (this.rocketIn || 0) - dt) <= 0) {
            this.rockets--;
            this.rocketIn = 0.45 + Math.random() * 0.6;
            const x = G.bw * (0.12 + 0.76 * Math.random()), y = G.top * 0.3 + Math.random() * (G.top * 0.5 + 36), colour = ['#ff5a5a', '#ffd24a', '#6ae0ff', '#ff8ad8', '#8aff8a', '#ffffff'][Math.floor(Math.random() * 6)];
            const n = Math.round(30 * (0.4 + 0.6 * this.density));
            for (let i = 0; i < n && this.sparks.length < 300; i++) { const a = i / n * Math.PI * 2, v = (i % 2 ? 18 : 34) + Math.random() * 8; this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 8, life: 0, max: 1 + Math.random() * 0.7, colour, g: 18 }); }
        }
        if (this.phase === 'trophy' && !still && this.sparks.length < 200 * this.density && Math.random() < dt * 40) {
            this.sparks.push({ x: Math.random() * G.bw, y: -2, vx: (Math.random() - 0.5) * 10, vy: 14 + Math.random() * 14, life: 0, max: 9, colour: ['#f2c744', '#ffffff', this.sides[this.winner]?.colours[0] || '#ff5a5a'][Math.floor(Math.random() * 3)], g: 0 });
        }
        for (const s of this.sparks) { s.life += dt; s.vy += s.g * dt; s.x += s.vx * dt; s.y += s.vy * dt; }
        this.sparks = this.sparks.filter(s => s.life < s.max && s.y < G.bh);
        for (const p of this.puffs) p.age += dt * 2.2;
        this.puffs = this.puffs.filter(p => p.age < 1);
        // Rain, while it rains.
        const want = this.raining && !still ? Math.round(110 * this.density) : 0;
        while (this.drops.length < want) this.drops.push({ x: Math.random() * G.bw, y: Math.random() * G.bh });
        if (this.drops.length > want) this.drops.length = Math.max(want, this.drops.length - 3);
        for (const d of this.drops) { d.x -= 50 * dt; d.y += 230 * dt; if (d.y > G.bh) { d.y -= G.bh; d.x = Math.random() * (G.bw + 40); } }
        // The hot-dog seller walks the rim, stopping to shout.
        const v = this.vendor;
        v.cry = Math.max(0, v.cry - dt);
        if (v.wait > 0) v.wait -= dt; else {
            v.x += v.dir * 7 * dt;
            if (v.x < 12 || v.x > G.fw - 12) v.dir = v.x < 12 ? 1 : -1;
            if (Math.random() < dt * 0.12) { v.wait = 2.2; v.cry = 2.2; }
        }
        for (const d of this.dogs) { d.life += dt; d.vy += 120 * dt; d.x += d.vx * dt; d.y += d.vy * dt; }
        this.dogs = this.dogs.filter(d => d.life < 1.1);
        for (const b of this.balls) {
            b.vy += 150 * dt; b.x += b.vx * dt; b.y += b.vy * dt;
            if (b.y > b.floor && b.vy > 0) { b.y = b.floor; b.vy = -b.vy * 0.82; b.bounces++; this.cheer = Math.max(this.cheer, 0.25); }
        }
        this.balls = this.balls.filter(b => b.bounces < 7 && b.x > -6 && b.x < G.bw + 6);
        // On a phone the picture follows the ball.
        const ball = this.ballNow();
        const aim = G.pan && ball && this.phase === 'play' ? Math.max(-G.pan, Math.min(G.pan, ball.x * G.s * 0.85)) : 0;
        this.cam += (aim - this.cam) * Math.min(1, dt * 3.5);
    }

    // ---- Where everything is ------------------------------------------------------------------

    // The ball, in feet: { x, y, z }, or null when somebody is holding it out of sight.
    ballNow() {
        const play = this.play, phase = this.phase;
        if (!play || play.kind !== 'pitch') return null;
        const p = play.pitch;
        if (phase === 'pitch') {
            const q = this.pt / this.dur, arc = p.type === 'EE' ? 16 : p.type === 'CU' || p.type === 'KN' ? 4 : 1.5;
            return { x: p.x * 0.7 * q + p.bend[0] * 1.5 * Math.sin(q * Math.PI), y: 58 - 58 * q, z: 6 - 3.2 * q + p.z * q + arc * Math.sin(q * Math.PI) };
        }
        if (phase === 'call') {
            if (play.call === 'foul') return this.foulT < 1.4 ? BaseballLogic.ballAt(play.fl, this.foulT) : null;
            if (play.wild) { const q = Math.min(1, this.pt * 2); return { x: 6 * q, y: -8 - 36 * q, z: 0 }; }
            const peg = play.throws[0];
            if (peg && this.tl >= peg.t0) { const q = Math.min(1, (this.tl - peg.t0) / (peg.t - peg.t0)); return { x: peg.to[0] * q, y: peg.to[1] * q, z: 5 + 6 * Math.sin(q * Math.PI) }; }
            return null;
        }
        if (phase !== 'play') return null;
        const t = this.tl, f = play.fl, got = play.field;
        if (!got) return t < f.T + 0.4 ? BaseballLogic.ballAt(f, Math.min(t, f.T)) : null;                    // over the fence and into the seats
        if (t < got.t) return BaseballLogic.ballAt(f, t);
        for (const peg of play.throws) {
            if (t >= peg.t0 && t <= peg.t) { const q = (t - peg.t0) / (peg.t - peg.t0); return { x: peg.from[0] + (peg.to[0] - peg.from[0]) * q, y: peg.from[1] + (peg.to[1] - peg.from[1]) * q, z: 5 + 7 * Math.sin(q * Math.PI) }; }
        }
        return null;
    }

    // Move the nine for this instant of the play (or stand them at their spots).
    place() {
        const play = this.play, phase = this.phase, t = this.tl, ease = q => (q < 0 ? 0 : q > 1 ? 1 : q * q * (3 - 2 * q));
        const running = phase === 'half' || phase === 'stretch' || phase === 'rain' || phase === 'pregame';
        for (const f of this.fielders) {
            f.x = f.hx; f.y = f.hy; f.face = f.hx > 0 ? -1 : 1;
            f.pose = f.idx === 1 ? 'squat' : phase === 'windup' || phase === 'pitch' ? 'ready' : 'stand';
            if (running) {
                const q = ease(((phase === 'rain' ? this.pt - this.dur + 5.2 : this.pt) - 1.6 - f.idx * 0.08) / 2.6);
                if (q < 1) { f.x = f.from[0] + (f.hx - f.from[0]) * q; f.y = f.from[1] + (f.hy - f.from[1]) * q; f.pose = q > 0 ? 'run' : 'sit'; f.hidden = q <= 0; } else f.hidden = false;
            } else f.hidden = false;
            if (phase === 'final' || phase === 'trophy') { if (f.side === this.winner) f.pose = 'cheer'; }
        }
        const P = this.fielders[0];
        if (phase === 'windup') { P.pose = 'windup'; P.t = this.pt / this.dur * 0.55; } else if (phase === 'pitch') { P.pose = this.pt < 0.25 ? 'windup' : 'stand'; P.t = 0.8; }
        if (phase === 'change' && this.swap) {
            const q = ease(this.pt / (this.dur * 0.55)), back = ease((this.pt - this.dur * 0.35) / (this.dur * 0.6)), to = this.swap.to;
            this.swap.x = P.hx + (to[0] - P.hx) * q; this.swap.y = P.hy + (to[1] - P.hy) * q;
            P.shown = back > 0; P.x = to[0] + (P.hx - to[0]) * back; P.y = to[1] + (P.hy - to[1]) * back; P.pose = back < 1 ? 'run' : 'stand';
        }
        if (!play || play.kind !== 'pitch' || (phase !== 'play' && phase !== 'call' && phase !== 'result')) return;
        // Somebody covers every base a throw is going to.
        const got = play.field, cover = {};
        for (const peg of play.throws) {
            const b = peg.base % 4;
            cover[b] = b === 0 ? 1 : b === 1 ? (got?.who === 2 ? 0 : 2) : b === 3 ? (got?.who === 4 ? 5 : 4) : (got ? (got.at[0] < 0 ? 3 : 5) : 5);
            if (got && cover[b] === got.who) cover[b] = b === 2 ? (got.who === 5 ? 3 : 5) : 3;
        }
        for (const [base, idx] of Object.entries(cover)) {
            const f = this.fielders[idx], B = BaseballLogic.BASES[base], q = ease((t - 0.2) / 1.3);
            f.x = f.hx + (B[0] - f.hx) * q; f.y = f.hy + (B[1] - f.hy) * q;
            const peg = play.throws.find(p => p.base % 4 === +base);
            f.pose = q < 1 ? 'run' : t > peg.t - 0.3 ? 'catch' : 'ready';
        }
        if (!got || phase === 'call') return;
        const f = this.fielders[got.who], q = ease((t - 0.25) / Math.max(0.2, got.t - 0.25));
        f.x = f.hx + (got.at[0] - f.hx) * q; f.y = f.hy + (got.at[1] - f.hy) * q;
        f.face = got.at[0] > f.hx ? 1 : -1;
        const peg = play.throws.find(p => Math.hypot(p.from[0] - got.at[0], p.from[1] - got.at[1]) < 1);
        f.pose = t < got.t - 0.35 ? 'run' : t < got.t ? (got.dive ? 'dive' : got.air ? 'catch' : 'ready') : peg && t > peg.t0 - 0.2 && t < peg.t0 + 0.4 ? 'throw' : got.dive && t < got.t + 0.7 ? 'dive' : got.air ? 'catch' : 'stand';
        if (got.robbed && t > got.t - 0.4 && t < got.t + 0.3) f.lift = 9;
        // The other outfielders come over to back him up; the man who dived and missed is on the grass.
        for (const o of this.fielders) {
            if (o.idx < 6 || o === f || Object.values(cover).includes(o.idx)) continue;
            const k = 0.3 * ease(t / 2.5);
            o.x = o.hx + (got.at[0] - o.hx) * k; o.y = o.hy + (got.at[1] - o.hy) * k; o.pose = k < 0.29 ? 'run' : 'stand';
        }
        if (got.dove != null) { const o = this.fielders[got.dove], at = BaseballLogic.ballAt(play.fl, play.fl.T), k = ease(t / play.fl.T); o.x = o.hx + (at.x - o.hx) * k * 0.9; o.y = o.hy + (at.y - o.hy) * k * 0.9; o.pose = k > 0.8 ? 'dive' : 'run'; o.face = at.x > o.hx ? 1 : -1; }
    }

    // ---- Drawing --------------------------------------------------------------------------------

    draw() {
        const c = this.ctx, G = this.G, A = BaseballArt, B = this.baked, shift = Math.round(G.pan + this.cam);
        const X = x => Math.round(A.px(G, x)) - shift, Y = (y, z = 0) => Math.round(A.py(G, y, z));
        c.drawImage(B.field, -shift, 0);
        this.crowd(c, shift);
        // The lamps, coming on one by one at dusk.
        B.lamps.forEach((lamp, i) => {
            if (this.lit <= i * 1.4 || (this.lit < i * 1.4 + 1 && Math.floor(this.clock * 14) % 2)) return;
            c.fillStyle = 'rgba(255, 244, 190, 0.28)'; c.fillRect(lamp.x - shift - 2, lamp.y - 2, 13, 8);
            c.fillStyle = '#fff8d0'; c.fillRect(lamp.x - shift, lamp.y, 9, 4);
        });
        if (G.board.fixed) { c.fillStyle = '#20242e'; c.fillRect(G.board.x - 2, G.board.y - 2, G.board.w + 4, G.board.h + 4); }
        c.drawImage(this.scoreboard(), G.board.fixed ? G.board.x : G.board.x - shift, G.board.y);
        this.seller(c, shift);
        if (this.phase === 'rain') this.tarp(c, X, Y);

        this.place();
        const play = this.play, phase = this.phase, list = [], kits = this.kits, half = this.view.half;
        const put = (x, y, o, lift = 0) => list.push({ sy: A.py(G, y), draw: () => A.man(c, X(x), Y(y) - lift, o) });
        for (const f of this.fielders) {
            if (f.hidden || (phase === 'change' && f.idx === 0 && !f.shown) || (phase === 'trophy' && f.side !== this.winner)) continue;
            put(f.x, f.y, { kit: kits[f.side], skin: f.p.skin, pose: f.pose, t: f.pose === 'windup' ? f.t : this.clock + f.idx, face: f.face, back: f.idx === 1, glove: true }, f.lift || 0);
            f.lift = 0;
        }
        if (this.swap && phase === 'change') put(this.swap.x, this.swap.y, { kit: kits[this.swap.out.side], skin: this.swap.out.p.skin, pose: 'run', t: this.clock, face: this.swap.to[0] > 0 ? 1 : -1 });
        if (this.leaving && this.pt < 2.6) {
            const q = Math.min(1, this.pt / 2.4);
            for (const f of this.leaving) put(f.hx + (f.to[0] - f.hx) * q, f.hy + (f.to[1] - f.hy) * q, { kit: kits[f.side], skin: f.p.skin, pose: 'run', t: this.clock + f.idx, face: f.to[0] > f.hx ? 1 : -1 });
        }
        const live = ['set', 'windup', 'pitch', 'call', 'play', 'result', 'change'].includes(phase);
        if (live) {
            // The umpire, the batter, the man on deck, and whoever is on base.
            const ump = { kit: A.UMPIRE, skin: 1, back: true, pose: phase === 'call' && this.pt < 0.45 && (play?.call === 'called' || play?.call === 'swinging') ? 'punch' : 'stand' };
            put(0, -12, ump);
            const v = this.view, bat = half, batter = this.man(play?.kind === 'pitch' ? play.batter : v.batter), mover = id => play?.kind === 'pitch' && play.runs.find(m => m.id === id);
            if (batter && !(play?.kind === 'pitch' && (mover(batter.id) || play.result) && (phase === 'play' || phase === 'result'))) {
                const side = batter.bats === 'R' ? -1 : 1, swing = phase === 'pitch' && play.swing && this.pt > this.dur * 0.6;
                put(side * 4.5, 0.5, { kit: kits[bat], skin: batter.skin, back: true, face: -side, pose: swing || (phase === 'call' && play.swing && this.pt < 0.3) ? 'swing' : 'bat', t: swing ? (this.pt / this.dur - 0.6) / 0.4 : 1 });
            }
            const deck = this.man(v.deck);
            if (deck) put(bat ? 42 : -42, 2, { kit: kits[bat], skin: deck.skin, pose: 'bat', face: bat ? -1 : 1, back: true });
            const before = play?.kind === 'pitch' ? play.before.bases : this.game.bases;
            before.forEach((id, i) => {
                if (!id || mover(id)) return;
                const [bx, by] = this.onPath(i + 1, i + 2, 0.08);
                put(bx, by, { kit: kits[bat], skin: this.man(id).skin, pose: 'stand', face: i === 2 ? 1 : -1 });
            });
            if (play?.kind === 'pitch') for (const m of play.runs) {
                const t = this.tl, q = (t - m.t0) / Math.max(0.01, m.t - m.t0), runner = this.man(m.id);
                if (q >= 1 && (m.out || m.to >= 4 || (m.from === 0 && m.to === 0))) {
                    if (!m.gone) { m.gone = true; const [ox, oy] = this.onPath(m.from, Math.max(m.to, m.from), 1); this.puffs.push({ x: ox, y: oy, age: 0, out: m.out }); }
                    continue;
                }
                if (m.from === 0 && m.to === 0) { if (q < 1 && (phase === 'play')) put((runner.bats === 'R' ? -1 : 1) * 4.5 + 2 * Math.max(0, t), 0.5 + 9 * Math.max(0, Math.min(t, 3)), { kit: kits[bat], skin: runner.skin, pose: 'run', t: this.clock, face: 1, back: true }); continue; }
                const [rx, ry] = this.onPath(m.from, m.to, q), sliding = q > 0.86 && q < 1 && play.throws.some(p => p.base === m.to) && m.to < 4;
                put(rx, ry, { kit: kits[bat], skin: runner.skin, pose: q <= 0 || q >= 1 ? 'stand' : sliding ? 'slide' : 'run', t: this.clock * 1.3, face: [1, -1, -1, 1][Math.min(3, Math.floor(m.from + (m.to - m.from) * Math.max(0, Math.min(0.999, q))))], back: q > 0 && q < 1 && m.from + (m.to - m.from) * q < 2 });
            }
        }
        if (phase === 'final' || phase === 'trophy') {
            // The winners, all over each other by the mound.
            const team = this.sides[this.winner];
            if (team) for (let i = 0; i < 8; i++) { const p = team.players[i], a = i / 8 * Math.PI * 2; put(Math.cos(a) * (phase === 'trophy' ? 30 : 15), 40 + Math.sin(a) * (phase === 'trophy' ? 22 : 12), { kit: kits[this.winner], skin: p.skin, pose: 'cheer', t: this.clock + i * 0.37, face: Math.cos(a) > 0 ? -1 : 1 }); }
        }
        // Both benches, and the mascot on the home one.
        for (const side of [0, 1]) {
            const team = this.sides[side];
            for (let i = 0; i < 4; i++) { const [bx, by] = this.bench(side, i); list.push({ sy: -1, draw: () => A.man(c, X(bx), Y(by) + 2, { kit: kits[side], skin: team.players[(i * 3 + side) % 13].skin, pose: 'sit' }) }); }
        }
        const glad = this.cheer > 0.5 || phase === 'stretch', [mx, my] = phase === 'stretch' ? [Math.sin(this.clock * 0.9) * 26, -16] : this.bench(1, 4);
        list.push({ sy: A.py(G, my), draw: () => A.mascot(c, X(mx) + (phase === 'stretch' ? 0 : 7), Y(my) + 1, this.sides[1], this.clock, glad && !this.still) });
        list.sort((p, q) => p.sy - q.sy);
        for (const item of list) item.draw();

        // The ball and its shadow.
        const ball = this.ballNow();
        this.trailed = ball ? [...(this.trailed || []), [X(ball.x), Y(ball.y, ball.z) - 1]].slice(-5) : null;
        if (ball) {
            c.fillStyle = 'rgba(255, 255, 255, 0.35)';
            if (phase === 'play' || phase === 'pitch') for (const [tx, ty] of this.trailed.slice(0, -1)) c.fillRect(tx, ty, 1, 1);
            c.fillStyle = 'rgba(0, 0, 0, 0.35)'; c.fillRect(X(ball.x), Y(ball.y), 2, 1);
            c.fillStyle = '#ffffff'; c.fillRect(X(ball.x), Y(ball.y, ball.z) - 1, 2, 2);
        }
        for (const p of this.puffs) {
            const r = Math.round(1 + p.age * 4), x = X(p.x), y = Y(p.y);
            c.fillStyle = p.out ? '#ffffff' : '#d8b48a';
            c.fillRect(x - r, y - 1, 1, 1); c.fillRect(x + r, y - 1, 1, 1); c.fillRect(x, y - 1 - r, 1, 1); c.fillRect(x - r + 1, y - r, 1, 1); c.fillRect(x + r - 1, y - r, 1, 1);
        }
        if (phase === 'trophy') A.trophy(c, G.bw / 2 + 1, Y(40) - 8 - Math.round(Math.abs(Math.sin(this.clock * 2)) * 3), 2);
        for (const s of this.sparks) { const big = !s.g || s.life < s.max * 0.5 ? 2 : 1; c.fillStyle = s.g && s.life > s.max * 0.75 ? '#8a8a9a' : s.colour; c.fillRect(Math.round(s.x), Math.round(s.y), big, big); }
        c.fillStyle = '#bcd8f4';
        for (const d of this.drops) c.fillRect(Math.round(d.x), Math.round(d.y), 1, 3);
        for (const d of this.dogs) { c.fillStyle = '#e8c070'; c.fillRect(Math.round(d.x) - 2, Math.round(d.y), 4, 2); c.fillStyle = '#b0402f'; c.fillRect(Math.round(d.x) - 2, Math.round(d.y), 4, 1); }
        for (const b of this.balls) {
            const x = Math.round(b.x), y = Math.round(b.y);
            c.fillStyle = '#ffffff'; c.fillRect(x - 2, y - 3, 4, 6); c.fillRect(x - 3, y - 2, 6, 4);
            c.fillStyle = '#e8443a'; c.fillRect(x - 2, y - 2, 2, 2); c.fillStyle = '#3a8ae8'; c.fillRect(x, y, 2, 2); c.fillStyle = '#f2d24a'; c.fillRect(x, y - 2, 2, 2);
        }
        if (this.pop && this.config.captions) {
            const big = this.pop.big && G.bw > 250 ? 2 : 1, y = this.pop.big ? Y(128) - 26 : Y(0) - 26;
            if (this.pop.big || this.pop.t < 0.7) A.text(c, this.pop.text, G.bw / 2, y - Math.min(4, this.pop.t * 12), this.pop.big ? '#fff2a8' : '#ffffff', { scale: big, align: 'center', shadow: '#10142a', small: !this.pop.big });
        }
        // The words are redrawn only when they change: something was said or scored, the kind of phase changed, or a sheet is due.
        const sheet = ((phase === 'half' || phase === 'rain') && this.pt > 1 && this.pt < this.dur - 1.2) || (phase === 'final' && this.pt > 1.2);
        const key = `${this.rev}|${live ? 'live' : phase}|${sheet}|${phase === 'set'}`;
        if (key !== this.wordsKey) { this.wordsKey = key; this.words(); }
        c.drawImage(this.hud, 0, 0);
        if (this.config.captions && live && this.trackerAt) this.tracker(c);
    }

    // The crowd on its feet: in patches when excited, in a band when the wave comes round.
    crowd(c, shift) {
        if (this.still) return;
        const cheer = this.baked.cheer, G = this.G, beat = Math.floor(this.clock * 5);
        if (this.cheer > 0.04 || this.phase === 'stretch') {
            for (let x = 0; x < G.fw; x += 22) {
                const up = this.phase === 'stretch' ? (Math.floor(x / 22) + Math.floor(this.clock * 1.6)) % 2 === 0 : BaseballArt.noise(x, beat) < this.cheer * 0.9;
                if (up) c.drawImage(cheer, x, 0, 22, G.bh, x - shift, 0, 22, G.bh);
            }
        }
        if (this.wave) { const x = Math.max(0, Math.round(this.wave.x) - 12); c.drawImage(cheer, x, 0, 24, G.bh, x - shift, 0, 24, G.bh); }
    }

    seller(c, shift) {
        const v = this.vendor, x = Math.round(v.x) - shift, y = this.baked.rim + 2;
        BaseballArt.man(c, x, y, { kit: { shirt: '#f2d24a', pants: '#f4f1e6', cap: '#d8442f', sock: '#f4f1e6', trim: '#d8442f' }, skin: 1, pose: v.wait > 0 ? 'stand' : 'run', t: this.clock * 0.6, face: v.dir, tray: true });
        const B = this.G.board, under = !B.fixed && v.x > B.x - 24 && v.x < B.x + B.w + 24;      // not across the scoreboard
        if (v.cry > 0 && this.config.captions && !under) BaseballArt.text(c, 'HOT DOGS!', x, y - 20, '#ffffff', { small: true, align: 'center', shadow: '#10142a' });
    }

    // The tarpaulin over the infield, pulled across and later pulled back.
    tarp(c, X, Y) {
        const q = Math.min(1, this.pt / 3, Math.max(0, (this.dur - this.pt) / 2.2)), G = this.G, R = 82;
        for (let y = -18; y < 146; y += 1 / (G.s * BaseballArt.KY)) {
            const half = R - Math.abs(y - 63.64);
            if (half <= 0) continue;
            const x0 = X(-half), w = Math.round((X(half) - x0) * q);
            c.fillStyle = Math.floor(y / 14) % 2 ? '#9fb4c8' : '#8aa2b8';
            c.fillRect(x0, Y(y), w, 1);
        }
    }

    // ---- Words ---------------------------------------------------------------------------------

    // The scoreboard behind centre field: the line score, the count, the outs.
    scoreboard() {
        if (this.boardKey === this.rev && !(this.flash > 0)) return this.board;
        const c = this.board.getContext('2d'), A = BaseballArt, v = this.view, w = this.board.width, h = this.board.height, small = { small: true };
        c.fillStyle = '#0c2a1c'; c.fillRect(0, 0, w, h);
        if (this.flash > 0 && Math.floor(this.flash * 4) % 2 === 0) {
            A.text(c, 'HOME RUN!', w / 2, 9, '#ffe14a', { scale: 2, align: 'center' });
            return this.board;
        }
        const first = Math.max(0, v.inning - 9), col = i => 26 + i * 7;
        c.fillStyle = '#1c4a30'; c.fillRect(1, 7, w - 2, 1);
        for (let i = 0; i < 9; i++) A.text(c, String((first + i + 1) % 100).slice(-1), col(i), 1, '#8fc8a0', small);
        ['R', 'H', 'E'].forEach((k, i) => A.text(c, k, 96 + i * 12, 1, '#ffe14a', small));
        this.sides.forEach((team, side) => {
            const y = 9 + side * 7;
            A.text(c, team.abbr, 4, y, side === v.half && !v.over ? '#ffffff' : '#c8d8c8', small);
            if (side === v.half && !v.over) { c.fillStyle = '#ffe14a'; c.fillRect(1, y + 1, 2, 3); }
            for (let i = 0; i < 9; i++) {
                const runs = v.line[side][first + i];
                // Ten to nineteen in an inning: a thin one in the gap and the unit in its place, in yellow, so the cell still reads as one number.
                if (runs >= 10 && runs < 20) { c.fillStyle = '#ffe14a'; c.fillRect(col(i) - 2, y, 1, 5); A.text(c, String(runs - 10), col(i), y, '#ffe14a', small); continue; }
                A.text(c, runs == null ? (v.over && side === 1 && first + i < v.line[0].length ? 'X' : '') : String(runs), col(i) + 3, y, runs > 9 ? '#ffe14a' : '#f4f1e6', { small: true, align: 'right' });
            }
            [v.R[side], v.H[side], v.E[side]].forEach((n, i) => A.text(c, String(n), 99 + i * 12 + (n > 9 ? 2 : 0), y, i ? '#f4f1e6' : '#ffe14a', { small: true, align: n > 9 ? 'center' : 'left' }));
        });
        c.fillStyle = '#1c4a30'; c.fillRect(1, 23, w - 2, 1);
        const lamps = (label, n, of, x, colour) => { A.text(c, label, x, 25, '#8fc8a0', small); for (let i = 0; i < of; i++) { c.fillStyle = i < n ? colour : '#1c4a30'; c.fillRect(x + 5 + i * 5, 25, 4, 4); } };
        lamps('B', v.balls, 3, 4, '#6ae06a'); lamps('S', v.strikes, 2, 28, '#ff5a5a'); lamps('O', v.outs, 2, 47, '#ffe14a');
        A.text(c, v.over ? 'FINAL' : `${v.half ? 'BOT' : 'TOP'} ${v.inning}`, w - 4, 25, '#ffffff', { small: true, align: 'right' });
        this.boardKey = this.rev;
        return this.board;
    }

    // Everything written over the picture: redrawn only when something has changed.
    words() {
        const c = this.hud.getContext('2d'), G = this.G, A = BaseballArt, world = this.world;
        c.clearRect(0, 0, G.bw, G.bh);
        this.trackerAt = null;
        if (!this.config.captions) return;
        // What the announcer is saying, along the bottom.
        const rects = this.rects = [['ticker', 0, G.tickerY, G.bw, G.ticker]], B = G.board;
        if (B.fixed) rects.push(['board', B.x - 2, B.y - 2, B.w + 4, B.h + 4]);
        c.fillStyle = 'rgba(8, 12, 28, 0.88)'; c.fillRect(0, G.tickerY, G.bw, G.bh - G.tickerY);       // down to the bottom edge, so the kept-clear strip is not a hole
        c.fillStyle = '#c8343a'; c.fillRect(0, G.tickerY, G.bw, 1);
        const room = G.bw - 8, most = G.portrait ? 2 : 1;
        let lines = A.wrap(this.line, room, false), tiny = false;
        if (lines.length > most) { tiny = true; lines = A.wrap(this.line, room, true); }
        lines.slice(0, tiny ? most + 1 : most).forEach((line, i) => A.text(c, line, 4, G.tickerY + (tiny ? 2 : 3) + i * (tiny ? 6 : 8), '#fff2a8', { small: tiny }));

        const game = this.game, live = ['set', 'windup', 'pitch', 'call', 'play', 'result', 'change'].includes(this.phase);
        // The two cards: who is up, and who is throwing to him.
        if (live && game) {
            const v = this.view, batter = this.man(v.batter), arm = this.man(v.pitcher), S = BaseballLeague, bs = batter.s, as = arm.s, bb = game.box[batter.id] || {}, ab = game.box[arm.id] || {};
            const wide = G.portrait ? G.bw - 4 : 152, by = G.portrait ? G.cardsY + 1 : G.tickerY - 40, ax = G.portrait ? 2 : G.bw - wide - 2, ay = G.portrait ? by + 39 : by;
            const fit = (string, x, y, room, colour) => A.text(c, string, x, y + (A.width(string) > room ? 1 : 0), colour, { small: A.width(string) > room });
            const stat = (o, k) => o[k] || 0;
            A.box(c, 2, by, wide, 38);
            rects.push(['batter', 2, by, wide, 38], ['pitcher', ax, ay, wide, 38]);
            A.man(c, 9, by + 16, { kit: this.kits[v.half], skin: batter.skin, pose: 'bat', face: 1 });
            fit(S.called(batter), 18, by + 3, wide - 22, '#ffffff');
            A.text(c, `${S.average(bs)}  ${stat(bs, 'hr')} HR  ${stat(bs, 'rbi')} RBI`, 18, by + 12, '#ffe14a');
            const today = bb.ab ? `TODAY ${stat(bb, 'h')} FOR ${bb.ab}${bb.hr ? `, ${bb.hr > 1 ? bb.hr + ' ' : ''}HR` : ''}${bb.bb ? `, ${bb.bb > 1 ? bb.bb + ' ' : ''}BB` : ''}` : '';
            const note = batter.streak >= 5 ? `${batter.streak}-GAME HITTING STREAK` : batter.dry >= 10 ? `0 FOR HIS LAST ${batter.dry}` : today || `AGE ${batter.age}${batter.c.yrs ? `, ${BaseballTalk.ordinal(batter.c.yrs + 1)} SEASON` : batter.rk ? ', A ROOKIE' : ''}`;
            A.text(c, `${batter.mix ? 'P' : batter.pos}  ${note}`, 5, by + 23, '#9fd8ff', { small: true });
            A.text(c, `BATS ${batter.bats === 'L' ? 'LEFT' : 'RIGHT'}${stat(bs, 'sb') ? `  ${bs.sb} SB` : ''}${today && note !== today ? `  ${today}` : ''}`.slice(0, Math.floor((wide - 8) / 4)), 5, by + 30, '#8a94b0', { small: true });

            A.box(c, ax, ay, wide, 38);
            fit(S.called(arm), ax + 4, ay + 3, wide - 36, '#ffffff');
            A.text(c, `${stat(as, 'w')}-${stat(as, 'l')}  ${S.era(as)}  ${stat(as, 'ka')} K`, ax + 4, ay + 12, '#ffe14a');
            A.text(c, this.thrown && this.phase !== 'set' ? this.thrown : `THROWS ${arm.throws === 'L' ? 'LEFT' : 'RIGHT'}  ${arm.mix.map(k => k).join(' ')}`, ax + 4, ay + 23, '#9fd8ff', { small: true });
            A.text(c, `TODAY ${S.innings(ab)} IP  ${stat(ab, 'ka')} K  ${stat(ab, 'pc')} THROWN${stat(as, 'sv') ? `  ${as.sv} SV` : ''}`.slice(0, Math.floor((wide - 36) / 4)), ax + 4, ay + 30, '#8a94b0', { small: true });
            // The pitch tracker's frame: the strike zone, and where each pitch of this turn went.
            const tx = ax + wide - 17, ty = ay + 18;
            this.trackerAt = [tx, ty];
            c.fillStyle = '#10182e'; c.fillRect(tx - 14, ty - 16, 29, 33);
            c.fillStyle = '#5a6488'; c.fillRect(tx - 6, ty - 8, 13, 1); c.fillRect(tx - 6, ty + 8, 13, 1); c.fillRect(tx - 6, ty - 8, 1, 17); c.fillRect(tx + 6, ty - 8, 1, 17);
        }
        // Top left: the league and the day. Top right: the other games.
        const half = G.portrait ? Math.floor(G.bw / 2) - 3 : 124, sm = { small: true }, a = this.sides?.[0], h = this.sides?.[1];
        // Under a fixed scoreboard they sit below it, and only as deep as the sky and the far seats allow.
        const py0 = B.fixed ? B.y + B.h + 5 : 2, deep = B.fixed ? Math.min(6, Math.floor((G.top + 14 - py0 - 3) / 6)) : 5;
        if (h && G.top > 34 && deep >= 3) {
            const s = world.series, title = world.stage === 'series' || world.stage === 'champion' ? `SERIES: ${world.teams[s.a].abbr} ${s.wins[0]}  ${world.teams[s.b].abbr} ${s.wins[1]}` : `SEASON ${world.season}  DAY ${Math.min(world.day + 1, BaseballLeague.DAYS)} OF ${BaseballLeague.DAYS}`;
            const rows = [...A.wrap(world.name, half - 6, true), title, ...A.wrap(`${h.park.name}: ${h.park.quirk}`, half - 6, true)].slice(0, deep);
            c.fillStyle = 'rgba(8, 12, 28, 0.7)'; c.fillRect(2, py0, half, rows.length * 6 + 3);
            rects.push(['league', 2, py0, half, rows.length * 6 + 3]);
            rows.forEach((row, i) => A.text(c, row, 5, py0 + 2 + i * 6, i === 0 ? '#ffe14a' : row === title ? '#ffffff' : '#9fd8ff', sm));
            const others = world.others || [];
            if (others.length) {
                const x = G.bw - half - 2, through = this.view.over ? 99 : this.view.inning - 1;
                c.fillStyle = 'rgba(8, 12, 28, 0.7)'; c.fillRect(x, py0, half, 9 + others.length * 6);
                rects.push(['around', x, py0, half, 9 + others.length * 6]);
                A.text(c, 'AROUND THE LEAGUE', x + 3, py0 + 2, '#ffe14a', sm);
                others.forEach((o, i) => {
                    const done = through >= o.line[0].length, sum = side => o.line[side].slice(0, through).reduce((p, q) => p + q, 0);
                    const text = `${world.teams[o.away].abbr} ${done ? o.R[0] : sum(0)}  ${world.teams[o.home].abbr} ${done ? o.R[1] : sum(1)}  ${done ? 'F' : through < 1 ? '' : through + 1}`;
                    A.text(c, text, x + 3, py0 + 8 + i * 6, done ? '#ffffff' : '#9fd8ff', sm);
                });
            } else if (a && world.wire.length) {
                const x = G.bw - half - 2, item = world.wire.at(-1), text = item.type === 'nick' ? `${item.name} IS NOW "${item.nick}"` : item.type === 'nohit' ? `NO-HITTER: ${item.name}` : `${item.name}: ${Math.abs(item.n)} ${item.n > 0 ? 'WINS' : 'LOSSES'} RUNNING`;
                const rows = A.wrap(text, half - 6, true).slice(0, 3);
                c.fillStyle = 'rgba(8, 12, 28, 0.7)'; c.fillRect(x, py0, half, 9 + rows.length * 6);
                rects.push(['around', x, py0, half, 9 + rows.length * 6]);
                A.text(c, 'ON THE WIRE', x + 3, py0 + 2, '#ffe14a', sm);
                rows.forEach((row, i) => A.text(c, row, x + 3, py0 + 8 + i * 6, '#9fd8ff', sm));
            }
        }
        this.sheets(c);
    }

    // The pitch tracker's moving parts: this turn's pitches, and the one in the air.
    tracker(c) {
        const [tx, ty] = this.trackerAt, play = this.play, dot = (x, z, colour, r = 1) => { c.fillStyle = colour; c.fillRect(Math.round(tx + Math.max(-2.1, Math.min(2.1, x)) * 6) - r + 1, Math.round(ty - Math.max(-1.9, Math.min(1.9, z)) * 8) - r + 1, r * 2 - 1 + (r > 1 ? 0 : 1), r * 2 - 1 + (r > 1 ? 0 : 1)); };
        if (play?.kind !== 'pitch') return;
        this.trail = this.trail?.batter === play.batter ? this.trail : { batter: play.batter, list: [] };
        const p = play.pitch, colour = play.call === 'ball' || play.call === 'hbp' ? '#6ae06a' : play.call === 'inplay' ? '#6ac8ff' : '#ff5a5a';
        for (const old of this.trail.list) if (old.p !== p) dot(old.p.x, old.p.z, old.colour);
        if (this.phase === 'windup') return;
        if (this.phase === 'pitch') { const q = this.pt / this.dur, k = 1 - q; return dot(p.x - p.bend[0] * k * 1.2, p.z - p.bend[1] * k * 1.2 + k * 0.6, '#ffffff', q > 0.6 ? 2 : 1); }
        if (!this.trail.list.some(o => o.p === p)) this.trail.list.push({ p, colour });
        dot(p.x, p.z, colour, 2);
    }

    // The big sheets: before a game, between innings, after one, the standings, the trophy, the winter.
    sheets(c) {
        const G = this.G, A = BaseballArt, world = this.world, S = BaseballLeague, phase = this.phase, [a, h] = this.sides, wide = Math.min(G.bw - 6, 262), chars = Math.floor((wide - 10) / 6);
        const paper = (title, rows, accent) => {
            const tall = 14 + rows.reduce((sum, row) => sum + (row.small ? 6 : row.gap ? 3 : 9), 0) + 3, x = Math.round((G.bw - wide) / 2), y = Math.max(2, Math.round((G.top + G.homeY - tall) / 2) - 6);
            A.box(c, x, y, wide, tall, title, accent);
            let ty = y + 13;
            for (const row of rows) {
                if (row.gap) { ty += 3; continue; }
                A.text(c, row.text, row.center ? x + wide / 2 : x + 5, ty, row.colour || '#f4f1e6', { small: row.small, align: row.center ? 'center' : 'left' });
                if (row.right) A.text(c, row.right, x + wide - 5, ty, row.colour || '#f4f1e6', { small: row.small, align: 'right' });
                ty += row.small ? 6 : 9;
            }
        };
        const record = t => `${t.w}-${t.l}`, pad = (string, n) => String(string).slice(0, n).padEnd(n);
        const table = () => S.standings(world).map((t, i) => ({ text: `${i + 1} ${pad(chars < 34 ? t.name : `${t.town} ${t.name}`, chars - 18)}`, right: `${pad(record(t), 5)} ${S.pct(t).toFixed(3).replace(/^0/, '')} ${String(t.rs - t.ra > 0 ? '+' + (t.rs - t.ra) : t.rs - t.ra).padStart(4)}`, colour: t === a || t === h ? '#ffe14a' : i < 2 ? '#ffffff' : '#c8d0e0' }));
        const leading = (keys) => {
            const tops = S.leaders(world, 3), rows = [];
            for (const [key, label] of keys) {
                rows.push({ text: label, small: true, colour: '#ffe14a' });
                for (const e of tops[key]) rows.push({ text: pad(e.nick ? `"${e.nick}" ${e.name}` : e.name, chars - 10), right: `${e.abbr} ${e.text.padStart(5)}`, colour: '#f4f1e6' });
                rows.push({ gap: true });
            }
            return rows.slice(0, -1);
        };
        if (this.peek === 1) return paper(world.stage === 'season' ? `STANDINGS, SEASON ${world.season}` : 'THE FINAL STANDINGS', table(), '#2a5fb0');
        if (this.peek === 2) return paper('THE LEADING BATS', leading([['avg', 'BATTING AVERAGE'], ['hr', 'HOME RUNS'], ['rbi', 'RUNS BATTED IN'], ['sb', 'STOLEN BASES']]), '#1f7a4c');
        if (this.peek === 3) return paper('THE LEADING ARMS', leading([['era', 'EARNED RUN AVERAGE'], ['w', 'WINS'], ['k', 'STRIKEOUTS'], ['sv', 'SAVES']]), '#6b3fa0');
        const center = (text, more = {}) => ({ text, center: true, ...more });
        if (phase === 'pregame') {
            const arms = this.fielders ? [this.man(this.game.pit[0]), this.man(this.game.pit[1])] : [], s = world.series;
            const sub = world.stage === 'series' ? `GAME ${s.wins[0] + s.wins[1] + 1}. ${world.teams[s.a].abbr} ${s.wins[0]}, ${world.teams[s.b].abbr} ${s.wins[1]}. FIRST TO ${S.SERIES}.` : `SEASON ${world.season}, DAY ${world.day + 1} OF ${S.DAYS}`;
            return paper(world.stage === 'series' ? `${S.TROPHY} SERIES`.slice(0, chars) : "TODAY'S GAME", [center(sub, { small: true, colour: '#9fd8ff' }), { gap: true },
                center(`${a.town} ${a.name}`.slice(0, chars), { colour: '#ffffff' }), center(`(${record(a)})  AT`, { small: true, colour: '#9fd8ff' }), center(`${h.town} ${h.name}`.slice(0, chars), { colour: '#ffffff' }), center(`(${record(h)})`, { small: true, colour: '#9fd8ff' }), { gap: true },
                ...arms.map((p, i) => center(`${[a, h][i].abbr}: ${S.called(p)} ${p.s.w || 0}-${p.s.l || 0}, ${S.era(p.s)}`.slice(0, Math.floor((wide - 8) / 4)), { small: true })), { gap: true },
                center(h.park.name, { colour: '#ffe14a' }), ...A.wrap(h.park.quirk, wide - 12, true).map(text => center(text, { small: true, colour: '#9fd8ff' }))], h.colours[0]);
        }
        if (phase === 'final' && this.pt > 1.2) {
            const g = this.game, find = id => (id ? this.man(id) : null), w = find(g.wp), l = find(g.lp), sv = find(g.sv), rows = [];
            for (const side of [0, 1]) rows.push({ text: pad(`${this.sides[side].town} ${this.sides[side].name}`, chars - 9), right: `${String(g.R[side]).padStart(2)} ${String(g.H[side]).padStart(2)} ${String(g.E[side]).padStart(2)}`, colour: side === this.winner ? '#ffe14a' : '#f4f1e6' });
            rows.push({ gap: true }, { text: `W: ${S.called(w)} (${w.s.w || 0}-${w.s.l || 0})`, small: true }, { text: `L: ${S.called(l)} (${l.s.w || 0}-${l.s.l || 0})`, small: true });
            if (sv) rows.push({ text: `SAVE: ${S.called(sv)} (${sv.s.sv})`, small: true });
            // The man of the match: the bat that did the most.
            const star = Object.entries(g.box).map(([id, b]) => ({ p: this.man(+id), b, worth: (b.h || 0) + 2 * (b.hr || 0) + (b.rbi || 0) + (b.ka || 0) / 4 + (b.outs || 0) / 6 - (b.ra || 0) })).sort((p, q) => q.worth - p.worth)[0];
            if (star) rows.push({ gap: true }, { text: `STAR: ${S.called(star.p)}`, small: true, colour: '#9fd8ff' }, { text: star.b.outs ? `${S.innings(star.b)} IP, ${star.b.ka || 0} K, ${star.b.ra || 0} R` : `${star.b.h || 0} FOR ${star.b.ab || 0}${star.b.hr ? `, ${star.b.hr} HR` : ''}${star.b.rbi ? `, ${star.b.rbi} RBI` : ''}`, small: true, colour: '#9fd8ff' });
            return paper(g.inning > g.innings ? `FINAL, ${g.inning} INNINGS` : 'FINAL', rows, this.sides[this.winner].colours[0]);
        }
        if (phase === 'table') {
            if (world.stage === 'series') {
                const s = world.series, A1 = world.teams[s.a], B1 = world.teams[s.b];
                return paper(`${S.TROPHY} SERIES`.slice(0, chars), [center(`BEST OF ${S.SERIES * 2 - 1}`, { small: true, colour: '#9fd8ff' }), { gap: true }, { text: pad(`${A1.town} ${A1.name}`, chars - 3), right: String(s.wins[0]), colour: '#ffffff' }, { text: pad(`${B1.town} ${B1.name}`, chars - 3), right: String(s.wins[1]), colour: '#ffffff' }], '#b8860b');
            }
            return paper(`STANDINGS AFTER DAY ${world.day}`, table(), '#2a5fb0');
        }
        if ((phase === 'half' || phase === 'rain') && this.pt > 1 && this.pt < this.dur - 1.2) {
            const which = this.breaks % 4;
            if (which === 1) return paper(`STANDINGS, SEASON ${world.season}`, table(), '#2a5fb0');
            if (which === 2) return paper('THE LEADING BATS', leading([['avg', 'BATTING AVERAGE'], ['hr', 'HOME RUNS'], ['rbi', 'RUNS BATTED IN']]), '#1f7a4c');
            if (which === 0) return paper('THE LEADING ARMS', leading([['era', 'EARNED RUN AVERAGE'], ['k', 'STRIKEOUTS'], ['sv', 'SAVES']]), '#6b3fa0');
            const named = world.teams.flatMap(t => t.players.filter(p => p.nick).map(p => ({ p, t }))).sort((p, q) => (q.p.tier - p.p.tier) || (q.p.id * 7 + this.breaks) % 13 - (p.p.id * 7 + this.breaks) % 13).slice(0, 7);
            if (named.length) return paper('KNOW YOUR LEAGUE', named.map(e => ({ text: pad(`"${e.p.nick}" ${e.p.last}`, chars - 4), right: e.t.abbr })), '#e07a1f');
            return paper(`STANDINGS, SEASON ${world.season}`, table(), '#2a5fb0');
        }
        if (phase === 'trophy') {
            const champ = world.teams[world.champion], x = Math.round((G.bw - wide) / 2), y = G.top + 14;
            A.box(c, x, y, wide, 34, `CHAMPIONS, SEASON ${world.season}`, '#b8860b');
            A.text(c, `${champ.town} ${champ.name}`.slice(0, chars), G.bw / 2, y + 13, '#ffe14a', { align: 'center' });
            A.text(c, `WIN ${S.TROPHY}`, G.bw / 2, y + 24, '#ffffff', { small: true, align: 'center' });
            return;
        }
        if (phase === 'news') {
            const order = ['champion', 'series', 'prize', 'cellar', 'retired', 'rookie'], small = Math.floor((wide - 10) / 4);
            const rows = (this.news || []).slice().sort((p, q) => order.indexOf(p.type) - order.indexOf(q.type)).slice(0, 15).map(n => ({ small: true, colour: n.type === 'champion' ? '#ffe14a' : n.type === 'prize' ? '#ffffff' : n.type === 'rookie' ? '#9fe8a8' : n.type === 'series' ? '#ffe14a' : '#c8d0e0', text: ({
                series: `THE ${n.team} BEAT THE ${n.over} ${n.wins}-${n.losses} IN THE SERIES`,
                cellar: `LAST, AND NOT FOR WANT OF TRYING: ${n.team} (${n.w}-${n.l})`,
                champion: `SEASON ${n.season} CHAMPIONS: ${n.team}`,
                prize: `${n.prize}: ${n.name} (${n.abbr}) ${n.text}`,
                retired: `RETIRED: ${n.name} (${n.abbr}), ${n.yrs} YRS, ${n.arm ? `${n.w} WINS, ${n.ka} K` : `${n.h} HITS, ${n.hr} HR`}`,
                rookie: `UP FROM THE FARM: ${n.name}, ${n.pos}, ${n.age} (${n.abbr})`,
            })[n.type].slice(0, small) }));
            return paper(`THE WINTER BEFORE SEASON ${world.season}`.slice(0, chars), rows, '#243a6b');
        }
    }
}
