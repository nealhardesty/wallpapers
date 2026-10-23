// Settings for Girih, as the panel shows them (SPEC §4.4). The values and
// their defaults live in defaults.js.
WP.schema('girih', [
    { group: '✴️ Pattern' },
    { key: 'style', label: 'Style', type: 'select', options: [['girih', '✴️ Girih star patterns'], ['truchet', '➰ Truchet tiles']] },
    { key: 'baseTiling', label: 'Base Tiling', type: 'select', help: 'The polygons the stars grow from. Cycle moves on to another every few patterns',
      options: [['cycle', '🔄 Cycle through them all'], ['4.4.4.4', '◻️ Squares (4.4.4.4)'], ['6.6.6', '⬡ Hexagons (6.6.6)'], ['4.8.8', '🛑 Octagons (4.8.8)'], ['3.12.12', '🔺 Dodecagons and triangles (3.12.12)'], ['4.6.12', '❇️ Dodecagons, hexagons and squares (4.6.12)']] },
    { key: 'palette', label: 'Palette', type: 'select', options: [['zellige', '🟦 Zellige tilework'], ['lapis', '🪙 Lapis and gold'], ['plaster', '🤍 Carved plaster'], ['iznik', '🌷 Iznik'], ['night', '🌙 Midnight mosaic']] },
    { key: 'scale', label: 'Pattern Size', type: 'range', min: 60, max: 400, step: 10, unit: 'px', help: 'Roughly how far the pattern runs before it repeats' },
    { key: 'holdSeconds', label: 'Hold Each Pattern', type: 'range', min: 3, max: 120, step: 1, unit: 's', help: 'How long each star pattern rests before it breathes into the next' },
    { key: 'interlace', label: 'Interlaced strapwork (over and under)', type: 'toggle' },
    { key: 'medallions', label: 'Inlaid medallions in the larger stars', type: 'toggle' },
    { group: '⚙️ Advanced', advanced: true },
    { key: 'morphSeconds', label: 'Morph Time', type: 'range', min: 2, max: 30, step: 1, unit: 's', help: 'How long one pattern takes to become the next' },
    { key: 'tilingEvery', label: 'New Tiling Every', type: 'range', min: 1, max: 10, step: 1, unit: ' patterns', help: 'When cycling, how many patterns each base tiling shows' },
    { key: 'minAngle', label: 'Narrowest Contact Angle', type: 'range', min: 10, max: 60, step: 1, unit: '°' },
    { key: 'maxAngle', label: 'Widest Contact Angle', type: 'range', min: 40, max: 85, step: 1, unit: '°' },
    { key: 'bandWidth', label: 'Strap Width', type: 'range', min: 0.04, max: 0.2, step: 0.01, unit: '%', scale: 100 },
]);
