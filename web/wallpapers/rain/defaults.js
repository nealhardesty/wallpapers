// Default settings for Rain. Saved settings store only what
// differs from these (SPEC §4.1).
WP.defaults('rain', {
    configVersion: 2,
    maxRaindrops: 400,
    spawnRate: 2.6,
    dropSpeed: 12,
    dropSpeedVariation: 6,
    dropLength: 20,
    dropWidth: 2,
    windChance: 0.001,
    windIntensity: 8,
    windDuration: 180,
    puddleRate: 0.3,
    maxPuddles: 50,
    splashRate: 0.8,
    rainOpacity: 0.7,
    puddleOpacity: 0.4,
    lightning: true,
    lightningChance: 0.07,
    groundMist: true,
});
