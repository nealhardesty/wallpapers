// Settings for Starfield, as the panel shows them (SPEC §4.4). The
// values and their defaults live in defaults.js.
WP.schema('starfield', [
    { group: '🚀 Flight' },
    { key: 'warpSpeed', label: 'Warp Speed', type: 'range', min: 1, max: 20, step: 1 },
    { key: 'baseStarCount', label: 'Base Star Count', type: 'range', min: 50, max: 500, step: 10 },
    { key: 'maxStarCount', label: 'Max Star Count', type: 'range', min: 200, max: 1500, step: 50 },
    { key: 'starSize', label: 'Star Size', type: 'range', min: 0.5, max: 5, step: 0.1, digits: 1 },
    { key: 'trailLength', label: 'Trail Length', type: 'range', min: 0, max: 1, step: 0.1, digits: 1 },
    { key: 'galaxyApproachDuration', label: 'Galaxy Approach', type: 'range', min: 10000, max: 300000, step: 10000, unit: 's', scale: 0.001, help: 'How long the flight towards the galaxy core takes, as stars thicken' },
    { group: '⭐ Stars' },
    { key: 'colorMode', label: 'Color Mode', type: 'select', options: [['realistic', 'Realistic (Stellar Classes)'], ['white', 'White Stars'], ['blue', 'Blue Stars'], ['rainbow', 'Rainbow Stars']] },
    { key: 'densityMode', label: 'Star Density Distribution', type: 'select', options: [['center', 'More at Center'], ['edges', 'More at Edges'], ['uniform', 'Uniform']] },
    { key: 'galaxyApproachEnabled', label: 'Approach a galaxy (stars thicken over time)', type: 'toggle' },
    { key: 'milkyWay', label: 'Milky Way Band', type: 'toggle' },
    { key: 'twinkle', label: 'Twinkle', type: 'toggle' },
]);
