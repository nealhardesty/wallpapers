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
        { group: '🎄 The Tree and the Room' },
        { key: 'tree', label: 'The tree', type: 'select', options: [['cozy', '🌲 Cozy'], ['grand', '🎄 Grand'], ['majestic', '✨ Majestic']],
          help: 'Cozy is slim; Grand is wide and full, with more lights, ornaments and presents under it; Majestic is grander still, and on a phone all but touches the ceiling.' },
        { key: 'time', label: 'Time of day', type: 'select', options: [['evening', '🌙 Evening'], ['live', '🕰️ By the clock'], ['day', '☀️ Day']] },
        { key: 'lights', label: 'Lights', type: 'select', options: [['classic', '🌈 Classic colours'], ['warm', '✨ Warm white'], ['blue', '❄️ Icy blue'], ['candy', '🍬 Candy cane']] },
        { key: 'twinkle', label: 'Twinkle', type: 'range', min: 0, max: 3, step: 0.1, unit: '×', digits: 1, help: '0 holds them steady.' },
        { key: 'ornaments', label: 'Ornaments', type: 'select', options: [['classic', '🔴 Classic'], ['silver-gold', '🥇 Silver and gold'], ['jewel', '💎 Jewel tones'], ['pastel', '🍭 Pastel']] },
        { key: 'snow', label: 'Snow outside', type: 'toggle' },
        { key: 'touch', label: 'Tap for a laser dot', type: 'toggle', help: 'A tap or drag shines a red dot; the nearest cat that’s awake gives chase. Off ignores touch.' },
        { group: '🏷️ Names', advanced: true },
        ...ROSTER.map(c => ({ key: key(c.id), label: `${ICONS[c.id] || '🐈'} ${c.blurb}`, type: 'text', placeholder: c.names.join(', '),
          help: c.names.length > 1 ? `Empty: ${c.names.join(', ')}, picked at random each time.` : `Empty: ${c.names[0]}. A comma list picks one at random.` })),
    ]);
})();
