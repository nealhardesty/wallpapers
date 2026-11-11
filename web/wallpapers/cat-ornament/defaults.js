// Default settings for The Cat vs. the Ornament. Saved settings store only
// what differs from these (SPEC §4.1). configVersion 2 (2026-11-11): the
// tree's height, width, fullness, lights, ornaments, garland, topper,
// presents, flocking, and the Charlie Brown tree.
WP.defaults('cat-ornament', {
    configVersion: 2,
    cats: ['moofy', 'butters', 'waffles', 'ras', 'ibbie', 'maus', 'turkey', 'harry', 'persian'],   // who lives here
    inRoom: 3,              // cats in the room at once
    turnMinutes: 3,         // how long each cat has the ornament before the next one's turn
    mischief: 0.5,          // 0 calm … 1 chaos: how often a stare becomes a swat, a fallen ornament, a climb
    topple: true,           // a climb can bring the tree down (then a fade, and it's up again)
    tree: 'grand',          // the tree: 'cozy', 'grand' (wide and full), 'majestic' (wider still), 'charlie' (a Charlie Brown tree)
    treeHeight: 1,          // × its height (to the ceiling at the top of the range)
    treeWidth: 1,           // × its width
    fullness: 1,            // × how thick its needles are
    lightCount: 1,          // × how many lights
    ornamentCount: 1,       // × how many ornaments
    garland: 'beads',       // 'beads', 'tinsel', 'none'
    topper: 'star',         // 'star', 'bow', 'none'
    presents: 6,            // under the tree (0–12)
    flocked: false,         // snow on the boughs
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
