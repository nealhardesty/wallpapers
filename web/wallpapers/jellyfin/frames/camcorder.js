// Camcorder and VHS: two frames from the same shoebox of tapes.
//
// Camcorder: you're looking through the viewfinder of a 1990s camcorder. A
// ribbed rubber eyecup around a small CRT, corner brackets, a blinking
// ● REC, a battery, the tape counter, and the date stamp in that orange
// (thirty years back, so it reads like the tape it should be on). Now and
// then the zoom hunts a little: a Web Animation on the <video>, run by the
// compositor, so it costs the canvas nothing.
//
// VHS: a black CRT on a silver VCR on a TV cart, against a wall of 1990s
// confetti. The VCR's display blinks 12:00, as they all did. Blue screen
// with a STOP ■ when nothing plays, ▶ PLAY when a tape starts, ❚❚ PAUSE, and
// tracking noise rolling through between items.
//
// Both draw their on-screen text in a 5×7 dot-matrix face, as the machines did.

(() => {
    'use strict';

    // ---- The dot-matrix face ---------------------------------------------------

    // Seven rows of five bits per glyph, left pixel is 0x10.
    const GLYPHS = {
        '0': '0e11131519110e', '1': '040c040404040e', '2': '0e11010204081f', '3': '1f02040201110e',
        '4': '02060a121f0202', '5': '1f101e0101110e', '6': '0608101e11110e', '7': '1f010204080808',
        '8': '0e11110e11110e', '9': '0e11110f01020c',
        A: '0e1111111f1111', B: '1e11111e11111e', C: '0e11101010110e', D: '1c12111111121c',
        E: '1f10101e10101f', F: '1f10101e101010', G: '0e11101711110f', H: '1111111f111111',
        I: '0e04040404040e', J: '0702020202120c', K: '11121418141211', L: '1010101010101f',
        M: '111b1515111111', N: '11111915131111', O: '0e11111111110e', P: '1e11111e101010',
        Q: '0e11111115120d', R: '1e11111e141211', S: '0f10100e01011e', T: '1f040404040404',
        U: '1111111111110e', V: '11111111110a04', W: '1111111515150a', X: '11110a040a1111',
        Y: '1111110a040404', Z: '1f01020408101f',
        ':': '000c0c000c0c00', '.': '00000000000c0c', ',': '000000000c0408', '-': '0000001f000000',
        '/': '00010204081000', '!': '04040404000004', '?': '0e110102040004', "'": '04040800000000',
        '(': '02040808080402', ')': '08040202020408', ';': '000c0c000c0408', '+': '0004041f040400',
        '×': '00110a040a1100', '▶': '10181c1e1c1810', '◀': '0103070f070301', '■': '001f1f1f1f1f00',
        '❚': '1b1b1b1b1b1b1b', '⏏': '040e1f001f1f00', '▮': '1f1f1f1f1f1f1f', '▯': '1f11111111111f',
        '█': '1f1f1f1f1f1f1f', '_': '0000000000001f',
    };
    for (const key of Object.keys(GLYPHS)) {
        const hex = GLYPHS[key].replace(/\s/g, '');
        GLYPHS[key] = Array.from({ length: 7 }, (_, i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16));
    }
    const ASCII = { '…': '...', '’': "'", '‘': "'", '“': '"', '”': '"' };

    const dotWidth = (text, p) => Math.max(0, text.length * 6 * p - p);

    // Dot-matrix text: one path of little squares, filled twice, a dark
    // offset copy for the edge, then the colour.
    function dots(ctx, text, x, y, p, color, { align = 'left', edge = 'rgba(0, 0, 0, 0.8)', offset = 0.6 } = {}) {
        text = String(text).toUpperCase().replace(/[…’‘“”]/g, c => ASCII[c]);
        if (align !== 'left') x -= dotWidth(text, p) * (align === 'center' ? 0.5 : 1);
        x = Math.round(x);
        y = Math.round(y);
        ctx.beginPath();
        for (let i = 0; i < text.length; i++) {
            const rows = GLYPHS[text[i]];
            if (!rows) continue;
            for (let r = 0; r < 7; r++) {
                const bits = rows[r];
                if (!bits) continue;
                for (let c = 0; c < 5; c++) if (bits & (0x10 >> c)) ctx.rect(x + (i * 6 + c) * p, y + r * p, p, p);
            }
        }
        if (edge) {
            ctx.save();
            ctx.translate(Math.max(1, p * offset), Math.max(1, p * offset));
            ctx.fillStyle = edge;
            ctx.fill();
            ctx.restore();
        }
        ctx.fillStyle = color;
        ctx.fill();
    }

    // Lines of dot text centred in a box, wrapped to its width.
    function dotLines(ctx, text, cx, y, p, width, color, gap = 1.6) {
        const per = Math.max(4, Math.floor((width + p) / (6 * p)));
        const lines = [];
        for (const word of String(text).split(/\s+/)) {
            const last = lines.at(-1);
            if (last !== undefined && (last + ' ' + word).length <= per) lines[lines.length - 1] = last + ' ' + word;
            else lines.push(word);
        }
        lines.forEach((line, i) => dots(ctx, line, cx, y + i * 7 * p * gap, p, color, { align: 'center' }));
        return lines.length;
    }

    const seeded = seed => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

    // The date and time, thirty years back: the tape you'd find in a drawer.
    function stamp(now) {
        const d = new Date(now);
        const hour = d.getHours() % 12 || 12, minute = String(d.getMinutes()).padStart(2, '0');
        return { time: `${d.getHours() < 12 ? 'AM' : 'PM'} ${hour}:${minute}`, date: `${MONTHS[d.getMonth()]}. ${d.getDate()} ${d.getFullYear() - 30}` };
    }
    const untilMinute = now => 60000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 50;

    function counter(video) {
        const s = Math.max(0, Math.floor(video?.currentTime || 0));
        return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    }

    // Scanlines and a soft vignette, translucent over a screen.
    function tube(ctx, s, { lines = 0.12, vignette = 0.5, glare = 0.06 } = {}) {
        ctx.save();
        JellyfinFrames.roundRect(ctx, s.x, s.y, s.w, s.h, s.radius);
        ctx.clip();
        ctx.fillStyle = `rgba(0, 0, 0, ${lines})`;
        for (let y = s.y; y < s.y + s.h; y += 3) ctx.fillRect(s.x, y, s.w, 1);
        const v = ctx.createRadialGradient(s.x + s.w / 2, s.y + s.h / 2, Math.min(s.w, s.h) * 0.4, s.x + s.w / 2, s.y + s.h / 2, Math.hypot(s.w, s.h) * 0.56);
        v.addColorStop(0, 'rgba(0, 0, 0, 0)');
        v.addColorStop(1, `rgba(0, 0, 0, ${vignette})`);
        ctx.fillStyle = v;
        ctx.fillRect(s.x, s.y, s.w, s.h);
        if (glare) {
            const g = ctx.createLinearGradient(s.x, s.y, s.x + s.w * 0.5, s.y + s.h * 0.8);
            g.addColorStop(0, `rgba(255, 255, 255, ${glare})`);
            g.addColorStop(0.5, `rgba(255, 255, 255, ${glare * 0.25})`);
            g.addColorStop(0.51, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = g;
            ctx.fillRect(s.x, s.y, s.w, s.h);
        }
        ctx.restore();
    }

    // ================================================================================
    // Camcorder
    // ================================================================================

    const ORANGE = '#ffa733', WHITE = '#f4f4ee', RED = '#ff2d1f';
    const ZOOM_MS = 2600, CUT_MS = 520;

    function camLayout(w, h, aspect, env) {
        const portrait = h > w * 1.1;
        const bottom = h - env.insets.bottom;
        const margin = portrait ? w * 0.06 : Math.max(24, Math.min(w, h) * 0.075);
        const box = portrait
            ? { x: margin, y: bottom * 0.22, w: w - margin * 2, h: bottom * 0.5 }
            : { x: margin, y: margin, w: w - margin * 2, h: bottom - margin * 2 };
        const s = JellyfinFrames.fit(box, aspect);
        const screen = { ...s, radius: Math.min(s.w, s.h) * 0.025 };
        const p = Math.max(2, Math.round(screen.h / 130));
        return { portrait, screen, margin, p, m: Math.max(p * 4, screen.w * 0.045), bottom };
    }

    function camPaint(ctx, L, env) {
        const { w, h } = env.viewport;
        const s = L.screen, random = seeded(1996);
        // The housing: black rubber, a faint light leak from the screen.
        ctx.fillStyle = '#070708';
        ctx.fillRect(0, 0, w, h);
        const leak = ctx.createRadialGradient(s.x + s.w / 2, s.y + s.h / 2, Math.min(s.w, s.h) * 0.4, s.x + s.w / 2, s.y + s.h / 2, Math.max(w, h) * 0.75);
        leak.addColorStop(0, 'rgba(70, 74, 82, 0.35)');
        leak.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = leak;
        ctx.fillRect(0, 0, w, h);
        // Rubber stipple.
        ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
        for (let i = 0; i < (w * h) / 260; i++) ctx.fillRect(random() * w, random() * h, 1, 1);
        // The eyecup: ribs in rings around the window, catching a little light top-left.
        const reach = L.portrait ? Math.min(s.y - 10, h * 0.2) : L.margin * 0.85;
        for (let e = reach; e > 6; e -= 3.5) {
            const k = 1 - e / reach;
            ctx.strokeStyle = `rgba(150, 150, 160, ${0.03 + k * 0.07})`;
            ctx.lineWidth = 1;
            JellyfinFrames.roundRect(ctx, s.x - e, s.y - e, s.w + e * 2, s.h + e * 2, s.radius + e * 1.2);
            ctx.stroke();
        }
        // A bevel down into the tube.
        const bevel = Math.max(5, L.p * 3);
        const lip = ctx.createLinearGradient(0, s.y - bevel, 0, s.y + s.h + bevel);
        lip.addColorStop(0, '#2c2d31');
        lip.addColorStop(0.5, '#0c0c0d');
        lip.addColorStop(1, '#1c1d20');
        ctx.fillStyle = lip;
        JellyfinFrames.roundRect(ctx, s.x - bevel, s.y - bevel, s.w + bevel * 2, s.h + bevel * 2, s.radius + bevel);
        ctx.fill();
        // Words moulded into the housing, where there's room.
        const room = (L.portrait ? L.bottom - s.y - s.h - bevel : L.margin - bevel);
        if (room > 22) {
            const label = 'ROADWAFFLE   8mm   CCD-V96   12× ZOOM';
            let size = Math.max(9, Math.min(15, room * 0.22));
            ctx.font = `700 ${size}px "Arial Black", "Helvetica Neue", system-ui, sans-serif`;
            ctx.letterSpacing = `${(size * 0.35).toFixed(1)}px`;
            const fit = (w * 0.86) / ctx.measureText(label).width;
            if (fit < 1) {
                size *= fit;
                ctx.font = `700 ${size}px "Arial Black", "Helvetica Neue", system-ui, sans-serif`;
                ctx.letterSpacing = `${(size * 0.35).toFixed(1)}px`;
            }
            ctx.textAlign = 'center';
            const y = s.y + s.h + bevel + Math.min(room / 2, 70) + size / 2;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
            ctx.fillText(label, w / 2, y + 1);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
            ctx.fillText(label, w / 2, y);
            ctx.letterSpacing = '0px';
        }
        JellyfinFrames.cutScreen(ctx, s);
        tube(ctx, s, { lines: 0.1, vignette: 0.55, glare: 0.05 });
    }

    // Everything on the viewfinder's screen except the picture.
    function camOsd(ctx, t, L, env, { rec, blinkOn, idle = false }) {
        const s = L.screen, p = L.p, m = L.m;
        const x0 = s.x + m, y0 = s.y + m * 0.8, x1 = s.x + s.w - m, y1 = s.y + s.h - m * 0.8;
        // Corner brackets and the centre mark.
        ctx.save();
        const arm = s.w * 0.06, th = Math.max(2, p * 0.6);
        ctx.beginPath();
        for (const [cx, cy, dx, dy] of [[x0 - m * 0.4, y0 - m * 0.3, 1, 1], [x1 + m * 0.4, y0 - m * 0.3, -1, 1], [x0 - m * 0.4, y1 + m * 0.3, 1, -1], [x1 + m * 0.4, y1 + m * 0.3, -1, -1]]) {
            ctx.rect(Math.min(cx, cx + dx * arm), dy > 0 ? cy : cy - th, arm, th);
            ctx.rect(dx > 0 ? cx : cx - th, Math.min(cy, cy + dy * arm), th, arm);
        }
        if (!idle) {
            const mx = s.x + s.w / 2, my = s.y + s.h / 2, cross = p * 4;
            ctx.rect(mx - cross, my - th / 2, cross * 2, th);
            ctx.rect(mx - th / 2, my - cross, th, cross * 2);
        }
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.translate(1, 1);
        ctx.fill();
        ctx.translate(-1, -1);
        ctx.fillStyle = 'rgba(244, 244, 238, 0.75)';
        ctx.fill();
        ctx.restore();
        // Top left: ● REC, or STBY; the counter under it.
        if (rec) {
            if (blinkOn) {
                ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                ctx.beginPath();
                ctx.arc(x0 + p * 3.5 + 1, y0 + p * 3.5 + 1, p * 3, 0, 7);
                ctx.fill();
                ctx.fillStyle = RED;
                ctx.beginPath();
                ctx.arc(x0 + p * 3.5, y0 + p * 3.5, p * 3, 0, 7);
                ctx.fill();
            }
            dots(ctx, 'REC', x0 + p * 9, y0, p, WHITE);
        } else {
            dots(ctx, 'STBY', x0, y0, p, WHITE);
        }
        if (!idle && env.motion) dots(ctx, counter(env.video), x0, y0 + p * 11, p, WHITE);
        // Top right: the battery, and the tape speed.
        const bw = p * 14, bh = p * 7, bx = x1 - bw - p * 2;
        ctx.beginPath();
        ctx.rect(bx, y0, bw, p);
        ctx.rect(bx, y0 + bh - p, bw, p);
        ctx.rect(bx, y0, p, bh);
        ctx.rect(bx + bw - p, y0, p, bh);
        ctx.rect(bx + bw, y0 + p * 2, p * 2, p * 3);
        for (let i = 0; i < 3; i++) ctx.rect(bx + p * 2 + i * p * 4, y0 + p * 2, p * 3, p * 3);
        ctx.save();
        ctx.translate(Math.max(1, p * 0.6), Math.max(1, p * 0.6));
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = WHITE;
        ctx.fill();
        dots(ctx, 'SP', x1, y0 + p * 11, p, WHITE, { align: 'right' });
        // Bottom right: the date stamp, in orange.
        const { time, date } = stamp(env.now);
        dots(ctx, time, x1, y1 - p * 18, p, ORANGE, { align: 'right', edge: 'rgba(40, 10, 0, 0.9)' });
        dots(ctx, date, x1, y1 - p * 7, p, ORANGE, { align: 'right', edge: 'rgba(40, 10, 0, 0.9)' });
    }

    let cam = { zoomAt: -Infinity, nextZoom: 0, cut: null };

    // The zoom hunting: in a little, settle, back out. On the video itself,
    // as a Web Animation, so it ends on its own whatever happens to the frame.
    function zoom(video) {
        if (!video?.animate) return;
        video.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.055)', offset: 0.32 }, { transform: 'scale(1.045)', offset: 0.42 },
            { transform: 'scale(1.045)', offset: 0.74 }, { transform: 'scale(1)' }], { duration: ZOOM_MS, easing: 'ease-in-out' });
    }

    function camTick(ctx, t, L, env, idle) {
        const s = L.screen, p = L.p;
        let wait = Infinity;
        const cut = cam.cut && t - cam.cut.at < CUT_MS ? (t - cam.cut.at) / CUT_MS : null;
        if (cut !== null) {
            // Stop, start: a moment of black as the heads settle.
            ctx.fillStyle = `rgba(0, 0, 0, ${cut < 0.45 ? 1 : 1 - (cut - 0.45) / 0.55})`;
            JellyfinFrames.roundRect(ctx, s.x, s.y, s.w, s.h, s.radius);
            ctx.fill();
            wait = 33;
        } else cam.cut = null;
        const rec = env.playing && cut === null;
        const blinkOn = !env.motion || (t % 1000) < 560;
        camOsd(ctx, t, L, env, { rec, blinkOn, idle });
        // Bottom left: the zoom bar while the lens hunts.
        if (env.playing && env.motion) {
            if (!cam.nextZoom) cam.nextZoom = t + 25000 + Math.random() * 30000;
            if (t >= cam.nextZoom && cut === null) {
                cam.zoomAt = t;
                cam.nextZoom = t + 45000 + Math.random() * 75000;
                zoom(env.video);
            }
            const z = t - cam.zoomAt;
            if (z < ZOOM_MS) {
                const k = z < ZOOM_MS * 0.32 ? z / (ZOOM_MS * 0.32) : z < ZOOM_MS * 0.74 ? 1 : 1 - (z - ZOOM_MS * 0.74) / (ZOOM_MS * 0.26);
                const bars = 2 + Math.round(k * 3);
                dots(ctx, `W ${'▮'.repeat(bars)}${'▯'.repeat(8 - bars)} T`, s.x + L.m, s.y + s.h - L.m * 0.8 - p * 7, p, WHITE);
                wait = Math.min(wait, 66);
            }
            wait = Math.min(wait, 500 - (t % 500) + 5);
        }
        return Math.min(wait, untilMinute(env.now));
    }

    function camIdle(ctx, L, env, kind) {
        const [title, detail] = JellyfinFrames.IDLE[kind] || JellyfinFrames.IDLE.setup;
        const s = L.screen, p = L.p;
        ctx.save();
        JellyfinFrames.roundRect(ctx, s.x, s.y, s.w, s.h, s.radius);
        ctx.clip();
        const dark = ctx.createRadialGradient(s.x + s.w / 2, s.y + s.h / 2, 0, s.x + s.w / 2, s.y + s.h / 2, s.w * 0.6);
        dark.addColorStop(0, '#24262a');
        dark.addColorStop(1, '#0b0c0d');
        ctx.fillStyle = dark;
        ctx.fillRect(s.x, s.y, s.w, s.h);
        // The lens cap's on: just the CCD's grain.
        JellyfinFrames.drawSnow(ctx, s, 0.07);
        ctx.restore();
        const big = kind === 'demo' ? 'DEMO MODE' : title;
        const tp = Math.max(2, Math.round(p * 1.5));
        dots(ctx, big, s.x + s.w / 2, s.y + s.h * 0.4, tp, WHITE, { align: 'center' });
        if (detail) dotLines(ctx, detail, s.x + s.w / 2, s.y + s.h * 0.4 + tp * 12, Math.max(1, Math.round(p * 0.6)), s.w * 0.62, 'rgba(244, 244, 238, 0.8)');
        tube(ctx, s, { lines: 0.1, vignette: 0.55, glare: 0.05 });
        cam.idle = true;
    }

    JellyfinFrames.add({
        id: 'camcorder',
        osd: true,
        name: 'Camcorder',
        icon: '📹',
        videoFilter: 'saturate(1.15) contrast(1.06) brightness(1.03)',
        layout: camLayout,
        paint: camPaint,
        idle: camIdle,

        transition(kind, env) {
            if (kind === 'change') {
                cam.cut = { at: performance.now() };
                env.busy(CUT_MS);
            } else env.busy(100);
        },

        tick(ctx, t, L, env) {
            const idle = !!cam.idle;
            cam.idle = false;
            return camTick(ctx, t, L, env, idle);
        },

        // Plain yellow with a black edge, above the date stamp.
        cue(ctx, text, L) {
            JellyfinFrames.drawCue(ctx, text, L.screen, { font: '700 {size}px Arial, Helvetica, sans-serif', color: '#fff25c', box: null, outline: '#000', bottom: 0.2 });
        },
    });

    // ================================================================================
    // VHS
    // ================================================================================

    const VCR_BLUE = '#1428c8', VFD = '#74f6e4';
    const TRACK_MS = 1500, PLAY_OSD_MS = 4000;
    const OSD = {
        setup: '■ STOP', demo: '■ STOP', connecting: 'CH 03', loading: '◀◀ REW', offline: '■ STOP',
        signedout: '■ STOP', empty: '⏏ EJECT', away: '■ STOP',
    };

    function vhsLayout(w, h, aspect, env) {
        const portrait = h > w * 1.1;
        const floor = h - env.insets.bottom - Math.max(10, h * (portrait ? 0.04 : 0.06));
        const stack = 1 / aspect + 0.05 + 0.1 + 0.13 + 0.035 + 0.07;   // per unit of screen width
        const sw = Math.min(w * (portrait ? 0.84 : 0.6) / 1.1, (floor - h * (portrait ? 0.2 : 0.06)) / stack);
        const sh = sw / aspect, b = sw * 0.05;
        const tv = { w: sw + b * 2, h: sh + b + sw * 0.1 };
        tv.x = (w - tv.w) / 2;
        const vcr = { w: tv.w * 0.94, h: sw * 0.13 };
        const cart = { w: tv.w * 1.04, h: sw * 0.035, legs: sw * 0.07 };
        cart.y = floor - cart.legs - cart.h;
        cart.x = (w - cart.w) / 2;
        vcr.x = (w - vcr.w) / 2;
        vcr.y = cart.y - vcr.h;
        tv.y = vcr.y - tv.h;
        const screen = { x: tv.x + b, y: tv.y + b, w: sw, h: sh, radius: sw * 0.035 };
        const vfd = { x: vcr.x + vcr.w * 0.58, y: vcr.y + vcr.h * 0.24, w: vcr.w * 0.22, h: vcr.h * 0.42 };
        const p = Math.max(2, Math.round(sh / 85));
        return { portrait, floor, screen, tv, vcr, cart, vfd, p, m: Math.max(p * 5, sw * 0.06) };
    }

    // A 1990s wall: deep teal with faint confetti, squiggles and triangles.
    function vhsWall(ctx, L, w, h) {
        const random = seeded(1993);
        const paint = ctx.createLinearGradient(0, 0, 0, L.floor);
        paint.addColorStop(0, '#0d2a33');
        paint.addColorStop(1, '#123640');
        ctx.fillStyle = paint;
        ctx.fillRect(0, 0, w, L.floor);
        const colours = ['rgba(255, 92, 170, 0.13)', 'rgba(255, 214, 64, 0.12)', 'rgba(80, 220, 255, 0.12)', 'rgba(255, 255, 255, 0.07)'];
        ctx.lineCap = 'round';
        ctx.lineWidth = 2.5;
        for (let i = 0; i < (w * L.floor) / 5200; i++) {
            const x = random() * w, y = random() * L.floor, size = 6 + random() * 10, a = random() * Math.PI * 2;
            ctx.fillStyle = ctx.strokeStyle = colours[(random() * colours.length) | 0];
            const kind = random();
            ctx.beginPath();
            if (kind < 0.3) {
                ctx.moveTo(x, y);
                for (let k = 1; k <= 4; k++) ctx.quadraticCurveTo(x + (k - 0.5) * size * 0.6 * Math.cos(a), y + (k % 2 ? -1 : 1) * size * 0.4 + (k - 0.5) * size * 0.6 * Math.sin(a), x + k * size * 0.6 * Math.cos(a), y + k * size * 0.6 * Math.sin(a));
                ctx.stroke();
            } else if (kind < 0.55) {
                for (let k = 0; k < 3; k++) ctx.lineTo(x + Math.cos(a + k * 2.094) * size * 0.6, y + Math.sin(a + k * 2.094) * size * 0.6);
                ctx.closePath();
                ctx.stroke();
            } else if (kind < 0.8) {
                ctx.arc(x, y, size * 0.22, 0, 7);
                ctx.fill();
            } else {
                ctx.moveTo(x - Math.cos(a) * size * 0.6, y - Math.sin(a) * size * 0.6);
                ctx.lineTo(x + Math.cos(a) * size * 0.6, y + Math.sin(a) * size * 0.6);
                ctx.stroke();
            }
        }
        const shade = ctx.createRadialGradient(w / 2, L.floor * 0.55, 0, w / 2, L.floor * 0.55, Math.max(w, h) * 0.75);
        shade.addColorStop(0, 'rgba(0, 0, 0, 0)');
        shade.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
        ctx.fillStyle = shade;
        ctx.fillRect(0, 0, w, L.floor);
        // Grey-blue carpet.
        const carpet = ctx.createLinearGradient(0, L.floor, 0, h);
        carpet.addColorStop(0, '#2b3140');
        carpet.addColorStop(1, '#141820');
        ctx.fillStyle = carpet;
        ctx.fillRect(0, L.floor, w, h - L.floor);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(0, L.floor, w, 3);
    }

    // Where there's wall to spare above the set, a shelf of taped-off-the-telly
    // cassettes, their labels in felt-tip.
    function tapes(ctx, L, w) {
        const room = L.tv.y - 20;
        const th = Math.min(L.tv.w * 0.2, room * 0.32);
        if (th < 40) return;
        const random = seeded(1984);
        const spine = th * 0.18, shelfY = L.tv.y - room * 0.32;
        const shelf = { x: w / 2 - L.tv.w * 0.48, w: L.tv.w * 0.96 };
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(shelf.x + 4, shelfY + 6, shelf.w, 8);
        let x = shelf.x + spine * 0.6;
        const labels = ['#f4efe2', '#f6e27a', '#9ed7f0', '#f2a3b8', '#f4efe2', '#bfe6a8'];
        while (x + spine < shelf.x + shelf.w - spine * 0.6) {
            if (random() < 0.12) { x += spine * 0.7; continue; }
            const tall = th * (0.96 + random() * 0.04);
            ctx.fillStyle = random() < 0.2 ? '#e9e4d8' : '#121214';
            ctx.fillRect(x, shelfY - tall, spine, tall);
            ctx.fillStyle = labels[(random() * labels.length) | 0];
            ctx.fillRect(x + spine * 0.15, shelfY - tall * 0.88, spine * 0.7, tall * 0.76);
            ctx.strokeStyle = random() < 0.5 ? 'rgba(20, 40, 160, 0.75)' : 'rgba(30, 30, 30, 0.75)';
            ctx.lineWidth = Math.max(1, spine * 0.08);
            ctx.beginPath();
            let y = shelfY - tall * 0.82;
            const end = shelfY - tall * (0.2 + random() * 0.3);
            ctx.moveTo(x + spine * 0.5, y);
            while (y < end) { y += spine * 0.25; ctx.lineTo(x + spine * (0.38 + random() * 0.24), y); }
            ctx.stroke();
            x += spine * 1.04;
        }
        const board = ctx.createLinearGradient(0, shelfY, 0, shelfY + 8);
        board.addColorStop(0, '#5a3d28');
        board.addColorStop(1, '#2e1e12');
        ctx.fillStyle = board;
        ctx.fillRect(shelf.x, shelfY, shelf.w, 8);
    }

    function vhsPaint(ctx, L, env) {
        const { w, h } = env.viewport;
        vhsWall(ctx, L, w, h);
        const { tv, vcr, cart, screen: s } = L;
        tapes(ctx, L, w);
        // The cart: a black shelf on short legs, with casters.
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.beginPath();
        ctx.ellipse(w / 2, L.floor + 2, cart.w * 0.56, Math.max(6, cart.legs * 0.4), 0, 0, 7);
        ctx.fill();
        ctx.fillStyle = '#16171a';
        for (const fx of [0.06, 0.94]) {
            const x = cart.x + cart.w * fx;
            ctx.fillRect(x - cart.h * 0.35, cart.y + cart.h, cart.h * 0.7, cart.legs - cart.h * 0.5);
            ctx.beginPath();
            ctx.arc(x, L.floor - cart.h * 0.5, cart.h * 0.5, 0, 7);
            ctx.fill();
        }
        const shelf = ctx.createLinearGradient(0, cart.y, 0, cart.y + cart.h);
        shelf.addColorStop(0, '#3a3c42');
        shelf.addColorStop(1, '#141518');
        ctx.fillStyle = shelf;
        ctx.fillRect(cart.x, cart.y, cart.w, cart.h);
        // The VCR: brushed silver, a tape door, a display window, buttons.
        const silver = ctx.createLinearGradient(0, vcr.y, 0, vcr.y + vcr.h);
        silver.addColorStop(0, '#c4c8ce');
        silver.addColorStop(0.15, '#9da2a9');
        silver.addColorStop(1, '#6c7178');
        ctx.fillStyle = silver;
        JellyfinFrames.roundRect(ctx, vcr.x, vcr.y, vcr.w, vcr.h, vcr.h * 0.06);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
        for (let y = vcr.y + 2; y < vcr.y + vcr.h; y += 2) ctx.fillRect(vcr.x, y, vcr.w, 0.6);
        const door = { x: vcr.x + vcr.w * 0.18, y: vcr.y + vcr.h * 0.22, w: vcr.w * 0.36, h: vcr.h * 0.38 };
        ctx.fillStyle = '#1b1c1f';
        JellyfinFrames.roundRect(ctx, door.x, door.y, door.w, door.h, 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.fillRect(door.x + 2, door.y + door.h * 0.5, door.w - 4, 1);
        const f = L.vfd;
        ctx.fillStyle = '#05080a';
        JellyfinFrames.roundRect(ctx, f.x, f.y, f.w, f.h, 2);
        ctx.fill();
        ctx.fillStyle = '#2a2c30';
        const bw = vcr.w * 0.03, bh = vcr.h * 0.16;
        for (let i = 0; i < 4; i++) {
            JellyfinFrames.roundRect(ctx, f.x + f.w + vcr.w * 0.025 + i * bw * 1.3, vcr.y + vcr.h * 0.3, bw, bh, 2);
            ctx.fill();
        }
        const small = Math.max(6, vcr.h * 0.1);
        ctx.font = `700 ${small}px "Helvetica Neue", Arial, sans-serif`;
        ctx.fillStyle = 'rgba(30, 32, 36, 0.75)';
        ctx.textAlign = 'left';
        ctx.fillText('VIDEO CASSETTE RECORDER', door.x, vcr.y + vcr.h * 0.82);
        ctx.font = `italic 900 ${small * 1.4}px "Helvetica Neue", Arial, sans-serif`;
        ctx.fillText('HQ', vcr.x + vcr.w * 0.05, vcr.y + vcr.h * 0.5);
        ctx.font = `700 ${small * 0.85}px "Helvetica Neue", Arial, sans-serif`;
        ctx.fillText('4 HEAD HI-FI STEREO', f.x, vcr.y + vcr.h * 0.82);
        // The TV: a black 1990s set, a gentle curve to its tube.
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(tv.x + 6, tv.y + tv.h, tv.w - 12, 4);
        const body = ctx.createLinearGradient(0, tv.y, 0, tv.y + tv.h);
        body.addColorStop(0, '#34363b');
        body.addColorStop(0.08, '#212226');
        body.addColorStop(1, '#141518');
        ctx.fillStyle = body;
        JellyfinFrames.roundRect(ctx, tv.x, tv.y, tv.w, tv.h, s.w * 0.04);
        ctx.fill();
        const b = s.x - tv.x;
        ctx.fillStyle = '#0a0a0c';
        JellyfinFrames.roundRect(ctx, s.x - b * 0.3, s.y - b * 0.3, s.w + b * 0.6, s.h + b * 0.6, s.radius + b * 0.3);
        ctx.fill();
        // The chin: speaker slots, the badge, the power light, the buttons.
        const chin = { y: s.y + s.h + b * 0.3, h: tv.y + tv.h - (s.y + s.h + b * 0.3) };
        ctx.fillStyle = '#0c0c0e';
        for (let i = 0; i < 9; i++) ctx.fillRect(tv.x + b + i * b * 0.32, chin.y + chin.h * 0.3, b * 0.14, chin.h * 0.4);
        ctx.font = `700 ${Math.max(7, chin.h * 0.22)}px "Helvetica Neue", Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.letterSpacing = `${Math.max(1, chin.h * 0.06).toFixed(1)}px`;
        ctx.fillStyle = '#9ea2a8';
        ctx.fillText('ROADWAFFLE', tv.x + tv.w / 2, chin.y + chin.h * 0.6);
        ctx.letterSpacing = '0px';
        ctx.fillStyle = '#ff3a2a';
        ctx.beginPath();
        ctx.arc(tv.x + tv.w - b * 1.2, chin.y + chin.h / 2, Math.max(1.5, chin.h * 0.06), 0, 7);
        ctx.fill();
        ctx.fillStyle = '#2b2d32';
        for (let i = 0; i < 3; i++) {
            JellyfinFrames.roundRect(ctx, tv.x + tv.w - b * 2 - (i + 1) * b * 0.55, chin.y + chin.h * 0.38, b * 0.4, chin.h * 0.24, 2);
            ctx.fill();
        }
        // The tube, then over it scanlines, the head-switching ragged edge
        // along the bottom, a vignette and glare.
        JellyfinFrames.cutScreen(ctx, s);
        ctx.save();
        JellyfinFrames.roundRect(ctx, s.x, s.y, s.w, s.h, s.radius);
        ctx.clip();
        JellyfinFrames.drawSnow(ctx, { x: s.x, y: s.y + s.h * 0.975, w: s.w, h: s.h * 0.025 }, 0.35);
        ctx.restore();
        tube(ctx, s, { lines: 0.14, vignette: 0.55, glare: 0.08 });
    }

    let vhs = { track: null, pausedAt: null, playUntil: 0, wasPlaying: false, idle: null };

    // A wobble on the video while the tracking finds itself.
    function wobble(video) {
        if (!video?.animate) return;
        video.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-1.4%) skewX(-1deg)', offset: 0.15 }, { transform: 'translateX(0.9%)', offset: 0.35 },
            { transform: 'translateX(-0.5%)', offset: 0.6 }, { transform: 'translateX(0)' }], { duration: TRACK_MS * 0.8, easing: 'linear' });
    }

    // Tracking noise: bands of snow rolling up the screen, with bright tears.
    function trackingBands(ctx, s, age) {
        const q = age / TRACK_MS;
        for (let i = 0; i < 3; i++) {
            const phase = (q * 1.4 + i * 0.37) % 1.25;
            const bh = s.h * (0.05 + 0.04 * i) * (1 - q * 0.5);
            const y = s.y + s.h * (1.1 - phase);
            JellyfinFrames.drawSnow(ctx, { x: s.x, y, w: s.w, h: bh }, 0.75 * (1 - q * 0.6));
            ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
            for (let k = 0; k < 4; k++) ctx.fillRect(s.x + Math.random() * s.w, y + Math.random() * bh, s.w * (0.05 + Math.random() * 0.25), 1.5);
        }
    }

    function vfd(ctx, L, t, env, text) {
        const f = L.vfd;
        const p = Math.max(1, Math.floor(Math.min(f.h / 10, f.w / 58)));
        const x = f.x + f.w - p * 3, y = f.y + (f.h - p * 7) / 2;
        if (/^[\d:]*$/.test(text)) dots(ctx, '8:88:88', x, y, p, 'rgba(116, 246, 228, 0.07)', { align: 'right', edge: null });
        if (text) dots(ctx, text, x, y, p, VFD, { align: 'right', edge: 'rgba(116, 246, 228, 0.18)', offset: 0.3 });
        if (env.playing) dots(ctx, '▶', f.x + p * 3, y, p, VFD, { edge: null });
        else if (env.paused) dots(ctx, '❚', f.x + p * 3, y, p, VFD, { edge: null });
    }

    function vhsTick(ctx, t, L, env, idleKind) {
        const s = L.screen, p = L.p, m = L.m;
        let wait = Infinity;
        if (env.playing && !vhs.wasPlaying) vhs.playUntil = t + PLAY_OSD_MS;
        vhs.wasPlaying = env.playing;
        const track = vhs.track && t - vhs.track.at < TRACK_MS ? t - vhs.track.at : null;
        if (track !== null) {
            ctx.save();
            JellyfinFrames.roundRect(ctx, s.x, s.y, s.w, s.h, s.radius);
            ctx.clip();
            trackingBands(ctx, s, track);
            ctx.restore();
            const level = Math.min(8, 1 + Math.floor((track / TRACK_MS) * 9));
            dots(ctx, 'TRACKING', s.x + s.w / 2, s.y + s.h * 0.42 - p * 9, p, WHITE, { align: 'center' });
            dots(ctx, `-${'▮'.repeat(level)}${'▯'.repeat(8 - level)}+`, s.x + s.w / 2, s.y + s.h * 0.42 + p * 2, p, WHITE, { align: 'center' });
            vhs.playUntil = t + TRACK_MS + PLAY_OSD_MS - track;
            wait = 66;
        } else vhs.track = null;
        if (env.paused) {
            // A paused tape: a band of noise across the still picture.
            ctx.save();
            JellyfinFrames.roundRect(ctx, s.x, s.y, s.w, s.h, s.radius);
            ctx.clip();
            JellyfinFrames.drawSnow(ctx, { x: s.x, y: s.y + s.h * 0.66, w: s.w, h: s.h * 0.05 }, 0.6);
            ctx.restore();
            dots(ctx, '❚ PAUSE', s.x + m, s.y + m, p, WHITE);
        } else if (env.playing && t < vhs.playUntil) {
            dots(ctx, '▶ PLAY', s.x + m, s.y + m, p, WHITE);
            dots(ctx, counter(env.video), s.x + s.w - m, s.y + m, p, WHITE, { align: 'right' });
            dots(ctx, 'SP', s.x + s.w - m, s.y + m + p * 11, p, WHITE, { align: 'right' });
            wait = Math.min(wait, track === null ? Math.max(50, Math.min(1000 - ((env.video?.currentTime || 0) * 1000 % 1000), vhs.playUntil - t)) : 66);
        } else if (idleKind) {
            dots(ctx, OSD[idleKind] || OSD.setup, s.x + m, s.y + m, p, WHITE);
        }
        // The VCR's display: 12:00 blinking forever when nothing plays, the
        // counter when something does.
        const blink = env.motion && (t % 1000) >= 600;
        if (env.playing) vfd(ctx, L, t, env, env.motion ? counter(env.video) : 'PLAY');
        else if (env.paused) vfd(ctx, L, t, env, 'PAUSE');
        else vfd(ctx, L, t, env, blink ? '' : '12:00');
        if (env.motion && !env.playing && !env.paused) wait = Math.min(wait, (t % 1000 < 600 ? 600 : 1000) - (t % 1000) + 5);
        if (env.motion && env.playing) wait = Math.min(wait, 1000 - ((env.video?.currentTime || 0) * 1000 % 1000) + 5);
        return wait;
    }

    function vhsIdle(ctx, L, env, kind) {
        const [title, detail] = JellyfinFrames.IDLE[kind] || JellyfinFrames.IDLE.setup;
        const s = L.screen, p = L.p;
        ctx.save();
        JellyfinFrames.roundRect(ctx, s.x, s.y, s.w, s.h, s.radius);
        ctx.clip();
        ctx.fillStyle = VCR_BLUE;
        ctx.fillRect(s.x, s.y, s.w, s.h);
        ctx.restore();
        const tp = Math.max(2, Math.round(p * 1.4));
        dots(ctx, title, s.x + s.w / 2, s.y + s.h * 0.4, tp, WHITE, { align: 'center', edge: 'rgba(0, 0, 40, 0.6)' });
        if (detail) dotLines(ctx, detail, s.x + s.w / 2, s.y + s.h * 0.4 + tp * 12, Math.max(1, Math.round(p * 0.6)), s.w * 0.7, 'rgba(255, 255, 255, 0.85)');
        tube(ctx, s, { lines: 0.14, vignette: 0, glare: 0 });
        vhs.idle = kind;
    }

    JellyfinFrames.add({
        id: 'vhs',
        osd: true,
        name: 'VHS',
        icon: '📼',
        videoFilter: 'saturate(0.8) contrast(1.12) brightness(1.04) sepia(0.08)',
        layout: vhsLayout,
        paint: vhsPaint,
        idle: vhsIdle,

        transition(kind, env) {
            if (kind === 'change') {
                vhs.track = { at: performance.now() };
                wobble(env.video);
                env.busy(TRACK_MS);
            } else {
                if (kind === 'play') vhs.playUntil = performance.now() + PLAY_OSD_MS;
                env.busy(100);
            }
        },

        tick(ctx, t, L, env) {
            const kind = vhs.idle;
            vhs.idle = null;
            return vhsTick(ctx, t, L, env, kind);
        },

        // Closed captions, as the decoder box drew them: capitals, white on black.
        cue(ctx, text, L) {
            JellyfinFrames.drawCue(ctx, text.toUpperCase(), L.screen, { font: '700 {size}px ui-monospace, Menlo, Consolas, monospace', color: '#fff', box: '#000', bottom: 0.12 });
        },
    });
})();
