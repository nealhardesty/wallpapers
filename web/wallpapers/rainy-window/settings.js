// Settings for Rainy Window, as the panel shows them (SPEC §4.4). The
// values and their defaults live in defaults.js.
WP.schema('rainy-window', [
    { group: '🌧️ Rain' },
    { key: 'rain', label: 'Rain', type: 'range', min: 0.1, max: 1, step: 0.05, unit: '%', scale: 100, help: 'From a light drizzle to a downpour' },
    { key: 'dropSize', label: 'Drop Size', type: 'range', min: 0.6, max: 1.6, step: 0.05, unit: '×', digits: 2, help: 'How big drops grow before they run down the glass' },
    { group: '🌫️ Fog' },
    { key: 'fog', label: 'Fog', type: 'range', min: 0, max: 1, step: 0.05, unit: '%', scale: 100, help: 'How thick the condensation on the glass is (0 = clear glass)' },
    { key: 'fogReturn', label: 'Fog Returns In', type: 'range', min: 10, max: 120, step: 5, unit: 's', help: 'How long the fog takes to close over a clear patch' },
    { key: 'fingerDrawing', label: 'Draw in the Fog', type: 'toggle', help: 'A finger, or a mouse drag, wipes a line in the fog. Off ignores touch' },
    { group: '🏙️ City' },
    { key: 'city', label: 'View', type: 'select', options: [['downtown', '🏙️ Downtown'], ['harbour', '⚓ Harbour'], ['hills', '⛰️ Hills']] },
    { key: 'palette', label: 'Palette', type: 'select', options: [['sodium', '🟠 Sodium Orange'], ['neon', '🟣 Neon'], ['bluehour', '🔵 Blue Hour']] },
    { key: 'traffic', label: 'Traffic', type: 'range', min: 0, max: 1, step: 0.05, unit: '%', scale: 100, help: 'Cars passing below; window lights follow the hour on their own' },
]);
