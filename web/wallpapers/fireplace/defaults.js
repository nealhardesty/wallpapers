// Default settings for Fireplace. Saved settings store only what
// differs from these (SPEC §4.1). Tuned as on the old standalone page.
WP.defaults('fireplace', {
    configVersion: 1,

    // Fire
    intensity: 1.0,
    flameHeight: 1.5,
    flameSpread: 1.0,
    flameDensity: 1.0,
    turbulence: 1.0,
    flickerAmount: 0.55,
    flickerSpeed: 1.0,
    draftStrength: 0.35,

    // Colour
    palette: 'hardwood',
    heat: 1.0,
    flameOpacity: 1.0,

    // Logs
    showLogs: true,
    logCount: 4,
    logScale: 1.0,
    logThickness: 2.5,
    emberGlow: 1.0,
    coalCount: 660,
    popEvents: true,
    popRate: 1.0,

    // Atmosphere
    roomGlow: 1.0,
    glowRadius: 1.0,
    backgroundDarkness: 0.88,
    brickBackground: 'subtle',   // 'none' | 'subtle' | 'semi' | 'visible'
    sparks: true,
    sparkRate: 1.0,
    smoke: true,
    smokeOpacity: 0.22,

    // Companion
    companion: 'none',        // 'none' | 'cat' | 'dog'
    companionActivity: 3.0,

    // Decorations
    decorations: 'none',      // 'none' | 'auto' | 'holiday' | 'halloween' | 'birthday'

    // Performance
    maxParticles: 1400,
    softness: 2,          // flame buffer downscale; higher is softer and cheaper

});
