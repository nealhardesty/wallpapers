// Settings for Pocket Hockey, as the panel shows them (SPEC §4.4). The
// values and their defaults live in defaults.js.
WP.schema('pocket-hockey', [
    { group: '🏒 The Game' },
    { key: 'period', label: 'Periods', type: 'select', options: [['short', '⚡ Short (45 seconds)'], ['normal', '🏒 Normal (75 seconds)'], ['long', '🧊 Long (2 minutes)']], help: 'Three to a game. A new length starts with the next game. N skips to the end of the period, G to the final horn' },
    { key: 'speed', label: 'Pace', type: 'range', min: 0.5, max: 2, step: 0.1, unit: '×', digits: 1 },
    { key: 'follow', label: 'Follow', type: 'select', options: [['any', '📺 The best game of each round'], ['MIT', '🧤 Mount Mitten Yetis'], ['PKL', '🥒 Port Pickle Walruses'], ['BIS', '🥣 Biscuit Falls Gravy Boats'],
        ['SNO', '🔮 Snowglobe City Narwhals'], ['COC', '☕ Cocoa Springs Marshmallows'], ['FLN', '🪓 Fort Flannel Lumberjacks'], ['NOO', '🪿 Noodle Harbour Honkers'], ['TIN', '🫖 Tin Whistle Teakettles']],
        help: 'One game of each round is played in front of you; the others are played out of sight and their scores come in' },
    { type: 'status', name: 'league' },
    { type: 'action', name: 'reset', label: '🎲 Found a new league' },
    { group: '📣 The Broadcast' },
    { key: 'captions', label: 'The announcer', type: 'toggle', help: 'One over-excited line at a time. B shows the table, then the scorers' },
    { key: 'names', label: 'Names on the ice', type: 'toggle', help: 'Who has the puck, and the name of a signature move as it happens' },
    { key: 'cards', label: 'A card between periods', type: 'toggle', help: 'The score, the shots, who scored, and the other games' },
    { group: '🧢 The Crowd' },
    { key: 'hats', label: 'Hats for a hat trick', type: 'toggle' },
    { key: 'touch', label: 'Taps', type: 'toggle', help: 'A tap on the ice throws something onto it (skaters slip on it); a tap in the seats starts a wave. X and W do the same from the keyboard' },
]);
