// Settings for Fresh Tracks, as the panel shows them (SPEC §4.4). The
// values and their defaults live in defaults.js.
(() => {
    const GEAR = [['ski', '🎿 Skis'], ['board', '🏂 Snowboard']];
    const WHO = [['woman', '👩 Woman'], ['man', '👨 Man']];
    const KITS = [['ember', '🔴 Ember: red and black'], ['glacier', '🔵 Glacier: blue and white'], ['moss', '🟢 Moss: green and tan'], ['plum', '🟣 Plum: purple and gold'],
        ['sunflower', '🟡 Sunflower: yellow and slate'], ['slate', '⚫ Slate: grey and orange'], ['bubblegum', '🩷 Bubblegum: pink and teal'], ['tangerine', '🟠 Tangerine: orange and navy']];
    const rider = (key, name, when) => [
        { key: key + 'Gear', label: `${name}: rides`, type: 'select', options: GEAR, when },
        { key: key + 'Who', label: `${name}: is a`, type: 'select', options: WHO, when },
        { key: key + 'Kit', label: `${name}: wears`, type: 'select', options: KITS, when },
    ];
    WP.schema('ski-run', [
        { group: '🎥 The Run' },
        { key: 'camera', label: 'Camera', type: 'select', options: [['follow', '🎿 Following behind'], ['front', '🤳 From in front'], ['diorama', '🦅 From on high'], ['auto', '🎬 The director decides']], help: 'The director follows, and cuts to the side of a jump, to the front, up high, or to a camera left by the piste' },
        { key: 'speed', label: 'Speed', type: 'range', min: 0.5, max: 1.6, step: 0.05, unit: '×', digits: 2, help: '1× is about 50 km/h on a groomed piste' },
        { key: 'steep', label: 'Steepness', type: 'range', min: 0.7, max: 1.4, step: 0.05, unit: '×', digits: 2, help: 'How fast the mountain falls away. Changing it starts a new mountain' },
        { key: 'touch', label: 'Drag to carve, tap to jump', type: 'toggle', help: 'A drag moves the lead rider across the piste; A and D or the arrows do too. They take their own line again 4 seconds after you let go' },
        { group: '⛷️ The Lead Rider' },
        ...rider('lead', 'You'),
        { group: '👫 Friends' },
        { key: 'friends', label: 'Friends along', type: 'range', min: 1, max: 3, step: 1, help: 'Each takes their own line, gets ahead, drops behind, and waits at the hut' },
        ...rider('friend1', 'First friend'),
        ...rider('friend2', 'Second friend', config => config.friends >= 2),
        ...rider('friend3', 'Third friend', config => config.friends >= 3),
        { group: '🤸 Tricks and Tumbles' },
        { key: 'tricks', label: 'Tricks', type: 'range', min: 0, max: 2, step: 0.25, unit: '×', digits: 2, help: 'How often an air becomes a grab, a spin or a flip, and how keen they are on the jumps. 0: straight airs only' },
        { key: 'wipeouts', label: 'Wipeouts, now and then', type: 'toggle', help: 'A botched landing, a tumble in a cloud of powder; they sit up, shake it off and carry on. Nobody is ever hurt' },
        { group: '🏔️ The Mountain' },
        { key: 'sections', label: 'What the run is made of', type: 'multi', options: [['groomer', 'Groomed piste'], ['powder', 'Powder'], ['glade', 'Glades'], ['pipe', 'Half-pipe'], ['park', 'Terrain park'], ['rollers', 'Rollers'], ['lake', 'Frozen lake'], ['cliff', 'Cliff drop'], ['gully', 'Gully'], ['cattrack', 'Cat track'], ['hut', 'Mountain hut']], help: 'Changing it starts a new mountain. With none chosen, it is all of them' },
        { key: 'others', label: 'Other people on the mountain', type: 'range', min: 0, max: 2, step: 0.25, unit: '×', digits: 2, help: 'Strangers to pass, and a ski school snaking down behind its instructor' },
        { key: 'wildlife', label: 'Wildlife', type: 'toggle', help: 'A hare or a fox across the piste, an eagle over the valley' },
        { group: '🌗 Sky and Weather' },
        { key: 'time', label: 'Time of day', type: 'select', options: [['cycle', '🔄 The day goes round'], ['clock', '🕰️ By your clock'], ['dawn', '🌅 Dawn'], ['day', '☀️ Midday'], ['dusk', '🌇 Dusk'], ['night', '🌙 Night, under the floodlights']] },
        { key: 'dayMinutes', label: 'Length of a day', type: 'range', min: 2, max: 120, step: 1, unit: ' min', help: 'A whole day and night, when the day goes round', when: config => config.time === 'cycle' },
        { key: 'weather', label: 'Weather', type: 'select', options: [['auto', '🌦️ Comes and goes'], ['clear', '☀️ Clear'], ['flurries', '🌨️ Flurries'], ['snow', '❄️ Snowing'], ['fog', '🌫️ Fog on the hill']] },
        { key: 'snowOften', label: 'How often it closes in', type: 'range', min: 0.25, max: 3, step: 0.25, unit: '×', digits: 2, when: config => config.weather === 'auto' },
        { group: '⚙️ Advanced', advanced: true },
        { key: 'zoom', label: 'Zoom', type: 'range', min: 0.7, max: 1.5, step: 0.05, unit: '×', digits: 2, help: 'Every camera, closer or wider' },
    ]);
})();
