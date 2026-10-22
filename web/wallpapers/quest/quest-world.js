// ============================================================================
// Pixel Quest world generator
//
// Builds a whole world as plain data -- no canvases -- so it can be tested on
// its own: an overworld grid of rooms joined by openings in their edges,
// caves and houses behind doorways, warp holes, and dungeons laid out as
// trees of rooms with keys, locked doors, a treasure and a boss.
//
// Every room is generated up front and then checked: each exit, doorway and
// landmark must be reachable from the others, and if a pile of rocks gets in
// the way a path is carved through it (water gets a bridge).
// ============================================================================

const QuestWorld = (() => {
    'use strict';

    const QA = (typeof QuestArt !== 'undefined') ? QuestArt : require('./quest-art.js');

    const T = {
        FLOOR: 0, DECOR: 1, WALL: 2, OBST: 3, BUSH: 4, WATER: 5, BRIDGE: 6, PATH: 7,
        PORTAL: 8, HOLE: 9, SIGN: 10, STRUCT: 11, DWALL: 12, DOOR: 13, LOCK: 14, SHUT: 15,
        BLOCK: 16, TORCH: 17, PEDESTAL: 18, FIRE: 19, CWALL: 20, STATUE: 21
    };

    const SOLID = new Uint8Array(32);
    for (const k of [T.WALL, T.OBST, T.BUSH, T.WATER, T.SIGN, T.STRUCT, T.DWALL, T.LOCK, T.SHUT,
        T.BLOCK, T.TORCH, T.PEDESTAL, T.FIRE, T.CWALL, T.STATUE]) SOLID[k] = 1;

    // Cells a path may cross freely. Portals and holes are destinations, never
    // stepping stones, so they are kept out of this set.
    const OPEN = new Uint8Array(32);
    for (const k of [T.FLOOR, T.DECOR, T.BRIDGE, T.PATH, T.DOOR]) OPEN[k] = 1;

    const DIRS = {
        n: { dx: 0, dy: -1, opp: 's', name: 'up' },
        s: { dx: 0, dy: 1, opp: 'n', name: 'down' },
        e: { dx: 1, dy: 0, opp: 'w', name: 'right' },
        w: { dx: -1, dy: 0, opp: 'e', name: 'left' }
    };
    const DIR_KEYS = ['n', 'e', 's', 'w'];

    const SIZES = { tiny: [3, 3], small: [4, 3], medium: [6, 4], large: [8, 5], huge: [10, 7] };

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------
    function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
    function randInt(rng, a, b) { return a + Math.floor(rng() * (b - a + 1)); }
    function shuffle(rng, arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }
    function weighted(rng, weights) {
        const entries = Object.entries(weights).filter(([, w]) => w > 0);
        let total = 0;
        for (const [, w] of entries) total += w;
        let r = rng() * total;
        for (const [k, w] of entries) { r -= w; if (r <= 0) return k; }
        return entries[entries.length - 1][0];
    }

    function regionName(rng, biome) {
        const b = QA.BIOMES[biome];
        return pick(rng, b.adj) + ' ' + pick(rng, b.noun);
    }

    function dungeonName(rng) {
        const W = QA.WORDS;
        return 'The ' + pick(rng, W.dungeonAdj) + ' ' + pick(rng, W.dungeonPlace) + ' of ' + pick(rng, W.dungeonOf);
    }

    function makeRoom(area, rx, ry, cols, rows) {
        return {
            area, rx, ry, cols, rows,
            base: new Uint8Array(cols * rows),
            obj: new Array(cols * rows).fill(null),
            exits: { n: null, s: null, e: null, w: null },
            portals: [], structures: [], spawns: [], items: [], signs: {}, torches: [],
            biome: 'meadow', region: 0, regionName: '',
            visited: false, clearedAt: -1e9, cleared: false, collected: {},
            dark: false, shutter: false, kind: 'normal'
        };
    }

    // Exit cells along an edge, as cell indices on the border
    function exitCells(room, d) {
        const ex = room.exits[d];
        if (!ex) return [];
        const W = room.cols, H = room.rows, out = [];
        for (let i = ex[0]; i <= ex[1]; i++) {
            if (d === 'n') out.push(i);
            else if (d === 's') out.push((H - 1) * W + i);
            else if (d === 'w') out.push(i * W);
            else out.push(i * W + W - 1);
        }
        return out;
    }

    // -----------------------------------------------------------------------
    // Connectivity: flood fill, and a Dijkstra carve for anything cut off
    // -----------------------------------------------------------------------
    function walkable(k) { return OPEN[k] === 1; }

    function flood(room, from) {
        const W = room.cols, H = room.rows, seen = new Uint8Array(W * H);
        const q = [from];
        seen[from] = 1;
        while (q.length) {
            const i = q.pop();
            const x = i % W, y = (i / W) | 0;
            const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
            for (const j of nb) {
                if (j < 0 || seen[j] || !walkable(room.base[j])) continue;
                seen[j] = 1;
                q.push(j);
            }
        }
        return seen;
    }

    function carveCost(room, i) {
        const k = room.base[i];
        const W = room.cols, H = room.rows, x = i % W, y = (i / W) | 0;
        if (walkable(k)) return 1;
        // Never carve the border or any building
        if (x === 0 || y === 0 || x === W - 1 || y === H - 1) return Infinity;
        if (k === T.OBST || k === T.BUSH || k === T.BLOCK || k === T.STATUE) return 4;
        if (k === T.WATER) return 7;
        if (k === T.DWALL && room.area && room.area.kind === 'dungeon') return Infinity;
        return Infinity;
    }

    function carvePath(room, from, reached) {
        const W = room.cols, N = room.base.length;
        const dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1);
        dist[from] = 0;
        // Small grids: a linear-scan Dijkstra is plenty
        const done = new Uint8Array(N);
        for (let iter = 0; iter < N; iter++) {
            let u = -1, best = Infinity;
            for (let i = 0; i < N; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
            if (u < 0) return false;
            done[u] = 1;
            if (reached[u] && u !== from) {
                // Walk back, opening the way
                let v = u;
                while (v >= 0) {
                    const k = room.base[v];
                    if (k === T.WATER) room.base[v] = T.BRIDGE;
                    else if (!walkable(k)) { room.base[v] = T.FLOOR; room.obj[v] = null; }
                    v = prev[v];
                }
                return true;
            }
            const x = u % W, y = (u / W) | 0;
            const nb = [x > 0 ? u - 1 : -1, x < W - 1 ? u + 1 : -1, y > 0 ? u - W : -1, y < room.rows - 1 ? u + W : -1];
            for (const v of nb) {
                if (v < 0 || done[v]) continue;
                const c = carveCost(room, v);
                if (c === Infinity) continue;
                if (dist[u] + c < dist[v]) { dist[v] = dist[u] + c; prev[v] = u; }
            }
        }
        return false;
    }

    // Make every target cell reachable from the first one
    function ensureConnected(room, targets) {
        const list = targets.filter(i => i >= 0);
        if (list.length < 2) return true;
        for (const t of list) if (!walkable(room.base[t])) { room.base[t] = T.FLOOR; room.obj[t] = null; }
        for (let pass = 0; pass < list.length + 2; pass++) {
            const seen = flood(room, list[0]);
            const missing = list.find(t => !seen[t]);
            if (missing === undefined) return true;
            if (!carvePath(room, missing, seen)) return false;
        }
        return false;
    }

    // -----------------------------------------------------------------------
    // Value noise for groves and lakes
    // -----------------------------------------------------------------------
    function noiseField(rng, W, H, scale) {
        const gw = Math.ceil(W / scale) + 2, gh = Math.ceil(H / scale) + 2;
        const g = [];
        for (let i = 0; i < gw * gh; i++) g.push(rng());
        const sm = (t) => t * t * (3 - 2 * t);
        return (x, y) => {
            const fx = x / scale, fy = y / scale;
            const x0 = Math.floor(fx), y0 = Math.floor(fy);
            const tx = sm(fx - x0), ty = sm(fy - y0);
            const a = g[y0 * gw + x0], b = g[y0 * gw + x0 + 1], c = g[(y0 + 1) * gw + x0], d = g[(y0 + 1) * gw + x0 + 1];
            return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
        };
    }

    // -----------------------------------------------------------------------
    // Overworld
    // -----------------------------------------------------------------------
    function generate(opts) {
        const rng = QA.mulberry32(opts.seed);
        const cols = opts.cols, rows = opts.rows;
        const [RX, RY] = SIZES[opts.worldSize] || SIZES.medium;
        const theme = QA.WORLD_THEMES[opts.theme] || QA.WORLD_THEMES.mixed;

        const world = {
            seed: opts.seed, cols, rows, RX, RY,
            areas: [], dungeons: [], start: { rx: Math.floor(RX / 2), ry: RY - 1 },
            regions: [], tunnels: []
        };

        const over = { id: 0, kind: 'overworld', RX, RY, rooms: [], name: 'Overworld' };
        world.areas.push(over);
        world.overworld = over;
        for (let y = 0; y < RY; y++) {
            over.rooms.push([]);
            for (let x = 0; x < RX; x++) over.rooms[y].push(makeRoom(0, x, y, cols, rows));
        }
        const rooms = [];
        for (let y = 0; y < RY; y++) for (let x = 0; x < RX; x++) rooms.push(over.rooms[y][x]);
        const start = over.rooms[world.start.ry][world.start.rx];
        start.kind = 'start';

        // --- Biomes: a Voronoi map of region seeds ---------------------------
        const seedCount = Math.max(3, Math.round(RX * RY / 4));
        const seeds = [{ x: world.start.rx, y: world.start.ry, biome: 'village' }];
        const usedBiomes = {};
        for (let i = 1; i < seedCount; i++) {
            // Damp repeats so a world gets some variety
            const w = { ...theme.weights };
            for (const k in w) w[k] = w[k] / (1 + (usedBiomes[k] || 0) * 0.8);
            const biome = weighted(rng, w);
            usedBiomes[biome] = (usedBiomes[biome] || 0) + 1;
            seeds.push({ x: rng() * RX, y: rng() * (RY - 0.5), biome });
        }
        for (const s of seeds) {
            world.regions.push({ biome: s.biome, name: regionName(rng, s.biome) });
        }
        for (const r of rooms) {
            let best = 0, bd = Infinity;
            seeds.forEach((s, i) => {
                // The village claims only the start room and maybe a neighbour
                const bias = i === 0 ? 1.8 : 1;
                const d = Math.hypot(r.rx + 0.5 - s.x - (i === 0 ? 0.5 : 0), r.ry + 0.5 - s.y - (i === 0 ? 0.5 : 0)) * bias;
                if (d < bd) { bd = d; best = i; }
            });
            r.region = best;
            r.biome = seeds[best].biome;
            r.regionName = world.regions[best].name;
        }
        start.region = 0; start.biome = 'village'; start.regionName = world.regions[0].name;

        // --- Room graph: random spanning tree plus a few loops --------------
        const key = (x, y, d) => `${x},${y},${d}`;
        const edges = new Map();
        const connect = (a, d) => {
            const D = DIRS[d];
            const b = over.rooms[a.ry + D.dy][a.rx + D.dx];
            const len = (d === 'n' || d === 's') ? cols : rows;
            const width = randInt(rng, 2, Math.min(4, len - 6));
            const from = randInt(rng, 2, len - 3 - width);
            a.exits[d] = [from, from + width - 1];
            b.exits[D.opp] = [from, from + width - 1];
            edges.set(key(a.rx, a.ry, d), true);
            edges.set(key(b.rx, b.ry, D.opp), true);
        };
        const visited = new Set([`${start.rx},${start.ry}`]);
        const stack = [start];
        while (stack.length) {
            const cur = stack[stack.length - 1];
            const opts2 = shuffle(rng, DIR_KEYS.slice()).filter(d => {
                const nx = cur.rx + DIRS[d].dx, ny = cur.ry + DIRS[d].dy;
                return nx >= 0 && ny >= 0 && nx < RX && ny < RY && !visited.has(`${nx},${ny}`);
            });
            if (!opts2.length) { stack.pop(); continue; }
            const d = opts2[0];
            const nb = over.rooms[cur.ry + DIRS[d].dy][cur.rx + DIRS[d].dx];
            connect(cur, d);
            visited.add(`${nb.rx},${nb.ry}`);
            stack.push(nb);
        }
        for (const r of rooms) {
            for (const d of ['e', 's']) {
                const nx = r.rx + DIRS[d].dx, ny = r.ry + DIRS[d].dy;
                if (nx >= RX || ny >= RY || r.exits[d]) continue;
                if (rng() < 0.38) connect(r, d);
            }
        }

        // BFS distance from start, used to spread dungeons out
        const distFromStart = roomDistances(over, start);

        // --- Dungeons: far from home and from each other --------------------
        const dungeonCount = Math.max(0, Math.min(opts.dungeonCount, rooms.length - 2));
        const candidates = rooms.filter(r => r !== start);
        const chosen = [];
        for (let i = 0; i < dungeonCount; i++) {
            let best = null, bs = -Infinity;
            for (const r of candidates) {
                if (chosen.includes(r)) continue;
                let minD = Infinity;
                for (const c of chosen) minD = Math.min(minD, Math.abs(c.rx - r.rx) + Math.abs(c.ry - r.ry));
                const s = distFromStart.get(r) * 0.6 + (chosen.length ? Math.min(minD, 6) * 1.4 : 0) + rng() * 1.5;
                if (s > bs) { bs = s; best = r; }
            }
            if (!best) break;
            chosen.push(best);
        }
        // Number them by distance so Level 1 is closest to home
        chosen.sort((a, b) => distFromStart.get(a) - distFromStart.get(b));
        chosen.forEach((r, i) => {
            const portal = { kind: 'dungeon', dungeon: i };
            r.portals.push(portal);
        });

        // --- Caves, houses and tunnels --------------------------------------
        const caveTypes = { gift: 3, shop: 2.5, fountain: 1.6, nap: 1.4, secret: 1.6, trinket: 1.4 };
        const caveCount = Math.max(2, Math.round(rooms.length * 0.32));
        const free = shuffle(rng, rooms.filter(r => r !== start && r.portals.length === 0));
        let caveIdx = 0;
        // Guarantee one gift and one fountain so every world has the classics
        const forced = ['gift', 'fountain', 'shop'];
        for (let i = 0; i < caveCount && caveIdx < free.length; i++) {
            const type = forced[i] || weighted(rng, caveTypes);
            free[caveIdx++].portals.push({ kind: 'cave', caveType: type });
        }
        // Village houses
        for (const r of rooms) {
            if (r.biome !== 'village') continue;
            const n = r === start ? 2 : randInt(rng, 1, 2);
            for (let i = 0; i < n; i++) r.portals.push({ kind: 'house' });
        }
        // Warp holes come in pairs between distant rooms
        const tunnelPairs = rooms.length >= 9 ? Math.max(1, Math.round(rooms.length / 10)) : 0;
        for (let i = 0; i < tunnelPairs; i++) {
            const pool = shuffle(rng, rooms.filter(r => r !== start && r.portals.length < 2));
            let a = null, b = null;
            for (const p of pool) {
                if (!a) { a = p; continue; }
                if (Math.abs(p.rx - a.rx) + Math.abs(p.ry - a.ry) >= 3) { b = p; break; }
            }
            if (!a || !b) break;
            const id = world.tunnels.length;
            const pa = { kind: 'tunnel', tunnel: id, end: 0 };
            const pb = { kind: 'tunnel', tunnel: id, end: 1 };
            a.portals.push(pa);
            b.portals.push(pb);
            world.tunnels.push({ a: { rx: a.rx, ry: a.ry, portal: pa }, b: { rx: b.rx, ry: b.ry, portal: pb }, used: false });
        }

        // The secret cow level: a mysterious red portal in some far corner
        const cowMode = opts.cowLevel || 'sometimes';
        const wantCow = cowMode !== 'never' && (cowMode === 'always' || opts.hero === 'cow' || rng() < 0.35);
        if (wantCow) {
            const spots = rooms.filter(r => r !== start && r.portals.length === 0);
            spots.sort((a, b) => distFromStart.get(b) - distFromStart.get(a));
            const spot = spots[Math.floor(rng() * Math.min(3, spots.length))];
            if (spot) spot.portals.push({ kind: 'cowlevel' });
        }

        // --- Lay out every room ---------------------------------------------
        for (const r of rooms) genOverworldRoom(world, r, rng, opts);
        // A warp hole that found no room to sit in takes its partner with it
        for (const t of world.tunnels) {
            if (t.a.portal.x !== undefined && t.b.portal.x !== undefined) continue;
            t.broken = true;
            for (const end of [t.a, t.b]) {
                const r = over.rooms[end.ry][end.rx];
                if (end.portal.x !== undefined) r.base[end.portal.y * cols + end.portal.x] = T.FLOOR;
                r.portals = r.portals.filter(p => p !== end.portal);
            }
        }

        // Number the dungeons that found a spot, nearest first, so Level 1 is
        // the one closest to home
        const dPortals = [];
        for (const r of rooms) for (const p of r.portals) if (p.kind === 'dungeon') dPortals.push([r, p]);
        dPortals.sort((a, b) => distFromStart.get(a[0]) - distFromStart.get(b[0]));
        dPortals.forEach(([, p], i) => { p.dungeon = i; });

        // --- Interiors ------------------------------------------------------
        for (const r of rooms) {
            for (const p of r.portals) {
                if (p.kind === 'cave') p.area = genCave(world, rng, p.caveType, r, p, opts).id;
                else if (p.kind === 'house') p.area = genCave(world, rng, 'house', r, p, opts).id;
                else if (p.kind === 'cowlevel') p.area = genCowLevel(world, rng, r, p, opts).id;
                else if (p.kind === 'dungeon') {
                    const d = genDungeon(world, rng, p.dungeon, r, p, opts);
                    p.area = d.area.id;
                }
            }
        }

        world.totalShards = world.dungeons.length;
        world.villain = pick(rng, QA.WORDS.villains);
        return world;
    }

    function roomDistances(area, from) {
        const dist = new Map([[from, 0]]);
        const q = [from];
        while (q.length) {
            const r = q.shift();
            for (const d of DIR_KEYS) {
                if (!r.exits[d]) continue;
                const nx = r.rx + DIRS[d].dx, ny = r.ry + DIRS[d].dy;
                const nb = area.rooms[ny] && area.rooms[ny][nx];
                if (!nb || dist.has(nb)) continue;
                dist.set(nb, dist.get(r) + 1);
                q.push(nb);
            }
        }
        return dist;
    }

    // -----------------------------------------------------------------------
    // One overworld room
    // -----------------------------------------------------------------------
    function genOverworldRoom(world, room, rng, opts) {
        const W = room.cols, H = room.rows, base = room.base, obj = room.obj;
        const biome = QA.BIOMES[room.biome];
        const reserved = new Uint8Array(W * H);
        const idx = (x, y) => y * W + x;
        const inside = (x, y) => x >= 1 && y >= 1 && x < W - 1 && y < H - 1;

        // Border
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            if (x === 0 || y === 0 || x === W - 1 || y === H - 1) { base[idx(x, y)] = T.WALL; obj[idx(x, y)] = biome.wall; }
        }
        // Coastal rooms at the edge of the world get sea instead of trees
        if (room.biome === 'beach' || room.biome === 'lake') {
            const edgeSides = [];
            if (room.ry === 0) edgeSides.push('n');
            if (room.ry === world.RY - 1) edgeSides.push('s');
            if (room.rx === 0) edgeSides.push('w');
            if (room.rx === world.RX - 1) edgeSides.push('e');
            for (const d of edgeSides) {
                for (let i = 0; i < (d === 'n' || d === 's' ? W : H); i++) {
                    for (let t = 0; t < (room.biome === 'beach' ? 2 : 1); t++) {
                        const x = d === 'w' ? t : d === 'e' ? W - 1 - t : i;
                        const y = d === 'n' ? t : d === 's' ? H - 1 - t : i;
                        base[idx(x, y)] = T.WATER; obj[idx(x, y)] = null;
                    }
                }
            }
        }

        // Exits, with breathing room inside each opening
        const targets = [];
        for (const d of DIR_KEYS) {
            const cells = exitCells(room, d);
            for (const c of cells) {
                base[c] = T.FLOOR; obj[c] = null;
                const x = c % W, y = (c / W) | 0;
                const ix = x + (d === 'w' ? 1 : d === 'e' ? -1 : 0), iy = y + (d === 'n' ? 1 : d === 's' ? -1 : 0);
                base[idx(ix, iy)] = T.FLOOR; obj[idx(ix, iy)] = null;
                for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
                    const rx = x + ox, ry = y + oy;
                    if (rx >= 0 && ry >= 0 && rx < W && ry < H) reserved[idx(rx, ry)] = 1;
                }
            }
            if (cells.length) {
                const c = cells[Math.floor(cells.length / 2)];
                const x = c % W, y = (c / W) | 0;
                targets.push(idx(x + (d === 'w' ? 1 : d === 'e' ? -1 : 0), y + (d === 'n' ? 1 : d === 's' ? -1 : 0)));
            }
        }

        const reserveRect = (x0, y0, w, h, pad) => {
            for (let y = y0 - pad; y < y0 + h + pad; y++) for (let x = x0 - pad; x < x0 + w + pad; x++) {
                if (x >= 0 && y >= 0 && x < W && y < H) reserved[idx(x, y)] = 1;
            }
        };
        const rectFree = (x0, y0, w, h) => {
            for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
                if (!inside(x, y) || reserved[idx(x, y)] || base[idx(x, y)] !== T.FLOOR) return false;
            }
            return true;
        };

        // Start room pedestal: dead centre, waiting for the shards
        if (room.kind === 'start') {
            const cx = Math.floor(W / 2), cy = Math.floor(H / 2) - 1;
            base[idx(cx, cy)] = T.PEDESTAL;
            room.pedestal = { x: cx, y: cy };
            reserveRect(cx - 1, cy - 1, 3, 3, 1);
            targets.push(idx(cx, cy + 1));
        }

        // Buildings and holes
        for (const p of room.portals) {
            if (p.kind === 'tunnel') {
                // Roomy spot first; in a cramped room settle for any free cell
                // with floor below it
                for (let tries = 0; tries < 400; tries++) {
                    const x = randInt(rng, 1, W - 2), y = randInt(rng, 1, H - 3);
                    if (tries < 200 ? !rectFree(x - 1, y - 1, 3, 3) : !rectFree(x, y, 1, 2)) continue;
                    base[idx(x, y)] = T.HOLE;
                    p.x = x; p.y = y;
                    reserveRect(x - 1, y - 1, 3, 3, 0);
                    targets.push(idx(x, y + 1));
                    break;
                }
                if (p.x === undefined) p.failed = true;
                continue;
            }
            // 3x2 building with its door in the bottom middle
            let placed = false;
            for (let tries = 0; tries < 400 && !placed; tries++) {
                const x = randInt(rng, 1, W - 4);
                // Prefer the upper part of the room, like the classic caves
                const y = tries < 200 ? randInt(rng, 1, Math.max(1, Math.floor(H / 2) - 1)) : randInt(rng, 1, H - 4);
                if (!rectFree(x, y, 3, 3)) continue;
                for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) { base[idx(x + i, y + j)] = T.STRUCT; obj[idx(x + i, y + j)] = null; }
                base[idx(x + 1, y + 1)] = T.PORTAL;
                p.x = x + 1; p.y = y + 1;
                room.structures.push({ kind: p.kind, x, y, w: 3, h: 2, portal: p });
                reserveRect(x, y, 3, 3, 1);
                targets.push(idx(x + 1, y + 2));
                placed = true;
            }
            if (!placed) p.failed = true;
        }
        room.portals = room.portals.filter(p => !p.failed);

        // A sign, sometimes
        if (room.forceSign || (rng() < 0.28 && room.kind !== 'start')) {
            for (let tries = 0; tries < 60; tries++) {
                const x = randInt(rng, 2, W - 3), y = randInt(rng, 2, H - 3);
                if (!rectFree(x, y, 1, 2)) continue;
                base[idx(x, y)] = T.SIGN;
                obj[idx(x, y)] = 'sign';
                room.signs[idx(x, y)] = room.forceSign || pick(rng, QA.WORDS.signs);
                reserveRect(x, y, 1, 2, 0);
                targets.push(idx(x, y + 1));
                break;
            }
        }

        // --- Layout --------------------------------------------------------
        const obstacle = (x, y, name) => {
            if (!inside(x, y)) return false;
            const i = idx(x, y);
            if (reserved[i] || base[i] !== T.FLOOR) return false;
            name = name || pick(rng, biome.obstacles);
            base[i] = (name === biome.cuttable) ? T.BUSH : (name === 'fence' ? T.OBST : T.OBST);
            obj[i] = name;
            return true;
        };
        const water = (x, y) => {
            if (!inside(x, y)) return;
            const i = idx(x, y);
            if (reserved[i] || base[i] !== T.FLOOR) return;
            base[i] = T.WATER; obj[i] = null;
        };

        const layout = room.forceLayout || (room.kind === 'start' ? 'village' : pick(rng, biome.layouts));
        room.layout = layout;
        const density = 1;
        switch (layout) {
            case 'open': {
                const n = Math.round(W * H * 0.03 * density);
                for (let i = 0; i < n; i++) obstacle(randInt(rng, 1, W - 2), randInt(rng, 1, H - 2));
                break;
            }
            case 'scatter': {
                const n = Math.round(W * H * 0.09 * density);
                for (let i = 0; i < n; i++) obstacle(randInt(rng, 1, W - 2), randInt(rng, 1, H - 2));
                break;
            }
            case 'clusters': {
                const n = randInt(rng, 3, 3 + Math.round(W * H / 60));
                for (let c = 0; c < n; c++) {
                    let x = randInt(rng, 2, W - 3), y = randInt(rng, 2, H - 3);
                    const name = pick(rng, biome.obstacles);
                    const len = randInt(rng, 3, 7);
                    for (let s = 0; s < len; s++) {
                        obstacle(x, y, name);
                        const d = DIRS[pick(rng, DIR_KEYS)];
                        x += d.dx; y += d.dy;
                    }
                }
                break;
            }
            case 'mirror': {
                // Zelda-style symmetric arrangements: build the left half and
                // reflect it, sometimes top-to-bottom as well
                const vert = rng() < 0.4;
                const n = randInt(rng, 2, 2 + Math.round(W * H / 90));
                const name = pick(rng, biome.obstacles);
                for (let c = 0; c < n; c++) {
                    const bx = randInt(rng, 2, Math.floor(W / 2) - 1), by = randInt(rng, 2, vert ? Math.floor(H / 2) - 1 : H - 3);
                    const shape = rng() < 0.5 ? [[0, 0], [1, 0], [0, 1], [1, 1]] : rng() < 0.5 ? [[0, 0], [1, 0], [2, 0]] : [[0, 0], [0, 1], [0, 2]];
                    for (const [ox, oy] of shape) {
                        const x = bx + ox, y = by + oy;
                        const mx = W - 1 - x, my = H - 1 - y;
                        obstacle(x, y, name); obstacle(mx, y, name);
                        if (vert) { obstacle(x, my, name); obstacle(mx, my, name); }
                    }
                }
                break;
            }
            case 'grove': {
                const nz = noiseField(rng, W, H, 3.2);
                for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
                    if (nz(x, y) > 0.6) obstacle(x, y, rng() < 0.75 ? biome.obstacles[0] : null);
                }
                break;
            }
            case 'maze': {
                const n = randInt(rng, 3, 6);
                const name = biome.obstacles[0];
                for (let c = 0; c < n; c++) {
                    const horiz = rng() < 0.5;
                    const len = randInt(rng, 3, horiz ? Math.floor(W / 2) : Math.floor(H / 2));
                    const x0 = randInt(rng, 2, W - 3), y0 = randInt(rng, 2, H - 3);
                    for (let s = 0; s < len; s++) obstacle(horiz ? x0 + s : x0, horiz ? y0 : y0 + s, name);
                }
                break;
            }
            case 'ring': {
                const cx = W / 2 - 0.5, cy = H / 2 - 0.5;
                const rx = Math.max(2, W / 2 - 3), ry = Math.max(2, H / 2 - 2.5);
                const name = pick(rng, biome.obstacles);
                const gap = rng() * Math.PI * 2;
                for (let a = 0; a < Math.PI * 2; a += 0.12) {
                    if (Math.abs(((a - gap + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.45) continue;
                    obstacle(Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), name);
                }
                if (rng() < 0.5) obstacle(Math.round(cx), Math.round(cy), 'statue');
                break;
            }
            case 'pond':
            case 'oasis': {
                const cx = randInt(rng, Math.floor(W / 3), Math.ceil(W * 2 / 3)), cy = randInt(rng, Math.floor(H / 3), Math.ceil(H * 2 / 3));
                const rx = randInt(rng, 2, Math.max(2, Math.floor(W / 5))), ry = randInt(rng, 1, Math.max(1, Math.floor(H / 4)));
                for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) {
                    const dx = (x - cx) / (rx + 0.5), dy = (y - cy) / (ry + 0.5);
                    if (dx * dx + dy * dy <= 1) water(x, y);
                }
                const n = Math.round(W * H * 0.05);
                for (let i = 0; i < n; i++) obstacle(randInt(rng, 1, W - 2), randInt(rng, 1, H - 2), layout === 'oasis' ? 'palm' : null);
                break;
            }
            case 'lake': {
                const nz = noiseField(rng, W, H, 4);
                for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
                    const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
                    if (nz(x, y) + Math.min(edge, 3) * 0.06 > 0.62) water(x, y);
                }
                const n = Math.round(W * H * 0.03);
                for (let i = 0; i < n; i++) obstacle(randInt(rng, 1, W - 2), randInt(rng, 1, H - 2));
                break;
            }
            case 'river': {
                const horiz = rng() < 0.5;
                let pos = horiz ? randInt(rng, 3, H - 4) : randInt(rng, 3, W - 4);
                const len = horiz ? W : H;
                for (let s = 1; s < len - 1; s++) {
                    if (rng() < 0.25) pos += rng() < 0.5 ? -1 : 1;
                    pos = Math.max(2, Math.min((horiz ? H : W) - 4, pos));
                    for (let t = 0; t < 2; t++) {
                        if (horiz) water(s, pos + t); else water(pos + t, s);
                    }
                }
                const n = Math.round(W * H * 0.04);
                for (let i = 0; i < n; i++) obstacle(randInt(rng, 1, W - 2), randInt(rng, 1, H - 2));
                break;
            }
            case 'rows': {
                const name = biome.obstacles[0];
                for (let y = 2; y < H - 2; y += 2) for (let x = 2; x < W - 2; x += 3) {
                    if (rng() < 0.75) obstacle(x, y, rng() < 0.85 ? name : null);
                }
                break;
            }
            case 'beach': {
                // Sea along one side the room has no exit on, if there is one
                const sides = DIR_KEYS.filter(d => !room.exits[d]);
                const d = sides.length ? pick(rng, sides) : 's';
                const depth = randInt(rng, 2, Math.max(2, Math.floor((d === 'n' || d === 's' ? H : W) / 3)));
                for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
                    const dd = d === 'n' ? y : d === 's' ? H - 1 - y : d === 'w' ? x : W - 1 - x;
                    if (dd <= depth + (hashCell(x, y, room.rx * 7 + room.ry) < 0.3 ? 1 : 0)) water(x, y);
                }
                const n = Math.round(W * H * 0.04);
                for (let i = 0; i < n; i++) obstacle(randInt(rng, 1, W - 2), randInt(rng, 1, H - 2));
                break;
            }
            case 'village': {
                // Paths between the doors, a fence or two, flower beds
                const fy = randInt(rng, 2, H - 3);
                if (rng() < 0.7) {
                    const fx = randInt(rng, 2, W - 8);
                    for (let x = fx; x < fx + randInt(rng, 3, 6); x++) obstacle(x, fy, 'fence');
                }
                const n = Math.round(W * H * 0.03);
                for (let i = 0; i < n; i++) obstacle(randInt(rng, 1, W - 2), randInt(rng, 1, H - 2), 'bush');
                break;
            }
        }

        // Centre of the room should be reachable too
        targets.push(nearestFloor(room, idx(Math.floor(W / 2), Math.floor(H / 2))));
        ensureConnected(room, targets);

        // Paths: worn trails from each exit toward the middle in some biomes
        if (room.biome === 'village' || (rng() < 0.3 && ['meadow', 'desert', 'mountain', 'autumn'].includes(room.biome))) {
            const centre = nearestFloor(room, idx(Math.floor(W / 2), Math.floor(H / 2)));
            for (const t of targets) layPath(room, t, centre);
        }

        // Decor: flowers, tufts, pebbles -- purely visual
        for (let i = 0; i < W * H; i++) {
            if (base[i] === T.FLOOR && hashCell(i % W, (i / W) | 0, room.rx * 31 + room.ry * 17) < 0.13) base[i] = T.DECOR;
        }

        // Inhabitants
        if (biome.enemies.length && room.kind !== 'start') {
            const n = Math.round(randInt(rng, 2, 4) * (opts.density || 1));
            for (let i = 0; i < n; i++) room.spawns.push({ type: pick(rng, biome.enemies) });
            // Occasionally a tougher cousin wanders in
            if (!biome.noCousins && rng() < 0.25) room.spawns.push({ type: pick(rng, ['redslime', 'blueocto', 'skeleton', 'mage']) });
        }
        // Some rooms have a little reward lying around
        if (rng() < 0.08 && room.kind !== 'start') room.items.push({ id: 'hp', type: 'heartPiece' });
    }

    function hashCell(x, y, s) { return QA.hash2(x, y, s); }

    function nearestFloor(room, from) {
        const W = room.cols;
        let best = from, bd = Infinity;
        for (let i = 0; i < room.base.length; i++) {
            if (!walkable(room.base[i])) continue;
            const d = Math.abs(i % W - from % W) + Math.abs(((i / W) | 0) - ((from / W) | 0));
            if (d < bd) { bd = d; best = i; }
        }
        return best;
    }

    // Trace a walkable path between two cells and mark it as a dirt trail
    function layPath(room, a, b) {
        const W = room.cols, N = room.base.length;
        const prev = new Int32Array(N).fill(-2);
        const q = [a];
        prev[a] = -1;
        while (q.length) {
            const u = q.shift();
            if (u === b) break;
            const x = u % W, y = (u / W) | 0;
            for (const v of [x > 0 ? u - 1 : -1, x < W - 1 ? u + 1 : -1, y > 0 ? u - W : -1, y < room.rows - 1 ? u + W : -1]) {
                if (v < 0 || prev[v] !== -2 || !walkable(room.base[v])) continue;
                prev[v] = u;
                q.push(v);
            }
        }
        if (prev[b] === -2) return;
        let v = b;
        while (v >= 0) {
            if (room.base[v] === T.FLOOR || room.base[v] === T.DECOR) room.base[v] = T.PATH;
            v = prev[v];
        }
    }

    // -----------------------------------------------------------------------
    // The secret cow level: a 3x3 pasture of hostile cows, ruled from the top
    // field by the Cow King. The way back is the portal you came in by.
    // -----------------------------------------------------------------------
    function genCowLevel(world, rng, parent, portal, opts) {
        const RX = 3, RY = 3, cols = world.cols, rows = world.rows;
        const area = { id: world.areas.length, kind: 'cowlevel', RX, RY, rooms: [], name: 'The Secret Cow Level' };
        world.areas.push(area);
        area.parent = { area: 0, rx: parent.rx, ry: parent.ry, x: portal.x, y: portal.y + 1 };
        for (let y = 0; y < RY; y++) {
            area.rooms.push([]);
            for (let x = 0; x < RX; x++) {
                const r = makeRoom(area.id, x, y, cols, rows);
                r.biome = 'pasture';
                r.region = 0;
                r.regionName = 'The Secret Cow Level';
                area.rooms[y].push(r);
            }
        }
        // Every field opens onto its neighbours
        for (let y = 0; y < RY; y++) for (let x = 0; x < RX; x++) {
            const a = area.rooms[y][x];
            for (const d of ['e', 's']) {
                const b = area.rooms[y + DIRS[d].dy] && area.rooms[y + DIRS[d].dy][x + DIRS[d].dx];
                if (!b) continue;
                const len = d === 's' ? cols : rows;
                const width = randInt(rng, 2, Math.min(4, len - 6));
                const from = randInt(rng, 2, len - 3 - width);
                a.exits[d] = [from, from + width - 1];
                b.exits[DIRS[d].opp] = [from, from + width - 1];
            }
        }
        const entrance = area.rooms[RY - 1][1];
        entrance.kind = 'cowentrance';
        entrance.portals.push({ kind: 'cowexit' });
        entrance.forceSign = 'THERE IS NO COW LEVEL.';
        const king = area.rooms[0][1];
        king.kind = 'boss';
        king.boss = 'cowking';
        king.forceLayout = 'open';
        for (const r of area.rooms.flat()) genOverworldRoom(world, r, rng, { ...opts, density: (opts.density || 1) * 1.6 });
        entrance.spawns = [];
        king.spawns = [];
        return area;
    }

    // -----------------------------------------------------------------------
    // Caves, shops, fountains and houses: single-room interiors
    // -----------------------------------------------------------------------
    function genCave(world, rng, type, parent, portal, opts) {
        const area = { id: world.areas.length, kind: 'cave', caveType: type, RX: 1, RY: 1, rooms: [[]] };
        world.areas.push(area);
        area.parent = { area: 0, rx: parent.rx, ry: parent.ry, x: portal.x, y: portal.y + 1 };
        const W = world.cols, H = world.rows;
        const room = makeRoom(area.id, 0, 0, W, H);
        area.rooms[0].push(room);
        room.kind = 'cave';
        room.caveType = type;
        room.biome = parent.biome;
        room.regionName = parent.regionName;
        const base = room.base, idx = (x, y) => y * W + x;
        const thick = H >= 11 ? 2 : 1;
        const wallKind = type === 'house' ? T.DWALL : T.CWALL;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            if (x < thick || y < thick || x >= W - thick || y >= H - thick) base[idx(x, y)] = wallKind;
        }
        const cx = Math.floor(W / 2);
        room.exits.s = [cx - 1, cx];
        room.outside = 's';
        for (let t = 0; t < thick; t++) { base[idx(cx - 1, H - 1 - t)] = T.FLOOR; base[idx(cx, H - 1 - t)] = T.FLOOR; }

        const ny = thick + 1;
        room.npcSpot = { x: cx, y: ny };
        const fire = (x, y) => { if (x > thick && x < W - thick - 1) { base[idx(x, y)] = type === 'house' ? T.TORCH : T.FIRE; room.torches.push({ x, y }); } };
        const iy = ny + 2;
        const W2 = QA.WORDS;
        switch (type) {
            case 'gift':
                fire(cx - 3, ny); fire(cx + 3, ny);
                room.npc = { kind: 'sage', sage: pick(rng, W2.sages) };
                room.text = pick(rng, W2.giftLines);
                room.items.push({ id: 'gift', type: 'gift', x: cx, y: iy });
                break;
            case 'secret':
                fire(cx - 3, ny); fire(cx + 3, ny);
                room.npc = { kind: 'sage', sage: pick(rng, W2.sages) };
                room.text = "IT'S A SECRET TO EVERYBODY.";
                room.items.push({ id: 'secret', type: 'money', amount: pick(rng, [10, 20, 30, 50]), x: cx, y: iy });
                break;
            case 'trinket':
                fire(cx - 3, ny); fire(cx + 3, ny);
                room.npc = { kind: 'sage', sage: pick(rng, W2.sages) };
                room.text = 'I FOUND THIS. I DO NOT KNOW WHAT IT IS. YOU HAVE IT.';
                room.items.push({ id: 'trinket', type: 'trinket', trinket: randInt(rng, 0, W2.trinkets.length - 1), x: cx, y: iy });
                break;
            case 'shop': {
                fire(cx - 4, ny); fire(cx + 4, ny);
                room.npc = { kind: 'shop' };
                room.text = pick(rng, W2.shopLines);
                const stock = shuffle(rng, ['heart', 'potion', 'bombs', 'shield', 'heartContainer', 'trinket', 'heart']).slice(0, 3);
                const prices = { heart: 10, potion: 40, bombs: 20, shield: 60, heartContainer: 150, trinket: 5 };
                stock.forEach((s, i) => room.items.push({ id: 'shop' + i, type: s, price: prices[s], x: cx - 3 + i * 3, y: iy, shop: true,
                    trinket: s === 'trinket' ? randInt(rng, 0, W2.trinkets.length - 1) : undefined }));
                break;
            }
            case 'fountain': {
                room.npc = { kind: 'fountain' };
                room.text = pick(rng, W2.fountainLines);
                const py = Math.floor(H / 2);
                for (let y = py - 1; y <= py + 1; y++) for (let x = cx - 3; x <= cx + 2; x++) {
                    if ((x === cx - 3 || x === cx + 2) && y !== py) continue;
                    base[idx(x, y)] = T.WATER;
                }
                room.pool = { x: cx, y: py };
                room.items.push({ id: 'fairies', type: 'fountain', x: cx, y: py + 2 });
                break;
            }
            case 'nap':
                fire(cx - 3, ny); fire(cx + 3, ny);
                room.npc = { kind: 'bed' };
                room.text = pick(rng, W2.napLines);
                base[idx(cx, ny + 1)] = T.OBST;
                room.obj[idx(cx, ny + 1)] = 'bed';
                room.items.push({ id: 'nap', type: 'nap', x: cx, y: ny + 2 });
                break;
            case 'house':
                room.npc = { kind: 'villager', look: randInt(rng, 0, 3) };
                room.text = pick(rng, W2.houseLines);
                fire(thick + 1, thick); fire(W - thick - 2, thick);
                base[idx(cx - 3, ny + 1)] = T.OBST; room.obj[idx(cx - 3, ny + 1)] = 'table';
                base[idx(cx + 3, ny + 1)] = T.OBST; room.obj[idx(cx + 3, ny + 1)] = 'pot';
                if (rng() < 0.6) room.items.push({ id: 'cookie', type: rng() < 0.5 ? 'heartPiece' : 'trinket', trinket: randInt(rng, 0, W2.trinkets.length - 1), x: cx, y: iy });
                break;
        }
        const exitInner = idx(cx, H - 1 - thick);
        const targets = [exitInner, idx(cx, iy), idx(cx, ny + 1)];
        for (const it of room.items) targets.push(idx(it.x, it.y));
        ensureConnected(room, targets);
        return area;
    }

    // -----------------------------------------------------------------------
    // Dungeons: a tree of rooms grown from the entrance
    // -----------------------------------------------------------------------
    function genDungeon(world, rng, index, parent, portal, opts) {
        const big = (world.RX * world.RY) >= 30;
        const gw = Math.min(6, 3 + (index >= 1 ? 1 : 0) + (big ? 1 : 0));
        const gh = Math.min(6, 3 + (index >= 2 ? 1 : 0) + (big ? 1 : 0));
        const area = { id: world.areas.length, kind: 'dungeon', RX: gw, RY: gh, rooms: [] };
        world.areas.push(area);
        for (let y = 0; y < gh; y++) { area.rooms.push([]); for (let x = 0; x < gw; x++) area.rooms[y].push(null); }
        area.parent = { area: 0, rx: parent.rx, ry: parent.ry, x: portal.x, y: portal.y + 1 };

        const theme = QA.DUNGEON_THEMES[(index + Math.floor(rng() * 3)) % QA.DUNGEON_THEMES.length];
        const pool = shuffle(rng, ['skeleton', 'bat', 'slime', 'redslime', 'ghost', 'mage', 'dustbunny', 'wisp', 'eyeball', 'sock', 'shroom', 'blueocto', 'acorn', 'sporepuff', 'prickle', 'mender']).slice(0, 3);
        const bossKeys = Object.keys(QA.BOSSES);
        let boss = bossKeys[(index + Math.floor(rng() * bossKeys.length)) % bossKeys.length];
        if ((opts.hero === 'cat' || opts.hero === 'coon') && index === 0) boss = 'mechamouse';
        const dungeon = {
            index, name: dungeonName(rng), theme, area, pool, boss,
            entrance: { rx: parent.rx, ry: parent.ry, x: portal.x, y: portal.y },
            edges: new Map(), completed: false, shardTaken: false
        };
        area.dungeon = index;
        area.name = dungeon.name;
        world.dungeons[index] = dungeon;

        // Grow the tree
        const target = Math.min(gw * gh, randInt(rng, 5, 7) + index * 2 + (big ? 2 : 0));
        const sx = Math.floor(gw / 2), sy = gh - 1;
        const nodes = [{ x: sx, y: sy, parent: null, depth: 0, dirFromParent: null }];
        const at = new Map([[`${sx},${sy}`, nodes[0]]]);
        let guard = 0;
        while (nodes.length < target && guard++ < 2000) {
            // Lean toward growing from deep rooms so dungeons have length
            const from = rng() < 0.6 ? nodes[nodes.length - 1 - Math.floor(rng() * Math.min(3, nodes.length))] : pick(rng, nodes);
            const d = pick(rng, DIR_KEYS);
            const nx = from.x + DIRS[d].dx, ny = from.y + DIRS[d].dy;
            if (nx < 0 || ny < 0 || nx >= gw || ny >= gh || at.has(`${nx},${ny}`)) continue;
            // The entrance keeps its south side for the way out
            if (from === nodes[0] && d === 's') continue;
            const n = { x: nx, y: ny, parent: from, depth: from.depth + 1, dirFromParent: d };
            nodes.push(n);
            at.set(`${nx},${ny}`, n);
        }

        const edgeKey = (ax, ay, bx, by) => (ax < bx || (ax === bx && ay < by)) ? `${ax},${ay}|${bx},${by}` : `${bx},${by}|${ax},${ay}`;
        for (const n of nodes) {
            if (!n.parent) continue;
            dungeon.edges.set(edgeKey(n.x, n.y, n.parent.x, n.parent.y), { type: 'open', unlocked: false });
        }

        // Boss: the deepest room
        let bossNode = nodes[0];
        for (const n of nodes) if (n.depth > bossNode.depth || (n.depth === bossNode.depth && rng() < 0.5)) bossNode = n;
        const pathToBoss = [];
        for (let n = bossNode; n.parent; n = n.parent) pathToBoss.unshift(n);

        // Locks along the way to the boss; the boss door is always one
        const lockNodes = [];
        if (pathToBoss.length >= 2) {
            lockNodes.push(bossNode);
            const extra = Math.min(pathToBoss.length - 2, index >= 2 ? 2 : 1);
            const cand = shuffle(rng, pathToBoss.slice(1, -1));
            for (let i = 0; i < extra && i < cand.length; i++) lockNodes.push(cand[i]);
        }
        lockNodes.sort((a, b) => a.depth - b.depth);
        lockNodes.forEach(n => {
            const e = dungeon.edges.get(edgeKey(n.x, n.y, n.parent.x, n.parent.y));
            e.type = 'lock';
            e.boss = n === bossNode;
        });

        // Keys: for lock i, somewhere reachable once locks 0..i-1 are open
        const locksOnPath = (n) => {
            const out = [];
            for (let c = n; c.parent; c = c.parent) {
                const li = lockNodes.indexOf(c);
                if (li >= 0) out.push(li);
            }
            return out;
        };
        const keyRooms = new Set();
        lockNodes.forEach((ln, i) => {
            const region = nodes.filter(n => n !== bossNode && locksOnPath(n).every(li => li < i));
            const fresh = region.filter(n => !keyRooms.has(n) && n !== nodes[0]);
            const choice = fresh.length ? pick(rng, fresh) : pick(rng, region);
            keyRooms.add(choice);
            choice.keys = (choice.keys || 0) + 1;
        });

        // Treasure: a deep room that isn't the boss
        let treasureNode = null;
        for (const n of nodes) {
            if (n === bossNode || n === nodes[0]) continue;
            if (!treasureNode || n.depth + rng() * 0.8 > treasureNode.depth) treasureNode = n;
        }

        // A few loops between rooms in the same lock region
        for (const n of nodes) {
            for (const d of ['e', 's']) {
                const m = at.get(`${n.x + DIRS[d].dx},${n.y + DIRS[d].dy}`);
                if (!m || m === bossNode || n === bossNode) continue;
                const k = edgeKey(n.x, n.y, m.x, m.y);
                if (dungeon.edges.has(k)) continue;
                const a = locksOnPath(n).length, b = locksOnPath(m).length;
                if (a === b && JSON.stringify(locksOnPath(n)) === JSON.stringify(locksOnPath(m)) && rng() < 0.3) {
                    dungeon.edges.set(k, { type: 'open', unlocked: false });
                }
            }
        }

        // Build the rooms
        for (const n of nodes) {
            const room = makeRoom(area.id, n.x, n.y, world.cols, world.rows);
            area.rooms[n.y][n.x] = room;
            room.dungeon = index;
            room.depth = n.depth;
            room.kind = n === nodes[0] ? 'entrance' : n === bossNode ? 'boss' : n === treasureNode ? 'treasure' : 'normal';
            room.keys = n.keys || 0;
            for (const d of DIR_KEYS) {
                const m = at.get(`${n.x + DIRS[d].dx},${n.y + DIRS[d].dy}`);
                if (!m) continue;
                const e = dungeon.edges.get(edgeKey(n.x, n.y, m.x, m.y));
                if (e) room.doors = room.doors || {}, room.doors[d] = { edge: edgeKey(n.x, n.y, m.x, m.y) };
            }
            if (room.kind === 'entrance') { room.doors = room.doors || {}; room.doors.s = { outside: true }; room.outside = 's'; }
            genDungeonRoom(world, room, dungeon, rng, opts);
        }
        return dungeon;
    }

    function genDungeonRoom(world, room, dungeon, rng, opts) {
        const W = room.cols, H = room.rows, base = room.base, obj = room.obj;
        const idx = (x, y) => y * W + x;
        const thick = H >= 11 && W >= 14 ? 2 : 1;
        room.thick = thick;
        room.biome = 'dungeon';
        room.regionName = dungeon.name;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            if (x < thick || y < thick || x >= W - thick || y >= H - thick) base[idx(x, y)] = T.DWALL;
        }
        const cx = Math.floor(W / 2), cy = Math.floor(H / 2);
        const reserved = new Uint8Array(W * H);
        const targets = [];
        // Doors: two cells wide, through the full wall thickness
        for (const d of Object.keys(room.doors || {})) {
            const span = (d === 'n' || d === 's') ? [cx - 1, cx] : [cy - 1, cy];
            room.exits[d] = span;
            room.doorCells = room.doorCells || {};
            room.doorCells[d] = [];
            for (const s of span) {
                for (let t = 0; t < thick; t++) {
                    const x = d === 'w' ? t : d === 'e' ? W - 1 - t : s;
                    const y = d === 'n' ? t : d === 's' ? H - 1 - t : s;
                    base[idx(x, y)] = T.DOOR;
                    room.doorCells[d].push(idx(x, y));
                }
                const ix = d === 'w' ? thick : d === 'e' ? W - 1 - thick : s;
                const iy = d === 'n' ? thick : d === 's' ? H - 1 - thick : s;
                for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
                    const rx = ix + ox, ry = iy + oy;
                    if (rx >= 0 && ry >= 0 && rx < W && ry < H) reserved[idx(rx, ry)] = 1;
                }
                // one more cell inward
                const jx = ix + (d === 'w' ? 1 : d === 'e' ? -1 : 0), jy = iy + (d === 'n' ? 1 : d === 's' ? -1 : 0);
                reserved[idx(jx, jy)] = 1;
            }
            const s = span[0];
            targets.push(idx(d === 'w' ? thick : d === 'e' ? W - 1 - thick : s, d === 'n' ? thick : d === 's' ? H - 1 - thick : s));
        }
        // The middle stays clear for chests, bosses and keys
        for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) reserved[idx(x, y)] = 1;
        targets.push(idx(cx, cy));

        const put = (x, y, kind, name) => {
            if (x < thick || y < thick || x >= W - thick || y >= H - thick) return;
            const i = idx(x, y);
            if (reserved[i] || base[i] !== T.FLOOR) return;
            base[i] = kind; obj[i] = name || null;
        };
        const sym = (x, y, kind, name) => {
            put(x, y, kind, name); put(W - 1 - x, y, kind, name);
            put(x, H - 1 - y, kind, name); put(W - 1 - x, H - 1 - y, kind, name);
        };

        const ix0 = thick, iy0 = thick, iw = W - thick * 2, ih = H - thick * 2;
        let pattern = pick(rng, ['empty', 'pillars', 'pillars', 'blocks', 'ring', 'moat', 'statues', 'checker', 'cross', 'torches']);
        if (room.kind === 'boss') pattern = 'torches';
        if (room.kind === 'entrance') pattern = pick(rng, ['statues', 'torches', 'empty']);
        room.pattern = pattern;
        switch (pattern) {
            case 'pillars':
                for (let y = iy0 + 1; y < iy0 + ih / 2; y += 3) for (let x = ix0 + 1; x < ix0 + iw / 2; x += 3) sym(x, y, T.BLOCK);
                break;
            case 'blocks': {
                const n = randInt(rng, 2, 5);
                for (let i = 0; i < n; i++) sym(randInt(rng, ix0 + 1, cx - 2), randInt(rng, iy0 + 1, cy - 1), T.BLOCK);
                break;
            }
            case 'ring':
                for (let x = cx - 3; x <= cx + 2; x++) { put(x, cy - 2, T.BLOCK); put(x, cy + 2, T.BLOCK); }
                for (let y = cy - 2; y <= cy + 2; y++) { put(cx - 4, y, T.BLOCK); put(cx + 3, y, T.BLOCK); }
                break;
            case 'moat':
                for (let y = iy0 + 1; y < iy0 + ih - 1; y++) for (let x = ix0 + 1; x < ix0 + iw - 1; x++) {
                    const e = Math.min(x - ix0, y - iy0, ix0 + iw - 1 - x, iy0 + ih - 1 - y);
                    if (e === 1) put(x, y, T.WATER);
                }
                break;
            case 'statues':
                for (let y = iy0 + 1; y < cy - 1; y += 2) { sym(ix0 + 1, y, T.STATUE, 'statue'); }
                break;
            case 'checker':
                for (let y = iy0 + 1; y < iy0 + ih - 1; y += 2) for (let x = ix0 + 1; x < ix0 + iw - 1; x += 2) if (rng() < 0.4) put(x, y, T.BLOCK);
                break;
            case 'cross':
                for (let x = ix0 + 2; x < ix0 + iw - 2; x++) if (Math.abs(x - cx) > 2) put(x, cy, T.BLOCK);
                break;
            case 'torches':
                sym(ix0, iy0, T.TORCH);
                break;
        }
        // Torches in corners count as light sources
        for (let i = 0; i < W * H; i++) if (base[i] === T.TORCH) room.torches.push({ x: i % W, y: (i / W) | 0 });
        ensureConnected(room, targets);

        // Contents
        if (room.kind === 'boss') {
            room.boss = dungeon.boss;
        } else if (room.kind !== 'entrance') {
            const n = randInt(rng, 2, 4) + Math.floor(dungeon.index / 2);
            for (let i = 0; i < Math.round(n * (opts.density || 1)); i++) room.spawns.push({ type: pick(rng, dungeon.pool) });
            if (rng() < 0.35) room.shutter = true;
            if (dungeon.index >= 1 && rng() < 0.22) room.dark = true;
        }
        if (room.kind === 'treasure') room.items.push({ id: 'treasure', type: 'chest', contents: 'dungeonItem', x: cx, y: cy });
        for (let k = 0; k < room.keys; k++) {
            // Keys drop when the room is cleared, or sit out if it's empty
            room.items.push({ id: 'key' + k, type: 'key', x: cx + k, y: cy, onClear: room.spawns.length > 0 });
        }
    }

    return { T, SOLID, OPEN, DIRS, DIR_KEYS, SIZES, generate, exitCells, flood, walkable };
})();

if (typeof module !== 'undefined') module.exports = QuestWorld;
