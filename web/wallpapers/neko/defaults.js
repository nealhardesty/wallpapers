// Default settings for Neko. Saved settings store only what differs from
// these (SPEC §4.1).
WP.defaults('neko', {
    configVersion: 2,      // 2: coats drawn in code replaced the sprite themes
    cats: 1,               // up to 42, for the crazy cat person
    coat: 'classic',
    hat: 'holiday',        // hats on holidays only
    size: 64,              // on-screen size; the art is 32 px, so multiples of 32 stay crisp
    speed: 3,
    yarn: true,            // a tap or click tosses a ball of yarn
    idleTimeout: 5000,     // ms before idle animations
    sleepTimeout: 15000,   // ms before sleep
    wander: true,          // roam and play on their own when the pointer rests (or there's none)
    wanderAfter: 30000,    // ms without a pointer before a cat sets off
    animationSpeed: 8,     // frames between sprite changes
});
