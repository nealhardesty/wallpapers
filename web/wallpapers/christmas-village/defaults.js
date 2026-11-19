// Default settings for Christmas Village. Saved settings store only what
// differs from these (SPEC §4.1).
WP.defaults('christmas-village', {
    configVersion: 1,
    // Sky
    sky: 'live',            // live (the real hour), cycle (a day in a few minutes), day, dusk, night
    cycleMinutes: 4,        // minutes for a whole day, when sky is cycle
    moon: true,
    moonPhase: 'live',      // live (the real phase), full, gibbous, half, crescent
    moonSize: 1,            // × the usual size
    stars: true,            // stars, and the odd shooting one
    clouds: 4,              // snow clouds drifting
    aurora: 'sometimes',    // sometimes, always, never: over the mountains on a dark night
    sleigh: 8,              // times an hour the sleigh crosses, after dark (far more on Christmas Eve)
    // Snow
    snowfall: 1,            // × the usual fall (which is a lot)
    flakeSize: 1,           // × the usual size
    wind: 0.6,              // × how far the snow slants and the smoke leans
    // Village
    village: true,
    houses: 12,             // at most (a narrow screen has fewer)
    church: true,           // the meetinghouse, with its steeple and its clock
    gazebo: true,           // the bandstand on the green
    bridge: true,           // the covered bridge and the brook
    smoke: true,            // chimney smoke
    windows: true,          // windows lit after dark, each household keeping its own hours
    candles: true,          // a candle in every window of some houses, all night
    lamps: true,            // street lamps
    snowman: true,
    // Lights and trees
    lights: true,           // strings on the eaves, and bulbs on the lit trees
    lightColors: 'classic', // classic, warm, ice, candy, jewel, custom
    lightPalette: ['#ff3d2e', '#2fd05a', '#3f8cff', '#ffd23f', '#ff8a1e'],   // the custom colours
    twinkle: 1,             // × how fast the bulbs twinkle (0: steady)
    lightsByDay: true,      // the strings glow a little in daylight too
    decorate: 'all',        // all (everything is up), advent (a little more each day until Christmas Eve)
    townTree: true,         // the grand tree on the green
    townTreeSize: 1,        // × its usual height
    litTrees: 14,           // lit trees besides, at most
    train: true,            // the toy train round the foot of the grand tree
    trainSpeed: 1,          // × its usual speed
    // Pond
    pond: true,
    skaters: 8,             // at High
    tracks: true,           // skates mark the ice, and the marks fade
    hut: true,              // the cocoa hut
    bonfire: true,
    reflections: true,      // the lights in the ice
    // Tree farm
    farm: true,
    farmRows: 5,
    farmVisits: 12,         // families who come for a tree, each hour
    // Cabin
    cabin: true,            // up the mountain
    deer: 3,
    owl: true,
    roofSlides: true,       // snow lets go of the cabin roof now and then
    // People and animals
    villagers: 9,           // out and about at once, at High (fewer late at night)
    carollers: 10,          // rounds an hour, after dark
    sledders: 3,
    cats: 6,                // mostly asleep
    catSize: 1,             // × the usual size
    dogs: 10,               // dogs an hour: some on a lead, some loose in the snow
    peopleSize: 1,          // × the usual size
    // Extras
    callouts: true,         // toasts: the days to Christmas, the clock striking, the sleigh
    touch: true,            // taps wake cats, trip skaters, light houses (off: touch is ignored)
    // Advanced
    horizon: 0.4,          // where the mountains stand, as a share of the height
    scale: 1,               // × the size of everything on the ground
});
