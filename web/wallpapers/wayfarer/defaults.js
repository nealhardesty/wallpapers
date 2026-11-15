// Default settings for Wayfarer. Saved settings store only what
// differs from these (SPEC §4.1).
WP.defaults('wayfarer', {
    configVersion: 1,
    camera: 'follow',      // follow, orbit, first, drift
    orbitMode: 'fixed',    // orbit: fixed (holds where you leave it) or turning (circles by itself)
    orbitAzimuth: 35,      // degrees round the traveller: 0 behind, 90 at their right hand, 180 in front
    orbitElevation: 18,    // degrees up: 2 in the grass, 90 straight overhead
    orbitDistance: 8,      // metres from the traveller
    pace: 1,               // × a stroll (1.75 m/s)
    traveller: 'ranger',   // ranger, wizard, bard, knight, barbarian, northman, druid, archer, rogue
    warpaint: true,        // the barbarians' blue bars across the cheeks
    craft: 'sometimes',    // never, sometimes, often: how often the druid changes shape and the rogue goes unseen
    companion: 'fox',      // the first of the company, who always comes: any of them, 'any' (nobody in particular) or 'none' (walk alone)
    companions: 3,         // how many walk with the traveller, the first included (0 to 6)
    companionPick: 'surprise',     // surprise (a named cat and one from each kind, by the world's seed), cats, dogs, farm, wild, fantastic, or choose
    companionChoice: ['moofy', 'hound', 'raven'],      // who, when it is 'choose'
    rests: true,           // stops to look at a view
    campfire: true,        // sits by a fire a while at night
    time: 'cycle',         // cycle, clock, dawn, day, dusk, night
    dayMinutes: 12,        // a full day and night, in 'cycle'
    weather: 'auto',       // auto, clear, fair, cloudy, rain
    rainOften: 1,          // × how much of the time it rains, in 'auto'
    season: 'journey',     // journey (it turns along the road), spring, summer, autumn, winter
    towns: 1,              // × how many of the places along the road are settled
    life: 1,               // × folk, animals and traffic
    wonders: true,         // dragons, airships and balloons, far off
    touch: true,           // a drag looks around
    fov: 56,               // degrees, top to bottom on a wide screen
});
