// Wayfarer's companions (SPEC §10.38): everyone in WayLogic.COMPANIONS,
// modelled and posed. Four-legged ones share a rig (a body that swells from
// rump to chest, legs on two joints, a neck, a head with a muzzle, ears and
// eyes, a tail) and differ in their measure, their coat, their gait and
// what they do at rest; birds share another; the rest (a lantern with a
// face, a clockwork beetle, a small cloud) are each their own.
//
// The named cats wear the coats they have in The Cat vs. the Ornament and
// on Sky Island: black and fluffy with a grin, buff tabby, white with black
// patches, a tuxedo, grey tabby, tortie, mottled grey, orange and white,
// and a blue Persian.

const WayCompanions = (() => {
    const L = WayLogic, M = WayModels, C = M.C, TAU = Math.PI * 2;
    const part = (key, make) => M.model('pal:' + key, make);
    const shiny = (col, shine) => Object.assign([...col], { shine });
    const BLACK = shiny([24, 22, 24], 0.9), PINK = [236, 160, 168], BRASS = shiny([200, 160, 80], 0.8), COPPER = shiny([184, 110, 70], 0.7);
    const hashf = (a, b) => { const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); };
    const shag = (i, k) => 0.8 + 0.28 * hashf(i, k);
    const patch = (x, y, z, f, seed) => L.noise2(x * f + z * f * 0.6 + 40, y * f - z * f * 0.5 + 40, seed);
    const ball = (s, x, y, z, rx, ry = rx, rz = rx, segs = 7, bands = 4, lump = 0) => s.blob(x, y, z, rx, ry, rz, { segs, bands, lump, under: 0.8, seed: 0.3 });

    // ---- Four legs ---------------------------------------------------------------------------
    // len, tall (to the shoulder), girth (the body's half-width); neck [length, lift]; head (its half-size); muzzle
    // [length, half-width]; ears [kind, size]; tail [kind, length, lift]; coat, under, mark(part, x, y, z) for
    // painted markings; gait and stride (metres to a cycle); rest: how it settles.
    const Q = (o) => ({ leg: 1, neck: [0.2, 0.7], muzzle: [0.1, 0.05], ears: ['prick', 1], tail: ['whip', 0.3, 0.4], gait: 'trot', stride: 0.8, eye: [40, 30, 26], nose: [34, 28, 30], ...o });
    const tabby = (dark, f = 46) => (p, x, y, z) => (p === 'body' && y > -0.03 && Math.sin(z * f + Math.abs(x) * 30) > 0.35) || (p === 'tail' && Math.sin(y * 50) > 0.2) || (p === 'head' && y > 0.045 && Math.abs(Math.sin(x * 90)) > 0.75 && z < 0.07) || (p === 'leg' && Math.sin(y * 60) > 0.55) ? dark : null;
    const socks = (white, base) => (p, x, y, z) => p === 'paw' || (p === 'shin' && y < -0.06) || (p === 'muzzle') || (p === 'body' && z > 0.1 && y < -0.01) || (p === 'body' && y < -0.065) || (p === 'neck' && z > 0.02) ? white : base ? base(p, x, y, z) : null;
    const CAT = { len: 0.46, tall: 0.27, girth: 0.1, neck: [0.08, 0.85], head: 0.092, muzzle: [0.032, 0.04], ears: ['prick', 1.15], tail: ['whip', 0.36, 1.25], stride: 0.42, gait: 'walk', cat: true, nose: PINK, leg: 1.05 };
    const KINDS = {
        // The named cats.
        moofy: Q({ ...CAT, size: 1.16, girth: 0.122, coat: [38, 35, 42], eye: [198, 214, 74], fluff: 1, tail: ['plume', 0.4, 1.2], nose: [74, 52, 56], grin: true, rest: 'curl' }),
        butters: Q({ ...CAT, size: 1.05, girth: 0.132, belly: 1.12, coat: [226, 181, 124], under: [244, 223, 186], eye: [216, 164, 60], mark: tabby([196, 148, 92], 40), rest: 'belly' }),
        waffles: Q({ ...CAT, size: 0.98, coat: [246, 243, 238], eye: [140, 192, 106], mark: (p, x, y, z) => (p === 'body' || p === 'head' || p === 'tail' || p === 'leg') && patch(x, y, z, 9, 31) > 0.56 ? [31, 29, 36] : null, rest: 'sit' }),
        ras: Q({ ...CAT, coat: [30, 28, 32], eye: [224, 192, 64], mark: socks([246, 244, 240]), nose: [60, 44, 48], rest: 'sit' }),
        ibbie: Q({ ...CAT, size: 0.92, coat: [142, 144, 152], under: [186, 188, 194], eye: [156, 194, 122], mark: tabby([92, 94, 104]), rest: 'curl' }),
        maus: Q({ ...CAT, size: 0.9, girth: 0.094, coat: [35, 28, 26], eye: [232, 176, 48], mark: (p, x, y, z) => (p === 'head' && x > 0.004) ? [122, 68, 32] : patch(x, y, z, 26, 17) > 0.6 ? [142, 84, 38] : patch(x, y, z, 21, 5) > 0.66 ? [110, 60, 30] : null, rest: 'sit' }),
        turkey: Q({ ...CAT, size: 1.24, girth: 0.12, chest: 1.14, leg: 1.2, coat: [133, 136, 143], under: [185, 187, 192], eye: [200, 176, 80], mark: (p, x, y, z) => { const n = patch(x, y, z, 24, 23); return p === 'paw' ? null : n > 0.62 ? [92, 95, 102] : n < 0.34 ? [154, 157, 163] : null; }, rest: 'belly' }),
        harry: Q({ ...CAT, coat: [229, 137, 59], eye: [216, 180, 64], mark: socks([248, 241, 230], tabby([204, 112, 42])), rest: 'sit' }),
        kittytoes: Q({ ...CAT, girth: 0.118, coat: [140, 149, 170], under: [166, 174, 192], eye: [224, 138, 44], fluff: 1.3, muzzle: [0.012, 0.042], tail: ['plume', 0.36, 1.3], ears: ['prick', 0.8], nose: [110, 110, 130], rest: 'sit' }),
        cat: Q({ ...CAT, coat: [150, 118, 84], under: [214, 196, 168], eye: [170, 190, 90], mark: tabby([88, 64, 46]), rest: 'curl' }),
        // Dogs.
        dog: Q({ len: 0.74, tall: 0.5, girth: 0.17, neck: [0.2, 0.75], head: 0.13, muzzle: [0.14, 0.058], ears: ['flop', 0.9], tail: ['whip', 0.36, 1.0], coat: [170, 126, 84], under: [222, 196, 160], collar: [170, 50, 46], wag: 9, rest: 'sit' }),
        hound: Q({ len: 0.86, tall: 0.6, girth: 0.165, deep: 1.18, neck: [0.26, 0.6], head: 0.135, muzzle: [0.18, 0.062], ears: ['flop', 1.7], tail: ['whip', 0.46, 0.9], coat: [190, 130, 76], under: [240, 232, 216], mark: (p, x, y, z) => (p === 'body' && y > 0.04 && z < 0.2) ? [70, 50, 40] : p === 'paw' || p === 'muzzle' ? [240, 232, 216] : null, stride: 1.0, wag: 6, rest: 'lie' }),
        sheepdog: Q({ len: 0.78, tall: 0.5, girth: 0.19, neck: [0.2, 0.7], head: 0.135, muzzle: [0.13, 0.058], ears: ['flop', 0.8], tail: ['plume', 0.4, 0.5], coat: [34, 32, 36], fluff: 0.9, mark: (p, x, y, z) => p === 'paw' || p === 'muzzle' || p === 'shin' || (p === 'neck') || (p === 'body' && z > 0.2) || (p === 'head' && Math.abs(x) < 0.03 && y > 0) || (p === 'tail' && y > 0.3) ? [244, 242, 236] : null, wag: 8, rest: 'lie' }),
        pup: Q({ len: 0.46, tall: 0.3, girth: 0.11, neck: [0.1, 0.9], head: 0.1, muzzle: [0.08, 0.05], ears: ['flop', 0.7], tail: ['stub', 0.14, 1.3], coat: [236, 226, 204], shag: true, mark: (p, x, y, z) => (p === 'head' && x < -0.01 && y > -0.02) || (p === 'body' && z < -0.08 && y > 0) ? [150, 100, 60] : null, stride: 0.45, wag: 13, rest: 'sit' }),
        // The farm.
        pony: Q({ len: 1.35, tall: 1.05, girth: 0.34, neck: [0.5, 0.85], head: 0.2, muzzle: [0.24, 0.1], ears: ['prick', 0.6], tail: ['fall', 0.75, -0.75], coat: [200, 168, 122], mark: (p, x, y, z) => p === 'paw' ? [70, 56, 48] : p === 'shin' ? [236, 226, 206] : null, mane: [244, 234, 212], hoof: true, load: true, stride: 1.5, gait: 'walk', rest: 'graze' }),
        donkey: Q({ len: 1.2, tall: 0.95, girth: 0.32, belly: 1.1, neck: [0.42, 0.7], head: 0.2, muzzle: [0.24, 0.1], ears: ['long', 1.0], tail: ['tuft', 0.55, -0.8], coat: [150, 144, 140], under: [226, 220, 210], mark: (p, x, y, z) => p === 'muzzle' ? [236, 230, 220] : p === 'paw' ? [60, 54, 52] : (p === 'body' && y > 0.2 && (Math.abs(x) < 0.04 || (Math.abs(z - 0.26) < 0.035 && y > 0.1))) ? [84, 78, 76] : null, mane: [70, 64, 62], hoof: true, load: true, stride: 1.3, gait: 'walk', rest: 'graze' }),
        goat: Q({ len: 0.9, tall: 0.66, girth: 0.23, neck: [0.28, 0.85], head: 0.125, muzzle: [0.12, 0.055], ears: ['flop', 0.7], tail: ['stub', 0.12, 1.2], coat: [226, 216, 196], mark: (p, x, y, z) => p === 'paw' ? [60, 52, 48] : (p === 'body' && patch(x, y, z, 5, 3) > 0.6) ? [150, 110, 80] : null, horns: 0.2, beard: true, bell: true, hoof: true, stride: 0.8, rest: 'graze' }),
        pig: Q({ len: 0.95, tall: 0.5, girth: 0.27, belly: 1.12, deep: 0.98, neck: [0.12, 0.25], head: 0.16, muzzle: [0.12, 0.085], ears: ['flop', 0.8], tail: ['curl', 0.16, 0.6], coat: [240, 178, 170], mark: (p, x, y, z) => p === 'paw' ? [150, 110, 100] : (p === 'body' && patch(x, y, z, 4, 8) > 0.68) ? [120, 92, 90] : null, snout: true, nose: [226, 140, 140], leg: 1.1, hoof: true, stride: 0.6, gait: 'waddle', rest: 'lie' }),
        lamb: Q({ len: 0.62, tall: 0.48, girth: 0.17, neck: [0.16, 0.9], head: 0.1, muzzle: [0.08, 0.05], ears: ['flop', 0.8], tail: ['stub', 0.14, -0.4], coat: [246, 242, 232], wool: true, mark: (p) => p === 'paw' ? [60, 52, 52] : null, face: [70, 60, 60], hoof: true, stride: 0.55, rest: 'lie', wag: 14 }),
        // The wild.
        fox: Q({ len: 0.68, tall: 0.38, girth: 0.13, neck: [0.15, 0.75], head: 0.115, muzzle: [0.13, 0.045], ears: ['prick', 1.5], tail: ['brush', 0.52, 0.2], coat: [222, 120, 50], under: [250, 244, 232], mark: (p, x, y, z) => p === 'shin' || p === 'paw' ? [56, 42, 40] : p === 'muzzle' && y < -0.03 ? [250, 244, 232] : p === 'tail' && y > 0.4 ? [250, 244, 232] : p === 'ear' && y > 0.14 ? [50, 38, 36] : p === 'neck' && z > 0.02 ? [250, 244, 232] : null, stride: 0.62, rest: 'curl' }),
        badger: Q({ len: 0.7, tall: 0.3, girth: 0.17, deep: 0.9, neck: [0.12, 0.3], head: 0.11, muzzle: [0.13, 0.05], ears: ['round', 0.7], tail: ['stub', 0.16, 0.2], coat: [124, 124, 128], under: [44, 42, 46], shag: true, mark: (p, x, y, z) => p === 'leg' || p === 'shin' || p === 'paw' ? [40, 38, 42] : p === 'head' || p === 'muzzle' ? (Math.abs(Math.abs(x) - 0.045) < 0.022 ? [34, 32, 36] : [246, 244, 240]) : null, leg: 1.2, stride: 0.42, gait: 'waddle', rest: 'lie' }),
        otter: Q({ len: 0.78, tall: 0.24, girth: 0.11, neck: [0.16, 0.5], head: 0.092, muzzle: [0.05, 0.05], ears: ['round', 0.5], tail: ['thick', 0.46, 0.05], coat: [112, 78, 54], under: [214, 186, 150], mark: (p, x, y, z) => (p === 'muzzle' || (p === 'neck' && z > 0.01)) ? [224, 200, 166] : null, stride: 0.6, gait: 'bound', rest: 'lie' }),
        hedgehog: Q({ splay: 0.45, len: 0.24, tall: 0.1, girth: 0.07, neck: [0.02, 0.2], head: 0.045, muzzle: [0.045, 0.02], ears: ['round', 0.6], tail: ['none', 0, 0], coat: [196, 170, 136], spines: true, stride: 0.14, gait: 'scuttle', rest: 'curl' }),
        hare: Q({ len: 0.46, tall: 0.26, girth: 0.11, hip: 1.15, neck: [0.07, 0.9], head: 0.075, muzzle: [0.04, 0.035], ears: ['long', 1.35], tail: ['stub', 0.07, 1.0], coat: [246, 246, 250], mark: (p, x, y, z) => p === 'ear' && y > 0.2 ? [40, 38, 44] : null, eye: [30, 24, 28], nose: PINK, haunch: 1.4, stride: 0.9, gait: 'hop', rest: 'sit' }),
        fawn: Q({ len: 0.84, tall: 0.72, girth: 0.16, neck: [0.34, 1.05], head: 0.1, muzzle: [0.09, 0.04], ears: ['prick', 1.6], tail: ['stub', 0.12, 0.9], coat: [196, 140, 88], under: [246, 238, 222], mark: (p, x, y, z) => p === 'paw' ? [50, 40, 36] : (p === 'body' && y > 0.02 && patch(x, y, z, 34, 4) > 0.69) ? [250, 244, 230] : p === 'tail' ? [250, 244, 230] : null, leg: 0.8, hoof: true, stride: 0.95, rest: 'lie' }),
        cub: Q({ len: 0.72, tall: 0.42, girth: 0.21, belly: 1.08, neck: [0.14, 0.5], head: 0.14, muzzle: [0.09, 0.062], ears: ['round', 1.0], tail: ['stub', 0.08, 0.3], coat: [112, 78, 54], shag: true, mark: (p) => p === 'muzzle' ? [190, 150, 110] : null, leg: 1.35, stride: 0.6, gait: 'waddle', rest: 'sit' }),
        squirrel: Q({ len: 0.2, tall: 0.1, girth: 0.045, hip: 1.2, neck: [0.02, 0.9], head: 0.04, muzzle: [0.02, 0.018], ears: ['tuft', 1.2], tail: ['plume', 0.24, 1.9], coat: [196, 96, 46], under: [248, 238, 220], stride: 0.3, gait: 'bound', rest: 'sit' }),
        tortoise: Q({ splay: 0.7, len: 0.6, tall: 0.22, girth: 0.2, deep: 0.62, neck: [0.16, 0.25], head: 0.07, muzzle: [0.04, 0.045], ears: ['none', 0], tail: ['stub', 0.06, -0.6], coat: [126, 136, 84], shell: true, mark: (p, x, y, z) => hashf(Math.round(x * 60), Math.round((y + z) * 60)) > 0.6 ? [104, 114, 70] : null, leg: 1.7, stride: 0.34, gait: 'plod', rest: 'tuck' }),
        frog: Q({ splay: 0.6, len: 0.26, tall: 0.1, girth: 0.085, deep: 0.8, hip: 0.8, chest: 1.1, neck: [0.02, 0.3], head: 0.07, muzzle: [0.03, 0.06], ears: ['none', 0], tail: ['none', 0, 0], coat: [110, 170, 70], under: [232, 232, 180], mark: (p, x, y, z) => p === 'body' && y > 0.02 && patch(x, y, z, 30, 2) > 0.66 ? [60, 110, 50] : null, eye: [230, 190, 60], popeyed: true, haunch: 1.6, stride: 0.8, gait: 'hop', rest: 'sit' }),
        // What grazes and runs along the road, seen close (WayActors' plainer beasts stand in further off).
        sheep: Q({ len: 1.0, tall: 0.66, girth: 0.3, neck: [0.22, 0.6], head: 0.13, muzzle: [0.11, 0.06], ears: ['flop', 0.7], tail: ['stub', 0.14, -0.4], coat: [240, 236, 224], wool: true, mark: p => p === 'paw' || p === 'shin' ? [60, 52, 52] : null, face: [60, 52, 52], hoof: true, stride: 0.8, gait: 'walk', rest: 'graze' }),
        cow: Q({ len: 1.8, tall: 1.28, girth: 0.44, belly: 1.1, neck: [0.46, 0.25], head: 0.23, muzzle: [0.2, 0.12], ears: ['flop', 0.6], tail: ['tuft', 0.8, -0.85], coat: [150, 96, 60], mark: (p, x, y, z) => p === 'paw' ? [60, 50, 46] : p === 'muzzle' ? [240, 222, 210] : (p === 'body' || p === 'head') && patch(x, y, z, 2.6, 12) > 0.56 ? [244, 238, 226] : null, horns: 0.16, hoof: true, nose: [226, 170, 170], stride: 1.6, gait: 'walk', rest: 'graze' }),
        deer: Q({ len: 1.3, tall: 1.0, girth: 0.24, neck: [0.5, 1.0], head: 0.14, muzzle: [0.13, 0.05], ears: ['prick', 1.3], tail: ['stub', 0.14, 0.9], coat: [186, 134, 84], under: [246, 240, 228], mark: (p, x, y, z) => p === 'paw' ? [50, 40, 36] : p === 'tail' ? [246, 240, 228] : null, horns: 0.3, leg: 0.8, hoof: true, stride: 1.3, gait: 'trot', rest: 'graze' }),
        rabbit: Q({ len: 0.3, tall: 0.16, girth: 0.085, hip: 1.15, neck: [0.04, 0.9], head: 0.07, muzzle: [0.03, 0.03], ears: ['long', 1.1], tail: ['stub', 0.05, 1.0], coat: [176, 150, 120], under: [236, 226, 210], nose: PINK, haunch: 1.4, stride: 0.5, gait: 'hop', rest: 'sit' }),
        horse: Q({ len: 1.8, tall: 1.42, girth: 0.38, neck: [0.68, 0.85], head: 0.22, muzzle: [0.26, 0.1], ears: ['prick', 0.6], tail: ['fall', 0.9, -0.8], coat: [134, 90, 60], mark: p => p === 'paw' ? [50, 40, 36] : p === 'shin' ? [80, 56, 44] : null, mane: [50, 40, 36], hoof: true, stride: 1.9, gait: 'trot', rest: 'graze' }),
        // The druid's other shapes: each keeps her antlers, a collar of leaves, and her marks, which still glow.
        bear: Q({ len: 1.75, tall: 1.04, girth: 0.46, belly: 1.08, hip: 1.02, neck: [0.32, 0.36], head: 0.27, muzzle: [0.2, 0.115], ears: ['round', 0.9], tail: ['stub', 0.12, 0.2], coat: [104, 76, 56], under: [84, 62, 48], shag: true, mark: p => p === 'muzzle' ? [176, 140, 104] : null, leg: 1.3, stride: 1.5, gait: 'walk', rest: 'sit', druid: 1 }),
        panther: Q({ len: 1.5, tall: 0.8, girth: 0.235, chest: 1.1, neck: [0.26, 0.55], head: 0.2, muzzle: [0.085, 0.09], ears: ['prick', 0.75], tail: ['whip', 1.15, 0.5], coat: shiny([30, 30, 42], 0.3), eye: [120, 255, 200], cat: true, nose: [50, 44, 56], leg: 1.05, stride: 1.25, gait: 'walk', rest: 'curl', druid: 0.8 }),
        // The wild ones of each country (WayLogic.WILD), on the same rig: most are a cousin of somebody above.
        // A dragon, but a small one: the quad's rig with wings, horns and a ridge down its back.
        whelp: Q({ len: 0.66, tall: 0.36, girth: 0.14, neck: [0.24, 0.95], head: 0.1, muzzle: [0.12, 0.05], ears: ['none', 0], tail: ['thick', 0.62, 0.1], coat: [60, 150, 130], under: [240, 220, 150], mark: (p, x, y, z) => p === 'muzzle' && y < -0.025 ? [240, 220, 150] : p === 'body' && y > 0.02 && patch(x, y, z, 40, 9) > 0.62 ? [44, 120, 112] : null, eye: [255, 200, 60], horns: 0.12, ridge: true, wings: true, stride: 0.6, rest: 'curl' }),
    };

    // The druid's antlers, on whatever head she has: the same rack as her helm's, each beam sweeping back, out and up
    // with five tines, moss on it, and her light at every tip.
    function antlers(s, x0, y0, z0, k, plain = false) {
        for (const x of [-1, 1]) {
            const beam = [[0, 0, 0, 0.03], [0.07, 0.1, -0.07, 0.027], [0.17, 0.2, -0.14, 0.024], [0.27, 0.34, -0.14, 0.02], [0.31, 0.5, -0.07, 0.016], [0.28, 0.64, 0.03, 0.011], [0.23, 0.72, 0.11, 0]].map(([dx, dy, dz, r]) => [x * (x0 + dx * k), y0 + dy * k, z0 + dz * k, r * k, 1]);
            s.paint([240, 232, 212], 0).fx(0).tube(beam, 5);
            const tips = [beam[6]];
            for (const [at, dx, dy, dz] of [[1, 0.02, 0.1, 0.16], [2, 0.1, 0.14, 0.1], [3, 0.14, 0.12, -0.02], [4, 0.1, 0.15, -0.1], [5, -0.05, 0.1, -0.07]]) {
                const b = beam[at], tip = [b[0] + x * dx * k, b[1] + dy * k, b[2] + dz * k];
                s.tube([[b[0], b[1], b[2], b[3] * 0.8, 1], [b[0] + x * dx * k * 0.62, b[1] + dy * k * 0.4, b[2] + dz * k * 0.62, b[3] * 0.6, 1], [tip[0], tip[1], tip[2], 0, 1]], 4);
                tips.push(tip);
            }
            if (!plain) for (const at of [2, 4]) s.paint([104, 150, 78], 0).blob(beam[at][0], beam[at][1] + 0.016 * k, beam[at][2], 0.032 * k, 0.015 * k, 0.032 * k, { segs: 5, bands: 3, lump: 0.3, seed: at });
            if (!plain) for (const tip of tips) s.paint([150, 255, 214], 0).fx(0, 255).blob(tip[0], tip[1], tip[2], 0.01 * k, 0.01 * k, 0.01 * k, { segs: 5, bands: 3, lump: 0, under: 1 });
            s.fx(0);
        }
    }
    // Rings between the rings, so a coat's markings have somewhere to be painted; and tufts of fur along an edge.
    const finer = (path, n = 2) => { const out = []; for (let i = 0; i < path.length - 1; i++) for (let k = 0; k < n; k++) { const t = k / n, e = t * t * (3 - 2 * t); out.push(path[i].map((v, j) => v + (path[i + 1][j] - v) * (j < 3 ? t : e))); } out.push(path[path.length - 1]); return out; };
    const tuft = (s, at, out, len, wide, tone = 1) => { const col = s.col, l = Math.hypot(out[0], out[1], out[2]) || 1, sx = out[1] / l * wide, sy = -out[0] / l * wide, sz = wide * 0.6; s.col = [Math.min(255, col[0] * tone), Math.min(255, col[1] * tone), Math.min(255, col[2] * tone)]; s.tri([at[0] - sx, at[1] - sy, at[2] - sz], [at[0] + sx, at[1] + sy, at[2] + sz], [at[0] + out[0] * len, at[1] + out[1] * len, at[2] + out[2] * len], [out[0] / l, out[1] / l + 0.3, out[2] / l]); s.col = col; };
    // lite: the same animal in a third of the triangles, for further off and for the Low tier.
    Object.assign(KINDS, {
        grizzly: { ...KINDS.bear, druid: 0 },
        stag: { ...KINDS.deer, size: 1.22, horns: 0, rack: 0.62, coat: [150, 104, 70], under: [226, 214, 196] },
        moonstag: { ...KINDS.deer, size: 1.22, horns: 0, rack: 0.62, coat: [240, 242, 250], under: [250, 250, 252], mark: null },
        boar: { ...KINDS.pig, coat: [84, 66, 56], under: [70, 56, 48], shag: true, mark: p => p === 'paw' ? [40, 34, 32] : null, nose: [70, 56, 56], size: 1.05 },
        piglet: { ...KINDS.pig, size: 0.4, coat: [176, 136, 96], mark: (p, x, y, z) => p === 'body' && Math.sin(x * 60) > 0.3 && y > 0 ? [110, 80, 60] : null, nose: [150, 110, 100] },
        brownhare: { ...KINDS.hare, coat: [170, 138, 100], under: [236, 226, 208], mark: (p, x, y, z) => p === 'ear' && y > 0.2 ? [40, 34, 34] : null, size: 1.15 },
        wildpony: { ...KINDS.pony, load: false, coat: [112, 84, 64], mane: [44, 36, 34], mark: p => p === 'paw' ? [40, 34, 32] : null, size: 0.92 },
        ibex: { ...KINDS.goat, bell: false, coat: [206, 196, 180], horns: 0.44, mark: p => p === 'paw' || p === 'shin' ? [70, 60, 56] : null, size: 1.12 },
        marmot: { ...KINDS.cub, size: 0.5, coat: [176, 144, 98], mark: p => p === 'muzzle' ? [226, 206, 170] : null, gait: 'bound', stride: 0.3 },
        seal: { ...KINDS.otter, rest: 'graze', gait: 'waddle', size: 2.1, coat: [120, 124, 134], under: [176, 178, 184], mark: (p, x, y, z) => patch(x, y, z, 18, 6) > 0.66 ? [90, 92, 102] : null, leg: 0.7 },
    });
    function quadParts(id, lite = false) {
        const F = lite ? (path => path) : finer;
        const q = KINDS[id], g = q.girth * (1 + 0.16 * (q.fluff || 0)), len = q.len, h = q.head, leg = q.leg, deep = q.deep ?? 1.04, k = `quad:${id}:${lite ? 'lite' : 'fine'}:`;
        const dye = name => (x, y, z) => (q.mark && q.mark(name, x, y, z)) || (name === 'body' && q.under && y < -0.42 * g ? q.under : null);
        const furry = q.shag || q.fluff ? shag : null, LG = legsOf(q);
        return {
            body: part(k + 'body', s => {
                // A rump, a waist behind the ribs, a barrel of a chest, and the root of the neck; a shoulder and a haunch each side.
                s.mark(dye('body')).paint(q.coat, 0).fx(0).tube(F([[0, 0.04 * g, -len * 0.52, g * 0.3, 1], [0, 0.03 * g, -len * 0.44, g * 0.74 * (q.hip ?? 0.95), deep], [0, 0.02 * g, -len * 0.3, g * 1.02 * (q.hip ?? 0.95), deep], [0, -0.03 * g, -len * 0.1, g * 0.94 * (q.belly ?? 1), deep], [0, -0.06 * g, len * 0.1, g * (q.belly ?? 1), deep * 1.02], [0, -0.02 * g, len * 0.28, g * 1.06 * (q.chest ?? 1.03), deep * 1.06], [0, 0.06 * g, len * 0.42, g * 0.8, 1.06], [0, 0.12 * g, len * 0.5, g * 0.52, 1.05]], 3), lite ? 9 : 16, { cap: 3, k: furry });
                if (!q.shell && !q.spines && !lite) for (const x of [-1, 1]) { ball(s, x * g * 0.5, -g * 0.12, len * 0.31, g * 0.5 * leg, g * 0.62, g * 0.5, 9, 5, furry ? 0.08 : 0); ball(s, x * g * 0.5, -g * 0.05, -len * 0.33, g * 0.56 * leg * (q.haunch || 1), g * 0.7, g * 0.6, 9, 5, furry ? 0.08 : 0); }
                if (!lite && (q.cat || q.shag || q.fluff)) for (let i = 0; i < 9; i++) { const a = (i - 4) * 0.3; tuft(s, [Math.sin(a) * g * 0.6, -g * 0.5 - 0.1 * g * Math.cos(a), len * 0.36], [Math.sin(a) * 0.5, -0.8, 0.5], g * (0.3 + 0.2 * hashf(i, 4)) * (q.fluff ? 1.6 : 1), g * 0.13, 0.9 + 0.2 * hashf(i, 5)); }
                if (q.fluff) { ball(s, 0, 0.02, len * 0.36, g * 1.04, g * 1.0, g * 0.62, 9, 5, 0.14); ball(s, 0, -0.1 * g, -len * 0.3, g * 1.02, g * 0.95, g * 0.7, 9, 5, 0.14); }
                if (q.wool) for (let i = 0; i < 9; i++) { const a = i * 2.4, z = -len * 0.4 + i * len * 0.1; s.blob(Math.sin(a) * g * 0.5, g * (0.3 + 0.3 * Math.cos(a)), z, g * 0.6, g * 0.56, g * 0.6, { segs: 6, bands: 4, lump: 0.2, seed: i, under: 0.75 }); }
                s.mark(null);
                if (q.spines) { s.mark((x, y, z) => hashf(Math.round(x * 300), Math.round(z * 300) + Math.round(y * 300)) > 0.5 ? [226, 212, 186] : null).paint([96, 74, 56], 0).blob(0, g * 0.25, -len * 0.06, g * 1.2, g * 1.1, len * 0.5, { segs: 12, bands: 7, lump: 0.42, seed: 0.9, under: 0.7 }); s.mark(null); }
                if (q.shell) {
                    // A domed shell in plates, with moss on it, a toadstool and a flower or two.
                    s.mark((x, y, z) => { const u = Math.abs(((Math.atan2(x, z) / TAU * 6) % 1 + 1) % 1 - 0.5), v = Math.abs(((y / (g * 0.5)) % 1 + 1) % 1 - 0.5); return u > 0.42 || v > 0.42 ? [70, 58, 44] : null; });
                    s.paint([134, 108, 70], 0).blob(0, g * 0.5, -len * 0.02, g * 1.3, g * 1.0, len * 0.56, { segs: 12, bands: 6, lump: 0.02, under: 0.7 });
                    s.mark(null);
                    for (const [x, z, r] of [[-0.05, -0.08, 0.1], [0.07, 0.05, 0.08], [0, 0.16, 0.07], [0.02, -0.2, 0.07]]) s.paint([96, 140, 70], 0).blob(x, g * 1.36 - Math.hypot(x, z) * 0.35, z, r, 0.035, r, { segs: 7, bands: 3, lump: 0.25, seed: x * 9 });
                    s.paint([240, 232, 214], 0).tube([[0.08, g * 1.3, -0.1, 0.012, 1], [0.085, g * 1.3 + 0.07, -0.1, 0.01, 1]], 5).paint([206, 64, 60], 0).blob(0.085, g * 1.3 + 0.08, -0.1, 0.035, 0.02, 0.035, { segs: 7, bands: 3, lump: 0 });
                    for (const [x, z, c] of [[-0.09, 0.02, [250, 220, 90]], [-0.03, 0.12, [240, 240, 250]], [0.04, -0.04, [240, 150, 200]]]) s.paint(c, 0).fx(60).blob(x, g * 1.42 - Math.hypot(x, z) * 0.3, z, 0.016, 0.01, 0.016, { segs: 5, bands: 2, lump: 0 });
                    s.fx(0);
                }
                if (q.load) {
                    // Panniers either side on a girth, a blanket under them, and a roll across the top.
                    s.paint([170, 60, 56], 0).tube([[0, -0.02, -len * 0.16, g * 1.04, deep], [0, -0.02, len * 0.14, g * 1.05, deep]], 12, { k: (i, k2) => k2 % 3 ? 1 : 0.8 });
                    for (const x of [-1, 1]) { s.paint([150, 110, 76], 0).box(x * (g + 0.09), 0.0, 0, 0.1, 0.18, 0.24, 0.75, [[120, 86, 60], 0]); s.paint([90, 64, 46], 0).box(x * (g + 0.195), 0.02, 0, 0.008, 0.03, 0.1, 1).paint(BRASS, 0).box(x * (g + 0.205), -0.02, 0, 0.006, 0.02, 0.02, 1); }
                    s.paint([200, 176, 130], 0).at(M.mul(M.move(0, g * deep + 0.1, 0), M.rotZ(Math.PI / 2))).tube([[0, -g - 0.06, 0, 0.1, 1], [0, g + 0.06, 0, 0.1, 1]], 8, { cap: 3, k: (i, k2) => k2 % 2 ? 0.9 : 1 });
                    s.at(null).paint([70, 110, 150], 0).box(0, g * deep + 0.02, -len * 0.26, g * 0.7, 0.05, 0.1, 1);
                }
                if (q.druid) for (const x of [-1, 1]) for (let i = 0; i < 3; i++) s.paint([120, 255, 200], 0).fx(0, 230).blob(x * g * (0.9 - 0.04 * i), g * (0.34 - 0.14 * i), len * (0.26 - 0.07 * i), 0.012, g * 0.11, g * 0.2, { segs: 6, bands: 3, lump: 0, under: 1 }).fx(0);       // her marks, on the shoulder
                if (q.ridge) for (let i = 0; i < 7; i++) { const z = len * 0.36 - i * len * 0.12; s.paint([240, 190, 90], 0).prism(4, 0, g * deep * 0.94, z, 0.022, g * deep * 0.94 + 0.055 - 0.004 * i, 0, { squash: 1.6, flat: true }); }
            }),
            // The legs (the eighth pass): an upper bone to the wrist or hock, a lower to the fetlock, and the foot (a hoof,
            // or a paw with toes) on a joint of its own, so it can stand flat on the ground while the leg above it swings.
            fore: part(k + 'fore', s => { const l = LG.fore; s.mark(dye('leg')).paint(q.coat, 0).fx(0).tube(F([[0, 0.1 * g, 0, g * 0.42 * leg, 1.1], [0, -l * 0.3, 0.01, g * 0.36 * leg, 1.1], [0, -l * 0.7, 0, g * 0.26 * leg, 1], [0, -l * 1.04, 0, g * 0.21 * leg, 1]]), lite ? 6 : 10, { k: furry, cap: 3 }); ball(s, 0, -l, -g * 0.02, g * 0.23 * leg, g * 0.22 * leg, g * 0.25 * leg, 8, 4); s.mark(null); }),
            hind: part(k + 'hind', s => { const l = LG.hind; s.mark(dye('leg')).paint(q.coat, 0).fx(0).tube(F([[0, 0.14 * g, 0, g * 0.5 * leg * (q.haunch || 1), 1.3], [0, -l * 0.3, 0.02 * g, g * 0.46 * leg * (q.haunch || 1), 1.25], [0, -l * 0.72, -0.01 * g, g * 0.28 * leg, 1.1], [0, -l * 1.04, 0, g * 0.21 * leg, 1]]), lite ? 6 : 10, { k: furry, cap: 3 }); ball(s, 0, -l, -g * 0.05, g * 0.23 * leg, g * 0.22 * leg, g * 0.27 * leg, 8, 4); s.mark(null); }),
            shin: part(k + 'shin', s => {
                const f = LG.shin;
                s.mark(dye('shin')).paint(q.coat, 0).fx(0).tube(F([[0, 0.04, 0, g * 0.21 * leg, 1], [0, -f * 0.33, 0, g * 0.19 * leg, 1], [0, -f * 0.7, 0, g * 0.155 * leg, 1], [0, -f * 1.04, 0.004, g * 0.17 * leg, 1]]), lite ? 6 : 10, { cap: 1 });
                s.mark(null);
            }),
            foot: part(k + 'foot', s => {
                const c = LG.contact;
                s.mark(dye('paw'));
                if (q.hoof) { s.paint(q.coat, 0).fx(0).blob(0, 0, 0.004, g * 0.18 * leg, g * 0.16 * leg, g * 0.18 * leg, { segs: 7, bands: 3, lump: 0, under: 0.8 }); s.paint([56, 48, 46], 0).prism(7, 0, -c, g * 0.03, g * 0.2 * leg, -c * 0.42, g * 0.17 * leg, { cap: true }); }
                else { ball(s.paint(q.coat, 0).fx(0), 0, -c + g * 0.14 * leg, g * 0.1 * leg, g * 0.22 * leg, g * 0.14 * leg, g * 0.3 * leg, 9, 5); if (!lite) for (const x of [-1, 0, 1]) ball(s, x * g * 0.13 * leg, -c + g * 0.12 * leg, g * 0.33 * leg, g * 0.075 * leg, g * 0.08 * leg, g * 0.1 * leg, 5, 3); }
                s.mark(null);
            }),
            neck: part(k + 'neck', s => {
                const nl = q.neck[0];
                s.mark(dye('neck')).paint(q.coat, 0).fx(0).tube(F([[0, -0.06 * g - 0.02, 0, g * 0.74, 1], [0, nl * 0.3, 0, g * 0.6 * 0.6 + h * 0.74 * 0.5, 1], [0, nl * 0.75, 0, (g * 0.5 + h * 0.8) / 2, 1], [0, nl + h * 0.2, 0, h * 0.76, 1]]), lite ? 8 : 12, { k: furry });
                s.mark(null);
                if (q.fluff) ball(s, 0, nl * 0.5, 0.01, h * 1.15 * q.fluff, nl * 0.7 + 0.02, h * 1.15 * q.fluff, 9, 4, 0.16);          // a ruff
                if (q.mane) for (let i = 0; i < 5; i++) s.paint(q.mane, 0).blob(0, nl * (0.1 + i * 0.22), -h * 0.72, 0.035, nl * 0.2, 0.08, { segs: 5, bands: 3, lump: 0.2, seed: i });
                if (q.collar) s.paint(q.collar, 0).tube([[0, nl * 0.5 - 0.016, 0, (g * 0.62 + h * 0.74) / 2 + 0.008, 1], [0, nl * 0.5 + 0.016, 0, (g * 0.62 + h * 0.74) / 2 + 0.006, 1]], 9).paint(BRASS, 0).blob(0, nl * 0.5, (g * 0.62 + h * 0.74) / 2 + 0.012, 0.016, 0.016, 0.01, { segs: 6, bands: 3, lump: 0 });
                if (q.druid) for (let i = 0; i < 11; i++) { const a = i / 11 * TAU, R = (g * 0.62 + h * 0.74) / 2 * 1.02, c = Math.cos(a), n = Math.sin(a), tone = 0.8 + 0.3 * hashf(i, 3); s.paint([96 * tone, 160 * tone, 84 * tone], 0).fx(20).tri([n * R - c * 0.07 * q.druid, nl * 0.55, c * R + n * 0.07 * q.druid], [n * R + c * 0.07 * q.druid, nl * 0.55, c * R - n * 0.07 * q.druid], [n * R * 1.5, nl * 0.2, c * R * 1.5], [n * 0.8, 0.5, c * 0.8]); }       // a collar of leaves
                s.fx(0);
                if (q.bell) s.paint([150, 60, 50], 0).tube([[0, nl * 0.4 - 0.012, 0, h * 0.9, 1], [0, nl * 0.4 + 0.012, 0, h * 0.88, 1]], 9).paint(BRASS, 0).blob(0, nl * 0.4 - 0.02, h * 0.95, 0.03, 0.036, 0.03, { segs: 7, bands: 4, lump: 0 });
            }),
            head: part(k + 'head', s => {
                const [ml, mr] = q.muzzle, wide = q.cat ? 1.08 : 1;
                s.mark(dye('head')).paint(q.face || q.coat, 0).fx(0);
                ball(s, 0, 0, h * 0.3, h * 0.88 * wide, h * 0.84, h, lite ? 9 : 14, lite ? 5 : 8, q.fluff ? 0.07 : 0);
                if (!lite && (q.cat || q.fluff)) for (const x of [-1, 1]) for (let i = 0; i < 3; i++) tuft(s, [x * h * 0.74, -h * (0.1 + 0.16 * i), h * 0.5], [x * 1, -0.35 - 0.2 * i, -0.1], h * (0.42 - 0.07 * i) * (q.fluff ? 1.5 : 1), h * 0.13);       // whiskers of fur at the cheeks
                if (q.cat) for (const x of [-1, 1]) ball(s, x * h * 0.52, -h * 0.3, h * 0.55, h * 0.4, h * 0.34, h * 0.42, 7, 4, q.fluff ? 0.1 : 0);          // cheeks
                s.mark(dye('muzzle'));
                s.tube(F([[0, -h * 0.1, h * 0.7, mr * 1.36, 0.9], [0, -h * 0.16, h * 0.86, mr * 1.2, 0.86], [0, -h * 0.24, h * 0.86 + ml * 0.6, mr, 0.8], [0, -h * 0.28, h * 0.86 + ml, mr * (q.snout ? 0.95 : 0.7), 0.8]]), lite ? 7 : 10, { cap: 2 });
                s.mark(null);
                const tip = h * 0.86 + ml;
                if (q.snout) s.paint(q.nose, 0).prism(8, 0, -h * 0.28 - 0.001, tip, mr * 0.9, -h * 0.28, tip + 0.012, { squash: 0.8 }).tube([[0, -h * 0.28, tip - 0.01, mr * 0.96, 0.8], [0, -h * 0.28, tip + 0.012, mr * 0.9, 0.8]], 8, { cap: 2 });
                else ball(s.paint(q.nose, 0), 0, -h * 0.2, tip + mr * 0.3, mr * 0.42, mr * 0.34, mr * 0.36, 6, 3);
                s.paint([50, 36, 36], 0).quad([-mr * 0.7, -h * 0.28 - mr * 0.52, tip - ml * 0.5], [mr * 0.7, -h * 0.28 - mr * 0.52, tip - ml * 0.5], [mr * 0.45, -h * 0.28 - mr * 0.42, tip + mr * 0.2], [-mr * 0.45, -h * 0.28 - mr * 0.42, tip + mr * 0.2], [0, -0.9, 0.4]);       // the mouth
                if (q.grin) for (let i = -3; i < 3; i++) { const a0 = i * 0.34, a1 = a0 + 0.34, R = mr * 1.5, p = a => [Math.sin(a) * R, -h * 0.5 + (1 - Math.cos(a)) * R * 0.9, tip - mr * 0.1 - (1 - Math.cos(a)) * R * 0.5]; const A = p(a0), B = p(a1); s.paint([250, 250, 246], 0).quad(A, B, [B[0], B[1] + h * 0.1, B[2] + 0.004], [A[0], A[1] + h * 0.1, A[2] + 0.004], [0, 0, 1]); }
                for (const x of [-1, 1]) {
                    // Eyes that shine; a cat's are coloured, with a slit.
                    const ex = x * h * (q.popeyed ? 0.52 : 0.47), ey = h * (q.popeyed ? 0.7 : 0.2), ez = h * (q.popeyed ? 0.5 : 0.92), er = h * (q.popeyed ? 0.26 : q.cat ? 0.2 : 0.16);
                    s.paint(shiny(q.cat || q.popeyed ? q.eye : [250, 248, 240], 0.7), 0).blob(ex, ey, ez, er, er, er * (q.popeyed ? 0.7 : 0.4), { segs: 7, bands: 4, lump: 0, under: 1 });
                    s.paint(BLACK, 0).blob(ex + x * er * 0.1, ey, ez + er * (q.popeyed ? 0.42 : 0.24), er * (q.cat ? 0.26 : 0.62), er * (q.cat ? 0.74 : 0.62), er * (q.popeyed ? 0.4 : 0.22), { segs: 6, bands: 3, lump: 0, under: 1 });
                    const [ek, es] = q.ears, ea = x * h * 0.52;
                    s.mark(dye('ear')).paint(q.face || q.coat, 0);
                    if (ek === 'prick' || ek === 'tuft') { s.tube([[ea, h * 0.5, h * 0.12, h * 0.36 * Math.min(es, 1.2), 0.5], [ea * 1.12, h * (0.5 + 0.62 * es), h * 0.08, h * 0.2, 0.45], [ea * 1.2, h * (0.5 + 1.0 * es), h * 0.04, 0, 1]], 6); s.mark(null).paint(PINK, 0).tri([ea - x * h * 0.16, h * 0.56, h * 0.2], [ea + x * h * 0.2, h * 0.56, h * 0.2], [ea * 1.17, h * (0.5 + 0.8 * es), h * 0.12], [0, 0.2, 1]); }
                    if (ek === 'tuft') s.paint(q.coat, 0).tube([[ea * 1.2, h * (0.5 + 0.9 * es), h * 0.04, h * 0.1, 1], [ea * 1.3, h * (0.5 + 1.5 * es), 0, 0, 1]], 4);
                    if (ek === 'flop') s.tube([[ea * 1.25, h * 0.52, h * 0.1, h * 0.3, 0.45], [ea * 1.75, h * 0.2, h * 0.16, h * 0.34 * Math.min(es, 1.3), 0.4], [ea * 1.7, h * (0.1 - 0.7 * es), h * 0.22, h * 0.26 * Math.min(es, 1.3), 0.4], [ea * 1.6, h * (0 - 1.0 * es), h * 0.26, h * 0.06, 0.4]], 6, { cap: 2 });
                    if (ek === 'long') s.tube([[ea * 0.8, h * 0.6, 0, h * 0.22, 0.5], [ea * 0.95, h * (0.6 + 1.1 * es), -h * 0.12, h * 0.3, 0.42], [ea * 1.05, h * (0.6 + 2.0 * es), -h * 0.26, h * 0.2, 0.4], [ea * 1.1, h * (0.6 + 2.5 * es), -h * 0.32, 0, 1]], 6);
                    if (ek === 'round') ball(s, ea * 1.25, h * 0.66, h * 0.08, h * 0.3 * es, h * 0.3 * es, h * 0.14, 6, 3);
                    s.mark(null);
                    if (q.horns) s.paint([226, 214, 190], 0).tube([[x * h * 0.34, h * 0.62, h * 0.06, 0.022, 1], [x * (h * 0.34 + q.horns * 0.3), h * 0.62 + q.horns * 0.7, -q.horns * 0.3, 0.016, 1], [x * (h * 0.34 + q.horns * 0.5), h * 0.62 + q.horns, -q.horns * 0.8, 0, 1]], 5);
                }
                if (q.beard) s.paint([240, 232, 216], 0).tube([[0, -h * 0.5, h * 0.8, 0.02, 1], [0, -h * 1.2, h * 0.74, 0.003, 1]], 5);
                if (q.druid) antlers(s, h * 0.42, h * 0.7, 0, q.druid);
                if (q.rack) antlers(s, h * 0.42, h * 0.7, 0, q.rack, true);
            }),
            tail: part(k + 'tail', s => {
                const [kind, t] = q.tail, plain = { cap: 2, k: furry };
                s.mark(dye('tail')).paint(q.coat, 0).fx(0);
                if (kind === 'whip') s.tube(F([[0, -0.02, 0, g * 0.24, 1], [0, t * 0.3, 0.03, g * 0.18, 1], [0, t * 0.6, 0.02, g * 0.15, 1], [0, t * 0.88, -0.03, g * 0.13, 1], [0, t, -0.08, g * 0.07, 1]], 3), lite ? 6 : 9, plain);
                else if (kind === 'brush') s.tube([[0, 0, 0, g * 0.3, 1], [0, t * 0.4, 0, g * 0.56, 1], [0, t * 0.78, 0, g * 0.5, 1], [0, t, 0, 0, 1]], 8, { k: shag });
                else if (kind === 'plume') s.tube([[0, 0, 0, g * 0.28, 1], [0, t * 0.3, 0, g * 0.6, 1], [0, t * 0.7, 0.02, g * 0.72, 1], [0, t * 0.95, 0.03, g * 0.36, 1], [0, t, 0.03, 0, 1]], 8, { k: shag });
                else if (kind === 'fall') s.paint(q.mane || q.coat, 0).tube([[0, 0, 0, g * 0.16, 1], [0, t * 0.3, 0, g * 0.3, 0.8], [0, t * 0.8, 0.02, g * 0.34, 0.7], [0, t, 0.03, g * 0.1, 0.7]], 8, { k: shag, cap: 2 });
                else if (kind === 'thick') s.tube([[0, 0, 0, g * 0.52, 0.85], [0, t * 0.5, 0, g * 0.3, 0.8], [0, t, 0, g * 0.06, 0.8]], 8, plain);
                else if (kind === 'stub') ball(s, 0, t * 0.5, 0, g * 0.26, t * 0.6, g * 0.26, 6, 4, q.wool || q.shag ? 0.2 : 0);
                else if (kind === 'curl') s.tube([[0, 0, 0, 0.018, 1], [0.03, t * 0.4, 0, 0.016, 1], [0, t * 0.7, 0.03, 0.014, 1], [-0.03, t * 0.5, 0.05, 0.012, 1], [0, t * 0.3, 0.06, 0.008, 1]], 5, { cap: 2 });
                else if (kind === 'tuft') { s.tube([[0, 0, 0, g * 0.1, 1], [0, t * 0.7, 0, g * 0.07, 1]], 6); ball(s.paint(q.mane || q.coat, 0), 0, t * 0.85, 0, g * 0.16, t * 0.2, g * 0.16, 6, 4, 0.2); }
                s.mark(null);
            }),
            wing: q.wings && part(k + 'wing', s => {
                // The right wing, out along +x: three fingers and the skin between, both faces.
                const bones = [[0.5, 0.06, 0.1], [0.48, 0.02, -0.16], [0.3, 0, -0.34]];
                s.paint(q.coat, 0).fx(0).tube([[0, 0, 0, 0.022, 1], [0.24, 0.05, 0.06, 0.016, 1]], 5);
                for (const b of bones) s.tube([[0.24, 0.05, 0.06, 0.014, 1], [0.24 + b[0], 0.05 + b[1], 0.06 + b[2], 0.004, 1]], 4);
                const pts = [[0.24, 0.05, 0.06], ...bones.map(b => [0.24 + b[0], 0.05 + b[1], 0.06 + b[2]]), [0, 0, -0.2]];
                for (let i = 1; i < pts.length - 1; i++) for (const up of [1, -1]) s.paint(up > 0 ? [240, 190, 90] : [214, 160, 80], 0).tri(pts[0], pts[i], pts[i + 1], [0, up, 0], [1, 0.85, 0.85]);
                s.paint([240, 190, 90], 0).tri([0, 0, 0], pts[0], pts[4], [0, 1, 0]).tri([0, 0, 0], pts[4], pts[0], [0, -1, 0]);
            }),
        };
    }
    // How each gait moves the body: how far the legs swing when nothing better can place them (climbing a trunk), how
    // it bobs, rolls and pitches, and how high it leaves the ground. When each foot goes is WayLogic.GAIT's.
    const GAITS = {
        trot: { swing: 0.5, bob: 0.03, roll: 0, pitch: 0, hop: 0 },
        walk: { swing: 0.42, bob: 0.015, roll: 0.03, pitch: 0, hop: 0 },
        gallop: { swing: 0.6, bob: 0.02, roll: 0, pitch: 0.1, hop: 0.1 },
        plod: { swing: 0.5, bob: 0.01, roll: 0.06, pitch: 0, hop: 0 },
        waddle: { swing: 0.42, bob: 0.02, roll: 0.13, pitch: 0, hop: 0 },
        scuttle: { swing: 0.7, bob: 0.01, roll: 0.05, pitch: 0, hop: 0 },
        bound: { swing: 0.7, bob: 0, roll: 0, pitch: 0.24, hop: 0.45 },
        hop: { swing: 0.9, bob: 0, roll: 0, pitch: 0.3, hop: 1.2 },
    };
    for (const name in GAITS) GAITS[name].feet = L.GAIT[name].feet;
    // How long each bone of a leg is: standing, a fore leg is all but straight and a hind leg stands in its zig-zag
    // (the hock behind, the cannon upright), because its hip is nearer the ground than the leg is long. How far a foot
    // can go either side of under its hip and still be on the ground (half), with the shoulder blade carrying the top
    // of a fore leg part of the way (SLIDE), and so how long a turn of each gait is (cycle, in its own measure).
    const SLIDE = [0.4, 0.15];
    function legsOf(q) {
        if (q.bones) return q.bones;
        const legL = q.tall * 0.42, g = q.girth, hip = q.tall - 0.59 * g, contact = q.hoof ? 0.14 * legL : 0.1 * legL + 0.14 * g * q.leg, shin = (q.hoof ? 0.86 : 0.84) * legL, stand = hip - contact;
        const fore = L.clamp(stand / 0.975 - shin, 0.8 * legL, 1.5 * legL), hind = L.clamp(stand / 0.93 - shin, 0.8 * legL, 1.5 * legL);
        const halfOf = (l, slide) => { const r = 0.995 * (l + shin); return Math.sqrt(Math.max(0, r * r - stand * stand)) / (1 - slide); };
        const half = Math.min(halfOf(fore, SLIDE[0]), halfOf(hind, SLIDE[1])), cycle = {};
        for (const name in L.GAIT) { const G = L.GAIT[name]; cycle[name] = Math.max(2 * half * G.reach / G.duty, G.least * hip, 1e-3); }
        return (q.bones = { hip, contact, shin, fore, hind, half, cycle });
    }
    const FEET = [[-1, 1], [1, 1], [-1, -1], [1, -1]], MIX = [['walk', 0], ['walk', 0], ['walk', 0]];
    // Copy WayLogic.gaitMix's answer (it is one shared array) and the turn of each gait's own cycle.
    function mixOf(q, speed, size) {
        const m = L.gaitMix(q.gait, q.cat ? 'bound' : 'gallop', speed, q.tall * size);
        for (let k = 0; k < 3; k++) { MIX[k][0] = m[k][0]; MIX[k][1] = m[k][1]; }
        return MIX;
    }
    // pose: { yaw, gait (turns of its stride), speed (metres a second, if known: it picks walk, trot or gallop), moving
    // (0 to 1), rest (0 to 1, settled), down (head to the ground), head (a turn of it), alarm, alt, wing, ride, t, size,
    // feet (an array: where each hip, joint, fetlock and toe went, for the tests) }.
    function quad(out, st, id, x, y, z, pose) {
        const q = KINDS[id], P = pose.lite ? q.lite || (q.lite = quadParts(id, true)) : q.parts || (q.parts = quadParts(id)), size = (q.size || 1) * (pose.size || 1), g = q.girth, len = q.len, G = GAITS[q.gait], t = pose.t || 0;
        const turns = pose.gait || 0, tau = turns * TAU, mv = pose.moving || 0, rest = pose.rest || 0, style = q.rest, LG = legsOf(q);
        // Riding on a shoulder (pose.ride, 0 to 1) takes the place of whatever it does at rest.
        const ride = pose.ride || 0, keep = 1 - ride, settled = rest * keep;
        const sit = style === 'sit' ? settled : 0, lie = style === 'sit' || style === 'graze' ? 0 : settled, belly = style === 'belly' ? L.smooth(0.5, 1, settled) : 0, curl = style === 'curl' ? settled : 0, tuck = style === 'tuck' ? settled : 0, fly = pose.wing || 0;
        const put = model => out.stamp(model, st.top, null);
        // The body moves with whichever gaits are going, each at its own turn.
        const mix = mixOf(q, pose.speed, size), metres = turns * q.stride / size;          // walked, in its own measure
        let bob = 0, roll = 0, pitch = 0, air = 0, nod = 0;
        for (const [name, w] of mix) {
            if (w <= 0) continue;
            const B = GAITS[name], a = TAU * metres / LG.cycle[name];
            bob += w * B.bob * Math.sin(a * 2); if (name === 'walk' || name === 'plod') nod += w * 0.08 * Math.sin(a * 2 + 0.6);          // a walker nods with its steps
            roll += w * B.roll * Math.sin(a); pitch += w * B.pitch * Math.cos(a); air += w * B.hop * Math.max(0, Math.sin(a));
        }
        const gambol = pose.alarm ? Math.abs(Math.sin(t * 9)) * pose.alarm * 0.12 : 0;
        const base = L.mix(L.mix(q.tall - g * 0.25, g * (q.shell ? 0.35 : 0.96), lie) - sit * q.tall * 0.17, g * 0.92, ride);
        const Hb = base + bob * mv * q.tall + air * mv * q.tall + gambol + 0.03 * fly * Math.sin(t * 9);
        // A rider keeps its balance against the walk beneath it: a lean the other way to each step, and back.
        const rollA = roll * mv + Math.PI * belly + (pose.bank || 0) * 0.5 * fly - ride * 0.07 * (pose.swayK ?? 1) * Math.sin(pose.sway || 0), theta = -0.52 * sit - pitch * mv - 0.2 * fly - (pose.pitch || 0);
        st.reset(x, y + (pose.alt || 0), z, pose.yaw, size).move(0, Hb, 0).rz(rollA).rx(theta);
        put(P.body);
        // The legs. Walking or standing, each foot is put where the gait says on the ground under it, and the leg is
        // solved to it: the wrist of a fore leg forward and folding back, the hock of a hind leg behind and folding
        // forward, the foot flat on the ground. Settled (sitting, lying, curled, flying) or up a trunk, the old poses.
        const settle = Math.max(sit, lie), ik = (1 - settle) * (1 - fly) * keep * (1 - L.smooth(0.3, 0.7, Math.abs(pose.pitch || 0)));
        const c = Math.cos(theta), sn = Math.sin(theta), sr = Math.sin(rollA), hipH = LG.hip, splay = q.splay || 0;
        for (let i = 0; i < 4; i++) {
            const [sx, sz] = FEET[i], fore = sz > 0, l1 = fore ? LG.fore : LG.hind, hx = sx * g * 0.56, hy = -g * 0.34, hz0 = sz * len * 0.34;
            let hz = hz0;
            // The old swing, its joints now the right way round, for what the solved leg does not cover.
            const a = tau + G.feet[i] * TAU, swing = G.swing * Math.sin(a) * mv * (1 - fly), bend = 0.8 * Math.max(0, Math.cos(a)) * mv;
            let up = fore ? -swing + 0.52 * sit - 1.35 * lie * (1 - tuck) + 0.9 * fly : -swing + 1.6 * sit + 1.25 * lie + 1.0 * fly;
            let knee = fore ? bend - 0.1 * sit + 0.2 * lie : -bend - 2.3 * sit - 2.3 * lie - 0.6 * fly, foot = 0;
            if (ik > 0) {
                let fz = 0, fy = 0, fs = 0;
                for (const [name, w] of mix) {
                    if (w <= 0) continue;
                    const gg = L.GAIT[name], cyc = LG.cycle[name], f = L.gaitFoot(name, metres / cyc, i, Math.min(0.5 * gg.duty * cyc, LG.half) * mv, gg.lift * hipH * mv);
                    fz += w * f[0]; fy += w * f[1]; fs += w * f[2];
                }
                // The shoulder blade (and, less, the pelvis) carries the top of the leg part of the way with the foot. From
                // the hip to where the fetlock must be, in the body's own frame (the body is pitched by theta).
                hz = hz0 + ik * SLIDE[fore ? 0 : 1] * fz;
                const py = Hb + hy * c - hz * sn + hx * sr, pz = hy * sn + hz * c;
                const ty = LG.contact * Math.cos(splay) + fy + air * mv * q.tall * 0.5, tz = hz0 + (fore ? 0.03 : -0.02) * hipH + fz;
                const dy = ty - py, dz = tz - pz, by = (dy * c + dz * sn) / Math.cos(splay), bz = -dy * sn + dz * c;
                const [u, k] = L.legSolve(by, bz, l1, LG.shin, fore ? 1 : -1);
                up = L.mix(up, u, ik); knee = L.mix(knee, k, ik);
                foot = ik * L.clamp(-(theta + u + k) + (fore ? 1.2 : 0.45) * fs, -1.2, 1.9);
            }
            if (ride > 0) {
                // On a shoulder: the outside fore paw hangs down over the front of it, the other is tucked under the chest,
                // and the hind legs are folded under on the shoulder (or the top of the pack).
                const hang = fore && sx > 0, ru = hang ? -theta + 0.12 + 0.08 * Math.sin(t * 1.1 + 2) : fore ? -1.3 : 1.25, rk = hang ? 0.3 : fore ? 0.25 : -2.3;
                up = L.mix(up, ru, ride); knee = L.mix(knee, rk, ride); foot = L.mix(foot, hang ? 0.6 : 0, ride);
            }
            st.push().move(hx, hy, hz);
            if (pose.feet) pose.feet[i] = { fore, hip: [st.top[3], st.top[7], st.top[11]] };
            st.rz(sx * splay).rx(up).rz(sx * (0.5 * belly + 0.9 * tuck));
            if (tuck < 0.9) put(fore ? P.fore : P.hind);
            st.move(0, -l1, 0);
            if (pose.feet) pose.feet[i].joint = [st.top[3], st.top[7], st.top[11]];
            st.rx(knee);
            if (tuck < 0.9) put(P.shin);
            st.move(0, -LG.shin, 0).rx(foot);
            if (pose.feet) { const m = st.top; pose.feet[i].ankle = [m[3], m[7], m[11]]; pose.feet[i].toe = [m[3] - m[1] * LG.contact, m[7] - m[5] * LG.contact, m[11] - m[9] * LG.contact]; }
            if (tuck < 0.9) put(P.foot);
            st.pop();
        }
        if (q.tail[0] !== 'none') {
            const wag = q.wag && rest < 0.5 ? 0.45 * Math.sin(t * q.wag) : 0.14 * Math.sin(t * 1.7 + size * 9);
            // (A rider's hangs down behind it and swings, slowly, as a cat's does.)
            st.push().move(0, g * 0.25, -len * 0.47).rz(wag * keep + 1.5 * curl * (q.cat || id === 'fox' ? 1 : 0.4) + ride * 0.3 * Math.sin(t * 1.3 + 1)).rx(-Math.PI / 2 + q.tail[2] * (1 - 0.5 * mv * (q.cat ? 0 : 0.4)) * keep - 0.9 * curl - 0.5 * lie + 0.5 * sit + 0.1 * Math.sin(t * 2.3 + 1) - ride * (0.9 + theta));
            put(P.tail);
            st.pop();
        }
        if (P.wing) for (const side of [-1, 1]) {
            st.push().move(side * g * 0.5, g * 0.8, len * 0.16).size(side, 1, 1).rz((0.75 * Math.sin(t * 13) * fly) + (1 - fly) * 0.35).ry(1.2 * (1 - fly));
            put(P.wing);
            st.pop();
        }
        // The neck and head: down to graze or sniff, tucked round when curled, up and about when something is afoot.
        const down = Math.max(pose.down || 0, style === 'graze' ? settled * (0.15 + 0.85 * L.smooth(-0.3, 0.3, Math.sin(t * 0.21 + size * 5))) : 0, curl * 0.8, belly * 0.5), lift = q.neck[1] * (1 - down) - 0.7 * down + 0.3 * (pose.alarm || 0) * (1 - down) + nod * mv * (1 - down) + ride * (theta + 0.1);
        // A rider looks about from up there, and now and then turns to rub its cheek on the traveller's.
        const rub = ride * L.smooth(0.82, 0.9, (t / 13 + size) % 1) * (1 - L.smooth(0.96, 1, (t / 13 + size) % 1)), look = (pose.head || 0) + ride * (0.45 * Math.sin(t * 0.37) + 0.25 * Math.sin(t * 0.91 + 1) - 1.1 * rub);
        st.move(0, g * 0.28, len * 0.4).rx(Math.PI / 2 - lift + 0.5 * sit).ry(-1.1 * curl * (1 - 0.5 * down));
        if (tuck < 0.9 || !q.shell) put(P.neck);
        st.move(0, q.neck[0], 0).rx(-(Math.PI / 2 - lift) - 0.35 * sit + 0.5 * down + 0.05 * Math.sin(t * 5) * down - 0.5 * belly + 0.25 * rub).ry(look + 0.25 * Math.sin(t * 0.7 + size * 3) * settled * (1 - curl));
        if (tuck < 0.9 || !q.shell) put(P.head);
    }

    // ---- Birds ---------------------------------------------------------------------------------
    // size (a scale), len and r of the body, neck, head, beak [length, half-width, colour, hooked], span and chord
    // of a wing, leg length; colours; flap: beats to a turn of its gait; upright: how it stands.
    const BIRDS = {
        goose: { size: 1, len: 0.5, r: 0.15, neck: 0.3, head: 0.06, beak: [0.07, 0.024, [236, 150, 50]], span: 0.62, chord: 0.24, leg: 0.16, body: [236, 234, 228], wing: [196, 192, 184], belly: [250, 250, 246], feet: [236, 150, 50], flap: 1, upright: 0.25, stride: 0.26 },
        hen: { size: 1, len: 0.3, r: 0.11, neck: 0.1, head: 0.05, beak: [0.03, 0.014, [236, 180, 70]], span: 0.26, chord: 0.16, leg: 0.1, body: [200, 122, 70], wing: [170, 96, 56], belly: [222, 160, 110], feet: [226, 180, 80], comb: true, tailUp: 0.9, flap: 2, upright: 0.3, stride: 0.16 },
        duck: { size: 1, len: 0.34, r: 0.1, neck: 0.1, head: 0.052, beak: [0.05, 0.022, [226, 180, 60], false, true], span: 0.34, chord: 0.15, leg: 0.07, body: [150, 112, 78], wing: [120, 90, 66], belly: [200, 170, 130], feet: [226, 140, 50], crown: [44, 112, 78], flap: 2, upright: 0.15, stride: 0.16 },
        duckling: { size: 0.42, len: 0.3, r: 0.11, neck: 0.06, head: 0.07, beak: [0.045, 0.024, [226, 150, 60], false, true], span: 0.16, chord: 0.1, leg: 0.07, body: [246, 220, 110], wing: [226, 196, 96], belly: [250, 236, 160], feet: [226, 140, 50], flap: 3, upright: 0.2, stride: 0.1 },
        raven: { size: 1, len: 0.34, r: 0.085, neck: 0.06, head: 0.055, beak: [0.07, 0.02, [30, 28, 34], false], span: 0.52, chord: 0.2, leg: 0.08, body: shiny([34, 32, 44], 0.35), wing: shiny([28, 26, 38], 0.35), belly: shiny([40, 38, 52], 0.3), feet: [40, 38, 42], flap: 1.4, upright: 0.5, stride: 0.18, fingers: true },
        owl: { size: 1, len: 0.3, r: 0.12, neck: 0.02, head: 0.1, beak: [0.03, 0.016, [226, 190, 110], true], span: 0.56, chord: 0.24, leg: 0.06, body: [150, 118, 84], wing: [124, 96, 70], belly: [236, 222, 196], feet: [200, 180, 140], discs: true, tufts: true, eye: [250, 190, 50], barred: true, flap: 1, upright: 1.05, stride: 0.14 },
        gull: { size: 1.2, len: 0.36, r: 0.09, neck: 0.05, head: 0.052, beak: [0.06, 0.018, [236, 190, 60], true], span: 0.66, chord: 0.17, leg: 0.07, body: [246, 246, 242], wing: [196, 202, 214], belly: [250, 250, 248], feet: [236, 170, 80], flap: 0.5, glide: true, upright: 0.3, stride: 0.16, fingers: true },
        hawk: { size: 1, len: 0.38, r: 0.095, neck: 0.04, head: 0.055, beak: [0.045, 0.02, [236, 200, 80], true], span: 0.72, chord: 0.22, leg: 0.09, body: [124, 86, 60], wing: [96, 68, 52], belly: [240, 228, 206], feet: [236, 200, 80], barred: true, eye: [250, 210, 60], flap: 0.6, glide: true, upright: 0.85, stride: 0.16, fingers: true },
    };
    Object.assign(BIRDS, {
        swan: { ...BIRDS.goose, size: 1.5, neck: 0.46, body: [250, 250, 250], wing: [244, 244, 246], belly: [252, 252, 252] },
        cygnet: { ...BIRDS.duckling, size: 0.6, body: [176, 172, 168], wing: [156, 152, 150], belly: [206, 202, 198] },
        heron: { ...BIRDS.goose, size: 1.25, neck: 0.44, leg: 0.4, r: 0.11, body: [150, 160, 176], wing: [110, 120, 140], belly: [232, 234, 238], upright: 0.9 },
        pheasant: { ...BIRDS.hen, size: 1.25, comb: false, body: [176, 100, 50], wing: [140, 84, 50], belly: [200, 130, 70], tailUp: 0.15 },
        kestrel: { ...BIRDS.hawk, size: 0.72, body: [176, 110, 70], wing: [140, 90, 62] },
        eagle: { ...BIRDS.hawk, size: 1.75, body: [84, 62, 48], wing: [66, 50, 42], belly: [110, 84, 62] },
        woodpecker: { ...BIRDS.raven, size: 0.62, body: [34, 32, 36], wing: [230, 230, 226], belly: [240, 238, 232], upright: 1.0 },
    });
    function birdParts(id) {
        const b = BIRDS[id], k = 'bird:' + id + ':', r = b.r, len = b.len;
        const feathers = (s, x0, x1, c0, c1, n, tipped) => {
            for (let i = 0; i < n; i++) {
                const u0 = i / n, u1 = (i + 1) / n, xa = L.mix(x0, x1, u0), xb = L.mix(x0, x1, u1), ca = L.mix(c0, c1, u0), cb = L.mix(c0, c1, u1), dip = tipped ? 0.4 * (cb + ca) / 2 : 0.12 * ca;
                for (const up of [1, -1]) s.paint(i % 2 ? b.wing : [b.wing[0] * 0.86, b.wing[1] * 0.86, b.wing[2] * 0.86], 0).quad([xa, 0.004 * up, ca * 0.35], [xb, 0.004 * up, cb * 0.35], [xb + (tipped ? 0.02 : 0), -0.004, -cb * 0.65 - dip * (i % 2 ? 1 : 0.5)], [xa, -0.004, -ca * 0.65], [0, up, 0], [1, 1, 0.8, 0.8]);
            }
        };
        return {
            body: part(k + 'body', s => {
                s.paint(b.body, 0).fx(0);
                for (let row = 0; row < 3; row++) for (let i = 0; i < 7; i++) { const a = (i - 3) * 0.42 + row * 0.2, z = len * (0.18 - row * 0.2); tuft(s, [Math.sin(a) * r * 0.86, -Math.cos(a) * r * 0.86, z], [Math.sin(a) * 0.3, -Math.cos(a) * 0.3, -1], r * 0.5, r * 0.2, i % 2 ? 1.08 : 0.92); }
                s.mark((x, y, z) => y < -r * 0.25 ? (b.barred && Math.sin(z * 90 + y * 60) > 0.5 ? b.body : b.belly) : null).paint(b.body, 0).fx(0);
                s.tube([[0, 0.05 * r, -len * 0.5, r * 0.3, 0.7], [0, 0, -len * 0.2, r * 0.9, 0.94], [0, -0.04 * r, len * 0.12, r, 1], [0, 0.08 * r, len * 0.44, r * 0.6, 1]], 10, { cap: 3 });
                s.mark(null);
                const up = b.tailUp || 0;
                for (let i = -1; i <= 1; i++) s.paint(i ? b.wing : [b.wing[0] * 0.85, b.wing[1] * 0.85, b.wing[2] * 0.85], 0).quad([i * r * 0.3 - r * 0.2, 0.04 * r, -len * 0.4], [i * r * 0.3 + r * 0.2, 0.04 * r, -len * 0.4], [i * r * 0.6 + r * 0.24, 0.02 * r + up * len * 0.4, -len * 0.5 - len * 0.34 * (1 - up * 0.5)], [i * r * 0.6 - r * 0.24, 0.02 * r + up * len * 0.4, -len * 0.5 - len * 0.34 * (1 - up * 0.5)], [0, 1, 0], [0.8, 0.8, 1, 1]);
            }),
            // The neck and head, standing up from the breast.
            head: part(k + 'head', s => {
                const h = b.head, top = b.neck, [bl, bw, bc, hooked, flat] = b.beak, eye = b.eye || [30, 26, 26];
                s.paint(b.body, 0).fx(0).tube([[0, -r * 0.3, 0, r * 0.5, 1], [0, top * 0.5, 0.01, (r * 0.5 + h * 0.8) / 2 * (b.neck > 0.2 ? 0.62 : 1), 1], [0, top, 0, h * 0.8, 1]], 8);
                s.mark((x, y, z) => b.crown && y > top - h * 0.3 ? b.crown : null);
                ball(s, 0, top + h * 0.3, h * 0.12, h, h * 0.94, h * 1.04, 9, 6);
                s.mark(null);
                if (b.discs) for (const x of [-1, 1]) s.paint(b.belly, 0).blob(x * h * 0.44, top + h * 0.36, h * 0.82, h * 0.5, h * 0.52, h * 0.3, { segs: 9, bands: 4, lump: 0, under: 0.9 });
                if (flat) s.paint(bc, 0).tube([[0, top + h * 0.2, h * 0.9, bw * 1.1, 0.5], [0, top + h * 0.14, h * 0.9 + bl * 0.7, bw * 1.2, 0.36], [0, top + h * 0.12, h * 0.9 + bl, bw * 0.8, 0.3]], 7, { cap: 2 });
                else s.paint(bc, 0).tube([[0, top + h * 0.2, h * 0.86, bw * 1.2, 0.9], [0, top + h * (hooked ? 0.14 : 0.18), h * 0.9 + bl * 0.6, bw * 0.8, 0.9], [0, top + h * (hooked ? -0.14 : 0.12), h * 0.9 + bl * (hooked ? 0.8 : 1), 0, 1]], 6);
                for (const x of [-1, 1]) {
                    const er = h * (b.discs ? 0.26 : 0.17), ex = x * h * (b.discs ? 0.42 : 0.62), ez = h * (b.discs ? 1.02 : 0.66);
                    s.paint(shiny(eye, 0.8), 0).blob(ex, top + h * 0.4, ez, er, er, er * 0.6, { segs: 7, bands: 4, lump: 0, under: 1 });
                    if (b.eye) s.paint(BLACK, 0).blob(ex, top + h * 0.4, ez + er * 0.4, er * 0.5, er * 0.5, er * 0.3, { segs: 6, bands: 3, lump: 0, under: 1 });
                    if (b.tufts) s.paint(b.wing, 0).tube([[x * h * 0.6, top + h * 0.9, h * 0.3, h * 0.2, 0.5], [x * h * 0.9, top + h * 1.6, h * 0.2, 0, 1]], 5);
                }
                if (b.comb) { for (let i = 0; i < 3; i++) s.paint([206, 50, 50], 0).blob(0, top + h * 1.2, h * (0.5 - i * 0.4), h * 0.14, h * 0.3, h * 0.26, { segs: 5, bands: 3, lump: 0 }); s.blob(0, top - h * 0.25, h * 0.8, h * 0.16, h * 0.3, h * 0.14, { segs: 5, bands: 3, lump: 0 }); }
            }),
            // The right wing in two lengths, out along +x.
            inner: part(k + 'inner', s => { s.fx(0); feathers(s, 0, b.span * 0.5, b.chord, b.chord * 0.95, 5, false); s.at(M.move(0, 0.012, b.chord * 0.14)); feathers(s, 0, b.span * 0.5, b.chord * 0.5, b.chord * 0.46, 6, false); s.at(null); s.paint(b.body, 0).tube([[0, 0.005, b.chord * 0.3, 0.02, 1], [b.span * 0.5, 0.005, b.chord * 0.3, 0.016, 1]], 5); }),
            outer: part(k + 'outer', s => { s.fx(0); feathers(s, 0, b.span * 0.5, b.chord * 0.95, b.chord * (b.fingers ? 0.5 : 0.3), 6, b.fingers); s.at(M.move(0, 0.012, b.chord * 0.14)); feathers(s, 0, b.span * 0.42, b.chord * 0.46, b.chord * 0.2, 5, false); s.at(null); s.paint(b.body, 0).tube([[0, 0.005, b.chord * 0.3, 0.016, 1], [b.span * 0.48, 0.005, b.chord * 0.16, 0.006, 1]], 5); }),
            leg: part(k + 'leg', s => {
                s.paint(b.feet, 0).fx(0).tube([[0, 0, 0, 0.014, 1], [0, -b.leg, 0, 0.011, 1]], 5);
                for (const a of [-0.5, 0, 0.5]) s.tube([[0, -b.leg, 0, 0.01, 0.6], [Math.sin(a) * 0.05, -b.leg - 0.004, Math.cos(a) * 0.055, 0.004, 0.6]], 4);
            }),
        };
    }
    function bird(out, st, id, x, y, z, pose) {
        const b = BIRDS[id], P = b.parts || (b.parts = birdParts(id)), size = b.size * (pose.size || 1), fly = pose.wing || 0, rest = pose.rest || 0, mv = (pose.moving || 0) * (1 - fly), t = pose.t || 0;
        const put = model => out.stamp(model, st.top, null);
        const beat = Math.sin(pose.gait * TAU * b.flap), flap = fly * (b.glide ? 0.16 + 0.1 * beat : 0.65 * beat), step = pose.gait * TAU / b.stride * 0.5, tuck = rest * (1 - fly);
        const stand = (1 - fly) * (1 - 0.85 * tuck);
        st.reset(x, y + (pose.alt || 0), z, pose.yaw, size).move(0, (b.leg + b.r * 0.9) * stand + b.r * 0.8 * (1 - stand) * (1 - fly) + 0.02 * Math.abs(Math.sin(step)) * mv, 0).rz(-(pose.bank || 0) * 0.6 * fly + 0.14 * Math.sin(step) * mv).rx(-b.upright * (1 - fly) * (1 - 0.6 * tuck) + 0.1 * fly);
        put(P.body);
        if (stand > 0.2) for (const side of [-1, 1]) { st.push().move(side * b.r * 0.45, -b.r * 0.7, -b.len * 0.05).rx(b.upright * (1 - 0.6 * tuck) + 0.5 * Math.sin(step + (side > 0 ? Math.PI : 0)) * mv); put(P.leg); st.pop(); }
        for (const side of [-1, 1]) {
            st.push().move(side * b.r * 0.7, b.r * 0.5, b.len * 0.12).size(side * (1 - 0.3 * (1 - fly)), 1, 1).rz(flap - 0.45 * (1 - fly)).ry(1.4 * (1 - fly));
            put(P.inner);
            st.move(b.span * 0.5, 0, 0).rz(flap * 0.7).ry(0.4 * (1 - fly) - 0.15 * fly);
            put(P.outer);
            st.pop();
        }
        // The head keeps level; it bobs with the walk, looks about at rest, and tucks back to sleep.
        st.move(0, b.r * 0.55, b.len * 0.36).rx(b.upright * (1 - fly) * (1 - 0.6 * tuck) - 0.1 * fly + 0.5 * fly * (b.neck > 0.2 ? 1 : 0.2) + (pose.down || 0) * 1.2 + 0.12 * Math.sin(step * 2) * mv).ry((pose.head || 0) + 0.5 * Math.sin(t * 0.8 + size * 4) * (1 - mv) * (1 - fly) + 2.4 * L.smooth(0.7, 1, tuck) * (b.neck > 0.05 ? 1 : 0));
        put(P.head);
    }

    // ---- Each its own -----------------------------------------------------------------------------
    const ODD = {
        // The druid as an owl-beast: tall, round, feathered in bars, on two thick legs; a pale face, lamp eyes,
        // tufts like horns with her antlers between them, a collar of leaves. Its wings and legs are hinged on.
        owlbeast: () => part('owlbeast', s => {
            const bars = (x, y, z) => z > 0.12 && y < 1.2 && y > 0.5 && Math.abs(x) < 0.3 ? (Math.sin(y * 34 + Math.abs(x) * 8) > 0.3 ? [150, 118, 90] : [226, 208, 176]) : Math.sin(y * 26 + z * 9) > 0.55 ? [104, 80, 62] : null;
            s.mark(bars).paint([132, 102, 78], 0).fx(0).tube([[0, 0.42, -0.02, 0.2, 0.9], [0, 0.6, 0, 0.44, 0.92], [0, 0.95, 0.02, 0.5, 0.9], [0, 1.3, 0.02, 0.42, 0.88], [0, 1.52, 0.03, 0.34, 0.9]], 12, { cap: 1, k: shag });
            s.blob(0, 1.68, 0.04, 0.36, 0.33, 0.33, { segs: 12, bands: 7, lump: 0.05, seed: 0.3, under: 0.8 });
            s.mark(null);
            for (let row = 0; row < 7; row++) { const y = 1.44 - row * 0.14, R = [0.38, 0.44, 0.49, 0.51, 0.5, 0.46, 0.38][row], n = 15; for (let i = 0; i < n; i++) { const a = (i + (row % 2) * 0.5) / n * TAU, front = Math.cos(a) > 0.5; s.paint(front ? (row % 2 ? [226, 208, 176] : [176, 144, 110]) : (row % 2 ? [132, 102, 78] : [104, 80, 62]), 0); tuft(s, [Math.sin(a) * R, y, Math.cos(a) * R * 0.9 + 0.02], [Math.sin(a) * 0.25, -1, Math.cos(a) * 0.25], 0.17, 0.085); } }
            for (const x of [-1, 1]) {
                s.paint([236, 222, 196], 0).blob(x * 0.15, 1.7, 0.3, 0.17, 0.18, 0.08, { segs: 10, bands: 4, lump: 0, under: 0.9 });                        // the face's two discs
                s.paint(shiny([255, 196, 60], 0.8), 0).fx(0, 120).blob(x * 0.15, 1.72, 0.365, 0.075, 0.075, 0.04, { segs: 8, bands: 4, lump: 0, under: 1 }).fx(0).paint(BLACK, 0).blob(x * 0.15, 1.72, 0.395, 0.036, 0.036, 0.02, { segs: 6, bands: 3, lump: 0, under: 1 });
                s.paint([104, 80, 62], 0).tube([[x * 0.22, 1.92, 0.08, 0.075, 0.5], [x * 0.33, 2.16, 0.02, 0.04, 0.5], [x * 0.37, 2.28, -0.02, 0, 1]], 5);                    // tufts like horns
                for (let i = 0; i < 3; i++) s.paint([120, 255, 200], 0).fx(0, 230).blob(x * (0.44 - i * 0.03), 1.18 - i * 0.14, 0.2 - i * 0.02, 0.014, 0.05, 0.07, { segs: 6, bands: 3, lump: 0, under: 1 }).fx(0);
            }
            s.paint([226, 180, 80], 0).tube([[0, 1.66, 0.34, 0.05, 0.9], [0, 1.6, 0.42, 0.034, 0.9], [0, 1.52, 0.4, 0, 1]], 6);                        // the beak
            for (let i = 0; i < 13; i++) { const a = i / 13 * TAU, c = Math.cos(a), n = Math.sin(a), tone = 0.8 + 0.3 * hashf(i, 3); s.paint([96 * tone, 160 * tone, 84 * tone], 0).fx(20).tri([n * 0.34 - c * 0.08, 1.5, c * 0.3 + n * 0.08], [n * 0.34 + c * 0.08, 1.5, c * 0.3 - n * 0.08], [n * 0.5, 1.32, c * 0.46], [n * 0.8, 0.5, c * 0.8]); }
            s.fx(0);
            for (let i = -2; i <= 2; i++) s.paint(i % 2 ? [104, 80, 62] : [132, 102, 78], 0).quad([i * 0.09 - 0.06, 0.62, -0.36], [i * 0.09 + 0.06, 0.62, -0.36], [i * 0.15 + 0.08, 0.3, -0.62], [i * 0.15 - 0.08, 0.3, -0.62], [0, 0.5, -0.86]);       // a fan of a tail
            antlers(s, 0.1, 1.94, 0.02, 0.9);
        }),
        owlwing: () => part('owlwing', s => {
            // The right one, hanging from the shoulder: short, broad, feathered in three rows.
            s.paint([118, 92, 70], 0).fx(0).tube([[0, 0, 0, 0.12, 0.6], [0.06, -0.3, 0, 0.14, 0.45], [0.08, -0.6, 0.02, 0.1, 0.4]], 8, { k: shag });
            for (let row = 0; row < 3; row++) for (let i = 0; i < 4; i++) { const y = -0.18 - row * 0.2, z = -0.1 + i * 0.075; s.paint(i % 2 ? [104, 80, 62] : [150, 118, 90], 0).quad([0.1 + row * 0.02, y, z - 0.04], [0.1 + row * 0.02, y, z + 0.04], [0.13 + row * 0.02, y - 0.3, z + 0.03], [0.13 + row * 0.02, y - 0.3, z - 0.03], [1, 0.1, 0], [1, 1, 0.75, 0.75]); }
        }),
        owlleg: () => part('owlleg', s => {
            s.paint([132, 102, 78], 0).fx(0).tube([[0, 0.06, 0, 0.17, 1], [0, -0.2, 0, 0.13, 1], [0, -0.36, 0.01, 0.07, 1]], 8, { k: shag });
            s.paint([214, 176, 96], 0).tube([[0, -0.34, 0.01, 0.055, 1], [0, -0.44, 0.02, 0.05, 1]], 6);
            for (const a of [-0.6, 0, 0.6]) s.tube([[0, -0.44, 0.02, 0.04, 0.6], [Math.sin(a) * 0.14, -0.455, 0.04 + Math.cos(a) * 0.17, 0.028, 0.6], [Math.sin(a) * 0.19, -0.47, 0.04 + Math.cos(a) * 0.23, 0, 1]], 5);
        }),
        // A paper lantern with a small calm face, a tassel, and a light of its own.
        lantern: () => part('lantern', s => {
            s.paint([250, 232, 190], 0).fx(0, 200).tube([[0, -0.2, 0, 0.07, 1], [0, -0.12, 0, 0.15, 1], [0, 0, 0, 0.18, 1], [0, 0.12, 0, 0.15, 1], [0, 0.2, 0, 0.07, 1]], 12, { k: (i, k) => k % 2 ? 1 : 0.84 });
            s.fx(0).paint([150, 50, 46], 0).tube([[0, 0.19, 0, 0.08, 1], [0, 0.24, 0, 0.07, 1]], 10, { cap: 2 }).tube([[0, -0.24, 0, 0.07, 1], [0, -0.19, 0, 0.08, 1]], 10, { cap: 1 });
            s.paint(BRASS, 0).tube([[0, 0.24, 0, 0.01, 1], [0, 0.3, 0, 0.01, 1]], 4).tube([[0, 0.3, -0.03, 0.006, 1], [0, 0.34, 0, 0.006, 1], [0, 0.3, 0.03, 0.006, 1]], 4, { ref: [1, 0, 0] });
            for (const x of [-1, 1]) s.paint([60, 40, 36], 0).blob(x * 0.06, 0.02, 0.172, 0.018, 0.026, 0.008, { segs: 6, bands: 3, lump: 0, under: 1 });
            s.quad([-0.03, -0.055, 0.176], [0.03, -0.055, 0.176], [0.04, -0.043, 0.172], [-0.04, -0.043, 0.172], [0, 0, 1]);
            for (const x of [-1, 1]) s.paint([240, 150, 140], 0).fx(0, 120).blob(x * 0.105, -0.025, 0.14, 0.022, 0.014, 0.01, { segs: 6, bands: 3, lump: 0, under: 1 });
            s.fx(60).paint([190, 60, 50], 0).tube([[0, -0.24, 0, 0.012, 1], [0, -0.34, 0, 0.022, 1], [0, -0.44, 0, 0.004, 1]], 5);
            s.fx(0);
        }),
        // A cloud the size of a sheep, with a face; it rains a little, on nobody in particular.
        cloudlet: () => part('cloudlet', s => {
            s.mark((x, y) => y < -0.06 ? [196, 204, 222] : null).paint([250, 250, 255], 0).fx(0);
            for (const [x, y, z, r] of [[0, 0, 0, 0.24], [0.22, -0.02, 0.02, 0.18], [-0.23, -0.03, -0.02, 0.19], [0.08, 0.1, -0.05, 0.18], [-0.1, 0.08, 0.06, 0.17], [0, -0.04, 0.14, 0.15], [0.03, -0.03, -0.16, 0.16]]) s.blob(x, y, z, r, r * 0.8, r * 0.9, { segs: 9, bands: 5, lump: 0.08, seed: x * 7 + z, under: 0.86 });
            s.mark(null);
            for (const x of [-1, 1]) s.paint(BLACK, 0).blob(x * 0.07, 0.0, 0.275, 0.02, 0.028, 0.01, { segs: 6, bands: 3, lump: 0, under: 1 }).paint([250, 190, 200], 0).blob(x * 0.13, -0.05, 0.25, 0.03, 0.018, 0.01, { segs: 6, bands: 3, lump: 0, under: 1 });
            s.paint([60, 60, 80], 0).quad([-0.03, -0.062, 0.283], [0.03, -0.062, 0.283], [0.042, -0.048, 0.28], [-0.042, -0.048, 0.28], [0, 0, 1]);
        }),
        // A spellbook: its spine (the covers and pages are hinged on it and beat like wings).
        tome: () => part('tome', s => {
            s.paint([110, 50, 120], 0).fx(0).box(0, 0, 0, 0.03, 0.022, 0.17, 0.9);
            s.paint(BRASS, 0).box(0, 0, 0.172, 0.034, 0.026, 0.006, 1).box(0, 0, -0.172, 0.034, 0.026, 0.006, 1);
            s.paint([190, 60, 60], 0).fx(40, 0, 60).quad([-0.01, -0.02, -0.17], [0.01, -0.02, -0.17], [0.014, -0.16, -0.21], [-0.006, -0.16, -0.21], [0, 0.3, -1]);
            s.fx(0);
        }),
        cover: () => part('cover', s => {
            // The right cover, out along +x, and the block of pages inside it.
            s.paint([110, 50, 120], 0).fx(0).box(0.125, -0.004, 0, 0.125, 0.009, 0.175, 1);
            s.paint(BRASS, 0).box(0.23, -0.004, 0.155, 0.02, 0.011, 0.02, 1).box(0.23, -0.004, -0.155, 0.02, 0.011, 0.02, 1);
            s.paint([120, 230, 255], 0).fx(0, 255).blob(0.125, -0.016, 0, 0.03, 0.01, 0.03, { segs: 6, bands: 3, lump: 0, under: 1 });
            s.fx(0, 0, 12).paint([246, 238, 214], 0).box(0.118, 0.014, 0, 0.112, 0.009, 0.162, 1);
            s.fx(0, 0, 40).quad([0.01, 0.026, -0.16], [0.01, 0.026, 0.16], [0.22, 0.05, 0.155], [0.22, 0.05, -0.155], [0, 1, 0]);
            for (let i = 0; i < 4; i++) s.paint([90, 80, 100], 0).fx(0, 0, 40).quad([0.05, 0.03 + i * 0.001, -0.1 + i * 0.055], [0.19, 0.047, -0.1 + i * 0.055], [0.19, 0.047, -0.09 + i * 0.055], [0.05, 0.031, -0.09 + i * 0.055], [0, 1, 0]);
            s.fx(0);
        }),
        // A moon moth: a furred body, feathered feelers, and (hinged on it) wings with an eye on each.
        moth: () => part('moth', s => {
            s.paint([240, 236, 220], 0).fx(0).tube([[0, 0, -0.14, 0.012, 1], [0, 0.005, -0.04, 0.03, 1], [0, 0.01, 0.05, 0.036, 1], [0, 0.01, 0.1, 0.02, 1]], 8, { cap: 3, k: shag });
            for (const x of [-1, 1]) { s.paint(BLACK, 0).blob(x * 0.02, 0.02, 0.1, 0.012, 0.012, 0.012, { segs: 6, bands: 3, lump: 0, under: 1 }); s.paint([210, 190, 120], 0).tube([[x * 0.012, 0.025, 0.1, 0.004, 1], [x * 0.05, 0.07, 0.16, 0.008, 0.3], [x * 0.07, 0.07, 0.2, 0.001, 1]], 4); }
        }),
        mothwing: () => part('mothwing', s => {
            const spot = (x, y, z) => Math.hypot(x - 0.16, z - 0.03) < 0.035 ? (Math.hypot(x - 0.16, z - 0.03) < 0.018 ? [40, 40, 80] : [250, 220, 120]) : Math.hypot(x - 0.1, z + 0.12) < 0.02 ? [250, 220, 120] : z > 0.09 - x * 0.1 ? [150, 110, 150] : null;
            s.mark(spot).paint([176, 232, 190], 0).fx(0, 90);
            const outline = [[0, 0, 0.08], [0.2, 0, 0.13], [0.3, 0, 0.06], [0.27, 0, -0.04], [0.16, 0, -0.1], [0.12, 0, -0.3], [0.07, 0, -0.34], [0.05, 0, -0.14], [0, 0, -0.06]];
            for (let i = 1; i < outline.length - 1; i++) for (const up of [1, -1]) s.tri([0.02, 0, 0], outline[i], outline[i + 1], [0, up, 0]);
            s.mark(null).fx(0);
        }),
        // A brass beetle that somebody wound up long ago: a domed back in two wing-cases, six legs, a key that turns.
        beetle: () => part('beetle', s => {
            s.mark((x, y, z) => Math.abs(x) < 0.006 && z < 0.06 ? [110, 80, 40] : null).paint(BRASS, 0).fx(0).blob(0, 0.03, -0.03, 0.12, 0.085, 0.16, { segs: 12, bands: 6, lump: 0, under: 0.6 });
            s.mark(null).paint(COPPER, 0).blob(0, 0.02, 0.14, 0.085, 0.06, 0.07, { segs: 9, bands: 5, lump: 0, under: 0.6 });
            s.paint([255, 200, 90], 0).fx(0, 255);
            for (const x of [-1, 1]) s.blob(x * 0.045, 0.04, 0.195, 0.022, 0.022, 0.014, { segs: 6, bands: 3, lump: 0, under: 1 });
            s.fx(0).paint(C.iron, 0);
            for (const x of [-1, 1]) s.tube([[x * 0.03, 0.05, 0.19, 0.005, 1], [x * 0.07, 0.11, 0.26, 0.004, 1], [x * 0.09, 0.1, 0.3, 0.007, 1]], 4, { cap: 2 });
            for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; s.paint(i % 2 ? COPPER : BRASS, 0).box(Math.sin(a) * 0.118, 0.012, -0.03 + Math.cos(a) * 0.158, 0.008, 0.008, 0.008, 1); }
        }),
        key: () => part('key', s => {
            s.paint(C.iron, 0).fx(0).tube([[0, 0, 0, 0.008, 1], [0, 0.08, 0, 0.008, 1]], 5);
            for (const x of [-1, 1]) s.paint(BRASS, 0).tube([[0, 0.08, 0, 0.007, 1], [x * 0.045, 0.1, 0, 0.007, 1], [x * 0.05, 0.14, 0, 0.007, 1], [x * 0.015, 0.15, 0, 0.007, 1], [0, 0.08, 0, 0.007, 1]], 4, { ref: [0, 0, 1] });
        }),
        strut: () => part('strut', s => s.paint(C.iron, 0).fx(0).tube([[0, 0, 0, 0.009, 1], [0.1, 0.045, 0, 0.007, 1], [0.15, -0.085, 0, 0.004, 1]], 4, { cap: 2, ref: [0, 0, 1] }).paint(BRASS, 0).blob(0.1, 0.045, 0, 0.012, 0.012, 0.012, { segs: 5, bands: 3, lump: 0 })),
        // A kettle that learnt to walk: a pot-bellied boiler, a dome with one lit lens, a stovepipe, a lamp in its hand.
        tinker: () => part('tinker', s => {
            s.paint(BRASS, 0).fx(0).tube([[0, 0.2, 0, 0.1, 1], [0, 0.26, 0, 0.17, 1], [0, 0.42, 0, 0.19, 1], [0, 0.56, 0, 0.15, 1], [0, 0.6, 0, 0.13, 1]], 12, { cap: 1, k: (i, k) => k % 4 ? 1 : 0.86 });
            s.paint(COPPER, 0).tube([[0, 0.39, 0, 0.196, 1], [0, 0.43, 0, 0.196, 1]], 12);
            for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; s.paint(C.iron, 0).blob(Math.sin(a) * 0.196, 0.41, Math.cos(a) * 0.196, 0.011, 0.011, 0.011, { segs: 5, bands: 3, lump: 0 }); }
            s.paint([40, 34, 34], 0).quad([-0.05, 0.28, 0.176], [0.05, 0.28, 0.176], [0.05, 0.35, 0.184], [-0.05, 0.35, 0.184], [0, 0, 1]).paint([255, 150, 60], 0).fx(0, 255, 30).quad([-0.036, 0.29, 0.18], [0.036, 0.29, 0.18], [0.03, 0.335, 0.187], [-0.03, 0.335, 0.187], [0, 0, 1]);
            s.fx(0).paint(C.iron, 0).tube([[0.1, 0.56, -0.06, 0.03, 1], [0.12, 0.74, -0.08, 0.028, 1], [0.12, 0.76, -0.08, 0.04, 1]], 7);
        }),
        dome: () => part('dome', s => {
            s.paint(BRASS, 0).fx(0).blob(0, 0.04, 0, 0.125, 0.11, 0.125, { segs: 12, bands: 6, lump: 0, under: 0.65 });
            s.paint(COPPER, 0).tube([[0, 0.05, 0.09, 0.055, 1], [0, 0.05, 0.14, 0.05, 1]], 9).paint([170, 240, 255], 0).fx(0, 255).blob(0, 0.05, 0.14, 0.042, 0.042, 0.012, { segs: 8, bands: 3, lump: 0, under: 1 });
            s.fx(0).paint(C.iron, 0).tube([[0, 0.14, 0, 0.006, 1], [0, 0.22, -0.02, 0.006, 1]], 4).paint([226, 70, 60], 0).blob(0, 0.23, -0.02, 0.018, 0.018, 0.018, { segs: 6, bands: 3, lump: 0 });
        }),
        limb: () => part('limb', s => s.paint(C.iron, 0).fx(0).tube([[0, 0, 0, 0.022, 1], [0, -0.1, 0, 0.018, 1], [0, -0.2, 0, 0.022, 1]], 6).paint(BRASS, 0).blob(0, 0, 0, 0.03, 0.03, 0.03, { segs: 6, bands: 3, lump: 0 }).blob(0, -0.21, 0.02, 0.04, 0.025, 0.055, { segs: 7, bands: 3, lump: 0 })),
        handlamp: () => part('handlamp', s => s.paint(C.iron, 0).fx(0).tube([[0, -0.2, 0, 0.004, 1], [0, -0.27, 0, 0.004, 1]], 4).prism(6, 0, -0.29, 0, 0.04, -0.27, 0.01).paint(C.flame, 0).fx(0, 255).prism(6, 0, -0.37, 0, 0.032, -0.29, 0.032, { cap: true }).fx(0)),
        // A child of the mushroom folk: a stalk with a face, under a red cap with white spots.
        mushling: () => part('mushling', s => {
            s.paint([246, 238, 220], 0).fx(0).tube([[0, 0.1, 0, 0.1, 1], [0, 0.2, 0, 0.125, 1], [0, 0.36, 0, 0.105, 1], [0, 0.44, 0, 0.09, 1]], 10, { cap: 1, k: (i, k) => 1 - 0.05 * (k % 2) });
            for (const x of [-1, 1]) s.paint(BLACK, 0).blob(x * 0.045, 0.34, 0.098, 0.016, 0.022, 0.008, { segs: 6, bands: 3, lump: 0, under: 1 }).paint([246, 170, 160], 0).blob(x * 0.075, 0.3, 0.09, 0.02, 0.012, 0.008, { segs: 6, bands: 3, lump: 0, under: 1 });
            s.paint([120, 70, 60], 0).quad([-0.018, 0.288, 0.108], [0.018, 0.288, 0.108], [0.026, 0.3, 0.104], [-0.026, 0.3, 0.104], [0, 0, 1]);
        }),
        cap: () => part('cap', s => {
            s.mark((x, y, z) => y > 0.02 && hashf(Math.round(Math.atan2(x, z) * 2.6), Math.round(y * 26)) > 0.55 && Math.hypot(((Math.atan2(x, z) * 2.6) % 1 + 1) % 1 - 0.5, ((y * 26) % 1 + 1) % 1 - 0.5) < 0.32 ? [250, 246, 236] : null);
            s.paint([210, 62, 58], 0).fx(0).tube([[0, -0.02, 0, 0.25, 1], [0, 0.03, 0, 0.245, 1], [0, 0.11, 0, 0.19, 1], [0, 0.17, 0, 0.1, 1], [0, 0.19, 0, 0, 1]], 14);
            s.mark(null).paint([250, 236, 200], 0).tube([[0, -0.02, 0, 0.25, 1], [0, 0.0, 0, 0.09, 1]], 14, { k: (i, k) => k % 2 ? 0.86 : 1 });
        }),
        nub: () => part('nub', s => s.paint([246, 238, 220], 0).fx(0).tube([[0, 0, 0, 0.034, 1], [0, -0.09, 0, 0.03, 1]], 6).blob(0, -0.1, 0.012, 0.04, 0.026, 0.05, { segs: 6, bands: 3, lump: 0 })),
        // A great snail: its foot and its horns (the shell, with a door and a lit window, rides on it).
        snail: () => part('snail', s => {
            s.paint([214, 196, 150], 0).fx(0).tube([[0, 0.03, -0.42, 0.03, 0.5], [0, 0.05, -0.2, 0.13, 0.42], [0, 0.06, 0.1, 0.14, 0.46], [0, 0.1, 0.3, 0.1, 0.8], [0, 0.2, 0.4, 0.085, 1], [0, 0.26, 0.44, 0.07, 1]], 10, { cap: 3, k: (i, k) => 0.9 + 0.1 * hashf(i, k) });
            for (const x of [-1, 1]) s.paint(BLACK, 0).blob(x * 0.04, 0.26, 0.505, 0.012, 0.012, 0.008, { segs: 5, bands: 3, lump: 0, under: 1 });
        }),
        horn: () => part('horn', s => s.paint([214, 196, 150], 0).fx(0).tube([[0, 0, 0, 0.014, 1], [0, 0.14, 0.02, 0.01, 1]], 5).paint(BLACK, 0).blob(0, 0.15, 0.022, 0.02, 0.02, 0.02, { segs: 6, bands: 3, lump: 0 })),
        shell: () => part('shell', s => {
            s.mark((x, y, z) => Math.sin(Math.hypot(y - 0.34, z + 0.06) * 46) > 0.55 ? [150, 96, 60] : null).paint([206, 150, 96], 0).fx(0);
            s.blob(0, 0.34, -0.06, 0.2, 0.27, 0.27, { segs: 12, bands: 8, lump: 0, under: 0.75 });
            s.mark(null).paint([110, 70, 50], 0).box(0.2, 0.2, -0.06, 0.008, 0.07, 0.04, 1).paint(BRASS, 0).blob(0.212, 0.2, -0.035, 0.008, 0.008, 0.008, { segs: 5, bands: 3, lump: 0 });
            s.paint([110, 70, 50], 0).box(0.184, 0.4, -0.1, 0.01, 0.05, 0.05, 1).paint([255, 200, 110], 0).fx(0, 255).box(0.19, 0.4, -0.1, 0.008, 0.038, 0.038, 1);
            s.fx(0).paint([150, 70, 60], 0).tube([[0.06, 0.56, -0.1, 0.03, 1], [0.07, 0.68, -0.1, 0.026, 1], [0.07, 0.7, -0.1, 0.036, 1]], 6);
        }),
        // A boulderling: a round mossy stone that woke up, with two bright eyes.
        pebble: () => part('pebble', s => {
            s.mark((x, y, z) => y > 0.26 + 0.06 * Math.sin(x * 30) * Math.cos(z * 30) ? [110, 146, 84] : null).paint([150, 146, 140], 0).fx(0).blob(0, 0.22, 0, 0.19, 0.17, 0.18, { segs: 9, bands: 6, lump: 0.14, seed: 0.5, under: 0.6 });
            s.mark(null);
            for (const x of [-1, 1]) s.paint(shiny([255, 236, 150], 0.6), 0).fx(0, 200).blob(x * 0.07, 0.24, 0.165, 0.03, 0.036, 0.016, { segs: 7, bands: 4, lump: 0, under: 1 }).paint(BLACK, 0).fx(0).blob(x * 0.07, 0.24, 0.178, 0.012, 0.016, 0.006, { segs: 6, bands: 3, lump: 0, under: 1 });
            s.paint([250, 220, 90], 0).fx(70).blob(0.05, 0.4, -0.03, 0.02, 0.012, 0.02, { segs: 5, bands: 2, lump: 0 }).fx(0);
        }),
        stub: () => part('stub', s => s.paint([124, 120, 118], 0).fx(0).blob(0, -0.03, 0.01, 0.05, 0.045, 0.06, { segs: 7, bands: 4, lump: 0.12, seed: 0.2, under: 0.6 })),
    };
    // Two legs under a body made of whatever it is made of: the automaton, the mushroom child and the boulderling.
    function biped(out, st, id, x, y, z, pose) {
        const put = model => out.stamp(model, st.top, null), tau = pose.gait * TAU / 0.3, mv = pose.moving || 0, rest = pose.rest || 0, t = pose.t || 0, tinker = id === 'tinker', mush = id === 'mushling';
        const legL = tinker ? 0.21 : mush ? 0.1 : 0.05, sink = rest * (tinker ? 0.1 : mush ? 0.2 : 0.06);
        st.reset(x, y + (pose.alt || 0), z, pose.yaw, pose.size || 1).move(0, legL - (tinker ? 0.2 : mush ? 0.1 : 0.05) + 0.02 * Math.abs(Math.sin(tau)) * mv - sink * (mush ? 0.5 : 1), 0).rz(0.1 * Math.sin(tau) * mv).rx(0.06 * mv + (pose.alarm || 0) * -0.15);
        for (const side of [-1, 1]) {
            const swing = 0.6 * Math.sin(tau + (side > 0 ? Math.PI : 0)) * mv;
            st.push().move(side * (tinker ? 0.09 : mush ? 0.055 : 0.1), tinker ? 0.21 : mush ? 0.1 : 0.06, 0).rx(-swing - 1.3 * rest * (tinker ? 1 : 0));
            put(tinker ? ODD.limb() : mush ? ODD.nub() : ODD.stub());
            st.pop();
            if (id === 'pebble') continue;
            st.push().move(side * (tinker ? 0.2 : 0.12), tinker ? 0.5 : 0.3, 0).rz(side * 0.25).rx(swing * 0.8 - (tinker && side > 0 ? 0.9 : 0) + (pose.alarm || 0) * -2.2);
            put(tinker ? ODD.limb() : ODD.nub());
            if (tinker && side > 0) { st.rx(0.9 - swing * 0.8); put(ODD.handlamp()); }
            st.pop();
        }
        if (mush) { st.move(0, -sink * 0.5, 0); put(ODD.mushling()); st.move(0, 0.44 - 0.22 * rest, 0).rx(-0.12 + 0.05 * Math.sin(tau * 2) * mv + 0.3 * rest).ry(pose.head || 0); put(ODD.cap()); }
        else if (tinker) { put(ODD.tinker()); st.move(0, 0.6 - 0.03 * rest, 0).ry((pose.head || 0) + 0.5 * Math.sin(t * 0.6) * (1 - mv)).rx(-0.1 * (pose.alarm || 0)); put(ODD.dome()); }
        else { st.rz(0.12 * Math.sin(tau) * mv).rx(0.1 * Math.sin(tau * 2) * mv); put(ODD.pebble()); }
    }

    // ---- Everyone -----------------------------------------------------------------------------------
    // Pose one companion at (x, y, z) from the camera, feet on y. pose: { yaw, gait (metres walked, or seconds on the
    // wing), moving, rest, down, head, alarm, alt, wing, bank, t, size }. fx (optional): { glows, puffs, lit } for
    // the light some of them carry and the smoke one or two of them make.
    function pose(id, out, st, x, y, z, p, fx = null) {
        const t = p.t || 0, lit = fx ? fx.lit : 0, put = model => out.stamp(model, st.top, null, 0, 0, 1), glow = (dx, dy, dz, size, r, g, b) => fx && fx.glows.add(x + dx, y + (p.alt || 0) + dy, z + dz, size, r, g, b, 1);
        const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
        if (KINDS[id]) {
            quad(out, st, id, x, y, z, { ...p, gait: p.gait / KINDS[id].stride });
            // A whelp at rest breathes a little smoke.
            if (id === 'whelp' && fx && p.rest > 0.6) { const age = (t * 0.4) % 1; fx.puffs.add(x + sy * (0.5 + age * 0.3), y + 0.2 + age * 0.5, z + cy * (0.5 + age * 0.3), 0.06 + age * 0.2, 0.3 * (1 - age), 0.3 * (1 - age), 0.32 * (1 - age), 0.3 * (1 - age)); }
            return;
        }
        if (BIRDS[id]) {
            bird(out, st, id, x, y, z, p);
            // A duck's brood comes after her in a line, each a little late.
            if (id === 'duck') for (let i = 1; i <= 3; i++) { const back = 0.3 * i + 0.06 * Math.sin(t * 2 + i), wob = 0.07 * Math.sin(t * 3.1 + i * 2); bird(out, st, 'duckling', x - sy * back + cy * wob, y, z - cy * back - sy * wob, { ...p, alt: 0, wing: 0, gait: p.gait + i * 0.07, yaw: p.yaw + 0.3 * Math.sin(t * 2.2 + i), rest: p.rest }); }
            return;
        }
        const bobY = (p.alt || 0);
        if (id === 'wisp') {
            const s = 0.5 + 0.5 * lit;
            glow(0, 0.12 * Math.sin(t * 2.3), 0, 0.55, 0.5 * s, 0.9 * s, 0.8 * s);
            glow(0, 0.12 * Math.sin(t * 2.3), 0, 0.14, 0.9, 1, 1);
            for (let i = 0; i < 3; i++) { const a = t * 2.4 + i * 2.1; glow(Math.sin(a) * 0.22, 0.12 * Math.sin(t * 2.3) + Math.cos(a * 1.3) * 0.12, Math.cos(a) * 0.22, 0.05, 0.6, 1, 0.9); }
        } else if (id === 'lantern') {
            st.reset(x, y + bobY, z, p.yaw + 0.3 * Math.sin(t * 0.5), p.size || 1).rz(0.12 * Math.sin(t * 1.1)).rx(0.08 * Math.sin(t * 0.9) + 0.15 * (p.moving || 0));
            put(ODD.lantern());
            glow(0, 0, 0, 0.9, 0.5 * (0.35 + 0.65 * lit), 0.3 * (0.35 + 0.65 * lit), 0.12 * (0.35 + 0.65 * lit));
        } else if (id === 'cloudlet') {
            st.reset(x, y + bobY, z, p.yaw, p.size || 1).size(1 + 0.04 * Math.sin(t * 1.7), 1 - 0.04 * Math.sin(t * 1.7), 1);
            put(ODD.cloudlet());
            if (fx) for (let i = 0; i < 6; i++) { const age = (t * 0.9 + i / 6) % 1; glow(Math.sin(i * 2.4) * 0.16, -0.15 - age * 0.9, Math.cos(i * 1.7) * 0.12, 0.022, 0.25 * (1 - age), 0.34 * (1 - age), 0.5 * (1 - age)); }
        } else if (id === 'tome') {
            const beat = (p.wing ?? 1) * (0.55 + 0.5 * Math.sin(t * 9));
            st.reset(x, y + bobY + 0.04 * Math.sin(t * 9 + 1.5) * (p.wing ?? 1), z, p.yaw, p.size || 1).rx(-0.25 * (p.wing ?? 1));
            put(ODD.tome());
            for (const side of [-1, 1]) { st.push().size(side, 1, 1).rz(beat); put(ODD.cover()); st.pop(); }
            glow(0, -0.05, 0, 0.3, 0.1 * lit, 0.2 * lit, 0.24 * lit);
        } else if (id === 'moth') {
            const beat = (p.wing ?? 1) * 0.9 * Math.sin(t * 16) + (1 - (p.wing ?? 1)) * 0.2;
            st.reset(x, y + bobY + 0.05 * Math.sin(t * 5), z, p.yaw, (p.size || 1) * 1.5).rx(-0.5 * (p.wing ?? 1));
            put(ODD.moth());
            for (const side of [-1, 1]) { st.push().move(0, 0.02, 0).size(side, 1, 1).rz(beat); put(ODD.mothwing()); st.pop(); }
            glow(0, 0, 0, 0.5, 0.14 * lit, 0.26 * lit, 0.16 * lit);
        } else if (id === 'owlbeast') {
            // It walks like a gentleman in a heavy coat: a roll from foot to foot, wings swinging. At rest it settles and roosts.
            const walk = p.gait * TAU / 1.5, mv = p.moving || 0, rest = p.rest || 0;
            st.reset(x, y + bobY, z, p.yaw, p.size || 1).move(0, 0.05 * Math.abs(Math.sin(walk)) * mv - 0.3 * rest, 0).rz(0.09 * Math.sin(walk) * mv).rx(0.07 * mv);
            for (const side of [-1, 1]) {
                if (rest < 0.8) { st.push().move(side * 0.2, 0.48, 0).rx(-0.55 * Math.sin(walk + (side > 0 ? Math.PI : 0)) * mv); put(ODD.owlleg()); st.pop(); }
                st.push().move(side * 0.4, 1.34, 0).size(side, 1, 1).rz(0.12 + 0.1 * rest + 0.05 * Math.sin(t * 1.3)).rx(0.4 * Math.sin(walk + (side > 0 ? 0 : Math.PI)) * mv); put(ODD.owlwing()); st.pop();
            }
            st.ry((p.head || 0) * 0.6 + 0.2 * Math.sin(t * 0.5) * rest);
            put(ODD.owlbeast());
            glow(0, 1.2, 0, 1.2, 0.06 * lit, 0.2 * lit, 0.14 * lit);
        } else if (id === 'beetle') {
            const walk = p.gait * TAU / 0.2, mv = p.moving || 0, rest = p.rest || 0;
            st.reset(x, y + bobY, z, p.yaw, p.size || 1).move(0, 0.095 - 0.05 * rest + 0.004 * Math.sin(walk * 2) * mv, 0).rz(0.04 * Math.sin(walk) * mv);
            put(ODD.beetle());
            for (let i = 0; i < 6; i++) { const side = i % 2 ? 1 : -1, row = Math.floor(i / 2) - 1, ph = walk + ((i + Math.floor(i / 2)) % 2 ? Math.PI : 0); st.push().move(side * 0.085, 0, row * 0.1 - 0.02).size(side, 1, 1).ry(-row * 0.45 + 0.4 * Math.sin(ph) * mv).rz(0.25 * Math.max(0, Math.cos(ph)) * mv + 0.5 * rest); put(ODD.strut()); st.pop(); }
            st.push().move(0, 0.1, -0.08).rx(-0.5).ry(t * (2.2 + 4 * mv)); put(ODD.key()); st.pop();
            glow(sy * 0.2, 0.13, cy * 0.2, 0.22, 0.4 * lit, 0.3 * lit, 0.1 * lit);
        } else if (id === 'snail') {
            st.reset(x, y + bobY, z, p.yaw, p.size || 1).size(1, 1 + 0.03 * Math.sin(t * 1.4), 1 + 0.05 * Math.sin(t * 1.4) * (p.moving || 0));
            const tuck = p.rest || 0;
            st.push().move(0, 0, -0.1 * tuck).size(1, 1, 1 - 0.4 * tuck); put(ODD.snail());
            for (const side of [-1, 1]) { st.push().move(side * 0.035, 0.3, 0.44).rz(-side * (0.3 + 0.12 * Math.sin(t * 0.9 + side))).rx(0.3 + 0.15 * Math.sin(t * 1.2 + side * 2)).size(1, 1 - 0.7 * tuck, 1); put(ODD.horn()); st.pop(); }
            st.pop();
            st.rz(0.03 * Math.sin(t * 0.7)); put(ODD.shell());
            glow(cy * 0.24, 0.4, -sy * 0.24, 0.34, 0.5 * lit, 0.34 * lit, 0.14 * lit);
            if (fx) { const age = (t * 0.2) % 1; fx.puffs.add(x + cy * 0.07 - sy * 0.1, y + 0.74 + age * 0.9, z - sy * 0.07 - cy * 0.1, 0.06 + age * 0.3, 0.25 * (1 - age), 0.25 * (1 - age), 0.27 * (1 - age), 0.24 * (1 - age)); }
        } else {
            biped(out, st, id, x, y, z, p);
            if (id === 'tinker') {
                glow(cy * 0.2 + sy * 0.1, 0.2, -sy * 0.2 + cy * 0.1, 0.5, 0.5 * lit, 0.32 * lit, 0.12 * lit);
                if (fx) { const age = (t * 0.5) % 1; fx.puffs.add(x + cy * 0.12 - sy * 0.08, y + 0.8 + age * 0.8, z - sy * 0.12 - cy * 0.08, 0.05 + age * 0.24, 0.3 * (1 - age), 0.3 * (1 - age), 0.3 * (1 - age), 0.3 * (1 - age)); }
            }
        }
    }
    // How tall each stands, for whoever has to carry one on a pack; and whether it can be posed at all.
    const known = id => !!(KINDS[id] || BIRDS[id] || ODD[id] || id === 'wisp');
    // A leaf, for the swirl when the druid changes.
    const leaf = () => part('leaf', s => { for (const up of [1, -1]) s.paint(up > 0 ? [120, 180, 80] : [200, 170, 70], 0).fx(0, 40).tri([0, 0, -0.06], [0.035, 0, 0.01], [0, 0, 0.08], [0, up, 0]).tri([0, 0, -0.06], [0, 0, 0.08], [-0.035, 0, 0.01], [0, up, 0]); s.fx(0); });
    // A butterfly for somebody to chase: two pairs of wings on nothing much.
    const butterfly = () => part('butterfly', s => { for (const [z, r] of [[0.012, 0.03], [-0.014, 0.022]]) for (const up of [1, -1]) s.paint([250, 190, 60], 0).fx(0, 60).tri([0, 0, z], [r * 1.3, 0, z + r * 0.6], [r, 0, z - r * 0.8], [0, up, 0]); s.fx(0); });

    // Small things on the wing, a few triangles each (they come in dozens): a bat, a swallow; and a fish out of the water.
    const flyer = kind => part('flyer:' + kind, s => {
        const c = kind === 'bat' ? [44, 38, 48] : [40, 52, 86], span = kind === 'bat' ? 0.19 : 0.16;
        s.paint(c, 0).fx(0).tri([0, 0, 0.05], [0, 0, -0.06], [span, 0.01, kind === 'bat' ? -0.02 : -0.07], [0, 1, 0]).tri([0, 0, 0.05], [span, 0.01, kind === 'bat' ? -0.02 : -0.07], [span * 0.55, 0, 0.03], [0, 1, 0]);
        s.tri([0, 0, -0.06], [0, 0, 0.05], [span, 0.01, kind === 'bat' ? -0.02 : -0.07], [0, -1, 0]).tri([span, 0.01, kind === 'bat' ? -0.02 : -0.07], [0, 0, 0.05], [span * 0.55, 0, 0.03], [0, -1, 0]);
    });
    const flyerBody = kind => part('flyer:body:' + kind, s => { s.paint(kind === 'bat' ? [56, 46, 52] : [236, 232, 224], 0).fx(0).blob(0, 0, 0, 0.022, 0.02, 0.06, { segs: 5, bands: 3, lump: 0 }); if (kind === 'swallow') s.paint([40, 52, 86], 0).tri([0, 0.004, -0.05], [0.03, 0, -0.14], [0, 0, -0.08], [0, 1, 0]).tri([0, 0.004, -0.05], [0, 0, -0.08], [-0.03, 0, -0.14], [0, 1, 0]); });
    // A seal hauled out: a long grey body tapering to its hind flippers, a small head held up, fore flippers on the rock.
    const seal = () => part('seal', s => {
        const coat = shiny([112, 118, 130], 0.35);
        s.paint(coat, 0).fx(0).tube([[0, 0.1, -0.92, 0.04, 1.6], [0, 0.17, -0.6, 0.15, 1.25], [0, 0.26, -0.1, 0.27, 1.1], [0, 0.31, 0.32, 0.24, 1.05], [0, 0.42, 0.62, 0.15, 1], [0, 0.5, 0.76, 0.1, 1]], 8, { k: (i, k) => (k > 2 && k < 6 ? 0.92 : 1) });
        s.blob(0, 0.56, 0.84, 0.115, 0.105, 0.14, { segs: 7, bands: 4, lump: 0 });
        s.paint([84, 88, 98], 0).blob(0, 0.53, 0.97, 0.06, 0.05, 0.06, { segs: 5, bands: 3, lump: 0 });
        s.paint([24, 22, 26], 0).blob(0, 0.55, 1.025, 0.018, 0.015, 0.012, { segs: 4, bands: 2, lump: 0 });
        for (const x of [-1, 1]) {
            s.paint([24, 22, 26], 0).blob(x * 0.07, 0.6, 0.9, 0.016, 0.018, 0.012, { segs: 4, bands: 2, lump: 0 });
            s.paint([92, 96, 108], 0).tri([x * 0.2, 0.2, 0.3], [x * 0.52, 0.02, 0.36], [x * 0.3, 0.04, 0.08], [x * 0.3, 0.9, 0]).tri([x * 0.2, 0.2, 0.3], [x * 0.3, 0.04, 0.08], [x * 0.52, 0.02, 0.36], [x * 0.3, -0.9, 0]);
            s.tri([0, 0.1, -0.9], [x * 0.2, 0.04, -1.18], [x * 0.02, 0.05, -1.12], [0, 1, 0]).tri([0, 0.1, -0.9], [x * 0.02, 0.05, -1.12], [x * 0.2, 0.04, -1.18], [0, -1, 0]);
        }
        for (let i = 0; i < 5; i++) s.paint([84, 88, 100], 0).blob(0.1 * Math.sin(i * 2.3), 0.44 - 0.03 * i, -0.2 + 0.12 * i * Math.cos(i), 0.045, 0.02, 0.05, { segs: 4, bands: 2, lump: 0 });
    });
    // A crab: a flat shell, eight legs and two claws held up.
    const crab = () => part('crab', s => {
        s.paint([206, 92, 60], 0).fx(0).blob(0, 0.05, 0, 0.085, 0.035, 0.06, { segs: 6, bands: 3, lump: 0 });
        for (const x of [-1, 1]) {
            for (let i = 0; i < 4; i++) { const z = -0.045 + i * 0.03; s.paint([186, 76, 50], 0).tri([x * 0.07, 0.05, z], [x * 0.15, 0.07, z + 0.005], [x * 0.19, 0, z + 0.01], [0, 0.9, 0.3]).tri([x * 0.07, 0.05, z], [x * 0.19, 0, z + 0.01], [x * 0.15, 0.07, z + 0.005], [0, -0.9, -0.3]); }
            s.paint([226, 110, 70], 0).blob(x * 0.1, 0.085, 0.07, 0.03, 0.022, 0.035, { segs: 5, bands: 2, lump: 0 });
            s.paint([24, 22, 26], 0).blob(x * 0.03, 0.095, 0.05, 0.008, 0.012, 0.008, { segs: 4, bands: 2, lump: 0 });
        }
    });
    const fish = () => part('fish', s => {
        s.paint(shiny([150, 170, 180], 0.5), 0).fx(0).tube([[0, 0, 0.2, 0.01, 1], [0, 0, 0.12, 0.05, 1.6], [0, 0, -0.02, 0.06, 1.7], [0, 0, -0.16, 0.022, 1.5]], 5);
        for (const up of [1, -1]) s.paint([110, 130, 150], 0).tri([0, 0, -0.14], [0, 0.09, -0.27], [0, -0.09, -0.27], [up, 0, 0]);
    });
    return { KINDS, BIRDS, GAITS, pose, quad, bird, known, butterfly, leaf, flyer, flyerBody, fish, seal, crab };
})();
