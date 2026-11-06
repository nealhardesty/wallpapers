// Default settings for the Orrery. Saved settings store only what differs
// from these (SPEC §4.1).
WP.defaults('orrery', {
    configVersion: 1,
    look: 'space',          // 'space' (deep space), 'brass' (an antique orrery), 'chart' (an ink star chart)
    chartPalette: 'parchment',  // the chart's paper: 'parchment' or 'night'
    scale: 'compressed',    // 'compressed' (radius ∝ a^0.45), 'true' (true distances), 'inner' (Mercury to the belt)
    view: 'top',            // 'top' (the ecliptic from above), 'tilted' (a camera 25° above the plane)
    drift: true,            // the tilted camera slowly circles
    planetSize: 1,          // exaggeration of the planets' sizes
    speed: 'live',          // 'live', 'hour', 'day', 'week', 'month', 'year' (simulated time per second)
    showOrbits: true,
    showLabels: true,
    showMoons: true,        // the Moon, and Jupiter's four
    showZodiac: true,
    zodiac: 'constellations',   // 'constellations' (the thirteen the ecliptic crosses) or 'signs' (twelve equal, tropical)
    showTrails: true,
    trailLength: 0.15,      // a trail's share of its planet's orbit
    showBelt: true,         // the asteroid belt and Jupiter's Trojans
    showPluto: false,
    skyLines: true,         // the chart's lines from the Earth to each planet
    showInfo: true,         // the corner readout
    galaxyCompass: 'bottom-right',  // a globe whose needle points at the galaxy's centre: 'off', 'top-left', 'top-right', 'bottom-left', 'bottom-right'
    milkyWay: true,         // deep space's band of the Milky Way behind the stars
    touch: true,            // tap a planet for its card; drag to turn the tilted view
});
