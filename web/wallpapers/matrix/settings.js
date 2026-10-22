// Settings for Matrix, as the panel shows them (SPEC §4.4). The
// values and their defaults live in defaults.js.
WP.schema('matrix', [
    { group: '⚡ Performance' },
    { key: 'speed', label: 'Speed', type: 'range', min: 0.25, max: 10, step: 0.25, digits: 2, help: 'How fast the matrix characters fall down the screen' },
    { key: 'fontSize', label: 'Font Size', type: 'range', min: 8, max: 24, step: 1, unit: 'px', help: 'Size of the matrix characters in pixels' },
    { key: 'density', label: 'Density', type: 'range', min: 0.1, max: 1, step: 0.01, unit: '%', scale: 100, help: 'Percentage of columns that are active (lower = more sparse)' },
    { key: 'characterChangeRate', label: 'Character Change Rate', type: 'range', min: 0.01, max: 0.5, step: 0.01, unit: '%', scale: 100, help: 'How often characters in trails randomly change' },
    { key: 'tailLength', label: 'Tail Length', type: 'range', min: 0.05, max: 1, step: 0.05, unit: '%', scale: 100, help: 'Length of character trails as percentage of screen height' },
    { group: '🎨 Appearance' },
    { key: 'theme', label: 'Theme', type: 'select', options: [['classic', '🟢 Classic (Green)'], ['blue', '🔵 Blue Matrix'], ['red', '🔴 Red Alert'], ['purple', '🟣 Purple Cyber'], ['orange', '🟠 Orange Fire'], ['cyan', '🔷 Cyan Ice'], ['white', '⚪ White Ghost'], ['rainbow', '🌈 Rainbow']] },
    { key: 'fadeTrails', label: 'Fade Trails (smoother but slightly less performance)', type: 'toggle' },
]);
