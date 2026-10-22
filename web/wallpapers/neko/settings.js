// Settings for Neko, as the panel shows them (SPEC §4.4). The values and their
// defaults live in defaults.js.
WP.schema('neko', [
    { group: '🎨 Appearance' },
    { key: 'coat', label: 'Coat', type: 'select', options: [
        ['classic', '🤍 Classic white'], ['black', '🖤 Black'], ['orange', '🧡 Orange tabby'], ['gray', '🩶 Grey tabby'],
        ['calico', '🎨 Calico'], ['tuxedo', '🤵 Tuxedo'], ['siamese', '💙 Siamese'], ['cow', '🐄 Cow cat'],
    ] },
    { key: 'size', label: 'Size', type: 'range', min: 16, max: 128, step: 16, unit: 'px', help: 'On-screen size of the cat; steps of 16 keep the pixels crisp' },
    { group: '🏃 Behaviour' },
    { key: 'speed', label: 'Speed', type: 'range', min: 1, max: 8, step: 1, help: 'How fast the cat runs after the pointer' },
    { key: 'animationSpeed', label: 'Animation Speed', type: 'range', min: 4, max: 20, step: 1, help: 'Frames between sprite changes (lower = faster)' },
    { key: 'idleTimeout', label: 'Idle After', type: 'range', min: 2000, max: 20000, step: 1000, unit: 's', scale: 0.001, digits: 0, help: 'How long the pointer rests before the cat washes, yawns or scratches' },
    { key: 'sleepTimeout', label: 'Sleep After', type: 'range', min: 5000, max: 60000, step: 5000, unit: 's', scale: 0.001, digits: 0, help: 'How long before the cat curls up for a nap' },
]);
