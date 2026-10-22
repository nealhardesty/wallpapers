// Default settings for Falling Leaves. Saved settings store only what
// differs from these (SPEC §4.1). Tuned as on the old standalone page.
WP.defaults('leaves', {
    configVersion: 3,
    collectLeaves: true,
    preSeedPile: true,
    maxSettled: 14000,
    // Fraction of the viewport height the deepest bank may reach
    pileDepth: 0.35,
    pileUnevenness: 0.6,
    pileDensity: 1.5,
    maxLeaves: 90,
    spawnRate: 0.07,
    fallSpeed: 2,
    fallSpeedVariation: 1.5,
    swayAmount: 1.5,
    windChance: 0.003,
    windIntensity: 12,
    windDuration: 240,
    leafTypes: ['maple', 'oak', 'birch', 'elm'],
    seasonalColors: 'autumn', // autumn, late_autumn, early_winter
    leafOpacity: 0.85,
    leafSizeVariation: 0.4
});
