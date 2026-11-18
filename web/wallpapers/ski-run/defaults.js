// Default settings for Fresh Tracks. Saved settings store only what
// differs from these (SPEC §4.1).
WP.defaults('ski-run', {
    configVersion: 1,
    camera: 'follow',          // follow, front, diorama, auto
    speed: 1,                  // × the cruise (14 m/s on a groomed piste)
    steep: 1,                  // × every section's grade
    touch: true,               // a drag carves, a tap sends it
    leadGear: 'ski',           // ski, board
    leadWho: 'woman',          // woman, man
    leadKit: 'ember',
    friends: 2,                // 1 to 3
    friend1Gear: 'board',
    friend1Who: 'man',
    friend1Kit: 'glacier',
    friend2Gear: 'ski',
    friend2Who: 'woman',
    friend2Kit: 'sunflower',
    friend3Gear: 'board',
    friend3Who: 'man',
    friend3Kit: 'moss',
    tricks: 1,                 // × how often an air becomes a trick
    wipeouts: true,
    others: 1,                 // × strangers and ski schools on the pistes
    wildlife: true,            // a hare or a fox across the piste, an eagle over the valley
    sections: ['groomer', 'powder', 'glade', 'pipe', 'park', 'rollers', 'lake', 'cliff', 'gully', 'cattrack', 'hut', 'lodge'],
    time: 'cycle',             // cycle, clock, dawn, day, dusk, night
    dayMinutes: 20,            // a full day and night, in 'cycle'
    weather: 'auto',           // auto, clear, flurries, snow, fog
    snowOften: 1,              // × how much of the time the weather closes in, in 'auto'
    zoom: 1,                   // × every camera's lens
});
