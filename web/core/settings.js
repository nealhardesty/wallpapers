// Renders a wallpaper's settings schema (wallpapers/<id>/settings.js) into
// controls, for the panel (SPEC §4.4). Knows nothing about storage or the
// stage: it shows a config and reports patches.
//
//   const form = WP.renderSettings({ schema, defaults, config, onChange });
//   container.append(form.element);
//   form.update(config);            // after the config changes elsewhere
//
// Schema entries:
//   { group, advanced? }                                    a (collapsible) section
//   { key, label, type, help?, get?, set? }                 a setting; label may be a function
//   type 'range'   min, max, step, unit?, scale?, digits?   shown as value × scale, with unit
//   type 'select'  options: [[value, text]] or config => [[value, text]]
//   type 'toggle' | 'multi' (options) | 'colors' | 'number' (min, step) | 'text' (placeholder?) | 'color'
// get(config) reads an exotic value; set(config, value) returns the patch.
//
// Extras the running wallpaper drives (task 9.3). They have no key and are
// never saved; what they show comes from the wallpaper's feed (host.panel):
//   { type: 'action', name, label, primary? }    a button: onAction(name, inputs)
//   { type: 'status', name }                     a line of text, feed.status[name]:
//                                                a string, or { text, code } with a big code
//   { type: 'input', name, label, input? }       a field sent with every action, then cleared
// Any control may have when(config, feed), shown only while it's true, and
// a select's options(config, feed) may list what the wallpaper loaded.

(function (WP) {
    'use strict';

    const h = (tag, props = {}, ...children) => {
        const element = document.createElement(tag);
        for (const [name, value] of Object.entries(props)) {
            if (value === undefined || value === null || value === false) continue;
            if (name === 'class') element.className = value;
            else if (name.startsWith('on')) element.addEventListener(name.slice(2), value);
            else if (name in element && typeof value !== 'string') element[name] = value;
            else element.setAttribute(name, value === true ? '' : value);
        }
        element.append(...children.flat().filter(child => child !== null && child !== undefined && child !== false));
        return element;
    };
    WP.h = h;

    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const text = label => typeof label === 'function' ? label() : label;
    const read = (control, config) => control.get ? control.get(config) : config[control.key];
    const optionsOf = (control, config, feed = null) => typeof control.options === 'function' ? control.options(config, feed) : control.options;
    const EXTRAS = ['action', 'status', 'input'];

    // The value as the panel shows it: 0.7 with scale 100 and unit % is "70%".
    WP.formatSetting = (control, value, config = {}) => {
        if (control.type === 'range' || control.type === 'number') {
            const shown = (value * (control.scale ?? 1)).toFixed(control.digits ?? 0);
            return control.unit ? `${shown}${/^[a-z]/i.test(control.unit) && control.unit.length > 2 ? ' ' : ''}${control.unit}` : shown;
        }
        if (control.type === 'select') return optionsOf(control, config).find(([v]) => same(v, value))?.[1] ?? String(value);
        if (control.type === 'toggle') return value ? 'On' : 'Off';
        if (control.type === 'multi') return value.map(v => control.options.find(([o]) => o === v)?.[1] ?? v).join(', ');
        if (Array.isArray(value)) return value.join(' ');
        return String(value);
    };

    WP.renderSettings = ({ schema, defaults, config, onChange, onAction = () => {}, feed = null }) => {
        let current = config, fed = feed;
        const rows = [], extras = [];
        const root = h('div', { class: 'settings-form' });
        let section = root;
        let group = 0;

        const patch = (control, value) => onChange(control.set ? control.set(current, value) : { [control.key]: value });

        for (const control of schema) {
            if (control.group) {
                const details = h('details', { class: `settings-group${control.advanced ? ' advanced' : ''}`, open: !control.advanced },
                    h('summary', {}, control.group));
                root.append(details);
                section = details;
                group++;
                continue;
            }
            if (EXTRAS.includes(control.type)) {
                const extra = buildExtra(control, `extra-${control.name}-${group}`, () => {
                    const inputs = {};
                    for (const other of extras) if (other.control.type === 'input') { inputs[other.control.name] = other.value(); other.clear(); }
                    onAction(control.name, inputs);
                });
                section.append(extra.row);
                extras.push({ control, ...extra });
                continue;
            }
            const id = `setting-${control.key}-${group}`;
            const label = h('label', { for: id }, text(control.label));
            const reset = h('button', {
                class: 'setting-reset', type: 'button', hidden: true,
                onclick: () => patch(control, read(control, defaults)),
            });
            const readout = h('output', { class: 'setting-value', for: id });
            const help = control.help ? h('p', { class: 'setting-help' }, control.help) : null;
            const input = buildInput(control, id, value => patch(control, value));
            const row = h('div', { class: `setting setting-${control.type}`, 'data-key': control.key },
                h('div', { class: 'setting-head' }, reset, label, readout), input.element, help);
            section.append(row);
            rows.push({ control, row, label, reset, readout, input });
        }

        function update(config, feed = fed) {
            current = config;
            fed = feed;
            const shown = control => !control.when || !!control.when(config, feed);
            for (const extra of extras) {
                extra.row.hidden = !shown(extra.control);
                extra.set(feed);
            }
            for (const { control, row, label, reset, readout, input } of rows) {
                row.hidden = !shown(control);
                const value = read(control, config);
                const fallback = read(control, defaults);
                input.set(value, config, feed);
                label.textContent = text(control.label);
                readout.textContent = ['range', 'number'].includes(control.type) ? WP.formatSetting(control, value, config) : '';
                const changed = !same(value, fallback);
                reset.hidden = !changed;
                reset.title = `Reset to the default: ${WP.formatSetting(control, fallback, defaults)}`;
                reset.setAttribute('aria-label', `Reset ${text(control.label)} to ${WP.formatSetting(control, fallback, defaults)}`);
            }
        }
        update(config);
        return { element: root, update };
    };

    // Each input type: its element, and how to show a value in it.
    function buildInput(control, id, commit) {
        switch (control.type) {
            case 'range': {
                // --fill paints the track up to the thumb in the accent colour.
                const fill = () => input.style.setProperty('--fill', `${(input.value - control.min) / (control.max - control.min) * 100}%`);
                const input = h('input', { id, type: 'range', min: control.min, max: control.max, step: control.step,
                    oninput: () => { fill(); commit(parseFloat(input.value)); } });
                return { element: input, set: value => { if (document.activeElement !== input) input.value = value; fill(); } };
            }
            case 'number': {
                const input = h('input', { id, type: 'number', min: control.min, step: control.step ?? 1, inputmode: 'numeric',
                    onchange: () => commit(Number(input.value) || 0) });
                return { element: input, set: value => { if (document.activeElement !== input) input.value = value; } };
            }
            case 'select': {
                const select = h('select', { id, onchange: () => commit(select.options_[select.selectedIndex][0]) });
                return {
                    element: select,
                    set(value, config, feed) {
                        const options = optionsOf(control, config, feed);
                        if (!same(options, select.options_)) {
                            select.replaceChildren(...options.map(([, label], i) => h('option', { value: String(i) }, label)));
                            select.options_ = options;
                        }
                        select.selectedIndex = Math.max(0, options.findIndex(([v]) => same(v, value)));
                    },
                };
            }
            case 'toggle': {
                const button = h('button', { id, type: 'button', role: 'switch', class: 'switch',
                    onclick: () => commit(button.getAttribute('aria-checked') !== 'true') });
                return { element: button, set: value => button.setAttribute('aria-checked', String(!!value)) };
            }
            case 'multi': {
                let chosen = [];
                const chips = control.options.map(([value, label]) => h('button', {
                    type: 'button', class: 'chip',
                    onclick: () => {
                        const next = chosen.includes(value) ? chosen.filter(v => v !== value) : [...chosen, value];
                        if (next.length) commit(control.options.map(([v]) => v).filter(v => next.includes(v)));
                    },
                }, label));
                return {
                    element: h('div', { id, class: 'chips', role: 'group' }, chips),
                    set: value => {
                        chosen = value;
                        chips.forEach((chip, i) => chip.setAttribute('aria-pressed', String(value.includes(control.options[i][0]))));
                    },
                };
            }
            case 'colors': {
                const wrap = h('div', { id, class: 'swatches' });
                let colors = [];
                const render = () => wrap.replaceChildren(
                    ...colors.map((color, i) => h('span', { class: 'swatch' },
                        h('input', { type: 'color', value: color, 'aria-label': `Colour ${i + 1}`,
                            onchange: event => commit(colors.map((c, j) => j === i ? event.target.value : c)) }),
                        colors.length > 1 ? h('button', { type: 'button', class: 'swatch-remove', 'aria-label': `Remove colour ${i + 1}`,
                            onclick: () => commit(colors.filter((_, j) => j !== i)) }, '×') : null)),
                    colors.length < 8 ? h('button', { type: 'button', class: 'swatch-add', 'aria-label': 'Add a colour',
                        onclick: () => commit([...colors, colors[colors.length - 1] || '#ffffff']) }, '+') : null);
                return { element: wrap, set: value => { if (!same(value, colors)) { colors = [...value]; render(); } } };
            }
            case 'color': {
                const input = h('input', { id, type: 'color', onchange: () => commit(input.value) });
                return { element: input, set: value => { input.value = value; } };
            }
            default: {
                const input = h('input', { id, type: 'text', placeholder: control.placeholder, onchange: () => commit(input.value) });
                return { element: input, set: value => { if (document.activeElement !== input) input.value = value ?? ''; } };
            }
        }
    }

    // The wallpaper-driven extras: { row, set(feed), value?, clear? }.
    function buildExtra(control, id, run) {
        if (control.type === 'action') {
            const button = h('button', { id, type: 'button', class: `action${control.primary ? ' primary' : ''}`, onclick: run }, text(control.label));
            return { row: h('div', { class: 'setting-extra setting-action', 'data-name': control.name }, button), set: () => { button.textContent = text(control.label); } };
        }
        if (control.type === 'input') {
            const input = h('input', { id, type: control.input || 'text', autocomplete: 'off', spellcheck: false,
                onkeydown: event => { if (event.key === 'Enter') event.target.closest('.settings-form')?.querySelector('.setting-action:not([hidden]) .action.primary')?.click(); } });
            return {
                row: h('div', { class: 'setting-extra setting-input', 'data-name': control.name },
                    h('div', { class: 'setting-head' }, h('label', { for: id }, text(control.label))), input,
                    control.help ? h('p', { class: 'setting-help' }, control.help) : null),
                set: () => {},
                value: () => input.value,
                clear: () => { if (control.input === 'password') input.value = ''; },
            };
        }
        const line = h('p', { id, class: 'setting-status-text' });
        const code = h('output', { class: 'setting-code', 'aria-label': 'Code' });
        return {
            row: h('div', { class: 'setting-extra setting-status', 'data-name': control.name, 'aria-live': 'polite' }, line, code),
            set(feed) {
                const said = feed?.status?.[control.name];
                line.textContent = typeof said === 'string' ? said : said?.text || '';
                code.textContent = said?.code || '';
                code.hidden = !said?.code;
            },
        };
    }
})(globalThis.WP);
