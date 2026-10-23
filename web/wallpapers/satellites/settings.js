// Settings for Satellites, as the panel shows them (SPEC §4.4). The values
// and their defaults live in defaults.js.
WP.schema('satellites', [
    { group: '🛰️ Sky' },
    { key: 'group', label: 'Satellites', type: 'select', options: [['visual', 'The brightest (about 150)'], ['stations', 'Space stations and visitors'], ['both', 'Both']],
      help: 'Orbits from CelesTrak, fetched at most twice a day and kept on this device.' },
    { key: 'facing', label: 'Looking', type: 'select', options: [['auto', 'Towards the equator'], ['north', 'North'], ['east', 'East'], ['south', 'South'], ['west', 'West']] },
    { key: 'horizon', label: 'Horizon', type: 'select', options: [['hills', '⛰️ Wooded hills'], ['forest', '🌲 Forest'], ['flat', '🌊 Open water']] },
    { group: '✨ Look' },
    { key: 'labels', label: 'Names', type: 'select', options: [['stations', 'Space stations'], ['all', 'Every satellite in sunlight'], ['none', 'None']] },
    { key: 'satelliteSize', label: 'Satellite Size', type: 'range', min: 0.5, max: 2, step: 0.1, unit: '×', digits: 1 },
    { key: 'trails', label: 'Short trails behind satellites in sunlight', type: 'toggle' },
    { key: 'ghosts', label: 'Show the ones you couldn’t see, faintly', type: 'toggle',
      help: 'In daylight or in Earth’s shadow a satellite is invisible to the eye; this keeps a faint ring where it is.' },
    { group: '⚙️ Advanced', advanced: true },
    { key: 'stars', label: 'Stars', type: 'range', min: 0, max: 2, step: 0.1, unit: '×', digits: 1 },
    { key: 'milkyWay', label: 'Milky Way', type: 'toggle' },
    { key: 'tapInfo', label: 'Tap a satellite for its name, height and speed', type: 'toggle',
      help: 'Off ignores touch entirely.' },
]);
