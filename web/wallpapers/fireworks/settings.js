// Settings for Fireworks, as the panel shows them (SPEC §4.4). The values
// and their defaults live in defaults.js.
WP.schema('fireworks', [
    { group: '🎆 Show' },
    { key: 'intensity', label: 'Intensity', type: 'range', min: 0.3, max: 2, step: 0.1, unit: '×', digits: 1, help: 'How busy the sky is' },
    { key: 'mode', label: 'Mode', type: 'select', options: [['auto', '🎆 Automatic show'], ['tap', '👆 Only when tapped'], ['newyear', '🥂 New Year (countdown at midnight on 31 Dec)']] },
    { key: 'showMinutes', label: 'Show Length', type: 'range', min: 1, max: 20, step: 1, unit: ' min', help: 'Automatic: minutes from the opening to the finale, then it starts again' },
    { key: 'size', label: 'Burst Size', type: 'range', min: 0.5, max: 1.6, step: 0.05, unit: '×', digits: 2 },
    { key: 'tapToLaunch', label: 'Tap to Launch', type: 'toggle', help: 'A tap or click sends a shell to that spot. Off ignores touch' },
    { group: '🎨 Look' },
    { key: 'palette', label: 'Colours', type: 'select', options: [['classic', '🎆 Classic'], ['gold', '✨ Gold and Silver'], ['jewel', '💎 Jewel'], ['pastel', '🍬 Pastel'], ['neon', '🌈 Neon']] },
    { key: 'burstTypes', label: 'Shells', type: 'multi', options: [['peony', 'Peony'], ['chrysanthemum', 'Chrysanthemum'], ['willow', 'Willow'], ['ring', 'Ring'], ['palm', 'Palm'], ['crossette', 'Crossette'], ['strobe', 'Strobe'], ['crackle', 'Crackle']] },
    { key: 'scene', label: 'Scene', type: 'select', options: [['city', '🏙️ City over a lake'], ['hills', '🌲 Hills over a lake']] },
    { key: 'smoke', label: 'Smoke', type: 'toggle', help: 'Drifting smoke that later bursts light up' },
    { key: 'reflection', label: 'Reflection', type: 'toggle', help: 'The lake reflects the show' },
]);
