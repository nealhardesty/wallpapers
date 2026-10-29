// Settings for Neko, as the panel shows them (SPEC §4.4). The values and their
// defaults live in defaults.js.
WP.schema('neko', [
    { group: '🎨 Appearance' },
    { key: 'cats', label: 'Cats', type: 'range', min: 1, max: 42, step: 1, help: 'How many cats. 42 is crazy cat person mode' },
    { key: 'coat', label: 'Coat', type: 'select', options: [
        ['classic', '🤍 Classic white'], ['black', '🖤 Black'], ['orange', '🧡 Orange tabby'], ['gray', '🩶 Grey tabby'],
        ['calico', '🎨 Calico'], ['tuxedo', '🤵 Tuxedo'], ['siamese', '💙 Siamese'], ['cow', '🐄 Cow cat'],
        ['ghost', '👻 Ghost'], ['neon', '💗 Neon'], ['rainbow', '🌈 Rainbow'], ['galaxy', '🌌 Galaxy'], ['gold', '🪙 Lucky gold'],
        ['assorted', '🎲 Assorted (a different mix each day)'],
    ] },
    { key: 'hat', label: 'Hat', type: 'select', options: [
        ['holiday', '🗓️ Holiday hats on holidays'], ['assorted', '🎲 Assorted (holiday hats on holidays)'], ['off', '🚫 No hats'],
        ['top', '🎩 Top hat'], ['cap', '🧢 Baseball cap'], ['party', '🥳 Party hat'], ['crown', '👑 Crown'],
        ['beanie', '🌀 Propeller beanie'], ['wizard', '🧙 Wizard hat'], ['cowboy', '🤠 Cowboy hat'], ['chef', '👨‍🍳 Chef’s toque'],
        ['pirate', '🏴‍☠️ Pirate hat'], ['viking', '⚔️ Viking helmet'], ['bow', '🎀 Bow'], ['flower', '🌼 Flower crown'],
        ['halo', '😇 Halo'], ['grad', '🎓 Mortarboard'], ['santa', '🎅 Santa hat'], ['antlers', '🦌 Antlers'],
        ['witch', '🧙‍♀️ Witch hat'], ['pilgrim', '🦃 Pilgrim hat'], ['leprechaun', '☘️ Leprechaun hat'],
        ['unclesam', '🇺🇸 Stars and stripes'], ['bunny', '🐰 Bunny ears'], ['hearts', '💘 Heart boppers'], ['newyear', '🎉 New Year’s hat'],
    ], help: 'Holidays: New Year, Valentine’s, St Patrick’s, Easter, the Fourth of July, Halloween, Thanksgiving and Christmas' },
    { key: 'size', label: 'Size', type: 'range', min: 32, max: 256, step: 16, unit: 'px', help: 'On-screen size of the cat. The art is 32 px, so multiples of 32 keep every pixel the same size' },
    { group: '🏃 Behaviour' },
    { key: 'yarn', label: 'Tap for Yarn', type: 'toggle', help: 'A tap or click tosses a ball of yarn for the cats to bat about, until one knocks it off the screen. Off ignores touch' },
    { key: 'speed', label: 'Speed', type: 'range', min: 1, max: 8, step: 1, help: 'How fast the cat runs after the pointer' },
    { key: 'animationSpeed', label: 'Animation Speed', type: 'range', min: 4, max: 20, step: 1, help: 'Frames between sprite changes (lower = faster)' },
    { key: 'idleTimeout', label: 'Idle After', type: 'range', min: 2000, max: 20000, step: 1000, unit: 's', scale: 0.001, digits: 0, help: 'How long the pointer rests before the cat washes, yawns or scratches' },
    { key: 'sleepTimeout', label: 'Sleep After', type: 'range', min: 5000, max: 60000, step: 5000, unit: 's', scale: 0.001, digits: 0, help: 'How long before the cat curls up for a nap' },
    { key: 'wander', label: 'Wander', type: 'toggle', help: 'With no pointer about (or none at all, on a phone or tablet), the cat sets off on its own now and then' },
    { key: 'wanderAfter', label: 'Wander After', type: 'range', min: 5000, max: 300000, step: 5000, unit: 's', scale: 0.001, digits: 0, when: config => config.wander, help: 'How long without a pointer before the cat goes exploring. Longer than Sleep After, and it naps between trips' },
]);
