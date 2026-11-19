// The panel: pick a wallpaper and tune it, over the live wallpaper (SPEC
// §4.4). Lives in the player page, so it survives stage restarts. It edits
// settings directly (localStorage is shared with the stage) and asks the
// player to apply them. Built on first open, so a new tab stays light.

(function (WP) {
    'use strict';

    const { h } = WP;
    const MONTH = () => new Date().toLocaleDateString(undefined, { month: 'long' });
    const TIER_NOTES = {
        auto: 'The best this device can manage, adjusted as it goes.',
        low: 'Half resolution, 20 frames a second: easiest on batteries.',
        medium: 'Three-quarter resolution, 30 frames a second.',
        high: 'Full resolution, every frame the display shows.',
    };

    const COST_TITLES = { 1: 'Light on batteries', 2: 'Moderate on batteries', 3: 'Heavy on batteries: try Low on a phone' };

    // The gallery's filter chips, all read from the catalog. Seasonal is a
    // choice that changes by itself, so only All shows it.
    const FILTERS = [
        ['all', 'All', () => true],
        ['interactive', 'Interactive', entry => !!entry.interactive],
        ['calm', 'Calm', entry => entry.motion === 'slow'],
        ['live', 'Live data', entry => !!entry.network],
        ['light', 'Easy on battery', entry => WP.costs?.[entry.id] === 1],
    ];
    // Keys that keep their player meaning in the gallery rather than starting a search.
    const PLAYER_KEYS = [',', '?', '[', ']'];

    let panel = null, picker = null, title = null, subtitle = null, body = null, tierButtons = null, tierNote = null, resetButton = null;
    let liveLine = null, batterySwitch = null;
    let switcher = null, switcherThumb = null, scroller = null;
    let gallery = null, search = null, chips = null, empty = null, filter = 'all', browsing = false;
    let clockHost = null, clockSection = null;   // the clock overlay's settings (SPEC §4.9): a collapsed row at the top of the settings, loaded on first open
    let shownFor = null;   // the wallpaper whose settings are on screen
    let place = null;      // the location controls, for wallpapers that need one (core/location.js)
    let shownForm = null;  // { form, config: () => config }, so the wallpaper's feed can update it
    const loaded = {};     // id → Promise for its defaults.js and settings.js

    const script = src => new Promise(resolve => {
        const element = h('script', { src });
        element.onload = element.onerror = resolve;
        document.head.append(element);
    });
    // settingsScripts (catalog): data the schema is built from, such as World
    // Clock's cities, loaded first.
    const load = id => loaded[id] ??= (async () => {
        for (const file of WP.entry(id)?.settingsScripts || []) await script(`wallpapers/${file}`);
        for (const file of ['defaults.js', 'settings.js']) await script(`wallpapers/${id}/${file}`);
    })();

    function build() {
        // The header is the switcher: what's showing, ‹ › to step, and a
        // click opens the gallery in place of the settings.
        title = h('span', { class: 'panel-title', id: 'panel-title' });
        subtitle = h('span', { class: 'panel-subtitle' });
        switcherThumb = h('span', { class: 'switcher-thumb', 'aria-hidden': 'true' });
        switcher = h('button', {
            type: 'button', class: 'switcher', 'aria-expanded': 'false', 'aria-controls': 'gallery',
            onclick: () => browse(!browsing),
        }, switcherThumb, h('span', { class: 'switcher-text' }, title, subtitle), h('span', { class: 'switcher-chevron', 'aria-hidden': 'true' }));
        const step = (by, label, glyph) => h('button', { type: 'button', class: 'step', 'aria-label': label, title: label, onclick: () => WP.player.cycle(by) }, glyph);

        const showable = [WP.entry('seasonal'), ...WP.showable()];
        search = h('input', {
            type: 'search', class: 'gallery-search', placeholder: `Search ${showable.length - 1} wallpapers`, 'aria-label': 'Search wallpapers',
            autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'go', oninput: filterTiles,
        });
        chips = h('div', { class: 'gallery-chips', role: 'radiogroup', 'aria-label': 'Show' }, FILTERS.map(([name, label]) => h('button', {
            type: 'button', class: 'chip', role: 'radio', 'data-filter': name,
            onclick: () => { filter = name; filterTiles(); },
        }, label, ' ', h('span', { class: 'chip-count' }))));
        picker = h('div', { class: 'picker', role: 'group', 'aria-label': 'Wallpapers' });
        empty = h('p', { class: 'gallery-empty', hidden: true });
        gallery = h('div', { class: 'gallery', id: 'gallery', hidden: true },
            h('div', { class: 'gallery-bar' },
                h('div', { class: 'gallery-find' },
                    search,
                    h('button', { type: 'button', class: 'surprise', title: 'Surprise me: any of the ones shown', 'aria-label': 'Surprise me', onclick: surprise }, '🎲')),
                chips),
            picker, empty);
        body = h('div', { class: 'settings' });
        clockHost = h('div', { class: 'clock-host' });

        tierButtons = ['auto', 'low', 'medium', 'high'].map(mode => h('button', {
            type: 'button', role: 'radio', 'data-mode': mode,
            onclick: () => { WP.player.setMode(mode); renderTier(); },
        }, mode[0].toUpperCase() + mode.slice(1)));
        tierNote = h('p', { class: 'tier-note' });
        liveLine = h('p', { class: 'tier-live', 'aria-live': 'off' });
        batterySwitch = h('button', {
            type: 'button', role: 'switch', class: 'switch', id: 'battery-aware',
            onclick: () => { WP.player.setBatteryAware(batterySwitch.getAttribute('aria-checked') !== 'true'); renderTier(); },
        });

        resetButton = h('button', { type: 'button', class: 'action', onclick: confirmReset });
        const importInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: importSettings });

        panel = h('aside', { class: 'panel', id: 'panel', role: 'dialog', 'aria-labelledby': 'panel-title', hidden: true },
            h('header', { class: 'panel-head' },
                switcher,
                h('div', { class: 'stepper' }, step(-1, 'Previous wallpaper (←)', '‹'), step(1, 'Next wallpaper (→)', '›')),
                h('button', { class: 'panel-close', type: 'button', 'aria-label': 'Close settings (Esc)', onclick: () => close() }, '×')),
            scroller = h('div', { class: 'panel-scroll' }, gallery, clockHost, body),
            h('footer', { class: 'panel-foot' },
                h('div', { class: 'tier' },
                    h('span', { class: 'tier-label', id: 'tier-label' }, 'Performance'),
                    h('div', { class: 'segmented', role: 'radiogroup', 'aria-labelledby': 'tier-label' }, tierButtons),
                    tierNote,
                    liveLine,
                    h('label', { class: 'battery', for: 'battery-aware' }, 'Save power on battery'),
                    batterySwitch),
                h('div', { class: 'actions' },
                    // Only in the Android app's settings screen.
                    window.WallpapersApp?.canSetWallpaper?.()
                        ? h('button', { type: 'button', class: 'action primary', onclick: () => window.WallpapersApp.setWallpaper() }, 'Set as wallpaper')
                        : null,
                    resetButton,
                    h('button', { type: 'button', class: 'action', title: 'Save every wallpaper’s settings to a file', onclick: exportSettings }, 'Export'),
                    h('button', { type: 'button', class: 'action', title: 'Load settings from an exported file', onclick: () => importInput.click() }, 'Import'),
                    importInput),
                h('p', { class: 'keys keys-settings' },
                    h('span', {}, h('kbd', {}, '←'), ' ', h('kbd', {}, '→'), ' switch'),
                    h('span', {}, h('kbd', {}, '?'), ' all keys'),
                    h('span', {}, h('kbd', {}, 'Esc'), ' close')),
                h('p', { class: 'keys keys-gallery' },
                    h('span', {}, 'type to search'),
                    h('span', {}, h('kbd', {}, '←'), h('kbd', {}, '↑'), h('kbd', {}, '↓'), h('kbd', {}, '→'), ' move'),
                    h('span', {}, h('kbd', {}, 'Enter'), ' pick'),
                    h('span', {}, h('kbd', {}, 'Esc'), ' back')),
                h('p', { class: 'about' }, `Wallpapers ${WP.VERSION}`)));

        for (const entry of showable) {
            const seasonal = entry.id === 'seasonal';
            const pick = seasonal ? WP.entry(WP.seasonalFor(new Date())) : null;
            const tile = h('button', {
                type: 'button', class: 'tile', 'data-id': entry.id, title: seasonal ? `Seasonal: ${pick.name} this ${MONTH()}` : entry.name,
                style: `--tile-accent: ${entry.accent || '#8ab4ff'}`,
                onclick: () => choose(entry.id),
                onpointerenter: () => preview(tile, entry.id), onpointerleave: endPreview,
                onfocus: () => preview(tile, entry.id), onblur: endPreview,
            }, h('span', { class: 'tile-icon', 'aria-hidden': 'true' }, entry.icon),
            h('span', { class: 'tile-name' }, entry.name, seasonal ? h('span', { class: 'tile-sub' }, `${MONTH()}: ${pick.name}`) : null),
            h('span', { class: 'tile-meta' },
                entry.interactive ? h('span', { title: 'Responds to you' }, '👆') : null,
                entry.network ? h('span', { title: entry.offline ? 'Live data when online' : 'Needs the internet' }, '📡') : null,
                // How hard it works a phone, from make bench (wallpapers/costs.js).
                WP.costs?.[entry.id] ? h('span', { class: 'tile-cost', title: COST_TITLES[WP.costs[entry.id]] }, '⚡'.repeat(WP.costs[entry.id])) : null));
            tile.search = `${entry.name} ${entry.id.replace(/-/g, ' ')} ${pick ? pick.name : ''}`.toLowerCase();
            tile.entry = entry;
            picker.append(tile);
            thumb(seasonal ? pick.id : entry.id).then(src => {
                if (!src) return;
                tile.style.backgroundImage = `linear-gradient(to top, rgba(0, 0, 0, 0.7), transparent 62%), url(${src})`;
                tile.classList.add('has-thumb');
            });
        }
        document.body.append(panel);
    }

    // The committed thumbnail, if this wallpaper has one (SPEC §4.7): a
    // promise for its URL, or null. Every offline wallpaper with code has
    // one (tested); Blank and the network-backed Bing don't.
    const thumbs = {};
    function thumb(id) {
        const entry = WP.entry(id);
        if (!entry.scripts?.length || (entry.network && !entry.offline)) return Promise.resolve(null);
        return thumbs[id] ??= new Promise(resolve => {
            const src = `wallpapers/${id}/thumb.webp`;
            const image = new Image();
            image.onload = () => resolve(src);
            image.onerror = () => resolve(null);
            image.src = src;
        });
    }

    // ---- The gallery ------------------------------------------------------
    // The panel widens into a grid of every wallpaper, in place of the
    // settings. Search and the chips narrow it; a pick goes back to settings.
    function browse(on) {
        if (!panel || browsing === on) return;
        browsing = on;
        endPreview();
        panel.classList.toggle('browsing', on);
        gallery.hidden = !on;
        clockHost.hidden = body.hidden = on;
        switcher.setAttribute('aria-expanded', String(on));
        switcher.title = on ? 'Back to the settings (Esc)' : 'All wallpapers';
        scroller.scrollTop = 0;
        if (!on) {
            refresh();
            return switcher.focus({ preventScroll: true });
        }
        search.value = '';
        refresh();
        filterTiles();   // the last chip stays chosen, unless it would hide what's on
        if (picker.querySelector('[aria-pressed="true"]')?.hidden) { filter = 'all'; filterTiles(); }
        const current = picker.querySelector('[aria-pressed="true"]') || picker.firstChild;
        // After the panel has widened, so the grid is laid out at its size.
        requestAnimationFrame(() => {
            current.scrollIntoView({ block: 'center' });
            current.focus({ preventScroll: true });
        });
    }

    // Which tiles the search and the chip leave, with each chip's count for this search.
    function filterTiles() {
        const words = search.value.toLowerCase().split(/\s+/).filter(Boolean);
        const counts = {};
        let shown = 0;
        for (const tile of picker.children) {
            const found = words.every(word => tile.search.includes(word));
            const pseudo = tile.entry.pseudo;
            for (const [name, , test] of FILTERS) if (found && (name === 'all' || (!pseudo && test(tile.entry)))) counts[name] = (counts[name] || 0) + 1;
            const test = FILTERS.find(([name]) => name === filter)[2];
            tile.hidden = !(found && (filter === 'all' || (!pseudo && test(tile.entry))));
            if (!tile.hidden) shown++;
        }
        for (const chip of chips.children) {
            chip.setAttribute('aria-checked', String(chip.dataset.filter === filter));
            chip.querySelector('.chip-count').textContent = counts[chip.dataset.filter] || 0;
        }
        empty.hidden = shown > 0;
        if (!shown) {
            const label = FILTERS.find(([name]) => name === filter)[1];
            empty.replaceChildren(words.length ? `Nothing called “${search.value.trim()}”${filter === 'all' ? '' : ` in ${label}`}. ` : `Nothing in ${label}. `,
                h('button', { type: 'button', class: 'action', onclick: () => { search.value = ''; filter = 'all'; filterTiles(); search.focus(); } }, 'Show them all'));
        }
    }

    const visibleTiles = () => [...picker.children].filter(tile => !tile.hidden);

    function choose(id) {
        WP.player.show(id, { persist: true });
        browse(false);
    }

    // Any of the tiles shown, other than the one on screen.
    function surprise() {
        const pool = visibleTiles().filter(tile => tile.dataset.id !== WP.player.choice && !tile.entry.pseudo);
        if (!pool.length) return;
        const tile = pool[Math.floor(Math.random() * pool.length)];
        tile.classList.add('picked');
        choose(tile.dataset.id);
        WP.player.toast(`🎲 ${tile.entry.icon} ${tile.entry.name}`);
        setTimeout(() => tile.classList.remove('picked'), 600);
    }

    // Arrow keys move around the grid as it's laid out.
    function move(name) {
        const tiles = visibleTiles();
        if (!tiles.length) return;
        const at = tiles.indexOf(document.activeElement);
        if (at < 0) return tiles[0].focus();
        const columns = tiles.filter(tile => tile.offsetTop === tiles[0].offsetTop).length || 1;
        const to = at + { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[name];
        if (name === 'ArrowUp' && to < 0) return search.focus();
        const tile = tiles[Math.max(0, Math.min(tiles.length - 1, to))];
        tile.focus({ preventScroll: true });
        tile.scrollIntoView({ block: 'nearest' });
    }

    // The player's keys come here first while the gallery is open (true:
    // handled). Typing anywhere goes to the search; Esc steps back.
    function key(name, event) {
        if (!browsing) return false;
        const inSearch = event?.target === search;
        if (name === 'Escape') {
            if (inSearch && search.value) { search.value = ''; filterTiles(); }
            else browse(false);
            return true;
        }
        if (inSearch) {
            if (name === 'ArrowDown') { event.preventDefault(); visibleTiles()[0]?.focus(); }
            if (name === 'Enter') { const first = visibleTiles()[0]; if (first) choose(first.dataset.id); }
            return true;   // everything else is typing
        }
        if (name.startsWith('Arrow')) {
            event?.preventDefault();
            move(name);
            return true;
        }
        if (name === '/' || (name.length === 1 && name !== ' ' && !PLAYER_KEYS.includes(name) && !event?.target?.closest?.('input, select, textarea'))) {
            if (name === '/') event?.preventDefault();
            search.focus();   // during keydown, so the character lands in the field
            return true;
        }
        return false;
    }

    // Hovering or focusing a tile for a moment plays that wallpaper inside
    // it: the real stage, small and at the low tier. One at a time, never
    // on Android or with reduced motion.
    let previewTimer = null, previewFrame = null;
    function preview(tile, id) {
        endPreview();
        const target = id === 'seasonal' ? WP.seasonalFor(new Date()) : id;
        if (target === WP.player.resolved || (WP.entry(target).network && !WP.entry(target).offline) || WP.player.host === 'android'
            || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        previewTimer = setTimeout(() => {
            previewFrame = h('iframe', {
                class: 'tile-preview', tabindex: '-1', 'aria-hidden': 'true',
                src: `stage.html?w=${target}&thumb=1&tier=low&seed=7`,
            });
            tile.append(previewFrame);
        }, 450);
    }
    function endPreview() {
        clearTimeout(previewTimer);
        previewFrame?.remove();
        previewFrame = null;
    }

    // Header, picker and settings for what the player is showing now.
    async function refresh() {
        if (!panel) return;
        const choice = WP.player.choice;
        const id = WP.player.resolved;
        const entry = WP.entry(id);
        panel.style.setProperty('--accent', entry.accent || '#8ab4ff');
        title.textContent = `${entry.icon} ${entry.name}`;
        const order = [...picker.children].map(tile => tile.dataset.id);
        subtitle.textContent = browsing ? 'Back to its settings'
            : choice === 'seasonal' ? `Seasonal pick for ${MONTH()}`
            : `${order.indexOf(choice)} of ${order.length - 1} · all wallpapers`;
        switcherThumb.textContent = entry.icon;
        switcherThumb.classList.remove('has-thumb');
        switcherThumb.style.backgroundImage = '';
        thumb(id).then(src => {
            if (!src || WP.player.resolved !== id) return;
            switcherThumb.style.backgroundImage = `url(${src})`;
            switcherThumb.classList.add('has-thumb');
        });
        for (const tile of picker.children) tile.setAttribute('aria-pressed', String(tile.dataset.id === choice));
        resetButton.textContent = 'Reset';
        resetButton.title = `Put ${entry.name} back to its defaults`;
        resetButton.classList.remove('confirm');
        resetButton.hidden = !entry.scripts?.length;
        renderTier();
        clockControls();

        if (shownFor === id) return place?.update();
        shownFor = id;
        place = null;
        shownForm = null;
        body.replaceChildren();
        if (!entry.scripts?.length) {
            body.append(h('p', { class: 'settings-note' }, `${entry.name} has nothing to adjust.`));
            return;
        }
        await load(id);
        if (shownFor !== id) return;
        const defaults = WP.defaultsOf(id), schema = WP.schemaOf(id);
        if (!defaults || !schema) {
            body.append(h('p', { class: 'settings-note' }, `${entry.name}’s settings couldn’t be loaded.`));
            return;
        }
        let config = WP.mergeSettings(defaults, WP.store.get(`wp:${id}`));
        const form = WP.renderSettings({
            schema, defaults, config, feed: WP.player.feed,
            onChange: patch => {
                config = { ...config, ...patch };
                WP.store.set(`wp:${id}`, WP.diffSettings(defaults, config));
                form.update(config);
                resetButton.classList.remove('confirm');
                WP.player.applySettings(id, config);
            },
            onAction: (name, inputs) => WP.player.action(id, name, inputs),
        });
        shownForm = { form, config: () => config };
        // Where you are, for wallpapers that need it (SPEC §10.1), above their settings.
        if (entry.needs?.includes('location')) {
            if (!WP.locationControls) await script('core/location.js');
            if (shownFor !== id) return;
            place = WP.locationControls({ entry, onChange: () => WP.player.relocate() });
            body.append(place.element);
        }
        if (choice === 'seasonal') body.append(h('p', { class: 'settings-note' }, `These are ${entry.name}’s own settings; Seasonal uses them whenever it shows ${entry.name}.`));
        body.append(form.element);
    }

    // The clock's section: its code comes in the first time the panel opens.
    async function clockControls() {
        if (clockSection) return clockSection.update();
        await WP.loadClock();
        if (!panel || clockSection) return;
        clockSection = WP.clockface.section({ onChange: config => WP.clockface.view.apply(config) });
        clockHost.append(clockSection.element);
    }

    function renderTier() {
        const mode = WP.store.get('wp:performance')?.mode || 'auto';
        for (const button of tierButtons) button.setAttribute('aria-checked', String(button.dataset.mode === mode));
        tierNote.textContent = TIER_NOTES[mode];
        batterySwitch.setAttribute('aria-checked', String(WP.store.get('wp:performance')?.batteryAware !== false));
        if (WP.player.stats) stats(WP.player.stats);
    }

    // What the stage is doing right now, from its once-a-second report.
    function stats(report) {
        if (panel && !panel.hidden) liveLine.textContent = `⚡ ${WP.player.describe(report)}`;
    }

    // Reset takes two clicks, with no dialog to block the wallpaper.
    function confirmReset() {
        const id = WP.player.resolved;
        if (!resetButton.classList.contains('confirm')) {
            resetButton.classList.add('confirm');
            resetButton.textContent = `Reset ${WP.entry(id).name}? Click again`;
            setTimeout(() => { if (resetButton.classList.contains('confirm')) refresh(); }, 4000);
            return;
        }
        WP.store.set(`wp:${id}`, null);
        shownFor = null;
        WP.player.applySettings(id, WP.mergeSettings(WP.defaultsOf(id), null));
        refresh();
    }

    // What a wallpaper keeps that must never leave this device (a sign-in
    // token): its catalog `secrets`, never exported, never imported.
    const secret = key => WP.catalog.some(entry => entry.secrets?.some(name => key === `wp:${entry.id}:${name}`));

    function exportSettings() {
        const settings = {};
        for (const key of Object.keys(localStorage)) if (key.startsWith('wp:') && key !== 'wp:hinted' && !secret(key)) settings[key] = WP.store.get(key);
        const file = new Blob([JSON.stringify({ app: 'wallpapers', version: 1, exported: new Date().toISOString(), settings }, null, 2)], { type: 'application/json' });
        const link = h('a', { href: URL.createObjectURL(file), download: 'wallpapers-settings.json' });
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }

    async function importSettings(event) {
        const [file] = event.target.files;
        event.target.value = '';
        if (!file) return;
        try {
            const data = JSON.parse(await file.text());
            let entries, message = 'Settings imported';
            if (data?.app === 'wallpapers' && typeof data.settings === 'object') {
                entries = data.settings;
            } else {
                // The old homepage's storage (README, "Moving from the old homepage").
                if (!WP.importLegacy) await script('core/legacy.js');
                if (!WP.isLegacyDump(data)) throw new Error('not a settings file from here or from the old homepage');
                await Promise.all(WP.catalog.filter(entry => entry.scripts?.length).map(entry => load(entry.id)));
                const imported = WP.importLegacy(data.localStorage || data, {
                    defaultsOf: WP.defaultsOf, schemaOf: WP.schemaOf, usable: id => !!WP.entry(id) && !WP.entry(id).disabled,
                });
                entries = imported.entries;
                message = describeImport(imported.report);
            }
            for (const [key, value] of Object.entries(entries)) if (key.startsWith('wp:') && !secret(key)) WP.store.set(key, value);
            // Said after the reload, which starts everything with the new settings.
            try { sessionStorage.setItem('wp:toast', message); } catch {}
            location.reload();
        } catch (error) {
            WP.player.toast(`Couldn’t import: ${error.message}`, 4000);
        }
    }

    function describeImport({ wallpapers, settings, current, skipped, leftBehind }) {
        const names = wallpapers.map(id => WP.entry(id).name);
        const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
        let text = settings
            ? `From the old homepage: ${settings} changed setting${settings === 1 ? '' : 's'}, for ${list}.`
            : 'From the old homepage: no changed settings.';
        if (current) text += ` Your wallpaper, ${WP.entry(current).name}, is back.`;
        if (skipped.length) text += ` ${skipped.length} had no place here.`;
        if (leftBehind.length) text += ` Its ${leftBehind.join(' and ')} stayed behind.`;
        if (skipped.length) console.info('wallpapers: not imported:', skipped.join(', '));
        return text;
    }

    function open({ gallery: browsing = false } = {}) {
        if (!panel) build();
        panel.hidden = false;
        document.dispatchEvent(new CustomEvent('wp-panel', { detail: { open: true } }));
        shownFor = null;   // keys may have changed settings while it was closed
        refresh();
        if (browsing) browse(true);
        else switcher.focus({ preventScroll: true });
    }

    function close() {
        if (!panel || panel.hidden) return;
        browse(false);
        endPreview();
        panel.hidden = true;
        document.dispatchEvent(new CustomEvent('wp-panel', { detail: { open: false } }));
        WP.player.focusStage();
    }

    // The running wallpaper's latest feed (host.panel): statuses, loaded
    // options, what to show.
    function feed(state) {
        if (panel && shownForm && shownFor === WP.player.stage?.id) shownForm.form.update(shownForm.config(), state);
    }

    WP.panel = {
        open,
        close,
        toggle: () => (panel && !panel.hidden ? close() : open()),
        refresh,
        stats,
        feed,
        key,
        browse,
        get isOpen() { return !!panel && !panel.hidden; },
        get browsing() { return browsing; },
        contains: node => !!panel && panel.contains(node),
    };
})(globalThis.WP);
