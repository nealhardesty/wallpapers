// Default settings for World Clock. Saved settings store only what differs
// from these (SPEC §4.1).
WP.defaults('world-clock', {
    configVersion: 1,
    view: 'map',            // 'map', 'faces' (analog), 'board' (split-flap departures)
    cities: ['local', 'utc', 'new-york', 'london', 'tokyo'],   // 'local' (Here), 'utc', and WORLD_CITIES ids, in the order picked
    custom: '',             // more zones, as "Label=Area/City, …"
    sort: 'list',           // 'list' (as picked), 'east-west', 'offset'
    hour12: 'auto',         // 'auto' (from the locale), '12', '24'
    seconds: false,
    showDate: false,        // the date on every city, not just the weekday where it differs
    showOffset: true,
    center: 'local',        // 'local', 'greenwich', 'pacific', or a city id
    mapStyle: 'night-lights',   // 'night-lights', 'atlas', 'blueprint', 'paper'
    twilight: 'soft',       // 'soft' (a smooth fade), 'sharp' (civil, nautical and astronomical bands)
    cityLights: true,
    showGrid: true,         // the graticule, the tropics and the polar circles
    showSun: true,
    showMoon: true,
    faceStyle: 'classic',   // 'classic', 'modern', 'minimal'
    scale: 1,               // the size of the labels, faces' text and the board
    touch: true,            // tap a city to make it home
});
