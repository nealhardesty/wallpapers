// Settings for Ice Patrol, as the panel shows them (SPEC §4.4). The
// values and their defaults live in defaults.js.
WP.schema('ice-patrol', [
    { group: '🛩️ The Flight' },
    { key: 'speed', label: 'Speed', type: 'range', min: 0.4, max: 2.5, step: 0.05, unit: '×', digits: 2, help: '1× is about 290 km/h' },
    { key: 'clearance', label: 'Height above the snow', type: 'range', min: 10, max: 160, step: 2, unit: ' m', help: 'Low skims the drifts; high looks out over the ranges' },
    { key: 'bank', label: 'Banking', type: 'range', min: 0, max: 1.5, step: 0.05, unit: '×', digits: 2, help: 'How far the horizon tips in a turn. 0 keeps it level' },
    { key: 'wingmen', label: 'Wingmen', type: 'range', min: 0, max: 3, step: 1, help: 'Other speeders flying ahead in formation' },
    { group: '🌗 Sky and Weather' },
    { key: 'time', label: 'Time of day', type: 'select', options: [['cycle', '🔄 The day goes round'], ['clock', '🕰️ By your clock'], ['dawn', '🌅 Dawn'], ['day', '☀️ Midday'], ['dusk', '🌇 Dusk'], ['night', '🌙 Night']] },
    { key: 'dayMinutes', label: 'Length of a day', type: 'range', min: 2, max: 120, step: 1, unit: ' min', help: 'A whole day and night, when the day goes round', when: config => config.time === 'cycle' },
    { key: 'weather', label: 'Weather', type: 'select', options: [['auto', '🌦️ Snow comes and goes'], ['clear', '☀️ Clear'], ['flurries', '🌨️ Flurries'], ['snow', '❄️ Steady snow'], ['blizzard', '🌬️ Blizzard']] },
    { key: 'snowOften', label: 'How often it snows', type: 'range', min: 0.25, max: 3, step: 0.25, unit: '×', digits: 2, when: config => config.weather === 'auto' },
    { key: 'aurora', label: 'Aurora on clear nights', type: 'toggle' },
    { key: 'beacons', label: 'Beacons and stations on the ice', type: 'toggle', help: 'Far lights at night, and contacts on the radar' },
    { key: 'lamps', label: 'Landing lamps', type: 'toggle', help: 'Light the snow ahead after dark and in heavy snow' },
    { group: '🎛️ Cockpit' },
    { key: 'cockpit', label: 'Cockpit', type: 'select', options: [['full', '🪟 Canopy and panel'], ['panel', '🎛️ Panel only'], ['none', '🚫 None: just the view']] },
    { key: 'glow', label: 'Instrument glow', type: 'select', options: [['green', '🟢 Green phosphor'], ['amber', '🟠 Amber'], ['blue', '🔵 Ice blue']], when: config => config.cockpit !== 'none' },
    { key: 'radarRange', label: 'Radar range', type: 'select', options: [[2000, '2 km'], [4000, '4 km'], [8000, '8 km']], when: config => config.cockpit !== 'none' },
    { group: '⚙️ Advanced', advanced: true },
    { key: 'fov', label: 'Field of view', type: 'range', min: 45, max: 85, step: 1, unit: '°' },
]);
