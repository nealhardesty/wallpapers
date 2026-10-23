// Settings for Murmuration, as the panel shows them (SPEC §4.4). The values
// and their defaults live in defaults.js.
WP.schema('murmuration', [
    { group: '🐦 The flock' },
    { key: 'birds', label: 'Starlings', type: 'range', min: 500, max: 5000, step: 100, help: 'How many starlings at High; lower performance tiers fly fewer' },
    { key: 'minutes', label: 'Swirling Time', type: 'range', min: 0.5, max: 15, step: 0.5, unit: 'min', digits: 1, help: 'How long the flock swirls before it pours down into the reeds to roost' },
    { group: '🦅 The falcon' },
    { key: 'falcon', label: 'Falcon', type: 'select', options: [['pointer', '🖱️ You (the pointer), and wild ones'], ['auto', '🦅 Wild falcons only'], ['off', '🚫 None']], help: 'Hover or drag to fly the falcon through the flock; click or tap to send one diving' },
    { key: 'touch', label: 'Touch Flies the Falcon', type: 'toggle', help: 'Off: touches are ignored, for a phone home screen' },
    { group: '🌅 The sky' },
    { key: 'skyPalette', label: 'Sky', type: 'select', options: [['amber', '🌅 Amber dusk'], ['pink', '🌸 Pink dusk'], ['winter', '🌫️ Grey winter']] },
]);
