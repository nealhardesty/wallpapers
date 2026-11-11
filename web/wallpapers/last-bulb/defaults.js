// Default settings for The Last Bulb on the Strand. Saved settings store
// only what differs from these (SPEC §4.1). configVersion 2 (2026-11-11):
// the strand's route, rows, hook spacing, bulb shape, frosted glass, glow,
// garland, twinkle bulbs, two more walls and the tag's text.
WP.defaults('last-bulb', {
    configVersion: 2,
    // The strand
    route: 'rail',          // rail (along the top; `rows` snakes it down the wall), border (round the screen), arch (over a doorway)
    rows: 1,                // rows of the rail route
    hookEvery: 2,           // a cup hook every this many bulbs
    palette: 'vintage',     // the strand's colours: vintage, warm, red-green, blue-white, candy, all-red, all-blue, pastel, custom
    myColors: ['#e0262c', '#1f9e4c', '#2a5fd6', '#f2871d', '#f4c430'],   // the custom palette
    shape: 'c9',            // c9, globe (G40), mini (C6)
    glass: 'painted',       // painted ceramic, clear ribbed glass with the filament showing, or frosted
    size: 1,                // bulb size
    spacing: 3.6,           // bulb to bulb, in bulb widths
    sag: 0.5,               // how far the wire droops between hooks
    glow: 1,                // how far each bulb's light reaches on the wall
    garland: 'none',        // none, or a pine garland wound along the wire
    twinklers: 0,           // twinkle bulbs (a bimetal blinker) on the strand
    // The last bulb
    lastColour: 'match',    // its place in the pattern, or a colour of its own
    end: 'right',           // which end the stubborn bulb is on
    tag: true,              // a little paper tag on the last bulb's wire
    tagText: 'jiggle',      // what it says
    stubborn: 0.35,         // the chance a try is two flickers and nothing
    tryEvery: 2,            // minutes, roughly, it stays dark before it tries again
    staysLit: 3,            // minutes, roughly, it stays lit before it works loose
    christmasEve: true,     // on Christmas Eve (and Day) it lights first time, and stays lit
    outages: 'rare',        // the whole strand goes out now and then: off, rare, sometimes
    // The room
    wall: 'plaster',        // plaster, pine, brick, wallpaper, white, charcoal
    roomLight: 0.15,        // 0: the strand is the only light … 1: a lamp's on
    draft: 0.3,             // how often a draft sets the bulbs swinging
    touch: true,            // tap a bulb to jiggle it
});
