// Harvest Valley's creatures and its one event. Each is a small state
// machine over the manager's world (`m`): its layout `m.L`, its wind, its
// depth scale `m.depth(y)`, its pointer. They draw themselves with canvas
// paths, so a squirrel's tail can flick and a turkey's tail can fan.
// Everything moves by elapsed time (SPEC §4.8).

const harvestClamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const harvestEase = (rate, dt) => 1 - Math.exp(-rate * dt);

// ---- Geese --------------------------------------------------------------------------------

// Flocks cross the sky: mostly in a V with arms of unequal length, sometimes
// in a single slanting line, sometimes loose and ragged. They don't fly a
// ruler's line: each flock climbs and sinks and banks on its own slow
// curve, and its geese ripple their wingbeats down the formation, each a
// beat behind the one ahead, with an easy sway in their places. Now and
// then the whole flock stops flapping and glides. In a V the lead goose
// tires and drops to the back (the offsets ease, so it really does glide
// round the outside). Far flocks are small, and paler with distance.
class HarvestFlocks {
    constructor(m) {
        this.m = m;
        this.flocks = [];
        this.pending = [];
        this.due = 0;
    }

    size() {
        const m = this.m, d = m.host.quality?.density ?? 1;
        return harvestClamp(Math.round(m.config.flock * (0.7 + 0.3 * d) * (0.65 + Math.random() * 0.5)), 3, 100);
    }

    // At most this many flocks cross at once.
    cap() { return 4 + Math.floor(this.m.config.geese / 15); }

    // A flock, entering from a side; `at` (0..1) starts it part-way across.
    // `o` can fix its size, direction, distance, height and type, how far
    // behind the edge it starts, and how much faster it flaps: for stragglers.
    spawn(at = 0, o = {}) {
        const m = this.m, W = m.W, u = m.u, dir = o.dir ?? (Math.random() < 0.5 ? -1 : 1);
        const n = o.n ?? this.size(), scale = o.scale ?? 0.5 + Math.random() * 0.65, roll = Math.random();
        const type = o.type ?? (n < 5 || roll < 0.7 ? 'v' : roll < 0.85 ? 'line' : 'ragged'), behind = o.behind || 0;
        // A really big flock gets tighter, smaller birds, so it still fits the sky.
        const crowd = n > 40 ? Math.sqrt(40 / n) : 1, len = 28 * u * scale * Math.max(0.55, crowd);
        const f = {
            dir, scale, n, type, len, t: 0, gap: Math.max(0.5, crowd),
            x: dir > 0 ? -len * 4 + at * (W + len * 8) - behind : W + len * 4 - at * (W + len * 8) + behind,
            y: o.y ?? m.L.hz * (0.14 + Math.random() * 0.5),
            speed: (46 + Math.random() * 26) * u * (0.55 + scale * 0.5) * (o.speed ?? 1),
            climb: (Math.random() - 0.5) * 8 * u, wave: Math.random() * 6, wave2: Math.random() * 6,
            turn: 10 + Math.random() * 14, rate: (2.7 - 0.7 * scale + (Math.random() - 0.5) * 0.3) * (o.rate ?? 1),
            glide: 0, nextGlide: 6 + Math.random() * 12, tilt: 0, birds: [], offsets: [], ranks: [],
        };
        this.layout(f);
        for (let k = 0; k < n; k++) {
            f.birds.push({ slot: k, ox: f.offsets[k][0], oy: f.offsets[k][1], jit: (Math.random() - 0.5) * 0.06, p1: Math.random() * 6, p2: Math.random() * 6 });
        }
        this.flocks.push(f);
        return f;
    }

    // One to three stragglers, well behind a flock: hurrying a little harder
    // (a quicker wingbeat, a touch faster) and never quite catching up.
    straggle(main) {
        const m = this.m, k = 1 + Math.floor(Math.random() * 3);
        return this.spawn(0, {
            n: k, dir: main.dir, scale: main.scale * (0.92 + Math.random() * 0.16), type: 'ragged', rate: 1.18, speed: 1.04,
            y: main.y + (Math.random() - 0.5) * 30 * m.u, behind: main.len * (main.n * 0.6 + 3) + (160 + Math.random() * 360) * m.u,
        });
    }

    // Where each slot sits, in the flock's own frame (x forward, y down), and
    // how far back it is, for the ripple.
    layout(f) {
        const n = f.n, dx = f.len * 0.95 * f.gap, dy = f.len * 0.62 * f.gap;
        f.offsets = [[0, 0]];
        f.ranks = [0];
        if (f.type === 'v') {
            const left = Math.round((n - 1) * (0.4 + Math.random() * 0.2));
            let l = 0, r = 0;
            for (let k = 1; k < n; k++) {
                const useLeft = l < left && (r >= n - 1 - left || l <= r);
                if (useLeft) { l++; f.offsets.push([-l * dx, -l * dy]); f.ranks.push(l); } else { r++; f.offsets.push([-r * dx, r * dy]); f.ranks.push(r); }
            }
        } else if (f.type === 'line') {
            for (let k = 1; k < n; k++) { f.offsets.push([-k * dx * 0.85, k * dy * 0.7]); f.ranks.push(k); }
        } else {
            for (let k = 1; k < n; k++) {
                const a = k * 2.399963, r = Math.sqrt(k) * f.len * 0.85 * f.gap;
                f.offsets.push([-Math.abs(Math.cos(a)) * r * 1.5 - f.len * 0.3, Math.sin(a) * r * 0.75]);
                f.ranks.push(Math.sqrt(k) * 1.3);
            }
        }
    }

    update(dt) {
        const m = this.m;
        this.due += dt * m.config.geese * (m.host.quality?.density ?? 1) / 3600;
        while (this.due >= 1) {
            this.due -= 1;
            if (this.flocks.length >= this.cap()) continue;
            const main = this.spawn(0);
            // Often with a few stragglers, and sometimes a second flock close behind.
            if (main.n >= 6 && Math.random() < 0.45) this.straggle(main);
            if (Math.random() < 0.3) this.pending.push({ at: m.time + 4 + Math.random() * 14 });
        }
        for (let i = this.pending.length - 1; i >= 0; i--) {
            if (this.pending[i].at > m.time) continue;
            this.pending.splice(i, 1);
            if (this.flocks.length < this.cap()) { const second = this.spawn(0); if (second.n >= 6 && Math.random() < 0.3) this.straggle(second); }
        }
        // A lone goose now and then, going its own way.
        if (this.flocks.length < this.cap() && Math.random() < dt / 150) this.spawn(0, { n: 1 + Math.floor(Math.random() * 2), type: 'ragged' });
        for (const f of this.flocks) {
            f.t += dt;
            // A curved path: speed swells and eases, and the flock climbs and
            // sinks, turning its nose up and down as it does.
            const speed = f.speed * (1 + 0.08 * Math.sin(f.t * 0.3 + f.wave)) * (0.85 + 0.3 * Math.min(2, m.windPush * f.dir + 1));
            const vy = f.climb + Math.sin(f.t * 0.23 + f.wave2) * 11 * m.u * f.scale + Math.sin(f.t * 0.61 + f.wave) * 3 * m.u;
            f.x += f.dir * speed * dt;
            f.y += vy * dt;
            if (f.y < m.L.hz * 0.1) f.climb = Math.abs(f.climb) + 2;
            if (f.y > m.L.hz * 0.78) f.climb = -Math.abs(f.climb) - 2;
            f.tilt += (Math.atan2(vy, speed) - f.tilt) * harvestEase(1.5, dt);
            if (f.type !== 'ragged' && f.n > 4) {
                f.turn -= dt;
                if (f.turn <= 0) {
                    f.turn = 12 + Math.random() * 14;
                    for (const b of f.birds) b.slot = b.slot === 0 ? f.n - 1 : b.slot - 1;
                }
            }
            // A glide: wings out, still, for a few seconds.
            if (f.glide > 0) f.glide -= dt;
            else if ((f.nextGlide -= dt) <= 0) { f.glide = 2 + Math.random() * 2; f.nextGlide = 9 + Math.random() * 16; }
            const k = harvestEase(1.1, dt);
            for (const b of f.birds) {
                const [tx, ty] = f.offsets[b.slot];
                b.ox += (tx - b.ox) * k;
                b.oy += (ty - b.oy) * k;
            }
        }
        this.flocks = this.flocks.filter(f => f.dir > 0 ? f.x - f.len * f.n * 0.9 < m.W + f.len * 4 : f.x + f.len * f.n * 0.9 > -f.len * 4);
    }

    // Far flocks first, so near ones cross in front.
    draw(ctx, dpr, geese) {
        const m = this.m, frames = geese.frames, N = frames.length;
        for (const f of this.flocks.slice().sort((a, b) => a.scale - b.scale)) {
            const s = f.len / geese.length, cos = Math.cos(f.tilt), sin = Math.sin(f.tilt);
            ctx.globalAlpha = 0.58 + 0.42 * harvestClamp((f.scale - 0.5) / 0.65, 0, 1);
            for (const b of f.birds) {
                // The place in the flock, swaying a little, tilted with the flock and mirrored with its direction.
                const ox = b.ox + Math.sin(f.t * 0.5 + b.p1) * f.len * 0.07, oy = b.oy + Math.sin(f.t * 0.7 + b.p2) * f.len * 0.09;
                const px = f.x + f.dir * (ox * cos - oy * sin), py = f.y + ox * sin + oy * cos;
                const cycle = f.t * f.rate - f.ranks[b.slot] * 0.07 + b.jit;
                const frame = f.glide > 0 ? Math.floor(N * 0.4) : Math.floor((cycle - Math.floor(cycle)) * N) % N;
                const psi = f.dir * f.tilt, c = Math.cos(psi), sn = Math.sin(psi);
                ctx.setTransform(dpr * c * f.dir * s, dpr * sn * f.dir * s, -dpr * sn * s, dpr * c * s, px * dpr, py * dpr);
                ctx.drawImage(frames[frame], -geese.ax, -geese.ay);
            }
        }
        ctx.globalAlpha = 1;
    }
}

// ---- Squirrels -------------------------------------------------------------------------

// Squirrels collect the fallen apples and acorns and carry them, in both
// paws, off the edge of the screen to wherever they keep their stash; a
// little later they wander back in from an edge for more. Sometimes an
// acorn is a snack and is nibbled on the spot. They freeze and fidget
// between errands, and bolt for the nearest edge if anything startles them.
// They never appear or vanish in place.
class HarvestSquirrel {
    constructor(m, x, y) {
        this.m = m;
        this.x = x; this.y = y;
        this.dir = Math.random() < 0.5 ? -1 : 1;
        this.state = 'sit';
        this.t = Math.random() * 2;
        this.wait = 1 + Math.random() * 3;
        this.apple = null;
        this.target = null;
        this.gait = 0;
        this.tail = Math.random() * 6;
        this.blink = 2 + Math.random() * 3;
        this.eaten = 0;
    }

    // The nearest edge of the screen, at about this height: where food is
    // taken, and where a startled squirrel runs.
    edge() {
        const m = this.m, margin = 50 * m.u;
        return { x: this.x < m.W / 2 ? -margin : m.W + margin, y: harvestClamp(this.y + (Math.random() - 0.5) * 20 * m.u, m.meadowMin, m.meadowMax) };
    }

    // The nearest apple or acorn lying about that nobody else wants.
    pickApple() {
        const m = this.m;
        let best = null, d = 1e9;
        for (const a of m.apples) {
            if (a.state !== 'rest' || a.claimed) continue;
            const dd = Math.hypot(a.x - this.x, (a.y - this.y) * 2);
            if (dd < d) { d = dd; best = a; }
        }
        return best;
    }

    go(x, y, state) {
        this.target = { x, y };
        this.state = state;
        this.dir = x < this.x ? -1 : 1;
    }

    // Startled: drop whatever it carries and run off the nearest edge.
    startle() {
        if (this.state === 'away' || this.state === 'flee') return;
        this.drop();
        const e = this.edge();
        this.go(e.x, e.y, 'flee');
    }

    drop() {
        if (!this.apple) return;
        this.apple.carried = null;
        this.apple.state = 'rest';
        this.apple.claimed = false;
        this.apple.x = this.x;
        this.apple.y = this.y;
        this.apple = null;
    }

    update(dt) {
        const m = this.m, u = m.u, s = m.depth(this.y);
        this.t += dt;
        this.tail += dt * (this.state === 'sit' || this.state === 'eat' ? 2.2 : 6);
        this.blink -= dt;
        if (this.blink < -0.12) this.blink = 2.5 + Math.random() * 4;
        // Anything fast near the pointer startles a sitting squirrel.
        if (this.state === 'sit' && m.pointer.active && Math.hypot(m.pointer.x - this.x, (m.pointer.y - this.y) * 1.3) < 70 * u * s && m.pointer.speed > 400) this.startle();
        switch (this.state) {
            case 'sit':
                this.wait -= dt;
                if (this.wait <= 0) {
                    const apple = Math.random() < 0.85 ? this.pickApple() : null;
                    if (apple) { apple.claimed = true; this.apple = null; this.go(apple.x, apple.y, 'fetch'); this.fetching = apple; }
                    else { const p = m.randomMeadow(); this.go(p.x, p.y, 'wander'); }
                }
                break;
            case 'fetch': case 'wander': case 'carry': case 'flee': {
                const t = this.target, speed = (this.state === 'flee' ? 190 : this.state === 'carry' ? 105 : 125) * u * s;
                const dx = t.x - this.x, dy = (t.y - this.y), dist = Math.hypot(dx, dy * 1.6);
                if (dist < 4 * u) { this.arrive(); break; }
                const step = Math.min(dist, speed * dt);
                this.x += dx / dist * step;
                this.y += dy / dist * step / 1.6;
                this.dir = dx < 0 ? -1 : 1;
                this.gait += dt * 15;
                if (this.apple) { this.apple.x = this.x; this.apple.y = this.y; }
                break;
            }
            case 'pick':
                this.wait -= dt;
                if (this.wait <= 0) {
                    const a = this.fetching;
                    if (a && a.state === 'rest' && a.type === 'acorn' && Math.random() < 0.3) {
                        // A snack: sit up and nibble it where it lay.
                        this.apple = a;
                        a.carried = this;
                        a.state = 'carried';
                        this.state = 'eat';
                        this.wait = 3 + Math.random() * 2;
                    } else if (a && a.state === 'rest') {
                        // To the stash, which is somewhere off the edge of the screen.
                        this.apple = a;
                        a.carried = this;
                        a.state = 'carried';
                        const e = this.edge();
                        this.go(e.x, e.y, 'carry');
                    } else { this.state = 'sit'; this.wait = 1; }
                    this.fetching = null;
                }
                break;
            case 'eat':
                this.wait -= dt;
                if (this.wait <= 0) { if (this.apple) { this.apple.state = 'gone'; this.apple = null; } this.state = 'sit'; this.wait = 0.5 + Math.random() * 2; }
                break;
            case 'away':
                // Off the screen, stashing; back in a while.
                this.wait -= dt;
                if (this.wait <= 0) {
                    const p = m.randomMeadow(), left = Math.random() < 0.5;
                    this.x = left ? -50 * u : m.W + 50 * u;
                    this.y = p.y;
                    this.go(p.x, p.y, 'wander');
                }
                break;
        }
    }

    arrive() {
        if (this.state === 'fetch') { this.state = 'pick'; this.wait = 0.45; return; }
        const off = this.x < -20 * this.m.u || this.x > this.m.W + 20 * this.m.u;
        if ((this.state === 'carry' || this.state === 'flee') && off) {
            // Gone over the edge with the food (a startled one, empty-pawed).
            if (this.apple) { this.apple.state = 'gone'; this.apple = null; this.eaten++; }
            this.state = 'away';
            this.wait = 5 + Math.random() * 12;
            return;
        }
        this.state = 'sit';
        this.wait = 1.2 + Math.random() * 4;
    }

    // Origin at the feet. `px` is the size of one unit on screen.
    draw(g) {
        if (this.state === 'away') return;
        const m = this.m, px = 1.9 * m.u * m.depth(this.y);
        const moving = ['fetch', 'wander', 'carry', 'flee'].includes(this.state);
        const bound = moving ? Math.abs(Math.sin(this.gait)) : 0;
        g.save();
        g.translate(this.x, this.y - bound * 5 * px);
        g.scale(this.dir * px, px);
        const tail = Math.sin(this.tail) * (moving ? 3 : 5);
        const fur = '#a85a2a', dark = '#7a3e1c', belly = '#ecd6ae';
        // The tail: a big fluffy question mark behind, flicking.
        g.fillStyle = fur;
        g.strokeStyle = '#d8964a';
        g.lineWidth = 1;
        g.beginPath();
        if (moving) {
            g.moveTo(-8, -7);
            g.bezierCurveTo(-22, -9 + tail * 0.3, -20, -26, -9 + tail * 0.5, -23);
            g.bezierCurveTo(-14, -17, -12, -11, -6, -4);
        } else {
            g.moveTo(-4, -2);
            g.bezierCurveTo(-18, 0, -20, -20 + tail * 0.3, -10 + tail * 0.4, -29);
            g.bezierCurveTo(-5 + tail * 0.4, -33, 0 + tail * 0.2, -24, -4, -14);
        }
        g.closePath();
        g.fill();
        g.stroke();
        // Body, belly, haunch.
        g.fillStyle = fur;
        g.beginPath();
        if (moving) g.ellipse(0, -8, 11, 6, -0.12, 0, Math.PI * 2);
        else g.ellipse(0, -10, 6.5, 10, 0.12, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = belly;
        g.beginPath();
        if (moving) g.ellipse(3, -6.5, 6, 3, -0.1, 0, Math.PI * 2);
        else g.ellipse(2.4, -10, 3.4, 7, 0.1, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = dark;
        g.beginPath();
        if (moving) g.ellipse(-6, -5, 4.6, 4, 0, 0, Math.PI * 2); else g.ellipse(-3, -4, 4.4, 4.4, 0, 0, Math.PI * 2);
        g.fill();
        // Head.
        const hx = moving ? 11 : 4, hy = moving ? -11 : -22;
        g.fillStyle = fur;
        g.beginPath();
        g.arc(hx, hy, 5.2, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.moveTo(hx - 3.6, hy - 3.6);
        g.lineTo(hx - 3.2, hy - 8.2);
        g.lineTo(hx - 0.6, hy - 4.6);
        g.moveTo(hx + 0.8, hy - 4.8);
        g.lineTo(hx + 2.4, hy - 8.4);
        g.lineTo(hx + 4, hy - 3.6);
        g.fill();
        g.fillStyle = belly;
        g.beginPath();
        g.ellipse(hx + 2.4, hy + 1.6, 3, 2.3, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#2a1a12';
        g.beginPath();
        g.arc(hx + 5, hy + 0.6, 0.9, 0, Math.PI * 2);   // nose
        g.fill();
        if (this.blink > 0) { g.beginPath(); g.arc(hx + 2.2, hy - 1.2, 1, 0, Math.PI * 2); g.fill(); }
        else { g.fillRect(hx + 1.2, hy - 1.3, 2, 0.5); }
        // Paws: tucked at the chest; fiddling with a nibble when sitting.
        if (!moving || this.apple) {
            g.fillStyle = dark;
            const nib = this.state === 'sit' ? Math.sin(this.t * 14) * 0.6 : 0;
            g.beginPath();
            g.ellipse(hx + 1.5 + nib, hy + 5.4, 1.6, 1.2, 0, 0, Math.PI * 2);
            g.fill();
        }
        // The apple, held up in front, or being nibbled.
        if (this.apple) {
            const acorn = this.apple.type === 'acorn', sprite = acorn ? m.sprites.acorn : m.sprites.apples[this.apple.kind % m.sprites.apples.length];
            const as = acorn ? 6 : 9;
            g.drawImage(sprite, hx + 1.5 - as * 0.8, hy + 5 - as * 1.05, as * 1.6, as * 1.6);
        }
        g.restore();
    }
}

// ---- Turkeys ---------------------------------------------------------------------------------

// A turkey strolls the meadow, stops to peck, and sometimes shows off its
// tail. It would rather not be near the pointer. In Thanksgiving week it is
// a good deal more full of itself.
class HarvestTurkey {
    constructor(m, x, y) {
        this.m = m;
        this.x = x; this.y = y;
        this.dir = Math.random() < 0.5 ? -1 : 1;
        this.state = 'idle';
        this.wait = 1 + Math.random() * 3;
        this.t = Math.random() * 10;
        this.gait = 0;
        this.fan = 0;               // 0 folded, 1 spread
        this.fanning = false;
        this.peck = 0;
        this.target = null;
        this.scale = 0.9 + Math.random() * 0.25;
        this.tone = Math.random();
    }

    update(dt) {
        const m = this.m, u = m.u, s = m.depth(this.y) * this.scale;
        this.t += dt;
        this.fan += ((this.fanning ? 1 : 0) - this.fan) * harvestEase(3, dt);
        // Run from the pointer.
        if (m.pointer.active && this.state !== 'run' && Math.hypot(m.pointer.x - this.x, (m.pointer.y - this.y) * 1.2) < 90 * u * s) {
            const away = this.x < m.pointer.x ? -1 : 1;
            this.go(harvestClamp(this.x + away * (160 + Math.random() * 120) * u, 20 * u, m.W - 20 * u), this.y + (Math.random() - 0.5) * 50 * u, 'run');
            this.fanning = false;
        }
        switch (this.state) {
            case 'idle':
                this.wait -= dt;
                this.peck = 0;
                if (this.wait <= 0) {
                    const r = Math.random(), festive = m.holiday === 'day' ? 0.35 : m.holiday === 'week' ? 0.22 : 0.1;
                    if (r < festive) { this.state = 'show'; this.wait = 3.5 + Math.random() * 2; this.fanning = true; }
                    else if (r < 0.5) { this.state = 'peck'; this.wait = 2 + Math.random() * 2.5; }
                    else { const p = m.randomMeadow(); this.go(p.x, p.y, 'walk'); }
                }
                break;
            case 'show':
                this.wait -= dt;
                if (this.wait <= 0) { this.fanning = false; this.state = 'idle'; this.wait = 1.5 + Math.random() * 2; }
                break;
            case 'peck':
                this.wait -= dt;
                this.peck = Math.max(0, Math.sin(this.t * 6.2)) ;
                if (this.wait <= 0) { this.state = 'idle'; this.wait = 0.5 + Math.random() * 1.5; this.peck = 0; }
                break;
            case 'walk': case 'run': {
                const t = this.target, speed = (this.state === 'run' ? 100 : 26) * u * s;
                const dx = t.x - this.x, dy = t.y - this.y, dist = Math.hypot(dx, dy * 1.5);
                if (dist < 3 * u) { this.state = 'idle'; this.wait = 0.5 + Math.random() * 2.5; break; }
                const step = Math.min(dist, speed * dt);
                this.x += dx / dist * step;
                this.y += dy / dist * step / 1.5;
                this.dir = dx < 0 ? -1 : 1;
                this.gait += dt * (this.state === 'run' ? 16 : 6);
                break;
            }
        }
    }

    go(x, y, state) {
        const m = this.m;
        this.target = { x, y: harvestClamp(y, m.meadowMin, m.meadowMax) };
        this.state = state;
        this.dir = x < this.x ? -1 : 1;
    }

    draw(g) {
        const m = this.m, px = 1.7 * m.u * m.depth(this.y) * this.scale;
        const walking = this.state === 'walk' || this.state === 'run';
        const sw = Math.sin(this.gait), bob = walking ? Math.abs(sw) * 1.2 : 0;
        g.save();
        g.translate(this.x, this.y);
        g.scale(this.dir * px, px);
        // Shadow.
        g.fillStyle = 'rgba(20,25,5,0.25)';
        g.beginPath();
        g.ellipse(0, 0, 13, 2.6, 0, 0, Math.PI * 2);
        g.fill();
        // Legs.
        g.strokeStyle = '#c98a5a';
        g.lineWidth = 1.5;
        for (const k of [-1, 1]) {
            const swing = walking ? sw * 4 * k : 0;
            g.beginPath();
            g.moveTo(k * 1.5 - 1, -10);
            g.lineTo(k * 1.5 - 1 + swing * 0.6, -1);
            g.lineTo(k * 1.5 + 1.5 + swing * 0.6, 0);
            g.stroke();
        }
        // The tail: closed feathers when folded, a fan when showing off.
        const spread = 0.35 + 1.15 * this.fan, count = 11, len = 14 + 9 * this.fan;
        const tones = ['#7a3e1e', '#b8742a', '#e8d6a8', '#a8501e', '#6a4a2a'];
        for (let i = 0; i < count; i++) {
            const ang = -Math.PI / 2 + 0.55 - (i / (count - 1)) * spread * 2 + (this.fan > 0.05 ? Math.sin(this.t * 22 + i) * 0.015 * this.fan : 0);
            g.fillStyle = tones[i % tones.length];
            g.save();
            g.translate(-8, -15 - bob);
            g.rotate(ang - Math.PI / 2 - 0.2);
            g.beginPath();
            g.ellipse(0, -len * 0.6, 2.6 + this.fan * 1.2, len * 0.62, 0, 0, Math.PI * 2);
            g.fill();
            if (this.fan > 0.3) { g.fillStyle = 'rgba(255,240,200,0.55)'; g.beginPath(); g.ellipse(0, -len * 1.05, 1.1, 1.6, 0, 0, Math.PI * 2); g.fill(); }
            g.restore();
        }
        // The body, its breast, a folded wing.
        g.fillStyle = '#6e4224';
        g.beginPath();
        g.ellipse(0, -15 - bob, 13, 9.4, -0.1, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#8a5a30';
        g.beginPath();
        g.ellipse(4.4, -13.4 - bob, 7.6, 6.2, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#4a2a14';
        g.lineWidth = 1;
        g.beginPath();
        g.ellipse(-2, -16 - bob, 8, 5.6, -0.2, 0.2, Math.PI * 1.35);
        g.stroke();
        for (let i = 0; i < 4; i++) { g.fillStyle = '#c89a52'; g.beginPath(); g.arc(-5 + i * 2.8, -12.4 - bob, 0.9, 0, Math.PI * 2); g.fill(); }
        // Neck and head: up and forward, or down at the grass when pecking.
        const dip = this.peck, nx = 10 + dip * 5, ny = -21 - bob + dip * 17, bobH = walking ? Math.sin(this.gait * 2) * 1.2 : 0;
        g.strokeStyle = '#7e90a6';
        g.lineWidth = 3.2;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(8, -19 - bob);
        g.quadraticCurveTo(10.6 + bobH, -26 - bob + dip * 7, nx + bobH, ny - 5);
        g.stroke();
        g.fillStyle = '#7e90a6';
        g.beginPath();
        g.arc(nx + bobH, ny - 5, 2.7, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#c8322a';          // wattle and snood
        g.beginPath();
        g.ellipse(nx + 2 + bobH, ny - 1.4, 1.2, 3, 0.1, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.ellipse(nx + 1.2 + bobH, ny - 8, 0.9, 2, -0.2, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#e8b050';
        g.beginPath();
        g.moveTo(nx + 3.8 + bobH, ny - 5.6);
        g.lineTo(nx + 6.4 + bobH, ny - 4.6);
        g.lineTo(nx + 3.8 + bobH, ny - 3.8);
        g.fill();
        g.fillStyle = '#1a1210';
        g.beginPath();
        g.arc(nx + 1.9 + bobH, ny - 5.8, 0.6, 0, Math.PI * 2);
        g.fill();
        g.restore();
    }
}

// ---- The scarecrow and its crow --------------------------------------------------------------

// A pumpkin-headed scarecrow in a plaid shirt, straw blowing from its
// cuffs, with a crow on its shoulder that flies off now and then and
// comes back. When the Great Pumpkin rises it turns to look.
class HarvestScarecrow {
    constructor(m) {
        this.m = m;
        this.look = 0;
        this.crow = { state: 'perch', t: 0, wait: 30 + Math.random() * 40, x: 0, y: 0, hop: 0 };
    }

    update(dt) {
        const m = this.m, c = this.crow, u = m.u;
        // Head toward the great pumpkin, or back to the middle.
        const aim = m.great.state === 'rise' ? Math.sign(m.great.x - m.L.scarecrow.x) * 0.9 : 0;
        this.look += (aim - this.look) * harvestEase(2, dt);
        c.t += dt;
        const home = this.perch();
        if (c.state === 'perch') {
            c.wait -= dt;
            c.x = home.x; c.y = home.y;
            if (c.wait <= 0) this.scare();
        } else if (c.state === 'away') {
            c.x += c.vx * dt; c.y += c.vy * dt;
            if (c.x < -60 || c.x > m.W + 60 || c.y < -60) { c.state = 'gone'; c.wait = 18 + Math.random() * 30; }
        } else if (c.state === 'gone') {
            c.wait -= dt;
            if (c.wait <= 0) { c.state = 'return'; c.x = home.x > m.W / 2 ? m.W + 40 : -40; c.y = home.y - 140 * u; }
        } else if (c.state === 'return') {
            const dx = home.x - c.x, dy = home.y - c.y, d = Math.hypot(dx, dy);
            const speed = 120 * u * Math.min(1, 0.3 + d / (150 * u));
            if (d < 3 * u) { c.state = 'perch'; c.wait = 40 + Math.random() * 60; }
            else { c.x += dx / d * speed * dt; c.y += dy / d * speed * dt; }
        }
    }

    scare() {
        const c = this.crow, m = this.m;
        if (c.state !== 'perch') return;
        c.state = 'away';
        c.vx = (Math.random() < 0.5 ? -1 : 1) * (110 + Math.random() * 60) * m.u;
        c.vy = -(60 + Math.random() * 50) * m.u;
    }

    perch() {
        const m = this.m, s = m.L.scarecrow;
        const k = m.depth(s.y) * 0.95 * m.u;
        return { x: s.x + 18 * k, y: s.y - 62 * k };
    }

    draw(g) {
        const m = this.m, p = m.L.scarecrow, k = m.depth(p.y) * 0.95 * m.u;
        const sway = Math.sin(m.time * 1.4) * 0.03 * (0.4 + m.wind), flutter = Math.sin(m.time * 7) * 1.2 * m.wind;
        g.save();
        g.translate(p.x, p.y);
        g.scale(k, k);
        g.rotate(sway);
        // Shadow, post and crosspiece.
        g.fillStyle = 'rgba(20,25,5,0.25)';
        g.beginPath();
        g.ellipse(2, 0, 16, 3, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#6a4a2c';
        g.fillRect(-1.6, -66, 3.2, 66);
        g.fillRect(-26, -54, 52, 3);
        // The shirt, plaid, with a patch.
        g.fillStyle = '#b8402a';
        g.beginPath();
        g.moveTo(-10, -54); g.lineTo(10, -54); g.lineTo(12, -30); g.lineTo(-12, -30); g.closePath();
        g.fill();
        g.strokeStyle = 'rgba(240,200,120,0.7)';
        g.lineWidth = 0.9;
        for (let i = -9; i <= 9; i += 4.5) { g.beginPath(); g.moveTo(i, -54); g.lineTo(i * 1.15, -30); g.stroke(); }
        for (let j = -50; j <= -34; j += 5) { g.beginPath(); g.moveTo(-11, j); g.lineTo(11, j); g.stroke(); }
        g.fillStyle = '#5a7a8a';
        g.fillRect(2, -46, 5, 5);
        // Sleeves and straw at the cuffs and hem.
        g.fillStyle = '#b8402a';
        g.fillRect(-24, -55, 14, 5);
        g.fillRect(10, -55, 14, 5);
        g.strokeStyle = '#d8b848';
        g.lineWidth = 1.2;
        for (const [x0, y0, dir] of [[-24, -52, -1], [24, -52, 1], [-9, -30, -1], [-3, -30, 0], [4, -30, 0.5], [10, -30, 1]]) {
            for (let i = 0; i < 4; i++) {
                g.beginPath();
                g.moveTo(x0 + (i - 1.5) * 0.9, y0 + (dir === 0 || Math.abs(dir) < 1 ? 0 : (i - 1.5)));
                g.lineTo(x0 + dir * (5 + i) + flutter * dir, y0 + 6 + i * 1.4 + (Math.abs(dir) < 1 ? 5 : 0));
                g.stroke();
            }
        }
        // The pumpkin head, its face turning, under a tilted hat.
        const hx = this.look * 3;
        g.fillStyle = '#e07a1f';
        g.beginPath();
        g.ellipse(hx, -69, 11, 9.5, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#c8681a';
        g.beginPath();
        g.ellipse(hx - 5, -69, 4.5, 9, 0, 0, Math.PI * 2);
        g.ellipse(hx + 5, -69, 4.5, 9, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#3a1a08';
        const ex = hx + this.look * 3;
        g.beginPath();
        g.moveTo(ex - 6, -71); g.lineTo(ex - 2, -74); g.lineTo(ex - 2, -70); g.closePath();
        g.moveTo(ex + 6, -71); g.lineTo(ex + 2, -74); g.lineTo(ex + 2, -70); g.closePath();
        g.moveTo(ex - 5, -65); g.lineTo(ex - 2.5, -63); g.lineTo(ex, -65); g.lineTo(ex + 2.5, -63); g.lineTo(ex + 5, -65); g.lineTo(ex + 3, -62); g.lineTo(ex - 3, -62); g.closePath();
        g.fill();
        g.fillStyle = '#5a3e22';
        g.save();
        g.translate(hx + 2, -77);
        g.rotate(0.14);
        g.fillRect(-14, -1, 28, 3);
        g.fillRect(-8, -11, 16, 11);
        g.fillStyle = '#d8a030';
        g.fillRect(-8, -3, 16, 2);
        g.restore();
        g.restore();
        this.drawCrow(g);
    }

    drawCrow(g) {
        const c = this.crow, m = this.m;
        if (c.state === 'gone') return;
        const k = m.depth(m.L.scarecrow.y) * 0.95 * m.u;
        g.save();
        g.translate(c.x, c.y);
        const flying = c.state === 'away' || c.state === 'return';
        const dir = flying ? Math.sign(c.state === 'away' ? c.vx : (m.L.scarecrow.x - c.x)) || 1 : -1;
        g.scale(dir * k, k);
        g.fillStyle = '#17141c';
        g.strokeStyle = '#17141c';
        g.lineWidth = 2;
        g.beginPath();
        g.ellipse(0, 0, 7.5, 4.2, flying ? -0.2 : -0.5, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.arc(7.5, flying ? -3 : -5, 3, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.moveTo(10, flying ? -3.6 : -5.6); g.lineTo(14.5, flying ? -2.4 : -4.4); g.lineTo(10, flying ? -1.4 : -3.2);
        g.fill();
        if (flying) {
            const a = Math.sin(m.time * 16);
            g.beginPath();
            g.moveTo(-1, -1);
            g.quadraticCurveTo(-9, -12 * a - 3, -17, -10 * a);
            g.quadraticCurveTo(-8, -4 * a + 2, 3, 1);
            g.fill();
        } else {
            g.beginPath();                                     // tail and a fidget
            g.moveTo(-6, 1); g.lineTo(-14, 5 + Math.sin(m.time * 2) * 0.6); g.lineTo(-6, 3);
            g.fill();
        }
        g.restore();
    }
}

// ---- The Great Pumpkin ------------------------------------------------------------------------

// Now and then, on a dark night, the most sincere pumpkin in the patch
// wakes: its carving lights, it lifts from the vine on a swirl of sparks,
// and rises over the valley, smaller and higher, until it is a star. Then
// the patch is quiet, and by morning there's a pumpkin there again.
class HarvestGreatPumpkin {
    constructor(m) {
        this.m = m;
        this.state = 'sleep';       // sleep, wake, rise, gone, return
        this.t = 0;
        this.wait = 240 + Math.random() * 600;
        this.glow = 0;
        this.x = 0; this.y = 0;
        this.sparks = [];
        this.shown = false;
    }

    // Wake it now, if it's dark enough; says whether it's going to.
    summon() {
        if (this.state !== 'sleep' && this.state !== 'return') return false;
        this.state = 'wake';
        this.t = 0;
        return true;
    }

    update(dt) {
        const m = this.m, L = m.L, home = L.sincere;
        this.t += dt;
        const dark = m.light.dark;
        switch (this.state) {
            case 'sleep':
                this.x = home.x; this.y = home.y;
                this.glow += (0.0 - this.glow) * harvestEase(1, dt);
                this.wait -= dt * (dark > 0.9 ? 1 : 0);
                if (this.wait <= 0 && m.config.greatPumpkin && m.config.pumpkinPatch) this.summon();
                break;
            case 'wake':
                this.glow = Math.min(1, this.t / 4);
                this.x = home.x; this.y = home.y - Math.sin(Math.min(1, this.t / 4) * Math.PI) * 1.5 * m.u;
                if (this.t > 4.5) { this.state = 'rise'; this.t = 0; if (m.config.callouts) m.host.toast('🎃 …is that the Great Pumpkin?', 6500); }
                break;
            case 'rise': {
                const T = 28, k = Math.min(1, this.t / T), e = k * k * (3 - 2 * k);
                this.glow = 1;
                this.x = home.x + (m.W * 0.46 - home.x) * e * 0.9 + Math.sin(this.t * 0.9) * 8 * m.u;
                this.y = home.y - (home.y - m.H * 0.16) * Math.pow(e, 0.9);
                if (Math.random() < dt * 40) this.spark();
                if (k >= 1) { this.state = 'gone'; this.t = 0; }
                break;
            }
            case 'gone':
                this.glow = 0;
                if (this.t > 30) { this.state = 'return'; this.t = 0; }
                break;
            case 'return':
                if (this.t > 6) { this.state = 'sleep'; this.wait = 420 + Math.random() * 900; }
                this.x = home.x; this.y = home.y;
                break;
        }
        for (const s of this.sparks) { s.age += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy -= 12 * dt * m.u; }
        this.sparks = this.sparks.filter(s => s.age < s.life);
    }

    spark() {
        const m = this.m, a = Math.random() * Math.PI * 2, r = this.size() * 0.55 * Math.random();
        if (this.sparks.length > 90) return;
        this.sparks.push({ x: this.x + Math.cos(a) * r, y: this.y - this.size() * 0.5 + Math.sin(a) * r * 0.6, vx: (Math.random() - 0.5) * 18 * m.u, vy: (Math.random() - 0.2) * 14 * m.u, age: 0, life: 1.2 + Math.random() * 1.6 });
    }

    // On-screen size now, in px: tiny at the end of its climb.
    size() {
        const m = this.m, base = 46 * m.u;
        if (this.state !== 'rise') return base;
        const k = Math.min(1, this.t / 28);
        return base * (1.5 - 1.38 * Math.pow(k, 0.7));
    }

    // 0 while it's gone, rising back to 1 as the patch grows a new one.
    presence() {
        if (this.state === 'gone' || (this.state === 'rise')) return 0;
        if (this.state === 'return') return Math.min(1, this.t / 5);
        return 1;
    }
}

// ---- Cats ------------------------------------------------------------------------------------------

const HARVEST_COATS = [
    { name: 'ginger', body: '#d8802e', belly: '#f2c88a', stripe: '#a85a1c', tabby: true },
    { name: 'grey', body: '#8a8e9a', belly: '#c8ccd4', stripe: '#5e626e', tabby: true },
    { name: 'black', body: '#26232c', belly: '#26232c', stripe: null },
    { name: 'tuxedo', body: '#25232b', belly: '#f2eee6', stripe: null, socks: true },
    { name: 'cream', body: '#e8d2a8', belly: '#f8ecd4', stripe: '#c8a878', tabby: true },
    { name: 'calico', body: '#e8e2d6', belly: '#f8f4ea', stripe: null, patches: ['#d8802e', '#2a2630'] },
    { name: 'brown', body: '#7a5a3e', belly: '#c8a47a', stripe: '#4e3626', tabby: true },
];

// Cats, mostly lazy. Each has its own coat, size and temperament, and
// picks its own perch: a roof, a hay bale, a porch step, the pumpkins, the
// grass under a tree, the warm side of the bonfire after dark. It sleeps
// for a long time, sits up, washes a paw, stretches, sleeps again; once in
// a long while it gets up, stretches, and wanders to somewhere better. It
// watches squirrels with great interest and does absolutely nothing about
// them.
class HarvestCat {
    constructor(m, spot, coat, lazy) {
        this.m = m;
        this.coat = coat;
        this.lazy = lazy;               // 0.55–0.95: how much of its time is sleep
        this.size = 0.85 + Math.random() * 0.3;
        this.spot = spot;
        this.x = spot.x; this.y = spot.y;
        this.dir = Math.random() < 0.5 ? -1 : 1;
        this.state = Math.random() < lazy ? 'sleep' : 'sit';
        this.wait = 10 + Math.random() * 50;
        this.t = Math.random() * 20;
        this.tail = Math.random() * 6;
        this.gait = 0;
        this.blink = 2 + Math.random() * 4;
        this.pose = 0;                  // 0 curled, 1 upright: eased
        this.stretch = 0;
        this.wash = 0;
        this.look = 0;
        this.zs = [];
        this.ear = 0;
    }

    pick(a) { return a[Math.floor(Math.random() * a.length)]; }

    update(dt) {
        const m = this.m;
        this.t += dt;
        this.tail += dt * (this.state === 'walk' ? 4 : this.state === 'watch' ? 7 : 1.1);
        this.blink -= dt;
        if (this.blink < -0.14) this.blink = 2 + Math.random() * 5;
        this.ear = Math.max(0, this.ear - dt * 4);
        const upright = ['sit', 'wash', 'watch', 'walk', 'stretch'].includes(this.state) ? 1 : this.state === 'loaf' ? 0.35 : 0;
        this.pose += (upright - this.pose) * harvestEase(3.5, dt);
        // A squirrel in view, or a pointer close by.
        let watched = null;
        for (const s of m.squirrels) if (s.state !== 'away' && Math.hypot(s.x - this.x, (s.y - this.y) * 1.5) < 150 * m.u) watched = s;
        const near = m.pointer.active && Math.hypot(m.pointer.x - this.x, (m.pointer.y - this.y) * 1.3) < 55 * m.u;
        if (watched && this.state !== 'walk' && this.state !== 'watch') { this.state = 'watch'; this.wait = 3 + Math.random() * 4; }
        if (watched) { this.dir = watched.x < this.x ? -1 : 1; this.ear = 1; }
        switch (this.state) {
            case 'sleep':
                this.wait -= dt;
                if (Math.random() < dt / 7) this.zs.push({ age: 0, x: (Math.random() - 0.5) * 3 });
                if (near && Math.random() < dt * 2) { this.state = 'sit'; this.wait = 6; }
                else if (this.wait <= 0) this.next();
                break;
            case 'loaf': case 'sit':
                this.wait -= dt;
                if (this.wait <= 0) this.next();
                break;
            case 'wash':
                this.wait -= dt;
                this.wash += dt * 9;
                if (this.wait <= 0) this.next();
                break;
            case 'stretch':
                this.wait -= dt;
                this.stretch = Math.sin(Math.min(1, (3 - Math.max(0, this.wait)) / 3) * Math.PI);
                if (this.wait <= 0) { this.stretch = 0; this.state = Math.random() < 0.3 ? 'walk' : 'sit'; this.wait = 3 + Math.random() * 5; if (this.state === 'walk') this.leave(); }
                break;
            case 'watch':
                this.wait -= dt;
                if (this.wait <= 0 && !watched) { this.state = 'sit'; this.wait = 4 + Math.random() * 8; }
                else if (this.wait <= 0) this.wait = 2;
                break;
            case 'walk': {
                const t = this.target, speed = 22 * m.u * (this.spot.s || m.depth(this.y));
                const dx = t.x - this.x, dy = t.y - this.y, dist = Math.hypot(dx, dy * 1.5);
                if (dist < 2 * m.u) { this.x = t.x; this.y = t.y; this.state = Math.random() < this.lazy ? 'loaf' : 'sit'; this.wait = 6 + Math.random() * 14; break; }
                const step = Math.min(dist, speed * dt);
                this.x += dx / dist * step;
                this.y += dy / dist * step / 1.5;
                this.dir = dx < 0 ? -1 : 1;
                this.gait += dt * 7;
                break;
            }
        }
        for (const z of this.zs) z.age += dt;
        this.zs = this.zs.filter(z => z.age < 3.2);
    }

    // What next, for a cat that has done what it was doing.
    next() {
        const r = Math.random();
        if (this.state === 'sleep') {
            this.state = r < 0.4 ? 'loaf' : r < 0.6 ? 'wash' : r < 0.78 ? 'stretch' : 'sit';
            this.wait = this.state === 'stretch' ? 3 : this.state === 'wash' ? 4 + Math.random() * 5 : 5 + Math.random() * 15;
        } else if (r < this.lazy) {
            this.state = 'sleep';
            this.wait = 25 + Math.random() * 110;
        } else if (r < this.lazy + (1 - this.lazy) * 0.5) {
            this.state = 'wash';
            this.wait = 4 + Math.random() * 5;
        } else {
            this.state = 'stretch';
            this.wait = 3;
        }
        if (this.state === 'sleep' && Math.random() < 0.22) { this.state = 'stretch'; this.wait = 3; }
    }

    // Somewhere new, and a long amble to it.
    leave() {
        const m = this.m, spots = m.catSpots.filter(s => s !== this.spot);
        if (!spots.length) { this.state = 'sit'; return; }
        // After dark, the bonfire's warm side is popular.
        const fire = spots.find(s => s.fire);
        const spot = fire && m.light.dark > 0.6 && Math.random() < 0.5 ? fire : this.pick(spots);
        this.spot = spot;
        this.target = { x: spot.x, y: spot.y };
        this.dir = spot.x < this.x ? -1 : 1;
    }

    draw(g) {
        const m = this.m, px = 1.5 * m.u * (this.spot.s || m.depth(this.y)) * this.size;
        const c = this.coat, up = this.pose;
        const walking = this.state === 'walk', sleeping = this.state === 'sleep';
        const breath = 1 + Math.sin(this.t * 1.7) * 0.025 * (sleeping ? 1.5 : 0.7);
        g.save();
        g.translate(this.x, this.y);
        g.scale(this.dir * px, px);
        // The tail: wrapped round the front when curled, upright and swaying when walking.
        const tw = Math.sin(this.tail) * (this.state === 'watch' ? 5 : 2.4);
        g.strokeStyle = c.body;
        g.lineWidth = 3.2;
        g.lineCap = 'round';
        g.beginPath();
        if (walking) {
            g.moveTo(-9, -8);
            g.quadraticCurveTo(-17, -12, -15 + tw * 0.4, -22);
        } else if (up > 0.5) {
            g.moveTo(-6, -2);
            g.bezierCurveTo(-14, 1, -12, 5, -3, 3 + tw * 0.15);
            g.bezierCurveTo(4, 2, 8, 2, 11, 1 + tw * 0.2);
        } else {
            g.moveTo(-9, -3);
            g.bezierCurveTo(-13, 1, -3, 4, 8, 1.5 + tw * 0.1);
        }
        g.stroke();
        // Body.
        g.save();
        g.scale(1, breath);
        g.fillStyle = c.body;
        g.beginPath();
        if (up > 0.5) g.ellipse(-1, -9, 6.5, 9, 0.05, 0, Math.PI * 2);
        else if (walking) g.ellipse(0, -8, 10.5, 5.2, 0, 0, Math.PI * 2);
        else g.ellipse(0, -5.4 - (1 - up) * 0 + up * 2, 11, 5.8 + up * 3, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
        // Markings.
        g.save();
        g.beginPath();
        if (up > 0.5) g.ellipse(-1, -9, 6.5, 9, 0.05, 0, Math.PI * 2);
        else g.ellipse(0, walking ? -8 : -5.4 + up * 2, walking ? 10.5 : 11, walking ? 5.2 : 5.8 + up * 3, 0, 0, Math.PI * 2);
        g.clip();
        if (c.tabby) {
            g.strokeStyle = c.stripe;
            g.lineWidth = 1.3;
            for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(i * 3, -16); g.lineTo(i * 3 + 1.5, -1); g.stroke(); }
        }
        if (c.patches) {
            c.patches.forEach((col, i) => { g.fillStyle = col; g.beginPath(); g.ellipse(-4 + i * 8, -7 - i * 1.5, 4.4, 3.4, 0.5 * i, 0, Math.PI * 2); g.fill(); });
        }
        if (c.belly !== c.body) { g.fillStyle = c.belly; g.beginPath(); g.ellipse(up > 0.5 ? 3 : 5, up > 0.5 ? -7 : -3, up > 0.5 ? 3 : 6, up > 0.5 ? 6 : 3, 0, 0, Math.PI * 2); g.fill(); }
        g.restore();
        // Head, asleep on its paws or up and looking.
        const hx = walking ? 11 : up > 0.5 ? 3 : 9, hy = walking ? -12 : up > 0.5 ? -21 + this.stretch * 8 : -6.5 - up * 6;
        const turn = (this.state === 'watch' ? 1.2 : 0) * Math.sin(this.t * 3) * 0.4;
        g.fillStyle = c.body;
        g.beginPath();
        g.ellipse(hx, hy, 5.4, 4.7, 0, 0, Math.PI * 2);
        g.fill();
        g.beginPath();                                          // ears
        const flick = this.ear > 0 ? Math.sin(this.t * 40) * 0.6 : 0;
        g.moveTo(hx - 4.8, hy - 1.6);
        g.lineTo(hx - 3.6 + flick, hy - 8.4);
        g.lineTo(hx - 0.4, hy - 4);
        g.moveTo(hx + 0.8, hy - 4.2);
        g.lineTo(hx + 3.6, hy - 8.4);
        g.lineTo(hx + 5, hy - 1.8);
        g.fill();
        if (c.belly !== c.body && c.name === 'tuxedo') { g.fillStyle = c.belly; g.beginPath(); g.ellipse(hx + 2.6, hy + 1.4, 2.4, 2.3, 0, 0, Math.PI * 2); g.fill(); }
        if (c.name === 'calico') { g.fillStyle = c.patches[0]; g.beginPath(); g.ellipse(hx - 2, hy - 2, 2.6, 2, 0, 0, Math.PI * 2); g.fill(); }
        if (c.tabby) { g.strokeStyle = c.stripe; g.lineWidth = 0.9; for (const k of [-2, 0, 2]) { g.beginPath(); g.moveTo(hx + k, hy - 4.6); g.lineTo(hx + k, hy - 2.4); g.stroke(); } }
        // Eyes: shut when asleep, a slow blink otherwise; bright when it's dark.
        const open = !sleeping && this.state !== 'loaf' || (this.state === 'loaf' && this.blink > 0 && Math.sin(this.t * 0.4) > 0.3);
        if (open && this.blink > 0) {
            g.fillStyle = m.light.dark > 0.5 ? '#e8f06a' : '#d8c040';
            g.beginPath();
            g.ellipse(hx + 2.6 + turn, hy - 0.4, 1.3, 1.5, 0, 0, Math.PI * 2);
            g.ellipse(hx - 1 + turn, hy - 0.4, 1.3, 1.5, 0, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = '#1a1210';
            g.fillRect(hx + 2.3 + turn, hy - 1.7, 0.6, 2.6);
            g.fillRect(hx - 1.3 + turn, hy - 1.7, 0.6, 2.6);
        } else {
            g.strokeStyle = '#1a1210';
            g.lineWidth = 0.7;
            g.beginPath();
            g.arc(hx + 2.6, hy - 0.6, 1.3, 0.2, Math.PI - 0.2);
            g.arc(hx - 1, hy - 0.6, 1.3, 0.2, Math.PI - 0.2);
            g.stroke();
        }
        g.fillStyle = '#e8a0a0';
        g.beginPath();
        g.arc(hx + 5, hy + 1.4, 0.8, 0, Math.PI * 2);
        g.fill();
        // Paws: a lick of one when washing; white socks on a tuxedo.
        if (this.state === 'wash') {
            g.fillStyle = c.body;
            g.beginPath();
            g.ellipse(hx + 3, hy + 4.4 - Math.abs(Math.sin(this.wash)) * 3, 2, 2.6, 0, 0, Math.PI * 2);
            g.fill();
        }
        if (c.socks) { g.fillStyle = c.belly; for (const px2 of [up > 0.5 ? 1 : 6, up > 0.5 ? 4 : 9]) { g.beginPath(); g.ellipse(px2, -1, 2, 1.2, 0, 0, Math.PI * 2); g.fill(); } }
        // Z's drift up from a sleeper.
        if (sleeping) {
            g.fillStyle = 'rgba(255,248,230,0.8)';
            g.font = 'bold 6px Georgia, serif';
            for (const z of this.zs) {
                g.globalAlpha = Math.min(1, z.age) * Math.max(0, 1 - z.age / 3.2) * 0.85;
                g.fillText('z', hx + 4 + z.x + z.age * 2.5, hy - 6 - z.age * 5);
            }
            g.globalAlpha = 1;
        }
        g.restore();
    }
}
