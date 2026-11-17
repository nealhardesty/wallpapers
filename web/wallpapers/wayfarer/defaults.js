// Default settings for Wayfarer. Saved settings store only what
// differs from these (SPEC §4.1).
WP.defaults('wayfarer', {
    configVersion: 2,
    camera: 'follow',      // follow, orbit, first, drift
    orbitMode: 'fixed',    // orbit: fixed (holds where you leave it) or turning (circles by itself)
    orbitAzimuth: 35,      // degrees round the traveller: 0 behind, 90 at their right hand, 180 in front
    orbitElevation: 18,    // degrees up: 2 in the grass, 90 straight overhead
    orbitDistance: 8,      // metres from the traveller
    pace: 1,               // × a stroll (1.75 m/s)
    traveller: 'ranger',   // ranger, wizard, bard, knight, barbarian, northman, druid, archer, rogue
    warpaint: true,        // the barbarians' blue bars across the cheeks
    craft: 'sometimes',    // never, sometimes, often: how often the druid changes shape and the rogue goes unseen
    companions: 3,         // how many walk with the traveller, when it is left to chance (0 to 12)
    companionPick: 'surprise',     // surprise (a named cat and then one from each kind by turns, by the world's seed) or choose
    companionChoice: ['moofy', 'hound', 'raven'],      // who, when it is 'choose': everyone ticked, in the order ticked (the first 12 walk)
    rests: true,           // stops to look at a view
    campfire: true,        // sits by a fire a while at night
    time: 'cycle',         // cycle, clock, dawn, day, dusk, night
    dayMinutes: 12,        // a full day and night, in 'cycle'
    weather: 'auto',       // auto, clear, fair, cloudy, rain
    rainOften: 1,          // × how much of the time it rains, in 'auto'
    season: 'journey',     // journey (it turns along the road), spring, summer, autumn, winter
    biomePick: 'all',      // which countries the road passes through: all, woods, open, shore, high, or choose
    biomeChoice: ['meadow', 'forest', 'deepwood', 'lake', 'pass', 'farm', 'moor', 'coast', 'grove'],      // which, when it is 'choose' (none ticked is all of them)
    towns: 1,              // × how many of the places along the road are settled
    life: 1,               // × folk and traffic
    wildlife: 'some',      // the wild animals of each country, and the herds and flocks: none, few, some or plenty
    wonders: true,         // dragons, airships and balloons, far off
    touch: true,           // a drag looks around
    fov: 56,               // degrees, top to bottom on a wide screen
});
