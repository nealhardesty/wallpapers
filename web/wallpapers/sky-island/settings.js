// Settings for Sky Island, as the panel shows them (SPEC §4.4). The values
// and their defaults live in defaults.js. The cats come from the roster in
// sky-island-logic.js (the catalog's settingsScripts).
(() => {
    const ROSTER = typeof SkyIslandLogic === 'undefined' ? [] : SkyIslandLogic.ROSTER;
    const ICONS = { moofy: '🐈‍⬛', butters: '🧈', waffles: '🐄', ras: '🎩', ibbie: '😴', maus: '💨', turkey: '💪', harry: '🧡', persian: '☁️' };
    WP.schema('sky-island', [
        { group: '🏝️ The Island' },
        { type: 'status', name: 'island' },
        { type: 'action', name: 'newIsland', label: '🎲 A new island' },
        { type: 'action', name: 'keepIsland', label: '📌 Keep this island', primary: true, when: (config, feed) => !feed?.kept },
        { type: 'action', name: 'keepIsland', label: '🎈 Let it go (a new one next time)', when: (config, feed) => !!feed?.kept },
        { key: 'seed', label: 'Seed', type: 'number', min: 0, step: 1, help: '0 draws a new island every load. Any other number is always the same island: share it, or type one in. N rolls a new one, P pins it.' },
        { key: 'islandSize', label: 'Size', type: 'range', min: 0.6, max: 1.4, step: 0.05, unit: '×', digits: 2 },
        { key: 'houses', label: 'Houses', type: 'range', min: 3, max: 14, step: 1, help: 'At most: a narrow screen fits fewer. Rolls a new island.' },
        { key: 'forest', label: 'Forest', type: 'range', min: 0, max: 2, step: 0.25, unit: '×', digits: 2 },
        { key: 'fields', label: 'Fields', type: 'toggle' },
        { key: 'dragon', label: 'The cave', type: 'toggle', help: 'Something lives in the cliff. It mostly sleeps.' },
        { group: '🌤️ Sky and Weather' },
        { key: 'sky', label: 'Time of day', type: 'select', options: [['live', '🕰️ By the clock'], ['cycle', '⏩ A whole day, quickly'], ['day', '☀️ Day'], ['golden', '🌇 Golden hour'], ['night', '🌙 Night']] },
        { key: 'cycleMinutes', label: 'A day lasts', type: 'range', min: 1, max: 30, step: 1, unit: ' min', when: config => config.sky === 'cycle' },
        { key: 'weather', label: 'Weather', type: 'select', options: [['random', '🎲 Whatever comes'], ['fair', '☀️ Fair'], ['rain', '🌧️ A shower'], ['snow', '🌨️ Snow']], help: 'W cycles it. Rain comes from a cloud of its own over the island, and leaves a rainbow.' },
        { key: 'wind', label: 'Wind', type: 'range', min: 0, max: 2, step: 0.1, unit: '×', digits: 1, help: 'Bends the trees, flies the kites, turns the mill, carries the leaves.' },
        { key: 'clouds', label: 'Clouds', type: 'range', min: 0, max: 2, step: 0.25, unit: '×', digits: 2 },
        { group: '📅 Seasons and Holidays' },
        { key: 'season', label: 'Season', type: 'select', options: [['auto', '📅 By the date'], ['spring', '🌸 Spring'], ['summer', '☀️ Summer'], ['autumn', '🍂 Autumn'], ['winter', '❄️ Winter']], help: 'S cycles it. The lake freezes in deep winter, and the kids skate.' },
        { key: 'holiday', label: 'Holiday', type: 'select', options: [['auto', '📅 By the date'], ['none', '🚫 None'], ['valentines', '💝 Valentine’s'], ['stpatricks', '🍀 St Patrick’s'], ['easter', '🐰 Easter'], ['july4', '🎆 Fourth of July'], ['halloween', '🎃 Halloween'], ['thanksgiving', '🦃 Thanksgiving'], ['christmas', '🎄 Christmas'], ['newyear', '🥂 New Year'], ['party', '🎂 A party']], help: 'H cycles it. By the date, the island dresses up in the run-up to each one.' },
        { key: 'specialDates', label: 'Special dates', type: 'text', placeholder: '06-10 Moofy’s birthday', help: 'Your own party days, one a line: MM-DD and a name. The town throws a party: cake, balloons, confetti, dancing.' },
        { key: 'decorations', label: 'Decorations', type: 'toggle', help: 'Off: the holiday passes quietly (parties still happen).' },
        { group: '🏘️ The Town' },
        { key: 'people', label: 'Townsfolk', type: 'range', min: 0, max: 40, step: 1, help: 'Each has a job and a day: the baker, the fisher, the farmer, kids, the mail, a roofer, the night watch, a fiddler…' },
        { key: 'lights', label: 'Lights after dark', type: 'toggle', help: 'Tap a house at night to switch its windows.' },
        { key: 'smoke', label: 'Chimney smoke', type: 'toggle' },
        { key: 'visitMinutes', label: 'Other islands pass about every', type: 'range', min: 0, max: 30, step: 1, unit: ' min', help: 'Their folk wave, ours wave back, birds cross over. 0 never; V sends one now.' },
        { key: 'balloon', label: 'A balloon brings visitors', type: 'toggle', help: 'Sometimes a cat. B sends one now.' },
        { group: '🐈 Cats and Pets' },
        { key: 'cats', label: 'Who lives here', type: 'multi', options: ROSTER.map(c => [c.id, `${ICONS[c.id] || '🐈'} ${c.name}`]),
          help: 'Moofy lurks and grins, Butters follows you about, Waffles sits in the field, Ras knocks pots off sills, Ibbie sleeps, Maus has the zoomies, Turkey lounges on the dock, Harry chases butterflies, Kitty Toes judges from the well. Tap one and it comes over.' },
        { key: 'strays', label: 'Strays', type: 'range', min: 0, max: 10, step: 1 },
        { key: 'dogs', label: 'Dogs', type: 'range', min: 0, max: 4, step: 1, help: 'Each follows its owner about, and may chase a cat onto a sill.' },
        { group: '🦌 Wildlife' },
        { key: 'wildlife', label: 'Wildlife', type: 'range', min: 0, max: 2, step: 0.25, unit: '×', digits: 2, help: 'Birds, butterflies, rabbits, deer by the mountain, goats on it, ducks on the lake, a fish that jumps, a fox at dusk, an owl at night.' },
        { group: '⚙️ Advanced', advanced: true },
        { key: 'callouts', label: 'Callouts', type: 'toggle', help: 'A line now and then: the island’s name, who’s passing, who stole the fish.' },
        { key: 'touch', label: 'Taps', type: 'toggle', help: 'Tap a cat (it comes), a person (they wave), the lake (a fish), a house at night (its lights), or the sky (a bird). Off ignores touch.' },
        { key: 'pixelSize', label: 'Pixel size', type: 'range', min: 0.5, max: 2, step: 0.25, unit: '×', digits: 2, help: 'Bigger pixels make everything bigger, and chunkier.' },
        { key: 'fps', label: 'Frame rate', type: 'range', min: 8, max: 30, step: 1, unit: ' fps' },
    ]);
})();
