// Pocket Hockey (SPEC §10.36): the league and the game, without a browser.
// Eight invented clubs meet home and away; a game always ends, by a
// plausible score, and nothing leaves the rink while it is played; the
// better side usually wins, never always; the same seed plays the same
// game, and a saved game or league carries on exactly; seasons roll over
// with every roster whole; a goalie can honestly score.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DIR = resolve(import.meta.dirname, '../web/wallpapers/pocket-hockey');
const sources = Object.fromEntries(['hockey-logic.js', 'hockey-art.js', 'pocket-hockey.js'].map(name => [name, readFileSync(join(DIR, name), 'utf8')]));
const L = new Function(`${sources['hockey-logic.js']}; return HockeyLogic;`)();
const copy = thing => JSON.parse(JSON.stringify(thing));
const QUICK = 900;       // a fifteen-second period, for tests that are about the league and not the hockey

test('the league: eight clubs of seven, every name once, plain data', () => {
    const world = L.newWorld(7);
    assert.equal(world.teams.length, 8);
    const names = new Set(), surnames = new Set();
    for (const team of world.teams) {
        assert.deepEqual(team.players.map(p => p.pos), ['C', 'W', 'D', 'C', 'W', 'D', 'G']);
        assert.equal(new Set(team.players.map(p => p.num)).size, 7, 'no number twice on a club');
        for (const p of team.players) {
            names.add(p.name); surnames.add(L.last(p));
            assert.match(p.name, /^[A-Z][a-z]+ [A-Z][A-Za-z ]+$/);
            for (const k of ['spd', 'sht', 'pas', 'chk', 'iq']) assert.ok(p[k] > 0 && p[k] <= 1, `${p.name} ${k} ${p[k]}`);
            if (p.move) { assert.ok(L.MOVES[p.move.type].pos.includes(p.pos), `${p.name} (${p.pos}) has a ${p.move.type}`); assert.match(p.move.name, /^the [A-Z][a-z]+ [A-Z]/); assert.ok(p.move.lvl >= 1 && p.move.lvl <= 3); }
        }
    }
    assert.equal(names.size, 56);
    assert.equal(surnames.size, 56, 'a caption can call anyone by his surname');
    const moves = world.teams.flatMap(t => t.players).filter(p => p.move).length;
    assert.ok(moves > 15 && moves < 50, `${moves} of 56 arrive with a signature move`);
    assert.deepEqual(copy(world), world, 'the league is plain data');
    assert.equal(new Set(L.TEAMS.map(t => t.code)).size, 8);
    assert.deepEqual(copy(L.newWorld(7)), copy(world), 'the same seed founds the same league');
    assert.notDeepEqual(L.newWorld(8).teams[0].players.map(p => p.name), world.teams[0].players.map(p => p.name));
});

test('the schedule: fourteen rounds, everyone plays once a round, each pair home and away', () => {
    const world = L.newWorld(3), met = new Set();
    assert.equal(world.schedule.length, 14);
    for (const round of world.schedule) {
        assert.equal(round.length, 4);
        assert.equal(new Set(round.flat()).size, 8);
        for (const [home, away] of round) met.add(`${home}v${away}`);
    }
    assert.equal(met.size, 56);
    assert.equal(world.fixtures.length, 4);
    // The game to watch: the followed club's, or the one between the best-placed pair.
    const mine = L.featured(world, 'COC'), fx = world.fixtures[mine];
    assert.ok(L.TEAMS[fx.home].code === 'COC' || L.TEAMS[fx.away].code === 'COC');
    world.teams[world.fixtures[2].home].w = 5; world.teams[world.fixtures[2].away].w = 4;
    assert.equal(L.featured(world, 'any'), 2);
});

test('a game: it ends, the score is plausible, and nothing leaves the rink', () => {
    const totals = [], how = {};
    let games = 0, home = 0, keeper = 0, saves = 0, hits = 0, moves = 0, longest = 0, level = 0;
    for (let seed = 1; games < 72; seed++) {
        const world = L.newWorld(seed);
        for (let round = 0; round < 3; round++) {
            for (const [k, fx] of [...world.fixtures.entries()]) {
                const g = L.newGame(world, k, { fast: true });
                let seen = 0;
                while (!g.done) {
                    L.step(g);
                    assert.ok(g.tick < 60000, 'a game ends');
                    const pk = g.puck;
                    // Inside the boards' box every step, and inside their rounded corners every third.
                    const corners = g.tick % 3 === 0;
                    if (!(Math.abs(pk.x) <= L.HL - 1 && Math.abs(pk.y) <= L.HW - 1 && Number.isFinite(pk.vx + pk.vy)) || (corners && g.phase === 'play' && !L.inside(pk.x, pk.y, L.PUCK_R - 0.01))) assert.fail(`the puck at ${pk.x}, ${pk.y}`);
                    for (const p of g.P) {
                        if (!p.on) continue;
                        const r = (p.g ? L.GOALIE_R : L.SKATER_R) - 0.01;
                        if (!(Math.abs(p.x) <= L.HL - r && Math.abs(p.y) <= L.HW - r && Number.isFinite(p.vx + p.vy + p.dir)) || (corners && !L.inside(p.x, p.y, r))) assert.fail(`${p.name} at ${p.x}, ${p.y}`);
                    }
                    if (corners) assert.ok(L.skaters(g, 0).length <= 4 && L.skaters(g, 1).length <= 4);
                    for (const e of g.events) if (e.n > seen) { seen = e.n; if (e.type === 'move') moves++; if (e.type === 'hit') hits++; if (e.type === 'save') saves++; }
                }
                assert.ok(g.winner === 0 || g.winner === 1);
                assert.notEqual(g.score[0], g.score[1], 'no ties');
                assert.equal(g.score[g.winner], Math.max(...g.score));
                assert.equal(g.goals.length, g.score[0] + g.score[1]);
                assert.equal(g.P.reduce((n, p) => n + p.st.g, 0), g.goals.length, 'every goal is somebody’s');
                assert.equal(fx.done, false);
                totals.push(g.goals.length);
                how[g.how] = (how[g.how] || 0) + 1;
                if (g.how !== 'REG') level++;
                if (g.winner === 0) home++;
                keeper += g.goals.filter(goal => goal.keeper).length;
                longest = Math.max(longest, g.tick);
                L.record(world, g);
                assert.equal(fx.done, true);
                games++;
            }
        }
    }
    const mean = totals.reduce((a, b) => a + b) / games, max = Math.max(...totals), spread = new Set(totals).size;
    console.log(`    ${games} games: ${mean.toFixed(2)} goals a game (most ${max}), ${JSON.stringify(how)}, home won ${home}, ${(saves / games).toFixed(1)} saves, ${(hits / games).toFixed(1)} hits and ${(moves / games).toFixed(1)} signature moves a game`);
    assert.ok(mean > 3.6 && mean < 7, `${mean} goals a game`);
    assert.ok(max <= 18 && spread >= 7, `scores from ${Math.min(...totals)} to ${max}`);
    assert.ok(how.REG > games * 0.65, 'most games end in sixty... in three periods');
    assert.ok(level > 2, 'some go to overtime');
    assert.ok((how.DEC || 0) <= 1, 'the empty nets settle it');
    assert.ok(home > games * 0.36 && home < games * 0.64, `home won ${home} of ${games}: no side of the rink is favoured`);
    assert.ok(hits / games > 3 && hits / games < 30 && saves / games > 8 && moves / games > 4);
    assert.ok(keeper <= 6, 'goalies scoring is rare');
    assert.ok(longest < 13500 + 2250 + 5400 + 10);
});

test('a game: the better side usually wins, never always', () => {
    // Two clubs, one made strong and one weak, meeting twenty-four times each way round.
    let strong = 0, games = 0;
    for (let seed = 1; seed <= 12; seed++) {
        const world = L.newWorld(seed), fx = world.fixtures[0];
        world.teams[fx.home].players.forEach(p => { for (const k of ['spd', 'sht', 'pas', 'chk', 'iq']) p[k] = Math.min(1, p[k] * 0.6 + 0.4); });
        world.teams[fx.away].players.forEach(p => { for (const k of ['spd', 'sht', 'pas', 'chk', 'iq']) p[k] *= 0.8; });
        assert.ok(L.rating(world.teams[fx.home]) > L.rating(world.teams[fx.away]) + 0.1);
        for (const flip of [false, true]) {
            if (flip) [fx.home, fx.away] = [fx.away, fx.home];
            fx.key = `t${seed}${flip}`;
            const g = L.simulate(L.newGame(world, 0, { fast: true, period: 2700 }));
            if ((g.winner === 0) !== flip) strong++;
            games++;
        }
    }
    assert.ok(strong > games * 0.6 && strong < games, `the strong side won ${strong} of ${games}`);
});

test('a game: the same seed plays the same game; a saved one carries on to the same end', () => {
    const play = (seed, stopAt) => {
        const world = L.newWorld(seed);
        let g = L.newGame(world, 1, {});
        while (!g.done) { L.step(g); if (g.tick === stopAt) g = copy(g); }
        return g;
    };
    const one = play(11), two = play(11), saved = play(11, 2222), other = play(12);
    assert.deepEqual(two, one);
    assert.deepEqual(saved, one, 'a game put through storage mid-shift ends exactly as it would have');
    assert.notDeepEqual(other.goals, one.goals);
    assert.deepEqual(copy(one), one, 'a game is plain data');
    // And a watched game is the full show: celebrations, two intermissions, everyone off the ice for the machine.
    assert.ok(one.tick > 3 * L.PERIOD + 2 * L.BREAK, `${one.tick} steps`);
    const g = L.newGame(L.newWorld(11), 1, {});
    let phases = new Set(), empty = false;
    while (!g.done) { L.step(g); phases.add(g.phase); if (g.phase === 'break' && g.phaseT > 400 && !g.P.some(p => p.on)) empty = true; }
    assert.ok(phases.has('faceoff') && phases.has('play') && phases.has('break') && phases.has('goal'));
    assert.ok(empty, 'the ice is clear for the resurfacer');
    for (let n = 0; n < 600; n++) L.step(g);          // the winners' huddle goes on after the horn, harmlessly
    assert.ok(g.P.filter(p => p.on).every(p => p.team === g.winner), 'the losers have gone down the tunnel');
});

test('the league: a saved one carries on exactly; a season ends in playoffs and a champion', () => {
    const world = L.newWorld(21);
    for (let n = 0; n < 5; n++) L.playRound(world, QUICK);
    L.playOut(world, 0, QUICK);
    assert.equal(world.round, 5);
    assert.equal(world.fixtures.filter(f => f.done).length, 1);
    assert.equal(world.out.length, 1);
    const saved = copy(world);
    const finish = w => { let rounds = 0; while (w.stage !== 'champion') { L.playRound(w, QUICK); assert.ok(++rounds < 30); } return w; };
    finish(world); finish(saved);
    assert.deepEqual(saved, world);
    assert.ok(world.champion >= 0);
    for (const team of world.teams) {
        assert.equal(team.w + team.l + team.otl, 14);
        for (const p of team.players) assert.ok(p.s.gp >= 14 && p.s.gp <= 14 + 6);
    }
    const table = L.standings(world);
    for (let n = 1; n < 8; n++) assert.ok(L.points(table[n - 1]) >= L.points(table[n]));
    assert.equal(world.teams.reduce((n, t) => n + t.w, 0), 56, 'fifty-six games, fifty-six winners');
    assert.equal(world.teams.reduce((n, t) => n + t.gf - t.ga, 0), 0);
    assert.ok(L.leaders(world, 'pts', 5).every((e, n, all) => !n || all[n - 1].value >= e.value));
    assert.ok(L.leaders(world, 'svp', 1)[0].player.pos === 'G' && L.leaders(world, 'hit', 3).every(e => e.player.pos !== 'G'));
});

test('seasons: playoffs for the top four, then retirements, rookies and a clean sheet, again and again', () => {
    const world = L.newWorld(5);
    let retired = 0, grown = 0, polished = 0, trades = 0;
    for (let season = 1; season <= 7; season++) {
        let games = 0, notes = [];
        const top4 = () => L.standings(world).slice(0, 4).map(t => t.i);
        let seeds = null;
        while (world.stage !== 'champion') {
            const stage = world.stage, list = world.fixtures.length;
            if (stage === 'semi' && !seeds) { seeds = top4(); assert.deepEqual(world.series.map(s => [s.a, s.b]), [[seeds[0], seeds[3]], [seeds[1], seeds[2]]]); }
            assert.equal(list, stage === 'regular' ? 4 : world.series.filter(s => Math.max(...s.wins) < 2).length);
            for (const k of world.fixtures.keys()) { if (world.stage !== stage || world.fixtures.length !== list || world.fixtures[k].done) break; notes.push(...L.playOut(world, k, QUICK).notes); games++; }
            assert.ok(games < 80);
        }
        assert.ok(games >= 56 + 6 && games <= 56 + 9, `${games} games in season ${season}`);
        assert.ok(seeds.includes(world.champion), 'the champion came from the top four');
        grown += notes.filter(n => n.type === 'move').length;
        polished += notes.filter(n => n.type === 'polish').length;
        const before = world.teams.map(t => t.players.map(p => p.id));
        const news = L.nextSeason(world);
        assert.equal(news[0].type, 'champion');
        assert.equal(world.season, season + 1);
        assert.equal(world.stage, 'regular');
        assert.equal(world.round, 0);
        assert.equal(world.fixtures.length, 4);
        assert.equal(world.champions.at(-1).season, season);
        const gone = news.filter(n => n.type === 'retired').length;
        assert.equal(news.filter(n => n.type === 'rookie').length, gone, 'a rookie for every retirement');
        retired += gone;
        trades += news.filter(n => n.type === 'trade').length;
        const everyone = world.teams.flatMap(t => t.players);
        assert.equal(new Set(everyone.map(p => p.id)).size, 56);
        assert.equal(new Set(everyone.map(p => L.last(p))).size, 56, 'no surname twice');
        world.teams.forEach((team, n) => {
            assert.deepEqual(team.players.map(p => p.pos), ['C', 'W', 'D', 'C', 'W', 'D', 'G']);
            assert.equal(new Set(team.players.map(p => p.num)).size, 7);
            assert.deepEqual([team.w, team.l, team.otl, team.gf, team.ga], [0, 0, 0, 0, 0]);
            assert.ok(team.players.filter(p => !before[n].includes(p.id)).length <= 3);
            for (const p of team.players) { assert.deepEqual(p.s, { gp: 0, g: 0, a: 0, hit: 0, sv: 0, sa: 0, w: 0 }); assert.ok(p.age < 45 && p.spd > 0 && p.spd <= 1); }
        });
        assert.deepEqual(copy(world), world);
    }
    assert.equal(world.champions.length, 7);
    assert.equal(world.teams.reduce((n, t) => n + t.titles, 0), 7);
    assert.ok(retired >= 10, `${retired} retirements in seven seasons`);
    assert.ok(grown >= 5, `${grown} players grew a signature move`);
    assert.ok(polished >= 1 && trades >= 1);
    assert.ok(world.legends.length <= 10 && world.legends.length > 0);
});

test('signature moves: a rookie grows one from what he does, and it is his kind of move', () => {
    const world = L.newWorld(9), team = world.teams[world.fixtures[0].home];
    for (const p of team.players) { p.move = null; p.xp = 0; }
    const g = L.simulate(L.newGame(world, 0, { fast: true }));
    for (const p of g.P.filter(q => q.team === 0)) { p.st.g = 2; p.st.a = 3; p.st.sv = 60; }     // a night to remember
    const notes = L.record(world, g).filter(n => n.type === 'move');
    assert.equal(notes.length, 7);
    for (const p of team.players) {
        assert.ok(p.move && L.MOVES[p.move.type].pos.includes(p.pos), `${p.name} (${p.pos}): ${p.move?.type}`);
        assert.equal(p.move.lvl, 1);
        assert.ok(notes.some(n => n.name === p.name && n.move === p.move.name && n.label === L.MOVES[p.move.type].label));
    }
    // Used often enough, it is polished.
    team.players[0].move.uses = 29;
    const next = world.fixtures.findIndex(f => !f.done), g2 = L.simulate(L.newGame(world, next, { fast: true }));
    const side = g2.home === team.i ? 0 : g2.away === team.i ? 1 : -1;
    if (side >= 0) { g2.P[side * 7].st.mv = 3; assert.ok(L.record(world, g2).some(n => n.type === 'polish' && n.lvl === 2)); }
});

test('the improbable goal: a goalie with the puck and an empty net at the other end', () => {
    let scored = 0, tries = 0;
    for (let seed = 1; seed <= 6; seed++) {
        const world = L.newWorld(seed), g = L.newGame(world, 0, { fast: true });
        for (let n = 0; n < 400; n++) L.step(g);
        // The visitors have pulled their goalie and lost the puck to the home goalie; everyone else has gone for tea.
        g.phase = 'play'; g.period = 3; g.clock = 300; g.score = [2, 1];
        for (const p of g.P) if (!(p.g && p.team === 0)) p.on = false;
        g.T[1].pulled = true;
        const keeper = g.P[g.T[0].goalie], was = g.goals.length;
        Object.assign(g.puck, { x: keeper.x + 2, y: keeper.y, vx: 0, vy: 0 });
        L.gain(g, keeper);
        for (let n = 0; n < 360 && g.goals.length === was && !g.done; n++) L.step(g);
        tries++;
        if (g.goals.length === was) continue;
        const goal = g.goals.at(-1);
        assert.ok(goal.keeper && goal.empty && goal.team === 0 && g.P[goal.by] === keeper && goal.far > 120, JSON.stringify(goal));
        assert.equal(keeper.st.g, 1);
        scored++;
        while (!g.done) L.step(g);
        const notes = L.record(world, g);
        assert.ok(notes.some(n => n.type === 'keeper' && n.name === world.teams[g.home].players[6].name));
        assert.equal(world.goalieGoals.at(-1).name, world.teams[g.home].players[6].name);
        assert.equal(world.teams[g.home].players[6].s.g, 1);
    }
    assert.ok(scored >= 3 && scored <= tries, `${scored} of ${tries} heaves went in with nobody in the way`);
});

test('things on the ice: a thrown thing lands only on the ice, and trips whoever skates over it', () => {
    const g = L.newGame(L.newWorld(4), 0, { fast: true });
    for (let n = 0; n < 200; n++) L.step(g);
    assert.equal(L.throwItem(g, 150, 0, 'duck'), false);
    assert.equal(L.throwItem(g, 99, 49, 'duck'), false, 'not in the corner, outside the boards');
    const p = L.skaters(g, 0)[0];
    Object.assign(p, { x: -20, y: 20, vx: 40, vy: 0, down: 0 });
    assert.equal(L.throwItem(g, p.x + 1.5, p.y, 'duck'), true);
    L.step(g);
    assert.ok(p.down > 0, 'he sat down');
    assert.ok(g.events.some(e => e.type === 'slip' && e.by === p.i && e.kind === 'duck'));
    assert.equal(g.items.length, 0);
    for (let n = 0; n < 12; n++) L.throwItem(g, n * 5 - 30, -20, 'hat');
    assert.equal(g.items.length, 8, 'only so much litter at once');
});

test('the ice resurfacer: stays on the ice, covers it, and never jumps', () => {
    const W = 20, H = 10, clean = new Uint8Array(W * H);
    let last = null;
    for (let n = 0; n <= 2000; n++) {
        const at = L.resurfacer(n / 2000);
        assert.ok(L.inside(at.x, at.y, 1.5), `off the ice at ${at.x}, ${at.y}`);
        if (last) assert.ok(Math.hypot(at.x - last.x, at.y - last.y) < 1.5);
        last = at;
        for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (Math.abs((i + 0.5) * 10 - 100 - at.x) < 9 && Math.abs((j + 0.5) * 10 - 50 - at.y) < 9) clean[j * W + i] = 1;
    }
    const covered = clean.reduce((a, b) => a + b) / (W * H);
    assert.ok(covered > 0.9, `${Math.round(covered * 100)}% of the ice`);
});

test('cheap and clean: no pixel reads, blurs, clocks, storage or timers of its own; the rules roll their own dice', () => {
    for (const [name, source] of Object.entries(sources)) {
        assert.ok(!/getImageData|putImageData|shadowBlur|\.filter\s*=/.test(source), `${name}: a per-pixel or blur call`);
        assert.ok(!/new Date\(|Date\.now\(/.test(source), `${name}: reads the clock itself (use host.now())`);
        assert.ok(!/localStorage|sessionStorage/.test(source), `${name}: touches storage itself`);
        assert.ok(!/setInterval|setTimeout/.test(source), `${name}: a timer of its own`);
        assert.ok(!/https?:\/\//.test(source), `${name}: a URL`);
        assert.ok(!/zamboni/i.test(source), `${name}: a trade name`);
    }
    assert.ok(!/Math\.random|performance\.|document\.|window\./.test(sources['hockey-logic.js']), 'the rules take no dice, clock or page from outside');
});
