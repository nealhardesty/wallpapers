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
    townName: 'Evergreen Hollow',   // on the sign by the green (empty: no sign)
    townSign: true,
    houses: 40,             // at most (a phone has room for fewer, a very wide screen for more)
    houseStyles: ['colonial', 'cape', 'saltbox', 'farmhouse', 'cottage'],   // which kinds of house are built
    housePaint: 'village',  // village (a mixture), white, bright, brick
    shops: ['bakery', 'toys', 'books', 'sweets'],   // on Main Street, of: bakery, toys, books, sweets, post, tea
    store: true,            // the general store
    inn: true,
    church: true,           // the meetinghouse, with its steeple and its clock
    school: true,           // the red schoolhouse and its bell
    mill: true,             // the mill on the brook, its wheel turning
    bridge: true,           // the covered bridge
    smoke: true,            // chimney smoke
    windows: true,          // windows lit after dark, each household keeping its own hours
    candles: true,          // a candle in every window of some houses
    lamps: true,            // street lamps
    lamplighter: true,      // somebody lights them, one by one, at dusk
    snowman: true,
    bandstand: true,        // on the green, hung with garlands
    treeFarm: true,         // Christmas trees in rows up the hill, and the barn that sells them
    cabin: true,            // the log house up the mountain
    trail: true,            // the way up to it through the woods, with its lanterns
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
    trainSpeed: 1,          // × its usual speed
    // Pond
    pond: true,
    skaters: 9,             // at High
    bonfire: true,
    cocoa: true,            // the cocoa hut by the pond
    reflections: true,      // the town in the ice
    // People and animals
    nightLife: 'owls',      // sleeps (everyone keeps real hours), owls (a few are out all night), always (as busy at 3 a.m. as at 3 p.m.)
    villagers: 10,          // out and about at once, at High (fewer late at night)
    sledders: 3,            // on the hill by the farm, at High (0: no hill)
    carollers: 8,           // rounds an hour, after dark, with a lantern
    horse: 6,               // times an hour a horse and sleigh come over the bridge
    dogs: 8,                // dogs an hour
    cat: true,              // on the store's porch
    cats: 3,                // more of them, about the town
    catSize: 1,             // × the usual size
    squirrels: 3,           // on the fence and the firs in the corner
    fox: true,              // on the far bank, late
    deer: true,             // in a glade in the woods; on the green, before anyone is up
    bears: 12,              // times an hour a bear and her cubs cross the other glade (0: no glade)
    rabbits: true,
    cardinal: true,
    mice: true,             // a lit window at the foot of the big fir
    peopleSize: 1,          // × the usual size
    // Extras
    touch: true,            // taps light houses, trip skaters, catch the snowman looking (off: touch is ignored)
    // Advanced
    horizon: 0.34,          // where the land meets the sky, as a share of the height
});
