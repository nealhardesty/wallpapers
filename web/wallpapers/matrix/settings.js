// Settings for Matrix, as the panel shows them (SPEC §4.4). The
// values and their defaults live in defaults.js.
WP.schema('matrix', [
    { group: '🟩 The code' },
    { key: 'look', label: 'Look', type: 'select', options: [['operator', '🎬 The Matrix (1999)'], ['classic', '🎞️ Reloaded / Revolutions'], ['resurrections', '🆕 Resurrections (2021)']], help: 'The 1999 film: crowded, flat green, a bright head on one string in a few, symbols that hold and then change together. The sequels: a trail fading from bright to dark. Resurrections: a bigger alphabet, cooler green, either dim or blazing' },
    { key: 'colour', label: 'Colour', type: 'select', options: [['green', '🟢 Phosphor green'], ['amber', '🟠 Amber'], ['blue', '🔵 Blue'], ['red', '🔴 Red alert'], ['purple', '🟣 Purple'], ['cyan', '🔷 Cyan ice'], ['white', '⚪ White ghost'], ['rainbow', '🌈 Rainbow']] },
    { key: 'glyphSize', label: 'Symbol size', type: 'range', min: 8, max: 40, step: 1, unit: 'px', help: 'The width of a cell; the film\'s code is small and crowded' },
    { group: '🌧️ The rain' },
    { key: 'density', label: 'Density', type: 'range', min: 0.1, max: 1, step: 0.05, unit: '%', scale: 100, help: 'How many columns rain, and how soon a column starts another string' },
    { key: 'speed', label: 'Speed', type: 'range', min: 0.25, max: 3, step: 0.05, unit: '×', digits: 2, help: 'How fast the light runs down a column (the symbols themselves never move)' },
    { key: 'trail', label: 'Trail length', type: 'range', min: 0.1, max: 2, step: 0.05, unit: '%', scale: 100, help: 'How long a string stays lit behind its head, as a share of the screen' },
    { key: 'brightHeads', label: 'Bright heads', type: 'range', min: 0, max: 1, step: 0.05, unit: '%', scale: 100, help: 'The share of strings led by a blazing white-green symbol; in the film about one in five' },
    { key: 'cycle', label: 'Symbol changes', type: 'range', min: 0, max: 4, step: 0.1, unit: '×', digits: 1, help: 'How often a lit symbol turns into another one, in place' },
    { key: 'stutter', label: 'Stalls', type: 'toggle', help: 'Columns hold still for a moment now and then, as the film\'s code does' },
    { key: 'intro', label: 'Drip in on start', type: 'toggle', help: 'The code comes down from the top when it starts, the middle first and the edges last; off, it has been raining a while already' },
    { group: '🖥️ Picture' },
    { key: 'depth', label: 'Depth', type: 'toggle', help: 'A smaller, dimmer, softer layer of rain further back' },
    { key: 'glow', label: 'Glow', type: 'toggle', help: 'Bloom round the bright heads' },
    { key: 'crt', label: 'Scanlines', type: 'toggle' },
    { key: 'fps', label: 'Frame rate', type: 'range', min: 12, max: 60, step: 1, unit: 'fps', help: 'The film ran at 24; lower is choppier and cheaper' },
    { key: 'touch', label: 'Tap to splash', type: 'toggle', help: 'A tap lights the columns round it' },
]);
