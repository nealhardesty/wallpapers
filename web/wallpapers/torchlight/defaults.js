// Default settings for Torchlight Descent. Saved settings store only what
// differs from these (SPEC §4.1).
WP.defaults('torchlight', {
    configVersion: 1,
    // The descent
    descents: 'often',      // often (one after another after dark), hourly (on the hour), evening (once at nightfall), newyear (only New Year's Eve), tap (only when called)
    gapMinutes: 2,          // minutes between descents, when 'often'
    torches: 28,            // skiers, a torch each
    spacing: 8,             // metres between one skier and the next
    pace: 1,                // × a steady descent
    tumbles: 0.35,          // how often somebody sits down in the snow, 0 to 1
    finale: 'heart',        // what the torches make when they are planted at the bottom: heart, ring, star, line, surprise
    jackets: 'mixed',       // mixed (everyone in their own) or school (the ski school in red)
    newYear: true,          // on New Year's Eve the grand descent spells the new year on the mountain at midnight
    fireworks: 'newyear',   // newyear (at midnight on New Year's Eve), finale (after every descent too), often, never; a tap on the night sky always sends one up
    // Cats and company
    windowCat: true,        // the inn's cat in the parlour window
    backpackCat: true,      // and it rides down in the guide's rucksack, with a lantern of its own
    cats: 2,                // more cats about the inn
    catSize: 1,             // × as large as life (from across the valley a cat is very small)
    dog: true,              // the St Bernard and his barrel
    snowcat: true,          // the snowcat, grooming the run by its lamps
    lift: true,             // the chairlift
    daySkiers: true,        // skiers by day
    // The valley
    inn: true,
    innName: 'Gasthof Sternhorn',
    chalets: 10,            // at most; a phone has room for fewer
    chapel: true,
    lamps: true,
    tree: 'season',         // the Christmas tree by the inn: season (end of November to Epiphany), always, never
    treeColors: 'warm',     // warm, classic, ice
    candles: 'season',      // a candle in every window: season, always, never
    wreaths: true,
    nearLights: false,      // lights on the firs in the corners
    windows: true,
    // Sky and weather
    sky: 'dusk',            // dusk (the torches' hour), live (the real hour), night, day, cycle
    cycleMinutes: 12,       // minutes for a whole day, when sky is cycle
    moon: true,
    moonPhase: 'live',      // live, full, gibbous, half, crescent
    moonSize: 1,
    stars: true,
    clouds: 3,
    snowfall: 0.6,
    flakeSize: 1,
    wind: 0.5,
    smoke: true,
    // Advanced
    horizon: 0.56,          // where the valley meets the mountain, as a share of the height
    brush: 1,               // × the width of every stroke
    touch: true,            // taps light windows, send the torches down, pet cats (off: touch is ignored)
});
