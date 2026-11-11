// Default settings for Fireplace. Saved settings store only what
// differs from these (SPEC §4.1). Tuned as on the old standalone page.
// configVersion 2 (2026-11-11): the stack and the pieces of wood, the
// puffing, the blue base, the heat haze, and the burn-down cycle.
WP.defaults('fireplace', {
    configVersion: 2,

    // Fire
    intensity: 1.0,
    flameHeight: 1.5,
    flameSpread: 1.0,
    flameDensity: 1.0,
    turbulence: 1.0,
    flickerAmount: 0.55,
    flickerSpeed: 1.0,
    draftStrength: 0.35,
    puff: 0.5,                // the puffing of the flame, a few beats a second
    tongues: 0.5,             // how much taller than wide each tongue of flame is drawn
    blueBase: 0.35,           // the blue at the roots, plainer as it dies down
    burn: 'steady',           // 'steady' | 'cycle': dies down, a log drops, a fresh one lands and catches
    burnMinutes: 40,          // a cycle's length

    // Colour
    palette: 'hardwood',
    heat: 1.0,
    flameOpacity: 1.0,

    // Logs
    showLogs: true,
    stack: 'heap',            // 'heap' | 'cabin' | 'teepee' | 'topdown' | 'leanto' | 'backlog' | 'kindling'
    pieces: ['rounds', 'splits', 'sticks'],   // what goes on: rounds, splits, sticks (kindling), snapped (torn ends), punky (rotten)
    logCount: 4,
    logScale: 1.0,
    logThickness: 2.5,
    emberGlow: 1.0,
    charring: 0.6,
    bedDepth: 1.0,
    grate: 'grate',           // 'grate' | 'andirons' | 'none'
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
    haze: true,               // heat haze over the fire (High)

    // Companion
    companion: 'none',        // 'none' | 'cat' | 'dog'
    companionActivity: 3.0,

    // Decorations
    decorations: 'none',      // 'none' | 'auto' | 'holiday' | 'halloween' | 'birthday'

    // Performance
    maxParticles: 1400,
    softness: 2,          // flame buffer downscale; higher is softer and cheaper

});
