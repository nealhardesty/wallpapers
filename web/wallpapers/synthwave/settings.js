// Settings for Synthwave, as the panel shows them (SPEC §4.4). The
// values and their defaults live in defaults.js.
WP.schema('synthwave', [
    { group: '🌆 The Drive' },
    { key: 'speed', label: 'Speed', type: 'range', min: 0.25, max: 3, step: 0.05, unit: '×', digits: 2, help: 'How fast the grid rushes towards you' },
    { key: 'palette', label: 'Palette', type: 'select', options: [['outrun', '💜 Outrun Magenta'], ['vaporwave', '🩵 Vaporwave Pastel'], ['ice', '🧊 Ice Blue'], ['sunset', '🧡 Sunset Orange']] },
    { group: '🌴 Scenery' },
    { key: 'sunStripes', label: 'Striped sun', type: 'toggle', help: 'Gaps that drift down the sun and widen towards the horizon' },
    { key: 'palms', label: 'Palm trees on the verges', type: 'toggle' },
    { key: 'mountains', label: 'Wireframe mountains', type: 'toggle' },
    { key: 'road', label: 'Highway and tail lights', type: 'toggle' },
    { key: 'scanlines', label: 'CRT scanlines', type: 'toggle' },
]);
