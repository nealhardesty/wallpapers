// Default settings for Sky Island. Saved settings store only what differs
// from these (SPEC §4.1).
WP.defaults('sky-island', {
    configVersion: 1,
    // The island
    seed: 0,                // 0: a new island every load; otherwise always this one (Keep this island sets it)
    islandSize: 1,          // × the usual width
    houses: 8,              // houses, at most (a narrow screen fits fewer)
    forest: 1,              // how wooded, 0 to 2
    fields: true,           // a fenced field or two
    dragon: true,           // something lives in a cave in the cliff
    // Sky and weather
    sky: 'live',            // live (the real hour), cycle (a day in a few minutes), day, golden, night
    cycleMinutes: 4,        // minutes for a whole day, when sky is cycle
    weather: 'random',      // random, fair, rain, snow
    wind: 1,                // × the usual breeze
    clouds: 1,              // × the usual clouds
    // Seasons and holidays
    season: 'auto',         // auto (by the date), spring, summer, autumn, winter
    holiday: 'auto',        // auto (by the date), none, or one to keep
    specialDates: '',       // the owner's own party days, one a line: "MM-DD Name"
    decorations: true,      // the holiday's trimmings
    // The town
    people: 20,             // townsfolk, at High
    lights: true,           // windows and lamps lit after dark
    smoke: true,            // chimney smoke
    visitMinutes: 4,        // about how often another island drifts past (0: never)
    balloon: true,          // a balloon may bring a visitor over
    // Cats and pets
    cats: ['moofy', 'butters', 'waffles', 'ras', 'ibbie', 'maus', 'turkey', 'harry', 'persian'],
    strays: 3,              // cats of no fixed name
    dogs: 2,
    // Wildlife
    wildlife: 1,            // 0 to 2
    // Advanced
    callouts: true,         // toasts: the island's name, who's passing, who stole the fish
    touch: true,            // tap a cat, a person, the lake, a house at night, or the sky
    pixelSize: 1,           // × the automatic pixel size
    fps: 20,
});
