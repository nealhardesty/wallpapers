// Default settings for Wiki Pond. Saved settings store only what differs
// from these (SPEC §4.1).
WP.defaults('wiki-pond', {
    configVersion: 1,
    wikis: ['enwiki'],     // which wikis' edits ripple ('*' for all of them)
    bots: 'show',          // show or hide bots' edits
    titles: false,         // fade each page's title in beside its ripple
    sound: false,          // a soft note per edit
    palette: 'moonlit',    // colours for users, anonymous and temporary accounts, bots
    listen: 'auto',        // auto (bursts on Android), always, bursts
});
