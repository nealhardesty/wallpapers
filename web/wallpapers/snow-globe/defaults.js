// Default settings for Snow Globe. Saved settings store only what differs
// from these (SPEC §4.1).
WP.defaults('snow-globe', {
    configVersion: 1,
    scene: 'auto',          // auto (by the date), cottage, village, pond, catcottage, tree
    base: 'wood',           // wood, brass, ceramic, silver
    size: 1,                // × the globe
    flakes: 'mixed',        // snow, mixed (snow and glitter), glitter, rainbow
    snow: 1,                // × how much snow is in the water
    settle: 60,             // seconds the snow takes to come down
    lights: true,           // the little houses' windows and lamps lit
    turning: 'music',       // music (turns while it plays), always (slowly), never
    musicSeconds: 45,       // how long one winding plays
    tune: 'auto',           // auto (a different one each time), silent, jingle, deck, wish
    sound: false,           // play the music box out loud (after a first tap)
    volume: 0.5,            // how loud
    cat: 'random',          // random (one of them each day), none, or one of the cats by name
    catSide: 'right',       // where the cat sits: left, right
    mischief: 0.5,          // how often the cat taps the glass
    autoShake: 'cat',       // cat (it shakes the globe when the snow has settled a while), timer, off
    shakeMinutes: 3,        // how long it all stays still first
    room: 'sill',           // sill (a window behind), mantel, desk
    candle: true,           // a candle beside the globe
    snowOutside: 0.6,       // snow falling past the window
    treeLights: true,       // the room's tree lights, out of focus in the glass
    touch: true,            // a drag shakes it, a tap winds it (or strokes the cat); off ignores touch
});
