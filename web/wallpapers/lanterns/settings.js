// Settings for Lantern Festival, as the panel shows them (SPEC §4.4). The
// values and their defaults live in defaults.js.
WP.schema('lanterns', [
    { group: '🏮 Lanterns' },
    { key: 'count', label: 'Lanterns in the Sky', type: 'range', min: 10, max: 150, step: 5, help: 'How many can be aloft at once at High; lower performance tiers have fewer' },
    { key: 'releases', label: 'Releases', type: 'range', min: 0, max: 60, step: 1, unit: '/min', help: 'How many lanterns are let go each minute (0: only the ones you release)' },
    { key: 'colour', label: 'Paper', type: 'select', options: [['warm', '🏮 Warm paper'], ['mixed', '🌸 Mixed colours']] },
    { group: '🌊 The lake' },
    { key: 'reflections', label: 'Reflections', type: 'toggle', help: 'Lanterns trembling on the water' },
    { key: 'touch', label: 'Tap to Release', type: 'toggle', help: 'A tap or click lets a lantern go from the shore under it. Off: touches are ignored, for a phone home screen' },
]);
