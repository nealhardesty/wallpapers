// Settings for the Bing image of the day, as the panel shows them (SPEC §4.4).
// The values and their defaults live in defaults.js.
WP.schema('bing', [
    { group: '🖼️ Photo' },
    { key: 'bingOffset', label: 'Day', type: 'select',
      options: () => Array.from({ length: 8 }, (_, days) => [days,
          days === 0 ? 'Today' : days === 1 ? 'Yesterday'
              : new Date(Date.now() - days * 864e5).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })]) },
    { group: '🌐 Connection', advanced: true },
    { key: 'useProxies', label: 'Use public proxies when opened from disk', type: 'toggle',
      help: 'Only matters for a page opened straight from disk, where Bing can’t be reached directly. Third-party proxy services then see the request.' },
]);
