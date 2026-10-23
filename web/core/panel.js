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

    let panel = null, picker = null, title = null, subtitle = null, body = null, tierButtons = null, tierNote = null, resetButton = null;
    let liveLine = null, batterySwitch = null;
    let shownFor = null;   // the wallpaper whose settings are on screen
    const loaded = {};     // id → Promise for its defaults.js and settings.js

    const load = id => loaded[id] ??= (async () => {
        for (const file of ['defaults.js', 'settings.js']) {
            await new Promise(resolve => {
                const script = h('script', { src: `wallpapers/${id}/${file}` });
                script.onload = script.onerror = resolve;
                document.head.append(script);
            });
        }
    })();

    function build() {
        title = h('h2', { class: 'panel-title', id: 'panel-title' });
        subtitle = h('p', { class: 'panel-subtitle' });
        picker = h('div', { class: 'picker', role: 'group', 'aria-label': 'Wallpapers' });
        body = h('div', { class: 'settings' });

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
                h('div', {}, title, subtitle),
                h('button', { class: 'panel-close', type: 'button', 'aria-label': 'Close settings (Esc)', onclick: () => close() }, '×')),
            h('div', { class: 'panel-scroll' }, picker, body),
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
                h('p', { class: 'keys' },
                    h('span', {}, h('kbd', {}, '←'), ' ', h('kbd', {}, '→'), ' switch'),
                    h('span', {}, h('kbd', {}, '?'), ' all keys'),
                    h('span', {}, h('kbd', {}, 'Esc'), ' close'))));
        // A vertical wheel scrolls the filmstrip sideways.
        picker.addEventListener('wheel', event => {
            if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
            picker.scrollLeft += event.deltaY;
            event.preventDefault();
        }, { passive: false });

        for (const entry of [WP.entry('seasonal'), ...WP.showable()]) {
            const tile = h('button', {
                type: 'button', class: 'tile', 'data-id': entry.id, title: entry.name,
                style: `--tile-accent: ${entry.accent || '#8ab4ff'}`,
                onclick: () => WP.player.show(entry.id, { persist: true }),
                onpointerenter: () => preview(tile, entry.id), onpointerleave: endPreview,
                onfocus: () => preview(tile, entry.id), onblur: endPreview,
            }, h('span', { class: 'tile-icon', 'aria-hidden': 'true' }, entry.icon), h('span', { class: 'tile-name' }, entry.name),
            // How hard it works a phone, from make bench (wallpapers/costs.js).
            WP.costs?.[entry.id] ? h('span', { class: 'tile-cost', title: COST_TITLES[WP.costs[entry.id]] }, '⚡'.repeat(WP.costs[entry.id])) : null);
            picker.append(tile);
            thumb(tile, entry.id === 'seasonal' ? WP.seasonalFor(new Date()) : entry.id);
        }
        document.body.append(panel);
    }

    // The committed thumbnail, if this wallpaper has one (SPEC §4.7).
    // Seasonal shows this month's pick and keeps its calendar badge.
    function thumb(tile, id) {
        // Every offline wallpaper with code has one (tested); Blank and the
        // network-backed Bing don't.
        const entry = WP.entry(id);
        if (!entry.scripts?.length || entry.network) return;
        const src = `wallpapers/${id}/thumb.webp`;
        const image = new Image();
        image.onload = () => {
            tile.style.backgroundImage = `linear-gradient(to top, rgba(0, 0, 0, 0.65), transparent 60%), url(${src})`;
            tile.classList.add('has-thumb');
        };
        image.src = src;
    }

    // Hovering or focusing a tile for a moment plays that wallpaper inside
    // it: the real stage, small and at the low tier. One at a time, never
    // on Android or with reduced motion.
    let previewTimer = null, previewFrame = null;
    function preview(tile, id) {
        endPreview();
        const target = id === 'seasonal' ? WP.seasonalFor(new Date()) : id;
        if (target === WP.player.resolved || WP.entry(target).network || WP.player.host === 'android'
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
        subtitle.textContent = choice === 'seasonal' ? `Seasonal pick for ${MONTH()}` : '';
        subtitle.hidden = choice !== 'seasonal';
        for (const tile of picker.children) {
            const active = tile.dataset.id === choice;
            tile.setAttribute('aria-pressed', String(active));
            if (active) tile.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'instant' });
        }
        resetButton.textContent = 'Reset';
        resetButton.title = `Put ${entry.name} back to its defaults`;
        resetButton.classList.remove('confirm');
        resetButton.hidden = !entry.scripts?.length;
        renderTier();

        if (shownFor === id) return;
        shownFor = id;
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
            schema, defaults, config,
            onChange: patch => {
                config = { ...config, ...patch };
                WP.store.set(`wp:${id}`, WP.diffSettings(defaults, config));
                form.update(config);
                resetButton.classList.remove('confirm');
                WP.player.applySettings(id, config);
            },
        });
        if (choice === 'seasonal') body.append(h('p', { class: 'settings-note' }, `These are ${entry.name}’s own settings; Seasonal uses them whenever it shows ${entry.name}.`));
        body.append(form.element);
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

    function exportSettings() {
        const settings = {};
        for (const key of Object.keys(localStorage)) if (key.startsWith('wp:') && key !== 'wp:hinted') settings[key] = WP.store.get(key);
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
            if (data?.app !== 'wallpapers' || typeof data.settings !== 'object') throw new Error('not a wallpapers settings file');
            for (const [key, value] of Object.entries(data.settings)) if (key.startsWith('wp:')) WP.store.set(key, value);
            location.reload();
        } catch (error) {
            WP.player.toast(`Couldn’t import: ${error.message}`, 4000);
        }
    }

    function open() {
        if (!panel) build();
        panel.hidden = false;
        shownFor = null;   // keys may have changed settings while it was closed
        refresh();
        (picker.querySelector('[aria-pressed="true"]') || picker.firstChild).focus({ preventScroll: true });
    }

    function close() {
        if (!panel || panel.hidden) return;
        endPreview();
        panel.hidden = true;
        WP.player.focusStage();
    }

    WP.panel = {
        open,
        close,
        toggle: () => (panel && !panel.hidden ? close() : open()),
        refresh,
        stats,
        get isOpen() { return !!panel && !panel.hidden; },
        contains: node => !!panel && panel.contains(node),
    };
})(globalThis.WP);
