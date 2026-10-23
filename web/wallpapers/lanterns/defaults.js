// Default settings for Lantern Festival. Saved settings store only what
// differs from these (SPEC §4.1).
WP.defaults('lanterns', {
    configVersion: 1,
    count: 70,              // lanterns aloft at once, at High; the tier's density scales it
    releases: 24,           // lanterns released per minute, at High
    colour: 'warm',         // warm, mixed
    reflections: true,      // lanterns trembling on the lake
    touch: true,            // a tap releases a lantern (off: touch is ignored)
});
