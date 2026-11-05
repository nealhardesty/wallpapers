// World Clock's faces: a grid of analog clocks, one per city, as many
// columns as suit the screen. Each dial is that city's sky right now (the
// sun's altitude there: blue by day, gold and rose at the twilights, deep
// blue with stars at night), with a small sun or moon at six o'clock.
// Three styles: classic (a brass bezel, Roman numerals, leaf hands and a
// red seconds hand), modern (batons, bar hands, a gold seconds hand) and
// minimal (dots and fine lines).
//
// Cost: each dial is baked and kept until its sky moves a degree or the
// screen changes; a second draws the dials, the hands and the words.

class WorldClockFaces {
    constructor(app) {
        this.app = app;
        this.dials = new Map();   // place id → { key, canvas }
        this.cells = [];
    }

    resize() {
        this.dials.clear();
        this.grid = null;
        this.bg = null;   // built on the next draw
    }

    // Another view is showing: let the background and the dials go.
    release() {
        this.bg = null;
        this.dials.clear();
    }

    configure(old, config) {
        if (old.faceStyle !== config.faceStyle) this.dials.clear();
        if (old.cities !== config.cities || old.custom !== config.custom || old.showDate !== config.showDate || old.showOffset !== config.showOffset) this.grid = null;
    }

    drawBackground() {
        const { W, H, dpr } = this.app;
        this.bg = WorldClockArt.canvas(W * dpr, H * dpr);
        const g = this.bg.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        const v = g.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, Math.max(W, H) * 0.75);
        v.addColorStop(0, '#13233a');
        v.addColorStop(1, '#05090f');
        g.fillStyle = v;
        g.fillRect(0, 0, W, H);
    }

    // The grid: try every column count and keep the one with the largest
    // dials, each with room for its words below.
    layout(n) {
        const { safe, k } = this.app, m = 18 * k;
        const x0 = safe.left + m, y0 = safe.top + m, aw = safe.right - safe.left - 2 * m, ah = safe.bottom - safe.top - 2 * m;
        let best = null;
        for (let cols = 1; cols <= n; cols++) {
            const rows = Math.ceil(n / cols), cw = aw / cols, ch = ah / rows;
            const text = WorldClockArt.clamp(ch * 0.26, 44 * k, 96 * k);
            const D = Math.min(cw * 0.82, ch - text - 8 * k, 560 * k);
            if (!best || D > best.D) best = { cols, rows, cw, ch, D, text };
        }
        const { cols, rows, cw, ch, D, text } = best;
        const used = rows * ch, top = y0 + (ah - used) / 2;
        this.cells = [];
        for (let i = 0; i < n; i++) {
            const row = Math.floor(i / cols), inRow = Math.min(cols, n - row * cols), col = i % cols;
            const cx = x0 + (aw - inRow * cw) / 2 + (col + 0.5) * cw;
            const block = D + 8 * k + text;
            const cy = top + row * ch + (ch - block) / 2 + D / 2;
            this.cells.push({ cx, cy, D, text });
        }
        this.grid = { n, D };
    }

    // A dial, baked: the sky, the stars, the bezel, the markers, the glyph.
    dial(info, D) {
        const app = this.app, style = app.config.faceStyle, dpr = app.dpr;
        const alt = Math.round(info.alt);
        const key = `${style}|${Math.round(D)}|${alt}|${info.phase}|${info.home}`;
        const kept = this.dials.get(info.id);
        if (kept && kept.key === key) return kept.canvas;
        const pad = 6 * app.k;
        const size = D + 2 * pad, c = WorldClockArt.canvas(size * dpr, size * dpr), g = c.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        const R = D / 2, cx = size / 2, cy = size / 2;
        const sky = WorldClockArt.sky(info.alt), ink = sky.dark ? '#18202c' : '#f3f0e6';
        const inner = style === 'classic' ? R * 0.88 : R;
        if (info.home) {
            g.beginPath();
            g.arc(cx, cy, R + pad * 0.6, 0, Math.PI * 2);
            g.strokeStyle = 'rgba(255,212,121,0.85)';
            g.lineWidth = Math.max(1.5, pad * 0.35);
            g.stroke();
        }
        // A soft shadow under the case.
        g.beginPath();
        g.arc(cx, cy + R * 0.03, R, 0, Math.PI * 2);
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fill();
        if (style === 'classic') {
            const brass = g.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
            brass.addColorStop(0, '#f6e3a8');
            brass.addColorStop(0.45, '#c39a4e');
            brass.addColorStop(0.55, '#a37c38');
            brass.addColorStop(1, '#f0d998');
            g.beginPath();
            g.arc(cx, cy, R, 0, Math.PI * 2);
            g.fillStyle = brass;
            g.fill();
        }
        const face = g.createLinearGradient(0, cy - inner, 0, cy + inner);
        face.addColorStop(0, WorldClockArt.css(sky.top));
        face.addColorStop(1, WorldClockArt.css(sky.bottom));
        g.beginPath();
        g.arc(cx, cy, inner, 0, Math.PI * 2);
        g.fillStyle = face;
        g.fill();
        g.save();
        g.clip();
        if (sky.stars > 0.02) {
            const rand = WorldClockArt.random([...info.id].reduce((h, ch) => h * 31 + ch.charCodeAt(0), 7));
            for (let i = 0; i < 40; i++) {
                const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * inner;
                g.fillStyle = `rgba(240,244,255,${sky.stars * (0.3 + rand() * 0.6)})`;
                g.beginPath();
                g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, Math.max(0.5, R * (0.006 + rand() * 0.01)), 0, Math.PI * 2);
                g.fill();
            }
        }
        // A sheen across the glass.
        const sheen = g.createLinearGradient(0, cy - inner, 0, cy);
        sheen.addColorStop(0, 'rgba(255,255,255,0.16)');
        sheen.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = sheen;
        g.beginPath();
        g.ellipse(cx, cy - inner * 0.45, inner * 0.85, inner * 0.55, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
        if (style === 'classic') {
            g.beginPath();
            g.arc(cx, cy, inner, 0, Math.PI * 2);
            g.strokeStyle = 'rgba(60,40,10,0.45)';
            g.lineWidth = Math.max(1, R * 0.012);
            g.stroke();
        } else if (style === 'modern') {
            g.beginPath();
            g.arc(cx, cy, R - Math.max(1, R * 0.01), 0, Math.PI * 2);
            g.strokeStyle = sky.dark ? 'rgba(20,30,44,0.28)' : 'rgba(255,255,255,0.28)';
            g.lineWidth = Math.max(1, R * 0.02);
            g.stroke();
        }
        // Markers.
        g.fillStyle = g.strokeStyle = ink;
        g.lineCap = 'round';
        for (let i = 0; i < 60; i++) {
            const a = i / 60 * Math.PI * 2 - Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a), hour = i % 5 === 0;
            if (style === 'classic') {
                const r0 = inner * (hour ? 0.88 : 0.93), r1 = inner * 0.98;
                g.lineWidth = Math.max(0.7, R * (hour ? 0.022 : 0.008));
                g.beginPath();
                g.moveTo(cx + ca * r0, cy + sa * r0);
                g.lineTo(cx + ca * r1, cy + sa * r1);
                g.stroke();
            } else if (style === 'modern' && hour) {
                const quarter = i % 15 === 0, r0 = R * (quarter ? 0.7 : 0.76), r1 = R * 0.9;
                g.lineWidth = Math.max(1.5, R * (quarter ? 0.06 : 0.04));
                g.beginPath();
                g.moveTo(cx + ca * r0, cy + sa * r0);
                g.lineTo(cx + ca * r1, cy + sa * r1);
                g.stroke();
            } else if (style === 'minimal' && hour) {
                g.beginPath();
                g.arc(cx + ca * R * 0.86, cy + sa * R * 0.86, Math.max(1, R * (i % 15 === 0 ? 0.03 : 0.018)), 0, Math.PI * 2);
                g.fill();
            }
        }
        if (style === 'classic' && D > 70) {
            const roman = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
            g.font = `500 ${R * 0.17}px ${WorldClockArt.SERIF}`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            roman.forEach((text, h) => {
                if (h === 6) return;   // the glyph's window sits there
                const a = h / 12 * Math.PI * 2 - Math.PI / 2;
                g.fillText(text, cx + Math.cos(a) * inner * 0.7, cy + Math.sin(a) * inner * 0.7);
            });
        }
        // Day or night, at six o'clock.
        const s = R * (style === 'minimal' ? 0.18 : 0.22);
        g.drawImage(WorldClockArt.glyph(info.phase, s * dpr, info.phase === 'day' ? (sky.dark ? '#d9831e' : '#ffd479') : ink), cx - s / 2, cy + R * 0.5 - s / 2, s, s);
        this.dials.set(info.id, { key, canvas: c, pad });
        return c;
    }

    hands(g, info, cx, cy, R) {
        const style = this.app.config.faceStyle, t = info.time, sky = WorldClockArt.sky(info.alt);
        const ink = sky.dark ? '#18202c' : '#f3f0e6';
        const s = this.app.config.seconds ? t.seconds : 0;
        const minute = (t.minutes + s / 60) / 60 * Math.PI * 2, hour = ((t.hours % 12) + t.minutes / 60 + s / 3600) / 12 * Math.PI * 2;
        const hand = (angle, length, width, tail, colour, shape) => {
            g.save();
            g.translate(cx, cy);
            g.rotate(angle);
            g.fillStyle = g.strokeStyle = colour;
            g.lineCap = 'round';
            if (shape === 'leaf') {
                g.beginPath();
                g.moveTo(0, tail * R);
                g.quadraticCurveTo(width * R * 1.4, -length * R * 0.45, 0, -length * R);
                g.quadraticCurveTo(-width * R * 1.4, -length * R * 0.45, 0, tail * R);
                g.fill();
            } else {
                g.lineWidth = Math.max(1, width * R);
                g.beginPath();
                g.moveTo(0, tail * R);
                g.lineTo(0, -length * R);
                g.stroke();
            }
            g.restore();
        };
        const shadow = 'rgba(0,0,0,0.22)', off = R * 0.025;
        const set = style === 'classic'
            ? [[hour, 0.5, 0.075, 0.08, 'leaf'], [minute, 0.76, 0.055, 0.1, 'leaf']]
            : style === 'modern' ? [[hour, 0.52, 0.075, 0.1, 'bar'], [minute, 0.8, 0.055, 0.12, 'bar']]
                : [[hour, 0.5, 0.035, 0, 'bar'], [minute, 0.8, 0.022, 0, 'bar']];
        g.save();
        g.translate(off * 0.5, off);
        for (const [a, l, w, tail, shape] of set) hand(a, l, w, tail, shadow, shape);
        g.restore();
        for (const [a, l, w, tail, shape] of set) hand(a, l, w, tail, ink, shape);
        if (this.app.config.seconds) {
            const a = s / 60 * Math.PI * 2;
            const colour = style === 'classic' ? '#c8372b' : sky.dark ? '#d9701f' : '#ffd479';
            hand(a, style === 'minimal' ? 0.86 : 0.84, style === 'minimal' ? 0.01 : 0.016, style === 'minimal' ? 0 : 0.2, colour, 'bar');
            if (style === 'classic') {
                g.save();
                g.translate(cx, cy);
                g.rotate(a);
                g.beginPath();
                g.arc(0, R * 0.16, R * 0.035, 0, Math.PI * 2);
                g.fillStyle = colour;
                g.fill();
                g.restore();
            }
        }
        g.beginPath();
        g.arc(cx, cy, R * (style === 'minimal' ? 0.025 : 0.04), 0, Math.PI * 2);
        g.fillStyle = style === 'classic' ? '#c9a14e' : ink;
        g.fill();
    }

    draw(g) {
        const app = this.app, { k, dpr, config } = app, infos = app.infos;
        if (!this.bg) this.drawBackground();
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.drawImage(this.bg, 0, 0);
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (!this.grid || this.grid.n !== infos.length) this.layout(infos.length);
        let bottom = 0;
        const out = [];
        infos.forEach((info, i) => {
            const { cx, cy, D, text } = this.cells[i];
            const dial = this.dial(info, D), pad = this.dials.get(info.id).pad;
            g.drawImage(dial, cx - D / 2 - pad, cy - D / 2 - pad, D + 2 * pad, D + 2 * pad);
            this.hands(g, info, cx, cy, D / 2);
            // The words: the name, the time, the day and the offset.
            const size = WorldClockArt.clamp(text * 0.3, 12 * k, 30 * k);
            let y = cy + D / 2 + 8 * k + size;
            g.textAlign = 'center';
            g.textBaseline = 'alphabetic';
            g.font = `600 ${size}px ${WorldClockArt.SANS}`;
            g.fillStyle = info.home ? '#ffd479' : '#eef3fb';
            g.fillText(info.name, cx, y);
            y += size * 1.12;
            g.font = `400 ${size * 0.92}px ${WorldClockArt.SANS}`;
            g.fillStyle = 'rgba(226,234,248,0.86)';
            g.fillText(info.text, cx, y);
            const details = [config.showDate ? info.date : info.dayWord];
            if (config.showOffset) details.push(info.offset);
            y += size * 1.0;
            g.font = `${size * 0.72}px ${WorldClockArt.SANS}`;
            g.fillStyle = info.dayDelta ? 'rgba(255,212,121,0.9)' : 'rgba(200,214,236,0.62)';
            g.fillText(details.join(' · '), cx, y);
            bottom = Math.max(bottom, y + size * 0.25);
            out.push({ id: info.id, cx, cy, r: D / 2, text: [info.name, info.text, details.join(' · ')].join(' | ') });
        });
        g.textAlign = 'left';
        this.shown = out;
        return { bottom, faces: out, columns: this.grid ? Math.round((this.cells.length && this.cells.filter(c => Math.abs(c.cy - this.cells[0].cy) < 1).length) || 0) : 0 };
    }

    hit(x, y) {
        const face = (this.shown || []).find(f => Math.hypot(x - f.cx, y - f.cy) <= f.r * 1.1);
        return face?.id || null;
    }
}
