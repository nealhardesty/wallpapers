// Christmas Village's cast: skaters on the pond, villagers about the
// street, carollers going door to door, sledders, the families who come
// for a tree, cats (mostly asleep), a dog now and then, the deer and the
// owl up by the cabin, the toy train under the grand tree, and the sleigh.
//
// They're drawn straight onto the main canvas each frame as a few filled
// shapes apiece, in colours already toned for the hour (m.tone), and
// sorted far to near with the trees by the manager.

const villageEase = (rate, dt) => 1 - Math.exp(-rate * dt);
const villagePick = list => list[Math.floor(Math.random() * list.length)];
const VILLAGE_COATS = ['#b63a30', '#27624a', '#2f4f86', '#d8a23a', '#6a4c93', '#3a3f4a', '#c96a2b', '#e7e2d8', '#8a2d52', '#3e7c8c', '#7a2f2a', '#44685a'];
const VILLAGE_LEGS = ['#2a2e3a', '#3b3340', '#27323f', '#4a3f38'];
const VILLAGE_SKIN = ['#f1c9a5', '#e0ac84', '#c68a5e', '#8d5a3b', '#f6d5b8'];

function villageLook(child) {
    return { coat: villagePick(VILLAGE_COATS), hat: villagePick(VILLAGE_COATS), scarf: villagePick(VILLAGE_COATS), legs: villagePick(VILLAGE_LEGS), skin: villagePick(VILLAGE_SKIN), child: !!child, pom: Math.random() < 0.6, tall: 0.92 + Math.random() * 0.18 };
}

// A person, feet at (x, y), k pixels to the unit (about 19 units tall).
// o: dir, gait (radians), lean, pose ('walk', 'skate', 'stand', 'sing',
// 'sit', 'down', 'saw', 'look'), carry, spin (0..1 of a turn).
function villagePerson(g, m, look, o) {
    const k = o.k * (look.child ? 0.68 : 1) * look.tall, d = o.dir || 1, st = Math.sin(o.gait || 0), pose = o.pose || 'walk';
    const tone = c => m.tone(c);
    g.save();
    g.translate(o.x, o.y);
    g.fillStyle = m.shadow;
    g.beginPath(); g.ellipse(1.5 * k, 0.3 * k, 4.6 * k, 1.1 * k, 0, 0, 6.2832); g.fill();
    if (o.hop) g.translate(0, -o.hop * k);
    if (pose === 'down') { g.translate(0, -2 * k); g.rotate(d * 1.35); }
    else if (o.lean) g.rotate(o.lean);
    const turn = o.spin ? Math.cos(o.spin * 6.2832) : 1;
    g.scale(d * k * (Math.abs(turn) < 0.25 ? 0.25 * Math.sign(turn || 1) : turn), k);
    g.lineCap = 'round';
    // Legs.
    g.strokeStyle = tone(look.legs);
    g.lineWidth = 1.7;
    g.beginPath();
    if (pose === 'skate') { g.moveTo(0.4, -7.4); g.lineTo(1.6 + st * 1.4, 0); g.moveTo(-0.4, -7.4); g.lineTo(-2.4 - st * 2.2, -0.4 - Math.max(0, st) * 1.6); }
    else if (pose === 'sit') { g.moveTo(0, -5); g.lineTo(3.4, -5); g.lineTo(3.6, 0); }
    else if (pose === 'walk') { g.moveTo(0, -7.4); g.lineTo(st * 2.5, 0); g.moveTo(0, -7.4); g.lineTo(-st * 2.5, 0); }
    else { g.moveTo(0.9, -7.4); g.lineTo(1.1, 0); g.moveTo(-0.9, -7.4); g.lineTo(-1.1, 0); }
    g.stroke();
    if (pose === 'skate') { g.strokeStyle = tone('#c9d2de'); g.lineWidth = 0.5; g.beginPath(); g.moveTo(0.4 + st * 1.4, 0.2); g.lineTo(3.4 + st * 1.4, 0.2); g.stroke(); }
    const up = pose === 'sit' ? 2.4 : 0;
    // The coat.
    g.fillStyle = tone(look.coat);
    g.beginPath(); g.moveTo(-2.7, -6.6 + up); g.lineTo(2.7, -6.6 + up); g.lineTo(2.2, -14 + up); g.lineTo(-2.2, -14 + up); g.closePath(); g.fill();
    // Arms.
    g.strokeStyle = tone(look.coat);
    g.lineWidth = 1.5;
    g.beginPath();
    const sy = -13 + up;
    if (pose === 'sing') { g.moveTo(0, sy); g.lineTo(2.6, sy + 3); g.lineTo(3.4, sy + 1.6); }
    else if (pose === 'look' || o.arms === 'up') { g.moveTo(-1, sy); g.lineTo(-3.6, sy - 4.2 + st); g.moveTo(1, sy); g.lineTo(3.6, sy - 4.2 - st); }
    else if (pose === 'saw') { g.moveTo(0, sy); g.lineTo(3 + st * 1.4, sy + 5); }
    else if (pose === 'skate') { g.moveTo(0, sy); g.lineTo(-3.2, sy + 3.4 - st); g.moveTo(0, sy); g.lineTo(3.2, sy + 3.4 + st); }
    else if (o.carry) { g.moveTo(0, sy); g.lineTo(2.8, sy + 3.6); }
    else { g.moveTo(0, sy); g.lineTo(-st * 2.2, sy + 5.4); g.moveTo(0, sy); g.lineTo(st * 2.2, sy + 5.4); }
    g.stroke();
    if (o.carry === 'gift') { g.fillStyle = tone('#c62f27'); g.fillRect(2.2, sy + 2.4, 3.2, 3); g.fillStyle = tone('#f3d27a'); g.fillRect(3.5, sy + 2.4, 0.6, 3); }
    else if (o.carry === 'cup') { g.fillStyle = tone('#f3f0e8'); g.fillRect(2.6, sy + 2.2, 1.4, 1.8); }
    else if (o.carry === 'book') { g.fillStyle = tone('#f3ead6'); g.fillRect(2.6, sy + 0.4, 2.4, 1.8); }
    else if (o.carry === 'lantern') { g.fillStyle = '#ffd27a'; g.fillRect(2.8, sy + 3.2, 1.6, 2.2); }
    // Scarf, head, hat.
    g.fillStyle = tone(look.scarf);
    g.fillRect(-2.2, -15 + up, 4.4, 1.5);
    g.fillRect(-2.6, -14.6 + up, 1.3, 3.6 + st * 0.5);
    g.fillStyle = tone(look.skin);
    g.beginPath(); g.arc(0, -16.6 + up, look.child ? 2.4 : 2.1, 0, 6.2832); g.fill();
    g.fillStyle = tone(look.hat);
    g.beginPath(); g.arc(0, -17 + up, look.child ? 2.5 : 2.2, Math.PI, 0); g.fill();
    g.fillRect(-2.4, -17.3 + up, 4.8, 0.9);
    if (look.pom) { g.fillStyle = tone('#f6f3ea'); g.beginPath(); g.arc(0, -19.5 + up, 0.9, 0, 6.2832); g.fill(); }
    g.lineCap = 'butt';
    g.restore();
}

// ---- Skaters ----------------------------------------------------------------------

class VillageSkater {
    constructor(m, kind, partner) {
        this.m = m;
        this.kind = kind;                    // lap, figure, beginner, kid, pair
        this.look = villageLook(kind === 'kid');
        this.partner = partner || null;
        const a = Math.random() * 6.2832, r = kind === 'figure' ? 0.25 : 0.4 + Math.random() * 0.4, p = m.L.pond;
        this.x = p.cx + Math.cos(a) * p.rx * r;
        this.y = p.cy + Math.sin(a) * p.ry * r;
        this.turn = kind === 'figure' && Math.random() < 0.5 ? -1 : 1;
        this.a = a + this.turn * Math.PI / 2;
        this.want = r;
        this.speed = { lap: 0.2 + Math.random() * 0.08, figure: 0.17, beginner: 0.07 + Math.random() * 0.03, kid: 0.26 + Math.random() * 0.08, pair: 0.15 }[kind];
        this.gait = Math.random() * 6;
        this.state = 'skate';
        this.wait = 6 + Math.random() * 20;
        this.spin = 0;
        this.hop = 0;
        this.lean = 0;
        this.rethink = 4 + Math.random() * 8;
    }

    update(dt) {
        const m = this.m, p = m.L.pond;
        if (this.partner && this.kind === 'pair') {
            // The one on the outside keeps station beside the leader.
            const l = this.partner, k = m.L.depth(l.y), off = 7.5 * k;
            const tx = l.x + Math.cos(l.a + Math.PI / 2) * off, ty = l.y + Math.sin(l.a + Math.PI / 2) * off * p.ry / p.rx * 2;
            const px = this.x, py = this.y;
            this.x += (tx - this.x) * villageEase(6, dt);
            this.y += (ty - this.y) * villageEase(6, dt);
            this.a = l.a; this.gait = l.gait + 0.6; this.lean = l.lean;
            m.track(px, py, this.x, this.y);
            return;
        }
        this.wait -= dt;
        this.rethink -= dt;
        if (this.rethink <= 0) {
            this.rethink = 5 + Math.random() * 10;
            this.want = this.kind === 'figure' ? 0.15 + Math.random() * 0.25 : 0.35 + Math.random() * 0.5;
            if (this.kind === 'figure') this.turn = -this.turn;      // a figure of eight
        }
        if (this.state === 'spin') {
            this.spin += dt * 2.2;
            this.gait += dt * 2;
            if (this.wait <= 0) { this.state = 'skate'; this.spin = 0; this.wait = 9 + Math.random() * 14; }
            m.trackSpin(this.x, this.y, this.spin);
            return;
        }
        if (this.state === 'jump') {
            this.spin += dt * 1.6;
            this.hop = Math.sin(Math.min(1, this.spin) * Math.PI) * 5;
            if (this.spin >= 1) { this.state = 'skate'; this.spin = 0; this.hop = 0; }
        }
        if (this.state === 'down') {
            if (this.wait <= 0) { this.state = 'skate'; this.wait = 14 + Math.random() * 30; }
            return;
        }
        if (this.wait <= 0 && this.state === 'skate') {
            if (this.kind === 'figure') { this.state = 'spin'; this.wait = 2.2 + Math.random() * 1.8; return; }
            if (this.kind === 'beginner') { this.fall(); return; }
            this.wait = 10 + Math.random() * 20;
        }
        // Keep clear of whoever is just ahead.
        for (const o of m.skaters) {
            if (o === this || o.partner === this) continue;
            const dx = (o.x - this.x) / p.rx, dy = (o.y - this.y) / p.ry;
            if (dx * dx + dy * dy < 0.02 && dx * Math.cos(this.a) + dy * Math.sin(this.a) > 0) this.want += (VillageLogic.pondR(p, this.x, this.y) > VillageLogic.pondR(p, o.x, o.y) ? 1 : -1) * dt * 0.5;
        }
        this.want = VillageLogic.clamp(this.want, 0.12, 0.84);
        const before = this.a;
        this.a = VillageLogic.skate(p, this.x, this.y, this.a, this.want, this.turn, dt, this.kind === 'beginner' ? 0.9 : 1.7);
        const wobble = this.kind === 'beginner' ? Math.sin(m.time * 5 + this.gait) * 0.3 : 0;
        const px = this.x, py = this.y, v = this.speed * (0.82 + 0.18 * Math.sin(this.gait));
        this.x += Math.cos(this.a + wobble) * v * p.rx * dt;
        this.y += Math.sin(this.a + wobble) * v * p.ry * dt;
        this.gait += dt * (this.kind === 'beginner' ? 5 : 3.2);
        this.lean += ((this.a - before) / Math.max(dt, 1e-3) * 0.12 * this.turn - this.lean) * villageEase(5, dt);
        m.track(px, py, this.x, this.y);
    }

    fall() {
        this.state = 'down';
        this.wait = 2.5 + Math.random() * 3;
        this.m.spray(this.x, this.y, 8, this.m.L.depth(this.y));
    }
    // A tap: a hop and a turn in the air, or, for a beginner, the inevitable.
    poke() {
        if (this.state !== 'skate') return;
        if (this.kind === 'beginner') return this.fall();
        this.state = 'jump';
        this.spin = 0;
    }

    draw(g) {
        const m = this.m, k = m.L.depth(this.y) * m.config.peopleSize;
        const dir = Math.cos(this.a) >= 0 ? 1 : -1;
        villagePerson(g, m, this.look, {
            x: this.x, y: this.y, k, dir, gait: this.gait, pose: this.state === 'down' ? 'down' : 'skate',
            lean: this.state === 'skate' ? VillageLogic.clamp(this.lean, -0.3, 0.3) * dir : 0, spin: this.state === 'spin' || this.state === 'jump' ? this.spin : 0, hop: this.hop,
            arms: this.state === 'spin' ? 'up' : null,
        });
    }
}

// ---- Villagers ----------------------------------------------------------------------

// Someone on an errand: a list of places to walk to, and how long to stay
// at each. route: [{ x, y, wait, pose, carry, gone }].
class VillageWalker {
    constructor(m, route, o = {}) {
        this.m = m;
        this.look = o.look || villageLook(o.child);
        this.route = route;
        this.x = route[0].x; this.y = route[0].y;
        this.step = 1;
        this.wait = 0;
        this.pose = 'walk';
        this.carry = o.carry || null;
        this.speed = (o.speed || 15 + Math.random() * 7) * (this.look.child ? 1.15 : 1);
        this.gait = Math.random() * 6;
        this.dir = 1;
        this.done = false;
        this.dog = o.dog ? new VillageDog(m, this) : null;
        this.offset = o.offset || null;       // a caroller keeps this place in the group
    }

    update(dt) {
        const m = this.m;
        if (this.dog) this.dog.update(dt);
        if (this.wait > 0) {
            this.wait -= dt;
            if (this.wait <= 0) { this.pose = 'walk'; this.step++; }
            return;
        }
        const to = this.route[this.step];
        if (!to) { this.done = true; return; }
        const k = m.L.depth(this.y), dx = to.x - this.x, dy = to.y - this.y, dist = Math.hypot(dx, dy * 2);
        const move = this.speed * k * dt;
        if (dist <= move) {
            this.x = to.x; this.y = to.y;
            if (to.carry !== undefined) this.carry = to.carry;
            if (to.gone) { this.done = true; return; }
            if (to.wait) { this.wait = to.wait; this.pose = to.pose || 'stand'; if (to.face) this.dir = to.face; if (to.then) to.then(this); } else this.step++;
            return;
        }
        this.x += dx / dist * move;
        this.y += dy / dist * move / 2;
        if (Math.abs(dx) > 0.5) this.dir = dx < 0 ? -1 : 1;
        this.gait += dt * 7.5;
    }

    draw(g) {
        const m = this.m, k = m.L.depth(this.y) * m.config.peopleSize;
        if (this.dog && this.dog.y <= this.y) this.dog.draw(g);
        if (this.drag) m.drawDragged(g, this, k);
        villagePerson(g, m, this.look, { x: this.x, y: this.y, k, dir: this.dir, gait: this.gait, pose: this.pose, carry: this.carry });
        if (this.carry === 'cup' && this.pose !== 'walk' && Math.random() < 0.05) m.steam(this.x + this.dir * 3 * k, this.y - 13 * k, k);
        if (this.dog && this.dog.y > this.y) this.dog.draw(g);
    }
}

// ---- Dogs -----------------------------------------------------------------------------

const VILLAGE_DOGS = [
    { body: '#d9a45a', ear: '#b98238', spot: null },       // a golden
    { body: '#2b2a2e', ear: '#1d1c20', spot: null },       // a black lab
    { body: '#f1ede4', ear: '#8a5a3a', spot: '#8a5a3a' },  // a spaniel
    { body: '#9aa0aa', ear: '#5e646e', spot: '#f1ede4' },  // a husky
    { body: '#8a5a3a', ear: '#6b4228', spot: null },
];

// A dog: on a lead beside its person, or loose and delighted with the snow.
class VillageDog {
    constructor(m, owner) {
        this.m = m;
        this.owner = owner;
        this.coat = villagePick(VILLAGE_DOGS);
        this.size = 0.8 + Math.random() * 0.5;
        this.x = owner ? owner.x : 0; this.y = owner ? owner.y : 0;
        this.dir = 1;
        this.gait = 0;
        this.tail = 0;
        this.hop = 0;
        this.done = false;
        this.state = 'run';
        this.wait = 3 + Math.random() * 5;
    }

    update(dt) {
        const m = this.m;
        this.tail += dt * 14;
        if (this.owner) {
            // Out in front, to the end of the lead, with stops to investigate.
            const k = m.L.depth(this.owner.y), tx = this.owner.x + this.owner.dir * 13 * k, ty = this.owner.y + 2.5 * k;
            const dx = tx - this.x;
            this.x += dx * villageEase(2.4, dt);
            this.y += (ty - this.y) * villageEase(3, dt);
            if (Math.abs(dx) > 1.2 * k) { this.gait += dt * 13; this.dir = dx < 0 ? -1 : 1; } else this.dir = this.owner.dir;
            return;
        }
        // Loose: bounding across the snow, leaping at flakes.
        this.wait -= dt;
        const k = m.L.depth(this.y);
        if (this.state === 'leap') {
            this.hop += dt * 2.6;
            if (this.hop >= 1) { this.hop = 0; this.state = 'run'; this.wait = 2 + Math.random() * 5; m.spray(this.x, this.y, 5, k); }
        } else if (this.wait <= 0) { this.state = 'leap'; this.hop = 0; }
        this.x += this.dir * 52 * k * dt * (this.state === 'leap' ? 0.6 : 1);
        this.y += Math.sin(m.time * 0.7 + this.size * 9) * 4 * k * dt;
        this.gait += dt * 15;
        if (Math.random() < dt * 6) m.print(this.x, this.y, k * 0.9);
        if (this.x < -60 * k || this.x > m.W + 60 * k) this.done = true;
    }

    draw(g) {
        const m = this.m, k = m.L.depth(this.y) * this.size * m.config.peopleSize, c = this.coat, st = Math.sin(this.gait);
        const tone = col => m.tone(col);
        if (this.owner) {
            const ok = m.L.depth(this.owner.y) * m.config.peopleSize;
            g.strokeStyle = tone('#3a2c22'); g.lineWidth = 0.5 * k;
            g.beginPath(); g.moveTo(this.owner.x + this.owner.dir * 2.6 * ok, this.owner.y - 8.4 * ok); g.lineTo(this.x - this.dir * 3 * k, this.y - 6 * k); g.stroke();
        }
        g.save();
        g.translate(this.x, this.y);
        g.fillStyle = m.shadow;
        g.beginPath(); g.ellipse(0, 0.3 * k, 6.5 * k, 1.3 * k, 0, 0, 6.2832); g.fill();
        g.translate(0, -Math.sin(this.hop * Math.PI) * 9 * k);
        g.scale(this.dir * k, k);
        g.strokeStyle = tone(c.ear); g.lineWidth = 1.3; g.lineCap = 'round';
        g.beginPath();
        g.moveTo(-3.6, -4); g.lineTo(-3.6 - st * 1.8, 0); g.moveTo(-2.4, -4); g.lineTo(-2.4 + st * 1.8, 0);
        g.moveTo(3, -4); g.lineTo(3 + st * 1.8, 0); g.moveTo(4, -4); g.lineTo(4 - st * 1.8, 0);
        g.stroke();
        g.strokeStyle = tone(c.body); g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(-5, -6.4); g.quadraticCurveTo(-7.4, -8.6 + Math.sin(this.tail) * 1.6, -7, -10.6 + Math.sin(this.tail) * 1.2); g.stroke();
        g.lineCap = 'butt';
        g.fillStyle = tone(c.body);
        g.beginPath(); g.ellipse(0, -5.6, 5.6, 2.7, 0, 0, 6.2832); g.fill();
        if (c.spot) { g.fillStyle = tone(c.spot); g.beginPath(); g.ellipse(-1.4, -6.4, 2.2, 1.4, 0, 0, 6.2832); g.fill(); g.fillStyle = tone(c.body); }
        g.beginPath(); g.ellipse(5.4, -8.2, 2.5, 2.1, 0, 0, 6.2832); g.fill();
        g.beginPath(); g.ellipse(7.6, -7.6, 1.6, 1.1, 0, 0, 6.2832); g.fill();
        g.fillStyle = tone(c.ear);
        g.beginPath(); g.ellipse(4.3, -8.8, 1, 1.9, 0.4, 0, 6.2832); g.fill();
        g.fillStyle = tone('#1a1a1e');
        g.fillRect(8.7, -8, 0.8, 0.7);
        g.fillRect(6, -8.8, 0.6, 0.6);
        g.restore();
    }
}

// ---- Cats -----------------------------------------------------------------------------

const VILLAGE_CATS = [
    { body: '#d8802e', belly: '#f2c88a', stripe: '#a85a1c' },       // ginger
    { body: '#8a8e9a', belly: '#c8ccd4', stripe: '#5e626e' },       // grey tabby
    { body: '#26232c', belly: '#26232c', stripe: null },            // black
    { body: '#25232b', belly: '#f2eee6', stripe: null },            // tuxedo
    { body: '#e8d2a8', belly: '#f8ecd4', stripe: '#c8a878' },       // cream
    { body: '#ece6da', belly: '#f8f4ea', stripe: null, patch: '#d8802e' },   // calico
    { body: '#7a5a3e', belly: '#c8a47a', stripe: '#4e3626' },       // brown tabby
    { body: '#f4f1ea', belly: '#ffffff', stripe: null },            // white
];

// A cat. It has a perch (a roof, a porch, a doorstep, a barrel, the hut's
// counter, the warm side of the fire) and it is mostly asleep on it, a
// little snow gathering on its back. Now and then it sits up, washes,
// and, if its perch is on the ground, walks to another, leaving prints.
class VillageCat {
    constructor(m, spot) {
        this.m = m;
        this.coat = villagePick(VILLAGE_CATS);
        this.size = 0.85 + Math.random() * 0.3;
        this.lazy = 0.6 + Math.random() * 0.35;
        this.take(spot);
        this.x = spot.x; this.y = spot.y;
        this.dir = Math.random() < 0.5 ? -1 : 1;
        this.state = Math.random() < this.lazy ? 'sleep' : 'sit';
        this.wait = 8 + Math.random() * 40;
        this.pose = this.state === 'sleep' ? 0 : 1;      // 0 curled … 1 sitting up
        this.tail = Math.random() * 6;
        this.gait = 0;
        this.snow = this.state === 'sleep' ? Math.random() * 0.6 : 0;
        this.wash = 0;
        this.zs = 0;
    }

    take(spot) { if (this.spot) this.spot.cat = null; this.spot = spot; spot.cat = this; }
    grounded() { return ['step', 'porch', 'fire', 'counter', 'barrel', 'wall'].includes(this.spot.kind); }

    update(dt) {
        const m = this.m;
        this.tail += dt * (this.state === 'walk' ? 4 : this.state === 'sit' ? 1.6 : 0.5);
        this.pose += ((this.state === 'sleep' ? 0 : 1) - this.pose) * villageEase(3, dt);
        if (this.state === 'sleep') {
            this.snow = Math.min(1, this.snow + dt / 240 * m.config.snowfall);
            this.zs += dt;
            if (this.zs > 5.5) { this.zs = 0; m.note(this.x + 3 * this.k(), this.y - 7 * this.k(), 'z', 0.7); }
        } else this.snow = Math.max(0, this.snow - dt * 2);
        if (this.state === 'walk') {
            const to = this.spot, k = this.k(), dx = to.x - this.x, dy = to.y - this.y, dist = Math.hypot(dx, dy * 2), move = 17 * k * dt;
            if (dist <= move) { this.x = to.x; this.y = to.y; this.state = 'sit'; this.wait = 4 + Math.random() * 6; return; }
            this.x += dx / dist * move; this.y += dy / dist * move / 2;
            this.dir = dx < 0 ? -1 : 1;
            const before = Math.floor(this.gait / Math.PI);
            this.gait += dt * 9;
            if (Math.floor(this.gait / Math.PI) !== before) m.print(this.x, this.y, k * 0.6);
            return;
        }
        if (this.state === 'wash') this.wash += dt * 9;
        this.wait -= dt;
        if (this.wait > 0) return;
        const r = Math.random();
        if (this.state === 'sleep') { this.state = r < 0.5 ? 'sit' : 'sleep'; this.wait = this.state === 'sit' ? 5 + Math.random() * 8 : 20 + Math.random() * 60; if (this.state === 'sit' && this.snow > 0.3) m.spray(this.x, this.y - 4 * this.k(), 4, this.k() * 0.6); }
        else if (r < this.lazy) { this.state = 'sleep'; this.wait = 30 + Math.random() * 90; }
        else if (r < this.lazy + 0.14) { this.state = 'wash'; this.wait = 3 + Math.random() * 4; }
        else if (r > 0.9 && this.grounded()) {
            // Somewhere better: another perch on the ground, not too far and not taken.
            const free = m.scene.spots.filter(s => !s.cat && ['step', 'porch', 'fire', 'wall'].includes(s.kind) && Math.abs(s.x - this.x) < m.W * 0.3 && Math.abs(s.y - this.y) < m.L.Hu * 0.12);
            if (free.length && ['step', 'porch', 'fire', 'wall'].includes(this.spot.kind)) { this.take(villagePick(free)); this.state = 'walk'; } else { this.state = 'sit'; this.wait = 6; }
        } else { this.state = 'sit'; this.wait = 6 + Math.random() * 12; }
    }

    k() { return (this.spot.k || this.m.L.s) * this.size * this.m.config.catSize * 0.8; }

    // Woken by a tap: up it sits, with something to say about it.
    poke() {
        this.state = 'sit';
        this.wait = 8;
        if (this.snow > 0.2) this.m.spray(this.x, this.y - 4 * this.k(), 5, this.k() * 0.6);
        this.m.note(this.x, this.y - 11 * this.k(), '♥', 1);
    }

    draw(g) {
        const m = this.m, k = this.k(), c = this.coat, p = this.pose, tone = col => m.tone(col);
        g.save();
        g.translate(this.x, this.y);
        g.scale(this.dir * k, k);
        g.lineCap = 'round';
        if (this.state === 'walk') {
            const st = Math.sin(this.gait);
            g.strokeStyle = tone(c.body); g.lineWidth = 1.1;
            g.beginPath();
            g.moveTo(-3, -3.4); g.lineTo(-3 - st * 1.5, 0); g.moveTo(-2, -3.4); g.lineTo(-2 + st * 1.5, 0);
            g.moveTo(2.4, -3.4); g.lineTo(2.4 + st * 1.5, 0); g.moveTo(3.2, -3.4); g.lineTo(3.2 - st * 1.5, 0);
            g.moveTo(-4.4, -5); g.quadraticCurveTo(-6.4, -8, -5.2, -10.4 + Math.sin(this.tail) * 0.8);
            g.stroke();
            g.fillStyle = tone(c.body);
            g.beginPath(); g.ellipse(0, -4.6, 4.8, 2.1, 0, 0, 6.2832); g.fill();
            this.head(g, 4.8, -6.6, tone);
        } else {
            // From curled (p = 0) to sitting up (p = 1).
            const bw = 5 - p * 1.6, bh = 2.5 + p * 2.3;
            g.strokeStyle = tone(c.stripe || c.body); g.lineWidth = 1.2;
            g.beginPath(); g.moveTo(-bw + 0.6, -1.2); g.quadraticCurveTo(-bw - 2.6 + p, -0.4 - p * 1.4 + Math.sin(this.tail) * 0.9 * p, bw * (0.8 - p * 1.5), -0.5 - p * 0.3); g.stroke();
            g.fillStyle = tone(c.body);
            g.beginPath(); g.ellipse(0, -bh, bw, bh, 0, 0, 6.2832); g.fill();
            if (c.stripe) { g.strokeStyle = tone(c.stripe); g.lineWidth = 0.5; g.beginPath(); for (const dx of [-1.6, 0, 1.6]) { g.moveTo(dx - 0.4, -bh * 1.9); g.lineTo(dx, -bh * 1.3); } g.stroke(); }
            if (c.patch) { g.fillStyle = tone(c.patch); g.beginPath(); g.ellipse(-1.4, -bh * 1.2, 1.8, 1.3, 0, 0, 6.2832); g.fill(); }
            g.fillStyle = tone(c.belly);
            g.beginPath(); g.ellipse(bw * 0.3, -bh * 0.75, bw * 0.42, bh * 0.6 * p + 0.01, 0, 0, 6.2832); g.fill();
            this.head(g, 2.2 + (1 - p) * 1.6, -bh * 2 + 1.4 - p * 1.2 + (this.state === 'wash' ? Math.sin(this.wash) * 0.5 : 0), tone, p < 0.4);
            if (this.snow > 0.05) {
                g.fillStyle = tone('#ffffff');
                g.beginPath(); g.ellipse(-0.6, -bh * 2 + 0.3, bw * 0.72 * this.snow, 0.5 + this.snow * 0.8, 0, 0, 6.2832); g.fill();
            }
        }
        g.lineCap = 'butt';
        g.restore();
    }

    head(g, x, y, tone, asleep) {
        const c = this.coat;
        g.fillStyle = tone(c.body);
        g.beginPath(); g.arc(x, y, 2.1, 0, 6.2832); g.fill();
        g.beginPath(); g.moveTo(x - 2, y - 0.8); g.lineTo(x - 1.7, y - 3.1); g.lineTo(x - 0.3, y - 1.7); g.closePath(); g.fill();
        g.beginPath(); g.moveTo(x + 2, y - 0.8); g.lineTo(x + 1.7, y - 3.1); g.lineTo(x + 0.3, y - 1.7); g.closePath(); g.fill();
        if (c.belly !== c.body) { g.fillStyle = tone(c.belly); g.beginPath(); g.ellipse(x + 0.5, y + 0.8, 1.1, 0.8, 0, 0, 6.2832); g.fill(); }
        g.fillStyle = asleep ? tone('#1a1a1e') : this.m.light.dark > 0.5 ? '#d8f080' : tone('#2a3a1e');
        if (asleep) { g.fillRect(x - 1.1, y - 0.1, 0.8, 0.25); g.fillRect(x + 0.5, y - 0.1, 0.8, 0.25); }
        else { g.fillRect(x - 1.1, y - 0.5, 0.6, 0.7); g.fillRect(x + 0.6, y - 0.5, 0.6, 0.7); }
    }
}

// ---- Sledders ---------------------------------------------------------------------------

class VillageSledder {
    constructor(m, i) {
        this.m = m;
        this.look = villageLook(true);
        this.lane = (i % 3 - 1) * 0.5;
        this.t = Math.random();              // 0 at the top … 1 at the bottom
        this.state = Math.random() < 0.5 ? 'up' : 'down';
        this.v = 0;
        this.wait = Math.random() * 3;
        this.gait = 0;
    }

    at(t) {
        const s = this.m.L.sled, k = this.m.L.depth(s.y1);
        return { x: VillageLogic.lerp(s.x0, s.x1, t) + this.lane * 16 * k * (1 - t * 0.4), y: VillageLogic.lerp(s.y0, s.y1, t * t * 0.4 + t * 0.6) + this.lane * 4 * k };
    }

    update(dt) {
        if (this.state === 'wait') { this.wait -= dt; if (this.wait <= 0) { this.state = this.t < 0.5 ? 'down' : 'up'; this.v = 0; } return; }
        if (this.state === 'up') {
            this.t -= dt * 0.085;
            this.gait += dt * 7;
            if (this.t <= 0) { this.t = 0; this.state = 'wait'; this.wait = 1 + Math.random() * 4; }
        } else {
            this.v = Math.min(0.55, this.v + dt * 0.22);
            this.t += this.v * dt;
            const p = this.at(this.t);
            if (Math.random() < dt * 14) this.m.spray(p.x - 5, p.y, 1, this.m.L.depth(p.y) * 0.7);
            if (this.t >= 1.08) { this.t = 1.08; this.state = 'wait'; this.wait = 1.5 + Math.random() * 4; }
        }
    }

    draw(g) {
        const m = this.m, p = this.at(this.t), k = m.L.depth(p.y) * m.config.peopleSize, s = m.L.sled;
        const slope = Math.atan2(s.y1 - s.y0, s.x1 - s.x0);
        const sled = (x, y, a) => {
            g.save(); g.translate(x, y); g.rotate(a); g.scale(k, k);
            g.fillStyle = m.tone('#b63a30'); g.fillRect(-5, -2.2, 10, 1.2);
            g.strokeStyle = m.tone('#5a4638'); g.lineWidth = 0.6;
            g.beginPath(); g.moveTo(-5, -0.3); g.lineTo(4.6, -0.3); g.quadraticCurveTo(6.4, -0.6, 6, -2.2); g.stroke();
            g.restore();
        };
        this.x = p.x; this.y = p.y;
        if (this.state === 'up' || (this.state === 'wait' && this.t > 0.5)) {
            sled(p.x + 9 * k, p.y + 1.5 * k, slope);
            g.strokeStyle = m.tone('#3a2c22'); g.lineWidth = 0.4 * k;
            g.beginPath(); g.moveTo(p.x + 3.6 * k, p.y + 0.4 * k); g.lineTo(p.x - 1.6 * k, p.y - 5.4 * k); g.stroke();
            villagePerson(g, m, this.look, { x: p.x, y: p.y, k, dir: -1, gait: this.gait, pose: this.state === 'up' ? 'walk' : 'stand' });
        } else {
            sled(p.x, p.y, slope);
            villagePerson(g, m, this.look, { x: p.x - 1 * k, y: p.y - 2 * k, k, dir: 1, pose: 'sit', arms: this.state === 'down' ? 'up' : null, gait: m.time * 5 });
        }
    }
}

// ---- The deer and the owl, up by the cabin ------------------------------------------------

class VillageDeer {
    constructor(m, i) {
        this.m = m;
        const c = m.scene.cabin;
        this.home = { x: c.x + (i % 2 ? -1 : 1) * (26 + Math.random() * 24) * c.k, y: c.y + (2 + Math.random() * 5) * c.k };
        this.x = this.home.x; this.y = this.home.y;
        this.tx = this.x;
        this.dir = i % 2 ? 1 : -1;
        this.buck = i === 0;
        this.state = 'graze';
        this.wait = 3 + Math.random() * 10;
        this.head = 0;                       // 0 down in the snow … 1 up and listening
        this.gait = 0;
    }

    update(dt) {
        const m = this.m, c = m.scene.cabin;
        this.wait -= dt;
        const alert = m.alarm > 0;
        this.head += (((this.state === 'look' || alert) ? 1 : this.state === 'walk' ? 0.7 : 0) - this.head) * villageEase(3, dt);
        if (this.state === 'walk') {
            const dx = this.tx - this.x, move = 6 * c.k * dt;
            if (Math.abs(dx) <= move) { this.state = 'graze'; this.wait = 5 + Math.random() * 12; return; }
            this.x += Math.sign(dx) * move;
            this.dir = dx < 0 ? -1 : 1;
            this.gait += dt * 5;
        } else if (this.wait <= 0) {
            const r = Math.random();
            if (r < 0.35) { this.state = 'look'; this.wait = 2 + Math.random() * 4; }
            else if (r < 0.6) { this.state = 'walk'; this.tx = this.home.x + (Math.random() - 0.5) * 30 * c.k; }
            else { this.state = 'graze'; this.wait = 5 + Math.random() * 12; }
        }
    }

    draw(g) {
        const m = this.m, k = m.scene.cabin.k * 1.25, tone = col => m.tone(col), st = this.state === 'walk' ? Math.sin(this.gait) : 0, h = this.head;
        g.save();
        g.translate(this.x, this.y);
        g.scale(this.dir * k, k);
        g.strokeStyle = tone('#6b4a33'); g.lineWidth = 1; g.lineCap = 'round';
        g.beginPath();
        g.moveTo(-3.4, -6); g.lineTo(-3.4 - st, 0); g.moveTo(-2.2, -6); g.lineTo(-2.2 + st, 0);
        g.moveTo(2.6, -6); g.lineTo(2.6 + st, 0); g.moveTo(3.6, -6); g.lineTo(3.6 - st, 0);
        g.stroke();
        g.fillStyle = tone('#8a6444');
        g.beginPath(); g.ellipse(0, -7.4, 5, 2.4, 0, 0, 6.2832); g.fill();
        g.fillStyle = tone('#f4f1ea');
        g.beginPath(); g.ellipse(-4.8, -8, 1, 1.3, 0, 0, 6.2832); g.fill();
        // The neck swings from the snow up to the listening.
        const nx = 4.4 + 2.2 * (1 - h), ny = -8 - 5.4 * h + 4.4 * (1 - h);
        g.strokeStyle = tone('#8a6444'); g.lineWidth = 2;
        g.beginPath(); g.moveTo(3.6, -8.4); g.lineTo(nx, ny); g.stroke();
        g.fillStyle = tone('#8a6444');
        g.beginPath(); g.ellipse(nx + 1.2, ny - 0.2, 1.9, 1.2, 0.2, 0, 6.2832); g.fill();
        if (this.buck) {
            g.strokeStyle = tone('#d8c9a8'); g.lineWidth = 0.5;
            g.beginPath(); g.moveTo(nx + 0.4, ny - 1); g.lineTo(nx - 0.8, ny - 4.6); g.moveTo(nx - 0.2, ny - 2.8); g.lineTo(nx + 1.2, ny - 4.2); g.moveTo(nx - 0.6, ny - 3.8); g.lineTo(nx - 2, ny - 4.6); g.stroke();
        }
        g.lineCap = 'butt';
        g.restore();
    }
}

// ---- The toy train under the grand tree -----------------------------------------------------

class VillageTrain {
    constructor(m) {
        this.m = m;
        this.a = Math.random() * 6.2832;
        this.puff = 0;
        this.cars = [
            { kind: 'engine', len: 8.5, color: '#1f4a36' },
            { kind: 'tender', len: 5.5, color: '#2a2e3a' },
            { kind: 'box', len: 7, color: '#b63a30' },
            { kind: 'gifts', len: 7, color: '#2f4f86' },
            { kind: 'caboose', len: 6.5, color: '#d8a23a' },
        ];
    }

    // The oval it runs on: round the foot of the tree.
    track() {
        const t = this.m.scene.grand, s = this.m.L.s, rx = Math.max(26 * s, t.h * 0.36);
        return { cx: t.x, cy: t.y + 2 * s, rx, ry: rx * 0.21, k: VillageLogic.clamp(t.h / 200, 0.5, 1.6) * 1.7 * s };
    }

    update(dt) {
        const m = this.m, tr = this.track();
        this.a += dt * 0.55 * m.config.trainSpeed;
        this.puff -= dt;
        if (this.puff <= 0 && m.config.trainSpeed > 0) {
            this.puff = 0.45;
            m.steam(tr.cx + Math.cos(this.a) * tr.rx, tr.cy + Math.sin(this.a) * tr.ry - 8 * tr.k, tr.k * 1.2);
        }
    }

    // `front`: the half of the loop this side of the tree, or the half behind it.
    draw(g, front) {
        const m = this.m, tr = this.track(), k = tr.k, tone = c => m.tone(c);
        // The rails and their sleepers.
        g.save();
        g.beginPath();
        if (front) g.rect(tr.cx - tr.rx - 10, tr.cy, tr.rx * 2 + 20, tr.ry + 10); else g.rect(tr.cx - tr.rx - 10, tr.cy - tr.ry - 10, tr.rx * 2 + 20, tr.ry + 10);
        g.clip();
        g.strokeStyle = tone('#5a4638'); g.lineWidth = 2.6 * k;
        g.setLineDash([1.1 * k, 2.2 * k]);
        g.beginPath(); g.ellipse(tr.cx, tr.cy, tr.rx, tr.ry, 0, 0, 6.2832); g.stroke();
        g.setLineDash([]);
        g.strokeStyle = tone('#aab4c4'); g.lineWidth = 0.5 * k;
        g.beginPath(); g.ellipse(tr.cx, tr.cy, tr.rx + 1 * k, tr.ry + 0.5 * k, 0, 0, 6.2832); g.stroke();
        g.beginPath(); g.ellipse(tr.cx, tr.cy, tr.rx - 1 * k, tr.ry - 0.5 * k, 0, 0, 6.2832); g.stroke();
        g.restore();
        let a = this.a;
        const list = this.cars.map(car => { const at = a; a -= (car.len + 1.4) * k / tr.rx; return { car, a: at - car.len * k / tr.rx / 2 }; });
        for (const { car, a: at } of list.sort((p, q) => Math.sin(p.a) - Math.sin(q.a))) {
            if ((Math.sin(at) >= 0) !== front) continue;
            const x = tr.cx + Math.cos(at) * tr.rx, y = tr.cy + Math.sin(at) * tr.ry;
            // Seen side-on at the front and back of the loop, end-on at the sides.
            const along = -Math.sin(at), wide = Math.max(0.34, Math.abs(along)), dir = along >= 0 ? 1 : -1;
            g.save();
            g.translate(x, y);
            g.scale(k * dir, k);
            const L = car.len * wide, h = 4.2;
            g.fillStyle = tone('#20222a');
            for (const wx of [-L * 0.32, L * 0.32]) { g.beginPath(); g.arc(wx, -1, 1.1, 0, 6.2832); g.fill(); }
            g.fillStyle = tone(car.color);
            if (car.kind === 'engine') {
                g.fillRect(-L / 2, -1.6 - h * 0.9, L * 0.4, h * 0.9);                 // the cab
                g.beginPath(); g.ellipse(L * 0.12, -3.5, L * 0.36, 1.9, 0, 0, 6.2832); g.fill();   // the boiler
                g.fillStyle = tone('#20222a');
                g.fillRect(L * 0.24, -7.6, 1.5, 2.6);
                g.fillRect(L * 0.18, -8.2, 2.7, 0.8);
                g.fillStyle = tone('#b63a30'); g.fillRect(-L / 2 - 0.4, -6.6, L * 0.4 + 0.8, 0.9);
                g.fillStyle = tone('#d8b24a'); g.fillRect(L * 0.02, -5.8, 1.2, 1);
                if (m.light.dark > 0.3 && Math.abs(along) > 0.3) { g.fillStyle = '#fff2c0'; g.beginPath(); g.arc(L * 0.5, -3.6, 0.9, 0, 6.2832); g.fill(); }
            } else if (car.kind === 'gifts') {
                g.fillRect(-L / 2, -3.4, L, 1.9);
                const gifts = ['#c62f27', '#f3d27a', '#2fa35a', '#e7e2d8'];
                for (let i = 0; i < 4; i++) { g.fillStyle = tone(gifts[i]); g.fillRect(-L / 2 + 0.6 + i * L * 0.22, -5.4 - (i % 2) * 0.8, L * 0.18, 2 + (i % 2) * 0.8); }
            } else {
                g.fillRect(-L / 2, -1.6 - h, L, h);
                if (car.kind === 'tender') { g.fillStyle = tone('#16171c'); g.beginPath(); g.ellipse(0, -5.8, L * 0.4, 0.9, 0, Math.PI, 0); g.fill(); }
                if (car.kind === 'caboose') { g.fillStyle = tone('#b63a30'); g.fillRect(-L * 0.2, -7.6, L * 0.4, 1.8); g.fillStyle = m.light.dark > 0.3 ? '#ffd27a' : tone('#31405f'); g.fillRect(-L * 0.3, -4.8, L * 0.2, 1.4); g.fillRect(L * 0.1, -4.8, L * 0.2, 1.4); }
                if (car.kind === 'box') { g.fillStyle = tone('#f3f0e8'); g.fillRect(-L * 0.12, -5.2, L * 0.24, 3.4); }
                g.fillStyle = tone('#ffffff'); g.fillRect(-L / 2, -1.9 - h, L, 0.7);
            }
            g.restore();
        }
    }
}

// ---- The sleigh -----------------------------------------------------------------------------

// Across the sky and, when there's a moon to cross, across the moon.
class VillageSleigh {
    constructor(m, through) {
        this.m = m;
        const W = m.W, hz = m.L.hz;
        this.dir = Math.random() < 0.5 ? 1 : -1;
        this.age = 0;
        this.life = 15;
        const mid = through || { x: W * (0.35 + Math.random() * 0.3), y: hz * (0.25 + Math.random() * 0.2) };
        this.p0 = { x: this.dir > 0 ? -W * 0.12 : W * 1.12, y: mid.y + hz * 0.26 };
        this.p1 = { x: mid.x, y: mid.y - hz * 0.16 };            // the control point: it climbs, then levels
        this.p2 = { x: this.dir > 0 ? W * 1.14 : -W * 0.14, y: mid.y - hz * 0.02 };
        // Bend the curve so it passes through `mid` at its middle.
        this.p1 = { x: 2 * mid.x - (this.p0.x + this.p2.x) / 2, y: 2 * mid.y - (this.p0.y + this.p2.y) / 2 };
        this.sparks = [];
        this.done = false;
    }

    at(t) {
        const u = 1 - t;
        return { x: u * u * this.p0.x + 2 * u * t * this.p1.x + t * t * this.p2.x, y: u * u * this.p0.y + 2 * u * t * this.p1.y + t * t * this.p2.y };
    }

    update(dt) {
        this.age += dt;
        if (this.age > this.life) { this.done = true; return; }
        const p = this.at(this.age / this.life);
        if (Math.random() < dt * 30) this.sparks.push({ x: p.x - this.dir * 6, y: p.y + 2, vx: -this.dir * (4 + Math.random() * 10), vy: 4 + Math.random() * 10, age: 0, life: 0.8 + Math.random() * 1.2 });
        for (const s of this.sparks) { s.age += dt; s.x += s.vx * dt; s.y += s.vy * dt; }
        this.sparks = this.sparks.filter(s => s.age < s.life);
    }

    draw(g) {
        const m = this.m, t = this.age / this.life, p = this.at(t), q = this.at(Math.min(1, t + 0.01));
        const k = VillageLogic.clamp(m.L.s * 1.25, 0.6, 2.4), a = Math.atan2(q.y - p.y, Math.abs(q.x - p.x)) * 0.8;
        g.fillStyle = '#fff4c8';
        for (const s of this.sparks) { g.globalAlpha = 1 - s.age / s.life; g.fillRect(s.x, s.y, 1.4 * k, 1.4 * k); }
        g.globalAlpha = 1;
        g.save();
        g.translate(p.x, p.y);
        g.scale(k * this.dir, k);
        g.rotate(a);
        const dark = '#1c1622';
        // Four pairs of reindeer, galloping on nothing.
        g.strokeStyle = dark; g.fillStyle = dark; g.lineWidth = 0.7; g.lineCap = 'round';
        for (let i = 0; i < 4; i++) {
            const x = 12 + i * 10, st = Math.sin(m.time * 9 + i * 1.3), y = Math.sin(m.time * 4.5 + i) * 0.8;
            g.beginPath(); g.ellipse(x, y - 4, 3.6, 1.5, 0, 0, 6.2832); g.fill();
            g.beginPath(); g.ellipse(x + 4.2, y - 6.2, 1.5, 1, -0.5, 0, 6.2832); g.fill();
            g.beginPath();
            g.moveTo(x - 2.4, y - 3.4); g.lineTo(x - 3.6 - st * 2, y - 0.2); g.moveTo(x + 2.4, y - 3.4); g.lineTo(x + 3.6 + st * 2, y - 0.2);
            g.moveTo(x + 4.2, y - 7); g.lineTo(x + 3.6, y - 9.4); g.moveTo(x + 4, y - 8.4); g.lineTo(x + 5.2, y - 9.6);
            g.stroke();
        }
        g.fillStyle = '#ff5540';
        g.beginPath(); g.arc(48.2, Math.sin(m.time * 4.5 + 3) * 0.8 - 6.4, 0.8, 0, 6.2832); g.fill();
        g.strokeStyle = dark; g.lineWidth = 0.35;
        g.beginPath(); g.moveTo(4, -5); g.lineTo(44, -4.6); g.stroke();
        // The sleigh, the sack, and the driver.
        g.fillStyle = '#8f1f1c';
        g.beginPath(); g.moveTo(-8, -6.5); g.quadraticCurveTo(-9.5, -1.5, -4, -1.2); g.lineTo(4, -1.2); g.quadraticCurveTo(6.4, -2, 6, -5.4); g.lineTo(2.4, -4.6); g.lineTo(-4.4, -4.6); g.closePath(); g.fill();
        g.strokeStyle = '#d8b24a'; g.lineWidth = 0.5;
        g.beginPath(); g.moveTo(-8, 0.4); g.lineTo(5, 0.4); g.quadraticCurveTo(8, 0, 7.4, -2.4); g.stroke();
        g.fillStyle = '#6b4a33';
        g.beginPath(); g.ellipse(-4.8, -6.8, 2.6, 2.4, 0, 0, 6.2832); g.fill();
        g.fillStyle = '#c62f27';
        g.beginPath(); g.ellipse(0.4, -6.2, 1.9, 2.3, 0, 0, 6.2832); g.fill();
        g.beginPath(); g.moveTo(-0.9, -9); g.lineTo(1.6, -9); g.lineTo(-1.6, -11.6); g.closePath(); g.fill();
        g.fillStyle = '#f6f3ea';
        g.beginPath(); g.arc(0.5, -8.6, 1.1, 0, 6.2832); g.fill();
        g.beginPath(); g.arc(-1.7, -11.7, 0.6, 0, 6.2832); g.fill();
        g.lineCap = 'butt';
        g.restore();
    }
}

// ---- The owl ----------------------------------------------------------------------------------

class VillageOwl {
    constructor(m) {
        this.m = m;
        const c = m.scene.cabin, dir = Math.random() < 0.5 ? 1 : -1;
        this.dir = dir;
        this.x0 = c.x - dir * 150 * c.k; this.x1 = c.x + dir * 170 * c.k;
        this.y = c.y - (36 + Math.random() * 20) * c.k;
        this.age = 0; this.life = 7 + Math.random() * 3;
        this.done = false;
    }
    update(dt) { this.age += dt; if (this.age >= this.life) this.done = true; }
    draw(g) {
        const m = this.m, t = this.age / this.life, k = m.scene.cabin.k * 1.5;
        const x = VillageLogic.lerp(this.x0, this.x1, t), y = this.y + Math.sin(t * Math.PI) * 12 * k + Math.sin(this.age * 2.2) * 1.5 * k, flap = Math.sin(this.age * 5.5);
        g.save();
        g.translate(x, y);
        g.scale(this.dir * k, k);
        g.fillStyle = m.tone('#cfc6b4');
        g.beginPath(); g.ellipse(0, 0, 2.6, 1.5, 0, 0, 6.2832); g.fill();
        g.beginPath(); g.arc(2.2, -0.4, 1.4, 0, 6.2832); g.fill();
        g.beginPath(); g.moveTo(-1.6, -0.4); g.quadraticCurveTo(-1, -5 * flap - 1, 4.4 * 0 - 4.6, -3.4 * flap); g.lineTo(0.8, 0); g.closePath(); g.fill();
        g.beginPath(); g.moveTo(1.4, -0.2); g.quadraticCurveTo(1.6, -4.4 * flap - 1, 5.4, -3 * flap); g.lineTo(-0.6, 0.4); g.closePath(); g.fill();
        g.restore();
    }
}
