// The Cat vs. the Ornament: the pure part (no DOM, unit-tested in
// tools/cat-ornament.test.mjs). The household's cats, their names and
// temperaments; the ornament's pendulum and the tree's fall; the odds the
// director rolls. Everything moves by elapsed time (SPEC §4.8).

const CatOrnamentLogic = (() => {
    'use strict';

    const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

    // The household. `names`: the first is the cat's name; with `often` it's
    // used that share of the time and the rest share what's left, else every
    // name is as likely. `size` and `chunk` scale the rig; the traits (0–1)
    // weight what the cat does when it isn't the one at the ornament, and
    // how it goes about it when it is:
    //   lurk    under the tree, in the dark, eyes (and grin) shining
    //   stare   at the ornament, for how long
    //   trouble the odds of escalating: a bat, the ornament off, a climb
    //   sleep, lounge, love (a slow blink at you), zoom (laps of the room),
    //   play (pounces, chases)
    // `heavy`: if this cat climbs the tree, the tree comes down.
    const ROSTER = [
        { id: 'moofy', names: ['Moofy'], coat: 'black-fluffy', size: 1.16, chunk: 1.12, fluff: 1, eyes: '#c6d64a', face: 'grin',
          traits: { lurk: 1, stare: 0.85, trouble: 0.5, sleep: 0.3, lounge: 0.25, love: 0.15, zoom: 0.05, play: 0.25 },
          blurb: 'A black Maine Coon and Ragdoll, with a grin that arrives before he does' },
        { id: 'butters', names: ['Butters'], coat: 'buff-tabby', size: 1.05, chunk: 1.32, fluff: 0.2, eyes: '#d8a43c', face: 'love',
          traits: { lurk: 0.1, stare: 0.4, trouble: 0.2, sleep: 0.5, lounge: 0.6, love: 1, zoom: 0.02, play: 0.2 },
          blurb: 'A chunky buff tabby who loves you, specifically' },
        { id: 'waffles', names: ['Waffles'], coat: 'holstein', size: 0.98, chunk: 1, fluff: 0, eyes: '#8cc06a', face: 'curious',
          traits: { lurk: 0.2, stare: 0.7, trouble: 0.5, sleep: 0.35, lounge: 0.3, love: 0.3, zoom: 0.25, play: 0.55 },
          blurb: 'White with black patches, like a very small cow' },
        { id: 'ras', names: ['Ras The Destroyer'], coat: 'tuxedo', size: 1, chunk: 1, fluff: 0, eyes: '#e0c040', face: 'scheme',
          traits: { lurk: 0.4, stare: 0.6, trouble: 1, sleep: 0.2, lounge: 0.15, love: 0.05, zoom: 0.35, play: 0.6 },
          blurb: 'Black, in a tuxedo, up to something' },
        { id: 'ibbie', names: ['Ibbie'], coat: 'grey-tabby', size: 0.92, chunk: 0.96, fluff: 0, eyes: '#9cc27a', face: 'sweet',
          traits: { lurk: 0.1, stare: 0.35, trouble: 0.15, sleep: 1, lounge: 0.4, love: 0.6, zoom: 0.03, play: 0.15 },
          blurb: 'A sweet grey tabby, usually asleep' },
        { id: 'maus', names: ['Die Fleder Maus', 'Maus'], coat: 'tortie', size: 0.9, chunk: 0.92, fluff: 0, eyes: '#e8b030', face: 'wild', often: 0.7,
          traits: { lurk: 0.2, stare: 0.3, trouble: 0.7, sleep: 0.1, lounge: 0.05, love: 0.1, zoom: 1, play: 0.8 },
          blurb: 'A black and brown tortie, rarely seen standing still' },
        { id: 'turkey', names: ['Turkey'], coat: 'grey-mottled', size: 1.24, chunk: 1.2, fluff: 0.1, eyes: '#c8b050', face: 'sweet', heavy: true,
          traits: { lurk: 0.15, stare: 0.45, trouble: 0.35, sleep: 0.5, lounge: 1, love: 0.4, zoom: 0.05, play: 0.2 },
          blurb: 'A large, muscular grey tabby, and a gentle one' },
        { id: 'harry', names: ['Harry', 'Indiana Jones', 'Friskies'], coat: 'orange-white', size: 1, chunk: 1, fluff: 0, eyes: '#d8b440', face: 'play', often: 0.7,
          traits: { lurk: 0.2, stare: 0.5, trouble: 0.65, sleep: 0.25, lounge: 0.25, love: 0.35, zoom: 0.4, play: 1 },
          blurb: 'An orange and white tabby, always up for a game' },
        { id: 'persian', names: ['Kitty Toes', 'Cat Baloo', 'Poke Paws'], coat: 'blue-persian', size: 1, chunk: 1.15, fluff: 1.3, eyes: '#e08a2c', face: 'judge',
          traits: { lurk: 0.1, stare: 0.9, trouble: 0.1, sleep: 0.45, lounge: 0.5, love: 0.1, zoom: 0.02, play: 0.1 },
          blurb: 'A fluffy blue Persian, above all this' },
    ];
    const byId = id => ROSTER.find(c => c.id === id);

    // A name for the cat today: `custom` (a comma list from the settings)
    // replaces the roster's names. The first is used `often` of the time.
    function pickName(cat, custom, rand) {
        const list = String(custom || '').split(',').map(s => s.trim()).filter(Boolean);
        const names = list.length ? list : cat.names;
        if (names.length === 1) return names[0];
        if (cat.often) {
            const r = rand();
            if (r < cat.often) return names[0];
            return names[1 + Math.floor((r - cat.often) / (1 - cat.often) * (names.length - 1)) % (names.length - 1)];
        }
        return names[Math.floor(rand() * names.length) % names.length];
    }

    // `n` cats for the room, from the enabled ids, in a random order.
    function cast(enabled, n, rand) {
        const pool = enabled.filter(byId);
        const out = [];
        while (pool.length && out.length < n) out.push(byId(pool.splice(Math.floor(rand() * pool.length) % pool.length, 1)[0]));
        return out;
    }

    // ---- The ornament -------------------------------------------------------------

    // A pendulum on a hook: theta from straight down (radians, + swings
    // right), omega, `length` in px. The hook's horizontal acceleration
    // (the tree wobbling) drives it. A light damping: a good swat swings
    // for a while.
    function pendulumStep(p, dt, hookAccel = 0, g = 2600) {
        const k = g / Math.max(10, p.length);
        const alpha = -k * Math.sin(p.theta) - hookAccel / Math.max(10, p.length) * Math.cos(p.theta) - 0.55 * p.omega;
        p.omega += alpha * dt;
        p.theta = clamp(p.theta + p.omega * dt, -1.4, 1.4);
        return p;
    }

    // A swat: an impulse toward `dir` (±1), from a paw of `strength` (0–1).
    function swat(p, dir, strength) {
        p.omega += dir * (2.2 + 3.2 * strength);
        return p;
    }

    // ---- The tree -----------------------------------------------------------------

    // The tree as a rod pivoting on one corner of its stand: phi (radians,
    // the fall's side in `dir`), omega. 'wobble' springs back toward 0; once
    // past `tip` it falls, faster and faster (a rod: 3g/2h sin), until it
    // lies on the floor at `rest`, bouncing once or twice.
    const TREE = { tip: 0.2, rest: 1.42 };
    function treeStep(t, dt, height, g = 2600) {
        const k = 1.5 * g / Math.max(50, height);
        if (t.state === 'wobble') {
            t.omega += (-t.phi * 38 - t.omega * 4.5) * dt;
            t.phi += t.omega * dt;
            if (Math.abs(t.phi) > TREE.tip) { t.state = 'fall'; t.dir = Math.sign(t.phi); }
            else if (Math.abs(t.phi) < 0.0008 && Math.abs(t.omega) < 0.01) { t.phi = 0; t.omega = 0; t.state = 'still'; }
        } else if (t.state === 'fall') {
            const a = Math.abs(t.phi);
            t.omega += t.dir * k * Math.sin(a) * dt;
            t.phi += t.omega * dt;
            if (Math.abs(t.phi) >= TREE.rest) {
                t.phi = t.dir * TREE.rest;
                t.bounces = (t.bounces || 0) + 1;
                t.omega = -t.omega * (t.bounces === 1 ? 0.22 : 0.08);
                if (t.bounces >= 3 || Math.abs(t.omega) < 0.05) { t.state = 'down'; t.omega = 0; }
            }
        }
        return t;
    }

    // ---- The director ---------------------------------------------------------------

    // After a stare, what the cat at the ornament does next. `mischief`
    // (0–1, the setting) and the cat's trouble raise the stakes.
    function escalate(cat, mischief, rand, canTopple = true) {
        const t = cat.traits.trouble, m = clamp(mischief, 0, 1);
        const climb = canTopple ? 0.05 + 0.3 * t * m : 0;
        const knock = 0.08 + 0.32 * t * (0.4 + m);
        const bat = 0.3 + 0.4 * m;
        const r = rand() * (climb + knock + bat + 0.35);
        return r < climb ? 'climb' : r < climb + knock ? 'knock' : r < climb + knock + bat ? 'bat' : 'settle';
    }

    // Does a climb bring the tree down? Heavy cats always; the others now and then.
    function climbTopples(cat, rand) {
        return !!cat.heavy || rand() < 0.35 + 0.4 * cat.traits.trouble;
    }

    // What a cat that isn't at the ornament does next, by temperament.
    function idle(cat, rand, options = {}) {
        const t = cat.traits;
        const w = [
            ['sleep', t.sleep * 1.2], ['loaf', 0.35 + t.lounge * 0.3], ['lounge', t.lounge * 0.8], ['blink', t.love * 0.8],
            ['groom', 0.35], ['wander', 0.3 + t.play * 0.2], ['zoom', options.zoom === false ? 0 : t.zoom], ['watch', 0.25 + t.stare * 0.4],
            ['box', options.box ? t.sleep * 0.8 : 0], ['lurk', options.lurk ? t.lurk * 0.6 : 0],
        ];
        let r = rand() * w.reduce((s, [, v]) => s + v, 0);
        for (const [name, v] of w) { if ((r -= v) < 0) return name; }
        return 'loaf';
    }

    // Christmas Eve and Day, by the host's clock.
    function holiday(date) {
        if (date.getMonth() !== 11) return null;
        return date.getDate() === 24 ? 'eve' : date.getDate() === 25 ? 'day' : null;
    }

    return { ROSTER, byId, pickName, cast, pendulumStep, swat, TREE, treeStep, escalate, climbTopples, idle, holiday, clamp };
})();
