// Default settings for Frost on the Glass. Saved settings store only what
// differs from these (SPEC §4.1).
WP.defaults('frost', {
    configVersion: 2,       // 2026-11-11: the tree's style, size, width and lights
    growMinutes: 6,         // how long the frost takes to creep in
    coverage: 0.55,         // how far in from the edges it reaches
    cycleMinutes: 30,       // the glass thaws and frosts afresh this often (0: never)
    sparkle: true,          // glints in the frost
    doodles: true,          // someone inside draws in it now and then
    doodleMinutes: 8,       // about how often
    lights: 'warm',         // the tree's lights: warm, multi, blue, candle
    twinkle: 1,             // how much they breathe
    blur: 1,                // how far out of focus the room is (bokeh size)
    treeSide: 'center',     // where the tree stands: left, center, right
    treeStyle: 'fir',       // fir, charlie (a Charlie Brown tree), none
    treeSize: 1,            // × its height
    treeWidth: 1,           // × its width
    lightCount: 46,         // bulbs on it (before the screen's size scales them)
    window: 'four',         // panes: single, two, four, six
    frameColour: 'white',   // white, wood, green, red
    snow: 0.5,              // snow falling outside (0: none)
    touch: true,            // drag to draw in the frost, tap to breathe on it
});
