// Default settings for Fish Tank. Saved settings store only what
// differs from these (SPEC §4.1). Tuned as on the old standalone page.
WP.defaults('fishtank', {
    configVersion: 1,

    // Livestock
    fishCount: 26,
    population: 'community',
    swimSpeed: 1.0,
    schooling: 1.0,

    // Tank
    waterTheme: 'planted',
    waterLevel: 0.055,
    plantDensity: 1.2,
    foregroundPlants: true,
    hardscape: 'both',
    snail: true,

    // Light and water
    lightIntensity: 1.05,
    causticStrength: 1.0,
    godRays: true,
    depthBlur: true,
    bubbleRate: 1.0,
    motes: true,

    // Interaction
    cursorMode: 'curious',   // curious | shy | off
    clickToFeed: true
});
