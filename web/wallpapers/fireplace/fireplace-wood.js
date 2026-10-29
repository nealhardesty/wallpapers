// Fireplace: the wood, the coal bed and the grate.
//
// Rounded rectangles with stripes on them read as cartoon pipes. Real
// firewood gets its look from a handful of things, and this file models each
// one:
//
//  - Its silhouette. No log is a cylinder: it tapers, bows, swells at knots
//    and keeps stubs where branches were cut off. Split wood isn't round at
//    all, and shows a band of pale, fibrous split face along its top.
//  - Its end. A cut end shows growth rings around an off-centre pith, radial
//    checks and a bark rim, and a log seen in perspective shows one end only:
//    the one turned toward the viewer.
//  - Its char. Burning wood cracks into the rectangular blocks of alligator
//    char, and it is the cracks between the blocks that glow.
//  - Its light. In a fire, wood is lit from below and between, by the coals
//    and its neighbours, while its top faces a dark room. The flames behind
//    it only catch its upper rim.
//
// Everything here is painted once per resize. Per frame the manager only
// blits each log's body and adds glow sprites whose alpha breathes; the glow
// is cut into feathered zones along each log so that parts of it brighten
// while others sink, the way embers do when air moves through them.
//
// Geometry lives in each log's own space: u runs along its length (0 at its
// middle), y across it, and v is the normalised position across the visible
// side, -1 at the top edge and 1 at the bottom. Texture is laid out evenly
// around the circumference (s, 0..1) and projected, so it crowds toward the
// silhouette the way it does on a real cylinder.

const FIREPLACE_WOODS = {
    // Thick, deeply furrowed grey-brown bark over a dark heartwood
    oak: { bark: 'furrowed', barkColor: [104, 90, 78], barkDark: [34, 27, 22], ridge: [150, 132, 114], wood: [190, 146, 98], heart: [128, 84, 50], barkDepth: 0.1, rings: [18, 34] },
    // Thin papery white bark with dark lenticels, black branch scars and peeling curls
    birch: { bark: 'papery', barkColor: [226, 218, 204], barkDark: [46, 38, 34], ridge: [246, 238, 226], wood: [218, 194, 152], heart: [204, 176, 134], barkDepth: 0.035, rings: [14, 26] },
    // Scaly reddish plates between dark fissures, over pale resinous wood
    pine: { bark: 'plated', barkColor: [160, 92, 58], barkDark: [44, 26, 18], ridge: [200, 130, 88], wood: [228, 194, 136], heart: [204, 140, 84], barkDepth: 0.08, rings: [8, 18] },
    // The bark long gone, the wood bleached silver by sun and salt
    drift: { bark: 'bleached', barkColor: [166, 162, 154], barkDark: [70, 66, 62], ridge: [208, 204, 196], wood: [178, 170, 158], heart: [150, 142, 130], barkDepth: 0, rings: [12, 24] }
};

// What each flame palette burns: [species, cut, weight]
const FIREPLACE_WOOD_MIX = {
    hardwood: [['oak', 'round', 4], ['birch', 'round', 2], ['oak', 'half', 2], ['oak', 'quarter', 2]],
    softwood: [['pine', 'round', 5], ['pine', 'half', 2], ['pine', 'quarter', 3]],
    ember: [['oak', 'round', 4], ['oak', 'half', 3], ['birch', 'round', 1], ['oak', 'quarter', 2]],
    driftwood: [['drift', 'round', 6], ['drift', 'half', 2], ['drift', 'quarter', 1]]
};

// A cell's ten outline points as its four sides: top, right, bottom, left.
// Top and bottom run along the grain; right and left cross it.
const FIREPLACE_CELL_SIDES = [[0, 1, 2], [2, 3, 4, 5], [5, 6, 7], [7, 8, 9, 0]];

// Where a split log's face ends, as v. A half split lies flat side up and
// shows a thin band of face from slightly above; a quarter lies on its bark
// with its apex up, so one of its two faces fills most of its side.
const FIREPLACE_LOG_CUTS = {
    round: -1,
    half: -0.55,
    quarter: 0.25
};

const FireplaceWood = {
    // ------------------------------------------------------------ helpers

    random(seed) {
        let a = seed | 0;
        return function () {
            a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    },

    hash(x, y, seed) {
        let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        h ^= h >>> 16;
        return (h >>> 0) / 4294967296;
    },

    // Seeded value noise, 0..1, so a log's char and glow land in the same
    // places every time it is rebuilt
    noise(x, y, seed) {
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const fx = x - x0;
        const fy = y - y0;
        const u = fx * fx * (3 - 2 * fx);
        const v = fy * fy * (3 - 2 * fy);
        const a = this.hash(x0, y0, seed);
        const b = this.hash(x0 + 1, y0, seed);
        const c = this.hash(x0, y0 + 1, seed);
        const d = this.hash(x0 + 1, y0 + 1, seed);
        return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    },

    clamp01(x) {
        return x < 0 ? 0 : x > 1 ? 1 : x;
    },

    smooth(a, b, x) {
        const t = this.clamp01((x - a) / (b - a));
        return t * t * (3 - 2 * t);
    },

    rgb(c, k = 1) {
        return `rgb(${Math.round(c[0] * k)}, ${Math.round(c[1] * k)}, ${Math.round(c[2] * k)})`;
    },

    rgba(c, a, k = 1) {
        return `rgba(${Math.round(c[0] * k)}, ${Math.round(c[1] * k)}, ${Math.round(c[2] * k)}, ${a})`;
    },

    canvas(width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.ceil(width));
        canvas.height = Math.max(1, Math.ceil(height));
        return canvas;
    },

    // A flat [x0, y0, x1, y1, ...] polygon as the current path
    trace(ctx, pts, close = true) {
        ctx.beginPath();
        ctx.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
        if (close) ctx.closePath();
    },

    path(polys) {
        const path = new Path2D();
        for (const pts of polys) {
            path.moveTo(pts[0], pts[1]);
            for (let i = 2; i < pts.length; i += 2) path.lineTo(pts[i], pts[i + 1]);
            path.closePath();
        }
        return path;
    },

    // Shrinks a polygon toward its centre by about `by` pixels, which is
    // what opens the cracks between blocks of char
    inset(pts, by) {
        let cx = 0;
        let cy = 0;
        const n = pts.length / 2;
        for (let i = 0; i < pts.length; i += 2) {
            cx += pts[i];
            cy += pts[i + 1];
        }
        cx /= n;
        cy /= n;
        const out = new Array(pts.length);
        for (let i = 0; i < pts.length; i += 2) {
            const dx = pts[i] - cx;
            const dy = pts[i + 1] - cy;
            const dist = Math.hypot(dx, dy) || 1;
            const k = 1 - Math.min(by, dist * 0.45) / dist;
            out[i] = cx + dx * k;
            out[i + 1] = cy + dy * k;
        }
        return out;
    },

    // ------------------------------------------------------------ the log

    pickWood(random, palette) {
        const mix = FIREPLACE_WOOD_MIX[palette] || FIREPLACE_WOOD_MIX.hardwood;
        let total = 0;
        for (const entry of mix) total += entry[2];
        let pick = random() * total;
        for (const [species, cut, weight] of mix) {
            pick -= weight;
            if (pick <= 0) return { species, cut };
        }
        return { species: mix[0][0], cut: mix[0][1] };
    },

    // The shape of one log: its outline along its length, its knots and
    // stubs, which end it shows and what that end looks like.
    // `centre` is the screen x the viewer looks from.
    makeLog({ cx, cy, length, radius, angle, row }, random, { palette, centre }) {
        const { species, cut } = this.pickWood(random, palette);
        const wood = FIREPLACE_WOODS[species];
        const L = length;
        const R = radius;
        const split = cut !== 'round';

        const log = {
            cx, cy, length, radius, angle, row,
            seed: Math.floor(random() * 1e6),
            species,
            cut,
            band: FIREPLACE_LOG_CUTS[cut],
            contacts: []
        };

        // A log to one side of the viewer shows the end that points back
        // toward the middle, and each one also lies a little askew
        const lean = (centre - cx) / Math.max(1, centre) * 0.45 + (random() - 0.5) * 0.5;
        log.endSide = lean >= 0 ? 1 : -1;
        log.faceRx = R * (0.2 + Math.min(1, Math.abs(lean)) * 0.32);

        const bow = (random() - 0.5) * 0.22 * R;
        const taper = (random() - 0.5) * 0.3;
        const knots = [];
        const knotCount = 1 + Math.floor(random() * 3);
        for (let i = 0; i < knotCount; i++) {
            knots.push({
                u: (random() * 2 - 1) * L * 0.42,
                // Split wood lies on its bark, so its swellings are underneath
                top: !split && random() < 0.5,
                size: 0.04 + random() * 0.1,
                width: R * (0.25 + random() * 0.45)
            });
        }

        const n = Math.max(16, Math.round(L / 9));
        log.us = new Float32Array(n + 1);
        log.top = new Float32Array(n + 1);
        log.bot = new Float32Array(n + 1);
        for (let i = 0; i <= n; i++) {
            const u = -L / 2 + L * i / n;
            const t = u / L;
            const r = R * (1 + taper * t * 2);
            let up = 0;
            let down = 0;
            for (const knot of knots) {
                const swell = knot.size * Math.exp(-Math.pow((u - knot.u) / knot.width, 2));
                if (knot.top) up += swell;
                else down += swell;
            }
            const wobbleTop = (this.noise(u / (R * 0.8), 0.5, log.seed) - 0.5) * 0.08;
            const wobbleBot = (this.noise(u / (R * 0.8), 7.5, log.seed) - 0.5) * 0.08;
            const axis = bow * (1 - 4 * t * t);
            log.us[i] = u;
            // A split face is flat, so the top edge of split wood barely wanders
            log.top[i] = axis - r * (1 + up + (split ? 0.25 : 1) * wobbleTop);
            log.bot[i] = axis + r * (1 + down + wobbleBot);
        }

        // Stubs of cut-off branches, pointing up out of round wood
        log.stubs = [];
        if (!split && species !== 'drift' && random() < 0.55) {
            log.stubs.push({
                u: (random() * 2 - 1) * L * 0.32,
                lean: (random() - 0.5) * 0.9,
                length: R * (0.16 + random() * 0.22),
                radius: R * (0.12 + random() * 0.1)
            });
        }

        // Knots on the bark surface, away from the silhouette
        log.knots = [];
        const surfaceKnots = split ? 1 : 1 + Math.floor(random() * 3);
        for (let i = 0; i < surfaceKnots; i++) {
            log.knots.push({
                u: (random() * 2 - 1) * L * 0.4,
                s: 0.2 + random() * 0.6,
                size: 0.09 + random() * 0.08
            });
        }

        // The end grain: an off-centre pith (reaction wood), a ring count
        // that suits the species, and radial checks from drying
        log.pith = split ? { x: 0, y: -1 } : { x: (random() - 0.5) * 0.45, y: (random() - 0.5) * 0.4 };
        log.rings = Math.round(wood.rings[0] + random() * (wood.rings[1] - wood.rings[0]));
        log.heart = species === 'birch' || species === 'drift' ? 0 : 0.5 + random() * 0.25;
        log.checks = [];
        const checkCount = split ? 1 + Math.floor(random() * 2) : 2 + Math.floor(random() * 4);
        for (let i = 0; i < checkCount; i++) {
            log.checks.push({
                a: random(),
                length: 0.35 + random() * 0.6,
                width: 0.006 + random() * 0.014
            });
        }
        log.sawAngle = (random() - 0.5) * 1.2;

        return log;
    },

    // The top and bottom edges at u, clamped to the ends
    edges(log, u) {
        const n = log.us.length - 1;
        const f = Math.max(0, Math.min(n, (u + log.length / 2) / log.length * n));
        const i = Math.min(n - 1, Math.floor(f));
        const k = f - i;
        return [
            log.top[i] + (log.top[i + 1] - log.top[i]) * k,
            log.bot[i] + (log.bot[i + 1] - log.bot[i]) * k
        ];
    },

    y(log, u, v) {
        const [top, bot] = this.edges(log, u);
        return top + (v + 1) / 2 * (bot - top);
    },

    regions(log) {
        return log.band > -1 ? ['face', 'bark'] : ['bark'];
    },

    // Even steps around the wood (s) to v across its visible side. Round
    // bark foreshortens at both edges; the bark of split wood only toward
    // the bottom, and a split face is flat, so it doesn't foreshorten at all.
    vOf(log, s, region) {
        if (region === 'face') return -1 + (log.band + 1) * s;
        if (log.band > -1) return log.band + (1 - log.band) * Math.sin(Math.PI / 2 * s);
        return -Math.cos(Math.PI * s);
    },

    // How much a feature at s is squashed by foreshortening, 0.2..1
    fore(log, s, region) {
        if (region === 'face') return 1;
        if (log.band > -1) return Math.max(0.2, Math.cos(Math.PI / 2 * s));
        return Math.max(0.2, Math.sin(Math.PI * s));
    },

    toScreen(log, u, y) {
        const cos = Math.cos(log.angle);
        const sin = Math.sin(log.angle);
        return [log.cx + u * cos - y * sin, log.cy + u * sin + y * cos];
    },

    toLocal(log, x, y) {
        const cos = Math.cos(log.angle);
        const sin = Math.sin(log.angle);
        const dx = x - log.cx;
        const dy = y - log.cy;
        return [dx * cos + dy * sin, -dx * sin + dy * cos];
    },

    // ------------------------------------------------------- the cut end

    // A point on the end face in its own normalised box (-1..1 both ways),
    // at fraction rho of the way out from the pith along direction a (0..1).
    // Round wood is a disc with its rings around an off-centre pith; a half
    // split is a half disc with the pith at the middle of its flat top; a
    // quarter is a wedge, apex up, with the pith at the apex.
    facePoint(log, rho, a) {
        if (log.cut === 'half') {
            const t = Math.PI * a;
            return [rho * Math.cos(t), -1 + 2 * rho * Math.sin(t)];
        }
        if (log.cut === 'quarter') {
            const t = Math.PI / 4 - a * Math.PI / 2;
            return [1.4142 * rho * Math.sin(t), -1 + 2 * rho * Math.cos(t)];
        }
        const t = Math.PI * 2 * a;
        return [log.pith.x * (1 - rho) + rho * Math.cos(t), log.pith.y * (1 - rho) + rho * Math.sin(t)];
    },

    faceFrame(log, end) {
        const x = end * log.length / 2;
        const [top, bot] = this.edges(log, x);
        return { x, y: (top + bot) / 2, rx: log.faceRx, ry: (bot - top) / 2 };
    },

    // The end's outline in local space. Wound the same way as the body, so
    // the body and both ends union cleanly into one silhouette. The hidden
    // end is the back of the log, broken and charred, so it's ragged.
    faceOutline(log, end, ragged) {
        const f = this.faceFrame(log, end);
        const seed = log.seed + (end > 0 ? 3 : 5);
        const pts = [];
        const add = (nx, ny) => pts.push(f.x + nx * f.rx, f.y + ny * f.ry);
        const steps = 40;
        const closed = log.cut === 'round';
        for (let i = 0; i < (closed ? steps : steps + 1); i++) {
            const a = i / steps;
            const rho = 1 + ragged * (this.noise(a * 9, 0.5, seed) - 0.5) * 2;
            const [nx, ny] = this.facePoint(log, rho, a);
            add(nx, ny);
        }
        if (log.cut === 'half') {
            // Back along the flat split, with a little tearing
            for (let i = 1; i < 4; i++) {
                const x = -1 + i / 2;
                add(x, -1 + ragged * (this.noise(i * 3.1, 2.5, seed) - 0.5));
            }
        } else if (log.cut === 'quarter') {
            add(0, -1);
        }
        return pts;
    },

    silhouettePolys(log) {
        const body = [];
        const n = log.us.length;
        for (let i = 0; i < n; i++) body.push(log.us[i], log.top[i]);
        for (let i = n - 1; i >= 0; i--) body.push(log.us[i], log.bot[i]);
        return [body, this.faceOutline(log, log.endSide, 0.025), this.faceOutline(log, -log.endSide, 0.09)];
    },

    // The log's extent in its own space, stubs and both ends included
    box(log) {
        let top = Infinity;
        let bot = -Infinity;
        for (let i = 0; i < log.us.length; i++) {
            top = Math.min(top, log.top[i]);
            bot = Math.max(bot, log.bot[i]);
        }
        const stub = log.stubs.reduce((most, s) => Math.max(most, s.length + s.radius), 0);
        const reach = log.length / 2 + log.faceRx * 1.15 + 3;
        return { x0: -reach, x1: reach, y0: Math.floor(top - stub - 4), y1: Math.ceil(bot + 4), top, bot };
    },

    // The screen rectangle the log's box covers once rotated into place
    screenBox(log) {
        const box = this.box(log);
        const corners = [[box.x0, box.y0], [box.x1, box.y0], [box.x1, box.y1], [box.x0, box.y1]]
            .map(([u, y]) => this.toScreen(log, u, y));
        return {
            x0: Math.floor(Math.min(...corners.map(p => p[0]))),
            y0: Math.floor(Math.min(...corners.map(p => p[1]))),
            x1: Math.ceil(Math.max(...corners.map(p => p[0]))),
            y1: Math.ceil(Math.max(...corners.map(p => p[1])))
        };
    },

    // ------------------------------------------------- char and contacts

    // Where logs touch each other, or sit down in the coals, they burn
    // hardest and glow brightest. Sample each log's top and bottom edges
    // against every other log's outline.
    findContacts(logs, bedTopAt) {
        for (const log of logs) {
            log.contacts = [];
            const R = log.radius;
            const step = R * 0.35;
            for (let u = -log.length / 2; u <= log.length / 2; u += step) {
                const [top, bot] = this.edges(log, u);
                for (const side of [-1, 1]) {
                    const [x, y] = this.toScreen(log, u, side < 0 ? top : bot);
                    let strength = 0;
                    for (const other of logs) {
                        if (other === log) continue;
                        const [ou, oy] = this.toLocal(other, x, y);
                        if (Math.abs(ou) > other.length / 2) continue;
                        const [ot, ob] = this.edges(other, ou);
                        const margin = other.radius * 0.3;
                        const gap = oy < ot ? ot - oy : oy > ob ? oy - ob : 0;
                        if (gap < margin) strength = Math.max(strength, 1 - gap / margin);
                    }
                    if (side > 0 && bedTopAt) {
                        const sink = y - bedTopAt(x);
                        if (sink > -R * 0.3) strength = Math.max(strength, Math.min(1, (sink + R * 0.3) / (R * 0.3)) * 0.9);
                    }
                    if (strength > 0.05) log.contacts.push({ u, v: side, strength });
                }
            }
        }
    },

    contactAt(log, u, v) {
        const width = log.radius * 0.8;
        let most = 0;
        for (const c of log.contacts) {
            const across = 1 - Math.abs(v - c.v) / 1.1;
            if (across <= 0) continue;
            const along = Math.exp(-Math.pow((u - c.u) / width, 2));
            most = Math.max(most, c.strength * along * across);
        }
        return most;
    },

    // How burned the surface is, 0 (fresh bark) to 1 (deep alligator char)
    charAt(log, u, v, charring) {
        const R = log.radius;
        let c = -0.55 + charring * 1.4;
        c += (this.noise(u / (R * 1.3), v * 1.6, log.seed) - 0.5) * 0.9;
        c += (this.noise(u / (R * 0.4), v * 3.5, log.seed + 7) - 0.5) * 0.12;
        c += Math.max(0, v) * 0.4;                        // the underside faces the coals
        if (log.band > -1 && v < log.band) c += 0.18;      // a split face has no bark to shield it
        c += Math.max(0, 1 - (log.length / 2 - Math.abs(u)) / R) * 0.2;   // end grain catches first
        c += this.contactAt(log, u, v) * 0.6;
        return this.clamp01(c);
    },

    // How brightly the cracks glow there, 0..1. Only real char glows, and
    // not all of it: whole patches of a log run cold.
    heatAt(log, u, v, char) {
        if (char < 0.45) return 0;
        const R = log.radius;
        let h = 0.1 + Math.max(0, v) * 0.55;
        h += this.contactAt(log, u, v) * 0.6;
        h += (this.noise(u / (R * 0.9), v * 2 + 5, log.seed + 13) - 0.5) * 0.8;
        if (log.row === 0) h += Math.max(0, v) * 0.15;     // the bottom row lies in the coals
        const patch = this.smooth(0.15, 0.6, this.noise(u / (R * 1.6), v * 1.2 + 20, log.seed + 19));
        return this.clamp01(h) * patch * this.smooth(0.45, 0.85, char);
    },

    // ---------------------------------------------------------- the cells

    // Irregular rectangular blocks laid out around the wood: columns along
    // the length, rows around the circumference, each column's rows offset
    // from its neighbours'. The circumference is also cut into a few bands,
    // each with its own columns, so no crack across the grain runs the whole
    // way round. Every shared edge wanders with seeded noise, so the cracks
    // are jagged and meet in T-junctions, as burned wood actually checks.
    // Used for alligator char and, coarser, for pine's bark plates.
    cells(log, random, { width, rows, jitter, region }) {
        const box = this.box(log);
        const R = log.radius;
        const out = [];
        const avg = (width[0] + width[1]) / 2;
        const sway = rows[0] * 0.3;
        for (const name of region ? [region] : this.regions(log)) {
            const salt = name === 'face' ? 31 : 0;
            // A row boundary's s at u: band edges are shared by every column
            // either side of them, so they depend on u alone
            const along = (id, u, s) => id < 0 || s <= 0 || s >= 1 ? s : s + sway * (this.noise(u / (R * 0.45), id + salt, log.seed) - 0.5) * 2;

            const bands = [0];
            while (bands[bands.length - 1] < 1) {
                let next = bands[bands.length - 1] + 0.22 + random() * 0.3;
                if (next > 0.85) next = 1;
                bands.push(next);
            }

            for (let band = 0; band < bands.length - 1; band++) {
                const bounds = [box.x0 - random() * width[1]];
                while (bounds[bounds.length - 1] < box.x1) {
                    bounds.push(bounds[bounds.length - 1] + width[0] + random() * (width[1] - width[0]));
                }
                const edge = (b, s) => bounds[b] + jitter * avg * (this.noise(b * 3.7 + band * 17.3, s * 6 + salt, log.seed) - 0.5) * 2;

                for (let c = 0; c < bounds.length - 1; c++) {
                    const cuts = [bands[band]];
                    const ids = [1000 + band];
                    while (cuts[cuts.length - 1] < bands[band + 1]) {
                        let next = cuts[cuts.length - 1] + rows[0] + random() * (rows[1] - rows[0]);
                        if (next > bands[band + 1] - rows[0] * 0.5) {
                            next = bands[band + 1];
                            ids.push(1001 + band);
                        } else {
                            ids.push(band * 9973 + c * 31 + cuts.length);
                        }
                        cuts.push(next);
                    }

                    for (let k = 0; k < cuts.length - 1; k++) {
                        const pts = [];
                        const push = (u, id, s) => {
                            const ss = Math.max(0, Math.min(1, along(id, u, s)));
                            pts.push(u, this.y(log, u, this.vOf(log, ss, name)));
                        };
                        const s0 = cuts[k];
                        const s1 = cuts[k + 1];
                        const l0 = edge(c, s0);
                        const r0 = edge(c + 1, s0);
                        const l1 = edge(c, s1);
                        const r1 = edge(c + 1, s1);
                        // Top edge, right edge down, bottom edge back, left edge up
                        push(l0, ids[k], s0);
                        push((l0 + r0) / 2, ids[k], s0);
                        push(r0, ids[k], s0);
                        for (let j = 1; j < 3; j++) push(edge(c + 1, s0 + (s1 - s0) * j / 3), -1, s0 + (s1 - s0) * j / 3);
                        push(r1, ids[k + 1], s1);
                        push((l1 + r1) / 2, ids[k + 1], s1);
                        push(l1, ids[k + 1], s1);
                        for (let j = 2; j > 0; j--) push(edge(c, s0 + (s1 - s0) * j / 3), -1, s0 + (s1 - s0) * j / 3);
                        out.push({ pts, u: (l0 + r0 + l1 + r1) / 4, s: (s0 + s1) / 2, v: this.vOf(log, (s0 + s1) / 2, name), region: name });
                    }
                }
            }
        }
        return out;
    },

    // Everything about a log that depends on its neighbours or on how
    // burned the fire is: its char blocks, how hot each one is, its glow
    // zones and the points a pop can burst from
    dress(log, charring) {
        const random = this.random(log.seed + 29);
        const R = log.radius;
        log.cells = this.cells(log, random, { width: [R * 0.1, R * 0.4], rows: [0.035, 0.11], jitter: 0.42 });
        for (const cell of log.cells) {
            cell.char = this.charAt(log, cell.u, cell.v, charring);
            cell.heat = this.heatAt(log, cell.u, cell.v, cell.char);
            cell.gap = (0.5 + cell.char * 1.2) * Math.max(0.6, R / 70);
            cell.tone = random();
            cell.ash = random();
        }
        log.charring = charring;
        log.zones = this.zones(log);
        log.hotPoints = log.cells
            .filter(cell => cell.heat > 0.45)
            .sort((a, b) => b.heat - a.heat)
            .slice(0, 16)
            .map(cell => ({ u: cell.pts[0], y: cell.pts[1], heat: cell.heat }));
    },

    // Glow zones along the log. Each fades in and out over `feather` at its
    // ends, and neighbouring ramps sum to one, so zones pulsing at different
    // strengths never show a seam.
    zones(log) {
        const box = this.box(log);
        const span = box.x1 - box.x0;
        const count = Math.max(2, Math.min(9, Math.round(span / (log.radius * 1.8))));
        const width = span / count;
        const feather = Math.min(width * 0.5, log.radius * 0.8);
        const zones = [];
        for (let i = 0; i < count; i++) {
            zones.push({
                index: i,
                a: box.x0 + i * width,
                b: box.x0 + (i + 1) * width,
                feather,
                first: i === 0,
                last: i === count - 1,
                seed: this.hash(i, 3, log.seed) * 100,
                pop: 0
            });
        }
        return zones;
    },

    zoneWeight(zone, u) {
        const f = zone.feather;
        const lo = zone.first ? 1 : this.clamp01((u - (zone.a - f / 2)) / f);
        const hi = zone.last ? 1 : this.clamp01((zone.b + f / 2 - u) / f);
        if (u < zone.a - f / 2 && !zone.first) return 0;
        if (u > zone.b + f / 2 && !zone.last) return 0;
        return Math.min(lo, hi);
    },

    // ------------------------------------------------------------ painting

    // Bakes a log: its body in screen space (so it blits unrotated and
    // sharp), and its light and glow in its own space, cut into zones for
    // the manager to rotate on and breathe. `front` are the logs drawn over
    // this one, which shade it where they lie on it.
    bakeLog(log, front, palette) {
        const box = this.box(log);
        const silhouette = this.path(this.silhouettePolys(log));
        const random = this.random(log.seed + 101);

        const { x0: sx0, y0: sy0, x1: sx1, y1: sy1 } = this.screenBox(log);
        const shading = front.filter(other => {
            const b = this.screenBox(other);
            return b.x0 < sx1 && b.x1 > sx0 && b.y0 < sy1 && b.y1 > sy0;
        });

        const body = this.canvas(sx1 - sx0, sy1 - sy0);
        const ctx = body.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, -sx0, -sy0);
        ctx.translate(log.cx, log.cy);
        ctx.rotate(log.angle);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const charMask = this.charMask(log, box, 0.42, 0.56, [0, 0, 0]);
        ctx.save();
        ctx.clip(silhouette);
        this.paintBark(ctx, log, random);
        if (log.band > -1) this.paintSplitFace(ctx, log, random);
        this.paintKnots(ctx, log, random);
        this.paintChar(ctx, log, charMask);
        this.paintGrade(ctx, log);
        ctx.restore();

        this.paintFace(ctx, log, random);
        this.paintStubs(ctx, log, palette);
        this.paintShadows(ctx, log, silhouette, shading, sx0, sy0);

        // Light and glow
        const lw = box.x1 - box.x0;
        const lh = box.y1 - box.y0;
        const local = (scale) => {
            const canvas = this.canvas(lw * scale, lh * scale);
            const c = canvas.getContext('2d');
            c.setTransform(scale, 0, 0, scale, -box.x0 * scale, -box.y0 * scale);
            c.lineCap = 'round';
            c.lineJoin = 'round';
            return { canvas, c };
        };
        const warm = local(1);
        const hot = local(1);
        const rim = local(1);
        const under = local(0.5);
        this.paintGlow(warm.c, hot.c, log, palette, charMask);
        this.paintRim(rim.c, log, palette);
        this.paintUnder(under.c, log, palette);
        for (const layer of [warm, hot, rim, under]) {
            layer.c.globalCompositeOperation = 'destination-in';
            layer.c.fillStyle = '#000';   // opaque: destination-in scales by the fill's alpha
            layer.c.fill(silhouette);
        }

        // The rim lives along the top edge, so its zones keep only that band
        const rimY0 = Math.floor(box.top - 4);
        const rimH = Math.ceil(Math.max(...log.top) - box.top + log.radius * 0.35 + 8);

        const zones = log.zones.map(zone => {
            const x0 = Math.max(box.x0, zone.first ? box.x0 : zone.a - zone.feather / 2);
            const x1 = Math.min(box.x1, zone.last ? box.x1 : zone.b + zone.feather / 2);
            const w = x1 - x0;
            const slice = (src, scale, y0, h) => {
                const canvas = this.canvas(w * scale, h * scale);
                const c = canvas.getContext('2d');
                c.drawImage(src.canvas, (x0 - box.x0) * src.scale, (y0 - box.y0) * src.scale, w * src.scale, h * src.scale,
                    0, 0, canvas.width, canvas.height);
                c.globalCompositeOperation = 'destination-in';
                const ramp = zone.feather / w;
                const fade = c.createLinearGradient(0, 0, canvas.width, 0);
                fade.addColorStop(0, `rgba(0, 0, 0, ${zone.first ? 1 : 0})`);
                fade.addColorStop(zone.first ? 0.001 : ramp, 'rgba(0, 0, 0, 1)');
                fade.addColorStop(zone.last ? 0.999 : 1 - ramp, 'rgba(0, 0, 0, 1)');
                fade.addColorStop(1, `rgba(0, 0, 0, ${zone.last ? 1 : 0})`);
                c.fillStyle = fade;
                c.fillRect(0, 0, canvas.width, canvas.height);
                return canvas;
            };
            return {
                zone,
                x: x0,
                w,
                warm: slice({ canvas: warm.canvas, scale: 1 }, 0.5, box.y0, lh),
                hot: slice({ canvas: hot.canvas, scale: 1 }, 1, box.y0, lh),
                rim: slice({ canvas: rim.canvas, scale: 1 }, 1, rimY0, rimH),
                // where along the screen this zone is, to read the flames over it
                screenX: this.toScreen(log, (zone.a + zone.b) / 2, 0)[0]
            };
        });

        return { body, x: sx0, y: sy0, box, under: under.canvas, zones, rimY0, rimH };
    },

    // ---- bark

    paintBark(ctx, log, random) {
        const wood = FIREPLACE_WOODS[log.species];
        const R = log.radius;
        const box = this.box(log);
        ctx.fillStyle = this.rgb(wood.barkColor);
        ctx.fillRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);

        const k = R / 70;   // line weights were tuned on a 70 px log
        const at = (u, s) => this.y(log, u, this.vOf(log, Math.max(0, Math.min(1, s)), 'bark'));
        const span = [box.x0, box.x1];

        // Broad tonal streaks first, so no bark is one flat colour
        for (let i = 0; i < 14; i++) {
            const s = random();
            const u = span[0] + random() * (span[1] - span[0]);
            const len = R * (1 + random() * 4);
            ctx.beginPath();
            ctx.moveTo(u, at(u, s));
            ctx.lineTo(u + len, at(u + len, s));
            ctx.lineWidth = R * (0.08 + random() * 0.2) * this.fore(log, s, 'bark');
            ctx.strokeStyle = random() < 0.5 ? this.rgba(wood.barkDark, 0.15) : this.rgba(wood.ridge, 0.1);
            ctx.stroke();
        }

        if (wood.bark === 'furrowed') this.paintFurrows(ctx, log, random, at, span, k, wood);
        else if (wood.bark === 'papery') this.paintPapery(ctx, log, random, at, span, k, wood);
        else if (wood.bark === 'plated') this.paintPlates(ctx, log, random, k, wood);
        else this.paintBleached(ctx, log, random, at, span, k, wood);
    },

    // Oak: long lens-shaped furrows down the log, each swelling and
    // tapering to a point, interlacing with lit ridges, and the ridges
    // broken across into blocks
    paintFurrows(ctx, log, random, at, span, k, wood) {
        const R = log.radius;
        const rows = Math.round(10 + R / 8);
        const lens = (s, color, widthRange, alphaRange, lengthRange, gapRange, seedRow) => {
            const fore = this.fore(log, s, 'bark');
            let u = span[0] - random() * R * 2;
            while (u < span[1]) {
                const len = R * (lengthRange[0] + random() * (lengthRange[1] - lengthRange[0]));
                const wide = (widthRange[0] + random() * (widthRange[1] - widthRange[0])) * fore * k + 0.4;
                const steps = Math.max(4, Math.round(len / 6));
                const upper = [];
                const lower = [];
                for (let i = 0; i <= steps; i++) {
                    const x = u + len * i / steps;
                    const ss = s + (this.noise(x / (R * 0.7), seedRow * 1.7, log.seed) - 0.5) * 0.9 / rows;
                    const half = wide * Math.pow(Math.sin(Math.PI * i / steps), 0.6) / 2;
                    const y = at(x, ss);
                    upper.push(x, y - half);
                    lower.unshift(x, y + half);
                }
                for (let i = 0; i < lower.length; i += 2) upper.push(lower[i], lower[i + 1]);
                this.trace(ctx, upper);
                ctx.fillStyle = this.rgba(color, alphaRange[0] + random() * (alphaRange[1] - alphaRange[0]));
                ctx.fill();
                u += len * (0.55 + random() * 0.3) + R * (gapRange[0] + random() * (gapRange[1] - gapRange[0]));
            }
        };
        for (let r = 0; r < rows; r++) {
            lens((r + 0.25 + random() * 0.5) / rows, wood.barkDark, [2.5, 6], [0.5, 0.85], [0.8, 3], [0, 0.2], r);
        }
        for (let r = 0; r < rows; r++) {
            lens((r + 0.7 + random() * 0.2) / rows, wood.ridge, [1.2, 3], [0.18, 0.4], [0.5, 2], [0.1, 0.5], r + 0.5);
        }
        const breaks = Math.round(log.length / R * 7);
        ctx.strokeStyle = this.rgba(wood.barkDark, 0.7);
        for (let i = 0; i < breaks; i++) {
            const u = span[0] + random() * (span[1] - span[0]);
            const s = random();
            ctx.beginPath();
            ctx.moveTo(u, at(u, s - 0.5 / rows));
            ctx.lineTo(u + (random() - 0.5) * R * 0.08, at(u, s + 0.5 / rows));
            ctx.lineWidth = (0.8 + random()) * k * this.fore(log, s, 'bark');
            ctx.stroke();
        }
    },

    // Birch: mottled white, dark lenticels running around the trunk, black
    // branch scars, and strips of outer bark lifting off in curls
    paintPapery(ctx, log, random, at, span, k, wood) {
        const R = log.radius;
        const area = (span[1] - span[0]) * R;
        for (let i = 0; i < area / 900; i++) {
            const u = span[0] + random() * (span[1] - span[0]);
            const s = random();
            ctx.beginPath();
            ctx.ellipse(u, at(u, s), R * (0.1 + random() * 0.45), R * (0.05 + random() * 0.18) * this.fore(log, s, 'bark'), 0, 0, Math.PI * 2);
            ctx.fillStyle = random() < 0.6 ? `rgba(150, 140, 132, ${0.06 + random() * 0.12})` : `rgba(236, 206, 190, ${0.08 + random() * 0.14})`;
            ctx.fill();
        }

        for (let i = 0; i < area / 220; i++) {
            const u = span[0] + random() * (span[1] - span[0]);
            const s = 0.04 + random() * 0.92;
            const ds = 0.02 + random() * 0.06;
            ctx.beginPath();
            ctx.moveTo(u, at(u, s - ds));
            ctx.lineTo(u + (random() - 0.5) * 2 * k, at(u, s + ds));
            ctx.lineWidth = (0.9 + random() * 1.6) * k;
            ctx.strokeStyle = this.rgba(wood.barkDark, 0.45 + random() * 0.4);
            ctx.stroke();
        }

        // Branch scars: long, ragged dark bands running around the trunk,
        // one at a time and well apart (in pairs they read as eyes)
        const scars = 1 + Math.floor(random() * 2);
        for (let i = 0; i < scars; i++) {
            const u = span[0] + (i + 0.2 + random() * 0.6) / scars * (span[1] - span[0]);
            const s = 0.25 + random() * 0.5;
            const w = R * (0.06 + random() * 0.08);
            const h = 0.12 + random() * 0.12;
            const pts = [];
            for (let j = 0; j <= 8; j++) {
                const ss = s - h + 2 * h * j / 8;
                pts.push(u - w * (0.5 + random() * 0.6) * Math.sin(Math.PI * j / 8 + 0.2), at(u, ss));
            }
            for (let j = 8; j >= 0; j--) {
                const ss = s - h + 2 * h * j / 8;
                pts.push(u + w * (0.5 + random() * 0.6) * Math.sin(Math.PI * j / 8 + 0.2), at(u, ss));
            }
            this.trace(ctx, pts);
            ctx.fillStyle = this.rgba(wood.barkDark, 0.6 + random() * 0.2);
            ctx.fill();
        }

        const peels = 2 + Math.floor(random() * 3);
        for (let i = 0; i < peels; i++) {
            const u = span[0] + random() * (span[1] - span[0]);
            const w = R * (0.08 + random() * 0.2);
            const s0 = 0.1 + random() * 0.5;
            const s1 = s0 + 0.12 + random() * 0.15;
            ctx.beginPath();
            ctx.moveTo(u, at(u, s0));
            ctx.lineTo(u + w, at(u + w, s0 + 0.02));
            ctx.lineTo(u + w * 1.1, at(u + w, s1));
            ctx.lineTo(u - w * 0.1, at(u, s1 - 0.02));
            ctx.closePath();
            ctx.fillStyle = 'rgba(250, 238, 226, 0.85)';
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(u + w, at(u + w, s0 + 0.02));
            ctx.lineTo(u + w * 1.1, at(u + w, s1));
            ctx.lineWidth = 1.6 * k;
            ctx.strokeStyle = this.rgba(wood.barkDark, 0.45);
            ctx.stroke();
            // The free end rolls up into a curl
            ctx.beginPath();
            ctx.ellipse(u + w * 0.5, at(u, s1), w * 0.62, Math.max(1.5, 3 * k * this.fore(log, s1, 'bark')), 0, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(212, 190, 174, 0.95)';
            ctx.fill();
            ctx.lineWidth = 0.9 * k;
            ctx.strokeStyle = this.rgba(wood.barkDark, 0.55);
            ctx.stroke();
        }
    },

    // Pine: irregular plates, each with flaky layers, separated by fissures
    paintPlates(ctx, log, random, k, wood) {
        const R = log.radius;
        ctx.fillStyle = this.rgb([0, 1, 2].map(i => wood.barkDark[i] * 0.7 + wood.barkColor[i] * 0.3));
        const box = this.box(log);
        ctx.fillRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);
        const plates =this.cells(log, random, { width: [R * 0.3, R * 0.85], rows: [0.07, 0.15], jitter: 0.45, region: 'bark' });
        for (const plate of plates) {
            const pts = this.inset(plate.pts, (0.8 + random() * 1.2) * k * this.fore(log, plate.s, 'bark'));
            const t = random();
            const shade = 0.6 + random() * 0.55;
            const color = [0, 1, 2].map(i => (wood.barkColor[i] * (1 - t * 0.4) + wood.ridge[i] * t * 0.4) * shade);
            this.trace(ctx, pts);
            ctx.fillStyle = this.rgb(color);
            ctx.fill();
            ctx.lineWidth = 0.8 * k;
            for (let i = 0; i < 2; i++) {
                const f = 0.3 + random() * 0.4;
                ctx.beginPath();
                ctx.moveTo(pts[18] + (pts[16] - pts[18]) * f, pts[19] + (pts[17] - pts[19]) * f);
                ctx.lineTo(pts[6] + (pts[8] - pts[6]) * f, pts[7] + (pts[9] - pts[7]) * f);
                ctx.strokeStyle = random() < 0.5 ? this.rgba(wood.barkDark, 0.35) : this.rgba(wood.ridge, 0.3);
                ctx.stroke();
            }
            ctx.beginPath();
            ctx.moveTo(pts[0], pts[1]);
            ctx.lineTo(pts[2], pts[3]);
            ctx.lineTo(pts[4], pts[5]);
            ctx.lineWidth = 1.1 * k;
            ctx.strokeStyle = this.rgba(wood.ridge, 0.4);
            ctx.stroke();
        }
    },

    // Driftwood: smooth silver grain, long drying checks and old knot holes
    paintBleached(ctx, log, random, at, span, k, wood) {
        const R = log.radius;
        const lines = Math.round(26 + R / 3);
        for (let i = 0; i < lines; i++) {
            const s = random();
            const fore = this.fore(log, s, 'bark');
            let u = span[0] - random() * R;
            const dark = random() < 0.55;
            while (u < span[1]) {
                const len = R * (1.5 + random() * 4);
                ctx.beginPath();
                for (let x = u; x <= u + len; x += 8) {
                    const ss = s + (this.noise(x / (R * 1.4), i * 2.3, log.seed) - 0.5) * 0.06;
                    if (x === u) ctx.moveTo(x, at(x, ss));
                    else ctx.lineTo(x, at(x, ss));
                }
                ctx.lineWidth = (0.6 + random()) * k * fore;
                ctx.strokeStyle = dark ? this.rgba(wood.barkDark, 0.15 + random() * 0.25) : this.rgba(wood.ridge, 0.12 + random() * 0.2);
                ctx.stroke();
                u += len + R * random() * 0.5;
            }
        }
        const checks = 3 + Math.floor(random() * 4);
        for (let i = 0; i < checks; i++) {
            const s = 0.15 + random() * 0.7;
            const u = span[0] + random() * (span[1] - span[0]);
            const len = R * (1 + random() * 2.5);
            ctx.beginPath();
            for (let x = u; x <= u + len; x += 6) {
                const ss = s + (this.noise(x / (R * 0.5), i * 4.1 + 9, log.seed) - 0.5) * 0.04;
                if (x === u) ctx.moveTo(x, at(x, ss));
                else ctx.lineTo(x, at(x, ss));
            }
            ctx.lineWidth = (1.2 + random() * 1.6) * k * this.fore(log, s, 'bark');
            ctx.strokeStyle = 'rgba(30, 28, 26, 0.7)';
            ctx.stroke();
        }
    },

    // A split face: pale wood with long torn fibres, its heart edge darker,
    // and a lit arris where it meets the bark
    paintSplitFace(ctx, log, random) {
        const wood = FIREPLACE_WOODS[log.species];
        const R = log.radius;
        const k = R / 70;
        const box = this.box(log);
        const at = (u, s) => this.y(log, u, this.vOf(log, Math.max(0, Math.min(1, s)), 'face'));

        ctx.save();
        ctx.beginPath();
        for (let x = box.x0; x <= box.x1; x += 6) ctx.lineTo(x, at(x, 0) - 2);
        for (let x = box.x1; x >= box.x0; x -= 6) ctx.lineTo(x, at(x, 1));
        ctx.closePath();
        ctx.clip();

        const fill = ctx.createLinearGradient(0, at(0, 0), 0, at(0, 1));
        fill.addColorStop(0, this.rgb(wood.heart));
        fill.addColorStop(0.5, this.rgb(wood.wood));
        fill.addColorStop(1, this.rgb(wood.wood, 0.92));
        ctx.fillStyle = fill;
        ctx.fillRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);

        const fibres = Math.round(30 + R * 0.6);
        for (let i = 0; i < fibres; i++) {
            const s = random();
            let u = box.x0 - random() * R;
            const light = random() < 0.45;
            while (u < box.x1) {
                const len = R * (1.5 + random() * 4);
                ctx.beginPath();
                for (let x = u; x <= u + len; x += 7) {
                    const ss = s + (this.noise(x / (R * 0.9), i * 1.3 + 40, log.seed) - 0.5) * 0.12;
                    if (x === u) ctx.moveTo(x, at(x, ss));
                    else ctx.lineTo(x, at(x, ss));
                }
                ctx.lineWidth = (0.5 + random() * 1.3) * k;
                ctx.strokeStyle = light ? `rgba(255, 240, 215, ${0.08 + random() * 0.14})` : this.rgba(wood.heart, 0.14 + random() * 0.2, 0.6);
                ctx.stroke();
                u += len + random() * R * 0.6;
            }
        }
        // Splitting tears along the grain
        const tears = 2 + Math.floor(random() * 3);
        for (let i = 0; i < tears; i++) {
            const s = 0.15 + random() * 0.7;
            const u = box.x0 + random() * (box.x1 - box.x0);
            const len = R * (0.8 + random() * 2);
            ctx.beginPath();
            for (let x = u; x <= u + len; x += 5) {
                const ss = s + (this.noise(x / (R * 0.4), i * 5.7 + 60, log.seed) - 0.5) * 0.15;
                if (x === u) ctx.moveTo(x, at(x, ss));
                else ctx.lineTo(x, at(x, ss));
            }
            ctx.lineWidth = (1 + random() * 1.4) * k;
            ctx.strokeStyle = this.rgba(wood.heart, 0.6, 0.35);
            ctx.stroke();
        }
        ctx.restore();

        ctx.beginPath();
        for (let x = box.x0; x <= box.x1; x += 6) ctx.lineTo(x, at(x, 1) + 1.5 * k);
        ctx.lineWidth = 2.2 * k;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.stroke();
        ctx.beginPath();
        for (let x = box.x0; x <= box.x1; x += 6) ctx.lineTo(x, at(x, 1) - 0.5 * k);
        ctx.lineWidth = 1.1 * k;
        ctx.strokeStyle = 'rgba(255, 236, 210, 0.3)';
        ctx.stroke();
    },

    // Knots: a low swelling drawn out along the grain, the bark parting
    // around it in lens-shaped lines, with a dark healed-over scar at its
    // heart. Never a round bull's-eye: two of those side by side are a face.
    paintKnots(ctx, log, random) {
        const wood = FIREPLACE_WOODS[log.species];
        const R = log.radius;
        const k = R / 70;
        const lens = (u, y, a, b) => {
            ctx.beginPath();
            ctx.moveTo(u - a, y);
            ctx.quadraticCurveTo(u, y - b * 2, u + a, y);
            ctx.quadraticCurveTo(u, y + b * 2, u - a, y);
        };
        for (const knot of log.knots) {
            const fore = this.fore(log, knot.s, 'bark');
            const y = this.y(log, knot.u, this.vOf(log, knot.s, 'bark'));
            const a = R * knot.size * (2 + random());
            const b = R * knot.size * 0.45 * fore;
            for (const grow of [1.5, 1.2]) {
                lens(knot.u, y, a * grow, b * grow * 1.3);
                ctx.lineWidth = 1.3 * k * fore;
                ctx.strokeStyle = this.rgba(wood.barkDark, 0.3);
                ctx.stroke();
            }
            lens(knot.u, y, a, b);
            ctx.fillStyle = this.rgba([0, 1, 2].map(i => (wood.heart[i] + wood.barkDark[i]) / 2), 0.7);
            ctx.fill();
            lens(knot.u + a * 0.1, y, a * 0.45, b * 0.5);
            ctx.fillStyle = this.rgba(wood.barkDark, 0.75);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(knot.u - a * 0.9, y - b * 0.4);
            ctx.quadraticCurveTo(knot.u, y - b * 1.9, knot.u + a * 0.9, y - b * 0.4);
            ctx.lineWidth = 1 * k * fore;
            ctx.strokeStyle = this.rgba(wood.ridge, 0.25);
            ctx.stroke();
        }
    },

    // ---- char

    // A soft map of how charred the log is: computed coarsely, once, and
    // blown up with smoothing, so the edge of the char follows the burn
    // rather than the outlines of the blocks. Alpha rises from lo to hi.
    charMask(log, box, lo, hi, [r, g, b], most = 1) {
        const step = 5;
        const w = Math.ceil((box.x1 - box.x0) / step) + 2;
        const h = Math.ceil((box.y1 - box.y0) / step) + 2;
        const canvas = this.canvas(w, h);
        const c = canvas.getContext('2d');
        const image = c.createImageData(w, h);
        for (let j = 0; j < h; j++) {
            const y = box.y0 + j * step;
            for (let i = 0; i < w; i++) {
                const u = box.x0 + i * step;
                const [top, bot] = this.edges(log, u);
                const v = Math.max(-1, Math.min(1, (y - top) / (bot - top) * 2 - 1));
                const o = (j * w + i) * 4;
                image.data[o] = r;
                image.data[o + 1] = g;
                image.data[o + 2] = b;
                image.data[o + 3] = Math.round(255 * most * this.smooth(lo, hi, this.charAt(log, u, v, log.charring)));
            }
        }
        c.putImageData(image, 0, 0);
        return { canvas, x: box.x0 - step / 2, y: box.y0 - step / 2, w: w * step, h: h * step };
    },

    drawMask(ctx, mask) {
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(mask.canvas, mask.x, mask.y, mask.w, mask.h);
    },

    // Lightly scorched bark goes softly, patchily black. Past that the
    // surface splits into blocks of charcoal, each with faint grain and on
    // the hottest a crust of white ash, under a crack network stroked over
    // all of them at once so every crack is an even width. The blocks are
    // painted on their own layer and cut out by the soft char map, which
    // also masks the glow (bakeLog), so cracks only glow where char shows.
    paintChar(ctx, log, charMask) {
        const k = log.radius / 70;
        const box = this.box(log);
        this.drawMask(ctx, this.charMask(log, box, 0.18, 0.5, [12, 9, 8], 0.75));

        const charred = log.cells.filter(cell => cell.char >= 0.36);
        const layer = this.canvas(box.x1 - box.x0, box.y1 - box.y0);
        const c = layer.getContext('2d');
        c.translate(-box.x0, -box.y0);
        c.lineCap = 'round';
        c.lineJoin = 'round';

        for (const cell of charred) {
            const g = Math.round(16 + cell.tone * 20);
            this.trace(c, cell.pts);
            c.fillStyle = `rgb(${g + 3}, ${g}, ${g - 2})`;
            c.fill();
            if (cell.tone > 0.45) {
                const p = cell.pts;
                c.beginPath();
                c.moveTo((p[16] + p[18]) / 2, (p[17] + p[19]) / 2);
                c.lineTo((p[6] + p[8]) / 2, (p[7] + p[9]) / 2);
                c.lineWidth = Math.max(0.5, 0.7 * k);
                c.strokeStyle = 'rgba(0, 0, 0, 0.35)';
                c.stroke();
            }
            if (cell.char > 0.7 && cell.ash < (cell.char - 0.6) * 0.9) {
                // A dusting of ash, heaviest on the block's upper half
                const p = cell.pts;
                const ax = (p[2] + p[12]) / 2;
                const ay = p[3] + (p[13] - p[3]) * 0.35;
                const ar = Math.hypot(p[4] - p[0], p[11] - p[1]) * 0.45;
                c.save();
                this.trace(c, p);
                c.clip();
                const ash = c.createRadialGradient(ax, ay, 0, ax, ay, ar);
                ash.addColorStop(0, `rgba(168, 160, 150, ${0.15 + cell.ash * 0.35})`);
                ash.addColorStop(1, 'rgba(168, 160, 150, 0)');
                c.fillStyle = ash;
                c.fillRect(ax - ar, ay - ar, ar * 2, ar * 2);
                c.restore();
            }
        }

        // A dull sheen along each block's upper lip, just inside its crack
        for (const cell of charred) {
            const p = cell.pts;
            const drop = cell.gap * 1.3;
            c.beginPath();
            c.moveTo(p[0], p[1] + drop);
            c.lineTo(p[2], p[3] + drop);
            c.lineTo(p[4], p[5] + drop);
            c.lineWidth = Math.max(0.6, 0.9 * k);
            c.strokeStyle = `rgba(150, 144, 138, ${0.05 + cell.tone * 0.12})`;
            c.stroke();
        }

        // Checks across the grain open wide; the splits along it stay fine
        c.strokeStyle = 'rgba(6, 4, 4, 0.9)';
        for (const cell of charred) {
            FIREPLACE_CELL_SIDES.forEach((side, e) => {
                c.beginPath();
                for (const i of side) c.lineTo(cell.pts[i * 2], cell.pts[i * 2 + 1]);
                c.lineWidth = cell.gap * (e % 2 ? 0.9 + cell.ash * 0.7 : 0.45 + cell.tone * 0.3);
                c.stroke();
            });
        }

        c.globalCompositeOperation = 'destination-in';
        this.drawMask(c, charMask);
        ctx.drawImage(layer, box.x0, box.y0);
    },

    // Firelight grading: everything above was painted as if in daylight,
    // and this multiplies it down into a dark room lit from below
    paintGrade(ctx, log) {
        const R = log.radius;
        const box = this.box(log);
        ctx.globalCompositeOperation = 'multiply';
        const grade = ctx.createLinearGradient(0, box.top, 0, box.bot);
        grade.addColorStop(0, 'rgb(38, 30, 28)');
        grade.addColorStop(0.35, 'rgb(74, 55, 46)');
        grade.addColorStop(0.7, 'rgb(116, 80, 60)');
        grade.addColorStop(1, 'rgb(164, 100, 64)');
        ctx.fillStyle = grade;
        ctx.fillRect(box.x0, box.y0 - R, box.x1 - box.x0, box.y1 - box.y0 + R * 2);
        ctx.globalCompositeOperation = 'source-over';
    },

    // ---- the end

    paintFace(ctx, log, random) {
        const wood = FIREPLACE_WOODS[log.species];
        const R = log.radius;
        const k = R / 70;
        const f = this.faceFrame(log, log.endSide);
        const to = (nx, ny) => [f.x + nx * f.rx, f.y + ny * f.ry];
        const ring = (rho, wobble, seed) => {
            const pts = [];
            const steps = 48;
            const closed = log.cut === 'round';
            for (let i = 0; i <= steps; i++) {
                const a = i / steps;
                const w = 1 + wobble * (this.noise(a * 7, seed, log.seed) - 0.5) * 2;
                pts.push(...to(...this.facePoint(log, rho * w, a)));
            }
            return { pts, closed };
        };
        const strokeRing = ({ pts, closed }) => {
            this.trace(ctx, pts, closed);
            ctx.stroke();
        };

        ctx.save();
        this.trace(ctx, this.faceOutline(log, log.endSide, 0.025));
        ctx.clip();

        ctx.fillStyle = this.rgb(wood.wood);
        ctx.fillRect(f.x - f.rx * 1.6, f.y - f.ry * 1.3, f.rx * 3.2, f.ry * 2.6);

        if (log.heart > 0) {
            const heart = ring(log.heart, 0.05, 0.5);
            this.trace(ctx, heart.pts, false);
            if (!heart.closed) ctx.lineTo(...to(...this.facePoint(log, 0, 0)));
            ctx.closePath();
            ctx.fillStyle = this.rgba(wood.heart, 0.9);
            ctx.fill();
        }

        for (let i = 1; i <= log.rings; i++) {
            const rho = Math.pow(i / (log.rings + 1), 0.85);
            ctx.lineWidth = (0.5 + random() * 0.8) * k * 0.8;
            ctx.strokeStyle = this.rgba(wood.heart, i % 4 === 0 ? 0.42 : 0.2 + random() * 0.1, 0.45);
            strokeRing(ring(rho, 0.035, i * 0.9));
        }

        // Drying checks open from the pith, widest at the rim
        ctx.fillStyle = 'rgba(26, 16, 10, 0.88)';
        for (const check of log.checks) {
            const a = check.a;
            ctx.beginPath();
            ctx.moveTo(...to(...this.facePoint(log, 0.04, a)));
            ctx.lineTo(...to(...this.facePoint(log, check.length, a - check.width)));
            ctx.lineTo(...to(...this.facePoint(log, check.length * 1.03, a)));
            ctx.lineTo(...to(...this.facePoint(log, check.length, a + check.width)));
            ctx.closePath();
            ctx.fill();
        }

        // The saw's kerf left faint parallel scores across the cut
        ctx.lineWidth = 1.2 * k;
        ctx.strokeStyle = 'rgba(255, 240, 220, 0.06)';
        const slope = log.sawAngle;
        for (let i = -4; i <= 4; i++) {
            const y0 = i / 4.5;
            ctx.beginPath();
            ctx.moveTo(...to(-1.5, y0 - slope * 1.5));
            ctx.lineTo(...to(1.5, y0 + slope * 1.5));
            ctx.stroke();
        }

        ctx.beginPath();
        const [px, py] = to(...this.facePoint(log, 0, 0));
        ctx.ellipse(px, py, Math.max(1, 1.5 * k * f.rx / f.ry), 1.5 * k, 0, 0, Math.PI * 2);
        ctx.fillStyle = this.rgb(wood.heart, 0.35);
        ctx.fill();

        // Bark rim, then char eating in from it
        const rim = ring(1, 0.025, 0.25);
        if (wood.barkDepth > 0) {
            ctx.lineWidth = wood.barkDepth * f.ry * 2;
            ctx.strokeStyle = this.rgb(wood.barkDark);
            strokeRing(rim);
            if (log.species === 'birch') {
                ctx.lineWidth = wood.barkDepth * f.ry * 0.9;
                ctx.strokeStyle = this.rgba(wood.ridge, 0.7);
                strokeRing(rim);
            }
        }
        const depth = 0.05 + log.charring * 0.18;
        ctx.strokeStyle = `rgba(11, 8, 7, ${0.45 + log.charring * 0.4})`;
        ctx.lineWidth = depth * f.ry * 2;
        strokeRing(rim);
        ctx.strokeStyle = 'rgba(11, 8, 7, 0.5)';
        ctx.lineWidth = depth * f.ry * 3;
        strokeRing(rim);

        // The end faces the room, a little brighter than the top of the log
        ctx.globalCompositeOperation = 'multiply';
        const grade = ctx.createLinearGradient(0, f.y - f.ry, 0, f.y + f.ry);
        grade.addColorStop(0, 'rgb(104, 80, 66)');
        grade.addColorStop(0.6, 'rgb(150, 108, 80)');
        grade.addColorStop(1, 'rgb(196, 130, 86)');
        ctx.fillStyle = grade;
        ctx.fillRect(f.x - f.rx * 1.6, f.y - f.ry * 1.3, f.rx * 3.2, f.ry * 2.6);
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
    },

    // A branch stub: a short, ragged, charred spur, its broken end
    // smouldering. Painted in firelit colours directly, since it sticks out
    // past the silhouette the grade is clipped to.
    paintStubs(ctx, log, palette) {
        const colors = this.emberColors(palette);
        const random = this.random(log.seed + 53);
        for (const stub of log.stubs) {
            const [top] = this.edges(log, stub.u);
            const r = stub.radius;
            const len = stub.length + log.radius * 0.2;
            ctx.save();
            ctx.translate(stub.u, top + log.radius * 0.2);
            ctx.rotate(stub.lean);

            const pts = [];
            const steps = 6;
            for (let i = 0; i <= steps; i++) {
                pts.push(-r * (1.25 - 0.3 * i / steps) + (random() - 0.5) * r * 0.25, -len * i / steps);
            }
            // The broken end: torn, not sawn
            for (let i = 1; i < 4; i++) pts.push(-r * 0.95 + r * 1.9 * i / 4, -len - (random() - 0.3) * r * 0.5);
            for (let i = steps; i >= 0; i--) {
                pts.push(r * (1.25 - 0.3 * i / steps) + (random() - 0.5) * r * 0.25, -len * i / steps);
            }
            this.trace(ctx, pts);
            const side = ctx.createLinearGradient(-r, 0, r, 0);
            side.addColorStop(0, 'rgb(10, 8, 7)');
            side.addColorStop(0.4, 'rgb(30, 24, 21)');
            side.addColorStop(1, 'rgb(12, 9, 8)');
            ctx.fillStyle = side;
            ctx.fill();

            // A couple of checks across it, and the end still burning
            ctx.lineWidth = Math.max(0.8, r * 0.08);
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
            for (let i = 0; i < 2; i++) {
                const y = -len * (0.3 + random() * 0.5);
                ctx.beginPath();
                ctx.moveTo(-r, y);
                ctx.lineTo(r * 0.2, y + (random() - 0.5) * r * 0.3);
                ctx.stroke();
            }
            const ember = ctx.createRadialGradient(0, -len, 0, 0, -len, r * 1.1);
            ember.addColorStop(0, this.rgba(colors.warm, 0.55));
            ember.addColorStop(1, this.rgba(colors.warm, 0));
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = ember;
            ctx.fillRect(-r * 1.2, -len - r * 1.1, r * 2.4, r * 2.2);
            ctx.restore();
        }
    },

    // Logs lying across this one shade it where they rest on it. A blurred
    // shadow at bake time only; shadowBlur never runs per frame.
    paintShadows(ctx, log, silhouette, front, sx0, sy0) {
        if (front.length === 0) return;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, -sx0, -sy0);
        ctx.translate(log.cx, log.cy);
        ctx.rotate(log.angle);
        ctx.clip(silhouette);
        const far = 10000;
        for (const other of front) {
            ctx.setTransform(1, 0, 0, 1, -sx0, -sy0 - far);
            ctx.translate(other.cx, other.cy);
            ctx.rotate(other.angle);
            ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
            ctx.shadowBlur = other.radius * 0.45;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = far + other.radius * 0.18;
            ctx.fillStyle = '#000';
            ctx.fill(this.path(this.silhouettePolys(other)));
        }
        ctx.restore();
    },

    // ---- light

    emberColors(palette) {
        const [r, g, b] = palette.ember;
        return {
            warm: [r, Math.round(g * 0.42), Math.round(b * 0.25)],
            hot: [255, Math.min(255, Math.round(100 + g * 0.3)), Math.min(255, Math.round(10 + b * 0.4))]
        };
    },

    // The cracks between char blocks: a wide warm bleed that spills over the
    // block edges, and a thin hot core inside the crack itself. Each edge of
    // each block glows on its own, and cooler blocks have fewer glowing
    // edges, so the light runs in broken threads rather than a lit grid.
    // The hottest blocks have burned through to glowing coal.
    paintGlow(warm, hot, log, palette, charMask) {
        const colors = this.emberColors(palette);
        const R = log.radius;
        // The warm bleed accumulates; the hot cores don't, or overlapping
        // cracks would saturate to a sickly yellow
        warm.globalCompositeOperation = 'lighter';
        log.cells.forEach((cell, n) => {
            const h = cell.heat;
            if (h < 0.04) return;
            FIREPLACE_CELL_SIDES.forEach((side, e) => {
                // The deep checks across the grain glow most
                const across = e % 2 === 1;
                const roll = this.hash(n, e, log.seed);
                if (roll > (across ? 0.1 : 0) + h * (across ? 0.9 : 0.4)) return;
                const strength = h * (0.4 + this.hash(n, e + 7, log.seed) * 0.7) * (across ? 1 : 0.7);
                warm.beginPath();
                hot.beginPath();
                for (const i of side) {
                    warm.lineTo(cell.pts[i * 2], cell.pts[i * 2 + 1]);
                    hot.lineTo(cell.pts[i * 2], cell.pts[i * 2 + 1]);
                }
                // A soft bloom, then a firmer line inside it
                warm.lineWidth = cell.gap * 3 + R * 0.02;
                warm.strokeStyle = this.rgba(colors.warm, Math.min(1, strength * 0.22));
                warm.stroke();
                warm.lineWidth = cell.gap * 1.1;
                warm.strokeStyle = this.rgba(colors.warm, Math.min(1, strength * 0.75));
                warm.stroke();
                // Only the hottest cracks show a bright core: a dim ember is
                // deep red, and dim yellow would only read as olive
                if (strength > 0.6) {
                    hot.lineWidth = Math.max(0.8, cell.gap * 0.5);
                    hot.strokeStyle = this.rgba(colors.hot, Math.min(1, (strength - 0.6) * 1.6));
                    hot.stroke();
                }
            });
            if (h > 0.7 && this.hash(n, 11, log.seed) < 0.4) {
                this.trace(warm, this.inset(cell.pts, cell.gap));
                warm.fillStyle = this.rgba(colors.warm, (h - 0.7) * 0.5);
                warm.fill();
            }
        });
        for (const c of [warm, hot]) {
            c.save();
            c.globalCompositeOperation = 'destination-in';
            this.drawMask(c, charMask);
            c.restore();
        }

        // The end burns in from its rim: a glowing front just inside the
        // char, and short cracks across it
        const f = this.faceFrame(log, log.endSide);
        const heat = this.clamp01(0.15 + log.charring * 0.8);
        if (heat > 0.2) {
            const depth = 0.05 + log.charring * 0.18;
            const to = (nx, ny) => [f.x + nx * f.rx, f.y + ny * f.ry];
            const front = [];
            for (let i = 0; i <= 48; i++) {
                const a = i / 48;
                const w = 1 + (this.noise(a * 7, 0.25, log.seed) - 0.5) * 0.05;
                front.push(...to(...this.facePoint(log, (1 - depth) * w, a)));
            }
            // In broken arcs: the front smoulders in places, not all round
            for (let i = 0; i + 2 < front.length; i += 2) {
                const a = i / front.length;
                const along = this.smooth(0.35, 0.75, this.noise(a * 9, 4.5, log.seed));
                if (along <= 0) continue;
                warm.beginPath();
                warm.moveTo(front[i], front[i + 1]);
                warm.lineTo(front[i + 2], front[i + 3]);
                warm.lineWidth = depth * f.ry * 0.8;
                warm.strokeStyle = this.rgba(colors.warm, heat * 0.3 * along);
                warm.stroke();
                hot.beginPath();
                hot.moveTo(front[i], front[i + 1]);
                hot.lineTo(front[i + 2], front[i + 3]);
                hot.lineWidth = Math.max(0.8, R / 80);
                hot.strokeStyle = this.rgba(colors.hot, heat * 0.45 * along);
                hot.stroke();
            }
            const random = this.random(log.seed + 77);
            for (let i = 0; i < 8; i++) {
                const a = random();
                hot.beginPath();
                hot.moveTo(...to(...this.facePoint(log, 1 - depth * 1.1, a)));
                hot.lineTo(...to(...this.facePoint(log, 1, a + (random() - 0.5) * 0.02)));
                hot.lineWidth = Math.max(0.8, R / 90);
                hot.strokeStyle = this.rgba(colors.hot, heat * (0.3 + random() * 0.4));
                hot.stroke();
            }
        }
    },

    // Firelight from the flames behind catches the top edge
    paintRim(ctx, log, palette) {
        const [r, g, b] = palette.glow;
        const R = log.radius;
        ctx.beginPath();
        for (let i = 0; i < log.us.length; i++) ctx.lineTo(log.us[i], log.top[i]);
        ctx.lineWidth = R * 0.14;
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.2)`;
        ctx.stroke();
        ctx.lineWidth = R * 0.05;
        ctx.strokeStyle = `rgba(${Math.min(255, r + 30)}, ${Math.min(255, g + 40)}, ${Math.min(255, b + 40)}, 0.45)`;
        ctx.stroke();
        ctx.lineWidth = Math.max(1, R / 60);
        ctx.strokeStyle = 'rgba(255, 226, 180, 0.6)';
        ctx.stroke();
    },

    // The coals light the underside, hottest where it touches them or
    // another log
    paintUnder(ctx, log, palette) {
        const colors = this.emberColors(palette);
        const R = log.radius;
        const box = this.box(log);
        const under = ctx.createLinearGradient(0, box.bot, 0, 0);
        under.addColorStop(0, this.rgba(colors.warm, 0.5));
        under.addColorStop(0.5, this.rgba(colors.warm, 0.14));
        under.addColorStop(1, this.rgba(colors.warm, 0));
        ctx.fillStyle = under;
        ctx.fillRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);
        ctx.globalCompositeOperation = 'lighter';
        for (const c of log.contacts) {
            const [top, bot] = this.edges(log, c.u);
            const y = c.v > 0 ? bot : top;
            const glow = ctx.createRadialGradient(c.u, y, 0, c.u, y, R * 0.9);
            glow.addColorStop(0, this.rgba(colors.warm, 0.14 * c.strength * (c.v > 0 ? 1 : 0.6)));
            glow.addColorStop(1, this.rgba(colors.warm, 0));
            ctx.fillStyle = glow;
            ctx.fillRect(c.u - R, y - R, R * 2, R * 2);
        }
        ctx.globalCompositeOperation = 'source-over';
    },

    // ------------------------------------------------------------ the bed

    // A heap of charcoal along the hearth: a lumpy profile, then rows of
    // irregular chunks from back (small, high) to front (large, low). Some
    // are live coals, some black char, some crusted with ash.
    makeBed(random, { width, ground, scale, depth }) {
        const step = 6;
        const n = Math.ceil(width / step) + 1;
        const heights = new Float32Array(n);
        const seed = Math.floor(random() * 1e6);
        for (let i = 0; i < n; i++) {
            const x = i * step;
            heights[i] = depth <= 0 ? 0 : Math.max(4, scale * depth * (26 + 18 * this.noise(x / 140, 0.5, seed) + 9 * this.noise(x / 45, 3.5, seed)));
        }
        const bed = { step, heights, ground, width, chunks: [], seed };
        let most = 0;
        for (const h of heights) most = Math.max(most, h);
        bed.top = ground - most - 14 * scale;
        if (depth <= 0) return bed;

        const sizeScale = scale * (0.6 + Math.min(1, depth) * 0.4);
        for (let row = 0; row < 4; row++) {
            const t = row / 3;
            let x = -random() * 12;
            while (x < width + 12) {
                const size = (6 + 8 * t + random() * (6 + 9 * t)) * sizeScale;
                const lift = this.bedHeight(bed, x) * (1 - t * 0.88);
                const y = ground - lift + size * 0.3;
                const corners = 6 + Math.floor(random() * 3);
                const spin = random() * Math.PI * 2;
                const pts = [];
                for (let i = 0; i < corners; i++) {
                    const a = spin + (i + (random() - 0.5) * 0.5) / corners * Math.PI * 2;
                    const r = size * (0.65 + random() * 0.45);
                    pts.push(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.7);
                }
                const roll = random();
                const kind = roll < 0.18 + 0.14 * (1 - t) ? 'live' : roll < 0.5 ? 'ash' : 'char';
                bed.chunks.push({ pts, x, y, size, kind, heat: 0.45 + random() * 0.55, tone: random() });
                x += size * (1.05 + random() * 0.55);
            }
        }
        return bed;
    },

    bedHeight(bed, x) {
        const f = Math.max(0, Math.min(bed.heights.length - 1, x / bed.step));
        const i = Math.min(bed.heights.length - 2, Math.floor(f));
        return bed.heights[i] + (bed.heights[i + 1] - bed.heights[i]) * (f - i);
    },

    bakeBed(bed, palette) {
        const top = Math.floor(bed.top);
        const height = Math.ceil(bed.ground - top) + 2;
        const width = bed.width;
        const colors = this.emberColors(palette);
        const random = this.random(bed.seed + 5);

        const mound = (ctx) => {
            ctx.beginPath();
            ctx.moveTo(0, bed.ground + 2);
            for (let x = 0; x <= width + bed.step; x += bed.step) ctx.lineTo(x, bed.ground - this.bedHeight(bed, x));
            ctx.lineTo(width, bed.ground + 2);
            ctx.closePath();
        };
        const layer = (scale) => {
            const canvas = this.canvas(width * scale, height * scale);
            const ctx = canvas.getContext('2d');
            ctx.setTransform(scale, 0, 0, scale, 0, -top * scale);
            return { canvas, ctx };
        };

        // The heap
        const body = layer(1);
        let ctx = body.ctx;
        mound(ctx);
        ctx.fillStyle = '#0a0706';
        ctx.fill();
        for (const chunk of bed.chunks) {
            this.trace(ctx, chunk.pts);
            const g = Math.round(18 + chunk.tone * 22);
            ctx.fillStyle = chunk.kind === 'ash' ? this.rgb([128, 120, 112], 0.75 + chunk.tone * 0.35)
                : chunk.kind === 'live' ? 'rgb(66, 26, 14)' : `rgb(${g + 3}, ${g}, ${g - 2})`;
            ctx.fill();
            // Lit from above-left by the room, shadowed underneath
            ctx.save();
            ctx.clip();
            const shade = ctx.createRadialGradient(chunk.x - chunk.size * 0.3, chunk.y - chunk.size * 0.45, 0,
                chunk.x, chunk.y, chunk.size * 1.4);
            shade.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
            shade.addColorStop(0.5, 'rgba(0, 0, 0, 0.1)');
            shade.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
            ctx.fillStyle = shade;
            ctx.fillRect(chunk.x - chunk.size * 1.5, chunk.y - chunk.size * 1.5, chunk.size * 3, chunk.size * 3);
            ctx.restore();
            if (chunk.kind === 'char' && chunk.size > 8) {
                ctx.beginPath();
                ctx.moveTo(chunk.x - chunk.size * 0.5, chunk.y - chunk.size * 0.1);
                ctx.lineTo(chunk.x + chunk.size * 0.4, chunk.y + chunk.size * (random() - 0.5) * 0.3);
                ctx.moveTo(chunk.x + chunk.size * (random() - 0.5) * 0.4, chunk.y - chunk.size * 0.45);
                ctx.lineTo(chunk.x + chunk.size * (random() - 0.5) * 0.4, chunk.y + chunk.size * 0.3);
                ctx.lineWidth = 1;
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
                ctx.stroke();
            }
            for (let i = 0; i < 3; i++) {
                ctx.beginPath();
                ctx.arc(chunk.x + (random() - 0.5) * chunk.size, chunk.y - chunk.size * (0.2 + random() * 0.35), 0.6 + random() * 1.2, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(176, 168, 158, ${0.2 + random() * 0.35})`;
                ctx.fill();
            }
        }
        // Fine ash spilled along the front
        for (let i = 0; i < width / 3; i++) {
            ctx.beginPath();
            ctx.arc(random() * width, bed.ground - random() * random() * 10, 0.5 + random(), 0, Math.PI * 2);
            ctx.fillStyle = `rgba(150, 142, 134, ${0.15 + random() * 0.3})`;
            ctx.fill();
        }
        // Graded inside the heap only: multiply would paint the empty air too.
        // The mound and every chunk wind the same way, so one path unions them.
        const heap = new Path2D();
        heap.moveTo(0, bed.ground + 2);
        for (let x = 0; x <= width + bed.step; x += bed.step) heap.lineTo(x, bed.ground - this.bedHeight(bed, x));
        heap.lineTo(width, bed.ground + 2);
        heap.closePath();
        heap.addPath(this.path(bed.chunks.map(chunk => chunk.pts)));
        ctx.save();
        ctx.clip(heap);
        ctx.globalCompositeOperation = 'multiply';
        const grade = ctx.createLinearGradient(0, top, 0, bed.ground);
        grade.addColorStop(0, 'rgb(84, 60, 48)');
        grade.addColorStop(1, 'rgb(172, 112, 78)');
        ctx.fillStyle = grade;
        ctx.fillRect(0, top, width, height);
        ctx.restore();

        // The glow, deepest and brightest at the bottom of the heap, and in
        // the gaps between chunks rather than on them, except for live coals
        const paintGlow = (ctx, color, strength, reach) => {
            const most = bed.ground - top;
            ctx.save();
            mound(ctx);
            const fill = ctx.createLinearGradient(0, bed.ground, 0, bed.ground - most * reach);
            fill.addColorStop(0, this.rgba(color, strength));
            fill.addColorStop(1, this.rgba(color, strength * 0.2));
            ctx.fillStyle = fill;
            ctx.fill();
            // Patches of the bed run cooler
            ctx.globalCompositeOperation = 'destination-out';
            for (let x = 0; x < width + 40; x += 30) {
                const cool = this.noise(x / 110, 1.5, bed.seed);
                const blot = ctx.createRadialGradient(x, bed.ground - most * 0.4, 0, x, bed.ground - most * 0.4, 55);
                blot.addColorStop(0, `rgba(0, 0, 0, ${cool * 0.6})`);
                blot.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = blot;
                ctx.fillRect(x - 55, top, 110, height);
            }
            for (const chunk of bed.chunks) {
                if (chunk.kind === 'live') continue;
                this.trace(ctx, chunk.pts);
                ctx.fillStyle = `rgba(0, 0, 0, ${chunk.kind === 'ash' ? 0.97 : 0.9})`;
                ctx.fill();
            }
            ctx.restore();
        };
        const warm = layer(0.5);
        const hot = layer(1);
        paintGlow(warm.ctx, colors.warm, 0.7, 1);
        paintGlow(hot.ctx, colors.hot, 0.45, 0.5);
        for (const chunk of bed.chunks) {
            if (chunk.kind !== 'live') continue;
            this.trace(warm.ctx, chunk.pts);
            warm.ctx.fillStyle = this.rgba(colors.warm, 0.8 * chunk.heat);
            warm.ctx.fill();
            this.trace(hot.ctx, this.inset(chunk.pts, chunk.size * 0.25));
            hot.ctx.fillStyle = this.rgba(colors.hot, 0.55 * chunk.heat);
            hot.ctx.fill();
            // A grey skin of ash breaks up the glow on each live coal
            hot.ctx.globalCompositeOperation = 'destination-out';
            warm.ctx.globalCompositeOperation = 'destination-out';
            for (let i = 0; i < 3; i++) {
                const ax = chunk.x + (random() - 0.5) * chunk.size;
                const ay = chunk.y - chunk.size * random() * 0.4;
                const ar = chunk.size * (0.15 + random() * 0.2);
                for (const c of [hot.ctx, warm.ctx]) {
                    c.beginPath();
                    c.ellipse(ax, ay, ar, ar * 0.6, 0, 0, Math.PI * 2);
                    c.fillStyle = 'rgba(0, 0, 0, 0.75)';
                    c.fill();
                }
            }
            hot.ctx.globalCompositeOperation = 'source-over';
            warm.ctx.globalCompositeOperation = 'source-over';
        }

        // Tiles along the bed, feathered like the log zones
        const count = Math.max(6, Math.min(24, Math.round(width / 120)));
        const span = width / count;
        const feather = span * 0.5;
        const tiles = [];
        for (let i = 0; i < count; i++) {
            const first = i === 0;
            const last = i === count - 1;
            const x0 = Math.max(0, first ? 0 : i * span - feather / 2);
            const x1 = Math.min(width, last ? width : (i + 1) * span + feather / 2);
            const w = x1 - x0;
            const slice = (src, scale) => {
                const canvas = this.canvas(w * scale, height * scale);
                const c = canvas.getContext('2d');
                c.drawImage(src.canvas, x0 * src.scale, 0, w * src.scale, height * src.scale, 0, 0, canvas.width, canvas.height);
                c.globalCompositeOperation = 'destination-in';
                const ramp = feather / w;
                const fade = c.createLinearGradient(0, 0, canvas.width, 0);
                fade.addColorStop(0, `rgba(0, 0, 0, ${first ? 1 : 0})`);
                fade.addColorStop(first ? 0.001 : ramp, 'rgba(0, 0, 0, 1)');
                fade.addColorStop(last ? 0.999 : 1 - ramp, 'rgba(0, 0, 0, 1)');
                fade.addColorStop(1, `rgba(0, 0, 0, ${last ? 1 : 0})`);
                c.fillStyle = fade;
                c.fillRect(0, 0, canvas.width, canvas.height);
                return canvas;
            };
            tiles.push({
                x: x0,
                w,
                mid: (x0 + x1) / 2,
                seed: this.hash(i, 9, bed.seed) * 100,
                warm: slice({ canvas: warm.canvas, scale: 0.5 }, 0.5),
                hot: slice({ canvas: hot.canvas, scale: 1 }, 1)
            });
        }

        return { body: body.canvas, y: top, height, tiles };
    },

    // ----------------------------------------------------------- the iron

    // A cast-iron grate across the front of the hearth, or a pair of
    // andirons: black against the glow, with only their edges catching it.
    // The rim layer is the firelit edges, for the manager to flicker.
    bakeIron(kind, { width, ground, scale, palette }) {
        if (kind !== 'grate' && kind !== 'andirons') return null;
        const s = scale;
        const tall = kind === 'grate' ? 58 * s : 112 * s;
        const top = Math.floor(ground - tall - 8 * s);
        const height = Math.ceil(ground - top) + 2;
        const body = this.canvas(width, height);
        const rim = this.canvas(width, height);
        const b = body.getContext('2d');
        const r = rim.getContext('2d');
        for (const c of [b, r]) {
            c.translate(0, -top);
            c.lineCap = 'round';
            c.lineJoin = 'round';
        }
        const [gr, gg, gb] = palette.glow;
        const edge = `rgba(${Math.min(255, gr + 20)}, ${Math.min(255, gg + 20)}, ${Math.min(255, gb + 10)}, 0.75)`;
        const iron = '#0d0b0a';
        const centre = width / 2;

        if (kind === 'grate') {
            const rail = ground - 10 * s;
            const t = 8 * s;
            const spacing = 84 * s;
            const bars = [];
            for (let x = spacing * 0.5; x < width; x += spacing) bars.push(x);
            // Uprights, leaning toward the vanishing point as they curve
            // back, each capped with a knob
            for (const x of bars) {
                const lean = (centre - x) / Math.max(1, centre) * 12 * s;
                const tipX = x + lean;
                const tipY = ground - tall;
                b.beginPath();
                b.moveTo(x - t / 2, rail);
                b.quadraticCurveTo(x - t / 2, rail - tall * 0.55, tipX - t * 0.35, tipY + t);
                b.lineTo(tipX + t * 0.35, tipY + t);
                b.quadraticCurveTo(x + t / 2, rail - tall * 0.55, x + t / 2, rail);
                b.closePath();
                b.fillStyle = iron;
                b.fill();
                b.beginPath();
                b.arc(tipX, tipY + t * 0.4, t * 0.72, 0, Math.PI * 2);
                b.fill();
                // Lit edges: the side facing the fire's middle
                const side = x < centre ? 1 : -1;
                r.beginPath();
                r.moveTo(x + side * t * 0.42, rail - t);
                r.quadraticCurveTo(x + side * t * 0.42, rail - tall * 0.55, tipX + side * t * 0.28, tipY + t * 1.2);
                r.lineWidth = Math.max(1, 1.1 * s);
                r.strokeStyle = edge;
                r.stroke();
                r.beginPath();
                r.arc(tipX, tipY + t * 0.4, t * 0.66, side > 0 ? -Math.PI * 0.55 : Math.PI * 0.75, side > 0 ? Math.PI * 0.25 : Math.PI * 1.55);
                r.stroke();
            }
            // Front rail and its feet
            b.fillStyle = iron;
            b.beginPath();
            b.roundRect(-10, rail - t * 0.8, width + 20, t * 1.6, t * 0.5);
            b.fill();
            for (let i = 0; i < bars.length; i += 4) {
                const x = bars[i] + spacing / 2;
                b.beginPath();
                b.moveTo(x - 5 * s, rail);
                b.lineTo(x - 7 * s, ground);
                b.lineTo(x + 7 * s, ground);
                b.lineTo(x + 5 * s, rail);
                b.fill();
            }
            r.beginPath();
            r.moveTo(-10, rail - t * 0.6);
            r.lineTo(width + 10, rail - t * 0.6);
            r.lineWidth = Math.max(1, 1.2 * s);
            r.strokeStyle = edge;
            r.stroke();
        } else {
            for (const x of [width * 0.25, width * 0.75]) {
                const post = 5.5 * s;
                const side = x < centre ? 1 : -1;
                // Arched feet
                b.beginPath();
                b.moveTo(x - 30 * s, ground);
                b.quadraticCurveTo(x - 24 * s, ground - 20 * s, x - post, ground - 26 * s);
                b.lineTo(x + post, ground - 26 * s);
                b.quadraticCurveTo(x + 24 * s, ground - 20 * s, x + 30 * s, ground);
                b.lineTo(x + 22 * s, ground);
                b.quadraticCurveTo(x + 16 * s, ground - 12 * s, x, ground - 14 * s);
                b.quadraticCurveTo(x - 16 * s, ground - 12 * s, x - 22 * s, ground);
                b.closePath();
                b.fillStyle = iron;
                b.fill();
                // Post with collars, and a ball finial
                b.fillRect(x - post, ground - tall + 14 * s, post * 2, tall - 38 * s);
                for (const at of [0.38, 0.72]) {
                    b.beginPath();
                    b.roundRect(x - post * 1.7, ground - tall * at - 3 * s, post * 3.4, 6 * s, 2 * s);
                    b.fill();
                }
                b.beginPath();
                b.arc(x, ground - tall + 4 * s, 11 * s, 0, Math.PI * 2);
                b.fill();
                b.beginPath();
                b.arc(x, ground - tall - 8 * s, 3.5 * s, 0, Math.PI * 2);
                b.fill();

                r.lineWidth = Math.max(1, 1.2 * s);
                r.strokeStyle = edge;
                r.beginPath();
                r.moveTo(x + side * post * 0.85, ground - 28 * s);
                r.lineTo(x + side * post * 0.85, ground - tall + 16 * s);
                r.stroke();
                r.beginPath();
                r.arc(x, ground - tall + 4 * s, 10 * s, side > 0 ? -Math.PI * 0.5 : Math.PI * 0.8, side > 0 ? Math.PI * 0.2 : Math.PI * 1.5);
                r.stroke();
                r.beginPath();
                r.moveTo(x + side * 4 * s, ground - 25 * s);
                r.quadraticCurveTo(x + side * 22 * s, ground - 19 * s, x + side * 29 * s, ground - 1 * s);
                r.stroke();
            }
        }
        return { body, rim, y: top };
    }
};
