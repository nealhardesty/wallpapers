// Settings for The Last Bulb on the Strand, as the panel shows them (SPEC
// §4.4). The values and their defaults live in defaults.js.
WP.schema('last-bulb', [
    { group: '💡 The Strand' },
    { key: 'palette', label: 'Colours', type: 'select', options: [
        ['vintage', '🌈 Vintage (red, green, blue, orange, gold)'], ['warm', '✨ Warm white'], ['red-green', '🎄 Red and green'],
        ['blue-white', '❄️ Blue and white'], ['candy', '🍬 Candy cane'], ['all-red', '🔴 All red'], ['all-blue', '🔵 All blue'], ['custom', '🎨 My own']] },
    { key: 'myColors', label: 'My colours', type: 'colors', when: config => config.palette === 'custom', help: 'In order along the strand, repeating.' },
    { key: 'glass', label: 'Glass', type: 'select', options: [['painted', '🏺 Painted ceramic'], ['clear', '🔍 Clear, with the filament showing']] },
    { key: 'size', label: 'Bulb size', type: 'range', min: 0.6, max: 1.6, step: 0.05, unit: '×', digits: 2 },
    { key: 'spacing', label: 'Spacing', type: 'range', min: 2.5, max: 6, step: 0.1, unit: ' bulbs', digits: 1, help: 'Bulb to bulb, in bulb widths.' },
    { key: 'sag', label: 'Sag between hooks', type: 'range', min: 0, max: 1, step: 0.05, scale: 100, unit: '%', digits: 0 },
    { group: '🔌 The Last Bulb' },
    { key: 'lastColour', label: 'Its colour', type: 'select', options: [
        ['match', '🔁 Its place in the pattern'], ['red', '🔴 Red'], ['green', '🟢 Green'], ['blue', '🔵 Blue'], ['orange', '🟠 Orange'],
        ['gold', '🟡 Gold'], ['white', '⚪ White'], ['pink', '🩷 Pink']], help: 'A colour of its own: the one replacement from a different box.' },
    { key: 'stubborn', label: 'Stubbornness', type: 'range', min: 0, max: 0.9, step: 0.05, scale: 100, unit: '%', digits: 0,
      help: 'How often it flickers twice and then thinks better of it. L makes it try now.' },
    { key: 'tryEvery', label: 'Dark for about', type: 'range', min: 0.5, max: 15, step: 0.5, unit: ' min', digits: 1, help: 'Before it tries again.' },
    { key: 'staysLit', label: 'Lit for about', type: 'range', min: 0.5, max: 30, step: 0.5, unit: ' min', digits: 1, help: 'Before it works loose.' },
    { key: 'christmasEve', label: 'Always lights on Christmas Eve', type: 'toggle', help: 'From five in the evening on the 24th, and all Christmas Day: first time, and it stays lit.' },
    { key: 'end', label: 'Which end', type: 'select', options: [['right', '➡️ Right'], ['left', '⬅️ Left']] },
    { key: 'tag', label: 'A tag on its wire', type: 'toggle', help: 'Someone left a note.' },
    { group: '🏠 The Room' },
    { key: 'wall', label: 'Wall', type: 'select', options: [['plaster', '🤍 Old plaster'], ['pine', '🪵 Knotty pine'], ['brick', '🧱 Brick'], ['wallpaper', '🌿 Green wallpaper']] },
    { key: 'roomLight', label: 'Room light', type: 'range', min: 0, max: 1, step: 0.05, scale: 100, unit: '%', digits: 0, help: '0: the strand is the only light in the room.' },
    { key: 'outages', label: 'The whole strand goes out', type: 'select', options: [['off', '🚫 Never'], ['rare', '🌙 Rarely'], ['sometimes', '⚡ Sometimes']],
      help: 'Then someone jiggles the last bulb, and it all comes back. O does it now.' },
    { key: 'draft', label: 'Drafts', type: 'range', min: 0, max: 1, step: 0.05, scale: 100, unit: '%', digits: 0, help: 'How often the bulbs swing a little. D for one now.' },
    { key: 'touch', label: 'Tap a bulb to jiggle it', type: 'toggle', help: 'Tap the last one and it might take. Off ignores touch.' },
]);
