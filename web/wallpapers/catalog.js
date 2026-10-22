// The catalog: every wallpaper the player can show, in menu order. Loaded by
// the player (for names and icons) and by the stage (to boot one). A
// wallpaper's code and defaults load only inside its stage, on first use.
//
//   scripts      files under wallpapers/, loaded in order after <id>/defaults.js
//   make(host)   construct the manager (runs in the stage, after the scripts)
//   prepare      optional (manager, host) hook after construction, before init()
//   background   stage page colour behind the wallpaper's canvas
//   interactive  wants pointer and/or keys        motion  'slow' gets a lower fps cap
//   network      talks to these hosts (SPEC §1)   cost    hint for mobile defaults
//   disabled     why it can't be shown yet        pseudo  not a real wallpaper

WP.catalog = [
    { id: 'seasonal', name: 'Seasonal', icon: '📅', pseudo: true },
    { id: 'blank', name: 'Blank', icon: '⬛', scripts: [], make: () => ({ start() {}, stop() {} }), cost: 'none' },
    { id: 'snow', name: 'Snow', icon: '❄️', scripts: ['snow/snow.js'],
      make: host => new SnowAnimationManager(host), cost: 'low' },
    { id: 'rain', name: 'Rain', icon: '🌧️', scripts: ['rain/rain.js'],
      make: host => new RainAnimationManager(host), cost: 'low' },
    { id: 'leaves', name: 'Falling Leaves', icon: '🍂', scripts: ['leaves/leaves.js'], background: '#0b0a08',
      make: host => new LeavesAnimationManager(host), cost: 'medium' },
    { id: 'fireflies', name: 'Fireflies', icon: '✨', scripts: ['fireflies/fireflies.js'],
      make: host => new FirefliesAnimationManager(host), cost: 'low' },
    { id: 'fireplace', name: 'Fireplace', icon: '🔥', scripts: ['fireplace/fireplace.js'],
      make: host => new FireplaceAnimationManager(host), cost: 'high' },
    { id: 'northern-lights', name: 'Northern Lights', icon: '🌌', scripts: ['northern-lights/northern-lights.js'],
      make: host => new NorthernLightsAnimationManager(host), cost: 'high', motion: 'slow' },
    { id: 'parallax-clouds', name: 'Parallax Clouds', icon: '☁️', scripts: ['parallax-clouds/parallax-clouds.js'],
      make: host => new ParallaxCloudsAnimationManager(host), cost: 'low', motion: 'slow' },
    { id: 'mountains', name: 'Mountains', icon: '🏔️', scripts: ['mountains/mountains.js'],
      make: host => new MountainsAnimationManager(host), cost: 'low', motion: 'slow' },
    { id: 'starfield', name: 'Starfield', icon: '🌠', scripts: ['starfield/starfield.js'],
      make: host => new StarfieldAnimationManager(host), cost: 'low', motion: 'slow' },
    { id: 'cherry-blossoms', name: 'Cherry Blossoms', icon: '🌸', scripts: ['cherry-blossoms/cherry-blossoms.js'],
      make: host => new CherryBlossomAnimationManager(host), cost: 'low' },
    { id: 'halloween', name: 'Halloween Night', icon: '🎃', scripts: ['halloween/halloween.js'],
      make: host => new HalloweenAnimationManager(host), cost: 'high', interactive: true },
    { id: 'neko', name: 'Neko', icon: '🐈', scripts: ['neko/neko.js'],
      make: host => new NekoAnimationManager(host), cost: 'low', interactive: true,
      disabled: 'sprites not imported; redrawn in roadmap 4.6' },
    { id: 'matrix', name: 'Matrix', icon: '🟩', scripts: ['matrix/matrix.js'],
      make: host => new MatrixAnimationManager(host), cost: 'medium' },
    { id: 'fishtank', name: 'Fish Tank', icon: '🐠', scripts: ['fishtank/fishtank.js'],
      make: host => new FishTankAnimationManager(host), cost: 'high', interactive: true },
    { id: 'advent', name: 'Advent Calendar', icon: '🎁', scripts: ['advent/advent-treats.js', 'advent/advent.js'],
      make: host => new AdventCalendarAnimationManager(host), cost: 'medium', interactive: true,
      prepare: (calendar, host) => calendar.applyParams(host.params) },
    { id: 'quest', name: 'Pixel Quest', icon: '⚔️', scripts: ['quest/quest-art.js', 'quest/quest-world.js', 'quest/quest.js'],
      make: host => new QuestAnimationManager(host), cost: 'medium', interactive: true },
    { id: 'bing', name: 'Bing Image of the Day', icon: '🖼️', scripts: ['bing/bing.js'],
      make: host => new BingWallpaperManager(host), cost: 'none', network: ['www.bing.com'] },
];

// Real wallpapers that can be shown: what the switch keys cycle through.
WP.showable = () => WP.catalog.filter(entry => !entry.pseudo && !entry.disabled);
WP.entry = id => WP.catalog.find(entry => entry.id === id);
