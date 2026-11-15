// Sumo Championship's rules (SPEC §10.35), with no drawing in them: who
// the wrestlers are, how a bout goes, and how a tournament ranks them.
// Pure and seeded (every function that rolls dice takes `random`), so the
// unit test can hold fifteen days in a few milliseconds.
//
//   The wrestlers   sixteen in the top division, each with strength,
//                   balance, agility and aggression (0 to 1), a weight, an
//                   age, and an invented ring name. No real wrestler,
//                   stable or place is named anywhere.
//   A bout          two bodies along the ring's east-west line (x; the
//                   straw bales are at ±1). They meet, and from then on
//                   move as a pair, pushed by the difference of their
//                   drives. Each keeps his `poise`: thrusts, a fast
//                   retreat and failed tricks spend it, and at zero he
//                   goes down. Every half second or so each picks a move
//                   by its worth to him just then. The winning technique
//                   is named from how it actually ended.
//   A tournament    fifteen days; sixteen wrestlers meet each other once,
//                   the best-ranked pairs last. Most wins takes the cup,
//                   after a playoff if it's shared. Then the ranking sheet
//                   is rewritten: winning records climb, losing ones
//                   fall, two go down to the second division and two come
//                   up, the old retire, and two cups in a row make a
//                   grand champion.

const SumoLogic = (() => {
    'use strict';

    const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
    const pick = (list, random) => list[Math.floor(random() * list.length)];

    const SIZE = 16, DAYS = 15, STEP = 1 / 60;
    const EDGE = 1;                 // the bales, from the centre
    const GAP = 0.46;               // chest to chest: how far apart the two centres are
    // Ring names, built as real ones are (a word, sometimes の, an ending),
    // from words no stable would choose: [kanji, reading, romaji, meaning].
    const FIRST = [['団子', 'だんご', 'Dango', 'Dumpling'], ['大福', 'だいふく', 'Daifuku', 'Sweet Bun'], ['餅', 'もち', 'Mochi', 'Rice Cake'], ['豆腐', 'とうふ', 'Tofu', 'Tofu'],
        ['大根', 'だいこん', 'Daikon', 'Radish'], ['蕪', 'かぶ', 'Kabu', 'Turnip'], ['柿', 'かき', 'Kaki', 'Persimmon'], ['蕎麦', 'そば', 'Soba', 'Noodle'],
        ['茶釜', 'ちゃがま', 'Chagama', 'Kettle'], ['提灯', 'ちょうちん', 'Chochin', 'Lantern'], ['狸', 'たぬき', 'Tanuki', 'Raccoon Dog'], ['鯰', 'なまず', 'Namazu', 'Catfish'],
        ['河馬', 'かば', 'Kaba', 'Hippo'], ['海象', 'せいうち', 'Seiuchi', 'Walrus'], ['雪崩', 'なだれ', 'Nadare', 'Avalanche'], ['月見', 'つきみ', 'Tsukimi', 'Moon-Gazing'],
        ['朝寝', 'あさね', 'Asane', 'Lie-In'], ['昼寝', 'ひるね', 'Hirune', 'Afternoon Nap'], ['饅頭', 'まんじゅう', 'Manju', 'Steamed Bun'], ['昆布', 'こんぶ', 'Konbu', 'Kelp'],
        ['沢庵', 'たくあん', 'Takuan', 'Pickle'], ['鰹', 'かつお', 'Katsuo', 'Bonito'], ['蛸', 'たこ', 'Tako', 'Octopus'], ['河童', 'かっぱ', 'Kappa', 'River Imp'],
        ['猫', 'ねこ', 'Neko', 'Cat'], ['布団', 'ふとん', 'Futon', 'Futon'], ['風呂', 'ふろ', 'Furo', 'Hot Bath'], ['茸', 'きのこ', 'Kinoko', 'Mushroom'],
        ['南瓜', 'かぼちゃ', 'Kabocha', 'Pumpkin'], ['樽', 'たる', 'Taru', 'Barrel'], ['鐘', 'かね', 'Kane', 'Bell'], ['金魚', 'きんぎょ', 'Kingyo', 'Goldfish']];
    const SECOND = [['山', 'やま', 'yama', 'Mountain'], ['海', 'うみ', 'umi', 'Sea'], ['龍', 'りゅう', 'ryu', 'Dragon'], ['川', 'がわ', 'gawa', 'River'], ['花', 'はな', 'hana', 'Blossom'],
        ['風', 'かぜ', 'kaze', 'Wind'], ['錦', 'にしき', 'nishiki', 'Brocade'], ['岳', 'だけ', 'dake', 'Peak'], ['波', 'なみ', 'nami', 'Wave'], ['嶋', 'しま', 'shima', 'Island'],
        ['丸', 'まる', 'maru', 'the Stout'], ['里', 'さと', 'sato', 'Village'], ['桜', 'ざくら', 'zakura', 'Cherry'], ['鵬', 'ほう', 'ho', 'Great Bird'], ['峰', 'みね', 'mine', 'Summit'],
        ['国', 'くに', 'kuni', 'Province']];
    const STABLES = [['梅ヶ枝', 'Umegae'], ['鉄瓶', 'Tetsubin'], ['九鶴', 'Kyukaku'], ['老松', 'Oimatsu'], ['朝霧', 'Asagiri'], ['赤提灯', 'Akachochin'], ['臥龍', 'Garyu'], ['千段', 'Sendan']];
    // The six tournaments of a year, by their months and seasons (never by a city).
    const SEASONS = [['初場所', 'New Year Tournament'], ['春場所', 'Spring Tournament'], ['夏場所', 'Summer Tournament'], ['七月場所', 'Midsummer Tournament'], ['秋場所', 'Autumn Tournament'], ['十一月場所', 'Winter Tournament']];
    // The winning techniques: as written, and what each means.
    const KIMARITE = {
        yorikiri: ['寄り切り', 'frontal force-out'], oshidashi: ['押し出し', 'frontal push-out'], tsukidashi: ['突き出し', 'frontal thrust-out'], okuridashi: ['送り出し', 'rear push-out'],
        oshitaoshi: ['押し倒し', 'frontal push-down'], yoritaoshi: ['寄り倒し', 'frontal crush-out'], hatakikomi: ['叩き込み', 'slap-down'], tsukiotoshi: ['突き落とし', 'thrust-down'],
        uwatenage: ['上手投げ', 'overarm throw'], shitatenage: ['下手投げ', 'underarm throw'], utchari: ['うっちゃり', 'backward pivot throw'],
    };
    const DIGITS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    const numeral = n => (n >= 10 ? (n >= 20 ? DIGITS[Math.floor(n / 10)] : '') + '十' : '') + DIGITS[n % 10];

    // ---- Wrestlers ---------------------------------------------------------------

    function wrestler(world, random, promise = 0) {
        // No first word twice on a sheet, and no whole name twice in living memory.
        let first, second, joined, name;
        do {
            first = pick(FIRST, random); second = pick(SECOND, random); joined = random() < 0.3;
            name = first[0] + (joined ? 'の' : '') + second[0];
        } while (world.used.includes(name) || world.roster.some(w => w.first === first[0]));
        world.used.push(name);
        if (world.used.length > 200) world.used.shift();
        const roll = () => clamp(0.18 + random() * 0.64 + promise);
        const weight = clamp(0.2 + random() * 0.7);
        return {
            id: world.nextId++, name, first: first[0], kana: first[1] + (joined ? 'の' : '') + second[1], romaji: first[2] + (joined ? 'no' : '') + second[2],
            gloss: `${first[3]} ${second[3]}`, stable: pick(STABLES, random),
            // Big men are strong and slow; small men the other way about.
            str: clamp(roll() * 0.75 + weight * 0.25), bal: roll(), agi: clamp(roll() * 0.8 + (1 - weight) * 0.2), agg: clamp(0.15 + random() * 0.75),
            weight, age: Math.floor(random() * 8), peak: 14 + Math.floor(random() * 14),
            belt: Math.floor(random() * 10), skin: Math.floor(random() * 4),
            yokozuna: false, yusho: 0, wins: 0, losses: 0, streak: 0, best: 0, stars: 0, slump: 0,
        };
    }

    const rating = w => w.str * 0.34 + w.bal * 0.28 + w.agi * 0.24 + w.agg * 0.06 + w.weight * 0.08;

    function newWorld(random) {
        const world = { v: 1, nextId: 1, used: [], roster: [], basho: 0, day: 1, bout: 0, marks: {}, champions: [], news: [] };
        for (let i = 0; i < SIZE; i++) world.roster.push(wrestler(world, random));
        world.roster.sort((a, b) => rating(b) - rating(a));
        for (const w of world.roster) { w.age += 6; world.marks[w.id] = ''; }
        return world;
    }

    // What a place on the ranking sheet is called: as written, in short for a table, and in Roman letters.
    function title(world, index) {
        const w = world.roster[index], side = index % 2 ? 'West' : 'East';
        if (w.yokozuna) return { grade: 'Y', rank: '横綱', short: '横綱', romaji: 'Yokozuna', gloss: 'Grand Champion', side };
        const below = index - world.roster.filter(r => r.yokozuna).length;
        if (below < 2) return { grade: 'O', rank: '大関', short: '大関', romaji: 'Ozeki', gloss: 'Champion', side };
        if (below < 4) return { grade: 'S', rank: '関脇', short: '関脇', romaji: 'Sekiwake', gloss: 'Junior Champion', side };
        if (below < 6) return { grade: 'K', rank: '小結', short: '小結', romaji: 'Komusubi', gloss: 'Junior Champion, second grade', side };
        const n = Math.floor((below - 6) / 2) + 1;
        return { grade: 'M', rank: n === 1 ? '前頭筆頭' : `前頭${numeral(n)}枚目`, short: `前${numeral(n)}`, romaji: `Maegashira ${n}`, gloss: 'the rank and file', side };
    }

    const record = (world, id) => { const m = world.marks[id] || ''; const w = m.split('W').length - 1; return { w, l: m.length - w }; };
    const season = world => { const s = SEASONS[world.basho % SEASONS.length]; return { ja: s[0], en: s[1] }; };
    // The days: the first, the middle and the last have names of their own.
    const dayName = day => ({ ja: day === 1 ? '初日' : day === 8 ? '中日' : day >= DAYS ? '千秋楽' : `${numeral(day)}日目`, en: day >= DAYS ? 'Day 15, the last' : `Day ${day} of ${DAYS}` });

    // ---- The schedule ------------------------------------------------------------

    // Everyone meets everyone once (the circle method), as pairs of places on
    // the ranking sheet. The days are ordered so the top man meets his nearest
    // rivals last, and each day's card runs from the bottom of the sheet up.
    function schedule(n = SIZE) {
        const ring = Array.from({ length: n - 1 }, (_, i) => i + 1), days = [];
        for (let d = 0; d < n - 1; d++) {
            const order = [0, ...ring.slice(d), ...ring.slice(0, d)], card = [];
            for (let i = 0; i < n / 2; i++) { const a = order[i], b = order[n - 1 - i]; card.push(a < b ? [a, b] : [b, a]); }
            card.sort((p, q) => q[0] + q[1] - (p[0] + p[1]) || q[0] - p[0]);
            days.push(card);
        }
        const rival = card => card.find(p => p[0] === 0)[1];
        return days.sort((p, q) => rival(q) - rival(p));
    }

    // ---- A bout ------------------------------------------------------------------

    const side = (w, dir) => ({ w, dir, x: dir * 0.42, poise: 1, stamina: 1, move: 'charge', until: 0, think: 0, over: false, turned: 0, effort: 1, surge: 1, hits: [], cause: 'drive', mass: 0.75 + 0.5 * w.weight });

    // East starts on the left (dir -1: his own edge is at -1) and drives right.
    function boutStart(east, west, random) {
        return { t: 0, phase: 'charge', a: side(east, -1), b: side(west, 1), c: 0, v: 0, gap: 0.84, grip: 0, events: [], done: false, winner: null, loser: null, kimarite: null, henka: false, random };
    }

    const bit = (b, s) => (s === b.a ? 1 : 2);
    const say = (b, type, who, extra) => b.events.push({ t: b.t, type, who: who ? who.w.id : null, ...extra });

    function end(b, loser, kimarite, how) {
        const winner = loser === b.a ? b.b : b.a;
        Object.assign(b, { done: true, winner: winner.w, loser: loser.w, kimarite, how, phase: 'over' });
        say(b, how, loser, { kimarite });
    }

    // Knock some poise out of `s`; at zero he goes down, by whatever did it.
    function shake(b, s, amount, cause) {
        s.poise -= amount;
        s.cause = cause;
    }

    // What each move is worth to `s` right now.
    function choose(b, s, o) {
        const r = b.random, w = s.w, atEdge = s.dir * s.x > 0.7, losing = b.v * s.dir > 0.1, mine = b.grip & bit(b, s), any = b.grip !== 0;
        const worth = {
            push: 1,
            thrust: any ? 0 : 0.5 + w.agg * 0.9,
            grip: mine ? 0 : 0.45 + w.str * 0.6 - w.agg * 0.25,
            pull: (o.over ? 0.9 : 0.08) * (0.35 + w.agi) * (1.25 - w.agg * 0.5),
            throw: mine ? (0.3 + w.agi * 0.5 + (atEdge ? 1.1 : 0)) * (o.poise < 0.6 ? 1.6 : 1) : 0,
            sidestep: atEdge && losing ? 0.5 + w.agi * 1.3 : 0.02,
            brace: s.stamina < 0.35 || s.poise < 0.4 ? 1.1 : 0.08,
        };
        let total = 0;
        for (const k in worth) total += (worth[k] = Math.max(0, worth[k]) ** 2);
        let roll = r() * total, move = 'push';
        for (const k in worth) { roll -= worth[k]; if (roll <= 0) { move = k; break; } }
        s.move = move;
        s.over = false;
        s.surge = 0.8 + r() * 0.4;
        s.hits.length = 0;
        const quick = 1.15 - w.agi * 0.4;
        if (move === 'push') { s.effort = 1; s.until = b.t + (0.45 + r() * 0.5) * quick; } else if (move === 'thrust') {
            s.effort = 1.25; s.over = true; s.until = b.t + 0.66 * quick;
            s.hits.push(b.t + 0.16 * quick, b.t + 0.42 * quick);
        } else if (move === 'brace') { s.effort = 0.78; s.until = b.t + 0.6; } else { s.effort = 0.9; s.until = b.t + (move === 'grip' ? 0.38 : 0.42) * quick; }
        s.think = s.until;
        if (move !== 'push' && move !== 'brace') say(b, move, s);
    }

    // A move's windup is over: see whether it worked.
    function resolve(b, s, o) {
        const r = b.random, w = s.w, ow = o.w, atEdge = s.dir * s.x > 0.7;
        if (s.move === 'grip') {
            if (r() < clamp(0.45 + 0.4 * w.agi - 0.2 * ow.agi)) { b.grip |= bit(b, s); say(b, 'gripped', s); }
        } else if (s.move === 'pull') {
            const p = clamp(0.02 + (o.over ? 0.3 : 0.03) + 0.24 * w.agi - 0.3 * ow.bal + (1 - o.poise) * 0.3);
            b.grip = 0;
            if (r() < p) { shake(b, o, 0.45 + r() * 0.45, 'pull'); say(b, 'slapped', o); } else { shake(b, s, 0.18, 'drive'); b.v += s.dir * 0.45; say(b, 'missed', s); }
        } else if (s.move === 'throw') {
            const p = clamp(0.1 + 0.3 * (w.str + w.agi) / 2 - 0.36 * ow.bal + (1 - o.poise) * 0.42 + (atEdge ? 0.1 : 0));
            if (r() < p) { shake(b, o, 1.2, atEdge ? 'pivot' : r() < 0.5 ? 'over' : 'under'); say(b, 'thrown', o); } else { shake(b, s, 0.24, 'drive'); b.grip &= ~bit(b, s); say(b, 'missed', s); }
        } else if (s.move === 'sidestep') {
            const p = clamp(0.28 + 0.5 * w.agi + 0.2 * ow.agg - 0.3 * ow.bal);
            if (r() < p) {
                b.grip = 0;
                if (atEdge) { shake(b, o, 1.2, 'step'); say(b, 'dodged', s); } else swap(b, s, o);
            } else { shake(b, s, 0.3, 'drive'); say(b, 'missed', s); }
        }
        s.move = 'push';
        s.effort = 1;
        s.over = false;
    }

    // The two change ends: `s` has got round behind `o`, who needs a moment to turn.
    function swap(b, s, o) {
        s.dir = -s.dir;
        o.dir = -o.dir;
        o.turned = 0.9 + b.random() * 0.5;
        shake(b, o, 0.25, 'drive');
        b.v = 0;
        say(b, 'swapped', s);
    }

    // The charge: 0.42 s to close the gap, then the collision. One of them may not be there.
    function charge(b) {
        const { a, b: bb, random: r } = b;
        b.gap = Math.max(GAP, 0.84 - (0.84 - GAP) * (b.t / 0.42));
        if (b.t < 0.42) return;
        b.phase = 'fight';
        for (const [s, o] of [[a, bb], [bb, a]]) {
            // A sidestep at the charge is the weaker, nimbler man's trick.
            const odds = 0.004 + 0.04 * s.w.agi * (1 - s.w.agg) + clamp((rating(o.w) - rating(s.w)) * 0.25, 0, 0.04);
            if (r() < odds) {
                b.henka = true;
                say(b, 'henka', s);
                if (r() < clamp(0.3 + 0.45 * s.w.agi - 0.3 * o.w.bal)) {
                    shake(b, o, 0.7 + r() * 0.45, 'pull');
                    if (o.poise > 0) swap(b, s, o);
                } else { shake(b, s, 0.3, 'drive'); b.v = s.dir * 0.5; }
                return;
            }
        }
        const hit = s => s.mass * (0.6 + 0.6 * s.w.agg + 0.3 * s.w.str) * (0.8 + r() * 0.4);
        const ha = hit(a), hb = hit(bb);
        b.v = (ha - hb) * 0.42;
        shake(b, a, 0.07 * hb, 'drive');
        shake(b, bb, 0.07 * ha, 'drive');
        say(b, 'clash', null, { force: ha + hb });
    }

    function boutStep(b) {
        if (b.done) return b;
        const dt = STEP, { a, b: bb } = b;
        b.t += dt;
        if (b.phase === 'charge') charge(b);
        else {
            let net = 0;
            for (const [s, o] of [[a, bb], [bb, a]]) {
                if (s.turned > 0) s.turned -= dt;
                if (b.t >= s.think) {
                    if (s.move !== 'push' && s.move !== 'brace' && s.move !== 'thrust' && s.move !== 'charge') resolve(b, s, o);
                    if (o.poise > 0 && s.poise > 0) choose(b, s, o);
                }
                while (s.hits.length && b.t >= s.hits[0]) {
                    s.hits.shift();
                    shake(b, o, 0.05 * (0.6 + s.w.str) * (1.3 - o.w.bal * 0.6), 'thrust');
                    b.v -= s.dir * 0.1 * (0.6 + s.w.str) / o.mass;
                    say(b, 'hit', o);
                }
                // His drive, towards the other man. On the bales he digs in.
                const edge = s.dir * s.x > 0.84, tired = 0.5 + 0.5 * s.stamina, late = b.t > 40 ? 0.6 : 1;
                const f = (0.55 + 0.9 * s.w.str) * s.effort * s.surge * tired * late * (b.grip & bit(b, s) ? 1.12 : 1) * (s.turned > 0 ? 0.3 : 1) * (edge ? 1.3 : 1);
                net -= s.dir * f;
                s.stamina = clamp(s.stamina - dt * (0.03 + 0.035 * s.w.weight) * s.effort + (s.move === 'brace' ? dt * 0.07 : 0));
                // Poise comes back standing firm, and goes when driven back or teetering on the straw.
                const back = b.v * s.dir;
                s.poise = Math.min(1, s.poise + dt * (0.08 + 0.14 * s.w.bal) * (s.move === 'brace' ? 2.4 : 1) * (b.t > 40 ? 0 : 1) * (b.grip ? 1.4 : 1));
                if (back > 0.3) shake(b, s, (back - 0.3) * 0.3 * dt * (1.3 - s.w.bal), 'drive');
                if (edge) shake(b, s, 0.1 * dt, 'drive');
                if (b.t > 40) shake(b, s, 0.05 * dt, 'drive');
            }
            b.v += (net / (a.mass + bb.mass) * 3.4 - 2.6 * b.v) * dt;
            b.c += b.v * dt;
            b.gap = GAP;
        }
        a.x = b.c + a.dir * b.gap / 2;
        bb.x = b.c + bb.dir * b.gap / 2;
        if (b.phase !== 'fight') return b;
        // Down, or out?
        for (const [s, o] of [[a, bb], [bb, a]]) {
            if (s.poise <= 0) {
                const gripped = b.grip & bit(b, o);
                const name = { pull: 'hatakikomi', over: 'uwatenage', under: 'shitatenage', pivot: 'utchari', step: 'tsukiotoshi', thrust: 'oshitaoshi' }[s.cause] || (gripped ? 'yoritaoshi' : 'oshitaoshi');
                return end(b, s, name, 'down'), b;
            }
        }
        for (const [s, o] of [[a, bb], [bb, a]]) {
            if (s.dir * s.x > EDGE) {
                const name = s.turned > 0 ? 'okuridashi' : b.grip & bit(b, o) ? 'yorikiri' : o.move === 'thrust' ? 'tsukidashi' : 'oshidashi';
                return end(b, s, name, 'out'), b;
            }
        }
        return b;
    }

    // A whole bout at once, for the tests and for a day skipped.
    function boutRun(east, west, random) {
        const b = boutStart(east, west, random);
        while (!b.done && b.t < 120) boutStep(b);
        if (!b.done) end(b, b.c > 0 ? b.b : b.a, 'yorikiri', 'out');
        return b;
    }

    // ---- The tournament ------------------------------------------------------------

    // Today's next pair, as wrestlers (east first): the better-ranked man is given the east.
    function nextBout(world) {
        if (world.playoff) return world.playoff.length >= 2 ? { east: byId(world, world.playoff[0]), west: byId(world, world.playoff[1]), playoff: true, last: world.playoff.length === 2 } : null;
        if (world.day > DAYS) return null;
        const card = schedule()[world.day - 1], pair = card[world.bout];
        return { east: world.roster[pair[0]], west: world.roster[pair[1]], index: world.bout, of: card.length, last: world.bout === card.length - 1 };
    }

    const byId = (world, id) => world.roster.find(w => w.id === id);
    const indexOf = (world, id) => world.roster.findIndex(w => w.id === id);

    // Write a result down. Returns what the announcer might remark on.
    function result(world, winner, loser) {
        const notes = [];
        winner.wins++; loser.losses++;
        winner.streak++; loser.streak = 0;
        winner.best = Math.max(winner.best, winner.streak);
        if (world.playoff) {
            world.playoff = world.playoff.filter(id => id !== loser.id);
            if (world.playoff.length === 1) world.champion = winner.id;
            return notes;
        }
        world.marks[winner.id] += 'W';
        world.marks[loser.id] += 'L';
        if (loser.yokozuna && !winner.yokozuna && title(world, indexOf(world, winner.id)).grade === 'M') { winner.stars++; notes.push({ type: 'star', who: winner }); }
        if (winner.streak >= 8 && winner.streak % 2 === 0) notes.push({ type: 'streak', who: winner, n: winner.streak });
        const rec = record(world, winner.id), lost = record(world, loser.id);
        if (rec.w === 8) notes.push({ type: 'winning', who: winner });
        if (lost.l === 8) notes.push({ type: 'losing', who: loser });
        world.bout++;
        if (world.bout >= SIZE / 2) {
            world.bout = 0;
            world.day++;
            if (world.day > DAYS) {
                const best = Math.max(...world.roster.map(w => record(world, w.id).w)), tied = world.roster.filter(w => record(world, w.id).w === best);
                if (tied.length === 1) world.champion = tied[0].id;
                else world.playoff = tied.map(w => w.id);
            }
        }
        return notes;
    }

    // The table: most wins first, the ranking sheet breaking ties.
    function standings(world) {
        return world.roster.map((w, index) => { const r = record(world, w.id); return { wrestler: w, index, wins: r.w, losses: r.l, title: title(world, index) }; }).sort((p, q) => q.wins - p.wins || p.index - q.index);
    }

    // After the cup: a new ranking sheet. Returns the news (and keeps it on the world).
    function nextBasho(world, random) {
        const news = [], champ = byId(world, world.champion), wins = new Map(world.roster.map(w => [w.id, record(world, w.id).w]));
        champ.yusho++;
        world.champions.unshift({ basho: world.basho, name: champ.name, romaji: champ.romaji, wins: wins.get(champ.id) });
        world.champions.length = Math.min(world.champions.length, 12);
        news.push({ type: 'champion', name: champ.name, romaji: champ.romaji, wins: wins.get(champ.id), yusho: champ.yusho });
        // Two cups running make a grand champion.
        if (!champ.yokozuna && world.lastChampion === champ.id) { champ.yokozuna = true; news.push({ type: 'yokozuna', name: champ.name, romaji: champ.romaji }); }
        world.lastChampion = champ.id;
        const before = new Map(world.roster.map((w, i) => [w.id, title(world, i)]));
        const order = new Map(world.roster.map((w, i) => [w.id, i - (wins.get(w.id) - 7.5) * 1.15]));
        // Time passes: the young improve, the old fade, and some go.
        const leaving = [];
        for (const w of world.roster) {
            w.age++;
            const drift = w.age < w.peak ? 0.012 : -0.016;
            for (const k of ['str', 'bal', 'agi']) w[k] = clamp(w[k] + drift + (random() - 0.5) * 0.03, 0.05, 0.98);
            w.slump = wins.get(w.id) < 8 ? w.slump + 1 : 0;
            if ((w.yokozuna && w.slump >= 2) || (w.age > w.peak + 10 && w.slump >= 1)) leaving.push(w);
        }
        for (const w of leaving.slice(0, 2)) news.push({ type: 'retired', name: w.name, romaji: w.romaji, yusho: w.yusho, wins: w.wins });
        const gone = new Set(leaving.slice(0, 2).map(w => w.id));
        let roster = world.roster.filter(w => !gone.has(w.id));
        roster.sort((p, q) => (q.yokozuna - p.yokozuna) || order.get(p.id) - order.get(q.id));
        // Down to the second division: the last on the new sheet with losing records, to make two changes in all.
        for (let i = roster.length - 1; i >= 0 && gone.size < 2; i--) {
            const w = roster[i];
            if (!w.yokozuna && wins.get(w.id) < 8) { gone.add(w.id); news.push({ type: 'demoted', name: w.name, romaji: w.romaji }); }
        }
        roster = roster.filter(w => !gone.has(w.id));
        world.roster = roster;
        while (world.roster.length < SIZE) {
            const rookie = wrestler(world, random, random() < 0.25 ? 0.14 : 0.02);
            world.roster.push(rookie);
            news.push({ type: 'rookie', name: rookie.name, romaji: rookie.romaji, stable: rookie.stable });
        }
        world.roster.forEach((w, i) => {
            const was = before.get(w.id), now = title(world, i), grade = t => 'YOSKM'.indexOf(t.grade);
            if (was && !w.yokozuna && grade(now) < grade(was)) news.push({ type: 'promoted', name: w.name, romaji: w.romaji, to: now.rank, toRomaji: now.romaji });
            if (was && grade(now) > grade(was)) news.push({ type: 'dropped', name: w.name, romaji: w.romaji, to: now.rank, toRomaji: now.romaji });
        });
        world.basho++;
        world.day = 1;
        world.bout = 0;
        world.marks = Object.fromEntries(world.roster.map(w => [w.id, '']));
        delete world.playoff;
        delete world.champion;
        world.news = news;
        return news;
    }

    return { SIZE, DAYS, STEP, EDGE, GAP, KIMARITE, SEASONS, clamp, numeral, newWorld, rating, title, record, season, dayName, schedule, boutStart, boutStep, boutRun, nextBout, result, standings, nextBasho, byId, indexOf };
})();
