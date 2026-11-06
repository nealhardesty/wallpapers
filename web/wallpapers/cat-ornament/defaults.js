// Default settings for The Cat vs. the Ornament. Saved settings store only
// what differs from these (SPEC §4.1).
WP.defaults('cat-ornament', {
    configVersion: 1,
    cats: ['moofy', 'butters', 'waffles', 'ras', 'ibbie', 'maus', 'turkey', 'harry', 'persian'],   // who lives here
    inRoom: 3,              // cats in the room at once
    turnMinutes: 3,         // how long each cat has the ornament before the next one's turn
    mischief: 0.5,          // 0 calm … 1 chaos: how often a stare becomes a swat, a fallen ornament, a climb
    topple: true,           // a climb can bring the tree down (then a fade, and it's up again)
    tree: 'grand',          // the tree: 'cozy', 'grand' (wide and full), 'majestic' (wider still)
    time: 'evening',        // 'evening', 'live' (by the clock), 'day'
    lights: 'classic',      // the tree's lights: 'classic', 'warm', 'blue', 'candy'
    twinkle: 1,             // × how fast they twinkle
    ornaments: 'classic',   // 'classic', 'silver-gold', 'jewel', 'pastel'
    snow: true,             // snow falling past the window
    captions: true,         // a line now and then about what's going on
    catSize: 1,             // × the cats' size
    touch: true,            // a tap shines a laser dot for them to chase (off: touch is ignored)
    // Names (empty: the cat's own). A comma list gives a cat several, picked at random.
    nameMoofy: '',
    nameButters: '',
    nameWaffles: '',
    nameRas: '',
    nameIbbie: '',
    nameMaus: '',
    nameTurkey: '',
    nameHarry: '',
    namePersian: '',
});
