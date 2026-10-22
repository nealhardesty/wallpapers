// Settings for Northern Lights, as the panel shows them (SPEC §4.4). The
// values and their defaults live in defaults.js.
WP.schema('northern-lights', [
    { group: '✨ Curtains' },
    { key: 'curtainCount', label: 'Curtain Count', type: 'range', min: 1, max: 6, step: 1 },
    { key: 'brightness', label: 'Brightness', type: 'range', min: 0.2, max: 2, step: 0.05, unit: '%', scale: 100 },
    { key: 'curtainHeight', label: 'Curtain Height', type: 'range', min: 0.5, max: 2, step: 0.1, unit: '×', digits: 1 },
    { key: 'rayDensity', label: 'Ray Density', type: 'range', min: 0.4, max: 2.5, step: 0.1, unit: '×', digits: 1 },
    { key: 'colorScheme', label: 'Emission Colors', type: 'select', options: [['classic', '🟢 Classic (oxygen green, pink border)'], ['electric', '⚡ Storm (green over nitrogen violet)'], ['mystical', '🔮 Proton Arc (violet / magenta)'], ['warm', '🔥 Red Aurora (high-altitude oxygen)']] },
    { group: '🌀 Motion' },
    { key: 'driftSpeed', label: 'Drift Speed', type: 'range', min: 0.2, max: 3, step: 0.1, unit: '×', digits: 1 },
    { key: 'foldAmount', label: 'Fold Amount', type: 'range', min: 0.2, max: 2, step: 0.1, unit: '×', digits: 1 },
    { key: 'shimmerSpeed', label: 'Shimmer Speed', type: 'range', min: 0.2, max: 3, step: 0.1, unit: '×', digits: 1 },
    { group: '⚡ Substorm' },
    { key: 'substorms', label: 'Substorm cycle (quiet arc → breakup → pulsing)', type: 'toggle' },
    { key: 'activity', label: 'Fixed Activity', type: 'range', min: 0.05, max: 1, step: 0.05, unit: '%', scale: 100 },
    { key: 'bloom', label: 'Airglow Bloom', type: 'range', min: 0, max: 1.5, step: 0.05, unit: '%', scale: 100 },
    { group: '⭐ Sky & Ground' },
    { key: 'starCount', label: 'Star Count', type: 'range', min: 0, max: 600, step: 10 },
    { key: 'starBrightness', label: 'Star Brightness', type: 'range', min: 0.1, max: 1.2, step: 0.05, unit: '%', scale: 100 },
    { key: 'horizon', label: 'Horizon Height', type: 'range', min: 0.5, max: 0.95, step: 0.01, unit: '%', scale: 100 },
    { key: 'silhouette', label: 'Ridge & treeline silhouette', type: 'toggle' },
    { key: 'reflection', label: 'Reflection on the ice', type: 'toggle' },
]);
