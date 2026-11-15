// Settings for Sumo Championship, as the panel shows them (SPEC §4.4). The
// values and their defaults live in defaults.js.
WP.schema('sumo', [
    { group: '🤼 The Tournament' },
    { key: 'pace', label: 'Pace', type: 'select', options: [['relaxed', '🍵 Relaxed'], ['normal', '⚖️ Normal'], ['brisk', '⚡ Brisk']], help: 'How long the wrestlers take over the ritual between bouts' },
    { key: 'ritual', label: 'Salt and stomps before every bout', type: 'toggle', help: 'Off goes straight to the crouch; the last bout of the day keeps its salt' },
    { key: 'captions', label: 'Captions', type: 'toggle', help: 'The day, the nameplates and how each bout was won. B holds up the ranking sheet' },
    { key: 'gloss', label: 'English under the Japanese', type: 'toggle', when: config => config.captions, help: 'Names, ranks and results are written in Japanese; this adds readings in Roman letters and what they mean' },
    { type: 'action', name: 'reset', label: '🎲 Found a new league' },
    { group: '🏮 The Hall' },
    { key: 'look', label: 'Light', type: 'select', options: [['auto', '🕰️ Evening by your clock'], ['day', '☀️ Day'], ['evening', '🌙 Evening']] },
    { key: 'cushions', label: 'Cushions fly at an upset', type: 'toggle' },
    { key: 'touch', label: 'A tap throws a cushion', type: 'toggle' },
]);
