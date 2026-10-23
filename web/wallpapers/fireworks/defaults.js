// Default settings for Fireworks. Saved settings store only what differs
// from these (SPEC §4.1).
WP.defaults('fireworks', {
    configVersion: 1,
    mode: 'auto',            // auto, tap, newyear
    showMinutes: 5,          // auto: minutes from the opening to the finale
    intensity: 1,            // how busy the sky is (× the tier's density)
    size: 1,                 // × the size of each burst
    palette: 'classic',      // classic, gold, jewel, pastel, neon
    burstTypes: ['peony', 'chrysanthemum', 'willow', 'ring', 'palm', 'crossette', 'strobe', 'crackle'],
    smoke: true,
    reflection: true,
    scene: 'city',           // city, hills
    tapToLaunch: true,
});
