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
    showTitle: true,
    maxResolution: 'auto',     // auto (by tier), 480, 720, 1080, 2160
    posterMode: 'auto',        // auto (on battery saver), always, never
    reportPlayback: false,     // tell the server what played (it changes "continue watching")
});
