// Pocket Hockey (SPEC §10.36): a whole invented league of three-on-three
// hockey, in top-down pixel art. Eight clubs, a season of fourteen rounds,
// playoffs for the Big Biscuit Tin, and then the summer and another
// season. One game of each round is played in front of you, by real little
// physics and players who steer for themselves (hockey-logic.js); the
// others are played out of sight and their scores come in. The league
// lives in host.storage, and only moves on while the wallpaper is on
// screen; a game picks up at the very step it was left.
//
//   hockey-logic.js   the league, the players, the game (pure, unit-tested)
//   hockey-art.js     the font, the arena, the figures
//   pocket-hockey.js  this: the manager that stages it
//
// Cheap: the picture is a few hundred pixels across, scaled up pixelated.
// The arena is one baked canvas a game; a frame draws it, two thin layers
// for the marks on the ice, a dozen small sprites and some lettering.

const HOCKEY_PERIODS = { short: 2700, normal: 4500, long: 7200 };
// How long each thing that is not hockey stays up, seconds.
const HOCKEY_SHOW = { pregame: 6.5, postgame: 10, standings: 8.5, ceremony: 14, offseason: 12 };
const HOCKEY_ORD = ['', '1ST', '2ND', '3RD', 'OT', 'SD'];
const HOCKEY_THINGS = ['hat', 'teddy', 'duck', 'fish', 'sock', 'donut'];
const HOCKEY_THING_NAMES = { hat: 'HAT', teddy: 'TEDDY BEAR', duck: 'RUBBER DUCK', fish: 'FISH', sock: 'SOCK', donut: 'DOUGHNUT' };
// The announcer. N the man, V the other man, T his club, M his move, H who helped, K a thing, O a period, R the rink.
const HOCKEY_CALLS = {
    goal: ['N SCORES! THE T FAITHFUL ARE ON THEIR FEET!', 'HE SHOOTS, HE SCORES! N!', 'N! TOP SHELF, WHERE THE GOOD BISCUITS ARE KEPT!', 'N BURIES IT! SOMEBODY CHECK ON THE GOALIE!', 'OH MY! OH MY! N!',
        'N! IN LIKE A LETTER THROUGH A LETTERBOX!', 'N LIGHTS THE LAMP FOR THE T!'],
    assist: ['N SCORES! A LOVELY FEED FROM H!', 'H FINDS N AND N FINDS THE NET!', 'TIC, TAC, N! H WITH THE HELPER!'],
    move: ['N WITH M! GOAL! GOAL! GOAL!', 'THEY CALL IT M AND NOW YOU KNOW WHY! N SCORES!', 'M! N! UNSTOPPABLE!'],
    empty: ['N INTO THE EMPTY NET! THAT WILL DO IT!', 'NOBODY HOME! N SLIDES IT IN!'],
    rebound: ['N CLEANS UP THE REBOUND! A GARBAGE GOAL, A GLORIOUS GOAL!', 'SAVE... AND N PUTS BACK THE REBOUND!'],
    scramble: ['IT GOES IN OFF SOMETHING! N WILL TAKE IT!', 'A MAD SCRAMBLE AND N POKES IT HOME!'],
    far: ['FROM DOWNTOWN! N FROM ANOTHER POSTCODE!', 'N FROM WAY OUT! DID ANYONE SEE THAT? THE GOALIE DID NOT!'],
    keeper: ['THE GOALIE! THE GOALIE HAS SCORED! N! I HAVE NOW SEEN EVERYTHING!'],
    winner: ['N WINS IT! EVERYBODY GO HOME HAPPY! WELL, HALF OF YOU!', 'N ENDS IT! WHAT A FINISH FOR THE T!'],
    save: ['WHAT A SAVE BY N!', 'N SAYS NO!', 'ROBBERY! SOMEBODY ARREST N!', 'N STANDS ON HIS TINY HEAD!', 'N SHUTS THE DOOR!'],
    saveMove: ['N WITH M! NOT TODAY!', 'M! N MAKES IT LOOK EASY!'],
    post: ['OFF THE POST! THE POST IS HAVING A GREAT GAME!', 'DING! N RINGS IT OFF THE IRON!', 'N HITS THE POST! SO CLOSE!'],
    hit: ['N FLATTENS V! THAT RATTLED MY FILLINGS!', 'V JUST MET N. THEY DID NOT GET ALONG.', 'BOOM! N! SOMEBODY SCRAPE V OFF THE ICE!', 'N SENDS V INTO NEXT WEEK!'],
    hitMove: ['M! N RUNS RIGHT THROUGH V!', 'N DELIVERS M! V NEVER SAW IT!'],
    steal: ['N PICKS HIS POCKET!', 'N STEALS IT! FINDERS KEEPERS!', 'N STRIPS V CLEAN!'],
    stealMove: ['M! N TAKES IT AWAY FROM V!'],
    pick: ['N READS IT ALL THE WAY!', 'PICKED OFF BY N!'],
    block: ['N BLOCKS IT! THAT WILL LEAVE A MARK!', 'N GETS IN THE WAY, BLESS HIM!'],
    spin: ['N WITH M! ROUND AND ROUND HE GOES!', 'M! N LEAVES V SPINNING!'],
    dangle: ['M! N HAS THE PUCK ON A STRING!', 'N WITH M! NOW YOU SEE IT...'],
    jet: ['M! N IS GONE! CALL AIR TRAFFIC CONTROL!', 'N HITS THE GAS! M!'],
    slapper: ['N WINDS UP M...', 'HERE COMES M FROM N...'],
    onetimer: ['M! N DID NOT EVEN SAY HELLO TO IT!', 'N WITH M, FIRST TIME!'],
    oops: ['N AND V RUN INTO EACH OTHER! SAME TEAM, LADS!', 'A MEETING OF MINDS: N AND V, BOTH DOWN!'],
    crash: ['N CRASHES THE NET AND THE NET WINS!', 'N TRIES TO GO THROUGH THE GOALIE. NO.'],
    slip: ['N SLIPS ON A K! WHO THROWS A K?!', 'A K ON THE ICE AND DOWN GOES N!'],
    pull: ['THE T PULL THE GOALIE! IT IS ALL OR NOTHING!', 'THE T NET IS EMPTY! AN EXTRA SKATER IS ON!'],
    heave: ['N LETS IT FLY THE LENGTH OF THE ICE...'],
    change: ['FRESH LEGS FOR THE T', 'THE T CHANGE ON THE FLY'],
    period: ['THAT IS THE END OF THE O! HERE COMES OLD SMOOTHIE!', 'THE O IS IN THE BOOKS! MAKE WAY FOR OLD SMOOTHIE!'],
    overtime: ['OVERTIME! TWO ON TWO! NOBODY BREATHE!'],
    showdown: ['STILL TIED! BOTH GOALIES TO THE BENCH! NEXT GOAL WINS!'],
    hattrick: ['A HAT TRICK FOR N! HATS! HATS EVERYWHERE!'],
    under: ['WE ARE UNDER WAY AT R!', 'THE PUCK IS DOWN AT R!'],
    chat: ['TIGHT CHECKING OUT THERE', 'THE T FAITHFUL ARE LOUD TONIGHT', 'A REMINDER: THE PUCK IS THE SMALL BLACK THING', 'THE SNACK BAR CLOSES AFTER THE SECOND', 'END TO END STUFF!',
        'THE ICE AT R IS FAST TONIGHT', 'YOU COULD CUT THE TENSION WITH A SKATE'],
};

class PocketHockeyAnimationManager {
    constructor(host) {
        this.host = host;
        this.config = WP.settings.load();
        this.running = false;
        this.clock = 0;
        this.acc = 0;
        this.last = 0;
        this.particles = [];
        this.thrown = [];
        this.hats = [];
        this.tags = [];
        this.cheer = [0, 0];
        this.lamp = [0, 0];
        this.flash = 0;
        this.wave = null;
        this.caption = null;
        this.quiet = 0;
        this.banner = null;
        this.board = 0;
        this.boardT = 0;
        this.notes = [];
        this.news = [];
        this.bg = null;
        this.queue = [];
        this.allow = 0;
        this.stats = { taps: 0, thrown: 0, waves: 0, goals: 0 };
        this.onResize = () => this.resize();
    }

    // ---- Lifecycle ------------------------------------------------------------------
    start() {
        if (this.running) return;
        this.running = true;
        const canvas = this.canvas = document.createElement('canvas');
        Object.assign(canvas.style, { position: 'fixed', left: '0', top: '0', zIndex: '-1', pointerEvents: 'none', imageRendering: 'pixelated' });
        document.body.appendChild(canvas);
        this.ctx = canvas.getContext('2d');
        window.addEventListener('resize', this.onResize);
        const L = HockeyLogic, thumb = this.host.params.thumb;
        const league = thumb ? null : this.host.storage.get('league'), known = !!league && league.v === 1 && league.teams?.length === L.TEAMS.length;
        this.world = known ? league : L.newWorld(Math.floor(Math.random() * 2 ** 32));
        const game = thumb ? null : this.host.storage.get('game');
        this.layout();
        if (known && game && game.v === 1 && game.league === this.world.seed && this.world.fixtures[game.k]?.key === game.key && !this.world.fixtures[game.k].done) this.resume(game);
        else if (this.world.stage === 'champion') { this.dress(this.world.champion, this.world.champion); this.setShow('ceremony'); } else this.begin(!known);
        if (!known) { this.save(); this.saveGame(); }
        if (!thumb) this.stopGestures = this.host.gestures({ tap: (x, y) => { if (this.config.touch) this.tap(x, y); } });
        this.update(0);
        this.draw();
        this.frameId = requestAnimationFrame(t => this.frame(t));
    }

    stop() {
        if (!this.running) return;
        this.running = false;
        cancelAnimationFrame(this.frameId);
        window.removeEventListener('resize', this.onResize);
        this.stopGestures?.();
        this.canvas.remove();
        this.canvas = this.ctx = null;
    }

    onPause() { this.saveGame(); }
    onQuality() { /* counts are read from host.quality as things are spawned: nothing to rebuild */ }
    get density() { return this.host.quality?.density ?? 1; }

    applySettings(config) {
        this.config = config;       // the period length and the club to follow take effect with the next game
        this.tell();
    }

    onAction(name) {
        if (name !== 'reset') return;
        this.world = HockeyLogic.newWorld(Math.floor(Math.random() * 2 ** 32));
        this.bg = null;
        this.save();
        this.begin(false);
        this.host.toast('A new league is founded');
    }

    save() { if (!this.host.params.thumb) this.host.storage.set('league', this.world); }
    saveGame() { if (!this.host.params.thumb && this.game && !this.recorded) this.host.storage.set('game', this.game); }
    // What the panel says of the league.
    tell() {
        const L = HockeyLogic, w = this.world, top = L.standings(w)[0];
        const where = w.stage === 'regular' ? `round ${w.round + 1} of ${w.schedule.length}` : w.stage === 'semi' ? 'the semi-finals' : w.stage === 'final' ? 'the final' : 'the trophy is being given';
        this.host.panel({ status: { league: `Season ${w.season}, ${where}. ${L.TEAMS[top.i].town} ${L.TEAMS[top.i].nick} lead the table.` } });
    }

    // ---- Games ----------------------------------------------------------------------
    roundKey() { const w = this.world; return `${w.season}:${w.stage}:${w.round}`; }

    // The next game to watch. `midway` (a brand new league) drops straight into the middle of a period.
    begin(midway) {
        const L = HockeyLogic, w = this.world, k = L.featured(w, this.config.follow);
        this.round = this.roundKey();
        this.game = L.newGame(w, k, { period: HOCKEY_PERIODS[this.config.period] });
        this.queue = w.fixtures.map((f, n) => n).filter(n => n !== k && !w.fixtures[n].done);
        this.afresh();
        if (midway) {
            const g = this.game;
            for (let n = 0; n < 4200 && !(n > 1500 && g.phase === 'play' && g.puck.owner >= 0 && Math.abs(g.puck.x) > 25); n++) L.step(g);
            this.seen = g.evN;
            this.setShow('game');
        } else { this.game.wait = true; this.setShow('pregame'); }
        this.dress(this.game.home, this.game.away);
        this.tell();
    }

    resume(game) {
        const w = this.world;
        this.round = this.roundKey();
        this.game = game;
        this.queue = w.fixtures.map((f, n) => n).filter(n => n !== game.k && !w.fixtures[n].done);
        this.afresh();
        this.seen = game.evN;
        this.allow = game.period - 1;
        this.setShow(game.wait ? 'pregame' : 'game');
        this.dress(game.home, game.away);
        this.tell();
    }

    afresh() {
        Object.assign(this, { seen: 0, recorded: false, allow: 0, acc: 0, notes: [], hats: [], thrown: [], tags: [], caption: null, banner: null, cheer: [0, 0], lamp: [0, 0], quiet: 0 });
    }

    setShow(show) { this.show = show; this.showT = 0; }

    // The game is over: into the league it goes, and the rest of the round is hurried along.
    finish() {
        const g = this.game;
        this.recorded = true;
        this.notes = HockeyLogic.record(this.world, g);
        this.allow = 99;
        this.save();
        if (!this.host.params.thumb) this.host.storage.set('game', null);
        this.setShow('postgame');
        this.tell();
    }

    // The round's other games, played a few milliseconds at a time so nothing stutters.
    background() {
        const L = HockeyLogic;
        if (!this.bg) {
            if (!this.queue.length || this.allow < 1 || this.round !== this.roundKey()) return;
            this.allow--;
            this.bg = L.newGame(this.world, this.queue.shift(), { fast: true, period: this.game ? this.game.len : HOCKEY_PERIODS[this.config.period] });
        }
        const bg = this.bg, until = performance.now() + 4;
        while (!bg.done && performance.now() < until) for (let n = 0; n < 150 && !bg.done; n++) L.step(bg);
        if (!bg.done) return;
        const notes = L.record(this.world, bg);
        this.bg = null;
        this.save();
        const T = L.TEAMS, special = notes.find(n => n.type === 'keeper') || notes.find(n => n.type === 'hat');
        if (special) this.say(special.type === 'keeper' ? `ELSEWHERE: A GOALIE GOAL FOR ${this.sur(special.name)} OF THE ${T[special.team].nick.toUpperCase()}!` : `ELSEWHERE: A HAT TRICK FOR ${this.sur(special.name)} (${T[special.team].code})`, 2, 5);
    }

    sur(name) { return name.slice(name.indexOf(' ') + 1).toUpperCase(); }

    // ---- Keys and taps (declared in the catalog) ---------------------------------------
    skip() {
        const L = HockeyLogic, g = this.game;
        if (this.show === 'game' && g && !g.done) {
            if (g.phase === 'play' || g.phase === 'goal') {
                // Through any goals and their celebrations, to the horn.
                g.fast = true;
                for (let n = 0; n < 12000 && g.phase !== 'break' && !g.done; n++) { L.step(g); this.afterStep(g, true); }
                g.fast = false;
            } else g.phaseT = 1e6;
            return 'Skipping ahead';
        }
        if (this.show === 'pregame' && g) g.wait = false;
        this.showT = 1e6;
        return 'On with it';
    }

    toFinal() {
        const L = HockeyLogic, g = this.game;
        if (!g || g.done || (this.show !== 'game' && this.show !== 'pregame')) return this.skip();
        g.wait = false;
        g.fast = true;
        if (this.show === 'pregame') this.setShow('game');
        for (let n = 0; n < 200000 && !g.done; n++) { L.step(g); this.afterStep(g, true); }
        g.fast = false;
        return 'To the final horn';
    }

    showBoard() {
        this.board = (this.board + 1) % 3;
        this.boardT = 9;
    }

    startWave(x = 0) {
        this.wave = { x, t: 0 };
        this.stats.waves++;
        return 'The wave!';
    }

    throwSomething() {
        const pk = this.game?.puck;
        const x = Math.max(-70, Math.min(70, (pk ? pk.x : 0) + (Math.random() - 0.5) * 50)), y = (Math.random() - 0.5) * 60;
        this.toss(x, y);
        return `Somebody has thrown a ${HOCKEY_THING_NAMES[this.thrown.at(-1)?.kind || 'hat'].toLowerCase()}`;
    }

    toss(x, y) {
        const v = this.view, kind = HOCKEY_THINGS[Math.floor(Math.random() * HOCKEY_THINGS.length)];
        const tx = v.X(x, y), ty = v.Y(x, y), fromTop = ty < v.cy;
        this.thrown.push({ kind, x, y, sx: tx + (Math.random() - 0.5) * 40, sy: fromTop ? v.top - 4 : v.bottom + 6, tx, ty, t: 0, hazard: true });
        this.stats.thrown++;
    }

    // A tap on the ice throws something onto it; a tap in the seats gets that end of the crowd up.
    tap(cssX, cssY) {
        const L = HockeyLogic, v = this.view, sx = cssX / v.px, sy = cssY / v.px, [x, y] = v.back(sx, sy);
        this.stats.taps++;
        if (L.inside(x, y, 3) && this.game && !this.game.done) this.toss(x, y);
        else { this.startWave(sx); this.cheer[0] = Math.max(this.cheer[0], 0.5); }
    }

    // ---- Layout -----------------------------------------------------------------------
    layout() {
        const A = HockeyArt, v = this.view = A.layout(window.innerWidth, window.innerHeight, this.host.insets?.bottom || 0);
        this.canvas.width = v.bw;
        this.canvas.height = v.bh;
        this.canvas.style.width = `${v.bw * v.px}px`;
        this.canvas.style.height = `${v.bh * v.px}px`;
        this.ctx.imageSmoothingEnabled = false;
        this.ice = A.sheet(v.bw, v.bh);
    }

    resize() {
        if (!this.canvas) return;
        this.layout();
        if (this.dressed) this.dress(...this.dressed);
    }

    // Bake the arena for a home side and its visitors.
    dress(home, away) {
        const A = HockeyArt;
        this.dressed = [home, away];
        this.arena = A.arena(this.view, home, away, 0.94, this.world.champions);
        this.kits = [A.kit(home, false), A.kit(away, true)];
        // The arena as it is now: the bake, plus whatever the skates and the machine have done to the ice.
        // Everything drawn on it after this first copy is clipped to the ice.
        const L = HockeyLogic, v = this.view, c = this.iceCtx = this.ice.getContext('2d');
        c.restore();
        c.drawImage(this.arena.base, 0, 0);
        c.save();
        c.beginPath();
        c.roundRect(Math.min(v.X(-L.HL, -L.HW), v.X(L.HL, L.HW)) + 1, Math.min(v.Y(-L.HL, -L.HW), v.Y(L.HL, L.HW)) + 1, Math.abs(v.X(L.HL, L.HW) - v.X(-L.HL, -L.HW)) - 2, Math.abs(v.Y(L.HL, L.HW) - v.Y(-L.HL, -L.HW)) - 2, L.CORNER * v.k - 1);
        c.clip();
        this.dry = 0;
    }

    // ---- A frame ----------------------------------------------------------------------
    frame(now) {
        if (!this.running) return;
        const dt = Math.min(Math.max(now - (this.last || now), 0), 100) / 1000;
        this.last = now;
        this.update(dt);
        this.draw();
        this.frameId = requestAnimationFrame(t => this.frame(t));
    }

    update(dt) {
        const L = HockeyLogic, g = this.game;
        this.clock += dt;
        this.showT += dt;
        if (g) {
            this.acc += dt * this.config.speed;
            let n = 0;
            while (this.acc >= L.STEP && n++ < 14) { this.acc -= L.STEP; L.step(g); this.afterStep(g, false); }
            if (n > 14) this.acc = 0;
        }
        this.background();
        this.effects(dt);

        const long = HOCKEY_SHOW[this.show];
        if (this.show === 'pregame' && this.showT >= long) { g.wait = false; this.setShow('game'); } else if (this.show === 'postgame' && this.showT >= long && this.round !== this.roundKey()) {
            if (this.world.stage === 'champion') { this.setShow('ceremony'); g.party = true; this.say(`THE ${L.TEAMS[this.world.champion].nick.toUpperCase()} WIN ${L.TROPHY.toUpperCase()}!`, 9, 13); } else this.setShow('standings');
        } else if (this.show === 'standings' && this.showT >= long) this.begin(false);
        else if (this.show === 'ceremony' && this.showT >= long) {
            this.news = L.nextSeason(this.world);
            this.save();
            this.setShow('offseason');
        } else if (this.show === 'offseason' && this.showT >= long) this.begin(false);
    }

    // After each step of the game on show: what happened, the marks on the ice, and a save now and then.
    afterStep(g, hurried) {
        for (const e of g.events) if (e.n > this.seen) { this.seen = e.n; this.heard(g, e, hurried); }
        if (!hurried) this.mark(g);
        if (g.phase === 'play' && g.tick % 300 === 0) this.saveGame();
        if (g.done && !this.recorded) this.finish();
    }

    // ---- The announcer, and what the crowd does about it -----------------------------------
    say(text, weight = 1, seconds = 3.2) {
        if (this.caption && this.caption.weight > weight && this.caption.until > this.clock) return;
        this.caption = { text, weight, until: this.clock + seconds };
        this.quiet = 0;
    }

    call(kind, fill = {}) {
        const lines = HOCKEY_CALLS[kind], line = lines[Math.floor(Math.random() * lines.length)];
        return line.replace(/\b([NVTMHKOR])\b/g, (m, key) => fill[key] ?? m);
    }

    heard(g, e, hurried) {
        const L = HockeyLogic, P = g.P, T = t => L.TEAMS[g.T[t].ti], who = e.by !== undefined ? P[e.by] : null, name = p => p.name.toUpperCase();
        const fill = who ? { N: name(who), T: T(who.team).nick.toUpperCase(), M: (who.moveName || '').toUpperCase(), R: T(0).rink.toUpperCase() } : { R: T(0).rink.toUpperCase() };
        if (e.on !== undefined) fill.V = name(P[e.on]);
        if (e.from !== undefined) fill.V = name(P[e.from]);
        const chance = p => Math.random() < p;
        if (e.type === 'goal') {
            const gl = e.goal, s = P[gl.by];
            Object.assign(fill, { N: name(s), T: T(gl.team).nick.toUpperCase(), M: (gl.move || '').toUpperCase(), H: gl.a.length ? name(P[gl.a[0]]) : '' });
            const kind = gl.keeper ? 'keeper' : g.done ? 'winner' : gl.move ? 'move' : gl.empty ? 'empty' : gl.rebound ? 'rebound' : gl.kind === 'scramble' ? 'scramble' : gl.far > 62 ? 'far' : gl.a.length && chance(0.5) ? 'assist' : 'goal';
            this.say(this.call(kind, fill), gl.keeper ? 9 : 6, gl.keeper ? 8 : 4.5);
            this.banner = { text: gl.keeper ? 'GOALIE GOAL!' : 'GOAL!', sub: `${T(gl.team).nick.toUpperCase()} · ${name(s)}${gl.nth > 1 ? ` (${gl.nth})` : ''}`, team: gl.team, t: 0, life: gl.keeper ? 6 : 3 };
            this.cheer[gl.team] = 1;
            this.lamp[gl.team] = gl.keeper ? 6 : 3.5;
            this.flash = gl.keeper ? 6 : 2.5;
            this.stats.goals++;
            if (gl.keeper && this.config.hats && !hurried) this.rain(s, 60);
            this.saveGame();
        } else if (e.type === 'hattrick') {
            this.say(this.call('hattrick', fill), 7, 5);
            if (this.config.hats && !hurried) this.rain(who, 44);
        } else if (e.type === 'save') {
            this.cheer[who.team] = Math.max(this.cheer[who.team], 0.35);
            if (e.move) { this.say(this.call('saveMove', { ...fill, M: e.move.toUpperCase() }), 3); this.tag(who, e.move.toUpperCase()); } else if (e.big && chance(0.7)) this.say(this.call('save', fill), 2);
        } else if (e.type === 'post') this.say(this.call('post', fill), 3);
        else if (e.type === 'hit') {
            if (e.move) { this.say(this.call('hitMove', fill), 3); this.tag(who, fill.M); } else if (e.big && chance(0.6)) this.say(this.call('hit', fill), 2);
            this.burst(P[e.on], 8, '#ffffff');
        } else if (e.type === 'steal') { if (e.move) { this.say(this.call('stealMove', fill), 3); this.tag(who, fill.M); } else if (chance(0.25)) this.say(this.call('steal', fill), 1); } else if (e.type === 'move') {
            this.say(this.call(e.kind, fill), 3);
            this.tag(who, fill.M);
        } else if (['pick', 'block'].includes(e.type)) { if (chance(0.2)) this.say(this.call(e.type, fill), 1); } else if (['oops', 'crash'].includes(e.type)) this.say(this.call(e.type, fill), 2);
        else if (e.type === 'slip') this.say(this.call('slip', { ...fill, K: HOCKEY_THING_NAMES[e.kind] || 'THING' }), 4, 4);
        else if (e.type === 'pull') this.say(this.call('pull', { T: T(e.team).nick.toUpperCase() }), 4, 4);
        else if (e.type === 'heave') this.say(this.call('heave', fill), 5, 3);
        else if (e.type === 'change') { if (chance(0.3)) this.say(this.call('change', { T: T(e.team).nick.toUpperCase() }), 0); } else if (e.type === 'period') {
            this.allow++;
            this.saveGame();
            if (e.period < 3) this.say(this.call('period', { O: HOCKEY_ORD[e.period] }), 4, 5);
        } else if (e.type === 'overtime' || e.type === 'showdown') { this.say(this.call(e.type), 6, 5); this.banner = { text: e.type === 'overtime' ? 'OVERTIME' : 'EMPTY NETS!', sub: e.type === 'overtime' ? 'TWO ON TWO · NEXT GOAL WINS' : 'NEXT GOAL WINS', team: -1, t: 0, life: 3.5 }; } else if (e.type === 'final') {
            this.cheer[e.winner] = 1;
            if (e.how === 'DEC') this.say(`NOBODY CAN SCORE! THE ${T(e.winner).nick.toUpperCase()} TAKE IT ON SHOTS!`, 6, 5);
        } else if (e.type === 'drop') {
            this.hats = [];
            if (g.period > 1 && g.clock > g.len - 30) this.dry = 14;
            if (g.period === 1 && g.goals.length === 0 && g.clock > g.len - 30) this.say(this.call('under', fill), 2, 4);
        }
    }

    tag(p, text) { if (text && this.config.names) this.tags.push({ i: p.i, text, t: 0 }); }

    // Hats (and whatever else is to hand) from the seats onto the ice round a man.
    rain(p, count) {
        const v = this.view, L = HockeyLogic, n = Math.round(count * this.density);
        const colours = ['#d8343a', '#3f73c8', '#f6f4ee', '#3fa55b', '#f08a24', '#8d5fd3', '#ffd23f', '#20232c'];
        for (let i = 0; i < n; i++) {
            const x = Math.max(-L.HL + 8, Math.min(L.HL - 8, p.x + (Math.random() - 0.5) * 90)), y = (Math.random() - 0.5) * (L.HW * 2 - 14), tx = v.X(x, y), ty = v.Y(x, y);
            this.thrown.push({ kind: 'hat', colour: colours[i % colours.length], x, y, sx: tx + (Math.random() - 0.5) * 60, sy: ty < v.cy ? v.top - 6 : v.bottom + 6, tx, ty, t: -Math.random() * 1.6, hazard: false });
        }
    }

    spark(x, y, vx, vy, life, colour, fall = 0) {
        const cap = Math.round(520 * this.density);
        let p = this.particles.find(q => q.life <= 0);
        if (!p) { if (this.particles.length >= cap) return; p = {}; this.particles.push(p); }
        Object.assign(p, { x, y, vx, vy, life, max: life, colour, fall });
    }

    burst(p, count, colour) {
        const v = this.view, x = v.X(p.x, p.y), y = v.Y(p.x, p.y);
        for (let i = 0; i < count * this.density; i++) { const a = Math.random() * 6.283, s = 8 + Math.random() * 22; this.spark(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.3 + Math.random() * 0.4, colour); }
    }

    // Skates leave marks; a hard stop throws snow.
    mark(g) {
        if (g.phase === 'break') return;
        const v = this.view, ctx = this.iceCtx, every = this.density < 0.5 ? 3 : 2;
        if (g.tick % every) return;
        ctx.fillStyle = 'rgba(128, 160, 198, 0.3)';
        for (const p of g.P) {
            if (!p.on || p.g) continue;
            const speed = Math.hypot(p.vx, p.vy);
            if (speed < 14 && p.down <= 0) continue;
            ctx.fillRect(Math.round(v.X(p.x, p.y) + ((g.tick / every + p.i) % 2 ? -1 : 0)), Math.round(v.Y(p.x, p.y) + 1), 1, 1);
            if ((p.burst > 0 || p.down > 30) && g.tick % 4 === 0) this.spark(v.X(p.x, p.y), v.Y(p.x, p.y) + 2, -p.vx * 0.2 + (Math.random() - 0.5) * 14, -p.vy * 0.2 + (Math.random() - 0.5) * 14, 0.35, '#ffffff');
        }
    }

    effects(dt) {
        const g = this.game, v = this.view, L = HockeyLogic, still = this.host.reducedMotion;
        for (const p of this.particles) {
            if (p.life <= 0) continue;
            p.life -= dt; p.vy += p.fall * dt; p.x += p.vx * dt; p.y += p.vy * dt;
            if (p.fall) p.vx += Math.sin(this.clock * 7 + p.max * 40) * 30 * dt;
        }
        for (let n = this.thrown.length - 1; n >= 0; n--) {
            const t = this.thrown[n];
            t.t += dt * 1.5;
            if (t.t < 1) continue;
            this.thrown.splice(n, 1);
            if (t.hazard && g && !g.done) { if (!L.throwItem(g, t.x, t.y, t.kind)) this.hats.push(t); } else { this.hats.push(t); if (this.hats.length > 90) this.hats.shift(); }
        }
        for (let n = this.tags.length - 1; n >= 0; n--) if ((this.tags[n].t += dt) > 1.8) this.tags.splice(n, 1);
        for (let t = 0; t < 2; t++) { this.cheer[t] = Math.max(0, this.cheer[t] - dt * 0.28); this.lamp[t] = Math.max(0, this.lamp[t] - dt); }
        this.flash = Math.max(0, this.flash - dt);
        if (this.banner && (this.banner.t += dt) > this.banner.life) this.banner = null;
        if (this.wave && (this.wave.t += dt) > 3.2) this.wave = null;
        if (this.boardT > 0 && (this.boardT -= dt) <= 0) this.board = 0;
        if (this.caption && this.caption.until < this.clock) this.caption = null;
        // Nothing said for a while: the announcer fills the air.
        if (this.show === 'game' && g && g.phase === 'play' && (this.quiet += dt) > 11) this.say(this.call('chat', { T: L.TEAMS[g.home].nick.toUpperCase(), R: L.TEAMS[g.home].rink.toUpperCase() }), 0, 3.5);
        // The machine: a clean, wet stripe wherever it has been.
        const at = this.machineAt();
        if (at) {
            const r = Math.ceil(8.5 * v.k), x = Math.round(v.X(at.x, at.y)), y = Math.round(v.Y(at.x, at.y)), ice = this.iceCtx;
            ice.drawImage(this.arena.base, x - r, y - r, r * 2, r * 2, x - r, y - r, r * 2, r * 2);
            ice.fillStyle = 'rgba(150, 205, 250, 0.34)';
            ice.fillRect(x - r, y - r, r * 2, r * 2);
        }
        // The wet dries once play is on again: the clean bake, washed over it a few times.
        if (this.dry > 0 && Math.floor(this.clock * 5) !== Math.floor((this.clock - dt) * 5)) {
            this.dry--;
            this.iceCtx.globalAlpha = 0.22;
            this.iceCtx.drawImage(this.arena.base, 0, 0);
            this.iceCtx.globalAlpha = 1;
        }
        // The ceremony: paper from the rafters.
        if (this.show === 'ceremony' && !still) {
            const kit = L.TEAMS[this.world.champion].kit;
            for (let i = 0; i < 150 * dt * this.density; i++) this.spark(Math.random() * v.bw, -2, (Math.random() - 0.5) * 20, 14 + Math.random() * 22, 6 + Math.random() * 4, [kit[0], kit[1], '#ffd23f', '#ffffff'][Math.floor(Math.random() * 4)], 6);
        }
    }

    // Where the ice resurfacer is, while it is out: between the first three periods.
    machineAt() {
        const g = this.game, L = HockeyLogic;
        if (!g || g.phase !== 'break' || g.period > 2 || g.fast) return null;
        const q = (g.phaseT - 210) / (L.BREAK - 260);
        return q > 0 && q < 1 ? L.resurfacer(q) : null;
    }

    // ---- Drawing ---------------------------------------------------------------------
    draw() {
        const ctx = this.ctx, A = HockeyArt, L = HockeyLogic, v = this.view, g = this.game, still = this.host.reducedMotion;
        ctx.globalAlpha = 1;
        ctx.drawImage(this.ice, 0, 0);
        // The crowd: each end bobs when it has something to shout about, and a wave runs when asked.
        const beat = Math.floor(this.clock * 6);
        for (let t = 0; t < 2; t++) {
            if (this.cheer[t] <= 0.02 && !this.wave) continue;
            for (let x = 0, n = 0; x < v.bw; x += 16, n++) {
                const waving = this.wave && Math.abs(x - ((this.wave.x + this.wave.t * v.bw * 0.6) % v.bw)) < 28;
                const up = waving || (this.cheer[t] > 0.02 && (still ? true : (beat + n) % 2 === 0) && A.noise(n, beat >> 1) < this.cheer[t] * 1.6);
                if (up) ctx.drawImage(this.arena.up[t], x, 0, 16, v.bh, x, 0, 16, v.bh);
            }
        }
        if (this.flash > 0 && !still) {
            ctx.fillStyle = '#ffffff';
            for (let i = 0; i < 5 * this.density; i++) {
                const x = Math.floor(Math.random() * v.bw), y = Math.floor(Math.random() * v.bh), [lx, ly] = v.back(x, y);
                if (!L.inside(lx, ly, -6)) ctx.fillRect(x, y, 2, 2);
            }
        }
        const X = (x, y) => Math.round(v.X(x, y)), Y = (x, y) => Math.round(v.Y(x, y));
        // Goal lamps.
        for (let t = 0; t < 2; t++) {
            const s = t ? -1 : 1, x = X(s * (L.GOAL_X + L.NET_DEPTH + 2.5), 0), y = Y(s * (L.GOAL_X + L.NET_DEPTH + 2.5), 0), lit = this.lamp[t] > 0;
            if (lit) { ctx.globalAlpha = still ? 0.6 : 0.45 + 0.45 * Math.sin(this.clock * 14); ctx.drawImage(A.glow(), x - 12, y - 12); ctx.globalAlpha = 1; }
            ctx.fillStyle = A.INK; ctx.fillRect(x - 2, y - 2, 4, 4);
            ctx.fillStyle = lit ? '#ff5a4e' : '#7a2226'; ctx.fillRect(x - 1, y - 1, 2, 2);
        }
        if (g) this.benches(ctx, g, X, Y);
        // Things on the ice.
        for (const h of this.hats) { const img = h.colour ? A.hat(h.colour) : A.thing(h.kind); ctx.drawImage(img, Math.round(h.tx - img.width / 2), Math.round(h.ty - img.height / 2)); }
        if (g) for (const item of g.items) { const img = A.thing(item.kind); ctx.drawImage(img, X(item.x, item.y) - (img.width >> 1), Y(item.x, item.y) - (img.height >> 1)); }
        if (g) this.skaters(ctx, g, X, Y);
        const at = this.machineAt();
        if (at) { ctx.drawImage(A.shadow(), X(at.x, at.y) - 5, Y(at.x, at.y) + 1); ctx.drawImage(A.machine(at.dir + v.turn), X(at.x, at.y) - 16, Y(at.x, at.y) - 16); }
        if (this.show === 'ceremony') this.trophy(ctx, g, X, Y);
        // In the air.
        for (const t of this.thrown) {
            if (t.t < 0) continue;
            const q = t.t, img = t.colour ? A.hat(t.colour) : A.thing(t.kind), x = t.sx + (t.tx - t.sx) * q, y = t.sy + (t.ty - t.sy) * q - Math.sin(q * Math.PI) * 26;
            ctx.drawImage(img, Math.round(x - img.width / 2), Math.round(y - img.height / 2));
        }
        for (const p of this.particles) {
            if (p.life <= 0) continue;
            ctx.globalAlpha = Math.min(1, p.life / p.max * 2);
            ctx.fillStyle = p.colour;
            ctx.fillRect(Math.round(p.x), Math.round(p.y), p.fall ? 2 : 1, p.fall && p.max > 8 ? 2 : 1);
        }
        ctx.globalAlpha = 1;
        if (g) for (const tag of this.tags) { const p = g.P[tag.i]; if (p.on) A.write(ctx, tag.text, X(p.x, p.y), Y(p.x, p.y) - 24 - Math.round(tag.t * 5), '#b8321f', { align: 'center', shadow: '#ffffff' }); }
        this.hud(ctx);
    }

    benches(ctx, g, X, Y) {
        const A = HockeyArt, L = HockeyLogic, v = this.view;
        for (let t = 0; t < 2; t++) {
            const s = t ? 1 : -1, kit = this.kits[t], happy = this.cheer[t] > 0.3, hop = happy && Math.floor(this.clock * 6) % 2 ? 1 : 0;
            let seat = 0;
            for (let n = 0; n < 7; n++) {
                const p = g.P[t * 7 + n];
                if (p.on) continue;
                const x = s * (9 + seat++ * 5.6), bx = X(x, -L.HW - 9.5 / v.k), by = Y(x, -L.HW - 9.5 / v.k) - (hop && n % 2 ? 1 : 0);
                ctx.fillStyle = A.INK; ctx.fillRect(bx - 2, by - 2, 5, 5);
                ctx.fillStyle = p.g ? '#f3efe2' : kit.jersey; ctx.fillRect(bx - 1, by - 1, 3, 3);
                ctx.fillStyle = kit.helmet; ctx.fillRect(bx - 1, by - 1, 2, 2);
            }
            // The mascot, at the end of the bench.
            const mx = s * 51, img = A.head(g.T[t].ti);
            ctx.drawImage(img, X(mx, -L.HW - 9 / v.k) - 6, Y(mx, -L.HW - 9 / v.k) - 6 - hop * 2);
        }
    }

    skaters(ctx, g, X, Y) {
        const A = HockeyArt, v = this.view, pk = g.puck;
        const list = g.P.filter(p => p.on).sort((a, b) => v.Y(a.x, a.y) - v.Y(b.x, b.y));
        for (const p of list) ctx.drawImage(A.shadow(), X(p.x, p.y) - 5, Y(p.x, p.y) + (p.g ? 0 : 1));
        // The puck lies under the sticks.
        const drawPuck = () => {
            const x = X(pk.x, pk.y), y = Y(pk.x, pk.y), speed = Math.hypot(pk.vx, pk.vy);
            if (pk.owner < 0 && speed > 110) {
                ctx.fillStyle = 'rgba(30, 40, 70, 0.25)';
                for (let n = 1; n <= 3; n++) ctx.fillRect(Math.round(v.X(pk.x - pk.vx * 0.012 * n, pk.y - pk.vy * 0.012 * n)), Math.round(v.Y(pk.x - pk.vx * 0.012 * n, pk.y - pk.vy * 0.012 * n)), 1, 1);
            }
            ctx.fillStyle = 'rgba(40, 60, 110, 0.3)'; ctx.fillRect(x - 1, y, 3, 2);
            ctx.fillStyle = '#10121c'; ctx.fillRect(x - 1, y - 1, 2, 2);
        };
        if (pk.owner < 0) drawPuck();
        for (const p of list) {
            const speed = Math.hypot(p.vx, p.vy), cheer = p.act === 'cheer';
            const pose = p.down > 0 ? 'down' : p.g ? (p.act === 'save' ? 'save' : g.phase === 'goal' && g.celly >= 0 && g.P[g.celly].team !== p.team ? 'down' : 'skate') : p.act === 'windup' ? 'windup' : p.act === 'shoot' || p.act === 'pass' ? 'shoot' : cheer ? 'cheer' : 'skate';
            const frame = pose === 'skate' ? (speed > 8 ? Math.floor(this.clock * 9 + p.i * 1.3) % 4 : 1) : cheer ? Math.floor(this.clock * 6 + p.i) % 2 : 0;
            const img = A.player(this.kits[p.team], p.g, p.dir + v.turn, pose, frame, p.g ? 0 : Math.min(5, g.beard));
            const x = X(p.x, p.y), y = Y(p.x, p.y) - (cheer && frame ? 1 : 0);
            ctx.drawImage(img, x - 16, y - 16);
            if (pk.owner === p.i) drawPuck();
            if (p.down > 0 && !this.host.reducedMotion) {
                // Stars, round his head.
                ctx.fillStyle = '#ffd23f';
                for (let n = 0; n < 2; n++) { const a = this.clock * 7 + n * Math.PI; ctx.fillRect(x + Math.round(Math.cos(a) * 5), y - 6 + Math.round(Math.sin(a) * 2), 1, 1); }
            }
        }
        // Who has it.
        if (this.config.names && pk.owner >= 0 && g.phase === 'play') {
            const p = g.P[pk.owner];
            if (p.hold > 20 || p.g) A.write(ctx, p.name.toUpperCase(), X(p.x, p.y), Y(p.x, p.y) - 17, HockeyLogic.TEAMS[g.T[p.team].ti].kit[2], { align: 'center', shadow: false });
        }
    }

    // The captain, the tin, and the mascot out on the ice.
    trophy(ctx, g, X, Y) {
        const A = HockeyArt, v = this.view, champ = this.world.champion, bob = this.host.reducedMotion ? 0 : Math.round(Math.sin(this.clock * 5) * 2);
        let x = v.cx, y = v.cy;
        if (g && g.done) { const hero = g.P[HockeyLogic.hero(g)]; x = X(hero.x, hero.y); y = Y(hero.x, hero.y); }
        const tin = A.thing('tin');
        ctx.drawImage(tin, x - 10, y - 34 + bob, 20, 18);
        ctx.fillStyle = '#ffffff';
        if (!this.host.reducedMotion) for (let n = 0; n < 4; n++) { const a = this.clock * 3 + n * 1.6; ctx.fillRect(x + Math.round(Math.cos(a) * 15), y - 25 + bob + Math.round(Math.sin(a) * 10), 2, 2); }
        const up = Math.floor(this.clock * 4) % 2 === 0, m = A.mascot(champ, up);
        ctx.drawImage(A.shadow(), x + 16, y + 12);
        ctx.drawImage(m, x + 14, y - 6 - (up ? 2 : 0));
    }

    // ---- The scoreboard, the captions and the cards ----------------------------------------
    hud(ctx) {
        const A = HockeyArt, L = HockeyLogic, v = this.view, g = this.game, w = this.world;
        if (g) this.scoreboard(ctx, g);
        // The corners: where in the season this is, and how the other games are going.
        const stage = w.stage === 'regular' ? `ROUND ${Math.min(w.round + 1, w.schedule.length)}/${w.schedule.length}` : w.stage === 'semi' ? 'SEMI-FINALS' : w.stage === 'final' ? 'THE FINAL' : 'CHAMPIONS';
        const others = w.out.filter(o => !g || o.home !== g.home || this.round !== this.roundKey());
        const o = others.length ? others[Math.floor(this.clock / 4) % others.length] : null;
        const score = o ? `${L.TEAMS[o.home].code} ${o.score[0]} ${L.TEAMS[o.away].code} ${o.score[1]}${o.how !== 'REG' ? ' OT' : ''}` : '';
        const plate = (x, y, wide, tall) => { ctx.fillStyle = 'rgba(12, 18, 40, 0.82)'; ctx.fillRect(x, y, wide, tall); };
        if (v.upright) {
            plate(0, 23, v.bw, 10);
            A.write(ctx, `S${w.season} ${stage}`, 4, 25, '#b9c9e6', { shadow: false });
            if (o) A.write(ctx, score, v.bw - 4, 25, '#b9c9e6', { align: 'right', shadow: false });
        } else if (v.bw >= 380) {
            const banners = Math.min(10, w.champions.length), first = banners ? `SEASON ${w.season}` : 'POCKET HOCKEY', second = banners ? stage : `SEASON ${w.season} · ${stage}`;
            const there = o ? score : this.queue.length + (this.bg ? 1 : 0) ? `${this.queue.length + (this.bg ? 1 : 0)} MORE TONIGHT` : 'ALL FINAL';
            plate(0, 0, Math.max(A.measure(first) + (banners ? 5 + banners * 7 : 0), A.measure(second)) + 8, 22);
            plate(v.bw - Math.max(A.measure('ELSEWHERE'), A.measure(there)) - 8, 0, 200, 22);
            A.write(ctx, first, banners ? 6 + banners * 7 : 4, 3, banners ? '#b9c9e6' : '#ffd23f', { shadow: false });
            A.write(ctx, second, 4, 13, '#b9c9e6', { shadow: false });
            A.write(ctx, 'ELSEWHERE', v.bw - 4, 3, '#ffd23f', { align: 'right', shadow: false });
            A.write(ctx, there, v.bw - 4, 13, '#b9c9e6', { align: 'right', shadow: false });
        }
        // The announcer's line.
        if (this.config.captions && this.caption) {
            const width = v.bw - 12, lines = A.wrap(this.caption.text, width - 8).slice(0, v.upright ? 2 : 1), h = lines.length * 9 + 4, y = v.bh - v.low - h - 2;
            const widest = Math.max(...lines.map(l => A.measure(l))) + 10;
            ctx.fillStyle = 'rgba(12, 18, 40, 0.86)';
            ctx.fillRect(Math.round(v.bw / 2 - widest / 2), y, widest, h);
            lines.forEach((line, n) => A.write(ctx, line, v.bw / 2, y + 3 + n * 9, this.caption.weight >= 6 ? '#ffd23f' : '#ffffff', { align: 'center' }));
        }
        if (this.banner && this.show === 'game') {
            const b = this.banner, team = b.team >= 0 ? L.TEAMS[g.T[b.team].ti] : null, blink = !this.host.reducedMotion && Math.floor(b.t * 8) % 2;
            const scale = A.measure(b.text, 3) < v.bw - 16 ? 3 : 2, y = Math.round(v.cy - (v.upright ? 70 : 36)), wide = Math.max(A.measure(b.text, scale), A.measure(b.sub)) + 24, x = Math.round(v.bw / 2 - wide / 2);
            // A band across the ice, as on the television.
            ctx.fillStyle = 'rgba(12, 18, 40, 0.84)';
            ctx.fillRect(x, y - 5, wide, scale * 7 + 22);
            ctx.fillStyle = team ? team.kit[0] : '#ffd23f';
            ctx.fillRect(x, y - 5, wide, 2); ctx.fillRect(x, y + scale * 7 + 15, wide, 2);
            A.write(ctx, b.text, v.bw / 2, y, blink ? '#ffffff' : '#ffd23f', { align: 'center', scale, shadow: team ? team.kit[0] : '#7a4a25' });
            if (A.measure(b.sub) < v.bw - 8) A.write(ctx, b.sub, v.bw / 2, y + scale * 7 + 5, team ? team.kit[1] : '#ffffff', { align: 'center', shadow: false });
        }
        // Cards.
        if (this.board || this.show === 'standings') this.card(ctx, ...(this.board === 2 ? this.leaderCard() : this.standingsCard()));
        else if (this.show === 'pregame' && g) this.card(ctx, ...this.pregameCard(g));
        else if (this.show === 'postgame' && g && this.showT > 2.4) this.card(ctx, ...this.postgameCard(g));
        else if (this.show === 'offseason') this.card(ctx, ...this.offseasonCard());
        else if (this.show === 'ceremony') {
            const team = L.TEAMS[w.champion], y = v.top + 8, scale = A.measure('CHAMPIONS!', 3) < v.bw - 12 ? 3 : 2;
            A.write(ctx, 'CHAMPIONS!', v.bw / 2, y, Math.floor(this.clock * 4) % 2 && !this.host.reducedMotion ? '#ffffff' : '#ffd23f', { align: 'center', scale, shadow: team.kit[2] });
            const lines = A.wrap(`THE ${team.town.toUpperCase()} ${team.nick.toUpperCase()} · SEASON ${w.season}`, v.bw - 12), wide = Math.max(...lines.map(l => A.measure(l))) + 10;
            ctx.fillStyle = 'rgba(12, 18, 40, 0.86)';
            ctx.fillRect(Math.round(v.bw / 2 - wide / 2), y + scale * 7 + 3, wide, lines.length * 9 + 2);
            lines.forEach((line, n) => A.write(ctx, line, v.bw / 2, y + scale * 7 + 5 + n * 9, team.kit[1], { align: 'center', shadow: false }));
        } else if (this.show === 'game' && g && g.phase === 'break' && this.config.cards && g.phaseT > 50 && g.phaseT < L.breakLength(g) * 0.6) this.card(ctx, ...this.breakCard(g));
    }

    scoreboard(ctx, g) {
        const A = HockeyArt, L = HockeyLogic, v = this.view, w = Math.min(v.bw - 8, 200), x0 = Math.round(v.bw / 2 - w / 2), y0 = 2, h = 19, side = Math.floor((w - 44) / 2);
        ctx.fillStyle = A.INK;
        ctx.fillRect(x0 - 1, y0 - 1, w + 2, h + 2);
        for (let t = 0; t < 2; t++) {
            const team = L.TEAMS[g.T[t].ti], x = t ? x0 + w - side : x0;
            ctx.fillStyle = team.kit[0]; ctx.fillRect(x, y0, side, h);
            ctx.fillStyle = team.kit[2]; ctx.fillRect(x, y0 + h - 3, side, 3);
            ctx.fillStyle = t ? '#f1f3f8' : team.kit[1]; ctx.fillRect(x, y0 + h - 2, side, 1);
            const head = A.head(g.T[t].ti), score = String(g.score[t]);
            ctx.drawImage(head, t ? x + side - 14 : x + 2, y0 + 2);
            A.write(ctx, team.code, t ? x + side - 17 : x + 17, y0 + (g.T[t].pulled && !g.done ? 1 : 5), '#ffffff', { align: t ? 'right' : 'left', shadow: team.kit[2] });
            A.write(ctx, score, t ? x + 4 : x + side - 4, y0 + 2, '#ffffff', { align: t ? 'left' : 'right', scale: 2, shadow: team.kit[2] });
            if (g.T[t].pulled && !g.done) A.write(ctx, 'EMPTY', t ? x + side - 17 : x + 17, y0 + 9, '#ffd23f', { align: t ? 'right' : 'left', shadow: team.kit[2] });
        }
        ctx.fillStyle = '#0c1228';
        ctx.fillRect(x0 + side, y0, w - side * 2, h);
        const label = g.done ? 'FINAL' : g.phase === 'break' ? 'BREAK' : HOCKEY_ORD[g.period], secs = Math.max(0, Math.ceil(g.clock / 60));
        A.write(ctx, label, v.bw / 2, y0 + 2, '#ffd23f', { align: 'center', shadow: false });
        A.write(ctx, g.done ? (g.how === 'REG' ? '' : g.how === 'DEC' ? 'SHOTS' : 'OT') : g.period === 5 ? 'NEXT' : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, v.bw / 2, y0 + 10, '#ffffff', { align: 'center', shadow: false });
    }

    // A panel over the rink: a title, then rows of [text, colour, { right, rc, center, cols }].
    card(ctx, title, rows, accent = '#3f73c8') {
        const A = HockeyArt, v = this.view, w = Math.min(v.bw - 10, 244), room = v.bottom - v.top - 6;
        rows = rows.filter(Boolean).slice(0, Math.floor((room - 16) / 9));
        const h = 15 + rows.length * 9 + 3, x = Math.round(v.bw / 2 - w / 2), y = Math.round(Math.max(v.top + 2, Math.min(v.cy - h / 2, v.bottom - h - 2)));
        ctx.fillStyle = 'rgba(8, 12, 28, 0.45)'; ctx.fillRect(x + 2, y + 2, w, h);
        ctx.fillStyle = '#0e1730'; ctx.fillRect(x, y, w, h);
        ctx.fillStyle = '#dfe9f7'; ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w - 1, y, 1, h);
        ctx.fillStyle = accent; ctx.fillRect(x + 1, y + 1, w - 2, 11);
        A.write(ctx, title, v.bw / 2, y + 3, '#ffffff', { align: 'center' });
        rows.forEach(([text, colour = '#ffffff', o = {}], n) => {
            const ry = y + 15 + n * 9;
            if (o.chip) { ctx.fillStyle = o.chip; ctx.fillRect(x + 5, ry, 5, 7); }
            const left = x + (o.chip ? 13 : 6);
            if (o.center) A.write(ctx, text, v.bw / 2, ry, colour, { align: 'center' }); else A.write(ctx, text, left, ry, colour);
            if (o.right) A.write(ctx, o.right, x + w - 6, ry, o.rc || '#ffffff', { align: 'right' });
            if (o.cols) o.cols.forEach((c, i) => A.write(ctx, String(c), x + w - 6 - (o.cols.length - 1 - i) * (o.step || 24), ry, o.rc || '#ffffff', { align: 'right' }));
        });
    }

    record(team) { return `${team.w}-${team.l}-${team.otl}`; }

    pregameCard(g) {
        const L = HockeyLogic, w = this.world, T = L.TEAMS, home = T[g.home], away = T[g.away], hw = w.teams[g.home], aw = w.teams[g.away];
        const series = w.series.find(s => (s.a === g.home && s.b === g.away) || (s.a === g.away && s.b === g.home));
        const title = w.stage === 'regular' ? `SEASON ${w.season} · ROUND ${w.round + 1} OF ${w.schedule.length}` : `${w.stage === 'semi' ? 'SEMI-FINAL' : 'THE FINAL'} · GAME ${series ? series.played + 1 : 1} OF 3`;
        const star = [...hw.players, ...aw.players].filter(p => p.move).sort((a, b) => b.move.lvl - a.move.lvl || (b.s.g + b.s.a) - (a.s.g + a.s.a))[0];
        return [title, [
            [`${away.town.toUpperCase()} ${away.nick.toUpperCase()}`, away.kit[1], { center: true }],
            [w.stage === 'regular' ? this.record(aw) : series ? `SERIES ${series.wins[series.a === g.away ? 0 : 1]}-${series.wins[series.a === g.away ? 1 : 0]}` : '', '#9fb4d6', { center: true }],
            ['AT', '#ffd23f', { center: true }],
            [`${home.town.toUpperCase()} ${home.nick.toUpperCase()}`, home.kit[1], { center: true }],
            [w.stage === 'regular' ? this.record(hw) : g.beard > 2 ? 'THE PLAYOFF BEARDS ARE COMING IN' : 'WIN TWO TO GO THROUGH', '#9fb4d6', { center: true }],
            [home.rink.toUpperCase(), '#ffffff', { center: true }],
            star && [`WATCH FOR ${this.sur(star.name)}:`, '#ffd23f', { center: true }],
            star && [`${star.move.name.toUpperCase()} ${'*'.repeat(star.move.lvl)}`, '#ffd23f', { center: true }],
        ], home.kit[0]];
    }

    stars(g) {
        return g.P.map(p => ({ p, v: p.st.g * 3 + p.st.a * 2 + p.st.hit * 0.4 + (p.g ? p.st.sv * 0.22 + (p.team === g.winner ? 1.5 : 0) : 0) + (p.team === g.winner ? 0.5 : 0) })).sort((a, b) => b.v - a.v || a.p.i - b.p.i).slice(0, 3).map(s => s.p);
    }

    postgameCard(g) {
        const L = HockeyLogic, T = L.TEAMS, home = T[g.home], away = T[g.away];
        const line = p => (p.g ? `${p.st.sv} SAVES${p.st.g ? ` ${p.st.g}G!` : ''}` : `${p.st.g}G ${p.st.a}A${p.st.hit ? ` ${p.st.hit}H` : ''}`);
        const rows = [
            [`${home.nick.toUpperCase()} ${g.score[0]}`, home.kit[1], { right: `${g.score[1]} ${away.nick.toUpperCase()}`, rc: away.kit[1] }],
            [`SHOTS ${g.shots[0]}`, '#9fb4d6', { right: `${g.shots[1]} SHOTS`, rc: '#9fb4d6' }],
            ['THE THREE STARS', '#ffd23f', { center: true }],
            ...this.stars(g).map((p, n) => [`${'*'.repeat(3 - n)} ${p.name.toUpperCase()}`, '#ffffff', { right: line(p), chip: T[g.T[p.team].ti].kit[0] }]),
        ];
        const worth = ['keeper', 'series', 'hat', 'move', 'shutout', 'streak', 'hot', 'polish'];
        for (const n of [...this.notes].sort((a, b) => worth.indexOf(a.type) - worth.indexOf(b.type)).slice(0, 3)) {
            const who = n.name ? this.sur(n.name) : '', nick = T[n.team].nick.toUpperCase();
            rows.push([{ move: `NEW MOVE! ${who}: ${(n.move || '').toUpperCase()}`, polish: `${who} POLISHES ${(n.move || '').toUpperCase()} ${'*'.repeat(n.lvl || 1)}`, hat: `A HAT TRICK FOR ${who}`, hot: `${who} HAS SCORED IN ${n.n} STRAIGHT`,
                streak: `THE ${nick} HAVE WON ${n.n} IN A ROW`, keeper: `${who} IS A GOAL-SCORING GOALIE`, shutout: `A SHUTOUT FOR ${who}`, series: `THE ${nick} TAKE THE SERIES ${n.wins ? n.wins.join('-') : ''}` }[n.type], '#ffd23f', { center: true }]);
        }
        return [`FINAL${g.how === 'OT' ? ' (OVERTIME)' : g.how === 'SD' ? ' (EMPTY NETS)' : g.how === 'DEC' ? ' (ON SHOTS)' : ''}`, rows, T[g.T[g.winner].ti].kit[0]];
    }

    breakCard(g) {
        const L = HockeyLogic, T = L.TEAMS, home = T[g.home], away = T[g.away], w = this.world;
        const clock = gl => { const s = Math.ceil((gl.period > 3 ? 0 : g.len - gl.clock) / 60); return `${HOCKEY_ORD[gl.period]} ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
        const rows = [
            [`${home.nick.toUpperCase()} ${g.score[0]}`, home.kit[1], { right: `${g.score[1]} ${away.nick.toUpperCase()}`, rc: away.kit[1] }],
            [`SHOTS ${g.shots[0]}  HITS ${g.hits[0]}`, '#9fb4d6', { right: `HITS ${g.hits[1]}  SHOTS ${g.shots[1]}`, rc: '#9fb4d6' }],
            ...g.goals.slice(-4).map(gl => [`${clock(gl)} ${g.P[gl.by].name.toUpperCase()}`, '#ffffff', { chip: T[g.T[gl.team].ti].kit[0], right: gl.empty ? 'EMPTY NET' : gl.move ? 'SIGNATURE' : gl.a.length ? `FROM ${g.P[gl.a[0]].name.toUpperCase()}`.slice(0, 18) : '' }]),
            !g.goals.length && ['NO SCORING YET. THE GOALIES ARE SMUG.', '#ffffff', { center: true }],
        ];
        const out = w.out.filter(o => o.home !== g.home);
        if (out.length) rows.push(['ELSEWHERE', '#ffd23f', { center: true }], ...out.map(o => [`${T[o.home].nick.toUpperCase()} ${o.score[0]}`, T[o.home].kit[1], { right: `${o.score[1]} ${T[o.away].nick.toUpperCase()}`, rc: T[o.away].kit[1] }]));
        return [`END OF THE ${HOCKEY_ORD[g.period]}${g.period > 3 ? '' : ' PERIOD'}`, rows, '#3f73c8'];
    }

    standingsCard() {
        const L = HockeyLogic, w = this.world, T = L.TEAMS;
        if (w.stage !== 'regular' && w.series.length) {
            const rows = [];
            for (const s of w.series) rows.push([`${T[s.a].nick.toUpperCase()} ${s.wins[0]}`, T[s.a].kit[1], { chip: T[s.a].kit[0], right: `${s.wins[1]} ${T[s.b].nick.toUpperCase()}`, rc: T[s.b].kit[1] }]);
            rows.push(['BEST OF THREE', '#9fb4d6', { center: true }], [`FOR ${L.TROPHY.toUpperCase()}`, '#ffd23f', { center: true }]);
            const keepers = w.goalieGoals.at(-1);
            if (keepers) rows.push([`LAST GOALIE TO SCORE: ${this.sur(keepers.name)} (S${keepers.season})`, '#9fb4d6', { center: true }]);
            return [w.stage === 'semi' ? `SEASON ${w.season} · SEMI-FINALS` : `SEASON ${w.season} · THE FINAL`, rows, '#8d5fd3'];
        }
        const rows = [['', '#9fb4d6', { cols: ['W', 'L', 'OT', 'PTS'] }]];
        L.standings(w).forEach((team, n) => rows.push([`${n + 1} ${T[team.i].nick.toUpperCase()}`, n < 4 ? '#ffffff' : '#9fb4d6', { chip: T[team.i].kit[0], cols: [team.w, team.l, team.otl, L.points(team)] }]));
        rows.push(['THE TOP FOUR PLAY FOR THE TIN', '#ffd23f', { center: true }]);
        return [`SEASON ${w.season} · THE TABLE`, rows, '#3f73c8'];
    }

    leaderCard() {
        const L = HockeyLogic, w = this.world, T = L.TEAMS, rows = [['', '#9fb4d6', { cols: ['G', 'A', 'PTS'] }]];
        for (const e of L.leaders(w, 'pts', 5)) rows.push([`${this.sur(e.player.name)}${e.player.move ? ' ' + '*'.repeat(e.player.move.lvl) : ''}`, '#ffffff', { chip: T[e.team].kit[0], cols: [e.player.s.g, e.player.s.a, e.value] }]);
        const wall = L.leaders(w, 'svp', 1)[0], hit = L.leaders(w, 'hit', 1)[0];
        if (wall && wall.value > 0) rows.push([`BEST GOALIE: ${this.sur(wall.player.name)}`, '#ffd23f', { right: `.${String(Math.round(wall.value * 1000)).padStart(3, '0')}`, rc: '#ffd23f' }]);
        if (hit && hit.value > 0) rows.push([`MOST HITS: ${this.sur(hit.player.name)}`, '#ffd23f', { right: String(hit.value), rc: '#ffd23f' }]);
        rows.push(['* A SIGNATURE MOVE, AND HOW POLISHED', '#9fb4d6', { center: true }]);
        return [`SEASON ${w.season} · THE SCORERS`, rows, '#3fa55b'];
    }

    offseasonCard() {
        const L = HockeyLogic, T = L.TEAMS, order = ['champion', 'mvp', 'wall', 'bruiser', 'retired', 'rookie', 'trade'], shown = { retired: 0, rookie: 0 };
        const rows = [];
        for (const n of [...this.news].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))) {
            const who = n.name ? this.sur(n.name) : '', code = T[n.team].code;
            if (n.type in shown && ++shown[n.type] > 3) continue;
            rows.push([{
                champion: `CHAMPIONS: THE ${T[n.team].nick.toUpperCase()}${n.titles > 1 ? ` (${n.titles} TINS)` : ''}`, mvp: `BEST PLAYER: ${who} (${code}) ${n.g}G ${n.a}A`, wall: `BEST GOALIE: ${who} (${code})`,
                bruiser: `MOST HITS: ${who} (${code}) ${n.n}`, retired: `RETIRES: ${who} (${code}) ${n.pos === 'G' ? `${n.w} WINS` : `${n.g} GOALS`}`, rookie: `ROOKIE: ${who} JOINS THE ${T[n.team].nick.toUpperCase()}`,
                trade: `TRADE: ${who} TO ${code} FOR ${n.for ? this.sur(n.for) : ''}`,
            }[n.type], n.type === 'champion' ? '#ffd23f' : '#ffffff', { chip: T[n.team].kit[0] }]);
        }
        return [`THE SUMMER BEFORE SEASON ${this.world.season}`, rows, '#f08a24'];
    }
}
