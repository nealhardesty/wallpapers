// Default settings for Lighthouse. Saved settings store only what differs
// from these (SPEC §4.1).
WP.defaults('lighthouse', {
    configVersion: 1,
    sea: 'moderate',              // calm, moderate, rough, gale
    characteristic: 'Fl(2) 10s',  // the light's rhythm, as on a chart
    ships: 3,                     // ships passing in the distance
    rain: 'auto',                 // auto (with the sea), off, light, heavy
    moon: 'tonight',              // tonight's phase, full, or none
    side: 'right',                // which side the headland stands
    beam: 1,                      // how much the beam lights the air
    liveSwell: false,             // follow a real ocean's swell (Open-Meteo)
    oceanPoint: 'north-atlantic', // which ocean
});
