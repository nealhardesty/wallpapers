// Default settings for Pocket Hockey. Saved settings store only what
// differs from these (SPEC §4.1). The league and the game in progress are
// not settings: they live in host.storage as wp:pocket-hockey:league and
// wp:pocket-hockey:game.
WP.defaults('pocket-hockey', {
    configVersion: 1,
    period: 'normal',      // how long a period lasts: short (45 s), normal (75 s), long (2 min)
    speed: 1,              // × the game's pace
    follow: 'any',         // the club whose games are shown (its code), or any: the best game of each round
    captions: true,        // the announcer's line
    names: true,           // the name over whoever has the puck, and over a signature move
    cards: true,           // the card between periods
    hats: true,            // hats rain down for a hat trick
    touch: true,           // a tap throws something on the ice, or gets the crowd up
});
