// The Never-Ending Baseball Season's game (SPEC §10.37), with no drawing in
// it: one pitch at a time, and everything that can follow from it. Pure and
// seeded (every function that rolls dice takes `random`), so the unit test
// can play a season in a second and check that every box score adds up.
//
//   The field     in feet, home plate at (0, 0), second base straight up
//                 the y axis. A park is its three wall distances, its wall
//                 heights, how the ball carries, how fast the turf is and
//                 how much foul ground it has.
//   A pitch       the pitcher picks from his own repertoire by the count
//                 (heat when behind, something bent when ahead), aims at a
//                 corner or just off it, and misses by his control and his
//                 tiredness. The batter sees it as well as his eye allows
//                 and decides; contact depends on his bat and the pitch.
//   A ball in     has an exit speed, a launch angle and a spray angle, and
//   play          flies (carry, hang time, the wall) or rolls (slowing on
//                 the turf). Every fielder works out when he could get to
//                 it; the first one there plays it. A throw takes time, a
//                 runner takes time, and whoever arrives first wins: force
//                 outs, double plays, sacrifice flies, a man thrown out at
//                 the plate and an infield single all come from the same
//                 two clocks.
//   The book      every run, hit, error and out is credited as it happens
//                 to the game's box score and the player's season, and
//                 charged to the pitcher who put the runner on.
//
// `pitch(game, [away, home], random)` advances the game by one event and
// returns it as a `play`: everything the wallpaper needs to act it out
// (the pitch, the ball's flight, who fielded it and when, each throw, each
// runner's start and finish), on one clock that starts at the bat.

const BaseballLogic = (() => {
    'use strict';

    const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
    const RAD = Math.PI / 180, GRAVITY = 32.17, MPH = 1.467;
    // Three dice make a bell near enough: mean 0, deviation 1.
    const gauss = random => (random() + random() + random() - 1.5) * 2;
    const bump = (stats, key, n = 1) => { stats[key] = (stats[key] || 0) + n; };

    const POS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
    // Where each of the nine stands, and the four bases (0 and 4 are home).
    const SPOTS = [[0, 60.5], [0, -5], [56, 84], [32, 134], [-56, 84], [-32, 134], [-128, 245], [0, 290], [128, 245]];
    const BASES = [[0, 0], [63.64, 63.64], [0, 127.28], [-63.64, 63.64], [0, 0]];
    const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

    // What can be thrown: speed range (mph), how hard it is to hit and to
    // read, how it changes the ball's launch, how wild it is, and how far it
    // bends on the way (in strike zones, for the pitch tracker).
    const PITCHES = {
        FB: { name: 'FASTBALL', mph: [86, 97], whiff: 1, read: 1, bend: [0, 0.15] },
        SI: { name: 'SINKER', mph: [85, 93], whiff: 0.85, read: 1, lift: -9, bend: [0.35, -0.3] },
        SL: { name: 'SLIDER', mph: [79, 87], whiff: 1.3, read: 1.35, lift: -2, bend: [-0.7, -0.25] },
        CU: { name: 'CURVE', mph: [69, 79], whiff: 1.25, read: 1.3, lift: -4, wild: 0.06, bend: [-0.25, -1] },
        CH: { name: 'CHANGEUP', mph: [76, 84], whiff: 1.2, read: 1.25, lift: -3, bend: [0.25, -0.45] },
        FK: { name: 'FORKBALL', mph: [78, 85], whiff: 1.4, read: 1.4, lift: -6, wild: 0.12, bend: [0, -0.9] },
        SC: { name: 'SCREWBALL', mph: [73, 81], whiff: 1.2, read: 1.3, lift: -2, bend: [0.7, -0.35] },
        KN: { name: 'KNUCKLER', mph: [59, 68], whiff: 1.15, read: 1.5, wild: 0.2, soft: 5, bend: [0.3, -0.5] },
        EE: { name: 'EEPHUS', mph: [43, 54], whiff: 0.9, read: 1.6, lift: 6, soft: 4, wild: 0.05, bend: [0, -1.5] },
    };

    const find = (team, id) => team.players.find(p => p.id === id);
    const feetPerSecond = player => 23.5 + 5.5 * player.spd;
    const throwTime = (feet, arm) => feet / ((108 + 26 * arm) * (feet > 150 ? 0.8 : 1));
    const stamina = pitcher => (pitcher.pos === 'SP' ? 64 + 44 * pitcher.sta : 18 + 22 * pitcher.sta);

    // ---- The park ---------------------------------------------------------------------

    // How far the fence is from home along a bearing (degrees: 0 is dead
    // centre, -45 the left-field line, beyond ±45 foul ground).
    function edgeAt(park, bearing) {
        const off = Math.abs(bearing);
        if (off <= 45) {
            const corner = bearing < 0 ? park.lf : park.rf;
            return park.cf - (park.cf - corner) * (off / 45) ** 1.7;
        }
        const past = off - 45, corner = bearing < 0 ? park.lf : park.rf;
        if (past <= 90) return Math.min(corner, park.foul / Math.sin(Math.max(past, 1) * RAD));
        return park.foul + (Math.max(park.foul, 52) - park.foul) * (past - 90) / 45;
    }
    const wallHeight = (park, bearing) => (Math.abs(bearing) > 45 ? 4 : bearing < -15 ? park.wall[0] : bearing > 15 ? park.wall[2] : park.wall[1]);
    const bearingOf = (x, y) => Math.atan2(x, y) / RAD;
    const inPlay = (park, x, y) => Math.hypot(x, y) <= edgeAt(park, bearingOf(x, y));

    // ---- The ball ---------------------------------------------------------------------

    // A batted ball: off the bat at `ev` mph, `la` degrees up, `spray`
    // degrees round from centre field.
    function flight(ev, la, spray, park) {
        const v = ev * MPH, up = la * RAD, f = { ev, la, spray, dir: [Math.sin(spray * RAD), Math.cos(spray * RAD)], carry: 0, T: 0, apex: 0, k: park.turf };
        if (la > 4) {
            f.carry = v * v / GRAVITY * Math.sin(2 * up) * (1 - 0.0029 * ev) * (1 - 0.016 * Math.max(0, la - 28)) * park.carry;
            f.T = 2 * v * Math.sin(up) / GRAVITY * (0.92 - 0.004 * Math.max(0, la - 30));
            f.apex = (v * Math.sin(up)) ** 2 / (2 * GRAVITY) * (0.78 - 0.006 * Math.max(0, la - 30));
            f.roll = f.carry / f.T * clamp(0.92 - la / 50, 0.12, 0.85);
        } else f.roll = v * 0.8 * (1 - clamp(-la, 0, 25) / 50);
        f.edge = edgeAt(park, spray);
        f.fair = Math.abs(spray) <= 45;
        // Does it get to the fence, and how?
        f.tEdge = 1e9;
        for (let t = 0.02; t < 14; t += 0.02) {
            const at = along(f, t);
            if (at.d < f.edge - 1.5) continue;
            f.tEdge = t;
            f.zEdge = at.z;
            if (t < f.T && at.z > wallHeight(park, spray)) f.gone = true;
            else f.wall = true;
            break;
        }
        return f;
    }
    // Distance from home and height, ignoring the fence.
    function along(f, t) {
        if (t < f.T) { const q = t / f.T; return { d: f.carry * q, z: 3 * (1 - q) + f.apex * 4 * q * (1 - q) }; }
        return { d: f.carry + f.roll / f.k * (1 - Math.exp(-f.k * (t - f.T))), z: 0 };
    }
    // Where the ball is `t` seconds after the bat: { x, y, z }.
    function ballAt(f, t) {
        let { d, z } = along(f, Math.max(0, t));
        if (f.wall && t >= f.tEdge) {
            d = f.edge - 1.5 - Math.min(9, (t - f.tEdge) * 12);
            z = Math.max(0, f.zEdge - 26 * (t - f.tEdge));
        }
        return { x: f.dir[0] * d, y: f.dir[1] * d, z };
    }

    // ---- The defence ------------------------------------------------------------------

    function defence(game, teams) {
        const side = 1 - game.half, team = teams[side], park = teams[1].park;
        return POS.map((pos, idx) => {
            const p = idx === 0 ? find(team, game.pit[side]) : team.players.find(q => q.pos === pos);
            let [x, y] = SPOTS[idx];
            if (idx >= 6) { const far = Math.hypot(x, y), most = edgeAt(park, bearingOf(x, y)) - 48; if (far > most) { x *= most / far; y *= most / far; } }
            return { idx, p, x, y, spd: (idx < 6 ? 17.5 : 21.5) + 6 * p.fld, react: idx === 0 ? 1 : idx === 1 ? 0.5 : idx < 6 ? 0.46 : 0.47, arm: p.arm };
        });
    }
    // Seconds for a fielder to get to a point: a moment to read it, a few
    // steps to get going, then his speed.
    function reach(f, x, y) {
        const feet = Math.max(0, Math.hypot(x - f.x, y - f.y) - 2.5);
        return f.react + feet / f.spd + 0.6 * (1 - Math.exp(-feet / 14));
    }
    // Who gets to the ball first, where, and whether it is still in the air.
    function chase(f, fielders, random) {
        const slow = {};
        let dove = null;
        for (let t = 0.1; t < 20; t += 0.05) {
            if (f.gone && t >= f.tEdge) return null;
            const at = ballAt(f, t);
            if (at.z > 8.5) continue;
            const air = t < f.T && !(f.wall && t >= f.tEdge);
            let best = null;
            for (const fielder of fielders) {
                if (fielder.idx === 1 && Math.hypot(at.x, at.y) > 50) continue;      // the catcher stays near home
                const need = reach(fielder, at.x, at.y) + (slow[fielder.idx] || 0);
                if (need <= t + (air && !slow[fielder.idx] ? 0.1 : 0) && (!best || need < best.need)) best = { fielder, need };
            }
            if (!best) continue;
            const late = best.need - t;
            if (air && late > 0) {
                // Only a dive gets there: half are caught, half get by him.
                if (random() < 0.5) return { who: best.fielder.idx, t, at: [at.x, at.y], air: true, dive: true };
                slow[best.fielder.idx] = 1.5;
                dove = best.fielder.idx;
                continue;
            }
            return { who: best.fielder.idx, t, at: [at.x, at.y], air, dove, easy: -late };
        }
        return null;
    }

    // ---- The book ---------------------------------------------------------------------

    function startGame(away, home, { innings = 9, kind = 'season' } = {}) {
        const starter = team => { const arms = team.players.filter(p => p.pos === 'SP'); return arms[(team.turn || 0) % arms.length]; };
        const a = starter(away), h = starter(home);
        const game = {
            away: away.id, home: home.id, innings, kind, inning: 1, half: 0, outs: 0, balls: 0, strikes: 0, bases: [0, 0, 0], spot: [0, 0],
            order: [[...away.lineup, a.id], [...home.lineup, h.id]], pit: [a.id, h.id], used: [[a.id], [h.id]], entered: [0, 0],
            line: [[0], []], R: [0, 0], H: [0, 0], E: [0, 0], LOB: [0, 0], box: {}, resp: {}, soft: [], rec: {}, pitches: 0, seq: [], innR: 0, live: 0, over: false,
        };
        bump(a.s, 'gs'); bump(h.s, 'gs');
        return game;
    }
    const boxOf = (game, id) => (game.box[id] ||= {});
    function credit(game, team, id, key, n = 1) {
        bump(find(team, id).s, key, n);
        bump(boxOf(game, id), key, n);
    }

    function score(ctx, id, { rbi = true, earned = true } = {}) {
        const { game: g, b, d, bt, ft, play } = ctx, lead = g.R[b] - g.R[d];
        const charged = g.resp[id] || g.pit[d];
        g.R[b]++;
        g.line[b][g.inning - 1]++;
        g.innR++;
        credit(g, bt, id, 'r');
        if (rbi) { credit(g, bt, ctx.batter.id, 'rbi'); play.rbi = (play.rbi || 0) + 1; }
        credit(g, ft, charged, 'ra');
        if (earned && !g.soft.includes(id)) credit(g, ft, charged, 'er');
        if (lead === 0) g.rec = { w: g.pit[b], l: charged };       // ahead: these two are on the hook
        else if (lead === -1) g.rec = {};                           // level again
        (play.scored ||= []).push(id);
    }

    // Carry out what the runners did, lead runner first: each
    // { id, from (0 is the batter), to (4 is home), t0, t, out }. A run on
    // the play that makes the third out counts only if it was no force and
    // he crossed first.
    function settle(ctx, list, { rbi = true, earned = true, force = false } = {}) {
        const { game: g, play, ft } = ctx, moving = new Set(list.map(m => m.id)), bases = [0, 0, 0];
        g.bases.forEach((id, i) => { if (id && !moving.has(id)) bases[i] = id; });
        const outs = list.filter(m => m.out).sort((p, q) => p.t - q.t), third = outs[2 - g.outs];
        let stranded = 0;
        for (const m of list) {
            play.runs.push({ id: m.id, from: m.from, to: m.to, t0: m.t0 || 0, t: m.t, out: !!m.out });
            if (m.out) { g.outs++; credit(g, ft, g.pit[ctx.d], 'outs'); continue; }
            if (m.from === 0) { g.resp[m.id] = ctx.pitcher.id; if (!earned) g.soft.push(m.id); }
            if (m.to >= 4 && (!third || (!force && m.t < third.t))) score(ctx, m.id, { rbi, earned });
            else if (third) stranded++;                                                // it did not count, or he never got round: left on
            else bases[m.to - 1] = m.id;
        }
        g.bases = bases;
        if (third) { g.LOB[ctx.b] += stranded + bases.filter(Boolean).length; g.bases = [0, 0, 0]; }
    }

    function finish(ctx) {
        const { game: g, teams, play } = ctx;
        g.over = true;
        g.LOB[g.half] += g.bases.filter(Boolean).length;
        const win = g.R[1] > g.R[0] ? 1 : 0, last = g.pit[win];
        g.wp = g.rec.w || last;
        g.lp = g.rec.l || g.pit[1 - win];
        if (last !== g.wp && g.entered[win] > 0 && g.entered[win] <= 3) g.sv = last;
        credit(g, teams[win], g.wp, 'w');
        credit(g, teams[1 - win], g.lp, 'l');
        if (g.sv) credit(g, teams[win], g.sv, 'sv');
        for (const side of [0, 1]) {
            for (const id of new Set([...g.order[side], ...g.used[side]])) bump(find(teams[side], id).s, 'g');
        }
        play.gameOver = true;
    }

    function endHalf(ctx) {
        const { game: g, play } = ctx;
        play.endHalf = true;
        g.LOB[g.half] += g.bases.filter(Boolean).length;
        g.bases = [0, 0, 0];
        g.resp = {};
        g.soft = [];
        g.outs = g.balls = g.strikes = g.innR = g.live = 0;
        g.seq = [];
        const last = g.inning >= g.innings;
        if (g.half === 0) {
            if (last && g.R[1] > g.R[0]) return finish(ctx);
            g.half = 1;
            g.line[1].push(0);
        } else {
            if (last && g.R[0] !== g.R[1]) return finish(ctx);
            g.inning++;
            g.half = 0;
            g.line[0].push(0);
        }
    }

    // The batter's turn is over.
    function endTurn(ctx, code, more = {}) {
        const { game: g, play, b } = ctx;
        play.result = { code, ...more };
        if (!['BB', 'HBP', 'SF'].includes(code)) credit(g, ctx.bt, ctx.batter.id, 'ab');
        g.balls = g.strikes = g.live = 0;
        g.seq = [];
        g.spot[b] = (g.spot[b] + 1) % 9;
        if (g.half === 1 && g.inning >= g.innings && g.R[1] > g.R[0]) { play.walkoff = true; return finish(ctx); }
        if (g.outs >= 3) endHalf(ctx);
    }

    // Who should be pitching? A tired or battered arm comes out; the best
    // of the bullpen is kept for a lead in the last inning.
    function manage(game, teams) {
        const d = 1 - game.half, team = teams[d], now = find(team, game.pit[d]), box = boxOf(game, now.id), thrown = box.pc || 0;
        const arms = team.players.filter(p => p.pos === 'RP').sort((p, q) => q.stuff - p.stuff), pen = arms.filter(p => !game.used[d].includes(p.id));
        if (!pen.length) return null;
        const lead = game.R[d] - game.R[game.half], on = game.bases.filter(Boolean).length, limit = stamina(now), late = game.inning >= game.innings;
        const save = late && lead > 0 && lead <= 3 && game.outs === 0 && !on && pen[0] === arms[0];
        const done = thrown > limit + 12 || (box.ra || 0) >= 7 || (game.innR >= 4 && thrown > 25) || (thrown > limit && (on >= 2 || game.innR >= 2));
        if (!save && !done) return null;
        const next = save || late ? pen[0] : pen[pen.length - 1];
        game.pit[d] = next.id;
        game.used[d].push(next.id);
        game.order[d][game.order[d].indexOf(now.id)] = next.id;
        game.entered[d] = lead;
        return { kind: 'change', half: game.half, inning: game.inning, side: d, out: now.id, in: next.id, thrown, why: save ? 'save' : 'tired', notes: [] };
    }

    // ---- A pitch ----------------------------------------------------------------------

    function choose(pitcher, game, random) {
        const n = pitcher.mix.length, ahead = game.strikes > game.balls, behind = game.balls > game.strikes && game.balls >= 2;
        const weights = pitcher.mix.map((type, i) => {
            let w = i === 0 ? 1 : 1 / Math.max(1, n - 1);
            if (ahead && i > 0) w *= 1.7;
            if (behind && i === 0) w *= 2.4;
            if (game.seq.at(-1) === type && game.seq.at(-2) === type) w *= 0.4;
            return w;
        });
        let roll = random() * weights.reduce((sum, w) => sum + w, 0);
        for (let i = 0; i < n; i++) if ((roll -= weights[i]) < 0) return pitcher.mix[i];
        return pitcher.mix[0];
    }

    function pitch(game, teams, random) {
        if (game.over) return null;
        const g = game, b = g.half, d = 1 - b, bt = teams[b], ft = teams[d];
        if (!g.live) {
            g.live = 1;
            const change = manage(g, teams);
            if (change) return change;
        }
        const batter = find(bt, g.order[b][g.spot[b]]), pitcher = find(ft, g.pit[d]);
        const play = {
            kind: 'pitch', half: b, inning: g.inning, batter: batter.id, pitcher: pitcher.id,
            before: { balls: g.balls, strikes: g.strikes, outs: g.outs, bases: g.bases.slice() }, runs: [], throws: [], notes: [],
        };
        const ctx = { game: g, teams, random, play, batter, pitcher, b, d, bt, ft };
        const box = boxOf(g, pitcher.id), tired = clamp(((box.pc || 0) - stamina(pitcher)) / 45);
        bump(box, 'pc');
        g.pitches++;

        // A runner on first with second open may go.
        let thief = null;
        if (g.bases[0] && !g.bases[1]) {
            const runner = find(bt, g.bases[0]);
            if (random() < 0.006 + 0.2 * Math.max(0, runner.spd - 0.4) ** 1.6) thief = runner;
        }

        // What, and where. The zone is ±1 each way; x is toward first base.
        const type = choose(pitcher, g, random), kind = PITCHES[type], stuff = clamp(pitcher.stuff - 0.35 * tired);
        g.seq.push(type);
        const waste = random() < (g.balls === 3 ? 0.04 : g.strikes === 2 ? (g.balls <= 1 ? 0.6 : 0.35) : g.strikes > g.balls ? 0.35 : g.balls >= 2 ? 0.1 : 0.24);
        let tx, tz;
        if (waste) {
            if (random() < 0.6) { tz = -1.35; tx = (random() * 2 - 1) * 0.7; } else { tx = (random() < 0.5 ? -1 : 1) * 1.35; tz = (random() * 2 - 1) * 0.7; }
        } else {
            tx = (random() < 0.5 ? -1 : 1) * (0.2 + 0.45 * random()) * (g.balls === 3 ? 0.5 : 1);
            tz = (random() * 2 - 1) * 0.6;
        }
        const spread = 0.36 + 0.55 * (1 - pitcher.ctl) + 0.35 * tired + (kind.wild || 0);
        const x = tx + gauss(random) * spread, z = tz + gauss(random) * spread, off = Math.max(Math.abs(x), Math.abs(z));
        const mph = Math.round(kind.mph[0] + (kind.mph[1] - kind.mph[0]) * pitcher.stuff - 4 * tired + gauss(random));
        const hand = pitcher.throws === 'L' ? -1 : 1, side = batter.bats === 'R' ? -1 : 1;
        play.pitch = { type, mph, x, z, bend: [kind.bend[0] * hand, kind.bend[1]] };

        const runners = g.bases.some(Boolean);
        if (x * side > 2.5 && Math.abs(z) < 1.7) {
            // It hits him.
            play.call = 'hbp';
            credit(g, bt, batter.id, 'hbp');
            credit(g, ft, pitcher.id, 'hb');
            walk(ctx);
            endTurn(ctx, 'HBP');
            return play;
        }
        // The batter: what he thinks he sees, and whether he goes.
        const seen = off + gauss(random) * 0.3 * (1.3 - batter.eye) * kind.read;
        const limit = 1 + 0.1 * (1 - batter.eye) + (g.strikes === 2 ? 0.28 : 0) - (g.balls === 3 && g.strikes < 2 ? 0.25 : 0) - (g.balls === 3 && !g.strikes ? 0.5 : 0);
        const take = g.strikes === 2 ? 0.04 : g.strikes === 1 ? 0.2 : g.balls ? 0.3 : 0.4;
        const swing = seen < limit && random() > take && !(thief && g.strikes < 2);
        play.swing = swing;
        let contact = false;
        if (swing) contact = random() < clamp(0.66 + 0.28 * batter.con - 0.17 * stuff * kind.whiff - 0.22 * Math.max(0, off - 0.7) + (g.strikes === 2 ? 0.03 : 0), 0.15, 0.96);

        if (!swing || !contact) {
            const wild = !swing && runners && (Math.abs(x) > 2.7 || z < -2.5 || z > 2.8);
            if (wild) {
                // Past the catcher: everybody moves up.
                play.wild = true;
                credit(g, ft, pitcher.id, 'wp');
                thief = null;
                settle(ctx, [2, 1, 0].filter(i => g.bases[i]).map(i => ({ id: g.bases[i], from: i + 1, to: i + 2, t0: 1.3, t: 1.3 + 80 / feetPerSecond(find(bt, g.bases[i])) })), { rbi: false });
                if (g.half === 1 && g.inning >= g.innings && g.R[1] > g.R[0]) { play.call = 'ball'; play.walkoff = true; finish(ctx); return play; }
            }
            if (swing || off <= 1) {
                play.call = swing ? 'swinging' : 'called';
                g.strikes++;
                if (g.strikes === 3) {
                    g.outs++;
                    credit(g, ft, pitcher.id, 'outs');
                    credit(g, bt, batter.id, 'k');
                    credit(g, ft, pitcher.id, 'ka');
                    if (thief && g.outs < 3) steal(ctx, thief);
                    endTurn(ctx, 'K', { looking: !swing, outs: 1 });
                    return play;
                }
            } else {
                play.call = 'ball';
                g.balls++;
                if (g.balls === 4) {
                    credit(g, bt, batter.id, 'bb');
                    credit(g, ft, pitcher.id, 'bba');
                    walk(ctx);
                    endTurn(ctx, 'BB');
                    return play;
                }
            }
            if (thief) { steal(ctx, thief); if (g.outs >= 3) endHalf(ctx); }
            return play;
        }

        // Contact. Two in five go foul.
        if (random() < 0.37 + 0.12 * Math.max(0, off - 0.8) + (g.strikes === 2 ? 0.04 : 0)) {
            play.call = 'foul';
            // Most go back to the screen or into the seats; a few go straight up over foul ground, and somebody may get under one.
            const back = random() < 0.45, lr = random() < 0.5 ? -1 : 1, pop = random() < 0.1;
            const foul = play.fl = pop ? flight(55 + random() * 22, 48 + random() * 20, lr * (50 + random() * 70), teams[1].park)
                : flight(62 + random() * 30, back ? 20 + random() * 40 : 4 + random() * 30, lr * (back ? 125 + random() * 55 : 47 + random() * 50), teams[1].park);
            const got = pop && !foul.gone ? chase(foul, defence(g, teams), random) : null;
            if (got?.air) {
                play.call = 'inplay';
                play.field = got;
                settle(ctx, [{ id: batter.id, from: 0, to: 0, t: got.t, out: true }]);
                endTurn(ctx, 'PO', { by: got.who, foul: true, outs: 1 });
                play.dur = got.t;
                return play;
            }
            if (g.strikes < 2) g.strikes++;
            return play;
        }
        play.call = 'inplay';
        inPlayBall(ctx, { off, stuff, kind, tired, z });
        return play;
    }

    // Ball four, or hit by the pitch: the batter to first, and anyone in his way moves up.
    function walk(ctx) {
        const { game: g, batter } = ctx, list = [];
        if (g.bases[0] && g.bases[1] && g.bases[2]) list.push({ id: g.bases[2], from: 3, to: 4, t0: 0.4, t: 5 });
        if (g.bases[0] && g.bases[1]) list.push({ id: g.bases[1], from: 2, to: 3, t0: 0.4, t: 5 });
        if (g.bases[0]) list.push({ id: g.bases[0], from: 1, to: 2, t0: 0.4, t: 5 });
        list.push({ id: batter.id, from: 0, to: 1, t0: 0.4, t: 5 });
        settle(ctx, list);
    }

    function steal(ctx, runner) {
        const { game: g, random, play, ft, bt } = ctx, catcher = ft.players.find(p => p.pos === 'C');
        const run = 3.42 - 0.6 * runner.spd + gauss(random) * 0.1;
        const there = 60.5 / (play.pitch.mph * MPH) + 0.95, peg = there + 1.9 - 0.3 * catcher.arm + gauss(random) * 0.12, out = peg < run;
        settle(ctx, [{ id: runner.id, from: 1, to: 2, t0: 0, t: run, out }], { rbi: false });
        credit(g, bt, runner.id, out ? 'cs' : 'sb');
        play.steal = { id: runner.id, out, t: run };
        play.throws.push({ t0: there + 0.5, t: peg, from: BASES[0], to: BASES[2], base: 2 });
    }

    // ---- A ball in play ---------------------------------------------------------------

    function inPlayBall(ctx, { off, stuff, kind, tired, z }) {
        const { game: g, teams, random, play, batter, pitcher, bt, ft } = ctx, park = teams[1].park;
        const ev = clamp(83 + 17 * batter.pow + 9.5 * gauss(random) - 7 * Math.max(0, off - 0.6) - 6 * (stuff - 0.5) - (kind.soft || 0) + 4 * tired, 42, 114);
        const la = clamp(10 + 8 * batter.pow + (kind.lift || 0) + 4 * z + 24 * gauss(random), -35, 62);
        const pull = batter.bats === 'R' ? -1 : 1;
        let spray = 99;
        for (let tries = 0; tries < 5 && Math.abs(spray) > 44.5; tries++) spray = pull * (6 + 7 * batter.pow) + 23 * gauss(random);
        spray = clamp(spray, -44.5, 44.5);
        const f = play.fl = flight(ev, la, spray, park), fielders = defence(g, teams);
        const before = g.bases.slice(), outsBefore = g.outs;

        if (f.gone) {
            // Over the wall, unless a man goes up the fence and takes it back.
            const at = [f.dir[0] * (f.edge - 3), f.dir[1] * (f.edge - 3)];
            const thief = fielders.filter(o => o.idx >= 6 && reach(o, at[0], at[1]) < f.tEdge - 0.3)[0];
            if (thief && f.zEdge < wallHeight(park, spray) + 4 && wallHeight(park, spray) < 14 && random() < 0.4) {
                f.gone = false;
                f.robbed = true;
                play.field = { who: thief.idx, t: f.tEdge, at, air: true, robbed: true };
                return caught(ctx, f, play.field, fielders);
            }
            const jog = 12, list = [2, 1, 0].filter(i => before[i]).map(i => ({ id: before[i], from: i + 1, to: 4, t0: 0.6, t: f.T + (3 - i) * jog / 4 }));
            list.push({ id: batter.id, from: 0, to: 4, t0: 0.5, t: f.T + jog });
            credit(g, bt, batter.id, 'h'); credit(g, bt, batter.id, 'hr');
            credit(g, ft, pitcher.id, 'ha'); credit(g, ft, pitcher.id, 'hra');
            g.H[ctx.b]++;
            settle(ctx, list);
            play.dur = f.T + jog;
            return endTurn(ctx, 'HR', { hit: 4, feet: Math.round(f.carry), slam: list.length === 4 });
        }

        const got = chase(f, fielders, random) || { who: 7, t: 12, at: [f.dir[0] * (f.edge - 4), f.dir[1] * (f.edge - 4)], air: false };
        play.field = got;
        if (got.air) return caught(ctx, f, got, fielders);
        const fielder = fielders[got.who], depth = Math.hypot(got.at[0], got.at[1]);
        if (got.who < 6 && depth < 175 && f.la < 12) return grounder(ctx, f, got, fielder, before);

        // It is down for a hit. Each runner takes what he is sure of; one may try for more.
        const fumble = random() < 0.012 + 0.03 * (1 - fielder.p.fld) ** 2;
        // A ball that gets to the fence rattles about in the corner for a while.
        const pickup = got.t + (fumble ? 1.6 : 0) + (got.t >= f.tEdge ? random() * 1.8 : 0), release = pickup + (got.who >= 6 ? 1.05 : 0.7);
        const peg = base => release + throwTime(distance(got.at, BASES[base]), fielder.arm);
        const hung = f.T > 2.2 && outsBefore < 2;
        const list = [], runners = [3, 2, 1].filter(i => before[i - 1]).map(i => ({ p: find(bt, before[i - 1]), from: i })).concat({ p: batter, from: 0 });
        let cap = 4, chased = null;
        for (const r of runners) {
            const v = feetPerSecond(r.p), start = r.from ? (hung ? 0.3 * f.T : 0.1) : 0.8;
            const arrive = k => start + (90 * k - (r.from ? 16 : 0)) / v + 0.22 * (k - 1);
            let k = 1;
            while (r.from + k < 4 && r.from + k + 1 <= cap && arrive(k + 1) < peg(r.from + k + 1) - 0.1) k++;
            let out = false, safeHit = k;
            if (!chased && r.from + k < 4 && r.from + k + 1 <= cap) {
                const margin = peg(r.from + k + 1) - arrive(k + 1);
                if (margin > -0.35 && margin > 0.45 - 0.5 * r.p.spd - (outsBefore === 2 ? 0.15 : 0) + gauss(random) * 0.12) {
                    k++;
                    out = arrive(k) + gauss(random) * 0.1 > peg(r.from + k) + gauss(random) * 0.2;
                    chased = { base: r.from + k, t: peg(r.from + k), out };
                    if (!out) safeHit = k;
                }
            } else if (chased && r.from + k < 4 && r.from + k + 1 <= cap && arrive(k + 1) < chased.t + 0.9) k++;    // up on the throw
            const to = r.from + k;
            list.push({ id: r.p.id, from: r.from, to, t0: start, t: arrive(k), out });
            cap = to >= 4 && !out ? 4 : to - 1;
            if (!r.from) r.hit = Math.min(safeHit, k);
        }
        const hit = runners.at(-1).hit;
        const target = chased ? chased.base : Math.min(3, Math.max(2, ...list.filter(m => m.to < 4).map(m => m.to + 1)));
        play.throws.push({ t0: release, t: chased ? chased.t : peg(target), from: got.at, to: BASES[target], base: target });
        credit(g, bt, batter.id, 'h');
        if (hit === 2) credit(g, bt, batter.id, 'd');
        if (hit === 3) credit(g, bt, batter.id, 't');
        if (hit === 4) { credit(g, bt, batter.id, 'hr'); credit(g, ft, pitcher.id, 'hra'); }      // all the way round, inside the park
        credit(g, ft, pitcher.id, 'ha');
        g.H[ctx.b]++;
        if (fumble) { g.E[ctx.d]++; credit(g, ft, fielder.p.id, 'e'); play.field.fumble = true; }
        settle(ctx, list);
        play.dur = Math.max(...list.map(m => m.t), play.throws[0].t);
        return endTurn(ctx, ['', '1B', '2B', '3B', 'HR'][hit], { hit, inside: hit === 4, by: got.who, outs: chased?.out ? 1 : 0, nailed: chased?.out ? chased.base : 0, wall: got.t >= f.tEdge, error: fumble });
    }

    // A fly, a liner or a pop-up is caught. A runner on third may tag and try for home.
    function caught(ctx, f, got, fielders) {
        const { game: g, random, play, batter, bt } = ctx, fielder = fielders[got.who], before = g.bases.slice();
        const list = [{ id: batter.id, from: 0, to: 0, t: got.t, out: true }];
        let sac = false;
        play.dur = got.t;
        if (g.outs < 2 && got.who >= 6) {
            const release = got.t + 0.85 + (got.dive ? 0.5 : 0);
            const tag = (base, sure) => {
                const runner = find(bt, before[base - 1]), run = got.t + 0.2 + 90 / feetPerSecond(runner), peg = release + throwTime(distance(got.at, BASES[base + 1]), fielder.arm), margin = peg - run;
                if (!(sure ? margin > 0.5 : margin > 0.3 - 0.55 * runner.spd + gauss(random) * 0.12)) return null;
                const out = run + gauss(random) * 0.1 > peg + gauss(random) * 0.2;
                return { id: runner.id, from: base, to: base + 1, t0: got.t + 0.2, t: run, out, peg };
            };
            const home = before[2] ? tag(3, false) : null;
            if (home) {
                list.unshift(home);
                sac = !home.out;
                play.throws.push({ t0: release, t: home.peg, from: got.at, to: BASES[4], base: 4 });
            }
            if (before[1] && (!before[2] || home) && !(home?.out && g.outs === 1)) {
                const third = tag(2, !!home);
                if (third && !(home && third.out)) {
                    list.splice(home ? 1 : 0, 0, third);
                    if (!home) play.throws.push({ t0: release, t: third.peg, from: got.at, to: BASES[3], base: 3 });
                }
            }
            play.dur = Math.max(...list.map(m => m.t));
        }
        settle(ctx, list);
        const code = sac ? 'SF' : got.who >= 6 || f.la >= 38 ? (got.who >= 6 ? 'FO' : 'PO') : f.la < 20 ? 'LO' : 'PO';
        if (sac) credit(g, bt, batter.id, 'sf');
        return endTurn(ctx, code, { by: got.who, outs: list.filter(m => m.out).length, dive: !!got.dive, robbed: !!got.robbed, nailed: list.some(m => m.out && m.from) ? list.find(m => m.out && m.from).to : 0, deep: Math.hypot(got.at[0], got.at[1]) > f.edge - 14 });
    }

    // An infielder has a ground ball: the force, the double play, or the sure out at first.
    function grounder(ctx, f, got, fielder, before) {
        const { game: g, random, play, batter, pitcher, bt, ft } = ctx, [on1, on2, on3] = before, outs = g.outs;
        const tb = 0.85 + 90 / feetPerSecond(batter) - (batter.bats === 'L' ? 0.08 : 0);
        const release = got.t + 0.72 + 0.2 * (1 - fielder.p.fld), peg = base => release + throwTime(distance(got.at, BASES[base]), fielder.arm);
        const jump = id => 0.2 + 77 / feetPerSecond(find(bt, id));
        const forced = [on1 ? { id: on1, from: 1 } : null, on1 && on2 ? { id: on2, from: 2 } : null, on1 && on2 && on3 ? { id: on3, from: 3 } : null].filter(Boolean).reverse();
        const go = m => ({ ...m, to: m.from + 1, t0: 0.2, t: jump(m.id) });
        const done = (list, code, more, opts) => {
            settle(ctx, list, opts);
            play.dur = Math.max(...list.map(m => m.t), ...play.throws.map(t => t.t), got.t);
            return endTurn(ctx, code, { by: got.who, outs: list.filter(m => m.out).length, ...more });
        };
        const toss = (base, from = got.at, t0 = release, t = peg(base)) => play.throws.push({ t0, t, from, to: BASES[base], base });

        if (random() < 0.02 + 0.06 * (1 - fielder.p.fld) ** 2) {
            // Booted. Everybody is safe and moves up one.
            g.E[ctx.d]++;
            credit(g, ft, fielder.p.id, 'e');
            play.field.fumble = true;
            const list = [3, 2, 1].filter(i => before[i - 1]).map(i => go({ id: before[i - 1], from: i }));
            list.push({ id: batter.id, from: 0, to: 1, t0: 0.85, t: tb });
            return done(list, 'E', { error: true }, { rbi: false, earned: false });
        }
        // The men who need not run. With two out everybody goes on contact; otherwise one on third comes
        // home if the infield is back, and one on second goes over on a ball to the right side.
        const loose = [on3 && !(on1 && on2) ? { id: on3, from: 3 } : null, on2 && !on1 ? { id: on2, from: 2 } : null].filter(Boolean);
        const home = outs < 2 && Math.hypot(got.at[0], got.at[1]) > 118;
        const free = loose.filter(m => outs === 2 || (m.from === 3 ? home : got.at[0] > 10 && (!loose.some(o => o.from === 3) || home))).map(go);

        if (on1 && peg(2) < jump(on1) - 0.05 && (outs < 2 || peg(2) < peg(1))) {
            // The force at second, and with fewer than two out the relay to first.
            toss(2);
            const others = forced.filter(m => m.from !== 1).map(go), relay = peg(2) + 0.4 + throwTime(127.28, 0.6), two = outs < 2 && relay < tb;
            if (outs < 2) toss(1, BASES[2], peg(2) + 0.4, relay);
            const list = [...free, ...others, { id: on1, from: 1, to: 2, t0: 0.2, t: peg(2), out: true }, { id: batter.id, from: 0, to: 1, t0: 0.85, t: two ? relay : tb, out: two }];
            if (two) credit(g, bt, batter.id, 'gdp');
            return done(list.sort((p, q) => q.from - p.from), two ? 'DP' : 'FC', {}, { rbi: !two, force: true });
        }
        toss(1);
        const safe = peg(1) >= tb, list = [...free, ...forced.map(go), { id: batter.id, from: 0, to: 1, t0: 0.85, t: safe ? tb : peg(1), out: !safe }];
        if (safe) {
            credit(g, bt, batter.id, 'h');
            credit(g, ft, pitcher.id, 'ha');
            g.H[ctx.b]++;
        }
        return done(list.sort((p, q) => q.from - p.from), safe ? '1B' : 'GO', safe ? { hit: 1, infield: true } : {}, { force: !safe });
    }

    // Play a whole game, or what is left of one.
    function playOut(game, teams, random, each) {
        let play;
        while ((play = pitch(game, teams, random))) each?.(play);
        return game;
    }

    return { POS, SPOTS, BASES, PITCHES, clamp, gauss, bump, find, edgeAt, wallHeight, bearingOf, inPlay, flight, ballAt, defence, reach, startGame, pitch, playOut, stamina, feetPerSecond };
})();
