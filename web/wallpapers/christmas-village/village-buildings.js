// Christmas Village's buildings: a New England town in clapboard and
// brick. Capes, colonials, saltboxes and gable-fronted houses, the general
// store, the inn, the meetinghouse with its steeple and clock, the tree
// farm's barn, the bandstand, the covered bridge, the skating hut and the
// cabin up the mountain. Each is painted in its own units (about a foot
// and a half each) in an oblique view: the front square on, one side
// running away up and to the right (or mirrored).
//
// Every painter returns what the manager needs to bring it to life, in
// screen pixels: `windows` (quads to light), `eaves` (lines to hang lights
// from), `chimneys`, `doors`, and `spots` where a cat might sit.

const VillageBuildings = (() => {
    const { poly, blob, mix, rgba, SNOW, SNOW_SHADE, TAU } = VillageArt;
    const { lerp } = VillageLogic;

    const WALLS = ['#f3f0e8', '#f3f0e8', '#efe5cc', '#dfc270', '#96392e', '#7c92ab', '#92a489', '#b7b2aa', '#6f4c3c', '#3f556b'];
    const SHUTTERS = ['#1c2a23', '#20242c', '#571d1d', '#1e3350', '#20242c'];
    const DOORS = ['#9a2c23', '#1e4935', '#22334d', '#7a1f1f', '#2a2a2e'];
    const TRIM = '#fbfaf6';
    const shade = (c, t = 0.24) => mix(c, '#1a2440', t);

    // A building's own frame: units, mirrored if `flip`. Returns the map
    // from its units to the screen.
    function enter(g, b) {
        const f = b.flip ? -1 : 1;
        g.save();
        g.translate(b.x, b.y);
        g.scale(b.k * f, b.k);
        return (x, y) => [b.x + x * b.k * f, b.y + y * b.k];
    }
    // The side wall's frame, inside a building's: x runs back along the wall.
    const side = (g, xf, rise) => { g.save(); g.transform(1, -rise, 0, 1, xf, 0); };

    function clapboards(g, x, y, w, h, gap = 2.3) {
        g.strokeStyle = 'rgba(30,40,70,0.13)';
        g.lineWidth = 0.3;
        g.beginPath();
        for (let yy = y + gap; yy < y + h; yy += gap) { g.moveTo(x, yy); g.lineTo(x + w, yy); }
        g.stroke();
    }

    // A sash window centred on (cx, cy). Returns its glass as [x, y, w, h].
    function sash(g, cx, cy, w, h, o = {}) {
        if (o.shutter) {
            g.fillStyle = o.shutter;
            g.fillRect(cx - w / 2 - w * 0.5, cy - h / 2, w * 0.42, h);
            g.fillRect(cx + w / 2 + w * 0.08, cy - h / 2, w * 0.42, h);
        }
        g.fillStyle = o.trim || TRIM;
        if (o.arch) { g.beginPath(); g.arc(cx, cy - h / 2, w / 2 + 0.7, Math.PI, 0); g.fill(); }
        g.fillRect(cx - w / 2 - 0.7, cy - h / 2 - 0.7, w + 1.4, h + 1.6);
        const glass = g.createLinearGradient(0, cy - h / 2, 0, cy + h / 2);
        glass.addColorStop(0, '#1a2336');
        glass.addColorStop(1, '#31405f');
        g.fillStyle = glass;
        if (o.arch) { g.beginPath(); g.arc(cx, cy - h / 2, w / 2, Math.PI, 0); g.fill(); }
        g.fillRect(cx - w / 2, cy - h / 2, w, h);
        g.fillStyle = 'rgba(190,212,244,0.17)';
        g.beginPath(); g.moveTo(cx - w / 2, cy + h * 0.1); g.lineTo(cx + w / 2, cy - h * 0.36); g.lineTo(cx + w / 2, cy - h * 0.1); g.lineTo(cx - w / 2, cy + h * 0.36); g.closePath(); g.fill();
        g.strokeStyle = o.trim || TRIM;
        g.lineWidth = 0.42;
        g.beginPath();
        const cols = o.cols || 2, rows = o.rows || 4;
        for (let i = 1; i < cols; i++) { g.moveTo(cx - w / 2 + w * i / cols, cy - h / 2 - (o.arch ? w / 2 : 0)); g.lineTo(cx - w / 2 + w * i / cols, cy + h / 2); }
        for (let i = 1; i < rows; i++) { g.moveTo(cx - w / 2, cy - h / 2 + h * i / rows); g.lineTo(cx + w / 2, cy - h / 2 + h * i / rows); }
        g.stroke();
        blob(g, cx, cy + h / 2 + 1, w / 2 + 1.3, 1.05, SNOW);
        return [cx - w / 2, cy - h / 2 - (o.arch ? w / 2 : 0), w, h + (o.arch ? w / 2 : 0)];
    }

    function wreath(g, x, y, r) {
        g.strokeStyle = '#1d5a37';
        g.lineWidth = r * 0.6;
        g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
        g.strokeStyle = '#2f7a4c';
        g.lineWidth = r * 0.22;
        g.setLineDash([r * 0.35, r * 0.3]);
        g.beginPath(); g.arc(x, y, r * 1.05, 0, TAU); g.stroke();
        g.setLineDash([]);
        g.fillStyle = '#c62f27';
        g.beginPath(); g.moveTo(x, y + r); g.lineTo(x - r * 0.75, y + r * 0.55); g.lineTo(x - r * 0.75, y + r * 1.45); g.closePath(); g.fill();
        g.beginPath(); g.moveTo(x, y + r); g.lineTo(x + r * 0.75, y + r * 0.55); g.lineTo(x + r * 0.75, y + r * 1.45); g.closePath(); g.fill();
    }

    function door(g, cx, h, o) {
        g.fillStyle = TRIM;
        g.fillRect(cx - 4.3, -h - 1.2, 8.6, h + 1.2);
        if (o.pediment) poly(g, [[cx - 5.4, -h - 1.2], [cx + 5.4, -h - 1.2], [cx, -h - 4.6]], TRIM);
        g.fillStyle = o.color;
        g.fillRect(cx - 3.1, -h, 6.2, h);
        g.fillStyle = 'rgba(0,0,0,0.2)';
        g.fillRect(cx - 2.2, -h * 0.42, 1.8, h * 0.34);
        g.fillRect(cx + 0.4, -h * 0.42, 1.8, h * 0.34);
        g.fillStyle = '#d8b24a';
        g.fillRect(cx + 1.9, -h * 0.5, 0.6, 0.6);
        // The step, and the snow shovelled off it.
        g.fillStyle = '#9aa2b0';
        g.fillRect(cx - 5.2, -1.4, 10.4, 1.4);
        blob(g, cx, -1.5, 5.4, 0.7, SNOW);
        wreath(g, cx, -h * 0.68, 1.75);
    }

    function chimney(g, x, y, w, h, stone) {
        g.fillStyle = stone ? '#8d8a88' : '#8a4a3b';
        g.fillRect(x - w / 2, y - h, w, h);
        g.fillStyle = stone ? '#6d6b6e' : '#6a3529';
        g.fillRect(x + w * 0.1, y - h, w * 0.4, h);
        g.fillStyle = stone ? '#77757a' : '#5d3026';
        g.fillRect(x - w / 2 - 0.6, y - h - 1.2, w + 1.2, 1.4);
        blob(g, x, y - h - 1.4, w / 2 + 1, 1.2, SNOW);
    }

    // Snow where a wall meets the ground, so nothing looks set down on top of it.
    function drift(g, x0, x1, y, random) {
        for (let x = x0; x <= x1; x += 4 + random() * 4) blob(g, x, y + 0.4, 4 + random() * 4, 1.2 + random() * 1.3, random() < 0.3 ? '#eef3fa' : '#ffffff');
    }

    // A snowed-under shrub.
    function shrub(g, x, y, r) {
        blob(g, x, y - r * 0.5, r, r * 0.62, '#244f3a');
        blob(g, x - r * 0.1, y - r * 0.75, r * 0.95, r * 0.5, SNOW);
    }

    // Icicles along an eave from x0 to x1 at y.
    function icicles(g, x0, x1, y, random) {
        g.fillStyle = 'rgba(232,242,255,0.9)';
        for (let x = x0 + random() * 3; x < x1; x += 1.6 + random() * 3.2) {
            const len = 1.2 + random() * 3.4;
            g.beginPath(); g.moveTo(x - 0.4, y); g.lineTo(x + 0.4, y); g.lineTo(x, y + len); g.closePath(); g.fill();
        }
    }

    // ---- Houses ---------------------------------------------------------------

    const SPECS = {
        cape: { D: 22, wall: 21, rise: 23, stories: 1, bays: 5, chimneys: [0.5], dormers: 2, apex: 0.5 },
        colonial: { D: 24, wall: 39, rise: 17, stories: 2, bays: 5, chimneys: [0.14, 0.86], apex: 0.5, pediment: true },
        saltbox: { D: 32, wall: 37, rise: 15, stories: 2, bays: 3, chimneys: [0.5], apex: 0.3, back: 19 },
        gable: { D: 26, wall: 33, rise: 21, stories: 2, bays: 3, chimneys: [0.62], front: true, porch: true },
        inn: { D: 26, wall: 40, rise: 18, stories: 2, bays: 7, chimneys: [0.1, 0.5, 0.9], apex: 0.5, porch: true, pediment: true },
    };

    function house(g, b, random) {
        if (b.style === 'store') return store(g, b, random);
        const sp = SPECS[b.style], T = VillageLogic.STYLES[b.style].w, D = sp.D, F = T - D;
        const x0 = -T / 2, xf = x0 + F, xr = T / 2, lift = D * 0.17, rise = lift / D;
        const wallColor = b.style === 'inn' ? '#f3f0e8' : WALLS[b.tint % WALLS.length], dark = hex => shade(hex, 0.26);
        const shutter = SHUTTERS[(b.tint >> 4) % SHUTTERS.length], doorColor = DOORS[(b.tint >> 8) % DOORS.length];
        const trim = wallColor === '#f3f0e8' ? TRIM : '#f6f3ea';
        const out = enter(g, b);
        const meta = { windows: [], eaves: [], chimneys: [], doors: [], spots: [], house: b };
        const W = sp.wall, R = sp.rise;
        blob(g, xr - D * 0.2, 1.5, D * 0.9, 3.4, 'rgba(110,136,184,0.42)');

        // The side wall, away from the light.
        const au = sp.apex ?? 0.5, xa = xf + D * au, ya = -lift * au - W - R, backWall = sp.back ?? W;
        if (sp.front) poly(g, [[xf, 0], [xr, -lift], [xr, -lift - W], [xf, -W]], dark(wallColor));
        else poly(g, [[xf, 0], [xr, -lift], [xr, -lift - backWall], [xa, ya], [xf, -W]], dark(wallColor));
        side(g, xf, rise);
        g.save();
        g.beginPath();
        if (sp.front) g.rect(0, -W, D, W); else { g.moveTo(0, 0); g.lineTo(D, 0); g.lineTo(D, -backWall); g.lineTo(D * au, -W - R); g.lineTo(0, -W); g.closePath(); }
        g.clip();
        clapboards(g, 0, -W - R, D, W + R);
        g.restore();
        const sideOut = (x, y) => out(xf + x, y - x * rise);
        const sideWin = (cx, cy, w, h) => { const q = sash(g, cx, cy, w, h, { trim }); meta.windows.push({ q: [sideOut(q[0], q[1]), sideOut(q[0] + q[2], q[1]), sideOut(q[0] + q[2], q[1] + q[3]), sideOut(q[0], q[1] + q[3])] }); };
        const perStory = W / sp.stories;
        for (let st = 0; st < sp.stories; st++) for (const u of D > 28 ? [0.26, 0.68] : [0.5]) sideWin(D * u, -perStory * (st + 0.5) - 0.5, 4.2, 7);
        if (!sp.front) sideWin(D * au, -W - R * 0.36, 3.2, 4.6);
        g.restore();

        // The front.
        const face = g.createLinearGradient(0, -W, 0, 0);
        face.addColorStop(0, shade(wallColor, 0.1));
        face.addColorStop(0.2, wallColor);
        face.addColorStop(1, shade(wallColor, 0.05));
        if (sp.front) poly(g, [[x0, 0], [xf, 0], [xf, -W], [x0 + F / 2, -W - R], [x0, -W]], face);
        else { g.fillStyle = face; g.fillRect(x0, -W, F, W); }
        g.save();
        g.beginPath();
        if (sp.front) { g.moveTo(x0, 0); g.lineTo(xf, 0); g.lineTo(xf, -W); g.lineTo(x0 + F / 2, -W - R); g.lineTo(x0, -W); g.closePath(); } else g.rect(x0, -W, F, W);
        g.clip();
        clapboards(g, x0, -W - R, F, W + R);
        g.restore();
        g.fillStyle = trim;
        g.fillRect(x0, -W, 1, W);
        g.fillRect(xf - 1, -W, 1, W);
        g.fillStyle = '#8f96a3';
        g.fillRect(x0, -1.2, F, 1.2);

        const frontWin = (cx, cy, w, h, o) => { const q = sash(g, cx, cy, w, h, { trim, shutter, ...o }); meta.windows.push({ q: [out(q[0], q[1]), out(q[0] + q[2], q[1]), out(q[0] + q[2], q[1] + q[3]), out(q[0], q[1] + q[3])], front: true }); };
        const bay = F / sp.bays, ww = Math.min(5.4, bay * 0.4), wh = ww * 1.62, mid = (sp.bays - 1) / 2;
        for (let st = 0; st < sp.stories; st++) {
            for (let i = 0; i < sp.bays; i++) {
                if (st === 0 && i === mid) continue;
                frontWin(x0 + bay * (i + 0.5), -perStory * (st + 0.5) - (sp.stories === 1 ? 0.5 : 1), ww, wh);
            }
        }
        if (sp.front) frontWin(x0 + F / 2, -W - R * 0.34, 3.4, 4.8, { shutter: null });
        const doorX = x0 + bay * (mid + 0.5);
        door(g, doorX, 12.4, { color: doorColor, pediment: sp.pediment && !sp.porch });
        meta.doors.push({ p: out(doorX, 0) });

        // The roof, deep in snow.
        g.fillStyle = 'rgba(30,44,84,0.24)';
        g.fillRect(x0, -W, F, 2.2);
        if (sp.front) {
            // The gable faces the street: the far slope runs back along the side.
            const roof = g.createLinearGradient(xf, 0, xr, 0);
            roof.addColorStop(0, '#e6edf7');
            roof.addColorStop(1, '#c9d6ea');
            poly(g, [[xf - 0.5, -W], [xr + 1, -lift - W + 0.4], [xr - F / 2 + 1, -lift - W - R], [x0 + F / 2, -W - R]], roof);
            g.strokeStyle = SNOW; g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round';
            g.beginPath(); g.moveTo(x0 - 2.4, -W + 1.4); g.lineTo(x0 + F / 2, -W - R - 0.6); g.lineTo(xf + 2.2, -W + 1.4); g.stroke();
            g.strokeStyle = 'rgba(120,144,190,0.5)'; g.lineWidth = 0.6;
            g.beginPath(); g.moveTo(x0 - 2.2, -W + 3); g.lineTo(x0 + F / 2, -W - R + 1.2); g.lineTo(xf + 2, -W + 3); g.stroke();
            g.lineCap = 'butt';
            meta.eaves.push([out(x0 - 2, -W + 2.6), out(x0 + F / 2, -W - R + 0.8)], [out(x0 + F / 2, -W - R + 0.8), out(xf + 2, -W + 2.6)]);
            meta.spots.push({ p: out(xr - F / 2 - D * 0.3, -lift * 0.6 - W - R - 0.6), kind: 'roof' });
        } else {
            const roof = g.createLinearGradient(0, ya, 0, -W);
            roof.addColorStop(0, '#ffffff');
            roof.addColorStop(1, '#dbe5f3');
            poly(g, [[x0 - 2.2, -W + 1.2], [xf + 1, -W + 1.2], [xa + 0.6, ya - 0.4], [xa - F - 1.4, ya - 0.4]], roof);
            // Lines where the snow has slumped.
            g.strokeStyle = 'rgba(150,172,210,0.4)'; g.lineWidth = 0.4;
            for (let i = 0; i < 3; i++) { const t = 0.3 + i * 0.22 + random() * 0.08; g.beginPath(); g.moveTo(lerp(xa - F, x0 - 2, t) + 3, lerp(ya, -W + 1, t)); g.lineTo(lerp(xa, xf, t) - 3 - random() * F * 0.3, lerp(ya, -W + 1, t)); g.stroke(); }
            // The rake of the gable end, and the lip of snow along the eave.
            g.strokeStyle = SNOW; g.lineWidth = 2.6; g.lineCap = 'round'; g.lineJoin = 'round';
            g.beginPath(); g.moveTo(xf + 0.6, -W + 1); g.lineTo(xa, ya); g.lineTo(xr + 1.4, -lift - backWall + 1.2); g.stroke();
            g.strokeStyle = 'rgba(110,134,184,0.55)'; g.lineWidth = 0.6;
            g.beginPath(); g.moveTo(xf + 1.2, -W + 2.6); g.lineTo(xa + 0.2, ya + 1.8); g.lineTo(xr + 1.2, -lift - backWall + 2.8); g.stroke();
            g.strokeStyle = SNOW; g.lineWidth = 3.1;
            g.beginPath(); g.moveTo(x0 - 2.2, -W + 1); g.lineTo(xf + 0.8, -W + 1); g.stroke();
            g.lineCap = 'butt';
            icicles(g, x0 - 1, xf, -W + 2.4, random);
            meta.eaves.push([out(x0 - 2, -W + 3), out(xf + 0.6, -W + 3)], [out(xf + 0.8, -W + 3), out(xa, ya + 2.2)], [out(xa, ya + 2.2), out(xr + 1, -lift - backWall + 3)]);
            meta.spots.push({ p: out(xa - F * (0.3 + random() * 0.4), ya - 0.8), kind: 'roof' });
            // Dormers on a cape.
            for (let i = 0; i < (sp.dormers || 0); i++) {
                const u = (i + 1) / (sp.dormers + 1), dx = lerp(x0, xf, u) + D * au * 0.42, dy = lerp(-W, ya, 0.42);
                g.fillStyle = wallColor; g.fillRect(dx - 3.4, dy - 7, 6.8, 7);
                const q = sash(g, dx, dy - 3.3, 3.4, 4.4, { trim });
                meta.windows.push({ q: [out(q[0], q[1]), out(q[0] + q[2], q[1]), out(q[0] + q[2], q[1] + q[3]), out(q[0], q[1] + q[3])], front: true });
                poly(g, [[dx - 4.6, dy - 6.6], [dx + 4.6, dy - 6.6], [dx, dy - 11]], SNOW);
                g.strokeStyle = 'rgba(110,134,184,0.5)'; g.lineWidth = 0.5;
                g.beginPath(); g.moveTo(dx - 4.4, dy - 6.2); g.lineTo(dx + 4.4, dy - 6.2); g.stroke();
            }
        }
        for (const u of sp.chimneys) {
            const cx = sp.front ? lerp(x0 + F / 2, xr - F / 2, u) + 2 : lerp(xa - F, xa, u), cy = sp.front ? -W - R - lift * u + 2 : ya + 1.5;
            chimney(g, cx, cy, 5.6, 9.5);
            meta.chimneys.push({ p: out(cx, cy - 11) });
        }

        // A porch across the front.
        if (sp.porch) {
            const px0 = sp.front ? x0 - 1.5 : x0 + bay * (mid - 1) - 1, px1 = sp.front ? xf + 1.5 : x0 + bay * (mid + 2) + 1, py = -15.5;
            g.fillStyle = '#9aa2b0';
            g.fillRect(px0, -1.6, px1 - px0, 1.6);
            g.fillStyle = trim;
            for (let i = 0, n = Math.max(2, Math.round((px1 - px0) / 11)); i <= n; i++) g.fillRect(lerp(px0 + 0.6, px1 - 1.6, i / n), py, 1, -py - 1.4);
            g.strokeStyle = trim; g.lineWidth = 0.5;
            g.beginPath(); g.moveTo(px0, -6); g.lineTo(doorX - 5, -6); g.moveTo(doorX + 5, -6); g.lineTo(px1, -6); g.stroke();
            poly(g, [[px0 - 1.6, py + 1], [px1 + 1.6, py + 1], [px1 + 0.4, py - 3.6], [px0 - 0.4, py - 3.6]], '#e3ebf6');
            g.strokeStyle = SNOW; g.lineWidth = 2.2; g.lineCap = 'round';
            g.beginPath(); g.moveTo(px0 - 1.6, py + 0.6); g.lineTo(px1 + 1.6, py + 0.6); g.stroke();
            g.lineCap = 'butt';
            icicles(g, px0 - 1, px1 + 1, py + 1.6, random);
            meta.eaves.push([out(px0 - 1.4, py + 2.2), out(px1 + 1.4, py + 2.2)]);
            meta.spots.push({ p: out(px0 + 4 + random() * 6, -1.8), kind: 'porch' });
        } else meta.spots.push({ p: out(doorX + (random() < 0.5 ? -7 : 7), -0.6), kind: 'step' });
        if (b.style === 'inn') {
            // The inn's sign, hung out over the street.
            g.fillStyle = '#20242c';
            g.fillRect(x0 - 9, -30, 9, 0.9);
            g.fillRect(x0 - 9.4, -30, 0.9, 30);
            g.fillStyle = '#27452f';
            g.fillRect(x0 - 8, -28.4, 6.6, 8);
            g.strokeStyle = '#d8b24a'; g.lineWidth = 0.4;
            g.strokeRect(x0 - 7.4, -27.8, 5.4, 6.8);
            blob(g, x0 - 4.8, -30.4, 5, 0.8, SNOW);
        }
        shrub(g, x0 + bay * 0.6, 0.6, 4.2);
        shrub(g, xf - bay * 0.6, 0.6, 3.8);
        drift(g, x0 - 2, xr + 2, 0.5, random);
        g.restore();
        meta.spots.push({ p: out(x0 + bay * 0.5, -perStory * 0.5 + wh / 2 - 0.6), kind: 'sill' });
        return meta;
    }

    function store(g, b, random) {
        const T = VillageLogic.STYLES.store.w, D = 20, F = T - D, x0 = -T / 2, xf = x0 + F, xr = T / 2, lift = D * 0.17, W = 37;
        b.flip = false;
        const out = enter(g, b), meta = { windows: [], eaves: [], chimneys: [], doors: [], spots: [], house: b };
        const wall = '#7b2f2a';
        blob(g, xr - D * 0.2, 1.5, D * 0.9, 3.4, 'rgba(110,136,184,0.42)');
        poly(g, [[xf, 0], [xr, -lift], [xr, -lift - W + 6], [xf, -W + 6]], shade(wall, 0.3));
        poly(g, [[xf - 0.5, -W + 6], [xr + 1, -lift - W + 6], [xr - 4, -lift - W - 3], [xf - 4, -W - 3]], '#d5dfee');
        // The false front, with its cornice and its name.
        g.fillStyle = wall;
        g.fillRect(x0, -W - 7, F, W + 7);
        clapboards(g, x0, -W - 7, F, W + 7);
        g.fillStyle = TRIM;
        g.fillRect(x0 - 1.5, -W - 8.6, F + 3, 2.2);
        g.fillRect(x0, -W - 7, 1.2, W + 7);
        g.fillRect(xf - 1.2, -W - 7, 1.2, W + 7);
        g.strokeStyle = SNOW; g.lineWidth = 2.6; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x0 - 1.6, -W - 9.4); g.lineTo(xf + 1.6, -W - 9.4); g.stroke();
        g.lineCap = 'butt';
        g.fillStyle = '#f3ead6';
        g.fillRect(x0 + 7, -W - 4.6, F - 14, 8.4);
        g.fillStyle = '#27452f';
        g.textAlign = 'center';
        g.font = "5px Georgia, 'Times New Roman', serif";
        g.fillText('GENERAL STORE', x0 + F / 2, -W + 1.6, F - 18);
        // Upstairs windows, then the shopfront: two big panes and the door between.
        for (const u of [0.22, 0.5, 0.78]) { const q = sash(g, x0 + F * u, -W + 13, 4.8, 7.6, { shutter: '#1c2a23' }); meta.windows.push({ q: [out(q[0], q[1]), out(q[0] + q[2], q[1]), out(q[0] + q[2], q[1] + q[3]), out(q[0], q[1] + q[3])], front: true }); }
        for (const [a, c] of [[x0 + 4, x0 + F / 2 - 6], [x0 + F / 2 + 6, xf - 4]]) {
            g.fillStyle = TRIM; g.fillRect(a - 0.8, -15.8, c - a + 1.6, 12.6);
            const glass = g.createLinearGradient(0, -15, 0, -4);
            glass.addColorStop(0, '#1a2336'); glass.addColorStop(1, '#31405f');
            g.fillStyle = glass; g.fillRect(a, -15, c - a, 11);
            g.strokeStyle = TRIM; g.lineWidth = 0.4;
            g.beginPath(); for (let i = 1; i < 3; i++) { g.moveTo(lerp(a, c, i / 3), -15); g.lineTo(lerp(a, c, i / 3), -4); } g.stroke();
            meta.windows.push({ q: [out(a, -15), out(c, -15), out(c, -4), out(a, -4)], front: true, shop: true });
            blob(g, (a + c) / 2, -3.2, (c - a) / 2 + 1, 0.9, SNOW);
        }
        door(g, x0 + F / 2, 12.4, { color: '#1e4935' });
        meta.doors.push({ p: out(x0 + F / 2, 0) });
        // The awning: red and white, sagging a little under the snow.
        const ay = -17.5;
        for (let i = 0, n = 12; i < n; i++) poly(g, [[lerp(x0 - 1, xf + 1, i / n), ay - 4.6], [lerp(x0 - 1, xf + 1, (i + 1) / n), ay - 4.6], [lerp(x0 - 3, xf + 3, (i + 1) / n), ay + 1.2], [lerp(x0 - 3, xf + 3, i / n), ay + 1.2]], i % 2 ? '#f3f0e8' : '#b63a30');
        g.strokeStyle = SNOW; g.lineWidth = 2; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x0 - 1, ay - 4.8); g.lineTo(xf + 1, ay - 4.8); g.stroke();
        g.lineCap = 'butt';
        icicles(g, x0 - 2.5, xf + 2.5, ay + 1.4, random);
        meta.eaves.push([out(x0 - 3, ay + 2), out(xf + 3, ay + 2)], [out(x0 - 1.4, -W - 6.2), out(xf + 1.4, -W - 6.2)]);
        // A barrel and a sledge for sale by the door.
        g.fillStyle = '#6b4a33'; g.fillRect(xf - 9, -6, 4.4, 6);
        g.fillStyle = '#3d2c20'; g.fillRect(xf - 9, -4.6, 4.4, 0.6); g.fillRect(xf - 9, -2, 4.4, 0.6);
        blob(g, xf - 6.8, -6.2, 2.5, 0.8, SNOW);
        meta.spots.push({ p: out(xf - 6.8, -6.6), kind: 'barrel' }, { p: out(x0 + 10, -0.6), kind: 'step' });
        chimney(g, xr - 8, -lift - W - 1, 5, 8);
        meta.chimneys.push({ p: out(xr - 8, -lift - W - 10.4) });
        drift(g, x0 - 2, xr + 2, 0.5, random);
        g.restore();
        return meta;
    }

    // ---- The meetinghouse -----------------------------------------------------

    function church(g, b, random) {
        const F = 44, D = 48, W = 38, R = 15, x0 = -34, xf = x0 + F, xr = xf + D, lift = D * 0.17, rise = lift / D;
        const out = enter(g, b), meta = { windows: [], eaves: [], chimneys: [], doors: [], spots: [], church: true };
        const wall = '#f6f3ec';
        blob(g, xr - D * 0.3, 2, D * 0.9, 4, 'rgba(110,136,184,0.42)');
        // The long side, with its tall windows.
        poly(g, [[xf, 0], [xr, -lift], [xr, -lift - W], [xf, -W]], shade(wall, 0.2));
        side(g, xf, rise);
        clapboards(g, 0, -W, D, W);
        for (let i = 0; i < 4; i++) {
            const cx = D * (0.14 + i * 0.24), q = sash(g, cx, -17, 4.6, 15, { arch: true, rows: 5 });
            const so = (x, y) => out(xf + x, y - x * rise);
            meta.windows.push({ q: [so(q[0], q[1] + 2), so(q[0] + q[2], q[1] + 2), so(q[0] + q[2], q[1] + q[3]), so(q[0], q[1] + q[3])], church: true });
        }
        g.restore();
        const roof = g.createLinearGradient(xf, 0, xr, 0);
        roof.addColorStop(0, '#e8eef8'); roof.addColorStop(1, '#cdd9eb');
        poly(g, [[xf - 0.5, -W], [xr + 1.2, -lift - W + 0.4], [xr - F / 2 + 1.2, -lift - W - R], [x0 + F / 2, -W - R]], roof);
        // The front, with its pediment.
        poly(g, [[x0, 0], [xf, 0], [xf, -W], [x0 + F / 2, -W - R], [x0, -W]], wall);
        g.save();
        g.beginPath(); g.moveTo(x0, 0); g.lineTo(xf, 0); g.lineTo(xf, -W); g.lineTo(x0 + F / 2, -W - R); g.lineTo(x0, -W); g.closePath(); g.clip();
        clapboards(g, x0, -W - R, F, W + R);
        g.restore();
        g.fillStyle = TRIM;
        g.fillRect(x0, -W - 0.8, F, 1.6);
        g.fillRect(x0, -W, 2, W); g.fillRect(xf - 2, -W, 2, W);
        g.strokeStyle = SNOW; g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round';
        g.beginPath(); g.moveTo(x0 - 2.4, -W + 1.2); g.lineTo(x0 + F / 2, -W - R - 0.6); g.lineTo(xf + 2.2, -W + 1.2); g.stroke();
        g.lineCap = 'butt';
        for (const cx of [x0 + 7.5, xf - 7.5]) {
            const q = sash(g, cx, -18, 5, 15, { arch: true, rows: 5 });
            meta.windows.push({ q: [out(q[0], q[1] + 2), out(q[0] + q[2], q[1] + 2), out(q[0] + q[2], q[1] + q[3]), out(q[0], q[1] + q[3])], church: true, front: true });
        }
        meta.eaves.push([out(x0 - 2, -W + 2.6), out(x0 + F / 2, -W - R + 0.8)], [out(x0 + F / 2, -W - R + 0.8), out(xf + 2, -W + 2.6)]);
        // The tower: base, clock, belfry, and the spire.
        const tx = x0 + F / 2, tw = 17;
        const tower = g.createLinearGradient(tx - tw / 2, 0, tx + tw / 2, 0);
        tower.addColorStop(0, '#ffffff'); tower.addColorStop(0.62, wall); tower.addColorStop(1, shade(wall, 0.2));
        g.fillStyle = tower;
        g.fillRect(tx - tw / 2, -72, tw, 72);
        clapboards(g, tx - tw / 2, -72, tw, 72);
        g.fillStyle = TRIM;
        g.fillRect(tx - tw / 2 - 1.2, -57, tw + 2.4, 1.5);
        g.fillRect(tx - tw / 2 - 1.4, -73, tw + 2.8, 1.8);
        blob(g, tx, -73.6, tw / 2 + 1.6, 1.3, SNOW);
        // The belfry, open to the bell.
        const bw = 13.5;
        g.fillStyle = tower;
        g.fillRect(tx - bw / 2, -90, bw, 17);
        g.fillStyle = '#232b3d';
        g.beginPath(); g.arc(tx, -83.5, 3.3, Math.PI, 0); g.fill();
        g.fillRect(tx - 3.3, -83.5, 6.6, 8.5);
        g.fillStyle = '#b08a3a';
        g.beginPath(); g.arc(tx, -80.6, 2.1, Math.PI, 0); g.fill();
        g.fillRect(tx - 2.5, -80.6, 5, 0.8);
        g.fillStyle = TRIM;
        g.fillRect(tx - bw / 2 - 1.2, -91.4, bw + 2.4, 1.8);
        blob(g, tx, -92, bw / 2 + 1.4, 1.2, SNOW);
        // The spire, eight-sided: three faces show.
        poly(g, [[tx - bw / 2 + 0.6, -91.4], [tx - 2, -91.4], [tx, -138]], '#eef2f9');
        poly(g, [[tx - 2, -91.4], [tx + 2.6, -91.4], [tx, -138]], '#d5deed');
        poly(g, [[tx + 2.6, -91.4], [tx + bw / 2 - 0.6, -91.4], [tx, -138]], '#aebcd4');
        g.strokeStyle = '#d8b24a'; g.lineWidth = 0.5;
        g.beginPath(); g.moveTo(tx, -138); g.lineTo(tx, -145); g.moveTo(tx - 2.6, -142.6); g.lineTo(tx + 2.6, -142.6); g.stroke();
        blob(g, tx, -138.4, 0.9, 0.9, '#d8b24a');
        // The clock (the manager draws its hands), and the doors under it.
        blob(g, tx, -64.5, 4.6, 4.6, '#20242c');
        blob(g, tx, -64.5, 4, 4, '#f6f1e2');
        meta.clock = { p: out(tx, -64.5), r: 4 * b.k };
        g.fillStyle = '#20242c';
        for (let i = 0; i < 12; i++) g.fillRect(tx + Math.sin(i * Math.PI / 6) * 3.3 - 0.2, -64.5 - Math.cos(i * Math.PI / 6) * 3.3 - 0.2, 0.4, 0.4);
        const q = sash(g, tx, -42, 5, 9, { arch: true, rows: 3 });
        meta.windows.push({ q: [out(q[0], q[1] + 2), out(q[0] + q[2], q[1] + 2), out(q[0] + q[2], q[1] + q[3]), out(q[0], q[1] + q[3])], church: true, front: true });
        g.fillStyle = TRIM;
        g.fillRect(tx - 6.4, -20, 12.8, 20);
        g.beginPath(); g.arc(tx, -20, 6.4, Math.PI, 0); g.fill();
        g.fillStyle = '#1e4935';
        g.fillRect(tx - 5, -19, 4.8, 19); g.fillRect(tx + 0.2, -19, 4.8, 19);
        g.fillStyle = '#31405f';
        g.beginPath(); g.arc(tx, -20, 5, Math.PI, 0); g.fill();
        wreath(g, tx - 2.6, -12, 1.5); wreath(g, tx + 2.6, -12, 1.5);
        g.fillStyle = '#9aa2b0';
        g.fillRect(tx - 9, -1.6, 18, 1.6); g.fillRect(tx - 11, -0.6, 22, 0.8);
        blob(g, tx, -1.8, 9, 0.8, SNOW);
        meta.doors.push({ p: out(tx, 0) });
        meta.windows.push({ q: [out(tx - 5, -25), out(tx + 5, -25), out(tx + 5, -20), out(tx - 5, -20)], church: true, front: true });
        meta.spire = { p: out(tx, -138) };
        meta.eaves.push([out(tx - tw / 2 - 1, -55), out(tx + tw / 2 + 1, -55)]);
        drift(g, x0 - 2, xr + 2, 0.6, random);
        g.restore();
        return meta;
    }

    // ---- The tree farm's barn -------------------------------------------------

    function barn(g, b, random) {
        const F = 44, D = 30, W = 21, x0 = -37, xf = x0 + F, xr = xf + D, lift = D * 0.17, rise = lift / D;
        const out = enter(g, b), meta = { windows: [], eaves: [], chimneys: [], doors: [], spots: [] };
        const red = '#8d2e27';
        blob(g, xr - D * 0.3, 2, D * 0.9, 3.6, 'rgba(110,136,184,0.42)');
        poly(g, [[xf, 0], [xr, -lift], [xr, -lift - W], [xf, -W]], shade(red, 0.3));
        side(g, xf, rise);
        g.strokeStyle = 'rgba(20,10,10,0.22)'; g.lineWidth = 0.3;
        g.beginPath(); for (let x = 2; x < D; x += 2.4) { g.moveTo(x, 0); g.lineTo(x, -W); } g.stroke();
        const sq = sash(g, D * 0.5, -11, 4.4, 5.6, {});
        meta.windows.push({ q: [[sq[0], sq[1]], [sq[0] + sq[2], sq[1]], [sq[0] + sq[2], sq[1] + sq[3]], [sq[0], sq[1] + sq[3]]].map(([x, y]) => out(xf + x, y - x * rise)) });
        g.restore();
        // A gambrel roof: the lower slope steep, the upper one shallow.
        const g1 = [x0 + 8, -W - 13], g2 = [xf - 8, -W - 13], top = [x0 + F / 2, -W - 21];
        poly(g, [[xf - 0.4, -W], [xr + 1, -lift - W], [xr - 8 + 1, -lift - W - 13], [g2[0], g2[1]]], '#cfdaea');
        poly(g, [[g2[0], g2[1]], [xr - 7, -lift - W - 13], [xr - F / 2 + 1, -lift - W - 21], [top[0], top[1]]], '#e2e9f5');
        poly(g, [[x0, 0], [xf, 0], [xf, -W], g2, top, g1, [x0, -W]], red);
        g.save();
        g.beginPath(); g.moveTo(x0, 0); g.lineTo(xf, 0); g.lineTo(xf, -W); g.lineTo(g2[0], g2[1]); g.lineTo(top[0], top[1]); g.lineTo(g1[0], g1[1]); g.lineTo(x0, -W); g.closePath(); g.clip();
        g.strokeStyle = 'rgba(20,10,10,0.2)'; g.lineWidth = 0.3;
        g.beginPath(); for (let x = x0 + 2.2; x < xf; x += 2.4) { g.moveTo(x, 0); g.lineTo(x, -W - 22); } g.stroke();
        g.restore();
        g.strokeStyle = SNOW; g.lineWidth = 2.8; g.lineCap = 'round'; g.lineJoin = 'round';
        g.beginPath(); g.moveTo(x0 - 2, -W + 1); g.lineTo(g1[0] - 0.6, g1[1]); g.lineTo(top[0], top[1] - 0.6); g.lineTo(g2[0] + 0.6, g2[1]); g.lineTo(xf + 2, -W + 1); g.stroke();
        g.lineCap = 'butt';
        // The big doors, cross-braced in white; the loft door and its wreath.
        g.fillStyle = TRIM; g.fillRect(x0 + F / 2 - 10.6, -17.6, 21.2, 17.6);
        for (const dx of [-10, 0.2]) {
            g.fillStyle = shade(red, 0.12); g.fillRect(x0 + F / 2 + dx, -17, 9.8, 17);
            g.strokeStyle = TRIM; g.lineWidth = 0.8;
            g.strokeRect(x0 + F / 2 + dx + 0.6, -16.4, 8.6, 15.8);
            g.beginPath(); g.moveTo(x0 + F / 2 + dx + 0.6, -16.4); g.lineTo(x0 + F / 2 + dx + 9.2, -0.6); g.moveTo(x0 + F / 2 + dx + 9.2, -16.4); g.lineTo(x0 + F / 2 + dx + 0.6, -0.6); g.stroke();
        }
        g.fillStyle = TRIM; g.fillRect(top[0] - 4, -W - 12, 8, 8.6);
        g.fillStyle = '#2a1a18'; g.fillRect(top[0] - 3.2, -W - 11.2, 6.4, 7.8);
        wreath(g, top[0], -W - 7, 2.6);
        meta.windows.push({ q: [out(top[0] - 3.2, -W - 11.2), out(top[0] + 3.2, -W - 11.2), out(top[0] + 3.2, -W - 3.4), out(top[0] - 3.2, -W - 3.4)], front: true, dim: true });
        // Its sign, and cut trees leaning by the door.
        g.fillStyle = '#f3ead6'; g.fillRect(x0 + 2, -W + 1.4, 12, 5);
        g.fillStyle = '#27452f'; g.textAlign = 'center';
        g.font = "bold 3.6px Georgia, 'Times New Roman', serif";
        g.fillText('TREES', x0 + 8, -W + 5.2, 10.6);
        meta.eaves.push([out(x0 - 1.6, -W + 2.6), out(g1[0], g1[1] + 1.6)], [out(g1[0], g1[1] + 1.6), out(top[0], top[1] + 1)], [out(top[0], top[1] + 1), out(g2[0], g2[1] + 1.6)], [out(g2[0], g2[1] + 1.6), out(xf + 1.6, -W + 2.6)]);
        meta.doors.push({ p: out(x0 + F / 2, 0) });
        meta.spots.push({ p: out(x0 + 4, -0.6), kind: 'step' });
        drift(g, x0 - 2, xr + 2, 0.6, random);
        g.restore();
        // The trees for sale lean against the wall (drawn upright, tilted).
        for (let i = 0; i < 3; i++) {
            const [tx, ty] = out(xf - 5 - i * 5.5, 0.4), h = (15 + random() * 5) * b.k;
            g.save(); g.translate(tx, ty); g.rotate(0.2 + i * 0.03);
            VillageArt.fir(g, 0, 0, h, random, { snow: 0.25, wide: 0.42 });
            g.restore();
        }
        return meta;
    }

    // ---- The bandstand ----------------------------------------------------------

    function gazebo(g, b) {
        const out = enter(g, b), meta = { windows: [], eaves: [], chimneys: [], doors: [], spots: [] };
        blob(g, 4, 1.5, 26, 4, 'rgba(110,136,184,0.4)');
        g.fillStyle = '#b9bfca'; g.fillRect(-20, -4.5, 40, 4.5);
        g.fillStyle = '#8e95a3'; g.fillRect(-20, -1.6, 40, 1.6);
        blob(g, 0, -4.7, 20.5, 1.1, SNOW);
        // Posts, the rail between them, and swags of green with red bows.
        g.fillStyle = TRIM;
        const posts = [-18.5, -10, 0, 10, 18.5];
        for (const x of posts) g.fillRect(x - 0.75, -27, 1.5, 22.5);
        g.strokeStyle = TRIM; g.lineWidth = 0.6;
        g.beginPath(); g.moveTo(-18.5, -10.5); g.lineTo(-4, -10.5); g.moveTo(4, -10.5); g.lineTo(18.5, -10.5); g.stroke();
        g.beginPath(); for (let x = -17; x < 18; x += 2) { if (Math.abs(x) < 4) continue; g.moveTo(x, -10.5); g.lineTo(x, -5); } g.stroke();
        for (let i = 0; i < posts.length - 1; i++) {
            const a = posts[i], c = posts[i + 1];
            g.strokeStyle = '#1d5a37'; g.lineWidth = 1.3;
            g.beginPath(); g.moveTo(a, -26); g.quadraticCurveTo((a + c) / 2, -21, c, -26); g.stroke();
            g.fillStyle = '#c62f27'; g.fillRect(a - 1, -26.6, 2, 1.6);
        }
        g.fillStyle = '#c62f27'; g.fillRect(17.5, -26.6, 2, 1.6);
        // The roof: a bell of snow, and a little cupola.
        const roof = g.createLinearGradient(-22, 0, 22, 0);
        roof.addColorStop(0, '#ffffff'); roof.addColorStop(1, '#cfdaea');
        g.fillStyle = roof;
        g.beginPath(); g.moveTo(-22.5, -26.6); g.quadraticCurveTo(-9, -31, -3, -41); g.lineTo(3, -41); g.quadraticCurveTo(9, -31, 22.5, -26.6); g.closePath(); g.fill();
        g.fillStyle = TRIM; g.fillRect(-2.2, -45, 4.4, 4.4);
        poly(g, [[-3.4, -45], [3.4, -45], [0, -50]], SNOW);
        g.strokeStyle = SNOW; g.lineWidth = 2.2; g.lineCap = 'round';
        g.beginPath(); g.moveTo(-22.5, -26.8); g.lineTo(22.5, -26.8); g.stroke();
        g.lineCap = 'butt';
        meta.eaves.push([out(-22, -25.2), out(22, -25.2)]);
        meta.spots.push({ p: out(-13, -4.9), kind: 'porch' });
        meta.floor = out(0, -4.6);
        g.restore();
        return meta;
    }

    // ---- The covered bridge -------------------------------------------------------

    function bridge(g, b) {
        const out = enter(g, b), meta = { windows: [], eaves: [], chimneys: [], doors: [], spots: [] };
        // Stone abutments, and the frozen brook under it.
        g.fillStyle = '#8a8f9c'; g.fillRect(-36, -6, 9, 8); g.fillRect(27, -6, 9, 8);
        blob(g, 0, 1, 30, 3.2, '#a9c4da');
        const red = '#8d2e27';
        g.fillStyle = shade(red, 0.14);
        g.fillRect(-34, -23, 68, 17);
        g.strokeStyle = 'rgba(20,10,10,0.22)'; g.lineWidth = 0.3;
        g.beginPath(); for (let x = -32; x < 34; x += 2.4) { g.moveTo(x, -23); g.lineTo(x, -6); } g.stroke();
        // The long window under the eaves, and its lattice.
        g.fillStyle = '#2a1a18'; g.fillRect(-27, -19.5, 54, 5);
        g.strokeStyle = shade(red, 0.05); g.lineWidth = 0.5;
        g.beginPath(); for (let x = -27; x < 27; x += 5) { g.moveTo(x, -19.5); g.lineTo(x + 5, -14.5); g.moveTo(x + 5, -19.5); g.lineTo(x, -14.5); } g.stroke();
        meta.windows.push({ q: [out(-27, -19.5), out(27, -19.5), out(27, -14.5), out(-27, -14.5)], dim: true, front: true });
        poly(g, [[-37, -22.4], [37, -22.4], [33, -30], [-33, -30]], '#e3ebf6');
        g.strokeStyle = SNOW; g.lineWidth = 2.6; g.lineCap = 'round';
        g.beginPath(); g.moveTo(-37, -22.6); g.lineTo(37, -22.6); g.stroke();
        g.lineCap = 'butt';
        wreath(g, 0, -10.5, 2.4);
        meta.eaves.push([out(-36, -21), out(36, -21)]);
        meta.spots.push({ p: out(-31.5, -6.6), kind: 'wall' });
        g.restore();
        return meta;
    }

    // ---- The skating hut ----------------------------------------------------------

    function hut(g, b, random) {
        const out = enter(g, b), meta = { windows: [], eaves: [], chimneys: [], doors: [], spots: [] };
        const wood = '#7a5a41';
        blob(g, 6, 1.5, 28, 3.6, 'rgba(110,136,184,0.42)');
        poly(g, [[22, 0], [34, -2.2], [34, -24], [22, -22]], shade(wood, 0.3));
        g.fillStyle = wood; g.fillRect(-22, -22, 44, 22);
        g.strokeStyle = 'rgba(30,18,10,0.25)'; g.lineWidth = 0.35;
        g.beginPath(); for (let y = -19.6; y < 0; y += 2.4) { g.moveTo(-22, y); g.lineTo(22, y); } g.stroke();
        // The hatch, warm inside, with its counter; the awning propped over it.
        g.fillStyle = '#2a1a18'; g.fillRect(-13, -16.4, 22, 9.2);
        meta.windows.push({ q: [out(-13, -16.4), out(9, -16.4), out(9, -7.2), out(-13, -7.2)], front: true, hatch: true });
        g.fillStyle = '#9a7654'; g.fillRect(-14.4, -7.4, 24.8, 1.5);
        blob(g, 7, -7.8, 2.6, 0.5, SNOW);
        for (let i = 0, n = 8; i < n; i++) poly(g, [[lerp(-14, 10, i / n), -18.6], [lerp(-14, 10, (i + 1) / n), -18.6], [lerp(-15.4, 11.4, (i + 1) / n), -15.4], [lerp(-15.4, 11.4, i / n), -15.4]], i % 2 ? '#f3f0e8' : '#b63a30');
        g.fillStyle = '#f3ead6'; g.fillRect(-12, -5.6, 14, 4.2);
        g.fillStyle = '#7a1f1f'; g.textAlign = 'center';
        g.font = "bold 3px Georgia, 'Times New Roman', serif";
        g.fillText('HOT COCOA', -5, -2.5, 13);
        // The door, and skates hung by their laces.
        g.fillStyle = '#5c4230'; g.fillRect(13, -14, 6.4, 14);
        g.fillStyle = '#d8b24a'; g.fillRect(14, -7.4, 0.6, 0.6);
        for (const x of [24.5, 27.5, 30.5]) {
            const y = -15 - (x - 22) * 0.18;
            g.strokeStyle = '#e8e2d2'; g.lineWidth = 0.3;
            g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 3); g.stroke();
            g.fillStyle = '#f1ede4'; g.fillRect(x - 0.9, y + 3, 1.8, 2.6);
            g.fillStyle = '#aab4c4'; g.fillRect(x - 1.2, y + 5.6, 2.6, 0.4);
        }
        poly(g, [[-25, -21], [22.5, -21], [34.6, -23.2], [28, -31], [-19, -29.6]], '#e3ebf6');
        g.strokeStyle = SNOW; g.lineWidth = 2.8; g.lineCap = 'round';
        g.beginPath(); g.moveTo(-25, -21.4); g.lineTo(22.6, -21.4); g.lineTo(34.8, -23.6); g.stroke();
        g.lineCap = 'butt';
        icicles(g, -24, 22, -20.2, random);
        g.fillStyle = '#3a3f4a'; g.fillRect(16, -37, 2.6, 9);
        blob(g, 17.3, -37.4, 2, 0.7, SNOW);
        meta.chimneys.push({ p: out(17.3, -38.4) });
        meta.eaves.push([out(-24.6, -19.4), out(22.6, -19.4)], [out(22.6, -19.4), out(34.4, -21.6)]);
        meta.spots.push({ p: out(4.5, -7.7), kind: 'counter' });
        meta.doors.push({ p: out(-2, 2) });
        drift(g, -24, 35, 0.6, random);
        g.restore();
        return meta;
    }

    // ---- The cabin up the mountain ------------------------------------------------

    function cabin(g, b, random) {
        const F = 40, D = 22, W = 16, R = 15, x0 = -31, xf = x0 + F, xr = xf + D, lift = D * 0.17, rise = lift / D;
        const out = enter(g, b), meta = { windows: [], eaves: [], chimneys: [], doors: [], spots: [] };
        const log = '#6d4b34';
        // Its clearing, and the path trodden to the door.
        blob(g, 4, 3, 62, 8, '#f8fafd');
        blob(g, xr - 4, 2, 24, 4, 'rgba(110,136,184,0.42)');
        const xa = xf + D / 2, ya = -lift / 2 - W - R;
        poly(g, [[xf, 0], [xr, -lift], [xr, -lift - W], [xa, ya], [xf, -W]], shade(log, 0.3));
        side(g, xf, rise);
        g.strokeStyle = 'rgba(20,12,6,0.4)'; g.lineWidth = 0.5;
        g.beginPath(); for (let y = -2.6; y > -W - R; y -= 2.6) { g.moveTo(0, y); g.lineTo(D, y); } g.stroke();
        g.restore();
        // The stone chimney climbs the gable end.
        const cx = xa, cy = ya;
        g.fillStyle = '#8d8a88';
        poly(g, [[cx - 3.6, -lift / 2], [cx + 3.6, -lift / 2 - 0.9], [cx + 3, cy - 9], [cx - 3, cy - 8.4]], '#8d8a88');
        poly(g, [[cx + 0.6, -lift / 2 - 0.4], [cx + 3.6, -lift / 2 - 0.9], [cx + 3, cy - 9], [cx + 0.6, cy - 8.8]], '#6d6b6e');
        blob(g, cx, cy - 9.2, 4, 1.2, SNOW);
        meta.chimneys.push({ p: out(cx, cy - 10.6) });
        g.fillStyle = log; g.fillRect(x0, -W, F, W);
        g.strokeStyle = 'rgba(20,12,6,0.42)'; g.lineWidth = 0.5;
        g.beginPath(); for (let y = -2.6; y > -W; y -= 2.6) { g.moveTo(x0, y); g.lineTo(xf, y); } g.stroke();
        g.fillStyle = shade(log, 0.2);
        for (let y = -1.3; y > -W; y -= 2.6) { g.beginPath(); g.arc(x0 - 0.4, y, 1.2, 0, TAU); g.fill(); g.beginPath(); g.arc(xf + 0.4, y, 1.2, 0, TAU); g.fill(); }
        for (const cxw of [x0 + 8, xf - 8]) {
            const q = sash(g, cxw, -8.6, 6, 6.4, { trim: '#3d2c20', rows: 2 });
            meta.windows.push({ q: [out(q[0], q[1]), out(q[0] + q[2], q[1]), out(q[0] + q[2], q[1] + q[3]), out(q[0], q[1] + q[3])], front: true, cabin: true });
        }
        g.fillStyle = '#4c3424'; g.fillRect(x0 + F / 2 - 3, -11.6, 6, 11.6);
        wreath(g, x0 + F / 2, -8, 1.6);
        const roof = g.createLinearGradient(0, ya, 0, -W);
        roof.addColorStop(0, '#ffffff'); roof.addColorStop(1, '#dbe5f3');
        poly(g, [[x0 - 3.4, -W + 1.6], [xf + 1.4, -W + 1.6], [xa + 0.8, ya - 0.6], [xa - F - 2.4, ya - 0.6]], roof);
        g.strokeStyle = SNOW; g.lineWidth = 3.6; g.lineCap = 'round'; g.lineJoin = 'round';
        g.beginPath(); g.moveTo(x0 - 3.4, -W + 1.2); g.lineTo(xf + 1, -W + 1.2); g.stroke();
        g.lineWidth = 3;
        g.beginPath(); g.moveTo(xf + 0.6, -W + 1); g.lineTo(xa, ya); g.lineTo(xr + 1.4, -lift - W + 1.2); g.stroke();
        g.lineCap = 'butt';
        icicles(g, x0 - 2, xf, -W + 2.8, random);
        // The woodpile under the eave.
        for (let i = 0; i < 9; i++) blob(g, x0 - 9 + (i % 5) * 2.3 + (i > 4 ? 1.1 : 0), -1.4 - (i > 4 ? 2.2 : 0), 1.15, 1.15, i % 2 ? '#8a6444' : '#a67c56');
        blob(g, x0 - 4.6, -4.9, 5.4, 1.1, SNOW);
        meta.eaves.push([out(x0 - 3, -W + 3.2), out(xf + 0.8, -W + 3.2)]);
        // Where the snow lets go: the front slope, from the ridge to the eave.
        meta.slide = { a: out(xa - F * 0.5 - 2, ya), b: out(x0 + F * 0.5 - 2.4, -W + 1.4), w: F * b.k * 0.34, drop: out(x0 + F * 0.5 - 2.4, 0) };
        meta.tree = out(xr + 9, 1);
        meta.doors.push({ p: out(x0 + F / 2, 0) });
        drift(g, x0 - 3, xr + 2, 0.6, random);
        g.restore();
        return meta;
    }

    // The bonfire's hearth: a ring of stones and the logs in it. The manager draws the fire.
    function hearth(g, x, y, k) {
        blob(g, x, y, 15 * k, 4.2 * k, '#cbd6e6');
        blob(g, x, y, 11 * k, 3 * k, '#5a5560');
        for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; blob(g, x + Math.cos(a) * 10.5 * k, y + Math.sin(a) * 2.9 * k, 2.3 * k, 1.5 * k, i % 2 ? '#8a8f9c' : '#737885'); }
        g.strokeStyle = '#3d2c20'; g.lineWidth = 2.4 * k; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x - 6 * k, y); g.lineTo(x + 2 * k, y - 6 * k); g.moveTo(x + 6 * k, y); g.lineTo(x - 2 * k, y - 6 * k); g.moveTo(x - 1 * k, y + 1 * k); g.lineTo(x + 1 * k, y - 7 * k); g.stroke();
        g.lineCap = 'butt';
    }

    return { house, church, barn, gazebo, bridge, hut, cabin, hearth, wreath, WALLS };
})();
