// Frames for the Jellyfin wallpaper (SPEC §10.21 "Frames"): the art around
// the video. Each frame is one file in frames/, registered here:
//
//   JellyfinFrames.add({
//     id, name, icon,
//     layout(w, h, aspect, env)        → { screen: { x, y, w, h, radius }, ...whatever paint/tick need }
//                                        w, h: the viewport in CSS px; aspect: the video's (w / h).
//                                        The screen keeps that aspect (except 'none', which fits
//                                        the video inside it). Portrait gets its own arrangement.
//     paint(ctx, layout, env)          the still art, once per resize or title: everything but the
//                                        screen, which stays clear so the video shows through. Glass,
//                                        scanlines and glare may be drawn over it, translucent.
//     tick?(ctx, t, layout, env)       small moving bits on the overlay canvas, which the caller
//                                        has cleared; returns ms until it next needs a frame
//                                        (Infinity: nothing moves). Only while env.motion is true,
//                                        except for transitions.
//     transition?(kind, env)           'change' (between items), 'pause', 'play': start one;
//                                        tick draws it, and env.busy(ms) keeps frames coming
//     idle(ctx, layout, env, kind)     the screen when nothing plays: 'setup', 'connecting',
//                                        'offline', 'empty', 'loading', 'away' (another tab plays)
//     cue(ctx, text, layout, env)      a subtitle line, in the frame's style, inside the screen
//     titled?: true                    paint() shows env.title itself (a marquee, a plaque)
//     videoFilter?: 'sepia(0.3)'       a CSS filter on the <video> (effect 'videoFilter')
//   });
//
// env: { now: Date, title, quality, motion (frame motion is on), effects: Set,
//        insets, reducedMotion, random (seeded per item), busy(ms), video }
// Everything is drawn in CSS px; the canvases are already scaled for DPR.

const JellyfinFrames = (() => {
    'use strict';

    const frames = new Map();
    const add = frame => { frames.set(frame.id, frame); };
    const get = id => frames.get(id) || frames.get('none');

    // Seasonal: the mantel in winter, the drive-in in summer, else the old
    // TV (or whichever of those exists yet).
    function seasonal(date) {
        const month = date.getMonth();
        const pick = month === 11 || month <= 1 ? 'mantel' : month >= 5 && month <= 7 ? 'drive-in' : 'old-tv';
        return frames.has(pick) ? pick : 'old-tv';
    }

    // ---- Shared drawing helpers -------------------------------------------------

    // The largest rect of `aspect` inside a box, centred.
    function fit(box, aspect) {
        let w = box.w, h = w / aspect;
        if (h > box.h) { h = box.h; w = h * aspect; }
        return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
    }

    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
    }

    // Clear the screen's rect (rounded) out of whatever's been painted.
    function cutScreen(ctx, screen) {
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        roundRect(ctx, screen.x, screen.y, screen.w, screen.h, screen.radius || 0);
        ctx.fill();
        ctx.restore();
    }

    // A few tiles of TV snow, made once (getImageData is fine here, never per frame).
    let snowTiles = null;
    function snow() {
        if (snowTiles) return snowTiles;
        snowTiles = Array.from({ length: 4 }, () => {
            const tile = document.createElement('canvas');
            tile.width = tile.height = 96;
            const c = tile.getContext('2d');
            const image = c.createImageData(96, 96);
            for (let i = 0; i < image.data.length; i += 4) {
                const v = Math.random() < 0.5 ? Math.random() * 90 : 120 + Math.random() * 135;
                image.data[i] = image.data[i + 1] = image.data[i + 2] = v;
                image.data[i + 3] = 255;
            }
            c.putImageData(image, 0, 0);
            return tile;
        });
        return snowTiles;
    }

    // Snow over a rect: tiles at random offsets, scaled up a little so it's chunky.
    function drawSnow(ctx, rect, strength = 1) {
        const tiles = snow();
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(rect.x, rect.y, rect.w, rect.h, rect.radius || 0);
        ctx.clip();
        ctx.globalAlpha = strength;
        ctx.imageSmoothingEnabled = false;
        const size = 96 * 2;
        const ox = Math.random() * size, oy = Math.random() * size;
        for (let y = rect.y - oy; y < rect.y + rect.h; y += size) {
            for (let x = rect.x - ox; x < rect.x + rect.w; x += size) ctx.drawImage(tiles[(Math.random() * 4) | 0], x, y, size, size);
        }
        ctx.restore();
    }

    // Wrap text to a width: lines.
    function wrap(ctx, text, width) {
        const lines = [];
        for (const paragraph of String(text).split('\n')) {
            let line = '';
            for (const word of paragraph.split(/\s+/)) {
                const next = line ? `${line} ${word}` : word;
                if (ctx.measureText(next).width > width && line) { lines.push(line); line = word; } else line = next;
            }
            if (line) lines.push(line);
        }
        return lines;
    }

    // A subtitle cue as most frames draw it: wrapped, centred near the bottom
    // of the screen, on a box or with an outline.
    function drawCue(ctx, text, screen, { font = '600 {size}px system-ui, sans-serif', size = null, color = '#fff', box = 'rgba(0,0,0,0.55)', outline = null, bottom = 0.06 } = {}) {
        const px = size || Math.max(12, Math.min(34, screen.h * 0.055));
        ctx.save();
        ctx.font = font.replace('{size}', px.toFixed(1));
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        const lines = wrap(ctx, text, screen.w * 0.86);
        const lead = px * 1.25;
        let y = screen.y + screen.h - screen.h * bottom - (lines.length - 1) * lead;
        const cx = screen.x + screen.w / 2;
        for (const line of lines) {
            const w = ctx.measureText(line).width;
            if (box) {
                ctx.fillStyle = box;
                ctx.fillRect(cx - w / 2 - px * 0.35, y - px * 0.95, w + px * 0.7, px * 1.25);
            }
            if (outline) {
                ctx.lineJoin = 'round';
                ctx.lineWidth = px * 0.16;
                ctx.strokeStyle = outline;
                ctx.strokeText(line, cx, y);
            }
            ctx.fillStyle = color;
            ctx.fillText(line, cx, y);
            y += lead;
        }
        ctx.restore();
    }

    // A test card, for idle screens: colour bars, a circle, and a message.
    function testCard(ctx, screen, { title = 'NO SIGNAL', detail = '', font = 'ui-monospace, Menlo, monospace' } = {}) {
        const { x, y, w, h } = screen;
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, screen.radius || 0);
        ctx.clip();
        const bars = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];
        bars.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(x + (w * i) / 7, y, w / 7 + 1, h * 0.67); });
        const low = ['#0000c0', '#131313', '#c000c0', '#131313', '#00c0c0', '#131313', '#c0c0c0'];
        low.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(x + (w * i) / 7, y + h * 0.67, w / 7 + 1, h * 0.08); });
        ctx.fillStyle = '#101010';
        ctx.fillRect(x, y + h * 0.75, w, h * 0.25);
        ['#00214c', '#ffffff', '#32006a', '#101010', '#090909', '#1d1d1d'].forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(x + (w * i) / 8.5, y + h * 0.75, w / 8.5 + 1, h * 0.25); });
        const r = Math.min(w, h) * 0.3;
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = Math.max(1.5, r * 0.03);
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h * 0.42, r, 0, Math.PI * 2);
        ctx.stroke();
        const boxW = Math.min(w * 0.72, Math.max(w * 0.5, 260));
        const size = Math.max(11, Math.min(h * 0.07, boxW / (title.length * 0.7)));
        const small = Math.max(9, size * 0.42);
        ctx.font = `500 ${small}px ${font}`;
        const lines = detail ? wrap(ctx, detail, boxW * 0.9).slice(0, 3) : [];
        const boxH = size * 1.5 + lines.length * small * 1.35 + (lines.length ? size * 0.3 : 0);
        const top = y + h * 0.42 - boxH / 2;
        ctx.fillStyle = 'rgba(0,0,0,0.82)';
        ctx.fillRect(x + (w - boxW) / 2, top, boxW, boxH);
        ctx.fillStyle = '#f2f2f2';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `700 ${size}px ${font}`;
        ctx.fillText(title, x + w / 2, top + size * 0.85);
        ctx.font = `500 ${small}px ${font}`;
        ctx.fillStyle = '#bdbdbd';
        lines.forEach((line, i) => ctx.fillText(line, x + w / 2, top + size * 1.6 + small * 0.6 + i * small * 1.35));
        ctx.restore();
    }

    // The words for each idle state, for frames to use.
    const IDLE = {
        setup: ['NO SIGNAL', 'Open settings (,) to connect your Jellyfin server'],
        connecting: ['TUNING…', 'Looking for your server'],
        offline: ['NO SIGNAL', 'Your server isn’t answering; trying again'],
        signedout: ['NO SIGNAL', 'Sign in again in settings (,)'],
        empty: ['NOTHING ON', 'Nothing to play here; pick a playlist or library'],
        loading: ['PLEASE STAND BY', ''],
        away: ['ON ANOTHER TAB', 'Playing in another tab'],
        demo: ['NO SIGNAL', 'Connect your Jellyfin server in settings'],
    };

    return { add, get, has: id => frames.has(id), list: () => [...frames.values()], seasonal, fit, roundRect, cutScreen, drawSnow, wrap, drawCue, testCard, IDLE };
})();
