// Default settings for The Last Bulb on the Strand. Saved settings store
// only what differs from these (SPEC §4.1).
WP.defaults('last-bulb', {
    configVersion: 1,
    palette: 'vintage',     // the strand's colours: vintage, warm, red-green, blue-white, candy, all-red, all-blue, custom
    myColors: ['#e0262c', '#1f9e4c', '#2a5fd6', '#f2871d', '#f4c430'],   // the custom palette
    lastColour: 'match',    // the last bulb: its place in the pattern, or a colour of its own
    glass: 'painted',       // painted ceramic, or clear ribbed glass with the filament showing
    size: 1,                // bulb size
    spacing: 3.6,           // bulb to bulb, in bulb widths
    sag: 0.5,               // how far the wire droops between hooks
    end: 'right',           // which end the stubborn bulb is on
    tag: true,              // a little paper tag on the last bulb's wire
    stubborn: 0.35,         // the chance a try is two flickers and nothing
    tryEvery: 2,            // minutes, roughly, it stays dark before it tries again
    staysLit: 3,            // minutes, roughly, it stays lit before it works loose
    christmasEve: true,     // on Christmas Eve (and Day) it lights first time, and stays lit
    outages: 'rare',        // the whole strand goes out now and then: off, rare, sometimes
    wall: 'plaster',        // plaster, pine, brick, wallpaper
    roomLight: 0.15,        // 0: the strand is the only light … 1: a lamp's on
    draft: 0.3,             // how often a draft sets the bulbs swinging
    touch: true,            // tap a bulb to jiggle it
});
