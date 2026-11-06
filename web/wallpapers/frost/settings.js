// Settings for Frost on the Glass, as the panel shows them (SPEC §4.4). The
// values and their defaults live in defaults.js.
WP.schema('frost', [
    { group: '❄️ The Frost' },
    { key: 'growMinutes', label: 'Creeps in over', type: 'range', min: 1, max: 30, step: 1, unit: ' min', help: 'From the corners and the cold edges of each pane.' },
    { key: 'coverage', label: 'How far in', type: 'range', min: 0.2, max: 0.9, step: 0.05, scale: 100, unit: '%', digits: 0 },
    { key: 'cycleMinutes', label: 'Thaws and starts again every', type: 'range', min: 0, max: 120, step: 5, unit: ' min', help: '0 never thaws. T thaws it now.' },
    { key: 'sparkle', label: 'Glints', type: 'toggle', help: 'Light catching the crystals now and then.' },
    { key: 'doodles', label: 'Someone draws in it', type: 'toggle', help: 'From inside, with a fingertip: a heart, a star, a paw print, a tree, NOEL (backwards from out here). It frosts over again. D for one now.' },
    { key: 'doodleMinutes', label: 'About every', type: 'range', min: 2, max: 30, step: 1, unit: ' min', when: config => config.doodles },
    { key: 'touch', label: 'Draw in it', type: 'toggle', help: 'Drag to draw with your finger; tap to breathe on the glass (B). Off ignores touch.' },
    { group: '🎄 The Room' },
    { key: 'lights', label: 'Tree lights', type: 'select', options: [['warm', '✨ Warm white'], ['multi', '🌈 Coloured'], ['blue', '❄️ Icy blue'], ['candle', '🕯️ Candlelight']] },
    { key: 'twinkle', label: 'Twinkle', type: 'range', min: 0, max: 2, step: 0.1, unit: '×', digits: 1, help: '0 holds them steady.' },
    { key: 'blur', label: 'Out of focus', type: 'range', min: 0.5, max: 1.6, step: 0.05, unit: '×', digits: 2, help: 'How big the lights’ soft discs are.' },
    { key: 'treeSide', label: 'The tree', type: 'select', options: [['left', '⬅️ To the left'], ['center', '⏺️ In the middle'], ['right', '➡️ To the right']] },
    { group: '🪟 The Window' },
    { key: 'window', label: 'Panes', type: 'select', options: [['single', '⬜ One big pane'], ['two', '◫ Two'], ['four', '⊞ Four'], ['six', '▦ Six']] },
    { key: 'frameColour', label: 'Frame', type: 'select', options: [['white', '🤍 White paint'], ['wood', '🪵 Wood'], ['green', '🌲 Green'], ['red', '🍎 Red']] },
    { key: 'snow', label: 'Snow outside', type: 'range', min: 0, max: 1, step: 0.05, scale: 100, unit: '%', digits: 0, help: 'Now and then a flake sticks to the glass.' },
]);
