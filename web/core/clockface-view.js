// The clock overlay on screen (SPEC §4.9): one element over every wallpaper,
// built when the clock is on and gone when it's off. Draws what
// core/clockface.js works out, moves it, and hands the panel its section.
// The player (core/player.js) feeds it the time source, the host's insets,
// the power policy, the stage's quality and what the stage can see.
// Needs core/wp.js, core/settings.js (WP.h), clockface.js and clockface-settings.js.

(function (WP) {
    'use strict';

    const C = WP.clockface, { h } = WP;
    const KEY = 'wp:clock';
    const MOVING = new Set(['bounce', 'drift', 'follow']);
    const FPS = { low: 20, medium: 30, high: 0 };   // the tiers' caps (WP.TIERS); 0 is the display's rate
    const SHY_FADE = 0.15, NIGHT_DIM = 0.3;

    const settings = () => ({ defaults: WP.defaultsOf('clock'), schema: WP.schemaOf('clock') });
    // What's stored, made safe.
    C.load = () => { const { defaults, schema } = settings(); return C.sanitize(WP.mergeSettings(defaults, WP.store.get(KEY)), defaults, schema); };
    C.save = config => WP.store.set(KEY, WP.diffSettings(settings().defaults, config));

    const media = query => matchMedia(query);
    const view = C.view = {};

    // ---- State ----------------------------------------------------------------
    let env = null;                 // from the player: { now, insets, override, sample, track, wallpaper }
    let config = null;              // the stored settings, sanitised
    let el = null, face = null, lines = null, timeEl = null, dateEl = null, secondEl = null, secondParts = null;
    let box = { bw: 0, bh: 0 }, bounds = null, lastKey = '';
    let tier = 'high', economy = false, policyPause = false, paused = false, panelOpen = false, hidden = false;
    let chosen = null, lumaUnknown = false, hue = Math.random() * 360;
    let pointer = null, shy = false;
    let timer = 0, sampleTimer = 0, resizeTimer = 0;
    // raf: follow's frame loop; leg: the running compositor animation of bounce
    // or drift; x, y: where the box was last put.
    const motion = { raf: 0, last: 0, state: null, timer: 0, cell: -1, x: 0, y: 0, leg: null };
    let dragging = null;

    // The settings in force: the stored ones, under ?clock= for this load.
    const effective = () => {
        const override = env?.override();
        return override ? { ...config, enabled: override.enabled, ...(override.motion ? { motion: override.motion } : {}) } : config;
    };
    const reduced = () => !!env?.reduced?.();
    const glassOk = () => tier !== 'low' && !media('(prefers-reduced-transparency: reduce)').matches;
    const mode = () => {
        const wanted = effective().motion;
        if (!MOVING.has(wanted)) return wanted;
        return reduced() || economy ? 'static' : wanted;
    };
    // The settings as C.format reads them: no seconds on battery saver.
    const formatConfig = () => ({ ...effective(), seconds: effective().seconds && !economy });
    const adaptive = () => effective().colorMode === 'adaptive' || (effective().colorMode === 'invert' && tier === 'low');

    // ---- Building --------------------------------------------------------------
    function build() {
        timeEl = h('div', { class: 'clock-time' });
        dateEl = h('div', { class: 'clock-date' });
        secondParts = { label: h('span', { class: 'clock-second-label' }), time: h('span', { class: 'clock-second-time' }), day: h('span', { class: 'clock-second-day' }) };
        secondEl = h('div', { class: 'clock-second' }, secondParts.label, secondParts.time, secondParts.day);
        lines = h('div', { class: 'clock-lines' }, h('div', { class: 'clock-main' }, timeEl, dateEl), secondEl);
        face = h('div', { class: 'clock-face' }, lines);
        el = h('div', { id: 'clock', 'aria-hidden': 'true' }, face);
        face.addEventListener('pointerdown', dragStart);
        document.body.append(el);
    }

    function teardown() {
        stopMotion();
        env?.track(false);
        clearTimeout(timer);
        clearInterval(sampleTimer);
        clearTimeout(resizeTimer);
        timer = sampleTimer = 0;
        pointer = null;
        shy = false;
        el?.remove();
        el = face = lines = timeEl = dateEl = secondEl = secondParts = null;
        lastKey = '';
    }

    // ---- The words ----------------------------------------------------------
    const colons = text => text.split(':').flatMap((part, i) => i ? [h('span', { class: 'colon' }, ':'), part] : [part]);
    function dots(grid) {
        return h('div', { class: 'clock-bin' }, ...grid.map((column, i) => h('div', { class: `clock-bin-column${i === 2 || i === 4 ? ' apart' : ''}` },
            ...column.map(lamp => h('i', { class: lamp === null ? 'none' : lamp ? 'on' : 'off' })))));
    }

    // Redraw the text if it changed. True when it did.
    function renderText() {
        const out = C.format(env.now(), formatConfig());
        const key = JSON.stringify(out);
        if (key === lastKey) return false;
        lastKey = key;
        if (out.grid) timeEl.replaceChildren(dots(out.grid));
        else timeEl.replaceChildren(...colons(out.time));
        timeEl.classList.toggle('binary', !!out.grid);
        dateEl.textContent = out.sub;
        dateEl.hidden = !out.sub;
        secondEl.hidden = !out.second;
        if (out.second) {
            secondParts.label.textContent = out.second.label;
            secondParts.label.hidden = !out.second.label;
            secondParts.time.textContent = out.second.time;
            secondParts.day.textContent = out.second.day;
            secondParts.day.hidden = !out.second.day;
        }
        return true;
    }

    // ---- The look ------------------------------------------------------------
    const TIME_SCALE = { digital: 1, roman: 0.8, words: 0.42, binary: 1, hex: 1, beats: 1 };

    // The text colour right now.
    function fill() {
        const c = effective();
        if (c.bounceHue && mode() === 'bounce') return { color: C.hueColor(hue) };
        if (c.colorMode === 'invert' && tier !== 'low') return { color: '#ffffff', blend: true };
        if (adaptive()) return { color: chosen === 'dark' ? c.darkColor : c.lightColor };
        if (c.colorMode === 'gradient') return { color: c.color, color2: c.color2 };
        if (c.colorMode === 'daylight') { const p = C.parts(env.now(), c.zone); return { color: C.daylight(p.hour + p.minute / 60) }; }
        if (c.colorMode === 'drift') return { color: C.driftColor(env.now()) };
        return { color: c.color };
    }

    function restyleColor() {
        if (!face) return;
        const c = effective(), f = fill();
        const gradient = !!f.color2;
        // Neon's core is nearly white; its glow is the colour.
        const ink = c.effect === 'neon' && !f.blend ? C.mix(f.color.startsWith('#') ? f.color : '#ffffff', '#ffffff', 0.8) : f.color;
        face.style.setProperty('color', ink);
        face.classList.toggle('invert', !!f.blend);
        let layers = f.blend ? [] : C.effectLayers(c, f.color);
        // A scene the stage can't be read from still gets a shadow to stay legible.
        if (!layers.length && adaptive() && lumaUnknown && chosen === null) layers = C.effectLayers({ ...c, effect: 'soft' }, f.color);
        lines.classList.toggle('gradient', gradient);
        if (gradient) {
            lines.style.setProperty('--clock-gradient', `linear-gradient(135deg, ${f.color}, ${f.color2})`);
            lines.style.setProperty('text-shadow', 'none');
            lines.style.setProperty('--clock-box-shadow', 'none');
            lines.style.setProperty('filter', C.dropShadowCss(layers));
        } else {
            lines.style.removeProperty('--clock-gradient');
            lines.style.setProperty('text-shadow', C.shadowCss(layers));
            lines.style.setProperty('--clock-box-shadow', C.shadowCss(layers));
            lines.style.removeProperty('filter');
        }
        const stroke = c.outline > 0 && !f.blend;
        lines.style.setProperty('-webkit-text-stroke', stroke ? `${c.outline * 0.03}em ${c.outlineColor}` : '0');
        lines.style.setProperty('paint-order', stroke ? 'stroke fill' : 'normal');
    }

    // Everything that isn't a colour.
    function restyle() {
        if (!face) return;
        const c = effective();
        el.hidden = hidden;
        face.style.setProperty('--clock-font', C.fontFamily(c));
        face.style.setProperty('--clock-weight', c.weight);
        face.style.setProperty('--clock-spacing', `${c.spacing}em`);
        face.style.setProperty('--clock-opacity', c.opacity);
        face.style.setProperty('--clock-time-scale', TIME_SCALE[c.style] ?? 1);
        face.style.setProperty('--clock-second-scale', c.secondScale);
        const align = C.textAlign(c, mode());
        face.style.setProperty('--clock-align', align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center');
        face.style.setProperty('text-align', align);
        lines.classList.toggle('beside', c.secondPlace === 'beside');
        timeEl.classList.toggle('blink', c.blink && !reduced() && !economy);
        // The plate. Glass is a blend over a moving picture, so it's a Medium
        // effect: on Low it's a plain tint, as it is for reduced transparency.
        const blend = face.classList.contains('invert');
        const plate = blend ? 'none' : c.plate === 'glass' && !glassOk() ? 'tint' : c.plate;
        const strength = c.plate === 'glass' && plate === 'tint' ? Math.max(c.plateOpacity, 0.3) : c.plateOpacity;
        face.dataset.plate = plate;
        face.style.setProperty('--clock-plate', plate === 'tint' || plate === 'glass' ? C.alpha(c.plateColor, strength) : 'transparent');
        face.style.setProperty('--clock-plate-line', plate === 'line' ? C.alpha(c.plateColor, 0.9) : 'transparent');
        el.classList.toggle('moving', MOVING.has(mode()));
        face.style.setProperty('--clock-night', night() && c.nightMode === 'dim' ? NIGHT_DIM : 1);
        restyleColor();
    }

    // ---- Where it is -------------------------------------------------------
    const screen = () => ({ w: innerWidth, h: innerHeight });
    const padFor = m => Math.min(innerWidth, innerHeight) * (m === 'static' && effective().anchor !== 'custom' ? effective().margin : 2) / 100;

    function setPosition(x, y) {
        motion.x = x;
        motion.y = y;
        face.style.transform = mode() === 'static' ? move(Math.round(x), Math.round(y)) : move(x, y);
    }

    // Measure, shrink to fit a narrow screen, and (re)place the box.
    function layout() {
        if (!face || hidden) return;
        const c = effective(), insets = env.insets;
        const maxW = innerWidth - (insets.left || 0) - (insets.right || 0) - 2 * padFor(mode());
        const size = fit => face.style.setProperty('--clock-size', `${c.size * fit}vmin`);
        size(1);
        let bw = face.offsetWidth, bh = face.offsetHeight;
        if (bw > maxW && bw > 0 && maxW > 0) {
            size(maxW / bw);
            bw = face.offsetWidth;
            bh = face.offsetHeight;
        }
        box = { bw, bh };
        const before = bounds;
        bounds = C.bounds(screen(), box, insets, padFor(mode()));
        place();
        if (motion.leg && before && ['x0', 'y0', 'x1', 'y1'].some(k => Math.abs(before[k] - bounds[k]) > 0.5)) restartLeg();
        if (mode() === 'follow') followStart();
    }

    // Put the box where its mode says, without moving it on.
    function place() {
        if (!face || !bounds) return;
        const m = mode();
        if (m === 'static') {
            const c = effective();
            const point = c.anchor === 'custom' ? C.customPoint(c.x, c.y, bounds, screen(), box) : C.anchorPoint(c.anchor, bounds);
            setPosition(point.x, point.y);
        } else if (m === 'teleport' && motion.cell < 0) {
            jump(true);
        } else if (!motion.leg) {
            setPosition(Math.min(Math.max(motion.x, bounds.x0), bounds.x1), Math.min(Math.max(motion.y, bounds.y0), bounds.y1));
        }
    }

    // ---- Motion -------------------------------------------------------------
    // Bounce and drift run on the compositor: each leg (a straight run to a
    // wall, or twenty seconds of a path) is one animation of `transform`, so
    // between legs the page does nothing at all. Follow needs frames while it
    // catches up with a mouse, and stops asking for them once it has.
    const LEG = 20;   // seconds of a drift path per animation
    const move = (x, y) => `translate3d(${+x.toFixed(2)}px, ${+y.toFixed(2)}px, 0)`;

    // Where it is now, mid-leg or not.
    function currentPosition() {
        const leg = motion.leg;
        return leg ? leg.at((performance.now() - leg.began) / 1000) : { x: motion.x, y: motion.y };
    }

    function endLeg() {
        if (!motion.leg) return;
        const pos = currentPosition();
        motion.leg.anim.cancel();
        motion.leg = null;
        setPosition(pos.x, pos.y);
    }

    function stopMotion() {
        endLeg();
        cancelAnimationFrame(motion.raf);
        clearTimeout(motion.timer);
        motion.raf = motion.timer = 0;
        motion.state = null;
        face?.style.setProperty('--clock-fade', 1);
    }

    // Follow and Shy want to know where a mouse is, which the stage tells us
    // once asked. A stage forgets the ask when it's replaced, and can't hear
    // one before it has loaded, so this runs again whenever one is ready.
    function syncTrack() {
        env?.track(!!face && !hidden && !paused && (mode() === 'follow' || effective().shy));
    }

    const speedPx = () => 0.075 * Math.min(innerWidth, innerHeight) * effective().speed;

    // A leg is animated, then followed by the next one when it ends.
    function runLeg(frames, ms, at, ended) {
        const anim = face.animate(frames.map(p => ({ transform: move(p.x, p.y) })), { duration: ms, easing: 'linear', fill: 'forwards' });
        const old = motion.leg;
        motion.leg = { anim, began: performance.now(), at };
        old?.anim.cancel();
        anim.onfinish = () => {
            if (motion.leg?.anim !== anim) return;
            const last = frames[frames.length - 1];
            setPosition(last.x, last.y);
            anim.cancel();
            motion.leg = null;
            ended();
        };
    }

    function bounceLeg() {
        if (!face || mode() !== 'bounce' || paused || hidden) return;
        const s = motion.state, leg = C.bounceLeg(s, bounds);
        runLeg([leg.from, leg.to], leg.dt * 1000, t => C.bounceAt(s, t, bounds), () => {
            motion.state = leg.next;
            if ((leg.hit.x || leg.hit.y) && effective().bounceHue) { hue = (hue + 47) % 360; restyleColor(); }
            if (leg.hit.corner && effective().bounceFlash && !reduced()) flash();
            bounceLeg();
        });
    }

    function driftLeg() {
        if (!face || mode() !== 'drift' || paused || hidden) return;
        const c = effective(), s = motion.state;
        const start = s.t;
        const frames = C.driftFrames(c.path, start, c.speed, LEG).map(({ u, v }) => C.at(bounds, u, v));
        runLeg(frames, LEG * 1000, t => { const { u, v } = C.driftPoint(c.path, start + t * c.speed); return C.at(bounds, u, v); }, () => {
            s.t = start + LEG * c.speed;
            driftLeg();
        });
    }

    // The bounds changed under a running leg: carry on from where it is.
    function restartLeg() {
        const m = mode();
        if (m !== 'bounce' && m !== 'drift') return;
        const pos = currentPosition(), s = motion.state, elapsed = motion.leg ? (performance.now() - motion.leg.began) / 1000 : 0;
        if (m === 'bounce') {
            // Keep its heading: the way it's actually going, from the old box.
            const old = motion.leg, ahead = old ? old.at(elapsed + 0.01) : pos;
            const x = Math.min(Math.max(pos.x, bounds.x0), bounds.x1), y = Math.min(Math.max(pos.y, bounds.y0), bounds.y1);
            motion.state = { u: x, v: y, vx: Math.abs(s.vx) * (ahead.x < pos.x ? -1 : 1), vy: Math.abs(s.vy) * (ahead.y < pos.y ? -1 : 1) };
        } else {
            s.t += elapsed * effective().speed;
        }
        const leg = motion.leg;
        motion.leg = null;
        leg?.anim.cancel();
        setPosition(pos.x, pos.y);
        if (m === 'bounce') bounceLeg(); else driftLeg();
    }

    // Follow: ease towards the pointer (or home), and stop once it's there.
    function followFrame(now) {
        motion.raf = 0;
        const c = effective(), gap = FPS[tier] ? 1000 / FPS[tier] : 0;
        if (gap && now - motion.last < gap - 2) { motion.raf = requestAnimationFrame(followFrame); return; }
        const dt = Math.min(0.1, Math.max(0, (now - motion.last) / 1000));
        motion.last = now;
        const home = c.anchor === 'custom' ? C.customPoint(c.x, c.y, bounds, screen(), box) : C.anchorPoint(c.anchor, bounds);
        const want = pointer ? { x: pointer.x + 28, y: pointer.y + 28 } : home;
        const target = { x: Math.min(Math.max(want.x, bounds.x0), bounds.x1), y: Math.min(Math.max(want.y, bounds.y0), bounds.y1) };
        const next = C.stepFollow({ x: motion.x, y: motion.y }, dt, target, c.speed);
        if (Math.hypot(target.x - next.x, target.y - next.y) < 0.25) { setPosition(target.x, target.y); return; }
        setPosition(next.x, next.y);
        motion.raf = requestAnimationFrame(followFrame);
    }
    function followStart() {
        if (motion.raf || mode() !== 'follow' || !face || paused || hidden) return;
        motion.last = performance.now();
        motion.raf = requestAnimationFrame(followFrame);
    }

    function flash() {
        lines.classList.remove('pop');
        void lines.offsetWidth;
        lines.classList.add('pop');
    }

    // Teleport: another cell of the screen, never the same twice running.
    function jump(first = false) {
        const go = () => {
            motion.cell = C.pickCell(motion.cell, Math.random);
            const p = C.cellPoint(motion.cell, bounds, Math.random);
            setPosition(p.x, p.y);
            sampleSoon(400);
        };
        if (first || effective().teleportFade === 'instant' || reduced()) { go(); return; }
        face.style.setProperty('--clock-fade', 0);
        clearTimeout(motion.timer);
        motion.timer = setTimeout(() => { if (!face) return; go(); face.style.setProperty('--clock-fade', 1); }, 320);
    }
    function teleportNext() {
        clearTimeout(motion.timer);
        motion.timer = setTimeout(() => {
            if (!face || mode() !== 'teleport') return;
            jump();
            teleportNext();
        }, C.teleportDelay(effective().teleportEvery, env.now()));
    }

    // Start whatever the mode needs, and stop everything else.
    function syncMotion() {
        stopMotion();
        if (!face || paused || hidden || !bounds) return;
        const m = mode(), c = effective();
        el.classList.toggle('moving', MOVING.has(m));
        el.classList.toggle('editing', panelOpen && m === 'static');
        if (m === 'bounce') { motion.state = C.bounceStart(bounds, Math.random, speedPx()); setPosition(motion.state.u, motion.state.v); bounceLeg(); }
        else if (m === 'drift') { motion.state = { t: env.now().getTime() / 1000 }; driftLeg(); }
        else if (m === 'follow') {
            const home = c.anchor === 'custom' ? C.customPoint(c.x, c.y, bounds, screen(), box) : C.anchorPoint(c.anchor, bounds);
            setPosition(home.x, home.y);
            followStart();
        }
        else if (m === 'teleport') { if (motion.cell < 0) jump(true); teleportNext(); }
        else place();
        syncTrack();
    }

    // ---- Dragging it into place, while the panel is open ------------------------
    function dragStart(event) {
        if (!face || !panelOpen || mode() !== 'static' || (event.button && event.button > 0)) return;
        event.preventDefault();
        face.setPointerCapture(event.pointerId);
        dragging = { dx: event.clientX - motion.x, dy: event.clientY - motion.y };
        el.classList.add('dragging');
        face.addEventListener('pointermove', dragMove);
        face.addEventListener('pointerup', dragEnd);
        face.addEventListener('pointercancel', dragEnd);
    }
    function dragMove(event) {
        if (!dragging) return;
        const x = Math.min(Math.max(event.clientX - dragging.dx, bounds.x0), bounds.x1);
        const y = Math.min(Math.max(event.clientY - dragging.dy, bounds.y0), bounds.y1);
        setPosition(x, y);
    }
    function dragEnd() {
        if (!dragging) return;
        dragging = null;
        el.classList.remove('dragging');
        face.removeEventListener('pointermove', dragMove);
        face.removeEventListener('pointerup', dragEnd);
        face.removeEventListener('pointercancel', dragEnd);
        const centre = C.centreOf({ x: motion.x, y: motion.y }, screen(), box);
        view.patch({ anchor: 'custom', x: +centre.x.toFixed(2), y: +centre.y.toFixed(2) });
    }

    // ---- The time, once it changes ---------------------------------------------------
    function visible() {
        const c = effective();
        if (!c.enabled) return false;
        const id = env.wallpaper?.();
        if (id && c.hideOn.includes(id)) return false;
        return true;
    }

    function night() {
        const c = effective();
        if (c.nightMode === 'off') return false;
        const p = C.parts(env.now(), c.zone);
        return C.inNight(p.hour * 60 + p.minute, C.parseHM(c.nightFrom, 22 * 60), C.parseHM(c.nightTo, 6 * 60));
    }

    // Is it showing at all? Hidden over some wallpapers, and at night if asked.
    function decide() {
        const dark = night(), c = effective();
        const next = !visible() || (dark && c.nightMode === 'hide');
        face?.style.setProperty('--clock-night', dark && c.nightMode === 'dim' ? NIGHT_DIM : 1);
        if (next !== hidden) {
            hidden = next;
            if (el) el.hidden = hidden;
            if (!hidden) { layout(); syncMotion(); syncSampling(); } else { stopMotion(); syncSampling(); }
        }
    }

    function tick() {
        clearTimeout(timer);
        if (!face) return;
        if (!paused) {
            decide();
            if (!hidden) {
                const changed = renderText();
                if (['daylight', 'drift'].includes(effective().colorMode)) restyleColor();
                if (changed) layout();
            }
        }
        schedule();
    }
    function schedule() {
        clearTimeout(timer);
        if (!face || paused) return;
        timer = setTimeout(tick, Math.max(40, C.nextChange(env.now(), formatConfig())) + 20);
    }

    // ---- Reading the wallpaper under it (adaptive colour) ---------------------------
    function sampleNow() {
        if (!face || hidden || paused || !adaptive()) return;
        const r = face.getBoundingClientRect();
        env.sample({ x: r.left / innerWidth, y: r.top / innerHeight, w: r.width / innerWidth, h: r.height / innerHeight });
    }
    function sampleSoon(ms = 600) { if (face && adaptive()) setTimeout(sampleNow, ms); }
    function syncSampling() {
        clearInterval(sampleTimer);
        sampleTimer = 0;
        if (face && !hidden && !paused && adaptive()) { sampleTimer = setInterval(sampleNow, 2000); sampleNow(); }
    }

    // ---- What the player tells it -------------------------------------------------
    view.init = environment => { env = environment; panelOpen = !!WP.panel?.isOpen; };
    view.ready = () => !!env;
    Object.defineProperties(view, {
        active: { get: () => !!face && !hidden },
        enabled: { get: () => !!env && !!config && effective().enabled },
        box: { get: () => face && { ...box, ...currentPosition() } },
    });

    // New settings (the panel, another tab, a key): build, restyle or remove.
    view.apply = next => {
        config = next;
        if (!effective().enabled) { teardown(); hidden = false; return; }
        if (!el) build();
        panelOpen = !!WP.panel?.isOpen;
        hidden = !visible() || (night() && effective().nightMode === 'hide');
        chosen = adaptive() ? chosen : null;
        lastKey = '';
        restyle();
        if (!hidden) { renderText(); layout(); }
        syncMotion();
        syncSampling();
        schedule();
    };

    // The panel's drag, or a setting changed from here.
    view.patch = patch => {
        config = { ...config, ...patch };
        C.save(config);
        view.apply(config);
        document.dispatchEvent(new CustomEvent('wp-clock', { detail: { config } }));
    };

    view.setPolicy = policy => {
        const low = policy.ceiling === 'low', pause = !!policy.pause;
        if (low === economy && pause === policyPause) return;
        economy = low;
        policyPause = pause;
        paused = policyPause || document.hidden;
        if (!face) return;
        lastKey = '';
        restyle();
        if (!paused) { tick(); layout(); }
        syncMotion();
        syncSampling();
    };

    view.setQuality = next => {
        if (!FPS.hasOwnProperty(next) || next === tier) return;
        tier = next;
        if (!face) return;
        restyle();
        syncMotion();
        syncSampling();
    };

    view.setWallpaper = () => {
        if (!face) return;
        decide();
        sampleSoon(900);
        sampleSoon(2500);
    };
    view.stageReady = () => { syncTrack(); sampleSoon(500); };

    view.onLuma = value => {
        if (!face) return;
        lumaUnknown = typeof value !== 'number';
        const before = chosen;
        chosen = C.pick(chosen, value);
        if (chosen !== before || lumaUnknown) restyleColor();
    };

    // The stage's pointer, for follow and shy: viewport pixels; -1 is "left".
    view.onPointer = (x, y) => {
        if (!face) return;
        pointer = x < 0 ? null : { x, y };
        followStart();
        if (effective().shy) {
            const at = currentPosition();
            const near = pointer && pointer.x > at.x - box.bh * 1.5 && pointer.x < at.x + box.bw + box.bh * 1.5
                && pointer.y > at.y - box.bh * 1.5 && pointer.y < at.y + box.bh * 2.5;
            if (!!near !== shy) { shy = !!near; face.style.setProperty('--clock-shy', shy ? SHY_FADE : 1); }
        }
    };

    document.addEventListener('wp-panel', event => {
        panelOpen = !!event.detail?.open;
        if (!face) return;
        el.classList.toggle('editing', panelOpen && mode() === 'static');
    });
    window.addEventListener('resize', () => {
        if (!face) return;
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => { layout(); }, 100);
    });
    document.addEventListener('visibilitychange', () => {
        if (!env || !face) return;
        paused = policyPause || document.hidden;
        if (!paused) { lastKey = ''; tick(); layout(); }
        syncMotion();
        syncSampling();
    });
    media('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => { if (face) { restyle(); syncMotion(); } });

    // ---- The panel's section -----------------------------------------------------
    // A collapsed "🕐 Clock" with the settings form in it: one row while it's off.
    C.section = ({ onChange }) => {
        let current = C.load();
        const title = h('summary', {});
        const root = h('details', { class: 'settings-group clock-section' }, title);
        const { defaults, schema } = settings();
        const form = WP.renderSettings({
            schema, defaults, config: current,
            onChange: patch => {
                current = { ...current, ...patch };
                C.save(current);
                form.update(current);
                head();
                onChange(current);
                undo.hidden = !WP.diffSettings(defaults, current);
                undo.classList.remove('confirm');
                undo.textContent = 'Put the clock back';
            },
        });
        const head = () => title.replaceChildren('🕐 Clock', h('span', { class: 'settings-hint' }, C.summaryOf(current)));
        const undo = h('button', { type: 'button', class: 'action clock-reset', onclick: () => {
            if (!undo.classList.contains('confirm')) {
                undo.classList.add('confirm');
                undo.textContent = 'Put the clock back? Click again';
                setTimeout(() => { undo.classList.remove('confirm'); undo.textContent = 'Put the clock back'; }, 4000);
                return;
            }
            WP.store.set(KEY, null);
            current = C.load();
            form.update(current);
            head();
            onChange(current);
            undo.hidden = true;
        } }, 'Put the clock back');
        undo.hidden = !WP.diffSettings(defaults, current);
        head();
        root.append(form.element, h('div', { class: 'clock-actions' }, undo));
        // Dragging the clock changes x, y and the anchor from outside the form.
        document.addEventListener('wp-clock', event => { current = event.detail.config; form.update(current); head(); undo.hidden = !WP.diffSettings(defaults, current); });
        return {
            element: root,
            update(next) { current = next || C.load(); form.update(current); head(); undo.hidden = !WP.diffSettings(defaults, current); },
        };
    };
})(globalThis.WP);
