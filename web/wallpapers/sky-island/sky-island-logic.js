// Sky Island's pure logic (SPEC §10.31): the seeded random, the calendar
// (season, holidays, the owner's own special dates), island names, and the
// layout of an island from a seed: its three tiers and their cliffs, the
// water from the spring to the cascade, the village streets and their
// houses, the farm, the trees, the dock, the stairs between tiers, and the
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
    // down the screen from the top tier's back line (0). The island is seen
    // from above and in front, so each tier is a slab of ground with a
    // visible top (its `back` and `front` edges, by x) and a cliff face
    // below its front edge, down to its `foot`; the next tier's ground
    // starts at that foot. Three tiers: the crag with the tower and the
    // mill, the village, and the lower ground with the lake and the farm.
    // Below the lowest, the underside tapers to a point (`bottom`). Water
    // runs down one side: the spring on top, a fall, the pond by the
    // village, a fall, the lake, and the cascade off the edge.
    //
    // opts: { w, portrait, houses, forest (0..2), fields (bool), dragon, islet }
    function layout(seed, opts) {
        const rand = rng(seed);
        const w = Math.max(100, Math.round(opts.w));
        const portrait = !!opts.portrait;
        const name = islandName(rand);
        const side = rand.chance(0.5) ? 'left' : 'right';
        const dir = side === 'left' ? -1 : 1;             // toward the water
        const islet = !!opts.islet;                        // a tiny island of its own: deeper tiers, so a house fits
        const DEPTH = islet ? [0.22, 0.32, 0.34] : portrait ? [0.12, 0.17, 0.2] : [0.06, 0.085, 0.105];
        const DROP = islet ? [0.1, 0.11] : portrait ? [0.07, 0.08] : [0.042, 0.048];
        const underH = Math.round(w * (islet ? 0.55 : portrait ? 0.4 : 0.26));
        // The three slabs, top first. Each is an ellipse flattened into a
        // slab, with a wobble, nested inside the one below.
        const cx1 = w / 2 + w * rand.range(-0.04, 0.04), hw1 = w * rand.range(0.4, 0.46);
        const hw0 = w * rand.range(0.21, 0.27);
        const cx0 = clamp(cx1 + w * rand.range(-0.1, 0.1), hw0 + w * 0.08, w - hw0 - w * 0.08);
        const tiers = [];
        const slab = (k, cx, hw, top, depth) => {
            const x0 = Math.max(0, Math.round(cx - hw)), x1 = Math.min(w, Math.round(cx + hw));
            const wob1 = noise1(rand.int(1, 1e9), 19), wob2 = noise1(rand.int(1, 1e9), 23);
            const cy = top + depth / 2, hd = depth / 2;
            const back = [], front = [];
            for (let x = x0; x <= x1; x++) {
                const u = (x - cx) / hw, round = Math.min(1, Math.sqrt(Math.max(0, 1 - u * u)) * 1.25);
                back[x] = Math.round(cy - hd * round + (wob1(x) - 0.5) * depth * 0.14);
                front[x] = Math.round(cy + hd * round + (wob2(x) - 0.5) * depth * 0.14);
                if (front[x] < back[x] + 1) front[x] = back[x] + 1;
            }
            return { k, cx, hw, x0, x1, back, front, top, depth };
        };
        const d0 = Math.round(w * DEPTH[0]);
        const t0 = slab(0, cx0, hw0, 0, d0);
        t0.drop = Math.round(w * DROP[0]);
        t0.foot = t0.front.map(f => f + t0.drop);
        const nest = (t, up) => {
            for (let x = t.x0; x <= t.x1; x++) {
                if (x >= up.x0 && x <= up.x1 && up.foot[x] >= t.back[x]) t.back[x] = up.foot[x] + 1;
                if (t.front[x] < t.back[x] + 3) t.front[x] = t.back[x] + 3;
            }
        };
        const maxFoot = t => { let m = -1e9; for (let x = t.x0; x <= t.x1; x++) m = Math.max(m, t.foot[x]); return m; };
        const e1 = Math.round(t0.drop * 0.45), d1 = Math.round(w * DEPTH[1]);
        const t1 = slab(1, cx1, hw1, maxFoot(t0) - e1, d1 + e1);
        t1.drop = Math.round(w * DROP[1]);
        t1.foot = t1.front.map(f => f + t1.drop);
        nest(t1, t0);
        const e2 = Math.round(t1.drop * 0.45), d2 = Math.round(w * DEPTH[2]);
        const t2 = slab(2, w / 2, w / 2, maxFoot(t1) - e2, d2 + e2);
        nest(t2, t1);
        t2.drop = 0; t2.foot = t2.front.slice();
        tiers.push(t0, t1, t2);
        const depth = Math.max(...t2.front.filter(v => v !== undefined));
        // The underside: strata tapering to a jagged point, deepest a little toward the water.
        const jag = noise1(rand.int(1, 1e9), Math.max(8, w / 9)), jag2 = noise1(rand.int(1, 1e9), 4);
        const bottom = [];
        const lowX = w / 2 + dir * w * rand.range(0.02, 0.1);
        for (let x = 0; x <= w; x++) {
            const u = Math.abs(x - lowX) / (x < lowX ? lowX : w - lowX);
            const taper = Math.max(0, 1 - Math.pow(u, 2.3));
            bottom[x] = t2.front[x] + Math.round(underH * taper * (0.55 + jag(x) * 0.45) * (0.88 + jag2(x) * 0.12));
        }
        // ---- Water, top to bottom ----
        const fallX = Math.round(clamp(cx0 + dir * hw0 * rand.range(0.5, 0.7), side === 'left' ? w * 0.17 : w * 0.5, side === 'left' ? w * 0.5 : w * 0.83));
        const spring = { tier: 0, x: fallX, rx: Math.round(w * 0.026) + 2, ry: Math.max(2, Math.round(d0 * 0.2)) };
        spring.y = t0.front[fallX] - spring.ry;
        const pond = { tier: 1, x: fallX, rx: Math.round(w * rand.range(0.042, 0.055)) };
        pond.ry = Math.max(3, Math.round((t1.front[fallX] - t0.foot[fallX] - 1) / 2)); pond.y = t0.foot[fallX] + 1 + pond.ry;
        const lake = { tier: 2, x: fallX, rx: Math.round(w * rand.range(0.1, 0.125)) };
        lake.ry = Math.max(4, Math.round((t2.front[fallX] - t1.foot[fallX] - 1) / 2)); lake.y = t1.foot[fallX] + 1 + lake.ry;
        const falls = [
            { x: fallX, w: 3, top: t0.front[fallX], bottom: t0.foot[fallX], into: 'pond' },
            { x: fallX, w: 4, top: t1.front[fallX], bottom: t1.foot[fallX], into: 'lake' },
            { x: fallX, w: Math.max(8, Math.round(lake.rx * 0.34)), top: t2.front[fallX], bottom: bottom[fallX] + Math.round(underH * 0.5), into: 'clouds' },
        ];
        // ---- Streets, stairs ----
        // A street runs only where its tier is deep enough to stand on.
        const span = (t, y, need) => { let l = t.x0, r = t.x1; while (l < r && !(t.back[l] < y - 2 && t.front[l] > y + need)) l++; while (r > l && !(t.back[r] < y - 2 && t.front[r] > y + need)) r--; return r - l < 12 ? [t.x0 + 2, t.x1 - 2] : [l, r]; };
        const stair0X = Math.round(cx0 - dir * hw0 * rand.range(0.45, 0.68));
        const [s0l, s0r] = span(t0, Math.round(d0 * 0.66), 2);
        const street0 = { tier: 0, y: Math.round(d0 * 0.66), l: s0l + 3, r: s0r - 3 };
        const innerPond = fallX - dir * (pond.rx + 4);                      // the pond's shore on the village side
        const y1 = t1.top + e1;
        const [bl, br] = span(t1, y1 + Math.round(d1 * 0.36), 8), [fl, fr] = span(t1, y1 + Math.round(d1 * 0.76), 2);
        const town = side === 'left' ? { l: innerPond, r: Math.min(br, fr) - 3 } : { l: Math.max(bl, fl) + 3, r: innerPond };
        const street1b = { tier: 1, y: y1 + Math.round(d1 * 0.36), l: town.l, r: town.r };
        const street1f = { tier: 1, y: y1 + Math.round(d1 * 0.76), l: fl + 2, r: fr - 2 };
        const innerLake = fallX - dir * (lake.rx + 4);
        const y2 = t2.top + e2;
        const [l2, r2] = span(t2, y2 + Math.round(d2 * 0.4), 6);
        const street2 = { tier: 2, y: y2 + Math.round(d2 * 0.4), l: side === 'left' ? innerLake : l2 + 3, r: side === 'left' ? r2 - 3 : innerLake };
        const streets = [street0, street1b, street1f, street2];
        // ---- The crag, the tower, the mill, on top ----
        const crag = { x: Math.round(fallX + dir * w * 0.02), w: Math.round(w * 0.15), h: Math.round(w * (portrait ? 0.1 : 0.07)), y: t0.back[fallX] + 2 };
        const tower = { tier: 0, x: Math.round(cx0 - dir * hw0 * 0.12), base: t0.back[Math.round(cx0)] + Math.round(d0 * 0.5) };
        const millX = Math.round(cx0 - dir * hw0 * rand.range(0.28, 0.4));
        const windmill = !islet && rand.chance(0.8) && Math.abs(millX - stair0X) > 14 ? { tier: 0, x: millX, base: t0.back[millX] + Math.round(d0 * 0.52) } : null;
        // ---- The village ----
        const squareX = Math.round(town.l + (town.r - town.l) * rand.range(0.4, 0.6));
        const square = { tier: 1, x: squareX, y: street1f.y + 4, w: 30 };
        const stair1X = Math.round(squareX - dir * rand.range(22, 30));
        const houses = placeHouses(rand, { streets, town, square, tiers, w, count: opts.houses, portrait, pond, stair1X, side, dir, lake, innerLake, fields: opts.fields !== false });
        const bridge = { x: fallX, y: street1f.y, hw: pond.rx + 2 };
        // ---- The lower ground: fields, the barn, the orchard, the dock, the boat ----
        const fields = [];
        const farmL = side === 'left' ? Math.round(w * 0.56) : 8, farmR = side === 'left' ? w - 8 : Math.round(w * 0.44);
        if (opts.fields !== false) {
            const fy = street2.y + 4, fh = Math.max(7, Math.min(Math.round(d2 * 0.42), t2.front[Math.round((farmL + farmR) / 2)] - fy - 4));
            const fitsField = (x, fw) => x >= 4 && x + fw <= w - 4 && t2.front[x] - 3 >= fy + fh && t2.front[x + fw] - 3 >= fy + fh && t2.front[Math.round(x + fw / 2)] - 3 >= fy + fh;
            let fx = side === 'left' ? farmL + rand.int(2, 10) : farmR - rand.int(2, 10);
            for (let i = 0; i < 2 && fh >= 7; i++) {
                let placed = null;
                for (let fw = rand.int(Math.round(w * 0.06), Math.round(w * 0.09)); fw >= 12 && !placed; fw -= 4) {
                    for (let k = 0; k < 8 && !placed; k++) { const x = (side === 'left' ? fx : fx - fw) + (side === 'left' ? 1 : -1) * k * 6; if (fitsField(x, fw)) placed = { x, w: fw }; }
                }
                if (!placed && i === 0) for (let x = farmL; x + 12 <= farmR && !placed; x += 3) if (fitsField(x, 12)) placed = { x, w: 12 };
                if (!placed) break;
                fields.push({ x: placed.x, y: fy, w: placed.w, h: fh, crop: i === 0 ? 'wheat' : rand.pick(['cabbage', 'pumpkin', 'carrot', 'flowers']) });
                fx = side === 'left' ? placed.x + placed.w + rand.int(5, 8) : placed.x - rand.int(5, 8);
            }
        }
        const dockShore = innerLake - dir * 2;
        const dock = { tier: 2, shoreX: innerLake + dir * 2, y: lake.y - Math.round(lake.ry * 0.15), len: Math.max(8, Math.round(lake.rx * 0.5)), dir };
        dock.tipX = dock.shoreX + dir * dock.len;
        const boat = { x: fallX + dir * lake.rx * 0.3, y: lake.y + Math.round(lake.ry * 0.3), rx: lake.rx * 0.45 };
        // ---- Trees, bushes, flowers ----
        const blocked = [];
        const block = (x, y, bw, bh, pad = 0) => blocked.push({ x: x - pad, y: y - pad, w: bw + pad * 2, h: bh + pad * 2 });
        for (const h of houses.list) block(h.x, h.y, h.w, h.h + 2, 2);
        block(tower.x - 12, tower.base - 10, 24, 12, 3);
        if (windmill) block(windmill.x - 12, windmill.base - 8, 24, 10, 3);
        block(crag.x - crag.w / 2, crag.y - 2, crag.w, 6, 2);
        block(spring.x - spring.rx, spring.y - spring.ry, spring.rx * 2, spring.ry * 2, 3);
        block(pond.x - pond.rx, pond.y - pond.ry, pond.rx * 2, pond.ry * 2, 3);
        block(lake.x - lake.rx, lake.y - lake.ry, lake.rx * 2, lake.ry * 2, 3);
        block(square.x - square.w / 2, square.y - 8, square.w, 16, 3);
        for (const f of fields) block(f.x, f.y, f.w, f.h, 3);
        block(stair0X - 4, t0.front[stair0X] - 3, 8, t0.drop + 6, 2);
        block(stair1X - 4, t1.front[stair1X] - 3, 8, t1.drop + 6, 2);
        block(dock.shoreX - 4, dock.y - 4, 8, 8, 2);
        if (houses.barn) block(houses.barn.x, houses.barn.y, houses.barn.w, houses.barn.h, 3);
        for (const s of streets) block(s.l, s.y - 2, s.r - s.l, 5, 0);
        const orchard = [];
        if (fields.length) {
            // Rows of apple and cherry trees behind the street on the farm side.
            const ox0 = side === 'left' ? Math.round(w * 0.6) : Math.round(w * 0.12), ox1 = side === 'left' ? w - 10 : Math.round(w * 0.4);
            for (let x = ox0; x <= ox1; x += 16) {
                const y = y2 + 4 + ((x / 16) % 2) * 4;
                if (t2.back[x] === undefined || y <= t2.back[x] + 2 || y >= street2.y - 4) continue;
                if (hits({ x: x - 5, y: y - 3, w: 10, h: 5 }, blocked, 0)) continue;
                orchard.push({ x, y, kind: rand.chance(0.35) ? 'cherry' : 'apple', size: 1, phase: rand(), sway: 1, tier: 2 });
            }
        }
        const trees = placeTrees(rand, { w, tiers, blocked, forest: opts.forest ?? 1, orchard, town, square, pond, fallX, side });
        for (const t of orchard) trees.push(t);
        trees.sort((a, b) => a.y - b.y);
        for (const t of trees) block(t.x - 4, t.y - 2, 8, 3, 0);
        const bushes = [];
        for (let i = 0; i < w / 14; i++) {
            const t = rand.pick(tiers), x = rand.int(t.x0 + 2, t.x1 - 2);
            const yb = t.back[x], yf = t.front[x]; if (yb === undefined) continue;
            const y = rand.int(yb + 1, yf - 1);
            if (hits({ x: x - 3, y: y - 2, w: 6, h: 3 }, blocked, 0)) continue;
            bushes.push({ x, y, k: rand(), size: rand.int(0, 1), tier: t.k, berry: rand.chance(0.3) });
            block(x - 3, y - 2, 6, 3, 0);
        }
        const flowers = [];
        for (let i = 0; i < w / 2.5; i++) {
            const t = rand.pick(tiers), x = rand.int(t.x0 + 1, t.x1 - 1);
            const yb = t.back[x], yf = t.front[x]; if (yb === undefined) continue;
            const y = rand.int(yb + 1, yf - 1);
            if (hits({ x: x - 1, y: y - 1, w: 3, h: 2 }, blocked, 0)) continue;
            flowers.push({ x, y, k: rand(), tier: t.k });
        }
        // ---- Lamps, benches, the well, props ----
        const lamps = [];
        for (const s of [street1b, street1f]) for (let x = s.l + 8; x < s.r - 6; x += rand.int(34, 48)) if (!houses.list.some(h => x >= h.x - 3 && x <= h.x + h.w + 3 && h.base === s.y - 1) && Math.abs(x - square.x) > 18 && Math.abs(x - fallX) > pond.rx + 4) lamps.push({ x, y: s.y - 1, tier: 1 });
        lamps.push({ x: stair1X + dir * 6, y: street2.y - 1, tier: 2 });
        lamps.push({ x: dock.shoreX - dir * 3, y: dock.y - 3, tier: 2 });
        const benches = [{ x: square.x - 11, y: square.y + 3, tier: 1 }, { x: square.x + 11, y: square.y + 3, tier: 1 }, { x: tower.x + dir * 0 + (dir > 0 ? -14 : 14), y: street0.y + 1, tier: 0 }];
        const well = { x: square.x, y: square.y - 1, tier: 1 };
        const props = [];
        if (houses.stall) { props.push({ kind: 'barrel', x: houses.stall.x + (houses.stall.x < square.x ? -9 : 9), y: houses.stall.base, tier: 1 }); props.push({ kind: 'crate', x: houses.stall.x + (houses.stall.x < square.x ? -13 : 13), y: houses.stall.base - 1, tier: 1 }); }
        if (houses.barn) { const b = houses.barn; for (let i = 0; i < 3; i++) props.push({ kind: 'hay', x: b.x + b.w + 4 + i * 6 - (side === 'left' ? 0 : b.w + 14), y: b.base + (i % 2), tier: 2 }); props.push({ kind: 'barrel', x: b.x - 4, y: b.base, tier: 2 }); }
        for (let i = 0; i < 3; i++) { const h = houses.list[(i * 5 + 1) % houses.list.length]; if (h && h.tier === 1 && h.kind !== 'chapel') props.push({ kind: 'flowerbed', x: h.x + (i % 2 ? 2 : h.w - 4), y: h.base + 2, tier: 1 }); }
        props.push({ kind: 'signpost', x: stair1X - dir * 5, y: street1f.y + 2, tier: 1 });
        // ---- Where people go ----
        const meadow = openSpot(rand, { tiers: [t2, t0], blocked, streets }) || { tier: 0, x: Math.round(cx0), y: street0.y };
        const edgeFar = { tier: 1, x: side === 'left' ? t1.x0 + 5 : t1.x1 - 5, y: street1f.y };
        const edgeNear = { tier: 1, x: side === 'left' ? t1.x1 - 5 : t1.x0 + 5, y: street1f.y };
        const spots = {
            square: { tier: 1, x: square.x, y: square.y },
            dock: { tier: 2, x: dock.shoreX, y: dock.y },
            fishing: { tier: 2, x: dock.shoreX, y: dock.y, then: [{ x: dock.tipX - dir * 2, y: dock.y }] },
            field: fields[0] ? { tier: 2, x: fields[0].x + Math.round(fields[0].w / 2), y: fields[0].y - 1 } : { tier: 2, x: street2.l + 20, y: street2.y },
            meadow,
            edgeL: side === 'left' ? edgeFar : edgeNear,
            edgeR: side === 'left' ? edgeNear : edgeFar,
            bench0: { tier: 1, x: benches[0].x, y: benches[0].y + 1 },
            bench1: { tier: 1, x: benches[1].x, y: benches[1].y + 1 },
            lookout: { tier: 0, x: benches[2].x, y: benches[2].y + 1 },
            spring: { tier: 0, x: spring.x - dir * (spring.rx + 3), y: street0.y },
            mill: windmill ? { tier: 0, x: windmill.x, y: windmill.base + 1 } : { tier: 0, x: tower.x, y: tower.base + 1 },
            lakeside: { tier: 2, x: innerLake + (side === 'left' ? 6 : -6), y: lake.y + 2 },
            barn: houses.barn ? { tier: 2, x: houses.barn.x + Math.round(houses.barn.w / 2), y: houses.barn.base + 1 } : { tier: 2, x: street2.l + 10, y: street2.y },
        };
        // ---- Under the island ----
        const farX = Math.round(w / 2 - dir * w * rand.range(0.15, 0.3));
        const cave = opts.dragon === false ? null : { x: farX, y: t2.front[farX] + Math.round((bottom[farX] - t2.front[farX]) * rand.range(0.28, 0.4)) };
        const roots = [];
        for (let i = 0; i < rand.int(5, 8); i++) { const x = rand.int(Math.round(w * 0.08), Math.round(w * 0.92)); if (Math.abs(x - fallX) < falls[2].w + 6) continue; roots.push({ x, y: t2.front[x] + rand.int(4, 9), len: rand.int(Math.round(underH * 0.25), Math.round(underH * 0.7)), lean: rand.pick([-1, 1]), k: rand() * 9, thick: rand.chance(0.4) }); }
        const vines = [];
        for (const t of [t0, t1]) for (let i = 0; i < rand.int(2, 4); i++) { const x = rand.int(t.x0 + 4, t.x1 - 4); if (Math.abs(x - fallX) < 8 || Math.abs(x - (t.k === 0 ? stair0X : stair1X)) < 7) continue; vines.push({ x, y: t.front[x] + 1, len: rand.int(Math.round(t.drop * 0.5), t.drop + 6), k: rand() * 9 }); }
        const cracks = [];
        for (let i = 0; i < rand.int(3, 5); i++) { const x = rand.int(Math.round(w * 0.3), Math.round(w * 0.7)); const y0 = t2.front[x] + Math.round((bottom[x] - t2.front[x]) * rand.range(0.55, 0.85)); cracks.push({ x, y: y0, len: rand.int(6, 14), lean: rand.pick([-1, 1]), k: rand() * 9 }); }
        const crystals = [];
        for (let i = 0; i < rand.int(2, 4); i++) { const x = rand.int(Math.round(w * 0.2), Math.round(w * 0.8)); crystals.push({ x, y: bottom[x] - rand.int(3, 9), hue: rand.pick(['cyan', 'cyan', 'violet']) }); }
        const fragments = [];
        for (let i = 0; i < rand.int(4, 6); i++) fragments.push({ rx: w * rand.range(0.45, 0.62), ry: underH * rand.range(0.5, 0.9), cy: depth + underH * rand.range(0.3, 0.6), phase: rand() * Math.PI * 2, speed: rand.range(0.03, 0.06) * rand.pick([-1, 1]), size: rand.int(5, 12), k: rand() * 9, grass: rand.chance(0.5) });
        // ---- Getting about ----
        const gaps = crossings(houses.list, streets, { stair0X, stair1X, pond });
        return { seed, name, w, depth, underH, portrait, side, dir, tiers, bottom, fallX, spring, pond, lake, falls, bridge, streets, stairs: [{ x: stair0X, tier: 0, top: t0.front[stair0X], bottom: t0.foot[stair0X] }, { x: stair1X, tier: 1, top: t1.front[stair1X], bottom: t1.foot[stair1X] }],
            crag, tower, windmill, town, square, houses: houses.list, chapel: houses.chapel, stall: houses.stall, barn: houses.barn, lighthouse: houses.lighthouse, fields, orchard, dock, boat, trees, bushes, flowers, lamps, benches, well, props, spots, cave, roots, vines, cracks, crystals, fragments, gaps };
    }

    // Where one can cross from each street to the next: gaps[i] is the clear
    // x's between street i-1 and street i. Between tiers that's the stairs;
    // between the village's two streets, the clear ground between the
    // front street's houses. gaps[0] is empty.
    function crossings(houses, streets, o) {
        const gaps = streets.map(() => []);
        gaps[1] = [o.stair0X];
        gaps[3] = [o.stair1X];
        const row = houses.filter(h => h.row === 2).sort((a, b) => a.x - b.x);
        const s = streets[1];
        let x = s.l;
        for (const h of row) {
            if (h.x - 3 - x >= 4) gaps[2].push(Math.round((x + h.x - 3) / 2));
            x = Math.max(x, h.x + h.w + 3);
        }
        if (s.r - x >= 3) gaps[2].push(Math.round((x + s.r) / 2));
        gaps[2] = gaps[2].filter(g => Math.abs(g - o.pond.x) > o.pond.rx + 3);
        if (!gaps[2].length) gaps[2].push(Math.round((s.l + s.r) / 2));
        return gaps;
    }

    const overlap = (a, b, pad) => a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
    const hits = (r, list, pad) => list.some(o => overlap(r, o, pad));
    // Which tier the ground at (x, y) belongs to, or -1 in the air or on a cliff.
    function tierAt(I, x, y) {
        const xx = Math.round(clamp(x, 0, I.w));
        for (const t of I.tiers) if (xx >= t.x0 && xx <= t.x1 && y >= t.back[xx] - 0.5 && y <= t.foot[xx] + 0.5) return t.k;
        return -1;
    }

    const HOUSE_KINDS = ['cottage', 'cottage', 'tall', 'wide', 'cottage', 'tower', 'cottage', 'stone'];
    const SHOPS = ['bakery', 'inn', 'shop'];

    // Houses along the village's two streets with the square on the front
    // one and the chapel across from it; a farmhouse and the barn on the
    // lower ground; sometimes a cottage by the lake, a stall by the square,
    // a lighthouse at the island's far tip.
    function placeHouses(rand, o) {
        const list = [];
        const count = Math.max(3, o.count);
        const [, backSt, frontSt, lowSt] = o.streets;
        const t1 = o.tiers[1], t2 = o.tiers[2];
        let id = 0;
        let shops = rand.shuffle(SHOPS);
        const sizeOf = kind => {
            const hw = kind === 'wide' ? rand.int(34, 42) : kind === 'tower' ? rand.int(16, 19) : kind === 'stone' ? rand.int(24, 30) : rand.int(22, 30);
            const hh = kind === 'tall' || kind === 'tower' ? rand.int(24, 30) : rand.int(15, 20);
            return [hw, hh];
        };
        const make = (x, hw, hh, street, tier, kind, extra = {}) => ({ id: id++, x, w: hw, h: hh, base: street.y - 1, y: street.y - 1 - hh, kind, row: o.streets.indexOf(street), tier,
            shop: null, wall: rand.int(0, 5), roof: rand.int(0, 4), roofStyle: rand.pick(['gable', 'gable', 'hip', 'thatch', 'gable']), door: rand.int(0, 2), flip: rand.chance(0.5), ...extra });
        const fits = (x, hw, hh, street, tier) => {
            const t = o.tiers[tier];
            if (x < t.x0 + 3 || x + hw > t.x1 - 3) return false;
            const mid = Math.round(x + hw / 2);
            // Standing on the street, its back clear of the tier's back edge (the house is a few pixels deep).
            if (street.y - 1 - 6 <= t.back[mid] || street.y - 1 - 6 <= t.back[x] || street.y - 1 - 6 <= t.back[x + hw]) return false;
            if (street.y + 1 >= t.front[mid] || street.y + 1 >= t.front[x] || street.y + 1 >= t.front[x + hw]) return false;
            if (Math.abs(mid - o.pond.x) < o.pond.rx + hw / 2 + 4 && tier === 1) return false;
            if (tier === 2 && Math.abs(mid - o.lake.x) < o.lake.rx + hw / 2 + 4) return false;
            return true;
        };
        // The village: a share for each street, the front one keeps the square clear.
        const villageCount = Math.max(2, count - (o.fields ? 1 : 0));
        const rows = [{ street: backSt, share: 0.5 }, { street: frontSt, share: 0.5 }];
        for (const row of rows) {
            const want = Math.max(1, Math.round(villageCount * row.share));
            const isFront = row.street === frontSt;
            let x = o.town.l + rand.int(2, 8), placed = 0;
            for (let tries = 0; placed < want && tries < 40 && x < o.town.r - 16; tries++) {
                const kind = rand.pick(HOUSE_KINDS);
                const [hw, hh] = sizeOf(kind);
                if (x + hw > o.town.r - 2) break;
                if (isFront && x + hw > o.square.x - o.square.w / 2 - 2 && x < o.square.x + o.square.w / 2 + 2) { x = Math.round(o.square.x + o.square.w / 2) + rand.int(3, 6); continue; }
                if (!fits(x, hw, hh, row.street, 1)) { x += 6; continue; }
                const house = make(x, hw, hh, row.street, 1, kind);
                if (kind !== 'tower' && shops.length && rand.chance(0.4)) house.shop = shops.pop();
                list.push(house);
                placed++;
                x += hw + rand.int(5, 12);
            }
        }
        // The chapel: on the back street across from the square, if it fits; else a house nearest the square.
        let chapel = null;
        const chapelW = 26, chapelX = o.square.x - Math.round(chapelW / 2);
        const chapelRect = { x: chapelX - 3, y: backSt.y - 1 - 40, w: chapelW + 6, h: 40 };
        if (!hits(chapelRect, list, 0) && fits(chapelX, chapelW, 18, backSt, 1)) {
            chapel = make(chapelX, chapelW, 18, backSt, 1, 'chapel', { wall: 5, roof: 1, roofStyle: 'gable', door: 1, flip: false });
            list.push(chapel);
        } else {
            const backRow = list.filter(h => h.row === 1);
            chapel = backRow.sort((a, b) => Math.abs(a.x + a.w / 2 - o.square.x) - Math.abs(b.x + b.w / 2 - o.square.x))[0] || list.find(h => h.kind !== 'tower') || list[0] || null;
            if (chapel) { chapel.kind = 'chapel'; chapel.shop = null; chapel.roofStyle = 'gable'; }
        }
        // The lower ground: the barn by the fields, a farmhouse, maybe a cottage by the lake.
        let barn = null;
        if (o.fields) {
            const bw = rand.int(34, 40), bh = 18;
            let bx = o.side === 'left' ? Math.round(o.w * 0.58) + rand.int(0, 8) : Math.round(o.w * 0.42) - bw - rand.int(0, 8);
            const bx0 = bx;
            for (let k = 1; k < 16 && !fits(bx, bw, bh, lowSt, 2); k++) bx = bx0 + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * 8;
            if (fits(bx, bw, bh, lowSt, 2)) { barn = make(bx, bw, bh, lowSt, 2, 'barn', { wall: 0, roof: 0, roofStyle: 'gambrel', door: 1, flip: o.side === 'right' }); list.push(barn); }
            const fx = o.side === 'left' ? (barn ? barn.x + barn.w + rand.int(10, 18) : Math.round(o.w * 0.62)) : (barn ? barn.x - rand.int(36, 44) : Math.round(o.w * 0.2));
            const [hw, hh] = sizeOf('cottage');
            if (fits(fx, hw, hh, lowSt, 2) && !hits({ x: fx, y: 0, w: hw, h: 1 }, list.filter(h => h.tier === 2).map(h => ({ x: h.x - 4, y: 0, w: h.w + 8, h: 1 })), 0)) list.push(make(fx, hw, hh, lowSt, 2, 'cottage', { farm: true }));
        }
        if (!list.length) {
            const [hw, hh] = sizeOf('cottage');
            for (let x = lowSt.l + 2; x + hw < lowSt.r - 2; x += 4) if (fits(x, hw, hh, lowSt, 2)) { list.push(make(x, hw, hh, lowSt, 2, 'cottage')); break; }
        }
        if (rand.chance(0.6)) {
            const [hw, hh] = sizeOf('cottage');
            const lx = o.innerLake + (o.side === 'left' ? 10 : -10 - hw);
            if (fits(lx, hw, hh, lowSt, 2) && !hits({ x: lx, y: lowSt.y - 1 - hh, w: hw, h: hh }, list, 4)) list.push(make(lx, hw, hh, lowSt, 2, 'cottage'));
        }
        const stall = rand.chance(0.8) ? { x: o.square.x + (rand.chance(0.5) ? -17 : 17), base: o.square.y + 5, tier: 1 } : null;
        let lighthouse = null;
        if (rand.chance(0.5)) { const lx = o.side === 'left' ? 7 : o.w - 7; const t = o.tiers[2]; if (t.back[lx] !== undefined && t.front[lx] - t.back[lx] > 6) lighthouse = { x: lx, base: Math.round((t.back[lx] + t.front[lx]) / 2) + 2, tier: 2 }; }
        return { list, chapel, stall, barn, lighthouse };
    }

    function placeTrees(rand, o) {
        const trees = [];
        const want = Math.round(o.w / 9 * (0.5 + o.forest * 0.6));
        for (let tries = 0; trees.length < want && tries < want * 14; tries++) {
            const t = rand.pick(o.tiers);
            const x = rand.int(t.x0 + 3, t.x1 - 3);
            const yb = t.back[x], yf = t.front[x]; if (yb === undefined) continue;
            const y = rand.int(yb + 2, yf - 1);
            // Thick at the ends and on top, thin in the village.
            const inTown = t.k === 1 && x > o.town.l - 4 && x < o.town.r + 4;
            if (inTown && rand.chance(0.8)) continue;
            if (hits({ x: x - 4, y: y - 2, w: 8, h: 3 }, o.blocked, 1)) continue;
            if (trees.some(tr => Math.abs(tr.x - x) < 6 && Math.abs(tr.y - y) < 4)) continue;
            const kind = t.k === 0 ? (rand.chance(0.65) ? 'pine' : 'round') : rand.pick(['round', 'round', 'tall', 'pine', 'birch', 'cherry', 'round']);
            trees.push({ x, y, kind, size: t.k === 0 && kind === 'pine' ? rand.pick([1, 2]) : rand.pick([0, 1, 1, 2]), phase: rand(), sway: rand.chance(0.5) ? 1 : -1, tier: t.k });
        }
        return trees;
    }

    function openSpot(rand, o) {
        for (const t of o.tiers) for (let tries = 0; tries < 60; tries++) {
            const x = rand.int(t.x0 + 8, t.x1 - 8);
            const yb = t.back[x], yf = t.front[x]; if (yb === undefined) continue;
            const y = rand.int(yb + 3, yf - 3);
            if (hits({ x: x - 8, y: y - 3, w: 16, h: 6 }, o.blocked, 0)) continue;
            if (o.streets.some(s => s.tier === t.k && Math.abs(s.y - y) < 3)) continue;
            return { tier: t.k, x, y };
        }
        return null;
    }

    // ---- Getting about -------------------------------------------------------------------------

    // Waypoints from `from` to `to`: up or down to the nearest street of the
    // tier, along it, crossing to the next street through a gap (between the
    // village's houses) or down the stairs (between tiers), then across to
    // the target. Points carry their tier; without one, the ground decides.
    function route(from, to, I) {
        const S = I.streets, gaps = I.gaps;
        const tierOf = p => p.tier ?? Math.max(0, tierAt(I, p.x, p.y));
        const nearestOn = (tier, y) => { let best = -1; S.forEach((s, i) => { if (s.tier === tier && (best < 0 || Math.abs(s.y - y) < Math.abs(S[best].y - y))) best = i; }); return best; };
        const i1 = nearestOn(tierOf(from), from.y), i2 = nearestOn(tierOf(to), to.y);
        const points = [];
        let x = from.x, y = from.y;
        const go = (nx, ny) => { if (nx !== x || ny !== y) { x = nx; y = ny; points.push({ x, y }); } };
        go(x, S[i1].y);
        const step = i2 > i1 ? 1 : -1;
        for (let i = i1; i !== i2; i += step) {
            const row = step > 0 ? i + 1 : i;
            const list = gaps?.[row]?.length ? gaps[row] : [to.x];
            const cross = list.reduce((best, g) => Math.abs(g - to.x) < Math.abs(best - to.x) ? g : best, list[0]);
            go(cross, y);
            go(cross, S[i + step].y);
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

    return { rng, hash, clamp, lerp, noise1, SEASONS, seasonOf, easter, thanksgiving, parseSpecialDates, HOLIDAYS, holidayOf, islandName, visitorName, ROSTER, layout, route, tierAt, ROLES, planFor, overlap, hits };
})();
