// Default settings for The Reading Room. Saved settings store only what
// differs from these (SPEC §4.1).
WP.defaults('reading-room', {
    configVersion: 1,
    time: 'live',          // live, cycle, morning, afternoon, dusk, night
    cycleMinutes: 8,       // a whole day and night, in 'cycle'
    season: 'live',        // live (the date's), winter, spring, summer, autumn: the sun's path and what is outside the windows
    weather: 'season',     // season (snow, petals, swifts or leaves by the season), snow, rain, clear
    outside: 1,            // × how much of it there is
    clouds: 4,             // clouds across the windows
    sunbeams: true,        // the sun through the windows, its patches on the floor and the bookcases
    shafts: 1,             // × how plain the shafts are in the air
    beamStrength: 1,       // × how bright the patches of sun are
    moonbeams: true,       // the moon through the windows at night
    dust: 1,               // × dust turning in the shafts
    lamps: 'dusk',         // dusk (lit a table at a time as it gets dark), always, never
    shades: 'green',       // the lamps' glass: green, amber, ruby, blue, milk
    chandeliers: true,     // one in every bay, lit after dark
    fire: true,            // the fire lit (in summer, only of an evening)
    fireplace: true,       // the fireplace in the left wall, its armchairs and rug
    tables: 8,             // rows of reading tables, two to a row
    desk: true,            // the librarian's desk
    cats: 6,               // library cats (0 to 12), each with a habit of its own
    catSize: 1.3,          // × life size
    students: 18,          // readers at the tables by day; fewer of an evening and at night
    librarian: true,       // at her desk, lighting the lamps at dusk, round with a lantern at night
    owl: true,             // on a chandelier
    planes: 12,            // paper planes from the top gallery, an hour
    magic: true,           // books fly home to their shelves by themselves (and the rail cat's book comes back up to her)
    magicRate: 6,          // flights an hour
    chime: true,           // the great clock strikes the hour
    decorations: 'auto',   // auto (December to Twelfth Night), always, never: the tree, garlands, wreaths
    tree: true,            // the Christmas tree, when decorated
    brush: 1,              // × the width of every stroke
    touch: true,           // taps on a touch screen do things
});
