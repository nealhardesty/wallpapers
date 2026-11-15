// Default settings for The Never-Ending Baseball Season. Saved settings
// store only what differs from these (SPEC §4.1). The league itself is not
// a setting: it lives in host.storage as wp:baseball:world.
WP.defaults('baseball', {
    configVersion: 1,
    pace: 'normal',        // how briskly the game moves: relaxed, normal, brisk
    innings: 9,            // how long a game is (from the next game on): 3, 5, 7 or 9
    follow: 'any',         // 'any' (the best game of the day) or a club's number, '0' to '7'
    captions: true,        // the cards, the announcer, the sheets between innings
    time: 'auto',          // auto (day, dusk or night by your clock), day, dusk, night
    rain: true,            // a rain delay now and then, with the tarp
    fireworks: true,       // for a home run at night
    touch: true,           // a tap starts a wave and a beach ball
    pixelSize: 1,          // how big the picture's pixels are
});
