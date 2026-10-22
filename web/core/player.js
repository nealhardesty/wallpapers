// The player: index.html. Decides which wallpaper to show, runs it in a
// stage iframe, crossfades between them, and owns the global keys. Talks to
// the stage only through postMessage (see core/stage.js).

(function (WP) {
    'use strict';

    const params = WP.parseParams(location.search);
    const host = params.host === 'android' ? 'android'
        : location.protocol === 'chrome-extension:' ? 'extension' : 'standalone';
    const FADE_MS = 600;

    let choice = null;   // what the user picked: a wallpaper id or 'seasonal'
    let stage = null;    // { id, frame, ready }
    let settingsOnReady = params.panel === 'open';
    let tier = WP.resolveTier({ override: params.tier, mode: WP.store.get('wp:performance')?.mode, host });

    const resolve = id => id === 'seasonal' ? WP.seasonalFor(new Date()) : id;
    const usable = id => WP.entry(id) && !WP.entry(id).disabled;

    // ?w= wins for this page load only; otherwise the saved choice, and
    // Seasonal on first run.
    function initialChoice() {
        if (params.w) {
            if (usable(params.w)) return params.w;
            console.warn(`wallpapers: ignoring unknown or disabled w=${params.w}`);
        }
        const saved = WP.store.get('wp:current');
        return usable(saved) ? saved : 'seasonal';
    }

    function stageUrl(id) {
        const query = new URLSearchParams({ w: id });
        for (const key of ['date', 'theme', 'host', 'tier', 'hud']) if (params[key]) query.set(key, params[key]);
        return `stage.html?${query}`;
    }

    // renderScale: lay the stage out smaller and scale it up, so every
    // wallpaper renders fewer pixels without knowing it.
    function scale(frame) {
        const s = tier.renderScale;
        frame.style.width = `${s * 100}%`;
        frame.style.height = `${s * 100}%`;
        frame.style.transform = s === 1 ? '' : `scale(${1 / s})`;
    }

    function mount(id) {
        const previous = stage;
        const frame = document.createElement('iframe');
        frame.className = 'stage entering';
        frame.title = WP.entry(id).name;
        frame.src = stageUrl(id);
        scale(frame);
        document.body.appendChild(frame);
        const mounted = stage = { id, frame, ready: false };

        const reveal = () => {
            if (mounted.revealed) return;
            mounted.revealed = true;
            frame.classList.remove('entering');
            if (previous) setTimeout(() => previous.frame.remove(), FADE_MS + 50);
        };
        mounted.reveal = reveal;
        // A wallpaper that never reports ready still gets shown.
        setTimeout(reveal, 4000);
    }

    function show(next, { persist = false } = {}) {
        choice = next;
        if (persist) {
            WP.store.set('wp:current', next);
            // A pick from the keyboard or panel replaces a ?w= override, so
            // a reload shows what was picked.
            if (params.w) {
                delete params.w;
                const url = new URL(location.href);
                url.searchParams.delete('w');
                history.replaceState(null, '', url);
            }
        }
        const id = resolve(next);
        if (!stage || stage.id !== id) mount(id);
    }

    function label(id) {
        const entry = WP.entry(id);
        if (id !== 'seasonal') return `${entry.icon} ${entry.name}`;
        const now = WP.entry(resolve(id));
        return `${entry.icon} ${entry.name} · ${now.icon} ${now.name}`;
    }

    function cycle(step) {
        const order = ['seasonal', ...WP.showable().map(entry => entry.id)];
        const next = order[(order.indexOf(choice) + step + order.length) % order.length];
        show(next, { persist: true });
        toast(label(next));
    }

    const post = message => stage?.frame.contentWindow?.postMessage(message, '*');

    function openSettings() {
        stage.frame.focus();
        post({ wp: 'settings' });
    }

    function setTier(name) {
        if (!WP.TIERS[name]) return;
        tier = WP.TIERS[name];
        scale(stage.frame);
        post({ wp: 'tier', tier: name });
    }

    function toggleFullscreen() {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen().catch(() => {});
    }

    function key(name) {
        if (name === ',') openSettings();
        else if (name === '[') cycle(-1);
        else if (name === ']') cycle(1);
        else if (name === 'f' || name === 'F') toggleFullscreen();
    }

    let toastTimer = null;
    function toast(text, ms = 1600) {
        const element = document.getElementById('toast');
        element.textContent = text;
        element.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => element.classList.remove('show'), ms);
    }

    window.addEventListener('message', event => {
        const message = event.data;
        if (!stage || event.source !== stage.frame.contentWindow || !message?.wp) return;
        if (message.wp === 'ready') {
            stage.ready = true;
            stage.reveal();
            if (settingsOnReady) {
                settingsOnReady = false;
                openSettings();
            }
        } else if (message.wp === 'key') {
            key(message.key);
        } else if (message.wp === 'error') {
            console.error(`wallpapers: ${message.id} failed: ${message.message}`);
            toast(`⚠️ ${WP.entry(message.id).name} failed to start`, 4000);
            stage.reveal();
        }
    });

    window.addEventListener('keydown', event => {
        if (event.ctrlKey || event.metaKey || event.altKey || event.target.closest?.('input, select, textarea')) return;
        key(event.key);
    });

    // Seasonal rolls over by itself, at most a minute late.
    setInterval(() => {
        if (choice === 'seasonal' && stage && resolve('seasonal') !== stage.id) mount(resolve('seasonal'));
    }, 60 * 1000);

    WP.player = {
        start() {
            show(initialChoice());
            if (!WP.store.get('wp:hinted') && !params.w) {
                WP.store.set('wp:hinted', true);
                toast('Press , for settings · [ and ] to switch wallpapers', 5000);
            }
        },
        show: (id, options) => show(id, options),
        cycle,
        setTier,
        get choice() { return choice; },
        get stage() { return stage && { id: stage.id, ready: stage.ready }; },
        get tier() { return tier.tier; },
    };
})(globalThis.WP);
