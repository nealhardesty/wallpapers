// The clock overlay's settings (SPEC §4.9): defaults and the panel's schema,
// in the same format as a wallpaper's, stored under wp:clock. Off by default.
// Needs core/wp.js and core/clockface.js.
(function (WP) {
    'use strict';
    const C = WP.clockface;

    WP.defaults('clock', {
        configVersion: 1,
        enabled: false,
        style: 'digital',
        date: 'medium',
        motion: 'static',
        size: 7,
        colorMode: 'solid',
        color: '#ffffff',
        // Format
        hour12: 'auto',
        seconds: false,
        meridiem: 'upper',
        pad: false,
        blink: false,
        extras: [],
        zone: 'local',
        dateCase: 'normal',
        // The second clock
        secondOn: false,
        secondZone: 'UTC',
        secondLabel: 'auto',
        secondScale: 0.5,
        secondPlace: 'below',
        secondDay: true,
        // Style (the looks set these together)
        font: 'system',
        fontCustom: '',
        weight: 300,
        spacing: 0,
        opacity: 0.9,
        color2: '#7dd3fc',
        lightColor: '#ffffff',
        darkColor: '#111111',
        effect: 'soft',
        effectColor: '#000000',
        effectSize: 3,
        outline: 0,
        outlineColor: '#000000',
        plate: 'none',
        plateColor: '#000000',
        plateOpacity: 0.35,
        // Position and motion
        anchor: 'bottom-left',
        x: 0.08,
        y: 0.92,
        margin: 4,
        speed: 1,
        path: 'wander',
        bounceHue: false,
        bounceFlash: true,
        teleportEvery: 'minute',
        teleportFade: 'fade',
        // Advanced
        align: 'auto',
        shy: false,
        nightMode: 'off',
        nightFrom: '22:00',
        nightTo: '06:00',
        hideOn: [],
    });

    const on = c => c.enabled;
    const zones = () => [['local', 'This device’s time'], ...C.zones().map(zone => [zone, zone.replace(/_/g, ' ')])];
    const motionLabels = { static: 'Still', drift: 'Drift', bounce: 'Bounce', teleport: 'Teleport', follow: 'Follow' };
    const styles = [['digital', '🔢 Digital'], ['words', '💬 Words'], ['roman', '🏛️ Roman'], ['binary', '💡 Binary'], ['hex', '🧮 Hexadecimal'], ['beats', '🌐 Swatch beats']];
    const motions = [['static', '📍 Still'], ['drift', '🌊 Drift'], ['bounce', '🏓 Bounce'], ['teleport', '✨ Teleport'], ['follow', '🐾 Follow the pointer']];

    // What the section's title says at a glance.
    C.summaryOf = config => config.enabled
        ? [styles.find(([id]) => id === config.style)?.[1].replace(/^\S+ /, ''), motionLabels[config.motion], config.secondOn ? '+ 2nd zone' : null].filter(Boolean).join(' · ')
        : 'off';

    WP.schema('clock', [
        { key: 'enabled', label: 'Show a clock', type: 'toggle', help: 'Over every wallpaper. K turns it on and off.' },
        { key: 'preset', label: 'Look', type: 'select', derived: true, when: on,
          options: [...Object.entries(C.PRESETS).map(([id, { label }]) => [id, label]), ['custom', 'Custom']],
          get: config => C.presetOf(config),
          set: (config, id) => ({ ...(C.PRESETS[id]?.patch ?? {}) }) },
        { key: 'style', label: 'Time', type: 'select', when: on, options: styles },
        { key: 'date', label: 'Date', type: 'select', when: on,
          options: [['none', 'No date'], ['weekday', 'Weekday'], ['short', 'Short (Oct 28)'], ['medium', 'Weekday and short (Wed, Oct 28)'], ['long', 'Long (Wednesday, October 28)'], ['numeric', 'Numbers (by locale)'], ['iso', 'ISO (2026-10-28)']] },
        { key: 'motion', label: 'Position', type: 'select', when: on, options: motions },
        { key: 'size', label: 'Size', type: 'range', min: 2, max: 30, step: 0.5, unit: '%', digits: 1, when: on, help: 'Of the screen’s shorter side.' },
        { key: 'colorMode', label: 'Colour', type: 'select', when: on,
          options: [['solid', '🎨 One colour'], ['adaptive', '🌗 Adaptive: light or dark to suit the wallpaper'], ['gradient', '🌈 Gradient'], ['daylight', '🌅 Follows the time of day'], ['drift', '🎡 Slowly shifting hue'], ['invert', '⚡ Inverted against what’s behind']] },
        { key: 'color', label: 'Colour', type: 'color', when: c => on(c) && c.colorMode === 'solid' },

        { group: '🕰️ Format', collapsed: true, when: on,
          summary: c => [c.hour12 === 'auto' ? null : `${c.hour12}h`, c.seconds ? 'seconds' : null, c.extras.length ? `${c.extras.length} extra${c.extras.length === 1 ? '' : 's'}` : null, c.zone === 'local' ? null : C.city(c.zone)].filter(Boolean).join(' · ') },
        { key: 'hour12', label: 'Hours', type: 'select', options: [['auto', 'As this device does'], ['12', '12-hour'], ['24', '24-hour']] },
        { key: 'seconds', label: 'Show seconds', type: 'toggle', when: c => C.showsSeconds({ ...c, seconds: true }), help: 'Wakes the screen once a second; hidden on battery saver.' },
        { key: 'meridiem', label: 'AM and PM as', type: 'select', when: c => c.hour12 !== '24' && c.style === 'digital', options: [['upper', 'PM'], ['lower', 'pm'], ['short', 'P'], ['none', 'Nothing']] },
        { key: 'pad', label: 'Leading zero on the hour', type: 'toggle', when: c => c.style === 'digital' },
        { key: 'blink', label: 'Blink the colon', type: 'toggle', when: c => ['digital', 'roman'].includes(c.style) },
        { key: 'extras', label: 'Also show', type: 'multi', empty: true, options: C.EXTRAS, help: 'Added to the date line.' },
        { key: 'dateCase', label: 'Date line', type: 'select', options: [['normal', 'As written'], ['upper', 'UPPER CASE'], ['lower', 'lower case']] },
        { key: 'zone', label: 'Timezone', type: 'select', options: zones, help: 'Swatch beats ignore this.' },

        { group: '🌍 Second clock', collapsed: true, when: on, summary: c => c.secondOn ? C.city(c.secondZone) : '' },
        { key: 'secondOn', label: 'Add a smaller clock for another timezone', type: 'toggle' },
        { key: 'secondZone', label: 'Timezone', type: 'select', options: zones, when: c => c.secondOn },
        { key: 'secondLabel', label: 'Name it by', type: 'select', when: c => c.secondOn, options: [['auto', 'The city (or UTC)'], ['offset', 'Its offset from UTC'], ['none', 'Nothing']] },
        { key: 'secondScale', label: 'Size', type: 'range', min: 0.3, max: 1, step: 0.05, unit: '×', digits: 2, when: c => c.secondOn },
        { key: 'secondPlace', label: 'Placed', type: 'select', when: c => c.secondOn, options: [['below', 'Below'], ['beside', 'Beside']] },
        { key: 'secondDay', label: 'Say “tomorrow” or “yesterday” when the date differs', type: 'toggle', when: c => c.secondOn },

        { group: '🎨 Style', collapsed: true, when: on,
          summary: c => `${C.PRESETS[C.presetOf(c)]?.label ?? 'Custom'}` },
        { key: 'font', label: 'Font', type: 'select', help: 'System fonts only: each shows in its own face.',
          options: [...Object.entries(C.FONTS).map(([id, [label, stack]]) => [id, label, stack]), ['custom', 'My own font…']] },
        { key: 'fontCustom', label: 'Font name', type: 'text', max: 60, placeholder: 'A font installed on this device', when: c => c.font === 'custom' },
        { key: 'weight', label: 'Weight', type: 'range', min: 100, max: 900, step: 100 },
        { key: 'spacing', label: 'Letter spacing', type: 'range', min: -0.05, max: 0.3, step: 0.01, unit: 'em', digits: 2 },
        { key: 'opacity', label: 'Opacity', type: 'range', min: 0.2, max: 1, step: 0.05, unit: '%', scale: 100 },
        { key: 'color2', label: 'Gradient to', type: 'color', when: c => c.colorMode === 'gradient' },
        { key: 'lightColor', label: 'Colour on dark scenes', type: 'color', when: c => c.colorMode === 'adaptive' || c.colorMode === 'invert' },
        { key: 'darkColor', label: 'Colour on light scenes', type: 'color', when: c => c.colorMode === 'adaptive' || c.colorMode === 'invert' },
        { key: 'effect', label: 'Shadow', type: 'select', options: [['none', 'None'], ['soft', 'Soft shadow'], ['hard', 'Hard shadow'], ['long', 'Long shadow'], ['glow', 'Glow'], ['neon', 'Neon']] },
        { key: 'effectColor', label: 'Shadow colour', type: 'color', when: c => ['soft', 'hard', 'long'].includes(c.effect) },
        { key: 'effectSize', label: 'Shadow size', type: 'range', min: 0, max: 10, step: 0.5, digits: 1, when: c => c.effect !== 'none' },
        { key: 'outline', label: 'Outline', type: 'range', min: 0, max: 6, step: 0.5, digits: 1 },
        { key: 'outlineColor', label: 'Outline colour', type: 'color', when: c => c.outline > 0 },
        { key: 'plate', label: 'Backing', type: 'select', help: 'A shape behind the clock, for busy wallpapers. Frosted glass becomes plain tint on Low.',
          options: [['none', 'None'], ['tint', 'Tinted'], ['glass', 'Frosted glass'], ['line', 'Outline only']] },
        { key: 'plateColor', label: 'Backing colour', type: 'color', when: c => c.plate !== 'none' },
        { key: 'plateOpacity', label: 'Backing strength', type: 'range', min: 0, max: 0.8, step: 0.05, unit: '%', scale: 100, when: c => c.plate === 'tint' || c.plate === 'glass' },

        { group: '🧭 Position', collapsed: true, when: on, summary: c => motionLabels[c.motion] },
        { key: 'anchor', label: 'Place', type: 'select', when: c => c.motion === 'static',
          options: [['top-left', 'Top left'], ['top', 'Top'], ['top-right', 'Top right'], ['left', 'Left'], ['center', 'Centre'], ['right', 'Right'], ['bottom-left', 'Bottom left'], ['bottom', 'Bottom'], ['bottom-right', 'Bottom right'], ['custom', 'Where I dragged it']],
          help: 'With settings open, drag the clock to put it anywhere.' },
        { key: 'x', label: 'Across', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', scale: 100, when: c => c.motion === 'static' && c.anchor === 'custom' },
        { key: 'y', label: 'Down', type: 'range', min: 0, max: 1, step: 0.01, unit: '%', scale: 100, when: c => c.motion === 'static' && c.anchor === 'custom' },
        { key: 'margin', label: 'Margin', type: 'range', min: 0, max: 20, step: 1, unit: '%', when: c => c.motion === 'static' && c.anchor !== 'custom', help: 'Of the screen’s shorter side.' },
        { key: 'speed', label: 'Speed', type: 'range', min: 0.2, max: 3, step: 0.1, unit: '×', digits: 1, when: c => ['drift', 'bounce', 'follow'].includes(c.motion) },
        { key: 'path', label: 'Path', type: 'select', when: c => c.motion === 'drift', options: [['wander', 'Wander'], ['orbit', 'Orbit'], ['figure8', 'Figure eight']] },
        { key: 'bounceHue', label: 'A new colour on every bounce', type: 'toggle', when: c => c.motion === 'bounce' },
        { key: 'bounceFlash', label: 'Flash when it hits a corner', type: 'toggle', when: c => c.motion === 'bounce' },
        { key: 'teleportEvery', label: 'Jumps', type: 'select', when: c => c.motion === 'teleport',
          options: [['10', 'Every 10 seconds'], ['30', 'Every 30 seconds'], ['60', 'Every minute'], ['300', 'Every 5 minutes'], ['900', 'Every 15 minutes'], ['minute', 'As the minute changes']] },
        { key: 'teleportFade', label: 'Arrives', type: 'select', when: c => c.motion === 'teleport', options: [['fade', 'With a fade'], ['instant', 'Instantly']] },

        { group: '⚙️ Advanced', advanced: true, when: on },
        { key: 'align', label: 'Align the lines', type: 'select', options: [['auto', 'To suit the place'], ['left', 'Left'], ['center', 'Centre'], ['right', 'Right']] },
        { key: 'shy', label: 'Fade when the pointer comes near', type: 'toggle' },
        { key: 'nightMode', label: 'At night', type: 'select', options: [['off', 'Leave it'], ['dim', 'Dim it'], ['hide', 'Hide it']] },
        { key: 'nightFrom', label: 'Night starts', type: 'text', max: 5, placeholder: '22:00', when: c => c.nightMode !== 'off' },
        { key: 'nightTo', label: 'Night ends', type: 'text', max: 5, placeholder: '06:00', when: c => c.nightMode !== 'off' },
        { key: 'hideOn', label: 'Stay hidden over', type: 'multi', empty: true, options: WP.showable ? WP.showable().map(entry => [entry.id, `${entry.icon} ${entry.name}`]) : [] },
    ]);
})(globalThis.WP);
