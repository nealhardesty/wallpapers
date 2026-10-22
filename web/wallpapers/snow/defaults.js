// Default settings for Snow. Saved settings store only what differs from
// these (SPEC §4.1). Tuned as on the old standalone page: a dense, treeless
// blizzard on black. Trees are a slider away.
WP.defaults('snow', {
    configVersion: 1,

    // Trees
    treeCount: 0,
    treeScale: 1.0,

    // Snowflakes
    maxSnowflakes: 4000,
    spawnRate: 0.4,             // chance per frame of a new flake
    snowSpeed: 7.0,             // px per frame at 60 fps
    snowSpeedVariation: 1.5,
    layerCount: 10,             // depth layers for parallax

    // Wind
    windChance: 0.002,          // chance per frame of a gust starting
    windIntensity: 8,
    windDuration: 300,          // frames
    windPhaseInDuration: 120,
    windPhaseOutDuration: 120,

    // Accumulation
    accumulationRate: 0.05,     // px per flake that lands
    maxAccumulation: 12,        // px
});
