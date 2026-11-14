// Ice Patrol's cockpit (SPEC §10.34): the canopy frame and the instrument
// panel, on two 2D canvases over the WebGL view.
//
//   frame   everything that doesn't move: struts, glass, coaming, panel,
//           bezels, switches, lettering. Painted once per size, and again
//           only when the light outside has moved on a step (twelve from
//           night to day) or frost has crept another notch across the glass.
//   gauges  what does move, in a strip over the panel, about fifteen times
//           a second: the radar, the attitude ball, the terrain scope, the
//           heading tape, the dials and the caution lamps.
//
// The instruments are honest. The radar really sweeps the terrain ahead
// (IceLogic.radarRay): slopes that face the dish paint bright, the ground
// behind a ridge stays dark, and the picture smears a little in a turn,
// because the old paint is fixed to the tube. The scope beside it is the
// ground the autopilot is about to cross.

const ICE_GLOWS = { green: [90, 255, 150], amber: [255, 186, 72], blue: [120, 205, 255] };

class IceCockpit {
    constructor(host, terrain) {
        this.host = host;
        this.terrain = terrain;
        this.PAD = 28;               // the frame overhangs the screen, so it can sway without showing an edge
        this.key = '';
        this.gaugeClock = -1;
        this.sweep = { angle: -1, dir: 1 };
        this.bins = new Float32Array(46);
        this.frost = 0;
    }

    mount() {
        const wrap = this.wrap = document.createElement('div');
        Object.assign(wrap.style, { position: 'fixed', left: -this.PAD + 'px', top: -this.PAD + 'px', zIndex: '-2', pointerEvents: 'none', willChange: 'transform' });
        this.frame = document.createElement('canvas');
        this.gauges = document.createElement('canvas');
        for (const canvas of [this.frame, this.gauges]) {
            Object.assign(canvas.style, { position: 'absolute', left: '0', top: '0', pointerEvents: 'none' });
            wrap.appendChild(canvas);
        }
        this.radar = document.createElement('canvas');
        // A 2D canvas can lose its picture too (the GPU process restarting): paint it again.
        this.onRestored = () => { this.key = ''; this.gaugeClock = -1; };
        this.frame.addEventListener('contextrestored', this.onRestored);
        document.body.appendChild(wrap);
    }

    unmount() {
        this.wrap?.remove();
        this.wrap = null;
    }

    // Where everything sits, in CSS px from the screen's top left.
    layout(w, h, ratio, config) {
        if (!this.wrap) return;
        const P = this.PAD, bottom = h - (this.host.insets?.bottom || 0);
        const ph = Math.max(110, Math.min(0.34 * h, w / 2.72, bottom * 0.5));
        const top = bottom - ph, cx = w / 2, R = ph * 0.385;
        const g = this.g = { w, h, ratio, bottom, ph, top, cx, R };
        g.radar = { x: cx, y: top + ph * 0.56, r: R };
        g.adi = { x: cx - R * 2.4, y: top + ph * 0.58, r: ph * 0.265 };
        g.scope = { x: cx + R * 2.44, y: top + ph * 0.57, w: ph * 0.66, h: ph * 0.47 };
        g.tape = { x: cx, y: top + ph * 0.075, w: R * 2.1, h: ph * 0.085 };
        // The outer instruments only where the screen is wide enough for them.
        g.wide = w / 2 > ph * 2.0;
        g.dial = { x: cx - ph * 1.68, y: top + ph * 0.62, r: ph * 0.185 };
        g.lamps = { x: cx - ph * 1.68, y: top + ph * 0.27, w: ph * 0.4, h: ph * 0.13 };
        g.bars = { x: cx + ph * 1.7, y: top + ph * 0.57, w: ph * 0.34, h: ph * 0.5 };
        g.pillar = w > h ? [0.115, 0.235] : [0.03, 0.15];    // where each windscreen post meets the coaming and the roof, as a share of the width
        // The coaming: highest in the middle, over the instruments.
        g.coam = x => top + ph * 0.1 * Math.pow(Math.abs(x - cx) / (w / 2), 1.7);

        Object.assign(this.wrap.style, { width: w + 2 * P + 'px', height: h + 2 * P + 'px' });
        const size = (canvas, cw, ch) => {
            canvas.width = Math.max(1, Math.round(cw * ratio));
            canvas.height = Math.max(1, Math.round(ch * ratio));
            canvas.style.width = cw + 'px';
            canvas.style.height = ch + 'px';
        };
        size(this.frame, w + 2 * P, h + 2 * P);
        g.gy = top - ph * 0.02;          // the gauge strip's top
        size(this.gauges, w, h - g.gy);
        Object.assign(this.gauges.style, { left: P + 'px', top: P + g.gy + 'px' });
        this.radar.width = this.radar.height = Math.max(32, Math.round(R * 2 * ratio));
        this.key = '';
        this.gaugeClock = -1;
    }

    // ---- Every frame ----------------------------------------------------------------
    update(s) {
        if (!this.wrap || !this.g) return;
        const mode = s.config.cockpit;
        this.wrap.style.display = mode === 'none' ? 'none' : '';
        if (mode === 'none') return;
        const g = this.g, f = s.flight;

        // The airframe moves about the pilot's head: back against a climb, away from a turn of the head, shaken by the weather.
        const jolt = s.sway * (0.5 + 2.2 * s.level);
        const x = -s.pan * 70 + jolt * Math.sin(s.seconds * 6.1) * Math.sin(s.seconds * 1.7);
        const y = s.sway * IceLogic.clamp(f.climb * 0.12, -7, 7) + jolt * Math.sin(s.seconds * 7.7 + 2) * Math.sin(s.seconds * 2.3);
        this.wrap.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${(s.sway * f.roll * -0.35).toFixed(3)}deg)`;

        // Frost creeps in with the snow and clears slowly after.
        this.frost += ((s.level > 0.25 ? s.level : 0) - this.frost) * 0.004;
        const key = [mode, s.config.glow, Math.round(s.light.day * 12), Math.round(this.frost * 5), g.wide].join('|');
        if (key !== this.key) {
            this.key = key;
            this.paintFrame(s, mode);
        }
        if (s.seconds - this.gaugeClock >= 1 / 15 || s.seconds < this.gaugeClock) {
            const dt = this.gaugeClock < 0 ? 1 / 15 : Math.min(s.seconds - this.gaugeClock, 0.25);
            this.gaugeClock = s.seconds;
            this.paintGauges(s, dt);
        }
    }

    // ---- Colour -----------------------------------------------------------------------
    // A surface colour under the cabin's light (0 to 1 a channel).
    lit(c, k = 1) {
        const L = this.cabin;
        return `rgb(${Math.round(c[0] * L[0] * k)},${Math.round(c[1] * L[1] * k)},${Math.round(c[2] * L[2] * k)})`;
    }
    glow(a = 1, k = 1) {
        const c = this.phosphor;
        return `rgba(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)},${a})`;
    }

    // ---- The frame: painted rarely -------------------------------------------------------
    paintFrame(s, mode) {
        const g = this.g, P = this.PAD, ctx = this.frame.getContext('2d'), { w, h, ph, top, cx, bottom } = g;
        const day = Math.round(s.light.day * 12) / 12, night = 1 - day;
        // Daylight through the glass, tinted a little by the sky; at night, only the panel's own lamps.
        const sky = s.horizon, peak = Math.max(sky[0], sky[1], sky[2], 1e-3);
        this.cabin = [0, 1, 2].map(i => IceLogic.mix(0.17 + 0.03 * i, 0.82 + 0.18 * sky[i] / peak, day));
        this.phosphor = ICE_GLOWS[s.config.glow] || ICE_GLOWS.green;
        ctx.setTransform(g.ratio, 0, 0, g.ratio, P * g.ratio, P * g.ratio);
        ctx.clearRect(-P, -P, w + 2 * P, h + 2 * P);
        ctx.lineJoin = 'round';

        if (mode === 'full') this.paintCanopy(ctx, day);

        // The panel's face, under the coaming's curve.
        const curve = (from, to) => { for (let i = 0; i <= 48; i++) { const x = from + (to - from) * i / 48; ctx.lineTo(x, g.coam(x)); } };
        ctx.beginPath();
        ctx.moveTo(-P, h + P);
        ctx.lineTo(-P, g.coam(-P));
        curve(-P, w + P);
        ctx.lineTo(w + P, h + P);
        ctx.closePath();
        const face = ctx.createLinearGradient(0, top, 0, bottom);
        face.addColorStop(0, this.lit([30, 33, 38]));
        face.addColorStop(0.5, this.lit([44, 48, 54]));
        face.addColorStop(1, this.lit([26, 28, 32]));
        ctx.fillStyle = face;
        ctx.fill();
        // A fine grain, so it isn't a flat fill.
        ctx.save();
        ctx.clip();
        ctx.globalAlpha = 0.05;
        for (let i = 0; i < 900; i++) {
            ctx.fillStyle = i % 2 ? '#fff' : '#000';
            ctx.fillRect(Math.random() * w, top + Math.random() * (h - top), 1 + Math.random() * 2, 1);
        }
        ctx.restore();

        // The coaming: a padded roll along the top, catching the light from outside.
        const roll = ph * 0.075;
        ctx.beginPath();
        ctx.moveTo(-P, g.coam(-P) + roll);
        ctx.lineTo(-P, g.coam(-P) - roll * 0.5);
        for (let i = 0; i <= 48; i++) { const x = -P + (w + 2 * P) * i / 48; ctx.lineTo(x, g.coam(x) - roll * 0.5); }
        for (let i = 48; i >= 0; i--) { const x = -P + (w + 2 * P) * i / 48; ctx.lineTo(x, g.coam(x) + roll); }
        ctx.closePath();
        const pad = ctx.createLinearGradient(0, top - roll * 0.5, 0, top + ph * 0.1 + roll);
        pad.addColorStop(0, this.lit([70, 76, 86], 0.6 + 0.6 * day));
        pad.addColorStop(0.12, this.lit([20, 21, 25]));
        pad.addColorStop(1, this.lit([9, 9, 11]));
        ctx.fillStyle = pad;
        ctx.fill();
        ctx.strokeStyle = `rgba(215,230,245,${0.1 + 0.34 * day})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i <= 48; i++) { const x = -P + (w + 2 * P) * i / 48; ctx.lineTo(x, g.coam(x) - roll * 0.5 + 0.6); }
        ctx.stroke();
        // Its stitching.
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = this.lit([92, 88, 80], 0.9);
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        for (let i = 0; i <= 48; i++) { const x = -P + (w + 2 * P) * i / 48; ctx.lineTo(x, g.coam(x) + roll * 0.62); }
        ctx.stroke();
        ctx.setLineDash([]);

        // Plates, bezels, switches, lettering.
        const label = (text, x, y, size = ph * 0.042) => {
            ctx.font = `600 ${Math.max(6, size).toFixed(1)}px ui-monospace, Menlo, Consolas, monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            // Engraved by day; edge-lit in the panel's colour by night.
            ctx.fillStyle = night > 0.5 ? this.glow(0.35 + 0.4 * night, 0.85) : this.lit([185, 192, 200], 0.9);
            ctx.fillText(text, x, y);
        };
        const plate = (x, y, pw, phh, r = ph * 0.03) => {
            ctx.beginPath();
            ctx.roundRect(x - pw / 2, y - phh / 2, pw, phh, r);
            const fill = ctx.createLinearGradient(0, y - phh / 2, 0, y + phh / 2);
            fill.addColorStop(0, this.lit([56, 61, 68]));
            fill.addColorStop(1, this.lit([38, 41, 47]));
            ctx.fillStyle = fill;
            ctx.fill();
            ctx.strokeStyle = this.lit([12, 13, 15]);
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.strokeStyle = `rgba(255,255,255,${0.05 + 0.1 * day})`;
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.roundRect(x - pw / 2 + 1.5, y - phh / 2 + 1.5, pw - 3, phh - 3, r);
            ctx.stroke();
            for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) this.screw(ctx, x + sx * (pw / 2 - ph * 0.032), y + sy * (phh / 2 - ph * 0.032), ph * 0.011);
        };
        const bezel = (x, y, r) => {
            const ring = ctx.createRadialGradient(x, y - r * 0.3, r * 0.6, x, y, r * 1.14);
            ring.addColorStop(0, this.lit([16, 17, 20]));
            ring.addColorStop(0.82, this.lit([74, 80, 90]));
            ring.addColorStop(1, this.lit([20, 21, 25]));
            ctx.fillStyle = ring;
            ctx.beginPath();
            ctx.arc(x, y, r * 1.14, 0, 6.2832);
            ctx.fill();
            ctx.fillStyle = '#030506';
            ctx.beginPath();
            ctx.arc(x, y, r, 0, 6.2832);
            ctx.fill();
        };
        const knob = (x, y, r, turn) => {
            const cap = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r);
            cap.addColorStop(0, this.lit([120, 126, 136]));
            cap.addColorStop(1, this.lit([22, 23, 27]));
            ctx.fillStyle = cap;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, 6.2832);
            ctx.fill();
            ctx.strokeStyle = this.lit([230, 232, 236]);
            ctx.lineWidth = Math.max(1, r * 0.16);
            ctx.beginPath();
            ctx.moveTo(x + Math.sin(turn) * r * 0.35, y - Math.cos(turn) * r * 0.35);
            ctx.lineTo(x + Math.sin(turn) * r * 0.9, y - Math.cos(turn) * r * 0.9);
            ctx.stroke();
        };
        const toggles = (x, y, n, names) => {
            const gap = ph * 0.105;
            for (let i = 0; i < n; i++) {
                const tx = x + (i - (n - 1) / 2) * gap, up = (i * 7 + n) % 3 !== 0;
                ctx.fillStyle = this.lit([14, 15, 17]);
                ctx.beginPath();
                ctx.arc(tx, y, ph * 0.02, 0, 6.2832);
                ctx.fill();
                ctx.strokeStyle = this.lit([196, 200, 206]);
                ctx.lineCap = 'round';
                ctx.lineWidth = ph * 0.017;
                ctx.beginPath();
                ctx.moveTo(tx, y);
                ctx.lineTo(tx, y + (up ? -1 : 1) * ph * 0.042);
                ctx.stroke();
                ctx.lineCap = 'butt';
                if (names) label(names[i], tx, y + ph * 0.078, ph * 0.03);
            }
        };

        const { radar, adi, scope, tape } = g;
        // Centre: the radar.
        plate(cx, top + ph * 0.585, radar.r * 2.72, ph * 0.83);
        bezel(radar.x, radar.y, radar.r);
        label('TFR-7  GROUND MAP', cx, radar.y + radar.r * 1.2 + ph * 0.012, ph * 0.036);
        knob(cx - radar.r * 1.1, radar.y + radar.r * 0.9, ph * 0.035, -0.6);
        knob(cx + radar.r * 1.1, radar.y + radar.r * 0.9, ph * 0.035, 0.9);
        label('RNG', cx - radar.r * 1.1, radar.y - radar.r * 0.95, ph * 0.03);
        label('GAIN', cx + radar.r * 1.1, radar.y - radar.r * 0.95, ph * 0.03);
        // The heading window in the coaming's lip.
        ctx.fillStyle = '#020405';
        ctx.beginPath();
        ctx.roundRect(tape.x - tape.w / 2, tape.y - tape.h / 2, tape.w, tape.h, tape.h * 0.25);
        ctx.fill();
        ctx.strokeStyle = this.lit([80, 86, 96]);
        ctx.lineWidth = 1.2;
        ctx.stroke();
        // Left: attitude.
        plate(adi.x, top + ph * 0.6, adi.r * 2.75, ph * 0.76);
        bezel(adi.x, adi.y - ph * 0.03, adi.r);
        toggles(adi.x, adi.y + adi.r + ph * 0.045, 4, ['AP', 'TF', 'LMP', 'ICE']);
        // Right: the terrain scope.
        plate(scope.x, top + ph * 0.6, scope.w * 1.2, ph * 0.76);
        ctx.fillStyle = this.lit([70, 76, 86]);
        ctx.beginPath();
        ctx.roundRect(scope.x - scope.w / 2 - 4, scope.y - ph * 0.03 - scope.h / 2 - 4, scope.w + 8, scope.h + 8, ph * 0.035);
        ctx.fill();
        ctx.fillStyle = '#030506';
        ctx.beginPath();
        ctx.roundRect(scope.x - scope.w / 2, scope.y - ph * 0.03 - scope.h / 2, scope.w, scope.h, ph * 0.025);
        ctx.fill();
        label('TERRAIN FOLLOW', scope.x, scope.y + scope.h / 2 + ph * 0.035, ph * 0.034);
        toggles(scope.x, scope.y + scope.h / 2 + ph * 0.1, 3);
        if (g.wide) {
            const { dial, bars, lamps } = g;
            plate(dial.x, top + ph * 0.6, ph * 0.56, ph * 0.76);
            bezel(dial.x, dial.y, dial.r);
            label('AIRSPEED', dial.x, dial.y + dial.r + ph * 0.07, ph * 0.032);
            ctx.fillStyle = '#040506';
            ctx.beginPath();
            ctx.roundRect(lamps.x - lamps.w / 2, lamps.y - lamps.h / 2, lamps.w, lamps.h, 3);
            ctx.fill();
            plate(bars.x, top + ph * 0.6, ph * 0.5, ph * 0.76);
            ctx.fillStyle = '#030506';
            ctx.beginPath();
            ctx.roundRect(bars.x - bars.w / 2, bars.y - bars.h / 2, bars.w, bars.h, 4);
            ctx.fill();
            label('R.ALT   V/S', bars.x, bars.y + bars.h / 2 + ph * 0.045, ph * 0.03);
        }
        // The panel lamps spill a little of their colour at night.
        if (night > 0.05) {
            ctx.globalCompositeOperation = 'lighter';
            for (const [x, y, r] of [[radar.x, radar.y, radar.r * 2.6], [adi.x, adi.y, adi.r * 2.4], [scope.x, scope.y, scope.w * 1.3]]) {
                const pool = ctx.createRadialGradient(x, y, r * 0.3, x, y, r);
                pool.addColorStop(0, this.glow(0.13 * night));
                pool.addColorStop(1, this.glow(0));
                ctx.fillStyle = pool;
                ctx.fillRect(x - r, y - r, r * 2, r * 2);
            }
            ctx.globalCompositeOperation = 'source-over';
        }
    }

    screw(ctx, x, y, r) {
        ctx.fillStyle = this.lit([120, 126, 134]);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 6.2832);
        ctx.fill();
        ctx.strokeStyle = this.lit([24, 25, 28]);
        ctx.lineWidth = Math.max(0.6, r * 0.35);
        ctx.beginPath();
        ctx.moveTo(x - r * 0.7, y - r * 0.5);
        ctx.lineTo(x + r * 0.7, y + r * 0.5);
        ctx.stroke();
    }

    // The canopy: a roof bow, two windscreen posts, side rails, and the glass between.
    paintCanopy(ctx, day) {
        const g = this.g, P = this.PAD, { w, h } = g, [low, high] = g.pillar;
        const u = Math.min(w, h * 1.5);                    // the frame's scale
        const roof = y0 => x => y0 + u * 0.022 * Math.pow((x - w / 2) / (w / 2), 2);
        const posts = [-1, 1].map(side => {
            const x0 = w / 2 + side * (0.5 - low) * w, x1 = w / 2 + side * (0.5 - high) * w;
            return { side, x0, y0: g.coam(x0) + 4, x1, y1: -P, w0: u * 0.034, w1: u * 0.024 };
        });

        // Glass: a sheen across each pane, a scuff or two, and frost in the corners when it snows.
        ctx.save();
        const sheen = ctx.createLinearGradient(w * 0.2, 0, w * 0.75, h * 0.7);
        sheen.addColorStop(0, 'rgba(255,255,255,0)');
        sheen.addColorStop(0.42, `rgba(220,235,255,${0.02 + 0.035 * day})`);
        sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
        sheen.addColorStop(0.63, `rgba(220,235,255,${0.012 + 0.02 * day})`);
        sheen.addColorStop(0.7, 'rgba(255,255,255,0)');
        ctx.fillStyle = sheen;
        ctx.fillRect(-P, -P, w + 2 * P, g.top + g.ph * 0.2 + P);
        const frost = Math.round(this.frost * 5) / 5;
        if (frost > 0) {
            const corners = [[posts[0].x0 + 10, g.coam(posts[0].x0)], [posts[1].x0 - 10, g.coam(posts[1].x0)], [posts[0].x1, u * 0.04], [posts[1].x1, u * 0.04], [0, g.coam(0)], [w, g.coam(w)]];
            for (const [x, y] of corners) {
                const r = u * (0.1 + 0.2 * frost), ice = ctx.createRadialGradient(x, y, 0, x, y, r);
                ice.addColorStop(0, `rgba(232,242,252,${0.34 * frost * (0.5 + 0.5 * day)})`);
                ice.addColorStop(1, 'rgba(232,242,252,0)');
                ctx.fillStyle = ice;
                ctx.fillRect(x - r, y - r, r * 2, r * 2);
                ctx.fillStyle = `rgba(245,250,255,${0.3 * frost * (0.4 + 0.6 * day)})`;
                for (let i = 0; i < 90 * frost; i++) {
                    const a = Math.random() * 6.283, d = r * Math.pow(Math.random(), 1.6) * 0.9, len = 2 + Math.random() * 5;
                    ctx.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d, Math.cos(a * 3) * len, 1);
                }
            }
        }
        ctx.restore();

        const metal = (x0, y0, x1, y1) => {
            const fill = ctx.createLinearGradient(x0, y0, x1, y1);
            fill.addColorStop(0, this.lit([22, 23, 27]));
            fill.addColorStop(0.3, this.lit([78, 84, 94]));
            fill.addColorStop(0.55, this.lit([50, 54, 61]));
            fill.addColorStop(1, this.lit([16, 17, 20]));
            return fill;
        };
        const rim = `rgba(205,225,245,${0.08 + 0.3 * day})`;

        // Side rails, running back out of sight.
        for (const side of [-1, 1]) {
            const x = side < 0 ? -P : w + P, inner = x - side * (P + u * 0.016);
            ctx.fillStyle = metal(x, 0, inner, 0);
            ctx.fillRect(Math.min(x, inner), -P, Math.abs(inner - x), h + P);
        }
        // The roof bow.
        const lower = roof(u * 0.048);
        ctx.beginPath();
        ctx.moveTo(-P, -P);
        ctx.lineTo(w + P, -P);
        for (let i = 40; i >= 0; i--) { const x = -P + (w + 2 * P) * i / 40; ctx.lineTo(x, lower(x)); }
        ctx.closePath();
        ctx.fillStyle = metal(0, -P, 0, u * 0.07);
        ctx.fill();
        ctx.strokeStyle = rim;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i <= 40; i++) { const x = -P + (w + 2 * P) * i / 40; ctx.lineTo(x, lower(x) - 0.6); }
        ctx.stroke();
        // The posts.
        for (const p of posts) {
            const half0 = p.w0 / 2, half1 = p.w1 / 2;
            ctx.beginPath();
            ctx.moveTo(p.x0 - half0, p.y0);
            ctx.lineTo(p.x1 - half1, p.y1);
            ctx.lineTo(p.x1 + half1, p.y1);
            ctx.lineTo(p.x0 + half0, p.y0);
            ctx.closePath();
            ctx.fillStyle = metal(p.x0 - half0, 0, p.x0 + half0, 0);
            ctx.fill();
            // The rubber the glass sits in, and the light along the edge facing the windscreen.
            ctx.strokeStyle = 'rgba(0,0,0,0.75)';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.strokeStyle = rim;
            ctx.lineWidth = 1.1;
            ctx.beginPath();
            ctx.moveTo(p.x0 - p.side * (half0 - 2.5), p.y0);
            ctx.lineTo(p.x1 - p.side * (half1 - 2.5), p.y1);
            ctx.stroke();
            // Rivets up its length.
            for (let i = 1; i < 9; i++) {
                const t = i / 9;
                this.screw(ctx, p.x0 + (p.x1 - p.x0) * t, p.y0 + (p.y1 - p.y0) * t, u * 0.0034);
            }
        }
    }

    // ---- The gauges: fifteen times a second -------------------------------------------------
    paintGauges(s, dt) {
        const g = this.g, ctx = this.gauges.getContext('2d'), f = s.flight;
        ctx.setTransform(g.ratio, 0, 0, g.ratio, 0, -g.gy * g.ratio);
        ctx.clearRect(0, g.gy, g.w, g.h - g.gy);
        ctx.lineJoin = 'round';
        const font = size => `600 ${Math.max(6, size).toFixed(1)}px ui-monospace, Menlo, Consolas, monospace`;
        const heading = ((f.heading * 180 / Math.PI) % 360 + 360) % 360;
        const dim = 0.4 + 0.6 * s.light.day;                // painted faces need light; phosphor makes its own

        this.paintRadar(ctx, s, dt, heading, font);

        // Heading tape: the compass sliding under a fixed lubber line.
        const tape = g.tape;
        ctx.save();
        ctx.beginPath();
        ctx.rect(tape.x - tape.w / 2 + 2, tape.y - tape.h / 2, tape.w - 4, tape.h);
        ctx.clip();
        ctx.font = font(tape.h * 0.52);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = ctx.strokeStyle = this.glow(0.95);
        ctx.lineWidth = 1;
        const perDeg = tape.w / 70;
        for (let d = Math.floor((heading - 40) / 5) * 5; d <= heading + 40; d += 5) {
            const x = tape.x + (d - heading) * perDeg, deg = ((d % 360) + 360) % 360;
            ctx.beginPath();
            ctx.moveTo(x, tape.y + tape.h / 2);
            ctx.lineTo(x, tape.y + tape.h / 2 - (deg % 10 ? 0.18 : 0.3) * tape.h);
            ctx.stroke();
            if (deg % 30 === 0) ctx.fillText(deg % 90 === 0 ? 'NESW'[deg / 90] : String(deg / 10).padStart(2, '0'), x, tape.y - tape.h * 0.1);
        }
        ctx.restore();
        ctx.fillStyle = '#ffb347';
        ctx.beginPath();
        ctx.moveTo(tape.x, tape.y - tape.h * 0.2);
        ctx.lineTo(tape.x - tape.h * 0.2, tape.y - tape.h / 2);
        ctx.lineTo(tape.x + tape.h * 0.2, tape.y - tape.h / 2);
        ctx.fill();

        // Attitude: a ball that stays level with the world while the craft rolls round it.
        const adi = g.adi, ay = adi.y - g.ph * 0.03, roll = f.roll * s.config.bank * s.sway, perRad = adi.r / 0.42;
        ctx.save();
        ctx.beginPath();
        ctx.arc(adi.x, ay, adi.r * 0.97, 0, 6.2832);
        ctx.clip();
        ctx.translate(adi.x, ay);
        ctx.rotate(-roll);
        ctx.translate(0, f.pitch * perRad);
        const k = v => Math.round(v * dim);
        ctx.fillStyle = `rgb(${k(46)},${k(104)},${k(150)})`;
        ctx.fillRect(-adi.r * 2, -adi.r * 3, adi.r * 4, adi.r * 3);
        ctx.fillStyle = `rgb(${k(94)},${k(70)},${k(48)})`;
        ctx.fillRect(-adi.r * 2, 0, adi.r * 4, adi.r * 3);
        ctx.strokeStyle = ctx.fillStyle = `rgba(245,248,250,${0.55 + 0.45 * dim})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(-adi.r * 2, 0);
        ctx.lineTo(adi.r * 2, 0);
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.font = font(adi.r * 0.13);
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        for (let deg = -40; deg <= 40; deg += 5) {
            if (!deg) continue;
            const y = -deg * Math.PI / 180 * perRad, half = adi.r * (deg % 10 ? 0.12 : 0.26);
            ctx.beginPath();
            ctx.moveTo(-half, y);
            ctx.lineTo(half, y);
            ctx.stroke();
            if (deg % 10 === 0) ctx.fillText(String(Math.abs(deg)), half + 3, y);
        }
        ctx.restore();
        // The bank scale above it, and the pointer that rides it.
        ctx.strokeStyle = `rgba(240,244,248,${0.5 + 0.5 * dim})`;
        ctx.lineWidth = 1.2;
        for (const deg of [-45, -30, -20, -10, 0, 10, 20, 30, 45]) {
            const a = deg * Math.PI / 180 - Math.PI / 2, len = deg % 30 === 0 ? 0.12 : 0.07;
            ctx.beginPath();
            ctx.moveTo(adi.x + Math.cos(a) * adi.r * 0.95, ay + Math.sin(a) * adi.r * 0.95);
            ctx.lineTo(adi.x + Math.cos(a) * adi.r * (0.95 - len), ay + Math.sin(a) * adi.r * (0.95 - len));
            ctx.stroke();
        }
        ctx.save();
        ctx.translate(adi.x, ay);
        ctx.rotate(-roll);
        ctx.fillStyle = '#ffb347';
        ctx.beginPath();
        ctx.moveTo(0, -adi.r * 0.8);
        ctx.lineTo(-adi.r * 0.07, -adi.r * 0.66);
        ctx.lineTo(adi.r * 0.07, -adi.r * 0.66);
        ctx.fill();
        ctx.restore();
        // The craft itself: fixed wings and a dot.
        ctx.strokeStyle = '#ffb347';
        ctx.lineWidth = Math.max(2, adi.r * 0.05);
        ctx.beginPath();
        ctx.moveTo(adi.x - adi.r * 0.62, ay);
        ctx.lineTo(adi.x - adi.r * 0.22, ay);
        ctx.lineTo(adi.x - adi.r * 0.22, ay + adi.r * 0.09);
        ctx.moveTo(adi.x + adi.r * 0.62, ay);
        ctx.lineTo(adi.x + adi.r * 0.22, ay);
        ctx.lineTo(adi.x + adi.r * 0.22, ay + adi.r * 0.09);
        ctx.stroke();
        ctx.fillStyle = '#ffb347';
        ctx.fillRect(adi.x - 2, ay - 2, 4, 4);
        this.glass(ctx, adi.x, ay, adi.r, s.light.day);

        this.paintScope(ctx, s, font);
        if (g.wide) this.paintOuter(ctx, s, font, dim);
    }

    // A highlight across a round instrument's glass.
    glass(ctx, x, y, r, day) {
        const shine = ctx.createLinearGradient(x - r, y - r, x + r * 0.4, y + r * 0.6);
        shine.addColorStop(0, `rgba(255,255,255,${0.05 + 0.12 * day})`);
        shine.addColorStop(0.45, 'rgba(255,255,255,0)');
        ctx.fillStyle = shine;
        ctx.beginPath();
        ctx.arc(x, y, r * 0.97, 0, 6.2832);
        ctx.fill();
    }

    // The radar: a dish nodding ±62° about the nose, painting what the
    // ground sends back onto a tube that slowly forgets.
    paintRadar(ctx, s, dt, heading, font) {
        const g = this.g, f = s.flight, tube = this.radar, size = tube.width, rctx = tube.getContext('2d');
        const range = s.config.radarRange, SPAN = 1.08, ox = size / 2, oy = size * 0.84, reach = size * 0.72, bins = this.bins.length;
        // Forget a little.
        rctx.globalCompositeOperation = 'destination-out';
        rctx.fillStyle = `rgba(0,0,0,${1 - Math.exp(-dt / 1.7)})`;
        rctx.fillRect(0, 0, size, size);
        rctx.globalCompositeOperation = 'source-over';
        // Sweep on, a degree and a half a ray.
        let left = 1.5 * dt;
        while (left > 1e-4) {
            const step = Math.min(left, 0.026), from = this.sweep.angle;
            let to = from + this.sweep.dir * step;
            if (Math.abs(to) > SPAN) { to = Math.sign(to) * SPAN; this.sweep.dir *= -1; }
            left -= step;
            const mid = (from + to) / 2, a0 = Math.min(from, to) - 0.004 - Math.PI / 2, a1 = Math.max(from, to) + 0.004 - Math.PI / 2;
            IceLogic.radarRay(this.terrain.height, f.x, f.y, f.z, f.heading + mid, range, bins, this.bins);
            for (let level = 1; level <= 4; level++) {
                rctx.beginPath();
                let any = false;
                for (let i = 0; i < bins; i++) {
                    if (Math.min(4, Math.ceil(this.bins[i] * 4)) !== level) continue;
                    const r0 = i / bins * reach, r1 = (i + 1) / bins * reach + 0.5;
                    rctx.moveTo(ox + Math.cos(a0) * r0, oy + Math.sin(a0) * r0);
                    rctx.arc(ox, oy, r1, a0, a1);
                    rctx.arc(ox, oy, r0, a1, a0, true);
                    any = true;
                }
                if (any) {
                    rctx.fillStyle = this.glow(0.16 + 0.21 * level);
                    rctx.fill();
                }
            }
            this.sweep.angle = to;
        }

        const { x, y, r } = g.radar, scale = r * 2 / size;
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, r * 0.975, 0, 6.2832);
        ctx.clip();
        const back = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
        back.addColorStop(0, this.glow(1, 0.07));
        back.addColorStop(1, this.glow(1, 0.02));
        ctx.fillStyle = back;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
        ctx.drawImage(tube, x - r, y - r, r * 2, r * 2);
        const px = x - r + ox * scale, py = y - r + oy * scale, pr = reach * scale;
        // Range rings and bearing lines, etched on the glass.
        ctx.strokeStyle = this.glow(0.3);
        ctx.lineWidth = 1;
        for (let i = 1; i <= 4; i++) {
            ctx.beginPath();
            ctx.arc(px, py, pr * i / 4, -Math.PI / 2 - SPAN, -Math.PI / 2 + SPAN);
            ctx.stroke();
        }
        for (const a of [-SPAN, -SPAN / 2, 0, SPAN / 2, SPAN]) {
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px + Math.sin(a) * pr, py - Math.cos(a) * pr);
            ctx.stroke();
        }
        // The beam.
        ctx.strokeStyle = this.glow(0.85);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.sin(this.sweep.angle) * pr, py - Math.cos(this.sweep.angle) * pr);
        ctx.stroke();
        // Contacts: wingmen as carets, beacons as diamonds, stations as squares.
        ctx.lineWidth = 1.3;
        ctx.font = font(r * 0.105);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        let nearest = null;
        for (const c of s.contacts) {
            const d = Math.hypot(c.x, c.z);
            let bearing = Math.atan2(c.x, c.z) - f.heading;
            bearing = Math.atan2(Math.sin(bearing), Math.cos(bearing));
            if (d > range || Math.abs(bearing) > SPAN) continue;
            const bx = px + Math.sin(bearing) * d / range * pr, by = py - Math.cos(bearing) * d / range * pr, k = Math.max(2.5, r * 0.035);
            // Brightest just after the beam has crossed it.
            const since = ((this.sweep.dir > 0 ? this.sweep.angle - bearing : bearing - this.sweep.angle) + 4 * SPAN) % (2 * SPAN);
            ctx.strokeStyle = ctx.fillStyle = this.glow(0.45 + 0.55 * Math.exp(-since * 2.2), 1.15);
            ctx.beginPath();
            if (c.kind === 'friend') { ctx.moveTo(bx - k, by + k); ctx.lineTo(bx, by - k); ctx.lineTo(bx + k, by + k); }
            else if (c.kind === 'beacon') { ctx.moveTo(bx, by - k); ctx.lineTo(bx + k, by); ctx.lineTo(bx, by + k); ctx.lineTo(bx - k, by); ctx.closePath(); }
            else ctx.rect(bx - k, by - k, k * 2, k * 2);
            ctx.stroke();
            if (c.kind !== 'friend' && (!nearest || d < nearest.d)) nearest = { d, bx, by, kind: c.kind };
        }
        if (nearest) ctx.fillText(`${nearest.kind === 'station' ? 'STN' : 'BCN'} ${(nearest.d / 1000).toFixed(1)}`, nearest.bx + r * 0.07, nearest.by);
        // Own ship, and the numbers round the edge.
        ctx.fillStyle = this.glow(1);
        ctx.beginPath();
        ctx.moveTo(px, py - r * 0.06);
        ctx.lineTo(px - r * 0.04, py + r * 0.03);
        ctx.lineTo(px + r * 0.04, py + r * 0.03);
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.fillText(`${range / 1000}KM`, x - r * 0.56, y + r * 0.5);
        ctx.fillText(`H${String(Math.round(heading) % 360).padStart(3, '0')}`, x + r * 0.56, y + r * 0.5);
        ctx.restore();
        this.glass(ctx, x, y, r, s.light.day);
    }

    // The terrain-following scope: the ground about to be crossed, side on.
    paintScope(ctx, s, font) {
        const g = this.g, f = s.flight, sc = g.scope, x0 = sc.x - sc.w / 2, y0 = sc.y - g.ph * 0.03 - sc.h / 2, ground = this.terrain.height;
        const look = 1600, n = 36, sin = Math.sin(f.heading), cos = Math.cos(f.heading);
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0 + 2, y0 + 2, sc.w - 4, sc.h - 4);
        ctx.clip();
        ctx.fillStyle = this.glow(1, 0.045);
        ctx.fillRect(x0, y0, sc.w, sc.h);
        // The scale opens up when there is a wall ahead.
        let span = Math.max(90, s.config.clearance * 3.2);
        const heights = [];
        for (let i = 0; i <= n; i++) {
            const d = look * i / n, hh = ground(f.x + sin * d, f.z + cos * d) - f.y;
            heights.push(hh);
            span = Math.max(span, Math.abs(hh) * 1.25);
        }
        this.scopeSpan = (this.scopeSpan || span) + (span - (this.scopeSpan || span)) * 0.2;
        const left = x0 + sc.w * 0.12, wide = sc.w * 0.84, mid = y0 + sc.h * 0.42, perM = sc.h * 0.5 / this.scopeSpan;
        ctx.strokeStyle = this.glow(0.22);
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 1; i < 4; i++) { ctx.moveTo(left + wide * i / 4, y0); ctx.lineTo(left + wide * i / 4, y0 + sc.h); }
        ctx.moveTo(x0, mid);
        ctx.lineTo(x0 + sc.w, mid);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(left, y0 + sc.h);
        heights.forEach((hh, i) => ctx.lineTo(left + wide * i / n, mid - hh * perM));
        ctx.lineTo(left + wide, y0 + sc.h);
        ctx.fillStyle = this.glow(0.16);
        ctx.fill();
        ctx.beginPath();
        heights.forEach((hh, i) => ctx.lineTo(left + wide * i / n, mid - hh * perM));
        ctx.strokeStyle = this.glow(0.95);
        ctx.lineWidth = 1.6;
        ctx.stroke();
        // Where the craft is going: a dashed line along its climb.
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = this.glow(0.6);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(left, mid);
        ctx.lineTo(left + wide * 0.5, mid - f.climb / s.speed * look * 0.5 * perM);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = this.glow(1);
        ctx.beginPath();
        ctx.moveTo(left + 5, mid);
        ctx.lineTo(left - 5, mid - 4);
        ctx.lineTo(left - 5, mid + 4);
        ctx.fill();
        ctx.font = font(sc.h * 0.115);
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.fillText(`RALT ${String(Math.round(f.agl)).padStart(3, '0')}`, x0 + sc.w * 0.05, y0 + sc.h * 0.05);
        ctx.textAlign = 'right';
        if (f.pull > 0.55 && s.seconds % 0.5 < 0.3) {
            ctx.fillStyle = '#ff5a48';
            ctx.fillText('PULL UP', x0 + sc.w * 0.95, y0 + sc.h * 0.05);
        } else ctx.fillText('TF AUTO', x0 + sc.w * 0.95, y0 + sc.h * 0.05);
        ctx.restore();
    }

    // Wide screens: airspeed, caution lamps, and the height and climb bars.
    paintOuter(ctx, s, font, dim) {
        const g = this.g, f = s.flight, { dial, lamps, bars } = g, kph = s.speed * 3.6;
        const white = `rgba(240,244,248,${0.45 + 0.55 * dim})`;
        // Airspeed: 0 to 800 km/h round 270°.
        const at = v => (-225 + 270 * IceLogic.clamp(v / 800, 0, 1)) * Math.PI / 180;
        ctx.strokeStyle = ctx.fillStyle = white;
        ctx.lineWidth = 1;
        ctx.font = font(dial.r * 0.2);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let v = 0; v <= 800; v += 50) {
            const a = at(v), inner = v % 100 ? 0.84 : 0.76;
            ctx.beginPath();
            ctx.moveTo(dial.x + Math.cos(a) * dial.r * 0.93, dial.y + Math.sin(a) * dial.r * 0.93);
            ctx.lineTo(dial.x + Math.cos(a) * dial.r * inner, dial.y + Math.sin(a) * dial.r * inner);
            ctx.stroke();
            if (v % 200 === 0) ctx.fillText(String(v / 100), dial.x + Math.cos(a) * dial.r * 0.58, dial.y + Math.sin(a) * dial.r * 0.58);
        }
        const needle = at(kph + 4 * Math.sin(s.seconds * 1.3) + 14 * s.level * Math.sin(s.seconds * 4.1));
        ctx.strokeStyle = '#ffb347';
        ctx.lineWidth = Math.max(1.5, dial.r * 0.06);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(dial.x - Math.cos(needle) * dial.r * 0.15, dial.y - Math.sin(needle) * dial.r * 0.15);
        ctx.lineTo(dial.x + Math.cos(needle) * dial.r * 0.82, dial.y + Math.sin(needle) * dial.r * 0.82);
        ctx.stroke();
        ctx.lineCap = 'butt';
        ctx.fillStyle = white;
        ctx.beginPath();
        ctx.arc(dial.x, dial.y, dial.r * 0.08, 0, 6.2832);
        ctx.fill();
        ctx.fillStyle = this.glow(0.95);
        ctx.fillText(String(Math.round(kph)), dial.x, dial.y + dial.r * 0.52);
        this.glass(ctx, dial.x, dial.y, dial.r, s.light.day);

        // Caution lamps, two rows of three.
        const blink = s.seconds % 0.5 < 0.3;
        const cells = [
            ['AP', true, '#57e389'], ['LAMP', s.lamps > 0.3, '#57e389'], ['HEAT', s.level > 0.15 || s.night > 0.5, '#ffb347'],
            ['ICE', s.level > 0.5, '#ffb347'], ['TERR', f.pull > 0.55 && blink, '#ff5a48'], ['WIND', s.level > 0.8, '#ffb347'],
        ];
        const cw = lamps.w / 3, ch = lamps.h / 2;
        ctx.font = font(ch * 0.5);
        cells.forEach(([name, on, colour], i) => {
            const x = lamps.x - lamps.w / 2 + (i % 3) * cw, y = lamps.y - lamps.h / 2 + Math.floor(i / 3) * ch;
            ctx.fillStyle = on ? colour : 'rgba(70,74,80,0.55)';
            ctx.globalAlpha = on ? 0.92 : 1;
            ctx.fillRect(x + 1, y + 1, cw - 2, ch - 2);
            ctx.globalAlpha = 1;
            ctx.fillStyle = on ? '#10140f' : 'rgba(150,156,164,0.5)';
            ctx.fillText(name, x + cw / 2, y + ch / 2 + 0.5);
        });

        // Height above the snow (a log scale to 500 m) and climb (±40 m/s).
        const bx = bars.x - bars.w / 2, by = bars.y - bars.h / 2, bw = bars.w * 0.26;
        const track = (x, fill) => {
            ctx.fillStyle = this.glow(1, 0.1);
            ctx.fillRect(x, by + bars.h * 0.08, bw, bars.h * 0.74);
            fill(by + bars.h * 0.08, bars.h * 0.74);
        };
        ctx.fillStyle = this.glow(0.9);
        track(bx + bars.w * 0.14, (ty, th) => {
            const t = IceLogic.clamp(Math.log(1 + Math.max(f.agl, 0) / 10) / Math.log(51), 0, 1);
            ctx.fillStyle = this.glow(0.9);
            ctx.fillRect(bx + bars.w * 0.14, ty + th * (1 - t), bw, th * t);
        });
        track(bx + bars.w * 0.6, (ty, th) => {
            const t = IceLogic.clamp(f.climb / 40, -1, 1);
            ctx.fillStyle = t < -0.6 ? '#ffb347' : this.glow(0.9);
            ctx.fillRect(bx + bars.w * 0.6, ty + th / 2 - Math.max(t, 0) * th / 2, bw, Math.abs(t) * th / 2 + 1);
        });
        ctx.font = font(bars.h * 0.085);
        ctx.fillStyle = this.glow(0.95);
        ctx.textAlign = 'center';
        ctx.fillText(String(Math.round(f.agl)), bx + bars.w * 0.14 + bw / 2, by + bars.h * 0.91);
        ctx.fillText((f.climb >= 0 ? '+' : '-') + String(Math.abs(Math.round(f.climb))).padStart(2, '0'), bx + bars.w * 0.6 + bw / 2, by + bars.h * 0.91);
    }
}
