// Default settings for Zen Garden. Saved settings store only what differs
// from these (SPEC §4.1).
WP.defaults('zen-garden', {
    configVersion: 1,
    stones: 4,
    sand: 'white',
    tines: 5,
    grooveSpacing: 12,     // CSS px between the rake's tines
    fadeMinutes: 10,       // the wind smooths a groove away over this long
    gardener: true,
    gardenerDelay: 60,     // seconds without a touch before the gardener comes
    touch: 'rake',
    season: 'auto',
});
