// Settings for The Never-Ending Baseball Season, as the panel shows them
// (SPEC §4.4). The values and their defaults live in defaults.js. The
// clubs' names come from the wallpaper (host.panel), since every league
// founded has different ones.
WP.schema('baseball', [
    { group: '⚾ The Game' },
    { key: 'pace', label: 'Pace', type: 'select', options: [['relaxed', '🌭 Relaxed'], ['normal', '⚾ Normal'], ['brisk', '⚡ Brisk']], help: 'A nine-inning game takes about a quarter of an hour at Normal' },
    { key: 'innings', label: 'Innings', type: 'select', options: [[9, 'Nine'], [7, 'Seven'], [5, 'Five'], [3, 'Three']], help: 'From the next game on. Extra innings whenever it is tied' },
    { key: 'follow', label: 'Follow', type: 'select', options: (config, feed) => [['any', '📺 The best game of the day'], ...Array.from({ length: 8 }, (_, i) => [String(i), feed?.teams?.[i] || `Club ${i + 1}`])],
      help: 'Which club\'s game is shown each day. The other three are played out of sight and reported as scores' },
    { key: 'captions', label: 'Captions', type: 'toggle', help: 'The batter and pitcher cards, the announcer, and the sheets between innings. S holds up the standings and the leaders' },
    { type: 'action', name: 'reset', label: '🎲 Found a new league' },
    { group: '🏟️ The Park' },
    { key: 'time', label: 'Light', type: 'select', options: [['auto', '🕰️ By your clock'], ['day', '☀️ A day game'], ['dusk', '🌇 Dusk'], ['night', '🌙 Under the lights']] },
    { key: 'rain', label: 'Rain delays', type: 'toggle', help: 'Now and then the tarp comes out between innings' },
    { key: 'fireworks', label: 'Fireworks for a home run at night', type: 'toggle' },
    { key: 'touch', label: 'A tap starts a wave', type: 'toggle', help: 'And sends a beach ball into the crowd. Tap the hot-dog seller for a hot dog' },
    { key: 'pixelSize', label: 'Pixel Size', type: 'range', min: 0.6, max: 2, step: 0.2, unit: '×', digits: 1 },
]);
