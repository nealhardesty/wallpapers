// Settings for The Cat vs. the Ornament, as the panel shows them (SPEC
// §4.4). The values and their defaults live in defaults.js. The cats come
// from the roster in cat-ornament-logic.js (the catalog's settingsScripts).
(() => {
    const ROSTER = typeof CatOrnamentLogic === 'undefined' ? [] : CatOrnamentLogic.ROSTER;
    const ICONS = { moofy: '🐈‍⬛', butters: '🧈', waffles: '🐄', ras: '🎩', ibbie: '😴', maus: '💨', turkey: '💪', harry: '🧡', persian: '☁️' };
    const key = id => `name${id[0].toUpperCase()}${id.slice(1)}`;
    WP.schema('cat-ornament', [
        { group: '🐈 The Cats' },
        { key: 'cats', label: 'Who lives here', type: 'multi', options: ROSTER.map(c => [c.id, `${ICONS[c.id] || '🐈'} ${c.names[0]}`]),
          help: 'Each has a temperament of their own. Moofy lurks, Butters loves you, Ras plots, Ibbie sleeps, Maus has the zoomies, Turkey lounges, Harry plays, and the Persian judges.' },
        { key: 'inRoom', label: 'Cats in the room', type: 'range', min: 1, max: 5, step: 1, help: 'One has the ornament; the rest get on with their day.' },
        { key: 'turnMinutes', label: 'Each turn at the ornament', type: 'range', min: 1, max: 15, step: 1, unit: ' min', help: 'N gives the next cat a turn now.' },
        { key: 'mischief', label: 'Mischief', type: 'range', min: 0, max: 1, step: 0.05, scale: 100, unit: '%', digits: 0,
          help: 'How often a stare turns into a swat, an ornament on the floor, or a climb. B swats now; T sends one up the tree.' },
        { key: 'topple', label: 'The tree can fall', type: 'toggle', help: 'Off: a cat that climbs jumps down again, and the tree stays up.' },
        { key: 'captions', label: 'Captions', type: 'toggle', help: 'A line now and then: who’s lurking, who’s staring, who regrets nothing.' },
        { key: 'catSize', label: 'Cat size', type: 'range', min: 0.7, max: 1.4, step: 0.05, unit: '×', digits: 2 },
        { group: '🎄 The Tree' },
        { key: 'tree', label: 'The tree', type: 'select', options: [['cozy', '🌲 Cozy'], ['grand', '🎄 Grand'], ['majestic', '✨ Majestic'], ['charlie', '🥀 A Charlie Brown tree']],
          help: 'Cozy is slim; Grand is wide and full; Majestic is grander still. The Charlie Brown tree is a sapling with a few drooping branches, one red ball bending it over, and a blanket round its base. It still falls.' },
        { key: 'treeHeight', label: 'Height', type: 'range', min: 0.5, max: 1.3, step: 0.05, unit: '×', digits: 2, help: 'All the way up touches the ceiling.' },
        { key: 'treeWidth', label: 'Width', type: 'range', min: 0.5, max: 1.6, step: 0.05, unit: '×', digits: 2, help: 'Wide trees! (On a phone it never overflows the room.)' },
        { key: 'fullness', label: 'Fullness', type: 'range', min: 0.4, max: 1.6, step: 0.05, unit: '×', digits: 2, help: 'How thick the needles are; low is a sparse tree.', when: config => config.tree !== 'charlie' },
        { key: 'lightCount', label: 'Lights', type: 'range', min: 0, max: 3, step: 0.1, unit: '×', digits: 1, help: 'Times what the tree has room for. More lights! (The Charlie Brown tree has three at most.)' },
        { key: 'ornamentCount', label: 'Ornaments', type: 'range', min: 0, max: 3, step: 0.1, unit: '×', digits: 1, help: 'Times what the tree has room for. More ornaments!', when: config => config.tree !== 'charlie' },
        { key: 'garland', label: 'Garland', type: 'select', options: [['beads', '📿 Gold beads'], ['tinsel', '🎀 Silver tinsel'], ['none', 'None']], when: config => config.tree !== 'charlie' },
        { key: 'topper', label: 'On top', type: 'select', options: [['star', '⭐ A star'], ['bow', '🎀 A red bow'], ['none', 'Nothing']], when: config => config.tree !== 'charlie' },
        { key: 'flocked', label: 'Snow on the boughs', type: 'toggle', when: config => config.tree !== 'charlie' },
        { key: 'presents', label: 'Presents', type: 'range', min: 0, max: 12, step: 1 },
        { key: 'lights', label: 'Light colours', type: 'select', options: [['classic', '🌈 Classic colours'], ['warm', '✨ Warm white'], ['blue', '❄️ Icy blue'], ['candy', '🍬 Candy cane']] },
        { key: 'twinkle', label: 'Twinkle', type: 'range', min: 0, max: 3, step: 0.1, unit: '×', digits: 1, help: '0 holds them steady.' },
        { key: 'ornaments', label: 'Ornament colours', type: 'select', options: [['classic', '🔴 Classic'], ['silver-gold', '🥇 Silver and gold'], ['jewel', '💎 Jewel tones'], ['pastel', '🍭 Pastel']] },
        { group: '🏠 The Room' },
        { key: 'time', label: 'Time of day', type: 'select', options: [['evening', '🌙 Evening'], ['live', '🕰️ By the clock'], ['day', '☀️ Day']] },
        { key: 'snow', label: 'Snow outside', type: 'toggle' },
        { key: 'touch', label: 'Tap for a laser dot', type: 'toggle', help: 'A tap or drag shines a red dot; the nearest cat that’s awake gives chase. Off ignores touch.' },
        { group: '🏷️ Names', advanced: true },
        ...ROSTER.map(c => ({ key: key(c.id), label: `${ICONS[c.id] || '🐈'} ${c.blurb}`, type: 'text', placeholder: c.names.join(', '),
          help: c.names.length > 1 ? `Empty: ${c.names.join(', ')}, picked at random each time.` : `Empty: ${c.names[0]}. A comma list picks one at random.` })),
    ]);
})();
