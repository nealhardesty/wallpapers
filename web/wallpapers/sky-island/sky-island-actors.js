// Sky Island's inhabitants: the townsfolk and their day, the cats (the
// owner's, each with a temperament, and strays), the dogs, the wildlife,
// and the islands that drift past with their waving residents and the
// balloon that ferries one over. Everything lives in island pixels (x
// across the island, y down from the plateau's back line) and pushes what
// it draws into the manager's list, sorted by where it stands.

const SkyIslandActors = (() => {
    const A = SkyIslandArt, L = SkyIslandLogic;
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const SPEECH = {
        heart: A.rows(['.P.P.', 'PPPPP', '.PPP.', '..P..'], { P: '#f05a8a' }, false, 2),
        note: A.rows(['..W.', '..W.', '.WW.', 'WW..'], { W: '#f8f8f8' }, false, 1),
        bang: A.rows(['.Y.', '.Y.', '.Y.', '...', '.Y.'], { Y: '#ffe070' }, false, 1),
        zz: A.rows(['WWW', '.W.', 'WWW'], { W: '#c8d0e8' }, false, 1),
        meow: A.rows(['WW.WW', 'W.W.W', 'W...W'], { W: '#f8f8f8' }, false, 2),
        fish: A.rows(['.BBB', 'BBBW', '.BBB'], { B: '#8fd0f0', W: '#4fa0d8' }, false, 2),
    };

    // ---- Walking ------------------------------------------------------------------------------------

    // Something that walks: along waypoints at a speed, facing the way it goes.
    class Mover {
        constructor(x, y) { this.x = x; this.y = y; this.path = []; this.dir = -1; this.moving = false; this.speed = 10; }
        goTo(points) { this.path = points.slice(); this.moving = this.path.length > 0; }
        step(dt) {
            let left = this.speed * dt;
            while (this.moving && left > 0) {
                const t = this.path[0];
                const dx = t.x - this.x, dy = t.y - this.y, d = Math.hypot(dx, dy);
                if (Math.abs(dx) > 0.01) this.dir = dx < 0 ? -1 : 1;
                if (d <= left) { this.x = t.x; this.y = t.y; left -= d; this.path.shift(); if (!this.path.length) { this.moving = false; this.onArrive?.(); } }
                else { this.x += dx / d * left; this.y += dy / d * left; left = 0; }
            }
        }
        at(p) { return !this.moving && Math.abs(this.x - p.x) < 0.5 && Math.abs(this.y - p.y) < 0.5; }
    }

    // ---- The townsfolk -------------------------------------------------------------------------------

    class Townsfolk {
        constructor(M) { this.M = M; this.people = []; this.ladder = A.ladder(10); this.ball = null; this.events = []; this.stats = { fish: 0, stolen: 0, roofs: 0, washed: 0 }; }

        build(count) {
            const M = this.M, I = M.I, rand = M.rand;
            const roles = rand.shuffle(L.ROLES);
            const homes = I.houses.filter(h => h.kind !== 'chapel');
            this.people = [];
            for (let i = 0; i < count; i++) {
                const role = roles[i % roles.length];
                const home = homes[i % homes.length] || I.houses[0];
                const spec = { skin: rand.pick(A.SKIN), hair: rand.pick(A.HAIR), top: rand.pick(A.CLOTH), pants: rand.pick(A.PANTS) };
                const p = new Mover(home.x + Math.floor(home.w / 2), home.base + 1);
                Object.assign(p, { id: i, role, home, spec, art: A.person(spec), hatName: role === 'baker' ? 'chef' : role === 'farmer' ? 'straw' : role === 'kid' && rand.chance(0.5) ? 'cap' : role === 'watch' ? 'beanie' : null,
                    inside: true, plan: null, act: 'idle', actT: 0, frame: 0, bubble: null, bubbleT: 0, wave: 0, speed: role === 'kid' ? 14 : 9 + rand() * 3, kid: role === 'kid', idleT: rand() * 4, flip: rand.chance(0.5), umbrella: false, jobHouse: null, partner: null });
                p.hat = p.hatName ? { l: A.hat(p.hatName, false), r: A.hat(p.hatName, true) } : null;
                this.people.push(p);
            }
            // Strollers pair up for the evening bench.
            const strollers = this.people.filter(p => p.role === 'stroller');
            for (let i = 0; i + 1 < strollers.length; i += 2) { strollers[i].partner = strollers[i + 1]; strollers[i + 1].partner = strollers[i]; }
            this.ball = null;
        }

        // Keep the crowd at `count`: newcomers come out of their doors, extras go home and stay.
        resize(count) {
            if (count > this.people.length) { const keep = this.people; this.build(count); this.people.splice(0, keep.length, ...keep); }
            else for (const p of this.people.slice(count)) p.retired = true;
            this.people = this.people.filter(p => !(p.retired && p.inside));
        }

        spotFor(p, plan) {
            const M = this.M, I = M.I, S = I.spots;
            switch (plan.spot) {
                case 'home': return { x: p.home.x + Math.floor(p.home.w / 2), y: p.home.base + 1 };
                case 'bakery': { const b = I.houses.find(h => h.shop === 'bakery') || p.home; return { x: b.x + Math.floor(b.w / 2) + 3, y: b.base + 1 }; }
                case 'fishing': return S.fishing;
                case 'field': return S.field;
                case 'meadow': return M.frozen && p.kid ? { x: I.lake.x, y: I.lake.y } : S.meadow;
                case 'square': return { x: S.square.x + Math.round((M.rand() - 0.5) * 14), y: S.square.y + Math.round((M.rand() - 0.5) * 4) };
                case 'doors': { const h = I.houses[(p.round = ((p.round ?? -1) + 1)) % I.houses.length]; return { x: h.x + Math.floor(h.w / 2), y: h.base + 1 }; }
                case 'garden': { const h = I.houses[(p.id * 3) % I.houses.length]; return { x: Math.max(2, h.x - 2), y: h.base + 1 }; }
                case 'roof': { p.jobHouse = I.houses[(p.id + Math.floor(M.time / 600)) % I.houses.length]; return { x: p.jobHouse.x + p.jobHouse.w + 2, y: p.jobHouse.base + 1 }; }
                case 'stall': return I.stall ? { x: I.stall.x, y: I.stall.base - 1 } : S.square;
                case 'edge': return (p.id + Math.floor(M.time / 90)) % 2 ? S.edgeL : S.edgeR;
                case 'bench': { const b = p.partner ? (p.id < p.partner.id ? S.bench0 : { x: S.bench0.x + 2, y: S.bench0.y }) : (p.id % 2 ? S.bench1 : S.bench0); return { x: b.x + (p.partner ? 0 : (p.id % 3) - 1), y: b.y }; }
                default: { // the street: somewhere along one, in town
                    const y = M.rand.pick(I.streets); return { x: Math.round(I.town.l + M.rand() * (I.town.r - I.town.l)), y };
                }
            }
        }

        update(dt) {
            const M = this.M, I = M.I, hour = M.hour;
            for (const p of this.people) {
                const plan = p.retired ? { what: 'sleep', spot: 'home' } : L.planFor(p.role, hour, M.holiday);
                // A new plan: set off for its spot (coming out of the door if inside).
                if (!p.plan || p.plan.what !== plan.what || p.plan.spot !== plan.spot || (plan.spot === 'street' && !p.moving && p.idleT <= 0) || (plan.spot === 'doors' && !p.moving && p.idleT <= 0) || (plan.spot === 'edge' && !p.moving && p.idleT <= 0)) {
                    p.plan = plan;
                    const target = this.spotFor(p, plan);
                    if (p.inside) { p.x = p.home.x + Math.floor(p.home.w / 2); p.y = p.home.base + 1; if (plan.spot !== 'home') p.inside = false; }
                    if (!p.inside) { p.goTo(M.route({ x: p.x, y: p.y }, target)); p.target = target; p.act = 'walk'; }
                    p.idleT = 2 + M.rand() * 6;
                    p.onArrive = () => this.arrive(p);
                }
                if (p.inside) continue;
                p.umbrella = M.weather.rain > 0.2 && p.act !== 'sit';
                p.frame += dt;
                p.idleT -= dt;
                if (p.bubbleT > 0) p.bubbleT -= dt;
                if (p.wave > 0) p.wave -= dt;
                if (p.moving) { p.speed = (p.kid ? 14 : 10) * (M.frozen && plan.spot === 'meadow' && p.kid && p.act === 'skate' ? 2 : 1); p.step(dt); continue; }
                // At the spot: do the thing.
                p.actT += dt;
                if (p.act === 'play' && p.kid) this.kidPlay(p, dt);
                if (p.act === 'skate') { if (p.idleT <= 0) { p.goTo([{ x: I.lake.x + Math.round((M.rand() - 0.5) * I.lake.rx * 1.4), y: I.lake.y + Math.round((M.rand() - 0.5) * I.lake.ry) }]); p.idleT = 0.5 + M.rand(); } }
                if (p.act === 'fish' && p.actT > 20 + M.rand() * 30) { p.actT = 0; this.catchFish(p); }
                if (p.act === 'rounds' && p.idleT <= 0) { p.plan = null; }
                if (p.act === 'roof' && p.actT > 40 && M.rand() < dt * 0.05) { p.actT = 0; this.stats.roofs++; p.plan = null; }
                if (p.act === 'lunch' && p.idleT <= 0 && M.rand() < 0.3) { p.goTo([this.spotFor(p, { spot: 'square' })]); p.idleT = 4 + M.rand() * 6; }
                if (p.act === 'party' && p.idleT <= 0) { p.goTo([this.spotFor(p, { spot: 'square' })]); p.idleT = 2 + M.rand() * 4; }
                if (p.act === 'stroll' && p.idleT <= 0) p.plan = null;
                if (p.act === 'walk' && p.plan.spot === 'edge' && p.idleT <= 0) p.plan = null;
            }
            this.events = this.events.filter(e => (e.t -= dt) > 0);
        }

        arrive(p) {
            const M = this.M, plan = p.plan;
            if (plan.spot === 'home') { p.inside = true; p.act = 'sleep'; return; }
            p.act = plan.what;
            p.actT = 0;
            if (plan.spot === 'meadow' && p.kid && M.frozen) p.act = 'skate';
            if (plan.spot === 'bench' || plan.what === 'evening') p.act = 'sit';
            if (plan.what === 'lunch') p.act = M.rand.chance(0.4) ? 'sit' : 'lunch';
            if (plan.spot === 'doors') { p.act = 'rounds'; p.idleT = 1.2; }
            if (plan.spot === 'street' || plan.spot === 'edge') { p.act = 'stroll'; p.idleT = 3 + M.rand() * 8; }
            if (plan.spot === 'field') p.dir = -1;
            if (plan.what === 'roof') { p.act = 'roof'; p.dir = p.x > p.jobHouse.x + p.jobHouse.w / 2 ? -1 : 1; }
        }

        // Kids at play: a ball kicked between two of them, or kites in a wind.
        kidPlay(p, dt) {
            const M = this.M;
            const kids = this.people.filter(k => k.kid && !k.inside && k.act === 'play' && k !== p && dist(k, p) < 30);
            if (M.weather.wind > 0.45 && !M.weather.rain) { p.kite = true; return; }
            p.kite = false;
            if (!kids.length) { if (p.idleT <= 0) { p.goTo([{ x: p.x + Math.round((M.rand() - 0.5) * 12), y: p.y }]); p.idleT = 1 + M.rand() * 2; } return; }
            const other = kids[0];
            if (!this.ball || this.ball.t > 4) this.ball = { x: p.x, y: p.y, from: p, to: other, t: 0 };
            const b = this.ball;
            b.t += dt;
            const k = Math.min(1, b.t / 1.2);
            b.x = b.from.x + (b.to.x - b.from.x) * k; b.y = b.from.y + (b.to.y - b.from.y) * k;
            b.lift = Math.sin(k * Math.PI) * 5;
            if (k >= 1) { b.from = b.to; b.to = b.to === p ? other : p; b.t = 0; b.from.frame = 0; }
        }

        catchFish(p) {
            this.stats.fish++;
            p.bubble = 'fish'; p.bubbleT = 3;
            this.M.onFish?.(p);
        }

        // Everyone outdoors turns and waves at something passing (a visitor, a tap).
        waveAt(x, seconds = 3) {
            for (const p of this.people) if (!p.inside && this.M.rand.chance(0.6)) { p.wave = seconds; p.dir = x < p.x ? -1 : 1; }
        }
        near(x, y, r) { let best = null; for (const p of this.people) if (!p.inside) { const d = Math.hypot(p.x - x, p.y - y); if (d < r && (!best || d < best.d)) best = { p, d }; } return best?.p; }

        draw(list) {
            const M = this.M, t = M.time;
            for (const p of this.people) {
                if (p.inside) continue;
                const face = p.dir < 0 ? 'l' : 'r';
                let frame;
                if (p.wave > 0) frame = p.art[Math.floor(t * 6) % 2 ? 'wave0' : 'wave1'][face];
                else if (p.moving) frame = p.art[Math.floor(p.frame * 7) % 2 ? 'walk0' : 'walk1'][face];
                else if (p.act === 'sit') frame = p.art.sit[face];
                else if (p.act === 'party') frame = p.art[Math.floor(t * 4 + p.id) % 2 ? 'jump' : 'stand'][face];
                else if (['hoe', 'roof', 'water', 'play', 'rounds'].includes(p.act) && p.role !== 'kid') frame = p.art[Math.floor(t * 3 + p.id) % 2 ? 'work0' : 'work1'][face];
                else if (p.act === 'play' && p.role === 'musician') frame = p.art[Math.floor(t * 5) % 2 ? 'work0' : 'work1'][face];
                else frame = p.art.stand[face];
                const onRoof = p.act === 'roof' && p.jobHouse;
                const x = Math.round(p.x), y = onRoof ? p.jobHouse.base - p.jobHouse.h + 1 + M.houseArt(p.jobHouse).eaves : Math.round(p.y);
                const sortY = onRoof ? p.jobHouse.base + 0.5 : p.y + (p.act === 'sit' ? 1 : 0);
                const lift = p.act === 'party' && Math.floor(t * 4 + p.id) % 2 ? -2 : 0;
                list.push({ y: sortY, draw: g => {
                    if (onRoof) { const lad = this.ladder; g.drawImage(lad.c, p.jobHouse.x + (p.dir < 0 ? p.jobHouse.w : -3), p.jobHouse.base - lad.h + 1); }
                    g.drawImage(frame.c, x - frame.ax, y - frame.h + 1 + lift);
                    const hat = M.holidayHat(p) || p.hat;
                    if (hat) { const hs = hat[face]; g.drawImage(hs.c, x - hs.ax, y - frame.h + 1 + lift - hs.h + 1); }
                    const tool = this.toolFor(p);
                    if (tool) { const ts = tool[face]; g.drawImage(ts.c, x + (p.dir < 0 ? -ts.w - 1 : 2), y - frame.h + 3 + lift); }
                    if (p.umbrella) { const u = A.TOOLS.umbrella[face]; g.drawImage(u.c, x - u.ax, y - frame.h - 3); }
                    if (p.kite) { const k = A.TOOLS.kite.l; const kx = x + (p.dir < 0 ? -10 : 10) + Math.round(Math.sin(t * 2 + p.id) * 2), ky = y - frame.h - 10 - Math.round(Math.cos(t * 1.3 + p.id) * 2); g.strokeStyle = '#3a3a3a'; g.beginPath(); g.moveTo(x + 0.5, y - 4); g.lineTo(kx + 0.5, ky + 4); g.stroke(); g.drawImage(k.c, kx - k.ax, ky - k.h + 1); }
                    if (p.bubbleT > 0 && p.bubble) { const b = SPEECH[p.bubble]; g.drawImage(b.c, x - b.ax, y - frame.h - b.h - 1); }
                } });
            }
            if (this.ball && this.ball.from.act === 'play' && !this.ball.from.inside) { const b = this.ball, s = A.TOOLS.ball.l; list.push({ y: b.y + 0.1, draw: g => g.drawImage(s.c, Math.round(b.x) - 1, Math.round(b.y) - 2 - Math.round(b.lift || 0)) }); }
        }
        toolFor(p) {
            const T = A.TOOLS;
            if (p.act === 'fish') return T.rod;
            if (p.act === 'hoe') return T.hoe;
            if (p.act === 'roof') return T.hammer;
            if (p.act === 'water') return T.can;
            if (p.act === 'patrol' || (p.role === 'watch' && this.M.dark > 0.5 && !p.inside)) return T.lantern;
            if (p.role === 'mail' && !p.inside && p.act !== 'sit') return T.satchel;
            if (p.role === 'musician' && p.act === 'play') return T.fiddle;
            if (p.role === 'merchant' && p.act === 'sell') return T.basket;
            if (p.act === 'skate') return T.skates;
            return null;
        }
    }

    // ---- The cats ---------------------------------------------------------------------------------

    class Cats {
        constructor(M) { this.M = M; this.cats = []; this.stats = { zoomies: 0, pots: 0, thefts: 0, taps: 0 }; this.pots = []; }

        build(ids, strays) {
            const M = this.M, rand = M.rand;
            this.cats = [];
            for (const id of ids) { const spec = A.ROSTER.find(r => r.id === id); if (spec) this.add(spec); }
            for (let i = 0; i < strays; i++) this.add({ ...rand.pick(A.STRAY_COATS), id: `stray${i}`, name: 'a stray', eyes: rand.pick(['#6ab04a', '#f0d050', '#e0a030']), stray: true });
        }
        add(spec) {
            const M = this.M, I = M.I, rand = M.rand;
            const c = new Mover(I.square.x + rand.int(-8, 8), I.square.y + rand.int(-2, 2));
            Object.assign(c, { spec, art: A.cat(spec), state: 'sit', t: 0, until: 1 + rand() * 5, frame: 0, perch: null, bubble: null, bubbleT: 0, carrying: null, speed: 12, flee: 0 });
            c.dir = rand.chance(0.5) ? -1 : 1;
            this.cats.push(c);
            return c;
        }
        resize(ids, strays) {
            const want = [...ids];
            this.cats = this.cats.filter(c => c.spec.stray || want.includes(c.spec.id));
            for (const id of want) if (!this.cats.some(c => c.spec.id === id)) { const spec = A.ROSTER.find(r => r.id === id); if (spec) this.add(spec); }
            const have = this.cats.filter(c => c.spec.stray);
            for (let i = have.length; i < strays; i++) this.add({ ...this.M.rand.pick(A.STRAY_COATS), id: `stray${i}`, name: 'a stray', eyes: '#6ab04a', stray: true });
            if (have.length > strays) this.cats = this.cats.filter(c => !c.spec.stray || have.indexOf(c) < strays);
        }

        // Where a cat of this temperament likes to be: a perch (a sill, a
        // roof, the dock, a bench, the well) or a patch of ground.
        pickSpot(c) {
            const M = this.M, I = M.I, rand = M.rand, S = I.spots, sp = c.spec;
            const houses = I.houses;
            const sill = () => { const h = rand.pick(houses), art = M.houseArt(h); const s = art.sills.length ? rand.pick(art.sills) : null; return s ? { x: h.x + s.x, y: h.base + 0.3, drawY: h.base - art.h + 1 + s.y, kind: 'sill', house: h } : null; };
            const roof = () => { const h = rand.pick(houses), art = M.houseArt(h); return { x: h.x + 2 + rand.int(0, Math.max(0, h.w - 5)), y: h.base + 0.4, drawY: h.base - art.h + 1 + art.eaves, kind: 'roof', house: h }; };
            const ground = () => ({ x: rand.int(Math.max(3, I.town.l - 20), Math.min(I.w - 3, I.town.r + 20)), y: rand.pick(I.streets) + rand.int(0, 2), kind: 'ground' });
            const dockSpot = () => ({ x: I.dock.x, y: I.dock.y + rand.int(1, I.dock.len - 1), kind: 'dock' });
            const benchSpot = () => { const b = rand.pick(I.benches); return { x: b.x + rand.int(-2, 2), y: b.y + 1.2, drawY: b.y - 1, kind: 'bench' }; };
            const wellSpot = () => ({ x: I.well.x, y: I.well.y + 0.2, drawY: I.well.y - 6, kind: 'well' });
            const fieldSpot = () => I.fields.length ? { x: I.fields[0].x + rand.int(1, I.fields[0].w - 2), y: I.fields[0].y - 0.5, kind: 'field' } : ground();
            const treeSpot = () => { const t = rand.pick(I.trees); return { x: t.x + rand.pick([-3, 3]), y: t.y + 0.5, kind: 'tree' }; };
            const lampSpot = () => { const l = rand.pick(I.lamps); return { x: l.x + rand.pick([-2, 2]), y: l.y + 1, kind: 'lamp' }; };
            const nearPerson = () => { const p = rand.pick(M.folk.people.filter(p => !p.inside)); return p ? { x: p.x + rand.pick([-4, 4]), y: p.y, kind: 'person', person: p } : ground(); };
            if (M.dark > 0.7 && rand.chance(0.5)) return sill() || ground();
            if (sp.sleepy) return rand.chance(0.7) ? sill() || benchSpot() : benchSpot();
            if (sp.lounges) return rand.chance(0.7) ? dockSpot() : wellSpot();
            if (sp.trouble) return rand.chance(0.6) ? sill() || ground() : lampSpot();
            if (sp.playful) return rand.chance(0.5) ? treeSpot() : ground();
            if (sp.zoomies) return ground();
            if (sp.grin) return rand.chance(0.6) ? treeSpot() : nearPerson();
            if (sp.pattern === 'splotch' && !sp.stray) return rand.chance(0.6) ? fieldSpot() : ground();
            if (sp.id === 'persian') return rand.chance(0.5) ? wellSpot() : roof();
            if (sp.id === 'butters') return rand.chance(0.6) ? nearPerson() : benchSpot();
            return rand.pick([sill, roof, ground, benchSpot, treeSpot, lampSpot, dockSpot])() || ground();
        }

        send(c, spot, state) {
            const M = this.M;
            c.perch = spot;
            c.next = state;
            c.state = 'walk';
            const from = { x: c.x, y: Math.round(c.y) }, to = { x: spot.x, y: Math.round(spot.y) };
            const inTown = x => x >= M.I.town.l - 2 && x <= M.I.town.r + 2;
            c.goTo(inTown(from.x) || inTown(to.x) ? M.route(from, to) : [to]);
            c.onArrive = () => { c.y = spot.y; c.state = c.next; c.t = 0; c.until = this.stay(c); };
        }
        stay(c) { const r = this.M.rand; return c.state === 'sleep' ? 40 + r() * 120 : c.state === 'loaf' ? 20 + r() * 60 : 6 + r() * 20; }
        restState(c) {
            const r = this.M.rand, sp = c.spec;
            if (c.perch?.kind === 'sill' || c.perch?.kind === 'bench') return sp.sleepy || r.chance(0.5) ? 'sleep' : 'loaf';
            if (c.perch?.kind === 'dock' || c.perch?.kind === 'well') return 'loaf';
            if (c.perch?.kind === 'roof') return r.chance(0.5) ? 'loaf' : 'sit';
            return r.chance(0.3) ? 'loaf' : 'sit';
        }

        update(dt) {
            const M = this.M, rand = M.rand;
            for (const c of this.cats) {
                c.t += dt; c.frame += dt;
                if (c.bubbleT > 0) c.bubbleT -= dt;
                if (c.flee > 0) c.flee -= dt;
                if (c.state === 'walk' || c.state === 'run' || c.state === 'zoom') {
                    c.speed = c.state === 'walk' ? 11 : 34;
                    c.step(dt);
                    if (c.state === 'zoom' && !c.moving) { if (c.t < 5) c.goTo([this.openPoint()]); else { c.state = 'sit'; c.t = 0; c.until = 3; } }
                    continue;
                }
                // Resting, until it's time for something else.
                if (c.t < c.until) {
                    if (c.state === 'sit' && c.spec.playful && rand.chance(dt * 0.2)) { const prey = M.wild.nearest(c, ['butterfly', 'bird'], 24); if (prey) { c.state = 'pounce'; c.t = 0; c.until = 0.8; c.dir = prey.x < c.x ? -1 : 1; prey.scare?.(); } }
                    continue;
                }
                // Time's up: stretch, then go somewhere.
                if (c.state !== 'stretch' && c.state !== 'pounce' && rand.chance(0.5)) { c.state = 'stretch'; c.t = 0; c.until = 1.2; continue; }
                if (c.spec.zoomies && rand.chance(0.35)) { this.zoom(c); continue; }
                if (c.spec.trouble && c.perch?.kind === 'sill' && rand.chance(0.5)) { this.knockPot(c); }
                const spot = this.pickSpot(c);
                this.send(c, spot, null);
                const state = this.restState({ perch: spot, spec: c.spec });
                c.next = state;
            }
            this.pots = this.pots.filter(p => { p.t += dt; p.vy += 40 * dt; p.y += p.vy * dt; if (p.y >= p.floor) { if (!p.broken) { p.broken = true; p.t = 0; p.y = p.floor; } return p.t < 4; } return true; });
        }
        openPoint() { const M = this.M, I = M.I, r = M.rand; return { x: r.int(Math.max(4, I.town.l - 10), Math.min(I.w - 4, I.town.r + 10)), y: r.pick(I.streets) + r.int(-1, 2) }; }
        zoom(c) { this.stats.zoomies++; c.state = 'zoom'; c.t = 0; c.perch = null; c.goTo([this.openPoint()]); c.onArrive = null; this.M.callout(`${c.spec.name} has the zoomies`); }
        knockPot(c) {
            const h = c.perch.house; if (!h) return;
            this.stats.pots++;
            this.pots.push({ x: c.x + (c.dir < 0 ? -3 : 3), y: c.perch.drawY, vy: 0, floor: h.base + 1, t: 0, broken: false, sortY: h.base + 0.6 });
            c.bubble = 'bang'; c.bubbleT = 2;
            this.M.callout(`${c.spec.name} has knocked a flowerpot off a sill`);
        }
        // A tap: the nearest awake cat comes over, with a meow.
        call(x, y) {
            let best = null;
            for (const c of this.cats) { const d = Math.hypot(c.x - x, c.y - y); if (!best || d < best.d) best = { c, d }; }
            if (!best) return null;
            const c = best.c;
            this.stats.taps++;
            c.bubble = c.spec.grin ? 'heart' : 'meow'; c.bubbleT = 2.5;
            this.send(c, { x: Math.round(x), y: Math.round(y), kind: 'ground' }, 'sit');
            c.state = c.state === 'sleep' ? 'stretch' : 'walk';
            if (c.state === 'stretch') { c.t = 0; c.until = 1; c.next = 'walk'; c.onArrive = null; const spot = c.perch; c.onArrive = () => { c.state = 'sit'; c.t = 0; c.until = 8; }; c.perch = spot; }
            return c;
        }
        // The fisher's catch is too good to leave: the nearest cat takes it.
        steal(fisher) {
            const M = this.M;
            const awake = this.cats.filter(c => c.state !== 'sleep');
            if (!awake.length || !M.rand.chance(0.5)) return false;
            const c = awake.sort((a, b) => dist(a, fisher) - dist(b, fisher))[0];
            this.stats.thefts++;
            c.state = 'run'; c.perch = null; c.t = 0;
            c.goTo([{ x: fisher.x + (fisher.dir < 0 ? -2 : 2), y: Math.round(fisher.y) }]);
            c.onArrive = () => {
                c.carrying = 'fish'; fisher.bubble = 'bang'; fisher.bubbleT = 3; fisher.wave = 3; M.folk.stats.stolen++;
                M.callout(`${c.spec.name} has made off with the catch`);
                const away = this.pickSpot(c);
                c.goTo([{ x: away.x, y: Math.round(away.y) }]);
                c.onArrive = () => { c.carrying = null; c.perch = away; c.y = away.y; c.state = 'loaf'; c.t = 0; c.until = 30; };
            };
            return true;
        }
        // A dog's attention: run to a sill and sit there, out of reach.
        chased(c) {
            if (c.flee > 0 || c.state === 'sleep') return;
            c.flee = 10;
            const M = this.M, h = M.rand.pick(M.I.houses), art = M.houseArt(h), s = art.sills[0];
            const spot = s ? { x: h.x + s.x, y: h.base + 0.3, drawY: h.base - art.h + 1 + s.y, kind: 'sill', house: h } : this.pickSpot(c);
            this.send(c, spot, 'sit'); c.state = 'run';
        }
        nearest(x, y, r) { let best = null; for (const c of this.cats) { const d = Math.hypot(c.x - x, c.y - y); if (d < r && (!best || d < best.d)) best = { c, d }; } return best?.c; }

        draw(list) {
            const M = this.M, t = M.time;
            for (const c of this.cats) {
                const face = c.dir < 0 ? 'l' : 'r';
                const walking = c.state === 'walk', running = c.state === 'run' || c.state === 'zoom';
                const name = running ? (Math.floor(c.frame * 12) % 2 ? 'run0' : 'run1') : walking ? (Math.floor(c.frame * 8) % 2 ? 'walk0' : 'walk1') : c.state === 'sleep' ? 'sleep' : c.state === 'loaf' ? 'loaf' : c.state === 'stretch' ? 'stretch' : c.state === 'pounce' ? 'pounce' : 'sit';
                const s = c.art[name][face];
                const perched = !c.moving && c.perch?.drawY !== undefined;
                const x = Math.round(c.x), y = perched ? c.perch.drawY : Math.round(c.y);
                list.push({ y: perched ? c.perch.y : c.y + 0.05, draw: g => {
                    g.drawImage(s.c, x - s.ax, y - s.h + 1);
                    const hat = M.catHat();
                    if (hat && c.state !== 'sleep') { const hs = hat[face]; g.drawImage(hs.c, x - s.ax + (face === 'l' ? 0 : s.w - 3) - (face === 'l' ? 1 : 1), y - s.h + 1 - hs.h + 1); }
                    if (c.carrying === 'fish') { const f = SPEECH.fish; g.drawImage(f.c, x + (face === 'l' ? -s.ax - 3 : s.w - s.ax), y - s.h + 2); }
                    if (c.state === 'sleep' && Math.floor(t) % 3 === 0) { const z = SPEECH.zz; g.drawImage(z.c, x - 1, y - s.h - 3); }
                    if (c.bubbleT > 0 && c.bubble) { const b = SPEECH[c.bubble]; g.drawImage(b.c, x - b.ax, y - s.h - b.h); }
                } });
            }
            const pot = this.potArt ||= A.flowerpot();
            for (const p of this.pots) list.push({ y: p.sortY, draw: g => { if (!p.broken) g.drawImage(pot.c, Math.round(p.x) - 1, Math.round(p.y) - 3); else { g.fillStyle = '#c0703a'; g.fillRect(Math.round(p.x) - 2, p.floor - 1, 2, 1); g.fillRect(Math.round(p.x) + 1, p.floor - 1, 2, 1); g.fillStyle = '#5fbf4e'; g.fillRect(Math.round(p.x), p.floor - 1, 1, 1); } } });
        }
    }

    // ---- Dogs --------------------------------------------------------------------------------------

    class Dogs {
        constructor(M) { this.M = M; this.dogs = []; }
        build(n) {
            const M = this.M, rand = M.rand;
            this.dogs = [];
            const owners = rand.shuffle(M.folk.people.filter(p => !p.kid));
            for (let i = 0; i < n; i++) {
                const owner = owners[i % Math.max(1, owners.length)] || M.folk.people[0];
                if (!owner) break;
                const d = new Mover(owner.x, owner.y);
                Object.assign(d, { owner, art: A.dog(rand.pick(A.DOG_COATS)), state: 'sit', frame: 0, t: 0, chase: null, speed: 20, idleT: 0 });
                this.dogs.push(d);
            }
        }
        update(dt) {
            const M = this.M;
            for (const d of this.dogs) {
                d.frame += dt; d.t += dt;
                if (!d.owner || d.owner.inside || d.owner.retired) { d.hidden = true; d.x = d.owner?.x ?? d.x; d.y = d.owner?.y ?? d.y; continue; }
                d.hidden = false;
                // A cat nearby: give chase for a few seconds (a kind one gives up fast).
                if (!d.chase && M.rand.chance(dt * 0.02)) { const cat = M.cats.nearest(d.x, d.y, 26); if (cat && cat.state !== 'sleep' && cat.perch?.kind !== 'sill' && cat.perch?.kind !== 'roof') { d.chase = { cat, t: 0 }; M.cats.chased(cat); } }
                if (d.chase) {
                    d.chase.t += dt;
                    d.state = 'run'; d.speed = 26;
                    d.goTo([{ x: d.chase.cat.x, y: d.chase.cat.y }]); d.step(dt);
                    if (d.chase.t > 4 || dist(d, d.chase.cat) < 3) { d.chase = null; d.state = 'sit'; d.idleT = 3; }
                    continue;
                }
                if (d.idleT > 0) { d.idleT -= dt; continue; }
                const o = d.owner, want = { x: o.x + (o.dir < 0 ? 5 : -5), y: o.y };
                if (dist(d, want) > 8) { d.state = 'walk'; d.speed = 20; d.goTo([{ x: want.x, y: want.y }]); d.step(dt); }
                else if (dist(d, want) > 1.5 && d.moving) { d.step(dt); }
                else { d.moving = false; d.state = o.act === 'sit' || o.act === 'sleep' ? 'lie' : o.moving ? 'walk' : 'sit'; if (o.moving && dist(d, want) > 2) { d.goTo([want]); d.step(dt); } d.dir = o.dir; }
            }
        }
        draw(list) {
            for (const d of this.dogs) {
                if (d.hidden) continue;
                const face = d.dir < 0 ? 'l' : 'r';
                const name = d.state === 'run' ? (Math.floor(d.frame * 12) % 2 ? 'run0' : 'run1') : d.state === 'walk' && d.moving ? (Math.floor(d.frame * 8) % 2 ? 'walk0' : 'walk1') : d.state === 'lie' ? 'lie' : 'sit';
                const s = d.art[name][face], x = Math.round(d.x), y = Math.round(d.y);
                list.push({ y: d.y + 0.02, draw: g => g.drawImage(s.c, x - s.ax, y - s.h + 1) });
            }
        }
    }

    // ---- Wildlife ----------------------------------------------------------------------------------

    class Wildlife {
        constructor(M) { this.M = M; this.things = []; this.sky = []; this.art = { bird: A.BIRD_COATS.map(A.bird), butterfly: A.BUTTERFLY.map(A.butterfly), rabbit: A.rabbit(false), rabbitW: A.rabbit(true), deer: [A.deer(false), A.deer(true)], fox: A.fox(), goat: A.goat(), duck: [A.duck(false), A.duck(true)], fish: A.fish(), owl: A.owl(), ghost: A.ghost(), bat: A.bat(), goose: A.goose(), dragon: A.dragon() }; this.stats = { jumps: 0, flocks: 0 }; this.dragon = { t: 0, state: 'asleep', until: 20 }; }

        build(amount) {
            const M = this.M, I = M.I, rand = M.rand, q = amount * (M.quality?.density ?? 1);
            this.things = [];
            const n = k => Math.round(k * q);
            const slope = I.mountain;
            for (let i = 0; i < n(5); i++) this.things.push(this.bird());
            for (let i = 0; i < n(2); i++) this.things.push({ kind: 'rabbit', x: I.spots.meadow.x + rand.int(-8, 8), y: I.spots.meadow.y + rand.int(-2, 2), t: rand() * 3, state: 'sit', dir: rand.pick([-1, 1]) });
            for (let i = 0; i < n(1.5); i++) this.things.push({ kind: 'deer', antlers: i === 0, x: slope.x + rand.int(-slope.w / 2, slope.w / 2), y: slope.y + 2 + rand.int(0, 3), t: rand() * 5, state: 'graze', dir: rand.pick([-1, 1]), home: { x: slope.x, y: slope.y + 3 } });
            for (let i = 0; i < n(2); i++) this.things.push({ kind: 'goat', x: slope.x + rand.int(-slope.w / 3, slope.w / 3), y: slope.y - rand.int(2, Math.max(3, slope.h * 0.5)), t: rand() * 4, state: 'graze', dir: rand.pick([-1, 1]), slope });
            for (let i = 0; i < n(3); i++) this.things.push({ kind: 'duck', mallard: i % 2 === 0, x: I.lake.x + rand.int(-I.lake.rx * 0.6, I.lake.rx * 0.6), y: I.lake.y + rand.int(-I.lake.ry * 0.5, I.lake.ry * 0.5), t: rand() * 4, dir: rand.pick([-1, 1]) });
            this.things.push({ kind: 'fox', x: -6, y: I.streets[0], t: 0, state: 'hidden', dir: 1 });
            const owlTree = I.trees.filter(t => t.kind === 'pine' && t.size > 0)[0] || I.trees[0];
            if (owlTree) this.things.push({ kind: 'owl', x: owlTree.x, y: owlTree.y + 0.3, tree: owlTree, t: 0 });
            this.butterflies = n(6);
            this.fishT = 10;
            this.flockT = 60 + rand() * 60;
        }
        bird() {
            const M = this.M, I = M.I, rand = M.rand;
            const perch = this.perch();
            return { kind: 'bird', coat: rand.int(0, this.art.bird.length - 1), x: perch.x, y: perch.y, perch, t: rand() * 4, state: 'perch', dir: rand.pick([-1, 1]), fly: null };
        }
        perch() {
            const M = this.M, I = M.I, rand = M.rand;
            if (rand.chance(0.5) && I.houses.length) { const h = rand.pick(I.houses), art = M.houseArt(h); return { x: h.x + rand.int(1, h.w - 2), y: h.base + 0.45, drawY: h.base - art.h + 1 + art.roofTop + 1, kind: 'roof' }; }
            if (rand.chance(0.6) && I.trees.length) { const t = rand.pick(I.trees); const ts = M.treeArt(t); return { x: t.x + rand.int(-1, 1), y: t.y + 0.5, drawY: t.y - ts.trunk.h + 2 + rand.int(0, 2), kind: 'tree' }; }
            return { x: rand.int(3, I.w - 3), y: rand.pick(I.streets) + rand.int(-1, 1), kind: 'ground' };
        }
        nearest(from, kinds, r) {
            let best = null;
            for (const th of this.things) if (kinds.includes(th.kind) && th.state !== 'hidden') { const d = dist(th, from); if (d < r && (!best || d < best.d)) best = { th, d }; }
            if (best) { best.th.scare = () => { if (best.th.kind === 'bird') this.flyOff(best.th); else if (best.th.kind === 'butterfly') best.th.vx = (best.th.x - from.x) * 2; }; return best.th; }
            return null;
        }
        flyOff(b) { const perch = this.perch(); b.state = 'fly'; b.fly = { from: { x: b.x, y: b.drawY ?? b.y }, to: perch, t: 0, d: 1.5 + this.M.rand() * 2 }; b.perch = perch; b.dir = perch.x < b.x ? -1 : 1; }

        update(dt) {
            const M = this.M, I = M.I, rand = M.rand, dark = M.dark;
            const people = M.folk.people.filter(p => !p.inside);
            const near = (th, r) => people.some(p => dist(p, th) < r) || M.cats.cats.some(c => dist(c, th) < r * 0.8);
            for (const th of this.things) {
                th.t += dt;
                switch (th.kind) {
                    case 'bird':
                        if (th.state === 'fly') { const f = th.fly; f.t += dt; const k = Math.min(1, f.t / f.d); th.x = f.from.x + (f.to.x - f.from.x) * k; th.drawY = f.from.y + ((f.to.drawY ?? f.to.y) - f.from.y) * k - Math.sin(k * Math.PI) * 14; if (k >= 1) { th.state = 'perch'; th.y = f.to.y; th.drawY = f.to.drawY; th.t = 0; } }
                        else if ((dark > 0.6 && th.perch.kind !== 'tree') || (th.t > 6 + rand() * 20 && rand.chance(dt)) || (near(th, 9) && rand.chance(0.5))) this.flyOff(th);
                        else if (th.perch.kind === 'ground' && th.t > 1 && rand.chance(dt * 0.5)) { th.x += rand.pick([-1, 1]); th.dir = rand.pick([-1, 1]); }
                        break;
                    case 'rabbit':
                        if (near(th, 12)) { th.state = 'hop'; th.target = { x: th.x + (th.x < people[0]?.x ? -14 : 14), y: th.y }; }
                        if (th.state === 'hop') { const t = th.target; const dx = t.x - th.x; th.dir = dx < 0 ? -1 : 1; th.x += Math.sign(dx) * 18 * dt; th.hop = Math.abs(Math.sin(th.t * 10)) * 2; if (Math.abs(dx) < 1) { th.state = 'sit'; th.t = 0; th.hop = 0; } th.x = L.clamp(th.x, 2, I.w - 2); }
                        else if (th.t > 2 + rand() * 6) { th.state = 'hop'; th.t = 0; th.target = { x: L.clamp(I.spots.meadow.x + rand.int(-14, 14), 2, I.w - 2), y: th.y }; }
                        if (M.holidayId === 'easter' && th.state === 'sit' && M.eggs?.length && rand.chance(dt * 0.1)) { const e = rand.pick(M.eggs); th.state = 'hop'; th.target = { x: e.x, y: th.y }; }
                        break;
                    case 'deer':
                        if (th.state === 'gone') { if (th.t > 30) { th.state = 'graze'; th.t = 0; th.x = th.home.x + rand.int(-8, 8); th.y = th.home.y; } break; }
                        if (near(th, 16)) { th.state = 'flee'; th.t = 0; th.dir = th.x < I.mountain.x ? -1 : 1; }
                        if (th.state === 'flee') { th.x += th.dir * 28 * dt; if (th.t > 1.5) { th.state = 'gone'; th.t = 0; } }
                        else if (th.state === 'walk') { th.x += th.dir * 6 * dt; if (th.t > 2) { th.state = 'graze'; th.t = 0; } if (Math.abs(th.x - th.home.x) > I.mountain.w * 0.5) th.dir *= -1; }
                        else if (th.t > 4 + rand() * 6) { th.state = rand.chance(0.6) ? 'walk' : 'stand'; th.t = 0; if (th.state === 'walk') th.dir = rand.pick([-1, 1]); }
                        break;
                    case 'goat': {
                        const m = th.slope;
                        if (th.state === 'walk') { th.x += th.dir * 5 * dt; const u = (th.x - m.x) / (m.w / 2); th.y = m.y - Math.round(m.h * 0.5 * (1 - Math.abs(u))) - 1; if (Math.abs(u) > 0.8) th.dir *= -1; if (th.t > 3) { th.state = 'graze'; th.t = 0; } }
                        else if (th.t > 3 + rand() * 5) { th.state = rand.chance(0.7) ? 'walk' : 'stand'; th.t = 0; }
                        break;
                    }
                    case 'duck':
                        if (M.frozen) { th.hidden = true; break; }
                        th.hidden = false;
                        th.x += th.dir * 2 * dt; th.bob = Math.floor(th.t * 2) % 2;
                        if (Math.abs(th.x - I.lake.x) > I.lake.rx * 0.6 || rand.chance(dt * 0.1)) th.dir *= -1;
                        break;
                    case 'fox':
                        if (th.state === 'hidden') { if (dark > 0.4 && rand.chance(dt * 0.02)) { th.state = 'trot'; th.t = 0; th.x = th.dir > 0 ? -6 : I.w + 6; th.y = I.streets[0] + 1; } }
                        else if (th.state === 'trot') { th.x += th.dir * 10 * dt; if (th.t > 6 && rand.chance(dt * 0.3)) { th.state = 'sit'; th.t = 0; } if (th.x < -8 || th.x > I.w + 8) { th.state = 'hidden'; th.dir *= -1; } if (near(th, 14)) { th.dir = th.x < I.w / 2 ? -1 : 1; th.state = 'trot'; } }
                        else if (th.state === 'sit' && th.t > 4) { th.state = 'trot'; th.t = 0; }
                        break;
                    case 'owl': th.open = dark > 0.5 && (Math.floor(th.t) % 7 !== 3); th.hidden = dark < 0.5; break;
                    default: break;
                }
            }
            // Butterflies: spring and summer afternoons, over the flowers.
            const wantB = (M.season === 'spring' || M.season === 'summer') && dark < 0.3 && !M.weather.rain ? this.butterflies : 0;
            const have = this.things.filter(t => t.kind === 'butterfly');
            if (have.length < wantB && rand.chance(dt * 0.5)) { const f = rand.pick(I.flowers) || I.spots.meadow; this.things.push({ kind: 'butterfly', coat: rand.int(0, 3), x: f.x, y: f.y, h: 3 + rand() * 4, t: rand() * 9, vx: 0, home: f }); }
            if (have.length > wantB) this.things.splice(this.things.indexOf(have[0]), 1);
            for (const b of have) { b.x += (Math.sin(b.t * 1.7) * 6 + b.vx) * dt; b.h = 3 + Math.sin(b.t * 2.3) * 2; b.vx *= 0.9; if (Math.abs(b.x - b.home.x) > 14) b.x += (b.home.x - b.x) * dt; b.dir = Math.sin(b.t * 1.7) < 0 ? -1 : 1; }
            // A fish jumps now and then.
            this.fishT -= dt;
            if (this.fishT <= 0 && !M.frozen) { this.fishT = 15 + rand() * 40; this.jump(); }
            this.jumps = (this.jumps || []).filter(j => (j.t += dt) < 1);
            // Geese pass in spring and autumn; a flock of small birds any time.
            this.flockT -= dt;
            if (this.flockT <= 0 && dark < 0.5) { this.flockT = 90 + rand() * 180; this.flock(); }
            this.sky = this.sky.filter(b => { b.t += dt; b.x += b.vx * dt; b.y += b.vy * dt + Math.sin(b.t * 3 + b.k) * 2 * dt; return b.x > -40 && b.x < M.bw + 40; });
            // Halloween's bats and ghost.
            if (M.holidayId === 'halloween' && dark > 0.5) {
                const bats = this.things.filter(t => t.kind === 'bat');
                if (bats.length < 5 * (M.quality?.density ?? 1) && rand.chance(dt * 0.5)) this.things.push({ kind: 'bat', x: I.mountain.x, y: -10, t: rand() * 9, cx: I.mountain.x + rand.int(-40, 40), cy: -14 - rand.int(0, 20), r: 10 + rand() * 15 });
                for (const b of bats) { b.x = b.cx + Math.cos(b.t * 2.2) * b.r; b.y = b.cy + Math.sin(b.t * 3.1) * b.r * 0.4; }
                if (!this.things.some(t => t.kind === 'ghost')) this.things.push({ kind: 'ghost', x: I.lake.x, y: I.lake.y - 6, t: 0 });
                const gh = this.things.find(t => t.kind === 'ghost'); gh.x = I.lake.x + Math.sin(gh.t * 0.5) * I.lake.rx * 0.6; gh.lift = Math.sin(gh.t * 1.5) * 2; gh.dir = Math.cos(gh.t * 0.5) < 0 ? -1 : 1;
            } else this.things = this.things.filter(t => t.kind !== 'bat' && t.kind !== 'ghost');
            // The dragon in its cave.
            const d = this.dragon;
            d.t += dt;
            if (d.t > d.until) { d.t = 0; d.state = d.state === 'asleep' ? 'peek' : d.state === 'peek' ? (rand.chance(0.4) ? 'roar' : 'asleep') : 'peek'; d.until = d.state === 'asleep' ? 30 + rand() * 90 : d.state === 'roar' ? 2.5 : 6 + rand() * 10; if (d.state === 'roar') M.callout('Something in the cliff is awake'); }
            if (d.state === 'roar' && rand.chance(dt * 12)) M.sparks.push({ x: I.cave.x - 6, y: I.cave.y + 1, vx: -10 - rand() * 14, vy: -4 + rand() * 8, t: 0, life: 0.6 + rand() * 0.5 });
        }
        jump() { const M = this.M, I = M.I; this.stats.jumps++; this.jumps.push({ x: I.lake.x + M.rand.int(-I.lake.rx * 0.5, I.lake.rx * 0.5), y: I.lake.y + M.rand.int(-I.lake.ry * 0.4, I.lake.ry * 0.4), t: 0, dir: M.rand.pick([-1, 1]) }); M.ripple?.(this.jumps.at(-1)); }
        flock() {
            const M = this.M, rand = M.rand;
            this.stats.flocks++;
            const geese = (M.season === 'autumn' || M.season === 'spring') && rand.chance(0.6);
            const n = geese ? rand.int(5, 12) : rand.int(4, 9);
            const dir = rand.pick([-1, 1]), y0 = M.iy * (0.2 + rand() * 0.5), x0 = dir > 0 ? -30 : M.bw + 30;
            for (let i = 0; i < n; i++) this.sky.push({ geese, x: x0 - dir * i * (geese ? 7 : 5), y: y0 + (geese ? Math.abs(i - n / 2) * 3 : rand.int(-6, 6)), vx: dir * (geese ? 22 : 30), vy: 0, t: 0, k: rand() * 9, dir, coat: rand.int(0, 4) });
        }

        draw(list) {
            const M = this.M, t = M.time, art = this.art;
            const push = (th, s, y, lift = 0) => list.push({ y, draw: g => g.drawImage(s.c, Math.round(th.x) - s.ax, Math.round(th.drawY ?? th.y) - s.h + 1 - lift) });
            for (const th of this.things) {
                if (th.hidden) continue;
                const face = (th.dir ?? -1) < 0 ? 'l' : 'r';
                switch (th.kind) {
                    case 'bird': { const a = art.bird[th.coat]; push(th, th.state === 'fly' ? a[Math.floor(t * 10) % 2 ? 'fly0' : 'fly1'][face] : a[th.perch.kind === 'ground' && Math.floor(th.t * 3) % 2 ? 'peck' : 'perch'][face], th.state === 'fly' ? 1e4 : th.y); break; }
                    case 'butterfly': { const a = art.butterfly[th.coat]; push(th, a[Math.floor(t * 8 + th.t) % 2 ? 'open' : 'shut'][face], th.y + 0.6, Math.round(th.h)); break; }
                    case 'rabbit': { const a = M.season === 'winter' ? art.rabbitW : art.rabbit; push(th, a[th.state === 'hop' ? 'hop' : 'sit'][face], th.y, Math.round(th.hop || 0)); break; }
                    case 'deer': { if (th.state === 'gone') break; const a = art.deer[th.antlers ? 1 : 0]; push(th, a[th.state === 'graze' ? 'graze' : th.state === 'walk' || th.state === 'flee' ? (Math.floor(th.t * (th.state === 'flee' ? 12 : 5)) % 2 ? 'walk0' : 'walk1') : 'stand'][face], th.y); break; }
                    case 'goat': push(th, art.goat[th.state === 'graze' ? 'graze' : th.state === 'walk' ? (Math.floor(th.t * 4) % 2 ? 'walk' : 'stand') : 'stand'][face], th.y); break;
                    case 'duck': push(th, art.duck[th.mallard ? 1 : 0][th.bob ? 'a' : 'b'][face], th.y + 0.2); break;
                    case 'fox': if (th.state !== 'hidden') push(th, art.fox[th.state === 'sit' ? 'sit' : (Math.floor(th.t * 6) % 2 ? 'walk0' : 'walk1')][face], th.y); break;
                    case 'owl': { const ts = M.treeArt(th.tree); const s = art.owl[th.open ? 'open' : 'shut'].l; list.push({ y: th.y, draw: g => g.drawImage(s.c, Math.round(th.x) - s.ax, th.tree.y - ts.trunk.h + 3) }); break; }
                    case 'bat': { const s = art.bat[Math.floor(t * 9 + th.t) % 2 ? 'a' : 'b'].l; list.push({ y: -1, draw: g => g.drawImage(s.c, Math.round(th.x) - s.ax, Math.round(th.y)) }); break; }
                    case 'ghost': { const s = art.ghost[Math.floor(t * 2) % 2 ? 'a' : 'b'][face]; list.push({ y: th.y + 8, lit: true, draw: g => { g.globalAlpha = 0.75; g.drawImage(s.c, Math.round(th.x) - s.ax, Math.round(th.y + th.lift) - s.h + 1); g.globalAlpha = 1; } }); break; }
                    default: break;
                }
            }
            for (const j of this.jumps || []) { const k = j.t, lift = Math.sin(k * Math.PI) * 7; const s = art.fish[j.dir < 0 ? 'l' : 'r']; list.push({ y: j.y + 0.3, draw: g => { if (k < 0.1 || k > 0.9) return; g.drawImage(s.c, Math.round(j.x) - s.ax + Math.round(j.dir * k * 6), Math.round(j.y) - s.h + 1 - Math.round(lift)); } }); }
            if (M.I.cave) { const d = this.dragon; const s = art.dragon[d.state].l; list.push({ y: 1e3, draw: g => g.drawImage(s.c, M.I.cave.x - 4 - (d.state === 'asleep' ? 3 : 0), M.I.cave.y - 3) }); }
        }
        // The sky's birds, drawn on the sky directly (screen pixels).
        drawSky(skyG) {
            const M = this.M, t = M.time, art = this.art;
            for (const b of this.sky) {
                const s = b.geese ? art.goose[Math.floor(t * 6 + b.k) % 2 ? 'fly0' : 'fly1'][b.dir < 0 ? 'l' : 'r'] : art.bird[b.coat][Math.floor(t * 9 + b.k) % 2 ? 'fly0' : 'fly1'][b.dir < 0 ? 'l' : 'r'];
                skyG.drawImage(s.c, Math.round(b.x) - s.ax, Math.round(b.y));
            }
        }
    }

    // ---- Visitors ----------------------------------------------------------------------------------

    // Other islands drift by, far (small, behind ours, hazy) or near (big,
    // below, in front of the clouds). Their folk wave; ours wave back; birds
    // cross; now and then a balloon ferries someone over for a look round.
    class Visitors {
        constructor(M) { this.M = M; this.islands = []; this.balloon = null; this.stats = { visits: 0, balloons: 0 }; this.next = 20 + M.rand() * 30; this.wavers = {}; }

        update(dt) {
            const M = this.M, rand = M.rand;
            this.next -= dt;
            if (this.next <= 0 && M.config.visitMinutes > 0) { this.spawn(); this.next = M.config.visitMinutes * 60 * (0.7 + rand() * 0.6); }
            for (const v of this.islands) {
                v.t += dt;
                v.x += v.vx * dt * (0.8 + M.weather.wind * 0.4);
                v.y = v.y0 + Math.sin(v.t * 0.15 + v.k) * 3;
                const onScreen = v.x > -v.art.w && v.x < M.bw + v.art.w;
                const nearUs = Math.abs(v.x - M.bw / 2) < M.bw * 0.3;
                v.waving = onScreen && nearUs;
                if (nearUs && !v.greeted) { v.greeted = true; M.folk.waveAt(v.x < M.bw / 2 ? -1e3 : 1e3, 4); M.callout(`${v.name} is passing by`); if (rand.chance(0.7)) this.birdsFrom(v); if (M.config.balloon && !this.balloon && rand.chance(0.6)) this.launch(v); }
                if (v.windmill) v.sail = (v.sail || 0) + dt * 2;
            }
            this.islands = this.islands.filter(v => v.x > -v.art.w - 60 && v.x < M.bw + v.art.w + 60);
            if (this.balloon) this.flyBalloon(dt);
        }
        spawn(kindWanted) {
            const M = this.M, rand = M.rand;
            const kind = kindWanted || rand.pick(SkyIslandLand.VISITOR_KINDS);
            const art = SkyIslandLand.visitor(kind, rand, M.season);
            const near = rand.chance(0.45);
            const dir = rand.pick([-1, 1]);
            const y0 = near ? M.iy + M.I.depth + M.I.cliffH * (0.5 + rand() * 0.4) : M.iy * (0.25 + rand() * 0.45);
            const v = { kind, art, near, dir, x: dir > 0 ? -art.w : M.bw + art.w, y0, y: y0, vx: dir * (near ? 7 : 4) * (0.8 + rand() * 0.5), t: 0, k: rand() * 9, name: L.visitorName(rand), greeted: false, waving: false,
                residents: art.residents.map(r => ({ ...r, art: A.person({ skin: rand.pick(A.SKIN), hair: rand.pick(A.HAIR), top: rand.pick(A.CLOTH), pants: rand.pick(A.PANTS) }), k: rand() * 9 })),
                cats: art.cats.map(c => ({ ...c, art: A.cat({ ...rand.pick(A.STRAY_COATS), eyes: '#6ab04a' }), k: rand() * 9, state: rand.pick(['sit', 'loaf', 'sleep', 'sit']) })), windmill: art.windmill };
            this.islands.push(v);
            this.stats.visits++;
            return v;
        }
        birdsFrom(v) {
            const M = this.M, rand = M.rand, n = rand.int(3, 6), dir = v.x < M.bw / 2 ? 1 : -1;
            for (let i = 0; i < n; i++) M.wild.sky.push({ geese: false, x: v.x - dir * i * 5, y: v.y + 10 + rand.int(-4, 4), vx: dir * 28, vy: (M.iy - 20 - v.y) / 12, t: 0, k: rand() * 9, dir, coat: rand.int(0, 4) });
        }
        // A balloon lifts from the visitor with a passenger, lands on our
        // meadow, and the passenger has a look round before going home.
        launch(v) {
            const M = this.M, rand = M.rand;
            const cat = rand.chance(0.3);
            const passenger = cat ? { cat: true, art: A.cat({ ...rand.pick(A.STRAY_COATS), eyes: '#f0d050' }), name: 'a visiting cat' } : { cat: false, art: A.person({ skin: rand.pick(A.SKIN), hair: rand.pick(A.HAIR), top: rand.pick(A.CLOTH), pants: rand.pick(A.PANTS) }), name: 'a visitor' };
            const land = M.I.spots.meadow;
            const target = { x: M.ix + land.x, y: M.iy + land.y };
            this.balloon = { from: v, art: A.airBalloon(rand.pick(['#d9453a', '#3a6fd9', '#e0a63a']), rand.pick(['#f8f8f8', '#f0c040', '#3aa86a'])), x: v.x, y: v.y + 10, phase: 'out', t: 0, passenger, target, stay: 20 + rand() * 25, walker: null };
            this.stats.balloons++;
            M.callout(`A balloon is on its way from ${v.name}`);
        }
        flyBalloon(dt) {
            const M = this.M, b = this.balloon;
            b.t += dt;
            const go = (to, speed) => { const dx = to.x - b.x, dy = to.y - b.y, d = Math.hypot(dx, dy); if (d < speed * dt) { b.x = to.x; b.y = to.y; return true; } b.x += dx / d * speed * dt; b.y += dy / d * speed * dt; return false; };
            if (b.phase === 'out') { if (go({ x: b.target.x, y: b.target.y - 30 }, 22)) { b.phase = 'down'; b.t = 0; } }
            else if (b.phase === 'down') { if (go(b.target, 8)) { b.phase = 'visit'; b.t = 0; this.disembark(); } }
            else if (b.phase === 'visit') { if (b.t > b.stay) { b.phase = 'board'; b.walker.goTo(M.route({ x: b.walker.x, y: b.walker.y }, { x: b.target.x - M.ix, y: b.target.y - M.iy })); b.walker.onArrive = () => { b.phase = 'up'; b.t = 0; b.walker = null; }; } }
            else if (b.phase === 'up') { b.y -= 8 * dt; if (b.t > 3) { b.phase = 'home'; b.t = 0; } }
            else if (b.phase === 'home') { const home = b.from.x > -1e3 ? b.from : null; const to = home && this.islands.includes(home) ? { x: home.x, y: home.y - 10 } : { x: b.x < M.bw / 2 ? -40 : M.bw + 40, y: b.y - 20 }; if (go(to, 20) || b.x < -50 || b.x > M.bw + 50) this.balloon = null; }
        }
        disembark() {
            const M = this.M, b = this.balloon, p = b.passenger;
            const w = new Mover(b.target.x - M.ix, b.target.y - M.iy);
            Object.assign(w, { art: p.art, cat: p.cat, frame: 0, idleT: 1, dir: -1, wave: 2 });
            b.walker = w;
            M.folk.waveAt(w.x, 3);
            M.callout(`${p.name} has landed from ${b.from.name}`);
        }
        updateWalker(dt) {
            const M = this.M, b = this.balloon, w = b?.walker;
            if (!w) return;
            w.frame += dt; w.idleT -= dt; if (w.wave > 0) w.wave -= dt;
            if (w.moving) { w.speed = w.cat ? 12 : 10; w.step(dt); }
            else if (b.phase === 'visit' && w.idleT <= 0) { const spot = M.rand.pick([M.I.spots.square, M.I.spots.dock, M.I.spots.meadow, { x: M.I.well.x + 4, y: M.I.well.y + 2 }]); w.goTo(M.route({ x: w.x, y: w.y }, spot)); w.idleT = 4 + M.rand() * 6; w.onArrive = () => { if (!w.cat && M.rand.chance(0.5)) w.wave = 2; }; }
        }
        // One island, drawn at its canvas's own origin (the manager places and washes it).
        drawOne(v, g) {
            const M = this.M, t = M.time, ox = v.art.ox, oy = v.art.oy;
            g.drawImage(v.art.c, 0, 0);
            if (v.art.fall) { const f = v.art.fall; g.fillStyle = '#8fd0f0'; for (let i = 0; i < f.h; i++) if ((i + Math.floor(t * 8)) % 3) g.fillRect(ox + f.x, oy + v.art.depth + i, 2, 1); }
            if (v.windmill) { const s = v.windmill.sails[Math.floor(v.sail || 0) % 4]; g.drawImage(s.c, ox + v.windmill.x - s.ax, oy + v.windmill.y - 8); }
            for (const r of v.residents) { const f = r.art[v.waving ? (Math.floor(t * 6 + r.k) % 2 ? 'wave0' : 'wave1') : 'stand'][v.x < M.bw / 2 ? 'r' : 'l']; g.drawImage(f.c, ox + r.x - f.ax, oy + r.y - f.h + 1); }
            for (const c of v.cats) { const f = c.art[c.state][Math.floor(c.k) % 2 ? 'l' : 'r']; g.drawImage(f.c, ox + c.x - f.ax, oy + c.y - f.h + 1); }
            if (M.dark > 0.5) { g.fillStyle = A.P.glassLit; for (const l of v.art.lights) g.fillRect(ox + l.x, oy + l.y, 1, 1); }
        }
        drawBalloon(g) {
            const b = this.balloon; if (!b) return;
            const s = b.art, x = Math.round(b.x), y = Math.round(b.y);
            g.drawImage(s.c, x - s.ax, y - s.h + 1);
            if (b.phase !== 'visit' && b.phase !== 'board') { const p = b.passenger; const f = p.cat ? p.art.sit.l : p.art.stand.l; g.drawImage(f.c, x - 2, y - s.h + 1 + s.basket.y - f.h + 3, f.w, f.h - 3); }
        }
        drawWalker(list) {
            const M = this.M, b = this.balloon, w = b?.walker, t = M.time;
            if (!w) return;
            const face = w.dir < 0 ? 'l' : 'r';
            const f = w.cat ? w.art[w.moving ? (Math.floor(w.frame * 8) % 2 ? 'walk0' : 'walk1') : 'sit'][face] : w.art[w.wave > 0 ? (Math.floor(t * 6) % 2 ? 'wave0' : 'wave1') : w.moving ? (Math.floor(w.frame * 7) % 2 ? 'walk0' : 'walk1') : 'stand'][face];
            const x = Math.round(w.x), y = Math.round(w.y);
            list.push({ y: w.y, draw: g => g.drawImage(f.c, x - f.ax, y - f.h + 1) });
        }
    }

    return { Mover, Townsfolk, Cats, Dogs, Wildlife, Visitors, SPEECH };
})();
