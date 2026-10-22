// Default settings for Neko. Saved settings store only what
// differs from these (SPEC §4.1).
WP.defaults('neko', {
    theme: 'neko',
    speed: 3,
    size: 32,
    idleTimeout: 5000, // ms before idle animations
    sleepTimeout: 15000, // ms before sleep
    animationSpeed: 8, // frames between sprite changes
    enableSounds: false
});
