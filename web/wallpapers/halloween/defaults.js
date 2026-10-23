// Default settings for Halloween Night. Saved settings store only what
// differs from these (SPEC §4.1). Tuned as on the old standalone page.
WP.defaults('halloween', {
    configVersion: 5,

    // Scene
    theme: 'classic',
    scenePreset: 'graveyard',
    castle: true,
    castleSize: 1.0,
    grass: true,
    sceneSeed: 0,            // 0 picks a fresh scene every start
    horizon: 0.62,
    parallax: 1.0,

    // Jack-o'-lanterns
    pumpkinCount: 13,
    pumpkinSize: 1.0,
    litFraction: 0.8,
    flicker: 1.0,
    lightIntensity: 1.05,
    faceLight: true,
    breathing: true,

    // Sky
    moon: true,
    moonPhase: 0.82,
    starCount: 260,
    cloudBands: true,

    // Weather
    fog: true,
    fogDensity: 0.8,
    lightning: true,
    lightningRate: 1.0,
    wind: 1.0,

    // Critters
    bats: true,
    batCount: 40,
    ghosts: true,
    ghostCount: 5,
    zombies: true,
    zombieCount: 4,
    spiders: true,

    // Webs. Off by default: a web pinned across the corners of the
    // viewport sits in front of the page content rather than in the
    // scene, which not everyone wants on a homepage.
    webs: false,
    webCount: 5,
    webOpacity: 0.3,
    webSag: 1.0,
    dew: true,

    // Falling
    candyCount: 40,
    candyFallSpeed: 2,
    candySize: 1.0,
    fallingLeaves: true,
    leafCount: 40,

    // Render
    bloom: true,
    bloomStrength: 1.0,
    vignette: true,
    grain: 0.35,

    // Interaction
    interactive: true,
    clickToToggle: true
});
