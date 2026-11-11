// Default settings for Matrix. Saved settings store only what
// differs from these (SPEC §4.1). configVersion 2: the rain was rebuilt
// (SPEC §10.32); the old theme, fontSize and tail settings are gone.
WP.defaults('matrix', {
    configVersion: 2,

    // The code
    look: 'operator',       // 'operator' (the 1999 film) | 'classic' (the sequels' titles) | 'resurrections'
    colour: 'green',        // 'green' | 'amber' | 'blue' | 'red' | 'purple' | 'cyan' | 'white' | 'rainbow'
    glyphSize: 15,          // a cell's width in CSS px on a laptop (scaled with the screen)

    // The rain
    density: 0.9,           // share of columns raining
    speed: 1,               // × 18 rows a second
    trail: 0.6,             // trail length, screens
    brightHeads: 0.3,       // share of strings with a bright head
    cycle: 1,               // × how often a lit symbol changes
    stutter: true,          // columns stall now and then
    intro: true,            // the code drips in from the top on start

    // Picture
    depth: true,            // a smaller, dimmer layer of rain behind
    glow: true,             // bloom round the heads
    crt: false,             // scanlines
    fps: 30,
    touch: true,            // a tap splashes the code
});
