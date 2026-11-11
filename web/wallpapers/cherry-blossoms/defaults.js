// Default settings for Cherry Blossoms. Saved settings store only what
// differs from these (SPEC §4.1). configVersion 2: rebuilt (SPEC §10.33):
// the tree, the sky, the ground and the wind are new; windChance,
// windDuration and showBranches are gone.
WP.defaults('cherry-blossoms', {
    configVersion: 2,

    // Petals
    petalCount: 180,
    petalSize: 1.0,
    fallSpeed: 1.0,
    rotationSpeed: 1.0,     // tumbling
    flutter: 0.7,           // turning on the long axis
    swayAmount: 2,
    fadeEnabled: false,     // fade out near the ground instead of landing
    petalColors: ['#ffb7c5', '#ffc0cb', '#ff8fb1', '#ffd1dc', '#fff0f3'],

    // Wind
    windStrength: 3,
    gusts: 3,               // gusts a minute
    gustLength: 6,          // seconds

    // The tree
    tree: 'bough',          // 'bough' | 'canopy' | 'branches' | 'none'
    treeSide: 'left',       // 'left' | 'right' (the bough)
    branchCount: 5,         // branches off the bough, or hanging branches
    blossoms: 1.0,          // how thick the blossom is

    // The scene
    sky: 'day',             // 'day' | 'dusk' | 'night' | 'clock'
    hills: true,
    sun: true,
    ground: 'grass',        // 'grass' | 'path' | 'water' | 'none'

    touch: true,
});
