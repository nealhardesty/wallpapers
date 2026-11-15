// Settings for Wayfarer, as the panel shows them (SPEC §4.4). The
// values and their defaults live in defaults.js.
WP.schema('wayfarer', [
    { group: '🥾 The Walk' },
    { key: 'camera', label: 'Camera', type: 'select', options: [['follow', '🚶 Behind the traveller'], ['first', '👁️ Through their eyes'], ['drift', '🎬 Cinematic: it cuts between views']] },
    { key: 'pace', label: 'Walking pace', type: 'range', min: 0.5, max: 3, step: 0.1, unit: '×', digits: 1, help: '1× is a stroll; 3× covers the country at a run' },
    { key: 'traveller', label: 'The traveller', type: 'select', options: [['ranger', '🧝 Ranger, hooded, with a pack'], ['wizard', '🧙 Wizard, with a lit staff'], ['bard', '🎻 Bard, with a lute'], ['knight', '🛡️ Knight, with shield and spear']] },
    { key: 'companion', label: 'Companion', type: 'select', options: [['fox', '🦊 A fox'], ['dog', '🐕 A dog'], ['pony', '🐴 A pack pony'], ['cat', '🐈 A cat'], ['wisp', '✨ A wisp of light'], ['none', '🚫 Alone']] },
    { key: 'rests', label: 'Stops to take in a view', type: 'toggle' },
    { key: 'campfire', label: 'Rests by a campfire at night', type: 'toggle', help: 'A minute by the fire, then on with a lantern' },
    { key: 'touch', label: 'Drag to look around', type: 'toggle', help: 'The view comes back by itself after a few seconds' },
    { group: '🌗 Sky and Seasons' },
    { key: 'time', label: 'Time of day', type: 'select', options: [['cycle', '🔄 The day goes round'], ['clock', '🕰️ By your clock'], ['dawn', '🌅 Dawn'], ['day', '☀️ Day'], ['dusk', '🌇 Dusk'], ['night', '🌙 Night']] },
    { key: 'dayMinutes', label: 'Length of a day', type: 'range', min: 2, max: 120, step: 1, unit: ' min', help: 'A whole day and night, when the day goes round', when: config => config.time === 'cycle' },
    { key: 'weather', label: 'Weather', type: 'select', options: [['auto', '🌦️ Comes and goes'], ['clear', '☀️ Clear'], ['fair', '⛅ Fair, with clouds'], ['cloudy', '☁️ Overcast'], ['rain', '🌧️ Rain (snow where it is cold)']] },
    { key: 'rainOften', label: 'How often it rains', type: 'range', min: 0, max: 3, step: 0.25, unit: '×', digits: 2, when: config => config.weather === 'auto' },
    { key: 'season', label: 'Season', type: 'select', options: [['journey', '🍂 Turns along the road'], ['spring', '🌸 Spring'], ['summer', '🌻 Summer'], ['autumn', '🍁 Autumn'], ['winter', '❄️ Winter']] },
    { group: '🏘️ The World' },
    { key: 'towns', label: 'Towns and cities', type: 'range', min: 0, max: 1.6, step: 0.1, unit: '×', digits: 1, help: 'How many of the places along the road are villages and walled cities. 0 is wilderness and landmarks only' },
    { key: 'life', label: 'Folk, animals and traffic', type: 'range', min: 0, max: 1.5, step: 0.1, unit: '×', digits: 1 },
    { key: 'wonders', label: 'Far-off wonders', type: 'toggle', help: 'A dragon over the hills, an airship, a balloon. They never come close' },
    { group: '⚙️ Advanced', advanced: true },
    { key: 'fov', label: 'Field of view', type: 'range', min: 40, max: 80, step: 1, unit: '°' },
]);
