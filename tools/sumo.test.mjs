// Sumo Championship (SPEC §10.35): the rules, without a browser. The ring
// names are built as real ones are, from words no stable would choose, and
// never repeat; everyone meets everyone once; a
// bout always ends, the better man usually wins and the technique is
// named; and tournament after tournament the ranking sheet stays whole.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DIR = resolve(import.meta.dirname, '../web/wallpapers/sumo');
const sources = Object.fromEntries(['sumo-logic.js', 'sumo-art.js', 'sumo.js'].map(name => [name, readFileSync(join(DIR, name), 'utf8')]));
const L = new Function(`${sources['sumo-logic.js']}; return SumoLogic;`)();
const seeded = seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;

// Play whatever is left of a tournament, to the cup.
function play(world, random) {
    let bouts = 0, card;
    while ((card = L.nextBout(world))) {
        const bout = L.boutRun(card.east, card.west, random);
        L.result(world, bout.winner, bout.loser);
        bouts++;
    }
    return bouts;
}

test('wrestlers: sixteen, ranked by their worth, each name written, read and romanised, no first word twice', () => {
    const world = L.newWorld(seeded(7));
    assert.equal(world.roster.length, L.SIZE);
    assert.equal(new Set(world.roster.map(w => w.first)).size, L.SIZE, world.roster.map(w => w.name).join(' '));
    for (const w of world.roster) {
        assert.match(w.name, /^[\u4e00-\u9fff]+の?[\u4e00-\u9fff]+$/, `${w.name} is written in kanji, with の at most`);
        assert.match(w.kana, /^[\u3040-\u309f]+$/, `${w.kana} is its reading, in hiragana`);
        assert.match(w.romaji, /^[A-Z][a-z]+$/, w.romaji);
        assert.equal(w.name.includes('の'), w.kana.length > 0 && w.romaji.includes('no') && w.kana.includes('の') && w.name.includes('の'));
        assert.ok(w.gloss.length > 3 && w.stable.length === 2);
    }
    for (let i = 1; i < L.SIZE; i++) assert.ok(L.rating(world.roster[i - 1]) >= L.rating(world.roster[i]));
    for (const w of world.roster) for (const k of ['str', 'bal', 'agi', 'agg', 'weight']) assert.ok(w[k] >= 0 && w[k] <= 1, `${w.name} ${k} ${w[k]}`);
    assert.deepEqual(world.roster.slice(0, 7).map((w, i) => L.title(world, i).rank), ['大関', '大関', '関脇', '関脇', '小結', '小結', '前頭筆頭']);
    assert.deepEqual([L.title(world, 15).rank, L.title(world, 15).short, L.title(world, 15).romaji, L.title(world, 15).grade], ['前頭五枚目', '前五', 'Maegashira 5', 'M']);
    assert.deepEqual([1, 8, 10, 14, 15].map(d => L.dayName(d).ja), ['初日', '中日', '十日目', '十四日目', '千秋楽']);
    assert.deepEqual([L.numeral(3), L.numeral(12), L.numeral(20)], ['三', '十二', '二十']);
    assert.deepEqual(L.season(world), { ja: '初場所', en: 'New Year Tournament' });
    assert.deepEqual(JSON.parse(JSON.stringify(world)), world, 'the league is plain data');
});

test('schedule: fifteen days, everyone meets everyone once, the top two on the last day', () => {
    const days = L.schedule();
    assert.equal(days.length, L.DAYS);
    const met = new Set();
    for (const card of days) {
        assert.equal(card.length, L.SIZE / 2);
        assert.equal(new Set(card.flat()).size, L.SIZE, 'everyone fights once a day');
        for (const [a, b] of card) { assert.ok(a < b); met.add(`${a}-${b}`); }
    }
    assert.equal(met.size, (L.SIZE * (L.SIZE - 1)) / 2);
    assert.deepEqual(days[14].at(-1), [0, 1], 'the last bout of the last day');
    for (const card of days) assert.equal(card.at(-1)[0] + card.at(-1)[1], Math.min(...card.map(p => p[0] + p[1])), 'the best-ranked pair fights last each day');
});

test('a bout: it ends, someone is out or down, and the technique fits', () => {
    const random = seeded(11), world = L.newWorld(random), seen = {};
    let longest = 0;
    for (let i = 0; i < 1500; i++) {
        const a = world.roster[i % L.SIZE], b = world.roster[(i * 7 + 3) % L.SIZE];
        if (a === b) continue;
        const bout = L.boutRun(a, b, random);
        assert.ok(bout.done && bout.t < 60, `${a.name} v ${b.name} took ${bout.t}`);
        assert.ok(bout.winner !== bout.loser && [a, b].includes(bout.winner) && [a, b].includes(bout.loser));
        assert.equal(L.KIMARITE[bout.kimarite]?.length, 2, bout.kimarite);
        const loser = bout.a.w === bout.loser ? bout.a : bout.b;
        if (bout.how === 'out') assert.ok(loser.dir * loser.x > L.EDGE, 'the loser is over the straw');
        else assert.ok(loser.poise <= 0, 'the loser went down');
        seen[bout.kimarite] = (seen[bout.kimarite] || 0) + 1;
        longest = Math.max(longest, bout.t);
    }
    assert.ok(Object.keys(seen).length >= 8, `only ${Object.keys(seen).join(', ')}`);
    const outs = ['yorikiri', 'oshidashi', 'tsukidashi', 'okuridashi'].reduce((n, k) => n + (seen[k] || 0), 0);
    assert.ok(outs > 300, `only ${outs} bouts ended over the straw`);
    assert.ok(longest > 12, 'some bouts are long');
});

test('a bout: the better man usually wins, never always; the same dice give the same bout', () => {
    const random = seeded(5), world = L.newWorld(random), top = world.roster[0], bottom = world.roster[15];
    let wins = 0;
    for (let i = 0; i < 600; i++) if (L.boutRun(i % 2 ? top : bottom, i % 2 ? bottom : top, random).winner === top) wins++;
    assert.ok(wins > 600 * 0.6 && wins < 600 * 0.96, `the top man won ${wins} of 600`);
    const one = L.boutRun(top, bottom, seeded(99)), two = L.boutRun(top, bottom, seeded(99));
    assert.equal(one.t, two.t);
    assert.equal(one.kimarite, two.kimarite);
});

test('a tournament: 120 bouts, a champion with the most wins, then a whole new sheet', () => {
    const random = seeded(3), world = L.newWorld(random);
    let yokozuna = 0, retired = 0;
    for (let basho = 0; basho < 30; basho++) {
        const bouts = play(world, random);
        assert.ok(bouts >= 120 && bouts < 130, `${bouts} bouts`);
        const table = L.standings(world), champ = L.byId(world, world.champion);
        assert.equal(table[0].wins, L.record(world, champ.id).w, 'the champion has the most wins');
        for (const row of table) assert.equal(row.wins + row.losses, L.DAYS);
        const before = new Set(world.roster.map(w => w.id));
        const news = L.nextBasho(world, random);
        assert.equal(world.roster.length, L.SIZE);
        assert.equal(new Set(world.roster.map(w => w.id)).size, L.SIZE);
        assert.equal(new Set(world.roster.map(w => w.name)).size, L.SIZE);
        const rookies = news.filter(n => n.type === 'rookie').length, gone = [...before].filter(id => !world.roster.some(w => w.id === id)).length;
        assert.equal(rookies, 2, 'two come up');
        assert.equal(gone, 2, 'two go');
        assert.equal(world.basho, basho + 1);
        assert.equal(world.day, 1);
        assert.ok(Object.values(world.marks).every(m => m === ''));
        assert.equal(news[0].type, 'champion');
        // Grand champions sit at the top of the sheet, whatever they did.
        const ranks = world.roster.map(w => w.yokozuna);
        assert.deepEqual(ranks, [...ranks].sort((a, b) => b - a));
        yokozuna += news.filter(n => n.type === 'yokozuna').length;
        retired += news.filter(n => n.type === 'retired').length;
        assert.deepEqual(JSON.parse(JSON.stringify(world)), world);
    }
    assert.ok(yokozuna >= 1, 'somebody won two cups running in thirty tournaments');
    assert.ok(retired >= 3, `${retired} retirements in thirty tournaments`);
    assert.equal(world.champions.length, 12, 'the last twelve champions are remembered');
});

test('a tournament: a saved league carries on exactly where it stopped', () => {
    const world = L.newWorld(seeded(21)), dice = seeded(8);
    for (let i = 0; i < 37; i++) { const card = L.nextBout(world), bout = L.boutRun(card.east, card.west, dice); L.result(world, bout.winner, bout.loser); }
    const copy = JSON.parse(JSON.stringify(world));
    assert.equal(copy.day, 5);
    assert.equal(copy.bout, 5);
    const a = L.nextBout(world), b = L.nextBout(copy);
    assert.equal(a.east.name, b.east.name);
    assert.equal(a.west.name, b.west.name);
    play(world, seeded(4));
    play(copy, seeded(4));
    assert.equal(world.champion, copy.champion);
});

test('cheap and clean: no per-frame pixel reads, blurs, clocks, storage or real names of its own', () => {
    // One pixel read, once, at the start: can this device write Japanese?
    assert.equal(sources['sumo-art.js'].split('getImageData').length - 1, 1);
    assert.ok(/function hasKanji\(\)[^]*?getImageData/.test(sources['sumo-art.js']));
    for (const [name, source] of Object.entries(sources)) {
        assert.ok(!/putImageData|shadowBlur|\.filter\s*=/.test(source) && (name === 'sumo-art.js' || !/getImageData/.test(source)), `${name}: a per-pixel or blur call`);
        assert.ok(!/new Date\(|Date\.now\(/.test(source), `${name}: reads the clock itself (use host.now())`);
        assert.ok(!/localStorage|sessionStorage/.test(source), `${name}: touches storage itself`);
        assert.ok(!/setInterval|setTimeout/.test(source), `${name}: a timer of its own`);
        assert.ok(!/https?:\/\//.test(source), `${name}: a URL`);
    }
    assert.ok(!/Math\.random/.test(sources['sumo-logic.js']), 'the rules take their dice as an argument');
});
