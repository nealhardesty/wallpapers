// Settings for Harmonograph, as the panel shows them (SPEC §4.4). The
// values and their defaults live in defaults.js.
WP.schema('harmonograph', [
    { group: '🖋️ Drawing' },
    { key: 'drawMinutes', label: 'One Drawing Takes', type: 'range', min: 2, max: 20, step: 1, unit: 'min', help: 'From the pen touching down to the pendulums running out' },
    { key: 'ratios', label: 'Pendulum Ratios', type: 'select', options: [['classic', '🎼 Classic (1:1, 1:2, 2:3, 3:4)'], ['any', '🎲 Any small ratio (2:5, 4:5, 5:6…)']] },
    { key: 'penWidth', label: 'Pen Width', type: 'range', min: 0.5, max: 3, step: 0.25, digits: 2, unit: '×' },
    { group: '🎨 Ink & Paper' },
    { key: 'palette', label: 'Ink', type: 'select', options: [['sumi', '🖌️ Sumi ink'], ['blueprint', '📐 Blueprint'], ['sepia', '📜 Sepia'], ['riso', '🖨️ Risograph, pink to blue'], ['gold', '✨ Gold on black']] },
    { key: 'paper', label: 'Paper', type: 'select', options: [['auto', 'Whatever suits the ink'], ['cream', 'Cream'], ['white', 'White'], ['black', 'Black']] },
    { key: 'keepPrevious', label: 'Keep finished drawings on a pile in the corner', type: 'toggle' },
    { group: '⚙️ Advanced', advanced: true },
    { key: 'holdSeconds', label: 'Admire a Finished Drawing For', type: 'range', min: 5, max: 300, step: 5, unit: 's' },
]);
