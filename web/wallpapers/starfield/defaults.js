// Default settings for Starfield. Saved settings store only what
// differs from these (SPEC §4.1).
WP.defaults('starfield', {
    configVersion: 2,
    warpSpeed: 3,
    baseStarCount: 260,
    maxStarCount: 900,
    starSize: 2,
    trailLength: 0.6,
    galaxyApproachEnabled: true,
    galaxyApproachDuration: 60000, // 60 seconds
    colorMode: 'realistic', // 'realistic', 'white', 'rainbow', 'blue'
    densityMode: 'uniform', // 'center', 'edges', 'uniform'
    twinkle: true,
    milkyWay: true
});
