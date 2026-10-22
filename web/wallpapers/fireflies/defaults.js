// Default settings for Fireflies. Saved settings store only what
// differs from these (SPEC §4.1).
WP.defaults('fireflies', {
    configVersion: 2,
    maxFireflies: 200,
    spawnRate: 0.05,
    baseSpeed: 0.8,
    speedVariation: 0.6,
    glowSize: 4,
    glowIntensity: 0.9,
    flashPeriod: 1.9,        // seconds between flashes
    flashPeriodVariation: 0.3,
    flashWidth: 0.17,        // fraction of the cycle actually lit
    emberGlow: 0.2,          // faint glow while dark, so they never vanish
    synchronize: true,
    syncStrength: 0.25,
    syncRadius: 240,
    fadeInTime: 180,
    fadeOutTime: 120,
    lifespan: 1800, // frames (30 seconds at 60fps)
    lifespanVariation: 600,
    directionChangeRate: 0.01,
    groupingTendency: 0.002,
    avoidanceRadius: 40,
    attractionRadius: 80,
    colorScheme: 'classic', // classic, rainbow, cool, warm
    brightness: 0.8,
    tailLength: 0.4 // length of each firefly's light trail; 0 = none
});
