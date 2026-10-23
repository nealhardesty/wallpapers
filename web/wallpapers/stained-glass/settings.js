// Settings for Stained Glass, as the panel shows them (SPEC §4.4). The
// values and their defaults live in defaults.js.
WP.schema('stained-glass', [
    { group: '⛪ Window' },
    { key: 'design', label: 'Design', type: 'select', options: [['rose', '🌹 Rose window'], ['abstract', '🎨 Abstract'], ['landscape', '🏞️ Landscape'], ['geometric', '✴️ Geometric (girih)']] },
    { key: 'palette', label: 'Glass', type: 'select', options: [['cathedral', '⛪ Cathedral'], ['nouveau', '🌿 Art nouveau'], ['seaglass', '🌊 Sea glass'], ['sunset', '🌇 Sunset']] },
    { key: 'cellCount', label: 'Pieces of Glass', type: 'range', min: 60, max: 600, step: 10, help: 'Roughly how many pieces the window is leaded from' },
    { group: '☀️ Light' },
    { key: 'light', label: 'Time of Day', type: 'select', help: 'Follow the clock, or keep the light at one time of day',
      options: [['clock', '🕰️ Follow the clock'], ['dawn', '🌅 Dawn'], ['morning', '🌤️ Morning'], ['noon', '☀️ Noon'], ['afternoon', '🌞 Afternoon'], ['dusk', '🌇 Dusk'], ['night', '🌙 Night']] },
    { key: 'shafts', label: 'Light Shafts', type: 'range', min: 0, max: 1, step: 0.05, unit: '%', scale: 100, help: 'How strongly coloured light streams down from the window' },
    { key: 'dustMotes', label: 'Dust Motes', type: 'range', min: 0, max: 300, step: 10 },
    { key: 'clouds', label: 'Passing clouds dim the light now and then', type: 'toggle' },
]);
