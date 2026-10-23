// Settings for the Jellyfin player, as the panel shows them (SPEC §4.4,
// §10.21). The values and their defaults live in defaults.js. The buttons,
// status lines and unsaved fields (no key) are driven by the running
// wallpaper's feed: { connected, quick, signedIn, waiting, options }.
(() => {
    const out = feed => !feed?.signedIn;
    const signIn = feed => feed?.connected && !feed.signedIn && !feed.waiting;
    const pick = (list, none, first) => (config, feed) => {
        const loaded = feed?.options?.[list] || [];
        return [['', loaded.length ? first(loaded[0][1]) : none], ...loaded];
    };
    const LANGUAGES = [['eng', 'English'], ['spa', 'Español'], ['fre', 'Français'], ['ger', 'Deutsch'], ['ita', 'Italiano'], ['por', 'Português'],
        ['dut', 'Nederlands'], ['swe', 'Svenska'], ['nor', 'Norsk'], ['dan', 'Dansk'], ['fin', 'Suomi'], ['pol', 'Polski'],
        ['rus', 'Русский'], ['jpn', '日本語'], ['kor', '한국어'], ['chi', '中文'], ['ara', 'العربية'], ['hin', 'हिन्दी']];

    WP.schema('jellyfin', [
        { group: '📡 Server' },
        { key: 'server', label: 'Address', type: 'text', placeholder: 'your-server:8096',
          help: 'Your Jellyfin server, such as nas.lan:8096, an IP address, or an https address. Only it is ever asked.' },
        { type: 'status', name: 'server' },
        { type: 'action', name: 'connect', label: 'Connect', primary: true, asks: 'localNetwork', when: (config, feed) => !feed?.signedIn && !feed?.connected },
        { type: 'action', name: 'quick', label: 'Sign in with Quick Connect', primary: true, when: (config, feed) => signIn(feed) && feed.quick },
        { type: 'status', name: 'account' },
        { type: 'action', name: 'cancel', label: 'Cancel', when: (config, feed) => !!feed?.waiting },
        { type: 'input', name: 'username', label: 'Username', when: (config, feed) => signIn(feed) },
        { type: 'input', name: 'password', label: 'Password', input: 'password', when: (config, feed) => signIn(feed),
          help: 'Sent to your server once to sign in, and never stored. Quick Connect avoids typing it at all.' },
        { type: 'action', name: 'password', label: 'Sign in', when: (config, feed) => signIn(feed) },
        { type: 'action', name: 'signout', label: 'Sign out', when: (config, feed) => !!feed?.signedIn },

        { group: '🎞️ What plays' },
        { key: 'source', label: 'From', type: 'select', options: [['playlist', '📃 A playlist'], ['library', '🎲 Random picks from a library'], ['favorites', '⭐ Your favourites']] },
        { key: 'playlistId', label: 'Playlist', type: 'select', when: (config, feed) => config.source === 'playlist' && !out(feed),
          options: pick('playlists', 'Sign in to choose', name => `The first: ${name}`) },
        { key: 'libraryId', label: 'Library', type: 'select', when: (config, feed) => config.source === 'library' && !out(feed),
          options: pick('libraries', 'Sign in to choose', () => 'Every library') },
        { key: 'libraryFilter', label: 'Only', type: 'select', when: config => config.source === 'library',
          options: [['all', 'Anything'], ['unplayed', 'Unwatched'], ['family', 'Family-friendly (PG and under)']] },
        { key: 'order', label: 'Order', type: 'select', when: config => config.source !== 'library', options: [['shuffle', '🔀 Shuffle'], ['inOrder', '➡️ In order']],
          help: 'Shuffle plays everything once before anything repeats, and carries on where it left off in a new tab.' },
        { key: 'segment', label: 'How much', type: 'select',
          options: [['auto', '⚖️ Auto (whole on a computer, clips on a phone)'], ['whole', '🎬 Each one to the end'], ['clips', '✂️ Clips'], ['surf', '📺 Channel surfing']],
          help: 'Whole items carry on where they left off. Clips skip the opening titles and the credits.' },
        { key: 'clipMinutes', label: 'Clip length', type: 'select', when: config => config.segment === 'clips' || config.segment === 'auto',
          options: [[1, '1 minute'], [3, '3 minutes'], [10, '10 minutes']] },

        { group: '🔈 Sound and subtitles' },
        { key: 'startMuted', label: 'Start muted', type: 'toggle', help: 'M or a tap on 🔇 turns the sound on. Browsers only allow sound after you click or tap.' },
        { key: 'volume', label: 'Volume', type: 'range', min: 0, max: 1, step: 0.05, scale: 100, unit: '%' },
        { key: 'subtitles', label: 'Subtitles', type: 'select', options: [['always', '💬 Always'], ['forced', '🪧 Forced only (signs and foreign speech)'], ['off', '🚫 Off']],
          help: 'With audio in another language, forced only shows full subtitles. S steps through the tracks, and remembers your pick.' },
        { key: 'subtitleLanguage', label: 'Language', type: 'select', options: LANGUAGES, when: config => config.subtitles !== 'off' },
        { key: 'burnInImageSubs', label: 'Burn in picture subtitles', type: 'toggle', when: config => config.subtitles !== 'off',
          help: 'PGS and DVD subtitles are pictures, so the server draws them into the video. That means a transcode; off keeps direct play and skips them.' },

        { group: '🖼️ Frame' },
        { key: 'frame', label: 'Frame', type: 'select',
          options: [['old-tv', '📺 Old TV'], ['mantel', '🔥 Mantel'], ['cinema', '🎭 Cinema'], ['ambilight', '🌈 Ambilight'],
              ['camcorder', '📹 Camcorder'], ['vhs', '📼 VHS'], ['none', '⬛ None']] },
        { key: 'fit', label: 'Fit', type: 'select', when: config => config.frame === 'none', options: [['contain', 'Whole picture'], ['cover', 'Fill the screen']] },
        { key: 'showTitle', label: 'Show the title', type: 'toggle' },

        { group: '⚙️ Advanced', advanced: true },
        { key: 'maxResolution', label: 'Sharpest', type: 'select', options: [['auto', '⚖️ Auto (by performance tier)'], ['480', '480p'], ['720', '720p'], ['1080', '1080p'], ['2160', '4K']],
          help: 'The server shrinks anything sharper. Decoding costs grow with pixels; on battery it’s never over 720p.' },
        { key: 'posterMode', label: 'Posters instead of video', type: 'select', options: [['auto', '🔋 On battery saver (any battery on Android)'], ['always', '🖼️ Always'], ['never', '🎞️ Never']],
          help: 'Each item’s picture, slowly drifting, with its title: no video decoding at all.' },
        { key: 'reportPlayback', label: 'Tell the server what played', type: 'toggle',
          help: 'Marks things watched and updates “continue watching”, which a wallpaper playing all day would scramble. Positions are kept here either way.' },
    ]);
})();
