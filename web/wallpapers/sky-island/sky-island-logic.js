// Sky Island's pure logic (SPEC §10.31): the seeded random, the calendar
// (season, holidays, the owner's own special dates), island names, and the
// layout of an island from a seed: where the plateau's edges run, the
// mountain, the lake and its waterfall, the town's two streets and their
// houses, the fields, the forest, the dock, the lamps and benches, and the
// spots the townsfolk go to. No DOM in here, so tools/sky-island.test.mjs
// runs it in Node.

const SkyIslandLogic = (() => {
    // ---- Random ------------------------------------------------------------------------------

    // mulberry32, wrapped with the helpers a generator needs.
    function rng(seed) {
        let a = (seed >>> 0) || 1;
        const next = () => {
            a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        next.range = (lo, hi) => lo + next() * (hi - lo);
        next.int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
        next.pick = list => list[Math.floor(next() * list.length)];
        next.chance = p => next() < p;
        next.shuffle = list => { const out = list.slice(); for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; } return out; };
        return next;
    }
    // A stable hash of two integers to 0..1, for texture that never flickers.
    const hash = (x, y) => { let h = (x * 73856093) ^ (y * 19349663); h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
    const lerp = (a, b, t) => a + (b - a) * t;
    // Smooth 1-D value noise from a seed, for wobbly edges.
    function noise1(seed, scale) {
        const r = rng(seed), knots = [];
        for (let i = 0; i < 64; i++) knots.push(r());
        return x => {
            const u = x / scale, i = Math.floor(u), t = u - i, s = t * t * (3 - 2 * t);
            return lerp(knots[((i % 64) + 64) % 64], knots[(((i + 1) % 64) + 64) % 64], s);
        };
    }

    // ---- The calendar --------------------------------------------------------------------------

    const SEASONS = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'];
    const seasonOf = date => SEASONS[date.getMonth()];

    // Easter Sunday (Gregorian, the anonymous algorithm).
    function easter(year) {
        const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
        const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
        const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
        const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
        return new Date(year, month - 1, day);
    }
    function thanksgiving(year) {
        const first = new Date(year, 10, 1).getDay();
        return new Date(year, 10, 1 + (4 - first + 7) % 7 + 21);
    }
    const dayOf = date => new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const daysBetween = (a, b) => Math.round((dayOf(a) - dayOf(b)) / 864e5);

    // The owner's own dates: one a line, "MM-DD Name" (or "M/D Name").
    function parseSpecialDates(text) {
        const out = [];
        for (const line of String(text || '').split(/[\n;,]+/)) {
            const m = line.trim().match(/^(\d{1,2})[-\/.](\d{1,2})\s*(.*)$/);
            if (!m) continue;
            const month = +m[1], day = +m[2];
            if (month < 1 || month > 12 || day < 1 || day > 31) continue;
            out.push({ month, day, name: m[3].trim() || 'A party' });
        }
        return out;
    }

    const HOLIDAYS = {
        valentines: { name: 'Valentine’s Day', icon: '💝' },
        stpatricks: { name: 'St Patrick’s Day', icon: '🍀' },
        easter: { name: 'Easter', icon: '🐰' },
        july4: { name: 'Independence Day', icon: '🎆' },
        halloween: { name: 'Halloween', icon: '🎃' },
        thanksgiving: { name: 'Thanksgiving', icon: '🦃' },
        christmas: { name: 'Christmas', icon: '🎄' },
        newyear: { name: 'New Year', icon: '🥂' },
        party: { name: 'A party', icon: '🎂' },
    };

    // Which holiday the island is dressed for on `date`, if any: { id, name,
    // icon, day (true on the day itself), eve (Christmas Eve, New Year's Eve) }.
    // The run-up counts: lights go up on December 1st, pumpkins the week
    // before Halloween. A special date of the owner's wins over everything.
    function holidayOf(date, special = []) {
        const month = date.getMonth() + 1, day = date.getDate(), year = date.getFullYear();
        const own = special.find(s => s.month === month && s.day === day);
        if (own) return { id: 'party', name: own.name, icon: HOLIDAYS.party.icon, day: true, eve: false };
        const found = (id, isDay, eve = false) => ({ id, name: HOLIDAYS[id].name, icon: HOLIDAYS[id].icon, day: isDay, eve });
        if (month === 12 && day === 31) return found('newyear', false, true);
        if (month === 1 && day === 1) return found('newyear', true);
        if (month === 12 && day <= 26) return found('christmas', day === 25, day === 24);
        if (month === 2 && day >= 12 && day <= 14) return found('valentines', day === 14);
        if (month === 3 && day >= 15 && day <= 17) return found('stpatricks', day === 17);
        const toEaster = daysBetween(easter(year), date);
        if (toEaster >= 0 && toEaster <= 7) return found('easter', toEaster === 0);
        if (month === 7 && day >= 2 && day <= 4) return found('july4', day === 4);
        if (month === 10 && day >= 24) return found('halloween', day === 31);
        const toThanks = daysBetween(thanksgiving(year), date);
        if (toThanks >= 0 && toThanks <= 6) return found('thanksgiving', toThanks === 0);
        return null;
    }

    // ---- Names ---------------------------------------------------------------------------------

    const FIRST = ['Fern', 'Pebble', 'Thistle', 'Bramble', 'Cloud', 'Wind', 'Moss', 'Apple', 'Honey', 'Maple', 'Fox', 'Lark', 'Dew', 'Misty',
        'Elder', 'Willow', 'Tumble', 'Puddle', 'Snug', 'Whisker', 'Clover', 'Marble', 'Feather', 'Butter', 'Bumble', 'Hazel', 'Tangle', 'Kettle', 'Wander', 'Biscuit'];
    const LAST = ['wick', 'hollow', 'mere', 'bury', 'shire', 'haven', 'ford', 'moor', 'cott', 'ridge', 'dale', 'top', 'nook', 'reach', 'well', 'combe', 'stead', 'fall', 'brook', 'hurst'];
    const KIND = ['Isle', 'Island', 'Isle', 'Rock', 'Aerie', 'Isle', 'Perch', 'Island'];
    const islandName = rand => `${rand.pick(FIRST)}${rand.pick(LAST)} ${rand.pick(KIND)}`;
    const SMALL_NAMES = ['Lesser', 'Little', 'Far', 'Wee', 'Upper', 'Lost', 'Spare', 'Odd'];
    const visitorName = rand => `${rand.pick(SMALL_NAMES)} ${rand.pick(FIRST)}${rand.pick(LAST)}`;

    // ---- The cats ------------------------------------------------------------------------------

    // The owner's cats, by name and temperament (the colours are the art's).
    const ROSTER = [
        { id: 'moofy', name: 'Moofy', base: '#1c1b22', marks: '#2a2830', chest: '#1c1b22', eyes: '#f0d050', pattern: 'solid', big: true, fluffy: true, grin: true, blurb: 'lurks, and grins' },
        { id: 'butters', name: 'Butters', base: '#e8b86a', marks: '#c89248', chest: '#f4dca8', eyes: '#6ab04a', pattern: 'tabby', big: true, blurb: 'chunky, and loves you' },
        { id: 'waffles', name: 'Waffles', base: '#f4f1ea', marks: '#20201f', chest: '#f4f1ea', eyes: '#e0a030', pattern: 'splotch', blurb: 'a small cow' },
        { id: 'ras', name: 'Ras The Destroyer', base: '#161618', marks: '#161618', chest: '#f4f1ea', eyes: '#6ab04a', pattern: 'tuxedo', trouble: true, blurb: 'knocks things off walls' },
        { id: 'ibbie', name: 'Ibbie', base: '#9a9ca6', marks: '#6e707a', chest: '#c8cad2', eyes: '#6ab04a', pattern: 'tabby', sleepy: true, blurb: 'sleeps on sills' },
        { id: 'maus', name: 'Maus', base: '#241c18', marks: '#6b3f22', chest: '#241c18', eyes: '#e0a030', pattern: 'tortie', zoomies: true, blurb: 'has the zoomies' },
        { id: 'turkey', name: 'Turkey', base: '#8c8e94', marks: '#5c5e66', chest: '#b0b2b8', eyes: '#f0d050', pattern: 'tabby', big: true, lounges: true, blurb: 'lounges on the dock' },
        { id: 'harry', name: 'Harry', base: '#e8893a', marks: '#c86a24', chest: '#f8f0e0', eyes: '#6ab04a', pattern: 'tabby', playful: true, blurb: 'chases everything' },
        { id: 'persian', name: 'Kitty Toes', base: '#8da0b8', marks: '#7a8ca4', chest: '#8da0b8', eyes: '#d08a3a', pattern: 'solid', fluffy: true, blurb: 'judges, fluffily' },
    ];

    // ---- The layout ----------------------------------------------------------------------------

    // Everything is in island pixels: x from 0 to w across the island, y
    // down from the plateau's back line (0) to its front line (about
    // `depth`), and on down the cliff. The manager places the whole thing
    // on the screen.
    //
    // opts: { w, portrait, houses, forest (0..2), fields (bool), dragon }
    function layout(seed, opts) {
        const rand = rng(seed);
        const w = Math.max(90, Math.round(opts.w));
        const portrait = !!opts.portrait;
        const depth = Math.round(w * (portrait ? 0.4 : 0.125));
        const cx = w / 2, half = w / 2;
        const name = islandName(rand);
        const side = rand.chance(0.5) ? 'left' : 'right';
        // The plateau's back and front edges: a rounded slab with a wobble.
        const wob1 = noise1(rand.int(1, 1e9), 23), wob2 = noise1(rand.int(1, 1e9), 31);
        const back = [], front = [];
        for (let x = 0; x <= w; x++) {
            const u = (x - cx) / half;
            const round = Math.sqrt(Math.max(0, 1 - u * u));
            const hd = depth / 2 * Math.min(1, round * 1.35);
            back[x] = Math.max(0, Math.round(depth / 2 - hd + (wob1(x) - 0.5) * depth * 0.12));
            front[x] = Math.min(depth, Math.round(depth / 2 + hd + (wob2(x) - 0.5) * depth * 0.12));
            if (front[x] <= back[x]) front[x] = Math.min(depth, back[x] + 1);
        }
        // The cliff below: a jagged taper to a point.
        const cliffH = Math.round(w * rand.range(0.17, 0.26));
        const jag = noise1(rand.int(1, 1e9), 9), jag2 = noise1(rand.int(1, 1e9), 3);
        const bottom = [];
        for (let x = 0; x <= w; x++) {
            const u = Math.abs((x - cx) / half);
            const taper = Math.max(0, 1 - Math.pow(u, 2.2));
            bottom[x] = front[x] + Math.round(cliffH * taper * (0.6 + jag(x) * 0.4) * (0.85 + jag2(x) * 0.15));
        }
        // Streets: two rows (three on a phone). People only ever cross open ground straight up or down from one.
        const streets = portrait ? [0.3, 0.57, 0.84].map(k => Math.round(depth * k)) : [0.47, 0.84].map(k => Math.round(depth * k));
        // The lake, at the waterfall's side of the plateau, reaching the front
        // lip, its back shore clear of the back street (the way to the dock).
        const lakeX = Math.round(side === 'left' ? w * rand.range(0.17, 0.24) : w * rand.range(0.76, 0.83));
        const lakeRx = Math.round(w * rand.range(0.075, 0.115));
        const lakeRy = Math.max(3, Math.min(Math.round(lakeRx * (portrait ? 0.55 : 0.42)), Math.floor((front[lakeX] + 1 - streets[0] - 2) / 2)));
        const lake = { x: lakeX, rx: lakeRx, ry: lakeRy, y: front[lakeX] - lakeRy + 1 };
        const fall = { x: lakeX, w: Math.max(4, Math.round(lakeRx * 0.5)), top: front[lakeX], bottom: bottom[lakeX] };
        // The mountain: at the back, on the far side from the lake, or behind the town.
        const mw = Math.round(w * rand.range(0.3, 0.42));
        const mx = side === 'left' ? Math.round(w * rand.range(0.66, 0.78)) : Math.round(w * rand.range(0.22, 0.34));
        const mountain = { x: mx, w: mw, h: Math.round(mw * rand.range(0.32, 0.45)), y: Math.round(depth * (portrait ? 0.14 : 0.2)), peaks: rand.int(2, 4) };
        // The town: between the lake and the island's other end.
        const townL = Math.round(side === 'left' ? lake.x + lake.rx + 6 : Math.max(w * 0.08, 4));
        const townR = Math.round(side === 'left' ? Math.min(w * 0.92, w - 4) : lake.x - lake.rx - 6);
        const town = { l: townL, r: townR };
        const houses = placeHouses(rand, { streets, town, mountain, depth, portrait, count: opts.houses, w, back, front });
        const square = houses.square;
        // Fields: a fenced plot or two in the open, on the far side from the lake.
        const fields = [];
        if (opts.fields !== false) {
            for (let tries = 0; tries < 30 && fields.length < (portrait ? 1 : 2); tries++) {
                const fw = rand.int(16, 26), fh = rand.int(6, 9);
                const fx = rand.int(4, w - fw - 4), fy = rand.int(streets[0] + 2, depth - fh - 1);
                const rect = { x: fx, y: fy, w: fw, h: fh };
                if (!inPlateau(rect, back, front) || hits(rect, houses.list, 3) || hitsLake(rect, lake, 3) || hitsMountain(rect, mountain) || fields.some(f => hits(rect, [f], 3)) || hitsStreet(rect, streets)) continue;
                fields.push({ ...rect, crop: rand.pick(['wheat', 'cabbage', 'pumpkin', 'flowers']) });
            }
        }
        // The dock: a pier out from the lake's back shore.
        const dock = { x: lake.x + rand.int(-Math.round(lake.rx * 0.3), Math.round(lake.rx * 0.3)), y: lake.y - lake.ry, len: Math.max(3, Math.round(lake.ry * 0.9)) };
        // Trees: thick near the mountain and the ends, thin in town.
        const trees = placeTrees(rand, { w, depth, back, front, houses: houses.list, lake, mountain, fields, streets, square, town, forest: opts.forest ?? 1, dock });
        // Lamps along the streets, benches by the square, a well in it.
        const lamps = [];
        for (const y of streets) for (let x = town.l + 6; x < town.r - 4; x += rand.int(22, 34)) if (!houses.list.some(h => x >= h.x - 2 && x <= h.x + h.w + 2 && Math.abs(h.base - y) < 3)) lamps.push({ x, y: y - 1 });
        const benches = [{ x: square.x - 7, y: square.y + 2 }, { x: square.x + 7, y: square.y + 2 }];
        const well = { x: square.x, y: square.y - 1 };
        // Where people go. Each spot is on open ground, reached straight from a street.
        const spots = {
            square: { x: square.x, y: square.y },
            dock: { x: dock.x, y: dock.y - 1 },
            fishing: { x: dock.x, y: dock.y + dock.len - 1 },
            field: fields[0] ? { x: fields[0].x + Math.round(fields[0].w / 2), y: fields[0].y - 1 } : { x: square.x + 12, y: streets[streets.length - 1] },
            meadow: openSpot(rand, { w, depth, back, front, houses: houses.list, lake, mountain, fields, trees }) || { x: town.l, y: streets[0] },
            edgeL: { x: Math.max(3, Math.round(w * 0.04)), y: Math.round(depth * 0.55) },
            edgeR: { x: Math.min(w - 3, Math.round(w * 0.96)), y: Math.round(depth * 0.55) },
            bench0: { x: benches[0].x, y: benches[0].y + 1 },
            bench1: { x: benches[1].x, y: benches[1].y + 1 },
        };
        // The dragon's cave, in the cliff face.
        const caveX = Math.round(side === 'left' ? w * rand.range(0.55, 0.8) : w * rand.range(0.2, 0.45));
        const cave = opts.dragon === false ? null : { x: caveX, y: front[caveX] + Math.round((bottom[caveX] - front[caveX]) * rand.range(0.3, 0.5)) };
        // Crystals on the underside, roots down the sides.
        const crystals = [];
        for (let i = 0; i < rand.int(2, 4); i++) { const x = rand.int(Math.round(w * 0.2), Math.round(w * 0.8)); crystals.push({ x, y: bottom[x] - rand.int(2, 6), hue: rand.pick(['pink', 'cyan', 'violet']) }); }
        const roots = [];
        for (let i = 0; i < rand.int(3, 6); i++) { const x = rand.int(Math.round(w * 0.1), Math.round(w * 0.9)); roots.push({ x, y: front[x] + rand.int(3, 8), len: rand.int(6, 18), lean: rand.pick([-1, 1]) }); }
        const flowers = [];
        for (let i = 0; i < w / 3; i++) {
            const x = rand.int(1, w - 1), y = rand.int(1, depth - 1);
            if (y <= back[x] || y >= front[x] || hits({ x, y, w: 1, h: 1 }, houses.list, 1) || hitsLake({ x, y, w: 1, h: 1 }, lake, 1) || hitsMountain({ x, y, w: 1, h: 1 }, mountain) || fields.some(f => hits({ x, y, w: 1, h: 1 }, [f], 1)) || streets.some(s => Math.abs(s - y) < 2)) continue;
            flowers.push({ x, y, k: rand() });
        }
        const path = { from: { x: dock.x, y: dock.y + 1 }, street: streets[streets.length - 1] };
        const gaps = crossings(houses.list, streets, town, lake);
        return { seed, name, w, depth, portrait, side, back, front, bottom, cliffH, lake, fall, mountain, streets, town, gaps, houses: houses.list, square, fields, dock, trees, lamps, benches, well, spots, cave, crystals, roots, flowers, path,
            windmill: houses.windmill, chapel: houses.chapel, lighthouse: houses.lighthouse, stall: houses.stall };
    }

    // Where one can cross from each street to the next without walking
    // through a house: gaps[i] is the clear x's between street i-1 and
    // street i (the houses on street i stand there). gaps[0] is empty: above
    // the back street, cross anywhere.
    function crossings(houses, streets, town, lake) {
        const gaps = streets.map(() => []);
        const dry = g => Math.abs(g - lake.x) > lake.rx + 2;
        for (let i = 1; i < streets.length; i++) {
            const row = houses.filter(h => h.row === i).sort((a, b) => a.x - b.x);
            let x = town.l - 3;
            for (const h of row) {
                if (h.x - 2 - x >= 3) gaps[i].push(Math.round((x + h.x - 2) / 2));
                x = Math.max(x, h.x + h.w + 2);
            }
            gaps[i].push(Math.max(x + 1, town.r + 3));
            gaps[i].unshift(town.l - 3);
            gaps[i] = gaps[i].filter(dry);
        }
        return gaps;
    }

    const inPlateau = (r, back, front) => {
        for (const x of [r.x, r.x + r.w]) { const xx = clamp(x, 0, back.length - 1); if (r.y <= back[xx] || r.y + r.h >= front[xx]) return false; }
        return true;
    };
    const overlap = (a, b, pad) => a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
    const hits = (r, list, pad) => list.some(o => overlap(r, o, pad));
    const hitsLake = (r, lake, pad) => overlap(r, { x: lake.x - lake.rx, y: lake.y - lake.ry, w: lake.rx * 2, h: lake.ry * 2 }, pad);
    const hitsMountain = (r, m) => overlap(r, { x: m.x - m.w / 2, y: 0, w: m.w, h: m.y + 2 }, 1);
    const hitsStreet = (r, streets) => streets.some(s => s >= r.y - 1 && s <= r.y + r.h + 1);

    const HOUSE_KINDS = ['cottage', 'cottage', 'tall', 'wide', 'cottage', 'tower', 'barn'];
    const SHOPS = ['bakery', 'inn', 'shop'];

    // Houses along the streets, a square in the middle of the front street
    // with the chapel across from it, and sometimes a windmill, a lighthouse
    // at an end, a market stall by the square.
    function placeHouses(rand, o) {
        const list = [];
        const count = Math.max(3, o.count);
        const frontStreet = o.streets[o.streets.length - 1];
        const townW = o.town.r - o.town.l;
        const squareX = Math.round(o.town.l + townW * rand.range(0.4, 0.6));
        const square = { x: squareX, y: frontStreet + (o.portrait ? 3 : 4), w: 20 };
        let id = 0;
        // Each street gets a share, the front one the square's gap.
        const rows = o.streets.map((y, i) => ({ y, share: i === o.streets.length - 1 ? 0.45 : 0.55 / (o.streets.length - 1) }));
        let shops = rand.shuffle(SHOPS);
        for (const row of rows) {
            const want = Math.max(1, Math.round(count * row.share));
            const isFront = row.y === frontStreet;
            let x = o.town.l + rand.int(0, 6);
            let placed = 0;
            for (let tries = 0; placed < want && tries < 40 && x < o.town.r - 10; tries++) {
                const kind = rand.pick(HOUSE_KINDS);
                const hw = kind === 'wide' || kind === 'barn' ? rand.int(18, 24) : kind === 'tower' ? rand.int(9, 11) : rand.int(12, 17);
                const hh = kind === 'tall' || kind === 'tower' ? rand.int(14, 19) : rand.int(9, 13);
                if (x + hw > o.town.r) break;
                // Keep the square clear on the front street.
                if (isFront && x + hw > square.x - square.w / 2 && x < square.x + square.w / 2) { x = Math.round(square.x + square.w / 2) + rand.int(1, 3); continue; }
                const house = { id: id++, x, w: hw, h: hh, base: row.y - 1, y: row.y - 1 - hh, kind, row: o.streets.indexOf(row.y),
                    shop: null, wall: rand.int(0, 5), roof: rand.int(0, 4), roofStyle: rand.pick(['gable', 'gable', 'hip', 'thatch', 'flat']), door: rand.int(0, 2), flip: rand.chance(0.5) };
                if (hitsMountain({ x: house.x, y: house.y, w: house.w, h: house.h }, o.mountain) && row.y === o.streets[0]) { x += hw + rand.int(3, 7); continue; }
                if (house.y < o.back[clamp(x + Math.round(hw / 2), 0, o.w)] - hh * 0.8 - 6 && o.portrait) { x += hw + rand.int(3, 7); continue; }
                if (!o.portrait && kind !== 'tower' && shops.length && rand.chance(0.35)) house.shop = shops.pop();
                list.push(house);
                placed++;
                x += hw + rand.int(3, 8);
            }
        }
        // The chapel: on the back street, across from the square, if it fits; else a tower house becomes it.
        let chapel = null;
        const backStreet = o.streets[0];
        const chapelW = 14, chapelX = square.x - Math.round(chapelW / 2);
        const chapelRect = { x: chapelX - 2, y: backStreet - 1 - 22, w: chapelW + 4, h: 22 };
        if (!hits(chapelRect, list, 0) && !hitsMountain(chapelRect, o.mountain)) {
            chapel = { id: id++, x: chapelX, w: chapelW, h: 12, base: backStreet - 1, y: backStreet - 1 - 12, kind: 'chapel', row: 0, shop: null, wall: 5, roof: 1, roofStyle: 'gable', door: 1, flip: false };
            list.push(chapel);
        } else {
            // No room: the back street's house nearest the square gets the bell.
            const backRow = list.filter(h => h.row === 0);
            chapel = list.find(h => h.kind === 'tower') || backRow.sort((a, b) => Math.abs(a.x + a.w / 2 - square.x) - Math.abs(b.x + b.w / 2 - square.x))[0] || list[0];
            chapel.kind = 'chapel'; chapel.shop = null;
        }
        // A windmill at a town end on the back street, a lighthouse at the island's far end, a stall by the square.
        let windmill = null;
        if (rand.chance(0.7)) {
            const wx = rand.chance(0.5) ? o.town.l - 10 : o.town.r + 4;
            const rect = { x: wx, y: backStreet - 1 - 18, w: 9, h: 18 };
            if (!hits(rect, list, 1) && !hitsMountain(rect, o.mountain) && wx > 3 && wx + 9 < o.w - 3) windmill = { x: wx + 4, base: backStreet - 1 };
        }
        let lighthouse = null;
        if (rand.chance(0.5)) {
            const lx = o.mountain.x < o.w / 2 ? Math.round(o.w * 0.93) : Math.round(o.w * 0.07);
            const y = Math.round((o.back[lx] + o.front[lx]) / 2);
            lighthouse = { x: lx, base: y };
        }
        const stall = rand.chance(0.75) ? { x: square.x + (rand.chance(0.5) ? -13 : 13), base: square.y + 3 } : null;
        return { list, square, chapel, windmill, lighthouse, stall };
    }

    function placeTrees(rand, o) {
        const trees = [];
        const want = Math.round(o.w / 7 * (0.6 + o.forest * 0.7));
        const evergreenNear = x => Math.abs(x - o.mountain.x) < o.mountain.w * 0.9;
        for (let tries = 0; trees.length < want && tries < want * 12; tries++) {
            const x = rand.int(3, o.w - 3), y = rand.int(1, o.depth - 1);
            // Thicker at the ends and by the mountain, thin in town.
            const inTown = x > o.town.l - 4 && x < o.town.r + 4;
            if (inTown && rand.chance(0.78)) continue;
            if (y <= o.back[x] + 1 || y >= o.front[x] - 1) continue;
            const r = { x: x - 2, y: y - 1, w: 5, h: 2 };
            if (hits(r, o.houses, 2) || hitsLake(r, o.lake, 2) || hitsMountain(r, o.mountain) || o.fields.some(f => hits(r, [f], 2))) continue;
            if (Math.abs(x - o.square.x) < 14 && Math.abs(y - o.square.y) < 8) continue;
            if (o.streets.some(s => Math.abs(s - y) <= 1) && inTown) continue;
            if (Math.abs(x - o.dock.x) < 5 && y < o.dock.y && y > o.dock.y - o.dock.len - 3) continue;
            if (trees.some(t => Math.abs(t.x - x) < 3 && Math.abs(t.y - y) < 2)) continue;
            const kind = evergreenNear(x) && rand.chance(0.7) ? 'pine' : rand.pick(['round', 'round', 'tall', 'pine', 'apple', 'birch']);
            trees.push({ x, y, kind, size: rand.pick([0, 1, 1, 2]), phase: rand(), sway: rand.chance(0.5) ? 1 : -1 });
        }
        trees.sort((a, b) => a.y - b.y);
        return trees;
    }

    function openSpot(rand, o) {
        for (let tries = 0; tries < 60; tries++) {
            const x = rand.int(6, o.w - 6), y = rand.int(2, o.depth - 2);
            const r = { x: x - 3, y: y - 2, w: 6, h: 3 };
            if (y <= o.back[x] + 2 || y >= o.front[x] - 2) continue;
            if (hits(r, o.houses, 2) || hitsLake(r, o.lake, 3) || hitsMountain(r, o.mountain) || o.fields.some(f => hits(r, [f], 2)) || o.trees.some(t => Math.abs(t.x - x) < 5 && Math.abs(t.y - y) < 3)) continue;
            return { x, y };
        }
        return null;
    }

    // ---- Getting about -------------------------------------------------------------------------

    // Waypoints from `from` to `to`: up or down to the nearest street,
    // along it, crossing to the next street only through a gap between its
    // houses, then across to the target. Anywhere outside the town (the
    // lake, the fields, the island's ends) is reached from the back street,
    // which runs clear of the lake and the mountain's feet.
    function route(from, to, I) {
        const { streets, gaps, town } = I;
        const nearest = y => streets.reduce((best, s) => Math.abs(s - y) < Math.abs(best - y) ? s : best, streets[0]);
        const outside = x => x < town.l - 2 || x > town.r + 2;
        const s1 = outside(from.x) ? streets[0] : nearest(from.y);
        const s2 = outside(to.x) ? streets[0] : nearest(to.y);
        const points = [];
        let x = from.x, y = from.y;
        const go = (nx, ny) => { if (nx !== x || ny !== y) { x = nx; y = ny; points.push({ x, y }); } };
        go(x, s1);
        const i1 = streets.indexOf(s1), i2 = streets.indexOf(s2), step = i2 > i1 ? 1 : -1;
        for (let i = i1; i !== i2; i += step) {
            const row = step > 0 ? i + 1 : i;       // the houses standing between street i and the next
            const list = gaps?.[row]?.length ? gaps[row] : [to.x];
            const cross = list.reduce((best, g) => Math.abs(g - to.x) < Math.abs(best - to.x) ? g : best, list[0]);
            go(cross, y);
            go(cross, streets[i + step]);
        }
        go(to.x, y);
        go(to.x, to.y);
        return points;
    }

    // ---- The day's shape -------------------------------------------------------------------------

    // What a resident with this role does at this hour, as a spot name and
    // an activity. Everyone sleeps late at night; the night watch keeps it.
    const ROLES = ['baker', 'fisher', 'farmer', 'kid', 'kid', 'mail', 'gardener', 'roofer', 'watch', 'stroller', 'stroller', 'musician', 'merchant', 'walker'];
    function planFor(role, hour, holiday) {
        const night = hour >= 22 || hour < (role === 'baker' || role === 'fisher' ? 5 : 6);   // bakers and fishers are up early
        if (role === 'watch' && night) return { what: 'patrol', spot: 'street' };
        if (night) return { what: 'sleep', spot: 'home' };
        if (holiday && hour >= 17 && hour < 22) return { what: role === 'musician' ? 'play' : 'party', spot: 'square' };
        if (role === 'watch') return hour < 14 ? { what: 'sleep', spot: 'home' } : { what: 'stroll', spot: 'street' };
        if (hour < 7) return { what: role === 'baker' || role === 'fisher' ? 'work' : 'sleep', spot: role === 'baker' ? 'bakery' : role === 'fisher' ? 'fishing' : 'home' };
        if (hour >= 12 && hour < 13.5) return { what: 'lunch', spot: 'square' };
        if (hour >= 19) return { what: 'evening', spot: role === 'kid' ? 'home' : role === 'musician' ? 'square' : 'bench' };
        switch (role) {
            case 'baker': return { what: 'work', spot: 'bakery' };
            case 'fisher': return { what: 'fish', spot: 'fishing' };
            case 'farmer': return { what: 'hoe', spot: 'field' };
            case 'kid': return { what: 'play', spot: hour % 2 ? 'meadow' : 'square' };
            case 'mail': return { what: 'rounds', spot: 'doors' };
            case 'gardener': return { what: 'water', spot: 'garden' };
            case 'roofer': return { what: hour >= 9 && hour < 16 ? 'roof' : 'stroll', spot: hour >= 9 && hour < 16 ? 'roof' : 'street' };
            case 'musician': return { what: hour >= 16 ? 'play' : 'stroll', spot: hour >= 16 ? 'square' : 'street' };
            case 'merchant': return { what: 'sell', spot: 'stall' };
            case 'walker': return { what: 'walk', spot: 'edge' };
            default: return { what: 'stroll', spot: 'street' };
        }
    }

    return { rng, hash, clamp, lerp, noise1, SEASONS, seasonOf, easter, thanksgiving, parseSpecialDates, HOLIDAYS, holidayOf, islandName, visitorName, ROSTER, layout, route, ROLES, planFor, overlap };
})();
