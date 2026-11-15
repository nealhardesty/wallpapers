// The Never-Ending Baseball Season's league (SPEC §10.37): who plays, in
// what parks, on what days, and what becomes of them. Pure and seeded like
// the game itself (baseball-logic.js, which this drives).
//
//   The league    eight clubs from towns that do not exist, named after
//                 things no club would be named after. Thirteen men each:
//                 eight in the field, three starting pitchers who take
//                 turns, two relievers. Every park has a quirk.
//   A season      twenty-one days (everyone meets everyone three times),
//                 four games a day. One is the game on screen, played a
//                 pitch at a time as it is watched; the other three are
//                 played out by the same rules the moment the day begins,
//                 and reported as the out-of-town scores.
//   The series    the top two play a best-of-five for the Golden Gravy
//                 Boat. Then the winter: everyone is a year older, the
//                 young improve and the old fade, some retire and rookies
//                 take their places, and it all begins again.
//   Nicknames     are earned. A man who strikes out too much becomes the
//                 Ceiling Fan; one who ends a game with a home run becomes
//                 Mr. Bedtime. Each belongs to one man at a time, and a
//                 better story replaces a lesser one.
//
// The whole league is one plain object (`world`), saved as it is.

const BaseballLeague = (() => {
    'use strict';
    const L = BaseballLogic, { clamp, gauss, find } = L;
    const pick = (list, random) => list[Math.floor(random() * list.length)];
    const shuffle = (list, random) => { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

    const TEAMS = 8, ROUNDS = 3, DAYS = (TEAMS - 1) * ROUNDS, SERIES = 3;      // three wins take the series
    const TROPHY = 'THE GOLDEN GRAVY BOAT';

    // None of these places exist, and no club is called any of these things.
    const TOWNS = ['Port Biscuit', 'Fort Mildew', 'Lake Regret', 'Mount Pudding', 'East Turnip', 'Lower Mumbling', 'Saint Gusto', 'New Flannel', 'Dripping Hollow', 'Yonder Falls',
        'Thimbleton', 'Crumpet Bay', 'Great Sneezing', 'Pickle Junction', 'Noodle Flats', 'Upper Gravy', 'Mopwater', 'Cape Hiccup', 'Old Sock', 'Little Dithering', 'Glum Harbour', 'West Marmalade'];
    const CLUBS = [['Clams', 'CLM'], ['Lawnmowers', 'LAW'], ['Thunder Geese', 'GSE'], ['Sock Puppets', 'SOX'], ['Librarians', 'LIB'], ['Turnips', 'TUR'], ['Mild Salsa', 'SAL'], ['Possums', 'POS'],
        ['Accordions', 'ACC'], ['Wet Cats', 'CAT'], ['Garden Gnomes', 'GNO'], ['Moths', 'MTH'], ['Barnacles', 'BAR'], ['Dust Bunnies', 'BUN'], ['Tax Collectors', 'TAX'], ['Left Shoes', 'SHU'],
        ['Spatulas', 'SPA'], ['Pigeons', 'PGN'], ['Sleepwalkers', 'ZZZ'], ['Fog', 'FOG'], ['Umbrellas', 'UMB'], ['Night Custard', 'CUS'], ['Loose Change', 'CHG'], ['Marmots', 'MAR']];
    const LEAGUES = ['THE GREATER GRAVY LEAGUE', 'THE TRI-COUNTY BISCUIT LEAGUE', 'THE THURSDAY LEAGUE', 'THE GRAND DAMP LEAGUE', 'THE UPPER PUDDLE LEAGUE', 'THE OLD MUSTARD LEAGUE'];
    // Cap and shirt, and the trim on it.
    const COLOURS = [['#c8343a', '#f4e9c8'], ['#2a5fb0', '#f2d24a'], ['#1f7a4c', '#f4e9c8'], ['#e07a1f', '#2a2a38'], ['#6b3fa0', '#f2d24a'], ['#1c8f9c', '#f4e9c8'], ['#2a2a38', '#e8b23a'],
        ['#a8324e', '#9ad0e8'], ['#7a5230', '#f2d24a'], ['#d8527a', '#2a2a38'], ['#3f8fd0', '#f4e9c8'], ['#8a9a2a', '#2a2a38']];
    const FIRST = ['Barnaby', 'Otis', 'Chester', 'Mortimer', 'Wendell', 'Gus', 'Rufus', 'Hiram', 'Cornelius', 'Dewey', 'Elmer', 'Floyd', 'Hank', 'Ignatius', 'Jasper', 'Lester', 'Milo', 'Norbert',
        'Oswald', 'Percy', 'Quincy', 'Roscoe', 'Silas', 'Thaddeus', 'Ulysses', 'Virgil', 'Waldo', 'Zeke', 'Amos', 'Bertram', 'Clyde', 'Dudley', 'Ernie', 'Fergus', 'Gil', 'Homer', 'Ike', 'Jethro',
        'Lloyd', 'Marvin', 'Ned', 'Orville', 'Pip', 'Rollo', 'Stan', 'Tobias', 'Vern', 'Wilbur', 'Archie', 'Buck', 'Cecil', 'Duke', 'Enzo', 'Felix', 'Hugo', 'Kip', 'Leo', 'Moe', 'Nico', 'Sal'];
    const LAST = ['Bellweather', 'Crumb', 'Pudding', 'Mumbleton', 'Flapjack', 'Noodleman', 'Honk', 'Gristle', 'Butterworth', 'Pickle', 'Snodgrass', 'Wobble', 'Dumpling', 'Fiddlesticks', 'Grumble',
        'Hasenpfeffer', 'Inkwell', 'Jellyby', 'Kettle', 'Lumpkin', 'Mackerel', 'Nettle', 'Oatcake', 'Pennywhistle', 'Quibble', 'Radish', 'Sprocket', 'Thistle', 'Underfoot', 'Vinegar', 'Waffle',
        'Yammer', 'Zwieback', 'Applecart', 'Bogwell', 'Cabbage', 'Doorknob', 'Eggleston', 'Fumble', 'Gander', 'Hiccup', 'Ironside', 'Jamjar', 'Kazoo', 'Ladle', 'Mothball', 'Nubbins', 'Overcoat',
        'Parsnip', 'Rhubarb', 'Scuttle', 'Teacake', 'Umlaut', 'Varnish', 'Wheelbarrow', 'Barnswallow', 'Custard', 'Dandelion', 'Elbow', 'Figgins', 'Gooseberry', 'Haddock', 'Molasses', 'Twine',
        'Biscotti', 'Crankshaft', 'Tumbleweed', 'Sourdough', 'Periwinkle', 'Bramble', 'Clatter', 'Gumption', 'Lozenge', 'Marzipan', 'Puddle', 'Skillet', 'Trombone', 'Whisk'];
    // A park: its walls (left, centre, right, feet), their heights, how the
    // ball carries, how quickly the turf slows a grounder, how much foul
    // ground, what lies beyond the fence and how the grass is cut.
    const PARKS = [
        { quirk: 'A SHORT PORCH IN RIGHT', lf: 336, cf: 404, rf: 297, wall: [8, 8, 9] },
        { quirk: 'A WALL IN LEFT YOU COULD HANG LAUNDRY ON', lf: 306, cf: 396, rf: 330, wall: [32, 10, 8] },
        { quirk: 'THE BIGGEST OUTFIELD IN THE LEAGUE', lf: 350, cf: 428, rf: 350, wall: [8, 8, 8] },
        { quirk: 'UP A HILL: THE BALL CARRIES', lf: 338, cf: 408, rf: 338, wall: [10, 10, 10], carry: 1.07 },
        { quirk: 'BUILT ON A BOG: GROUNDERS DIE', lf: 328, cf: 400, rf: 328, wall: [8, 8, 8], turf: 0.36, carry: 0.97 },
        { quirk: 'AN INFIELD LIKE A BILLIARD TABLE', lf: 330, cf: 402, rf: 330, wall: [8, 8, 8], turf: 0.13 },
        { quirk: 'A BANDBOX: HOLD ON TO YOUR HAT', lf: 314, cf: 386, rf: 314, wall: [9, 9, 9] },
        { quirk: 'ACRES OF FOUL GROUND', lf: 330, cf: 400, rf: 330, wall: [8, 8, 8], foul: 62 },
        { quirk: 'THE WIND COMES IN OFF THE WATER', lf: 326, cf: 398, rf: 326, wall: [8, 8, 8], carry: 0.93 },
        { quirk: 'A CENTRE FIELD THAT GOES ON FOR EVER', lf: 318, cf: 436, rf: 318, wall: [10, 18, 10] },
    ];
    const PARK_WORDS = [['Gravel', 'Kettle', 'Dampwood', 'Biscuit', 'Mumble', 'Turnip', 'Old Sock', 'Regret', 'Mustard', 'Puddle', 'Thimble', 'Cabbage', 'Lantern', 'Pigeon'], ['Field', 'Park', 'Yards', 'Grounds', 'Bowl', 'Stadium', 'Green']];
    const BEYOND = ['sea', 'hills', 'woods', 'works', 'town', 'farm', 'peaks', 'marsh'], MOW = ['stripes', 'checks', 'rings', 'fan'];
    const SIGNATURES = ['THE WOBBLER', 'THE GRAVY BOAT', 'THE TAX AUDIT', 'THE DISAPPOINTMENT', 'THE SLOW GOODBYE', 'MISTER SNAPPY', 'THE WET NOODLE', 'THE DOORBELL', 'THE LOBSTER', 'THE BAD NEWS', 'THE HICCUP',
        'THE LAST BISCUIT', 'THE TRAPDOOR', 'THE DINNER BELL', 'THE SOGGY SOCK', 'THE HAUNTED ONE', 'THE BUTTER KNIFE', 'THE LONG WEEKEND'];

    // How a nickname is earned: [key, how good a story it is (a better one
    // replaces a lesser), the test on a man's season (and the game just
    // played), the names]. Each name belongs to one man in the league at a time.
    const hitter = p => !p.mix;
    const NICKS = [
        ['fan', 1, (p, s) => hitter(p) && s.ab >= 28 && s.k / s.ab >= 0.36, ['The Ceiling Fan', 'Windmill', 'Breezy', 'Whiff', 'The Draught']],
        ['walks', 1, (p, s) => hitter(p) && s.ab >= 28 && s.bb / (s.ab + s.bb) >= 0.19, ['The Statue', 'Four Fingers', 'Free Pass', 'The Loiterer']],
        ['gdp', 1, (p, s) => s.gdp >= 4, ['Twofer', 'The Blanket', 'Rally Killer', 'Double Trouble']],
        ['caught', 1, (p, s) => s.cs >= 3 && s.cs > s.sb, ['Red Light', 'Molasses', 'The Hesitator']],
        ['boots', 1, (p, s) => s.e >= 4, ['Oven Mitts', 'The Colander', 'Butterfingers', 'Stone Hands', 'Soap']],
        ['plunked', 1, (p, s) => s.hbp >= 3, ['The Magnet', 'Pincushion', 'Bruise', 'The Target']],
        ['easy', 1, (p, s) => hitter(p) && s.ab >= 36 && s.h / s.ab < 0.15, ['Easy Out', 'Automatic', 'The Formality']],
        ['wild', 1, (p, s) => s.outs >= 30 && s.bba * 27 / s.outs > 5.5, ['The Sprinkler', 'Garden Hose', 'Ball Four', 'Scattershot']],
        ['gopher', 1, (p, s) => s.hra >= 7, ['Launchpad', 'Souvenirs', 'The Gift Shop']],
        ['shelled', 1, (p, s) => s.outs >= 45 && s.er * 27 / s.outs > 7, ['Batting Practice', 'The Pinata', 'Open Bar']],
        ['old', 1, p => p.age >= 39, ['Gramps', 'The Fossil', 'Sundial', 'Old Reliable']],
        ['power', 2, (p, s) => s.hr >= 6, ['Moonshot', 'Boom-Boom', 'Thunder', 'The Lumberyard', 'Big Fly', 'Kaboom']],
        ['speed', 2, (p, s) => s.sb >= 7, ['Wheels', 'Jackrabbit', 'The Pickpocket', 'Greased', 'Zoom']],
        ['average', 2, (p, s) => s.ab >= 40 && s.h / s.ab >= 0.36, ['Soup', 'The Professor', 'Laser', 'Butter', 'Line Drive']],
        ['streak', 2, p => p.streak >= 8, ['Hot Soup', 'The Metronome', 'Every Day', 'Clockwork']],
        ['triples', 2, (p, s) => s.t >= 3, ['Three Bags', 'The Gazelle', 'Legs']],
        ['driven', 2, (p, s) => s.rbi >= 20, ['The Butler', 'Room Service', 'The Postman', 'Delivery']],
        ['strikeouts', 2, (p, s) => s.ka >= 45, ['The Barber', 'Dr. Zero', 'Punchout', 'The Dentist']],
        ['saves', 2, (p, s) => s.sv >= 5, ['Lights Out', 'The Nightwatchman', 'Last Call', 'The Locksmith']],
        ['stingy', 2, (p, s) => s.outs >= 75 && s.er * 27 / s.outs < 2.3, ['The Padlock', 'Stingy', 'The Vault', 'Tightwad']],
        ['walkoff', 3, (p, s, g) => g.walkoff && g.hr, ['Mr. Bedtime', 'Curtains', 'Goodnight', 'The Last Word']],
        ['slam', 3, (p, s, g) => g.slam, ['Salami', 'Four Scoops', 'The Grand Piano']],
        ['three', 3, (p, s, g) => g.box.hr >= 3, ['Triple Thunder', 'The Fireworks']],
        ['cycle', 3, (p, s, g) => g.box.hr && g.box.t && g.box.d && g.box.h - g.box.hr - g.box.t - g.box.d > 0, ['The Bicycle', 'Full Menu']],
        ['five', 3, (p, s, g) => g.box.h >= 5, ['Five Alive', 'The Buffet']],
        ['nohit', 3, (p, s, g) => g.nohit, ['No-No', 'The Eraser', 'Zeroes']],
        ['fans', 3, (p, s, g) => g.box.ka >= 13, ['The Scissors', 'Thirteen']],
        ['twoway', 3, (p, s, g) => !hitter(p) && g.hr, ['Two-Way', 'The Slugging Arm', 'Swiss Army']],
    ];

    // ---- Making people ------------------------------------------------------------------

    const stat = (s, key) => s[key] || 0;
    const rate = (random, mid, spread = 0.17) => clamp(mid + spread * gauss(random), 0.04, 0.98);
    // What a position asks of a man: [contact, power, eye, speed, glove, arm].
    const SHAPE = { C: [-0.04, 0, 0, -0.18, 0.05, 0.14], '1B': [0, 0.12, 0.02, -0.14, -0.06, -0.08], '2B': [0.04, -0.08, 0.02, 0.06, 0.08, -0.04], '3B': [0, 0.06, 0, -0.04, 0.02, 0.1],
        SS: [0, -0.08, 0, 0.1, 0.14, 0.08], LF: [0.02, 0.08, 0, 0, -0.06, -0.06], CF: [0.02, -0.04, 0, 0.18, 0.12, 0], RF: [0, 0.1, 0, 0, -0.02, 0.12] };

    function person(world, random, pos, talent, rookie) {
        const taken = new Set(world.teams.flatMap(t => t.players.map(p => `${p.first} ${p.last}`)));
        let first, last;
        do { first = pick(FIRST, random); last = pick(LAST, random); } while (taken.has(`${first} ${last}`));
        const p = { id: world.nextId++, first, last, nick: '', pos, age: rookie ? 19 + Math.floor(random() * 5) : 20 + Math.floor(random() * 14), bats: random() < 0.34 ? 'L' : 'R', skin: Math.floor(random() * 4), s: {}, c: {}, streak: 0, dry: 0 };
        if (rookie) p.rk = 1;
        const mid = 0.5 + talent + (rookie ? -0.05 : 0);
        if (pos === 'SP' || pos === 'RP') {
            Object.assign(p, { con: rate(random, 0.2, 0.08), pow: rate(random, 0.14, 0.1), eye: rate(random, 0.25, 0.1), spd: rate(random, 0.35), fld: rate(random, 0.45), arm: rate(random, 0.6, 0.1),
                stuff: rate(random, mid + (pos === 'RP' ? 0.05 : 0)), ctl: rate(random, mid), sta: rate(random, 0.5), throws: random() < 0.28 ? 'L' : 'R' });
            const lead = random() < 0.07 ? 'KN' : random() < 0.25 ? 'SI' : 'FB', rest = shuffle(['SL', 'CU', 'CH', 'FK', 'SC', ...(random() < 0.15 ? ['EE'] : [])], random);
            p.mix = [lead, ...rest.slice(0, pos === 'SP' ? 2 + (random() < 0.4 ? 1 : 0) : 1)];
            if (random() < 0.4) p.sig = pick(SIGNATURES, random);       // what he calls his best pitch (the last in his repertoire)
        } else {
            const shape = SHAPE[pos];
            ['con', 'pow', 'eye', 'spd', 'fld', 'arm'].forEach((key, i) => { p[key] = rate(random, mid + shape[i]); });
        }
        return p;
    }

    // The order: a quick man who gets on, the best bats third and fourth, and so down.
    function batting(team) {
        const worth = p => p.con * 1.2 + p.pow + p.eye * 0.6, bats = team.players.filter(hitter).sort((p, q) => worth(q) - worth(p));
        const lead = bats.slice(2).sort((p, q) => (q.spd + q.eye + q.con) - (p.spd + p.eye + p.con))[0], rest = bats.filter(p => p !== lead);
        team.lineup = [lead, rest[2], rest[0], rest[1], ...rest.slice(3)].map(p => p.id);
    }

    function found(random, { days } = {}) {
        const world = { v: 1, name: pick(LEAGUES, random), season: 1, day: 0, stage: 'season', teams: [], nextId: 1, game: null, others: [], series: null, champs: [], wire: [], news: [] };
        const towns = shuffle(TOWNS, random), clubs = shuffle(CLUBS, random), colours = shuffle(COLOURS, random), parks = shuffle(PARKS, random), words = shuffle(PARK_WORDS[0], random);
        for (let i = 0; i < TEAMS; i++) {
            const park = { lf: 330, cf: 400, rf: 330, carry: 1, turf: 0.2, foul: 38, ...parks[i], wall: parks[i].wall.slice(), name: `${words[i]} ${pick(PARK_WORDS[1], random)}`, beyond: BEYOND[i], mow: MOW[i % MOW.length] };
            const team = { id: i, town: towns[i], name: clubs[i][0], abbr: clubs[i][1], colours: colours[i], park, players: [], lineup: [], turn: 0, w: 0, l: 0, rs: 0, ra: 0, run: 0, talent: 0.04 * gauss(random) };
            world.teams.push(team);
            for (const pos of [...L.POS.slice(1), 'SP', 'SP', 'SP', 'RP', 'RP']) team.players.push(person(world, random, pos, team.talent, false));
            batting(team);
        }
        // A league is founded with its first season already under way.
        const played = days ?? 4 + Math.floor(random() * 5);
        for (let i = 0; i < played; i++) { openDay(world, random, { watch: false }); }
        return world;
    }

    // ---- The calendar -------------------------------------------------------------------

    // Day `d` of a season: four [away, home] pairs. The circle method, three times round, swapping ends.
    function fixtures(day) {
        const round = day % (TEAMS - 1), turn = Math.floor(day / (TEAMS - 1)), ring = [];
        for (let i = 0; i < TEAMS - 1; i++) ring.push(1 + (i + round) % (TEAMS - 1));
        const seats = [0, ...ring], pairs = [];
        for (let i = 0; i < TEAMS / 2; i++) {
            const a = seats[i], b = seats[TEAMS - 1 - i], flip = ((i === 0 ? round : i) + turn) % 2;
            pairs.push(flip ? [a, b] : [b, a]);
        }
        return pairs;
    }

    const pct = team => (team.w + team.l ? team.w / (team.w + team.l) : 0.5);
    function standings(world) {
        return world.teams.slice().sort((p, q) => pct(q) - pct(p) || (q.rs - q.ra) - (p.rs - p.ra) || p.id - q.id);
    }
    const sides = (world, game) => [world.teams[game.away], world.teams[game.home]];

    // Begin the next day: the game to watch, and the others played out at once.
    // `follow` is a club's number to stay with, or -1 for the best game going.
    function openDay(world, random, { follow = -1, innings = 9, watch = true } = {}) {
        if (world.stage === 'series') {
            const s = world.series, home = [0, 1, 4].includes(s.wins[0] + s.wins[1]) ? s.a : s.b, away = home === s.a ? s.b : s.a;
            world.others = [];
            world.game = L.startGame(world.teams[away], world.teams[home], { innings, kind: 'series' });
            return world.game;
        }
        const pairs = fixtures(world.day), table = standings(world).map(t => t.id);
        const worth = ([a, b]) => -(table.indexOf(a) + table.indexOf(b)) - Math.abs(table.indexOf(a) - table.indexOf(b)) * 0.5;
        const mine = !watch ? null : pairs.find(p => p.includes(follow)) || pairs.slice().sort((p, q) => worth(q) - worth(p))[0];
        world.others = [];
        world.game = null;
        for (const [away, home] of pairs) {
            const game = L.startGame(world.teams[away], world.teams[home], { innings });
            if (mine && mine[0] === away && mine[1] === home) { world.game = game; continue; }
            while (step(world, game, random));
            world.others.push({ away, home, R: game.R, line: game.line });
        }
        // With nothing to watch the day is over at once; otherwise the others go in the standings when the watched game does.
        if (!watch) { world.others.forEach(game => book(world, game)); world.day++; }
        return world.game;
    }

    // ---- A pitch, and what it means -----------------------------------------------------

    const full = p => `${p.first} ${p.last}`;
    const called = p => (p.nick ? `'${p.nick}' ${p.last}` : full(p));
    function wire(world, item) {
        world.wire.push(item);
        if (world.wire.length > 10) world.wire.shift();
    }

    // Give a man the best nickname he has just earned, if it is a better story than the one he has.
    function christen(world, p, deeds) {
        const all = world.teams.flatMap(t => t.players), taken = new Set(all.map(q => q.nick));
        let best = null;
        for (const [key, tier, test, names] of NICKS) {
            if (tier <= (p.tier || 0) || (best && tier <= best.tier) || !test(p, new Proxy(p.s, { get: stat }), deeds)) continue;
            // A habit names two men at most; a great moment names whoever has one.
            if (tier < 3 && all.filter(q => q.why === key).length >= 2) continue;
            const free = names.filter(n => !taken.has(n));
            if (free.length) best = { key, tier, nick: free[(p.id + world.season) % free.length] };
        }
        if (!best) return null;
        const was = p.nick;
        p.nick = best.nick;
        p.tier = best.tier;
        p.why = best.key;
        return { type: 'nick', id: p.id, nick: best.nick, why: best.key, was, name: full(p) };
    }

    function step(world, game, random) {
        const teams = sides(world, game), play = L.pitch(game, teams, random);
        if (!play || play.kind !== 'pitch') return play;
        const r = play.result, batter = find(teams[play.half], play.batter), pitcher = find(teams[1 - play.half], play.pitcher), box = game.box[batter.id] || {};
        if (r) {
            if (r.hit) {
                if (batter.dry >= 12) play.notes.push({ type: 'drought', n: batter.dry });
                batter.dry = 0;
                if (box.h === 1 && batter.streak >= 4) play.notes.push({ type: 'streak', n: batter.streak + 1 });
                if (game.H[play.half] === 1 && play.inning >= 6) play.notes.push({ type: 'spoiled', inning: play.inning });
            } else if (!['BB', 'HBP', 'SF'].includes(r.code)) batter.dry++;
            const deeds = { box: new Proxy(box, { get: stat }), walkoff: play.walkoff, hr: r.code === 'HR', slam: r.slam };
            for (const p of [batter, ...(play.steal ? [find(teams[play.half], play.steal.id)] : [])]) { const note = christen(world, p, deeds); if (note) { play.notes.push(note); wire(world, note); } }
            if (play.endHalf && !game.over && play.inning >= 6 && game.H[play.half] === 0) play.notes.push({ type: 'building', inning: play.inning, id: pitcher.id });
        }
        if (game.over) {
            // The last word: decisions, streaks, and anything worth a headline.
            const win = game.R[1] > game.R[0] ? 1 : 0;
            for (const side of [0, 1]) {
                const nohit = game.H[1 - side] === 0, alone = game.used[side].length === 1;
                for (const id of new Set([...game.order[side], ...game.used[side]])) {
                    const p = find(teams[side], id), b = game.box[id] || {};
                    if (b.ab) p.streak = b.h ? p.streak + 1 : 0;
                    const note = christen(world, p, { box: new Proxy(b, { get: stat }), nohit: nohit && alone && p.mix && side === win });
                    if (note) { play.notes.push(note); wire(world, note); }
                }
                if (nohit && side === win) {
                    const p = find(teams[side], game.pit[side]);
                    play.notes.push({ type: 'nohit', id: p.id, alone });
                    wire(world, { type: 'nohit', name: alone ? called(p) : `the ${teams[side].name}`, against: teams[1 - side].name });
                }
            }
        }
        return play;
    }
    const pitch = (world, random) => (world.game ? step(world, world.game, random) : null);

    // Write a finished game ({ away, home, R, kind }) into the standings.
    function book(world, game) {
        const win = game.R[1] > game.R[0] ? 1 : 0, teams = sides(world, game);
        teams.forEach((team, side) => {
            team.rs += game.R[side];
            team.ra += game.R[1 - side];
            team.turn++;
            if (game.kind === 'series') return;
            if (side === win) { team.w++; team.run = Math.max(0, team.run) + 1; } else { team.l++; team.run = Math.min(0, team.run) - 1; }
        });
        if (Math.abs(teams[win].run) >= 5 && game.kind !== 'series') wire(world, { type: 'run', name: teams[win].name, n: teams[win].run });
        return teams[win];
    }

    // The watched game is over: book it and turn the page. Says what comes
    // next: 'game', 'series' (the season is over and the top two are named),
    // or 'champion'.
    function closeGame(world) {
        const game = world.game, winner = book(world, game);
        world.others.forEach(other => book(world, other));
        world.last = { away: game.away, home: game.home, R: game.R, kind: game.kind };
        world.game = null;
        if (world.stage === 'series') {
            const s = world.series;
            s.wins[winner.id === s.a ? 0 : 1]++;
            if (Math.max(...s.wins) < SERIES) return 'game';
            world.stage = 'champion';
            world.champion = winner.id;
            return 'champion';
        }
        world.day++;
        if (world.day < DAYS) return 'game';
        const [a, b] = standings(world);
        world.stage = 'series';
        world.series = { a: a.id, b: b.id, wins: [0, 0] };
        return 'series';
    }

    // ---- Numbers ------------------------------------------------------------------------

    const three = x => (x >= 1 ? x.toFixed(3) : x.toFixed(3).slice(1));
    const average = s => three(s.ab ? stat(s, 'h') / s.ab : 0);
    const era = s => (s.outs ? (stat(s, 'er') * 27 / s.outs).toFixed(2) : '-.--');
    const innings = s => `${Math.floor(stat(s, 'outs') / 3)}.${stat(s, 'outs') % 3}`;
    const everyone = world => world.teams.flatMap(team => team.players.map(p => ({ p, team })));

    // The top `n` in each thing worth leading.
    function leaders(world, n = 3) {
        const all = everyone(world), games = Math.max(1, ...world.teams.map(t => t.w + t.l));
        const top = (list, value, show) => list.map(e => ({ ...e, value: value(e.p.s) })).sort((p, q) => q.value - p.value || p.p.id - q.p.id).slice(0, n).map(e => ({ id: e.p.id, name: e.p.last, nick: e.p.nick, abbr: e.team.abbr, text: show(e.p.s) }));
        const bats = all.filter(e => stat(e.p.s, 'ab') >= games * 2.4), arms = all.filter(e => stat(e.p.s, 'outs') >= games * 4.5);
        return {
            avg: top(bats, s => stat(s, 'h') / s.ab, average), hr: top(all, s => stat(s, 'hr'), s => String(stat(s, 'hr'))), rbi: top(all, s => stat(s, 'rbi'), s => String(stat(s, 'rbi'))),
            sb: top(all, s => stat(s, 'sb'), s => String(stat(s, 'sb'))), era: top(arms, s => -stat(s, 'er') / s.outs, era), w: top(all, s => stat(s, 'w'), s => String(stat(s, 'w'))),
            k: top(all, s => stat(s, 'ka'), s => String(stat(s, 'ka'))), sv: top(all, s => stat(s, 'sv'), s => String(stat(s, 'sv'))),
        };
    }

    // ---- The winter ---------------------------------------------------------------------

    // Close the season and open the next. Returns the news: the champion,
    // the prizes, who retired and who came up.
    function newSeason(world, random) {
        const news = [], champ = world.teams[world.champion], best = leaders(world, 1), order = standings(world).map(t => t.id);
        news.push({ type: 'champion', team: `${champ.town} ${champ.name}`, season: world.season });
        world.champs.push({ season: world.season, id: champ.id, name: `${champ.town} ${champ.name}` });
        if (world.champs.length > 12) world.champs.shift();
        const s = world.series, lost = world.teams[s.a === champ.id ? s.b : s.a], cellar = standings(world).at(-1);
        news.push({ type: 'series', team: champ.name, over: lost.name, wins: Math.max(...s.wins), losses: Math.min(...s.wins) });
        news.push({ type: 'cellar', team: `${cellar.town} ${cellar.name}`, w: cellar.w, l: cellar.l });
        for (const [key, prize] of [['avg', 'THE SILVER WHISK'], ['hr', 'THE BIG STICK'], ['rbi', 'THE BUTLER\'S TRAY'], ['era', 'THE GOLDEN ARM'], ['k', 'THE BRASS BARBER POLE']]) {
            const e = best[key][0];
            if (e) news.push({ type: 'prize', prize, name: e.nick ? `'${e.nick}' ${e.name}` : e.name, abbr: e.abbr, text: e.text, key });
        }
        for (const team of world.teams) {
            let left = 0;
            team.players = team.players.map(p => {
                for (const key in p.s) p.c[key] = (p.c[key] || 0) + p.s[key];
                p.c.yrs = (p.c.yrs || 0) + 1;
                delete p.rk;
                p.s = {};
                p.age++;
                p.streak = p.dry = 0;
                // The young improve, the old fade, and everyone drifts a little toward the ordinary: no club stays loaded for ever.
                const drift = p.age < 27 ? 0.018 : p.age < 32 ? 0 : -0.012 * (p.age - 31) / 3 - 0.01;
                for (const key of ['con', 'pow', 'eye', 'spd', 'fld', 'arm', 'stuff', 'ctl', 'sta']) if (key in p) p[key] = clamp(p[key] + drift + (p.mix && 'conpoweye'.includes(key) ? 0 : (0.5 - p[key]) * 0.1) + 0.035 * gauss(random), 0.04, 0.98);
                if (p.age > 30) p.spd = clamp(p.spd - 0.012, 0.04, 0.98);       // the legs go first
                const goes = left < 2 && (p.age >= 42 || (p.age >= 35 && random() < (p.age - 33) * 0.14));
                if (!goes) return p;
                left++;
                news.push({ type: 'retired', name: called(p), abbr: team.abbr, yrs: p.c.yrs, h: stat(p.c, 'h'), hr: stat(p.c, 'hr'), w: stat(p.c, 'w'), ka: stat(p.c, 'ka'), arm: !!p.mix });
                // The clubs that finished lowest get the pick of the youngsters.
                const rookie = person(world, random, p.pos, (order.indexOf(team.id) - 3.5) / 3.5 * 0.06 + (random() < 0.2 ? 0.12 : 0), true);
                news.push({ type: 'rookie', name: full(rookie), abbr: team.abbr, pos: rookie.pos, age: rookie.age });
                return rookie;
            });
            Object.assign(team, { w: 0, l: 0, rs: 0, ra: 0, run: 0, turn: 0 });
            batting(team);
        }
        Object.assign(world, { season: world.season + 1, day: 0, stage: 'season', series: null, game: null, others: [], news });
        delete world.champion;
        delete world.last;
        return news;
    }

    return { TEAMS, DAYS, SERIES, TROPHY, NICKS, found, fixtures, standings, sides, openDay, pitch, step, closeGame, leaders, newSeason, average, era, innings, stat, full, called, pct, christen };
})();
