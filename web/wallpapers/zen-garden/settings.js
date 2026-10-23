// Settings for Zen Garden, as the panel shows them (SPEC §4.4). The values
// and their defaults live in defaults.js.
WP.schema('zen-garden', [
    { group: '🪨 Garden' },
    { key: 'sand', label: 'Sand', type: 'select', options: [['white', '⚪ White gravel'], ['slate', '⚫ Dark slate'], ['warm', '🟤 Warm sand']] },
    { key: 'stones', label: 'Stones', type: 'range', min: 0, max: 7, step: 1, help: 'How many stones, each with its rings. Press N for a new arrangement' },
    { key: 'season', label: 'Visitors', type: 'select', options: [['auto', '📅 By the season'], ['autumn', '🍁 Maple leaves'], ['spring', '🌸 Cherry petals'], ['off', '🚫 None']],
      help: 'Maple leaves drift down in autumn and cherry petals in spring' },
    { group: '🧹 Rake' },
    { key: 'touch', label: 'Touch', type: 'select', options: [['rake', '🧹 Drag to rake'], ['ignore', '🚫 Ignore touch']] },
    { key: 'tines', label: 'Tines', type: 'range', min: 2, max: 9, step: 1 },
    { key: 'grooveSpacing', label: 'Groove Spacing', type: 'range', min: 6, max: 24, step: 1, unit: 'px' },
    { group: '🍃 Wind and Gardener' },
    { key: 'fadeMinutes', label: 'Wind Smooths Grooves Over', type: 'range', min: 1, max: 60, step: 1, unit: ' min', help: 'How long the wind takes to smooth a groove away' },
    { key: 'gardener', label: 'Gardener', type: 'toggle', help: 'An unseen gardener re-rakes the rows and rings when nobody is raking' },
    { key: 'gardenerDelay', label: 'Gardener Comes After', type: 'range', min: 5, max: 600, step: 5, unit: 's', help: 'Time without a touch before the gardener starts' },
]);
