// Default settings for Advent Calendar. Saved settings store only what
// differs from these (SPEC §4.1).
WP.defaults('advent', {
    configVersion: 1,

    // Theme: per-month choice, 'auto' lets holidays and the year pick
    themeByMonth: {},
    holidayThemes: true,
    holidayStars: true,

    // Doors
    layout: 'scatter',         // scatter | ordered | week
    ceremony: 'grand',         // grand | door | click | quiet
    spotlightSeconds: 8,
    catchUp: true,

    // Atmosphere
    particles: true,
    particleAmount: 1.0,
    ambient: 'lively',         // lively | gentle | still
    fps: 30,
    quality: 'high',           // high | balanced

});
