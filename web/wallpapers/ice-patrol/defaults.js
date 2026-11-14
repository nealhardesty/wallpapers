// Default settings for Ice Patrol. Saved settings store only what
// differs from these (SPEC §4.1).
WP.defaults('ice-patrol', {
    configVersion: 1,
    speed: 1,              // × the cruise (80 m/s)
    clearance: 22,         // metres it holds above the snow
    bank: 0.75,             // how far the horizon tips in a turn, × the real bank
    fov: 62,               // degrees, top to bottom on a wide screen
    time: 'cycle',         // cycle, clock, dawn, day, dusk, night
    dayMinutes: 16,        // a full day and night, in 'cycle'
    weather: 'auto',       // auto, clear, flurries, snow, blizzard
    snowOften: 1,          // × how much of the time it snows, in 'auto'
    aurora: true,
    wingmen: 2,
    beacons: true,         // survey beacons and stations out on the ice
    lamps: true,           // landing lamps after dark and in heavy snow
    cockpit: 'full',       // full, panel, none
    glow: 'green',         // the instruments' phosphor: green, amber, blue
    radarRange: 4000,      // metres
});
