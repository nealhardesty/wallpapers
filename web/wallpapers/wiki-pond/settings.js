// Settings for Wiki Pond, as the panel shows them (SPEC §4.4). The values
// and their defaults live in defaults.js.
WP.schema('wiki-pond', [
    { group: '🪷 Pond' },
    { key: 'wikis', label: 'Wikis', type: 'multi',
      options: [['enwiki', 'English'], ['dewiki', 'Deutsch'], ['frwiki', 'Français'], ['eswiki', 'Español'], ['itwiki', 'Italiano'],
          ['ptwiki', 'Português'], ['plwiki', 'Polski'], ['ruwiki', 'Русский'], ['jawiki', '日本語'], ['zhwiki', '中文'],
          ['wikidatawiki', 'Wikidata'], ['commonswiki', 'Commons'], ['*', '🌍 Every wiki']],
      help: 'Whose edits ripple. With several, each gathers in its own part of the pond. Every wiki at once is far busier, so it’s thinned out.' },
    { key: 'bots', label: 'Bots', type: 'select', options: [['show', '🤖 Show their edits'], ['hide', '🙈 Hide them']] },
    { key: 'palette', label: 'Colours', type: 'select', options: [['moonlit', '🌙 Moonlit'], ['koi', '🎏 Koi'], ['lotus', '🪷 Lotus'], ['mono', '🤍 Silver']],
      help: 'Rings are coloured by who made the edit: a registered user, someone without an account, or a bot. A new article opens as a lotus.' },
    { key: 'titles', label: 'Page Titles', type: 'toggle',
      help: 'Fade each page’s title in beside its ripple. These are strangers’ live edits, and vandalism happens, so it’s off by default.' },
    { key: 'sound', label: 'Sound', type: 'toggle', help: 'A soft note for each edit (higher for small ones), and a bell for each new account. Starts after you first click or tap.' },
    { group: '⚙️ Advanced', advanced: true },
    { key: 'listen', label: 'Listening', type: 'select', options: [['auto', '⚖️ Auto (in bursts on Android)'], ['always', '📡 All the time'], ['bursts', '🔋 In bursts']],
      help: 'In bursts, the pond listens for half a minute every two minutes and plays what it heard in between: the radio sleeps three quarters of the time.' },
]);
