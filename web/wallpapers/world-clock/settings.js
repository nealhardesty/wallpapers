// Settings for World Clock, as the panel shows them (SPEC §4.4). The values
// and their defaults live in defaults.js. The cities are chips, one row per
// part of the world, all writing the one `cities` list (in the order they
// were picked); the panel loads world-cities.js first (the catalog's
// settingsScripts). The status line under the custom zones is the running
// wallpaper's: which of them it couldn't read.
(() => {
    const ALL = typeof WORLD_CITIES === 'undefined' ? [] : WORLD_CITIES;
    const REGIONS = [
        ['here', '🏠 Here and UTC', null],
        ['americas', '🌎 The Americas', /^America\//],
        ['europe', '🌍 Europe and Africa', /^(Europe|Africa|Atlantic)\//],
        ['asia', '🌏 Asia and the Indian Ocean', /^(Asia|Indian)\//],
        ['pacific', '🌊 Oceania and the Pacific', /^(Australia|Pacific)\//],
    ];
    const SPECIAL = [['local', '🏠 Here'], ['utc', '🌐 UTC']];
    const regionOf = id => {
        if (id === 'local' || id === 'utc') return 'here';
        const city = ALL.find(c => c.id === id);
        return REGIONS.find(([, , test]) => test && city && test.test(city.zone))?.[0];
    };
    const chips = ([region, label, test]) => ({
        key: 'cities', label, type: 'multi', empty: true,
        options: test ? ALL.filter(c => test.test(c.zone)).map(c => [c.id, c.name]) : SPECIAL,
        get: config => config.cities.filter(id => regionOf(id) === region),
        // Keep the others where they were; a new pick goes on the end.
        set: (config, value) => {
            const kept = config.cities.filter(id => regionOf(id) !== region || value.includes(id));
            return { cities: [...kept, ...value.filter(id => !kept.includes(id))] };
        },
    });
    const nameOf = id => id === 'local' ? '🏠 Here' : id === 'utc' ? '🌐 UTC (Greenwich)' : ALL.find(c => c.id === id)?.name;

    WP.schema('world-clock', [
        { group: '🌍 Cities' },
        { key: 'view', label: 'View', type: 'select', options: [['map', '🗺️ The world, day and night'], ['faces', '🕰️ Clock faces'], ['board', '🚉 A departures board']],
          help: 'V switches between them.' },
        ...REGIONS.map(chips),
        { key: 'custom', label: 'More zones', type: 'text', placeholder: 'Base Camp=Asia/Kathmandu, Ship=Etc/GMT+5',
          help: 'Any IANA zone, as Label=Area/City, separated by commas. On the map they sit at a listed city in the same zone, else on the equator at their offset.' },
        { type: 'status', name: 'custom' },
        { key: 'sort', label: 'Order', type: 'select', options: [['list', 'As picked'], ['east-west', 'West to east'], ['offset', 'By UTC offset']] },
        { key: 'hour12', label: 'Clock', type: 'select', options: [['auto', 'From the language'], ['12', '12-hour (3:41 PM)'], ['24', '24-hour (15:41)']] },
        { key: 'seconds', label: 'Seconds', type: 'toggle', help: 'A second hand on the faces, and the board flips every second.' },
        { key: 'showDate', label: 'The date on every city', type: 'toggle', help: 'Off shows the weekday only where it isn’t the same day as home.' },
        { key: 'showOffset', label: 'UTC offsets', type: 'toggle' },
        { group: '🗺️ Map' },
        { key: 'mapStyle', label: 'Look', type: 'select', options: [['night-lights', '🌃 Night lights'], ['atlas', '🧭 Atlas'], ['blueprint', '📐 Blueprint'], ['paper', '📜 Old paper']],
          help: 'L switches between them.' },
        { key: 'center', label: 'Centred on', type: 'select',
          options: config => [['local', '🏠 Here'], ['greenwich', '🌐 Greenwich (0°)'], ['pacific', '🌊 The Pacific (150°E)'],
              ...config.cities.filter(id => id !== 'local' && id !== 'utc' && nameOf(id)).map(id => [id, nameOf(id)])],
          help: 'M steps through these. Tap a city to centre on it for a while.' },
        { key: 'twilight', label: 'Twilight', type: 'select', options: [['soft', '🌫️ A soft fade'], ['sharp', '🪜 Civil, nautical and astronomical bands']] },
        { key: 'cityLights', label: 'City lights at night', type: 'toggle' },
        { key: 'showGrid', label: 'Lines of latitude and longitude', type: 'toggle', help: 'With the tropics and the polar circles.' },
        { key: 'showSun', label: 'The sun', type: 'toggle', help: 'Where it’s overhead right now.' },
        { key: 'showMoon', label: 'The moon', type: 'toggle', help: 'Where it’s overhead, in tonight’s phase.' },
        { group: '🕰️ Faces & Board' },
        { key: 'faceStyle', label: 'Faces', type: 'select', options: [['classic', '🕰️ Classic'], ['modern', '⌚ Modern'], ['minimal', '◯ Minimal']],
          help: 'Each dial is that city’s sky right now.' },
        { group: '⚙️ Advanced', advanced: true },
        { key: 'scale', label: 'Size', type: 'range', min: 0.6, max: 1.6, step: 0.05, unit: '×', digits: 2 },
        { key: 'touch', label: 'Tap a city to make it home', type: 'toggle', help: 'Off ignores touch entirely.' },
    ]);
})();
