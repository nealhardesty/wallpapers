// Default settings for Harvest Valley. Saved settings store only what
// differs from these (SPEC §4.1).
WP.defaults('harvest', {
    configVersion: 1,
    // Sky
    sky: 'live',            // live (the real hour), cycle (a day in a few minutes), day, golden, night
    cycleMinutes: 4,        // minutes for a whole day, when sky is cycle
    sun: true,
    moon: true,
    moonPhase: 'live',      // live (the real phase), full, gibbous, half, crescent
    moonSize: 1,            // × the usual size
    stars: true,            // stars, and the odd shooting one
    clouds: 5,              // clouds drifting, at High
    // Village
    village: true,
    houses: 6,              // cottages, at most (a narrow screen has fewer)
    windmill: true,
    smoke: true,            // chimney smoke
    lights: true,           // windows and lamps lit after dark
    bonfire: true,          // a harvest bonfire on the green, after dark
    bunting: true,          // flags between the roofs (they spell the holiday in Thanksgiving week)
    // Fields
    fields: true,           // quilted farmland and the corn
    scarecrow: true,
    pumpkinPatch: true,
    greatPumpkin: true,     // the Great Pumpkin may rise from the most sincere patch, at night
    // Orchard
    orchard: true,
    trees: 10,              // apple trees, at most
    treeSize: 1,            // × the usual size
    apples: 14,             // apples shaken loose each minute, at High
    squirrels: 3,           // at High
    turkeys: 2,
    cats: 2,                // mostly asleep
    // Leaves and wind
    leaves: 140,            // leaves in the air at once, at High
    foliage: 'mixed',       // mixed, golden, crimson, russet, ember, burgundy, early, custom
    autumnColors: ['#c9a227', '#d98a1f', '#b8432a', '#8a9a32', '#e0b13a', '#a8522a'],   // the custom palette: trees, leaves, hills
    wind: 1,                // × the usual breeze
    // Geese
    geese: 20,              // flocks crossing each hour, at High
    flock: 11,              // geese in a flock, at most
    // Air
    mist: 0.5,              // valley mist, thickest at dawn and dusk
    beams: true,            // low sun slanting through the trees
    callouts: true,         // toasts: the moon's name, the holiday, the Great Pumpkin
    touch: true,            // a tap shakes the nearest tree (off: touch is ignored)
    // Advanced
    horizon: 0.5,           // where the far hills sit, as a share of the height
});
