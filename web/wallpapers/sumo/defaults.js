// Default settings for Sumo Championship. Saved settings store only what
// differs from these (SPEC §4.1). The league itself is not a setting: it
// lives in host.storage as wp:sumo:world.
WP.defaults('sumo', {
    configVersion: 1,
    pace: 'normal',        // the ritual's tempo: relaxed, normal, brisk
    ritual: true,          // salt and stomps before every bout (the day's last bout always has them)
    captions: true,        // the tournament, the nameplates and what was decided
    gloss: true,           // English in small letters under the Japanese
    cushions: true,        // the crowd throws its cushions at an upset
    touch: true,           // a tap throws one too
    look: 'auto',          // auto (evening by your clock), day, evening
});
