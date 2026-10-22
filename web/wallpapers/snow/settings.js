// Settings for Snow, as the panel shows them (SPEC §4.4). The
// values and their defaults live in defaults.js.
WP.schema('snow', [
    { group: '🌲 Trees' },
    { key: 'treeCount', label: 'Tree Count', type: 'range', min: 0, max: 400, step: 1, help: 'Number of trees scattered across the background' },
    { key: 'treeScale', label: 'Tree Scale', type: 'range', min: 0.5, max: 8, step: 0.1, unit: '×', digits: 1, help: 'Size multiplier for the trees' },
    { group: '❄️ Snowflakes' },
    { key: 'maxSnowflakes', label: 'Max Snowflakes', type: 'range', min: 10, max: 6400, step: 1, help: 'Most snowflakes on screen at once' },
    { key: 'spawnRate', label: 'Spawn Rate', type: 'range', min: 0.01, max: 1.2, step: 0.01, unit: '%', scale: 100, digits: 1, help: 'Chance per frame that a new snowflake appears (higher = denser snowfall)' },
    { key: 'snowSpeed', label: 'Snow Speed', type: 'range', min: 1, max: 60, step: 0.5, digits: 1, help: 'Base falling speed, in pixels per frame at 60 fps' },
    { key: 'snowSpeedVariation', label: 'Speed Variation', type: 'range', min: 0.5, max: 20, step: 0.1, digits: 1, help: 'Random speed variation for each snowflake (± pixels)' },
    { key: 'layerCount', label: 'Depth Layers', type: 'range', min: 1, max: 10, step: 1, help: 'Depth layers for parallax (more layers = more depth)' },
    { group: '💨 Wind' },
    { key: 'windChance', label: 'Wind Chance', type: 'range', min: 0.001, max: 0.04, step: 0.001, unit: '%', scale: 100, digits: 2, help: 'Chance per frame that a gust starts' },
    { key: 'windIntensity', label: 'Wind Intensity', type: 'range', min: 5, max: 240, step: 1, help: 'Strongest sideways push, in pixels per frame' },
    { key: 'windDuration', label: 'Wind Duration', type: 'range', min: 120, max: 2400, step: 30, unit: 's', scale: 0.01666667, digits: 1, help: 'How long a gust lasts, including ramping up and down' },
    { group: '🏔️ Accumulation' },
    { key: 'accumulationRate', label: 'Accumulation Rate', type: 'range', min: 0.01, max: 8, step: 0.01, digits: 2, help: 'How much snow builds up per landing snowflake' },
    { key: 'maxAccumulation', label: 'Max Accumulation', type: 'range', min: 1, max: 800, step: 1, unit: 'px', help: 'Tallest the snow banks grow' },
    { group: '⚙️ Advanced', advanced: true },
    { key: 'windPhaseInDuration', label: 'Gust Ramp Up', type: 'range', min: 30, max: 600, step: 10, unit: 's', scale: 0.01666667, digits: 1 },
    { key: 'windPhaseOutDuration', label: 'Gust Ramp Down', type: 'range', min: 30, max: 600, step: 10, unit: 's', scale: 0.01666667, digits: 1 },
]);
