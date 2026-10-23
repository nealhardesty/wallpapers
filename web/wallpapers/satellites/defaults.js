// Default settings for Satellites. Saved settings store only what differs
// from these (SPEC §4.1).
WP.defaults('satellites', {
    configVersion: 1,
    group: 'visual',        // CelesTrak group: 'visual', 'stations' or 'both'
    facing: 'auto',         // 'auto' (towards the equator), 'north', 'east', 'south', 'west'
    horizon: 'hills',       // 'hills', 'forest', 'flat'
    labels: 'stations',     // 'none', 'stations', 'all'
    satelliteSize: 1,
    trails: true,
    ghosts: true,           // satellites you couldn't see, drawn faintly
    stars: 1,
    milkyWay: true,
    tapInfo: true,
});
