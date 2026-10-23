// Default settings for Murmuration. Saved settings store only what differs
// from these (SPEC §4.1).
WP.defaults('murmuration', {
    configVersion: 1,
    birds: 3000,            // at High; the tier's density scales it
    skyPalette: 'amber',    // amber, pink, winter
    falcon: 'pointer',      // pointer (and wild ones), auto (wild only), off
    minutes: 3,             // of swirling before the flock goes to roost
    touch: true,            // a finger can fly the falcon (off: touch is ignored)
});
