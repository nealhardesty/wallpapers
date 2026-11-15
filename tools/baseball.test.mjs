// The Never-Ending Baseball Season (SPEC §10.37): the rules, without a
// browser. A league is whole and plain data; every game ends, by the
// rules, with a box score that adds up to the last run; the numbers a
// season produces look like baseball; the better club usually wins; the
// same dice give the same game; a saved league carries on exactly; and
// season after season the rosters stay whole.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DIR = resolve(import.meta.dirname, '../web/wallpapers/baseball');
const FILES = ['baseball-logic.js', 'baseball-league.js', 'baseball-talk.js', 'baseball-art.js', 'baseball.js'];
const sources = Object.fromEntries(FILES.map(name => [name, readFileSync(join(DIR, name), 'utf8')]));
const { L, G, T } = new Function(`${sources['baseball-logic.js']}\n${sources['baseball-league.js']}\n${sources['baseball-talk.js']}; return { L: BaseballLogic, G: BaseballLeague, T: BaseballTalk };`)();
const seeded = seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const sum = (list, f = x => x) => list.reduce((total, x) => total + f(x), 0);
const stat = (o, key) => o?.[key] || 0;

// Play one game between two clubs and check it as it goes. Returns the game and its plays.
function referee(world, away, home, random, innings = 9) {
    const game = L.startGame(world.teams[away], world.teams[home], { innings }), teams = G.sides(world, game), plays = [];
    let outs = 0, halves = 0, play;
    while ((play = G.step(world, game, random))) {
        plays.push(play);
        if (play.kind !== 'pitch') continue;
        const made = stat(play.result, 'outs') + (play.steal?.out && !stat(play.result, 'outs') ? 1 : 0) + (play.steal?.out && play.result?.code === 'K' ? 1 : 0);
        outs += made;
        assert.ok(play.before.outs + made <= 3, `four outs in a half-inning: ${JSON.stringify(play.result)}`);
        if (play.endHalf) { assert.equal(play.before.outs + made, 3, 'a half-inning ends on its third out'); halves++; }
        else if (!play.gameOver) assert.equal(game.outs, play.before.outs + made);
        if (!game.over) {
            // Nobody is on two bases, and everybody on base bats for the side at bat.
            const on = game.bases.filter(Boolean);
            assert.equal(new Set(on).size, on.length);
            for (const id of on) assert.ok(L.find(teams[game.half], id), 'a runner from the other club');
            assert.ok(game.balls < 4 && game.strikes < 3 && game.outs < 3);
        }
        assert.ok(plays.length < 2500, 'the game never ends');
    }
    return { game, teams, plays, outs, halves };
}

// Every number in a finished game, checked against every other.
function audit({ game, teams, plays, outs }) {
    const [a, h] = game.R, win = h > a ? 1 : 0;
    assert.ok(game.over && a !== h, 'a game has a winner');
    assert.ok(game.inning >= game.innings, 'nine innings at least');
    // The last inning: the home side does not bat when ahead, and stops the moment it leads.
    assert.equal(game.line[0].length, game.inning);
    if (win === 1 && game.half === 0) assert.equal(game.line[1].length, game.inning - 1, 'the home half was not needed');
    else assert.equal(game.line[1].length, game.inning);
    if (game.inning > game.innings) assert.equal(sum(game.line[0].slice(0, game.inning - 1)), sum(game.line[1].slice(0, game.inning - 1)), 'extra innings only from a tie');
    const last = plays.at(-1);
    if (last.walkoff) assert.ok(win === 1 && game.half === 1 && h - a <= 4 && h - stat(last.scored, 'length') <= a, 'a walk-off ends it at once');
    let putouts = 0;
    for (const side of [0, 1]) {
        const team = teams[side], other = teams[1 - side], ids = new Set([...game.order[side], ...game.used[side]]);
        const bats = [...ids].map(id => game.box[id] || {}), arms = game.used[1 - side].map(id => game.box[id] || {});
        assert.equal(sum(game.line[side]), game.R[side], 'the line score adds up to the runs');
        assert.equal(sum(bats, b => stat(b, 'r')), game.R[side], 'runs scored by the batters');
        assert.equal(sum(arms, b => stat(b, 'ra')), game.R[side], 'runs charged to the pitchers');
        assert.equal(sum(bats, b => stat(b, 'h')), game.H[side], 'hits by the batters');
        assert.equal(sum(arms, b => stat(b, 'ha')), game.H[side], 'hits charged to the pitchers');
        assert.equal(sum(bats, b => stat(b, 'hr')), sum(arms, b => stat(b, 'hra')));
        assert.equal(sum(bats, b => stat(b, 'k')), sum(arms, b => stat(b, 'ka')));
        assert.equal(sum(bats, b => stat(b, 'bb')), sum(arms, b => stat(b, 'bba')));
        assert.ok(sum(bats, b => stat(b, 'rbi')) <= game.R[side] && sum(arms, b => stat(b, 'er')) <= game.R[side]);
        for (const b of bats) assert.ok(stat(b, 'h') <= stat(b, 'ab') && stat(b, 'd') + stat(b, 't') + stat(b, 'hr') <= stat(b, 'h'));
        // The proof of a box score: everyone who came to bat scored, was left on, or was put out.
        const made = sum(arms, b => stat(b, 'outs')), came = sum(bats, b => stat(b, 'ab') + stat(b, 'bb') + stat(b, 'hbp') + stat(b, 'sf'));
        assert.equal(came, game.R[side] + game.LOB[side] + made, `the box score does not prove: ${came} came up, ${game.R[side]} scored, ${game.LOB[side]} left, ${made} out`);
        putouts += made;
        const fielded = [...new Set([...game.order[1 - side], ...game.used[1 - side]])].map(id => game.box[id] || {});
        assert.equal(sum(fielded, b => stat(b, 'e')), game.E[1 - side], 'errors');
        assert.ok(L.find(side === win ? team : other, game.wp) && L.find(side === win ? other : team, game.lp), 'the decisions go to the right clubs');
    }
    assert.equal(putouts, outs, 'every out is on a pitcher\'s line');
    // Three outs a half, all the way down, except where a walk-off stopped it.
    const whole = (game.inning - 1) * 6 + 3 + (game.line[1].length === game.inning ? (last.walkoff ? game.outs : 3) : 0);
    assert.equal(putouts, whole, 'three outs to a half-inning');
    assert.ok(game.wp !== game.sv && (!game.sv || game.used[win].at(-1) === game.sv));
}

test('a league: eight clubs of thirteen, every name once, every park a real park, all plain data', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
        const world = G.found(seeded(seed), { days: 0 });
        assert.equal(world.teams.length, G.TEAMS);
        for (const key of ['town', 'name', 'abbr']) assert.equal(new Set(world.teams.map(t => t[key])).size, G.TEAMS, key);
        assert.equal(new Set(world.teams.map(t => t.colours[0])).size, G.TEAMS, 'no two clubs in the same colour');
        const everyone = world.teams.flatMap(t => t.players);
        assert.equal(new Set(everyone.map(p => p.id)).size, 104);
        assert.equal(new Set(everyone.map(p => `${p.first} ${p.last}`)).size, 104);
        for (const team of world.teams) {
            assert.deepEqual(team.players.map(p => p.pos).sort(), ['1B', '2B', '3B', 'C', 'CF', 'LF', 'RF', 'RP', 'RP', 'SP', 'SP', 'SP', 'SS']);
            assert.equal(new Set(team.lineup).size, 8);
            assert.ok(team.lineup.every(id => !L.find(team, id).mix), 'pitchers bat ninth, not in the order');
            assert.match(team.abbr, /^[A-Z]{3}$/);
            const p = team.park;
            assert.ok(p.lf >= 290 && p.lf <= 360 && p.cf >= 380 && p.cf <= 440 && p.rf >= 290 && p.rf <= 360 && p.quirk && p.name);
            for (let bearing = -180; bearing <= 180; bearing += 3) assert.ok(L.edgeAt(p, bearing) > 30 && L.edgeAt(p, bearing) <= p.cf + 0.01, `the fence at ${bearing}`);
            assert.ok(L.inPlay(p, 0, 200) && L.inPlay(p, 0, -20) && !L.inPlay(p, 0, p.cf + 5) && !L.inPlay(p, 150, -60));
            for (const q of team.players) {
                for (const key of ['con', 'pow', 'eye', 'spd', 'fld', 'arm', ...(q.mix ? ['stuff', 'ctl', 'sta'] : [])]) assert.ok(q[key] > 0 && q[key] < 1, `${q.last} ${key}`);
                if (q.mix) assert.ok(q.mix.length >= 2 && new Set(q.mix).size === q.mix.length && q.mix.every(k => L.PITCHES[k]));
            }
        }
        assert.deepEqual(JSON.parse(JSON.stringify(world)), world, 'the league is plain data');
    }
    // A league is founded with a few days already played, so the first thing seen is a season under way.
    const world = G.found(seeded(9));
    assert.ok(world.day >= 4 && world.day <= 8 && world.teams.every(t => t.w + t.l === world.day));
});

test('the calendar: twenty-one days, everyone plays every day and meets everyone three times', () => {
    const met = {}, homes = Array(G.TEAMS).fill(0);
    for (let day = 0; day < G.DAYS; day++) {
        const pairs = G.fixtures(day);
        assert.equal(pairs.length, 4);
        assert.equal(new Set(pairs.flat()).size, G.TEAMS);
        for (const [a, h] of pairs) { const key = [a, h].sort().join('-'); met[key] = (met[key] || 0) + 1; homes[h]++; }
    }
    assert.equal(Object.keys(met).length, 28);
    assert.ok(Object.values(met).every(n => n === 3));
    assert.ok(homes.every(n => n === 10 || n === 11), `home games: ${homes}`);
});

test('a game: it ends, by the rules, and the box score proves', () => {
    const random = seeded(11), world = G.found(random, { days: 0 }), seen = {};
    let extra = 0, walkoffs = 0, skipped = 0;
    for (let i = 0; i < 400; i++) {
        const away = i % 8, home = (i * 3 + 1 + (i % 7)) % 8;
        if (away === home) continue;
        const played = referee(world, away, home, random);
        audit(played);
        for (const play of played.plays) if (play.result) seen[play.result.code] = (seen[play.result.code] || 0) + 1;
        if (played.game.inning > 9) extra++;
        if (played.plays.at(-1).walkoff) walkoffs++;
        if (played.game.line[1].length < played.game.inning) skipped++;
    }
    for (const code of ['K', 'BB', 'HBP', '1B', '2B', '3B', 'HR', 'GO', 'FO', 'LO', 'PO', 'DP', 'FC', 'E', 'SF']) assert.ok(seen[code] > 3, `no ${code} in 400 games (${seen[code] || 0})`);
    assert.ok(extra > 10 && extra < 80, `${extra} games went to extra innings`);
    assert.ok(walkoffs > 10, `${walkoffs} walk-offs`);
    assert.ok(skipped > 100, `${skipped} games where the home side did not need its last turn`);
    // Shorter games (a setting) follow the same rules.
    for (const innings of [3, 5, 7]) for (let i = 0; i < 20; i++) { const played = referee(world, i % 8, (i + 3) % 8, random, innings); audit(played); assert.ok(played.game.inning >= innings); }
});

test('a game: every play makes sense on its own', () => {
    const random = seeded(23), world = G.found(random, { days: 0 }), away = world.teams[0], home = world.teams[1];
    for (let i = 0; i < 40; i++) {
        const { plays, teams } = referee(world, 0, 1, random);
        for (const play of plays) {
            if (play.kind === 'change') { assert.ok(L.find(teams[play.side], play.in).pos === 'RP' && play.in !== play.out); continue; }
            const p = play.pitch;
            assert.ok(L.PITCHES[p.type] && p.mph > 35 && p.mph < 104 && Number.isFinite(p.x) && Number.isFinite(p.z));
            assert.ok(L.find(teams[1 - play.half], play.pitcher).mix.includes(p.type), 'a pitch he does not throw');
            assert.ok(['ball', 'called', 'swinging', 'foul', 'inplay', 'hbp'].includes(play.call));
            if (play.call === 'called') assert.ok(Math.max(Math.abs(p.x), Math.abs(p.z)) <= 1 && !play.swing, 'a called strike outside the zone');
            if (play.call === 'ball') assert.ok(Math.max(Math.abs(p.x), Math.abs(p.z)) > 1 && !play.swing, 'a ball in the zone');
            for (const m of play.runs) assert.ok(m.to >= m.from && m.to <= 4 && m.t >= m.t0 && Number.isFinite(m.t), `a runner going backwards: ${JSON.stringify(m)}`);
            for (const peg of play.throws) assert.ok(peg.t > peg.t0 && peg.to.length === 2);
            if (play.call !== 'inplay') continue;
            const f = play.fl, r = play.result;
            assert.ok(r && f.ev >= 42 && f.ev <= 114 && f.la >= -35 && f.la <= 70, `off the bat at ${f.ev} mph, ${f.la} degrees`);
            if (r.code === 'HR' && !r.inside) {
                assert.ok(f.gone && f.fair && f.carry > 280 && !play.field, `a home run of ${f.carry} feet`);
                assert.ok(f.zEdge > L.wallHeight(home.park, f.spray), 'it cleared the fence');
            } else {
                assert.ok(play.field && play.field.who >= 0 && play.field.who < 9 && play.field.t > 0);
                const [x, y] = play.field.at;
                assert.ok(L.inPlay(home.park, x, y), `fielded outside the park at ${x}, ${y}`);
                if (['FO', 'LO', 'PO', 'SF'].includes(r.code)) assert.ok(play.field.air, 'an out in the air was caught in the air');
                if (['GO', 'DP', 'FC'].includes(r.code)) assert.ok(!play.field.air && play.field.who < 6, 'a ground-ball out goes to an infielder');
                if (r.code === 'DP') assert.equal(r.outs, 2);
            }
            // The ball is somewhere sensible all the way.
            for (let t = 0; t < Math.min(8, play.dur || 1); t += 0.5) { const at = L.ballAt(f, t); assert.ok(Number.isFinite(at.x + at.y + at.z) && at.z >= 0 && at.z < 220); }
        }
        void away;
    }
});

test('a season of numbers: runs, averages and home runs look like baseball', () => {
    const random = seeded(5), world = G.found(random, { days: 0 }), codes = {}, runs = [];
    let games = 0, pitches = 0, turns = 0, ab = 0, steals = 0, caught = 0;
    for (let round = 0; round < 3; round++) {
        for (let day = 0; day < G.DAYS; day++) for (const [away, home] of G.fixtures(day)) {
            const { game, plays } = referee(world, away, home, random);
            games++;
            runs.push(...game.R);
            for (const play of plays) {
                if (play.kind !== 'pitch') continue;
                pitches++;
                if (play.steal) { steals++; if (play.steal.out) caught++; }
                if (!play.result) continue;
                turns++;
                codes[play.result.code] = (codes[play.result.code] || 0) + 1;
                if (!['BB', 'HBP', 'SF'].includes(play.result.code)) ab++;
            }
        }
    }
    const sides = games * 2, per = code => (codes[code] || 0) / sides, hits = codes['1B'] + codes['2B'] + codes['3B'] + codes.HR;
    const report = { games, 'runs a side': +(sum(runs) / sides).toFixed(2), average: +(hits / ab).toFixed(3), 'home runs a side': +per('HR').toFixed(2), 'strikeouts a side': +per('K').toFixed(2), 'walks a side': +per('BB').toFixed(2),
        doubles: +per('2B').toFixed(2), triples: +per('3B').toFixed(2), 'double plays': +per('DP').toFixed(2), errors: +per('E').toFixed(2), 'pitches a game': Math.round(pitches / games), 'pitches a turn': +(pitches / turns).toFixed(2),
        'steals tried a side': +(steals / sides).toFixed(2), 'steals made': +(1 - caught / steals).toFixed(2), 'most runs': Math.max(...runs), shutouts: +(runs.filter(r => r === 0).length / runs.length).toFixed(3) };
    console.log(`    baseball, ${games} games: ${JSON.stringify(report)}`);
    assert.ok(report['runs a side'] > 3.6 && report['runs a side'] < 6.2, `runs: ${report['runs a side']}`);
    assert.ok(report.average > 0.235 && report.average < 0.3, `average: ${report.average}`);
    assert.ok(report['home runs a side'] > 0.6 && report['home runs a side'] < 1.6, `home runs: ${report['home runs a side']}`);
    assert.ok(report['strikeouts a side'] > 5.5 && report['strikeouts a side'] < 11, `strikeouts: ${report['strikeouts a side']}`);
    assert.ok(report['walks a side'] > 2 && report['walks a side'] < 5, `walks: ${report['walks a side']}`);
    assert.ok(report['pitches a game'] > 230 && report['pitches a game'] < 340, `pitches: ${report['pitches a game']}`);
    assert.ok(report['steals made'] > 0.55 && report['steals made'] < 0.9, `steals made: ${report['steals made']}`);
    assert.ok(report.shutouts < 0.12 && report['most runs'] < 40);
    // The men: nobody hits .600 over a full season's at-bats, and somebody hits a few out.
    const bats = world.teams.flatMap(t => t.players).filter(p => !p.mix), best = Math.max(...bats.map(p => p.s.h / p.s.ab)), worst = Math.min(...bats.map(p => p.s.h / p.s.ab));
    assert.ok(best > 0.3 && best < 0.45 && worst > 0.12 && worst < 0.26, `averages from ${worst.toFixed(3)} to ${best.toFixed(3)}`);
    assert.ok(Math.max(...bats.map(p => stat(p.s, 'hr'))) >= 12);
});

test('the better club wins more, but not always; and the park matters', () => {
    const random = seeded(31), world = G.found(random, { days: 0 }), [strong, weak] = world.teams;
    for (const p of strong.players) for (const key of ['con', 'pow', 'eye', 'fld', 'stuff', 'ctl']) if (key in p) p[key] = L.clamp(p[key] + 0.05, 0.04, 0.98);
    for (const p of weak.players) for (const key of ['con', 'pow', 'eye', 'fld', 'stuff', 'ctl']) if (key in p) p[key] = L.clamp(p[key] - 0.05, 0.04, 0.98);
    let wins = 0;
    for (let i = 0; i < 200; i++) { const { game } = referee(world, i % 2, 1 - (i % 2), random); if ((game.R[1] > game.R[0]) === (i % 2 === 1)) wins++; }
    assert.ok(wins > 115 && wins < 188, `the strong club won ${wins} of 200`);
    // The same ball in two parks: out of the bandbox, caught in the big one.
    const small = { lf: 314, cf: 386, rf: 314, wall: [9, 9, 9], carry: 1, turf: 0.2, foul: 38 }, big = { ...small, lf: 350, cf: 428, rf: 350 };
    assert.ok(L.flight(104, 28, 0, small).gone && !L.flight(104, 28, 0, big).gone);
    assert.ok(L.flight(104, 27, -40, small).gone && !L.flight(104, 27, -40, { ...small, wall: [60, 9, 9] }).gone, 'a high wall keeps it in');
    assert.ok(L.flight(98, 30, 0, { ...big, carry: 1.07 }).carry > L.flight(98, 30, 0, big).carry);
    assert.ok(L.ballAt(L.flight(90, -5, 10, { ...small, turf: 0.13 }), 3).y > L.ballAt(L.flight(90, -5, 10, { ...small, turf: 0.36 }), 3).y, 'a fast infield');
});

test('the same dice give the same game; a saved league carries on exactly where it stopped', () => {
    const play = seed => { const world = G.found(seeded(4), { days: 2 }); const { game, plays } = referee(world, 2, 5, seeded(seed)); return { line: game.line, n: plays.length, world }; };
    const one = play(77), two = play(77), other = play(78);
    assert.deepEqual(one.line, two.line);
    assert.equal(one.n, two.n);
    assert.deepEqual(one.world, two.world);
    assert.notDeepEqual(one.world, other.world);
    // Stop in the middle of a game (in the middle of a turn at bat), save, load, and play both on with the same dice.
    const world = G.found(seeded(21)), dice = seeded(8);
    G.openDay(world, dice, { follow: 3 });
    assert.ok(world.game && [world.game.away, world.game.home].includes(3) && world.others.length === 3);
    for (let i = 0; i < 141; i++) G.pitch(world, dice);
    while (!(world.game.balls + world.game.strikes)) G.pitch(world, dice);
    const copy = JSON.parse(JSON.stringify(world));
    assert.ok(copy.game.inning >= 3 && !copy.game.over);
    for (const w of [world, copy]) { const more = seeded(4); while (G.pitch(w, more)); G.closeGame(w); G.openDay(w, more, {}); while (G.pitch(w, more)); }
    assert.deepEqual(copy, world);
});

test('a season: twenty-one days, a series for the trophy, a winter, and again and again', () => {
    const random = seeded(3), world = G.found(random, { days: 0 });
    let retired = 0, biggest = 0;
    for (let season = 1; season <= 12; season++) {
        let next = 'game', days = 0, games = 0;
        while (next === 'game') {
            G.openDay(world, random, { follow: season % 9 === 0 ? -1 : season % 8, innings: season % 4 === 0 ? 5 : 9 });
            assert.equal(world.others.length, 3);
            while (G.pitch(world, random));
            next = G.closeGame(world);
            days++;
            assert.ok(world.teams.every(t => t.w + t.l === days), 'every club has played every day');
        }
        assert.equal(next, 'series');
        assert.equal(days, G.DAYS);
        assert.equal(sum(world.teams, t => t.w), sum(world.teams, t => t.l));
        assert.equal(sum(world.teams, t => t.rs), sum(world.teams, t => t.ra));
        const table = G.standings(world);
        assert.deepEqual([world.series.a, world.series.b], [table[0].id, table[1].id], 'the top two play for it');
        for (let i = 1; i < 8; i++) assert.ok(G.pct(table[i - 1]) >= G.pct(table[i]));
        const tops = G.leaders(world);
        for (const key of ['avg', 'hr', 'rbi', 'sb', 'era', 'w', 'k', 'sv']) assert.equal(tops[key].length, 3, key);
        next = 'game';
        while (next === 'game') {
            const game = G.openDay(world, random, {});
            assert.ok(game.kind === 'series' && [world.series.a, world.series.b].includes(game.home) && world.others.length === 0);
            while (G.pitch(world, random));
            next = G.closeGame(world);
            games++;
        }
        assert.equal(next, 'champion');
        assert.ok(games >= G.SERIES && games <= G.SERIES * 2 - 1 && Math.max(...world.series.wins) === G.SERIES);
        assert.ok([world.series.a, world.series.b].includes(world.champion));
        assert.ok(world.teams.every(t => t.w + t.l === G.DAYS), 'the series is not in the standings');
        const before = new Set(world.teams.flatMap(t => t.players.map(p => p.id)));
        biggest = Math.max(biggest, JSON.stringify(world).length);
        const news = G.newSeason(world, random);
        assert.equal(news[0].type, 'champion');
        assert.equal(news.filter(n => n.type === 'prize').length, 5);
        assert.ok(news.some(n => n.type === 'series' && n.wins === G.SERIES) && news.some(n => n.type === 'cellar'));
        assert.equal(news.filter(n => n.type === 'retired').length, news.filter(n => n.type === 'rookie').length);
        retired += news.filter(n => n.type === 'retired').length;
        assert.equal(world.season, season + 1);
        assert.ok(world.stage === 'season' && world.day === 0 && world.champion === undefined && !world.game);
        const everyone = world.teams.flatMap(t => t.players);
        assert.equal(new Set(everyone.map(p => p.id)).size, 104);
        assert.equal(new Set(everyone.map(p => `${p.first} ${p.last}`)).size, 104);
        const nicks = everyone.map(p => p.nick).filter(Boolean);
        assert.equal(new Set(nicks).size, nicks.length, 'a nickname belongs to one man');
        assert.equal(everyone.filter(p => !before.has(p.id)).length, news.filter(n => n.type === 'rookie').length);
        for (const team of world.teams) {
            assert.deepEqual(team.players.map(p => p.pos).sort(), ['1B', '2B', '3B', 'C', 'CF', 'LF', 'RF', 'RP', 'RP', 'SP', 'SP', 'SP', 'SS']);
            assert.ok(team.w + team.l + team.rs + team.ra === 0 && team.lineup.length === 8 && team.lineup.every(id => L.find(team, id) && !L.find(team, id).mix));
            for (const p of team.players) { assert.deepEqual(p.s, {}); assert.ok(p.age >= 19 && p.age <= 42 && p.con > 0 && p.con < 1); }
        }
        assert.deepEqual(JSON.parse(JSON.stringify(world)), world);
    }
    assert.ok(retired >= 30, `${retired} retirements in twelve winters`);
    assert.equal(world.champs.length, 12);
    // No dynasty: the winters level the clubs, so nobody takes most of the titles.
    const titles = world.teams.map(t => world.champs.filter(c => c.id === t.id).length);
    assert.ok(Math.max(...titles) <= 6 && titles.filter(Boolean).length >= 4, `titles in twelve seasons: ${titles}`);
    assert.ok(biggest < 120000, `the saved league reached ${biggest} bytes`);
    assert.ok(world.teams.flatMap(t => t.players).some(p => p.c.yrs >= 10), 'somebody has had a long career');
});

test('nicknames are earned: each from a deed, the better story kept', () => {
    const names = G.NICKS.flatMap(rule => rule[3]);
    assert.equal(new Set(names).size, names.length, 'no nickname is in two lists');
    assert.ok(names.length > 80);
    const world = G.found(seeded(2), { days: 0 }), [slugger, other, third] = world.teams[0].players, deeds = { box: new Proxy({}, { get: () => 0 }) };
    assert.equal(G.christen(world, slugger, deeds), null, 'nothing done, nothing earned');
    slugger.s = { ab: 40, h: 8, k: 20 };
    const first = G.christen(world, slugger, deeds);
    assert.equal(first.why, 'fan');
    assert.ok(G.NICKS.find(r => r[0] === 'fan')[3].includes(slugger.nick));
    assert.equal(G.christen(world, slugger, deeds), null, 'he has it already');
    slugger.s.hr = 6;
    const second = G.christen(world, slugger, deeds);
    assert.deepEqual([second.why, second.was], ['power', first.nick]);
    assert.equal(G.christen(world, slugger, { ...deeds, walkoff: true, hr: true }).why, 'walkoff');
    slugger.s.sb = 20;
    assert.equal(G.christen(world, slugger, deeds), null, 'a lesser story does not replace a greater');
    // A habit names two men and no more.
    for (const p of [other, third, world.teams[1].players[0]]) p.s = { ab: 40, h: 8, k: 20 };
    assert.ok(G.christen(world, other, deeds) && G.christen(world, third, deeds));
    assert.equal(G.christen(world, world.teams[1].players[0], deeds), null);
    assert.equal(G.called(slugger), `'${slugger.nick}' ${slugger.last}`);
});

test('the announcer has something to say about everything, with no holes in it', () => {
    const info = { B: 'BATTER', P: 'PITCHER', F: 'LEFT', G: 'FIELDER', R: 'RUNNER', T: 'CLUB', D: 'OTHERS', N: 400, X: 'THIRD' };
    for (const [key, lines] of [...Object.entries(T.LINES), ...Object.entries(T.NOTES)]) {
        for (const line of lines) {
            assert.equal(line, line.toUpperCase(), `${key}: the lettering has capitals only`);
            assert.match(line, /^[A-Z0-9 .,!?'":()&+%\-{}]+$/, `${key}: a letter the face does not have: ${line}`);
            for (const [, slot] of line.matchAll(/\{(\w)\}/g)) assert.ok('BPFGRTDNXKL'.includes(slot), `${key}: {${slot}}`);
        }
    }
    const world = G.found(seeded(6), { days: 0 }), random = seeded(6);
    for (let i = 0; i < 12; i++) {
        const { plays } = referee(world, i % 8, (i + 1) % 8, random);
        plays.forEach((play, n) => {
            const line = T.call(play, { ...info, lead: n % 3 === 0, tie: n % 3 === 1 }, n), shout = T.shout(play);
            assert.ok(!/undefined|null|NaN|\{/.test(line + shout), line);
            if (play.result || play.kind === 'change') assert.ok(line.length > 8 && line.length < 150, `${play.result?.code}: "${line}"`);
            if (play.kind === 'pitch') assert.ok(shout.length > 2 && shout.length < 16, shout);
            for (const note of play.notes) assert.ok(T.note(note, { K: 'NICK', L: 'LAST', N: 5, T: 'CLUB' }, n).length > 10, note.type);
        });
    }
    assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22].map(T.ordinal), ['1ST', '2ND', '3RD', '4TH', '11TH', '12TH', '13TH', '21ST', '22ND']);
});

test('cheap and clean: no per-frame pixel reads, blurs, clocks, storage or timers of its own', () => {
    for (const [name, source] of Object.entries(sources)) {
        assert.ok(!/getImageData|putImageData|shadowBlur|\.filter\s*=/.test(source), `${name}: a per-pixel or blur call`);
        assert.ok(!/new Date\(|Date\.now\(/.test(source), `${name}: reads the clock itself (use host.now())`);
        assert.ok(!/localStorage|sessionStorage/.test(source), `${name}: touches storage itself`);
        assert.ok(!/setInterval|setTimeout/.test(source), `${name}: a timer of its own`);
        assert.ok(!/https?:\/\//.test(source), `${name}: a URL`);
        assert.ok(!/fillText|strokeText|\.font\s*=/.test(source), `${name}: the lettering is its own pixels`);
    }
    for (const name of ['baseball-logic.js', 'baseball-league.js', 'baseball-talk.js']) assert.ok(!/Math\.random|document|window/.test(sources[name]), `${name}: the rules take their dice as an argument and never see a browser`);
    // The park is baked, not drawn each frame: the only calls to the bake are in bake() itself.
    assert.equal(sources['baseball.js'].split('BaseballArt.park(').length - 1, 1);
});
