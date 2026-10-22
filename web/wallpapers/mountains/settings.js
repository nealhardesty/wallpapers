// Settings for Mountains, as the panel shows them (SPEC §4.4). The
// values and their defaults live in defaults.js.
WP.schema('mountains', [
    { group: '🌄 Landscape' },
    { key: 'layers', label: 'Number of Layers', type: 'range', min: 2, max: 8, step: 1 },
    { key: 'mountainsPerLayer', label: 'Peaks per Screen', type: 'range', min: 1, max: 8, step: 1 },
    { key: 'mountainHeight', label: 'Mountain Height', type: 'range', min: 0.25, max: 0.85, step: 0.05, unit: '%', scale: 100 },
    { key: 'heightVariation', label: 'Height Variation', type: 'range', min: 0, max: 0.6, step: 0.05, unit: '%', scale: 100 },
    { key: 'peakiness', label: 'Ruggedness', type: 'range', min: 0.1, max: 1, step: 0.05, unit: '%', scale: 100 },
    { group: '🎨 Appearance' },
    { key: 'colorPalette', label: 'Color Palette', type: 'select', options: [['blue', '🔵 Blue Mountains'], ['purple', '🟣 Purple Mountains'], ['sunset', '🌅 Sunset'], ['monochrome', '⚫ Monochrome'], ['green', '🟢 Green Hills']] },
    { key: 'invertPalette', label: 'Invert Palette (lighter in front)', type: 'toggle' },
    { key: 'ridgeLines', label: 'Ridge Lines', type: 'toggle' },
    { key: 'snowCaps', label: 'Snow Caps', type: 'toggle' },
    { group: '🏃 Movement' },
    { key: 'baseSpeed', label: 'Base Speed', type: 'range', min: 0.1, max: 3, step: 0.1, digits: 1 },
    { key: 'speedMultiplier', label: 'Depth Falloff', type: 'range', min: 0.2, max: 0.9, step: 0.05, unit: '×', digits: 2, help: 'How much slower each range is than the one in front of it' },
]);
