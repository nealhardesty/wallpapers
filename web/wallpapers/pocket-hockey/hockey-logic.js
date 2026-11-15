// Pocket Hockey's rules (SPEC §10.36), with no drawing in them: the league,
// its players and seasons, and a whole game of three-on-three stepped at
// 60 Hz. Pure and seeded: a league and a game are plain data that carry
// their own dice (`rng`), so the same seed plays the same game, a saved one
// carries on exactly, and the unit test can play a season in a second.
//
//   The rink     x along its length (the boards at ±100), y across (±50),
//                rounded corners, a net behind each goal line (x = ±82).
//                The home side defends the left net and shoots right.
//   A game       three periods; skaters with momentum (they steer by
//                pushing toward a target, so they carve and overshoot), a
//                puck that slides, ricochets off the boards, the posts and
//                bodies, and is carried on a stick. Each side: three
//                skaters from one of two lines, and a small goalie.
//                Level after three: two-on-two overtime, then both nets
//                empty until somebody scores.
//   The players  steer: the nearest goes for a loose puck by where it will
//                be, a carrier weighs a shot, a pass and a way round, the
//                others find open ice or get between the puck and their
//                net. Each may have a signature move, which changes what
//                he does (a wind-up, a spin, a burst) and is named.
//   The league   eight invented clubs, fourteen rounds, the top four in
//                best-of-three playoffs for the Big Biscuit Tin; then the
//                old retire, rookies arrive, and it starts again. No real
//                club, place or person is named anywhere.

const HockeyLogic = (() => {
    'use strict';

    const STEP = 1 / 60;
    const HL = 100, HW = 50, CORNER = 22;            // the boards
    const GOAL_X = 82, NET_HALF = 9, NET_DEPTH = 6, CREASE = 11, POST = 0.4;
    const PUCK_R = 1.1, SKATER_R = 4.6, GOALIE_R = 2.7, REACH = 6.4;
    const DOOR_Y = -HW + 4, DOOR_X = 16;             // the bench doors, on the y < 0 side: home's at -16, away's at +16
    const PERIOD = 4500, CELEBRATE = 270, BREAK = 1200, SHORT_BREAK = 300, SHIFT = 1500, SHOWDOWN = 5400;
    const SLIDE = 0.9925;                            // what the puck keeps of its speed each step

    const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
    const hyp = Math.hypot;
    // The dice: a small generator whose state lives in the thing that rolls them.
    function rnd(o) {
        o.rng = (o.rng + 0x6d2b79f5) >>> 0;
        let t = Math.imul(o.rng ^ (o.rng >>> 15), 1 | o.rng);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    const bell = o => (rnd(o) + rnd(o) + rnd(o) - 1.5) * 1.2;      // roughly normal, about ±1
    const pick = (o, list) => list[Math.floor(rnd(o) * list.length)];
    const hash = text => { let h = 2166136261; for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619); return h >>> 0; };

    // ---- The league's cast -------------------------------------------------------

    // Eight clubs from towns that are on no map: [jersey, trim, dark].
    const TEAMS = [
        { town: 'Mount Mitten', nick: 'Yetis', code: 'MIT', kit: ['#6f5fd0', '#cfeaff', '#2c2466'], mascot: 'yeti', rink: 'The Mitten Dome' },
        { town: 'Port Pickle', nick: 'Walruses', code: 'PKL', kit: ['#2f9a5c', '#f3e9c6', '#14492b'], mascot: 'walrus', rink: 'The Brine Barn' },
        { town: 'Biscuit Falls', nick: 'Gravy Boats', code: 'BIS', kit: ['#d39a22', '#fff3c9', '#6b3d10'], mascot: 'boat', rink: 'The Gravy Bowl' },
        { town: 'Snowglobe City', nick: 'Narwhals', code: 'SNO', kit: ['#16a6b6', '#ff9fca', '#0b4d5c'], mascot: 'narwhal', rink: 'The Shaker' },
        { town: 'Cocoa Springs', nick: 'Marshmallows', code: 'COC', kit: ['#8a5433', '#ffd9e8', '#3f2415'], mascot: 'mallow', rink: 'The Big Mug' },
        { town: 'Fort Flannel', nick: 'Lumberjacks', code: 'FLN', kit: ['#c8392b', '#f4d35e', '#2a1a1a'], mascot: 'jack', rink: 'The Woodshed' },
        { town: 'Noodle Harbour', nick: 'Honkers', code: 'NOO', kit: ['#f08019', '#ffffff', '#1f2f6b'], mascot: 'goose', rink: 'The Honk Tank' },
        { town: 'Tin Whistle', nick: 'Teakettles', code: 'TIN', kit: ['#5f7890', '#f0a04b', '#26333f'], mascot: 'kettle', rink: 'The Whistling Kettle' },
    ];
    const FIRST = ['Odie', 'Gus', 'Mabel', 'Bo', 'Tilda', 'Rune', 'Pip', 'Wally', 'Zeke', 'Dot', 'Hank', 'Juno', 'Ozzie', 'Fern', 'Lars', 'Mo', 'Nels', 'Bix', 'Kit', 'Sven',
        'Agnes', 'Buck', 'Cleo', 'Duff', 'Etta', 'Finn', 'Greta', 'Hobie', 'Ivy', 'Jeb', 'Kai', 'Lulu', 'Milo', 'Nan', 'Otto', 'Posy', 'Quill', 'Roz', 'Sid', 'Tess',
        'Ulf', 'Vera', 'Wim', 'Yuri', 'Zuzu', 'Bram', 'Olive', 'Moose'];
    const LAST = ['Puckowski', 'Slapsworth', 'McDeke', 'Dangleton', 'Icington', 'Bardown', 'Topshelf', 'Fivehole', 'Wraparound', 'Sievewright', 'Backcheck', 'Van Der Boards',
        'Forecheckov', 'Snipestrom', 'Biscuit', 'Twig', 'Muffin', 'Celly', 'Breakaway', 'Faceoff', 'Bluelinsky', 'Crossbar', 'Glovesave', 'Poke', 'Hipcheck', 'Zoomer',
        'Mittens', 'Toepick', 'Frostbite', 'Snowplow', 'Blizzard', 'Icicle', 'Slushington', 'Thunderskate', 'Rinkrat', 'Pondsworth', 'Chiclets', 'Dekeman', 'Sauceman',
        'Pylon', 'Goalpost', 'McSkate', 'Shinpad', 'Toque', 'Flurry', 'Earmuff', 'Longjohn', 'Hotcocoa', 'Shovelton', 'Icebreaker', 'Brrr', 'Kneepad', 'Wobbleton', 'Spinorama',
        'Snowshoe', 'Iceberg', 'Glacier', 'Parka', 'Thermos', 'Sleighbell', 'Wintermint', 'Frostwick', 'Chillington', 'Coldsnap', 'Shiverton', 'Snowball', 'Igloo', 'Mukluk',
        'Woolsock', 'Pompom', 'Netminder', 'Icing', 'Offside', 'Overtime', 'Tapetotape', 'Barnburner', 'Grinder', 'Sniperson', 'Mullet', 'Saucepan', 'Applesauce', 'Clapper',
        'Sinbin', 'Buzzer', 'Slushpuppy', 'Dustup', 'Snowdrift', 'Hailstone', 'Mitts', 'Pucksley'];
    // Signature moves: what each is, who may grow one, and what it may be called.
    const MOVES = {
        slapper: { label: 'slapshot', pos: 'CWD', nouns: ['Cannon', 'Muffin Launcher', 'Doorknocker', 'Thunderclap'] },
        sniper: { label: 'wrist shot', pos: 'CW', nouns: ['Needle', 'Postcard', 'Cookie Jar', 'Bullseye'] },
        spin: { label: 'spin move', pos: 'CW', nouns: ['Teacup', 'Spin Cycle', 'Carousel', 'Pirouette'] },
        dangle: { label: 'stickhandle', pos: 'CW', nouns: ['Shimmy', 'Noodle', 'Yo-Yo', 'Wiggle'] },
        jet: { label: 'burst of speed', pos: 'CWD', nouns: ['Zoomies', 'Afterburner', 'Comet', 'Scoot'] },
        onetimer: { label: 'one-timer', pos: 'CW', nouns: ['Doorbell', 'Quick Draw', 'Hammer', 'Snapdragon'] },
        saucer: { label: 'saucer pass', pos: 'CWD', nouns: ['Flapjack', 'Flying Saucer', 'Frisbee', 'Pancake'] },
        bulldozer: { label: 'body check', pos: 'WD', nouns: ['Snowplow', 'Freight Train', 'Bear Hug', 'Avalanche'] },
        wall: { label: 'poke check', pos: 'D', nouns: ['Octopus', 'Broom', 'Toll Booth', 'Flyswatter'] },
        glove: { label: 'glove save', pos: 'G', nouns: ['Windmill', 'Butterfly Net', 'Cookie Thief', 'Flytrap'] },
        splits: { label: 'kick save', pos: 'G', nouns: ['Splits', 'Starfish', 'Pretzel', 'Scissor Kick'] },
    };
    const PREFIX = ['Thunder', 'Midnight', 'Turbo', 'Sunday', 'Double', 'Polite', 'Grumpy', 'Sneaky', 'Flying', 'Frozen', 'Spicy', 'Wobbly', 'Royal', 'Disco', 'Lucky', 'Sleepy'];
    const TROPHY = 'the Big Biscuit Tin';
    const LINEUP = ['C', 'W', 'D', 'C', 'W', 'D', 'G'];           // two lines of three, and a goalie

    const blank = () => ({ gp: 0, g: 0, a: 0, hit: 0, sv: 0, sa: 0, w: 0 });
    const last = player => player.name.slice(player.name.indexOf(' ') + 1);

    function newMove(world, player) {
        const kinds = Object.keys(MOVES).filter(k => MOVES[k].pos.includes(player.pos));
        // What he is good at decides what he grows.
        const lean = { slapper: player.sht, sniper: player.sht, spin: player.spd, dangle: player.pas, jet: player.spd, onetimer: player.sht, saucer: player.pas, bulldozer: player.chk, wall: player.chk, glove: player.iq, splits: player.spd };
        let best = kinds[0], most = -1;
        for (const k of kinds) { const v = lean[k] + rnd(world) * 0.5; if (v > most) { most = v; best = k; } }
        return { type: best, name: `the ${pick(world, PREFIX)} ${pick(world, MOVES[best].nouns)}`, lvl: 1, uses: 0 };
    }

    function newPlayer(world, pos, promise, rookie) {
        let name;
        do name = `${pick(world, FIRST)} ${pick(world, LAST)}`; while (world.teams.some(t => t.players.some(p => p.name === name || last(p) === name.slice(name.indexOf(' ') + 1))));
        const roll = () => clamp(0.22 + rnd(world) * 0.6 + promise, 0.05, 1);
        const player = {
            id: world.nextId++, name, num: 0, pos, spd: roll(), sht: roll(), pas: roll(), chk: roll(), iq: roll(),
            age: rookie ? 18 + Math.floor(rnd(world) * 3) : 20 + Math.floor(rnd(world) * 13), peak: 25 + Math.floor(rnd(world) * 6),
            move: null, xp: 0, streak: 0, hats: 0, rookie: !!rookie, s: blank(), c: blank(),
        };
        // Defenders hit, forwards shoot; a veteran has usually found his move.
        if (pos === 'D') { player.chk = clamp(player.chk + 0.15); player.sht = clamp(player.sht - 0.08); }
        if (!rookie) {
            const gp = (player.age - 19) * 14, c = player.c;
            c.gp = gp;
            if (pos === 'G') { c.w = Math.round(gp * (0.3 + player.iq * 0.4)); c.sa = gp * 12; c.sv = Math.round(c.sa * (0.74 + player.spd * 0.1)); } else {
                c.g = Math.round(gp * (0.1 + player.sht * 0.6) * (pos === 'D' ? 0.5 : 1));
                c.a = Math.round(gp * (0.1 + player.pas * 0.6));
                c.hit = Math.round(gp * player.chk * 1.2);
            }
        }
        if (!rookie && rnd(world) < 0.35 + (player.age - 20) * 0.04) {
            player.move = newMove(world, player);
            player.move.lvl = 1 + Math.floor(rnd(world) * rnd(world) * 3);
            player.move.uses = [0, 30, 120][player.move.lvl - 1];
        }
        return player;
    }

    const overall = p => (p.pos === 'G' ? p.spd * 0.5 + p.iq * 0.5 : p.spd * 0.25 + p.sht * 0.25 + p.pas * 0.2 + p.chk * 0.1 + p.iq * 0.2);
    const rating = team => team.players.reduce((sum, p) => sum + overall(p) * (p.pos === 'G' ? 2.4 : 0.6), 0) / 6;

    function number(world, team, player) {
        do player.num = player.pos === 'G' ? pick(world, [1, 30, 31, 33, 35, 40]) : 2 + Math.floor(rnd(world) * 97); while (team.players.some(p => p !== player && p.num === player.num));
    }

    // Everyone meets everyone twice, home and away: fourteen rounds of four games.
    function schedule(world) {
        const n = TEAMS.length, ring = [];
        for (let i = 1; i < n; i++) ring.push(i);
        for (let i = ring.length - 1; i > 0; i--) { const j = Math.floor(rnd(world) * (i + 1)); [ring[i], ring[j]] = [ring[j], ring[i]]; }
        const rounds = [];
        for (let d = 0; d < n - 1; d++) {
            const order = [0, ...ring.slice(d), ...ring.slice(0, d)], round = [];
            for (let i = 0; i < n / 2; i++) { const a = order[i], b = order[n - 1 - i]; round.push((d + i) % 2 ? [a, b] : [b, a]); }
            rounds.push(round);
        }
        return [...rounds, ...rounds.map(round => round.map(([home, away]) => [away, home]))];
    }

    function setRound(world) {
        const games = world.stage === 'regular' ? world.schedule[world.round]
            : world.series.filter(s => Math.max(...s.wins) < 2).map(s => (s.played % 2 ? [s.b, s.a] : [s.a, s.b]));
        world.fixtures = games.map(([home, away], k) => ({ key: `${world.season}:${world.stage}:${world.round}:${k}`, home, away, done: false, score: null, how: '' }));
    }

    function newWorld(seed) {
        const world = { v: 1, seed: seed >>> 0, rng: seed >>> 0, nextId: 1, season: 1, stage: 'regular', round: 0, teams: [], schedule: [], fixtures: [], series: [], champion: -1,
            champions: [], legends: [], goalieGoals: [], news: [], out: [] };
        TEAMS.forEach((_, i) => world.teams.push({ i, w: 0, l: 0, otl: 0, gf: 0, ga: 0, streak: 0, titles: 0, players: [] }));
        for (const team of world.teams) {
            const promise = (rnd(world) - 0.5) * 0.22;      // some clubs are simply better
            for (const pos of LINEUP) { const p = newPlayer(world, pos, promise, false); team.players.push(p); number(world, team, p); }
            // The better three skate on the first line.
            for (let s = 0; s < 3; s++) if (overall(team.players[s + 3]) > overall(team.players[s])) [team.players[s], team.players[s + 3]] = [team.players[s + 3], team.players[s]];
        }
        world.schedule = schedule(world);
        setRound(world);
        return world;
    }

    const points = team => team.w * 2 + team.otl;
    function standings(world) {
        return [...world.teams].sort((a, b) => points(b) - points(a) || b.w - a.w || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || a.i - b.i);
    }
    // Which of the round's games to watch: the followed club's, or the one between the best-placed pair.
    function featured(world, follow) {
        const open = world.fixtures.map((f, k) => k).filter(k => !world.fixtures[k].done);
        if (!open.length) return -1;
        const mine = open.find(k => TEAMS[world.fixtures[k].home].code === follow || TEAMS[world.fixtures[k].away].code === follow);
        if (mine !== undefined) return mine;
        const place = standings(world).map(t => t.i);
        return open.reduce((best, k) => (place.indexOf(world.fixtures[k].home) + place.indexOf(world.fixtures[k].away) < place.indexOf(world.fixtures[best].home) + place.indexOf(world.fixtures[best].away) ? k : best), open[0]);
    }
    function leaders(world, stat = 'pts', n = 5) {
        const value = p => (stat === 'pts' ? p.s.g + p.s.a : stat === 'svp' ? (p.s.sa >= 10 ? p.s.sv / p.s.sa : 0) : p.s[stat]);
        const all = [];
        for (const team of world.teams) for (const p of team.players) if (stat === 'svp' ? p.pos === 'G' : p.pos !== 'G' || stat !== 'hit') all.push({ player: p, team: team.i, value: value(p) });
        return all.sort((a, b) => b.value - a.value || b.player.s.g - a.player.s.g || a.player.id - b.player.id).slice(0, n);
    }

    // ---- A game ------------------------------------------------------------------

    const att = team => (team ? -1 : 1);                 // which way a side shoots
    const doorX = team => (team ? DOOR_X : -DOOR_X);
    const event = (g, type, more) => { g.events.push({ n: ++g.evN, t: g.tick, type, ...more }); if (g.events.length > 24) g.events.shift(); };

    function newGame(world, k, options = {}) {
        const fx = world.fixtures[k], series = world.stage === 'regular' ? null : world.series.find(s => (s.a === fx.home && s.b === fx.away) || (s.a === fx.away && s.b === fx.home));
        const g = {
            v: 1, league: world.seed, key: fx.key, k, rng: hash(`${world.seed}:${fx.key}`), tick: 0, len: options.period || PERIOD, fast: !!options.fast, period: 1, clock: 0, phase: 'faceoff', phaseT: 0, fmt: 3,
            home: fx.home, away: fx.away, playoff: world.stage !== 'regular', beard: series ? 1 + series.played + (world.stage === 'final' ? 2 : 0) : 0,
            wait: false, score: [0, 0], shots: [0, 0], hits: [0, 0], T: [], P: [], events: [], evN: 0, goals: [], items: [], lastSave: -999, celly: -1, party: false, done: false, winner: -1, how: '',
            puck: { x: 0, y: 0, vx: 0, vy: 0, owner: -1, from: -1, free: 0, to: -1, sauce: false, shot: null, hist: [] },
        };
        g.clock = g.len;
        [fx.home, fx.away].forEach((ti, team) => {
            g.T.push({ ti, ice: [team * 7, team * 7 + 1, team * 7 + 2], goalie: team * 7 + 6, extra: -1, shift: 0, pulled: false, out: -1, queue: [] });
            world.teams[ti].players.forEach((pl, n) => g.P.push({
                i: team * 7 + n, team, pid: pl.id, name: last(pl), num: pl.num, pos: pl.pos, slot: n % 3, g: pl.pos === 'G', on: false,
                x: doorX(team), y: DOOR_Y, vx: 0, vy: 0, dir: team ? Math.PI : 0, down: 0, act: '', actT: 0, think: 0, hold: 0, fumble: 0, hitCool: 0, pokeCool: 0, moveCool: 0, burst: 0, immune: 0,
                leaving: false, hit: -1, see: 0, lane: 0, sx: 0, sy: 0, spotT: 0,
                spd: pl.spd, sht: pl.sht, pas: pl.pas, chk: pl.chk, iq: pl.iq, move: pl.move ? pl.move.type : '', lvl: pl.move ? pl.move.lvl : 0, moveName: pl.move ? pl.move.name : '',
                st: { g: 0, a: 0, hit: 0, sv: 0, sa: 0, tk: 0, mv: 0 },
            }));
        });
        lineup(g, false, true);
        return g;
    }

    const goalieOn = (g, team) => { const k = g.P[g.T[team].goalie]; return k.on && !k.leaving; };
    function skaters(g, team) {
        const T = g.T[team], list = [];
        for (let s = 0; s < 3; s++) { const p = g.P[T.ice[s]]; if (p.on) list.push(p); }
        if (T.extra >= 0 && g.P[T.extra].on) list.push(g.P[T.extra]);
        return list;
    }
    // Where each stands for the puck to be dropped.
    function spot(g, p) {
        const a = att(p.team);
        if (p.g) return [-a * (GOAL_X - 5), 0];
        if (p.i === g.T[p.team].extra) return [-a * 10, -a * 24];
        return [[-a * 4.5, 0], [-a * 10, a * 24], [-a * 28, -a * 7]][p.slot];
    }
    const pulls = (g, team) => g.period === 3 && g.clock < g.len * 0.18 && [1, 2].includes(g.score[1 - team] - g.score[team]);

    // Who is on the ice for the next drop of the puck. `swap` lets a tired line change; `place` puts
    // everyone straight on their spots (the first drop, and games played unwatched).
    function lineup(g, swap, place) {
        for (let team = 0; team < 2; team++) {
            const T = g.T[team], base = team * 7;
            if (T.out >= 0) { g.P[T.out].leaving = false; T.out = -1; }
            T.queue = [];
            if (swap && g.period <= 3 && T.shift > SHIFT * 0.45) { T.ice = T.ice.map(i => (i - base + 3) % 6 + base); T.shift = 0; }
            if (g.period > 3) T.ice = [base, base + 1, base + 2];                 // overtime is for the first line
            T.pulled = pulls(g, team);
            T.extra = T.pulled ? (T.ice[0] - base + 3) % 6 + base : -1;
            for (let n = 0; n < 7; n++) {
                const p = g.P[base + n], slotOn = T.ice.includes(p.i) && (g.fmt === 3 || p.slot !== 1);
                const on = p.g ? !T.pulled && g.period < 5 : slotOn || p.i === T.extra;
                if (on && (!p.on || place)) { p.x = doorX(team); p.y = DOOR_Y; p.vx = p.vy = 0; }
                p.on = on;
                p.leaving = false; p.down = 0; p.act = ''; p.actT = 0; p.hit = -1; p.immune = 0; p.burst = 0; p.hold = 0; p.see = 0;
                if (on && place) { [p.x, p.y] = spot(g, p); p.dir = team ? Math.PI : 0; }
            }
        }
        const pk = g.puck;
        Object.assign(pk, { x: 0, y: 0, vx: 0, vy: 0, owner: -1, from: -1, to: -1, sauce: false, shot: null, hist: [] });
        g.phase = 'faceoff';
        g.phaseT = 0;
        g.celly = -1;
    }

    // ---- Skating -----------------------------------------------------------------

    const topSpeed = p => (p.g ? 30 : (43 + 20 * p.spd) * (p.burst > 0 ? 1.38 : 1));

    // Push toward a point. A skater cannot change his mind faster than his edges allow, so he arcs.
    function steer(p, tx, ty, want = 1, arrive = 12) {
        const dx = tx - p.x, dy = ty - p.y, d = hyp(dx, dy) || 1e-6;
        let speed = topSpeed(p) * want;
        if (arrive && d < arrive) speed *= d / arrive;
        const ax = dx / d * speed - p.vx, ay = dy / d * speed - p.vy, need = hyp(ax, ay) || 1e-6;
        const push = Math.min(need, (p.g ? 260 : 88 + 46 * p.spd) * (p.burst > 0 ? 1.5 : 1) * STEP);
        p.vx += ax / need * push;
        p.vy += ay / need * push;
    }

    // Keep a circle inside the boards; bounce what hits them. Returns how hard it hit.
    function boards(o, r, bounce) {
        const ax = Math.abs(o.x), ay = Math.abs(o.y), cx = HL - CORNER, cy = HW - CORNER, sx = o.x < 0 ? -1 : 1, sy = o.y < 0 ? -1 : 1;
        let hit = 0;
        if (ax > cx && ay > cy) {
            const dx = ax - cx, dy = ay - cy, d = hyp(dx, dy), lim = CORNER - r;
            if (d > lim) {
                const nx = dx / d * sx, ny = dy / d * sy, vn = o.vx * nx + o.vy * ny;
                o.x = sx * cx + nx * lim;
                o.y = sy * cy + ny * lim;
                if (vn > 0) { o.vx -= (1 + bounce) * vn * nx; o.vy -= (1 + bounce) * vn * ny; hit = vn; }
            }
            return hit;
        }
        if (ax > HL - r) { o.x = sx * (HL - r); if (o.vx * sx > 0) { hit = Math.abs(o.vx); o.vx *= -bounce; } }
        if (ay > HW - r) { o.y = sy * (HW - r); if (o.vy * sy > 0) { hit = Math.max(hit, Math.abs(o.vy)); o.vy *= -bounce; } }
        return hit;
    }
    const inside = (x, y, r = 0) => { const o = { x, y, vx: 0, vy: 0 }; boards(o, r, 0); return o.x === x && o.y === y; };

    // A net is solid from the sides and the back.
    // (The puck has no front to hit: through the mouth is a goal, and the posts are their own affair.)
    function netBlock(o, r, puck) {
        const s = o.x < 0 ? -1 : 1, u = o.x * s;
        if (u < GOAL_X - (puck ? -0.01 : r) || u > GOAL_X + NET_DEPTH + r || Math.abs(o.y) > NET_HALF + r) return false;
        const front = puck ? 1e9 : u - (GOAL_X - r), back = GOAL_X + NET_DEPTH + r - u, side = NET_HALF + r - Math.abs(o.y);
        if (side < front && side < back) { o.y = (o.y < 0 ? -1 : 1) * (NET_HALF + r); o.vy *= -0.5; } else if (back < front) { o.x = s * (GOAL_X + NET_DEPTH + r); o.vx *= -0.5; } else { o.x = s * (GOAL_X - r); o.vx *= -0.5; }
        return true;
    }

    function knock(g, victim, by, ticks) {
        victim.down = ticks;
        victim.act = '';
        victim.actT = 0;
        if (g.puck.owner === victim.i) loosen(g, victim, by);
    }

    function loosen(g, from, by) {
        const pk = g.puck, turn = rnd(g) * 6.283, speed = 25 + rnd(g) * 35;
        pk.owner = -1;
        pk.vx = from.vx * 0.4 + Math.cos(turn) * speed + (by ? by.vx * 0.3 : 0);
        pk.vy = from.vy * 0.4 + Math.sin(turn) * speed + (by ? by.vy * 0.3 : 0);
        pk.from = from.i;
        pk.free = g.tick + 24;
        pk.to = -1;
        pk.shot = null;
    }

    function movePlayers(g, live) {
        const P = g.P;
        for (const p of P) {
            if (!p.on) continue;
            if (p.down > 0) { p.down--; p.vx *= 0.965; p.vy *= 0.965; }
            for (const key of ['fumble', 'hitCool', 'pokeCool', 'moveCool', 'burst', 'immune']) if (p[key] > 0) p[key]--;
            if (p.actT > 0 && --p.actT === 0 && p.act !== 'windup') p.act = '';
            p.x += p.vx * STEP;
            p.y += p.vy * STEP;
            boards(p, p.g ? GOALIE_R : SKATER_R, 0.2);
            if (!p.g) netBlock(p, SKATER_R * 0.8);
            const speed = hyp(p.vx, p.vy);
            if (p.act === 'spin') p.dir += 0.5;
            else if (p.down <= 0) {
                // He looks where he is going, or at the puck when standing.
                const want = speed > 6 ? Math.atan2(p.vy, p.vx) : Math.atan2(g.puck.y - p.y, g.puck.x - p.x);
                let turn = want - p.dir;
                while (turn > Math.PI) turn -= 2 * Math.PI;
                while (turn < -Math.PI) turn += 2 * Math.PI;
                p.dir += clamp(turn, -0.3, 0.3);
            }
        }
        // Bodies: they push apart, and now and then one goes down.
        for (let i = 0; i < P.length; i++) {
            const a = P[i];
            if (!a.on) continue;
            for (let j = i + 1; j < P.length; j++) {
                const b = P[j];
                if (!b.on) continue;
                const dx = b.x - a.x, dy = b.y - a.y, reach = (a.g ? GOALIE_R : SKATER_R) + (b.g ? GOALIE_R : SKATER_R), d2 = dx * dx + dy * dy;
                if (d2 >= reach * reach) continue;
                const d = Math.sqrt(d2) || 1e-6, nx = dx / d, ny = dy / d, over = reach - d;
                const wa = a.g ? 0 : b.g ? 1 : 0.5, wb = b.g ? 0 : a.g ? 1 : 0.5;
                a.x -= nx * over * wa; a.y -= ny * over * wa;
                b.x += nx * over * wb; b.y += ny * over * wb;
                const closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
                if (closing <= 0) continue;
                // Share the bump.
                a.vx -= nx * closing * wa * 0.9; a.vy -= ny * closing * wa * 0.9;
                b.vx += nx * closing * wb * 0.9; b.vy += ny * closing * wb * 0.9;
                if (!live || a.down > 0 || b.down > 0) continue;
                if (a.g || b.g) {
                    // Nobody moves a goalie. Charging one ends on the seat of the trousers.
                    const s = a.g ? b : a;
                    if (!a.g || !b.g) if (closing > 48 && rnd(g) < 0.3) { knock(g, s, null, 45); event(g, 'crash', { by: s.i }); }
                } else if (a.team !== b.team) {
                    const aInto = a.vx * nx + a.vy * ny, bInto = -(b.vx * nx + b.vy * ny);
                    const hitter = a.hit === b.i ? a : b.hit === a.i ? b : aInto >= bInto ? a : b, victim = hitter === a ? b : a;
                    const meant = hitter.hit === victim.i;
                    if (hitter.hitCool > 0 || victim.immune > 0 || closing < (meant ? 22 : 50)) continue;
                    hitter.hitCool = hitter.move === 'bulldozer' ? 260 : 300 + Math.floor(rnd(g) * 500);
                    const power = closing / 90 + hitter.chk * 0.5 - victim.chk * 0.4 + (hitter.move === 'bulldozer' ? 0.25 + 0.08 * hitter.lvl : 0) + (meant ? 0.1 : -0.2) - 0.6;
                    if (rnd(g) < power) {
                        const big = closing > 44 || hitter.move === 'bulldozer';
                        knock(g, victim, hitter, 50 + Math.floor(rnd(g) * 40) + (big ? 20 : 0));
                        victim.vx = hitter.vx * 0.6 + (hitter === a ? nx : -nx) * 22;
                        victim.vy = hitter.vy * 0.6 + (hitter === a ? ny : -ny) * 22;
                        hitter.vx *= 0.5; hitter.vy *= 0.5;
                        hitter.st.hit++;
                        g.hits[hitter.team]++;
                        if (hitter.move === 'bulldozer') hitter.st.mv++;
                        event(g, 'hit', { by: hitter.i, on: victim.i, big, move: hitter.move === 'bulldozer' });
                    }
                } else if (closing > 52 && rnd(g) < 0.2) {
                    knock(g, a, null, 50); knock(g, b, null, 60);
                    event(g, 'oops', { by: a.i, on: b.i });
                }
            }
        }
    }

    // A shove must not put anyone through the boards.
    function contain(g) {
        for (const p of g.P) if (p.on) boards(p, p.g ? GOALIE_R : SKATER_R, 0.2);
    }

    // ---- The puck ----------------------------------------------------------------

    const stickX = p => p.x + Math.cos(p.dir) * 4.6 - Math.sin(p.dir) * (p.g ? 0 : 1.5), stickY = p => p.y + Math.sin(p.dir) * 4.6 + Math.cos(p.dir) * (p.g ? 0 : 1.5);

    function gain(g, p) {
        const pk = g.puck;
        pk.owner = p.i;
        pk.shot = null;
        pk.to = -1;
        pk.sauce = false;
        p.hold = 0;
        p.think = 5 + Math.floor(rnd(g) * 8);
        if (pk.hist.length && g.P[pk.hist[0]].team !== p.team) pk.hist = [];
        pk.hist = [p.i, ...pk.hist.filter(i => i !== p.i)].slice(0, 3);
    }

    function release(g, p, vx, vy, more) {
        const pk = g.puck, o = { x: stickX(p), y: stickY(p), vx: 0, vy: 0 };
        boards(o, PUCK_R, 0);
        Object.assign(pk, { owner: -1, x: o.x, y: o.y, vx, vy, from: p.i, free: g.tick + 16, to: -1, sauce: false, shot: null }, more);
        p.act = more && more.shot ? 'shoot' : 'pass';
        p.actT = 14;
        p.think = 20;
    }

    function laneClear(x0, y0, x1, y1, foes, width) {
        const dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy || 1e-6;
        for (const f of foes) {
            if (f.down > 0) continue;
            const t = ((f.x - x0) * dx + (f.y - y0) * dy) / len2;
            if (t < 0.06 || t > 0.96) continue;
            if (hyp(x0 + dx * t - f.x, y0 + dy * t - f.y) < width) return false;
        }
        return true;
    }

    function shoot(g, c, kind) {
        const a = att(c.team), gx = a * GOAL_X, sx = stickX(c), sy = stickY(c), keeper = g.P[g.T[1 - c.team].goalie], open = !goalieOn(g, 1 - c.team);
        // The corner the goalie is not in, if he has the wit to see it.
        let ty = 0;
        if (!open) ty = (rnd(g) < 0.55 + 0.4 * c.iq ? (keeper.y > 0 ? -1 : 1) : (rnd(g) < 0.5 ? -1 : 1)) * (NET_HALF - 2.7);
        const spread = (0.03 + 0.11 * (1 - c.sht)) * ({ sniper: 0.4 - 0.05 * c.lvl, slapper: 1.25, onetimer: 1.15, long: 1.7 }[kind] || 1);
        const angle = Math.atan2(ty - sy, gx - sx) + bell(g) * spread;
        const speed = (150 + 55 * c.sht) * ({ slapper: 1.28 + 0.04 * c.lvl, onetimer: 1.12, long: 1.1 }[kind] || 1);
        if (kind === 'slapper' || kind === 'sniper' || kind === 'onetimer') { c.st.mv++; if (kind !== 'sniper') event(g, 'move', { by: c.i, kind }); }
        release(g, c, Math.cos(angle) * speed, Math.sin(angle) * speed, { shot: { by: c.i, team: c.team, kind, d: hyp(gx - sx, sy), counted: false } });
    }

    function pass(g, c, m) {
        const sx = stickX(c), sy = stickY(c), d = hyp(m.x - sx, m.y - sy);
        const speed = Math.min(105 + 45 * c.pas, 62 + d * 1.7), lead = d / speed * 0.85;
        const target = { x: m.x + m.vx * lead, y: m.y + m.vy * lead, vx: 0, vy: 0 };
        boards(target, 3, 0);
        const sauce = c.move === 'saucer';
        const angle = Math.atan2(target.y - sy, target.x - sx) + bell(g) * (0.025 + 0.09 * (1 - c.pas)) * (sauce ? 0.5 : 1);
        if (sauce) { c.st.mv++; }
        release(g, c, Math.cos(angle) * speed, Math.sin(angle) * speed, { to: m.i, sauce });
    }

    function goal(g, team) {
        const pk = g.puck, P = g.P;
        // The last of the scoring side to have it; failing that (it went in off a defender), whoever is nearest.
        let scorer = pk.hist.map(i => P[i]).find(p => p.team === team);
        const helpers = scorer ? pk.hist.map(i => P[i]).filter(p => p.team === team && p !== scorer).slice(0, 2) : [];
        if (pk.shot && pk.shot.team === team) scorer = P[pk.shot.by];
        if (!scorer) scorer = skaters(g, team).reduce((best, p) => (!best || hyp(p.x - pk.x, p.y - pk.y) < hyp(best.x - pk.x, best.y - pk.y) ? p : best), null) || P[g.T[team].goalie];
        const assists = helpers.filter(p => p !== scorer);
        const empty = !goalieOn(g, 1 - team);
        g.score[team]++;
        if (!pk.shot || !pk.shot.counted) g.shots[team]++;
        if (!empty) P[g.T[1 - team].goalie].st.sa++;
        scorer.st.g++;
        for (const p of assists) p.st.a++;
        const kind = pk.shot && pk.shot.team === team ? pk.shot.kind : 'scramble';
        const entry = { n: g.goals.length + 1, period: g.period, clock: g.clock, team, by: scorer.i, a: assists.map(p => p.i), kind, empty, keeper: scorer.g, rebound: g.tick - g.lastSave < 100,
            far: pk.shot ? pk.shot.d : 0, move: ['slapper', 'sniper', 'onetimer'].includes(kind) && scorer.move === kind ? scorer.moveName : '', nth: scorer.st.g, score: [...g.score] };
        g.goals.push(entry);
        event(g, 'goal', { goal: entry });
        if (scorer.st.g === 3) event(g, 'hattrick', { by: scorer.i });
        pk.vx *= 0.15; pk.vy *= 0.15;
        pk.owner = -1; pk.shot = null; pk.to = -1;
        g.celly = scorer.i;
        if (g.period > 3) return finish(g, team, g.period === 4 ? 'OT' : 'SD');
        g.phase = 'goal';
        g.phaseT = 0;
    }

    function finish(g, winner, how) {
        g.winner = winner;
        g.how = how;
        g.done = true;
        g.phase = 'over';
        g.phaseT = 0;
        if (g.puck.owner >= 0) g.puck.owner = -1;
        event(g, 'final', { winner, how });
    }

    function movePuck(g) {
        const pk = g.puck, P = g.P;
        if (pk.owner >= 0) {
            const c = P[pk.owner];
            if (!c.on || c.down > 0) loosen(g, c, null);
            else {
                const x0 = pk.x, o = { x: stickX(c), y: stickY(c), vx: 0, vy: 0 };
                boards(o, PUCK_R, 0);
                // Carried over the line between the posts counts too, unless the goalie is on it.
                for (const s of [-1, 1]) {
                    if (c.g || !(x0 * s < GOAL_X && o.x * s >= GOAL_X && Math.abs(o.y) < NET_HALF - 0.4)) continue;
                    const keeper = P[g.T[s > 0 ? 1 : 0].goalie];
                    if (keeper.on && hyp(keeper.x - o.x, keeper.y - o.y) < GOALIE_R + 3.5) { gain(g, keeper); keeper.st.sv++; keeper.st.sa++; g.shots[c.team]++; g.lastSave = g.tick; event(g, 'save', { by: keeper.i, from: c.i, stuffed: true }); return; }
                    pk.x = o.x; pk.y = o.y;
                    return goal(g, s > 0 ? 0 : 1);
                }
                netBlock(o, PUCK_R, true);
                pk.x = o.x; pk.y = o.y; pk.vx = c.vx; pk.vy = c.vy;
                return;
            }
        }
        for (let sub = 0; sub < 2; sub++) {
            const x0 = pk.x, y0 = pk.y;
            pk.x += pk.vx * STEP / 2;
            pk.y += pk.vy * STEP / 2;
            // Over a goal line between the posts, from the front: a goal.
            for (const s of [-1, 1]) {
                if (!(x0 * s < GOAL_X && pk.x * s >= GOAL_X)) continue;
                const y = y0 + (pk.y - y0) * ((GOAL_X - x0 * s) / ((pk.x - x0) * s || 1e-6));
                if (Math.abs(y) < NET_HALF - 0.3) return goal(g, s > 0 ? 0 : 1);
            }
            // The posts ring.
            for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
                const dx = pk.x - sx * GOAL_X, dy = pk.y - sy * NET_HALF, d = hyp(dx, dy), lim = POST + PUCK_R;
                if (d >= lim || d === 0) continue;
                const nx = dx / d, ny = dy / d, vn = pk.vx * nx + pk.vy * ny;
                pk.x = sx * GOAL_X + nx * lim; pk.y = sy * NET_HALF + ny * lim;
                if (vn < 0) {
                    pk.vx -= 1.8 * vn * nx; pk.vy -= 1.8 * vn * ny;
                    if (pk.shot && vn < -50) { event(g, 'post', { by: pk.shot.by }); pk.shot = null; }
                }
            }
            if (netBlock(pk, PUCK_R, true)) pk.shot = null;
            if (boards(pk, PUCK_R, 0.72) > 30 && pk.shot) pk.shot = null;
        }
        pk.vx *= SLIDE; pk.vy *= SLIDE;
        const speed = hyp(pk.vx, pk.vy);
        if (speed < 3) pk.vx = pk.vy = 0;

        // Goalies: a body in the way, and a glove.
        for (let team = 0; team < 2; team++) {
            const k = P[g.T[team].goalie];
            if (!k.on || k.leaving) continue;
            const dx = pk.x - k.x, dy = pk.y - k.y, d = hyp(dx, dy) || 1e-6, lim = GOALIE_R + PUCK_R + (k.act === 'save' ? 0.6 : 0.2);
            if (d >= lim) continue;
            if (pk.from === k.i && pk.free > g.tick) continue;
            const real = pk.shot && pk.shot.team !== team && speed > 60;
            if (real) {
                k.st.sv++; k.st.sa++;
                if (!pk.shot.counted) g.shots[1 - team]++;
                g.lastSave = g.tick;
                const moved = k.move && k.act === 'save' && k.moveCool <= 0;
                if (moved) { k.st.mv++; k.moveCool = 300; }
                event(g, 'save', { by: k.i, from: pk.shot.by, big: pk.shot.d < 26 || speed > 190, move: moved ? k.moveName : '' });
            }
            if (speed < 60 || rnd(g) < 0.3 + 0.4 * k.iq + (k.move === 'glove' ? 0.1 + 0.05 * k.lvl : 0)) { gain(g, k); return; }
            // A rebound, out into the slot.
            const out = att(team), turn = (rnd(g) - 0.5) * 1.9, pace = Math.min(speed * 0.4, 75) + 15;
            pk.x = k.x + dx / d * lim; pk.y = k.y + dy / d * lim;
            pk.vx = Math.cos(turn) * pace * out; pk.vy = Math.sin(turn) * pace;
            pk.shot = null; pk.to = -1; pk.from = k.i; pk.free = g.tick + 10;
            return;
        }
        // Skaters: a body blocks, a stick collects.
        for (let n = 0; n < P.length; n++) {
            const p = P[(n + (g.tick % 2) * 7) % P.length];
            if (!p.on || p.g) continue;
            const dx = pk.x - p.x, dy = pk.y - p.y, d = hyp(dx, dy) || 1e-6;
            if (d > REACH) continue;
            if (pk.from === p.i && pk.free > g.tick) continue;
            const fast = pk.shot && speed > 80, body = d < SKATER_R * 0.8 + PUCK_R;
            if (p.down > 0 || fast) {
                if (!body) continue;
                const nx = dx / d, ny = dy / d, vn = (pk.vx - p.vx) * nx + (pk.vy - p.vy) * ny;
                pk.x = p.x + nx * (SKATER_R * 0.8 + PUCK_R); pk.y = p.y + ny * (SKATER_R * 0.8 + PUCK_R);
                if (vn < 0) {
                    pk.vx = (pk.vx - 1.5 * vn * nx) * 0.45; pk.vy = (pk.vy - 1.5 * vn * ny) * 0.45;
                    if (fast && pk.shot.team !== p.team) event(g, 'block', { by: p.i });
                    pk.shot = null; pk.to = -1;
                }
                continue;
            }
            if (p.fumble > 0 || p.leaving) continue;
            const mine = pk.to === p.i, foe = pk.from >= 0 && P[pk.from].team !== p.team;
            if (pk.sauce && foe && pk.to >= 0 && hyp(P[pk.to].x - pk.x, P[pk.to].y - pk.y) > 9) continue;      // it hops over his stick
            const rel = hyp(pk.vx - p.vx, pk.vy - p.vy);
            const chance = mine ? 0.9 + 0.1 * p.pas : rel < 45 ? 1 : clamp(1 - (rel - 45) / (60 + 50 * p.pas), 0.04, 1);
            if (rnd(g) > chance) {
                p.fumble = 18;
                const turn = (rnd(g) - 0.5) * 0.8, c = Math.cos(turn), s = Math.sin(turn);
                [pk.vx, pk.vy] = [(pk.vx * c - pk.vy * s) * 0.75, (pk.vx * s + pk.vy * c) * 0.75];
                continue;
            }
            const taken = pk.to >= 0 && !mine && P[pk.to].team !== p.team;
            gain(g, p);
            if (taken) { p.st.tk++; event(g, 'pick', { by: p.i }); }
            // First time, off the pass.
            const a = att(p.team), dg = hyp(a * GOAL_X - p.x, p.y);
            if (mine && p.move === 'onetimer' && p.moveCool <= 0 && dg < 48 && a * (a * GOAL_X - p.x) > 4 && goalieOn(g, 1 - p.team)) {
                p.moveCool = 150;
                p.dir = Math.atan2(-p.y, a * GOAL_X - p.x);
                shoot(g, p, 'onetimer');
            }
            return;
        }
    }

    // When and where a skater could meet the puck.
    function meet(p, pk) {
        const top = (43 + 20 * p.spd) * 0.9;
        for (let t = 0.1; t <= 2.6; t += 0.1) {
            const slid = (1 - Math.pow(0.637, t)) / 0.451;
            const x = clamp(pk.x + pk.vx * slid, -HL + 2, HL - 2), y = clamp(pk.y + pk.vy * slid, -HW + 2, HW - 2);
            if (hyp(x - p.x, y - p.y) - REACH * 0.8 <= top * t) return { t, x, y };
        }
        return { t: 2.6 + hyp(pk.x - p.x, pk.y - p.y) / top, x: pk.x, y: pk.y };
    }

    // ---- What each of them is trying to do ------------------------------------------

    function carry(g, c, mates, foes) {
        const a = att(c.team), gx = a * GOAL_X, open = !goalieOn(g, 1 - c.team);
        c.hold++;
        let near = null, dn = 99;
        for (const f of foes) { if (f.down > 0) continue; const d = hyp(f.x - c.x, f.y - c.y); if (d < dn) { dn = d; near = f; } }
        const dg = hyp(gx - c.x, c.y), ahead = a * (gx - c.x);
        if (c.act === 'windup') {
            // The stick is up: he glides, and then lets it go.
            c.vx *= 0.97; c.vy *= 0.97;
            c.dir = Math.atan2(-c.y * 0.6, gx - c.x);
            if (c.actT <= 0) { c.act = ''; shoot(g, c, 'slapper'); }
            return;
        }
        // Signature moves that answer pressure, at once rather than on a think.
        if (c.moveCool <= 0 && near && dn < 11.5) {
            if (c.move === 'spin') {
                const side = (c.x - near.x) * c.vy - (c.y - near.y) * c.vx > 0 ? 1 : -1, turn = side * 0.9, cs = Math.cos(turn), sn = Math.sin(turn), v = Math.max(hyp(c.vx, c.vy), 36) * 1.1, d = hyp(c.vx, c.vy) || 1;
                [c.vx, c.vy] = [(c.vx * cs - c.vy * sn) / d * v, (c.vx * sn + c.vy * cs) / d * v];
                Object.assign(c, { act: 'spin', actT: 26, immune: 26 + 4 * c.lvl, moveCool: 800 - 60 * c.lvl });
                c.st.mv++;
                event(g, 'move', { by: c.i, kind: 'spin' });
            } else if (c.move === 'dangle') {
                Object.assign(c, { act: 'dangle', actT: 30, immune: 14 + 5 * c.lvl, moveCool: 760 - 60 * c.lvl });
                c.vy += (c.y > near.y ? 1 : -1) * 22; c.vx += a * 8;
                c.st.mv++;
                event(g, 'move', { by: c.i, kind: 'dangle' });
            }
        }
        if (c.move === 'jet' && c.moveCool <= 0 && dn > 16 && ahead > 40 && ahead < 130 && laneClear(c.x, c.y, c.x + a * 34, c.y, foes, 11)) {
            Object.assign(c, { burst: 60 + 12 * c.lvl, moveCool: 660 - 40 * c.lvl, act: 'jet', actT: 60 });
            c.st.mv++;
            event(g, 'move', { by: c.i, kind: 'jet' });
        }
        // Where to skate with it.
        let tx, ty;
        if (c.g) { tx = c.x; ty = c.y; } else if (ahead > 46) {
            if (--c.spotT <= 0) {
                c.spotT = 22;
                let best = -99;
                for (const lane of [-32, -13, 13, 32]) {
                    let room = 40;
                    for (const f of foes) { const fx = a * (f.x - c.x); if (fx > -4 && fx < 46) room = Math.min(room, Math.abs(f.y - lane) + fx * 0.3); }
                    const value = room - Math.abs(lane - c.y) * 0.35;
                    if (value > best) { best = value; c.lane = lane; }
                }
            }
            tx = c.x + a * 30; ty = c.lane;
        } else if (ahead < 7) { tx = gx - a * 26; ty = c.y > 0 ? 20 : -20; } else {
            tx = gx - a * 19; ty = (c.y >= 0 ? 1 : -1) * 5;
            if (near && dn < 15) ty += (c.y > near.y ? 1 : -1) * 12;
        }
        if (!c.g) steer(c, tx, ty, 0.93, 0);
        if (--c.think > 0) return;
        c.think = 5 + Math.floor(rnd(g) * 6 + (1 - c.iq) * 7);

        if (c.g) return;                                           // a goalie's puck is the goalie's business (tend)
        // A shot?
        if (open && a * c.x > (dn < 11 ? -40 : -5) && laneClear(c.x, c.y, gx, 0, foes, 5.5) && rnd(g) < 0.5) return shoot(g, c, dg > 70 ? 'long' : 'wrist');
        const range = c.move === 'slapper' ? 70 : 54;
        if (ahead > 4 && dg < range && !open) {
            const lane = laneClear(c.x, c.y, gx, 0, foes, 3.4), off = Math.abs(c.y) / (dg || 1);
            let q = (1 - dg / range) * (1 - off * 0.8) + (lane ? 0.18 : -0.3) + (dg < 21 ? 0.5 : 0) + (c.hold > 260 ? 0.35 : 0) + (dn < 10.5 ? 0.1 : 0) + (c.move === 'slapper' && dn > 14 && dg > 27 ? 0.25 : 0);
            if (g.period === 3 && g.clock < 240) q += 0.3;
            if (rnd(g) < q * 0.3) {
                if (c.move === 'slapper' && dn > 14 && dg > 27) { c.act = 'windup'; c.actT = 26 - 3 * c.lvl; return; }
                return shoot(g, c, c.move === 'sniper' ? 'sniper' : 'wrist');
            }
        }
        // A pass?
        let best = null, value = 1.1 - (dn < 12.5 ? 0.5 : 0) - c.pas * 0.25 - (c.hold > 200 ? 0.4 : 0) - (c.move === 'saucer' ? 0.2 : 0);
        for (const m of mates) {
            if (m === c || m.down > 0 || m.leaving) continue;
            const d = hyp(m.x - c.x, m.y - c.y);
            if (d < 13 || d > 95 || !laneClear(c.x, c.y, m.x, m.y, foes, c.move === 'saucer' ? 2 : 4.6)) continue;
            let room = 30;
            for (const f of foes) if (f.down <= 0) room = Math.min(room, hyp(f.x - m.x, f.y - m.y));
            const mg = hyp(gx - m.x, m.y), slot = mg < 36 && Math.abs(m.y) < 21 && a * (gx - m.x) > 5 ? 0.7 : 0, across = c.y * m.y < 0 && a * m.x > 30 ? 0.35 : 0;
            const v = a * (m.x - c.x) / 50 * 0.7 + Math.min(1, room / 18) * 0.5 + slot + across + (slot && m.move === 'onetimer' ? 0.35 : 0) + rnd(g) * 0.25;
            if (v > value) { value = v; best = m; }
        }
        if (best) return pass(g, c, best);
        // Hemmed in at his own end: off the boards and out.
        if (dn < 11 && a * c.x < -38) {
            const angle = Math.atan2((c.y >= 0 ? 1 : -1) * (HW - 2) - c.y, a * 45) + bell(g) * 0.15;
            release(g, c, Math.cos(angle) * 125, Math.sin(angle) * 125, null);
            event(g, 'clear', { by: c.i });
        }
    }

    // A goalie: on the line between the puck and the middle of his net, out a little; across in a hurry
    // when a shot is coming; and with the puck in his glove, a look up the ice.
    function tend(g, k, mates, foes) {
        const pk = g.puck, a = att(k.team), ox = -a * GOAL_X;
        if (k.leaving) return;
        if (pk.owner === k.i) {
            k.vx *= 0.8; k.vy *= 0.8;
            if (++k.hold < 26 + (k.pid % 16)) return;
            const sx = stickX(k), sy = stickY(k);
            if (!goalieOn(g, 1 - k.team)) {
                // Their net is empty, a hundred and sixty feet away. Well, why not.
                const angle = Math.atan2(-sy, -ox - sx) + bell(g) * (0.02 + 0.045 * (1 - k.pas));
                k.dir = angle;
                release(g, k, Math.cos(angle) * 205, Math.sin(angle) * 205, { shot: { by: k.i, team: k.team, kind: 'long', d: hyp(-ox - sx, sy), counted: false } });
                event(g, 'heave', { by: k.i });
                return;
            }
            let best = null, most = -1;
            for (const m of mates) {
                if (m.down > 0 || m.leaving) continue;
                let room = 30;
                for (const f of foes) room = Math.min(room, hyp(f.x - m.x, f.y - m.y));
                const v = room + (laneClear(sx, sy, m.x, m.y, foes, 5) ? 20 : 0) + a * (m.x - k.x) * 0.1;
                if (v > most) { most = v; best = m; }
            }
            if (best) { k.dir = Math.atan2(best.y - k.y, best.x - k.x); pass(g, k, best); } else { const angle = (a > 0 ? 0 : Math.PI) + (rnd(g) < 0.5 ? 0.8 : -0.8); k.dir = angle; release(g, k, Math.cos(angle) * 110, Math.sin(angle) * 110, null); }
            return;
        }
        const dx = pk.x - ox, dy = pk.y, d = hyp(dx, dy) || 1e-6, out = 3 + 2 * k.iq;
        let tx = ox + dx / d * out, ty = dy / d * out, speed = 16 + 16 * k.spd;
        if (a * dx < 1.5) { tx = ox + a * 1.6; ty = (pk.y < 0 ? -1 : 1) * (NET_HALF - 2.4); }
        if (k.act === 'save' && k.actT <= 1) k.act = '';
        if (pk.owner < 0) {
            const into = -a * pk.vx;
            let coming = false;
            if (into > 45) {
                const tc = (a * dx - 2.2) / into, yc = pk.y + pk.vy * tc;
                if (tc > -0.02 && tc < 0.9 && Math.abs(yc) < NET_HALF + 2.5) {
                    coming = true;
                    if (++k.see > 3.5 + (1 - k.iq) * 7.5) {
                        tx = ox + a * 2.2; ty = clamp(yc, -NET_HALF + 1, NET_HALF - 1);
                        speed = 46 + 40 * k.spd + (k.move === 'splits' ? 8 + 5 * k.lvl : 0);
                        k.act = 'save'; k.actT = 16;
                    } else { tx = k.x; ty = k.y; }               // he has not seen it yet
                }
            }
            if (!coming) k.see = 0;
            // A puck dying in his crease: fall on it.
            if (!coming && hyp(pk.vx, pk.vy) < 45 && d < CREASE + 1 && a * dx > 0) {
                let nearer = false;
                for (const f of foes) if (f.down <= 0 && hyp(f.x - pk.x, f.y - pk.y) < hyp(k.x - pk.x, k.y - pk.y) - 2) nearer = true;
                if (!nearer) { tx = pk.x; ty = pk.y; speed = 40; }
            }
        } else k.see = 0;
        tx = a > 0 ? clamp(tx, ox + 1.2, ox + CREASE) : clamp(tx, ox - CREASE, ox - 1.2);
        ty = clamp(ty, -NET_HALF - 1.5, NET_HALF + 1.5);
        const mx = tx - k.x, my = ty - k.y, md = hyp(mx, my) || 1e-6, v = Math.min(speed, md / STEP);
        k.vx += (mx / md * v - k.vx) * 0.5;
        k.vy += (my / md * v - k.vy) * 0.5;
    }

    function plan(g) {
        const pk = g.puck, P = g.P;
        // Turn and turn about, so neither side always thinks first.
        for (let n = 0; n < 2; n++) {
            const team = (n + g.tick) % 2, owner = pk.owner >= 0 ? P[pk.owner] : null;
            const a = att(team), gx = a * GOAL_X, ox = -gx, T = g.T[team];
            const us = skaters(g, team), them = skaters(g, 1 - team), able = us.filter(p => p.down <= 0 && !p.leaving && p.act !== 'windup');
            for (const p of us) p.hit = -1;
            const keeper = P[T.goalie];
            if (keeper.on) tend(g, keeper, us, them);
            if (owner && owner.team === team) {
                if (!owner.g) carry(g, owner, us, them);
                const others = able.filter(p => p !== owner);
                // The one who hangs back as a way out, and those who go looking for open ice.
                let trailer = others.find(p => p.pos === 'D' && p.i !== T.extra) || null;
                if (!trailer && others.length > 1) trailer = others.reduce((b, p) => (a * p.x < a * b.x ? p : b));
                const taken = [];
                for (const p of others) {
                    const side = owner.y >= 0 ? 1 : -1;
                    if (owner.g) { const s = spot(g, p); steer(p, s[0] * 1.6 + a * 12, s[1] * 1.3 + (p.slot === 0 ? side * -18 : 0), 0.8); continue; }
                    if (p === trailer) { steer(p, clamp(a * (owner.x - a * 30), -GOAL_X + 20, 42) * a, -side * 15, 0.85); continue; }
                    if (a * owner.x < 5) { steer(p, clamp(a * (owner.x + a * 38), -60, GOAL_X - 16) * a, -side * 25 * (taken.length ? -0.3 : 1), 0.95); taken.push([0, 0]); continue; }
                    if (--p.spotT <= 0) {
                        p.spotT = 24;
                        let best = -99;
                        for (const [back, wide] of [[13, 12], [13, -12], [27, 22], [27, -22], [23, 0], [40, 9], [40, -9]]) {
                            const x = gx - a * back, y = wide;
                            let room = 20;
                            for (const f of them) room = Math.min(room, hyp(f.x - x, f.y - y));
                            let v = room / 20 + (laneClear(owner.x, owner.y, x, y, them, 4.5) ? 0.6 : 0) + (y * owner.y < 0 ? 0.3 : 0) - hyp(p.x - x, p.y - y) / 110 + rnd(g) * 0.2;
                            for (const [ox2, oy2] of taken) if (hyp(ox2 - x, oy2 - y) < 13) v -= 1;
                            if (v > best) { best = v; p.sx = x; p.sy = y; }
                        }
                    }
                    taken.push([p.sx, p.sy]);
                    steer(p, p.sx, p.sy, 0.95, 8);
                }
            } else if (owner) {
                // They have it. One goes at the carrier, one stays between him and the net, the rest take a man.
                const c = owner, deep = a * c.x > 34;
                let presser = null, best = 1e9;
                for (const p of able) { const d = hyp(c.x + c.vx * 0.2 - p.x, c.y + c.vy * 0.2 - p.y) + (p.pos === 'D' && !deep ? 8 : 0); if (d < best) { best = d; presser = p; } }
                let safety = able.find(p => p.pos === 'D' && p !== presser && p.i !== T.extra) || null;
                if (!safety) for (const p of able) if (p !== presser && (!safety || hyp(p.x - ox, p.y) < hyp(safety.x - ox, safety.y))) safety = p;
                const marked = [];
                for (const p of able) {
                    const dc = hyp(c.x - p.x, c.y - p.y);
                    if (p === presser) {
                        const mean = (p.move === 'bulldozer' || p.chk > 0.66) && p.hitCool <= 0 && dc < 18 && c.immune <= 0 && !c.g;
                        if (mean) { p.hit = c.i; steer(p, c.x + c.vx * 0.15, c.y + c.vy * 0.15, 1.12, 0); } else steer(p, c.x + c.vx * 0.22 - a * 1.5, c.y + c.vy * 0.22, 1, 0);
                    } else if (p === safety) {
                        const dgc = hyp(c.x - ox, c.y) || 1;
                        if (dgc < 36 && !c.g) steer(p, c.x + c.vx * 0.15, c.y + c.vy * 0.15, 1, 0);
                        else { const out = clamp(dgc * 0.42, 13, 44); steer(p, ox + (c.x - ox) / dgc * out, c.y / dgc * out, 0.9, 10); }
                    } else {
                        // The most dangerous of theirs nobody has yet: stand in his passing lane, goal side.
                        let man = null, danger = 1e9;
                        for (const f of them) { if (f === c || marked.includes(f)) continue; const d = hyp(f.x - ox, f.y); if (d < danger) { danger = d; man = f; } }
                        if (!man || deep) { steer(p, ox + a * 62, p.slot === 1 ? 16 : -16, 0.8, 10); continue; }
                        marked.push(man);
                        const lx = c.x - man.x, ly = c.y - man.y, ld = hyp(lx, ly) || 1, gd = hyp(ox - man.x, man.y) || 1;
                        steer(p, man.x + lx / ld * 5 + (ox - man.x) / gd * 3.5, man.y + ly / ld * 5 - man.y / gd * 3.5, 0.95, 6);
                    }
                    // A stick at the puck.
                    if (p.pokeCool <= 0 && !c.g && hyp(pk.x - p.x, pk.y - p.y) < 7.4) {
                        p.pokeCool = 24;
                        const chance = 0.06 + 0.2 * p.chk + (p.move === 'wall' ? 0.13 + 0.05 * p.lvl : 0) - 0.15 * c.pas - (c.move === 'dangle' ? 0.08 : 0);
                        if (c.immune <= 0 && rnd(g) < chance) {
                            loosen(g, c, p);
                            p.st.tk++;
                            if (p.move === 'wall') p.st.mv++;
                            event(g, 'steal', { by: p.i, from: c.i, move: p.move === 'wall' });
                        }
                    }
                }
            } else {
                // Nobody's puck. The one who can be there first goes; the next backs him up; the last minds the shop.
                const order = able.map(p => ({ p, m: pk.to === p.i ? { t: -1, x: pk.x + pk.vx * 0.12, y: pk.y + pk.vy * 0.12 } : meet(p, pk) })).sort((m, n) => m.m.t - n.m.t || m.p.i - n.p.i);
                order.forEach(({ p, m }, rank) => {
                    if (rank === 0) {
                        if (p.move === 'jet' && p.moveCool <= 0 && m.t > 0.7 && m.t < 2) { Object.assign(p, { burst: 50 + 10 * p.lvl, moveCool: 660 - 40 * p.lvl, act: 'jet', actT: 50 }); p.st.mv++; }
                        return steer(p, m.x, m.y, 1, 0);
                    }
                    const last = rank === order.length - 1 && order.length > 2 || (p.pos === 'D' && rank > 0 && !order.slice(rank + 1).some(o => o.p.pos === 'D'));
                    if (last && order.length > 2) return steer(p, ox + (pk.x - ox) * 0.45, pk.y * 0.4, 0.85, 10);
                    steer(p, clamp(pk.x + a * 22, -GOAL_X + 10, GOAL_X - 10), clamp(pk.y + (p.y > pk.y ? 16 : -16), -HW + 8, HW - 8), 0.9, 8);
                });
            }
            // Anyone heading off for a change.
            for (const p of us) if (p.leaving && p.down <= 0) steer(p, doorX(team), DOOR_Y, 1, 0);
        }
    }

    // The bench: a goalie pulled for a sixth... a fourth skater, and lines changed on the fly.
    function bench(g) {
        const pk = g.puck;
        for (let team = 0; team < 2; team++) {
            const T = g.T[team], a = att(team), base = team * 7, k = g.P[T.goalie], mine = pk.owner >= 0 && g.P[pk.owner].team === team;
            T.shift++;
            if (!T.pulled && k.on && pulls(g, team) && mine && a * pk.x > 5 && pk.owner !== k.i) {
                T.pulled = true;
                k.leaving = true;
                k.act = '';
                event(g, 'pull', { team });
            }
            if (k.leaving && k.on) {
                steer(k, doorX(team), DOOR_Y, 1.5, 0);
                if (hyp(k.x - doorX(team), k.y - DOOR_Y) < 6) {
                    k.on = false; k.leaving = false;
                    const x = g.P[(T.ice[0] - base + 3) % 6 + base];
                    T.extra = x.i;
                    Object.assign(x, { on: true, x: doorX(team), y: DOOR_Y, vx: a * 20, vy: 20, down: 0 });
                }
            }
            if (g.period > 3 || T.pulled) continue;
            if (T.out < 0 && !T.queue.length && T.shift > SHIFT && (mine || a * pk.x > 25)) {
                T.queue = [0, 1, 2].sort((m, n) => hyp(g.P[T.ice[n]].x - pk.x, g.P[T.ice[n]].y - pk.y) - hyp(g.P[T.ice[m]].x - pk.x, g.P[T.ice[m]].y - pk.y));
            }
            if (T.out < 0 && T.queue.length) {
                const p = g.P[T.ice[T.queue[0]]];
                if (p.down <= 0 && pk.owner !== p.i && p.act !== 'windup') { T.queue.shift(); p.leaving = true; T.out = p.i; }
            }
            if (T.out >= 0) {
                const p = g.P[T.out];
                if (p.down <= 0 && hyp(p.x - doorX(team), p.y - DOOR_Y) < 6.5) {
                    const q = g.P[(p.i - base + 3) % 6 + base];
                    p.on = false; p.leaving = false;
                    T.ice[p.slot] = q.i;
                    Object.assign(q, { on: true, x: doorX(team), y: DOOR_Y, vx: 0, vy: 25, down: 0, act: '', spotT: 0, think: 0 });
                    T.out = -1;
                    if (!T.queue.length) { T.shift = 0; event(g, 'change', { team }); }
                }
            }
        }
    }

    // Things thrown on the ice (a tap): a skater who meets one at speed sits down.
    function litter(g) {
        for (let n = g.items.length - 1; n >= 0; n--) {
            const item = g.items[n];
            if (g.tick - item.t > 1500) { g.items.splice(n, 1); continue; }
            for (const p of g.P) {
                if (!p.on || p.g || p.down > 0 || hyp(p.vx, p.vy) < 20 || hyp(p.x - item.x, p.y - item.y) > 3.6) continue;
                knock(g, p, null, 55);
                event(g, 'slip', { by: p.i, kind: item.kind });
                g.items.splice(n, 1);
                break;
            }
        }
    }
    function throwItem(g, x, y, kind) {
        if (!inside(x, y, 3) || g.items.length >= 8) return false;
        g.items.push({ x, y, kind, t: g.tick });
        return true;
    }

    // ---- The clock, and everything that is not play ----------------------------------

    function endPeriod(g) {
        event(g, 'period', { period: g.period, score: [...g.score] });
        if (g.puck.owner >= 0) g.puck.owner = -1;
        g.puck.shot = null;
        if (g.period >= 3 && g.score[0] !== g.score[1]) return finish(g, g.score[0] > g.score[1] ? 0 : 1, 'REG');
        if (g.period === 5) return finish(g, g.shots[0] >= g.shots[1] ? 0 : 1, 'DEC');       // nobody could find an empty net: on shots, then
        g.phase = 'break';
        g.phaseT = 0;
    }

    function breakLength(g) { return g.fast ? 0 : g.period >= 3 ? SHORT_BREAK : BREAK; }

    function nextPeriod(g) {
        g.period++;
        g.fmt = g.period > 3 ? 2 : 3;
        g.clock = g.period === 4 ? Math.round(g.len * 0.5) : g.period === 5 ? SHOWDOWN : g.len;
        for (const T of g.T) T.shift = SHIFT;             // fresh legs to start a period
        if (g.period === 4) event(g, 'overtime', {});
        if (g.period === 5) event(g, 'showdown', {});
        lineup(g, true, g.fast);
    }

    function step(g) {
        g.tick++;
        g.phaseT++;
        const P = g.P, pk = g.puck;
        if (g.phase === 'play') {
            bench(g);
            plan(g);
            movePlayers(g, true);
            contain(g);
            movePuck(g);
            if (g.phase !== 'play') return;
            boards(pk, PUCK_R, 0.72);
            if (g.items.length) litter(g);
            if (--g.clock <= 0) endPeriod(g);
        } else if (g.phase === 'faceoff') {
            let ready = g.phaseT > 45;
            for (const p of P) {
                if (!p.on) continue;
                const [x, y] = spot(g, p), d = hyp(x - p.x, y - p.y);
                steer(p, x, y, 0.9, 16);
                if (d > 4.5) ready = false;
            }
            movePlayers(g, false);
            contain(g);
            if ((ready || g.phaseT > 270 || g.fast) && !g.wait) {
                // The drop: the centres' wits against each other, and it squirts back to the winner's side.
                const c0 = P[g.T[0].ice[0]], c1 = P[g.T[1].ice[0]], won = rnd(g) < 0.5 + (c0.iq + c0.chk - c1.iq - c1.chk) * 0.2 ? 0 : 1, angle = (won ? 0 : Math.PI) + (rnd(g) - 0.5) * 1.4;
                Object.assign(pk, { x: 0, y: 0, vx: Math.cos(angle) * 58, vy: Math.sin(angle) * 58, owner: -1, from: -1, to: -1, shot: null, hist: [] });
                g.phase = 'play';
                g.phaseT = 0;
                event(g, 'drop', { won });
            }
        } else if (g.phase === 'goal') {
            // The scorer takes a turn round the end, his line after him; the others go and think about it.
            const s = P[g.celly], late = g.phaseT > CELEBRATE * 0.6;
            for (const p of P) {
                if (!p.on || p.down > 0) continue;
                const [x, y] = spot(g, p);
                if (late || p.team !== s.team) steer(p, x, y, late ? 0.8 : 0.4, 14);
                else if (p === s) { if (!p.g) { const a = att(p.team), q = g.phaseT / (CELEBRATE * 0.6) * 4.2; steer(p, a * 56 + Math.cos(q) * 16 * a, (s.i % 2 ? -1 : 1) * 24 + Math.sin(q) * 12, 0.85, 0); } p.act = 'cheer'; p.actT = 4; } else if (!p.g || s.g) { steer(p, s.x, s.y, 1, 9); p.act = 'cheer'; p.actT = 4; }
                if (p.g && !(s.g && p.team === s.team && !late && p !== s)) { p.vx *= 0.85; p.vy *= 0.85; if (p !== s || late) steer(p, x, y, 0.6, 8); }
            }
            movePlayers(g, false);
            contain(g);
            pk.vx *= 0.9; pk.vy *= 0.9;
            if (g.phaseT >= (g.fast ? 0 : CELEBRATE)) lineup(g, true, g.fast);
        } else if (g.phase === 'break') {
            // Off they go, and the ice is left to the machine.
            for (const p of P) {
                if (!p.on) continue;
                const x = doorX(p.team);
                steer(p, x, DOOR_Y, p.g ? 1.6 : 1, 0);
                if (hyp(p.x - x, p.y - DOOR_Y) < 6.5) p.on = false;
            }
            movePlayers(g, false);
            contain(g);
            pk.x += pk.vx * STEP; pk.y += pk.vy * STEP; pk.vx *= 0.97; pk.vy *= 0.97;
            boards(pk, PUCK_R, 0.5);
            if (g.phaseT >= breakLength(g)) nextPeriod(g);
        } else if (g.phase === 'over') {
            // The winners find their goalie (or their scorer); the losers find the door.
            // With a trophy to show off (`party`), the captain takes it to centre ice and the rest skate rings round him.
            const hero = P[hero_(g)];
            let n = 0;
            if (g.party === true) {
                // Everybody over the boards.
                g.party = 1;
                for (const p of P) if (p.team === g.winner && !p.on) Object.assign(p, { on: true, x: doorX(p.team), y: DOOR_Y, vx: 0, vy: 20, down: 0, leaving: false });
            }
            for (const p of P) {
                if (!p.on || p.down > 0) continue;
                if (p.team !== g.winner) { const x = doorX(p.team); steer(p, x, DOOR_Y, 0.5, 0); if (hyp(p.x - x, p.y - DOOR_Y) < 6.5) p.on = false; continue; }
                if (g.party) {
                    if (p === hero) steer(p, 0, 0, 0.7, 14);
                    else { const turn = g.tick * 0.022 + n++ * 2.1; steer(p, Math.cos(turn) * 24, Math.sin(turn) * 17, 0.75, 0); }
                } else if (p === hero) { p.vx *= 0.9; p.vy *= 0.9; } else steer(p, hero.x, hero.y, 1, 10);
                p.act = 'cheer'; p.actT = 4;
            }
            movePlayers(g, false);
            contain(g);
            pk.vx *= 0.9; pk.vy *= 0.9;
        }
    }

    // Whom the winners gather round: whoever scored last for them, or their goalie.
    function hero_(g) {
        const T = g.T[g.winner];
        return g.celly >= 0 && g.P[g.celly].team === g.winner && g.P[g.celly].on ? g.celly : g.P[T.goalie].on ? T.goalie : T.ice[0];
    }

    function simulate(g, limit = 400000) {
        while (!g.done && limit-- > 0) step(g);
        return g;
    }

    // Where the ice resurfacer is, a fraction `q` of the way through its rounds: three laps, each
    // inside the last, and a pass up the middle. It comes in and goes out by the corner gate.
    const LAPS = (() => {
        const pts = [[-70, HW - 2]];
        for (const [hx, hy, r] of [[91, 41, 13], [75, 25, 10], [59, 9, 7]]) {
            // Along the near side, then round the four corners in turn (y is down on a screen).
            pts.push([-hx + r, hy]);
            for (const [cx, cy, from] of [[hx - r, hy - r, Math.PI / 2], [hx - r, -hy + r, 0], [-hx + r, -hy + r, -Math.PI / 2], [-hx + r, hy - r, Math.PI]]) {
                for (let n = 0; n <= 6; n++) { const t = from - n / 6 * Math.PI / 2; pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]); }
            }
        }
        pts.push([-52, 0], [60, 0], [78, 20], [84, 38], [70, HW - 2]);
        const lengths = [0];
        for (let n = 1; n < pts.length; n++) lengths.push(lengths[n - 1] + hyp(pts[n][0] - pts[n - 1][0], pts[n][1] - pts[n - 1][1]));
        return { pts, lengths, total: lengths[lengths.length - 1] };
    })();
    function resurfacer(q) {
        const at = clamp(q) * LAPS.total, { pts, lengths } = LAPS;
        let n = 1;
        while (n < pts.length - 1 && lengths[n] < at) n++;
        const f = (at - lengths[n - 1]) / (lengths[n] - lengths[n - 1] || 1), [x0, y0] = pts[n - 1], [x1, y1] = pts[n];
        return { x: x0 + (x1 - x0) * f, y: y0 + (y1 - y0) * f, dir: Math.atan2(y1 - y0, x1 - x0) };
    }

    // ---- The season --------------------------------------------------------------

    // Write a finished game into the league. Returns what is worth saying about it.
    function record(world, g) {
        const fx = world.fixtures[g.k], notes = [];
        if (!g.done || fx.done || fx.key !== g.key) return notes;
        fx.done = true;
        fx.score = [...g.score];
        fx.how = g.how;
        const win = g.winner;
        g.T.forEach((T, side) => {
            const team = world.teams[T.ti];
            team.gf += g.score[side]; team.ga += g.score[1 - side];
            if (world.stage === 'regular') {
                if (side === win) { team.w++; team.streak = team.streak > 0 ? team.streak + 1 : 1; } else { if (g.how === 'REG') team.l++; else team.otl++; team.streak = team.streak < 0 ? team.streak - 1 : -1; }
                if (side === win && team.streak >= 4) notes.push({ type: 'streak', team: T.ti, n: team.streak });
            }
            team.players.forEach((pl, n) => {
                const st = g.P[side * 7 + n].st;
                for (const s of [pl.s, pl.c]) { s.gp++; s.g += st.g; s.a += st.a; s.hit += st.hit; s.sv += st.sv; s.sa += st.sa; if (pl.pos === 'G' && side === win) s.w++; }
                pl.streak = st.g ? pl.streak + 1 : 0;
                if (st.g && pl.streak >= 3 && pl.pos !== 'G') notes.push({ type: 'hot', team: T.ti, name: pl.name, n: pl.streak });
                if (st.g >= 3) { pl.hats++; notes.push({ type: 'hat', team: T.ti, name: pl.name, n: st.g }); }
                if (pl.pos === 'G' && st.g) {
                    world.goalieGoals.push({ season: world.season, name: pl.name, team: T.ti });
                    if (world.goalieGoals.length > 8) world.goalieGoals.shift();
                    notes.push({ type: 'keeper', team: T.ti, name: pl.name });
                }
                if (pl.pos === 'G' && side === win && g.score[1 - side] === 0) notes.push({ type: 'shutout', team: T.ti, name: pl.name });
                // Moves are grown, and then polished.
                pl.xp += st.g * 3 + st.a * 2 + st.hit + st.tk + st.sv * 0.25;
                if (!pl.move && pl.xp >= 12) { pl.move = newMove(world, pl); notes.push({ type: 'move', team: T.ti, name: pl.name, move: pl.move.name, label: MOVES[pl.move.type].label }); } else if (pl.move) {
                    pl.move.uses += st.mv;
                    const lvl = pl.move.uses >= 120 ? 3 : pl.move.uses >= 30 ? 2 : 1;
                    if (lvl > pl.move.lvl) { pl.move.lvl = lvl; notes.push({ type: 'polish', team: T.ti, name: pl.name, move: pl.move.name, lvl }); }
                }
            });
        });
        if (world.stage !== 'regular') {
            const s = world.series.find(x => (x.a === g.home && x.b === g.away) || (x.a === g.away && x.b === g.home));
            s.wins[g.T[win].ti === s.a ? 0 : 1]++;
            s.played++;
            if (Math.max(...s.wins) === 2) notes.push({ type: 'series', team: g.T[win].ti, over: g.T[1 - win].ti, wins: [...s.wins].sort((a, b) => b - a) });
        }
        world.out = world.fixtures.filter(f => f.done).map(f => ({ home: f.home, away: f.away, score: f.score, how: f.how }));
        if (world.fixtures.every(f => f.done)) advance(world);
        return notes;
    }

    function advance(world) {
        if (world.stage === 'regular') {
            if (++world.round < world.schedule.length) return setRound(world);
            const seeds = standings(world).slice(0, 4).map(t => t.i);
            world.stage = 'semi';
            world.round = 0;
            world.series = [{ a: seeds[0], b: seeds[3], wins: [0, 0], played: 0 }, { a: seeds[1], b: seeds[2], wins: [0, 0], played: 0 }];
            return setRound(world);
        }
        world.round++;
        if (world.series.some(s => Math.max(...s.wins) < 2)) return setRound(world);
        const winners = world.series.map(s => (s.wins[0] === 2 ? s.a : s.b));
        if (world.stage === 'semi') {
            const place = standings(world).map(t => t.i);
            winners.sort((a, b) => place.indexOf(a) - place.indexOf(b));
            world.stage = 'final';
            world.round = 0;
            world.series = [{ a: winners[0], b: winners[1], wins: [0, 0], played: 0 }];
            return setRound(world);
        }
        world.stage = 'champion';
        world.champion = winners[0];
        world.fixtures = [];
    }

    // The summer: prizes, farewells, new faces, and a clean sheet. Returns the news.
    function nextSeason(world) {
        const news = [], table = standings(world), champ = world.teams[world.champion];
        champ.titles++;
        world.champions.push({ season: world.season, team: champ.i });
        if (world.champions.length > 12) world.champions.shift();
        news.push({ type: 'champion', team: champ.i, titles: champ.titles });
        const mvp = leaders(world, 'pts', 1)[0], wall = leaders(world, 'svp', 1)[0], bruiser = leaders(world, 'hit', 1)[0];
        if (mvp) news.push({ type: 'mvp', team: mvp.team, name: mvp.player.name, g: mvp.player.s.g, a: mvp.player.s.a });
        if (wall && wall.value > 0) news.push({ type: 'wall', team: wall.team, name: wall.player.name, pct: wall.value });
        if (bruiser && bruiser.value > 0) news.push({ type: 'bruiser', team: bruiser.team, name: bruiser.player.name, n: bruiser.value });
        for (const team of world.teams) {
            const place = table.indexOf(team);
            let gone = 0;
            team.players.forEach((pl, n) => {
                pl.age++;
                pl.rookie = false;
                const drift = pl.age <= pl.peak ? 0.012 + rnd(world) * 0.035 : -(0.01 + rnd(world) * 0.045);
                for (const k of ['spd', 'sht', 'pas', 'chk', 'iq']) pl[k] = clamp(pl[k] + drift * (0.5 + rnd(world)), 0.05, 1);
                if (gone < 2 && (pl.age > pl.peak + 4 + rnd(world) * 5 || pl.age >= 39)) {
                    gone++;
                    news.push({ type: 'retired', team: team.i, name: pl.name, g: pl.c.g, gp: pl.c.gp, pos: pl.pos, w: pl.c.w });
                    world.legends.push({ name: pl.name, team: team.i, season: world.season, g: pl.c.g, a: pl.c.a });
                    if (world.legends.length > 10) world.legends.shift();
                    // The clubs that finished low get the pick of the youngsters.
                    const rookie = newPlayer(world, pl.pos, -0.1 + place * 0.022 + (rnd(world) < 0.2 ? 0.14 : 0), true);
                    team.players[n] = rookie;
                    number(world, team, rookie);
                    news.push({ type: 'rookie', team: team.i, name: rookie.name, pos: rookie.pos });
                } else pl.s = blank();
            });
            for (let s = 0; s < 3; s++) if (overall(team.players[s + 3]) > overall(team.players[s]) + 0.03) [team.players[s], team.players[s + 3]] = [team.players[s + 3], team.players[s]];
            Object.assign(team, { w: 0, l: 0, otl: 0, gf: 0, ga: 0, streak: 0 });
        }
        // Now and then two clubs swap a player.
        if (rnd(world) < 0.6) {
            const a = Math.floor(rnd(world) * 8), b = (a + 1 + Math.floor(rnd(world) * 7)) % 8, n = Math.floor(rnd(world) * 6), A = world.teams[a], B = world.teams[b];
            [A.players[n], B.players[n]] = [B.players[n], A.players[n]];
            number(world, A, A.players[n]); number(world, B, B.players[n]);
            news.push({ type: 'trade', team: a, name: A.players[n].name, other: b, for: B.players[n].name });
        }
        world.season++;
        world.stage = 'regular';
        world.round = 0;
        world.series = [];
        world.champion = -1;
        world.out = [];
        world.schedule = schedule(world);
        setRound(world);
        world.news = news;
        return news;
    }

    // Play one of the round's games unwatched, start to finish.
    function playOut(world, k, period) { const g = simulate(newGame(world, k, { fast: true, period })); return { game: g, notes: record(world, g) }; }

    // ...and whatever is left of the round. Returns the games.
    function playRound(world, period) {
        const round = world.fixtures, games = [];
        round.forEach((f, k) => { if (!f.done && world.fixtures === round) games.push(playOut(world, k, period).game); });
        return games;
    }

    return {
        playRound, hero: hero_,
        STEP, HL, HW, CORNER, GOAL_X, NET_HALF, NET_DEPTH, CREASE, PUCK_R, SKATER_R, GOALIE_R, DOOR_X, DOOR_Y, PERIOD, CELEBRATE, BREAK, SHORT_BREAK, TEAMS, MOVES, TROPHY,
        rnd, hash, newWorld, newGame, step, simulate, record, nextSeason, playOut, standings, featured, leaders, points, overall, rating, last,
        skaters, goalieOn, spot, att, doorX, stickX, stickY, inside, boards, throwItem, resurfacer, breakLength, lineup, shoot, gain, pulls,
    };
})();
