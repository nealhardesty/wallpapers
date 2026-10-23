// Default settings for Night Train. Saved settings store only what
// differs from these (SPEC §4.1).
WP.defaults('night-train', {
    configVersion: 1,
    speed: 1,              // × the cruising speed
    rain: 0.5,             // drops on the glass; 0 is a dry night
    palette: 'blue',       // blue, sodium, snow
    stations: true,
    tunnels: true,
    reflection: true,      // the carriage, mirrored in the glass in tunnels
    frame: true,           // the window frame around the view
});
