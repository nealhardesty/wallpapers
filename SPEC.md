# wallpapers — SPEC

A set of toy animated wallpapers: full-screen canvas animations with no page
chrome around them. Most are ambient; some are interactive (pointer and/or
keys: fishtank, halloween, neko, advent, quest), and the wallpaper contract
treats input as a first-class, optional capability (§4.1, §4.5). They are extracted from a private homepage project into this
**public** repo; that project is then retired, so this repo becomes the
wallpapers' only home. They run in three hosts:

1. **Standalone page**: just the wallpaper, plus a hidden switcher and settings
   panel opened by a key.
2. **Chrome new tab**: the same page, loaded through a Chrome extension
   (or as the browser homepage URL).
3. **Android live wallpaper**: a future app in `android/` that runs the same
   web code behind the home screen.

> Status: **phases 1–9 done** (2026-10-23), except what needs the owner:
> measurements on a real phone (6.2's numbers, 6.4a), the first signed
> release (6.6), the switch-over itself (7.2), and trying Phase 8's touch
> and location, and Jellyfin, on a phone. The player, the stage, the panel
> and all 34 wallpapers run from `web/index.html`, as a Chrome new-tab extension, on
> GitHub Pages at https://nealhardesty.github.io/wallpapers/, and as an
> Android live wallpaper. Every wallpaper is tiered and within budget.
> Phase 11 (Harvest Valley, §10.22) added the 34th wallpaper for Thanksgiving.
> Next: Phase 10, the clock overlay (§4.9, specified 2026-10-28, not built);
> §10 holds the other ideas.

---

## 1. Ground rules

- **Public repo. Nothing personal, ever.** No links, hosts, IPs, accounts,
  API keys, employer names, emails (except `noreply` attribution), absolute
  home paths or personal photos. `make audit` enforces this (§7).
- **Zero build for the web app.** Plain ES2020 classic scripts and static
  files, served as-is. No bundler, no npm runtime deps. Node (built-ins
  only) and headless Chrome are used for tooling and tests.
- **Offline by default; network is an opt-in capability.** Most wallpapers
  are self-contained and work offline, from `file://`, from
  `chrome-extension://` and from Android assets. Wallpapers that are online
  by nature declare it (`network`, §4.1). Today that is the Bing image of
  the day (§4.6); a weather-forecast wallpaper is planned. Every online
  wallpaper must:
  - show a sensible offline or error state, never a blank screen or a spinner
  - list the hosts it talks to, which feed the audit allowlist, the
    extension's `host_permissions` and Android's `INTERNET` permission
  - **never need an API key**, since this repo is public. Prefer keyless
    APIs (e.g. Open-Meteo for weather), or proxy through something the
    owner runs privately, configured outside the repo.
- **Everything has a `make` target** (see `AGENTS.md`).

---

## 2. Source inventory (what we are importing)

Imported from the private homepage repo, as a **fresh copy with no git history**
(the history contains private data; see §7.1).

| id | Source files | Size | Notes |
|---|---|---|---|
| `snow` | snow.js (+ snow.html inline fork) | 27 KB | Only module coupled to the homepage's global `CONFIG` and app object. Its settings dialog lives in the homepage's `script.js`. Uses PNG sprites, with a canvas fallback that already exists. |
| `rain` | rain.js | 33 KB | |
| `leaves` | leaves.js (+ leaves.html inline fork) | 55 KB | Full-screen pile buffer, up to 14k leaves. |
| `fireflies` | fireflies.js | 39 KB | |
| `fireplace` | fireplace.js, fireplace.html | 115 KB | 4 full-screen offscreen buffers. Its wood, coal bed and grate are now fireplace-wood.js (§10.23). |
| `northern-lights` | northern-lights.js | 50 KB | Full-resolution bloom; heavy on mobile. |
| `parallax-clouds` | parallax-clouds.js | 25 KB | Advances one fixed step per frame, so it runs faster on 120 Hz screens. |
| `mountains` | mountains.js | 27 KB | Same per-frame stepping. |
| `starfield` | starfield.js | 26 KB | |
| `cherry-blossoms` | cherry-blossoms.js | 21 KB | Leaks a resize listener on every `start()`. |
| `halloween` | halloween.js, halloween.html | 178 KB | Interactive (mouse). Settings are already data-driven (`controlSpec()`). |
| `neko` | neko.js + `assets/neko/` (79 themes, 2,472 `.ico`, 20 MB) | 28 KB | Interactive. **Licensing, size and filename-case problems** (§7.3). |
| `matrix` | matrix.js | 23 KB | |
| `fishtank` | fishtank.js, fishtank.html | 139 KB | Interactive. `ctx.filter` blur and per-frame `putImageData`; the hardest on WebView. |
| `advent` | advent.js, advent-treats.js, advent.html | 365 KB | Interactive. Date-driven; `?date=` time travel. |
| `quest` | quest.js, quest-art.js, quest-world.js, quest.html | 538 KB | Interactive. Playable with keys and touch when standalone. |
| `bing` | wallpaper.js (part) | 12 KB | Image of the day, including the info overlay and the 0–7-day picker. **Imported in full**, with per-host fetching (§4.6). |
| `blank` | — | — | Plain dark background. |

Added in Phase 8, drawn in code (designs in §10.6–10.20):

| id | Files | Size | Notes |
|---|---|---|---|
| `harmonograph` | harmonograph-math.js, harmonograph.js | ~0.8k lines | Pure segment generator, unit-tested; key N |
| `pixel-room` | pixel-room-art.js, pixel-room.js | ~1.6k lines | 32-colour palette, sprites in code; interactive; follows `host.now()` |
| `girih` | girih-geometry.js, girih.js | ~800 lines | Pure strapwork generator, shared with stained-glass; keys N, T |
| `stained-glass` | stained-glass.js (+ girih/girih-geometry.js) | ~930 lines | Light by `host.now()`; key N |
| `synthwave` | synthwave.js | ~600 lines | Pure grid maths (`SynthwaveGrid`) |
| `zen-garden` | zen-geometry.js, zen-garden.js | ~1,000 lines | Interactive (rake); idles between strokes; keys N, R, E |
| `koi-pond` | koi-art.js, koi-pond.js | ~1,150 lines | Interactive (tap, feed); seasons by `host.now()` |
| `murmuration` | flock.js, murmuration.js | ~1,050 lines | 3,000 birds; pure flock, unit-tested; interactive (falcon); keys D, R, N |
| `lanterns` | lanterns.js | ~560 lines | Interactive (release); key L/Space |
| `rainy-window` | rainy-window-city.js, rainy-window.js | 60 KB | Interactive (fog drawing); lights by the hour; key W |
| `night-train` | route.js, night-train.js | ~1,250 lines | Pure seeded route (`NightTrainRoute`) |
| `fireworks` | fireworks-show.js, fireworks.js | 41 KB | Interactive (tap); modes auto/tap/newyear; keys Space/L, G |
| `lighthouse` | lighthouse-light.js, lighthouse-sea.js, lighthouse.js | ~1.4k lines | Network: `marine-api.open-meteo.com`, only with Live Swell on; keys L, S |
| `wiki-pond` | wiki-pond-events.js, wiki-pond.js | ~0.8k lines | Network: `stream.wikimedia.org` (EventSource); made-up edits in thumb mode |
| `satellites` | sgp4.js, data.js, satellites.js | ~55 KB | Network: `celestrak.org` (+ the panel's geocoder); needs location; offline sample orbits; key N |

Added in Phase 9 (design in §10.21):

| id | Files | Size | Notes |
|---|---|---|---|
| `jellyfin` | jellyfin-logic.js, jellyfin-api.js, jellyfin-frames.js, frames/*.js (11 frames), jellyfin.js | ~9k lines | Network: `'user'` (the user's own server); a real `<video>`; sign-in through the panel's extras; keys Space, M, N/P, ←/→, S, I, V |

Added for Thanksgiving, drawn in code (design in §10.22):

| id | Files | Size | Notes |
|---|---|---|---|
| `harvest` | harvest-sky.js, harvest-art.js, harvest-actors.js, harvest.js | ~3k lines | Interactive (tap a tree, the scarecrow, the sky); pure sky and astronomy (`HarvestSky`), unit-tested; follows `host.now()`; keys G, H, W, M |

About 1.7 MB of JavaScript in total. **Not imported:** links, weather, clocks,
search/omniprompt, custom links, status bar, Docker/nginx, the homepage's
`config.js`, `script.js`, `manifest.json` (its `key` pins the private
extension's ID), icons, `scripts/`, `.claude/`, `.cursor/`.

### Coupling to remove during the import

- `CONFIG.snow` and `homepageApp` (snow only). The snow settings dialog moves
  from the homepage's `StatusBarManager` into the wallpaper. While moving it,
  fix the latent bug where applying settings swaps `LayeredWindSystem` for a
  plain `WindSystem`.
- `createInfoIcon()` is a homepage global that rain, fireflies, fireplace,
  neko and matrix call unguarded, so their dialogs throw outside the homepage.
  It moves into core UI.
- CSS variables (`--dark-surface`, `--gray-*`, `--light-text`,
  `--accent-blue`) that every dialog assumes. They move into `core/theme.css`.
- `statusBarHeight: 44` defaults (8 modules), and the homepage writing
  `temporaryStatusBarHeight` into 4 of them for hide mode. Both are replaced
  by **host insets** (§4.3).
- Inconsistent lifecycle: `init()` is missing on starfield, cherry-blossoms
  and halloween, and `destroy()` is missing on several modules. The running
  flag is `isEnabled` in some modules and `isRunning` in others.
- Shared global scope with generic names (`Tree`, `Snowflake`, `WindSystem`,
  `TAU`, …). Each module gets wrapped so only its registration escapes.
- Standalone `*.html` pages each have their own `CONFIG`, `f` handler and
  storage quirks. snow.html and leaves.html are **forks** of the class code,
  not includes. snow.html pauses on `visibilitychange`; snow.js does not.
  Diff and merge any such improvements before deleting the forks.

---

## 3. Repository layout

```
wallpapers/
├── web/                         # the product: a static site, zero build
│   ├── index.html               # the player: wallpaper only (core/player.js)
│   ├── stage.html               # one wallpaper, in an iframe or alone (core/stage.js)
│   ├── manifest.json            # Chrome MV3 extension: the new tab is index.html
│   ├── app.webmanifest          # installable web app (Add to Home screen), linked only when served
│   ├── core/
│   │   ├── wp.js                # WP namespace + pure logic: seasons, params, settings, tiers, pacing
│   │   ├── perf.js              # pure: quality per tier, Auto's ladder and governor, power policy
│   │   ├── player.js            # chooses, mounts and crossfades stages; global keys
│   │   ├── stage.js             # host, frame pacing, DPR cap, settings, messaging, boot
│   │   ├── panel.js             # unified switcher + settings overlay (phase 4)
│   │   ├── settings.js          # schema renderer (phase 4)
│   │   └── theme.css            # tokens and base styles
│   ├── wallpapers/
│   │   ├── catalog.js           # every wallpaper's metadata, in menu order
│   │   └── <id>/                # defaults.js + the wallpaper's scripts and assets
│   └── icons/                   # icon.svg (ours) and the PNGs `make icons` renders from it
├── tools/                       # node scripts (built-ins only): audit, lint, serve, build, smoke, tests, images
├── docs/                        # README screenshots (`make screenshots`)
├── android/                     # the live wallpaper app (§6): Gradle wrapper, app/ (Kotlin)
├── bench/                       # make bench results (results.json; android.json from a phone)
├── .github/workflows/ci.yml     # `make ci`; on master also `make site` → GitHub Pages; daily for bing.json
├── Dockerfile                   # the site in a container, served by tools/serve.mjs
├── Makefile
├── README.md                    # setup and use
├── SPEC.md                      # this file
└── THIRD_PARTY.md               # provenance and licences of anything not ours
```

`web/` is the single source of truth. The Chrome extension *is* `web/`
(`make extension` copies it to `dist/extension/` and zips it); GitHub Pages
serves `web/` plus a fresh `bing.json` (`make site`); the Android build
copies `web/` into its assets. Builds take only files git knows about
(tracked, or new and not ignored), so nothing local ships.
Nothing outside this repo consumes it. The old homepage is retired, not
integrated.

---

## 4. Architecture

### 4.1 The player, the stage and the wallpaper contract

**Every wallpaper runs in its own iframe, the stage** (`stage.html?w=<id>`),
which the player (`index.html`) creates, crossfades in and throws away.
Decided in Phase 3, replacing the plan to wrap each module and adopt
per-module host APIs. Why:

- **Nothing can leak between wallpapers.** Dropping the iframe drops every
  global, listener, timer, canvas and animation loop, so the modules don't
  need wrapping (old task 3.2) or per-module leak fixes, and their
  top-level class names can't collide.
- **Pacing, pause and DPR for every module, with no module changes.**
  `core/stage.js` loads before any wallpaper code and replaces
  `requestAnimationFrame` (fps cap, pause, per-frame timing for the
  governor) and the [Replaceable] `devicePixelRatio` (the tier's DPR cap).
  Every module animates only through rAF; none uses `setInterval`.
- **Render scale for free.** The player lays the stage out at
  `renderScale` × the window and scales it back up with a CSS transform, so
  the wallpaper renders fewer pixels without knowing it.
- **Crossfades:** two stages, fading opacity.
- **One page, many uses:** the same `stage.html` serves thumbnails' live
  previews (§4.7), Android (§6) and direct links.

The player and stage talk **only through `postMessage`**. On `file://`,
Chrome makes frames cross-origin to each other, so neither can reach into
the other, though `localStorage` is shared. That was tested before
building on it.

| Direction | Message | Meaning |
|---|---|---|
| stage → player | `ready {id}` | booted and drawing; the player fades it in |
| stage → player | `key {key}` | a player key (`,` `[` `]` `f`) pressed while the stage has focus |
| stage → player | `error {id, message}` | boot failed; the player shows a toast and the stage anyway |
| player → stage | `settings` | open the wallpaper's settings |
| player → stage | `tier {tier}` | apply a tier's fps and DPR (the player rescales the iframe) |
| player → stage | `pause` / `resume` | stop and restart frames |

**The catalog** (`web/wallpapers/catalog.js`) lists every wallpaper in menu
order: `id`, `name`, `icon`, `scripts`, `make(host)`, an optional
`prepare(manager, host)` hook (run before `init()`), `background`,
`interactive`, `motion` (`'slow'` gets the slow fps cap), `network`
(hosts), `cost`, `disabled` (why), and `pseudo` (Seasonal). It's one small
file, so the player can show names and icons without loading any wallpaper
code, and the stage loads only the chosen wallpaper's `defaults.js` and
scripts.

```js
// web/wallpapers/catalog.js
{ id: 'fishtank', name: 'Fish Tank', icon: '🐠', scripts: ['fishtank/fishtank.js'],
  make: host => new FishTankAnimationManager(host), cost: 'high', interactive: true },

// web/wallpapers/fishtank/defaults.js: every default value, and nothing else
WP.defaults('fishtank', {
    configVersion: 1,
    fishCount: 26,
    waterTheme: 'planted',
    // …
});
```

**Defaults live in their own file** (`defaults.js`, one per wallpaper),
replacing the old mix of inline objects, `defaults()` methods, dialog Reset
copies and the homepage's global `CONFIG`. Where the old standalone pages
were tuned differently from the homepage, the standalone values won
(Appendix A).

- It is a script, not JSON, because Chrome blocks `fetch()` of local files
  from `file://`.
- Modules read and write settings through `WP.settings`:
  - `load()`: defaults merged with stored overrides
  - `save(config)`: writes only what differs from defaults, under `wp:<id>`
  - `defaults()`: a fresh copy, used by Reset
  - `reset()`: deletes the overrides
- Saved settings are **overrides only**: a retuned default reaches everyone
  who never touched that setting. Overrides from another `configVersion`,
  and keys the defaults no longer have, are dropped.
- State that isn't a setting (advent's last-seen day) goes through
  `host.storage`, under `wp:<id>:<key>`.
- Tests:
  - the smoke test runs every wallpaper fresh and fails if its config would
    save anything, so each `defaults.js` matches what the module actually
    uses
  - the unit tests check every `defaults.js` registers its own id with
    JSON-safe values
  - Phase 4 adds a check that every schema key has a default, and the
    reverse

**Instance interface**, as the imported managers have it today, and where
Phase 4 and 6 take it:

| Member | Now | Meaning |
|---|---|---|
| constructor `(host)` | yes | `make(host)` in the catalog. Modules with a ground line keep `host` and read `host.insets`. |
| `init()` | optional | async setup before `start()` |
| `start()` / `stop()` | yes | begin and end drawing. Leaks no longer outlive a switch (the iframe goes), but `stop()` still cancels its rAF |
| `showConfigDialog()` | yes | the module's own dialog until the Phase 4 schema renderer replaces it |
| `settings()` / `applySettings(values)` | phase 4 | schema plus live apply |
| `onQuality(q)` | phase 6 | scale counts, rebuild buffers, toggle effects (§4.8). fps, DPR and render scale already apply without it |
| `onScroll(x, y)` | phase 6 | Android home-screen page offset 0..1, for parallax (§6.4) |
| `keys` | phase 4 | declared shortcuts `{ key, label, run }`, listed in the panel and dispatched only while it's closed |

### 4.2 Player (`core/player.js`)

- Owns the current wallpaper. Switching mounts a new stage, fades it in on
  `ready` (or after 4 s regardless), then removes the old one. It replaces
  the homepage's hand-written `setXWallpaper()` and `stopAllAnimations()`
  switches.
- Persists the choice under a namespaced key (`wp:current`). Every
  wallpaper's settings live under `wp:<id>` and keep a `configVersion`.
  Old homepage settings move over by hand, once: the extension is a new
  identity with its own storage. The README's console snippet saves the
  old wallpaper keys to a file, and the panel's Import converts it
  (Appendix B).
- **URL parameters (decided).** They override for **this page load only**:
  nothing is persisted, the saved choice and Seasonal are untouched, and a
  reload without them returns to normal. They replace the old
  per-wallpaper pages; no `quest.html`-style stubs are kept.

  | Parameter | Effect |
  |---|---|
  | `w=<id>` | Show this wallpaper instead of the saved one, e.g. `index.html?w=fishtank`. An unknown id is ignored, with a console warning |
  | `panel=open` | Open the switcher and settings panel on load (closes as usual with `,` or `Esc`) |
  | `date=YYYY-MM-DD`, `theme=<id>` | Passed to the wallpaper as `host.params`. Advent uses them for time travel and themes, e.g. `?w=advent&date=2026-12-25` |
  | `tier=low\|medium\|high` | Pin a performance tier for this load (§4.8), e.g. to see Low on a desktop |
  | `host=android`, `hud=1`, `thumb=1` | Host simulation (§4.3), performance HUD (§4.8), thumbnail mode (§4.7) |
| `clock=on\|off\|<motion>` | §4.9: force the clock overlay on or off for this load, or on with a motion (`static`, `drift`, `bounce`, `teleport`, `follow`). Never persisted |

  Picking a wallpaper in the panel while `w=` is active does persist, as
  usual, and drops `w=` from the address bar (`history.replaceState`), so
  a reload shows what was picked.
- Every wallpaper pauses on `visibilitychange`, centrally, in the stage's
  frame pacer. No frames are produced while hidden, and the pacer restarts
  cleanly on return.
- **Seasonal** (decided) is a pseudo-wallpaper in the strip and the
  first-run default. It plays the wallpaper for the current month, using
  that wallpaper's own saved settings. It checks again at the top of every
  hour (the player checks every minute), so it rolls over on the 1st
  without a reload. Picking any real wallpaper turns Seasonal off; picking
  Seasonal turns it back on. The table lives once, as `WP.SEASONS` in
  `core/wp.js`:

  | Months | Wallpaper |
  |---|---|
  | Jan – Apr | snow |
  | May | fishtank |
  | Jun – Aug | fireflies |
  | Sep | leaves |
  | Oct | halloween |
  | Nov | harvest |
  | Dec | advent (wins over snow's Dec–Apr) |

  It uses the local calendar month, so it is Northern-Hemisphere only.

### 4.3 Host (`WP.host`, built in `core/stage.js`)

One object, passed to every wallpaper's constructor and also available as
`WP.host`, so the wallpapers never know where they run:

```js
host = {
  kind: 'standalone' | 'extension' | 'android',
  id: 'fishtank',                         // this stage's wallpaper
  params: { date, theme, … },             // URL parameters (§4.2)
  insets: { top, right, bottom, left },   // px kept clear, e.g. Android's gesture bar; 0 elsewhere
  storage: { get(key), set(key, value) }, // non-setting state, under wp:<id>:<key>
  quality: { tier, fps, renderScale, dpr, density, slowFps },  // the current tier (§4.8)
  frames: { count, workMs },              // from the frame pacer, for the governor and tests
  reducedMotion: boolean,                 // prefers-reduced-motion
  now(): Date,                            // the time: real, or ?date= ticking forward (8.0)
  gestures({ tap, start, move, end }),    // taps and drags; Android page swipes are neither. Returns a stop function
  location(): Promise<{lat, lon, label, source} | null>,  // §10.1, for wallpapers that declare needs: ['location']
  idleUntil(ms),                          // no frames until then, or input (§4.8); 0 wakes the stage at once (9.3)
  toast(text, ms),                        // a message in the player's toast (9.3)
  panel(feed),                            // what the panel's extras show of this wallpaper (§4.4, 9.3)
  power,                                  // the power policy now: { ceiling, fpsCap, pause, reasons } (9.7)
}
// Optional on the manager, beside onQuality and onScroll: onPause() and
// onResume(), when the stage pauses (hidden tab, Android screen off), for
// anything rAF doesn't stop, such as Wiki Pond's EventSource or Jellyfin's
// <video>; onAction(name, inputs), a panel button (§4.4); onPower(policy).
// Catalog, beside network: offline (a network wallpaper that still draws its
// own scene: it gets a thumbnail, live previews and the smoke pixel check),
// needs: ['location'] (the stage iframe gets allow="geolocation"), and for
// Jellyfin: network: 'user' (one server the user types, never a fixed
// host), media: true (allow="autoplay", so sound can follow a gesture), and
// secrets: ['auth'] (host.storage keys Export and Import never carry).
```

The host kind is detected from `location` and a `?host=` override.
`?host=android` lets a desktop browser simulate the Android host (a 48 px
bottom inset and the Medium ceiling) for testing.

### 4.4 Settings schema and the panel (built in Phase 4)

**Settings are data.** Each wallpaper has `wallpapers/<id>/settings.js`,
next to its `defaults.js`. `core/settings.js` renders it:

```js
WP.schema('fishtank', [
    { group: '🐟 Livestock' },
    { key: 'fishCount', label: 'Fish Count', type: 'range', min: 4, max: 80, step: 1, help: '…' },
    { key: 'swimSpeed', label: 'Swim Speed', type: 'range', min: 0.3, max: 2.5, step: 0.05, unit: '×', digits: 2 },
    { key: 'population', label: 'Stocking', type: 'select', options: [['community', '🐟 Community'], …] },
    { group: '⚙️ Advanced', advanced: true },            // collapsed by default
    { key: 'waterLevel', label: 'Gap Above the Water', type: 'range', …, unit: '%', scale: 100, digits: 1 },
]);
```

- **Types:**
  - `range`: `min`, `max`, `step`, shown as value × `scale` with `unit` to
    `digits` places
  - `select`: options as a list, or as a function of the config, e.g.
    Quest's Look follows the chosen hero
  - `toggle`, `multi` (chips over an array), `colors` (a palette editor),
    `number`, `text` and `color`
- **Accessors:** `get(config)` and `set(config, value)`, e.g. advent's
  "theme for this month" inside a per-month map. Labels may be functions.
- **Extras the wallpaper drives** (task 9.3, for Jellyfin's sign-in). They
  have no `key`, are never saved, and render as `.setting-extra` rows:
  - `{ type: 'action', name, label, primary?, asks? }`: a button. The panel
    posts `action {name, inputs}` to the stage, which calls the manager's
    `onAction(name, inputs)`. `asks: 'localNetwork'` first asks Android 17
    for its local network permission, from the settings screen.
  - `{ type: 'status', name }`: a line of text from the wallpaper, or a big
    code (`{ text, code }`, Quick Connect's six digits).
  - `{ type: 'input', name, label, input? }`: a field whose value goes with
    every action, then is cleared if it's a password. Never stored.
  - Any control may have `when(config, feed)`, and a select's
    `options(config, feed)` may list what the wallpaper loaded (playlists).
  - The feed is whatever the wallpaper last passed to `host.panel(feed)`;
    the player keeps it per stage and the panel re-renders on each one.
- **How the schemas were made:**
  - A one-off tool opened each legacy dialog in headless Chrome and read
    every control.
  - It then found each control's config key and unit by changing one
    control at a time and pressing the dialog's own Apply.
  - 272 controls carried over. Hand polish followed: groups, labels, a
    multi-select for leaf types.
  - 26 values the dialogs never exposed now have controls under Advanced.
  - Five sliders whose step couldn't hold the real default (so Apply
    silently rounded it) got finer steps.
- **Tested:**
  - unit tests: every control has a default and every default a control;
    every default is inside its range, on the step grid, and among its
    options
  - smoke: every wallpaper's panel renders every control, and a change
    reaches storage and then the running wallpaper
- **The old dialogs are gone,** about 3,900 lines across 17 modules, found
  by reachability from `showConfigDialog`. Each deleted block was checked
  to be a whole method, and dynamic calls such as advent's `frame_*`
  painters were reviewed. Their stale "Default:" tooltips went with them:
  defaults now come from `defaults.js`.

**The panel** (`core/panel.js`, `core/panel.css`) lives in the player
page, not the stage, so it survives stage rebuilds. It reads and writes
settings directly (storage is shared) and tells the player to apply them:

- **Applying:**
  - A wallpaper with `applySettings(config)` takes changes live: snow,
    Halloween (rebuilds only for keys that change baked layers), and Quest
    (keeps the world unless a world setting changed).
  - Any other wallpaper is rebuilt by the player behind a crossfade,
    debounced 400 ms so a slider drag rebuilds once.
- **Touch:**
  - Range sliders are `touch-action: pan-y`: a vertical swipe that starts
    on a slider scrolls the panel, only a sideways drag moves it.
  - `refresh()` centres the active tile by scrolling the filmstrip alone
    (`scrollIntoView` also scrolled the settings back to the top).
  - On Android's settings screen (`panel=open`) the corner gear is always shown (there is no hover or
    corner-hold), 10% of the height down to clear the status bar, so a closed panel can always be reopened. The live wallpaper itself never shows it.
- **Look:**
  - Smoked glass over the live wallpaper.
  - **Its accent follows the wallpaper on screen** (`accent` in the
    catalog): fire orange, aurora green, petal pink. Each picker tile is
    washed in its own wallpaper's colour.
  - System rounded type.
  - A right-hand drawer on desktop; a bottom sheet on phones.
- **Layout, top to bottom:**
  - A filmstrip of every wallpaper, with thumbnails (§4.7). The current
    one is centred; a vertical wheel scrolls it sideways; hovering or
    focusing a tile plays a live preview.
  - The settings, grouped, with Advanced collapsed. A dot appears next to
    any changed setting; clicking it resets that setting, and its tooltip
    names the default.
  - Performance (Auto, Low, Medium, High, §4.8), Reset (two clicks, no
    blocking dialog), Export and Import (all settings as JSON, e.g. to move
    a tuned setup to the phone), and key hints, hidden on touch screens.
- **Opening it:**
  - `,` toggles it; `Esc` closes it; `?panel=open` opens it on load, as soon as the player mounts rather than when the wallpaper is ready, so a slow or failing wallpaper still leaves its settings reachable (the Android settings screen relies on it).
  - On a touch screen, a long press in either right-hand corner (the top can sit under Safari's status bar).
  - iOS Safari turns a long press into a text selection and callout, which would swallow the hold, so `theme.css` switches selection, the callout and the tap highlight off (text inputs excepted). To debug on a phone: Settings → Safari → Advanced → Web Inspector, then Develop → the device in desktop Safari.
  - iPhone Safari has no fullscreen API for pages (iPad does), so `f` and the left-hand corners toast a pointer to Add to Home Screen instead.
  - With a mouse, a ⚙︎ gear fades in when the pointer nears either of them.
  - The left-hand corners do the same for fullscreen: a ⛶ button for a mouse, a long press on touch (no buttons on Android).
  - While it's open, wallpaper keys are suspended.

```
┌────────────────────────────────────┐
│ 🐠 Fish Tank                     × │
│ ▕Matrix▏▕Fish Tank▏▕Advent▏▕Pix…   │  ← filmstrip with thumbnails; live preview on hover
│ 🐟 Livestock                    ⌃  │
│ Stocking                           │
│ [🐟 Community                 ▾]   │
│ • Fish Count                   34  │  ← • = changed; click to reset
│ ━━━━━━━━━━━━━●━━━━━━━━━━           │
│ ⚙️ Advanced                     ⌄  │  ← collapsed
├────────────────────────────────────┤
│ Performance [Auto|Low|Medium|High] │
│ Reset   Export   Import            │
│ ←→ switch   ? all keys   Esc close │
└────────────────────────────────────┘
```

### 4.5 Keyboard map (built in Phase 4)

| Key | Where | Action |
|---|---|---|
| `,` or `C` | everywhere | open or close the panel (`C` as on the old homepage, Phase 7) |
| `Esc` | everywhere | close the key help, then the panel |
| `[` / `]` | everywhere | previous or next wallpaper (remembered) |
| `←` / `→` | panel open | previous or next wallpaper |
| `F` | everywhere | fullscreen |
| `K` | everywhere | show or hide the clock overlay (§4.9); a toast says which |
| `?` | everywhere | key help, listing the current wallpaper's own keys too |
| wallpaper keys | panel closed | declared in the catalog (`keys`), run inside the stage, and may answer with a toast. Quest: `N` new quest, `H` hero, `V` look, `T` hat, `M` companion, `P` palette. Advent: `←`/`→` a day (with Shift, a week), `↑`/`↓` a month, `0` today, `T` theme, `R` replay |

Keys are ignored when Ctrl, Meta or Alt is held, or when focus is in a form
field. The player's keys work wherever focus is: the stage forwards `,`
`c` `[` `]` `f` `?` `Esc` to the player when it has focus. No wallpaper may
declare `c` or `k` (§4.9); a unit test checks both.

### 4.6 Bing image of the day (built in Phase 4, Pages job in Phase 5)

The photos load straight from `bing.com`, since plain image loads aren't
subject to CORS. Only the JSON archive API
(`HPImageArchive.aspx?format=js&idx=N&n=1`) is blocked cross-origin, so
`fetchBingImageUrl` in `bing/bing.js` tries each source in turn:

| Source | When it works | Third party sees it? |
|---|---|---|
| `bing.json` beside the page | the page is served over http(s): GitHub Pages, `make serve`, the container. `make bing-json` (`tools/bing.mjs`) writes it, keeping only image path, credit, credit link and date. Gitignored; Pages makes its own (phase 5) | no |
| Bing directly | the extension (`host_permissions`) or the Android app (native fetch, phase 6); browsers refuse it cross-origin | no |
| public CORS proxies | only with **"Use public proxies when opened from disk"** on in Bing's Advanced settings (off by default) | yes, and the setting says so |

When every source fails, a quiet note in the corner says why and what would
help ("serve the folder, or allow public proxies"), instead of a black
screen. Kept from the homepage: the info overlay (title, date, link). It now
sits above the host inset at a readable size (it was 6 px), and is built
with `textContent`, never HTML from Bing. The day picker became a panel
select: Today, Yesterday, then weekday dates.

### 4.7 Thumbnails (built in Phase 4)

- **Static:** `make thumbnails` (`tools/thumbnails.mjs`) renders every
  offline wallpaper in headless Chrome at 1280×800 and saves a 320×200 WebP
  to `web/wallpapers/<id>/thumb.webp`. They're 1–9 KB each, committed, so
  they work offline, on Android and from `file://`.
  - It uses `?seed=7`: the stage replaces `Math.random` with a seeded
    generator before any wallpaper code loads, so any wallpaper is
    reproducible without per-module seed options (also useful for tests and
    `make bench`). Frame timing still varies, so re-renders differ slightly;
    the tool reports which images changed, so committing new ones is a
    deliberate step.
  - Per-wallpaper settle times, and a few render-only presets for a better
    picture: Quest skips its story, Neko is large and orange, fireflies glow
    bigger. Thumb mode never saves.
  - Seasonal's tile shows this month's pick with a calendar badge. Blank
    and Bing have none: Bing's tile stays a colour wash.
- **Live:** hovering or focusing a tile for 450 ms plays that wallpaper in
  the tile. That's `stage.html?w=<id>&thumb=1&tier=low&seed=7`, laid out at
  4× and scaled down. One at a time; not for the wallpaper already showing;
  skipped on Android and under reduced motion. Thumb mode ignores keys and
  the corner, and never saves.
- A unit test checks every offline wallpaper has a WebP under 40 KB.

### 4.8 Performance tiers and power budget (built in Phase 6)

Several wallpapers are expensive: fishtank, northern lights, halloween,
fireplace, and quest with a palette. On a laptop that costs fan noise; on a
phone it costs the battery, all day, behind the home screen. So performance
is a **core service**, not a per-wallpaper afterthought. Wallpapers describe
what they can shed, and the core decides how much to shed, from the user's
choice, measured frame cost and the device's power state.

#### The three tiers

A tier is a named **budget**, not a bag of ad-hoc flags. Every wallpaper reads
the same knobs:

| Knob | Low | Medium | High | What it buys |
|---|---|---|---|---|
| `fps` cap | 20 | 30 | display rate (60–120) | Fewer frames; the biggest single battery lever |
| `renderScale` | 0.5 | 0.75 | 1.0 | Canvas backing store vs CSS pixels; the browser or compositor upscales. Fill cost falls with the square of the scale |
| `dpr` cap | 1 | 1.5 | 2 | Stops 3× phone screens tripling the pixel count |
| `density` | 0.35 | 0.65 | 1.0 | Multiplier on particle and entity counts (snowflakes, fish, bats, leaves, stars) |
| `effects` | only `low` effects | up to `medium` | all | Named expensive features each wallpaper declares (bloom, depth blur, caustics, grain…) |
| slow-motion fps | 10 | 15 | 30 | Cap for wallpapers declared `motion: 'slow'` (aurora, mountains, starfield, clouds), which look the same at lower rates |

Low should look **intentionally calm**, not broken: fewer, larger flakes
beat many blurry ones. Each wallpaper's Low is reviewed by eye, and the
thumbnails (§4.7) are always shot at High.

#### Modes: Auto, Low, Medium, High

A global setting (`wp:performance`) holds the mode and the Battery-aware
switch, storing only what differs from Auto and on. `?tier=` pins a tier
for one page load. (Per-wallpaper overrides were planned; they aren't
built, since the governor's per-wallpaper memory covers the need.)

- **Low / Medium / High** pin the tier.
- **Auto** (the default) is a governor (`core/perf.js`) that moves along a
  fine-grained **ladder** between a floor (Low) and a ceiling (the host's
  default, lowered by power policy). It doesn't jump between the three
  presets. Rungs, from top to bottom:

  ```
  High → density 0.85 → renderScale 0.85 → shed effects one at a time
       → Medium → density 0.5 → renderScale 0.6 → shed effects
       → Low → fps 15 → fps 10
  ```

  - **What it measures:** for each frame, the time spent inside the
    wallpaper's frame callbacks (`performance.now()` around them).
    Late frames aren't counted: the callback cost proved enough.
  - **Budget:** the callback must stay under **50%** of the frame interval
    at the current fps. That leaves room for the compositor, and on
    Android for the surface copy.
  - **Step down:** when p90 is over budget for 2 s.
  - **Step up:** one rung, after 20 s with p90 under 25%. If a step up fails
    within 5 s, that rung is locked out for 5 minutes, so it never flaps.
  - **Memory:** the settled rung is remembered per wallpaper per device
    (`wp:perf:<id>`), so the next start begins there instead of at the top.
    No janky first second on every new tab.
  - **Replaces** the hand-rolled auto-quality in fishtank and halloween,
    and their High / Balanced / Performance settings (removed; their
    `configVersion` stays, since a removed key is simply dropped on load).
  - **As built:** `WP.ladder(entry, policy)` makes the rungs, each a full
    quality with a label ("High, fewer", "Medium, no bloom", "Low, 10 fps");
    `WP.Governor` steps along them. `WP.GOVERNOR` holds the thresholds. The
    memory is the label of the rung it settled on. Unit tests drive it with
    a fake clock: slow frames step down by 2 s, a calm device climbs back
    after 20 s, and a failed step up is locked out.

#### Power policy: lowering the ceiling

Signals lower the ceiling Auto works under, and override a pinned tier when
they are stricter. "Battery-aware" can be switched off in the panel.

| Signal | Web source | Android source | Effect |
|---|---|---|---|
| Not visible | `visibilitychange` | `Engine.onVisibilityChanged(false)` | **Pause**: no frames, no timers |
| Battery saver on | — | `PowerManager.isPowerSaveMode()` + `ACTION_POWER_SAVE_MODE_CHANGED` | Ceiling Low, fps 15 |
| On battery, under 20% | `navigator.getBattery()` (Chrome on laptops) | `BatteryManager` sticky intent | Ceiling Low |
| On battery | same | same | Ceiling Medium |
| Charging | same | same | The user's choice stands |
| Thermal: moderate | — | `PowerManager.getCurrentThermalStatus()` + listener (API 29+; ignored on 26–28) | One tier lower |
| Thermal: severe and above | — | same | Low and 10 fps. At `critical`, pause and hold the last frame |
| Reduced motion | `prefers-reduced-motion` | `ANIMATOR_DURATION_SCALE == 0` | Slow-motion profile at the Low fps |
| Wallpaper picker preview | — | `Engine.isPreview()` | High: it's brief and it's the sales pitch |

**Host defaults:**
- Desktop, standalone and extension: Auto, ceiling High, battery-aware.
- Android: Auto, **ceiling Medium at 30 fps**.

#### What the core does, and what wallpapers implement

The core (`core/perf.js` for the logic, `core/stage.js` and
`core/player.js` for the wiring), with no module changes:
- **Frame pacing.** The stage replaces `requestAnimationFrame` before any
  wallpaper code loads. It enforces the quality's fps cap (the slow cap
  for `motion: 'slow'`) by skipping display ticks, pauses when hidden or
  told to, times every frame into `host.frames`, and feeds the governor.
- **DPR cap and render scale.** It replaces the [Replaceable]
  `devicePixelRatio` with `min(real, dpr) × renderScale`, so modules that
  size their canvas by it draw fewer pixels at the same layout size, and
  the browser scales them up. (The first version laid the stage out at
  `renderScale` and scaled the iframe up; that zoomed everything sized in
  CSS px, 2× on Low, so it was replaced.) Modules that size by
  `innerWidth` already draw one pixel per CSS px, which on a phone is
  well under the native resolution. The Android app works the same way.
- **Plans.** `WP.planQuality` turns the mode, the power policy and the
  memory into the starting quality.
- **Power.** The player gathers the signals and posts the policy to the
  stage (`power` message); the stage re-plans.
- **Reports.** The stage posts `quality` on every change and `stats` once
  a second (fps, ms per frame, rung, idle, power reasons) for the panel's
  readout and `?hud=1`.

What a wallpaper implements (all optional):
- **`host.quality`**: `{ tier, label, fps, renderScale, dpr, density,
  effects: [names], motion }`, set before the manager is built. `effects`
  is an array of the effect names that are on.
- **`onQuality(quality)`**: called on every change. Scale counts by
  `density` and toggle effects, trimming or adding gradually, never with
  a visible reset.
- **`host.idleUntil(ms)`**: no frames until `ms` from now (or until input,
  a resize or new settings if omitted). Compute deadlines from
  `performance.now()`, the clock it uses, not the rAF timestamp, which can
  trail it by tens of ms. Neko asleep, paused quest and advent between its
  own capped frames use it; Bing uses no frames at all.
- **`onScroll(x)`**: the Android home-screen position, 0 to 1. Starfield,
  mountains and parallax-clouds pan their layers by depth.
- **Catalog `effects`**, `[name, lowest tier that keeps it]`, most
  expensive first, the order the governor sheds them:

  ```js
  effects: [['depthBlur', 'medium'], ['caustics', 'medium']],
  ```

#### Techniques catalogue (applied across modules)

- **Never** call `getImageData`/`putImageData` per frame.
  - Quest's palettes recolour through a proxy around its low-res context:
    fill and stroke colours go through the palette's lookup table, and
    each sprite, font atlas and room canvas is recoloured once, on first
    draw (it was ~65% of a frame).
  - Fishtank's caustics are 128² keyframes painted 10 times a second and
    cross-faded with `lighter`; the cross-fade is what makes 10 fps look
    smooth.
- **No live `shadowBlur` or `ctx.filter`.** Bake glows into sprites: a
  matrix head glow per colour (rainbow in 10° hue steps), advent's today
  glow, northern-lights' stars per tint. Depth-of-field blur is a
  half-resolution buffer over the blurred things' bounding box.
- **Never build a gradient per particle per frame.** Bake it per level or
  tint: fireplace's 660 coals now draw from 40 glow sprites (7.8 → 1.9 ms).
- **Bloom** runs at 1/4 resolution on High, 1/8 on Medium, off on Low.
- **Static layers** (backgrounds, hills, branches, the board) are rendered
  once per resize or tier change. Advent goes further: every door at rest
  lives in one cached layer, repainted only when a door changes state.
- **Object pools** for particles; **spatial grids** for flocking
  (halloween's bats).
- **Time, not frames.** Frame rates run from 10 to 120 fps, so:
  - move by the rAF timestamp's elapsed time, clamping dt at **100 ms**
    (50 ms halves the speed of a 10 fps slow-motion tier);
  - legacy per-frame systems (wind, accumulation, games) run on a fixed
    60 Hz step from an accumulator, so every counter keeps its meaning;
  - rates and chances per frame become per elapsed time, and random
    jitter scales with the square root of the step;
  - trails are kept in seconds, not points.
- **Density** scales spawn rates as well as caps: on a phone most
  particle wallpapers are limited by their spawn rate. Extra things leave
  naturally (melt, fly off, finish their pass); new ones arrive from off
  screen. Nothing pops.
- **Effects fade** over about 1.5 s when the tier sheds or restores them.
- **Pixel art and small text** may floor their own ratio at 1 when that's
  cheap (quest is one upscaling copy; advent's day numbers became
  unreadable at 0.5).

#### Per-wallpaper plan, as built

Busy % of the main thread on a phone at 4× CPU throttle (`make bench`),
Low / Medium / High: before → after are in `bench/results.json`'s history
and the commits.

| Wallpaper | Effects (shed in this order) | Density and other tiering |
|---|---|---|
| fishtank | `depthBlur`, `caustics` (medium) | Whole roster stocked, `fishCount × density` swim, the rest fade out; motes. Low: distant fish sink into the water colour instead of blurring |
| northern-lights | `bloom`, `reflection` (medium) | Low draws the curtains straight onto the sky (no aurora buffer); blur 1/8 on Medium; stars × density, from baked sprites |
| halloween | `bloom` (medium), `grain` (high), `fogMid` (medium), `fogFar` (high) | Bats, wisps, candy, leaves × density; bats on a grid; the near fog bank is never shed; a lit jack-o'-lantern's carving glows near-white, black only when snuffed |
| fireplace | `smoke` (medium) | Coal glows baked per heat level; each log, the coal bed and the grate baked once per resize, only their glow zones' alpha changing per frame (§10.23); sparks and coals × density |
| quest | `crt` (high) | Palette proxy every tier; light map half size on Low; idles while paused; fixed 60 Hz steps (up to 20 catch-up) |
| advent | — | Doors-at-rest layer, baked glow; treat refreshes, particles and confetti × density; idles between its own capped frames (never fully still: today's treat plays) |
| leaves | — | Drift capped at 6k (Medium) and 2k (Low), shallower banks of the same shape; falling × density |
| matrix | — | Baked head glow; columns limited to a density share, thinning as passes finish |
| snow, rain, fireflies, cherry-blossoms | — | Spawn rate and cap × density; fireflies' glow sprites 32/64/128 px by tier; cherry-blossoms' sky and branches cached |
| starfield | — | Stars × density, joining at the far plane; `onScroll` |
| mountains, parallax-clouds | — | No density (the layers are the composition, and they cost ~1%); `onScroll` |
| neko | — | Idles between Z steps while asleep (~10 frames/s) |
| bing | — | No frames at all; CSS background |
| harmonograph | — | Sheet canvas (paper + ink) cached; frames copy only the touched rectangle; slides are the only full-screen frames; Low: stride 2, one stroke at a time, idles between; idles while a finished drawing is admired |
| pixel-room | — | ~320×180 buffer at a whole device-pixel scale; lit room rebuilt only when the light changes; 10 ticks/s on every tier via idleUntil |
| girih | `sheen` (medium) | Repaints only while θ moves; holds idle (no frames on Low); tilings crossfade by CSS opacity; Truchet redraws flipping tiles only |
| stained-glass | — | Glass and wall per resize, light per minute at 0.3–0.5× res; motes and shaft strips × density; idles when nothing moves |
| synthwave | `haze` (medium) | Low draws every other grid line; palm spacing and car rate × density; everything static baked; onScroll |
| zen-garden | — | Static layers; dirty-rectangle copies; idles between gardener strokes, gusts and leaves; leaf rate × density |
| koi-pond | `shadows`, `sparkles` (medium) | fishCount × density, fish diving away or rising in; quarter-resolution shadow buffer; pooled ripples, glints and petals |
| murmuration | — | Birds × density (3000/1950/1050), added from off screen or flown off the sides; typed-array flock, neighbour search amortised over ~0.1 s; four filled paths a frame; idles through the night |
| lanterns | `ripples` (medium) | Lanterns and release rate × density, fixed pool; baked sprites at 3 sizes, additive flicker; Low reflects every other lantern as one plain copy |
| rainy-window | `fog` (medium) | Sharp and blurred city once per resize; a window switch re-blurs a patch; mask and blur at half resolution; drops × density; Low: softened city, no mask |
| night-train | `reflection`, `softRain` (medium) | Tiles painted once as they scroll in; Low halves near detail; drops and flakes × density; idles at platforms (≈1 fps dry); onScroll |
| fireworks | `smoke` (medium) | Particle pool 2600 × density; trails in a few batched strokes; reflection from a half-size buffer; idles with an empty sky (tap, New Year); the finale is the budget case |
| lighthouse | `spray`, `glints` (medium) | Rain, ships, clouds, spray × density; sky, headland and beam sprite baked per resize; onScroll moves the camera |
| wiki-pond | — | Ripple pool 60 + 140 × density, 8/s × (0.4 + 0.6 × density); pond baked; listens in bursts on Android |
| satellites | — | Stars × density; sky and ground one layer every 30 s; positions once a second, interpolated; idle until the next second when nothing's up; onScroll |
| harvest | `mist`, `beams` (medium) | Land is one baked layer per resize; trees, leaves, apples, geese and clouds are baked sprites; the world is washed once per frame with the hour's light; leaves, apples, smoke, sparks and flocks × density; squirrels × (0.5 + 0.5 density) |

#### In the panel

- A global **Performance** row: `Auto · Low · Medium · High`, a "Save
  power on battery" switch, and a live readout from the stage's stats,
  such as `⚡ Medium, fewer · 30 fps · 4.1 ms · rung 5/12 · on battery`.
- Each tile carries a cost badge (⚡ / ⚡⚡ / ⚡⚡⚡) from
  `web/wallpapers/costs.js`, which `make bench` writes from each
  wallpaper's High busy share (under 10%, under 30%, above). The
  catalog's hand-written `cost` stays as a design-time hint.
- `?hud=1` shows a small corner overlay with fps, frame ms, tier, rung and
  power state. It's for tuning; it's never on by default.

#### Measuring it

- **`make bench`:** headless Chrome driven over the DevTools protocol, with
  Node's built-in `WebSocket` and no deps.
  - Every wallpaper at every pinned tier in the real player, fresh
    settings, seed 7, 6 s each after a 1.5 s settle (`BENCH_SECONDS=`), at
    a phone viewport (412×915, dpr 2.625). `node tools/bench.mjs <ids>`
    re-measures a few and keeps the rest.
  - 4× CPU throttling (`Emulation.setCPUThrottlingRate`).
  - Records p50/p95 callback ms (the stage keeps the last 240 frames in
    `host.frames.recent`), effective fps and main-thread busy %
    (`Performance.getMetrics` TaskDuration). Busy % covers the main thread
    only, not raster or GPU work, so pixel fill still deserves cutting
    where busy % is low.
  - Writes `bench/results.json` and `web/wallpapers/costs.js`, and prints
    a table; exits 1 over budget.
  - **Budgets:** at 4× throttle every wallpaper must stay under 25% busy on
    Low and under 50% on Medium. A miss is a bug.
  - Not in CI, because shared runners are too noisy; it's run before
    releases and after performance work.
- **`make android-bench`** (`tools/android-bench.mjs`): over `adb`, on
  the installed debug build set as the wallpaper.
  - It drives the live wallpaper's own WebView over the DevTools protocol
    (debug builds enable WebView debugging; `adb forward` to its
    `webview_devtools_remote_<pid>` socket), switching wallpaper and tier
    with `WP.player`, so the app has no test mode.
  - Per run: fps and ms from the page's stats, CPU share of the app plus
    its WebView renderer processes from `/proc/<pid>/stat`, and the app's
    drain from `dumpsys batterystats` after a reset, with the battery
    marked unplugged (`dumpsys battery unplug`, reset at the end). 60 s
    each by default; `ANDROID_BENCH_SECONDS=600` for the SPEC's 10 minutes.
  - Writes `bench/android.json`, and puts the wallpaper back as it was.
  - The real answer to "does Low actually save battery?" needs a real
    phone; emulator battery numbers are meaningless.

#### Android specifics

- **Render scale as in a browser.** The plan was to shrink the surface
  with `SurfaceHolder.setFixedSize` and the virtual display's density with
  it. Tried in Phase 6: resizing a VirtualDisplay's density doesn't
  update the WebView's, so the page saw a quarter-size viewport (the same
  zoom bug the browser had). The page's own pixel-ratio scaling works
  everywhere, so the app leaves the surface alone.
- **Copy only new frames.** Under strategy 2 (`draw()` copy), the engine
  copies only when JS reports a new frame. With idle frames this means
  zero copies while static.
- **Power signals into JS.** The engine pushes them through
  `evaluateJavascript("WP.power({...})")`: battery, saver, thermal status,
  hidden, preview. The player merges them into its signals and posts the
  policy to the stage.
- **Frame pacing.** The page's own rAF pacing is enough under strategy 1:
  the system composites the Presentation's window only when it has a new
  frame.

### 4.9 Clock overlay (Phase 10, built 2026-10-28; owner idea)

A time and date drawn over whatever wallpaper is showing, with an optional
smaller second clock for another timezone. **Off by default**, everywhere.

**Decided (owner, 2026-10-28):**

1. **A global overlay owned by the player, not a wallpaper.** It sits over
   every wallpaper, survives crossfades, and no wallpaper's code changes.
2. **Every host gets it**, Android included, and it is off by default on
   all of them.
3. **System fonts only** for now (§7.3: nothing to ship, no licence line).
4. **Adaptive colour** is one of the colour modes.
5. **The macOS saver's own *Show a Clock* stays separate** (the macOS section at the end of §10, M2). This
   overlay is web code and knows nothing of it; see Open questions for the
   one place they meet.
6. **A quiet panel.** One collapsed section, a single row until the clock
   is ticked on, and everything else behind sub-sections that are collapsed
   too, plus looks (presets) so most people never open them.

#### Where it lives

- `core/clockface.js` and `core/clockface.css`, plus `core/clockface-settings.js`
  (the defaults and the schema, registered as `WP.defaults('clock', …)` and
  `WP.schema('clock', …)`, in the same format as a wallpaper's, so the panel,
  merge, diff and the schema-agrees-with-defaults test all apply). The
  namespace is `WP.clockface`: `WP.clock` already means the `host.now()`
  time source (§8.0), which the overlay reuses: `WP.clock(params.date)`, so
  `?date=2026-12-31T23:59:50` works here as it does in the stages.
- One `<div id="clock">` in `index.html`, above the stage iframes and below
  the panel, its gear and the toast. `pointer-events: none`, never
  selectable, so it can't get in the way of a click. It is built once and
  **reused across wallpaper switches**: no remount, no flicker.
- Pure logic in two functions with no DOM, so Node can test them:
  `WP.clockface.format(date, config) → { lines }` and
  `WP.clockface.step(state, dt, bounds, config) → state` (motion).
- Settings live under **`wp:clock`** (`configVersion: 1`, only what differs
  from the defaults is stored). Export and Import carry it like every `wp:`
  key, and the Mac app's `SaverSync` mirrors it, so the live desktop wallpaper
  shows the same clock.
- Styles are set through the CSSOM (`style.setProperty`), never `style="…"`
  attributes or inline `<style>`: the extension's CSP forbids them (§1).
- No network, no storage outside `wp:clock`, no new permission.

#### The panel

A collapsed row right under the filmstrip, above the wallpaper's own settings
(so it's found without scrolling past a long list). Its summary line shows the
state, so you can see what's on without opening it.

```
 off, closed                 off, open                    on, open
┌───────────────────────┐   ┌───────────────────────┐   ┌─────────────────────────────┐
│ 🕐 Clock · off      ⌄ │   │ 🕐 Clock · off      ⌃ │   │ 🕐 Clock · 12h · drift   ⌃ │
└───────────────────────┘   │ Show a clock      [ ] │   │ Show a clock            [✓] │
                            └───────────────────────┘   │ Look      [Minimal      ▾] │
                                                        │ Time      [Digital      ▾] │
                                                        │ Date      [Wed, Oct 28  ▾] │
                                                        │ Position  [Drift        ▾] │
                                                        │ Size      ━━━━●━━━━━━    7 │
                                                        │ Colour    [Adaptive     ▾] │
                                                        │ 🕰️ Format                 ⌄ │
                                                        │ 🌍 Second clock           ⌄ │
                                                        │ 🎨 Style                  ⌄ │
                                                        │ 🧭 Position               ⌄ │
                                                        │ ⚙️ Advanced               ⌄ │
                                                        └─────────────────────────────┘
```

Rules that keep it small:

- Off means **one row**. Nothing else is in the DOM.
- The main block is seven rows. Everything else is in a sub-section that is
  collapsed (`details`, like Advanced) and has a one-line summary of its
  current values ("Format · 24h · seconds").
- Each control has `when(config)`, so a control appears only while it
  matters: the second colour only for Gradient, the shadow colour only when
  there is a shadow, the plate's opacity only with a plate, Teleport's
  interval only for Teleport, and the whole *Second clock* body only once
  *Add a second clock* is ticked.
- **Looks first.** *Look* is a preset menu: Minimal, Neon, Terminal,
  Newsprint, Frosted, Retro LCD, Sunset, Blueprint, plus Custom. A look is a
  patch over the Style settings (font, weight, colour mode, effect, outline,
  plate); picking it sets them all at once. It is **derived, not stored**:
  the menu shows whichever look the current values match, else *Custom*, so
  editing any style control flips it to Custom, and there's no state to
  drift. The changed-dot and click-to-reset (§4.4) work per control as usual.
- Small additions to `core/settings.js`, all used by the clock's schema: a
  **group** may have `collapsed`, `when(config)` and a `summary(config)` hint
  for its title; a `multi` may be `empty`; a select's options may carry a third
  item, the font to show them in; and a control may be `derived`, with no
  default of its own. The look menu is an ordinary `select` with `get` and
  `set` accessors, so it needed no control type of its own.
- A *Put the clock back* link inside the section (two clicks, like Reset), so
  resetting a wallpaper never touches the clock and vice versa.
- Nothing here appears in a wallpaper's own schema. The smoke test that
  drives every wallpaper's panel also drives this one.

#### Settings

Keys are flat, like wallpapers'. Defaults are inert: with `enabled: false`
nothing else matters, and nothing is drawn.

**Main block**

| Key | Control | Default | Notes |
|---|---|---|---|
| `enabled` | toggle | `false` | |
| `preset` | presets | *derived* | not stored (above) |
| `style` | select | `digital` | how the time is written: see *Time styles* |
| `date` | select | `medium` | `none`, `weekday` (*Wednesday*), `short` (*Oct 28*), `medium` (*Wed, Oct 28*), `long` (*Wednesday, October 28*), `numeric` (*10/28/2026*, by locale), `iso` (*2026-10-28*) |
| `motion` | select | `static` | `static`, `drift`, `bounce`, `teleport`, `follow`; see *Position and motion* |
| `size` | range | `7` | % of the short side (CSS `vmin`), 2–30, step 0.5. Scales with the screen, so the same setting suits a phone and a desktop |
| `colorMode` | select | `solid` | `solid`, `adaptive`, `gradient`, `daylight`, `drift` (hue), `invert`; see *Colour* |
| `color` | color | `#ffffff` | when `solid` |

**🕰️ Format**

| Key | Control | Default | Notes |
|---|---|---|---|
| `hour12` | select | `auto` | `auto` (the browser's locale), `12`, `24` |
| `seconds` | toggle | `false` | on battery saver the seconds hide themselves (see *Cost*) |
| `meridiem` | select | `upper` | `PM`, `pm`, `P`, none; only for 12-hour |
| `pad` | toggle | `false` | leading zero on the hour |
| `blink` | toggle | `false` | the colon blinks; never with reduced motion |
| `extras` | multi | `[]` | chips appended to the date line, joined with ` · `: `zone` (*EST*), `offset` (*UTC−5*), `week` (*W44*), `dayOfYear` (*Day 301*), `quarter` (*Q4*), `daysLeft` (*64 days left*), `moon` (a phase emoji, from the date alone), `epoch` (the Unix time, for the nerds) |
| `dateCase` | select | `normal` | `normal`, `upper`, `lower` |
| `zone` | select | `local` | `local`, or any IANA zone from `Intl.supportedValuesOf('timeZone')`. Where that is missing, a short list of common zones |

Month and weekday names follow the browser's language. *Words*, *Roman* and
the extras' English abbreviations don't, and the panel says so.

**🌍 Second clock** (all `when: secondOn`, which is ticked first)

| Key | Control | Default | Notes |
|---|---|---|---|
| `secondOn` | toggle | `false` | "Add a second clock" |
| `secondZone` | select | `UTC` | same list as `zone` |
| `secondLabel` | select | `auto` | `auto` (the city from the zone id, *New York*; *UTC* for UTC), `offset` (*UTC+9*), `none` |
| `secondScale` | range | `0.5` | 0.3–1, step 0.05, × the main clock's size |
| `secondPlace` | select | `below` | `below` or `beside` the main clock; it always travels with it |
| `secondDay` | toggle | `true` | adds *+1 day* or *yesterday* when its date differs from the main clock's |

It follows the main clock's 12/24-hour setting and style when that style is
`digital`, and falls back to `digital` for the others (a second *Roman*
clock is not useful). No seconds, and at 75% of the main clock's opacity, so
it reads as secondary. A *world clock* with many zones is still §10.3; this
is only a second zone.

**🎨 Style**

| Key | Control | Default | Notes |
|---|---|---|---|
| `font` | select | `system` | see *Fonts*; the menu shows each option in its own face |
| `fontCustom` | text | `""` | `when: font = 'custom'`: a font the user has installed. Taken as a family name only: anything but letters, digits, spaces, hyphens, dots and quotes is dropped, 60 characters at most |
| `weight` | range | `300` | 100–900, step 100; the browser picks the nearest the font has |
| `spacing` | range | `0` | letter spacing, −0.05 to 0.3 em, step 0.01 |
| `opacity` | range | `0.9` | 0.2–1, step 0.05, shown as % |
| `color2` | color | `#7dd3fc` | `when: gradient` |
| `lightColor`, `darkColor` | color | `#ffffff`, `#111111` | `when: adaptive`: the two colours it chooses between |
| `effect` | select | `soft` | `none`, `soft` shadow, `hard` shadow, `long` shadow (a stacked 45° tail), `glow` (the text colour, blurred), `neon` (glow + a thin bright core) |
| `effectColor` | color | `#000000` | `when: effect ∈ {soft, hard, long}`; glow and neon use the text colour |
| `effectSize` | range | `3` | 0–10, step 0.5, in hundredths of the font size, so it scales |
| `outline` | range | `0` | stroke width, 0–6, step 0.5, hundredths of the font size |
| `outlineColor` | color | `#000000` | `when: outline > 0` |
| `plate` | select | `none` | a backing shape for busy wallpapers: `none`, `tint` (translucent), `glass` (frosted blur), `line` (an outline only) |
| `plateColor`, `plateOpacity` | color, range | `#000000`, `0.35` | `when: plate ∈ {tint, glass}`; 0–0.8, step 0.05 |

**🧭 Position** (`when` is the mode that uses each control)

| Key | Control | Default | Used by | Notes |
|---|---|---|---|---|
| `anchor` | select | `bottom-left` | static | the nine places, plus `custom` |
| `x`, `y` | number | `0.08`, `0.92` | static, `custom` | where the clock's centre sits, as fractions of the screen. Set by dragging (below), not by typing |
| `margin` | range | `4` | static | % of the short side, 0–20, step 1 |
| `speed` | range | `1` | drift, bounce, follow | 0.2–3, step 0.1, × |
| `path` | select | `wander` | drift | `wander`, `orbit`, `figure8` |
| `bounceHue` | toggle | `false` | bounce | a new hue on every wall hit |
| `bounceFlash` | toggle | `true` | bounce | a brief pulse when it hits a corner exactly |
| `teleportEvery` | select | `minute` | teleport | `10`, `30`, `60`, `300`, `900` seconds, or `minute` (the instant the minute changes) |
| `teleportFade` | select | `fade` | teleport | `fade` or `instant` |

**⚙️ Advanced**

| Key | Control | Default | Notes |
|---|---|---|---|
| `align` | select | `auto` | text alignment of the lines: `auto` (follows the anchor), `left`, `center`, `right` |
| `shy` | toggle | `false` | fade to 15% while the pointer is near; touch ignores it |
| `nightMode` | select | `off` | `off`, `dim` (to 30%), `hide`, between `nightFrom` and `nightTo` |
| `nightFrom`, `nightTo` | text | `22:00`, `06:00` | `HH:MM`, 24-hour, in the main clock's zone; a bad value falls back to the default |
| `hideOn` | multi | `[]` | wallpapers to stay hidden over (options come from the catalog) |

#### Time styles

All of them come from the time in the chosen zone. None needs a location.

| `style` | Looks like | Notes |
|---|---|---|
| `digital` | `10:42 PM` | `Intl.DateTimeFormat`, so locale, 12/24 and DST are right for free; tabular figures, so the width doesn't jitter as digits change |
| `words` | *quarter to eleven* | five-minute steps, "noon" and "midnight", English only. Updates every 5 min |
| `roman` | `XXII:XLII` | follows 12/24. A zero is `N` (*nulla*, the medieval way), so midnight is `XII:N` in 12-hour and `N:N` in 24 |
| `binary` | a grid of lamps | BCD, one column per digit (H tens and units, M tens and units, with seconds if on), the classic binary clock. Drawn as dots in the clock's colour, so the font doesn't matter |
| `hex` | `7F3A` | the day as a 16-bit number (one tick is 1.32 s). A hexadecimal clock, in the old sense. Zone-aware. Redraws on its own tick |
| `beats` | `@812` | Swatch Internet Time: 1000 .beats a day, from UTC+1, with no zones. It ignores `zone`, and the panel says so; centibeats (`@812.34`) with seconds on |

Every style also feeds the date line and extras; only the time line changes.

#### Fonts

A curated list of **system stacks**. Each lists a face for macOS and iOS,
Windows, Android and Linux in turn, so every option draws something sensible
on every host, and the last entry is a generic family. Nothing is bundled.

| `font` | Stack, roughly | Feel |
|---|---|---|
| `system` | `ui-sans-serif`, SF Pro, Segoe UI, Roboto | clean |
| `rounded` | `ui-rounded`, SF Rounded, then the system sans | friendly |
| `serif` | `ui-serif`, Iowan Old Style, Georgia, Cambria | editorial |
| `didone` | Didot, Bodoni 72, then the serif stack | fashion |
| `slab` | Rockwell, Georgia, then the serif stack | newsprint |
| `condensed` | Arial Narrow, Avenir Next Condensed, Roboto Condensed | tall |
| `humanist` | Optima, Candara, Gill Sans, Trebuchet MS | calm |
| `mono` | `ui-monospace`, SF Mono, Menlo, Consolas, Roboto Mono | terminal |
| `typewriter` | American Typewriter, Courier New | warm |
| `hand` | Bradley Hand, Segoe Print, Comic Sans MS, `cursive` | casual |
| `custom` | the family in `fontCustom`, then the system stack | the user's own |

A stack that no installed font can satisfy falls through to the last
entry. Weight 200 on a font with one weight is simply the regular weight, and
the panel's menu shows each option in its own face, so what you see is what
you'll get on that device. `fontCustom` is a name typed on this device, never
shipped.

#### Colour

| `colorMode` | Behaviour |
|---|---|
| `solid` | `color` |
| `gradient` | `color` to `color2`, 135°, through `background-clip: text` (shadow and outline are drawn by a `drop-shadow` on the wrapper instead of `text-shadow`, because a shadow under transparent text shows through it) |
| `adaptive` | `lightColor` over dark scenes, `darkColor` over light ones: see below |
| `daylight` | follows the clock, with no location: amber at dawn, white by day, orange-rose at dusk, a dim blue at night, blended between them, recomputed once a minute |
| `drift` | one slow turn round the hue wheel every 10 minutes, at a fixed saturation and lightness chosen to stay readable |
| `invert` | `mix-blend-mode: difference`: the text is the negative of whatever is behind it, with no sampling. Striking, poor on mid-grey. A Medium-tier effect (see *Cost*) |

**Adaptive** needs to know how bright the wallpaper is *where the clock is*.
The player can't read the stage's pixels (its frame can be cross-origin, §4.1),
so the stage does the measuring:

- The player posts `sample { x, y, w, h }` (fractions of the screen: the
  clock's box) to the stage every 2 s while the mode is `adaptive`, the clock
  is shown and the page is visible, and once straight after `ready`, after a
  wallpaper switch and after a teleport.
- The stage draws its visible canvases (and any same-origin `<img>` or
  `<video>`) in z-order into an 8×8 offscreen canvas, that rectangle only,
  reads those 64 pixels, and replies `luma { value }`: the mean relative
  luminance (WCAG formula), 0 to 1. This is the only readback anywhere, and
  it is tiny and slow. §4.8 bans a *per-frame* `getImageData`; this is 64
  pixels every 2 s.
- A tainted canvas (a cross-origin photo or video) throws; the stage catches
  it and replies `luma { value: null }`. The clock then keeps its last colour,
  or `lightColor` with the soft shadow forced on if it has none, and never
  errors.
- **Hysteresis:** switch to `darkColor` above 0.62 and to `lightColor` below
  0.45, so a wallpaper hovering near 0.5 doesn't flicker. The colour
  eases over 800 ms (a CSS transition, so no per-frame work).
- The decision is a pure function (`WP.clockface.pick(previous, luma)`), so
  Node tests it. Moving modes sample the box where the clock *is* now, so it
  re-evaluates as it crosses a bright and a dark patch.
- A strong shadow or outline is the other way to stay readable on a busy
  wallpaper; the *Neon* and *Frosted* looks use them.

#### Position and motion

The overlay lives in the player, whose `requestAnimationFrame` isn't the
stage's, so the stage's pacer doesn't throttle it, and a frame loop there would
cost a main-thread frame every time. So **nothing moves by frames**: movement is
applied with `transform` only, never `left` or `top`, and it runs as Web
Animations on the compositor. A bounce is a straight line between two wall hits,
so each leg is one animation (`C.bounceLeg`, pure, finds the next wall exactly);
a drift is twenty seconds of its path sampled once a second as keyframes. The
page does nothing between legs: JS runs at a wall hit or every twenty seconds.
Only Follow needs frames, while it catches up with a mouse, at the tier's fps
cap with the 100 ms `dt` clamp, and it stops asking once it has arrived. The
clock stays inside the screen minus `insets` (on Android, the 48 px gesture
bar); when a text change moves the bounds, a running leg carries on from where
it is, with the same heading.

- **Static.** A nine-place `anchor` and a `margin`. **While the panel is
  open you can drag the clock to where you want it**; it switches to
  `custom` and stores `x`, `y`. This is the only time the clock takes the
  pointer, and a touch drag works too (the panel's own page, where Android's
  swipes aren't an issue). No loop, and no frames.
- **Drift.** A slow wander across the whole screen. `wander` is two
  incommensurate sines (never quite repeats), `orbit` is a lazy ellipse
  round the centre, `figure8` a Lissajous 1:2. About one screen width a
  minute at speed 1. The OLED-friendly choice: no pixel stays lit for long.
- **Bounce.** The classic: a straight line at a random angle (never within
  15° of an axis, so it doesn't crawl along a wall), reflecting off the edges
  of the safe area. `bounceHue` shifts the hue on each hit; `bounceFlash`
  pulses when it clips a corner within a few pixels. About 60 px/s at speed 1.
- **Teleport.** It stays still, then jumps to somewhere else, on a timer
  or on the minute. The new spot is chosen from a 3×3 grid of cells **other
  than the last one**, with some jitter inside the cell, and never partly
  off-screen. `fade` takes it out in 300 ms, moves it while invisible and
  brings it back in 300 ms; `instant` just moves it. Its seeding is
  `Math.random`, since it isn't a scene that must replay.
- **Follow.** A companion that trails the pointer with a spring, parked off
  to its lower right so it's never under the cursor, and drifting back to its
  anchor when the pointer leaves the window. Mouse and pen only; with touch
  it stays at the anchor. Desktop browsers and the Chrome new tab are what
  it's for.
- **Shy** (Advanced, any mode): fades out while the pointer is within about
  1.5 clock-heights of it, and back after it leaves.
- **Reduced motion** (`prefers-reduced-motion`): drift, bounce and follow
  turn into Static at the anchor; teleport becomes *instant* with no fade;
  the colon stops blinking; colour transitions are immediate.
- **Hidden** (`document.hidden`, or the power policy's `pause`): all loops
  and animations stop and the clock stops redrawing; it catches up from
  `host.now()` on return, so it is never stale.

#### Cost

It's a small piece of DOM text, so it is nearly free, and every part of the
spec has a stated price:

- **Redraw** only when the text changes, from a `setTimeout` aligned to the
  next minute (or second, with seconds on, or the 1.32 s tick for `hex`).
  Nothing is drawn per frame. A static clock without seconds wakes the page
  once a minute.
- **Seconds wake the compositor** once a second, even over a wallpaper that
  is idle (`host.idleUntil`, §4.8). Not free on a phone. So on
  battery saver, or whenever the power policy's `ceiling` is Low, the
  clock hides its seconds, and motion modes fall back to Static (the
  panel says why, as it does for Performance). Restored when the signal
  clears.
- **Glass and Invert are blends over a moving picture**: the compositor
  re-does them every frame the wallpaper draws. They are therefore effects
  with a Medium floor (§4.8): on Low, `glass` becomes `tint` and `invert`
  becomes the *adaptive* mode's two colours. `prefers-reduced-transparency`
  does the same.
- **Layout** is measured once per text change and per resize, with tabular
  figures so a change of digit doesn't change the box.
- **Budget:** a bouncing clock with seconds and a second zone adds under 2%
  busy on Low and under 1% on Medium in `make bench` (`node tools/bench.mjs
  clock`: about +0.3% on both, at 4× slower CPU), and a static one without
  seconds adds nothing measurable, since the page is idle. (A first version
  moved the box from a frame loop and cost about 3%; legs on the compositor
  cut that by ten.)
- **No effect on the stage:** the stage doesn't know the clock exists, except
  for the 64-pixel adaptive sample.

#### Edge cases

- A stored zone that `Intl` doesn't know (a typo, an old browser) falls back
  to `local` and the panel notes it. It never throws.
- Daylight-saving gaps and repeats come from `Intl` and are tested on the
  actual transition instants.
- The two clocks' dates can differ (UTC against a zone fourteen hours
  ahead); `secondDay` says how.
- A huge `size` is clamped so the whole clock still fits the safe area, and
  shrinks to fit on a narrow phone, with the second clock stacked below.
- `?thumb=1` and the thumbnail run never show it; neither does a stage
  opened directly (`stage.html`), which has no player.
- Printing, copy and select do nothing: it isn't text anyone can select.
- With `enabled` false the overlay isn't in the DOM, and the sample message
  is never posted.

#### Tests (done-checks for Phase 10)

- **Unit** (`tools/clockface.test.mjs`, Node, no browser, injected clock):
  - every `style` at several instants, with 12 and 24 hour, midnight and
    noon, and `N` in Roman; `words` across the hour; `binary` at 23:59:58;
    `hex` and `beats` against hand-computed values
  - `date` and `extras` for a few instants and zones, including the
    leap-day and the year's last day (`daysLeft`, `dayOfYear`, `week`)
  - zones: New York across both DST transitions, Kiritimati (+14), Pago
    Pago (−11), UTC, an invalid zone, and the second clock's `secondDay`
  - a font name is sanitised (quotes, semicolons, braces, long text)
  - motion: `step` never leaves the bounds over ten simulated minutes at
    10, 30, 60 and 144 fps with jittered `dt`, covers the same distance at
    every rate, `bounce` reflects and detects a corner hit, `teleport`
    never picks the same cell twice in a row, `follow` converges, reduced
    motion gives Static
  - `pick`: hysteresis around 0.45 and 0.62, and `null` keeps the last colour
  - the schema agrees with the defaults (each control a default and each
    default a control, in range, on the step grid, among the options), a
    look's patch only names style keys, and the `preset` matches back to its
    own look
  - no wallpaper declares `k` in the catalog
- **Smoke**, extending the player suite (`node tools/smoke.mjs`):
  - a fresh run draws no clock, has no `#clock` content, and writes nothing
    to storage, and `?clock=off` beats a stored `enabled: true`
  - `?clock=on&date=2026-12-31T23:59:50` shows `11:59:50 PM` (seconds on),
    and ten seconds later the date has rolled over
  - the panel's Clock section is one row when off; every control renders
    when on, and a change reaches the element
  - `?clock=bounce` (at speed 3, so it reaches the walls) stays entirely
    on-screen for six seconds, and moves; `teleport` jumps within the screen
  - the node survives switching wallpapers (same element, no remount)
  - a fake `luma` from the stage flips the colour once, not on every sample
  - pausing the stage stops the motion; `?tier=low` turns glass into tint
  - `?host=android` keeps the clock above the bottom inset
  - the screenshots go in `dist/smoke/clock-*.png`, and are looked at
- **Bench** (`make bench`): a row for "bounce, seconds on".
- **Make targets:** `make test`, `make smoke` and `make ci` cover it;
  `make smoke-clock` and `make bench-clock` run just its checks. The README's
  *Use* section has a Clock paragraph and its Development table the targets.

#### As built

- **Files:** `core/clockface.js` (pure: formats, zones, motion, colour,
  `sanitize`), `clockface-settings.js` (defaults and schema), `clockface-view.js`
  (the element, motion, sampling, and the panel's section) and `clockface.css`.
  The scripts are **loaded on demand** (`WP.loadClock()` in the player): when
  the clock is on or `?clock=` asks for it, when `K` is pressed, and when the
  panel first opens. A page with the clock off never fetches them (a smoke
  check proves it).
- **Stage messages:** `sample` and `track` from the player; `luma` and
  `pointer` back. `stats` carries the stage's `tier`, which is how the clock
  knows to give Low a tint instead of glass. The stage forwards `K`.
- **Position of the section:** under the filmstrip, not above Performance.
- **Fonts:** ten stacks and *My own font*; a separate `light` and `lcd` were
  redundant with the weight slider and the *Retro LCD* look.
- **Second clock:** the date difference reads *tomorrow* and *yesterday*, and
  *+2 days* or *−2 days* for the one pair of zones (+14 and −11) that can be two
  days apart. With *beside*, the second clock sits next to the time and date
  together.
- **Not stored, as designed:** the *Look* menu; it matches the style settings
  back to a look, or says *Custom*.
- **Reduced transparency:** headless Chrome reports it, so the smoke check
  turns it off to see glass on High.
- **Not built:** nothing from the plan. Two things the plan left open are in
  Open questions.

---

## 5. Hosts: standalone and Chrome

- **Standalone:** open `web/index.html` from disk, from `make serve`, or from
  the hosted copy on GitHub Pages (built in Phase 5):
  - `ci.yml` has a `pages` job after `ci`, on pushes to `master`, a daily
    schedule (09:23 UTC, after Bing's new image) and manual runs. It runs
    `make site` (`tools/build.mjs site`: `web/` plus `bing.json` from
    `tools/bing.mjs`) and deploys with `actions/deploy-pages`. Bing being
    down doesn't stop a deploy; the wallpaper then shows its note.
  - Pages is set to "GitHub Actions" as its source. GitHub turns off
    scheduled workflows after 60 days without commits; a manual run (or any
    push) turns the daily refresh back on.
  - `app.webmanifest` makes the hosted copy installable: *Add to Home
    screen* opens it full screen, a stopgap for phones until Android ships.
    The player links it only over http(s), since Chrome refuses to read a
    manifest from `file://` and logs an error.
- **Chrome new tab** (built in Phase 5): `web/manifest.json` (MV3) with
  `chrome_url_overrides.newtab = index.html` and one host permission,
  `https://www.bing.com/*` (§4.6). No `permissions`: settings live in
  `localStorage`, which extension pages have, so `storage` isn't needed.
  - **A pinned ID** (Phase 7): the manifest's `key` is a public RSA key, so
    the ID is always `hajnldgffgkdnbimdihipffnimjckgcp`, wherever it's
    unpacked. Without it, Chrome derives the ID from the folder, and the
    storage (every setting) goes with the ID: a release zip unpacked into
    a new folder would start from scratch. The private half was never
    kept: unpacked installs don't need it, and the Web Store would assign
    its own ID. A unit test derives the ID from the key, and the smoke
    test checks Chrome agrees.
  - `make extension` builds `dist/extension/` (load unpacked) and
    `dist/wallpapers-extension-<version>.zip`. CI uploads the zip as the
    `wallpapers-extension` artifact of every run.
  - **CSP:** MV3 pages may not run inline scripts. Both pages load only
    deferred external scripts (`player.js` and `stage.js` start themselves),
    and both carry the same policy in a meta tag (`script-src 'self';
    object-src 'none'; base-uri 'none'`), so `file://`, Pages and the smoke
    test all enforce the extension's rules. A unit test forbids inline
    `<script>` and `on…=` attributes.
  - The icon is ours: `web/icons/icon.svg`, a window onto a dusk scene with
    a crescent moon and fireflies. `make icons` renders the PNGs (16, 32,
    48, 128 for the extension; 192, 512 for the web app); they're
    committed, since the extension can't use an SVG.
  - Version: `manifest.json`'s `version`, bumped by hand when a build is
    worth telling apart (0.5.0 for Phase 5).
  - Known Chrome behaviour: a new tab puts keyboard focus in the omnibox,
    so `,` only works after a click on the page. This is documented in the
    README, and the corner hot zone works with a mouse too.
- **Homepage-as-URL alternative:** point Chrome's "Open a specific page" at
  the hosted URL. No extension needed, but the page doesn't replace the new tab.
- **Local web server** (`tools/serve.mjs`, Node built-ins only):
  - `make serve`: http on port 8000.
  - `make serve-https`: https on 8443, with a self-signed certificate made
    by `openssl` on first use and kept in the gitignored `.cert/`. The
    certificate covers localhost and the machine's LAN addresses.
    `make cert` remakes it.
  - `HOST=0.0.0.0` makes either reachable from a phone. HTTPS matters there:
    a LAN address isn't a secure context, and the battery API (§4.8) needs
    one.
  - Files are sent with `Cache-Control: no-cache` and `Last-Modified`, so
    edits show on reload and unchanged files cost a 304. Paths are confined
    to `web/`, and encoded `../` gets a 403.
- **Container:** the `Dockerfile` runs that same server on
  `node:22-alpine`.
  - It holds only `web/` and `tools/serve.mjs` (`.dockerignore` is an
    allowlist), runs as the unprivileged `node` user, and works with
    `--read-only`. It has a health check.
  - Plain http; TLS belongs to the reverse proxy in front of it.
  - `make docker-build`, `make docker-run`.

---

## 6. Android live wallpaper (`android/`)

### 6.1 Rendering strategy: VirtualDisplay (Spike A0, Phase 6)

A `WallpaperService.Engine` hands us a bare `Surface`. A WebView is a View and
does not draw onto a bare surface by itself. The candidates were:

1. **VirtualDisplay → Presentation → WebView.** A private `VirtualDisplay`
   whose output is the engine's surface, and a `Presentation` holding a
   hardware-accelerated WebView on that display. No per-frame copies.
2. Offscreen WebView drawn into the surface with
   `lockHardwareCanvas()` from the page's rAF: a copy per frame.
3. Native ports of a few wallpapers. Last resort.

**Result: strategy 1 works**, and it's what ships (`LiveWallpaper.kt`).
Tried on the API 37 emulator (Medium Phone, software GPU), the wallpaper
picker's preview showed Halloween animating, with the page reporting
ready and its frame stats over DevTools. What the spike found:
- **The Presentation's window must be made hardware accelerated
  explicitly** (`FLAG_HARDWARE_ACCELERATED`): a window created from a
  service isn't, and the WebView then runs its JS but draws nothing (all
  black, even in a DevTools screenshot).
- **Don't resize the virtual display's density** to render fewer pixels:
  the WebView keeps its old density, so the page saw a quarter-size
  viewport. The page's own pixel-ratio scaling (§4.8) is used instead, so
  the surface stays at full size.
- Not yet measured: frame rate, CPU and battery on a real phone (the
  emulator was software-rendered on an overloaded host, at 2–5 fps, and
  its battery numbers mean nothing). `make android-bench` (§4.8) does it;
  record the table there. Strategy 2 stays the fallback if a device's
  VirtualDisplay misbehaves.

### 6.2 App shape (built in Phase 6)

- Kotlin, single module, AGP 9 (which compiles Kotlin itself), Gradle
  wrapper pinned with its SHA-256. Application ID
  `com.roadwaffle.wallpapers` (permanent after the first release),
  `minSdk 26`, compile and target SDK 37. Its version is
  `web/manifest.json`'s (0.6.0 → versionCode 600).
- `web/` becomes the assets at build time (`SyncWeb` in
  `app/build.gradle.kts`: everything but `bing.json` and the two web
  manifests), served by `WebViewAssetLoader` at
  `https://appassets.androidplatform.net/`, so every WebView in the app
  shares one `localStorage`.
- Files (`android/app/src/main/kotlin/com/roadwaffle/wallpapers/`):
  - `LiveWallpaper.kt`: the engine (§6.1). Loads
    `index.html?host=android`. Forwards touches to the WebView; pushes
    `WP.power({ hidden })` on visibility, `WP.power({ preview })` in the
    picker, the battery, saver and thermal state from `Power.kt`, and
    `WP.scroll(x)` from `onOffsetsChanged`. Reports Material You colours
    (`onComputeColors`) from the current wallpaper's catalog accent,
    which the player sends through the bridge. Links (Bing's credit) open
    the browser.
  - `SettingsActivity.kt`: the launcher icon and the wallpaper's Settings,
    `index.html?host=android&panel=open` (§6.3).
  - `Web.kt`: the shared WebView: asset loader, no file access, nothing
    outside our origin, the page's console in logcat under `Wallpapers`,
    WebView debugging in debug builds only.
  - `BingJson.kt`: answers the page's request for `bing.json` by fetching
    Bing's archive natively (no CORS for the app), in the same shape
    `tools/bing.mjs` writes, cached for an hour. The web code has no
    Android case.
  - `Bridge.kt`: `window.WallpapersApp`: `setAccent(color)`,
    `canSetWallpaper()`, `setWallpaper()`.
  - `Power.kt`: the sticky battery intent, power-save changes and the
    thermal listener (API 29+), as the JSON `WP.power()` takes.
- Permissions: `INTERNET` only (Bing).
- Performance and power follow §4.8: hidden pauses; Auto with a Medium
  ceiling at 30 fps; battery, saver and heat lower it; the picker preview
  gets High.
- Icons: `make icons` renders the launcher PNGs from the same SVG.
- `make android-build | android-install | android-logcat |
  android-emulator | android-bench | android-keystore | android-release`.

### 6.3 Settings on Android

The settings screen is the same page with the panel open. It shares
`localStorage` with the wallpaper's WebView, and the wallpaper follows
changes through `storage` events (the player listens for `wp:current`,
`wp:<id>` and `wp:performance`; the same code keeps several browser tabs
in step). The panel adds **Set as wallpaper** there, which opens the
system picker on our component. No native settings UI.

### 6.4 Android-only extras (built)

- `onOffsetsChanged` → `WP.scroll(x)` → `onScroll(x)`: starfield,
  mountains and parallax-clouds pan their layers by depth as you swipe
  between home screens.
- `onComputeColors()` gives the current wallpaper's accent as the primary
  colour, so Material You follows the wallpaper.

### 6.5 Mobile readiness (done in Phase 6)

Time-based stepping and pointer events everywhere they were missing, and
tiers in every wallpaper: §4.8, "Techniques" and "Per-wallpaper plan, as
built". Neko's sprites are drawn in code (Phase 4).

### 6.6 Distribution

Sideloaded APKs on GitHub Releases. `make android-keystore` makes the
release key once, outside the repo (`~/.wallpapers-release.jks`); CI
signs with it from four secrets (`WALLPAPERS_KEYSTORE_BASE64`,
`_PASSWORD`, `WALLPAPERS_KEY_ALIAS`, `WALLPAPERS_KEY_PASSWORD`). Pushing a
tag `vX.Y.Z` that matches `web/manifest.json`'s version runs `make ci`,
builds the signed APK and the extension zip, and publishes both on a
GitHub Release. Every CI run also uploads the debug APK as an artifact.

---

## 7. Security and licensing sweep

### 7.1 Findings in the source repo (sanitised; details are with the owner)

| Area | Finding | Action |
|---|---|---|
| Config | The homepage config holds a third-party API key, private LAN and tailnet addresses, employer-internal URLs and personal account links. | Never imported. **Rotate the API key anyway**: it is in git history. |
| Git history | Contains the above plus a second (work) author email. | Fresh import, no history. Never `git subtree` or `filter-repo` the old repo. |
| Extension manifest | Its `key` fixes the private extension's ID. | New extension, new key; `*.pem` stays gitignored. |
| Tool configs | `.claude/` and `.cursor/` reference home-directory paths. | Not imported. |
| Wallpaper modules | Swept: no URLs, no `fetch`/XHR, no geolocation, no personal names. Character names are generic or parody. | Import. Re-audit after every change. |
| PNG assets | Only `date:create`/`date:modify` text chunks. | Strip metadata on import (or delete; §7.3). |
| Bing wallpaper | Routes requests through three public CORS proxies, so third parties see the requests. Shows Bing's photos, which are hotlinked and never stored. | Imported. Proxies become an opt-in last resort, used only by raw `file://` (§4.6). |

### 7.2 Ongoing enforcement: `make audit`

A Node script (built-ins only) that fails on:

- RFC 1918 or CGNAT (`100.64/10`) addresses
- email addresses other than `noreply@`
- `/Users/` or `/home/` paths
- 32+ character hex and base64 key shapes, and `appid=` / `apiKey` assignments
- any `http(s)://` URL in `web/` outside an allowlist (bing.com, and the opt-in proxies in the Bing module only)
- image metadata text chunks
- files over 1 MB

It also reads an optional **gitignored** `.audit-denylist`, where the owner
lists personal terms (names, hosts, employer). The public repo never contains
them, but every local commit is checked against them.

Implemented in `tools/audit.mjs` (Phase 1), with four modes:

| Mode | Scans | Wired to |
|---|---|---|
| `--tree` | tracked + untracked, not ignored | `make audit`, CI |
| `--staged` | the index, i.e. exactly what is being committed | pre-commit hook |
| `--message FILE` | the commit message (messages are public too) | commit-msg hook |
| `--history` | every blob reachable from any ref, so a leak that was committed and later deleted is still caught | pre-push hook, `make audit-history`, CI |

- File paths are checked as well as contents; image metadata is checked
  in PNG, JPEG and WebP.
- Findings are **redacted** (`abc…(32)`), because CI logs are public.
- A false positive is allowed with `audit-allow: <why>` on the line or
  the line above, so every exception is visible in review.
- `make hooks` sets `core.hooksPath` to the tracked `.githooks/`.
- The URL allowlist lives in `URL_ALLOW` in `tools/audit.mjs`, keyed by path
  prefix. Online wallpapers add their hosts there. Phase 3 adds a test that
  it matches each wallpaper's `network.hosts` and the extension manifest.

### 7.3 Third-party content

| Item | Concern | Proposed action |
|---|---|---|
| Neko sprites (79 themes, 20 MB) | Copied from an MIT repo, but that repo doesn't credit the sprites; they trace back to decades of Neko skin packs by many authors. Several themes are trademarked characters (Sonic, Pac-Man, Metroid, Zelda, Doom, TIE fighter, Coke). Filenames have inconsistent case (`Awake.ico` vs `awake.ico`): 78 of 79 themes break on case-sensitive hosts such as Android and Linux. | **Done (phase 4.6).** Neko is code-drawn pixel art (`NekoSprites` in `neko.js`) with eight coats, keeping the classic behaviours (chase, yawn, scratch, wash, sleep, wall claws). 20 MB and every provenance question dropped; none of the old sprites were imported. |
| Snow sprites (`tannenbaum.png`, `snow00–06.png`) | Look like xsnow's art. xsnow is GPL-3+ (older versions non-free). Provenance unverified. | Delete. snow.js already has a canvas fallback; make it the only path and improve it. |
| Pixel Quest text | Affectionate parodies ("IT'S A SECRET TO EVERYBODY", Lonk, Zelderp). | Keep; parody is low risk. Note it in THIRD_PARTY.md. |
| Fonts | System fonts only (`ui-rounded`, Courier New, emoji). | Nothing to ship. |

---

## 8. Testing

Everything runs from `make ci` (lint, audit, audit-history, test, smoke);
GitHub Actions runs only that.

- `make test`: Node unit tests (`tools/*.test.mjs`), no browser.
  - `audit.test.mjs`: every audit rule, plus real throwaway git repos.
  - `wp.test.mjs`: loads `core/wp.js` and the catalog into a Node `vm`,
    the same classic scripts the browser runs. It checks:
    - Seasonal for every month and across New Year
    - URL parameters
    - the settings merge and diff: versions, stale keys, round trip
    - tier precedence
    - frame pacing on a simulated 60 Hz display (the 30 and 20 fps caps
      hold)
    - every script and `defaults.js` exists and registers its own id with
      JSON-safe values
    - every online wallpaper's hosts are on the audit allowlist
    - every schema agrees with its defaults: each control has a default and
      each default a control, every default in range, on the step grid and
      among the options
    - every offline wallpaper has a small WebP thumbnail
- `make smoke`: headless Chrome over the DevTools protocol (Node's built-in
  WebSocket), against the real pages on `file://`, as a user opens them.
  All network is intercepted: anything but local files and Bing's fixtures
  fails the run.
  - **Stage suite:** every wallpaper on `stage.html?w=<id>` with fresh
    storage. It must:
    - boot and draw (distinct colours, or partial coverage on a transparent
      canvas), logging no errors
    - **save nothing on a fresh run**, proving its `defaults.js` matches
      what the module actually uses
    - write no storage outside `wp:<id>:*`

    Screenshots go to `dist/smoke/`.
  - **Player suite**, on `index.html`. It reaches into the cross-origin
    `file://` stage through per-frame execution contexts. It checks:
    - the first run shows Seasonal
    - `?w=` persists nothing
    - `]` switches, persists and drops `w=`
    - a full cycle through every wallpaper leaves exactly one stage and no
      canvases in the player
    - `?panel=open` opens the panel, and `Esc` and `,` close and reopen it
    - **every wallpaper's panel round-trips:** all its schema controls
      render; moving the first slider (or option) writes the override, and
      the running wallpaper ends up with the value, live or after a rebuild
    - Reset takes two clicks and clears the overrides
    - `?` help lists the wallpaper's own keys; Quest's `N` starts a new
      quest; advent's `→` moves a day, with a date toast
    - the corner gear appears when the pointer comes near
    - `?tier=low` lays out at half size and caps the frame rate
    - pause produces zero frames and resume restarts them
- `make lint`: `node --check` on every script, one file at a time, plus
  JSON parsing.
- `make audit`: §7.2.
- `make bench`: performance budgets per wallpaper per tier (§4.8). Manual,
  not in CI.
- `make thumbnails`: regenerates the committed thumbnails (§4.7). Not part
  of `make ci`; the tests only check that every wallpaper has one.
  - **Extension suite**, on the built `dist/extension/` (`make smoke`
    builds it first), loaded unpacked:
    - `chrome://newtab/` becomes `chrome-extension://<id>/index.html`, with
      the player reporting host `extension`
    - the Bing wallpaper gets its photo straight from `www.bing.com`, with
      the fixtures served **without** CORS headers, so only
      `host_permissions` can make it work (removing it fails the check),
      and never asks for `bing.json` or a proxy

    Chrome 137+ ignores `--load-extension`, so `tools/chrome.mjs` loads it
    with `Extensions.loadUnpacked`, which answers only on the
    `--remote-debugging-pipe` transport (with
    `--enable-unsafe-extension-debugging`); pages are still driven over
    the WebSocket.
  - Every page carries the extension's CSP (§5), and CSP violations are
    logged errors, so every suite fails on one.
- `wp.test.mjs` also checks the manifests: `host_permissions` are exactly
  the catalog's `network` hosts, there are no other permissions, every
  named icon exists, and both pages have the CSP and no inline script.
- `tools/chrome.mjs` holds the shared headless-Chrome plumbing (launch,
  DevTools protocol connection, extension loading) used by the smoke test,
  the thumbnails, the icons and the screenshots.
- Phase 6 added:
  - unit tests for `core/perf.js` with a fake clock: each tier's effects
    and slow-motion fps, a ladder whose every rung is cheaper than the
    one above, slow frames stepping down within 3 s, a calm device
    climbing back after 20 s, a failed step up locked out (no flapping),
    the power policy's ceilings, and pinned tiers never beating it
  - smoke checks: `?tier=low` halves the pixel ratio but not the layout;
    20 ms of injected work per frame makes Auto step down, render fewer
    pixels, remember the rung and show it in `?hud=1`; `idleUntil` holds
    frames until input
  - `make bench` and `make android-bench` (§4.8, "Measuring it"); not in CI
- Phase 7 added:
  - `tools/legacy.test.mjs`: the old homepage's settings import as
    changes only, fitted to today's controls, version-checked, neko's
    coats, the chosen wallpaper and advent's state, links never; and every
    homepage setting is either still a setting or retired for a recorded
    reason
  - smoke: Import through the panel's real file input; the extension
    loads with the ID its manifest key pins; `c` opens the panel
  - `make smoke-live`: the stage and player suites against a deployed copy
    (`SMOKE_URL=`, default GitHub Pages), with real network: its own files
    and Bing pass, anything else fails. CI runs it after every deploy and
    daily, with one retry for the CDN
- `make screenshots` renders the README's images into `docs/` (the panel on
  a desktop, the bottom sheet on a phone, Pixel Quest). Like thumbnails,
  not part of `make ci`.

---

## 9. Roadmap

Each task has a verifiable done-check. Phases are ordered; tasks within a
phase can mostly run in parallel.

### Phase 0: Decide

- [x] 0.1 Owner answers the open questions; fold the answers into this SPEC.
- [ ] 0.2 Rotate the third-party weather API key in the private repo. → done when the old key is revoked.

### Phase 1: Scaffold and safety net (before any code lands)

- [x] 1.1 Makefile with `help` (default), `serve`, `lint`, `audit`, `audit-staged`, `audit-history`, `test`, `ci`, `hooks`, `clean`. → `make` lists them.
- [x] 1.2 `tools/audit.mjs` (§7.2) with `.audit-denylist` support (gitignored), and `tools/audit.test.mjs`: 14 tests, including end-to-end runs in throwaway git repos. → seeded violations fail; the clean tree and history pass. The tests caught a bug before it shipped: CGNAT addresses needed five octets to match.
- [x] 1.3 `.githooks/` pre-commit, commit-msg and pre-push hooks via `make hooks`; `.github/workflows/ci.yml` runs `make ci` with full history. → green locally; CI on push.

### Phase 2: Import (fresh copy, allowlist only)

- [x] 2.1 Copied the 16 wallpaper modules (19 files, 1.69 MB) byte-for-byte from the source commit with `git show`, not from its working tree. Carved Bing out of `WallpaperManager` into `bing/bing.js` (`BingWallpaperManager`, same `start`/`stop`/`showConfigDialog` shape). → `make audit` passes.
  - Security fix on the way in: Bing's overlay put text from Bing's JSON into `innerHTML` and followed `copyrightlink` unchecked. It now builds its DOM with `textContent` and follows `https:` links only.
- [x] 2.2 Diffed the forks.
  - `leaves.html` is the module minus its settings, plus a tuned preset (Appendix A).
  - `snow.html` is a simplified rewrite (no wind propagation or linked layers) with one real improvement: rebuilding the snow banks on resize. Merged as `resampleSnowAccumulation()`, which stretches existing banks to the new width instead of clearing them.
  - The fork's visibility pause is left for 3.5, which centralises it for every wallpaper.
  - Forks dropped.
- [x] 2.3 The snow PNGs are gone; `SnowSprites` in `snow.js` draws a three-tier pixel fir (bright edge, snowy tops, star) and seven flakes in code. The `image.complete` checks became `width > 0` so canvases draw. neko.js was imported without `assets/neko/`, with a header note; the harness marks it disabled until 4.6.
- [x] 2.4 `THIRD_PARTY.md`: origin, inspirations (xsnow, Neko/oneko, 8-bit adventures, The Matrix) with nothing copied, Bing photos and the proxies. LICENSE stays MIT.
- [x] 2.5 `web/dev/harness.html` boots any one raw module (gallery, `?w=<id>`, `c` settings, `[`/`]` switch). `web/dev/legacy-shims.js` holds the homepage globals the modules still need (`CONFIG.snow`, `createInfoIcon`, the latter now built with text nodes), to be deleted in Phase 3. `make smoke` (`tools/smoke.mjs`, DevTools protocol over Node's built-in WebSocket, no deps):
  - boots every wallpaper and checks that it draws, opens its settings dialog and logs no errors
  - intercepts **all** network: local files load, Bing gets fixtures, anything else is blocked and fails the run, so "offline" is tested, not assumed
  - saves screenshots to `dist/smoke/`

  Runs in `make ci`. → 16/16 pass; neko is skipped as expected.

### Phase 3: Core

- [x] 3.1 The player and the stage (§4.1).
  - The player is `index.html` + `core/player.js`; the stage is `stage.html` + `core/stage.js`.
  - Shared pure logic lives in `core/wp.js`, wallpaper metadata in `wallpapers/catalog.js`, styles in `core/theme.css`.
  - Wallpaper code loads lazily inside the stage. Crossfades; `,` settings, `[`/`]` switch, `f` fullscreen; a first-run hint.
  - Before building on it, I checked that `file://` frames share `localStorage` and can only talk by `postMessage`.
  - → smoke: a full cycle leaves one stage and no canvases in the player.
- [x] 3.2 ~~Wrap each module~~ Superseded by the stage iframe: a dropped iframe takes every global, listener and loop with it, and class names can't collide.
- [x] 3.3 `statusBarHeight` and `temporaryStatusBarHeight` are gone from every module and default. The eight modules with a ground line read `host.insets.bottom`; `?host=android` simulates a 48 px gesture bar. Quest's homepage-only "dim behind page" is gone too.
- [x] 3.4 Snow:
  - No `CONFIG`, no `homepageApp`, and no self-start in season; the player's Seasonal choice owns that.
  - Its settings dialog is ported in from the homepage, with tooltip defaults read from `defaults.js`; the old strings had drifted.
  - Fixed two latent bugs in Apply: it swapped in the wrong wind class, and it cleared a snowflake list that no longer existed.
- [x] 3.5 The cherry-blossoms resize-listener leak is fixed. The visibility pause is central, in the stage's frame pacer. → smoke: pause produces zero frames.
- [x] 3.6 URL parameters `w=`, `panel=open`, `date=`, `theme=`, `tier=`, `host=` (§4.2), never persisted; picking a wallpaper drops `w=`. Advent's `?date=`/`?theme=` became `applyParams()`. Storage is namespaced: `wp:current`, `wp:<id>`, `wp:<id>:<key>`, `wp:performance`, `wp:hinted`. → smoke: `?w=` persists nothing; every stage writes only its own namespace.
- [x] 3.7 Seasonal, as decided. → unit tests: every month, and the New Year rollover.
- [x] 3.8 Every wallpaper has `defaults.js`; settings are stored as overrides only (`WP.settings`).
  - The standalone presets won, and are checked programmatically against the old pages: snow, leaves, fishtank, halloween, advent, quest, fireplace.
  - Duplicate defaults (inline objects, `defaults()` methods, Reset copies) collapsed into one source.
  - → smoke: a fresh run of every wallpaper saves nothing. The schema half of the consistency check comes with Phase 4.
- [x] 3.9 Tiers without module changes: the stage's rAF pacer (fps cap, slow-motion cap, pause, frame timing) and DPR cap, plus the player's render scale. Pinned by `?tier=`, `wp:performance` or the host default. → smoke: `?tier=low` lays out at half size and runs starfield at its 10 fps slow cap.
  - Per-module `onQuality` and idle frames moved to phase 6 (§4.8).
- [x] 3.10 Found by the new smoke test and fixed:
  - Fireflies sat black for about 5 s after every load. It now opens with its steady-state population already lit.
  - A body background in the theme covered every `z-index: -1` canvas.
- [x] 3.11 Also asked for and delivered: `make serve` / `serve-https` / `cert` (`tools/serve.mjs`) and the `Dockerfile` with `make docker-build` / `docker-run` (§5).

### Phase 4: The panel

- [x] 4.1 `core/settings.js` schema renderer: range, select (static or config-dependent options), toggle, multi, colors, number, text and color; groups, collapsed Advanced, help text, live readouts, and per-setting reset dots that name the default.
- [x] 4.2 Every wallpaper's settings are schema data (`settings.js`), extracted from the legacy dialogs by a probing tool and hand-polished (§4.4); the dialogs are deleted (about 3,900 lines). → unit tests check schema against defaults; smoke checks each wallpaper's panel end to end.
- [x] 4.3 `core/panel.js`: filmstrip picker, settings, live apply or debounced rebuild, two-click Reset, Export/Import, Performance row, the accent following the wallpaper. → smoke: open and close, Reset, and every panel's round trip.
- [x] 4.4 Key map (§4.5); `?` key help, including the wallpaper's own keys; a corner long-press on touch screens; a ⚙︎ gear that fades in near the corner for a mouse. → smoke: `?` help, and the gear.
- [x] 4.5 Quest's and advent's old page keys are declared `keys` in the catalog, run in the stage, with toasts (the advent date, the new hero's name). → smoke: Quest's `N` starts a new quest; advent's `→` moves a day with a date toast.
- [x] 4.6 Neko redrawn in code:
  - 19 hand-made 16×16 sprites; left-facing poses mirrored.
  - 8 coats as palettes and pattern rules: classic, black, orange and grey tabby, calico, tuxedo, siamese points, cow cat.
  - Follows pointer events, so a finger works.
  - Floating z's while asleep; a dusk background so dark coats show; sizes in 16 px steps for crisp pixels.
  - Fixed on the way:
    - the cat chased the top-left corner until a pointer moved
    - a resting pointer kept it clawing forever, never idling or sleeping
    - resizing turned image smoothing back on
  - → screenshots: running, clawing, asleep; zero image files.
- [x] 4.7 Bing (§4.6): `bing.json` beside the page, Bing directly, public proxies only by opt-in; a helpful note instead of a black screen; `make bing-json`; overlay readable and above the inset; it keeps a `config` like every other module. → screenshots: today's photo over http; the note from disk. The scheduled Pages job is phase 5.2.
- [x] 4.8 Thumbnails (§4.7): `?seed=` reproducibility in the stage, `make thumbnails`, 16 committed WebPs (1–9 KB), tile backgrounds, live previews on hover and focus. Shared Chrome plumbing moved to `tools/chrome.mjs`. → unit test: every offline wallpaper has one.
- [x] 4.9 Also: advent's `?theme=` is a runtime override and never saved; the smoke draw metric counts partial coverage, so sparse scenes such as snow and fireflies don't flake; the first-run hint is touch-aware.

### Phase 5: Chrome and hosting

- [x] 5.1 `web/manifest.json`, new icon (ours, drawn by us), `make extension` → `dist/wallpapers-extension-<version>.zip`. → loads unpacked; the new tab shows the wallpaper only. *(Done: plus the extension's CSP on every page, an extension suite in `make smoke`, and `make icons`.)*
- [x] 5.2 GitHub Pages deploy of `web/` from CI, plus the daily `bing.json` Action. → the public URL loads; Bing works with no proxy. *(Done: one `ci.yml`, deploy only after `make ci` passes; plus an installable web app manifest.)*
- [x] 5.3 README: install, use, keys, screenshots. *(Done: a live gallery linking each thumbnail to the hosted copy, and `make screenshots`.)*

### Phase 6: Mobile readiness, then Android

- [x] 6.1 Time-based stepping and pointer events (§6.5). *(Done, in every wallpaper that stepped per frame, plus a 100 ms dt clamp everywhere.)*
- [x] 6.1a Tiers in every wallpaper, following the §4.8 plan and techniques. One wallpaper per commit. *(Done by five parallel agents, one worktree each, merged. Effects declared for fishtank, northern-lights, halloween, fireplace and quest; "Per-wallpaper plan, as built" in §4.8.)*
- [x] 6.1b `make bench`, plus the budgets. → every wallpaper is under 25% busy on Low and under 50% on Medium at 4× throttle; results committed; thumbnails get ⚡ badges. *(Done: worst is now fireplace at 12.8 / 17.0 / 24.1; advent went from 32.4 ✗ to 6.3 on Low. Badges are graded at High.)*
- [x] 6.1c Auto governor (ladder, hysteresis, per-wallpaper memory) and web power policy (`getBattery`, reduced motion); Performance row and `?hud=1`. → simulated slow frames step down within 3 s and recover without flapping (unit tests with a fake clock). *(Done: `core/perf.js`; also `host.idleUntil`, `onScroll`, and render scale as a pixel ratio instead of a zoom.)*
- [x] 6.2 **Spike A0:** VirtualDisplay vs `draw()`. *(VirtualDisplay works, with two gotchas recorded in §6.1. Done on the emulator; real-device numbers still to record.)*
- [x] 6.3 `android/` Gradle project; `make android-build`, `android-install`, `android-logcat`; assets synced from `web/`. *(Done, plus `android-emulator`; CI builds the debug APK.)*
- [x] 6.4 Engine: visibility pause, touch forwarding, settings activity (§6.3), power/thermal/battery bridge. *(Done. `setFixedSize` render scaling was tried and dropped (§6.1); copy-only-new-frames isn't needed under VirtualDisplay. Touch, swipes and the visibility pause on a real home screen are still to check by hand.)*
- [ ] 6.4a `make android-bench`: mAh per hour per wallpaper per tier on a real device; table recorded in §4.8. *(Tool built; needs a real phone.)*
- [x] 6.5 Extras: home-screen scroll parallax, `WallpaperColors`. *(Done.)*
- [ ] 6.6 Distribution (decided): `make android-release` builds a signed APK; CI attaches it to a GitHub Release on tag. The keystore lives outside the repo; CI uses an encrypted secret. *(Built: `make android-keystore`, the `release` job. Waiting on the owner to make the key, add the secrets and tag v0.6.0.)*

### Phase 7: Retire the old homepage

- [x] 7.1 Parity check: every wallpaper, setting and key from the homepage works here. → a checklist walk-through on the extension and on Pages. *(Done: Appendix B. The walk-through is automated and stays: `make smoke` on the extension, and `make smoke-live` on Pages after every deploy and daily. Gaps found and closed: settings migration (Import reads the old homepage's storage), the `c` key, and a pinned extension ID so settings survive reinstalls.)*
- [ ] 7.2 Owner switches over. Its links, weather and search are out of scope for this repo. Steps, in order:
  1. Save the old settings with the README's console snippet ("Moving from the old homepage").
  2. Turn the old extension off, load this one, Import the file.
  3. Rotate the old homepage's weather API key (§7.1): it's in that repo's history.
  4. Archive the private repo (`gh repo archive nealhardesty/homepage`) once nothing is missed.

### Phase 8: New wallpapers

Picked by the owner from the 2026-10-22 brainstorm; each design is in §10.
**Done 2026-10-22**, built in parallel (two wallpapers per branch) and
merged; each §10 section ends with what was built. Shared pieces that came
with it: `host.now()` (8.0), `host.gestures()` for taps and drags, the
`location` capability (§10.1), the catalog's `offline` and `needs`, the
manager's `onPause`/`onResume`, per-wallpaper smoke checks in
`STAGE_CHECKS` (in `tools/smoke.mjs`, run with `node tools/smoke.mjs <id>`),
and the `make bench` target, which until now existed only in the docs.
Still for the owner: touch, swipes and location on a real phone.
Every task follows "Building a new wallpaper" in `AGENTS.md`, and is done
only when `make ci` passes, `thumb.webp` is committed, `dist/smoke/<id>.png`
and `?tier=low` and `?host=android` have been looked at, and the wallpaper is
in §2 and the README. Each task also has its own check, below. They're
ordered cheapest and offline first; the network ones come last, because
each needs fixtures and an audit allowlist entry.

- [x] 8.0 **A clock for time-aware wallpapers.** `host.now()` returns a `Date`: the real time, or, with `?date=YYYY-MM-DD` or `?date=YYYY-MM-DDTHH:MM`, that moment ticking forward from when the stage started. A date alone keeps the real time of day; seconds are optional. Advent moves onto it. 8.3, 8.4, 8.10 and 8.12 depend on it. → unit tests: no param, a date, a date and time; advent's time travel still passes the smoke run.
- [x] 8.1 **Harmonograph** (§10.6). → the same seed draws the same figure at 20 fps and at 120 fps (unit test on the segment generator); idle between strokes on Low.
- [x] 8.2 **Girih** (§10.7). → every base tiling renders at every contact angle with no gaps (unit test on the strapwork generator); one full-screen redraw per morph step, none while holding.
- [x] 8.3 **Stained Glass** (§10.8). → the glass layer is built once per resize (frame counter in the smoke run); `?date=` noon and midnight give different light.
- [x] 8.4 **Pixel Room** (§10.9). → landscape and portrait layouts both fill the screen with integer scaling and no blurry pixels; the wall clock shows the stage's time; ≤ 12 fps on every tier.
- [x] 8.5 **Synthwave** (§10.10). → the grid scrolls by elapsed time (same distance at 30 and 60 fps); no `shadowBlur`; every palette renders.
- [x] 8.6 **Zen Garden** (§10.11). → the first frame is a raked garden; a scripted drag in the smoke run leaves grooves; with no input it idles between gardener strokes.
- [x] 8.7 **Koi Pond** (§10.12). → a tap makes a ripple and the nearest koi turn towards it within 2 s; fish count follows `density`.
- [x] 8.8 **Murmuration** (§10.13). → 3,000 birds at High, inside the §4.8 Medium budget at 4× throttle; the flock never leaves the sky for more than a few seconds; pointer falcon splits it.
- [x] 8.9 **Lantern Festival** (§10.14). → the first frame already has lanterns in the sky; a tap releases one from the shore under the pointer; the pool never grows past its cap.
- [x] 8.10 **Rainy Window** (§10.15). → fog regrows over a finger-drawn line within a minute; lit windows follow the hour (`?date=…T22:00` vs `T03:00`); the sharp and blurred layers are built once per resize.
- [x] 8.11 **Night Train** (§10.16). → a tunnel and a station both appear within a 10-minute seeded run; the reflection only shows in tunnels; Low drops the glass effects and still looks deliberate.
- [x] 8.12 **Fireworks** (§10.17). → `auto` mode never leaves the sky empty for more than its lull; a `?date=` of 31 Dec 23:59:50 counts down and fires the finale at midnight; tap mode is silent until tapped.
- [x] 8.13 **Lighthouse** (§10.18). Adds `marine-api.open-meteo.com` to the catalog and `URL_ALLOW`. → offline and fixture runs both draw a sea; a high-swell fixture visibly raises the waves; the beam keeps its flash character at any fps.
- [x] 8.14 **Wiki Pond** (§10.19). Adds `stream.wikimedia.org`. → a synthetic SSE fixture drives ripples in the smoke run; with the network blocked it shows the quiet offline pond, not a blank screen; the stream closes on `stop()` and while paused.
- [x] 8.15 **Satellites** (§10.20). Needs the §10.1 `location` capability first. Adds `celestrak.org`. → the propagator stays within 1° of the published SGP4 verification vectors (§10.20) for a LEO case, seen from a test observer, up to 3 days from epoch; elements are fetched at most once per 12 h, and stale ones are labelled.

### Phase 9: Jellyfin player (owner: high priority)

Picked by the owner on 2026-10-22, marked **high priority**: it runs as soon
as Phase 6's governor and power policy (6.1a–6.1c) are in, ahead of the
Phase 8 wallpapers. The design is §10.21. It's the first wallpaper whose
network host is chosen by the user, and the first with a `<video>`, so the
groundwork comes first. It has the same done-checks as Phase 8, plus its own:

- [x] 9.0 **Spike:** against a throwaway Jellyfin in Docker (`make jellyfin-dev`, 9.1), confirm the facts §10.21 marks *verify*: the server's default CORS, Quick Connect, direct play vs HLS in Chrome, the extension, `file://` and Android WebView, mixed content and Chrome's Local Network Access prompt from Pages, and muted autoplay inside the stage iframe. Record the answers in §10.21. → a table of host × server (http LAN, https) × result.
- [x] 9.1 **Dev and test servers, no real media.** `make jellyfin-media` uses `ffmpeg` to generate a few short clips (test patterns, a tone, English and Spanish `.srt`, one burned-in-only "image subtitle" case) into the gitignored `.jellyfin/`. `make jellyfin-dev` runs `jellyfin/jellyfin` in Docker on that folder. `tools/jellyfin-mock.mjs` is a fixture Jellyfin API (auth, Quick Connect, views, playlists, items, PlaybackInfo, subtitles) for the smoke run, serving one committed, generated VP9/WebM clip of a few KB: headless Chromium has no H.264. → the smoke run plays a fixture playlist with English subtitles on, through the mock server only.
- [x] 9.2 **User-chosen network** (§10.21 *Network*): the catalog's `network: 'user'`, the player's per-origin grant, the extension's `optional_host_permissions` requested at sign-in, and the test changes so the catalog, `URL_ALLOW` and `manifest.json` still have to agree. → unit tests; the extension asks for exactly the server's origin and nothing else.
- [x] 9.3 **Host media hooks:** `host.onPause(fn)` / `host.onResume(fn)` (the stage's pause stops rAF but would leave a `<video>` playing), `allow="autoplay"` on the stage iframe for wallpapers that declare `media: true`, and settings controls the panel lacks: an action button, a status line, and a select whose options the wallpaper loads (playlists, libraries). → smoke: pausing the stage pauses the fixture video within 100 ms; switching away releases the decoder (`video.src` cleared).
- [x] 9.4 **Sign-in and choosing what to play:** Quick Connect first, username and password as the fallback, a token kept only in `wp:jellyfin:auth` and left out of Export, Sign out revokes it. Playlist (shuffled by default), or random from a library. → smoke against the mock: sign in, list, pick, play; Export JSON has no token; the password is never stored.
- [x] 9.5 **Playback:** shuffle by default, the order selectable; resume where it left off across new tabs; one tab plays at a time; muted start by default; subtitles chosen automatically (§10.21). → unit tests on stream picking (English full over forced over none; text vs image formats) and the shuffle bag; smoke: a second stage takes over and the first goes quiet.
- [x] 9.6 **Frames** (§10.21 *Frames*): None and Old TV first, then the rest one per commit. → each frame has a landscape and a portrait layout, its screen rect keeps the video's aspect ratio, the static art is built once per resize, and on Low only the video moves.
- [x] 9.7 **Power** (§10.21 *Energy*): the server-side resolution cap by tier, poster mode on battery saver or under 20%, and a `make bench` entry. → on battery the request asks for ≤ 720p; with battery saver on, no video element exists.

Done 2026-10-23. Every "→" check is a smoke check (`node tools/smoke.mjs
jellyfin`, against the fixture server) or a unit test (`tools/jellyfin.test.mjs`).
Built differently from the plan, on the spike's evidence:
- **No extension permission at all:** Jellyfin's CORS answers every origin,
  so `optional_host_permissions` was dropped (a test keeps it out).
- **Android needed more than planned:** `MIXED_CONTENT_ALWAYS_ALLOW` for the
  API, cleartext allowed by a network security config, Android 17's runtime
  `ACCESS_LOCAL_NETWORK` (asked from the settings screen, by the panel's
  Connect button; the dialog calls it "nearby devices"), and `MediaProxy`,
  which carries `/jellyfin-media/http/<host>/…` through the app, since
  WebView blocks http `<video>` even then. Tried on an Android 17 emulator:
  the prompt, a password sign-in, direct play, HLS at the cap, burned-in
  image subtitles, and the live wallpaper's preview.
- **The resolution cap is a width:** Jellyfin 12.3 scales transcodes by
  `MaxWidth` and ignores `MaxHeight`, so the device profile caps both, and
  the bitrate ceiling follows the height.
- **9.3's hooks** were the manager's existing `onPause()`/`onResume()`; what
  was new is the panel's extras, `host.panel`, `host.toast`, `host.power`
  with `onPower`, `media: true` and catalog `secrets`.
- **Keys:** `c` belongs to the player, so `V` cycles frames.
- **frameMotion's lowest tier is Medium,** not Low as first written, so that
  on Low only the video moves.
- **Frames:** None, Old TV, Mantel, Cinema, Drive-in, Porthole, Gallery,
  Arcade, Ambilight, Camcorder and VHS, plus Seasonal. Frames may declare
  `titled` (the art shows the title and repaints once per item) and `osd`
  (their own on-screen display: no title card, the 🔇 badge top centre).

### Phase 10: Clock overlay (owner, 2026-10-28)

Designed in §4.9; none of it is built. Each task is done only when `make ci`
passes, and the visible ones have been looked at in `dist/smoke/` and at
`?tier=low` and `?host=android`. Each is a commit.

- [x] 10.0 **Groundwork in the core:** `WP.clockface` with the pure `format` and `step`, a group-level `when` and the `presets` control in `core/settings.js`, and `wp:clock` registered through `WP.defaults('clock', …)` and `WP.schema('clock', …)`. No overlay yet. → unit tests for `format` (digital only), the schema-agrees-with-defaults check for `clock`, and the presets control; `make ci` unchanged otherwise.
- [x] 10.1 **The overlay, static, digital:** `#clock` in `index.html`, the panel's one-row-when-off section, `enabled`, `date`, `size`, `anchor`, `margin`, `color`, `font`, `weight`, `opacity`, and `?clock=on|off`. Survives a wallpaper switch; hidden when `enabled` is false; honours `host.insets`; `K` toggles it. → smoke: fresh run draws nothing and saves nothing; `?clock=on&date=…` shows the right time and rolls over at midnight; the element survives `]`; `?host=android` clears the bottom inset.
- [x] 10.2 **Format and the second clock:** 12/24, seconds, meridiem, `extras`, `zone`, the second zone (UTC by default) with its label, scale, placement and `secondDay`. → unit tests for zones, DST transitions, extremes (+14 and −11) and the extras; smoke: the second clock reads the right time against a fixture instant.
- [x] 10.3 **Time styles:** `words`, `roman`, `binary`, `hex`, `beats`. → unit tests against hand-computed values at several instants; every style fits the safe area at the smallest and the largest `size`.
- [x] 10.4 **Style:** the font list, `fontCustom` (sanitised), `effect`, `outline`, `plate`, `gradient`, `daylight`, `drift`, and the *Look* presets. Glass and invert gated by the Medium floor. → smoke: every look renders; `?tier=low` turns glass into tint; the font name can't inject CSS (unit test).
- [x] 10.5 **Adaptive colour:** the `sample` / `luma` messages, the stage's 8×8 read, hysteresis, and the tainted-canvas fallback. → unit tests for `pick`; smoke: the stage answers a sample with a number, fed readings flip the colour only past the thresholds, and a sample costs the stage under 8 ms.
- [x] 10.6 **Motion:** drift (three paths), bounce (with hue and corner flash), teleport (fade and instant, on the minute), follow, drag-to-place and shy, with reduced motion, the power fallback and pause. → unit tests for `step` (bounds, equal distance at 10–144 fps, corner detection, never the same cell twice); smoke: `?clock=bounce` stays on screen and moves; pausing the stage stops it.
- [x] 10.7 **Night mode, `hideOn`, `?clock=<motion>`, Put the clock back**, and a `make bench` row. → bounce with seconds under 2% busy on Low and 1% on Medium.
- [x] 10.8 **Docs:** the README's *Use* section, SPEC §4.4's panel layout and §4.5's keys (drop "planned"), and this section's *As built* note. → `make ci`.

Done 2026-10-28; the "→" checks are `tools/clockface.test.mjs` (38 unit tests)
and `make smoke-clock` (`node tools/smoke.mjs clock`: 17 checks, also part of
the player suite, and one more under the extension), plus `make bench-clock`. Built differently from the plan: see the
*As built* note at the end of §4.9.


### Phase 11: Harvest Valley (owner, 2026-10-28)

A Thanksgiving mash-up wallpaper, specified in §10.22. Built in one go; each
"→" check is in `tools/harvest.test.mjs` (7 unit tests) or `node tools/smoke.mjs harvest`
(4 checks, plus the generic boot, panel and storage ones).

- [x] 11.0 `harvest` with the sky, village, fields, patch, orchard, geese, leaves and weather, every part on its own switch. → unit tests for the moon (against known new and full moons), sun times, the holiday and the light ramps; smoke: frame-one cast, a tap shakes a tree, a squirrel delivers an apple, the Great Pumpkin rises only at night, every part left out still boots and draws.
- [x] 11.1 Seasonal's November becomes `harvest` (was the fish tank, a placeholder). → `tools/wp.test.mjs`.
- [x] 11.2 Cats (owner request): random coats, sizes and temperaments, mostly asleep. Configurable autumn colours (owner request): seven presets and a custom palette.
- [x] 11.3 Docs, the thumbnail (`make thumbnails`), and a `make bench` row (4.4% busy on Low, 5.3% on Medium, 13% on High at 4× throttle).

---

## 10. Ideas

Every idea for the future lives here, numbered so it can be referred to.
Ideas aren't commitments; one becomes a roadmap task when the owner picks it.

### 10.1 Shared groundwork: a `location` capability

Ideas 10.2 and 10.4 need to know where the user is. 10.3 needs only the
timezone, which the browser already knows without asking. Location becomes
a host capability, like `network`:

- The catalog declares `needs: ['location']`. The panel explains why, and
  offers a typed place as the alternative to granting permission.
- **Sources, in order:**
  1. A place the user typed, geocoded once with Open-Meteo's keyless
     geocoding API and stored locally.
  2. The browser's Geolocation API: a permission prompt, secure contexts
     only (localhost, https, the extension).
  3. On Android, the app's own `ACCESS_COARSE_LOCATION`, requested from the
     settings activity and pushed into the stage through the host.
- **Coarse is enough.** Coordinates are rounded to about 0.1° (~10 km)
  before they're stored or sent anywhere. They stay in local storage and
  go only to the provider that needs them.
- **Stage iframes:** geolocation is blocked in a cross-origin iframe unless
  it has `allow="geolocation"`, and on `file://` every stage is
  cross-origin. The player sets that attribute only for wallpapers that
  declare the need.
- **Android spike:** a live wallpaper isn't a foreground app, so live
  location may need `ACCESS_BACKGROUND_LOCATION`. Using the last known
  location, refreshed while the settings activity is open, probably avoids
  that. Verify before promising anything.

**As built (Phase 8):** one shared key, `wp:location`, rounded to 0.1° before it's written; it describes the device, so later wallpapers reuse it without asking again, and it travels with Export. The panel's 📍 section (`core/location.js`, loaded only for wallpapers that need it) takes a typed place (Open-Meteo's geocoder, once), "Use my location" (Android's bridge when present, else the browser's Geolocation API) and Forget. The stage refreshes a browser fix only when permission is already granted; it never prompts. The player rebuilds the stage when the place changes. Android: `ACCESS_COARSE_LOCATION`, asked from the settings screen only; `locate()` returns the newest last-known fix (or one network fix on API 30+), so no background location is needed. Built, not yet tried on a device.

### 10.2 Weather forecast (owner)

A 5-day forecast, or today hour by hour, with small animations on each day
or hour.

- **Data:** Open-Meteo. No API key, CORS-enabled, free for non-commercial
  use, CC BY 4.0, attribution shown in a corner. One request covers hourly
  and daily data, plus sunrise and sunset for a time-of-day tint. Hosts:
  `api.open-meteo.com`, `geocoding-api.open-meteo.com`.
  - **The request** (owner's example, verified to work without a key; the
    coordinates here are a public landmark, Times Square):

    ```
    https://api.open-meteo.com/v1/forecast?latitude=40.758&longitude=-73.9855
      &current=temperature_2m,weather_code
      &hourly=temperature_2m,precipitation_probability,weather_code
      &daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code
      &temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch
      &timezone=America/New_York&forecast_days=3
    ```

    `weather_code` is the WMO code: 0 clear; 1–3 partly cloudy; 45/48
    fog; 51–67 drizzle and rain; 71–77 snow; 80–82 showers; 95–99
    thunderstorms. Each code maps to one small animated scene.
  - `forecast_days` goes up to 16, so 5 works for the five-day view. Use
    `timezone=auto` to follow the location. Pick the units from the locale.
  - Coordinates are rounded to about 0.1° before the request (§10.1). A real
    location never appears in this repo, in docs, tests or fixtures.
- **Look:** a row of day cards, or a 24-hour ribbon, each with a tiny looping
  scene: sun rays turning, clouds drifting, rain or snow falling, a
  lightning flicker. These reuse particle ideas from rain and snow, drawn in
  code. The background follows the current sky.
- **Cost:** refresh every 30–60 minutes, and idle frames (§4.8) between
  animation ticks. One of the cheapest wallpapers.
- **Offline:** shows the last forecast with "updated 3 h ago", never a
  blank screen.
- **Units:** follow the locale: °F in the US, °C elsewhere, as the old
  homepage did.

### 10.3 World clock (owner)

Several timezones, plus the local one. (The clock overlay, §4.9, is a
different thing: one clock and at most one extra zone, drawn over any
wallpaper. Its zone list and `format` could feed this later.)

- **No network, and no location permission:** the local zone comes from
  `Intl.DateTimeFormat().resolvedOptions().timeZone`, and DST comes free
  from `Intl`.
- **Default zones are generic** (local, UTC, New York, London, Tokyo); the
  user edits the list in settings. Nothing personal ships as a default.
- **Look** (suggestion): analog faces, or a world map with the day/night
  terminator sweeping across it. The terminator comes from the sun's
  position, computed in code, with the cities as dots showing their times.
  The coastline would come from Natural Earth (public domain), simplified to
  under ~50 KB.
- **Cost:** redraws once a second, idle in between. Close to free, and a
  showcase for idle frames.

### 10.4 Map of where you are (owner)

Street, terrain or satellite, centred on the current position.

- **Google Maps needs an API key and billing** for every web product
  (Maps JavaScript, Static Maps, Map Tiles), and its terms forbid caching
  tiles or drawing them outside Google's own SDK. That clashes with §1's
  no-keys rule. If the owner wants Google anyway, the user pastes their own
  referrer-restricted key into the wallpaper's settings. It's stored
  locally and never in the repo, which §1 allows.
- **Keyless options** (check each provider's current terms before use):
  - street: OpenFreeMap (vector, no key, no registration) or CARTO raster
    basemaps (attribution, non-commercial limits)
  - terrain: OpenTopoMap (CC BY-SA, fair use)
  - satellite: EOX Sentinel-2 cloudless (attribution; some years
    CC BY-NC-SA)
- **Rendering:** our own small raster-tile renderer on canvas: no WebGL
  (which failed in Android wallpapers in the prior art, §6.1) and no
  vendored map library. Tiles are cached in Cache Storage, which is both
  polite to the provider and works offline.
- **Animation:** a slow Ken Burns drift around the position, a pulsing
  location dot, and a day/night tint from the sun's position.

### 10.5 Smaller ideas

- Shuffle/playlist: rotate wallpapers every N minutes (was "later, maybe").
- `prefers-reduced-motion`: slow, calm defaults (was "later, maybe").
- *Suggestions:*
  - an **orrery**: the solar system as it is right now, computed in code,
    no network
  - a **moon and sky**: tonight's real moon phase and the bright planets
  - an **ISS tracker**: folded into §10.20 Satellites
  - a **lava lamp**: metaballs; cheap with idle-free slow motion

### Picked for Phase 8

Sections 10.6 to 10.20 were picked by the owner on 2026-10-22, and each is a
Phase 8 task. Shared rules:

- **Ids** as given in each heading. Settings keys are suggestions; the
  final list is whatever `defaults.js` and `settings.js` agree on.
- **Drawn in code**, Canvas 2D only, following §4.8: static layers cached
  per resize, glows baked into sprites, pooled particles, and no per-frame
  pixel reads, `shadowBlur` or `ctx.filter`.
- **Time of day** comes from `host.now()` (task 8.0), never `new Date()`, so
  `?date=` can test it.
- **Network** wallpapers declare their host in the catalog and in
  `URL_ALLOW`, cache their last good data in `host.storage`, show a real
  scene offline, and get synthetic fixtures for the smoke run (no real
  places, names or users).
- **On Android** a launcher forwards taps and home-screen swipes to the
  wallpaper. Interactive ones should treat a fast horizontal swipe as a
  page change, not a gesture, and each has a setting to ignore touch.

### 10.6 Harmonograph (`harmonograph`, owner pick)

A pen on two decaying pendulums draws a looping figure across a sheet of
paper. When it has run down, the sheet slides off and a fresh one starts.

- **Maths:** the lateral harmonograph,
  `x(t) = A₁ sin(f₁t + p₁) e^(−d₁t) + A₂ sin(f₂t + p₂) e^(−d₂t)`, and the
  same form for `y`. Frequencies near small ratios (1:1, 2:3, 3:4, 1:2),
  detuned by about 0.5–1%, give the classic slowly rotating figures; the
  damping is chosen so a drawing takes `drawMinutes`.
- **Drawing:** a persistent ink canvas. Each frame integrates every segment
  since the last frame from elapsed time, so the figure is identical at
  any frame rate, and draws them as one path. Line alpha and width wobble
  slightly with pen speed, like real ink.
- **Paper:** a cached texture (fibre noise, deckled edge, a faint shadow).
  Between drawings the finished sheet slides off with a little rotation,
  and a new one slides in. The previous drawing can stay pinned in a
  corner, small.
- **Settings:** `drawMinutes` (2–20), `palette` (sumi ink, blueprint, sepia,
  risograph two-colour, gold on black), `ratios` (classic, any), `penWidth`,
  `paper` (cream, white, black).
- **Cost:** among the cheapest. Low draws fewer, longer segments at 20 fps;
  the slide is the only full-screen motion. `motion: 'slow'` is right.
- **First frame:** a sheet already part-drawn, at a seeded point in its run.
- **Keys:** `n` new drawing.

**As built:** three pendulums (x, y, and a rotary one turning the paper), each axis scaled to the figure's reach. The drawing is a fixed grid of 16,008 points inked in 12-point strokes, each a pure function of the grid, so frame rate only sets how far the pen has got; unit tests compare 20 fps with jittery 120 fps. Ink width and alpha follow pen speed. Finished sheets are signed in pencil, admired, then fly onto a two-sheet pile. Low uses stride 2 and idles between strokes (~5 fps).

### 10.7 Girih (`girih`, owner pick)

Islamic geometric star patterns that slowly breathe from one form into
another.

- **Method:** Hankin's "polygons in contact". Start from a base tiling
  (square 4.4.4.4, hexagonal 6.6.6, 4.8.8, 3.12.12, 4.6.12). From the
  midpoint of every edge draw two rays at the contact angle θ, and stop
  each at the first crossing with a neighbour's ray. Sweeping θ from about
  20° to 80° morphs one tiling through a whole family of star patterns,
  and each base tiling has its own family.
- **Animation:** θ eases between seeded targets, holds for `holdSeconds`,
  then moves on; every few holds the base tiling crossfades to another.
  The strapwork is drawn as interlaced bands, over-under at each crossing,
  with the gaps cut by drawing the "under" band first. The cells are
  filled from a palette (zellige tile colours, lapis and gold, monochrome
  plaster).
- **Truchet** variant as a `style`: quarter-circle tiles flipping in
  slow diagonal waves.
- **Cost:** the pattern is rebuilt only while θ is moving, into a cached
  layer; a hold produces idle frames. A slow sheen (one gradient with
  `lighter`) is the only per-frame work, and Low drops it.
- **Settings:** `style` (girih, truchet), `baseTiling` (cycle, or one),
  `palette`, `scale`, `holdSeconds`, `interlace`.
- **Test:** the strapwork generator is pure, so unit tests check every base
  tiling at sampled θ for closed cells and no gaps.

**As built:** partner rays meet on the vertex bisector at |MP| = ½·sin(α/2)/sin(θ+α/2); stars and vertex kites tile each polygon, and unit tests check every tiling from 15° to 85° for closed cells and straight crossings. Strands cross only at edge midpoints, where "the ray towards the next vertex goes over" makes the interlace alternate everywhere. Repaints only while θ moves; tilings crossfade by CSS opacity on a second canvas; patina and sheen are compositor-blended overlays. Extras: Iznik and midnight palettes, medallions, morph and angle settings.

### 10.8 Stained Glass (`stained-glass`, owner pick)

A leaded glass window with light moving through it over the day, throwing
coloured shafts across the floor below.

- **Glass:** a Voronoi diagram of a few hundred seeded sites, built once
  per resize (simple half-plane clipping is fast enough at this size).
  Each cell is coloured by sampling a design at its centroid, then given a
  baked texture (streaks, seeds, uneven thickness). Lead came is a thick
  dark stroke with a highlight.
- **Designs:** `abstract` (palette only), `rose` (sites placed with radial
  symmetry around a centre rosette), `landscape` (cells sample a simple
  procedural scene of hills, sun and tree, so the window shows a picture),
  `geometric` (sites on a girih grid, sharing §10.7's code).
- **Light:** the sun's angle comes from the hour. A broad radial highlight
  crosses the window during the day; at night the glass goes dim and is
  lit faintly from inside, warm. Shafts are skewed translucent polygons
  carrying the colours of the cells they come from, with dust motes
  drifting inside them.
- **Cost:** the window is one cached layer; per frame, one gradient overlay,
  a few shaft polygons and pooled motes. The light changes slowly, so
  `motion: 'slow'`.
- **Settings:** `design`, `palette` (cathedral, art nouveau, sea glass,
  sunset), `cellCount`, `shafts`, `dustMotes`.

**As built:** a dark stone wall above a flagstone floor; three lancets on wide screens, one on phones. Designs rose, abstract, landscape (lead follows the scene's outlines) and geometric (Girih's own cells, the file shared through `scripts`). A seasonal sun model from `host.now()` gives coloured shafts, a pool of window light on the floor, and candlelight at night; the light layer is rebuilt once a minute at reduced resolution, clouds only change its opacity, and motes light up inside the shafts from a 40×40 light map. `light` can pin a time of day.

### 10.9 Pixel Room (`pixel-room`, owner pick)

A cozy pixel-art room: a cat asleep on the bed, a mug steaming on the desk,
a plant, a lamp, and a window onto the real time of day.

- **Rendering:** draws at 320×180 (landscape) or 180×320 (portrait, for
  phones), then scales up with image smoothing off by the largest integer
  that covers the screen, cropping the edges, never stretching. One fixed
  32-colour palette of our own; every sprite is defined in code as small
  index arrays, built into a sprite sheet once.
- **Life in the room:**
  - The window shows dawn, day, dusk or night (stars, moon), rain at
    random; city lights or trees outside.
  - The desk lamp switches on at dusk and off late at night.
  - The cat runs a slow state machine: sleep, stretch, groom, walk to the
    window, watch, back to bed.
  - Steam curls from the mug; the plant sways; a record turns; a wall clock
    shows the real time.
- **Cost:** pixel animation reads best at 8–12 fps, so the wallpaper ticks
  with `host.idleUntil` at that rate on every tier. Each tick redraws a
  320×180 buffer, which is nothing. Probably the cheapest animated
  wallpaper in the set.
- **Settings:** `layout` (auto, landscape, portrait), `cat` (colours),
  `room` (palette: warm, cool, night owl), `window` (city, forest, sea),
  `weather` (clear, sometimes rain, always rain).
- **Interactive:** a tap on the cat wakes it, on the lamp toggles it.

**As built:** the canvas is the art buffer, at the largest whole device-pixel scale that keeps 90% of the safe area, `pixelated`; the real ratio comes from a `min-resolution` search, since the stage lowers `devicePixelRatio`. Light is an old-games palette remap through a Bayer-dithered light map, rebuilt only when the light changes. The window follows the hour, the season and the moon's phase; the lamp is on from dusk to 23:30; the cat runs sleep → yawn → stretch → wash → the window → back to bed. Furniture is drawn in code from palette rectangles; sprites are rows of palette keys.

### 10.10 Synthwave (`synthwave`, owner pick)

The retro drive: a neon grid rushing towards a striped sun, wireframe
mountains, palms sliding past.

- **Grid:** horizontal lines placed by 1/z and scrolling by elapsed time;
  vertical lines converging on the vanishing point. Glow is baked: the
  grid is drawn into a small buffer, a downscaled copy is drawn back with
  `lighter`, and that gives the haze without `shadowBlur`.
- **Sun:** a vertical gradient disc with horizontal gaps that drift down
  and widen towards the horizon; cached, then clipped per frame.
- **Layers:** stars and a faint scanline pattern (cached), wireframe
  mountains (cached), palm silhouettes on both verges at a few depths,
  occasional distant tail lights.
- **Settings:** `palette` (outrun magenta, vaporwave pastel, ice blue,
  sunset orange), `speed`, `palms`, `scanlines`, `sunStripes`.
- **Cost:** low. Lines and a few cached layers. Low halves the line count
  and drops the haze.

**As built:** the grid's lines sit at fixed world positions and the camera's distance advances by clamped elapsed time (`SynthwaveGrid`, unit-tested at 10–120 fps; the smoke run measures 3.00 units/s at 20 and 60 fps). The haze is the grid redrawn into a quarter-size buffer and added back with `lighter`. Sun gaps are born a third of the way down and widen towards the horizon. A highway carries the odd overtaking car; palms have a neon rim on the road side.

### 10.11 Zen Garden (`zen-garden`, owner pick)

Raked sand seen from above. Drag to rake; the wind slowly smooths what you
draw; an unseen gardener tends it when you don't.

- **Sand:** a persistent canvas over a cached base texture (fine grain,
  slight colour variation).
- **Rake:** a stroke drags several parallel tines. Each tine draws a dark
  groove and, offset towards the light, a pale ridge, so the grooves read
  as depth. Strokes are smoothed (Catmull-Rom on the pointer path) and
  tines can't cross a stone; around a stone they bend.
- **Stones, moss, leaves:** three to five stones with moss collars, placed
  from a seed, cached with their shadows. A maple leaf sometimes drifts in
  and settles, in autumn by the date.
- **Wind:** every few seconds the base texture is drawn back over the sand
  with a very low alpha, so grooves fade over `fadeMinutes`. One
  full-screen draw every few seconds, not every frame.
- **Gardener:** after `gardenerDelay` without input, an invisible rake
  draws a classic pattern (straight rows, then concentric rings around
  each stone), one slow stroke at a time, so it's alive without touch.
- **First frame:** a fully raked garden, rows and rings.
- **Cost:** frames only while a stroke is being drawn; otherwise idle.
- **Settings:** `stones` (count), `sand` (palette: white gravel, dark
  slate, warm sand), `tines`, `fadeMinutes`, `gardener`, `gardenerDelay`,
  `touch` (rake, ignore).
- **Android:** the best touch wallpaper. Swipes between home screens must
  not rake (see the shared rules).

**As built:** three cached layers (clean base, the garden, stones and light), dirty-rectangle copies. Each tine lays clean sand under itself, then a groove and a ridge offset sideways, lit from the upper left; tines bend radially around stones. Wind lays the base back at an alpha that leaves 5% of a groove after `fadeMinutes`, at most every 3 s. Frames run only for strokes and falling leaves; otherwise `idleUntil` the next gust, gardener stroke or leaf. Keys N new stones, R rake, E smooth.

### 10.12 Koi Pond (`koi-pond`, owner pick)

Koi seen from above, gliding under lily pads. Petals or leaves land on the
water; a tap sends out ripples and draws the fish.

- **Koi:** each is a chain of spine points that follows a steering target,
  with a travelling sine wave down the body. The body is a smooth outline
  around the spine with pectoral fins and a trailing tail; the pattern
  (kohaku, sanke, showa, ogon, utsuri, asagi) is a cached sprite of spots
  clipped to the body. A darker, offset, blurred-by-downscale copy is the
  shadow on the pond floor.
- **Pond:** a cached floor (stones, depth gradient), lily pads that bob and
  turn slightly, the odd flower. Surface glints are a few pooled sparkles.
- **Ripples:** pooled expanding rings, each drawn as a pale and a dark
  stroke, from taps, from fish touching the surface, and from falling
  petals.
- **Behaviour:** koi wander, school loosely, and hide under pads. A tap
  makes a ripple and the nearest ones turn towards it; with `feed` on, a
  few pellets float there and the koi rise to them.
- **Seasons:** cherry petals in spring, leaves in autumn, nothing in summer,
  thin ice at the edges in winter, by the date.
- **Settings:** `fishCount` (scaled by density), `varieties`, `lilyPads`,
  `seasonal`, `feed`, `touch`.
- **Cost:** medium at most; a dozen fish with clipping is cheap. Low drops
  the shadows and sparkles.

**As built:** 10-point spine chains with a bend limit and a travelling wave; the body is a cached sprite of the straight fish drawn in slices along the spine, so the pattern bends. Shadows on a quarter-resolution buffer; 48 pooled ripples; a tap turns the nearest koi in about 0.9 s (smoke). Density changes send fish diving away or rising in. `seasonal` became `season` (auto or any season); `touch` is ripple or ignore.

### 10.13 Murmuration (`murmuration`, owner pick)

Thousands of starlings at dusk over a marsh, swirling in one shape-shifting
cloud, and splitting when a falcon dives through.

- **Flocking:** boids on a spatial grid (as in halloween's bats, §4.8).
  Each bird steers by its **seven nearest neighbours**, not a fixed radius,
  following the field study that found starlings track a fixed number of
  neighbours (Ballerini et al., PNAS 2008). This is what makes the flock
  hold together and ripple in waves. A soft pull keeps the flock in the
  sky.
- **Falcon:** the pointer is the falcon when `interactive`; birds flee it
  with a sharp escape wave. With no pointer, a falcon passes now and then
  on its own.
- **Cycle:** the flock arrives, swirls for `minutes`, then funnels down into
  the reeds to roost while the sky darkens; after a pause, a new evening
  starts with a new flock.
- **Drawing:** the dusk sky gradient and marsh silhouette with reeds and
  water are cached. Birds are 1–2 px dark marks; their speed and heading
  decide a two-frame wing flicker. All birds go in one path per frame.
- **Counts:** 3,000 on High, scaled by `density` (about 1,000 on Low).
- **Settings:** `birds`, `skyPalette` (amber dusk, pink dusk, grey
  winter), `falcon` (pointer, auto, off), `minutes`.
- **Cost:** medium (the flocking, not the drawing). `cost: 'medium'`.

**As built:** the flock flies in 3D, each bird steering by its 7 nearest neighbours in 3D, found on a counting-sort grid and re-searched every ~0.1 s, all in typed arrays: 24.7% busy at High with 3,000 birds. The flock is held in a turning, breathing flattened ellipsoid, which gives the ribbons and veils of real murmurations. An alarm wave passes along the neighbour links. Hover is the falcon (drag on touch); a tap sends a wild one diving. Cycle: swirl, roost into the reeds (~40 s), 12 s of night with no frames, then a new flock.

### 10.14 Lantern Festival (`lanterns`, owner pick)

Paper sky lanterns rising from a lakeshore into the night, with their
reflections trembling on the water. Tap to release one.

- **Lanterns:** glowing paper bodies, baked once at a few sizes with the
  glow included. The flame flickers by alpha, so the sprite never changes.
  Each rises with drift and sway; it shrinks with height to fake depth,
  and fades into the stars at the top.
- **Lake:** the reflection of each lantern is a vertically stretched,
  dimmed copy that wobbles sideways with a per-lantern sine, which reads
  as ripples without any per-pixel work. A cached far shore and hills; a
  few boats.
- **Flow:** the sky is pre-seeded, so the first frame is already full; a
  pooled set of lanterns is recycled. A tap releases a lantern from the
  shore under the pointer; `releases` sets the automatic rate.
- **Settings:** `count` (scaled by density), `releases`, `colour` (warm
  paper, mixed), `reflections`, `touch`.
- **Cost:** low to medium; Low drops the reflections to every other lantern.
  `motion: 'slow'` suits it.

**As built:** a perspective lake, with each lantern's position a pure function of its age (so the sky is pre-seeded by age, and identical at any fps). Sprites per tint at 14/28/56 px; the flame is an additive glow flickering by alpha. Reflections are the sprite stretched in three independently wobbling slices; Low keeps one plain copy for every other lantern. Fixed pool of `count + 12`, recycling the furthest-flown. Releases come from watchers, boats and the far shore.

### 10.15 Rainy Window (`rainy-window`, owner pick)

A city at night seen through a fogged window, with drops running down the
glass. Window lights in the city follow the real hour; your finger draws
in the fog.

- **Layers:** the skyline is built into a sharp layer and a blurred one (by
  downscale and upscale), once per resize.
- **Fog:** a mask canvas decides where the glass is clear. The blurred
  city shows where it's fogged; the sharp city shows through the trails.
  Drops and fingers paint the mask clear; fog regrows by drawing over the
  mask with low alpha every second or so. The composite runs at
  `renderScale`.
- **Drops:** pooled. Each one is a small, flipped, scaled copy of the sharp
  city drawn inside a drop shape with a bright rim, which looks like
  refraction. Drops merge when they touch and race down once heavy
  enough, leaving a trail.
- **City lights:** each window in the skyline has an on/off probability by
  hour: most lit in the evening, few at 3 a.m., a slow pattern of lights
  switching. Occasional car headlights in the street below; a blinking
  aircraft light.
- **Later:** with §10.2's weather, the rain rate follows the real weather.
- **Settings:** `rain` (drizzle to downpour), `fog`, `fingerDrawing`,
  `city` (downtown, harbour, hills), `palette` (sodium orange, neon, blue
  hour).
- **Cost:** medium; Low drops the mask (no fog, just drops on a softened
  city) and halves the drops.

**As built:** a seeded skyline (downtown, harbour, hills); sharp and half-resolution blurred layers built once per resize, a switched window re-blurring only its patch. The fog mask is half resolution, cleared by drops and fingers and regrown in 7% steps timed by `fogReturn`. Drops grow, stall, run, merge by volume and shed beads; each is an upside-down clipped copy of the sharp city with a baked rim. Lit windows follow `RainyCity.litShare(hour)`: 2,042 at 22:00 against 134 at 03:00 in the smoke run. Not done: rain from §10.2's weather.

### 10.16 Night Train (`night-train`, owner pick)

The view from a train window at night: the land sliding past at different
speeds, rain streaking sideways, tunnels, stations.

- **Layers:** far (horizon hills, moon, cloud), middle (towns as clusters of
  lights, a distant road with headlights), near (catenary poles, fences,
  trees, signals) and the glass. All are cached strips, scrolled by
  elapsed time at speeds for their depth.
- **Glass:** rain streaks run diagonally backwards, steeper as the train
  slows. A faint reflection of the carriage interior (seat backs, a
  reading lamp, a sleeping cat in a basket) appears only when it's dark
  outside, in tunnels most of all.
- **Journey:** a seeded route of segments (countryside, river bridge,
  town, coast, tunnel, station). In a tunnel the scene goes black, tunnel
  lamps flash past, and the reflection comes up. At a station the train
  slows, sits under platform lamps for a while (mostly idle frames), and
  pulls away.
- **Settings:** `rain`, `speed`, `stations`, `tunnels`, `reflection`,
  `palette` (blue night, sodium, snow route with falling flakes).
- **Cost:** medium. Low drops the reflection and the streak layer's
  softness, and halves the near-layer detail.

**As built:** `route.js` is pure: a station every 150–260 s, tunnels after 70 s (forced by 200 s), and a braking curve that stops the platform's middle at the window; 300 seeds each pass a tunnel and a station inside 10 minutes. Middle and near layers are 512 px tiles painted once from the route as they scroll in. The carriage's reflection (seat backs, a reading lamp, a cat in a basket) shows only over tunnel spans. A dry platform idles at about a frame a second.

### 10.17 Fireworks (`fireworks`, owner pick)

A fireworks show over a dark skyline and lake, automatic or by tap, with a
countdown and finale at midnight on New Year's.

- **Shells:** a launch trail, then a burst type: peony, chrysanthemum (with
  trails), willow (long drooping gold), ring, palm, crossette (splits
  again), strobe and crackle glitter. Colours from a few palettes.
- **Trails:** each particle keeps a short history drawn as a fading
  polyline, rather than fading the whole screen each frame, so the
  background stays visible and the cost is per particle.
- **Smoke:** faint puffs left by earlier bursts that later bursts light up,
  an effect declared `medium`.
- **Modes** (`mode`):
  - `auto` (default): a show with rhythm, building, lulling and ending in a
    finale every `showMinutes`, then a short pause.
  - `tap`: nothing until tapped; a tap launches a shell to that point.
  - `newyear`: tap mode all year, then an automatic countdown from 23:59:50
    on 31 December (local, from `host.now()`), a finale at midnight, and a
    show for a few minutes after.
  Taps launch a shell in every mode.
- **Scene:** a cached skyline or hills silhouette over a lake that reflects
  each burst as a soft vertical smear.
- **Settings:** `mode`, `showMinutes`, `intensity` (scaled by density),
  `palette`, `burstTypes`, `smoke`, `reflection`.
- **Cost:** pooled particles, capped per tier; the finale is the budget
  case.
- **Option (owner to decide):** Seasonal (3.7) could pick Fireworks for
  31 December and 1 January.

**As built:** `FireworksShow` is pure (run, phase, `newYear(date)`); lulls are capped so the sky is never empty for more than 8 s (unit-tested over 2-hour simulations). Particle trails are 30 Hz histories stroked as a few batched `Path2D`s. At midnight on New Year's the year is written in stars, then a 45 s finale and a show until 00:05. Tap and New Year modes idle with an empty sky. Seasonal is unchanged; whether it picks Fireworks on 31 December and 1 January is still the owner's call.

### 10.18 Lighthouse (`lighthouse`, owner pick)

A lighthouse on a headland at night. The beam sweeps over a heaving sea and
through the rain; ships' lights pass in the distance. The sea can follow a
real ocean's swell.

- **Beam:** a rotating gradient wedge with `lighter`. It follows a real
  light **characteristic**, e.g. `Fl(2) 10s` (two flashes every ten
  seconds), timed by elapsed time. When the beam points at the viewer the
  lantern flares. Rain and spray particles inside the wedge are drawn
  brighter (a cheap angle test).
- **Sea:** layered sine bands, each with its own wavelength and speed, with
  whitecaps where they peak; spray bursts on the rocks. Height and period
  come from `sea` (calm to gale) or from data.
- **Ships:** far-off navigation lights (white masthead, red or green side
  light depending on direction), sometimes a lit ferry.
- **Storm:** at gale strength, rain, cloud scud past the moon and, rarely,
  lightning.
- **Data (optional):** Open-Meteo's marine API, keyless, CORS-enabled,
  `https://marine-api.open-meteo.com/v1/marine?latitude=…&longitude=…&hourly=wave_height,wave_period,wave_direction`.
  The point is chosen from a list of generic open-ocean presets (e.g.
  "mid North Atlantic"), or from §10.1 location snapped out to sea.
  Refreshed hourly; offline, the `sea` setting rules.
- **Settings:** `sea`, `liveSwell`, `oceanPoint`, `characteristic`, `ships`,
  `rain`.
- **Cost:** medium; Low drops spray and in-beam particles.

**As built:** the characteristic is parsed into "on" intervals and is a pure function of time (unit-tested at 10–144 fps with jitter); a rotating beam faces the viewer exactly at its flash peak, when the lantern flares and the night brightens. The sea is 22 perspective bands of 4 peaked wave trains at deep-water speed. Presets calm to gale drive foam, rain, clouds and lightning. Live Swell (off by default) follows Open-Meteo's hourly forecast for generic open-ocean points, cached for 48 h. The moon's phase follows `host.now()`. Icon 🌊: there's no lighthouse emoji.

### 10.19 Wiki Pond (`wiki-pond`, owner pick)

Every edit to Wikipedia, live, as a ripple on a dark pond. The size of the
ring is the size of the change; its colour says who made it.

- **Inspiration:** Hatnote's *Listen to Wikipedia*. Nothing is copied; it
  gets a line in `THIRD_PARTY.md` as an inspiration.
- **Data:** Wikimedia EventStreams over server-sent events,
  `https://stream.wikimedia.org/v2/stream/recentchange` (keyless, `*`
  CORS, checked). Each event has `wiki`, `type` (`edit`, `new`, `log`…),
  `bot`, `length.old`/`length.new` and `title`.
  - Filter to the wikis chosen in `wikis` (default English only, a few
    events a second). All wikis together is far busier, so it's capped.
  - Map: additions grow rings outwards, removals pull them inwards; size
    by log of bytes changed; colour for registered users, bots and
    temporary accounts; a new article is a lotus that opens; a new account
    is a soft bell, if sound is on.
  - Ripples land at random places, or clustered by language with `wikis`
    set to several.
- **Titles:** off by default. These are other people's live edits, and
  vandalism happens; with `titles` on, a title fades briefly beside its
  ripple, plain text only.
- **Offline:** a quiet pond with occasional rain ripples and a small
  "waiting for edits" note; reconnects with backoff.
- **Power:** the stream stays open, so `stop()` and pause close it, and on
  Android the default is to listen in bursts. `cost: 'medium'` for the
  radio, even though drawing is cheap.
- **Settings:** `wikis`, `bots` (show, hide), `titles`, `sound` (off),
  `palette`.
- **Smoke:** a synthetic SSE fixture with made-up titles and users, never a
  recording of the live stream.

**As built:** EventSource, canary events dropped; `~` names are temporary accounts, IP names anonymous; ring size log2(1 + |Δbytes|). On Android it listens in bursts (30 s on, 90 s off, the catch spread over the gap), since the server can't filter by wiki. Reconnects after 1 s, backing off to 60 s while failing; a 45 s silence reopens it. The stream closes on `stop()` and through the stage's new `onPause`. Sound (off by default) is a pentatonic note per edit.

### 10.20 Satellites (`satellites`, owner pick)

The sky over you as it darkens, with real satellites crossing it: the
space station, the brightest rocket bodies, and dozens of others, each a
moving point of light.

- **Data:** CelesTrak's general-perturbation elements as JSON,
  `https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=json`
  (about 150 of the brightest), keyless, `*` CORS, checked. CelesTrak
  asks clients to fetch no more often than the data updates and blocks
  abusers, so: cached, refetched at most every 12 h, and labelled stale
  after a few days.
- **Propagation:** our own simplified SGP4-family propagator (mean elements
  with J2 secular drift), about 200 lines, aiming for about a degree
  in the sky for a few days from epoch. It's tested against the published
  verification vectors (Vallado et al., *Revisiting Spacetrack Report #3*,
  2006). If that isn't good enough, vendoring the MIT-licensed
  `satellite.js` with a `THIRD_PARTY.md` line is the fallback.
- **Visibility:** a satellite is drawn when it's above the horizon, the
  observer is in twilight or darkness (sun below −6°, computed in code)
  and the satellite is still in sunlight (outside Earth's shadow
  cylinder), which is why passes appear just after dusk and before dawn.
  In Earth's shadow it fades out mid-sky, as real ones do.
- **Location:** needs §10.1. Without it, a sky for a generic latitude and a
  note saying so.
- **Scene:** a horizon silhouette, the real sun-driven sky colour, a seeded
  starfield, and the station drawn brighter with a label. A tap on a
  satellite shows its name, height and speed.
- **Folds in** the ISS tracker from §10.5.
- **Settings:** `group` (visual, stations, all bright), `labels`,
  `trails`, `horizon`.
- **Cost:** low; positions are recomputed once a second and interpolated.
  `motion: 'slow'`.

**As built:** full near-Earth SGP4 written from Spacetrack Report #3 as revised by Vallado et al. (2006), matching the verification vectors to under a metre; a J2-secular-only model measured 11–26 km off over 2–3 days (1.5–3°), so it was dropped. Deep-space orbits are skipped. Stereographic sky with a flat horizon; colour from the sun per pixel on a 128-px image every 30 s. Visible needs the sun below −6°, the satellite sunlit (shadow cylinder, 60 km soft edge) and above the ridge; unseen ones are optional faint rings. Elements cached per group, fetched at most every 12 h, stale after 3 days; offline, seeded sample orbits, labelled. `make bench` blocks CelesTrak.

### 10.22 Harvest Valley (`harvest`, owner pick)

A calm, cosy, whimsical autumn background for Thanksgiving: a mash-up of a
harvest village, the harvest moon, geese, an apple orchard and a pumpkin
patch. Ambient first, a little interactive. **Everything has a switch**:
no village, no orchard, no day (only the moon), and so on.

- **Sky (`harvest-sky.js`, pure):** the sun's declination from the day of
  the year at a middling latitude (40°N, not a place), hour angles from
  `host.now()`: the real sunrise and sunset for the date, rising left and
  setting right, a low November sun. The moon is the mean synodic month
  from a known new moon (good to about a day): its phase, where it rides
  (it transits later by 50 minutes a day of age; its declination is
  opposite the sun's at full, so the winter full moon is high), its bright
  limb towards the sun, and its name (Harvest, Hunter's, Beaver… by the
  month; the Harvest Moon is the full moon nearest the equinox). Sky
  colours, the wash over the land, cloud tones, stars and "how dark" are
  all ramps over the sun's altitude, continuous (a unit test checks there's
  no jump), with moonlight lifting a dark night.
- **Time of day:** live; a whole day in 1–30 minutes (time-lapse from now);
  or pinned to day, golden hour or night. A pinned night scans the dark hours
  for the moment the moon is highest, so "just the moon" has a moon whenever
  one can be had. The moon's phase can be pinned too (full, gibbous, half,
  crescent).
- **Scene:** five ranges of hills, each lower, warmer and less grey than the
  one behind (the farthest a pale lavender-grey with only a rumour of rust),
  forested in dabs of autumn colour; a quilt of farmland bands; a village (church, cottages with chimneys, window boxes,
  pumpkins, an autumn wreath on every door and a pie on a sill, a barn, a windmill whose sails turn with
  the wind), bunting that spells *GIVE THANKS* in Thanksgiving week (the
  four days either side of the fourth Thursday of November) and lights every
  window on the day; a road with lamp posts; corn, shocks and bales; the
  pumpkin patch with its sign (*Most Sincere Pumpkin Patch*); three rows of
  apple trees in perspective, kept off the road, the corn and the patch.
  The meadow, corn and patch start below the village's lowest doorstep
  (never across a building); the horizon defaults to 55% of the height and
  goes to 70%, the rows of trees thinning to fit below the fields.
- **Cast:** geese drawn properly, as small Canada geese (a long level neck, black
  with a white chinstrap, a brown body with a cream belly and a white rump
  patch, black flight feathers, a wing of arm and hand with fingered primaries, a darker far wing;
  the downstroke a full sweep, the upstroke with the wrist folded; a
  near-silhouette against the low sun) in flocks of up to 100: mostly a V
  with unequal arms, sometimes a slanting line or a ragged cluster, each on
  its own curving, banking, climbing and sinking path, the wingbeat rippling
  down the formation a beat behind each goose ahead, spaced a body-length
  and more apart so they read as birds, swaying in their places, far flocks
  small and pale; several flocks can be crossing at once (a second often
  follows the first, up to a cap of 4 + flocks-per-hour/15), a flock of six or
  more often has one to three stragglers well behind it, wingbeat a little
  quicker and never quite catching up, and a lone goose crosses now and then; the lead goose drops to the back (offsets ease, so it
  glides round the outside), and the whole flock glides now and then; squirrels who
  gather fallen apples and acorns in both paws and carry them off the nearest
  edge of the screen (never appearing or vanishing in place: they walk out,
  and walk back in from an edge a few seconds later; some acorns are eaten
  on the spot), and who bolt for an edge if the pointer is fast and near; turkeys that stroll, peck, fan their tails
  (more in Thanksgiving week) and avoid the pointer; cats (§ below); a
  pumpkin-headed scarecrow with a crow that flies off and comes back; and
  fall-colour leaves, apples that tumble, bounce, roll and fade.
- **Cats (owner request):** each one random: coat (ginger, grey, black,
  tuxedo, cream, calico, brown), size, laziness (55–95% of its time asleep),
  and perch (a roof, a hay bale, a porch step, the pumpkin patch, the grass
  under a tree, the warm side of the bonfire after dark). Roof and bale cats
  stay put; the others may stretch and amble to somewhere better now and
  then. They sleep (breathing, drifting z's), loaf, sit, wash a paw, stretch,
  and watch squirrels with great interest, doing nothing about them.
- **The Great Pumpkin:** on a dark night, at random (and always on `G`), the
  most sincere pumpkin wakes (its carving lights), lifts on swirling sparks,
  and climbs over the valley for 28 s until it's a star; the scarecrow turns
  to look; the patch grows a new one later. Says so in a toast, with callouts
  on. `G` by day says it's far too bright.
- **After dark:** windows and lamps glow (a few windows stay dark), a
  bonfire with sparks and people round it, stars and a faint galaxy, a
  shooting star every 25–75 s, the moon's halo.
- **Sky details:** clouds are hundreds of soft blobs heaped into domes on a
  flat, softly fading base and shaded underneath and lit on top (cumulus,
  long low stratus, high cirrus), padded so nothing is cropped and placed
  wholly inside the sky; valley mist lies on the land only, thickest at dawn
  and dusk; the moon's seas are soft patches that run together.
- **Light and depth:** everything is drawn at full daylight colour and washed
  with the hour's light (a horizon haze, then the hour's tint, by
  `source-atop` so only what's drawn is touched). There are two offscreen
  layers. The *land* (hills, fields, village, mist, smoke, bunting, mill) is
  washed first, and only then the things that glow on it (lit windows, lamp
  heads and halos, the bonfire, its sparks and the people round it) are put
  on at full brightness. In front of that is a *fore* layer of everything
  that stands on the ground (trees, apples, animals, the scarecrow, the
  pumpkin, leaves), sorted far to near and washed the same way, so a tree in
  front of a lit window hides it and nothing glows through anything. The sky,
  geese, sunbeams and the Great Pumpkin's glow are on the main canvas around
  them. Clipping is a bug: village trees are planted clear of every building,
  the mill and the road, and drawn in the same depth order as the houses;
  lamp posts and the fire's ring are drawn after the road; a flock's band is
  fitted so its lowest goose, tilt and sway included, stays above the
  highest ridge (a huge flock is flattened to fit); and the front row of
  trees is cut down when a high horizon leaves little room below the
  fields.
- **Autumn colours (owner request):** seven presets (mixed, golden, crimson,
  russet, ember, burgundy, early autumn) or a custom palette of up to eight
  colours, which colours the trees, the leaves, the forested hills and the
  litter on the grass.
- **Settings:** time of day, minutes per day, sun, moon, phase, size, stars,
  clouds, geese (flocks per hour, flock size), the village and each part of
  it, fields, scarecrow, patch, Great Pumpkin, orchard (trees, size, apple
  fall, squirrels, turkeys), cats, leaves, autumn colours, wind, mist,
  sunbeams, callouts, tap to shake, and (Advanced) the horizon.
- **Callouts:** `host.toast` for the holiday, a notable full moon (once a
  day), the Great Pumpkin, and the keys: `G` wait for the Great Pumpkin, `H`
  call the geese, `W` a gust, `M` what the moon's doing (name, how much is lit,
  sunrise and sunset). Off with the Callouts setting.
- **Input:** a tap shakes the nearest apple tree (apples and leaves fall),
  scares the crow off the scarecrow, or calls a flock from the empty sky.
  Touch can be switched off.
- **Cost:** medium by design, low in practice (4.4% busy on Low, 13% on High
  at 4× throttle). Effects `mist` and `beams` shed on Low. Leaves, apples,
  smoke, sparks and flocks scale with `density`.
- **Why seasonal November:** the fish tank was a placeholder there.

### 10.23 Fireplace: realistic wood (owner request, 2026-10-29)

The flames were good; the logs were cartoon pipes (rounded rectangles with
stripes and an end cap at each end). `fireplace-wood.js` (`FireplaceWood`,
geometry unit-tested in `tools/fireplace.test.mjs`) replaces them:

- **Shape.** Each log is an outline sampled along its length: taper, bow,
  knots that swell one edge, and branch stubs. One cut in three is split
  (`half`: flat side up; `quarter`: a wedge, apex up), showing a band of
  fibrous split face. Species follow the flame palette: oak (furrowed),
  birch (papery, lenticels, peeling curls), pine (plates), driftwood
  (bleached, no bark).
- **One end.** Perspective shows only the end turned toward the screen's
  middle: growth rings around an off-centre pith (arcs around the apex for
  split wood), heartwood, drying checks, faint saw kerfs, the bark rim and
  char creeping in from it. The far end is a ragged back outline. Body and
  both ends wind the same way, so one `Path2D` unions them.
- **Alligator char.** Blocks laid out around the circumference (s) and
  projected, so they crowd toward the silhouette. The circumference is cut
  into bands with their own columns, so no crack runs the whole way round,
  and cracks across the grain are wider than those along it. A soft char map
  (5 px grid, `putImageData` at bake time only) masks the blocks and the glow,
  so the char's edge follows the burn, not the blocks.
- **Light from below.** Painted in daylight colours, then multiplied by a
  firelight grade (dark top, warm underside). Logs over another shade it
  (a bake-time `shadowBlur`). Contacts with other logs and the bed are found
  by sampling edges; they char deepest and glow hottest.
- **Breathing glow.** Each log's glow (a warm bloom, a thin hot core only on
  the hottest cracks, the underside's coal light, the flame-lit rim) is cut
  into feathered zones along its length whose weights sum to one, so zones
  pulsing apart never show a seam. Neighbouring zones read nearby noise, so a
  brightening rolls along a log. The rim follows the flame root behind it.
  Pops flash their zone.
- **Coal bed and iron.** A lumpy heap of chunks (live, char, ash), glowing in
  the gaps, in feathered tiles that breathe and burn harder under strong
  flame; settings Coal Bed (depth) and Ironwork (grate, andirons, none).
  Below the ground line is hearth stone, hiding the logs' buried undersides.

Costs: a 60–70 ms bake per resize on a desktop, about 3.5 MP of layers at
10 logs; per frame, one blit per log plus about three per zone. Bench
unchanged (4.7 / 9.0 / 18.7% busy).

Hard-won:
- `destination-in` scales by the fill's alpha. A mask fill that inherits a
  translucent `fillStyle` silently dims the whole layer (it took the warm
  glow to 5%). Set an opaque fill first.
- A dim yellow ember reads as olive. Dim must be deep red; only the hottest
  cracks get the orange-yellow core, and it doesn't accumulate.
- Two round knots side by side read as eyes. Knots are lenses along the
  grain, birch scars long bands around the trunk, one at a time.

### 10.21 Jellyfin player (`jellyfin`, owner pick, high priority)

Your own Jellyfin server's videos playing behind everything: a playlist
shuffled by default, or random picks from a library. They play inside a
frame of your choice, such as an old TV, a fireplace mantel or a drive-in
screen. Phase 9 builds it. Facts marked *verify* are checked by spike 9.0
before anything is built on them.

**Spike 9.0 results** (2026-10-23, against Jellyfin 12.3.0 in Docker,
`make jellyfin-dev`, with Chrome 155 and Android WebView 145 on an
Android 17 emulator). Some of these overturn what was planned below; the
plan has been corrected to match.

| Host | Server over http (localhost, LAN) | Server over https |
|---|---|---|
| `file://` (player and stage) | ✓ API and video, no prompt | ✓ (inferred) |
| `make serve` (https://localhost) | Not tested. By the same rules as Pages, without the prompt (localhost is already local): LAN by IP address | ✓ |
| Extension | ✓ API and video, **no host permission needed**, no prompt (localhost, and a server Chrome was told is on the LAN) | ✓ (inferred) |
| GitHub Pages | Blocked until Chrome's **local network** prompt is allowed; then ✓ for `localhost` and for LAN **IP addresses** (Chrome lets an IP-literal http request through as a mixed-content warning, unupgraded). An http *hostname* stays blocked | ✓ after the same prompt (a private address is still local; inferred, not tested) |
| Android WebView | Blocked three ways, all fixed in the app: mixed content (`MIXED_CONTENT_ALWAYS_ALLOW`, for the API), cleartext (a network security config), and Android 17's runtime **`ACCESS_LOCAL_NETWORK`** permission (without it requests hang, then time out). `<video>` from http stays blocked even then, so the app carries media itself (`MediaProxy`) | ✓ (inferred; the permission still applies to LAN addresses) |

- **The server:** `Access-Control-Allow-Origin: *` on the API and media by
  default, preflights included, so `Authorization` headers work from any
  origin. Quick Connect is on by default; its code is six digits.
- **One token per DeviceId:** signing in again with the same DeviceId
  revokes that device's earlier token, and `POST /Sessions/Logout`
  revokes at once. The DeviceId is per install (the player and stage share
  storage, so they share it too).
- **Paths:** `/UserViews?userId=` and `/Items?userId=` (the older
  `/Users/{id}/Views` and `/Users/{id}/Items` still answer). The static
  stream and `Stream.vtt` answer without a token; the HLS playlist needs
  one, and `TranscodingUrl` already carries it as `ApiKey=`, so **media
  URLs are secrets** and are never logged.
- **Formats:** Chrome 155 plays the server's HLS natively (`canPlayType`
  says "maybe"), as does WebView 145, so there's no `hls.js`. Matroska
  with H.264 plays directly. A `CodecProfile` height condition makes the
  server transcode anything taller than the cap.
- **Subtitles:** `.en.sdh.srt` sidecars arrive with `IsHearingImpaired`;
  image tracks (DVD, PGS) arrive with `DeliveryMethod: "Encode"`, and
  asking for one puts `SubtitleMethod=Encode` in the transcode.
- **Autoplay:** muted autoplay works in the stage iframe on every host.
  Unmuted is refused without a gesture (`NotAllowedError`) except in the
  extension, which may play sound from the start. Android allows it once
  `mediaPlaybackRequiresUserGesture` is off.

**Signing in**
- **Server:** the user types its address (`http://…:8096` or an https
  reverse proxy). The player checks it with `GET /System/Info/Public`,
  shows the server's name and version, and refuses anything that doesn't
  answer like Jellyfin.
- **Quick Connect first:** `POST /QuickConnect/Initiate` returns a
  six-character code. The panel shows it big, the user approves it from
  any signed-in Jellyfin app, and the wallpaper polls
  `GET /QuickConnect/Connect?secret=` and then calls
  `POST /Users/AuthenticateWithQuickConnect`. <!-- audit-allow: Jellyfin API path --> No password ever touches
  the wallpaper.
- **Fallback:** `POST /Users/AuthenticateByName` <!-- audit-allow: Jellyfin API path --> with a username and
  password. The password is sent once and never stored.
- **Every request** carries
  `Authorization: MediaBrowser Client="Wallpapers", Device="<host>",
  DeviceId="<random, per install>", Version="<manifest version>",
  Token="…"`. Media URLs can't send headers, so they put the token in
  `api_key=` instead.
- **The token** lives in `host.storage` (`wp:jellyfin:auth`). It isn't a
  setting, so Export, Import and Reset never see it. **Sign out** calls
  `POST /Sessions/Logout` and forgets it. If the server says 401, the
  panel offers to sign in again; the wallpaper shows its idle screen.

**Choosing what plays (`source`)**
- `playlist` (the default): `GET /Users/{user}/Items?IncludeItemTypes=Playlist&Recursive=true`
  fills the picker, then `GET /Playlists/{id}/Items?UserId=`.
- `library`, "for the adventurous": `GET /Users/{user}/Views` lists the
  libraries, then
  `GET /Users/{user}/Items?ParentId=&IncludeItemTypes=Movie,Episode,MusicVideo,Video&Recursive=true&SortBy=Random&Limit=50`
  is fetched again whenever the batch runs out. `libraryFilter` narrows
  it: unwatched only, favourites, or a maximum parental rating.
- `favorites`: the user's favourite videos, across every library.
- **Order (`order`):** `shuffle` is the default, `in order` is the
  alternative. Shuffle uses a shuffle bag: each item plays once before
  any repeats, the bag is reshuffled each round, and the last item of one
  round never opens the next. The bag lives in `host.storage`, so a new
  tab carries on through the same round.
- **How much of each item (`segment`):**
  - `whole`: each item plays to the end.
  - `clips`: 1, 3 or 10 minutes from a random point, skipping the first
    and last 5% (titles and credits).
  - `channel surf`: short clips with a "channel change" between them.
    This suits a wallpaper best, since a two-hour film isn't ambient.

**Playback**
- **Picking the stream:** `POST /Items/{id}/PlaybackInfo` with a device
  profile built from `canPlayType` at runtime.
  - Direct play (`/Videos/{id}/stream?static=true&MediaSourceId=…`) is
    used whenever the container and codecs fit **and** the source is
    within the tier's resolution cap.
  - Otherwise the server transcodes (`TranscodingUrl`, HLS) at the cap.
    HLS is native in Android WebView, and *verify* in desktop Chrome. If
    it isn't native there, the fallback is a progressive MP4 transcode or
    a vendored `hls.js` (Apache-2.0, with a `THIRD_PARTY.md` line); the
    spike decides.
- **Resume:** the position per item is saved to `host.storage` every
  10 s and on `stop()`, so every new tab carries on where the last one
  left off instead of restarting the film. Items under 2 minutes always
  start from 0.
- **One tab at a time:** a `BroadcastChannel('wp:jellyfin')` hands
  playback to the newest visible stage. The others pause, keep their
  last frame and release the decoder, so ten new tabs don't mean ten
  decoders and ten soundtracks.
- **Audio (`startMuted`, on by default):** every start is muted, and a
  small 🔇 shows for a few seconds. `m` toggles, as does a tap on the
  icon. With `startMuted` off, the wallpaper tries to play with sound and
  falls back to muted if the browser's autoplay policy refuses (it will
  without a recent user gesture), then offers a "tap for sound" toast.
  Volume is a setting, and is remembered.
- **Reporting to Jellyfin** (`reportPlayback`, off by default; see Open
  questions): `POST /Sessions/Playing`, then `/Playing/Progress` and
  `/Playing/Stopped`.
- **Keys:** `Space` pause, `m` mute, `n`/`p` next and previous, `←`/`→`
  seek 30 s, `s` cycle subtitles, `i` show what's playing, `c` cycle the
  frame.

**Subtitles** (automatic, as asked)
- **Defaults:** `subtitleLanguage: 'eng'` (any ISO 639-2 code), and
  `subtitles: 'always'`. The other choices are `forced only` and `off`.
- **Picking a track,** from the media source's `MediaStreams` with
  `Type: 'Subtitle'`, in this order:
  1. a full (non-forced) track in the chosen language
  2. a forced track in that language
  3. one marked `IsDefault`
  4. none

  SDH or hearing-impaired tracks rank last within each step. Matching
  also accepts the 2-letter code and the display title, since `en`,
  `eng` and "English" all occur in real libraries.
- **Foreign-language audio:** when the audio isn't in the chosen
  language, `forced only` behaves like `always`.
- **Text formats** (SRT, ASS, VTT) come as WebVTT from
  `/Videos/{id}/{source}/Subtitles/{index}/0/Stream.vtt`, loaded as a
  `<track>` in `hidden` mode.
  - We draw the cues ourselves on the frame canvas, so they sit inside
    the TV's screen, above `host.insets.bottom`, in a style that suits
    the frame: a chunky teletext box on the old TV, a typewriter face on
    the cinema.
  - Cues redraw only on `cuechange`, so subtitles cost nothing in
    between.
- **Image formats** (PGS, VobSub) can't be drawn as text, so the server
  burns them in (`SubtitleMethod: Encode`). That forces a transcode, so
  `burnInImageSubs` (on) can be turned off to keep direct play.
- `s` cycles through the available tracks and remembers the choice per
  item.

**Frames** (`frame`)

Each frame is drawn in code. Its static art goes on a cached canvas built
once per resize: the art with a transparent "screen" hole, laid out
around the real `<video>` element. Only small bits animate, at the
`motion: 'slow'` rate. Every frame has a landscape and a portrait layout,
since a phone held upright gets a TV on a stand rather than a tiny
letterbox. The screen rect always keeps the video's aspect ratio, and
`fit` (contain, cover) applies inside it.

- **None:** the video full-bleed, contain or cover. The cheapest frame.
- **Old TV:** a 1970s wood-grain console.
  - Rabbit-ear antenna, two chunky dials (the channel dial clicks round on
    every change), a speaker grille, and a rounded CRT screen.
  - A static scanline overlay and a glass glare.
  - Between items, a burst of snow from a few pre-rendered noise tiles
    (never per-frame random pixels), with a hiss if sound is on.
  - On `stop()`, the classic collapse to a bright dot.
- **Mantel:** a cosy room at night, with the video on a framed screen
  above a fireplace.
  - A small fire burns below, drawn like the fireplace wallpaper's but
    much cheaper: a few baked flame sprites, flickering at 12 fps.
  - It throws warm light that pulses on the walls.
  - Stockings hang in December and a pumpkin sits there in October, from
    `host.now()`.
- **Drive-in:** a big screen under the stars, with car silhouettes and
  their tail lights at the bottom and a speaker post.
  - A projector beam with drifting dust motes.
  - The item's name on the marquee.
  - A slow car occasionally pulls in.
- **Cinema:** red velvet curtains that part at the start of each item and
  close between items, a row of seat silhouettes, and the exit signs'
  green glow.
- **Gallery:** an ornate gilt frame on a museum wall, under a picture
  light, with a brass plaque: "*Title* (Year). Moving pictures on canvas."
- **Ambilight:** the screen floats on a dark wall, and the video's colours
  spill onto the wall around it.
  - A 16×9 `drawImage` of the video, a few times a second, scaled up as
    the glow. Smooth scaling blurs it for free.
  - No `getImageData` and no `ctx.filter`, so it stays within §4.8.
- **Camcorder:** a viewfinder.
  - `REC ●` blinking, a battery icon, a date stamp (from `host.now()`, in
    the 1990s orange), corner brackets, and an occasional zoom jitter.
  - A VHS variant: a `PLAY ▶` on-screen display and tracking lines when
    items change.
- **Porthole:** a riveted brass submarine porthole, with bubbles drifting
  up past the glass and the odd fish silhouette.
- **Arcade:** a cabinet with the item's title lit on the marquee, side art
  and a joystick; `INSERT COIN` blinks between items.
- **Seasonal:** picks the frame by date (Mantel in winter, Drive-in in
  summer), like the player's Seasonal choice.

Frames are a registry, `{ id, layout(w, h, aspect) → { screen, … },
paintStatic(ctx), tick(ctx, t), transition(kind), drawCue(ctx, cue) }`,
so a new one is a single file. Colour treatments that suit a frame
(sepia for the old TV, green for a handheld) are CSS `filter` on the
`<video>` element: GPU, not canvas. This is noted as the one exception to
§4.8, because it can stop the video using a hardware overlay. Each
treatment is optional, and off on Low.

**Energy**

Video is the most expensive thing this project will ever show, so the
default is to spend as little as possible.
- **Let the compositor do it.** The video stays a real `<video>` element,
  never drawn into a canvas every frame, so decoding stays in hardware
  and the browser can use an overlay plane. The frame canvas then idles
  (§4.8 idle frames) except for its few animated bits.
- **Cap the resolution on the server** by tier. Low asks for 480p, Medium
  for 720p, High for the source up to 1080p (`maxResolution` overrides
  it). Decoding cost scales with pixels. The server pays for the
  transcode, which a home server is for.
- **Power policy (§4.8):**
  - On battery: a 720p ceiling.
  - Battery saver or under 20%: **poster mode.** No video at all. The
    item's backdrop (`/Items/{id}/Images/Backdrop`) is shown in the same
    frame with a slow Ken Burns drift and its title, and moves on every
    few minutes. A setting can force poster mode everywhere.
- **Pause for real.** `host.onPause` pauses the video; `stop()` also
  clears `src` and calls `load()` so the decoder is freed. A hidden tab
  never decodes.
- **Catalog:** `cost: 'high'`, `effects: [['ambilight', 'medium'],
  ['videoFilter', 'medium'], ['frameMotion', 'low']]`.
- **Android:** a video playing behind the home screen all day is the worst
  case for battery. The default there is `segment: clips` with poster mode
  on battery, so full video only plays while charging. *Verify*:
  `<video>` decoding in a WebView inside a live wallpaper (§6.1), under
  both spike strategies.

**Network** (new groundwork, task 9.2)
- **The problem:** every other wallpaper's host is fixed and checked in
  three places (catalog, `URL_ALLOW`, `host_permissions`). Here, the host
  is whatever the user types.
- **Catalog:** `network: 'user'` declares "a single origin the user
  types". The tests accept it in place of a host list, and the audit
  still forbids any real server address in the repo, docs and fixtures.
  Fixtures use `jellyfin.invalid`.
- **Extension:** `optional_host_permissions: ["http://*/*",
  "https://*/*"]`. The panel's *Connect* button calls
  `chrome.permissions.request({ origins: [serverOrigin + '/*'] })`, which
  needs a user gesture, and the player owns the panel, so it has one.
  The user grants exactly one origin. *Verify* whether a CORS fetch
  and a `<video>` source from an extension page need the grant at all;
  if neither does, the spike drops it.
- **CORS:** Jellyfin answers browser clients on other origins by default
  (*verify*). If a server or reverse proxy doesn't, the panel says
  exactly which header is missing.
- **Mixed content and private networks:** the https Pages copy can't
  reach an `http://` LAN server, and Chrome prompts before a public page
  talks to a private address. The panel detects both and explains them
  (see Open questions). `file://`, `make serve`, the extension and
  Android don't have these problems.
- **Offline or server down:** the frame's idle screen, never a blank one.
  The old TV shows a test card with "NO SIGNAL", the cinema closed
  curtains, the drive-in "INTERMISSION". Reconnects with backoff.

**Settings** (suggested keys)
- `server`, `source`, `playlistId`, `libraryId`, `libraryFilter`,
  `order` (shuffle), `segment`
- `startMuted` (on), `volume`
- `subtitles` (always), `subtitleLanguage` (`eng`), `burnInImageSubs`
- `frame` (Old TV), `fit`, `showTitle`
- `maxResolution` (auto), `posterMode` (auto), `reportPlayback` (off)

**Privacy:** titles in the panel and on frames come from the user's own
server and stay on screen only, as `textContent`. Logs never include the
server address, token or titles. The smoke run's mock server uses
made-up titles such as "Test Pattern No. 3".

---

## Open questions

New questions go here, each with a recommendation.

- **Jellyfin: does playback report to the server?** Reporting updates
  "continue watching" and marks items played, which a wallpaper looping a
  playlist all day would scramble. *Recommendation:* off by default
  (`reportPlayback: false`); resume positions are kept locally.
- **Jellyfin: password sign-in at all?** Quick Connect means no password is
  ever typed into a wallpaper. *Recommendation:* keep the password form as
  a fallback for servers with Quick Connect turned off, never store the
  password, and say so beside the field.
- **Clock overlay on the Mac saver (§4.9):** `SaverSync` mirrors every `wp:`
  key, so a ticked `wp:clock` shows in the saver's web view as well, next to
  the saver's own native *Show a Clock*. They stay separate, as decided, but
  two clocks at once is unlikely to be what anyone wants. *Recommendation:*
  when the native clock is on, the saver loads the page with `?clock=off`
  (one parameter; the overlay's code is untouched), and the Mac menu says so.
- **Clock overlay: should it hide while a Jellyfin frame is playing?**
  Video wallpapers want the picture clean, and some frames (Camcorder, VHS)
  draw their own date stamp. *Recommendation:* no automatic rule; the
  `hideOn` list in Advanced covers it, and the user decides.
- **Clock overlay on Android's home screen:** the clock stays fixed while the
  home pages swipe (it doesn't follow `onScroll`). *Recommendation:* keep it
  fixed; a clock that slides with the pages looks like a widget that
  has come loose.
- **Jellyfin on GitHub Pages:** settled by spike 9.0. After Chrome's local
  network prompt, Pages reaches an https server, or an http one addressed
  by IP; only an http *hostname* stays blocked, and the panel says so.

---

## Appendix B: parity with the old homepage (Phase 7)

The homepage at its last commit (`82a3c60`). The Phase 2 import matches it
file for file: all 19 module files hash the same, so nothing drifted after
the import.

| On the homepage | Here | |
|---|---|---|
| A wallpaper menu in its status bar: Blank, Bing and 16 animations | The panel's filmstrip, with thumbnails and live previews; every one, plus Seasonal | ✓ |
| First run: snow in season, else Blank | Seasonal by month (§4.2) | ✓ better |
| A gear button for the current wallpaper's settings | The panel; the corner gear; a long press on touch | ✓ |
| `c` settings, `f` fullscreen | `c` or `,`, `f`; also `[` `]` `?` | ✓ |
| `h` hides the page around the wallpaper | Nothing to hide: only the wallpaper shows | n/a |
| 301 settings in 18 stored configs (`<name>Config`, `questConfig`, `questStandaloneConfig`, `snowConfig`, `wallpaperConfig`) | 288 carried as they were. Neko's `theme` became `coat`. 12 retired: `statusBarHeight` ×8 (host insets), `quality` ×2 (the Auto governor), quest's `dim` (nothing sits on top now), neko's `enableSounds` | ✓, enforced by a unit test (`tools/legacy.test.mjs`) |
| Standalone pages (`snow.html`, `quest.html`, …) with tuned presets | `?w=<id>` deep links; the presets are the defaults (Appendix A) | ✓ |
| Advent's keys, `?date=`, `?theme=` | Declared keys, `?date=`, `?theme=`; its `s` (settings) is `c` or `,` now | ✓ |
| Quest's keys and play | Declared keys and the same play; its `c`/`o` (settings) is `c` or `,` now | ✓ |
| Bing's photo, day picker and credit | The same, with proxies opt-in (§4.6) | ✓ |
| Settings in that origin's `localStorage` | Import (below) | ✓ |
| A Chrome new-tab extension asking for storage, geolocation and three hosts | One host (Bing), no other permissions, a pinned ID (§5) | ✓ fewer permissions |
| Docker and nginx | The container, `make serve`, GitHub Pages | ✓ |
| Links, weather, search, clocks | Left behind by decision; weather and a world clock are ideas 10.2 and 10.3 | — |

**Moving settings** (`core/legacy.js`, loaded only on Import): the README's
console snippet saves the old wallpaper keys (never the links) as
`{ app: 'homepage', localStorage }`. Import recognises the shape and:
- keeps only values that differ from the homepage's own defaults, since
  its dialogs saved every value on Apply, and lays them over today's
  defaults. The legacy defaults were read by running each module as
  imported in headless Chrome; snow's are the homepage's Reset values;
- fits each value to today's control (numbers clamped and snapped to the
  step; options, toggles and colours must be valid) and skips the rest,
  logging which;
- ignores a config with another `configVersion`, as the homepage did;
- maps neko's sprite themes to coats, `wallpaperPreference` to
  `wp:current`, and advent's `adventCelebrated` and `adventLastSeen` to
  its `wp:advent:*` state; prefers the homepage's quest over the
  standalone page's;
- reloads, then says what came over ("From the old homepage: 3 changed
  settings, for Fish Tank and Snow.
  Your wallpaper, Fish Tank, is back.").

Tested by unit tests and end to end: the smoke test feeds a dump through
the panel's real file input.

### 10.21 macOS: live desktop and screen saver (`mac/`, owner idea)

One native Mac app that runs the same `web/` wallpapers as the desktop
background *and* as a screen saver, the way `android/` does for phones.
Research (Oct 2026) says: **possible, with one soft spot**. Details below;
what we haven't tried on a real Mac is marked *unverified*, and Phase M0
proves it before anything else is built.

#### Verdict

| Goal | Possible? | How | Risk |
|---|---|---|---|
| Live desktop background | **Yes** | One borderless `NSWindow` per display at the desktop window level, holding a `WKWebView` | Low. Plash-style apps do this today. |
| Static fallback and lock screen | **Yes** | `NSWorkspace.setDesktopImageURL(_:for:options:)`, public API | Low |
| Screen saver | **Yes, but fragile** | A `.saver` bundle (`ScreenSaverView` subclass) run by Apple's `legacyScreenSaver` host | **Medium–high**: Apple's host has open bugs (below) |
| Real "Set as wallpaper" picker entry like Android | **No** | macOS has no third-party live-wallpaper API | n/a: the app *is* the wallpaper |

#### What the research found

Desktop background:
- There is no wallpaper plug-in API. Every "live wallpaper" app for macOS
  puts its own window just above the desktop picture and below the icons:
  `NSWindow` with `level = CGWindowLevelForKey(.desktopWindow) + 1`
  (use the function, never a hard-coded number), `styleMask: .borderless`,
  `ignoresMouseEvents = true`, `collectionBehavior = [.canJoinAllSpaces,
  .stationary, .ignoresCycle]`, never key or main. One window per
  `NSScreen`. ([example of the technique](https://dev.to/gruffix/building-ambient-desktop-particles-for-macos-with-caemitterlayer))
- A window at that level does **not** show on the lock screen or login
  window; those use the desktop *picture*. So the app also sets a rendered
  still (the wallpaper's `thumb`-style frame) as the real desktop image:
  the lock screen, Mission Control and "app not running" all look right.
- `CGWindowListCreateImage` is going away (a 2026 report has it broken on
  the macOS 27 beta; [Apple forums](https://developer.apple.com/forums/thread/849969)).
  We don't need it: `WKWebView.takeSnapshot` renders the still.

Screen saver:
- `.saver` bundles still load on Tahoe, through `legacyScreenSaver`. An
  Apple engineer said no new app-extension screen saver API is coming in
  macOS 26 ([thread](https://developer.apple.com/forums/thread/787444)).
  Tahoe moved Screen Saver settings into a modal inside the Wallpaper pane,
  and the old `ScreenSaver-Settings` deep link no longer works.
- **Known host bugs** (all are Apple's, none has a code fix):
  - `WKWebView` in a saver: partial rendering and `setInterval` firing
    about once a second on Sonoma
    ([thread](https://developer.apple.com/forums/thread/736716)).
  - A `WKWebView` saver blank on the second display on Tahoe, and third-party
    savers stopping the second display from showing at all.
  - macOS 26.4: `WKWebView` content disappears after about 3 seconds
    (FB22353950, [thread](https://developer.apple.com/forums/thread/820860)).
  - The saver's **Options** button can do nothing (the
    [WebViewScreenSaver](https://github.com/liquidx/webviewscreensaver)
    README says the same), so settings can't live in the saver.
  - `legacyScreenSaver` is sandboxed: `CFPreferences` and files behave
    differently ([thread](https://developer.apple.com/forums/thread/119731)),
    and its `localStorage` isn't the app's.
- The Aerial saver gave up on `legacyScreenSaver` and uses Apple's private,
  undocumented app-extension API. We won't: private API means breakage on
  every OS update and no clean distribution.

#### Architecture

One Swift package, built with `xcodebuild`/`swift` from the Makefile. The
page code doesn't change: new host `?host=mac` (and `?host=mac-saver`), the
same way `?host=android` works (§6).

```
mac/
  Wallpapers.app        menu-bar agent (LSUIElement), owns everything live
    DesktopWindow       one per NSScreen: borderless, desktop level, WKWebView
    SettingsWindow      normal window, index.html?host=mac&panel=open
    MenuBar             picker with thumb.webp, "Surprise me", pause, quit
    Power               occlusion, lock, sleep, low-power, thermal, battery
    AssetScheme         WKURLSchemeHandler for wp://app/ (serves web/ from the bundle)
    BingJson            native fetch of Bing's archive, like Android's BingJson.kt
    StillMaker          renders the current scene to a PNG and sets it as the desktop image
  Wallpapers.saver      thin ScreenSaverView; no settings UI of its own
```

- **Serving `web/`:** a custom scheme (`wp://app/`), not `file://`, so every
  `WKWebView` in the app shares one `localStorage` origin and the CSP (§5)
  holds. No local HTTP server, no open port. `web/` is copied into the
  bundle at build time like Android's `SyncWeb`.
- **Settings:** the same panel in a normal window, as Android's
  `SettingsActivity`. The desktop window ignores the mouse, so the corner
  hot zones can't open it; the menu bar item and ⌘, do. All desktop windows
  follow changes through the existing `storage` events.
- **Saver settings, without an Options dialog:** the app mirrors every
  `wp:*` key to `~/Library/Application Support/Wallpapers/settings.json`
  (and a copy inside the saver's container, which is *unverified* to be
  writable: M0). The saver injects them with a `WKUserScript` at document
  start that fills `localStorage` before the page runs. No web code change.
- **Power, reusing §4.8:** the host already takes `WP.power({...})`.
  - `NSWindow.occlusionState` not visible (a full-screen app covers us) →
    `hidden`. Free, and the biggest saving.
  - Screen sleep, lock, fast user switching → `hidden`.
  - `ProcessInfo.isLowPowerModeEnabled` → `saver`; `thermalState` →
    `thermal`; IOKit `IOPSCopyPowerSourcesInfo` → `battery`.
  - Desktop gets Auto with a Medium ceiling at 30 fps on battery, High on
    power. The saver gets High.
- **Interactivity:** the window ignores clicks (they belong to Finder and
  the icons), but a global `NSEvent` mouse-moved monitor needs no
  permission, so pointer position is forwarded as pointer events.
  Fish follow the cursor, fireflies flee it. Clicks and keys don't reach
  the wallpaper, so `interactive` wallpapers (quest, neko's click games)
  get a "Play" button in the menu that opens them in a window.
- **Multi-display:** one manager per screen. Settings: *Same on all* (default)
  or *Different per display*. Hot-plug via `didChangeScreenParameters`.
- **Spaces and Stage Manager:** `canJoinAllSpaces` + `stationary` covers
  Spaces; Stage Manager and "Click wallpaper to reveal desktop" must be
  checked in M0 (*unverified*).

#### Saver strategy, in order of preference

1. **A: `WKWebView` inside the saver.** Simplest and shares all code. Works
   today on some macOS versions and breaks on others (26.4).
2. **B: Pre-rendered loop (the safety net, and a good idea anyway).** The
   app records a short seamless loop of the current wallpaper (HEVC, 10–30 s,
   per display size) with `WKWebView.takeSnapshot` or ScreenCaptureKit, and
   the saver just plays it with `AVPlayerLayer`. No `WKWebView` in
   `legacyScreenSaver` at all, so none of its bugs apply; near-zero CPU. The
   cost: it isn't truly live (time-of-day, Bing's image, Advent), so the
   app re-records on a schedule and when settings change. The saver
   picks B automatically if A's health check fails (frame counter stalls).
3. **C: Native Metal ports** of a few wallpapers. Last resort, as on Android.

The saver ships A with B as automatic fallback; M0 decides which is the
default on each macOS version.

#### Distribution (owner: no Apple Developer account)

- **Ad-hoc signed, not notarized.** No paid account, so no Developer ID and
  no notarization. A downloaded build carries the quarantine flag and
  Gatekeeper blocks it on first launch. Three ways round that, all in the
  README: (1) `make mac-install` builds from source on the user's own Mac,
  which is never quarantined and is the main path; (2) right-click → Open,
  or `xattr -dr com.apple.quarantine`, for the downloaded zip. (A Homebrew
  cask installed with `--no-quarantine`, as WebViewScreenSaver does, was
  considered and left out: a second repo and a token for little gain.)
- Hardened runtime stays on; the app needs only
  `com.apple.security.network.client` (Bing), like Android's `INTERNET`.
- No Mac App Store (a `.saver` can't go there, and it needs the paid account).
- Release: an ad-hoc signed zip and its checksum on the GitHub Release beside
  the APK and the extension zip. The app installs the `.saver` into
  `~/Library/Screen Savers/` with one button (no admin rights).
- Bundle ID `com.roadwaffle.wallpapers.mac`; saver
  `com.roadwaffle.wallpapers.mac.saver`.
- If an account arrives later, notarization is an extra step in
  `mac-release`; nothing else changes.
- **Releases are automatic** (built, §6.6 is the Android half). `make
  mac-release` (`mac/release.sh`) builds both architectures
  (`ARCHS="arm64 x86_64"`), then checks before it zips: the app and the saver
  inside it are each universal, both Info.plists carry `web/manifest.json`'s
  version, `web/` and the icon are in, and the signatures verify, again after
  unzipping the result elsewhere. Output: `dist/wallpapers-mac-<version>.zip`
  (made with `ditto`, which keeps the signature) and a `.sha256`.
  - **CI** (`ci.yml`): a `mac` job on `macos-26` runs `make mac-test` and
    `make mac-saver-test` (the hosted runner gives a web view a screen: the
    first run, for v0.8.0, passed all 41 checks), then `make mac-release`, and
    uploads the zip as the `wallpapers-mac` artifact on every run. The
    `release` job (a pushed `vX.Y.Z` tag matching the manifest) waits for
    `mac` but does not need it to succeed: a failed Mac build ships the
    Android app and extension without it, with a warning. Otherwise it
    attaches the zip and checksum to the same GitHub Release.
  - `gh workflow run ci.yml --ref <branch>` exercises the whole Mac job without
    tagging.

#### Make targets (new)

`mac-build`, `mac-run`, `mac-install` (app + saver, to `~/Applications` and
`~/Library/Screen Savers`), `mac-uninstall`, `mac-saver-test` (loads the
saver in a harness window and checks frames advance), `mac-bench`,
`mac-release` (universal build, checks, zip and checksum), `mac-saver-live`,
`mac-saver-log`. `make ci` stays Linux-able: the Swift targets run only in the
CI `mac` job.

#### Roadmap

- **M0 Spikes: prove it (one evening, throwaway code).** Each ends with a
  written result here, like Spike A0 in §6.1.
  - [ ] M0.1 Borderless desktop-level window with a `WKWebView` showing
    `index.html?w=aquarium`, on every display. → it animates behind the
    icons, survives Space swaps, Stage Manager and "Click wallpaper to
    reveal desktop", and a full-screen app pauses it.
  - [ ] M0.2 Minimal `.saver` with a `WKWebView` on the **current** macOS,
    on one and two displays, after 10 minutes. → record the frame rate, any
    blank frames, and whether it stops when the saver ends.
  - [ ] M0.3 Saver reading `settings.json` and bundled `web/`. → it shows the
    wallpaper picked in the app. Records what the sandbox allows.
  - [ ] M0.4 Pre-rendered loop played by the saver (strategy B). → a seamless
    10-second loop, no visible seam.
  - **Gate:** M0.1 passing is what makes this worth building (it did). The
    saver is a bonus: if strategy A fails on a macOS version, use B; if B
    fails too, ship desktop-only and say so in the README.
- **M1 Desktop app (the core). Built.**
  - [x] M1.1 `mac/Wallpapers/*.swift`, built by `mac/build.sh` with `swiftc`
    (no Xcode project, no packages). Menu-bar agent (`LSUIElement`), the
    `wp://app/` scheme handler (`AssetScheme.swift`), one window per display
    (`Desktop.swift`), `?host=mac`. → `make mac-run` shows the wallpaper.
  - [x] M1.2 Settings window = the page with the panel open
    (`SettingsWindow.swift`); one `WKWebsiteDataStore` shared by every web
    view. → a setting saved there is seen, and announced as a `storage`
    event, on the desktop (self-test). The app shows in the Dock only while
    settings is open.
  - [x] M1.3 Power (`Power.swift`): per-window occlusion, screen sleep, lock,
    saver running, the menu's Pause, Low Power Mode, thermal state and the
    internal battery become `WP.power({ hidden, saver, thermal, battery })`.
    → hidden freezes the canvas (0 pixels changed) and visible resumes it.
  - [x] M1.4 `Still.swift`: renders each display's page at native pixels and,
    on request only (menu, with a confirmation), makes it the desktop
    picture. Never automatic: it replaces the user's own picture.
  - [ ] M1.5 Launch at login: the menu item calls `SMAppService.mainApp`;
    **not yet tried**, since it changes the owner's login items.
  - [x] Beyond the plan: pointer forwarding (moves, and clicks on the bare
    desktop, found from the window list), menu bar picker with Surprise Me,
    Next, Previous, Pause, and `make mac-test`, a 16-check self-test that
    runs the real app against a throwaway store.
  - **Web change:** `bing.js` also fetches `bing.json` on `wp:` pages
    (it was `https?:` only), so the app's native archive is used; Bing's
    own host can't be fetched from a page.
  - **Not verified yet (needs a person at the Mac):** pointer forwarding with
    a real mouse (the self-test injects the events), Spaces and full-screen
    apps, a second display, Stage Manager, "Click wallpaper to reveal
    desktop", and Open at Login.
- **M2 Screen saver. Built** (`mac/Saver/`, `mac/SaverHarness/`).
  - [x] M2.1 `Wallpapers.saver`, strategy A (a `WKWebView`), built by
    `mac/build.sh` and carried inside the app (`Contents/Resources`). It shares
    `AssetScheme.swift` and `Power.swift` with the app, has its own copy of
    `web/` and a thumbnail for System Settings. `SaverInstall.swift` copies it to
    `~/Library/Screen Savers` (menu: Screen Saver → Install), and the app
    replaces an older installed copy at launch (compared by `WPBuild`, a hash
    of the binary in the saver's Info.plist), then restarts the host.
  - **Settings reach it as a file, not as storage.** The saver can read
    `~/Library/Application Support/Wallpapers/saver.json` in the real home
    (spike M0.3: that folder, the shared-users folder and `~/Library/Screen Savers`
    are readable; the app's preferences and `localStorage` are not).
    `SaverSync.swift` mirrors every `wp:` key a page writes (a user script
    wraps `Storage`, in every frame), a second after it settles, plus the
    menu's choices and the catalog. Sign-in tokens (`secrets`) and
    `wp:hinted` are left out. The saver seeds its own throwaway page storage
    from it before the page's scripts run.
  - **Choices** (menu, Screen Saver): *Same as the Desktop* (default; the
    page follows the mirrored `wp:current`, Seasonal included), *A Different
    One Each Time* (a pool that skips the blank, Jellyfin and Bing, which can't
    draw without a network; every 1/5/15/30 min; displays avoid each other's
    wallpaper, since one host process holds every display's view), or *One
    Wallpaper*; and *Show a Clock* (time and date, drifting to a new spot each
    minute, centred in fallback).
  - **Watchdog.** The page's frame counter is checked every 4 s; two stalls
    in a row reload it, the next rebuild the web view, the next fall back to a
    clock on black, retried every minute. A dead web-content process takes the
    same path. `stopAnimation` and the saver's start and stop notifications
    pause the page (`WP.power({ hidden })`), because macOS 26's host can leave
    a saver running after it ends.
  - **Options button:** Tahoe's does nothing; older macOS shows a sheet that
    points to the menu.
  - [x] M2.2 The pre-rendered video loop (strategy B) was **not needed**:
    strategy A works on 26.5.2. The watchdog's clock-on-black is the fallback,
    and B stays an option if a later macOS breaks A for good.
  - [x] M2.3 `make mac-saver-test` loads the built bundle outside Apple's host
    and checks the loading, chosen and followed wallpapers, Random across two
    displays, the clock, a page that draws, an Options sheet, the watchdog's
    three steps and stopping. `make mac-test` also covers the mirror (no
    secrets, the menu's choices) and the installer (install, outdated, replace),
    in scratch folders. `make mac-saver-live` runs the installed saver in the
    real host and reads its log.
  - **A new saver isn't listed until the wallpaper service rescans.** macOS 26
    reads `~/Library/Screen Savers` only when `WallpaperAgent` starts, so after
    installing the app restarts it (and `legacyScreenSaver`); launchd brings
    both back at once. Found by hand: the saver was valid and the agent had
    even built an entry for it, but System Settings didn't list it until the
    agent restarted.
  - **Choosing the saver is still manual.** macOS 26 keeps the choice in the
    wallpaper store, which has no public way in, and `com.apple.screensaver`
    `moduleDict` does nothing; the app opens the right System Settings pane.
  - **Not verified yet:** a long soak in the real host (the 26.4-style "content
    vanishes" bug did not show on 26.5.2 in a short run), a second display,
    and macOS 14 and 15.
- **M3 Polish and fun.**
  - [ ] M3.1 Pointer forwarding for interactive wallpapers.
  - [ ] M3.2 Per-display wallpapers; rotation every N minutes; hotkey.
  - [ ] M3.3 Menu-bar icon in the current wallpaper's accent (the player already
    reports it for Android's Material You).
  - [ ] M3.4 *Sleep-aware scenes*: Night Train and Lighthouse use `host.now()`;
    nothing to do. Check that the saver and desktop agree on the hour.
- **M4 Release. Built.** `make mac-release`, a CI `mac` job on `macos-26` and the
  release job attaching the zip and checksum (see Distribution), the README
  sections, and tests for the settings mirror (M2.3).

#### Fun ideas (only after M2)

- **Dock-to-saver handoff:** when the saver starts, it fades in the *same*
  wallpaper you were looking at, so the screen saver feels like the desktop
  "zooming out". (The app writes the current scene's seed with the settings.)
- **Hot corner as a toy:** with Mission Control's hot corner set to Start
  Screen Saver, moving to that corner is a free "show me the nice one".
- **Menu-bar weather glyph:** the icon shows a tiny snowflake or leaf when the
  wallpaper is Snow or Leaves.
- **Focus-mode scenes:** map macOS Focus (Do Not Disturb, Work, Sleep) to a
  wallpaper, using the Focus status API (needs a permission prompt; optional).
- **Lid-open ceremony:** a one-second flourish on wake.
- **Screenshot-friendly:** ⌥-click the menu item to copy the current frame
  to the clipboard, for sharing.

#### Spike results (macOS 26.5.2 Tahoe, Apple silicon, one display, Oct 2026)

**M0.1 desktop window: passes.** (the throwaway spike, since replaced by the app)
- Window level `CGWindowLevelForKey(.desktopWindow) + 1` (-2147483622) lands
  exactly between Apple's wallpaper (`Dock Wallpaper`, -2147483624) and
  Finder's icon window (-2147483603). Read from `CGWindowListCopyWindowInfo`,
  which needs no permission. Desktop widgets (Notification Center,
  -2147483601) are above the icons. Owner confirmed by eye: icons in front,
  fireflies animating.
- The page draws and animates in a plain `WKWebView` (`loadFileURL`), about
  60 fps `requestAnimationFrame`, about 1.5% CPU for the app plus the WebKit
  process on one display. The owner's current wallpaper is an Apple aerial
  video; our window covers it and Apple's keeps running underneath, so the
  app should also set a still picture (§Verdict) and not rely on hiding it.
- Screenshots of the desktop need Screen Recording permission for the
  terminal; use `WKWebView.takeSnapshot` for self-checks instead.

**M0.2 screen saver: passes, with two workarounds.** (the throwaway spike, since replaced by `mac/Saver`)
- Tahoe stores the chosen saver in the wallpaper store. Setting
  `com.apple.screensaver moduleDict` does nothing; the user picks it once in
  System Settings → Wallpaper → Screen Saver → Other. After that
  `open -a ScreenSaverEngine` runs it, which is how we test.
- `legacyScreenSaver` loads the `.saver` (ad-hoc signed, from
  `~/Library/Screen Savers/`) and the view's window is an
  `NSServiceViewControllerWindow`. Its sandbox home is
  `~/Library/Containers/com.apple.ScreenSaver.Engine.legacyScreenSaver/Data/`.
  Two view instances are created per start.
- **Gotcha 1:** `Bundle.resourceURL` is a *relative* URL there. `loadFileURL`
  raises on it and the host swallows the exception (the saver is just
  black, no log). Build the path from `bundlePath`.
- **Gotcha 2:** the host window reports `occlusionState` not visible, so
  WebKit hides the page and `requestAnimationFrame` runs exactly once.
  Calling `-[WKWebView _setWindowOcclusionDetectionEnabled:NO]` (private
  SPI, found by `responds(to:)`) fixes it: about 58 fps,
  `visibilityState` visible. It's one line, guarded by `responds(to:)`, so a
  missing selector degrades to strategy B.
- Still to check: a 10-minute soak (the 26.4-style "content vanishes"
  bug), a second display, and CPU.

#### Decisions (owner)

1. **No Apple Developer account:** ad-hoc signing, build-from-source first
   (see Distribution).
2. **Minimum macOS 14 (Sonoma).** `SMAppService` and current `WKWebView` APIs
   are fine.
3. **The desktop background is the must-have; the screen saver is a
   bonus** (owner, revised after M0): the wallpaper must truly sit behind
   the desktop icons, like the real wallpaper. If the saver can't be made
   reliable, ship the desktop app without it.

## Appendix A: legacy standalone pages, to bring back

The old per-wallpaper pages are replaced by deep links (§4.2). Their tuned
settings and keys are recorded here so Phases 3.8 (defaults) and 4.5
(declared keys) can bring them back. Each page assumed no status bar
(`statusBarHeight: 0`), which host insets now cover.

| Page | Tuned settings (standalone preset) | Keys and URL params |
|---|---|---|
| `snow.html` | Black background; `treeCount 0`, `maxSnowflakes 4000`, `spawnRate 0.4`, `snowSpeed 7`, `snowSpeedVariation 1.5`, `layerCount 10`, `windIntensity 8`, `accumulationRate 0.05`, `maxAccumulation 12`: a dense, treeless blizzard | `f` fullscreen |
| `leaves.html` | Background `#0b0a08`; `maxLeaves 90`, `spawnRate 0.07`, `fallSpeed 2`, `swayAmount 1.5`, `windIntensity 12`, `windDuration 240`, `preSeedPile`, `pileDepth 0.35`, `pileUnevenness 0.6`, `pileDensity 1.5`, `maxSettled 14000`, `leafOpacity 0.85` | `f` |
| `fireplace.html` | On a fresh run only: `brickBackground 'subtle'`, `logThickness 2.5` | `f` |
| `fishtank.html` | `population 'community'`, `fishCount 26`, `waterTheme 'planted'`, `hardscape 'both'`, `plantDensity 1.2`, `lightIntensity 1.05`, `cursorMode 'curious'`, `clickToFeed`; all effects on | `f` |
| `halloween.html` | `theme 'classic'`, `scenePreset 'graveyard'`, `pumpkinCount 13`, `batCount 40`, `ghostCount 5`, `zombieCount 4`, `webs false`, `grain 0.35`, `starCount 260`, `moonPhase 0.82`, `candyCount 40`, `leafCount 40` | `f` |
| `advent.html` | `layout 'scatter'`, `ceremony 'grand'`, `spotlightSeconds 8`, `ambient 'lively'`, `fps 30` | `←`/`→` ±1 day (Shift ±7), `↑`/`↓` ±1 month, `0` today, `t` next theme (Shift back), `r` replay today, `s` settings, `f`; a toast shows the date. `?date=YYYY-MM-DD`, `?theme=<id>` |
| `quest.html` | Separate storage key (`questStandaloneConfig`); `keyboard` and `clickToGuide` **on**, `companion 'fairy'`, `worldSize 'medium'`, `hud 'top'`, `story`, `transition 'scroll'`; touch controls off | `f`; `n` new quest; `h` next hero; `v` next look; `t` next hat; `m` companion; `p` palette; `c`/`o` settings; `?` key help; arrows/WASD, Space, `j`/`k`/`e`/`b`, Enter to play; click to send the hero; a ⚙️ button |

**Proposed for 3.8 (see Open questions):** the standalone values become
each wallpaper's `defaults.js` where they differ, since the standalone page
is now the primary host, with Quest's keyboard and click-to-guide on by
default.

