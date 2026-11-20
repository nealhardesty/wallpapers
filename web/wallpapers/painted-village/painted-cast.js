// Painted Village's cast: whoever moves in the picture. Skaters on the
// pond, villagers on the lanes, sledders on the hill, carollers with a
// lantern, a horse and sleigh through the covered bridge, the lamplighter,
// the toy train and its steam, the mill wheel, the bonfire's flames, cats,
// squirrels, a cardinal, rabbits, deer in their glade and on the green at
// dawn, a bear and her cubs, a fox late, somebody climbing the mountain
// trail by lantern, a certain sleigh across the moon, the snowman's face.
//
// Everyone is a dozen dabs, drawn in metres (y up) at their place in the
// world, and lit as the painting is: the sky's light and whichever lamps
// are near and lit (Painting.lightAt), a few times a second each. Who is
// behind something has the lit picture put back over them through the
// band's mask (PaintedLogic.BANDS), so nobody walks in front of a tree
// they are behind. A lantern or a headlamp lights the snow it passes: a
// piece of the painting, multiplied by a pool of light, added to the frame.
// Whoever is up in the woods (`far`) has no place on the ground: they are
// put where the painting put their glade or their trail, in pixels.

class PaintedCast {
    constructor(m) {
        this.m = m;
        const T = this.T = m.scene, L = this.L = m.L;
        this.cam = m.cam;
        this.walkers = []; this.skaters = []; this.sledders = []; this.animals = []; this.notes = []; this.sparks = []; this.steam = [];
        this.horse = null; this.lighter = null; this.carol = null; this.flight = null; this.star = null; this.train = null; this.hiker = null;
        this.look = 0; this.lookHold = 0;
        this.jingle = 0;            // seconds the grand tree's bulbs go on flashing after a tap
        this.timers = {};
        // Who is next to whom on the lanes.
        this.links = {};
        for (const [a, b] of L.edges) { (this.links[a] ||= []).push(b); (this.links[b] ||= []).push(a); }
        this.ends = Object.values(L.nodes).filter(n => n.exit || n.door || n.away);
        // Which cells of each band's mask have anything in them, so that most restores are skipped.
        this.cells = T.masks.map(mask => {
            if (!mask) return null;
            const c = PaintedPlates.canvas(48, 27).getContext('2d', { willReadFrequently: true });
            c.drawImage(mask, 0, 0, 48, 27);
            const d = c.getImageData(0, 0, 48, 27).data, out = new Uint8Array(48 * 27);
            for (let i = 0; i < out.length; i++) out[i] = d[i * 4 + 3] > 8 ? 1 : 0;
            return out;
        });
        this.scratch = PaintedPlates.canvas(8, 8); this.sc = this.scratch.getContext('2d');
        this.poolCanvas = PaintedPlates.canvas(8, 8); this.pc = this.poolCanvas.getContext('2d');
        this.pools = {};
        this.paintG = T.paint.getContext('2d'); this.litG = T.lit.getContext('2d');
        this.random = WP.seededRandom(m.host.params?.seed ? 1234 : Math.floor(Math.random() * 1e9));
        this.build();
        // Look alive on frame one: the town already about its evening.
        for (let i = 0; i < 40; i++) this.populate(1.5, true);
    }

    rr(a, b) { return a + (b - a) * this.random(); }
    pick(a) { return a[Math.floor(this.random() * a.length)]; }

    // ---- Who is here ------------------------------------------------------------

    build() {
        const { T, L, m, cam } = this, cfg = m.config, S = T.spots, cats = PaintedCast.CATS, k = 1.9 * (cfg.catSize || 1);
        this.animals = [];
        if (cfg.cat && S.cat) this.animals.push({ kind: 'cat', coat: cats[0], k, x: S.cat.x, z: S.cat.z, y: S.cat.y, state: 'sleep', t: 0, dir: 1 });
        // More cats, each with a place of its own to begin with: a doorstep, the fire, the foot of the grand tree.
        const places = this.places = Object.values(L.nodes).filter(n => n.door || n.linger);
        for (let i = 0; i < Math.round(cfg.cats || 0) && places.length > 1; i++) {
            const at = places[(i * 3 + 1) % places.length], cat = { kind: 'cat', roam: true, coat: cats[(i + 1) % cats.length], k, x: 0, z: 0, y: 0, at: at.name, side: i % 2 ? 1 : -1, state: i % 2 ? 'sit' : 'sleep', t: this.rr(8, 60), dir: i % 2 ? 1 : -1, v: 1.0, phase: this.rr(0, 6), path: [] };
            [cat.x, cat.z] = this.seat(at, cat.side);
            this.animals.push(cat);
        }
        if (cfg.cardinal && S.cardinal) this.animals.push({ kind: 'cardinal', x: S.cardinal.x, z: S.cardinal.z, y: S.cardinal.y, home: { ...S.cardinal }, state: 'perch', t: this.rr(2, 6), dir: 1, hop: 0 });
        if (cfg.rabbits && S.rabbits) for (let i = 0; i < 2; i++) this.animals.push({ kind: 'rabbit', x: S.rabbits.x + i * 0.7, z: S.rabbits.z + i * cam.dz(0.5), y: 0, state: 'sit', t: this.rr(2, 8), dir: i ? -1 : 1, up: 0 });
        // Squirrels, on the rail fence in the corner.
        const posts = S.fence || [];
        if (posts.length > 1) for (let i = 0; i < Math.round(cfg.squirrels || 0); i++) { const j = (i * 2 + 1) % posts.length; this.animals.push({ kind: 'squirrel', k: 2.1, coat: i % 3 === 1 ? [0.34, 0.31, 0.32] : [0.66, 0.32, 0.14], x: posts[j][0], z: posts[j][1], y: 1.24, post: j, state: 'sit', t: this.rr(1, 7), dir: i % 2 ? 1 : -1, hops: [], hop: null, fir: null }); }
        // The deer in their glade.
        const G = (S.glades || []).find(g => g.kind === 'deer');
        if (cfg.deer && G) for (let i = 0; i < 4; i++) { const gx = -0.46 + i * 0.3 + this.rr(-0.05, 0.05); this.animals.push({ kind: 'deer', far: true, G, s: G.s, gx, home: gx, gy: this.rr(-0.5, -0.1), x: 0, z: 9, y: 0, state: i % 2 ? 'graze' : 'watch', t: this.rr(2, 9), dir: i % 2 ? -1 : 1, head: i % 2, small: i === 3, phase: 0, fade: 1 }); }
        this.train = cfg.train && S.tree && cfg.townTree !== false ? { a: this.train ? this.train.a : this.rr(0, 6.28), puff: 0 } : null;
        if (!this.train) this.steam = [];
    }
    // Where a cat sits at one of its places: beside the door, not in it; a little off the path.
    seat(n, side) { return [n.x + side * 1.15, n.z + this.cam.dz(n.door ? 0.9 : 0.5 * side)]; }
    settings(old, cfg) {
        if (['cat', 'cats', 'catSize', 'squirrels', 'cardinal', 'rabbits', 'train'].some(k => old[k] !== cfg[k])) this.build();
        if (!cfg.pond) this.skaters = [];
        if (!cfg.sledders) this.sledders = [];
    }
    trim() { /* counts follow density in populate() */ }
    stepped() {}

    // How busy the town is at this hour: 1 by day and evening, nearly nobody
    // at three in the morning; unless there are night owls (a third of
    // everyone stays out), or the hour makes no difference at all.
    bustle() {
        const h = this.m.hour, eve = this.m.season?.eve ? 1.5 : 0, b = h >= 7.5 && h < 21.5 + eve ? 1 : h >= 21.5 + eve && h < 23.4 + eve ? 0.45 : h >= 6 && h < 7.5 ? 0.25 : 0.06;
        return this.late(b);
    }
    onIce() { const h = this.m.hour; return this.late(h >= 8.5 && h < 23.3 ? (h > 21.5 ? 0.5 : 1) : 0); }
    late(share) { const life = this.m.config.nightLife; return life === 'always' ? 1 : life === 'sleeps' ? share : Math.max(0.34, share); }

    // Bring the numbers toward what the hour and the settings ask for.
    populate(dt, seed) {
        const { m, L } = this, cfg = m.config, dens = m.density();
        if (L.pond && cfg.pond) {
            const want = Math.round(cfg.skaters * dens * this.onIce());
            if (this.skaters.length < want && (seed || this.random() < dt * 0.5)) this.addSkater(seed);
            if (this.skaters.length > want && this.random() < dt * 0.25) { const s = this.skaters.find(s => !s.leaving); if (s) s.leaving = true; }
        }
        const hill = this.T.spots.sled;
        if (hill && cfg.sledders) {
            const b = this.bustle(), want = Math.round(cfg.sledders * dens * (b >= 1 ? 1 : b > 0.3 ? 0.34 : 0));
            if (this.sledders.length < want && (seed || this.random() < dt * 0.4)) this.addSledder(seed);
            if (this.sledders.length > want && this.random() < dt * 0.2) { const s = this.sledders.find(s => !s.leaving); if (s) s.leaving = true; }
        }
        if (cfg.village !== false || this.ends.length) {
            const want = Math.round(cfg.villagers * dens * this.bustle());
            const out = this.walkers.filter(w => w.kind === 'walker').length;
            if (out < want && (seed || this.random() < dt * 0.35)) this.addWalker(seed);
        }
        const dawn = m.hour >= 5.2 && m.hour < 7.6 && cfg.deer, deer = this.animals.filter(a => a.kind === 'deer' && !a.far);
        if (dawn && !deer.length && L.nodes.tree) for (let i = 0; i < 3; i++) this.animals.push({ kind: 'deer', x: L.nodes.tree.x - 2 + i * 2.2, z: L.nodes.tree.z + this.cam.dz(-1 + (i % 2) * 1.4), y: 0, state: 'graze', t: this.rr(2, 9), dir: i === 1 ? -1 : 1, head: 0, small: i === 2 });
        if (!dawn && deer.length) for (const d of deer) if (d.state !== 'go') { d.state = 'go'; d.dir = -1; }
        const late = (m.hour >= 23.6 || m.hour < 5) && cfg.fox;
        if (late && !this.animals.some(a => a.kind === 'fox') && L.nodes.near && this.random() < dt / 45) {
            const from = L.nodes.east || L.nodes.near, mid = L.nodes.pondE || L.nodes.pondN || L.nodes.near;
            this.animals.push({ kind: 'fox', x: from.x, z: from.z, y: 0, state: 'trot', path: [mid, L.nodes.bank || L.nodes.near, L.nodes.near], t: 0, dir: -1, phase: 0, prints: 0 });
        }
    }

    addSkater(seed) {
        const r = this.L.pond.rink, e = r.ellipse, a = this.rr(0, 6.28), k = seed ? this.rr(0.25, 0.85) : 0.95, kid = this.random() < 0.3;
        const coat = this.pick(PaintedCast.COATS);
        this.skaters.push({ kind: 'skater', x: e.cx + Math.cos(a) * e.rx * k, d: e.cy + Math.sin(a) * e.ry * k, a: a + Math.PI / 2, want: this.rr(0.3, 0.82), turn: this.random() < 0.75 ? 1 : -1, v: this.rr(3.2, 5.6) * (kid ? 0.75 : 1),
            k: kid ? 0.68 : this.rr(0.92, 1.05), phase: this.rr(0, 6.28), coat, hat: this.pick(PaintedCast.HATS), scarf: this.random() < 0.7 ? this.pick(PaintedCast.SCARVES) : null, skirt: this.random() < 0.4, hop: 0, down: 0, mark: 0, fade: seed ? 1 : 0, lt: 0, L: [1, 1, 1, 0] });
    }

    // Somebody small with a sled. They wait their turn at the top, ride down
    // on a heading of their own and a long way out over the flat
    // (PaintedLogic.sled), sit a moment, then trudge back up, pulling it.
    addSledder(seed) {
        const S = this.T.spots.sled, a = this.rr(S.a0, S.a1), R = PaintedLogic.knollRim(S, a);
        const s = { kind: 'sledder', a, next: a, s: 0.18 * R, v: 0, state: 'top', wait: this.rr(0.4, 3), x: 0, z: 0, y: 0, tilt: 0, dir: 1, k: this.rr(0.64, 0.82), phase: this.rr(0, 6.28),
            coat: this.pick(PaintedCast.COATS), hat: this.pick(PaintedCast.HATS), scarf: this.random() < 0.7 ? this.pick(PaintedCast.SCARVES) : null, sled: this.pick([[0.72, 0.14, 0.12], [0.16, 0.34, 0.6], [0.5, 0.34, 0.2]]), fade: seed ? 1 : 0, lt: 0, L: [1, 1, 1, 0] };
        if (seed) { const r = this.random(); if (r < 0.4) { s.state = 'ride'; s.s = this.rr(0.3, 1.1) * R; s.v = this.rr(3, 6); } else if (r < 0.8) { s.state = 'climb'; s.s = this.rr(0.3, 1.4) * R; } }
        this.sledders.push(s);
        return s;
    }
    updateSledders(dt) {
        const S = this.T.spots.sled, cam = this.cam, K = PaintedLogic;
        if (!S) return;
        for (let i = this.sledders.length - 1; i >= 0; i--) {
            const s = this.sledders[i], R = K.knollRim(S, s.a), top = 0.18 * R;
            s.fade = Math.max(0, Math.min(1, s.fade + (s.leaving && s.state !== 'ride' ? -dt : dt) * 0.8));
            if (s.leaving && s.fade <= 0) { this.sledders.splice(i, 1); continue; }
            if (s.state === 'top') {              // shuffling along the brow to where the next run starts
                s.a += (s.next - s.a) * Math.min(1, dt * 1.2); s.phase += dt * 5;
                if ((s.wait -= dt) <= 0) { s.state = 'ride'; s.v = 1.4; }
            } else if (s.state === 'ride') {
                [s.s, s.v] = K.sled(S, s.a, s.s, s.v, dt);
                if (s.v > 3 && this.random() < dt * s.v * 1.6) { const p = K.knollRun(S, cam.zm, s.a, s.s - 0.5), sc = cam.sc(p.z); this.sparks.push({ x: cam.sx(p.x, p.z), y: cam.sy(p.z) - p.y * sc - 0.1 * sc, vx: this.rr(-22, -4), vy: -this.rr(6, 22), age: 0, life: this.rr(0.3, 0.7), snow: true }); }
                if (s.v <= 0.05 && s.s > top + 1) { s.state = 'rest'; s.wait = this.rr(1.2, 3.2); }
            } else if (s.state === 'rest') { if ((s.wait -= dt) <= 0) s.state = 'climb'; }
            else {                                // back up: slower where it is steep
                s.s -= dt * (s.s < R ? 1.15 : 1.45); s.phase += dt * 8;
                if (s.s <= top) { s.s = top; s.state = 'top'; s.wait = this.rr(1, 4); s.next = this.rr(S.a0, S.a1); }
            }
            const p = K.knollRun(S, cam.zm, s.a, s.s), q = K.knollRun(S, cam.zm, s.a, s.s + 0.6);
            s.x = p.x; s.z = p.z; s.y = p.y; s.dir = s.state === 'climb' ? -1 : 1;
            // How the slope lies on the screen under the sled.
            s.tilt = Math.atan2((cam.sy(q.z) - q.y * cam.sc(q.z)) - (cam.sy(p.z) - p.y * cam.sc(p.z)), cam.sx(q.x, q.z) - cam.sx(p.x, p.z));
            s.down = s.state === 'ride' || s.state === 'rest' ? 1 : 0;
        }
    }

    addWalker(seed, o = {}) {
        if (this.ends.length < 2) return null;
        const from = o.from || this.pick(this.ends);
        let to = o.to || this.pick(this.ends);
        for (let i = 0; i < 6 && (to === from || (from.exit && to.exit && this.random() < 0.5)); i++) to = this.pick(this.ends);
        if (to === from) return null;
        const linger = Object.values(this.L.nodes).filter(n => n.linger), via = !o.to && linger.length && this.random() < 0.5 ? this.pick(linger) : null;
        const path = via ? [...this.route(from.name, via.name), ...this.route(via.name, to.name).slice(1)] : this.route(from.name, to.name);
        if (path.length < 2) return null;
        const kid = this.random() < 0.2;
        const w = { kind: o.kind || 'walker', x: from.x, z: from.z, path, at: 1, via: via?.name, wait: 0, v: this.rr(1.0, 1.5) * (kid ? 1.15 : 1), k: (kid ? 0.66 : this.rr(0.94, 1.06)), phase: this.rr(0, 6.28), dir: 1,
            coat: o.coat || this.pick(PaintedCast.COATS), hat: this.pick(PaintedCast.HATS), scarf: this.random() < 0.6 ? this.pick(PaintedCast.SCARVES) : null, skirt: this.random() < 0.35, fade: from.door && !seed ? 0 : 1, lane: this.rr(-0.5, 0.5), prints: 0, lt: 0, L: [1, 1, 1, 0],
            dog: o.kind ? null : (this.random() < Math.min(0.6, this.m.config.dogs / 30) ? { coat: this.pick([[0.62, 0.42, 0.24], [0.85, 0.82, 0.76], [0.2, 0.18, 0.18], [0.5, 0.36, 0.28]]) } : null), ...o.extra };
        if (seed) { const n = 1 + Math.floor(this.random() * (path.length - 1)), a = this.L.nodes[path[n - 1]], b = this.L.nodes[path[n]], t = this.random(); w.at = n; w.x = a.x + (b.x - a.x) * t; w.z = a.z + (b.z - a.z) * t; }
        this.walkers.push(w);
        return w;
    }
    // The shortest way along the lanes from one node to another: their names.
    route(from, to) {
        const prev = { [from]: null }, queue = [from];
        while (queue.length) {
            const n = queue.shift();
            if (n === to) break;
            for (const next of this.links[n] || []) if (!(next in prev)) { prev[next] = n; queue.push(next); }
        }
        if (!(to in prev)) return [];
        const out = [];
        for (let n = to; n; n = prev[n]) out.unshift(n);
        return out;
    }

    // ---- Things that are sent for ---------------------------------------------------

    lamplighterAbout() { return !!this.lighter || (this.timers.lighter > 0); }
    callLamplighter() {
        const m = this.m, lamps = this.T.groups.filter(g => g.kind === 'lamp' && !g.bridge);
        if (!lamps.length) return '🏮 There are no lamps to light';
        if (m.light.dark < 0.25) return '🏮 The lamplighter comes at dusk';
        for (const g of lamps) { g.lit = false; g.forced = null; }
        this.sendLighter();
        return '🏮 The lamplighter is on his round';
    }
    sendLighter() {
        const lamps = this.T.groups.filter(g => g.kind === 'lamp' && !g.bridge && !g.lit).sort((a, b) => a.x - b.x);
        if (!lamps.length || this.lighter) return;
        const edge = this.cam.half(lamps[0].z) + 2;
        this.lighter = { kind: 'lighter', x: -edge, z: lamps[0].z + this.cam.dz(1.2), stops: lamps, at: 0, wait: 0, v: 2.6, k: 1.02, phase: 0, dir: 1, coat: [0.20, 0.22, 0.30], hat: [0.12, 0.12, 0.14], scarf: [0.7, 0.2, 0.16], fade: 1, lt: 0, L: [1, 1, 1, 0], pole: 0, prints: 0 };
    }

    callCarollers() {
        const m = this.m, doors = Object.values(this.L.nodes).filter(n => n.door && !n.quiet);
        if (this.carol) return '🎶 They are already singing';
        if (!doors.length || this.ends.length < 2) return '🎶 Nobody to sing to';
        const from = this.pick(this.ends.filter(n => n.exit)) || this.ends[0], door = this.pick(doors);
        const path = this.route(from.name, door.name);
        if (path.length < 2) return null;
        const singers = [];
        for (let i = 0; i < 4; i++) {
            const w = this.addWalker(false, { kind: 'caroller', from, to: door, extra: { lane: -0.9 + i * 0.6, v: 1.15, k: i === 3 ? 0.7 : this.rr(0.94, 1.04), back: i * 0.55, lantern: i === 1, dog: null } });
            if (w) singers.push(w);
        }
        this.carol = { singers, door, state: 'go', t: 0 };
        return m.light.dark > 0.3 ? '🎶 Hark: the carollers are out' : '🎶 Carollers, in broad daylight';
    }

    callHorse() {
        const road = this.L.road;
        if (!road) return '🔔 No road for a sleigh here';
        if (this.horse) return null;
        const dir = this.random() < 0.5 ? 1 : -1;
        this.horse = { kind: 'horse', x: dir > 0 ? road.x0 : road.x1, z: road.z, dir, v: 4.6, phase: 0, lt: 0, L: [1, 1, 1, 0], bells: 0, coat: this.pick([[0.42, 0.26, 0.18], [0.24, 0.20, 0.20], [0.62, 0.58, 0.54]]) };
        return '🔔 Sleigh bells';
    }

    // A bear and her cubs, across their glade: out of the trees on one side, in again on the other.
    callBears() {
        const G = (this.T.spots.glades || []).find(g => g.kind === 'bears');
        if (!G) return '🐻 No glade for bears here';
        if (this.animals.some(a => a.kind === 'bear')) return '🐻 They are out already';
        const dir = this.random() < 0.5 ? 1 : -1, cubs = this.random() < 0.6 ? 2 : 1, gy = this.rr(-0.45, -0.15);
        const mum = { kind: 'bear', far: true, G, s: G.s, gx: -1.12 * dir, gy, x: 0, z: 9, y: 0, dir, state: 'walk', t: this.rr(4, 8), stops: 2, phase: 0, up: 0, sniff: 0, fade: 0 };
        this.animals.push(mum);
        for (let i = 0; i < cubs; i++) this.animals.push({ kind: 'bear', far: true, G, s: G.s, cub: true, mum, lag: 0.2 + i * 0.15, gx: mum.gx - dir * (0.2 + i * 0.15), gy: gy + 0.14 + i * 0.12, x: 0, z: 9, y: 0, dir, phase: this.rr(0, 6), up: 0, sniff: 0, k: 0.56, fade: 0 });
        return '🐻 Bears in the glade';
    }
    // Somebody on the mountain trail: up it (to the cabin) or down it.
    sendHiker(up) {
        if (!this.T.spots.trail || this.hiker) return null;
        return this.hiker = { kind: 'walker', far: true, u: up ? 0 : 1, way: up ? 1 : -1, x: 0, z: 9, y: 0, px: 0, py: 0, s: 1, dir: 1, k: 1, phase: 0, wait: 0, wave: 0, lantern: true, coat: this.pick(PaintedCast.COATS), hat: this.pick(PaintedCast.HATS), scarf: this.pick(PaintedCast.SCARVES), fade: 0, lt: 0, L: [1, 1, 1, 0] };
    }

    callSleigh() {
        const m = this.m;
        if (m.light.stars < 0.4) return '🎅 Not before dark';
        if (this.flight) return null;
        const moon = m.moonXY, y = moon ? moon.y : this.cam.hor * 0.26, dir = this.random() < 0.5 ? 1 : -1;
        this.flight = { t: 0, dir, y, x: moon ? moon.x : m.W / 2, r: moon ? moon.r : 24 * this.cam.u };
        return m.season?.eve ? '🎅 There he goes' : '🎅 A practice run';
    }
    shoot(x, y) { if (!this.star) this.star = { x, y, t: 0, dx: this.rr(-1, 1) * 260 * this.cam.u, dy: this.rr(60, 140) * this.cam.u }; }
    shake() { this.jingle = 1.4; const S = this.T.spots.tree; if (S) for (let i = 0; i < 26; i++) this.sparks.push({ x: S.fx + this.rr(-0.25, 0.25) * S.h * this.cam.sc(S.z), y: S.fy - this.rr(0.15, 0.95) * S.h * this.cam.sc(S.z), vx: this.rr(-14, 14), vy: this.rr(10, 50), age: 0, life: this.rr(0.8, 1.8), snow: true }); }
    // Tapped: he looks straight ahead, and holds it.
    caught() { this.look = 0; this.lookHold = 4; }

    tap(x, y) {
        const cam = this.cam;
        const near = (a, r, up = 0.9) => { const s = (a.far ? a.s : cam.sc(a.z)) * (a.k || 1), px = a.far ? a.px : cam.sx(a.x, a.z), py = (a.far ? a.py : cam.sy(a.z) - (a.y || 0) * cam.sc(a.z)) - up * s; return Math.hypot(x - px, y - py) < Math.max(18, r * s); };
        for (const s of this.skaters) { s.z = s.d / cam.zm; if (near(s, 1.1)) { if (s.k < 0.8 || this.random() < 0.3) s.down = 2.2; else s.hop = 1; return true; } }
        for (const a of this.animals) {
            if (!near(a, a.kind === 'deer' || a.kind === 'bear' ? 1.4 : 0.9, a.kind === 'deer' || a.kind === 'bear' ? 0.9 : 0.2)) continue;
            if (a.kind === 'cat') { if (a.state === 'walk') a.path = []; a.state = a.state === 'sleep' ? 'sit' : a.roam && a.state === 'sit' ? 'sit' : 'sleep'; a.t = 8; this.note(cam.sx(a.x, a.z), cam.sy(a.z) - a.y * cam.sc(a.z) - 0.9 * cam.sc(a.z) * a.k, '♥'); }
            else if (a.kind === 'cardinal') { a.state = 'fly'; a.t = 0; }
            else if (a.kind === 'rabbit') { a.up = 3; a.state = 'hop'; a.t = 0.6; }
            else if (a.kind === 'squirrel') { a.t = 0; if (!a.hop && !a.hops.length) this.scamper(a); }
            else if (a.kind === 'bear') { const mum = a.mum || a; if (mum.state === 'walk') { mum.state = 'stand'; mum.t = 3.5; } }
            else if (a.kind === 'deer' && a.far) { for (const d of this.animals) if (d.kind === 'deer' && d.far && d.state !== 'away') { d.state = 'flee'; d.dir = d.gx < 0 ? -1 : 1; } }
            else if (a.kind === 'deer') { for (const d of this.animals) if (d.kind === 'deer' && !d.far) { d.state = 'go'; d.dir = -1; d.fast = true; } }
            else if (a.kind === 'fox') a.fast = 3;
            return true;
        }
        for (const w of this.walkers) if (near(w, 0.8)) { w.wave = 1.6; return true; }
        return false;
    }

    note(x, y, ch) { this.notes.push({ x, y, ch, age: 0, sway: this.rr(0, 6.28) }); if (this.notes.length > 40) this.notes.shift(); }

    // ---- Per frame: moving ------------------------------------------------------------

    update(dt) {
        const { m, L, T, cam } = this, cfg = m.config, tm = this.timers;
        this.populate(dt);
        // Dusk: the lamplighter, if any lamp is still dark.
        tm.lighter = Math.max(0, (tm.lighter || 0) - dt);
        const dark = m.light.dark;
        if (cfg.lamplighter && cfg.lamps !== false && !this.lighter && dark > 0.26 && dark < 0.5 && T.groups.some(g => g.kind === 'lamp' && !g.bridge && !g.lit && g.forced == null)) this.sendLighter();
        // What comes by on its own.
        const night = dark > 0.5, eve = m.season?.eve;
        if (cfg.village !== false && night && !this.carol && m.chance(cfg.carollers * this.bustle(), dt)) this.callCarollers();
        if (cfg.village !== false && !this.horse && this.bustle() > 0.3 && m.chance(cfg.horse, dt)) this.callHorse();
        if (m.light.stars > 0.6 && !this.flight && m.chance(cfg.sleigh * (eve ? 6 : 1), dt)) this.callSleigh();
        if (cfg.bears > 0 && m.chance(cfg.bears, dt)) this.callBears();
        // The trail: up it by lantern of an evening, down it of a morning.
        if (!this.hiker && T.spots.trail && this.bustle() > 0.2 && m.chance(night ? 14 : 5, dt)) this.sendHiker(m.hour >= 12 || m.hour < 4);
        this.updateHiker(dt);

        this.updateSkaters(dt);
        this.updateSledders(dt);
        this.updateWalkers(dt);
        this.updateCarol(dt);
        this.updateLighter(dt);
        this.updateAnimals(dt);
        if (this.horse) {
            const h = this.horse, road = L.road;
            h.x += h.dir * h.v * dt; h.phase += dt * 9;
            if ((h.bells -= dt) <= 0) { h.bells = 0.5; }
            if (h.x < road.x0 - 1 || h.x > road.x1 + 1) this.horse = null;
            // The rabbits sit up as it passes.
            else for (const a of this.animals) if (a.kind === 'rabbit' && Math.abs(h.x - a.x) < 14) a.up = Math.max(a.up, 1.5);
        }
        this.updateTrain(dt);
        if (this.flight && (this.flight.t += dt / 9) >= 1) this.flight = null;
        if (this.star && (this.star.t += dt / 0.9) >= 1) this.star = null;
        this.jingle = Math.max(0, this.jingle - dt);
        // The snowman watches whoever is nearest, when nobody is watching him.
        const S = T.spots.snowman;
        if (S) {
            this.lookHold = Math.max(0, this.lookHold - dt);
            let best = null, bd = 12;
            for (const a of [...this.walkers, ...this.skaters]) { const d = Math.hypot(a.x - S.x, ((a.z ?? a.d / cam.zm) - S.z) * cam.zm); if (d < bd) { bd = d; best = a; } }
            const want = this.lookHold > 0 || !best ? 0 : Math.max(-1, Math.min(1, (best.x - S.x) / 4));
            this.look += (want - this.look) * Math.min(1, dt * 1.4);
        }
        for (let i = this.notes.length - 1; i >= 0; i--) { const n = this.notes[i]; n.age += dt; n.y -= 16 * cam.u * dt; n.x += Math.sin(n.age * 2 + n.sway) * 8 * cam.u * dt; if (n.age > 2.6) this.notes.splice(i, 1); }
        for (let i = this.sparks.length - 1; i >= 0; i--) { const s = this.sparks[i]; s.age += dt; s.x += s.vx * dt; s.y += s.vy * dt; if (!s.snow) s.vy -= 30 * dt; if (s.age > s.life) this.sparks.splice(i, 1); }
        // The fire spits.
        const F = T.spots.fire;
        if (F && F.group.level > 0.3 && this.random() < dt * 5) this.sparks.push({ x: F.fx + this.rr(-0.3, 0.3) * F.s, y: F.fy - 0.5 * F.s, vx: this.rr(-10, 10) + m.wind * 12, vy: -this.rr(20, 46), age: 0, life: this.rr(0.5, 1.3) });
    }

    updateSkaters(dt) {
        const { cam, L, m } = this;
        if (!L.pond) return;
        const e = L.pond.rink.ellipse;
        for (let i = this.skaters.length - 1; i >= 0; i--) {
            const s = this.skaters[i];
            s.fade = Math.max(0, Math.min(1, s.fade + (s.leaving ? -dt : dt) * 0.8));
            if (s.leaving && s.fade <= 0) { this.skaters.splice(i, 1); continue; }
            if (s.down > 0) { s.down -= dt; continue; }
            s.hop = Math.max(0, s.hop - dt * 1.6);
            // Keep clear of each other a little.
            let agility = 1.6;
            for (const o of this.skaters) if (o !== s && Math.hypot(o.x - s.x, o.d - s.d) < 1.6) agility = 2.6;
            s.a = VillageLogic.skate(e, s.x, s.d, s.a, s.want, s.turn, dt, agility);
            const px = s.x, pd = s.d;
            s.x += Math.cos(s.a) * s.v * dt; s.d += Math.sin(s.a) * s.v * dt;
            s.z = s.d / cam.zm; s.dir = Math.cos(s.a) >= 0 ? 1 : -1;
            s.phase += dt * (2.2 + s.v * 0.35);
            if (this.random() < dt * 0.05) s.want = this.rr(0.3, 0.85);
            // Blades mark the ice: into the painting itself, so the marks stay.
            if ((s.mark += dt) > 0.12 && m.config.pond) { s.mark = 0; this.scratch2(px, pd / cam.zm, s.x, s.z); }
        }
    }
    scratch2(x0, z0, x1, z1) {
        const { cam, T } = this, ps = T.ps, a = [cam.sx(x0, z0) * ps, cam.sy(z0) * ps], b = [cam.sx(x1, z1) * ps, cam.sy(z1) * ps];
        for (const [g, style] of [[this.paintG, 'rgba(150,170,214,0.5)'], [this.litG, 'rgba(210,220,250,0.16)']]) { g.save(); g.globalCompositeOperation = 'lighten'; g.strokeStyle = style; g.lineWidth = Math.max(1, 0.9 * cam.u * ps); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); g.restore(); }
    }
    // Whether the sledding hill stands between us and a place on the ground: the line from our eye to it, tried against the hill.
    hidden(x, z) {
        const S = this.T.spots.sled, cam = this.cam;
        if (!S || z < S.z) return false;
        for (let k = -0.8; k <= 0.81; k += 0.4) { const zh = S.z + k * S.rd / cam.zm; if (zh < z && PaintedLogic.knollAt(S, cam.zm, x * zh / z, zh) > cam.eye * (1 - zh / z)) return true; }
        return false;
    }
    // A footprint: a dab in the painting, darker than the snow and never darker than a print.
    print(x, z) {
        if (this.hidden(x, z)) return;
        const { cam, T } = this, ps = T.ps, px = cam.sx(x, z) * ps, py = cam.sy(z) * ps, s = cam.sc(z) * ps;
        for (const [g, style] of [[this.paintG, 'rgb(206,206,230)'], [this.litG, 'rgba(60,70,120,0.1)']]) { g.save(); g.globalCompositeOperation = g === this.paintG ? 'darken' : 'source-over'; g.fillStyle = style; g.beginPath(); g.ellipse(px, py, 0.16 * s, 0.07 * s, 0, 0, 6.2832); g.fill(); g.restore(); }
    }

    // Walk `w` toward (x, z) at its pace; true when there.
    stride(w, x, z, dt) {
        const cam = this.cam, dx = x - w.x, dz = (z - w.z) * cam.zm, d = Math.hypot(dx, dz), step = w.v * dt * (w.k < 0.8 ? 0.9 : 1);
        if (d <= step) { w.x = x; w.z = z; return true; }
        w.x += dx / d * step; w.z += dz / d * step / cam.zm;
        if (Math.abs(dx) > 0.02) w.dir = dx > 0 ? 1 : -1;
        w.phase += dt * 6.4 * w.v;
        if (((w.prints += step) > 0.62) && w.z < 4.3) { w.prints = 0; this.print(w.x + (Math.sin(w.phase) > 0 ? 0.1 : -0.1), w.z); }
        return false;
    }

    updateWalkers(dt) {
        const N = this.L.nodes;
        for (let i = this.walkers.length - 1; i >= 0; i--) {
            const w = this.walkers[i];
            w.wave = Math.max(0, (w.wave || 0) - dt);
            if (w.kind === 'caroller' && this.carol && this.carol.state !== 'go') continue;       // standing, singing
            if (w.wait > 0) { w.wait -= dt; continue; }
            const n = N[w.path[w.at]];
            if (!n) { this.walkers.splice(i, 1); continue; }
            const last = w.at === w.path.length - 1;
            w.fade = Math.min(1, w.fade + dt * 1.6);
            if (this.stride(w, n.x + (n.door ? 0 : w.lane * 0.5) - (w.back || 0) * w.dir * 0, n.z + (n.door || n.exit ? 0 : w.lane * this.cam.dz(0.6)), dt)) {
                if (n.name === w.via) { w.wait = this.rr(6, 18); if (n.name === 'farm') w.tree = true; }
                if (last) { if (w.kind === 'caroller') continue; this.walkers.splice(i, 1); continue; }
                w.at++;
            }
            if (last && n.door && w.kind === 'walker') { const d = Math.hypot(n.x - w.x, (n.z - w.z) * this.cam.zm); if (d < 1.2) w.fade = Math.max(0.02, d / 1.2); }
        }
    }

    updateCarol(dt) {
        const c = this.carol;
        if (!c) return;
        const { T, L, cam } = this;
        c.singers = c.singers.filter(w => this.walkers.includes(w));
        if (!c.singers.length) { this.carol = null; return; }
        const there = c.singers.every(w => w.at === w.path.length - 1 && Math.hypot(w.x - L.nodes[w.path[w.at]].x, (w.z - L.nodes[w.path[w.at]].z) * cam.zm) < 2.4);
        const house = (T.spots.houses || []).slice().sort((a, b) => Math.hypot(a.door[0] - c.door.x, (a.door[1] - c.door.z) * cam.zm) - Math.hypot(b.door[0] - c.door.x, (b.door[1] - c.door.z) * cam.zm))[0];
        if (c.state === 'go' && there) { c.state = 'sing'; c.t = 16; c.house = house; if (house) for (const g of Object.values(house.groups)) g.forced = true; c.singers.forEach((w, i) => { w.dir = i < 2 ? 1 : -1; }); }
        else if (c.state === 'sing') {
            c.t -= dt;
            if (this.random() < dt * 2.4) { const w = this.pick(c.singers); this.note(cam.sx(w.x, w.z), cam.sy(w.z) - 1.9 * cam.sc(w.z), this.pick(['♪', '♫', '♪'])); }
            if (c.t <= 0) {
                if (c.house) for (const g of Object.values(c.house.groups)) g.forced = null;
                const exits = this.ends.filter(n => n.exit), to = this.pick(exits);
                for (const w of c.singers) { w.path = this.route(c.door.name, to.name); w.at = Math.min(1, w.path.length - 1); w.kind = 'walker'; w.wait = 0; }
                this.carol = null;
            }
        }
    }

    updateLighter(dt) {
        const l = this.lighter;
        if (!l) return;
        const cam = this.cam;
        l.pole = Math.max(0, l.pole - dt);
        if (l.wait > 0) { l.wait -= dt; if (l.wait <= 0.9 && l.target && !l.target.lit) { l.target.lit = true; } return; }
        const g = l.stops[l.at];
        if (!g) { if (this.stride(l, cam.half(l.z) + 3, l.z, dt)) { this.lighter = null; this.timers.lighter = 2; } return; }
        if (g.lit) { l.at++; return; }
        if (this.stride(l, g.x - 0.9, g.z + cam.dz(1.2), dt)) { l.wait = 1.8; l.pole = 1.8; l.target = g; l.dir = 1; l.at++; }
    }

    // The train's cars, front to back: each is where the track is, that far behind the front of the engine, heading `a` round it.
    cars() {
        const S = this.T.spots.tree, out = [];
        let back = 0;
        for (const car of PaintedCast.TRAIN) { const a = this.train.a - (back + car.len / 2) / S.r; back += car.len + 0.3; out.push({ kind: 'car', car, a, x: S.x + Math.cos(a) * S.r, z: S.z + Math.sin(a) * S.r / this.cam.zm }); }
        return out;
    }
    updateTrain(dt) {
        const tr = this.train, S = this.T.spots.tree, cam = this.cam;
        for (let i = this.steam.length - 1; i >= 0; i--) { const p = this.steam[i]; p.age += dt; p.y += 1.3 * dt; p.x += (this.m.wind * 0.5 + p.vx) * dt; if (p.age > p.life) this.steam.splice(i, 1); }
        if (!tr || !S) return;
        const speed = this.m.config.trainSpeed ?? 1;
        tr.a += dt * 0.34 * speed;
        // A puff from the stack, a little behind the front of the engine.
        if (speed > 0 && (tr.puff -= dt * speed) <= 0 && this.steam.length < 9) {
            tr.puff = 0.34;
            const a = tr.a - (PaintedCast.TRAIN[0].len - 1.0) / S.r, back = Math.sin(a) * 0.3;
            this.steam.push({ kind: 'steam', x: S.x + Math.cos(a) * S.r, z: S.z + Math.sin(a) * S.r / cam.zm, y: 1.7, vx: back, age: 0, life: this.rr(1.2, 1.9) });
        }
    }

    updateHiker(dt) {
        const h = this.hiker, pts = this.T.spots.trail;
        if (!h) return;
        if (!pts) { this.hiker = null; return; }
        h.u += h.way * dt / 80; h.phase += dt * 7.5;
        const k = Math.max(0, Math.min(1, h.u)) * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(k)), t = k - i, a = pts[i], b = pts[i + 1];
        h.px = a[0] + (b[0] - a[0]) * t; h.py = a[1] + (b[1] - a[1]) * t;
        if (Math.abs(b[0] - a[0]) > 0.4) h.dir = (b[0] - a[0]) * h.way > 0 ? 1 : -1;
        h.s = (3.4 + 2.8 * h.u) * this.cam.u;                         // the cabin is drawn large for its distance, and so is whoever nears it
        h.fade = Math.max(0, Math.min(1, Math.min(h.u, 1 - h.u) / 0.04));
        if (h.u >= 1) { const g = this.T.spots.cabin && this.T.spots.cabin.group; if (g && this.m.light.dark > 0.3) g.forced = true; this.hiker = null; }      // home: the lamps are lit
        else if (h.u <= 0) this.hiker = null;
    }

    // A squirrel's next errand: a run of places to go, each { x, z, y } and how it gets there.
    scamper(a) {
        const posts = this.T.spots.fence, firs = this.T.spots.firs || [], dz = this.cam.dz, top = i => ({ x: posts[i][0], z: posts[i][1], y: 1.24, lift: 0.05 });
        if (a.fir) {                              // down the trunk, over the snow, up a post
            const f = a.fir, j = Math.floor(this.random() * posts.length);
            a.hops.push({ x: f.x + 0.3, z: f.z - dz(0.2), y: 0, n: 1, lift: 0 }, { x: posts[j][0], z: posts[j][1] - dz(0.3), y: 0, lift: 0.22 }, { ...top(j), n: 1, lift: 0.4 });
            a.fir = null; a.post = j;
        } else if (!firs.length || this.random() < 0.6) {     // along the rail, a post or three
            const j = Math.max(0, Math.min(posts.length - 1, a.post + this.pick([-3, -2, -1, 1, 2, 3])));
            for (let i = a.post; i !== j;) { i += Math.sign(j - i); a.hops.push(top(i)); }
            a.post = j;
        } else {                                  // down, across the snow, and up the nearest fir
            const f = firs.slice().sort((p, q) => Math.hypot(p.x - a.x, (p.z - a.z) * this.cam.zm) - Math.hypot(q.x - a.x, (q.z - a.z) * this.cam.zm))[0];
            a.hops.push({ x: a.x + 0.2, z: a.z - dz(0.3), y: 0, n: 1, lift: 0.3 }, { x: f.x + 0.3, z: f.z - dz(0.2), y: 0, lift: 0.22 }, { x: f.x + 0.14, z: f.z - dz(0.15), y: this.rr(1.0, Math.max(1.2, 0.3 * f.h)), n: 1, lift: 0 });
            a.fir = f;
        }
    }

    updateAnimals(dt) {
        const cam = this.cam, m = this.m, clamp = PaintedLogic.clamp;
        let gone = false;
        for (let i = this.animals.length - 1; i >= 0; i--) {
            const a = this.animals[i];
            a.t -= dt;
            if (a.far) { a.px = a.G.x + a.gx * a.G.rx; a.py = a.G.y + a.gy * a.G.ry; }
            if (a.kind === 'cat') {
                if (a.state === 'walk') {             // off down the lanes to another of its places
                    const n = this.L.nodes[a.path[0]], last = a.path.length === 1, to = !n ? null : last ? this.seat(n, a.side) : [n.x + a.side * 0.5, n.z + cam.dz(0.3) * a.side];
                    if (!to || this.stride(a, to[0], to[1], dt)) { a.path.shift(); if (!a.path.length) { a.state = 'sit'; a.t = this.rr(6, 25); if (n) a.at = n.name; } }
                } else if (a.state === 'sit' && a.t <= 0) {
                    const to = a.roam && this.random() < 0.5 ? this.pick(this.places) : null, path = to && to.name !== a.at ? this.route(a.at, to.name) : [];
                    if (path.length > 1) { a.path = path.slice(1); a.state = 'walk'; } else { a.state = 'sleep'; a.t = this.rr(40, 150); }
                } else if (a.state === 'sleep') {
                    if (a.roam && a.t <= 0) { a.state = 'sit'; a.t = this.rr(3, 9); }
                    if (this.random() < dt * 0.04) this.note(cam.sx(a.x, a.z) + 8 * cam.u, cam.sy(a.z) - a.y * cam.sc(a.z) - 0.5 * cam.sc(a.z) * a.k, 'z');
                }
            } else if (a.kind === 'squirrel') {
                if (a.hop) {                          // on its way: a run along the rail, or a bound over the snow
                    const h = a.hop, u = Math.min(1, h.u += dt / h.T);
                    a.x = h.x0 + (h.x1 - h.x0) * u; a.z = h.z0 + (h.z1 - h.z0) * u; a.y = h.y0 + (h.y1 - h.y0) * u + Math.abs(Math.sin(u * Math.PI * h.n)) * h.lift;
                    if (Math.abs(h.x1 - h.x0) > 0.05) a.dir = h.x1 > h.x0 ? 1 : -1;
                    if (u >= 1) { a.hop = null; if (!a.hops.length) { a.state = 'sit'; a.t = this.rr(1.5, 8); } }
                } else if (a.hops.length) {
                    const p = a.hops.shift(), d = Math.hypot(p.x - a.x, (p.z - a.z) * cam.zm, p.y - a.y);
                    a.hop = { x0: a.x, z0: a.z, y0: a.y, x1: p.x, z1: p.z, y1: p.y, u: 0, T: Math.max(0.14, d / 3.4), n: p.n ?? Math.max(1, Math.round(d / 0.7)), lift: p.lift ?? 0.12 }; a.state = 'run';
                } else if (a.t <= 0) this.scamper(a);
            } else if (a.kind === 'bear') {
                if (a.cub) {                          // keeps up, in bursts
                    const d = a.mum.gx - a.dir * a.lag - a.gx, far = Math.abs(d) > 0.13;
                    a.moving = Math.abs(d) > 0.02;
                    if (a.moving) { a.gx += Math.sign(d) * Math.min(Math.abs(d), (far ? 0.2 : 0.07) * dt); a.phase += dt * (far ? 14 : 7); }
                    a.sniff += ((a.moving ? 0 : 1) - a.sniff) * Math.min(1, dt * 2);
                } else {
                    a.moving = a.state === 'walk';
                    if (a.moving) { a.gx += a.dir * 0.075 * dt; a.phase += dt * 5.5; if (a.t <= 0 && a.stops > 0 && Math.abs(a.gx) < 0.62) { a.stops--; a.state = this.random() < 0.5 ? 'stand' : 'sniff'; a.t = this.rr(2.5, 5); } }
                    else if (a.t <= 0) { a.state = 'walk'; a.t = this.rr(4, 9); }
                    a.up += ((a.state === 'stand' ? 1 : 0) - a.up) * Math.min(1, dt * 3.5); a.sniff += ((a.state === 'sniff' ? 1 : 0) - a.sniff) * Math.min(1, dt * 2.5);
                    if (a.gx * a.dir > 1.14) { a.done = true; for (const c of this.animals) if (c.mum === a) c.done = true; gone = true; }
                }
                a.fade = clamp((1.1 - Math.abs(a.gx)) / 0.16);
            }
            else if (a.kind === 'cardinal') {
                a.gone = m.light.dark > 0.7;
                if (a.state === 'perch') { a.hop = Math.max(0, a.hop - dt * 5); if (a.t <= 0) { a.t = this.rr(1.5, 6); a.hop = 1; if (this.random() < 0.4) a.dir = -a.dir; } }
                else if (a.state === 'fly') { a.t += dt * 2; const k = a.t / 14; a.x = a.home.x + Math.sin(k * 6.2832) * 5; a.y = a.home.y + Math.sin(k * 3.1416) * 3.2; a.dir = Math.cos(k * 6.2832) >= 0 ? 1 : -1; if (k >= 1) { a.state = 'perch'; a.x = a.home.x; a.y = a.home.y; a.t = 3; } }
            } else if (a.kind === 'rabbit') {
                a.up = Math.max(0, a.up - dt);
                if (a.state === 'hop') { a.x += a.dir * 1.6 * dt; if (a.t <= 0) { a.state = 'sit'; a.t = this.rr(3, 12); } }
                else if (a.t <= 0) { if (this.random() < 0.5) { a.state = 'hop'; a.t = 0.5; if (Math.abs(a.x - this.T.spots.rabbits.x) > 0.9) a.dir = a.x > this.T.spots.rabbits.x ? -1 : 1; else if (this.random() < 0.5) a.dir = -a.dir; } else { a.up = this.rr(1, 3); a.t = this.rr(3, 9); } }
            } else if (a.kind === 'deer' && a.far) {
                // In the glade: grazing and looking up; startled, off into the trees, and back when it is quiet.
                if (a.state === 'flee') { a.gx += a.dir * 0.55 * dt; a.phase += dt * 15; if (Math.abs(a.gx) > 1.14) { a.state = 'away'; a.t = this.rr(12, 30); } }
                else if (a.state === 'away') { if (a.t <= 0) { a.state = 'back'; a.dir = -a.dir; } }
                else if (a.state === 'back') { a.gx += a.dir * 0.08 * dt; a.phase += dt * 6; if ((a.home - a.gx) * a.dir <= 0) { a.gx = a.home; a.state = 'watch'; a.t = this.rr(2, 6); } }
                else { a.head += ((a.state === 'graze' ? 1 : 0) - a.head) * Math.min(1, dt * 2); if (a.t <= 0) { a.state = a.state === 'graze' ? 'watch' : 'graze'; a.t = this.rr(2.5, 9); if (this.random() < 0.25) a.dir = -a.dir; } }
                a.fade = clamp((1.12 - Math.abs(a.gx)) / 0.14);
            } else if (a.kind === 'deer') {
                if (a.state === 'go') { a.x += a.dir * (a.fast ? 5.5 : 1.3) * dt; a.phase = (a.phase || 0) + dt * (a.fast ? 14 : 6); if (Math.abs(a.x) > cam.half(a.z) + 3) this.animals.splice(i, 1); }
                else { a.head += ((a.state === 'graze' ? 1 : 0) - a.head) * Math.min(1, dt * 2); if (a.t <= 0) { a.state = a.state === 'graze' ? 'watch' : 'graze'; a.t = this.rr(2.5, 9); } }
            } else if (a.kind === 'fox') {
                const p = a.path[0];
                a.fast = Math.max(0, (a.fast || 0) - dt);
                if (!p) { this.animals.splice(i, 1); continue; }
                if (a.wait > 0) { a.wait -= dt; continue; }
                a.v = a.fast ? 6 : 2.4; a.k = 1;
                if (this.stride(a, p.x, p.z, dt)) { a.path.shift(); if (a.path.length === 2) a.wait = this.rr(2.5, 5); }
            }
        }
        if (gone) this.animals = this.animals.filter(a => !a.done);
    }

    // ---- Per frame: drawing ---------------------------------------------------------------

    // The colour of a dab of local colour `c`, in the light on actor `a`.
    tone(a, c, k = 1) {
        const L = a.L, t = a.air || 0, h = a.hz || [0, 0, 0];
        const r = Math.min(1, c[0] * L[0] * k) * (1 - t) + h[0] * t, g = Math.min(1, c[1] * L[1] * k) * (1 - t) + h[1] * t, b = Math.min(1, c[2] * L[2] * k) * (1 - t) + h[2] * t;
        return `rgb(${r * 255 | 0},${g * 255 | 0},${b * 255 | 0})`;
    }
    relight(a, dt, up = 1) {
        if ((a.lt -= dt) > 0) return;
        a.lt = 0.22 + Math.random() * 0.1;
        const l = this.m.light;
        this.T.lightAt(l, a.x, a.z, up, a.L);
        a.air = Math.max(0, 1 - Math.exp(-(a.z - 1) / 12)) * 0.9;
        a.hz = l.haze0;
        a.cols = a.tints = null;
    }
    // The same, kept until the light on `a` is next worked out: for whoever is drawn every frame in a few fixed colours.
    tint(a, key, c, k = 1) { const t = (a.tints ||= {}); return t[key] ||= this.tone(a, c, k); }

    // Put the lit picture back over whatever is nearer than depth z, in a box (CSS px).
    restore(ctx, z, x, y, w, h) {
        const T = this.T, k = PaintedLogic.bandOf(z, this.L.bands), mask = k >= 0 ? T.masks[k] : null;
        if (!mask) return;
        const m = this.m, W = m.W, H = m.H;
        x = Math.max(0, Math.floor(x)); y = Math.max(0, Math.floor(y)); w = Math.min(W - x, Math.ceil(w)); h = Math.min(H - y, Math.ceil(h));
        if (w < 2 || h < 2) return;
        const cells = this.cells[k], c0 = Math.floor(x / W * 48), c1 = Math.min(47, Math.floor((x + w) / W * 48)), r0 = Math.floor(y / H * 27), r1 = Math.min(26, Math.floor((y + h) / H * 27));
        let any = false;
        for (let r = r0; r <= r1 && !any; r++) for (let c = c0; c <= c1; c++) if (cells[r * 48 + c]) { any = true; break; }
        if (!any) return;
        const ps = T.ps, dpr = m.dpr, sw = Math.ceil(w * dpr), sh = Math.ceil(h * dpr), s = this.scratch, g = this.sc;
        if (s.width < sw || s.height < sh) { s.width = Math.max(s.width, sw); s.height = Math.max(s.height, sh); }
        g.globalCompositeOperation = 'copy'; g.drawImage(T.lit, x * ps, y * ps, w * ps, h * ps, 0, 0, sw, sh);
        g.globalCompositeOperation = 'destination-in'; g.drawImage(mask, x * ps / 2, y * ps / 2, w * ps / 2, h * ps / 2, 0, 0, sw, sh);
        // 'copy' cleared the whole scratch; only the box is drawn back.
        ctx.drawImage(s, 0, 0, sw, sh, x, y, w, h);
    }

    // A pool of light on the snow at (x, z), `r` metres across: the painting there, times the light, added.
    pool(ctx, x, z, r, colour, strength) {
        const m = this.m, T = this.T, cam = this.cam;
        if (m.fx.glints < 0.02 || strength < 0.02 || this.hidden(x, z)) return;
        const key = colour.join();
        let sprite = this.pools[key];
        if (!sprite) { sprite = this.pools[key] = PaintedPlates.canvas(64, 64); const g = sprite.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, PaintedPlates.css(colour)); gr.addColorStop(0.4, PaintedPlates.css(colour.map(c => c * 0.5))); gr.addColorStop(1, '#000'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }
        const s = cam.sc(z), cx = cam.sx(x, z), cy = cam.sy(z), rx = r * s, ry = Math.max(4, rx * 0.34), ps = T.ps;
        const bx = Math.max(0, cx - rx), by = Math.max(0, cy - ry), bw = Math.min(m.W, cx + rx) - bx, bh = Math.min(m.H, cy + ry) - by;
        if (bw < 4 || bh < 2) return;
        const pw = Math.min(256, Math.ceil(bw)), ph = Math.min(128, Math.ceil(bh)), pc = this.poolCanvas, g = this.pc;
        if (pc.width < pw || pc.height < ph) { pc.width = Math.max(pc.width, pw); pc.height = Math.max(pc.height, ph); }
        g.globalCompositeOperation = 'copy'; g.drawImage(T.paint, bx * ps, by * ps, bw * ps, bh * ps, 0, 0, pw, ph);
        g.globalCompositeOperation = 'multiply'; g.drawImage(sprite, 0, 0, 64, 64, (cx - rx - bx) / bw * pw, (cy - ry - by) / bh * ph, rx * 2 / bw * pw, ry * 2 / bh * ph);
        // Outside the sprite the painting must not be added at all.
        g.globalCompositeOperation = 'destination-in'; g.beginPath(); g.ellipse((cx - bx) / bw * pw, (cy - by) / bh * ph, rx / bw * pw, ry / bh * ph, 0, 0, 6.2832); g.fill();
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, strength * m.fx.glints * m.light.warm);
        ctx.drawImage(pc, 0, 0, pw, ph, bx, by, bw, bh);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    glow(ctx, px, py, r, colour, a) {
        const gr = ctx.createRadialGradient(px, py, 0, px, py, r);
        gr.addColorStop(0, PaintedPlates.css(colour, a)); gr.addColorStop(0.35, PaintedPlates.css(colour, a * 0.3)); gr.addColorStop(1, PaintedPlates.css(colour, 0));
        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(px, py, r, 0, 6.2832); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
    }

    draw(ctx) {
        const { m, cam, T } = this, dt = 1 / 60, dark = m.light.dark, size = m.config.peopleSize || 1;
        const list = [];
        for (const s of this.skaters) list.push(s);
        for (const w of this.walkers) list.push(w);
        for (const s of this.sledders) list.push(s);
        if (this.lighter) list.push(this.lighter);
        if (this.horse) list.push(this.horse);
        if (this.hiker) { this.hiker.lantern = dark > 0.2; list.push(this.hiker); }
        for (const a of this.animals) if (!a.gone) list.push(a);
        if (this.train) {
            // The tree hides whatever of the train is behind it. Its cars and its steam go in as one piece for each band they are in, so each piece is put back once, not each car.
            const S = T.spots.tree, L = (this.trainL ||= [1, 1, 1, 0]), pieces = new Map();
            for (const p of [...this.cars(), ...this.steam]) { p.L = L; const k = PaintedLogic.bandOf(p.z, this.L.bands); if (!pieces.has(k)) pieces.set(k, { kind: 'train', x: p.x, z: p.z, near: p.z < S.z, parts: [] }); pieces.get(k).parts.push(p); }
            for (const piece of pieces.values()) { piece.parts.sort((a, b) => b.z - a.z); list.push(piece); }
            if ((this.trainT = (this.trainT || 0) - dt) <= 0) { this.trainT = 0.3; T.lightAt(m.light, S.x, S.z - cam.dz(S.r), 0.4, L); this.trainTints = null; }
        }
        const M = T.spots.mill;
        if (M) { const L = (this.millL ||= [1, 1, 1, 0]); if ((this.millT = (this.millT || 0) - dt) <= 0) { this.millT = 0.5; T.lightAt(m.light, M.x, M.z, M.y, L); } list.push({ kind: 'wheel', x: M.x, z: M.z, L }); }
        if (T.spots.fire) list.push({ kind: 'fire', x: T.spots.fire.x, z: T.spots.fire.z - 0.005 });
        if (T.spots.snowman) list.push({ kind: 'face', x: T.spots.snowman.x, z: T.spots.snowman.z - 0.005 });
        list.sort((a, b) => b.z - a.z);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (const a of list) {
            const fixed = a.kind === 'train' || a.kind === 'wheel' || a.kind === 'fire' || a.kind === 'face', s0 = a.far ? a.s : cam.sc(a.z);
            const s = s0 * (a.k || 1) * (fixed ? 1 : size), px = a.far ? a.px : cam.sx(a.x, a.z), py = a.far ? a.py : cam.sy(a.z);
            if (px < -160 || px > m.W + 160) continue;
            if (!fixed) { if (!a.L) { a.L = [1, 1, 1, 0]; a.lt = 0; } this.relight(a, dt, a.kind === 'horse' ? 1.3 : 1); }
            const alpha = a.fade ?? 1;
            if (alpha <= 0) continue;
            let box = [px - 1.1 * s, py - 2.3 * s - (a.y || 0) * s, 2.2 * s, 2.5 * s + (a.y || 0) * s];
            ctx.globalAlpha = alpha;
            if (a.kind === 'skater' || a.kind === 'walker' || a.kind === 'caroller' || a.kind === 'lighter') {
                // On the ice, the ice shows them; on snow, a shadow.
                if (a.kind === 'skater') { ctx.save(); ctx.globalAlpha = alpha * 0.2; ctx.translate(px, py + 0.04 * s); ctx.scale(s * a.dir, s * 0.85); this.person(ctx, a, true); ctx.restore(); ctx.globalAlpha = alpha; }
                else { ctx.fillStyle = `rgba(36,44,92,${0.2 * alpha})`; ctx.beginPath(); ctx.ellipse(px + 0.12 * s, py + 0.03 * s, 0.42 * s, 0.1 * s, 0, 0, 6.2832); ctx.fill(); }
                if (a.lantern && dark > 0.2 && !a.far) this.pool(ctx, a.x + a.dir * 0.5, a.z, 5.5, [1, 0.72, 0.34], 0.9);
                ctx.save(); ctx.translate(px, py - (a.kind === 'skater' ? Math.sin(Math.min(1, a.hop) * Math.PI) * 0.5 * s : 0)); ctx.scale(s * a.dir, -s);
                this.person(ctx, a, false);
                ctx.restore();
                if (a.lantern && dark > 0.12) this.glow(ctx, px + a.dir * 0.52 * s, py - 1.5 * s, (a.far ? 2.2 : 0.9) * s, [1, 0.8, 0.45], 0.75 * dark * alpha);
                if (a.dog) { const dx = px - a.dir * 1.0 * s; ctx.save(); ctx.translate(dx, py); ctx.scale(s * a.dir, -s); this.dog(ctx, a, a.dog.coat); ctx.restore(); ctx.strokeStyle = this.tone(a, [0.2, 0.16, 0.14]); ctx.lineWidth = Math.max(0.6, 0.02 * s); ctx.beginPath(); ctx.moveTo(px - a.dir * 0.3 * s, py - 0.95 * s); ctx.lineTo(dx + a.dir * 0.36 * s, py - 0.5 * s); ctx.stroke(); box = [px - 1.7 * s, box[1], 3.4 * s, box[3]]; }
                if (a.kind === 'lighter') box = [px - 1.2 * s, py - 3.9 * s, 2.6 * s, 4.1 * s];
                if (a.tree && a.wait <= 0) {        // a tree from the farm, going home
                    const tx = px - a.dir * 0.5 * s, ty = py - 0.12 * s;
                    ctx.fillStyle = this.tone(a, [0.14, 0.3, 0.22]); ctx.beginPath(); ctx.moveTo(tx, ty - 0.3 * s); ctx.lineTo(tx - a.dir * 2.1 * s, ty); ctx.lineTo(tx, ty + 0.3 * s); ctx.closePath(); ctx.fill();
                    box = [px - 2.8 * s, box[1], 5.6 * s, box[3]];
                }
            } else if (a.kind === 'sledder') {
                const ly = py - a.y * s0, col = this.tone(a, a.sled);
                ctx.fillStyle = `rgba(36,44,92,${0.2 * alpha})`; ctx.beginPath(); ctx.ellipse(px, ly + 0.03 * s, 0.5 * s, 0.1 * s, a.tilt, 0, 6.2832); ctx.fill();
                // Ridden down the slope, leaning with it; or pulled behind on a string, going up.
                ctx.save(); ctx.translate(px, ly); ctx.rotate(a.down ? a.tilt : a.tilt * 0.4);
                const at = a.down ? 0 : 1.05 * s;
                ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, 0.1 * s); ctx.beginPath(); ctx.moveTo(at - 0.55 * s, -0.07 * s); ctx.lineTo(at + 0.5 * s, -0.07 * s); ctx.quadraticCurveTo(at + 0.66 * s, -0.08 * s, at + 0.62 * s, -0.24 * s); ctx.stroke();
                if (!a.down) { ctx.strokeStyle = this.tone(a, [0.2, 0.16, 0.14]); ctx.lineWidth = Math.max(0.6, 0.025 * s); ctx.beginPath(); ctx.moveTo(at - 0.5 * s, -0.1 * s); ctx.lineTo(-0.2 * s, -0.86 * s); ctx.stroke(); }
                ctx.translate(0, a.down ? -0.09 * s : 0); ctx.scale(s * a.dir, -s); this.person(ctx, a, false);
                ctx.restore();
                box = [px - 1.9 * s, ly - 2.4 * s, 3.8 * s, 2.9 * s];
            } else if (a.kind === 'horse') {
                if (dark > 0.2) this.pool(ctx, a.x + a.dir * 2.2, a.z, 7, [1, 0.74, 0.36], 0.85);
                ctx.fillStyle = 'rgba(36,44,92,0.2)'; ctx.beginPath(); ctx.ellipse(px - a.dir * 1.6 * s, py + 0.03 * s, 3.2 * s, 0.16 * s, 0, 0, 6.2832); ctx.fill();
                ctx.save(); ctx.translate(px, py); ctx.scale(s * a.dir, -s); this.horseAndSleigh(ctx, a); ctx.restore();
                if (dark > 0.12) this.glow(ctx, px - a.dir * 2.25 * s, py - 1.25 * s, 0.8 * s, [1, 0.8, 0.45], 0.8 * dark);
                box = [px - 5.2 * s, py - 2.6 * s, 10.4 * s, 2.8 * s];
            } else if (a.kind === 'train') {
                let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
                for (const p of a.parts) {
                    const ps = cam.sc(p.z), cx = cam.sx(p.x, p.z), cy = cam.sy(p.z);
                    if (p.kind === 'car') {
                        if (p.car.kind === 'engine' && dark > 0.2) this.pool(ctx, p.x - Math.sin(p.a) * 2.8, p.z + Math.cos(p.a) * 2.8 / cam.zm, 4.5, [1, 0.8, 0.45], 0.8);
                        this.car(ctx, p);
                        if (a.near) this.restore(ctx, p.z, cx - 2.3 * ps, cy - 2.2 * ps, 4.6 * ps, 2.7 * ps);         // in front of the tree there is seldom anything nearer still
                        x0 = Math.min(x0, cx - 2.3 * ps); x1 = Math.max(x1, cx + 2.3 * ps); y0 = Math.min(y0, cy - 2.2 * ps); y1 = Math.max(y1, cy + 0.5 * ps);
                    } else {
                        const t = p.age / p.life, r = (0.2 + 0.55 * t) * ps;
                        ctx.globalAlpha = (1 - t) * 0.6; ctx.fillStyle = this.tone(p, [0.93, 0.94, 0.98], 0.9); ctx.beginPath(); ctx.arc(cx, cy - p.y * ps, r, 0, 6.2832); ctx.fill(); ctx.globalAlpha = 1;
                        x0 = Math.min(x0, cx - r); x1 = Math.max(x1, cx + r); y0 = Math.min(y0, cy - p.y * ps - r); y1 = Math.max(y1, cy - p.y * ps + r);
                    }
                }
                if (a.near) continue;
                box = [x0, y0, x1 - x0, y1 - y0];
            } else if (a.kind === 'wheel') { box = this.wheel(ctx, M, a); }
            else if (a.kind === 'fire') { this.fire(ctx, T.spots.fire); continue; }
            else if (a.kind === 'face') { this.face(ctx, T.spots.snowman); continue; }
            else {
                const up = (a.y || 0) * s0;
                ctx.save(); ctx.translate(px, py - up); ctx.scale(s * a.dir, -s); this[a.kind](ctx, a); ctx.restore();
                box = a.kind === 'deer' || a.kind === 'bear' ? [px - 1.4 * s, py - 2.5 * s, 2.8 * s, 2.6 * s] : [px - 0.8 * s, py - up - 0.9 * s, 1.6 * s, 1.0 * s];
            }
            ctx.globalAlpha = 1;
            this.restore(ctx, a.z, box[0], box[1], box[2], box[3]);
        }
        ctx.globalAlpha = 1;
    }

    // Over the smoke: sparks, songs, and whatever crosses the sky.
    drawOver(ctx) {
        const { m, cam } = this, u = cam.u;
        for (const s of this.sparks) {
            const t = s.age / s.life;
            ctx.globalAlpha = (1 - t) * (s.snow ? 0.9 : 1); ctx.fillStyle = s.snow ? '#fff' : `rgb(255,${200 - 120 * t | 0},${90 - 60 * t | 0})`;
            ctx.fillRect(s.x, s.y, (s.snow ? 2 : 1.6) * u, (s.snow ? 2 : 1.6) * u);
        }
        ctx.globalAlpha = 1;
        if (this.notes.length) {
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            for (const n of this.notes) { ctx.globalAlpha = Math.min(1, n.age * 4) * Math.max(0, 1 - n.age / 2.6); ctx.font = `${Math.round((n.ch === 'z' ? 12 : 17) * u)}px Georgia, serif`; ctx.fillStyle = n.ch === '♥' ? '#ff6a7a' : '#fff6d8'; ctx.fillText(n.ch, n.x, n.y); }
            ctx.globalAlpha = 1;
        }
        if (this.star) { const s = this.star, t = s.t, x = s.x + s.dx * t, y = s.y + s.dy * t; ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - t)})`; ctx.lineWidth = 1.6 * u; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - s.dx * 0.16, y - s.dy * 0.16); ctx.stroke(); }
        if (this.flight) {
            // A certain sleigh: eight small shapes and a larger one, across the moon when there is one.
            const f = this.flight, k = f.r / 24, x = f.x + f.dir * (f.t - 0.5) * (m.W + 500 * u), y = f.y - Math.sin(f.t * Math.PI) * 18 * u + (f.t - 0.5) * -30 * u;
            ctx.save(); ctx.translate(x, y); ctx.scale(f.dir * k, k); ctx.rotate(-0.08);
            ctx.fillStyle = ctx.strokeStyle = 'rgba(18,20,40,0.92)'; ctx.lineWidth = 1.1;
            for (let i = 0; i < 4; i++) {
                const dx = 16 + i * 13, bob = Math.sin(m.time * 9 + i) * 1.2;
                ctx.beginPath(); ctx.ellipse(dx, bob, 4.6, 1.9, 0, 0, 6.2832); ctx.fill();
                ctx.beginPath(); ctx.moveTo(dx + 3.6, bob - 1); ctx.lineTo(dx + 6.4, bob - 4.4); ctx.moveTo(dx + 6, bob - 4.6); ctx.lineTo(dx + 5, bob - 7.4); ctx.moveTo(dx + 6.4, bob - 4.6); ctx.lineTo(dx + 8, bob - 7); ctx.moveTo(dx - 3, bob + 1); ctx.lineTo(dx - 5.4, bob + 4.6); ctx.moveTo(dx + 3, bob + 1); ctx.lineTo(dx + 5.6, bob + 4.4); ctx.stroke();
            }
            ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(66, 0); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(-12, -1); ctx.quadraticCurveTo(-12, 5, -3, 5); ctx.lineTo(7, 5); ctx.quadraticCurveTo(10, 4, 10, 0); ctx.lineTo(5, 0); ctx.lineTo(4, -3); ctx.lineTo(-7, -3); ctx.closePath(); ctx.fill();
            ctx.beginPath(); ctx.arc(-2, -5.5, 2.6, 0, 6.2832); ctx.fill();
            ctx.fillStyle = 'rgba(230,40,40,0.95)'; ctx.beginPath(); ctx.arc(68.5, Math.sin(m.time * 9 + 3) * 1.2 - 3.4, 1.1, 0, 6.2832); ctx.fill();
            ctx.restore();
        }
    }

    // ---- The dabs ---------------------------------------------------------------------

    // A person, in metres, feet at the origin, facing +x. `flat`: one colour, for the ice.
    person(ctx, a, flat) {
        const c = flat ? null : (a.cols ||= { coat: this.tone(a, a.coat), legs: this.tone(a, [0.14, 0.12, 0.16]), skin: this.tone(a, [0.93, 0.74, 0.62]), hat: this.tone(a, a.hat), scarf: a.scarf ? this.tone(a, a.scarf) : null, rim: this.tone(a, a.coat.map(v => v * 0.6 + 0.4), 1.5), skirt: this.tone(a, a.coat, 0.85) });
        const col = k => flat ? 'rgba(30,34,70,1)' : c[k];
        const skate = a.kind === 'skater', down = a.down > 0, st = Math.sin(a.phase) * (skate ? 0.3 : 0.22) * (a.wait > 0 || (a.kind === 'caroller' && this.carol?.state === 'sing') ? 0 : 1), lean = skate ? 0.16 : 0.03;
        if (down) {            // sat down, suddenly
            ctx.strokeStyle = col('legs'); ctx.lineWidth = 0.15; ctx.beginPath(); ctx.moveTo(0, 0.14); ctx.lineTo(0.62, 0.1); ctx.moveTo(0, 0.14); ctx.lineTo(0.5, 0.34); ctx.stroke();
            ctx.strokeStyle = col('coat'); ctx.lineWidth = 0.44; ctx.beginPath(); ctx.moveTo(-0.06, 0.26); ctx.lineTo(-0.2, 0.74); ctx.stroke();
            ctx.fillStyle = col('skin'); ctx.beginPath(); ctx.arc(-0.24, 1.02, 0.125, 0, 6.2832); ctx.fill();
            ctx.fillStyle = col('hat'); ctx.beginPath(); ctx.ellipse(-0.25, 1.11, 0.135, 0.09, 0, 0, 6.2832); ctx.fill();
            return;
        }
        ctx.strokeStyle = col('legs'); ctx.lineWidth = 0.15;
        ctx.beginPath(); ctx.moveTo(-0.02, 0.78); ctx.lineTo(st, 0.05); ctx.moveTo(0.02, 0.78); ctx.lineTo(skate ? -0.3 - Math.max(0, st) * 0.8 : -st, skate ? 0.2 + Math.max(0, st) * 0.5 : 0.05); ctx.stroke();
        ctx.strokeStyle = col('coat'); ctx.lineWidth = 0.44;
        ctx.beginPath(); ctx.moveTo(0, 0.82); ctx.lineTo(lean, 1.26); ctx.stroke();
        if (a.skirt) { ctx.fillStyle = col('skirt'); ctx.beginPath(); ctx.moveTo(-0.17, 0.92); ctx.lineTo(0.19, 0.92); ctx.lineTo(0.36 + st * 0.3, 0.46); ctx.lineTo(-0.34 + st * 0.3, 0.46); ctx.closePath(); ctx.fill(); }
        // The lit side of the coat.
        if (!flat && Math.abs(a.L[3]) > 0.04) { ctx.strokeStyle = c.rim; ctx.lineWidth = 0.09; const sgn = Math.sign(a.L[3]) * a.dir; ctx.beginPath(); ctx.moveTo(sgn * 0.19, 0.84); ctx.lineTo(lean + sgn * 0.19, 1.28); ctx.stroke(); }
        ctx.strokeStyle = col('coat'); ctx.lineWidth = 0.13;
        const sw = skate ? 0.3 : st * 0.9, wave = a.wave > 0 ? Math.sin(a.wave * 12) * 0.15 : 0;
        ctx.beginPath(); ctx.moveTo(lean + 0.14, 1.34);
        if (a.wave > 0) ctx.lineTo(lean + 0.42 + wave, 1.78); else if (a.lantern) ctx.lineTo(lean + 0.46, 1.26); else if (a.kind === 'lighter') ctx.lineTo(lean + 0.36, 1.2 + (a.pole > 0 ? 0.3 : 0)); else ctx.lineTo(lean + 0.3 - sw, skate ? 1.14 : 0.9);
        ctx.moveTo(lean - 0.12, 1.34); ctx.lineTo(lean - 0.34 + sw, skate ? 1.05 : 0.88); ctx.stroke();
        if (a.scarf) { ctx.strokeStyle = col('scarf'); ctx.lineWidth = 0.09; ctx.beginPath(); ctx.moveTo(lean + 0.08, 1.42); ctx.quadraticCurveTo(-0.3, 1.5, -0.56 - (skate ? 0.14 : 0), 1.3 + Math.sin(a.phase * 0.7) * 0.05); ctx.stroke(); }
        ctx.fillStyle = col('skin'); ctx.beginPath(); ctx.arc(0.04 + lean * 1.4, 1.56, 0.125, 0, 6.2832); ctx.fill();
        ctx.fillStyle = col('hat'); ctx.beginPath(); ctx.ellipse(0.03 + lean * 1.4, 1.65, 0.14, 0.095, 0, 0, 6.2832); ctx.fill();
        if (flat) return;
        if (a.lantern) { ctx.strokeStyle = this.tone(a, [0.2, 0.16, 0.14]); ctx.lineWidth = 0.035; ctx.beginPath(); ctx.moveTo(lean + 0.46, 1.26); ctx.lineTo(0.52, 1.9); ctx.stroke(); ctx.fillStyle = '#ffe9a8'; ctx.fillRect(0.45, 1.4, 0.14, 0.2); }
        if (a.kind === 'lighter') {         // his pole, with a light at the end of it
            const up = a.pole > 0 ? 1 : 0, tx = 0.36 + up * 0.39, ty = 1.2 + up * 2.05 + (1 - up) * 1.1;
            ctx.strokeStyle = this.tone(a, [0.3, 0.24, 0.2]); ctx.lineWidth = 0.04; ctx.beginPath(); ctx.moveTo(lean + 0.3, 0.7); ctx.lineTo(tx, ty); ctx.stroke();
            ctx.fillStyle = '#ffd98a'; ctx.beginPath(); ctx.arc(tx, ty, 0.06, 0, 6.2832); ctx.fill();
        }
    }

    dog(ctx, a, coat) {
        const c = this.tone(a, coat), st = Math.sin(a.phase * 1.6) * 0.1;
        ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(0, 0.36, 0.36, 0.15, 0, 0, 6.2832); ctx.fill(); ctx.beginPath(); ctx.ellipse(0.4, 0.52, 0.14, 0.12, 0, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = c; ctx.lineWidth = 0.07; ctx.beginPath();
        for (const [x, k] of [[-0.26, 1], [-0.16, -1], [0.2, -1], [0.3, 1]]) { ctx.moveTo(x, 0.3); ctx.lineTo(x + st * k, 0.03); }
        ctx.moveTo(-0.34, 0.42); ctx.quadraticCurveTo(-0.52, 0.62, -0.46, 0.74 + Math.sin(a.phase * 2) * 0.04); ctx.stroke();
    }

    horseAndSleigh(ctx, a) {
        const coat = this.tone(a, a.coat), dark = this.tone(a, a.coat.map(v => v * 0.55)), t = a.phase, red = this.tone(a, [0.62, 0.12, 0.12]), wood = this.tone(a, [0.24, 0.16, 0.12]);
        // The horse, trotting.
        ctx.strokeStyle = dark; ctx.lineWidth = 0.13; ctx.beginPath();
        for (const [x, ph] of [[0.55, 0], [0.4, 3.14], [-0.5, 3.14], [-0.65, 0]]) { const sw = Math.sin(t + ph) * 0.32, lift = Math.max(0, Math.cos(t + ph)) * 0.2; ctx.moveTo(x, 1.0); ctx.lineTo(x + sw * 0.5, 0.52 + lift * 0.4); ctx.lineTo(x + sw, 0.04 + lift); }
        ctx.stroke();
        ctx.fillStyle = coat; ctx.beginPath(); ctx.ellipse(0, 1.2, 0.82, 0.36, 0, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = coat; ctx.lineWidth = 0.34; ctx.beginPath(); ctx.moveTo(0.62, 1.34); ctx.lineTo(1.02, 1.86); ctx.stroke();
        ctx.lineWidth = 0.24; ctx.beginPath(); ctx.moveTo(1.0, 1.9); ctx.lineTo(1.36, 1.7); ctx.stroke();
        ctx.strokeStyle = dark; ctx.lineWidth = 0.1; ctx.beginPath(); ctx.moveTo(0.7, 1.6); ctx.lineTo(0.96, 1.96); ctx.moveTo(-0.8, 1.3); ctx.quadraticCurveTo(-1.1, 1.2, -1.06, 0.7 + Math.sin(t) * 0.06); ctx.moveTo(0.98, 2.04); ctx.lineTo(1.02, 2.14); ctx.stroke();
        // Harness and bells, the shafts, the sleigh.
        ctx.strokeStyle = red; ctx.lineWidth = 0.06; ctx.beginPath(); ctx.moveTo(0.5, 0.92); ctx.lineTo(0.56, 1.52); ctx.moveTo(-0.1, 0.86); ctx.lineTo(-0.1, 1.54); ctx.stroke();
        ctx.strokeStyle = wood; ctx.lineWidth = 0.05; ctx.beginPath(); ctx.moveTo(0.5, 1.1); ctx.lineTo(-1.5, 0.74); ctx.stroke();
        ctx.lineWidth = 0.07; ctx.beginPath(); ctx.moveTo(-1.2, 0.4); ctx.quadraticCurveTo(-1.0, 0.04, -1.5, 0.05); ctx.lineTo(-3.5, 0.05); ctx.moveTo(-1.9, 0.05); ctx.lineTo(-1.9, 0.42); ctx.moveTo(-3.1, 0.05); ctx.lineTo(-3.1, 0.42); ctx.stroke();
        ctx.fillStyle = red; ctx.beginPath(); ctx.moveTo(-1.4, 0.42); ctx.quadraticCurveTo(-1.3, 1.1, -1.75, 1.14); ctx.lineTo(-2.0, 0.8); ctx.lineTo(-3.0, 0.8); ctx.quadraticCurveTo(-3.3, 1.5, -3.75, 1.36); ctx.lineTo(-3.5, 0.42); ctx.closePath(); ctx.fill();
        // Two riders, well wrapped up.
        for (const [x, coatC, hat] of [[-2.25, [0.2, 0.26, 0.42], [0.5, 0.14, 0.14]], [-2.8, [0.46, 0.2, 0.34], [0.86, 0.8, 0.66]]]) {
            ctx.strokeStyle = this.tone(a, coatC); ctx.lineWidth = 0.44; ctx.beginPath(); ctx.moveTo(x, 0.86); ctx.lineTo(x + 0.03, 1.3); ctx.stroke();
            ctx.fillStyle = this.tone(a, [0.93, 0.74, 0.62]); ctx.beginPath(); ctx.arc(x + 0.06, 1.6, 0.125, 0, 6.2832); ctx.fill();
            ctx.fillStyle = this.tone(a, hat); ctx.beginPath(); ctx.ellipse(x + 0.05, 1.69, 0.14, 0.095, 0, 0, 6.2832); ctx.fill();
        }
        ctx.fillStyle = '#ffe9a8'; ctx.fillRect(-2.3, 1.16, 0.12, 0.18);
    }

    // A box on the track: from f0 to f1 metres along the way car `a` is
    // going, w each side of it, y0 to y1 up, in colour c. We see its top,
    // the side toward us and the end toward us. Returns how to place
    // something on it: P(along, across, up), and which side is ours.
    box(ctx, a, f0, f1, w, y0, y1, c, top = 1.25) {
        const cam = this.cam, zm = cam.zm, fx = -Math.sin(a.a), fd = Math.cos(a.a), nx = Math.cos(a.a), nd = Math.sin(a.a);        // forward and outward, each across and away
        const P = (f, n, y) => { const z = a.z + (fd * f + nd * n) / zm; return [cam.sx(a.x + fx * f + nx * n, z), cam.sy(z) - y * cam.sc(z)]; };
        const quad = (pts, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.fill(); };
        const sn = nd > 0 ? -w : w, ef = fd > 0 ? f0 : f1;
        if (c) {
            quad([P(ef, -w, y0), P(ef, w, y0), P(ef, w, y1), P(ef, -w, y1)], this.paint(a, c, 0.74));
            quad([P(f0, sn, y0), P(f1, sn, y0), P(f1, sn, y1), P(f0, sn, y1)], this.paint(a, c, 1));
            quad([P(f0, -w, y1), P(f1, -w, y1), P(f1, w, y1), P(f0, w, y1)], this.paint(a, c, top));
        }
        return { P, quad, sn: Math.sign(sn), across: Math.abs(fx) };
    }
    // The train's paint in the light on it: one of its fixed colours (one of TRAIN_PAINT, by name), k times as bright. Kept until that light is next worked out.
    paint(a, c, k) { const t = (this.trainTints ||= {}), key = c + k; return t[key] ||= this.tone(a, PaintedCast.TRAIN_PAINT[c], k); }
    // One car of the toy train: an engine with its boiler, cab, stack and
    // lamp; a tender of coal; a boxcar; a truck of parcels; a caboose.
    car(ctx, a) {
        const L = a.car.len / 2, kind = a.car.kind, s = this.cam.sc(a.z), dark = this.m.light.dark;
        const BLACK = 'black', GREEN = 'green', RED = 'red', SNOWY = 'snowy', lit = '#ffe9a8';
        const B = this.box(ctx, a, -L, L, 0.42, 0.12, 0.36, BLACK), { P, quad, sn } = B;
        const wheels = (list, r, c) => { ctx.fillStyle = this.paint(a, c, 1); for (const f of list) { const p = P(f, sn * 0.44, r); ctx.beginPath(); ctx.ellipse(p[0], p[1], Math.max(0.6, r * s * Math.max(0.3, B.across)), r * s, 0, 0, 6.2832); ctx.fill(); } };
        const pane = (f0, f1, y0, y1, w, col = lit) => quad([P(f0, sn * w, y0), P(f1, sn * w, y0), P(f1, sn * w, y1), P(f0, sn * w, y1)], col);
        if (kind === 'engine') {
            this.box(ctx, a, -L + 0.9, L - 0.1, 0.34, 0.36, 1.02, GREEN, 1.5);                 // the boiler
            pane(-L + 1.5, -L + 1.62, 0.36, 1.02, 0.345, this.paint(a, 'brass', 1));      // a brass band round it
            this.box(ctx, a, L - 1.25, L - 1.0, 0.11, 1.02, 1.26, 'brass', 1.3);    // the dome
            this.box(ctx, a, L - 0.62, L - 0.38, 0.11, 1.02, 1.52, BLACK);                      // the stack, and its lip
            this.box(ctx, a, L - 0.68, L - 0.32, 0.16, 1.52, 1.64, BLACK, 1.6);
            this.box(ctx, a, -L, -L + 0.95, 0.45, 0.36, 1.4, RED);                             // the cab, a light in it, its roof
            pane(-L + 0.2, -L + 0.72, 0.86, 1.24, 0.455);
            this.box(ctx, a, -L - 0.08, -L + 1.04, 0.52, 1.4, 1.5, SNOWY, 1.5);
            this.box(ctx, a, L, L + 0.3, 0.36, 0.08, 0.3, RED, 1.1);                            // the pilot, to push the snow aside
            wheels([-L + 0.5, -L + 1.3, L - 0.8], 0.24, 'wheel'); wheels([L - 0.25], 0.15, 'wheel');
            const lamp = P(L - 0.06, 0, 0.92);
            ctx.fillStyle = lit; ctx.beginPath(); ctx.arc(lamp[0], lamp[1], Math.max(1, 0.11 * s), 0, 6.2832); ctx.fill();
            if (dark > 0.12) this.glow(ctx, lamp[0], lamp[1], 0.9 * s, [1, 0.82, 0.5], 0.7 * dark);
        } else if (kind === 'tender') {
            this.box(ctx, a, -L + 0.04, L - 0.04, 0.42, 0.36, 0.95, GREEN, 0.5);
            this.box(ctx, a, -L + 0.2, L - 0.2, 0.3, 0.95, 1.04, 'coal', 1);        // coal
            wheels([-L + 0.45, L - 0.45], 0.17, BLACK);
        } else if (kind === 'box') {
            this.box(ctx, a, -L + 0.04, L - 0.04, 0.44, 0.36, 1.28, 'boxcar');
            pane(-0.34, 0.34, 0.42, 1.2, 0.445, this.paint(a, 'boxcar', 0.76));                // its door
            this.box(ctx, a, -L, L, 0.48, 1.28, 1.36, SNOWY, 1.5);
            wheels([-L + 0.45, L - 0.45], 0.17, BLACK);
        } else if (kind === 'gifts') {
            this.box(ctx, a, -L + 0.04, L - 0.04, 0.44, 0.36, 0.72, 'truck', 0.6);
            [[-0.66, 0.4, 'red'], [-0.1, 0.56, 'brass'], [0.5, 0.36, 'parcel']].forEach(([f, h, c]) => this.box(ctx, a, f - 0.22, f + 0.22, 0.26, 0.72, 0.72 + h, c, 1.3));
            wheels([-L + 0.45, L - 0.45], 0.17, BLACK);
        } else {
            this.box(ctx, a, -L + 0.04, L - 0.04, 0.44, 0.36, 1.24, RED);
            pane(-0.72, -0.34, 0.74, 1.06, 0.445); pane(0.34, 0.72, 0.74, 1.06, 0.445);
            this.box(ctx, a, -L, L, 0.48, 1.24, 1.32, SNOWY, 1.5);
            this.box(ctx, a, -0.34, 0.34, 0.3, 1.32, 1.58, RED); this.box(ctx, a, -0.4, 0.4, 0.36, 1.58, 1.65, SNOWY, 1.5);        // the lookout on top
            wheels([-L + 0.45, L - 0.45], 0.17, BLACK);
            const tail = P(-L, 0, 0.8);
            if (dark > 0.12) this.glow(ctx, tail[0], tail[1], 0.5 * s, [1, 0.2, 0.14], 0.7 * dark);
        }
    }

    // The mill wheel, turning: rim, spokes, paddles, and the water coming off it. Returns the box it is drawn in.
    wheel(ctx, M, a) {
        const cam = this.cam, s = cam.sc(M.z), cx = cam.sx(M.x, M.z), cy = cam.sy(M.z) - M.y * s, R = M.r * s, rot = this.m.time * 0.3;
        const wood = this.tone(a, [0.58, 0.44, 0.32]), deep = this.tone(a, [0.24, 0.18, 0.15]);
        ctx.lineCap = 'butt';
        ctx.strokeStyle = deep; ctx.lineWidth = Math.max(1.6, 0.4 * s); ctx.beginPath(); ctx.arc(cx, cy, R * 0.9, 0, 6.2832); ctx.stroke();
        ctx.strokeStyle = wood; ctx.lineWidth = Math.max(1, 0.16 * s); ctx.beginPath(); ctx.arc(cx, cy, R * 0.9, 0, 6.2832);
        for (let i = 0; i < 8; i++) { const an = rot + i * 0.7854; ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(an) * R * 0.88, cy + Math.sin(an) * R * 0.88); }
        ctx.stroke();
        ctx.strokeStyle = deep; ctx.lineWidth = Math.max(1, 0.12 * s); ctx.beginPath();
        for (let i = 0; i < 16; i++) { const an = rot + i * 0.3927; ctx.moveTo(cx + Math.cos(an) * R * 0.76, cy + Math.sin(an) * R * 0.76); ctx.lineTo(cx + Math.cos(an) * R * 1.04, cy + Math.sin(an) * R * 1.04); }
        ctx.stroke();
        ctx.fillStyle = deep; ctx.beginPath(); ctx.arc(cx, cy, R * 0.14, 0, 6.2832); ctx.fill();
        // Water off the wheel on the side going down.
        ctx.strokeStyle = this.tone(a, [0.78, 0.86, 1], 0.9); ctx.lineWidth = Math.max(0.8, 0.06 * s); ctx.globalAlpha = 0.6; ctx.beginPath();
        for (let i = 0; i < 5; i++) { const k = (this.m.time * 1.2 + i * 0.2) % 1, x = cx + R * (0.62 + 0.09 * i); ctx.moveTo(x, cy + R * (0.2 + 0.8 * k)); ctx.lineTo(x, cy + R * (0.34 + 0.8 * k)); }
        ctx.stroke(); ctx.globalAlpha = 1;
        ctx.lineCap = 'round';
        return [cx - R * 1.15, cy - R * 1.15, R * 2.3, R * 2.4];
    }

    // A cat, in its own coat: curled up asleep, sitting, or off somewhere with its tail up.
    cat(ctx, a) {
        const coat = a.coat || PaintedCast.CATS[0], c = this.tint(a, 'c', coat.c), d = this.tint(a, 'd', coat.d), w = coat.w ? this.tint(a, 'w', coat.w) : null, breathe = Math.sin(this.m.time * 1.4) * 0.012;
        if (a.state === 'walk') {
            const st = Math.sin(a.phase * 1.5) * 0.09;
            ctx.strokeStyle = d; ctx.lineWidth = 0.055; ctx.beginPath();
            for (const [x, k] of [[0.2, 1], [0.13, -1], [-0.16, -1], [-0.23, 1]]) { ctx.moveTo(x, 0.2); ctx.lineTo(x + st * k, 0.02); }
            ctx.moveTo(-0.26, 0.26); ctx.quadraticCurveTo(-0.42, 0.32, -0.36, 0.58 + Math.sin(a.phase * 0.7) * 0.03); ctx.stroke();
            ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(0, 0.25, 0.28, 0.1, 0, 0, 6.2832); ctx.fill(); ctx.beginPath(); ctx.arc(0.3, 0.36, 0.095, 0, 6.2832); ctx.fill();
            ctx.beginPath(); ctx.moveTo(0.22, 0.42); ctx.lineTo(0.24, 0.53); ctx.lineTo(0.3, 0.44); ctx.lineTo(0.36, 0.53); ctx.lineTo(0.38, 0.42); ctx.fill();
            if (w) { ctx.fillStyle = w; ctx.beginPath(); ctx.ellipse(0.2, 0.2, 0.08, 0.05, 0, 0, 6.2832); ctx.fill(); }
            return;
        }
        ctx.fillStyle = c;
        if (a.state === 'sleep') { ctx.beginPath(); ctx.ellipse(0, 0.14 + breathe, 0.3, 0.14 + breathe, 0, 0, 6.2832); ctx.fill(); ctx.beginPath(); ctx.arc(0.24, 0.16, 0.1, 0, 6.2832); ctx.fill(); ctx.fillStyle = 'rgba(244,246,255,0.85)'; ctx.beginPath(); ctx.ellipse(-0.02, 0.27, 0.2, 0.035, 0, 0, 6.2832); ctx.fill(); }
        else {
            ctx.beginPath(); ctx.ellipse(0, 0.2, 0.17, 0.2, 0, 0, 6.2832); ctx.fill(); ctx.beginPath(); ctx.arc(0.06, 0.46, 0.1, 0, 6.2832); ctx.fill(); ctx.beginPath(); ctx.moveTo(-0.02, 0.52); ctx.lineTo(0, 0.64); ctx.lineTo(0.06, 0.54); ctx.lineTo(0.12, 0.64); ctx.lineTo(0.15, 0.52); ctx.fill();
            if (w) { ctx.fillStyle = w; ctx.beginPath(); ctx.ellipse(0.07, 0.24, 0.07, 0.11, 0, 0, 6.2832); ctx.fill(); }
        }
        ctx.strokeStyle = d; ctx.lineWidth = 0.05; ctx.beginPath(); ctx.moveTo(-0.24, 0.08); ctx.quadraticCurveTo(-0.44, 0.06, -0.4, 0.22 + Math.sin(this.m.time * 2) * 0.04); ctx.stroke();
    }
    // A squirrel: sat up with its tail along its back, or stretched out and running.
    squirrel(ctx, a) {
        const c = this.tint(a, 'c', a.coat), t = this.tint(a, 't', a.coat, 1.3), sit = a.state === 'sit', flick = Math.sin(this.m.time * 6 + a.post) > 0.86 ? 0.04 : 0;
        ctx.strokeStyle = t; ctx.lineWidth = 0.085; ctx.beginPath();
        if (sit) { ctx.moveTo(-0.07, 0.03); ctx.bezierCurveTo(-0.3, 0.04, -0.27, 0.32 + flick, -0.1, 0.36 + flick); }
        else { ctx.moveTo(-0.1, 0.07); ctx.bezierCurveTo(-0.22, 0.14, -0.3, 0.2, -0.38, 0.1); }
        ctx.stroke();
        ctx.fillStyle = c;
        if (sit) { ctx.beginPath(); ctx.ellipse(0, 0.1, 0.075, 0.1, 0, 0, 6.2832); ctx.fill(); ctx.beginPath(); ctx.arc(0.04, 0.23, 0.055, 0, 6.2832); ctx.fill(); ctx.beginPath(); ctx.moveTo(0, 0.26); ctx.lineTo(0.01, 0.33); ctx.lineTo(0.05, 0.27); ctx.fill(); }
        else { ctx.beginPath(); ctx.ellipse(0, 0.07, 0.125, 0.06, 0, 0, 6.2832); ctx.fill(); ctx.beginPath(); ctx.arc(0.13, 0.1, 0.05, 0, 6.2832); ctx.fill(); }
        ctx.fillStyle = this.tint(a, 'w', PaintedCast.WHITE); ctx.beginPath(); ctx.ellipse(sit ? 0.04 : 0.02, sit ? 0.1 : 0.04, sit ? 0.035 : 0.07, sit ? 0.06 : 0.02, 0, 0, 6.2832); ctx.fill();
    }
    // A bear: ambling, nose down, or reared up to have a look. A cub is the same, smaller.
    bear(ctx, a) {
        const c = this.tint(a, 'c', PaintedCast.BEAR), d = this.tint(a, 'd', PaintedCast.BEAR, 0.64), muz = this.tint(a, 'm', PaintedCast.BEAR, 2), up = a.up || 0, st = a.moving ? Math.sin(a.phase) * 0.2 : 0, nose = (a.sniff || 0) * 0.42;
        if (up > 0.5) {
            ctx.strokeStyle = d; ctx.lineWidth = 0.28; ctx.beginPath(); ctx.moveTo(-0.16, 0.56); ctx.lineTo(-0.2, 0.1); ctx.moveTo(0.16, 0.56); ctx.lineTo(0.18, 0.1); ctx.stroke();
            ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(0, 1.1, 0.46, 0.7, 0, 0, 6.2832); ctx.fill();
            ctx.strokeStyle = c; ctx.lineWidth = 0.2; ctx.beginPath(); ctx.moveTo(0.28, 1.46); ctx.lineTo(0.56, 1.14); ctx.moveTo(-0.26, 1.46); ctx.lineTo(-0.44, 1.12); ctx.stroke();
            ctx.beginPath(); ctx.arc(0.08, 1.92, 0.28, 0, 6.2832); ctx.fill(); ctx.beginPath(); ctx.arc(-0.12, 2.16, 0.09, 0, 6.2832); ctx.arc(0.24, 2.16, 0.09, 0, 6.2832); ctx.fill();
            ctx.fillStyle = muz; ctx.beginPath(); ctx.ellipse(0.28, 1.86, 0.14, 0.1, 0, 0, 6.2832); ctx.fill();
            return;
        }
        ctx.strokeStyle = d; ctx.lineWidth = 0.26; ctx.beginPath();
        for (const [x, k] of [[0.52, 1], [0.34, -1], [-0.4, -1], [-0.58, 1]]) { ctx.moveTo(x, 0.66); ctx.lineTo(x + st * k, 0.1); }
        ctx.stroke();
        ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(-0.04, 0.82, 0.82, 0.44, 0, 0, 6.2832); ctx.fill(); ctx.beginPath(); ctx.ellipse(0.4, 0.98, 0.4, 0.36, 0, 0, 6.2832); ctx.fill();
        const hx = 0.92, hy = 0.84 - nose;
        ctx.beginPath(); ctx.arc(hx, hy, 0.27, 0, 6.2832); ctx.fill(); ctx.beginPath(); ctx.arc(hx - 0.14, hy + 0.25, 0.09, 0, 6.2832); ctx.arc(hx + 0.1, hy + 0.27, 0.09, 0, 6.2832); ctx.fill();
        ctx.fillStyle = muz; ctx.beginPath(); ctx.ellipse(hx + 0.24, hy - 0.06, 0.15, 0.1, 0, 0, 6.2832); ctx.fill();
        ctx.fillStyle = d; ctx.beginPath(); ctx.arc(hx + 0.36, hy - 0.04, 0.04, 0, 6.2832); ctx.fill();
    }
    cardinal(ctx, a) {
        const red = this.tone(a, [0.84, 0.1, 0.1]), y = Math.sin(a.hop * Math.PI) * 0.08;
        ctx.fillStyle = red; ctx.beginPath(); ctx.ellipse(0, 0.09 + y, 0.11, 0.075, 0.2, 0, 6.2832); ctx.fill();
        ctx.beginPath(); ctx.arc(0.09, 0.16 + y, 0.055, 0, 6.2832); ctx.fill(); ctx.beginPath(); ctx.moveTo(0.05, 0.19 + y); ctx.lineTo(0.06, 0.28 + y); ctx.lineTo(0.12, 0.2 + y); ctx.fill();
        ctx.strokeStyle = red; ctx.lineWidth = 0.04; ctx.beginPath(); ctx.moveTo(-0.08, 0.08 + y); ctx.lineTo(-0.24, a.state === 'fly' ? 0.1 + y : 0.02 + y); ctx.stroke();
        if (a.state === 'fly') { ctx.lineWidth = 0.05; const f = Math.sin(this.m.time * 26) * 0.14; ctx.beginPath(); ctx.moveTo(-0.02, 0.12); ctx.lineTo(-0.08, 0.14 + f + 0.1); ctx.stroke(); }
        ctx.fillStyle = '#16141a'; ctx.beginPath(); ctx.arc(0.12, 0.15 + y, 0.02, 0, 6.2832); ctx.fill();
        ctx.fillStyle = this.tone(a, [0.95, 0.6, 0.2]); ctx.fillRect(0.14, 0.14 + y, 0.05, 0.025);
    }
    rabbit(ctx, a) {
        const c = this.tone(a, [0.78, 0.74, 0.72]), up = Math.min(1, a.up), hop = a.state === 'hop' ? Math.abs(Math.sin(a.t * 12.5)) * 0.14 : 0;
        ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(0, 0.14 + up * 0.08 + hop, 0.2 - up * 0.05, 0.14 + up * 0.08, 0, 0, 6.2832); ctx.fill();
        ctx.beginPath(); ctx.arc(0.14 - up * 0.06, 0.28 + up * 0.2 + hop, 0.08, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = c; ctx.lineWidth = 0.045; ctx.beginPath(); ctx.moveTo(0.12 - up * 0.06, 0.34 + up * 0.2 + hop); ctx.lineTo(0.08 - up * 0.04, 0.52 + up * 0.24 + hop); ctx.moveTo(0.16 - up * 0.06, 0.34 + up * 0.2 + hop); ctx.lineTo(0.17 - up * 0.04, 0.52 + up * 0.24 + hop); ctx.stroke();
        ctx.fillStyle = 'rgba(250,250,255,0.9)'; ctx.beginPath(); ctx.arc(-0.2, 0.14 + hop, 0.05, 0, 6.2832); ctx.fill();
    }
    deer(ctx, a) {
        const k = a.small ? 0.72 : 1, c = this.tint(a, 'c', PaintedCast.DEER), d = this.tint(a, 'd', PaintedCast.DEER, 0.62), down = a.head || 0, st = a.state === 'go' || a.state === 'flee' || a.state === 'back' ? Math.sin(a.phase || 0) * 0.3 : 0;
        ctx.save(); ctx.scale(k, k);
        // Slender legs with a knee in them, a body deep in the chest, a neck that comes down to graze.
        ctx.strokeStyle = d; ctx.lineWidth = 0.07; ctx.beginPath();
        for (const [x, s] of [[0.42, 1], [0.32, -1], [-0.4, -1], [-0.5, 1]]) { ctx.moveTo(x, 0.9); ctx.lineTo(x + st * s * 0.35 - 0.04 * Math.sign(x), 0.46); ctx.lineTo(x + st * s, 0.03); }
        ctx.stroke();
        ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(-0.08, 1.04, 0.56, 0.29, -0.06, 0, 6.2832); ctx.fill(); ctx.beginPath(); ctx.ellipse(0.3, 1.1, 0.3, 0.34, 0, 0, 6.2832); ctx.fill();
        const hx = 0.88 + down * 0.1, hy = 1.72 - down * 1.4;
        ctx.strokeStyle = c; ctx.lineWidth = 0.22; ctx.beginPath(); ctx.moveTo(0.46, 1.2); ctx.lineTo(hx - 0.1, hy - 0.08); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(hx + 0.06, hy, 0.17, 0.1, -0.3 - down * 0.5, 0, 6.2832); ctx.fill();
        ctx.beginPath(); ctx.ellipse(hx - 0.1, hy + 0.15, 0.05, 0.12, 0.5, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = d; ctx.lineWidth = 0.035;
        if (!a.small) { ctx.beginPath(); ctx.moveTo(hx, hy + 0.08); ctx.lineTo(hx - 0.06, hy + 0.42); ctx.moveTo(hx - 0.03, hy + 0.24); ctx.lineTo(hx + 0.12, hy + 0.4); ctx.moveTo(hx - 0.05, hy + 0.32); ctx.lineTo(hx - 0.18, hy + 0.46); ctx.stroke(); }
        ctx.fillStyle = this.tint(a, 'w', PaintedCast.WHITE); ctx.beginPath(); ctx.ellipse(-0.62, 1.1, 0.08, 0.12, 0, 0, 6.2832); ctx.fill();
        ctx.restore();
    }
    fox(ctx, a) {
        const c = this.tone(a, [0.80, 0.40, 0.16]), d = this.tone(a, [0.2, 0.16, 0.16]), st = a.wait > 0 ? 0 : Math.sin(a.phase) * 0.16, sniff = a.wait > 0 ? 0.16 : 0;
        ctx.strokeStyle = d; ctx.lineWidth = 0.06; ctx.beginPath();
        for (const [x, s] of [[0.26, 1], [0.18, -1], [-0.22, -1], [-0.3, 1]]) { ctx.moveTo(x, 0.3); ctx.lineTo(x + st * s, 0.03); }
        ctx.stroke();
        ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(0, 0.36, 0.36, 0.13, 0, 0, 6.2832); ctx.fill();
        ctx.beginPath(); ctx.moveTo(0.3, 0.44 - sniff); ctx.lineTo(0.58, 0.4 - sniff * 1.6); ctx.lineTo(0.36, 0.56 - sniff); ctx.lineTo(0.34, 0.68 - sniff); ctx.lineTo(0.28, 0.56 - sniff); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = c; ctx.lineWidth = 0.15; ctx.beginPath(); ctx.moveTo(-0.34, 0.38); ctx.quadraticCurveTo(-0.6, 0.46, -0.74, 0.3); ctx.stroke();
        ctx.strokeStyle = 'rgba(250,250,255,0.95)'; ctx.lineWidth = 0.12; ctx.beginPath(); ctx.moveTo(-0.72, 0.31); ctx.lineTo(-0.8, 0.26); ctx.stroke();
    }

    // Flames, and their light going up and down on the snow.
    fire(ctx, F) {
        const lv = F.group.level, m = this.m;
        if (lv < 0.03) return;
        const t = m.time, s = F.s, flick = 0.55 + 0.25 * Math.sin(t * 11) + 0.2 * Math.sin(t * 23 + 1);
        this.pool(ctx, F.x, F.z, 9, [1, 0.5, 0.16], 0.5 * flick * lv);
        ctx.globalCompositeOperation = 'lighter';
        // Tongues of flame: a broad orange one behind, narrower yellow ones in front, each a leaf that leans with the wind.
        for (let i = 0; i < 7; i++) {
            const k = (i % 4) / 3 - 0.5, inner = i >= 4, h = (0.62 + 0.34 * Math.sin(t * (7 + i * 1.7) + i * 2)) * s * lv * (inner ? 0.62 : 1), w = (inner ? 0.09 : 0.17) * s;
            const x = F.fx + k * (inner ? 0.3 : 0.52) * s, base = F.fy - 0.12 * s, tip = x + (Math.sin(t * 9 + i) * 0.1 + m.wind * 0.2) * s;
            ctx.fillStyle = inner ? 'rgba(255,232,130,0.6)' : 'rgba(255,128,36,0.42)';
            ctx.beginPath(); ctx.moveTo(x - w, base); ctx.quadraticCurveTo(x - w * 1.5, base - h * 0.45, tip, base - h); ctx.quadraticCurveTo(x + w * 1.5, base - h * 0.45, x + w, base); ctx.quadraticCurveTo(x, base + w * 0.9, x - w, base); ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
        this.glow(ctx, F.fx, F.fy - 0.4 * s, 1.5 * s, [1, 0.6, 0.24], 0.5 * flick * lv);
    }

    // The snowman's face, which turns.
    face(ctx, S) {
        const s = S.s, x = S.fx + this.look * 0.1 * s, y = S.fy - 1.6 * s;
        ctx.fillStyle = '#16141a';
        for (const dx of [-0.09, 0.09]) { ctx.beginPath(); ctx.arc(x + dx * s * (1 - Math.abs(this.look) * 0.3), y, 0.032 * s, 0, 6.2832); ctx.fill(); }
        ctx.fillStyle = '#f08226'; ctx.beginPath(); ctx.moveTo(x, y - 0.03 * s); ctx.lineTo(x + (this.look * 0.26 + (Math.abs(this.look) < 0.1 ? 0.03 : 0)) * s, y + 0.07 * s); ctx.lineTo(x, y + 0.09 * s); ctx.fill();
        ctx.strokeStyle = '#c62424'; ctx.lineWidth = 0.1 * s; ctx.beginPath(); ctx.moveTo(S.fx - 0.24 * s, S.fy - 1.34 * s); ctx.lineTo(S.fx + 0.24 * s, S.fy - 1.34 * s); ctx.lineTo(S.fx + 0.34 * s, S.fy - 1.02 * s); ctx.stroke();
    }
}
PaintedCast.COATS = [[0.56, 0.16, 0.16], [0.20, 0.26, 0.46], [0.20, 0.36, 0.30], [0.48, 0.2, 0.36], [0.34, 0.22, 0.16], [0.70, 0.52, 0.2], [0.22, 0.22, 0.26], [0.62, 0.3, 0.14]];
PaintedCast.HATS = [[0.16, 0.2, 0.36], [0.66, 0.14, 0.12], [0.2, 0.42, 0.34], [0.84, 0.78, 0.64], [0.14, 0.14, 0.16], [0.8, 0.5, 0.16]];
PaintedCast.SCARVES = [[0.95, 0.86, 0.5], [0.8, 0.2, 0.2], [0.2, 0.42, 0.3], [0.9, 0.9, 0.94], [0.3, 0.4, 0.74]];
PaintedCast.WHITE = [0.93, 0.92, 0.9]; PaintedCast.BEAR = [0.27, 0.19, 0.15]; PaintedCast.DEER = [0.47, 0.37, 0.29];
// Cats' coats (c), their darker markings and tails (d), and a white bib for some (w). The first is the store's.
PaintedCast.CATS = [{ c: [0.52, 0.46, 0.42], d: [0.3, 0.26, 0.26] }, { c: [0.84, 0.50, 0.20], d: [0.62, 0.32, 0.12] }, { c: [0.13, 0.12, 0.14], d: [0.08, 0.08, 0.1], w: [0.93, 0.93, 0.9] },
    { c: [0.76, 0.64, 0.48], d: [0.34, 0.25, 0.2] }, { c: [0.36, 0.30, 0.28], d: [0.2, 0.16, 0.16], w: [0.9, 0.88, 0.84] }, { c: [0.90, 0.89, 0.86], d: [0.60, 0.58, 0.56] }];
// The toy train, front to back, each so many metres long.
PaintedCast.TRAIN_PAINT = { black: [0.13, 0.13, 0.16], green: [0.12, 0.34, 0.25], red: [0.64, 0.13, 0.12], snowy: [0.56, 0.58, 0.66], brass: [0.84, 0.66, 0.24], wheel: [0.5, 0.1, 0.1], coal: [0.07, 0.07, 0.08], boxcar: [0.58, 0.25, 0.15], truck: [0.16, 0.32, 0.58], parcel: [0.2, 0.5, 0.3] };
PaintedCast.TRAIN = [{ kind: 'engine', len: 2.9 }, { kind: 'tender', len: 1.7 }, { kind: 'box', len: 2.3 }, { kind: 'gifts', len: 2.3 }, { kind: 'caboose', len: 2.2 }];
