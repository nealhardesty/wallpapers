// Default settings for the Jellyfin player. Saved settings store only what
// differs from these (SPEC §4.1). The sign-in token is never a setting: it
// lives in host.storage as wp:jellyfin:auth, a catalog secret, so Export,
// Import and Reset never see it.
WP.defaults('jellyfin', {
    configVersion: 1,
    server: '',                // the server's address, as typed
    source: 'playlist',        // playlist, library or favorites
    playlistId: '',            // '' plays the first playlist
    libraryId: '',             // '' picks from every library
    libraryFilter: 'all',      // all, unplayed, family (PG and under)
    order: 'shuffle',          // shuffle or in order
    segment: 'auto',           // auto (whole on a computer, clips on a phone), whole, clips, surf
    clipMinutes: 3,            // a clip's length: 1, 3 or 10 minutes
    startMuted: true,          // every start is muted; m or a tap for sound
    volume: 0.6,
    subtitles: 'always',       // always, forced (only forced tracks), off
    subtitleLanguage: 'eng',   // ISO 639-2
    burnInImageSubs: true,     // image subtitles need the server to burn them in (a transcode)
    frame: 'old-tv',
    fit: 'contain',            // with no frame: contain or cover
    // The Christmas frames' own options (frames/christmas-kit.js).
    xmasColors: 'multi',       // the lights: multi, warm, cool, candy
    xmasPattern: 'twinkle',    // twinkle, chase, fade, steady
    xmasBulbs: 'big',          // Christmas Lights: big bulbs or mini
    xmasGarland: true,         // Christmas Lights: fir along the top
    xmasBows: true,            // Christmas Lights: bows and holly
    xmasSnow: 'heavy',         // Snowed In, Christmas Tree: light, heavy, blizzard
    xmasFire: true,            // Snowed In: the fire is lit
    xmasCat: true,             // Snowed In: a cat asleep by the fire
    xmasTv: 'medium',          // Christmas Tree: the TV ornament: small, medium, large
    xmasTopper: 'star',        // Christmas Tree: star, bow, none
    xmasPresents: true,        // Christmas Tree: presents underneath
    showTitle: true,
    maxResolution: 'auto',     // auto (by tier), 480, 720, 1080, 2160
    posterMode: 'auto',        // auto (on battery saver), always, never
    reportPlayback: false,     // tell the server what played (it changes "continue watching")
});
