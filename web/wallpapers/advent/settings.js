// Settings for Advent Calendar, as the panel shows them (SPEC §4.4). The
// values and their defaults live in defaults.js.
// The calendar's themes (advent-treats.js): id, name, emoji, months.
WP.schema('advent', (themes => {
    const month = () => new Date().getMonth() + 1;
    return [
    { group: '🎨 Theme' },
    { key: 'themeByMonth', label: () => `Theme for ${new Date().toLocaleDateString(undefined, { month: 'long' })}`, type: 'select',
      options: () => [['auto', '✨ Automatic'], ...themes.filter(t => t[3].includes(month())).map(t => [t[0], `${t[2]} ${t[1]}`])],
      get: config => config.themeByMonth[month()] || 'auto',
      set: (config, value) => {
          const byMonth = { ...config.themeByMonth };
          if (value === 'auto') delete byMonth[month()];
          else byMonth[month()] = value;
          return { themeByMonth: byMonth };
      } },
    { key: 'holidayThemes', label: 'Automatic picks a holiday theme in holiday months', type: 'toggle' },
    { key: 'holidayStars', label: 'Big star doors on holidays', type: 'toggle' },
    { group: '🚪 Doors' },
    { key: 'layout', label: 'Arrangement', type: 'select', options: [['scatter', '🎁 Scattered, like a real advent calendar'], ['ordered', '🔢 In order'], ['week', '📅 Weekly calendar grid']] },
    { key: 'ceremony', label: 'When a new day arrives', type: 'select', options: [['grand', '🎉 Grand opening, then show the treat big'], ['door', '🚪 Swing the door open, keep it on the wall'], ['click', '👆 Wiggle until I open it myself'], ['quiet', '🤫 Already open, no fuss']] },
    { key: 'spotlightSeconds', label: 'Big treat stays up for', type: 'range', min: 0, max: 20, step: 1, unit: 's' },
    { key: 'catchUp', label: 'Days I missed pop open one by one when I come back', type: 'toggle' },
    { group: '✨ Atmosphere' },
    { key: 'particles', label: 'Falling snow, leaves, petals and friends', type: 'toggle' },
    { key: 'particleAmount', label: 'Amount', type: 'range', min: 0.2, max: 2.5, step: 0.1, unit: '%', scale: 100 },
    { key: 'ambient', label: 'Open doors', type: 'select', options: [['lively', '🎠 Every treat plays all the time'], ['gentle', '🍃 Gentle (older treats play slower)'], ['still', '🖼️ Still pictures, only today plays']] },
    { key: 'fps', label: 'Frame rate', type: 'select', options: [[60, '60 fps (silky)'], [30, '30 fps (recommended)'], [20, '20 fps (battery saver)']] },
    { key: 'quality', label: 'Sharpness', type: 'select', options: [['high', '💎 Retina sharp'], ['balanced', '⚖️ Balanced']] },
];
})([
    ["snowy-woodland", "Snowy Woodland", "🦊", [12, 1, 2]],
    ["penguin-parade", "Penguin Parade", "🐧", [1, 2]],
    ["cozy-cabin", "Cozy Cabin", "🧶", [11, 12, 1, 2]],
    ["gingerbread-village", "Gingerbread Village", "🍪", [12]],
    ["rainy-ducks", "Rainy Day Ducks", "🦆", [3, 4, 5]],
    ["cherry-blossom", "Cherry Blossom Garden", "🌸", [3, 4]],
    ["bloom-buzz", "Bloom & Buzz", "🐝", [4, 5, 6]],
    ["kite-day", "Windy Kite Day", "🪁", [3, 4, 5]],
    ["beach-day", "Beach Day", "🦀", [6, 7, 8]],
    ["firefly-camp", "Firefly Campout", "🏕️", [6, 7, 8, 9]],
    ["under-the-sea", "Under the Sea", "🐙", [6, 7, 8]],
    ["ice-cream-parlor", "Ice Cream Parlor", "🍦", [6, 7, 8]],
    ["apple-orchard", "Apple Orchard", "🍎", [8, 9, 10]],
    ["autumn-woods", "Autumn Woods", "🍂", [9, 10, 11]],
    ["harvest-moon", "Harvest Moon", "🌕", [9, 10]],
    ["sweater-weather", "Sweater Weather", "🧣", [10, 11]],
    ["sleepy-moon", "Sleepy Moon", "🌙", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]],
    ["space-picnic", "Space Picnic", "🚀", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]],
    ["midnight-confetti", "Midnight Confetti", "🎉", [1, 12]],
    ["lantern-festival", "Lantern Festival", "🏮", [1, 2]],
    ["love-bugs", "Love Bugs", "💌", [2]],
    ["lucky-clover", "Lucky Clover", "🍀", [3]],
    ["egg-hunt", "Egg Hunt", "🐰", [3, 4]],
    ["firecracker-picnic", "Firecracker Picnic", "🎆", [7]],
    ["haunted-hollow", "Haunted Hollow", "🎃", [10]],
    ["harvest-table", "Harvest Table", "🦃", [11]],
    ["north-pole", "North Pole Workshop", "🎅", [12]]
]));
