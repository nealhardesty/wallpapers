// Default settings for Rainy Window. Saved settings store only what
// differs from these (SPEC §4.1).
WP.defaults('rainy-window', {
    configVersion: 1,
    rain: 0.5,              // drizzle 0.1 … downpour 1
    dropSize: 1,            // × the size drops grow to before they run
    fog: 1,             // how thick the condensation is
    fogReturn: 40,          // seconds for the fog to close over a clear patch
    fingerDrawing: true,    // a finger (or a mouse drag) draws in the fog
    city: 'downtown',       // downtown, harbour, hills
    palette: 'sodium',      // sodium, neon, bluehour
    traffic: 0.5,           // cars on the street below, 0 = none
});
