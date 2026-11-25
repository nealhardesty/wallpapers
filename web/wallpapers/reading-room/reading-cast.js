// The Reading Room's cast: whoever moves in the hall (SPEC §10.44).
//   - the library cats, each with a name, a coat and a habit: asleep in the
//     sun and moving with it as the day goes on; on a gallery rail with a
//     book she means to push off (it falls, it lies there, it floats back up
//     to her, she pushes it off again); riding a rolling ladder that rolls
//     by itself; a kitten after a pen on a table; curled by a lamp for its
//     warmth; walking the top rail; by the fire; on the librarian's desk
//     with the bell; and wanderers
//   - students at the tables: reading, turning pages, writing, dozing (and
//     the z's), coming and going by the aisles; fewer at night. Whoever
//     walks walks as people do (ReadingLogic.walk and .gait): feet planted
//     where they land, a step's length times its pace the speed, the body
//     riding up over each step and the arms swinging against the legs,
//     turning by the way they face, speeding up and slowing down, keeping
//     right of whoever comes the other way and never walking through anyone
//   - readers up on the galleries, browsing the shelves
//   - the librarian: at her desk by day, down the hall at dusk lighting each
//     table's lamps as she passes, round the hall at night with a lantern
//   - an owl on a chandelier, who turns her head, hoots the hour, and now
//     and then goes round under the vault
//   - paper planes from the top gallery; books that fly home to their
//     shelves by themselves; a mouse from the card catalogue (and the cat
//     after it); the fire's flames; the clock striking
// Everyone is drawn in metres at their place in the hall, lit as the
// painting is (Painting.lightAt), golden if they are in a patch of sun,
// and put back behind whatever stands nearer (the bands' masks).

class ReadingCast {
    constructor(m) {
        this.m = m;
        this.T = m.scene; this.L = m.L; this.cam = m.cam;
        this.cats = []; this.students = []; this.browsers = []; this.planes = []; this.books = []; this.notes = []; this.puffs = []; this.sparkles = [];
        this.librarian = null; this.owl = null; this.mouseA = null; this.birdA = null;
        this.chime = 0; this.strikesLeft = 0; this.jingle = 0; this.lastHour = null;
        this.random = WP.seededRandom(m.host.params?.seed ? 4321 : Math.floor(Math.random() * 1e9));
        this.scratch = PaintedPlates.canvas(8, 8); this.sc = this.scratch.getContext('2d');
        this.cells = this.T.masks.map(mask => {
            if (!mask) return null;
            const c = PaintedPlates.canvas(48, 27).getContext('2d', { willReadFrequently: true });
            c.drawImage(mask, 0, 0, 48, 27);
            const d = c.getImageData(0, 0, 48, 27).data, out = new Uint8Array(48 * 27);
            for (let i = 0; i < out.length; i++) out[i] = d[i * 4 + 3] > 8 ? 1 : 0;
            return out;
        });
        this.build();
        this.settle();
        for (let i = 0; i < 30; i++) this.populate(2, true);
        // And a few already on their way in, so that someone is walking on frame one.
        for (let i = 0; i < 3 && this.wanted() > 0 && this.students.length < this.wanted() + 2; i++) { this.addStudent(false); for (let j = 0; j < 40 + i * 45; j++) this.updateStudents(0.1); }
        this.lastHour = Math.floor(m.hour);
    }

    rr(a, b) { return a + (b - a) * this.random(); }
    pick(a) { return a[Math.floor(this.random() * a.length)]; }
    get cfg() { return this.m.config; }

    // ---- Who is here ---------------------------------------------------------------

    build() {
        const R = ReadingLogic.ROOM, L = this.L, cfg = this.cfg, n = Math.max(0, Math.min(12, Math.round(cfg.cats ?? 6)));
        this.cats = [];
        for (let i = 0; i < n; i++) {
            const role = ReadingLogic.ROLES[i], coat = ReadingCast.COATS[i % ReadingCast.COATS.length], name = ReadingCast.NAMES[i % ReadingCast.NAMES.length];
            const c = { kind: 'cat', i, role, coat, name, k: (role === 'kitten' ? 0.62 : 1) * (cfg.catSize || 1.3), x: 0, y: 0, z: 10, hx: 0, hz: 10, dir: i % 2 ? 1 : -1, state: 'sit', pose: 'sit', t: this.rr(2, 10), phase: this.rr(0, 6), L: [1, 1, 1, 0], lt: 0 };
            const side = i % 2 ? 1 : -1;
            if (role === 'shelf') { const k = 2 + (i % 3); Object.assign(c, { side, perch: 'rail', x: side * (R.g1x + 0.08), y: R.g1 + 0.2 + R.rail, z: ReadingLogic.bayZ(k) - 1.5, state: 'sit', pose: 'sit', dir: -side, book: { state: 'rail', t: this.rr(20, 60) } }); }
            else if (role === 'ladder') { const lad = { side: 1, z: ReadingLogic.bayZ(3), v: 0, to: ReadingLogic.bayZ(3), t: this.rr(10, 30) }; this.ladder = lad; Object.assign(c, { perch: 'ladder', state: 'sit', pose: 'sit', dir: -1 }); }
            else if (role === 'rail') { const k = 1 + (i % 4), s = -side; Object.assign(c, { side: s, perch: 'rail2', x: s * (R.g2x + 0.08), y: R.g2 + R.rail + 0.04, z: ReadingLogic.bayZ(k), z0: ReadingLogic.pierZ(k) + 0.8, z1: ReadingLogic.pierZ(k + 1) - 0.8, state: 'walk', pose: 'walk', dir: 1, v: 0.35 }); }
            else if (role === 'kitten') { const t = L.tables[(3 + i) % L.tables.length] || L.tables[0]; Object.assign(c, { perch: 'table', table: t, x: t.x, y: R.tableH, z: t.z + 1.2, state: 'play', pose: 'crouch', pen: { z: t.z + 1.6, v: 0 } }); }
            else { const node = Object.values(L.nodes)[(i * 7 + 3) % Object.keys(L.nodes).length]; c.x = c.hx = node.x + this.rr(-0.5, 0.5); c.z = c.hz = node.z + this.rr(0.5, 1.5); }
            this.cats.push(c);
        }
        this.owl = cfg.owl && L.chandeliers.length ? { k: Math.min(3, L.chandeliers.length - 1), head: 0, want: 0, blink: 0, t: this.rr(3, 9), fly: null } : null;
        this.reseat();
    }
    // Look alive on frame one: every cat already where it would be at this hour, settled.
    settle() {
        const m = this.m, ctx = { day: ReadingLogic.smooth(-1, 8, m.sun.alt) * (m.config.sunbeams ? 1 : 0), spots: m.spots || [], fire: this.T.groups.some(g => g.kind === 'fire' && g.want > 0.5), lamps: this.L.tables.filter(t => t.group && t.group.want > 0.5), L: this.L, taken: new Set() };
        for (const c of this.cats) {
            if (c.perch) continue;
            const w = ReadingLogic.want(c, ctx);
            if (w.spot) ctx.taken.add(w.spot);
            c.goal = w; c.x = w.x; c.z = w.z; c.y = w.y || 0; c.pose = w.pose; c.state = 'rest'; c.t = this.rr(6, 14);
        }
    }
    settings(old, cfg) {
        if (['cats', 'catSize', 'owl'].some(k => old[k] !== cfg[k])) { this.build(); this.settle(); }
        if (!cfg.librarian) this.librarian = null;
        if (old.students !== cfg.students) this.reseat();
    }
    trim() {}
    sunMoved() { for (const c of this.cats) if (c.role === 'sunbeam') c.t = Math.min(c.t, this.rr(0.5, 4)); }
    // Seats taken in an order of their own, the nearer tables a little more often (they are the ones we see).
    reseat() { const key = s => this.random() * (1 + s.z / 30); this.seatsFree = (this.L.seats || []).map(s => [key(s), s]).sort((a, b) => a[0] - b[0]).map(p => p[1]); }
    atDesk() { return !!this.librarian && this.librarian.state === 'desk'; }

    // How busy the hall is at this hour: full by day, quieter of an evening, a few owls at night.
    busy() { const h = this.m.hour; return h >= 8.5 && h < 18 ? 1 : h >= 18 && h < 22 ? 0.6 : h >= 7 && h < 8.5 ? 0.4 : h >= 22 || h < 1 ? 0.25 : 0.1; }

    wanted() { return Math.round((this.cfg.students ?? 18) * this.m.density() * this.busy()); }
    populate(dt, seed) {
        const cfg = this.cfg, want = this.wanted();
        const seated = this.students.filter(s => !s.leaving).length;
        if (seated < want && (seed || this.random() < dt * 0.12)) this.addStudent(seed);
        if (seated > want && this.random() < dt * 0.08) { const s = this.students.find(s => s.state === 'seat'); if (s) this.leave(s); }
        // The librarian keeps her hours, and is down the hall at dusk.
        if (cfg.librarian && !this.librarian) { const [x, z] = this.deskSpot(); this.librarian = { kind: 'librarian', x, z, h: Math.PI, v: 0, vmax: 1.0, r: ReadingLogic.ROOM.personR, k: 1, state: 'desk', t: this.rr(20, 60), dir: -1, phase: 0, path: [], goals: [], L: [1, 1, 1, 0], lt: 0, coat: [0.24, 0.2, 0.32], hat: [0.6, 0.6, 0.62], scarf: null }; }
        // Up on the galleries, a reader or two along the shelves: one to a gallery, so they keep out of each other's way.
        const R = ReadingLogic.ROOM, up = Math.min(4, Math.round((cfg.students ?? 18) / 6 * Math.min(1, this.busy() + 0.2)));
        while (this.browsers.length < up) {
            const i = this.browsers.length, [side, gi] = [[1, 0], [-1, 1], [1, 2], [-1, 0]][i], G = R.gal[gi], z = this.rr(ReadingLogic.pierZ(1) + 2, ReadingLogic.pierZ(6));
            this.browsers.push({ kind: 'browser', i, side, gal: gi, x: side * (G.gx + R.hw) / 2, y: G.y1, z, h: side > 0 ? 0 : Math.PI, v: 0, vmax: this.rr(0.55, 0.8), r: R.personR, k: this.rr(0.94, 1.04), free: true, path: [], state: 'browse', t: this.rr(1, 8), reach: 0, coat: this.pick(ReadingCast.COATS_P), hair: this.pick(ReadingCast.HAIR), scarf: this.random() < 0.3 ? this.pick(ReadingCast.SCARVES) : null, L: [1, 1, 1, 0], lt: 0, books: this.random() < 0.5 });
        }
        if (this.browsers.length > up && this.random() < dt * 0.05) this.browsers.pop();
    }
    // Where the librarian stands at her desk: behind it, facing the hall.
    deskSpot() { const d = this.L.desk; return d ? [d.x + 0.85, d.z] : [7.9, 9.2]; }
    // Everyone on the floor, for whoever walks to keep clear of: the readers (seated or walking), the librarian, the cats on the floor.
    bodies() {
        const out = this._bodies || (this._bodies = []);
        out.length = 0;
        for (const s of this.students) out.push(s);
        if (this.librarian) out.push(this.librarian);
        for (const c of this.cats) if (!c.perch && (c.y || 0) < 0.1) { c.r = 0.2 * c.k; out.push(c); }
        return out;
    }
    aisleOf(seat) { const R = ReadingLogic.ROOM; return Math.sign(seat.x) * (Math.abs(seat.x) < R.tableX ? R.aisleIn : R.aisleOut); }
    addStudent(seed) {
        const seat = this.seatsFree.find(s => !this.students.some(o => o.seat === s));
        if (!seat) return;
        const coat = this.pick(ReadingCast.COATS_P), hair = this.pick(ReadingCast.HAIR);
        const s = { kind: 'student', seat, coat, hair, scarf: this.random() < 0.3 ? this.pick(ReadingCast.SCARVES) : null, x: seat.x, z: seat.z, dir: seat.face, state: seed ? 'seat' : 'come', act: this.pick(['read', 'read', 'write', 'read', 'doze']), t: this.rr(4, 20), phase: this.rr(0, 6), page: 0, L: [1, 1, 1, 0], lt: 0, k: this.rr(0.92, 1.05), r: ReadingLogic.ROOM.personR, vmax: this.rr(1.0, 1.35), v: 0, h: Math.PI / 2, path: [], goals: [], books: this.random() < 0.6 };
        if (!seed) {
            // In from the door behind us, along the aisle for their table, if nobody is just there.
            const x = this.aisleOf(seat) + this.rr(-0.2, 0.2), z = 0.4;
            if (this.bodies().some(o => Math.hypot(o.x - x, o.z - z) < 1.3)) return;
            Object.assign(s, { x, z, v: s.vmax * 0.8, goals: [[seat.x, seat.z]] });
        }
        this.students.push(s);
    }
    leave(s) { s.leaving = true; s.state = 'go'; s.v = 0; s.h = s.dir > 0 ? 0 : Math.PI; s.g = null; s.path = []; s.goals = [[this.aisleOf(s.seat), 0.3]]; }

    // ---- Calls, from keys and taps ---------------------------------------------------
    callCat() { const c = this.cats.find(c => !c.perch && c.state !== 'walk') || this.cats[0]; if (!c) return '🐈 No cats today (see Cats, in the panel)'; this.poke(c); return `🐈 ${c.name}`; }
    callPlane() { this.launch(); return '✈️ A paper plane from the gallery'; }
    callOwl() { if (!this.owl) return '🦉 The owl is out (see the Owl setting)'; this.fly(); return '🦉 Hoo'; }
    callLibrarian() { const l = this.librarian; if (!l) return '📚 The librarian is off duty'; this.round(l, this.m.light.dark > 0.25 && this.m.light.dark < 0.7 ? 'light' : 'round'); return this.m.light.dark > 0.5 ? '🏮 The librarian does her rounds' : '📚 The librarian goes down the hall'; }
    callBook() { this.flyHome(); return '📖 A book goes home to its shelf'; }
    mouse() { if (this.mouseA) return; const t = this.L.things.find(t => t.kind === 'catalogue'); if (!t) return; this.mouseA = { x: t.x + 0.35, z: t.z - 0.2, y: 0.6, state: 'peek', t: 1.4, dir: 1, phase: 0 }; }
    bird(x, y) { this.birdA = { x: x - 60 * this.cam.u, y, t: 0 }; }
    strike(now) { this.strikesLeft = now ? 3 : ReadingLogic.strikes(this.m.hour); this.chime = this.strikesLeft; if (this.owl) this.owl.hoot = 1.5; for (const c of this.cats) c.ears = 2; }
    census() {
        const sun = this.cats.filter(c => c.inSun).length, reading = this.students.filter(s => s.state === 'seat' && s.act !== 'doze').length, doze = this.students.filter(s => s.state === 'seat' && s.act === 'doze').length;
        return [`${this.cats.length} cats${sun ? `, ${sun} in the sun` : ''}`, `${reading} reading`, doze ? `${doze} asleep over a book` : ''].filter(Boolean).join(' · ');
    }

    // A tap: on a cat (she answers, and stretches, and goes somewhere else), the owl (round under the vault), the librarian (her round).
    tap(x, y) {
        const cam = this.cam, near = (wx, wy, wz, r) => { if (wz < 1.2) return false; const [px, py] = cam.p(wx, wy, wz); return Math.hypot(px - x, py - y) < Math.max(14 * cam.u, r * cam.mpx(wz)); };
        const cat = this.cats.filter(c => near(c.x, (c.y || 0) + 0.2 * c.k, c.z, 0.45 * c.k)).sort((a, b) => a.z - b.z)[0];
        if (cat) { this.poke(cat); return true; }
        if (this.owl) { const o = this.owl, c = this.L.chandeliers[o.k]; if (c && near(c.x + 0.9, c.y + 0.3, c.z, 0.5)) { o.hoot = 1.5; this.fly(); return true; } }
        const l = this.librarian;
        if (l && near(l.x, 1, l.z, 0.6)) { this.notes.push({ ...this.at(l, 2), ch: 'shh', age: 0 }); if (l.state === 'desk') this.round(l, this.m.light.dark > 0.12 && this.m.light.dark < 0.62 ? 'light' : 'round'); return true; }
        return false;
    }
    poke(c) {
        this.note(c, this.pick(['mrrp', '♥', 'mew', 'prrt']));
        if (c.perch === 'rail' && c.book.state === 'rail') { c.book.t = 0; return; }
        if (c.perch) { c.state = 'stretch'; c.t = 1.6; return; }
        c.state = 'stretch'; c.t = 1.5; c.after = 'walk';
        const nodes = Object.values(this.L.nodes), n = this.pick(nodes);
        c.tx = n.x + this.rr(-0.6, 0.6); c.tz = n.z + this.rr(0.4, 1.4); c.hx = c.tx; c.hz = c.tz; c.hold = 25;
    }
    note(a, ch) { const [x, y] = this.cam.p(a.x, (a.y || 0) + 0.7 * (a.k || 1), Math.max(1, a.z)); this.notes.push({ x, y, ch, age: 0 }); if (this.notes.length > 30) this.notes.shift(); }

    // Paper planes from the top gallery: launched over the rail, they glide down in long swoops.
    launch() {
        const R = ReadingLogic.ROOM, side = this.random() < 0.5 ? -1 : 1, z = ReadingLogic.bayZ(Math.floor(this.rr(1, 6)));
        this.planes.push({ x: side * (R.g3x - 0.1), y: R.g3 + R.rail + 0.3, z, vx: -side * this.rr(1.3, 2.2), vz: this.rr(-0.8, 0.6), vy: 0, ph: this.rr(0, 6), age: 0, landed: 0, dir: -side });
    }
    // A book off a table, up and home to a shelf (or, from a tap on a shelf, the other way).
    flyHome(from, to) {
        const R = ReadingLogic.ROOM, t = this.pick(this.L.tables), sh = this.pick(this.T.shelves.filter(s => s.level === 1) || []);
        if (!t || !sh) return;
        const a = from || { x: t.x + this.rr(-0.3, 0.3), y: R.tableH + 0.05, z: t.z + this.rr(-2.5, 2.5) };
        const b = to || { x: sh.side * (R.hw - 0.15), y: sh.y0 + 0.4 + Math.floor(this.rr(0, 10)) * 0.5, z: this.rr(sh.z0 + 0.5, sh.z1 - 0.5) };
        this.books.push({ a, b, t: 0, dur: 6 + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) * 0.3, c: this.pick(ReadingArt.BOOKS), x: a.x, y: a.y, z: a.z, flap: 0 });
    }
    pull(hit) {
        const R = ReadingLogic.ROOM, sh = this.T.shelves.find(s => s.side === hit.side && s.k === hit.k && s.level === hit.level);
        if (!sh) return;
        const t = this.L.tables.filter(t => Math.sign(t.x) === hit.side || true).sort((a, b) => Math.abs(a.z - (sh.z0 + sh.z1) / 2) - Math.abs(b.z - (sh.z0 + sh.z1) / 2))[0];
        const a = { x: sh.side * (R.hw - 0.15), y: (sh.y0 + sh.y1) / 2, z: (sh.z0 + sh.z1) / 2 };
        this.flyHome(a, t ? { x: t.x + this.rr(-0.3, 0.3), y: R.tableH + 0.05, z: t.z + this.rr(-2, 2) } : null);
    }
    fly() { const o = this.owl; if (o && !o.fly) o.fly = { t: 0, dur: 14, dir: this.random() < 0.5 ? 1 : -1 }; }
    // Her rounds: at dusk down the middle aisle between the cases of the spine and back, lighting the lamps
    // either side as she comes level with them; at night round by the outer aisles with her lantern.
    round(l, kind) {
        const R = ReadingLogic.ROOM, out = [];
        if (kind === 'light') out.push([0, Math.max(6, Math.min(l.z, 12))], [0, ReadingLogic.pierZ(R.bays - 1) + 0.6], [0, 6]);
        else out.push([R.aisleOut, 6], [R.aisleOut, 70], [-R.aisleOut, 70], [-R.aisleOut, 6]);
        out.push(this.deskSpot());
        l.goals = out; l.path = []; l.state = kind;
    }

    // ---- Each frame -------------------------------------------------------------------

    update(dt) {
        const m = this.m, cfg = this.cfg, R = ReadingLogic.ROOM;
        this.populate(dt, false);
        this.jingle = Math.max(0, this.jingle - dt);
        // The clock strikes the hour.
        const hour = Math.floor(m.hour);
        if (cfg.chime !== false && this.lastHour !== null && hour !== this.lastHour) this.strike(false);
        this.lastHour = hour;
        if (this.chime > 0) { const before = Math.ceil(this.chime); this.chime = Math.max(0, this.chime - dt * 0.9); if (Math.ceil(this.chime) < before && before > 0) this.boom = 0.6; }
        this.boom = Math.max(0, (this.boom || 0) - dt);
        // Planes and books, now and then.
        if (cfg.planes > 0 && this.random() < cfg.planes * dt / 3600 * (this.busy() > 0.3 ? 1 : 0.2)) this.launch();
        if (cfg.magic && this.random() < (cfg.magicRate ?? 6) * dt / 3600) this.flyHome();
        this.updateCats(dt);
        this.updateStudents(dt);
        this.updateBrowsers(dt);
        this.updateLibrarian(dt);
        this.updateOwl(dt);
        this.updateThings(dt);
    }

    updateCats(dt) {
        const m = this.m, R = ReadingLogic.ROOM, RL = ReadingLogic, ctx = { day: ReadingLogic.smooth(-1, 8, m.sun.alt) * (m.config.sunbeams ? 1 : 0), spots: m.spots || [], fire: this.T.groups.some(g => g.kind === 'fire' && g.level > 0.5), lamps: this.L.tables.filter(t => t.group && t.group.level > 0.5), L: this.L, taken: new Set() };
        for (const c of this.cats) {
            c.phase += dt * 6; c.t -= dt; c.ears = Math.max(0, (c.ears || 0) - dt);
            c.inSun = (m.beams && !m.beamNight && RL.sunAt(m.beams, c.x, c.z) === 0 && (c.y || 0) < 0.1);
            if (c.state === 'stretch') { if (c.t <= 0) { c.state = c.after || 'sit'; c.after = null; c.t = this.rr(4, 12); } continue; }
            if (c.perch === 'rail') { this.shelfCat(c, dt); continue; }
            if (c.perch === 'ladder') { this.ladderCat(c, dt); continue; }
            if (c.perch === 'rail2') { this.railCat(c, dt); continue; }
            if (c.perch === 'table' && c.role === 'kitten') { this.kitten(c, dt); continue; }
            // Everyone else: wants a place (the sun, the fire, a lamp, the desk, a spot of its own), goes there, settles.
            if (c.hold > 0) c.hold -= dt;
            if (c.t <= 0 || !c.goal) {
                const w = c.hold > 0 ? { x: c.hx, y: 0, z: c.hz, pose: 'sit' } : RL.want(c, ctx);
                c.goal = w; c.t = this.rr(6, 14);
                if (w.spot) ctx.taken.add(w.spot);
            }
            const g = c.goal;
            if (g.perch) {
                // On a table or the desk: jump up when there.
                const d = Math.hypot(g.x - c.x, g.z - c.z);
                if ((c.y || 0) < g.y - 0.01) { if (d > 0.9) { RL.stepToward(c, g.x + Math.sign(c.x - g.x || 1) * 0.9, g.z, 0.5, dt); c.state = 'walk'; } else { c.jump = (c.jump || 0) + dt * 2.2; c.y = g.y * Math.min(1, c.jump); c.x += (g.x - c.x) * Math.min(1, dt * 3); c.z += (g.z - c.z) * Math.min(1, dt * 3); if (c.jump >= 1) { c.jump = 0; c.y = g.y; } } }
                else { c.x += (g.x - c.x) * Math.min(1, dt); c.z += (g.z - c.z) * Math.min(1, dt); c.state = 'rest'; c.pose = g.pose; }
                continue;
            }
            if ((c.y || 0) > 0.01) { c.y = Math.max(0, c.y - dt * 2.5); continue; }        // down off a table
            const left = Math.hypot(g.x - c.x, g.z - c.z);
            if (left > 0.35) { RL.stepToward(c, g.x, g.z, c.inSun ? 0.4 : 0.55, dt); c.state = 'walk'; }
            else { if (c.state === 'walk') { c.state = 'rest'; if (this.random() < 0.3) { c.state = 'groom'; c.t = Math.max(c.t, 5); } } c.pose = g.pose; if (c.state === 'groom' && c.t < 1) c.state = 'rest'; }
        }
        // A mouse, and whoever is nearest after it.
        if (this.mouseA) {
            const a = this.mouseA;
            a.t -= dt; a.phase += dt * 20;
            if (a.state === 'peek' && a.t <= 0) { a.state = 'run'; a.y = 0; a.tx = -R.hw + 1.4; a.tz = a.z + 7; const chaser = this.cats.filter(c => !c.perch).sort((p, q) => Math.hypot(p.x - a.x, p.z - a.z) - Math.hypot(q.x - a.x, q.z - a.z))[0]; if (chaser) { a.chaser = chaser; this.note(chaser, '!'); } }
            if (a.state === 'run') {
                const left = RL.stepToward(a, a.tx, a.tz, 2.2, dt);
                if (a.chaser) { a.chaser.state = 'walk'; RL.stepToward(a.chaser, a.x, a.z, 1.9, dt); a.chaser.goal = null; a.chaser.t = 6; a.chaser.hold = 6; a.chaser.hx = a.x; a.chaser.hz = a.z; }
                if (left < 0.2) { if (a.chaser) this.note(a.chaser, '?'); this.mouseA = null; }
            }
        }
    }
    // The cat on the gallery rail and her book: a look, a paw, a push; it falls, lies there a while, and floats back up to her.
    shelfCat(c, dt) {
        const b = c.book, R = ReadingLogic.ROOM;
        b.t -= dt;
        if (b.state === 'rail') { c.pose = b.t < 3 ? 'paw' : 'sit'; c.state = 'rest'; b.x = c.x; b.y = c.y; b.z = c.z + 0.32 * (c.dir < 0 ? -1 : 1) * 0 - 0.32; b.rot = 0; if (b.t <= 0) { b.state = 'fall'; b.vy = 0; b.vx = -c.side * 0.4; b.spin = this.rr(4, 8) * (this.random() < 0.5 ? -1 : 1); this.note(c, this.pick(['…', '!', 'mrrp'])); } }
        else if (b.state === 'fall') { b.vy -= 9.8 * dt; b.y += b.vy * dt; b.x += b.vx * dt; b.rot += b.spin * dt; c.pose = 'look'; if (b.y <= 0.03) { b.y = 0.03; b.state = 'floor'; b.t = this.rr(14, 30); b.rot = this.rr(-0.4, 0.4); for (let i = 0; i < 8; i++) this.puffs.push({ x: b.x, y: 0.05, z: b.z, vx: this.rr(-0.6, 0.6), vy: this.rr(0.2, 0.7), age: 0, life: this.rr(0.8, 1.6) }); } }
        else if (b.state === 'floor') { c.pose = b.t < 6 ? 'sit' : 'look'; if (b.t <= 0) { if (this.cfg.magic !== false) { b.state = 'rise'; b.from = { x: b.x, y: b.y, z: b.z }; b.u = 0; } else { b.state = 'rail'; b.t = this.rr(40, 90); } } }
        else if (b.state === 'rise') { b.u += dt / 5; const u = Math.min(1, b.u), e = u * u * (3 - 2 * u); b.x = b.from.x + (c.x - b.from.x) * e; b.y = b.from.y + (c.y - b.from.y) * e + Math.sin(u * Math.PI) * 0.8; b.z = b.from.z + (c.z - 0.32 - b.from.z) * e; b.rot = Math.sin(u * 12) * 0.3; if (this.random() < dt * 20) this.sparkles.push({ x: b.x, y: b.y, z: b.z, age: 0, life: 1.2 }); if (u >= 1) { b.state = 'rail'; b.t = this.rr(30, 80); this.note(c, '…'); } }
    }
    // The cat on the rolling ladder: the ladder rolls along its rail by itself, now and then, and she rides it.
    ladderCat(c, dt) {
        const lad = this.ladder, R = ReadingLogic.ROOM;
        lad.t -= dt;
        if (lad.t <= 0 && Math.abs(lad.to - lad.z) < 0.01) { const k = Math.floor(this.rr(1, 6)); lad.to = ReadingLogic.pierZ(k) + this.rr(1.5, 7.5); lad.t = this.rr(18, 50); }
        const d = lad.to - lad.z, v = Math.sign(d) * Math.min(Math.abs(d), 1.1 * dt);
        lad.z += v; lad.v = v / Math.max(dt, 1e-3);
        const rung = 0.72, xb = lad.side * (R.hw - 1.05), xt = lad.side * (R.hw - 0.12);
        c.x = xb + (xt - xb) * rung + lad.side * -0.18; c.y = 5.2 * rung + 0.02; c.z = lad.z; c.dir = Math.abs(lad.v) > 0.05 ? Math.sign(lad.v) * -lad.side : -lad.side;
        c.pose = Math.abs(lad.v) > 0.05 ? 'loaf' : 'sit'; c.state = 'rest';
    }
    railCat(c, dt) {
        if (c.state === 'walk') { c.z += c.dir * c.v * dt; if (c.z > c.z1) { c.z = c.z1; c.dir = -1; c.state = 'rest'; c.pose = 'look'; c.t = this.rr(3, 9); } else if (c.z < c.z0) { c.z = c.z0; c.dir = 1; c.state = 'rest'; c.pose = 'look'; c.t = this.rr(3, 9); } c.pose = 'walk'; }
        else if (c.t <= 0) { c.state = 'walk'; }
    }
    // The kitten and the pen: a bat sends it rolling, she pounces, it rolls again.
    kitten(c, dt) {
        const p = c.pen, t = c.table, R = ReadingLogic.ROOM, lo = t.z - R.tableLen / 2 + 0.3, hi = t.z + R.tableLen / 2 - 0.3;
        p.z += p.v * dt; p.v *= Math.exp(-dt * 1.2);
        if (p.z < lo || p.z > hi) { p.z = Math.max(lo, Math.min(hi, p.z)); p.v = -p.v * 0.5; }
        const d = p.z - c.z;
        if (c.t <= 0 && Math.abs(d) < 0.35) { p.v = (this.random() < 0.5 ? -1 : 1) * this.rr(0.6, 1.4); c.t = this.rr(1.5, 4); c.pose = 'paw'; c.hop = 0.3; }
        else if (Math.abs(d) > 0.3 && Math.abs(p.v) < 0.25) { c.z += Math.sign(d) * Math.min(Math.abs(d) - 0.25, 1.2 * dt); c.dir = Math.sign(d); c.pose = 'crouch'; }
        c.hop = Math.max(0, (c.hop || 0) - dt);
        c.x = t.x + 0.15 * Math.sin(this.m.time * 0.3 + c.i);
        c.y = R.tableH + Math.sin(Math.min(1, (c.hop || 0) / 0.3) * Math.PI) * 0.12;
        // At night a moth at the lamp is better than any pen.
        c.moth = this.m.light.dark > 0.6 && t.group && t.group.level > 0.5;
    }

    updateStudents(dt) {
        const RL = ReadingLogic;
        for (let i = this.students.length - 1; i >= 0; i--) {
            const s = this.students[i];
            s.t -= dt; s.phase += dt * 5;
            if (s.state === 'come' || s.state === 'go') {
                if (!s.path.length && s.goals.length) s.path = RL.route(s.x, s.z, ...s.goals.shift(), s.r);
                const left = RL.walk(s, this.bodies(), dt);
                RL.gait(s, s.moved, dt);
                if (left === 0 && !s.path.length && !s.goals.length) {
                    if (s.state === 'go') { this.students.splice(i, 1); continue; }
                    s.state = 'seat'; s.x = s.seat.x; s.z = s.seat.z; s.dir = s.seat.face; s.v = 0; s.vx = s.vz = 0; s.g = null;
                }
                continue;
            }
            if (s.t <= 0) {
                if (s.act === 'doze') { s.act = 'read'; s.wake = 1.2; this.notes.push({ ...this.at(s, 1.5), ch: '!', age: 0 }); }
                else s.act = this.random() < (this.m.hour > 21 || this.m.hour < 6 ? 0.35 : 0.12) ? 'doze' : this.pick(['read', 'read', 'write', 'read']);
                s.t = this.rr(8, s.act === 'doze' ? 50 : 30);
            }
            s.wake = Math.max(0, (s.wake || 0) - dt);
            if (s.act === 'read') { s.page -= dt; if (s.page <= 0) { s.page = this.rr(6, 18); s.flip = 0.45; } }
            s.flip = Math.max(0, (s.flip || 0) - dt);
            if (s.act === 'doze' && this.random() < dt * 0.5) this.notes.push({ ...this.at(s, 1.45), ch: 'z', age: 0 });
        }
    }
    at(a, y) { const [x, py] = this.cam.p(a.x, y, Math.max(1, a.z)); return { x, y: py }; }

    // The readers on the galleries: along to a shelf, a while browsing it (a book taken down, looked at, put back), and on.
    updateBrowsers(dt) {
        const RL = ReadingLogic;
        for (const b of this.browsers) {
            b.t -= dt;
            if (b.state === 'browse') {
                b.v = 0; b.vx = b.vz = 0; b.moved = 0;
                const face = b.side > 0 ? 0 : Math.PI, d = Math.atan2(Math.sin(face - b.h), Math.cos(face - b.h));
                b.h += Math.sign(d) * Math.min(Math.abs(d), 3 * dt);
                b.reach = Math.max(0, Math.min(1, b.reach + (b.t > 1.2 && b.t % 7 < 3 ? dt * 2 : -dt * 2)));
                if (b.t <= 0) { b.state = 'walk'; b.reach = 0; const lo = RL.pierZ(1) + 1, hi = RL.pierZ(7) - 1, to = RL.clamp(b.z + this.rr(3, 14) * (this.random() < (b.z - lo) / (hi - lo) ? -1 : 1), lo, hi); b.path = [[b.x, to]]; }
            } else {
                const left = RL.walk(b, [], dt);
                if (left === 0) { b.state = 'browse'; b.t = this.rr(6, 18); }
            }
            RL.gait(b, b.moved, dt);
        }
    }

    updateLibrarian(dt) {
        const l = this.librarian, m = this.m;
        if (!l) return;
        l.t -= dt; l.phase += dt * 6;
        // At dusk she goes down the hall lighting the lamps, a table at a time.
        const d = m.light.dark;
        const lamped = g => g.kind === 'table' || g.kind === 'case';
        if (l.state === 'desk' && this.cfg.lamps === 'dusk' && d > 0.12 && d < 0.6 && this.T.groups.some(g => lamped(g) && !g.lit && g.forced == null)) this.round(l, 'light');
        if (l.state === 'desk' && l.t <= 0) { l.t = this.rr(60, 200); if (d > 0.6 && this.random() < 0.6) this.round(l, 'round'); }
        if (l.state === 'light' || l.state === 'round') {
            const RL = ReadingLogic;
            l.vmax = l.state === 'light' ? 1.6 : 1.0;
            if (!l.path.length && l.goals.length) l.path = RL.route(l.x, l.z, ...l.goals.shift(), l.r);
            const left = RL.walk(l, this.bodies(), dt);
            RL.gait(l, l.moved, dt);
            // Each table's lamps, and the spine's, as she comes level with them, both sides of the aisle.
            if (l.state === 'light') for (const g of this.T.groups) if (lamped(g) && g.lit == null && Math.abs(RL.bayZ(g.k) - l.z) < 3.6 && l.z > 5) { g.lit = true; }
            if (left === 0 && !l.path.length && !l.goals.length) { l.state = 'desk'; l.dir = -1; l.t = this.rr(60, 200); }
        } else { l.v = 0; l.vx = l.vz = 0; ReadingLogic.gait(l, 0, dt); }
        l.lantern = d > 0.55 && l.state !== 'desk';
        // By day the lamps that were lit are put out again by the hour; with nobody to light them, they come on by themselves.
        if (d < 0.08) for (const g of this.T.groups) if (lamped(g)) g.lit = null;
        if (d > 0.62) for (const g of this.T.groups) if (lamped(g) && g.lit == null) g.lit = true;
    }

    updateOwl(dt) {
        const o = this.owl;
        if (!o) return;
        o.t -= dt; o.blink = Math.max(0, o.blink - dt); o.hoot = Math.max(0, (o.hoot || 0) - dt);
        if (o.t <= 0) { o.want = this.rr(-1.2, 1.2); o.t = this.rr(2, 8); if (this.random() < 0.4) o.blink = 0.2; }
        o.head += (o.want - o.head) * Math.min(1, dt * 4);
        if (!o.fly && this.m.light.dark > 0.6 && this.random() < dt / 240) this.fly();
        if (o.fly) { o.fly.t += dt; if (o.fly.t >= o.fly.dur) o.fly = null; }
    }

    updateThings(dt) {
        const R = ReadingLogic.ROOM;
        for (let i = this.planes.length - 1; i >= 0; i--) {
            const p = this.planes[i];
            p.age += dt;
            if (p.landed) { p.landed += dt; if (p.landed > 25) this.planes.splice(i, 1); continue; }
            // A glider's long swoops: down a little, up a little, round.
            p.vy = -0.55 + Math.sin(p.age * 1.6 + p.ph) * 0.45;
            const turn = Math.sin(p.age * 0.5 + p.ph) * 0.5;
            const vx = p.vx * Math.cos(turn) - p.vz * Math.sin(turn), vz = p.vx * Math.sin(turn) + p.vz * Math.cos(turn);
            p.x += vx * dt; p.z += vz * dt; p.y += p.vy * dt; p.bank = turn; p.dir = Math.sign(vx) || p.dir;
            if (Math.abs(p.x) > R.g1x - 0.3) { p.vx = -p.vx; p.x = Math.sign(p.x) * (R.g1x - 0.3); }
            if (p.y <= 0.02) { p.y = 0.02; p.landed = 0.01; }
        }
        for (let i = this.books.length - 1; i >= 0; i--) {
            const b = this.books[i];
            b.t += dt; b.flap += dt * 9;
            const u = Math.min(1, b.t / b.dur), e = u * u * (3 - 2 * u);
            b.x = b.a.x + (b.b.x - b.a.x) * e; b.z = b.a.z + (b.b.z - b.a.z) * e; b.y = b.a.y + (b.b.y - b.a.y) * e + Math.sin(u * Math.PI) * 2.2;
            if (this.random() < dt * 16) this.sparkles.push({ x: b.x, y: b.y, z: b.z, age: 0, life: 1.4 });
            if (u >= 1) this.books.splice(i, 1);
        }
        for (let i = this.puffs.length - 1; i >= 0; i--) { const p = this.puffs[i]; p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.age > p.life) this.puffs.splice(i, 1); }
        for (let i = this.sparkles.length - 1; i >= 0; i--) { const p = this.sparkles[i]; p.age += dt; p.y -= 0.1 * dt; if (p.age > p.life) this.sparkles.splice(i, 1); }
        for (let i = this.notes.length - 1; i >= 0; i--) { const n = this.notes[i]; n.age += dt; n.y -= 14 * this.cam.u * dt; if (n.age > 2.6) this.notes.splice(i, 1); }
        if (this.birdA) { this.birdA.t += dt; if (this.birdA.t > 2.5) this.birdA = null; }
    }

    // ---- Light on the cast ----------------------------------------------------------------

    relight(a, dt, up = 0.6) {
        if ((a.lt -= dt) > 0) return;
        a.lt = 0.25 + Math.random() * 0.1;
        const m = this.m, l = m.light, z = this.cam.z(Math.max(1, a.z));
        this.T.lightAt(l, a.x, z, (a.y || 0) + up, a.L);
        // In a patch of sun: golden.
        if (m.beams && !m.beamNight && (a.y || 0) < 0.2 && ReadingLogic.sunAt(m.beams, a.x, a.z) === 0) { const c = m.beamColour(); if (c) for (let j = 0; j < 3; j++) a.L[j] = Math.min(1.7, a.L[j] + c[j] * 0.55); a.sunny = true; } else a.sunny = false;
        a.air = (1 - Math.exp(-(z - 1) / 26)) * 0.9;
        a.haze = l.haze0;
        a.tints = null;
    }
    tone(a, c, k = 1) {
        const L = a.L, t = a.air || 0, h = a.haze || [0, 0, 0];
        const r = Math.min(1, c[0] * L[0] * k) * (1 - t) + h[0] * t, g = Math.min(1, c[1] * L[1] * k) * (1 - t) + h[1] * t, b = Math.min(1, c[2] * L[2] * k) * (1 - t) + h[2] * t;
        return `rgb(${r * 255 | 0},${g * 255 | 0},${b * 255 | 0})`;
    }
    tint(a, key, c, k = 1) { const t = (a.tints ||= {}); return t[key] ||= this.tone(a, c, k); }

    // Put the lit picture back over whatever is nearer than D metres, in a box (CSS px).
    restore(ctx, D, x, y, w, h) {
        const T = this.T, k = PaintedLogic.bandOf(this.cam.z(D), this.cam.bands), mask = k >= 0 ? T.masks[k] : null;
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
        ctx.drawImage(s, 0, 0, sw, sh, x, y, w, h);
    }
    glow(ctx, px, py, r, colour, a) {
        if (r < 0.5 || a < 0.01) return;
        const gr = ctx.createRadialGradient(px, py, 0, px, py, r);
        gr.addColorStop(0, PaintedPlates.css(colour, a)); gr.addColorStop(0.35, PaintedPlates.css(colour, a * 0.3)); gr.addColorStop(1, PaintedPlates.css(colour, 0));
        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(px, py, r, 0, 6.2832); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
    }

    // ---- Drawing ---------------------------------------------------------------------------

    draw(ctx) {
        const m = this.m, cam = this.cam, dt = 1 / 60, list = [];
        for (const c of this.cats) list.push(c);
        for (const s of this.students) list.push(s);
        for (const b of this.browsers) list.push(b);
        if (this.librarian) list.push(this.librarian);
        if (this.mouseA) list.push({ kind: 'mouse', a: this.mouseA, z: this.mouseA.z, x: this.mouseA.x });
        for (const p of this.planes) list.push({ kind: 'plane', p, z: p.z, x: p.x });
        for (const b of this.books) list.push({ kind: 'flybook', b, z: b.z, x: b.x });
        for (const c of this.cats) if (c.book) list.push({ kind: 'book', c, z: c.book.z ?? c.z, x: c.book.x ?? c.x });
        if (this.ladder) list.push({ kind: 'ladder', z: this.ladder.z + 0.05, x: 11 });
        if (this.T.spots.fire) list.push({ kind: 'fire', z: this.T.spots.fire.z - 0.4, x: this.T.spots.fire.x });
        if (this.owl) list.push({ kind: 'owl', z: this.owlZ(), x: 0 });
        list.sort((a, b) => b.z - a.z);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (const a of list) {
            if (a.z < 1.2) continue;
            const s = cam.mpx(a.z);
            if (a.kind === 'cat') { this.drawCat(ctx, a, s, dt); continue; }
            if (a.kind === 'student') { this.drawStudent(ctx, a, s, dt); continue; }
            if (a.kind === 'librarian') { this.drawLibrarian(ctx, a, s, dt); continue; }
            if (a.kind === 'browser') { this.drawBrowser(ctx, a, s, dt); continue; }
            if (a.kind === 'mouse') { const q = a.a, [px, py] = cam.p(q.x, q.y || 0, q.z), k = s * 0.09; ctx.fillStyle = '#6a5a50'; ctx.beginPath(); ctx.ellipse(px, py - k, k * 1.2, k * 0.7, 0, 0, 6.2832); ctx.fill(); ctx.strokeStyle = '#6a5a50'; ctx.lineWidth = Math.max(0.6, k * 0.25); ctx.beginPath(); ctx.moveTo(px - q.dir * k, py - k); ctx.quadraticCurveTo(px - q.dir * k * 2.4, py - k * 1.6, px - q.dir * k * 3, py - k * 0.6); ctx.stroke(); continue; }
            if (a.kind === 'plane') { this.drawPlane(ctx, a.p, s); continue; }
            if (a.kind === 'flybook' || a.kind === 'book') { this.drawBook(ctx, a.kind === 'book' ? a.c.book : a.b, s, a.kind === 'flybook'); continue; }
            if (a.kind === 'ladder') { this.drawLadder(ctx); continue; }
            if (a.kind === 'fire') { this.drawFire(ctx); continue; }
            if (a.kind === 'owl') { this.drawOwl(ctx); continue; }
        }
    }

    // A cat, in metres, feet at the origin, facing +x; poses: walk, sit, loaf, curl, sprawl, paw, look, crouch, groom, stretch.
    drawCat(ctx, c, s, dt) {
        const cam = this.cam, k = c.k, sc = s * k;
        const [px, py] = cam.p(c.x, c.y || 0, c.z);
        if (px < -60 || px > this.m.W + 60 || sc < 1.2) return;
        this.relight(c, dt, (c.y || 0) + 0.2);
        const coat = c.coat, col = this.tint(c, 'c', coat.c), dk = this.tint(c, 'd', coat.d), wh = coat.w ? this.tint(c, 'w', coat.w) : null, t = this.m.time + c.i * 1.7;
        const hi = this.tint(c, 'h', coat.c, 1.28), lo = this.tint(c, 'l', coat.c, 0.62), stripes = coat.s ? this.tint(c, 's', coat.d) : null;
        // A body in three values: the shadowed underside, the coat, the light along the back; and stripes for a tabby.
        const body = (x, y, rx, ry, rot = 0) => {
            ctx.fillStyle = lo; ctx.beginPath(); ctx.ellipse(x, y - ry * 0.12, rx, ry, rot, 0, 6.2832); ctx.fill();
            ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y + ry * 0.08, rx * 0.94, ry * 0.86, rot, 0, 6.2832); ctx.fill();
            ctx.fillStyle = hi; ctx.beginPath(); ctx.ellipse(x - rx * 0.1, y + ry * 0.5, rx * 0.6, ry * 0.28, rot, 0, 6.2832); ctx.fill();
            if (stripes) { ctx.strokeStyle = stripes; ctx.lineWidth = 0.022; ctx.beginPath(); for (let k = -2; k <= 2; k++) { const sx = x + k * rx * 0.3; ctx.moveTo(sx - rx * 0.05, y + ry * 0.85); ctx.lineTo(sx + rx * 0.06, y + ry * 0.15); } ctx.stroke(); }
        };
        ctx.save(); ctx.translate(px, py); ctx.scale(sc * c.dir, -sc);
        const pose = c.state === 'walk' ? 'walk' : c.state === 'stretch' ? 'stretch' : c.state === 'groom' ? 'groom' : c.pose || 'sit';
        // A soft shadow under whoever is on a floor or a table.
        ctx.fillStyle = 'rgba(20,12,10,0.22)'; ctx.beginPath(); ctx.ellipse(0, 0.01, 0.3, 0.05, 0, 0, 6.2832); ctx.fill();
        const tail = (x0, y0, x1, y1, x2, y2) => { ctx.strokeStyle = dk; ctx.lineWidth = 0.055; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(x1, y1, x2, y2); ctx.stroke(); };
        const head = (hx, hy, r = 0.095) => {
            const perk = c.ears > 0 ? 0.03 : 0, asleep = pose === 'curl' || pose === 'sprawl' || (pose === 'loaf' && Math.sin(t * 0.2) > -0.3);
            ctx.fillStyle = col; ctx.beginPath(); ctx.arc(hx, hy, r, 0, 6.2832); ctx.fill();
            ctx.beginPath(); ctx.moveTo(hx - r * 0.8, hy + r * 0.4); ctx.lineTo(hx - r * 0.55, hy + r * 1.35 + perk); ctx.lineTo(hx - r * 0.05, hy + r * 0.8); ctx.moveTo(hx + r * 0.05, hy + r * 0.8); ctx.lineTo(hx + r * 0.6, hy + r * 1.35 + perk); ctx.lineTo(hx + r * 0.85, hy + r * 0.35); ctx.fill();
            ctx.fillStyle = lo; ctx.beginPath(); ctx.moveTo(hx + r * 0.2, hy + r * 0.8); ctx.lineTo(hx + r * 0.55, hy + r * 1.2 + perk); ctx.lineTo(hx + r * 0.68, hy + r * 0.55); ctx.fill();
            ctx.fillStyle = hi; ctx.beginPath(); ctx.arc(hx - r * 0.2, hy + r * 0.35, r * 0.45, 0, 6.2832); ctx.fill();
            if (wh) { ctx.fillStyle = wh; ctx.beginPath(); ctx.ellipse(hx + r * 0.45, hy - r * 0.4, r * 0.45, r * 0.35, 0, 0, 6.2832); ctx.fill(); }
            // Eyes: shut in a contented line, or open; at night they catch the lamplight.
            if (asleep) { ctx.strokeStyle = dk; ctx.lineWidth = r * 0.12; ctx.beginPath(); ctx.moveTo(hx + r * 0.25, hy + r * 0.12); ctx.quadraticCurveTo(hx + r * 0.42, hy, hx + r * 0.6, hy + r * 0.12); ctx.stroke(); }
            else { ctx.fillStyle = this.m.light.dark > 0.5 ? 'rgba(210,255,140,0.95)' : '#1a1612'; ctx.beginPath(); ctx.arc(hx + r * 0.45, hy + r * 0.12, r * 0.15, 0, 6.2832); ctx.fill(); }
            ctx.fillStyle = 'rgba(214,130,140,0.9)'; ctx.beginPath(); ctx.arc(hx + r * 0.92, hy - r * 0.2, r * 0.1, 0, 6.2832); ctx.fill();
        };
        if (pose === 'walk') {
            // A walk in four beats, each paw planted while the body goes over it (so it does not slide), then
            // lifted and carried forward: the stride is what she has walked, not the clock.
            const A = ReadingLogic.CAT_STRIDE * 0.3, gp = c.gp || 0;
            ctx.strokeStyle = dk; ctx.lineWidth = 0.05; ctx.beginPath();
            for (const [x, off] of [[0.18, 0.5], [0.12, 0], [-0.15, 0.25], [-0.21, 0.75]]) {
                const q = ((gp + off) % 1 + 1) % 1, stance = q < 0.6, rel = stance ? A - 2 * A * q / 0.6 : -A + 2 * A * (q - 0.6) / 0.4, lift = stance ? 0 : Math.sin(Math.PI * (q - 0.6) / 0.4) * 0.05;
                ctx.moveTo(x, 0.19); ctx.lineTo(x + rel, 0.01 + lift);
            }
            ctx.stroke();
            tail(-0.24, 0.24, -0.4, 0.34, -0.33, 0.56 + Math.sin(t * 2) * 0.03);
            body(0, 0.24, 0.26, 0.095);
            head(0.28, 0.33);
            if (wh) { ctx.fillStyle = wh; ctx.beginPath(); ctx.ellipse(0.17, 0.19, 0.08, 0.045, 0, 0, 6.2832); ctx.fill(); }
        } else if (pose === 'sprawl' || pose === 'curl') {
            const breathe = Math.sin(t * 1.3) * 0.012;
            if (pose === 'sprawl') {
                // On her side in the sun, legs out, tail along the floor.
                ctx.strokeStyle = dk; ctx.lineWidth = 0.05; ctx.beginPath(); ctx.moveTo(0.12, 0.08); ctx.lineTo(0.3, 0.03); ctx.moveTo(-0.14, 0.08); ctx.lineTo(-0.02, 0.02); ctx.stroke();
                tail(-0.28, 0.08, -0.45, 0.03, -0.58, 0.06 + Math.sin(t * 0.7) * 0.02);
                body(0, 0.12, 0.31, 0.12 + breathe);
                head(0.3, 0.12, 0.09);
                if (wh) { ctx.fillStyle = wh; ctx.beginPath(); ctx.ellipse(0.04, 0.07, 0.17, 0.05, 0, 0, 6.2832); ctx.fill(); }
            } else {
                body(0, 0.13, 0.27, 0.14 + breathe);
                head(0.2, 0.15, 0.095);
                tail(-0.2, 0.06, 0.05, -0.04, 0.26, 0.05);
                if (wh) { ctx.fillStyle = wh; ctx.beginPath(); ctx.ellipse(0.12, 0.09, 0.07, 0.05, 0, 0, 6.2832); ctx.fill(); }
            }
            if (Math.sin(t * 0.37) > 0.96 && this.m.light.dark > 0.3 && !c.zt) { c.zt = 1; this.notes.push({ ...this.at(c, (c.y || 0) + 0.45), ch: 'z', age: 0 }); } else if (Math.sin(t * 0.37) < 0.9) c.zt = 0;
        } else if (pose === 'loaf') {
            tail(-0.18, 0.05, -0.05, -0.02, 0.15, 0.03);
            body(0, 0.12, 0.22, 0.13);
            head(0.2, 0.23);
            if (wh) { ctx.fillStyle = wh; ctx.beginPath(); ctx.ellipse(0.14, 0.07, 0.07, 0.05, 0, 0, 6.2832); ctx.fill(); }
        } else if (pose === 'stretch') {
            const u = Math.sin(Math.min(1, 1 - c.t / 1.6) * Math.PI);
            ctx.strokeStyle = dk; ctx.lineWidth = 0.05; ctx.beginPath(); ctx.moveTo(0.22, 0.12 - 0.08 * u); ctx.lineTo(0.42, 0.01); ctx.moveTo(-0.18, 0.2); ctx.lineTo(-0.2, 0.01); ctx.stroke();
            tail(-0.22, 0.24, -0.3, 0.5, -0.24, 0.62);
            body(0.02, 0.18 - 0.05 * u, 0.3 + 0.06 * u, 0.09, -0.25 * u);
            head(0.36, 0.12 - 0.04 * u);
        } else {
            // Sitting: upright, tail round the feet; pawing at something; looking down over the edge; crouched to pounce; grooming.
            const paw = pose === 'paw', look = pose === 'look', crouch = pose === 'crouch', groom = pose === 'groom';
            if (crouch) {
                tail(-0.2, 0.08, -0.38, 0.12 + Math.sin(t * 8) * 0.05, -0.46, 0.06);
                body(0, 0.1, 0.24, 0.085); head(0.22, 0.13);
            } else {
                tail(-0.12, 0.04, -0.3, 0.02, -0.22 + Math.sin(t * 1.1) * 0.04, 0.16);
                body(0, 0.2, 0.16, 0.2);
                if (paw) { ctx.strokeStyle = col; ctx.lineWidth = 0.06; ctx.beginPath(); ctx.moveTo(0.08, 0.22); ctx.lineTo(0.24 + Math.sin(t * 6) * 0.04, 0.18 + Math.abs(Math.sin(t * 6)) * 0.06); ctx.stroke(); }
                if (wh) { ctx.fillStyle = wh; ctx.beginPath(); ctx.ellipse(0.07, 0.23, 0.065, 0.11, 0, 0, 6.2832); ctx.fill(); }
                head(look ? 0.12 : 0.05, look ? 0.38 : 0.45 + (groom ? -0.03 : 0));
                if (groom) { ctx.strokeStyle = col; ctx.lineWidth = 0.055; ctx.beginPath(); ctx.moveTo(0.08, 0.26); ctx.lineTo(0.1, 0.38 + Math.sin(t * 7) * 0.03); ctx.stroke(); }
            }
        }
        ctx.restore();
        // At night, a moth at the kitten's lamp.
        if (c.moth) { const lx = c.table.x, lz = c.table.z, [mx, my] = cam.p(lx + Math.sin(t * 3) * 0.25, ReadingLogic.ROOM.tableH + ReadingLogic.ROOM.shade + 0.12 + Math.sin(t * 5) * 0.1, lz + Math.cos(t * 2.4) * 0.3); ctx.fillStyle = 'rgba(240,230,210,0.9)'; ctx.fillRect(mx - 1, my - 1, 2.2 * cam.u, 1.6 * cam.u); }
        if (c.pen) { const [ex, ey] = cam.p(c.table.x + 0.1, ReadingLogic.ROOM.tableH + 0.02, c.pen.z), r = s * 0.08; ctx.strokeStyle = '#1e1a2a'; ctx.lineWidth = Math.max(0.8, s * 0.015); ctx.beginPath(); ctx.moveTo(ex - r, ey); ctx.lineTo(ex + r, ey - r * 0.2); ctx.stroke(); }
        this.restore(ctx, c.z, px - 0.7 * sc, py - 0.8 * sc, 1.4 * sc, 0.9 * sc);
    }

    // A student at a table, seen side on: reading, turning a page, writing, asleep on their arms.
    drawStudent(ctx, a, s, dt) {
        const cam = this.cam, k = s * a.k;
        const [px, py] = cam.p(a.x, 0, a.z);
        if (px < -80 || px > this.m.W + 80 || k < 1.5) return;
        this.relight(a, dt, 1.1);
        const coat = this.tint(a, 'coat', a.coat), skin = this.tint(a, 'skin', [0.9, 0.72, 0.6]), hair = this.tint(a, 'hair', a.hair), legs = this.tint(a, 'legs', [0.15, 0.13, 0.17]);
        if (a.state !== 'seat') {
            const box = this.drawWalker(ctx, a, a.coat, ReadingCast.SKIN, a.hair, ReadingCast.LEGS, this.behindSpine(a));
            if (box) this.restore(ctx, a.z, ...box);
            return;
        }
        ctx.save(); ctx.translate(px, py); ctx.scale(k * a.dir, -k);
        {
            const doze = a.act === 'doze', lean = doze ? 0.32 : a.act === 'write' ? 0.16 : 0.1, bob = Math.sin(a.phase * 0.15) * 0.01;
            ctx.strokeStyle = legs; ctx.lineWidth = 0.14; ctx.beginPath(); ctx.moveTo(-0.08, 0.5); ctx.lineTo(0.3, 0.5); ctx.lineTo(0.32, 0.04); ctx.stroke();
            ctx.strokeStyle = coat; ctx.lineWidth = 0.38; ctx.beginPath(); ctx.moveTo(-0.08, 0.6); ctx.lineTo(-0.08 + lean, 1.15 + bob - (doze ? 0.14 : 0)); ctx.stroke();
            // The arm: on the book, turning a page, writing, or under the head.
            ctx.lineWidth = 0.11; ctx.beginPath(); ctx.moveTo(lean - 0.02, 1.08 - (doze ? 0.12 : 0));
            if (doze) ctx.lineTo(0.62, 0.86); else if (a.flip > 0) ctx.lineTo(0.5, 0.95 + Math.sin(a.flip * 7) * 0.08); else if (a.act === 'write') ctx.lineTo(0.55 + Math.sin(a.phase * 3) * 0.03, 0.82); else ctx.lineTo(0.5, 0.84);
            ctx.stroke();
            if (a.scarf) { ctx.strokeStyle = this.tint(a, 'scarf', a.scarf); ctx.lineWidth = 0.08; ctx.beginPath(); ctx.moveTo(lean - 0.12, 1.2 - (doze ? 0.14 : 0)); ctx.lineTo(lean + 0.08, 1.2 - (doze ? 0.14 : 0)); ctx.stroke(); }
            const hx = (doze ? 0.48 : lean + 0.06), hy = doze ? 0.95 : 1.32 + bob + (a.wake > 0 ? 0.05 : 0);
            ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(hx, hy, 0.11, 0, 6.2832); ctx.fill();
            ctx.fillStyle = hair; ctx.beginPath(); ctx.arc(hx - 0.03, hy + 0.04, 0.115, Math.PI * 0.1, Math.PI * 1.15); ctx.fill();
            if (a.flip > 0) { ctx.fillStyle = this.tint(a, 'page', [0.96, 0.93, 0.84], 1.2); ctx.beginPath(); ctx.moveTo(0.5, 0.82); ctx.lineTo(0.5 + Math.cos(a.flip * 7) * 0.18, 0.82 + Math.abs(Math.sin(a.flip * 7)) * 0.16); ctx.lineTo(0.5, 0.86); ctx.fill(); }
        }
        ctx.restore();
        this.restore(ctx, a.z, px - 0.9 * k, py - 1.9 * k, 1.8 * k, 2 * k);
    }
    // Where the spine's case stands between us and someone walking beside it, the screen row below which it
    // hides them (its top edge, where our line of sight to them crosses it); else null.
    behindSpine(a) {
        const R = ReadingLogic.ROOM, ax = Math.abs(a.x), xo = R.spineX + R.spineW;
        if (ax <= xo || ax > xo + 1.6) return null;
        const zf = a.z * xo / ax;
        if (!(this.L.spine || []).some(c => Math.sign(c.x) === Math.sign(a.x) && zf > c.z0 && zf < c.z1)) return null;
        return this.cam.p(Math.sign(a.x) * xo, R.spineH, zf)[1];
    }

    // Someone standing or walking, drawn in the hall's own perspective from where their feet and joints are
    // in metres (ReadingLogic.pose): each foot where it is planted (or swinging through, lifted), the knees
    // bending forward, the body riding up over each step, the arms swinging against the legs, the shoulders
    // broad seen from in front or behind and narrow from the side, the far arm and leg in shadow, the face
    // or the back of the head as they face; below `clipY` (a screen row) hidden by whatever stands nearer.
    // The box drawn in (CSS px), or null.
    drawWalker(ctx, a, coat, skin, hair, legs, clipY = null) {
        const cam = this.cam, RL = ReadingLogic, k = a.k || 1, y0 = a.y || 0, P = RL.pose(a), h = a.h ?? Math.PI / 2;
        const fx = Math.cos(h), fz = Math.sin(h), rx = fz, rz = -fx, vl = Math.hypot(a.x, a.z) || 1, away = (fx * a.x + fz * a.z) / vl, rightFar = (rx * a.x + rz * a.z) > 0;
        const W = (x, y, z) => cam.p(x, y0 + y, Math.max(1, z)), s = cam.mpx(Math.max(1, a.z)) * k;
        const [bx, by] = W(a.x, 0, a.z);
        if (bx < -80 || bx > this.m.W + 80 || s < 1.5) return null;
        this.relight(a, 1 / 60, y0 + 1.1);
        // (Each colour's tones kept on the walker until the light on them changes: relight clears a.tints.)
        const tints = a.tints || (a.tints = {}), tone = (c, kk) => { const row = tints[c.key || (c.key = `w${ReadingCast.keys++}`)] || (tints[c.key] = {}); return row[kk] || (row[kk] = this.tone(a, c, kk)); };
        const hipY = 0.92 * k + P.bob, shY = 1.42 * k + P.bob, headY = 1.6 * k + P.bob;
        const across = (side, w, y) => [a.x + rx * side * w * k, y, a.z + rz * side * w * k];
        if (clipY != null) { ctx.save(); ctx.beginPath(); ctx.rect(-10, -1e4, this.m.W + 20, clipY + 1e4); ctx.clip(); }
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        const stroke = (col, w, pts) => { ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.8, w * s); ctx.beginPath(); pts.forEach((q, i) => { const [x, y] = W(...q); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); };
        // A leg: hip to knee to foot, the knee bent forward by as much as the leg is shorter than its reach; a shoe along the way they face.
        const leg = (i, col) => {
            const side = i ? 1 : -1, hip = across(side, 0.1, hipY), f = P.feet[i], foot = [f.x, f.y + 0.06 * k, f.z];
            const d = Math.hypot(hip[0] - foot[0], hip[1] - foot[1], hip[2] - foot[2]), half = 0.47 * k, bend = Math.sqrt(Math.max(0, half * half - d * d / 4));
            const knee = [(hip[0] + foot[0]) / 2 + fx * bend, (hip[1] + foot[1]) / 2, (hip[2] + foot[2]) / 2 + fz * bend];
            stroke(col, 0.13, [hip, knee, foot]);
            stroke(col, 0.1, [[foot[0] - fx * 0.03 * k, f.y + 0.03 * k, foot[2] - fz * 0.03 * k], [foot[0] + fx * 0.13 * k, f.y + 0.03 * k, foot[2] + fz * 0.13 * k]]);
        };
        // An arm: swinging forward as the leg on its side goes back; or, reaching for a shelf, up.
        const arm = (i, col) => {
            const side = i ? 1 : -1, sh = across(side, 0.2, shY - 0.05 * k), f = P.feet[i], rel = (f.x - a.x) * fx + (f.z - a.z) * fz;
            if (a.reach > 0 && i === 1) { const hand = [sh[0] + fx * 0.25 * k, sh[1] + 0.45 * k * a.reach - 0.55 * k * (1 - a.reach), sh[2] + fz * 0.25 * k]; stroke(col, 0.1, [sh, hand]); return hand; }
            const swing = RL.clamp(-rel * 0.6, -0.3 * k, 0.3 * k), hand = [sh[0] + fx * swing, sh[1] - 0.6 * k, sh[2] + fz * swing], elbow = [(sh[0] + hand[0]) / 2 + fx * (0.04 * k + Math.max(0, swing) * 0.2), (sh[1] + hand[1]) / 2, (sh[2] + hand[2]) / 2 + fz * (0.04 * k + Math.max(0, swing) * 0.2)];
            stroke(col, 0.1, [sh, elbow, hand]);
            return hand;
        };
        const far = rightFar ? 1 : 0, near = 1 - far, dark = 0.72;
        arm(far, tone(coat, dark));
        leg(far, tone(legs, dark));
        leg(near, tone(legs, 1));
        // The body: broad from in front or behind, narrow from the side; lit along its top.
        const width = 0.24 + 0.12 * Math.abs(away), hipC = [a.x, hipY - 0.1 * k, a.z], shC = [a.x, shY - 0.07 * k, a.z], lit = rightFar ? -1 : 1;
        ctx.lineCap = 'butt'; stroke(tone(coat, 1), width, [hipC, shC]); ctx.lineCap = 'round';
        stroke(tone(coat, 1), 0.15, [across(-1, 0.12, shY - 0.06 * k), across(1, 0.12, shY - 0.06 * k)]);
        stroke(tone(coat, 1.12), 0.07, [across(lit, 0.06, shY - 0.3 * k), across(lit, 0.1, shY - 0.05 * k)]);
        if (a.scarf) stroke(tone(a.scarf, 1), 0.09, [across(-1, 0.12, shY + 0.02 * k), across(1, 0.12, shY + 0.02 * k)]);
        // An armful of books, held in front of them (hidden when they walk away from us).
        const hand = arm(near, tone(coat, 1));
        if (a.books && !a.reach && away < 0.5) { const [cx, cy] = W(a.x + fx * 0.2 * k + rx * (near ? 1 : -1) * 0.08 * k, 1.12 * k + P.bob, a.z + fz * 0.2 * k + rz * (near ? 1 : -1) * 0.08 * k); ctx.fillStyle = tone(ReadingCast.BOOK_A, 1); ctx.fillRect(cx - 0.09 * s, cy - 0.1 * s, 0.18 * s, 0.2 * s); ctx.fillStyle = tone(ReadingCast.BOOK_B, 1); ctx.fillRect(cx - 0.08 * s, cy - 0.13 * s, 0.16 * s, 0.04 * s); }
        if (a.reach > 0.5) { const [cx, cy] = W(...hand); ctx.fillStyle = tone(ReadingCast.BOOK_C, 1); ctx.fillRect(cx - 0.05 * s, cy - 0.12 * s, 0.1 * s, 0.14 * s); }
        // The head: the face toward us, or the back of the head; from the side, the hair behind.
        const [hx, hy] = W(a.x + fx * 0.02 * k, headY, a.z + fz * 0.02 * k), r = 0.115 * s, [qx] = W(a.x + fx * 0.3, headY, a.z + fz * 0.3), back = qx > hx ? -1 : 1;
        ctx.fillStyle = tone(skin, 1); ctx.beginPath(); ctx.arc(hx, hy, r, 0, 6.2832); ctx.fill();
        ctx.fillStyle = tone(hair, 1); ctx.beginPath();
        if (away > 0.45) ctx.arc(hx, hy - r * 0.05, r * 1.05, 0, 6.2832);
        else if (away < -0.45) ctx.arc(hx, hy - r * 0.2, r * 1.02, Math.PI * 1.02, Math.PI * 1.98);
        else ctx.arc(hx + back * r * 0.12, hy - r * 0.12, r * 1.02, back > 0 ? -Math.PI * 0.62 : Math.PI * 0.62, back > 0 ? Math.PI * 0.42 : Math.PI * 1.58, back < 0);
        ctx.fill();
        if (a.kind === 'librarian') { ctx.beginPath(); ctx.arc(hx - (away > 0.45 || away < -0.45 ? 0 : back * -r * 0.6), hy - r * 1.05, r * 0.5, 0, 6.2832); ctx.fill(); }
        if (clipY != null) ctx.restore();
        return [bx - 0.6 * s, by - 1.9 * s, 1.2 * s, 2 * s];
    }
    drawLibrarian(ctx, l, s, dt) {
        const cam = this.cam, k = s, d = this.L.desk;
        const [px, py] = cam.p(l.x, 0, l.z);
        if (px < -80 || px > this.m.W + 80) return;
        this.relight(l, dt, 1.2);
        if (l.lantern) this.glow(ctx, px + l.dir * 0.45 * k, py - 0.5 * k, 3.4 * k, [1, 0.7, 0.34], 0.38);
        // Behind her desk, the desk hides her below its top.
        const behind = d && l.x > d.x - 0.45 && Math.abs(l.z - d.z) < 1.5 ? cam.p(d.x - 0.45, 0.95, l.z * (d.x - 0.45) / l.x)[1] : null;
        const box = this.drawWalker(ctx, l, l.coat, ReadingCast.SKIN_L, ReadingCast.HAIR_L, ReadingCast.LEGS, behind);
        const P = ReadingLogic.pose(l), fx = Math.cos(l.h), fz = Math.sin(l.h), sideX = -fz * 0.28, sideZ = fx * 0.28;
        if (l.lantern) {
            const [lx, ly] = cam.p(l.x + sideX + fx * 0.15, 0.72 + P.bob, l.z + sideZ + fz * 0.15);
            ctx.fillStyle = '#ffe2a0'; ctx.fillRect(lx - 0.06 * k, ly - 0.1 * k, 0.12 * k, 0.18 * k);
            ctx.strokeStyle = '#2a2222'; ctx.lineWidth = Math.max(0.6, 0.02 * k); ctx.strokeRect(lx - 0.06 * k, ly - 0.1 * k, 0.12 * k, 0.18 * k);
            this.glow(ctx, lx, ly, 0.6 * k, [1, 0.85, 0.5], 0.8);
        } else if (l.state === 'light') {
            // The taper on its long pole, held up before her.
            const a = cam.p(l.x + sideX + fx * 0.2, 0.95 + P.bob, l.z + sideZ + fz * 0.2), b = cam.p(l.x + sideX + fx * 0.55, 2.0 + P.bob, l.z + sideZ + fz * 0.55);
            ctx.strokeStyle = this.tint(l, 'pole', [0.3, 0.24, 0.2]); ctx.lineWidth = Math.max(0.7, 0.035 * k); ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
            this.glow(ctx, b[0], b[1], 0.25 * k, [1, 0.8, 0.4], 0.9);
        }
        if (box) this.restore(ctx, l.z, ...box);
    }
    // A reader up on a gallery: behind the gallery's rail (drawn again over them), the front of the gallery hiding their feet.
    drawBrowser(ctx, b, s, dt) {
        const cam = this.cam, R = ReadingLogic.ROOM, G = R.gal[b.gal], xr = b.side * (G.gx + 0.06), zf = b.z * Math.abs(xr / b.x);
        const clipY = cam.p(b.side * G.gx, G.y1, b.z * G.gx / Math.abs(b.x))[1];
        const box = this.drawWalker(ctx, b, b.coat, ReadingCast.SKIN, b.hair, ReadingCast.LEGS, clipY);
        if (!box) return;
        const [x0, , w] = box, ms = cam.mpx(zf);
        ctx.strokeStyle = this.tint(b, 'iron', [0.09, 0.08, 0.08]); ctx.lineWidth = Math.max(0.6, 0.028 * ms); ctx.beginPath();
        for (let z = Math.round(zf / 0.24) * 0.24 - 1.2; z < zf + 1.2; z += 0.24) { const [ax, ay] = cam.p(xr, G.y1, z), [, ty] = cam.p(xr, G.y1 + R.rail, z); if (ax > x0 - 4 && ax < x0 + w + 4) { ctx.moveTo(ax, ay); ctx.lineTo(ax, ty); } }
        ctx.stroke();
        ctx.strokeStyle = this.tint(b, 'gilt', [0.88, 0.67, 0.27]); ctx.lineWidth = Math.max(0.7, 0.07 * ms); ctx.beginPath(); ctx.moveTo(...cam.p(xr, G.y1 + R.rail, zf - 1.2)); ctx.lineTo(...cam.p(xr, G.y1 + R.rail, zf + 1.2)); ctx.stroke();
    }

    drawPlane(ctx, p, s) {
        const cam = this.cam, [px, py] = cam.p(p.x, p.y, p.z), k = s * 0.32;
        ctx.save(); ctx.translate(px, py); ctx.scale(p.dir, 1); ctx.rotate(-p.vy * 0.3);
        const l = this.m.light, v = Math.min(1, 0.3 + l.amb[0] * 1.6 + l.dark * 0.25);
        ctx.fillStyle = `rgba(${246 * v | 0},${240 * v | 0},${226 * v | 0},0.95)`;
        ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(-k, -k * 0.35 * (1 + (p.bank || 0))); ctx.lineTo(-k * 0.6, 0); ctx.lineTo(-k, k * 0.25); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(120,110,100,0.6)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(-k * 0.6, 0); ctx.stroke();
        ctx.restore();
    }
    drawBook(ctx, b, s, flying) {
        if (b.x === undefined) return;
        const cam = this.cam, [px, py] = cam.p(b.x, b.y, b.z), k = s * 0.14;
        ctx.save(); ctx.translate(px, py); ctx.rotate(b.rot || 0);
        const c = b.c || [0.5, 0.12, 0.1];
        ctx.fillStyle = `rgb(${c[0] * 200 | 0},${c[1] * 200 | 0},${c[2] * 200 | 0})`;
        if (flying) {
            // Open, its covers beating like wings.
            const f = Math.sin(b.flap) * 0.6;
            for (const sd of [-1, 1]) { ctx.save(); ctx.scale(sd, 1); ctx.rotate(f * 0.5); ctx.fillRect(0, -k * 0.6, k * 1.1, k * 1.2); ctx.fillStyle = 'rgba(245,238,220,0.95)'; ctx.fillRect(0, -k * 0.5, k * 0.95, k); ctx.restore(); ctx.fillStyle = `rgb(${c[0] * 200 | 0},${c[1] * 200 | 0},${c[2] * 200 | 0})`; }
            this.glow(ctx, 0, 0, k * 4, [1, 0.9, 0.6], 0.25);
        } else { ctx.fillRect(-k, -k * 0.35, k * 2, k * 0.7); ctx.fillStyle = 'rgba(235,225,200,0.9)'; ctx.fillRect(-k * 0.9, -k * 0.2, k * 1.8, k * 0.12); }
        ctx.restore();
    }
    drawLadder(ctx) {
        const lad = this.ladder, cam = this.cam, R = ReadingLogic.ROOM;
        if (!lad) return;
        const xb = lad.side * (R.hw - 1.05), xt = lad.side * (R.hw - 0.12), z = lad.z, s = cam.mpx(z), l = this.m.light;
        const v = Math.min(1, 0.25 + l.amb[0] * 1.4 + l.keyB[0] * 0.5 + l.dark * 0.15);
        ctx.strokeStyle = `rgb(${158 * v | 0},${112 * v | 0},${70 * v | 0})`; ctx.lineWidth = Math.max(0.8, 0.05 * s);
        ctx.beginPath();
        for (const dz of [-0.24, 0.24]) { const a = cam.p(xb, 0, z + dz), b = cam.p(xt, 5.2, z + dz); ctx.moveTo(...a); ctx.lineTo(...b); }
        for (let i = 1; i < 16; i++) { const t = i / 16, a = cam.p(xb + (xt - xb) * t, 5.2 * t, z - 0.24), b = cam.p(xb + (xt - xb) * t, 5.2 * t, z + 0.24); ctx.moveTo(...a); ctx.lineTo(...b); }
        ctx.stroke();
    }
    drawFire(ctx) {
        const F = this.T.spots.fire, lv = F.group.level, t = this.m.time;
        if (lv < 0.03) return;
        const [px, py] = F.px, s = F.s, flick = 0.55 + 0.25 * Math.sin(t * 11) + 0.2 * Math.sin(t * 23 + 1);
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 8; i++) {
            const kx = ((i % 4) / 3 - 0.5), inner = i >= 4, h = (0.55 + 0.32 * Math.sin(t * (7 + i * 1.7) + i * 2)) * s * lv * (inner ? 0.62 : 1) * 0.9, w = (inner ? 0.07 : 0.13) * s;
            const x = px - kx * 0.6 * s * 0.25, base = py, tip = x + Math.sin(t * 9 + i) * 0.06 * s;
            ctx.fillStyle = inner ? 'rgba(255,232,130,0.6)' : 'rgba(255,128,36,0.45)';
            ctx.beginPath(); ctx.moveTo(x - w, base); ctx.quadraticCurveTo(x - w * 1.5, base - h * 0.45, tip, base - h); ctx.quadraticCurveTo(x + w * 1.5, base - h * 0.45, x + w, base); ctx.quadraticCurveTo(x, base + w * 0.9, x - w, base); ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
        this.glow(ctx, px, py - 0.4 * s, 1.6 * s, [1, 0.56, 0.22], 0.45 * flick * lv);
    }
    owlZ() { const o = this.owl, c = this.L.chandeliers[o.k]; return o.fly ? c.z + Math.sin(o.fly.t / o.fly.dur * Math.PI * 2) * 18 : c.z; }
    drawOwl(ctx) {
        const o = this.owl, c = this.L.chandeliers[o.k], cam = this.cam, l = this.m.light;
        let x = c.x + 0.9, y = c.y + 0.12, z = c.z, flying = false;
        if (o.fly) { const u = o.fly.t / o.fly.dur, a = u * Math.PI * 2; x = c.x + 0.9 + Math.sin(a) * 6 * o.fly.dir; z = c.z + Math.sin(a) * 18 * 0 + (1 - Math.cos(a)) * 16; y = c.y + 0.12 + Math.sin(a) * 3.5; flying = u > 0.03 && u < 0.97; }
        const s = cam.mpx(z), [px, py] = cam.p(x, y, z), k = s;
        const v = Math.min(1, 0.22 + l.amb[0] * 1.3 + l.dark * 0.3 + (this.T.groups.find(g => g.kind === 'chandelier' && g.k === o.k)?.level || 0) * 0.4);
        const body = `rgb(${150 * v | 0},${118 * v | 0},${84 * v | 0})`, face = `rgb(${232 * v | 0},${218 * v | 0},${190 * v | 0})`;
        ctx.save(); ctx.translate(px, py); ctx.scale(k, -k);
        if (flying) {
            const f = Math.sin(this.m.time * 7) * 0.5;
            ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(0, 0.12, 0.14, 0.1, 0, 0, 6.2832); ctx.fill();
            for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0, 0.14); ctx.quadraticCurveTo(sd * 0.3, 0.3 + f * 0.3, sd * 0.55, 0.12 + f * 0.4); ctx.quadraticCurveTo(sd * 0.3, 0.1, 0, 0.1); ctx.fill(); }
        } else {
            ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(0, 0.18, 0.12, 0.17, 0, 0, 6.2832); ctx.fill();
            ctx.save(); ctx.translate(0, 0.36); ctx.scale(Math.cos(o.head) * 0.8 + 0.2, 1);
            ctx.fillStyle = body; ctx.beginPath(); ctx.arc(0, 0, 0.11, 0, 6.2832); ctx.fill();
            ctx.beginPath(); ctx.moveTo(-0.09, 0.06); ctx.lineTo(-0.08, 0.15); ctx.lineTo(-0.03, 0.08); ctx.moveTo(0.09, 0.06); ctx.lineTo(0.08, 0.15); ctx.lineTo(0.03, 0.08); ctx.fill();
            ctx.fillStyle = face; ctx.beginPath(); ctx.arc(-0.045, 0, 0.045, 0, 6.2832); ctx.arc(0.045, 0, 0.045, 0, 6.2832); ctx.fill();
            if (o.blink <= 0) { ctx.fillStyle = l.dark > 0.5 ? '#ffd040' : '#2a2018'; ctx.beginPath(); ctx.arc(-0.045, 0, 0.02, 0, 6.2832); ctx.arc(0.045, 0, 0.02, 0, 6.2832); ctx.fill(); }
            ctx.restore();
        }
        ctx.restore();
        if (o.hoot > 0 && !o._hooted) { o._hooted = true; this.notes.push({ x: px + 10 * cam.u, y: py - 14 * cam.u, ch: 'hoo', age: 0 }); } else if (o.hoot <= 0) o._hooted = false;
    }

    // Over everything: dust from a fallen book, sparkles from flying ones, words, and a bird past the glass.
    drawOver(ctx) {
        const cam = this.cam, u = cam.u;
        for (const p of this.puffs) { const [x, y] = cam.p(p.x, p.y, p.z), t = p.age / p.life; ctx.globalAlpha = 0.5 * (1 - t); ctx.fillStyle = '#e8dcc4'; ctx.beginPath(); ctx.arc(x, y, (1 + t * 3) * u * cam.mpx(p.z) / 30, 0, 6.2832); ctx.fill(); }
        ctx.globalCompositeOperation = 'lighter';
        for (const p of this.sparkles) { const [x, y] = cam.p(p.x, p.y, p.z), t = p.age / p.life; ctx.globalAlpha = (1 - t) * 0.9; ctx.fillStyle = '#ffe8a0'; ctx.fillRect(x - 1, y - 1, 2 * u, 2 * u); }
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        if (this.notes.length) {
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            for (const n of this.notes) { ctx.globalAlpha = Math.min(1, n.age * 4) * Math.max(0, 1 - n.age / 2.6); ctx.font = `${Math.round((n.ch === 'z' ? 12 : n.ch.length > 2 ? 14 : 17) * u)}px Georgia, serif`; ctx.fillStyle = n.ch === '♥' ? '#ff7a8a' : '#fff4d6'; ctx.fillText(n.ch, n.x, n.y); }
            ctx.globalAlpha = 1;
        }
        if (this.boom > 0 && this.T.spots.clock) { const c = this.T.spots.clock; ctx.globalAlpha = this.boom / 0.6 * 0.8; ctx.font = `italic ${Math.round(15 * u)}px Georgia, serif`; ctx.textAlign = 'center'; ctx.fillStyle = '#fff1cc'; ctx.fillText('bong', c.x, c.y - c.r * 2.2 - (0.6 - this.boom) * 30 * u); ctx.globalAlpha = 1; }
        if (this.birdA && this.m.glass) { const b = this.birdA; ctx.save(); ctx.clip(this.m.glass); ctx.strokeStyle = 'rgba(30,26,34,0.85)'; ctx.lineWidth = 1.6 * u; const x = b.x + b.t * 120 * u, y = b.y - Math.sin(b.t * 2) * 10 * u, f = Math.sin(b.t * 18) * 4 * u; ctx.beginPath(); ctx.moveTo(x - 8 * u, y - f); ctx.quadraticCurveTo(x - 3 * u, y, x, y + 1); ctx.quadraticCurveTo(x + 3 * u, y, x + 8 * u, y - f); ctx.stroke(); ctx.restore(); }
    }
}
// The library's cats: their names, and coats (c), darker markings and tails (d), and a white bib for some (w).
ReadingCast.keys = 0;
ReadingCast.SKIN = [0.9, 0.72, 0.6]; ReadingCast.SKIN_L = [0.92, 0.76, 0.66]; ReadingCast.HAIR_L = [0.78, 0.78, 0.8]; ReadingCast.LEGS = [0.15, 0.13, 0.17];
ReadingCast.BOOK_A = [0.5, 0.14, 0.12]; ReadingCast.BOOK_B = [0.2, 0.3, 0.5]; ReadingCast.BOOK_C = [0.24, 0.3, 0.14];
ReadingCast.NAMES = ['Footnote', 'Marginalia', 'Quarto', 'Ibid', 'Vellum', 'Dewey', 'Colophon', 'Errata', 'Folio', 'Octavo', 'Codex', 'Index'];
ReadingCast.COATS = [{ c: [0.86, 0.52, 0.22], d: [0.6, 0.3, 0.1], s: true }, { c: [0.12, 0.11, 0.13], d: [0.07, 0.07, 0.09], w: [0.94, 0.93, 0.9] }, { c: [0.56, 0.5, 0.44], d: [0.3, 0.25, 0.22], s: true },
    { c: [0.9, 0.88, 0.84], d: [0.62, 0.58, 0.55] }, { c: [0.34, 0.3, 0.3], d: [0.18, 0.16, 0.16], w: [0.9, 0.88, 0.84] }, { c: [0.78, 0.66, 0.5], d: [0.4, 0.3, 0.22], s: true },
    { c: [0.12, 0.11, 0.13], d: [0.06, 0.06, 0.07] }, { c: [0.7, 0.42, 0.22], d: [0.3, 0.2, 0.14], w: [0.94, 0.92, 0.88] }, { c: [0.58, 0.58, 0.62], d: [0.36, 0.36, 0.4] }];
ReadingCast.COATS_P = [[0.5, 0.16, 0.16], [0.2, 0.26, 0.46], [0.2, 0.36, 0.3], [0.48, 0.2, 0.36], [0.34, 0.22, 0.16], [0.7, 0.55, 0.3], [0.24, 0.24, 0.28], [0.62, 0.3, 0.14], [0.82, 0.78, 0.68]];
ReadingCast.HAIR = [[0.18, 0.12, 0.08], [0.42, 0.26, 0.12], [0.08, 0.07, 0.07], [0.72, 0.56, 0.3], [0.5, 0.2, 0.08], [0.6, 0.6, 0.62]];
ReadingCast.SCARVES = [[0.82, 0.2, 0.2], [0.2, 0.42, 0.3], [0.9, 0.86, 0.5], [0.3, 0.4, 0.74]];
