// Settings for Koi Pond, as the panel shows them (SPEC §4.4). The values
// and their defaults live in defaults.js.
WP.schema('koi-pond', [
    { group: '🐟 Koi' },
    { key: 'fishCount', label: 'Koi', type: 'range', min: 1, max: 24, step: 1, help: 'How many swim at full quality; lower performance tiers keep a share' },
    { key: 'varieties', label: 'Varieties', type: 'multi', options: [['kohaku', '⚪🔴 Kohaku'], ['sanke', '⚪🔴⚫ Sanke'], ['showa', '⚫🔴 Showa'], ['ogon', '🟡 Ogon'], ['utsuri', '⚫⚪ Utsuri'], ['asagi', '🔵 Asagi']] },
    { key: 'fishSize', label: 'Size', type: 'range', min: 0.6, max: 1.6, step: 0.05, unit: '×', digits: 2 },
    { key: 'swimSpeed', label: 'Swim Speed', type: 'range', min: 0.4, max: 2, step: 0.05, unit: '×', digits: 2 },
    { group: '🪷 Pond' },
    { key: 'lilyPads', label: 'Lily Pads', type: 'range', min: 0, max: 20, step: 1 },
    { key: 'season', label: 'Season', type: 'select', options: [['auto', '📅 By the date'], ['spring', '🌸 Spring petals'], ['summer', '🪷 Summer flowers'], ['autumn', '🍁 Autumn leaves'], ['winter', '🧊 Winter ice']],
      help: 'Cherry petals in spring, lilies in bloom in summer, leaves in autumn, thin ice in winter' },
    { group: '👆 Touch' },
    { key: 'touch', label: 'Touch', type: 'select', options: [['ripple', '💧 Ripples, and the koi come'], ['ignore', '🚫 Ignore touch']] },
    { key: 'feed', label: 'Feed on Tap', type: 'toggle', help: 'A tap scatters a few pellets, and the koi rise to eat them' },
]);
