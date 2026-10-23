// Murmuration: the flock and the evening, as pure logic with no DOM, so the
// unit tests can fly thousands of birds in Node (tools/murmuration.test.mjs).
// murmuration.js draws it.
//
// Each starling steers by its seven nearest neighbours, however far away
// they are, not by everything within a radius: the field study behind this
// (Ballerini et al., PNAS 2008) found real starlings track a fixed number of
// neighbours, which is what lets a flock stretch, thin and ripple without
// coming apart. A wave of alarm runs through those same links when a falcon
// strikes, and the banking birds show it as a dark band sweeping the cloud.
//
// The flock flies in three dimensions and is seen from the side, held in a
// flattened, slowly turning ellipsoid of sky. Turned edge-on, the thin
// sheet of birds is a dark ribbon; face-on it's a pale veil: that is where a
// murmuration's shifting shades come from.
//
// Cheap enough for 3,000 birds on a phone (SPEC §4.8):
//   - everything lives in typed arrays, one slot per bird, never reallocated
//   - a counting-sort grid over x and y, rebuilt each step in O(n)
//   - the nearest-neighbour search is amortised: each step refreshes only the
//     birds whose links are due (every 0.1 s), and the steering in between
//     reuses the cached links, so most of a step is n × 7 reads
//   - the grid search stops as soon as no nearer bird can exist

const MURMURATION_K = 7;                 // neighbours each bird follows
const MURMURATION_REFRESH = 0.1;         // seconds between a bird's neighbour searches
const MURMURATION_HOP = 0.055;           // seconds for alarm to pass from bird to bird
const MURMURATION_PULSE = 0.4;           // seconds a bird banks when the wave reaches it

// Bird states.
const BIRD_GONE = 0, BIRD_FLYING = 1, BIRD_LEAVING = 2;

class MurmurationFlock {
    constructor(capacity, random = Math.random) {
        this.capacity = capacity;
        this.random = random;
        this.count = 0;                  // slots in use; gone birds' slots are reused
        const f = () => new Float32Array(capacity);
        this.x = f(); this.y = f(); this.z = f();       // z: towards the viewer
        this.vx = f(); this.vy = f(); this.vz = f();
        this.flap = f();                 // wingbeat phase, in beats
        this.alarmAt = new Float64Array(capacity).fill(-1e9);
        this.alarm = f();                // strength of the wave that reached it
        this.turn = new Int8Array(capacity);
        this.state = new Uint8Array(capacity);
        this.nb = new Int32Array(capacity * MURMURATION_K);
        this.nbCount = new Uint8Array(capacity);
        this.refreshAt = new Float64Array(capacity);
        this.flying = 0;
        this.time = 0;
        // The grid: birds sorted by cell (counting sort), rebuilt every step.
        this.order = new Int32Array(capacity);
        this.cellOf = new Int32Array(capacity);
        this.cellStart = new Int32Array(1);
        this.fillAt = new Int32Array(1);
        this.minX = this.minY = 0;
        this.cell = 1;
        this.cols = this.rows = 1;
        this.found = 0;
        this.bestD = new Float64Array(MURMURATION_K);
        this.bestI = new Int32Array(MURMURATION_K);
    }

    // A bird into a free slot; -1 if the flock is full.
    add(x, y, z, vx, vy, vz) {
        let i = this.count < this.capacity ? this.count : -1;
        if (i < 0) for (let j = 0; j < this.count; j++) if (this.state[j] === BIRD_GONE) { i = j; break; }
        if (i < 0) return -1;
        if (i === this.count) this.count++;
        this.x[i] = x; this.y[i] = y; this.z[i] = z;
        this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
        this.flap[i] = this.random();
        this.alarmAt[i] = -1e9;
        this.alarm[i] = 0;
        this.state[i] = BIRD_FLYING;
        this.nbCount[i] = 0;
        this.refreshAt[i] = this.time;   // searched on its first step
        return i;
    }

    clear() {
        this.count = 0;
        this.flying = 0;
        this.state.fill(BIRD_GONE);
    }

    // Send `n` flying birds away (a lower density): they leave the sky and
    // their slots come free once they're off screen.
    dismiss(n) {
        for (let i = this.count - 1; i >= 0 && n > 0; i--) {
            if (this.state[i] === BIRD_FLYING) { this.state[i] = BIRD_LEAVING; n--; }
        }
    }

    // ---- Neighbours ----------------------------------------------------------

    // The grid covers the flock's bounding box in x and y, with cells about
    // as wide as the typical distance to a seventh neighbour in 3D.
    buildGrid() {
        const { x, y, z, state, count } = this;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let sx = 0, sy = 0, sz = 0, sxx = 0, syy = 0, szz = 0, n = 0;
        for (let i = 0; i < count; i++) {
            if (!state[i]) continue;
            const px = x[i], py = y[i], pz = z[i];
            if (px < minX) minX = px;
            if (px > maxX) maxX = px;
            if (py < minY) minY = py;
            if (py > maxY) maxY = py;
            sx += px; sy += py; sz += pz; sxx += px * px; syy += py * py; szz += pz * pz; n++;
        }
        this.flying = n;
        if (!n) return;
        // The bulk of the flock (2σ each way), not its stragglers.
        const mx = sx / n, my = sy / n, mz = sz / n;
        const volume = 64 * Math.sqrt(Math.max(1, sxx / n - mx * mx)) * Math.sqrt(Math.max(1, syy / n - my * my)) * Math.sqrt(Math.max(1, szz / n - mz * mz));
        let cell = Math.max(2, Math.cbrt(volume / n * MURMURATION_K * 0.24));
        // Never more than 160 × 160 cells, however scattered they are.
        cell = Math.max(cell, (maxX - minX) / 160, (maxY - minY) / 160);
        const cols = Math.floor((maxX - minX) / cell) + 1, rows = Math.floor((maxY - minY) / cell) + 1;
        const cells = cols * rows;
        if (this.cellStart.length < cells + 1) this.cellStart = new Int32Array(cells + 1);
        if (this.fillAt.length < cells) this.fillAt = new Int32Array(cells);
        const start = this.cellStart, at = this.fillAt, order = this.order, cellOf = this.cellOf;
        start.fill(0, 0, cells + 1);
        for (let i = 0; i < count; i++) {
            if (!state[i]) continue;
            const c = ((y[i] - minY) / cell | 0) * cols + ((x[i] - minX) / cell | 0);
            cellOf[i] = c;
            start[c + 1]++;
        }
        for (let c = 0; c < cells; c++) start[c + 1] += start[c];
        for (let c = 0; c < cells; c++) at[c] = start[c];
        for (let i = 0; i < count; i++) if (state[i]) order[at[cellOf[i]]++] = i;
        this.minX = minX; this.minY = minY; this.cell = cell; this.cols = cols; this.rows = rows;
    }

    // The seven nearest birds to bird i, searched ring by ring outwards and
    // stopped once a ring can't hold anything nearer than the seventh. (A
    // bird's distance in 3D is at least its distance in x and y, so the
    // rings' bound holds.)
    search(i) {
        const { x, y, cell, cols, rows } = this;
        const px = x[i], py = y[i];
        const cx = (px - this.minX) / cell | 0, cy = (py - this.minY) / cell | 0;
        this.found = 0;
        for (let r = 0; r <= 4; r++) {
            const x0 = cx - r, x1 = cx + r, y0 = cy - r, y1 = cy + r;
            const gx0 = x0 < 0 ? 0 : x0, gx1 = x1 >= cols ? cols - 1 : x1;
            for (let gx = gx0; gx <= gx1; gx++) {
                if (y0 >= 0) this.visit(y0 * cols + gx, i);
                if (r && y1 < rows) this.visit(y1 * cols + gx, i);
            }
            if (r) {
                const gy0 = y0 + 1 < 0 ? 0 : y0 + 1, gy1 = y1 - 1 >= rows ? rows - 1 : y1 - 1;
                for (let gy = gy0; gy <= gy1; gy++) {
                    if (x0 >= 0) this.visit(gy * cols + x0, i);
                    if (x1 < cols) this.visit(gy * cols + x1, i);
                }
            }
            if (this.found === MURMURATION_K && this.bestD[MURMURATION_K - 1] <= r * r * cell * cell) break;
        }
        const base = i * MURMURATION_K, found = this.found;
        for (let k = 0; k < found; k++) this.nb[base + k] = this.bestI[k];
        this.nbCount[i] = found;
    }

    // Every bird in one grid cell, kept if it's among the nearest so far.
    visit(c, i) {
        const { x, y, z, order, cellStart, bestD, bestI } = this;
        const px = x[i], py = y[i], pz = z[i];
        let found = this.found;
        for (let s = cellStart[c], e = cellStart[c + 1]; s < e; s++) {
            const j = order[s];
            if (j === i) continue;
            const dx = x[j] - px, dy = y[j] - py, dz = z[j] - pz, d = dx * dx + dy * dy + dz * dz;
            if (found === MURMURATION_K && d >= bestD[MURMURATION_K - 1]) continue;
            let k = found < MURMURATION_K ? found++ : MURMURATION_K - 1;
            while (k > 0 && bestD[k - 1] > d) { bestD[k] = bestD[k - 1]; bestI[k] = bestI[k - 1]; k--; }
            bestD[k] = d; bestI[k] = j;
        }
        this.found = found;
    }

    // ---- Flight ----------------------------------------------------------------

    // One step of `dt` seconds. `env` is what the evening asks of the flock:
    //   unit      px per length unit (a hundredth of the sky's short side)
    //   speed     cruising speed, units/s
    //   spacing   how close neighbours sit, units
    //   target    { x, y, axes: [[ex, ey, ez, radius] × 3] }: the ellipsoid of
    //             sky the flock is held in, centred at depth 0
    //   falcon    null, or { x, y, vx, vy }: birds near it scatter and alarm
    //   roost     null, or { x, y, floor, pull }: funnel down, land below floor
    //   bounds    { width, height }: leaving birds are gone once outside
    step(dt, env) {
        this.time += dt;
        const t = this.time;
        this.buildGrid();
        if (!this.flying) return;
        const { x, y, z, vx, vy, vz, state, nb, nbCount, alarmAt, alarm, turn, refreshAt, random, flap } = this;
        const u = env.unit, v0 = env.speed * u;

        // Due birds look around again, and get a nudge of their own: noise
        // per search rather than per step keeps random() off the hot path.
        const kick = 7 * u * Math.sqrt(MURMURATION_REFRESH);
        for (let i = 0; i < this.count; i++) {
            if (state[i] && refreshAt[i] <= t) {
                this.search(i);
                refreshAt[i] = t + MURMURATION_REFRESH * (0.75 + 0.5 * random());
                vx[i] += (random() - 0.5) * kick;
                vy[i] += (random() - 0.5) * kick;
                vz[i] += (random() - 0.5) * kick;
            }
        }

        const sep = env.spacing * u, sep2 = sep * sep;
        const T = env.target, F = env.falcon, R = env.roost;
        const [[e1x, e1y, e1z, a], [e2x, e2y, e2z, b], [e3x, e3y, e3z, c]] = T.axes;
        const falconR = 16 * u, falconR2 = falconR * falconR;
        const fs = F ? Math.sqrt(F.vx * F.vx + F.vy * F.vy) || 1 : 1;
        const vmax = v0 * 2.4;
        const W = env.bounds.width;

        for (let i = 0; i < this.count; i++) {
            const st = state[i];
            if (!st) continue;
            const px = x[i], py = y[i], pz = z[i];
            let ax = 0, ay = 0, az = 0;

            // Topological neighbours: alignment, cohesion, separation, and
            // the alarm wave, all over the same seven links.
            const base = i * MURMURATION_K, k = nbCount[i];
            let n = 0, svx = 0, svy = 0, svz = 0, sdx = 0, sdy = 0, sdz = 0;
            const calm = t - alarmAt[i] > MURMURATION_PULSE * 3;
            let wave = -1, waveStrength = 0.12;
            for (let m = 0; m < k; m++) {
                const j = nb[base + m];
                if (!state[j]) continue;
                const dx = x[j] - px, dy = y[j] - py, dz = z[j] - pz;
                n++;
                svx += vx[j]; svy += vy[j]; svz += vz[j];
                sdx += dx; sdy += dy; sdz += dz;
                const d2 = dx * dx + dy * dy + dz * dz;
                if (d2 < sep2) {
                    const d = Math.sqrt(d2) + 1e-3, push = 60 * u * (1 - d / sep) / d;
                    ax -= dx * push; ay -= dy * push; az -= dz * push;
                }
                if (calm && alarm[j] > waveStrength) {
                    const since = t - alarmAt[j];
                    if (since >= MURMURATION_HOP && since < MURMURATION_HOP + 0.3) { wave = j; waveStrength = alarm[j]; }
                }
            }
            if (n) {
                ax += 2.6 * (svx / n - vx[i]) + 0.25 * (sdx / n);
                ay += 2.6 * (svy / n - vy[i]) + 0.25 * (sdy / n);
                az += 2.6 * (svz / n - vz[i]) + 0.25 * (sdz / n);
            }
            if (wave >= 0) {
                alarmAt[i] = alarmAt[wave] + MURMURATION_HOP;
                alarm[i] = alarm[wave] * 0.97;
                turn[i] = turn[wave];
            }

            if (st === BIRD_LEAVING) {
                // Away from the middle of the sky and off the nearer side.
                ax += (px < W / 2 ? -1 : 1) * v0 * 2;
                ay -= 0.4 * v0;
                if (px < -40 || px > W + 40 || py < -40) { state[i] = BIRD_GONE; continue; }
            } else {
                // Held in its ellipsoid of sky: a soft pull to the middle,
                // and a firm one back in from outside it.
                const dx = px - T.x, dy = py - T.y;
                const l1 = (dx * e1x + dy * e1y + pz * e1z) / a;
                const l2 = (dx * e2x + dy * e2y + pz * e2z) / b;
                const l3 = (dx * e3x + dy * e3y + pz * e3z) / c;
                const e = Math.sqrt(l1 * l1 + l2 * l2 + l3 * l3);
                ax -= 0.02 * dx; ay -= 0.02 * dy; az -= 0.02 * pz;
                if (e > 1) {
                    const pull = 40 * u * Math.min(3, e - 1) / e;
                    ax -= (l1 * e1x + l2 * e2x + l3 * e3x) * pull;
                    ay -= (l1 * e1y + l2 * e2y + l3 * e3y) * pull;
                    az -= (l1 * e1z + l2 * e2z + l3 * e3z) * pull;
                }
                // And never far out of the picture: soft walls at the
                // screen's edges, the top of the sky and above the horizon.
                const S = env.sky;
                if (px < S.left) ax += (S.left - px) * 3;
                else if (px > S.right) ax -= (px - S.right) * 3;
                if (py < S.top) ay += (S.top - py) * 3;
                else if (py > S.bottom && !R) ay -= (py - S.bottom) * 3;
            }

            // Roosting: a vortex over the reed bed that narrows and sinks.
            if (R && st === BIRD_FLYING) {
                const dx = px - R.x, dy = py - R.y, d = Math.sqrt(dx * dx + dy * dy) + 1;
                const p = R.pull * v0 * 2;
                ax += (-dx / d * 0.6 - dy / d * 0.8) * p;
                ay += (-dy / d * 0.6 + dx / d * 0.8) * p + R.pull * v0 * 1.2;
                az -= pz * R.pull * 0.5;
                if (py > R.floor && random() < dt * 4) { state[i] = BIRD_GONE; continue; }
            }

            // The falcon: scatter away from it and from its line of flight,
            // and start a wave of alarm.
            if (F) {
                const dx = px - F.x, dy = py - F.y, d2 = dx * dx + dy * dy;
                if (d2 < falconR2) {
                    const d = Math.sqrt(d2) + 1e-3, close = 1 - d / falconR;
                    // Which side of its path the bird is on, and away from that.
                    const side = (F.vx * dy - F.vy * dx) >= 0 ? 1 : -1;
                    const nx = -F.vy / fs * side, ny = F.vx / fs * side;
                    const push = 650 * u * close * close;
                    ax += (dx / d * 0.6 + nx * 0.8) * push;
                    ay += (dy / d * 0.6 + ny * 0.8) * push;
                    if (calm || alarm[i] < close) {
                        alarmAt[i] = t;
                        alarm[i] = Math.max(0.6, close);
                        turn[i] = side;
                    }
                }
            }

            // The wave makes each bird bank hard one way, briefly: the turn
            // ripples across the flock as the alarm passes.
            const since = t - alarmAt[i];
            let speed = v0;
            if (since < MURMURATION_PULSE) {
                const p = alarm[i] * Math.sin(Math.PI * since / MURMURATION_PULSE);
                const cs = Math.cos(turn[i] * 2.6 * p * dt), sn = Math.sin(turn[i] * 2.6 * p * dt);
                const rvx = vx[i] * cs - vy[i] * sn;
                vy[i] = vx[i] * sn + vy[i] * cs;
                vx[i] = rvx;
                speed *= 1 + 0.5 * p;
            }

            // Cruising speed.
            const sp = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i] + vz[i] * vz[i]) + 1e-3;
            const hold = 2.2 * (speed - sp) / sp;
            let nvx = vx[i] + (ax + hold * vx[i]) * dt;
            let nvy = vy[i] + (ay + hold * vy[i]) * dt;
            let nvz = vz[i] + (az + hold * vz[i]) * dt;
            const ns2 = nvx * nvx + nvy * nvy + nvz * nvz;
            if (ns2 > vmax * vmax) { const ns = vmax / Math.sqrt(ns2); nvx *= ns; nvy *= ns; nvz *= ns; }
            vx[i] = nvx; vy[i] = nvy; vz[i] = nvz;
            x[i] = px + nvx * dt;
            y[i] = py + nvy * dt;
            z[i] = pz + nvz * dt;

            // Faster birds beat faster; the two drawn wing frames follow.
            flap[i] += dt * (7 + 5 * Math.min(2, sp / v0));
        }
    }

    // ---- Measures (tests, and the smoke run) ---------------------------------------

    // How the flock sits: the share of flying birds inside a box, the middle
    // of the flock and its spread (px), birds in an alarm wave, and, given a
    // `link` length, how many separate clouds it's in.
    stats(box = null, link = 0) {
        let n = 0, inside = 0, sx = 0, sy = 0, sxx = 0, syy = 0, alarmed = 0;
        for (let i = 0; i < this.count; i++) {
            if (!this.state[i]) continue;
            const px = this.x[i], py = this.y[i];
            n++; sx += px; sy += py; sxx += px * px; syy += py * py;
            if (box && px >= box.x0 && px <= box.x1 && py >= box.y0 && py <= box.y1) inside++;
            if (this.time - this.alarmAt[i] < MURMURATION_PULSE) alarmed++;
        }
        const mx = n ? sx / n : 0, my = n ? sy / n : 0;
        const out = {
            flying: n, onScreen: n ? inside / n : 0, alarmed, x: mx, y: my,
            spread: n ? Math.sqrt(Math.max(0, sxx / n - mx * mx + syy / n - my * my)) : 0,
        };
        if (link) Object.assign(out, this.clouds(link));
        return out;
    }

    // Clouds of birds as seen on screen, by union-find over the neighbour
    // links shorter than `link` px: how many hold at least 2% of the flock,
    // and the largest one's share.
    clouds(link) {
        const parent = new Int32Array(this.count);
        for (let i = 0; i < this.count; i++) parent[i] = i;
        const find = i => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
        const link2 = link * link;
        for (let i = 0; i < this.count; i++) {
            if (!this.state[i]) continue;
            for (let m = 0; m < this.nbCount[i]; m++) {
                const j = this.nb[i * MURMURATION_K + m];
                if (!this.state[j]) continue;
                const dx = this.x[j] - this.x[i], dy = this.y[j] - this.y[i];
                if (dx * dx + dy * dy < link2) parent[find(i)] = find(j);
            }
        }
        const sizes = new Map();
        let n = 0;
        for (let i = 0; i < this.count; i++) if (this.state[i]) { n++; const r = find(i); sizes.set(r, (sizes.get(r) || 0) + 1); }
        const big = [...sizes.values()].filter(s => s >= n * 0.02);
        return { clouds: big.length, largest: n ? Math.max(0, ...sizes.values()) / n : 0 };
    }
}

// The evening: the flock arrives, swirls for `minutes`, then funnels down
// into the reeds while the sky darkens; after a pause, a new evening starts
// with a new flock. It also flies the falcon when nobody else is.
class MurmurationEvening {
    // options: { birds, capacity, minutes, falcon: 'pointer' | 'auto' | 'off', random }
    constructor(options) {
        this.random = options.random || Math.random;
        this.options = options;
        this.flock = new MurmurationFlock(options.capacity || options.birds, this.random);
        this.wanted = options.birds;       // birds the tier wants in the sky now
        this.phase = 'swirl';
        this.phaseTime = 0;
        this.time = 0;
        this.pointer = null;               // { x, y, vx, vy, at }: the falcon you fly
        this.falcon = null;                // the wild one: { x, y, vx, vy, struck, goal }
        this.nextFalcon = 25 + this.random() * 30;
        this.seed = [0, 1, 2, 3, 4, 5].map(() => this.random() * 6.3);
        this.width = this.height = this.horizon = this.unit = 0;
    }

    // The screen in CSS px; the sky is everything above `horizon`; the
    // flock roosts at `roost` { x, y, floor }.
    resize(width, height, horizon, roost) {
        const first = !this.width;
        this.width = width;
        this.height = height;
        this.horizon = horizon;
        this.roostPoint = roost;
        this.unit = Math.min(width, horizon * 1.25) / 100;
        if (first) this.seedSwirl();
    }

    // The first frame is mid-swirl: a flock already in the sky.
    seedSwirl() {
        const T = this.target(), f = this.flock, s = this.speed() * this.unit;
        const [[e1x, e1y, e1z, a], [e2x, e2y, e2z, b], [e3x, e3y, e3z, c]] = T.axes;
        f.clear();
        const heading = this.random() * Math.PI * 2;
        for (let i = 0; i < this.wanted; i++) {
            // A filled ellipsoid, denser in the middle, all flying one way.
            let l1, l2, l3;
            do { l1 = this.random() * 2 - 1; l2 = this.random() * 2 - 1; l3 = this.random() * 2 - 1; } while (l1 * l1 + l2 * l2 + l3 * l3 > 1);
            l1 *= 0.7 * a; l2 *= 0.7 * b; l3 *= 0.7 * c;
            const h = heading + l2 / b * 0.6;
            f.add(T.x + l1 * e1x + l2 * e2x + l3 * e3x, T.y + l1 * e1y + l2 * e2y + l3 * e3y, l1 * e1z + l2 * e2z + l3 * e3z,
                Math.cos(h) * s, Math.sin(h) * s * 0.4, Math.sin(h) * s * 0.6);
        }
        this.phase = 'swirl';
        this.phaseTime = 0;
    }

    // A new evening's flock streams in from off screen in a few ribbons.
    arrive() {
        const f = this.flock, u = this.unit, s = this.speed() * u;
        f.clear();
        const from = this.random() < 0.5 ? -1 : 1;
        const streams = 3 + (this.random() * 3 | 0);
        for (let i = 0; i < this.wanted; i++) {
            const k = i % streams, lag = this.random();
            const x = from < 0 ? -20 - lag * this.width * 0.9 - k * 40 : this.width + 20 + lag * this.width * 0.9 + k * 40;
            const y = this.horizon * (0.2 + 0.5 * (k + 0.5) / streams) + (this.random() - 0.5) * 10 * u;
            f.add(x, y, (this.random() - 0.5) * 10 * u, -from * s, (this.random() - 0.5) * s * 0.2, 0);
        }
    }

    speed() {
        const roosting = this.phase === 'roost' ? Math.min(1, this.phaseTime / 20) : 0;
        return 15 * (1 - 0.3 * roosting);
    }

    swirlSeconds() { return Math.max(0.5, this.options.minutes) * 60; }

    // How dark the sky is, 0 at dusk to 1 at night.
    darkness() {
        const p = this.phase, t = this.phaseTime;
        if (p === 'arrive') return 0;
        if (p === 'swirl') return 0.3 * Math.min(1, t / this.swirlSeconds());
        if (p === 'roost') return 0.3 + 0.7 * Math.pow(Math.min(1, t / 60), 1.6);
        if (p === 'night') return 1;
        return 1 - Math.min(1, t / 8);   // 'dusk': the next evening's light
    }

    // The ellipsoid of sky the flock is held in: wandering, stretching, and
    // turning about the vertical (yaw) and its long axis (roll), so the
    // sheet of birds is seen now face-on, now edge-on.
    target() {
        const t = this.time, [s0, s1, s2, s3, s4, s5] = this.seed, W = this.width, H = this.horizon, u = this.unit;
        const portrait = H > W;
        const yaw = 1.1 * Math.sin(t * 0.05 + s4) + 0.35 * Math.sin(t * 0.13 + s1);
        const roll = 0.8 + 0.85 * Math.sin(t * 0.1 + s5);
        const tilt = 0.25 * Math.sin(t * 0.08 + s2);                       // long axis off level
        const cy = Math.cos(yaw), sy = Math.sin(yaw), cr = Math.cos(roll), sr = Math.sin(roll);
        const ct = Math.cos(tilt), st = Math.sin(tilt);
        // Long axis: across the sky, tilted, swung into depth by the yaw.
        const e1 = [cy * ct, st, sy * ct];
        // The other two, rolled about the long one.
        const p = [-st * cy, ct, -st * sy], q = [-sy, 0, cy];
        const e2 = [p[0] * cr + q[0] * sr, p[1] * cr + q[1] * sr, p[2] * cr + q[2] * sr];
        const e3 = [-p[0] * sr + q[0] * cr, -p[1] * sr + q[1] * cr, -p[2] * sr + q[2] * cr];
        const breathe = 1 + 0.25 * Math.sin(t * 0.13 + s3), { a, b, c } = this.shape();
        return {
            x: W * (0.5 + (portrait ? 0.08 : 0.2) * Math.sin(t * 0.07 + s0) + 0.06 * Math.sin(t * 0.19 + s1)),
            y: H * (0.45 + 0.12 * Math.sin(t * 0.09 + s2) + 0.05 * Math.sin(t * 0.23 + s3)),
            axes: [[...e1, a * breathe], [...e2, b / breathe], [...e3, c]],
        };
    }

    // The ellipsoid's half-axes at rest, px: long, broad, and thin.
    shape() {
        const W = this.width, H = this.horizon, u = this.unit;
        return H > W ? { a: 0.42 * W, b: 0.11 * H, c: 5 * u } : { a: 0.19 * W, b: Math.min(H * 0.14, 13 * u), c: 4 * u };
    }

    // How far apart the birds sit, in units: far enough that the flock
    // fills its ellipsoid and takes its shape.
    spacing() {
        const { a, b, c } = this.shape(), u = this.unit;
        return Math.min(4, Math.max(0.8, Math.cbrt(1.3 * 4.19 * a * b * c / Math.max(1, this.wanted)) / u));
    }

    // The flock's size for a new density: newcomers fly in, extras leave.
    setBirds(n) {
        const f = this.flock;
        n = Math.min(n, f.capacity);
        this.wanted = n;
        if (this.phase !== 'swirl' && this.phase !== 'arrive') return;
        let flying = 0;
        for (let i = 0; i < f.count; i++) if (f.state[i] === BIRD_FLYING) flying++;
        if (flying > n) f.dismiss(flying - n);
        const s = this.speed() * this.unit;
        for (let i = flying; i < n; i++) {
            const left = this.random() < 0.5;
            const x = left ? -10 - this.random() * 200 : this.width + 10 + this.random() * 200;
            if (f.add(x, this.horizon * (0.2 + 0.5 * this.random()), 0, left ? s : -s, 0, 0) < 0) break;
        }
    }

    update(dt) {
        this.time += dt;
        this.phaseTime += dt;
        const f = this.flock;
        if (this.phase === 'arrive' && this.phaseTime > 30) this.next('swirl');
        else if (this.phase === 'swirl' && this.phaseTime > this.swirlSeconds()) this.next('roost');
        else if (this.phase === 'roost' && (f.flying === 0 || this.phaseTime > 90)) { f.clear(); this.next('night'); }
        else if (this.phase === 'night' && this.phaseTime > 12) this.next('dusk');
        else if (this.phase === 'dusk' && this.phaseTime > 8) { this.next('arrive'); this.arrive(); }

        this.flyFalcon(dt);
        if (this.phase === 'night' || this.phase === 'dusk') return;
        f.step(dt, this.env());
    }

    next(phase) {
        this.phase = phase;
        this.phaseTime = 0;
        if (phase === 'roost') this.falcon = null;
    }

    env() {
        const T = this.target();
        let roost = null;
        if (this.phase === 'roost') {
            // The ellipsoid drifts over the reed bed and shrinks (20 s), then
            // sinks into it (20 s more), and the birds pour down after it.
            const k = Math.min(1, this.phaseTime / 20), sink = Math.max(0, Math.min(1, (this.phaseTime - 20) / 20));
            const R = this.roostPoint;
            T.x += (R.x - T.x) * k;
            T.y += (R.y - this.unit * 10 - T.y) * k + (R.floor + this.unit * 6 - R.y + this.unit * 10) * sink;
            for (const axis of T.axes) axis[3] *= 1 - 0.55 * k - 0.25 * sink;
            roost = { x: R.x, y: R.y, floor: R.floor, pull: 0.15 + 0.85 * Math.min(1, this.phaseTime / 30) };
        }
        return {
            unit: this.unit, speed: this.speed(), spacing: this.spacing(),
            target: T, falcon: this.activeFalcon(), roost, bounds: { width: this.width, height: this.height },
            sky: { left: this.width * 0.04, right: this.width * 0.96, top: this.horizon * 0.08, bottom: this.horizon * 0.88 },
        };
    }

    // You are the falcon while the pointer has moved in the last second.
    pointerFlying() {
        return this.options.falcon === 'pointer' && !!this.pointer && this.time - this.pointer.at < 1;
    }

    activeFalcon() {
        return this.pointerFlying() ? this.pointer : this.falcon;
    }

    // The wild falcon: now and then, from high off one side, it stoops at
    // the flock, passes through and climbs away.
    flyFalcon(dt) {
        const u = this.unit;
        if (!this.falcon) {
            if (this.options.falcon === 'off' || this.phase !== 'swirl' || this.pointerFlying() || this.flock.flying < 50) return;
            this.nextFalcon -= dt;
            if (this.nextFalcon > 0) return;
            this.nextFalcon = 30 + this.random() * 50;
            this.strike();
            return;
        }
        const F = this.falcon;
        if (!F.struck) {
            // Homing on the middle of the flock (or a tapped point) until
            // it gets there.
            const s = F.goal || this.flock.stats();
            const dx = s.x - F.x, dy = s.y - F.y, d = Math.hypot(dx, dy);
            if (d < 4 * u) F.struck = true;
            else {
                const sp = Math.hypot(F.vx, F.vy), k = Math.min(1, dt * 2.5);
                F.vx += (dx / d * sp - F.vx) * k;
                F.vy += (dy / d * sp - F.vy) * k;
            }
        } else {
            F.vy -= 6 * u * dt;   // pulls up and away
        }
        F.x += F.vx * dt;
        F.y += F.vy * dt;
        if (F.struck && (F.x < -60 || F.x > this.width + 60 || F.y < -60 || F.y > this.height)) this.falcon = null;
    }

    // A falcon's pass, starting now: at the flock, or through a point (a tap).
    strike(at = null) {
        const left = at ? at.x > this.width / 2 : this.random() < 0.5;
        const x = left ? -40 : this.width + 40, y = -40 + this.random() * this.horizon * 0.2;
        const goal = at || this.flock.stats();
        const d = Math.hypot(goal.x - x, goal.y - y) || 1, speed = 55 * this.unit;
        this.falcon = { x, y, vx: (goal.x - x) / d * speed, vy: (goal.y - y) / d * speed, struck: false, goal: at };
    }

    // How deep the flock can be, for shading: about the ellipsoid's reach.
    depth() {
        return Math.max(8 * this.unit, this.width * 0.15);
    }
}
