// Default settings for Painted Village. Saved settings store only what
// differs from these (SPEC §4.1).
WP.defaults('painted-village', {
    configVersion: 1,
    // Sky
    sky: 'live',            // live (the real hour), cycle (a day in a few minutes), day, dusk, night
    cycleMinutes: 4,        // minutes for a whole day, when sky is cycle
    moon: true,
    moonPhase: 'live',      // live (the real phase), full, gibbous, half, crescent
    moonSize: 1,            // × the usual size
    stars: true,
    clouds: 4,              // snow clouds drifting
    aurora: 'sometimes',    // sometimes, always, never: on a dark night
    sleigh: 8,              // times an hour a certain sleigh crosses, after dark (far more on Christmas Eve)
    // Snow
    snowfall: 1,            // × the usual fall
    flakeSize: 1,           // × the usual size
    wind: 0.6,              // × how far the snow slants and the smoke leans
    // The painting
    brush: 1,               // × the width of every stroke: fine to bold
    // Village
    village: true,
    houses: 22,             // at most (a phone has room for fewer, a very wide screen for more)
    church: true,           // the meetinghouse, with its steeple and its clock
    bridge: true,           // the covered bridge
    smoke: true,            // chimney smoke
    windows: true,          // windows lit after dark, each household keeping its own hours
    candles: true,          // a candle in every window of some houses
    lamps: true,            // street lamps
    lamplighter: true,      // somebody lights them, one by one, at dusk
    snowman: true,
    bandstand: true,        // on the green, hung with garlands
    treeFarm: true,         // Christmas trees in rows up the hill, and the barn that sells them
    cabin: true,            // one lit window up the mountain
    // Lights and trees
    lights: true,           // strings on the eaves, and bulbs on the grand tree
    lightColors: 'classic', // classic, warm, ice, candy, jewel, custom
    lightPalette: ['#ff3d2e', '#2fd05a', '#3f8cff', '#ffd23f', '#ff8a1e'],   // the custom colours
    twinkle: 1,             // × how fast the bulbs twinkle (0: steady)
    lightsByDay: true,      // the strings glow a little in daylight too
    decorate: 'all',        // all (everything is up), advent (a little more each day until Christmas Eve)
    townTree: true,         // the grand tree on the green
    townTreeSize: 1,        // × its usual height
    train: true,            // the toy train round the foot of the grand tree
    // Pond
    pond: true,
    skaters: 9,             // at High
    bonfire: true,
    cocoa: true,            // the cocoa hut by the pond
    reflections: true,      // the town in the ice
    // People and animals
    villagers: 10,          // out and about at once, at High (fewer late at night)
    sledders: 3,            // on the hill by the farm, at High (0: no hill)
    carollers: 8,           // rounds an hour, after dark, with a lantern
    horse: 6,               // times an hour a horse and sleigh come over the bridge
    dogs: 8,                // dogs an hour
    cat: true,              // on the store's porch
    fox: true,              // on the far bank, late
    deer: true,             // on the green, before anyone is up
    rabbits: true,
    cardinal: true,
    mice: true,             // a lit window at the foot of the big fir
    peopleSize: 1,          // × the usual size
    // Extras
    callouts: true,         // toasts: the days to Christmas, the clock striking, sleigh bells
    touch: true,            // taps light houses, trip skaters, catch the snowman looking (off: touch is ignored)
    // Advanced
    horizon: 0.34,          // where the land meets the sky, as a share of the height
});
