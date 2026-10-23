// Settings for Night Train, as the panel shows them (SPEC §4.4). The
// values and their defaults live in defaults.js.
WP.schema('night-train', [
    { group: '🚆 The Journey' },
    { key: 'speed', label: 'Speed', type: 'range', min: 0.4, max: 2, step: 0.05, unit: '×', digits: 2, help: 'How fast the land slides past' },
    { key: 'palette', label: 'Night', type: 'select', options: [['blue', '🌙 Blue night'], ['sodium', '🟠 Sodium lights'], ['snow', '❄️ Snow route']] },
    { key: 'stations', label: 'Stop at stations', type: 'toggle', help: 'Slow down, wait under the platform lamps, pull away' },
    { key: 'tunnels', label: 'Tunnels', type: 'toggle' },
    { group: '🪟 The Window' },
    { key: 'rain', label: 'Rain on the Glass', type: 'range', min: 0, max: 1, step: 0.05, unit: '%', scale: 100, help: 'Streaks run backwards, steeper as the train slows' },
    { key: 'reflection', label: 'Carriage reflection in tunnels', type: 'toggle', help: 'Seats, a reading lamp and a sleeping cat, seen in the glass when it’s dark outside' },
    { key: 'frame', label: 'Window frame', type: 'toggle' },
]);
