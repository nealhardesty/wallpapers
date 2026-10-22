// Settings for Cherry Blossoms, as the panel shows them (SPEC §4.4). The
// values and their defaults live in defaults.js.
WP.schema('cherry-blossoms', [
    { group: '🌸 Petals' },
    { key: 'petalCount', label: 'Petal Count', type: 'range', min: 50, max: 300, step: 25 },
    { key: 'fallSpeed', label: 'Fall Speed', type: 'range', min: 0.5, max: 4, step: 0.1, digits: 1 },
    { key: 'windChance', label: 'Wind Chance', type: 'range', min: 0, max: 0.01, step: 0.0001, unit: '‰', scale: 1000, digits: 1, help: 'Chance per frame that a breeze starts' },
    { key: 'windStrength', label: 'Wind Strength', type: 'range', min: 1, max: 8, step: 0.5, digits: 1 },
    { key: 'swayAmount', label: 'Sway Amount', type: 'range', min: 0, max: 5, step: 0.1, digits: 1 },
    { key: 'petalSize', label: 'Petal Size', type: 'range', min: 0.5, max: 2, step: 0.1, digits: 1 },
    { key: 'rotationSpeed', label: 'Rotation Speed', type: 'range', min: 0, max: 3, step: 0.1, digits: 1 },
    { group: '🌳 Branches' },
    { key: 'showBranches', label: 'Show cherry tree branches', type: 'toggle' },
    { key: 'branchCount', label: 'Branch Count', type: 'range', min: 0, max: 15, step: 1 },
    { key: 'fadeEnabled', label: 'Petals fade as they fall', type: 'toggle' },
    { group: '🎨 Colours' },
    { key: 'petalColors', label: 'Petal colours', type: 'colors' },
    { group: '⚙️ Advanced', advanced: true },
    { key: 'windDuration', label: 'Breeze Length', type: 'range', min: 60, max: 600, step: 10, unit: 's', scale: 0.01666667, digits: 1 },
]);
