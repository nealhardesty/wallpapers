// Default settings for Pixel Quest. Saved settings store only what
// differs from these (SPEC §4.1). Tuned as on the old standalone page.
WP.defaults('quest', {
    configVersion: 1,

    // Hero
    hero: 'random',               // any key of QuestArt.HEROES, or 'random'
    heroVariant: 0,
    hat: 'none',
    companion: 'fairy',
    heroName: '',

    // World
    worldSize: 'medium',       // tiny | small | medium | large | huge
    worldTheme: 'mixed',
    dungeonCount: 3,
    cowLevel: 'sometimes',     // sometimes | always | never
    roomSize: 'classic',       // cozy | classic | roomy | vast
    seed: 0,                   // 0 = a new world every quest

    // Challenge
    difficulty: 'normal',
    enemyDensity: 1.0,

    // Presentation
    gameSpeed: 1.0,
    palette: 'none',
    crt: false,
    dayNight: 'normal',        // off | short | normal | long
    weather: true,
    critters: true,
    hud: 'top',                // top | bottom | off
    minimap: true,
    thoughts: true,
    dialogue: true,
    story: true,
    transition: 'scroll',      // scroll | fade | iris
    fpsCap: 60,

    // Interaction: play along with the keys, or click to send the hero
    keyboard: true,
    clickToGuide: true,

    // On-screen touch controller: off until someone asks for it
    touchControls: false,
    touchScale: 1.0,
    touchPosition: 'bottom',   // bottom | middle | top
    touchSwap: false           // D-pad on the right instead
});
