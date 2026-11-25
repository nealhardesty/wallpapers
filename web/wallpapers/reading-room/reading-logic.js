// The Reading Room's pure logic: the hall in metres, where we stand in it,
// where the real sun is and which of the windows it shines through, where
// each shaft of it lands on the floor or the far bookcases, what the hour
// does to the light indoors, where everything is put for a screen of a
// given shape, and the cats' small decisions. No DOM in here, so
// tools/reading-room.test.mjs runs it in Node. The light's arithmetic and
// the brushwork are Painted Village's (painted-logic.js, painted-plates.js,
// painted-bake.js); the sky outside the windows is its sky.
//
// The hall runs north from where we stand: x across (east to the right),
// y up, z along it (north, away from us). We look straight down it, so the
// morning sun comes in through the windows on the right and lands on the
// left of the floor, the noon sun through the great window behind us and
// lands far down the aisle, and the afternoon's from the left.

const ReadingLogic = (() => {
    const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
    const lerp = (a, b, t) => a + (b - a) * t;
    const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
    const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
    const RAD = Math.PI / 180;

    // ---- The hall ---------------------------------------------------------------
    // hw: half the width between the bookcases' faces. Nine bays of nine
    // metres from z0, then the north wall. Two galleries, their floors at g1
    // and g2, standing out from the walls to g1x and g2x; their rails rise
    // `rail` over them. The windows sit above the second gallery, one to a
    // bay each side, win0 to win1 high and winW wide; then the cornice at
    // `spring`, where the vault starts: half an ellipse `vault` high, with a
    // round skylight (an oculus) at its crown in every bay.
    const ROOM = {
        hw: 12, z0: 3, bay: 9, bays: 9, g1: 5.8, g1x: 10.5, g2: 11.4, g2x: 11.1, rail: 1.05,
        win0: 12.6, win1: 16.9, winW: 3.8, spring: 17.3, vault: 7.6, oculus: 1.35,
        tableX: 5.2, tableLen: 7.0, tableW: 1.6, tableH: 0.78, shade: 0.4,
    };
    ROOM.len = ROOM.z0 + ROOM.bay * ROOM.bays;                       // the north wall
    ROOM.apex = ROOM.spring + ROOM.vault;
    const bayZ = k => ROOM.z0 + ROOM.bay * (k + 0.5);                // the middle of bay k
    const pierZ = k => ROOM.z0 + ROOM.bay * k;                       // the pier before bay k
    // The vault's height at x (metres from the middle), and its slope there.
    const vaultY = x => ROOM.spring + ROOM.vault * Math.sqrt(Math.max(0, 1 - (x / ROOM.hw) ** 2));

    // ---- Where we stand ---------------------------------------------------------
    // The eye 4 m up at the south end, looking level down the middle. Depth
    // `z` is Painted Village's: 1 at the bottom of the picture, `zm` metres
    // to the unit, so its Plates and bake take this camera as they take
    // theirs. Distance D (metres along the hall) is z × zm. A narrower
    // screen sees wider, so the galleries still show.
    function camera(W, H, bottom = 0) {
        const Hu = H - bottom, aspect = W / Hu;
        const kind = aspect < 0.9 ? 'upright' : aspect > 2.15 ? 'panorama' : 'wide';
        const u = Hu / 900, hor = Hu * (kind === 'upright' ? 0.5 : 0.43), f = Hu - hor;
        const eye = 4.0, foc = 720 * u * clamp(aspect / 1.78, kind === 'upright' ? 0.62 : 0.74, 1.08);
        const ppm = f / eye, zm = eye * foc / f;
        const cam = { W, H, Hu, aspect, kind, hor, f, u, eye, ppm, zm, foc };
        cam.sy = z => hor + f / z;
        cam.sc = z => ppm / z;
        cam.sx = (x, z) => W / 2 + x * ppm / z;
        cam.zAt = y => f / Math.max(1e-3, y - hor);
        cam.xAt = (px, z) => (px - W / 2) * z / ppm;
        cam.half = z => W / 2 * z / ppm;
        cam.dz = m => m / zm;
        cam.pt = (x, y, z) => [W / 2 + x * ppm / z, hor + f / z - y * ppm / z];
        // In metres: a point x across, y up and D along the hall, on the screen; and the row of the floor under it.
        cam.p = (x, y, D) => [W / 2 + x * foc / D, hor + (eye - y) * foc / D];
        cam.z = D => D / zm;
        cam.D = z => z * zm;
        cam.foot = D => hor + eye * foc / D;
        cam.mpx = D => foc / D;                                       // pixels to the metre at distance D
        return cam;
    }

    // ---- The sun and the moon, as directions ------------------------------------
    // The same simple astronomy as HarvestSky's (latitude 40°, solar noon at
    // 12:15), but as a vector in the hall's axes: x east, y up, z north.
    const LATITUDE = 40 * RAD, NOON = 12.25, SYNODIC = 29.530588853, LAG = 24.84 / SYNODIC;
    const hourOf = d => d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
    const dayOfYear = d => Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 864e5);
    const declination = d => -23.44 * RAD * Math.cos(2 * Math.PI * (dayOfYear(d) + 10) / 365);
    function dirOf(H, dec) {
        const x = -Math.cos(dec) * Math.sin(H), z = Math.sin(dec) * Math.cos(LATITUDE) - Math.cos(dec) * Math.cos(H) * Math.sin(LATITUDE);
        const y = Math.sin(LATITUDE) * Math.sin(dec) + Math.cos(LATITUDE) * Math.cos(dec) * Math.cos(H);
        return { x, y, z, alt: Math.asin(clamp(y, -1, 1)) / RAD };
    }
    const sunDir = date => dirOf((hourOf(date) - NOON) * 15 * RAD, declination(date));
    function moonDir(date, age) {
        let H = (hourOf(date) - (NOON + age * LAG)) * 15 * RAD;
        H = Math.atan2(Math.sin(H), Math.cos(H));
        return dirOf(H, declination(date) * Math.cos(2 * Math.PI * age / SYNODIC));
    }

    // ---- The windows, and where the light through them lands ---------------------
    // Each pane of glass as a polygon in metres, with the way it faces out
    // (n): the clerestory, twin lights to a bay each side; a skylight in the
    // crown of every bay; the great window in the north wall; and the wall
    // of glass behind us at the south end, which we never see, but whose
    // light comes in over our shoulder in a grid of panes and goes down the
    // hall, swinging from the left of the floor in the morning to the right
    // in the afternoon. The mullions between panes are the bars of shadow in
    // every patch of sun.
    function arch(cx, y0, y1, half, n) {
        const spring = y1 - half, out = [];
        out.push([-half, y0], [-half, spring]);
        for (let i = 1; i < n; i++) { const a = Math.PI - Math.PI * i / n; out.push([half * Math.cos(a), spring + half * Math.sin(a)]); }
        out.push([half, spring], [half, y0]);
        return out.map(([u, v]) => [cx + u, v]);
    }
    let WINDOWS = null;
    // The glass of a side window, as the art draws it: two lights under one arch.
    const sideLights = zc => { const R = ROOM, h = R.winW / 2, m = 0.14, w = (h - m) / 2; return [arch(zc - m - w, R.win0, R.win1 - 0.5, w, 6), arch(zc + m + w, R.win0, R.win1 - 0.5, w, 6)]; };
    const SOUTH = { x0: -9.2, x1: 9.2, y0: 1.8, y1: 19.8, cols: 5, rows: 6, bar: 0.32, z: 0.6 };
    function windows() {
        if (WINDOWS) return WINDOWS;
        const R = ROOM, out = [];
        for (let k = 0; k < R.bays; k++) {
            const zc = bayZ(k);
            for (const side of [-1, 1]) for (const light of sideLights(zc)) out.push({ kind: 'side', k, side, n: [side, 0, 0], pts: light.map(([z, y]) => [side * R.hw, y, z]) });
            const pts = [];
            for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; pts.push([Math.cos(a) * R.oculus, R.apex, zc + Math.sin(a) * R.oculus]); }
            out.push({ kind: 'oculus', k, side: 0, n: [0, 1, 0], pts });
        }
        out.push({ kind: 'north', k: R.bays, side: 0, n: [0, 0, 1], pts: arch(0, 11.6, 23.6, 5.6, 12).map(([x, y]) => [x, y, R.len]) });
        const S = SOUTH, pw = (S.x1 - S.x0 - (S.cols - 1) * S.bar) / S.cols, ph = (S.y1 - S.y0 - (S.rows - 1) * S.bar) / S.rows;
        for (let i = 0; i < S.cols; i++) for (let j = 0; j < S.rows; j++) {
            const x0 = S.x0 + i * (pw + S.bar), y0 = S.y0 + j * (ph + S.bar);
            out.push({ kind: 'south', k: -1, side: 0, n: [0, 0, -1], pts: [[x0, y0, S.z], [x0, y0 + ph, S.z], [x0 + pw, y0 + ph, S.z], [x0 + pw, y0, S.z]] });
        }
        return (WINDOWS = out);
    }
    // The beam through a window as points in the air, for a shaft to be drawn
    // between: the glass (or, for glass behind us, where the beam crosses
    // `nearD` metres in front of the eye) and where it lands.
    function shaft(b, s, nearD = 2.2) {
        let top = b.window.pts;
        if (top.some(p => p[2] < nearD)) {
            if (s.z > -0.02) return null;
            top = top.map(p => { const t = (p[2] - nearD) / s.z; return [p[0] - s.x * t, p[1] - s.y * t, nearD]; });
            if (top.every(p => p[1] < 0.2)) return null;
        }
        const land = [...(b.floor || []), ...(b.wall || [])];
        return land.length ? [...top, ...land] : null;
    }

    // Keep the part of a polygon (as [a, b] pairs) where keep(p) >= 0, cutting along the line keep(p) = 0.
    function clip(poly, keep) {
        const out = [];
        for (let i = 0; i < poly.length; i++) {
            const a = poly[i], b = poly[(i + 1) % poly.length], ka = keep(a), kb = keep(b);
            if (ka >= 0) out.push(a);
            if ((ka >= 0) !== (kb >= 0)) { const t = ka / (ka - kb); out.push(a.map((v, j) => v + (b[j] - v) * t)); }
        }
        return out;
    }
    const clipBox = (poly, ax, lo, hi) => clip(clip(poly, p => p[ax] - lo), p => hi - p[ax]);
    function area2(poly, a = 0, b = 2) { let s = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; s += p[a] * q[b] - q[a] * p[b]; } return s / 2; }
    function centroid(poly, a = 0, b = 2) { let x = 0, y = 0; for (const p of poly) { x += p[a]; y += p[b]; } return [x / poly.length, y / poly.length]; }
    function inside(poly, x, y, a = 0, b = 2) {
        let c = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const p = poly[i], q = poly[j]; if ((p[b] > y) !== (q[b] > y) && x < (q[a] - p[a]) * (y - p[b]) / (q[b] - p[b]) + p[a]) c = !c; }
        return c;
    }
    // The convex hull of points [x, y] (screen pixels), for a shaft of light from a window to where it lands.
    function hull(points) {
        const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        if (p.length < 3) return p;
        const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
        const lo = [], up = [];
        for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
        for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
        return lo.slice(0, -1).concat(up.slice(0, -1));
    }

    // Where light from direction `s` (toward the sun or the moon, as from
    // sunDir) comes through the windows: for each window it shines through,
    // the patch on the floor and the patch on a wall, in metres, and how
    // strong (k, 0 to 1). The floor under the galleries is in their shade.
    function beams(s) {
        const R = ROOM, out = [];
        if (!s || s.y < 0.02) return out;
        const fx = R.g1x - 0.1;
        for (const w of windows()) {
            const facing = w.n[0] * s.x + w.n[1] * s.y + w.n[2] * s.z;
            if (facing < 0.03) continue;
            // Each corner of the window, down along the light to the floor.
            let floor = w.pts.map(p => { const t = p[1] / s.y; return [p[0] - s.x * t, 0, p[2] - s.z * t]; });
            floor = clipBox(clipBox(floor, 0, -fx, fx), 2, R.z0 + 0.2, R.len - 0.2);
            // And to the bookcases across the hall (side windows), or the north wall (from the south window).
            let wall = null;
            if (w.kind === 'side' && Math.abs(s.x) > 0.02) {
                const xw = -w.side * R.hw;
                wall = w.pts.map(p => { const t = (p[0] - xw) / s.x; return [xw, p[1] - s.y * t, p[2] - s.z * t]; });
                wall = clipBox(clipBox(wall, 1, 0, R.g2 + 1.2), 2, R.z0, R.len);
            } else if (w.kind === 'south' && s.z < -0.02) {
                wall = w.pts.map(p => { const t = (p[2] - R.len) / s.z; return [p[0] - s.x * t, p[1] - s.y * t, R.len]; });
                wall = clipBox(clipBox(wall, 1, 0, 11), 0, -R.hw, R.hw);
            }
            const k = smooth(0.5, 9, s.alt) * clamp(0.35 + facing * 1.2);
            const okFloor = floor.length >= 3 && Math.abs(area2(floor)) > 0.05, okWall = wall && wall.length >= 3 && Math.abs(area2(wall, w.kind === 'side' ? 2 : 0, 1)) > 0.05;
            if (!okFloor && !okWall) continue;
            out.push({ window: w, floor: okFloor ? floor : null, wall: okWall ? wall : null, k });
        }
        return out;
    }
    // The sunny places on the floor where a cat could lie: inside a patch, in an aisle, a little in from its edge.
    function sunSpots(list) {
        const out = [];
        for (const b of list) {
            if (!b.floor) continue;
            const a = Math.abs(area2(b.floor));
            if (a < 0.6) continue;
            const [cx, cz] = centroid(b.floor);
            for (const [dx, dz] of [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.6], [0, -0.6]]) {
                const x = cx + dx, z = cz + dz;
                if (inside(b.floor, x, z) && aisle(x, z)) { out.push({ x, z, area: a, k: b.k }); break; }
            }
        }
        return out;
    }
    // Floor a cat can lie on: not under a table, not inside a bookcase, not in the hearth.
    const aisle = (x, z) => Math.abs(x) < ROOM.hw - 1.6 && z > ROOM.z0 + 1 && z < ROOM.len - 1.5 && !tableAt(x, z, 0.35);
    const tableAt = (x, z, pad = 0) => { const R = ROOM; if (Math.abs(Math.abs(x) - R.tableX) > R.tableW / 2 + pad) return null; for (let k = 0; k < R.bays - 1; k++) { const zc = bayZ(k); if (Math.abs(z - zc) < R.tableLen / 2 + pad) return { k, side: Math.sign(x), zc }; } return null; };
    // How near (x, z) is to being in a patch of sun: 0 inside, else metres from the nearest patch's middle.
    function sunAt(list, x, z) {
        let best = Infinity;
        for (const b of list) { if (!b.floor) continue; if (inside(b.floor, x, z)) return 0; const [cx, cz] = centroid(b.floor); best = Math.min(best, Math.hypot(cx - x, cz - z)); }
        return best;
    }

    // ---- The light indoors ------------------------------------------------------
    // Painted Village's light for the sky in the windows (sky0..sky4, the
    // clouds, the stars, the moon), with the room's own over it: amb, the
    // daylight in the room from everywhere; keyA, the light of the great
    // window at the far end; keyB, the clerestory's light from up on the
    // left; the dust's colour in the air (haze0, haze1 toward the far
    // window); and `warm`, how much a lamp counts against all that.
    const KEYS = [
        { alt: -18, amb: [0.07, 0.068, 0.115], keyA: [0.07, 0.085, 0.17], keyB: [0.015, 0.015, 0.03], haze0: [0.035, 0.032, 0.06], haze1: [0.06, 0.07, 0.13], vignette: [0.2, 0.2, 0.3], warm: 1.25, veil: 0, glowA: 0 },
        { alt: -6, amb: [0.09, 0.085, 0.15], keyA: [0.26, 0.2, 0.3], keyB: [0.06, 0.05, 0.08], haze0: [0.09, 0.08, 0.13], haze1: [0.26, 0.18, 0.24], vignette: [0.28, 0.26, 0.36], warm: 1.15, veil: 0.05, glowA: 0.4 },
        { alt: 0, amb: [0.24, 0.2, 0.22], keyA: [0.62, 0.42, 0.32], keyB: [0.34, 0.22, 0.16], haze0: [0.24, 0.18, 0.16], haze1: [0.62, 0.42, 0.3], vignette: [0.42, 0.36, 0.38], warm: 0.75, veil: 0.12, glowA: 0.7 },
        { alt: 8, amb: [0.36, 0.33, 0.32], keyA: [0.6, 0.55, 0.5], keyB: [0.5, 0.42, 0.32], haze0: [0.36, 0.31, 0.26], haze1: [0.66, 0.58, 0.46], vignette: [0.52, 0.48, 0.48], warm: 0.42, veil: 0.1, glowA: 0.5 },
        { alt: 25, amb: [0.42, 0.41, 0.4], keyA: [0.6, 0.6, 0.6], keyB: [0.52, 0.49, 0.42], haze0: [0.42, 0.39, 0.34], haze1: [0.66, 0.62, 0.54], vignette: [0.56, 0.54, 0.54], warm: 0.28, veil: 0.07, glowA: 0.3 },
        { alt: 60, amb: [0.46, 0.45, 0.44], keyA: [0.62, 0.62, 0.62], keyB: [0.56, 0.54, 0.48], haze0: [0.44, 0.42, 0.38], haze1: [0.64, 0.62, 0.56], vignette: [0.58, 0.56, 0.56], warm: 0.22, veil: 0.05, glowA: 0.2 },
    ];
    const ROOMF = ['amb', 'keyA', 'keyB', 'haze0', 'haze1', 'vignette'], ROOMS = ['warm', 'veil', 'glowA'];
    function roomLight(sky, sunAlt, moonLight = 0) {
        let i = 1;
        while (i < KEYS.length - 1 && sunAlt > KEYS[i].alt) i++;
        const a = KEYS[i - 1], b = KEYS[i], t = clamp((sunAlt - a.alt) / (b.alt - a.alt));
        const out = { ...sky };
        for (const k of ROOMF) out[k] = mix(a[k], b[k], t);
        for (const k of ROOMS) out[k] = lerp(a[k], b[k], t);
        // A moonlit night: the far window and the clerestory a cold blue.
        const lift = smooth(-5, -13, sunAlt) * moonLight;
        out.keyA = out.keyA.map((v, j) => v + [0.07, 0.1, 0.2][j] * lift);
        out.amb = out.amb.map((v, j) => v + [0.015, 0.02, 0.04][j] * lift);
        out.glow = out.haze1; out.glowIn = out.haze1;
        out.alt = sunAlt;
        return out;
    }
    const lightKey = (l, step = 3) => { const q = v => Math.round(v * 255 / step); return [...[...ROOMF, 'sky0', 'sky2', 'sky4'].flatMap(k => l[k].map(q)), ...ROOMS.map(k => q(l[k])), q(l.stars || 0)].join(','); };

    // ---- Seasons and the calendar ----------------------------------------------
    // Which season it is outside the windows, and a date in it for the sun
    // when one is chosen rather than live.
    const SEASON_DAYS = { winter: [11, 21], spring: [3, 12], summer: [5, 21], autumn: [9, 22] };
    function seasonOf(date) { const m = date.getMonth(), d = date.getDate(); return m === 11 && d >= 1 || m < 2 || (m === 2 && d < 15) ? 'winter' : m < 5 || (m === 5 && d < 10) ? 'spring' : m < 8 || (m === 8 && d < 15) ? 'summer' : 'autumn'; }
    function seasonDate(season, date) {
        if (!SEASON_DAYS[season]) return date;
        const [m, d] = SEASON_DAYS[season], out = new Date(date.getTime());
        out.setMonth(m, d);
        return out;
    }
    // Whether the hall is decorated for Christmas: December to Twelfth Night, unless told otherwise.
    const christmas = (mode, date) => mode === 'always' ? true : mode === 'never' ? false : !!date && (date.getMonth() === 11 || (date.getMonth() === 0 && date.getDate() <= 6));          // (no date, no Christmas: the clock is always the host's)
    // The great clock strikes the hour: how many times, for an hour of the day.
    const strikes = hour => { const h = Math.floor(hour) % 12; return h === 0 ? 12 : h; };

    // ---- What is where ------------------------------------------------------------
    // Everything in metres. Tables in two rows down the hall, one to each bay
    // but the last (where the Christmas tree or the globe stands), three
    // lamps on each; chairs on both sides of every table; the fireplace in
    // the left wall of the second bay, its armchairs and its rug; busts and
    // globes on pedestals at the piers; the card catalogue and the
    // librarian's desk at the near end; the rolling ladders; a chandelier
    // in the middle of each bay. A few are left out on a narrow screen.
    function layout(cam, config) {
        const R = ROOM, L = { kind: cam.kind, tables: [], seats: [], things: [], lamps: [], ladders: [], chandeliers: [], nodes: {} };
        const on = k => config[k] !== false;
        const rows = Math.max(1, Math.min(R.bays - 1, Math.round(config.tables ?? 8)));
        for (let k = 0; k < rows; k++) for (const side of [-1, 1]) {
            const zc = bayZ(k), t = { id: L.tables.length, k, side, x: side * R.tableX, z: zc };
            L.tables.push(t);
            for (const dz of [-2.3, 0, 2.3]) L.lamps.push({ table: t.id, x: t.x, y: R.tableH + R.shade, z: zc + dz });
            // Chairs both sides, three a side; who faces which way.
            for (const across of [-1, 1]) for (const dz of [-2.3, 0, 2.3]) L.seats.push({ table: t.id, x: t.x + across * 1.18, z: zc + dz, face: -across, near: across === -side });
        }
        if (on('fireplace')) L.fire = { x: -R.hw, z: bayZ(1), y: 0.55 };
        const tree = christmas(config.decorations, config.date) && on('tree');
        L.tree = tree ? { x: 0, z: bayZ(Math.min(rows, R.bays - 1)) - 0.5, h: 8.2 } : null;
        if (!tree && rows < R.bays) L.things.push({ kind: 'globe', x: 0, z: bayZ(rows) - 1, big: true });
        for (let k = 1; k < R.bays; k++) for (const side of [-1, 1]) {
            if (side < 0 && L.fire && Math.abs(pierZ(k) - L.fire.z) < 5) continue;
            L.things.push({ kind: (k + (side > 0 ? 1 : 0)) % 3 === 0 ? 'globe' : 'bust', x: side * 9.6, z: pierZ(k), seed: k * 2 + (side > 0 ? 1 : 0) });
        }
        if (on('desk')) L.desk = { x: 8.4, z: 9.2 };
        L.things.push({ kind: 'catalogue', x: -8.6, z: 6.6 });
        if (L.fire) { L.things.push({ kind: 'armchair', x: -9.2, z: L.fire.z - 1.6, face: 1 }, { kind: 'armchair', x: -9.2, z: L.fire.z + 1.6, face: -1 }); L.rug = { x: -9.6, z: L.fire.z }; }
        for (const [side, k, at] of [[1, 1, 0.3], [-1, 3, 0.6], [1, 4, 0.2], [-1, 6, 0.4], [1, 7, 0.7]]) if (!(side < 0 && L.fire && k === 1)) L.ladders.push({ side, k, z: pierZ(k) + R.bay * at });
        if (on('chandeliers')) for (let k = 0; k < R.bays; k++) L.chandeliers.push({ k, x: 0, y: 10.2, z: bayZ(k) });
        // Where people and cats walk: the middle aisle and the two side aisles, crossing at the piers.
        for (let k = 0; k <= R.bays; k++) {
            const z = Math.min(R.len - 1.2, pierZ(k) + (k === 0 ? 1.5 : 0));
            for (const [name, x] of [['L', -8.2], ['M', 0], ['R', 8.2]]) L.nodes[name + k] = { name: name + k, x, z };
        }
        L.glow = { D: R.len, y: 17.5 };
        // The depths (metres) the picture is cut at for whoever moves: just beyond each row of tables, so that a cat
        // behind a table is hidden by it.
        L.bandsD = [];
        for (let k = 0; k < rows; k++) L.bandsD.push(bayZ(k) + R.tableLen / 2 + 0.35);
        return L;
    }

    // ---- The cats -------------------------------------------------------------------
    // Each cat has a habit (`role`), and the hour picks where it wants to be.
    // `want(cat, ctx)` gives a place { x, y, z, pose, perch } in metres;
    // ctx = { day (0 to 1: how much sun there is), spots (sunSpots), fire
    // (lit), lamps (tables whose lamps are lit), L }.
    const ROLES = ['sunbeam', 'shelf', 'ladder', 'kitten', 'lamp', 'rail', 'hearth', 'sunbeam', 'wander', 'desk', 'sunbeam', 'wander'];
    function want(cat, ctx) {
        const R = ROOM, L = ctx.L;
        const nearest = (list, x = cat.hx, z = cat.hz) => { let best = null, d = Infinity; for (const p of list) { const e = Math.hypot(p.x - x, p.z - z); if (e < d) { d = e; best = p; } } return best; };
        const hearth = () => L.fire ? { x: L.fire.x + 1.6, y: 0, z: L.fire.z + (cat.i % 2 ? 0.7 : -0.7), pose: 'curl' } : null;
        const onTable = t => t ? { x: t.x, y: R.tableH, z: t.z + (cat.i % 3 - 1) * 1.15, pose: 'loaf', perch: 'table' } : null;
        const underLamp = () => onTable(nearest(ctx.lamps));
        switch (cat.role) {
            case 'sunbeam': {
                // In the sun while there is any; by the fire, or under a lamp, after dark.
                if (ctx.day > 0.25 && ctx.spots.length) { const here = [cat.x ?? cat.hx, cat.z ?? cat.hz], s = nearest(ctx.spots.filter(s => !ctx.taken || !ctx.taken.has(s)), ...here) || nearest(ctx.spots, ...here); if (s) return { x: s.x, y: 0, z: s.z, pose: 'sprawl', sun: true, spot: s }; }
                return (ctx.fire && hearth()) || underLamp() || { x: cat.hx, y: 0, z: cat.hz, pose: 'curl' };
            }
            // By a lit lamp for its warmth; by day, on the nearest table anyway, among the books.
            case 'lamp': return underLamp() || onTable(nearest(L.tables)) || { x: cat.hx, y: 0, z: cat.hz, pose: 'curl' };
            case 'hearth': return hearth() || { x: cat.hx, y: 0, z: cat.hz, pose: 'curl' };
            case 'desk': return L.desk ? { x: L.desk.x - 0.4, y: 0.95, z: L.desk.z + 0.2, pose: 'loaf', perch: 'desk' } : { x: cat.hx, y: 0, z: cat.hz, pose: 'sit' };
            default: return { x: cat.hx, y: cat.hy || 0, z: cat.hz, pose: cat.pose || 'sit', perch: cat.perch };
        }
    }
    // Where to make for next on the way from (x, z) to (tx, tz) on the floor:
    // straight there if no table is in the way, else first along the aisle
    // to the gap between tables at the nearest pier, and across there.
    function waypoint(x, z, tx, tz) {
        let blocked = false;
        const n = Math.max(2, Math.ceil(Math.hypot(tx - x, tz - z) / 0.25));
        for (let i = 1; i <= n && !blocked; i++) { const t = i / n; if (tableAt(x + (tx - x) * t, z + (tz - z) * t, 0.3)) blocked = true; }
        if (!blocked) return [tx, tz];
        const k = clamp(Math.round((z - ROOM.z0) / ROOM.bay), 0, ROOM.bays), gz = pierZ(k) + (k === 0 ? 0.6 : 0);
        return Math.abs(z - gz) > 0.25 ? [x, gz] : [tx, gz];
    }
    // A step toward a place on the floor at `v` m/s, by way of the aisles; what is left to go.
    function stepToward(a, tx, tz, v, dt) {
        const [wx, wz] = waypoint(a.x, a.z, tx, tz), dx = wx - a.x, dz = wz - a.z, d = Math.hypot(dx, dz);
        if (d < 1e-3) return Math.hypot(tx - a.x, tz - a.z);
        const step = Math.min(d, v * dt);
        a.x += dx / d * step; a.z += dz / d * step;
        if (Math.abs(dx) > d * 0.25) a.dir = Math.sign(dx);
        return Math.hypot(tx - a.x, tz - a.z);
    }

    return { clamp, lerp, smooth, mix, ROOM, bayZ, pierZ, vaultY, camera, sunDir, moonDir, windows, sideLights, SOUTH, shaft, clip, clipBox, area2, centroid, inside, hull, beams, sunSpots, sunAt, aisle, tableAt, roomLight, lightKey, seasonOf, seasonDate, christmas, strikes, layout, ROLES, want, waypoint, stepToward };
})();
