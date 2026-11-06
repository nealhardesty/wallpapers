// Default settings for A Very Small Christmas. Saved settings store only
// what differs from these (SPEC §4.1).
WP.defaults('small-christmas', {
    configVersion: 1,
    treeSize: 'small',      // tiny, small, medium
    lightPattern: 'twinkle', // twinkle, chase, alternate, together, steady
    lights: 'classic',      // classic, warm, blue, candy
    garland: true,
    ornaments: true,
    presents: 3,            // under the tree (three more on Christmas Day)
    moveMinutes: 4,         // about how often the tree moves house (0: never)
    train: true,            // the toy train goes round now and then
    trainMinutes: 2,        // about how often
    laps: 3,                // times round
    trainSpeed: 1,
    cars: 3,                // behind the engine: a tender, a car with a present, a caboose
    palette: 'night',       // night (full colour), pocket (four greens), amber, ink
    pixelSize: 1,           // × the automatic pixel size
    fps: 12,                // a retro frame rate
    snow: 0.5,              // pixel snow (0: none)
    sky: true,              // stars and a crescent moon
    scanlines: false,       // an old screen's lines
    sleigh: 'sometimes',    // never, eve (Christmas Eve only), sometimes (and often on Christmas Eve)
    touch: true,            // tap the tree, the train, or the floor
});
