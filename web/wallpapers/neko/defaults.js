// Default settings for Neko. Saved settings store only what differs from
// these (SPEC §4.1).
WP.defaults('neko', {
    configVersion: 2,      // 2: coats drawn in code replaced the sprite themes
    coat: 'classic',
    size: 48,              // on-screen size; multiples of 16 keep the pixels crisp
    speed: 3,
    idleTimeout: 5000,     // ms before idle animations
    sleepTimeout: 15000,   // ms before sleep
    animationSpeed: 8,     // frames between sprite changes
});
