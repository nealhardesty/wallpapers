// Default settings for Wayfarer. Saved settings store only what
// differs from these (SPEC §4.1).
WP.defaults('wayfarer', {
    configVersion: 1,
    camera: 'follow',      // follow, first, drift
    pace: 1,               // × a stroll (1.75 m/s)
    traveller: 'ranger',   // ranger, wizard, bard, knight
    companion: 'fox',      // fox, dog, pony, cat, wisp, none
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
