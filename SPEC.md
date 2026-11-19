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
3. **Android live wallpaper** (`android/`, built): the same web code behind
   the home screen.
4. **macOS desktop and screen saver** (`mac/`, §10.21, built).
5. **Windows desktop, tray app and screen saver** (`windows/`, §10.25,
   designed 2026-11-02; W0 passed, W1–W5 built by 2026-11-05: the app, the
   installer, the zip and the screen saver; first released in v0.11.0
   (2026-11-05); the owner's by-hand passes and W6, the two-monitor pass, remain).

> Status: **phases 1–9 done** (2026-10-23), except what needs the owner:
> measurements on a real phone (6.2's numbers, 6.4a), the first signed
> release (6.6), the switch-over itself (7.2), and trying Phase 8's touch
> and location, and Jellyfin, on a phone. The player, the stage, the panel
> and all 42 wallpapers run from `web/index.html`, as a Chrome new-tab extension, on
> GitHub Pages at https://nealhardesty.github.io/wallpapers/, and as an
> Android live wallpaper. Every wallpaper is tiered and within budget.
> Phase 11 (Harvest Valley, §10.22) added the 34th wallpaper for Thanksgiving.
> Weather (§10.2), World Clock (§10.3) and the Orrery (§10.26) were built
> 2026-11-05, making 37. The Cat vs. the Ornament (§10.27, 2026-11-06) is
> the first of four Christmas wallpapers, making 38; The Last Bulb on the
> Strand (§10.28, 2026-11-06) the second, making 39; Frost on the Glass
> (§10.29, 2026-11-06) the third, making 40; A Very Small Christmas
> (§10.30, 2026-11-06) the fourth, making 41. Sky Island (§10.31,
> 2026-11-11), a pixel-art town on an island in the sky, makes 42. Ice
> Patrol (§10.34, 2026-11-14), a flight over an ice world from the pilot's
> seat and the first wallpaper drawn with WebGL, makes 43. Sumo
> Championship (§10.35, 2026-11-15), a never-ending tournament as a moving
> woodblock print, makes 44. Pocket Hockey
> (§10.36, 2026-11-15), an invented league of three-on-three in top-down
> pixel art, makes 45. The Never-Ending Baseball Season (§10.37,
> 2026-11-15), a pixel-art league played a pitch at a time, makes 46.
> Wayfarer (§10.38, 2026-11-15), an endless walk through a cosy fantasy
> world, makes 47.
> Fresh Tracks (§10.39, 2026-11-15), a ski run that never ends and the
> third wallpaper drawn with WebGL, makes 48.
> Phase 10, the clock overlay (§4.9), was built 2026-10-28; §10 holds the
> other ideas.
> Windows (§10.25): the W0 spikes passed, and W1 (the desktop core: behind
> the icons on every monitor, the tray, the settings window, the self-test)
> was built 2026-11-03. W2 (monitors and power), W3 (the mouse) and W4
> (install, update, uninstall, the zip and the CI `win` job) were built
> 2026-11-04. W5 (the screen saver) was built 2026-11-05, and v0.11.0, the
> first release with the Windows app, went out the same day (PR #9 merged). The
> owner's by-hand passes (§10.25.16) and W6 (two monitors) remain.

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
  the day (§4.6), the weather forecast, the satellites and the wave
  and edit streams. Every online
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
| `cherry-blossoms` | cherry-logic.js, cherry-art.js, cherry-blossoms.js | ~1k lines | Rebuilt 2026-11-11 (§10.33): a bough of blossom from a seed, the sky of the hour, wind with gusts, petals that tumble and flutter and settle on the grass or float on the water (`CherryLogic`), unit-tested; follows `host.now()` for the clock sky; keys G, B, N, S, W; tap and drag |
| `halloween` | halloween.js, halloween.html | 178 KB | Interactive (mouse). Settings are already data-driven (`controlSpec()`). |
| `neko` | neko.js + `assets/neko/` (79 themes, 2,472 `.ico`, 20 MB) | 28 KB | Interactive. **Licensing, size and filename-case problems** (§7.3). Now the public-domain oneko bitmaps in sprites.js, recoloured per coat (§10.24). |
| `matrix` | matrix-logic.js, matrix.js | ~800 lines | Rebuilt 2026-11-11 as the film's code (§10.32): fixed cells lit by a passing wave, the 1999 glyphs as strokes (`MatrixLogic`), unit-tested; keys R, L, H; tap to splash |
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
| `harvest` | harvest-sky.js, harvest-art.js, harvest-actors.js, harvest.js | ~3k lines | Interactive (tap a tree, the scarecrow, the sky); pure sky and astronomy (`HarvestSky`), unit-tested; follows `host.now()`; keys G, H, W, S, M |

Added in November 2026, drawn in code (design in §10.2):

| id | Files | Size | Notes |
|---|---|---|---|
| `weather` | weather-data.js, weather-scenes.js, weather.js | ~1.9k lines | Network: `api.open-meteo.com` (+ the panel's geocoder); needs location; a labelled sample offline; pure data rules (`WeatherData`), unit-tested; interactive (tap a day); keys V, U, R |
| `world-clock` | world-land.js, world-atlas.js (generated), world-cities.js, world-clock-math.js, world-clock-art.js, world-clock-map.js, world-clock-faces.js, world-clock-board.js, world-clock.js | ~2.3k lines | No network; Natural Earth land (public domain); the sun, moon, terminator and zones (`WorldClockMath`), unit-tested; follows `host.now()`; interactive (tap a city); keys V, M, L |
| `orrery` | orrery-math.js, orrery-art.js, orrery-looks.js, orrery.js | ~2.3k lines | No network; Standish's Keplerian elements, the Moon, Jupiter's four, the zodiac and the seasons (`OrreryMath`), unit-tested; follows `host.now()` or time-lapse; interactive (tap a planet, drag the tilted view); keys = + − 0 L S V (§10.26) |

Added for Christmas, drawn in code (designs in §10.27–§10.30):

| id | Files | Size | Notes |
|---|---|---|---|
| `cat-ornament` | cat-ornament-logic.js, cat-ornament-cats.js, cat-ornament-room.js, cat-ornament.js | ~2.5k lines | Interactive (a tap's laser dot); nine named cats on one vector rig; the roster, the pendulum, the fall and the odds (`CatOrnamentLogic`), unit-tested; follows `host.now()` (Christmas Eve and Day); keys N, B, T, Z |
| `last-bulb` | last-bulb-logic.js, last-bulb-art.js, last-bulb.js | ~1.4k lines | Interactive (tap a bulb to jiggle it); a C9 strand whose last bulb is loose, along the rail, in rows, round the border or over a doorway; the flicker scripts, the filament and the strand's path (`LastBulbLogic`), unit-tested; follows `host.now()` (Christmas Eve and Day); keys L, O, D, N |
| `frost` | frost-logic.js, frost-art.js, frost.js | ~1k lines | Interactive (drag to draw in the frost, tap to breathe on it); fern frost grown tip by tip on an occupancy grid, the window and the doodles (`FrostLogic`), unit-tested; follows `host.now()` (Christmas Eve and Day); keys B, D, T |
| `small-christmas` | small-christmas-logic.js, small-christmas-art.js, small-christmas.js | ~800 lines | Interactive (tap the tree, the train, the floor); pixel art at its own resolution, scaled up pixelated; palettes, blink patterns, the train's oval and the hops (`SmallXmasLogic`), unit-tested; follows `host.now()` (the sleigh on Christmas Eve, presents on Christmas Day); keys T, M, L, S |
| `sky-island` | sky-island-logic.js, sky-island-art.js, sky-island-land.js, sky-island-actors.js, sky-island.js (and Harvest's harvest-sky.js) | ~3.5k lines | Interactive (tap a cat, a person, the lake, a house at night, the sky); 16-bit pixel art at its own resolution (a pixel is 2 CSS px on a laptop or 1080p), scaled up pixelated; a terraced island seen from above and in front, its underside, the sea of cloud and the ground far below all baked; the calendar (seasons, holidays, Easter, the owner's dates), the names and the island's three-tier layout from a seed (`SkyIslandLogic`), unit-tested over 240 layouts; follows `host.now()` (the hour, the season, every holiday); keys N, P, V, O, B, W, S, H |
| `ice-patrol` | ice-logic.js, ice-gl.js, ice-cockpit.js, ice-patrol.js | ~3k lines | The first on WebGL (§10.34): an endless snowfield from two baked noise fields, the same height formula in JavaScript and in the shaders (`IceLogic`), unit-tested; a 2D cockpit (struts, a winged console, switches that keep house) whose centre screen is a live scan of the real terrain; a 2D ridgeline fallback without WebGL; its own watch on the GPU; interactive (fly it by hand: keys and a drag; the autopilot takes it back after 5 s); keys W A S D, arrows, Q, E, X, T, V, R |
| `sumo` | sumo-logic.js, sumo-art.js, sumo.js | ~1.3k lines | No network; a league of invented wrestlers kept in `host.storage`, written in Japanese with an English gloss (§10.35); bouts and tournaments pure and seeded (`SumoLogic`), unit-tested; interactive (a tap throws a cushion); evening by `host.now()`; keys N, B |
| `pocket-hockey` | hockey-logic.js, hockey-art.js, pocket-hockey.js | ~2.4k lines | No network; an invented league of eight clubs and the game in progress kept in `host.storage` (§10.35); the league, the 60 Hz game (physics, steering, signature moves) and the seasons pure and seeded (`HockeyLogic`), unit-tested; top-down pixel art at its own resolution, scaled up pixelated, with its own 5×7 font; interactive (a tap throws something on the ice, or starts a wave); keys N, G, B, X, W |
| `baseball` | baseball-logic.js, baseball-league.js, baseball-talk.js, baseball-art.js, baseball.js | ~2.4k lines | No network; a league of eight invented clubs kept in `host.storage` (§10.37); every pitch, ball in play and box score pure and seeded (`BaseballLogic`, `BaseballLeague`), unit-tested; 16-bit pixel art at its own resolution with its own lettering, scaled up pixelated; interactive (a tap starts a wave); day, dusk and night by `host.now()`; keys N, S |
| `wayfarer` | way-logic.js, way-models.js, way-detail.js, way-actors.js, way-people.js, way-companions.js, way-gl.js, wayfarer.js | ~6.6k lines | The second on WebGL (§10.38): an endless road through nine kinds of country (which of them is a setting) with villages, walled cities, grand cities under a castle and landmarks along it, all a pure function of a seed (`WayLogic`), unit-tested; every shape modelled in code as triangles (`WayModels`, `WayActors`); built a 64 m square at a time as the walk reaches it, finer near the traveller; four cameras, one of them an orbit a drag turns; nine travellers (one changes shape, one goes unseen) and 46 companions, six at once, the named cats among them; day, night, weather and seasons; a flat 2D fallback without WebGL; its own watch on the GPU; interactive (drag to look around, or to turn the orbit); keys V, T, X, N, G |
| `ski-run` | ski-logic.js, ski-models.js, ski-gl.js, ski-run.js | ~4.6k lines | The third on WebGL (§10.39), with instancing: an endless ski run stitched from twelve kinds of section, one `height(x, z)` for the riders and the mesh (`SkiLogic`), riders moved by the hill (gravity, drag, the scrub of their edges) and held as the forces on them ask (lean from edge force, legs solved to skis that stay on the snow, skid, toe-side and heel-side), tricks, wipeouts, a stop for a drink at a grand lodge, cameras and a ski school all pure and unit-tested; trees, figures and props modelled in code (`SkiModels`); a flat 2D fallback without WebGL; its own watch on the GPU; interactive (carve by keys or a drag, tap to jump; the riders take it back after 4 s); keys A, D, arrows, J, V, T, X, G |

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
├── mac/                         # the macOS app and screen saver (§10.21, Swift)
├── windows/                     # the Windows app and tray (§10.25, C#): Wallpapers, Wallpapers.Core, Wallpapers.Tests
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
| stage → player | `saved {value}` | a wallpaper with `applySettings` saved its own settings (a key, a drag): the player must not take the write for another page's and rebuild it |
| stage → player | `key {key}` | a player key (`,` `[` `]` `f`) pressed while the stage has focus |
| stage → player | `error {id, message}` | boot failed; the player shows a toast and the stage anyway |
| player → stage | `settings` | open the wallpaper's settings |
| player → stage | `tier {tier}` | apply a tier's fps and DPR (the player rescales the iframe) |
| player → stage | `pause` / `resume` | stop and restart frames |

**The catalog** (`web/wallpapers/catalog.js`) lists every wallpaper in menu
order: `id`, `name`, `icon`, `scripts`, `make(host)`, an optional
`prepare(manager, host)` hook (run before `init()`), `background`,
`interactive`, `motion` (`'slow'` gets the slow fps cap), `network`
(hosts), `cost`, `disabled` (why), `pseudo` (Seasonal), and
`settingsScripts` (data its `settings.js` is built from, loaded before it in
the panel and the tests: World Clock's cities). A script path may leave the
wallpaper's folder (`'../core/clockface.js'`): the stage loads
`wallpapers/<path>`. It's one small
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
  (Appendix B). Export and Import carry per-display `wp:current@<key>`
  entries like any other `wp:` key; keys for monitors that another machine
  doesn't have are harmless.
- **URL parameters (decided).** They override for **this page load only**:
  nothing is persisted, the saved choice and Seasonal are untouched, and a
  reload without them returns to normal. They replace the old
  per-wallpaper pages; no `quest.html`-style stubs are kept.

  | Parameter | Effect |
  |---|---|
  | `w=<id>` | Show this wallpaper instead of the saved one, e.g. `index.html?w=fishtank`. An unknown id is ignored, with a console warning |
  | `panel=open` | Open the switcher and settings panel on load (closes as usual with `,` or `Esc`) |
  | `panel=gallery` | The same, opened on the gallery (§4.4) |
  | `date=YYYY-MM-DD`, `theme=<id>` | Passed to the wallpaper as `host.params`. Advent uses them for time travel and themes, e.g. `?w=advent&date=2026-12-25`. A time may follow (`T23:59` or `T23:59:50`), in local time, or in UTC with a `Z` (`2026-06-21T12:00:00Z`) |
  | `tier=low\|medium\|high` | Pin a performance tier for this load (§4.8), e.g. to see Low on a desktop |
  | `host=android`, `hud=1`, `thumb=1` | Host simulation (§4.3), performance HUD (§4.8), thumbnail mode (§4.7). The Windows app passes `host=windows` (and its saver `host=windows-saver`, W5) |
  | `insets=t,r,b,l` | CSS px kept clear on each edge, on any host (the Windows app passes its taskbar), e.g. `?w=harvest&insets=0,0,48,0`. Malformed values fall back to the host's default (48 px at the bottom on Android, else 0) |
  | `display=<key>` | the choice is kept per display, as `wp:current@<key>` (Windows' Different mode). With no value of its own it shows `wp:current`, then Seasonal. A key must match `[a-z0-9-]{1,40}`, else it is ignored |
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
  | Dec | advent, cat-ornament, last-bulb, frost, small-christmas: one a day, in turn (wins over snow's Dec–Apr) |

  Every month also lists **sky-island** (§10.31, 2026-11-11) after its own
  wallpaper: it dresses itself for the real season and holiday, so it
  takes every other day of the year (the month's own wallpaper on the 1st),
  and one day in six in December.

  It uses the local calendar month, so it is Northern-Hemisphere only. A
  month may list several (December's Christmas wallpapers): the day of the
  month picks one, in turn, so it changes at midnight like the month does.

### 4.3 Host (`WP.host`, built in `core/stage.js`)

One object, passed to every wallpaper's constructor and also available as
`WP.host`, so the wallpapers never know where they run:

```js
host = {
  kind: 'standalone' | 'extension' | 'android' | 'windows' | 'windows-saver',
  id: 'fishtank',                         // this stage's wallpaper
  params: { date, theme, … },             // URL parameters (§4.2)
  insets: { top, right, bottom, left },   // px kept clear: ?insets= (Windows' taskbar), Android's gesture bar; else 0
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
  - A stage's own `WP.settings.save` raises a `storage` event in the
    player (another document on the same storage), which the player
    takes for a change from another tab and answers with a rebuild. A
    wallpaper that applies settings live says so (`saved {value}`, the
    string it wrote) and the player lets that one write pass; found on
    Wayfarer 2026-11-16, where every orbit drag and every V, T or X
    started a new world (§10.38). Wallpapers without `applySettings` are
    rebuilt after their own saves as before.
- **Touch:**
  - Range sliders are `touch-action: pan-y`: a vertical swipe that starts
    on a slider scrolls the panel, only a sideways drag moves it.
  - The gallery is a grid, not a sideways strip: at 49 wallpapers the
    filmstrip it replaced (2026-11) took a long sideways scroll to cross,
    and touch had nothing else.
  - On Android's settings screen (`panel=open`) the corner gear is always shown (there is no hover or
    corner-hold), 10% of the height down to clear the status bar, so a closed panel can always be reopened. The live wallpaper itself never shows it.
- **Look:**
  - Smoked glass over the live wallpaper.
  - **Its accent follows the wallpaper on screen** (`accent` in the
    catalog): fire orange, aurora green, petal pink. Each gallery tile is
    washed in its own wallpaper's colour.
  - System rounded type.
  - A right-hand drawer on desktop; a bottom sheet on phones.
- **Layout, top to bottom:**
  - The header is the **switcher**: the wallpaper on screen as a card (its
    thumbnail, §4.7, its name, and "6 of 49"), with ‹ › to step and × to
    close. A click on the card opens the **gallery** in place of the
    settings; another goes back.
  - **The gallery.** The drawer widens to 780 px (the bottom sheet grows
    to 86% of the height) into a grid of every wallpaper, Seasonal first
    (captioned with this month's pick). Over it, sticky: a search field
    (every word must match the name or id), 🎲 *Surprise me* (any tile
    shown but the current one), and chips, each with its count for the
    search: All, Interactive (`interactive`), Calm (`motion: 'slow'`),
    Live data (`network`) and Easy on battery (`WP.costs` 1). All read
    from the catalog; nothing is tagged by hand. Tiles carry 👆, 📡 and
    ⚡ badges; hovering or focusing one plays a live preview. Keys, through
    `WP.panel.key` before the player's own: typing anywhere goes to the
    search (`,`, `?`, `[` and `]` keep their meaning), arrows move through
    the grid as laid out (↓ from the search to the first match, ↑ from the
    top row back to it), Enter picks (in the search, the first match), and
    `Esc` clears the search, then goes back to the settings, then closes.
    A pick goes back to the settings. The chip is kept between visits,
    unless it would hide the wallpaper on screen; the search is not.
  - The settings, grouped, with Advanced collapsed. A dot appears next to
    any changed setting; clicking it resets that setting, and its tooltip
    names the default.
  - Performance (Auto, Low, Medium, High, §4.8), Reset (two clicks, no
    blocking dialog), Export and Import (all settings as JSON, e.g. to move
    a tuned setup to the phone), and key hints, hidden on touch screens.
- **Opening it:**
  - `,` toggles it; `Esc` closes it (from the gallery, goes back first); `?panel=open` (or `gallery`) opens it on load, as soon as the player mounts rather than when the wallpaper is ready, so a slow or failing wallpaper still leaves its settings reachable (the Android settings screen relies on it).
  - On a touch screen, a long press in either right-hand corner (the top can sit under Safari's status bar).
  - iOS Safari turns a long press into a text selection and callout, which would swallow the hold, so `theme.css` switches selection, the callout and the tap highlight off (text inputs excepted). To debug on a phone: Settings → Safari → Advanced → Web Inspector, then Develop → the device in desktop Safari.
  - iPhone Safari has no fullscreen API for pages (iPad does), so `f` and the left-hand corners toast a pointer to Add to Home Screen instead.
  - With a mouse, a ⚙︎ gear fades in when the pointer nears either of them.
  - The left-hand corners do the same for fullscreen: a ⛶ button for a mouse, a long press on touch (no buttons on Android).
  - While it's open, wallpaper keys are suspended.
  - **Never on Android's live wallpaper itself** (`host=android` without
    `panel=`): behind the launcher, the corners are the home screen's, and
    a hold there kept opening the panel over it (2026-11). The corner
    keys (`,`, `c`, `f`) do nothing there, and there's no first-run hint;
    settings are the app's own screen. Smoke: a corner hold there opens
    nothing, and still opens the panel in a browser.

```
┌────────────────────────────────────┐
│ [▣ 🐠 Fish Tank      ⌄] ‹ ›    ×   │  ← switcher: a click opens the gallery
│     17 of 49 · all wallpapers      │
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
| Remote Desktop | — (the Windows app passes `WP.power({ remote })`) | — | Ceiling Low, no fps cap of its own; reason `remote desktop` |
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
| fireplace | `haze` (high), `smoke` (medium) | Coal glows baked per heat level; each log, the coal bed and the grate baked once per resize, only their glow zones' alpha changing per frame (§10.23); sparks and coals × density; the heat haze (strips of the frame drawn back a pixel aside) on High only |
| quest | `crt` (high) | Palette proxy every tier; light map half size on Low; idles while paused; fixed 60 Hz steps (up to 20 catch-up) |
| advent | — | Doors-at-rest layer, baked glow; treat refreshes, particles and confetti × density; idles between its own capped frames (never fully still: today's treat plays) |
| leaves | — | Drift capped at 6k (Medium) and 2k (Low), shallower banks of the same shape; falling × density |
| matrix | `depth`, `glow` (medium) | Every glyph at sixteen brightness steps and the bloomed head baked once as a white mask per layer and tinted per hue (the rainbow's twelve cost a few fills); each layer on its own canvas where only the cells whose light or symbol changed are redrawn (a flat 1999 trail is under a hundred cells a frame; a fading trail a couple of thousand), then two blits; paced at the fps setting (30) through idleUntil; columns × density; Low drops the back layer and the bloom |
| snow, rain, fireflies | — | Spawn rate and cap × density; fireflies' glow sprites 32/64/128 px by tier |
| cherry-blossoms | — | The still scene (sky, hills, tree) on a canvas of its own behind, painted per resize; the petals baked pre-rotated (three shapes × twelve turns × three flutter widths per colour), so each is an axis-aligned blit; the settled petals drawn once onto the ground's layer (washed with the ground's colour every 150 so the oldest fade); a frame clears the front canvas, blits the ground strip and draws each petal once; petals × density |
| starfield | — | Stars × density, joining at the far plane; `onScroll` |
| mountains, parallax-clouds | — | No density (the layers are the composition, and they cost ~1%); `onScroll` |
| neko | — | With every cat asleep and no yarn about, idles until the next breath or the next cat sets off |
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
| weather | — | Sky a quarter-size gradient on its own layer, painted only when it changes; the forecast one cached layer, rebuilt once a minute; clouds, rain, snow × density, pooled; with nothing moving in the sky, only the scenes' squares repaint; ≤ 20 fps through idleUntil, once a minute under reduced motion |
| world-clock | `cityLights`, `twilight` (medium) | Background, land and graticule per resize and look; the night once a minute (a 1° altitude grid scaled up, or polygons), lights masked into it; a composed base per centre; once a second, idle between; only recentring, flaps and crossfades take more frames; stars and city lights × density |
| orrery | `glow`, `belt` (medium) | Starfield, paper or study per resize and look; the plane (orbits, zodiac ring, a quiet belt band) cached per camera; sprites per size bucket (planets, gears); live and still it draws once a minute, with the corona and the belt shimmering at ~7 fps in deep space unless motion is reduced or the effects are shed; belt rocks × density, eased; time-lapse and drift at the slow-motion rate |
| cat-ornament | `firelight` (high) | Room, the fire's and the tree's glow and the standing tree (halos, ornaments, star) one layer; bulbs twinkle over it; a still cat is a cached picture (quantized, at most every 0.15 s); a calm room paced at 15 fps (30 on a fast display) via idleUntil; physics on a 60 Hz step |
| last-bulb | — | The wall (painted at full light, multiplied by a light map of every bulb's pool) baked lit, dark (the strand out) and, for the corner round the last bulb, lit by it too; bulbs, the tag and the plug are sprites (dark, lit with its bloom, ember); still, it sends no frames at all (idleUntil the next event); a flicker redraws only that corner; a draft swings the bulbs at 30 fps on a 60 Hz step |
| frost | `glints` (medium) | Three canvases: the room and frost (redrawn ten times a second at most, six on a slow tier), the frame (baked once) and the snow (every frame, only while it's snowing, else idleUntil the next tenth); the room's blur, the bokeh discs and the frost's backlit colour baked per resize; frost accumulates on a mask (new ice only) and is re-tinted through it when it changes; tips capped at 9,000 × density; a render-scale change keeps the frost, rescaled; snow × density |
| small-christmas | — | The canvas is the picture's own pixels (a few hundred across), scaled up by CSS with `image-rendering: pixelated`, so a frame is tiny; 12 fps by default (a setting), idleUntil between frames; sky, moon and snow floor one baked layer; every sprite baked per palette; scanlines a baked overlay canvas; snow × density |
| harvest | `mist`, `beams` (medium) | Land is one baked layer per resize; trees, leaves, apples, geese and clouds are baked sprites; the world is washed once per frame with the hour's light; leaves, apples, smoke, sparks and flocks × density; squirrels × (0.5 + 0.5 density) |
| sky-island | — | The canvas is the picture's own pixels (2 CSS px each on a laptop or 1080p, 3 at 1440p, 4 at 4K, 1 on a phone), scaled up pixelated; the terrain (three tiers, their cliffs, the underside, the water) is one bake per season, the roots three sway frames, the sea of cloud two tileable strips and the ground one, rebaked with the light; everything that stands still (houses, trees, lamps, props, trimmings) is baked into one layer per street band, drawn in turn with whoever moves (trees are drawn live, swaying, only on High); the sky is a dithered bake redone as the light changes, the stars four baked twinkle frames; the night is one `source-atop` wash over the island's scratch, with the lit windows and lamps one glow layer redone only when the lit set changes; a passing island is one bake with a few live bits; 20 fps by default (a setting), 12 on Low, paced on a steady timeline through idleUntil; folk × (0.4 + 0.6 density), strays, wildlife, rain, snow, leaves, fireflies × density. Bench 2026-11-11 (v2): Low 21%, Medium 38%, High 46% |
| ice-patrol | `shadows`, `sparkle` (medium) | WebGL: one grid drawn nine times (96, 64 or 48 cells a side by density), heights and slopes from two noise textures; shadows ten marched steps on High, six on Medium, compiled out when shed (after fading); flakes × density, wrapped in the vertex shader; the cockpit frame painted per light step, the gauges at 15 Hz (8 on Low) on a strip of their own, each instrument only when its reading changes; the terrain scan a 144² map (80² on Low) scrolled by cells, four rows (two) rescanned a tick; lamp halos one sprite a colour; a few dozen height lookups a frame on the main thread. The GPU is watched by the wallpaper itself (late frames give up shadows, then render scale to 0.4), since the governor only times callbacks; software renderers start there. No WebGL: 34 ridgelines a frame in 2D |
| sumo | — | The hall is one cached canvas (rebuilt on resize, tier and at dusk); a frame draws it, three jointed figures and a few marks. The crowd's rows and the cushions thrown follow density |
| pocket-hockey | — | The canvas is the picture's own pixels (about 427 × 267 on a laptop, 206 × 458 on an upright phone; a pixel is 3 CSS px at 1280 × 800, in half steps below that), scaled up pixelated. The arena (ice, lines, boards, benches, a crowd of some thousands) is one bake a game; a working copy of it takes the skate marks and the resurfacer's stripes, so a frame is one blit of that, a dozen kept sprites, and lettering set once a line and kept. The round's other games are stepped 4 ms a frame. Hats, paper, spray, camera flashes and skate marks × density. Bench 2026-11-15 on a loaded machine (Snow beside it for scale: 20%, 24%, 60%): Low 14%, Medium 21%, High 44% |
| baseball | — | The canvas is the picture's own pixels (about 3 CSS px each on a laptop), scaled up pixelated; the park (sky, stands, crowd, turf, fence) is one bake per game, size and light, with the crowd on its feet a second; the scoreboard and all the captions are two more canvases redrawn only when their words change; a frame blits those and draws about thirty men of a dozen rectangles each. The crowd, fireworks, confetti and rain follow density |
| wayfarer | `shadows`, `mirror` (medium) | *(Upgraded 2026-11-15, §10.38: fine scenery within 18 m of the road in the 3×3 squares about the traveller on High, 9 m on Medium, none on Low; fine houses on High only; the finest figures for the traveller and the nearest four townsfolk on High, one on Medium, none on Low; lite animals beyond 16 m, 6.5 m on Medium, always on Low; townsfolk drawn to 160, 55 and 30 m; measured 427k/206k/71k triangles a frame on an open road and 447k/223k/101k at worst in a grand city's square; the deep forest, added 2026-11-16, 445k/216k/77k in a far orbit in autumn.)* WebGL: the land as squares of triangles built on the main thread as the walk reaches them (in steps of a few things at a time, 3 ms of building a frame at most, so even a city's square never holds a frame up) and drawn in one call each. High: 7×7 near squares of 64 m inside 9×9 coarse 256 m squares, land drawn to 1040 m, shadows from a 2048² picture 110 m across. Medium: 5×5 inside 7×7, to 790 m, a fifth of the trees and a third of the small plants gone, shadows 1024² over 70 m. Low: 5×5 inside 5×5, to 530 m, half the trees and two thirds of the plants gone, the near ground 4 m to a cell instead of 2, a third fewer townsfolk, no shadows, no clouds in the water. Far squares carry houses with their trimmings left off and a third of the trees as four or ten triangles each. Everyone who moves and is in front of the camera is posed on the main thread into one buffer (2,000 to 12,000 triangles) and drawn in one call. The shadow picture holds only what stands on the ground in the squares its box touches, depth in three bytes, compiled out when shed (after fading). Triangles a frame, shadow pass included, at 1280×800 (forest at night / city by day / lake): High 307k / 278k / 204k, Medium 143k / 198k / 115k, Low 103k / 101k / 57k (on a software renderer; before the second pass it was 436k / 444k / 358k, 293k / 299k / 262k and 214k / 198k / 130k). The GPU is watched by the wallpaper itself (late frames give up shadows, then render scale to 0.4, then the outer rings of squares); software renderers start there. No WebGL: 30 slices of ground, the road and the nearest trees and houses as cut-outs, in 2D |
| ski-run | `shadows`, `sparkle` (medium) | WebGL with instancing: 61 chunks of ground mesh at four levels of detail, built one or two a frame as the run goes by; trees as instances of 15 models, sorted into batches and culled on the main thread each frame (a few thousand), their detail distances and far thinning × density; riders and the lift stamped into one soup; one shadow map (2048 High, 1024 Medium), compiled out when shed (after fading); spray and flakes × density. The ground's grid thins by tier (113, 69 or 49 columns); far riders are stamped from plainer parts; trees are re-batched every 2 to 4 frames. About 75, 230 and 420 thousand triangles a frame on Low, Medium and High in some 100 draw calls (§10.39). The GPU is watched by the wallpaper itself, as Ice Patrol's. No WebGL: some 550 strips of slope, the trees and the riders a frame in 2D |

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

A collapsed row right under the header, above the wallpaper's own settings
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
- **Position of the section:** under the header (the filmstrip, before the gallery), not above Performance.
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
    worth telling apart (0.5.0 for Phase 5). `WP.VERSION` (`core/wp.js`)
    and Jellyfin's `VERSION` are bumped with it; the tests keep all three
    equal. The panel's last line shows it ("Wallpapers 0.21.0").
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
| Neko sprites (79 themes, 20 MB) | Copied from an MIT repo, but that repo doesn't credit the sprites; they trace back to decades of Neko skin packs by many authors. Several themes are trademarked characters (Sonic, Pac-Man, Metroid, Zelda, Doom, TIE fighter, Coke). Filenames have inconsistent case (`Awake.ico` vs `awake.ico`): 78 of 79 themes break on case-sensitive hosts such as Android and Linux. | **Done (phase 4.6; art replaced in §10.24).** None of the 79 themes were imported. The cat is now the one set of original Neko bitmaps that is plainly public domain (Gotoh, Koba and Kato, via oneko), 12 KB in `sprites.js`, recoloured in code for eight coats. |
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

Designed in §4.9; built 2026-10-28. Each task is done only when `make ci`
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

**As built:** three views (`view`, key V): day cards (3–10, wrapping into up to three rows on a phone; tap one for its hours, tap outside to go back), a 24-hour ribbon (smooth temperature curve, rain-chance bars, night shading from `is_day`, sunrise and sunset markers, a scene every three hours) and Now (large, with a table of wind, humidity, UV, sunrise and sunset, and a strip of the next days). Fifteen scenes, one per kind, pure functions of time over baked sprites, with night versions. A snowy day's amount is its fresh snow (`snowfall_sum`, cm or in), not its water. The sky is the current hour's `sky()` phase and kind, crossfading over 2.5 s; over it an ambient layer (`ambient`: off, subtle, full) of soft clouds, rain, snow or hail, fog sheets, lightning, stars and the real moon phase. Cards: glass (darker over a bright sky so white text reads), solid or minimal. Always fetched in metric (10 days, so no setting needs a new request) and converted for display, so `U` switches units without the network. Cached in `host.storage` with its place; a cache for another place isn't shown; an old cache's "now" comes from its hourly forecast. Refreshed every `refreshMinutes` while frames run (so never while hidden, and once on return), retried after 5 minutes on a failure, `R` at most once a minute. States: "Sample forecast · set a place in ⚙︎ settings", the sample dimmed with "Getting the forecast…", "updated 3 h ago · offline", "Couldn't reach Open-Meteo · sample forecast"; the panel's status line says the same at more length. "Weather data by Open-Meteo.com" in the bottom corner, always; the header line ("55° · Clear") sits on the same soft shade, in full white over a bright sky. Frames: 20 fps with rain, snow or lightning outside, 12 with only clouds drifting, 10 with only the scenes moving. Bench (phone, 4× throttle, the sample's clear first day): 2.7% Low, 3.9% Medium, 8.6% High (⚡); a cloudy sky is about 16% at High, rain or snow about 29%, so the catalog says `cost: 'medium'`.

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

**As built (November 2026):** three views (`view`, key V). **The map**: the
world filling the width, centred on Here (its zone's listed city, else its offset's longitude),
Greenwich, the Pacific or any chosen city (key M), letterboxed into stars on
tall screens; on a phone the home's time is large in the sky above and the
labels sit in the sky on leader lines, leaving the map clear. Four looks
(key L): night lights, atlas (land coloured by latitude), blueprint (a dashed
terminator) and old paper (an engraved, hatched night). The night is a smooth
fade through civil, nautical and astronomical twilight (from the sun's
altitude on a 1° grid, scaled up) or the three bands as polygons; city lights
are a seeded speckle clustered round every listed city, clipped to the land,
each lit by its own sun's depth (past 4° with the bands, a smooth fade from
−2.5° to −10° with the soft night). Three cached layers, built when the map is
first drawn and let go while another view shows: the land (per resize and
look), the night (darkness, hatching, lights and terminator in one canvas,
once a minute) and the base (the background with the map band composed over
it for the centre); they're kept at a capped scale (at most the pixel ratio,
4096 px wide, and ~22 M pixels between them), so a 2560×1440 screen at 2×
holds about 140 MB of canvases instead of 580, and its first frame takes
~390 ms instead of ~690 (headless Chrome). The labels draw at full resolution.
The slow work runs outside the frames: the layers and the night on start,
resize and a settings change, and the minute's rebuild on a timer just past
the minute (a one-pixel read makes the deferred drawing happen there, not
in the next frame's `drawImage`). A frame a second that took 20–100 ms once
a minute read to Auto's governor as too heavy (its p90 over 2 s is just
those two frames), so it stepped down and crossfaded at full rate. The sun's glow sits at the subsolar point, the moon at the
sub-lunar point in its phase (`WorldClockMath.sublunar`, the low-precision
series: within a degree or so of the eclipse of 8 April 2024 in the tests).
Each city is a dot and a card (name, time, the weekday where it isn't home's,
offset, ☀/twilight/☾), laid out greedily round its dot, compact when space
runs out, keeping last time's spot. Tap a city and it's home for the session
(highlighted, the others' weekdays against it) and the map eases round to it;
tap it again to go back. **Faces**: a grid with the column count that gives
the biggest dials; each dial is that city's sky from the sun's altitude
there, with stars at night and a sun or moon at six; classic, modern or
minimal. **The board**: split flaps, a row per city, columns dropped on narrow
screens and re-laid out the second a city rolls into another day (the DAY column) or an offset widens; a digit steps through the digits between, a new board flips in from
blank. Cities are chips per region in the panel (`settingsScripts` loads
world-cities.js for it); custom zones are `Label=Area/City`, placed at a
listed city in that zone (else on the equator at their offset, as a ring),
with any bad one named in the panel's status. `?date=` with `Z` pins a moment
for the smoke checks (the June solstice, the March equinox). Bench (phone, 4×
throttle): 1.6% Low, 1.2% Medium, 1.1% High; the night's rebuild once a minute
is the p95.

**Shape, zoom and an atlas (owner request, November 2026):**
- `mapFit: 'stretch'` pulls the map to the safe area's height (a squeeze on
  screens wider than 2:1): no stars above and below, and no hero time.
- `zoom` (1–8×) makes the map `zoom` screens wide and puts `zoomOn` in the
  middle as far as the map's edges allow: `home` (the Centred-on place or a
  tapped city, at its latitude, `centerLat()`), or the subsolar or sublunar
  point (it follows them a minute at a time). Zoomed, the whole world at
  that scale is too big to cache, so the land and night layers are the
  screen's size, drawn for the view through `eachCopy()` (once per copy of
  the world on screen, so the antimeridian wraps) and redrawn when the view
  moves; the centre jumps instead of easing, Android's swipes don't pan it,
  and only the cities in view get cards. Line widths grow with √zoom.
- `borders` (1:50m land boundaries, disputed ones dashed) and `provinces`
  (1:10m first-level lines for the US, Canada, Japan, Australia, Germany,
  France's and Italy's and Spain's regions, Poland, Portugal, Austria,
  Switzerland, the Netherlands, Sweden, Norway, Czechia, and Britain's
  nations and English regions), clipped to the 1:110m land, are in the land
  layer. `placeLabels`: `largest` (each country's largest city) or `major`
  (and all over 3 million), from `world-atlas.js`: biggest first, right of
  the dot else left, skipping any that overlap or sit on a clock city;
  capitals bold; laid out again only when the view changes.
- `world-atlas.js` (~100 KB) is generated by `make world-atlas`
  (`tools/world-atlas.mjs`, Natural Earth v5.1.2, simplified to 0.05°).
  Smoke: `stretched, zoomed on home, the sun or the moon; borders, provinces
  and city names`.

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
    no network. *Built (November 2026): §10.26.*
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
  glides round the outside), and the flock glides now and then, the glide
  starting at the leader and running back down each arm. **Each goose is its
  own bird** (`irregularity`, 0..2, default 1; 0 is a drilled V): its own
  wingbeat rate, a few percent either side of the flock's, phase-coupled to
  a beat behind the goose ahead with a strength that comes and goes, so the
  ripple drifts out of step and locks back in (the coupling reads the phases
  at the start of the step, or at 10 fps it lags a third of a beat); short solo
  glides, then a quicker beat to catch up; its place held on a soft,
  overshooting spring with a slow random-walk wander, and its own pitch as it
  rises and sinks in it; the V breathing open and drawn in; jinks that the
  geese behind take up a moment later, smaller each time; gusts jostling the
  tips of the arms most; neighbours overtaking one another, swinging wide to
  pass; a ragged flock pulling itself into a V, the furthest forward leading;
  and **whiffling**: now and then a goose rolls belly-up and side-slips to shed
  height, then rights itself, and sometimes the ones behind follow (`R` sets
  one off). `fit` keeps room for all of it (the widest breath and the most
  straying allowed, `slack`, both fixed when the flock spawns), so no goose
  ever dips behind the hills; squirrels who
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
- **The chase (owner request, November 2026):** `catChases` times an hour
  on average (default 10, up to 120 because in real life cats are always at
  it; never in the first 45 s, or the first half-interval if that's
  shorter; 0 turns it off; `S` sets one off),
  the nearest cat not on a roof (one already watching counts double) goes
  after a squirrel in plain view: it crouches low with its tail lashing
  (longer if it was asleep), wiggles, then gallops (bounding, tail
  streaming) a little slower than the squirrel, which drops what it carries
  and flees off the far edge. The cat follows it off the screen, stays out
  8–22 s, strolls back in from the same side to the nearest patch of ground,
  and naps for 2½–6 minutes. One chase at a time; a resize leaves a chase
  alone. Smoke: `a cat chases a squirrel off the screen, comes back, and naps`.
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
  fall, squirrels, turkeys), cats, squirrel chases, leaves, autumn colours, wind, mist,
  sunbeams, callouts, tap to shake, and (Advanced) the horizon.
- **Callouts:** `host.toast` for the holiday, a notable full moon (once a
  day), the Great Pumpkin, and the keys: `G` wait for the Great Pumpkin, `H`
  call the geese, `W` a gust, `S` a cat goes after a squirrel, `M` what the moon's doing (name, how much is lit,
  sunrise and sunset). Off with the Callouts setting.
- **Input:** a tap shakes the nearest apple tree (apples and leaves fall),
  scares the crow off the scarecrow, or calls a flock from the empty sky.
  Touch can be switched off.
- **Cost:** medium by design, low in practice (4.4% busy on Low, 13% on High
  at 4× throttle). Effects `mist` and `beams` shed on Low. Leaves, apples,
  smoke, sparks and flocks scale with `density`.
- **Why seasonal November:** the fish tank was a placeholder there.
- **The Mac saver's "stroke" (owner report, 2026-11-11):** now and then
  the saver showed "just lines and a spinning windmill with nothing else in
  the right place". Everything that survived is drawn live from vectors
  (the mill, the bunting, the lamp heads, the animals); everything that
  vanished is a baked canvas (the land, the tree, leaf and apple sprites,
  the moon, the geese) or had been placed by a reflow. That is what a
  WebKit view does when its GPU process dies or its canvas surfaces are
  purged (the saver's window is "not visible" to the host, so its page is
  a candidate): every canvas goes blank at once, and nothing in the page is
  told, except through `contextlost`/`contextrestored` on the visible
  canvas where WebKit supports them. Two guards: the `contextrestored`
  event rebakes everything, and every four seconds a probe reads one pixel
  of the land where it is always opaque (below the horizon, and the bottom
  row); both transparent means the bakes are gone, and `recover()` lays
  out again (`resize()`, which keeps the cast in place, resets the moon
  and tone caches, and the smoke test's drill wipes every layer and sees
  it come back within four seconds). The second guard: a web view whose
  frame is not set yet reports a 0 × 0 window; the first layout then
  scaled every sprite by nothing and the next `resize()` reflowed the
  cast by infinity, which is also "nothing in the right place". A window
  under 16 px now gets no layout, no frame and no seed until a real size
  comes, when it is laid out and seeded as on a first start.

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

**More wood, and a fire that behaves (owner request, 2026-11-11: "the
logs need more options (like broken logs, half logs, sticks etc). The fire
itself could be more realistic"; research in the session's brief: how
wood is stacked and burns, buoyant-flame puffing, the blue at the base;
configVersion 2).**
- **Pieces** (`pieces`, a multi-select; `pickWood` filters the palette's
  mix): rounds, splits (halves and quarters), kindling sticks and twigs
  (thin, short, placed by the stack, one knot or none, no stubs), snapped
  ends (`torn`: the shown end's outline ragged at 0.3 and, instead of
  rings, splinters of pale wood fanning from the pith with torn fibres
  between), and punky wood (a species: rotten through, grey-brown, bleached
  bark, few rings). Logs laid across the stack (`endOn`) show nearly their
  whole end (`faceRx` 0.92 R).
- **Stacks** (`stack`, key W, since K is the player's; `FireplaceWood.stack`, pure and
  unit-tested): the heap (the old rows, kindling on top of a big one), a
  log cabin (long logs, logs laid across them end-on, long logs again), a
  teepee (leaning from both sides to an apex, twigs inside), top-down (big
  rounds under, splits, then sticks and twigs on top), a lean-to (splits
  leaning on one big log), a backlog (one great round at the back with two
  or three in front) or kindling alone. Every stack is a list of shapes,
  back to front, for `makeLog`.
- **The flame:** *Tongues* draws each sprite taller than wide, more while
  it is young and hot (a column) and less as it breaks up (0 is the old
  round, gassy fire); *Puffing* modulates every root's strength and the
  emission at the puffing rate of a buoyant flame (1.5/√D Hz for a hearth
  D metres across, about two a second here), each root a little off the
  others' beat, so tongues detach; *Blue at the roots* draws a blue sprite
  under each root where the gas burns clean before it soots, faint in a
  blaze and plainer as the fire dies down; *Heat haze* (`haze`, an effect
  on High) draws strips of the frame above the wood a pixel or two to one
  side, swaying with time and height, so the wall wobbles through the hot
  air.
- **The burn** (`burn: 'cycle'`, `burnMinutes`, key L): the fire's level
  (`fireLevel`) falls from 1 to 0.35 over the cycle (emission, flame life
  and every root follow it; the blue grows), then the topmost log burns
  through and drops into the heap with a burst of sparks and a flare of the
  roots under it, and a fresh log falls from above onto the stack, lands
  with sparks, steams from its ends for twenty-five seconds (white puffs,
  the smoke system with a `steam` flag and its own sprite) and chars as it
  catches (re-dressed and re-baked six times over seventy seconds, from
  bare wood to the Char setting), while the level climbs back over fifty
  seconds. The heap keeps at most three fresh logs; the oldest is buried.
  Steady fires (the default) stay at level 1.

Costs: a 60–70 ms bake per resize on a desktop, about 3.5 MP of layers at
10 logs; per frame, one blit per log plus about three per zone; the haze
about forty strip blits of the frame's width on High only. Bench before
the 2026-11-11 additions 4.7 / 9.0 / 18.7% busy.

Hard-won:
- `destination-in` scales by the fill's alpha. A mask fill that inherits a
  translucent `fillStyle` silently dims the whole layer (it took the warm
  glow to 5%). Set an opaque fill first.
- A dim yellow ember reads as olive. Dim must be deep red; only the hottest
  cracks get the orange-yellow core, and it doesn't accumulate.
- Two round knots side by side read as eyes. Knots are lenses along the
  grain, birch scars long bands around the trunk, one at a time.

### 10.24 Neko: the original cat, a family, yarn and hats (owner request, 2026-10-29)

The 16×16 cat drawn in phase 4.6 read as a blob. Neko now uses the
original art, and grew a household:

- **Sprites.** `neko/sprites.js` (`NekoBitmaps`) holds oneko's 32 `neko`
  frames, 32×32, as base64 XBM pairs [ink, shape]. The art is Juan Gotoh's
  (*neko DA*), made into X11 bitmaps by Masayuki Koba (*xneko*) and reused
  by *oneko*; all three released it to the public domain. It was taken from
  Neco's `Sprites.swift` (CC0), which converted oneko-1.2.sakura.5's
  `bitmaps/neko/`. Only the neko set came over. The BSD daemon and Sakura
  bitmaps in that tarball did not. Frame names stay oneko's: `mati2` sit,
  `mati3` yawn, `jare2` wash, `kaki` scratch, `*togi` claw at a wall,
  `awake` startle, eight run directions, and nothing is mirrored. The sleep
  frames carry their own z's.
- **Coats** (13). `NekoSprites.paint` colours each frame once (ImageData,
  at bake time only): ink, fur, and a pattern on the fur. Tabby stripes,
  value-noise patches, or points on pixels furthest from the body's
  centroid, which finds ears, paws and tail in any pose (tuxedo's white
  points only below it). Fur just above an outline is shaded 14%. The
  specials:
  - ghost: translucent, shadowless, floating and bobbing;
  - neon: a glow baked with `shadowBlur`, pulsing and now and then buzzing;
  - rainbow: eight baked hue phases that flow while the cat is awake;
  - galaxy: nebula patches and stars;
  - gold: a diagonal sheen.

  Assorted deals `ASSORTED` in turn from an offset that moves each day, so
  the family is stable within a day and different the next.
- **Cats** (1–42, default 1). Each cat has its own state, goal, pace (±10%)
  and idle clock. Goals, in order:
  - yarn: the four cats nearest each ball, a current chaser counting as
    three lengths nearer, so the pack doesn't flicker; the rest watch or
    sleep on;
  - the pointer: a slot in rings of 6, 12, 18… around it;
  - its own plans.

  Overlapping cats ease apart every frame. A runner gives way five times
  more than a sitter, so a crowd flows round a sleeping cat.
- **Nobody about** (Wander, Wander After 30 s ±25% per cat). A rested cat
  either roams to a far spot, or hunts another cat (60%). A hunt stalks at
  0.55× speed beyond three lengths, then pounces at 1.3×. A tag startles
  the prey (awake, if it was napping), sends it fleeing, and the hunter
  swipes. The hunter keeps at it for 3–7 s, then washes as if it had meant
  to. Between adventures the cats run oneko's idle chain and nap.
- **Yarn** (Tap for Yarn; through `host.gestures`, so Android page swipes
  don't count). A tap tosses a ball, up to three at a time, in six colours.
  Swats knock it 3–7 lengths a second with drag, and it bounces off the
  edges, unravelling a wobbly thread behind it that fades over 12 s. Swat
  number 3–7 is the big one: toward the nearest edge, too fast to bounce,
  gone. Cats chasing it claw at the wall (oneko's togi, which they do any
  time what they want lies past the edge). Then they settle, and the one
  that hit it looks startled.
- **Hats** (`neko/hats.js`, `NekoHats`). Pixel art at the cats' scale,
  hand-placed on each frame's head (`anchors`: x, y, facing), mirrored
  facing left; the propeller spins while its cat runs.
  - 14 everyday hats: top hat, cap (blue, no logo), party, crown,
    propeller beanie, wizard, cowboy, chef, pirate, viking, bow, flower
    crown, halo, mortarboard.
  - 9 holiday hats, by `host.now()`:
    - New Year: Dec 31 – Jan 1
    - Valentine's: Feb 13–14
    - St Patrick's: Mar 16–17
    - Easter: Good Friday to Easter Monday (computed)
    - the Fourth: Jul 3–4
    - Halloween: Oct 24–31
    - Thanksgiving: Thursday and Friday (computed)
    - Christmas: Dec 10–26, santa hats and antlers in turn
  - Settings: holiday hats only (default), assorted (holiday hats on
    holidays), none, or any one hat. The panel's list of hats lives in
    `settings.js` (the panel doesn't load `hats.js`). `tools/neko.test.mjs`
    keeps it, the coats and the anchors in step with the code.
- **Size.** 32–256 px in 16 px steps (default 64, 2×). The canvas is sized
  by `devicePixelRatio` and the art is snapped to device pixels, so 48 px
  on a 2× screen is exactly 3×. Distances scale with size, and everything
  stays above `host.insets.bottom`.
- **Timing.** Timers count in `time`, the ms the wallpaper has run. A
  pointer event is stamped on the next frame. With every cat asleep and
  nothing rolling, the stage idles until the next breath or the next cat
  due to set off, and that gap counts in full, not clamped to 100 ms.

Cost: 42 cats with two balls, update and draw, 0.3 ms a frame on a CPU
slowed 4×. Smoke (`neko`): 32 frames of 32 px art; with no pointer the
cat goes exploring; 42 cats reach the pointer without stacking; a tapped
ball is batted, knocked out and leaves the cats idle with a fading thread;
`?date=` brings witch hats on Halloween, santa and antlers on Christmas Eve,
none in June.

Hard-won:
- Base64 of a mostly empty frame is a long run of `A`s, which the audit's
  bare-hex rule reads as a key: `sleep2` carries an `audit-allow`.
- Every cat charging the ball buries it at the edge in a heap; four
  chasers and an audience reads as a game.
- Dark hats outlined in a light grey read as grey hats (the pilgrim hat
  looked like a padlock). Dark hats take a dark outline and a bright
  highlight.
- Values from a `vm` context have their own `Array`: tests copy them
  before `deepEqual`.

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
- **Big Old TV** (`big-tv`, 2026-11-15, owner idea): the Old TV's
  sibling, nearly all screen.
  - The video takes about 88% of a landscape viewport's width (less only
    where the height runs out first: about 81% at 16:9 with the controls
    along the bottom) and about 92% of an upright one's. A slim cabinet
    round the bezel, stubby legs, small rabbit ears that only just fit
    under the top edge, and the Old TV's room behind.
  - Very small controls in a thin strip: a channel knob and a volume
    knob (under 3% of the screen's width), three sliders, a red pilot
    light (dark on pause), a speaker grille and a brass badge with a star
    and no name.
  - Options, settings named `bigTv…`, shown only for this frame and read
    from `env.config`; a change repaints the art once.
    - `bigTvWood`: walnut (cathedral arches), oak (pores and ray flecks),
      mahogany (ribbon stripe), maple (curl and bird's eyes), ebony
      (brown streaks), or an enamel with no grain: avocado, tangerine,
      turquoise, cream.
    - `bigTvStyle`: `seventies` (square corners, rails with mitred
      uprights, knurled metal knobs, a slatted grille, straight legs) or
      `fifties` (a round-cornered shell, a rounder tube, brass trim,
      cream knobs with brass caps, gold grille cloth, splayed legs with
      brass feet).
    - `bigTvControls`: `side` or `below`. Upright it is always below.
    - `bigTvOrnament`: `plant`, `cat` (china, with a gold collar) or
      `none`, on a lace doily.
  - Upright, with room: the set stands on a matching stand (walnut under
    an enamel set) with a shelf of records over two doors. Any screen
    with enough wall over the set gets a sunburst clock, its hands on the
    overlay from `host.now()`, redrawn once a minute.
  - The tube is the Old TV's (`JellyfinFrames.crt`, exported by
    `frames/old-tv.js`: the wall, the glass, and the snow, power-off dot
    and rolling bar as `tube(turn)`). The overlay always draws the
    channel knob where the channel is now, since the art isn't repainted
    for a new item.
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
- **Three for Christmas** (2026-11-15, owner idea), sharing
  `frames/christmas-kit.js` (`JellyfinXmas`: strands of lights, fir,
  bows, holly, baubles, presents, a tree, the mantel's fire, a window on
  the snow). Their options are settings named `xmas…`, shown in the panel
  only while their frame is chosen, and reach a frame as `env.config`; a
  change to one repaints the art once.
  - **Christmas Lights** (`christmas-lights`): the video nearly full
    screen in a thin bezel, a string of lights hung round it. Options:
    big or mini bulbs, a fir garland along the top, bows and holly. An
    upright phone's spare room gets hanging baubles and a row of presents.
  - **Snowed In** (`snowed-in`): a den. A flat-panel TV on a low bookcase
    in front of a wide window, snow falling on pines and a lamp post
    outside; a brick fireplace to one side with a garlanded mantel,
    stockings, a wreath and a cat on the rug; a tall bookcase and a small
    lit tree with presents on the other. Upright: the TV on the wall
    under the window, fire and tree below. Options: the snow (light,
    heavy, blizzard), the fire lit or not, the cat.
  - **Christmas Tree** (`christmas-tree`): a floor-to-ceiling tree, and
    the video in an ornament shaped like a little red television hung on
    it. Presents heaped below with a teddy bear, milk and biscuits on a
    table, snow at the window. Options: the ornament's size (its screen
    is 30%, 42% or 58% of the tree's width), the topper (star, bow, none),
    the presents, the snow.
  - All three: light colours (every colour, warm white, blue and white,
    red-white-green) and pattern (twinkle, chase, slow fade, steady).
  - Cost: the overlay draws one baked glow per bulb, the flakes as small
    rects (clipped to the panes, less whatever stands in front of them)
    and the fire's baked tongues at 12 fps; one still picture on Low.
    Seasonal still picks the Mantel in winter.

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
- `bigTvWood` (walnut), `bigTvStyle` (seventies), `bigTvControls`
  (side), `bigTvOrnament` (plant): the Big Old TV's own
- `maxResolution` (auto), `posterMode` (auto), `reportPlayback` (off)

**Privacy:** titles in the panel and on frames come from the user's own
server and stay on screen only, as `textContent`. Logs never include the
server address, token or titles. The smoke run's mock server uses
made-up titles such as "Test Pattern No. 3".

### 10.26 Orrery (`orrery`, from §10.5, November 2026)

The solar system as it is right now (from `host.now()`), or in time-lapse,
computed in code with no network: Standish's Keplerian elements (JPL;
Table 1 for 1800–2050, Tables 2a/2b outside it), Kepler's equation by
Newton, the Moon from a short Meeus series, Jupiter's four on circular
orbits, the IAU zodiac and the seasons (`OrreryMath`, Task 5,
`tools/orrery.test.mjs`).

**As built (November 2026):**

- **Files:** `orrery-math.js` (the sky), `orrery-art.js` (every baked sprite
  and layer: shaded planets lit from +x and turned to the Sun, the corona and
  its streamers, ivory and brass balls, toothed gear wheels in three metals,
  the starfield with its Milky Way, parchment and night paper, the study and
  the walnut plinth), `orrery-looks.js` (the three looks), `orrery.js` (the
  manager: time, the scale, the camera, the scene, cards, keys, idling).
- **Geometry:** positions are J2000 heliocentric AU. A radial scale maps
  them to plane units and leaves every direction alone, so an opposition is
  a straight line through the Sun at any scale: `compressed` (r ∝ a^0.45,
  all eight fit), `true` (linear; the inner planets disappear into the
  Sun's glare, which is the point), `inner` (r^0.6 out to 3.35 AU, Mercury
  to the belt). Brass adds a hub offset so the gear train has room. The
  planets' sizes are exaggerated (∝ radius^0.38 × `planetSize`).
- **Camera:** `top` (ecliptic north up, the equinox to the right) or
  `tilted`: perspective from 25° above the plane (50° on a tall screen),
  drifting 1.2°/s with `drift`, dragged by hand (azimuth and elevation,
  8°–90°), nudged by Android's home-screen scroll. Both fit the outermost
  ring to the safe area's short side, above `host.insets.bottom` (and the
  brass plinth). Flat things lying on the plane (ring lettering, gears) are
  drawn through the local affine of the projection, so they lie down in the
  tilted view and turn upright where they'd read upside down.
- **The looks** (`look`, key L): *space*: stars, a baked corona with two
  counter-turning streamer sprites, planets with night sides and polar-view
  bands, Saturn's and Uranus's rings in their real orientation (from the IAU
  poles, split behind and in front of the ball), halos (`glow`), comet-like
  trails, the belt. *brass*: an engraved brass zodiac ring with glyphs and
  degree ticks, a brass Sun on its pillar, four concentric wheels (bronze,
  brass, steel) each turning with its planet's arm and three pinions meshing
  the other way, arms from the hub at stepped heights with posts up to ivory
  balls, counterweights, the Moon on its own small arm, wire rings, a walnut
  plinth. *chart*: ink on parchment or night (`chartPalette`), a ruled
  border, a glyph legend where there's room, 1° ticks, the constellations
  lettered round the ring, ♈︎ at the J2000 equinox, planets as half-hatched
  circles with their glyphs and a red R when retrograde, the Moon in its
  phase, and lines of sight from the Earth to each planet and on to where it
  sits on the ring. The legend is drawn with the overlay, so it follows the
  ring, and says "From above the ecliptic" only from above. In the
  compressed and inner scales a line of sight bends at the planet: the
  radial scale keeps every direction from the Sun true, but it can't keep
  the Earth, the planet and the sky point in line too (only `true` can), so
  the solid line runs Earth → planet and the dotted one planet → its true
  place on the ring.
- **The zodiac** (`zodiac`): the thirteen IAU constellations the ecliptic
  crosses (Ophiuchus included), or the twelve equal tropical signs, whose
  boundaries are drawn 1.397°/century back from the J2000 frame. Cards name
  the constellation, and the sign too when signs are chosen.
- **The belt:** a seeded pool of 1500 main-belt rocks (Kirkwood gaps
  empty, each at its own Kepler rate, a little eccentric and inclined) and
  340 Trojans librating round Jupiter's L4 and L5; drawn count = pool ×
  density, eased in and out, half again as bright at the inner scale, where
  it's spread over the screen. With `belt` shed (Low) a faint band (a
  stipple on the chart) stands in.
- **Time** (`speed`, keys `=`/`+`, `-`, `0`): live, 1 h, 1 day, 1 week,
  1 month or 1 year a second, from the date on screen; `0` goes back to now
  and live. A toast names the speed and date. Clamped to 1000–2999 (within
  the long table's span, in four-digit years); at the end it holds, with a
  toast. The readout: "1 day/s · 12 Mar 2031 · March equinox in 8 days"
  (named by month, not season, since spring in the north is autumn in the
  south; · approximate outside 1800–2050), the Moon's phase
  (drawn) and constellation, and which planets are retrograde.
- **Cards:** tap a planet, the Moon, one of Jupiter's four (on a tight
  radius, checked before Jupiter's own) or the Sun: distance from the Sun and
  the Earth in AU and light-minutes, the constellation it's in from here,
  its elongation (evening or morning sky, or too near the Sun), retrograde
  or not, its year; Jupiter's moons and the Moon have their own. A tap on
  empty space closes it; `touch` off ignores taps and drags.
- **The galactic compass (owner request, November 2026):** `galaxyCompass`
  puts a globe in a corner of the safe area (`bottom-right` by default, or
  `off`) whose needle points at Sagittarius A* (RA 266.417°, Dec −29.008°,
  J2000; ecliptic longitude 266.84°, 5.6° south). The direction goes
  through the camera's rotation alone (`orient()`, no perspective): from
  above, longitude λ is at screen angle −λ; tilted, it turns with drags and
  drift, and the far half of the globe's ecliptic circle is dashed (ticks
  every 30°, longer at 0°, show it turning: a bare circle turning about its
  own axis looks still; owner report 2026-11-06), the
  needle dimmer when it points away. Deep space: dark glass; brass: a ringed
  globe on a stand on the plinth, its name engraved there (GALACTIC CORE;
  elsewhere "Galactic Core", the owner's name for it); the chart: a
  paper disc with hatching and degree ticks. It keeps below the readout
  (top left), above the plinth and clear of the chart's legend. A tap gives
  its card: the black hole, 26,700 light-years, its constellation and
  elongation from the Sun. Smoke checks every look × corner.
- **The Milky Way** (`milkyWay`, deep space only): off draws the starfield
  without its band (the stars spread evenly instead).
- **Keys:** `=` `+` faster, `-` slower, `0` now, `L` look, `S` scale, `V`
  top or tilted.
- **Cost:** live and still, one frame a minute (the readout's clock), or
  ~4 fps of corona and belt shimmer in deep space unless motion is reduced,
  the device is on battery (the power policy's reasons) or the effects are
  shed; every look draws from a cached background and a cached plane; a
  drag from above (which turns nothing) asks for no frames. Bench (phone,
  4× throttle): 0.9% Low, 5.3% Medium, 8.4% High (⚡). Smoke: every look and scale draws; Mars at the 2025-01-16 opposition
  on the Earth's ray from the Sun at every scale and view; `=`, `-`, `0` and
  the toast; far dates clamped, flagged and finite; cards; drag; a phone
  and a taskbar inset; the idle and running frame rates.

### 10.27 The Cat vs. the Ornament (`cat-ornament`, owner request, November 2026)

The first of four Christmas wallpapers the owner sketched (then The Last
Bulb on the Strand, Frost on the Glass, A Very Small Christmas). A classic
Christmas problem: a tree in a warm room, one ornament hanging low, and the
household's cats taking turns with it.

- **The cats** are the owner's own, by name (the owner asked for them in the
  public repo), each on one vector rig (`cat-ornament-cats.js`): a
  skeleton in cat units, blended between seven poses (sit, stand, crouch,
  loaf, curl, belly-up, rearing), the body a chest, a haunch and the hull
  between them under one outline; coats are clipped markings; the face is
  front-on, with eyes, lids and a mouth each wears its own way. The roster
  (`CatOrnamentLogic.ROSTER`): **Moofy** (black Maine Coon/Ragdoll, fluffy,
  lurks; a Cheshire grin that shines under the tree), **Butters** (chunky
  buff tabby; slow blinks with hearts), **Waffles** (white with Holstein
  patches, nosy), **Ras The Destroyer** (black tuxedo, the most trouble;
  swats the ornament while making eye contact), **Ibbie** (grey tabby,
  sleeps the most, likes the empty box), **Die Fleder Maus** (usually; else
  **Maus**: a black and brown tortie with the zoomies), **Turkey** (large,
  muscular grey mottled tabby; lounges belly-up; heavy, so his climbs always
  bring the tree down), **Harry** (70%; else **Indiana Jones** or
  **Friskies**: orange and white, playful; Indiana Jones knocks the
  ornament the wrong way and it rolls after him), and the blue Persian
  (**Kitty Toes**, **Cat Baloo** or **Poke Paws**, evenly; judges). Any
  name can be replaced in the panel (a comma list picks at random).
- **The director:** `inRoom` cats (1–5) from those enabled; one has the
  ornament for `turnMinutes`, then the next (key N). It approaches, lurks
  under the boughs (darkened, eyes and grin drawn again over the front
  tier) or sits and stares, pupils widening ("…still staring at the
  ornament", "This has been going on for some time"); then the roll
  (`escalate`, by its trouble and `mischief`): swats (B), the ornament off
  its hook (it bounces, rolls, gets chased, and after lying still for 40 s
  goes back up), a climb (T), or it gives up and grooms. The others pick by
  temperament (`idle`): sleep, loaf, lounge, the box, slow blinks, grooming,
  watching, a wander, the zoomies (Z).
- **The fall:** a climb rocks the tree (a spring); past 0.2 rad it falls as
  a rod about the corner of its stand, bouncing to rest at 1.42 rad. The
  ornaments fly off as it passes each one's angle, the star too, the
  pendulum unhooks; the lights flicker, and on landing go out. The culprit
  leaps clear and sits looking innocent ("…has no idea what happened
  here", "Ras The Destroyer regrets nothing", "Turkey only meant to sit on
  it"); sleepers startle; the Persian is unimpressed. After 9 s, a fade,
  "Some time later…", everything back, and the next cat's turn. Topple off
  (or reduced motion): the climber jumps down and the tree stays up.
- **The tree, every way (owner request, 2026-11-11: "serious configuration
  options for the tree. Like big trees! Wide trees! More ornaments. More
  lights… I'd love a charlie brown tree too"; configVersion 2).**
  `treeHeight` (× 0.5–1.3, the top of the range touching the ceiling) and
  `treeWidth` (× 0.5–1.6, never overflowing a phone) scale the layout;
  `fullness` scales the sprigs and fringe; `lightCount` and
  `ornamentCount` (× 0–3) scale what the tree has room for (up to 560
  lights and 110 ornaments, packed closer as they grow); `garland` is
  gold beads, silver tinsel (a wobbling ribbon in three strokes with
  glints) or none; `topper` a star, a red bow or nothing; `flocked` dabs
  snow along every tier's edge and face; `presents` 0–12 from a list of
  twelve places. **The Charlie Brown tree** (`tree: 'charlie'`,
  `CatRoom.charlie`): a spindly leaning sapling, five or six drooping
  branches with a few sprigs of needles each, one big red ball at the top
  bending it over, a blue blanket wrapped round its wooden cross, three
  bulbs at most and no topper; it answers in the same shape as the fir
  (sprites, hooks at the lowest branch's tips, the ball as its one
  ornament, an empty front layer), so the cats, the pendulum and the fall
  work unchanged. The cats: a belly-up cat's head now lolls back (hr
  0.95) instead of hanging upside down, the fluffy edges and ruffs are
  finer, heads a touch smaller.
- **The tree** (`tree`: cozy, grand (default), majestic; owner request,
  2026-11-06: "an impressive tree, much wider"). `CatRoom.TREES` sets how
  wide it is for its height (0.6, 1, 1.2), how much taller it may be on a
  phone, and where it stands; on a phone it fills the width but never
  overflows it. Its tiers (6 + 1.4 × width/0.6h of them) are drawn from the
  bottom up, each skirt hanging over the tier below: a rounded cone with a
  fringe of drooping tips, lower in the middle, shaded like a cone lit from
  the window side, and darker where the tier above hangs over it. Each is
  needled with sprigs batched into four Path2Ds by brightness (one stroke
  each), with more sprigs hanging past its edge. Lights and ornaments go by
  area: 70 lights on the cozy tree and up to 180, with up to 36 ornaments.
  Under a grand tree there are eight presents in two rows. The front
  sprite is everything below the lowest tier's top, feathered over 12u so
  no seam shows; bulbs near or below that line are drawn after it. The
  stand, and so the pivot it tips over on, scale with the height, not the
  width.
- **The room** (`cat-ornament-room.js`): red damask walls, a wainscot, a
  window onto snowy roofs with snow falling (clipped to the panes), a cat's
  portrait, plank floor, braided rug, tree skirt, presents, an open box
  (THIS SIDE UP), a fire off to the side. Evening, day, or by the clock.
- **Touch:** a tap or drag shines a laser dot; the nearest cat that's awake
  (a sleeper less readily) chases and pounces, and the dot jumps away.
- **Holidays:** captions on Christmas Eve ("Everyone is being very good.
  Mostly.") and Day ("Merry Christmas from …").
- **Cost:** see §4.8. Bench (phone, 4× throttle): 14–18% Low, ~25–40%
  Medium (the grand tree measured 15.7% and 30.5%; the old one 13.6% and 42%). Smoke: frame one has the cast and the lead at the ornament; B
  swings it; T brings the tree down (lights out, ornaments loose, the
  culprit innocent) and the reset puts it back for another cat; Topple off
  keeps it up; a tap's dot is chased. Unit: the roster and names (Harry's
  70%, the Persian's evenly), the cast, the pendulum, the fall, the
  director's odds, idling by temperament, the holidays.
- **Seasonal:** December takes turns, a day each, between Advent and this
  (§4.2); the other three join the list as they're built.

### 10.28 The Last Bulb on the Strand (`last-bulb`, owner request, November 2026)

The second of the owner's four Christmas wallpapers. A strand of old C9
bulbs hangs in shallow swags from brass cup hooks along a picture rail at
the top of the wall, every bulb pooling its colour on the wall below. The
last one, on the tail where the wire drops off the final hook, is loose.
Subtle on purpose: almost nothing moves, and when something does it's small.

- **The last bulb** (a script of `[power, seconds]` steps, `LastBulbLogic`):
  dark; every `tryEvery` minutes or so it makes contact twice, briefly
  (35–100 ms, about a third of a second apart, the second sometimes weaker)
  and then either holds and lights, or (`stubborn`, 35%) doesn't, now and
  then with a feeble third, and tries again within the minute. Lit, it
  stays about `staysLit` minutes, dipping for a moment now and then (it's
  still loose), and goes out with one last flutter.
- **The filament:** power doesn't switch the light; a tungsten filament
  heats in ~40 ms and cools in ~110 (an exact exponential per frame, so any
  frame rate gives the same curve), and its light goes as temperature^2.4.
  So a flick is a soft blink that never reaches full brightness, and a warm
  or cooling filament glows orange (an "ember" sprite over the dark bulb).
- **Christmas Eve** from 5 pm, and all Christmas Day (`christmasEve`, on by
  default): it lights first time, and stays lit. No outages either.
- **The whole strand goes out** (`outages`: rare ≈ every 25 min, sometimes
  ≈ 8): a stutter, then dark for a few seconds; then someone off screen
  twists the last bulb (it jiggles on its socket, the tail swings), and the
  strand flickers twice and comes back: with the last bulb, for once, on.
- **Drafts** (`draft`): a pulse that travels along the strand, swinging
  each bulb on its socket (a damped spring) and the tail like a pendulum.
  None come by themselves under reduced motion (D still sends one).
- **Touch:** tap a bulb to jiggle it; tap the last one and it may take
  (85%), or, lit, may work loose (40%) or just dip. During an outage, a tap
  on it is the twist.
- **The art** (`last-bulb-art.js`): painted ceramic or clear ribbed glass
  (the filament and its lead wires showing), a green socket, a brass base,
  a twisted-pair wire with its shadow, the end plug dangling past the last
  socket, and a kraft-paper tag tied to the last hook that says "jiggle".
  The wall is old plaster, knotty pine, brick or green striped wallpaper,
  painted at full light and multiplied by a light map (the room's ambient,
  `roomLight`, plus a pool of each bulb's colour), so a red bulb reddens
  cream plaster and barely shows on green paper.
- **Colours:** vintage (red, green, blue, orange, gold), warm white,
  red-green, blue-white, candy cane, all red, all blue, pastels, or the
  user's own; the last bulb takes its place in the pattern or a colour of
  its own (the one replacement from a different box). Its end, left or right.
- **The strand, every way (owner request, 2026-11-11: "more options…
  maybe a strand that wraps around the entire border… configurable is
  key"; configVersion 2).** The layout is now a path of cup hooks
  (`LastBulbLogic.layout`: corners, hooks every `hookEvery` bulbs along
  each run, the corners always; swags between hooks drooping by their
  horizontal span, so a vertical run hangs straight; a bulb every
  `spacing` widths along the wire, each with its fraction `u` along the
  strand for the draft's pulse; the lead-in bulbs off the screen dropped).
  Routes (`route`, key N): along the picture rail (`rows` 1–5 snakes it
  back and forth down the wall, dropping down one side then the other, the
  end always on the chosen side), round the whole border (up one side,
  along the rail, down the other, back along the bottom above
  `host.insets.bottom`), or an arch over a doorway (up, across, down, the
  end part-way down the far side). Hooks off the rail screw into a little
  plate on the wall. Bulbs (`shape`): C9, a round G40 globe, or a C6 at
  two thirds (the glass centre per shape, `centreOf`, so the light pools
  and taps land right); glass painted, clear or frosted (milky, the colour
  softened); `glow` scales the light's reach; a pine garland (`garland`)
  is drawn into the wall along every swag (sprigs of needles in two
  greens, a berry here and there), so the bulbs light it with the wall;
  two more walls, painted white and charcoal; the tag's text is a setting.
  **Twinkle bulbs** (`twinklers`, 0–6): the old bimetal blinkers, spread
  along the strand (`twinklers()`), each on its own slot clock (on a
  second or three, off a blink), its filament answering as the last
  bulb's does; each has the wall round it baked lit by everyone but
  itself, drawn over the lit wall by how dark it is, and a blink redraws
  only that rect (the corner mechanism, generalised to a list of rects);
  between blinks the stage idles as before.
- **Cost:** see §4.8. Bench (phone, 4× throttle): 0.4% Low, ~8.5% Medium.
  Smoke: frame one is lit with the last bulb dark; no frames while still;
  L gives exactly two flicks then light, redrawing only the corner; O puts
  the strand out and the twist brings it back with the last bulb on; a tap
  on it jiggles it; on Christmas Eve, even at 90% stubborn, it lights and
  isn't due to go out; round the border with two twinklers, bulbs by every
  edge and a blink that redraws only its rect. Unit: palettes, the attempt
  scripts (always two flicks), playback, the filament (frame-rate
  independent, heats faster than it cools, a flick is a soft blink), the
  layout (swags, the tail, mirroring; rows, the border, the arch, hooks as
  asked, no bulb under the tail), the twinklers, Christmas Eve's hours.
- **Seasonal:** December's list (§4.2).

### 10.29 Frost on the Glass (`frost`, owner request, November 2026)

The third of the owner's four Christmas wallpapers. We're outside on a
cold night, looking in through a frosted window: behind the glass a warm
room out of focus, and a Christmas tree that's only a dark cone and the
soft discs of its lights.

- **The frost** (`FrostLogic.grow`) grows tip by tip. Seeds sit along every
  pane's edges, deeper toward the corners (the coldest glass), with fans
  of long stems from each corner; corners start at once, mid-edges later,
  over the first half of `growMinutes`. Each tip steps about a pixel and a
  half at a time with a little wander and drops side branches on both
  sides at ice's sixty degrees, each a share of what its parent has left,
  four generations down: fern frost. A coarse occupancy grid stops a tip
  where another stem's ice is as coarse as its own (a stem runs on through
  a neighbour's twigs, a twig stops at anything), which is what fills the
  glass without a tangle. Ice is laid a pixel or so at a time (a slow tip
  would otherwise stack dabs into bright balls), with a milky haze where
  it's dense and places for glints.
- **The light:** the frost is a mask over its own colour, a cold
  blue-white plus the room blurred and shone through, so it glows amber in
  front of the tree and stays cold in dark corners. Glints: light catching
  a facet now and then (`sparkle`, an effect shed on Low).
- **Doodles** (`doodles`, about every `doodleMinutes`): someone inside
  draws with a fingertip where there's frost to draw in: a heart, a star, a
  smiley, a cat's paw print, a tree, or NOEL, written left to right from
  inside and so backwards from out here. Christmas Eve and Day: trees,
  stars and hearts. A minute or two later new crystals grow back into the
  line.
- **The thaw** (`cycleMinutes`, 30; 0 never): the room's warmth clears each
  pane from the middle out over 40 s, and frost starts again from the
  corners.
- **Touch:** drag to draw in the frost; tap to breathe on the glass (a
  round clear patch, fogged for a few seconds). Both grow back.
- **The room** (`frost-art.js`): painted sharp at a quarter size and blurred
  up: warm walls, a lamp, the fire's glow off to one side, a sofa's back,
  the tree in tiers. The tree (configVersion 2, 2026-11-11): `treeStyle`
  a fir, a Charlie Brown tree (a bent sapling in lighter brown so it shows
  through the blur, five drooping branches with a few dabs of needles, a
  blanket round its foot, one big red disc for its ball and three bulbs,
  the lot of it) or none; `treeSize` and `treeWidth` scale it;
  `lightCount` (0–200) sets its bulbs before the screen's size scales them. Its lights wind round it in a spiral, the nearer ones
  bigger; each a bokeh disc, brighter at its rim, twinkling slowly
  (`twinkle`), with a star and a few far lamps. Warm, coloured, icy blue or
  candlelight; the tree left, middle or right; `blur` sizes the discs.
- **The window:** one, two, four or six panes (turned for portrait), the
  frame white, wood, green or red, moonlit, its bevels catching the room's
  light; snow drifted on the sill and on each glazing bar, glittering.
  Snow falls outside (`snow`), a few big soft flakes close by, and now and
  then a flake sticks to the glass as a six-armed crystal and fades.
- **Cost:** see §4.8. Bench (phone, 4× throttle): 8.3% Low, 16.7% Medium;
  a thaw or a doodle about 17–27% on Medium. Smoke: frost on frame one and
  growing; ten frames a second at most with no snow; D draws and the glass
  under the line is clear after; B fogs it; a drag clears a line and
  queues regrowth; T thaws and it starts again. Unit: panes by kind and
  orientation, seeds (on the edges, corners first and furthest), the grid's
  rules, growth (on the glass, sixty degree branches, four generations, no
  stacked dabs), every doodle traces and NOEL is mirrored, the festive days.
- **Seasonal:** December's list (§4.2).

### 10.30 A Very Small Christmas (`small-christmas`, owner request, November 2026)

The last of the owner's four Christmas wallpapers. A little pixel-art tree
near the bottom of a big dark screen, on a strip of snow, with presents
and a toy train parked on its oval of track. Retro, and cozy.

- **Pixels:** the canvas is the picture at its own resolution (about 320 ×
  200 on a laptop; a pixel is 3 CSS px or more, × `pixelSize`) and CSS
  scales it up pixelated. Drawn a pixel at a time into sprites; ordered
  (Bayer) dithering for the sky's fall toward the horizon and the snow's
  shading. A retro 12 frames a second (`fps`, 6–30).
- **The tree** (`SmallXmasArt.tree`, tiny, small, a bit bigger, big or
  huge (84 pixels tall, seven tiers; configVersion 2, 2026-11-11);
  `treeWidth` × 0.6–1.8; `lightCount` and `ornamentCount` × the bulbs and
  the ornament pixels; or `treeStyle: 'charlie'`, a Charlie Brown tree in
  pixels: a bent stick with four drooping branches and a needle or two,
  one red ball bowing the top, a blanket over the cross it stands in, two
  or three bulbs and no star): tiers
  widening downward, lit from the left with a checkered shade on the right,
  a dark edge under each tier, snow on its shoulders, a gold garland,
  pixel ornaments, a star whose arms reach out now and then, a red pot.
  Its bulbs blink: twinkle, chase, alternate, all together or steady
  (`lit()`, a pure function of time, so twinkle is drawn, not rolled), with
  a soft pixel of glow round each lit bulb in full colour.
- **The train:** an engine (wheels in two frames), a tender, a car with a
  present and a caboose with lit windows. Every couple of minutes it toots
  (smoke puffs from the stack) and goes round `laps` times on an oval kept
  as a table of distance along it, so the cars keep their spacing on the
  bends, easing out of and back into its spot behind the tree. Everything
  on the floor is drawn back to front by where it stands, so the train
  passes behind the tree and in front of the presents.
- **Moving house** (`moveMinutes`): the track packs itself away pixel by
  pixel, the tree hops along the floor to somewhere new (squashing a pixel
  as it lands, leaving footprints), the presents and then the train's cars
  hop after it in a line like ducklings, and the track lays itself down
  again round it.
- **The sky:** twinkling stars, a crescent moon, pixel snow, and now and
  then (`sleigh`: sometimes, Christmas Eve only, never) a sleigh and two
  reindeer, the leader's nose red, crossing with a trail of sparkles; on
  Christmas Eve night it comes every couple of minutes. On Christmas Day
  there are three more presents.
- **Palettes:** the full-colour night, or the night mapped by brightness
  onto four-shade screens: pocket (four greens), amber, or four greys (the
  bulbs then blink between the two brightest shades). Optional scanlines.
- **Touch:** tap the tree to jingle it (it shakes, the lights chase fast),
  the train to send it round (or toot), the floor to move the tree there.
  Keys T (train), M (move), L (jingle), S (the sleigh, whatever the setting).
- **Cost:** see §4.8. Bench (phone, 4× throttle): 4.6% Low, 5.3% Medium.
  Smoke: a small canvas, pixelated; about 12 frames a second; T once round
  and parked exactly where it was; M packs the track, hops, and lays it;
  a tap on the floor moves the tree there; S flies the sleigh; Christmas
  Day has six presents. Unit: the palettes (exactly four shades, sky
  darkest, snow lightest, lights still blink), the patterns, the oval
  (its length against Ramanujan's, the way round, wrapping), the hops and
  the new spot, the special days.
- **Seasonal:** December's list (§4.2), now all five.

### 10.31 Sky Island (`sky-island`, owner request, 2026-11-11)

From the brainstorm's "The Last Floating Island" (a tiny island in an
enormous sky, one cottage, one resident), but the owner wanted **a small
town full of people**, in pixel art, randomised each load, with other
small towns floating by, pets everywhere (cats above all), wildlife,
forests, lakes, small mountains, waterfalls, and holiday and seasonal
touches. Decisions, from the Q&A: the real clock with overrides; the
owner's cats by name and temperament plus strays and dogs; a new island
every load with "keep this one"; every holiday set plus the owner's own
dates and a way to pin a season or holiday; visitors wave, birds cross, a
balloon ferries someone over; a light touch; a big island with sky all
round; local weather; ~20 folk with daily routines; and Seasonal gets it
as year-round filler.

**The second iteration (the same day).** The first was side-on, flat, and
too coarse (3 CSS px a pixel, a house 20 pixels tall in three colours),
had no underside to speak of and no ground below, and its passing
islands were scraps. The owner shared a reference picture (a 16-bit
fantasy village on a terraced floating island, seen from above and in
front, with a castle tower, a windmill, a red barn, cherry trees, a spring
that falls into a pond that falls into a lake that cascades off the edge
into a sea of cloud, banded rock trailing roots and crackling with cyan
magic, bits of rock in orbit, and other islands in the distance) and
asked for that, plus the far ground rolling slowly by below and small
islands that come and orbit ours. Decisions, from the second Q&A: an
elevated three-quarter view; a finer grid (2 CSS px a pixel) with every
sprite redrawn bigger, outlined and shaded in four or five tones; three
fixed tiers with random shapes; the deep banded underside with roots and
magic; the cloud sea with distant islands; a slow bob; passing islands as
whole islands; the ground below; the orbiters.

- **Pixels:** the canvas is the picture at its own resolution
  (`pixelSize` × round(min(width, height)/480 − 0.1): 2 on a laptop or a
  1080p monitor, 3 at 1440p, 4 at 4K, 1 on a phone) and CSS scales it up
  pixelated. Small sprites are rows of characters mapped to colours
  (`SkyIslandArt.rows`), facing left, flipped to face right: people 7×12
  (stand, walk, wave, sit, work, jump), cats 10×9 (the big ones a column
  longer, the fluffy ones with a soft edge: sit, sleep, walk, run, loaf,
  stretch, pounce), dogs, deer, goats, a fox, rabbits, ducks, birds,
  butterflies, an owl, the dragon. Buildings, trees, bushes, the castle
  tower, the windmill, clouds and rock fragments are drawn in code with
  an outline (`outline`) in a dark tint of the thing: a house is its
  front wall (plaster with timber framing, stone blocks, or the barn's red
  boards with white trim), a roof either gabled toward us or seen as its
  front slope with rows of tiles (or thatch), framed windows with four
  panes and a sill, an arched door with a step and a knob, a chimney, a
  shop sign, window boxes in the warm months, snow in winter; a tree is
  clumps of foliage each lit from its upper left in four tones (round,
  tall, birch, apple, cherry, pine, three sizes), bare with snow in
  winter.
- **The island from a seed** (`SkyIslandLogic.layout`, pure, in island
  pixels: x across, y down from the top tier's back line): **three tiers**,
  each a slab of ground with a visible top (its `back` and `front` edges
  by x, a flattened ellipse with a wobble) and a cliff face below its
  front edge down to its `foot`, where the next tier's ground begins; the
  top one small (the crag, the castle **tower** with its flag, usually a
  **windmill**, pines, the spring), the middle one wide (the **village**:
  two streets of houses round the **square** with its well, benches and
  stall, the **chapel** across from it), the bottom one the whole width
  (the **lake** with a pier and a sailboat, the **farm**: a red **barn**,
  fenced **fields** of wheat and cabbages or pumpkins, an orchard of apple
  and cherry trees, a farmhouse, sometimes a cottage by the lake and a
  **lighthouse** at the far tip). Below the lowest tier the **underside**
  tapers to a jagged point, deepest a little toward the water. **The
  water** runs down one side (`side`, `fallX`): the spring on top spills
  over its lip into a narrow **fall** down the first cliff, into the
  **pond** by the village (crossed by a footbridge where the front street
  passes), which spills into a second fall into the lake, which pours off
  the front edge in the **cascade**, wide, widening and thinning into mist
  below the underside. **Stairs** cut into each cliff join the tiers.
  Also: bushes, meadow flowers, lamps along the streets, props (barrels,
  crates, hay bales, flower beds, a signpost), **roots** trailing far below
  the underside, vines down the cliffs, cyan **cracks** low in the rock,
  crystals, **fragments** of rock in orbit, and the **cave** where a small
  green dragon mostly sleeps. The island has a name (Thistlehollow Isle,
  Pebblewick Rock…), shown in the panel with its seed. `seed` 0 (the
  default) draws a new island every load; **Keep this island** (a panel
  action, or `P`) pins the seed, and again lets it go; `N` rolls a new
  one. `islet: true` (passing islands under 200 px, and the orbiters) uses
  deeper tiers so a house still fits. The island shrinks to fit the screen's
  height when it must. The unit test lays out 120 seeds both ways and
  checks every tier's front is below its back and clear of the cliff
  above, the water chain lines up, every house stands on its street inside
  its tier and clear of the others, the pond and the lake, there's a
  chapel and a farm, the stairs join the tiers, fields and trees keep off
  the houses, every spot is reachable by straight legs (between tiers by
  the stairs, never wading the pond), and the same seed is the same island.
- **Getting about** (`SkyIslandLogic.route`, `tierAt`): everyone walks
  the streets. Every spot knows its tier; a walk goes up or down to the
  nearest street of its tier, along it, crossing between the village's
  streets only through a gap between houses (`gaps`), and between tiers
  by the stairs, then across to the target. The pier is a spot with its
  own legs (`then`): the manager's `walkTo` takes a walker out along the
  planks and, next time, back along them first (`retrace`). Dogs route the
  same way when their owner has changed tier.
- **The town's day** (`planFor`, by the hour from `host.now()`): everyone
  has a role and a home. The baker and the fisher are up at five; the
  fisher stands at the pier's end with a rod and now and then catches
  something (half the time the nearest cat runs out along the pier and
  makes off with it, and the fisher waves their arms); the farmer hoes the
  field; kids kick a ball between them in the meadow or the square, fly
  kites when the wind is up, and skate on the lake when it freezes; the
  mail carrier does the doors; a gardener waters; a roofer climbs a ladder
  and hammers on a roof; a merchant minds the stall; a fiddler plays in the
  square from four; walkers go up to the lookout by the tower, to the
  lakeside and the island's ends; strollers pair up on a bench at sunset;
  lunch is in the square; everyone's home by ten but the night watch, who
  patrols the streets with a lantern (a pool of light after dark).
  Umbrellas come out in the rain. A passing island gets a wave from most.
- **Cats** (`Cats`): the owner's roster (the same nine as §10.27, as
  pixels: Moofy black and fluffy with a white grin, Butters a chunky buff
  tabby, Waffles white with black splotches, Ras a tuxedo, Ibbie a grey
  tabby, Maus a tortie, Turkey a big grey tabby, Harry orange and white,
  Kitty Toes a fluffy blue Persian), each toggleable, plus `strays`. Each
  picks spots by temperament: sills, roofs, the pier, benches, the well,
  the footbridge's rail, the tower's platform, under trees, by lamps, next
  to a person. Ibbie sleeps on sills; Turkey loafs on the pier; Ras sits
  on a sill and knocks the flowerpot off it (it falls and breaks); Maus
  gets the zoomies (dashes about its tier for five seconds); Harry pounces
  at butterflies and birds; Moofy lurks under trees or near someone;
  Butters follows people; Waffles sits in the field; Kitty Toes judges
  from the castle's platform, the well or a roof. At night they take the
  sills. A tap on open ground calls the nearest cat over (up or down the
  stairs), with a meow (a heart, from Moofy). Hats on holidays.
- **Dogs** follow their owners about (down the stairs by the route), lie
  down when they sit, and now and then chase a cat on the same ground,
  which runs for a sill; the dog gives up and sits.
- **Wildlife** (`Wildlife`, × `wildlife` × density): small birds perch on
  roofs, the tower and trees, peck on the ground, and fly off when someone
  comes near; three circle the tower now and then; butterflies over the
  flowers on spring and summer afternoons; rabbits in the meadow that bolt
  from people; deer on the top that graze, wander and flee; goats along
  the crag; ducks on the lake (not when it's frozen); a fish that jumps now
  and then (and when the lake is tapped); a fox that trots the lower street
  at dusk; an owl in a pine at night, blinking; flocks of geese (spring and
  autumn) or small birds across the sky, and birds that fly over from a
  passing island; Halloween's bats round the tower and a ghost over the
  lake.
- **The sky:** the sun and moon from Harvest Valley's `HarvestSky.bodies`
  (the catalog loads `harvest/harvest-sky.js` first); the colours
  (`SkyIslandLand.light`) ramp over the sun's altitude with a shared night
  and twilight and a day of the season's (summer's cornflower blue,
  spring's fresh, autumn's haze, winter's pale); a dithered gradient baked
  when the light has moved (every 6 s in twilight, else a minute); stars
  that twinkle; far clouds behind, a couple behind the upper tiers, a few
  in front of the underside, all drifting with the wind; `onScroll` pans
  them by depth. `sky` is live, a whole day in `cycleMinutes`, or pinned
  day, golden hour or night (via `HarvestSky.pinned`). The light of the
  hour is computed before the first bake, so frame one is right.
- **Below** (`cloudSea`, `ground`): a **sea of cloud** across the bottom
  of the screen in two tileable strips of billowing cumulus (the front
  bigger and brighter, both with gaps), rolling past at two speeds in
  front of and behind the island's tip (the cascade dissolves into it), the
  island's shadow on it, and a few far islands poking through, hazed. Under
  it, if `ground`, **the ground far below**: a patchwork of fields with
  hedges, woods, lakes, a winding river, roads and little towns of tiny
  roofs (snow in winter, autumn colours), washed with the horizon's colour
  in a baked haze thick at the top, rolling by slowest of all (the island
  is travelling); at night the towns' windows light. The island itself
  **bobs** (`bob`) four pixels over 25 s; the fragments, the roots and the
  clouds about the underside lag a little behind.
- **Under the island:** the strata are a dozen bands (soil, terracotta,
  rust, sand, ochre, moss, charcoal, slate…) with a wobble, lit on the left
  and dark on the right, outlined at the jagged edge; **roots** hang from
  the soil (three baked sway frames), vines from the cliffs; the **cyan
  magic** in the cracks low in the rock glows and pulses, crackles in
  flickering lines, and now and then throws an arc to a fragment passing
  in front; four to six **fragments** of banded rock (some with grass on
  top) orbit slowly, behind the island and then in front; the crystals
  glint at night; the cave's ember glows when its occupant is awake.
- **The night** is one wash over the island (`source-atop` on its
  scratch), then what shines: windows (by a per-day hash, fewer after
  23:00; a tap on a house switches its own; the tower's slits and the
  mill's window too), lamps, the magic, the crystals pulsing, the cave's
  ember, the lighthouse's beam, fireflies over the lake and the pond on
  summer nights, the watch's lantern, Christmas lights blinking, the
  towns far below.
- **Weather** (`weather`: whatever comes, fair, a shower, snow): a run of
  fair weather with showers now and then (more in spring and autumn, snow
  in winter), from a dark cloud that sits over the island, the rain
  falling only onto its highest ground at each x; a rainbow for a minute
  after; wind that comes and goes, bends the trees (on High), flies the
  kites, turns the mill and the flag, blows the leaves in autumn and the
  petals (cherry ones pink) in spring and leans the chimney smoke.
- **Seasons** (`seasonOf`, or pinned): the grass, the foliage (autumn
  trees each pick a colour; winter broadleaves are bare with snow on the
  branches; apples fruit in late summer and blossom in spring; cherries
  are pink in spring), window boxes in the warm months, snow on everything
  in winter (the roofs, the tower, the crag, the fields), the lake, the
  pond and the spring frozen (and the lake skated on) in January and
  February, chimney smoke in the cold months, the ground below in its
  season's colours too.
- **Holidays** (`holidayOf`, or pinned, with `decorations` off for a quiet
  one): Valentine's (hearts from the chimneys), St Patrick's (green
  bunting, shamrocks, a rainbow all day with a pot of gold at its end),
  Easter (the week before: eggs hidden among the flowers, which the kids
  find; bunny ears on the cats), the Fourth (bunting, fireworks after
  dark), Halloween (the week before: pumpkins at every door, lit at night;
  bats; a ghost; witch hats), Thanksgiving (the week: bunting, pumpkins
  by the stall), Christmas (all December to the 26th: lights along every
  eave, a tree in the square, wreaths, snowmen, Santa hats; a sleigh
  across the sky on the Eve; presents under the tree on the Day), New
  Year (the Eve from six, and the small hours: fireworks, party hats) and
  the owner's own **special dates** (`MM-DD Name`, one a line): a party,
  with a cake in the square, balloons on the lamps, confetti, everyone
  dancing there from five. Easter is computed; Thanksgiving is the fourth
  Thursday. Unit-tested for every one.
- **Visitors** (`Visitors`, about every `visitMinutes`): **a whole island
  of its own**, laid out from a seed by the same generator at 120 to 300 px
  wide (`SkyIslandLand.island`: terrain and every static sprite baked into
  one canvas; its falls, sails, flag, a few folk, a cat or two and its lit
  windows live), with its own name, drifting across far (small, behind
  ours, hazed) or near (big, below, between the layers of the cloud sea).
  Alongside, its folk wave and ours wave back, a few birds fly over, and
  (if `balloon`) a hot-air balloon may lift from it with a visitor (or a
  cat), land on our meadow, let them have a look round the square, the
  pier and the lookout for half a minute, and carry them home. **Orbiters**
  (`orbiters`, every ten minutes or so): a tiny island (100 to 120 px: a
  tower, a cottage, a tree or two, a person or two and a cat) rises from
  below and goes round ours two or three times on an ellipse about the
  underside, behind it (drawn before it, hazed) and then in front, its folk
  waving each time it comes round the front, and drifts off. `V`, `O` and
  `B` send one now.
- **Taps** (`touch`): a cat comes over; a person waves back (with a
  heart); the lake jumps a fish; a house at night switches its windows; the
  sky sends a bird off from there.
- **Panel:** a status line (the island's name, seed, population and cats,
  the season and holiday), **A new island** and **Keep this island** /
  **Let it go** (shown by the feed's `kept`), the seed as a number to
  type in or share; `bob`, `ground` and `orbiters` toggles. Keys: `N`
  new, `P` pin, `V` visitor, `O` orbiter, `B` balloon, `W` weather, `S`
  season, `H` holiday (each cycling, with a toast). `configVersion` 2.
- **Performance:** §4.8's row. Baking the statics into bands (split at the
  streets, so whoever walks a street is in front of its houses and behind
  the next street's) took the first version's Low tier from 50% to 17%;
  the second's bigger scratch (the underside, the tower's headroom), the
  cloud sea and the ground cost more per frame, so the roots are baked
  rather than drawn pixel by pixel, Low runs at 12 fps, and frames are
  paced on a steady timeline (the next due a frame after the last, never
  sooner) rather than from the rAF timestamp, which over-ran. Low 21%,
  Medium 38%.
- **Tests.** Unit (`tools/sky-island.test.mjs`): the seeded random, the
  seasons, Easter and Thanksgiving, every holiday's run-up and day and the
  owner's dates, the names, 240 layouts' invariants and reproducibility,
  the routes (within a tier, between tiers by the stairs), the day's plan.
  Smoke: the cast on frame one (20 folk on more than one tier, 12 cats, 2
  dogs, animals), three tiers and three falls with four frames each, the
  terrain, the cloud sea and the ground baked, a pixelated canvas at about
  40 frames in 2 s, the same seed is the same island, `P` pins and unpins
  (and the storage shows it), a tap by the tower calls a cat up the stairs
  and it comes; `V` brings a whole island (three tiers, houses, three
  falls, residents), nobody waves until it's alongside and then both sides
  do; `O` brings an islet with a house; Halloween's pumpkins, Christmas
  Eve's lights, tree and lit windows with the cloud sea dark, Easter's
  eggs, a party on the owner's date with the folk in the square; Low bakes
  the trees and keeps fewer folk.
- **Seasonal:** every month's list (§4.2).

---

### 10.32 Matrix: the film's code (`matrix`, owner request, 2026-11-11)

"The Matrix needs to look like the real thing from the movie." The old one
was the generic clone: a font's katakana falling down the screen in a
fading column. Research (a frame study of the 1999 title sequence, the
designer's interviews, and Rezmason's widely cited recreation) says the
film does something else, and this is built on it:

- **The symbols never fall.** They sit in fixed cells; a wave of light runs
  down each column (`MatrixLogic.stepColumn`), lighting the cell it passes,
  and the trail behind the head goes dark again as the head moves on (the
  film ends its strings by erasing from the top, which looks the same).
  Each string has its own pace (half to full speed), a wobble, and (Stalls)
  holds still now and then; some start in mid screen; a column past the
  density never rains. Strings in a column keep their order (a new one is
  never faster than the one ahead). A lit cell's light steps with the
  head's row, not its fraction, as the film's does.
- **The glyphs** (`MatrixLogic.KANA` etc.) are the ones in the title
  sequence: thirty half-width katakana, all mirrored (Simon Whiteley
  scanned them from Japanese cookbooks and flipped them on purpose), 日,
  the digits (2 5 9 mirrored, 3 and 6 upside down), one Z, and
  `* + : = . < > " | ¦ _`, drawn as strokes on a 10 × 14 grid (SVG paths
  in a Path2D), so they look the same on every device and need no font.
  Resurrections adds the rest of the half-width set. Kana are listed
  twice, so the code reads as kana with numerals between.
- **Looks** (`look`, key L): *The Matrix (1999)*, the operator screens and
  the first film's titles: crowded (cells 1.35 tall), a flat dim trail with
  no gradient, a blazing head on a share of the strings (Bright Heads,
  default 30%; the film has about one in five), symbols that hold and then
  change together on an 8 Hz clock, and a few cells (8%) that change every
  tick. *Reloaded / Revolutions*: the sequels' titles, a trail fading from
  bright to dark. *Resurrections (2021)*: the bigger alphabet, a cooler
  green, and cells either dim or blazing (nothing between).
- **Colour** (`colour`, key H; C is the player's): each look's own phosphor green (hue 140°,
  112°, 135°), or amber, blue, red, purple, cyan, white, or the rainbow
  (a hue per column). The trail's lightness ramps to 0.8 and never reaches
  white; the head is paler and a little yellower, with a bloom.
- **The intro** (`intro`): the code drips in from the top, the middle
  column first, the three-quarter column next, the rest over a few seconds
  and the edges last; off, it has been raining twelve seconds already.
  R starts it over.
- **Depth** (`depth`): a second grid behind, cells 0.62 the size, dimmer
  and softened (its atlas drawn through a third-size canvas and back).
- **Touch:** a tap starts bright-headed strings from that row in the seven
  columns round it.
- **Settings:** look, colour, symbol size (scaled with the screen, so 4K is
  as crowded as a laptop), density, speed, trail length, bright heads,
  symbol changes, stalls, intro, depth, glow, scanlines (a baked stripe
  pattern), fps (30; the film ran at 24), tap. configVersion 2.
- **Cost:** see §4.8. Each layer draws on its own canvas and only the cells
  whose light or symbol changed are redrawn; a head's bloom spills into
  the cells round it, so a head that moves on, or one next to a change,
  takes its 3 × 3 block with it. The atlas is one white mask per layer
  (every glyph at sixteen steps, the head row with its bloom, the head's
  core), tinted per hue through `source-in`. Smoke: code on frame one in
  fixed cells (a cell's glyph is the same a second later with the clock
  off), about 30 frames a second, L and H, a tap's splash, one layer on
  Low. Unit (`tools/matrix.test.mjs`): the glyph set and its flips, the
  paths on the grid, the looks' ramps (flat, gradient, binary), the colour
  ramp, the intro order, the rain (speed, the trail, spacing, the density,
  the intro's hold, strings in order).

### 10.33 Cherry Blossoms, rebuilt (`cherry-blossoms`, owner request, 2026-11-11)

"Cherry blossoms totally doesn't work. Everything just glitches." The old
one was a sky gradient, eight random squiggles for branches and ovals
falling in straight lines, with a radial gradient made per petal per
frame and a colour string built by concatenation (an eight-digit colour
from the picker made it throw every frame). Rebuilt from nothing:

- **The tree** (`CherryLogic.tree`, from a seed): a bough reaches in from
  a top corner (`tree`: one bough, boughs from both corners, branches
  hanging in from the top, or none; `treeSide`), thick at the edge and
  tapering, bending down and out, throwing `branchCount` branches that
  throw twigs; every twig tip and many a joint carries a cluster of
  blossom (`blossoms` sets how thick). Drawn (`CherryArt.tree`) as filled
  outlines: the body, a shaded underside, a line of light along the top,
  lenticels on the thick limbs; the blossom as five-petalled flowers (a
  radial gradient per petal, yellow stamens, a deep centre) in the petal
  palette's tones, with buds. N grows another. (It does not sway: a
  rotated full-screen blit a frame cost more than everything else together
  on a phone, so the tree is still, and the petals do the moving.)
- **Petals** (`CherryLogic.makePetal`, `stepPetal`): most set off from the
  blossom clusters, the rest from above the screen. Each falls at its own
  terminal speed, is carried by the wind at its place (the breeze plus
  eddies, `windAt`), sways, tumbles (`rotationSpeed`) and flutters
  (`flutter`: turns on its long axis, drawn as cos of the turn, never
  edge-on, so it reads as a flake catching the light), nearer ones bigger,
  faster and drawn last. Three shapes (the notched cherry petal, a round
  one, a long one) in each colour, baked once (`CherryArt.petals`) at
  twelve turns and three flutter widths each, so a petal in flight is an
  axis-aligned blit from the atlas: a rotated drawImage per petal cost ten
  times as much. On the grass or the path a
  petal lands and lies flat, drawn once onto a pile layer and forgotten;
  every 150 the pile is washed with the ground's colour, so the oldest
  fade into it. On water it floats off with the wind, bobbing, drifting
  nearer, with a ripple where it landed. `fadeEnabled` fades them out
  above the ground instead.
- **Wind** (`makeWind`, `stepWind`): a breeze from one side that wanders,
  and gusts on top, `gusts` a minute, each rising, blowing and dying away
  over `gustLength` seconds and sometimes turning the wind round; a gust
  usually shakes a flurry of petals loose from the blossom. G calls one.
- **The sky** (`sky`): day, dusk, night (stars, a moon with its halo) or
  by the clock (`skyAt`: night till five, dawn, day, dusk from five,
  night from half past nine, blended, rebuilt as the hour's colours move
  on), with a sun's glow or the moon, and far hills in mist (three
  ridges, sums of slow waves with a little noise, each paler and higher
  than the one before). S moves the sky on.
- **The ground** (`ground`): grass (a green bank with blades at the lip),
  a path (packed earth with stones and a grassy verge), water (the sky's
  colour deepened, streaks of light), or none (petals fall out of the
  bottom). Above `host.insets.bottom`. W moves it on.
- **Touch:** tap the bough to shake it (a flurry from the clusters
  nearest the tap), tap the air for a puff of wind from that side, drag
  to push the air along (the wind follows the finger).
- **Cost:** see §4.8. Two canvases: the still scene (sky, hills, tree)
  behind, painted per resize and never copied again, and the moving one in
  front, cleared each frame for the ground strip (with the pile on it),
  the ripples and one axis-aligned blit per petal; petals × density. A
  resize keeps the petals in the air. Smoke: a bough
  and petals on frame one, landing on the grass, a gust when called, a
  tap's flurry, S and N, afloat on water at night. Unit
  (`tools/cherry-blossoms.test.mjs`): noise, the tree (the corner, the
  taper, the generations, blossom on every twig, depth order, the same
  tree from the same seed, the other styles), the wind (gusts about as
  often as asked, never nothing between), a petal's fall and landing, the
  water, the fade, the sky by the hour with no jumps.
- configVersion 2: `windChance`, `windDuration` and `showBranches` became
  `gusts`, `gustLength` and `tree` (legacy GONE).

### 10.34 Ice Patrol (`ice-patrol`, owner request, 2026-11-14)

The owner's brief: a never-ending flight over an ice planet, from the
pilot's seat of a snow speeder, the cockpit in view; hills, mountains and
plains of snow; realism, not pixel art; falling snow on and off; night and
day; a realistic cockpit with a realistic flight radar. The reference was a
"night drive over an ice world" ambience video.

**It is our own ice world.** No film's names, craft, props, lettering or
panel layouts: the speeder, its panel and the planet (a low sun, two moons)
are drawn from nothing but the brief, so the repo's "art drawn in code,
nothing that isn't ours" rule (§1) holds. The cockpit (below) takes only
the general shape the owner asked for: two struts over the pilot's head, a
console with swept wings. Every instrument, label and mark on it is ours. The catalog name is one string if the owner wants
another.

**The first wallpaper on WebGL.** Lit, shadowed snow to the horizon is a
GPU's work: on a 2D canvas it would be `putImageData` every frame, which
§4.8 forbids, or a few hundred flat polygons, which isn't realism. WebGL 1
shaders (they run unchanged on a WebGL 2 context), no extensions, no
libraries. Where there is no WebGL at all the same flight is drawn as
ridgelines on a 2D canvas (below).

- **The world (`IceLogic`, pure, unit-tested).** Two tileable 512² noise
  fields baked at start-up (about 100 ms): `a`, soft fractal noise, and
  `b`, ridged and domain-warped. The terrain is six looks at them, each at
  its own scale and turned its own way so the tiles never line up: a biome
  map (26 km a tile) that says plain, hills or mountains; mountain chains
  (9 km, up to 1150 m) with gullies and spurs (2.3 km); hills; rolls;
  drifts. `terrain.height(x, z)` is that formula in JavaScript, for the
  autopilot, the wingmen, the beacons and the radar.
- **The same formula in the shaders.** The fields go up as textures (height
  in 16 bits across two bytes, slopes beside it; the ridged field's slopes
  in a 16-bit texture of their own, because eight bits shade a sun-grazed
  mountainside in steps), every mip averaged from the floats. The vertex
  shader reads heights; the fragment shader reads slopes, so the light on a
  far mountain keeps its creases however coarse the grid under it. The
  shader's constants are written from `IceLogic.SHAPE`, and a unit test
  checks they are.
- **The ground's grid.** Nine square grids centred on the pilot, each twice
  as coarse as the one inside it (3 m between vertices underfoot, 768 m at
  the rim, 24 to 37 km out by tier), one vertex buffer drawn nine times.
  Towards its rim each grid's odd vertices slide onto their even neighbours
  and its texture reads blur one mip, so it meets the next grid exactly;
  the coarser grid discards what the finer one covers.
- **Camera-relative everything.** World coordinates only exist in
  JavaScript doubles. The shaders get positions from the camera and, for
  each layer, where the camera sits in its tile, so an endless flight
  never runs out of float precision (a test flies 3 × 10⁹ m from home).
- **Snow that looks like snow.** Sunlight plus blue sky fill (shadows on
  snow are blue), the bright horizon lighting the slopes that face it, a
  sheen off the crust, single crystals glittering close by, wind-carved
  ridges along the prevailing wind, blue ice where the flats are scoured,
  rock where it is too steep for snow to hold. Shadows are marched through
  a blurred copy of the big shapes (ten steps on High, six on Medium, none
  on Low); cloud shadows cross the plains. Small tiles repeat, and from
  afar that shows as a lattice, so the fine layers fade with distance.
- **The sky** is one function the fog shares, so the land fades into the
  sky it is under: a low polar sun (34° at most: long shadows all day),
  dawn and dusk bands, clouds, about 5,000 stars and a galaxy's band, two
  moons that are lit balls (their phase is whatever the sun makes it), an
  aurora, and in ice-crystal air a 22° halo with sun dogs.
- **Weather** (`weatherStep`): fronts come and go on their own, or the
  panel fixes clear, flurries, snow or blizzard. Snow thickens the air
  (26 km of view down to 420 m), greys the sky, takes the sun, and fills a
  64 m box about the pilot with up to 9,000 flakes, each drawn as the
  streak it travels while the eye's shutter is open; the box wraps, so it
  costs no CPU. At speed they pour out of a point ahead.
- **Night.** The big moon is the lamp (and casts the shadows); the landing
  lamps throw a pool on the snow ahead and light the flakes; far beacons
  blink red and stations show a row of windows.
- **The flight** (`flightStep`, pure): a slow wander, bent away from
  anything it couldn't comfortably climb, and by turns drawn to the
  mountains and out over the plain. It holds its clearance over what it is
  about to cross, climbs smartly and sinks gently, and banks into its
  turns. Sub-stepped at 1/60 s from elapsed time: the same ground at 10
  fps as at 120.
- **Wingmen** (0 to 3) hold slots off a heading that trails ours, so they
  swing wide in a turn, and each rides its own ground. Engines glow; nav
  lights and a strobe after dark.
- **The air** (`IceLogic.bob`, 2026-11-15, owner: "tone it down when
  there's no wind ... mute it completely for level flight"). What moves the
  view and the airframe apart from flying: in still air a slow float (a
  thirtieth of a degree, a breath every nine seconds; it was a twelfth of a
  degree of jitter), in wind a buffet that grows with the snow and comes in
  gusts (a quarter of a degree in a blizzard). `turbulence` (0 to 2, 1 by
  default) scales all of it, and at 0 the flight is dead level in any
  weather; banking and terrain-following are flight, and stay. A function
  of the time alone, so it is the same at any frame rate; reduced motion
  is 0.
- **The cockpit** (`IceCockpit`, 2D, over the view; rebuilt 2026-11-15,
  owner: "two columns ... you don't see a root as it's swept back behind
  you ... the controls are spread over a trapezoid half, also swept back
  ... buttons, additional gauges and switches that don't necessarily
  contribute (but perhaps sometimes switch)"). A two-seat skimmer's front
  seat, of our own detailing: dark, flat-panelled, angular.
  - *Canopy:* two heavy struts stand on the dash and lean in over the
    pilot's head, wider as they come back, and leave the picture at the
    top: no roof, no root. Three long faces each (one catches the day),
    jointed and riveted, a ribbed hose clipped along the shadowed face, a
    hydraulic ram bracing each off the sill. Rime in the corners of the
    glass always, more when it snows; a low sun finds the scratches; by
    night the instruments stand faintly in the windscreen.
  - *Console:* a hooded centre console with a brow (heading tape, two
    warning lamps, two bays of fat rockers), and wings that fall away to
    both sides under louvred walls, their panels sheared as panels angled
    to the pilot are. The yoke's two grips rise either side of the centre
    screen, on a canvas of their own moved by CSS: over with the turn,
    back with the climb, further with a hand on the stick. No hands: they
    did not look good enough.
  - *Three canvases:* the frame (repainted when the light outside moves a
    step, frost creeps a notch or a low sun arrives), the grips, and the
    gauges: fifteen times a second (eight on Low), **each instrument only
    when what it shows has changed** (`region`: a signature per
    instrument). Lamp halos are one sprite a colour; night's glow on the
    metal is baked into the frame.
  - **Terrain scan** (`scanCell`; it was a sweeping radar until the owner
    said "in the technology of this world, we wouldn't need the sweep, just
    a static scan of the terrain"). The centre screen shows the real ground
    all round the craft at once: relief lit from the north-west, elevation
    bands and a contour every fiftieth of the range, and whatever stands
    above our own height in a warning ink (amber, then red). The map is an
    offscreen canvas, a pixel a cell (144 a side, 80 on Low), north-up; it
    scrolls by whole cells as the craft moves and only the cells that came
    into view are scanned, plus four rows a tick (two on Low) so the
    warning ink keeps up. The screen turns it nose-up and slides it under
    the craft, so it moves smoothly between. Range rings, a nose line, a
    riding N, the craft in white; wingmen as carets, beacons and stations
    as red blips with the nearest named. `R` rescans at the new range.
  - **Attitude ball**, **heading tape**, and a **terrain-following scope**:
    the ground the autopilot is about to cross, side on, with PULL UP when
    it is working hard. A throttle ladder beside the scan.
  - On wide screens, the wings: airspeed, caution lamps (AP, LAMP, HEAT,
    ICE, TERR, WIND), the hour and the cold, and height and climb bars.
    All of it reads the world.
  - **The rest keeps house** (`IceLogic.greebles`: the time, a seed and the
    flight's state in; no memory). Seventeen switches: six follow the craft
    (autopilot, lamps, de-ice, panel lights, heater, boost: take the stick
    and AP drops; night throws PNL), eleven are thrown now and then, each
    on its own period (one somewhere every twenty seconds or so), and a
    rocker's window lights as it goes over. Twelve lamps steady, dark,
    blinking or flickering. The engine-load needle follows throttle and
    climb and never quite rests; three ladders creep over minutes (the
    cells' heat rises with the load). WARN blinks in rough air (snow over
    0.8) or a bank past 0.5 rad, and clears; MAN is a hand on the stick. On
    Low and under reduced motion the lamps hold, the needle rests and a
    switch is thrown an eighth as often.
- **Views:** canopy and panel, panel only, or none. `onScroll` turns the
  head with Android's pages. The panel has three sizes (`panelSize`: full,
  small ×0.68, extra small ×0.48): everything on it is drawn in shares of
  its height, so a smaller one is the same console lower down under more
  glass, the struts standing out on its sills. The wings' instruments
  appear where the screen is wide enough; spare wing is vented plate. An
  upright phone gets the centre console alone, its speed in the scan's
  corner.
  - The old cockpit (padded coaming, roof bow, round sweeping radar) is
    gone, not kept as a style: it shared no drawing code with this one.
- **By hand** (2026-11-15; `IceLogic.pilotStep`, `PILOT`). `W A S D` or the
  arrows turn (0.42 rad/s, banking to 0.85 rad), climb and dive; `Q`/`E`
  are the throttle (×0.45 to ×2.2, to 220 m/s at most: the dial's end); a
  drag is a stick centred where it began (setting `touch`). The hand
  never holds the height: it moves the *clearance the autopilot keeps*
  (8 to 420 m above the snow), so the look-ahead climb and the hard floor
  still apply, and **it cannot reach the ground**. When the ground ahead
  wants more than 0.6 s of full climb, the steering blends back to the
  autopilot's turn for lower ground (wholly, at 1.5 s). Five seconds
  with no key or finger down and the autopilot has it: the turn eases to
  its wander, the height sinks to the setting, the throttle returns to
  cruise. The scope reads `TF MAN` meanwhile. Nothing is saved.
  - Held keys need a key-up, which declared keys (§4.5) don't carry. With
    focus in the stage, the manager's own `keydown`/`keyup` hold a key
    (dropped on blur). A press forwarded by the player arrives only
    through the catalog (`nudge`): it counts for 0.6 s, longer than a
    keyboard's repeat delay, so a held key stays held either way.
  - `Ctrl` and `Shift` are not used: Ctrl+W closes the tab.
- **Keys:** flying as above; `X` weather (it was `W` in 0.18.0), `T`
  time of day, `V` view, `R` radar range.

**Cost, and a second governor.** The main thread steers (a few dozen
height lookups a frame), rescans a few rows of the terrain map (about
1,700 lookups a tick; a whole map, 62,000, only at the start and on `R`)
and repaints the instruments that changed.
The GPU does the rest, and the stage's governor (§4.8) can't see it: it
times the page's own callbacks. So the wallpaper watches its own frames:
when they arrive late for 2.5 s it gives up its shadows, then pixels
(render scale 0.75, 0.55, 0.4 of the tier's), remembers the step under
`host.storage` and tries one better each start. A software renderer
(SwiftShader, llvmpipe: a VM, headless Chrome) starts at the lightest step.

- Tiers: grid 96/64/48 cells a side, flakes × density, `shadows` and
  `sparkle` (medium) declared in the catalog; shadows are compiled out of
  the shader when shed, after fading.
- A lost context (`webglcontextlost`) is rebuilt; the cockpit repaints
  (a GPU restart blanks 2D canvases too).
- **No WebGL:** the flight, sky gradient and terrain as 34 ridgelines per
  frame on a 2D canvas, each a slice of the real `height`, under the same
  cockpit. Flat, but alive, and what the smoke test times.

**Tests.** Unit (`tools/ice-patrol.test.mjs`): the fields tile and repeat
from a seed; the bytes decode to the floats; terrain is continuous with
both plains and mountains; the flight covers the same ground at 10, 30, 60
and 120 fps and never comes within 4 m of the snow at any speed, height or
frame rate; by hand, the stick turns, climbs and is given back at five
seconds, and fifteen minutes of diving flat out at whatever is there never
comes within 4 m either; the sun, the moons and the light by the hour; weather comes
and goes; the air's bob (nothing at 0, still air far below wind, linear in
the setting, the same at any frame rate); the scan's relief and contours;
the switches (repeatable from a seed, thrown now and then, held when calm,
wired to the craft); the schema's options match the code's.
Smoke: in the air on frame one with wingmen, lights, the scan's map whole
and centred on the craft, and live gauges; the 2D fallback at the same speed on Low as High, and flown there by
held keys and a forwarded press until let go; night
lights the lamps and the stars; a blizzard closes in and buffets the view,
and not at all with Turbulence at 0, taken live; the keys step and
save; a phone's panel fits above the gesture bar.

**Not built:** terrain as a height-field ray march (dearer per pixel,
and software renderers crawl); sound; spray off the snow behind the
wingmen; putting it in Seasonal's winter months (the owner's call).

### 10.35 Sumo Championship (`sumo`, owner pick, 2026-11-15)

From an idea list the owner shared ("two miniature sumo wrestlers attempt
to force each other out of a circular ring ... each has strength, balance,
agility and aggression ratings; a tournament bracket automatically
progresses, complete with promotions and demotions"). The first of three
sports wallpapers; the owner chose a different look for each (this one a
side-on woodblock print) and seasons that only advance while watched.

**In Japanese (owner, 2026-11-15: "actual Japanese style names, in
kanji/hiragana; make it Japanese themed").** Ring names are built as real
ones are (a word, sometimes の, an ending such as 山, 海, 龍, 錦), each
with its hiragana reading, a romanisation and an English meaning. The
first words are ones no stable would choose (団子 dumpling, 河馬 hippo,
昼寝 afternoon nap, 布団 futon), which keeps the fun and makes a clash
with a real wrestler's name unlikely; it cannot be ruled out, since no
list of real names is consulted. Stables are invented; the six
tournaments are named by season or month (初場所, 春場所, 夏場所,
七月場所, 秋場所, 十一月場所), never by a city. Ranks (横綱, 大関, 関脇,
小結, 前頭三枚目), days (初日, 中日, 千秋楽), techniques (寄り切り,
叩き込み, うっちゃり), the standings (星取表) and the news (新番付:
優勝, 昇進, 陥落, 引退, 新入幕) are the sport's own words. The title is
written downwards. `gloss` (on by default) puts readings in Roman letters
and meanings in small English under the Japanese. A device that cannot
write Japanese (`SumoArt.hasKanji`: two characters drawn once and
compared, the one pixel read in the wallpaper) gets Roman letters and
English instead: headless Chrome in CI is such a device.

- **The rules (`SumoLogic`, pure, seeded, unit-tested).**
  - *Wrestlers:* sixteen, each with strength, balance, agility, aggression
    and weight (0 to 1), an age and a peak. No first word is used twice on
    a sheet, and no whole name twice in two hundred.
  - *A bout:* two bodies on the ring's east-west line (the bales at ±1),
    stepped at 60 Hz. After the charge they move as a pair, pushed by the
    difference of their drives. Each has `poise`: thrusts, a fast retreat,
    standing on the straw and failed tricks spend it, and at zero he goes
    down. Every half second or so each picks a move by its worth just
    then: push, thrust, belt grip, pull, throw, sidestep, brace. The
    technique is named from how it ended (eleven of them: `yorikiri`
    frontal force-out, `hatakikomi` slap-down, `utchari` backward pivot
    throw at the edge ...). A sidestep at the charge is rare, and the
    weaker, nimbler man's trick. Bouts run 2 to 25 s, about 5 s typically;
    the top of the sheet beats the bottom about four times in five.
  - *A tournament:* fifteen days, a round robin (everyone meets everyone
    once), ordered so the top man meets his nearest rivals last and each
    day's best pair fights last. Most wins takes the cup, after a playoff
    if shared.
  - *The new sheet (`nextBasho`):* places move by wins over losses; two
    cups running make a Yokozuna, who is never demoted but retires after
    two losing tournaments; the old retire; with the lowest losing
    records that makes two leaving, and two rookies come up (one in four
    a prodigy). Ratings drift up before a wrestler's peak and down after.
- **The show (`SumoAnimationManager`).** Per bout: enter, salt, stomp
  (east then west), crouch, the bout, the referee's fan and a caption,
  leave. After a day: the standings, with each record as white and black
  discs. After the fifteenth: the cup and a prize, then the news of the
  new sheet. `ritual` off skips salt and stomps except in a day's last
  bout; `pace` scales the ritual. An upset (a Yokozuna beaten, or a man
  seven places lower winning) brings cushions down.
- **The look (`SumoArt`).** Flat colours in one dark line, an indigo wash
  at the top of the sheet, paper grain. The hall (banners with crests that
  mean nothing, the crowd, the hanging roof and its four tassels, the clay
  platform and its ring) is one canvas painted per size; each frame draws
  it, the referee and two jointed figures. Evening by `host.now()` (after
  six) or pinned. An upright phone hangs the banners across the top.
- **State:** the league is `host.storage` key `world` (plain data, saved
  after every bout; never in thumb mode). **Keys:** `N` to the finish, or
  on to the next thing; `B` the ranking sheet. A tap throws a cushion
  (`touch`). The panel's "Found a new league" starts again.
- **Tests.** Unit (`tools/sumo.test.mjs`): names, the schedule, 1,500
  bouts all ending with a fitting technique, the better man usually but
  not always winning, thirty tournaments keeping a whole sheet, a saved
  league carrying on. Smoke: in the ring on frame one, a bout decided and
  saved and resumed by a new tab; the last day through the cup to the next
  tournament; a phone's layout and a tap.
- **Not built:** sound; the lower divisions (only two names a tournament
  cross the line); special prizes.
### 10.36 Pocket Hockey (`pocket-hockey`, owner pick, 2026-11-15)

From an idea list the owner shared ("three-on-three hockey with
exaggerated skating physics, ricocheting pucks, and tiny goalies ...
players develop signature moves, and teams build statistics across a
season; occasionally a goalie scores an improbable goal"). One of three
sports wallpapers; the owner chose a different look for each (this one
top-down pixel art), a league that persists, and seasons that only advance
while watched. Nothing real is named: the towns are on no map, and the
ice resurfacer is "Old Smoothie".

- **The league (`HockeyLogic`, pure, seeded, unit-tested).** A league and a
  game are plain data that carry their own dice (`rng`), so a seed plays
  the same game and a stored one carries on exactly.
  - *Clubs:* eight, fixed (Mount Mitten Yetis, Port Pickle Walruses,
    Biscuit Falls Gravy Boats, Snowglobe City Narwhals, Cocoa Springs
    Marshmallows, Fort Flannel Lumberjacks, Noodle Harbour Honkers, Tin
    Whistle Teakettles), each with colours, a rink and a mascot. Seven
    players each: two lines of centre, wing and defender, and a goalie.
    Speed, shot, hands, checking and wits (0 to 1), an age and a peak; no
    surname twice in the league, so a caption can use it alone.
  - *A season:* fourteen rounds of four games (everyone twice, home and
    away); two points a win, one for losing after regulation; the top four
    play best-of-three semi-finals and a final for the Big Biscuit Tin.
    One game a round is watched (`featured`: the followed club's, or the
    best-placed pair's); the others are played unwatched by the same
    simulation, seeded from the league and the fixture.
  - *The summer (`nextSeason`):* best player, best goalie, most hits;
    ratings drift up to a player's peak and down after; up to two a club
    retire and a rookie takes each place (the low finishers get the better
    ones); now and then a trade; a new schedule.
- **A game.** The rink is 200 × 100 with rounded corners; nets behind goal
  lines at ±82. Stepped at 60 Hz.
  - *Physics:* a skater pushes toward a target with limited force, so he
    arcs and overshoots; bodies push apart, and a meant check (or a hard
    enough accident) knocks one down, as does charging a goalie. The puck
    slides, bounces off boards, posts, the outside of a net and bodies, is
    carried on a stick, and scores by crossing the line between the posts.
    A goalie is a small body who shuffles along the line from puck to net
    and, a few steps after seeing a shot, lunges to where it will cross:
    saves are geometry and reaction time, not a dice roll.
  - *Steering:* the side without the puck sends its nearest at the
    carrier, keeps one between him and the net and marks the rest in their
    passing lanes; the side with it has a trailer and men looking for the
    most open spot; a loose puck goes to whoever can meet it first (by
    where it will be). A carrier thinks a few times a second: shoot (by
    range, angle and lane), pass (by lane, room and what the receiver
    could do), or clear it off the boards.
  - *Signature moves:* eleven kinds by position (slapshot with a wind-up,
    wrist shot, spin, stickhandle, burst of speed, one-timer, saucer pass,
    body check, poke check, glove save, kick save), each changing what the
    player can do and each given its own name ("the Turbo Teacup"). About
    half the founders have one; the rest, and every rookie, grow one from
    goals, assists, hits and saves, by what they are good at, and it is
    polished with use (three levels).
  - *The clock:* three periods (45 s, 75 s or 2 min); lines change on the
    fly and at stoppages; a side one or two down late in the third pulls
    its goalie for a fourth skater; level after three is two-on-two
    overtime, then both nets empty until a goal (on shots after 90 s more,
    which the tests have not seen happen). A goalie holding the puck with
    the far net empty heaves it there, and it goes in about one game
    in a hundred.
  - Measured over 400 unwatched games at the normal length: 5.5 goals a
    game (1 to 15), 24 shots on goal, 13 knockdowns, one game in seven
    past regulation, the home side winning 54%, and the better-rated side
    seven in ten.
- **The show (`PocketHockeyAnimationManager`).** A card before the game,
  the game, a card between periods while the resurfacer does three laps
  and a pass up the middle, three stars after it, the table (or the
  series), and on. The other games' scores arrive in a corner and on the
  cards. A goal: a band across the ice, the lamp, the scorer's end of the
  crowd on its feet, flashes. A hat trick or a goalie's goal: hats. The
  final: the winners empty their bench and skate rings round the captain
  and the tin, the mascot beside him, paper falling; then the summer's
  news, and banners for past champions hang in the corner. Playoff beards
  grow by the game. The announcer has one over-excited line at a time.
- **The look (`HockeyArt`).** Everything is drawn in code at the picture's
  own resolution: a 5×7 font; the arena baked per game pixel by pixel from
  the rink's geometry (so an upright phone simply stands it on end, the
  benches down the left); figures rasterised from above into a small grid
  in sixteen directions and a few poses, outlined, and kept; the home side
  in its colours and the visitors in white.
- **State:** `host.storage` keys `league` (saved when founded and after
  every game) and `game` (the game in progress, every five seconds of
  play, at each goal and period, and on pause). A new league opens in the
  middle of a first period; a returning one resumes at the step it left.
  Never in thumb mode. The panel's "Found a new league" starts again, and
  a status line says where the season is.
- **Tests.** Unit (`tools/pocket-hockey.test.mjs`, 12): the league and
  schedule; 72 games that end, plausibly, with every body and the puck
  inside the boards at every step; a strong side beating a weak one most
  times, not all; the same seed, and a game put through JSON mid-shift,
  ending identically; a stored league finishing its season identically;
  seven seasons rolling over whole; moves grown and polished; the goalie's
  goal; litter; the resurfacer's path. Smoke: mid-game on frame one, a
  goal called and saved and resumed by a new tab; the break, the
  resurfacer's stripe, the scores from elsewhere, the final horn, the
  table and the next game; the final, the tin and season two; the
  goalie's goal; a phone, and its taps.
- **Not built:** sound; penalties, icing and offside; ends swapped between
  periods; a coach; more than the one arena look; trading by merit.

### 10.37 The Never-Ending Baseball Season (`baseball`, owner pick, 2026-11-15)

From the same idea list as Sumo ("tiny teams play simplified baseball games
complete with pitchers, batters, base runners, and fielders ... players
accumulate batting averages, home runs, and ridiculous nicknames ...
probabilistic pitch selection, swing decisions, and fielding routes"). The
owner's decisions: 16-bit pixel art from above or a high broadcast angle;
the league kept in `host.storage`, advancing only while on screen; nothing
real anywhere. Towns, clubs, parks and people are invented (Port Biscuit,
the Thunder Geese, Barnaby Bellweather); no list of real names is
consulted, so a clash cannot be ruled out, only made unlikely.

- **The game (`BaseballLogic`, pure, seeded, unit-tested).** In feet, home
  plate at (0, 0). `pitch(game, [away, home], random)` advances one event
  and returns it as a `play`: all the wallpaper needs to act it out, on one
  clock that starts at the bat.
  - *A pitch:* chosen from the pitcher's own two to four (nine kinds, from
    fastball to eephus) by the count: his first pitch when behind,
    something bent when ahead, not the same thing three times. Aimed at a
    corner or wasted off the plate, and missed by his control, his
    tiredness and the pitch's own wildness. The batter sees its distance
    from the zone through noise that grows as his eye is poor and the pitch
    deceptive, and swings or not by the count. Contact from his bat against
    the pitcher's stuff. About two in five contacts go foul; a few fouls go
    straight up over foul ground, where somebody may get under one.
  - *A ball in play:* exit speed, launch angle, spray. `flight` gives its
    carry, hang time and height (a drag fudge on the vacuum formulas), or
    its roll, slowing on the turf; `edgeAt(park, bearing)` is the fence,
    fair or foul, and decides a home run by the ball's height against the
    wall's. `chase` asks all nine when each could reach each point of its
    path (a reaction, a few steps to get going, his speed): the first there
    plays it, in the air if he can; a late arrival dives and gets half of
    them.
  - *Then two clocks.* A throw takes time (`throwTime`), a runner takes
    time, and the earlier wins. Grounders: the force at second and the
    relay, or the sure out at first, or an infield hit; a man on third
    scores if the infield is back. Flies: a man on third tags if he thinks
    he can beat the throw. Hits: each runner takes what he is sure of, and
    one may try for a base more and be thrown out. Also steals, wild
    pitches, a batter hit by a pitch, errors, a home run taken back at the
    wall, one inside the park.
  - *The book:* every event is credited at once to the game's box score
    and the player's season, and a run is charged to the pitcher who put
    the runner on. Pitchers bat ninth. A tired or battered arm comes out;
    the best reliever is kept for a lead of three or fewer in the last
    inning. Win, loss and save are decided as the lead changes.
  - *Simplified:* no bunts, pinch hitters, balks, intentional walks,
    dropped third strikes or infield fly rule; a run is unearned only if
    the runner reached on an error or scored on the error itself; a
    walk-off counts every run of its play.
- **The league (`BaseballLeague`).** Eight clubs of thirteen (eight in the
  field, three starters in turn, two relievers), each with six ratings (and
  three more for a pitcher), an age, a hand and a park. Ten kinds of park:
  a short porch, a 32-foot wall, thin air, a bog, a billiard-table infield,
  acres of foul ground.
  - *A season:* 21 days, everyone meets everyone three times, ten or
    eleven at home. One game a day is watched (the club you `follow`, or
    the best pairing by the standings); the other three are played out by
    the same rules when the day begins, shown as out-of-town scores that
    keep pace with the watched game's inning, and booked with it.
  - *The series:* the top two, first to three, for the Golden Gravy Boat.
  - *The winter (`newSeason`):* career totals, a year older, ratings
    drifting up before 27 and down after 31, up to two retirements a club
    from 35, rookies in their places, five prizes, and the news of it.
    Against dynasties: every rating is pulled a tenth of the way back to
    the middle each winter, and the lowest clubs get the better rookies.
    Measured 2026-11-15 over 30 seasons on each of four seeds: the champion
    repeated 20 times in 116 (17%; chance is 12.5%), the longest run was
    three titles, and the most for one club in 30 was 7 to 9. Before
    that it was 40%, with one club taking 20 of 30.
  - *Nicknames (`NICKS`, `christen`):* 28 deeds, each with its own names:
    habits (strikes out in 36% of at-bats: the Ceiling Fan), feats (six
    home runs: Moonshot) and moments (a walk-off home run: Mr. Bedtime).
    A name belongs to one man; a habit names two men at most; a better
    story replaces a lesser.
  - A league is founded four to eight days into its first season, and
    first seen in the middle of a game.
- **The show (`BaseballAnimationManager`).** Set, wind-up, the pitch, the
  call; a ball in play acted out from the play's own times (the fielder's
  run, the catch or the dive, each throw, each runner, a slide where a
  throw is coming); the result; between halves the sides trot off and on
  under a sheet (standings, leading bats, leading arms, "know your
  league"). After the last out: the final with its decisions and star, the
  standings, tomorrow's matchup. After the series: the trophy, confetti,
  and the winter's news. `pace` scales the pauses; a nine-inning game is
  about 290 pitches and about sixteen minutes at Normal (measured).
  - *Charm:* day, dusk or night by `host.now()` (or pinned), the lamps
    coming on one after another; a rain delay now and then with the tarp
    and nobody on the field; the seventh-inning stretch; a mascot on the
    home dugout; a hot-dog seller on the rim; fireworks for a home run at
    night; the crowd on its feet in patches by how excited it is.
  - *Words:* the scoreboard behind centre (line score, count, outs, HOME
    RUN!); cards for the batter and pitcher with a pitch tracker; an
    announcer's line (`BaseballTalk`: several ways of saying everything);
    the league and the out-of-town scores in the top corners. `captions`
    off leaves only the park and its scoreboard.
- **The look (`BaseballArt`).** The picture is its own pixels (about three
  CSS px each on a laptop, `pixelSize` scales it), scaled up pixelated. The
  park is one bake per game, size and light: every pixel is asked where on
  the field it is, by the same `edgeAt` the rules use, so the fence the
  ball clears is the fence drawn. Mowing patterns, seat colours, the wall
  and what lies beyond it differ by club. Lettering is two faces of its
  own (5×7 and 3×5, capitals), so no font is needed. The men are a dozen
  rectangles each. An upright phone stacks the cards under the field and
  pans the picture after the ball; there (and wherever the picture is under
  400 pixels wide) the scoreboard is a panel fixed at the top with the two
  corner captions under it, so the line score is never panned off screen.
  An inning of ten runs or more is written in full, spilling into the gap.
- **State:** `host.storage` key `world` (plain data, about 65 KB), saved
  after every turn at bat and every turn of the calendar; never in thumb
  mode. **Keys:** `N` the next half-inning, with Shift the end of the game;
  `S` the standings, the leading bats, the leading arms. A tap starts a
  wave and a beach ball; on the hot-dog seller, a hot dog (`touch`). The
  panel's "Found a new league" starts again, and its Follow list takes the
  clubs' names from `host.panel`.
- **Tests.** Unit (`tools/baseball.test.mjs`): leagues whole and plain;
  the calendar; 417 games refereed pitch by pitch, each box score proved
  (line score, batters' and pitchers' lines, the putout proof, decisions);
  every play sane on its own; a season's numbers (measured 2026-11-15 over
  252 games: 4.9 runs a side, .273, 0.99 home runs, 8.8 strikeouts and 3.4
  walks a side, 294 pitches a game, steals 78%); the better club winning
  more but not always, and parks mattering; the same dice, the same game;
  a league saved mid-count carrying on exactly; twelve seasons with their
  series and winters; nicknames; the announcer; a cheap-and-clean source
  check. Smoke: mid-game on frame one, a pitch, a ball in play, a turn
  recorded and saved and resumed by a new tab; a final, the standings, the
  series, the trophy, the winter; a phone; the keys, rain, captions off, a
  new league. On the phone, the scoreboard, both corner captions, both
  cards and the announcer are checked to be wholly on screen above the
  gesture bar and clear of each other, in all eight parks.
- **Not built:** sound; substitutions other than pitchers; trades; a
  record book across seasons; umbrellas in the rain.

### 10.38 Wayfarer (`wayfarer`, owner request, 2026-11-15)

The owner's brief: a never-ending walk through a fantasy world, "cozy more
than anything", in the style of a well-known online fantasy game (animated
cartoon, but semi-realistic), with day and night, "just wandering into
forests, lakes, mountain passes and lots of towns and fantasy cities"; and
for the whole batch, "be extra creative here. fun is the theme." Decided
with the owner beforehand: all three cameras as a setting (behind the
traveller by default, through their eyes, a cinematic drift) with a key to
switch; and an original world.

**It is our own world.** The *style* is what was asked for: chunky
proportions, big readable shapes, painted colour, soft stepped light. No
names, races, places, characters or designs come from that game or any
other, and nothing is real (§1). Every shape is modelled in code as
triangles: no asset files, no libraries, no network. "Wayfarer" is one
string in the catalog if the owner wants another name.

**The second wallpaper on WebGL**, and built the other way round from Ice
Patrol (§10.34). There the ground is a formula the shaders evaluate; here
the ground has a road, bridges, lakes and towns worked into it, which no
shader could evaluate cheaply. So JavaScript builds the land as triangles,
a square at a time, and the height the traveller walks on is the same
function call that made the vertices: the two cannot disagree. WebGL 1
shaders (unchanged on a WebGL 2 context), no extensions.

- **The road (`WayLogic.world(seed)`, pure, unit-tested).** It runs on in
  +z for ever and wanders in x (two noises, never steeper than about 50°
  off its line), so it cannot cross itself. Every 360 m of it is a *leg*
  of one country, with a *place* at its middle. Everything is a function
  of the seed and of where you ask: nothing is stored, nothing repeats, and
  the hashes take whole numbers of any size, so three million kilometres
  out is the same kind of world (a test walks there).
- **Nine countries** (eight at first; the deep forest came with the third
  pass, below, as did two legs to a stretch): meadow, forest, lake, pass, farm, moor, coast and
  grove (the enchanted one: giant mushrooms, teal trees with glowing
  motes, wisps). Each run of eight legs is a shuffle of all eight, so the
  walk always arrives somewhere new and never meets the same country twice
  running. Each sets how the land lies (hills by the road, how high the
  valley's sides climb: 215 m in the pass), how wooded it is and with
  what, its grass, its small plants and its animals. Neighbours blend over
  the middle of the stretch between them.
- **Places.** By a roll per leg and the *Towns and cities* setting: a
  walled city (never in the pass, by the lake or on the coast), a village
  (a hamlet in the pass), or the country's own landmark: standing stones
  or a castle on a mound (meadow, moor), an elder tree with a door or a
  ruined tower (forest), a jetty and a fishing hut (lake), a cairn and a
  broken watchtower (pass), a windmill and barn (farm), a ruined abbey
  (moor), a lighthouse (coast), a fairy ring under a giant mushroom
  (grove). The road is the same road whatever is built along it.
  - *A village* lines its street, raggedly (each house set back and turned
    a little differently): timber-framed houses built for their plots, no
    two alike (floor heights, roof pitch, jetties riding out on a beam,
    end-on or side-on gables in lapping courses with a ridge, a dormer, a
    stone ground floor, a lean, ivy, sills and window boxes, shutters, a
    lintel and a step, a lantern on a bracket, a chimney with a pot), an
    inn and shops with hanging signs, barrels, crates, sacks and planters
    by the doors, a plaza with a well and two stalls, a notice board, a
    chapel, a cart, a bench, bunting, lamp posts, people, and a cat on a
    garden wall.
  - *A city* is an oval of wall (crenellated, a tower every third length,
    flags) the road runs through gate to gate, two rows of tall houses
    either side of the high street with a lane between them, a square with
    a fountain and five stalls (fruit, loaves, cloth, pots, fish), a keep
    and a spire tall enough to be the skyline from the street, washing
    across the back lanes, guards at the gates.
- **The ground (`ground(x, z)`).** The road's own height (it climbs from
  one leg's middle to the next, gently, and is level where a stream
  crosses), plus hills that begin a few metres from the road, plus the
  valley's sides rising with distance. A settlement stands on levelled
  ground; a castle on its mound. A lake or a bay of the sea is cut into
  one side, in the road's own coordinates, so the shore can never reach
  the road, and the hills stand back from it. A stream runs level right
  across the land to its edge in a valley of its own (the hills stand
  back from it too), under a stone bridge at the road, which is what
  `surface()` stands the traveller on.
- **Squares (`WayModels.square`).** The near ground is 64 m squares at 2 m
  a cell, each with everything rooted in it (`scatter`: trees on a jittered
  grid, with glades; small plants thick by the road and thin away from it;
  what the place put there; fences, lamps, milestones, shrines and resting
  places along the road; who lives there) stamped into one list of
  triangles. Far ground is 256 m squares at 16 m, carrying only buildings
  (houses with the trimmings left off: a fifth of the triangles) and a
  third of the trees as four or ten triangles each, and giving
  way (a hole in the shader) where the near squares are. A vertex is 24
  bytes: position, normal with occlusion, colour, and four bytes the
  shaders read (how far inside the road's edge, cobbles, furrows, snow; or
  sway, glow, flutter, phase). Squares are built as the walk reaches them,
  each in steps of three things at a time (`squareSteps`, a generator), 3 ms
  a frame, and the drawn set changes only when a new one is whole.
- **Positions from the camera.** A square's vertices are in its own metres
  from its own corner; the shaders are given that corner *from the camera*,
  worked out in doubles. Everyone who moves is stamped already relative to
  the camera.
- **The look.** Colour is painted on the vertices (grass by country and
  season, rock where it is steep, sand at the water, snow where it is
  cold, the fields of a farm, heather on the moor) and then worked over in
  the fragment shader with a small tileable texture of four noises: three
  tones laid with a loaded brush, strokes close by, heavier on leaves. The
  road is a ragged-edged band of worn earth with ruts, cobbled in town.
  Light is a wrapped terminator pulled part of the way into three steps,
  warm sun and cool sky, a rim of sky on edges that turn away. Roofs are
  laid in lapping courses and flare at the eaves.
- **Shadows** (`shadows`, medium): one picture from the sun (or the big
  moon) of what stands on the ground within 110 m of the traveller (70 m
  on Medium), depth packed into three bytes of an ordinary
  texture, four taps weighed by where between them the point falls. The
  box moves in whole texels, so shadows do not swim as the walk moves it.
- **Water**: the sky lying on it at a glance (with `mirror`, medium, the
  clouds and far ranges too), clear in the shallows, a line of foam at the
  shore, the sun's glitter, rings where rain lands.
- **The sky** is one function the fog shares: a sun that rises behind the
  traveller's right shoulder and sets ahead and to the left (so the
  evenings are walked into), heaped clouds lit from the sun's side, two
  far ranges of mountains with snow on them (taller near the pass), about
  6,000 stars and a river of them, and two moons that are lit balls. Mist
  lies in the low ground at dawn and dusk.
- **Night.** Windows glow (it is in the triangles: a far city's windows are
  lit too), lamp posts throw pools on the cobbles (the nearest four are
  real lights in the shaders; the rest are glows), the traveller's lantern
  hangs from the staff, mushrooms and wisps shine in the grove, fireflies
  blink where there is cover.
- **Seasons** turn along the road, one every dozen legs, so the walk goes
  out of summer into autumn: leaf and grass colours, blossom and apples,
  bare trees and snow on roofs and ground in winter, leaves or petals in
  the air. The pass is always cold: rain falls there as snow.
- **The journey** (`journeyStep`, pure). The traveller walks (1.75 m/s at
  Pace 1, a little slower in town), stops a few seconds where there is
  something to look at (the lake, a city's gates ahead, a castle, a
  landmark), keeps right while somebody passes, and after dark leaves the
  road at the next resting place, sits by a fire for most of a minute and
  walks on. Linear in elapsed time: the same road at 10 fps as at 120.
- **Who else is there** (`WayActors`): townsfolk who stroll, stand at
  their stalls, talk, sit, hoe, fish and guard, and wave as you pass;
  children running rings; sheep, cows, goats, deer (which bolt), rabbits,
  hens, cats, ducks, gulls, crows and pigeons (which fly up); a windmill's
  sails; boats; other travellers' camps at night; carts, riders and
  walkers coming the other way; and across the sky geese, and far off a
  dragon, an airship or a balloon. Each is a few small models on a
  skeleton of matrices posed by sines.
- **Cameras** (`camera`, pure): *follow* is on the road behind the
  traveller; *first* is their eyes; *drift* cuts every quarter minute
  between six shots (a crane rising behind, the traveller walking up to a
  camera in the road, a bird's view, a low shot backing away, one they
  walk past, a high one), with a breath of dark at each cut. Every low
  camera sits on the road itself, where nothing is ever built or grows,
  and the others are above the rooftops, so none needs to know what it
  might be inside. Townsfolk sidestep the camera (6 m in front of it, 3 m
  behind), the traveller and one another, and anything that still comes
  within two paces of the lens thins out to nothing in the shader, so no
  head or branch fills a corner of the picture. A drag turns the view and it eases back after four
  seconds; `onScroll` turns it with Android's pages.
- **Keys:** `V` camera, `T` time of day, `X` weather, `N` on to the next
  place (the walk jumps to just short of it, through the same dip).

**Cost, and its own governor**, as Ice Patrol's: the stage's governor
(§4.8) times the page's callbacks and cannot see the GPU, so the wallpaper
watches its own frames. Late for 2.5 s, it gives up shadows, then pixels
(render scale 0.75, 0.55, 0.4), and with the last two the outer ring of
squares; it remembers the step under `host.storage` and tries one better
each start. A software renderer starts at the lightest step.

- "Day", as a fixed hour, is mid-morning: the sun high enough to be day
  and low enough to light one side of a street and shade the other.
  Occlusion painted on the vertices (the foot of a wall, under the eaves,
  under a tree) darkens the sky's light there.
- Tiers: near squares 7×7 (High) or 5×5, far 9×9, 7×7 (Medium) or 5×5 (Low), with the fog drawn in to match; trees and
  plants × density, by a hash, so a thinned wood is the same wood;
  animals × (0.4 + 0.6 density); drops × density; `shadows` and
  `mirror` declared in the catalog.
- A lost context (`webglcontextlost`) is rebuilt and every square uploaded
  again.
- Reduced motion: no head bob and little sway. A whole first frame is
  built and drawn in `start()` (about 0.3 s of building on this machine).
- **No WebGL:** the same walk as a flat picture on a 2D canvas: thirty
  slices of the real ground in the country's colours, water where it
  lies, the road as a ribbon, the nearest trees and houses as cut-outs
  (windows lit at night), and the traveller. It is what the smoke test
  times.

**The upgrades (owner request, 2026-11-15).** "Make this happen smartly. Be
extra creative." Five asks, then three more travellers; nothing was to be
dropped. Still our own world: no game is named anywhere, and no name, people,
creature, marking or design is taken from one.

- **The orbiting camera** (`orbit`, a fourth camera; `V` steps through all
  four). It looks at the traveller from any bearing (0° behind them, 90° at
  their right hand, 180° in front, measured from the way the road is going,
  so it keeps its side of them as the road turns) and any height from 2° in
  the grass to 90° straight overhead, 2.5 to 60 m out. A drag sets bearing
  and height directly (60% of a turn across the screen, 0.62π down it) and
  it **stays**; the wheel moves it in and out (`host.gestures` has no pinch,
  so on a phone the distance is the slider). *The orbit* is `fixed` (holds)
  or `turning` (a turn every 75 s with the height swaying ±9°; a hand on it
  takes over, and it carries on from there after 4 s; reduced motion holds).
  Where it is left goes into the settings on the sliders' steps
  (`orbitAzimuth`, `orbitElevation`, `orbitDistance`, saved 0.6 s after the
  hand is off it), so it survives a reload and can be set from the panel.
  Android's pages turn it about the traveller.
  - *It is the one camera that leaves the road*, so it is the one that knows
    what it might be inside. `WayLogic.sightline` sweeps from the traveller
    out toward the camera against the ground, the water and `world.solids`
    (per 64 m square, cached: every tree as a drum for its trunk and one for
    its crown, every house as a box to its ridge, walls, towers, gates with
    the arch left open, keeps, the castle's rock, stalls, wells); the camera
    comes in at once to just short of the first thing met and goes out again
    at 7 m/s when it has gone; the place itself is then checked (`inOpen`)
    and lifted clear of the ground. The near-lens fade still thins whatever
    comes within two paces.
  - The squares were always built all round the traveller, not ahead, and
    the sky, the ranges and the fog are functions of direction, so looking
    back and down needed no new land. Nothing is back-face culled. The
    cloak got an inside. Who is posed no longer depends on being in front
    of the eye when the eye looks steeply down.
  - Without WebGL, orbit is the follow camera.
- **Fidelity.** A new primitive, `WaySoup.tube` (rings along a path, smooth
  round, swelling and narrowing, with painted folds, ragged hems and caps),
  `mark` (a colour painted by where a vertex is: stripes, patches, socks),
  `gloss` (metal, glass and eyes catch the light; it rides in the colour's
  fourth byte) and `course` (the shaders lay coursed stone, flags or lapped
  tiles; it rides in the sign of the occlusion byte). In the shaders: whoever
  moves is lit across the whole of a limb instead of in steps, with a rim of
  the sun's own light; a specular term; masonry and roof tiles.
  - *People* (`way-people.js`): the same skeleton, hung with limbs on real
    joints, hands with a thumb, a face (brow, nose, jaw, ears, eyes that
    shine, a mouth), hair with weight (short, long, a bun, braids, a mane, a
    high tail, loose to the waist), tunics with folds and a skirt, belts
    with a buckle, a pouch and a knife, a pack with a flap, pockets, a
    bedroll, a pan and a coil of rope, a cloak that is one sheet with a
    lining. About 3,000 to 3,500 triangles a traveller. The traveller is
    always this; townsfolk and walkers within 10 m of the eye (7 m on
    Medium) are; further off and on Low they are `WayActors`' figures.
  - *Animals* (`way-companions.js`): one four-legged rig (a body that swells
    from rump to chest, legs on two joints with paws or hooves, a neck, a
    head with a muzzle, a nose, ears of five kinds and eyes, tails of nine
    kinds, seven gaits, and sitting, lying, curling, belly-up and tucked)
    and one bird rig (a neck and head, a beak, two-length feathered wings
    that fold, legs with toes, a walk, a perch and a tuck). The roadside's
    sheep, cows, goats, deer, rabbits, cats, hens, ducks, crows and horses
    are these within 24 m.
  - *Scenery* (`way-detail.js`): trees with roots, boughs and foliage in
    clumps (firs in ragged tiers, willows with a curtain of withies, birches
    with marked bark), boulders in facets with moss, a well with its bucket
    and windlass, fences of round posts, signposts, spoked wheels; houses
    near the road get window frames with crossbars and lintels, doors in
    planks with strap hinges and a ring, corner posts in the round; stone
    is coursed and roofs are tiled everywhere.
  - *Level of detail* is where a thing stands, so nothing pops as the eye
    moves: the fine models are built only in the 3×3 squares about the
    traveller and only within 26 m of the road (13 m on Medium, never on
    Low); a square is rebuilt finer as the walk reaches it and kept until it
    is left behind. In a grand city the back rows of houses are the far
    squares' plain shapes.
- **Companions**: 46 kinds, up to twelve at once (six until 2026-11-16).
  *The company* is Surprise me (by the world's seed: one of the named
  cats, then one from each other kind by turns) with *How many* (0 to 12,
  3 by default), or "I will choose them", which shows chips for all 46 in
  five rows by kind; whoever is ticked walks, in the order ticked. (Until
  the fourth pass, below, there was also a "first companion" and a mode
  for each kind.)
  - **The named cats** are the owner's own, from The Cat vs. the Ornament
    (§10.27) and Sky Island (§10.31), by the roster's names and coats (a
    unit test reads `CatOrnamentLogic.ROSTER` and checks each): **Moofy**
    (black and fluffy, with the white grin; lags and lurks), **Butters**
    (chunky buff tabby; at the heel, belly-up by the fire), **Waffles**
    (white with black patches; scouts ahead), **Ras The Destroyer** (a
    tuxedo; chases butterflies), **Ibbie** (grey tabby; asleep on the
    pack), **Maus** (tortie, half her face brown; the zoomies), **Turkey**
    (big mottled grey; plods, belly-up at rest), **Harry** (orange and
    white; chases), **Kitty Toes** (a fluffy blue Persian with orange
    eyes; walks a little apart). And a stray tabby.
  - Dogs: a brown dog, a long-eared hound (nose down, then a run to catch
    up), a sheepdog (weaves about behind, herding), a terrier pup. Farm: a
    pack pony and a donkey with panniers (led), a goat with a bell, a pig, a
    lamb, a goose, a hen (rides the pack), a duck with three ducklings in a
    line. Wild: a fox, a badger, an otter, a hedgehog (rides), a snow hare,
    a spotted fawn, a bear cub, a red squirrel (rides), a moss-backed
    tortoise with a toadstool on its shell, a frog, a raven and a hawk
    (circling overhead), an owl (asleep on a shoulder by day, flying at
    night). Stranger: a wisp, a paper-lantern spirit with a face, a dragon
    whelp (flies low, then walks; breathes a little smoke at rest), a
    clockwork beetle whose key turns, a brass automaton with a stovepipe, a
    mushroom-folk child, a small cloud that rains on nobody, a spellbook
    that flaps, a moon moth, a great snail with a lit window in its shell,
    a boulderling.
  - `WayLogic.companionStep` (pure): each has a place about the traveller
    in the road's own terms, on the road's width and out of the middle of
    the picture; later ones step round earlier ones and everyone round the
    traveller; they keep right while a cart passes; scouts run ahead and
    sit to wait; laggers sniff and catch up; chasers go after a butterfly
    that is drawn; fliers circle and come down when the walk stops; by the
    fire each has its own place round it, settled its own way (the big ones
    graze a little way off); a deer near the road makes the dogs point and
    the timid hide behind the traveller's legs.
- **Travellers**: nine. The hooded ranger (default, as before), wizard, bard
  and knight; and
  - **the barbarian woman**: athletic, in a fur top tied at the neck, a
    ragged fur kilt over fur trunks, fur boots bound with thongs, bracers,
    gold arm rings, a necklace of teeth, a baldric, a braid down her back
    and two in front, blue warpaint (a toggle), a bearded axe on her back
    and a spear to walk with. No cloak, hood or staff: after dark she holds
    up a burning brand (and puts it by when she sits at the fire). Clothed
    as a swimmer is; nothing more.
  - **the barbarian man**, in a pelt and kilt with a sword and a long axe.
  - **The Evenfolk** are our own tall, long-eared people of the twilight
    woods: lilac-skinned, with eyes that hold a light and three pale stars
    along each cheekbone. **The druid** (full-figured, in a laced bodice
    and two lengths of leaf skirts, a feather mantle, teal hair to the
    waist, a helm of bark and bronze with a stag's antlers, a staff of two
    twisted stems round a glowing bud) **changes shape**: a bear, an
    owl-beast (our own: round, barred, upright, with tufts, lamp eyes and
    stubby wings) or a great black cat, each keeping her antlers, a collar
    of leaves and her glowing marks. `WayLogic.shiftStep` (pure, by the
    seed and elapsed time): Now and then is 80 to 230 s herself and 35 to
    120 s changed, Often about a third of that, Never only at the key; the
    bear is likelier in forest and pass, the owl-beast in the grove, the
    cat at night; a change takes 1.7 s (one shape fades as the other comes,
    in a swirl of leaves and green-gold motes; reduced motion gets the fade
    without the swirl) and never begins at a rest (it waits for the road),
    though she may sit by the fire in the shape she has. The cats in the
    company bristle and drop back when the bear appears. **The ranger**
    (id `archer`: lean, silver hair tied high, leathers, a short cape, a
    quiver, a longbow in her hand) sights along an arrow at a view stop;
    nothing is ever shot.
  - **the rogue**: dark leathers, a cowl and a scarf over the nose, belts
    and pouches, a dagger strapped to each thigh. `WayLogic.stealthStep`
    (pure): she goes unseen past the guards at a city's gate, into a town
    after dark and while somebody is coming up the road (and, on Often, for
    a stretch now and then), walking low; never at a rest, where she tosses
    a knife instead. Unseen she is drawn apart, see-through: an outline of
    the sky's light, with no flicker. `G` does either craft now.
  - The archer and the rogue carry a horn lantern at the belt after dark.
- **Grand cities.** In meadow and farm country about one place in sixteen is
  a grand city (never two running): a curtain wall 284 m by 224 m with a
  tower at every joint, round and square by turns, a moat all round it, and
  at each end a gatehouse (two drums under cones, a gallery on corbels, the
  portcullis half up, banners) with a drawbridge on chains. Inside: the high
  street between four-storey houses, three streets across and two lanes
  each side, a market square 46 m across with a fountain, a pillar, a ring
  of stalls and a roofed market hall, a guild quarter with a belfried hall,
  a cathedral (two west towers under spires, a round window, buttresses, a
  spire over the crossing), and on a 16 m rock against the wall the castle:
  an inner wall of eight towers, a gate at the head of a ramp on arches, a
  great keep with four turrets, a great tower 40 m high under a 13 m spire,
  a watch tower, a hall and a chapel. Outside each gate: shacks, a barn,
  stalls, carts, a windmill, and three times the traffic. It lies level
  from gate to gate (its height is halfway between its neighbours', and the
  road does its climbing outside), and the woods stand back from the road
  for 400 m so the towers are seen coming. The far squares carry all of it
  in plainer builds with the windows lit, and keep a handful of lights
  (`beacons`) that are drawn as glows from as far as the land is. The
  traveller stops 34 m short of the gate to look, turned toward the castle.
- **A second pass (same day, after review): rounder, and nothing left out.**
  - *People* were still dolls. The near figure is now 7,500 to 9,000
    triangles: limbs in twelve sides with a calf, a thigh, a forearm and an
    upper arm that swell and narrow, caps over the knee, elbow, ankle and
    heel so no joint shows a gap, a deltoid that slopes into the arm, a
    trunk in ten or eleven rings (ribs, waist, hips; a man's, a woman's with
    a narrow waist, a bust and slight shoulders, and the druid's hourglass),
    collarbones, a hand with four fingers that curl and a thumb across
    them. The head is one form (chin, jaw, cheek, brow, cranium) with eyes
    set under lids (white, iris, pupil, a point of light), brows, a nose
    with a bridge and wings, two lips and the line between, ears; hair is a
    cap in locks with a fringe and side locks under whatever else it does.
    Women's limbs are 84% as thick and their shoulders 45 mm narrower a
    side. Fur is tufts standing out of every edge (`tufts`), the
    barbarians' kilts in two lengths; a toned belly is painted on the bare
    ones. The shaders' brushwork is turned down on whoever moves (it made
    faces blotchy).
  - *Animals*: bodies in sixteen sides and some twenty rings (so stripes,
    patches, socks and bibs have somewhere to be painted: the named cats
    are told apart by their coats), a shoulder and a haunch each side, legs
    with a cap at the joint and paws with toes, a neck that roots in the
    chest, tufts at the chest and cheeks, tails that curve; birds and the
    owl-beast feathered in rows. About 3,500 triangles; a `lite` build of
    the same animal (a third of that) stands in beyond 16 m (6.5 m on
    Medium) and on Low.
  - *Scenery*: tree trunks in ridged bark with boughs, foliage clumps
    broken at the edge by sprays of leaves; bushes as huddles of clumps on
    stems; tufts of thirteen blades and flowers with petals within 9 m of
    the road; boulders in beds of stone with moss and grass at the foot;
    fine carts (stakes, rails, shafts, an axle, sacks, a lantern), stalls
    (turned posts, a scalloped valance, a scale), slatted benches, lamp
    posts (a stepped foot, a fluted post, a scrolled bracket, four panes
    under a cap) and bridges (the arch's ring of stones with its keystone,
    a coping, cutwaters); gulls on the bird rig; the far-off dragon is the
    whelp's own kind, grown.
  - *The rogue* goes over a fence between the road and a fire
    (`WayLogic.vault`, only where `fenceAt` says the land has one) and,
    stopped, crouches with a hand down to the first cat of the company,
    which comes to it (`ctx.pet`).
  - *(Superseded 2026-11-16: the key was removed with `configVersion` 2;
    see the fourth pass.)* *The old single companion is kept*, not dropped: `companion` (default
    `fox`, as it always was) is now "First companion", who always comes and
    leads the company, with every kind to choose from, "Nobody in
    particular" and "Alone". So a saved `cat`, `dog`, `pony` or `wisp` is
    still there and a saved `none` still walks alone. The settings system
    has no migrations (§4.1: overrides from another `configVersion` are
    dropped whole), so keeping the key and its meaning *is* the migration,
    and `configVersion` stays 1.
  - *Night was not brighter*: the same snowy village rendered by the old
    code and the new averaged 155 and 153 of 255 (`dist/shots/sheet-night.png`).
    The smoke check failed because the nearest town to its start is now a
    grand city, lamp-lit and cobbled. Street lamps were over-bright before
    and after, so their pools and their reach are now a quarter less, and
    the check (in a village) is back to 0.75 of noon.
  - *A grand city is seen coming*: its rock is 25 m high (the castle's
    spire tops out some 80 m over the road); the leg before it is never a
    town, a forest or a pass; the woods stand back; the traveller stops
    215 m short for a first sight, turned toward the castle, and again at
    the gate; the lights the far squares keep are three times as strong.
  - *The company keeps out of a low camera's way* (`ctx.avoid`), as the
    townsfolk do; the dissolve is for accidents.
- **Measured** (triangles a frame, shadow pass included, software renderer;
  follow camera / an orbit from 40 m). Targets: High 450k, Medium 220k,
  Low 100k.

  | | High | Medium | Low |
  |---|---|---|---|
  | Open forest road | 427k / 369k | 206k / 198k | 71k / 68k |
  | A village | 239k / 303k | 134k / 141k | 47k / 59k |
  | Before a grand city's gate | 328k / 283k | 185k / 149k | 78k / 57k |
  | Its market square | 386k / 447k | 206k / 223k | 85k / 101k |

  Within target everywhere but the grand square seen from a 40 m orbit on
  Medium (223k) and Low (101k), which are one percent over. Draw calls are
  the squares in view: 44 to 119. What pays for it: fine scenery only
  within 18 m of the road (9 m on Medium) in the 3×3 squares about the
  traveller; fine houses on High only; at most four fine townsfolk (one on
  Medium, none on Low); lite animals with distance; on Low the four
  original travellers keep their plainer figure, and townsfolk are drawn
  to 30 m (55 m on Medium, 160 m on High); a grand city's towers, walls and
  great buildings in their far builds outside those 3×3 squares.
- **A third pass (2026-11-16, the owner on a real GPU): faces, the country, the deep forest, and why the land seemed to switch.**
  - *"Sometimes the biomes randomly seem to switch."* Nothing was ever
    rebuilt as another country: a square built twice is the same square to
    the byte (now a unit test, after the world's caches have been flushed,
    at every detail and tier, and against the far squares' colours). What
    the owner saw was three true things. (1) The country changed every
    360 m, three and a half minutes, so "meadow" was gone almost as soon as
    it had begun. (2) Where two met, each tree and plant chose its country
    by a coin weighted by distance along the road, over 160 m: a
    salt-and-pepper of firs among mushrooms with no edge to it, which reads
    as the land not knowing what it is. (3) The air (how misty, whether
    leaves or the grove's motes are falling, fireflies) was the nearest
    leg's, and stepped at the midpoint between two legs. Fixed: a country
    now lasts two legs (`RUN`, 720 m, seven minutes); `world.share(x, z)`
    says which country a point belongs to, a border that wanders forty
    metres either way with tongues of each into the other and a narrow
    edge where they mingle, and the trees, the plants and the ground's
    colour all ask it; `world.air(z)` turns the air's weights over 140 m.
    (Looking for it also found a cliff where a bay's shore closes: its
    distance is now measured across the shore, not along the road.)
  - *The country is a setting.* `biomePick` (`all`, the default; `woods`,
    `open`, `shore`, `high`; or `choose`) and `biomeChoice` (chips for the
    nine; none ticked is all of them). A round visits each allowed country
    once, in a shuffled order, never the same in two stretches running;
    two countries go by turns; one never ends. Grand cities still need
    meadow or farmland and walled cities open country, so a road through
    the woods alone has villages, hamlets and landmarks only. Changing it
    takes effect at once: the land where the traveller stands is rebuilt as
    the new world's (same seed, same road), and the walk, the company and
    the hour go on.
  - *The deep forest* (`deepwood`, the ninth country): trees half as big
    again and a third more of them, crowding the road so the crowns close
    over it, ferns, mushrooms, bushes, mossy rocks and fallen logs under
    them, deer, rabbits and wisps, an elder tree or a ruin for its
    landmark, the thickest mist and the most fireflies. Seasons were there
    already (they turn along the road, or `season` fixes one): in autumn
    half as many leaves again drift down as anywhere else (the same pooled
    drops as rain, scaled by density), the ground under the trees turns to
    drifts of fallen leaves and leaves lie on it (`litter`), here and, more
    thinly, in the forest. Measured (follow / 40 m orbit), with the
    boughs of the fourth pass: High 412k / 435k in summer and 421k / 445k
    in autumn; Medium 193k / 212k and 197k / 216k; Low 69k / 76k and 70k /
    77k (one spot beside a village measured 457k on High). To hold that,
    its trees are never the fine models (its boughs are), fine bushes reach
    0.42 of the usual band from the road, and Medium and Low thin its trees
    harder than other countries'.
  - *Faces.* Eyes stood a centimetre out of the head. They now lie in the
    face (a flat white a hair proud of the skin, a larger soft iris, a
    pupil, a point of light, a line of lashes), and everyone blinks every
    four seconds or so. The rogue's scarf sits below her eyes.
  - *The druid's helm*: a cap of bark plates bound in bronze, a brow piece
    to a point with a stone in it, leaf cheek-guards, a crest of bronze
    leaves, and a rack whose beams sweep back, out and up with five curved
    tines a side, moss on them, a charm of beads and a feather from each, a
    sprig of blossom, a light at every tip after dark and four fireflies
    about them at night. Her other shapes wear the same rack, and the
    animals' eyes lie flatter in their heads too.
  - *The elf ranger's bow* is a recurve (limbs that belly and turn away at
    the ends, flat in the limb, a wrapped grip, horn nocks, a taut string;
    drawn, the limbs bend and the nocks come back); capes have a hem with a
    band of trim, gathered shoulders, a clasp on a chain, swing a beat
    behind the stride, and a quiver rides outside one. The hooded
    wanderer's cloak is the same cloth and got the same.
  - *The women's figures* are fuller in the bust and hip and narrower in
    the waist (the trunks `f` and `c`), and the druid's feather mantle is a
    small collar so her bodice shows.
- **A fourth pass (2026-11-16): a roof over the deep forest's road, and a real draw.**
  - *The canopy.* The crowns stood back from the road and left sky over
    it. Now a bough leans out from either side every 10 m, turn about
    (`BOUGH`, scatter's `bough`: an old trunk 6 to 8 m from the road that
    arches to just past its middle, with broad flat clumps of leaf 7 to
    9 m up), so the road is a tunnel with the light at its far end, the
    ground under it shaded with gaps. Far squares carry the same boughs as
    one clump and a stick, so nothing appears as the walk arrives; each
    bough takes its country from `world.share`, so they thin out with the
    border; none stand on a place, a camp, a bridge or a bank. In snow they
    are bare wood. Follow and first-person cameras are under it. From the
    orbit, leaves more than 3.4 m above the traveller's feet that lie
    within 5 m of the line from the eye to the traveller are dithered away
    in the prop shader (`uCut`, `uCutY`; any tree's crown, not only the
    boughs), so an overhead or distant orbit looks down a well in the
    leaves at the traveller instead of at a roof; the wood stays, and so do
    the shadows.
  - *The draw.* The elf ranger's aim was two arm angles and a bow through
    her forearm. `pose.aim` (0 to 1 and back, 1.7 s up, 1.2 s down, done
    before she walks on) now drives a sequence: she turns side-on to the
    mark, the bow comes up before her chest as the other hand goes to the
    string, the bow arm goes out straight as the string comes back to the
    corner of the jaw with the elbow high behind, and she holds; the head
    looks along the arrow. Both arms are solved to their hands (`reach`, a
    two-bone arm toward a pole). The bow is modelled with the hand at the
    grip and the string behind it in 25 steps of draw (`P.bow(q, arrow)`):
    the string is two straight lines from the limbs to the fingers, the
    limbs bend and the nocks come in as it is drawn, and the arrow lies
    from the string past the side of the grip. She lets down without
    loosing.
- **Also in the fourth pass: the world that changed under a drag, and the company that did not change.**
  - *"The switch of biome is mostly when I drag the view in the orbit."*
    The real cause of the third pass's first item, and not in Wayfarer:
    0.6 s after a drag the orbit is saved (`WP.settings.save`); that write
    raised a `storage` event in the player page, which took it for
    another tab's and rebuilt the stage 0.4 s later; and a new Wayfarer
    is a new seed: another world, place, company and hour. "Mostly"
    because a drag that ends on the same whole degrees saves nothing. V,
    T and X did the same. Fixed in the player (§4.1's `saved`, §4.4); the smoke
    check drags five times in each orbit mode in the player page and
    presses T, and fails on the old player at the first drag. The third
    pass's changes (longer countries, a border that holds, air that turns
    slowly) stand as improvements, but they were not what the owner saw.
  - *Companions* ("changing companions doesn't seem to take… is there a
    max?… why a first companion and the rest, wouldn't I just want
    buttons for all of them?"). Every panel change did reach the walk;
    what read as "doesn't take" was three rules nothing explained: chosen
    by hand, a seventh tick (or any past the first six in the list's
    order) was dropped; *First companion* set to *Alone* emptied the
    company whatever was ticked; and *Surprise* is the world's own
    choice, so choosing it again changes nothing (and, with the bug
    above, the company changed by itself after any drag). The controls
    are now one choice (`configVersion` 2, so settings saved before it
    are dropped and Wayfarer starts from its defaults): **Surprise me**
    with *How many* (0 to 12; one of the named cats, then one from each
    kind by turns, by the world's seed), or **I will choose them**, which
    shows a chip for every companion in five rows by kind (all the one
    list, `companionChoice`, kept in the order ticked) and a line from
    the wallpaper saying how many walk ("14 ticked: the first 12 walk
    with you"). Whoever is ticked walks; nobody ticked walks alone. The
    old `companion` key, the kinds as modes of `companionPick`, and
    "nobody in particular" are gone. The cap was six because there were
    six places (`STATIONS`, `HEARTH`) and a count clamped to match; there
    are twelve now (`PARTY_MAX`), the seventh on drawn as their lite
    models at any distance. Twelve cost about 17k triangles more than
    three on High (13k on Low): in the deep forest in autumn from a far
    orbit that is 460k on High and 229k on Medium, 2% and 4% over; with
    six or fewer nothing changed. A change no longer rebuilds the company
    in place: `partyChange` keeps whoever stays where they are walking,
    starts newcomers 8 m and more back down the road (3 m for the slow
    ones) to run up, and sends the rest back the way they came
    (`leavers`, forgotten 20 m behind).
  - *"Why does the pack mule rotate randomly."* Every walker faced the
    place it was making for, and made for it at a speed that took no
    account of that place moving with the walk. One whose place is ahead
    of the traveller (the led pony and donkey, 2.7 m in front) is past
    its place whenever the traveller slows or stops, so it turned round,
    walked back, and turned again; two whose places overlapped pushed
    each other off them and faced wherever the push left them; and a
    turn was as fast as 19 rad/s. Now a walker keeps the walk's own
    velocity and closes the gap on top of it (ahead of its place, it
    slows), faces the way it has actually gone, takes a step or two back
    or aside without turning, stands facing down the road when the walk
    stops, and turns no faster than its size allows (`turnRate`: 1.7
    rad/s for the pony and donkey, 2.6 for the middling, 4.5 for the
    small; fliers 6). A unit test walks every ground companion through
    slowing, stopping and a cart going by at 10, 30 and 120 fps; it
    fails on the old mover.
- **A fifth pass (2026-11-16): "approaching a campfire, it's like they are sliding sideways".**
  The traveller was the worst of it: their place is a distance along the
  road and a distance to its right, and on the way to a fire the second
  was eased across while they went on facing down the road (and for the
  last of it only the second moved: a pure slide); the same on the way
  back. Of 35 m walked about a camp, 20 m was sideways. The company slid
  less, for two reasons: since the fourth pass they moved toward their
  place whichever way they faced, with the turn limited, and anyone in
  another's way was pushed aside at up to 3 m/s. Now the traveller has a
  way they walk (`j.face`, an angle from the road's line, turned at no
  more than 2.6 rad/s) and walks along it: to the place by the fire in a
  straight line from where they left the road, sat turned to the fire,
  and back onto the road on a curve; `standing()` gives `travel` as well
  as `heading`. A companion going anywhere walks the way it faces and
  turns toward where it means to go, slowing while it is turned away;
  going round somebody is part of where it means to go, and only a small
  nudge is left of the push; a slow step back or aside to keep its place
  is still taken as it stands. Nothing else pulls anybody off the road's
  line: at a view and before a gate the traveller stops on the road and
  turns their head. A unit test walks to two fires and back at 10, 30
  and 120 fps and measures how far each went across the way it faced
  (the old code: 21 m for the traveller).
- **Also in the fifth pass: wildlife** ("more background creatures, and more often, maybe controllable: bears, elk, squirrels").
  - *Who.* 27 kinds at first, 31 after the sixth pass (`WayLogic.WILD`), each country its own
    (`WILDLIFE`): forest and deep forest have the bear, stags, squirrels
    (up trunks, and in the deep forest out along the boughs over the
    road), a boar with piglets, fox cubs, badgers, hedgehogs, a woodpecker
    and an owl; meadow and farmland hares that box, pheasants, fox cubs,
    hedgehogs, a kestrel hanging on the wind, butterflies and swallows;
    lake and coast herons, swans with cygnets, otters, a fish that jumps,
    seals on the shore; the moor wild ponies, stags, hares, marmots, a
    kestrel and an eagle; the pass ibex, marmots, an eagle and now and
    then a bear; the grove moon-hares that glow and mushlings; after dark
    bats and glow-worms, and the owl goes round on the wing. The herds and
    flocks there were before (sheep, cows, deer, rabbits, goats, ducks,
    gulls, crows, wisps) are still there.
  - *Where.* `world.wildlife(cz)` gives up to six parties to each 64 m of
    road, within about forty metres of it (where they are seen), the same
    whenever it is asked; each has a `roll`, and the setting lets out those
    under its share (`WILD_LEVELS`: none 0, few 0.15, some 0.6, plenty
    0.96; six places to a stretch at first, eight with the sixth pass), so turning it up adds animals and moves none. Every kind keeps
    a distance from the road's middle (`keep`: 6 m at the least, 20 m for
    the bear), in where it starts, where it wanders and where it runs to;
    none are placed in a town, at a landmark or a camp. The manager holds
    those within three stretches (192 m and more: beyond where any is
    drawn).
  - *What they do* (`wildStep`): graze and look up as the traveller
    nears; the shy ones bound away from the traveller and from the road
    (a heron and a pheasant get up and fly), and settle where they stop;
    the young follow the first of their party; climbers go up and down;
    swimmers go round; fliers circle or hang. Those on the ground walk the
    way they face, with the turn limited.
  - *How they are drawn.* Within 13 m (8 m on Medium, never on Low) the
    companions' lite rig; beyond it WayActors' plain beasts and birds
    stand in (new entries for the bear, stag, boar, wild pony, ibex, seal,
    swan, heron, eagle, kestrel, owl, pheasant and woodpecker; the small
    ones borrow a cat or a rabbit in their own coat); the nearest 44, 26
    or 14 by the tier; swarms are a few triangles each or only lights.
    The orbit's cutaway takes leaves only, so it never takes an animal.
  - *The setting.* `wildlife`: `none`, `few`, `some` (the default) or
    `plenty`; it takes effect at once and leaves the walk alone. It
    governs the herds and flocks too (×0, 0.6, 1, 1.5), which `life` used
    to: `life` is now folk and traffic only.
  - *Cost.* Worst case measured (plenty, twelve companions, the deep
    forest in autumn, a far orbit): High 463k (455k without wildlife),
    Medium 227k (227k), Low 89k (89k).
- **A sixth pass (2026-11-16): the wildlife was there and was not seen.**
  - *Measured.* `make wayfarer-sight` (`tools/wayfarer-sight.mjs`,
    `WayLogic.wildSeen`) walks each country behind the follow camera and,
    every four seconds, counts the wild animals in the picture: on the
    screen, 12 px tall or more at 1080p, with nothing between (the ground,
    a trunk, a wall). As the fifth pass left it, at `some`: 12% of samples
    over all countries (1% in the forest, 30% on the moor). They were too
    few, too far from the road, behind the trees, and mostly out to the
    side of what the camera sees.
  - *Changed.* Every 64 m of road now has two places for a party of the
    country's big animals (`WILD_SHOW`: stags in herds of three to six,
    wild ponies, ibex, a heron, a bear now and then, a white stag in the
    grove), on the verge 7 to 12 m from the road, one each side, somewhere
    with a clear line from the road forty metres back; they keep to that
    strip and hold their ground until the traveller is within nine metres
    or so. Small and bold kinds are placed 6 to 14 m off. More than half
    the parties with dry ground opposite cross the road, once, when the
    traveller is 40 to 62 m short of them, at a walk (and at a run if the
    traveller is within 32 m while they are on it; a unit test holds them
    14 m clear). Swallows by day and bats by night are about the roofs in
    a town. Butterflies and swallows are drawn half as big again. Nobody
    appears at full size at the edge of sight: they grow over the last of
    the distance. New: the bear fishing at a lake's edge and scratching
    its back on a tree, crabs on the shore, a seal with a seal's body, the
    white stag.
  - *Now* (3 km, three seeds, day; night is the same within two points).
    Share of samples with an animal plainly in the picture, whole walk
    and (on the open road, away from towns, which are 21 to 39% of a
    walk and have people, cats and hens but no wild animals):

    | country | few | some | plenty | mean at some |
    |---|---|---|---|---|
    | meadow | 34% (51%) | 55% (76%) | 61% (79%) | 3.1 |
    | forest | 24% (33%) | 51% (64%) | 62% (75%) | 1.9 |
    | deep forest | 16% (20%) | 40% (45%) | 51% (55%) | 1.0 |
    | lake | 28% (33%) | 52% (59%) | 63% (70%) | 2.1 |
    | pass | 29% (32%) | 60% (64%) | 72% (77%) | 1.8 |
    | farm | 31% (47%) | 56% (77%) | 64% (83%) | 4.0 |
    | moor | 50% (71%) | 70% (89%) | 78% (93%) | 6.3 |
    | coast | 28% (35%) | 45% (52%) | 61% (67%) | 1.6 |
    | grove | 45% (63%) | 65% (83%) | 75% (89%) | 3.2 |
    | all | 25% (33%) | 49% (61%) | 59% (71%) | 2.2 |

    The aim was 70% at `some` and 90% at `plenty` over the whole walk; it
    is met on the open road in open country and not in the woods (the
    deep forest's own boughs stand in a row between the road and anything
    behind them) nor on the coast (the shore is far from the road), and
    not anywhere once the towns are counted. A unit test holds the
    open-road figures a good way under these.
  - *Budget.* A road through one country had never been measured: the
    forest alone was 486k triangles on High and the grove 581k, with or
    without wildlife. The causes were fine trees in a wide band where the
    trees stand thick, and in the grove every little mushroom drawn as
    the giant one (some 200 triangles each, a couple of dozen to a
    square). Now: half the band in the forest, none in the grove (nor the
    deep forest); a toadstool of its own; a third fewer of the grove's
    flowers and ferns; the grove's trees thinned on Medium and Low as the
    deep forest's are. With three companions and `some`, every
    single-country road and the mixed one is inside target on every tier
    (the worst: deep forest 445k on High, grove 202k on Medium after the
    thinning, grove 82k on Low). With `plenty` and twelve companions the
    worst is 458k on High (2% over), 214k on Medium, 95k on Low; with
    more than six companions, those from the fourth on are the lite
    models.
- **A seventh pass (2026-11-16): "how come in coast I rarely see the coast?"**
  - *Why.* Three things. Each coast leg had a bay of its own, on its own
    side, closed by headlands before the leg ended: the shore was within
    fifty metres of the road for some sixty metres either side of the
    leg's middle and hundreds of metres off for the rest. The water lay
    1.6 m below level ground that ran flat out to its brink, so from a
    camera 2.5 m up the brink hid it. And the seaward side was as wooded
    as the landward. Measured (`node tools/wayfarer-sight.mjs --water`,
    `WayLogic.waterSeen`: rays through the follow camera's picture, each
    to the first thing it meets; a sample counts when open water is 3% of
    the picture or more): 0% of samples over 3 km and three seeds, and 1%
    for the lake, which had the same fault.
  - *Now the coast is one coast.* The sea is on the same hand all the way
    (by the world's seed) and at one level; the road runs 4.5 to 11.5 m
    above it and 11 to 20 m from the tideline; the land falls from the
    road's verge to the shore (a bluff where the road is high, a bank
    where it is low: no brink), under a village only at its quay; the
    seaward side keeps one tree in ten; rocks stand out of the sea. A
    headland closes it, and the road turns inland, only where the next
    leg is another country (`sea.open`). The lake is a long one with its
    near shore along the road for most of its leg, 4.6 m below it, its
    bank falling to it the same way and mostly clear of trees.
  - *Measured after:* the sea is in the picture in 65% of all samples and
    81% of those on the open road (a mean of 5.4% of the picture); a lake
    in 32% and 42%. A unit test holds 62% and 22% on the open road, and
    that the sea keeps its side and its level, the road is dry, and the
    shore is 9 to 30 m from it. Coast alone draws 216k / 239k triangles
    on High (follow / far orbit), 111k / 123k on Medium, 37k / 39k on Low.
  - *Not done:* surf and foam, wet sand, a causeway or sea bridge, a
    harbour, a wreck, beach huts: the sea is the water there was (the
    mirror on Medium and High), nearer and in sight. The lighthouse, the
    boats and the gulls were there already.
- **Settings added:** `orbitMode`, `orbitAzimuth`, `orbitElevation`,
  `orbitDistance`, `companions`, `companionPick`, `companionChoice`,
  `warpaint`, `craft`, `biomePick`, `biomeChoice`, `wildlife`. `companion` (the one
  companion of the first version, then "the first") was removed on
  2026-11-16 with `configVersion` 2.
- **Not built:** pinch to zoom (no multi-touch in `host.gestures`: on a
  phone the distance is the slider); people on the castle's ramp. The 2D
  fallback draws every traveller as the same cut-out in their own colours,
  and none of the company.

**Tests.** Unit (`tools/wayfarer.test.mjs`, 28; the fourth pass added the boughs over the deep forest's road, the bow's string, the company changing on the road and nobody spinning; the fifth, the walk to a fire and back, and wildlife; the sixth, wildlife seen; the seventh, the coast (33 now); the third pass added the country chosen and honoured, autumn in the woods, and the border that does not change its mind; the six before that: the orbit in clear air at 48 bearings and heights for an hour, its drag, fixed and turning at 10 and 120 fps; every companion posed, the count, the named cats against the roster, the seed; the company on the road, by the fire and at any frame rate; every traveller, the druid's changes and the rogue's hiding; grand cities; fine models and budgets). Smoke adds: the orbit's drag, wheel, overhead, grass and a village at four bearings; six companions, none, the barbarian's brand, the druid there and back, the rogue unseen and back; a grand city before its gate, in its square at five bearings, on its drawbridge and from down the road at night. The original sixteen: the road never jumps or
doubles back, is level across and no steeper than a third along; the
ground is continuous and the road is never awash; every round has all
the countries (nine now), never two stretches the same running, and every kind of place
turns up; the towns setting scales settlements and leaves the road alone;
the same seed is the same world; it all holds 3 × 10⁹ m from home; a
village lines its street and a city stands inside its walls with nothing
on the road; trees keep off the road, out of the water and out of town,
and a far square is a thinning of the near one; four hours of day and
night walked with feet on the ground, on the road, resting by fires and
stopping at views; the same road at 10, 30, 60 and 120 fps; every camera
in clear air for an hour; the sun, the moons and the light by the hour;
weather holds and comes and goes; squares are sound triangles within
budget, with lights in town and water in the lake; everyone can be posed;
the schema's options match the code's; and the sources are clean (no
pixel reads, clocks, timers or storage of their own; GLSL a WebGL 1 GPU
will take). Smoke: on the road on frame one and walking; the three
cameras, a drag, and the keys; night's lanterns and stars, rain, and snow
in winter; the 2D fallback at the same pace on Low as on High; a phone
held upright.

**Not verified.** Everything was built on a software renderer (headless
Chrome), where a frame takes a third of a second: frame rate, smoothness,
the shadow map's quality and the GPU watch's thresholds on a real GPU, a
phone, the Mac saver and the Windows host are all untested (see "Open
questions"). `make bench` was not run for it (its numbers on this box
would mean nothing). The walk was looked at in stills only, never in
motion at speed: gaits, the cloak, wheels turning and the cinematic cuts'
timing are as written, not as watched.

**Not built:** steering by hand (the road is the point; `N` skips ahead);
people going indoors at dusk (fewer are simply about after dark); houses
you can see into; rivers that run to the lake; sound.

### 10.39 Fresh Tracks (`ski-run`, owner request, 2026-11-15)

The owner's brief: "the never ending downhill ski. front on, or follow
behind. never ending skiing/boarding downhill. Lots of fresh snow. lots of
realistic'ish trees. Small stunts, half pipes, those kind of things", in the
mood of a calm, cosy downhill game. Answers to our questions: every camera
(behind by default, in front, a high diorama, and a director that cuts at
jumps), a lead and one to three friends with gender and skis-or-board
selectable, other people on the mountain (strangers, a ski school, a
chairlift), smooth like Ice Patrol rather than faceted, denser trees, and
wipeouts now and then, harmless and comic, with a setting.

**It is our own mountain.** No resort, place, brand or person, and nothing
from any game but the mood. Everything is modelled in code.

**The third wallpaper on WebGL** (§10.34 was the first, §10.38 the second), hand-written WebGL
1 that runs unchanged on WebGL 2. It needs one extension, instancing
(`ANGLE_instanced_arrays`, or WebGL 2's own), which is what keeps trees in
their thousands cheap; without WebGL or without that, the 2D fallback runs.

- **The course (`SkiLogic.course`, pure, unit-tested).** z runs down the
  mountain, x across it. The run's centre is a function of z, so it winds
  but never doubles back, and `u = x - centre(z)` is how far across the run
  a thing is. It is stitched from sections picked by a seeded draw (never
  two alike in a row, never two narrow ones, never off the wide lake
  straight into a narrow place, never a hut and a lodge one after the
  other): groomed piste, powder, glade, half-pipe, park, rollers, frozen
  lake, cliff, gully, cat track, hut, grand lodge. Each has a
  length, a half-width, a grade, a drift and a wind; the grade, the drift
  and the width blend from the last section's over the first 40 to 110 m
  (in closed form, so elevation and centre are exact anywhere), and what a
  section builds (a pipe's walls, kickers, rollers, a cliff, pillows, a cat
  track's bank) is windowed to nothing at its ends. `height(x, z)` is the
  one ground: riders ski it and the mesh is sampled from it. The valley's
  sides rise to a crest and sink again before the land runs out (or fall
  away), so the mesh's far edge is never seen. Sections far behind are
  forgotten. Nothing depends on being near zero: a test starts a mountain
  3 × 10⁹ m out.
- **Trees** stand on a jittered 4.5 m grid, thick by the piste and thinning
  up the sides, in clumps and clearings from a noise field, never within
  2.6 m of anywhere a rider may go: the piste, a glade's four lanes, the
  way off a groomer through the woods and back, a lift's line, the hut.
  Beside a run they are small and grow with the gap they stand in, so no
  bough reaches a lane. Spruce, fir, pine, small ones plastered white,
  snags, boulders.
- **Riders (`worldStep`, pure).** Four lines abreast down the piste; the
  lead and each friend have one, and change now and then when well apart.
  A line is a middle and a swing: carved turns no harder than about a g, so
  wide ones are long, rounder the steeper the snow, and shaped as carved
  arcs are (a third harmonic on the sine: longer at the apex, quicker from
  edge to edge). In a glade the line is the slot's lane between the
  trees; in the pipe it is wall to wall, off the lip, a turn in the air and
  back down; in the gully up one bank and the other; on a cat track
  straight, in a tuck. Vertically they follow the snow until it falls away
  faster than a fall, then fly (real gravity) and land: kickers, rollers,
  pillows, the cliff and rails all come out of that. At take-off the air
  time is worked out and a trick that fits is picked (grab, spread eagle,
  shifty, 360, 360 grab, backflip, front flip, 720, cork 720); now and then,
  and only over open snow, it is marked to go wrong, and the landing is a
  tumble, a moment lying there, sitting up, shaking it off and getting up.
  Friends range ahead and behind on a rubber band, wait when the lead is
  down, and all pull up abreast at a hut for five seconds.
- **What moves them (owner, 2026-11-18: "the physics seem off").** Until
  then speed was a number eased towards a target, whatever was underfoot.
  Now a rider's speed along its path is the hill's: gravity down the snow
  actually under it (so up a kicker's ramp costs speed, a roller's back
  gives it, and nothing is made from nothing), less the snow's drag (more
  in powder than on ice) and the air's (less in a tuck). What a rider wants
  is still a pace for the section; all it can do about it is skate from a
  standstill (to about 8 m/s) and scrub with its edges, hardest coming
  across the hill and least in the fall line, and never more than 0.7 g
  (`GRIP`), to give way or to stop as well. So they are slowest down the
  mountain while crossing it and quickest at a turn's apex (it was the
  other way round), they lose speed across the flat lake, and a stop takes
  the room a stop takes. Speed is kept through the air and a landing keeps
  what was along the snow. A line moves across the piste as a body can
  (6 m/s² sideways, and room to stop), and the lean is taken from how hard
  the rider is really turning, so a dodge or a held key leans as a swing
  does. Legs take up 1.2 m/s of the snow falling away before a rider
  leaves it: before, riders skittered airborne over powder 44% of the
  time, unable to steer or slow; now 17%, and the pillows still throw
  them. A spin is going from the lip at near the rate it keeps (a little
  quicker in the middle, as a tuck does) and is round at 92% of the air;
  it used to start from nothing and be fastest at touchdown. In the pipe
  the wall takes speed back: pumped to 10.5 m/s across the flat, slowing
  up the transition by the height climbed, and what is left at the lip
  goes up (3.8 to 6.4 m/s); it used to cross at one speed and be thrown.
  A jump by hand is a crouch of a fifth of a second and 4 m/s of spring
  (it was 5.4 m/s at once). Knees fold over a crest and before a lip
  (`absorb`, `load`), and scrubbing throws spray. A tumble slides further
  where it is steep.
- **The grand lodge (owner, 2026-11-18: "a proper grand lodge, not just a
  hut; huts are cool too").** Its own kind of section, as often as a hut
  (about one in 25 sections each). The building is 27 m by 12 on a stone
  plinth, three floors, a great hall's gable of glass facing the piste,
  dormers, balconies, two chimneys that smoke, and a terrace of tables in
  front with a fire, a string of lamps, ski racks and thirteen people
  about it; lit from inside at night. It stands 24 m off the piste's edge
  on a level pad the ground is eased to (`height` again, so the mesh
  agrees), with no tree in it. The friends draw over to its side of the
  piste and pull up by the steps; whoever has arrived steps out of their
  skis (left standing in the snow), walks up to a table (7.5 s), sits
  over a mug for 16 s, and walks back. They are `afoot` for it: nothing
  else moves them, a tap does not jump. The director shows the whole
  lodge from out on the piste meanwhile; the camera behind stands on the
  piste side and looks at it. Without WebGL it is a flat front of timber,
  snow and glass. They pull in to berths 1.9 m apart dealt by where they
  are across the piste, and walk in lanes, order and seats set by where
  they stand, so no two on foot come within a metre while either walks.
- **How they hold themselves (owner, 2026-11-18, after the release: "the
  rider is always leaning into the wrong direction"; then "all of the
  fixes").** The owner was right: `figure` tipped the body out of every
  turn, and rolled the skis the wrong way against a side-slope (`rz` tips
  +x up; both signs were wrong from the first day, and no test looked).
  Fixed, tested, and then the rest of what the research asked for:
  - *Lean is the force the edges carry.* `force = v² × curvature + g sin α
    sin h` (gravity helps a turn above the fall line and fights it below),
    `tilt = atan2(force, g cos α)`, `press` in g. On a scripted line it is
    read 0.07 s ahead, so the body goes in as the turn begins and not
    after; a dodge or a hand on it adds what was not scripted.
  - *Skis on the snow, legs solved.* Each ski lies on the snow rolled onto
    its edge, the hips sit inside on the tilt's line, and each leg is
    two-bone inverse kinematics: the inside leg comes out short and the
    outside long because that is the geometry. The torso is more upright
    than the legs (55% of the tilt at 0.3 rad, 40% at 0.9), the head level.
  - *Skid.* `skid` is the skis' yaw from their travel: a per-rider steering
    angle (4 to 8° for the friends, 8 to 20° for strangers, by `skill`)
    plus `asin(scrub / edge force)`, tails out, mostly below the fall line
    (median 4.6°, 90th centile 10.7° for the lead on a groomer). Pulling
    up is a hockey stop: the skis come round to 70 to 84° from the fall
    line as speed falls and stay there. Spray is thrown by the skid, and
    the track widens from two lines to a smear with it.
  - *Chest, eyes, hands.* The chest (`face`) turns 64% as far as the skis
    in long turns and 15% in a glade's short ones; the eyes (`gaze`) go to
    where the line is in 0.6 s. Hands forward, poles back beside the skis,
    and a pole plant on the new inside at every edge change, its tip
    staying where it touched the snow.
  - *Boards.* A board is rolled onto its working edge with both boots
    strapped to it. Heel-side is sitting into a chair (hips 0.40 m up at
    0.6 rad, knees at 92°, chest forward of the line); toe-side has long
    legs and hips forward (0.72 m, 129°, back along the line). The weighted
    middle of hips, chest and head lies on the tilt's line either way. A
    regular rider's toes are to the right of travel. Stopped heel-side they
    sit; toe-side they kneel.
  - *No two turns alike.* A turn's length follows the hill and the speed
    (34% shorter above a grade of 0.3 than below 0.2) and wanders ±18% from
    turn to turn by `hash`, with a run of three or four short ones or one
    long one now and then; changed only at an edge change and eased.
  - *Deep snow.* `sink` draws the feet 0.19 to 0.21 m under powder at a
    turn's apex (0.03 m on a groomer) and lets them up 7 cm at each edge
    change; `y` stays on the surface.
  - *Landings.* A landing adds no speed unless the rider really fell on to
    steeper ground (a park landing gains under 0.05 m/s; it was 1.4), and
    none down a pipe. A tumble ends the right way up, eased on to its back.
  - *The camera behind* is anchored on the hips and takes 55% of the swing,
    so it moves half as hard sideways as the rider, and rolls into the turn
    by at most 3°.
  - `make ski-filmstrip` (`tools/ski-filmstrip.mjs`) puts a turn, stop,
    jump, pipe wall, powder or the lodge on one sheet: a row of frames from
    behind, in front, the side or above over plots of the rider's numbers.
    Every part above was checked on those sheets, since this machine cannot
    show it moving.
- **Room for each other.** Everything a rider must give way to (other
  riders' swings, a stopped stranger, the ski school as one, a creature) is
  a stretch across the piste; a rider threads the free stretch it is in or
  the nearest that will do, and holds back behind what is dead ahead. Coming
  up to a narrow place they go in line by the gaps between them. Nobody
  flies off the piste (the air only carries them down it), and no step ends
  with one rider inside another. A rider held up for 4 s by something
  that will not move slips by it; the tests require that never to happen
  (the last of four abreast setting off from a stop waits nearly that).
- **Others.** Strangers ski the open pistes more slowly and stop at the
  side rather than ski what is not for them; a ski school is an instructor
  and five children on the instructor's own tracks; chairs go round each
  lift (people on most of those going up); folk stand on the hut's terrace;
  a hare or a fox crosses well ahead; an eagle turns over the valley.
- **Chairlifts hang clear (owner, 2026-11-18: "occasionally it looks like
  the chairlift is embedded in the ground, or so low the rider would plow
  into it").** Towers stood every 52 m but never on a piste, and a lift
  crosses its run on a long diagonal, so a straight cable could span 300 to
  500 m while the ground rose under it: on six mountains 82 of 224 lifts
  had chairs into the snow somewhere, up to 21 m deep. Now `hang` checks
  every span (both cables, the width of a chair, every 2 m) for the lowest
  feet, 4 m under the cable: 2 m of room off the piste, 5.5 m over it,
  coming down to a little under the snow at a station's platform over its
  last 40 m. Short of that, a tower goes in under the low point if one may
  stand there, else at the piste's edge nearest it (never within 30 m of
  another), else the towers either side grow, half a metre at a time, up
  to 30 m. A lift that still cannot be hung is not built: 211 of the 224
  are, with as many towers as before (median 53 m apart).
- **By hand** (owner, 2026-11-18: "some manual control over the rider; it
  can be on rails, but some control would be great"). Still on its rails:
  the lead keeps its line and gives way as ever, and the hand only bends
  it. The logic takes `input` = { steer, tuck, brake, jump } (`HAND`):
  - *Carve:* `A`/`D`, ←/→ or a drag across move the lead's line across
    (within the piste, or 0.9 m within a lane), eased back four seconds
    after letting go.
  - *Tuck:* `W`, ↑ or a drag up. Straight running (swing to 0.35 m), a
    tuck, and a wish to go 45% faster: about 20 m/s on a groomer where
    it would cruise at 14.7.
  - *Brake:* `S`, ↓ or a drag down. A tap checks speed (to 60% of its
    pace); held for 1.2 s it is a full stop, a hockey stop with the skis
    across the hill, and there it stands while held (the friends wait,
    and nobody counts it as stuck). Let go and it sets off.
  - *Jump:* `J`, Space or a tap, where they may (not in a lane or a narrow
    place, nor on foot). Held, the crouch goes on up to 0.6 s more and the
    spring grows to 1.55 times: 0.8 s of air becomes 1.27. Shift+`J`
    still ends in a heap.
  - *The air is the hand's* when a hand has been on the lead in the last
    four seconds: no trick is picked for it. Steer spins it (7.5 rad/s),
    tuck flips it forward and brake back (6.3 rad/s), a held jump (or a
    tap) grabs. Let go, and it goes on round to the next whole turn and
    stops there (a half turn on a board, which rides away switch). What
    was already held when it left the snow does nothing up there until
    let go. Landed within 0.55 rad of a whole turn (0.6 for a flip) it
    is stomped and called out ("🤘 Backflip 360 grab"); short of that it
    goes down in a heap, or with wipeouts off lands "just about".
  - The first touch of a key or the screen says, once, what the hand can
    do. Nothing is saved. Held keys work as Ice Patrol's do (§10.34); a
    key forwarded by the player counts as held for 0.6 s.
- **Cameras (`cameraStep`, pure):** behind (6.3 m back, 2.5 up), in front
  (9.5 m down the lead's own line, looking back), on high (15 m to the side
  that falls away, 17 up), and the director: follows, cuts to a camera by
  the landing of any jump the lead is about to take, and every 8 to 26 s to
  the front, on high, or a camera left at the piste's edge. Reduced motion:
  no cuts, 0.6× speed, less sway.
- **The view (`SkiRenderer`).** The ground is 61 chunks of 32 m, each a grid
  of 113 columns (1 m apart on the piste, wider up the sides to 700 m; 69
  on Medium and 49 on Low, each a subset of the finest's, so the land is
  the same land) by 32, 16, 8 or 4 rows by distance (16, 8, 4, 4 on Low); every level shares its first and last
  rows, so there are no cracks. Per vertex: normal, how groomed, lake ice,
  how steep, how wooded; the shader adds drifts, ripples and grain from one
  noise texture, corduroy while a pixel is finer than its ridges, rock where
  it is steep, ice, sparkle, and a broad noise for spurs on the far sides.
  Trees are instances of 15 models (six kinds, three levels of detail)
  sorted into batches each frame on the CPU, culled to the view; snow lies
  on each bough by a per-vertex amount the shader breaks into clumps. Riders
  and the lift are posed from parts on a matrix stack and stamped into one
  soup a frame. Shadows are one map (2048 on High, 1024 on Medium) of 130 to
  170 m about the lead. Tracks are ribbons that multiply what is under
  them; spray, smoke, mist and lamp glows are sprites; falling snow is Ice
  Patrol's wrapped box. The sky has the sun, a moon, stars, cloud, two far
  ranges read from the noise and lit by where the sun is, and the valley's
  cloud below the horizon, which is also what distance fades to.
- **Night** is floodlit: the lead wears a head torch; masts every 48 m by groomed runs, the five nearest
  the lead lighting the snow, all of them glowing; the hut's windows too.
- **Cost, and its own watch on the GPU** as §10.34: late frames give up
  shadows, then render scale (0.75, 0.55, 0.4) and far trees; software
  renderers start at the last step. Tiers: tree detail distances and far
  thinning × density, spray and flakes × density, `shadows` and `sparkle`
  (medium). Counted in headless Chrome at 1280×800 (thumb mode, so no GPU
  watch) on a groomer, a glade and a park: Low 60 to 87 thousand triangles
  a frame, Medium 216 to 241, High 383 to 448, in 90 to 110 draw calls on
  every tier. Trees are sorted into their batches every second, third or
  fourth frame (High, Medium, Low), from where the camera was then, and
  drawn from an offset in between; riders more than 30 m off (18 below
  High) are stamped from plainer parts, a quarter of the triangles: posing
  them was most of a frame's main-thread time. `node tools/bench.mjs
  ski-run` on this machine (software GL, 4× throttle, phone viewport,
  2026-11-15): Low 20 fps, 4.8 ms a callback, 45% busy; Medium 27 fps,
  5.1 ms, 99%; High 10.5 fps, 7.9 ms, 99%. Busy there probably includes the software
  rasteriser (not measured apart): both budgets are missed, and the
  numbers mean little until it is run on a GPU, so `bench/results.json` was left alone.
- **No WebGL:** the same world as strips of the real slope from far to
  near in flat colour, trees as triangles, riders as blocks of their kit.
  It is what the smoke test times.

**Tests.** Unit (`tools/ski-run.test.mjs`, 32; chairlifts clear of the
snow on six mountains; a hand on the lead (tuck, a stop, a held jump,
spins stomped and short, a flip with a grab, a board's 180, nothing from a
key held into the jump, five minutes of a restless hand on two mountains); the last thirteen are how
they hold themselves: into the turn and skis on a side-slope, lean against
the force rebuilt from positions and never late, legs and angulation, skid
and its sign, the stop, chest against skis, one pole plant an edge change,
landings, boards on both edges, turn lengths, deep snow, poles carried,
the lodge on six mountains, the camera, a tumble): the course always descends,
is continuous along and across, has every section kind, repeats from a
seed; sections, lifts, the section mix and steepness; 3 × 10⁹ m from home;
trees keep their distance; twenty minutes on each of three mountains with
nobody under the snow, off the piste, within 0.2 m of a trunk or 0.9 m of
anybody else, nobody stuck; jumps land, a sent jump (its crouch, and no
more spring than 4.6 m/s) and a botched one; the hill moves them (down the
mountain 5% quicker at an apex than across, never braking past `GRIP`,
slower off a lake than on to it, a spin 12 to 30% round a fifth of the way
through the air and done before the landing, across a pipe's flat 1.6
times the speed by its lip); the lodge (never beside a hut, a level pad
with no tree in it, the piste untouched, each rider to their own place at
the table and back, the director's shot with the whole party in it); the
same distance at 10, 30, 60 and 120 fps; friends, strangers, the school,
huts; by hand; every camera keeps the lead in the lens; the mesh is the
ground (to 2 cm at its vertices, 30 cm between them on the piste); models;
sky and weather; settings; a cheap-and-clean source check. Smoke: the
first frame; the 2D fallback in real time on Low and High, carved by hand,
a jump sent and one botched, `S` held to a stop, `J` held for a longer
jump and a spin by hand called out, friends 1 to 3, each camera; the lodge (run
on to it, three at the table, their skis in the snow, the director's shot
and the one from behind, and away again); night, snow, fog and the keys; a
phone.

**Not verified.** It has only ever run on a software renderer (headless
Chrome's SwiftShader), a third of a second to a second a frame: smoothness,
frame rate, the GPU watch's thresholds, the tiers' real cost on a phone,
the Mac saver and the Windows host are all unmeasured, and `make bench`
means nothing for it here. A lost context is handled in code and not
exercised. The look was judged from still frames only: that goes for the
2026-11-18 physics too, which was tuned by numbers (speeds and air by
section, before and after) and never watched in motion, for the walk
to the lodge's table, and for how the riders hold themselves, which was
judged on filmstrip sheets. Not seen on any sheet: riding switch, grabs
and spins on a board, a fall, the children, and short turns in a glade
(numbers only). In powder the poles ride nearly level over the snow. Hard
over, the poles still splay a little seen from behind. `bench` not run.

**Not built:** signposts with run names (the signs carry a grade colour
only); slalom gates; a groomer at work at night (one is parked by the hut);
a far-off avalanche; ski-school and stranger tricks; sound; a place in
Seasonal. (Old tracks from earlier skiers are in: three faint lines of
linked turns in ungroomed snow, drawn by the ground's shader.)

## Open questions

New questions go here, each with a recommendation.

- **Wayfarer on real devices.** Like Ice Patrol it was built and tested on a
  software renderer only (headless Chrome, a third of a second a frame), so
  its frame rate, its shadows' quality on a real GPU and its cost on a phone
  are unmeasured. *Recommendation:* look at High on a desktop GPU and Medium
  on the phone before a release; record `make bench` and `make
  android-bench` there; if a phone struggles, the first lever is the near
  ring (5×5 to 3×3 squares) and the second is thinner trees.
- **Wayfarer in Seasonal?** It has every season in it and no month of its
  own. *Recommendation:* the owner's call; it isn't in `WP.SEASONS`.
- **Wayfarer's name and looks.** "Wayfarer", the ranger and a company of
  three by the seed are my choices. *Recommendation:* the owner may prefer
  another name (one string in the catalog) or another default traveller or
  company (three defaults).
- **Wayfarer's upgrades, unwatched.** The orbit's feel under a hand, every
  gait, the druid's change and the rogue's shimmer were judged from stills
  on a software renderer. Medium runs over its triangle target in a grand
  city's square from a far orbit, by a percent. *Recommendation:* watch each
  traveller and a party of six for a minute on a real GPU; if Medium
  struggles in a grand city, the lever is `sight` (how far off townsfolk are
  drawn) in `drawLife`.
- **Wayfarer's third pass, unwatched.** The owner's report that the
  countries "randomly switch" could not be reproduced here (software
  renderer, stills); the fix is to the three things the code showed could
  read that way (§10.38). One remains by design: far squares carry a third
  of the trees, so a wood thickens as the walk reaches it. Faces, the helm,
  the bow, the capes and the women's figures were judged from stills; the
  blink, the cape's swing and the fireflies have not been watched moving.
  *Recommendation:* walk a border between the deep forest and a meadow on a
  real GPU; if the land still seems to switch, note the place (`?seed=`,
  the distance in the HUD) and what changed.
- **The Evenfolk and the owl-beast** are names and designs of mine, as are
  the ids `archer` (the elf ranger; `ranger` was taken) and the key `G`
  (`F` is fullscreen). *Recommendation:* the owner's call.
- **Ice Patrol in Seasonal?** It would suit January to April beside Snow.
  *Recommendation:* the owner's call; it isn't in `WP.SEASONS` yet.
- **Fresh Tracks on real devices.** As Ice Patrol below, and heavier: a
  few hundred thousand triangles a frame on High (§10.39). *Recommendation:* try it
  on the owner's GPU first, then Medium on the phone; if Low is too dear
  there, thin the ground's far columns by tier.
- **Ice Patrol on real devices.** Built and tested on a software renderer
  only (headless Chrome), where a frame takes a second. *Recommendation:*
  check Medium on the phone and the Mac screen saver before a release, and
  record `make bench` and `make android-bench` numbers there.

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
- **Windows: the same wallpaper on two monitors in *Different* mode** (§10.25.6).
  Only the choice is per monitor (`wp:current@<key>`); the wallpaper's own
  settings (`wp:<id>`) are shared. *Recommendation:* keep it shared: the
  panel and storage model stay unchanged, and wanting two differently-tuned
  Fish Tanks is rare. Revisit if it comes up.
- **Windows over Remote Desktop** (§10.25.9). RDP sends every changed pixel
  over the network. *Recommendation:* a new `remote` power signal, Low at
  15 fps; it still animates. The owner often works over RDP, so they'll see
  this first.
- **Windows: what counts as a covered monitor** (§10.25.9). *Recommendation:*
  97% of its work area under real windows (overlays ignored), paused after
  300 ms, resumed at once. Tune after the two-monitor pass (W6).
- **Windows: sound on the desktop** (§10.25.9). *Recommendation:* muted, with
  *Allow Sound* in the tray, off by default. Matters once Jellyfin arrives.
- **Windows: signing, now that Smart App Control is in play** (§10.25.13,
  found in W0.2). **Decided 2026-11-04 (§10.25.20): ship unsigned first, set
  up Azure Trusted Signing before telling anyone else; the wiring exists and
  signs once the six secrets are set.** Why it came up: the owner's PC enforces
  SAC, which blocks unsigned builds by hash with no override (2 of ~20 spike
  builds); a build that's refused gets a version bump and is rebuilt.
- **Windows: one ~52 MB self-contained exe, or require the .NET runtime?**
  (§10.25.13). **Decided: self-contained (2026-11-04):** nothing to install
  first, and the `.scr` copy just works. Size is the cost.
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
| A wallpaper menu in its status bar: Blank, Bing and 16 animations | The panel's gallery, with thumbnails, search, filters and live previews; every one, plus Seasonal | ✓ |
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
| Links, weather, search, clocks | Left behind by decision; weather and a world clock were built later (§10.2, §10.3) | — |

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
| Screen saver | **Yes, but fragile** | A `.saver` bundle (`ScreenSaverView` subclass) run by Apple's `legacyScreenSaver` host | **Medium–high**: Apple's host has open bugs (below); its web view can lose every canvas's contents at once (Harvest Valley's "stroke", §10.22: wallpapers that bake layers should probe for it and rebake) |
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
    MenuBar             picker, "Surprise me", pause, quit; MenuBarIcon draws the icon
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
  - [x] Menu bar icon (`MenuBarIcon.swift`, 2026-11-12): the project's own
    icon (§5's `icon.svg`, the window onto a dusk scene) drawn in code at
    18 pt from the SVG's geometry, not an SF Symbol. Default is a
    **template image** (black and alpha; the pane solid, the moon, stars,
    far ridge and fireflies cut out with one even-odd fill), so macOS tints
    it for light and dark menu bars, inverts it while the menu is open, and
    honours Increase Contrast and Reduce Transparency like its own status
    items. **Menu Bar Icon → In Colour** draws the full-colour scene with a
    faint white edge so the dark sky keeps a shape on a dark bar; the choice
    is `menuBarIcon` in UserDefaults. The self-test draws both at 2× and
    reads pixels (corner clear, sky solid and dark blue, moon cut out or
    pale gold).
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

### 10.25 Windows: live desktop, tray app and screen saver (`windows/`, owner pick, 2026-11-02)

One native Windows 11 app that runs the same `web/` wallpapers behind the
desktop icons, on every monitor, controlled from a tray icon, and later as
the screen saver: the Mac app (§10.21) for Windows, going further where
Windows allows. **Status: W0 passed (2026-11-03, §10.25.21); W1 built
(2026-11-03, *As built* in §10.25.16); W2 built (2026-11-04; by-hand console
pass pending); W3 built (2026-11-04; by-hand console pass pending); W4 built
(2026-11-04; by-hand pass pending, checklist in §10.25.16); W5 built
(2026-11-05; by-hand pass pending, checklist in §10.25.16).** Phase W0
(spikes) is the gate: if a live web page can't run behind the icons on 25H2,
the project stops. Brainstormed and reviewed 2026-11-02; the original design
note is `docs/superpowers/specs/2026-11-02-windows-design.md`, and this
section supersedes it.

#### 10.25.1 Intent

The Mac app proved the idea: the same `web/` wallpapers, unchanged, running
as the real desktop background and as the screen saver. The owner wants the
same on Windows 11, where they sit in front of a two-monitor desktop all day.

Windows is friendlier ground than macOS, so this design goes further than the
Mac app did:

- The wallpaper truly sits **behind the desktop icons** (the Mac sits in a
  window just above the picture; here we live inside Explorer's own
  wallpaper layer).
- **Each monitor its own world**, or the same wallpaper on all (one world
  spanning both is planned for later).
- **The wallpaper reacts to the real mouse**, on the real desktop: fish
  follow the cursor, a click on bare desktop is a tap, Neko chases the
  pointer.
- **The screen saver is a first-class citizen**, because Windows `.scr`
  files are just programs and the app can select itself as the saver in one
  click (macOS couldn't).

#### 10.25.2 Goals, non-goals, anti-goals

**Goals (owner)**
1. Live wallpaper behind the icons on Windows 11, every monitor.
2. A tray icon that does everything (there are no global hotkeys, so the
   menu must be complete).
3. Per-monitor wallpapers. (Span across all monitors: later, owner.)
4. Interactive: pointer moves and desktop clicks reach the wallpaper.
   **Required.**
5. Pause per monitor when it's covered (fullscreen *or* a maximized or
   snapped window filling it).
6. On battery: drop to the power-save quality, never stop.
7. Ground lines sit above the taskbar.
8. C# (.NET), WebView2.

**Goals (proposed here, all approved by the owner)**
- The same app is the screen saver (`.scr`), sharing settings. **Built
  last**; it never holds up a release of the desktop app.
- Survives Explorer restarts, monitor hot-plug, DPI changes, sleep, lock and
  Remote Desktop without a relaunch.
- Installs per user with no admin rights, and uninstalls cleanly from
  Settings → Apps.
- Developed and built from WSL on the owner's machine; CI builds and tests it.

**Not in v1 (owner: later)**
- **Span mode** (one wallpaper across all monitors). v1's code shouldn't
  make it hard, but nothing is built for it; §10.25.6 keeps the sketch. No
  wallpaper learns about monitor edges (no Neko crossing screens).
- **Jellyfin on the Windows desktop.** Pages load from an https origin and a
  home Jellyfin server is usually plain http: mixed content and local-network
  blocks, the problem Android solved with its `MediaProxy`. In v1 Jellyfin
  shows its own offline/sign-in state like any unreachable server, is never
  picked by the saver's random pool, and the README says so. §10.25.19 has the
  later plan.

**Non-goals (owner)**
- Lock screen. Accent colour. Global hotkeys. Playlists/rotation on the
  desktop. Code signing (later; SmartScreen will warn on first run until
  then).

**Anti-goals: failure even if it "works"**
- Any wallpaper code forked or special-cased for Windows. `web/` gets only
  small, host-neutral additions (§10.25.7); a wallpaper never checks for Windows.
- Icons, desktop right-click, icon drag/drop or rubber-band selection
  breaking or lagging because of us.
- A stale frame or black desktop left behind after Quit or a crash.
- Burning GPU/CPU while nobody can see it: covered, locked, display off,
  fullscreen game.
- Stealing focus, appearing in Alt-Tab or the taskbar, or showing a console.
- Changing the user's Windows wallpaper or screen saver without asking.

#### 10.25.3 What research found (Nov 2026)

| Goal | Possible? | How | Risk |
|---|---|---|---|
| Behind the icons | **Yes** | Explorer's undocumented `0x052C` message to `Progman` creates the wallpaper layer; our window goes into it. Wallpaper Engine and Lively work this way. | **Medium**: 24H2 changed the layout (below); proven in spike W0.1 |
| WebView2 in it | **Yes**, with care | WebView2 is on every Windows 11 machine (the owner's: runtime 156) | **Medium**: Chromium's occlusion tracking may think we're covered by the icons and stop rAF (W0.2) |
| Pointer moves and clicks | **Yes** | Raw Input with `RIDEV_INPUTSINK` sees the mouse with no hook and no permission; a hit test tells bare desktop from icons and apps | Low |
| Per-monitor pause | **Yes** | Enumerate top-level windows on window events; measure how much of each monitor is covered | Low |
| Screen saver | **Yes, solid** | A `.scr` is an exe run with `/s`, `/p <hwnd>`, `/c`; selecting it is `HKCU\Control Panel\Desktop` + `SystemParametersInfo` | Low (Mac's equivalent was the fragile part) |
| Per-user install, no admin | **Yes** | `%LOCALAPPDATA%\Programs\Wallpapers`, `HKCU` Run and Uninstall keys | Low |

**The 24H2 change.** Through 23H2, `0x052C` split the desktop into two
top-level `WorkerW` windows and wallpaper apps parented into the one *behind*
the icon view. From 24H2 (the owner runs **25H2, build 26200**) the desktop is
"raised": `Progman` has `WS_EX_NOREDIRECTIONBITMAP`, the icon view
(`SHELLDLL_DefView`) is a *layered child* of `Progman`, and Explorer's own
wallpaper layer is a `WorkerW` child of `Progman` below it. Lively broke on
24H2 and was fixed in 2.1.0.6. Projects that work on 24H2/25H2 report:

- Send `0x052C` with **wParam `0xD`, lParam `1`** (with `0, 0` the shell
  silently does nothing on new builds); send it only if the layer doesn't
  already exist; give Explorer up to ~2 s to build it.
- Put our window in a **layered child of `Progman` (alpha 255)**, Z-ordered
  **directly below `SHELLDLL_DefView` and above Explorer's `WorkerW`**.
  Check the order periodically and repair it only if Explorer changed it.
- The process needs a manifest declaring Windows 8–11 support (layered
  *child* windows need it).
- Read the window tree once and pick a layout: **classic** (≤ 23H2, two
  top-level `WorkerW`s, parent into the one without the icons), **raised**
  (24H2+), or **not split** (draw in front of the icons as a last resort,
  and log it).

**Settled on 25H2 by spike W0.1 (§10.25.21):** the raised recipe works as
written: a layered child of `Progman` directly below `SHELLDLL_DefView`.
Reports disagree on details across builds (one finds parenting into
`SHELLDLL_DefView` works where `Progman` didn't), so W0.1 tries the
candidates on the owner's 25H2 machine and records what works, like the Mac's
Spike M0.1. Sources: [lively#2074](https://github.com/lively-community/lively/issues/2074),
[kirie#11](https://github.com/UnhingedSoftware/kirie/pull/11),
[Intonaco#5](https://github.com/77worldd/Intonaco/pull/5),
[beautiful-wallpaper#83](https://github.com/C0uki/beautiful-wallpaper/pull/83).

**Occlusion.** Chromium on Windows computes native-window occlusion from the
Z-order and, when it decides a window is covered, treats the page as a
background tab: rendering stops and timers throttle. A full-screen icon
view above us may trigger that. Candidate fixes, tried in W0.2: browser
argument `--disable-features=CalculateNativeWinOcclusion` (plus
`--disable-background-timer-throttling`), or WebView2 **visual hosting**
(`CoreWebView2CompositionController` drawing into our own DirectComposition
visual), which also gives real input injection (§10.25.8). This is the analogue of
the Mac saver's occlusion gotcha. We then own visibility ourselves through
`CoreWebView2Controller.IsVisible` (§10.25.9). **Settled by W0.2
(§10.25.21):** on 25H2 Chromium never throttles our host, flags or not,
icons above it or a maximized window over it (the host's top-level ancestor
is Explorer's, not ours, so Chromium's occlusion pass ignores it). The
flags are harmless and unneeded; **visual hosting** wins on cost (~10× less
CPU than windowed) and on Explorer restarts.

**The owner's machine right now:** Windows 11 25H2, a laptop (RTX 3080 Ti
Laptop + Iris Xe, a battery), usually two monitors; this session was over
**Remote Desktop** (one virtual 2560×1440 screen, taskbar 48 px), with
Parsec and a virtual-display driver installed. So RDP and virtual displays are
first-class cases (§10.25.9), and real two-monitor testing happens at the console.

#### 10.25.4 Architecture

One process, one exe. WinForms (for `NotifyIcon`, the settings window and the
WebView2 control) plus hand-written P/Invoke in one file. No other NuGet
packages but `Microsoft.Web.WebView2` (and xUnit in the test project).

```
windows/
  Wallpapers/                  net10.0-windows, WinForms, the exe
    Program.cs                 mode dispatch: app · /s /p /c (saver) · --install · --uninstall · --selftest · --dump-displays · --cover-for-test
    App.cs                     single instance (named mutex + pipe), startup, shutdown, crash cleanup
    Tray.cs                    NotifyIcon and the whole menu (§10.25.10)
    DesktopLayer.cs            finds/creates Explorer's wallpaper layer, attaches hosts, repairs Z-order (§10.25.5)
    Desktop.cs                 one Surface per monitor; reconciles on display change (§10.25.6)
    DisplayConfig.cs           QueryDisplayConfig: monitor device paths and friendly names (§10.25.6)
    IdentifyWindow.cs          the big numbers of Identify Monitors
    Surface.cs                 a host HWND + its WebView2; bounds, DPI, visibility, power push
    WebFactory.cs              the shared CoreWebView2Environment; serves web/ and bing.json itself; policies (§10.25.14)
    BingJson.cs                answers bing.json natively, like Android/Mac
    Pointer.cs                 Raw Input → pointer events in the right page (§10.25.8)
    Coverage.cs                win-event hooks + EnumWindows: top-level window rects per monitor (math is in Core)
    Power.cs                   lock, display, sleep, battery, Energy Saver, RDP, fullscreen apps (§10.25.9)
    SettingsWindow.cs          the panel in a normal window (§10.25.11)
    PlayWindow.cs              a wallpaper in a normal focused window, for keyboard games (§10.25.8)
    Saver/                     /s full-screen windows, /p preview, /c options, watchdog (§10.25.12)
    Install.cs                 per-user install and update, Run key, Uninstall entry, uninstall stage 2, the offer (§10.25.13)
    ShellLink.cs               the Start menu shortcut (IShellLinkW by hand-written COM)
    Native.cs                  P/Invoke
    SelfTest.cs                --selftest (§10.25.15)
    app.manifest               PerMonitorV2 DPI, Windows 8–11 compatibility, asInvoker
  Wallpapers.Core/             net10.0, no Windows references, so it builds and tests on Linux
    Layout.cs                  modes → surfaces, insets, display keys
    DisplayKey.cs              the stable `m-xxxxxx` key of a monitor
    Coverage.cs                rectangle subtraction: fraction of a work area covered, and the pause hysteresis
    Power.cs                   the power state → what each page is told (`WP.power` JSON)
    SaverArgs.cs               /s /p:123 /p 123 /c:456 parsing (Windows passes all of these)
    AppSettings.cs             settings.json (mode, mouse, saver choices) with defaults
    PageUrl.cs                 index.html?host=windows&display=…&insets=…&screens=…
    DesktopShape.cs            window-tree snapshot → Raised | Classic | NotSplit | NoShell, attach target, z check
    WebFiles.cs                a URL → a file under web/ (nothing outside it) and its content type
    Catalog.cs                 the page's catalog for the tray, its labels, Surprise Me
    WindowPlacement.cs         where the settings window reopens, kept on a monitor that's there
    Install*.cs, AppVersion.cs  install folder, shortcut, Run and Uninstall values per flavour; versions and the offer; the uninstall plan; install modes (§10.25.13)
    BingArchive.cs, RollingLog.cs, Repaint.cs, Geometry.cs
  Wallpapers.Tests/            xUnit over Core; runs in WSL and CI
  build.sh                     publish + copy web/ + version stamping (like mac/build.sh)
  release.sh                   zip, checksum, checks; calls sign.sh
  sign.sh                      optional Azure Trusted Signing through jsign (§10.25.15)
  run.sh                       win-run/dev/test/install/uninstall launcher (WSL or Git Bash)
```

**Host kind:** `?host=windows` (and `?host=windows-saver`). The page code stays
the same apart from §10.25.7's small additions.

**Program modes** (besides the app itself): `--just-run` (the app, without
the install offer), `--install` (a quiet install or update; §10.25.13),
`--uninstall [--keep-settings|--delete-settings]` (asks unless told), `--quit`,
`--reload`, `--settings`,
`--dump-displays` (writes `displays.json` and `tree.json` to the data folder),
`--selftest [--bad-web-root]`, and `--cover-for-test <rect>`: a borderless,
work-area-sized, non-activating window that closes itself after 20 s. Only
the self-test starts it (§10.25.15); it has to be a separate process because
coverage ignores our own windows. `--uninstall-stage2 <root>` is uninstall's
own second stage, the `%TEMP%` copy that removes the install folder.

**Where things live (per user):**

| What | Where |
|---|---|
| App | `%LOCALAPPDATA%\Programs\Wallpapers\` (`Wallpapers.exe`, `Wallpapers.scr`, `web\`) |
| Web storage (all wallpaper settings) | `%LOCALAPPDATA%\Wallpapers\WebView2\` (one shared user data folder) |
| App settings (display mode, mouse, saver) | `%LOCALAPPDATA%\Wallpapers\settings.json` |
| Log | `%LOCALAPPDATA%\Wallpapers\log.txt` (rolls at 1 MB, keeps one old) |

#### 10.25.5 Behind the icons (`DesktopLayer.cs`)

- **Attach:** detect the layout (classic / raised / not split) as in §3.
  Create one **host window** per surface: a borderless child,
  `WS_CHILD | WS_VISIBLE | WS_CLIPCHILDREN`, layered (alpha 255) where the
  raised layout needs it, never activatable, positioned in the parent's
  client coordinates (the virtual screen's origin can be negative: a monitor
  left of or above the primary).
- **Z-order:** raised: directly below `SHELLDLL_DefView`. Classic: inside the
  back `WorkerW`. Checked on every display change and on a 5 s timer;
  repaired only when wrong.
- **Explorer restarts:** listen for the registered `TaskbarCreated` message.
  Re-detect, re-create the layer (send `0x052C` again: the new `Progman` has
  none), and re-attach. **Spike W0.1 found that a host HWND dies with
  Explorer** (it's a child of Explorer's `Progman`), so it is *recreated*, not
  re-parented. **The page still survives without a reload (W0.2):** with
  visual hosting, the `CoreWebView2CompositionController` is parented to a
  hidden top-level window of *ours* (Explorer can't take it down), and only
  the DirectComposition target lives on the host. On restart: detach the
  visual from the dead target (`SetRoot(null)`), bind it to the new host's
  target, `Commit`. Measured: re-bound in 7 ms, frame counter unbroken. (A
  controller parented to the host itself is disposed with it: recreate and
  reload, ~3 s.)
  Also re-attach if the parent HWND dies (`IsWindow` check on the timer).
- **At login:** Explorer may not be ready. Retry the attach with backoff for
  up to 60 s, then stay running and attach on the next `TaskbarCreated`.
- **Quit and crash:** destroy the hosts, then make Explorer repaint its own
  picture by re-applying the current wallpaper path
  (`SPI_GETDESKWALLPAPER` → `SPI_SETDESKWALLPAPER` with the same path, no
  `SPIF_UPDATEINIFILE`), so no stale frame is left. The same cleanup runs from
  the unhandled-exception handler and on `WM_ENDSESSION`.
- **Not split** (a runtime safety net for a *future* Windows build that
  breaks the layer after we ship; at W0 this case means the project stops,
  §10.25.16): draw in front of the icons only if the owner ticks
  *Troubleshooting → Draw above icons*; otherwise show a tray balloon
  explaining, and keep running (the tray still works, the saver still works).

#### 10.25.6 Monitors: Same and Different (`Desktop.cs`, `Core/Layout.cs`)

A tray choice, `Monitors ▸`, stored in `settings.json`:

| Mode | Surfaces | Which wallpaper | Default |
|---|---|---|---|
| **Same on all** | one per monitor | all follow `wp:current` | ✓ |
| **Different per monitor** | one per monitor | each its own (`?display=<key>`, §10.25.7) | |
| *Span across all (later)* | *one, covering every monitor* | *`?display=span`* | |

- **Display keys** must survive reboots and port changes, so not
  `\\.\DISPLAY1`: use the monitor device path from `QueryDisplayConfig` +
  `DisplayConfigGetDeviceInfo` (falls back to the GDI name), hashed to a
  short stable id (`m-3fa9c2`). Friendly names come from the same call
  ("DELL U2720Q"), for the menu. *(Built in W2: key = `m-` + the first six
  hex digits of SHA-256 of the lowercased path, or of `gdi:` + the GDI name
  when there is no path; a duplicate gets `-2`, `-3`. Monitor numbers are
  1-based in plan order: primary first, then by left, then top.)*
- **Same wallpaper on two monitors in Different mode share that wallpaper's
  settings** (`wp:<id>`); only the *choice* is per monitor. *(Design call;
  keeps the panel and storage model unchanged.)*
- **Hot-plug, resolution, DPI, taskbar moves:** `WM_DISPLAYCHANGE`,
  `WM_SETTINGCHANGE` (`SPI_SETWORKAREA`) and `WM_DPICHANGED`, debounced
  500 ms, then reconcile: surfaces whose key still exists are kept and
  moved (a resize or scale change doesn't reload the page; only a changed
  inset does, and only that surface's); new monitors get a surface; gone
  ones are disposed. A monitor that comes back in Different mode gets its
  old wallpaper back (its key's `wp:current@` stays in storage). *(Built in
  W2. A surface that fails to start is dropped and tried again by the 5 s
  watch: at its next tick, then every 30 s while it keeps failing (logged
  once per streak), and at any display change. `SetModeAsync` does not persist the mode: the tray saves
  `settings.json`.)*
- **Over Remote Desktop** *(measured in W2)*: there is a monitor device path
  (`Default_Monitor`), and the friendly name is empty, so menus say
  "Display 1". The key (`m-5b3fcd` here) was the same across two runs;
  whether it survives a disconnect and reconnect is still to check by hand
  (§10.25.16). The `displays-rdp-200*.json` fixtures were captured in W1,
  before paths were read, so they have none and key by GDI name;
  `Diff_rdp_resize_is_a_move` tests that fallback, which a real RDP session
  no longer takes.
- **DPI:** the process is PerMonitorV2. Each per-monitor surface uses its
  monitor's scale (WebView2 `RasterizationScale`), so CSS px match Windows'
  scaling on each screen.
- **Taskbar → `host.insets`:** per surface, `monitor rect − work area` on
  each side (handles a taskbar on any edge and Windows 11's taskbar on
  secondary monitors), in CSS px. Auto-hide taskbar → 0. Passed as
  `?insets=t,r,b,l` (§10.25.7). A change reloads that surface's page (rare).

**Span (later, owner: not in v1). A sketch so v1 doesn't paint it into a
corner;** v1 only needs `Layout` to return a list of surfaces, each with its
own bounds, scale, insets and display key, which span later fills with one
entry.
- One surface over the **bounding box** of all monitors. Parts of the box no
  monitor shows (monitors of different heights, or offset) are drawn but
  never seen.
- `host.screens` (a new web parameter, added with span) would list each monitor's rect inside the canvas, in
  CSS px, so a wallpaper *can* avoid the invisible parts. Nothing has to:
  most wallpapers just fill the box and look right.
- **Insets in span:** bottom = canvas bottom − the highest work-area bottom
  of any monitor, so ground lines sit above every taskbar. The same rule for
  the other edges.
- **Mixed DPI in span:** one web view has one scale; use the **primary
  monitor's**. The other monitor shows things slightly larger or smaller
  than its own scaling. Accepted; documented in the README.
- **Pause in span:** only when *every* monitor is covered.
- **Cost:** one page instead of two; at 2 × 2560×1440 the tier governor
  (§4.8) handles it as it does a 5K browser window.

#### 10.25.7 Changes to `web/` (small, additive, host-neutral)

Each is useful beyond Windows and testable in a browser with URL parameters.

1. *(Built in W1: `WP.hostKind`.)* **`host=windows` / `windows-saver`** recognised by `player.js` and
   `stage.js` as host kinds (the desktop defaults: Auto, ceiling High,
   battery-aware). Today only `android` is special-cased; `mac` falls through
   to `standalone`, and that's fine for Windows too, except for the next
   items.
2. *(Built in W1: `WP.parseInsets`.)* **`?insets=t,r,b,l`** (CSS px) sets `host.insets` on any host; the player
   passes it to the stage. Replaces nothing: `host=android` keeps its 48 px
   default when `insets` is absent. Lets anyone test ground lines in a
   browser: `?w=harvest&insets=0,0,48,0`.
3. *(Built in W2.)* **`?display=<key>`**: the player reads and writes the choice as
   `wp:current@<key>` instead of `wp:current`. Absent key → inherit
   `wp:current` (so a new monitor starts with what the others show), then
   Seasonal. Its storage listener watches the right key. Picking in the
   panel opened with `display=` persists to that key.
4. *(With span, later: `?screens=x,y,w,h;…` → `host.screens`. Not in v1.)*
5. *(Built in W2.)* **Power policy:** a `remote` signal (Remote Desktop session) lowers the
   ceiling to Low: RDP sends every changed pixel over the
   network. Reason text `remote desktop`. *(W0.2 found RDP already turns
   animation effects off, so Chromium reports `prefers-reduced-motion` and
   the existing policy caps at 20 fps; with RDP's 32 Hz frames that paces to
   16 fps. A 15 fps cap would pace to ~10.7. Owner's pick (2026-11-04): ceiling Low and
   **no extra fps cap**, since RDP's own reduced-motion already paces it.)*
6. **Tests:** unit tests for the params and the policy; a smoke
   `STAGE_CHECKS` entry proving `insets` reaches `host.insets` and
   `display=` keeps two choices apart.
7. *(Built in W3: `WP.cornerButtons`.)* **No corner buttons on `windows` and
   `windows-saver`** (as on `android`). W3 sends real pointer moves into the
   desktop pages and the stage reports a mouse near a corner, which would show
   the gear and full-screen buttons; a desktop click goes into the stage, not
   the player, so they could never be pressed. `,` still opens the panel in
   *Play in a Window*. The settings window opens its panel with `panel=open`,
   so it doesn't need the gear. Owner's call (2026-11-04).

#### 10.25.8 The mouse (`Pointer.cs`), required

The host windows never take input: clicks belong to Explorer (icons,
right-click menu, rubber band). We *watch* the mouse and replay it into the
page, as the Mac does with its global monitor.

- **Source:** Raw Input (`RegisterRawInputDevices`, mouse,
  `RIDEV_INPUTSINK`) on a hidden message window: delivered even though we're
  never focused, no hook (so nothing Windows can time out, no lag added to
  the user's mouse). Position from `GetCursorPos` (physical px with
  PerMonitorV2); buttons from the raw flags. Unregistered while every surface
  is hidden. *(W0.4: works unfocused, over app windows and the taskbar;
  100–275 raw moves a second when the mouse is busy.)*
- **Moves:** forwarded to the surface under the cursor, if it's visible,
  coalesced to at most 60 per second. Moves count even when the cursor is
  over an app window (fish still follow it), matching the Mac.
- **Clicks (left button only):** forwarded only on **bare desktop**:
  `WindowFromPoint` is the desktop (`SysListView32` in `SHELLDLL_DefView`,
  `Progman`, `WorkerW` or our host), and UI Automation's `ElementFromPoint`
  there isn't a `ListItem` (an icon). Ask UI Automation **only** when
  `WindowFromPoint` already says desktop, on a worker thread (W0.4: on the
  desktop median 10 ms, p95 37 ms; over app windows it's slower, p95 79 ms,
  max 178 ms, and not needed). The press decides: a gesture that starts on
  an icon is never forwarded, even if it ends on bare desktop (an icon drag);
  one that starts bare is forwarded through its release. Down, up and click,
  so `host.gestures` sees taps and drags; W3 also synthesizes `dblclick`
  (the Fish Tank taps the glass) from the system's double-click time and
  distance. A drag on bare desktop also draws Explorer's
  selection rectangle; that's expected and harmless. Right and middle
  buttons are never forwarded.
- **Coordinates:** physical px → the surface's client px → CSS px (÷ its
  rasterization scale).
- **Delivery (settled by W0.4):** **moves** through
  `CoreWebView2CompositionController.SendMouseInput` (real, trusted
  `pointermove`s; Chromium coalesces them to its frame rate), plus `Leave`
  when the cursor leaves a surface. **Clicks** by the Mac's approach:
  `ExecuteScriptAsync` dispatching `PointerEvent`s and `MouseEvent`s at the
  CSS point into the active `iframe.stage` (same origin under our virtual
  host, so `contentDocument` is reachable). `SendMouseInput` presses work
  too, but **WebView2 then takes the foreground** (our controller's parent
  window becomes active despite `WS_EX_NOACTIVATE`), so keys typed on the
  desktop afterwards would go to us; script clicks never move focus (owner:
  an arrow key after a click still reached the desktop). No wallpaper reads
  `isTrusted`. (Handing the foreground straight back works as well, but
  leaves a ~100–200 ms gap where we hold it.)
- **Chromium's input window (W0.2, W0.4):** visual hosting makes WebView2
  create a top-level, full-screen `Chrome_WidgetWin_1` (layered, alpha 0),
  placed directly above `Progman`. With the controller parented to the
  *host*, it **swallows the first right-click on the desktop** and covers
  every hit test (bare-desktop classifier: 0 of 24 right). With the
  controller parented to **our own hidden window** (§10.25.5), it's harmless
  (24 of 24, menus open first time), though it sits at the same place in the
  z-order; why isn't known. Belt and braces: add `WS_EX_TRANSPARENT` to it
  (cross-process `SetWindowLongPtr`, same user), found among the
  environment's own process ids after every controller creation and
  re-checked on the 5 s timer. `EnableWindow(false)` doesn't help.
- **Settings (tray):** *Wallpaper Follows the Mouse* (moves) and *Clicks on
  the Desktop Play* (taps), both on by default. Touchscreens arrive as mouse
  raw input and just work.
- **Keyboard:** never forwarded from the desktop (typing there jumps between
  icons). Wallpapers that need keys (Quest; catalog `keys`) get
  **Play in a Window**: the current wallpaper in a normal, focused,
  resizable window where keys and clicks work natively. It also covers games
  you'd rather play than watch.
- **Elevated apps:** when an admin window has focus, Windows withholds raw
  input from us (UIPI; W0.4: zero raw moves for 15 s with Task Manager
  focused while the cursor crossed the screen, and a click lost its press).
  `GetCursorPos` keeps working, so W3 polls it (~30 Hz) while raw input is
  silent and the cursor moves: fish still follow. Clicks are lost until
  focus moves (clicking the desktop moves it anyway). Accepted.

*As built (W3, 2026-11-04; plan
`docs/superpowers/plans/2026-11-04-windows-w3-interactivity.md`).*
- **Where:** `Pointer.cs` (the hidden top-level `WallpapersPointer` window,
  `WM_INPUT`, the classifier worker, delivery), `Core/Pointer.cs` (`HitTest`,
  `PointerMap`, `MoveThrottle`, `CursorSource`), `Core/Gesture.cs`
  (`GestureTracker`, `DoubleClickRule`, `PointerScript`), `Surface.SendMove`,
  `SendLeave` and `SendPressAsync`, `PlayWindow.cs`. No hook anywhere;
  `SetForegroundWindow` is never called; no button ever goes through
  `SendMouseInput`.
- **Moves:** coalesced to one per **16 ms** (the latest position is flushed
  when a burst ends), to the visible surface under the cursor, over app
  windows too; `Leave` when the cursor leaves a surface. A position counts as
  a move when `GetCursorPos` changed, not by `lLastX/Y` (RDP's mouse is
  absolute). Local px = physical − `Placement.Screen` origin, CSS = local ÷
  that surface's `RasterizationScale`: one rule for real monitors (mixed DPI)
  and fake layouts (the fit factor is in the scale).
- **Clicks:** left down/up go through **one queue to one MTA worker**
  (`pointer-uia`), so a down and its up reach the page in order or not at all.
  Only when `WindowFromPoint` is a desktop class (`HitTest.IsDesktop`) is UI
  Automation asked. **It is hand-written COM to UIAutomationCore, not WPF**
  (controller ruling in Task 4's fix): `CUIAutomation8`
  (`e22ad333-b25f-460c-83d0-0581107395c9`) with 500 ms connection and
  transaction timeouts through `IUIAutomation2`, falling back to
  `CUIAutomation` (no timeouts, logged); `ElementFromPoint`, then
  `CurrentControlType == 50007` (`ListItem`) is an icon. `UseWPF` would have
  cost 23 MB (the exe went 52.1 → 75.9 MB); the exe stays 52,154,922 bytes.
  Any UIA failure counts the press as **bare** (owner's call).
- **A press whose verdict arrives more than ~1 s after it is dropped as
  stale** (debug log `(stale, N ms old)`), so a hung Explorer can't replay old
  clicks, and breaks the double-click pair like any press that isn't
  forwarded. A new down first releases a still-pressed surface (a missed up). A
  gesture ends (the release is sent) when its pressed surface is hidden, and
  hidden surfaces get no moves or `Leave`. A drag's moves go to the pressed
  surface even off it, with `buttons 1`; with *Follows the Mouse* off the
  release is followed by a `Leave`. A surface whose browser process has died
  reads as not visible until it is rebuilt.
- **Double click:** `GetDoubleClickTime()` and `SM_CXDOUBLECLK/SM_CYDOUBLECLK`
  read when the pointer starts: a second bare press within that time, on the
  same surface, within half the distance each way, adds `dblclick`
  (`detail: 2`) to its release; a double resets the pair. The Fish Tank
  therefore gets its glass tap and two foods.
- **Raw input** is registered only while the toggles allow it and some surface
  is visible (log `pointer: on …` / `pointer: off (no visible surface | both
  toggles off)`); the 33 ms poll counts a sample only when raw input has been
  silent for 250 ms.
- **Settings:** `settings.json` gains `followMouse` and `desktopClicks`
  (default true; old files read as true), the two tray rows after *Pause*.
- **Play in a Window:** `index.html?host=windows&w=<id>`, a normal, focused,
  resizable window (title `Wallpapers · <name>`, centred on the monitor
  asked), unmuted (owner's call). The page has no corner buttons (§10.25.7
  item 7); `,` and `f` work. Current behaviour: a pick or `n`/`p` inside it
  writes the shared `wp:current`, so in Same mode it changes the desktop, as
  the settings window does. A Play window is ours (by pid), so it never pauses
  a desktop surface by coverage, even maximized over it.
- **Verified (by script or self-test, over RDP at 200% and in the fake
  layout):** `Pointer.FeedForTest` probes landed at (400, 300) on the real
  surface and on fake monitor 2, with the foreground never ours;
  `ClassifyForTest` on fake hosts took 1.5–19.8 ms (the first call includes
  creating `CUIAutomation8`); the Play window opened three times (title,
  centring, unmuted, renderer count back after close); deliberate-failure
  runs (Task 7: a broken `Plan.Scale` path failed `pointer (fake monitor 2)`
  at the tap, which is why the built-in fake layout is now two 1920×720
  monitors: at 1280×720 the RDP fit factor was exactly 1 and the bug hid).
- **Not verified:** real mouse input of any kind; an icon verdict from UIA on
  real icons (every icon was under the owner's maximized terminal, so
  `pointer classify` reported UIA correctly not asked); the stale drop (it
  needs a hung Explorer); the app's CPU with the mouse busy (owner, Task
  Manager: *pending (by hand)*); UIA timings against real icons (*pending
  (by hand)*; W0.4 measured median 10 ms, p95 37 ms on the desktop).

#### 10.25.9 Visibility and power (`Power.cs`, `Coverage.cs`)

Everything becomes `WP.power({...})` on each page, as on Mac and Android,
plus `IsVisible = false` on hidden web views (Chromium then stops rendering
outright, the biggest saving).

**Per-monitor coverage.** *(W0.2: needed for power, not just tidiness: a
covered visual surface costs ~10× an exposed one, ~55% of a core against
~5% for Harvest Valley; `IsVisible = false` stops frames at once and
`visible` resumes them within a second.)*
- Candidates: top-level windows that are visible, not minimized, not cloaked
  (`DWMWA_CLOAKED`: other virtual desktops, suspended UWP apps, Task View),
  not ours (our process and our WebView2 child processes: the full-screen
  input overlay belongs to them), not shell windows (`Progman`, `WorkerW`, `Shell_TrayWnd`,
  `Shell_SecondaryTrayWnd`), and not click-through overlays
  (`WS_EX_TRANSPARENT`, or layered with alpha 0: GeForce and Discord
  overlays are full-screen and must not pause us; a per-pixel-alpha overlay
  from `UpdateLayeredWindow` without `WS_EX_TRANSPARENT` counts as covering).
  Rects from
  `DWMWA_EXTENDED_FRAME_BOUNDS` (excludes the invisible resize border).
- **Covered** when ≥ 97% of the monitor's work area is under candidates
  (rectangle subtraction in `Core/Coverage.cs`). That catches
  fullscreen, maximized and two snapped halves.
- **When:** `SetWinEventHook` (out of context) for foreground, show/hide,
  minimize start/end, move-size end, cloak/uncloak and top-level location
  changes; coalesced (it fires 150 ms after the first event; later events
  don't push it back); plus a 2 s safety timer. An `EnumWindows` pass
  is well under a millisecond.
- **Hysteresis:** uncovered → resume at once (after the coalescing wait
  above); covered → pause after 300 ms (Alt-Tab and window drags don't
  flicker). Off in a fake layout.

**All signals:**

| Signal | Windows source | Effect |
|---|---|---|
| Monitor covered | coverage, above | that surface: `hidden` |
| Fullscreen game / presentation | `SHQueryUserNotificationState` (`QUNS_RUNNING_D3D_FULL_SCREEN`, `QUNS_PRESENTATION_MODE`) | all: `hidden` |
| Locked, user switched | `WTSRegisterSessionNotification` | all: `hidden` |
| Display off, sleep | `RegisterPowerSettingNotification(GUID_CONSOLE_DISPLAY_STATE)`, `WM_POWERBROADCAST` | all: `hidden` |
| Screen saver running | the saver tells the app over the pipe; `SPI_GETSCREENSAVERRUNNING` as backup | desktop: `hidden` |
| Tray Pause | menu | all: `hidden` (paused) |
| On battery | `GUID_ACDC_POWER_SOURCE`, `GUID_BATTERY_PERCENTAGE_REMAINING` | `battery {charging, level}` → ceiling Medium, Low under 20% (existing policy) |
| Energy Saver on | `GUID_ENERGY_SAVER_STATUS` (Win 11), else `GUID_POWER_SAVING_STATUS` | `saver` → Low, 15 fps |
| Remote Desktop | `GetSystemMetrics(SM_REMOTESESSION)` + session change | `remote` → Low, no extra fps cap (§10.25.7) |
| Animation effects off | Chromium maps it to `prefers-reduced-motion` already | existing reduced-motion profile |

This matches the owner's rule: battery and Energy Saver *lower* quality and
never pause. Only invisibility pauses.

*As built in W2 (`Core/Power.cs`, `Power.cs`):*
- Lock and disconnect are re-polled every 2 s as well as notified, so a
  missed message can't leave the wallpaper hidden. Fullscreen app and screen
  saver are polled too.
- A console display-off does not hide while the session is remote: the
  display-state setting is the physical console, and an RDP viewer still sees
  the wallpaper.
- `DisplayOff` is never re-read: a missed display-on without a sleep leaves
  the wallpaper hidden. A known limit. `Asleep` is cleared by a resume
  message, or by the second 2 s poll tick after the suspend (a tick only
  fires while the machine runs, so a missed resume or an aborted suspend
  can't leave it hidden; logged `power: no resume message; awake again`).
  In modern standby the ticks keep coming, which is harmless: `DisplayOff`
  still hides.
- Every surface gets its visibility set before any script is awaited, so one
  hung page can't hold the others in the wrong state.

**GPU on hybrid laptops:** WebView2 renders on the adapter Chromium picks
(usually the one driving the display). Nothing to do; noted in the README for
anyone who wants to force the power-saving GPU in Windows' Graphics settings.
(README, Windows: Settings → System → Display → Graphics, add
`Wallpapers.exe`.)

**Sound:** web views are muted (`IsMuted`) on the desktop. *Allow Sound* in
the tray (off by default) unmutes them; it matters once Jellyfin arrives
(§10.25.19). A desktop that talks unexpectedly is a failure.

#### 10.25.10 The tray (`Tray.cs`)

Our icon (`web/icons/icon.svg` → `.ico` via `make icons`), tooltip = what's
showing ("Wallpapers: Snow · Fish Tank"). Left or right click opens the same
menu. Everything is here, since there are no hotkeys:

```
❄  Snow                                  (what's showing; per monitor in Different mode)
Wallpaper                             ▸  catalog list, current ticked
  — in Different mode this becomes one submenu per monitor:
Monitor 1 · DELL U2720Q (main)        ▸  Wallpaper ▸ · Surprise Me · Next · Previous · Settings…
Monitor 2 · LG 27GL850                ▸  …
Surprise Me · Next · Previous            (all surfaces, in Same mode)
───
Pause / Resume
Wallpaper Follows the Mouse           ✓
Clicks on the Desktop Play            ✓
Allow Sound
Play in a Window…                        (current wallpaper; per monitor in Different)
───
Monitors                              ▸  ● Same on All · ○ Different per Monitor   (Span added later)
                                         ── Identify Monitors (a big number on each for 3 s)
Performance                           ▸  ● Auto · Low · Medium · High · ✓ Save Power on Battery
                                         ── now: Medium, fewer · 30 fps · on battery
Settings…                                (the panel; per monitor in Different)
Screen Saver                          ▸  (§10.25.12)
───
Start with Windows                    ✓
Troubleshooting                       ▸  Open Log Folder · Reload Wallpapers · Draw Above Icons · Developer Tools (debug builds)
About Wallpapers 0.11.0
Quit
```

- The catalog and current choice come from a page, as on the Mac
  (`ExecuteScriptAsync` on the first surface: `WP.catalog`, `WP.store`).
- Menu rows show the wallpaper's `thumb.webp` as a small image (Windows 11
  decodes WebP through WIC) next to its name; falls back to the emoji.
- Performance writes `wp:performance` through the page (`WP.store`), so the
  panel, the tray and every surface agree.

#### 10.25.11 Settings window (`SettingsWindow.cs`)

The panel, exactly as Android and Mac do it: a normal window with
`index.html?host=windows&panel=open` (`&display=<key>` in Different mode;
the title says which monitor). Same user data folder, so changes reach the
desktop through `storage` events, which Chromium fires across all pages of
a profile. Remembers its size and position. Closing hides it. It shows in the
taskbar only while open. The first-run hint (`wp:hinted`) is pre-set on
desktop surfaces, like the Mac, because "press , for settings" is wrong on a
desktop that ignores keys.

#### 10.25.12 Screen saver (`Saver/`)

**Shape.** The same exe, installed a second time as `Wallpapers.scr` next
to `Wallpapers.exe`. `Program.cs` dispatches on arguments (`SaverArgs`
handles `/s`, `/p 123`, `/p:123`, `/c`, `/c:456`, any case, and no argument =
`/c` when the file is `.scr`).

- **`/s` run:** one topmost borderless window per monitor, each with a WebView2 on `?host=windows-saver`.
  Quality ceiling High. Exits on a key, a click, or the mouse moving more than
  8 px from where it started; the cursor is hidden. Windows' *On resume,
  display logon screen* works unchanged (Windows locks when our process
  exits).
- **`/p <hwnd>` preview:** a child window in the little monitor in
  Windows' dialog, with a live web view; if that fails, the wallpaper's
  `thumb.webp`. Exits when the parent window goes away.
- **`/c` options:** brings up the tray app (starting it if needed) and opens
  a small native dialog with the saver choices below. (Unlike the Mac's dead
  Options button, this works.)

**Choices (tray `Screen Saver ▸`):**
```
✓ Use Wallpapers as the Screen Saver…      (asks first; sets SCRNSAVE.EXE, ScreenSaveActive)
Start After                             ▸  1 · 3 · 5 · 10 · 15 · 30 min        (ScreenSaveTimeOut)
Show                                    ▸  ● Same as the Desktop · ○ A Different One Each Time · ○ One Wallpaper ▸
Change Every                            ▸  1 · 5 · 15 · 30 min                 (for "Different")
Show a Clock                            ✓  (the web clock overlay, §4.9: ?clock=drift)
Preview Now
Open Windows Screen Saver Settings…
```
Selecting writes `HKCU\Control Panel\Desktop` (`SCRNSAVE.EXE` = full path
to our `.scr`, which Windows accepts outside `System32`), then
`SystemParametersInfo(SPI_SETSCREENSAVEACTIVE / SPI_SETSCREENSAVETIMEOUT,
SPIF_SENDCHANGE)`. Group Policy can override; we detect that and say so.
"A Different One Each Time" skips Blank, Jellyfin and Bing (they need a
network), and monitors avoid each other's wallpaper, as on the Mac.

**Settings reach the saver.** **Settled by W0.3 (§10.25.21): the saver
opens the same WebView2 user data folder as the app, and there is no
mirror.** The two processes share one browser process and `localStorage`
directly, in either start order: storage events arrive in ~1 ms, a saver
started alone reads the last values, and a crash of the app leaves the
saver's page running. **The environment options must be identical** (same
browser arguments; a mismatch fails `CreateAsync` with `0x8007139F`), so
both come from one place in the code. *(The superseded alternative was the
Mac's `saver.json` mirror, `Core/Mirror.cs`; not built.)*

**Watchdog** (from the Mac): the page's frame counter is checked every 4 s;
two stalls reload, the next recreates the web view, the next shows the clock
on black and retries every minute. A dead renderer
(`ProcessFailed`) takes the same path.

While the saver runs, it tells the tray app over the named pipe, and the
desktop surfaces go `hidden`.

*As built (W5, 2026-11-05; plan
`docs/superpowers/plans/2026-11-05-windows-w5-screen-saver.md`).*
- **Files.** Core: `SaverArgs` (the argument forms), `SaverSettings` (with
  `SaverShow`, `PreviousSaver`, `SaverChoices`), `SaverPicker`, `SaverInput`
  (the 8 px move rule), `SaverWatchdog` (the steps), `SaverRegistry` (with
  `SaverRestore`) and `SaverLease`. App: `Saver/SaverMain.cs` (`/s`, `/p`, `/c`
  entry), `SaverSession.cs` (the windows, rotation, pings, the state file),
  `SaverWindow.cs` (one form per monitor: input, watchdog, fallback clock),
  `SaverPreview.cs` (`/p`), `SaverSelection.cs` (the registry and
  `SystemParametersInfo` side), `SaverControl.cs` (the tray's and the options
  window's actions), `SaverOptionsWindow.cs` (`/c`). `Program.Main` dispatches
  right after the uninstall stage-2 line: any `SaverArgs` mode other than none
  goes to `SaverMain`.
- **Dispatch.** `/s`, `/p <hwnd>` (also `/p:<hwnd>`, `-p`), `/c` (also
  `/c:<hwnd>`); a `.scr` run with no argument is `/c`. `--selftest /s` is not a
  saver. The saver logs to `saver-log.txt` beside `log.txt`, so a saver run never
  interleaves with the tray app's log. Its state goes to `saver-state.json`
  (written in the test flavour and with `WP_DEBUG`; the self-test reads it).
- **`/s`.** Each window is a `Form` that holds a `Surface` (composition
  hosting, the way the desktop does): the form gets every key, click and move
  itself, and Chromium's full-screen, alpha-0 input window is made
  click-through (`WebFactory.MakeOverlaysClickThrough`, shared with
  `Desktop.FixOverlay`; re-run on every watchdog tick). The cursor is hidden;
  the first window is activated; losing activation (`WM_ACTIVATEAPP` 0) ends
  the saver ("deactivate"), as does `WM_CLOSE`. `SC_SCREENSAVE` is swallowed.
  Quality ceiling is High.
- **Different mode** loads each window on `?w=blank` and, once the page answers,
  calls `WP.player.show(pick)` so the first frame is black and then crossfades
  to the pick. Picks come from `SaverPicker` (never Blank, Jellyfin or Bing; no
  monitor shows another's current wallpaper, and a rotation always changes
  something). After a reload or recreate the window's kept pick is shown again.
- **The desktop's saver flag is a lease.** The saver sends `saver-on` over the
  pipe at once and every **4 s**; the app treats the saver as running for
  **10 s** after the last ping (`SaverLease`, on the monotonic clock
  `Environment.TickCount64`, so a wall clock set back can't stretch it), or while Windows says it is.
  `saver-off` is queued behind any ping on its way. A saver that dies leaves the
  desktop hidden for at most 10 s.
- **Watchdog timings.** Every 4 s (1 s, 3 retry ticks in the test flavour) the
  page's rAF counter is read with a 2 s timeout; no advance is a stall. Steps:
  Reload, Recreate (new Surface), Fallback (clock on black), then a retry every
  15 ticks (about a minute) that puts a new Surface under the clock and removes
  the clock once frames advance. A dead renderer (`Surface.Lost`) takes the same
  path. The watchdog waits while the saver's windows are hidden (locked,
  display off).
- **Fallback clock.** Native: the time in the user's format, white, Segoe UI
  Light at a sixth of the height, on black, moving to a random spot each
  minute. It is also what shows with no WebView2 runtime or a bad web root, and
  when creating the WebView2 environment fails in any other way. Each window
  starts on its own: one whose start throws is logged (`couldn't start …; its
  watchdog takes over`) and the windows after it still start.
- **`/p`.** `SaverPreview` makes a child window of Windows' preview host and
  draws a live `Surface` at 0.5 `RasterizationScale`; if that can't start
  (whatever it throws) it paints the app icon on black. It exits when the parent goes (500 ms poll, and
  on `WM_DESTROY`). No pinging, input or watchdog.
- **`/c`.** Sends `saver-options` over the pipe to the running app (after
  `AllowSetForegroundWindow`), or starts `Wallpapers.exe --saver-options` beside
  the `.scr` when nothing answers. The app opens `SaverOptionsWindow`: a native
  dialog with the same choices as the tray, each applied at once.
- **Selection.** `SaverSelection.Select` writes `SCRNSAVE.EXE` (the short 8.3
  path when Windows gives one), `ScreenSaveActive=1`, and the timeout through
  `SystemParametersInfo`; it returns the saver it replaced, which
  `SaverControl` keeps as `Before` only when it isn't ours. A group policy
  (`Software\Policies\Microsoft\Windows\Control Panel\Desktop`, HKCU and HKLM)
  disables the item and its tooltip says why (while ours is selected, Use stays
  enabled so it can still be unticked). Only the `run` flavour touches the
  real `Control Panel\Desktop`; `test` and `dev` write
  `Software\Wallpapers-<flavor>\…`.

#### 10.25.13 Install, start, uninstall (`Install.cs`)

- **The download** is a zip: `Wallpapers.exe` (self-contained, single-file,
  .NET included, ~52 MB unpacked) and `web\`. Run `Wallpapers.exe` from
  anywhere: if it isn't installed, it offers **Install** (copy to
  `%LOCALAPPDATA%\Programs\Wallpapers`, a Start menu
  shortcut, `Wallpapers.scr` (W5, below), an `HKCU\…\Uninstall` entry so it's in Settings → Apps, and
  *Start with Windows* ticked), or **Just Run** from where it is.
- **Updates:** running a newer exe offers to replace the installed one
  (compared by version), restarting the app.
- **Start with Windows:** `HKCU\…\CurrentVersion\Run`.
- **Uninstall** (`--uninstall`, from Settings → Apps or the tray's About
  dialog): quits the app, restores Windows' screen saver if it was ours
  (to what it was before; we save that when selecting), removes the Run
  key, shortcut, Uninstall entry and program folder. Asks whether to keep
  settings (`%LOCALAPPDATA%\Wallpapers`).
- **SmartScreen:** an unsigned exe from the internet shows "Windows
  protected your PC" → *More info* → *Run anyway*. The README says so. Built
  locally with `make win-install`, there's no Mark of the Web and no warning.
- **Smart App Control (found in W0.2; changes the signing call):** the
  owner's machine has SAC **on, enforcing**. It judges every unsigned binary
  by its hash, from cloud reputation, with no *Run anyway*: during the spikes
  it blocked 2 of about 20 local builds of `Spike.dll` outright (Code
  Integrity events 3033/3077, SAC's policy `{0283ac0f-…}`); a blocked hash
  stays blocked, and changing one log string gave a new hash that passed.
  Local builds aren't exempt (no Mark of the Web needed). So an unsigned
  release may simply not run on SAC machines, and day-to-day builds can be
  refused at random. See Open questions. In W1 a refused exe run through WSL
  interop showed only `Invalid argument` (PowerShell shows the real "An
  Application Control policy has blocked this file"); `run.sh` treats both
  as a refusal and builds again.
- **Single instance:** a second launch tells the first (named pipe) to open
  Settings, and exits.
- No admin rights anywhere. No services, no scheduled tasks, no drivers.

*As built (W4, 2026-11-04; plan `docs/superpowers/plans/2026-11-04-windows-w4-install-release.md`).*
- **Files.** `Install.cs` (`Install(layout, log)`: `Apply`, the offer, stage 1
  and 2 of uninstall), `ShellLink.cs` (`IShellLinkW` by hand-written COM, on an
  STA thread, so the self-test can call it from anywhere), Core's
  `InstallLayout` (`For(flavor, localAppData, roamingAppData)`, Windows paths
  joined with `\` so Linux tests agree), `AppVersion`, `InstallOffer`,
  `InstallSpecs` (the Run value, shortcut and Uninstall entry as data) and
  `InstallArgs`. The `run` flavour installs to `%LOCALAPPDATA%\Programs\Wallpapers`
  (`Wallpapers.exe`, `web\`); the `test` flavour adds `-test` to the folder,
  the shortcut, the Run value and the key, and shows as `Wallpapers (test)`;
  `dev` never installs or offers. The shortcut is
  `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Wallpapers.lnk`, the Run
  value is `Wallpapers`, the key is `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\Wallpapers`
  (DisplayName, DisplayVersion, Publisher, DisplayIcon, InstallLocation,
  InstallDate, `UninstallString` = `"<exe>" --uninstall`, `QuietUninstallString` =
  that plus `--keep-settings`, NoModify, NoRepair, EstimatedSize,
  URLInfoAbout). Everything is under `HKCU` and the user's profile: no UAC,
  `asInvoker` stays.
- **The offer.** Run flavour, not `--just-run`, not already running from the
  install folder: not installed and not declined before → *Install* / *Just
  Run*; installed and this exe newer → *Update* / *Just Run*; installed and the
  same or older → no dialog (one log line), run. Versions compare
  `major.minor.patch` numerically, then the `+` build stamp (`build.sh`'s
  `InformationalVersion`); the dialog drops the stamp (so a local rebuild reads
  "Update 0.10.3 → 0.10.3"). *Just Run* is remembered (`settings.json`
  `"offerInstall": false`) and an update is still offered after it; closing
  the dialog with X or Esc asks again next time. `run.sh`'s `run` and `dev`
  pass `--just-run`, so developing never offers. The offer runs **before** the
  single-instance check, so a newer download offers Update while the installed
  app runs; the same or an older exe falls through to the second-instance path
  (the first app opens Settings). Before any of it, an exe with no `web\`
  beside it (opened inside the zip from Explorer, which copies only the exe
  to `%TEMP%`) shows one dialog, *Unzip the whole download first*, and exits:
  no offer, nothing saved. The tray's *Install…* over an installed copy (one
  run with *Just Run*) asks *Replace … with …?* and keeps *Start with
  Windows* as it was.
- **Apply (install and update).** Checks the source has `web\` and a version,
  asks a running app to quit over the pipe (run flavour) and waits up to 15 s
  for the mutex and for the exe's lock, then **stages and swaps**: copies to
  `Wallpapers.exe.new` and `web.new`, swaps the exe first (the step a lock
  stops), then `web` → `web.old`, `web.new` → `web`, deletes `web.old`. Any
  failure rolls back to the old install, cleans the staged items, and **starts
  the old copy again** if it quit it, even when the exe then stayed locked
  past the deadline; on a StillRunning timeout where the app never quit there
  is nothing to restart. Either way the dialog says the installed copy keeps
  running and the download exits (no race for the mutex); with nothing
  running, it runs from here this time.
  Then the Uninstall entry, the shortcut, and for a fresh install only the Run
  value (an update leaves the user's *Start with Windows* choice alone). `--install`
  run from the installed exe skips the copy. Settings are never copied or
  removed. `Apply` never throws; it returns the reason.
- **Start with Windows** is the Run value, ticked from the registry each time
  the tray opens (no registry read per page event). Not installed: the row
  becomes **Install…**, which hands over: it releases the mutex, starts the
  installed exe and quits.
- **Uninstall.** `--uninstall` (stage 1) deletes stale
  `%TEMP%\Wallpapers-uninstall-*.exe`, copies the running exe to
  `%TEMP%\Wallpapers-uninstall-<stamp>.exe` and starts it with
  `--uninstall-stage2 "<root>"` (working directory `%TEMP%`, so nothing holds the
  root), then exits. **Stage 2 acts only on the run or test install folder**:
  any other root logs `that isn't an install folder; nothing removed` and exits
  1, so a command line can't point it at another folder. It asks *Keep My
  Settings* / *Delete My Settings Too* / *Cancel* (unless `--keep-settings` or
  `--delete-settings`), quits the running app, removes the Run value, the
  Uninstall key, the shortcut and the folder (and `%LOCALAPPDATA%\Wallpapers`
  when told; folders retry for ~3 s because WebView2 helpers linger), logs
  every step to `%TEMP%\Wallpapers-uninstall.log`, shows a result dialog when
  it asked, and deletes its own copy through a hidden `cmd` after a ping delay.
  A step that fails doesn't stop the others and is named in the result.
  `RestoreSaver()` was an empty hook until W5 (below).
- *As built (W5, 2026-11-05).* `Wallpapers.scr` is now created: a **full copy
  of the exe** (about 52 MB more on disk; a hard link or a tiny stub would be
  smaller, but the `.scr` must run on its own and survive the exe being
  replaced), staged as `Wallpapers.scr.new` and swapped with the exe and `web\`
  in `CopyAndSwap` (move aside exe, `.scr`, web; move in; roll back all three on
  failure). A running saver locks the `.scr`, which `CanOpenAlone` checks before
  anything is staged: the update stops with "Wallpapers.scr is in use (the
  screen saver may be running); try again when it has stopped". `--install`
  from the install folder (the copy skipped) makes the `.scr` when it is missing
  or a different length (`EnsureSaver`). `RestoreSaver` is real: it reads
  `settings.json`'s `Saver`, and if `SCRNSAVE.EXE` is ours puts back the saved
  `Before` (deleting the value when there was none); it runs first in the
  removal plan, and a failure is named in the result as "screen saver". An
  update notes whether ours was selected before the swap; if so and the stored
  `SCRNSAVE.EXE` no longer names our file afterwards (an 8.3 name that went with
  the old `.scr`), `SaverSelection.KeepSelected` writes the new short path
  (this flavour's key only; best effort, logged).
- **About** is a TaskDialog: version, WebView2 runtime, data folder, wallpapers
  folder, `Installed in <root>` or `Running from … (not installed)`; **Close**,
  **Uninstall…** (installed only) and **Project Page** (opens the homepage,
  which `build.sh` stamps into the exe from `web/manifest.json`'s
  `homepage_url`; it is never written in C#; the dialog stays open).
- **No online update check.** An update is a newer download run by hand. The
  app makes no network call to install or update, and no telemetry.
- **Sizes.** The installed folder is about 53 MB (EstimatedSize 54441 KB for
  0.10.3). The exe is compressed inside the single file, so `strings` on
  `Wallpapers.exe` doesn't find the homepage; read the Uninstall entry's
  `URLInfoAbout`, or `strings` the `obj` DLL.
- **Signing** is optional and off until the secrets exist (§10.25.15,
  Open questions). Unsigned, a downloaded copy shows SmartScreen, and Smart App
  Control can refuse a hash.

#### 10.25.14 Web view details (`WebFactory.cs`)

- One `CoreWebView2Environment` for the app, user data folder as in §4.
  Browser arguments: none needed (W0.2); `--disable-features=
  CalculateNativeWinOcclusion` may be kept as cheap insurance. DevTools and
  `--remote-debugging-port` only with `WP_DEBUG=1`.
- **Serving `web/`:** pages load from `https://wallpapers.example/`: one
  origin for every web view (shared storage), a secure context (battery
  API, geolocation), the CSP holds, no local server, no open port. `.example`
  is reserved and never resolves. The app answers every request to that
  origin itself, in `WebResourceRequested` (filter `https://wallpapers.example/*`),
  from the web folder (`Core/WebFiles.cs`: nothing outside it, `..` and
  backslashes refused, 404 otherwise; `Cache-Control: no-cache`, so *Reload
  Wallpapers* shows an edit). *Not* `SetVirtualHostNameToFolderMapping`, the
  first design: `WebResourceRequested` never fires for a mapped host
  ([Microsoft's docs](https://learn.microsoft.com/microsoft-edge/webview2/how-to/webresourcerequested)),
  so `bing.json` fell through to the folder and failed; `--selftest`'s
  `bing.json` check found it (W1, 2026-11-03). `WP_WEB_ROOT` overrides the
  folder for development (§10.25.15).
- **`bing.json`:** the same handler sends
  `https://wallpapers.example/bing.json` to `BingJson.cs`, which fetches Bing's
  archive natively (no CORS for the app) in `tools/bing.mjs`'s shape, cached
  an hour, with `X-Wallpapers-Bing: native` (503 when Bing can't be reached).
  `bing.js` already fetches `bing.json` on non-`http:` pages.
- **Navigation:** only our origin and `about:` load; any `http(s)` link
  (Bing's credit) opens the default browser; new windows likewise.
- **Console:** page errors go to the log (`WP_DEBUG=1`: everything).
- Default background black, so a slow first load isn't white.

#### 10.25.15 Build, develop, test, ship

**Toolchain.** .NET 10 SDK (current LTS). It cross-compiles Windows desktop
apps on Linux (`EnableWindowsTargeting=true`), so the whole build runs in
WSL and on Ubuntu CI. Running it needs Windows; WSL launches Windows exes
directly.

**Make targets (new, each with a `##` description; README Development
section):**

| Target | Does |
|---|---|
| `win-build` | `windows/build.sh`: publish win-x64 self-contained single-file to `dist/win/`, copy `web/` beside it, stamp `web/manifest.json`'s version |
| `win-unit` | `dotnet test` over Core (runs in WSL/Linux, no Windows needed) |
| `win-dev` | build, copy to `%LOCALAPPDATA%\Wallpapers-dev\` on the Windows side (found with `wslpath` and `cmd.exe /c echo %LOCALAPPDATA%`), and run it with `WP_WEB_ROOT` pointing at this checkout's `web/` through `\\wsl.localhost\…`, so a web edit + *Reload Wallpapers* shows at once. Uses a separate user data folder (`Wallpapers-dev`), never the installed app's. *As built:* the UNC path works as is (the app reads the files itself, §10.25.14); no copy needed |
| `win-reload` | reload a running app's pages (`--reload`; the `win-dev` one by default) |
| `win-run` | build and run the built exe (normal settings) |
| `win-test` | `--selftest` against a throwaway user data folder (below); needs Windows (WSL interop or CI) |
| `win-saver` | *As built (W5):* `BUILD=1 windows/run.sh saver` copies `dist/win` to its own `Wallpapers-build\saver` (so it quits nothing: the app you're running stays, and stands aside while the saver runs, as for a real one), runs `Wallpapers.exe /s` (your settings, read-only) full screen, waits for that one process (Start-Process, so WSL's pipes aren't inherited; its error output is where a refused build shows, since the usual `--quit` probe would stop the running app), then prints the last 40 lines of `saver-log.txt`. `windows/run.sh log saver` (`make win-log FLAVOR=saver`) shows that log. It takes over the owner's screen: run it only when you mean to |
| `win-install` / `win-uninstall` | install/uninstall the built app for this Windows user. *As built:* `windows/run.sh install` copies `dist/win` to `Wallpapers-build\install`, runs `--install` there and waits on that one process (started straight from WSL the installed app would inherit WSL's pipes); `win-uninstall` runs the installed exe's `--uninstall --keep-settings` (`DELETE_SETTINGS=1` adds `--delete-settings`). With nothing installed it says so and exits 0 |
| `win-test-zip` | the same `--selftest` against the app inside `dist/wallpapers-windows-<version>.zip`, unzipped to `dist/win-zip/`: what ships is what's tested. Works from WSL or Git Bash (`run.sh` takes `DIST=`; `cygpath` on Git Bash) |
| `win-sign-tools` | installs `osslsigncode` (apt, sudo) if missing; CI runs it before a signed release |
| `win-log` | tail the log |
| `win-sign` | `windows/sign.sh dist/win/Wallpapers.exe`: Azure Trusted Signing through jsign 7.6 (pinned sha256, cached under `dist/wallpapers-tools` or `$XDG_CACHE_HOME`; token by Entra client credentials). All six `WALLPAPERS_SIGN_*` variables set signs; none prints `unsigned (no WALLPAPERS_SIGN_* variables)`; a partial set exits 1 naming the missing ones. `win-release` calls it after the build, runs `osslsigncode verify` against Microsoft's root certificate (downloaded, sha256-pinned) if it signed, and ends `…, signed` or `…, unsigned`. `sign.sh --fetch` downloads and checks jsign and the root without secrets. **The token is jsign's `--storepass`, so it appears in jsign's argv (the process list) while signing**: fine on a CI runner, noted for a shared machine. **The signed path (token, sign, `osslsigncode verify`) has not run yet**: there are no secrets; only the unsigned path, a partial-set failure and `--fetch` were exercised |
| `win-release` | `windows/release.sh`: build, check, `dist/wallpapers-windows-<version>.zip` + `.sha256`. *Built ahead of W4 (owner, 2026-11-03):* the `ci` job runs it on every push and uploads `wallpapers-windows`; the `release` job attaches it. The installer and the `win` job came in W4 (below) |

`make ci` stays as it is, except `win-unit` joins it when `dotnet` is on the
PATH (skipped with a note otherwise, so contributors without .NET aren't
blocked).

**`--selftest`** (like `mac-test`, about 30 s, prints one line per check, exits
non-zero on failure):
*As built (W2), `make win-test` runs these checks:* `layer`, `animates` and
`insets` (per surface), `overlay`, `storage`, `pause`, `coverage`, `power`,
`display=`, `resize in place`, `resize in place (monitor removed)`,
`performance` low/medium/high/auto, `performance battery toggle`,
`bing.json`, `shell restart (simulated)`, `renderer crash`,
`power after reload`, `cleanup`, and with `--bad-web-root` the `web root`
check. About 45 s. *W3 adds* the pointer checks: `pointer move`, `pointer
tap`, `pointer double click`, `pointer icon`, `pointer hidden`, `pointer
toggles`, `pointer classify` and `pointer (fake monitor 2)`; the run is now
about 50 s. *W4 adds* `install`, `update`, `update (busy exe)` and `uninstall`
(after `cleanup`, since they need no surfaces; the busy-exe check takes about
15 s, the wait it proves). They use the **test layout only**, refuse to run
against any other, and remove everything in a `finally`, so the real install
is never touched. Details that matter:
- The pointer checks never synthesize input: they feed the forwarder
  (`Pointer.FeedForTest`) and classify real points without clicking
  (`ClassifyForTest`). The built-in fake layout is **two 1920×720 monitors**,
  so over RDP the fit factor is not 1 and a plan-scale bug shows. `pointer
  classify` needs desktop icons, and some of them or bare desktop in view:
  it SKIPs when the desktop has no icons or every point is covered (as it
  usually is over RDP, where the maximized terminal fills the one monitor;
  nothing else about RDP skips it); PASS reads `n of n right; uia median …`.
- `coverage` starts `Wallpapers.exe --cover-for-test <monitor 1 work area>`
  (a borderless, non-activating window, not a real maximize, so it takes no
  focus from whoever is working), checks that only monitor 1 hides, that the
  foreground window is unchanged and that closing it resumes. It is SKIPped
  when something already covers every surface. Coverage is off for the other
  checks' frames and on only for this one.
- `display=` and the two `resize in place` checks always run in a built-in
  fake two-monitor layout, even at the console with two real monitors.
- The `performance` checks compare against the stricter of the picked mode
  and the page's ceiling (battery, Energy Saver or Remote Desktop can lower
  it); `power` asserts the JSON the page last received.

*The design's list (numbers as in the plan):*
1. Desktop layer found (layout name logged); host attached below the icons;
   Z-order correct.
2. Every surface's page reports ready and its frame counter advances (proves
   W0.2's occlusion fix is in place).
3. A setting written in a second web view arrives as a `storage` event on the
   desktop page.
4. `WP.power({hidden})` freezes frames; resume restarts them; `IsVisible`
   follows.
5. Coverage: a test window covering a monitor's work area hides that surface
   only; closing it resumes.
6. Pointer: a synthetic move/click fed through the forwarder lands in the
   page (`host.gestures` sees a tap at the right CSS px).
7. `display=` keeps two monitors' choices apart (fake two-monitor layout, below).
8. Explorer-restart path: re-attach after destroying our parent (simulated;
   never kills the real Explorer).
9. Saver: `/s` in a harness, frames advance, input ends it; the watchdog's
   three steps; `/p` into a test parent.
   *As built (W5):* check 9 is the lines `saver run`, `saver overlay`,
   `saver rotation`, `saver input (move)`, `saver hides the desktop`,
   `saver input (key)`, `saver input (click)`, `saver watchdog`, `saver start fault`, `saver preview`,
   `saver options (/c)` and `saver menu`, plus `saver selection` and the
   `.scr` / `uninstall restores the saver` additions to the install lines. The
   self-test runs the saver **only in harness windows** (`--saver-window`: 480×270
   windows inside the work area, not topmost, cursor shown, never activated,
   deactivation ignored; `--saver-change-ms`, `--saver-stall`, `--saver-fault window|webview2`: the first
   window's start or the WebView2 environment throws an exception no handler filters for, and the other
   window still draws, or every window shows the clock), so it never takes
   the screen, and it selects the saver **only in a scratch key**
   (`Software\Wallpapers-test\…`, deleted at the start and the end; it refuses to
   run if the key would be the real `Control Panel\Desktop`). The tray menu check
   only reads the menu. `TimeoutSeconds` is 240.
10. Quit cleanup leaves no host windows.

**Core unit tests (xUnit, Linux):** surfaces and insets for side-by-side,
stacked, offset, mixed-size and negative-origin layouts; coverage math
(maximized, two snapped halves, 96% vs 98%, overlays ignored); display key
stability; saver argument forms; page URL encoding.

**CI:**
- `ci` (Ubuntu): `make win-build` and `make win-unit` (cross-compile proves
  it builds on every push), `make win-release`, and the `wallpapers-windows`
  artifact. On tags, `make win-release` also gets the six `WALLPAPERS_SIGN_*`
  secrets (`make win-sign-tools` installs `osslsigncode` first, only when the
  secrets exist).
- *As built (W4):* the `win` job (`windows-2025`, `needs: ci`, 15 min limit,
  Git Bash) **downloads that zip and runs `make win-test-zip`** on it; it
  doesn't build again, so what ships is what was tested. It uploads
  `wallpapers-windows-selftest` (the report and the log). **Runner facts
  (image `windows-2025-vs2026` 20261030):** it has an Explorer desktop
  (`layer` passes as *Raised*, so `--no-desktop` isn't needed), GNU make is
  preinstalled (a `choco install make` fallback never ran), the WebView2
  runtime is preinstalled (156.0; a step installs it only when missing and
  prints its version), and the screen is a fixed **1024×768** at scale 1 that
  `Set-DisplayResolution` refuses to enlarge. `pointer classify` SKIPs there
  (every icon is covered). The job takes about 75 s.
- `release` job: `needs: [ci, android, mac, win]`; it attaches the zip and
  checksum only when `needs.win.result == 'success'`, otherwise it prints a
  warning and releases without the Windows app, as it does for a failed Mac
  build (§10.25.20).
- **Fake monitors and WebView2's scale floor.** WebView2 renders no smaller
  than about 0.5 `RasterizationScale`, so a fake layout fitted below that
  maps pointers wrongly (the checks measured the floor, not the app). The
  self-test keeps the built-in 1920×720 pair while `FakeLayout.Fit` for it
  (5% margin, both limits) is in [0.5, 1), and otherwise sizes the pair to fit
  at about 0.75 (648×360 on the runner; 1920×720 on the owner's RDP screen at
  0.727). `pointer (fake monitor 2)` SKIPs when the measured scale is ≥ 0.99 or
  < 0.5, so it can never pass vacuously at 1. `pointer classify` SKIPs when only
  icons or only bare desktop were in view.

**Planning for two monitors before testing on them (owner: test later, plan
now).** Development mostly happens over Remote Desktop, which shows one
virtual screen. So nothing multi-monitor may depend on a second monitor being
there to work:
- All layout logic (surfaces, insets, display keys, coverage) lives in
  `Wallpapers.Core` and is unit-tested against recorded layouts: side by
  side, stacked, offset, mixed sizes, mixed DPI, negative origins, a taskbar
  on each edge. Real layouts are captured with `Wallpapers.exe --dump-displays`
  (JSON: monitors, work areas, scales, keys) and added as fixtures.
- `WP_FAKE_DISPLAYS=<file.json>` makes the app lay its surfaces out as
  if that layout were real, each in an ordinary window (not behind the
  icons), so Different mode, the tray's per-monitor submenus,
  hot-plug (edit the file) and pointer mapping can be exercised on one
  screen. `--selftest` check 7 uses it.
- `run.sh` passes `WP_FAKE_DISPLAYS` through to the Windows side (as a
  translated path; keep the file under `/mnt/c` so Windows sees edits):
  `WP_FAKE_DISPLAYS=/mnt/c/…/displays.json BUILD=1 windows/run.sh dev`.
- The owner's RDP client can also present both physical monitors
  (*Use all my monitors*), a cheap real two-monitor check before W6.

**By hand (the owner, at the console with two monitors, W6):** icons, right-click
menu, rubber band and icon drag still work; Win+D; Task View and virtual
desktops; a fullscreen game; snapped windows; unplug/replug a monitor; a
different scale on each monitor; sleep/wake; lock; Explorer restart from
Task Manager; RDP in and out; the saver from Windows' dialog; uninstall.

#### 10.25.16 Roadmap

- **W0 Spikes: prove it (throwaway code; each ends with a result written into
  *Spike results* below, like the Mac's M0).**
  - W0.1 Behind the icons on 25H2: a host window with a plain coloured
    panel, in each layout candidate. → visible behind icons, icons and
    right-click work, survives Explorer restart. Record what worked.
  - W0.2 WebView2 in it: `index.html?w=fishtank` (the Fish Tank; the id was misnamed `aquarium` here at first) animating at display rate
    behind the icons for 10 minutes. Try windowed + occlusion flags, then
    visual hosting. → pick one; record fps and CPU.
  - W0.3 Two processes on one user data folder (app + saver). → works or
    mirror.
  - W0.4 Raw Input + bare-desktop hit test: log moves and taps; icons
    excluded.
  - **Gate (owner):** W0.1 + W0.2 must pass. If a live web page can't run
    behind the icons on 25H2, **the project stops**: no tray-only or
    saver-only consolation release, and drawing in front of the icons is
    not an acceptable default. Nothing past W0 is built before the gate.
  - **Where the spikes run:** over Remote Desktop is fine for W0 (the owner's
    usual session). Record the session type with every result, measure W0.2
    with the `remote` ceiling overridden (`?tier=high`), and note that the
    console's layout must be re-checked later (§10.25.15, two-monitor pass).
- **W1 Desktop core:** project skeleton, `make win-*` targets, install-free
  run, attach, one surface per monitor in Same mode, insets, tray (pick,
  next, pause, settings, quit), settings window, bing.json, Explorer
  restart, quit cleanup, self-test checks 1–4 and 10. Web changes §7.1–7.2.

  *As built (2026-11-03; plan `docs/superpowers/plans/2026-11-03-windows-w1-desktop-core.md`).*
  Windows 11 25H2 over Remote Desktop, one monitor at 200%.
  - **Self-test** (`make win-test`, ~27 s, all pass): layer, animates,
    storage, pause, insets, overlay, bing.json, shell restart (simulated),
    renderer crash (reloaded and animating in ~1.5 s), cleanup; and
    `WIN_ARGS=--bad-web-root`. Check 8 was first run against a broken path
    (no rebind) and failed, as it should.
  - **By hand (owner):** the scene behind the icons with the ground above
    the taskbar; right-click on the first try, icon drag and double-click,
    rubber band; an Explorer restart (re-bound in ~170 ms, no reload); every
    tray item; Quit gives back Windows' picture. By script: a pick in the
    settings window reaches the desktop; the window reopens where it was.
    A live RDP resize (1686 → 1844 px tall) rebuilt the surface in 0.6 s
    with the insets right, but twice (Windows sent two bursts) and each
    rebuild reloads the page: resizing in place belongs to W2's hot-plug
    and DPI work. An RDP disconnect and reconnect, and a resize, both
    checked by the owner: the scene fills the new screen.
  - **Changed from the design:** the app serves its origin itself
    (§10.25.14; the folder mapping never let `bing.json` through, which the
    self-test found); a crash exits after its cleanup (with no wallpaper and
    no tray left, staying would only hold the single-instance lock); Next
    and Previous step on the first surface and tell the others (stepping
    each would race through storage events); the panel's × or Esc closes
    the settings window; `--reload` and `make win-reload`.
  - **Not in W1** (as planned): the mouse (W3), Different mode and the
    Performance menu (W2), install and Start with Windows (W4), the saver (W5).
- **W2 Monitors and power:** Different mode and display keys, hot-plug and
  DPI, coverage pause, every power signal, Performance menu, Identify
  Monitors. Web §7.3, §7.5. Self-test 5, 7.

  *As built (2026-11-04; plan
  `docs/superpowers/plans/2026-11-04-windows-w2-monitors-power.md`).* Built
  and checked over Remote Desktop (one monitor at 200%) and in fake
  two-monitor layouts; the console pass with real hardware is pending.
  - **Built:** display keys from `QueryDisplayConfig` (§10.25.6); Same and
    Different per Monitor (`wp:current@<key>`, with `?display=`, §10.25.7);
    reconcile in place on display, DPI and taskbar changes, with a failed
    surface start retried by the 5 s watch (5 s, then every 30 s); per-monitor
    coverage pause (§10.25.9); every power signal, with lock and disconnect
    re-polled; Remote Desktop → ceiling Low and no extra fps cap (owner
    decision, 2026-11-04); the tray's Monitors menu (Same / Different,
    Identify Monitors), per-monitor wallpaper and Settings submenus, and the
    Performance menu (Auto, Low, Medium, High, Save Power on Battery, a
    "now:" line); `WP_FAKE_DISPLAYS`; `--dump-displays`.
  - **Verified (by script or self-test):** `make win-unit` (135+ tests,
    including the recorded layouts), `make win-test` (all pass, ~45 s) over
    RDP, the fake layouts (a resize or an unplug keeps the other page; a
    taskbar move navigates only that surface; `display=` in the URLs; a
    monitor 2 whose start was made to fail came back 5 s later, and with
    three failures in a row, retried at 5, 35 and 65 s), the
    coverage gate on RDP (covered ~450 ms after the window appears,
    uncovered ~150 ms after it closes), power reaching every page, the
    Performance picks (RDP shows Low for all of them, by its ceiling), the
    key `m-5b3fcd` stable across two RDP runs, and menus and Identify
    Monitors on RDP and in fake layouts.
  - **Not verified, and known limits:** a real second monitor; a real
    unplug; lock, sleep, display-off and battery transitions (the owner is
    usually on RDP, so none were triggered); `DisplayOff` is never re-read
    (§10.25.9); the self-test's `display=` and resize checks never use real
    monitors.
  - **Still to check by hand (owner, at the console with two monitors, then
    over RDP).** Watch `make win-log FOLLOW=1` (normal app, `make win-run`).
    1. *Keys.* `WIN_ARGS=--dump-displays make win-run`, open
       `%LOCALAPPDATA%\Wallpapers\displays.json`: two monitors, each with a
       `path`, a friendly `name` and an `m-xxxxxx` key, no key twice. Run it
       again, and again after a reboot: same keys.
    2. *Start.* Two `reconcile: added m-…` lines, a surface behind the icons
       on each monitor.
    3. *Monitors menu.* Different per Monitor: both keep what they showed;
       rows `1 …` and `2 …`, then `Monitor 1 · <name> (main)` and
       `Monitor 2 · <name>` with the real model names.
    4. *Different mode.* Monitor 2 ▸ Wallpaper ▸ Fish Tank changes only
       monitor 2; the tooltip reads `Wallpapers: <m1> · Fish Tank`. Quit and
       start: both kept. Monitor 2 ▸ Settings…: title
       `Wallpapers Settings · Monitor 2 · <name>`; a pick in the panel changes
       only monitor 2; Monitor 1 ▸ Settings… moves the same window to monitor
       1. Back to Same on All: both show `wp:current`, and the window title
       is plain again.
    5. *Identify Monitors,* with a window focused on each monitor: "1" and
       "2" (names, "(main)" on the primary) centred on the right screens for
       3 s; the same relative size on a 4K@250% and a 1080p@150% panel; the
       typing focus stays; clicks pass through.
    6. *Unplug monitor 2* (or Settings → Display → Disconnect this display;
       or toggle RDP *Use all my monitors*) with the menu on Different:
       `removed m-…`, monitor 1 doesn't reload, its submenu and row go.
       Plug it back: `added m-…` with the same key and its old wallpaper.
    7. *Scale change on one monitor* (Settings → Display): `reconcile: kept
       m-… (moved WxH@1.5 → WxH@1.25)`, no `navigating` line, the scene
       redraws sharp and keeps its state.
    8. *Resolution change; taskbar moved to the left:* `kept … (moved …)`;
       the taskbar gives `kept … (insets … → …)` and only that surface
       navigates.
    9. *Explorer restart* (Task Manager) with real hosts: W1's re-bind, no
       reload (only simulated so far).
    10. *RDP live resize:* `kept m-… (moved 2940x1686@2 → 2940x1844@2)`, no
        reload.
    11. *Coverage.* Maximize a window on monitor 2: within ~0.5 s
        `coverage: <key> covered (…%)` and `IsVisible=false` for that surface
        only; restore: `uncovered` and `IsVisible=true` within ~150 ms. Then:
        snap two windows left and right on monitor 1 (covered; un-snap one,
        uncovered); a window straddling both monitors, maximized on neither
        (neither covered); a GeForce or Discord overlay, if present (no
        `coverage:` line); a maximized window on another virtual desktop
        (no pause in Task View; switch to that desktop: covered; back:
        uncovered); Alt-Tab between a maximized and a half-snapped window
        (follows the end state, no burst of flips); the tray menu and the
        Settings window maximized over a monitor (no pause: they're ours);
        taskbar on auto-hide with a maximized window (covered).
    12. *Lock.* Win+L, then unlock: `power: session lock`, `power: locked, …`,
        `IsVisible=false` on every surface; then `power: session unlock`,
        `IsVisible=true`, animating within a second. This also confirms that
        the 2 s poll's `WTSINFOEX` lock flag (`SessionFlags`) reads right on
        Windows 10 and 11, since it now overrides the notifications.
    13. *Display off.* `powercfg /change monitor-timeout-ac 1` and wait (or
        lock and let the monitors sleep): `power: display off`,
        `IsVisible=false`; on wake `power: display on`, `IsVisible=true`.
        Over RDP the same timeout must not hide it (the state reads
        `display off, remote`, no `IsVisible=false`).
    14. *Sleep and wake:* `power: suspending` (it may not reach the log
        before the freeze), then `power: resumed`, a state without `asleep`
        or `display off`, `IsVisible=true` even if no `display on` follows.
    15. *RDP disconnect and reconnect:* `power: session disconnect`, then
        `disconnected, remote`, `IsVisible=false`; on reconnect `power:
        session connect`, `remote`, `IsVisible=true`. A console↔RDP switch
        adds or removes `remote`. After a reconnect, dump displays again: is
        the key still `m-5b3fcd`? If not, the RDP path isn't stable across
        sessions and Different mode loses its choices over RDP. Also redo
        item 3–4 with Different mode kept across a restart and a reconnect.
    16. *Battery.* Unplug the laptop: `power: …, on battery NN%`, the
        `?hud=1` line shows `on battery` (`battery low` under 20%); plug in:
        `charging NN%`. Quality drops, nothing pauses.
    17. *Energy Saver* (Quick Settings, or below its threshold): `energy
        saver`; the page shows `battery saver` and a 15 fps cap.
    18. *Fullscreen game or presentation mode, and the screen saver*
        (`scrnsave.scr /s`, or a short timeout): `fullscreen app` or `screen
        saver` within 2 s, `IsVisible=false`.
    19. *Performance menu,* on the console (not RDP): Low, Medium, High
        change the scene's quality (`?hud=1`) and the status line within
        ~1 s; the Settings panel shows the same mode; in Different mode all
        monitors follow. Toggle Save Power on Battery on battery.
    20. *`make win-test` at the console with two monitors,* with no
        maximized window on monitor 1: `PASS coverage` with "1 other
        surface(s) unchanged" and "focus kept". On battery, `performance
        high` reads "stage says Medium (expected medium, ceiling medium)" and
        still passes; `power` shows `"battery":{"charging":false,…}` and
        the reason `on battery`. At the console `power` shows
        `"remote":false` and no `remote desktop` reason.
    21. *Remote Desktop:* the `remote desktop` reason appears and the stage
        runs at Low with no extra fps cap.
  - **Changed from the design:** SetModeAsync leaves persistence to the
    tray; lock and disconnect are polled too; a console display-off doesn't
    hide a remote session; the coverage "debounce" is coalesced from the
    first event; "ours" includes our WebView2 children; the self-test's
    coverage window is a separate process, not a real maximize.
- **W3 Interactivity (required):** Raw Input, bare-desktop clicks, delivery,
  the two tray toggles, Play in a Window. Self-test 6.

  *As built (2026-11-04; plan
  `docs/superpowers/plans/2026-11-04-windows-w3-interactivity.md`).* What was
  built and how is in §10.25.8 *As built*. Checked over Remote Desktop (one
  monitor at 200%) and in the fake two-monitor layout; no real mouse was
  used. `make win-unit` 166 tests, `make win-test` all pass (~50 s), `make ci`
  green.
  - **Still to check by hand (owner, at the console with two monitors, then
    over RDP).** Watch `make win-log FLAVOR=run FOLLOW=1` (normal app,
    `make win-run`); the debug lines below need `make win-dev` and
    `make win-log FLAVOR=dev FOLLOW=1`.
    1. *Neko.* Pick Neko: the cat runs to the cursor wherever it goes, over
       app windows too, and keeps following with a window focused.
       `pointer: moves/s raw=… sent=…` is non-zero within a minute. A click
       on bare desktop tosses yarn there (`down bare → m-… (x,y)`, `up`).
    2. *Fish Tank.* Click bare desktop: food drops under the cursor (at 250%
       and at 150%). Double-click bare desktop: the glass is tapped (the fish
       startle) *and* two foods drop; the second `up` logs `dblclick`.
       Right-click: Explorer's menu opens the first time, no food.
       Middle-click: nothing.
    3. *Icons.* Click an icon (selected, no food, log `down icon (not
       forwarded)` and no `up`); double-click an icon (it opens, no food, no
       glass tap); drag an icon onto bare desktop (it moves, no food);
       rubber-band from bare desktop across icons (icons selected; one down,
       one up, no tap; the drag's moves show `buttons 1`, e.g. the Fish
       Tank's current pushes the plants).
    4. *Apps and the taskbar.* Click in a window, on the taskbar, on Start:
       nothing forwarded (no `down` line). Move the mouse over a maximized
       window on monitor 2 while monitor 1 is uncovered: monitor 1's page gets
       nothing, monitor 2's is hidden (covered) so nothing either;
       un-maximize: moves resume at once.
    5. *Two monitors.* Different mode, Neko on monitor 2 and the Fish Tank on
       monitor 1: Neko follows only on monitor 2 (it never crosses, §10.25.20
       item 8); a click on each monitor lands in that monitor's page at the
       right spot. Mixed scales: the food drops under the cursor on both.
    6. *Elevated.* Open Task Manager (Ctrl+Shift+Esc) and keep it focused,
       move over the desktop: fish still follow (`moves/s raw=0 poll=…
       sent=…`; afterwards `raw=…` again); a bare click while it is focused
       does nothing (accepted, no click invented); click the desktop once
       and clicks work again.
    7. *Focus.* After a bare click, type an arrow key: the desktop's icon
       selection moves (the key never reached us; the foreground is never
       ours in the log).
    8. *Toggles.* Untick *Wallpaper Follows the Mouse*: fish stop following,
       clicks still feed. Untick *Clicks on the Desktop Play*: no food (no
       `down bare` line). Both off: `pointer: off (both toggles off)`, and
       Task Manager shows the app at 0.x% while the mouse is busy. Both on:
       `pointer: on`. Quit and start: the ticks are kept.
    9. *Hidden.* Pause from the tray, then Resume: `pointer: off (no visible
       surface)`, then `pointer: on`. Win+L and unlock: the same. A maximized
       window over the only monitor: the same pair. (Over a drag started
       before it hides: the release is sent, nothing is stuck.)
    10. *Draw Above Icons.* With it ticked: bare clicks feed, icon clicks
        don't; untick.
    11. *Play in a Window.* `make win-run`, pick Pixel Quest, tray → *Play in
        a Window…*: opens focused and centred, titled `Wallpapers · Pixel
        Quest`, in the taskbar and Alt-Tab. Arrows move the hero, Space,
        `n`, `?` (help) work; `,` opens the panel in the window; `f` fills
        the screen (borderless, over the taskbar) and `f` again restores its
        frame and size (also from a maximized window: it should return
        maximized, not borderless). Sound is audible there while the desktop
        stays silent. Close it: the desktop is unchanged and the log has
        `play: closed`. In Different mode *Monitor 2 ▸ Play in a Window…*
        opens monitor 2's wallpaper, and asking from another row re-points
        the same window; on mixed DPI the window's size is right on the
        target monitor. Quit with the window open: it closes. Known: a pick
        inside it writes `wp:current` (Same mode changes the desktop).
    12. *RDP.* Items 1–2 over Remote Desktop (one monitor at 200%, 32 Hz):
        moves arrive (`sent=…`), clicks land where clicked; the app's CPU
        stays under 2% with the mouse busy.
    13. *Touch,* if a touchscreen is at hand: a tap on bare desktop feeds; a
        drag is a drag.
    14. *`make win-test` at the console,* with part of the desktop uncovered
        (terminal restored or moved off part of monitor 1): `PASS pointer
        classify  n of n right; uia median <40 ms` with real icons (it only
        SKIPs with no desktop icons or when every point is covered, as the
        maximized terminal does over RDP; on FAIL read the `wrong:` list), `pointer tap` with `focus kept`. At the console the
        fake fit factor is about 0.95 and the real scale may differ from
        200%.
    15. *Numbers to record here:* the app's CPU with the mouse busy (Task
        Manager) and UIA timings against real icons (`uia N ms` in the
        `pointer: click #n` lines, `pointer classify`'s median): *pending
        (by hand)*.
  - **Known limits:** with an elevated window focused there are no clicks
    (§10.25.8); a fake layout whose fit factor is 1 (a 3840-wide 100%
    monitor) can't catch a plan-scale bug in the self-test.
- **W4 Install and release:** self-installer, Start with Windows, updates,
  uninstall, Start menu, `win-release`, CI `win` job, README sections, SPEC
  updates (this section's status, the intro's host list, §10.25.4's layout).
  The first release ships here, without the saver.

  *As built (2026-11-04; plan
  `docs/superpowers/plans/2026-11-04-windows-w4-install-release.md`).* What was
  built and how is in §10.25.13 *As built* (install, update, Start with
  Windows, uninstall, About), §10.25.15 (the `win-*` targets, signing, the CI
  `win` job and its runner) and §10.25.20. `make win-unit` passes 193 tests
  (166 at W3; 27 new). `make win-test` passes over RDP, including `install`, `update`,
  `update (busy exe)` and `uninstall` against the test layout. The real
  install and uninstall ran by `make win-install` / `win-uninstall` on the
  owner's PC (Settings kept, byte-identical); the `win` job passed on
  `windows-2025` (run 3 of 3, 1m14s). (At W4 nothing was tagged; v0.11.0 was
  released after W5, 2026-11-05.)
  - **Still to check by hand (owner, at the console, then over RDP).** Agents
    can't click the tray, Settings → Apps or the taskbar, so none of this was
    done; record the results here.
    1. *Download path.* Copy `dist/wallpapers-windows-<version>.zip` to
       Downloads in Windows, unzip, run `Wallpapers.exe`: SmartScreen (or
       Smart App Control) says what the README says; the Install dialog;
       *Install*: the app runs installed, the Start menu has *Wallpapers*,
       Settings → Apps lists *Wallpapers <version>* with the icon and the size
       (about 53 MB).
    2. *Start with Windows.* Sign out and in (or restart): the wallpaper is
       back within ~10 s of the desktop; `make win-log` shows the start and,
       if Explorer was late, the layer retry. Untick it in the tray, sign out
       and in: it doesn't start; tick it back. (Ticking and unticking the row
       was never clicked; the Run value itself was proven by `win-install` and
       the self-test.)
    3. *Start menu while running.* Click *Wallpapers* in the Start menu:
       Settings opens, no second app.
    4. *About.* Tray → About: the dialog says `Installed in …` and has
       *Close*, *Uninstall…* and *Project Page* (screenshot it). *Project Page*
       opens the project's page (the releases) in the browser and About stays open.
       *Uninstall…* runs end to end (item 6's checks).
    5. *Update.* Bump `version` in `web/manifest.json` locally, `make
       win-release`, unzip elsewhere, run it: the Update dialog names both
       versions; *Update*: the app comes back with the new version in About,
       settings and the current wallpaper intact, *Start with Windows* as it
       was. Run the older unzipped exe: no dialog, Settings opens. Put the
       manifest version back.
    6. *Just Run and the tray's Install….* `make win-uninstall`, run the
       unzipped exe, *Just Run*: it runs from Downloads; start it again: no
       dialog; the tray shows *Install…*; install from there (the hand-over:
       the installed copy starts, this one quits; the log may show one
       `pipe: All pipe instances are busy` retry, harmless).
    7. *Quiet install in place.* From the installed exe run `Wallpapers.exe
       --install`: no dialog, the install is refreshed in place (no copy,
       entry and shortcut rewritten), and the running app carries on: the
       copy it starts is a second launch, so Settings opens.
    8. *Uninstall from Settings → Apps* while the app runs: the dialog, *Keep My
       Settings*: everything goes, settings stay; reinstall and uninstall with
       *Delete My Settings Too*: `%LOCALAPPDATA%\Wallpapers` is gone too.
       `%TEMP%` has no `Wallpapers-uninstall-*.exe` left.
    9. *Sign out and in* with the app installed and running: it comes back; no
       second instance; the Settings → Apps entry is still right.
    10. *Smart App Control.* Note whether the unsigned release exe runs on this
        PC (the hash is new) and keep the Code Integrity event id if it is
        refused, for the signing decision.
    11. *The first release (owner's step, after the OK).* Bump `version`
        (0.11.0), commit, `git tag v0.11.0 && git push --tags`; CI's `win` job
        passes; the release carries `wallpapers-windows-0.11.0.zip` and
        `.sha256`; download it on the console PC and repeat item 1 from the real
        release.
  - **Changed from the design:** `Wallpapers.scr` is named but not created
    until W5; the install offer runs before the single-instance check; apply
    stages and swaps with rollback; the CI `win` job tests the Linux-built zip
    instead of building again; WebView2's 0.5 scale floor shaped the fake
    monitors (§10.25.15).
- **W5 Screen saver (last, owner):** `/s /p /c`, selection and timeout,
  choices, clock, watchdog, saver ↔ app pipe; uninstall restores Windows'
  saver. Self-test 9. Ships in the next release.

  *As built (2026-11-05; plan
  `docs/superpowers/plans/2026-11-05-windows-w5-screen-saver.md`).* What was
  built and how is in §10.25.12 *As built* (files, dispatch, `/s`, `/p`, `/c`,
  the lease, the watchdog), §10.25.13 *As built* (the `.scr` in install, update
  and uninstall), §10.25.15 (`win-saver`, self-test 9) and §10.25.20.
  `make win-unit` passes 250 tests (193 at W4). `make win-test` passes over RDP
  with every `saver …` line, `saver selection` and the install lines including
  `uninstall restores the saver`; `pointer classify` and `coverage` SKIP over
  RDP as before. The real `/s`, Windows' own dialog and the real
  `Control Panel\Desktop` were never touched by an agent.
  - **Still to check by hand (owner, at the console with both monitors where it
    says so).** Agents can't use Windows' dialog, wait out a timeout or press
    real keys on a topmost window. Install first (`make win-install`). Record
    the results here.
    1. *Select from the tray.* Tray → Screen Saver → *Use Wallpapers as the
       Screen Saver…*: the confirmation names the minutes; *Use Wallpapers*: the
       row is ticked. Untick it: your old saver is back in Windows' dialog.
       Select it again.
    2. *Windows' dialog.* Settings → Personalization → Lock screen → Screen
       saver (or the tray's *Open Windows Screen Saver Settings…*): *Wallpapers*
       is the saver and the wait matches *Start After*.
    3. *Settings….* In that dialog, *Settings…* opens our options window, with the
       app running and with it quit (Tray → Quit first; the window should still
       open, after a moment, and the tray icon appears). A change there shows in
       the tray's menu.
    4. *The preview.* The little monitor in that dialog shows a live, moving page,
       and stops cleanly when the dialog closes (no `Wallpapers.exe` left in
       Task Manager except the app).
    5. *The timeout.* Leave the PC alone for *Start After* minutes (use 1): the
       saver starts on every monitor, the cursor is hidden, the desktop
       wallpaper behind it stopped (`make win-log` shows `power: screen saver`).
    6. *Input ends it.* On each monitor in turn, a key, a click, the wheel, and a
       mouse move of more than a few pixels (a nudge of the mouse does not end it)
       each end it. No stray click lands on the desktop or an icon afterwards.
    7. *Preview Now* (tray and options window) starts it at once; ends the same way.
    8. *Show.* *A Different One Each Time* with two monitors: a different
       wallpaper on each, starting on black and fading in, changing every *Change
       Every* minutes (set 1). *One Wallpaper*: the pick on both. *Same as the
       Desktop*: whatever the desktop shows (and per monitor, in Different
       monitors mode).
    9. *Show a Clock* ticked: the drifting clock over it.
    10. *On resume, display logon screen.* Tick it in Windows' dialog, start the
        saver, press a key: Windows asks for the password.
    11. *The fallback clock.* In a copy of the install (a test install or the
        unzipped download, never the real one while selected) rename `web\` and
        run `Wallpapers.exe /s`: black with the time, which moves each minute;
        any input ends it; `saver-log.txt` says why.
    12. *Update while selected.* With the saver selected, run a newer download
        (item 5 of W4): the update works, the saver is still selected and
        starts (the 8.3 short name in `SCRNSAVE.EXE` still points at the
        file). With the saver running, the update refuses with the in-use message.
    13. *Uninstall restores.* With it selected, uninstall (Settings → Apps):
        Windows' dialog shows your old saver again, with its wait.
    14. *Group policy message.* Only if you have a way to set the policy: with
        *Screen saver executable name* set by policy, the tray row is disabled
        and its tooltip says your organization's policy sets it.
    15. *Smart App Control and SmartScreen* on `Wallpapers.scr`: note whether it
        runs from Windows' dialog on this PC (a separate file, a separate hash
        from the exe's).
    16. *The release (the controller bumps and tags; the owner verifies).*
        `version` went to 0.11.0 and `v0.11.0` was tagged 2026-11-05 (done);
        download `wallpapers-windows-0.11.0.zip` from the release, check the
        `.sha256`, and repeat W4 item 1, then 1 to 5 above, from that download.
  - **Changed from the design:** `/c` brings up the app's own options window
    rather than a dialog from the `.scr` process; the saver reuses `Surface`
    (§10.25.20); `Wallpapers.scr` is a full copy of the exe.
- **W6 Two-monitor pass (owner, later):** the by-hand list in §10.25.15 at the
  console with both monitors. Everything multi-monitor is built and tested
  before this (W2) against simulated layouts, so W6 is verification and
  fixes, not new design.

#### 10.25.17 Risks

| Risk | Mitigation |
|---|---|
| A future Windows build changes the desktop layers again | Layout detection with three paths and clear logging; *Draw Above Icons* escape hatch; the saver and tray keep working regardless |
| Chromium occlusion stops rAF behind the icons | W0.2 before anything else; visual hosting as the fallback |
| WebView2 can't render inside a layered child | Visual hosting (DirectComposition) sidesteps redirection; W0.2 |
| Two monitors × a heavy wallpaper on a laptop | Per-monitor pause, battery ceiling, governor |
| Smart App Control blocks unsigned builds (found in W0.2) | Sign releases with a publicly trusted certificate (e.g. Azure Trusted Signing); dev builds: retry with a changed build, or the owner turns SAC off (irreversible without a reset). Owner decision |
| RDP shows one virtual screen, unlike the console | Treated as its own layout: rebuild on session change, `remote` ceiling; fake layouts and fixtures (§10.25.15) cover two monitors until W6 |
| SmartScreen scares a first-time user | README; local builds aren't flagged; signing later |

#### 10.25.18 Left to the builder

- Windowed vs visual hosting and the exact browser arguments (W0.2 decides).
- Exact Z-order and parent per layout (W0.1 decides).
- Menu wording and order details, thumbnail size, icon rendering.
- Log format, retry timings within the ranges given.
- ~~Whether the saver shares the user data folder or mirrors~~ (W0.3: shares).
- File and class names beyond the sketch in §4.

#### 10.25.19 Ideas for later (not in scope)

- **Match Windows to the wallpaper:** Windows 11's Mica and the
  Alt-Tab/Task View backdrops sample the *real* wallpaper picture, not our
  window. A confirmable *Use a Still as the Windows Wallpaper* (as the Mac's
  lock-screen item does) would make them match, and would cover the lock
  screen if that's wanted later.
- **`make win-bench`:** drive the desktop web views over the DevTools port
  (`WP_DEBUG=1`) like `android-bench`, for real two-monitor numbers.
- **Desktop toys:** a double-click on bare desktop as a second gesture
  (fireworks launch a big one); the cursor as a light source in Night Train.
- **winget** manifest once releases are signed.
- **Jellyfin (owner: later).** A `WebResourceRequested` proxy on our origin
  for the user's server (API and streamed media, ranges included), like
  Android's `MediaProxy`, so no Chromium security flags are needed.

#### 10.25.20 Owner decisions (2026-11-02)

1. C# / .NET with WebView2.
2. Required: behind the icons, tray with everything, per-monitor,
   interactive (mouse), per-monitor pause, battery → power save (never
   stop), ground above the taskbar.
3. No accent colour, no global hotkeys, no playlists, no lock screen,
   signing later.
4. Every addition in this design is in: screen saver, installer, recovery
   paths. **The screen saver comes last.**
5. If the wallpaper can't live behind the icons, the project stops (§10.25.16 gate).
6. Two-monitor testing later, but the implementation plans for it (§10.25.15).
7. Jellyfin on Windows later (§10.25.2, §10.25.19).
8. **Span mode later**, and no wallpaper learns about monitor edges (no
   Neko crossing screens); §10.25.6 keeps a sketch only.

**Design calls made without the owner (check these):**
- Same wallpaper on both monitors in Different mode shares its settings.
- Remote Desktop runs at Low with no extra fps cap (new `remote` signal; owner's W2 pick, §10.25.7 item 5).
- Covered = 97% of a monitor's work area; pause after 300 ms.
- Moves are forwarded even over app windows; clicks only on bare desktop,
  left button only; keys never (Play in a Window instead).
- W3 (owner, 2026-11-04): no corner buttons on windows hosts (§10.25.7 item
  7); Play in a Window is unmuted; a UI Automation failure on a desktop
  window counts the press as bare.
- Desktop web views are muted by default.
- Self-contained single-file exe (~52 MB, 52,154,922 bytes at W3) rather than requiring the .NET
  runtime; per-user install, no admin.
- `make ci` runs `win-unit` only when `dotnet` is installed.
- W4 (2026-11-04): the install offer runs **before** the single-instance
  check, so a newer download offers Update while the installed app runs.
  Apply stages and swaps with rollback; a failed update restarts the old copy
  (not on the StillRunning timeout). Stage 2 refuses any root that isn't the
  run or test install folder. `Wallpapers.scr` came in W5 (done, §10.25.13). The `win` job
  tests the Linux-built zip rather than building again; a failed Windows
  self-test drops the Windows zip from that release with a warning. The
  self-test's fake monitors fit at about 0.75 (WebView2 renders no smaller
  than ~0.5 scale). The installed size is about 53 MB. The jsign token is in
  jsign's argv while signing. The signed path hasn't run.

**Design calls made in W5 without the owner (2026-11-05; check these):**
- The saver reuses `Surface` (composition hosting), so the form gets every key,
  click and move itself; Chromium's alpha-0 input window is made click-through
  (a shared helper) so it can't take them.
- `Wallpapers.scr` is a full copy of the exe, about 52 MB more on disk and in
  each update.
- `SCRNSAVE.EXE` holds the 8.3 short path when Windows gives one (so a legacy
  reader of the value copes); the long path would also work. If the install
  folder were deleted and recreated while selected, a stored short name could
  point at a sibling folder (theoretical: updates keep the folder and uninstall
  restores first).
- The self-test runs the saver only in harness windows and selects only in a
  scratch key (`Software\Wallpapers-test\…`); it never touches the real
  `Control Panel\Desktop`, and the real `/s` is by hand.
- Different mode starts on Blank and crossfades to the pick, rather than
  loading the pick directly.
- The fallback is a native clock on black that moves each minute.
- The desktop's saver flag is a 10 s lease renewed by 4 s pings, so a saver that
  dies can't leave the desktop hidden. The lease is timed on the monotonic clock
  (`Environment.TickCount64`), so a wall clock set back can't hold it either.
- `saver-log.txt` is separate from `log.txt`.
- Harness windows never activate and ignore deactivation; a real run activates
  the first window and ends on deactivation.
- The preview renders at 0.5 scale; an open options window doesn't follow
  changes made elsewhere until one of its controls is used.

**Owner decisions taken 2026-11-04 (W4):**
- Ship unsigned first; set up Azure Trusted Signing before telling anyone else
  about the app (Smart App Control and SmartScreen both pass once signed;
  `winget` becomes possible). Until then the README says SmartScreen asks
  *Run anyway* and a Smart App Control PC may refuse the hash.
- No online update check: no network, no telemetry. About → Project Page opens
  the releases page. A weekly check would be a declared network use, W6+ if
  wanted.
- A failed Windows self-test on the hosted runner drops the Windows zip from
  that release with a warning, as the Mac's does. If the runner proves flaky,
  switching to advice is one `if` in `ci.yml`.
- The exe stays self-contained (~52 MB).
- The first release, v0.11.0, waited for the owner's explicit OK (given with
  W5; released 2026-11-05).

#### 10.25.21 Spike results

W0.1–W0.4 each record here: Windows build, session type (console or Remote
Desktop), monitors, what was tried, what worked, numbers. The spike code was
`windows/spikes/` (`make win-spike ARGS=…`; plan:
`docs/superpowers/plans/2026-11-03-windows-w0-spikes.md`), throwaway, deleted at
W1 and since replaced by `windows/Wallpapers` (it's in git history, like the
Mac's M0).

**W0.1 behind the icons: passes.** (Windows 11 25H2 build 26200, Remote
Desktop, one monitor 2940×1686 at 200%, work area 2940×1590, picture
wallpaper `.jpg`, 2026-11-03)
- **Tree before:** `Progman` (`WS_EX_TOOLWINDOW | WS_EX_NOREDIRECTIONBITMAP`)
  → `SHELLDLL_DefView` (`WS_EX_LAYERED`) → `SysListView32`; no wallpaper
  `WorkerW` yet, so the layout is *raised*. The desktop also has a dozen tiny
  hidden top-level `WorkerW`s, some owned by other processes: layout detection
  must only consider Explorer's visible ones.
- **`0x052C` (0xD, 1)** was needed (no layer at first) and built it in
  **~105 ms**: a visible `WorkerW` child of `Progman`, z just below
  `SHELLDLL_DefView`. Later runs found it already there and sent nothing.
- **Candidate (a), the winner:** `CreateWindowEx` directly with `Progman` (in
  Explorer's process) as the parent works (no `SetParent` dance).
  `WS_CHILD | WS_VISIBLE | WS_CLIPCHILDREN | WS_CLIPSIBLINGS`,
  `WS_EX_LAYERED | WS_EX_NOACTIVATE`, alpha 255, then `SetWindowPos(host,
  DefView)`. Order `SHELLDLL_DefView > host > WorkerW`; bounds equal the
  monitor in physical px at 200% (PerMonitorV2); host colour on 93% of the
  screen; all 4 icons, their labels and the selection highlight draw over it;
  a `GDI+` clock in it ticks; `WindowFromPoint` on bare desktop is still
  `SysListView32`, and right-click opens Explorer's menu (a XAML
  `Microsoft.UI.Content.PopupWindowSiteBridge`, not `#32768`). **Owner by
  eye:** icon drag and drop, rubber-band selection, double-click to open, and
  Win+D twice all normal, no lag.
- **Candidate (b)** child of that `WorkerW`: invisible unless layered (0%
  colour); layered (alpha 255), it passes the same checks. A fallback, not
  needed.
- **Candidate (c)** child of `SHELLDLL_DefView` below `SysListView32`:
  never visible, layered or not (the list view paints opaquely). Ruled out.
- **Explorer restart** (killed, Windows restarted it in ~0.8 s):
  **our host died with it** (`IsWindow` false; it was Explorer's `Progman`'s
  child). `TaskbarCreated` arrived ~2.4 s after the kill; the new `Progman` had
  no layer, so `0x052C` was sent again (114 ms); a new host was created, and
  every check passed again. Design consequence in §10.25.5.
- **Quit:** destroying the host, then re-applying the wallpaper path, leaves
  Explorer's picture with no stale frame. **Ctrl+C through WSL interop
  terminates the Windows process outright** (no `CancelKeyPress`), and
  `taskkill /f` likewise: in both cases Windows destroys the dead process's
  host and Explorer's own `WorkerW` shows through, so nothing stale is left
  even without our cleanup.
- **Gotchas:** WinForms' `NativeWindow.CreateHandle` superclasses a custom
  class name (`WindowsForms10.<name>…`), so create with `CreateWindowEx` and
  `AssignHandle`. After an Explorer restart the first desktop menu can take
  ~5 s (cold XAML). Synthetic right-clicks over RDP sometimes landed on the
  taskbar instead (a jump list opened), with no host attached as well, so the
  automated menu check is advisory; the owner's by-eye check is the real one.
  `UseWPF` (for UI Automation) cross-compiles fine in WSL; implicit usings then
  drop `System.IO`. *(W3 didn't ship it: it adds 23 MB; UI Automation is
  hand-written COM, §10.25.8.)*
- Still to check: the console session (not RDP) and two monitors (W6, or
  RDP's *Use all my monitors* earlier).

**W0.2 WebView2 animating behind the icons: passes.** (same machine and
session; WebView2 runtime 156.0.4314.58, SDK 1.0.4314.35; GPU: ANGLE on the
Intel Iris Xe, Direct3D 11, even over RDP; mains power; 2026-11-03)
- **The reference rate R:** in a normal window the session's own rAF runs at
  **32 Hz** (RDP). RDP also turns Windows' animation effects off, so the page
  sees `prefers-reduced-motion` and the existing policy caps it at 20 fps,
  which paces to **16 fps** on 32 Hz frames. To test at full rate, runs
  emulated reduced motion off (DevTools `Emulation.setEmulatedMedia`): then
  the stage runs at the full 32. Pass = median ≥ 0.9 R, no 10 s window
  below 0.5 R, `visibilityState` visible throughout.
- **The page:** the plan said `?w=aquarium`, which isn't an id (the Fish Tank
  is `fishtank`), so the first soaks ran Harvest Valley (what Seasonal shows
  in November, the real default and the heavier scene); the Fish Tank was
  run afterwards too.

  | Run (raised layout, 2940×1686, High, full motion) | Length | fps median / min | WebView2 CPU (of one core) |
  |---|---|---|---|
  | (a) windowed + occlusion flags, Harvest | 10 min, 58 samples | 32.0 / 31.1 | 65% |
  | windowed, no flags (60 s of it covered by a maximized window) | 3 min | 32.0 / 31.7 | 64–76% |
  | windowed, unlayered host | 2.5 min | 32.0 / 31.8 | 56% |
  | **(b) visual + flags, Harvest** | **10 min, 58 samples** | **32.0 / 31.7** | **5.6%** |
  | visual, unlayered host (with or without `WS_EX_NOREDIRECTIONBITMAP`) | 2.5 min each | 32.0 / 31.8 | 3.6–4.0% |
  | visual, no flags, exposed → covered | 4 min | 32.0 / 31.7 | 3.9% → 54.8% |
  | visual + flags, exposed → covered (control) | 4 min | 32.0 / 31.7 | 5.7% → 55.9% |
  | visual, Fish Tank, exposed / covered | 5 min | 32.0 / 30.6 | ~98% / ~121% |
  | visual, Fish Tank, **defaults** (Auto, system motion) | 3 min | 15.9 / 15.8 | 28% |

  Our app itself: 0.3–0.7% of a core in every run. WebView2 private memory
  ~0.9 GB across its 6 processes at this size (Harvest). The Fish Tank costs
  ~15× Harvest at a forced High (a question for the web bench, not hosting).
- **Occlusion is a non-issue:** no run lost a frame to Chromium's occlusion
  tracking, with or without flags, under the icons or under a maximized
  window (it reports `visible` throughout). Nothing pauses us for free, so
  coverage → `IsVisible = false` is ours to do, and **it works**: frames
  stop at once (`hidden`), resume within a second.
- **Visual hosting renders on screen** (DirectComposition target on the
  layered host child of `Progman`, topmost visual): screenshots show the
  scene behind the icons, 5–11% of pixels changing per second, no host colour
  showing. The host style barely matters to it.
- **The input catch, and its fix:** see §10.25.8. Chromium's full-screen
  alpha-0 input window swallowed the first desktop right-click (4 of 4
  tries; windowed and no-web-view runs never did); with `WS_EX_TRANSPARENT`
  added, the menu opens first time. **Owner by eye, visual + fix, Fish
  Tank:** first right-click opens the menu, icon drag and double-click,
  rubber band, smooth with no lag.
- **Explorer restart with a live page:** controller parented to the host →
  disposed with it, recreated in ~0.3 s, page reloaded, animating again ~3 s
  after the kill. Controller parented to our own hidden window → **no
  reload**: the visual re-bound to the new host in 7 ms, frames unbroken.
  Chromium's input window survives that (the fix stays applied).
- **Decision:** visual hosting, controller parented to a hidden top-level
  window of ours, DirectComposition target on each host, `WS_EX_TRANSPARENT`
  on Chromium's input window, no browser flags required.
- **Smart App Control** (§10.25.13) blocked 2 of the ~20 spike builds; each
  was rebuilt with a trivial change and ran.
- **Tooling gotchas:** GUI windows started from WSL can come up minimized
  (force the window state after `Shown`); `make win-spike` skipped replacing
  the exe while one ran, so a second command uses the running build.

**W0.3 two processes, one user data folder: works; no mirror.** (same
machine, RDP, 2026-11-03; the "saver" ran as `Spike.scr`, the same bytes as
`Spike.exe` renamed, as the real saver will be)
- **App first, saver second:** one shared browser process (same
  `BrowserProcessId` in both); the saver read the value written 1.2 s before
  it started, then got **29 of the ~30** writes made while it ran as
  `storage` events, **median 1 ms**, max 3 ms.
- **Saver first, app second:** the app joined the saver's browser process;
  **22 of 22**, median 1 ms.
- **Saver alone afterwards:** reads the last value (18 s old). Settings
  persist with nothing else running.
- **Mismatched browser arguments:** the second process can't create its
  environment (`COMException 0x8007139F`, "not in the correct state"), so
  it fails loudly rather than silently getting a separate profile.
- **App killed mid-run** (`taskkill /f`): the saver's page stayed alive for
  the rest of its run, on the same browser process.
- Decision in §10.25.12.

**W0.4 Raw Input and the bare-desktop hit test: works, with two design
changes.** (same machine, RDP, 2026-11-03; visual hosting, controller on our
own window, the Fish Tank, whose clicks drop food)
- **Raw Input with `RIDEV_INPUTSINK`** on a hidden window: moves arrive while
  the terminal or File Explorer is focused, over apps and the taskbar.
- **Classifier self-test** (every icon centre plus a grid of bare points, no
  clicks): 24 of 24 with no web view and with own-parent visual hosting; **0
  of 24** with a host-parented controller (Chromium's overlay in the way,
  §10.25.8).
- **The owner's script, real clicks:** 26 presses, every one classified
  correctly. 14 bare presses delivered (food dropped there); icons (6),
  app windows (4) and the taskbar (2) not; an icon drag (press on an icon,
  release on bare desktop) not; a rubber band delivered as one gesture. In
  the page: 14 downs and 14 ups, as sent; 1891 moves sent arrived as 1235
  `pointermove`s (Chromium coalesces to its frame rate), all trusted.
- **Delivered `SendMouseInput` presses took the foreground** (our hidden
  window), in the owner's run and reproduced by a synthetic click; handing
  it back works; **script-dispatched clicks never moved it** (exact CSS point,
  physical ÷ 2). Decision in §10.25.8. Owner, final run: food on bare clicks
  only, and an arrow key after a click still reached the desktop.
- **UI Automation latency** over 54 real lookups: median 12.5 ms, p95 72 ms
  overall; on the desktop alone median 10 ms, p95 37 ms; the slow ones were
  app windows (hence: only ask UIA when the window is the desktop).
- **Elevated foreground** (Task Manager, opened inside the session; in RDP,
  Ctrl+Shift+Esc opens the *local* one): zero raw moves for 15 s while the
  cursor crossed the screen; `GetCursorPos` still moved (hence the poll
  fallback, §10.25.8).
- The Fish Tank's own cursor reaction is subtle (fish drift to a cursor that
  sits still; fast moves startle), so the in-page counter, not the eye, is
  the proof that moves arrive. Neko is the obvious visual check for W3.
- Spike builds: Smart App Control blocked none of today's later builds
  (2 of ~25 overall).


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

