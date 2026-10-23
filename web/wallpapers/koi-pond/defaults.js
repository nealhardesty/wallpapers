// Default settings for Koi Pond. Saved settings store only what differs
// from these (SPEC §4.1).
WP.defaults('koi-pond', {
    configVersion: 1,
    fishCount: 9,          // at full quality; lower tiers keep a share (SPEC §4.8)
    varieties: ['kohaku', 'sanke', 'showa', 'ogon', 'utsuri', 'asagi'],
    fishSize: 1,
    swimSpeed: 1,
    lilyPads: 8,
    season: 'auto',
    feed: true,
    touch: 'ripple',
});
