// Settings for Parallax Clouds, as the panel shows them (SPEC §4.4). The
// values and their defaults live in defaults.js.
WP.schema('parallax-clouds', [
    { group: '🎨 Appearance' },
    { key: 'colorTheme', label: 'Color Theme', type: 'select', options: [['classic_mario', '🍄 Classic Mario (Blue sky, white clouds)'], ['underwater', '🌊 Underwater (Deep blue theme)'], ['desert', '🏜️ Desert (Sandy yellow theme)'], ['volcano', '🌋 Volcano (Dark red theme)'], ['ice', '❄️ Ice (Cool blue theme)'], ['night', '🌙 Night (Dark purple theme)'], ['sunset', '🌅 Sunset (Orange-pink theme)']] },
    { key: 'pixelSize', label: 'Pixel Size', type: 'range', min: 2, max: 12, step: 1, unit: 'px' },
    { key: 'cloudScale', label: 'Cloud Scale', type: 'range', min: 0.5, max: 2.5, step: 0.1, unit: '×', digits: 1 },
    { key: 'smoothing', label: 'Enable Anti-aliasing (smoother but less pixelated)', type: 'toggle' },
    { group: '🌥️ Cloud Layers' },
    { key: 'layerCount', label: 'Layer Count', type: 'range', min: 2, max: 8, step: 1 },
    { key: 'cloudDensity', label: 'Cloud Density', type: 'range', min: 0.2, max: 1.5, step: 0.1, unit: '%', scale: 100 },
    { group: '💨 Movement' },
    { key: 'baseSpeed', label: 'Base Speed', type: 'range', min: 0.1, max: 2, step: 0.1, digits: 1 },
    { key: 'speedMultiplier', label: 'Speed Multiplier', type: 'range', min: 1.1, max: 3, step: 0.1, unit: '×', digits: 1 },
    { key: 'windVariation', label: 'Wind Variation', type: 'range', min: 0, max: 1, step: 0.1, digits: 1 },
    { key: 'verticalFloat', label: 'Vertical Float', type: 'range', min: 0, max: 1, step: 0.1, digits: 1 },
    { group: '⚙️ Advanced', advanced: true },
    { key: 'floatSpeed', label: 'Float Speed', type: 'range', min: 0, max: 0.05, step: 0.001, digits: 3 },
]);
