// Hats for Neko: pixel art at the cats' own scale, drawn in code. Letters
// are colours from each hat's palette (o is the outline, . is clear). A hat
// sits on the head point of each frame, and holidays (host.now()) bring
// their own.
const NekoHats = {
    // Where the top of the head is in each 32 px frame: [x, y, facing]
    // (1 right, -1 left, 0 front or back). The hat is mirrored facing left.
    anchors: {
        mati2: [17.5, 8, 0], mati3: [17.5, 8, 0], awake: [17.5, 8, 0],
        jare2: [11, 7, -1], kaki1: [8, 9, -1], kaki2: [10, 9, -1],
        sleep1: [20.5, 15, 1], sleep2: [20.5, 16, 1],
        up1: [16.5, 2, 0], up2: [16.5, 2, 0], down1: [17.5, 7, 0], down2: [17.5, 6, 0],
        right1: [23.5, 10, 1], right2: [23, 9, 1], left1: [6.5, 10, -1], left2: [8, 9, -1],
        dwright1: [21, 10, 1], dwright2: [23.5, 12, 1], dwleft1: [6.5, 9, -1], dwleft2: [5, 11, -1],
        upright1: [21, 2, 1], upright2: [23, 3, 1], upleft1: [10, 2, -1], upleft2: [8, 3, -1],
        rtogi1: [23, 4, 1], rtogi2: [23, 4, 1], ltogi1: [8, 4, -1], ltogi2: [8, 4, -1],
        utogi1: [16.5, 4, 0], utogi2: [16.5, 4, 0], dtogi1: [17, 7, 0], dtogi2: [17.5, 7, 0],
    },

    // ax: the column over the head point (default the middle); sink: rows
    // that sit down over the head (default 1; a halo floats).
    art: {
        top: { colours: { o: '#0e0e12', k: '#2e2e3a', h: '#6a6a86', r: '#c0303a' }, rows: [
            '..oooooo..', '..okhkko..', '..okhkko..', '..okhkko..', '..orrrro..', '.oooooooo.', 'okkkkkkkko', 'oooooooooo'] },
        cap: { ax: 5, sink: 2, colours: { o: '#141419', b: '#2c5fb8', h: '#5f8fe0', d: '#1d3f80', w: '#f4f4f0' }, rows: [
            '....owo......', '..oobbboo....', '.obhbbbbbo...', '.obbbbbbbo...', '.obbbbbbbooo.', '.oooooooodddo', '.........ooo.'] },
        party: { colours: { o: '#141419', m: '#3fb7e8', p: '#ffe14a', y: '#ff5fa2' }, rows: 'PARTY' },
        crown: { colours: { o: '#5a4010', y: '#f2c230', h: '#fff2a0', r: '#e0303a', b: '#3a7ae0' }, rows: [
            '.o...o...o.', 'oyo.oyo.oyo', 'oyyoyyyoyyo', 'oyhyyyyyhyo', 'oyyyrybyyyo', 'ooooooooooo'] },
        beanie: { colours: { o: '#141419', r: '#e0303a', y: '#f2c230', b: '#3a7ae0' }, frames: [
            ['.rrr.bbb.', '....o....', '..ooooo..', '.orryybo.', 'orrryybbo', 'orrryybbo', 'ooooooooo'],
            ['...b.r...', '....o....', '..ooooo..', '.orryybo.', 'orrryybbo', 'orrryybbo', 'ooooooooo']] },
        wizard: { ax: 5.5, colours: { o: '#141419', b: '#3a3aa8', y: '#f2d040' }, rows: [
            '........oo..', '.......obo..', '......obo...', '.....obbo...', '.....obyo...', '....obbbo...',
            '....oybbbo..', '...obbbbyo..', '...obbbbbbo.', 'oooooooooooo', 'obbbbbbbbbbo', 'oooooooooooo'] },
        cowboy: { sink: 2, colours: { o: '#2a1808', b: '#a8703a', h: '#d09a5a', k: '#5a3418', y: '#e8e8f0' }, rows: [
            '....oooooo....', '...obbhbbbo...', '...obbbbbbo...', '...okkykkko...', 'oo.obbbbbbo.oo', 'oboooooooooobo', '.obbbbbbbbbbo.', '..oooooooooo..'] },
        chef: { colours: { o: '#5a5a66', w: '#fafaf6', h: '#dcdce4', s: '#e4e4ec' }, rows: [
            '..oo..oo..', '.owwoowwo.', 'owwwwwwwwo', 'owwwwwhwwo', '.owwwwwwo.', '.owwwwwwo.', '.osssssso.', '.oooooooo.'] },
        pirate: { colours: { o: '#0e0e12', k: '#2e2e3a', w: '#f4f4f0', y: '#e2b23a' }, rows: [
            '....ooooo....', '..ookkkkkoo..', '.okkkwwwkkko.', 'okkkkwkwkkkko', 'okkkkkwkkkkko', 'oyyyyyyyyyyyo', 'ooooooooooooo'] },
        viking: { colours: { o: '#2a2a32', w: '#f0e6c8', s: '#9aa0b0', h: '#d8dce6', y: '#c89a3a' }, rows: [
            'o...........o', 'wo.........ow', 'owo..ooo..owo', '.owoosssoowo.', '..oshssssso..', '.ossssssssso.', '.ooyyyyyyyoo.'] },
        bow: { ax: -1, sink: 4, colours: { o: '#6a1a3a', p: '#ff6fae', r: '#d03a7a' }, rows: [
            'oo...oo', 'opo.opo', 'oppoppo', 'opprppo', 'oppoppo', 'opo.opo', 'oo...oo'] },
        flower: { colours: { p: '#ff8ac0', w: '#fff6e0', c: '#ffd23a', g: '#4caf50' }, rows: [
            '.p...w...p.', 'pcp.wcw.pcp', 'gpgggwgggpg'] },
        halo: { sink: -2, colours: { y: '#ffe680' }, rows: ['..yyyyy..', 'yy.....yy', '..yyyyy..'] },
        grad: { colours: { o: '#0e0e12', k: '#2e2e3a', y: '#f2c230' }, rows: [
            '......o......', '....ookoo....', '..ookkkkkoo..', 'ookkkkkkkkkoo', '..ookkkkkooy.', '....okkkko.y.', '....oooooo.y.'] },

        // Holiday hats: chosen by date, and in the list too.
        santa: { ax: 4.5, colours: { o: '#141419', r: '#d42a32', w: '#fafaf6', h: '#dcdce4' }, rows: [
            '...oooo.....', '..orrrroo...', '.orrrrrrro..', '.orrrrrrrro.', '.orrrrro.oww', 'owwwwwwwwoww', 'owwwhwwwwo..', 'oooooooooo..'] },
        antlers: { colours: { b: '#e0b478' }, rows: [
            'b.b.........b.b', '.bb.b.....b.bb.', '..bbb.....bbb..', '...b.......b...', '...b.......b...'] },
        witch: { ax: 7, colours: { o: '#9a8ab8', k: '#2a2236', p: '#8a3ad0', y: '#f2c230' }, rows: [
            '.........oo...', '........oko...', '.......okko...', '......okkko...', '.....okkkko...', '.....okkkkko..',
            '....oppyppppo.', 'oooooooooooooo', 'okkkkkkkkkkkko', 'oooooooooooooo'] },
        pilgrim: { colours: { o: '#0e0e12', k: '#2e2e3a', h: '#6a6a86', y: '#e2b23a' }, rows: [
            '...oooooo...', '...okhkko...', '...okhkko...', '...okhkko...', '...oyyyyo...', '...oykkyo...', '...oyyyyo...',
            'oooooooooooo', 'okkkkkkkkkko', 'oooooooooooo'] },
        leprechaun: { colours: { o: '#141419', g: '#2f9a46', h: '#6cd07e', k: '#1a1a1a', y: '#f2c230' }, rows: [
            '..oooooo..', '..oghggo..', '..oghggo..', '..oghggo..', '..okyyko..', '.oooooooo.', 'oggggggggo', 'oooooooooo'] },
        unclesam: { colours: { o: '#141419', w: '#f4f4f0', r: '#c8303a', b: '#2a4a9a', s: '#ffffff' }, rows: [
            '..oooooo..', '..owrwro..', '..owrwro..', '..owrwro..', '..obsbso..', '.oooooooo.', 'obbbbbbbbo', 'oooooooooo'] },
        bunny: { colours: { o: '#141419', w: '#fafaf6', p: '#ffaac8' }, rows: [
            '.oo...oo.', 'owwo.owwo', 'owpo.owpo', 'owpo.owpo', 'owpo.owpo', '.owo.owo.', '.ooooooo.'] },
        hearts: { colours: { o: '#c8c8d4', r: '#ff3a6a', h: '#ffb0c8' }, rows: [
            'rr.rr...rr.rr', 'rhrrr...rhrrr', '.rrr.....rrr.', '..r.......r..', '...o.....o...', '....o...o....', '....ooooo....'] },
        newyear: { colours: { o: '#141419', m: '#e8c04a', p: '#ffffff', y: '#c8d0ff' }, rows: 'PARTY' },
    },

    PARTY: ['....y....', '...yyy...', '....o....', '...omo...', '...opo...', '..ommmo..', '..ompmo..', '.ommmmpo.', '.opmmmmo.', 'ommmpmmmo', 'ooooooooo'],

    // Everyday hats, in the order Assorted hands them out.
    EVERYDAY: ['top', 'cap', 'party', 'crown', 'wizard', 'beanie', 'cowboy', 'bow', 'chef', 'pirate', 'viking', 'flower', 'grad', 'halo'],

    frames(name) {
        const hat = this.art[name];
        return hat.frames || [hat.rows === 'PARTY' ? this.PARTY : hat.rows];
    },

    // Western Easter Sunday (the anonymous Gregorian algorithm).
    easter(year) {
        const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
        const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
        const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
        const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
        return new Date(year, month - 1, day);
    },

    // The day of the fourth Thursday in November.
    thanksgiving(year) {
        const first = new Date(year, 10, 1).getDay();
        return 1 + ((4 - first + 7) % 7) + 21;
    },

    // The holiday's hats on a holiday's days, or null.
    holiday(date) {
        const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
        const fromEaster = Math.round((new Date(y, m - 1, d) - this.easter(y)) / 864e5);
        if ((m === 12 && d === 31) || (m === 1 && d === 1)) return ['newyear'];
        if (m === 2 && (d === 13 || d === 14)) return ['hearts'];
        if (m === 3 && (d === 16 || d === 17)) return ['leprechaun'];
        if (fromEaster >= -2 && fromEaster <= 1) return ['bunny'];
        if (m === 7 && (d === 3 || d === 4)) return ['unclesam'];
        if (m === 10 && d >= 24) return ['witch'];
        if (m === 11 && (d === this.thanksgiving(y) || d === this.thanksgiving(y) + 1)) return ['pilgrim'];
        if (m === 12 && d >= 10 && d <= 26) return ['santa', 'antlers'];
        return null;
    },

    // The hat for cat i: the setting, the holiday, and the day's shuffle.
    pick(choice, i, date) {
        const holiday = this.holiday(date);
        if (choice === 'off') return null;
        if (choice === 'holiday') return holiday ? holiday[i % holiday.length] : null;
        if (choice === 'assorted') {
            if (holiday) return holiday[i % holiday.length];
            const day = Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate()) / 864e5);
            return this.EVERYDAY[(i + day) % this.EVERYDAY.length];
        }
        return this.art[choice] ? choice : null;
    },

    paint(rows, colours, mirror) {
        const canvas = document.createElement('canvas');
        canvas.width = rows[0].length;
        canvas.height = rows.length;
        const ctx = canvas.getContext('2d');
        rows.forEach((row, y) => [...row].forEach((letter, x) => {
            if (letter === '.') return;
            ctx.fillStyle = colours[letter];
            ctx.fillRect(mirror ? row.length - 1 - x : x, y, 1, 1);
        }));
        return canvas;
    },

    // A hat ready to draw: frames facing right and left, and where it sits.
    build(name) {
        const hat = this.art[name];
        const frames = this.frames(name);
        const width = frames[0][0].length, height = frames[0].length;
        return {
            right: frames.map(rows => this.paint(rows, hat.colours, false)),
            left: frames.map(rows => this.paint(rows, hat.colours, true)),
            width, height, ax: hat.ax ?? (width - 1) / 2, sink: hat.sink ?? 1,
        };
    },
};
