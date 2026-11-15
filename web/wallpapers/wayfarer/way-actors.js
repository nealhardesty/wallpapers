// Wayfarer's living things (SPEC §10.38): the traveller, the folk of the
// towns, animals, birds, carts, boats and the far-off wonders. Each is a
// handful of small models hung on a skeleton of matrices and posed by a few
// sines; every frame they are stamped, already placed from the camera, into
// one soup the renderer draws in a single call.

// A stack of 3×4 matrices, changed in place: no garbage while it animates.
class WayStack {
    constructor() { this.items = Array.from({ length: 12 }, () => new Float64Array(12)); this.depth = 0; this.top = this.items[0]; this.reset(0, 0, 0, 0, 1); }
    reset(x, y, z, yaw, s = 1) {
        const c = Math.cos(yaw) * s, n = Math.sin(yaw) * s;
        this.depth = 0;
        this.top = this.items[0];
        this.top.set([c, 0, n, x, 0, s, 0, y, -n, 0, c, z]);
        return this;
    }
    push() { const next = this.items[++this.depth]; next.set(this.top); this.top = next; return this; }
    pop() { this.top = this.items[--this.depth]; return this; }
    move(x, y, z) { const m = this.top; m[3] += m[0] * x + m[1] * y + m[2] * z; m[7] += m[4] * x + m[5] * y + m[6] * z; m[11] += m[8] * x + m[9] * y + m[10] * z; return this; }
    // Turn about one of its own axes: a and b are the two columns that mix.
    spin(a, b, angle) {
        const m = this.top, c = Math.cos(angle), s = Math.sin(angle);
        for (let r = 0; r < 12; r += 4) { const p = m[r + a], q = m[r + b]; m[r + a] = p * c + q * s; m[r + b] = q * c - p * s; }
        return this;
    }
    rx(angle) { return this.spin(1, 2, angle); }
    ry(angle) { return this.spin(2, 0, angle); }
    rz(angle) { return this.spin(0, 1, angle); }
    size(x, y = x, z = x) { const m = this.top; for (let r = 0; r < 12; r += 4) { m[r] *= x; m[r + 1] *= y; m[r + 2] *= z; } return this; }
}

const WayActors = (() => {
    const L = WayLogic, M = WayModels, C = M.C, TAU = Math.PI * 2;
    const part = (key, make) => M.model('actor:' + key, make);
    const limb = (key, len, r0, r1, slot, col = C.white) => part(key, s => s.paint(col, slot).fx(0).prism(5, 0, -len, 0, r1, 0, r0, { foot: 0.85 }));

    // ---- People ------------------------------------------------------------------------------
    // Slots: 1 tunic, 2 legs, 3 cloak or apron, 4 skin, 6 hair, 7 hat.
    const P = {
        thigh: () => part('thigh', s => s.paint(C.white, 2).fx(0).prism(6, 0, -0.44, 0, 0.082, -0.16, 0.118, { foot: 0.8, squash: 1.1 }).prism(6, 0, -0.16, 0, 0.118, 0.02, 0.104, { foot: 1, squash: 1.1 })),
        shin: () => part('shin', s => {
            // A calf that swells and narrows to the ankle; a boot with a cuff, a heel and a toe.
            s.paint(C.white, 2).fx(0).prism(6, 0, -0.2, 0, 0.066, -0.06, 0.092, { squash: 1.15 }).prism(6, 0, -0.06, 0, 0.092, 0.02, 0.084, { foot: 1, squash: 1.1 });
            s.paint([96, 68, 48], 0).prism(6, 0, -0.42, 0, 0.082, -0.18, 0.09, { foot: 0.7 }).prism(6, 0, -0.18, 0, 0.1, -0.13, 0.1, { cap: true, foot: 1 });
            s.paint([78, 56, 42], 0).box(0, -0.435, 0.07, 0.085, 0.04, 0.17, 0.8).paint([96, 68, 48], 0).blob(0, -0.39, 0.13, 0.082, 0.062, 0.12, { segs: 6, bands: 3, lump: 0, under: 0.7 });
        }),
        upper: () => part('upper', s => s.paint(C.white, 1).fx(0).blob(0, -0.02, 0, 0.1, 0.09, 0.1, { segs: 6, bands: 3, lump: 0, under: 0.75 }).prism(6, 0, -0.31, 0, 0.066, -0.02, 0.088, { foot: 0.85 })),
        fore: () => part('fore', s => {
            s.paint(C.white, 1).fx(0).prism(6, 0, -0.25, 0, 0.056, 0, 0.074, { foot: 0.9 });
            s.paint([96, 68, 48], 0).prism(6, 0, -0.27, 0, 0.066, -0.21, 0.066);                         // a cuff
            s.paint(C.white, 4).blob(0, -0.33, 0.005, 0.06, 0.075, 0.07, { segs: 6, bands: 3, lump: 0, under: 0.8 }).blob(0.045, -0.31, 0.04, 0.026, 0.04, 0.03, { segs: 4, bands: 2, lump: 0 });
        }),
        torso: () => part('torso', s => {
            // Hips, a waist with a belt and buckle, a chest that broadens to the shoulders.
            s.paint(C.white, 1).fx(0).prism(8, 0, 0, 0, 0.2, 0.2, 0.18, { squash: 0.66, foot: 0.75 }).prism(8, 0, 0.2, 0, 0.18, 0.5, 0.275, { squash: 0.6 }).prism(8, 0, 0.5, 0, 0.275, 0.6, 0.12, { squash: 0.62, cap: true });
            s.paint([96, 70, 50], 0).prism(8, 0, 0.12, 0, 0.205, 0.2, 0.2, { squash: 0.68 }).paint(C.gold, 0).box(0, 0.16, 0.14, 0.035, 0.035, 0.012, 1);
            s.paint(C.white, 4).prism(6, 0, 0.56, 0, 0.066, 0.66, 0.06);
        }),
        skirt: () => part('skirt', s => s.paint(C.white, 1).fx(0, 0, 10).prism(7, 0, -0.74, 0, 0.36, 0.04, 0.2, { squash: 0.8, foot: 0.75 })),
        head: () => part('head', s => {
            s.paint(C.white, 4).fx(0).blob(0, 0.16, 0, 0.15, 0.17, 0.155, { segs: 7, bands: 4, lump: 0, under: 0.8 });
            s.paint(C.white, 6).blob(0, 0.2, -0.035, 0.158, 0.16, 0.15, { segs: 7, bands: 3, lump: 0.05, under: 0.8 });
            for (const x of [-0.055, 0.055]) s.paint([56, 40, 34], 0).box(x, 0.172, 0.146, 0.012, 0.017, 0.006, 1);
            s.paint(C.white, 4).box(0, 0.13, 0.155, 0.02, 0.025, 0.018, 1);
        }),
        hood: () => part('hood', s => {
            // Deep enough to shadow the face, with a peak, and gathered on the shoulders.
            s.paint(C.white, 3).fx(0).blob(0, 0.2, -0.045, 0.2, 0.21, 0.205, { segs: 8, bands: 4, lump: 0.03, under: 0.65 });
            s.prism(6, 0, 0.3, -0.12, 0.1, 0.44, 0, { dz: -0.12, foot: 0.9 }).prism(8, 0, -0.07, -0.02, 0.27, 0.1, 0.17, { squash: 0.78, foot: 0.75 });
            for (const x of [-1, 1]) s.quad([x * 0.2, 0.02, 0.06], [x * 0.105, 0.03, 0.2], [x * 0.11, 0.36, 0.17], [x * 0.19, 0.34, 0.05], [x * 0.8, 0, 0.6], [0.7, 0.7, 1, 1]);
            s.quad([-0.11, 0.36, 0.17], [0.11, 0.36, 0.17], [0.1, 0.4, 0.02], [-0.1, 0.4, 0.02], [0, 0.6, 0.8]);
            s.paint([58, 44, 44], 0).quad([-0.105, 0.03, 0.135], [0.105, 0.03, 0.135], [0.11, 0.345, 0.135], [-0.11, 0.345, 0.135], [0, 0, 1], [0.5, 0.5, 0.35, 0.35]);      // the shadow inside
        }),
        wizard: () => part('wizard', s => s.paint(C.white, 7).fx(0).prism(8, 0, 0.26, 0, 0.36, 0.3, 0.17, { cap: true }).prism(7, 0, 0.29, 0, 0.17, 0.82, 0, { dz: -0.16, foot: 0.85 })),
        cap: () => part('cap', s => { s.paint(C.white, 7).fx(0).blob(0.02, 0.33, 0, 0.19, 0.07, 0.19, { segs: 6, bands: 2, lump: 0.1 }); s.paint([240, 236, 220], 0).fx(0, 0, 30).tri([0.1, 0.34, 0], [0.16, 0.36, -0.04], [0.2, 0.62, -0.16], [0.72, 0.31, 0.62]); }),
        helm: () => part('helm', s => s.paint([170, 174, 182], 0).fx(0).blob(0, 0.21, -0.005, 0.17, 0.17, 0.172, { segs: 7, bands: 3, lump: 0, under: 0.6 }).box(0, 0.15, 0.165, 0.015, 0.06, 0.01, 1)),
        straw: () => part('straw', s => s.paint(C.straw, 0).fx(0).prism(9, 0, 0.27, 0, 0.34, 0.3, 0.3, { cap: true }).prism(7, 0, 0.29, 0, 0.16, 0.4, 0.13, { cap: true })),
        kerchief: () => part('kerchief', s => s.paint(C.white, 3).fx(0).blob(0, 0.2, -0.03, 0.165, 0.165, 0.165, { segs: 7, bands: 3, lump: 0.03, under: 0.8 })),
        cloak: () => part('cloak', s => {
            // From the shoulders to the calves in five lengths and six gores, bowing out behind; the hem moves most.
            s.paint(C.white, 3);
            const COLS = 6, ROWS = 5, at = (i, j) => {
                const u = i / COLS * 2 - 1, v = j / ROWS, w = 0.27 + 0.2 * v, wrap = 1 - u * u;
                return [u * w * (1 + 0.1 * Math.cos(i * 2.4 + 1) * v), 0.56 - 1.14 * v, -0.14 - (0.16 * Math.sin(v * 2.2) + 0.03 * Math.cos(i * 3.1) * v) * (0.35 + 0.65 * wrap) + 0.16 * (1 - wrap)];
            };
            for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
                const u = (i + 0.5) / COLS * 2 - 1, l = Math.hypot(u * 0.7, 0.12, 1), shade = [1 - 0.05 * j, 0.95 - 0.07 * j, 0.95 - 0.07 * j, 1 - 0.05 * j];
                s.fx(0, 0, Math.round(j * j * 5.5)).quad(at(i, j), at(i, j + 1), at(i + 1, j + 1), at(i + 1, j), [u * 0.7 / l, 0.12 / l, -1 / l], shade);
            }
            s.fx(0).prism(8, 0, 0.47, 0, 0.3, 0.6, 0.16, { squash: 0.7 });
            s.paint(C.gold, 0).box(0, 0.5, 0.2, 0.03, 0.03, 0.012, 1);
        }),
        apron: () => part('apron', s => s.paint([244, 238, 226], 0).fx(0).quad([-0.17, -0.5, 0.2], [0.17, -0.5, 0.2], [0.14, 0.34, 0.165], [-0.14, 0.34, 0.165], [0, 0, 1])),
        pack: () => part('pack', s => { s.paint([134, 98, 66], 0).fx(0).box(0, 0.3, -0.25, 0.17, 0.2, 0.11, 0.8); s.paint([196, 170, 120], 0).at(M.mul(M.move(0, 0.56, -0.25), M.rotZ(Math.PI / 2))).prism(6, 0, -0.24, 0, 0.085, 0.24, 0.085, { cap: true, foot: 1 }); s.at(null).paint([90, 66, 48], 0).box(0, 0.3, -0.37, 0.1, 0.1, 0.02, 1); }),
        lute: () => part('lute', s => { s.paint([176, 120, 66], 0).fx(0).blob(0.06, 0.2, -0.24, 0.16, 0.2, 0.07, { segs: 6, bands: 3, lump: 0 }); s.paint([96, 66, 44], 0).at(M.mul(M.move(0.06, 0.36, -0.24), M.rotZ(-0.5))).box(0, 0.26, 0, 0.022, 0.26, 0.02, 1); s.at(null); }),
        shield: () => part('shield', s => { s.paint(C.white, 3).fx(0).at(M.mul(M.move(0, 0.3, -0.25), M.rotX(Math.PI / 2))).prism(8, 0, 0, 0, 0.27, 0.05, 0.27, { cap: true, foot: 1 }); s.at(null); }),
        staff: () => part('staff', s => s.paint([120, 88, 60], 0).fx(0).prism(4, 0, -1.05, 0, 0.022, 0.86, 0.028)),
        crook: () => part('crook', s => { s.paint([120, 88, 60], 0).fx(0).prism(4, 0, 0.84, 0, 0.03, 0.98, 0.02, { dz: 0.12 }).prism(4, 0, 0.96, 0.12, 0.02, 0.9, 0.012, { dz: 0.08 }); }),
        crystal: () => part('crystal', s => s.paint([120, 230, 255], 0).fx(0, 255).prism(5, 0, 0.86, 0, 0.012, 0.98, 0.075, { flat: true }).prism(5, 0, 0.98, 0, 0.075, 1.14, 0, { flat: true })),
        lantern: () => part('lantern', s => { s.paint(C.iron, 0).fx(0).box(0, 0.84, 0.09, 0.012, 0.012, 0.1, 1).box(0, 0.76, 0.18, 0.006, 0.07, 0.006, 1); s.paint(C.flame, 0).fx(0, 255).box(0, 0.62, 0.18, 0.05, 0.07, 0.05, 1); s.paint(C.iron, 0).fx(0).prism(4, 0, 0.69, 0.18, 0.08, 0.74, 0.01); }),
        spear: () => part('spear', s => s.paint([120, 88, 60], 0).fx(0).prism(4, 0, -1.05, 0, 0.02, 1.2, 0.02).paint([190, 194, 204], 0).prism(4, 0, 1.2, 0, 0.05, 1.5, 0, { flat: true, squash: 0.3 })),
        hoe: () => part('hoe', s => s.paint([120, 88, 60], 0).fx(0).prism(4, 0, -0.5, 0, 0.02, 0.9, 0.02).paint(C.iron, 0).box(0, 0.9, 0.08, 0.06, 0.015, 0.09, 1)),
        rod: () => part('rod', s => { s.paint([120, 88, 60], 0).fx(0).prism(3, 0, -0.2, 0, 0.014, 2.4, 0.006); s.paint([230, 230, 230], 0).prism(3, 0, 2.4, 0, 0.004, 2.41, 0.004, { dz: 0.0 }); }),
    };
    const SKIN = [[236, 190, 156], [214, 160, 124], [176, 122, 90], [130, 88, 64], [246, 208, 180]];
    const HAIR = [[70, 50, 38], [36, 30, 30], [170, 120, 60], [210, 190, 150], [150, 70, 40], [200, 200, 204]];
    const CLOTH = [[150, 60, 54], [60, 96, 150], [200, 160, 70], [84, 130, 84], [130, 84, 140], [176, 120, 80], [90, 120, 130], [200, 196, 180]];
    // The traveller's looks: tunic, legs, cloak, hat, what is on their back and in their hand.
    const LOOKS = {
        ranger: { tunic: [112, 96, 70], legs: [84, 70, 56], cloak: [58, 104, 72], hat: 'hood', hatCol: null, back: 'pack', hand: 'crook', skin: 0, hair: 0 },
        wizard: { tunic: [70, 84, 150], legs: [56, 60, 110], cloak: [56, 66, 132], hat: 'wizard', hatCol: [64, 72, 150], back: 'pack', hand: 'crystal', skin: 4, hair: 5, robe: true },
        bard: { tunic: [196, 150, 70], legs: [100, 60, 60], cloak: [170, 56, 60], hat: 'cap', hatCol: [150, 50, 56], back: 'lute', hand: 'crook', skin: 1, hair: 2 },
        knight: { tunic: [150, 154, 164], legs: [110, 114, 124], cloak: [60, 80, 150], hat: 'helm', hatCol: null, back: 'shield', hand: 'spear', skin: 2, hair: 1 },
    };
    const tints = new Array(8).fill(null);

    // Draw a person. at: { x, y, z } of their feet from the camera; pose: {
    // yaw, stride (0 to 1 a pair of steps), moving, sit, head (yaw), act, t, size }.
    function person(out, st, x, y, z, look, pose) {
        const size = pose.size || 1, tau = pose.stride * TAU, mv = pose.moving ?? 1, sit = pose.sit || 0, t = pose.t || 0;
        tints[1] = look.tunic; tints[2] = look.legs; tints[3] = look.cloak; tints[4] = SKIN[look.skin]; tints[6] = HAIR[look.hair]; tints[7] = look.hatCol || look.cloak;
        const lit = pose.lit ? 1 : 0, put = model => out.stamp(model, st.top, tints, 0, 0, lit);
        const bob = 0.028 * Math.cos(tau * 2) * mv, hip = 0.88 - 0.44 * sit + bob;
        st.reset(x, y, z, pose.yaw, size).move(0, hip, 0).rx(0.05 * mv + 0.12 * sit);
        // Legs.
        for (const side of [-1, 1]) {
            const ph = tau + (side > 0 ? Math.PI : 0), swing = 0.55 * Math.sin(ph) * mv, knee = 0.85 * Math.max(0, Math.cos(ph)) * mv;
            st.push().move(side * 0.105, 0, 0).rx(-swing * (1 - sit) - 1.45 * sit - 0.05 * mv);
            if (!look.robe && !look.skirt) put(P.thigh());
            else if (sit > 0.3) put(P.thigh());
            st.move(0, -0.42, 0).rx(knee * (1 - sit) + 1.4 * sit);
            put(P.shin());
            st.pop();
        }
        if ((look.robe || look.skirt) && sit < 0.5) put(P.skirt());
        // Body, turned a touch with the stride.
        st.ry(0.08 * Math.sin(tau) * mv);
        put(P.torso());
        if (look.apron) put(P.apron());
        if (look.cloak && look.cape !== false) { st.push().rx(0.06 + 0.14 * mv + 0.05 * Math.sin(tau * 2) * mv - 0.06 * sit).rz(0.035 * Math.sin(tau) * mv); put(P.cloak()); st.pop(); }
        if (look.back) { st.push(); put(P[look.back]()); st.pop(); }
        // Arms: the left swings (or does what the role wants); the right holds whatever is carried.
        const act = pose.act || '';
        for (const side of [-1, 1]) {
            const ph = tau + (side > 0 ? 0 : Math.PI), holds = side > 0 && look.hand;
            let shoulder = 0.42 * Math.sin(ph) * mv, elbow = -0.25 - 0.2 * mv, out2 = 0.12;
            if (holds) { shoulder = -0.55 + 0.22 * Math.sin(tau + 0.6) * mv; elbow = -0.75; }
            if (sit > 0) { shoulder = L.mix(shoulder, -0.55, sit); elbow = L.mix(elbow, -0.9, sit); }
            if (act === 'wave' && side < 0) { shoulder = -2.6 + 0.25 * Math.sin(t * 9); elbow = -0.5; out2 = 0.5; }
            if (act === 'chat') { shoulder = -0.5 + 0.35 * Math.sin(t * 2.1 + side); elbow = -1.1 + 0.3 * Math.sin(t * 3.3 + side * 2); }
            if (act === 'hoe') { shoulder = -0.9 + 0.5 * Math.sin(t * 2.4); elbow = -0.7; }
            if (act === 'fish') { shoulder = -0.75; elbow = -0.5; }
            if (act === 'warm') { shoulder = -1.05 + 0.04 * Math.sin(t * 1.7 + side); elbow = -0.35; }
            st.push().move(side * 0.3, 0.5, 0).rz(side * out2).rx(shoulder);
            put(P.upper());
            st.move(0, -0.3, 0).rx(elbow);
            put(P.fore());
            if (holds || (act === 'hoe' && side > 0) || (act === 'fish' && side > 0)) {
                // What the hand holds stays near upright, whatever the arm is doing.
                st.move(0, -0.3, 0).rx(-(shoulder + elbow) + (act === 'hoe' ? 1.0 : act === 'fish' ? 1.05 : 0.1 + 0.1 * Math.sin(tau + 0.6) * mv) - 0.12 * sit);
                st.move(0, 0.42 * sit, 0);
                if (act === 'hoe') put(P.hoe());
                else if (act === 'fish') put(P.rod());
                else if (look.hand === 'spear') put(P.spear());
                else { put(P.staff()); put(look.hand === 'crystal' ? P.crystal() : P.crook()); if (look.hand !== 'crystal' && pose.lantern) put(P.lantern()); }
            }
            st.pop();
        }
        st.move(0, 0.63, 0).ry(pose.head || 0).rx(act === 'fish' || sit > 0.5 ? 0.12 : -0.03);
        put(P.head());
        if (look.hat) put(P[look.hat]());
    }
    // Somebody from the towns, made up from a number between 0 and 1.
    function townsfolk(v, role) {
        const r = k => M.rnd(v, k), woman = r(1) < 0.5, guard = role === 'guard', child = role === 'child';
        return {
            tunic: guard ? [150, 154, 164] : CLOTH[Math.floor(r(2) * 7.99)], legs: guard ? [96, 100, 112] : [[84, 70, 56], [70, 70, 84], [110, 90, 66]][Math.floor(r(3) * 2.99)],
            cloak: guard ? [60, 80, 150] : CLOTH[Math.floor(r(4) * 7.99)], cape: guard || r(5) < 0.2, skin: Math.floor(r(6) * 4.99), hair: Math.floor(r(7) * 5.99),
            hat: guard ? 'helm' : child ? null : role === 'hoe' ? 'straw' : woman ? (r(8) < 0.5 ? 'kerchief' : null) : r(8) < 0.35 ? 'cap' : r(8) < 0.5 ? 'straw' : r(8) < 0.6 ? 'hood' : null,
            hatCol: CLOTH[Math.floor(r(9) * 7.99)], skirt: woman && !guard, apron: !guard && r(10) < 0.3, hand: guard ? 'spear' : null, size: child ? 0.6 : 0.94 + 0.12 * r(11),
        };
    }

    // ---- Four-legged things --------------------------------------------------------------------
    // len, tall (to the back), girth, neck (length, lift), head size; colours; what is on its head and behind it.
    const BEASTS = {
        sheep: { len: 1.0, tall: 0.66, girth: 0.34, neck: [0.24, 0.5], head: 0.14, coat: [240, 236, 224], face: [60, 52, 52], legs: [60, 52, 52], wool: 0.28, tail: 0.1, ears: 0.6 },
        goat: { len: 0.95, tall: 0.7, girth: 0.26, neck: [0.3, 0.8], head: 0.13, coat: [196, 186, 170], face: [196, 186, 170], legs: [120, 110, 100], horns: 0.2, tail: 0.1, ears: 0.6 },
        cow: { len: 1.8, tall: 1.28, girth: 0.46, neck: [0.5, 0.2], head: 0.24, coat: [150, 96, 60], face: [240, 232, 220], legs: [150, 96, 60], horns: 0.16, tail: 0.8, ears: 0.8, patch: [244, 238, 226] },
        deer: { len: 1.3, tall: 1.0, girth: 0.25, neck: [0.55, 1.0], head: 0.14, coat: [186, 134, 84], face: [186, 134, 84], legs: [150, 106, 70], antlers: 0.5, tail: 0.12, ears: 1, rump: [246, 240, 228] },
        horse: { len: 1.8, tall: 1.42, girth: 0.4, neck: [0.7, 0.85], head: 0.22, coat: [134, 90, 60], face: [134, 90, 60], legs: [80, 56, 44], mane: [50, 40, 36], tail: 0.9, ears: 0.5 },
        pony: { len: 1.35, tall: 1.05, girth: 0.36, neck: [0.5, 0.8], head: 0.2, coat: [200, 170, 126], face: [200, 170, 126], legs: [150, 120, 90], mane: [240, 230, 210], tail: 0.7, ears: 0.5, load: true },
        dog: { len: 0.72, tall: 0.5, girth: 0.17, neck: [0.2, 0.7], head: 0.13, coat: [170, 130, 90], face: [170, 130, 90], legs: [170, 130, 90], tail: 0.34, tailUp: 0.9, ears: 0.9, snout: 1 },
        fox: { len: 0.66, tall: 0.36, girth: 0.14, neck: [0.16, 0.7], head: 0.12, coat: [222, 120, 50], face: [222, 120, 50], legs: [60, 44, 40], tail: 0.5, tailUp: 0.15, brush: [250, 244, 232], ears: 1.5, snout: 1, bib: [250, 244, 232] },
        cat: { len: 0.42, tall: 0.25, girth: 0.1, neck: [0.08, 0.8], head: 0.09, coat: [60, 56, 60], face: [60, 56, 60], legs: [60, 56, 60], tail: 0.34, tailUp: 1.3, ears: 1.3 },
        rabbit: { len: 0.3, tall: 0.16, girth: 0.09, neck: [0.05, 0.8], head: 0.075, coat: [176, 150, 120], face: [176, 150, 120], legs: [176, 150, 120], tail: 0.05, brush: [250, 250, 250], ears: 3 },
    };
    function beastParts(kind) {
        const b = BEASTS[kind], k = 'beast:' + kind;
        return {
            body: part(k + ':body', s => {
                s.paint(C.white, 1).fx(0).blob(0, 0, 0, b.girth, b.girth * 0.95, b.len / 2, { segs: 7, bands: 4, lump: b.wool || 0.04, seed: 0.4, under: 0.6 });
                if (b.wool) for (let i = 0; i < 5; i++) s.blob(Math.sin(i * 2.4) * b.girth * 0.5, b.girth * 0.45, -b.len * 0.3 + i * b.len * 0.15, b.girth * 0.55, b.girth * 0.5, b.girth * 0.6, { segs: 5, bands: 3, seed: i });
                if (b.patch) s.paint(b.patch, 0).blob(b.girth * 0.3, b.girth * 0.25, b.len * 0.05, b.girth * 0.78, b.girth * 0.78, b.len * 0.26, { segs: 6, bands: 3, lump: 0.2, seed: 2 });
                if (b.rump) s.paint(b.rump, 0).blob(0, 0.02, -b.len / 2 + 0.03, b.girth * 0.7, b.girth * 0.75, 0.08, { segs: 6, bands: 3, lump: 0 });
                if (b.bib) s.paint(b.bib, 0).blob(0, -b.girth * 0.3, b.len * 0.36, b.girth * 0.7, b.girth * 0.6, b.len * 0.16, { segs: 5, bands: 3, lump: 0 });
                if (b.load) { for (const x of [-1, 1]) s.paint([150, 110, 76], 0).box(x * (b.girth + 0.08), 0.02, 0, 0.11, 0.2, 0.26, 0.8); s.paint([170, 60, 56], 0).box(0, b.girth * 0.92, 0, b.girth * 0.9, 0.03, 0.3, 1); s.paint([200, 176, 130], 0).blob(0, b.girth + 0.12, 0, 0.3, 0.13, 0.2, { segs: 6, lump: 0.05 }); }
            }),
            neck: part(k + ':neck', s => {
                s.paint(C.white, 1).fx(0).prism(5, 0, 0, 0, b.girth * 0.62, b.neck[0], b.head * 0.75, { squash: 0.9 });
                if (b.mane) s.paint(b.mane, 0).box(0, b.neck[0] * 0.5, -b.head * 0.7, 0.03, b.neck[0] * 0.5, 0.07, 1);
            }),
            head: part(k + ':head', s => {
                s.paint(b.face, 0).fx(0).blob(0, 0, b.head * 0.5, b.head * 0.8, b.head * 0.82, b.head * (b.snout ? 1.15 : 1.3), { segs: 6, bands: 3, lump: 0.03, under: 0.75 });
                if (b.snout) { s.blob(0, -b.head * 0.2, b.head * 1.4, b.head * 0.4, b.head * 0.36, b.head * 0.6, { segs: 5, bands: 3, lump: 0 }); s.paint([30, 26, 26], 0).box(0, -b.head * 0.12, b.head * 1.98, b.head * 0.13, b.head * 0.1, b.head * 0.06, 1); }
                for (const x of [-1, 1]) {
                    s.paint(b.face, 0).tri([x * b.head * 0.3, b.head * 0.5, 0], [x * b.head * 0.8, b.head * 0.55, -b.head * 0.1], [x * b.head * (0.62 + 0.05 * b.ears), b.head * (0.7 + 0.42 * b.ears), -b.head * 0.05], [0, 0.29, 0.96]);
                    s.paint([26, 22, 22], 0).box(x * b.head * 0.62, b.head * 0.2, b.head * 0.95, 0.012 + b.head * 0.06, 0.012 + b.head * 0.07, 0.01, 1);
                    if (b.horns) s.paint([220, 210, 190], 0).prism(4, x * b.head * 0.5, b.head * 0.5, 0, 0.03, b.head * 0.5 + b.horns, 0.008, { dx: x * b.horns * 0.5, dz: -b.horns * 0.5 });
                    if (b.antlers) for (let i = 0; i < 3; i++) s.paint([150, 124, 96], 0).prism(3, x * b.head * 0.4, b.head * 0.6 + i * 0.13, -i * 0.04, 0.022, b.head * 0.6 + i * 0.13 + 0.26, 0.006, { dx: x * (0.1 + 0.1 * i), dz: i === 1 ? 0.14 : -0.06 });
                }
            }),
            upper: part(k + ':upper', s => s.paint(C.white, 1).fx(0).prism(4, 0, -b.tall * 0.42, 0, b.girth * 0.2, 0, b.girth * 0.34, { foot: 0.85 })),
            lower: part(k + ':lower', s => s.paint(b.legs, 0).fx(0).prism(4, 0, -b.tall * 0.42, 0, b.girth * 0.17, 0, b.girth * 0.2)),
            tail: part(k + ':tail', s => {
                s.paint(b.mane || C.white, b.mane ? 0 : 1).fx(0).prism(5, 0, 0, 0, b.girth * (b.brush ? 0.34 : 0.14), b.tail * 0.6, b.girth * (b.brush ? 0.5 : 0.12), { cap: true });
                s.paint(b.brush || b.mane || C.white, b.brush || b.mane ? 0 : 1).prism(5, 0, b.tail * 0.6, 0, b.girth * (b.brush ? 0.5 : 0.12), b.tail, 0);
            }),
        };
    }
    // pose: { yaw, gait (0 to 1 a stride), moving, graze (head down), t, size, sit }.
    function beast(out, st, kind, x, y, z, pose, coat) {
        const b = BEASTS[kind], p = beastParts(kind), size = pose.size || 1, tau = pose.gait * TAU, mv = pose.moving || 0, sit = pose.sit || 0;
        tints[1] = coat || b.coat;
        const put = model => out.stamp(model, st.top, tints);
        const hop = kind === 'rabbit' || pose.bound ? Math.abs(Math.sin(tau)) * 0.5 * b.tall * mv : 0;
        st.reset(x, y, z, pose.yaw, size).move(0, b.tall - b.girth * 0.25 + 0.02 * Math.sin(tau * 2) * mv + hop, 0).rx(-0.28 * sit + (pose.bound ? -0.25 * Math.cos(tau) * mv : 0));
        put(p.body);
        for (const [sx, sz, ph] of [[-1, 1, 0], [1, 1, Math.PI], [-1, -1, Math.PI], [1, -1, 0]]) {
            const a = tau + ph + (pose.bound ? (sz > 0 ? 0 : 0.6) - ph : 0), swing = 0.5 * Math.sin(a) * mv, knee = 0.7 * Math.max(0, Math.cos(a)) * mv;
            st.push().move(sx * b.girth * 0.55, -b.girth * 0.35, sz * b.len * 0.36).rx(-swing + (sz < 0 ? 1.15 * sit : -0.25 * sit) + 0.28 * sit);
            put(p.upper);
            st.move(0, -b.tall * 0.4, 0).rx(knee * (sz > 0 ? -1 : 1) + (sz < 0 ? -2.0 * sit : 0));
            put(p.lower);
            st.pop();
        }
        st.push().move(0, b.girth * 0.3, -b.len * 0.47).rx(-Math.PI / 2 + (b.tailUp ?? -0.9) + 0.25 * Math.sin((pose.t || 0) * (kind === 'dog' ? 9 : 2) + size * 7) + 0.3 * sit);
        put(p.tail);
        st.pop();
        const down = pose.graze || 0, lift = b.neck[1] * (1 - down) - 0.75 * down;
        st.move(0, b.girth * 0.3, b.len * 0.4).rx(Math.PI / 2 - lift + 0.28 * sit).ry(0);
        put(p.neck);
        st.move(0, b.neck[0], 0).rx(-(Math.PI / 2 - lift) + 0.55 * down + 0.06 * Math.sin((pose.t || 0) * 5) * down).ry(pose.head || 0);
        put(p.head);
    }

    // ---- Birds, and bigger things with wings -----------------------------------------------------
    const BIRDS = {
        gull: { size: 0.5, body: [244, 244, 240], wing: [200, 204, 214], span: 1.3 }, crow: { size: 0.42, body: [34, 32, 40], wing: [44, 42, 52], span: 1.0 },
        pigeon: { size: 0.3, body: [150, 156, 170], wing: [120, 126, 140], span: 0.7 }, goose: { size: 0.7, body: [150, 140, 130], wing: [120, 112, 104], span: 1.6 },
        duck: { size: 0.36, body: [150, 110, 76], wing: [120, 90, 66], span: 0.6, head: [40, 110, 76] }, hen: { size: 0.3, body: [200, 120, 70], wing: [176, 100, 60], span: 0.4, head: [200, 120, 70], comb: true },
        dragon: { size: 9, body: [150, 50, 44], wing: [196, 110, 60], span: 2.6, dragon: true },
    };
    function birdParts(kind) {
        const b = BIRDS[kind], k = 'bird:' + kind;
        return {
            body: part(k + ':body', s => {
                s.paint(b.body, 0).fx(0).blob(0, 0, 0, 0.3, 0.3, 0.6, { segs: 6, bands: 3, lump: 0.03, under: 0.7 });
                s.paint(b.head || b.body, 0).blob(0, 0.22, 0.52, 0.2, 0.2, 0.22, { segs: 5, bands: 3, lump: 0 });
                s.paint(b.dragon ? b.body : [232, 170, 60], 0).prism(4, 0, 0.2, 0.7, 0.07, 0.2, 0.0, { dz: 0.3 }).tri([0, 0.2, 0.68], [0.06, 0.16, 0.68], [0, 0.18, 1.0]).tri([0, 0.2, 0.68], [-0.06, 0.16, 0.68], [0, 0.18, 1.0]);
                s.paint(b.wing, 0).tri([-0.22, 0.05, -0.5], [0.22, 0.05, -0.5], [0, 0.02, -1.05], [0, 1, 0]);
                if (b.comb) s.paint([200, 50, 50], 0).box(0, 0.44, 0.55, 0.02, 0.06, 0.08, 1);
                if (b.dragon) {
                    s.paint(b.body, 0).prism(5, 0, 0.1, 0.5, 0.2, 0.5, 0.12, { dz: 0.9 }).blob(0, 0.56, 1.5, 0.16, 0.14, 0.3, { segs: 5, lump: 0 });
                    s.prism(5, 0, 0, -0.5, 0.22, -0.05, 0.0, { dz: -1.7 });
                    for (let i = 0; i < 5; i++) s.paint(b.wing, 0).tri([-0.05, 0.28, 0.3 - i * 0.3], [0.05, 0.28, 0.3 - i * 0.3], [0, 0.46, 0.2 - i * 0.3]);
                }
            }),
            wing: part(k + ':wing', s => {
                // The right wing, out along +x from the shoulder; the left is its mirror.
                s.paint(b.wing, 0).fx(0);
                if (b.dragon) { s.tri([0, 0, 0.3], [1.3, 0.1, 0.5], [1.2, 0, -0.5], [0, 1, 0]).tri([0, 0, 0.3], [1.2, 0, -0.5], [0, 0, -0.4], [0, 1, 0]).tri([1.3, 0.1, 0.5], [2.6, 0, 0.1], [2.1, 0, -0.6], [0, 1, 0]).tri([1.3, 0.1, 0.5], [2.1, 0, -0.6], [1.2, 0, -0.5], [0, 1, 0]); }
                else s.tri([0, 0, 0.26], [b.span, 0, 0.1], [b.span * 0.55, 0, -0.34], [0, 1, 0]).tri([0, 0, 0.26], [b.span * 0.55, 0, -0.34], [0, 0, -0.3], [0, 1, 0]);
            }),
        };
    }
    // pose: { yaw, flap (radians, 0 level), fold (0 flying, 1 wings shut), pitch, roll, size }.
    function bird(out, st, kind, x, y, z, pose) {
        const b = BIRDS[kind], p = birdParts(kind), size = b.size * (pose.size || 1), fold = pose.fold || 0;
        st.reset(x, y, z, pose.yaw, size).rx(pose.pitch || 0).rz(pose.roll || 0);
        out.stamp(p.body, st.top, null);
        for (const side of [-1, 1]) {
            st.push().move(side * 0.18, 0.12, 0.1).size(side * (1 - 0.72 * fold), 1, 1).rz((pose.flap || 0) * (1 - fold) + 0.2 * fold).ry(-1.1 * fold);
            out.stamp(p.wing, st.top, null);
            st.pop();
        }
    }

    // ---- Carts, boats, sails, fire, and what crosses the sky -----------------------------------------
    const wagon = () => part('wagon', s => {
        s.paint(C.plank, 0).fx(0).box(0, 0.9, 0, 0.8, 0.08, 1.5, 0.8).box(0.8, 1.2, 0, 0.04, 0.3, 1.5).box(-0.8, 1.2, 0, 0.04, 0.3, 1.5).box(0, 1.2, -1.5, 0.8, 0.3, 0.04).box(0, 1.3, 1.3, 0.8, 0.06, 0.2, 1);
        s.box(-0.55, 0.8, 2.6, 0.04, 0.04, 1.1, 1).box(0.55, 0.8, 2.6, 0.04, 0.04, 1.1, 1);
        // A cover on hoops.
        for (let i = 0; i < 5; i++) { const a0 = i / 5 * Math.PI, a1 = (i + 1) / 5 * Math.PI; s.paint([240, 232, 212], 0).fx(0, 0, 8).quad([-Math.cos(a0) * 0.85, 1.5 + Math.sin(a0) * 0.95, -1.5], [-Math.cos(a0) * 0.85, 1.5 + Math.sin(a0) * 0.95, 0.9], [-Math.cos(a1) * 0.85, 1.5 + Math.sin(a1) * 0.95, 0.9], [-Math.cos(a1) * 0.85, 1.5 + Math.sin(a1) * 0.95, -1.5], [-Math.cos((a0 + a1) / 2), Math.sin((a0 + a1) / 2), 0]); }
        s.fx(0).paint(C.flame, 0).fx(0, 255).box(0.7, 1.75, 1.2, 0.06, 0.08, 0.06, 1);
        s.fx(0);
    });
    const airship = () => part('airship', s => {
        s.paint([226, 196, 150], 0).fx(0).blob(0, 9, 0, 6, 5.4, 15, { segs: 9, bands: 6, lump: 0.02, under: 0.55 });
        for (let i = -1; i <= 1; i++) s.paint(M.BRIGHT[0], 0).prism(9, 0, 9, i * 6.5, 5.9 - Math.abs(i) * 1.3, 9.01, 5.9 - Math.abs(i) * 1.3, { squash: 0.01 });
        s.paint([120, 84, 56], 0).box(0, 2.2, 0, 1.6, 1.0, 5, 0.7, [C.plank, 0]);
        for (const z of [-4, 0, 4]) for (const x of [-1.6, 1.6]) s.paint(C.rope, 0).prism(3, x, 3, z, 0.04, 6, 0.04, { dx: x * 0.9 });
        for (const x of [-1, 1]) s.paint(M.BRIGHT[1], 0).tri([0, 9, -14], [x * 5, 9, -19], [0, 9, -17.5], [0, 1, 0]);
        s.paint(M.BRIGHT[1], 0).tri([0, 9, -14], [0, 14, -19], [0, 9, -17.5], [1, 0, 0]);
        for (const z of [-3, 0, 3]) for (const x of [-1.62, 1.62]) s.paint(C.flame, 0).fx(0, 255).box(x, 2.4, z, 0.02, 0.3, 0.3, 1);
        s.fx(0);
    });
    const balloon = () => part('balloon', s => {
        s.paint(C.white, 3).fx(0).blob(0, 8, 0, 4.2, 4.8, 4.2, { segs: 10, bands: 6, lump: 0, under: 0.6 });
        s.paint([240, 232, 212], 0).prism(10, 0, 2.6, 0, 1.0, 4.4, 2.9);
        s.paint([150, 110, 76], 0).box(0, 0.6, 0, 0.7, 0.6, 0.7, 0.7);
        s.paint(C.flame, 0).fx(0, 255).box(0, 2.3, 0, 0.14, 0.24, 0.14, 1);
        s.fx(0);
    });

    return { WayStack, P, LOOKS, BEASTS, BIRDS, CLOTH, person, townsfolk, beast, bird, wagon, airship, balloon };
})();
