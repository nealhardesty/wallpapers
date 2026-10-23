// Settings for Pixel Room, as the panel shows them (SPEC §4.4). The values
// and their defaults live in defaults.js.
WP.schema('pixel-room', [
    { group: '🏠 The Room' },
    { key: 'room', label: 'Room', type: 'select', options: [['warm', '🧡 Warm'], ['cool', '💙 Cool'], ['owl', '🦉 Night owl']] },
    { key: 'cat', label: 'Cat', type: 'select', options: [['ginger', '🧡 Ginger'], ['black', '🖤 Black'], ['grey', '🩶 Grey'], ['white', '🤍 White'], ['tuxedo', '🤵 Tuxedo'], ['cream', '🍦 Cream']] },
    { key: 'layout', label: 'Layout', type: 'select', options: [['auto', 'Follow the screen'], ['landscape', 'Landscape'], ['portrait', 'Portrait']] },
    { group: '🪟 The Window' },
    { key: 'view', label: 'View', type: 'select', options: [['city', '🏙️ City'], ['forest', '🌲 Forest'], ['sea', '🌊 Sea']] },
    { key: 'weather', label: 'Weather', type: 'select', options: [['clear', '☀️ Always clear'], ['sometimes', '🌦️ Rains now and then'], ['rain', '🌧️ Always raining']] },
    { group: '👆 Touch' },
    { key: 'touch', label: 'Taps wake the cat and switch the lamp', type: 'toggle' },
]);
