// The catalog: every wallpaper the player can show, in menu order. Loaded by
// the player (for names and icons) and by the stage (to boot one). A
// wallpaper's code and defaults load only inside its stage, on first use.
//
//   scripts      files under wallpapers/, loaded in order after <id>/defaults.js
//   make(host)   construct the manager (runs in the stage, after the scripts)
//   prepare      optional (manager, host) hook after construction, before init()
//   background   stage page colour behind the wallpaper's canvas
//   accent       the panel's colour while this wallpaper shows
//   keys         declared shortcuts: { keys: [event.key…], label, run(manager, { shift, key }) };
//                run in the stage, and may return a toast
//   interactive  wants pointer and/or keys        motion  'slow' gets a lower fps cap
//   network      talks to these hosts (SPEC §1)   cost    hint for mobile defaults
//   disabled     why it can't be shown yet        pseudo  not a real wallpaper

(function () {
    'use strict';

    WP.catalog = [
        { id: 'seasonal', name: 'Seasonal', icon: '📅', accent: '#9fc7ff', pseudo: true },
        { id: 'blank', name: 'Blank', icon: '⬛', accent: '#9aa3b5', scripts: [], make: () => ({ start() {}, stop() {} }), cost: 'none' },
        { id: 'snow', name: 'Snow', icon: '❄️', accent: '#a9d8ff', scripts: ['snow/snow.js'],
          make: host => new SnowAnimationManager(host), cost: 'low' },
        { id: 'rain', name: 'Rain', icon: '🌧️', accent: '#7fa9cf', scripts: ['rain/rain.js'],
          make: host => new RainAnimationManager(host), cost: 'low' },
        { id: 'leaves', name: 'Falling Leaves', icon: '🍂', accent: '#e3893a', scripts: ['leaves/leaves.js'], background: '#0b0a08',
          make: host => new LeavesAnimationManager(host), cost: 'medium' },
        { id: 'fireflies', name: 'Fireflies', icon: '✨', accent: '#ead35c', scripts: ['fireflies/fireflies.js'],
          make: host => new FirefliesAnimationManager(host), cost: 'low' },
        { id: 'fireplace', name: 'Fireplace', icon: '🔥', accent: '#ff8a3d', scripts: ['fireplace/fireplace.js'],
          make: host => new FireplaceAnimationManager(host), cost: 'high',
          effects: [['smoke', 'medium']] },
        { id: 'northern-lights', name: 'Northern Lights', icon: '🌌', accent: '#55eeb0', scripts: ['northern-lights/northern-lights.js'],
          make: host => new NorthernLightsAnimationManager(host), cost: 'high', motion: 'slow',
          effects: [['bloom', 'medium'], ['reflection', 'medium']] },
        { id: 'parallax-clouds', name: 'Parallax Clouds', icon: '☁️', accent: '#7cc4ff', scripts: ['parallax-clouds/parallax-clouds.js'],
          make: host => new ParallaxCloudsAnimationManager(host), cost: 'low', motion: 'slow' },
        { id: 'mountains', name: 'Mountains', icon: '🏔️', accent: '#8fa6ff', scripts: ['mountains/mountains.js'],
          make: host => new MountainsAnimationManager(host), cost: 'low', motion: 'slow' },
        { id: 'starfield', name: 'Starfield', icon: '🌠', accent: '#c3b4ff', scripts: ['starfield/starfield.js'],
          make: host => new StarfieldAnimationManager(host), cost: 'low', motion: 'slow' },
        { id: 'cherry-blossoms', name: 'Cherry Blossoms', icon: '🌸', accent: '#ffa9c6', scripts: ['cherry-blossoms/cherry-blossoms.js'],
          make: host => new CherryBlossomAnimationManager(host), cost: 'low' },
        { id: 'halloween', name: 'Halloween Night', icon: '🎃', accent: '#ff9a2e', scripts: ['halloween/halloween.js'],
          make: host => new HalloweenAnimationManager(host), cost: 'high', interactive: true,
          effects: [['bloom', 'medium'], ['grain', 'high'], ['fogMid', 'medium'], ['fogFar', 'high']] },
        { id: 'neko', name: 'Neko', icon: '🐈', accent: '#f2c38b', scripts: ['neko/neko.js'],
          make: host => new NekoAnimationManager(host), cost: 'low', interactive: true, background: '#1b1f2e' },
        { id: 'matrix', name: 'Matrix', icon: '🟩', accent: '#4dff7c', scripts: ['matrix/matrix.js'],
          make: host => new MatrixAnimationManager(host), cost: 'medium' },
        { id: 'fishtank', name: 'Fish Tank', icon: '🐠', accent: '#45d0c4', scripts: ['fishtank/fishtank.js'],
          make: host => new FishTankAnimationManager(host), cost: 'high', interactive: true,
          effects: [['depthBlur', 'medium'], ['caustics', 'medium']] },
        { id: 'advent', name: 'Advent Calendar', icon: '🎁', accent: '#e8505f', scripts: ['advent/advent-treats.js', 'advent/advent.js'],
          make: host => new AdventCalendarAnimationManager(host), cost: 'medium', interactive: true,
          prepare: (calendar, host) => calendar.applyParams(host.params),
          keys: [
              { keys: ['ArrowLeft', 'ArrowRight'], label: 'A day earlier or later (with Shift, a week)',
                run: (calendar, { key, shift }) => { calendar.shiftDays((key === 'ArrowRight' ? 1 : -1) * (shift ? 7 : 1)); return adventDate(calendar); } },
              { keys: ['ArrowUp', 'ArrowDown'], label: 'A month later or earlier',
                run: (calendar, { key }) => { const day = calendar.now(); day.setMonth(day.getMonth() + (key === 'ArrowUp' ? 1 : -1)); calendar.setDate(day); return adventDate(calendar); } },
              { keys: ['0'], label: 'Back to today', run: calendar => { calendar.dayOffset = 0; calendar.rebuild(false); return 'Back to today'; } },
              { keys: ['t'], label: 'Next theme (with Shift, previous)', run: (calendar, { shift }) => { const theme = calendar.cycleTheme(shift ? -1 : 1); return `${theme.emoji} ${theme.name}`; } },
              { keys: ['r'], label: 'Replay today’s door', run: calendar => { calendar.replayToday(); } },
          ] },
        { id: 'quest', name: 'Pixel Quest', icon: '⚔️', accent: '#ffd166', scripts: ['quest/quest-art.js', 'quest/quest-world.js', 'quest/quest.js'],
          make: host => new QuestAnimationManager(host), cost: 'medium', interactive: true,
          effects: [['crt', 'high']],
          keys: [
              { keys: ['n'], label: 'New quest', run: quest => { quest.applyConfig({}, true); return 'A new quest begins'; } },
              { keys: ['h'], label: 'Next hero', run: quest => questCycle(quest, 'hero', Object.keys(QuestArt.HEROES), QuestArt.HEROES) },
              { keys: ['v'], label: 'Next look', run: quest => {
                  questPin(quest);
                  const looks = QuestArt.HEROES[quest.config.hero].variants;
                  quest.applyConfig({ heroVariant: ((quest.config.heroVariant || 0) + 1) % looks.length });
                  return looks[quest.config.heroVariant].name;
              } },
              { keys: ['t'], label: 'Next hat', run: quest => { questPin(quest); return questCycle(quest, 'hat', Object.keys(QuestArt.HATS), QuestArt.HATS); } },
              { keys: ['m'], label: 'Next companion', run: quest => questCycle(quest, 'companion', Object.keys(QuestArt.COMPANIONS), QuestArt.COMPANIONS) },
              { keys: ['p'], label: 'Next palette', run: quest => questCycle(quest, 'palette', Object.keys(QuestEngineData.FILTERS)) },
          ] },
        { id: 'girih', name: 'Girih', icon: '✴️', accent: '#d9a94a', scripts: ['girih/girih-geometry.js', 'girih/girih.js'],
          make: host => new GirihAnimationManager(host), cost: 'low', motion: 'slow', background: '#1d2327',
          effects: [['sheen', 'medium']],
          keys: [
              { keys: ['n'], label: 'Next pattern now', run: girih => { girih.nextPattern(); return 'The pattern moves on'; } },
              { keys: ['t'], label: 'Next base tiling', run: girih => girih.nextTiling() },
          ] },
        { id: 'stained-glass', name: 'Stained Glass', icon: '⛪', accent: '#e0a040', scripts: ['girih/girih-geometry.js', 'stained-glass/stained-glass.js'],
          make: host => new StainedGlassAnimationManager(host), cost: 'low', motion: 'slow', background: '#141210',
          keys: [
              { keys: ['n'], label: 'A new window', run: glass => { glass.newWindow(); return 'A new window'; } },
          ] },
        { id: 'bing', name: 'Bing Image of the Day', icon: '🖼️', accent: '#8ab4ff', scripts: ['bing/bing.js'],
          make: host => new BingWallpaperManager(host), cost: 'none', network: ['www.bing.com'] },
    ];

    // Helpers for the declared keys above; they run in the stage.
    function adventDate(calendar) {
        return calendar.now().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    }
    // A random hero becomes the one on screen before its look or hat changes.
    function questPin(quest) {
        if (quest.config.hero === 'random') quest.applyConfig({ hero: quest.hero.key, heroVariant: quest.hero.variant });
    }
    function questCycle(quest, key, list, names) {
        const current = key === 'hero' && quest.config.hero === 'random' ? quest.hero.key : quest.config[key];
        const next = list[(list.indexOf(current) + 1) % list.length];
        quest.applyConfig(key === 'hero' ? { hero: next, heroVariant: 0 } : { [key]: next });
        const named = names?.[next];
        return named ? `${named.icon ? `${named.icon} ` : ''}${named.name}` : next;
    }

    // Real wallpapers that can be shown: what the switch keys cycle through.
    WP.showable = () => WP.catalog.filter(entry => !entry.pseudo && !entry.disabled);
    WP.entry = id => WP.catalog.find(entry => entry.id === id);
})();
