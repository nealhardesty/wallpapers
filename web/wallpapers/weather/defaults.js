// Default settings for Weather. Saved settings store only what differs from
// these (SPEC §4.1).
WP.defaults('weather', {
    configVersion: 1,
    view: 'days',           // 'days' (cards), 'hours' (a 24-hour ribbon), 'now' (current conditions, large)
    days: 5,                // day cards, 3 to 10
    units: 'auto',          // 'auto' (from the locale), 'metric', 'imperial'
    hour12: 'auto',         // 'auto' (from the locale), '12', '24'
    ambient: 'subtle',      // the weather drawn over the sky: 'off', 'subtle', 'full'
    card: 'glass',          // 'glass', 'solid', 'minimal'
    position: 'center',     // 'center', 'bottom', 'top'
    scale: 1,
    showFeels: true,
    showWind: true,
    showHumidity: true,
    showUv: false,
    showSun: true,
    showPrecipAmount: false,
    showPlace: true,
    showUpdated: true,
    refreshMinutes: 30,     // 15, 30 or 60
    touch: true,            // tap a day for its hours
});
